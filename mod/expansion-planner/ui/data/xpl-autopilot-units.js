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
 *  - explore: also explorers (Modern) dig up artifacts and research new dig sites;
 * Land units never walk across deep ocean while it hurts them (Exploration, before Shipbuilding);
 * plus promotions for units that have earned one (a choice that holds the turn).
 * Only units waiting for orders are touched (a unit already moving, exploring or fortified
 * is left alone), and no order may start a war. Returns log entries { key, args } like the
 * steps in xpl-autopilot-steps.js, plus the units it gave orders to (`ordered`).
 */
import { getProfile } from '../core/xpl-profiles.js';
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { growthAdvice } from './xpl-growth-job.js';
import { TUNING } from '../core/xpl-tuning.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

// The parameters the game's unit panel sends for an untargeted operation (unit-actions.js).
export const NO_TARGET = Object.freeze({ X: -9999, Y: -9999, UnitAbilityType: -1 });
const SETTLE_MAX_TURNS = 10;     // a site further away than this is not walked to
const DANGER_RADIUS = 3;         // a hostile military unit this close to a settler (or its site) is a danger...
const PATH_DANGER = 2;           // ...and so is a way that passes this close to one
const RETREAT_DANGER = 1;        // running home: never next to one
const RETREAT_TRIES = 4;         // our nearest settlements tried as a refuge
const SCOUT_DANGER = 2;          // scouts: no target this close to a hostile unit, no step next to one
const LOSS_TURNS = 20;           // where a unit died on its way, others keep away this long...
const LOSS_GIVE_UP = 2;          // ...and a target is dropped (that long) after this many died going there
const OCEAN_ESCAPE_RADIUS = 6;   // a unit caught on rough seas looks this far for coast or land
const DETOUR_RADIUS = 5;         // a detour's waypoint is at most this far from the unit
const DISTANT_MAX_TURNS = 20;    // a settler sails at most this far to a site in the Distant Lands
const DISTANT_SUGGESTIONS = 6;   // the game's site suggestions looked at for the Distant Lands
const BANK_RETRY_TURNS = 10;     // a capital where the Great Banker was refused is tried again after this
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
const ARTIFACT_MAX_TURNS = 15;   // an explorer walks at most this far to a dig or research site
const ARTIFACT_TRIES = 8;        // nearest sites tried
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
    losses.clear();
    bankDone.clear();
    bankTried.clear();
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

const isOcean = (loc) => !!loc && safe(() => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(loc.x, loc.y))?.TerrainType, null) === "TERRAIN_OCEAN";

/**
 * Does this unit's path cross deep ocean while the seas are rough? (Its own tile aside.) Ships
 * too: the ocean damage hits every unit until Shipbuilding (seen in game: a Cog sank roaming).
 */
function crossesRoughSeas(u, plots) {
    if (!roughSeas()) return false;
    const start = safe(() => GameplayMap.getIndexFromXY(u.location.x, u.location.y), -1);
    return plots.some((idx) => idx !== start && isOcean(safe(() => GameplayMap.getLocationFromIndex(idx), null)));
}

/**
 * A unit standing on deep ocean while the seas are rough heads for the nearest tile that is not
 * (coast for a ship; land for any other unit), by the game's own path. @returns a log entry or null
 */
function leaveTheOcean(u, def, ctx) {
    if (!roughSeas() || !isOcean(u.location)) return null;
    const ship = def?.Domain === "DOMAIN_SEA";
    const here = u.location;
    let best = null;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, OCEAN_ESCAPE_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || isOcean(loc) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (ship !== !!safe(() => GameplayMap.isWater(loc.x, loc.y), false)) continue;
        const r = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
        if (!r?.plots?.length) continue;
        const turns = Number(r.turns?.[r.turns.length - 1]) || r.plots.length;
        if (!best || turns < best.turns) best = { loc, turns };
    }
    if (!best || startsWar(u, best.loc) || !moveTo(u, best.loc)) return null;
    ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
    return { key: "LEFT_OCEAN", args: [nameOf(def), best.loc.x, best.loc.y] };
}

// ---- losses: where units died on their way --------------------------------------------------

// Target ("x,y" discovery, "indep:<id>") -> { deaths, at: [{ x, y, turn }] } for units that died going there.
const losses = new Map();

/** A unit with a goal is gone: it died on its way (counted for discoveries and visits). */
function noteLoss(target, at) {
    const l = losses.get(target) ?? { deaths: 0, at: [] };
    l.deaths++;
    l.turn = Game.turn;
    if (at?.x !== undefined) l.at.push({ x: at.x, y: at.y, turn: Game.turn });
    losses.set(target, l);
}

/** Enough of our units died going there lately: leave it for now. */
function givenUp(target) {
    const l = losses.get(target);
    return !!l && l.deaths >= LOSS_GIVE_UP && Game.turn - (l.turn ?? 0) < LOSS_TURNS;
}

/** Hostile units near, or one of our units died near here lately. */
function dangerNear(loc, radius, ctx) {
    if (hostileNear(loc, radius, ctx)) return true;
    for (const l of losses.values()) {
        for (const d of l.at) {
            if (Game.turn - d.turn < LOSS_TURNS && safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, d.x, d.y), Infinity) <= radius) return true;
        }
    }
    return false;
}

/**
 * The game's path to a target passes too close to hostile units or to where ours died: walk to
 * a waypoint first, a safe tile (and safe way) closer to the target and clear of the danger, so
 * the next turn's path from there goes around it ("reroute with a safer trajectory").
 * @returns the waypoint or null
 */
function detourToward(u, target, keep, ctx) {
    const here = u.location;
    const left = (l) => safe(() => GameplayMap.getPlotDistance(l.x, l.y, target.x, target.y), Infinity);
    const now = left(here);
    const options = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, DETOUR_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        // Around the danger may mean sideways, never further from the target.
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`) || left(loc) > now) continue;
        if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || safe(() => GameplayMap.isWater(loc.x, loc.y), false) || dangerNear(loc, keep, ctx)) continue;
        options.push({ loc, score: left(loc) });
    }
    options.sort((a, b) => a.score - b.score);
    for (const { loc } of options.slice(0, ROAM_TRIES * 2)) {
        const p = pathTo(u, loc);
        if (!p || p.turns > 2 || !wayIsSafe(u, p, keep, ctx) || startsWar(u, loc) || !moveTo(u, loc)) continue;
        ctx.stepTo.add(`${loc.x},${loc.y}`);
        return loc;
    }
    return null;
}

/**
 * A unit with hostile units near it steps to the tile within reach this turn that is furthest
 * from them (scouts, and settlers with no safe way home). @returns a log entry or null
 */
function stepAway(u, def, ctx, key = "UNIT_AWAY") {
    const here = u.location;
    const gap = (loc) => {
        for (let r = 0; r <= DANGER_RADIUS + 1; r++) if (hostileNear(loc, r, ctx)) return r;
        return DANGER_RADIUS + 2;
    };
    let best = { loc: null, gap: gap(here) };
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, 2), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (safe(() => GameplayMap.isWater(loc.x, loc.y), false) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
        const g = gap(loc);
        if (g <= best.gap) continue;
        const t = pathTurns(u, loc);
        if (t === null || t > 1 || startsWar(u, loc)) continue;
        best = { loc, gap: g };
    }
    if (!best.loc || !moveTo(u, best.loc)) return null;
    ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
    return { key, args: [nameOf(def), best.loc.x, best.loc.y] };
}

/** The way there: { turns (0 = here), plots }, or null when unreachable (or only across rough seas). */
function pathTo(u, loc) {
    if (same(u.location, loc)) return { turns: 0, plots: [] };
    const r = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
    if (!r?.plots?.length) return null;
    if (crossesRoughSeas(u, r.plots)) return null;
    const t = Number(r.turns?.[r.turns.length - 1]);
    return { turns: Number.isFinite(t) ? t : r.plots.length, plots: r.plots };
}

/** Turns to walk there (0 = here), or null when unreachable (or only across rough seas). */
function pathTurns(u, loc) {
    return pathTo(u, loc)?.turns ?? null;
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
        // Not where units keep dying, not next to hostile units.
        if (givenUp(`${loc.x},${loc.y}`) || dangerNear(loc, SCOUT_DANGER, ctx)) continue;
        found.push({ loc, d: safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), radius) });
    }
    found.sort((a, b) => a.d - b.d);
    for (const { loc } of found.slice(0, ROAM_TRIES)) {
        const p = pathTo(u, loc);
        // A way never next to hostile units; after a loss on the way there, further from them.
        const keep = losses.has(`${loc.x},${loc.y}`) ? SCOUT_DANGER : 1;
        if (!p || p.turns > maxTurns || startsWar(u, loc)) continue;
        if (!wayIsSafe(u, p, keep, ctx)) {
            // Around the danger: a waypoint first; the discovery stays this unit's goal.
            const via = detourToward(u, loc, keep, ctx);
            if (!via) continue;
            ctx.discoveries.add(`${loc.x},${loc.y}`);
            goals.set(unitKey(u.id), { discovery: `${loc.x},${loc.y}` });
            return { key: "DETOUR", args: [nameOf(def), loc.x, loc.y, via.x, via.y] };
        }
        if (!moveTo(u, loc)) continue;
        ctx.discoveries.add(`${loc.x},${loc.y}`);
        goals.set(unitKey(u.id), { discovery: `${loc.x},${loc.y}` });
        return { key: "DISCOVERY", args: [nameOf(def), loc.x, loc.y] };
    }
    return null;
}

/**
 * May the game's own automatic exploring take this unit? Not on rough seas (it sails and embarks
 * into the deep ocean: seen in game, scouts and a Cog died there) and not with hostile units near.
 */
function autoExploreIsSafe(u, ctx) {
    return !roughSeas() && !hostileNear(u.location, DANGER_RADIUS, ctx);
}

function explore(u, def, ctx) {
    if (!hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) return null;
    // Hostile units near: away from them first (scouts are not for fighting).
    if (hostileNear(u.location, SCOUT_DANGER, ctx)) {
        const away = stepAway(u, def, ctx);
        if (away) return away;
    }
    const found = toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
    if (found) return found;
    if (autoExploreIsSafe(u, ctx) && operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) return { key: "EXPLORE", args: [nameOf(def)] };
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

/**
 * Is a hostile military unit (hostileOwner) within `radius` of this tile? Plots are looked at
 * once per pass (ctx.hostileAt memo).
 */
function hostileNear(loc, radius, ctx) {
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        if (!ctx.hostileAt.has(idx)) {
            const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            ctx.hostileAt.set(idx, !!at && (safe(() => MapUnits.getUnits(at.x, at.y), []) ?? []).some((id) => !!hostileOwner(safe(() => Units.get(id), null))));
        }
        if (ctx.hostileAt.get(idx)) return true;
    }
    return false;
}

/** A way whose every step (its start aside) stays more than `radius` from hostile units (and recent losses). */
function wayIsSafe(u, path, radius, ctx) {
    const start = safe(() => GameplayMap.getIndexFromXY(u.location.x, u.location.y), -1);
    return path.plots.every((idx) => {
        if (idx === start) return true;
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        return !loc || !dangerNear(loc, radius, ctx);
    });
}

/** Closer than TUNING.FOREIGN_MIN_DISTANCE to another player's settlement centre (we can see)? */
function tooCloseToForeign(loc, ctx) {
    ctx.foreignCentres ??= (safe(() => Players.getAlive(), []) ?? [])
        .filter((p) => p && p.id !== pid())
        .flatMap((p) => (safe(() => p.Cities.getCities(), []) ?? []).map((c) => c.location))
        .filter((c) => c && safe(() => GameplayMap.getRevealedState(pid(), c.x, c.y), 0) !== RevealedStates.HIDDEN);
    return ctx.foreignCentres.some((c) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.x, c.y), Infinity) < TUNING.FOREIGN_MIN_DISTANCE);
}

/** A site a settler may go for now: no hostile unit near it, not too close to another player. */
function siteIsSafe(loc, ctx) {
    return !dangerNear(loc, DANGER_RADIUS, ctx) && !tooCloseToForeign(loc, ctx);
}

/** The best free site this settler reaches in time by a safe way: our ranked sites (the role we
 * need first, see neededRole), else the game's. */
function pickSite(u, taken, ctx) {
    const failed = failedSites.get(unitKey(u.id)) ?? new Set();
    const ok = (loc) => loc && !taken.has(`${loc.x},${loc.y}`) && !failed.has(`${loc.x},${loc.y}`) && siteStillFree(loc) && siteIsSafe(loc, ctx) && !startsWar(u, loc);
    const reachable = (loc) => {
        const p = pathTo(u, loc);
        return p && p.turns <= SETTLE_MAX_TURNS && wayIsSafe(u, p, PATH_DANGER, ctx) ? p.turns : null;
    };
    // Economy in the Exploration age: the Distant Lands first (treasure convoys, more settlements),
    // from the game's own suggestions, which favour the other hemisphere and treasure resources.
    if (ctx.distant) {
        const me = safe(() => Players.get(pid()), null);
        const offers = safe(() => me.AI.getBestSettleLocationsForSettler(DISTANT_SUGGESTIONS, u.location), []) ?? [];
        for (const s of offers) {
            const loc = s?.location ? { x: s.location.x, y: s.location.y } : null;
            if (!ok(loc) || !safe(() => me.isDistantLands({ x: loc.x, y: loc.y }), false)) continue;
            const p = pathTo(u, loc);
            if (!p || p.turns > DISTANT_MAX_TURNS || !wayIsSafe(u, p, PATH_DANGER, ctx)) continue;
            return { ...loc, turns: p.turns, source: "DISTANT", role: null };
        }
    }
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

/**
 * A settler with hostile units near it gets away from them (settlers are captured, not fought):
 * it stays in one of our settlements if it is in one; else it walks to the nearest one it reaches
 * by a way never next to them; else it steps to the tile within reach this turn that is
 * furthest from them. @returns a log entry, or null when there is nowhere better
 */
function runFromDanger(u, def, ctx) {
    const here = u.location;
    const homes = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => ({ c, d: safe(() => GameplayMap.getPlotDistance(here.x, here.y, c.location.x, c.location.y), Infinity) }))
        .sort((a, b) => a.d - b.d);
    if (homes[0]?.d === 0) {
        // Safe in a settlement: wait there (an order it was walking out on is cancelled).
        const CANCEL = "UNITCOMMAND_CANCEL";
        if (!isIdle(u) && safe(() => Game.UnitCommands.canStart(u.id, CANCEL, NO_TARGET, false), null)?.Success) Game.UnitCommands.sendRequest(u.id, CANCEL, { ...NO_TARGET });
        operate(u, "UNITOPERATION_SKIP_TURN");
        return { key: "SETTLER_WAITS", args: [nameOf(def), safe(() => Locale.compose(homes[0].c.name), "?")] };
    }
    for (const { c } of homes.slice(0, RETREAT_TRIES)) {
        const p = pathTo(u, c.location);
        if (!p || p.turns > SETTLE_MAX_TURNS || !wayIsSafe(u, p, RETREAT_DANGER, ctx) || !moveTo(u, c.location)) continue;
        return { key: "SETTLER_RETREAT", args: [nameOf(def), safe(() => Locale.compose(c.name), "?")] };
    }
    // No safe way home: the reachable tile furthest from them.
    return stepAway(u, def, ctx, "SETTLER_AWAY");
}

/**
 * Should a settler that is already walking get a new order? Hostile units came near it, near
 * its site, or near its way there.
 */
function settlerAtRisk(u, ctx) {
    if (hostileNear(u.location, DANGER_RADIUS, ctx)) return true;
    const goal = goals.get(unitKey(u.id));
    if (goal?.x === undefined) return false;
    if (!siteIsSafe(goal, ctx)) return true;
    const p = pathTo(u, goal);
    return !!p && !wayIsSafe(u, p, PATH_DANGER, ctx);
}

/**
 * Settlements and the settlement cap (player.Stats, as the game's top bar reads them), or null.
 * Each settlement over the cap costs happiness everywhere.
 */
function settlementCount() {
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements);
    const cap = Number(stats?.settlementCap);
    return Number.isFinite(n) && Number.isFinite(cap) && cap > 0 ? { n, cap } : null;
}

/**
 * At the cap a settler on its site does not found (seen in game: a settler trained below the cap
 * founded the 6th settlement of 5 after a story event had added one): it waits there, skipping
 * its turn, until the cap rises (civics, the next age). @returns a log entry, or null to found
 */
function waitAtCap(u, def, goal) {
    const c = settlementCount();
    if (!c || c.n < c.cap) return null;
    operate(u, "UNITOPERATION_SKIP_TURN");
    return { key: "SETTLER_AT_CAP", args: [nameOf(def), goal.x, goal.y, c.n, c.cap] };
}

/**
 * A settler founds on its site (not at the settlement cap: waitAtCap); with hostile units near
 * it, it gets away from them first (runFromDanger); it keeps its site while the site and the way
 * there stay safe, else it takes the best safe one it reaches (pickSite).
 */
function settle(u, def, taken, ctx) {
    if (!truthy(def.FoundCity)) return null;
    const k = unitKey(u.id);
    let goal = goals.get(k);
    // On its site: found at once (a settlement is safer than a settler).
    if (goal && same(u.location, goal) && siteStillFree(goal) && !tooCloseToForeign(goal, ctx)) {
        const wait = waitAtCap(u, def, goal);
        if (wait) return wait;
        goals.delete(k);
        if (!operate(u, "UNITOPERATION_FOUND_CITY")) return null;
        if (goal.role) foundedRoles.set(`${goal.x},${goal.y}`, goal.role);
        return { key: "SETTLE_FOUND", args: [nameOf(def), goal.x, goal.y] };
    }
    if (hostileNear(u.location, DANGER_RADIUS, ctx)) {
        goals.delete(k);
        return runFromDanger(u, def, ctx);
    }
    if (goal) {
        const p = !siteStillFree(goal) || !siteIsSafe(goal, ctx) ? null : pathTo(u, goal);
        if (!p || !wayIsSafe(u, p, PATH_DANGER, ctx)) goal = null;
    }
    if (!goal) goal = pickSite(u, taken, ctx);
    if (!goal) {
        goals.delete(k);
        return null; // nothing reachable safely: left to the player
    }
    taken.add(`${goal.x},${goal.y}`);
    if (same(u.location, goal)) {
        const wait = waitAtCap(u, def, goal);
        if (wait) {
            goals.set(k, goal);
            return wait;
        }
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
 * May this unit end up here? Nobody else's unit (a capture or an attack) and none of ours of its
 * kind: one military unit per tile, one of each other formation (GameInfo.Units.FormationClass:
 * a settler and a scout are both FORMATION_CLASS_CIVILIAN).
 */
function roomFor(def, loc) {
    if (isSoldier(def)) return roomForSoldier(loc);
    for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
        const other = safe(() => Units.get(id), null);
        if (!other || other.owner !== pid()) return false;
        if (def?.FormationClass && safe(() => GameInfo.Units.lookup(other.type).FormationClass, null) === def.FormationClass) return false;
    }
    return true;
}

/**
 * Only moving is allowed: two units of one kind share a tile (a unit the city just trained
 * appears under the one standing there; seen in game: allowed = EXECUTE_SCRIPT, MOVE_TO,
 * WAIT_FOR; also a settler and a scout, both civilian formation, in a war that left neither an
 * order). One of them steps to the nearest free tile it reaches this turn, our own land first;
 * the others on that tile wait until the move is done (the end-of-turn retry).
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
            if (!roomFor(def, loc)) {
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
        if (!best && isSoldier(def) && makeRoom(u, def, ctx)) {
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
    if (autoExploreIsSafe(u, ctx) && operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) return { key: "EXPLORE", args: [nameOf(def)] };
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
        if (isFrontier(loc, land) && !dangerNear(loc, SCOUT_DANGER, ctx)) candidates.push(loc);
    }
    // A random direction: shuffle, then the first one reachable soon without war.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const loc of candidates.slice(0, ROAM_TRIES)) {
        const p = pathTo(u, loc);
        if (!p || p.turns > maxTurns || !wayIsSafe(u, p, 1, ctx) || startsWar(u, loc)) continue;
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
        // One unit at a time (counting those on their way); not where ours keep dying.
        if (ctx.approached.has(indep) || givenUp(`indep:${indep}`)) continue;
        const towns = safe(() => Players.get(indep).Cities.getCities(), []) ?? [];
        let best = null;
        for (const t of towns) {
            for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(t.location.x, t.location.y, APPROACH_DISTANCE), []) ?? []) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
                if (!loc || safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, t.location.x, t.location.y), 0) < APPROACH_DISTANCE) continue;
                if ((safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).length > 0 || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
                if (dangerNear(loc, 1, ctx)) continue; // not next to its units
                const d = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), Infinity);
                if (!best || d < best.d) best = { loc, d };
            }
        }
        const keep = losses.has(`indep:${indep}`) ? SCOUT_DANGER : 1;
        const p = best ? pathTo(u, best.loc) : null;
        if (!p || startsWar(u, best.loc)) continue;
        if (!wayIsSafe(u, p, keep, ctx)) {
            const via = detourToward(u, best.loc, keep, ctx);
            if (!via) continue;
            ctx.approached.add(indep);
            goals.set(unitKey(u.id), { approach: indep });
            return { key: "DETOUR", args: [nameOf(def), best.loc.x, best.loc.y, via.x, via.y] };
        }
        if (!moveTo(u, best.loc)) continue;
        ctx.approached.add(indep);
        goals.set(unitKey(u.id), { approach: indep });
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

// ---- explorers: artifacts (Modern) ------------------------------------------------------------

const RESEARCH_BUILDINGS = new Set(["BUILDING_MUSEUM", "BUILDING_UNIVERSITY", "BUILDING_UNIVERSITY_MO"]);

/**
 * Where explorers (units with ExtractsArtifacts, «Исследователь») work, as the game's continent
 * lens shows it (continent-layer.js): revealed ruins (IMPROVEMENT_RUINS) and natural wonders that
 * still hold an artifact (player.Stats.hasNaturalWonderArtifact(feature)) are dug
 * (UNITOPERATION_EXCAVATE, «Выкопать артефакт»); a finished, undamaged museum or university of
 * ours on a continent with ages left to research (player.Culture.getNumAgesAvailableToResearch)
 * is where they research (UNITOPERATION_RESEARCH_ARTIFACTS, «Исследовать артефакты»), which
 * reveals that continent's ruins. Excavated artifacts count for «Географическое общество».
 * @returns { dig: [{x, y}], study: [{x, y}] }
 */
export function artifactSites() {
    const out = { dig: [], study: [] };
    const player = safe(() => Players.get(pid()), null);
    if (!player) return out;
    const width = Number(safe(() => GameplayMap.getGridWidth(), 0)) || 0;
    const height = Number(safe(() => GameplayMap.getGridHeight(), 0)) || 0;
    const ages = new Map();
    const agesLeft = (x, y) => {
        const c = safe(() => GameplayMap.getContinentType(x, y), -1);
        if (!ages.has(c)) ages.set(c, Number(safe(() => player.Culture.getNumAgesAvailableToResearch(c), 0)) || 0);
        return ages.get(c);
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (safe(() => GameplayMap.getRevealedState(pid(), x, y), 0) === RevealedStates.HIDDEN) continue;
            let dig = false;
            let study = false;
            for (const id of safe(() => MapConstructibles.getHiddenFilteredConstructibles(x, y), []) ?? []) {
                const c = safe(() => Constructibles.getByComponentID(id), null);
                const type = c ? safe(() => GameInfo.Constructibles.lookup(c.type)?.ConstructibleType, null) : null;
                if (type === "IMPROVEMENT_RUINS") dig = true;
                else if (RESEARCH_BUILDINGS.has(type) && c.complete !== false && !c.damaged && safe(() => GameplayMap.getOwner(x, y), -1) === pid()) study = true;
            }
            if (!dig && safe(() => GameplayMap.isNaturalWonder(x, y), false)
                && safe(() => player.Stats.hasNaturalWonderArtifact(GameplayMap.getFeatureType(x, y)), false)) dig = true;
            if (dig) out.dig.push({ x, y });
            if (study && agesLeft(x, y) > 0) out.study.push({ x, y });
        }
    }
    return out;
}

/**
 * An explorer digs where it stands, else researches where it stands, else walks to the nearest
 * dig site (then research site) another explorer is not going to, within ARTIFACT_MAX_TURNS.
 */
function excavate(u, def, ctx) {
    const k = unitKey(u.id);
    if (operate(u, "UNITOPERATION_EXCAVATE")) {
        goals.delete(k);
        return { key: "EXCAVATED", args: [nameOf(def)] };
    }
    if (operate(u, "UNITOPERATION_RESEARCH_ARTIFACTS")) {
        goals.delete(k);
        return { key: "RESEARCHED_ARTIFACTS", args: [nameOf(def)] };
    }
    ctx.artifacts ??= artifactSites();
    const own = goals.get(k)?.artifact;
    if (own) ctx.artifactTaken.delete(own);
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, l.x, l.y), Infinity);
    for (const list of [ctx.artifacts.dig, ctx.artifacts.study]) {
        const near = list.filter((l) => !same(l, u.location) && !ctx.artifactTaken.has(`${l.x},${l.y}`)).sort((a, b) => dist(a) - dist(b));
        for (const loc of near.slice(0, ARTIFACT_TRIES)) {
            const turns = pathTurns(u, loc);
            if (turns === null || turns > ARTIFACT_MAX_TURNS || !moveTo(u, loc)) continue;
            const key = `${loc.x},${loc.y}`;
            goals.set(k, { artifact: key });
            ctx.artifactTaken.add(key);
            return { key: "ARTIFACT_MOVE", args: [nameOf(def), loc.x, loc.y] };
        }
    }
    goals.delete(k);
    return null;
}

// ---- treasure convoys (Exploration) and the Great Banker (Modern) ------------------------------

/**
 * A treasure convoy (UNIT_TREASURE_FLEET, «серебряный караван»: a Distant Lands settlement with
 * improved treasure resources sends them) unloads (UNITCOMMAND_DISBAND, «Разгрузка»: GDP, gold,
 * Treasure Fleet points) once inside the borders of one of our Homeland settlements; until then
 * it walks (sails) to the nearest one by a safe way (never across rough seas).
 */
function deliverTreasure(u, def, ctx) {
    const UNLOAD = "UNITCOMMAND_DISBAND";
    if (safe(() => Game.UnitCommands.canStart(u.id, UNLOAD, NO_TARGET, false), null)?.Success) {
        Game.UnitCommands.sendRequest(u.id, UNLOAD, { ...NO_TARGET });
        const city = ownSettlementAt(u.location);
        return { key: "TREASURE_UNLOADED", args: [city ? safe(() => Locale.compose(city.name), "?") : "?"] };
    }
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, l.x, l.y), Infinity);
    const homes = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).filter((c) => !c.isDistantLands)
        .sort((a, b) => dist(a.location) - dist(b.location));
    for (const c of homes.slice(0, 4)) {
        const plots = (safe(() => c.getPurchasedPlots(), []) ?? [])
            .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null))
            .filter((l) => l && !safe(() => GameplayMap.isWater(l.x, l.y), false))
            .sort((a, b) => dist(a) - dist(b));
        for (const p of plots.slice(0, 6)) {
            const way = pathTo(u, p);
            if (!way || !wayIsSafe(u, way, 1, ctx) || !moveTo(u, p)) continue;
            return { key: "TREASURE_HOME", args: [safe(() => Locale.compose(c.name), "?")] };
        }
    }
    return null;
}

// Owners whose capital already has our World Bank office ("done"), or refused it (turn tried).
const bankDone = new Set();
const bankTried = new Map();

/**
 * The Great Banker (a VictoryUnit that may teleport to other players' capitals: John Maynard
 * Keynes, from the Railroad Tycoon triumph) opens a World Bank office in each other major's
 * capital: UNITCOMMAND_ACTIVATE_GREAT_PERSON (NO_TARGET; on a tile of that capital; gold cost,
 * which grows) as the unit panel sends it; to get there UNITOPERATION_TELEPORT_TO_CITY {X, Y} on
 * one of the plots its canStart offers (interface-mode-teleport-to-city.js). A capital where it is
 * refused (not enough gold yet, or done) is tried again after BANK_RETRY_TURNS.
 */
function openWorldBanks(u, def, ctx) {
    const ACT = "UNITCOMMAND_ACTIVATE_GREAT_PERSON";
    const TELEPORT = "UNITOPERATION_TELEPORT_TO_CITY";
    const here = safe(() => Cities.get(GameplayMap.getOwningCityFromXY(u.location.x, u.location.y)), null);
    const foreignCapital = (c) => c && c.owner !== pid() && c.isCapital && !!safe(() => Players.get(c.owner).isMajor, false);
    if (foreignCapital(here) && !bankDone.has(here.owner)) {
        if (safe(() => Game.UnitCommands.canStart(u.id, ACT, NO_TARGET, false), null)?.Success) {
            Game.UnitCommands.sendRequest(u.id, ACT, { ...NO_TARGET });
            bankDone.add(here.owner);
            return { key: "BANK_OPENED", args: [nameOf(def), safe(() => Locale.compose(here.name), "?")] };
        }
        bankTried.set(here.owner, Game.turn);
    }
    const r = safe(() => Game.UnitOperations.canStart(u.id, TELEPORT, {}, false), null);
    for (const idx of r?.Plots ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        const city = loc ? safe(() => Cities.get(GameplayMap.getOwningCityFromXY(loc.x, loc.y)), null) : null;
        if (!foreignCapital(city) || bankDone.has(city.owner) || (here && city.owner === here.owner)) continue;
        if (Game.turn - (bankTried.get(city.owner) ?? -Infinity) < BANK_RETRY_TURNS) continue;
        Game.UnitOperations.sendRequest(u.id, TELEPORT, { X: loc.x, Y: loc.y });
        return { key: "BANKER_MOVE", args: [nameOf(def), safe(() => Locale.compose(city.name), "?")] };
    }
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

/** How many trade routes we could open now (the game's possible routes within each partner's capacity). */
export function openTradeRoutes(settings) {
    const sent = new Map();
    let n = 0;
    for (const r of tradeRoutes(settings)) {
        if (capacityLeft(r.city.owner, sent) <= 0) continue;
        sent.set(r.city.owner, (sent.get(r.city.owner) ?? 0) + 1);
        n++;
    }
    return n;
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
 *                  victory: the victory focus is on (victory units act), distant: settlers to the Distant Lands first,
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
    for (const [k, g] of [...goals.entries()]) {
        if (alive.has(k)) continue;
        // Gone on its way to a discovery or an independent: it died there (counted, avoided).
        if (g.discovery) noteLoss(g.discovery, g.lastAt);
        else if (g.approach !== undefined) noteLoss(`indep:${g.approach}`, g.lastAt);
        goals.delete(k);
    }
    for (const u of units) {
        const g = goals.get(unitKey(u.id));
        if (g) g.lastAt = { x: u.location?.x, y: u.location?.y };
    }
    const taken = new Set([...goals.values()].filter((g) => g.x !== undefined).map((g) => `${g.x},${g.y}`));
    let routes = null;
    const walking = [...goals.values()].filter((g) => g.city);
    const owners = new Map();
    for (const g of walking) owners.set(g.owner, (owners.get(g.owner) ?? 0) + 1);
    const garrison = new Set();
    const ctx = {
        routes: () => (routes ??= tradeRoutes(settings)), cities: new Set(walking.map((g) => g.city)), owners, unstacked: new Set(), stepTo: new Set(),
        random: options.random ?? Math.random, approach: options.approach ?? [], garrison,
        // Independents a unit is already walking to (one at a time).
        approached: new Set([...goals.values()].filter((g) => g.approach !== undefined).map((g) => g.approach)),
        // Discoveries other units walk to (their goals), so two scouts never go for the same one.
        discoveries: new Set([...goals.values()].filter((g) => g.discovery).map((g) => g.discovery)),
        // Dig and research sites other explorers walk to; the sites themselves are scanned once, when needed.
        artifactTaken: new Set([
            ...[...goals.values()].filter((g) => g.artifact).map((g) => g.artifact),
            // A site an explorer already stands on (it digs there this pass).
            ...units.filter((u) => truthy(safe(() => GameInfo.Units.lookup(u.type)?.ExtractsArtifacts, false))).map((u) => `${u.location?.x},${u.location?.y}`),
        ]),
        artifacts: null,
        settings, entries, ordered,
        distant: !!options.distant, // settlers: Distant Lands first (economy focus in the Exploration age)
        hostileAt: new Map(), // plot index -> a hostile military unit stands there (settlers keep away)
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
        // On deep ocean while it hurts (moving or not): to the nearest coast or land first.
        if (def && u.isOnMap !== false && u.canMove !== false && u.hasMoved !== true && roughSeas() && isOcean(u.location)) {
            let e = null;
            try {
                e = leaveTheOcean(u, def, ctx);
            } catch (error) {
                log.debug(`autopilot ocean ${def.UnitType} failed`, error);
            }
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
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
                // Exploring by itself into hostile units: away from them first.
                e = (hostileNear(u.location, SCOUT_DANGER, ctx) ? stepAway(u, def, ctx) : null) ?? toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
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
        // A settler walking to its site gets a new order only when hostile units come near it or its way.
        if (options.settlers && def && truthy(def.FoundCity) && !isIdle(u) && u.isOnMap !== false && u.canMove !== false && u.hasMoved !== true) {
            let risk = false;
            try {
                risk = settlerAtRisk(u, ctx);
            } catch (error) {
                log.debug(`autopilot settler ${def.UnitType} check failed`, error);
            }
            if (risk) {
                const own = goals.get(unitKey(u.id));
                if (own?.x !== undefined) taken.delete(`${own.x},${own.y}`);
                let e = null;
                try {
                    e = settle(u, def, taken, ctx);
                } catch (error) {
                    log.debug(`autopilot settler ${def.UnitType} failed`, error);
                }
                seen.push(`${what}:${e ? e.key : "danger"}`);
                if (e) {
                    entries.push(e);
                    ordered.add(unitKey(u.id));
                }
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
                e = settle(u, def, taken, ctx);
            } else if (options.settlers && hasTag(def, "UNIT_CLASS_POPULATION")) e = resettle(u, def, ctx);
            // Treasure convoys go home and unload whatever options are on (else they wait forever).
            else if (def.UnitType === "UNIT_TREASURE_FLEET") e = deliverTreasure(u, def, ctx);
            else if (options.victory && truthy(def.VictoryUnit) && truthy(def.AllowTeleportToOtherPlayerCapitals)) e = openWorldBanks(u, def, ctx);
            else if (options.explore && truthy(def.ExtractsArtifacts)) e = excavate(u, def, ctx);
            else if (options.merchants && truthy(def.MakeTradeRoute)) e = trade(u, def, ctx);
            else if (options.explore && hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) {
                const own = goals.get(unitKey(u.id));
                if (own?.discovery) ctx.discoveries.delete(own.discovery);
                e = explore(u, def, ctx);
            }
            else if (options.defend) e = defend(u, def, ctx);
            // No order and only moving allowed (two of a kind on one tile): one steps aside, or
            // the turn stays held (NOTIFICATION_COMMAND_UNITS).
            if (!e) e = stepAside(u, def, ctx);
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
