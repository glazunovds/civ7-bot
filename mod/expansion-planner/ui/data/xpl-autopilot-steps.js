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
import { runTownAdvisor } from './xpl-town-job.js';
import { FOCUS_POPULATION } from '../core/xpl-town-focus.js';
import { getProfile } from '../core/xpl-profiles.js';
import { yieldIndex } from '../core/xpl-yields.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { allowedOperations, artifactSites, guardsFor, isIdle, NO_TARGET, plannedRoleAt, unitKey } from './xpl-autopilot-units.js';

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

// ---- research and civics ----------------------------------------------------------

const ADVISOR_FOR_PROFILE = { SCIENCE: "SCIENCE", CULTURE: "CULTURE", GOLD: "ECONOMIC", PRODUCTION: "ECONOMIC", FOOD: "ECONOMIC", HAPPINESS: "CULTURE" };

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
 * Chooses the next technology ("tech") or civic ("culture") when none is being researched.
 * @returns log entry or null
 */
export function chooseResearch(kind, settings) {
    const player = Players.get(pid());
    const holder = kind === "tech" ? player?.Techs : player?.Culture;
    if (!holder) return null;
    const treeType = kind === "tech" ? safe(() => holder.getTreeType(), undefined) : safe(() => holder.getActiveTree(), undefined);
    if (treeType === undefined) return null;
    const tree = safe(() => Game.ProgressionTrees.getTree(pid(), treeType), null);
    const active = tree && tree.activeNodeIndex >= 0 ? tree.nodes?.[tree.activeNodeIndex]?.nodeType : undefined;
    if (active !== undefined && active !== null) return null; // already researching something
    const available = new Set(safe(() => holder.getAllAvailableNodeTypes(), []) ?? []);
    if (available.size === 0) return null;
    const subject = kind === "tech" ? globalThis.AdvisorySubjectTypes?.CHOOSE_TECH : globalThis.AdvisorySubjectTypes?.CHOOSE_CULTURE;
    const recs = safe(() => Players.Advisory.get(pid()).getTreeRecommendations({ playerId: pid(), subject, maxReturnedEntries: 0 }), []) ?? [];
    const toNode = (r) => {
        const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(r.recommendedType), null);
        const node = def ? safe(() => Game.ProgressionTrees.getNode(pid(), def.ProgressionTreeNodeType)?.nodeType, null) : r.recommendedType;
        return available.has(node) ? node : null;
    };
    const usable = recs.filter((r) => toNode(r) !== null);
    const pick = pickRecommendation(usable, settings.profile);
    // No advice: the quickest available one.
    const nodeType = pick ? toNode(pick) : [...available].sort((a, b) => (safe(() => holder.getTurnsForNode(a), 99) - safe(() => holder.getTurnsForNode(b), 99)))[0];
    const op = kind === "tech" ? PlayerOperationTypes.SET_TECH_TREE_NODE : PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    const args = { ProgressionTreeNodeType: nodeType };
    const ok = safe(() => Game.PlayerOperations.canStart(pid(), op, args, false), null);
    if (!ok?.Success) return null;
    Game.PlayerOperations.sendRequest(pid(), op, args);
    const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(nodeType), null);
    return { key: kind === "tech" ? "TECH" : "CIVIC", args: [def?.Name ? Locale.compose(def.Name) : String(nodeType), pick ? "" : "*"] };
}

// ---- production ----------------------------------------------------------------------

/** The plot the game rates best for a building in this city (its own placement numbers). */
function bestPlotFor(city, typeHash, plots) {
    const data = safe(() => city.Yields.calculateAllBuildingsPlacements(), null);
    const forType = data?.buildings?.find((b) => b.constructibleType === typeHash);
    let best = null;
    for (const p of forType?.placements ?? []) {
        if (!plots.includes(p.plotID)) continue;
        const total = (p.yieldChanges ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
        if (!best || total > best.total) best = { plot: p.plotID, total };
    }
    return best?.plot ?? plots[0] ?? null;
}

/** The advisor's top recommendation the city can start now, as BUILD args. */
/**
 * A unit is worth building when something will use it: military units stand guard; scouts,
 * settlers and merchants only when the autopilot moves them (`unitOptions`) or the player
 * is there to do it.
 */
function unitWanted(def, unitOptions) {
    if (def.CoreClass === "CORE_CLASS_MILITARY") return soldierRoom(PEACE_SOLDIERS_PER_SETTLEMENT);
    const yes = (v) => v === true || v === 1 || v === "true";
    if (yes(def.FoundCity)) return !!unitOptions.settlers;
    if (yes(def.MakeTradeRoute)) return !!unitOptions.merchants;
    if (yes(def.ExtractsArtifacts)) return !!unitOptions.explore;
    if (isScout(def)) return !!unitOptions.explore;
    return false;
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
        if (subject === "ADVISORY_SUBJECT_PRODUCE_CONSTRUCTIBLES") {
            const def = GameInfo.Constructibles.lookup(r.recommendedType);
            if (!def) continue;
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
        const ok = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
        if (ok?.Success) return { args, name };
    }
    return null;
}

// ---- victory levers -----------------------------------------------------------------

// Projects that earn Innovation (science victory points), most per production first (projects.xml
// of each age, projects-gameeffects.xml); a project the game does not offer is skipped.
const SCIENCE_PROJECTS = [
    "PROJECT_CREWED_SPACE_FLIGHT_PREP",      // 15, repeatable (Launch Pad)
    "PROJECT_INVENT_CALCULUS",               // 10
    "PROJECT_CHART_THE_STARS", "PROJECT_SPHERICAL_EARTH", "PROJECT_HELIOCENTRIC_MODEL",
    "PROJECT_LAUNCH_SATELLITE", "PROJECT_TRANS_OCEANIC_FLIGHT", "PROJECT_BREAK_SOUND_BARRIER",
    "PROJECT_CREWED_SPACE_FLIGHT_RESEARCH",  // 5 each
];
const LAUNCH_PAD = "BUILDING_LAUNCH_PAD"; // the science victory needs one, undamaged
const FACTORY = "BUILDING_FACTORY";       // factory resources: GDP and the Railroad Tycoon path

const queueTypes = (city) => (safe(() => city.BuildQueue.getQueue(), []) ?? []).map((q) => q.constructibleType ?? q.projectType ?? q.type);

/** Moves the item of this type to the front of the city's queue (CityOperationsParametersValues.MoveTo). */
function toFront(city, hash) {
    const MoveTo = globalThis.CityOperationsParametersValues?.MoveTo;
    const i = queueTypes(city).findIndex((t) => t === hash);
    if (MoveTo === undefined || i <= 0) return;
    const args = { InsertMode: MoveTo, QueueSourceLocation: i, QueueDestinationLocation: 0 };
    if (safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
}

/** Do we have this building (finished, undamaged) anywhere? (the buildings on our cities' tiles) */
function ownsBuilding(type) {
    for (const city of ownSettlements()) {
        for (const idx of safe(() => city.getPurchasedPlots(), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            for (const id of loc ? safe(() => MapConstructibles.getHiddenFilteredConstructibles(loc.x, loc.y), []) ?? [] : []) {
                const c = safe(() => Constructibles.getByComponentID(id), null);
                if (c && c.complete !== false && !c.damaged && safe(() => GameInfo.Constructibles.lookup(c.type)?.ConstructibleType, null) === type) return true;
            }
        }
    }
    return false;
}

/**
 * The victory focus's own work, ahead of everything else in a city's queue:
 *  - science: each project that earns Innovation that a city may start now (in the best
 *    producing such city, one at a time each, the repeatable Crewed Space Flight Preparation kept
 *    going) and a Launch Pad (needed to win) when we have none;
 *  - economy: a Factory in every city that can build one (factory resources: +3 GDP each per
 *    turn, and the Railroad Tycoon path whose triumph brings the Great Banker).
 * Queued with the production list's requests (BUILD {ProjectType} / {ConstructibleType, X, Y})
 * and moved to the front. @returns log entries
 */
export function pushVictoryWork(focus) {
    const out = [];
    const cities = ownSettlements().filter((c) => !c.isTown)
        .sort((a, b) => (Number(safe(() => b.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0) - (Number(safe(() => a.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0));
    const queuedAnywhere = (hash) => cities.some((c) => queueTypes(c).includes(hash));
    const place = (city, def) => {
        const probe = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash }, false), null);
        if (!probe?.Success || probe.InQueue || probe.InProgress) return false;
        const plots = [...(probe.Plots ?? []), ...(probe.ExpandUrbanPlots ?? [])];
        if (plots.length === 0) return false;
        const loc = safe(() => GameplayMap.getLocationFromIndex(bestPlotFor(city, def.$hash, plots) ?? plots[0]), null);
        if (!loc) return false;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$hash, X: loc.x, Y: loc.y });
        toFront(city, def.$hash);
        out.push({ key: "VICTORY_WORK", args: [nameOf(city), safe(() => Locale.compose(def.Name), def.ConstructibleType)] });
        return true;
    };
    if (focus === "SCIENCE") {
        for (const type of SCIENCE_PROJECTS) {
            const def = safe(() => GameInfo.Projects.lookup(type), null);
            if (!def) continue;
            if (queuedAnywhere(def.$hash)) {
                for (const c of cities) toFront(c, def.$hash);
                continue;
            }
            for (const c of cities) {
                const r = safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, { ProjectType: def.$hash }, false), null);
                if (!r?.Success || r.InProgress || r.InQueue) continue;
                Game.CityOperations.sendRequest(c.id, CityOperationTypes.BUILD, { ProjectType: def.$hash });
                toFront(c, def.$hash);
                out.push({ key: "VICTORY_WORK", args: [nameOf(c), safe(() => Locale.compose(def.Name), type)] });
                break;
            }
        }
        const pad = safe(() => GameInfo.Constructibles.lookup(LAUNCH_PAD), null);
        if (pad && !queuedAnywhere(pad.$hash) && !ownsBuilding(LAUNCH_PAD)) {
            for (const c of cities) if (place(c, pad)) break;
        }
    }
    if (focus === "ECONOMIC") {
        const factory = safe(() => GameInfo.Constructibles.lookup(FACTORY), null);
        if (factory) {
            for (const c of cities) {
                if (queueTypes(c).includes(factory.$hash)) toFront(c, factory.$hash);
                else place(c, factory);
            }
        }
    }
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
 * @param options { buy, queue }
 */
export function repairBuildings({ buy = true, queue = true } = {}) {
    const out = [];
    const MoveTo = globalThis.CityOperationsParametersValues?.MoveTo;
    for (const city of ownSettlements()) {
        const damaged = damagedOf(city);
        for (const d of damaged) {
            for (const plot of d.plots) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(plot), null);
                if (!loc) continue;
                const args = { ConstructibleType: d.def.$hash, X: loc.x, Y: loc.y };
                if (buy) {
                    const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
                    const cost = Number(r?.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, d.def.ConstructibleType), Infinity));
                    if (r?.Success && Number.isFinite(cost) && cost <= goldBalance()) {
                        Game.CityCommands.sendRequest(city.id, CityCommandTypes.PURCHASE, args);
                        out.push({ key: "REPAIR_BOUGHT", args: [safe(() => Locale.compose(d.def.Name), d.def.ConstructibleType), nameOf(city), cost] });
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
        // A repair waiting behind other items goes to the front.
        if (!queue || city.isTown || MoveTo === undefined) continue;
        const repairs = new Set(damaged.filter((d) => d.inQueue).map((d) => d.def.$hash));
        const items = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        const i = items.findIndex((q, j) => j > 0 && repairs.has(q.constructibleType ?? q.type));
        if (i <= 0) continue;
        const move = { InsertMode: MoveTo, QueueSourceLocation: i, QueueDestinationLocation: 0 };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, move, false), null)?.Success) continue;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, move);
        out.push({ key: "REPAIR_FIRST", args: [nameOf(city)] });
    }
    return out;
}

// ---- resources ----------------------------------------------------------------------

const MAX_RESOURCE_ASSIGNMENTS = 12;
// A resource's yields: its TypeTags (as the game's resource screen reads them).
const RESOURCE_YIELD_TAGS = { FOOD: "YIELD_FOOD", PRODUCTION: "YIELD_PRODUCTION", GOLD: "YIELD_GOLD", SCIENCE: "YIELD_SCIENCE", CULTURE: "YIELD_CULTURE", HAPPINESS: "YIELD_HAPPINESS" };

/**
 * Resources not assigned to any settlement go into free resource slots: the same request as
 * the game's resource screen (commerce-screen-model.js assignResource): PlayerOperations
 * ASSIGN_RESOURCE {Location, City: city.id.id, Flags: isOffMap, ID: off-map id or -1}.
 * Owned: player.Resources.getResources() → [{ value, uniqueResource: { resource }, isOffMap }];
 * placed: city.Resources.getAssignedResources(), slots getAssignedResourcesCap(). Empire and
 * treasure resources are never assigned. Most valuable first (its yields by the priority
 * profile); cities before towns, most free slots first; only where the game accepts.
 * Assigned resources count for the economic legacy path and triumphs.
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
    const weights = getProfile(settings.profile).y;
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
        .sort((a, b) => value(b.def) - value(a.def));
    for (const { r, def } of waiting) {
        if (out.length >= MAX_RESOURCE_ASSIGNMENTS) break;
        for (const p of places) {
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

/** Settlers we have or are training. */
export function settlersInFlight() {
    return unitCount(isSettler);
}

/**
 * Units the autopilot wants trained now, in order: scouts (exploring) up to SCOUTS_WANTED,
 * then settlers (settling): two in flight while we have fewer than EARLY_SETTLEMENTS
 * settlements, then one at a time, never past the settlement cap.
 */
function unitsWanted(unitOptions) {
    const out = [];
    if (unitOptions.explore) {
        const n = SCOUTS_WANTED - unitCount(isScout);
        if (n > 0) out.push({ test: isScout, n, key: "QUEUED_SCOUT", target: SCOUTS_WANTED });
        // Explorers exist in the Modern age only; the map is scanned only when one is missing.
        const missing = GameInfo.Units?.find((d) => isExplorer(d)) ? EXPLORERS_WANTED - unitCount(isExplorer) : 0;
        if (missing > 0) {
            const sites = artifactSites();
            if (sites.dig.length + sites.study.length > 0) out.push({ test: isExplorer, n: missing, key: "QUEUED_EXPLORER", target: EXPLORERS_WANTED });
        }
    }
    if (unitOptions.settlers) {
        const stats = safe(() => Players.get(pid()).Stats, null);
        const settlements = Number(stats?.numSettlements ?? ownSettlements().length) || 0;
        const cap = Number(stats?.settlementCap) || Infinity;
        const want = Math.min(settlements < EARLY_SETTLEMENTS ? SETTLERS_EARLY : SETTLERS_LATER, Math.max(0, cap - settlements));
        const n = want - unitCount(isSettler);
        if (n > 0) out.push({ test: isSettler, n, key: "QUEUED_SETTLER", target: want });
    }
    return out;
}

const isMilitary = (def) => !!def && def.CoreClass === "CORE_CLASS_MILITARY" && def.Domain !== "DOMAIN_SEA" && def.Domain !== "DOMAIN_AIR";

// Seen in game: with every empty queue taking the advisor's military unit and a lasting threat
// training defenders, ~25 soldiers filled every tile around a city.
const PEACE_SOLDIERS_PER_SETTLEMENT = 2; // the advisor's military units only below this many per settlement...
const WAR_SOLDIERS_PER_SETTLEMENT = 4;   // ...defenders for a threatened settlement below this many

/** Room for one more soldier: ours on the map and in training below perSettlement × settlements? */
function soldierRoom(perSettlement) {
    const soldier = (def) => !!def && def.CoreClass === "CORE_CLASS_MILITARY";
    return unitCount(soldier) < perSettlement * Math.max(1, ownSettlements().length);
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
function trainDefenders(threats, used) {
    const out = [];
    const cities = ownSettlements().filter((c) => !c.isTown);
    for (const t of threats) {
        const city = cities.map((c) => ({ c, d: safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, t.settlement.x, t.settlement.y), Infinity) }))
            .sort((a, b) => a.d - b.d)[0]?.c;
        if (!city || used.has(sidOf(city))) continue;
        if (guardsFor(t) >= t.count || !soldierRoom(WAR_SOLDIERS_PER_SETTLEMENT)) continue;
        if ((safe(() => city.BuildQueue.getQueue(), []) ?? []).some((q) => isMilitary(queueUnitDef(q)))) continue;
        const order = bestMilitaryOrder(city);
        if (!order) continue;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, order.args);
        out.push({ key: "QUEUED_DEFENDER", args: [nameOf(city), Locale.compose(order.name), t.settlement.name, t.count] });
        used.add(sidOf(city));
    }
    return out;
}

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
    // Defenders first: a settlement under threat cannot wait for scouts or settlers.
    const entries = trainDefenders(unitOptions.threats ?? [], used);
    const cities = ownSettlements().filter((c) => !c.isTown).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    for (const w of unitsWanted(unitOptions)) {
        let n = w.n;
        for (const city of cities) {
            if (n <= 0) break;
            if (used.has(sidOf(city))) continue;
            if ((safe(() => city.BuildQueue.getQueue(), []) ?? []).some((q) => w.test(queueUnitDef(q)))) continue;
            const order = unitOrder(city, w.test);
            if (!order) continue;
            Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, order.args);
            entries.push({ key: w.key, args: [nameOf(city), Locale.compose(order.name), w.target] });
            used.add(sidOf(city));
            n--;
        }
    }
    return { entries, used };
}

/** A scout or settler waiting behind other items moves to the front of its city's queue. */
export function frontLoadUnits(unitOptions = {}) {
    const out = [];
    const MoveTo = globalThis.CityOperationsParametersValues?.MoveTo;
    if (MoveTo === undefined) return out;
    const underThreat = (unitOptions.threats ?? []).length > 0;
    const wanted = (def) => (underThreat && isMilitary(def)) || (unitOptions.explore && isScout(def)) || (unitOptions.settlers && isSettler(def));
    for (const city of ownSettlements()) {
        if (city.isTown) continue;
        const queue = safe(() => city.BuildQueue.getQueue(), []) ?? [];
        const i = queue.findIndex((q, j) => j > 0 && wanted(queueUnitDef(q)));
        if (i <= 0) continue;
        const args = { InsertMode: MoveTo, QueueSourceLocation: i, QueueDestinationLocation: 0 };
        if (!safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null)?.Success) continue;
        Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
        out.push({ key: "FRONT_LOADED", args: [nameOf(city), Locale.compose(queueUnitDef(queue[i])?.Name ?? "?")] });
    }
    return out;
}

/** Nothing usable from the advisor: the cheapest building this city can place now. */
function cheapestBuilding(city) {
    let best = null;
    for (const def of GameInfo.Constructibles ?? []) {
        if (def.ConstructibleClass !== "BUILDING") continue;
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
 * Wonders to start now (from the Wonders tab's own analysis): cityKey -> { type, name, x, y }.
 * Only races we are likely to win (HIGH, or MEDIUM at a discount) that finish in this age,
 * at most `maxWonders` in production at once, best value per turn of production first.
 */
export function chooseWonders(settings, maxWonders) {
    const picks = new Map();
    const w = safe(() => runWonderPlanner(settings), null);
    if (!w) return picks;
    const building = w.rows.filter((r) => r.status === "IN_PROGRESS").length;
    let room = Math.max(0, maxWonders - building);
    const busyCities = new Set(w.rows.filter((r) => r.inQueue).map((r) => r.inQueue.cityKey));
    // Every (wonder, city) pair: the second wonder can go to the second-fastest city.
    const pairs = [];
    for (const r of w.rows) {
        const factor = RACE_FACTOR[r.race?.label];
        if (r.status !== "AVAILABLE" || !factor) continue;
        for (const o of r.options) {
            const plot = o.plots[0];
            if (!plot || !(o.turns > 0)) continue;
            if (w.ageTurnsLeft !== null && o.turns > w.ageTurnsLeft - WONDER_AGE_MARGIN) continue;
            const value = (r.baseValue + (plot.value ?? 0) + WONDER_LEGACY_VALUE) * factor;
            pairs.push({ score: value / o.turns, type: r.type, name: r.name, cityKey: o.cityKey, plots: o.plots, race: r.race.label });
        }
    }
    pairs.sort((a, b) => b.score - a.score);
    const startedTypes = new Set();
    const claimed = new Set();
    for (const p of pairs) {
        if (room <= 0) break;
        if (busyCities.has(p.cityKey) || picks.has(p.cityKey) || startedTypes.has(p.type)) continue;
        const plot = p.plots.find((q) => !claimed.has(q.idx));
        if (!plot) continue;
        claimed.add(plot.idx);
        startedTypes.add(p.type);
        picks.set(p.cityKey, { type: p.type, name: p.name, x: plot.x, y: plot.y, cityKey: p.cityKey, race: p.race, score: p.score });
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
    const trained = trainWantedUnits(unitOptions);
    const out = [...trained.entries];
    for (const city of ownSettlements()) {
        if (city.isTown || trained.used.has(sidOf(city)) || !safe(() => city.BuildQueue.isEmpty, false)) continue;
        const wonder = wonderPicks.get(sidOf(city)); // the wonder job keys cities "c:x-y" too
        if (wonder) {
            const def = GameInfo.Constructibles.lookup(wonder.type);
            const args = def ? { ConstructibleType: def.$hash, X: wonder.x, Y: wonder.y } : null;
            const ok = args ? safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null) : null;
            if (ok?.Success) {
                Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
                out.push({ key: "QUEUED_WONDER", args: [nameOf(city), wonder.name, wonder.race === "HIGH" ? Locale.compose("LOC_XPL_RACE_HIGH") : Locale.compose("LOC_XPL_RACE_MEDIUM")] });
                continue;
            }
        }
        if (plans) {
            const r = queueNextBuildings(plans, sidOf(city), 2);
            if (r.queued.length > 0) {
                out.push({ key: "QUEUED_PLAN", args: [nameOf(city), r.queued.map((t) => Locale.compose(GameInfo.Constructibles.lookup(t)?.Name ?? t)).join(", ")] });
                continue;
            }
        }
        const order = advisorOrder(city, unitOptions);
        const fallback = order ? null : cheapestBuilding(city);
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

// ---- growth ----------------------------------------------------------------------------

/** Places one waiting citizen per city where the growth advisor says. @returns log entries */
/** Names of our settlements that say a new citizen waits (for the log). */
export function readyToGrow() {
    return ownSettlements().filter((c) => safe(() => c.Growth.isReadyToPlacePopulation, false)).map((c) => `${nameOf(c)}${c.isTown ? " (town)" : ""}`);
}

export function placeGrowth(settings) {
    const out = [];
    let townFocus = null; // town key -> the Focus it will take at population 7 (Towns tab)
    for (const city of ownSettlements()) {
        if (!safe(() => city.Growth.isReadyToPlacePopulation, false)) continue;
        let focusKind = null;
        if (city.isTown) {
            townFocus ??= new Map((safe(() => runTownAdvisor(settings), null)?.rows ?? []).map((r) => [`${r.town.x},${r.town.y}`, r.focus?.best?.key ?? null]));
            focusKind = townFocus.get(`${city.location.x},${city.location.y}`) ?? null;
        }
        const a = growthAdvice(city.id, settings, { focusKind });
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
        if (placed) out.push(placed);
        else log.info(`autopilot: no place for a new citizen in ${nameOf(city)}: ${a?.expand?.length ?? 0} tiles offered, ${a?.specialists?.length ?? 0} specialist slots${city.isTown ? " (town)" : ""}`);
    }
    return out;
}

// ---- towns -------------------------------------------------------------------------------

/** Growing towns at population 7+ that feed a city take the recommended Focus. */
export function setTownFocus(settings) {
    const out = [];
    const towns = safe(() => runTownAdvisor(settings), null);
    for (const row of towns?.rows ?? []) {
        const f = row.focus;
        const b = f?.best;
        if (!b || b.current || !b.availableNow || f.current !== "GROWTH" || row.town.pop < FOCUS_POPULATION) continue;
        if (f.notes.some((n) => n.key === "LOC_XPL_FOCUS_NOT_CONNECTED")) continue; // its food would feed nobody
        const r = applyTownFocus(row.town.id, b.project);
        if (r.ok) out.push({ key: "FOCUS", args: [row.town.name, Locale.compose(GameInfo.Projects?.lookup?.(b.project)?.Name ?? b.project)] });
    }
    return out;
}

/**
 * Cities and towns 1 to 1: while towns outnumber cities, the best town becomes a city when the
 * gold above the reserve pays for it (towns the autopilot founded on a "CITY" site first,
 * then the Towns tab's verdict CONVERT, CONSIDER, the rest; never BLOCKED). Same command as
 * the game's "convert to city" (production-chooser-operations.js). @returns log entries
 */
export function convertTowns(settings, reserveTurns) {
    const stats = safe(() => Players.get(pid()).Stats, null);
    const cities = Number(stats?.numCities) || 0;
    const towns = Number(stats?.numTowns) || 0;
    if (towns <= cities) return [];
    const rows = safe(() => runTownAdvisor(settings), null)?.rows ?? [];
    const rank = { CONVERT: 0, CONSIDER: 1, WAIT: 2, KEEP: 3 };
    const order = (r) => (plannedRoleAt(r.town.x, r.town.y) === "CITY" ? -1 : rank[r.advice?.verdict] ?? 4);
    const candidates = rows.filter((r) => r.town.canConvert && r.town.cost > 0 && r.advice?.verdict !== "BLOCKED").sort((a, b) => order(a) - order(b) || a.town.cost - b.town.cost);
    const income = Number(safe(() => Players.get(pid()).Stats.getNetYield(YieldTypes.YIELD_GOLD), 0)) || 0;
    const spare = goldBalance() - Math.max(0, reserveTurns) * Math.max(0, income);
    const pick = candidates.find((r) => r.town.cost <= spare);
    if (!pick) return [];
    const args = { Directive: OrderTypes.ORDER_TOWN_UPGRADE };
    if (!safe(() => Game.CityCommands.canStart(pick.town.id, CityCommandTypes.PURCHASE, args, false), null)?.Success) return [];
    Game.CityCommands.sendRequest(pick.town.id, CityCommandTypes.PURCHASE, args);
    return [{ key: "TOWN_CONVERTED", args: [pick.town.name, pick.town.cost] }];
}

// ---- purchases -------------------------------------------------------------------------

/** Buys the best-value planned buildings, keeping `reserveTurns` turns of gold income. */
export function buyBuildings(settings, reserveTurns) {
    const out = [];
    const plans = state.get().results.plans;
    if (!plans) return out;
    const income = Number(safe(() => Players.get(pid()).Stats.getNetYield(YieldTypes.YIELD_GOLD), 0)) || 0;
    let budget = goldBalance() - Math.max(0, income) * reserveTurns;
    const advice = purchaseAdvice(plans, settings, 12);
    for (const pick of advice.picks) {
        if (out.length >= MAX_PURCHASES) break;
        if (pick.cost > budget) continue;
        if (buyPlanned(pick)) {
            budget -= pick.cost;
            out.push({ key: "BOUGHT", args: [pick.name, pick.settlementName, Math.round(pick.cost)] });
        }
    }
    return out;
}

// ---- units and the turn ----------------------------------------------------------------

/** Idle units skip this turn (never moved). */
/**
 * Idle units skip this turn: every unit waiting for orders, then whatever the game still
 * calls ready. `ordered`: keys ("owner:id") of units just given an order; a skip would
 * cancel it.
 */
export function skipIdleUnits(ordered = new Set()) {
    let skipped = 0;
    const done = new Set(ordered);
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (skipped >= MAX_UNIT_SKIPS) break;
        const key = unitKey(u.id);
        if (done.has(key) || !isIdle(u)) continue;
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
    for (let i = 0; i < MAX_UNIT_SKIPS; i++) {
        const id = safe(() => UI.Player.getFirstReadyUnit(), null);
        if (!id || (last && JSON.stringify(id) === JSON.stringify(last))) break;
        if (done.has(unitKey(id))) break; // the game has not taken that order yet
        last = id;
        const ok = safe(() => Game.UnitOperations.canStart(id, "UNITOPERATION_SKIP_TURN", NO_TARGET, false), null);
        if (!ok?.Success) break;
        Game.UnitOperations.sendRequest(id, "UNITOPERATION_SKIP_TURN", { ...NO_TARGET });
        skipped++;
    }
    return skipped > 0 ? [{ key: "UNITS_SKIPPED", args: [skipped] }] : [];
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

