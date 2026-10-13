/**
 * Autopilot: while it is on, makes this turn's city, town and research decisions when the
 * local player's turn starts (data/xpl-autopilot-steps.js), the choices that hold the turn
 * (policies, celebrations, stories...: data/xpl-autopilot-choices.js), recalculates the
 * building plan when it is due, and can skip idle units and end the turn. Units move only
 * with their own opt-in options (scouts, settlers, defence, merchants:
 * data/xpl-autopilot-units.js). Off at every game load (it is a "I have to step away"
 * switch); its options are settings.
 *
 * Also the experimental single-player "AI plays N turns": the game's own Autoplay (used
 * by its benchmark and hotseat), which hands the whole civ, units included, to the AI and
 * returns control afterwards. It stops before an age change, at a victory or defeat (see
 * below why). Never offered in multiplayer.
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { adviceFor, clearAdvice } from '../services/xpl-advice.js';
import { allTarget, hasPlanTacks, listTargets, placePlanTacks, startBuildingPlan } from '../data/xpl-building-job.js';
import { startSiteSearch } from '../data/xpl-site-job.js';
import { placeTacks } from '../integrations/xpl-dmt-bridge.js';
import * as steps from '../data/xpl-autopilot-steps.js';
import { befriendIndependents, considerTownProjects, makeChoices, nextEvent, proposeOpenBorders, tendDiplomacy, turnBlocker, unbefriendable } from '../data/xpl-autopilot-choices.js';
import { commandUnits, leadersNearExplorers, releaseStuckOrders, settlerGoals, threatenedSettlements, upgradeUnits } from '../data/xpl-autopilot-units.js';
import { chooseFocus, closeTriumphs, FOCUS_CLASSES, profileForFocus, scoreFocus, TRIUMPH_CATEGORY, wondersAtOnce } from '../core/xpl-victory-focus.js';
import { disabledVictories, leaderLeaning, legacyStandings, triumphs } from '../data/xpl-victory.js';

const START_DELAY_MS = 1500; // let the game finish its turn-start work first
const STEP_PAUSE_MS = 250;   // between steps, so the game processes each request
const LOG_MAX = 80;
const PLAN_BUDGET_MS = 8;
const FOUND_WAIT_MS = 3000;  // a founded settlement appears when the game handles the order
const RETRY_WAIT_MS = 600;   // before an end-of-turn retry: moves sent in the pass are done
const MAX_RETRIES = 2;       // end-of-turn retries before the turn is left waiting
const SITES_EVERY = 5;       // turns between automatic searches for settlement sites
const SETTLE_TACKS = 3;      // settle tacks: where settlers walk, then the next best sites
const SETTLE_TACK_TYPE = "BUILDING_CITY_HALL"; // as the Settlements tab places them
const PLAN_TACKS_PER_SETTLEMENT = 3; // the "map tacks" option: each settlement's next buildings
const TRACK_TRIUMPHS = 3;    // close triumphs of the focus's kind ticked «Отслеживать»
let focusDiagnosedTurn = -1; // the turn "no path" was last written to UI.log
const SHOW_TRIUMPHS = 6;     // close triumphs listed in the tab
// Advice reasons (hud/xpl-recalc-watch.js) after which the plan is recalculated at once.
const REPLAN_REASONS = ["BUILT", "TILES", "CITY", "UNLOCKED", "UNIQUES", "TACKS"];

let running = false;
let timer = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const local = () => GameContext.localPlayerID;

function ap() {
    return state.get().autopilot ?? { enabled: false, running: false, log: [] };
}

function setAp(patch) {
    state.set({ autopilot: { ...ap(), ...patch } });
}

function record(entries) {
    const list = (entries ?? []).filter(Boolean);
    if (list.length === 0) return;
    const turn = Game.turn;
    setAp({ log: [...list.map((e) => ({ turn, ...e })), ...(ap().log ?? [])].slice(0, LOG_MAX) });
    for (const e of list) log.info(`autopilot: ${e.key} ${JSON.stringify(e.args)}`);
}

export function isAutopilotOn() {
    return !!ap().enabled;
}

export function isAutopilotRunning() {
    return running;
}

/** Switches the autopilot on (it acts at once) or off. */
export function setAutopilot(on) {
    if (on === isAutopilotOn()) return;
    setAp({ enabled: !!on });
    record([{ key: on ? "ON" : "OFF", args: [] }]);
    if (on) schedule(200);
}

function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => {
        runTurn().catch((error) => log.error("autopilot failed", error));
    }, ms);
}

/** Recalculates "all my settlements" when the plan is missing, old, or events made it stale. */
async function replanIfDue(s) {
    const every = Number(s.autopilot?.replanEvery) || 0;
    if (every <= 0) return [];
    const plans = state.get().results.plans;
    const targets = listTargets();
    if (targets.length === 0) return [];
    const target = targets.length > 1 ? allTarget(targets) : targets[0];
    const due = !plans || plans.targetKey !== target.key || Game.turn - (plans.computedTurn ?? -Infinity) >= every
        || adviceFor("plans").some((r) => REPLAN_REASONS.includes(r));
    if (!due) return [];
    clearAdvice("plans");
    const outcome = await startBuildingPlan(target, s, { budgetMs: PLAN_BUDGET_MS }).promise;
    if (outcome?.cancelled) return [];
    const p = state.get().results.plans;
    if (!p) return [];
    const out = [{ key: "REPLANNED", args: [p.placements.length, p.incremental ? p.incremental.changed : p.members.length] }];
    // Tacks for the plan: with the "map tacks" option each settlement's next buildings only;
    // without it, the player's own full-plan tacks are kept in line.
    if (s.autopilot?.tacks !== false || hasPlanTacks(p)) {
        const r = await placePlanTacks(p, { perSettlement: s.autopilot?.tacks !== false ? PLAN_TACKS_PER_SETTLEMENT : 0 });
        out.push({ key: "TACKS", args: [r.placed.length - r.kept, r.removed] });
    }
    return out;
}

/**
 * The site search (Settlements tab) runs by itself when settlers need sites: we have or
 * train one and the sites are missing or SITES_EVERY turns old.
 */
async function refreshSitesIfDue(s) {
    if (steps.settlersInFlight() === 0) return [];
    const sites = state.get().results.sites;
    if (sites?.picks?.length && Game.turn - (sites.computedTurn ?? -Infinity) < SITES_EVERY) return [];
    await startSiteSearch(s).promise;
    const picks = state.get().results.sites?.picks ?? [];
    return [{ key: "SITES_FOUND", args: [picks.length] }];
}

/**
 * Settle tacks (city hall, as the Settlements tab places them, with the role) where settlers
 * walk and on the next best free sites: the plan for "all settlements" then plans their
 * buildings too. Only the autopilot's own settle tacks (`auto`) are replaced.
 */
async function placeSettleTacks() {
    const goals = settlerGoals();
    const taken = new Set(goals.map((g) => `${g.x},${g.y}`));
    const entries = goals.map((g) => ({ x: g.x, y: g.y, type: SETTLE_TACK_TYPE, role: g.role ?? "CITY", auto: true }));
    for (const p of state.get().results.sites?.picks ?? []) {
        if (entries.length >= SETTLE_TACKS) break;
        if (taken.has(`${p.x},${p.y}`)) continue;
        entries.push({ x: p.x, y: p.y, type: SETTLE_TACK_TYPE, role: p.role ?? "CITY", auto: true });
    }
    if (entries.length === 0) return [];
    const r = await placeTacks(entries, "settle", { replacePrevious: true, replaceFilter: (e) => e.auto === true });
    const added = r.placed.length - r.kept;
    return added > 0 || r.removed > 0 ? [{ key: "SETTLE_TACKS", args: [added, r.removed] }] : [];
}

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

/**
 * Victory focus («Фокус на победу»): the legacy path to steer toward this pass
 * (core/xpl-victory-focus.js, from data/xpl-victory.js), kept in state.autopilot.focus with
 * each path's standing, the close triumphs (for the tab) and those to track
 * (hud/xpl-triumph-tracker.js). @returns log entries (when the focus changes)
 */
function updateFocus(target = "AUTO") {
    const all = triumphs();
    const standings = legacyStandings();
    let disabled = disabledVictories();
    // Every path ruled out cannot be right (the user won a culture victory with "nothing" on): ignore it.
    if (FOCUS_CLASSES.every((c) => disabled.has(c))) disabled = new Set();
    const scores = scoreFocus(standings, leaderLeaning(), all, { disabled });
    const pick = chooseFocus(scores, ap().focus ?? {}, { target });
    const close = closeTriumphs(all);
    const kind = TRIUMPH_CATEGORY[pick.cls];
    setAp({
        focus: {
            cls: pick.cls, candidate: pick.candidate, streak: pick.streak,
            scores: scores.map(({ cls, ours, rival, goal, done }) => ({ cls, ours, rival, goal, done })),
            close: close.slice(0, SHOW_TRIUMPHS).map(({ name, current, total, category }) => ({ name, current, total, category })),
            track: close.filter((t) => t.category === kind).slice(0, TRACK_TRIUMPHS).map((t) => t.type),
        },
    });
    // No path (seen in game: no focus at all after an age change): say why, once a turn.
    if (!pick.cls && focusDiagnosedTurn !== Game.turn) {
        focusDiagnosedTurn = Game.turn;
        log.warn(`victory focus: no path this turn (target ${target}); paths ${JSON.stringify(standings.map((s) => [s.path, s.cls, s.ours, s.goal]))}; disabled ${JSON.stringify([...disabled])}; scored ${scores.length}`);
    }
    if (!pick.changed || !pick.cls) return [];
    const s = scores.find((x) => x.cls === pick.cls);
    return [{ key: "VICTORY_FOCUS", args: [compose(`LOC_XPL_FOCUS_${pick.cls}`), s?.ours ?? 0, s?.goal ?? 0] }];
}

/**
 * Runs one step of the pass. A step that fails (the game's API differs from what we expect,
 * e.g. GameInfo tables have no .some) is logged and the pass goes on with the next step; the
 * end-of-turn check still stops the turn if the failed step left something undone.
 */
async function guarded(name, fn) {
    try {
        await fn();
    } catch (error) {
        log.error(`autopilot step ${name} failed`, error);
        record([{ key: "ERROR", args: [`${name}: ${String(error?.message ?? error)}`] }]);
    }
}

/**
 * One pass over this turn's decisions. Runs on the local player's turn start while the
 * autopilot is on; force = once now (the "Do it now" button).
 */
export async function runTurn(force = false) {
    if (running || (!force && !isAutopilotOn())) return;
    running = true;
    setAp({ running: true });
    try {
        let s = settings.get();
        const o = s.autopilot ?? {};
        // Victory focus: this pass follows its path's priority profile (research and production
        // advice, buildings, policies, growth, purchases); culture also builds one more wonder at a time.
        let focus = null;
        if (o.focus) {
            await guarded("focus", () => {
                record(updateFocus(o.victory ?? "AUTO"));
                focus = ap().focus?.cls ?? null;
            });
        } else if (ap().focus) setAp({ focus: null });
        if (focus) {
            // Economy keeps science up while its path's techs are missing (core profileForFocus).
            let techsLeft = 0;
            try {
                if (focus === "ECONOMIC") techsLeft = steps.pathTechsLeft(focus);
            } catch (error) {
                log.debug("autopilot: path techs unknown", error);
            }
            const profile = profileForFocus(focus, { techsLeft });
            if (profile) {
                s = { ...s, profile };
                if (ap().focus) setAp({ focus: { ...ap().focus, profile } });
            }
        }
        const maxWonders = wondersAtOnce(o.maxWonders ?? 1, focus);
        // Units first: a settler that founds now gives a new city (on turn 1 the capital,
        // before which nothing can be researched or built) handled by the steps below.
        const ordered = new Set();
        const orderedAt = new Map();
        const released = new Set(); // their order did not take: skipped, not ordered again this turn
        let threats = [];
        const orderUnits = async () => {
            if (!(o.explore || o.settlers || o.defend || o.merchants || o.roam || o.focus)) return;
            const r = commandUnits(s, {
                explore: !!o.explore, settlers: !!o.settlers, defend: !!o.defend, merchants: !!o.merchants, roam: !!o.roam,
                approach: unbefriendable(), leave: released, threats: o.defend || o.roam ? threats : [],
                victory: !!focus, distant: focus === "ECONOMIC",
            });
            record(r.entries);
            for (const k of r.ordered) ordered.add(k);
            for (const [k, at] of r.orderedAt ?? []) orderedAt.set(k, at);
            if (r.entries.some((e) => e.key === "SETTLE_FOUND")) await nextEvent("CityInitialized", FOUND_WAIT_MS);
            if (r.ordered.size > 0) await wait(STEP_PAUSE_MS);
        };
        const research = async () => {
            record([steps.chooseResearch("tech", s, focus), steps.chooseResearch("culture", s, focus)]);
            await wait(STEP_PAUSE_MS);
        };
        // Hostile units around our settlements: befriend (or speed up befriending) their
        // independent, train defenders, send a unit toward one we cannot befriend yet.
        await guarded("threats", () => {
            threats = threatenedSettlements();
            record(threats.map((t) => ({ key: "THREAT", args: [t.settlement.name, t.count] })));
        });
        if (o.befriend !== false) await guarded("befriend", () => record(befriendIndependents(threats)));
        // Other leaders: counter-spy, reconciliation, endeavors (after befriending: Influence goes there first).
        if (o.diplomacy) await guarded("diplomacy", () => record(tendDiplomacy(s, { threatened: threats.length > 0 })));
        if (o.settlers) await guarded("sites", async () => record(await refreshSitesIfDue(s)));
        await guarded("units", orderUnits);
        if (o.befriend !== false && (o.explore || o.roam)) await guarded("borders", () => record(proposeOpenBorders(leadersNearExplorers({ explore: !!o.explore, roam: !!o.roam }))));
        if (o.settlers && o.tacks !== false) await guarded("tacks", async () => record(await placeSettleTacks()));
        if (o.research !== false) await guarded("research", research);
        if (o.choices !== false) await guarded("choices", async () => record(await makeChoices(s)));
        // Damaged buildings first: bought with gold when it covers them, else at the front of the queue.
        if (o.purchases !== false || o.production !== false) {
            await guarded("repairs", () => record(steps.repairBuildings({ buy: o.purchases !== false, queue: o.production !== false })));
            // Walls where raiders threaten a settlement.
            if (threats.length > 0) await guarded("walls", () => record(steps.fortifyThreatened(threats, { buy: o.purchases !== false, queue: o.production !== false })));
        }
        const unitOptions = { explore: !!o.explore, settlers: !!o.settlers, merchants: !!o.merchants, threats: o.defend || o.roam ? threats : [], profile: s.profile, victory: focus };
        const produce = async () => {
            record(await replanIfDue(s));
            // The victory focus's own work first (science projects and a Launch Pad; the path's buildings of this age).
            if (focus) record(steps.pushVictoryWork(focus));
            const wonders = o.wonders !== false ? steps.chooseWonders(s, maxWonders) : new Map();
            record(steps.fillProduction(wonders, unitOptions));
            record(steps.frontLoadUnits(unitOptions));
            await wait(STEP_PAUSE_MS);
        };
        if (o.production !== false) await guarded("production", produce);
        const growth = async () => {
            for (let i = 0; i < steps.MAX_GROWTH_PER_CITY; i++) {
                const placed = steps.placeGrowth(s, { victory: focus });
                record(placed);
                if (placed.length === 0) break;
                await wait(STEP_PAUSE_MS);
            }
        };
        if (o.growth !== false) await guarded("growth", growth);
        if (o.towns !== false) {
            await guarded("towns", () => record(steps.setTownFocus(s)));
            await guarded("towns", () => record(considerTownProjects()));
            await guarded("towns", () => record(steps.convertTowns(s, Number(o.reserveTurns ?? 2))));
        }
        if (o.resources !== false) await guarded("resources", () => record(steps.assignResources(s)));
        if (o.purchases !== false) {
            await guarded("purchases", async () => {
                // Towns buy the victory path's buildings first (Rail Station, Port, Factory); the
                // plan's purchases then skip those and count their gold.
                const purchases = { bought: new Set(), spent: 0 };
                if (focus) record(steps.buyVictoryWork(focus, Number(o.reserveTurns ?? 2), purchases));
                record(steps.buyBuildings(s, Number(o.reserveTurns ?? 2), purchases));
                await wait(STEP_PAUSE_MS);
            });
            // Then unit upgrades with the gold above the same reserve.
            await guarded("upgrades", () => {
                record(upgradeUnits(steps.goldReserve(Number(o.reserveTurns ?? 2)), threats));
            });
        }
        const skip = () => record(steps.skipIdleUnits(ordered));
        if (o.skipUnits) await guarded("skip", skip);
        if (o.endTurn && isAutopilotOn() && !force) {
            await wait(STEP_PAUSE_MS);
            // Like the game's end turn button: not while a choice still holds the turn. Something
            // may have appeared during the pass (a city founded late, a new choice): one more try.
            for (let attempt = 0; attempt < MAX_RETRIES && turnBlocker(); attempt++) {
                await wait(RETRY_WAIT_MS);
                // Orders the game did not carry out: those units may be skipped now.
                await guarded("units", () => {
                    const stuck = releaseStuckOrders(orderedAt);
                    for (const k of stuck) {
                        ordered.delete(k);
                        orderedAt.delete(k);
                        released.add(k);
                    }
                    if (stuck.length > 0) record([{ key: "ORDERS_NOT_TAKEN", args: [stuck.length] }]);
                });
                await guarded("units", orderUnits);
                if (o.skipUnits) await guarded("skip", skip);
                if (o.research !== false) await guarded("research", research);
                if (o.choices !== false) await guarded("choices", async () => record(await makeChoices(s, { retry: true })));
                if (o.production !== false) await guarded("production", produce);
                // A citizen that arrived later in the pass (a story reward, a purchase...).
                if (o.growth !== false) await guarded("growth", growth);
                await wait(STEP_PAUSE_MS);
            }
            const blocker = turnBlocker();
            // Choices of the age change are the player's: the next civilization when the age is
            // over (the new age loads as a new game, where the autopilot is off anyway) and the
            // dedications («устремления», bought with legacy points) when the new age starts.
            const AGE_CHOICES = { NOTIFICATION_CHOOSE_CIVILIZATION: "AGE_OVER", NOTIFICATION_AGE_TRANSITION: "AGE_START" };
            if (AGE_CHOICES[blocker]) {
                record([{ key: AGE_CHOICES[blocker], args: [] }]);
                setAutopilot(false);
            } else if (blocker) {
                record([{ key: "BLOCKED", args: [blocker] }]);
                if (blocker === "NOTIFICATION_NEW_POPULATION") log.info(`autopilot: settlements saying a citizen waits: ${steps.readyToGrow().join(", ") || "none"}`);
            }
            else record(steps.endTurn());
        }
        setAp({ lastTurn: Game.turn });
    } catch (error) {
        log.error("autopilot pass failed", error);
        record([{ key: "ERROR", args: [String(error?.message ?? error)] }]);
    } finally {
        running = false;
        setAp({ running: false });
    }
}

engine.on("PlayerTurnActivated", (data) => {
    if (data?.player === local() && isAutopilotOn()) schedule(START_DELAY_MS);
});

// ---- "AI plays N turns" (single player only) ---------------------------------------------
//
// The game's Autoplay is made for its benchmarks: an age change while it runs rebuilds the
// next age with the player's slot saved as AI (the game then plays the civ by itself for
// good, and the AI picks the next civilization), and it keeps going after someone wins.
// So the run stops one turn before the age ends, when the age ends, at any victory and at
// the player's defeat. If the slot is already AI (an older run), "Take back control" asks
// Autoplay to return the civ to the player after one turn.

const AGE_END_MARGIN = 1; // stop when this many turns of the age countdown are left

export function aiPlayAvailable() {
    try {
        return typeof Autoplay !== "undefined" && !Configuration.getGame().isAnyMultiplayer;
    } catch (_e) {
        return false;
    }
}

export function isAiPlaying() {
    try {
        return typeof Autoplay !== "undefined" && !!Autoplay.isActive;
    } catch (_e) {
        return false;
    }
}

/** The human player to hand control back to (the local player, or the last one we saw). */
function humanPlayerId() {
    const id = local();
    if (id !== undefined && id !== null && id >= 0) return id;
    const remembered = Number(settings.get().autopilot?.lastHumanPlayer);
    return Number.isFinite(remembered) && remembered >= 0 ? remembered : 0;
}

/**
 * True when the game plays the player's civ by itself without Autoplay: the slot was
 * switched to AI (an age change during an older AI run).
 */
export function isControlLost() {
    if (isAiPlaying()) return false;
    try {
        const id = local();
        if (id === undefined || id === null || id < 0) return true;
        const p = Players.get(id);
        return !!p && p.isHuman === false;
    } catch (_e) {
        return false;
    }
}

/** Hands the civ to the game's AI for `turns` turns, then back to the player. */
export function startAiTurns(turns) {
    if (!aiPlayAvailable() || isAiPlaying()) return false;
    if (ageEndsSoon()) {
        record([{ key: "AI_REFUSED_AGE_END", args: [] }]);
        return false;
    }
    try {
        const id = humanPlayerId();
        settings.patch({ autopilot: { lastHumanPlayer: id } });
        Autoplay.setTurns(turns);
        Autoplay.setReturnAsPlayer(id);
        Autoplay.setObserveAsPlayer(id);
        Autoplay.setActive(true);
        record([{ key: "AI_STARTED", args: [turns] }]);
        return true;
    } catch (error) {
        log.error("autoplay failed to start", error);
        return false;
    }
}

/** Stops the AI run (reason: a LOC_XPL_AP_AI_STOP_<reason> key for the log). */
export function stopAiTurns(reason = "PLAYER") {
    try {
        if (!isAiPlaying()) return false;
        Autoplay.setActive(false);
        record([{ key: "AI_STOPPED", args: [Locale.compose(`LOC_XPL_AP_AI_STOP_${reason}`)] }]);
        return true;
    } catch (error) {
        log.error("autoplay failed to stop", error);
        return false;
    }
}

/** The slot is AI already: ask Autoplay to play one turn and return the civ to the player. */
export function takeBackControl() {
    if (typeof Autoplay === "undefined") return false;
    try {
        const id = humanPlayerId();
        Autoplay.setTurns(1);
        Autoplay.setReturnAsPlayer(id);
        Autoplay.setObserveAsPlayer(id);
        Autoplay.setActive(true);
        record([{ key: "AI_RETURNING", args: [] }]);
        return true;
    } catch (error) {
        log.error("take back control failed", error);
        return false;
    }
}

/** The age countdown is on its last turn(s): the next turn may end the age. */
export function ageEndsSoon() {
    try {
        const apm = Game.AgeProgressManager;
        if (!apm.ageCountdownStarted) return false;
        return apm.getMaxAgeProgressionPoints() - apm.getCurrentAgeProgressionPoints() <= AGE_END_MARGIN;
    } catch (_e) {
        return false;
    }
}

function guardAgeEnd() {
    if (isAiPlaying() && ageEndsSoon()) stopAiTurns("AGE_END");
}

engine.on("TurnBegin", guardAgeEnd);
engine.on("AgeProgressionChanged", guardAgeEnd);
engine.on("GameAgeEnded", () => stopAiTurns("AGE_END"));
engine.on("TeamVictory", () => stopAiTurns("VICTORY"));
engine.on("PlayerDefeat", (data) => {
    if (data?.player === humanPlayerId()) stopAiTurns("DEFEAT");
});
engine.on("AutoplayEnded", () => record([{ key: "AI_ENDED", args: [] }]));

// Remember who the human player is (an AI run may leave the local player id at -1).
engine.on("PlayerTurnActivated", (data) => {
    try {
        if (data?.player === local() && local() >= 0 && Players.get(local())?.isHuman && Number(settings.get().autopilot?.lastHumanPlayer) !== local()) {
            settings.patch({ autopilot: { lastHumanPlayer: local() } });
        }
    } catch (_e) {
        // ignore
    }
});
