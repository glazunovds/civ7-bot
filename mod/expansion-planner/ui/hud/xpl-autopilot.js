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
import { gameKey, settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { adviceFor, clearAdvice } from '../services/xpl-advice.js';
import { allTarget, hasPlanTacks, listTargets, placePlanTacks, startBuildingPlan } from '../data/xpl-building-job.js';
import { startSiteSearch } from '../data/xpl-site-job.js';
import { RELAXED_MIN_PICKS } from '../core/xpl-tuning.js';
import { placeTacks } from '../integrations/xpl-dmt-bridge.js';
import * as steps from '../data/xpl-autopilot-steps.js';
import { goldBalance } from '../data/xpl-city-actions.js';
import { probeDistricts } from '../data/xpl-growth-job.js';
import { createBudget } from '../core/xpl-savings.js';
import { befriendIndependents, considerTownProjects, diplomacyScreenOpen, makeChoices, nextEvent, proposeOpenBorders, tendDiplomacy, turnBlocker, unbefriendable } from '../data/xpl-autopilot-choices.js';
import { commandUnits, disbandSurplus, disperseArrivals, foundArrivals, leadersNearExplorers, probeMilitary, releaseStuckOrders, settlerGoals, settlersStarved, strikeRaiders, threatenedSettlements, upgradeUnits } from '../data/xpl-autopilot-units.js';
import { chooseFocus, closeTriumphs, FOCUS_CLASSES, militaryOutlook, profileForFocus, scoreFocus, scorePlaces, TRIUMPH_CATEGORY, victoryWatch, wondersAtOnce } from '../core/xpl-victory-focus.js';
import { INNOVATION_TARGETS } from '../core/xpl-victory-levers.js';
import { disabledVictories, leaderLeaning, legacyStandings, saveFocus, savedFocus, scoreBoard, scoreVictoryOn, triumphs, victoryRaces } from '../data/xpl-victory.js';
import { applyStrategy, planStrategy, strategyLines } from '../core/xpl-strategy.js';

const START_DELAY_MS = 1500; // let the game finish its turn-start work first
const STEP_PAUSE_MS = 250;   // between steps, so the game processes each request
const LOG_MAX = 80;
const PLAN_BUDGET_MS = 8;
const FOUND_WAIT_MS = 3000;  // a founded settlement appears when the game handles the order
const RETRY_WAIT_MS = 600;   // before an end-of-turn retry: moves sent in the pass are done
const MAX_RETRIES = 2;       // end-of-turn retries before the turn is left waiting
// End-of-turn requests in one turn before the autopilot stops asking (research/23 D1: game 8, the game
// refused 15 in 30 s while a deal screen was open, and re-activated the turn after each).
const MAX_END_TURNS = 4;
let endTurns = { turn: -1, n: 0, noted: false };
const SITES_EVERY = 5;       // turns between automatic searches for settlement sites
const SETTLE_TACKS = 3;      // settle tacks: where settlers walk, then the next best sites
const SETTLE_TACK_TYPE = "BUILDING_CITY_HALL"; // as the Settlements tab places them
const PLAN_TACKS_PER_SETTLEMENT = 3; // the "map tacks" option: each settlement's next buildings
const TRACK_TRIUMPHS = 3;    // close triumphs of the focus's kind ticked «Отслеживать»
let focusDiagnosedTurn = -1; // the turn "no path" was last written to UI.log
let racesLoggedTurn = -1;    // the turn the victory races were last written to UI.log
let strategyLoggedTurn = -1; // the turn the strategy was last written to UI.log
const SHOW_TRIUMPHS = 6;     // close triumphs listed in the tab
// Advice reasons (hud/xpl-recalc-watch.js) after which the plan is recalculated at once.
const REPLAN_REASONS = ["BUILT", "TILES", "CITY", "UNLOCKED", "UNIQUES", "TACKS"];

let running = false;
let timer = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ageType = () => {
    try {
        return GameInfo.Ages.lookup(Game.age)?.AgeType ?? null;
    } catch (_e) {
        return null;
    }
};
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

/**
 * Switches the autopilot on (it acts at once) or off. Switched off by the player (not by an age's end: `keepResume`), it does
 * not switch itself on again in the next age (resumeAfterAgeChange).
 */
export function setAutopilot(on, { keepResume = false } = {}) {
    if (on === isAutopilotOn()) return;
    setAp({ enabled: !!on });
    record([{ key: on ? "ON" : "OFF", args: [] }]);
    if (on) schedule(200);
    else if (!keepResume) {
        resumeOnChoice = null;
        safe(() => settings.remember(gameKey(), { [RESUME_KEY]: null }));
    }
}

// ---- switching itself on again after an age change (research/39: the player wants the age's first turn automated) --------
// The autopilot is off at every load, and an age change loads the next age as a new game. When it was on at the last age's
// end (the settings' game memory: root gotcha 57), it switches itself on in the next age's first RESUME_TURNS turns once
// the dedications are chosen (the age's choices stay the player's), so the first turn's cheap conversions happen
// (steps.convertAtAgeStart). Only into a later age (an earlier save loads nothing), only with the option on.
const RESUME_KEY = "apOnAge";
const RESUME_TURNS = 3;
const RESUME_POLL_MS = 2000;
const RESUME_POLLS = 450;
const AGE_ORDER = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];
let resumeTimer = null;
// The turn the autopilot stopped for the dedications of a new age it was already running in (the player switched it on
// first: game 33, E1 and M1); it switches itself on again once they are chosen.
let resumeOnChoice = null;

function safe(fn, fallback = null) {
    try {
        return fn();
    } catch (_e) {
        return fallback;
    }
}

/** Is a switch-on after an age change pending (the autopilot was on in an earlier age of this game)? */
function resumePending() {
    if (isAutopilotOn() || settings.get().autopilot?.resumeAfterAge === false) return false;
    if (resumeOnChoice !== null && resumeOnChoice === Game.turn) return true;
    const was = settings.recall(gameKey(), RESUME_KEY);
    const age = ageType();
    return !!was && AGE_ORDER.indexOf(was) >= 0 && AGE_ORDER.indexOf(was) < AGE_ORDER.indexOf(age) && Game.turn <= RESUME_TURNS;
}

// The first turn's conversions come before the dedications: confirming them applies the card that keeps last age's cities,
// so from then on every city counts in a conversion's price (game 34: 5 cities at M1 once they were chosen, the town
// window closed when the autopilot switched itself on). While they wait, the conversions run once (steps.convertAtAgeStart).
let windowTurn = null;

/** Forgets that the first turn's conversions ran (tests; a new age loads the file afresh). */
export function resetFirstTurnWindow() {
    windowTurn = null;
}

/** The first turn's conversions while the dedications wait (above). @returns log entries */
export async function convertBeforeDedications() {
    if (windowTurn === Game.turn) return [];
    windowTurn = Game.turn;
    const o = settings.get().autopilot ?? {};
    if (o.focus === false || o.towns === false || o.purchases === false) return [];
    const budget = createBudget({ gold: goldBalance(), reserve: steps.goldReserve(Number(o.reserveTurns ?? 2)) });
    const out = await steps.convertAtAgeStart(budget, safe(() => savedFocus(), null));
    record(out);
    return out;
}

/** Switches the autopilot on after an age change once the dedications are chosen (above). @returns true when it did */
export function resumeAfterAgeChange() {
    if (!resumePending()) return false;
    // The age's choices (the dedications) are the player's: wait for them, the cheapest conversions first.
    const blocker = safe(() => turnBlocker(), null);
    if (ageChoiceKey(blocker)) {
        if (blocker === "NOTIFICATION_AGE_TRANSITION") convertBeforeDedications().catch((error) => log.error("autopilot: first-turn conversions failed", error));
        return false;
    }
    resumeOnChoice = null;
    settings.remember(gameKey(), { [RESUME_KEY]: ageType() });
    record([{ key: "AUTO_RESUMED", args: [] }]);
    setAutopilot(true);
    return true;
}

/** Polls for the dedications while a switch-on is pending (the turn's activation may come before them). */
function watchResume() {
    if (!resumePending()) return;
    clearTimeout(resumeTimer);
    let polls = 0;
    const tick = () => {
        if (resumeAfterAgeChange() || !resumePending() || ++polls > RESUME_POLLS) return;
        resumeTimer = setTimeout(tick, RESUME_POLL_MS);
        resumeTimer?.unref?.();
    };
    tick();
}

function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => {
        runTurn().catch((error) => log.error("autopilot failed", error));
    }, ms);
}

/**
 * Map tacks while the autopilot plays unattended (it ends turns): Detailed Map Tacks logs ~100 lines
 * per tack whenever it refreshes them (root CLAUDE.md gotcha 18; UI.log reached 200 MB in game 6), so
 * then 1 plan tack per settlement and settle tacks only where settlers walk (research/21 H3).
 * @returns { perSettlement, nextSites }
 */
export function tackLimits(o = {}) {
    return o.endTurn ? { perSettlement: 1, nextSites: 0 } : { perSettlement: PLAN_TACKS_PER_SETTLEMENT, nextSites: SETTLE_TACKS };
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
        const r = await placePlanTacks(p, { perSettlement: s.autopilot?.tacks !== false ? tackLimits(s.autopilot).perSettlement : 0 });
        out.push({ key: "TACKS", args: [r.placed.length - r.kept, r.removed] });
    }
    return out;
}

/**
 * The site search (Settlements tab) runs by itself when settlers need sites: we have or
 * train one and the sites are missing or SITES_EVERY turns old.
 */
let relaxedTurn = -Infinity; // the last turn a settler with no site called the relaxed search (research/24 X3)

async function refreshSitesIfDue(s) {
    // A settler we have or train, or one wanted below the cap (it is trained only once a site is known).
    if (steps.settlersInFlight() === 0 && !steps.belowSettlementCap()) return [];
    const sites = state.get().results.sites;
    // A settler with no site for 2 turns: search again, relaxed, at most every SITES_EVERY turns (research/24 X3:
    // the relaxed search came only at A24, with picks known that no settler could take).
    const starved = settlersStarved() && Game.turn - relaxedTurn >= SITES_EVERY;
    if (!starved && sites?.picks?.length && Game.turn - (sites.computedTurn ?? -Infinity) < SITES_EVERY) return [];
    // Far below the cap a village we have never seen costs a site value, not the site (X3: A4 «18 unseen;
    // INDEPENDENT 171»).
    const deficit = steps.expansionDeficit();
    await startSiteSearch({ ...s, unseenVillagePenalty: deficit }).promise;
    let picks = state.get().results.sites?.picks ?? [];
    // Sites ran out while far below the cap: search again with looser rules (research/22 A1).
    if ((picks.length < RELAXED_MIN_PICKS && deficit) || starved) {
        if (starved) relaxedTurn = Game.turn;
        await startSiteSearch({ ...s, relaxedSites: true }).promise;
        picks = state.get().results.sites?.picks ?? [];
        return [{ key: "SITES_RELAXED", args: [picks.length] }];
    }
    return [{ key: "SITES_FOUND", args: [picks.length] }];
}

/**
 * Settle tacks (city hall, as the Settlements tab places them, with the role) where settlers
 * walk and on the next best free sites: the plan for "all settlements" then plans their
 * buildings too. Only the autopilot's own settle tacks (`auto`) are replaced.
 */
async function placeSettleTacks(o = {}) {
    const goals = settlerGoals();
    const taken = new Set(goals.map((g) => `${g.x},${g.y}`));
    const entries = goals.map((g) => ({ x: g.x, y: g.y, type: SETTLE_TACK_TYPE, role: g.role ?? "CITY", auto: true }));
    const limit = Math.max(entries.length, tackLimits(o).nextSites);
    for (const p of state.get().results.sites?.picks ?? []) {
        if (entries.length >= limit) break;
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
 * each path's standing, the victories themselves (victoryRaces: Innovation, GDP… against the
 * goal and the best rival, the countdown), the victories switched off in this game, the close
 * triumphs (for the tab) and those to track (hud/xpl-triumph-tracker.js). The races and what is
 * off go to UI.log once a turn. @returns log entries (when the focus changes, when our
 * countdown to a victory starts)
 */
function updateFocus(target = "AUTO") {
    const all = triumphs();
    const standings = legacyStandings();
    let disabled = disabledVictories();
    // Every path ruled out cannot be right (the user won a culture victory with "nothing" on): ignore it.
    if (FOCUS_CLASSES.every((c) => disabled.has(c))) disabled = new Set();
    // The final age: a completed path is kept (its victory goes on past the path).
    let finalAge = false;
    try {
        finalAge = !!Game.AgeProgressManager.isFinalAge;
    } catch (_e) {
        finalAge = false;
    }
    const scores = scoreFocus(standings, leaderLeaning(), all, { disabled, finalAge });
    let races = [];
    try {
        races = victoryRaces();
    } catch (error) {
        log.debug("autopilot: victory races unknown", error);
    }
    const before = ap().focus?.races ?? [];
    // Rivals near a dominance victory that is switched on (research/21 §3.4; decision 6).
    let watch = [];
    let military = null;
    let ageFrac = 0;
    try {
        const apm = Game.AgeProgressManager;
        const max = Number(apm.getMaxAgeProgressionPoints()) || 0;
        ageFrac = max > 0 ? (Number(apm.getCurrentAgeProgressionPoints()) || 0) / max : 0;
        // The final age: the settlements we may still found (and Operation Ivy) for our own military countdown.
        military = finalAge ? steps.militaryRoom() : null;
        watch = victoryWatch(races.filter((r) => r.enabled), local(), { age: ageType(), ageFrac, military })
            .map((w) => (w.own ? w : { ...w, leaderName: compose(Players.get(w.leader)?.leaderName ?? "?") }));
    } catch (error) {
        log.debug("autopilot: victory watch unknown", error);
    }
    // The focus survives the age change (the save), and the final age keeps it unless our own countdown elsewhere is near.
    const previous = ap().focus?.cls ? ap().focus : { cls: savedFocus() };
    const chances = new Set(watch.filter((w) => w.own && w.level === "CHANCE").map((w) => w.cls));
    const pick = chooseFocus(scores, previous, { target, finalAge, chances });
    if (pick.cls) saveFocus(pick.cls);
    const close = closeTriumphs(all);
    const kind = TRIUMPH_CATEGORY[pick.cls];
    setAp({
        focus: {
            cls: pick.cls, candidate: pick.candidate, streak: pick.streak,
            scores: scores.map(({ cls, ours, rival, goal, done }) => ({ cls, ours, rival, goal, done })),
            races: races.filter((r) => r.enabled && r.focusable !== false).map(({ cls, points, goal, rival, turnsLeft }) => ({ cls, points, goal, rival, turnsLeft })),
            watch,
            // Only the victories the focus can take (seen in game: DOMINATION, not a countdown race, showed as a raw key).
            off: [...disabled].filter((c) => FOCUS_CLASSES.includes(c)),
            close: close.slice(0, SHOW_TRIUMPHS).map(({ name, current, total, category }) => ({ name, current, total, category })),
            track: close.filter((t) => t.category === kind).slice(0, TRACK_TRIUMPHS).map((t) => t.type),
            // Science: Innovation against what this age should end with (research/21 L2b; experts enter Modern with 76-95).
            innovation: pick.cls === "SCIENCE" ? { points: races.find((r) => r.cls === "SCIENCE")?.points ?? 0, target: INNOVATION_TARGETS[ageType()] ?? null } : null,
        },
    });
    if (racesLoggedTurn !== Game.turn) {
        racesLoggedTurn = Game.turn;
        const race = (r) => `${r.cls} ${r.points}/${r.goal > 0 ? r.goal : "-"} (rival ${r.rival}${r.turnsLeft !== null ? `, countdown ${r.turnsLeft}` : ""})`;
        log.warn(`victory races: ${races.filter((r) => r.enabled).map(race).join(", ") || "none known"}; off ${JSON.stringify([...disabled])}; focus ${pick.cls ?? "-"}`);
        const mil = military ? races.find((r) => r.enabled && r.cls === "MILITARY") : null;
        const o = mil ? militaryOutlook(mil, local(), { age: ageType(), ageFrac, ...military }) : null;
        if (o) log.warn(`military: ours ${o.ours}, best other ${o.top}, our goal ${o.goal} at ×${o.multiple}; ${o.need} settlement(s) to our own countdown${military.ivy ? ` (${o.needIvy} with Operation Ivy)` : ""}; room ${o.room}, past the cap ${o.over}${o.reachable ? `, within reach${o.pastCap > 0 ? ` (${o.pastCap} past the cap)` : ""}` : ""}`);
        // The final age: the score that decides a game nobody wins (research/30 §1: lost 923 to 933, last in the economy);
        // not while the score victory is off (research/31 §1: game 26 printed «score: ours 0 …» every turn).
        if (finalAge && scoreVictoryOn()) logScore(races);
        if (watch.length > 0) log.warn(`victory watch: ${watch.map((w) => w.own ? `${w.cls} ours ${w.ours}/${w.goal} CHANCE${w.settlements !== undefined ? ` (${w.settlements} settlements${w.withIvy ? " + Ivy" : ""})` : ""}` : `${w.cls} p${w.leader} ${w.points}/${w.goal ?? "-"}${w.multiple ? ` ×${w.multiple}` : ""}${w.step ? ` (at ×${w.step}: goal ${w.stepGoal})` : ""}${w.need !== null ? ` need ${w.need} (ours ${w.ours}${w.block !== undefined ? `, ${w.block} settlements` : ""})` : ""}${w.countdown != null ? ` countdown ${w.countdown}` : ""}${w.level ? ` ${w.level}` : ""}`).join(", ")}`);
    }
    // Our countdown to a victory has just started: worth a line in the tab's log.
    const out = noteWatch(watch);
    for (const r of races) {
        if (!r.enabled || r.focusable === false || r.turnsLeft === null || before.some((b) => b.cls === r.cls && b.turnsLeft !== null)) continue;
        out.push({ key: "VICTORY_COUNTDOWN", args: [compose(`LOC_XPL_FOCUS_${r.cls}`), r.turnsLeft] });
    }
    // No path (seen in game: no focus at all after an age change): say why, once a turn.
    if (!pick.cls && focusDiagnosedTurn !== Game.turn) {
        focusDiagnosedTurn = Game.turn;
        log.warn(`victory focus: no path this turn (target ${target}); paths ${JSON.stringify(standings.map((s) => [s.path, s.cls, s.ours, s.goal]))}; disabled ${JSON.stringify([...disabled])}; scored ${scores.length}`);
    }
    if (!pick.changed || !pick.cls) return out;
    const s = scores.find((x) => x.cls === pick.cls);
    return [{ key: "VICTORY_FOCUS", args: [compose(`LOC_XPL_FOCUS_${pick.cls}`), s?.ours ?? 0, s?.goal ?? 0] }, ...out];
}

/**
 * The strategy of this pass (core/xpl-strategy.js; research/21 §3): kept in state.autopilot.strategy
 * for the tab ({ phase, age, focus, lines }) and the next pass (phases only move forward within an
 * age); UI.log once a turn. @returns log entries (PHASE when the phase, age or focus changes)
 */
function noteStrategy(plan, facts) {
    const before = ap().strategy;
    setAp({ strategy: { phase: plan.phase, age: plan.age, focus: plan.focus, profile: plan.profile, gateLate: !!plan.gateLate, noFutureTech: !!plan.noFutureTech, lines: strategyLines(plan) } });
    if (strategyLoggedTurn !== Game.turn) {
        strategyLoggedTurn = Game.turn;
        const gate = facts.gate?.known ? `${facts.gate.open ? "open" : "no"} ${Math.round((facts.gate.progress ?? 0) * 100) / 100}` : "-";
        log.warn(`strategy: phase ${plan.phase} focus ${plan.focus} (${facts.age} ${Math.round((facts.ageFrac ?? 0) * 100)}%, settlements ${facts.settlements}/${facts.cap}, cities ${facts.cities}, towns ${facts.towns}, gate ${gate}${facts.ageEnding ? ", age ending" : ""}); profile ${plan.profile}, reserve ${plan.reserveTurns}t, goals ${plan.goals.join(">") || "-"}, wonders ${plan.wonders}, explorers ${plan.explorers}, settlers ${plan.trainSettlers}, upgrades ${plan.upgrades}, soldiers ${plan.advisorSoldiers}${plan.pads ? `, pads ${plan.pads}` : ""}`);
    }
    if (before && before.phase === plan.phase && before.age === plan.age && before.focus === plan.focus) return [];
    return [{ key: "PHASE", args: [compose(`LOC_XPL_AP_PHASE_${plan.phase}`), compose(`LOC_XPL_FOCUS_${plan.focus}`)] }];
}

/**
 * UI.log, once a turn in the final age: each major's score (the score victory decides a game nobody wins), ours and the
 * best other's, and our place in each race the score counts with the points that would share the next place up.
 */
function logScore(races) {
    const board = scoreBoard();
    if (board.length === 0) return;
    const me = local();
    const ours = board.find((b) => b.id === me)?.points ?? 0;
    const top = board.find((b) => b.id !== me);
    const place = 1 + board.filter((b) => b.id !== me && b.points > ours).length;
    const places = scorePlaces(races.filter((r) => r.enabled), me).map((p) => `${p.cls} ${p.place}${p.gap !== null ? ` (+${Math.round(p.gap)} for the next)` : ""}`);
    log.warn(`score: ours ${ours} (place ${place} of ${board.length}${top ? `; best other ${top.points}, ${compose(Players.get(top.id)?.leaderName ?? "?")}` : ""}); places ${places.join(", ") || "-"}`);
}

const watchWarned = new Set(); // "<cls>:<leader>:DANGER|COUNTDOWN": each said once per session

/** Log entries when a rival first gets near a victory, and when its countdown starts. */
function noteWatch(watch) {
    const out = [];
    for (const w of watch ?? []) {
        const victory = compose(`LOC_XPL_FOCUS_${w.cls}`);
        // Our own countdown within reach (research/24 F2).
        if (w.own) {
            const key = `${w.cls}:own:CHANCE`;
            if (w.level === "CHANCE" && !watchWarned.has(key)) {
                watchWarned.add(key);
                // Settlements to found for our military countdown (research/26 §3.3), else plain points.
                out.push(w.settlements !== undefined ? { key: "MILITARY_LEVER", args: [w.settlements, w.ours, w.goal] } : { key: "OWN_CHANCE", args: [victory, w.ours, w.goal] });
            }
            // Settlements past the cap for it (research/30 §1), said once.
            if (w.pastCap > 0 && !watchWarned.has(`${w.cls}:own:PAST_CAP`)) {
                watchWarned.add(`${w.cls}:own:PAST_CAP`);
                out.push({ key: "MILITARY_PAST_CAP", args: [w.pastCap] });
            }
            continue;
        }
        // In danger only through the final age's next step (victoryWatch `step`): said once as such (game 31).
        const atStep = `${w.cls}:${w.leader}:STEP`;
        if (w.level === "DANGER" && w.step && !watchWarned.has(atStep)) {
            watchWarned.add(atStep);
            out.push({ key: "RIVAL_STEP_DANGER", args: [w.leaderName, victory, w.points, w.stepGoal, w.step, w.need ?? "?"] });
            continue;
        }
        const near = `${w.cls}:${w.leader}:DANGER`;
        if (w.level === "DANGER" && !w.step && !watchWarned.has(near)) {
            watchWarned.add(near);
            // A fixed score (science) has no score of ours that holds it back.
            out.push(w.fixed ? { key: "RIVAL_NEAR_WIN_FIXED", args: [w.leaderName, victory, w.points, w.goal] } : { key: "RIVAL_NEAR_WIN", args: [w.leaderName, victory, w.points, w.goal ?? "?", w.need ?? "?"] });
        }
        const counting = `${w.cls}:${w.leader}:COUNTDOWN`;
        if (w.countdown !== null && w.countdown !== undefined && !watchWarned.has(counting)) {
            watchWarned.add(counting);
            out.push({ key: "RIVAL_COUNTDOWN", args: [w.leaderName, victory, w.countdown] });
        }
    }
    return out;
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
 * The log entry for a choice of the age change (the player's): the next civilization when the age is
 * over, the dedications when a new one starts; with the science focus it names the science picks
 * (research/21 L8, J1, J2: the legacy that keeps cities, the free Academics technology and +25%
 * production toward projects, the Memento Advisor's science mementos). null: not an age choice.
 */
export function ageChoiceKey(blocker, focus = null) {
    const base = { NOTIFICATION_CHOOSE_CIVILIZATION: "AGE_OVER", NOTIFICATION_AGE_TRANSITION: "AGE_START" }[blocker];
    if (!base) return null;
    return focus === "SCIENCE" ? `${base}_SCIENCE` : base;
}

/**
 * One pass over this turn's decisions. Runs on the local player's turn start while the
 * autopilot is on; force = once now (the "Do it now" button).
 */
export async function runTurn(force = false) {
    if (running || (!force && !isAutopilotOn())) return;
    running = true;
    setAp({ running: true });
    // Each city's queue is edited once a pass: the game's queue does not show earlier edits yet (research/28 §2).
    steps.beginQueuePass();
    // The game activates our turn again after an automated explorer moves (seen in game 7: 24 turns had
    // two full passes): the repeat only orders units, makes waiting choices, places citizens and ends the
    // turn; nothing is bought, queued or proposed twice (research/22 B9).
    const full = force || ap().lastTurn !== Game.turn;
    try {
        let s = settings.get();
        let o = s.autopilot ?? {};
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
        // The strategy (research/21 §3.5): a growing start, then the focus's buildings, then the final
        // push. It narrows this pass's settings (reserve, wonders, profile, explorers, settlers...);
        // the saved settings stay the user's.
        let plan = null;
        if (focus && o.strategy !== false) {
            await guarded("strategy", () => {
                const facts = steps.strategyFacts(focus);
                plan = planStrategy(facts, focus, { previous: ap().strategy ?? null, profile: s.profile, watch: ap().focus?.watch ?? [] });
                if (plan) record(noteStrategy(plan, facts));
            });
        } else if (ap().strategy) setAp({ strategy: null });
        s = applyStrategy(s, plan);
        // The balance of the focus's own (core/xpl-profiles.js biasFor): science starts with Еда ×0.7, Наука ×1.5. While the
        // gold income stays below zero, gold weighs more in every choice (steps.goldPressureNow; game 31).
        let gold = { factor: 1 };
        await guarded("gold", () => {
            gold = steps.goldPressureNow();
            // Said when it rises, and when it is over (a step down from ×2 to ×1.5 shows in UI.log's gold line).
            if (gold.rose) record([{ key: "GOLD_PRESSURE", args: [gold.deficitTurns, gold.factor] }]);
            else if (gold.changed && gold.level === 0) record([{ key: "GOLD_PRESSURE_OFF", args: [] }]);
        });
        // The science victory's last stretch: production over science (steps.spacePushNow; research/38 §4 E1).
        let push = { on: false, level: null };
        await guarded("space push", () => {
            push = steps.spacePushNow(focus);
            if (push.changed && push.level === "FULL") record([{ key: "SPACE_PUSH", args: [] }]);
            else if (push.changed && push.level === "HALF") record([{ key: "SPACE_PUSH_HALF", args: [] }]);
        });
        s = { ...s, biasFocus: focus ?? "NONE", goldPressure: gold.factor, spacePush: push.level };
        o = s.autopilot ?? {};
        const maxWonders = plan ? Math.max(1, Number(o.maxWonders) || 1) : wondersAtOnce(o.maxWonders ?? 1, focus);
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
                approach: unbefriendable(), leave: released, threats: o.defend || o.roam ? threats : [], riskOwners: steps.warState().risk,
                // Settlements facing a war or a war risk: a guard each from the army we have (research/36 §2).
                fronts: o.defend ? steps.warFronts() : [],
                // Settlements near a village at war with us: a holder each (research/37 §4).
                exposed: o.defend ? steps.exposedSettlements(threats) : [],
                // Settlements wanting fighter cover, a Launch Pad city first (research/37 §7B).
                airCover: o.defend ? steps.airCoverTargets() : [],
                settleNear: !!s.strategy?.settleNear,
                // A countdown to block or to start: settlers with no site found wherever the game allows (research/31 §3).
                anywhere: !!s.strategy?.settleAnywhere,
                // The military lever's settlements past the cap (research/30 §1).
                pastCap: s.strategy?.militaryLever ? Number(s.strategy.pastCap) || 0 : 0,
                victory: !!focus, distant: focus === "ECONOMIC",
            });
            record(r.entries);
            const founded = [...r.entries];
            // A settler that stepped onto its site past hostile units founds there now (game 35).
            if (r.entries.some((e) => e.key === "SETTLER_DASH")) {
                await wait(STEP_PAUSE_MS);
                const f = foundArrivals();
                record(f);
                founded.push(...f);
            }
            // A soldier that reached an empty village at war with us disperses it now, before its raiders come home (game 37).
            if (r.entries.some((e) => e.key === "DISPERSE_MOVE")) {
                await wait(STEP_PAUSE_MS);
                record(disperseArrivals());
            }
            for (const k of r.ordered) ordered.add(k);
            for (const [k, at] of r.orderedAt ?? []) orderedAt.set(k, at);
            if (founded.some((e) => e.key === "SETTLE_FOUND")) await nextEvent("CityInitialized", FOUND_WAIT_MS);
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
            // Majors at war with us, at our door or not, and the war risks (research/23 D3).
            record(steps.assessWar(threats, { watch: ap().focus?.watch ?? [] }).entries);
            steps.noteThreats(threats); // a lasting threat: walls are researched (D7)
        });
        if (full && o.befriend !== false) await guarded("befriend", () => record(befriendIndependents(threats)));
        // Other leaders: counter-spy, reconciliation, endeavors (after befriending: Influence goes there first).
        if (full && o.diplomacy) await guarded("diplomacy", () => record(tendDiplomacy(s, { threatened: threats.length > 0 })));
        if (o.settlers) await guarded("sites", async () => record(await refreshSitesIfDue(s)));
        // Melee soldiers strike raiders next to them when the game's own prediction says it pays. Their units are not kept
        // from the skip step: each attack was waited for (its Combat event), and one that did not happen leaves a unit the
        // game waits for (game 36 T49: a Coordinated Attack's raider died after two of its three Warriors, and the third,
        // never skipped, held the turn).
        if (o.defend) {
            await guarded("strike", async () => {
                const r = await strikeRaiders();
                record(r.entries);
            });
        }
        await guarded("units", orderUnits);
        if (full && o.befriend !== false && (o.explore || o.roam)) await guarded("borders", () => record(proposeOpenBorders(leadersNearExplorers({ explore: !!o.explore, roam: !!o.roam }))));
        if (full && o.settlers && o.tacks !== false) await guarded("tacks", async () => record(await placeSettleTacks(o)));
        if (o.research !== false) await guarded("research", research);
        if (o.choices !== false) await guarded("choices", async () => record(await makeChoices(s)));
        // The gold plan of this pass (research/21 §4): one budget every purchase below spends from (the
        // treasury does not change during a pass), and the goal to save for (a town conversion, the
        // victory path's next building) before small purchases.
        const reserveTurns = Number(o.reserveTurns ?? 2);
        let pass = null;
        if (full) await guarded("gold", () => {
            pass = steps.goldPlan(s, { focus, reserveTurns, threats });
            record(pass.entries);
        });
        const budget = pass?.budget ?? null;
        // Damaged buildings first: bought with gold when it covers them, else at the front of the queue.
        if (full && (o.purchases !== false || o.production !== false)) {
            await guarded("repairs", () => record(steps.repairBuildings({ buy: o.purchases !== false, queue: o.production !== false, budget })));
            // Walls where raiders threaten a settlement (all the gold: they cannot wait).
            if (threats.length > 0) await guarded("walls", () => record(steps.fortifyThreatened(threats, { buy: o.purchases !== false, queue: o.production !== false, budget, pool: "all" })));
        }
        // Walls for Fort Towns near a village at war with us (only a Fort Town may buy them), from the free gold.
        if (full && o.defend && o.purchases !== false) await guarded("walls", () => record(steps.fortifyThreatened(steps.exposedFortTowns(), { buy: true, queue: false, reserve: steps.goldReserve(reserveTurns), budget, pool: "free" })));
        // Defenders bought on the spot (threatened, then exposed settlements), before buildings take the gold.
        if (full && o.defend && o.purchases !== false) await guarded("defenders", () => record(steps.buyDefenders(threats, { reserveTurns, budget })));
        // The age's first melee unit, which sets every centre's defence (research/37 §2), bought when the gold allows.
        if (full && o.defend && o.purchases !== false) await guarded("defenders", () => record(steps.buyFirstMelee(threats, { reserveTurns, budget })));
        // A new age's first turn: the cheapest conversions of the age, while only the capital counts (research/39 §4.1).
        if (full && o.towns !== false && o.purchases !== false && budget) await guarded("towns", async () => record(await steps.convertAtAgeStart(budget, focus)));
        // A settlement a revolt may take: a Happiness building bought there (research/39 §4.4: game 32 lost Бирмингем at A61).
        if (full && o.purchases !== false && budget) await guarded("revolts", () => record(steps.guardRevolts(budget)));
        const unitOptions = {
            explore: !!o.explore, settlers: !!o.settlers, merchants: !!o.merchants, defend: !!o.defend, threats: o.defend || o.roam ? threats : [], profile: s.profile, victory: focus,
            exposed: o.defend ? steps.exposedSettlements(threats) : [],
            explorers: o.explorers ?? !!o.explore, trainSettlers: o.trainSettlers ?? !!o.settlers, strategy: s.strategy ?? null,
        };
        const produce = async () => {
            // sid -> types the victory step queued in this run (H2: the game's isEmpty is stale until it handles them). Fresh for
            // each end-of-turn retry: by then the game has handled them, and one it refused must not keep a queue empty (game
            // 32, E64: Liverpool's empty queue was skipped in every retry and «Выбрать производство» held the turn).
            const victoryQueued = new Map();
            record(await replanIfDue(s));
            // An item the game does not complete gives way first (game 33: Брэдфорд's City Park at 945 of 451).
            record(steps.unstickQueues());
            // The victory focus's own work first (science projects and a Launch Pad; the path's buildings of this age).
            if (focus) record(steps.pushVictoryWork(focus, { settlers: !!o.settlers, pads: s.strategy?.pads ?? null, queued: victoryQueued, strategy: s.strategy ?? null }));
            // Operation Ivy when the settlements alone fall short of our military countdown (research/26 §3.4).
            record(steps.pushOperationIvy(s.strategy));
            // Launch Pad cities keep out of wonders only once Rocketry is near (research/22 B5).
            const excludeCities = steps.padExclusion(s.strategy);
            const wonders = o.wonders !== false ? steps.chooseWonders(s, maxWonders, { settlers: !!o.settlers, excludeCities }) : new Map();
            // A race we can see we lose: a building takes the wonder's progress (research/27 §6).
            if (o.wonders !== false) record(steps.cashOutLostWonders());
            record(steps.fillProduction(wonders, { ...unitOptions, queued: victoryQueued }));
            // A non-final age's last turns: what is not done before the age ends gives way (game 22: 732 production lost).
            record(steps.ageEndOrder());
            record(steps.frontLoadUnits(unitOptions));
            await wait(STEP_PAUSE_MS);
        };
        if (full && o.production !== false) await guarded("production", produce);
        const growth = async () => {
            for (let i = 0; i < steps.MAX_GROWTH_PER_CITY; i++) {
                const placed = steps.placeGrowth(s, { victory: focus });
                record(placed);
                if (placed.length === 0) break;
                await wait(STEP_PAUSE_MS);
            }
        };
        if (o.growth !== false) await guarded("growth", growth);
        if (full && o.towns !== false) {
            const focused = new Set();
            await guarded("towns", () => {
                // Science past the Growth phase: farming towns are reconsidered for Urban Center (research/23 S7).
                const revisit = focus === "SCIENCE" && !!s.strategy?.phase && s.strategy.phase !== "GROWTH";
                const entries = steps.setTownFocus(s, o.defend ? threats : null, { revisit });
                for (const e of entries) if (e.town) focused.add(`${e.town.owner}:${e.town.id}`);
                record(entries);
            });
            await guarded("towns", () => record(considerTownProjects(focused)));
            await guarded("towns", () => record(steps.convertTowns(s, pass ?? reserveTurns, { focus })));
            await guarded("towns", () => steps.logUrbanCenters()); // probe P3: UI.log only
        }
        if (full && o.resources !== false) await guarded("resources", () => record(steps.assignResources(s)));
        if (full && o.purchases !== false) {
            await guarded("purchases", async () => {
                // Towns buy the victory path's buildings first (Rail Station, Port, Factory); the
                // plan's purchases then skip those and count their gold.
                const purchases = budget ?? { bought: new Set(), spent: 0 };
                // A non-final age's last turn: a building nearly done is bought, else its production is lost (research/30 §4).
                if (budget) record(steps.buyAgeEndItems(budget, { threatened: threats.length > 0 }));
                // A goal no other step buys (a settler far below the cap, the GDP building), then a settler
                // from the free gold while far below the cap (past it for the military lever).
                if (budget) record(steps.buyGoal(budget));
                if (budget && (o.trainSettlers ?? o.settlers)) record(steps.buySettlers(budget, threats, { fill: !!s.strategy?.fillCap, past: s.strategy?.militaryLever ? Number(s.strategy.pastCap) || 0 : 0 }));
                if (focus) record(steps.buyVictoryWork(focus, reserveTurns, purchases, { pads: s.strategy?.pads ?? null, commit: s.strategy?.phase === "COMMIT" }));
                record(steps.buyBuildings(s, reserveTurns, purchases));
                await wait(STEP_PAUSE_MS);
            });
            // Then unit upgrades with the free gold.
            await guarded("upgrades", () => {
                const war = steps.warState().near;
                record(upgradeUnits(budget ?? steps.goldReserve(reserveTurns), threats, { mode: war ? "ANY" : s.strategy?.upgrades ?? "ANY", ageEnding: steps.ageEnding(), war, exposed: o.defend ? steps.exposedSettlements(threats) : [] }));
            });
        }
        // A new age's unit upkeep above the gold income: surplus soldiers disbanded (research/24 G3).
        if (full && o.defend) {
            await guarded("upkeep", () => {
                const w = steps.warState();
                const apm = Game.AgeProgressManager;
                const max = Number(apm?.getMaxAgeProgressionPoints?.()) || 0;
                record(disbandSurplus({
                    income: steps.goldIncome(),
                    ageFrac: max > 0 ? (Number(apm.getCurrentAgeProgressionPoints()) || 0) / max : 1,
                    firstAge: ageType() === "AGE_ANTIQUITY",
                    peace: w.atWar.length === 0 && w.risk.length === 0 && threats.length === 0,
                }));
            });
        }
        // What the pass did with the gold: the tab's gold line and a UI.log line.
        if (pass) await guarded("gold", () => steps.logGold(pass));
        // Every 10 turns: yields, population and where new citizens went (research/26 §3.2).
        if (full) await guarded("economy", () => steps.logEconomy(s));
        // UI.log probes for the next military phases: armies, reinforcements, aircraft (research/37 §3F).
        if (full) await guarded("probes", () => probeMilitary());
        // How close our urban districts come to the age's science triumph mark (growth.probeDistricts; game 35).
        if (full) await guarded("probes", () => probeDistricts());
        // For the next age's first turn: this age's cities (its cheap conversions) and that the autopilot was on (it switches
        // itself on again there: resumeAfterAgeChange).
        if (full) await guarded("memory", () => {
            steps.noteCitiesForNextAge();
            if (isAutopilotOn()) settings.remember(gameKey(), { [RESUME_KEY]: ageType() });
        });
        const skip = async () => record(await steps.skipIdleUnits(ordered));
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
            const ageKey = ageChoiceKey(blocker, focus);
            if (ageKey) {
                record([{ key: ageKey, args: [] }]);
                setAutopilot(false, { keepResume: true });
                // The new age's dedications: on again once they are chosen (game 33: the player switched it on before them).
                if (blocker === "NOTIFICATION_AGE_TRANSITION" && settings.get().autopilot?.resumeAfterAge !== false) {
                    resumeOnChoice = Game.turn;
                    watchResume();
                }
            } else if (blocker) {
                record([{ key: "BLOCKED", args: [blocker] }]);
                if (blocker === "NOTIFICATION_NEW_POPULATION") log.info(`autopilot: settlements saying a citizen waits: ${steps.readyToGrow().join(", ") || "none"}`);
                if (blocker === "NOTIFICATION_COMMAND_UNITS") log.info(steps.readyUnitReport());
            } else if (diplomacyScreenOpen()) {
                // A diplomacy screen is open (a deal the player works on, a leader's words): the game refuses
                // to end the turn; the pass runs again when the session closes (research/23 D1).
                if (endTurns.turn !== Game.turn || !endTurns.noted) record([{ key: "WAIT_DIPLOMACY", args: [] }]);
                endTurns = { turn: Game.turn, n: endTurns.turn === Game.turn ? endTurns.n : 0, noted: true };
            } else {
                if (endTurns.turn !== Game.turn) endTurns = { turn: Game.turn, n: 0, noted: false };
                if (endTurns.n < MAX_END_TURNS) {
                    const ended = steps.endTurn();
                    if (ended.length > 0) endTurns.n++;
                    record(ended);
                } else if (!endTurns.noted) {
                    endTurns.noted = true;
                    record([{ key: "END_TURN_REFUSED", args: [MAX_END_TURNS] }]);
                }
            }
        }
        setAp({ lastTurn: Game.turn });
    } catch (error) {
        log.error("autopilot pass failed", error);
        record([{ key: "ERROR", args: [String(error?.message ?? error)] }]);
    } finally {
        steps.endQueuePass();
        running = false;
        setAp({ running: false });
    }
}

engine.on("PlayerTurnActivated", (data) => {
    if (data?.player === local() && isAutopilotOn()) schedule(START_DELAY_MS);
    else if (data?.player === local()) watchResume();
});
// The next age loads with the autopilot off: its first turn may have begun before this file loaded.
{
    const t = setTimeout(() => safe(() => watchResume()), 5000);
    t?.unref?.();
}

// A diplomacy screen closed while the turn waited for it: the pass runs again (and may end the turn).
engine.on("DiplomacySessionClosed", () => {
    if (isAutopilotOn() && endTurns.turn === Game.turn && endTurns.noted) schedule(START_DELAY_MS);
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
/**
 * Someone won, or we were defeated: the autopilot switches off too (seen in game: after Mexico's
 * economic victory it kept playing turns in the background; after our own win it kept buying).
 * The player may switch it on again for "one more turn"; a pass already running does not end
 * the turn (the end-turn step checks that the autopilot is on).
 */
function stopForGameEnd(reason) {
    if (!isAutopilotOn()) return;
    clearTimeout(timer);
    setAp({ enabled: false });
    record([{ key: "GAME_OVER_OFF", args: [compose(`LOC_XPL_AP_AI_STOP_${reason}`)] }]);
}

engine.on("TeamVictory", () => {
    stopAiTurns("VICTORY");
    stopForGameEnd("VICTORY");
});
engine.on("PlayerDefeat", (data) => {
    if (data?.player !== humanPlayerId()) return;
    stopAiTurns("DEFEAT");
    stopForGameEnd("DEFEAT");
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
