/**
 * Autopilot unit orders, each one opt-in because they move units:
 *  - explore: scouts (UNIT_CLASS_AUTOEXPLORE) explore by themselves;
 *  - settlers: walk to the best site of the Settlements tab (else the game's own suggestion)
 *    and found it;
 *  - defend: idle military units shoot at an enemy in range, else heal when hurt, else fortify;
 *  - merchants: the best trade route, in the trade screen's own order (most imported
 *    resources first), then the yields it sends us weighed by the chosen priority;
 *  - roam: military units other than one garrison per city go exploring (the game's
 *    automatic exploring if it allows, else a random tile at the edge of the fog);
 *  - under threat (defend or roam): soldiers away from a threatened settlement that lacks
 *    defenders walk there;
 *  - settlers: also migrants («Мигрант») join the settlement they stand in, else walk to our nearest one;
 * Land units never walk across deep ocean while it hurts them (Exploration, before Shipbuilding);
 * plus promotions for units that have earned one (a choice that holds the turn).
 * Only units waiting for orders are touched (a unit already moving, exploring or fortified
 * is left alone), and no order may start a war. Returns log entries { key, args } like the
 * steps in xpl-autopilot-steps.js, plus the units it gave orders to (`ordered`).
 */
import { getProfile } from '../core/xpl-profiles.js';
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { growthAdvice } from './xpl-growth-job.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

// The parameters the game's unit panel sends for an untargeted operation (unit-actions.js).
export const NO_TARGET = Object.freeze({ X: -9999, Y: -9999, UnitAbilityType: -1 });
const SETTLE_MAX_TURNS = 10;     // a site further away than this is not walked to
const AI_SITE_SUGGESTIONS = 3;   // the game's suggestions asked for when we have no site
const ROAM_RADIUS = 6;           // how far a roaming unit looks for the edge of the fog
const ROAM_MAX_TURNS = 3;        // ...and how far it walks for it
const ROAM_TRIES = 8;            // random candidates tried before giving up
const DISCOVERY_RADIUS = 8;      // scouts head for a discovery (cave, ruins, campfire...) this close...
const DISCOVERY_MAX_TURNS = 4;   // ...that they reach in this many turns
const SCOUT_RADIUS = 10;         // scouts look further for the edge of the fog...
const SCOUT_MAX_TURNS = 5;       // ...and walk further for it
export const THREAT_RADIUS = 4;  // hostile military units this close to a settlement...
export const THREAT_MIN = 2;     // ...this many of them: the settlement is threatened
const APPROACH_DISTANCE = 2;     // how close a unit walks to an independent's settlement
const BORDER_RADIUS = 2;         // an explorer this close to a civilization's land: ask for open borders
const REINFORCE_RADIUS = 2;      // defenders of a threatened settlement stand this close to it...
const REINFORCE_MAX_TURNS = 8;   // ...walking at most this many turns to get there
const REINFORCE_TRIES = 6;       // free tiles tried there, nearest first
const MIGRANT_MAX_TURNS = 10;    // a migrant walks at most this far to join a city
const MAX_UNIT_ORDERS = 40;

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
const truthy = (v) => v === true || v === 1 || v === "true";
export const unitKey = (id) => `${id?.owner}:${id?.id}`;
const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
const nameOf = (def) => safe(() => Locale.compose(def.Name), def?.UnitType ?? "?");

// Where each settler or merchant was sent (unit key -> goal), so it keeps its goal next turn.
const goals = new Map();
// Sites a settler's order to walk to did not take ("unit key" -> Set of "x,y"): not again.
const failedSites = new Map();
// The role planned for settlements we founded ("x,y" -> "CITY" | "TOWN"): a "CITY" one is a
// town the autopilot converts (they are all founded as towns).
const foundedRoles = new Map();

export function resetUnitGoals() {
    goals.clear();
    foundedRoles.clear();
    failedSites.clear();
}

/**
 * Orders the game did not carry out: units still waiting for orders on the tile where they got
 * one (seen in game: a settler sent toward a site three times in a turn, never moving, so the
 * turn waited on NOTIFICATION_COMMAND_UNITS). They are released (the skip step may skip them)
 * and their goal is dropped; a settler does not try that site again.
 * @param orderedAt Map unit key -> { x, y } where the order was given
 * @returns the released unit keys
 */
export function releaseStuckOrders(orderedAt) {
    const released = [];
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const k = unitKey(u.id);
        const at = orderedAt.get(k);
        if (!at || !isIdle(u) || !same(u.location, at)) continue;
        const g = goals.get(k);
        if (g?.x !== undefined) {
            if (!failedSites.has(k)) failedSites.set(k, new Set());
            failedSites.get(k).add(`${g.x},${g.y}`);
        }
        goals.delete(k);
        released.push(k);
    }
    return released;
}

/** The role planned where the autopilot founded a settlement, or null. */
export function plannedRoleAt(x, y) {
    return foundedRoles.get(`${x},${y}`) ?? null;
}

let tagIndex = null;
function hasTag(def, tag) {
    if (!tagIndex) {
        tagIndex = new Set();
        for (const t of GameInfo.TypeTags ?? []) tagIndex.add(`${t.Type}|${t.Tag}`);
    }
    return tagIndex.has(`${def.UnitType}|${tag}`);
}

/** Units waiting for orders: on the map, moves left, not busy with an order or asleep. */
export function isIdle(u) {
    if (!u || u.isOnMap === false || u.isDead === true) return false;
    if (u.canMove === false || u.hasMoved === true) return false;
    const A = globalThis.UnitActivityTypes;
    if (!A || u.activityType === undefined) return true;
    return u.activityType === A.NONE || u.activityType === A.AWAKE;
}

function startsWar(u, loc) {
    const r = safe(() => Players.get(pid()).Diplomacy.willMoveStartWar(u.id, { x: loc.x, y: loc.y }), null);
    const none = globalThis.PlayerIds?.NO_PLAYER ?? -1;
    return !!(r?.Success && r.Player2 !== undefined && r.Player2 !== none);
}

function operate(u, op, args = NO_TARGET) {
    if (!safe(() => Game.UnitOperations.canStart(u.id, op, args, false), null)?.Success) return false;
    Game.UnitOperations.sendRequest(u.id, op, { ...args });
    return true;
}

function moveTo(u, loc) {
    if (startsWar(u, loc)) return false;
    const op = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    return operate(u, op, { X: loc.x, Y: loc.y, Modifiers: globalThis.UnitOperationMoveModifiers?.MOVE_IGNORE_UNEXPLORED_DESTINATION ?? 0 });
}

/**
 * Rough seas: in the Exploration age, until Shipbuilding, deep ocean (TERRAIN_OCEAN) ends a
 * land unit's move on every tile and damages it each turn it ends there (the game's rules:
 * PLOT_WATER_DAMAGE_*, MOD_TECH_EX_NO_OCEAN_OBSTACLE / _DAMAGE). Seen in game: a settler sent
 * 10 turns across the ocean to a distant site. Coast (shallow water) is fine.
 */
function roughSeas() {
    if (safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null) !== "AGE_EXPLORATION") return false;
    return !safe(() => Players.get(pid()).Techs.isNodeUnlocked("NODE_TECH_EX_SHIPBUILDING"), false);
}

/** Does this land unit's path cross deep ocean while the seas are rough? (Its own tile aside.) */
function crossesRoughSeas(u, plots) {
    if (safe(() => GameInfo.Units.lookup(u.type)?.Domain, null) !== "DOMAIN_LAND" || !roughSeas()) return false;
    const start = safe(() => GameplayMap.getIndexFromXY(u.location.x, u.location.y), -1);
    return plots.some((idx) => {
        if (idx === start) return false;
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        const terrain = loc ? safe(() => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(loc.x, loc.y))?.TerrainType, null) : null;
        return terrain === "TERRAIN_OCEAN";
    });
}

/** Turns to walk there (0 = here), or null when unreachable (or only across rough seas). */
function pathTurns(u, loc) {
    if (same(u.location, loc)) return 0;
    const r = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
    if (!r?.plots?.length) return null;
    if (crossesRoughSeas(u, r.plots)) return null;
    const t = Number(r.turns?.[r.turns.length - 1]);
    return Number.isFinite(t) ? t : r.plots.length;
}

// ---- scouts ---------------------------------------------------------------------------------

/**
 * A revealed plot with a discovery (Constructibles.Discovery: cave, ruins, campfire, tents,
 * plaza, cairn, wreckage...; the game's discovery lens): a unit stepping on it gets its event.
 */
function hasDiscovery(loc) {
    if (safe(() => GameplayMap.getRevealedState(pid(), loc.x, loc.y), 0) === RevealedStates.HIDDEN) return false;
    for (const id of safe(() => MapConstructibles.getHiddenFilteredConstructibles(loc.x, loc.y), []) ?? []) {
        const c = safe(() => Constructibles.getByComponentID(id), null);
        const d = c ? safe(() => GameInfo.Constructibles.lookup(c.type), null) : null;
        if (d && (d.Discovery === true || d.Discovery === "true")) return true;
    }
    return false;
}

/** The nearest discovery this unit reaches in `maxTurns`, not one another unit goes to. */
function toDiscovery(u, def, ctx, radius, maxTurns) {
    const here = u.location;
    const found = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.discoveries.has(`${loc.x},${loc.y}`) || !hasDiscovery(loc)) continue;
        found.push({ loc, d: safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), radius) });
    }
    found.sort((a, b) => a.d - b.d);
    for (const { loc } of found.slice(0, ROAM_TRIES)) {
        const t = pathTurns(u, loc);
        if (t === null || t > maxTurns || startsWar(u, loc) || !moveTo(u, loc)) continue;
        ctx.discoveries.add(`${loc.x},${loc.y}`);
        goals.set(unitKey(u.id), { discovery: `${loc.x},${loc.y}` });
        return { key: "DISCOVERY", args: [nameOf(def), loc.x, loc.y] };
    }
    return null;
}

function explore(u, def, ctx) {
    if (!hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) return null;
    const found = toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
    if (found) return found;
    if (operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) return { key: "EXPLORE", args: [nameOf(def)] };
    // The game's automatic exploring is not offered (seen in game when its reach is explored):
    // walk to the edge of the fog ourselves, further than military units do.
    return toFrontier(u, def, ctx, SCOUT_RADIUS, SCOUT_MAX_TURNS);
}

// ---- settlers -------------------------------------------------------------------------------

function siteStillFree(loc) {
    const revealed = safe(() => GameplayMap.getRevealedState(pid(), loc.x, loc.y) !== RevealedStates.HIDDEN, true);
    if (!revealed) return true; // the game answers "no" on unexplored plots (it does not know yet)
    return safe(() => !!Players.get(pid()).Diplomacy.isValidLandClaimLocation({ x: loc.x, y: loc.y }, true), true);
}

/**
 * The role the next settlement should have so cities and towns stay 1 to 1, counting the
 * sites settlers are already walking to (a "CITY" site is founded as a town and converted).
 */
export function neededRole() {
    const stats = safe(() => Players.get(pid()).Stats, null);
    let cities = Number(stats?.numCities) || 0;
    let towns = Number(stats?.numTowns) || 0;
    for (const g of goals.values()) {
        if (g.role === "CITY") cities++;
        else if (g.role === "TOWN") towns++;
    }
    return cities <= towns ? "CITY" : "TOWN";
}

/** The best free site this settler reaches in time: our ranked sites (the role we need
 * first, see neededRole), else the game's. */
function pickSite(u, taken) {
    const failed = failedSites.get(unitKey(u.id)) ?? new Set();
    const ok = (loc) => loc && !taken.has(`${loc.x},${loc.y}`) && !failed.has(`${loc.x},${loc.y}`) && siteStillFree(loc) && !startsWar(u, loc);
    const reachable = (loc) => {
        const t = pathTurns(u, loc);
        return t !== null && t <= SETTLE_MAX_TURNS ? t : null;
    };
    const picks = state.get().results.sites?.picks ?? [];
    const want = neededRole();
    const ordered = [...picks.filter((p) => (p.role ?? want) === want), ...picks.filter((p) => (p.role ?? want) !== want)];
    for (const p of ordered) {
        const loc = { x: p.x, y: p.y };
        if (!ok(loc)) continue;
        const t = reachable(loc);
        if (t !== null) return { ...loc, turns: t, source: "PLAN", role: p.role ?? null };
    }
    const ai = safe(() => Players.get(pid()).AI.getBestSettleLocationsForSettler(AI_SITE_SUGGESTIONS, u.location), []) ?? [];
    for (const s of ai) {
        const loc = s?.location ? { x: s.location.x, y: s.location.y } : null;
        if (!ok(loc)) continue;
        const t = reachable(loc);
        if (t !== null) return { ...loc, turns: t, source: "AI" };
    }
    return null;
}

function settle(u, def, taken) {
    if (!truthy(def.FoundCity)) return null;
    const k = unitKey(u.id);
    let goal = goals.get(k);
    if (goal && !siteStillFree(goal)) goal = null;
    if (!goal) goal = pickSite(u, taken);
    if (!goal) {
        goals.delete(k);
        return null; // nothing reachable: left to the player
    }
    taken.add(`${goal.x},${goal.y}`);
    if (same(u.location, goal)) {
        goals.delete(k);
        if (!operate(u, "UNITOPERATION_FOUND_CITY")) return null;
        if (goal.role) foundedRoles.set(`${goal.x},${goal.y}`, goal.role);
        return { key: "SETTLE_FOUND", args: [nameOf(def), goal.x, goal.y] };
    }
    goals.set(k, goal);
    if (!moveTo(u, goal)) return null;
    return { key: "SETTLE_MOVE", args: [nameOf(def), goal.x, goal.y, pathTurns(u, goal) ?? goal.turns ?? "?"] };
}

/** Sites settlers are walking to, with the role planned there (for map tacks). */
export function settlerGoals() {
    return [...goals.values()].filter((g) => g.x !== undefined).map((g) => ({ x: g.x, y: g.y, role: g.role ?? null }));
}

// ---- military -------------------------------------------------------------------------------

function damageAt(loc) {
    let worst = 0;
    for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
        worst = Math.max(worst, Number(safe(() => Units.get(id).Health.damage, 0)) || 0);
    }
    return worst;
}

/** A ranged shot at the most damaged enemy in range (a kill frees the tile). */
function rangedAttack(u, def) {
    if (u.Combat && !(Number(u.Combat.attacksRemaining) > 0)) return null;
    const op = globalThis.UnitOperationTypes?.RANGE_ATTACK ?? "UNITOPERATION_RANGE_ATTACK";
    const r = safe(() => Game.UnitOperations.canStart(u.id, op, {}, false), null);
    if (!r?.Success || !r.Plots?.length || r.Modifiers?.length !== r.Plots.length) return null;
    const none = globalThis.OperationPlotModifiers?.NONE ?? 0;
    let best = null;
    for (let i = 0; i < r.Plots.length; i++) {
        if (r.Modifiers[i] === none) continue;
        const loc = safe(() => GameplayMap.getLocationFromIndex(r.Plots[i]), null);
        if (!loc || startsWar(u, loc)) continue;
        const dmg = damageAt(loc);
        if (!best || dmg > best.dmg) best = { loc, dmg };
    }
    if (!best) return null;
    Game.UnitOperations.sendRequest(u.id, op, { X: best.loc.x, Y: best.loc.y });
    return { key: "RANGED", args: [nameOf(def), best.loc.x, best.loc.y] };
}

const STEP_ASIDE_RADIUS = 3;      // a crowded city (units all around): look a little further...
const STEP_ASIDE_MAX_TURNS = 2;   // ...a move that starts this turn takes it off the shared tile

/** May a military unit end up here? No other military unit, nobody else's unit (that is a capture or an attack). */
function roomForSoldier(loc) {
    for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
        const other = safe(() => Units.get(id), null);
        if (!other || other.owner !== pid()) return false;
        if (safe(() => GameInfo.Units.lookup(other.type).CoreClass, null) === "CORE_CLASS_MILITARY") return false;
    }
    return true;
}

/**
 * Only moving is allowed: two military units share a tile (a unit the city just trained
 * appears under the one standing there; seen in game: allowed = EXECUTE_SCRIPT, MOVE_TO,
 * WAIT_FOR). One of them steps to the nearest free tile it reaches this turn, our own land
 * first; the others on that tile wait until the move is done (the end-of-turn retry).
 */
function stepAside(u, def, ctx) {
    if (safe(() => Game.UnitOperations.canStart(u.id, "UNITOPERATION_SKIP_TURN", NO_TARGET, false), null)?.Success) return null;
    const here = u.location;
    const tile = `${here.x},${here.y}`;
    if (ctx.unstacked.has(tile)) return null;
    let best = null;
    const why = { occupied: 0, noPath: 0, far: 0, war: 0 };
    for (let r = 1; r <= STEP_ASIDE_RADIUS && !best; r++) {
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, r), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
            if (!roomForSoldier(loc)) {
                why.occupied++;
                continue;
            }
            const turns = pathTurns(u, loc);
            if (turns === null) why.noPath++;
            else if (turns > STEP_ASIDE_MAX_TURNS) why.far++;
            else if (startsWar(u, loc)) why.war++;
            if (turns === null || turns > STEP_ASIDE_MAX_TURNS || startsWar(u, loc)) continue;
            const own = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid();
            const dist = safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), r);
            const score = (own ? 0 : 10) + dist;
            if (!best || score < best.score) best = { loc, score };
        }
    }
    if (!best || !moveTo(u, best.loc)) {
        // Nowhere to go: join the army of a commander there (a soldier may share a commander's
        // tile only inside its army), as the unit panel's "add to army" does.
        const joined = joinArmy(u, def);
        if (joined) {
            ctx.unstacked.add(tile);
            return joined;
        }
        // Boxed in by our own soldiers: a neighbour steps out; this one moves in on the retry.
        if (!best && makeRoom(u, def, ctx)) {
            ctx.unstacked.add(tile);
            return null;
        }
        log.info(`autopilot: ${def.UnitType} at ${here.x},${here.y} cannot step aside: ${best ? "move refused" : JSON.stringify(why)}`);
        return null;
    }
    ctx.unstacked.add(tile);
    ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
    return { key: "STEP_ASIDE", args: [nameOf(def), best.loc.x, best.loc.y] };
}

const isSoldier = (def) => def?.CoreClass === "CORE_CLASS_MILITARY";

/**
 * Boxed in (seen in game: a crossbowman trained in a city where every tile within 3 held one of
 * our soldiers or could not be reached): a neighbouring soldier of ours that may still move
 * steps out to a free tile next to it. Its order is this pass's; the stacked unit gets none
 * now and moves into the freed tile in the end-of-turn retry. @returns true when one moved
 */
function makeRoom(u, def, ctx) {
    const here = u.location;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, 1), []) ?? []) {
        const spot = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!spot || same(spot, here)) continue;
        const there = (safe(() => MapUnits.getUnits(spot.x, spot.y), []) ?? []).map((id) => safe(() => Units.get(id), null));
        if (there.some((o) => !o || o.owner !== pid())) continue; // someone else's unit
        const soldiers = there.filter((o) => isSoldier(safe(() => GameInfo.Units.lookup(o.type), null)));
        if (soldiers.length !== 1) continue;
        const n = soldiers[0];
        const k = unitKey(n.id);
        if (n.isCommanderUnit || n.canMove === false || n.hasMoved === true || ctx.ordered.has(k)) continue;
        for (const j of safe(() => GameplayMap.getPlotIndicesInRadius(spot.x, spot.y, 1), []) ?? []) {
            const to = safe(() => GameplayMap.getLocationFromIndex(j), null);
            if (!to || same(to, spot) || same(to, here) || ctx.stepTo.has(`${to.x},${to.y}`) || !roomForSoldier(to)) continue;
            const turns = pathTurns(n, to);
            if (turns === null || turns > 1 || startsWar(n, to) || !moveTo(n, to)) continue;
            ctx.stepTo.add(`${to.x},${to.y}`);
            ctx.ordered.add(k);
            ctx.entries.push({ key: "MADE_ROOM", args: [nameOf(safe(() => GameInfo.Units.lookup(n.type), null)), nameOf(def)] });
            return true;
        }
    }
    return false;
}

/** "Add to army": directly, or on the first tile the game offers for it (the commander's). */
function joinArmy(u, def) {
    const ADD = "UNITCOMMAND_ADD_TO_ARMY";
    const r = safe(() => Game.UnitCommands.canStart(u.id, ADD, NO_TARGET, false), null);
    let args = null;
    if (r?.Success) args = { ...NO_TARGET };
    else if (r?.Plots?.length) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(r.Plots[0]), null);
        if (loc && safe(() => Game.UnitCommands.canStart(u.id, ADD, { ...NO_TARGET, X: loc.x, Y: loc.y }, false), null)?.Success) args = { ...NO_TARGET, X: loc.x, Y: loc.y };
    }
    if (!args) return null;
    Game.UnitCommands.sendRequest(u.id, ADD, args);
    return { key: "JOINED_ARMY", args: [nameOf(def)] };
}

/** A revealed land tile next to unexplored ones: where a roaming unit learns most. */
function isFrontier(loc, landUnit) {
    if (safe(() => GameplayMap.getRevealedState(pid(), loc.x, loc.y), 0) === RevealedStates.HIDDEN) return false;
    if (landUnit && safe(() => GameplayMap.isWater(loc.x, loc.y), false)) return false;
    if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) return false;
    const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
    if (owner !== -1 && owner !== null && owner !== pid()) return false; // someone's land: borders, war
    if ((safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).length > 0) return false;
    return (safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, 1), []) ?? []).some((i) => {
        const n = safe(() => GameplayMap.getLocationFromIndex(i), null);
        return n && safe(() => GameplayMap.getRevealedState(pid(), n.x, n.y), 0) === RevealedStates.HIDDEN;
    });
}

/** A military unit goes exploring: the game's automatic exploring, else the edge of the fog. */
function roam(u, def, ctx) {
    const found = toDiscovery(u, def, ctx, ROAM_RADIUS, ROAM_MAX_TURNS);
    if (found) return found;
    if (operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) return { key: "EXPLORE", args: [nameOf(def)] };
    return toFrontier(u, def, ctx, ROAM_RADIUS, ROAM_MAX_TURNS);
}

/** A random revealed tile next to the fog within `radius`, reached in at most `maxTurns`. */
function toFrontier(u, def, ctx, radius, maxTurns) {
    const here = u.location;
    const land = def.Domain !== "DOMAIN_SEA";
    const candidates = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (isFrontier(loc, land)) candidates.push(loc);
    }
    // A random direction: shuffle, then the first one reachable soon without war.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const loc of candidates.slice(0, ROAM_TRIES)) {
        const t = pathTurns(u, loc);
        if (t === null || t > maxTurns || startsWar(u, loc)) continue;
        if (!moveTo(u, loc)) continue;
        ctx.stepTo.add(`${loc.x},${loc.y}`);
        return { key: "ROAM", args: [nameOf(def), loc.x, loc.y] };
    }
    return null;
}

/**
 * Major civilizations whose land is within BORDER_RADIUS of our scouts or roaming military:
 * the autopilot asks them for open borders so exploring can go on.
 */
export function leadersNearExplorers({ explore = false, roam = false } = {}) {
    const leaders = new Set();
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || !((explore && hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) || (roam && def.CoreClass === "CORE_CLASS_MILITARY"))) continue;
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(u.location.x, u.location.y, BORDER_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            const owner = loc ? safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) : -1;
            if (owner === null || owner < 0 || owner === pid() || leaders.has(owner)) continue;
            const p = safe(() => Players.get(owner), null);
            if (p && !p.isIndependent && p.isMajor !== false) leaders.add(owner);
        }
    }
    return [...leaders];
}

// ---- upgrades -------------------------------------------------------------------------------

const MAX_UPGRADES = 3; // per pass

/**
 * Military units the game lets us upgrade now (UNITCOMMAND_UPGRADE: the next tier of the
 * same class, +5 Combat Strength, paid in gold; the game refuses it without the gold), not
 * while moving, while gold stays above `floor` (the reserve). Units of threatened settlements
 * first. The game gives no price beforehand, so at most MAX_UPGRADES a pass.
 * @param floor gold to keep; @param threats threatenedSettlements()
 */
export function upgradeUnits(floor, threats = []) {
    const out = [];
    const UPGRADE = "UNITCOMMAND_UPGRADE";
    const A = globalThis.UnitActivityTypes;
    const gold = () => Number(safe(() => Players.Treasury?.get?.(pid())?.goldBalance, null) ?? safe(() => Players.get(pid()).Treasury.goldBalance, 0)) || 0;
    const near = (u) => threats.some((t) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, t.settlement.x, t.settlement.y), 99) <= THREAT_RADIUS);
    const candidates = (safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])
        .filter((u) => safe(() => GameInfo.Units.lookup(u.type).CoreClass, null) === "CORE_CLASS_MILITARY" && !u.isCommanderUnit)
        .filter((u) => !A || u.activityType !== A.OPERATION)
        .sort((a, b) => Number(near(b)) - Number(near(a)));
    for (const u of candidates) {
        if (out.length >= MAX_UPGRADES || gold() <= floor) break;
        if (!safe(() => Game.UnitCommands.canStart(u.id, UPGRADE, NO_TARGET, false), null)?.Success) continue;
        Game.UnitCommands.sendRequest(u.id, UPGRADE, { ...NO_TARGET });
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const to = GameInfo.UnitUpgrades?.find((r) => r.Unit === def?.UnitType)?.UpgradeUnit;
        out.push({ key: "UPGRADED", args: [nameOf(def), to ? safe(() => Locale.compose(GameInfo.Units.lookup(to).Name), to) : "?"] });
    }
    return out;
}

// ---- threats --------------------------------------------------------------------------------

/**
 * Is this (other player's) unit a hostile military one? An independent power's units count
 * while that power is not friendly to us (Game.IndependentPowers, as its unit flags show it);
 * a major player's while we are at war with it. @returns the independent's id, the owner, or null
 */
function hostileOwner(unit) {
    if (!unit || unit.owner === pid()) return null;
    const def = safe(() => GameInfo.Units.lookup(unit.type), null);
    if (def?.CoreClass !== "CORE_CLASS_MILITARY") return null;
    const owner = safe(() => Players.get(unit.owner), null);
    if (owner?.isIndependent) {
        const indep = safe(() => Game.IndependentPowers.getIndependentPlayerIDFromUnit(unit.id), unit.owner);
        const rel = safe(() => Game.IndependentPowers.getIndependentRelationship(indep, pid()), null);
        const R = globalThis.IndependentRelationship;
        if (R && (rel === R.FRIENDLY || rel === R.NOT_APPLICABLE)) return null;
        return { id: indep, independent: true };
    }
    return safe(() => Players.get(pid()).Diplomacy.isAtWarWith(unit.owner), false) ? { id: unit.owner, independent: false } : null;
}

/**
 * Our settlements with THREAT_MIN or more hostile military units within THREAT_RADIUS:
 * [{ settlement: { x, y, name }, count, owners: [{ id, independent }] }], most threatened first.
 */
export function threatenedSettlements() {
    const out = [];
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const seen = new Set();
        const owners = new Map();
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(c.location.x, c.location.y, THREAT_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
                const k = unitKey(id);
                if (seen.has(k)) continue;
                const h = hostileOwner(safe(() => Units.get(id), null));
                if (!h) continue;
                seen.add(k);
                owners.set(h.id, h);
            }
        }
        if (seen.size >= THREAT_MIN) out.push({ settlement: { x: c.location.x, y: c.location.y, name: safe(() => Locale.compose(c.name), "?") }, count: seen.size, owners: [...owners.values()] });
    }
    return out.sort((a, b) => b.count - a.count);
}

/**
 * Toward an independent we cannot befriend yet (the game does not offer it: not met, or its
 * settlement unseen): the nearest free tile APPROACH_DISTANCE from its settlement, so the
 * project opens up. Never onto its settlement (that would be an attack).
 */
function approach(u, def, ctx) {
    for (const indep of ctx.approach) {
        if (ctx.approached.has(indep)) continue;
        const towns = safe(() => Players.get(indep).Cities.getCities(), []) ?? [];
        let best = null;
        for (const t of towns) {
            for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(t.location.x, t.location.y, APPROACH_DISTANCE), []) ?? []) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
                if (!loc || safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, t.location.x, t.location.y), 0) < APPROACH_DISTANCE) continue;
                if ((safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).length > 0 || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
                const d = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), Infinity);
                if (!best || d < best.d) best = { loc, d };
            }
        }
        if (!best || pathTurns(u, best.loc) === null || startsWar(u, best.loc) || !moveTo(u, best.loc)) continue;
        ctx.approached.add(indep);
        ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
        return { key: "APPROACH", args: [nameOf(def), safe(() => Locale.compose(Players.get(indep).civilizationName ?? Players.get(indep).name), String(indep))] };
    }
    return null;
}

/**
 * Our soldiers guarding a threatened settlement: within THREAT_RADIUS of it, or on their way
 * there (their goal). Defenders are trained only while fewer than its hostile units.
 */
export function guardsFor(threat, units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
    const s = threat.settlement;
    const key = `${s.x},${s.y}`;
    let n = 0;
    for (const u of units) {
        if (u.isCommanderUnit || !isSoldier(safe(() => GameInfo.Units.lookup(u.type), null))) continue;
        const d = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, s.x, s.y), Infinity);
        if (d <= THREAT_RADIUS || goals.get(unitKey(u.id))?.guard === key) n++;
    }
    return n;
}

const guarding = (u, ctx) => ctx.threats.some((t) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, t.settlement.x, t.settlement.y), Infinity) <= THREAT_RADIUS);

/**
 * A soldier away from every threatened settlement walks to one that has fewer of our soldiers
 * than hostile units (most threatened first): a free tile within REINFORCE_RADIUS of it, our
 * land or nobody's. Seen in game: defenders trained for a threatened town stayed around the
 * city that trained them, the town never counted them, and the city kept training more until
 * every tile around it held one (a new unit then had nowhere to stand).
 */
function reinforce(u, def, ctx) {
    if (ctx.threats.length === 0 || ctx.garrison.has(unitKey(u.id)) || u.isCommanderUnit || def.Domain !== "DOMAIN_LAND") return null;
    if (guarding(u, ctx)) return null;
    for (const t of ctx.threats) {
        const s = t.settlement;
        const key = `${s.x},${s.y}`;
        if ((ctx.need.get(key) ?? 0) <= 0) continue;
        const tiles = [];
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, REINFORCE_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || ctx.stepTo.has(`${loc.x},${loc.y}`) || !roomForSoldier(loc)) continue;
            if (safe(() => GameplayMap.isWater(loc.x, loc.y), false) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
            const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
            if (owner !== -1 && owner !== null && owner !== pid()) continue;
            const near = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, s.x, s.y), 0);
            const far = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), 0);
            tiles.push({ loc, score: near * 100 + far });
        }
        tiles.sort((a, b) => a.score - b.score);
        for (const { loc } of tiles.slice(0, REINFORCE_TRIES)) {
            const turns = pathTurns(u, loc);
            if (turns === null || turns > REINFORCE_MAX_TURNS || !moveTo(u, loc)) continue;
            ctx.stepTo.add(`${loc.x},${loc.y}`);
            ctx.need.set(key, ctx.need.get(key) - 1);
            goals.set(unitKey(u.id), { guard: key });
            return { key: "REINFORCE", args: [nameOf(def), s.name] };
        }
    }
    return null;
}

/**
 * A unit that has earned a promotion (commanders: NOTIFICATION_UNIT_PROMOTION_AVAILABLE holds
 * the turn) takes the first one it can earn, discipline by discipline in the game's order.
 * Same data and command as the game's promotion panel (panel-unit-promotion.js).
 */
export function promoteUnits() {
    const out = [];
    const PROMOTE = globalThis.UnitCommandTypes?.PROMOTE;
    if (PROMOTE === undefined) return out;
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const exp = u.Experience;
        if (!exp?.canPromote) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def) continue;
        const options = [];
        GameInfo.UnitPromotionClassSets?.forEach((set) => {
            if (set.PromotionClassType !== def.PromotionClass) return;
            GameInfo.UnitPromotionDisciplineDetails?.filter((d) => d.UnitPromotionDisciplineType === set.UnitPromotionDisciplineType)
                .forEach((d) => options.push({ discipline: set.UnitPromotionDisciplineType, promotion: d.UnitPromotionType }));
        });
        for (const o of options) {
            const promo = safe(() => GameInfo.UnitPromotions.lookup(o.promotion), null);
            if (!promo || promo.Commendation === true || promo.Commendation === "true") continue;
            if (safe(() => exp.hasPromotion(o.discipline, o.promotion), false)) continue;
            if (!safe(() => exp.canEarnPromotion(o.discipline, o.promotion, false), false)) continue;
            const args = { PromotionType: Database.makeHash(o.promotion), PromotionDisciplineType: Database.makeHash(o.discipline) };
            if (!safe(() => Game.UnitCommands.canStart(u.id, PROMOTE, args, false), null)?.Success) continue;
            Game.UnitCommands.sendRequest(u.id, PROMOTE, args);
            out.push({ key: "PROMOTED", args: [nameOf(def), safe(() => Locale.compose(promo.Name), o.promotion)] });
            break;
        }
    }
    return out;
}

function defend(u, def, ctx) {
    if (def.CoreClass !== "CORE_CLASS_MILITARY") return null;
    const shot = rangedAttack(u, def);
    if (shot) return shot;
    if (Number(u.Health?.damage) > 0 && operate(u, "UNITOPERATION_REST_UNTIL_HEALED")) return { key: "HEAL", args: [nameOf(def)] };
    const sent = reinforce(u, def, ctx);
    if (sent) return sent;
    // A threatening independent we cannot befriend yet: one unit walks toward it (not a garrison).
    if (ctx.approach.length > 0 && !ctx.garrison.has(unitKey(u.id))) {
        const e = approach(u, def, ctx);
        if (e) return e;
    }
    if (operate(u, "UNITOPERATION_FORTIFY")) return { key: "FORTIFY", args: [nameOf(def)] };
    // The game may refuse to fortify (seen in a new capital): stand guard, woken by enemies.
    if (operate(u, "UNITOPERATION_ALERT")) return { key: "ALERT", args: [nameOf(def)] };
    return stepAside(u, def, ctx);
}

/** The operations and commands the game allows this unit now (for the log when nothing else worked). */
export function allowedOperations(u) {
    const out = [];
    for (const op of GameInfo.UnitOperations ?? []) {
        const type = op.OperationType ?? op.UnitOperationType;
        if (type && safe(() => Game.UnitOperations.canStart(u.id, type, NO_TARGET, false), null)?.Success) out.push(type.replace("UNITOPERATION_", ""));
    }
    for (const c of GameInfo.UnitCommands ?? []) {
        const type = c.CommandType;
        const r = type ? safe(() => Game.UnitCommands.canStart(u.id, type, NO_TARGET, false), null) : null;
        if (r?.Success || r?.Plots?.length) out.push(`cmd:${type.replace("UNITCOMMAND_", "")}${r.Success ? "" : "@"}`);
    }
    return out;
}

// ---- migrants -------------------------------------------------------------------------------

/** Our settlement whose land this is, or null. */
function ownSettlementAt(loc) {
    const id = safe(() => GameplayMap.getOwningCityFromXY(loc.x, loc.y), null);
    const c = id ? safe(() => Cities.get(id), null) : null;
    return c && c.owner === pid() ? c : null;
}

/**
 * A Migrant (UNIT_CLASS_POPULATION; «Переселить», UNITCOMMAND_RESETTLE: it joins the settlement
 * whose land it stands on, city or town) joins the settlement it stands in, else walks to our
 * nearest settlement it reaches within MIGRANT_MAX_TURNS (never across rough seas). The new
 * citizen goes to the tile our growth advice rates best among those the game offers
 * (canStart Plots), as the game's acquire-tile screen sends it: { X, Y }. When nothing works
 * UI.log says why (seen in game: two migrants got no order, reason unknown).
 */
function resettle(u, def, ctx) {
    const RESETTLE = globalThis.UnitCommandTypes?.RESETTLE ?? "UNITCOMMAND_RESETTLE";
    const here = u.location;
    const home = ownSettlementAt(here);
    const nameOfCity = (c) => safe(() => Locale.compose(c.name), "?");
    let why = home ? `on ${nameOfCity(home)}'s land` : "not on our land";
    if (home) {
        const offer = safe(() => Game.UnitCommands.canStart(u.id, RESETTLE, {}, false), null);
        const plots = offer?.Plots ?? [];
        if (plots.length > 0) {
            const ranked = safe(() => growthAdvice(home.id, ctx.settings), null)?.expand ?? [];
            const idx = ranked.find((e) => plots.includes(e.idx))?.idx ?? plots[0];
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (loc) {
                Game.UnitCommands.sendRequest(u.id, RESETTLE, { X: loc.x, Y: loc.y });
                goals.delete(unitKey(u.id));
                return { key: "RESETTLED", args: [nameOf(def), nameOfCity(home)] };
            }
        }
        why += `, resettle offers no tile (${(offer?.FailureReasons ?? []).join(" ") || `success=${offer?.Success}`})`;
    }
    // Walk to the nearest other settlement of ours, city or town.
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(here.x, here.y, l.x, l.y), Infinity);
    const others = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? [])
        .filter((c) => !(home && same(c.location, home.location)))
        .sort((a, b) => dist(a.location) - dist(b.location));
    for (const c of others.slice(0, 4)) {
        const plots = (safe(() => c.getPurchasedPlots(), []) ?? [])
            .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null))
            .filter(Boolean)
            .sort((a, b) => dist(a) - dist(b));
        for (const p of plots.slice(0, 6)) {
            const turns = pathTurns(u, p);
            if (turns === null || turns > MIGRANT_MAX_TURNS || !moveTo(u, p)) continue;
            return { key: "MIGRANT_MOVE", args: [nameOf(def), nameOfCity(c)] };
        }
    }
    log.info(`autopilot: migrant at ${here.x},${here.y} ${why}; no other settlement of ours within ${MIGRANT_MAX_TURNS} turns (rough seas: ${roughSeas()})`);
    return null;
}

// ---- merchants ------------------------------------------------------------------------------

function routeValue(route, weights) {
    const v = [0, 0, 0, 0, 0, 0, 0];
    for (const e of route.exportYields ?? []) {
        const i = yieldIndex(safe(() => GameInfo.Yields.lookup(e.yieldType).YieldType, String(e.yieldType)));
        if (i >= 0) v[i] += Number(e.amount) || 0;
    }
    return dot(weights, v);
}

/** Routes the game allows now, best first: most imported resources, then yields. */
function tradeRoutes(settings) {
    const weights = getProfile(settings.profile).y;
    const ok = globalThis.TradeRouteStatus?.SUCCESS ?? 0;
    const routes = safe(() => Players.get(pid()).Trade.projectPossibleTradeRoutes(), []) ?? [];
    return routes
        .filter((r) => (r.status?.[0] ?? r.status) === ok && r.targetCityId)
        .map((r) => ({ route: r, city: safe(() => Cities.get(r.targetCityId), null), imports: r.importPayloads?.length ?? 0, value: routeValue(r, weights) }))
        .filter((r) => r.city)
        .sort((a, b) => b.imports - a.imports || b.value - a.value);
}

/** Routes to this owner we may still open (trade capacity), counting the ones sent this turn. */
function capacityLeft(owner, sentTo) {
    const trade = safe(() => Players.get(pid()).Trade, null);
    const cap = Number(safe(() => trade.getTradeCapacityFromPlayer(owner), NaN));
    const used = Number(safe(() => trade.countPlayerTradeRoutesTo(owner), 0)) || 0;
    const pending = sentTo.get(owner) ?? 0;
    return Number.isFinite(cap) ? cap - used - pending : 1 - pending;
}

function trade(u, def, ctx) {
    if (!truthy(def.MakeTradeRoute)) return null;
    const k = unitKey(u.id);
    const routes = ctx.routes();
    // Its own goal is not taken by "another" merchant.
    const own = goals.get(k);
    const goalKey = own?.city;
    if (goalKey) {
        ctx.cities.delete(goalKey);
        ctx.owners.set(own.owner, Math.max(0, (ctx.owners.get(own.owner) ?? 0) - 1));
    }
    const free = (r) => !ctx.cities.has(unitKey(r.route.targetCityId)) && capacityLeft(r.city.owner, ctx.owners) > 0;
    const pick = routes.find((r) => unitKey(r.route.targetCityId) === goalKey && free(r)) ?? routes.find(free);
    if (!pick) {
        goals.delete(k);
        return null;
    }
    ctx.cities.add(unitKey(pick.route.targetCityId));
    ctx.owners.set(pick.city.owner, (ctx.owners.get(pick.city.owner) ?? 0) + 1);
    const cityName = safe(() => Locale.compose(pick.city.name), "?");
    const loc = pick.city.location;
    const T = globalThis.UnitCommandTypes?.MAKE_TRADE_ROUTE ?? "UNITCOMMAND_MAKE_TRADE_ROUTE";
    const args = { X: loc.x, Y: loc.y };
    if (safe(() => Game.UnitCommands.canStart(u.id, T, args, false), null)?.Success) {
        Game.UnitCommands.sendRequest(u.id, T, args);
        goals.delete(k);
        return { key: "TRADE_ROUTE", args: [cityName, pick.imports, Math.round(pick.value * 10) / 10] };
    }
    // Walk there first: the nearest reachable plot of the target city (like the trade screen).
    const plots = (safe(() => pick.city.getPurchasedPlots(), []) ?? [])
        .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null))
        .filter(Boolean)
        .sort((a, b) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, a.x, a.y), 0) - safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, b.x, b.y), 0));
    for (const p of plots) {
        if (pathTurns(u, p) === null) continue;
        if (!moveTo(u, p)) continue;
        goals.set(k, { city: unitKey(pick.route.targetCityId), owner: pick.city.owner });
        return { key: "TRADE_MOVE", args: [cityName] };
    }
    return null;
}

// ---- one pass -------------------------------------------------------------------------------

/**
 * Orders for every unit waiting for them, by what the options allow.
 * @param options { explore, settlers, defend, merchants, roam, random, approach: [independent ids],
 *                  leave: Set of unit keys left alone this time (their order did not take),
 *                  threats: threatenedSettlements() (soldiers go to those lacking defenders) }
 * @returns { entries, ordered: Set of unit keys, orderedAt: Map unit key -> { x, y } }
 */
export function commandUnits(settings, options) {
    const entries = [];
    const ordered = new Set();
    const orderedAt = new Map();
    const units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    // Forget goals of units that are gone; sites other settlers walk to are taken.
    const alive = new Set(units.map((u) => unitKey(u.id)));
    for (const k of [...goals.keys()]) if (!alive.has(k)) goals.delete(k);
    const taken = new Set([...goals.values()].filter((g) => g.x !== undefined).map((g) => `${g.x},${g.y}`));
    let routes = null;
    const walking = [...goals.values()].filter((g) => g.city);
    const owners = new Map();
    for (const g of walking) owners.set(g.owner, (owners.get(g.owner) ?? 0) + 1);
    const garrison = new Set();
    const ctx = {
        routes: () => (routes ??= tradeRoutes(settings)), cities: new Set(walking.map((g) => g.city)), owners, unstacked: new Set(), stepTo: new Set(),
        random: options.random ?? Math.random, approach: options.approach ?? [], approached: new Set(), garrison,
        // Discoveries other units walk to (their goals), so two scouts never go for the same one.
        discoveries: new Set([...goals.values()].filter((g) => g.discovery).map((g) => g.discovery)),
        settings, entries, ordered,
        threats: options.threats ?? [],
        // Defenders each threatened settlement still lacks ("x,y" -> count).
        need: new Map((options.threats ?? []).map((t) => [`${t.settlement.x},${t.settlement.y}`, t.count - guardsFor(t, units)])),
    };
    // Roaming, approaching or reinforcing: the first military unit standing in each of our cities stays as its garrison.
    if (options.roam || ctx.approach.length > 0 || ctx.threats.length > 0) {
        const cityTiles = new Set((safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => `${c.location.x},${c.location.y}`));
        const taken = new Set();
        for (const u of units) {
            const def = safe(() => GameInfo.Units.lookup(u.type), null);
            const tile = `${u.location?.x},${u.location?.y}`;
            if (def?.CoreClass !== "CORE_CLASS_MILITARY" || !cityTiles.has(tile) || taken.has(tile)) continue;
            taken.add(tile);
            garrison.add(unitKey(u.id));
        }
    }
    const A = globalThis.UnitActivityTypes;
    const seen = [];
    for (const u of units) {
        if (ordered.size >= MAX_UNIT_ORDERS) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const what = `${def?.UnitType ?? u.type}(act=${u.activityType},move=${u.canMove},moved=${u.hasMoved})`;
        if (options.leave?.has(unitKey(u.id))) {
            seen.push(`${what}:left`);
            continue;
        }
        // Roaming military units are woken from fortification too (not while moving or healing).
        const roamer = options.roam && def?.CoreClass === "CORE_CLASS_MILITARY" && !u.isCommanderUnit && !garrison.has(unitKey(u.id))
            && u.isOnMap !== false && u.canMove !== false && u.hasMoved !== true && !(Number(u.Health?.damage) > 0)
            && (!A || (u.activityType !== A.OPERATION && u.activityType !== A.HEAL));
        // Scouts look for a discovery every turn, even while the game explores with them
        // (a move order takes them off automatic exploring; afterwards they go back to it).
        const scout = options.explore && def && hasTag(def, "UNIT_CLASS_AUTOEXPLORE") && u.isOnMap !== false
            && u.canMove !== false && u.hasMoved !== true && (!A || u.activityType !== A.HEAL);
        if (scout && !isIdle(u)) {
            const own = goals.get(unitKey(u.id));
            if (own?.discovery) ctx.discoveries.delete(own.discovery);
            let e = null;
            try {
                e = toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
            } catch (error) {
                log.debug(`autopilot discovery ${def.UnitType} failed`, error);
            }
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
            if (own?.discovery) ctx.discoveries.add(own.discovery);
        }
        // Near a threatened settlement a roaming unit stays (it is one of its defenders).
        if (roamer && !guarding(u, ctx)) {
            let e = null;
            try {
                e = reinforce(u, def, ctx) ?? (ctx.approach.length > 0 ? approach(u, def, ctx) : null) ?? roam(u, def, ctx);
            } catch (error) {
                log.debug(`autopilot roam ${def.UnitType} failed`, error);
            }
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
        }
        if (!isIdle(u)) {
            seen.push(`${what}:busy`);
            continue;
        }
        if (!def || u.isCommanderUnit) {
            seen.push(`${what}:skipped`);
            continue;
        }
        let e = null;
        try {
            if (options.settlers && truthy(def.FoundCity)) {
                // A settler's own goal is not "taken" for itself.
                const own = goals.get(unitKey(u.id));
                if (own?.x !== undefined) taken.delete(`${own.x},${own.y}`);
                e = settle(u, def, taken);
            } else if (options.settlers && hasTag(def, "UNIT_CLASS_POPULATION")) e = resettle(u, def, ctx);
            else if (options.merchants && truthy(def.MakeTradeRoute)) e = trade(u, def, ctx);
            else if (options.explore && hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) {
                const own = goals.get(unitKey(u.id));
                if (own?.discovery) ctx.discoveries.delete(own.discovery);
                e = explore(u, def, ctx);
            }
            else if (options.defend) e = defend(u, def, ctx);
        } catch (error) {
            log.debug(`autopilot unit ${def.UnitType} failed`, error);
        }
        seen.push(`${what}:${e ? e.key : `none[can: ${allowedOperations(u).join(",")}]`}`);
        if (e) {
            entries.push(e);
            ordered.add(unitKey(u.id));
        }
    }
    // The game cuts log lines at about 1000 characters: busy units are only counted.
    const busy = seen.filter((t) => t.endsWith(":busy")).length;
    log.info(`autopilot units: ${busy} busy; ${seen.filter((t) => !t.endsWith(":busy")).join("; ") || "no other"}`);
    for (const u of units) if (ordered.has(unitKey(u.id))) orderedAt.set(unitKey(u.id), { x: u.location?.x, y: u.location?.y });
    return { entries, ordered, orderedAt };
}
