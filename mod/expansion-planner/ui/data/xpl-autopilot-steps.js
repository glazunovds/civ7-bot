/**
 * The autopilot's steps: each one makes the decisions of one kind the player would make
 * by clicking, with the game's own commands (so it also works online), and returns what
 * it did as log entries { key, args } (LOC_XPL_AP_<key>). Units are never moved.
 *
 *  - research / civics: the game advisor's recommendation (what the tech and civics
 *    choosers mark), when nothing is being researched;
 *  - production: a city's empty queue gets its next planned buildings on their tiles,
 *    else the advisor's top recommendation (a building on the tile the game rates best,
 *    a project, or a military unit);
 *  - growth: a new citizen goes where the growth advisor says ("best choice");
 *  - towns: a Growing town at population 7+ that feeds a city takes the recommended Focus;
 *  - purchases: the best-value planned buildings, keeping a gold reserve;
 *  - units: idle units skip their turn (so the turn can end); end turn.
 */
import { applyTownFocus, buyPlanned, goldBalance, purchaseAdvice, queueNextBuildings } from './xpl-city-actions.js';
import { growthAdvice } from './xpl-growth-job.js';
import { runWonderPlanner } from './xpl-wonder-job.js';
import { tierValue } from '../core/xpl-wonder-tiers.js';
import { bestAbsorber, raceLost } from '../core/xpl-wonder-race.js';
import { ageHasEnd, ageOutlook, productionToGoldRatio, runTownAdvisor } from './xpl-town-job.js';
import { getRules } from './xpl-rules-loader.js';
import { FOCUS_POPULATION } from '../core/xpl-town-focus.js';
import { biasFor, biasKey, profileFor } from '../core/xpl-profiles.js';
import { H, yieldIndex, YIELD_KEYS } from '../core/xpl-yields.js';
import { GOLD_PRESSURE, goldPressure, happinessWorth, unhappinessShare } from '../core/xpl-scarcity.js';
const HAPPINESS = yieldIndex("YIELD_HAPPINESS");
import { FOCUS_YIELD_TAG, INNOVATION_WONDER, gateTargets, innovationReach, isGateResearch, LAUNCH_PAD, leverBuildings, MASTERY_INNOVATION, MERCHANTS_AT_ONCE, ONE_OFF_INNOVATION, oneOffNext, pickBonusResearch, pickVictoryResearch, PROJECT_INNOVATION, PROJECT_PRODUCTION_TRADITIONS, rankInnovationResearch, REACH_MAX_TURNS, REPEATABLE_PROJECTS, RESEARCH_INNOVATION, researchToward, SCIENCE_PROJECTS, scienceSites, SITE_MAX_TURNS, STANDING_SITE_PROJECTS, wantedResearch } from '../core/xpl-victory-levers.js';
import { disabledVictories, innovationNeed, scoreVictoryOn } from './xpl-victory.js';
import { idString, sameId } from '../core/xpl-component-id.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { afloat, airBases, airRaidTargets, allowedOperations, antiShipStrength, artifactSites, earlyWarning, fighterCover, guardDeadline, guardDetail, guardsFor, guardsWanted, holderDetail, hostileAircraft, isIdle, isRangedGuard, isSiegeGuard, NO_TARGET, openTradeRoutes, plannedRoleAt, rangedWanted, readyForOrders, safeSiteFrom, seasBlocked, settlerGoals, shipRole, unitKey, upgradeFirstMelee } from './xpl-autopilot-units.js';
import { NAVAL, isWarship } from '../core/xpl-naval.js';
import { villagesOf } from './xpl-player-facts.js';
import { CENTRE_BASE, meleeStrength, meleeThisAge, noteMeleeObtained } from './xpl-centre-defence.js';
import { TUNING } from '../core/xpl-tuning.js';
import { focusOfProfile } from '../core/xpl-effect-value.js';
import { greatWorksWaiting, hostileActs, traitEffects } from './xpl-autopilot-choices.js';
import { chooseGoal, conversionRule, conversionValue, createBudget, noteGoalBought, rankConversions, TOWN_SHARE } from '../core/xpl-savings.js';
import { CITY_TARGETS } from '../core/xpl-strategy.js';
import { gameKey, settings } from '../services/xpl-settings.js';

export const MAX_GROWTH_PER_CITY = 3;  // citizens placed per city and turn
export const MAX_PURCHASES = 3;        // buildings bought per turn
export const MAX_UNIT_SKIPS = 60;
// Wonders: a wonder also counts for the age's culture legacy path and, in the Modern age,
// gives Tourism for a culture victory (4 / 8 / 12 per Antiquity / Exploration / Modern
// wonder): worth this much (weighted yield per turn) on top of its own yields.
export const WONDER_LEGACY_VALUE = 4;
const RACE_FACTOR = { HIGH: 1, MEDIUM: 0.6 };   // LOW / NONE: not started
const WONDER_AGE_MARGIN = 2;                       // must finish this many turns before the age ends

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
const nameOf = (c) => safe(() => Locale.compose(c.name), String(c?.name ?? ""));
const sidOf = (c) => `c:${c.location.x}-${c.location.y}`;

export function ownSettlements() {
    return safe(() => Players.get(pid()).Cities.getCities(), []) ?? [];
}

const currentAge = () => safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null);

/**
 * Expansion first: in the Antiquity age, with «Поселенцы» on, below the settlement cap, while
 * expansion is real (a settler walks to a site, or sites are known for the next one), no new wonder
 * starts (one already in production carries on). Seen in game 5: the capital built three wonders,
 * settlers came on turns 7, 49 and 69, and the empire had one city for 57 turns. Science projects
 * are not held (research/21 D4; seen in game 6: Spherical Earth waited behind expansion): settlers
 * go ahead of them anyway (unitSlot).
 */
export function expandingFirst(settlersOn) {
    if (!settlersOn || currentAge() !== "AGE_ANTIQUITY") return false;
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements);
    const cap = Number(stats?.settlementCap);
    if (!(Number.isFinite(n) && Number.isFinite(cap) && cap > 0 && n < cap)) return false;
    // Only while a settler is actually on its way or in training (research/22 B5: game 7 was below the cap
    // all Antiquity with sites known, and no wonder was built all age).
    if ((safe(() => settlerGoals(), []) ?? []).length > 0) return true;
    return ownSettlements().some((c) => (safe(() => c.BuildQueue.getQueue(), []) ?? []).some((q) => isSettler(queueUnitDef(q))));
}

// ---- war (research/23 D3) --------------------------------------------------------------------

export const WAR_NEAR_DISTANCE = 12; // a major at war with a settlement this close to ours: the war is at our door
export const WAR_RISK_DISTANCE = 10; // an Unfriendly or Hostile major this close to us is a war risk...
export const HOSTILE_ACT_TURNS = 20; // ...as is one whose espionage or sanctions hit us this many turns ago or less
const GUARDS_AT_ONCE = 2;            // guards trained at a time (QUEUED_GUARD)
let war = { turn: -1, atWar: [], near: false, risk: [] };
const warRiskNoted = new Set();

const leaderOf = (id) => safe(() => Locale.compose(Players.get(id).leaderName), String(id));

/** Tiles between our nearest settlement and this player's nearest one we have seen (Infinity: none). */
function settlementDistance(id) {
    const ours = ownSettlements();
    const HIDDEN = globalThis.RevealedStates?.HIDDEN ?? 0;
    let best = Infinity;
    for (const c of safe(() => Players.get(id).Cities.getCities(), []) ?? []) {
        const at = c.location;
        if (safe(() => GameplayMap.getRevealedState(pid(), at.x, at.y), HIDDEN + 1) === HIDDEN) continue;
        for (const o of ours) best = Math.min(best, safe(() => GameplayMap.getPlotDistance(at.x, at.y, o.location.x, o.location.y), Infinity));
    }
    return best;
}

/**
 * The war this pass (research/23 D3: game 8, Prussia was Unfriendly for 35 turns, sabotaged us and planned
 * its attack 13 turns ahead while we had 3-4 land units against 13-24 for every AI):
 *  - atWar: majors at war with us; near: one of them has a settlement within WAR_NEAR_DISTANCE of ours,
 *    or its units threaten one of our settlements;
 *  - risk: majors at peace that are Unfriendly or Hostile and either close (WAR_RISK_DISTANCE) or whose
 *    espionage or sanctions hit us lately (choices' hostileActs).
 * Kept for the pass (warState); UI.log once a turn; WAR_RISK once per leader. A leader near a military win (the
 * victory watch's DANGER, or its countdown) is a risk at any distance and relationship (research/24 W5: Alexander
 * was at DANGER from M56, targeted Шанхай at M57, declared at M62, and was never a risk).
 * @param options { watch: the victory watch (state.autopilot.focus.watch) } @returns { atWar, near, risk, entries }
 */
export function assessWar(threats = [], { watch = [] } = {}) {
    const me = safe(() => Players.get(pid()), null);
    const R = globalThis.DiplomacyPlayerRelationships;
    const acts = safe(() => hostileActs(), null) ?? new Map();
    const atWar = [];
    const risk = [];
    const conquerors = new Set((watch ?? []).filter((w) => !w.own && w.cls === "MILITARY" && (w.level === "DANGER" || w.countdown != null)).map((w) => w.leader));
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid()) continue;
        if (safe(() => me.Diplomacy.isAtWarWith(p.id), false)) {
            atWar.push(p.id);
            continue;
        }
        if (conquerors.has(p.id)) {
            risk.push(p.id);
            continue;
        }
        const rel = safe(() => me.Diplomacy.getRelationshipEnum(p.id), null);
        if (!R || (rel !== R.PLAYER_RELATIONSHIP_HOSTILE && rel !== R.PLAYER_RELATIONSHIP_UNFRIENDLY)) continue;
        const lately = Game.turn - (acts.get(p.id) ?? -Infinity) <= HOSTILE_ACT_TURNS;
        if (lately || settlementDistance(p.id) <= WAR_RISK_DISTANCE) risk.push(p.id);
    }
    const near = atWar.some((id) => settlementDistance(id) <= WAR_NEAR_DISTANCE) || (threats ?? []).some((t) => (t.owners ?? []).some((o) => o && !o.independent));
    const entries = [];
    for (const id of risk) {
        if (warRiskNoted.has(id)) continue;
        warRiskNoted.add(id);
        entries.push({ key: "WAR_RISK", args: [leaderOf(id)] });
    }
    if (war.turn !== Game.turn && (atWar.length > 0 || risk.length > 0)) log.warn(`war: at war with [${atWar.map(leaderOf).join(", ")}]${near ? " at our door" : ""}; risk [${risk.map(leaderOf).join(", ")}]`);
    war = { turn: Game.turn, atWar, near, risk };
    return { ...war, entries };
}

/** The war as assessWar saw it this pass. */
export const warState = () => war;

/** Forgets the war (tests: a fresh game). */
export function resetWar() {
    war = { turn: -1, atWar: [], near: false, risk: [] };
    warRiskNoted.clear();
    threatTurns = [];
    defendersNoted.clear();
    trainingNoted.clear();
    guardOrders.clear();
    defenderTrainers.clear();
    trainedFor.clear();
    defenderBought.clear();
    fronts.clear();
    meleeOrders.clear();
    frontSince.clear();
    groundNoted = -1;
    warshipNoted = -1;
}

const FRONT_HOLD_TURNS = 5; // a war front stays this many turns after its leader was last at war with us or a risk
const FRONTS_PER_RISK = 2;  // a war risk's fronts: our settlements nearest to it (within WAR_RISK_DISTANCE; the nearest always)
const fronts = new Map();   // sid -> { settlement: { x, y, name }, leader, turn }

/**
 * Our settlements facing a leader at war with us or a war risk (research/36 §2), where the existing army stands guard
 * before anyone attacks: with a war, those within WAR_NEAR_DISTANCE of its settlements; with a risk, the FRONTS_PER_RISK
 * nearest to it within WAR_RISK_DISTANCE (the nearest always). Its settlements count where we have seen them. A front
 * stays FRONT_HOLD_TURNS after the last turn it was one, so a warning that comes and goes does not march the army back
 * and forth. Game 29: Catherine was a war risk from M36 (absent on M50, back on M51); nothing moved until she declared
 * war at M52, and Куско then had no guard while four went to Антавайлья. Nothing is trained for a front.
 * @returns [{ settlement: { x, y, name }, leader }]
 */
export function warFronts() {
    const ours = ownSettlements();
    const HIDDEN = globalThis.RevealedStates?.HIDDEN ?? 0;
    const atWar = new Set(war.atWar);
    for (const id of [...war.atWar, ...war.risk]) {
        const theirs = (safe(() => Players.get(id).Cities.getCities(), []) ?? [])
            .filter((c) => safe(() => GameplayMap.getRevealedState(pid(), c.location.x, c.location.y), HIDDEN + 1) !== HIDDEN);
        if (theirs.length === 0) continue;
        const near = ours.map((o) => ({ o, d: Math.min(...theirs.map((c) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, o.location.x, o.location.y), Infinity))) }))
            .sort((a, b) => a.d - b.d);
        const pick = atWar.has(id) ? near.filter((x) => x.d <= WAR_NEAR_DISTANCE) : near.filter((x, i) => i === 0 || x.d <= WAR_RISK_DISTANCE).slice(0, FRONTS_PER_RISK);
        for (const { o } of pick) fronts.set(sidOf(o), { settlement: { x: o.location.x, y: o.location.y, name: nameOf(o) }, leader: leaderOf(id), turn: Game.turn });
    }
    const alive = new Set(ours.map(sidOf));
    for (const [k, f] of [...fronts]) if (!alive.has(k) || Game.turn - f.turn > FRONT_HOLD_TURNS) fronts.delete(k);
    return [...fronts.values()].map(({ settlement, leader }) => ({ settlement, leader }));
}

/** With a war risk, a conversion leaves two defenders' price (research/23 D3); it is part of the goal's need (research/24 G1). */
const conversionKeep = () => (war.risk.length > 0 ? 2 * defenderPrice() : 0);

/**
 * Our settlements a war or a war risk calls guards for: with a war, those within WAR_NEAR_DISTANCE of a settlement of
 * that leader, and the nearest one to each leader at war or at risk (research/24 G3: a guard in every settlement,
 * upkeep 112-150 against an income of −38 to 77 in game 9's Modern age). A risk alone asks for that nearest one only
 * (research/30 §2: on game 23's crowded map the ring held 14 to 18 of our 18 settlements; six Tanks, 1,380 production and
 * 90 gold a turn, for a war that never came).
 */
function guardedSettlements() {
    const ours = ownSettlements();
    const near = new Set();
    const atWar = new Set(war.atWar);
    for (const id of [...war.atWar, ...war.risk]) {
        let best = null;
        for (const c of safe(() => Players.get(id).Cities.getCities(), []) ?? []) {
            for (const o of ours) {
                const d = safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, o.location.x, o.location.y), Infinity);
                if (atWar.has(id) && d <= WAR_NEAR_DISTANCE) near.add(sidOf(o));
                if (!best || d < best.d) best = { o, d };
            }
        }
        if (best) near.add(sidOf(best.o));
    }
    return near.size;
}

/** What our best melee defender costs to buy in our biggest settlement (0: unknown). */
function defenderPrice() {
    const city = [...ownSettlements()].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
    const top = bestTrainableMelee();
    if (!city || !(top > 0)) return 0;
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        const s = meleeStrength(def);
        if (!(s > 0) || s > top || (best && s <= best.s)) continue;
        const cost = Number(safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), 0)) || 0;
        if (cost > 0) best = { s, cost };
    }
    return best?.cost ?? 0;
}

// The gold kept back: `reserveTurns` turns of income, at most this (seen in game: 3 turns of a
// late 1,100 income kept 3,300-5,300 gold idle for the whole Modern age).
export const RESERVE_CAP_GOLD = 1000;

// With gold income below zero the reserve covers this many turns of the deficit (seen in game 6:
// with a negative income the reserve was 0, purchases emptied the treasury and it stayed at 0).
export const DEFICIT_RESERVE_TURNS = 10;

/** The empire's gold per turn (net of upkeep). */
export function goldIncome() {
    return Number(safe(() => Players.get(pid()).Stats.getNetYield(YieldTypes.YIELD_GOLD), 0)) || 0;
}

/**
 * Gold purchases leave in the treasury: reserveTurns × income, capped at RESERVE_CAP_GOLD; with a
 * negative income, DEFICIT_RESERVE_TURNS turns of the deficit (same cap).
 */
export function goldReserve(reserveTurns) {
    const income = goldIncome();
    if (income < 0) return Math.min(RESERVE_CAP_GOLD, -income * DEFICIT_RESERVE_TURNS);
    return Math.min(RESERVE_CAP_GOLD, income * Math.max(0, Number(reserveTurns) || 0));
}

// ---- research and civics ----------------------------------------------------------

const ADVISOR_FOR_PROFILE = { SCIENCE: "SCIENCE", CULTURE: "CULTURE", GOLD: "ECONOMIC", GOLD_SCIENCE: "ECONOMIC", PRODUCTION: "ECONOMIC", FOOD: "ECONOMIC", HAPPINESS: "CULTURE", GROWTH_SCIENCE: "SCIENCE", GROWTH_CULTURE: "CULTURE", GROWTH_GOLD: "ECONOMIC" };

/** The advisor's pick, preferring the advisor that matches the chosen priority. */
function pickRecommendation(recs, profileKey) {
    const want = globalThis.AdvisorTypes?.[ADVISOR_FOR_PROFILE[profileKey]];
    if (want !== undefined) {
        const match = recs.find((r) => (r.whichAdvisors ?? []).includes(want));
        if (match) return match;
    }
    return recs[0] ?? null;
}

/**
 * What each available node's next research unlocks (GameInfo.ProgressionTreeNodeUnlocks rows at
 * depth depthUnlocked + 1, as the game's tech chooser reads them; rows that need a trait left
 * out). @returns [{ node, nodeType, name, targets, turns }]
 */
function researchCandidates(holder, available) {
    const out = [];
    for (const node of available) {
        const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(node), null);
        if (!def) continue;
        const data = safe(() => Game.ProgressionTrees.getNode(pid(), node), null);
        // A repeatable node (Future Tech, Future Civic) gives its first unlocks every time (research/21 L2).
        const repeat = def.Repeatable === true || def.Repeatable === "true";
        const next = repeat ? 1 : (Number(data?.depthUnlocked) || 0) + 1;
        const rows = Array.isArray(data?.unlockIndices)
            ? data.unlockIndices.map((i) => GameInfo.ProgressionTreeNodeUnlocks?.[i]).filter(Boolean)
            : (safe(() => GameInfo.ProgressionTreeNodeUnlocks.filter((r) => r.ProgressionTreeNodeType === def.ProgressionTreeNodeType), []) ?? []);
        const targets = rows.filter((r) => (Number(r.UnlockDepth) || 1) === next && !r.RequiredTraitType).map((r) => r.TargetType);
        out.push({ node, nodeType: def.ProgressionTreeNodeType, name: def.Name, targets, repeat, turns: Number(safe(() => holder.getTurnsForNode(node), 99)) });
    }
    return out;
}

/**
 * The path's research not done yet and the way there from what is available now
 * (core/xpl-victory-levers.js researchToward): goals are nodes nobody researched (depth 0) whose
 * first research unlocks something of the path; prerequisites from GameInfo.ProgressionTreePrereqs.
 * @returns { via, goal } or null
 */
/**
 * The trees as research needs them: prerequisites (GameInfo.ProgressionTreePrereqs), what each node's
 * first research unlocks (rows needing a trait left out), and whether a node is researched (memo).
 */
function treeFacts() {
    const prereqs = new Map();
    for (const r of GameInfo.ProgressionTreePrereqs ?? []) {
        if (!prereqs.has(r.Node)) prereqs.set(r.Node, []);
        prereqs.get(r.Node).push(r.PrereqNode);
    }
    const firstUnlocks = new Map();
    for (const r of GameInfo.ProgressionTreeNodeUnlocks ?? []) {
        if ((Number(r.UnlockDepth) || 1) !== 1 || r.RequiredTraitType) continue;
        if (!firstUnlocks.has(r.ProgressionTreeNodeType)) firstUnlocks.set(r.ProgressionTreeNodeType, []);
        firstUnlocks.get(r.ProgressionTreeNodeType).push(r.TargetType);
    }
    const depth = new Map();
    const depthOf = (type) => {
        if (!depth.has(type)) depth.set(type, Number(safe(() => Game.ProgressionTrees.getNode(pid(), type)?.depthUnlocked, 0)) || 0);
        return depth.get(type);
    };
    const researched = (type) => depthOf(type) > 0;
    return { prereqs, firstUnlocks, researched, depthOf };
}

/**
 * The way to the focus's research gates of this age while one is not reached (core gateTargets,
 * research/21 D1: science Antiquity Spherical Earth and Chart the Stars, Exploration the masteries
 * behind Invent Calculus and Heliocentric Model, Modern Rocketry). Each gate is the
 * ProgressionTreeNodeUnlocks row of its target: reached when that node's depthUnlocked reaches the
 * row's UnlockDepth (a mastery: depth 2). The way = the gate nodes (again for a mastery) and their
 * unresearched prerequisites (transitively); the pool = the candidates on it.
 * @returns { goal, goals: Set of node types, pool } or null
 */
function researchGate(focus, candidates) {
    const targets = gateTargets(focus, currentAge());
    if (targets.length === 0) return null;
    const { prereqs, researched, depthOf } = treeFacts();
    // A gate that cannot be researched and built before the age ends is skipped (research/23 S3: game 8,
    // all 45 Exploration turns went toward Invent Calculus, ~25 turns out of reach, and the Heliocentric
    // Model behind the Education mastery was never taken). The final age: the strategy's gateLate.
    const outlook = safe(() => ageOutlook(), null);
    // Not before GATE_ETA_FROM of the age: science grows, early estimates are too long (research/24 P7: Chart the Stars
    // and Literacy «out of reach» at A4 and A7, both done).
    const limit = outlook && !outlook.isFinalAge && Number(outlook.ageFrac) >= GATE_ETA_FROM ? outlook.turnsLeft - GATE_ETA_MARGIN : Infinity;
    const turnsOf = nodeTurns(safe(() => Players.get(pid()).Techs, null));
    let late = 0;
    // One gate at a time, in the listed order (the most Innovation first: Invent Calculus 10 before the
    // Heliocentric Model 5; research/22 A2: game 7 reached Heliocentric first and missed Calculus by a turn).
    for (const target of targets) {
        const row = GameInfo.ProgressionTreeNodeUnlocks?.find((r) => r.TargetType === target && !r.RequiredTraitType);
        if (!row) continue;
        const gate = row.ProgressionTreeNodeType;
        if (depthOf(gate) >= (Number(row.UnlockDepth) || 1)) continue;
        const way = new Set([gate]);
        const stack = [...(prereqs.get(gate) ?? [])];
        while (stack.length > 0) {
            const n = stack.pop();
            if (way.has(n) || researched(n)) continue;
            way.add(n);
            stack.push(...(prereqs.get(n) ?? []));
        }
        if (Number.isFinite(limit)) {
            // The gate node as often as its depth still needs (a mastery not begun: twice), the rest once.
            const again = Math.max(1, (Number(row.UnlockDepth) || 1) - depthOf(gate));
            const eta = [...way].reduce((sum, n) => sum + turnsOf(n) * (n === gate ? again : 1), 0) + projectTurns(target);
            if (eta > limit) {
                late++;
                noteLateGate(target, eta, limit + GATE_ETA_MARGIN);
                continue;
            }
        }
        const pool = (candidates ?? []).filter((c) => way.has(c.nodeType) && (c.nodeType === gate || !researched(c.nodeType)));
        if (pool.length > 0) return { goal: gate, goals: new Set([gate]), pool };
    }
    return late > 0 ? { late: true } : null;
}

const GATE_ETA_MARGIN = 2; // turns kept before the age's end when a gate's research and project are estimated
const GATE_ETA_FROM = 0.25; // no gate is given up before this share of the age
const lateGatesNoted = new Map(); // target -> the turn UI.log said it is out of reach

function noteLateGate(target, eta, left) {
    if (lateGatesNoted.get(target) === Game.turn) return;
    lateGatesNoted.set(target, Game.turn);
    log.info(`research gate: ${target} out of reach this age (about ${Math.round(eta)} turns of research and project, ${left} left)`);
}

/**
 * The turns a node of this tree takes now: its own (getTurnsForNode), else the median of the available
 * ones (5 when unknown). @returns (nodeType) => turns
 */
function nodeTurns(holder) {
    const avail = (safe(() => holder.getAllAvailableNodeTypes(), []) ?? []).map((n) => Number(safe(() => holder.getTurnsForNode(n), NaN))).filter((t) => t > 0).sort((a, b) => a - b);
    const median = avail.length > 0 ? avail[Math.floor(avail.length / 2)] : 5;
    return (type) => {
        const h = safe(() => GameInfo.ProgressionTreeNodes.lookup(type)?.$hash, null);
        const t = h === null ? NaN : Number(safe(() => holder.getTurnsForNode(h), NaN));
        return t > 0 ? t : median;
    };
}

/** Turns our best producing city takes to build this project (0: not a project, or unknown). */
function projectTurns(target) {
    const def = safe(() => GameInfo.Projects.lookup(target), null);
    if (!def) return 0;
    let best = 0;
    for (const c of ownSettlements()) {
        if (c.isTown) continue;
        const prod = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
        const cost = Number(safe(() => c.Production.getProjectProductionCost(def.ProjectType), def.Cost ?? 0)) || 0;
        if (prod > 0 && cost > 0) best = best === 0 ? cost / prod : Math.min(best, cost / prod);
    }
    return best;
}

/**
 * The civics that grant Innovation by themselves (a first unlock *_SCIENCE_VP: Literacy in Antiquity,
 * Social Class in Exploration) and the way to them (research/21 D2): with the science focus the civic
 * tree heads there first. Seen in game 6: they were never wanted research, so nobody went toward
 * Social Class's prerequisites and the civics followed the advisor. @returns { goal, goals: Set, pool } or null
 */
function innovationCivics(candidates) {
    const { prereqs, researched } = treeFacts();
    const treeOf = (node) => String(safe(() => GameInfo.ProgressionTreeNodes.lookup(node)?.ProgressionTree, "") ?? "");
    // Also a civic unlocking an Innovation wonder or a science building, the civilization's own included
    // (research/23 S4: game 8, the Abbasids' Mawla (Madrasa) and Al-Jabr (House of Wisdom) never came; Egypt
    // built the House of Wisdom). Only trees we have: the main one, or one with a node available to us.
    const wonders = innovationWonders();
    const scienceBuilding = (t) => !!GameInfo.TypeTags?.find((r) => r.Type === t && r.Tag === "SCIENCE")
        && safe(() => GameInfo.Constructibles.lookup(t)?.ConstructibleClass, null) === "BUILDING";
    const ours = new Set((candidates ?? []).map((c) => treeOf(c.nodeType)));
    const outlook = safe(() => ageOutlook(), null);
    // Not before GATE_ETA_FROM of the age: science grows, early estimates are too long (research/24 P7: Chart the Stars
    // and Literacy «out of reach» at A4 and A7, both done).
    const limit = outlook && !outlook.isFinalAge && Number(outlook.ageFrac) >= GATE_ETA_FROM ? outlook.turnsLeft - GATE_ETA_MARGIN : Infinity;
    const turnsOf = nodeTurns(safe(() => Players.get(pid()).Culture, null));
    const goals = [];
    const way = new Set();
    // A tree we are in: one of its nodes researched (an ideology's branch is not chosen for a policy).
    const entered = (tree) => !!GameInfo.ProgressionTreeNodes?.find((n) => n.ProgressionTree === tree && researched(n.ProgressionTreeNodeType));
    for (const r of GameInfo.ProgressionTreeNodeUnlocks ?? []) {
        if (r.RequiredTraitType || (Number(r.UnlockDepth) || 1) !== 1) continue;
        const t = r.TargetType ?? "";
        // A policy speeding every project (Public Works: research/38 §4 E3), where no government is required.
        const projectPolicy = PROJECT_PRODUCTION_TRADITIONS.includes(t) && !r.RequiredGovernmentType;
        if (!/_SCIENCE_VP$/.test(t) && !wonders.has(t) && !scienceBuilding(t) && !projectPolicy) continue;
        const node = r.ProgressionTreeNodeType;
        const tree = treeOf(node);
        if (!tree.includes("CIVIC") || !(tree.includes("_MAIN") || ours.has(tree)) || researched(node) || goals.includes(node)) continue;
        if (projectPolicy && !tree.includes("_MAIN") && !entered(tree)) continue;
        // Its way, and whether it can be researched before the age ends (S4: Social Class was 35 turns short).
        const mine = new Set([node]);
        const stack = [...(prereqs.get(node) ?? [])];
        while (stack.length > 0) {
            const n = stack.pop();
            if (mine.has(n) || researched(n)) continue;
            mine.add(n);
            stack.push(...(prereqs.get(n) ?? []));
        }
        const eta = [...mine].reduce((sum, n) => sum + turnsOf(n), 0);
        if (eta > limit) {
            noteLateGate(node, eta, limit + GATE_ETA_MARGIN);
            continue;
        }
        goals.push(node);
        for (const n of mine) way.add(n);
    }
    if (goals.length === 0) return null;
    const pool = (candidates ?? []).filter((c) => way.has(c.nodeType) && !researched(c.nodeType));
    return pool.length > 0 ? { goal: goals[0], goals: new Set(goals), pool } : null;
}

/**
 * The quickest available node on the way to `target` (the target itself or one of its unresearched
 * prerequisites), or null when it is researched or not in this age's tree. @returns { node, nodeType, name } or null
 */
function wayStep(target, holder, available) {
    const { prereqs, researched } = treeFacts();
    if (!GameInfo.ProgressionTreeNodes?.lookup(target) || researched(target)) return null;
    const way = new Set();
    const stack = [target];
    while (stack.length > 0) {
        const n = stack.pop();
        if (way.has(n) || researched(n)) continue;
        way.add(n);
        stack.push(...(prereqs.get(n) ?? []));
    }
    let best = null;
    for (const node of available) {
        const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(node), null);
        if (!def || !way.has(def.ProgressionTreeNodeType)) continue;
        const turns = Number(safe(() => holder.getTurnsForNode(node), 99));
        if (!best || turns < best.turns) best = { node, nodeType: def.ProgressionTreeNodeType, name: def.Name, turns };
    }
    return best;
}

function researchTowardPath(focus, candidates) {
    const { prereqs, firstUnlocks, researched } = treeFacts();
    if (prereqs.size === 0) return null;
    const goals = [];
    for (const def of GameInfo.ProgressionTreeNodes ?? []) {
        const type = def.ProgressionTreeNodeType;
        if (!prereqs.has(type) || !wantedResearch(focus, { nodeType: type, targets: firstUnlocks.get(type) ?? [] })) continue;
        if (!researched(type)) goals.push(type);
    }
    return researchToward(goals, candidates, (t) => prereqs.get(t), researched);
}

/**
 * How many technologies that unlock the path's work are still to research (nodes of a tech tree,
 * depth 0, whose first research is wanted): the economy focus keeps science up until they are in.
 */
export function pathTechsLeft(focus) {
    if (!focus) return 0;
    const firstUnlocks = new Map();
    for (const r of GameInfo.ProgressionTreeNodeUnlocks ?? []) {
        if ((Number(r.UnlockDepth) || 1) !== 1 || r.RequiredTraitType) continue;
        if (!firstUnlocks.has(r.ProgressionTreeNodeType)) firstUnlocks.set(r.ProgressionTreeNodeType, []);
        firstUnlocks.get(r.ProgressionTreeNodeType).push(r.TargetType);
    }
    let n = 0;
    for (const def of GameInfo.ProgressionTreeNodes ?? []) {
        const type = def.ProgressionTreeNodeType;
        if (!String(def.ProgressionTree ?? "").includes("TECH")) continue;
        if (!wantedResearch(focus, { nodeType: type, targets: firstUnlocks.get(type) ?? [] })) continue;
        if ((Number(safe(() => Game.ProgressionTrees.getNode(pid(), type)?.depthUnlocked, 0)) || 0) === 0) n++;
    }
    return n;
}

/**
 * How far research is toward the focus's gate (science: the node unlocking the Launch Pad,
 * Rocketry): the way = the gate and all its prerequisites (GameInfo.ProgressionTreePrereqs,
 * transitively); progress = the share of the way researched. @returns { open: the gate is
 * researched, progress 0..1, goal: node type, known: the gate is in this age's tree }
 */
export function gateState(focus) {
    const { prereqs, firstUnlocks, researched } = treeFacts();
    const def = GameInfo.ProgressionTreeNodes?.find((d) => isGateResearch(focus, firstUnlocks.get(d.ProgressionTreeNodeType)));
    if (!def) return { open: false, progress: 0, goal: null, known: false };
    const goal = def.ProgressionTreeNodeType;
    if (researched(goal)) return { open: true, progress: 1, goal, known: true };
    const way = new Set();
    const stack = [goal];
    while (stack.length > 0) {
        const n = stack.pop();
        if (way.has(n)) continue;
        way.add(n);
        stack.push(...(prereqs.get(n) ?? []));
    }
    const done = [...way].filter(researched).length;
    // Turns to the gate: the nodes left × the turns a node takes now (the median over what is available).
    const holder = safe(() => Players.get(pid()).Techs, null);
    const turns = (safe(() => holder.getAllAvailableNodeTypes(), []) ?? []).map((n) => Number(safe(() => holder.getTurnsForNode(n), NaN))).filter((t) => t > 0).sort((a, b) => a - b);
    const perNode = turns.length > 0 ? turns[Math.floor(turns.length / 2)] : 5;
    return { open: false, progress: way.size > 0 ? done / way.size : 0, goal, known: true, left: way.size - done, eta: (way.size - done) * perNode };
}

/** Is this unlock (a ProgressionTreeNodeUnlocks target) reached: its node researched to its depth? */
function unlockReached(target) {
    const { depthOf } = treeFacts();
    return !!GameInfo.ProgressionTreeNodeUnlocks?.find((r) => r.TargetType === target && !r.RequiredTraitType && depthOf(r.ProgressionTreeNodeType) >= (Number(r.UnlockDepth) || 1));
}

/**
 * This age's science sites (core scienceSites) we may build: one with `needs` once the building itself is unlocked (Flight's
 * Airfield, Radio's Radio Station), its projects counted by the race from the turn their mastery comes (research/38 §4 C1;
 * before, only once a project could start: research/21 D5, an Airfield idle most of game 6's age, which siteHelps now
 * weighs).
 */
function activeSites(pads = null) {
    return scienceSites(currentAge(), { pads }).filter((site) => !site.needs || unlockReached(site.type) || site.needs.some(unlockReached));
}

/** The age's countdown has started and at most 3 points (turns) are left: upgrades and conversions are wasted now. */
export function ageEnding() {
    const apm = safe(() => Game.AgeProgressManager, null);
    if (!apm || !safe(() => apm.ageCountdownStarted, false)) return false;
    // An age with no end on its clock does not end (ageHasEnd: research/31 §1).
    if (!ageHasEnd()) return false;
    const left = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0)) - Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0));
    return left <= 3;
}

/**
 * What the strategy needs to know this pass (core/xpl-strategy.js planStrategy):
 * { age, ageFrac, finalAge, ageEnding, settlements, cap, cities, towns, gate, income, gold }
 */
export function strategyFacts(focus) {
    const stats = safe(() => Players.get(pid()).Stats, null);
    const apm = safe(() => Game.AgeProgressManager, null);
    const points = Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0)) || 0;
    const max = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0)) || 0;
    const all = ownSettlements();
    return {
        age: currentAge(),
        ageFrac: max > 0 ? points / max : 0,
        finalAge: !!safe(() => apm.isFinalAge, false),
        ageEnding: ageEnding(),
        settlements: Number(stats?.numSettlements ?? all.length) || 0,
        cap: Number(stats?.settlementCap) || 0,
        cities: Number(stats?.numCities ?? all.filter((c) => !c.isTown).length) || 0,
        towns: Number(stats?.numTowns ?? all.filter((c) => c.isTown).length) || 0,
        gate: focus ? safe(() => gateState(focus), null) : null,
        turnsLeft: Number(safe(() => ageOutlook().turnsLeft, NaN)),
        income: goldIncome(),
        gold: goldBalance(),
        // Settlements are points for the military victory and the score victory's military place only (research/34 §6).
        settlementsScore: !safe(() => disabledVictories().has("MILITARY"), false) || !!safe(() => scoreVictoryOn(), true),
    };
}

/**
 * Chooses the next technology ("tech") or civic ("culture") when none is being researched.
 * With a victory focus, research that unlocks that path's work comes first (codex masteries,
 * specialist cap, Rail Station, Factory...; core/xpl-victory-levers.js), the quickest of them;
 * when none is available, the way toward the nearest one (researchTowardPath).
 * @returns log entry or null
 */
export function chooseResearch(kind, settings, focus = null) {
    const player = Players.get(pid());
    const holder = kind === "tech" ? player?.Techs : player?.Culture;
    if (!holder) return null;
    const treeType = kind === "tech" ? safe(() => holder.getTreeType(), undefined) : safe(() => holder.getActiveTree(), undefined);
    if (treeType === undefined) return null;
    const tree = safe(() => Game.ProgressionTrees.getTree(pid(), treeType), null);
    const active = tree && tree.activeNodeIndex >= 0 ? tree.nodes?.[tree.activeNodeIndex]?.nodeType : undefined;
    const op = kind === "tech" ? PlayerOperationTypes.SET_TECH_TREE_NODE : PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    // A non-final age's last turns: research the age ends with is lost (the next age has other trees), and a Future Tech or
    // Civic done then also brings the end nearer (+10 age progress). Only what is done in time, while anything is: the
    // research in progress gives way to such a node, and a new pick comes from them (the user, game 41: a third Future Civic
    // about three turns before Antiquity's end, never finished; game 40, Exploration: a second Future Tech).
    const ageLeft = researchAgeLeft();
    const inTime = (n) => {
        if (ageLeft === null) return true;
        const t = Number(safe(() => holder.getTurnsForNode(n), NaN));
        return Number.isFinite(t) && t > 0 && t <= ageLeft - AGE_END_MARGIN;
    };
    const offered = new Set(safe(() => holder.getAllAvailableNodeTypes(), []) ?? []);
    const timely = ageLeft === null ? offered : new Set([...offered].filter((n) => n !== active && inTime(n)));
    // Already researching something: kept, except that a war at our door takes the walls' way at once (research/24
    // W4: game 9 chose Castles at E51, four turns into the war, when a slot came free), and that in an age's last turns
    // research not done in time gives way to a node that is.
    if (active !== undefined && active !== null) {
        if (ageLeft === null || inTime(active) || timely.size === 0) return kind === "tech" && war.near ? safe(() => wallsNow(holder, active, op), null) : null;
        log.info(`research: ${safe(() => GameInfo.ProgressionTreeNodes.lookup(active)?.ProgressionTreeNodeType, active)} is not done before the age ends (${ageLeft} turn(s) left); ${timely.size} node(s) are`);
    }
    const available = timely.size > 0 ? timely : offered;
    if (available.size === 0) return null;
    // Walls under a lasting threat or a war at our door, when their tech is available or one step away
    // (research/23 D7: game 8, 72 turns of `walls: none` in a war; Exploration's walls need Castles).
    if (kind === "tech" && wallsWanted()) {
        const node = safe(() => wallsNode(), null);
        const step = node && wayOf(node).size <= 2 ? wayStep(node, holder, available) : null;
        if (step && safe(() => Game.PlayerOperations.canStart(pid(), op, { ProgressionTreeNodeType: step.node }, false), null)?.Success) {
            Game.PlayerOperations.sendRequest(pid(), op, { ProgressionTreeNodeType: step.node });
            return { key: "TECH_FOR_WALLS", args: [safe(() => Locale.compose(step.name), step.nodeType)] };
        }
    }
    // A war at our door: a stronger melee unit when its node is available or one step away (research/24 W1: game 9's
    // Coursers at 40 met Knights at 45 and Tercios at 42; Heraldry came at E63, sixteen turns into the war). Not for a war
    // risk alone, nor a war far away (research/32 §4: game 27's Antiquity spent six techs on Spearman, Chariot and Horseman
    // against a risk that never came, and missed the Spherical Earth gate by one turn).
    if (war.near) {
        const m = safe(() => meleeNode(), null);
        const step = m ? wayStep(m.node, holder, available) : null;
        if (step && safe(() => Game.PlayerOperations.canStart(pid(), op, { ProgressionTreeNodeType: step.node }, false), null)?.Success) {
            Game.PlayerOperations.sendRequest(pid(), op, { ProgressionTreeNodeType: step.node });
            return { key: "TECH_FOR_MELEE", args: [safe(() => Locale.compose(m.name), m.unitType), safe(() => Locale.compose(step.name), step.nodeType), m.strength] };
        }
    }
    // A settler's only sites lie across rough seas (Exploration): Shipbuilding and the way to it first, any focus
    // (research/22 A1: game 7, a settler stood idle 28 turns until Shipbuilding came by chance).
    if (kind === "tech" && safe(() => seasBlocked(), false)) {
        const step = wayStep("NODE_TECH_EX_SHIPBUILDING", holder, available);
        if (step && safe(() => Game.PlayerOperations.canStart(pid(), op, { ProgressionTreeNodeType: step.node }, false), null)?.Success) {
            Game.PlayerOperations.sendRequest(pid(), op, { ProgressionTreeNodeType: step.node });
            return { key: "TECH_FOR_SETTLERS", args: [safe(() => Locale.compose(step.name), step.nodeType)] };
        }
    }
    // A rival near a dominance win (the strategy's watch): no Future Tech, it advances the age and every
    // rival's multiple falls (research/21 §3.4).
    const candidates = focus ? researchCandidates(holder, available).filter((c) => !(c.repeat && settings?.strategy?.noFutureTech)) : [];
    // Science: a node whose next research unlocks an Innovation wonder is the path's research too (S2).
    if (focus === "SCIENCE") {
        const wonders = innovationWonders();
        for (const c of candidates) if (c.targets.some((t) => wonders.has(t))) c.targets.push(INNOVATION_WONDER);
        // Codices only with somewhere to put them (research/24 P6: 6 codex masteries A33-A56 with no free slot, 5
        // codices archived); the Academy's way stays wanted (a lever building).
        if (safe(() => codexRoom(), 1) <= 0) for (const c of candidates) c.targets = c.targets.filter((t) => !/CODEX/.test(String(t)));
    }
    // A gate of this age not reached yet (science: Spherical Earth / Chart the Stars, the Calculus and
    // Heliocentric masteries, Rocketry): only its way, the path's wanted research on it first.
    // Rocketry cannot come in time (the strategy's gateLate): no gate, the Innovation masteries first
    // (research/22 A2: game 7's Modern gate took 59 turns and shut out 10+ Innovation of masteries).
    // Every gate of this age out of reach (S3): the same, the masteries first.
    const found = focus && !settings?.strategy?.gateLate ? safe(() => researchGate(focus, candidates), null) : null;
    const late = !!settings?.strategy?.gateLate || !!found?.late;
    const gate = found?.late ? null : found;
    const quickest = (list) => [...list].sort((a, b) => (a.turns ?? 99) - (b.turns ?? 99))[0];
    // Modern, no gate before us (Rocketry in, or out of reach): the research that brings Innovation, by Innovation per turn
    // (research/38 §4 C2). A one-off project a mastery opens is wanted only where its site stands or is queued: game 30 took
    // Flight's mastery with no Airfield, and Nuclear Fission, before the 2-point masteries.
    const modernScience = focus === "SCIENCE" && kind === "tech" && !gate && currentAge() === "AGE_MODERN";
    if (modernScience) {
        const sites = oneOffSites();
        for (const c of candidates) c.targets = c.targets.filter((t) => !(t in sites) || sites[t]);
    }
    const innovationTech = modernScience ? safe(() => innovationStep(candidates), null) : null;
    // Innovation civics (Literacy, Social Class: Innovation the moment they are in) and the way to them
    // first (D2): the civic tree does not compete with the technology gates.
    const civics = focus === "SCIENCE" && kind === "culture" ? safe(() => innovationCivics(candidates), null) : null;
    const innovation = civics ? quickest(civics.pool.filter((c) => civics.goals.has(c.nodeType))) ?? null : null;
    const civicWay = civics && !innovation ? { via: quickest(civics.pool), goal: civics.goal } : null;
    const victory = focus && !innovation && !civicWay ? innovationTech ?? (late ? pickBonusResearch(focus, candidates) : null) ?? pickVictoryResearch(focus, gate ? gate.pool : candidates) : null;
    const toward = civicWay ?? (focus && !innovation && !victory
        // On a gate's way: toward the path's nearest wanted research through it (Pottery to Writing's
        // Library, both on the way to Mathematics), else the quickest step.
        ? (gate ? (gate.pool.some((c) => gate.goals.has(c.nodeType)) ? null : safe(() => researchTowardPath(focus, gate.pool), null) ?? { via: quickest(gate.pool), goal: gate.goal }) : safe(() => researchTowardPath(focus, candidates), null))
        : null);
    // Nothing of the path left to research or reach: what grants its victory points by itself.
    const bonus = focus && !innovation && !victory && !toward ? (gate ? gate.pool.find((c) => gate.goals.has(c.nodeType)) ?? null : pickBonusResearch(focus, candidates)) : null;
    const step = innovation ?? victory ?? toward?.via ?? bonus;
    if (step && safe(() => Game.PlayerOperations.canStart(pid(), op, { ProgressionTreeNodeType: step.node }, false), null)?.Success) {
        Game.PlayerOperations.sendRequest(pid(), op, { ProgressionTreeNodeType: step.node });
        const name = (t, fallback) => safe(() => Locale.compose(t), fallback);
        const goal = toward ? safe(() => GameInfo.ProgressionTreeNodes.lookup(toward.goal)?.Name, null) : null;
        const label = toward ? `${name(step.name, step.nodeType)} → ${goal ? name(goal, toward.goal) : toward.goal}` : name(step.name, step.nodeType);
        return { key: kind === "tech" ? "VICTORY_TECH" : "VICTORY_CIVIC", args: [label] };
    }
    const subject = kind === "tech" ? globalThis.AdvisorySubjectTypes?.CHOOSE_TECH : globalThis.AdvisorySubjectTypes?.CHOOSE_CULTURE;
    const recs = safe(() => Players.Advisory.get(pid()).getTreeRecommendations({ playerId: pid(), subject, maxReturnedEntries: 0 }), []) ?? [];
    const toNode = (r) => {
        const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(r.recommendedType), null);
        const node = def ? safe(() => Game.ProgressionTrees.getNode(pid(), def.ProgressionTreeNodeType)?.nodeType, null) : r.recommendedType;
        return available.has(node) ? node : null;
    };
    // Every other technology, civic and mastery before a repeatable node (Future Tech, Future Civic), which waits for nothing:
    // the advisor's among them, else the quickest. Game 40: Future Tech at M45 and M49 with four masteries left. Game 41: Rome's
    // Exploration took Future Civic three times (each one also brings the age's end nearer) while Rome Reborn (1 turn: a
    // tradition slot, +1 settlement cap), Syncretism, Hierarchy and two masteries waited; the advisor named Future Civic. The
    // path's own choices above (a gate, Innovation, the bonus research) still take a repeatable node on purpose.
    const rest = researchCandidates(holder, available).filter((c) => !c.repeat).map((c) => c.node);
    const pool = rest.length > 0 ? new Set(rest) : available;
    const usable = recs.filter((r) => toNode(r) !== null && pool.has(toNode(r)));
    const pick = pickRecommendation(usable, settings.profile);
    // No advice: the quickest available one.
    const nodeType = pick ? toNode(pick) : [...pool].sort((a, b) => (safe(() => holder.getTurnsForNode(a), 99) - safe(() => holder.getTurnsForNode(b), 99)))[0];
    const args = { ProgressionTreeNodeType: nodeType };
    const ok = safe(() => Game.PlayerOperations.canStart(pid(), op, args, false), null);
    if (!ok?.Success) return null;
    Game.PlayerOperations.sendRequest(pid(), op, args);
    const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(nodeType), null);
    return { key: kind === "tech" ? "TECH" : "CIVIC", args: [def?.Name ? Locale.compose(def.Name) : String(nodeType), pick ? "" : "*"] };
}

/**
 * Room for codices (research/24 P6): empty great-work slots in our buildings, plus the slots of lever buildings
 * queued (GameInfo.Constructible_GreatWorks NumSlots), less the works waiting in the archive. ≤ 0: no room.
 */
function codexRoom() {
    let free = 0;
    const queued = new Set();
    for (const city of ownSettlements()) {
        for (const b of safe(() => city.Constructibles.getGreatWorkBuildings(), []) ?? []) {
            free += (b.slots ?? []).filter((s) => s.greatWorkIndex === undefined || s.greatWorkIndex === null || s.greatWorkIndex < 0).length;
        }
        for (const h of queueTypes(city)) queued.add(h);
    }
    for (const r of GameInfo.Constructible_GreatWorks ?? []) {
        const def = safe(() => GameInfo.Constructibles.lookup(r.ConstructibleType), null);
        if (def && queued.has(def.$hash)) free += Number(r.NumSlots) || 1;
    }
    return free - (Number(safe(() => greatWorksWaiting(), 0)) || 0);
}

// ---- production ----------------------------------------------------------------------

/**
 * The tile for a building this city orders or buys (`plots`: the ones the game takes now): the building plan's own tile
 * for it; else, of the tiles the plan leaves free (no other planned building, no wonder it keeps), the one the game rates
 * best (its own placement numbers); else the game's best of all. The game's best for today's yields alone took tiles the
 * plan kept for its quarters and a wonder's neighbours (the victory work, its purchases and goals).
 */
function bestPlotFor(city, typeHash, plots) {
    const data = safe(() => city.Yields.calculateAllBuildingsPlacements(), null);
    const forType = data?.buildings?.find((b) => b.constructibleType === typeHash);
    return pickPlot(city, typeHash, plots, (cands) => {
        let best = null;
        for (const p of forType?.placements ?? []) {
            if (!cands.includes(p.plotID)) continue;
            const total = (p.yieldChanges ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
            if (!best || total > best.total) best = { plot: p.plotID, total };
        }
        return best?.plot ?? cands[0] ?? null;
    });
}

/** The plan's tile, else `best(free tiles)`, else `best(plots)` (bestPlotFor). @returns a plot index or null */
function pickPlot(city, typeHash, plots, best) {
    if (!(plots?.length > 0)) return null;
    const plan = planTiles(city, typeHash);
    if (plan.own !== null && plots.includes(plan.own)) return plan.own;
    const free = plots.filter((i) => !plan.kept.has(i));
    return best(free.length > 0 ? free : plots);
}

/** The building plan's tile for this building in this city (`own`, or null) and the tiles it keeps for anything else. */
function planTiles(city, typeHash) {
    const plans = state.get().results?.plans;
    const type = safe(() => GameInfo.Constructibles.lookup(typeHash)?.ConstructibleType, null);
    const sid = sidOf(city);
    const idxOf = (p) => (Number.isInteger(p.idx) ? p.idx : safe(() => GameplayMap.getIndexFromXY(p.x, p.y), null));
    let own = null;
    const kept = new Set();
    for (const p of [...(plans?.placements ?? []), ...(plans?.fillers ?? []), ...(plans?.anchors ?? [])]) {
        const i = idxOf(p);
        if (i === null || i === undefined) continue;
        if (p.type === type && p.sid === sid) own = i;
        else kept.add(i);
    }
    return { own, kept };
}

/** The advisor's top recommendation the city can start now, as BUILD args. */
/**
 * A unit the advisor recommends is worth building when the autopilot will use it and we do not
 * have enough of that kind yet (seen in game: the advisor's scout in two cities' empty queues
 * turn after turn, 32 scouts): military units below 2 per settlement; scouts and explorers below
 * what trainWantedUnits keeps (2 each); merchants while a trade route is open for one (at most
 * MERCHANTS_AT_ONCE); settlers never (trainWantedUnits keeps them under the settlement cap).
 */
function unitWanted(def, unitOptions) {
    // Soldiers cost upkeep: none of the advisor's while gold income is below zero, nor in peace when the
    // strategy says so (science and economy: research/21 E2).
    if (def.CoreClass === "CORE_CLASS_MILITARY") {
        const peace = (unitOptions.threats ?? []).length === 0;
        // A war risk or a war at our door: soldiers whatever the strategy says (research/23 D3).
        if (peace && unitOptions.strategy?.advisorSoldiers === false && !war.near && war.risk.length === 0) return false;
        return goldIncome() >= 0 && soldierRoom(PEACE_SOLDIERS_PER_SETTLEMENT);
    }
    if (isSettler(def)) return false;
    if (isMerchant(def)) return !!unitOptions.merchants && unitCount(isMerchant) < Math.min(MERCHANTS_AT_ONCE, openTradeRoutes({ profile: unitOptions.profile }));
    if (isExplorer(def)) return !!(unitOptions.explorers ?? unitOptions.explore) && unitCount(isExplorer) < EXPLORERS_WANTED;
    if (isScout(def)) return !!unitOptions.explore && unitCount(isScout) < SCOUTS_WANTED;
    return false;
}

// Military buildings (TypeTag MILITARY): not in peace when the strategy says so (E2). A building tagged PRODUCTION too is a
// production building first: the Modern Military Academy gives +9 Production and Production adjacency for 420, more than an
// Ironworks (+4 for 535), and production first and peace skipped it (the Antiquity Barracks, +3, the same).
const isMilitaryBuilding = (type) => !!GameInfo.TypeTags?.find((t) => t.Type === type && t.Tag === "MILITARY")
    && !GameInfo.TypeTags?.find((t) => t.Type === type && t.Tag === "PRODUCTION");
const skipsMilitaryBuildings = (unitOptions) => unitOptions?.strategy?.militaryBuildings === false && (unitOptions.threats ?? []).length === 0;

/**
 * A space city: the science focus's final push (the strategy's Commit) and the city has or queues a Launch Pad. Its
 * production goes to the pad and Crewed Space Flight Preparation: no plan or advisor buildings (science sites aside; the
 * production buildings that pay for themselves first come from pushVictoryWork), and no units the overlays want. A city
 * the strategy only picks for a pad (padCities) is not one until its pad is queued or bought (research/31 §2: game 26's
 * four pad cities never got a pad, could build nothing else, and ran «Научная инициатива» for 36–75 turns each).
 */
function spaceCity(city, unitOptions) {
    const s = unitOptions?.strategy;
    if (unitOptions?.victory !== "SCIENCE" || s?.phase !== "COMMIT") return false;
    const pad = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD), null);
    return cityHas(city, LAUNCH_PAD) || (!!pad && queueTypes(city).includes(pad.$hash));
}

function advisorOrder(city, unitOptions = {}) {
    const all = safe(() => Players.Advisory.get(pid()).getBuildRecommendations({ cityId: city.id, subject: globalThis.AdvisorySubjectTypes?.PRODUCTION, maxReturnedEntries: 0 }), []) ?? [];
    // The advisor that matches the priority (the victory focus's) first, in the game's order.
    const want = globalThis.AdvisorTypes?.[ADVISOR_FOR_PROFILE[unitOptions.profile]];
    const mine = (r) => want !== undefined && (r.whichAdvisors ?? []).includes(want);
    const recs = [...all.filter(mine), ...all.filter((r) => !mine(r))];
    for (const r of recs) {
        const subject = safe(() => GameInfo.AdvisorySubjects.lookup(r.subject)?.AdvisorySubjectType, null);
        let args = null;
        let name = null;
        // A space city in the final push takes only the advisor's projects (spaceCity).
        if (unitOptions.onlyProjects && subject !== "ADVISORY_SUBJECT_PRODUCE_PROJECTS") continue;
        if (subject === "ADVISORY_SUBJECT_PRODUCE_CONSTRUCTIBLES") {
            const def = GameInfo.Constructibles.lookup(r.recommendedType);
            // Wonders only through chooseWonders (race, wonders at once, one city each): the
            // advisor's were queued unchecked (seen in game: Erdene Zuu queued while a rival was 10
            // short of it; the same temple in two cities at once).
            if (!def || def.ConstructibleClass === "WONDER") continue;
            if (skipsMilitaryBuildings(unitOptions) && isMilitaryBuilding(def.ConstructibleType)) continue;
            const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
            const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
            const plot = plots.length > 0 ? bestPlotFor(city, def.$hash, plots) : null;
            if (plot === null) continue;
            const loc = GameplayMap.getLocationFromIndex(plot);
            args = { ConstructibleType: def.$hash, X: loc.x, Y: loc.y };
            name = def.Name;
        } else if (subject === "ADVISORY_SUBJECT_PRODUCE_PROJECTS") {
            const def = GameInfo.Projects.lookup(r.recommendedType);
            if (!def) continue;
            args = { ProjectType: def.$hash };
            name = def.Name;
        } else if (subject === "ADVISORY_SUBJECT_PRODUCE_UNITS") {
            const def = GameInfo.Units.lookup(r.recommendedType);
            if (!def || !unitWanted(def, unitOptions)) continue;
            args = { UnitType: def.$hash };
            name = def.Name;
        }
        if (!args) continue;
        // `fits`: what the caller takes (fillProduction: done before a non-final age ends).
        if (unitOptions.fits && !unitOptions.fits(args.ConstructibleType ?? args.ProjectType ?? args.UnitType)) continue;
        const ok = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
        if (ok?.Success) return { args, name };
    }
    return null;
}

// ---- victory levers -----------------------------------------------------------------

/**
 * The type hash of a queue entry. The game gives every type field, -1 where it does not apply, so
 * `constructibleType ?? projectType` read -1 for a project or a unit (seen in game: a queued
 * project was never found, so it was requested again every pass — Chart the Stars 22 times,
 * Crewed Space Flight Research 18 — and never moved to the front).
 */
const queueItemType = (q) => [q?.type, q?.constructibleType, q?.projectType, q?.unitType].find((v) => v !== undefined && v !== null && v !== -1) ?? -1;

const queueTypes = (city) => (safe(() => city.BuildQueue.getQueue(), []) ?? []).map(queueItemType);

/**
 * Queue edits within a pass (research/28 §2). The queue a step reads does not show a move or a removal sent earlier in
 * the same pass, so a second edit's positions point at other items. Seen in game 21 (T44): the wonder step moved the
 * Mausoleum of Theodoric from 3 to the front, then the settler step moved "2" to the front, the settler in its own
 * reading and the Library in the game's, and the Library went ahead of the wonder. So within a pass a city's queue is
 * edited (moved, or removed from) once. Types queued in the pass are remembered too, so two steps do not queue the
 * same building (game 21: the cash-out and the refund guard both queued Chicago's Dungeon). The hud opens and closes
 * the pass; tests open their own.
 */
const queuePass = { open: false, edited: new Set(), built: new Map() };
export function beginQueuePass() {
    queuePass.open = true;
    queuePass.edited.clear();
    queuePass.built.clear();
}
export function endQueuePass() {
    queuePass.open = false;
    queuePass.edited.clear();
    queuePass.built.clear();
}
const editedThisPass = (city) => queuePass.open && queuePass.edited.has(sidOf(city));
const noteEdited = (city) => queuePass.open && queuePass.edited.add(sidOf(city));
/** Types queued in this city in this pass (the game's queue does not show them yet). */
const builtThisPass = (city) => (queuePass.open ? queuePass.built.get(sidOf(city)) : null) ?? new Set();
function noteBuilt(city, type) {
    if (!queuePass.open) return;
    const k = sidOf(city);
    if (!queuePass.built.has(k)) queuePass.built.set(k, new Set());
    queuePass.built.get(k).add(type);
}

/** Moves a queue item (CityOperationsParametersValues.MoveTo), once a pass per city. @returns true when sent */
function moveInQueue(city, from, to) {
    const MoveTo = globalThis.CityOperationsParametersValues?.MoveTo;
    if (MoveTo === undefined || from === to || editedThisPass(city)) return false;
    const args = { InsertMode: MoveTo, QueueSourceLocation: from, QueueDestinationLocation: to };
    if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) return false;
    Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
    noteEdited(city);
    return true;
}

/** Removes a queue item (RemoveAt), not after another edit of that city's queue in this pass. @returns true when sent */
function removeFromQueue(city, index) {
    const RemoveAt = globalThis.CityOperationsParametersValues?.RemoveAt;
    if (RemoveAt === undefined || editedThisPass(city)) return false;
    const args = { InsertMode: RemoveAt, QueueLocation: index };
    if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) return false;
    Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
    noteEdited(city);
    return true;
}

/**
 * The first queue position an item may be moved to: behind the item in production when that one
 * has progress. The game gives a preempted item's progress to whatever takes its place, drops
 * what exceeds that item's cost, and the preempted item starts over (seen in game,
 * CityBuildQueue.csv: the Pyramids at 136 of 137 turned into a 49-cost Market; units moved ahead
 * did not take a wonder's progress, but the rule covers every move). The game's city banner reads
 * progress the same way.
 */
function frontSlot(city) {
    // An item the game does not complete loses nothing behind another (stuckHeadSince, game 33).
    if (stuckHeadSince(city) !== null) return 0;
    const progress = currentProgress(city);
    if (progress === 0) return 0;
    // Only overflow from the item before (no more than one turn of the city's production): moving
    // something ahead loses at most that (research/23 E1: game 8, settlers waited 19 turns behind buildings
    // holding 2-11 production of overflow, a defender 7 turns behind a University's 35).
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    return progress !== null && prod > 0 && progress <= prod ? 0 : 1;
}

/**
 * The production already in the item this city produces: getPercentComplete (0-100, as the city banner's
 * progress ring reads it) × its cost (Production.getConstructibleProductionCost / getProjectProductionCost /
 * getUnitProductionCost). 0 with none; null when the cost is unknown.
 */
function currentProgress(city) {
    const q = city.BuildQueue;
    const h = safe(() => q.currentProductionTypeHash, null);
    const pct = Number(safe(() => q.getPercentComplete(h), 0)) || 0;
    if (!(pct > 0)) return 0;
    const P = city.Production;
    const c = safe(() => GameInfo.Constructibles.lookup(h), null);
    const p = c ? null : safe(() => GameInfo.Projects.lookup(h), null);
    const u = c || p ? null : safe(() => GameInfo.Units.lookup(h), null);
    const cost = Number(c ? safe(() => P.getConstructibleProductionCost(c.ConstructibleType), NaN)
        : p ? safe(() => P.getProjectProductionCost(p.ProjectType), NaN)
            : u ? safe(() => P.getUnitProductionCost(u.UnitType), NaN) : NaN);
    return Number.isFinite(cost) && cost > 0 ? (pct / 100) * cost : null;
}

const wonderOrProject = (h) => !!safe(() => GameInfo.Projects.lookup(h), null)
    || safe(() => GameInfo.Constructibles.lookup(h)?.ConstructibleClass, null) === "WONDER";

/**
 * The first queue position a unit may be moved to: the very front even ahead of a wonder or a
 * project in production, else frontSlot. Seen in game (CityBuildQueue.csv): a settler and a
 * slinger moved ahead of a wonder did not take its progress, and the wonder resumed; a building
 * moved ahead took it. Projects are not constructibles either, so they are taken to keep their
 * progress like wonders (inferred; check CityBuildQueue.csv). Seen in game: the capital's
 * settlers waited 7–12 turns at a time behind wonders and Chart the Stars / Spherical Earth, and
 * the empire had 1 city for 57 turns of Antiquity.
 */
function unitSlot(city, aheadOfWonders = true) {
    if (!frontSlot(city)) return 0;
    // The strategy may keep units behind a wonder or project in production (research/21 E1: in
    // Build-up and the final push only defenders under threat overtake one).
    if (!aheadOfWonders) return 1;
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const constructible = safe(() => GameInfo.Constructibles.lookup(h), null);
    if (constructible) return constructible.ConstructibleClass === "WONDER" ? 0 : 1;
    return safe(() => GameInfo.Projects.lookup(h), null) ? 0 : 1;
}

/** May units overtake a wonder or project in production (no strategy: yes; else the strategy's word)? */
const unitsMayOvertake = (unitOptions) => unitOptions?.strategy?.unitsAheadOfWonders !== false;

/** Turns before this city's queue could start a new unit without losing progress (unitSlot). */
const turnsUntilFree = (city, aheadOfWonders = true) => (unitSlot(city, aheadOfWonders) ? Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0 : 0);

/**
 * The first queue position a lever building of the path may be moved to: frontSlot, and also behind
 * a wonder just started (0%) at the front (research/21 E1; seen in game 6: Oxford never started,
 * because the levers were moved ahead of it every pass).
 */
function leverSlot(city) {
    if (frontSlot(city)) return 1;
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    return safe(() => GameInfo.Constructibles.lookup(h)?.ConstructibleClass, null) === "WONDER" && queueTypes(city).length > 1 ? 1 : 0;
}

/**
 * Moves the item of this type to the front of the city's queue (CityOperationsParametersValues.MoveTo):
 * behind the item in production when it has progress (frontSlot) and behind the repairs already
 * there (repairs come first, repairBuildings).
 */
function toFront(city, hash, slot = null, { behind = null } = {}) {
    const types = queueTypes(city);
    const i = types.findIndex((t) => t === hash);
    // Never an item the game does not complete back to the front (stuckHeadSince).
    if (i <= 0 || isStuck(city, hash)) return false;
    const repairs = new Set(damagedOf(city).map((d) => d.def.$hash));
    let to = slot ?? frontSlot(city);
    // Never ahead of what `behind` names, wherever it stands before the item (a lever: a queued wonder or project; the
    // victory work: an item of the same or a higher rank, research/32 §2).
    if (behind) {
        for (let j = i - 1; j >= to; j--) {
            if (!behind(types[j]) || isStuck(city, types[j])) continue;
            to = j + 1;
            break;
        }
    }
    // Behind repairs, never ahead of a queued unit (H1: a wanted settler or defender moved there), nor of walls at the
    // front (a threatened settlement's: wallsSlot).
    const isUnit = (h) => !!safe(() => GameInfo.Units.lookup(h), null);
    while (to < i && (repairs.has(types[to]) || isUnit(types[to]) || isWallsType(types[to]))) to++;
    if (to >= i) return false;
    return moveInQueue(city, i, to);
}

/**
 * Where a queued Launch Pad goes (research/38 §4 B2: games 30 and 31 started their pads 2-8 turns after Rocketry, behind a
 * Cannery, a Laboratory, City Parks begun just before it): the very front, ahead of a plain building with progress (root
 * gotcha 20: the building keeps its own). Not ahead of a wonder, a project, a unit, walls or another science site in
 * production, nor of an item done this turn; behind repairs (toFront) and the production-first buildings (their rank).
 */
function padSlot(city) {
    const slot = frontSlot(city);
    if (slot === 0) return 0;
    const left = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    if (left > 0 && left <= 1) return slot;
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const front = safe(() => GameInfo.Constructibles.lookup(h), null);
    if (front?.ConstructibleClass !== "BUILDING" || isWallsType(h)) return slot;
    if (siteIn(city, front.ConstructibleType)) return slot;
    return 0;
}

/** Walls: a FORTIFICATION-tagged building (any civilization's). */
function isWallsType(h) {
    const c = safe(() => GameInfo.Constructibles.lookup(h), null);
    if (c?.ConstructibleClass !== "BUILDING") return false;
    return !!GameInfo.TypeTags?.find((t) => t.Type === c.ConstructibleType && t.Tag === "FORTIFICATION");
}

/**
 * Where a threatened settlement's walls go (the user, game 27: Ханькоу's walls waited 10 turns behind a Laboratory with
 * progress and were done the turn its centre fell): the very front, ahead of an item in production with progress (root
 * gotcha 20: an item moved ahead started from its own production and the item behind kept its own, 11 cases of 12). Not
 * ahead of an item done this turn; nor, unless the centre is damaged or a war is at our door, of a wonder in a race or a
 * one-off science project that would then miss the age (holdsFront, with the walls' own turns). Behind repairs and a
 * unit at the front (toFront).
 */
function wallsSlot(city, threat, def) {
    const slot = frontSlot(city);
    if (slot === 0) return 0;
    const left = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    if (left > 0 && left <= 1) return slot;
    if (threat?.damaged || war.near) return 0;
    const turns = itemTurns(city, def.$hash);
    return safe(() => holdsFront(city, null, Number.isFinite(turns) ? turns : 99), false) ? slot : 0;
}

/**
 * Where a one-off project may go in this city's queue: behind an item with progress (frontSlot), unless
 * waiting would make it miss the age's end while it alone would make it: then the very front (research/22
 * A3: game 7 missed Invent Calculus by 19 production behind a Hospital; the progress the project takes over
 * is not lost to us, the item in front would not finish this age either).
 */
function projectSlot(city, def) {
    const slot = frontSlot(city);
    if (slot === 0) return 0;
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const front = safe(() => GameInfo.Constructibles.lookup(h), null);
    // Ahead of a plain building with progress: nothing is lost either way (the project takes its progress, or the
    // building keeps it; research/24 P3: a Kiln queued the turn before kept the Heliocentric Model back E60-E63). Not
    // ahead of a science site (a Launch Pad, an Airfield): the projects need it.
    const site = !!front && siteIn(city, front.ConstructibleType);
    if (front?.ConstructibleClass === "BUILDING" && !site) return noteProjectSlot(city, def, 0, `ahead of ${front.ConstructibleType}`);
    const outlook = safe(() => ageOutlook(), null);
    if (!outlook || outlook.isFinalAge) return noteProjectSlot(city, def, slot, "final age");
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const cost = Number(safe(() => city.Production.getProjectProductionCost(def.ProjectType), def.Cost ?? 0)) || 0;
    if (!(prod > 0) || !(cost > 0)) return slot;
    const own = cost / prod;
    const behind = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    const to = behind + own > outlook.turnsLeft && own <= outlook.turnsLeft ? 0 : slot;
    return noteProjectSlot(city, def, to, `behind ${safe(() => (front ?? GameInfo.Projects.lookup(h) ?? GameInfo.Units.lookup(h))?.Name, "?")} ${behind}t, own ${Math.ceil(own)}t, age ${outlook.turnsLeft}t`);
}

const projectSlotsNoted = new Map(); // "city|project" -> the turn UI.log gave projectSlot's verdict

/** UI.log once a turn per city and project: where projectSlot puts it and why (research/24 P3). @returns slot */
function noteProjectSlot(city, def, slot, why) {
    const k = `${sidOf(city)}|${def.ProjectType}`;
    if (projectSlotsNoted.get(k) !== Game.turn) {
        projectSlotsNoted.set(k, Game.turn);
        log.info(`queue: project ${def.ProjectType} in ${nameOf(city)}: slot ${slot} (${why})`);
    }
    return slot;
}

/** Would this city build the site and then run its first project before the age (the game) ends? */
function siteFitsAge(city, def, site, { bought = false } = {}) {
    const left = Number(safe(() => ageOutlook().turnsLeft, Infinity));
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    if (!(prod > 0)) return false;
    // The project it is for (`projects`, else the ones it waits for: `needs`); `bought`: the site is there at once.
    const project = (site.projects ?? site.needs ?? []).map((t) => safe(() => GameInfo.Projects.lookup(t), null)).find(Boolean);
    const cost = project ? Number(safe(() => city.Production.getProjectProductionCost(project.ProjectType), project.Cost ?? 0)) || 0 : 0;
    return (bought ? 0 : buildTurns(city, def)) + cost / prod <= left - 1;
}

/** Turns this city would take to build this (the game's estimate, else cost / production). */
function buildTurns(city, def) {
    const t = Number(safe(() => city.BuildQueue.getTurnsLeft(def.ConstructibleType), -1));
    if (t > 0) return t;
    const cost = Number(safe(() => city.Production.getConstructibleProductionCost(def.ConstructibleType), def.Cost ?? 0)) || 0;
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    return prod > 0 ? Math.ceil(cost / prod) : Infinity;
}

// The path's buildings are queued and moved ahead only where they are built within LEVER_MAX_TURNS, and in the final
// age with LEVER_PAYBACK_TURNS left to pay (game 16: Laboratories and Schoolhouses took 25-36 turns in weak cities,
// some finished in the game's last turns).
const LEVER_MAX_TURNS = 12;
const LEVER_PAYBACK_TURNS = 10;

/** Is this lever building built soon enough in this city to be queued and moved ahead? */
function leverSoon(city, def) {
    const t = buildTurns(city, def);
    if (!(t <= LEVER_MAX_TURNS)) return false;
    // A non-final age: done before it ends (its progress is lost at the age change: game 22, three Universities).
    const left = ageEndTurns();
    if (left !== null && t > left - AGE_END_MARGIN) return false;
    const o = safe(() => ageOutlook(), null);
    return !(o?.isFinalAge && t > Number(o.turnsLeft) - LEVER_PAYBACK_TURNS);
}

/** Does this city have this building finished (a damaged one too: it is repaired, not built again)? (the buildings on its tiles) */
function cityHas(city, type) {
    for (const idx of safe(() => city.getPurchasedPlots(), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        for (const id of loc ? safe(() => MapConstructibles.getHiddenFilteredConstructibles(loc.x, loc.y), []) ?? [] : []) {
            const c = safe(() => Constructibles.getByComponentID(id), null);
            if (c && c.complete !== false && safe(() => GameInfo.Constructibles.lookup(c.type)?.ConstructibleType, null) === type) return true;
        }
    }
    return false;
}

// The order of the victory work in a city's queue (research/32 §2), the most important first; fractions order the items of
// one kind by their lists (the projects, the sites, the path's buildings).
export const VICTORY_RANK = Object.freeze({ FIRST: 0, PAD: 1, PREP: 2, ONE_OFF: 3, SITE: 4, LEVER: 5 });

/**
 * (city, hash) -> that item's rank in the victory work (VICTORY_RANK), or null for anything else. `levers`: the path's
 * buildings; `nextOneOff`: sid -> the one-off that runs ahead of Preparation there (oneOffNext), ranked between the
 * Launch Pad and Preparation.
 */
function victoryRanks(levers, nextOneOff = new Map()) {
    const R = VICTORY_RANK;
    const hashOf = (t) => safe(() => GameInfo.Constructibles.lookup(t)?.$hash, null);
    const pad = hashOf(LAUNCH_PAD);
    const sites = new Map(scienceSites(currentAge()).filter((x) => x.type !== LAUNCH_PAD).map((x, i) => [hashOf(x.type), R.SITE + i / 100]));
    const projects = [...SCIENCE_PROJECTS, ...STANDING_SITE_PROJECTS];
    const leverRank = new Map(levers.map((d, i) => [d.$hash, R.LEVER + i / 100]));
    return (c, t) => {
        if (firstWork.get(sidOf(c))?.has(t)) return R.FIRST;
        if (pad !== null && t === pad) return R.PAD;
        const p = safe(() => GameInfo.Projects.lookup(t), null);
        if (p) {
            if (REPEATABLE_PROJECTS.has(p.ProjectType)) return R.PREP;
            if (nextOneOff.get(sidOf(c)) === p.ProjectType) return R.PREP - 0.5;
            const i = projects.indexOf(p.ProjectType);
            return i < 0 ? null : R.ONE_OFF + i / 100;
        }
        return sites.get(t) ?? leverRank.get(t) ?? null;
    };
}

/**
 * Is this building a science site for this city? The Airfield and the Radio Station are only where no Launch Pad stands
 * or is queued (research/32 §3, 38 C1): there Crewed Space Flight Preparation brings more Innovation, and the Radio
 * Telescope never runs. Game 34: Бирмингем's Launch Satellite and Preparation and Ньюкасл's Preparation waited 6-7 turns
 * behind Radio Stations the plan had queued before their pads (a project never passes a science site in production).
 */
function siteIn(city, type) {
    if (!scienceSites(currentAge()).some((x) => x.type === type)) return false;
    return type === LAUNCH_PAD || !padIn(city);
}

/** Does this city have a Launch Pad, standing or queued? */
function padIn(city) {
    const pad = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD)?.$hash, null);
    return cityHas(city, LAUNCH_PAD) || (pad !== null && queueTypes(city).includes(pad));
}

/**
 * The victory focus's own work, ahead of everything else in a city's queue (behind repairs), in one order (VICTORY_RANK):
 * production first, the Launch Pad, Crewed Space Flight Preparation, the one-off projects, the other science sites (the
 * Airfield), the path's buildings. The most important moves first, and a move never passes an item of the same or a higher
 * rank, so the moves settle (research/32 §2). A city's queue is edited once a pass (root gotcha 54); items that each went
 * "to the front", least important first, took turns there: game 27's capital had its Airfield and Launch Pad trade places
 * every pass, built the Airfield first because it was next when the Radio Station was done, and ran its projects in no set
 * order.
 *  - science: the buildings its projects need in their own city (scienceSites: Launch Pads in the 3 best producing
 *    cities, the first always, the others only where they finish within SITE_MAX_TURNS, else bought by buyVictoryWork; a
 *    Launch Pad the gold would buy later than its city builds it is built: buildRatherThanBuy, research/31 §2). The Airfield
 *    goes only to a city without a Launch Pad (research/32 §3): there Preparation gives 15 Innovation for 1000 production,
 *    while the Airfield and its two flights give 10 for 1861;
 *  - then each project that earns Innovation and that a city may start now:
 *    - Preparation (15 Innovation, repeatable, only in a city with its own Launch Pad; the victory needs 100) in every city
 *      that may start it;
 *    - a one-off in the city that finishes it soonest (the one-offs queued there before it counted), never where
 *      Preparation runs (it would wait behind every run), one at a time;
 *    - the Radio Telescope only where a Radio Station already stands and no Launch Pad's preparation would wait for it;
 *  - the path's buildings of this age in every city that can build them (leverBuildings: Library and Academy for codices,
 *    University, Schoolhouse and Laboratory; Market and Lighthouse for resource slots, Rail Station, Port and Factory for
 *    the rail network and factory resources); the first of them in a city's queue goes to the front.
 * The cities that are to run space work put the production buildings that pay for themselves first (productionFirstStep).
 * Queued with the production list's requests (BUILD {ProjectType} / {ConstructibleType, X, Y}) and moved to the front.
 * @returns log entries
 */
export function pushVictoryWork(focus, { settlers = false, pads = null, queued = null, strategy = null } = {}) {
    const out = [];
    // What this step queued, per city (fillProduction's isEmpty is stale until the game handles it: H2).
    const note = (city, hash) => {
        if (!queued) return;
        if (!queued.has(sidOf(city))) queued.set(sidOf(city), new Set());
        queued.get(sidOf(city)).add(hash);
    };
    const production = (c) => Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const cities = ownSettlements().filter((c) => !c.isTown).sort((a, b) => production(b) - production(a));
    const queuedAnywhere = (hash) => cities.some((c) => queueTypes(c).includes(hash));
    // Science: the cities running space work put the production buildings that pay for themselves first; their move is
    // the city's queue edit of this pass, and nothing of the victory work moves ahead of them (research/31 §2.4).
    if (focus === "SCIENCE") productionFirstStep(cities, out, note, strategy);
    const levers = leverBuildings(focus, currentAge()).map((t) => safe(() => GameInfo.Constructibles.lookup(t), null)).filter(Boolean);
    const nextOneOff = new Map(); // sid -> a one-off that runs ahead of Preparation there (oneOffNext)
    const rankOf = victoryRanks(levers, nextOneOff);
    // A move of this item never passes an item of the same or a higher rank, nor what `also` names.
    const behindOwn = (c, hash, also = null) => {
        const own = rankOf(c, hash);
        return (t) => {
            const r = rankOf(c, t);
            return (own !== null && r !== null && r <= own) || !!also?.(t);
        };
    };
    const placeable = (city, def) => {
        // Never one the city has: the game offers a damaged one as its repair, which repairBuildings buys or queues (game 32,
        // E64: Liverpool's University was repaired with gold, the same pass ordered it again, the game refused, and the
        // empty queue held the turn).
        if (cityHas(city, def.ConstructibleType)) return null;
        const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
        if (!probe?.Success || probe.InQueue || probe.InProgress || probe.RepairDamaged) return null;
        const plots = [...(probe.Plots ?? []), ...(probe.ExpandUrbanPlots ?? [])];
        return plots.length > 0 ? plots : null;
    };
    const place = (city, def, { front = true } = {}) => {
        const plots = placeable(city, def);
        if (!plots) return false;
        const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(city, def.$hash, plots) ?? plots[0]), null);
        if (!loc) return false;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash, X: loc.x, Y: loc.y });
        note(city, def.$hash);
        if (front) toFront(city, def.$hash, null, { behind: behindOwn(city, def.$hash) });
        out.push({ key: "VICTORY_WORK", args: [nameOf(city), safe(() => Locale.compose(def.Name), def.ConstructibleType)] });
        return true;
    };
    if (focus === "SCIENCE") {
        // A factory resource that gives science (Modern Tea: +3% Science per slotted Tea, player-wide) needs a
        // Factory to be slotted: one in the best producing city while none stands or is queued (research/21 L7).
        const factory = safe(() => GameInfo.Constructibles.lookup("BUILDING_FACTORY"), null);
        if (factory && ownsScienceFactoryResource() && !cities.some((c) => cityHas(c, "BUILDING_FACTORY") || queueTypes(c).includes(factory.$hash))) {
            for (const c of cities) if (place(c, factory, { front: false })) break;
        }
        // The final age ends the game: a site only where it and its project are done before then (research/30 §3: game 23
        // ended with six Launch Pads unfinished, and an Airfield done with no time left for its projects).
        const finalAge = !!safe(() => ageOutlook().isFinalAge, false);
        const padsPlaced = new Set(); // cities given a Launch Pad this pass (their queue does not show it yet)
        const hasPad = (c) => padsPlaced.has(sidOf(c)) || padIn(c);
        const toBuy = { n: 0 };       // Launch Pads left for gold this pass, in turn (buildRatherThanBuy)
        // The sites cities get this pass (spaceRace's `extra`), and one more about to be ordered.
        const extras = (c = null, type = null) => {
            const m = new Map([...padsPlaced].map((sid) => [sid, new Set([LAUNCH_PAD])]));
            if (c) m.set(sidOf(c), new Set([...(m.get(sidOf(c)) ?? []), type]));
            return m;
        };
        // A city about to start space work first queues the production buildings that pay for themselves before it
        // (productionFirstIn): queued after the site, they stayed behind it once it had progress (a 40-turn Launch Pad
        // started first, its Ironworks queued the next turn and kept behind it for 40 turns).
        const placeSite = (c, def, site, { needed = false } = {}) => {
            if (!placeable(c, def)) return false;
            // Beyond the victory's own Launch Pad, only a site that brings the goal sooner (siteHelps).
            if (!needed && !siteHelps(cities, c, site.type, extras())) return false;
            if (!spaceWorkIn(c)) productionFirstIn(c, costIn(c, site.type) + spaceWork(spaceRace(cities, extras(c, site.type)), sidOf(c)), out, note);
            return place(c, def);
        };
        // The buildings projects need in their own city, the Launch Pad first.
        for (const site of activeSites(pads)) {
            const def = safe(() => GameInfo.Constructibles.lookup(site.type), null);
            if (!def) continue;
            const pad = site.type === LAUNCH_PAD;
            const holders = cities.filter((c) => queueTypes(c).includes(def.$hash) || cityHas(c, site.type));
            // One queued that no longer fits is not pushed ahead (the age-end step would move it back: ageEndOrder). A Launch
            // Pad goes ahead of a plain building with progress (padSlot), with a UI.log probe of gotcha 20's rule.
            for (const c of holders) {
                if (finalAge && !cityHas(c, site.type) && !siteFitsAge(c, def, site)) continue;
                const slot = pad ? padSlot(c) : null;
                const kept = slot === 0 && frontSlot(c) ? { item: typeNameOf(safe(() => c.BuildQueue.currentProductionTypeHash, null)), production: Math.round(Number(currentProgress(c)) || 0) } : null;
                if (toFront(c, def.$hash, slot, { behind: behindOwn(c, def.$hash) }) && kept) {
                    log.info(`queue: ${nameOf(c)}: ${LAUNCH_PAD} moved ahead of ${kept.item} with ${kept.production} production in it (research/38 B2; CityBuildQueue.csv shows whether it keeps it)`);
                }
            }
            // The other sites (the Airfield) only in a city without a Launch Pad; one in a Launch Pad's city does not count,
            // its flights never run there (Preparation comes first: research/32 §3).
            const order = pad ? cities : cities.filter((c) => !hasPad(c));
            let n = pad ? holders.length : holders.filter((c) => !hasPad(c)).length;
            for (const c of order) {
                if (n >= site.cities) break;
                if (holders.includes(c)) continue;
                // Past the ones always wanted: only where it is done soon, else bought (buyVictoryWork); a Launch Pad the gold
                // would buy later than the city builds it is built (buildRatherThanBuy).
                if (n >= (site.always ?? site.cities) && buildTurns(c, def) > SITE_MAX_TURNS && !(pad && buildRatherThanBuy(c, def, toBuy))) continue;
                if (finalAge && !siteFitsAge(c, def, site)) continue;
                if (placeSite(c, def, site, { needed: pad && n < (site.always ?? 0) })) {
                    n++;
                    if (pad) padsPlaced.add(sidOf(c));
                }
            }
            // None anywhere and no city builds it soon: the best producer anyway, when it is built within SLOW_PAD_MAX_TURNS
            // and it and its project fit the age (research/24 P1: game 9's Airfield was never built nor bought).
            if (n === 0 && site.needs) {
                for (const c of order) {
                    if (buildTurns(c, def) > SLOW_PAD_MAX_TURNS || !siteFitsAge(c, def, site)) continue;
                    if (placeSite(c, def, site)) break;
                }
            }
        }
        // Then the projects: a one-off that closes the gap sooner where it should (below), Preparation, then the one-offs
        // (VICTORY_RANK).
        const turnsLeft = Number(safe(() => ageOutlook().turnsLeft, Infinity));
        // A repeatable one only where a run is done before the age ends (the final age's: research/30 §3).
        const runInTime = (c, type, def) => {
            const prod = production(c);
            const cost = Number(safe(() => c.Production.getProjectProductionCost(type), def.Cost ?? 0)) || 0;
            return prod > 0 && cost / prod <= turnsLeft - AGE_END_MARGIN;
        };
        const mayStart = (c, def) => {
            const r = safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { ProjectType: def.$hash }, false), null);
            return !!r?.Success && !r.InProgress && !r.InQueue;
        };
        // Near the goal a one-off may close the gap sooner than Preparation in a Launch Pad's city: at 95 of 100 Innovation,
        // Launch Satellite's 5 come in half the time of Preparation's 15, and once Preparation stood first it never ran
        // (research/32 §3). Decided on the race as it stands, city by city (oneOffNext; a tie keeps Preparation first).
        const race = spaceRace(cities, extras());
        noteRace(race);
        if (race && race.need > 0) {
            for (const type of SCIENCE_PROJECTS) {
                const def = REPEATABLE_PROJECTS.has(type) ? null : safe(() => GameInfo.Projects.lookup(type), null);
                if (!def) continue;
                // Where it is queued already (its place there is weighed again), else wherever it may start.
                const holders = cities.filter((c) => queueTypes(c).includes(def.$hash));
                for (const c of holders.length > 0 ? holders : cities.filter((x) => mayStart(x, def))) {
                    const m = race.cities.find((x) => x.id === sidOf(c));
                    if (!m?.repeat || nextOneOff.has(m.id)) continue;
                    const i = m.runs.findIndex((r) => r.key === type);
                    if (i >= 0 && i < m.lock) continue; // under way
                    const run = i >= 0 ? m.runs.splice(i, 1)[0] : projectRun(c, def);
                    if (run && oneOffNext(race, m.id, run, m.lock).next) {
                        nextOneOff.set(m.id, type);
                        m.runs.splice(m.lock, 0, run);
                        log.info(`victory work: ${type} ahead of Crewed Space Flight Preparation in ${nameOf(c)}: ${race.need} Innovation still needed`);
                        break;
                    }
                    if (i >= 0) m.runs.splice(i, 0, run);
                }
            }
        }
        // Cities running Preparation: no one-off goes there, it would wait behind every run (research/32 §3: game 27's
        // capital ran Trans-Oceanic Flight and Launch Satellite, 1000 production for 10 Innovation; Preparation gives 15),
        // but the one ahead of it (nextOneOff).
        const prepCities = new Set();
        const first = [...new Set(nextOneOff.values())];
        for (const type of [...first, ...[...SCIENCE_PROJECTS, ...STANDING_SITE_PROJECTS].filter((t) => !first.includes(t))]) {
            const def = safe(() => GameInfo.Projects.lookup(type), null);
            if (!def) continue;
            const repeat = REPEATABLE_PROJECTS.has(type);
            const standing = STANDING_SITE_PROJECTS.includes(type);
            if (!repeat && queuedAnywhere(def.$hash)) {
                for (const c of cities) if (queueTypes(c).includes(def.$hash)) toFront(c, def.$hash, projectSlot(c, def), { behind: behindOwn(c, def.$hash) });
                continue;
            }
            const start = (c) => {
                Game.CityOperations.sendRequest(c.id, CityOperationTypes.BUILD, { ProjectType: def.$hash });
                note(c, def.$hash);
                toFront(c, def.$hash, null, { behind: behindOwn(c, def.$hash) });
                out.push({ key: "VICTORY_WORK", args: [nameOf(c), safe(() => Locale.compose(def.Name), type)] });
            };
            const may = (c) => mayStart(c, def);
            // A one-off that runs ahead of Preparation (above): queued first, so it stands ahead of the next run.
            const ahead = cities.find((c) => nextOneOff.get(sidOf(c)) === type);
            if (ahead) {
                start(ahead);
                continue;
            }
            if (repeat) {
                for (const c of cities) {
                    // Ahead of a plain building with progress too, like the one-off projects (game 11: Лянчжоу's
                    // Launch Pad overflow went into a Cannery, and Crewed Space Flight Preparation waited 9 turns behind it).
                    if (queueTypes(c).includes(def.$hash)) {
                        toFront(c, def.$hash, projectSlot(c, def), { behind: behindOwn(c, def.$hash) });
                        prepCities.add(sidOf(c));
                    } else if (may(c) && runInTime(c, type, def)) {
                        start(c);
                        prepCities.add(sidOf(c));
                    }
                }
                continue;
            }
            // A one-off: the city that finishes it soonest (research/21 D3), its cost over its production
            // plus the turns left of an item with progress it would wait behind (frontSlot); not simply
            // the best producer (seen in game 6: a project waited 8 turns behind a Market in the capital).
            // The one-offs already queued there count too: the next goes to another city that may run it when that
            // finishes it sooner (research/31 §2: game 26's three one-offs, 17 turns each, all in one city).
            let best = null;
            for (const c of cities) {
                if (!may(c) || prepCities.has(sidOf(c))) continue;
                // The Radio Telescope only where no Launch Pad's preparation (15 Innovation for 2000) would wait for it.
                if (standing && hasPad(c)) continue;
                const prod = production(c);
                if (!(prod > 0)) continue;
                const cost = Number(safe(() => c.Production.getProjectProductionCost(type), def.Cost ?? 0)) || 0;
                const behind = (frontSlot(c) ? Number(safe(() => c.BuildQueue.currentTurnsLeft, 0)) || 0 : 0) + queuedOneOffTurns(c, prod);
                const finish = behind + cost / prod;
                if (standing && finish > STANDING_PROJECT_MAX_TURNS) continue;
                if (!best || finish < best.finish) best = { c, finish };
            }
            // Not when even the soonest would not finish before the age ends: its production would be lost (research/24:
            // Spherical Earth queued out of reach, 76 production lost).
            const ageLeft = Number(safe(() => ageOutlook().turnsLeft, Infinity));
            if (best && best.finish > ageLeft) {
                log.info(`victory work: ${type} not queued, ${Math.ceil(best.finish)} turns in ${nameOf(best.c)} with ${ageLeft} left in the age`);
                best = null;
            }
            if (best) start(best.c);
        }
    }
    // The path's buildings last: never ahead of a queued wonder or project (research/23 S1: game 8, the University and
    // Shwedagon, the Academy and Chart the Stars swapped places every pass, the queue read being a pass late), nor of the
    // space work. Only where it is built soon (leverSoon); a slower city may buy it (victoryPurchases lists every city's).
    for (const c of cities) {
        for (const def of levers) if (!queueTypes(c).includes(def.$hash) && leverSoon(c, def)) place(c, def, { front: false });
        const first = levers.find((def) => queueTypes(c).includes(def.$hash) && leverSoon(c, def));
        if (first) toFront(c, first.$hash, leverSlot(c), { behind: behindOwn(c, first.$hash, wonderOrProject) });
    }
    return out;
}

// A one-off the Radio Telescope's way (STANDING_SITE_PROJECTS) is not queued where it would take longer than this.
const STANDING_PROJECT_MAX_TURNS = 30;

/** Turns of the one-off science projects queued in this city (the item in production with progress aside: frontSlot counts it). */
function queuedOneOffTurns(city, prod) {
    let turns = 0;
    queueTypes(city).forEach((h, i) => {
        if (i === 0 && frontSlot(city)) return;
        const p = safe(() => GameInfo.Projects.lookup(h), null);
        if (!p || REPEATABLE_PROJECTS.has(p.ProjectType) || !(SCIENCE_PROJECTS.includes(p.ProjectType) || STANDING_SITE_PROJECTS.includes(p.ProjectType))) return;
        const cost = Number(safe(() => city.Production.getProjectProductionCost(p.ProjectType), p.Cost ?? 0)) || 0;
        const pct = Math.min(100, Math.max(0, Number(safe(() => city.BuildQueue.getPercentComplete(h), 0)) || 0));
        turns += (cost * (1 - pct / 100)) / prod;
    });
    return turns;
}

// A Launch Pad that takes longer than SITE_MAX_TURNS is still built, rather than waited for, when the gold would buy it
// later than the city builds it, up to SLOW_PAD_MAX_TURNS (research/31 §2: game 26's pads cost 3,864 gold against an
// income of about 80; four pad cities waited for gold that never came).
export const SLOW_PAD_MAX_TURNS = 30;

/**
 * Would this city build its Launch Pad sooner than the gold buys it? The pads already left for gold this pass (`toBuy.n`)
 * are bought first; one this city builds is not counted there. @returns true to build it
 */
function buildRatherThanBuy(city, def, toBuy) {
    const turns = buildTurns(city, def);
    const price = Number(safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), 0)) || 0;
    const income = goldIncome();
    const short = (toBuy.n + 1) * price - goldBalance();
    const buyTurns = !(price > 0) ? Infinity : short <= 0 ? 0 : income > 0 ? short / income : Infinity;
    // Done before the age ends (none on its clock: Infinity).
    const left = Number(safe(() => ageOutlook().turnsLeft, Infinity));
    if (turns <= SLOW_PAD_MAX_TURNS && turns < buyTurns && turns <= left - AGE_END_MARGIN) return true;
    toBuy.n++;
    return false;
}

// ---- production first (research/31 §2.4) ----------------------------------------------------------
// A city that is to put a lot of production into space work (a Launch Pad, an Airfield, their projects) first builds the
// buildings that pay for themselves before that work is done: with R the production the work still needs there, P the
// city's production and g a building's production (the game's own placement numbers, calculateAllBuildingsPlacements),
// one of cost c pays when c / P + R / (P + g) < R / P, i.e. c < R × g / (P + g). The cheapest per production first, P
// growing with each. Game 26: Бак (40 production) faced a 24-turn Launch Pad with a Stonecutter and a Sawmill (2 turns,
// +5 each) and an Ironworks (7 turns, +10) on offer; the player queued them by hand at M107.
export const SPACE_PROJECT_WORK = 2000; // one Crewed Space Flight Preparation run, or the Airfield's two flights
export const PRODUCTION_FIRST_MAX = 3;  // such buildings queued in a city at once
const firstWork = new Map();            // sid -> the production-first buildings queued there (hashes), while queued

/** Forgets the production-first buildings remembered per city (tests; a new game). */
export function resetProductionFirst() {
    firstWork.clear();
}

// Crewed Space Flight Preparation: the repeatable project of a city with a Launch Pad.
const PREP = "PROJECT_CREWED_SPACE_FLIGHT_PREP";
const innovationCache = new Map(); // "age|project" -> Innovation

/** Innovation a project grants: the game's own number (its completion modifiers' VictoryType … SCIENCE, Points), else the table's. */
function projectInnovation(type) {
    const key = `${currentAge()}|${type}`;
    if (innovationCache.has(key)) return innovationCache.get(key);
    let points = 0;
    for (const row of safe(() => GameInfo.ProjectCompletionModifiers.filter((r) => r.ProjectType === type), []) ?? []) {
        const args = safe(() => GameInfo.ModifierArguments.filter((a) => a.ModifierId === row.ModifierId), []) ?? [];
        if (String(args.find((a) => a.Name === "VictoryType")?.Value ?? "").includes("SCIENCE")) points += Number(args.find((a) => a.Name === "Points")?.Value) || 0;
    }
    if (!(points > 0)) points = PROJECT_INNOVATION[type] ?? ([...SCIENCE_PROJECTS, ...STANDING_SITE_PROJECTS].includes(type) ? ONE_OFF_INNOVATION : 0);
    innovationCache.set(key, points);
    return points;
}

/** A project's run in this city (innovationReach): what is left of its cost, in turns of the city's production. */
function projectRun(city, def) {
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const innovation = projectInnovation(def.ProjectType);
    if (!(prod > 0) || !(innovation > 0)) return null;
    const pct = Math.min(100, Math.max(0, Number(safe(() => city.BuildQueue.getPercentComplete(def.$hash), 0)) || 0));
    const cost = (Number(safe(() => city.Production.getProjectProductionCost(def.ProjectType), def.Cost ?? 0)) || 0) * (1 - pct / 100);
    return { key: def.ProjectType, innovation, turns: cost / prod, cost };
}

/** Does this city stand or queue one of the age's science sites (its space work has begun)? */
function spaceWorkIn(city) {
    return activeSites(null).some((site) => cityHas(city, site.type) || queueTypes(city).includes(safe(() => GameInfo.Constructibles.lookup(site.type)?.$hash, null)));
}

// spaceRace's entry for the Innovation research brings (research/38 §4 A1), and the Future Techs it counts ahead: each costs a
// step more than the last, and a far forecast only flatters the race.
export const RESEARCH_RACE = "research";
const FUTURE_TECH_AHEAD = 2;
const RADIO_STATION = "BUILDING_RADIO_STATION";
const researchPointsCache = new Map(); // "age|modifier" -> Innovation

/** Innovation a technology's unlock grants (the game's Points of a science VictoryType), else the table's. */
function researchInnovationOf(target) {
    const key = `${currentAge()}|${target}`;
    if (researchPointsCache.has(key)) return researchPointsCache.get(key);
    const args = safe(() => GameInfo.ModifierArguments.filter((a) => a.ModifierId === target), []) ?? [];
    let points = String(args.find((a) => a.Name === "VictoryType")?.Value ?? "").includes("SCIENCE") ? Number(args.find((a) => a.Name === "Points")?.Value) || 0 : 0;
    if (!(points > 0)) points = RESEARCH_INNOVATION[target] ?? MASTERY_INNOVATION;
    researchPointsCache.set(key, points);
    return points;
}

/** Rocketry is in whatever the tree says: a Launch Pad stands or is queued, or the game lets a city build one. */
function padOffered(cities) {
    const def = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD), null);
    if (!def) return false;
    return cities.some((c) => cityHas(c, LAUNCH_PAD) || queueTypes(c).includes(def.$hash))
        || cities.some((c) => !!safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null)?.Success);
}

/**
 * The Innovation research still brings (research/38 §4 A1: the race counted only projects and forecast 44 turns at game
 * 30's M35, where 26 came), in the order chooseResearch takes it: Rocketry at the end of its way (`gateTurns`), then the
 * masteries by Innovation per turn (rankInnovationResearch; a one-off they open counts for the order only where its site
 * stands or comes: `airfield`, `radio`), then Future Tech's prerequisites and FUTURE_TECH_AHEAD Future Techs (none while
 * the strategy holds them back). Turns are the game's (getTurnsForNode); a mastery whose tech is not in yet takes as long
 * again. @returns { gateTurns, runs: [{ key, innovation, turns, cost: 0 }], at: Map(nodeType -> the turn it is in) }
 */
function researchPlan(cities, { airfield = false, radio = false } = {}) {
    const plan = { gateTurns: 0, runs: [], at: new Map() };
    const holder = safe(() => Players.get(pid()).Techs, null);
    if (!holder) return plan;
    const { prereqs, researched, depthOf } = treeFacts();
    const turnsOf = nodeTurns(holder);
    const isTech = (node) => String(safe(() => GameInfo.ProgressionTreeNodes.lookup(node)?.ProgressionTree, "") ?? "").includes("TECH");
    const rows = GameInfo.ProgressionTreeNodeUnlocks?.filter((r) => !r.RequiredTraitType && isTech(r.ProgressionTreeNodeType)) ?? [];
    let t = 0;
    const push = (key, innovation, turns) => {
        t += turns;
        plan.runs.push({ key, innovation, turns, cost: 0 });
        plan.at.set(key, t);
    };
    // Rocketry and its way first: research takes nothing else until it is in (researchGate).
    const gate = safe(() => gateState("SCIENCE"), null);
    const way = new Set();
    if (gate?.known && !gate.open && !padOffered(cities)) {
        const stack = [gate.goal];
        while (stack.length > 0) {
            const n = stack.pop();
            if (way.has(n) || researched(n)) continue;
            way.add(n);
            stack.push(...(prereqs.get(n) ?? []));
        }
        plan.gateTurns = [...way].reduce((sum, n) => sum + turnsOf(n), 0);
        const points = rows.filter((r) => r.ProgressionTreeNodeType === gate.goal && (Number(r.UnlockDepth) || 1) === 1 && /_SCIENCE_VP$/.test(String(r.TargetType)))
            .reduce((sum, r) => sum + researchInnovationOf(r.TargetType), 0);
        push(gate.goal, points, plan.gateTurns);
    }
    // The masteries, and the one-offs they open where the one-off's site stands or comes.
    const siteFor = { PROJECT_TRANS_OCEANIC_FLIGHT: airfield, PROJECT_BREAK_SOUND_BARRIER: airfield };
    for (const p of STANDING_SITE_PROJECTS) siteFor[p] = radio;
    const cands = new Map();
    for (const r of rows) {
        const depth = Number(r.UnlockDepth) || 1;
        const node = r.ProgressionTreeNodeType;
        if (depth < 2 || depthOf(node) >= depth) continue;
        const target = String(r.TargetType ?? "");
        const points = /_SCIENCE_VP$/.test(target) ? researchInnovationOf(target) : 0;
        const oneOff = siteFor[target] ? projectInnovation(target) : 0;
        if (!(points > 0) && !(oneOff > 0)) continue;
        const c = cands.get(node) ?? { nodeType: node, points: 0, oneOff: 0, turns: turnsOf(node) * (researched(node) || way.has(node) ? 1 : 2) };
        c.points += points;
        c.oneOff += oneOff;
        cands.set(node, c);
    }
    for (const c of rankInnovationResearch([...cands.values()])) push(c.nodeType, c.points, c.turns);
    // Future Tech after its prerequisites (Nuclear Fission: no Innovation of its own), each a step dearer.
    if (!safe(() => state.get().autopilot?.strategy?.noFutureTech, false)) {
        const ft = rows.find((r) => /FUTURE_TECH_SCIENCE_VP$/.test(String(r.TargetType)));
        if (ft) {
            const node = ft.ProgressionTreeNodeType;
            for (const p of prereqs.get(node) ?? []) if (!researched(p) && !plan.at.has(p)) push(p, 0, turnsOf(p));
            const points = researchInnovationOf(ft.TargetType);
            for (let k = 1; k <= FUTURE_TECH_AHEAD; k++) push(node, points, turnsOf(node) * k);
        }
    }
    return plan;
}

/** The one-off projects a mastery opens, and whether their site stands or is queued in one of our cities (the Airfield's flights, the Radio Telescope). */
function oneOffSites() {
    const cities = ownSettlements().filter((c) => !c.isTown);
    const has = (type) => {
        const h = safe(() => GameInfo.Constructibles.lookup(type)?.$hash, null);
        return cities.some((c) => cityHas(c, type) || (h !== null && queueTypes(c).includes(h)));
    };
    const airfield = has("BUILDING_AIRFIELD");
    const out = { PROJECT_TRANS_OCEANIC_FLIGHT: airfield, PROJECT_BREAK_SOUND_BARRIER: airfield };
    for (const p of STANDING_SITE_PROJECTS) out[p] = has(RADIO_STATION);
    return out;
}

/**
 * The research that brings the most Innovation per turn (research/38 §4 C2; core rankInnovationResearch): the points its next
 * research grants itself (*_SCIENCE_VP) plus a one-off project it opens where that project's site stands or is queued.
 * @param candidates researchCandidates' @returns one of them or null
 */
function innovationStep(candidates) {
    const sites = oneOffSites();
    const cands = (candidates ?? []).map((c) => ({
        ...c,
        points: c.targets.filter((t) => /_SCIENCE_VP$/.test(String(t))).reduce((sum, t) => sum + researchInnovationOf(t), 0),
        oneOff: c.targets.reduce((sum, t) => sum + (sites[t] ? projectInnovation(t) : 0), 0),
    }));
    return rankInnovationResearch(cands)[0] ?? null;
}

/** The Innovation masteries still to research (tech nodes whose mastery grants *_SCIENCE_VP and is not reached). */
function innovationMasteriesLeft() {
    const { depthOf } = treeFacts();
    const isTech = (node) => String(safe(() => GameInfo.ProgressionTreeNodes.lookup(node)?.ProgressionTree, "") ?? "").includes("TECH");
    const rows = GameInfo.ProgressionTreeNodeUnlocks?.filter((r) => !r.RequiredTraitType && (Number(r.UnlockDepth) || 1) >= 2
        && /_SCIENCE_VP$/.test(String(r.TargetType ?? "")) && isTech(r.ProgressionTreeNodeType)) ?? [];
    return rows.filter((r) => depthOf(r.ProgressionTreeNodeType) < (Number(r.UnlockDepth) || 1)).length;
}

let spacePushOn = null; // the last pass's push: "FULL", "HALF" or null

/** Forgets whether the last pass was in the space push (tests; a new game). */
export function resetSpacePush() {
    spacePushOn = null;
}

/**
 * The science victory's last stretch (research/38 §4 E1; core SPACE_PUSH): the science focus in Modern, Rocketry in, no
 * Innovation mastery left and a Launch Pad standing. Then the pass weighs production more and science less (biasFor).
 * @returns { on, changed }
 */
export function spacePushNow(focus) {
    const pad = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD)?.$hash, null);
    const rocketry = focus === "SCIENCE" && currentAge() === "AGE_MODERN" && !!safe(() => gateState(focus).open, false);
    const standing = rocketry && ownSettlements().some((c) => !c.isTown && cityHas(c, LAUNCH_PAD));
    const queued = rocketry && ownSettlements().some((c) => !c.isTown && pad !== null && queueTypes(c).includes(pad));
    // Full once the masteries are in and a pad stands; half from Rocketry with a pad standing or queued (research/39 §4.7).
    const level = standing && innovationMasteriesLeft() === 0 ? "FULL" : standing || queued ? "HALF" : null;
    const changed = level !== spacePushOn;
    spacePushOn = level;
    if (changed) log.info(`space push: ${level === "FULL" ? "on: production weighs more, science less" : level === "HALF" ? "half: production ×1.25, science ÷1.25 from Rocketry" : "off"}`);
    return { on: level === "FULL", level, changed };
}

let raceNoted = null; // the turn UI.log last described the race

/** UI.log once a turn: the race the victory work decides on (research/38 §4 A1: the forecast against the real crossing). */
function noteRace(race) {
    if (!race || raceNoted === Game.turn) return;
    raceNoted = Game.turn;
    const reach = innovationReach(race.need, race.cities, race.maxTurns);
    const sum = (runs) => (runs ?? []).reduce((a, r) => a + (Number(r.innovation) || 0), 0);
    const research = race.cities.find((c) => c.id === RESEARCH_RACE);
    const cities = race.cities.filter((c) => c.id !== RESEARCH_RACE).map((c) => `${c.id} wait ${Math.ceil(c.wait)} runs ${c.runs.map((r) => String(r.key).replace("PROJECT_", "")).join("+") || "-"}${c.repeat ? ` prep every ${Math.ceil(c.repeat.turns)}` : ""}`);
    log.info(`victory work: race: ${race.need} Innovation needed, reached in ${Number.isFinite(reach.turn) ? Math.ceil(reach.turn) : "-"} turns; research ${sum(reach.done.get(RESEARCH_RACE))} of it by then (${sum(research?.runs)} ahead${race.gateTurns > 0 ? `, Rocketry in ${Math.ceil(race.gateTurns)}` : ""}); ${cities.join("; ") || "no space work"}`);
}

/**
 * The science victory's race as it stands, for innovationReach: the Innovation still needed and each city's project runs.
 * A city runs the Innovation projects queued there in order (one under way keeps its place: `lock`) after the item in
 * production ahead of them (with progress, not a project), the production-first buildings queued there and a science
 * site still to be built; then, with a Launch Pad standing or queued, Crewed Space Flight Preparation again and again;
 * with another site (the Airfield), the projects it is for, each once, where none is queued. `extra`: sid -> the site
 * types a city gets this pass (`instant`: "sid|type" of those bought, standing at once). Up to the game's end (ageOutlook:
 * a rival's science countdown included). Research is one more entry (RESEARCH_RACE: researchPlan), no Launch Pad comes
 * before Rocketry (`gateTurns`), and a flight counts from the turn its mastery comes in the research plan.
 * @returns { need, cities: [{ id, wait, runs, repeat, lock }], maxTurns, gateTurns } or null (no science victory known)
 */
function spaceRace(cities, extra = new Map(), { instant = new Set() } = {}) {
    const known = safe(() => innovationNeed(), null);
    if (!known) return null;
    const end = Number(safe(() => ageOutlook().turnsLeft, Infinity));
    const maxTurns = Number.isFinite(end) ? Math.max(0, Math.min(REACH_MAX_TURNS, end - AGE_END_MARGIN)) : REACH_MAX_TURNS;
    const prep = safe(() => GameInfo.Projects.lookup(PREP), null);
    // Every science site: one whose projects wait for a mastery counts them from the turn the research plan brings it.
    const sites = scienceSites(currentAge()).map((site) => ({ site, def: safe(() => GameInfo.Constructibles.lookup(site.type), null) })).filter((x) => x.def);
    const taken = new Set(cities.flatMap((c) => queueTypes(c)));
    const has = (type) => {
        const h = safe(() => GameInfo.Constructibles.lookup(type)?.$hash, null);
        return cities.some((c) => cityHas(c, type) || (h !== null && queueTypes(c).includes(h))) || [...extra.values()].some((set) => set.has(type));
    };
    const plan = researchPlan(cities, { airfield: has("BUILDING_AIRFIELD"), radio: has(RADIO_STATION) });
    const startOf = (t) => {
        if (unlockReached(t)) return 0;
        const row = GameInfo.ProgressionTreeNodeUnlocks?.find((r) => r.TargetType === t && !r.RequiredTraitType);
        return plan.at.get(row?.ProgressionTreeNodeType) ?? Infinity;
    };
    const out = [];
    for (const c of cities) {
        const prod = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
        if (!(prod > 0)) continue;
        const sid = sidOf(c);
        const types = queueTypes(c);
        const leftOf = (h, cost) => cost * (1 - Math.min(100, Math.max(0, Number(safe(() => c.BuildQueue.getPercentComplete(h), 0)) || 0)) / 100);
        const ahead = types.length > 0 && frontSlot(c) ? types[0] : null; // in production with progress: it stays first
        let wait = 0;
        if (ahead !== null && !safe(() => GameInfo.Projects.lookup(ahead), null)) wait += leftOf(ahead, itemCost(c, ahead).cost) / prod;
        for (const h of firstWork.get(sid) ?? []) if (h !== ahead && types.includes(h)) wait += leftOf(h, itemCost(c, h).cost) / prod;
        const runs = [];
        types.forEach((h) => {
            const p = safe(() => GameInfo.Projects.lookup(h), null);
            const run = p ? projectRun(c, p) : null;
            if (run) runs.push(run);
        });
        const lock = ahead !== null && runs.length > 0 && runs[0].key === typeNameOf(ahead) ? 1 : 0;
        let repeat = null;
        for (const { site, def } of sites) {
            const standing = cityHas(c, site.type);
            const queued = !standing && types.includes(def.$hash);
            if (!standing && !queued && !extra.get(sid)?.has(site.type)) continue;
            // No Launch Pad before Rocketry: one ordered or bought before it is built from then on.
            if (!standing && site.type === LAUNCH_PAD && plan.gateTurns > 0) wait = Math.max(wait, plan.gateTurns);
            // A site in production with progress is in `wait` already (`ahead`: research/34 §5 saw it counted twice).
            if (!standing && def.$hash !== ahead && !instant.has(`${sid}|${site.type}`)) wait += (queued ? leftOf(def.$hash, costIn(c, site.type)) : costIn(c, site.type)) / prod;
            if (site.type === LAUNCH_PAD) {
                const run = prep ? projectRun(c, prep) : null;
                // A run under way is in `runs`; the next ones start from nothing.
                if (run) repeat = { ...run, turns: (Number(safe(() => c.Production.getProjectProductionCost(PREP), prep.Cost ?? 0)) || 0) / prod, cost: Number(safe(() => c.Production.getProjectProductionCost(PREP), prep.Cost ?? 0)) || 0 };
                continue;
            }
            // The projects the site is for (the Airfield's flights), each once, where none is queued; where the site stands,
            // only those the game lets it start (one done is refused).
            for (const t of site.needs ?? []) {
                const p = safe(() => GameInfo.Projects.lookup(t), null);
                if (!p || taken.has(p.$hash)) continue;
                // Not before its mastery (the research plan's turn for it; none planned: not counted).
                const start = startOf(t);
                if (!Number.isFinite(start)) continue;
                if (start === 0 && standing && !safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { ProjectType: p.$hash }, false), null)?.Success) continue;
                const run = projectRun(c, p);
                if (!run) continue;
                runs.push(start > 0 ? { ...run, start } : run);
                taken.add(p.$hash);
            }
        }
        out.push({ id: sid, wait, runs, repeat, lock });
    }
    if (plan.runs.length > 0) out.push({ id: RESEARCH_RACE, wait: 0, runs: plan.runs, repeat: null, lock: 0 });
    return { need: known.need, cities: out, maxTurns, gateTurns: plan.gateTurns };
}

/**
 * Does one more science site in this city bring the science victory's Innovation sooner (research/34 §5: game 28's fifth
 * Launch Pad, done at M83, ran no Preparation before the victory at M93, and Kalhu's Airfield came at M89, its first
 * flight unfinished)? The race with the site against the race without it (`bought`: it stands at once). Unknown, or
 * neither reaching the goal within the race's turns: yes (the rules before). Nothing left to win: no.
 */
function siteHelps(cities, city, siteType, extra = new Map(), { bought = false } = {}) {
    const before = spaceRace(cities, extra);
    if (!before) return true;
    if (!(before.need > 0)) return false;
    const more = new Map([...extra].map(([sid, types]) => [sid, new Set(types)]));
    more.set(sidOf(city), new Set([...(more.get(sidOf(city)) ?? []), siteType]));
    const after = spaceRace(cities, more, { instant: bought ? new Set([`${sidOf(city)}|${siteType}`]) : new Set() });
    const without = innovationReach(before.need, before.cities, before.maxTurns).turn;
    const withIt = innovationReach(after.need, after.cities, after.maxTurns).turn;
    if (!Number.isFinite(without) && !Number.isFinite(withIt)) return true;
    if (withIt >= without) {
        // Once a turn per city and site: the savings goal, the LEVER goal and the purchase step all ask (game 30 logged it
        // three times a pass).
        const k = `${sidOf(city)}|${siteType}|${bought}`;
        if (helpsNoted.get(k) !== Game.turn) {
            helpsNoted.set(k, Game.turn);
            log.info(`victory work: no ${siteType} in ${nameOf(city)}${bought ? " bought" : ""}: the goal comes on turn ${Math.ceil(without)} either way (${before.need} Innovation still needed)`);
        }
        return false;
    }
    return true;
}

const helpsNoted = new Map(); // "sid|site|bought" -> the turn UI.log said the site would not help

/**
 * The production this city still puts into Innovation projects before the science victory's need is met (or the game
 * ends): the runs it finishes by then (innovationReach). Production first weighs its buildings against it; before, a
 * fixed SPACE_PROJECT_WORK (2000) whatever was left (an upgrade made the last run 10.59 turns instead of 10). Without a
 * science victory known: SPACE_PROJECT_WORK.
 */
function spaceWork(race, sid) {
    if (!race) return SPACE_PROJECT_WORK;
    const reach = innovationReach(race.need, race.cities, race.maxTurns);
    return (reach.done.get(sid) ?? []).reduce((sum, run) => sum + (Number(run.cost) || 0), 0);
}

/** The production buildings that pay for themselves before `work` more production in this city, best first. */
export function productionFirst(city, work) {
    const P = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    if (!(P > 0) || !(work > 0)) return [];
    const left = ageEndTurns();
    // A timed end: only the work done before it counts.
    const R = left === null ? work : Math.min(work, P * Math.max(0, left - AGE_END_MARGIN));
    const prodIndex = safe(() => GameInfo.Yields.lookup("YIELD_PRODUCTION")?.$index, null);
    const data = safe(() => city.Yields.calculateAllBuildingsPlacements(), null);
    if (prodIndex === null || !data?.buildings) return [];
    const queuedHere = new Set(queueTypes(city));
    // Below zero Happiness the game takes a share of the city's production (research/34 §2, §4: game 28's Kalhu stayed below
    // zero all Modern, at −33 its yields 80% gone): a building's new production counts at what the city keeps, and its
    // Happiness (its own less its upkeep) wins back or loses the production of that share (happinessWorth).
    const happyIndex = safe(() => GameInfo.Yields.lookup("YIELD_HAPPINESS")?.$index, null);
    const nets = YIELD_KEYS.map((k) => Number(safe(() => city.Yields.getNetYield(YieldTypes[k]), NaN)));
    const prodOnly = [0, 1, 0, 0, 0, 0, 0];
    const effective = (p, upkeep) => {
        const raw = Number(p.yieldChanges?.[prodIndex]) || 0;
        const dh = (happyIndex === null ? 0 : Number(p.yieldChanges?.[happyIndex]) || 0) - upkeep;
        if (!Number.isFinite(nets[H])) return raw;
        return raw * (1 - unhappinessShare(nets[H] + dh)) + happinessWorth(prodOnly, nets, nets[H], dh);
    };
    const options = [];
    for (const b of data.buildings) {
        const def = safe(() => GameInfo.Constructibles.lookup(b.constructibleType), null);
        if (!def || def.ConstructibleClass !== "BUILDING" || isMilitaryBuilding(def.ConstructibleType) || queuedHere.has(def.$hash)) continue;
        const upkeep = happyIndex === null ? 0 : Number(safe(() => city.Constructibles.getMaintenance(def.ConstructibleType)?.[happyIndex], 0)) || 0;
        const gains = (b.placements ?? []).map((p) => ({ p, g: effective(p, upkeep) })).filter((x) => x.g > 0);
        if (gains.length === 0) continue;
        const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
        if (!probe?.Success || probe.InQueue || probe.InProgress) continue;
        const valid = new Set([...(probe.Plots ?? []), ...(probe.ExpandUrbanPlots ?? [])]);
        const gainAt = new Map(gains.filter((x) => valid.has(x.p.plotID)).map((x) => [x.p.plotID, x.g]));
        // The plan's tile for it, else the most production on a tile the plan leaves free (pickPlot).
        const plot = pickPlot(city, def.$hash, [...gainAt.keys()], (cands) => cands.reduce((a, b) => (gainAt.get(b) > gainAt.get(a) ? b : a)));
        const cost = costIn(city, def.ConstructibleType);
        if (plot === null || !(cost > 0)) continue;
        options.push({ def, plot, gain: gainAt.get(plot), cost });
    }
    options.sort((a, b) => a.cost / a.gain - b.cost / b.gain);
    const out = [];
    let prod = P;
    for (const o of options) {
        if (out.length >= PRODUCTION_FIRST_MAX) break;
        if (!(o.cost < (R * o.gain) / (prod + o.gain))) continue;
        if (left !== null && Math.ceil(o.cost / prod) > left - AGE_END_MARGIN) continue;
        out.push(o);
        prod += o.gain;
    }
    return out;
}

/**
 * Production first in the cities that are to run space work (research/31 §2.4): a science site standing or queued there
 * (a city given one this pass is looked at next pass). The buildings that pay are queued (appended), and the first of them
 * in the queue goes to the front (behind an item with progress: frontSlot); pushVictoryWork runs this first, so in game
 * that move is the city's queue edit of the pass. Remembered per city while queued (behindFirst). @returns nothing
 */
function productionFirstStep(cities, out, note, strategy = null) {
    const sites = activeSites(null).map((site) => ({ site, def: safe(() => GameInfo.Constructibles.lookup(site.type), null) })).filter((x) => x.def);
    if (sites.length === 0) return;
    const race = spaceRace(cities);
    // Before Rocketry the cities kept for Launch Pads (padExclusion: from PAD_GATE_NEAR) weigh their production buildings
    // against the pad and the runs they will make there (research/39 §4.7: production first never fired in game 32).
    const padNear = strategy && !strategy.gate?.open ? padExclusion(strategy) : null;
    for (const c of cities) {
        let work = 0;
        let space = false;
        for (const { site, def } of sites) {
            if (cityHas(c, site.type)) {
                space = true;
                continue;
            }
            if (!queueTypes(c).includes(def.$hash)) continue;
            space = true;
            const pct = Math.min(100, Math.max(0, Number(safe(() => c.BuildQueue.getPercentComplete(def.$hash), 0)) || 0));
            work += costIn(c, site.type) * (1 - pct / 100);
        }
        if (!space && padNear?.has(sidOf(c))) {
            const extra = new Map([[sidOf(c), new Set([LAUNCH_PAD])]]);
            productionFirstIn(c, costIn(c, LAUNCH_PAD) + spaceWork(spaceRace(cities, extra), sidOf(c)), out, note);
            continue;
        }
        if (!space) {
            firstWork.delete(sidOf(c));
            continue;
        }
        // The site still to build and the projects this city runs before the goal is reached (spaceWork).
        productionFirstIn(c, work + spaceWork(race, sidOf(c)), out, note);
    }
}

/**
 * Production first in one city, before `work` more production of space work there (productionFirstStep; pushVictoryWork
 * before it orders a city's first science site). The buildings that pay are queued (appended) and remembered while
 * queued (the victory work's top rank), and the first of them in the queue goes to the front.
 */
function productionFirstIn(c, work, out, note) {
    // What was built or left the queue is forgotten.
    const remembered = firstWork.get(sidOf(c)) ?? new Set();
    const inQueue = new Set(queueTypes(c));
    for (const h of [...remembered]) if (!inQueue.has(h)) remembered.delete(h);
    for (const o of productionFirst(c, work)) {
        if (remembered.size >= PRODUCTION_FIRST_MAX) break;
        const loc = safe(() => GameplayMap.getLocationFromIndex(o.plot), null);
        if (!loc) continue;
        Game.CityOperations.sendRequest(c.id, CityOperationTypes.BUILD, { ConstructibleType: o.def.$hash, X: loc.x, Y: loc.y });
        note(c, o.def.$hash);
        noteBuilt(c, o.def.ConstructibleType);
        remembered.add(o.def.$hash);
        out.push({ key: "PRODUCTION_FIRST", args: [nameOf(c), safe(() => Locale.compose(o.def.Name), o.def.ConstructibleType), Math.round(o.gain * 10) / 10, Math.round(work)] });
    }
    if (remembered.size === 0) {
        firstWork.delete(sidOf(c));
        return;
    }
    firstWork.set(sidOf(c), remembered);
    // The first of them already in the queue goes to the front (this pass's edit of the city, when still free).
    const h = queueTypes(c).find((t) => remembered.has(t));
    if (h !== undefined) toFront(c, h);
}

/**
 * The pass budget a caller passed (goldPlan), else one over the treasury above `reserveTurns` of
 * income; an old-style `{ bought, spent }` record is carried over (syncRecord copies the spend back).
 */
function budgetOf(purchases, reserveTurns) {
    if (purchases && typeof purchases.free === "function") return purchases;
    return createBudget({ gold: goldBalance(), reserve: goldReserve(reserveTurns), spent: purchases?.spent ?? 0, bought: purchases?.bought ?? new Set() });
}

function syncRecord(purchases, b) {
    if (purchases && purchases !== b && typeof purchases.free !== "function") purchases.spent = b.spent;
}

/** Do we own a factory resource tagged SCIENCE (Modern Tea)? */
function ownsScienceFactoryResource() {
    for (const r of safe(() => Players.get(pid()).Resources.getResources(), []) ?? []) {
        const def = safe(() => GameInfo.Resources.lookup(r.uniqueResource?.resource), null);
        if (def?.ResourceClassType === "RESOURCECLASS_FACTORY" && GameInfo.TypeTags?.find((t) => t.Type === def.ResourceType && t.Tag === "SCIENCE")) return true;
    }
    return false;
}

/**
 * What the victory path would buy now, in its order (buyVictoryWork; also the LEVER savings goal):
 * each settlement's first item it may buy (towns first; only Buildings.Town types: Rail Station,
 * Port, Factory in the Modern age; then cities), in the path's order, so a settlement waits for gold
 * rather than skip ahead; never the item a city is producing with progress (frontSlot). Science:
 * first the buildings its projects need, where pushVictoryWork queued them (Launch Pad, Airfield:
 * scienceSites), then its buildings of this age (Library, Academy, University, Schoolhouse,
 * Laboratory), then the sites still missing. An item the game says we cannot afford yet
 * (InsufficientFunds) is listed (`ok: false`): that settlement waits for it.
 * @returns [{ city, def, args (null without a tile), cost, key: "sid|type", ok }]
 */
export function victoryPurchases(focus, { pads = null, sitesFirst = false } = {}) {
    const out = [];
    const lookup = (t) => safe(() => GameInfo.Constructibles.lookup(t), null);
    const levers = leverBuildings(focus, currentAge()).map(lookup).filter(Boolean);
    const sites = focus === "SCIENCE" ? activeSites(pads).map((site) => lookup(site.type)).filter(Boolean) : [];
    // A town also tries the path's buildings an Urban Center opens (the Observatory; research/22 C2).
    const forTowns = townLevers(focus).filter((d) => !levers.some((l) => l.$hash === d.$hash));
    if (levers.length === 0 && sites.length === 0 && forTowns.length === 0) return out;
    const all = ownSettlements();
    // Science sites still missing (not built or queued anywhere as many times as wanted): bought in a
    // city that lacks one, after its lever buildings (pushVictoryWork queues only the ones done soon).
    const want = new Map(activeSites(pads).map((site) => [site.type, site.cities]));
    // The other sites (the Airfield) count and go only in a city without a Launch Pad (research/32 §3).
    const fits = (c, d) => d.ConstructibleType === LAUNCH_PAD || !padIn(c);
    const have = (def) => all.filter((c) => !c.isTown && fits(c, def) && (queueTypes(c).includes(def.$hash) || cityHas(c, def.ConstructibleType))).length;
    // The final age: a site only where its project is done before the game ends once the site is bought (research/30 §3).
    const finalAge = !!safe(() => ageOutlook().isFinalAge, false);
    const siteRows = new Map(activeSites(pads).map((site) => [site.type, site]));
    const inTime = (city, d) => !finalAge || !siteRows.has(d.ConstructibleType) || siteFitsAge(city, d, siteRows.get(d.ConstructibleType), { bought: true });
    // The Launch Pad first: one item a city, so a city that buys a pad buys no Airfield.
    // Beyond the victory's own Launch Pad, a site bought where it brings the goal sooner (siteHelps; research/34 §5).
    // Cities by production, the best first: a Launch Pad bought where Preparation runs soonest, and the bank (padGoals) is
    // priced in those same cities (research/38 §3.3: game 30 held the cheapest city's 2,148 and bought London's 2,620).
    const cityList = all.filter((c) => !c.isTown).sort((a, b) => cityProduction(b) - cityProduction(a));
    const anyPad = cityList.some((c) => padIn(c));
    const helps = (city, d) => (d.ConstructibleType === LAUNCH_PAD && !anyPad) || siteHelps(cityList, city, d.ConstructibleType, new Map(), { bought: true });
    const missing = (city) => (city.isTown ? [] : sites.filter((d) => fits(city, d) && !queueTypes(city).includes(d.$hash) && !cityHas(city, d.ConstructibleType) && have(d) < (want.get(d.ConstructibleType) ?? 0) && inTime(city, d) && helps(city, d)));
    for (const town of [...all.filter((c) => c.isTown), ...cityList]) {
        // No building bought where a wonder is queued (research/32 §6).
        if (holdsWonder(town)) continue;
        const producing = !town.isTown && frontSlot(town) ? safe(() => town.BuildQueue.currentProductionTypeHash, null) : null;
        const queued = queueTypes(town);
        const queuedSites = sites.filter((d) => queued.includes(d.$hash) && inTime(town, d) && fits(town, d));
        // The final age (sitesFirst): the missing sites before the age's buildings.
        const order = sitesFirst ? [...queuedSites, ...missing(town), ...levers] : [...queuedSites, ...levers, ...missing(town)];
        if (town.isTown) order.push(...forTowns);
        for (const def of order) {
            // The item in production with progress is not bought, unless it is a science site: the game sells it at what it
            // lacks, on its own tile (research/38 §3.3: game 30 had 1,600-2,100 gold M47-M53 beside half-built Launch Pads).
            const underWay = def.$hash === producing;
            if (underWay && !siteRows.has(def.ConstructibleType)) continue;
            // Already there: the game still says InsufficientFunds by the gold alone (seen in game 7: a University
            // bought at Exploration turn 40 stayed the savings goal for 29 turns; research/22 B4).
            if (cityHas(town, def.ConstructibleType)) continue;
            const probe = safe(() => Game.CityCommands.canStart(town.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
            if (!probe?.Success && !probe?.InsufficientFunds) continue;
            const key = `${sidOf(town)}|${def.ConstructibleType}`;
            if (underWay) {
                // As the game's production list buys an item in progress (buyAgeEndItems): on the tile it names.
                const loc = probe.InProgress && probe.Plots?.length > 0 ? safe(() => GameplayMap.getLocationFromIndex(probe.Plots[0]), null) : null;
                const cost = Number(probe.Cost ?? safe(() => town.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
                if (!loc || !Number.isFinite(cost) || cost <= 0) continue;
                out.push({ city: town, def, args: { ConstructibleType: def.$hash, X: loc.x, Y: loc.y }, cost, key, ok: !!probe.Success, underWay: true });
                break;
            }
            const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
            if (plots.length === 0) {
                if (!probe.InsufficientFunds) continue;
                const cost = Number(safe(() => town.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
                if (Number.isFinite(cost) && cost > 0) out.push({ city: town, def, args: null, cost, key, ok: false });
                break;
            }
            const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(town, def.$hash, plots) ?? plots[0]), null);
            if (!loc) continue;
            const args = { ConstructibleType: def.$hash, X: loc.x, Y: loc.y };
            const r = safe(() => Game.CityCommands.canStart(town.id, CityCommandTypes.PURCHASE, args, false), null);
            const cost = Number(r?.Cost ?? safe(() => town.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
            if ((!r?.Success && !r?.InsufficientFunds) || !Number.isFinite(cost)) continue;
            out.push({ city: town, def, args, cost, key, ok: !!r.Success });
            break;
        }
    }
    return out;
}

/**
 * This age's buildings an Urban Center town may buy that serve the path: TypeTags URBANCENTER and the focus's
 * yield tag (FOCUS_YIELD_TAG; Library, Observatory, Schoolhouse for science; research/22 C2, probe P3: the
 * Schoolhouse was buyable 29 turns in game 7). @returns GameInfo.Constructibles rows
 */
export function townLevers(focus) {
    const tag = FOCUS_YIELD_TAG[focus];
    if (!tag) return [];
    return (GameInfo.TypeTags?.filter((t) => t.Tag === "URBANCENTER") ?? [])
        .filter((t) => GameInfo.TypeTags.find((r) => r.Type === t.Type && r.Tag === tag))
        .map((t) => safe(() => GameInfo.Constructibles.lookup(t.Type), null))
        .filter((d) => d && d.ConstructibleClass === "BUILDING");
}

/**
 * Settlements buy the path's buildings (victoryPurchases) with the gold above the reserve (seen in
 * game: thousands of gold idle while cities built them turn by turn), at most MAX_PURCHASES a pass.
 * Same request as the production list's purchase: CityCommands PURCHASE {ConstructibleType, X, Y}.
 * `purchases`: the pass budget (goldPlan; the savings goal's own item may use the gold the goal
 * holds), or an old-style `{ bought: Set of "sid|type", spent }`. What this step bought is skipped by
 * buyBuildings in the same pass and its gold counted (seen in game: the same Port bought here and
 * again from the plan on another tile). @returns log entries
 */
export function buyVictoryWork(focus, reserveTurns, purchases = { bought: new Set(), spent: 0 }, { pads = null, commit = false } = {}) {
    const out = [];
    const b = budgetOf(purchases, reserveTurns);
    const siteTypes = new Set(scienceSites(currentAge(), { pads }).map((site) => site.type));
    for (const item of victoryPurchases(focus, { pads, sitesFirst: commit })) {
        // The final age: science sites (Launch Pads) are not limited, every one the gold covers is bought.
        if (out.length >= MAX_PURCHASES && !(commit && siteTypes.has(item.def.ConstructibleType))) continue;
        if (!item.ok || !item.args || b.bought.has(item.key)) continue;
        if (item.cost > b.poolFor(item.key)) continue;
        const goal = b.isGoal(item.key);
        Game.CityCommands.sendRequest(item.city.id, CityCommandTypes.PURCHASE, item.args);
        const name = safe(() => Locale.compose(item.def.Name), item.def.ConstructibleType);
        b.spend(item.cost, { kind: "LEVER", key: item.key, label: `${name} (${nameOf(item.city)})` }, { goal });
        if (goal) noteGoal(item.key);
        out.push({ key: "VICTORY_BOUGHT", args: [name, nameOf(item.city), Math.round(item.cost)] });
    }
    syncRecord(purchases, b);
    return out;
}

// ---- repairs ------------------------------------------------------------------------

/**
 * Damaged (pillaged) buildings and improvements of this settlement, as the game's production
 * list marks them: the BUILD answer's RepairDamaged, the damaged tiles in Plots
 * (production-chooser-helpers.js). One query for all (canStartQuery) when the game has it,
 * else per type. @returns [{ def, plots, inQueue }]
 */
function damagedOf(city) {
    const out = [];
    const add = (def, r) => {
        if (def && r?.RepairDamaged && def.Repairable !== false && def.Repairable !== "false" && (r.Plots?.length ?? 0) > 0) out.push({ def, plots: r.Plots, inQueue: !!r.InQueue });
    };
    const query = globalThis.CityQueryType ? safe(() => Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible), null) : null;
    if (Array.isArray(query)) {
        for (const { index, result } of query) add(safe(() => GameInfo.Constructibles.lookup(index), null), result);
        return out;
    }
    for (const def of GameInfo.Constructibles ?? []) {
        if (def.ConstructibleClass !== "BUILDING" && def.ConstructibleClass !== "IMPROVEMENT") continue;
        add(def, safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null));
    }
    return out;
}

/**
 * Repairs come first (the user's priority): every damaged building or improvement is bought
 * with gold when the gold covers it (before the gold reserve, which only holds back new
 * buildings), else queued in its city and moved to the front of the queue. Same requests as the
 * production list's repair: PURCHASE / BUILD {ConstructibleType, X, Y} per damaged tile.
 * Every repair is counted in the pass budget (seen in game 6: two repairs that each fit the same
 * gold were both sent). @param options { buy, queue, budget }
 */
export function repairBuildings({ buy = true, queue = true, budget = null } = {}) {
    const out = [];
    const b = budget ?? createBudget({ gold: goldBalance() });
    for (const city of ownSettlements()) {
        const damaged = damagedOf(city);
        for (const d of damaged) {
            for (const plot of d.plots) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(plot), null);
                if (!loc) continue;
                const args = { ConstructibleType: d.def.$hash, X: loc.x, Y: loc.y };
                // Queued instead where a wonder is queued (research/32 §6).
                if (buy && !holdsWonder(city)) {
                    const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
                    const cost = Number(r?.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, d.def.ConstructibleType), Infinity));
                    if (r?.Success && Number.isFinite(cost) && cost <= b.all()) {
                        Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, args);
                        const name = safe(() => Locale.compose(d.def.Name), d.def.ConstructibleType);
                        b.spend(cost, { kind: "REPAIR", label: `${name} (${nameOf(city)})` });
                        out.push({ key: "REPAIR_BOUGHT", args: [name, nameOf(city), cost] });
                        continue;
                    }
                }
                if (!queue || city.isTown || d.inQueue) continue;
                if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
                Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
                out.push({ key: "REPAIR_QUEUED", args: [safe(() => Locale.compose(d.def.Name), d.def.ConstructibleType), nameOf(city)] });
                break; // the rest of this type next pass (one queue entry per type)
            }
        }
        // A repair waiting behind other items goes to the front (behind an item with progress: frontSlot).
        if (!queue || city.isTown) continue;
        const repairs = new Set(damaged.filter((d) => d.inQueue).map((d) => d.def.$hash));
        const items = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        const to = frontSlot(city);
        const i = items.findIndex((q, j) => j > to && repairs.has(queueItemType(q)));
        if (i <= to || !moveInQueue(city, i, to)) continue;
        out.push({ key: "REPAIR_FIRST", args: [nameOf(city)] });
    }
    return out;
}

// ---- resources ----------------------------------------------------------------------

const MAX_RESOURCE_ASSIGNMENTS = 12;
const isFactoryResource = (def) => def?.ResourceClassType === "RESOURCECLASS_FACTORY";

/**
 * Where a factory resource goes first: a settlement already holding that type
 * (Resources.getFactoryResource()), then one with a Factory (in the Modern age the game's
 * isTreasureConstructiblePrereqMet, as the resource screen reads it) and no type yet, then the rest.
 */
function factoryPlaces(places, def) {
    const rank = (p) => {
        const held = safe(() => GameInfo.Resources.lookup(p.c.Resources.getFactoryResource())?.ResourceType, null);
        if (held === def.ResourceType) return 2;
        return !held && safe(() => p.c.Resources.isTreasureConstructiblePrereqMet(), false) ? 1 : 0;
    };
    return [...places].sort((a, b) => rank(b) - rank(a));
}
// A resource's yields: its TypeTags (as the game's resource screen reads them).
const RESOURCE_YIELD_TAGS = { FOOD: "YIELD_FOOD", PRODUCTION: "YIELD_PRODUCTION", GOLD: "YIELD_GOLD", SCIENCE: "YIELD_SCIENCE", CULTURE: "YIELD_CULTURE", HAPPINESS: "YIELD_HAPPINESS" };

/**
 * Resources not assigned to any settlement go into free resource slots: the same request as
 * the game's resource screen (commerce-screen-model.js assignResource): PlayerOperations
 * ASSIGN_RESOURCE {Location, City: city.id.id, Flags: isOffMap, ID: off-map id or -1}.
 * Owned: player.Resources.getResources() → [{ value, uniqueResource: { resource }, isOffMap }];
 * placed: city.Resources.getAssignedResources(), slots getAssignedResourcesCap(). Empire and
 * treasure resources are never assigned. Factory resources first (3 GDP each and the Railroad
 * Tycoon path; one factory-resource type per settlement with a Factory): into a settlement that
 * already holds that type, then one with a Factory and none yet. Then the most valuable (its
 * yields by the priority profile); cities before towns, most free slots first; only where the
 * game accepts. Assigned resources count for the economic legacy path and triumphs.
 */
export function assignResources(settings) {
    const out = [];
    const OP = globalThis.PlayerOperationTypes?.ASSIGN_RESOURCE;
    const owned = safe(() => Players.get(pid()).Resources, null);
    if (OP === undefined || !owned || safe(() => owned.isResourceAssignmentLocked(), false)) return out;
    const assigned = new Set();
    const places = [];
    for (const c of ownSettlements()) {
        const list = safe(() => c.Resources.getAssignedResources(), []) ?? [];
        for (const r of list) assigned.add(r.value);
        const free = (Number(safe(() => c.Resources.getAssignedResourcesCap(), 0)) || 0) - list.length;
        if (free > 0) places.push({ c, free });
    }
    if (places.length === 0) return out;
    places.sort((a, b) => (a.c.isTown ? 1 : 0) - (b.c.isTown ? 1 : 0) || b.free - a.free);
    const weights = profileFor(settings).y;
    const yieldsOf = new Map();
    for (const t of GameInfo.TypeTags ?? []) {
        const y = RESOURCE_YIELD_TAGS[t.Tag];
        if (!y) continue;
        if (!yieldsOf.has(t.Type)) yieldsOf.set(t.Type, []);
        yieldsOf.get(t.Type).push(y);
    }
    const value = (def) => (yieldsOf.get(def.ResourceType) ?? []).reduce((sum, y) => sum + (weights[yieldIndex(y)] ?? 0), 0);
    const waiting = (safe(() => owned.getResources(), []) ?? [])
        .filter((r) => !assigned.has(r.value))
        .map((r) => ({ r, def: safe(() => GameInfo.Resources.lookup(r.uniqueResource?.resource), null) }))
        .filter(({ def }) => def && def.ResourceClassType !== "RESOURCECLASS_EMPIRE" && def.ResourceClassType !== "RESOURCECLASS_TREASURE")
        .sort((a, b) => (isFactoryResource(b.def) ? 1 : 0) - (isFactoryResource(a.def) ? 1 : 0) || value(b.def) - value(a.def));
    for (const { r, def } of waiting) {
        if (out.length >= MAX_RESOURCE_ASSIGNMENTS) break;
        for (const p of isFactoryResource(def) ? factoryPlaces(places, def) : places) {
            if (p.free <= 0) continue;
            const args = { Location: safe(() => GameplayMap.getLocationFromIndex(r.value), null), City: p.c.id.id, Flags: !!r.isOffMap, ID: r.isOffMap ? r.value : -1 };
            if (!safe(() => Game.PlayerOperations.canStart(pid(), OP, args, false), null)?.Success) continue;
            Game.PlayerOperations.sendRequest(pid(), OP, args);
            p.free--;
            out.push({ key: "RESOURCE_ASSIGNED", args: [safe(() => Locale.compose(def.Name), def.ResourceType), nameOf(p.c)] });
            break;
        }
    }
    return out;
}

const SCOUTS_WANTED = 2;      // while the autopilot explores, scouts first up to this
const EXPLORERS_WANTED = 2;   // Modern: explorers while there is something to dig or research
const SETTLERS_EARLY = 2;     // settlers in flight while we have few settlements...
const SETTLERS_LATER = 1;     // ...then one at a time ("once in a while")
const EARLY_SETTLEMENTS = 3;

// GameInfo tables are not JS arrays: lookup, filter, find, forEach, for...of only (no .some).
const isScout = (def) => !!def && !!GameInfo.TypeTags?.find((t) => t.Type === def.UnitType && t.Tag === "UNIT_CLASS_AUTOEXPLORE");
const isSettler = (def) => !!def && (def.FoundCity === true || def.FoundCity === "true" || def.FoundCity === 1);
const isExplorer = (def) => !!def && (def.ExtractsArtifacts === true || def.ExtractsArtifacts === "true" || def.ExtractsArtifacts === 1);
const isMerchant = (def) => !!def && (def.MakeTradeRoute === true || def.MakeTradeRoute === "true" || def.MakeTradeRoute === 1);
const queueUnitDef = (q) => (q.unitType !== undefined && q.unitType !== -1 ? safe(() => GameInfo.Units.lookup(q.unitType), null) : null);

/** Units of a kind we have or are training. */
function unitCount(test) {
    let n = 0;
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (test(safe(() => GameInfo.Units.lookup(u.type), null))) n++;
    }
    for (const city of ownSettlements()) {
        for (const q of safe(() => city.BuildQueue.getQueue(), []) ?? []) if (test(queueUnitDef(q))) n++;
    }
    return n;
}

/** Units of a kind in our queues (not those we have). */
function queuedCount(test) {
    let n = 0;
    for (const city of ownSettlements()) {
        for (const q of safe(() => city.BuildQueue.getQueue(), []) ?? []) if (test(queueUnitDef(q))) n++;
    }
    return n;
}

/** Is a site known for a settler: the Settlements search's picks, or the game's suggestions from the capital? */
export function sitesKnown() {
    if ((state.get().results?.sites?.picks?.length ?? 0) > 0) return true;
    const capital = ownSettlements().find((c) => c.isCapital) ?? ownSettlements()[0];
    if (!capital) return false;
    return (safe(() => Players.get(pid()).AI.getBestSettleLocationsForSettler(1, capital.location), []) ?? []).length > 0;
}

/**
 * A settler we could buy now (research/22 A1: game 7, ~1,000 gold idle while we had 7 of 16
 * settlements): while far below the cap (expansionDeficit), a site is known, and fewer settlers walk or
 * train than wanted (2 below half the cap, else 1); in our biggest settlement that is not threatened and
 * whose purchase the game offers (Success, or InsufficientFunds for a savings goal).
 * @returns { city, args, cost, name } or null
 */
function settlerOffer(threats = [], { fill = false, past = 0 } = {}) {
    // None with a war at our door (research/24 X7: one bought at E51, four turns into the war, stood idle until the age ended).
    // The final age fills the cap (`fill`, research/26 §3.3), else only far below it; the military lever goes `past` it
    // (research/30 §1).
    if (war.near || !(expansionDeficit() || (fill && belowSettlementCap(past))) || finalAgeTooLate(FINAL_SETTLER_BUY_TURNS) || !sitesKnown()) return null;
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements) || 0;
    const cap = (Number(stats?.settlementCap) || 0) + Math.max(0, Number(past) || 0);
    const want = settlersWanted(n, cap);
    // A settler waiting in a queue behind other items is not on its way (research/23 E4: game 8, at A13 one
    // waited behind a Library and the 235 gold bought a Brickyard): it is bought, and its entry dropped.
    const late = lateQueuedSettlers();
    // A late queued settler is bought in its place (it gives as many as the queue would: settlerCopies).
    const copies = settlerCopies();
    if (settlerSupply(copies) - late.length * copies >= want) return null;
    // Every unit that founds a settlement and may be bought (not the turn-1 Founder: CanPurchase false); a
    // civilization's own settler comes through the game's answer.
    const defs = GameInfo.Units?.filter((d) => isSettler(d) && d.CanPurchase !== false && d.CanPurchase !== "false" && d.CanTrain !== false && d.CanTrain !== "false") ?? [];
    const threatened = new Set((threats ?? []).map((t) => `c:${t.settlement.x}-${t.settlement.y}`));
    // A city holding a late settler first: the purchase takes its place.
    const holding = (c) => late.some((l) => sidOf(l.city) === sidOf(c));
    for (const city of ownSettlements().filter((c) => !threatened.has(sidOf(c))).sort((a, b) => Number(holding(b)) - Number(holding(a)) || (b.population ?? 0) - (a.population ?? 0))) {
        // Only where a safe site lies within reach of a settler starting there (X7).
        if (!safe(() => safeSiteFrom(city.location, war.risk), true)) continue;
        for (const def of defs) {
            const args = { UnitType: def.$hash };
            const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
            if (!r?.Success && !r?.InsufficientFunds) continue;
            const cost = Number(r.Cost ?? safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), Infinity));
            if (Number.isFinite(cost) && cost > 0) return { city, args, cost, name: def.Name, ok: !!r.Success, drop: late.find((l) => sidOf(l.city) === sidOf(city)) ?? null };
        }
    }
    return null;
}

// The final age ends the game: no settler trained in its last turns (training and a walk), nor bought (a walk)
// (research/24 F3: game 9 trained one at M67 of 70).
const FINAL_SETTLER_TRAIN_TURNS = 8;
const FINAL_SETTLER_BUY_TURNS = 5;

/** In the final age with no more than `turns` left? */
function finalAgeTooLate(turns) {
    const o = safe(() => ageOutlook(), null);
    return !!o?.isFinalAge && Number(o.turnsLeft) <= turns;
}

// A queued settler starts within this many turns (else it is late: bought instead, E4).
const SETTLER_SOON_TURNS = 2;

/** Queued settlers that will not start soon: behind an item with more than SETTLER_SOON_TURNS to go. @returns [{ city, index }] */
function lateQueuedSettlers() {
    const out = [];
    for (const city of ownSettlements()) {
        const queue = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        const i = queue.findIndex((q) => isSettler(queueUnitDef(q)));
        if (i <= 0) continue;
        const ahead = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
        if (i > 1 || ahead > SETTLER_SOON_TURNS) out.push({ city, index: i });
    }
    return out;
}

/** Drops a late settler's queue entry once we bought one in its place (the queue screen's cancel: RemoveAt). */
function dropQueued(drop) {
    if (drop) removeFromQueue(drop.city, drop.index);
}

/**
 * Settlers wanted on their way at once: two while we have few settlements or are below the cap less one
 * (research/23 E3: game 8, with caps of 3-5 «below half the cap» held for 4 turns, and Exploration had one
 * settler at a time at 4-7 of 8-9), else one, never past the cap.
 */
function settlersWanted(n, cap) {
    return n < EARLY_SETTLEMENTS || n < cap - 1 ? SETTLERS_EARLY : SETTLERS_LATER;
}

/** Buys a settler from the free gold when one is wanted and the game sells it (settlerOffer). @returns log entries */
export function buySettlers(budget, threats = [], { fill = false, past = 0 } = {}) {
    const offer = settlerOffer(threats, { fill, past });
    if (!offer || !offer.ok || offer.cost > budget.free()) return [];
    Game.CityCommands.sendRequest(offer.city.id, CityCommandTypes.PURCHASE, offer.args);
    dropQueued(offer.drop);
    budget.spend(offer.cost, { kind: "SETTLER", label: nameOf(offer.city) });
    return [{ key: "SETTLER_BOUGHT", args: [nameOf(offer.city), Math.round(offer.cost)] }];
}

/**
 * Far below the settlement cap (settlements < cap − 1): expansion comes first in any age and phase —
 * settlers overtake projects and wonders (research/22 A1).
 */
export function expansionDeficit() {
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements);
    const cap = Number(stats?.settlementCap);
    return Number.isFinite(n) && Number.isFinite(cap) && cap > 0 && n < cap - 1;
}

/** Settlements the military lever founds past the cap this pass (the strategy's pastCap; research/30 §1), else 0. */
const pastCapOf = (strategy) => (strategy?.militaryLever ? Math.max(0, Number(strategy.pastCap) || 0) : 0);

/** Settlers to found for our own military countdown (the strategy's military lever) while below the cap (and past it)? */
const leverSettlers = (unitOptions) => !!unitOptions?.strategy?.militaryLever && belowSettlementCap(pastCapOf(unitOptions.strategy));

const OPERATION_IVY = "PROJECT_OPERATION_IVY";

/**
 * Where Operation Ivy (+25 military points, research/26 §3.4) can still be ours before the game ends: the city running
 * it (finishing in time), else the city of ours that may start it (the Manhattan Project is ours, nobody did it) and
 * finishes it soonest, keeping out of Launch Pad cities. @returns { city, turns, queued } or null
 */
function ivyCity(turnsLeft) {
    const def = safe(() => GameInfo.Projects.lookup(OPERATION_IVY), null);
    if (!def) return null;
    let best = null;
    for (const c of ownSettlements()) {
        if (c.isTown) continue;
        if (queueTypes(c).includes(def.$hash)) {
            const t = Number(safe(() => c.BuildQueue.getTurnsLeft(def.$hash), NaN));
            return Number.isFinite(t) && t < turnsLeft ? { city: c, turns: t, queued: true } : null;
        }
        const pad = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD), null);
        if (cityHas(c, LAUNCH_PAD) || (pad && queueTypes(c).includes(pad.$hash))) continue;
        const r = safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { ProjectType: def.$hash }, false), null);
        if (!r?.Success || r.InProgress || r.InQueue) continue;
        const prod = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
        const cost = Number(safe(() => c.Production.getProjectProductionCost(OPERATION_IVY), def.Cost ?? 0)) || 0;
        const turns = prod > 0 && cost > 0 ? Math.ceil(cost / prod) : Infinity;
        if (turns < turnsLeft - 1 && (!best || turns < best.turns)) best = { city: c, turns, queued: false };
    }
    return best;
}

/**
 * What the final age still allows in the military race (research/26 §3.3): settlements we may found (the cap's room;
 * only settlers already on their way once it is too late to train one or with a war at our door), how many more past
 * the cap the Happiness a turn pays for (`over`: pastCapRoom) and Operation Ivy.
 * @returns { room, over, ivy } or null (not the final age)
 */
export function militaryRoom() {
    const o = safe(() => ageOutlook(), null);
    if (!o?.isFinalAge) return null;
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements) || 0;
    const cap = Number(stats?.settlementCap) || 0;
    const free = Math.max(0, cap - n);
    const blocked = war.near || finalAgeTooLate(FINAL_SETTLER_TRAIN_TURNS);
    const room = blocked ? Math.min(free, unitCount(isSettler)) : free;
    return { room, over: blocked ? 0 : pastCapRoom(n, cap), ivy: !!safe(() => ivyCity(Number(o.turnsLeft) || 0), null) };
}

// The military lever may found up to PAST_CAP_MAX settlements past the cap when they start our own countdown: a turn of
// it is 1000 score (research/30 §1: game 23 lost the score by 10, 2-4 settlements short from M41 to the end, with room
// for 1-2 under the cap). Each one over costs OVER_CAP_HAPPINESS in every settlement
// (TRAIT_MOD_PENALTY_OVER_SETTLEMENT_CAP_SETTLEMENTS).
export const PAST_CAP_MAX = 2;
const OVER_CAP_HAPPINESS = 5;

/** Settlements past the cap (at most PAST_CAP_MAX) whose cost our Happiness a turn still covers. */
function pastCapRoom(n, cap) {
    if (!(cap > 0)) return 0;
    const happiness = Number(safe(() => Players.get(pid()).Stats.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0;
    const now = OVER_CAP_HAPPINESS * Math.max(0, n - cap) * n; // already in the Happiness a turn
    let k = 0;
    while (k < PAST_CAP_MAX) {
        const total = Math.max(n, cap) + k + 1;
        if (happiness - (OVER_CAP_HAPPINESS * (total - cap) * total - now) < 0) break;
        k++;
    }
    return k;
}

/**
 * Operation Ivy for the military lever (the strategy's `ivy`: the settlements alone fall short): queued at the front
 * of the city that finishes it soonest. @returns log entries
 */
export function pushOperationIvy(strategy) {
    if (!strategy?.militaryLever || !strategy.ivy) return [];
    const o = safe(() => ageOutlook(), null);
    const at = safe(() => ivyCity(Number(o?.turnsLeft) || 0), null);
    if (!at || at.queued) return [];
    const def = GameInfo.Projects.lookup(OPERATION_IVY);
    Game.CityOperations.sendRequest(at.city.id, CityOperationTypes.BUILD, { ProjectType: def.$hash });
    toFront(at.city, def.$hash, projectSlot(at.city, def));
    return [{ key: "VICTORY_WORK", args: [nameOf(at.city), safe(() => Locale.compose(def.Name), OPERATION_IVY)] }];
}

// ---- after the win (game 40) ---------------------------------------------------------------------------------------

// What serves only a victory: the science projects (Innovation) and Operation Ivy (military points). Not Launch Satellite,
// which reveals the whole map (launchSatellite), nor the Launch Pad, a building like any other once the race is over (+18
// Science; buildings.xml).
const SATELLITE = "PROJECT_LAUNCH_SATELLITE";
const VICTORY_ONLY = new Set([...SCIENCE_PROJECTS, ...STANDING_SITE_PROJECTS, OPERATION_IVY].filter((t) => t !== SATELLITE));
/** Does this item (a hash or a type name) serve only a victory? */
const victoryOnly = (t) => VICTORY_ONLY.has(typeNameOf(t));

/**
 * After the win (the hud's outcome: SECURED, WON or DECIDED): a queued project that serves only a victory leaves its queue,
 * one a city a pass (root gotcha 54), progress or not: nothing it brings counts any more. Alone in its queue, the plan's next
 * building (else the cheapest the city can place) is appended first: an empty queue holds the turn. Game 40: from M49, with
 * 107 of 100 Innovation and the countdown running, 1,518 production went into Preparation, the Radio Telescope, a satellite,
 * a flight and two Launch Pads. @returns log entries
 */
export function dropVictoryWork() {
    const out = [];
    const plans = state.get().results?.plans;
    for (const city of ownSettlements()) {
        if (city.isTown) continue;
        const types = queueTypes(city);
        const i = types.findIndex(victoryOnly);
        if (i < 0) continue;
        if (types.every(victoryOnly)) {
            const r = plans ? queueNextBuildings(plans, sidOf(city), 1, { skip: victoryOnly }) : { queued: [] };
            if (r.queued.length === 0) {
                const fallback = cheapestBuilding(city, { skip: victoryOnly });
                if (!fallback) continue;
                Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, fallback.args);
            }
        }
        if (removeFromQueue(city, i)) {
            log.info(`queue: ${nameOf(city)}: ${typeNameOf(types[i])} leaves the queue, no victory to chase (queue was [${types.map(typeNameOf).join(", ")}])`);
            out.push({ key: "VICTORY_WORK_DROPPED", args: [nameOf(city), itemName(types[i])] });
        }
    }
    return out;
}

/**
 * Playing on after the game is decided (the hud's outcome WON or DECIDED): Launch Satellite once, which reveals the whole map
 * (MOD_LAUNCH_SATELLITE_REWARD_FROM_PROJECT, REVEAL_TYPE_ALL; MaxPlayerInstances 1: the game refuses it once done), at the end
 * of the queue of the city with a Launch Pad that runs it soonest. Nothing while it is queued or running somewhere.
 * @returns log entries
 */
export function launchSatellite() {
    const def = safe(() => GameInfo.Projects.lookup(SATELLITE), null);
    if (!def) return [];
    let best = null;
    for (const c of ownSettlements()) {
        if (c.isTown) continue;
        if (queueTypes(c).includes(def.$hash) || builtThisPass(c).has(SATELLITE)) return [];
        const r = safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { ProjectType: def.$hash }, false), null);
        if (r?.InProgress || r?.InQueue) return [];
        if (!r?.Success) continue;
        const turns = itemTurns(c, def.$hash) + Number(safe(() => c.BuildQueue.currentTurnsLeft, 0) || 0);
        if (!best || turns < best.turns) best = { city: c, turns };
    }
    if (!best) return [];
    Game.CityOperations.sendRequest(best.city.id, CityOperationTypes.BUILD, { ProjectType: def.$hash });
    noteBuilt(best.city, SATELLITE);
    return [{ key: "SATELLITE_QUEUED", args: [nameOf(best.city), safe(() => Locale.compose(def.Name), SATELLITE)] }];
}

/** Below the settlement cap (plus `extra` the military lever goes past it): a settler would be wanted? */
export function belowSettlementCap(extra = 0) {
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements);
    const cap = Number(stats?.settlementCap);
    return Number.isFinite(n) && Number.isFinite(cap) && cap > 0 && n < cap + Math.max(0, Number(extra) || 0);
}

/** Settlers we have or are training. */
export function settlersInFlight() {
    return unitCount(isSettler);
}

/**
 * Settlers one training or purchase gives (research/28 §4): one, plus our traits' extra copies of the units that found
 * settlements (EFFECT_PLAYER_ADJUST_UNIT_EXTRA_COPY on UNIT_CLASS_CREATE_TOWN: Carthage's colonists come in pairs).
 * Game 21: the two settlers wanted at the end of Antiquity were four, and with the new age's two free ones six walked
 * toward two free places.
 */
export function settlerCopies() {
    let extra = 0;
    for (const e of safe(() => traitEffects(), []) ?? []) {
        if (e.effect === "EFFECT_PLAYER_ADJUST_UNIT_EXTRA_COPY" && e.args?.Tag === "UNIT_CLASS_CREATE_TOWN") extra += Number(e.args.Amount) || 0;
    }
    return 1 + Math.max(0, extra);
}

/** Settlers we have, and those our queues will give (settlerCopies each). */
function settlerSupply(copies = settlerCopies()) {
    let n = 0;
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (isSettler(safe(() => GameInfo.Units.lookup(u.type), null))) n++;
    }
    for (const city of ownSettlements()) {
        for (const q of safe(() => city.BuildQueue.getQueue(), []) ?? []) if (isSettler(queueUnitDef(q))) n += copies;
    }
    return n;
}

/**
 * Units the autopilot wants trained now, in order: scouts (exploring) up to SCOUTS_WANTED,
 * then settlers (settling): two in flight while we have fewer than EARLY_SETTLEMENTS
 * settlements, then one at a time, never past the settlement cap.
 */
function unitsWanted(unitOptions) {
    const out = [];
    // A war at our door or a war risk (research/23 D3): a melee unit for every settlement near the enemy, the strongest
    // each city can train (with only a risk, while the gold income covers the upkeep, and one per risky leader:
    // guardedSettlements).
    if (unitOptions.defend && (war.near || (war.risk.length > 0 && goldIncome() >= 0))) {
        const guard = (def) => meleeStrength(def) > 0;
        const want = guardedSettlements();
        const n = Math.min(GUARDS_AT_ONCE, want - unitCount(guard));
        if (n > 0) out.push({ test: guard, n, key: "QUEUED_GUARD", target: want, order: (city) => bestDefenderOrder(city) });
    }
    // Enemy aircraft over us with a war at our door (research/36 §7: game 29's Russian Bomber hit our centres M60-M65 and
    // we had no aircraft): fighters, up to AIR_GUARDS_MAX, before the centres' strength below. A fighter intercepts only
    // within 3-5 tiles of its base (research/37 §3E), so only those based near a settlement the enemy aircraft reach count,
    // and one is trained only in a city whose Airfield covers it and has a free slot, the nearest first.
    const fighters = unitOptions.defend && war.near ? interceptorsWanted(unitOptions.threats ?? []) : null;
    if (fighters) out.push({ test: isInterceptor, n: fighters.n, key: "QUEUED_INTERCEPTOR", target: fighters.target, order: fighters.order, rank: fighters.rank });
    // A ground attacker at a lasting front (research/37 §7C, a bounded experiment), after the fighters (cover first).
    if (unitOptions.defend && !fighters) {
        const want = groundAttackersWanted(unitOptions.threats ?? []);
        if (want) out.push({ test: isGroundAttacker, n: want.n, key: "QUEUED_GROUND_ATTACKER", target: want.target, order: want.order, rank: want.rank });
    }
    // Warships for a lasting coastal front (research/37 §8B), from a city on the same water.
    if (unitOptions.defend) {
        const want = warshipsWanted(unitOptions.threats ?? [], unitsMayOvertake(unitOptions));
        if (want) out.push({ test: isWarshipDef, n: want.n, key: "QUEUED_WARSHIP", target: want.target, order: want.order, rank: want.rank });
    }
    // Defence: every settlement centre defends at the strongest melee unit obtained this age (research/37 §2; 20 with
    // none), whatever we carried over from the last age (game 29: carried Line Infantry met this want, and Modern's
    // centres stood at 20 for 35 turns). One as strong as the best we can train until one is obtained this age, in a
    // peaceful final push and at a deficit too; a stronger one later as before: not while the gold income is below zero
    // (upkeep; game 6: Horsemen trained with the treasury at 0), and in the final push only under a threat or a war at our
    // door (game 16: a Landship and then a Tank took the capital's production for 15 turns in peace; game 35: a Tank, 65
    // over our Cuirassier's 55, took a city kept for a Launch Pad M47-M51 against Augustus's war risk, and no war came).
    // One in a queue does. Only one stronger than the centres' defence now (a Warrior raises nothing above the base 20).
    const peacefulPush = unitOptions.strategy?.phase === "COMMIT" && (unitOptions.threats ?? []).length === 0 && !war.near;
    if (unitOptions.defend) {
        const best = bestTrainableMelee();
        const obtained = meleeThisAge()?.strength ?? 0;
        const strong = (def) => best > 0 && meleeStrength(def) >= best;
        if (best > Math.max(CENTRE_BASE, obtained) && (obtained === 0 || (goldIncome() >= 0 && !peacefulPush)) && queuedCount(strong) === 0) {
            out.push({ test: strong, n: 1, key: "QUEUED_MELEE", target: best });
        }
    }
    if (unitOptions.explore) {
        const n = SCOUTS_WANTED - unitCount(isScout);
        if (n > 0) out.push({ test: isScout, n, key: "QUEUED_SCOUT", target: SCOUTS_WANTED });
    }
    // Explorers (artifacts): with «Разведка», unless the strategy leaves them out (science and economy:
    // museums are culture's; research/21 E3).
    if (unitOptions.explorers ?? unitOptions.explore) {
        // Explorers exist in the Modern age only; the map is scanned only when one is missing.
        const missing = GameInfo.Units?.find((d) => isExplorer(d)) ? EXPLORERS_WANTED - unitCount(isExplorer) : 0;
        if (missing > 0) {
            const sites = artifactSites();
            if (sites.dig.length + sites.study.length > 0) out.push({ test: isExplorer, n: missing, key: "QUEUED_EXPLORER", target: EXPLORERS_WANTED });
        }
    }
    // Economy focus: merchants while trade routes are open (imported resources count for the
    // Antiquity path and GDP), up to MERCHANTS_AT_ONCE at a time.
    if (unitOptions.merchants && unitOptions.victory === "ECONOMIC") {
        const want = Math.min(MERCHANTS_AT_ONCE, openTradeRoutes({ profile: unitOptions.profile }));
        const n = want - unitCount(isMerchant);
        if (n > 0) out.push({ test: isMerchant, n, key: "QUEUED_MERCHANT", target: want });
    }
    // Settlers: with «Поселенцы», unless the strategy stops training them (the final age: research/21 C3),
    // and only with a site to go to (C3b: our search's picks, or the game's suggestions from the capital).
    // None with a war at our door (research/23 D9: game 8, a settler trained the day after the declaration
    // took 7 turns ahead of its city's defender, then sat idle 8 turns; another was killed on its way).
    if ((unitOptions.trainSettlers ?? unitOptions.settlers) && !war.near && !finalAgeTooLate(FINAL_SETTLER_TRAIN_TURNS) && sitesKnown()) {
        const stats = safe(() => Players.get(pid()).Stats, null);
        const settlements = Number(stats?.numSettlements ?? ownSettlements().length) || 0;
        // The military lever may go past the cap (research/30 §1).
        const cap = (Number(stats?.settlementCap) || Infinity) + pastCapOf(unitOptions.strategy);
        // Two at a time while few settlements or below the cap less one (research/22 A1, research/23 E3).
        const want = Math.min(settlersWanted(settlements, cap), Math.max(0, cap - settlements));
        // One training may give several (settlerCopies: Carthage's colonists come in pairs).
        const copies = settlerCopies();
        const n = Math.ceil((want - settlerSupply(copies)) / copies);
        if (n > 0) out.push({ test: isSettler, n, key: "QUEUED_SETTLER", target: want });
    }
    return out;
}

const isMilitary = (def) => !!def && def.CoreClass === "CORE_CLASS_MILITARY" && def.Domain !== "DOMAIN_SEA" && def.Domain !== "DOMAIN_AIR";
const isSoldierDef = (def) => !!def && def.CoreClass === "CORE_CLASS_MILITARY";
/** A ground attacker (UNIT_CLASS_GROUND_ATTACKER: Trench Fighter, Dive Bomber, Stuka): made to strike units (research/37 §7A). */
const isGroundAttacker = (def) => !!def && !!GameInfo.TypeTags?.find((t) => t.Type === def.UnitType && t.Tag === "UNIT_CLASS_GROUND_ATTACKER");
const AIR_ATTACKERS_MAX = 1;   // ground attackers wanted at most (research/37 §7C: a bounded experiment)
const LASTING_FRONT_TURNS = 3; // a settlement threatened this many turns in a row is a lasting front
const frontSince = new Map();  // settlement "x,y" -> { first, last }: the turns it has been threatened in a row
let groundNoted = -1;          // the turn UI.log said no Airfield could take a ground attacker for a lasting front

/** The threatened settlements that have been threatened LASTING_FRONT_TURNS turns in a row (noted each pass). */
function lastingFronts(threats) {
    const turn = Number(Game.turn) || 0;
    for (const t of threats) {
        const k = `${t.settlement.x},${t.settlement.y}`;
        const f = frontSince.get(k);
        if (!f || f.last < turn - 1 || f.first > turn) frontSince.set(k, { first: turn, last: turn });
        else f.last = Math.max(f.last, turn);
    }
    for (const [k, f] of [...frontSince]) if (f.last < turn - 1 || f.first > turn) frontSince.delete(k);
    return threats.filter((t) => {
        const f = frontSince.get(`${t.settlement.x},${t.settlement.y}`);
        return !!f && turn - f.first + 1 >= LASTING_FRONT_TURNS;
    });
}

/**
 * A ground attacker (research/37 §7C, a bounded experiment): up to AIR_ATTACKERS_MAX of ours and queued while a settlement
 * is a lasting front (threatened LASTING_FRONT_TURNS turns in a row by land raiders or ships), trained only in a city
 * whose Airfield has a free slot and lies within the plane's Range of that front (no Airfield is planned for it: the
 * science flights' Airfield is siteHelps' decision), the strongest against units (RangedCombat), the nearest first. When
 * an Airfield exists but none is in reach, UI.log says so once a turn. @returns { n, target, order(city), rank(city) } or null
 */
function groundAttackersWanted(threats) {
    const fronts = lastingFronts(threats).filter((t) => Number(t.land) > 0 || Number(t.ships) > 0);
    if (fronts.length === 0) return null;
    const kinds = GameInfo.Units?.filter((d) => isGroundAttacker(d) && d.CanTrain !== false && d.CanTrain !== "false") ?? [];
    if (kinds.length === 0) return null;
    const n = AIR_ATTACKERS_MAX - unitCount(isGroundAttacker);
    if (n <= 0) return null;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const bases = (safe(() => airBases(), []) ?? []).filter((b) => b.city);
    if (bases.length === 0) return null;
    const stat = (def, k) => Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.[k], 0)) || 0;
    const order = (city) => {
        const base = bases.find((b) => sameId(b.city, city.id) && b.free > 0);
        if (!base) return null;
        let best = null;
        for (const def of kinds) {
            if (!fronts.some((t) => dist(base.at, t.settlement) <= (stat(def, "Range") || 8))) continue;
            const args = { UnitType: def.$hash };
            if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
            const rank = stat(def, "RangedCombat");
            if (!best || rank > best.rank) best = { args, name: def.Name, rank };
        }
        return best;
    };
    const cities = ownSettlements().filter((c) => !c.isTown);
    if (!cities.some((c) => order(c))) {
        if (groundNoted !== Game.turn) {
            groundNoted = Game.turn;
            log.warn(`air: no ground attacker for ${fronts.map((t) => t.settlement.name ?? `${t.settlement.x},${t.settlement.y}`).join(", ")} (a front ${LASTING_FRONT_TURNS}+ turns): no Airfield of ours with a free slot within a ground attacker's range that can train one (bases: ${bases.map((b) => `${b.at.x},${b.at.y} free ${b.free}`).join("; ")})`);
        }
        return null;
    }
    return { n, target: AIR_ATTACKERS_MAX, order, rank: (city) => Math.min(Infinity, ...fronts.map((t) => dist(city.location, t.settlement))) };
}

/** A warship (core/xpl-naval.js: a screen, a ranged ship or a submarine). */
const isWarshipDef = (def) => isWarship(shipRole(def));
const WARSHIP_NEAR = 10; // our warships this close to a coastal front count against the ones it wants trained
let warshipNoted = -1;   // the turn UI.log said no city on a coastal front's water could train a warship

/** The water areas next to a tile (GameplayMap.getAreaId of its water neighbours), or null when the game gives none. */
function waterAreas(loc) {
    if (typeof GameplayMap.getAreaId !== "function") return null;
    const out = new Set();
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, 1), []) ?? []) {
        const l = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!l || !safe(() => GameplayMap.isWater(l.x, l.y), false)) continue;
        const a = safe(() => GameplayMap.getAreaId(l.x, l.y), null);
        if (a !== null && a !== undefined && a >= 0) out.add(a);
    }
    return out;
}

/**
 * Warships for a lasting coastal front (research/37 §8B, Phase 6): a settlement threatened by ships LASTING_FRONT_TURNS turns
 * in a row wants up to NAVAL.SHIPS_MAX warships, ours within WARSHIP_NEAR of it and those queued counted; one is trained
 * only in a city on the same water (a water tile next to it in an area of a water tile next to the front:
 * GameplayMap.getAreaId; a lake city's ship would never reach the ocean), the best ranged ship it can build (RangedCombat),
 * else the best screen (Combat); never in a space city. The city where it arrives soonest (its queue's wait, its training and
 * its sailing: game 39, Мотия's Cog for Севилья waited 20 turns behind the Tomb of Askia, a Bazaar and a Sawmill, and came
 * after the raids had ended), within DEFENDER_ARRIVAL_TURNS. None: UI.log once a turn.
 * @param ahead may units overtake a wonder or a project in production (unitsMayOvertake)
 * @returns { n, target, order(city), rank(city) } or null
 */
function warshipsWanted(threats, ahead = true) {
    const fronts = lastingFronts(threats).filter((t) => Number(t.ships) > 0);
    if (fronts.length === 0) return null;
    const kinds = GameInfo.Units?.filter((d) => isWarshipDef(d) && d.CanTrain !== false && d.CanTrain !== "false") ?? [];
    if (kinds.length === 0) return null;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const near = (safe(() => Players.get(pid()).Units.getUnits(), []) ?? []).filter((u) => isWarshipDef(safe(() => GameInfo.Units.lookup(u.type), null))
        && !!u.location && fronts.some((t) => dist(u.location, t.settlement) <= WARSHIP_NEAR)).length;
    const n = NAVAL.SHIPS_MAX - near - queuedCount(isWarshipDef);
    if (n <= 0) return null;
    const frontWater = new Set();
    let unknown = false;
    for (const t of fronts) {
        const a = waterAreas(t.settlement);
        if (a === null) unknown = true;
        else for (const x of a) frontWater.add(x);
    }
    const stat = (def, k) => Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.[k], 0)) || 0;
    // A city's best warship and when it would reach the nearest front: the wait for its queue, the training, the sailing.
    const seen = new Map();
    const option = (city) => {
        const key = sidOf(city);
        if (seen.has(key)) return seen.get(key);
        let best = null;
        const mine = waterAreas(city.location);
        if (mine === null ? unknown : [...mine].some((a) => frontWater.has(a))) {
            for (const def of kinds) {
                const args = { UnitType: def.$hash };
                if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
                const rank = shipRole(def) === "RANGED" ? 1000 + stat(def, "RangedCombat") : stat(def, "Combat");
                if (!best || rank > best.rank) best = { args, name: def.Name, rank, def };
            }
        }
        if (best) {
            const sail = Math.min(Infinity, ...fronts.map((t) => travelTurns(best.def, dist(city.location, t.settlement))));
            best.arrival = turnsUntilFree(city, ahead) + unitTurns(city, best.args.UnitType) + sail;
        }
        seen.set(key, best);
        return best;
    };
    const order = (city) => {
        const o = option(city);
        return o && o.arrival <= DEFENDER_ARRIVAL_TURNS ? o : null;
    };
    const cities = ownSettlements().filter((c) => !c.isTown);
    if (!cities.some((c) => order(c))) {
        if (warshipNoted !== Game.turn) {
            warshipNoted = Game.turn;
            const late = cities.map((c) => ({ c, o: option(c) })).filter((x) => x.o).sort((a, b) => a.o.arrival - b.o.arrival);
            const why = late.length === 0 ? "no city on that water can train one"
                : `none arrives within ${DEFENDER_ARRIVAL_TURNS} turns (${late.slice(0, 3).map((x) => `${nameOf(x.c)} ${x.o.arrival}t`).join(", ")})`;
            log.warn(`naval: no warship for ${fronts.map((t) => t.settlement.name ?? `${t.settlement.x},${t.settlement.y}`).join(", ")} (ships ${LASTING_FRONT_TURNS}+ turns): ${why}`);
        }
        return null;
    }
    return { n, target: NAVAL.SHIPS_MAX, order, rank: (city) => order(city)?.arrival ?? Infinity };
}

/**
 * Our settlements that want fighter cover (research/37 §7B), the most important first: a Launch Pad city (rank 0: the
 * science victory needs an undamaged pad), one enemy aircraft hit lately (1: airRaidTargets), one enemy aircraft in sight
 * reach from their base (2: hostileAircraft). @returns [{ x, y, name, why, rank }]
 */
export function airCoverTargets() {
    const out = new Map();
    const add = (s, why, rank) => {
        const k = `${s.x},${s.y}`;
        const o = out.get(k);
        if (!o) out.set(k, { x: s.x, y: s.y, name: s.name, why, rank });
        else if (rank < o.rank) Object.assign(o, { why, rank });
    };
    for (const r of safe(() => airRaidTargets(), []) ?? []) add(r, "hit from the air lately", 1);
    for (const a of safe(() => hostileAircraft(), []) ?? []) for (const t of a.targets) add(t, `${a.type} in reach`, 2);
    for (const o of out.values()) {
        const city = ownSettlements().find((c) => c.location.x === o.x && c.location.y === o.y);
        if (city && safe(() => cityHas(city, LAUNCH_PAD), false)) Object.assign(o, { rank: 0, why: `${o.why}, its Launch Pad` });
    }
    return [...out.values()].sort((a, b) => a.rank - b.rank);
}

/** A fighter: it intercepts enemy aircraft within its range from its base by itself (UNIT_CLASS_INTERCEPTOR). */
const isInterceptor = (def) => !!def && !!GameInfo.TypeTags?.find((t) => t.Type === def.UnitType && t.Tag === "UNIT_CLASS_INTERCEPTOR");
const AIR_GUARDS_MAX = 2; // interceptors wanted at most
let airNoted = -1;        // the turn UI.log said no city could train a fighter where it is needed

/**
 * Fighters still wanted against the enemy aircraft in sight (hostileAircraft: those reaching our settlements), counting
 * only ours based within their intercept range of such a settlement (fighterCover) and those queued in a city whose
 * Airfield covers one (research/37 §3E: they were counted empire-wide and trained in any city). The order: a city whose
 * Airfield covers a target and has a free slot (airBases), the nearest to the targets first. None: UI.log says so once a
 * turn. @returns { n, target, order(city), rank(city) } or null
 */
function interceptorsWanted(threats) {
    const enemy = safe(() => hostileAircraft(), []) ?? [];
    // Settlements enemy aircraft hit lately count too, with none in sight (research/37 §7B: the Combat event's memory).
    const raids = safe(() => airRaidTargets(), []) ?? [];
    const target = Math.min(AIR_GUARDS_MAX, enemy.length + (raids.length > 0 ? 1 : 0));
    if (target <= 0) return null;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const targets = [...enemy.flatMap((e) => e.targets), ...raids, ...threats.filter((t) => Number(t.air) > 0).map((t) => t.settlement)]
        .filter((t, i, all) => all.findIndex((o) => o.x === t.x && o.y === t.y) === i);
    const covers = (at, range) => targets.some((t) => dist(at, t) <= range);
    const bases = safe(() => airBases(), []) ?? [];
    const queuedIn = (city) => (safe(() => city.BuildQueue.getQueue(), []) ?? []).filter((q) => isInterceptor(queueUnitDef(q))).length;
    const baseOf = (city) => bases.find((b) => b.city && sameId(b.city, city.id) && covers(b.at, b.range));
    const cities = ownSettlements().filter((c) => !c.isTown);
    const have = (safe(() => fighterCover(isInterceptor), []) ?? []).filter((f) => covers(f.at, f.range)).length
        + cities.filter((c) => baseOf(c)).reduce((n, c) => n + queuedIn(c), 0);
    const n = target - have;
    if (n <= 0) return null;
    const open = (city) => {
        const b = baseOf(city);
        return !!b && b.free - queuedIn(city) > 0;
    };
    if (!cities.some(open)) {
        if (airNoted !== Game.turn) {
            airNoted = Game.turn;
            const list = bases.map((b) => `${b.at.x},${b.at.y} free ${b.free} range ${b.range}`).join("; ") || "none";
            log.warn(`air: no fighter for ${targets.map((t) => t.name ?? `${t.x},${t.y}`).join(", ")}: no Airfield of ours with a free slot covers them (bases: ${list})`);
        }
        return null;
    }
    return {
        n, target,
        order: (city) => (open(city) ? strongestOrder(city, isInterceptor) : null),
        rank: (city) => Math.min(Infinity, ...targets.map((t) => dist(city.location, t))),
    };
}

/** The strongest unit of a kind this city can train now (highest Tier, then the later one), as BUILD args. */
function strongestOrder(city, test) {
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        if (!test(def) || def.CanTrain === false || def.CanTrain === "false") continue;
        const args = { UnitType: def.$hash };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        const rank = (Number(def.Tier) || 0) * 1000 + (def.$index ?? 0);
        if (!best || rank > best.rank) best = { args, name: def.Name, rank };
    }
    return best;
}

// Seen in game: with every empty queue taking the advisor's military unit and a lasting threat
// training defenders, ~25 soldiers filled every tile around a city.
const PEACE_SOLDIERS_PER_SETTLEMENT = 2; // the advisor's military units only below this many per settlement...
const WAR_SOLDIERS_PER_SETTLEMENT = 4;   // ...defenders for a threatened settlement below this many

/** Room for one more soldier: ours on the map and in training below perSettlement × settlements? */
function soldierRoom(perSettlement) {
    const soldier = (def) => !!def && def.CoreClass === "CORE_CLASS_MILITARY";
    return unitCount(soldier) < perSettlement * Math.max(1, ownSettlements().length);
}

// A unit's melee strength: a settlement centre defends at the strongest melee unit obtained this age (research/37 §2).
export { meleeStrength };

/**
 * The strongest melee unit this city can train now (BUILD) or buy now within `budget` gold
 * (PURCHASE, like the production list's purchase: CityCommands {UnitType}).
 * @returns { args, name, strength, cost } or null
 */
function bestDefenderOrder(city, { buy = false, budget = Infinity } = {}) {
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        const strength = meleeStrength(def);
        if (!(strength > 0) || def.CanTrain === false || def.CanTrain === "false") continue;
        if (best && strength <= best.strength) continue;
        const args = { UnitType: def.$hash };
        let cost = 0;
        if (buy) {
            const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
            if (!r?.Success) continue;
            cost = Number(r.Cost ?? safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), Infinity));
            if (!Number.isFinite(cost) || cost > budget) continue;
        } else if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        best = { args, name: def.Name, strength, cost };
    }
    return best;
}

/** The strongest melee unit any of our cities can train now (0: none). */
function bestTrainableMelee() {
    let best = 0;
    const cities = ownSettlements().filter((c) => !c.isTown);
    for (const def of GameInfo.Units ?? []) {
        const strength = meleeStrength(def);
        if (!(strength > best) || def.CanTrain === false || def.CanTrain === "false") continue;
        if (cities.some((c) => safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { UnitType: def.$hash }, false), null)?.Success)) best = strength;
    }
    return best;
}

/**
 * The strongest ranged land unit (RangedCombat; not a siege unit) this city can train now, or buy now within `budget`
 * (game 10: ships shot our towns for 20 turns and only warriors came). Against ships (`ships`) the one with the highest
 * Bombard, siege units too: land units fire at ships with it (research/37 §3D: a Ballista 30, an Archer 10).
 * @returns { args, name, strength, cost } or null
 */
function bestRangedOrder(city, { buy = false, budget = Infinity, ships = false } = {}) {
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        if (!(isRangedGuard(def) || (ships && isSiegeGuard(def))) || def.CanTrain === false || def.CanTrain === "false") continue;
        const strength = ships ? antiShipStrength(def) : Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.RangedCombat, 0)) || 0;
        if (best && strength <= best.strength) continue;
        const args = { UnitType: def.$hash };
        let cost = 0;
        if (buy) {
            const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
            if (!r?.Success) continue;
            cost = Number(r.Cost ?? safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), Infinity));
            if (!Number.isFinite(cost) || cost > budget) continue;
        } else if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        best = { args, name: def.Name, strength, cost };
    }
    return best;
}

/**
 * What a threatened settlement lacks: melee guards (guardsWanted) and ranged ones (rangedWanted: against ships, and one
 * behind the screen against a land army). Ships alone: ranged first; with land raiders: melee first. Guards on their way
 * count when they arrive within `within` turns (research/36 §1). `support: false` leaves the ranged support against a
 * land army out (a purchase buys only what holds the settlement). @returns "MELEE" | "RANGED" | null
 */
function defenderNeed(t, threats, { within = Infinity, support = true } = {}) {
    // Bought this turn: the game shows them only later, so they count here.
    const b = defenderBought.get(`${t.settlement.x},${t.settlement.y}`);
    const extra = b?.turn === Game.turn ? b : { melee: 0, ranged: 0 };
    const melee = guardsWanted(t) > guardsFor(t, undefined, threats, { within }) + extra.melee;
    const ranged = rangedWanted(t, { support }) > guardsFor(t, undefined, threats, { ranged: true, within }) + extra.ranged;
    if (melee && ranged) return (Number(t.land) || 0) > 0 ? "MELEE" : "RANGED";
    return melee ? "MELEE" : ranged ? "RANGED" : null;
}

/** The strongest land military unit the city can train now (highest Tier, then the later one). */
function bestMilitaryOrder(city) {
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        if (!isMilitary(def) || def.CanTrain === false || def.CanTrain === "false") continue;
        const args = { UnitType: def.$hash };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        const rank = (Number(def.Tier) || 0) * 1000 + (def.$index ?? 0);
        if (!best || rank > best.rank) best = { args, name: def.Name, rank };
    }
    return best;
}

/**
 * A settlement with hostile units around it (units' threatenedSettlements): its nearest city
 * trains the strongest military unit it can, unless one is already in its queue, the
 * settlement has as many of our soldiers around it (or walking there) as hostile units, or we
 * have WAR_SOLDIERS_PER_SETTLEMENT per settlement already.
 */
const guardOrders = new Map(); // city key -> unit type hashes the autopilot queued there as guards or defenders

/** Remembers a guard or defender the autopilot queued (dropped again at peace: dropLeftoverDefenders). */
function noteGuardOrder(city, hash) {
    if (!guardOrders.has(sidOf(city))) guardOrders.set(sidOf(city), new Set());
    guardOrders.get(sidOf(city)).add(hash);
}

/**
 * At peace (no war, no war risk, nothing threatened) the guards and defenders the autopilot queued and that have not
 * started are taken out of the queues (research/24: leftover defenders were still built after the peace). The item in
 * production stays. UI.log names them.
 */
export function dropLeftoverDefenders(threats = []) {
    if (guardOrders.size === 0 || war.atWar.length > 0 || war.risk.length > 0 || (threats ?? []).length > 0) return;
    const RemoveAt = globalThis.CityOperationsParametersValues?.RemoveAt;
    if (RemoveAt === undefined) return;
    for (const city of ownSettlements()) {
        const mine = guardOrders.get(sidOf(city));
        if (!mine || editedThisPass(city)) continue;
        const queue = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        // From the back, so the positions still to remove stay right.
        let removed = false;
        for (let i = queue.length - 1; i >= 1; i--) {
            const def = queueUnitDef(queue[i]);
            if (!def || !mine.has(def.$hash)) continue;
            const args = { InsertMode: RemoveAt, QueueLocation: i };
            if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
            removed = true;
            log.info(`queue: ${nameOf(city)}: ${def.UnitType} dropped, the war is over`);
        }
        if (removed) noteEdited(city);
    }
    guardOrders.clear();
}

const trainedFor = new Map();   // threatened settlement "x,y" -> { sid, hash }: the defender queued for it
const trainingNoted = new Map(); // threatened settlement "x,y" -> the turn UI.log said why none was trained

/** Turns a unit of this kind walks `d` tiles (its BaseMoves a turn, 2 when unknown). */
const travelTurns = (def, d) => Math.ceil(d / Math.max(1, Number(def?.BaseMoves) || 2));

/** Does this city's queue hold a unit of this type? */
const queueHasUnit = (city, hash) => (safe(() => city.BuildQueue.getQueue(), []) ?? []).some((q) => queueUnitDef(q)?.$hash === hash);

/**
 * Defenders trained for a threatened settlement short of guards (on their way ones count): by the city that brings the
 * defender soonest, its training plus its walk there (research/36 §9: the nearest city trained it, whatever the walk, and
 * a soldier of any kind already queued there stopped the search). A soldier already queued within DEFENDER_REACH covers
 * one settlement when it is of the role wanted and arrives within DEFENDER_ARRIVAL_TURNS; the defender queued for a
 * settlement covers it while it is still in its city's queue. A city with space work comes last, unless for its own
 * defence (research/34 §6). @returns log entries
 */
function trainDefenders(threats, used, exposed = []) {
    const out = [];
    const left = ageEndTurns(); // an age's last turns (the final age: all of it): only a defender done before it ends
    // Not in an infected city: the unit would appear on the plague (game 18).
    const cities = ownSettlements().filter((c) => !c.isTown && !infected(c));
    if (threats.length === 0) defenderTrainers.clear();
    if (threats.length + exposed.length === 0) trainedFor.clear();
    const claimed = new Set(); // cities whose queued soldier covers a settlement this pass
    // Exposed settlements after the threatened ones (research/37 §4C): a holder when none is there or coming, and none was
    // bought for it this turn; trained only where it arrives in time, like a defender.
    const holderless = (e) => {
        const b = defenderBought.get(`${e.settlement.x},${e.settlement.y}`);
        const h = holderDetail(e);
        return h.present.length + h.incoming.length === 0 && !(b?.turn === Game.turn && b.melee > 0);
    };
    for (const t of [...threats, ...exposed.map((e) => ({ ...e, exposed: true, count: 0 }))]) {
        // Melee guards: one per land raider, one on the centre whatever the raiders (research/24 W2); ranged ones
        // against ships (game 10), and one behind a land army's screen (research/36 §5).
        const need = t.exposed ? (holderless(t) ? "MELEE" : null) : defenderNeed(t, threats);
        if (!need || !soldierRoom(WAR_SOLDIERS_PER_SETTLEMENT)) continue;
        const key = `${t.settlement.x},${t.settlement.y}`;
        const mine = trainedFor.get(key);
        if (mine && cities.some((c) => sidOf(c) === mine.sid && queueHasUnit(c, mine.hash))) continue;
        trainedFor.delete(key);
        // Against ships, siege units too (their Bombard: research/37 §3D).
        const ships = Number(t.ships) > 0;
        const role = (def) => (need === "RANGED" ? isRangedGuard(def) || (ships && isSiegeGuard(def)) : meleeStrength(def) > 0);
        const own = (c) => c.location?.x === t.settlement.x && c.location?.y === t.settlement.y;
        // A city with space work only when no other within reach can, or for its own defence (research/34 §6: game 28's
        // capital trained Tanks for Sirjan and Ardebil, new settlements, while its Launch Pad, ordered M51, waited until M73).
        const spaceLast = (c) => (!own(c) && spaceWorkIn(c) ? 1 : 0);
        const near = cities.map((c) => ({ c, d: safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, t.settlement.x, t.settlement.y), Infinity) }))
            .filter((x) => x.d <= DEFENDER_REACH);
        let covered = false;
        let best = null;
        const why = [];
        for (const { c, d } of near) {
            const queue = safe(() => c.BuildQueue.getQueue(), []) ?? [];
            const queued = queue.map((q) => queueUnitDef(q)).find((def) => isMilitary(def));
            if (queued) {
                // Already training a soldier: it covers this settlement if it is of the role wanted and comes in time.
                const first = queueUnitDef(queue[0])?.$hash === queued.$hash;
                const wait = first ? Number(safe(() => c.BuildQueue.currentTurnsLeft, NaN)) : unitTurns(c, queued.$hash) + turnsUntilFree(c);
                const eta = (Number.isFinite(wait) ? wait : unitTurns(c, queued.$hash)) + travelTurns(queued, d);
                if (!covered && role(queued) && !claimed.has(sidOf(c)) && eta <= DEFENDER_ARRIVAL_TURNS) {
                    claimed.add(sidOf(c));
                    covered = true;
                    break;
                }
                why.push(`${nameOf(c)} trains ${queued.UnitType}`);
                continue;
            }
            if (used.has(sidOf(c))) continue;
            // A melee unit (it holds the centre, and the centres' defence follows it), else the strongest; ranged: the
            // strongest ranged unit.
            // An exposed settlement's holder: a melee unit only.
            const o = need === "RANGED" ? bestRangedOrder(c, { ships }) ?? bestMilitaryOrder(c) : bestDefenderOrder(c) ?? (t.exposed ? null : bestMilitaryOrder(c));
            if (!o) continue;
            const def = safe(() => GameInfo.Units.lookup(o.args.UnitType), null);
            // Done within MILITARY_MAX_TURNS (game 18: a Landship at 6 production a turn, 33 turns); none: the purchase
            // step buys one (buyDefenders).
            const build = unitTurns(c, o.args.UnitType);
            const eta = build + travelTurns(def, d);
            if (build > MILITARY_MAX_TURNS || !doneInAge(c, o.args.UnitType, left) || eta > DEFENDER_ARRIVAL_TURNS) {
                why.push(`${nameOf(c)} ${def?.UnitType ?? "?"} in ${eta}t`);
                continue;
            }
            const rank = spaceLast(c) * 1000 + eta;
            if (!best || rank < best.rank) best = { c, o, eta, rank };
        }
        if (covered) continue;
        if (!best) {
            if (trainingNoted.get(key) !== Game.turn) {
                trainingNoted.set(key, Game.turn);
                log.warn(`defenders: none trained for ${t.settlement.name} (${need}): ${why.join(", ") || "no city within reach trains one"}`);
            }
            continue;
        }
        const { c: city, o: order } = best;
        defenderTrainers.add(sidOf(city));
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, order.args);
        noteGuardOrder(city, order.args.UnitType);
        trainedFor.set(key, { sid: sidOf(city), hash: order.args.UnitType });
        log.info(`defenders: ${safe(() => GameInfo.Units.lookup(order.args.UnitType)?.UnitType, "?")} queued in ${nameOf(city)} for ${t.settlement.name}, there in ${best.eta} turn(s)`);
        out.push(t.exposed ? { key: "QUEUED_HOLDER", args: [nameOf(city), Locale.compose(order.name), t.settlement.name] }
            : { key: "QUEUED_DEFENDER", args: [nameOf(city), Locale.compose(order.name), t.settlement.name, t.count] });
        used.add(sidOf(city));
    }
    return out;
}

// Military units are trained only where they are done within this many turns (game 18: a Landship for 33 turns after a
// war declaration); defenders come from cities within DEFENDER_REACH of the threatened settlement, else are bought.
const MILITARY_MAX_TURNS = 10;
const DEFENDER_REACH = 12;
const DEFENDER_ARRIVAL_TURNS = 16; // ...and they are trained and walk there within this many turns (research/36 §9)
const DEFICIT_KEEP_TURNS = 3;      // a defender bought at an income below zero leaves this many turns of the deficit
const defenderBought = new Map();  // threatened settlement "x,y" -> { turn, melee, ranged }: defenders bought for it this turn
const defenderTrainers = new Set(); // cities training a defender for a threatened settlement (frontLoadUnits: slot 0)

/** Turns this city needs to train this unit (its cost over the city's production; Infinity: no production). */
function unitTurns(city, unitType) {
    const def = safe(() => GameInfo.Units.lookup(unitType), null);
    const cost = Number(safe(() => city.Production.getUnitProductionCost(def.UnitType), def?.Cost ?? 0)) || 0;
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    return prod > 0 ? Math.ceil(cost / prod) : Infinity;
}

/** Is this settlement infected with the plague (the city banner's status: city.isInfected)? */
const infected = (city) => !!safe(() => city.isInfected, false);

/** A unit of this kind the city can train now, as BUILD args (not the turn-1 Founder). */
function unitOrder(city, test) {
    for (const def of GameInfo.Units ?? []) {
        if (!test(def) || def.CanTrain === false || def.CanTrain === "false") continue;
        const args = { UnitType: def.$hash };
        if (safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) return { args, name: def.Name };
    }
    return null;
}

/**
 * Wanted scouts and settlers go into the biggest cities, even with a busy queue (a city that
 * builds wonder after wonder would never train a settler otherwise): appended now, moved to
 * the front by frontLoadUnits once the game has them. @returns { entries, used: Set of city keys }
 */
function trainWantedUnits(unitOptions) {
    const used = new Set();
    // The centres' melee unit queued before one was obtained elsewhere (a defender, a purchase): out of its queue.
    if (unitOptions.defend) dropSpareMelee();
    // Defenders first: a settlement under threat cannot wait for scouts or settlers; then exposed settlements' holders.
    const entries = trainDefenders(unitOptions.threats ?? [], used, unitOptions.defend ? unitOptions.exposed ?? [] : []);
    // The city free soonest first (it would not move the unit ahead of an item with progress), then the biggest.
    const ahead = unitsMayOvertake(unitOptions) || (expansionDeficit() && unitOptions.strategy?.phase !== "COMMIT") || leverSettlers(unitOptions);
    const cities = ownSettlements().filter((c) => !c.isTown)
        .sort((a, b) => turnsUntilFree(a, ahead) - turnsUntilFree(b, ahead) || (b.population ?? 0) - (a.population ?? 0));
    // A settler is not trained in a threatened settlement (research/22 A1: game 7, the second settler could not
    // stand on the raided capital's centre, stepped out and was killed).
    const threatened = new Set((unitOptions.threats ?? []).map((t) => `c:${t.settlement.x}-${t.settlement.y}`));
    // ...unless no other city could start one soon and its guards match the land raiders (research/23 E2: game
    // 8, the capital was «threatened» 48 of 70 turns by a camp 6 tiles away and trained none; the settlers that
    // left threatened settlements by a safe way founded fine).
    let elsewhere = null;
    const settlerElsewhere = () => (elsewhere ??= cities.some((c) => !threatened.has(sidOf(c)) && turnsUntilFree(c, ahead) <= SETTLER_SOON_TURNS && !!unitOrder(c, isSettler)));
    const guarded = (city) => {
        const t = (unitOptions.threats ?? []).find((x) => `c:${x.settlement.x}-${x.settlement.y}` === sidOf(city));
        return !t || guardsFor(t, undefined, unitOptions.threats) >= guardsWanted(t);
    };
    // Units the overlays and options want (explorers, settlers, scouts, merchants) never come from a space city in the
    // final push (game 11: the capital built Antiquarians on turns 56-58 instead of science projects).
    const spaceUnits = new Set(["QUEUED_EXPLORER", "QUEUED_SETTLER", "QUEUED_SCOUT", "QUEUED_MERCHANT", "QUEUED_MELEE", "QUEUED_GROUND_ATTACKER", "QUEUED_WARSHIP"]);
    // Explorers neither from a city kept for a Launch Pad nor where they take long (game 34: Ливерпуль's Antiquarian, 400
    // at 39 a turn, took its production M14-M37, and its pad came at M47).
    const padKept = safe(() => padExclusion(unitOptions.strategy), null);
    const left = ageEndTurns(); // an age's last turns (the final age: all of it)
    for (const w of unitsWanted(unitOptions)) {
        let n = w.n;
        // The centres' melee unit: the city that has it soonest, its wait plus its training (research/37 §2); a want's own
        // order (fighters: the city nearest the targets) else.
        const soonest = (c) => {
            const o = unitOrder(c, w.test);
            return o ? turnsUntilFree(c, ahead) + unitTurns(c, o.args.UnitType) : Infinity;
        };
        const rank = w.rank ?? (w.key === "QUEUED_MELEE" ? soonest : null);
        const list = rank ? cities.map((c) => ({ c, t: rank(c) })).sort((a, b) => a.t - b.t).map((x) => x.c) : cities;
        for (const city of list) {
            if (n <= 0) break;
            if (spaceUnits.has(w.key) && safe(() => spaceCity(city, unitOptions), false)) continue;
            // Nor from a city kept for a Launch Pad near Rocketry, settlers aside (game 34's Antiquarian, game 35's Tank).
            if (spaceUnits.has(w.key) && w.key !== "QUEUED_SETTLER" && padKept?.has(sidOf(city))) continue;
            if (used.has(sidOf(city)) || infected(city)) continue;
            if (w.test === isSettler && threatened.has(sidOf(city)) && (settlerElsewhere() || !guarded(city))) continue;
            if ((safe(() => city.BuildQueue.getQueue(), []) ?? []).some((q) => w.test(queueUnitDef(q)))) continue;
            const order = w.order ? w.order(city) : unitOrder(city, w.test);
            if (!order) continue;
            // Not where it is done only after the age ends: its production would be lost (game 22: a settler at 77 of 115
            // when Exploration ended; game 23: a Tank at 86 of 230 when the game ended).
            if (!doneInAge(city, order.args.UnitType, left, turnsUntilFree(city, ahead))) continue;
            // Soldiers (aircraft too) only where they are done soon (game 18: 33 turns for a Landship).
            if (isSoldierDef(safe(() => GameInfo.Units.lookup(order.args.UnitType), null)) && unitTurns(city, order.args.UnitType) > MILITARY_MAX_TURNS) continue;
            if (w.key === "QUEUED_EXPLORER" && unitTurns(city, order.args.UnitType) > MILITARY_MAX_TURNS) continue;
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, order.args);
            if (w.key === "QUEUED_GUARD") noteGuardOrder(city, order.args.UnitType);
            if (w.key === "QUEUED_MELEE") meleeOrders.set(sidOf(city), order.args.UnitType);
            entries.push({ key: w.key, args: [nameOf(city), Locale.compose(order.name), w.target] });
            used.add(sidOf(city));
            n--;
        }
    }
    return { entries, used };
}

/**
 * A scout or settler (or a defender under threat) waiting behind other items moves to the front of
 * its city's queue, behind the item in production when that one has progress (frontSlot).
 */
export function frontLoadUnits(unitOptions = {}) {
    const out = [];
    const left = ageEndTurns(); // an age's last turns (the final age: all of it)
    const MoveTo = globalThis.CityOperationsParametersValues?.MoveTo;
    if (MoveTo === undefined) return out;
    const underThreat = (unitOptions.threats ?? []).length > 0;
    const melee = unitOptions.defend ? bestTrainableMelee() : 0;
    const defender = (def) => underThreat && isMilitary(def);
    // Guards with a war at our door or a war risk (research/23 D3), and defenders under threat, come first.
    const guard = (def) => (war.near || war.risk.length > 0) && meleeStrength(def) > 0;
    const urgent = (def) => defender(def) || (war.near && meleeStrength(def) > 0);
    // A warship for a lasting coastal front (warshipsWanted) moves up too (game 39: Мотия's Cog stayed behind a Bazaar and a
    // Sawmill at the end of the queue for 20 turns; isMilitary leaves ships out).
    const coastal = !!unitOptions.defend && lastingFronts(unitOptions.threats ?? []).some((t) => Number(t.ships) > 0);
    const wanted = (def) => defender(def) || guard(def) || (melee > 0 && meleeStrength(def) >= melee)
        || (coastal && isWarshipDef(def))
        || (unitOptions.defend && war.near && isInterceptor(def))
        || (unitOptions.explore && isScout(def)) || (unitOptions.settlers && isSettler(def));
    const ahead = unitsMayOvertake(unitOptions);
    // Settlers overtake while far below the cap, not in the final push (research/24 P2: two settlers ahead of Oxford,
    // lost by 97 production), unless they start our own military countdown (research/26 §3.3; holdsFront still keeps
    // a raced wonder and a science project that would then miss the age).
    const deficit = (expansionDeficit() && unitOptions.strategy?.phase !== "COMMIT") || leverSettlers(unitOptions);
    // Real defenders: units of the city that trains for a threatened settlement (the nearest city: trainDefenders).
    const defenderCities = new Set((unitOptions.threats ?? []).map((t) => nearestCity(t.settlement)).filter(Boolean).map(sidOf));
    const hardPressed = war.near || (unitOptions.threats ?? []).some((t) => t.damaged);
    if (underThreat) for (const k of defenderTrainers) defenderCities.add(k);
    // Every threatened settlement this city defends holds on its own: its centre unhit, a melee guard of ours there, no war
    // at our door. Its defender is then no hurry ahead of a wonder or a project in production (game 36: three Warriors for
    // Манчестер, its centre never hit and guarded all along, went ahead of Лондон's Colossus T23-T28, and the race became a
    // tie with Spain's, cashed out at T29).
    const units = underThreat ? safe(() => Players.get(pid()).Units.getUnits(), []) ?? [] : [];
    const threats = unitOptions.threats ?? [];
    const holdsOut = (city) => !war.near && threats
        .filter((t) => (nearestCity(t.settlement) ? sidOf(nearestCity(t.settlement)) === sidOf(city) : false) || trainedFor.get(`${t.settlement.x},${t.settlement.y}`)?.sid === sidOf(city))
        .every((t) => !t.damaged && safe(() => guardDetail(t, units, threats).present.length, 0) > 0);
    const moved = new Set();
    for (const city of ownSettlements()) {
        if (city.isTown) continue;
        const queue = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        // A defender under threat may always overtake a wonder; settlers too while far below the cap
        // (research/22 A1: game 7, a settler waited behind Chart the Stars); the others as the strategy says (E1).
        // A defender under threat goes to the very front, ahead of a building with progress too (research/23
        // D4: game 8, Забид's defender waited behind a Tavern until the city fell; probe: does it take that
        // progress? CityBuildQueue.csv).
        const slotOf = (def) => {
            // A Crewed Space Flight Preparation run nearly done keeps the front unless the centre is damaged or a war is at our
            // door (research/38 §4 E2: game 29's run at 510 of 1,000 lost to two Tanks and two walls, M53-M64).
            if (prepNearlyDone(city) && !hardPressed) return 1;
            // A defender for settlements that hold on their own goes where other units go past a wonder or a project.
            const calm = defender(def) && wonderOrProject(safe(() => city.BuildQueue.currentProductionTypeHash, null)) && holdsOut(city);
            if (defender(def) && defenderCities.has(sidOf(city)) && !calm) return 0;
            const s = unitSlot(city, ahead || (isSettler(def) && deficit));
            // Not ahead of walls in production (a threatened settlement's first: wallsSlot), unless urgent.
            if (s === 0 && !urgent(def) && isWallsType(safe(() => city.BuildQueue.currentProductionTypeHash, null))) return 1;
            // Not ahead of a wonder in a race or a project that would then miss the age, unless urgent (P2: a Knight for
            // a war risk ahead of the Heliocentric Model, lost by 51; a Landship ahead of the Red Fort).
            return s === 0 && (!urgent(def) || calm) && safe(() => holdsFront(city, def), false) ? 1 : s;
        };
        // Not a unit done only after a non-final age ends: its production is lost (ageEndOrder would move it back).
        const wait = (def) => (slotOf(def) > 0 ? Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0 : 0);
        const i = queue.findIndex((q, j) => wanted(queueUnitDef(q)) && j > slotOf(queueUnitDef(q)) && doneInAge(city, queueUnitDef(q).$hash, left, wait(queueUnitDef(q))));
        if (i < 0) continue;
        const to = slotOf(queueUnitDef(queue[i]));
        if (i <= to) continue;
        // Another wanted unit already ahead of it: leave the order (seen in game 6: a settler and a scout
        // swapped places at the front every pass; research/21 H1).
        // A defender at war still passes a settler or a scout (research/23 D9: a settler queued the day after the
        // declaration kept Кайруан's defender back for 7 turns).
        const unit = queueUnitDef(queue[i]);
        if (queue.slice(to, i).some((q) => wanted(queueUnitDef(q)) && !(urgent(unit) && !urgent(queueUnitDef(q))))) continue;
        if (!moveInQueue(city, i, to)) continue;
        moved.add(sidOf(city));
        if (to === 0 && frontSlot(city) === 1) log.warn(`queue: ${nameOf(city)}: ${queueUnitDef(queue[i])?.UnitType} moved ahead of ${typeNameOf(safe(() => city.BuildQueue.currentProductionTypeHash, null))} with ${Math.round(currentProgress(city) ?? 0)} production in it (probe: does the unit take it? CityBuildQueue.csv)`);
        out.push({ key: "FRONT_LOADED", args: [nameOf(city), Locale.compose(queueUnitDef(queue[i])?.Name ?? "?")] });
    }
    // P4: never a unit right behind a wonder in production.
    const lost = lostWonderRows();
    for (const city of ownSettlements()) if (!city.isTown && !moved.has(sidOf(city))) safe(() => guardWonderRefund(city, lost), null);
    return out;
}

/** A queue item's type name: a constructible, a project or a unit (research/24: the probe printed "?" for a unit). */
function typeNameOf(h) {
    return safe(() => GameInfo.Constructibles.lookup(h)?.ConstructibleType, null) ?? safe(() => GameInfo.Projects.lookup(h)?.ProjectType, null)
        ?? safe(() => GameInfo.Units.lookup(h)?.UnitType, null) ?? String(h);
}

/** Our city nearest to this tile (towns aside), or null. */
function nearestCity(at) {
    let best = null;
    for (const c of ownSettlements()) {
        if (c.isTown) continue;
        const d = safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, at.x, at.y), Infinity);
        if (!best || d < best.d) best = { c, d };
    }
    return best?.c ?? null;
}

const WONDER_RACE_SLACK = 1; // turns a unit may cost a raced wonder: our ETA plus the unit's turns must still beat the rival's

/**
 * Should the item in production keep the front from this unit? A wonder in a race (a rival seen building it, or the
 * omniscient rival's turns not clearly beaten after the unit's own turns) or a one-off science project that would then
 * miss the age's end (research/24 P2).
 */
function holdsFront(city, def, delayTurns = null) {
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    // The unit's turns, or what the caller gives (walls: wallsSlot).
    const unitCost = delayTurns === null ? Number(safe(() => city.Production.getUnitProductionCost(def.UnitType), def.Cost ?? 0)) || 0 : 0;
    const delay = delayTurns ?? (prod > 0 ? Math.ceil(unitCost / prod) : 99);
    const left = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    const c = safe(() => GameInfo.Constructibles.lookup(h), null);
    if (c?.ConstructibleClass === "WONDER") {
        const row = safe(() => state.get().results.wonders?.rows?.find((r) => r.type === c.ConstructibleType), null);
        if (!row) return false;
        if (row.rivalTurns?.length) return Math.min(...row.rivalTurns) <= left + delay + WONDER_RACE_SLACK;
        return (Number(row.rivalsSeen) || 0) > 0;
    }
    const p = safe(() => GameInfo.Projects.lookup(h), null);
    // A Preparation run nearly done (research/38 §4 E2): the walls wait for it too (wallsSlot, unless the centre is damaged or a
    // war is at our door).
    if (p && REPEATABLE_PROJECTS.has(p.ProjectType)) return prepNearlyDone(city);
    if (!p || !SCIENCE_PROJECTS.includes(p.ProjectType)) return false;
    const turnsLeft = Number(safe(() => ageOutlook().turnsLeft, Infinity));
    return left + delay > turnsLeft - 1;
}

// A repeatable science project (Crewed Space Flight Preparation, 15 Innovation) this close to done keeps the front.
const PREP_HOLD_TURNS = 3;

/** Is a repeatable science project in production here within PREP_HOLD_TURNS of done? */
function prepNearlyDone(city) {
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const p = safe(() => GameInfo.Projects.lookup(h), null);
    if (!p || !REPEATABLE_PROJECTS.has(p.ProjectType)) return false;
    const left = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    return left > 0 && left <= PREP_HOLD_TURNS;
}

/**
 * A lost wonder pours half its progress and that turn's production into the next item in the queue, its overflow
 * capped (research/24 P4: the Red Fort's 300 went into a 15-cost Scout). So a unit never waits right behind a wonder
 * in production: a building already queued moves there, else the costliest building the city can place is queued
 * (it moves there next pass). UI.log says so.
 */
function guardWonderRefund(city, lost = lostWonderRows()) {
    const queue = safe(() => city.BuildQueue.getQueue(), []) ?? [];
    const first = queue.length > 0 ? safe(() => GameInfo.Constructibles.lookup(queueItemType(queue[0])), null) : null;
    if (first?.ConstructibleClass !== "WONDER") return;
    // A race we lose is the cash-out's (cashOutLostWonders): it puts a building ahead of the wonder, not behind it.
    if (lost.has(first.ConstructibleType)) return;
    // A lost wonder pours half its progress and that turn's production into the next item, up to that item's
    // cost (game 20: Petra's 105 into a 90-cost Pagoda, the Weiyang Palace's 97 into 40-cost walls).
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const refund = (currentProgress(city) ?? 0) / 2 + prod;
    const next = queue[1] ? safe(() => GameInfo.Constructibles.lookup(queueItemType(queue[1])), null) : null;
    const nextKeeps = next?.ConstructibleClass === "BUILDING" ? Math.min(costIn(city, next.ConstructibleType), refund) : 0;
    if (nextKeeps >= refund - 0.5) return;
    const further = bestAbsorber(absorberCandidates(city).filter((c) => c.index >= 2), refund);
    if (further && further.keeps > nextKeeps + 0.5) {
        if (!moveInQueue(city, further.index, 1)) return;
        log.info(`queue: ${nameOf(city)}: ${further.type} moved behind ${first.ConstructibleType}: it keeps ${Math.round(further.keeps)} of the ${Math.round(refund)} a lost wonder pours into the next item`);
        return;
    }
    const outside = bestAbsorber(plannedAbsorbers(city), refund) ?? bestAbsorber([costliestBuilding(city)].filter(Boolean), refund);
    if (!outside || outside.keeps <= Math.max(nextKeeps, further?.keeps ?? 0) + 0.5) return;
    Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, outside.args);
    noteBuilt(city, outside.type);
    log.info(`queue: ${nameOf(city)}: ${outside.type} queued to stand behind ${first.ConstructibleType} (keeps ${Math.round(outside.keeps)} of a ${Math.round(refund)} refund)`);
}

const costIn = (city, type) => Number(safe(() => city.Production.getConstructibleProductionCost(type), 0)) || Number(safe(() => GameInfo.Constructibles.lookup(type)?.Cost, 0)) || 0;

/** Buildings in this city's queue behind the item in production: [{ index, type, cost }]. */
function absorberCandidates(city) {
    const out = [];
    (safe(() => city.BuildQueue.getQueue(), []) ?? []).forEach((q, index) => {
        const def = index > 0 ? safe(() => GameInfo.Constructibles.lookup(queueItemType(q)), null) : null;
        if (def?.ConstructibleClass === "BUILDING") out.push({ index, type: def.ConstructibleType, cost: costIn(city, def.ConstructibleType) });
    });
    return out;
}

/** The plan's buildings for this city not queued yet that it can place now on their tile: [{ type, cost, args }]. */
function plannedAbsorbers(city) {
    const sid = sidOf(city);
    const queued = new Set([...(safe(() => city.BuildQueue.getQueue(), []) ?? []).map((q) => typeNameOf(queueItemType(q))), ...builtThisPass(city)]);
    const out = [];
    for (const p of state.get().results.plans?.placements ?? []) {
        if (p.sid !== sid || p.locked || queued.has(p.type)) continue;
        const def = safe(() => GameInfo.Constructibles.lookup(p.type), null);
        if (def?.ConstructibleClass !== "BUILDING") continue;
        const args = { ConstructibleType: def.$hash, X: p.x, Y: p.y };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        out.push({ type: p.type, cost: costIn(city, p.type), args });
    }
    return out;
}

/** Our queued wonders whose race is lost (research/27 §6): type -> "RIVAL_AHEAD" | "AGE_ENDS". */
function lostWonderRows() {
    const w = state.get().results.wonders;
    const out = new Map();
    for (const r of w?.rows ?? []) {
        if (r.status !== "IN_PROGRESS" || !r.inQueue) continue;
        const lost = raceLost({ ourTurns: r.inQueue.turns, rivalTurns: r.rivalTurns, ageTurnsLeft: w.ageTurnsLeft });
        if (lost) out.set(r.type, lost);
    }
    return out;
}

/**
 * Wonder races already lost (research/27 §6): a wonder in production that a rival building it now will finish
 * first (omniscient mode: the rival's own queue), or that cannot be done before the age ends. A building goes ahead
 * of it, so no more production goes into the race: a lost wonder gives back only half its progress. Game 20: Mexico
 * started Petra 2 turns after us at twice our production and won it on the turn we were 14 short, our 173 became 105
 * in a 90-cost Pagoda; the Weiyang Palace's 162 became 97 in 40-cost walls. Game 21 (research/28 §3): the building
 * did not take the wonder's progress (Chicago's Dungeon got its own 23; the Serpent Mound kept its 30 and returned 14
 * when the Normans finished it), though game 3 once saw it taken (root gotcha 20). So the building chosen is the one
 * that would keep the most if it were (queued, else the plan's next one for that city, queued now and moved ahead next
 * pass). A lost wonder with no progress leaves the queue.
 * @returns log entries
 */
export function cashOutLostWonders() {
    const out = [];
    const w = state.get().results.wonders;
    const lostRows = lostWonderRows();
    for (const r of w?.rows ?? []) {
        const lost = lostRows.get(r.type);
        if (!lost) continue;
        const city = ownSettlements().find((c) => sidOf(c) === r.inQueue.cityKey);
        const queue = city ? safe(() => city.BuildQueue.getQueue(), []) ?? [] : [];
        const at = queue.findIndex((q) => typeNameOf(queueItemType(q)) === r.type);
        if (at < 0) continue;
        const why = Locale.compose(lost === "AGE_ENDS" ? "LOC_XPL_AP_WONDER_LOST_AGE" : "LOC_XPL_AP_WONDER_LOST_RIVAL", Math.min(...(r.rivalTurns ?? [0])), r.inQueue.turns);
        const progress = at === 0 ? currentProgress(city) ?? 0 : null; // behind a unit: wait until it is in production again
        if (at === 0 && progress > 0) {
            const queued = bestAbsorber(absorberCandidates(city), progress);
            const outside = bestAbsorber(plannedAbsorbers(city), progress) ?? bestAbsorber([costliestBuilding(city)].filter(Boolean), progress);
            if (queued && (!outside || queued.keeps >= outside.keeps - 0.5)) {
                if (!moveInQueue(city, queued.index, 0)) continue;
                log.warn(`wonders: ${nameOf(city)} stopped ${r.type} (${lost}: rivals ${JSON.stringify(r.rivalTurns ?? [])} turns, ours ${r.inQueue.turns}): ${queued.type} goes ahead of its ${Math.round(progress)} production (game 21: the wonder kept it; CityBuildQueue.csv shows which)`);
                out.push({ key: "WONDER_CASHED_OUT", args: [nameOf(city), r.name, Math.round(progress), Locale.compose(GameInfo.Constructibles.lookup(queued.type)?.Name ?? queued.type), Math.round(queued.keeps), why] });
            } else if (outside && !builtThisPass(city).has(outside.type)) {
                Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, outside.args);
                noteBuilt(city, outside.type);
                out.push({ key: "WONDER_ABSORBER_QUEUED", args: [nameOf(city), r.name, Locale.compose(GameInfo.Constructibles.lookup(outside.type)?.Name ?? outside.type), why] });
            }
        } else if (progress === 0 && removeFromQueue(city, at)) {
            out.push({ key: "WONDER_DROPPED", args: [nameOf(city), r.name, why] });
        }
    }
    return out;
}

/** The costliest building (not a wonder) this city can place now (of those `accept` takes), as BUILD args. */
function costliestBuilding(city, accept = null) {
    let best = null;
    for (const def of GameInfo.Constructibles ?? []) {
        if (def.ConstructibleClass !== "BUILDING") continue;
        const cost = Number(safe(() => city.Production.getConstructibleProductionCost(def.ConstructibleType), def.Cost ?? 0)) || 0;
        if ((best && best.cost >= cost) || (accept && !accept(def.ConstructibleType))) continue;
        const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
        const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
        if (!probe?.Success || probe.InQueue || plots.length === 0 || builtThisPass(city).has(def.ConstructibleType)) continue;
        const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(city, def.$hash, plots) ?? plots[0]), null);
        if (!loc) continue;
        best = { args: { ConstructibleType: def.$hash, X: loc.x, Y: loc.y }, type: def.ConstructibleType, cost };
    }
    return best;
}

/** Nothing usable from the advisor: the cheapest building this city can place now. */
function cheapestBuilding(city, { skip = null } = {}) {
    let best = null;
    for (const def of GameInfo.Constructibles ?? []) {
        if (def.ConstructibleClass !== "BUILDING" || skip?.(def.ConstructibleType)) continue;
        const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
        if (!probe?.Success) continue;
        const plots = [...(probe.Plots ?? []), ...(probe.ExpandUrbanPlots ?? [])];
        if (plots.length === 0) continue;
        const cost = Number(safe(() => city.Production.getConstructibleProductionCost(def.ConstructibleType), def.Cost ?? 999)) || 999;
        if (best && best.cost <= cost) continue;
        const plot = bestPlotFor(city, def.$hash, plots);
        if (plot === null) continue;
        const loc = GameplayMap.getLocationFromIndex(plot);
        const args = { ConstructibleType: def.$hash, X: loc.x, Y: loc.y };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        best = { args, name: def.Name, cost };
    }
    return best;
}

/**
 * Nothing else to build (seen in game: late in the age every building done, the advisor offering
 * only soldiers over our limits, the turn held by NOTIFICATION_CHOOSE_CITY_PRODUCTION): the
 * cheapest project the city may start, else its strongest soldier, else any unit but a settler;
 * an empty queue must never hold the turn. @returns { args, name } or null
 */
function lastResort(city, { skip = null } = {}) {
    let best = null;
    for (const def of GameInfo.Projects ?? []) {
        if (skip?.(def.ProjectType)) continue;
        const args = { ProjectType: def.$hash };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        const cost = Number(safe(() => city.Production.getProjectProductionCost(def.ProjectType), def.Cost ?? 999)) || 999;
        if (!best || cost < best.cost) best = { args, name: def.Name, cost };
    }
    if (best) return best;
    const soldier = bestMilitaryOrder(city);
    if (soldier) return soldier;
    for (const def of GameInfo.Units ?? []) {
        const args = { UnitType: def.$hash };
        // Never a settler: that bypasses the settlement cap (waitAtCap, trainWantedUnits).
        if (def.CanTrain === false || def.CanTrain === "false" || isSettler(def)) continue;
        if (safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) return { args, name: def.Name };
    }
    return null;
}

// A settlement this close to an independent's village at war with us is exposed: its units are
// 4-6 tiles away and take a settlement with no soldier in 2-5 turns (seen in game 5, research/17).
export const EXPOSED_RADIUS = TUNING.VILLAGE_ANGER_DISTANCE;

/** Independents' villages at war with us (hostile) that we have seen. */
function hostileVillages() {
    const HOSTILE = globalThis.IndependentRelationship?.HOSTILE;
    return (safe(() => villagesOf(pid()), []) ?? []).filter((v) => (HOSTILE !== undefined && safe(() => Game.IndependentPowers.getIndependentRelationship(v.id, pid()), null) === HOSTILE)
        || safe(() => Players.get(pid()).Diplomacy.isAtWarWith(v.id), false));
}

/** Tiles from this location to the nearest of these villages (Infinity: none). */
function nearestVillage(loc, villages) {
    return Math.min(Infinity, ...villages.map((v) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, v.x, v.y), Infinity)));
}

/**
 * Our settlements exposed to an independent's village at war with us (research/37 §4B): within EXPOSED_RADIUS of a seen
 * one, and not threatened (a visible attacker makes a settlement threatened, with its emergency rules). Live state, made
 * every pass like the war fronts: foundings, captures and changed relationships change it by themselves. Game 29:
 * Ollantaytambo was exposed from M1, threatened from M4, and its centre fell at M6. @returns [{ settlement: { x, y,
 * name }, village: { id, x, y }, d }], the nearest to a village first
 */
export function exposedSettlements(threats = []) {
    const hostile = hostileVillages();
    if (hostile.length === 0) return [];
    const out = [];
    for (const c of ownSettlements()) {
        if ((threats ?? []).some((t) => t.settlement.x === c.location.x && t.settlement.y === c.location.y)) continue;
        let near = null;
        for (const v of hostile) {
            const d = safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, v.x, v.y), Infinity);
            if (d <= EXPOSED_RADIUS && (!near || d < near.d)) near = { v, d };
        }
        if (near) out.push({ settlement: { x: c.location.x, y: c.location.y, name: nameOf(c) }, village: { id: near.v.id, x: near.v.x, y: near.v.y }, d: near.d });
    }
    return out.sort((a, b) => a.d - b.d);
}

/** Is one of our soldiers on this tile or within `radius` of it? Not one packed in an army, nor embarked (research/37 §3A). */
function soldierAt(loc, radius = 1) {
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (u.isCommanderUnit || u.isOnMap === false || afloat(u) || !isMilitary(safe(() => GameInfo.Units.lookup(u.type), null))) continue;
        if (safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), Infinity) <= radius) return true;
    }
    return false;
}

// A siege unit (UNIT_CLASS_SIEGE, or a Bombard attack above its ranged one; archers have a small Bombard too)
// defends nothing (research/23 D6: game 8, a Catapult for 220 of our 239 gold at −22 income).
const isSiege = (def) => !!GameInfo.TypeTags?.find((t) => t.Type === def.UnitType && t.Tag === "UNIT_CLASS_SIEGE")
    || safe(() => { const st = GameInfo.Unit_Stats.lookup(def.UnitType); return (Number(st?.Bombard) || 0) > (Number(st?.RangedCombat) || 0); }, false);

/**
 * The strongest melee unit this settlement can buy within `budget`, else the strongest land soldier (not a
 * siege unit) within `fallback` (the gold above the reserve while the income is below zero).
 */
function defenderPurchase(city, budget, fallback = budget) {
    const melee = bestDefenderOrder(city, { buy: true, budget });
    if (melee) return melee;
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        if (!isMilitary(def) || isSiege(def) || def.CanTrain === false || def.CanTrain === "false") continue;
        const args = { UnitType: def.$hash };
        const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
        if (!r?.Success) continue;
        const cost = Number(r.Cost ?? safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), Infinity));
        if (!Number.isFinite(cost) || cost > fallback) continue;
        const rank = (Number(def.Tier) || 0) * 1000 + (def.$index ?? 0);
        if (!best || rank > best.rank) best = { args, name: def.Name, cost, rank };
    }
    return best;
}

const defendersNoted = new Map(); // settlement -> the turn UI.log said why no defender was bought
const DEFENDER_SAVE_TURNS = 2;    // a defender the gold cannot buy yet but will within this many turns of income: the free gold waits
const savingNoted = new Map();    // settlement -> the turn the autopilot's log said it saves for a defender there

/** The cheapest unit of a defender's role the game sells here, short of gold or not: { type, cost } or null. */
function cheapestDefender(city, ranged, ships = false) {
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        if (ranged ? !(isRangedGuard(def) || (ships && isSiegeGuard(def))) : !isMilitary(def) || isSiege(def)) continue;
        if (def.CanTrain === false || def.CanTrain === "false") continue;
        const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { UnitType: def.$hash }, false), null);
        if (!r?.Success && !r?.InsufficientFunds) continue;
        const cost = Number(r.Cost ?? safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), Infinity));
        if (Number.isFinite(cost) && (!best || cost < best.cost)) best = { type: def.UnitType, cost };
    }
    return best;
}

/** UI.log, once a turn per settlement: why a threatened settlement short of guards got no defender (research/24 W2). */
function noteNoDefender(city, why) {
    const k = sidOf(city);
    if (defendersNoted.get(k) === Game.turn) return;
    defendersNoted.set(k, Game.turn);
    log.warn(`defenders: none for ${nameOf(city)}: ${why}`);
}

/**
 * Defenders bought where they are needed now (towns can buy units too; a trained one comes too late:
 * seen in game 5, a defender queued behind a building came out the turn after its town fell, and
 * not one unit was bought all game while 230-950 gold sat in the treasury during each siege):
 *  - a threatened settlement with fewer of our soldiers around it (guardsFor) than hostile units:
 *    the strongest melee unit it can buy, with all the gold (no reserve: it cannot wait);
 *  - then an exposed one (exposedSettlements: within EXPOSED_RADIUS of a village at war with us, e.g. the
 *    previous age's city-states, back at war on turn 1 of the new age) with no holder on or next to its
 *    centre nor coming soon (holderDetail): one, with the free gold, the nearest to a village first.
 * One a settlement a pass, while we have fewer than WAR_SOLDIERS_PER_SETTLEMENT soldiers each.
 * `budget`: the pass budget (threatened: all(); exposed: free()). @returns log entries
 */
export function buyDefenders(threats, { reserveTurns = 2, budget = null } = {}) {
    const out = [];
    const all = ownSettlements();
    const bought = new Set();
    const b = budget ?? createBudget({ gold: goldBalance(), reserve: goldReserve(reserveTurns) });
    const buy = (city, order, kind) => {
        Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, order.args);
        b.spend(order.cost, { kind, label: `${safe(() => Locale.compose(order.name), "?")} (${nameOf(city)})` });
        bought.add(sidOf(city));
        // A melee unit bought raises every centre's defence this age (research/37 §2).
        noteMeleeObtained(safe(() => GameInfo.Units.lookup(order.args.UnitType), null), "bought", nameOf(city));
    };
    for (const t of threats ?? []) {
        const city = all.find((c) => c.location.x === t.settlement.x && c.location.y === t.settlement.y);
        // Melee guards only, each counted for one settlement; one per land raider and one on the centre against
        // ships too (research/24 W2: no defender E47-E50 with 356-1,745 gold free; Нант fell to 2 Cogs and a Knight).
        // Those on their way count only when they come before the raiders strike (guardDeadline; research/36 §1: game
        // 29's Ollantaytambo counted a Cuirassier nine tiles away and bought nothing with 711-1,034 gold).
        const within = guardDeadline(t);
        const want = guardsWanted(t);
        const have = city && want > 0 ? guardsFor(t, undefined, threats, { within }) : 0;
        const need = city ? defenderNeed(t, threats, { within, support: false }) : null;
        if (!city || bought.has(sidOf(city)) || !need) continue;
        const ranged = `ranged ${guardsFor(t, undefined, threats, { ranged: true, within })}/${rangedWanted(t, { support: false })}`;
        if (!soldierRoom(WAR_SOLDIERS_PER_SETTLEMENT)) {
            noteNoDefender(city, `guards ${have}/${want} within ${within}t, ${ranged}; ${WAR_SOLDIERS_PER_SETTLEMENT} soldiers per settlement already`);
            continue;
        }
        // One pool for every role (research/36 §8: a ranged defender came only from the gold above the reserve at an
        // income below zero, while a melee one could take it all; the reserve itself keeps a defender's price for each
        // settlement short of guards: goldPlan): all the gold, less DEFICIT_KEEP_TURNS turns of a deficit (game 8: a
        // Catapult took 220 of 239 gold at −22 a turn). Against ships a ranged unit (they cannot be fought otherwise;
        // game 10), else a melee one.
        const income = goldIncome();
        const pool = Math.max(0, b.all() - (income < 0 ? DEFICIT_KEEP_TURNS * -income : 0));
        const ships = Number(t.ships) > 0;
        const order = need === "RANGED" ? bestRangedOrder(city, { buy: true, budget: pool, ships }) : defenderPurchase(city, pool, pool);
        if (!order) {
            const cheapest = cheapestDefender(city, need === "RANGED", ships);
            const why = !cheapest ? `the game sells no ${need === "RANGED" ? "ranged" : "land"} soldier here`
                : `the cheapest, ${cheapest.type}, costs ${Math.round(cheapest.cost)}; ${Math.round(pool)} of ${Math.round(b.all())} gold usable${income < 0 ? ` (${DEFICIT_KEEP_TURNS} turns of the ${income} deficit kept)` : ""}`;
            noteNoDefender(city, `guards ${have}/${want} within ${within}t, ${ranged}; ${why}`);
            // Save for it while the gap closes within DEFENDER_SAVE_TURNS turns of income: the free gold waits (the pass
            // budget's goal; game 38: Бутооло's centre fell from 100 to 0 M7-M11 while 108 gold a turn bought buildings,
            // one of them its own Harbor, and the cheapest defender, 540, stayed out of reach of 361-365 at +106 a turn).
            if (cheapest && income > 0 && cheapest.cost - pool <= DEFENDER_SAVE_TURNS * income && !(b.goal?.kind === "DEFENDER" && !b.goal.done)) {
                const label = composeOr("LOC_XPL_AP_GOAL_DEFENDER", nameOf(city));
                b.setGoal({ kind: "DEFENDER", key: `defender|${sidOf(city)}`, label, cost: cheapest.cost, hold: cheapest.cost });
                if (savingNoted.get(sidOf(city)) !== Game.turn) {
                    savingNoted.set(sidOf(city), Game.turn);
                    out.push({ key: "SAVING", args: [label, Math.round(cheapest.cost), Math.round(pool)] });
                }
            }
            continue;
        }
        buy(city, order, "DEFENDER");
        {
            const k = `${t.settlement.x},${t.settlement.y}`;
            const was = defenderBought.get(k)?.turn === Game.turn ? defenderBought.get(k) : { turn: Game.turn, melee: 0, ranged: 0 };
            const def = safe(() => GameInfo.Units.lookup(order.args.UnitType), null);
            defenderBought.set(k, { ...was, melee: was.melee + (meleeStrength(def) > 0 ? 1 : 0), ranged: was.ranged + (isRangedGuard(def) || isSiegeGuard(def) ? 1 : 0) });
        }
        out.push({ key: "DEFENDER_BOUGHT", args: [Locale.compose(order.name), nameOf(city), Math.round(order.cost), t.count] });
    }
    // An exposed settlement's holder (research/37 §4C): one with none there or coming within EXPOSED_HOLD_TURNS (a reserve on
    // its way, a member leaving an army: commandUnits ran first) gets one bought from the free gold. Mere proximity to a
    // village is no emergency: the purchase waits for the free gold, but a deficit no longer stops it outright (game 29's
    // Ollantaytambo stood empty from M1 to its fall at M6). The strongest melee unit when none was obtained this age (it
    // sets every centre's defence: research/37 §2), else the cheapest melee unit the game sells there.
    for (const e of exposedSettlements(threats)) {
        const c = all.find((x) => x.location.x === e.settlement.x && x.location.y === e.settlement.y);
        if (!c || bought.has(sidOf(c))) continue;
        // One bought this turn: the game shows it only later (a second pass of the turn buys none).
        const done = defenderBought.get(`${e.settlement.x},${e.settlement.y}`);
        if (done?.turn === Game.turn && done.melee > 0) continue;
        const h = holderDetail(e);
        if (h.present.length > 0 || h.incoming.some((x) => x.turns <= EXPOSED_HOLD_TURNS)) continue;
        if (!soldierRoom(WAR_SOLDIERS_PER_SETTLEMENT)) break;
        const free = b.free();
        const order = (!meleeThisAge() ? bestDefenderOrder(c, { buy: true, budget: free }) : null) ?? cheapestMeleeOrder(c, free);
        if (!order) {
            noteNoDefender(c, `exposed (village at ${e.d} tiles), no holder: ${Math.round(free)} free gold${cheapestDefender(c, false) ? `, the cheapest ${cheapestDefender(c, false).type} at ${Math.round(cheapestDefender(c, false).cost)}` : ", none on sale"}`);
            continue;
        }
        buy(c, order, "GARRISON");
        const k = `${e.settlement.x},${e.settlement.y}`;
        const was = defenderBought.get(k)?.turn === Game.turn ? defenderBought.get(k) : { turn: Game.turn, melee: 0, ranged: 0 };
        defenderBought.set(k, { ...was, melee: was.melee + 1 });
        out.push({ key: "GARRISON_BOUGHT", args: [Locale.compose(order.name), nameOf(c), Math.round(order.cost)] });
    }
    return out;
}

const EXPOSED_HOLD_TURNS = 3; // an exposed settlement's holder coming within this many turns: none is bought for it

/** The cheapest melee unit this settlement can buy within `budget` (an exposed settlement's holder). @returns order or null */
function cheapestMeleeOrder(city, budget) {
    let best = null;
    for (const def of GameInfo.Units ?? []) {
        const strength = meleeStrength(def);
        if (!(strength > 0) || def.CanTrain === false || def.CanTrain === "false") continue;
        const args = { UnitType: def.$hash };
        const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
        if (!r?.Success) continue;
        const cost = Number(r.Cost ?? safe(() => city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType), Infinity));
        if (!Number.isFinite(cost) || cost > budget) continue;
        if (!best || cost < best.cost || (cost === best.cost && strength > best.strength)) best = { args, name: def.Name, strength, cost };
    }
    return best;
}

const meleeOrders = new Map(); // city sid -> the unit type hash QUEUED_MELEE queued there (dropped once one is obtained)
const FIRST_MELEE_SOON = 2;    // a centres' melee unit in production done within this many turns is not bought instead

/**
 * The age's first melee unit, upgraded or bought when the gold allows (research/37 §2): every centre defends at 20 until
 * one is obtained this age, and training one takes turns. First an upgrade of one of ours to a melee type as strong as the
 * best we can train (upgradeFirstMelee: the cheapest; probe P-DEF-3), else bought, the strongest the game offers (as strong as the best we can
 * train: it sets every centre's defence), with all the gold less DEFICIT_KEEP_TURNS of a deficit while a settlement is
 * threatened or exposed, else only with the free gold; in a threatened settlement first, then an exposed one (nearest a
 * hostile village), then one with no soldier on or next to its centre, then any. Not when one is done within
 * FIRST_MELEE_SOON turns in production. Then an unstarted one QUEUED_MELEE queued leaves the queue. @returns log entries
 */
export function buyFirstMelee(threats = [], { reserveTurns = 2, budget = null } = {}) {
    const out = [];
    if (meleeThisAge()) {
        dropSpareMelee();
        return out;
    }
    // As strong as the best we can train, and stronger than the base (a Warrior's 20 raises nothing).
    const best = Math.max(bestTrainableMelee(), CENTRE_BASE + 1);
    const strong = (def) => meleeStrength(def) >= best;
    // One nearly done in production: it comes soon enough.
    for (const c of ownSettlements()) {
        const def = safe(() => GameInfo.Units.lookup(c.BuildQueue.currentProductionTypeHash), null);
        const left = Number(safe(() => c.BuildQueue.currentTurnsLeft, NaN));
        if (def && strong(def) && Number.isFinite(left) && left <= FIRST_MELEE_SOON) return out;
    }
    const b = budget ?? createBudget({ gold: goldBalance(), reserve: goldReserve(reserveTurns) });
    const all = ownSettlements();
    const hostile = hostileVillages();
    const near = (c) => nearestVillage(c.location, hostile);
    const threatened = all.filter((c) => (threats ?? []).some((t) => t.settlement.x === c.location.x && t.settlement.y === c.location.y));
    const exposed = all.filter((c) => !threatened.includes(c) && near(c) <= EXPOSED_RADIUS).sort((a, b2) => near(a) - near(b2));
    const income = goldIncome();
    const urgent = threatened.length + exposed.length > 0;
    const pool = urgent ? Math.max(0, b.all() - (income < 0 ? DEFICIT_KEEP_TURNS * -income : 0)) : b.free();
    if (!(pool > 0)) return out;
    // An upgrade of one of ours first: it costs less than a new unit.
    const up = upgradeFirstMelee(best, pool);
    if (up) {
        b.spend(up.cost, { kind: "UPGRADE", label: up.entry.args[0] });
        out.push(up.entry);
        dropSpareMelee();
        return out;
    }
    const bare = all.filter((c) => !threatened.includes(c) && !exposed.includes(c) && !soldierAt(c.location));
    const rest = all.filter((c) => !threatened.includes(c) && !exposed.includes(c) && !bare.includes(c));
    for (const city of [...threatened, ...exposed, ...bare, ...rest]) {
        const order = bestDefenderOrder(city, { buy: true, budget: pool });
        if (!order || order.strength < best) continue;
        Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, order.args);
        b.spend(order.cost, { kind: "DEFENDER", label: `${safe(() => Locale.compose(order.name), "?")} (${nameOf(city)})` });
        noteMeleeObtained(safe(() => GameInfo.Units.lookup(order.args.UnitType), null), "bought", nameOf(city));
        out.push({ key: "FIRST_MELEE_BOUGHT", args: [Locale.compose(order.name), nameOf(city), Math.round(order.cost), order.strength] });
        dropSpareMelee();
        break;
    }
    return out;
}

/**
 * A melee unit QUEUED_MELEE queued that one obtained since has made needless (as strong or weaker) leaves its queue while
 * nothing has gone into it: no progress at the front, or still behind other items.
 */
function dropSpareMelee() {
    const obtained = meleeThisAge()?.strength ?? 0;
    if (!(obtained > 0)) return;
    for (const city of ownSettlements()) {
        const hash = meleeOrders.get(sidOf(city));
        if (hash === undefined) continue;
        const def = safe(() => GameInfo.Units.lookup(hash), null);
        if (!def || meleeStrength(def) > obtained) continue;
        const queue = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        const i = queue.findIndex((q) => queueUnitDef(q)?.$hash === hash);
        if (i < 0) {
            meleeOrders.delete(sidOf(city));
            continue;
        }
        if (i === 0 && (Number(safe(() => city.BuildQueue.getPercentComplete(hash), 0)) || 0) > 0) continue;
        if (removeFromQueue(city, i)) {
            meleeOrders.delete(sidOf(city));
            log.info(`queue: ${nameOf(city)}: ${def.UnitType} dropped, this age's melee unit was obtained (strength ${obtained})`);
        }
    }
}

// ---- walls (research/23 D7) ----------------------------------------------------------------------

const WALLS_THREAT_TURNS = 3;  // turns with a serious threat...
const WALLS_THREAT_WINDOW = 5; // ...within this many before walls are researched
let threatTurns = [];          // the last WALLS_THREAT_WINDOW turns' with a serious threat

/**
 * The hud tells each pass which settlements are threatened. A serious threat: a major's units, or 2+ raiders
 * (research/24 W4: Machinery was researched for 1-2 raiders gone the next turn, while a real siege needed
 * consecutive turns and came and went). The last pass of a turn decides.
 */
export function noteThreats(threats) {
    const serious = (threats ?? []).some((t) => (t.owners ?? []).some((o) => o && !o.independent) || (Number(t.land ?? t.count) || 0) >= 2);
    threatTurns = threatTurns.filter((t) => t !== Game.turn && Game.turn - t >= 0 && Game.turn - t < WALLS_THREAT_WINDOW);
    if (serious) threatTurns.push(Game.turn);
}

const wallsWanted = () => war.near || threatTurns.length >= WALLS_THREAT_TURNS;

/**
 * With research under way: the walls' way instead, unless the node under way is on it (a war at our door).
 * UI.log names the interrupted node (probe: does it keep its progress?). @returns a log entry or null
 */
function wallsNow(holder, active, op) {
    const node = wallsNode();
    if (!node || wayOf(node).size > 2) return null;
    const activeType = safe(() => GameInfo.ProgressionTreeNodes.lookup(active)?.ProgressionTreeNodeType, null);
    if (activeType && wayOf(node).has(activeType)) return null;
    const step = wayStep(node, holder, new Set(safe(() => holder.getAllAvailableNodeTypes(), []) ?? []));
    if (!step || !safe(() => Game.PlayerOperations.canStart(pid(), op, { ProgressionTreeNodeType: step.node }, false), null)?.Success) return null;
    Game.PlayerOperations.sendRequest(pid(), op, { ProgressionTreeNodeType: step.node });
    log.warn(`research: ${activeType ?? active} interrupted for ${step.nodeType} (walls at war; probe: does it keep its progress?)`);
    return { key: "TECH_FOR_WALLS", args: [safe(() => Locale.compose(step.name), step.nodeType)] };
}

/**
 * The research node unlocking a melee unit stronger than the best we train (meleeStrength), ours to train
 * (no other civilization's unit or unlock), within one step (its node and at most one prerequisite to
 * research); the nearest, then the strongest. @returns { node, unitType, name, strength } or null
 */
function meleeNode() {
    const top = bestTrainableMelee();
    const { depthOf } = treeFacts();
    let best = null;
    for (const r of GameInfo.ProgressionTreeNodeUnlocks?.filter((x) => x.TargetKind === "KIND_UNIT") ?? []) {
        if ((r.RequiredTraitType && !ownTrait(r.RequiredTraitType)) || (r.NotTraitType && ownTrait(r.NotTraitType))) continue;
        const def = safe(() => GameInfo.Units.lookup(r.TargetType), null);
        const strength = def ? meleeStrength(def) : 0;
        if (!(strength > top) || def.CanTrain === false || def.CanTrain === "false" || (def.TraitType && !ownTrait(def.TraitType))) continue;
        if (depthOf(r.ProgressionTreeNodeType) >= (Number(r.UnlockDepth) || 1)) continue;
        const way = wayOf(r.ProgressionTreeNodeType).size;
        if (way > 2) continue;
        if (!best || way < best.way || (way === best.way && strength > best.strength)) best = { node: r.ProgressionTreeNodeType, unitType: def.UnitType, name: def.Name, strength, way };
    }
    return best;
}

/** Is this one of our civilization's (or leader's) traits? */
function ownTrait(trait) {
    const me = safe(() => Players.get(pid()), null);
    return !!GameInfo.CivilizationTraits?.find((r) => r.TraitType === trait && r.CivilizationType === safe(() => GameInfo.Civilizations.lookup(me.civilizationType)?.CivilizationType, null))
        || !!GameInfo.LeaderTraits?.find((r) => r.TraitType === trait && r.LeaderType === safe(() => GameInfo.Leaders.lookup(me.leaderType)?.LeaderType, null));
}

/** This age's walls (FORTIFICATION buildings, not another civilization's own): the defs. */
function wallDefs() {
    return (GameInfo.TypeTags?.filter((t) => t.Tag === "FORTIFICATION") ?? [])
        .map((t) => safe(() => GameInfo.Constructibles.lookup(t.Type), null))
        .filter((d) => d && d.ConstructibleClass === "BUILDING")
        .filter((d) => {
            const trait = safe(() => GameInfo.Buildings.lookup(d.ConstructibleType)?.TraitType, null);
            return !trait || ownTrait(trait);
        });
}

/** The node unlocking this age's walls when none is unlocked yet, else null. */
function wallsNode() {
    const { depthOf } = treeFacts();
    let node = null;
    for (const def of wallDefs()) {
        const row = GameInfo.ProgressionTreeNodeUnlocks?.find((r) => r.TargetType === def.ConstructibleType && !r.RequiredTraitType);
        if (!row) continue;
        if (depthOf(row.ProgressionTreeNodeType) >= (Number(row.UnlockDepth) || 1)) return null;
        node ??= row.ProgressionTreeNodeType;
    }
    return node;
}

/** A node and its unresearched prerequisites (transitively). */
function wayOf(goal) {
    const { prereqs, researched } = treeFacts();
    const way = new Set();
    const stack = [goal];
    while (stack.length > 0) {
        const n = stack.pop();
        if (way.has(n) || researched(n)) continue;
        way.add(n);
        stack.push(...(prereqs.get(n) ?? []));
    }
    return way;
}

/**
 * Walls for a threatened settlement (seen in game: an independent's raiders pillaged around the
 * capital turn after turn; nothing but soldiers stood in their way): the age's fortification
 * (GameInfo.TypeTags FORTIFICATION: Ancient Walls, Medieval Walls, Defensive Fortifications) on
 * the settlement's centre, bought with gold when the game allows (no reserve: like repairs, it
 * cannot wait), else queued first in a city (behind an item with progress). One a settlement a
 * pass. @param threats from threatenedSettlements @returns log entries
 */
const wallsDiagnosed = new Map(); // settlement "x,y" -> the turn its walls were last explained in UI.log

export function fortifyThreatened(threats, { buy = true, queue = true, reserve = 0, budget = null, pool = null } = {}) {
    const out = [];
    // Under threat walls cannot wait (all the gold); a Fort Town's walls come from the free gold.
    const b = budget ?? createBudget({ gold: goldBalance(), reserve });
    // All the gold only against a real attack: 2+ land raiders, a damaged centre or a war at our door (research/24
    // W8: game 9 spent 1,068 of 1,078 gold on walls against one raider); else the free gold.
    const left = (t) => {
        const urgent = war.near || (Number(t?.land ?? t?.count) || 0) >= 2 || !!t?.damaged;
        return (pool ?? (reserve > 0 ? "free" : "all")) === "free" || !urgent ? b.free() : b.all();
    };
    const why = (city, text) => {
        const k = `${city.location.x},${city.location.y}`;
        if (wallsDiagnosed.get(k) === Game.turn) return;
        wallsDiagnosed.set(k, Game.turn);
        const locked = safe(() => wallsNode(), null);
        log.warn(`walls: none for ${nameOf(city)} (${city.isTown ? "town" : "city"}): ${text}${locked ? `; locked behind ${locked}` : ""}`);
    };
    // Another civilization's own walls (the Normans' Bailey and Motte) are not ours to build.
    const walls = wallDefs();
    if (walls.length === 0) return out;
    for (const t of threats ?? []) {
        // A lone raider 3-4 tiles away calls for a guard, not walls ahead of the queue (research/36 §3).
        if (earlyWarning(t)) continue;
        const city = ownSettlements().find((c) => c.location.x === t.settlement.x && c.location.y === t.settlement.y);
        if (!city) continue;
        const centre = safe(() => GameplayMap.getIndexFromXY(city.location.x, city.location.y), -1);
        // Seen in game: raiders around the capital for 25 turns and no walls, reason unknown; the
        // game's answers go to UI.log once a turn when nothing was done.
        const tried = [];
        let done = false;
        for (const def of walls) {
            if (queueTypes(city).includes(def.$hash)) {
                if (queue && !city.isTown) wallsFirst(city, t, def);
                done = true;
                break;
            }
            const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
            const buyProbe = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
            const plots = [...(probe?.Plots ?? []), ...(buyProbe?.Plots ?? [])];
            tried.push(`${def.ConstructibleType} build ${probe?.Success ?? "?"}/${probe?.Plots?.length ?? 0} buy ${buyProbe?.Success ?? "?"}/${buyProbe?.Plots?.length ?? 0}${probe?.FailureReasons?.length ? ` (${probe.FailureReasons.join("; ")})` : ""}`);
            if (plots.length === 0) continue;
            const loc = safe(() => GameplayMap.getLocationFromIndex(plots.includes(centre) ? centre : plots[0]), null);
            if (!loc) continue;
            const args = { ConstructibleType: def.$hash, X: loc.x, Y: loc.y };
            const name = safe(() => Locale.compose(def.Name), def.ConstructibleType);
            // Where a wonder is queued only against a real attack (research/32 §6): else queued.
            const real = war.near || (Number(t?.land ?? t?.count) || 0) >= 2 || !!t?.damaged;
            if (buy && (real || !holdsWonder(city))) {
                const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
                const cost = Number(r?.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
                if (r?.Success && Number.isFinite(cost) && cost <= left(t)) {
                    Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, args);
                    b.spend(cost, { kind: "WALLS", label: `${name} (${nameOf(city)})` });
                    out.push({ key: "WALLS_BOUGHT", args: [name, nameOf(city), Math.round(cost)] });
                    done = true;
                    break;
                }
            }
            if (!queue || city.isTown || !probe?.Success) continue;
            // Not in a non-final age's last turns: the walls would not be done, and the age change takes the
            // progress (research/23 E6: game 8, Ancient Walls queued 2 turns before the end, 34 of 40 lost).
            if (ageEnding() && !safe(() => Game.AgeProgressManager.isFinalAge, false)) continue;
            if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
            wallsFirst(city, t, def);
            out.push({ key: "WALLS_QUEUED", args: [name, nameOf(city)] });
            done = true;
            break;
        }
        if (!done) why(city, tried.join(", ") || "no fortification known");
    }
    return out;
}

/** A threatened settlement's walls to the front (wallsSlot); UI.log when they pass an item with progress (a probe). */
function wallsFirst(city, threat, def) {
    const slot = wallsSlot(city, threat, def);
    const passes = slot === 0 && frontSlot(city) === 1;
    const head = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const progress = Math.round(currentProgress(city) ?? 0);
    if (toFront(city, def.$hash, slot) && passes) {
        log.warn(`queue: ${nameOf(city)}: ${def.ConstructibleType} moved ahead of ${typeNameOf(head)} with ${progress} production in it (threatened; probe: does it keep its progress? CityBuildQueue.csv)`);
    }
}

/**
 * Wonders to start now (from the Wonders tab's own analysis): cityKey -> { type, name, x, y }.
 * Only races we are likely to win (HIGH, or MEDIUM at a discount) that finish in this age,
 * at most `maxWonders` in production at once, best value per turn of production first.
 */
let wondersLoggedTurn = -1; // UI.log says why no wonder was started, once a turn

// Tiles of a chosen wonder tried in turn when the game refuses the first (research/28 §1).
const WONDER_TILE_TRIES = 6;

/**
 * Wonders we ordered (research/28 §1): `${cityKey}|${type}` -> { type, cityKey, cityName, x, y, turn, seen }. Game 21:
 * the Emile Bell left Carthage's queue unbuilt three times while it waited behind other items (T32-T35), and the
 * Mausoleum of Theodoric once (T46), each with nothing in it (the game's notice: 0 production returned); and the end-
 * of-turn retry, three seconds after the order, did not see it in the queue and ordered the Emile Bell again. An order
 * of this turn counts as started until the game's queue shows it; one gone from the queue unbuilt goes to UI.log with
 * what the game says about it.
 */
const wonderOrders = new Map();
export function resetWonderOrders() {
    wonderOrders.clear();
    noticesLogged.clear();
}

function noteWonderOrder(city, type, tile) {
    wonderOrders.set(`${sidOf(city)}|${type}`, { type, cityKey: sidOf(city), cityName: nameOf(city), x: tile.x, y: tile.y, turn: Game.turn, seen: null });
}

// The game's notices about production it took away (expire at the turn's end): written to UI.log once each.
const PRODUCTION_NOTICES = ["NOTIFICATION_WONDER_FAILED", "NOTIFICATION_PRODUCTION_INVALIDATED"];
const noticesLogged = new Set();

/** The game's current notices of PRODUCTION_NOTICES types, as "TYPE: summary". */
function productionNotices() {
    const out = [];
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? []) {
        const n = safe(() => Game.Notifications.find(id), null);
        const type = n ? safe(() => Game.Notifications.getTypeName(n.Type), null) : null;
        if (!PRODUCTION_NOTICES.includes(type)) continue;
        const summary = safe(() => Game.Notifications.getSummary(id), null);
        out.push({ id: `${id?.owner ?? ""}:${id?.id ?? id}`, text: `${type}: ${summary ? safe(() => Locale.compose(summary), summary) : "?"}` });
    }
    return out;
}

/** Writes the game's new production notices to UI.log. */
function logProductionNotices() {
    for (const n of productionNotices()) {
        if (noticesLogged.has(n.id)) continue;
        noticesLogged.add(n.id);
        log.warn(`game notice: ${n.text}`);
    }
}

/** A city's queue as type names, for UI.log. */
function queueNames(city) {
    return city ? queueTypes(city).map(typeNameOf).join(", ") : "?";
}

/**
 * Checks our wonder orders against the planner's rows: built (ours or a rival's) or still queued, they are done with;
 * gone from the queue unbuilt, UI.log says so with the queue, the game's answer for that tile now and its notices.
 * @returns { cities, types } of this turn's orders the game's queue does not show yet (they count as started)
 */
function watchWonderOrders(w) {
    const cities = new Set();
    const types = new Set();
    for (const [key, o] of wonderOrders) {
        const row = w.rows.find((r) => r.type === o.type);
        if (!row || row.status === "OURS") {
            wonderOrders.delete(key);
            continue;
        }
        if (row.status === "BUILT") {
            log.warn(`wonders: ${o.type} was finished by a rival while in ${o.cityName}'s queue (ordered T${o.turn})`);
            wonderOrders.delete(key);
            continue;
        }
        if (row.inQueue?.cityKey === o.cityKey) {
            o.seen = Game.turn;
            continue;
        }
        if (o.turn === Game.turn) {
            cities.add(o.cityKey);
            types.add(o.type);
            continue;
        }
        const city = ownSettlements().find((c) => sidOf(c) === o.cityKey) ?? null;
        const def = safe(() => GameInfo.Constructibles.lookup(o.type), null);
        const r = city && def ? safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash, X: o.x, Y: o.y }, false), null) : null;
        const answer = r?.Success ? "accepted" : (r?.FailureReasons ?? []).map((f) => safe(() => Locale.compose(f), f)).join("; ") || "refused";
        log.warn(`wonders: ${o.type} left ${o.cityName}'s queue unbuilt (ordered T${o.turn} at ${o.x},${o.y}, last seen ${o.seen === null ? "never" : `T${o.seen}`}); queue now [${queueNames(city)}]; that tile now: ${answer}; game notices: ${productionNotices().map((n) => n.text).join(" | ") || "none"}`);
        wonderOrders.delete(key);
    }
    return { cities, types };
}

// ---- the queue probe (research/31 §5) ----------------------------------------------------------------
// Wonders leave queues unbuilt, and an item in production may stay at 100% while production piles up in it (game 24:
// Carthage's Altar stood at 100% from A27, 290 of 49 by A39; when the Ha'amonga left the queue unbuilt at A40 the pile went,
// and again by A46 with the Emile Bell). The cause is not known. Once a turn, for each city whose queue holds a wonder or
// whose item in production has stood at 100% since an earlier turn, UI.log gets the queue with each entry's progress and
// the turns something was bought there (the game's CityMadePurchase).
const stuckSince = new Map();    // "sid|hash" -> the first turn the item in production stood at ≥ 100%
const stuckTypes = new Map();    // sid -> the items found stuck there (hashes), while queued
const purchaseTurns = new Map(); // city id string -> the last turns something was bought there
const PROBE_PURCHASES = 4;
let queueProbeTurn = -1;
try {
    engine.on("CityMadePurchase", (d) => {
        const k = idString(d?.cityID);
        if (!k) return;
        const turns = purchaseTurns.get(k) ?? [];
        const turn = safe(() => Game.turn, null);
        if (turns[turns.length - 1] !== turn) turns.push(turn);
        purchaseTurns.set(k, turns.slice(-PROBE_PURCHASES));
    });
} catch (_e) {
    // No engine events here.
}

// ---- items the game does not complete (game 33) ---------------------------------------------------------------------
// Such an item stands at 100% while production piles up in it (above; game 33: Брэдфорд's Granary A66-A70, after the
// plague damaged 9 of its tiles at A65 and its purchase failed, and its City Park M56-M60, 945 of 451, while Crewed Space
// Flight Preparation and both flights waited behind it as its production-first building). From the turn after it first
// stood at 100% it is stuck: what it holds is not lost behind another item (root gotcha 20: each keeps its own), so
// frontSlot is 0 there, toFront never brings it back to the front nor keeps a move behind it, and unstickQueues moves the
// next item ahead of it (or queues one when it stands alone).

/** The first turn this city's item in production stood at 100%, when that was an earlier turn (stuck); else null. */
function stuckHeadSince(city) {
    const sid = sidOf(city);
    const head = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    const k = `${sid}|${head}`;
    for (const key of [...stuckSince.keys()]) if (key.startsWith(`${sid}|`) && key !== k) stuckSince.delete(key);
    if (head === null || head === -1 || !((Number(safe(() => city.BuildQueue.getPercentComplete(head), 0)) || 0) >= 100)) {
        stuckSince.delete(k);
        return null;
    }
    if (!stuckSince.has(k)) stuckSince.set(k, Game.turn);
    const since = stuckSince.get(k);
    if (!(since < Game.turn)) return null;
    const set = stuckTypes.get(sid) ?? new Set();
    set.add(head);
    stuckTypes.set(sid, set);
    return since;
}

/** Was this item found stuck in this city (stuckHeadSince), and is it still in its queue? */
function isStuck(city, hash) {
    const set = stuckTypes.get(sidOf(city));
    if (!set?.has(hash)) return false;
    if (queueTypes(city).includes(hash)) return true;
    set.delete(hash);
    return false;
}

/** Forgets the items found stuck (tests; a new game). */
export function resetStuckItems() {
    stuckSince.clear();
    stuckTypes.clear();
}

/**
 * The next item goes ahead of an item the game does not complete (above), as this pass's edit of that city's queue; one
 * standing alone gets the plan's next building (else the cheapest), to go ahead of it next pass. @returns log entries
 */
export function unstickQueues() {
    const out = [];
    for (const city of ownSettlements()) {
        if (city.isTown || editedThisPass(city)) continue;
        const since = stuckHeadSince(city);
        if (since === null) continue;
        const types = queueTypes(city);
        const head = types[0];
        const held = Math.round(Number(safe(() => city.BuildQueue.getPercentComplete(head), 0)) || 0);
        if (types.length > 1) {
            if (!moveInQueue(city, 1, 0)) continue;
            log.warn(`queue: ${nameOf(city)}: ${typeNameOf(head)} has stood at 100% since T${since} (${held}%: the game does not complete it); ${typeNameOf(types[1])} moved ahead of it (probe)`);
            out.push({ key: "QUEUE_UNSTUCK", args: [nameOf(city), itemName(head), itemName(types[1])] });
            continue;
        }
        const add = plannedAbsorbers(city)[0] ?? cheapestBuilding(city) ?? lastResort(city);
        if (!add) continue;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, add.args);
        const type = add.type ?? safe(() => GameInfo.Constructibles.lookup(add.args?.ConstructibleType)?.ConstructibleType, null);
        if (type) noteBuilt(city, type);
        const name = type ? itemName(type) : safe(() => Locale.compose(add.name), String(add.name));
        log.warn(`queue: ${nameOf(city)}: ${typeNameOf(head)} has stood at 100% since T${since} (${held}%: the game does not complete it) alone; ${type ?? add.name} queued to go ahead of it (probe)`);
        out.push({ key: "QUEUE_UNSTUCK_QUEUED", args: [nameOf(city), itemName(head), name] });
    }
    return out;
}

/** Writes the queue probe to UI.log, once a turn (above). */
export function probeQueues() {
    if (queueProbeTurn === Game.turn) return;
    queueProbeTurn = Game.turn;
    for (const city of ownSettlements()) {
        if (city.isTown) continue;
        const types = queueTypes(city);
        const head = safe(() => city.BuildQueue.currentProductionTypeHash, null);
        const pctOf = (h) => Math.round(Number(safe(() => city.BuildQueue.getPercentComplete(h), 0)) || 0);
        const stuck = stuckHeadSince(city);
        if (stuck === null && !types.some(isWonderType)) continue;
        const bought = purchaseTurns.get(idString(city.id)) ?? [];
        log.warn(`queue probe: ${nameOf(city)}: [${types.map((h) => `${typeNameOf(h)} ${pctOf(h)}%${h === head ? "*" : ""}`).join(", ")}]${stuck !== null ? `; ${typeNameOf(head)} at 100% since T${stuck}` : ""}; bought here ${bought.length ? bought.map((t) => `T${t}`).join(", ") : "-"}`);
    }
}

/**
 * Orders a chosen wonder in this city on the first of its tiles the game accepts (research/28 §1: nothing said why a
 * pick was not ordered). Remembered as ordered this turn. @returns a log entry, or null
 */
function orderWonder(city, wonder) {
    const def = safe(() => GameInfo.Constructibles.lookup(wonder.type), null);
    if (!def) return null;
    const tiles = [{ x: wonder.x, y: wonder.y }, ...(wonder.plots ?? [])]
        .filter((p, i, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === i).slice(0, WONDER_TILE_TRIES);
    const refused = [];
    for (const t of tiles) {
        const args = { ConstructibleType: def.$hash, X: t.x, Y: t.y };
        const r = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
        if (!r?.Success) {
            refused.push(...(r?.FailureReasons ?? []).map((f) => safe(() => Locale.compose(f), f)));
            continue;
        }
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
        noteBuilt(city, wonder.type);
        noteWonderOrder(city, wonder.type, t);
        return { key: "QUEUED_WONDER", args: [nameOf(city), wonder.name, wonder.race === "HIGH" ? Locale.compose("LOC_XPL_RACE_HIGH") : Locale.compose("LOC_XPL_RACE_MEDIUM")] };
    }
    log.warn(`wonders: ${nameOf(city)} could not order ${wonder.type} on ${tiles.map((t) => `${t.x},${t.y}`).join(" ")}: ${[...new Set(refused)].join("; ") || "no reason given"}`);
    return null;
}

const isWonderType = (h) => safe(() => GameInfo.Constructibles.lookup(h)?.ConstructibleClass, null) === "WONDER";

const wonderBuysNoted = new Map(); // city key -> the turn UI.log said its building purchases wait for a wonder

/**
 * No building is bought in a city whose queue holds a wonder, or where one was ordered this turn (research/32 §6; units
 * still are). Four times a wonder left a queue unbuilt the turn after a building was bought in its city: a Saw Pit and a
 * Garden in Carthage (game 24), walls in Cusco (game 25), a Harbor in Чанъань in the pass the Serpent Mound was ordered
 * (game 27). The cause is not known; this tests the lead. UI.log once a turn per city.
 */
function holdsWonder(city) {
    if (!city || city.isTown) return false;
    const k = sidOf(city);
    const queued = queueTypes(city).find(isWonderType);
    let name = queued !== undefined ? typeNameOf(queued) : null;
    if (!name) {
        for (const o of wonderOrders.values()) {
            if (o.cityKey !== k || o.turn !== Game.turn) continue;
            name = o.type;
            break;
        }
    }
    if (!name) return false;
    if (wonderBuysNoted.get(k) !== Game.turn) {
        wonderBuysNoted.set(k, Game.turn);
        log.info(`purchases: no building bought in ${nameOf(city)} while ${name} is in its queue (research/32 §6: wonders left the queue the turn after a building was bought in their city)`);
    }
    return true;
}

/**
 * Where a wonder waiting in a queue goes (research/28 §1): the very front, ahead of a building with progress, so it
 * starts at once. Game 21: moving an item ahead left every item its own progress (the Emile Bell ahead of a Library with
 * 30; a Dungeon ahead of the Serpent Mound), and a wonder would absorb a building's progress if the game handed it over
 * (root gotcha 20), so nothing is lost either way; and the wonders that waited behind other items left the queue unbuilt
 * four times. Behind a wonder in production (never two wonders taking turns), and behind an item done this turn.
 */
function wonderSlot(city) {
    if (isWonderType(safe(() => city.BuildQueue.currentProductionTypeHash, null))) return 1;
    const left = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    return left > 0 && left <= 1 ? 1 : 0;
}

// A wonder option taking longer than this is not started (research/24 P5).
export const WONDER_MAX_TURNS = 15;
// After the win (game 40): wonders in production at once, the longest build taken, and the weight of a race only its length
// makes LOW (no rival seen or queued: core raceLabel's LOC_XPL_WONDER_R_SLOW). A lost race still returns half its progress,
// and the cash-out guards it (root gotcha 53).
export const AFTER_WIN_WONDERS = 3;
export const AFTER_WIN_WONDER_TURNS = 30;
const SLOW_RACE_FACTOR = 0.4;
const slowOnly = (race) => race?.label === "LOW" && (race.reasons ?? []).some((x) => x.key === "LOC_XPL_WONDER_R_SLOW");

// A rival finishing a wonder that waits in our queue takes the progress of our item in production with it: the game drops
// the wonder (NOTIFICATION_PRODUCTION_INVALIDATED, «0 returned») and the item starts over. Game 34: Лондон's Chart the
// Stars lost 78 at A39 to the Colossus and 181 at A57 to the Ha'amonga a Maui, both waiting behind it; game 25: Spherical
// Earth lost 187 to the Pyramid of the Sun. So no wonder waits behind an item that holds the front longer than
// WONDER_WAIT_TURNS: a project (a wonder never passes one) or a wonder in production.
export const WONDER_WAIT_TURNS = 1;
const wonderHeldNoted = new Map(); // sid -> the turn UI.log said a wonder was not ordered there

/** The project or wonder in production that holds this city's front longer than WONDER_WAIT_TURNS: { h, left }, else null. */
function frontHeld(city) {
    const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
    if (h === null || h === -1) return null;
    if (!isWonderType(h) && !safe(() => GameInfo.Projects.lookup(h), null)) return null;
    const left = Number(safe(() => city.BuildQueue.currentTurnsLeft, 0)) || 0;
    return left > WONDER_WAIT_TURNS ? { h, left } : null;
}

/** UI.log once a turn per city: a chosen wonder is not ordered behind the item that holds the front (frontHeld). */
function noteWonderHeld(city, type, held) {
    if (wonderHeldNoted.get(sidOf(city)) === Game.turn) return;
    wonderHeldNoted.set(sidOf(city), Game.turn);
    log.info(`wonders: ${type} not ordered in ${nameOf(city)}: ${typeNameOf(held.h)} holds its queue ${held.left} turns, and a rival finishing the wonder would take that item's progress`);
}

// A wonder granting Innovation (research/21 D7): worth this much more with the science focus (3 points × 4,
// like WONDER_LEGACY_VALUE for the culture path).
export const INNOVATION_WONDER_VALUE = 12;

/** Wonders that grant Innovation (GameInfo.ConstructibleModifiers *_SCIENCE_VP: Great Library, Nalanda, Oxford…). */
export function innovationWonders() {
    const out = new Set();
    for (const r of GameInfo.ConstructibleModifiers?.filter((x) => /_SCIENCE_VP$/.test(x.ModifierId ?? "")) ?? []) {
        if (safe(() => GameInfo.Constructibles.lookup(r.ConstructibleType)?.ConstructibleClass, null) === "WONDER") out.add(r.ConstructibleType);
    }
    return out;
}

/** Cities that get or should get a Launch Pad (standing, queued, or among the `pads` best producers): no wonder there (D5). */
export function padCities(pads) {
    const def = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD), null);
    const production = (c) => Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const cities = ownSettlements().filter((c) => !c.isTown);
    const order = [...cities.filter((c) => cityHas(c, LAUNCH_PAD) || (def && queueTypes(c).includes(def.$hash))),
        ...[...cities].sort((a, b) => production(b) - production(a)).slice(0, Math.max(0, Number(pads) || 0))];
    // At most every city but one: a wonder always has somewhere to go (research/22 B5: game 7, 3 pads in 3 cities
    // kept every wonder out).
    return new Set([...new Set(order.map(sidOf))].slice(0, Math.max(0, cities.length - 1)));
}

// Launch Pad cities keep out of wonders once Rocketry's way is this far along (or open).
export const PAD_GATE_NEAR = 0.6;

/**
 * Cities kept out of wonders for Launch Pads (the strategy's padCitiesNoWonders), only once Rocketry is near:
 * open, or PAD_GATE_NEAR of its way and in time (not gateLate). Research/22 B5: game 7 kept the best cities
 * out of wonders from the first Modern turn, and Rocketry never came in time.
 */
export function padExclusion(strategy) {
    if (!strategy?.padCitiesNoWonders) return null;
    const near = !!strategy.gate?.open || (!strategy.gateLate && (Number(strategy.gate?.progress) || 0) >= PAD_GATE_NEAR);
    return near ? padCities(strategy.pads) : null;
}

export function chooseWonders(settings, maxWonders, { settlers = false, excludeCities = null } = {}) {
    const picks = new Map();
    // The planner and the watch over our orders every pass, whether a wonder may start or not: the cash-out reads the
    // planner's rows of this pass (game 22: during a war at our door the Shwedagon Pagoda's loss was logged 26 turns late).
    const w = safe(() => runWonderPlanner(settings), null);
    safe(() => logProductionNotices(), null);
    // This turn's orders the game's queue does not show yet count as started (research/28 §1).
    const pending = w ? watchWonderOrders(w) : null;
    // The queues holding a wonder, and items stuck at 100% (research/31 §5): UI.log only.
    safe(() => probeQueues(), null);
    if (!w || expandingFirst(settlers)) return picks;
    if (war.near) return picks; // a war at our door: production goes to defence (research/23 D3)
    // Science (the profile's focus): Innovation wonders count more; the strategy may allow only them.
    const innovation = innovationWonders();
    const science = focusOfProfile(settings?.profile) === "SCIENCE";
    const onlyInnovation = settings?.strategy?.wonderKind === "INNOVATION";
    const playOn = !!settings?.afterWin;
    const building = w.rows.filter((r) => r.status === "IN_PROGRESS").length + pending.types.size;
    let room = Math.max(0, maxWonders - building);
    const busyCities = new Set([...w.rows.filter((r) => r.inQueue).map((r) => r.inQueue.cityKey), ...pending.cities]);
    // Every (wonder, city) pair: the second wonder can go to the second-fastest city.
    let pairs = [];
    for (const r of w.rows) {
        const factor = RACE_FACTOR[r.race?.label] ?? (playOn && slowOnly(r.race) ? SLOW_RACE_FACTOR : undefined);
        if (r.status !== "AVAILABLE" || !factor) continue;
        for (const o of r.options) {
            if (excludeCities?.has(o.cityKey)) continue;
            const plot = o.plots[0];
            if (!plot || !(o.turns > 0)) continue;
            if (w.ageTurnsLeft !== null && o.turns > w.ageTurnsLeft - WONDER_AGE_MARGIN) continue;
            // A wonder that takes too long there is lost to someone unseen (research/24 P5: 29-30 turns, both lost).
            if (o.turns > (playOn ? AFTER_WIN_WONDER_TURNS : WONDER_MAX_TURNS)) continue;
            // A rival near a culture win: each wonder we build is one it cannot (the strategy's denyWonders).
            const legacy = WONDER_LEGACY_VALUE * (settings?.strategy?.denyWonders ? 2 : 1);
            const bonus = science && innovation.has(r.type) ? INNOVATION_WONDER_VALUE : 0;
            // Its effect (free technologies, attribute points, a settlement limit...) by its tier (research/27 §4).
            const value = (r.baseValue + (plot.value ?? 0) + legacy + bonus + tierValue(r.type)) * factor;
            pairs.push({ score: value / o.turns, type: r.type, name: r.name, cityKey: o.cityKey, plots: o.plots, race: r.race.label, innov: innovation.has(r.type) });
        }
    }
    // The strategy's INNOVATION kind: Innovation wonders first; when none can be started, any wonder we can win
    // (research/23 S2: game 8, every available wonder was "not Innovation", none built in 115 turns while the
    // capital built Baths for 8 turns).
    if (onlyInnovation && pairs.some((p) => p.innov)) pairs = pairs.filter((p) => p.innov);
    pairs.sort((a, b) => b.score - a.score);
    if (pairs.length === 0 && room > 0 && wondersLoggedTurn !== Game.turn) {
        wondersLoggedTurn = Game.turn;
        const available = w.rows.filter((r) => r.status === "AVAILABLE");
        log.warn(`wonders: none to start (room ${room}): ${available.length} available [${available.slice(0, 6).map((r) => `${r.type} ${r.race?.label ?? "?"}`).join(", ")}], ${available.filter((r) => !RACE_FACTOR[r.race?.label]).length} races not ours, ${excludeCities?.size ?? 0} cities kept for Launch Pads, age turns left ${w.ageTurnsLeft ?? "?"}`);
    }
    const startedTypes = new Set(pending.types);
    const claimed = new Set();
    for (const p of pairs) {
        if (room <= 0) break;
        if (busyCities.has(p.cityKey) || picks.has(p.cityKey) || startedTypes.has(p.type)) continue;
        const plot = p.plots.find((q) => !claimed.has(q.idx));
        if (!plot) continue;
        claimed.add(plot.idx);
        startedTypes.add(p.type);
        // The other tiles, in the planner's order, in case the game refuses this one (orderWonder).
        const plots = p.plots.filter((q) => q.idx !== plot.idx).map((q) => ({ x: q.x, y: q.y }));
        picks.set(p.cityKey, { type: p.type, name: p.name, x: plot.x, y: plot.y, plots, cityKey: p.cityKey, race: p.race, score: p.score });
        room--;
    }
    return picks;
}

/**
 * Production: wanted scouts and settlers first (trainWantedUnits, even into busy queues),
 * then empty queues get a chosen wonder, else the plan, else the advisor, else the cheapest
 * building (an empty queue holds the turn). `unitOptions`: which civilian units the
 * autopilot will use ({ explore, settlers, merchants }). @returns log entries
 */
export function fillProduction(wonderPicks = new Map(), unitOptions = {}) {
    const plans = state.get().results.plans;
    const left = ageEndTurns(); // an age's last turns (the final age: all of it): only what is done before it ends
    const levers = new Set(unitOptions.victory ? leverBuildings(unitOptions.victory, currentAge()) : []);
    safe(() => dropLeftoverDefenders(unitOptions.threats ?? []), null);
    const trained = trainWantedUnits(unitOptions);
    const out = [...trained.entries];
    const lost = lostWonderRows();
    // Near Rocketry a city kept for a Launch Pad starts no building that would still be in production when Rocketry comes,
    // production buildings aside (research/38 §4 B3: games 30 and 31 started Canneries, Laboratories and City Parks a turn
    // or two before it, and their pads waited 2-8 turns behind them). Rocketry's turns: the research plan's way.
    const padNear = !unitOptions.strategy?.gate?.open ? padExclusion(unitOptions.strategy) : null;
    const gateEta = padNear ? Number(safe(() => researchPlan(ownSettlements().filter((c) => !c.isTown)).gateTurns, 0)) || 0 : 0;
    // A chosen wonder goes into a busy queue too, and a wonder waiting in a queue moves to the front
    // (behind an item with progress; the levers then stay behind it: leverSlot). Research/22 B5: with the
    // science levers every queue stayed busy, and no wonder was built all game.
    for (const city of ownSettlements()) {
        if (city.isTown) continue;
        const wonder = wonderPicks.get(sidOf(city));
        const busy = !safe(() => city.BuildQueue.isEmpty, false) || unitOptions.queued?.get(sidOf(city))?.size > 0;
        const held = frontHeld(city);
        if (wonder && busy && held) noteWonderHeld(city, wonder.type, held);
        else if (wonder && busy) {
            const entry = orderWonder(city, wonder);
            if (entry) {
                out.push(entry);
                continue;
            }
        }
        // A wonder waiting in the queue goes to the very front (wonderSlot), unless its race is lost (the cash-out
        // put a building ahead of it: game 21, Chicago's Serpent Mound went back and forth).
        const types = queueTypes(city);
        const slot = wonderSlot(city);
        const i = types.findIndex((t, j) => j > slot && isWonderType(t) && !lost.has(typeNameOf(t)));
        if (i <= 0) continue;
        // Exposed behind an item that holds the front (frontHeld): it leaves the queue while it holds nothing.
        if (held && !((Number(safe(() => city.BuildQueue.getPercentComplete(types[i]), 0)) || 0) > 0)) {
            if (removeFromQueue(city, i)) {
                log.warn(`wonders: ${typeNameOf(types[i])} leaves ${nameOf(city)}'s queue while ${typeNameOf(held.h)} holds it ${held.left} turns: a rival finishing it would take that item's progress (game 34)`);
                out.push({ key: "WONDER_WAIT_DROPPED", args: [nameOf(city), itemName(types[i]), itemName(held.h), held.left] });
            }
            continue;
        }
        // Never ahead of a project (a science project is the path's own work).
        let to = slot;
        while (to < i && safe(() => GameInfo.Projects.lookup(types[to]), null)) to++;
        toFront(city, types[i], to);
    }
    for (const city of ownSettlements()) {
        if (city.isTown || trained.used.has(sidOf(city)) || !safe(() => city.BuildQueue.isEmpty, false)) continue;
        // The victory step queued something here this pass: the game's isEmpty does not know yet (H2).
        if (unitOptions.queued?.get(sidOf(city))?.size > 0) continue;
        const wonder = wonderPicks.get(sidOf(city)); // the wonder job keys cities "c:x-y" too
        if (wonder) {
            const entry = orderWonder(city, wonder);
            if (entry) {
                out.push(entry);
                continue;
            }
        }
        // A space city in the final push (it has or builds a Launch Pad): only science sites from the plan, no other
        // building (game 11: the plan queued a Cannery behind Лянчжоу's Launch Pad; the pad's overflow went into it).
        const space = spaceCity(city, unitOptions);
        const military = skipsMilitaryBuildings(unitOptions) ? isMilitaryBuilding : null;
        const sites = space ? new Set(scienceSites(currentAge(), { pads: unitOptions.strategy?.pads ?? null }).map((x) => x.type).filter((t) => siteIn(city, t))) : null;
        const inAge = (t) => doneInAge(city, t, left);
        // After the win: no project that serves only a victory (dropVictoryWork would take it out again).
        const over = (t) => !!unitOptions.afterWin && victoryOnly(t);
        // The path's buildings only where they are built soon, as the victory step queues them (leverSoon; game 16's
        // Laboratories took 25-36 turns in weak cities): a slower city leaves them to the purchases. The plan and the
        // advisor queued them anyway (a 40-turn Laboratory the victory step had refused).
        const slowLever = (t) => {
            const def = levers.size > 0 ? safe(() => GameInfo.Constructibles.lookup(t), null) : null;
            return !!def && levers.has(def.ConstructibleType) && !leverSoon(city, def);
        };
        const padWait = padNear?.has(sidOf(city)) && gateEta > 0 ? (t) => holdsPadRoom(city, t, gateEta) : null;
        const skip = (t) => (space ? !sites.has(t) : !!military?.(t)) || !inAge(t) || slowLever(t) || !!padWait?.(t);
        if (plans) {
            const r = queueNextBuildings(plans, sidOf(city), 2, { skip });
            if (r.queued.length > 0) {
                out.push({ key: "QUEUED_PLAN", args: [nameOf(city), r.queued.map((t) => Locale.compose(GameInfo.Constructibles.lookup(t)?.Name ?? t)).join(", ")] });
                continue;
            }
        }
        // After the win every building is built (the user, game 40): the plan places them all, each on its best tile
        // (placeEvenIfNegative); what it leaves out (no tile in its model) comes next, cheapest first, on the plan's tile or the
        // game's best of the tiles the plan leaves free (bestPlotFor), before the advisor's units and projects.
        const remaining = unitOptions.afterWin ? cheapestBuilding(city, { skip }) : null;
        if (remaining) {
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, remaining.args);
            out.push({ key: "QUEUED_REMAINING", args: [nameOf(city), Locale.compose(remaining.name)] });
            continue;
        }
        const order = advisorOrder(city, { ...unitOptions, onlyProjects: space, fits: (t) => inAge(t) && !slowLever(t) && !padWait?.(t) && !over(t) });
        const fallback = order ? null : cheapestBuilding(city, { skip }) ?? lastResort(city, { skip: over });
        if (order) {
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, order.args);
            out.push({ key: "QUEUED_ADVISOR", args: [nameOf(city), Locale.compose(order.name)] });
        } else if (fallback) {
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, fallback.args);
            out.push({ key: "QUEUED_FALLBACK", args: [nameOf(city), Locale.compose(fallback.name)] });
        } else {
            out.push({ key: "QUEUE_NOTHING", args: [nameOf(city)] });
        }
    }
    return out;
}

const padRoomNoted = new Map(); // sid -> the turn UI.log said a pad city kept room for its pad

/** A building a pad city does not start now: not a production building, and longer than Rocketry's turns (fillProduction). */
function holdsPadRoom(city, t, gateEta) {
    const def = safe(() => GameInfo.Constructibles.lookup(t), null);
    if (def?.ConstructibleClass !== "BUILDING") return false;
    // Never its Launch Pad (game 32 logged «no BUILDING_LAUNCH_PAD» for the pad itself), nor a production building. The
    // Airfield and the Radio Station are no site of a city kept for a pad (siteIn; game 34: Ньюкасл and Бирмингем queued
    // Radio Stations from the plan five turns before Rocketry, and their projects waited behind them).
    if (def.ConstructibleType === LAUNCH_PAD) return false;
    if (GameInfo.TypeTags?.find((r) => r.Type === def.ConstructibleType && (r.Tag === "PRODUCTION" || r.Tag === "PRODUCTION_WAREHOUSE"))) return false;
    const turns = itemTurns(city, def.$hash);
    if (!(turns > gateEta)) return false;
    if (padRoomNoted.get(sidOf(city)) !== Game.turn) {
        padRoomNoted.set(sidOf(city), Game.turn);
        log.info(`queue: ${nameOf(city)} keeps room for its Launch Pad: no ${def.ConstructibleType} (${turns} turns), Rocketry in ${Math.ceil(gateEta)}`);
    }
    return true;
}

// ---- an age's last turns -------------------------------------------------------------------------

// Production in progress is lost at an age change (research/23 E6). Game 22 lost 732 at the end of Exploration
// (research/29 §3): Universities at 287 of 313 (two lancers had gone ahead of it), 258 of 266 and 109 of 313, and a
// settler at 77 of 115 queued 7 turns before the end; 100 at the end of Antiquity. In a non-final age's last
// AGE_END_TURNS turns an item is started only where it is done before the age ends (AGE_END_MARGIN turns early: the
// turns left are an estimate), and an item in production that cannot be done gives way to one that can (ageEndOrder).
// The final age ends the game, so there the whole age is timed (research/30 §3: game 23 ended with 3,212 production
// in unfinished items, six Launch Pads among them).
export const AGE_END_TURNS = 12;
const AGE_END_MARGIN = 1;

/** A non-final age's turns left while within AGE_END_TURNS (the research then is lost at the age change), else null. */
function researchAgeLeft() {
    const o = safe(() => ageOutlook(), null);
    if (!o || o.isFinalAge) return null;
    const left = Number(o.turnsLeft);
    return Number.isFinite(left) && left <= AGE_END_TURNS ? left : null;
}

/** Turns left before the age ends: a non-final age's while within AGE_END_TURNS, the final age's always; else null. */
export function ageEndTurns() {
    const o = safe(() => ageOutlook(), null);
    if (!o) return null;
    const left = Number(o.turnsLeft);
    if (!Number.isFinite(left)) return null;
    return o.isFinalAge || left <= AGE_END_TURNS ? left : null;
}

/** A building's, unit's or project's hash and this city's production cost of it (by hash or type name). */
function itemCost(city, h) {
    const P = city.Production;
    const c = safe(() => GameInfo.Constructibles.lookup(h), null);
    if (c) return { hash: c.$hash, cost: costIn(city, c.ConstructibleType) };
    const u = safe(() => GameInfo.Units.lookup(h), null);
    if (u) return { hash: u.$hash, cost: Number(safe(() => P.getUnitProductionCost(u.UnitType), u.Cost ?? 0)) || 0 };
    const p = safe(() => GameInfo.Projects.lookup(h), null);
    if (p) return { hash: p.$hash, cost: Number(safe(() => P.getProjectProductionCost(p.ProjectType), p.Cost ?? 0)) || 0 };
    return { hash: h, cost: 0 };
}

/** Turns this city needs for an item, its own progress counted (an item moved back keeps it: root gotcha 20). */
function itemTurns(city, h) {
    const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    if (!(prod > 0)) return Infinity;
    const { hash, cost } = itemCost(city, h);
    const pct = Math.min(100, Math.max(0, Number(safe(() => city.BuildQueue.getPercentComplete(hash), 0)) || 0));
    return Math.ceil((cost * (1 - pct / 100)) / prod);
}

/** Is the item done before the age ends (`left`: ageEndTurns(); null: no end near), when started after `wait` turns? */
const doneInAge = (city, h, left, wait = 0) => left === null || wait + itemTurns(city, h) <= left - AGE_END_MARGIN;

/** A building's, unit's or project's name, for the log. */
function itemName(h) {
    const d = safe(() => GameInfo.Constructibles.lookup(h) ?? GameInfo.Units.lookup(h) ?? GameInfo.Projects.lookup(h), null);
    return d ? Locale.compose(d.Name) : String(h);
}

/**
 * An age's last turns (the final age: all of it, ageEndTurns): where the item in production is not done before the age
 * ends, the queued item that is and costs the most goes first (one edit a pass); nothing queued is: the plan's costliest
 * building that is (else the costliest one the city can place that is) is queued, to go first next pass. A wonder (the
 * cash-out's) or a project (projectSlot) in production stays. @returns log entries
 */
export function ageEndOrder() {
    const out = [];
    const left = ageEndTurns();
    if (left === null) return out;
    // The final age's end is the game's (its own words in the log).
    const end = safe(() => ageOutlook().isFinalAge, false) ? "GAME_END" : "AGE_END";
    for (const city of ownSettlements()) {
        if (city.isTown || editedThisPass(city)) continue;
        const types = queueTypes(city);
        const head = types[0];
        if (head === undefined || isWonderType(head) || safe(() => GameInfo.Projects.lookup(head), null) || doneInAge(city, head, left)) continue;
        // A repair stays: repairBuildings moves it to the front every pass.
        if (damagedOf(city).some((d) => d.def.$hash === head)) continue;
        let best = null;
        types.forEach((h, i) => {
            if (i === 0 || isWonderType(h) || !doneInAge(city, h, left)) return;
            const { cost } = itemCost(city, h);
            if (!best || cost > best.cost) best = { i, h, cost };
        });
        if (best) {
            if (moveInQueue(city, best.i, 0)) out.push({ key: `${end}_FIRST`, args: [nameOf(city), itemName(best.h), itemName(head), left] });
            continue;
        }
        const fits = (type) => doneInAge(city, type, left);
        const planned = plannedAbsorbers(city).filter((p) => fits(p.type));
        const add = planned.length > 0 ? planned.reduce((a, b) => (b.cost > a.cost ? b : a)) : costliestBuilding(city, fits);
        if (!add) continue;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, add.args);
        noteBuilt(city, add.type);
        out.push({ key: `${end}_QUEUED`, args: [nameOf(city), itemName(add.type), left] });
    }
    return out;
}

// A non-final age's last AGE_END_BUY_TURNS turns (the last one: 0): a building in production that would not be done
// before the age ends and is at least AGE_END_BUY_SHARE done is bought (the game prices an item in progress by what it
// lacks), the most production kept first (research/30 §4: the capital's Bazaar ended Exploration 19 production short,
// about 77 gold with 822 in the treasury). From the whole treasury, the reserve too: the gold carries over, the production
// does not (research/31 §5: game 25 lost an Academy at 94% for about 30 gold behind a reserve of 64); only the free gold
// while a settlement is threatened (its defence comes first).
export const AGE_END_BUY_TURNS = 1;
export const AGE_END_BUY_SHARE = 0.5;

/** Buys the nearly done buildings a non-final age's end would take (above). @returns log entries */
export function buyAgeEndItems(budget = null, { threatened = false } = {}) {
    const out = [];
    const o = safe(() => ageOutlook(), null);
    if (!o || o.isFinalAge || o.endless) return out;
    const apm = safe(() => Game.AgeProgressManager, null);
    const points = Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0)) || 0;
    const max = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0)) || 0;
    // The age's last turn: nothing more is done (its points are full); else the estimate's turns left.
    const left = max > 0 && points >= max ? 0 : Number(o.turnsLeft);
    if (!Number.isFinite(left) || left > AGE_END_BUY_TURNS) return out;
    const b = budget ?? createBudget({ gold: goldBalance() });
    const items = [];
    for (const city of ownSettlements()) {
        if (city.isTown) continue;
        const h = safe(() => city.BuildQueue.currentProductionTypeHash, null);
        const def = h === null || h === -1 ? null : safe(() => GameInfo.Constructibles.lookup(h), null);
        if (!def || isWonderType(h)) continue; // a unit is bought new and a project not at all: only buildings
        const pct = Math.min(100, Math.max(0, Number(safe(() => city.BuildQueue.getPercentComplete(h), 0)) || 0));
        if (pct < AGE_END_BUY_SHARE * 100 || itemTurns(city, h) <= left) continue;
        // As the game's production list buys an item in progress: on its tile (production-chooser-helpers.js Construct).
        const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
        if (!r?.Success || !r.InProgress || !(r.Plots?.length > 0)) continue;
        const loc = safe(() => GameplayMap.getLocationFromIndex(r.Plots[0]), null);
        const cost = Number(r.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
        if (!loc || !Number.isFinite(cost) || cost <= 0) continue;
        items.push({ city, args: { ConstructibleType: def.$hash, X: loc.x, Y: loc.y }, cost, kept: (itemCost(city, h).cost * pct) / 100, name: itemName(h) });
    }
    items.sort((a, b2) => b2.kept - a.kept);
    // Not from the gold banked for the next age (game 34: a Shipyard and an Armorer took 920 of Exploration's 974 bank at
    // E67, and Modern opened with 255).
    const banking = b.goal?.kind === "BANK" && !b.goal.done;
    const pool = () => (threatened || banking ? b.free() : b.all());
    for (const it of items) {
        if (it.cost > pool()) continue;
        Game.CityCommands.sendRequest(it.city.id, CityCommandTypes.PURCHASE, it.args);
        b.spend(it.cost, { kind: "AGE_END", label: `${it.name} (${nameOf(it.city)})` });
        out.push({ key: "AGE_END_BOUGHT", args: [nameOf(it.city), it.name, Math.round(it.cost)] });
    }
    return out;
}

// ---- growth ----------------------------------------------------------------------------

/** Places one waiting citizen per city where the growth advisor says. @returns log entries */
/** Names of our settlements that say a new citizen waits (for the log). */
export function readyToGrow() {
    return ownSettlements().filter((c) => safe(() => c.Growth.isReadyToPlacePopulation, false)).map((c) => `${nameOf(c)}${c.isTown ? " (town)" : ""}`);
}

/** @param options { victory: the victory focus (economy: resource tiles; science: 40-yield tiles) } */
export function placeGrowth(settings, { victory = null } = {}) {
    const out = [];
    let townFocus = null; // town key -> the Focus it will take at population 7 (Towns tab)
    for (const city of ownSettlements()) {
        if (!safe(() => city.Growth.isReadyToPlacePopulation, false)) continue;
        let focusKind = null;
        if (city.isTown) {
            townFocus ??= new Map((safe(() => runTownAdvisor(settings), null)?.rows ?? []).map((r) => [`${r.town.x},${r.town.y}`, r.focus?.best?.key ?? null]));
            focusKind = townFocus.get(`${city.location.x},${city.location.y}`) ?? null;
        }
        const a = growthAdvice(city.id, settings, { focusKind, victory });
        // A new citizen holds the turn (NOTIFICATION_NEW_POPULATION) until placed: the advised
        // choice first, then every offered tile in order, then a specialist (towns have none).
        const specialist = () => {
            if (city.isTown || !a?.bestSpecialist) return null;
            const args = { Location: a.bestSpecialist.idx, Amount: 1 };
            if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.ASSIGN_WORKER, args, false), null)?.Success) return null;
            Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.ASSIGN_WORKER, args);
            return { key: "GROWTH_SPECIALIST", args: [nameOf(city), a.bestSpecialist.gain] };
        };
        const tile = () => {
            for (const t of a?.expand ?? []) {
                const args = { X: t.x, Y: t.y };
                const ok = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, args, false), null);
                if (ok && ok.Success === false) continue;
                Game.CityCommands.sendRequest(city.id, CityCommandTypes.EXPAND, args);
                return { key: "GROWTH_TILE", args: [nameOf(city), t.score] };
            }
            return null;
        };
        const placed = a?.choice === "SPECIALIST" ? specialist() ?? tile() : tile() ?? specialist();
        if (placed) {
            out.push(placed);
            countGrowth(placed.key === "GROWTH_SPECIALIST" ? "specialists" : "tiles");
        }
        else log.info(`autopilot: no place for a new citizen in ${nameOf(city)}: ${a?.expand?.length ?? 0} tiles offered, ${a?.specialists?.length ?? 0} specialist slots${city.isTown ? " (town)" : ""}`);
    }
    return out;
}

// New citizens this age: on tiles or as specialists (the economy line).
let growthCounts = { age: null, tiles: 0, specialists: 0 };
function countGrowth(kind) {
    const age = currentAge();
    if (growthCounts.age !== age) growthCounts = { age, tiles: 0, specialists: 0 };
    growthCounts[kind]++;
}

export const ECONOMY_EVERY = 10; // turns between two economy lines

/**
 * UI.log, every ECONOMY_EVERY turns (research/26 §3.2, the probe of proposal 4): our yields, urban and rural
 * population and specialists, where this age's new citizens went, the player's balance, the rivals' science and
 * culture when the game tells them, and each settlement's food / production / science / culture with its
 * urban / rural / specialists. @returns the line, or null (not this turn)
 */
export function logEconomy(settings) {
    const turn = Number(Game.turn) || 0;
    if (turn % ECONOMY_EVERY !== 0) return null;
    const towns = ownSettlements();
    const y = (c, t) => Number(safe(() => c.Yields.getNetYield(t), 0)) || 0;
    const Y = YieldTypes;
    const sum = (f) => Math.round(towns.reduce((s, c) => s + f(c), 0));
    const urban = (c) => Number(safe(() => c.urbanPopulation, 0)) || 0;
    const rural = (c) => Number(safe(() => c.ruralPopulation, 0)) || 0;
    const specs = (c) => Number(safe(() => c.Workers.getNumWorkers(false), 0)) || 0;
    const age = currentAge();
    const counts = growthCounts.age === age ? growthCounts : { tiles: 0, specialists: 0 };
    const b = biasFor(settings);
    const bias = `${biasKey(settings)} ${Object.entries(b).filter(([, v]) => Number(v) !== 1).map(([k, v]) => `${k}${v}`).join(",") || "x1"}`;
    const rivals = (safe(() => Players.getAlive(), []) ?? [])
        .filter((p) => p.isMajor && p.id !== pid())
        .map((p) => {
            const s = Number(safe(() => p.Stats.getNetYield(Y.YIELD_SCIENCE), NaN));
            const c = Number(safe(() => p.Stats.getNetYield(Y.YIELD_CULTURE), NaN));
            return Number.isFinite(s) ? `p${p.id} sci ${Math.round(s)} cul ${Number.isFinite(c) ? Math.round(c) : "?"}` : null;
        })
        .filter(Boolean);
    const cities = towns.map((c) => `${nameOf(c)}${c.isTown ? "(t)" : ""} ${Math.round(y(c, Y.YIELD_FOOD))}/${Math.round(y(c, Y.YIELD_PRODUCTION))}/${Math.round(y(c, Y.YIELD_SCIENCE))}/${Math.round(y(c, Y.YIELD_CULTURE))} u${urban(c)} r${rural(c)} s${specs(c)}`);
    const line = `economy: T${turn} ${age}: food ${sum((c) => y(c, Y.YIELD_FOOD))}, production ${sum((c) => y(c, Y.YIELD_PRODUCTION))}, science ${sum((c) => y(c, Y.YIELD_SCIENCE))}, culture ${sum((c) => y(c, Y.YIELD_CULTURE))}, gold ${sum((c) => y(c, Y.YIELD_GOLD))}, happiness ${sum((c) => y(c, Y.YIELD_HAPPINESS))}; urban ${sum(urban)}, rural ${sum(rural)}, specialists ${sum(specs)}; new citizens this age ${counts.tiles} on tiles, ${counts.specialists} specialists; balance ${bias}; rivals ${rivals.join(", ") || "unknown"}; F/P/S/C: ${cities.join("; ")}`;
    log.warn(line);
    return line;
}

// ---- towns -------------------------------------------------------------------------------

/** Growing towns at population 7+ that feed a city take the recommended Focus. */
export const FORT_TOWN = "PROJECT_TOWN_FORT";

/**
 * Exposed towns with the Fort Town Focus (towns cannot build; only a Fort Town may buy walls), as
 * fortifyThreatened's settlements: walls bought for them with the gold above the reserve.
 */
export function exposedFortTowns() {
    const hostile = hostileVillages();
    const fort = safe(() => GameInfo.Projects.lookup(FORT_TOWN)?.$hash, null);
    if (hostile.length === 0 || fort === null) return [];
    return ownSettlements()
        .filter((c) => c.isTown && safe(() => c.Growth.projectType, null) === fort && nearestVillage(c.location, hostile) <= EXPOSED_RADIUS)
        .map((c) => ({ settlement: { x: c.location.x, y: c.location.y, name: nameOf(c) }, count: 0, owners: [] }));
}

/**
 * A growing town at population 7 that feeds a city takes the recommended Focus; with «Оборона»
 * (`threats` given, else null) a threatened or exposed one takes Fort Town instead.
 */
const FARMING = new Set(["PROJECT_TOWN_GRANARY", "PROJECT_TOWN_FISHING"]);
const revisitNoted = new Set(); // "x,y|age": a farming town's revisit verdict said in UI.log

export function setTownFocus(settings, threats = null, { revisit = false } = {}) {
    const out = [];
    const towns = safe(() => runTownAdvisor(settings), null);
    const hostile = threats !== null ? hostileVillages() : []; // only with «Оборона»
    // Not for a lone raider 3-4 tiles away (an early warning, research/36 §3): a Focus lasts.
    const threatened = new Set((threats ?? []).filter((t) => !earlyWarning(t)).map((t) => `${t.settlement.x},${t.settlement.y}`));
    for (const row of towns?.rows ?? []) {
        const f = row.focus;
        // After the Growth phase (science), a farming town that could buy a building of the path with Urban Center
        // takes it (research/23 S7: game 8, both towns got Fishing in Growth and kept it all age).
        if (revisit && FARMING.has(f?.current)) {
            const urban = f.options?.find((o) => o.key === "URBAN");
            if (f.best?.key === "URBAN" && urban?.availableNow && urban.opens > 0 && applyTownFocus(row.town.id, urban.project).ok) {
                log.warn(`town focus: ${row.town.name} from ${f.current} to ${urban.project} (probe: does changing a Focus cost anything?)`);
                out.push({ key: "FOCUS_URBAN", town: row.town.id, args: [row.town.name, Locale.compose(GameInfo.Projects?.lookup?.(urban.project)?.Name ?? urban.project)] });
            } else {
                // Why it stays (research/24: S7 never fired in game 9, and nothing said why), once per town and age.
                const k = `${row.town.x},${row.town.y}|${currentAge()}`;
                if (!revisitNoted.has(k)) {
                    revisitNoted.add(k);
                    log.warn(`town focus: ${row.town.name} keeps ${f.current}: best ${f.best?.key ?? "-"}, Urban Center ${urban ? `${urban.availableNow ? "offered" : "not offered"}, opens ${urban.opens ?? 0}` : "not an option"}`);
                }
            }
            continue;
        }
        if (f?.current !== "GROWTH" || row.town.pop < FOCUS_POPULATION) continue;
        // Threatened, or near a village at war with us: Fort Town (a town may then buy walls;
        // fortified districts +25 HP, healing +5; research/17). Seen in game 5: towns never had walls,
        // and independents took 6 of them.
        if (threatened.has(`${row.town.x},${row.town.y}`) || nearestVillage(row.town, hostile) <= EXPOSED_RADIUS) {
            if (applyTownFocus(row.town.id, FORT_TOWN).ok) {
                out.push({ key: "FOCUS_FORT", town: row.town.id, args: [row.town.name, safe(() => Locale.compose(GameInfo.Projects.lookup(FORT_TOWN).Name), FORT_TOWN)] });
                continue;
            }
        }
        // In unrest or below 0 Happiness: the Focus that gives the most Happiness, if the game offers one
        // (Resort, Religious, Trade; research/22 A4: a town at −1 under a crisis card revolted).
        const town = safe(() => Cities.get(row.town.id), null);
        const unhappy = !!town && (safe(() => town.Happiness.hasUnrest, false) || (Number(safe(() => town.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0) < 0);
        const calm = unhappy ? [...(f?.options ?? [])].filter((o) => o.availableNow && (o.gain?.[HAPPINESS] ?? 0) > 0).sort((a, b) => b.gain[HAPPINESS] - a.gain[HAPPINESS])[0] : null;
        if (calm && applyTownFocus(row.town.id, calm.project).ok) {
            out.push({ key: "FOCUS_CALM", town: row.town.id, args: [row.town.name, Locale.compose(GameInfo.Projects?.lookup?.(calm.project)?.Name ?? calm.project)] });
            continue;
        }
        const b = f?.best;
        if (!b || b.current || !b.availableNow) continue;
        if (f.notes.some((n) => n.key === "LOC_XPL_FOCUS_NOT_CONNECTED")) continue; // its food would feed nobody
        const r = applyTownFocus(row.town.id, b.project);
        if (r.ok) out.push({ key: "FOCUS", town: row.town.id, args: [row.town.name, Locale.compose(GameInfo.Projects?.lookup?.(b.project)?.Name ?? b.project)] });
    }
    return out;
}

// During a crisis (crisis policy slots open) a town converted needs this much Happiness to spare:
// crisis cards take up to 6 Happiness from every city (seen in game 5).
const CRISIS_HAPPINESS_MARGIN = 6;

/**
 * May this town become a city without risking a revolt? Not while it is in unrest
 * (city.Happiness.hasUnrest) or unhappy, nor during a crisis with less than
 * CRISIS_HAPPINESS_MARGIN Happiness. Seen in game 5: a town converted while «Честолюбивые
 * губернаторы» (−6 Happiness in cities) was slotted went into unrest that turn, revolted 5 turns
 * later and joined Maurya.
 */
function calmEnough(cityId) {
    const city = safe(() => Cities.get(cityId), null);
    if (!city || safe(() => city.Happiness.hasUnrest, false)) return false;
    const happy = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0;
    if (happy < 0) return false;
    const crisis = (Number(safe(() => Players.get(pid()).Culture.getNumCultureSlots(CultureSlotTypes.CRISIS_CULTURE_SLOT), 0)) || 0) > 0;
    return !(crisis && happy < CRISIS_HAPPINESS_MARGIN);
}

const convertKey = (town) => `convert:${town.x},${town.y}`;

// Every city but the capital becomes a town again at an age change (probe P6, game 6: each player had
// exactly 1 city on a new age's first turn; a rival bought the same conversions twice): none bought
// in a non-final age's last turns, unless the player expects to keep cities (the legacy card, the
// Towns tab's «expect to keep cities»).
export const LATE_CONVERSION_TURNS = 10;
// Nor in the final age's last FINAL_CONVERSION_TURNS: a city that late builds little before the game ends (research/30
// §3: game 23 paid 2,500 at M48 for a city that then built 46 of an Ironworks, while three settlers would have started
// our military countdown).
export const FINAL_CONVERSION_TURNS = 25;

/** Towns that may become cities now (conversionRule, canConvert, calmEnough), best first (rankConversions). */
function conversionsFrom(rows, focus, { minCities = 0, cityTarget = 0, ctx = null, afterWin = false } = {}) {
    if (ctx && !ctx.isFinalAge && !ctx.expectKeepCities && Number(ctx.ageTurnsLeft) <= LATE_CONVERSION_TURNS) return [];
    if (ctx?.isFinalAge && Number(ctx.ageTurnsLeft) <= FINAL_CONVERSION_TURNS) return [];
    const stats = safe(() => Players.get(pid()).Stats, null);
    const healthy = citiesHealthy();
    const rule = conversionRule({ cities: Number(stats?.numCities) || 0, towns: Number(stats?.numTowns) || 0, minCities, cityTarget, healthy, finalAge: !!ctx?.isFinalAge && focus === "SCIENCE", afterWin });
    // A new age's first turn: last age's cities come back with the card the player takes (turn 2); paying for one now
    // also makes every other town dearer (game 33: Брэдфорд for 150 at M1, Манчестер the goal at E1; research/39 §2A).
    const returning = ctx?.expectKeepCities ? lastAgeCities() : null;
    const ok = rows
        .map((r) => ({ ...r, plannedCity: plannedRoleAt(r.town.x, r.town.y) === "CITY", floor: rule.floor }))
        .filter((r) => !returning?.has(`${r.town.x},${r.town.y}`))
        .filter((r) => r.town.canConvert && r.town.cost > 0 && r.advice?.verdict !== "BLOCKED"
            && (rule.verdicts === null || r.plannedCity || rule.verdicts.includes(r.advice?.verdict))
            && calmEnough(r.town.id));
    if (ok.length === 0 && rows.length > 0) noteNoConversion(rows, rule, healthy);
    return rankConversions(ok, focus);
}

let noConversionNoted = null; // the turn UI.log last said why no town may become a city

/**
 * UI.log once a turn when towns exist and none may become a city (research/39 §4.8: game 32's Antiquity had no conversion
 * A52-A60 with Leeds about 10 turns of income away, and the log did not say why): the floor, the cities below zero
 * Happiness, the towns not calm, the verdicts.
 */
function noteNoConversion(rows, rule, healthy) {
    if (noConversionNoted === Game.turn) return;
    noConversionNoted = Game.turn;
    const unhappy = ownSettlements().filter((c) => !c.isTown).map((c) => [nameOf(c), Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0]).filter(([, h]) => h < 0);
    const towns = rows.map((r) => `${r.town.name} ${r.advice?.verdict ?? "?"}${r.town.canConvert ? "" : " cannot"}${calmEnough(r.town.id) ? "" : " unrest"}`);
    log.info(`conversions: none of ${rows.length} town(s) (floor ${rule.floor}, healthy ${healthy}${unhappy.length ? `: ${unhappy.map(([n, h]) => `${n} ${h}`).join(", ")}` : ""}); ${towns.join(", ")}`);
}

/**
 * Towns that may become cities (decision 3, research/21 §9): cities and towns 1 to 1 is a floor,
 * not a cap. While towns outnumber cities any town may (never BLOCKED); beyond that only a town the
 * Towns tab rates CONVERT on its yields, or one founded on a planned CITY site. Never one in unrest
 * (calmEnough), none in a non-final age's last LATE_CONVERSION_TURNS turns (cities revert at an age
 * change) nor in the final age's last FINAL_CONVERSION_TURNS. Order (C1): a planned CITY site, the verdict, then for science and economy the most
 * production potential, else the cheapest. @returns the Towns tab's rows, best first
 */
export function conversionCandidates(settings, focus = null) {
    const towns = safe(() => runTownAdvisor(settings), null);
    return conversionsFrom(towns?.rows ?? [], focus, { minCities: Number(settings?.strategy?.minCities) || 0, cityTarget: Number(settings?.strategy?.cityTarget) || 0, ctx: towns?.ctx ?? null, afterWin: !!settings?.afterWin });
}

/** Is a crisis on (its policy slots: the age's last stage)? */
function crisisOn() {
    return (Number(safe(() => Players.get(pid()).Culture.getNumCultureSlots(CultureSlotTypes.CRISIS_CULTURE_SLOT), 0)) || 0) > 0;
}

/**
 * Does every city of ours stand at or above zero Happiness (the strategy's city target waits for it: research/34 §2)? A
 * crisis does not make it wait: its unhappiness ends with the age, and the revolt guard buys Happiness where a revolt
 * threatens (game 33: Бирмингем's 500 waited from A59 to the age's end in the plague crisis and cost 1,500 at E31).
 */
function citiesHealthy() {
    if (crisisOn()) return true;
    return ownSettlements().filter((c) => !c.isTown).every((c) => !(Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) < 0));
}

/**
 * The best town becomes a city (conversionCandidates) when the gold pays for it. Same command as
 * the game's "convert to city" (production-chooser-operations.js). `pass`: the pass's gold plan
 * (goldPlan): the conversion that is the savings goal uses the gold above the reserve, and no other
 * town is converted while the gold is saved for it; without a conversion goal, one the free gold
 * pays for. A number instead: the reserve turns (a plan of its own). @returns log entries
 */
export function convertTowns(settings, pass = 2, { focus = null } = {}) {
    const p = pass && typeof pass === "object" ? pass : goldPlan(settings, { focus, reserveTurns: pass, order: ["CONVERT"] });
    const b = p.budget;
    // War (research/23 D3, D5): none with a war at our door; with a war risk the gold for two defenders stays
    // (game 8: 925 gold on a conversion 3 turns before the war, with 3 land units).
    if (war.near) return [];
    const keep = conversionKeep();
    const goal = b.goal?.kind === "CONVERT" && !b.goal.done ? b.goal : null;
    const pick = goal
        ? (p.conversions ?? []).find((r) => convertKey(r.town) === goal.key && r.town.cost + keep <= b.forGoal())
        : (p.conversions ?? []).find((r) => r.town.cost + keep <= b.free());
    if (!pick) return [];
    const args = { Directive: OrderTypes.ORDER_TOWN_UPGRADE };
    if (!safe(() => Game.CityCommands.canStart(pick.town.id, CityCommandTypes.PURCHASE, args, false), null)?.Success) return [];
    Game.CityCommands.sendRequest(pick.town.id, CityCommandTypes.PURCHASE, args);
    b.spend(pick.town.cost, { kind: "CONVERT", key: convertKey(pick.town), label: pick.town.name }, { goal: !!goal });
    if (goal) noteGoal(goal.key);
    if (convertGoalKey === convertKey(pick.town)) convertGoalKey = null;
    return [{ key: "TOWN_CONVERTED", args: [pick.town.name, pick.town.cost] }];
}

// ---- a new age's first turn: the cheapest conversions (research/39 §4.1) ----------------------------------------------
// Every city but the capital is a town again on a new age's first turn, until the card that keeps them brings them back
// on turn 2 (root gotcha 31). Only the capital counts in a conversion's price then: ~425 gold at E1 instead of ~1,475,
// ~525 at M1 instead of 2,500 (research/39 §2A). The cities at an age's end are remembered (the settings' game memory:
// gotcha 57); on the next age's first turn the best towns that were not cities are converted from the gold above the
// reserve, one after another (the game prices each after the last), up to AGE_START_CITY_TARGET with the cities coming back.
export const AGE_START_CITY_TARGET = Object.freeze({ AGE_EXPLORATION: CITY_TARGETS.AGE_EXPLORATION[0], AGE_MODERN: CITY_TARGETS.AGE_EXPLORATION[1] });
const AGE_CITIES = "ageCities";
const CONVERT_WAIT_MS = 100;
const CONVERT_WAIT_TRIES = 15;

/** Remembers this age's cities for the next age's first turn ("AGE|x,y;x,y"). */
export function noteCitiesForNextAge() {
    const age = currentAge();
    if (!age) return;
    const cities = ownSettlements().filter((c) => !c.isTown).map((c) => `${c.location.x},${c.location.y}`).join(";");
    settings.remember(gameKey(), { [AGE_CITIES]: `${age}|${cities}` });
}

/** The last age's cities (tiles "x,y") while this is a new age and they have not come back yet; else null. */
export function lastAgeCities() {
    const raw = String(settings.recall(gameKey(), AGE_CITIES) ?? "");
    const bar = raw.indexOf("|");
    if (bar < 0) return null;
    const age = raw.slice(0, bar);
    if (!age || age === currentAge()) return null;
    const tiles = raw.slice(bar + 1).split(";").filter(Boolean);
    const cities = ownSettlements().filter((c) => !c.isTown).length;
    return cities < tiles.length ? new Set(tiles) : null;
}

/** Waits until the town has become a city (the game handles the purchase a moment later). @returns true when it has */
async function becameCity(id) {
    for (let i = 0; i < CONVERT_WAIT_TRIES; i++) {
        if (safe(() => Cities.get(id)?.isTown, true) === false) return true;
        await new Promise((r) => setTimeout(r, CONVERT_WAIT_MS));
    }
    return safe(() => Cities.get(id)?.isTown, true) === false;
}

/**
 * The conversions of a new age's first turn (above): science and economy, no war at our door. @returns log entries
 */
export async function convertAtAgeStart(budget, focus) {
    const out = [];
    if ((focus !== "SCIENCE" && focus !== "ECONOMIC") || war.near || !budget) return out;
    const last = lastAgeCities();
    if (!last) return out;
    const target = AGE_START_CITY_TARGET[currentAge()] ?? 0;
    const tried = new Set();
    let cities = last.size;
    while (cities < target) {
        const all = ownSettlements().filter((c) => c.isTown && !tried.has(sidOf(c)) && !last.has(`${c.location.x},${c.location.y}`))
            .map((c) => ({ c, town: { prodNow: Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0, cost: Number(safe(() => c.Gold.getTownUpgradeCost(), -1)) } }));
        const towns = all.filter((x) => x.town.cost > 0 && x.town.cost <= budget.forGoal() && calmEnough(x.c.id))
            .sort((a, b) => conversionValue(b.town) - conversionValue(a.town) || a.town.cost - b.town.cost);
        const pick = towns[0];
        if (!pick) {
            // The probe's other half (game 33: nothing at M1, the gold short of every price, which no line gave).
            if (out.length === 0 && all.length > 0) {
                const prices = all.filter((x) => x.town.cost > 0).sort((a, b) => a.town.cost - b.town.cost).slice(0, 4)
                    .map((x) => `${nameOf(x.c)} ${Math.round(x.town.cost)}${calmEnough(x.c.id) ? "" : " unrest"}`);
                log.info(`conversion window: none within ${Math.round(budget.forGoal())} gold above the reserve (${prices.join(", ") || "no price"}; research/39 probe)`);
            }
            break;
        }
        tried.add(sidOf(pick.c));
        const args = { Directive: OrderTypes.ORDER_TOWN_UPGRADE };
        if (!safe(() => Game.CityCommands.canStart(pick.c.id, CityCommandTypes.PURCHASE, args, false), null)?.Success) continue;
        Game.CityCommands.sendRequest(pick.c.id, CityCommandTypes.PURCHASE, args);
        budget.spend(pick.town.cost, { kind: "CONVERT", key: convertKey({ x: pick.c.location.x, y: pick.c.location.y }), label: nameOf(pick.c) });
        log.info(`conversion window: ${nameOf(pick.c)} for ${pick.town.cost} on the age's first turn (cities now ${ownSettlements().filter((c) => !c.isTown).length}, ${last.size} last age; research/39 probe)`);
        out.push({ key: "TOWN_CONVERTED_AGE_START", args: [nameOf(pick.c), Math.round(pick.town.cost)] });
        cities++;
        // The next is priced once the game counts this one.
        if (!(await becameCity(pick.c.id))) break;
    }
    return out;
}

// ---- a revolt guard (research/39 §4.4) ----------------------------------------------------------------------------------
// Game 32 lost Бирмингем (a city since A28) to a revolt at A61, in Antiquity's Revolts crisis: «If they remain Unhappy for N
// turns, they may Revolt. We should assign Happiness resources, station a Commander in the settlement, or invest in Happiness
// infrastructure here immediately» (ADVISOR_WARNING_CITY_REVOLT). A settlement below zero Happiness while a crisis is on (or
// in unrest) buys the cheapest Happiness building the game sells there, from all the gold (as walls against a real attack),
// once a turn per settlement; UI.log lists every such settlement once a turn.
const revoltNoted = new Map(); // sid -> the turn UI.log listed it

/** Settlements a revolt may take: below zero Happiness while a crisis is on, or in unrest. */
export function revoltRisks() {
    const crisis = (Number(safe(() => Players.get(pid()).Culture.getNumCultureSlots(CultureSlotTypes.CRISIS_CULTURE_SLOT), 0)) || 0) > 0;
    const out = [];
    for (const c of ownSettlements()) {
        const happy = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0;
        const unrest = !!safe(() => c.Happiness.hasUnrest, false);
        if (!unrest && !(crisis && happy < 0)) continue;
        out.push({ c, happy, unrest, turns: Number(safe(() => c.Happiness.turnsOfUnrest, -1)), crisis });
    }
    return out;
}

/** Buys a Happiness building in each settlement at risk of a revolt (above). @returns log entries */
export function guardRevolts(budget = null) {
    const out = [];
    const risks = revoltRisks();
    const crippled = crippledSettlements(risks);
    if (risks.length === 0 && crippled.length === 0) return out;
    const b = budget ?? createBudget({ gold: goldBalance() });
    const happy = GameInfo.TypeTags?.filter((t) => t.Tag === "HAPPINESS").map((t) => safe(() => GameInfo.Constructibles.lookup(t.Type), null)).filter((d) => d && d.ConstructibleClass === "BUILDING") ?? [];
    for (const r of risks) {
        const sid = sidOf(r.c);
        if (revoltNoted.get(sid) !== Game.turn) {
            revoltNoted.set(sid, Game.turn);
            log.warn(`happiness: ${nameOf(r.c)} ${r.happy}${r.unrest ? `, unrest ${r.turns} turn(s)` : ""}${r.crisis ? ", a crisis is on" : ""}: a revolt may take it`);
        }
        const best = cheapestHappiness(r.c, happy, b.all());
        if (!best.pick || !buyHappiness(r.c, best.pick, b, "REVOLT")) continue;
        out.push({ key: "REVOLT_GUARD", args: [nameOf(r.c), composeOr(best.pick.def.Name), Math.round(best.pick.cost)] });
    }
    // Crippled by unhappiness: ahead of the savings goal, from the gold above the reserve.
    for (const r of crippled) {
        const best = cheapestHappiness(r.c, happy, b.forGoal());
        const lost = Math.round(unhappinessShare(r.happy) * 100);
        if (best.pick && buyHappiness(r.c, best.pick, b, "HAPPINESS")) {
            out.push({ key: "HAPPINESS_RESCUE", args: [nameOf(r.c), lost, r.happy, composeOr(best.pick.def.Name), Math.round(best.pick.cost)] });
            continue;
        }
        const sid = sidOf(r.c);
        if (crippledNoted.get(sid) === Game.turn) continue;
        crippledNoted.set(sid, Game.turn);
        log.warn(`happiness: ${nameOf(r.c)} ${r.happy} (${lost}% of its yields lost): ${best.cheapest ? `${best.cheapest.def.ConstructibleType} costs ${Math.round(best.cheapest.cost)}, ${Math.round(b.forGoal())} above the reserve` : "no Happiness building to buy there"}`);
    }
    return out;
}

// A city crippled by unhappiness (the game takes 5% of its other yields a point below zero, at most 80%: gotcha 45) buys
// a Happiness building ahead of the savings goal. Game 35: Лидс stood at about −19 from M10 (six specialists at Modern's
// 6 Happiness each) and made 9 production and 14 science a turn instead of about 50 and 110; it built its City Park at 9 a
// turn for 36 turns, while 400-1,740 gold waited for a Launch Pad.
export const CRIPPLED_HAPPINESS = -10; // half of its yields lost
const crippledNoted = new Map(); // sid -> the turn UI.log said no Happiness building was bought there

/** Settlements at or below CRIPPLED_HAPPINESS that the revolt guard does not cover, and with no wonder in their queue. */
function crippledSettlements(risks) {
    const covered = new Set(risks.map((r) => sidOf(r.c)));
    const out = [];
    for (const c of ownSettlements()) {
        if (covered.has(sidOf(c))) continue;
        const happy = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0;
        if (happy > CRIPPLED_HAPPINESS || holdsWonder(c)) continue;
        out.push({ c, happy });
    }
    return out.sort((a, b) => a.happy - b.happy);
}

/** The cheapest Happiness building the game sells in this settlement: `pick` within `limit` gold, `cheapest` at any price. */
function cheapestHappiness(c, defs, limit) {
    let pick = null;
    let cheapest = null;
    for (const def of defs) {
        if (cityHas(c, def.ConstructibleType)) continue;
        const probe = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
        const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
        if (!(probe?.Success || probe?.InsufficientFunds) || plots.length === 0) continue;
        const cost = Number(probe.Cost ?? safe(() => c.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
        if (!Number.isFinite(cost) || cost <= 0) continue;
        if (!cheapest || cost < cheapest.cost) cheapest = { def, plots, cost };
        if (probe.Success && cost <= limit && (!pick || cost < pick.cost)) pick = { def, plots, cost };
    }
    return { pick, cheapest };
}

/** Buys this Happiness building in this settlement on the plan's tile (bestPlotFor) and spends it. @returns true when sent */
function buyHappiness(c, pick, b, kind) {
    const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(c, pick.def.$hash, pick.plots) ?? pick.plots[0]), null);
    if (!loc) return false;
    const args = { ConstructibleType: pick.def.$hash, X: loc.x, Y: loc.y };
    if (!safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.PURCHASE, args, false), null)?.Success) return false;
    Game.CityCommands.sendRequest(c.id, CityCommandTypes.PURCHASE, args);
    b.spend(pick.cost, { kind, key: `${sidOf(c)}|${pick.def.ConstructibleType}`, label: `${composeOr(pick.def.Name)} (${nameOf(c)})` });
    return true;
}

/**
 * Probe P3 (research/21 §2): what a town with the Urban Center Focus may buy. Once a turn, for each
 * such town, UI.log lists the game's purchase answer for every URBANCENTER-tagged building of this
 * age (GameInfo.TypeTags; constructibles-no-persist.xml: Library, Market, Monument…).
 */
let urbanLoggedTurn = -1;
export function logUrbanCenters() {
    if (urbanLoggedTurn === Game.turn) return;
    urbanLoggedTurn = Game.turn;
    const urban = safe(() => GameInfo.Projects.lookup("PROJECT_TOWN_URBAN_CENTER")?.$hash, null);
    if (urban === null) return;
    const tagged = (GameInfo.TypeTags?.filter((t) => t.Tag === "URBANCENTER") ?? [])
        .map((t) => safe(() => GameInfo.Constructibles.lookup(t.Type), null))
        .filter((d) => d && d.ConstructibleClass === "BUILDING");
    for (const town of ownSettlements()) {
        if (!town.isTown || safe(() => town.Growth.projectType, null) !== urban) continue;
        const answers = tagged.map((def) => {
            const r = safe(() => Game.CityCommands.canStart(town.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
            const tiles = (r?.Plots?.length ?? 0) + (r?.ExpandUrbanPlots?.length ?? 0);
            return `${def.ConstructibleType} ${r?.Success ? "yes" : r?.InsufficientFunds ? "gold" : "no"}/${tiles}${r?.FailureReasons?.length ? ` (${r.FailureReasons.join("; ")})` : ""}`;
        });
        log.warn(`urban center: ${nameOf(town)} may buy: ${answers.join(", ") || "no URBANCENTER building this age"}`);
    }
}

// ---- the gold plan ----------------------------------------------------------------------

let goalMemory = {};    // goal key -> { attempts, lastTurn, until } (core noteGoalBought)
let lastGoalKey = null; // SAVING is logged when the goal changes
let convertGoalKey = null; // the town a conversion goal is saving for (research/39 §4.2)

function noteGoal(key) {
    goalMemory = noteGoalBought(goalMemory, key, Game.turn);
}

/** Forgets the goals (tests: a fresh game). */
export function resetGoldPlan() {
    goalMemory = {};
    lastGoalKey = null;
    convertGoalKey = null;
    goldTrack = { turn: null, turns: [], level: 0 };
}

const GOLD_TRACK_TURNS = 8; // the gold income of this many last turns is kept (goldPressure's longest window)
let goldTrack = { turn: null, turns: [], level: 0 }; // the gold income turn by turn, and the pressure's level

/**
 * The gold pressure this pass (core/xpl-scarcity.js goldPressure): the gold income is noted once a turn (the first
 * pass), forgotten when the turn goes back (a new age, an earlier save). @returns { level, factor, changed, rose,
 * deficitTurns }
 */
export function goldPressureNow() {
    const turn = Number(safe(() => Game.turn, 0)) || 0;
    if (goldTrack.turn !== null && turn < goldTrack.turn) goldTrack = { turn: null, turns: [], level: 0 };
    let changed = false;
    let rose = false;
    if (goldTrack.turn !== turn) {
        goldTrack.turns = [...goldTrack.turns, goldIncome()].slice(-GOLD_TRACK_TURNS);
        goldTrack.turn = turn;
        const level = goldPressure(goldTrack.turns, goldBalance(), goldTrack.level).level;
        changed = level !== goldTrack.level;
        rose = level > goldTrack.level;
        goldTrack.level = level;
    }
    let deficitTurns = 0;
    for (let i = goldTrack.turns.length - 1; i >= 0 && goldTrack.turns[i] < 0; i--) deficitTurns++;
    return { level: goldTrack.level, factor: GOLD_PRESSURE.STEPS[goldTrack.level], changed, rose, deficitTurns };
}

const composeOr = (key, ...args) => safe(() => Locale.compose(key, ...args), key);

/**
 * The pass's gold plan (research/21 §4): one budget every purchase step spends from (the
 * treasury does not change during a pass: root CLAUDE.md gotcha 30), and the goal to save for
 * (B1), the first of `order` with a candidate: CONVERT, a town conversion (conversionCandidates);
 * LEVER (with the victory focus), the path's next building (victoryPurchases). While a goal waits,
 * other purchases use only the gold above the reserve and the goal's cost (budget.free()); a goal
 * the game keeps refusing is dropped for a while (noteGoalBought). Logs SAVING when the goal changes
 * and the gold does not cover it yet. @returns { budget, conversions, cheapest, focus, reserveTurns, entries, turn }
 */
export function goldPlan(settings, { focus = null, reserveTurns = 2, order = null, threats = [] } = {}) {
    const budget = createBudget({ gold: goldBalance(), reserve: goldReserve(reserveTurns) });
    // A war at our door: a defender's price stays for every threatened settlement short of melee guards, so the
    // plan and the victory path buy only what is left (research/24 W3: game 9's first war turn bought an
    // Observatory, a Sawpit and a Brickyard for 736 gold). Defenders and walls use all() anyway.
    if (war.near) {
        const short = (threats ?? []).filter((t) => guardsFor(t, undefined, threats, { within: guardDeadline(t) }) < guardsWanted(t)).length;
        if (short > 0) budget.reserve += short * defenderPrice();
    }
    const income = goldIncome();
    // Turns until the free gold covers `cost` at this income (Infinity: never).
    const goldTurns = (cost) => (cost <= budget.free() ? 0 : income > 0 ? (cost - budget.free()) / income : Infinity);
    const towns = safe(() => runTownAdvisor(settings), null);
    const rows = towns?.rows ?? [];
    const conversions = conversionsFrom(rows, focus, { minCities: Number(settings?.strategy?.minCities) || 0, cityTarget: Number(settings?.strategy?.cityTarget) || 0, ctx: towns?.ctx ?? null, afterWin: !!settings?.afterWin });
    const cheapest = rows.filter((r) => r.town.canConvert && r.town.cost > 0).sort((a, b) => a.town.cost - b.town.cost)[0] ?? null;
    const kinds = [...(order ?? settings?.strategy?.goals ?? ["CONVERT", ...(focus ? ["LEVER"] : [])])];
    const pads = Number(settings?.strategy?.pads) || 0;
    // Below half the settlement cap a settler is the first thing to save for (research/22 A1).
    const stats = safe(() => Players.get(pid()).Stats, null);
    const settling = !!(settings?.autopilot?.trainSettlers ?? settings?.autopilot?.settlers);
    if (settling && (Number(stats?.numSettlements) || 0) < (Number(stats?.settlementCap) || 0) / 2 && !kinds.includes("SETTLER")) kinds.unshift("SETTLER");
    // The military lever puts SETTLER first itself (core/xpl-strategy.js); without «Поселенцы» it is no goal.
    if (!settling) kinds.splice(0, kinds.length, ...kinds.filter((k) => k !== "SETTLER"));
    // Exploration's last turns with the science focus: the free gold is banked for Modern, first of all (research/38 §4 D1:
    // games 30 and 31 entered Modern with 1,155-1,277 gold against Launch Pads at 2,150-2,850 bought at Rocketry).
    const modernBank = focus === "SCIENCE" ? safe(() => bankForNextAge(budget, goldIncome()), null) : null;
    if (modernBank) kinds.unshift("BANK");
    // A war at our door: no savings goal, the gold stays free for defenders and upgrades (research/23 D5: game 8,
    // a conversion goal and then a University goal kept the free gold at 0 for the whole war).
    if (war.near) kinds.length = 0;
    const offer = kinds.includes("SETTLER") ? safe(() => settlerOffer(threats, { fill: !!settings?.strategy?.fillCap, past: pastCapOf(settings?.strategy) }), null) : null;
    const keep = kinds.includes("CONVERT") ? conversionKeep() : 0;
    // The town chosen stays the goal while it may still become a city (research/39 §4.2: game 32's goal went back and forth
    // between Liverpool and Leeds); below the floor a conversion is a goal at any horizon (no goal at all E1-E16).
    const stuck = convertGoalKey ? conversions.findIndex((r) => convertKey(r.town) === convertGoalKey) : -1;
    const ordered = stuck > 0 ? [conversions[stuck], ...conversions.filter((_, i) => i !== stuck)] : conversions;
    const candidates = {
        BANK: modernBank ? [modernBank] : [],
        SETTLER: offer ? [{ key: "settler", label: composeOr("LOC_XPL_AP_GOAL_SETTLER", nameOf(offer.city)), cost: offer.cost, purchase: { city: offer.city, args: offer.args, name: composeOr(offer.name), drop: offer.drop } }] : [],
        CODEX: focus === "SCIENCE" && kinds.includes("CODEX") ? safe(() => codexGoals(), []) ?? [] : [],
        GDP: kinds.includes("GDP") ? safe(() => gdpGoals(), []) ?? [] : [],
        AIRFIELD: focus === "SCIENCE" && kinds.includes("AIRFIELD") ? safe(() => siteGoals(pads), []) ?? [] : [],
        PADS: focus === "SCIENCE" && pads > 0 && kinds.includes("PADS") ? safe(() => padGoals(focus, pads, settings?.strategy?.gate ?? null), []) ?? [] : [],
        // The war risk's keep is part of the need (research/24 G1: «held 225/1500» while the gold over the cost went
        // elsewhere, so the conversion, which needs cost + keep, never came).
        CONVERT: ordered.map((r) => (keep > 0
            ? { key: convertKey(r.town), label: composeOr("LOC_XPL_AP_GOAL_CONVERT_KEEP", r.town.name, Math.round(keep)), cost: r.town.cost + keep, anyHorizon: !!r.floor }
            : { key: convertKey(r.town), label: composeOr("LOC_XPL_AP_GOAL_CONVERT", r.town.name), cost: r.town.cost, anyHorizon: !!r.floor })),
        LEVER: focus && kinds.includes("LEVER")
            ? (safe(() => victoryPurchases(focus), []) ?? [])
                // Its own city builds it sooner than the gold would come (S6: game 8, an Academy held 504 gold
                // 17 turns, then the city built it in 3).
                .filter((i) => !(queueTypes(i.city).includes(i.def.$hash) && buildTurns(i.city, i.def) <= goldTurns(i.cost)))
                .map((i) => ({ key: i.key, label: composeOr("LOC_XPL_AP_GOAL_LEVER", composeOr(i.def.Name), nameOf(i.city)), cost: i.cost }))
            : [],
    };
    const turnsLeft = Number(safe(() => ageOutlook().turnsLeft, Infinity));
    const goal = budget.setGoal(chooseGoal(candidates, kinds, { memory: goalMemory, turn: Game.turn, have: budget.free(), income, turnsLeft }));
    if (goal?.kind === "CONVERT") convertGoalKey = goal.key;
    else if (stuck < 0) convertGoalKey = null;
    const entries = [];
    if (goal && goal.key !== lastGoalKey && goal.cost > budget.forGoal()) {
        entries.push({ key: "SAVING", args: [goal.label, Math.round(goal.cost), Math.max(0, Math.round(budget.forGoal()))] });
    }
    lastGoalKey = goal?.key ?? null;
    return {
        budget, conversions: ordered, focus, entries, turn: Game.turn,
        reserveTurns: Number(reserveTurns) || 0,
        cheapest: cheapest ? { name: cheapest.town.name, cost: Math.round(cheapest.town.cost) } : null,
    };
}

// What an age change keeps of the treasury (the game's capGold, base-standard/scripts/age-transition-post-load.js): under
// Continuity (the default, AGE_TRANSITION_SETTING_KEEP_MORE) 6,000 entering Exploration and 9,000 entering Modern, else 3,000;
// scaled by the game speed (adjustForGameSpeed: the GameSpeeds CostMultiplier; Online 50: 4,500 logged entering Modern).
const CARRY_GOLD = Object.freeze({ AGE_EXPLORATION: 6000, AGE_MODERN: 9000 });
const CARRY_GOLD_REGROUP = 3000;

/** The gold the change into `nextAge` keeps (CARRY_GOLD). */
export function carriedGoldCap(nextAge) {
    const game = safe(() => Configuration.getGame(), null);
    const setting = safe(() => game.getValue("AgeTransitionSettingName"), null) ?? safe(() => Configuration.getGameValue("AgeTransitionSettingName"), null);
    const continuity = !setting || setting === "AGE_TRANSITION_SETTING_KEEP_MORE";
    const base = continuity ? CARRY_GOLD[nextAge] ?? CARRY_GOLD_REGROUP : CARRY_GOLD_REGROUP;
    const multiplier = Number(safe(() => GameInfo.GameSpeeds.lookup(game.gameSpeedType)?.CostMultiplier, 100)) || 100;
    return Math.round((base * multiplier) / 100);
}

/**
 * The bank for Modern (research/38 §4 D1): in Exploration's last AGE_END_TURNS, what the free gold can reach before the age
 * ends, at most what the age change keeps (carriedGoldCap). Held whole: only purchases from all the gold (defenders,
 * repairs, walls, buyAgeEndItems) go ahead of it. @returns a goal candidate or null
 */
function bankForNextAge(budget, income) {
    if (currentAge() !== "AGE_EXPLORATION") return null;
    const left = ageEndTurns();
    if (left === null || !(left > 0)) return null;
    const cap = carriedGoldCap("AGE_MODERN");
    const reach = Math.max(0, budget.forGoal()) + Math.max(0, Number(income) || 0) * Math.max(0, left - 1);
    const cost = Math.floor(Math.min(cap, reach));
    if (!(cost > 0)) return null;
    return { key: "MODERN_BANK", label: composeOr("LOC_XPL_AP_GOAL_BANK", cap), cost, hold: cost, holdShare: 1, anyHorizon: true, sized: true };
}

/**
 * Codices waiting in the archive with no slot for them (choices' slotGreatWorks found none; research/21
 * D6): the cheapest of this age's science buildings with codex slots (the path's levers: Library,
 * Academy, University…) a city lacking it may buy. Codices count for the science path only on display.
 * @returns goal candidates [{ key, label, cost, purchase }]
 */
function codexGoals() {
    const waiting = Number(safe(() => greatWorksWaiting(), 0)) || 0;
    if (waiting <= 0) return [];
    const out = [];
    const levers = leverBuildings("SCIENCE", currentAge()).map((t) => safe(() => GameInfo.Constructibles.lookup(t), null)).filter(Boolean);
    for (const city of ownSettlements().filter((c) => !c.isTown)) {
        // A codex building already queued may be bought too, unless it is the item in production with progress
        // (research/23 S8: game 8, the Academy sat queued A48-A65 while codices waited; 11 of 12 writings).
        const producing = frontSlot(city) ? safe(() => city.BuildQueue.currentProductionTypeHash, null) : null;
        if (holdsWonder(city)) continue; // no building bought where a wonder is queued (research/32 §6)
        for (const def of levers) {
            if (cityHas(city, def.ConstructibleType) || def.$hash === producing) continue;
            const probe = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
            const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
            if ((!probe?.Success && !probe?.InsufficientFunds) || plots.length === 0) continue;
            const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(city, def.$hash, plots) ?? plots[0]), null);
            if (!loc) continue;
            const cost = Number(probe.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
            if (!Number.isFinite(cost) || cost <= 0) continue;
            out.push({ key: `${sidOf(city)}|${def.ConstructibleType}`, label: composeOr("LOC_XPL_AP_GOAL_CODEX", composeOr(def.Name), nameOf(city), waiting), cost, purchase: { city, args: { ConstructibleType: def.$hash, X: loc.x, Y: loc.y }, name: composeOr(def.Name) } });
        }
    }
    return out.sort((a, b) => a.cost - b.cost);
}

/**
 * The science sites other than the Launch Pad (the Airfield) not built or queued as often as wanted, once their
 * projects can start (activeSites): bought in a city lacking one, the best producer first; a goal that may take
 * longer than GOAL_HORIZON while it fits the age (`anyHorizon`; research/24 P1). @returns goal candidates
 */
function siteGoals(pads) {
    const out = [];
    const finalAge = !!safe(() => ageOutlook().isFinalAge, false);
    const production = (c) => Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const cities = ownSettlements().filter((c) => !c.isTown).sort((a, b) => production(b) - production(a));
    for (const site of activeSites(pads)) {
        if (site.type === LAUNCH_PAD) continue;
        const def = safe(() => GameInfo.Constructibles.lookup(site.type), null);
        if (!def) continue;
        // Not in a city with a Launch Pad, where its flights never run (research/32 §3).
        const have = cities.filter((c) => !padIn(c) && (cityHas(c, site.type) || queueTypes(c).includes(def.$hash))).length;
        if (have >= site.cities) continue;
        for (const city of cities) {
            if (cityHas(city, site.type) || padIn(city) || holdsWonder(city)) continue;
            // The final age: only where its project is done before the game ends once it is bought (research/30 §3).
            if (finalAge && !siteFitsAge(city, def, site, { bought: true })) continue;
            // Only where it brings the goal sooner, as the purchase asks (research/38 §3.5: game 30 held 2,216-2,284 gold for
            // about 20 turns for an Airfield the purchase step kept refusing, then spent it on a Laboratory at M55).
            if (!siteHelps(cities, city, site.type, new Map(), { bought: true })) continue;
            const probe = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
            const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
            if ((!probe?.Success && !probe?.InsufficientFunds) || plots.length === 0) continue;
            const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(city, def.$hash, plots) ?? plots[0]), null);
            const cost = Number(probe.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
            if (!loc || !Number.isFinite(cost) || cost <= 0) continue;
            out.push({ key: `${sidOf(city)}|${def.ConstructibleType}`, label: composeOr("LOC_XPL_AP_GOAL_LEVER", composeOr(def.Name), nameOf(city)), cost, anyHorizon: true, purchase: { city, args: { ConstructibleType: def.$hash, X: loc.x, Y: loc.y }, name: composeOr(def.Name) } });
            break;
        }
    }
    return out;
}

/**
 * A rival near an economic win (the strategy's GDP goal): this age's gold buildings (TypeTag GOLD:
 * Market, Bank, Stock Exchange…, GDP every turn) in our cities, the cheapest the game sells now first.
 * @returns goal candidates [{ key, label, cost, purchase: { city, args } }]
 */
function gdpGoals() {
    const out = [];
    const gold = (GameInfo.TypeTags?.filter((t) => t.Tag === "GOLD") ?? []).map((t) => safe(() => GameInfo.Constructibles.lookup(t.Type), null)).filter((d) => d && d.ConstructibleClass === "BUILDING");
    for (const city of ownSettlements().filter((c) => !c.isTown)) {
        if (holdsWonder(city)) continue; // no building bought where a wonder is queued (research/32 §6)
        for (const def of gold) {
            if (cityHas(city, def.ConstructibleType)) continue;
            const probe = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$hash }, false), null);
            const plots = [...(probe?.Plots ?? []), ...(probe?.ExpandUrbanPlots ?? [])];
            if (!probe?.Success && !probe?.InsufficientFunds) continue;
            if (plots.length === 0) continue;
            const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(city, def.$hash, plots) ?? plots[0]), null);
            if (!loc) continue;
            const args = { ConstructibleType: def.$hash, X: loc.x, Y: loc.y };
            const cost = Number(probe.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), Infinity));
            if (!Number.isFinite(cost) || cost <= 0) continue;
            out.push({ key: `${sidOf(city)}|${def.ConstructibleType}`, label: composeOr("LOC_XPL_AP_GOAL_GDP", composeOr(def.Name), nameOf(city)), cost, purchase: { city, args, name: composeOr(def.Name) } });
        }
    }
    return out.sort((a, b) => a.cost - b.cost);
}

/**
 * Buys the savings goal itself when it is a purchase no other step makes (the GDP goal), from the
 * gold above the reserve. @returns log entries
 */
export function buyGoal(budget) {
    const g = budget?.goal;
    if (!g || g.done || !g.purchase || g.cost > budget.forGoal()) return [];
    const { city, args, name } = g.purchase;
    if (g.kind === "SETTLER") {
        if (!safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null)?.Success) return [];
        Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, args);
        dropQueued(g.purchase.drop);
        budget.spend(g.cost, { kind: g.kind, key: g.key, label: g.label }, { goal: true });
        noteGoal(g.key);
        return [{ key: "SETTLER_BOUGHT", args: [nameOf(city), Math.round(g.cost)] }];
    }
    // No building bought where a wonder is queued (research/32 §6).
    if (holdsWonder(city) || !safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null)?.Success) return [];
    Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, args);
    budget.spend(g.cost, { kind: g.kind, key: g.key, label: g.label }, { goal: true });
    noteGoal(g.key);
    return [{ key: "GOAL_BOUGHT", args: [name, nameOf(city), Math.round(g.cost)] }];
}

export const PAD_HOLD_SHARE = 0.75;

const cityProduction = (c) => Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;

/** A Launch Pad's gold price in this city (the game's, else its production cost × the age's gold per production). */
function padPrice(city, def) {
    const gold = Number(safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), 0)) || 0;
    if (gold > 0) return gold;
    const prod = Number(safe(() => city.Production.getConstructibleProductionCost(def.ConstructibleType), def.Cost ?? 0)) || 0;
    return Math.round(prod * (Number(safe(() => productionToGoldRatio(ownSettlements(), getRules()), 2)) || 2));
}

/**
 * The Launch Pad goal (research/21 L3, science in the final age): `pads` wanted, less those standing or
 * in production with progress. Before Rocketry (gate not open) the bank: the price of the missing pads in
 * the cheapest cities, held as research nears it (hold = bank × the gate's progress), so the Schoolhouses
 * and Laboratories that bring Rocketry sooner are bought first. After it: the next pad the game sells.
 * @returns goal candidates [{ key, label, cost, hold }]
 */
function padGoals(focus, pads, gate) {
    const def = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD), null);
    if (!def) return [];
    const cities = ownSettlements().filter((c) => !c.isTown);
    const producing = (c) => safe(() => c.BuildQueue.currentProductionTypeHash, null) === def.$hash && frontSlot(c) > 0;
    const standing = cities.filter((c) => cityHas(c, LAUNCH_PAD)).length;
    const have = standing + cities.filter((c) => !cityHas(c, LAUNCH_PAD) && producing(c)).length;
    if (gate?.open) {
        // After Rocketry a pad under way is a goal too: the game sells it at what it lacks (research/38 §3.3).
        if (pads - standing <= 0) return [];
        const item = (safe(() => victoryPurchases(focus, { pads, sitesFirst: true }), []) ?? []).find((i) => i.def.ConstructibleType === LAUNCH_PAD);
        return item ? [{ key: item.key, label: composeOr("LOC_XPL_AP_GOAL_PADS", pads - standing), cost: item.cost }] : [];
    }
    const missing = Math.max(0, pads - have);
    if (missing === 0) return [];
    // As many as the race still needs Preparation runs once research has brought its Innovation (research/38 §4 B1: game 30's
    // bank held one pad's price and bought one pad at Rocketry), at least one, at most the pads still missing; each priced in
    // the city that will buy it, the best producers first (victoryPurchases' order).
    const race = safe(() => spaceRace(cities), null);
    const research = (race?.cities.find((c) => c.id === RESEARCH_RACE)?.runs ?? []).reduce((a, r) => a + (Number(r.innovation) || 0), 0);
    const runs = race ? Math.ceil(Math.max(0, race.need - research) / (projectInnovation(PREP) || 15)) : missing;
    const buyers = cities.filter((c) => !cityHas(c, LAUNCH_PAD) && !producing(c)).sort((a, b) => cityProduction(b) - cityProduction(a)).slice(0, Math.min(missing, Math.max(1, runs)));
    const prices = buyers.map((c) => padPrice(c, def)).filter((p) => p > 0);
    const bank = prices.reduce((a, b) => a + b, 0);
    if (!(bank > 0)) return [];
    // Held as research nears Rocketry (the bank × the way's share), at most PAD_HOLD_SHARE of the gold above the reserve
    // (research/22 B3: game 7 held 6,832 against 1,395 for an age). Near it (PAD_GATE_NEAR), the whole bank and all the gold
    // above the reserve: game 30 bought a 1,072 Schoolhouse three turns before Rocketry and could buy one pad.
    const progress = Math.max(0, Math.min(1, Number(gate?.progress) || 0));
    const near = progress >= PAD_GATE_NEAR;
    // `sized`: the hold is a share of the gold there is, so the 12-turn horizon never drops it (research/39 §4.6: game 32's
    // Modern income of -19 to 160 kept the bank out of reach, and a 2,500 conversion goal held the gold instead).
    return [{ key: "PADS_BANK", label: composeOr("LOC_XPL_AP_GOAL_PADS", prices.length), cost: Math.round(bank), hold: Math.round(near ? bank : bank * progress), holdShare: near ? 1 : PAD_HOLD_SHARE, sized: true }];
}

/**
 * What the pass did with the gold: state.autopilot.gold (the Autopilot tab's gold line) and one
 * UI.log line: `gold: T45 balance 1240 income 50 reserve 100 (2t) goal CONVERT … 500 held 500;
 * spent 380 [REPAIR … 120, BOUGHT … 260]; cheapest conversion … 500`.
 */
export function logGold(pass) {
    const b = pass?.budget;
    if (!b) return;
    const g = b.goal;
    const income = goldIncome();
    const gold = {
        turn: pass.turn ?? Game.turn,
        balance: Math.round(b.gold), income: Math.round(income), reserve: Math.round(b.reserve), reserveTurns: pass.reserveTurns,
        goal: g ? { kind: g.kind, label: g.label, cost: Math.round(g.cost), held: g.done ? 0 : Math.round(g.hold), done: !!g.done } : null,
        spent: Math.round(b.spent),
        bought: b.entries.map((e) => ({ kind: e.kind, label: e.label ?? "", cost: e.cost })),
        cheapestConversion: pass.cheapest ?? null,
        // Gold's weight while the income stays below zero (goldPressureNow).
        pressure: GOLD_PRESSURE.STEPS[goldTrack.level],
    };
    state.set({ autopilot: { ...(state.get().autopilot ?? {}), gold } });
    const goalText = g ? `${g.kind} ${g.label} ${gold.goal.cost} held ${gold.goal.held}${g.done ? " (bought)" : ""}` : "none";
    const spentText = gold.bought.map((e) => `${e.kind} ${e.label} ${e.cost}`).join(", ");
    const pressure = goldTrack.level > 0 ? `; gold weighs ×${GOLD_PRESSURE.STEPS[goldTrack.level]} (income below zero)` : "";
    log.warn(`gold: T${gold.turn} balance ${gold.balance} income ${gold.income} reserve ${gold.reserve} (${gold.reserveTurns}t) goal ${goalText}; spent ${gold.spent} [${spentText}]; cheapest conversion ${gold.cheapestConversion ? `${gold.cheapestConversion.name} ${gold.cheapestConversion.cost}` : "-"}${pressure}`);
}

// ---- purchases -------------------------------------------------------------------------

/**
 * Buys the best-value planned buildings with the free gold (above `reserveTurns` turns of income and
 * what a savings goal holds); a town's (warehouses) only from its share of the free gold
 * (budget.townLeft, TOWN_SHARE; none while a goal waits: seen in game 6, town warehouses took every
 * spare gold while no town became a city); not what this pass bought already. `purchases`: the pass
 * budget (goldPlan), or an old-style `{ bought, spent }`.
 */
export function buyBuildings(settings, reserveTurns, purchases = { bought: new Set(), spent: 0 }) {
    const out = [];
    const plans = state.get().results.plans;
    if (!plans) return out;
    const b = budgetOf(purchases, reserveTurns);
    const share = Number(settings?.strategy?.townShare ?? TOWN_SHARE);
    const advice = purchaseAdvice(plans, settings, 12);
    for (const pick of advice.picks) {
        if (out.length >= MAX_PURCHASES) break;
        const key = `${pick.sid}|${pick.type}`;
        if (b.bought.has(key)) continue;
        if (pick.town && settings?.strategy?.planBuys === "CITIES") continue;
        if (settings?.strategy?.militaryBuildings === false && isMilitaryBuilding(pick.type)) continue;
        if (pick.cost > (pick.town ? b.townLeft(share) : b.free())) continue;
        // No building bought where a wonder is queued (research/32 §6).
        if (holdsWonder(ownSettlements().find((c) => sidOf(c) === pick.sid))) continue;
        if (buyPlanned(pick)) {
            b.spend(pick.cost, { kind: "BOUGHT", key, label: `${pick.name} (${pick.settlementName})` }, { town: !!pick.town });
            out.push({ key: "BOUGHT", args: [pick.name, pick.settlementName, Math.round(pick.cost)] });
        }
    }
    syncRecord(purchases, b);
    return out;
}

// ---- units and the turn ----------------------------------------------------------------

const READY_WAIT_MS = 100;     // the game takes a skip a moment later...
const READY_WAIT_TRIES = 5;    // ...so the ready list is asked again this many times before giving up
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Idle units skip this turn: every unit waiting for orders (also one the game stopped after part of a move), then
 * whatever the game still calls ready, each after the game took the skip before (game 12 T31: one ready unit was
 * skipped a pass, and a commander stopped on its way held the turn). `ordered`: keys ("owner:id") of units just
 * given an order; a skip would cancel it.
 */
export async function skipIdleUnits(ordered = new Set()) {
    let skipped = 0;
    const done = new Set(ordered);
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (skipped >= MAX_UNIT_SKIPS) break;
        const key = unitKey(u.id);
        if (done.has(key) || !readyForOrders(u)) continue;
        done.add(key);
        const ok = safe(() => Game.UnitOperations.canStart(u.id, "UNITOPERATION_SKIP_TURN", NO_TARGET, false), null);
        if (!ok?.Success) {
            log.info(`autopilot: cannot skip ${safe(() => GameInfo.Units.lookup(u.type).UnitType, u.type)} ${JSON.stringify(ok?.FailureReasons ?? [])}; allowed: ${allowedOperations(u).join(",")}`);
            continue;
        }
        Game.UnitOperations.sendRequest(u.id, "UNITOPERATION_SKIP_TURN", { ...NO_TARGET });
        skipped++;
    }
    let last = null;
    const first = () => safe(() => UI.Player.getFirstReadyUnit(), null);
    // Waiting for the game: a unit just skipped or ordered is still first in its ready list.
    const pending = (id) => !!id && ((!!last && JSON.stringify(id) === JSON.stringify(last)) || done.has(unitKey(id)));
    for (let i = 0; i < MAX_UNIT_SKIPS; i++) {
        let id = first();
        for (let w = 0; pending(id) && w < READY_WAIT_TRIES; w++) {
            await sleep(READY_WAIT_MS);
            id = first();
        }
        if (!id || pending(id)) break; // the game has not taken that order yet
        last = id;
        done.add(unitKey(id));
        const ok = safe(() => Game.UnitOperations.canStart(id, "UNITOPERATION_SKIP_TURN", NO_TARGET, false), null);
        if (!ok?.Success) {
            log.info(readyUnitReport(id));
            break;
        }
        Game.UnitOperations.sendRequest(id, "UNITOPERATION_SKIP_TURN", { ...NO_TARGET });
        skipped++;
    }
    return skipped > 0 ? [{ key: "UNITS_SKIPPED", args: [skipped] }] : [];
}

/** UI.log: the unit the game waits for (its first ready unit), what it is doing and what it may do. */
export function readyUnitReport(id = safe(() => UI.Player.getFirstReadyUnit(), null)) {
    const u = id ? safe(() => Units.get(id), null) : null;
    if (!u) return "autopilot: the game names no ready unit";
    const type = safe(() => GameInfo.Units.lookup(u.type).UnitType, u.type);
    const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
    return `autopilot: the game waits for ${type} at ${u.location?.x},${u.location?.y} (activity ${u.activityType}, moved ${u.hasMoved}, moves ${u.Movement?.movementMovesRemaining}, order to ${dest ? `${dest.x},${dest.y}` : "-"}); allowed: ${allowedOperations(u).join(",")}`;
}

export function endTurn() {
    if (safe(() => GameContext.hasSentTurnComplete(), true)) return [];
    try {
        GameContext.sendTurnComplete();
        return [{ key: "TURN_ENDED", args: [] }];
    } catch (error) {
        log.debug("end turn failed", error);
        return [];
    }
}

