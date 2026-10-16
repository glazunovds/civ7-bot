/**
 * Building layout planning against the live game: builds a PlanState for one
 * settlement (or a planned site), runs core/placement-solver.js through the
 * scheduler, and attaches the engine's own numbers where it has them.
 *
 * Engine use (read-only):
 *  - Game.CityOperations.canStart(BUILD) / Game.CityCommands.canStart(PURCHASE) per
 *    building -> Plots + ExpandUrbanPlots: which tiles the game allows now.
 *  - city.Yields.calculateAllBuildingsPlacements(): the game's exact yield change for
 *    every (building, tile) it can evaluate (called directly, never through the
 *    base UI's shared BuildingPlacementManager).
 */
import { PlanState, SPECIALIST_START_CAP, hashString, specialistCost } from '../core/xpl-placement-model.js';
import { solveLayout } from '../core/xpl-placement-solver.js';
import { biasFor, profileFor } from '../core/xpl-profiles.js';
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { getEngineMap } from './xpl-engine-map.js';
import { getRules, unlockedUniqueQuarters } from './xpl-rules-loader.js';
import { FactsCache } from './xpl-map-facts.js';
import { runJob } from '../services/xpl-scheduler.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { isCityCenterType, ourTackEntries, ourTackKeys, placeTacks, readAllTacks } from '../integrations/xpl-dmt-bridge.js';
import { tackKey } from '../integrations/xpl-tack-registry.js';
import { ageOutlook, productionToGoldRatio } from './xpl-town-job.js';
import { siteRoleAt } from './xpl-site-job.js';
import { cityEntry, noteCache } from './xpl-engine-cache.js';
import { upkeepIn } from './xpl-city-actions.js';
import { costValue } from '../core/xpl-scarcity.js';
import { runWonderPlanner } from './xpl-wonder-job.js';
import { tierValue } from '../core/xpl-wonder-tiers.js';

const JOB_NAME = "buildings";
const AREA_RADIUS = 3;
const REGION_LINK = 7;          // settlements whose centres are this close share border tiles
const REGION_MAX = 5;           // settlements planned together at most
const PLANNED_START = 12;       // turns until a planned site is founded (time-aware mode)
const PLANNED_PRODUCTION = 4;   // production of a freshly founded settlement
const LOCK_DELAY = 15;          // turns until a not-yet-unlocked building can start
const UQ_BONUS = 4;             // value of completing the civ's unique quarter (weighted yield units)
const TACK_ETA = 10;            // completion turn assumed for the player's own building tacks
const FINAL_AGE_HORIZON = 150;  // turns counted in the final age (cities never revert)
const NEXT_AGE_SHARE = 0.5;     // share of the next age counted for the adjacency ageless buildings keep (root gotcha 50)
const ANCHOR_VALUE = 10;        // a planned wonder's worth wherever it stands: the plan always gives it a tile (research/27 P1)
const MAX_ANCHORS = 2;          // wonders the plan reserves a tile for, besides our civilization's own
const ANCHOR_RACES = new Set(["HIGH", "MEDIUM"]);
const MAX_CALIBRATION_SHARE = 0.5; // above this share of disagreeing tiles, distrust the reading instead
const WAREHOUSE_GUESS = 2;         // settlement-wide value of a warehouse where the game cannot tell us (planned sites)
const DEFAULT_BUDGET_MS = 6;       // CPU per frame; the Buildings tab asks for more while the player waits
const FULL_AFTER_TURNS = 10;       // an incremental recalculation reuses a layout at most this old

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

function compose(key) {
    return safe(() => Locale.compose(key), key);
}

export const ALL_TARGET_KEY = "all";

/** "All my settlements": one plan for every settlement and planned site. */
export function allTarget(targets = listTargets()) {
    const first = targets[0];
    return { key: ALL_TARGET_KEY, kind: "all", name: compose("LOC_XPL_TARGET_ALL"), x: first?.x ?? 0, y: first?.y ?? 0, city: null, count: targets.length };
}

/** A target by key (including "all"), or null. */
export function resolveTarget(key) {
    const targets = listTargets();
    if (key === ALL_TARGET_KEY) return targets.length > 0 ? allTarget(targets) : null;
    return targets.find((t) => t.key === key) ?? null;
}

/** Settlements and planned sites the Buildings tab can plan for. */
export function listTargets() {
    const playerId = GameContext.localPlayerID;
    const player = Players.get(playerId);
    const targets = [];
    for (const city of safe(() => player.Cities.getCities(), [])) {
        const { x, y } = city.location;
        targets.push({ key: `c:${x}-${y}`, kind: city.isTown ? "town" : "city", name: compose(city.name), x, y, city });
    }
    if (isDmtActive()) {
        const roles = settleTackRoles();
        for (const { x, y, mapTackList } of readAllTacks()) {
            if (mapTackList.some((t) => isCityCenterType(t.type))) targets.push({ key: `p:${x}-${y}`, kind: "planned", name: "", x, y, city: null, role: roles.get(`${x}-${y}`) ?? null });
        }
    }
    return targets;
}

/** Roles remembered with our city-centre tacks: "x-y" -> "CITY" | "TOWN". */
function settleTackRoles() {
    const out = new Map();
    for (const e of ourTackEntries("settle")) if (e.role) out.set(`${e.x}-${e.y}`, e.role);
    return out;
}

/**
 * Will this settlement be a city or stay a town? Towns can only buy the Altar and the
 * warehouses (Buildings.Town in the game data), so a town gets a town-sized plan.
 *  - cities: city; existing towns: town;
 *  - planned sites: the role chosen when the tack was placed, else the current site
 *    search's pick there, else that site scored on the spot.
 * "Plan towns as future cities" turns every town into a city plan.
 */
export function settlementRole(target, settings) {
    if (target.kind === "city") return "CITY";
    if (settings.buildings?.townsAsCities) return "CITY";
    if (target.kind === "town") return "TOWN";
    if (target.role) return target.role;
    const pick = state.get().results.sites?.picks?.find((p) => p.x === target.x && p.y === target.y);
    if (pick?.role) return pick.role;
    return siteRoleAt(target.x, target.y, settings);
}

/** What the game says about each building in a city (answers kept in this turn's cache entry). */
function engineValidity(city, isTown, types, entry = { validity: new Map() }) {
    const sets = new Map();
    const buildable = new Set();
    const existing = new Set();
    for (const type of types) {
        let a = entry.validity.get(type);
        if (a === undefined) {
            const def = GameInfo.Constructibles.lookup(type);
            const r = def ? safe(() => (isTown
                ? Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$index }, false)
                : Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$index }, false)), null) : null;
            const plots = r ? [...(r.Plots ?? []), ...(r.ExpandUrbanPlots ?? [])] : [];
            a = r ? { exists: !!r.AlreadyExists, buildable: !!(r.Success || r.InsufficientFunds || r.InQueue || r.InProgress), plots: plots.length > 0 ? new Set(plots) : null } : null;
            entry.validity.set(type, a);
        }
        if (!a) continue;
        if (a.exists) existing.add(type);
        if (a.buildable) buildable.add(type);
        if (a.plots) sets.set(type, a.plots);
    }
    return {
        buildable,
        existing,
        valid: (type, idx) => (sets.has(type) ? sets.get(type).has(idx) : undefined),
    };
}

/** Map "hash:plot" -> { yields: number[7], adjacencyIn: number[7] } from the engine (cached for the turn). */
function enginePlacements(city, entry = { placements: null }) {
    if (!entry.placements) entry.placements = readEnginePlacements(city);
    return entry.placements;
}

function readEnginePlacements(city) {
    const out = new Map();
    const data = safe(() => city.Yields.calculateAllBuildingsPlacements(), null);
    if (!data?.buildings) return out;
    const yieldOrder = [];
    for (const row of GameInfo.Yields) yieldOrder[row.$index] = yieldIndex(row.YieldType);
    const adjacencySource = globalThis.YieldSourceTypes?.ADJACENCY;
    for (const b of data.buildings) {
        for (const p of b.placements ?? []) {
            const yields = [0, 0, 0, 0, 0, 0, 0];
            (p.yieldChanges ?? []).forEach((v, i) => {
                const j = yieldOrder[i];
                if (j >= 0) yields[j] += Number(v) || 0;
            });
            const adjacencyIn = [0, 0, 0, 0, 0, 0, 0];
            for (const d of p.changeDetails ?? []) {
                if (d.sourceType !== adjacencySource || d.targetPlotIndex !== p.plotID) continue;
                const j = yieldIndex(GameInfo.Yields.lookup(d.yieldType)?.YieldType);
                if (j >= 0) adjacencyIn[j] += Number(d.change) || 0;
            }
            out.set(`${b.constructibleType}:${p.plotID}`, { yields, adjacencyIn });
        }
    }
    return out;
}

/**
 * The player's own building/wonder tacks in the area become fixed planned items. So do
 * our own building tacks for buildings already in that city's build queue (it was
 * probably queued on that tack: the plan must not move it).
 * @returns { count, kept: Set<"x-y-type"> }  kept = our tacks that must stay where they are
 */
function applyUserTacks(planState, queuedBySid = new Map()) {
    const kept = new Set();
    if (!isDmtActive()) return { count: 0, kept };
    const ours = ourTackKeys("build"); // our wonder tacks count like the player's own
    let n = 0;
    for (const { x, y, mapTackList } of readAllTacks()) {
        const idx = GameplayMap.getIndexFromXY(x, y);
        const tile = planState.tiles.get(idx);
        if (!tile) continue;
        for (const tack of mapTackList) {
            const key = tackKey(x, y, tack.type);
            if (ours.has(key)) {
                if (!queuedBySid.get(tile.sid)?.has(tack.type)) continue;
                kept.add(key);
            }
            const cls = planState.book.classOf(tack.type) ?? GameInfo.Constructibles.lookup(tack.type)?.ConstructibleClass;
            if (cls === "IMPROVEMENT") {
                // The player plans to keep this tile rural (a farm, a mine...).
                if (tile.district !== "DISTRICT_URBAN" && tile.district !== "DISTRICT_CITY_CENTER") tile.reserved = true;
                n++;
            } else if (cls === "WONDER") {
                tile.district = "DISTRICT_WONDER";
                tile.origDistrict = "DISTRICT_WONDER";
                tile.districtTime = planState.tackEta * 2; // wonders take longer
                n++;
            } else if (cls === "BUILDING" && !isCityCenterType(tack.type)) {
                tile.items.push({ type: tack.type, obsolete: false, planned: false, fixed: true, tacked: true, t: planState.tackEta });
                if (tile.district !== "DISTRICT_CITY_CENTER") {
                    tile.district = "DISTRICT_URBAN";
                    tile.origDistrict = "DISTRICT_URBAN";
                    tile.districtTime = planState.tackEta;
                }
                planState.settlements.get(tile.sid).planned.set(tack.type, idx);
                n++;
            }
        }
    }
    return { count: n, kept };
}

/**
 * Wonders the plan reserves a tile for (research/27 P1: the video's "plan the wonder spots first, then the quarters
 * around them"): every building group gets +1 next to a wonder. Simulated on random cities, a wonder planned with
 * the buildings left the plan 3.6% better than placing it afterwards on its best tile (tools: sim_anchor).
 * - The wonders the autopilot would start: a race we can win (HIGH or MEDIUM), done 2 turns before the age ends, by
 *   value per turn (yields, tier, the tile's boost), at most MAX_ANCHORS, each in its fastest member city on the
 *   tiles the game allows there.
 * - Our civilization's own wonder (CivilizationFavoredWonders: our civic unlocks it early) first; while it is still
 *   locked, in our best producing city on the tiles its rules allow (biome, terrain, river, an urban neighbour).
 * @returns [{ type, sid, plots: Set<plot> | null, turns }]
 */
function wonderAnchors(settings, rules, members, roleBySid) {
    const cityMembers = members.filter((m) => m.city && !m.city.isTown && roleBySid.get(m.key) === "CITY");
    if (cityMembers.length === 0) return [];
    // This turn's answer when there is one (the game's queries are not repeated within a turn).
    const last = state.get().results.wonders;
    const w = last?.computedTurn === Game.turn && last.omniscient === !!settings.wonders?.omniscient ? last : runWonderPlanner(settings);
    if (!w?.rows) return [];
    const keys = new Set(cityMembers.map((m) => m.key));
    const favored = safe(() => GameInfo.CivilizationFavoredWonders?.find((r) => r.CivilizationType === rules.civ)?.FavoredWonderType, null);
    const scored = [];
    for (const r of w.rows) {
        if (r.status !== "AVAILABLE" || !ANCHOR_RACES.has(r.race?.label)) continue;
        const o = r.options.find((x) => keys.has(x.cityKey) && x.plots.length > 0);
        if (!o || !(o.turns > 0) || (w.ageTurnsLeft != null && o.turns > w.ageTurnsLeft - 2)) continue;
        const factor = r.race.label === "HIGH" ? 1 : 0.6;
        const score = ((r.baseValue + tierValue(r.type) + (o.plots[0]?.value ?? 0)) * factor) / o.turns;
        scored.push({ type: r.type, sid: o.cityKey, plots: new Set(o.plots.map((p) => p.idx)), turns: o.turns, score, favored: r.type === favored });
    }
    scored.sort((a, b) => Number(b.favored) - Number(a.favored) || b.score - a.score);
    const out = scored.slice(0, MAX_ANCHORS + (scored[0]?.favored ? 1 : 0)).map(({ type, sid, plots, turns }) => ({ type, sid, plots, turns }));
    const row = favored ? w.rows.find((r) => r.type === favored) : null;
    if (row?.status === "LOCKED") {
        const prod = (m) => Number(safe(() => m.city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
        const best = [...cityMembers].sort((a, b) => prod(b) - prod(a))[0];
        const cost = Number(safe(() => best.city.Production.getConstructibleProductionCost(favored), 0)) || rules.costOf(favored);
        out.push({ type: favored, sid: best.key, plots: null, turns: LOCK_DELAY + Math.ceil(cost / Math.max(1, prod(best))) });
    }
    return out;
}

/** Building types in each member city's build queue: sid -> Set<type>. */
function queuedTypes(members) {
    const out = new Map();
    for (const m of members) {
        if (!m.city) continue;
        const types = new Set();
        for (const item of safe(() => m.city.BuildQueue.getQueue(), []) ?? []) {
            const type = GameInfo.Constructibles.lookup(item.constructibleType)?.ConstructibleType;
            if (type) types.add(type);
        }
        out.set(m.key, types);
    }
    return out;
}

/** Registry filter: our tacks within the radius-3 area of any of the plan's settlements. */
export function nearCentres(centres) {
    const m = getEngineMap();
    return (e) => centres.some((c) => m.map.distance(m.index(e.x, e.y), c) <= AREA_RADIUS);
}

/** The player's own tacks in the plan's area (not ours), to notice when they change. */
export function userTackSignature(centres) {
    if (!isDmtActive()) return "";
    const near = nearCentres(centres);
    const ours = ourTackKeys("build");
    const keys = [];
    for (const { x, y, mapTackList } of readAllTacks()) {
        if (!near({ x, y })) continue;
        for (const t of mapTackList) {
            const key = tackKey(x, y, t.type);
            if (!ours.has(key)) keys.push(key);
        }
    }
    return keys.sort().join("|");
}

/** True if we placed building tacks in this plan's area earlier (auto-refresh only renews those). */
export function hasPlanTacks(plans) {
    const near = nearCentres(plans.centres);
    return ourTackEntries("build").some(near);
}

/**
 * Places the plan's building tacks, replacing our earlier ones in the area (but never
 * tacks of buildings already queued, nor any tack the player placed).
 * perSettlement: only each settlement's next N planned buildings (plan order), no fillers —
 * the autopilot's "clearer picture"; every tack costs Detailed Map Tacks work at each update.
 */
export async function placePlanTacks(plans, { replacePrevious = true, onProgress = null, perSettlement = 0 } = {}) {
    let chosen = [...plans.placements, ...plans.fillers];
    if (perSettlement > 0) {
        const count = new Map();
        chosen = plans.placements.filter((p) => {
            const n = count.get(p.sid) ?? 0;
            count.set(p.sid, n + 1);
            return n < perSettlement;
        });
    }
    const entries = [...chosen, ...(plans.anchors ?? [])].map((p) => ({ x: p.x, y: p.y, type: p.type }));
    const near = nearCentres(plans.centres);
    const kept = new Set(plans.keptTacks ?? []);
    return placeTacks(entries, "build", { replacePrevious, onProgress, replaceFilter: (e) => near(e) && !kept.has(tackKey(e.x, e.y, e.type)) });
}

/**
 * The game's best tile right now for this building in its settlement (the number the
 * production menu shows), when it beats the planned tile; with what the plan put there.
 */
function bestNowFor(p, forType, engineHere, planState, plannedAt, describe, nameOf) {
    const sum = (ys) => ys.reduce((a, b) => a + b, 0);
    let best = null;
    for (const { plot, total, yields } of forType) {
        if (planState.tiles.get(plot)?.sid !== p.sid) continue;
        if (!best || total > best.total) best = { idx: plot, total, yields };
    }
    if (!best || best.idx === p.idx) return null;
    const hereTotal = engineHere ? sum(engineHere.yields) : null;
    if (hereTotal !== null && best.total < hereTotal + 0.5) return null;
    const takenBy = (plannedAt.get(best.idx) ?? []).filter((t) => t !== p.type).map(nameOf);
    return { ...describe(best.idx, p.sid), yields: best.yields.slice(), here: engineHere?.yields?.slice() ?? null, takenBy };
}

/**
 * Fingerprint of what the game told us about one city: the tiles allowed and its adjacency per building and tile.
 * Not the settlement's yield totals there: they move with every citizen and modifier, and marked most cities changed
 * on every recalculation (game 20: 584 settlements re-solved in 166 incremental plans).
 */
function engineFingerprint(entry, types) {
    const parts = [];
    for (const type of types) {
        const a = entry.validity.get(type);
        parts.push(a ? `${type}:${a.exists ? 1 : 0}${a.buildable ? 1 : 0}:${a.plots ? [...a.plots].sort((x, y) => x - y).join(",") : ""}` : `${type}:-`);
    }
    for (const [key, e] of entry.placements ?? []) parts.push(`${key}=${e.adjacencyIn.join(",")}`);
    return hashString(parts.join("|"));
}

/** The engine's placements per building hash: hash -> [{ plot, total, yields }]. */
function indexByHash(engineData) {
    const out = new Map();
    for (const [key, e] of engineData) {
        const [h, plot] = key.split(":").map(Number);
        if (!out.has(h)) out.set(h, []);
        out.get(h).push({ plot, total: e.yields.reduce((a, b) => a + b, 0), yields: e.yields });
    }
    return out;
}

/** Settlements within REGION_LINK of each other, starting from the chosen one (capped). */
function regionAround(target, all, engineMap) {
    const members = [target];
    const seen = new Set([target.key]);
    for (let i = 0; i < members.length && members.length < REGION_MAX; i++) {
        const from = engineMap.index(members[i].x, members[i].y);
        const near = all
            .filter((t) => !seen.has(t.key))
            .map((t) => ({ t, d: engineMap.map.distance(from, engineMap.index(t.x, t.y)) }))
            .filter((x) => x.d <= REGION_LINK)
            .sort((a, b) => a.d - b.d);
        for (const { t } of near) {
            if (members.length >= REGION_MAX) break;
            seen.add(t.key);
            members.push(t);
        }
    }
    return members;
}

/** Settings and inputs that change what a plan is (not UI-only ones): a change means a full recalculation. */
function inputSignature(target, settings, selected, lockedSet, rules) {
    const { optionsOpen: _o, lastTarget: _l, autoTacks: _a, incremental: _i, growthHints: _g, ...bs } = settings.buildings ?? {};
    return JSON.stringify({
        target: target.key,
        profile: settings.profile,
        bias: biasFor(settings),
        hidden: !!settings.includeHidden,
        bs,
        rules: `${rules.age}|${rules.civ}|${rules.uniqueQuarters.map((q) => q.type).join(",")}`,
        selected: [...selected].sort(),
        // Locked buildings are planned anyway (later); an unlock changes the game's answers of every city instead.
        locked: bs.includeLocked === false ? [...lockedSet].sort() : [],
    });
}

/**
 * Fingerprint of one settlement's own inputs beyond its tiles and the game's answers: its role, its specialist
 * limit, the wonders it keeps a tile for. A settlement whose fingerprint changed (or a new one) is solved again;
 * a founding or a town turned city no longer re-plans every settlement.
 */
function memberSignature(settlement, role, anchors) {
    const kept = anchors.filter((a) => a.sid === settlement.id).map((a) => `${a.type}:${a.plots ? [...a.plots].sort((x, y) => x - y).join(".") : "rules"}`);
    return `${role}/${settlement.specialists?.slots ?? 0}/${kept.join(",")}`;
}

/** Why a plan is a full one: the inputs that changed, or none (for the log). */
function inputsChanged(before, now) {
    try {
        const a = JSON.parse(before);
        const b = JSON.parse(now);
        return Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    } catch (_e) {
        return ["all"];
    }
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Plans buildings for a target (a settlement, a planned site, or "all").
 * @param options { budgetMs: number | () => number }  CPU time per frame (default 6 ms)
 * Recalculating the same target with the same settings re-solves only the settlements
 * whose tiles, buildings, tacks or queue changed (setting buildings.incremental, on by
 * default); the others keep their previous layout. Full recalculation after
 * FULL_AFTER_TURNS turns, or when anything else changed.
 */
export function startBuildingPlan(target, settings, options = {}) {
    const playerId = GameContext.localPlayerID;
    const engineMap = getEngineMap();
    const rules = getRules();
    const bs = settings.buildings ?? {};
    const profile = profileFor(settings);
    const allTargets = listTargets();
    const members = target.kind === "all" ? allTargets : bs.region ? regionAround(target, allTargets, engineMap) : [target];
    if (members.length === 0) return { promise: Promise.resolve({ cancelled: true }) };
    const previous = state.get().results.plans;
    const timing = { engine: 0, setup: 0, post: 0, queried: 0, cached: 0 };
    let ctx = null; // filled by the job's setup phase
    let fullWhy = null; // why a plan was a full one (the timing log)

    function* setup() {
        let t0 = now();
        // Planned sites are often still unexplored; they follow the Settlements tab's
        // "include unexplored tiles" choice. Existing settlements only use known tiles.
        const includeHidden = members.some((m) => !m.city) && !!settings.includeHidden;
        const facts = new FactsCache(engineMap, rules, { playerId, includeHidden });

        // Ownership: each member's purchased plots; plots of our other settlements are off limits.
        const memberKeys = new Set(members.map((m) => m.key));
        const ownedBy = new Map();
        const otherOwned = new Set();
        for (const t of allTargets) {
            const plots = t.city ? safe(() => t.city.getPurchasedPlots(), []) : [];
            if (memberKeys.has(t.key)) {
                const set = new Set(plots);
                set.add(engineMap.index(t.x, t.y));
                ownedBy.set(t.key, set);
            } else {
                for (const p of plots) otherOwned.add(p);
            }
        }
        const allOwnedByMembers = new Set();
        for (const set of ownedBy.values()) for (const p of set) allOwnedByMembers.add(p);
        const areaSet = new Set();
        for (const m of members) {
            for (const { idx } of engineMap.map.radius(engineMap.index(m.x, m.y), AREA_RADIUS)) {
                if (areaSet.has(idx) || otherOwned.has(idx)) continue;
                const f = facts.structures(idx);
                if (!f || !f.known) continue;
                if (!allOwnedByMembers.has(idx) && f.owner !== -1) continue;
                areaSet.add(idx);
            }
            if (!m.city) {
                // Planned site: the centre will be a city centre with a City Hall.
                const c = facts.facts(engineMap.index(m.x, m.y));
                if (c) {
                    c.district = "DISTRICT_CITY_CENTER";
                    c.constructibles = [{ type: "BUILDING_CITY_HALL", cls: "BUILDING", obsolete: false }];
                    c.structuresLoaded = true;
                }
            }
        }

        // What to plan: selected common buildings + the player's uniques (+ warehouses as filler).
        const commonTypes = rules.buildings.map((b) => b.type);
        const uniqueTypes = rules.uniques.map((b) => b.type);
        const warehouseTypes = new Set(rules.warehouses.map((w) => w.type));
        const known = new Set([...commonTypes, ...uniqueTypes, ...warehouseTypes]);
        // Everything is planned unless unticked (an explicit `selected` list still wins, for tests and callers).
        const excluded = new Set(bs.excluded ?? []);
        const selected = (bs.selected ?? [...commonTypes, ...uniqueTypes, ...warehouseTypes].filter((t) => !excluded.has(t))).filter((t) => known.has(t));
        timing.setup += now() - t0;

        // Engine knowledge per member city: valid tiles, buildability, exact placement yields.
        // One city per frame (these queries are the slowest part in the game), reused within a turn.
        const validity = new Map();
        const engineData = new Map();
        const engineSigs = new Map();
        if (bs.useEngine !== false) {
            const cityMembers = members.filter((m) => m.city);
            for (let i = 0; i < cityMembers.length; i++) {
                const m = cityMembers[i];
                const t1 = now();
                const entry = cityEntry(m.key, m.city, m.kind === "town");
                const cached = entry.placements !== null;
                validity.set(m.key, engineValidity(m.city, m.kind === "town", selected, entry));
                for (const [k, v] of enginePlacements(m.city, entry)) engineData.set(k, v);
                engineSigs.set(m.key, engineFingerprint(entry, selected));
                timing[cached ? "cached" : "queried"]++;
                noteCache(cached);
                timing.engine += now() - t1;
                yield 0.1 * ((i + 1) / cityMembers.length);
            }
        }
        t0 = now();
        const cityValidity = [...validity.values()];
        const isBuildable = (type) => cityValidity.length === 0 || cityValidity.some((v) => v.buildable.has(type) || v.existing.has(type));
        const lockedSet = new Set(selected.filter((t) => !isBuildable(t)));
        const includeLocked = bs.includeLocked !== false;

        // Timing: turns left in the age, production per settlement, building costs.
        const timeAware = bs.timeAware !== false;
        const outlook = safe(() => ageOutlook(), null);
        let horizon;
        if (timeAware) horizon = outlook ? (outlook.isFinalAge ? FINAL_AGE_HORIZON : outlook.turnsLeft) : undefined;
        const cities = safe(() => Players.get(playerId).Cities.getCities(), []);
        const prodToGold = safe(() => productionToGoldRatio(cities, rules), 2.5) || 2.5;
        const capital = cities.find((c) => !c.isTown) ?? null;
        const costScale = (() => {
            const sample = rules.buildings[0]?.type;
            const engineCost = sample && capital ? Number(safe(() => capital.Production.getConstructibleProductionCost(sample), 0)) : 0;
            return engineCost > 0 ? engineCost / rules.costOf(sample) : 1;
        })();
        // Specialists (root CLAUDE.md gotcha 49): the setting is the share of each city's specialist limit
        // (the game's getCityWorkerCap; the capital's for a planned site) counted on tiles whose adjacency pays
        // for a specialist's upkeep. Towns have none.
        const fill = Number(bs.specialists) || 0;
        const capOf = (city) => Number(safe(() => city?.Workers.getCityWorkerCap(), 0)) || 0;
        const defaultCap = capOf(capital) || SPECIALIST_START_CAP[rules.age] || 1;
        const perSpecialist = specialistCost(profile.y, rules.age);

        const roleBySid = new Map(members.map((m) => [m.key, settlementRole(m, settings)]));
        const anchors = safe(() => wonderAnchors(settings, rules, members, roleBySid), []);
        const anchorsOf = (sid) => anchors.filter((a) => a.sid === sid);
        const settlements = members.map((m) => {
            const centre = engineMap.index(m.x, m.y);
            const v = validity.get(m.key);
            let production = PLANNED_PRODUCTION;
            if (m.city) {
                const prod = Number(safe(() => m.city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
                // Towns buy buildings with gold: production turns into gold 1:1, and buying costs prodToGold gold per production.
                production = Math.max(1, m.kind === "town" ? prod / prodToGold : prod);
            }
            const slots = m.kind === "town" ? 0 : fill * (capOf(m.city) || defaultCap);
            return {
                id: m.key,
                centre,
                owned: ownedBy.get(m.key),
                adjMult: 1 + slots, // shown with each building; the plan values specialists per tile
                specialists: slots > 0 ? { slots, cost: perSpecialist } : null,
                // Wonder anchors: the tiles the game allows for each (null: the wonder's own rules), and when it is done.
                wonderPlots: new Map(anchorsOf(m.key).filter((a) => a.plots).map((a) => [a.type, a.plots])),
                fixedEta: horizon ? new Map(anchorsOf(m.key).map((a) => [a.type, a.turns])) : null,
                engineValid: v?.valid ?? null,
                allowFuture: bs.futureTiles !== false,
                production,
                startTurn: m.city ? 0 : PLANNED_START,
                costOf: (type) => {
                    const c = m.city ? Number(safe(() => m.city.Production.getConstructibleProductionCost(type), 0)) : 0;
                    return c > 0 ? c : rules.costOf(type) * costScale;
                },
            };
        });

        const planState = new PlanState({
            map: engineMap.map,
            facts: (idx) => facts.structures(idx),
            area: areaSet,
            settlements,
            book: rules,
            weights: profile.y,
            adjOpts: { playerId, charming: rules.appealCharming, breathtaking: rules.appealBreathtaking },
            ruralLoss: 1,
            horizon,
            lockDelay: LOCK_DELAY,
            isLocked: (type) => lockedSet.has(type),
            uniqueQuarters: rules.uniqueQuarters,
            uqBonus: UQ_BONUS,
            tackEta: TACK_ETA,
            nextAge: outlook?.isFinalAge ? 0 : NEXT_AGE_SHARE,
        });
        // Anchor our adjacency to the game's own number wherever the game evaluated a tile
        // (before the player's tacks are added: the game's numbers describe the map as it is).
        const calibration = { compared: 0, gaps: [], applied: false };
        const selectedSet = new Set(selected);
        for (const [key, e] of engineData) {
            const [hash, plot] = key.split(":").map(Number);
            const type = GameInfo.Constructibles.lookup(hash)?.ConstructibleType;
            if (!type || !selectedSet.has(type) || warehouseTypes.has(type) || !planState.tiles.has(plot)) continue;
            const gap = planState.adjacencyGap(type, plot, e.adjacencyIn);
            if (gap === null) continue;
            calibration.compared++;
            if (gap) calibration.gaps.push({ type, plot, gap });
        }
        // Mostly-wrong would mean we misread the game's data, not that our rules are off: then keep ours.
        if (calibration.gaps.length <= calibration.compared * MAX_CALIBRATION_SHARE) {
            for (const g of calibration.gaps) planState.setAdjacencyCorrection(g.type, g.plot, g.gap);
            calibration.applied = true;
        }
        calibration.sample = calibration.gaps.slice(0, 4).map((g) => `${g.type}@${engineMap.location(g.plot).x},${engineMap.location(g.plot).y}:${g.gap.map((v) => Math.round(v * 10) / 10).join("/")}`);
        // Warehouses help the whole settlement (+1 on all its farms, camps, fishing boats...):
        // value them by what the game says they add there (its numbers include that bonus).
        const warehouseValue = new Map();
        for (const [key, e] of engineData) {
            const [hash, plot] = key.split(":").map(Number);
            const type = GameInfo.Constructibles.lookup(hash)?.ConstructibleType;
            const sid = planState.tiles.get(plot)?.sid;
            if (!type || !sid || !warehouseTypes.has(type)) continue;
            const v = dot(profile.y, e.yields) - dot(profile.y, rules.baseYields.get(type) ?? []);
            const k = `${sid}|${type}`;
            warehouseValue.set(k, Math.max(warehouseValue.get(k) ?? 0, v));
        }
        for (const st of settlements) {
            for (const type of warehouseTypes) planState.setExtraValue(st.id, type, warehouseValue.get(`${st.id}|${type}`) ?? WAREHOUSE_GUESS);
        }
        for (const a of anchors) planState.setExtraValue(a.sid, a.type, ANCHOR_VALUE);
        const tackInfo = bs.respectTacks !== false ? applyUserTacks(planState, queuedTypes(members)) : { count: 0, kept: new Set() };
        planState.invalidateAll();

        const adjacencySelection = selected.filter((t) => !warehouseTypes.has(t) && (includeLocked || !lockedSet.has(t)));
        const warehouseSelection = selected.filter((t) => warehouseTypes.has(t) && (includeLocked || !lockedSet.has(t)));
        const locked = includeLocked ? [] : [...lockedSet];

        // A town only gets what a town can buy (Altar, warehouses); a city everything selected.
        const townSelection = adjacencySelection.filter((t) => rules.placementOf(t).town);
        const selectionFor = (sid) => [...(roleBySid.get(sid) === "TOWN" ? townSelection : adjacencySelection), ...anchorsOf(sid).map((a) => a.type)];

        // Incremental: same target and settings, recent plan -> re-solve only changed settlements.
        const memberSigs = Object.fromEntries(settlements.map((st) => [st.id, `${planState.settlementSignature(st.id)}/${engineSigs.get(st.id) ?? ""}/${memberSignature(st, roleBySid.get(st.id), anchors)}`]));
        const inputSig = inputSignature(target, settings, selected, lockedSet, rules);
        let dirty = null;
        let seed = null;
        if (bs.incremental === false) fullWhy = "option off";
        else if (!previous?.seed) fullWhy = "first plan";
        else if (previous.inputSig !== inputSig) fullWhy = `inputs: ${inputsChanged(previous.inputSig, inputSig).join(", ")}`;
        else if (Game.turn - (previous.computedTurn ?? -Infinity) >= FULL_AFTER_TURNS) fullWhy = `${FULL_AFTER_TURNS} turns`;
        else {
            const changed = settlements.filter((st) => previous.memberSigs?.[st.id] !== memberSigs[st.id]).map((st) => st.id);
            if (changed.length < settlements.length) {
                dirty = new Set(changed);
                seed = previous.seed;
            } else fullWhy = "every settlement changed";
        }
        timing.setup += now() - t0;
        ctx = {
            facts, areaSet, uniqueTypes, validity, engineData, lockedSet, locked, horizon, roleBySid, settlements, planState,
            calibration, tackInfo, adjacencySelection, warehouseSelection, selectionFor, memberSigs, inputSig, dirty, seed, anchors,
        };
    }

    function* job() {
        yield* setup();
        return yield* solveLayout(ctx.planState, ctx.adjacencySelection, ctx.warehouseSelection, { selectionFor: ctx.selectionFor, dirty: ctx.dirty, seed: ctx.seed, clock: now });
    }

    state.set({ status: { busy: true, progress: 0, message: "" } });
    const started = Date.now();
    const handle = runJob(JOB_NAME, job(), { budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS, onProgress: (p) => state.set({ status: { busy: true, progress: p, message: "" } }) });
    handle.promise
        .then((outcome) => {
            if (outcome.cancelled) return;
            const t0 = now();
            const plan = outcome.result;
            const { areaSet, uniqueTypes, validity, engineData, lockedSet, locked, horizon, roleBySid, settlements, planState, calibration, tackInfo, memberSigs, inputSig, dirty } = ctx;
            const tackCount = tackInfo.count;
            const baseName = (m) => (m.kind === "planned" ? compose("LOC_XPL_TARGET_PLANNED", m.x, m.y) : m.name);
            const names = new Map(members.map((m) => [m.key, roleBySid.get(m.key) === "TOWN" ? `${baseName(m)} — ${compose("LOC_XPL_PLAN_AS_TOWN")}` : baseName(m)]));
            const centres = new Map(settlements.map((st) => [st.id, st.centre]));
            const describe = (idx, sid) => {
                const { x, y } = engineMap.location(idx);
                const c = centres.get(sid) ?? engineMap.index(target.x, target.y);
                return { x, y, dist: engineMap.map.distance(c, idx), dir: idx === c ? "" : engineMap.direction(c, idx), settlementName: names.get(sid) ?? "" };
            };
            const nameOf = (type) => compose(GameInfo.Constructibles.lookup(type)?.Name ?? type);
            const plannedAt = new Map();
            for (const p of [...plan.placements, ...plan.fillers]) {
                if (!plannedAt.has(p.idx)) plannedAt.set(p.idx, []);
                plannedAt.get(p.idx).push(p.type);
            }
            const engineByHash = indexByHash(engineData);
            const cityBySid = new Map(members.map((m) => [m.key, m.city ?? null]));
            // Upkeep (the game's number for that city when it has one) and the value left after it.
            const upkeepOf = (sid, type) => upkeepIn(cityBySid.get(sid), type, rules);
            // Food and happiness upkeep weigh less where the settlement has plenty to spare (core/xpl-scarcity.js).
            const netsOf = (c) => {
                if (!c) return null;
                const out = [NaN, NaN, NaN, NaN, NaN, NaN, NaN];
                out[yieldIndex("YIELD_FOOD")] = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_FOOD), NaN));
                out[yieldIndex("YIELD_HAPPINESS")] = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), NaN));
                return out;
            };
            const netsBySid = new Map(members.map((m) => [m.key, netsOf(m.city)]));
            const upkeepValue = (sid, upkeep) => costValue(profile.y, upkeep, netsBySid.get(sid) ?? null);
            // Wonder anchors are kept apart: the autopilot starts wonders by its own rules, on the tile kept here.
            const isWonder = (type) => rules.classOf(type) === "WONDER";
            const anchorRows = plan.placements.filter((p) => isWonder(p.type)).map((p) => ({ type: p.type, sid: p.sid, idx: p.idx, eta: p.eta, ...describe(p.idx, p.sid), name: nameOf(p.type) }));
            const placements = plan.placements.filter((p) => !isWonder(p.type)).map((p) => {
                const hash = GameInfo.Constructibles.lookup(p.type)?.$hash;
                const engine = engineData.get(`${hash}:${p.idx}`) ?? null;
                const upkeep = upkeepOf(p.sid, p.type);
                return {
                    upkeep,
                    net: Math.round((p.value - upkeepValue(p.sid, upkeep)) * 10) / 10,
                    bestNow: bestNowFor(p, engineByHash.get(hash) ?? [], engine, planState, plannedAt, describe, nameOf),
                    ...p,
                    ...describe(p.idx, p.sid),
                    name: nameOf(p.type),
                    locked: lockedSet.has(p.type),
                    unique: uniqueTypes.includes(p.type),
                    engineValue: engine ? Math.round(dot(profile.y, engine.yields) * 10) / 10 : null,
                    engineYields: engine?.yields ?? null,
                };
            });
            const fillers = plan.fillers.map((f) => {
                const value = dot(profile.y, rules.baseYields.get(f.type) ?? []) + (planState.extraValue.get(`${f.sid}|${f.type}`) ?? 0);
                const upkeep = upkeepOf(f.sid, f.type);
                return { ...f, ...describe(f.idx, f.sid), locked: lockedSet.has(f.type), name: nameOf(f.type), value, upkeep, net: Math.round((value - upkeepValue(f.sid, upkeep)) * 10) / 10 };
            });
            timing.post = now() - t0;
            const timings = {
                ...plan.timings,
                engine: Math.round(timing.engine),
                setup: Math.round(timing.setup),
                post: Math.round(timing.post),
                queried: timing.queried,
                cached: timing.cached,
                busy: outcome.busyMs,
                frames: outcome.frames,
            };
            for (const k of ["seed", "greedy", "search", "repair", "anneal", "describe"]) timings[k] = Math.round(timings[k] ?? 0);
            const plans = {
                targetKey: target.key,
                targetName: target.name,
                centre: engineMap.index(target.x, target.y),
                centres: [...centres.values()],
                members: members.map((m) => ({ key: m.key, name: names.get(m.key), role: roleBySid.get(m.key) })),
                placements,
                fillers,
                anchors: anchorRows,
                unplaced: [...plan.unplaced, ...locked.map((type) => ({ type, reason: "LOCKED" }))].map((u) => ({ ...u, name: nameOf(u.type), settlementName: names.get(u.sid) ?? "" })),
                total: plan.total,
                timeAware: !!horizon,
                horizon: horizon ?? null,
                tacksRespected: tackCount,
                keptTacks: [...tackInfo.kept],
                computedTurn: Game.turn,
                userTackSig: userTackSignature([...centres.values()]),
                uniqueQuartersSig: unlockedUniqueQuarters().join(","),
                engineUsed: validity.size > 0,
                nextAge: planState.nextAge, // share of the next age counted for ageless adjacency (0 in the final age)
                unexplored: members.length === 1 && !target.city && areaSet.size < 7,
                elapsedMs: Date.now() - started,
                seed: plan.seed,
                inputSig,
                memberSigs,
                incremental: dirty ? { changed: dirty.size, of: settlements.length } : null,
                fullWhy: dirty ? null : fullWhy,
                timings,
            };
            state.set({ status: { busy: false, progress: 1, message: "" }, results: { ...state.get().results, plans }, stale: { ...state.get().stale, plans: false } });
            const why = {};
            for (const u of plans.unplaced) why[u.reason] = (why[u.reason] ?? 0) + 1;
            const calibMsg = `buildings: our adjacency differed from the game's on ${calibration.gaps.length}/${calibration.compared} (building, tile) pairs; ${calibration.applied ? "using the game's numbers there" : "too many, NOT applied"} ${JSON.stringify(calibration.sample)}`;
            if (calibration.applied) log.info(calibMsg);
            else log.warn(calibMsg);
            if (ctx.anchors.length > 0) log.info(`buildings: wonder tiles kept ${anchorRows.map((a) => `${a.type} ${a.x},${a.y} (${a.sid})`).join(", ") || "none"} of ${ctx.anchors.map((a) => `${a.type}${a.plots ? "" : " (rules)"}`).join(", ")}`);
            log.info(`buildings: ${placements.length} placed, ${fillers.length} fillers, ${plans.unplaced.length} unplaced ${JSON.stringify(why)} for ${members.map((m) => m.key).join("+")}: area ${planState.tiles.size} tiles, ${lockedSet.size} locked, horizon ${horizon ?? "-"}, ${rules.uniques.length} uniques, in ${plans.elapsedMs} ms (engine ${plans.engineUsed}, ${tackCount} tacks respected)`);
            const tm = timings;
            log.info(`buildings timing: ${dirty ? `incremental ${dirty.size}/${settlements.length} settlements re-solved (${tm.seeded} kept)` : `full (${fullWhy})`}; busy ${tm.busy} ms in ${tm.frames} frames; game queries ${tm.engine} ms (${tm.queried} cities asked, ${tm.cached} from this turn's cache), setup ${tm.setup}, seed ${tm.seed}, greedy ${tm.greedy}, search ${tm.search} (${tm.rounds} rounds), repair ${tm.repair}, anneal ${tm.anneal} (+${tm.annealGain}), describe ${tm.describe}, results ${tm.post} ms; work ${tm.deltas} gains, ${tm.values} tile values, ${tm.views} views`);
        })
        .catch((error) => {
            log.error("building plan failed", error);
            state.set({ status: { busy: false, progress: 0, message: "LOC_XPL_ERROR" } });
        });
    return handle;
}

/**
 * Debug: compare our JS adjacency with the engine's for every (building, tile) the
 * engine evaluates in a city, on the current map (no plan). Logs mismatches.
 */
export function crossCheckCity(target) {
    if (!target?.city) return { error: "not a city" };
    const playerId = GameContext.localPlayerID;
    const engineMap = getEngineMap();
    const rules = getRules();
    const facts = new FactsCache(engineMap, rules, { playerId, includeHidden: false });
    const centre = engineMap.index(target.x, target.y);
    const owned = new Set(safe(() => target.city.getPurchasedPlots(), []));
    const area = engineMap.map.radius(centre, AREA_RADIUS + 1).map((p) => p.idx);
    const planState = new PlanState({ map: engineMap.map, facts: (i) => facts.structures(i), centre, area, owned, book: rules, weights: [1, 1, 1, 1, 1, 1, 1], adjOpts: { playerId, charming: rules.appealCharming, breathtaking: rules.appealBreathtaking } });
    const engineData = enginePlacements(target.city);
    let compared = 0;
    const mismatches = [];
    for (const b of rules.buildings) {
        const hash = GameInfo.Constructibles.lookup(b.type)?.$hash;
        for (const idx of planState.tiles.keys()) {
            const e = engineData.get(`${hash}:${idx}`);
            if (!e) continue;
            const check = planState.canPlace(b.type, idx);
            if (!check.ok) continue;
            const token = planState.place(b.type, idx, check);
            const js = planState.adjacencyOf(b.type, idx).byYield;
            planState.undo(token);
            compared++;
            const diff = js.map((v, i) => v - e.adjacencyIn[i]);
            if (diff.some((d) => Math.abs(d) > 0.01)) mismatches.push({ type: b.type, idx, js, engine: e.adjacencyIn });
        }
    }
    const result = { compared, mismatches: mismatches.length, agreement: compared ? Math.round((1 - mismatches.length / compared) * 1000) / 10 : null };
    log.info(`cross-check ${target.name}: ${JSON.stringify(result)}`, mismatches.slice(0, 5));
    return { ...result, sample: mismatches.slice(0, 10) };
}
