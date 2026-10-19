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
import { profileFor } from '../core/xpl-profiles.js';
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { growthAdvice } from './xpl-growth-job.js';
import { siteTuning, TUNING } from '../core/xpl-tuning.js';
import { angersVillage } from '../core/xpl-site-scorer.js';
import { independentNameOf, villagesOf } from './xpl-player-facts.js';
import { createBudget } from '../core/xpl-savings.js';
import { estimateStrike } from '../core/xpl-combat.js';
import { FORM, commanderTile, planFormation, sectorsOf } from '../core/xpl-formation.js';
import { AIR, airTargetScore, planRebases } from '../core/xpl-air.js';
import { NAVAL, isWarship, navalRole } from '../core/xpl-naval.js';
import { idString, sameId, validId } from '../core/xpl-component-id.js';
import { meleeStrength, noteMeleeObtained } from './xpl-centre-defence.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

// The parameters the game's unit panel sends for an untargeted operation (unit-actions.js).
export const NO_TARGET = Object.freeze({ X: -9999, Y: -9999, UnitAbilityType: -1 });
const SETTLE_MAX_TURNS = 10;     // a site further away than this is not walked to...
const SETTLE_NEAR_TURNS = 5;     // ...this while we have fewer than NEAR_SETTLEMENTS (research/22 A1: game 7 walks of 6-10 turns)
const NEAR_SETTLEMENTS = 3;
const SETTLE_TURN_WEIGHT = 4;    // a site's value per turn of walking: value / (1 + turns / this)
const SETTLER_MAX_WAITS = 3;     // turns a settler waits in a threatened settlement before it goes for a near site...
const SETTLER_BRAVE_TURNS = 4;   // ...this close, by a way never next to the raiders (game 7: one waited 19 turns)
const DANGER_RADIUS = 3;         // a hostile military unit this close to a settler (or its site) is a danger...
const PATH_DANGER = 2;           // ...and so is a way that passes this close to one
const RETREAT_DANGER = 1;        // running home: never next to one
const RETREAT_TRIES = 4;         // our nearest settlements tried as a refuge
const SCOUT_DANGER = 2;          // scouts: no target this close to a hostile unit, no step next to one
const SCOUT_WIDE = 5;            // ...no game auto-explore with a recent hit or loss this close (it walked back into them)
const SCOUT_AUTO_MAX_DAMAGE = 20; // ...nor hurt this much (a hostile unit counts within DANGER_RADIUS, as before)
const SCOUT_WIDE_KEEP = 3;       // ...and then our own frontier targets keep this far from danger
const SCOUT_HEAL_DAMAGE = 40;    // a scout this hurt goes home and heals
const HIT_TURNS = 5;             // where one of our units was hit, the others keep away this long
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
export const THREAT_MIN = 2;     // ...this many of them: the settlement is threatened...
export const THREAT_CLOSE = 2;   // ...or one this close, or one within THREAT_RADIUS while its centre is damaged
const VILLAGE_GUARD_RADIUS = 2;  // an independent's unit this close to its own village guards it (not a raider)
const APPROACH_DISTANCE = 2;     // how close a unit walks to an independent's settlement
const BORDER_RADIUS = 2;         // an explorer this close to a civilization's land: ask for open borders
const REINFORCE_RADIUS = 2;      // defenders of a threatened settlement stand this close to it...
const REINFORCE_MAX_TURNS = 8;   // ...walking at most this many turns to get there
const REINFORCE_TRIES = 6;       // free tiles tried there, nearest first
const REINFORCE_REACH = 16;      // a free soldier this far from a settlement short of guards may be sent there...
const REINFORCE_PICKS = 3;       // ...the nearest ones weighed by their way there, for each guard it lacks
const FRONT_GUARDS = 1;          // a war front (a settlement near a leader at war with us or a war risk) wants this many melee guards
const STAGE_RADIUS = 2;          // ...standing this close to it, on our own land
const HOLDER_RADIUS = 1;         // an exposed settlement's holder stands on or next to its centre (research/37 §4)...
const EXPOSED_HOLD_TURNS = 3;    // ...or arrives within this many turns (no holder is bought for it then)
const AGE_START_TURNS = 2;       // soldiers resting on an age's first turns were carried over by the game (Continuity)
const AIR_STRIKE_RADIUS = 6;     // our aircraft strike hostile soldiers this close to our settlements (defence, not conquest)
const AIR_WATCH_RADIUS = 10;     // enemy aircraft seen this close to our settlements: interceptors wanted
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
// Settlers: when each got its first goal and how often it changed (research/21 C3a: seen in game 6, settlers
// walked for 20+ turns between sites far away).
const SETTLER_PATIENCE = 12;   // turns walking...
const SETTLER_RETARGETS = 3;   // ...or new goals, before the nearest safe site will do
const settlerWalks = new Map(); // unit key -> { since, retargets, gaveUp }
const settlerWaits = new Map(); // unit key -> { count, lastTurn }: turns waiting in a threatened settlement
const settlerNoOrder = new Map(); // unit key -> the turn its "no order" reason was last logged
const settlerIdle = new Map();    // unit key -> { count, lastTurn }: turns in a row with no site (X2, X3)
const lastDamage = new Map();     // unit key -> its damage at the last pass (a rise = it was hit)
const hitSpots = [];              // [{ x, y, turn }]: where our units were hit lately (dangerNear)
const settlerProgress = new Map(); // unit key -> { turn, turns, goal, stuck }: the way left to its site, a turn ago (X6)
const SETTLER_IDLE_TURNS = 2;     // turns with no site before the settler takes one up to SETTLE_MAX_TURNS away
const SETTLER_STUCK_TURNS = 2;    // turns with no progress toward its site before it founds where it stands or picks again
let seasBlockedTurn = -1;       // the last turn a settler's only sites lay across rough seas
// Sites a settler's order to walk to did not take ("unit key" -> Set of "x,y"): not again.
const failedSites = new Map();
// The role planned for settlements we founded ("x,y" -> "CITY" | "TOWN"): a "CITY" one is a
// town the autopilot converts (they are all founded as towns).
const foundedRoles = new Map();
// Soldiers the autopilot fortified or put on alert (unit keys): a war front may wake them; the player's own stay put. Kept
// in the save (RESTED_KEY) so a reload keeps them; at an age's start the soldiers the game carried over resting are added.
const restedByUs = new Set();
const RESTED_KEY = "_XPL_OBJ_RESTED"; // GameTutorial property: restedByUs, within an age (ids change at an age change)
let restedLoaded = false;
let restedSaved = "";
// Settlements whose defence UI.log described this turn ("x,y" -> turn).
const defenceNoted = new Map();
// Members of an army we unpacked this pass (unit key -> { turn, key: the settlement "x,y" }): on their way there, a turn out.
const unpacking = new Map();
// Armies whose unpacking UI.log explained this turn (commander key -> turn).
const unpackNoted = new Map();
// Settlements whose formation UI.log described this turn ("x,y" -> turn).
const formationNoted = new Map();
// Commanders' last formation moves (unit key -> turn): none again within FORM.COMMANDER_HOLD turns (game 38).
const commanderMoved = new Map();
// Settlements whose naval guard UI.log described this turn ("x,y" -> turn), and ship types whose attack operations it
// described (probe P-NAV-1, once a session).
const navalNoted = new Map();
const navalProbed = new Set();
// Enemy air attacks on us (research/37 §7B): [{ x, y, turn, type, owner }], the last AIR.RAID_TURNS turns.
const airRaids = [];
// Our fighters' rebases (unit key -> { turn, to, from, checked }), and the bases the game would not take one to ("key|x,y" -> turn).
const rebased = new Map();
const rebaseRefused = new Map();
let airLogged = -1; // the turn UI.log described the air wing

export function resetUnitGoals() {
    goals.clear();
    settlerWalks.clear();
    settlerWaits.clear();
    settlerNoOrder.clear();
    settlerIdle.clear();
    settlerProgress.clear();
    lastDamage.clear();
    hitSpots.length = 0;
    seasBlockedTurn = -1;
    foundedRoles.clear();
    dashes.clear();
    failedSites.clear();
    losses.clear();
    walks.clear();
    bankDone.clear();
    bankTried.clear();
    foundings.length = 0;
    restedByUs.clear();
    restedLoaded = true;
    restedSaved = "";
    safe(() => GameTutorial.setProperty(Database.makeHash(RESTED_KEY), null), null);
    defenceNoted.clear();
    progressMemo.clear();
    unpacking.clear();
    unpackNoted.clear();
    formationNoted.clear();
    commanderMoved.clear();
    navalNoted.clear();
    airRaids.length = 0;
    rebased.clear();
    rebaseRefused.clear();
    airLogged = -1;
}

/** restedByUs as the save keeps it (the first time in a session). */
function loadRested() {
    if (restedLoaded) return;
    restedLoaded = true;
    const raw = safe(() => GameTutorial.getProperty(Database.makeHash(RESTED_KEY)), null);
    const list = typeof raw === "string" ? safe(() => JSON.parse(raw), []) : [];
    for (const k of Array.isArray(list) ? list : []) if (typeof k === "string") restedByUs.add(k);
    restedSaved = [...restedByUs].sort().join(",");
}

/** restedByUs into the save when it changed. */
function saveRested() {
    const sig = [...restedByUs].sort().join(",");
    if (sig === restedSaved) return;
    restedSaved = sig;
    safe(() => GameTutorial.setProperty(Database.makeHash(RESTED_KEY), JSON.stringify([...restedByUs])), null);
}

/**
 * Game 30: under the game's default age transition (Continuity) every unit comes back where it stood and as it was, so
 * fortified soldiers start the age fortified, and the autopilot's own memory of them is gone (new ids). Data shows 11
 * soldiers resting at M1 before any order; a war front then stood at 0 of 1 guards for 8 turns with 13 soldiers
 * available. Soldiers resting on an age's first AGE_START_TURNS turns are taken as the autopilot's.
 */
function adoptCarriedOver(units) {
    if (!(Number(safe(() => Game.turn, 99)) <= AGE_START_TURNS)) return;
    const A = globalThis.UnitActivityTypes;
    if (!A) return;
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!isSoldier(def) || def.Domain !== "DOMAIN_LAND" || u.isCommanderUnit || u.isOnMap === false) continue;
        const act = u.activityType;
        if (act === undefined || act === A.NONE || act === A.AWAKE || act === A.OPERATION || act === A.HEAL) continue;
        restedByUs.add(unitKey(u.id));
    }
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

/**
 * Waiting for orders as the game sees it: idle, or awake with moves left after part of a move (the game stopped a
 * queued move on its way). Game 12 T31: a commander stopped on its way to its post held the turn; it had moved, so
 * it was never idle, never skipped.
 */
export function readyForOrders(u) {
    if (isIdle(u)) return true;
    if (!u || u.isOnMap === false || u.isDead === true || u.canMove === false || u.hasMoved !== true) return false;
    const A = globalThis.UnitActivityTypes;
    if (A && u.activityType !== undefined && u.activityType !== A.NONE && u.activityType !== A.AWAKE) return false;
    return Number(u.Movement?.movementMovesRemaining ?? 0) > 0;
}

const STUCK_MOVE_TURNS = 2;   // a unit standing on one tile this many turns with a move order: the order is cancelled
const walks = new Map();      // unit key -> { x, y, dest, turn }: where it stood with its move order, since when

/**
 * Move orders the game keeps while the unit does not move (its way blocked by raiders or a full tile): after
 * STUCK_MOVE_TURNS turns on one tile the order is cancelled, so the unit gets new orders or is skipped. Game 12
 * T26-T31: a commander walking to its post was "busy" for 5 turns, never re-ordered. Settlers have their own
 * watchdog (settlerStuck). @returns log entries
 */
function releaseStuckMoves(units) {
    const out = [];
    const A = globalThis.UnitActivityTypes;
    if (!A) return out;
    const seen = new Set();
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || truthy(def.FoundCity) || u.activityType !== A.OPERATION || u.isOnMap === false || !u.location) continue;
        const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
        if (!dest || !(dest.x >= 0) || same(dest, u.location)) continue;
        const k = unitKey(u.id);
        seen.add(k);
        const to = `${dest.x},${dest.y}`;
        const w = walks.get(k);
        if (!w || !same(w, u.location) || w.dest !== to) {
            walks.set(k, { x: u.location.x, y: u.location.y, dest: to, turn: Game.turn });
            continue;
        }
        if (Game.turn - w.turn < STUCK_MOVE_TURNS) continue;
        const CANCEL = "UNITCOMMAND_CANCEL";
        if (!safe(() => Game.UnitCommands.canStart(u.id, CANCEL, NO_TARGET, false), null)?.Success) continue;
        Game.UnitCommands.sendRequest(u.id, CANCEL, { ...NO_TARGET });
        walks.delete(k);
        goals.delete(k);
        out.push({ key: "MOVE_STUCK", args: [nameOf(def), dest.x, dest.y, Game.turn - w.turn] });
    }
    for (const k of [...walks.keys()]) if (!seen.has(k)) walks.delete(k);
    return out;
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
    // Never onto a tile that hurts at the turn's start (the plague, fallout, fire; game 18), unless already there.
    if (!same(u.location, loc) && hazardAt(loc) > 0) return false;
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
        if (ship ? !safe(() => GameplayMap.isWater(loc.x, loc.y), false) : onWater(loc)) continue;
        const r = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
        if (!r?.plots?.length) continue;
        const turns = Number(r.turns?.[r.turns.length - 1]) || r.plots.length;
        if (!best || turns < best.turns) best = { loc, turns };
    }
    if (!best || startsWar(u, best.loc) || !moveTo(u, best.loc)) return null;
    ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
    return { key: "LEFT_OCEAN", args: [nameOf(def), best.loc.x, best.loc.y] };
}

const WATER_ESCAPE_TURNS = 3;    // a land unit waiting on water looks for land this close

/** Water for a land unit: coast, ocean or a navigable river (where it is embarked). */
function onWater(loc) {
    return !!loc && (!!safe(() => GameplayMap.isWater(loc.x, loc.y), false) || !!safe(() => GameplayMap.isNavigableRiver(loc.x, loc.y), false));
}

/**
 * Is this land unit on the water now (it cannot fight)? The game's own word, `unit.isEmbarked` (a bridge lets land
 * units cross a navigable river without embarking: research/37 §3C), else its tile.
 */
export const afloat = (u) => (typeof u?.isEmbarked === "boolean" ? u.isEmbarked : onWater(u?.location));

/**
 * Where a unit is: its own tile, else (packed in an army and off the map, or an aircraft at its base) its army's
 * (`Armies.get(armyId).location`: research/37 §3E, §5A). @returns { x, y } or null
 */
export function unitTile(u) {
    if (u?.location && u.location.x >= 0 && u.location.y >= 0) return u.location;
    const at = safe(() => Armies.get(u.armyId)?.location, null);
    return at && at.x >= 0 && at.y >= 0 ? at : null;
}

/**
 * May a unit of this kind stand on this tile? Ships: water or a navigable river (gotcha 4: a river is not
 * GameplayMap.isWater); land units: neither (they would be embarked and could not fight: research/37 §3C).
 */
function standsOn(def, loc) {
    if (def?.Domain === "DOMAIN_SEA") return !!safe(() => GameplayMap.isWater(loc.x, loc.y), false) || !!safe(() => GameplayMap.isNavigableRiver(loc.x, loc.y), false);
    return !onWater(loc);
}

/**
 * A land soldier or scout waiting on water (coast, ocean or a navigable river, where it is
 * embarked: it cannot attack, and only moving or skipping is allowed) goes to the nearest land
 * tile it reaches within WATER_ESCAPE_TURNS that has room for it and no hostile unit next to it.
 * Seen in game: a scout skipped its turn on shallow water 3 turns until a ship killed it; Ming's
 * ranged units waiting on a navigable river could not shoot and were destroyed. Units walking
 * somewhere keep their order. @returns a log entry or null
 */
function leaveTheWater(u, def, ctx) {
    if (!afloat(u)) return null;
    const here = u.location;
    let best = null;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, OCEAN_ESCAPE_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || onWater(loc) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || !roomFor(def, loc) || dangerNear(loc, 1, ctx)) continue;
        const r = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
        if (!r?.plots?.length) continue;
        const turns = Number(r.turns?.[r.turns.length - 1]) || r.plots.length;
        if (turns > WATER_ESCAPE_TURNS) continue;
        if (!best || turns < best.turns || (turns === best.turns && r.plots.length < best.steps)) best = { loc, turns, steps: r.plots.length };
    }
    if (!best || startsWar(u, best.loc) || !moveTo(u, best.loc)) return null;
    ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
    return { key: "LEFT_WATER", args: [nameOf(def), best.loc.x, best.loc.y] };
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

/**
 * Notes where our units were hit since the last pass (their damage rose): a hostile unit is about there, maybe out
 * of sight now (game 10: a scout hit at 51,13, stepped away, and the game's auto-explore took it back to be hit there
 * again). Each spot is danger for HIT_TURNS (dangerNear).
 */
function noteHits(units) {
    for (const u of units) {
        const k = unitKey(u.id);
        const d = Number(u.Health?.damage) || 0;
        const before = lastDamage.get(k);
        if (before !== undefined && d > before && u.location) hitSpots.push({ x: u.location.x, y: u.location.y, turn: Game.turn });
        lastDamage.set(k, d);
    }
    for (let i = hitSpots.length - 1; i >= 0; i--) if (Game.turn - hitSpots[i].turn >= HIT_TURNS) hitSpots.splice(i, 1);
}

/**
 * Hostile units near, or one of our units died or was hit near here lately. `from`: the tile a unit leaves; the
 * hit spots within `radius` of it do not count (a unit hit where it stands must be able to walk away).
 */
function dangerNear(loc, radius, ctx, from = null) {
    return hostileNear(loc, radius, ctx) || marksNear(loc, radius, from);
}

/** Where our units died (their targets' losses) or were hit lately, within `radius` (not counting those near `from`). */
function marksNear(loc, radius, from = null) {
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    for (const h of hitSpots) {
        if (Game.turn - h.turn < HIT_TURNS && dist(loc, h) <= radius && !(from && dist(from, h) <= radius)) return true;
    }
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
    const via = findDetour(u, target, keep, ctx);
    if (!via || !moveTo(u, via)) return null;
    ctx.stepTo.add(`${via.x},${via.y}`);
    return via;
}

/**
 * The waypoint detourToward walks to, or null: within DETOUR_RADIUS and 2 turns, more than `keep` from danger by a
 * way that stays so, no further from the target than one step back (going around widely may need one; game 10: a
 * settler retreated home twice instead), the nearest to the target first.
 */
function findDetour(u, target, keep, ctx) {
    const here = u.location;
    const def = safe(() => GameInfo.Units.lookup(u.type), null);
    const left = (l) => safe(() => GameplayMap.getPlotDistance(l.x, l.y, target.x, target.y), Infinity);
    const now = left(here);
    const options = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, DETOUR_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        // Around the danger: sideways, or one step back at most.
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`) || left(loc) > now + 1) continue;
        if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || !standsOn(def, loc) || dangerNear(loc, keep, ctx)) continue;
        options.push({ loc, score: left(loc) });
    }
    options.sort((a, b) => a.score - b.score);
    for (const { loc } of options.slice(0, ROAM_TRIES * 2)) {
        const p = pathTo(u, loc);
        if (!p || p.turns > 2 || !wayIsSafe(u, p, keep, ctx) || startsWar(u, loc)) continue;
        return loc;
    }
    return null;
}

/**
 * A unit with hostile units near it steps to the tile within reach this turn that is furthest
 * from them (scouts, and settlers with no safe way home). @returns a log entry or null
 */
function stepAway(u, def, ctx, key = "UNIT_AWAY", { ownLand = false } = {}) {
    const here = u.location;
    const mine = (loc) => safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid();
    const gap = (loc) => {
        for (let r = 0; r <= DANGER_RADIUS + 1; r++) if (hostileNear(loc, r, ctx)) return r;
        return DANGER_RADIUS + 2;
    };
    let best = { loc: null, gap: gap(here) };
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, 2), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (!standsOn(def, loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
        // A settler on our land never steps off it (research/22 B8: seen in game 7, one stepped out of our
        // borders and was killed); one already outside may step anywhere away from them.
        if (ownLand && mine(here) && !mine(loc)) continue;
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
/**
 * May the game explore with this scout by itself? Not on rough seas, not hurt, and not with a hostile unit, a loss
 * or a hit within SCOUT_WIDE (game 10: after a step away, its auto-explore took a scout back to the warrior that had
 * just hit it, and it was hit again on the same tile).
 */
function autoExploreIsSafe(u, ctx) {
    // Not too wide for visible hostile units: in a crowded Antiquity a scout then never explored (game 11: 1-2 scouts
    // idle in half the passes).
    return !roughSeas() && !(Number(u.Health?.damage) >= SCOUT_AUTO_MAX_DAMAGE) && !hostileNear(u.location, DANGER_RADIUS, ctx)
        && !marksNear(u.location, SCOUT_WIDE);
}

/**
 * A scout hurt by SCOUT_HEAL_DAMAGE or more: heals on our land with nobody near, else walks home (our nearest
 * settlement) by a way never within SCOUT_DANGER of danger. @returns a log entry or null
 */
function scoutHeals(u, def, ctx) {
    if (!(Number(u.Health?.damage) >= SCOUT_HEAL_DAMAGE)) return null;
    const mine = safe(() => GameplayMap.getOwner(u.location.x, u.location.y), -1) === pid();
    if (mine && !dangerNear(u.location, SCOUT_DANGER + 1, ctx)) {
        return operate(u, "UNITOPERATION_REST_UNTIL_HEALED") ? { key: "HEAL", args: [nameOf(def)] } : null;
    }
    const homes = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? [])
        .map((c) => ({ c, d: safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, c.location.x, c.location.y), Infinity) }))
        .sort((a, b) => a.d - b.d);
    for (const { c } of homes.slice(0, RETREAT_TRIES)) {
        const p = pathTo(u, c.location);
        if (!p || !wayIsSafe(u, p, SCOUT_DANGER, ctx)) continue;
        if (!roomFor(def, c.location) && p.plots.length > 1) continue;
        if (!moveTo(u, c.location)) continue;
        return { key: "SCOUT_HOME", args: [nameOf(def), safe(() => Locale.compose(c.name), "?")] };
    }
    return null;
}

const VILLAGE_SCOUT_RADIUS = 12; // unseen villages this close to one of our settlements are scouted first...
const VILLAGE_SCOUT_TURNS = 8;   // ...when a scout reaches a tile in sight of one within this many turns
const VILLAGE_SIGHT = 2;         // a tile this far from a village reveals it

/**
 * An unseen village near our settlements: a scout goes to a tile in sight of it (VILLAGE_SIGHT), the nearest to our
 * settlements first, one scout each (goal `{village}`). Its independent is then met: befriending becomes possible
 * (game 10: «villages 0 seen, 16 unseen» all Antiquity; the game offered no befriending of the two independents that
 * raided us until turns 56 and 69, and they took two of our three settlements). @returns a log entry or null
 */
function scoutVillage(u, def, ctx) {
    ctx.unseenVillages ??= (safe(() => villagesOf(pid(), true), []) ?? []).filter((v) => !v.revealed);
    if (ctx.unseenVillages.length === 0) return null;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const near = (v) => Math.min(Infinity, ...ours.map((o) => safe(() => GameplayMap.getPlotDistance(o.x, o.y, v.x, v.y), Infinity)));
    const taken = new Set([...goals.entries()].filter(([k, g]) => g.village && k !== unitKey(u.id)).map(([, g]) => g.village));
    const list = ctx.unseenVillages.map((v) => ({ v, d: near(v) })).filter(({ v, d }) => d <= VILLAGE_SCOUT_RADIUS && !taken.has(`${v.x},${v.y}`)).sort((a, b) => a.d - b.d);
    for (const { v } of list) {
        let best = null;
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(v.x, v.y, VILLAGE_SIGHT), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || same(loc, v) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
            if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || dangerNear(loc, 1, ctx)) continue;
            const p = pathTo(u, loc);
            if (!p || p.turns > VILLAGE_SCOUT_TURNS || !wayIsSafe(u, p, 1, ctx) || startsWar(u, loc)) continue;
            if (!best || p.turns < best.turns) best = { loc, turns: p.turns };
        }
        if (!best || !moveTo(u, best.loc)) continue;
        ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
        goals.set(unitKey(u.id), { village: `${v.x},${v.y}` });
        return { key: "SCOUT_VILLAGE", args: [nameOf(def), independentNameOf(v.id), best.loc.x, best.loc.y] };
    }
    return null;
}

function explore(u, def, ctx) {
    if (!hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) return null;
    // Hostile units near: away from them first (scouts are not for fighting).
    if (hostileNear(u.location, SCOUT_DANGER, ctx)) {
        const away = stepAway(u, def, ctx);
        if (away) return away;
    }
    const heal = scoutHeals(u, def, ctx);
    if (heal) return heal;
    // Villages near us first: met, they can be befriended before they raid us.
    const village = scoutVillage(u, def, ctx);
    if (village) return village;
    const found = toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
    if (found) return found;
    if (autoExploreIsSafe(u, ctx) && operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) return { key: "EXPLORE", args: [nameOf(def)] };
    // Danger around, or the game's automatic exploring is not offered (seen in game when its reach is explored):
    // walk to the edge of the fog ourselves, further than military units do, widely around danger.
    const frontier = toFrontier(u, def, ctx, SCOUT_RADIUS, SCOUT_MAX_TURNS, { keep: SCOUT_WIDE_KEEP });
    if (frontier) return frontier;
    // Nothing safe to explore and a little hurt: it heals meanwhile instead of standing idle.
    if (Number(u.Health?.damage) > 0 && !hostileNear(u.location, SCOUT_DANGER, ctx) && operate(u, "UNITOPERATION_REST_UNTIL_HEALED")) return { key: "HEAL", args: [nameOf(def)] };
    return null;
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
 * A soldier of a leader at risk of war with us (steps' assessWar: Unfriendly and close, or spying on us):
 * danger for settlers and scouts too, though not at war yet (research/23 D9: game 8, a settler walked past
 * Prussian Men-at-Arms the turn before Prussia declared, and was killed).
 */
function riskArmy(unit, ctx) {
    if (!unit || !ctx.riskOwners?.has(unit.owner)) return false;
    return safe(() => GameInfo.Units.lookup(unit.type)?.CoreClass, null) === "CORE_CLASS_MILITARY";
}

/**
 * Is a hostile military unit (hostileOwner, or a war risk's: riskArmy) within `radius` of this tile? Plots
 * are looked at once per pass (ctx.hostileAt memo).
 */
function hostileNear(loc, radius, ctx) {
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        if (!ctx.hostileAt.has(idx)) {
            // 1: a hostile unit (or a Hostile war risk's soldier) stands there; 2: only a soldier of a war risk that is
            // not Hostile; 0: none.
            const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            let code = 0;
            for (const id of (at ? safe(() => MapUnits.getUnits(at.x, at.y), []) : null) ?? []) {
                const unit = safe(() => Units.get(id), null);
                if (hostileOwner(unit) || (riskArmy(unit, ctx) && ctx.riskHostile?.has(unit.owner))) {
                    code = 1;
                    break;
                }
                if (riskArmy(unit, ctx)) code = 2;
            }
            ctx.hostileAt.set(idx, code);
        }
        const code = ctx.hostileAt.get(idx);
        if (code === 1 || code === true) return true;
        // Settlers (ctx.riskCalm) mind a war risk's soldiers only next to them (research/24 X4: Napoleon's espionage
        // made him a risk A22-A70 and his soldiers kept every site «unsafe»).
        if (code === 2 && !(ctx.riskCalm && safe(() => { const at = GameplayMap.getLocationFromIndex(idx); return GameplayMap.getPlotDistance(loc.x, loc.y, at.x, at.y); }, 0) > 1)) return true;
    }
    return false;
}

/** Runs `fn` with a settler's view of danger (ctx.riskCalm: hostileNear). */
function asSettler(ctx, fn) {
    const before = ctx.riskCalm;
    ctx.riskCalm = true;
    try {
        return fn();
    } finally {
        ctx.riskCalm = before;
    }
}

/** A way whose every step (its start aside) stays more than `radius` from hostile units (and recent losses). */
function wayIsSafe(u, path, radius, ctx) {
    const start = safe(() => GameplayMap.getIndexFromXY(u.location.x, u.location.y), -1);
    return path.plots.every((idx) => {
        if (idx === start) return true;
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        return !loc || !dangerNear(loc, radius, ctx, u.location);
    });
}

/**
 * Closer than TUNING.FOREIGN_MIN_DISTANCE to another player's settlement centre (we can see), or
 * so close to an independent's village that founding here would anger it (angersVillage: within 3
 * of any, within 6 of one not friendly to us)? Also checks the game's own site suggestions.
 */
function tooCloseToForeign(loc, ctx) {
    // A site taken anywhere the game allows (anySite) keeps only off a village's doorstep.
    if (loc?.any) return villageDoorstep(loc, ctx);
    // A site from the relaxed search (sites ran out far below the cap) uses its looser distances.
    const T = siteTuning(!!loc?.relaxed);
    ctx.foreignCentres ??= (safe(() => Players.getAlive(), []) ?? [])
        .filter((p) => p && p.id !== pid())
        .flatMap((p) => (safe(() => p.Cities.getCities(), []) ?? []).map((c) => c.location))
        .filter((c) => c && safe(() => GameplayMap.getRevealedState(pid(), c.x, c.y), 0) !== RevealedStates.HIDDEN);
    if (ctx.foreignCentres.some((c) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.x, c.y), Infinity) < T.FOREIGN_MIN_DISTANCE)) return true;
    ctx.villages ??= safe(() => villagesOf(pid()), []) ?? [];
    return ctx.villages.some((v) => angersVillage(safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, v.x, v.y), Infinity), v.friendly, T));
}

// A settlement anywhere the game allows (research/31 §3): settlements are military points, so with a countdown to block or
// to start (the strategy's settleAnywhere) a settler with no site for ANYWHERE_IDLE_TURNS takes the nearest tile within
// ANYWHERE_RADIUS where the game accepts a settlement (isValidLandClaimLocation), our own spacing aside: never next to a
// village (it turns hostile at once within ANYWHERE_VILLAGE: root gotcha 27), never into danger, never a war.
const ANYWHERE_IDLE_TURNS = 3;
const ANYWHERE_RADIUS = 8;
const ANYWHERE_PATHS = 12; // ways looked at, the nearest tiles first
const ANYWHERE_VILLAGE = 3;

/** Is a village within ANYWHERE_VILLAGE of this tile? */
function villageDoorstep(loc, ctx) {
    ctx.villages ??= safe(() => villagesOf(pid()), []) ?? [];
    return ctx.villages.some((v) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, v.x, v.y), Infinity) <= ANYWHERE_VILLAGE);
}

/** The nearest tile this settler reaches safely where the game accepts a settlement, or null. */
function anySite(u, taken, ctx) {
    const here = u.location;
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, ANYWHERE_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || taken.has(`${loc.x},${loc.y}`) || onWater(loc)) continue;
        if (safe(() => GameplayMap.getRevealedState(pid(), loc.x, loc.y), RevealedStates.HIDDEN) === RevealedStates.HIDDEN) continue;
        tiles.push({ x: loc.x, y: loc.y, d: safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), Infinity) });
    }
    tiles.sort((a, b) => a.d - b.d);
    let paths = 0;
    for (const t of tiles) {
        const loc = { x: t.x, y: t.y, any: true };
        if (!siteStillFree(loc) || hazardAt(loc) > 0 || dangerNear(loc, DANGER_RADIUS, ctx) || villageDoorstep(loc, ctx) || startsWar(u, loc)) continue;
        if (same(here, loc)) return { ...loc, turns: 0, source: "ANY", role: null };
        if (++paths > ANYWHERE_PATHS) break;
        const p = pathTo(u, loc);
        if (!p || p.turns > SETTLE_MAX_TURNS || !wayIsSafe(u, p, PATH_DANGER, ctx)) continue;
        return { ...loc, turns: p.turns, source: "ANY", role: null };
    }
    return null;
}

/** A site a settler may go for now: no hostile unit near it, not too close to another player. */
function siteIsSafe(loc, ctx) {
    return !dangerNear(loc, DANGER_RADIUS, ctx) && !tooCloseToForeign(loc, ctx);
}

/**
 * Why a settler may not go for this site, or how far it is: { turns } or { reason } with reason TAKEN (another
 * settler's), FAILED (its order there did not take), OCCUPIED (not a valid claim now), DANGER (hostile units
 * near it), FOREIGN (too close to a foreign settlement or a village), WAR (walking there starts a war), NO_PATH,
 * SEAS (only across rough seas), FAR (beyond `limit` turns), UNSAFE_WAY (the way passes within `wayDanger` of
 * hostile units), HAZARD (the plague or another damaging plot effect on it: game 18). pickSite and the "no order" log share it (research/24 X1: «2 sites known, 0 unsafe, 0 seas,
 * 0 too far» while both were out of reach).
 */
function siteVerdict(u, loc, taken, ctx, wayDanger, limit) {
    if (!loc) return { reason: "NO_PATH" };
    const k = `${loc.x},${loc.y}`;
    if (taken.has(k)) return { reason: "TAKEN" };
    if ((failedSites.get(unitKey(u.id)) ?? new Set()).has(k)) return { reason: "FAILED" };
    if (!siteStillFree(loc)) return { reason: "OCCUPIED" };
    if (hazardAt(loc) > 0) return { reason: "HAZARD" };
    if (dangerNear(loc, DANGER_RADIUS, ctx)) return { reason: "DANGER" };
    if (tooCloseToForeign(loc, ctx)) return { reason: "FOREIGN" };
    if (startsWar(u, loc)) return { reason: "WAR" };
    const p = pathTo(u, loc);
    if (!p) {
        const raw = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
        return { reason: raw?.plots?.length && crossesRoughSeas(u, raw.plots) ? "SEAS" : "NO_PATH" };
    }
    if (p.turns > limit) return { reason: "FAR", turns: p.turns };
    if (!wayIsSafe(u, p, wayDanger, ctx)) return { reason: "UNSAFE_WAY" };
    return { turns: p.turns };
}

/** The farthest walk to a site: SETTLE_NEAR_TURNS below NEAR_SETTLEMENTS settlements, else SETTLE_MAX_TURNS. */
function siteLimit() {
    const n = Number(safe(() => Players.get(pid()).Stats.numSettlements, 0)) || 0;
    return n < NEAR_SETTLEMENTS ? SETTLE_NEAR_TURNS : SETTLE_MAX_TURNS;
}

/** The best free site this settler reaches in time by a safe way (every step further than
 * `wayDanger` from hostile units): our ranked sites (the role we need first, see neededRole),
 * else the game's. The nearest (a settler that waited or walked too long) looks up to SETTLE_MAX_TURNS away. */
function pickSite(u, taken, ctx, wayDanger = PATH_DANGER, { nearest = false, maxTurns = null } = {}) {
    // Few settlements: only near sites (research/22 A1); a long walk is a lost settler or a lost decade. The nearest
    // site any distance up to SETTLE_MAX_TURNS (research/24 X2: below 3 settlements the give-up never found one).
    const limit = maxTurns ?? (nearest ? SETTLE_MAX_TURNS : siteLimit());
    // The turns to a site it may go for (siteVerdict), or null.
    const reachable = (loc, within = limit) => {
        const v = siteVerdict(u, loc, taken, ctx, wayDanger, within);
        return v.reason ? null : v.turns;
    };
    // Economy in the Exploration age: the Distant Lands first (treasure convoys, more settlements),
    // from the game's own suggestions, which favour the other hemisphere and treasure resources.
    if (ctx.distant) {
        const me = safe(() => Players.get(pid()), null);
        const offers = safe(() => me.AI.getBestSettleLocationsForSettler(DISTANT_SUGGESTIONS, u.location), []) ?? [];
        for (const s of offers) {
            const loc = s?.location ? { x: s.location.x, y: s.location.y } : null;
            if (!loc || !safe(() => me.isDistantLands({ x: loc.x, y: loc.y }), false)) continue;
            const t = reachable(loc, DISTANT_MAX_TURNS);
            if (t === null) continue;
            return { ...loc, turns: t, source: "DISTANT", role: null };
        }
    }
    const picks = state.get().results.sites?.picks ?? [];
    const want = neededRole();
    // Nearest: any role, the safe reachable site with the fewest turns (a settler that has wandered too long).
    if (nearest) {
        const all = [...picks.map((p) => ({ x: p.x, y: p.y, role: p.role ?? null, source: "PLAN" })),
            ...(safe(() => Players.get(pid()).AI.getBestSettleLocationsForSettler(AI_SITE_SUGGESTIONS, u.location), []) ?? []).filter((s) => s?.location).map((s) => ({ x: s.location.x, y: s.location.y, role: null, source: "AI" }))];
        let best = null;
        for (const c of all) {
            const t = reachable(c);
            if (t !== null && (!best || t < best.turns)) best = { ...c, turns: t };
        }
        return best;
    }
    // The role we need first; within it the best value per turn of walking (not the best site 10 turns away).
    const worth = (p, t) => (Number(p.value ?? p.score) || 1 / (Number(p.rank) || 1)) / (1 + t / SETTLE_TURN_WEIGHT);
    for (const group of [picks.filter((p) => (p.role ?? want) === want), picks.filter((p) => (p.role ?? want) !== want)]) {
        let best = null;
        for (const p of group) {
            const loc = { x: p.x, y: p.y, relaxed: !!p.relaxed };
            const t = reachable(loc);
            if (t === null) continue;
            const w = worth(p, t);
            if (!best || w > best.w) best = { w, site: { ...loc, turns: t, source: "PLAN", role: p.role ?? null, relaxed: !!p.relaxed } };
        }
        if (best) return best.site;
    }
    const ai = safe(() => Players.get(pid()).AI.getBestSettleLocationsForSettler(AI_SITE_SUGGESTIONS, u.location), []) ?? [];
    for (const s of ai) {
        const loc = s?.location ? { x: s.location.x, y: s.location.y } : null;
        const t = reachable(loc);
        if (t !== null) return { ...loc, turns: t, source: "AI" };
    }
    // Every way passes danger: a site reached around it, widely (a waypoint first: `via`; game 10).
    for (const p of [...picks].sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99))) {
        const loc = { x: p.x, y: p.y, relaxed: !!p.relaxed };
        const v = siteVerdict(u, loc, taken, ctx, wayDanger, limit);
        if (v.reason !== "UNSAFE_WAY") continue;
        const via = findDetour(u, loc, Math.max(wayDanger, DANGER_RADIUS), ctx);
        if (via) return { ...loc, turns: v.turns ?? null, source: "PLAN", role: p.role ?? null, via };
    }
    return null;
}

/**
 * A settler got no order: why, once a turn in UI.log (research/22 A1: game 7 had a settler idle for 28
 * turns with no word). When some site would be reachable but for rough seas, the research step goes to
 * Shipbuilding first (seasBlocked).
 */
function noteNoSite(u, ctx, taken = new Set(), limit = siteLimit()) {
    const k = unitKey(u.id);
    if (settlerNoOrder.get(k) === Game.turn) return;
    settlerNoOrder.set(k, Game.turn);
    const idle = settlerIdle.get(k);
    settlerIdle.set(k, { count: idle && idle.lastTurn === Game.turn - 1 ? idle.count + 1 : 1, lastTurn: Game.turn });
    const picks = state.get().results.sites?.picks ?? [];
    const why = {};
    for (const p of picks) {
        // A relaxed pick by the relaxed rules, as pickSite judges it (research/31 §3: game 25 reported them FOREIGN).
        const v = siteVerdict(u, { x: p.x, y: p.y, relaxed: !!p.relaxed }, taken, ctx, PATH_DANGER, limit);
        const r = v.reason ?? "OK";
        why[r] = (why[r] ?? 0) + 1;
    }
    if (why.SEAS > 0) seasBlockedTurn = Game.turn;
    log.warn(`settler: no order at ${u.location.x},${u.location.y} (${settlerIdle.get(k).count} turns): ${picks.length} sites known, limit ${limit}t ${JSON.stringify(why)}`);
}

/** A settler found no site on SETTLER_IDLE_TURNS turns in a row (the hud's relaxed search runs: research/24 X3). */
export function settlersStarved() {
    return [...settlerIdle.values()].some((v) => v.count >= SETTLER_IDLE_TURNS && Game.turn - v.lastTurn <= 1);
}

/**
 * Is this settler's way to its site no shorter than SETTLER_STUCK_TURNS turns ago (research/24 X6: one stood a tile
 * from its site for 10 turns; «8 turns» took 25)? Measured once a turn.
 */
function settlerStuck(u) {
    const k = unitKey(u.id);
    const goal = goals.get(k);
    if (goal?.x === undefined) {
        settlerProgress.delete(k);
        return false;
    }
    const at = `${goal.x},${goal.y}`;
    const prev = settlerProgress.get(k);
    if (prev?.turn === Game.turn && prev.goal === at) return prev.stuck >= SETTLER_STUCK_TURNS;
    const turns = pathTurns(u, goal) ?? Infinity;
    const stuck = prev && prev.goal === at && prev.turn < Game.turn && turns >= prev.turns && !same(u.location, goal) ? prev.stuck + 1 : 0;
    settlerProgress.set(k, { turn: Game.turn, turns, goal: at, stuck });
    return stuck >= SETTLER_STUCK_TURNS;
}

/** A stuck settler founds where it stands when the game and our rules allow it, else drops that site and picks again. */
function unstick(u, def, taken, ctx) {
    const k = unitKey(u.id);
    const goal = goals.get(k);
    settlerProgress.delete(k);
    log.warn(`settler: no progress toward ${goal?.x},${goal?.y} for ${SETTLER_STUCK_TURNS} turns at ${u.location.x},${u.location.y}`);
    const cap = settlementCount();
    if ((!cap || cap.n < cap.cap) && siteStillFree(u.location) && !tooCloseToForeign(u.location, ctx) && operate(u, "UNITOPERATION_FOUND_CITY")) {
        goals.delete(k);
        noteFounding(u.location);
        noteFoundingNearVillage(u.location);
        return { key: "SETTLE_FOUND_HERE", args: [nameOf(def), u.location.x, u.location.y, goal?.x, goal?.y] };
    }
    if (goal?.x !== undefined) {
        if (!failedSites.has(k)) failedSites.set(k, new Set());
        failedSites.get(k).add(`${goal.x},${goal.y}`);
        taken.delete(`${goal.x},${goal.y}`);
    }
    goals.delete(k);
    return settle(u, def, taken, ctx);
}

/**
 * A safe site for a settler bought in this city (research/24 X7: one bought at E51 for 380 gold stood idle until the
 * age ended): a site of ours, or one the game suggests from there, on the same continent within 2 × SETTLE_MAX_TURNS
 * tiles, still free, with no hostile unit near and not too close to a foreign settlement or village.
 */
export function safeSiteFrom(from, riskOwners = []) {
    const ctx = { hostileAt: new Map(), riskOwners: new Set(riskOwners), riskHostile: new Set(), riskCalm: true };
    const continent = (l) => safe(() => GameplayMap.getContinentType(l.x, l.y), null);
    const home = continent(from);
    const sites = [
        ...(state.get().results.sites?.picks ?? []).map((p) => ({ x: p.x, y: p.y, relaxed: !!p.relaxed })),
        ...(safe(() => Players.get(pid()).AI.getBestSettleLocationsForSettler(AI_SITE_SUGGESTIONS, from), []) ?? []).filter((s) => s?.location).map((s) => ({ x: s.location.x, y: s.location.y })),
    ];
    return sites.some((p) => safe(() => GameplayMap.getPlotDistance(from.x, from.y, p.x, p.y), Infinity) <= 2 * SETTLE_MAX_TURNS
        && (home === null || continent(p) === home) && siteStillFree(p) && siteIsSafe(p, ctx));
}

/** Did a settler find its only sites across rough seas lately (research: Shipbuilding first)? */
export function seasBlocked() {
    return seasBlockedTurn >= 0 && Game.turn - seasBlockedTurn <= 3;
}

/** One of our soldiers stands on this tile. */
function garrisoned(loc) {
    return (safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).some((id) => {
        const unit = safe(() => Units.get(id), null);
        return unit?.owner === pid() && isSoldier(safe(() => GameInfo.Units.lookup(unit.type), null));
    });
}

/** Our settlement whose centre is on this tile, or null. */
function settlementAt(loc) {
    return (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).find((c) => c.location.x === loc.x && c.location.y === loc.y) ?? null;
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
        // Every turn in a settlement with raiders near counts as a wait, a retreat too (research/24 X5: 18 retreats
        // back and forth in Antiquity, and SETTLER_GOES never came).
        const k = unitKey(u.id);
        const w = settlerWaits.get(k) ?? { count: 0, lastTurn: -1 };
        if (w.lastTurn !== Game.turn) settlerWaits.set(k, { count: w.count + 1, lastTurn: Game.turn });
        // A garrisoned centre that is not under attack is safe enough to wait in.
        const held = garrisoned(homes[0].c.location) && !centreDamaged(homes[0].c.location);
        // Else to another of ours with none near, by a way never next to them (seen in game 5: settlers waited
        // inside threatened towns, SETTLER_WAITS, and were lost with them).
        for (const { c } of held || settlerWaits.get(k).count > SETTLER_MAX_WAITS ? [] : homes.slice(1, 1 + RETREAT_TRIES)) {
            if (hostileNear(c.location, DANGER_RADIUS, ctx)) continue;
            const p = pathTo(u, c.location);
            if (!p || p.turns > SETTLE_MAX_TURNS || !wayIsSafe(u, p, RETREAT_DANGER, ctx) || !moveTo(u, c.location)) continue;
            return { key: "SETTLER_RETREAT", args: [nameOf(def), safe(() => Locale.compose(c.name), "?")] };
        }
        // Waited long enough: a near site by a way never next to them (research/22 A1).
        if (settlerWaits.get(k).count > SETTLER_MAX_WAITS) {
            const near = pickSite(u, ctx.taken ?? new Set(), ctx, PATH_DANGER, { maxTurns: SETTLER_BRAVE_TURNS });
            if (near && !same(here, near) && moveTo(u, near)) {
                goals.set(k, near);
                settlerWaits.delete(k);
                return { key: "SETTLER_GOES", args: [nameOf(def), safe(() => Locale.compose(homes[0].c.name), "?"), w.count, near.x, near.y] };
            }
        }
        // Nowhere safer: wait there (an order it was walking out on is cancelled). Two civilians on one tile may not
        // skip (root CLAUDE.md gotcha 23): one steps aside, away from the raiders (game 10: two settlers on the capital
        // held the turn).
        const CANCEL = "UNITCOMMAND_CANCEL";
        if (!isIdle(u) && safe(() => Game.UnitCommands.canStart(u.id, CANCEL, NO_TARGET, false), null)?.Success) Game.UnitCommands.sendRequest(u.id, CANCEL, { ...NO_TARGET });
        if (!operate(u, "UNITOPERATION_SKIP_TURN")) {
            const aside = stepAside(u, def, ctx, { away: true });
            if (aside) return aside;
        }
        return { key: "SETTLER_WAITS", args: [nameOf(def), safe(() => Locale.compose(homes[0].c.name), "?")] };
    }
    for (const { c } of homes.slice(0, RETREAT_TRIES)) {
        const p = pathTo(u, c.location);
        if (!p || p.turns > SETTLE_MAX_TURNS || !wayIsSafe(u, p, RETREAT_DANGER, ctx) || !moveTo(u, c.location)) continue;
        return { key: "SETTLER_RETREAT", args: [nameOf(def), safe(() => Locale.compose(c.name), "?")] };
    }
    // No safe way home: the reachable tile furthest from them.
    return stepAway(u, def, ctx, "SETTLER_AWAY", { ownLand: true });
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
 * Each settlement over the cap costs happiness everywhere. Foundings ordered this turn that the game
 * has not made a settlement yet count too (pendingFoundings).
 */
function settlementCount() {
    const stats = safe(() => Players.get(pid()).Stats, null);
    const n = Number(stats?.numSettlements);
    const cap = Number(stats?.settlementCap);
    return Number.isFinite(n) && Number.isFinite(cap) && cap > 0 ? { n: n + pendingFoundings(), cap } : null;
}

/**
 * Foundings we ordered (research/28 §4): the game's count of settlements does not change until it handles them,
 * so every settler of a pass read the same number. Game 21 (E23): the cap rose from 8 to 9 and the three settlers
 * waiting at the cap all founded in one pass, 11 of 9, -5 Happiness in every settlement for each one over.
 */
const foundings = []; // { turn, x, y }
function noteFounding(loc) {
    while (foundings.length > 0 && foundings[0].turn !== Game.turn) foundings.shift();
    foundings.push({ turn: Game.turn, x: loc.x, y: loc.y });
}
/** This turn's foundings the game has not made a settlement of yet. */
function pendingFoundings() {
    return foundings.filter((f) => f.turn === Game.turn && !settlementAt(f)).length;
}

/**
 * Probe P2 (research/21 §2): in game 6 a settlement was founded 4 tiles from a camp created at the
 * age's start. UI.log gets the nearest independent village or camp at each founding: distance, type,
 * whether we had seen its tile, its relationship to us.
 */
function noteFoundingNearVillage(goal) {
    const all = safe(() => villagesOf(pid(), true), []) ?? [];
    let best = null;
    for (const v of all) {
        const d = safe(() => GameplayMap.getPlotDistance(goal.x, goal.y, v.x, v.y), Infinity);
        if (!best || d < best.d) best = { ...v, d };
    }
    if (!best) {
        log.warn(`settle: founding at ${goal.x},${goal.y}; no village or camp on the map`);
        return;
    }
    const rel = safe(() => Game.IndependentPowers.getIndependentRelationship(best.id, pid()), "?");
    log.warn(`settle: founding at ${goal.x},${goal.y}; nearest village ${best.d} tiles at ${best.x},${best.y} (${best.type}, ${best.revealed ? "seen" : "UNSEEN"}, relationship ${rel}, friendly ${best.friendly}); ${all.length} on the map`);
}

/**
 * At the cap a settler on its site does not found (seen in game: a settler trained below the cap
 * founded the 6th settlement of 5 after a story event had added one): it waits there, skipping
 * its turn, until the cap rises (civics, the next age), unless the military lever founds `past` it
 * (research/30 §1). @returns a log entry, or null to found
 */
function waitAtCap(u, def, goal, past = 0) {
    const c = settlementCount();
    if (!c || c.n < c.cap + Math.max(0, Number(past) || 0)) return null;
    operate(u, "UNITOPERATION_SKIP_TURN");
    return { key: "SETTLER_AT_CAP", args: [nameOf(def), goal.x, goal.y, c.n, c.cap] };
}

// A settler that steps onto its site with hostile units near founds in the same pass (settle, foundArrivals).
const dashes = new Map(); // unit key -> { x, y, turn, role }

/**
 * May this settler step onto its site now and found there (settle)? Next to it with a move left, the site still free, no
 * hostile unit on it or next to it, and below the settlement cap (the military lever's room past it counted).
 */
function dashable(u, goal, ctx) {
    if (safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, goal.x, goal.y), Infinity) !== 1) return false;
    if (!(Number(u.Movement?.movementMovesRemaining ?? 0) > 0)) return false;
    if (!siteStillFree(goal) || tooCloseToForeign(goal, ctx) || hostileNear(goal, 1, ctx)) return false;
    const c = settlementCount();
    return !c || c.n < c.cap + Math.max(0, Number(ctx.pastCap) || 0);
}

/**
 * Settlers that stepped onto their site this pass (SETTLER_DASH) found there now; one the game will not let found yet
 * (no move left) founds on its next pass, standing on its site. @returns log entries
 */
export function foundArrivals() {
    const out = [];
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const k = unitKey(u.id);
        const d = dashes.get(k);
        if (!d || d.turn !== Game.turn || !same(u.location, d)) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || !operate(u, "UNITOPERATION_FOUND_CITY")) continue;
        dashes.delete(k);
        goals.delete(k);
        noteFounding(d);
        if (d.role) foundedRoles.set(`${d.x},${d.y}`, d.role);
        noteFoundingNearVillage(d);
        out.push({ key: "SETTLE_FOUND", args: [nameOf(def), d.x, d.y] });
    }
    for (const [k, d] of [...dashes]) if (d.turn !== Game.turn) dashes.delete(k);
    return out;
}

/**
 * A settler founds on its site (not at the settlement cap: waitAtCap); with hostile units near
 * it, it steps onto its site when it is next to it (dashable), else gets away from them first (runFromDanger); it keeps its site while the site and the way
 * there stay safe, else it takes the best safe one it reaches (pickSite).
 */
function settle(u, def, taken, ctx) {
    if (!truthy(def.FoundCity)) return null;
    const k = unitKey(u.id);
    if (settlerStuck(u)) return unstick(u, def, taken, ctx);
    let goal = goals.get(k);
    // On its site: found at once (a settlement is safer than a settler).
    if (goal && same(u.location, goal) && siteStillFree(goal) && !tooCloseToForeign(goal, ctx)) {
        const wait = waitAtCap(u, def, goal, ctx.pastCap);
        if (wait) return wait;
        goals.delete(k);
        if (!operate(u, "UNITOPERATION_FOUND_CITY")) return null;
        noteFounding(goal);
        if (goal.role) foundedRoles.set(`${goal.x},${goal.y}`, goal.role);
        noteFoundingNearVillage(goal);
        return { key: "SETTLE_FOUND", args: [nameOf(def), goal.x, goal.y] };
    }
    if (hostileNear(u.location, DANGER_RADIUS, ctx)) {
        // Next to its site with a move left: onto it, founding this pass (foundArrivals), not back home through the open
        // (game 35: Бристоль's settler turned back from the tile next to its site, 2-3 tiles from an independent's Warrior,
        // and founded 5 turns later).
        if (goal && dashable(u, goal, ctx) && moveTo(u, goal)) {
            dashes.set(k, { x: goal.x, y: goal.y, turn: Game.turn, role: goal.role ?? null });
            return { key: "SETTLER_DASH", args: [nameOf(def), goal.x, goal.y] };
        }
        // Out in the open with its site still safe: around the danger, widely, toward it (game 10: a settler went home
        // twice instead and lost 4 turns).
        if (goal && !settlementAt(u.location) && siteStillFree(goal) && siteIsSafe(goal, ctx)) {
            const via = detourToward(u, goal, DANGER_RADIUS, ctx);
            if (via) {
                settlerProgress.delete(k); // a detour is progress too (settlerStuck measures afresh)
                return { key: "SETTLER_DETOUR", args: [nameOf(def), via.x, via.y, goal.x, goal.y] };
            }
        }
        goals.delete(k);
        // In one of our settlements: out to a safe site by a way that stays out of their reach
        // (every step further than DANGER_RADIUS from them, so it is not in danger again on the
        // way), else it waits there (runFromDanger). Seen in game: an independent's raiders stayed
        // near the capital for a whole age, and a settler waited 39 turns there, then 49 in
        // another settlement the next age.
        const home = settlementAt(u.location);
        const out = home ? pickSite(u, taken, ctx, DANGER_RADIUS) : null;
        // Its way may go around the danger first (`via`: findDetour).
        if (out && !same(u.location, out) && moveTo(u, out.via ?? out)) {
            taken.add(`${out.x},${out.y}`);
            goals.set(k, out);
            return { key: "SETTLER_LEAVES", args: [nameOf(def), safe(() => Locale.compose(home.name), "?"), out.x, out.y, out.turns ?? "?"] };
        }
        return runFromDanger(u, def, ctx);
    }
    if (goal) {
        const p = !siteStillFree(goal) || !siteIsSafe(goal, ctx) ? null : pathTo(u, goal);
        // Its way passes danger: around it, widely, keeping the site (game 10).
        if (p && !wayIsSafe(u, p, PATH_DANGER, ctx)) {
            const via = detourToward(u, goal, DANGER_RADIUS, ctx);
            if (via) {
                settlerProgress.delete(k); // a detour is progress too (settlerStuck measures afresh)
                return { key: "SETTLER_DETOUR", args: [nameOf(def), via.x, via.y, goal.x, goal.y] };
            }
        }
        if (!p || !wayIsSafe(u, p, PATH_DANGER, ctx)) goal = null;
    }
    const walk = settlerWalks.get(k) ?? { since: Game.turn, retargets: 0, gaveUp: false };
    settlerWalks.set(k, walk);
    let gaveUp = null;
    // Walking too long, or its goal changed too often: the nearest safe site will do, any role.
    if (!walk.gaveUp && (Game.turn - walk.since >= SETTLER_PATIENCE || walk.retargets >= SETTLER_RETARGETS)) {
        const near = pickSite(u, taken, ctx, PATH_DANGER, { nearest: true });
        if (near) {
            walk.gaveUp = true;
            gaveUp = { key: "SETTLER_GIVES_UP", args: [nameOf(def), Game.turn - walk.since, near.x, near.y, near.turns ?? "?"] };
            goal = near;
        }
    }
    // A rival's countdown to beat (the strategy's settleNear): the nearest safe site, also over a farther goal
    // (research/24 F1: game 9's denial settler walked 7 turns and founded a turn after Alexander's countdown began).
    if (ctx.settleNear) {
        const near = pickSite(u, taken, ctx, PATH_DANGER, { nearest: true });
        const now = goal ? pathTo(u, goal)?.turns ?? Infinity : Infinity;
        if (near && near.turns < now) goal = near;
    }
    const before = goals.get(k);
    if (!goal) goal = pickSite(u, taken, ctx);
    // No site on SETTLER_IDLE_TURNS turns in a row: one up to SETTLE_MAX_TURNS away will do (research/24 X2: below 3
    // settlements a site 6+ turns away was never taken; idle 13+ turns with sites known).
    const idle = settlerIdle.get(k);
    const starved = !!idle && idle.count >= SETTLER_IDLE_TURNS && Game.turn - idle.lastTurn <= 1;
    if (!goal && starved) goal = pickSite(u, taken, ctx, PATH_DANGER, { maxTurns: SETTLE_MAX_TURNS });
    // A countdown to block or to start (settlements are military points) and still no site: anywhere the game allows.
    let anywhere = null;
    if (!goal && ctx.anywhere && !!idle && idle.count >= ANYWHERE_IDLE_TURNS && Game.turn - idle.lastTurn <= 1) {
        goal = anySite(u, taken, ctx);
        if (goal) anywhere = { key: "SETTLE_ANYWHERE", args: [nameOf(def), goal.x, goal.y, goal.turns ?? "?"] };
    }
    if (!goal) {
        goals.delete(k);
        noteNoSite(u, ctx, taken, starved ? SETTLE_MAX_TURNS : siteLimit());
        return null; // nothing reachable safely: left to the player
    }
    settlerIdle.delete(k);
    settlerWaits.delete(k);
    if (before && !same(before, goal)) walk.retargets++;
    taken.add(`${goal.x},${goal.y}`);
    if (same(u.location, goal)) {
        const wait = waitAtCap(u, def, goal, ctx.pastCap);
        if (wait) {
            goals.set(k, goal);
            return wait;
        }
        goals.delete(k);
        if (!operate(u, "UNITOPERATION_FOUND_CITY")) return null;
        noteFounding(goal);
        if (goal.role) foundedRoles.set(`${goal.x},${goal.y}`, goal.role);
        noteFoundingNearVillage(goal);
        return { key: "SETTLE_FOUND", args: [nameOf(def), goal.x, goal.y] };
    }
    goals.set(k, goal);
    if (goal.via) {
        // Around the danger first; the site stays its goal (findDetour in pickSite).
        if (!moveTo(u, goal.via)) return null;
        ctx.stepTo.add(`${goal.via.x},${goal.via.y}`);
        settlerProgress.delete(k);
        return { key: "SETTLER_DETOUR", args: [nameOf(def), goal.via.x, goal.via.y, goal.x, goal.y] };
    }
    if (!moveTo(u, goal)) return null;
    // The way left now: the watchdog's first measure (settlerStuck).
    if (settlerProgress.get(k)?.goal !== `${goal.x},${goal.y}`) settlerProgress.set(k, { turn: Game.turn, turns: pathTurns(u, goal) ?? Infinity, goal: `${goal.x},${goal.y}`, stuck: 0 });
    return anywhere ?? gaveUp ?? { key: "SETTLE_MOVE", args: [nameOf(def), goal.x, goal.y, pathTurns(u, goal) ?? goal.turns ?? "?"] };
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

const RANGED_GUARD_RADIUS = 2; // a soldier this close to one of our settlements is attacking it

/**
 * A ranged shot (a kill frees the tile): first at a military unit within RANGED_GUARD_RADIUS of one
 * of our settlements (it is attacking it), then at any military unit, then at anything else, the
 * most damaged first; never at a tile with no unit (a village or a district: no effect). Seen in
 * game 5: crossbowmen shot scouts and an empty village tile (strength 5) while a swordsman took
 * the town next to them. `hostileOnly`: only at a soldier we are at war with (a guard woken to shoot).
 */
function rangedAttack(u, def, { hostileOnly = false } = {}) {
    if (u.Combat && !(Number(u.Combat.attacksRemaining) > 0)) return null;
    const op = globalThis.UnitOperationTypes?.RANGE_ATTACK ?? "UNITOPERATION_RANGE_ATTACK";
    const r = safe(() => Game.UnitOperations.canStart(u.id, op, {}, false), null);
    if (!r?.Success || !r.Plots?.length || r.Modifiers?.length !== r.Plots.length) return null;
    const none = globalThis.OperationPlotModifiers?.NONE ?? 0;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    let best = null;
    for (let i = 0; i < r.Plots.length; i++) {
        if (r.Modifiers[i] === none) continue;
        const loc = safe(() => GameplayMap.getLocationFromIndex(r.Plots[i]), null);
        if (!loc || startsWar(u, loc)) continue;
        const there = (safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).map((id) => safe(() => Units.get(id), null)).filter(Boolean);
        if (there.length === 0 || (hostileOnly && !there.some((t) => hostileOwner(t)))) continue;
        const military = there.some((t) => safe(() => GameInfo.Units.lookup(t.type)?.CoreClass, null) === "CORE_CLASS_MILITARY");
        const attacking = military && ours.some((c) => safe(() => GameplayMap.getPlotDistance(c.x, c.y, loc.x, loc.y), Infinity) <= RANGED_GUARD_RADIUS);
        const dmg = (attacking ? 2000 : 0) + (military ? 1000 : 0) + damageAt(loc);
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
function stepAside(u, def, ctx, { away = false } = {}) {
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
            // `away` (a civilian with raiders near): never next to a hostile unit, the furthest from them first.
            if (away && hostileNear(loc, 1, ctx)) continue;
            const gap = away ? [1, 2, 3].find((d) => hostileNear(loc, d, ctx)) ?? 4 : 0;
            const score = (own ? 0 : 10) + dist - gap * 3;
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
    if (landUnit && onWater(loc)) return false;
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
function toFrontier(u, def, ctx, radius, maxTurns, { keep = SCOUT_DANGER } = {}) {
    const here = u.location;
    const land = def.Domain !== "DOMAIN_SEA";
    const candidates = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (isFrontier(loc, land) && !dangerNear(loc, keep, ctx)) candidates.push(loc);
    }
    // A random direction: shuffle, then the first one reachable soon without war.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const loc of candidates.slice(0, ROAM_TRIES)) {
        const p = pathTo(u, loc);
        if (!p || p.turns > maxTurns || !wayIsSafe(u, p, keep > SCOUT_DANGER ? keep - 1 : 1, ctx) || startsWar(u, loc)) continue;
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
 * What an upgrade to `to` may cost: the game gives no price beforehand (the unit panel shows it only
 * in its tooltip), so the price of buying that unit outright in one of our cities stands in (an
 * upgrade costs less: the budget errs on the safe side). 0 when unknown.
 */
function upgradeEstimate(to) {
    if (!to) return 0;
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const cost = Number(safe(() => c.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, to), 0)) || 0;
        if (cost > 0) return cost;
    }
    return 0;
}

/**
 * Military units the game lets us upgrade now (UNITCOMMAND_UPGRADE: the next tier of the
 * same class, +5 Combat Strength, paid in gold; the game refuses it without the gold), not
 * while moving, from the pass budget's free gold (above the reserve and a savings goal). Units of
 * threatened settlements first. The game gives no price beforehand: each upgrade counts the
 * target unit's purchase price (upgradeEstimate), at most MAX_UPGRADES a pass.
 * The strategy (research/21 E4): mode "THREAT" upgrades only units near a threatened settlement (no
 * Tanks in peace for a science game); none in the age's last turns (`ageEnding`: the next age brings
 * its own units). @param budget the pass budget, or a number: the gold to keep; @param threats
 * threatenedSettlements()
 */
export function upgradeUnits(budget, threats = [], { mode = "ANY", ageEnding = false, war = false, exposed = [] } = {}) {
    const out = [];
    const UPGRADE = "UNITCOMMAND_UPGRADE";
    const A = globalThis.UnitActivityTypes;
    const gold = () => Number(safe(() => Players.Treasury?.get?.(pid())?.goldBalance, null) ?? safe(() => Players.get(pid()).Treasury.goldBalance, 0)) || 0;
    const b = typeof budget?.free === "function" ? budget : createBudget({ gold: gold(), reserve: Number(budget) || 0 });
    if (ageEnding) return out;
    const near = (u) => threats.some((t) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, t.settlement.x, t.settlement.y), 99) <= THREAT_RADIUS);
    // An exposed settlement's holder next (research/37 §4C), before units elsewhere.
    const holding = (u) => exposed.some((e) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, e.settlement.x, e.settlement.y), 99) <= HOLDER_RADIUS);
    // Gold income below zero (upkeep grows with each upgrade): only units defending a threatened settlement.
    const broke = (Number(safe(() => Players.get(pid()).Stats.getNetYield(YieldTypes.YIELD_GOLD), 0)) || 0) < 0;
    const candidates = (safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])
        .filter((u) => safe(() => GameInfo.Units.lookup(u.type).CoreClass, null) === "CORE_CLASS_MILITARY" && !u.isCommanderUnit)
        .filter((u) => !A || u.activityType !== A.OPERATION)
        .filter((u) => (!broke && mode !== "THREAT") || near(u))
        .sort((a, b) => Number(near(b)) - Number(near(a)) || Number(holding(b)) - Number(holding(a)));
    // With a war at our door, units near a threatened settlement may use all the gold, like its defenders
    // (research/23 D5: game 8, no upgrade in the whole war while the savings goals held the free gold).
    const pool = (u) => (war && near(u) ? b.all() : b.free());
    for (const u of candidates) {
        if (out.length >= MAX_UPGRADES || pool(u) <= 0) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const to = GameInfo.UnitUpgrades?.find((r) => r.Unit === def?.UnitType)?.UpgradeUnit;
        const cost = upgradeEstimate(to);
        if (cost > pool(u)) continue;
        if (!safe(() => Game.UnitCommands.canStart(u.id, UPGRADE, NO_TARGET, false), null)?.Success) continue;
        Game.UnitCommands.sendRequest(u.id, UPGRADE, { ...NO_TARGET });
        b.spend(cost, { kind: "UPGRADE", label: nameOf(def) });
        // A melee unit upgraded this age very likely sets every centre's defence (research/37 §2; probe P-DEF-3).
        if (to) noteMeleeObtained(safe(() => GameInfo.Units.lookup(to), null), "upgraded");
        out.push({ key: "UPGRADED", args: [nameOf(def), to ? safe(() => Locale.compose(GameInfo.Units.lookup(to).Name), to) : "?"] });
    }
    return out;
}

/**
 * The cheapest way to the age's first melee unit (research/37 §2): one of ours upgraded to a melee type at least
 * `minStrength` strong, when the game offers it and its estimate (upgradeEstimate) fits `pool`. The CombatLog shows
 * upgrades within an age raising the centres' defence (9 cases, inferred; probe P-DEF-3). @returns { entry, cost } or null
 */
export function upgradeFirstMelee(minStrength, pool) {
    const UPGRADE = "UNITCOMMAND_UPGRADE";
    const A = globalThis.UnitActivityTypes;
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (u.isCommanderUnit || u.isOnMap === false || (A && u.activityType === A.OPERATION)) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const to = GameInfo.UnitUpgrades?.find((r) => r.Unit === def?.UnitType)?.UpgradeUnit;
        const toDef = to ? safe(() => GameInfo.Units.lookup(to), null) : null;
        const s = toDef ? meleeStrength(toDef) : 0;
        if (!(s > 0) || s < minStrength) continue;
        const cost = upgradeEstimate(to);
        if (cost > pool) continue;
        if (!safe(() => Game.UnitCommands.canStart(u.id, UPGRADE, NO_TARGET, false), null)?.Success) continue;
        Game.UnitCommands.sendRequest(u.id, UPGRADE, { ...NO_TARGET });
        noteMeleeObtained(toDef, "upgraded");
        return { entry: { key: "FIRST_MELEE_UPGRADED", args: [nameOf(def), nameOf(toDef), s] }, cost };
    }
    return null;
}

// ---- threats --------------------------------------------------------------------------------

/**
 * Is this (other player's) unit a hostile military one? An independent power's units count while
 * that power is HOSTILE to us (at war; Game.IndependentPowers, as its unit flags show it: red),
 * not while NEUTRAL (at peace, yellow; seen in game 6: a village at peace with us for 40 turns kept
 * two towns "threatened", which bought walls and soldiers while gold ran out); a major player's
 * while we are at war with it. @returns the independent's id, the owner, or null
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
        if (R && rel === R.HOSTILE) return { id: indep, independent: true };
        if (R && rel !== null && rel !== undefined) return null; // friendly, neutral (at peace), not applicable
        return safe(() => Players.get(pid()).Diplomacy.isAtWarWith(indep), false) ? { id: indep, independent: true } : null;
    }
    return safe(() => Players.get(pid()).Diplomacy.isAtWarWith(unit.owner), false) ? { id: unit.owner, independent: false } : null;
}

/** Is this settlement's centre damaged (Players.Districts, as the game's district health bars read it)? */
function centreDamaged(loc) {
    const districts = safe(() => Players.Districts.get(pid()), null);
    const health = Number(safe(() => districts.getDistrictHealth(loc), NaN));
    const max = Number(safe(() => districts.getDistrictMaxHealth(loc), NaN));
    return Number.isFinite(health) && Number.isFinite(max) && max > 0 && health < max;
}

let fortifications = null; // FORTIFICATION-tagged types (GameInfo.TypeTags)

/** Walls standing on this centre: a finished, undamaged FORTIFICATION building (any age's or civilization's walls). */
function walledCentre(loc) {
    fortifications ??= new Set((GameInfo.TypeTags?.filter((t) => t.Tag === "FORTIFICATION") ?? []).map((t) => t.Type));
    for (const id of safe(() => MapConstructibles.getHiddenFilteredConstructibles(loc.x, loc.y), []) ?? []) {
        const c = safe(() => Constructibles.getByComponentID(id), null);
        if (!c || c.complete === false || c.damaged === true) continue;
        const d = safe(() => GameInfo.Constructibles.lookup(c.type), null);
        if (d?.ConstructibleClass === "BUILDING" && fortifications.has(d.ConstructibleType)) return true;
    }
    return false;
}

/** A unit's fighting strength in GameInfo.Unit_Stats: the best of its melee, ranged and bombard strengths (0: unknown). */
function unitStrength(def) {
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    return Math.max(0, Number(s?.Combat) || 0, Number(s?.RangedCombat) || 0, Number(s?.Bombard) || 0);
}

/**
 * Our threatened settlements: THREAT_MIN or more hostile military units within THREAT_RADIUS, or
 * one within THREAT_CLOSE, or one within THREAT_RADIUS while the centre is damaged (it is being
 * attacked), or one land raider within THREAT_RADIUS stronger than every melee guard of ours there (`strong`). Seen in game
 * 5: single Line Infantry took three settlements, which were never (or only on the turn they fell) counted as
 * threatened, and one under attack dropped off the list at 3 HP when only one rifleman was left.
 * @returns [{ settlement: { x, y, name }, count, land, ships, air, close, damaged, walled, strong, strongest,
 *   owners: [{ id, independent }] }], most threatened first (`walled`: walls stand on its centre)
 */
export function threatenedSettlements() {
    const out = [];
    // Our melee soldiers: where they stand, how strong they are. Not packed in an army (they cannot fight until deployed)
    // nor embarked (research/37 §3A).
    const ours = [];
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (u.isCommanderUnit || !u.location || u.isOnMap === false || afloat(u) || !isMeleeGuard(def)) continue;
        ours.push({ at: u.location, s: unitStrength(def) });
    }
    // An independent's units standing by their own village guard it (seen in game 6: a crisis
    // encampment 4 tiles from two towns kept its units at home all age and never attacked, yet both
    // towns stayed "threatened" for 20 turns): not counted unless next to the settlement or it is
    // being attacked (its centre damaged).
    let villages = null;
    const atHome = (h, loc) => h.independent && (villages ??= safe(() => villagesOf(pid(), true), []) ?? [])
        .some((v) => v.id === h.id && safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, v.x, v.y), Infinity) <= VILLAGE_GUARD_RADIUS);
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const seen = new Set();
        const owners = new Map();
        const damaged = centreDamaged(c.location);
        let close = 0;
        let land = 0; // land units: what a land defender can fight (research/22 B7)
        let ships = 0; // naval units: only ranged units (and walls) hit them (game 10)
        let air = 0;
        let strongest = null; // the strongest land raider: { type, s }
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(c.location.x, c.location.y, THREAT_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            const d = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.location.x, c.location.y), Infinity);
            for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
                const k = unitKey(id);
                if (seen.has(k)) continue;
                const h = hostileOwner(safe(() => Units.get(id), null));
                if (!h || (!damaged && d > 1 && atHome(h, loc))) continue;
                seen.add(k);
                owners.set(h.id, h);
                if (d <= THREAT_CLOSE) close++;
                const kind = safe(() => GameInfo.Units.lookup(Units.get(id)?.type), null);
                const domain = kind?.Domain ?? null;
                if (domain !== "DOMAIN_SEA" && domain !== "DOMAIN_AIR") {
                    land++;
                    const s = kind ? unitStrength(kind) : 0;
                    if (!strongest || s > strongest.s) strongest = { type: kind?.UnitType ?? "?", s };
                } else if (domain === "DOMAIN_SEA") ships++;
                else air++;
            }
        }
        // A land raider stronger than every melee guard of ours there (none: any raider). Research/36 §3: game 29's
        // Ollantaytambo, a town whose centre defended at 20, fell to one independent Line Infantry at 50 in two attacks.
        // The centre's own strength is not read: it followed the strongest melee unit trained this age, not the one we had
        // (a Line Infantry at 50 then).
        const guard = Math.max(0, ...ours.filter((o) => safe(() => GameplayMap.getPlotDistance(o.at.x, o.at.y, c.location.x, c.location.y), Infinity) <= GUARD_RADIUS).map((o) => o.s));
        const strong = !!strongest && strongest.s > guard;
        const threatened = seen.size >= THREAT_MIN || close > 0 || (seen.size > 0 && damaged) || strong;
        if (threatened) {
            out.push({
                settlement: { x: c.location.x, y: c.location.y, name: safe(() => Locale.compose(c.name), "?") }, count: seen.size, land, ships, air, close,
                damaged, walled: walledCentre(c.location), strong, strongest: strongest?.type ?? null, owners: [...owners.values()],
            });
        }
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
        // Its city (a city-state) or its village (not a city: villagesOf, hidden ones too, like its city before).
        const towns = [
            ...(safe(() => Players.get(indep).Cities.getCities(), []) ?? []),
            ...(safe(() => villagesOf(pid(), true), []) ?? []).filter((v) => v.id === indep).map((v) => ({ location: { x: v.x, y: v.y } })),
        ];
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
        return { key: "APPROACH", args: [nameOf(def), independentNameOf(indep)] };
    }
    return null;
}

export const GUARD_RADIUS = 2; // a melee soldier this close to a threatened settlement (or on its centre) guards it

/** A melee land soldier (no ranged or bombard attack): only those hold a centre (research/24 W2). */
function isMeleeGuard(def) {
    if (!isSoldier(def) || def.Domain !== "DOMAIN_LAND") return false;
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    return !!s && Number(s.Combat) > 0 && !(Number(s.RangedCombat) > 0) && !(Number(s.Bombard) > 0);
}

/** A ranged land soldier that is not a siege unit (Bombard above RangedCombat): it can shoot ships and archers. */
export function isRangedGuard(def) {
    if (!isSoldier(def) || def?.Domain !== "DOMAIN_LAND") return false;
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    return !!s && Number(s.RangedCombat) > 0 && !(Number(s.Bombard) > Number(s.RangedCombat));
}

/**
 * A land siege unit (Bombard above its ranged strength): no guard against land raiders, but against ships the best one.
 * "Both ranged and siege land units use their bombard strength when attacking naval units" (Civilopedia; research/37 §3D):
 * a Ballista hits a galley at 30 where an Archer hits at 10.
 */
export function isSiegeGuard(def) {
    if (!isSoldier(def) || def?.Domain !== "DOMAIN_LAND") return false;
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    return !!s && Number(s.Bombard) > 0 && Number(s.Bombard) > (Number(s.RangedCombat) || 0);
}

/** A land unit's strength against ships: its Bombard (research/37 §3D; 0: none). */
export const antiShipStrength = (def) => (def?.Domain === "DOMAIN_LAND" ? Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.Bombard, 0)) || 0 : 0);

/**
 * Ranged guards a threatened settlement wants against ships: one per ship, at most RANGED_GUARDS_MAX (game 10: two
 * galleys and quadriremes shot the southern town for 20 turns and only warriors were trained; ships are hit only by
 * ranged units); and one behind the melee screen against a land army of RANGED_SUPPORT_LAND or more (`support`: moved
 * and trained, not bought).
 */
export const RANGED_GUARDS_MAX = 2;
// A land army this big gets one ranged unit behind the melee screen (research/36 §5: game 29, four melee strikes and not
// one shot in Russia's war).
export const RANGED_SUPPORT_LAND = 2;
export const rangedWanted = (t, { support = true } = {}) => Math.min(RANGED_GUARDS_MAX, (Number(t?.ships) || 0) + (support && !wallsHold(t) && (Number(t?.land) || 0) >= RANGED_SUPPORT_LAND ? 1 : 0));

/**
 * Walls that hold: standing on the centre, the centre unhit, and only independents' raiders around (a major's army brings
 * siege units). Game 36: Манчестер, a walled town, wanted a melee guard per raider (4-6 Warriors) and ended with 5
 * Warriors and 2 Slingers (3 bought for 60 each, 3 trained ahead of Лондон's Colossus), while the raiders' Warriors hit its
 * centre for 8 of 200 a blow and never took it down.
 */
export const wallsHold = (t) => !!t?.walled && !t?.damaged && (t?.owners ?? []).every((o) => o?.independent);

/**
 * Melee guards a threatened settlement wants: one per land raider, and one on its centre whatever the raiders
 * (ships too: research/24 W2, Нант fell to 2 Cogs and a Knight while a ranged unit held its centre); one more while a
 * raider is stronger than every guard there (`strong`, research/36 §3). Behind walls that hold (wallsHold) only the one
 * on its centre (and the one against a stronger raider), and no ranged one behind them (rangedWanted).
 */
export const guardsWanted = (t) => (wallsHold(t) ? 1 : Math.max(Number(t?.land ?? t?.count) || 0, Number(t?.count) > 0 ? 1 : 0)) + (t?.strong ? 1 : 0);

const keyAt = (key) => {
    const [x, y] = String(key).split(",").map(Number);
    return { x, y };
};

const progressMemo = new Map(); // "unit|turn|x,y|activity|destination|goal|sent" -> guardProgress (it asks the game for a path)

/**
 * How a soldier with a guard goal stands toward it (research/36 §1): { turns: 0 } there (within GUARD_RADIUS of the
 * settlement), { turns } on its way, or null when the goal no longer holds: healing, asleep or fortified elsewhere,
 * stopped on an earlier turn, or walking somewhere else. Game 29: a Cuirassier sent to Ollantaytambo counted as its
 * guard from the turn it set off, nine tiles away; no defender was bought there with 711-1,034 gold, and the town fell
 * to one Line Infantry two turns later.
 */
function guardProgress(u, g) {
    if (!u?.location) return null;
    const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
    const memo = `${unitKey(u.id)}|${Game.turn}|${u.location.x},${u.location.y}|${u.activityType}|${dest?.x},${dest?.y}|${g.guard}|${g.turn}`;
    if (progressMemo.has(memo)) return progressMemo.get(memo);
    if (progressMemo.size > 500) progressMemo.clear();
    const p = guardProgressNow(u, g, dest);
    progressMemo.set(memo, p);
    return p;
}

function guardProgressNow(u, g, dest) {
    const at = keyAt(g.guard);
    const d = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, at.x, at.y), Infinity);
    if (d <= GUARD_RADIUS) return { turns: 0 };
    const A = globalThis.UnitActivityTypes;
    const fresh = g.turn === Game.turn; // sent this turn: the game may show the move a moment later
    if (A && u.activityType === A.HEAL) return null;
    if (A && u.activityType !== undefined && u.activityType !== A.OPERATION && !fresh) return null;
    if (!fresh && dest && dest.x >= 0 && safe(() => GameplayMap.getPlotDistance(dest.x, dest.y, at.x, at.y), 0) > Math.max(REINFORCE_RADIUS, STAGE_RADIUS)) return null;
    return { turns: pathTurns(u, g.tile ?? at) ?? Math.ceil(d / 2) };
}

/**
 * Our soldiers of one role (melee guards, or ranged ones) for a threatened settlement: `present` within GUARD_RADIUS of
 * it, each counted for its nearest threatened one (`threats`; the first listed on a tie), and `incoming` with the
 * turns they need (a guard goal under way: guardProgress). A war front's guard (goal `front`) counts where it stands.
 * Research/24 W2: ranged units and units 3-4 tiles away counted, one unit for several settlements, and no defender was
 * bought E47-E50 with 356-1,745 gold free. A unit packed in an army is no guard (research/37 §3A: assembled units "cannot
 * attack until the units have been deployed"), and an embarked one is one on its way. Against ships (`antiShip`) the
 * ranged ones include siege units: land units fire at ships with their Bombard strength (research/37 §3D).
 * @returns { present: [unit], incoming: [{ u, turns }] }
 */
export function guardDetail(threat, units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [], threats = null, { ranged = false } = {}) {
    const antiShip = ranged && Number(threat?.ships) > 0;
    const s = threat.settlement;
    const key = `${s.x},${s.y}`;
    const dist = (u, at) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, at.x, at.y), Infinity);
    const all = (threats ?? []).some((t) => same(t.settlement, s)) ? threats.map((t) => t.settlement) : [s];
    // The threatened settlement a unit guards: its nearest, the first listed (most threatened) on a tie.
    const guards = (u) => {
        let best = null;
        for (const at of all) {
            const d = dist(u, at);
            if (!best || d < best.d) best = { at, d };
        }
        return !!best && best.d <= GUARD_RADIUS && same(best.at, s);
    };
    const present = [];
    const incoming = [];
    for (const u of units ?? []) {
        const kind = safe(() => GameInfo.Units.lookup(u.type), null);
        if (u.isCommanderUnit) continue;
        if (!(ranged ? isRangedGuard(kind) || (antiShip && isSiegeGuard(kind)) : isMeleeGuard(kind))) continue;
        // Off the map (research/37 §5C): unpacking from an army here this pass (a turn out), or reinforcing an army that stands
        // here (its ETA, and a turn to deploy: a reinforcement arrives packed). Packed in an army otherwise: no guard.
        if (u.isOnMap === false) {
            const up = unpacking.get(unitKey(u.id));
            if (up?.turn === Game.turn && up.key === key) incoming.push({ u, turns: 1 });
            else {
                const at = reinforcingAt(u, units);
                if (at && safe(() => GameplayMap.getPlotDistance(at.x, at.y, s.x, s.y), Infinity) <= GUARD_RADIUS) incoming.push({ u, turns: reinforcementTurns(u) + 1 });
            }
            continue;
        }
        if (!u.location) continue;
        const wet = afloat(u);
        const g = goals.get(unitKey(u.id));
        if (g?.guard !== undefined && !g.front) {
            const p = safe(() => guardProgress(u, g), null);
            if (p) {
                if (g.guard === key) {
                    if (p.turns === 0 && !wet) present.push(u);
                    else incoming.push({ u, turns: Math.max(1, p.turns) });
                }
                continue;
            }
        }
        if (!wet && guards(u)) present.push(u);
    }
    return { present, incoming };
}

/**
 * Our soldiers of one role guarding a threatened settlement: those there (guardDetail's `present`), and those on their
 * way that arrive within `within` turns. Moving units count every one on its way (none is sent twice); a purchase counts
 * only those in time (research/36 §1: one arriving after the town falls guards nothing). Defenders are trained and
 * bought while fewer than guardsWanted.
 */
export function guardsFor(threat, units = undefined, threats = null, { ranged = false, within = Infinity } = {}) {
    const { present, incoming } = guardDetail(threat, units, threats, { ranged });
    return present.length + incoming.filter((x) => x.turns <= within).length;
}

/** The turns before a threatened settlement is hit: now (1) with its centre damaged or a raider within THREAT_CLOSE, else 2. */
export const guardDeadline = (t) => (t?.damaged || Number(t?.close) > 0 ? 1 : 2);

/**
 * Threatened only by one land raider 3-4 tiles away that our guards there cannot match (`strong`): it calls for a guard,
 * moved, bought or trained, not for walls ahead of the queue or a town's lasting Fort Town Focus (those wait until it
 * comes within THREAT_CLOSE, a second one comes, or the centre is hit).
 */
export const earlyWarning = (t) => !!t?.strong && !(Number(t?.close) > 0) && !t?.damaged && (Number(t?.count) || 0) < THREAT_MIN;

/** A holder for an exposed settlement: a melee land soldier on the map, not embarked, not a commander, not badly hurt. */
function isHolder(u, def) {
    return !u.isCommanderUnit && u.isOnMap !== false && !!u.location && !afloat(u) && isMeleeGuard(def) && (Number(u.Health?.damage) || 0) < ESCAPE_DAMAGE;
}

/**
 * An exposed settlement's holder (research/37 §4B): `present` on or next to its centre (HOLDER_RADIUS) and not sent
 * elsewhere, and `incoming` sent there as its holder, with its turns. An Archer, a siege unit, a commander, a unit packed
 * in an army, embarked or badly hurt is no holder (game 29: `soldierAt` took any land soldier within one tile).
 * @param e { settlement: { x, y } } @returns { present: [unit], incoming: [{ u, turns }] }
 */
export function holderDetail(e, units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
    const s = e.settlement;
    const key = `${s.x},${s.y}`;
    const present = [];
    const incoming = [];
    for (const u of units ?? []) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const g = goals.get(unitKey(u.id));
        // Sent this turn (a member leaving its army stays packed until the game moves it): on its way.
        const sent = g?.guard === key && g.turn === Game.turn && isMeleeGuard(def) && !!u.location;
        if (!isHolder(u, def) && !sent) continue;
        const d = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, s.x, s.y), Infinity);
        if (g?.guard !== undefined) {
            const p = safe(() => guardProgress(u, g), null);
            if (p && g.guard !== key) continue; // on its way to another settlement or front
            if (p && g.guard === key && (d > HOLDER_RADIUS || !isHolder(u, def))) {
                incoming.push({ u, turns: Math.max(1, p.turns) });
                continue;
            }
        }
        if (d <= HOLDER_RADIUS && isHolder(u, def)) present.push(u);
    }
    return { present, incoming };
}

const guarding = (u, ctx, radius = THREAT_RADIUS) => ctx.threats.some((t) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, t.settlement.x, t.settlement.y), Infinity) <= radius);

/** Wakes a soldier asleep, fortified or on alert (UNITCOMMAND_WAKE), so a move order takes. */
function wakeUnit(u) {
    const WAKE = "UNITCOMMAND_WAKE";
    if (!isIdle(u) && safe(() => Game.UnitCommands.canStart(u.id, WAKE, NO_TARGET, false), null)?.Success) Game.UnitCommands.sendRequest(u.id, WAKE, { ...NO_TARGET });
}

/** Our melee soldiers at a war front: within STAGE_RADIUS, or sent there and still on their way. */
function frontGuards(front, units) {
    const s = front.settlement;
    const key = `${s.x},${s.y}`;
    let n = 0;
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (u.isCommanderUnit || !u.location || u.isOnMap === false || !isMeleeGuard(def)) continue;
        const g = goals.get(unitKey(u.id));
        if (g?.front && g.guard === key && safe(() => guardProgress(u, g), null)) n++;
        else if (!(g?.guard !== undefined && g.guard !== key) && safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, s.x, s.y), Infinity) <= STAGE_RADIUS) n++;
    }
    return n;
}

/**
 * What each threatened settlement still lacks, most urgent first (a damaged centre, then no guard at all, then raiders
 * close, then their number), melee and ranged; then each exposed settlement's holder (research/37 §4B); then the war
 * fronts' (research/36 §2). Units on their way count. @returns [{ t, key, ranged, n, front, exposed }]
 */
function defenceDemands(ctx, units) {
    const out = [];
    for (const t of ctx.threats) {
        const key = `${t.settlement.x},${t.settlement.y}`;
        const melee = guardDetail(t, units, ctx.threats);
        const have = melee.present.length + melee.incoming.length;
        const rank = (t.damaged ? 0 : 4) + (have === 0 ? 0 : 2) + (Number(t.close) > 0 ? 0 : 1);
        const n = guardsWanted(t) - have;
        if (n > 0) out.push({ t, key, ranged: false, n, front: false, rank, count: t.count });
        const r = guardDetail(t, units, ctx.threats, { ranged: true });
        const rn = rangedWanted(t) - r.present.length - r.incoming.length;
        if (rn > 0) out.push({ t, key, ranged: true, n: rn, front: false, rank: rank + 0.5, count: t.count, antiShip: Number(t.ships) > 0 });
    }
    // Exposed settlements: a holder each (research/37 §4B), nearest a village first; below every threatened settlement
    // (ranks 0-7.5), above the war fronts.
    for (const e of ctx.exposed ?? []) {
        const h = holderDetail(e, units);
        if (h.present.length + h.incoming.length === 0) out.push({ t: e, key: `${e.settlement.x},${e.settlement.y}`, ranged: false, n: 1, front: false, exposed: true, rank: 8, count: 0 });
    }
    for (const f of ctx.fronts) {
        const n = FRONT_GUARDS - frontGuards(f, units);
        if (n > 0) out.push({ t: f, key: `${f.settlement.x},${f.settlement.y}`, ranged: false, n, front: true, rank: 10, count: 0 });
    }
    // By rank, then the raiders' number (a stable sort keeps the exposed and the fronts in their own order).
    return out.sort((a, b) => a.rank - b.rank || b.count - a.count);
}

/**
 * The soldiers free to go (research/36 §4): land melee or ranged guards, not a city's garrison, not hurt enough to
 * withdraw, not on another errand, on land; idle ones, and asleep or fortified ones (woken: game 29's reserves slept
 * while Cusco stood at 0 of 1 guards and then 0 of 4). A guard at a threatened settlement goes only when that settlement
 * has more than it wants (the ones furthest from its centre first, never the one on it), and one on its way keeps its
 * goal. Units 3-4 tiles from a threatened settlement are free too (before, they were neither counted nor sent).
 * @returns [{ u, def, k, ranged, resting, stage, from, atFront }]
 */
function defenceSupply(units, ctx) {
    const A = globalThis.UnitActivityTypes;
    const dist = (u, at) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, at.x, at.y), Infinity);
    const spare = new Map(); // unit key -> the settlement it may leave
    for (const t of ctx.threats) {
        const key = `${t.settlement.x},${t.settlement.y}`;
        for (const ranged of [false, true]) {
            const { present } = guardDetail(t, units, ctx.threats, { ranged });
            const keep = Math.max(1, ranged ? rangedWanted(t) : guardsWanted(t));
            const leave = present.filter((u) => !ctx.garrison.has(unitKey(u.id)) && !same(u.location, t.settlement))
                .sort((a, b) => dist(b, t.settlement) - dist(a, t.settlement)).slice(0, Math.max(0, present.length - keep));
            for (const u of leave) spare.set(unitKey(u.id), key);
        }
    }
    // An exposed settlement's holder stays (research/37 §4B).
    const holding = new Set();
    for (const e of ctx.exposed ?? []) for (const u of holderDetail(e, units).present) holding.add(unitKey(u.id));
    const out = [];
    // Members packed in one of our land commanders' armies: one may leave it for a post (REMOVE_FROM_ARMY, research/37
    // §5C.2), from where the commander stands.
    const commanders = units.filter((c) => c.isCommanderUnit && c.isOnMap !== false && isLandCommander(safe(() => GameInfo.Units.lookup(c.type), null)));
    for (const u of units) {
        if (u.isOnMap !== false || u.isCommanderUnit) continue;
        const k = unitKey(u.id);
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || def.Domain !== "DOMAIN_LAND" || ctx.ordered.has(k) || (Number(u.Health?.damage) || 0) >= ESCAPE_DAMAGE) continue;
        const siege = isSiegeGuard(def);
        const ranged = isRangedGuard(def) || siege;
        if (!ranged && !isMeleeGuard(def)) continue;
        const commander = commanders.find((c) => sameId(c.armyId, u.armyId));
        if (!commander?.location) continue;
        // Its army unpacks this pass (unpackArmies): it comes out next to its commander.
        if (unpacking.get(k)?.turn === Game.turn) continue;
        // On its way to an army as a reinforcement: not packed yet.
        if (Number(safe(() => Players.get(pid()).Armies.getUnitReinforcementCommanderId(u.id, pid()), -1)) >= 0) continue;
        out.push({ u, def, k, ranged, siege, resting: false, stage: true, packed: commander, from: undefined, atFront: undefined });
    }
    for (const u of units) {
        const k = unitKey(u.id);
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || u.isCommanderUnit || def.Domain !== "DOMAIN_LAND" || ctx.garrison.has(k) || ctx.ordered.has(k) || holding.has(k)) continue;
        // Siege units go only against ships (research/37 §3D: their Bombard hits ships), as ranged support.
        const siege = isSiegeGuard(def);
        const ranged = isRangedGuard(def) || siege;
        if (!ranged && !isMeleeGuard(def)) continue;
        if (u.isOnMap === false || u.canMove === false || u.hasMoved === true || !u.location || afloat(u)) continue;
        if ((Number(u.Health?.damage) || 0) >= ESCAPE_DAMAGE) continue;
        const act = u.activityType;
        if (A && act !== undefined && (act === A.OPERATION || act === A.HEAL)) continue;
        const resting = !!A && act !== undefined && act !== A.NONE && act !== A.AWAKE;
        const g = goals.get(k);
        if (g && g.guard === undefined) continue; // another errand: a village, a discovery, an independent
        const posted = ctx.threats.some((t) => dist(u, t.settlement) <= GUARD_RADIUS) || (g?.guard !== undefined && !g.front && !!safe(() => guardProgress(u, g), null));
        if (posted && !spare.has(k)) continue;
        // A soldier at a war front (sent there, or standing there) stays for that front; a threat may still take it.
        const near = g?.front ? null : ctx.fronts.find((f) => dist(u, f.settlement) <= STAGE_RADIUS);
        const atFront = g?.front ? g.guard : near ? `${near.settlement.x},${near.settlement.y}` : undefined;
        out.push({ u, def, k, ranged, siege, resting, stage: !resting || restedByUs.has(k), from: spare.get(k), atFront });
    }
    return out;
}

/**
 * The tile a soldier takes at a settlement (or a war front) and the turns it needs, or null: a free tile within
 * REINFORCE_RADIUS (STAGE_RADIUS on our own land for a front), reached within REINFORCE_MAX_TURNS. Melee: the nearest to
 * the settlement, then to the unit. Ranged: off the centre (a melee unit holds it: research/24 W2), within its range of a
 * raider (research/37 §3B: a post on the far side left every raider out of reach), and of those the furthest from them;
 * with no raider in sight, next to the centre.
 */
function postFor(u, s, ctx, { ranged = false, front = false, holder = false, from = u } = {}) {
    const radius = front ? STAGE_RADIUS : holder ? HOLDER_RADIUS : REINFORCE_RADIUS;
    const raiders = ranged ? hostilesAround(s, THREAT_RADIUS + 1) : [];
    const range = ranged ? Math.max(1, Number(safe(() => GameInfo.Unit_Stats.lookup(GameInfo.Units.lookup(u.type).UnitType)?.Range, 0)) || 2) : 0;
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || ctx.stepTo.has(`${loc.x},${loc.y}`) || !roomForSoldier(loc)) continue;
        // Not on a navigable river either: an embarked soldier cannot fight (research/37 §3C).
        if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
        const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
        if (front ? owner !== pid() : owner !== -1 && owner !== null && owner !== pid()) continue;
        const near = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, s.x, s.y), 0);
        const far = safe(() => GameplayMap.getPlotDistance(from.location.x, from.location.y, loc.x, loc.y), 0);
        const back = raiders.length > 0 ? Math.min(...raiders.map((h) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, h.at.x, h.at.y), 9))) : 0;
        const outOfRange = raiders.length > 0 && back > range ? 1000 : 0;
        tiles.push({ loc, score: ranged ? outOfRange + (near === 0 ? 500 : 0) + near * 30 - back * 40 + far : near * 100 + far });
    }
    tiles.sort((a, b) => a.score - b.score);
    // A packed member leaves its army next to its commander (a deploy takes its turn) and walks from there.
    const extra = from === u ? 0 : 1;
    for (const { loc } of tiles.slice(0, REINFORCE_TRIES)) {
        const walk = pathTurns(from, loc);
        const turns = walk === null ? null : walk + extra;
        if (turns === null || turns > REINFORCE_MAX_TURNS || startsWar(from, loc) || hazardAt(loc) > 0) continue;
        return { loc, turns };
    }
    return null;
}

/**
 * Who goes where (research/36 §4): each settlement's lack, most urgent first, gets the free soldier of that role that
 * reaches a post there soonest (of the REINFORCE_PICKS nearest); then the war fronts get an idle soldier, or one the
 * autopilot itself fortified. Game 29 M52: a commander and four reinforcements went to Антавайлья, the first listed,
 * while Куско stayed at 0 of 1 guards. Fills ctx.posts (unit key -> post) and reserves the tiles.
 */
function planDefence(units, ctx) {
    ctx.posts = new Map();
    if (ctx.threats.length === 0 && ctx.fronts.length === 0 && (ctx.exposed ?? []).length === 0) return;
    const deployed = new Set(); // commanders one of whose members leaves this pass
    const demands = defenceDemands(ctx, units);
    if (demands.length === 0) return;
    const supply = ctx.supply ?? defenceSupply(units, ctx);
    for (const d of demands) {
        const s = d.t.settlement;
        for (let n = d.n; n > 0; n--) {
            // One member a pass leaves an army (research/37 §5C.2), only while no hostile unit is near the army, or the army
            // stands at the settlement in need; a holder is a melee member.
            const armyOk = (c) => !c.packed || (!deployed.has(unitKey(c.packed.id))
                && (!hostileNear(c.packed.location, ESCAPE_DANGER, ctx) || safe(() => GameplayMap.getPlotDistance(c.packed.location.x, c.packed.location.y, s.x, s.y), 9) <= GUARD_RADIUS));
            const picks = supply.filter((c) => !ctx.posts.has(c.k) && c.ranged === d.ranged && (!c.siege || d.antiShip) && c.from !== d.key && (!d.front || (c.stage && c.atFront === undefined)) && armyOk(c))
                .map((c) => ({ c, d: safe(() => GameplayMap.getPlotDistance((c.packed ?? c.u).location.x, (c.packed ?? c.u).location.y, s.x, s.y), Infinity) }))
                .filter((x) => x.d <= REINFORCE_REACH && !(x.c.atFront === d.key))
                .sort((a, b) => a.d - b.d).slice(0, REINFORCE_PICKS);
            let best = null;
            for (const { c } of picks) {
                const post = postFor(c.u, s, ctx, { ranged: d.ranged, front: d.front, holder: !!d.exposed, from: c.packed ?? c.u });
                if (post && (!best || post.turns < best.post.turns)) best = { c, post };
            }
            // Far, or no way on foot: a reinforcement to our commander's army there, when it comes sooner (research/37 §5C.3).
            const rein = d.exposed ? null : reinforcementFor(d, supply, ctx, best);
            if (rein) {
                const at = rein.c.u.location;
                rein.army.reserved = (rein.army.reserved ?? 0) + 1;
                ctx.posts.set(rein.c.k, {
                    key: d.key, t: d.t, front: d.front, exposed: false, ranged: d.ranged, loc: rein.army.at, turns: rein.turns, resting: false,
                    unit: rein.c.def.UnitType, at: { x: at.x, y: at.y }, from: rein.c.from, packed: null,
                    reinforce: { at: rein.army.at, localId: rein.army.localId, walk: best?.post.turns ?? null },
                });
                continue;
            }
            if (!best) break;
            ctx.stepTo.add(`${best.post.loc.x},${best.post.loc.y}`);
            if (best.c.packed) deployed.add(unitKey(best.c.packed.id));
            const at = (best.c.packed ?? best.c.u).location;
            ctx.posts.set(best.c.k, {
                key: d.key, t: d.t, front: d.front, exposed: !!d.exposed, ranged: d.ranged, loc: best.post.loc, turns: best.post.turns, resting: best.c.resting,
                unit: best.c.def.UnitType, at: { x: at.x, y: at.y }, from: best.c.from, packed: best.c.packed ?? null,
            });
        }
    }
}

/**
 * Sends a soldier to the post planDefence gave it (a free tile near a threatened settlement, or near a war front on our
 * land), waking it first when it sleeps or is fortified. Seen in game: defenders trained for a threatened town stayed
 * around the city that trained them, the town never counted them, and the city kept training more until every tile
 * around it held one. @returns a log entry or null
 */
function reinforce(u, def, ctx) {
    const post = ctx.posts?.get(unitKey(u.id));
    if (!post) return null;
    if (post.packed) return deployMember(u, def, post);
    if (post.reinforce) return reinforceArmy(u, def, post);
    if (post.resting) wakeUnit(u);
    if (!moveTo(u, post.loc)) return null;
    goals.set(unitKey(u.id), { guard: post.key, tile: post.loc, turn: Game.turn, front: post.front, holder: post.exposed });
    restedByUs.delete(unitKey(u.id));
    post.sent = true;
    return { key: post.front ? "STAGED" : post.exposed ? "HOLDER" : "REINFORCE", args: [nameOf(def), post.t.settlement.name] };
}

// ---- armies (research/37 Phase 3) ----------------------------------------------------------------

const ARMY_CAPACITY = 4;          // an army's combat slots when the game does not say (Regiments: +2)
const REINFORCE_ARMY_MIN = 6;     // the game's rule text: a reinforcing unit stands at least this far from the commander
const REINFORCE_ARMY_GAIN = 2;    // turns a reinforcement must save over walking there

/** The localId of the army this unit is on its way to as a reinforcement, or -1 (player.Armies, as the army panel reads it). */
const reinforcingTo = (u) => Number(safe(() => Players.get(pid()).Armies.getUnitReinforcementCommanderId(u.id, pid()), -1) ?? -1);

/**
 * Turns before a reinforcement reaches its army: the game's ETA read as turns left (research/37 §5A, inferred; probe P-A3
 * logs it each turn), at least 1.
 */
function reinforcementTurns(u) {
    const eta = Number(safe(() => Players.get(pid()).Armies.getUnitReinforcementETA(u.id, pid()), NaN));
    return Number.isFinite(eta) && eta > 0 ? Math.ceil(eta) : 1;
}

/** Where the army this unit reinforces stands (its commander among `units`), or null. */
function reinforcingAt(u, units) {
    const to = reinforcingTo(u);
    if (!(to >= 0)) return null;
    const c = (units ?? []).find((x) => x.isCommanderUnit && x.isOnMap !== false && Number(safe(() => Armies.get(x.armyId)?.localId, NaN)) === to);
    return c?.location ?? null;
}

/**
 * Our land commanders' armies, from live state each pass (research/37 §5C.1): the commander and its tile, the army
 * (Armies.get: localId, combatUnitCapacity), the members packed in it (off the map, carrying its armyId; not guards:
 * §3A), and the units on their way to it as reinforcements (player.Armies.getUnitReinforcementCommanderId is its localId)
 * with their turns. @returns [{ cmdr, def, at, army, localId, capacity, packed: [unit], incoming: [{ u, turns }] }]
 */
export function armyInventory(units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
    const out = [];
    for (const c of units) {
        if (!c.isCommanderUnit || c.isOnMap === false || !c.location || !validId(c.armyId)) continue;
        const def = safe(() => GameInfo.Units.lookup(c.type), null);
        if (!isLandCommander(def)) continue;
        const army = safe(() => Armies.get(c.armyId), null);
        const localId = Number(army?.localId);
        const packed = units.filter((u) => u !== c && !u.isCommanderUnit && u.isOnMap === false && sameId(u.armyId, c.armyId) && reinforcingTo(u) < 0);
        const incoming = Number.isFinite(localId) ? units.filter((u) => u !== c && reinforcingTo(u) === localId).map((u) => ({ u, turns: reinforcementTurns(u) })) : [];
        out.push({ cmdr: c, def, at: c.location, army, localId: Number.isFinite(localId) ? localId : null, capacity: Number(army?.combatUnitCapacity) || ARMY_CAPACITY, packed, incoming });
    }
    return out;
}

/**
 * A packed army at a threatened settlement or a war front unpacks (research/37 §5C.2): packed units cannot attack ("You
 * must deploy your troops in order to attack"), and a reinforcement arrives packed. `UNITCOMMAND_UNPACK_ARMY` on the
 * commander, as the army panel sends it: canStart with no target gives the Plots, then {X, Y}, the offered tile nearest the
 * raiders there (else the settlement). One request an army a pass, its members counted as on their way there, a turn
 * out (guardDetail). UI.log says which tiles were offered (probe P-A2) and, when none was, why (P-A6). @returns log entries
 */
function unpackArmies(ctx) {
    const out = [];
    const needs = [...ctx.threats, ...ctx.fronts];
    if (needs.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    for (const a of ctx.armies ?? []) {
        const soldiers = a.packed.filter((u) => isSoldier(safe(() => GameInfo.Units.lookup(u.type), null)));
        const ck = unitKey(a.cmdr.id);
        if (soldiers.length === 0 || ctx.ordered.has(ck) || afloat(a.cmdr)) continue;
        // Asked this turn already (the end-of-turn retry reads the army before the game has moved them): not again.
        if (soldiers.some((u) => unpacking.get(unitKey(u.id))?.turn === Game.turn)) continue;
        const near = needs.map((t) => ({ t, d: dist(a.at, t.settlement) })).filter((x) => x.d <= GUARD_RADIUS).sort((x, y) => x.d - y.d)[0];
        if (!near) continue;
        const s = near.t.settlement;
        const OP = "UNITCOMMAND_UNPACK_ARMY";
        const r = safe(() => Game.UnitCommands.canStart(a.cmdr.id, OP, {}, false), null);
        const plots = (r?.Plots ?? []).map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter((l) => l && !onWater(l));
        if (plots.length === 0) {
            if (unpackNoted.get(ck) !== Game.turn) {
                unpackNoted.set(ck, Game.turn);
                log.warn(`army: ${typeOf(a.cmdr)} at ${where(a.at)} cannot unpack ${soldiers.length} for ${s.name}: ${(r?.FailureReasons ?? []).join("; ") || "no tile offered"} (probe P-A6)`);
            }
            continue;
        }
        const raiders = hostilesAround(s, THREAT_RADIUS + 1).map((h) => h.at);
        const score = (l) => (raiders.length > 0 ? Math.min(...raiders.map((h) => dist(l, h))) : dist(l, s));
        const best = plots.sort((p, q) => score(p) - score(q) || dist(p, s) - dist(q, s))[0];
        Game.UnitCommands.sendRequest(a.cmdr.id, OP, { X: best.x, Y: best.y });
        ctx.ordered.add(ck);
        const key = `${s.x},${s.y}`;
        for (const u of soldiers) unpacking.set(unitKey(u.id), { turn: Game.turn, key });
        log.info(`army: ${typeOf(a.cmdr)} at ${where(a.at)} unpacks ${soldiers.length} [${soldiers.map(typeOf).join(", ")}] toward ${where(best)} for ${s.name} (${plots.length} tile(s) offered; probes P-A2, P-A5: where they stand and what moves they have next pass)`);
        out.push({ key: "ARMY_UNPACKED", args: [nameOf(a.def), soldiers.length, s.name] });
    }
    return out;
}

/**
 * A native reinforcement for a settlement's (or a front's) lack (research/37 §5C.3): our land commander stands there
 * (within GUARD_RADIUS) with room in its army, and a free soldier of the role wanted, idle, unhurt, with every move, on our
 * land and at least REINFORCE_ARMY_MIN tiles away, reaches it off the map (its base moves a turn, terrain ignored, and a
 * turn to deploy) at least REINFORCE_ARMY_GAIN turns sooner than any soldier walks there, within REINFORCE_MAX_TURNS. The
 * game's canStart must offer the commander's tile. Never a holder or a garrison (not in the supply). @returns { c, turns,
 * army } or null
 */
function reinforcementFor(d, supply, ctx, walking) {
    const s = d.t.settlement;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const army = (ctx.armies ?? []).find((a) => dist(a.at, s) <= GUARD_RADIUS && !afloat(a.cmdr)
        && a.capacity - a.packed.length - a.incoming.length - (a.reserved ?? 0) > 0);
    if (!army) return null;
    const cands = [];
    for (const c of supply) {
        if (ctx.posts.has(c.k) || c.packed || c.resting || c.ranged !== d.ranged || (c.siege && !d.antiShip) || c.from === d.key) continue;
        if (d.front && !(c.stage && c.atFront === undefined)) continue;
        const u = c.u;
        if ((Number(u.Health?.damage) || 0) > 0 || u.hasMoved === true || !u.location || afloat(u)) continue;
        if (safe(() => GameplayMap.getOwner(u.location.x, u.location.y), -1) !== pid()) continue;
        const far = dist(u.location, army.at);
        if (far < REINFORCE_ARMY_MIN) continue;
        const turns = Math.ceil(far / Math.max(1, Number(c.def.BaseMoves) || 2)) + 1;
        if (turns > REINFORCE_MAX_TURNS || (walking && turns + REINFORCE_ARMY_GAIN > walking.post.turns)) continue;
        cands.push({ c, turns });
    }
    cands.sort((a, b) => a.turns - b.turns);
    const at = safe(() => GameplayMap.getIndexFromXY(army.at.x, army.at.y), -1);
    for (const x of cands.slice(0, REINFORCE_PICKS)) {
        const r = safe(() => Game.UnitOperations.canStart(x.c.u.id, "UNITOPERATION_REINFORCE_ARMY", {}, false), null);
        if ((r?.Plots ?? []).includes(at)) return { ...x, army };
    }
    return null;
}

/**
 * Sends a reinforcement (research/37 §5C.3): `UNITOPERATION_REINFORCE_ARMY` on the soldier, as the game's reinforce mode
 * sends it (canStart with no target gives the eligible commanders' tiles, then {X, Y} of ours). It travels off the map
 * and counts as on its way there with the game's ETA (guardDetail); its army unpacks it on arrival (unpackArmies).
 * @returns a log entry or null
 */
function reinforceArmy(u, def, post) {
    const OP = "UNITOPERATION_REINFORCE_ARMY";
    const at = post.reinforce.at;
    const r = safe(() => Game.UnitOperations.canStart(u.id, OP, {}, false), null);
    const i = safe(() => GameplayMap.getIndexFromXY(at.x, at.y), -1);
    if (!(r?.Plots ?? []).includes(i)) {
        log.warn(`reinforce: ${def.UnitType} cannot reinforce the army at ${where(at)} for ${post.t.settlement.name}: ${(r?.FailureReasons ?? []).join("; ") || "its tile not offered"} (probe P-A6)`);
        return null;
    }
    Game.UnitOperations.sendRequest(u.id, OP, { X: at.x, Y: at.y });
    post.sent = true;
    log.info(`reinforce: ${def.UnitType} from ${where(u.location)} -> the army at ${where(at)} for ${post.t.settlement.name}: about ${post.turns} turn(s) with its deploying, ${post.reinforce.walk === null ? "no way" : `${post.reinforce.walk}`} on foot (probe P-A3: the game's ETA each turn)`);
    return { key: "REINFORCE_ARMY", args: [nameOf(def), post.t.settlement.name] };
}

/**
 * One member leaves its commander's army for its post (research/37 §5C.2): `UNITCOMMAND_REMOVE_FROM_ARMY` on the member,
 * as the army panel's "Leave Commander" sends it: canStart with no target gives the Plots (next to the commander), then
 * {X, Y}, the offered tile nearest the post. It walks on from there next turn (its goal counts it as on its way). UI.log
 * says which tiles were offered and which was sent (probe P-A2), and why when none is. @returns a log entry or null
 */
function deployMember(u, def, post) {
    const OP = "UNITCOMMAND_REMOVE_FROM_ARMY";
    const r = safe(() => Game.UnitCommands.canStart(u.id, OP, {}, false), null);
    const plots = (r?.Plots ?? []).map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter((l) => l && standsOn(def, l));
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(l.x, l.y, post.loc.x, post.loc.y), Infinity);
    const best = plots.sort((a, b) => dist(a) - dist(b))[0];
    const army = `${post.at.x},${post.at.y}`;
    if (!best) {
        log.warn(`army: ${def.UnitType} cannot leave the army at ${army} for ${post.t.settlement.name}: ${(r?.FailureReasons ?? []).join("; ") || "no tile offered"}`);
        return null;
    }
    Game.UnitCommands.sendRequest(u.id, OP, { X: best.x, Y: best.y });
    goals.set(unitKey(u.id), { guard: post.key, tile: post.loc, turn: Game.turn, front: post.front, holder: post.exposed });
    post.sent = true;
    log.info(`army: ${def.UnitType} leaves the army at ${army} onto ${best.x},${best.y} for ${post.t.settlement.name} (${plots.length} tile(s) offered; probe P-A2: where it stands next pass)`);
    return { key: "DEPLOYED", args: [nameOf(def), post.t.settlement.name] };
}

// ---- formations (research/37 Phase 4) ------------------------------------------------------------

/** A tile's terrain defence for a unit standing there: its feature's and its terrain's DefenseModifier (forest +2, marsh -2). */
function terrainDefence(loc) {
    const f = safe(() => GameInfo.Features.lookup(GameplayMap.getFeatureType(loc.x, loc.y))?.DefenseModifier, 0);
    const t = safe(() => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(loc.x, loc.y))?.DefenseModifier, 0);
    return (Number(f) || 0) + (Number(t) || 0);
}

/** Resting (fortified, asleep, on alert): not idle, not awake, not on its way, not healing. */
function resting(u) {
    const A = globalThis.UnitActivityTypes;
    const act = u.activityType;
    return !!A && act !== undefined && act !== A.NONE && act !== A.AWAKE && act !== A.OPERATION && act !== A.HEAL;
}

/**
 * Why a soldier of a formation may not move this pass, or null when it may: sent elsewhere or ordered, hurt (it heals
 * where it stands), moved already, on its way or healing, or resting by the player's own order (the autopilot's own
 * fortified soldiers may move: restedByUs).
 */
function formationStill(u, ctx) {
    const k = unitKey(u.id);
    if (ctx.posts.has(k) || ctx.ordered.has(k)) return "ordered";
    if ((Number(u.Health?.damage) || 0) > 0) return "hurt";
    if (u.canMove === false || u.hasMoved === true || !u.location || afloat(u)) return "moved";
    const A = globalThis.UnitActivityTypes;
    if (A && (u.activityType === A.OPERATION || u.activityType === A.HEAL)) return "busy";
    if (resting(u) && !restedByUs.has(k)) return "the player's";
    return null;
}

/**
 * Formations (research/37 Phase 4; the scoring in core/xpl-formation.js). At each threatened settlement with raiders in
 * sight, after planDefence has sent who goes where, the soldiers standing there (guardDetail's `present`, melee and
 * ranged) improve their posts: a melee unit onto an empty centre (the one on it never leaves), melee units screening
 * each approach, ranged units within range of a raider and not next to a land raider. Only moves worth FORM.MIN_GAIN
 * (a fortified one's fortification counts against it), onto tiles free now, within GUARD_RADIUS and nearest this
 * settlement (they stay its guards), on our land or nobody's, reached this turn; the most threatened settlement first.
 * The commander's tile comes later, from postCommander (formCommander). Fills ctx.formation (unit key -> its move) and
 * ctx.formations (settlement key -> the formation, for the commander and UI.log).
 */
function planFormations(units, ctx) {
    ctx.formation = new Map();
    ctx.formations = new Map();
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    ctx.threats.forEach((t, rank) => {
        const s = t.settlement;
        const key = `${s.x},${s.y}`;
        // Raiders in sight: land ones are screened, and any of them (ships too) is a ranged unit's target; aircraft aside.
        const hostiles = hostilesAround(s, THREAT_RADIUS + 1).filter((h) => h.def?.Domain !== "DOMAIN_AIR");
        if (hostiles.length === 0) return;
        const land = hostiles.filter((h) => h.def?.Domain === "DOMAIN_LAND").map((h) => ({ x: h.at.x, y: h.at.y }));
        const members = [];
        for (const ranged of [false, true]) {
            for (const u of guardDetail(t, units, ctx.threats, { ranged }).present) {
                const k = unitKey(u.id);
                if (ctx.posts.has(k)) continue; // a spare guard leaving for another post
                const def = safe(() => GameInfo.Units.lookup(u.type), null);
                const range = ranged ? Math.max(1, Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.Range, 0)) || 2) : 0;
                members.push({ key: k, role: ranged ? "ranged" : "melee", range, at: { x: u.location.x, y: u.location.y }, u, def, still: formationStill(u, ctx) });
            }
        }
        if (members.length === 0) return;
        const f = { centre: { x: s.x, y: s.y }, land, targets: hostiles.map((h) => ({ x: h.at.x, y: h.at.y })), sectors: sectorsOf(land, dist), members, dist, defence: terrainDefence };
        // Free tiles a soldier may stand on and still guard this settlement (its nearest threatened one, the first listed
        // on a tie, as guardDetail counts it).
        const tiles = [];
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, GUARD_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || ctx.stepTo.has(`${loc.x},${loc.y}`) || !roomForSoldier(loc)) continue;
            if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || hazardAt(loc) > 0) continue;
            const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
            if (owner !== -1 && owner !== null && owner !== pid()) continue;
            const d = dist(loc, s);
            if (ctx.threats.some((o, i) => i !== rank && (dist(loc, o.settlement) < d || (dist(loc, o.settlement) === d && i < rank)))) continue;
            tiles.push({ x: loc.x, y: loc.y });
        }
        const byKey = new Map(members.map((m) => [m.key, m]));
        const reached = new Map();
        const reach = (k, loc) => {
            const memo = `${k}|${loc.x},${loc.y}`;
            if (!reached.has(memo)) {
                const u = byKey.get(k).u;
                const turns = pathTurns(u, loc);
                reached.set(memo, turns !== null && turns <= 1 && !startsWar(u, loc));
            }
            return reached.get(memo);
        };
        const movable = new Set(members.filter((m) => m.still === null).map((m) => m.key));
        const plan = planFormation(f, { tiles, movable, reach, cost: (k) => (resting(byKey.get(k).u) ? FORM.FORTIFIED : 0) });
        for (const mv of plan.moves) {
            const m = byKey.get(mv.key);
            ctx.stepTo.add(`${mv.to.x},${mv.to.y}`);
            const role = m.role === "ranged" ? "RANGED" : same(mv.to, s) ? "HOLD" : "SCREEN";
            ctx.formation.set(mv.key, { key, name: s.name, role, from: mv.from, loc: mv.to, gain: mv.gain, unit: m.def?.UnitType ?? "?" });
        }
        ctx.formations.set(key, { f, at: plan.at, name: s.name, tiles: tiles.length, commander: null });
    });
}

/** A soldier's move in its settlement's formation, woken first when the autopilot had fortified it. @returns a log entry or null */
function formMove(u, def, ctx) {
    const k = unitKey(u.id);
    const m = ctx.formation.get(k);
    if (!m) return null;
    wakeUnit(u);
    if (!moveTo(u, m.loc)) return null;
    restedByUs.delete(k);
    m.sent = true;
    return { key: `FORMATION_${m.role}`, args: [nameOf(def), m.name] };
}

/**
 * A land commander at a threatened settlement (postCommander): the tile within GUARD_RADIUS where its radius (1, +1 with
 * Merit) covers the most of the formation's soldiers (their tiles after this pass's moves), never next to a land raider,
 * on our land or nobody's, with room for a commander (a soldier may share it), reached this turn; it stays put unless
 * that covers FORM.MIN_GAIN more. @returns a log entry or null (it stays: the skip step skips its turn)
 */
function formCommander(u, def, form, ctx) {
    const s = form.f.centre;
    const merit = safe(() => u.Experience?.hasPromotion("DISCIPLINE_ARMY_COMMENDATION_MERIT", "PROMOTION_COMMENDATION_ARMY_MERIT"), false);
    const radius = 1 + (merit ? 1 : 0);
    const taken = ctx.commanderTiles ??= new Set();
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, GUARD_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || taken.has(`${loc.x},${loc.y}`) || !roomFor(def, loc)) continue;
        if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || hazardAt(loc) > 0) continue;
        const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
        if (owner !== -1 && owner !== null && owner !== pid()) continue;
        tiles.push({ x: loc.x, y: loc.y });
    }
    const reach = (loc) => {
        const turns = pathTurns(u, loc);
        return turns !== null && turns <= 1 && !startsWar(u, loc);
    };
    // Moved in its formation lately: it stays (game 38: three moves on three turns in a row, the last for +20).
    const last = commanderMoved.get(unitKey(u.id));
    const held = last !== undefined && Game.turn - last < FORM.COMMANDER_HOLD && Game.turn >= last;
    const pick = held ? null : commanderTile(form.f, { at: { x: u.location.x, y: u.location.y }, radius }, [...form.at.values()], tiles, reach);
    form.commander = { unit: def.UnitType, at: { x: u.location.x, y: u.location.y }, to: pick?.to ?? null, gain: pick?.gain ?? 0 };
    const stand = pick?.to ?? u.location;
    taken.add(`${stand.x},${stand.y}`);
    if (held) form.commander.held = true;
    if (!pick || !moveTo(u, pick.to)) return null;
    commanderMoved.set(unitKey(u.id), Game.turn);
    form.commander.sent = true;
    return { key: "FORMATION_COMMANDER", args: [nameOf(def), form.name] };
}

/**
 * UI.log, once a turn for each formation (research/37 §10, Phase 4): its sectors (the approaches), who holds the centre,
 * the moves (with their gains, NOT SENT when the game refused), the soldiers who stay and why, and the commander.
 */
function logFormations(ctx) {
    const at = (l) => (l ? `${l.x},${l.y}` : "?");
    for (const [key, form] of ctx.formations ?? []) {
        if (formationNoted.get(key) === Game.turn) continue;
        formationNoted.set(key, Game.turn);
        const { f } = form;
        const moves = [...ctx.formation.values()].filter((m) => m.key === key);
        const moved = new Set([...ctx.formation.entries()].filter(([, m]) => m.key === key).map(([k]) => k));
        const holder = f.members.find((m) => m.role === "melee" && same(m.at, f.centre));
        const stay = f.members.filter((m) => !moved.has(m.key)).map((m) => `${m.def?.UnitType ?? "?"} at ${at(m.at)} (${same(m.at, f.centre) ? "on the centre" : m.still ?? "no better post"})`);
        const c = form.commander;
        const parts = [
            `sectors ${f.sectors.length} [${f.sectors.map((sec) => `${sec.length} near ${at(sec[0])}`).join("; ")}]${f.targets.length > f.land.length ? `, ships ${f.targets.length - f.land.length}` : ""}`,
            `centre ${holder ? `held by ${holder.def?.UnitType ?? "?"}` : "not held"}`,
            `moves [${moves.map((m) => `${m.unit} ${at(m.from)} -> ${at(m.loc)} ${m.role} +${Math.round(m.gain)}${m.sent ? "" : " NOT SENT"}`).join("; ")}]`,
            `stay [${stay.join("; ")}]`,
        ];
        if (c) parts.push(`commander ${c.unit} at ${at(c.at)}${c.to ? ` -> ${at(c.to)} +${Math.round(c.gain)}${c.sent ? "" : " NOT SENT"}` : c.held ? " stays (moved lately)" : " stays"}`);
        log.info(`formation: ${form.name}: ${parts.join("; ")}; ${form.tiles} free tile(s)`);
    }
}

/**
 * UI.log, once a turn for each threatened settlement and war front (research/36 §10): the raiders and the strongest of
 * them, the centre's health, our guards there and on their way (with their turns), and who was sent from where.
 */
function logDefence(ctx, units) {
    const districts = safe(() => Players.Districts.get(pid()), null);
    const name = (u) => safe(() => GameInfo.Units.lookup(u.type)?.UnitType, "?");
    const list = (d) => [...d.present.map((u) => name(u)), ...d.incoming.map((x) => `${name(x.u)} in ${x.turns}t`)].join(", ");
    const free = (ctx.supply ?? []).filter((c) => !ctx.posts.has(c.k)).length;
    for (const t of [...ctx.threats, ...(ctx.exposed ?? []), ...ctx.fronts]) {
        const s = t.settlement;
        const key = `${s.x},${s.y}`;
        if (defenceNoted.get(key) === Game.turn) continue;
        defenceNoted.set(key, Game.turn);
        const sent = [...ctx.posts.values()].filter((p) => p.key === key)
            .map((p) => `${p.unit} from ${p.at.x},${p.at.y} in ${p.turns}t${p.resting ? " (woken)" : ""}${p.packed ? " (from an army)" : ""}${p.reinforce ? " (reinforcing the army there)" : ""}${p.from ? ` (spare at ${p.from})` : ""}${p.sent ? "" : " NOT SENT"}`);
        const parts = [];
        if (ctx.threats.includes(t)) {
            const m = guardDetail(t, units, ctx.threats);
            const r = guardDetail(t, units, ctx.threats, { ranged: true });
            const health = Number(safe(() => districts.getDistrictHealth(s), NaN));
            const max = Number(safe(() => districts.getDistrictMaxHealth(s), NaN));
            parts.push(`raiders ${t.count} (land ${t.land ?? "?"}, ships ${t.ships ?? 0}, air ${t.air ?? 0}, close ${t.close ?? "?"}${t.strongest ? `, strongest ${t.strongest}${t.strong ? " beats our guards there" : ""}` : ""})`);
            parts.push(`centre ${Number.isFinite(health) ? health : "?"}/${Number.isFinite(max) ? max : "?"}${t.walled ? `, walled${wallsHold(t) ? " (they hold: one guard)" : ""}` : ""}`);
            parts.push(`melee ${m.present.length} + ${m.incoming.length} coming of ${guardsWanted(t)} [${list(m)}]`);
            parts.push(`ranged ${r.present.length} + ${r.incoming.length} of ${rangedWanted(t)} [${list(r)}]`);
            // Units packed in an army there: not counted (research/37 §3A).
            const packed = units.filter((u) => u.isOnMap === false && !u.isCommanderUnit && safe(() => GameplayMap.getPlotDistance(unitTile(u).x, unitTile(u).y, s.x, s.y), Infinity) <= GUARD_RADIUS);
            if (packed.length > 0) parts.push(`packed [${packed.map(name).join(", ")}] not counted`);
        } else if ((ctx.exposed ?? []).includes(t)) {
            const h = holderDetail(t, units);
            const v = t.village ?? {};
            parts.push(`exposed (${safe(() => independentNameOf(v.id), null) ?? `village ${v.id ?? "?"}`} at ${t.d ?? "?"} tiles): holder ${h.present.length} + ${h.incoming.length} coming [${list(h)}]`);
        } else parts.push(`war front (${t.leader ?? "?"}): melee ${frontGuards(t, units)} of ${FRONT_GUARDS}`);
        parts.push(`sent [${sent.join("; ")}]`);
        log.info(`defence: ${s.name}: ${parts.join("; ")}; ${free} free soldier(s) left`);
    }
}

/**
 * A unit that has earned a promotion (commanders: NOTIFICATION_UNIT_PROMOTION_AVAILABLE holds
 * the turn) takes the first one it can earn, discipline by discipline in the game's order.
 * Same data and command as the game's promotion panel (panel-unit-promotion.js).
 */
// Land commanders' promotions, best first for a defensive autopilot (research/25): Bastion's way to its commendation
// (Steadfast +2 defending, Hold the Line +2 on districts, Garrison +10 walls HP, Resolute heals), Leadership (Zeal +5%
// yields where it is stationed, Field Commission, Old Guard +10 to itself), the rest of Bastion, then Assault, Logistics,
// Maneuver. Commendations: Order (+5 to units in its radius, always), Merit (+1 radius), Service, Valor, Duty. Before
// this the game's order was taken (all of Bastion, then Assault) and commendations were never spent.
const PROMOTION_PREFERENCE = [
    "PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_HOLD_THE_LINE", "PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_RESOLUTE",
    "PROMOTION_ARMY_ZEAL", "PROMOTION_ARMY_FIELD_COMMISSION", "PROMOTION_ARMY_OLD_GUARD", "PROMOTION_ARMY_BARRAGE",
    "PROMOTION_ARMY_BULWARK", "PROMOTION_ARMY_DEFILADE", "PROMOTION_ARMY_RESILIENCE", "PROMOTION_ARMY_ONSLAUGHT",
    "PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_STORM", "PROMOTION_ARMY_ROUT", "PROMOTION_ARMY_SHOCK_TACTICS",
    "PROMOTION_ARMY_ENFILADE", "PROMOTION_ARMY_ADVANCEMENT", "PROMOTION_ARMY_RECRUITMENT", "PROMOTION_ARMY_QUARTERMASTER",
    "PROMOTION_ARMY_REGIMENTS", "PROMOTION_ARMY_FIELD_MEDIC", "PROMOTION_ARMY_LOOTING", "PROMOTION_ARMY_SURVIVAL_TRAINING",
    "PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_REDEPLOY", "PROMOTION_ARMY_HARASSMENT", "PROMOTION_ARMY_PATHFINDER",
    "PROMOTION_ARMY_AMPHIBIOUS", "PROMOTION_ARMY_AREA_DENIAL",
    "PROMOTION_COMMENDATION_ARMY_ORDER", "PROMOTION_COMMENDATION_ARMY_MERIT", "PROMOTION_COMMENDATION_ARMY_SERVICE",
    "PROMOTION_COMMENDATION_ARMY_VALOR", "PROMOTION_COMMENDATION_ARMY_DUTY",
];

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
        // Our order (PROMOTION_PREFERENCE), the others in the game's order; commendations after promotions (they are a
        // separate pool: both are spent, one a pass).
        const isCommendation = (p) => { const d = safe(() => GameInfo.UnitPromotions.lookup(p), null); return d?.Commendation === true || d?.Commendation === "true"; };
        const rank = (o, i) => (isCommendation(o.promotion) ? 100000 : 0) + (PROMOTION_PREFERENCE.includes(o.promotion) ? PROMOTION_PREFERENCE.indexOf(o.promotion) : 1000 + i);
        const ordered = options.map((o, i) => ({ o, r: rank(o, i) })).sort((a, b) => a.r - b.r).map((x) => x.o);
        for (const o of ordered) {
            const promo = safe(() => GameInfo.UnitPromotions.lookup(o.promotion), null);
            if (!promo) continue;
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

// ---- plot hazards: the plague, fallout, fire ----------------------------------------------------

/**
 * Damage a unit takes at the start of its turn on this tile: the plot effects with Damage that do not trigger on
 * entering (GameInfo.PlotEffects: the plague 25 a turn for 6 turns, fallout 50, fire 15; traps and dig sites hurt
 * only who enters). Game 18: the plague killed our fortified garrisons, and the cities trained new units into it.
 * @returns the damage (0: safe)
 */
export function hazardAt(loc) {
    const idx = safe(() => GameplayMap.getIndexFromXY(loc.x, loc.y), -1);
    if (!(idx >= 0)) return 0;
    let worst = 0;
    for (const e of safe(() => MapPlotEffects.getPlotEffects(idx), []) ?? []) {
        const def = safe(() => GameInfo.PlotEffects.lookup(e.effectType), null);
        if (!def || truthy(def.TriggerOnEnter)) continue;
        worst = Math.max(worst, Number(def.Damage) || 0);
    }
    return worst;
}

const HAZARD_RADIUS = 3;      // a unit on a hazardous tile looks this far for a safe one it reaches this turn
const HAZARD_HOLD_HEALTH = 0.5; // with hostile units within DANGER_RADIUS a soldier above this health share holds its tile

/**
 * A unit on a hazardous tile (hazardAt) moves this turn to the nearest safe tile it reaches: room for it, no hostile
 * unit next to it, land for a land unit, our land first; a resting or fortified one is woken. A healthy soldier with
 * hostile units near holds its tile (it defends). @returns a log entry or null
 */
function leaveHazard(u, def, ctx) {
    const here = u.location;
    const damage = hazardAt(here);
    if (!(damage > 0) || def.CanBeDamaged === false || def.CanBeDamaged === "false") return null;
    const health = 1 - (Number(u.Health?.damage) || 0) / (Number(u.Health?.maxDamage) || 100);
    if (isSoldier(def) && health > HAZARD_HOLD_HEALTH && hostileNear(here, DANGER_RADIUS, ctx)) return null;
    const options = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, HAZARD_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || hazardAt(loc) > 0 || !roomFor(def, loc)) continue;
        if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
        // Land for a land unit (a navigable river would embark it); water or a navigable river for a ship.
        if (!standsOn(def, loc)) continue;
        if (dangerNear(loc, 1, ctx)) continue;
        const ours = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid();
        const d = safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), 9);
        options.push({ loc, score: d + (ours ? 0 : 2) });
    }
    options.sort((a, b) => a.score - b.score);
    const WAKE = "UNITCOMMAND_WAKE";
    let woken = false;
    for (const { loc } of options) {
        const p = pathTo(u, loc);
        if (!p || p.turns > 1 || startsWar(u, loc)) continue;
        if (!woken && !isIdle(u) && safe(() => Game.UnitCommands.canStart(u.id, WAKE, NO_TARGET, false), null)?.Success) {
            Game.UnitCommands.sendRequest(u.id, WAKE, { ...NO_TARGET });
            woken = true;
        }
        if (moveTo(u, loc)) return { key: "LEFT_HAZARD", args: [nameOf(def), loc.x, loc.y, damage] };
    }
    return null;
}

// ---- commanders (research/25) ------------------------------------------------------------------

/** A land army commander (its promotion class): commanders of fleets are not posted. */
function isLandCommander(def) {
    return def?.Domain === "DOMAIN_LAND" && (def.PromotionClass === "PROMOTION_CLASS_LAND_COMMANDER" || hasTag(def, "UNIT_CLASS_ARMY_COMMANDER"));
}

const COMMANDER_THREAT_TURNS = 6; // a threatened settlement draws a land commander that reaches it within this many turns...
const COMMANDER_PEACE_TURNS = 4;  // ...an unhappy one in peace, this many
const COMMANDER_UNHAPPY_GAIN = 3; // in peace a commander leaves a centre only for a settlement this much unhappier (below zero)

/**
 * Where a land commander should stand: the centre of our most threatened settlement it reaches within
 * COMMANDER_THREAT_TURNS (its radius covers the defenders around it; the district takes the attacks), each commander its
 * own, its own post first while that stays threatened; in peace it stays on a centre unless a settlement within
 * COMMANDER_PEACE_TURNS is COMMANDER_UNHAPPY_GAIN unhappier and below zero (the commander cuts its unhappiness), the
 * unhappiest first; on its way to an unhappy one it keeps that post; off any centre it goes to the nearest one.
 * Game 37: in Exploration it was re-posted seven times between three cities about 5 turns apart (E36-E61) as a raid came
 * and went and a crisis moved their Happiness by a point or two, so it rarely arrived; in Modern it walked 18 turns to a
 * far town (M9-M27) that a purchase had secured at M17. Its post is kept in its goal ({post: "x,y"}). @returns { c } or null
 */
function commanderPost(u, ctx) {
    const cities = safe(() => Players.get(pid()).Cities.getCities(), []) ?? [];
    const here = u.location;
    const taken = ctx.commanderPosts ??= new Set();
    const keyOf = (c) => `${c.location.x},${c.location.y}`;
    const free = (c) => !taken.has(keyOf(c));
    const dist = (c) => safe(() => GameplayMap.getPlotDistance(here.x, here.y, c.location.x, c.location.y), Infinity);
    const turns = new Map();
    const reaches = (c, max) => {
        if (same(c.location, here)) return true;
        if (!turns.has(keyOf(c))) turns.set(keyOf(c), pathTurns(u, c.location));
        const t = turns.get(keyOf(c));
        return t !== null && t <= max;
    };
    const kept = goals.get(unitKey(u.id))?.post;
    const at = (t) => cities.find((c) => c.location.x === t.settlement.x && c.location.y === t.settlement.y);
    const threatened = ctx.threats.map((t) => ({ t, c: at(t) })).filter((x) => x.c && free(x.c));
    const own = threatened.find((x) => keyOf(x.c) === kept);
    if (own && reaches(own.c, COMMANDER_THREAT_TURNS)) return { c: own.c };
    for (const x of [...threatened].sort((a, b) => b.t.count - a.t.count)) if (reaches(x.c, COMMANDER_THREAT_TURNS)) return { c: x.c };
    const happiness = (c) => Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0;
    const on = cities.find((c) => same(c.location, here));
    const going = cities.find((c) => keyOf(c) === kept && free(c) && !same(c.location, here));
    if (going && happiness(going) < 0) return { c: going };
    const unhappy = cities.filter((c) => free(c) && happiness(c) < 0 && !same(c.location, here) && reaches(c, COMMANDER_PEACE_TURNS))
        .sort((a, b) => happiness(a) - happiness(b) || dist(a) - dist(b));
    if (on && free(on)) {
        const best = unhappy[0];
        return best && happiness(best) <= Math.min(happiness(on), 0) - COMMANDER_UNHAPPY_GAIN ? { c: best } : { c: on };
    }
    if (unhappy.length > 0) return { c: unhappy[0] };
    if (going) return { c: going };
    const nearest = cities.filter(free).sort((a, b) => dist(a) - dist(b))[0];
    return nearest ? { c: nearest } : null;
}

/** Moves a land commander to its post by a way never next to hostile units. @returns a log entry or null (there, or no safe way) */
function postCommander(u, def, ctx) {
    const post = commanderPost(u, ctx);
    if (!post) return null;
    const loc = post.c.location;
    ctx.commanderPosts.add(`${loc.x},${loc.y}`);
    goals.set(unitKey(u.id), { post: `${loc.x},${loc.y}`, turn: Game.turn });
    // At a threatened settlement its formation places it (research/37 §6B: where its radius covers the most of them).
    const form = ctx.formations?.get(`${loc.x},${loc.y}`);
    if (form && safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), Infinity) <= GUARD_RADIUS) return formCommander(u, def, form, ctx);
    if (same(u.location, loc)) return null; // at its post: the skip step skips its turn
    const p = pathTo(u, loc);
    if (!p || !wayIsSafe(u, p, 1, ctx) || startsWar(u, loc) || !moveTo(u, loc)) return null;
    return { key: "COMMANDER_POST", args: [nameOf(def), safe(() => Locale.compose(post.c.name), "?")] };
}

let commanderParamsLogged = false;

/** Once per session, UI.log lists the game's experience and army parameters (their values are compiled into the game). */
function logCommanderParameters() {
    if (commanderParamsLogged) return;
    const rows = GameInfo.GlobalParameters?.filter((r) => /^(EXPERIENCE_|ARMY_|COMMANDER_)/.test(String(r.Name))) ?? [];
    if (rows.length === 0) return;
    commanderParamsLogged = true;
    log.warn(`commander parameters: ${rows.map((r) => `${r.Name}=${r.Value}`).join(", ")}`);
}

const focusNoted = new Map();   // "commander|command" -> the turn UI.log said why it made no focused attack
const FOCUS_MIN_UNITS = 2;     // a focused attack needs this many of our units joining it...
const FOCUS_MIN_HEALTH = 0.5;  // ...each melee one with at least this share of its health

/**
 * Commanders' focused attacks (research/25: every unit in its radius attacks one target, +2 strength each; each fight
 * gives the commander XP): Focus Fire (UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED) when FOCUS_MIN_UNITS ranged units with
 * an attack left can shoot the target, Coordinated Attack (…_MELEE) when as many healthy melee ones stand next to it
 * and the target is no stronger than the best of them + 2 and not in a district. Targets come from the game
 * (canStart(…, {}).Plots), hostile units only, the most damaged first. @returns { entries, ordered (unit keys) }
 */
async function commanderAttacks(units, M) {
    const entries = [];
    const ordered = new Set();
    for (const cmdr of units) {
        const def = safe(() => GameInfo.Units.lookup(cmdr.type), null);
        if (!cmdr.isCommanderUnit || !isLandCommander(def) || cmdr.isOnMap === false) continue;
        // Its radius as the game draws it (Units.getCommandRadiusPlots: support-unit-map-decoration.js; research/36 §6), else
        // 1, +1 with Merit.
        const plots = safe(() => Units.getCommandRadiusPlots(cmdr.id), null);
        const radiusPlots = Array.isArray(plots) && plots.length > 0
            ? new Set(plots.map((p) => (typeof p === "number" ? p : safe(() => GameplayMap.getIndexFromLocation(p), -1))))
            : null;
        const merit = safe(() => cmdr.Experience?.hasPromotion("DISCIPLINE_ARMY_COMMENDATION_MERIT", "PROMOTION_COMMENDATION_ARMY_MERIT"), false);
        const radius = 1 + (merit ? 1 : 0);
        const inRadius = (x) => (radiusPlots
            ? radiusPlots.has(safe(() => GameplayMap.getIndexFromXY(x.location.x, x.location.y), -2))
            : safe(() => GameplayMap.getPlotDistance(x.location.x, x.location.y, cmdr.location.x, cmdr.location.y), 9) <= radius);
        const near = units.filter((x) => !x.isCommanderUnit && !ordered.has(unitKey(x.id)) && Number(x.Combat?.attacksRemaining) > 0 && !!x.location && inRadius(x));
        for (const [cmd, ranged] of [["UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED", true], ["UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE", false]]) {
            const plots = safe(() => Game.UnitCommands.canStart(cmdr.id, cmd, {}, false), null)?.Plots ?? [];
            let best = null;
            // Why no attack, for UI.log once a turn (game 12 T31: the player found a Coordinated Attack we never made).
            const why = { targets: plots.length, hostile: 0, district: 0, joining: 0, stronger: 0 };
            for (const idx of plots) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
                const enemy = loc ? (safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).map((id) => safe(() => Units.get(id), null)).find((e) => hostileOwner(e)) : null;
                if (!enemy) continue;
                why.hostile++;
                // Not into a settlement's defences (the game answers an invalid id elsewhere).
                if (!ranged && validId(safe(() => Game.Combat.getDefensibleDistrict({ x: loc.x, y: loc.y }), null))) {
                    why.district++;
                    continue;
                }
                const joining = near.filter((x) => {
                    const xd = safe(() => GameInfo.Units.lookup(x.type), null);
                    if (ranged) return isRangedGuard(xd) && (safe(() => Game.UnitOperations.canStart(x.id, "UNITOPERATION_RANGE_ATTACK", {}, false), null)?.Plots ?? []).includes(idx);
                    const health = 1 - (Number(x.Health?.damage) || 0) / (Number(x.Health?.maxDamage) || 100);
                    return isMeleeGuard(xd) && health >= FOCUS_MIN_HEALTH && safe(() => GameplayMap.getPlotDistance(x.location.x, x.location.y, loc.x, loc.y), 9) === 1;
                });
                why.joining = Math.max(why.joining, joining.length);
                if (joining.length < FOCUS_MIN_UNITS) continue;
                if (!ranged) {
                    const ours = Math.max(...joining.map((x) => Number(safe(() => x.Combat.getMeleeStrength(false), 0)) || 0));
                    if (!(enemyStrength(enemy) <= ours + 2)) {
                        why.stronger++;
                        continue;
                    }
                }
                const score = joining.length * 100 + (Number(enemy.Health?.damage) || 0);
                if (!best || score > best.score) best = { loc, enemy, joining, score };
            }
            if (!best) {
                const key = `${unitKey(cmdr.id)}|${cmd}`;
                if (why.targets > 0 && focusNoted.get(key) !== Game.turn) {
                    focusNoted.set(key, Game.turn);
                    log.warn(`commander: no ${ranged ? "Focus Fire" : "Coordinated Attack"}: ${why.targets} target plot(s), ${why.hostile} hostile, ${why.district} in a district, at most ${why.joining} of ours joining (need ${FOCUS_MIN_UNITS}), ${why.stronger} too strong; ${near.length} unit(s) in its radius with an attack left`);
                }
                continue;
            }
            Game.UnitCommands.sendRequest(cmdr.id, cmd, { X: best.loc.x, Y: best.loc.y });
            for (const x of best.joining) ordered.add(unitKey(x.id));
            ordered.add(unitKey(cmdr.id));
            const theirs = safe(() => GameInfo.Units.lookup(best.enemy.type), null);
            entries.push({ key: ranged ? "FOCUS_FIRE" : "COORDINATED_ATTACK", args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.loc.x, best.loc.y, best.joining.length] });
            await untilEvent("Combat", COMBAT_WAIT_MS);
            break; // one focused attack per commander a pass
        }
    }
    return { entries, ordered };
}

// ---- dispersing villages ----------------------------------------------------------------------

const DISPERSE_RADIUS = 4;      // a soldier looks this far for an empty village at war with us...
const DISPERSE_MAX_TURNS = 2;   // ...and walks at most this far to it
const DISPERSE_MAX_DAMAGE = 50; // not into their village when hurt more than this

const indepName = (id) => independentNameOf(id);

/**
 * A village worth dispersing: at war with us (hostile), and nobody is befriending it (another
 * leader's befriending: dispersing costs −30 relationship with them, GRIEVANCE_FROM_DISPERSING_IP;
 * ours: our Influence would be lost, and it ends the war by itself at progress 30).
 */
function dispersible(v) {
    const R = globalThis.IndependentRelationship;
    const hostile = (R !== undefined && safe(() => Game.IndependentPowers.getIndependentRelationship(v.id, pid()), null) === R.HOSTILE)
        || !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(v.id), false);
    if (!hostile) return false;
    const GIVE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN;
    return !(safe(() => Game.Diplomacy.getPlayerEvents(v.id), []) ?? []).some((a) => a.actionType === GIVE);
}

/**
 * A military unit standing on a village disperses it (UNITOPERATION_DISPERSE_INDEPENDENT, no
 * target, as the unit panel sends it; it works with no moves left): the village is gone, and with
 * it its raids, and it pays (400 gold in Exploration, 600 in Modern, research/17). Nobody dispersed a
 * village in game 5, though villages were often empty (their units out raiding).
 */
function disperseHere(u, def, ctx) {
    if (def.CoreClass !== "CORE_CLASS_MILITARY" || def.Domain !== "DOMAIN_LAND" || u.isCommanderUnit || !u.location) return null;
    ctx.villages ??= safe(() => villagesOf(pid()), []) ?? [];
    const here = ctx.villages.find((v) => same(v, u.location));
    if (!here || !dispersible(here) || !operate(u, "UNITOPERATION_DISPERSE_INDEPENDENT")) return null;
    goals.delete(unitKey(u.id));
    return { key: "DISPERSED", args: [nameOf(def), indepName(here.id)] };
}

/**
 * A soldier (not a garrison, not badly hurt) walks onto an empty village at war with us
 * (dispersible, no unit on it) within DISPERSE_RADIUS that it reaches in DISPERSE_MAX_TURNS, the
 * nearest first, one soldier per village; there it disperses it (disperseHere).
 */
function goDisperse(u, def, ctx) {
    if (def.CoreClass !== "CORE_CLASS_MILITARY" || def.Domain !== "DOMAIN_LAND" || u.isCommanderUnit) return null;
    if (ctx.garrison.has(unitKey(u.id)) || Number(u.Health?.damage) > DISPERSE_MAX_DAMAGE) return null;
    ctx.villages ??= safe(() => villagesOf(pid()), []) ?? [];
    const near = ctx.villages
        .map((v) => ({ v, d: safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, v.x, v.y), Infinity) }))
        .filter(({ v, d }) => d <= DISPERSE_RADIUS && !ctx.dispersing.has(`${v.x},${v.y}`))
        .sort((a, b) => a.d - b.d);
    for (const { v } of near) {
        if ((safe(() => MapUnits.getUnits(v.x, v.y), []) ?? []).length > 0 || !dispersible(v)) continue;
        const turns = pathTurns(u, v);
        if (turns === null || turns > DISPERSE_MAX_TURNS || !moveTo(u, { x: v.x, y: v.y })) continue;
        ctx.dispersing.add(`${v.x},${v.y}`);
        goals.set(unitKey(u.id), { disperse: `${v.x},${v.y}`, turn: Game.turn });
        return { key: "DISPERSE_MOVE", args: [nameOf(def), indepName(v.id), v.x, v.y] };
    }
    return null;
}

/**
 * Soldiers sent to disperse a village this turn (goDisperse) that stand on it now disperse it at once, as the hud's unit
 * step calls this right after their moves (dispersing needs no moves left). Game 37 T62: a Warrior walked onto Тичитты's
 * empty village and stood there through the night; their Archer hit it for 30, and the next turn it withdrew instead.
 * @returns log entries
 */
export function disperseArrivals() {
    const out = [];
    const ctx = {};
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const g = goals.get(unitKey(u.id));
        if (!g?.disperse || g.turn !== Game.turn || !u.location || `${u.location.x},${u.location.y}` !== g.disperse) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const e = def ? safe(() => disperseHere(u, def, ctx), null) : null;
        if (e) out.push(e);
    }
    return out;
}

const HEAL_SAFE_RADIUS = 2; // a hurt soldier with a hostile unit this close steps back before it heals...
const REACH_LOOK = 6;       // ...and away from our settlements, one whose next turn reaches it (hostile soldiers this far are looked at)

/**
 * Hostile soldiers (not aircraft) whose next turn reaches this tile: a melee one within its moves + 1, a ranged one (ships
 * too) within its moves + its range; terrain is not counted (the cautious side). Game 37 E8: a hurt Swordsman healing in
 * the field with no raider within HEAL_SAFE_RADIUS was shot by a Heavy Archer (2 moves, range 2) that walked up.
 */
function hostilesInReach(loc) {
    return hostilesAround(loc, REACH_LOOK).filter((h) => {
        if (!h.def || h.def.Domain === "DOMAIN_AIR") return false;
        const st = safe(() => GameInfo.Unit_Stats.lookup(h.def.UnitType), null);
        const ranged = Number(st?.RangedCombat) > 0 || Number(st?.Bombard) > 0;
        const reach = Math.max(1, Number(h.def.BaseMoves) || 2) + (ranged ? Math.max(1, Number(st?.Range) || 1) : 1);
        return safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, h.at.x, h.at.y), Infinity) <= reach;
    });
}

/** Within GUARD_RADIUS of one of our settlements' centres (a guard heals at its post: the old radius alone counts there). */
function nearOwnCentre(loc, ctx) {
    ctx.centres ??= (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location).filter(Boolean);
    return ctx.centres.some((c) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.x, c.y), Infinity) <= GUARD_RADIUS);
}

// ---- surplus soldiers (research/24 G3) ------------------------------------------------------------

export const DISBAND_KEEP_PER_SETTLEMENT = 2; // soldiers kept per settlement...
export const DISBAND_AGE_FRAC = 0.08;         // ...in a new age's first turns...
const DISBAND_PER_PASS = 2;                   // ...disbanding at most this many a pass

/** What our units cost a turn (player.Treasury, as the yields report reads it; positive). */
export function unitUpkeep() {
    const treasury = safe(() => Players.get(pid()).Treasury, null);
    let total = 0;
    const types = new Set((safe(() => Players.get(pid()).Units.getUnits(), []) ?? []).map((u) => u.type));
    for (const t of types) total += Math.abs(Number(safe(() => treasury.getMaintenanceForAllUnitsOfType(t), 0)) || 0);
    return total;
}

/**
 * A new age's upkeep (research/24 G3: game 9's unit upkeep doubled at the age change, 112-150 a turn against an
 * income of −38 to 77): in its first turns (DISBAND_AGE_FRAC of the age, not Antiquity), at peace with no war risk
 * and nothing threatened, while our units cost more than the gold income (above half the gross), the soldiers
 * above DISBAND_KEEP_PER_SETTLEMENT per settlement are disbanded (UNITCOMMAND_DELETE, the unit panel's own),
 * furthest from any foreign settlement first, never a garrison or a commander; DISBAND_PER_PASS a pass.
 * @param options { income, ageFrac, firstAge, peace: no war, no risk, no threat } @returns log entries
 */
export function disbandSurplus({ income = 0, ageFrac = 1, firstAge = true, peace = false } = {}) {
    if (!peace || firstAge || !(ageFrac <= DISBAND_AGE_FRAC)) return [];
    const upkeep = unitUpkeep();
    if (!(upkeep > income)) return [];
    const cities = safe(() => Players.get(pid()).Cities.getCities(), []) ?? [];
    const centres = new Set(cities.map((c) => `${c.location.x},${c.location.y}`));
    const soldiers = (safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])
        .filter((u) => !u.isCommanderUnit && isSoldier(safe(() => GameInfo.Units.lookup(u.type), null)));
    let surplus = soldiers.length - DISBAND_KEEP_PER_SETTLEMENT * Math.max(1, cities.length);
    if (surplus <= 0) return [];
    const foreign = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p && p.id !== pid())
        .flatMap((p) => (safe(() => p.Cities.getCities(), []) ?? []).map((c) => c.location)).filter(Boolean);
    const gap = (u) => Math.min(Infinity, ...foreign.map((l) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, l.x, l.y), Infinity)));
    const DELETE = "UNITCOMMAND_DELETE";
    const out = [];
    for (const u of soldiers.filter((x) => !centres.has(`${x.location?.x},${x.location?.y}`)).sort((a, b) => gap(b) - gap(a))) {
        if (surplus <= 0 || out.length >= DISBAND_PER_PASS) break;
        if (!safe(() => Game.UnitCommands.canStart(u.id, DELETE, NO_TARGET, false), null)?.Success) continue;
        Game.UnitCommands.sendRequest(u.id, DELETE, { ...NO_TARGET });
        surplus--;
        out.push({ key: "DISBANDED", args: [nameOf(safe(() => GameInfo.Units.lookup(u.type), null)), Math.round(upkeep), Math.round(income)] });
    }
    if (out.length > 0) log.warn(`upkeep: units ${Math.round(upkeep)} a turn against income ${Math.round(income)}; ${out.length} disbanded, ${surplus} surplus left`);
    return out;
}

// ---- out of reach (research/24 W6; the user: units died where shallow water would have saved them) -------

const ESCAPE_DANGER = 2;     // hostile soldiers this close put a hurt or resting soldier, or a scout, in danger
const ESCAPE_DAMAGE = 30;    // ...a soldier with at least this much damage (of 100), or resting hurt
const WATER_SAFE_RADIUS = 4; // shallow water hides a land unit from land melee units only: no hostile ship, ranged or air unit this close

/** Hostile military units (at war with us) within `radius`: [{ def, at }]. */
function hostilesAround(loc, radius) {
    const out = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!at) continue;
        for (const id of safe(() => MapUnits.getUnits(at.x, at.y), []) ?? []) {
            const unit = safe(() => Units.get(id), null);
            if (hostileOwner(unit)) out.push({ def: safe(() => GameInfo.Units.lookup(unit.type), null), at });
        }
    }
    return out;
}

/** Can this hostile unit hit a unit on the water? Ships, aircraft, ranged and siege units can; land melee units cannot. */
function reachesWater(def) {
    if (!def || def.Domain !== "DOMAIN_LAND") return true;
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    return Number(s?.RangedCombat) > 0 || Number(s?.Bombard) > 0;
}

/** Shallow water: coast or a lake, not deep ocean (a navigable river is not water here). */
const shallowWater = (loc) => !!loc && !!safe(() => GameplayMap.isWater(loc.x, loc.y), false) && !isOcean(loc);

/** Shallow water out of every hostile unit's reach: only land melee units near it. */
const waterIsSafe = (loc) => shallowWater(loc) && !hostilesAround(loc, WATER_SAFE_RADIUS).some((h) => reachesWater(h.def));

/** Hostile soldiers within ESCAPE_DANGER and this unit cannot hold: a scout, or a soldier badly hurt or resting hurt. */
function inDanger(u, def) {
    const damage = Number(u.Health?.damage) || 0;
    const A = globalThis.UnitActivityTypes;
    const weak = hasTag(def, "UNIT_CLASS_AUTOEXPLORE") || damage >= ESCAPE_DAMAGE || (damage > 0 && !!A && u.activityType === A.HEAL);
    return weak && hostilesAround(u.location, ESCAPE_DANGER).length > 0;
}

/** The safest shallow water tile it reaches this turn (furthest from hostile units), or null. */
function waterRefuge(u, def, ctx) {
    let best = null;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(u.location.x, u.location.y, 2), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, u.location) || ctx.stepTo.has(`${loc.x},${loc.y}`) || !roomFor(def, loc) || !waterIsSafe(loc)) continue;
        const t = pathTurns(u, loc);
        if (t === null || t > 1 || startsWar(u, loc)) continue;
        const gap = Math.min(...hostilesAround(loc, ESCAPE_DANGER + 2).map((h) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, h.at.x, h.at.y), 9)), 9);
        if (!best || gap > best.gap) best = { loc, gap };
    }
    return best?.loc ?? null;
}

/**
 * A land unit in danger (inDanger) gets out of reach, resting or not (research/24 W6: a Gusa rested 4 turns while
 * it was shot; a Courser withdrew and was killed where it stopped): onto shallow water it reaches this turn when
 * only land melee units are near (they cannot attack it there), else into one of our settlement centres it
 * reaches this turn, else the step away from them. A resting unit is woken first. Garrisons stay.
 * @returns a log entry or null
 */
function escape(u, def, ctx) {
    if (afloat(u) || ctx.garrison.has(unitKey(u.id)) || !inDanger(u, def)) return null;
    const wake = () => wakeUnit(u);
    const water = waterRefuge(u, def, ctx);
    if (water) {
        wake();
        if (moveTo(u, water)) {
            ctx.stepTo.add(`${water.x},${water.y}`);
            return { key: "TO_WATER", args: [nameOf(def), water.x, water.y] };
        }
    }
    // A scout without water near steps away by its own rules (explore's stepAway).
    if (hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) return null;
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const at = c.location;
        if (!at || same(at, u.location) || ctx.stepTo.has(`${at.x},${at.y}`) || !roomFor(def, at)) continue;
        const t = pathTurns(u, at);
        if (t === null || t > 1) continue;
        wake();
        if (!moveTo(u, at)) continue;
        ctx.stepTo.add(`${at.x},${at.y}`);
        return { key: "WITHDRAW", args: [nameOf(def), at.x, at.y] };
    }
    wake();
    return stepAway(u, def, ctx, "WITHDRAW");
}

/**
 * On shallow water out of reach while hostile land soldiers wait ashore: it stays there (else leaveTheWater would
 * walk it back to them). Not with a ship, a ranged or an air unit near. @returns a log entry or null
 */
function stayAtSea(u, def) {
    if (!shallowWater(u.location) || !waterIsSafe(u.location)) return null;
    if (!hostilesAround(u.location, ESCAPE_DANGER + 1).some((h) => h.def?.Domain === "DOMAIN_LAND")) return null;
    if (!operate(u, "UNITOPERATION_SKIP_TURN")) return null;
    return { key: "WATER_WAIT", args: [nameOf(def)] };
}

function defend(u, def, ctx) {
    if (def.CoreClass !== "CORE_CLASS_MILITARY") return null;
    // An aircraft strikes a raider near our settlements, else waits at its base.
    if (def.Domain === "DOMAIN_AIR") return ctx.ordered.has(unitKey(u.id)) ? null : airAttack(u, def);
    const here = disperseHere(u, def, ctx);
    if (here) return here;
    const shot = rangedAttack(u, def);
    if (shot) return shot;
    if (Number(u.Health?.damage) > 0) {
        // Not within reach of hostile units (ships too): a step back first, garrisons aside (research/23 D11:
        // game 8, a Mamluk healed on the coast next to two Cogs and was killed the next turn).
        // Away from our settlements, also when a raider's next turn reaches it (hostilesInReach; game 37 E8).
        if (!ctx.garrison.has(unitKey(u.id)) && (hostileNear(u.location, HEAL_SAFE_RADIUS, ctx)
            || (!nearOwnCentre(u.location, ctx) && hostilesInReach(u.location).length > 0))) {
            const back = stepAway(u, def, ctx, "WITHDRAW");
            if (back) return back;
        }
        if (operate(u, "UNITOPERATION_REST_UNTIL_HEALED")) return { key: "HEAL", args: [nameOf(def)] };
    }
    const camp = goDisperse(u, def, ctx);
    if (camp) return camp;
    // A threatening independent we cannot befriend yet: one unit walks toward it (not a garrison).
    if (ctx.approach.length > 0 && !ctx.garrison.has(unitKey(u.id))) {
        const e = approach(u, def, ctx);
        if (e) return e;
    }
    if (operate(u, "UNITOPERATION_FORTIFY")) {
        restedByUs.add(unitKey(u.id));
        return { key: "FORTIFY", args: [nameOf(def)] };
    }
    // The game may refuse to fortify (seen in a new capital): stand guard, woken by enemies.
    if (operate(u, "UNITOPERATION_ALERT")) {
        restedByUs.add(unitKey(u.id));
        return { key: "ALERT", args: [nameOf(def)] };
    }
    return stepAside(u, def, ctx);
}

// ---- striking raiders -------------------------------------------------------------------------

const STRIKE_MAX = 4;             // melee attacks per pass
const STRIKE_KEEP = 0.5;          // our unit keeps at least this share of its health...
const STRIKE_TRADE = 2;           // ...and kills the enemy, or deals it this many times the damage it takes
const STRIKE_TRADE_SIEGE = 1.3;   // ...or this many times next to one of our settlements, or while its centre is damaged
const SIMULATE_WAIT_MS = 600;     // the game answers a simulated attack with an event
const SIMULATE_FIRST_WAIT_MS = 2000; // the turn's first simulation waits longer (probe P1: in game no answer ever came)
const SIMULATE_LOG_PER_TURN = 8;  // UI.log lines about simulations a turn
const COMBAT_WAIT_MS = 1000;      // after an attack, so the next simulation sees its outcome

/** Resolves true when the engine fires `name`, false after `ms` without it. */
function untilEvent(name, ms) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (fired) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            safe(() => engine.off(name, onEvent), null);
            resolve(fired);
        };
        const onEvent = () => finish(true);
        const timer = setTimeout(() => finish(false), ms);
        safe(() => engine.on(name, onEvent), null);
    });
}

// Probe P1 (research/21 §2): our call matches the attack preview's (panel-unit-combat-preview.js),
// yet in game no SimulateCombatResult was ever seen. Every answer that arrives goes to UI.log with
// the time since our request and whether its token matches ours.
const simDiag = { turn: -1, logged: 0, askedAt: 0, token: null, longWaitTurn: -1, listening: false };

function simLog(text) {
    if (simDiag.turn !== Game.turn) {
        simDiag.turn = Game.turn;
        simDiag.logged = 0;
    }
    if (simDiag.logged++ < SIMULATE_LOG_PER_TURN) log.warn(`strike: ${text}`);
}

function listenToSimulations() {
    if (simDiag.listening) return;
    simDiag.listening = true;
    safe(() => engine.on("SimulateCombatResult", (r) => {
        const match = simDiag.token !== null && sameId(r?.QueryToken, simDiag.token);
        simLog(`SimulateCombatResult ${Date.now() - simDiag.askedAt} ms after our request; token ${JSON.stringify(r?.QueryToken ?? null)}, ours ${JSON.stringify(simDiag.token)}, match ${match}; damage to attacker ${r?.Attacker?.DamageTo ?? "?"}, to defender ${r?.Defender?.DamageTo ?? "?"}`);
    }), null);
}

/**
 * The game's own prediction of an attack from u onto loc, as its attack preview asks for it
 * (panel-unit-combat-preview.js: Game.Combat.simulateAttackAsync, answered by the event
 * SimulateCombatResult carrying the same QueryToken). @returns { Attacker: { DamageTo },
 * Defender: { ID, DamageTo, MaxHitPoints } } or null
 */
function simulateAttack(u, loc) {
    return new Promise((resolve) => {
        let token = null;
        let done = false;
        const finish = (r) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            safe(() => engine.off("SimulateCombatResult", onResult), null);
            resolve(r ?? null);
        };
        const onResult = (r) => {
            // By value: the game's answer carries its own copy of the token (research/22 B1).
            if (token === null || sameId(r?.QueryToken, token)) finish(r);
        };
        listenToSimulations();
        const ms = simDiag.longWaitTurn === Game.turn ? SIMULATE_WAIT_MS : SIMULATE_FIRST_WAIT_MS;
        simDiag.longWaitTurn = Game.turn;
        const timer = setTimeout(() => {
            simLog(`no SimulateCombatResult within ${ms} ms (our token ${JSON.stringify(token)})`);
            finish(null);
        }, ms);
        safe(() => engine.on("SimulateCombatResult", onResult), null);
        simDiag.askedAt = Date.now();
        simDiag.token = null;
        token = safe(() => Game.Combat.simulateAttackAsync(u.id, { Location: { x: loc.x, y: loc.y }, X: loc.x, Y: loc.y, CombatType: globalThis.CombatTypes?.NO_COMBAT ?? 0 }), null);
        simDiag.token = token;
        if (token === null) {
            simLog("simulateAttackAsync gave no token");
            finish(null);
        }
    });
}

/** A unit's melee strength: its own (Combat.getMeleeStrength), else its type's (GameInfo.Unit_Stats Combat). */
function enemyStrength(unit) {
    const own = Number(safe(() => unit.Combat.getMeleeStrength(false), 0)) || 0;
    if (own > 0) return own;
    const type = safe(() => GameInfo.Units.lookup(unit.type)?.UnitType, null);
    return Number(safe(() => GameInfo.Unit_Stats.lookup(type)?.Combat, 0)) || 0;
}

/**
 * Is the predicted attack worth it? Our unit keeps at least STRIKE_KEEP of its health, and the
 * enemy dies or takes STRIKE_TRADE times the damage we take.
 */
export function strikeWorthIt({ ourHealth, ourMax, theirHealth, dealt, taken, siege = false }) {
    if (!(ourMax > 0) || !(dealt > 0)) return false;
    if (ourHealth - taken < STRIKE_KEEP * ourMax) return false;
    return dealt >= theirHealth || dealt >= (siege ? STRIKE_TRADE_SIEGE : STRIKE_TRADE) * Math.max(1, taken);
}

/**
 * A raider here besieges one of our settlements: it stands next to its centre, or the centre (within
 * THREAT_RADIUS) is damaged (research/23 D8: game 8, 41-vs-22 and 36-vs-25 trades were refused while
 * Забид fell).
 */
function besieging(loc) {
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const d = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.location.x, c.location.y), Infinity);
        if (d <= 1 || (d <= THREAT_RADIUS && centreDamaged(c.location))) return true;
    }
    return false;
}

/**
 * Hostile military units (hostileOwner) on our land or within THREAT_RADIUS of one of our
 * settlements, except those in a district (a settlement's defences: a siege, not a raid).
 * @returns [{ loc, id }]
 */
function raidersNear() {
    const out = [];
    const seen = new Set();
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(c.location.x, c.location.y, THREAT_RADIUS), []) ?? []) {
            if (seen.has(idx)) continue;
            seen.add(idx);
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            const district = safe(() => Game.Combat.getDefensibleDistrict({ x: loc.x, y: loc.y }), null);
            if (validId(district)) continue;
            for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
                const unit = safe(() => Units.get(id), null);
                if (hostileOwner(unit)) out.push({ loc: { x: loc.x, y: loc.y }, id });
            }
        }
    }
    return out;
}

const SHOTS_MAX = 8; // ranged shots a pass (each waits for its Combat event)

/**
 * An air strike (research/36 §7: game 29 had no aircraft; Russia's Bomber hit our centres M60-M65): at a hostile
 * soldier within AIR_STRIKE_RADIUS of one of our settlements, the one attacking a settlement (RANGED_GUARD_RADIUS) first,
 * then the most damaged. Sent as the game's air attack mode sends it: `UNITOPERATION_AIR_ATTACK` canStart with no target
 * gives the Plots, then {X, Y} (interface-mode-air-attack.js). @returns a log entry or null
 */
function airAttack(u, def) {
    if (u.Combat && !(Number(u.Combat.attacksRemaining) > 0)) return null;
    const OP = "UNITOPERATION_AIR_ATTACK";
    const r = safe(() => Game.UnitOperations.canStart(u.id, OP, {}, false), null);
    if (!r?.Plots?.length) return null;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const fighters = enemyFighterBases();
    let best = null;
    for (const idx of r.Plots) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || startsWar(u, loc)) continue;
        const enemy = (safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).map((id) => safe(() => Units.get(id), null))
            .find((t) => hostileOwner(t));
        if (!enemy) continue;
        const d = Math.min(Infinity, ...ours.map((c) => dist(c, loc)));
        if (!(d <= AIR_STRIKE_RADIUS)) continue;
        // Research/37 §7D: a raider next to a damaged centre (a capture to prevent), an attacker of a settlement, a kill;
        // less where an enemy fighter's base covers it (an interception).
        const capture = ours.some((c) => dist(c, loc) === 1 && centreDamaged(c));
        const covered = fighters.some((f) => dist(f.at, loc) <= f.range);
        const score = airTargetScore({ d, damage: damageAt(loc), capture, covered });
        if (!best || score > best.score) best = { loc, enemy, score };
    }
    if (!best) return null;
    Game.UnitOperations.sendRequest(u.id, OP, { X: best.loc.x, Y: best.loc.y });
    const theirs = safe(() => GameInfo.Units.lookup(best.enemy.type), null);
    return { key: "AIR_STRIKE", args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.loc.x, best.loc.y] };
}

/**
 * A military aircraft, not an air commander: every Airfield's Aerodrome Commander and the Squadron Commander are
 * DOMAIN_AIR units too (research/37 §3E: any visible enemy Airfield asked for fighters, with no plane anywhere).
 */
export const isAircraft = (def, u = null) => def?.Domain === "DOMAIN_AIR" && def.CoreClass === "CORE_CLASS_MILITARY" && !u?.isCommanderUnit && !hasTag(def, "UNIT_CLASS_COMMAND");

/**
 * Enemy aircraft we see near our settlements (research/36 §7, research/37 §3E): those of the majors at war with us, where
 * they are based (their own tile, else their army's: air units are always packed in a commander), on a tile visible to
 * us, each with our settlements within its Range of that base (a bomber's reach; AIR_WATCH_RADIUS when unknown).
 * @returns [{ type, at, targets: [{ x, y, name }] }], those with a target
 */
export function hostileAircraft() {
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => ({ x: c.location.x, y: c.location.y, name: safe(() => Locale.compose(c.name), "?") }));
    const VISIBLE = globalThis.RevealedStates?.VISIBLE;
    const out = [];
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid() || !safe(() => Players.get(pid()).Diplomacy.isAtWarWith(p.id), false)) continue;
        for (const u of safe(() => p.Units.getUnits(), []) ?? []) {
            const def = safe(() => GameInfo.Units.lookup(u.type), null);
            if (!isAircraft(def, u)) continue;
            const at = unitTile(u);
            if (!at) continue;
            if (VISIBLE !== undefined && safe(() => GameplayMap.getRevealedState(pid(), at.x, at.y), VISIBLE) !== VISIBLE) continue;
            const reach = Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.Range, 0)) || AIR_WATCH_RADIUS;
            const targets = ours.filter((c) => safe(() => GameplayMap.getPlotDistance(c.x, c.y, at.x, at.y), Infinity) <= reach);
            if (targets.length > 0) out.push({ type: def.UnitType, at, targets });
        }
    }
    return out;
}

/** Enemy aircraft in sight that reach one of our settlements (hostileAircraft). */
export const hostileAircraftNear = () => hostileAircraft().length;

const INTERCEPT_RANGE = 3;           // a fighter intercepts within this many tiles of its base (Civilopedia)...
const FLIGHT_MASTERY = "NODE_TECH_MO_FLIGHT"; // ...+1 at an Airfield's commander, +1 after Flight's mastery (depth 2), +1 Ace
const AIR_ARMY_CAPACITY = 4;         // an army's slots when the game does not say (Civilopedia: "initial capacity is 4")

/**
 * Our air bases (research/37 §3E, §7A): each Airfield's Aerodrome Commander and each Squadron Commander, its tile, the city
 * an Airfield belongs to, its free slots (the army's combatUnitCapacity less our aircraft packed in it), the planes in it
 * and how far a fighter based there intercepts (INTERCEPT_RANGE, +1 for an Aerodrome, +1 after Flight's mastery; Ace
 * promotions not counted). @returns [{ at, type, city (ComponentID) or null, free, range, planes: [type] }]
 */
export function airBases() {
    const mine = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const mastery = (Number(safe(() => Game.ProgressionTrees.getNode(pid(), FLIGHT_MASTERY)?.depthUnlocked, 0)) || 0) >= 2 ? 1 : 0;
    const out = [];
    for (const c of mine) {
        const def = safe(() => GameInfo.Units.lookup(c.type), null);
        // An Airfield's Aerodrome Commander (+1 interception range), or a Squadron Commander (research/37 §7A).
        const aerodrome = def?.UnitType === "UNIT_AERODROME_COMMANDER";
        if (!aerodrome && def?.UnitType !== "UNIT_SQUADRON_COMMANDER") continue;
        const at = unitTile(c);
        if (!at) continue;
        const army = safe(() => Armies.get(c.armyId), null);
        const capacity = Number(army?.combatUnitCapacity) || AIR_ARMY_CAPACITY;
        const planes = mine.filter((u) => u !== c && isAircraft(safe(() => GameInfo.Units.lookup(u.type), null), u) && sameId(u.armyId, c.armyId)).length;
        out.push({
            at, type: def.UnitType, city: aerodrome ? safe(() => GameplayMap.getOwningCityFromXY(at.x, at.y), null) : null,
            free: Math.max(0, capacity - planes), range: INTERCEPT_RANGE + (aerodrome ? 1 : 0) + mastery,
            planes: mine.filter((u) => u !== c && sameId(u.armyId, c.armyId)).map((u) => safe(() => GameInfo.Units.lookup(u.type)?.UnitType, "?")),
        });
    }
    return out;
}

/**
 * Our fighters' cover (research/37 §3E): each fighter (`isFighter`) of ours where it is based, and how far it intercepts
 * from there (INTERCEPT_RANGE, +1 at an Airfield's base, +1 after Flight's mastery). @returns [{ at, range }]
 */
export function fighterCover(isFighter) {
    const bases = airBases();
    const mastery = (Number(safe(() => Game.ProgressionTrees.getNode(pid(), FLIGHT_MASTERY)?.depthUnlocked, 0)) || 0) >= 2 ? 1 : 0;
    const out = [];
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!isAircraft(def, u) || !isFighter(def)) continue;
        const at = unitTile(u);
        if (!at) continue;
        const base = bases.find((b) => same(b.at, at));
        out.push({ at, range: base ? base.range : INTERCEPT_RANGE + mastery });
    }
    return out;
}

// ---- the navy (research/37 Phase 6) ----------------------------------------------------------------

const tagsOfType = new Map(); // unit type -> its tags (GameInfo.TypeTags)

/** A unit's naval role (core/xpl-naval.js navalRole): COMMANDER, CARRIER, CIVILIAN, SUBMARINE, RANGED, SCREEN, or null. */
export function shipRole(def) {
    if (!def || def.Domain !== "DOMAIN_SEA") return null;
    if (!tagsOfType.has(def.UnitType)) tagsOfType.set(def.UnitType, (GameInfo.TypeTags?.filter((t) => t.Type === def.UnitType) ?? []).map((t) => t.Tag));
    return navalRole(def, safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null), tagsOfType.get(def.UnitType));
}

/**
 * A warship's attack (research/37 §8A), as the game's own click does it (world-input.js): the naval attack first
 * (UNITOPERATION_NAVAL_ATTACK, melee ships: canStart with no target gives the Plots, then {X, Y}, as the naval attack mode
 * sends it), when the game's preview says the trade pays (strikeWorthIt, as a land strike), else a ranged shot
 * (RANGE_ATTACK). Only hostile units within NAVAL.STRIKE_RADIUS of one of our settlements: one next to a damaged centre
 * first, then a settlement's attacker, then the most damaged (airTargetScore). A submarine never takes a land target. Before,
 * only RANGE_ATTACK was asked, which melee ships very likely lack: our Galleys and Ironclads never hit anything. UI.log
 * gives each ship type's answers once a session (probe P-NAV-1). @returns a log entry or null
 */
async function shipAttack(u, def) {
    if (u.Combat && !(Number(u.Combat.attacksRemaining) > 0)) return null;
    const role = shipRole(def);
    if (!isWarship(role)) return null;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const RANGE = globalThis.UnitOperationTypes?.RANGE_ATTACK ?? "UNITOPERATION_RANGE_ATTACK";
    const naval = safe(() => Game.UnitOperations.canStart(u.id, "UNITOPERATION_NAVAL_ATTACK", {}, false), null);
    const ranged = safe(() => Game.UnitOperations.canStart(u.id, RANGE, {}, false), null);
    if (!navalProbed.has(def.UnitType)) {
        navalProbed.add(def.UnitType);
        const said = (r) => `${r?.Plots?.length ?? 0} plot(s)${r?.FailureReasons?.length ? ` (${r.FailureReasons.join("; ")})` : ""}`;
        log.info(`naval: ${def.UnitType} (${role}) at ${where(u.location)}: NAVAL_ATTACK ${said(naval)}, RANGE_ATTACK ${said(ranged)} (probe P-NAV-1)`);
    }
    const pick = (r) => {
        let best = null;
        for (const idx of r?.Plots ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || startsWar(u, loc)) continue;
            const enemy = (safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).map((id) => safe(() => Units.get(id), null)).find((t) => hostileOwner(t));
            if (!enemy) continue;
            if (role === "SUBMARINE" && !safe(() => GameplayMap.isWater(loc.x, loc.y), false)) continue;
            const d = Math.min(Infinity, ...ours.map((c) => dist(c, loc)));
            if (!(d <= NAVAL.STRIKE_RADIUS)) continue;
            const capture = ours.some((c) => dist(c, loc) === 1 && centreDamaged(c));
            const score = airTargetScore({ d, damage: damageAt(loc), capture });
            if (!best || score > best.score) best = { loc, enemy, score };
        }
        return best;
    };
    const melee = pick(naval);
    if (melee) {
        const r = await simulateAttack(u, melee.loc);
        const answered = !!(r?.Attacker && r?.Defender);
        const ourMax = Number(u.Health?.maxDamage) || 100;
        const ourHealth = ourMax - (Number(u.Health?.damage) || 0);
        const theirMax = Number(answered ? r.Defender.MaxHitPoints : null) || Number(melee.enemy.Health?.maxDamage) || 100;
        const theirHealth = theirMax - (Number(melee.enemy.Health?.damage) || 0);
        const guess = answered ? null : estimateStrike(
            { strength: Number(safe(() => u.Combat.getMeleeStrength(false), 0)) || 0, damage: Number(u.Health?.damage) || 0 },
            { strength: enemyStrength(melee.enemy), damage: Number(melee.enemy.Health?.damage) || 0 },
        );
        const dealt = answered ? Number(r.Defender.DamageTo) || 0 : guess.dealt;
        const taken = answered ? Number(r.Attacker.DamageTo) || 0 : guess.taken;
        if ((answered || enemyStrength(melee.enemy) > 0) && strikeWorthIt({ ourHealth, ourMax, theirHealth, dealt, taken, siege: besieging(melee.loc) })) {
            Game.UnitOperations.sendRequest(u.id, "UNITOPERATION_NAVAL_ATTACK", { X: melee.loc.x, Y: melee.loc.y });
            const theirs = safe(() => GameInfo.Units.lookup(melee.enemy.type), null);
            return { key: "STRUCK", args: [nameOf(def), theirs ? nameOf(theirs) : "?", melee.loc.x, melee.loc.y] };
        }
    }
    const shot = pick(ranged);
    if (!shot) return null;
    Game.UnitOperations.sendRequest(u.id, RANGE, { X: shot.loc.x, Y: shot.loc.y });
    return { key: "RANGED", args: [nameOf(def), shot.loc.x, shot.loc.y] };
}

/**
 * A water tile next to a settlement for a warship (or a navigable river: ships may use one, gotcha 4), free, reached by
 * its own path within NAVAL.POST_MAX_TURNS (a ship in another sea or a lake has none: research/37 §8B, reach is a path),
 * the nearest to the settlement first. @returns { loc, turns } or null
 */
function navalPost(x, s, ctx) {
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, GUARD_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || ctx.stepTo.has(`${loc.x},${loc.y}`) || !standsOn(x.def, loc) || !roomForSoldier(loc) || hazardAt(loc) > 0) continue;
        const near = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, s.x, s.y), 9);
        const far = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, x.u.location.x, x.u.location.y), 99);
        tiles.push({ loc, score: near * 100 + far });
    }
    tiles.sort((a, b) => a.score - b.score);
    for (const { loc } of tiles.slice(0, REINFORCE_TRIES)) {
        const turns = pathTurns(x.u, loc);
        if (turns === null || turns > NAVAL.POST_MAX_TURNS || startsWar(x.u, loc)) continue;
        return { loc, turns };
    }
    return null;
}

/**
 * Warships for the settlements ships attack (research/37 §8B, §8G; Phase 6): each threatened settlement with hostile
 * ships wants up to NAVAL.GUARDS_MAX of our warships on the water next to it (within GUARD_RADIUS), those there and those
 * sent there counted; the free warship (awake or rested by the autopilot, unhurt enough, with every move, not guarding
 * another such settlement) that reaches a post soonest sails there (NAVAL_GUARD). They are no land guards (guardDetail
 * counts land units only): a coast keeps its land holder. UI.log once a turn per settlement: `naval: <name>: …`.
 * Game 38: an independent's Frigates killed an Abambowa and two Field Cannons sent against them at Бутооло. @returns log entries
 */
function planNavalGuards(units, ctx) {
    const out = [];
    const targets = ctx.threats.filter((t) => Number(t.ships) > 0);
    if (targets.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const A = globalThis.UnitActivityTypes;
    const ships = [];
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!isWarship(shipRole(def)) || u.isOnMap === false || !u.location) continue;
        ships.push({ u, def, k: unitKey(u.id) });
    }
    if (ships.length === 0) return out;
    const keyOf = (t) => `${t.settlement.x},${t.settlement.y}`;
    const guarding = (x) => targets.find((t) => dist(x.u.location, t.settlement) <= GUARD_RADIUS);
    const free = (x) => {
        if (ctx.ordered.has(x.k) || x.u.canMove === false || x.u.hasMoved === true || (Number(x.u.Health?.damage) || 0) >= ESCAPE_DAMAGE) return false;
        if (A && (x.u.activityType === A.OPERATION || x.u.activityType === A.HEAL)) return false;
        if (resting(x.u) && !restedByUs.has(x.k)) return false;
        return !guarding(x);
    };
    const used = new Set();
    for (const t of targets) {
        const key = keyOf(t);
        const present = ships.filter((x) => dist(x.u.location, t.settlement) <= GUARD_RADIUS);
        const coming = ships.filter((x) => !present.includes(x) && goals.get(x.k)?.naval && goals.get(x.k)?.guard === key);
        let lack = Math.min(NAVAL.GUARDS_MAX, Number(t.ships)) - present.length - coming.length;
        const sent = [];
        while (lack > 0) {
            let best = null;
            for (const x of ships) {
                if (used.has(x.k) || !free(x)) continue;
                const post = navalPost(x, t.settlement, ctx);
                if (post && (!best || post.turns < best.post.turns)) best = { x, post };
            }
            if (!best) break;
            used.add(best.x.k);
            wakeUnit(best.x.u);
            if (!moveTo(best.x.u, best.post.loc)) continue;
            goals.set(best.x.k, { guard: key, tile: best.post.loc, turn: Game.turn, naval: true });
            restedByUs.delete(best.x.k);
            ctx.stepTo.add(`${best.post.loc.x},${best.post.loc.y}`);
            ctx.ordered.add(best.x.k);
            sent.push(`${best.x.def.UnitType} from ${where(best.x.u.location)} in ${best.post.turns}t`);
            out.push({ key: "NAVAL_GUARD", args: [nameOf(best.x.def), t.settlement.name] });
            lack--;
        }
        if (navalNoted.get(key) !== Game.turn) {
            navalNoted.set(key, Game.turn);
            const name = (x) => x.def.UnitType;
            log.info(`naval: ${t.settlement.name}: ships ${t.ships}; warships there [${present.map(name).join(", ")}], coming [${coming.map(name).join(", ")}]; sent [${sent.join("; ")}]; ${ships.filter((x) => !used.has(x.k) && free(x)).length} free warship(s)`);
        }
    }
    return out;
}

// ---- the air wing (research/37 Phase 5) -------------------------------------------------------

/**
 * Remembers an enemy air attack on us from the game's `Combat` event (probe P-AIR-5, game 36: it carries `attacker`,
 * `defender`, `interceptor` and `antiAir` component ids): an aircraft of another player hitting a unit or a district of
 * ours, where it hit, for AIR.RAID_TURNS. @returns true when it was one
 */
export function noteAirRaid(d) {
    const attacker = safe(() => Units.get(d?.attacker), null);
    if (!attacker || attacker.owner === pid() || d?.defender?.owner !== pid()) return false;
    const def = safe(() => GameInfo.Units.lookup(attacker.type), null);
    if (!isAircraft(def, attacker)) return false;
    const at = safe(() => Units.get(d.defender)?.location, null) ?? safe(() => Districts.get(d.defender)?.location, null);
    if (!at || !(at.x >= 0)) return false;
    const turn = safe(() => Game.turn, 0);
    airRaids.push({ x: at.x, y: at.y, turn, type: def.UnitType, owner: attacker.owner });
    while (airRaids.length > 30) airRaids.shift();
    log.info(`air: ${def.UnitType} of p${attacker.owner} hit ours at ${at.x},${at.y} (T${turn}): fighter cover wanted there for ${AIR.RAID_TURNS} turns`);
    return true;
}

/** Our settlements within AIR.RAID_RADIUS of an enemy air attack of the last AIR.RAID_TURNS turns. @returns [{ x, y, name }] */
export function airRaidTargets() {
    const turn = safe(() => Game.turn, 0);
    const recent = airRaids.filter((r) => turn - r.turn < AIR.RAID_TURNS && turn >= r.turn);
    if (recent.length === 0) return [];
    return (safe(() => Players.get(pid()).Cities.getCities(), []) ?? [])
        .filter((c) => recent.some((r) => safe(() => GameplayMap.getPlotDistance(r.x, r.y, c.location.x, c.location.y), Infinity) <= AIR.RAID_RADIUS))
        .map((c) => ({ x: c.location.x, y: c.location.y, name: safe(() => Locale.compose(c.name), "?") }));
}

/** The fighters of the majors at war with us that we see, with how far they intercept from their base (3, +1: cautious). */
function enemyFighterBases() {
    const VISIBLE = globalThis.RevealedStates?.VISIBLE;
    const out = [];
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid() || !safe(() => Players.get(pid()).Diplomacy.isAtWarWith(p.id), false)) continue;
        for (const u of safe(() => p.Units.getUnits(), []) ?? []) {
            const def = safe(() => GameInfo.Units.lookup(u.type), null);
            if (!isAircraft(def, u) || !hasTag(def, "UNIT_CLASS_INTERCEPTOR")) continue;
            const at = unitTile(u);
            if (!at || (VISIBLE !== undefined && safe(() => GameplayMap.getRevealedState(pid(), at.x, at.y), VISIBLE) !== VISIBLE)) continue;
            out.push({ at, range: INTERCEPT_RANGE + 1 });
        }
    }
    return out;
}

/**
 * Fighters rebase to cover what needs it (research/37 §7B; core/xpl-air.js planRebases): `ctx.airCover`, our settlements
 * enemy aircraft hit lately or reach from their bases, a Launch Pad city first (steps.airCoverTargets). A fighter moves only
 * when its base covers no wanted settlement that it alone covers, it has its attack and moves, it was not rebased within
 * AIR.REBASE_HOLD turns, and the game offers the new base's tile (UNITOPERATION_REBASE: canStart with no target gives the
 * Plots, then {X, Y}, as the game's rebase mode sends it); one plane a free slot. A rebase the game did not carry out (the
 * plane is not there the next turn) keeps that base off for that plane AIR.REBASE_RETRY turns: re-planned, not resent.
 * @returns log entries
 */
function rebaseFighters(ctx, units) {
    const out = [];
    const targets = ctx.airCover ?? [];
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const bases = safe(() => airBases(), []) ?? [];
    const mastery = (Number(safe(() => Game.ProgressionTrees.getNode(pid(), FLIGHT_MASTERY)?.depthUnlocked, 0)) || 0) >= 2 ? 1 : 0;
    const fighters = [];
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!isAircraft(def, u) || !hasTag(def, "UNIT_CLASS_INTERCEPTOR")) continue;
        const at = unitTile(u);
        if (!at) continue;
        const k = unitKey(u.id);
        const sent = rebased.get(k);
        if (sent && !sent.checked && sent.turn < Game.turn) {
            sent.checked = true;
            if (!same(at, sent.to)) {
                rebaseRefused.set(`${k}|${sent.to.x},${sent.to.y}`, Game.turn);
                log.warn(`air: ${def.UnitType} was not rebased to ${where(sent.to)} (still at ${where(at)}): that base is left out for it ${AIR.REBASE_RETRY} turns`);
            }
        }
        const base = bases.find((b) => same(b.at, at));
        // Rebased lately and there: it stays a while (no back and forth); refused: re-planned at once (another base).
        const lately = !!sent && same(at, sent.to) && Game.turn - sent.turn < AIR.REBASE_HOLD;
        const movable = targets.length > 0 && !lately && !ctx.ordered.has(k) && u.hasMoved !== true && !(u.Combat && !(Number(u.Combat.attacksRemaining) > 0));
        const offered = new Set();
        if (movable) {
            for (const i of safe(() => Game.UnitOperations.canStart(u.id, "UNITOPERATION_REBASE", {}, false), null)?.Plots ?? []) {
                const l = safe(() => GameplayMap.getLocationFromIndex(i), null);
                if (l && !(Game.turn - (rebaseRefused.get(`${k}|${l.x},${l.y}`) ?? -Infinity) < AIR.REBASE_RETRY)) offered.add(`${l.x},${l.y}`);
            }
        }
        fighters.push({ key: k, at, range: base ? base.range : INTERCEPT_RANGE + mastery, movable, offered, u, def });
    }
    ctx.airFighters = fighters;
    if (targets.length === 0 || fighters.length === 0) return out;
    for (const m of planRebases({ fighters, bases, targets, dist })) {
        const f = fighters.find((x) => x.key === m.key);
        Game.UnitOperations.sendRequest(f.u.id, "UNITOPERATION_REBASE", { X: m.to.x, Y: m.to.y });
        rebased.set(f.key, { turn: Game.turn, to: m.to, from: f.at, checked: false });
        ctx.ordered.add(f.key);
        (ctx.airRebases ??= []).push(`${f.def.UnitType} ${where(f.at)} -> ${where(m.to)} for ${m.target.name ?? where(m.target)}`);
        out.push({ key: "FIGHTER_REBASED", args: [nameOf(f.def), m.target.name ?? "?"] });
    }
    return out;
}

/**
 * UI.log once a turn while we have an air base or a plane (research/37 §10, Phase 5): each base with its planes, free
 * slots and interception range, the settlements wanting cover (why, and how many fighters cover each), and the rebases.
 */
function logAirWing(ctx) {
    if (airLogged === Game.turn) return;
    const bases = safe(() => airBases(), []) ?? [];
    if (bases.length === 0 && !(ctx.airFighters?.length > 0)) return;
    airLogged = Game.turn;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const fighters = ctx.airFighters ?? [];
    const cover = (ctx.airCover ?? []).map((t) => `${t.name ?? where(t)} (${t.why ?? "?"}) covered by ${fighters.filter((f) => dist(f.at, t) <= f.range).length}`);
    log.info(`air: bases [${bases.map((b) => `${b.type === "UNIT_SQUADRON_COMMANDER" ? "squadron" : "airfield"} ${where(b.at)} [${b.planes.join(", ")}] free ${b.free} intercepts ${b.range}`).join("; ")}]; cover wanted [${cover.join("; ")}]; rebases [${(ctx.airRebases ?? []).join("; ")}]`);
}

// ---- probes for the next phases (research/37 §3F, §11C; UI.log only) ----------------------------------

const armyNoted = new Map(); // commander key -> its last army line (written again only when it changes)
const PROBE_AIR_LINES = 12;  // aircraft lines a turn at most
const PROBE_COMBAT_LINES = 2; // Combat event payloads a turn, while aircraft are about
let probeTurn = -1;
let airAbout = false;        // aircraft of ours or of a leader at war with us seen this turn (the Combat probe listens then)
let combatLogged = { turn: -1, n: 0 };

const where = (l) => (l ? `${l.x},${l.y}` : "?");
const typeOf = (u) => safe(() => GameInfo.Units.lookup(u.type)?.UnitType, "?");

/**
 * Once a turn (the first full pass): P-A1, each of our commanders' armies when it changes (an age's first turn makes new
 * ones): its type and tile, the army's id, localId, unitCount, capacity, location and getUnitIds(), and each member's
 * isOnMap, tile, activity and moves; P-A3, our units reinforcing an army (commander, start, ETA each turn); P-AIR-1, every
 * aircraft and air commander of ours and of the leaders at war with us (commander or not, isOnMap, own tile, army, the
 * army's tile and size, what MapUnits lists at the base); P-AIR-2, each Airfield city's answer for a fighter (BUILD,
 * PURCHASE) with its base's free slots.
 */
export function probeMilitary() {
    const isFighter = (def) => hasTag(def, "UNIT_CLASS_INTERCEPTOR");
    if (probeTurn === Game.turn) return;
    probeTurn = Game.turn;
    const me = safe(() => Players.get(pid()), null);
    const mine = safe(() => me.Units.getUnits(), []) ?? [];
    // P-A1: armies.
    for (const c of mine) {
        if (!c.isCommanderUnit) continue;
        const army = safe(() => Armies.get(c.armyId), null);
        const members = mine.filter((u) => u !== c && sameId(u.armyId, c.armyId));
        const ids = safe(() => army.getUnitIds(), null);
        const line = `army: ${typeOf(c)} at ${where(c.location)} onMap=${c.isOnMap}; army ${idString(c.armyId) || "?"} local ${army?.localId ?? "?"} unitCount ${army?.unitCount ?? "?"} capacity ${army?.combatUnitCapacity ?? "?"} at ${where(army?.location)} ids ${ids ? ids.length : "?"}: [${members.map((m) => `${typeOf(m)} onMap=${m.isOnMap} at ${where(m.location)} act=${m.activityType} moves=${m.Movement?.movementMovesRemaining ?? "?"}`).join("; ")}]`;
        const k = unitKey(c.id);
        if (armyNoted.get(k) !== line) log.info(line);
        armyNoted.set(k, line);
    }
    // P-A3: reinforcements on their way.
    for (const u of mine) {
        const to = Number(safe(() => me.Armies.getUnitReinforcementCommanderId(u.id, pid()), -1));
        if (!(to >= 0)) continue;
        const from = safe(() => me.Armies.getUnitReinforcementStartLocation(u.id, pid()), null);
        const eta = safe(() => me.Armies.getUnitReinforcementETA(u.id, pid()), "?");
        log.info(`reinforce: ${typeOf(u)} ${unitKey(u.id)} -> commander ${to}, from ${where(from)}, ETA ${eta} (T${Game.turn}); onMap=${u.isOnMap} at ${where(u.location)}`);
    }
    // P-AIR-1: aircraft and air commanders, ours and those of the leaders at war with us.
    let lines = 0;
    airAbout = false;
    const players = [me, ...(safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMajor && p.id !== pid() && safe(() => me.Diplomacy.isAtWarWith(p.id), false))];
    for (const p of players) {
        for (const u of safe(() => p.Units.getUnits(), []) ?? []) {
            const def = safe(() => GameInfo.Units.lookup(u.type), null);
            if (def?.Domain !== "DOMAIN_AIR") continue;
            airAbout = true;
            if (lines >= PROBE_AIR_LINES) continue;
            lines++;
            const army = safe(() => Armies.get(u.armyId), null);
            const base = unitTile(u);
            const here = base ? (safe(() => MapUnits.getUnits(base.x, base.y), []) ?? []).length : "?";
            log.info(`air: p${p.id} ${def.UnitType} commander=${!!u.isCommanderUnit} onMap=${u.isOnMap} at ${where(u.location)}; army ${idString(u.armyId) || "-"} at ${where(army?.location)} unitCount ${army?.unitCount ?? "?"} capacity ${army?.combatUnitCapacity ?? "?"}; MapUnits at the base ${here}`);
        }
    }
    // P-AIR-2: what an Airfield city answers for a fighter.
    {
        const fighter = GameInfo.Units?.find((d) => isFighter(d) && d.CanTrain !== false && d.CanTrain !== "false");
        for (const b of airBases()) {
            const city = safe(() => Cities.get(b.city), null);
            if (!city || !fighter) continue;
            const args = { UnitType: fighter.$hash };
            const build = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
            const buy = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
            const why = (r) => `${r?.Success ?? "?"}${r?.FailureReasons?.length ? ` (${r.FailureReasons.join("; ")})` : ""}`;
            log.info(`air: ${safe(() => Locale.compose(city.name), "?")}'s Airfield at ${where(b.at)}: free ${b.free}, range ${b.range}; ${fighter.UnitType} build ${why(build)}, buy ${why(buy)}`);
        }
    }
}

// P-AIR-5: what the game's Combat event carries (an enemy aircraft hitting us: does the payload say so?).
try {
    engine.on("Combat", (d) => {
        safe(() => noteAirRaid(d), null);
        if (!airAbout) return;
        const turn = safe(() => Game.turn, -1);
        if (combatLogged.turn !== turn) combatLogged = { turn, n: 0 };
        if (combatLogged.n >= PROBE_COMBAT_LINES) return;
        combatLogged.n++;
        let text = "?";
        try {
            text = JSON.stringify(d);
        } catch (_e) {
            text = Object.keys(d ?? {}).join(",");
        }
        log.info(`air: Combat event T${turn}: ${String(text).slice(0, 400)}`);
    });
} catch (_e) {
    // No engine events here.
}

/** A unit that attacks from afar: a ranged or bombard strength (GameInfo.Unit_Stats). */
function shootsFromAfar(def) {
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    return Number(s?.RangedCombat) > 0 || Number(s?.Bombard) > 0;
}

/**
 * Ranged soldiers shoot the hostile soldiers they reach, those on guard too (game 27: a Field Gun on alert in
 * Ханькоу's centre, at full health, never fired while two Dreadnoughts next to it shelled the centre from 200 to 0
 * in 7 turns, T71-T77). A unit on alert, fortified, asleep or resting is busy: `defend`, where ranged units shot,
 * orders only idle ones, and the game wakes a unit only when it is attacked itself. The guards counted as enough
 * (no `defenders: none for Ханькоу` line), so no other defender came either. Every ranged soldier with an attack left,
 * not on its way (a move order) nor in danger off a centre (it gets out of reach: escape), shoots at a soldier we
 * are at war with only, one after another, each after the last one's Combat event so the next sees the damage
 * (rangedAttack: the one attacking our settlement first, then the most damaged). @returns log entries
 */
async function shootRaiders(ordered) {
    const out = [];
    const A = globalThis.UnitActivityTypes;
    const centres = new Set((safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => `${c.location.x},${c.location.y}`));
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (out.length >= SHOTS_MAX) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        // Aircraft too (based ones may count as off the map): the game's air attack (airAttack).
        const air = def?.Domain === "DOMAIN_AIR";
        if (!isSoldier(def) || u.isCommanderUnit || (!air && u.isOnMap === false) || ordered.has(unitKey(u.id)) || !shootsFromAfar(def)) continue;
        if (!(Number(u.Combat?.attacksRemaining) > 0) || (A && u.activityType === A.OPERATION)) continue;
        if (def.Domain === "DOMAIN_LAND" && !centres.has(`${u.location?.x},${u.location?.y}`) && inDanger(u, def)) continue;
        const e = air ? airAttack(u, def) : def.Domain === "DOMAIN_SEA" ? await shipAttack(u, def) : rangedAttack(u, def, { hostileOnly: true });
        if (!e) continue;
        ordered.add(unitKey(u.id));
        out.push(e);
        await untilEvent("Combat", COMBAT_WAIT_MS);
    }
    return out;
}

/**
 * Melee soldiers strike raiders next to them (with «Оборона»): seen in game, an independent's
 * raiders stayed around the capital for a whole age, pillaging (47 repairs bought) while our
 * soldiers only fortified; ranged ones shoot first (shootRaiders). Every military unit with
 * an attack left (fortified ones too: attacking wakes them; not commanders, not ranged ones)
 * attacks a raider on a neighbouring tile near our settlements (raidersNear) when the game's
 * own prediction (simulateAttack) says it is worth it (strikeWorthIt); the kill first, else
 * the most damage. Same request as the map's attack: MOVE_TO {X, Y, Modifiers: ATTACK +
 * MOVE_IGNORE_UNEXPLORED_DESTINATION} once canStart agrees (world-input.js). Never one that
 * starts a war. @returns { entries, ordered: Set of unit keys }
 */
export async function strikeRaiders() {
    const entries = [];
    const ordered = new Set();
    const M = globalThis.UnitOperationMoveModifiers;
    const strikes = M?.ATTACK !== undefined && typeof safe(() => Game.Combat.simulateAttackAsync, null) === "function";
    // Commanders' focused attacks first (their units then have no attack left for single strikes).
    if (strikes) {
        const focused = await commanderAttacks(safe(() => Players.get(pid()).Units.getUnits(), []) ?? [], M);
        entries.push(...focused.entries);
        for (const k of focused.ordered) ordered.add(k);
    }
    // Ranged soldiers next, those on guard too (game 27): their damage may make a melee strike worth it.
    const shots = await shootRaiders(ordered);
    entries.push(...shots);
    if (!strikes) return { entries, ordered };
    const MOVE = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    // Why nothing struck, for UI.log (seen in game: no strike in a whole game, cause unknown).
    const seen = { pairs: 0, noAnswer: 0, impossible: 0, poor: 0 };
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (entries.length - shots.length >= STRIKE_MAX) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (def?.CoreClass !== "CORE_CLASS_MILITARY" || u.isCommanderUnit || u.isOnMap === false || u.canMove === false || ordered.has(unitKey(u.id))) continue;
        const c = u.Combat;
        if (!c || !(Number(c.attacksRemaining) > 0)) continue;
        const melee = Number(safe(() => c.getMeleeStrength(false), 0)) || 0;
        if (!(melee > 0) || Number(c.rangedStrength ?? 0) > melee || Number(c.bombardStrength ?? 0) > melee) continue;
        const ourMax = Number(u.Health?.maxDamage) || 100;
        const ourHealth = ourMax - (Number(u.Health?.damage) || 0);
        let best = null;
        for (const t of raidersNear()) {
            if (safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, t.loc.x, t.loc.y), 9) !== 1) continue;
            const args = { X: t.loc.x, Y: t.loc.y, Modifiers: M.ATTACK };
            if (startsWar(u, t.loc) || !safe(() => Game.UnitOperations.canStart(u.id, MOVE, args, false), null)?.Success) continue;
            seen.pairs++;
            const r = await simulateAttack(u, t.loc);
            const answered = !!(r?.Attacker && r?.Defender);
            // An answer without our side: the game says no attack is possible (its attack preview hides
            // itself: panel-unit-combat-preview.js); the estimate is for no answer at all (research/23 D8).
            if (r && !answered) {
                seen.impossible++;
                continue;
            }
            if (!answered) seen.noAnswer++;
            const enemy = safe(() => Units.get(answered ? r.Defender.ID ?? t.id : t.id), null);
            const theirMax = Number((answered ? r.Defender.MaxHitPoints : null) ?? enemy?.Health?.maxDamage) || 100;
            const theirHealth = theirMax - (Number(enemy?.Health?.damage) || 0);
            // No answer from the game (probe P1): the estimate, pessimistic for us (core/xpl-combat.js).
            const guess = answered ? null : estimateStrike(
                { strength: melee, damage: Number(u.Health?.damage) || 0 },
                { strength: enemyStrength(enemy), damage: Number(enemy?.Health?.damage) || 0 },
            );
            if (!answered && !(guess && enemyStrength(enemy) > 0)) continue;
            const dealt = answered ? Number(r.Defender.DamageTo) || 0 : guess.dealt;
            const taken = answered ? Number(r.Attacker.DamageTo) || 0 : guess.taken;
            if (!strikeWorthIt({ ourHealth, ourMax, theirHealth, dealt, taken, siege: besieging(t.loc) })) {
                if (answered) seen.poor++;
                continue;
            }
            if (!answered) log.warn(`strike: no prediction for ${nameOf(def)} at ${t.loc.x},${t.loc.y}; the estimate says ${dealt} dealt, ${taken} taken`);
            const score = (dealt >= theirHealth ? 1000 : 0) + dealt - taken;
            if (!best || score > best.score) best = { t, score, enemy };
        }
        if (!best) continue;
        Game.UnitOperations.sendRequest(u.id, MOVE, { X: best.t.loc.x, Y: best.t.loc.y, Modifiers: M.ATTACK + (M.MOVE_IGNORE_UNEXPLORED_DESTINATION ?? 0) });
        ordered.add(unitKey(u.id));
        const theirs = safe(() => GameInfo.Units.lookup(best.enemy?.type), null);
        entries.push({ key: "STRUCK", args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.t.loc.x, best.t.loc.y] });
        await untilEvent("Combat", COMBAT_WAIT_MS);
    }
    if (entries.length === 0 && seen.pairs > 0) log.warn(`strike: ${seen.pairs} raider(s) next to our melee units, ${seen.noAnswer} without the game's prediction, ${seen.impossible} impossible, ${seen.poor} not worth it`);
    return { entries, ordered };
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
    const weights = profileFor(settings).y;
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
    loadRested();
    for (const k of [...restedByUs]) if (!alive.has(k)) restedByUs.delete(k);
    adoptCarriedOver(units);
    // Guard goals that no longer hold (research/36 §1): the unit heals, sleeps or walks elsewhere, or its settlement is
    // neither threatened, exposed nor a war front any more.
    const posts = new Set([...(options.threats ?? []), ...(options.exposed ?? []), ...(options.fronts ?? [])].map((t) => `${t.settlement.x},${t.settlement.y}`));
    for (const u of units) {
        const k = unitKey(u.id);
        const g = goals.get(k);
        if (g?.guard !== undefined && (!posts.has(g.guard) || !safe(() => guardProgress(u, g), null))) goals.delete(k);
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
        riskOwners: new Set(options.riskOwners ?? []),
        // War risks that are Hostile: their soldiers frighten settlers at any distance (research/24 X4).
        riskHostile: new Set((options.riskOwners ?? []).filter((id) => {
            const R = globalThis.DiplomacyPlayerRelationships;
            return !!R && safe(() => Players.get(pid()).Diplomacy.getRelationshipEnum(id), null) === R.PLAYER_RELATIONSHIP_HOSTILE;
        })),
        settleNear: !!options.settleNear,
        // A settler with no site founds wherever the game allows (the strategy's settleAnywhere: research/31 §3).
        anywhere: !!options.anywhere,
        // Settlements the military lever founds past the cap (research/30 §1).
        pastCap: Math.max(0, Number(options.pastCap) || 0),
        // Independents a unit is already walking to (one at a time).
        approached: new Set([...goals.values()].filter((g) => g.approach !== undefined).map((g) => g.approach)),
        // Villages a soldier walks to, to disperse them (one each).
        dispersing: new Set([...goals.values()].filter((g) => g.disperse).map((g) => g.disperse)),
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
        // War fronts that are not threatened yet: a guard each (research/36 §2).
        fronts: (options.fronts ?? []).filter((f) => !(options.threats ?? []).some((t) => same(t.settlement, f.settlement))),
        // Settlements near a village at war with us, not threatened: a holder each (research/37 §4B).
        exposed: (options.exposed ?? []).filter((e) => !(options.threats ?? []).some((t) => same(t.settlement, e.settlement))),
        posts: new Map(), // unit key -> its post (planDefence)
        formation: new Map(), // unit key -> its move in its settlement's formation (planFormations)
        formations: new Map(), // settlement key -> its formation
        // Our settlements wanting fighter cover, the most important first (steps.airCoverTargets; research/37 §7B).
        airCover: options.airCover ?? [],
    };
    safe(() => noteHits(units), null);
    safe(() => logCommanderParameters(), null);
    if (options.explore || options.settlers || options.defend || options.merchants || options.roam) {
        entries.push(...(safe(() => releaseStuckMoves(units), []) ?? []));
    }
    // Roaming, approaching, reinforcing or dispersing: the first military unit standing in each of our cities stays as its garrison.
    {
        const cityTiles = new Set((safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => `${c.location.x},${c.location.y}`));
        const taken = new Set();
        for (const u of units) {
            const def = safe(() => GameInfo.Units.lookup(u.type), null);
            const tile = `${u.location?.x},${u.location?.y}`;
            if (def?.CoreClass !== "CORE_CLASS_MILITARY" || def.Domain === "DOMAIN_AIR" || !cityTiles.has(tile) || taken.has(tile)) continue;
            taken.add(tile);
            garrison.add(unitKey(u.id));
        }
    }
    // Who defends where (research/36 §4): with «Оборона» or «Армия».
    if (options.defend || options.roam) {
        try {
            // Armies (research/37 Phase 3): the inventory, and those at a threatened settlement or a front unpack first.
            ctx.armies = armyInventory(units);
            entries.push(...unpackArmies(ctx));
            ctx.supply = defenceSupply(units, ctx);
            planDefence(units, ctx);
        } catch (error) {
            log.debug("autopilot defence plan failed", error);
            ctx.posts = new Map();
        }
        // Formations (research/37 Phase 4): the soldiers already at a threatened settlement improve their posts.
        try {
            planFormations(units, ctx);
        } catch (error) {
            log.debug("autopilot formations failed", error);
            ctx.formation = new Map();
            ctx.formations = new Map();
        }
    }
    // Fighters rebase to cover what needs it (research/37 Phase 5); warships sail to the coasts ships attack (Phase 6).
    if (options.defend) entries.push(...(safe(() => rebaseFighters(ctx, units), []) ?? []));
    if (options.defend) entries.push(...(safe(() => planNavalGuards(units, ctx), []) ?? []));
    const A = globalThis.UnitActivityTypes;
    const seen = [];
    for (const u of units) {
        if (ordered.size >= MAX_UNIT_ORDERS) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const what = `${def?.UnitType ?? u.type}(act=${u.activityType},move=${u.canMove},moved=${u.hasMoved})`;
        // Ordered already in this pass, before the loop (an army's unpacking, a fighter's rebase, a warship's post) or by a
        // neighbour's room-making: its order stands (before, an unpacking commander could be sent to its post as well).
        if (ordered.has(unitKey(u.id))) {
            seen.push(`${what}:ordered`);
            continue;
        }
        if (options.leave?.has(unitKey(u.id))) {
            // Its order did not take; stacked with another of its kind it may not skip either (root CLAUDE.md gotcha
            // 23; game 10: two settlers on the capital held the turn): it steps aside.
            const aside = def && isIdle(u) ? safe(() => stepAside(u, def, ctx, { away: true }), null) : null;
            if (aside) {
                seen.push(`${what}:${aside.key}`);
                entries.push(aside);
                ordered.add(unitKey(u.id));
                continue;
            }
            seen.push(`${what}:left`);
            continue;
        }
        // Standing on a village at war with us: dispersed first, hurt or not, moves left or not (game 37 T63: a Warrior on
        // Тичитты's empty village, hit for 30 the night before, withdrew instead and the village kept raiding).
        if (def && (options.defend || options.roam) && u.isOnMap !== false) {
            const e = safe(() => disperseHere(u, def, ctx), null);
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
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
        // In danger (a scout, or a soldier badly hurt or resting hurt, with hostile soldiers near): out of reach,
        // onto shallow water when only land melee units threaten it (research/24 W6).
        const scoutLike = def && hasTag(def, "UNIT_CLASS_AUTOEXPLORE");
        if (def && def.Domain === "DOMAIN_LAND" && !u.isCommanderUnit && u.isOnMap !== false && u.canMove !== false && u.hasMoved !== true
            && ((def.CoreClass === "CORE_CLASS_MILITARY" && (options.defend || options.roam)) || (scoutLike && options.explore))) {
            let e = null;
            try {
                e = escape(u, def, ctx);
            } catch (error) {
                log.debug(`autopilot escape ${def.UnitType} failed`, error);
            }
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
        }
        // A soldier or scout waiting on water (embarked: it cannot fight) goes ashore first, unless it hides there
        // from land soldiers.
        if (def && def.Domain === "DOMAIN_LAND" && isIdle(u) && (def.CoreClass === "CORE_CLASS_MILITARY" || hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) && !u.isCommanderUnit) {
            let e = null;
            try {
                e = stayAtSea(u, def) ?? leaveTheWater(u, def, ctx);
            } catch (error) {
                log.debug(`autopilot water ${def.UnitType} failed`, error);
            }
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
        }
        // A defender for a threatened settlement or a war front (planDefence), woken when it sleeps or is fortified.
        if (def && ctx.posts.has(unitKey(u.id))) {
            const e = safe(() => reinforce(u, def, ctx), null);
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
        }
        // A better post in its settlement's formation (research/37 Phase 4), woken first when the autopilot fortified it.
        if (def && ctx.formation.has(unitKey(u.id))) {
            const e = safe(() => formMove(u, def, ctx), null);
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
                // Exploring by itself into hostile units: away from them first; hurt, or with danger within
                // SCOUT_WIDE, it explores by our rules (explore: heal, our frontier widely) instead of the game's.
                e = (hostileNear(u.location, SCOUT_DANGER, ctx) ? stepAway(u, def, ctx) : null)
                    ?? (autoExploreIsSafe(u, ctx) ? null : explore(u, def, ctx))
                    ?? (own?.village ? null : scoutVillage(u, def, ctx))
                    ?? toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
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
                e = disperseHere(u, def, ctx) ?? goDisperse(u, def, ctx) ?? (ctx.approach.length > 0 ? approach(u, def, ctx) : null) ?? roam(u, def, ctx);
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
                risk = asSettler(ctx, () => settlerStuck(u) || settlerAtRisk(u, ctx));
            } catch (error) {
                log.debug(`autopilot settler ${def.UnitType} check failed`, error);
            }
            if (risk) {
                const own = goals.get(unitKey(u.id));
                if (own?.x !== undefined) taken.delete(`${own.x},${own.y}`);
                let e = null;
                try {
                    e = asSettler(ctx, () => settle(u, def, taken, ctx));
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
        // On a plague (or fallout, fire) tile: out of it this turn, resting or not (game 18: the plague killed our
        // fortified garrisons). Not a unit on its way (its move goes on).
        if (def && u.isOnMap !== false && u.canMove !== false && (!A || u.activityType !== A.OPERATION)
            && (options.defend || options.roam || options.explore || options.settlers || options.merchants)) {
            const e = safe(() => leaveHazard(u, def, ctx), null);
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
        }
        // A commander the game stopped on its way (moves left) gets its post again.
        if (!isIdle(u) && !(u.isCommanderUnit && readyForOrders(u))) {
            seen.push(`${what}:busy`);
            continue;
        }
        // A land commander (research/25) stands where its radius helps: the most threatened settlement's centre, in peace
        // the unhappiest one (−10% unhappiness, +10% per promotion); before this it stood idle all game.
        if (def && u.isCommanderUnit && (options.defend || options.roam) && isLandCommander(def) && readyForOrders(u)) {
            let e = null;
            try {
                e = postCommander(u, def, ctx);
            } catch (error) {
                log.debug(`autopilot commander ${def.UnitType} failed`, error);
            }
            seen.push(`${what}:${e ? e.key : "post"}`);
            if (e) {
                entries.push(e);
                ordered.add(unitKey(u.id));
            }
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
                e = asSettler(ctx, () => settle(u, def, taken, ctx));
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
            // the turn stays held (NOTIFICATION_COMMAND_UNITS). Aircraft do not walk.
            if (!e && def.Domain !== "DOMAIN_AIR") e = stepAside(u, def, ctx);
        } catch (error) {
            log.debug(`autopilot unit ${def.UnitType} failed`, error);
        }
        seen.push(`${what}:${e ? e.key : `none[can: ${allowedOperations(u).join(",")}]`}`);
        if (e) {
            entries.push(e);
            ordered.add(unitKey(u.id));
        }
    }
    if (options.defend || options.roam) {
        safe(() => logDefence(ctx, units), null);
        safe(() => logFormations(ctx), null);
    }
    if (options.defend) safe(() => logAirWing(ctx), null);
    safe(() => saveRested(), null);
    // The game cuts log lines at about 1000 characters: busy units are only counted.
    const busy = seen.filter((t) => t.endsWith(":busy")).length;
    log.info(`autopilot units: ${busy} busy; ${seen.filter((t) => !t.endsWith(":busy")).join("; ") || "no other"}`);
    for (const u of units) if (ordered.has(unitKey(u.id))) orderedAt.set(unitKey(u.id), { x: u.location?.x, y: u.location?.y });
    return { entries, ordered, orderedAt };
}
