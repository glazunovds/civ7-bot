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
import { conversionTargets, isMissionary, iusReformandiActive, SPREAD } from './xpl-missions.js';
import { createBudget } from '../core/xpl-savings.js';
import { estimateStrike } from '../core/xpl-combat.js';
import { FORM, commanderTile, planFormation, sectorsOf } from '../core/xpl-formation.js';
import { AIR, airTargetScore, planRebases } from '../core/xpl-air.js';
import { NAVAL, fightsShips, inShipReach, isWarship, navalRole, outGuns } from '../core/xpl-naval.js';
import { CAMPAIGN, campaignEnd, districtStrikeWorthIt, forceEnough, peaceIntent, progressed, readyToAssault } from '../core/xpl-campaign.js';
import { GENERAL, XP_DEFAULTS, assignRoles, belowIndependentCap, commendationOrder, fightXpShare, keyPromotionsLeft, promotionOrder, roleFromPromotions, threatPost } from '../core/xpl-generals.js';
import { HUNT, RAIDER, SKIRMISH, TRAINING, fieldForce, fieldReady, huntEnd, huntReason, raiderEnd, trainingEnd } from '../core/xpl-field-ops.js';
import { idString, sameId, validId } from '../core/xpl-component-id.js';
import { meleeStrength, noteMeleeObtained } from './xpl-centre-defence.js';
import { resetSeenUnits, seenNow, unitsSeenAt } from './xpl-seen-units.js';
import { SCOUT, createSightMemory, frontierScore, keepsHeading, wrapDx } from '../core/xpl-scouting.js';
import { NUKE, bestBlast, bestCityBlast, blastVerdict, cityBlastVerdict } from '../core/xpl-nuclear.js';
import { PLAGUE, VILLAGE_REST_KEEP, awayOrder, escapeWays, hazardTurns, stopUnsafe, turnStops, wayCost } from '../core/xpl-unit-safety.js';
import { gameKey, settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

// The parameters the game's unit panel sends for an untargeted operation (unit-actions.js).
export const NO_TARGET = Object.freeze({ X: -9999, Y: -9999, UnitAbilityType: -1 });
const SETTLE_MAX_TURNS = 10;     // a site further away than this is not walked to...
const BOLD_MAX_TURNS = 15;       // ...this with a military countdown to block or to start (asSettler: ctx.bold)
// ...this while we have fewer than NEAR_SETTLEMENTS (research/22 A1: game 7 walks of 6-10 turns; game 48: 5 let the first
// settler go for 17,46, 15 tiles south, after two nearer sites failed, and it founded only at A21: one settlement for 21 turns).
const SETTLE_NEAR_TURNS = 4;
const NEAR_SETTLEMENTS = 3;
const STUCK_FOUND_RADIUS = 2;    // a stuck settler founds on a free tile this close when its own cannot be reached
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
const FRONT_GUARDS = 1;          // a war front (a settlement near a leader at war with us or a war risk) wants this many melee guards...
const FRONT_GUARDS_MAX = 3;      // ...one more for every FRONT_ARMY_SHARE of that leader's land soldiers near it, up to this many
const FRONT_ARMY_SHARE = 2;      // (game 48: Киото stood at 1 of 1 guards for 9 turns of Amina's war risk; at A54 her 5-7
                                 // Spearmen took its centre from 62 to 0 in three turns)

/** The melee guards a war front wants: FRONT_GUARDS, one more for every FRONT_ARMY_SHARE of the leader's soldiers near it. */
export const frontGuardsWanted = (f) => Math.min(FRONT_GUARDS_MAX, Math.max(FRONT_GUARDS, Math.ceil((Number(f?.army) || 0) / FRONT_ARMY_SHARE)));
const FRONT_POST_MAX = 4;        // in a war (not a risk alone) the free soldiers go to its fronts, up to this many a front
                                 // (research/42 B1; game 53: each front kept 1 guard while 15-26 soldiers stood free)

/**
 * The melee guards posted at a war front (planDefence; training and purchases keep frontGuardsWanted): in a war with that
 * leader also one for each of its soldiers we see near (up to FRONT_POST_MAX) and an equal share of the free melee soldiers
 * across the fronts of wars (`share`).
 */
export function frontGuardsPosted(f, share = 0) {
    const base = frontGuardsWanted(f);
    if (!f?.atWar) return base;
    return Math.max(base, Math.min(FRONT_POST_MAX, Math.max(Number(f.army) || 0, Number(share) || 0)));
}

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

// The unit an entry of the unit loop ordered, and where it stood: UI.log's `autopilot:` line names it (game 60's review joined
// the entries to net_message_debug.log by the second and the destination; HEAL, FORTIFY and REINFORCE have no tile). Kept
// beside the entries, which keep their shape. @returns { id, at: {x, y} } or null
const entryUnits = new WeakMap();
export const entryUnit = (e) => (e && typeof e === "object" ? entryUnits.get(e) ?? null : null);
const noteEntryUnit = (e, u, at = u?.location) => {
    if (e && typeof e === "object" && u && !entryUnits.has(e)) entryUnits.set(e, { id: u.id?.id ?? null, at: at ? { x: at.x, y: at.y } : null });
};

// Where each settler or merchant was sent (unit key -> goal), so it keeps its goal next turn.
const goals = new Map();
// A unit's errand: its goal, or while it walks out of the plague (goal { hazard }) the one it had, which comes back once the
// walk ends (endHazardWalk). What other units' steps read: a settler's site stays taken meanwhile (the review of game 60's
// package: another settler could take it, and its map tack went).
const errandOf = (g) => (g?.hazard !== undefined ? g.was ?? null : g ?? null);
const errands = () => [...goals.entries()].map(([k, g]) => [k, errandOf(g)]).filter(([, g]) => g);
const errandGoals = () => errands().map(([, g]) => g);
// Settlers: when each got its first goal and how often it changed (research/21 C3a: seen in game 6, settlers
// walked for 20+ turns between sites far away).
const SETTLER_PATIENCE = 12;   // turns walking...
const SETTLER_RETARGETS = 3;   // ...or new goals, before the nearest safe site will do
const settlerWalks = new Map(); // unit key -> { since, retargets, gaveUp }
const settlerWaits = new Map(); // unit key -> { count, lastTurn }: turns waiting in a threatened settlement
const settlerNoOrder = new Map(); // unit key -> the turn its "no order" reason was last logged
const settlerIdle = new Map();    // unit key -> { count, lastTurn }: turns in a row with no site (X2, X3)
const lastDamage = new Map();     // unit key -> its damage at the last pass (a rise = it was hit)
const lastHazard = new Map();     // unit key -> what its tile dealt at the last pass (the plague's own damage is no hit)
const hitSpots = [];              // [{ x, y, turn }]: where our units were hit lately (dangerNear)
const movesSent = new Map();      // unit key -> { turn, x, y }: where moveTo last sent it (the plague line skips units sent off)
const notTaken = new Map();       // unit key -> { turn, tiles: Set of "x,y" }: moves the game did not carry out that turn
const plagueRooms = new Map();    // unit key -> { x, y, turn }: a tile a soldier of ours freed for it this turn (plagueArrivals)
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
    squadronMoved.clear();
    rapid = null;
    raiderNoted = -1;
    settlerWalks.clear();
    settlerWaits.clear();
    settlerNoOrder.clear();
    settlerIdle.clear();
    settlerProgress.clear();
    lastDamage.clear();
    lastHazard.clear();
    hitSpots.length = 0;
    movesSent.clear();
    notTaken.clear();
    plagueRooms.clear();
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
    escapeNoted.clear();
    marches.clear();
    marchNoted = -1;
    raidHistory.clear();
    postArrived.clear();
    resetFieldOps();
    lastRoles = new Map();
    plagueNoted = -1;
    generalsNoted = -1;
    navalNoted.clear();
    airRaids.length = 0;
    rebased.clear();
    rebaseRefused.clear();
    airLogged = -1;
    missionRefused.clear();
    missionCities.clear();
    resetCampaign();
    resetSeenUnits();
    fleeNoted.clear();
    sightMemory.clear();
    settlerEscorts.clear();
    frontierHeading.clear();
    scoutNoted.clear();
    scoutsAsleep.clear();
    fightMemory.clear();
    xpSeen.clear();
    holdNoted = -1;
    skirmishNoneNoted = -1;
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
 * and their goal is dropped; a settler does not try that site again. That move is not sent again this turn (moveTo), so no
 * step orders it anew each round (game 65, A52: a hunt's Warrior was sent to 72,20 in every round, the game never moved it,
 * and the turn waited on it). A unit that acted without moving (an army unpacked) and still has moves is released too, its
 * goal kept (A51: the hunt's Legatus held the turn after its unpacking).
 * @param orderedAt Map unit key -> { x, y } where the order was given
 * @returns the released unit keys
 */
export function releaseStuckOrders(orderedAt) {
    const released = [];
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const k = unitKey(u.id);
        const at = orderedAt.get(k);
        if (!at || !same(u.location, at)) continue;
        if (!isIdle(u)) {
            if (readyForOrders(u)) released.push(k);
            continue;
        }
        const sent = movesSent.get(k);
        if (sent?.turn === Game.turn) {
            const nt = notTaken.get(k)?.turn === Game.turn ? notTaken.get(k) : { turn: Game.turn, tiles: new Set() };
            nt.tiles.add(`${sent.x},${sent.y}`);
            notTaken.set(k, nt);
            const p = safe(() => pathTo(u, sent), null);
            log.info(`units: order not taken: ${safe(() => GameInfo.Units.lookup(u.type).UnitType, u.type)} u${u.id?.id} at ${at.x},${at.y} -> ${sent.x},${sent.y} (${p ? `path ${p.turns} turn(s)` : "no path"}); left for the skip step this turn`);
        }
        const g = goals.get(k);
        // A way out of the plague: its errand comes back (that site did not fail).
        if (g?.hazard !== undefined) {
            endHazardWalk(k, g);
            released.push(k);
            continue;
        }
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

// Orders that keep a unit where it stands: none on a tile that hurts at the turn's start (game 60: Астрахань's Spearman and
// Slinger rested on infected tiles until they died; infected units do not heal there anyway).
const STAY_OPERATIONS = new Set(["UNITOPERATION_REST_UNTIL_HEALED", "UNITOPERATION_FORTIFY", "UNITOPERATION_SLEEP"]);

function operate(u, op, args = NO_TARGET) {
    if (STAY_OPERATIONS.has(op) && u?.location && hazardAt(u.location) > 0) return false;
    if (!safe(() => Game.UnitOperations.canStart(u.id, op, args, false), null)?.Success) return false;
    Game.UnitOperations.sendRequest(u.id, op, { ...args });
    return true;
}

/**
 * Moves a unit (MOVE_TO, as the map sends it). Never onto a tile that hurts at the turn's start (the plague, fallout, fire;
 * game 18), unless already there; nor a walk of several turns that ends a turn on one while it lasts (game 60: every
 * multi-turn walk was blind to the plague), unless `throughHazard` (a way out of the plague that weighed those stops itself):
 * such a walk goes around it a turn at a time (cleanStep), or not at all.
 */
function moveTo(u, loc, { throughHazard = false } = {}) {
    if (startsWar(u, loc)) return false;
    if (!same(u.location, loc) && hazardAt(loc) > 0) return false;
    let to = loc;
    if (!throughHazard && u.location && safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), 0) > 1) {
        const p = pathTo(u, loc);
        if (p && p.turns > 1 && wayHazard(u, p) > 0) {
            to = cleanStep(u, loc);
            if (!to) return false;
        }
    }
    const failed = notTaken.get(unitKey(u.id));
    if (failed?.turn === Game.turn && failed.tiles.has(`${to.x},${to.y}`)) return false;
    const op = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    if (!operate(u, op, { X: to.x, Y: to.y, Modifiers: globalThis.UnitOperationMoveModifiers?.MOVE_IGNORE_UNEXPLORED_DESTINATION ?? 0 })) return false;
    movesSent.set(unitKey(u.id), { turn: Game.turn, x: to.x, y: to.y });
    passMemo?.sent.set(`${to.x},${to.y}`, unitKey(u.id));
    return true;
}

const CLEAN_STEP_TRIES = 6; // ways asked of the game for a turn's step around the plague

/**
 * A walk whose way would end a turn on the plague goes around it a turn at a time (game 60, PLG-M2): this turn to the clean
 * tile it reaches nearest the target, nearer than it stands (one next to the plague counts a tile farther: it spreads there),
 * and the next pass walks on from there (the plague hurts only where a turn ends, not where a unit passes). That stop is one
 * no other rule judged (the caller judged the way it replaces): never next to a hostile land unit, and for any but a healthy
 * melee soldier not where a hostile soldier's next turn reaches (reachOf) nor in reach of a ship it does not out-gun (the
 * review of game 60's package: a guard's step around the plague ended next to a raider). @returns the tile or null (no such
 * tile: the walk waits)
 */
function cleanStep(u, target) {
    const here = u.location;
    const def = safe(() => GameInfo.Units.lookup(u.type), null);
    const left = (l) => safe(() => GameplayMap.getPlotDistance(l.x, l.y, target.x, target.y), Infinity);
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const now = left(here);
    const radius = reachRadius(u);
    // The hostile land units around, read once (a ship minds only those that reach the water); a healthy melee soldier minds
    // only those next to its stop.
    const hostiles = hostilesAround(here, radius + REACH_LOOK)
        .filter((h) => h.def && h.def.Domain === "DOMAIN_LAND" && (def?.Domain !== "DOMAIN_SEA" || reachesWater(h.def)));
    const st = safe(() => GameInfo.Unit_Stats.lookup(def?.UnitType), null);
    const sturdy = isSoldier(def) && !u.isCommanderUnit && !(Number(st?.RangedCombat) > 0) && !(Number(st?.Bombard) > 0)
        && (Number(u.Health?.damage) || 0) < ESCAPE_DAMAGE;
    const safeStop = (loc) => !hostiles.some((h) => dist(loc, h.at) <= (sturdy ? 1 : reachOf(h)))
        && (sturdy || def?.Domain !== "DOMAIN_LAND" || shipThreat(loc, def).length === 0);
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || !(left(loc) < now) || hazardAt(loc) > 0) continue;
        // Not a tile another unit was sent to in this pass (the game shows it there only later): the step replaces the
        // caller's tile, which the caller's own bookkeeping (ctx.stepTo, its `taken`) judged, not this one (the review of game
        // 60's packages: the vanguard's rally sent a Warrior to 9,8 and a Spearman's step around the plague went there too).
        const other = passMemo?.sent.get(`${loc.x},${loc.y}`);
        if (other !== undefined && other !== unitKey(u.id)) continue;
        if (!standsOn(def, loc) || !roomFor(def, loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || !safeStop(loc)) continue;
        tiles.push({ loc, d: left(loc), score: left(loc) + (hazardWithin(loc, 1) ? 1 : 0) });
    }
    tiles.sort((a, b) => a.score - b.score || a.d - b.d);
    for (const t of tiles.slice(0, CLEAN_STEP_TRIES)) {
        const turns = pathTurns(u, t.loc);
        if (turns === null || turns > 1 || startsWar(u, t.loc)) continue;
        return t.loc;
    }
    return null;
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
 * again). Each spot is danger for HIT_TURNS (dangerNear). The plague's own damage is no hit (game 60: its +25s marked the
 * tiles around Астрахань's infected units, and their ways out were refused): only a rise above what the tile dealt, where the
 * unit stood at the last pass (the effect may end on the turn its last damage is dealt) or stands now.
 */
function noteHits(units) {
    for (const u of units) {
        const k = unitKey(u.id);
        const d = Number(u.Health?.damage) || 0;
        const before = lastDamage.get(k);
        const hazard = u.location ? hazardAt(u.location) : 0;
        const plague = Math.max(lastHazard.get(k) ?? 0, hazard);
        if (before !== undefined && d - before > plague && u.location) hitSpots.push({ x: u.location.x, y: u.location.y, turn: Game.turn });
        lastDamage.set(k, d);
        lastHazard.set(k, hazard);
    }
    for (let i = hitSpots.length - 1; i >= 0; i--) if (Game.turn - hitSpots[i].turn >= HIT_TURNS) hitSpots.splice(i, 1);
}

/**
 * Hostile units near, or one of our units died or was hit near here lately. `from`: the tile a unit leaves; the
 * hit spots within `radius` of it do not count (a unit hit where it stands must be able to walk away).
 */
function dangerNear(loc, radius, ctx, from = null) {
    return hostileNear(loc, radius, ctx) || (!ctx?.bold && marksNear(loc, radius, from));
}

/**
 * What makes a tile danger, for the log: the owners of the hostile units within `radius` ("p7", "independent 13") or "marks"
 * (ours hit or lost here lately). @returns an array (empty: none)
 */
function dangerWhy(loc, radius, ctx) {
    const owners = new Set();
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        for (const { unit } of at ? unitsSeenAt(at.x, at.y) : []) {
            if (!unit || !(hostileOwner(unit) || riskArmy(unit, ctx) || ((ctx?.riskCalm || ctx?.civilian) && hostileCommander(unit)))) continue;
            if (ctx?.riskCalm && !countsForSettler(unit, at, loc, ctx)) continue;
            const p = safe(() => Players.get(unit.owner), null);
            owners.add(p?.isIndependent ? `independent ${unit.owner}` : `p${unit.owner}`);
        }
    }
    if (owners.size === 0 && !ctx?.bold && marksNear(loc, radius)) owners.add("marks");
    return [...owners];
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

const STEP_AWAY_MAX = 4; // a step away looks at most this far (the unit's moves left: the tiles it reaches this turn)

/** Hostile villages (at war with us, seen) within `radius` of this tile: [{ x, y, id }] (ctx.hostileVillages, once a pass). */
function hostileVillagesNear(loc, radius, ctx) {
    ctx.hostileVillages ??= (safe(() => villagesOf(pid()), []) ?? []).filter((v) => !v.friendly && atWarWithIndependent(v.id));
    return ctx.hostileVillages.filter((v) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, v.x, v.y), Infinity) <= radius);
}

// ---- what a unit flees from (game 60, SC-5) ---------------------------------------------------

const FLEE_LOOK = 4;            // hostile units this close are named in a flight's UI.log line
const fleeNoted = new Map();    // unit key -> the turn its flight was written to UI.log

/**
 * UI.log, once a turn per unit: what a unit stepping away, withdrawing, waiting or going around flees from (game 60: 156
 * flights in Antiquity and no line named the trigger; the player saw units step away with only an enemy scout or a merchant
 * in sight, while the trigger was a soldier 2-3 tiles off, a ship, or a soldier in the fog). Each hostile unit within FLEE_LOOK
 * with its type, owner, distance, land or ship, seen now or remembered (unitsSeenAt); the ships whose next turn reaches the
 * tile; our hit and loss marks. @returns the entry
 */
function fled(u, def, entry, ctx) {
    if (!entry || !u?.location) return entry;
    const k = unitKey(u.id);
    if (fleeNoted.get(k) === Game.turn) return entry;
    fleeNoted.set(k, Game.turn);
    safe(() => {
        const here = u.location;
        const dist = (a) => safe(() => GameplayMap.getPlotDistance(here.x, here.y, a.x, a.y), "?");
        const owner = (id) => (safe(() => Players.get(id)?.isIndependent, false) ? `independent ${id}` : `p${id}`);
        const parts = [];
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, FLEE_LOOK), []) ?? []) {
            const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            for (const e of at ? unitsSeenAt(at.x, at.y) : []) {
                if (!(hostileOwner(e.unit) || riskArmy(e.unit, ctx))) continue;
                const d = safe(() => GameInfo.Units.lookup(e.unit.type), null);
                const kind = d?.Domain === "DOMAIN_SEA" ? "ship" : d?.Domain === "DOMAIN_AIR" ? "air" : "land";
                parts.push({ d: dist(at), text: `${d?.UnitType ?? "?"} of ${owner(e.unit.owner)}${hostileOwner(e.unit) ? "" : " (a war risk)"} at ${dist(at)} (${kind}, ${e.seen ? "seen" : `seen T${e.turn}`})` });
            }
        }
        parts.sort((a, b) => a.d - b.d);
        const ships = def?.Domain === "DOMAIN_LAND" ? shipsReaching(here).length : 0;
        const marks = !ctx?.bold && marksNear(here, DANGER_RADIUS) ? "; our hit or loss marks near" : "";
        log.info(`flee: ${def?.UnitType ?? "?"} at ${here.x},${here.y} ${entry.key} ${JSON.stringify((entry.args ?? []).slice(1))} from [${parts.map((p) => p.text).join("; ") || "no hostile unit in sight"}]${ships > 0 ? `; ${ships} ship(s) reach it` : ""}${marks}`);
    }, null);
    return entry;
}

/**
 * A unit with hostile units near it steps to a tile it reaches this turn (its moves left, the game's path), the best by
 * awayOrder: not next to a hostile land unit, the fewest hostile units reaching it next turn (ships too: research/41 §3), the
 * widest gap to them, next to a healthy soldier of ours; only one better than where it stands. A hurt unit counts a hostile
 * village within VILLAGE_REST_KEEP like a hostile unit in its gap (game 60: a hurt scout stepped to 2 tiles from tribe 14's
 * village and was killed there). Game 60 T96: a scout with 3 moves looked only 2 tiles out and took a tile two Warriors
 * reached, while one out of every reach lay a step further. Scouts, settlers with no safe way home, hurt soldiers.
 * @returns a log entry or null
 */
function stepAway(u, def, ctx, key = "UNIT_AWAY", { ownLand = false } = {}) {
    const here = u.location;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const mine = (loc) => safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid();
    const moves = Math.floor(Number(u.Movement?.movementMovesRemaining ?? 2));
    const radius = Math.max(1, Math.min(STEP_AWAY_MAX, Number.isFinite(moves) ? moves : 2));
    const land = def?.Domain === "DOMAIN_LAND";
    // The hostile units around, read once; each one's reach next turn as hostilesInReach counts it.
    const near = hostilesAround(here, REACH_LOOK + radius).filter((h) => h.def && h.def.Domain !== "DOMAIN_AIR");
    const villages = Number(u.Health?.damage) > 0 ? hostileVillagesNear(here, VILLAGE_REST_KEEP + radius, ctx) : [];
    const gap = (loc) => {
        for (let r = 0; r <= DANGER_RADIUS + 1; r++) {
            if (hostileNear(loc, r, ctx) || (r <= VILLAGE_REST_KEEP && villages.some((v) => dist(loc, v) <= r))) return r;
        }
        return DANGER_RADIUS + 2;
    };
    const ours = ctx.ourUnits ?? safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const guards = ours.filter((s) => !sameId(s.id, u.id) && !s.isCommanderUnit && s.isOnMap !== false && !!s.location && (Number(s.Health?.damage) || 0) < ESCAPE_DAMAGE)
        .filter((s) => {
            const sd = safe(() => GameInfo.Units.lookup(s.type), null);
            return isSoldier(sd) && sd.Domain === "DOMAIN_LAND";
        });
    const beside = (loc) => guards.some((s) => dist(s.location, loc) <= 1);
    const rank = (loc) => ({
        adjacent: near.some((h) => h.def.Domain === "DOMAIN_LAND" && dist(loc, h.at) <= 1),
        reach: near.filter((h) => h.def.Domain === "DOMAIN_LAND" && dist(loc, h.at) <= reachOf(h)).length + (land ? shipsReaching(loc).length : 0),
        gap: gap(loc),
        beside: beside(loc),
    });
    const now = rank(here);
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`) || hazardAt(loc) > 0) continue;
        if (!standsOn(def, loc) || !roomFor(def, loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
        // A settler on our land never steps off it (research/22 B8: seen in game 7, one stepped out of our
        // borders and was killed); one already outside may step anywhere away from them.
        if (ownLand && mine(here) && !mine(loc)) continue;
        const r = rank(loc);
        if (awayOrder(r, now) < 0) tiles.push({ loc, r, d: dist(here, loc) });
    }
    tiles.sort((a, b) => awayOrder(a.r, b.r) || a.d - b.d);
    for (const t of tiles) {
        const turns = pathTurns(u, t.loc);
        if (turns === null || turns > 1 || startsWar(u, t.loc) || !moveTo(u, t.loc)) continue;
        ctx.stepTo.add(`${t.loc.x},${t.loc.y}`);
        return fled(u, def, { key, args: [nameOf(def), t.loc.x, t.loc.y] }, ctx);
    }
    return null;
}

/**
 * A scout in danger steps away (stepAway: game 50, a scout hit for 70 by a Frigate and two Line Infantry found no tile farther
 * from them and stood there the next turn; it died. The fewest raiders' reach now comes before the gap). @returns a log entry or null
 */
function scoutAway(u, def, ctx) {
    return stepAway(u, def, ctx);
}

/**
 * A hurt unit about to rest away from our centres within VILLAGE_REST_KEEP of a hostile village steps away from it first
 * (game 60: a hurt scout rested and cycled on the coast 3 tiles from tribe 14's village T73-T95 and died there).
 * @returns a log entry, or null (it may rest where it stands)
 */
function restAwayFromVillages(u, def, ctx, key) {
    if (!(Number(u.Health?.damage) > 0) || !u.location || nearOwnCentre(u.location, ctx)) return null;
    if (hostileVillagesNear(u.location, VILLAGE_REST_KEEP, ctx).length === 0) return null;
    return stepAway(u, def, ctx, key);
}

/** The way there: { turns (0 = here), plots }, or null when unreachable (or only across rough seas). */
function pathTo(u, loc) {
    if (same(u.location, loc)) return { turns: 0, plots: [] };
    const key = passMemo ? `${unitKey(u.id)}|${u.location?.x},${u.location?.y}|${loc.x},${loc.y}` : null;
    if (key && passMemo.paths.has(key)) return passMemo.paths.get(key);
    const p = pathNow(u, loc);
    if (key) passMemo.paths.set(key, p);
    return p;
}

function pathNow(u, loc) {
    const r = safe(() => Units.getPathTo(u.id, { x: loc.x, y: loc.y }), null);
    if (!r?.plots?.length) return null;
    if (crossesRoughSeas(u, r.plots)) return null;
    const t = Number(r.turns?.[r.turns.length - 1]);
    return { turns: Number.isFinite(t) ? t : r.plots.length, plots: r.plots, steps: r.turns ?? [] };
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
            goals.set(unitKey(u.id), { discovery: `${loc.x},${loc.y}`, via: { x: via.x, y: via.y } });
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
        return restAwayFromVillages(u, def, ctx, "UNIT_AWAY") ?? (operate(u, "UNITOPERATION_REST_UNTIL_HEALED") ? { key: "HEAL", args: [nameOf(def)] } : null);
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
const VILLAGE_SIGHT = 2;         // a tile this far from a village reveals it (unless the land between blocks sight)

const sightMemory = createSightMemory(); // villages' sight tiles found blind or fled from, villages given up (game 60, SC-1)
const frontierHeading = new Map();       // unit key -> { dx, dy }: the way to its last frontier target (SC-3)
const scoutNoted = new Map();            // what a `scout:` line said -> the turn it said it
const scoutsAsleep = new Map();          // unit key -> the turn we put that scout to sleep (rough seas, nothing to explore: SC-4)

/** A `scout:` line in UI.log, once a turn for each `what`. */
function scoutLine(what, text) {
    if (scoutNoted.get(what) === Game.turn) return;
    scoutNoted.set(what, Game.turn);
    log.info(`scout: ${text}`);
}

/** The villages we have not seen (villagesOf, hidden ones too), once a pass. */
const unseenVillages = (ctx) => (ctx.unseenVillages ??= (safe(() => villagesOf(pid(), true), []) ?? []).filter((v) => !v.revealed));

/**
 * A unit standing on the sight tile its village goal (or its approach: `sight`) chose while that village stays unseen: the
 * tile is blind and its goal ends, so the next pick takes another tile (game 60: the scout stood on 70,11 nine times and
 * Шэнле stayed unseen until our Warrior came from the south-east at T82; the Civilopedia: vegetation and mountains block
 * sight).
 */
function noteBlindSight(units, ctx) {
    for (const u of units) {
        const k = unitKey(u.id);
        const g = goals.get(k);
        const village = g?.village ?? g?.sight;
        if (!village || !g.at || !u.location || `${u.location.x},${u.location.y}` !== g.at) continue;
        const v = unseenVillages(ctx).find((x) => `${x.x},${x.y}` === village);
        if (!v) continue;
        sightMemory.fail(village, g.at, Game.turn, true);
        goals.delete(k);
        scoutLine(`${village}|${g.at}`, `${independentNameOf(v.id) ?? village} unseen from ${g.at} (blind tiles ${sightMemory.blindCount(village)})`);
    }
}

/**
 * A scout in danger steps away (scoutAway); one walking to a village's sight tile gives that tile up for
 * SCOUT.VILLAGE_RETRY_TURNS (game 60: it walked back to 70,11 the next turn, 17 times). @returns a log entry or null
 */
function scoutFlees(u, def, ctx) {
    const away = scoutAway(u, def, ctx);
    const k = unitKey(u.id);
    const g = goals.get(k);
    if (away && g?.village && g.at) {
        sightMemory.fail(g.village, g.at, Game.turn, false);
        goals.delete(k);
    }
    return away;
}

/**
 * An unseen village near our settlements: a scout goes to a tile in sight of it (VILLAGE_SIGHT), the nearest to our
 * settlements first, one scout each (goal `{village}`). Its independent is then met: befriending becomes possible
 * (game 10: «villages 0 seen, 16 unseen» all Antiquity; the game offered no befriending of the two independents that
 * raided us until turns 56 and 69, and they took two of our three settlements). @returns a log entry or null
 */
function scoutVillage(u, def, ctx) {
    if (unseenVillages(ctx).length === 0) return null;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const near = (v) => Math.min(Infinity, ...ours.map((o) => safe(() => GameplayMap.getPlotDistance(o.x, o.y, v.x, v.y), Infinity)));
    const taken = new Set(errands().filter(([k, g]) => g.village && k !== unitKey(u.id)).map(([, g]) => g.village));
    const list = unseenVillages(ctx).map((v) => ({ v, d: near(v) }))
        .filter(({ v, d }) => d <= VILLAGE_SCOUT_RADIUS && !taken.has(`${v.x},${v.y}`) && !sightMemory.givenUp(`${v.x},${v.y}`, Game.turn)).sort((a, b) => a.d - b.d);
    for (const { v } of list) {
        const vk = `${v.x},${v.y}`;
        let best = null;
        // Why its tiles are left: a village whose every sight tile failed or is in danger is given up for a while.
        const why = { FAILED: 0, DANGER: 0, FAR: 0 };
        let tiles = 0;
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(v.x, v.y, VILLAGE_SIGHT), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || same(loc, v) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
            if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
            tiles++;
            // One danger radius for the tile, its way and the step away (game 60, E4: a tile 2 from the guard was taken, and
            // the scout fled from it the next turn at SCOUT_DANGER).
            if (sightMemory.failed(vk, `${loc.x},${loc.y}`, Game.turn)) { why.FAILED++; continue; }
            if (dangerNear(loc, SCOUT_DANGER, ctx)) { why.DANGER++; continue; }
            const p = pathTo(u, loc);
            if (!p || p.turns > VILLAGE_SCOUT_TURNS || !wayIsSafe(u, p, SCOUT_DANGER, ctx) || startsWar(u, loc)) { why.FAR++; continue; }
            if (!best || p.turns < best.turns) best = { loc, turns: p.turns };
        }
        if (!best && tiles > 0 && why.FAILED + why.DANGER === tiles) {
            sightMemory.giveUp(vk, Game.turn);
            scoutLine(`${vk}|skip`, `${independentNameOf(v.id) ?? vk} skipped for ${SCOUT.VILLAGE_RETRY_TURNS} turns: of its ${tiles} sight tile(s) ${why.FAILED} blind or fled from, ${why.DANGER} within ${SCOUT_DANGER} of hostile units`);
            continue;
        }
        if (!best || !moveTo(u, best.loc)) continue;
        ctx.stepTo.add(`${best.loc.x},${best.loc.y}`);
        goals.set(unitKey(u.id), { village: vk, at: `${best.loc.x},${best.loc.y}`, since: Game.turn });
        return { key: "SCOUT_VILLAGE", args: [nameOf(def), independentNameOf(v.id), best.loc.x, best.loc.y] };
    }
    return null;
}

function explore(u, def, ctx) {
    if (!hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) return null;
    // Hostile units near, or a ship's reach (research/41 §3: ships killed 18 of our scouts in games 30-47): away first.
    if (hostileNear(u.location, SCOUT_DANGER, ctx) || shipsReaching(u.location).length > 0) {
        const away = scoutFlees(u, def, ctx);
        if (away) return away;
    }
    const heal = scoutHeals(u, def, ctx);
    if (heal) return heal;
    // Villages near us first: met, they can be befriended before they raid us.
    const village = scoutVillage(u, def, ctx);
    if (village) return village;
    const found = toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
    if (found) return found;
    if (autoExploreIsSafe(u, ctx) && operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) {
        // The game explores with it now: no goal of ours keeps it from a discovery or a village (game 60, SC-2).
        goals.delete(unitKey(u.id));
        return { key: "EXPLORE", args: [nameOf(def)] };
    }
    // Danger around, or the game's automatic exploring is not offered (seen in game when its reach is explored):
    // walk to the edge of the fog ourselves, further than military units do, widely around danger.
    const frontier = toFrontier(u, def, ctx, SCOUT_RADIUS, SCOUT_MAX_TURNS, { keep: SCOUT_WIDE_KEEP });
    if (frontier) return frontier;
    // Rough seas (Exploration before Shipbuilding) keep the game's exploring off, for land scouts too: ours looks farther on
    // its own landmass (game 60: both scouts idle every pass from E31 once the land near them was explored; SC-4).
    const seas = roughSeas() && def.Domain === "DOMAIN_LAND";
    if (seas) {
        const far = toFrontier(u, def, ctx, SCOUT.FAR_RADIUS, SCOUT.FAR_TURNS, { keep: SCOUT_WIDE_KEEP, sameArea: true });
        if (far) return far;
    }
    // Nothing safe to explore and a little hurt: it heals meanwhile instead of standing idle, not near a hostile village.
    if (Number(u.Health?.damage) > 0 && !hostileNear(u.location, SCOUT_DANGER, ctx)) {
        const off = restAwayFromVillages(u, def, ctx, "UNIT_AWAY");
        if (off) return off;
        if (operate(u, "UNITOPERATION_REST_UNTIL_HEALED")) return { key: "HEAL", args: [nameOf(def)] };
    }
    // Rough seas and nothing left on its land: it sleeps (woken when the seas calm or after SCOUT.SLEEP_TURNS) instead of
    // being looked at and skipped every pass.
    if (seas && !hostileNear(u.location, SCOUT_DANGER, ctx) && shipsReaching(u.location).length === 0 && operate(u, "UNITOPERATION_SLEEP")) {
        scoutsAsleep.set(unitKey(u.id), Game.turn);
        restedByUs.add(unitKey(u.id)); // the save keeps it: after a reload it is woken once and looks again
        goals.delete(unitKey(u.id));
        return { key: "SCOUT_SLEEPS", args: [nameOf(def)] };
    }
    return null;
}

/**
 * Does a walking scout's goal still hold (game 60, SC-2: a scout walking to a village was sent to a discovery the next pass and
 * back to the village the pass after, T1-T12, 48 re-orders of walking scouts in Antiquity)? Its village unseen and not given up,
 * its tile not failed, out of danger and the way there safe; its discovery still there and out of danger; its frontier still
 * one; and the game's queued destination (when it says) its goal's tile or waypoint. @returns the goal's tile, or null
 */
function scoutGoalHolds(u, g, ctx) {
    const tile = (t) => {
        const [x, y] = String(t ?? "").split(",").map(Number);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    };
    const target = tile(g?.at ?? g?.discovery ?? g?.frontier);
    if (!target || same(u.location, target)) return null;
    const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
    if (dest && dest.x >= 0 && !same(dest, target) && !(g.via && same(dest, g.via))) return null;
    if (g.village) {
        if (!unseenVillages(ctx).some((v) => `${v.x},${v.y}` === g.village) || sightMemory.givenUp(g.village, Game.turn)) return null;
        if (sightMemory.failed(g.village, g.at, Game.turn) || dangerNear(target, SCOUT_DANGER, ctx)) return null;
        const p = pathTo(u, target);
        return p && wayIsSafe(u, p, SCOUT_DANGER, ctx) ? target : null;
    }
    if (g.discovery) return hasDiscovery(target) && !givenUp(g.discovery) && !dangerNear(target, SCOUT_DANGER, ctx) ? target : null;
    if (g.frontier) return isFrontier(target, true) && !dangerNear(target, SCOUT_DANGER, ctx) ? target : null;
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
    for (const g of errandGoals()) {
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
 * Is a hostile military unit (hostileOwner, or a war risk's: riskArmy) we see within `radius` of this tile (unitsSeenAt: seen
 * now, or last seen there lately)? Plots are looked at once per pass (ctx.hostileAt memo). A settler (ctx.riskCalm) minds a
 * hostile ship only where its next turn reaches the tile (countsForSettler).
 */
function hostileNear(loc, radius, ctx) {
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        if (!ctx.hostileAt.has(idx)) {
            // 1: a hostile land or air unit (or a Hostile war risk's soldier) stands there; 2: only a soldier of a war risk
            // that is not Hostile; 0: none; +4: a hostile commander (danger for settlers and scouts only: ctx.riskCalm,
            // ctx.civilian). With hostile ships there: { code, ships, at }.
            const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            let code = 0;
            const ships = [];
            for (const { unit } of at ? unitsSeenAt(at.x, at.y) : []) {
                if (hostileOwner(unit) && safe(() => GameInfo.Units.lookup(unit.type)?.Domain, null) === "DOMAIN_SEA") {
                    ships.push(unit);
                    continue;
                }
                if (hostileOwner(unit) || (riskArmy(unit, ctx) && ctx.riskHostile?.has(unit.owner))) {
                    code = (code & 4) | 1;
                    continue;
                }
                if (riskArmy(unit, ctx) && !(code & 1)) code |= 2;
                if (hostileCommander(unit)) code |= 4;
            }
            if (code & 1) code &= ~2;
            ctx.hostileAt.set(idx, ships.length > 0 ? { code, ships, at } : code);
        }
        const memo = ctx.hostileAt.get(idx);
        const code = memo !== null && typeof memo === "object" ? memo.code : memo;
        if (code === true || (code & 1)) return true;
        // A hostile commander (M2): its army may unpack next to a settler or a scout.
        if ((code & 4) && (ctx.riskCalm || ctx.civilian)) return true;
        // Settlers (ctx.riskCalm) mind a war risk's soldiers only next to them (research/24 X4: Napoleon's espionage
        // made him a risk A22-A70 and his soldiers kept every site «unsafe»).
        if ((code & 2) && !(ctx.riskCalm && safe(() => { const at = GameplayMap.getLocationFromIndex(idx); return GameplayMap.getPlotDistance(loc.x, loc.y, at.x, at.y); }, 0) > 1)) return true;
        if (memo?.ships?.some((s) => !ctx.riskCalm || countsForSettler(s, memo.at, loc, ctx))) return true;
    }
    return false;
}

/**
 * Does this hostile unit at `at` endanger a settler on `loc` (game 60, SC-7: settlers waited in a garrisoned St Petersburg
 * for a Quadrireme parked 2 tiles off on the water)? A land or air unit does; a ship only when it is a warship whose next turn
 * reaches `loc` (core inShipReach, research/41 §3), and never while the settler stands on our held centre (ctx.ignoreShips).
 */
function countsForSettler(unit, at, loc, ctx) {
    const def = safe(() => GameInfo.Units.lookup(unit.type), null);
    if (def?.Domain !== "DOMAIN_SEA") return true;
    if (ctx?.ignoreShips) return false;
    const role = shipRole(def);
    if (role !== "SCREEN" && role !== "RANGED") return false;
    const ship = shipRecord(unit, def, at);
    return inShipReach(loc, ship, (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity), shoreOf(ship));
}

/**
 * Runs `fn` with a settler's view of danger (ctx.riskCalm: hostileNear). With a military countdown to block or to start
 * (ctx.anywhere, the strategy's settleAnywhere) the settler is bold (ctx.bold): only live hostile units are danger, not the
 * tiles where ours were hit or lost lately (dangerNear), and it walks up to BOLD_MAX_TURNS. Game 42: two settlers stood ~25
 * turns with 4-5 of 7-8 sites «DANGER» while Tubman's military countdown, which one or two settlements would have broken, ran.
 */
function asSettler(ctx, fn) {
    const before = ctx.riskCalm;
    const bold = ctx.bold;
    ctx.riskCalm = true;
    ctx.bold = !!ctx.anywhere;
    try {
        return fn();
    } finally {
        ctx.riskCalm = before;
        ctx.bold = bold;
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
const ANYWHERE_IDLE_TURNS = 1; // game 42: at 3 the detours kept resetting the count, and it came at M53
// Game 48: a settler stood at the capital M39-M49 under our countdown: every tile within 8 was owned, and the free land lay
// 15-20 tiles away (founded there at M40-M46 by others). It looks as far as a bold walk reaches.
const ANYWHERE_RADIUS = 20;
const ANYWHERE_PATHS = 30; // ways looked at, the nearest tiles first
const ANYWHERE_VILLAGE = 3;

/** Is a village within ANYWHERE_VILLAGE of this tile? */
function villageDoorstep(loc, ctx) {
    ctx.villages ??= safe(() => villagesOf(pid()), []) ?? [];
    return ctx.villages.some((v) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, v.x, v.y), Infinity) <= ANYWHERE_VILLAGE);
}

/**
 * The nearest tile this settler reaches safely where the game accepts a settlement, or null; tiles on its own land
 * (GameplayMap.getAreaId) first, so the ANYWHERE_PATHS ways are not spent on another landmass. With none, `ctx.anywhereWhy`
 * counts why each tile within ANYWHERE_RADIUS was left (the settler's «no order» line; game 57: a settler stood about 20 turns
 * at 64-68,19-22 under a military countdown, its 4 sites taken or out of reach, and found a tile only at M56).
 */
function anySite(u, taken, ctx) {
    const here = u.location;
    const why = {};
    const note = (r) => (why[r] = (why[r] ?? 0) + 1);
    const area = (loc) => safe(() => GameplayMap.getAreaId(loc.x, loc.y), null);
    const home = area(here);
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, ANYWHERE_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc) continue;
        if (taken.has(`${loc.x},${loc.y}`)) { note("TAKEN"); continue; }
        if (onWater(loc)) { note("WATER"); continue; }
        if (safe(() => GameplayMap.getRevealedState(pid(), loc.x, loc.y), RevealedStates.HIDDEN) === RevealedStates.HIDDEN) { note("HIDDEN"); continue; }
        // Another player's land is no claim (cheap to ask first; the game's own word decides in siteStillFree).
        const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
        if (owner !== -1 && owner !== null && owner !== pid()) { note("FOREIGN"); continue; }
        const away = home !== null && area(loc) !== home ? 1 : 0;
        tiles.push({ x: loc.x, y: loc.y, away, d: safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), Infinity) });
    }
    tiles.sort((a, b) => a.away - b.away || a.d - b.d);
    let paths = 0;
    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const loc = { x: t.x, y: t.y, any: true };
        const r = !siteStillFree(loc) ? "CLAIM" : hazardAt(loc) > 0 ? "HAZARD" : dangerNear(loc, DANGER_RADIUS, ctx) ? "DANGER"
            : villageDoorstep(loc, ctx) ? "VILLAGE" : startsWar(u, loc) ? "WAR" : null;
        if (r) { note(r); continue; }
        if (same(here, loc)) return { ...loc, turns: 0, source: "ANY", role: null };
        if (++paths > ANYWHERE_PATHS) {
            why.UNTRIED = tiles.length - i;
            break;
        }
        const p = pathTo(u, loc);
        const v = !p ? "NO_PATH" : p.turns > maxWalk(ctx) ? "FAR" : !wayIsSafe(u, p, PATH_DANGER, ctx) ? "UNSAFE_WAY" : null;
        if (v) { note(t.away ? `${v}_AWAY` : v); continue; }
        return { ...loc, turns: p.turns, source: "ANY", role: null };
    }
    ctx.anywhereWhy = { tiles: tiles.length, why };
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
 * hostile units), HAZARD (the plague or another damaging plot effect on it: game 18), FRONT (on a war front with no guard to
 * spare: onWarFront). pickSite and the "no order" log share it (research/24 X1: «2 sites known, 0 unsafe, 0 seas, 0 too far»
 * while both were out of reach).
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
    if (onWarFront(loc, ctx)) return { reason: "FRONT" };
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

const FRONT_SITE_DISTANCE = 6; // a site this close to a settlement of a major at war with us, or a war risk, is on a front...
const FRONT_SITE_GUARDS = 2;   // ...and waits until this many free melee soldiers could guard it

/**
 * A site on a war front with no guard to spare (research/42 F; game 53: Китион was founded at M42 on Tecumseh's front with
 * one guard and fell at M74): within FRONT_SITE_DISTANCE of a settlement we see of a major at war with us or a war risk
 * (ctx.riskOwners), while fewer than FRONT_SITE_GUARDS melee soldiers stand free (the defence's supply, not posted). A
 * settler blocking a rival's countdown (ctx.bold) goes anyway.
 */
function onWarFront(loc, ctx) {
    if (ctx.bold) return false;
    ctx.frontCities ??= (() => {
        const me = safe(() => Players.get(pid()), null);
        const HIDDEN = globalThis.RevealedStates?.HIDDEN ?? 0;
        const out = [];
        for (const p of safe(() => Players.getAlive(), []) ?? []) {
            if (!p?.isMajor || p.id === pid()) continue;
            if (!ctx.riskOwners?.has(p.id) && !safe(() => me.Diplomacy.isAtWarWith(p.id), false)) continue;
            for (const c of safe(() => p.Cities.getCities(), []) ?? []) {
                if (c?.location && safe(() => GameplayMap.getRevealedState(pid(), c.location.x, c.location.y), HIDDEN + 1) !== HIDDEN) out.push(c.location);
            }
        }
        return out;
    })();
    if (!ctx.frontCities.some((c) => safe(() => GameplayMap.getPlotDistance(c.x, c.y, loc.x, loc.y), Infinity) <= FRONT_SITE_DISTANCE)) return false;
    const free = (ctx.supply ?? []).filter((c) => !ctx.posts?.has(c.k) && !c.ranged && !c.packed && c.stage).length;
    return free < FRONT_SITE_GUARDS;
}

/** The farthest walk a settler takes when it waited or walked too long: SETTLE_MAX_TURNS, BOLD_MAX_TURNS when bold. */
const maxWalk = (ctx) => (ctx?.bold ? BOLD_MAX_TURNS : SETTLE_MAX_TURNS);

/** The farthest walk to a site: BOLD_MAX_TURNS when bold, else SETTLE_NEAR_TURNS below NEAR_SETTLEMENTS settlements, else SETTLE_MAX_TURNS. */
function siteLimit(ctx = null) {
    if (ctx?.bold) return BOLD_MAX_TURNS;
    const n = Number(safe(() => Players.get(pid()).Stats.numSettlements, 0)) || 0;
    return n < NEAR_SETTLEMENTS ? SETTLE_NEAR_TURNS : maxWalk(ctx);
}

/** The best free site this settler reaches in time by a safe way (every step further than
 * `wayDanger` from hostile units): our ranked sites (the role we need first, see neededRole),
 * else the game's. The nearest (a settler that waited or walked too long) looks up to SETTLE_MAX_TURNS away. */
function pickSite(u, taken, ctx, wayDanger = PATH_DANGER, { nearest = false, maxTurns = null } = {}) {
    // Few settlements: only near sites (research/22 A1); a long walk is a lost settler or a lost decade. The nearest
    // site any distance up to SETTLE_MAX_TURNS (research/24 X2: below 3 settlements the give-up never found one).
    const limit = maxTurns ?? (nearest ? maxWalk(ctx) : siteLimit(ctx));
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
    // The role we need first; within it the best value per turn of walking (not the best site 10 turns away). Below
    // NEAR_SETTLEMENTS a turn of walking weighs twice as much (game 48: a settlement founded early beats a better one later).
    const early = (Number(safe(() => Players.get(pid()).Stats.numSettlements, 0)) || 0) < NEAR_SETTLEMENTS;
    const turnWeight = early ? SETTLE_TURN_WEIGHT / 2 : SETTLE_TURN_WEIGHT;
    const worth = (p, t) => (Number(p.value ?? p.score) || 1 / (Number(p.rank) || 1)) / (1 + t / turnWeight);
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
 * pickSite's default answer for this settler, once a pass while `taken` and ctx.stepTo (findDetour's) stay as they were: the
 * settler escorts ask it first (escortSettler) and settle() again (both doubled the settlers' site search).
 */
function defaultSite(u, taken, ctx) {
    const key = `${[...taken].sort().join(";")}|${ctx.stepTo?.size ?? 0}`;
    const memo = (ctx.defaultSites ??= new Map()).get(unitKey(u.id));
    if (memo && memo.key === key) return memo.site;
    const site = pickSite(u, taken, ctx);
    ctx.defaultSites.set(unitKey(u.id), { key, site });
    return site;
}

/**
 * A settler got no order: why, once a turn in UI.log (research/22 A1: game 7 had a settler idle for 28
 * turns with no word). When some site would be reachable but for rough seas, the research step goes to
 * Shipbuilding first (seasBlocked).
 */
function noteNoSite(u, ctx, taken = new Set(), limit = siteLimit(ctx)) {
    const k = unitKey(u.id);
    // What «settle anywhere» found (anySite), this settler's only.
    const anywhere = ctx.anywhereWhy;
    delete ctx.anywhereWhy;
    if (settlerNoOrder.get(k) === Game.turn) return;
    settlerNoOrder.set(k, Game.turn);
    const idle = settlerIdle.get(k);
    settlerIdle.set(k, { count: idle && idle.lastTurn === Game.turn - 1 ? idle.count + 1 : 1, lastTurn: Game.turn });
    const picks = state.get().results.sites?.picks ?? [];
    const why = {};
    const danger = {}; // what makes the DANGER sites so (game 42 said only «DANGER»: 5)
    for (const p of picks) {
        // A relaxed pick by the relaxed rules, as pickSite judges it (research/31 §3: game 25 reported them FOREIGN).
        const v = siteVerdict(u, { x: p.x, y: p.y, relaxed: !!p.relaxed }, taken, ctx, PATH_DANGER, limit);
        const r = v.reason ?? "OK";
        why[r] = (why[r] ?? 0) + 1;
        if (r === "DANGER") for (const w of dangerWhy(p, DANGER_RADIUS, ctx)) danger[w] = (danger[w] ?? 0) + 1;
    }
    if (why.SEAS > 0) seasBlockedTurn = Game.turn;
    log.warn(`settler: no order at ${u.location.x},${u.location.y} (${settlerIdle.get(k).count} turns): ${picks.length} sites known, limit ${limit}t ${JSON.stringify(why)}${why.DANGER ? `; danger ${JSON.stringify(danger)}` : ""}${ctx.bold ? "; bold (a military countdown)" : ""}${anywhere ? `; anywhere: none of ${anywhere.tiles} tile(s) ${JSON.stringify(anywhere.why)}` : ""}`);
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
    // A free tile next to where it stands, reached this turn, before another site farther away (game 48: stuck at 12,31 on
    // its way to 9,31 at A10, it was sent to 19,31, then 17,46, and founded at A21).
    const near = foundNearby(u, taken, ctx);
    if (near && (!cap || cap.n < cap.cap) && moveTo(u, near)) {
        taken.add(`${near.x},${near.y}`);
        goals.set(k, near);
        settlerProgress.set(k, { turn: Game.turn, turns: near.turns, goal: `${near.x},${near.y}`, stuck: 0 });
        return { key: "SETTLE_MOVE", args: [nameOf(def), near.x, near.y, near.turns] };
    }
    return settle(u, def, taken, ctx);
}

/**
 * A tile within STUCK_FOUND_RADIUS of a stuck settler where a settlement may stand (the game's claim, our rules on foreign
 * settlements and villages, no danger, no hazard), reached this turn by a safe way, the nearest first: a settlement now beats
 * a better site found later. @returns { x, y, turns, source: "NEAR", role: null } or null
 */
function foundNearby(u, taken, ctx) {
    const here = u.location;
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, STUCK_FOUND_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || onWater(loc)) continue;
        tiles.push({ x: loc.x, y: loc.y, d: safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), 9) });
    }
    tiles.sort((a, b) => a.d - b.d);
    for (const t of tiles) {
        const v = siteVerdict(u, { x: t.x, y: t.y }, taken, ctx, PATH_DANGER, 1);
        if (!v.reason) return { x: t.x, y: t.y, turns: v.turns, source: "NEAR", role: null };
    }
    return null;
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
            return fled(u, def, { key: "SETTLER_RETREAT", args: [nameOf(def), safe(() => Locale.compose(c.name), "?")] }, ctx);
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
        return fled(u, def, { key: "SETTLER_WAITS", args: [nameOf(def), safe(() => Locale.compose(homes[0].c.name), "?")] }, ctx);
    }
    for (const { c } of homes.slice(0, RETREAT_TRIES)) {
        const p = pathTo(u, c.location);
        if (!p || p.turns > SETTLE_MAX_TURNS || !wayIsSafe(u, p, RETREAT_DANGER, ctx) || !moveTo(u, c.location)) continue;
        return fled(u, def, { key: "SETTLER_RETREAT", args: [nameOf(def), safe(() => Locale.compose(c.name), "?")] }, ctx);
    }
    // No safe way home: the reachable tile furthest from them.
    return stepAway(u, def, ctx, "SETTLER_AWAY", { ownLand: true });
}

/**
 * Hostile units near a settler where it stands (settle, settlerAtRisk). On our garrisoned centre that is not under attack a
 * ship does not count (game 60, SC-7: settlers waited in St Petersburg T65 and T81-T82 for a Quadrireme parked 2 tiles off on
 * the water; elsewhere a ship counts where its next turn reaches: countsForSettler).
 */
function settlerInDanger(u, ctx) {
    if (!(settlementAt(u.location) && garrisoned(u.location) && !centreDamaged(u.location))) return hostileNear(u.location, DANGER_RADIUS, ctx);
    const before = ctx.ignoreShips;
    ctx.ignoreShips = true;
    try {
        return hostileNear(u.location, DANGER_RADIUS, ctx);
    } finally {
        ctx.ignoreShips = before;
    }
}

/**
 * Should a settler that is already walking get a new order? Hostile units came near it, near
 * its site, or near its way there.
 */
function settlerAtRisk(u, ctx) {
    if (settlerInDanger(u, ctx)) return true;
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
    return roomUnderCap(ctx);
}

/** Below the settlement cap (the military lever's room past it counted): a settler on its site may found now. */
function roomUnderCap(ctx) {
    const c = settlementCount();
    return !c || c.n < c.cap + Math.max(0, Number(ctx?.pastCap) || 0);
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
    if (settlerInDanger(u, ctx)) {
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
                return fled(u, def, { key: "SETTLER_DETOUR", args: [nameOf(def), via.x, via.y, goal.x, goal.y] }, ctx);
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
            return fled(u, def, { key: "SETTLER_LEAVES", args: [nameOf(def), safe(() => Locale.compose(home.name), "?"), out.x, out.y, out.turns ?? "?"] }, ctx);
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
                return fled(u, def, { key: "SETTLER_DETOUR", args: [nameOf(def), via.x, via.y, goal.x, goal.y] }, ctx);
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
    if (!goal) goal = defaultSite(u, taken, ctx);
    // No site on SETTLER_IDLE_TURNS turns in a row: one up to SETTLE_MAX_TURNS away will do (research/24 X2: below 3
    // settlements a site 6+ turns away was never taken; idle 13+ turns with sites known).
    const idle = settlerIdle.get(k);
    const starved = !!idle && idle.count >= SETTLER_IDLE_TURNS && Game.turn - idle.lastTurn <= 1;
    if (!goal && starved) goal = pickSite(u, taken, ctx, PATH_DANGER, { maxTurns: maxWalk(ctx) });
    // A countdown to block or to start (settlements are military points) and still no site: anywhere the game allows.
    let anywhere = null;
    if (!goal && ctx.anywhere && !!idle && idle.count >= ANYWHERE_IDLE_TURNS && Game.turn - idle.lastTurn <= 1) {
        goal = anySite(u, taken, ctx);
        if (goal) anywhere = { key: "SETTLE_ANYWHERE", args: [nameOf(def), goal.x, goal.y, goal.turns ?? "?"] };
    }
    if (!goal) {
        goals.delete(k);
        noteNoSite(u, ctx, taken, starved ? maxWalk(ctx) : siteLimit(ctx));
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
        return fled(u, def, { key: "SETTLER_DETOUR", args: [nameOf(def), goal.via.x, goal.via.y, goal.x, goal.y] }, ctx);
    }
    if (!moveTo(u, goal)) return null;
    // The way left now: the watchdog's first measure (settlerStuck).
    if (settlerProgress.get(k)?.goal !== `${goal.x},${goal.y}`) settlerProgress.set(k, { turn: Game.turn, turns: pathTurns(u, goal) ?? Infinity, goal: `${goal.x},${goal.y}`, stuck: 0 });
    return anywhere ?? gaveUp ?? { key: "SETTLE_MOVE", args: [nameOf(def), goal.x, goal.y, pathTurns(u, goal) ?? goal.turns ?? "?"] };
}

/** Sites settlers are walking to, with the role planned there (for map tacks). */
export function settlerGoals() {
    return errandGoals().filter((g) => g.x !== undefined).map((g) => ({ x: g.x, y: g.y, role: g.role ?? null }));
}

// ---- settler escorts (game 60, economy E5) ---------------------------------------------------------

const ESCORT_MARGIN = 5;        // an escort's Combat may be this much below the strongest raider within DANGER_RADIUS of the way
const ESCORT_MAX_RAIDERS = 1;   // ...and at most this many raiders stand within PATH_DANGER of the way and the site
const ESCORT_JOIN_TURNS = 3;    // the escort walks at most this far to the settler
const settlerEscorts = new Map(); // settler key -> { escort: unit key, site: { x, y, role, relaxed }, turns, turn }

/**
 * A war risk's soldier near this tile as a settler minds it (hostileNear with ctx.riskCalm): a Hostile leader's within
 * DANGER_RADIUS, another's next to it. It is no independent's raider: no escort walks past it.
 */
function riskSoldierNear(t, ctx) {
    if (!(ctx.riskOwners?.size > 0)) return false;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(t.x, t.y, DANGER_RADIUS), []) ?? []) {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        for (const { unit } of at ? unitsSeenAt(at.x, at.y) : []) {
            if (!riskArmy(unit, ctx)) continue;
            if (ctx.riskHostile?.has(unit.owner) || safe(() => GameplayMap.getPlotDistance(t.x, t.y, at.x, at.y), 9) <= 1) return true;
        }
    }
    return false;
}

/**
 * The independents' land soldiers we see near a settler's way and its site: [{ unit, def, s }] within DANGER_RADIUS, `close`
 * the number within PATH_DANGER; null when another hostile unit is there (a major's, a war risk's: riskSoldierNear, a ship
 * reaching it): no escort walks into that.
 */
function escortThreat(path, site, ctx) {
    const tiles = [...(path?.plots ?? []).map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter(Boolean), site];
    const found = new Map();
    const close = new Set();
    for (const t of tiles) {
        if (riskSoldierNear(t, ctx)) return null;
        for (const h of hostilesAround(t, DANGER_RADIUS)) {
            const k = unitKey(h.unit.id);
            const owner = hostileOwner(h.unit);
            if (!owner?.independent || h.def?.Domain !== "DOMAIN_LAND") {
                if (h.def?.Domain === "DOMAIN_SEA" && !countsForSettler(h.unit, h.at, t, ctx)) continue;
                return null;
            }
            found.set(k, { unit: h.unit, def: h.def, s: unitStrength(h.def) });
            if (safe(() => GameplayMap.getPlotDistance(t.x, t.y, h.at.x, h.at.y), 9) <= PATH_DANGER) close.add(k);
        }
    }
    const list = [...found.values()];
    return { list, close: close.size, strongest: Math.max(0, ...list.map((x) => x.s)) };
}

/**
 * A settler with no safe site whose site or way is unsafe only because of independents' soldiers walks there with an escort
 * (game 60: 77 settler-turns from done to founded, settlers waiting, retreating and detouring around independents' raiders
 * while 2-6 free soldiers stood idle): a free melee soldier of the defence's supply (not posted, not a garrison, not at a front,
 * hurt less than ESCORT_DAMAGE) whose Combat is no less than the strongest raider within DANGER_RADIUS of the way and the site
 * less ESCORT_MARGIN, at most ESCORT_JOIN_TURNS from the settler. It first comes to the settler (the settler waits), then both
 * go each turn to the settler's stop on its way; on the site the settler founds at once (foundArrivals). Founded, the soldier
 * stays there as its holder (gotcha 63). UI.log `settler: … escorted by …` each turn. @returns log entries
 */
function escortSettlers(units, ctx, taken) {
    const out = [];
    const byKey = new Map(units.map((u) => [unitKey(u.id), u]));
    // A settler gone (founded, lost): its escort is free.
    for (const [sk, plan] of [...settlerEscorts]) {
        if (byKey.has(sk)) continue;
        if (goals.get(plan.escort)?.escortSettler === sk) goals.delete(plan.escort);
        settlerEscorts.delete(sk);
    }
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const k = unitKey(u.id);
        if (!def || !truthy(def.FoundCity) || ctx.ordered.has(k) || !u.location || !readyForOrders(u)) continue;
        const e = safe(() => asSettler(ctx, () => escortSettler(u, def, ctx, byKey, taken)), null);
        if (e) out.push(e);
    }
    return out;
}

/**
 * No escort runs this pass («Поселенцы» off, or neither «Оборона» nor «Армия»): every plan ends and its soldier is free, so its
 * `{escortSettler}` goal does not keep it out of the defence's supply until a reload.
 */
function releaseSettlerEscorts() {
    for (const [sk, plan] of settlerEscorts) if (goals.get(plan.escort)?.escortSettler === sk) goals.delete(plan.escort);
    settlerEscorts.clear();
}

/** Our settlements need their soldiers (homeUnsafeFor, as hunts judge it: ships alone do not call them home), once a pass. */
const escortHomeNeeds = (ctx) => (ctx.escortHome ??= !!safe(() => homeUnsafeFor(ctx.ourUnits ?? [], ctx), false));

/**
 * The farthest walk an escort goes with a settler, as settle() judges the settler's own (siteLimit, maxWalk once it found no site
 * on SETTLER_IDLE_TURNS turns in a row): below NEAR_SETTLEMENTS an escort makes no far site near (gotcha 79).
 */
function escortLimit(k, ctx) {
    const idle = settlerIdle.get(k);
    const starved = !!idle && idle.count >= SETTLER_IDLE_TURNS && Game.turn - idle.lastTurn <= 1;
    return starved ? maxWalk(ctx) : siteLimit(ctx);
}

function escortSettler(u, def, ctx, byKey, taken) {
    const k = unitKey(u.id);
    let plan = settlerEscorts.get(k);
    if (plan?.turn === Game.turn) return null; // escorted already this turn
    const drop = (why) => {
        if (plan && goals.get(plan.escort)?.escortSettler === k) goals.delete(plan.escort);
        if (plan) log.info(`settler: ${def.UnitType} at ${u.location.x},${u.location.y}: its escort leaves (${why})`);
        settlerEscorts.delete(k);
        plan = null;
    };
    const combat = (x) => Number(safe(() => GameInfo.Unit_Stats.lookup(safe(() => GameInfo.Units.lookup(x.type)?.UnitType, null))?.Combat, 0)) || 0;
    const fits = (x, threat) => !!x && x.isOnMap !== false && !!x.location && (Number(x.Health?.damage) || 0) < ESCORT_DAMAGE && combat(x) >= threat.strongest - ESCORT_MARGIN;
    if (plan) {
        const escort = byKey.get(plan.escort);
        const site = plan.site;
        const p = same(u.location, site) ? null : pathTo(u, site);
        const threat = p ? escortThreat(p, site, ctx) : null;
        // A plan under way keeps the longest walk (maxWalk): the idle count that may have allowed it lapses while it walks.
        const why = !escort ? "gone" : !p ? (same(u.location, site) ? "on the site" : "no way") : p.turns > maxWalk(ctx) ? "too far"
            : !threat ? "other hostile units near the way" : threat.close > ESCORT_MAX_RAIDERS ? `${threat.close} raiders near the way`
            : !fits(escort, threat) ? "too weak or hurt" : !siteStillFree(site) || tooCloseToForeign(site, ctx) || hazardAt(site) > 0 ? "the site is lost"
            // A threatened settlement short of guards: the defence takes the soldier next pass.
            : escortHomeNeeds(ctx) ? "a settlement of ours needs its soldiers" : null;
        if (why) {
            drop(why);
            return null;
        }
    } else {
        if (hostileNear(u.location, 1, ctx) || escortHomeNeeds(ctx)) return null;
        const free = (ctx.supply ?? []).filter((c) => !c.packed && c.stage && !c.ranged && !c.atFront && !ctx.posts?.has(c.k) && !ctx.ordered.has(c.k)
            && c.u.canMove !== false && c.u.hasMoved !== true);
        if (free.length === 0) return null;
        // Only a settler with no safe site of its own (settle would wait, retreat or go around): not one whose goal settle()
        // keeps, nor one with a safe site, its own goal not counted as another settler's (settle() frees it too).
        const own = goals.get(k);
        if (own?.x !== undefined && !own.escorted && !settlerAtRisk(u, ctx)) return null;
        const mine = own?.x !== undefined ? `${own.x},${own.y}` : null;
        const limit = escortLimit(k, ctx);
        const freed = !!mine && taken.delete(mine);
        const safeSite = defaultSite(u, taken, ctx) ?? (limit > siteLimit(ctx) ? pickSite(u, taken, ctx, PATH_DANGER, { maxTurns: limit }) : null);
        if (freed) taken.add(mine);
        if (safeSite) return null;
        const early = (Number(safe(() => Players.get(pid()).Stats.numSettlements, 0)) || 0) < NEAR_SETTLEMENTS;
        const turnWeight = early ? SETTLE_TURN_WEIGHT / 2 : SETTLE_TURN_WEIGHT;
        let best = null;
        for (const pk of state.get().results.sites?.picks ?? []) {
            const site = { x: pk.x, y: pk.y, relaxed: !!pk.relaxed, role: pk.role ?? null };
            const v = siteVerdict(u, site, taken, ctx, PATH_DANGER, limit);
            if (v.reason !== "DANGER" && v.reason !== "UNSAFE_WAY") continue;
            const p = pathTo(u, site);
            if (!p || p.turns > limit) continue;
            const threat = escortThreat(p, site, ctx);
            if (!threat || threat.list.length === 0 || threat.close > ESCORT_MAX_RAIDERS) continue;
            const escort = free.map((c) => ({ c, t: pathTurns(c.u, u.location) })).filter(({ c, t }) => t !== null && t <= ESCORT_JOIN_TURNS && fits(c.u, threat))
                .sort((a, b) => a.t - b.t)[0];
            if (!escort) continue;
            const w = (Number(pk.value ?? pk.score) || 1 / (Number(pk.rank) || 1)) / (1 + p.turns / turnWeight);
            if (!best || w > best.w) best = { w, site, escort: escort.c, threat };
        }
        if (!best) return null;
        // The site keeps `relaxed`: tooCloseToForeign judges a relaxed pick by its own distances on every later pass.
        plan = { escort: best.escort.k, site: { x: best.site.x, y: best.site.y, role: best.site.role, relaxed: best.site.relaxed }, turns: 0, turn: -1, since: Game.turn };
        settlerEscorts.set(k, plan);
        goals.set(best.escort.k, { escortSettler: k });
        log.info(`settler: ${def.UnitType} at ${u.location.x},${u.location.y} takes ${best.escort.def.UnitType} as its escort to ${best.site.x},${best.site.y} (Combat ${combat(best.escort.u)} against the strongest raider's ${best.threat.strongest}; ${best.threat.list.length} near the way)`);
    }
    const escort = byKey.get(plan.escort);
    const edef = safe(() => GameInfo.Units.lookup(escort.type), null);
    const ek = plan.escort;
    goals.set(k, { x: plan.site.x, y: plan.site.y, role: plan.site.role, relaxed: plan.site.relaxed, escorted: ek });
    taken.add(`${plan.site.x},${plan.site.y}`);
    // The escort comes to the settler first: onto its tile, else next to it; the settler waits.
    if (safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, escort.location.x, escort.location.y), 9) > 1) {
        if (escort.hasMoved === true || ctx.ordered.has(ek)) return null;
        const spots = [u.location, ...tilesAt(u.location, 1).filter((l) => !same(l, u.location))]
            .filter((l) => !onWater(l) && roomForSoldier(l) && !ctx.stepTo.has(`${l.x},${l.y}`));
        const spot = spots.map((l) => ({ l, t: pathTurns(escort, l) })).filter((x) => x.t !== null).sort((a, b) => a.t - b.t)[0]?.l;
        if (!spot) {
            drop();
            return null;
        }
        wakeUnit(escort);
        if (!moveTo(escort, spot)) {
            drop();
            return null;
        }
        ctx.ordered.add(ek);
        restedByUs.delete(ek);
        ctx.stepTo.add(`${spot.x},${spot.y}`);
        operate(u, "UNITOPERATION_SKIP_TURN");
        ctx.ordered.add(k);
        plan.turn = Game.turn;
        log.info(`settler: ${def.UnitType} at ${u.location.x},${u.location.y} waits for its escort ${edef?.UnitType ?? "?"} (from ${escort.location.x},${escort.location.y} to ${spot.x},${spot.y})`);
        return { key: "SETTLER_ESCORT_COMING", args: [nameOf(def), edef ? nameOf(edef) : "?"] };
    }
    // Together: both to the farthest tile of the settler's way this turn that the escort reaches too, with room for both.
    const p = pathTo(u, plan.site);
    if (!p || ctx.ordered.has(ek) || escort.hasMoved === true) return null;
    const stops = [];
    (p.plots ?? []).forEach((idx, i) => {
        if ((Number(p.steps?.[i]) || 1) <= 1) stops.push(safe(() => GameplayMap.getLocationFromIndex(idx), null));
    });
    const stop = stops.filter(Boolean).reverse().find((l) => (same(l, escort.location) || (roomForSoldier(l) && (pathTurns(escort, l) ?? 9) <= 1))
        && roomFor(def, l) && hazardAt(l) === 0 && !ctx.stepTo.has(`${l.x},${l.y}`));
    if (!stop) return null;
    wakeUnit(escort);
    if (!same(stop, escort.location) && !moveTo(escort, stop)) return null;
    if (!moveTo(u, stop)) return null;
    ctx.ordered.add(ek);
    ctx.ordered.add(k);
    restedByUs.delete(ek);
    ctx.stepTo.add(`${stop.x},${stop.y}`);
    plan.turns++;
    plan.turn = Game.turn;
    settlerProgress.delete(k);
    // On its site this turn: it founds right after (foundArrivals), the escort standing by; at the settlement cap it waits
    // there instead (settle's waitAtCap: SETTLER_AT_CAP next pass), as every settler does.
    if (same(stop, plan.site) && roomUnderCap(ctx)) dashes.set(k, { x: stop.x, y: stop.y, turn: Game.turn, role: plan.site.role ?? null });
    log.info(`settler: ${def.UnitType} at ${u.location.x},${u.location.y} escorted by ${edef?.UnitType ?? "?"} toward ${plan.site.x},${plan.site.y}: both to ${stop.x},${stop.y}; escorted ${plan.turns} turn(s) since T${plan.since}`);
    return { key: "SETTLER_ESCORTED", args: [nameOf(def), edef ? nameOf(edef) : "?", plan.site.x, plan.site.y] };
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
 * the town next to them. `hostileOnly`: only at a soldier we are at war with (a guard woken to shoot), or a hostile commander
 * after them (M2: game 60's busy guards never shot Вьядхапура's pillaging commander); `held`: tiles left to a raider hunt's
 * general (W5: heldFor).
 */
function rangedAttack(u, def, { hostileOnly = false, held = null } = {}) {
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
        if (there.length === 0 || (hostileOnly && !there.some((t) => hostileOwner(t) || hostileCommander(t)))) continue;
        if (held && heldFor(held, u, loc)) continue;
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
            else if (turns > STEP_ASIDE_MAX_TURNS) refused.far++;
            else if (startsWar(u, loc)) refused.war++;
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
            const made = { key: "MADE_ROOM", args: [nameOf(safe(() => GameInfo.Units.lookup(n.type), null)), nameOf(def)] };
            noteEntryUnit(made, n, spot);
            ctx.entries.push(made);
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
    if (autoExploreIsSafe(u, ctx) && operate(u, "UNITOPERATION_AUTOMATE_EXPLORE")) {
        goals.delete(unitKey(u.id));
        return { key: "EXPLORE", args: [nameOf(def)] };
    }
    return toFrontier(u, def, ctx, ROAM_RADIUS, ROAM_MAX_TURNS);
}

/**
 * The best revealed tile next to the fog within `radius`, reached in at most `maxTurns` (game 60, SC-3: a random tile re-drawn
 * every pass took our scouts back and forth; they revealed the least land of ten civilizations by T20): the hidden tiles within
 * SCOUT.HIDDEN_RADIUS of it over 1 + the turns to it, SCOUT.HEADING_BONUS for going on the way it went last time, less
 * SCOUT.CROWD_PENALTY near another unit's goal; chance only between equals. `sameArea`: on its own landmass only
 * (GameplayMap.getAreaId). A scout keeps it as its goal (`frontier`: scoutGoalHolds).
 */
function toFrontier(u, def, ctx, radius, maxTurns, { keep = SCOUT_DANGER, sameArea = false } = {}) {
    const here = u.location;
    const land = def.Domain !== "DOMAIN_SEA";
    const k = unitKey(u.id);
    const HIDDEN = globalThis.RevealedStates?.HIDDEN ?? 0;
    const area = (l) => safe(() => GameplayMap.getAreaId(l.x, l.y), null);
    const home = sameArea ? area(here) : null;
    // The game's maps wrap east-west: the shorter way round (within a scout's radius it is the plain one anyway).
    const width = Number(safe(() => GameplayMap.getGridWidth(), 0)) || 0;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    // Other units' goals: the tiles they walk to.
    const others = [...goals.entries()].filter(([gk]) => gk !== k)
        .map(([, g]) => String(g.frontier ?? g.at ?? g.discovery ?? (g.x !== undefined ? `${g.x},${g.y}` : "")).split(",").map(Number))
        .filter((t) => t.length === 2 && Number.isFinite(t[0]) && Number.isFinite(t[1])).map(([x, y]) => ({ x, y }));
    const heading = frontierHeading.get(k);
    const candidates = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
        if (!isFrontier(loc, land) || dangerNear(loc, keep, ctx)) continue;
        if (sameArea && home !== null && area(loc) !== home) continue;
        let hidden = 0;
        for (const n of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, SCOUT.HIDDEN_RADIUS), []) ?? []) {
            const t = safe(() => GameplayMap.getLocationFromIndex(n), null);
            if (t && safe(() => GameplayMap.getRevealedState(pid(), t.x, t.y), HIDDEN) === HIDDEN) hidden++;
        }
        const dx = wrapDx(here.x, loc.x, width, true);
        const dy = loc.y - here.y;
        const facts = { hidden, aligned: keepsHeading(heading, dx, dy), crowded: others.some((o) => dist(o, loc) <= SCOUT.CROWD_RADIUS) };
        // First by the straight distance (two tiles a turn); the way is asked for the best few only.
        candidates.push({ loc, dx, dy, facts, tie: ctx.random(), guess: frontierScore({ ...facts, turns: dist(here, loc) / 2 }) });
    }
    candidates.sort((a, b) => b.guess - a.guess || a.tie - b.tie);
    const scored = [];
    for (const c of candidates.slice(0, ROAM_TRIES * 2)) {
        const p = pathTo(u, c.loc);
        if (!p || p.turns > maxTurns || !wayIsSafe(u, p, keep > SCOUT_DANGER ? keep - 1 : 1, ctx) || startsWar(u, c.loc)) continue;
        scored.push({ ...c, score: frontierScore({ ...c.facts, turns: p.turns }) });
    }
    scored.sort((a, b) => b.score - a.score || a.tie - b.tie);
    for (const c of scored) {
        if (!moveTo(u, c.loc)) continue;
        ctx.stepTo.add(`${c.loc.x},${c.loc.y}`);
        frontierHeading.set(k, { dx: c.dx, dy: c.dy });
        if (hasTag(def, "UNIT_CLASS_AUTOEXPLORE")) goals.set(k, { frontier: `${c.loc.x},${c.loc.y}`, since: Game.turn });
        return { key: "ROAM", args: [nameOf(def), c.loc.x, c.loc.y] };
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
const ARMY_UPGRADE = "UNITCOMMAND_UPGRADE_ARMY"; // a commander's packed soldiers, all at once (the army panel's button)

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
    // A packed soldier stands where its army stands (unitTile: off the map its own location is -9999; after game 55).
    const dist = (u, s) => {
        const at = unitTile(u);
        return at ? safe(() => GameplayMap.getPlotDistance(at.x, at.y, s.x, s.y), 99) : 99;
    };
    const near = (u) => threats.some((t) => dist(u, t.settlement) <= THREAT_RADIUS);
    // An exposed settlement's holder next (research/37 §4C), before units elsewhere.
    const holding = (u) => exposed.some((e) => dist(u, e.settlement) <= HOLDER_RADIUS);
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
    // A commander's packed soldiers upgrade together first (after game 55; the army panel's «upgrade all» button):
    // UNITCOMMAND_UPGRADE_ARMY on the commander, "Upgrade all eligible units in the army", with NO_TARGET as the unit panel
    // sends a command, when the game offers it. Priced at its soldiers' estimates (the game's own price is only in the
    // tooltip, AdditionalDescription, which UI.log keeps); its soldiers are then left out below.
    const viaArmy = new Set();
    const all = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const upgradeOf = (u) => GameInfo.UnitUpgrades?.find((r) => r.Unit === safe(() => GameInfo.Units.lookup(u.type)?.UnitType, null))?.UpgradeUnit ?? null;
    for (const c of all) {
        if (out.length >= MAX_UPGRADES) break;
        if (!c.isCommanderUnit || c.isOnMap === false || !c.location) continue;
        const members = all.filter((x) => x !== c && !x.isCommanderUnit && x.isOnMap === false && sameId(x.armyId, c.armyId) && upgradeOf(x)
            && safe(() => GameInfo.Units.lookup(x.type).CoreClass, null) === "CORE_CLASS_MILITARY" && ((!broke && mode !== "THREAT") || near(x)));
        if (members.length === 0) continue;
        const eligible = members.filter((x) => safe(() => Game.UnitCommands.canStart(x.id, UPGRADE, NO_TARGET, false), null)?.Success);
        const priced = eligible.length > 0 ? eligible : members;
        const cost = priced.reduce((sum, x) => sum + upgradeEstimate(upgradeOf(x)), 0);
        const gold = members.some((x) => war && near(x)) ? b.all() : b.free();
        if (cost > gold) continue;
        const r = safe(() => Game.UnitCommands.canStart(c.id, ARMY_UPGRADE, NO_TARGET, false), null);
        if (!r?.Success) continue;
        Game.UnitCommands.sendRequest(c.id, ARMY_UPGRADE, { ...NO_TARGET });
        const cdef = safe(() => GameInfo.Units.lookup(c.type), null);
        b.spend(cost, { kind: "UPGRADE", label: `${nameOf(cdef)} (${priced.length})` });
        for (const x of members) {
            viaArmy.add(unitKey(x.id));
            noteMeleeObtained(safe(() => GameInfo.Units.lookup(upgradeOf(x)), null), "upgraded");
        }
        const told = [r.AdditionalDescription ?? []].flat().map((t) => safe(() => Locale.compose(t), t)).join(" ");
        log.info(`upgrade: ${cdef?.UnitType ?? "?"} at ${c.location.x},${c.location.y} upgrades its army [${priced.map((x) => `${safe(() => GameInfo.Units.lookup(x.type).UnitType, "?")} -> ${upgradeOf(x)}`).join(", ")}]: estimate ${Math.round(cost)}; the game says "${told}"`);
        out.push({ key: "ARMY_UPGRADED", args: [nameOf(cdef), priced.length, Math.round(cost)] });
    }
    for (const u of candidates) {
        if (out.length >= MAX_UPGRADES || pool(u) <= 0 || viaArmy.has(unitKey(u.id))) continue;
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
    // A soldier packed in an army may be upgraded too: the army panel selects it and the unit panel offers the same command
    // (after game 55).
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        if (u.isCommanderUnit || (A && u.activityType === A.OPERATION)) continue;
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
 * while we are at war with it. `anyClass`: a scout, a commander or a settler of theirs too (UI.log's `units:` line).
 * @returns the independent's id, the owner, or null
 */
export function hostileOwner(unit, { anyClass = false } = {}) {
    if (!unit || unit.owner === pid()) return null;
    const def = safe(() => GameInfo.Units.lookup(unit.type), null);
    if (!anyClass && def?.CoreClass !== "CORE_CLASS_MILITARY") return null;
    return ownerAtWar(unit);
}

/**
 * A land commander of a player at war with us (FORMATION_CLASS_COMMAND; an independent's too), hostileOwner's owner rules (M2,
 * game 60: Вьядхапура's Army Commander pillaged next to Тула every 2 turns T89-T139, 54 repairs for 1,408 gold, and was struck
 * only by idle Slingers until T98). A target and danger for settlers and scouts, never a raider in threatenedSettlements (it
 * buys no walls or guards). @returns the owner (hostileOwner's) or null
 */
function hostileCommander(unit) {
    if (!unit || unit.owner === pid()) return null;
    const def = safe(() => GameInfo.Units.lookup(unit.type), null);
    if (def?.FormationClass !== "FORMATION_CLASS_COMMAND" || def.Domain !== "DOMAIN_LAND") return null;
    return ownerAtWar(unit);
}

/** A hostile scout (CORE_CLASS_RECON) of a player at war with us (SC-6): a sortie target in a general's radius only. */
function hostileScout(unit) {
    if (!unit || unit.owner === pid()) return null;
    const def = safe(() => GameInfo.Units.lookup(unit.type), null);
    if (def?.CoreClass !== "CORE_CLASS_RECON" || def.Domain !== "DOMAIN_LAND") return null;
    return ownerAtWar(unit);
}

/** The owner of another player's unit when we are at war with it (hostileOwner), else null. */
function ownerAtWar(unit) {
    // Killed earlier in this pass (our strike step runs first; game 60 T67: a Warrior struck dead at 68,10 still counted for
    // a hurt Slinger's step away): no threat.
    if (unit.isDead === true || (Number(unit.Health?.damage) || 0) >= (Number(unit.Health?.maxDamage) || Infinity)) return null;
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

/** The first hostile unit (hostileOwner) we see now on this tile (unitsSeenAt), or undefined: a target. */
const hostileSeenAt = (loc) => (loc ? unitsSeenAt(loc.x, loc.y, { remembered: false }).map((e) => e.unit).find((e) => hostileOwner(e)) : undefined);

/** Is this settlement's centre damaged (Players.Districts, as the game's district health bars read it)? */
function centreDamaged(loc) {
    const districts = safe(() => Players.Districts.get(pid()), null);
    const health = Number(safe(() => districts.getDistrictHealth(loc), NaN));
    const max = Number(safe(() => districts.getDistrictMaxHealth(loc), NaN));
    return Number.isFinite(health) && Number.isFinite(max) && max > 0 && health < max;
}

/** This settlement's centre health and its maximum, as centreDamaged reads them (NaN when unknown). */
function centreHealth(loc) {
    const districts = safe(() => Players.Districts.get(pid()), null);
    return { health: Number(safe(() => districts.getDistrictHealth(loc), NaN)), maxHealth: Number(safe(() => districts.getDistrictMaxHealth(loc), NaN)) };
}

/** The share of its health a centre of ours keeps (1 when unknown). */
function centreShare(loc) {
    const districts = safe(() => Players.Districts.get(pid()), null);
    const health = Number(safe(() => districts.getDistrictHealth(loc), NaN));
    const max = Number(safe(() => districts.getDistrictMaxHealth(loc), NaN));
    return Number.isFinite(health) && max > 0 ? Math.max(0, Math.min(1, health / max)) : 1;
}

let fortifications = null; // FORTIFICATION-tagged types (GameInfo.TypeTags)

/** Walls standing on this centre: a finished, undamaged FORTIFICATION building (any age's or civilization's walls). */
export function walledCentre(loc) {
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
        const shipStats = []; // their Unit_Stats rows: who out-guns them (research/41 §3)
        let air = 0;
        let strongest = null; // the strongest land raider: { type, s }
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(c.location.x, c.location.y, THREAT_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            const d = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, c.location.x, c.location.y), Infinity);
            // The units we see there, or saw there lately (unitsSeenAt: game 60, SCM-2).
            for (const { unit } of unitsSeenAt(loc.x, loc.y)) {
                const k = unitKey(unit.id);
                if (seen.has(k)) continue;
                const h = hostileOwner(unit);
                if (!h || (!damaged && d > 1 && atHome(h, loc))) continue;
                seen.add(k);
                owners.set(h.id, h);
                if (d <= THREAT_CLOSE) close++;
                const kind = safe(() => GameInfo.Units.lookup(unit.type), null);
                const domain = kind?.Domain ?? null;
                if (domain !== "DOMAIN_SEA" && domain !== "DOMAIN_AIR") {
                    land++;
                    const s = kind ? unitStrength(kind) : 0;
                    if (!strongest || s > strongest.s) strongest = { type: kind?.UnitType ?? "?", s };
                } else if (domain === "DOMAIN_SEA") {
                    ships++;
                    const st = kind ? safe(() => GameInfo.Unit_Stats.lookup(kind.UnitType), null) : null;
                    if (st) shipStats.push(st);
                } else air++;
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
                settlement: { x: c.location.x, y: c.location.y, name: safe(() => Locale.compose(c.name), "?") }, count: seen.size, land, ships, shipStats, air, close,
                damaged, walled: walledCentre(c.location), strong, strongest: strongest?.type ?? null, owners: [...owners.values()],
                ...centreHealth(c.location), // health, maxHealth: how hard the centre is pressed (centreLow)
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
            const sight = `${t.location.x},${t.location.y}`;
            for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(t.location.x, t.location.y, APPROACH_DISTANCE), []) ?? []) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
                if (!loc || safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, t.location.x, t.location.y), 0) < APPROACH_DISTANCE) continue;
                if ((safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).length > 0 || ctx.stepTo.has(`${loc.x},${loc.y}`)) continue;
                if (dangerNear(loc, 1, ctx)) continue; // not next to its units
                // A tile a scout or an earlier visit found blind (noteBlindSight; game 60, SC-1).
                if (sightMemory.failed(sight, `${loc.x},${loc.y}`, Game.turn)) continue;
                const d = safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, loc.x, loc.y), Infinity);
                if (!best || d < best.d) best = { loc, d, sight };
            }
        }
        const keep = losses.has(`indep:${indep}`) ? SCOUT_DANGER : 1;
        const p = best ? pathTo(u, best.loc) : null;
        if (!p || startsWar(u, best.loc)) continue;
        if (!wayIsSafe(u, p, keep, ctx)) {
            const via = detourToward(u, best.loc, keep, ctx);
            if (!via) continue;
            ctx.approached.add(indep);
            goals.set(unitKey(u.id), { approach: indep, at: `${best.loc.x},${best.loc.y}`, sight: best.sight });
            return { key: "DETOUR", args: [nameOf(def), best.loc.x, best.loc.y, via.x, via.y] };
        }
        if (!moveTo(u, best.loc)) continue;
        ctx.approached.add(indep);
        goals.set(unitKey(u.id), { approach: indep, at: `${best.loc.x},${best.loc.y}`, sight: best.sight });
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
 * A centre under real attack: below this share of its health (game 60: a scratch, 181 of 200 on a walled centre, sent walls for
 * another district ahead of the Ha'amonga a Maui two turns from done, lost by a turn). Its walls pass everything, a raced wonder
 * too (wallsSlot), and its defenders pass an item done this turn (frontLoadUnits).
 */
export const WALLS_URGENT_SHARE = 0.5;

/** Is this threatened settlement's centre below WALLS_URGENT_SHARE of its health? Damaged with no health known: yes (as before). */
export function centreLow(t) {
    if (!t?.damaged) return false;
    const health = Number(t.health);
    const max = Number(t.maxHealth);
    if (!Number.isFinite(health) || !(max > 0)) return true;
    return health < WALLS_URGENT_SHARE * max;
}

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
        // Against ships alone a ranged guard counts only when it out-guns or out-ranges them (research/41 §3: game 38's Field
        // Cannons counted against Frigates and died); with land raiders too it still serves against those.
        if (antiShip && !(Number(threat.land) > 0) && !fightsShips(safe(() => GameInfo.Unit_Stats.lookup(kind.UnitType), null), threat.shipStats ?? [])) continue;
        // Off the map (research/37 §5C): unpacking from an army here this pass (a turn out), or reinforcing an army that stands
        // here (its ETA, and a turn to deploy: a reinforcement arrives packed). Packed in an army otherwise: no guard.
        if (u.isOnMap === false) {
            const up = unpacking.get(unitKey(u.id));
            const mo = marchOf(u, key);
            const rt = mo ? null : rapidTurns(u, key, units);
            if (up?.turn === Game.turn && up.key === key) incoming.push({ u, turns: 1 });
            else if (mo) incoming.push({ u, turns: marchTurns(mo, units) });
            else if (rt !== null) incoming.push({ u, turns: rt });
            else {
                const at = reinforcingAt(u, units);
                if (at && safe(() => GameplayMap.getPlotDistance(at.x, at.y, s.x, s.y), Infinity) <= GUARD_RADIUS) incoming.push({ u, turns: reinforcementTurns(u) + 1 });
            }
            continue;
        }
        if (!u.location) continue;
        const wet = afloat(u);
        const g = goals.get(unitKey(u.id));
        // Packed this pass for a march (the game packs it after the pass): coming with its commander.
        if (g?.march !== undefined) {
            const mo = marchOf(u);
            if (mo?.m.key === key) incoming.push({ u, turns: marchTurns(mo, units) });
            if (mo) continue;
        }
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
export function frontGuards(front, units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
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
    // The free melee soldiers shared across the fronts of wars (research/42 B1).
    const warFronts = ctx.fronts.filter((f) => f.atWar).length;
    const freeMelee = (ctx.supply ?? []).filter((c) => !c.ranged && !c.packed && c.stage && c.atFront === undefined).length;
    const share = warFronts > 0 ? Math.floor(freeMelee / warFronts) : 0;
    ctx.frontShare = share;
    for (const f of ctx.fronts) {
        const n = frontGuardsPosted(f, share) - frontGuards(f, units);
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
        if (!commander?.location || marching(commander) || rapid?.ck === unitKey(commander.id)) continue;
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
        // A walk cancelled this pass for the plague (checkWalks) is none: the game shows it stopped only later.
        const act = ctx.walkCancelled?.has(k) ? A?.NONE : u.activityType;
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
 * with no raider in sight, next to the centre. A ranged (or hurt) soldier never takes a walk of several turns whose first
 * end-of-turn stop is unsafe (firstStopUnsafe; game 60 T66): it is noted in ctx.unsafeWays.
 */
function postFor(u, s, ctx, { ranged = false, front = false, holder = false, from = u } = {}) {
    const radius = front ? STAGE_RADIUS : holder ? HOLDER_RADIUS : REINFORCE_RADIUS;
    const raiders = ranged ? hostilesAround(s, THREAT_RADIUS + 1) : [];
    const range = ranged ? Math.max(1, Number(safe(() => GameInfo.Unit_Stats.lookup(GameInfo.Units.lookup(u.type).UnitType)?.Range, 0)) || 2) : 0;
    const kind = safe(() => GameInfo.Units.lookup(u.type), null);
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || ctx.stepTo.has(`${loc.x},${loc.y}`) || !roomForSoldier(loc) || !postGround(loc, front)) continue;
        const near = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, s.x, s.y), 0);
        const far = safe(() => GameplayMap.getPlotDistance(from.location.x, from.location.y, loc.x, loc.y), 0);
        const back = raiders.length > 0 ? Math.min(...raiders.map((h) => safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, h.at.x, h.at.y), 9))) : 0;
        const outOfRange = raiders.length > 0 && back > range ? 1000 : 0;
        // Off the centre, within reach of a ship it does not out-gun: last, the fewest ships first (research/41 §3). A melee
        // unit holds the centre whatever ships do.
        const wet = !ranged && near === 0 ? 0 : SHIP_POST_PENALTY * shipThreat(loc, kind).length;
        tiles.push({ loc, score: wet + (ranged ? outOfRange + (near === 0 ? 500 : 0) + near * 30 - back * 40 + far : near * 100 + far) });
    }
    tiles.sort((a, b) => a.score - b.score);
    // A packed member leaves its army next to its commander (a deploy takes its turn) and walks from there.
    const extra = from === u ? 0 : 1;
    const fragile = ranged || (Number(u.Health?.damage) || 0) >= ESCAPE_DAMAGE;
    for (const { loc } of tiles.slice(0, REINFORCE_TRIES)) {
        const p = pathTo(from, loc);
        const turns = p ? p.turns + extra : null;
        if (turns === null || turns > REINFORCE_MAX_TURNS || startsWar(from, loc) || hazardAt(loc) > 0) continue;
        if (fragile && p.turns > 1 && firstStopUnsafe(u, kind, p, ctx)) {
            (ctx.unsafeWays ??= new Set()).add(unitKey(u.id));
            continue;
        }
        return { loc, turns };
    }
    return null;
}

/** Ground a post may stand on (postFor): land, not a navigable river (an embarked soldier cannot fight: research/37 §3C), passable, ours or nobody's (a front's: ours). */
function postGround(loc, front) {
    if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) return false;
    const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
    return front ? owner === pid() : owner === -1 || owner === null || owner === pid();
}

/**
 * Has this settlement (a war front's: `front`; an exposed one's holder: `holder`) a post off the plague, its room aside
 * (postFor's tiles)? A defender bought elsewhere for an infected settlement walks only to a clean post (postFor refuses
 * hazards): with none, it stands in the city that bought it, and the next turn bought another (the review of game 60's
 * package: a Warrior bought in Selby for York every turn while the plague lay on every tile within 2, none sent).
 */
export function cleanPostNear(s, { front = false, holder = false } = {}) {
    const radius = front ? STAGE_RADIUS : holder ? HOLDER_RADIUS : REINFORCE_RADIUS;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (loc && postGround(loc, front) && !(hazardAt(loc) > 0)) return true;
    }
    return false;
}

/**
 * Is the first end-of-turn stop of a soldier's walk (turnStop) unsafe for a ranged or hurt one (core stopUnsafe)? Next to a land
 * raider, or in reach of WALK.REACH_MIN or more hostile soldiers (ships it does not out-gun too) that it and our soldiers on or
 * next to that stop do not out-number. Game 60 T66: a Slinger sent as a spare to Тула, 4 turns away, past four raiders, was hit
 * on its first step (65,12) and killed the next turn.
 */
function firstStopUnsafe(u, def, p, ctx) {
    const stop = turnStop(p);
    if (!stop) return false;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const land = hostilesAround(stop, REACH_LOOK).filter((h) => h.def?.Domain === "DOMAIN_LAND");
    const nextToRaider = land.some((h) => dist(stop, h.at) <= 1);
    const reach = land.filter((h) => dist(stop, h.at) <= reachOf(h)).length + shipThreat(stop, def).length;
    const ours = (ctx.ourUnits ?? []).filter((s) => !sameId(s.id, u.id) && !s.isCommanderUnit && s.isOnMap !== false && s.location
        && dist(s.location, stop) <= 1 && isSoldier(safe(() => GameInfo.Units.lookup(s.type), null))).length;
    return stopUnsafe({ nextToRaider, reach, ours });
}

const SHIP_POST_PENALTY = 2000; // a post's score for each ship in reach the unit does not out-gun

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
            // Against ships alone, only a unit that out-guns or out-ranges them (research/41 §3).
            const gunsOk = (c) => !d.antiShip || Number(d.t.land) > 0 || fightsShips(safe(() => GameInfo.Unit_Stats.lookup(c.def.UnitType), null), d.t.shipStats ?? []);
            const picks = supply.filter((c) => !ctx.posts.has(c.k) && c.ranged === d.ranged && (!c.siege || d.antiShip) && c.from !== d.key && (!d.front || (c.stage && c.atFront === undefined)) && armyOk(c) && gunsOk(c))
                .map((c) => ({ c, d: safe(() => GameplayMap.getPlotDistance((c.packed ?? c.u).location.x, (c.packed ?? c.u).location.y, s.x, s.y), Infinity) }))
                .filter((x) => x.d <= REINFORCE_REACH && !(x.c.atFront === d.key))
                .sort((a, b) => a.d - b.d).slice(0, REINFORCE_PICKS);
            let best = null;
            for (const { c } of picks) {
                ctx.unsafeWays?.delete(c.k);
                const post = postFor(c.u, s, ctx, { ranged: d.ranged, front: d.front, holder: !!d.exposed, from: c.packed ?? c.u });
                if (post && (!best || post.turns < best.post.turns)) best = { c, post };
                // Its only ways there stop where raiders reach it (game 60 T66): said in the defence line.
                else if (!post && ctx.unsafeWays?.has(c.k)) {
                    const list = (ctx.notSent ??= new Map()).get(d.key) ?? [];
                    const at = (c.packed ?? c.u).location;
                    const text = `${c.def?.UnitType ?? "?"} at ${at.x},${at.y} (unsafe way)`;
                    if (!list.includes(text)) list.push(text);
                    ctx.notSent.set(d.key, list);
                }
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
    const all = [...ctx.threats, ...ctx.fronts];
    if (all.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    for (const a of ctx.armies ?? []) {
        const soldiers = a.packed.filter((u) => isSoldier(safe(() => GameInfo.Units.lookup(u.type), null)));
        const ck = unitKey(a.cmdr.id);
        if (soldiers.length === 0 || ctx.ordered.has(ck) || afloat(a.cmdr)) continue;
        // Asked this turn already (the end-of-turn retry reads the army before the game has moved them): not again.
        if (soldiers.some((u) => unpacking.get(unitKey(u.id))?.turn === Game.turn)) continue;
        // The vanguard's ready army waits packed at a quiet war front (after game 54): it unpacks where raiders are.
        const needs = rapid?.ck === ck ? ctx.threats : all;
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

// ---- packed marches (research/42 B2, research/41 Phase 3) -----------------------------------------------------------

const PACK_MIN = 2;          // a general packs at least this many soldiers for a march...
const PACK_SLOW_TURNS = 3;   // ...for a settlement or a front whose posted guards walk this many turns or more...
const PACK_MAX_TURNS = 8;    // ...when its packed army gets there within this many
const FORCE_MARCH = "UNITCOMMAND_FORCE_MARCH"; // +3 moves for some of the units' health (ARMY_FORCE_MARCH_MOVEMENT_BONUS)
const marches = new Map();   // commander key -> { key, at: {x,y}, name, start, members: [unit keys], turns, walk }
let marchNoted = -1;         // the turn UI.log gave the marches (probe P-A7)

/** The march this unit is packed in (or about to be) toward settlement `key` (any when null): { ck, m } or null. */
function marchOf(u, key = null) {
    const k = unitKey(u.id);
    for (const [ck, m] of marches) if (m.members.includes(k) && (key === null || m.key === key)) return { ck, m };
    return null;
}

/** The turns before a march's soldiers stand at its settlement: the commander's way there and a turn to unpack. */
function marchTurns(mo, units) {
    const c = (units ?? []).find((x) => unitKey(x.id) === mo.ck);
    const t = c?.location ? pathTurns(c, mo.m.at) : null;
    return (t ?? mo.m.turns) + 1;
}

/** Is this commander marching (its army packed toward a settlement)? */
const marching = (c) => !!c && marches.has(unitKey(c.id));

/**
 * A general packs the soldiers going to the same fight and marches with them (research/42 B2; game 53: Китион's
 * reinforcements came one at a time, 2-6 turns out, while its centre fell in five turns; the user: "commanders are not
 * packing units"). For a threatened settlement or a front whose posted guards walk PACK_SLOW_TURNS or more, a land commander
 * not at another fight, with at least PACK_MIN of those soldiers (or free ones) next to it, packs them one by one
 * (`UNITCOMMAND_ADD_TO_ARMY` on each soldier: canStart with no target lists the commanders' tiles, then {X, Y} of its tile,
 * as the game's add-to-army mode sends it; never PACK_ARMY, which takes every unit next to it, garrisons too) and marches
 * there when its own way (one more turn to unpack) is no longer than their walk on average and within PACK_MAX_TURNS. Its
 * members count as coming with its turns (guardDetail); at the settlement the army unpacks (unpackArmies). A march whose
 * settlement needs nothing any more unpacks where it stands. UI.log `army: march …` each turn (probe P-A7: the turns a
 * packed army takes against the walk). Runs after the defence plan, before the unit loop. @returns log entries
 */
function packMarches(units, ctx) {
    const out = [];
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const byKey = new Map(units.map((u) => [unitKey(u.id), u]));
    const needs = new Map([...ctx.threats, ...ctx.fronts].map((t) => [`${t.settlement.x},${t.settlement.y}`, t]));
    // Marches under way: on toward their settlement, or unpacked where they stand when it needs nothing any more.
    for (const [ck, m] of [...marches]) {
        const c = byKey.get(ck);
        const packed = m.members.map((k) => byKey.get(k)).filter((u) => u && u.isOnMap === false);
        if (!c || c.isOnMap === false || !c.location || (packed.length === 0 && Game.turn > m.start)) {
            marches.delete(ck);
            continue;
        }
        if (ctx.ordered.has(ck)) continue; // unpacking at the settlement this pass (unpackArmies)
        if (!needs.has(m.key)) {
            const OP = "UNITCOMMAND_UNPACK_ARMY";
            const plots = (safe(() => Game.UnitCommands.canStart(c.id, OP, {}, false), null)?.Plots ?? [])
                .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter((l) => l && !onWater(l));
            if (plots.length > 0) {
                Game.UnitCommands.sendRequest(c.id, OP, { X: plots[0].x, Y: plots[0].y });
                ctx.ordered.add(ck);
            }
            log.info(`army: ${typeOf(c)} at ${where(c.location)} ends its march to ${m.name}: it needs nothing now (${packed.length} unpacked)`);
            marches.delete(ck);
            continue;
        }
        if (dist(c.location, m.at) <= GUARD_RADIUS || c.canMove === false) continue;
        wakeUnit(c);
        // Urgent (a damaged centre, raiders close) with healthy soldiers: Force March, +3 moves for some of their health,
        // when the game offers it (a promotion's command).
        const need = needs.get(m.key);
        if ((need?.damaged || Number(need?.close) > 0) && packed.every((u) => (Number(u.Health?.damage) || 0) < ESCAPE_DAMAGE)
            && safe(() => Game.UnitCommands.canStart(c.id, FORCE_MARCH, NO_TARGET, false), null)?.Success) {
            Game.UnitCommands.sendRequest(c.id, FORCE_MARCH, { ...NO_TARGET });
            log.info(`army: ${typeOf(c)} at ${where(c.location)} force-marches to ${m.name} (${packed.length} packed)`);
        }
        if (moveTo(c, m.at)) {
            ctx.ordered.add(ck);
            goals.set(ck, { post: `${m.at.x},${m.at.y}`, turn: Game.turn });
        }
    }
    // New marches: the posts of this pass that walk far, grouped by settlement.
    const slow = new Map();
    for (const [k, p] of ctx.posts ?? []) {
        if (p.packed || p.reinforce || p.exposed || !(p.turns >= PACK_SLOW_TURNS)) continue;
        if (!slow.has(p.key)) slow.set(p.key, { t: p.t, posts: [] });
        slow.get(p.key).posts.push([k, p]);
    }
    for (const [key, need] of slow) {
        const s = need.t.settlement;
        for (const c of landCommanders(units)) {
            const ck = unitKey(c.id);
            if (marching(c) || ctx.ordered.has(ck) || c.isOnMap === false || !c.location || afloat(c) || c.canMove === false || c.hasMoved === true) continue;
            if (inCampaign(ck) || inField(ck) || (Number(c.Health?.damage) || 0) >= ESCAPE_DAMAGE) continue;
            // Not taken from another fight: a general within GUARD_RADIUS of another threatened settlement stays there.
            if (ctx.threats.some((t) => `${t.settlement.x},${t.settlement.y}` !== key && dist(c.location, t.settlement) <= GUARD_RADIUS)) continue;
            const army = (ctx.armies ?? []).find((a) => a.cmdr === c);
            const room = (army?.capacity ?? ARMY_CAPACITY) - (army?.packed.length ?? 0) - (army?.incoming.length ?? 0) - (army?.reserved ?? 0);
            const beside = (u) => !!u?.location && dist(u.location, c.location) <= 1 && u.isOnMap !== false && !afloat(u) && !ctx.ordered.has(unitKey(u.id));
            const walkers = need.posts.filter(([k]) => beside(byKey.get(k)));
            const extra = (ctx.supply ?? []).filter((x) => !x.packed && x.stage && !ctx.posts.has(x.k) && x.atFront === undefined && beside(x.u) && !x.siege);
            const members = [...walkers.map(([k, p]) => ({ k, u: byKey.get(k), walk: p.turns })), ...extra.map((x) => ({ k: x.k, u: x.u, walk: pathTurns(x.u, s) }))]
                .filter((x) => x.walk !== null && x.walk !== undefined).slice(0, Math.max(0, room));
            if (members.length < PACK_MIN) continue;
            const turns = pathTurns(c, s);
            if (turns === null || turns > PACK_MAX_TURNS || startsWar(c, s)) continue;
            const walk = members.reduce((n, x) => n + x.walk, 0) / members.length;
            if (turns + 1 > walk) continue;
            const at = safe(() => GameplayMap.getIndexFromXY(c.location.x, c.location.y), -1);
            const joined = [];
            for (const x of members) {
                const r = safe(() => Game.UnitCommands.canStart(x.u.id, "UNITCOMMAND_ADD_TO_ARMY", {}, false), null);
                if (!(r?.Plots ?? []).includes(at)) continue;
                wakeUnit(x.u);
                Game.UnitCommands.sendRequest(x.u.id, "UNITCOMMAND_ADD_TO_ARMY", { X: c.location.x, Y: c.location.y });
                ctx.ordered.add(x.k);
                ctx.posts.delete(x.k);
                restedByUs.delete(x.k);
                goals.set(x.k, { march: ck, turn: Game.turn });
                joined.push(x);
            }
            if (joined.length === 0) {
                log.warn(`army: ${typeOf(c)} at ${where(c.location)} could pack none of ${members.length} for ${s.name}: the game offered not its tile (probe P-A6)`);
                continue;
            }
            wakeUnit(c);
            moveTo(c, s);
            ctx.ordered.add(ck);
            goals.set(ck, { post: `${s.x},${s.y}`, turn: Game.turn });
            marches.set(ck, { key, at: { x: s.x, y: s.y }, name: s.name, start: Game.turn, members: joined.map((x) => x.k), turns, walk });
            log.info(`army: ${typeOf(c)} at ${where(c.location)} packs ${joined.length} [${joined.map((x) => typeOf(x.u)).join(", ")}] and marches to ${s.name} at ${where(s)}: ${turns} turn(s) packed, +1 to unpack (walking ${walk.toFixed(1)} on average; probe P-A7)`);
            out.push({ key: "ARMY_MARCH", args: [nameOf(safe(() => GameInfo.Units.lookup(c.type), null)), joined.length, s.name] });
            break;
        }
    }
    if (marches.size > 0 && marchNoted !== Game.turn) {
        marchNoted = Game.turn;
        log.info(`army: marches [${[...marches].map(([ck, m]) => {
            const c = byKey.get(ck);
            return `${typeOf(c)} at ${where(c?.location)} -> ${m.name} ${where(m.at)} since T${m.start} (planned ${m.turns}t, walking ${m.walk.toFixed(1)})`;
        }).join("; ")}]`);
    }
    return out;
}

// ---- the vanguard's packed army and Overrun (after game 54) ----------------------------------------------------------

const RAPID_SIZE = 3;     // soldiers the vanguard keeps packed while a war or raids call for a quick answer...
const RAPID_DAMAGE = 20;  // ...each hurt less than this...
const RALLY_TURNS = 3;    // ...walking to it from at most this many turns away
const OVERRUN = "UNITCOMMAND_ARMY_OVERRUN";
let rapid = null;         // { ck, turn }: the vanguard with soldiers packed in its army this pass

/** The vanguard: the land commander of that role on the map, or null. */
function vanguardOf(units, ctx) {
    return landCommanders(units).find((u) => ctx.commanderRoles?.get(unitKey(u.id)) === "VANGUARD" && u.isOnMap !== false && !!u.location) ?? null;
}

/** The soldiers packed in this commander's army. */
function packedSoldiers(c, units) {
    return (units ?? []).filter((u) => u !== c && !u.isCommanderUnit && u.isOnMap === false && sameId(u.armyId, c.armyId)
        && isSoldier(safe(() => GameInfo.Units.lookup(u.type), null)));
}

/** A war at our door, a threatened settlement or raids lately: the vanguard's army stays packed for a quick answer. */
const rapidCalled = (ctx) => ctx.fronts.some((f) => f.atWar) || ctx.threats.length > 0 || raidedLately();

/**
 * Notes this pass's packed vanguard (before the defence plan: its army is neither split up nor unpacked at a quiet front),
 * only while rapidCalled: in peace an army packed at an age's start (Regroup) gives its soldiers as before.
 */
function noteRapid(units, ctx) {
    rapid = null;
    const v = vanguardOf(units, ctx);
    if (v && !marching(v) && rapidCalled(ctx) && packedSoldiers(v, units).length > 0) rapid = { ck: unitKey(v.id), turn: Game.turn };
}

/** Turns before a soldier packed in the vanguard's army stands at settlement `key`, the vanguard's post; null when it is not. */
function rapidTurns(u, key, units) {
    if (!rapid || rapid.turn !== Game.turn || goals.get(rapid.ck)?.post !== key) return null;
    const c = units.find((x) => unitKey(x.id) === rapid.ck);
    if (!c?.location || !sameId(u.armyId, c.armyId)) return null;
    const [x, y] = key.split(",").map(Number);
    if (plotDist(c.location, { x, y }) <= GUARD_RADIUS) return 1;
    const t = pathTurns(c, { x, y });
    return t === null ? null : t + 1;
}

/** A settlement of ours threatened on one of the last GENERAL.RAIDED_TURNS turns (raidHistory). */
function raidedLately() {
    const turn = safe(() => Game.turn, -1);
    return [...raidHistory.values()].some((list) => list.some((x) => turn - x < GENERAL.RAIDED_TURNS && x <= turn));
}

/**
 * Force March for an army going to a fight that cannot wait (a damaged centre, raiders close) with every packed soldier
 * healthy: +3 moves for some of their health, when the game offers it (a promotion's command). @returns true when sent
 */
function forceMarchIfUrgent(c, need, units) {
    const packed = packedSoldiers(c, units);
    if (packed.length === 0 || !(need?.damaged || Number(need?.close) > 0)) return false;
    if (packed.some((u) => (Number(u.Health?.damage) || 0) >= ESCAPE_DAMAGE)) return false;
    if (!safe(() => Game.UnitCommands.canStart(c.id, FORCE_MARCH, NO_TARGET, false), null)?.Success) return false;
    Game.UnitCommands.sendRequest(c.id, FORCE_MARCH, { ...NO_TARGET });
    log.info(`army: ${typeOf(c)} at ${where(c.location)} force-marches to ${need.settlement?.name ?? "?"} (${packed.length} packed)`);
    return true;
}

/**
 * The vanguard keeps a packed army (after game 54; the user: "packing units into commander and moving them that way to move
 * faster"): while a war is at our door or raids came lately, and it stands at no fight, the free soldiers the defence leaves
 * (healthy, at no front, on no errand) join its army up to RAPID_SIZE: one next to it at once (UNITCOMMAND_ADD_TO_ARMY: canStart
 * with no target lists the commanders' tiles, then {X, Y} of its tile), one within RALLY_TURNS walks next to it (goal
 * `{rally}`). Packed they travel at its speed (Mobility +1, terrain ignored; Force March to an urgent fight), count as coming
 * to its post (guardDetail), are neither split up by the defence nor unpacked at a quiet front, unpack at a threatened
 * settlement (unpackArmies) or at a hunt, strike the same turn (the hud's second strike: Initiative lets them move), and
 * overrun weaker units (commanderAttacks). Runs after the field operations, before the unit loop. @returns log entries
 */
function rallyVanguard(units, ctx) {
    const out = [];
    const v = vanguardOf(units, ctx);
    const ck = v ? unitKey(v.id) : null;
    const active = !!v && !marching(v) && !inCampaign(ck) && !inField(ck) && !ctx.ordered.has(ck) && !afloat(v)
        && (Number(v.Health?.damage) || 0) < ESCAPE_DAMAGE
        && rapidCalled(ctx)
        && !ctx.threats.some((t) => plotDist(v.location, t.settlement) <= GUARD_RADIUS);
    // Walkers of a rally no longer on are free again.
    for (const [k, g] of [...goals]) if (g?.rally !== undefined && (!active || g.rally !== ck)) goals.delete(k);
    if (!active) return out;
    const army = (ctx.armies ?? []).find((a) => a.cmdr === v);
    const packed = packedSoldiers(v, units);
    let room = Math.min(RAPID_SIZE, army?.capacity ?? ARMY_CAPACITY) - packed.length - (army?.incoming.length ?? 0);
    if (room <= 0) return out;
    const def = (u) => safe(() => GameInfo.Units.lookup(u.type), null);
    // Not a soldier the defence posted or its formation moves this pass (planFormations: a rally walker that stopped by a
    // threatened town is its guard there; the fight simulator's raids60 after game 60's packages merged: the formation's HOLD
    // onto an empty centre went unsent while the rally walked that Warrior on to the vanguard).
    const kept = (k) => ctx.ordered.has(k) || ctx.posts.has(k) || !!ctx.formation?.has(k);
    const walking = units.filter((u) => goals.get(unitKey(u.id))?.rally === ck && u.isOnMap !== false && !!u.location && !kept(unitKey(u.id)));
    const free = (ctx.supply ?? []).filter((c) => !kept(c.k) && !inField(c.k) && !inCampaign(c.k) && !c.packed && c.stage && !c.siege && c.atFront === undefined
        && (Number(c.u.Health?.damage) || 0) < RAPID_DAMAGE && !!c.u.location && !afloat(c.u)).map((c) => c.u);
    const cands = [...walking, ...free.filter((u) => !walking.includes(u))]
        .map((u) => ({ u, k: unitKey(u.id), melee: isMeleeGuard(def(u)), d: plotDist(u.location, v.location) }))
        .sort((a, b) => Number(b.melee) - Number(a.melee) || a.d - b.d);
    const at = safe(() => GameplayMap.getIndexFromXY(v.location.x, v.location.y), -1);
    const taken = new Set();
    const joined = [];
    const sent = [];
    for (const x of cands) {
        if (room <= 0) break;
        if (x.d <= 1) {
            const r = safe(() => Game.UnitCommands.canStart(x.u.id, "UNITCOMMAND_ADD_TO_ARMY", {}, false), null);
            if (!(r?.Plots ?? []).includes(at)) continue;
            wakeUnit(x.u);
            Game.UnitCommands.sendRequest(x.u.id, "UNITCOMMAND_ADD_TO_ARMY", { X: v.location.x, Y: v.location.y });
            ctx.ordered.add(x.k);
            restedByUs.delete(x.k);
            goals.delete(x.k);
            joined.push(x);
            room--;
            continue;
        }
        const spot = campaignSpot(x.u, v.location, 1, taken);
        const t = spot ? pathTurns(x.u, spot) : null;
        if (t === null || t > RALLY_TURNS || startsWar(x.u, spot)) continue;
        wakeUnit(x.u);
        if (!moveTo(x.u, spot)) continue;
        taken.add(`${spot.x},${spot.y}`);
        ctx.ordered.add(x.k);
        restedByUs.delete(x.k);
        goals.set(x.k, { rally: ck, turn: Game.turn });
        sent.push(`${typeOf(x.u)} ${where(x.u.location)} in ${t}t`);
        room--;
    }
    if (joined.length + sent.length > 0) {
        log.info(`army: the vanguard ${typeOf(v)} at ${where(v.location)} packs [${joined.map((x) => typeOf(x.u)).join(", ")}], called [${sent.join("; ")}]; ${packed.length} packed already (a ready army: after game 54)`);
    }
    if (joined.length > 0) out.push({ key: "VANGUARD_PACKS", args: [nameOf(def(v)), joined.length] });
    if (sent.length > 0) out.push({ key: "VANGUARD_RALLY", args: [nameOf(def(v)), sent.length] });
    return out;
}

/**
 * An army with soldiers packed in it overruns a weaker hostile unit (`UNITCOMMAND_ARMY_OVERRUN`, "Destroy a weaker Unit without
 * needing to Deploy stacked Units": canStart with no target gives the Plots, then {X, Y}, as interface-mode-army-overrun.js
 * sends it; after game 54): no soldier risked, a fight for the general's XP. It ends on that tile, so only where no other
 * hostile land soldier stands next to it and no ship reaches it; the one nearest our settlements first, the most damaged on a
 * tie. @returns a log entry or null
 */
async function overrunRaider(cmdr, def, units) {
    const packed = packedSoldiers(cmdr, units);
    if (packed.length === 0) return null;
    const ours = ourCentres();
    let best = null;
    for (const idx of safe(() => Game.UnitCommands.canStart(cmdr.id, OVERRUN, {}, false), null)?.Plots ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || startsWar(cmdr, loc)) continue;
        const enemy = hostileSeenAt(loc);
        if (!enemy) continue;
        if (hostilesAround(loc, 1).some((h) => !same(h.at, loc) && h.def?.Domain === "DOMAIN_LAND") || shipsReaching(loc).length > 0) continue;
        const d = Math.min(Infinity, ...ours.map((c) => plotDist(c, loc)));
        const score = -d * 100 + damageAt(loc);
        if (!best || score > best.score) best = { loc, enemy, score };
    }
    if (!best) return null;
    Game.UnitCommands.sendRequest(cmdr.id, OVERRUN, { X: best.loc.x, Y: best.loc.y });
    log.info(`army: ${typeOf(cmdr)} at ${where(cmdr.location)} overruns ${typeOf(best.enemy)} at ${where(best.loc)} with ${packed.length} packed`);
    await untilEvent("Combat", COMBAT_WAIT_MS);
    const theirs = safe(() => GameInfo.Units.lookup(best.enemy.type), null);
    return { key: "ARMY_OVERRUN", args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.loc.x, best.loc.y] };
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
const HOLD_HURT_MAX = 70; // a melee unit hurt less than this may still step onto an empty, damaged centre next to it

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
        // A hurt melee member next to an empty, damaged centre may step onto it, and only onto it (research/41 §3: in all 11
        // `formation:` lines of games 37-47 with an empty damaged centre, a hurt melee unit stood next to it).
        if (t.damaged && !members.some((m) => same(m.at, s)) && roomForSoldier(s)) {
            for (const m of members) {
                if (m.role === "melee" && m.still === "hurt" && (Number(m.u.Health?.damage) || 0) < HOLD_HURT_MAX && dist(m.at, s) === 1
                    && m.u.canMove !== false && m.u.hasMoved !== true && !afloat(m.u)) {
                    m.still = null;
                    m.onlyCentre = true;
                }
            }
        }
        const shipsHere = hostiles.filter((h) => h.def?.Domain === "DOMAIN_SEA").map((h) => safe(() => GameInfo.Unit_Stats.lookup(h.def.UnitType), null)).filter(Boolean);
        const defs = new Map(members.map((m) => [m.key, m.def]));
        const threatMemo = new Map();
        // Ships in reach of a tile that this member (or the commander: its key is not a member's) does not out-gun.
        const shipCount = (k, loc) => {
            const memo = `${k}|${loc.x},${loc.y}`;
            if (!threatMemo.has(memo)) threatMemo.set(memo, shipThreat(loc, defs.get(k) ?? null).length);
            return threatMemo.get(memo);
        };
        const f = {
            centre: { x: s.x, y: s.y }, damaged: !!t.damaged, land, targets: hostiles.map((h) => ({ x: h.at.x, y: h.at.y, ship: h.def?.Domain === "DOMAIN_SEA" })),
            sectors: sectorsOf(land, dist), members, dist, defence: terrainDefence,
            outGuns: (k) => fightsShips(safe(() => GameInfo.Unit_Stats.lookup(defs.get(k)?.UnitType), null), shipsHere),
            shipThreat: hostileShips().length > 0 ? shipCount : null,
        };
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

const ROTATE_DAMAGE = 40; // a formation member hurt this much swaps out for a fresh soldier (research/41 Phase 4)...
const ROTATE_FRESH = 20;  // ...one hurt less than this
const ROTATE_MAX = 3;     // swaps a pass

/**
 * Hurt soldiers swap out at a threatened settlement (research/41 Phase 4, built after game 54; the user, 21 October: "hurt
 * units swap out"): a formation member hurt ROTATE_DAMAGE or more gives its tile to a free soldier of its role hurt less than
 * ROTATE_FRESH. One next to it swaps places with it (UNITOPERATION_SWAP_UNITS {X, Y}, as the game's own move onto our unit
 * sends it: world-input.js); else the hurt one first withdraws to a tile it reaches out of every hostile unit's reach (or into
 * one of our centres), and the fresh one takes its tile in the same pass. The centre's holder swaps only for a fresh melee
 * unit taking the centre. With no fresh soldier in reach the hurt one stays (the escape still takes it in danger). Game 54:
 * 57 `formation:` stays were "hurt" while free soldiers stood within reach. Fills ctx.swaps. @returns log entries
 */
function rotateFront(units, ctx) {
    const out = [];
    ctx.swaps = new Map();
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const NONE = globalThis.UnitOperationMoveModifiers?.NONE ?? 0;
    for (const [key, form] of ctx.formations ?? []) {
        for (const m of form.f.members) {
            if (out.length >= ROTATE_MAX) return out;
            const u = m.u;
            // A member on the plague leaves it by itself (leaveHazard), and no fresh soldier is swapped onto it (game 60:
            // Астрахань's formation listed its Spearman and Slinger, hurt 65 and 53, on infected tiles; a swap bypasses
            // moveTo's hazard guard).
            if (hazardAt(m.at) > 0) {
                m.still = "plague";
                continue;
            }
            if ((Number(u.Health?.damage) || 0) < ROTATE_DAMAGE || ctx.ordered.has(m.key) || ctx.formation.has(m.key)) continue;
            if (u.canMove === false || u.hasMoved === true || afloat(u) || resting(u) && !restedByUs.has(m.key)) continue;
            const melee = m.role === "melee";
            const fresh = (ctx.supply ?? [])
                .filter((c) => !ctx.posts.has(c.k) && !ctx.ordered.has(c.k) && !c.packed && c.stage && !!c.ranged === !melee && !c.siege
                    && (Number(c.u.Health?.damage) || 0) < ROTATE_FRESH && !!c.u.location && !(hazardAt(c.u.location) > 0))
                .map((c) => ({ c, d: dist(c.u.location, m.at) }))
                .filter((x) => x.d <= REINFORCE_RADIUS + 1)
                .sort((a, b) => a.d - b.d);
            for (const { c, d } of fresh.slice(0, REINFORCE_PICKS)) {
                const name = (x) => safe(() => GameInfo.Units.lookup(x.type)?.UnitType, "?");
                let how = null;
                // Next to it: the two change places in one order.
                const args = { X: m.at.x, Y: m.at.y, Modifiers: NONE };
                if (d === 1 && safe(() => Game.UnitOperations.canStart(c.u.id, "UNITOPERATION_SWAP_UNITS", args, false), null)?.Success) {
                    wakeUnit(u);
                    wakeUnit(c.u);
                    Game.UnitOperations.sendRequest(c.u.id, "UNITOPERATION_SWAP_UNITS", args);
                    how = `${name(u)} ${where(m.at)} <-> ${name(c.u)} ${where(c.u.location)} (swapped)`;
                } else {
                    const t = pathTurns(c.u, m.at);
                    if (t === null || t > 1 || startsWar(c.u, m.at)) continue;
                    const back = withdrawTile(u, m.def, ctx, m.at);
                    if (!back) continue;
                    wakeUnit(u);
                    if (!moveTo(u, back)) continue;
                    ctx.stepTo.add(`${back.x},${back.y}`);
                    wakeUnit(c.u);
                    moveTo(c.u, m.at);
                    how = `${name(u)} ${where(m.at)} -> ${where(back)}; ${name(c.u)} ${where(c.u.location)} -> ${where(m.at)}`;
                }
                ctx.ordered.add(m.key);
                ctx.ordered.add(c.k);
                restedByUs.delete(m.key);
                restedByUs.delete(c.k);
                ctx.posts.set(c.k, { key, loc: m.at, turns: 1, rotate: true, unit: c.def?.UnitType ?? "?", at: { x: c.u.location.x, y: c.u.location.y }, sent: true });
                const list = ctx.swaps.get(key) ?? [];
                list.push(how);
                ctx.swaps.set(key, list);
                out.push({ key: "FORMATION_SWAP", args: [nameOf(m.def), nameOf(c.def), form.name] });
                break;
            }
        }
    }
    return out;
}

/** The tile a hurt soldier withdraws to this turn: out of every hostile unit's and ship's reach, else one of our centres with room; the nearest. */
function withdrawTile(u, def, ctx, from) {
    let best = null;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(from.x, from.y, 2), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, from) || ctx.stepTo.has(`${loc.x},${loc.y}`) || !roomFor(def, loc) || onWater(loc) || hazardAt(loc) > 0) continue;
        if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
        const out = hostilesInReach(loc).length + shipsReaching(loc).length === 0;
        const centre = settlementAt(loc) && districtHolds(loc);
        if (!out && !centre) continue;
        const t = pathTurns(u, loc);
        if (t === null || t > 1 || startsWar(u, loc)) continue;
        const score = (out ? 0 : 10) + safe(() => GameplayMap.getPlotDistance(from.x, from.y, loc.x, loc.y), 9);
        if (!best || score < best.score) best = { loc, score };
    }
    return best?.loc ?? null;
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
 * Merit) covers the most of the formation's soldiers (their tiles after this pass's moves), never next to a land raider
 * unless under a healthy soldier of ours (research/42 A2: in the front line, where the fights are), on our land or
 * nobody's, with room for a commander (a soldier may share it), reached this turn; it stays put unless that covers
 * FORM.COMMANDER_GAIN more. @returns a log entry or null (it stays: the skip step skips its turn)
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
    // The soldiers about to fight (next to a land raider, or a ranged one with a target in range): its XP comes from their
    // fights (research/41 §4D).
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const fighters = [...form.at.entries()].filter(([k, loc]) => {
        const m = form.f.members.find((x) => x.key === k);
        return !!m && (form.f.land.some((h) => dist(loc, h) === 1) || (m.role === "ranged" && form.f.targets.some((h) => dist(loc, h) <= m.range)));
    }).map(([, loc]) => loc);
    // A tile a healthy soldier of ours holds after this pass's moves: the commander stands under it (research/42 A2). Not
    // under a hurt one off the garrison: it withdraws from raiders near in this same pass (defend's stepAway; the fight
    // simulator's raids60 scene: the general went under a Warrior with 17 damage that withdrew, and an Archer caught it
    // alone, in 4 of 10 seeds).
    const units = ctx.ourUnits ?? [];
    const stays = (s) => {
        const damage = Number(s.Health?.damage) || 0;
        return damage === 0 || (damage < SHIELD_DAMAGE && !!ctx.garrison?.has(unitKey(s.id)));
    };
    const healthy = (k) => {
        const s = units.find((x) => unitKey(x.id) === k);
        return !!s && stays(s);
    };
    const shielded = (loc) => [...form.at.entries()].some(([k, at]) => same(at, loc) && healthy(k))
        || units.some((s) => s.location && same(s.location, loc) && !form.at.has(unitKey(s.id)) && shieldAt(loc, [s]) && stays(s));
    // Only where it may stand (commanderSafeAt, the rule its escape and its walk share): under such a soldier, on a centre that
    // holds, else out of every hostile unit's reach. Before, a tile merely not next to a land raider would do, and an Archer
    // two tiles off caught it there (raids60).
    const safeTiles = tiles.filter((t) => shielded(t) || commanderSafeAt(t, [], ctx));
    const pick = held ? null : commanderTile(form.f, { at: { x: u.location.x, y: u.location.y }, radius, key: unitKey(u.id) }, [...form.at.values()], safeTiles, reach, FORM.COMMANDER_GAIN, fighters, shielded);
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
        const stay = f.members.filter((m) => !moved.has(m.key)).map((m) => `${m.def?.UnitType ?? "?"} at ${at(m.at)} (${m.still === "plague" ? "plague" : same(m.at, f.centre) ? "on the centre" : m.still ?? "no better post"})`);
        const c = form.commander;
        const parts = [
            `sectors ${f.sectors.length} [${f.sectors.map((sec) => `${sec.length} near ${at(sec[0])}`).join("; ")}]${f.targets.length > f.land.length ? `, ships ${f.targets.length - f.land.length}` : ""}`,
            `centre ${holder ? `held by ${holder.def?.UnitType ?? "?"}` : "not held"}`,
            `moves [${moves.map((m) => `${m.unit} ${at(m.from)} -> ${at(m.loc)} ${m.role} +${Math.round(m.gain)}${m.sent ? "" : " NOT SENT"}`).join("; ")}]`,
            `stay [${stay.join("; ")}]`,
        ];
        if (c) parts.push(`commander ${c.unit} at ${at(c.at)}${c.to ? ` -> ${at(c.to)} +${Math.round(c.gain)}${c.sent ? "" : " NOT SENT"}` : c.held ? " stays (moved lately)" : " stays"}`);
        const swaps = ctx.swaps?.get(key) ?? [];
        if (swaps.length > 0) parts.push(`swaps [${swaps.join("; ")}]`);
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
            .map((p) => `${p.unit} from ${p.at.x},${p.at.y} in ${p.turns}t${p.resting ? " (woken)" : ""}${p.packed ? " (from an army)" : ""}${p.reinforce ? " (reinforcing the army there)" : ""}${p.from ? ` (spare at ${p.from})` : ""}${p.rotate ? " (swapping in for a hurt one)" : ""}${p.sent ? "" : " NOT SENT"}`);
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
        } else parts.push(`war front (${t.leader ?? "?"}${t.army ? `, ${t.army} of their soldiers near${Number.isFinite(t.seen) && t.seen !== t.army ? ` lately, ${t.seen} now` : ""}` : ""}${t.atWar ? ", at war" : ""}): melee ${frontGuards(t, units)} of ${frontGuardsPosted(t, ctx.frontShare)}`);
        parts.push(`sent [${sent.join("; ")}]`);
        const notSent = ctx.notSent?.get(key) ?? [];
        if (notSent.length > 0) parts.push(`not sent [${notSent.join("; ")}]`);
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
    const all = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    let roles = null; // the generals' roles (research/41 Phase 2), read once
    for (const u of all) {
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
        // A land commander takes its role's order (research/41 Phase 2): the vanguard Mobility, Initiative, Quartermaster,
        // Regiments and Merit first; the bastion the defensive order (a campaign's leader is the vanguard unless a veteran
        // defender: commanderRoles).
        const role = u.isCommanderUnit && isLandCommander(def) ? (roles ??= commanderRoles(all)).get(unitKey(u.id)) ?? "BASTION" : null;
        const prefs = role ? promotionOrder(role, PROMOTION_PREFERENCE) : PROMOTION_PREFERENCE;
        const commendations = role ? commendationOrder(role) : PROMOTION_PREFERENCE;
        const rank = (o, i) => (isCommendation(o.promotion)
            ? 100000 + (commendations.includes(o.promotion) ? commendations.indexOf(o.promotion) : 1000 + i)
            : (prefs.includes(o.promotion) ? prefs.indexOf(o.promotion) : 1000 + i));
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

// ---- campaigns (research/37 Phase 7, «Наступление», off by default) ------------------------------------------------

let campaign = null;              // the running campaign, one at a time: { id, key, target, enemy, leader, started, stage, staging, members (unit keys), commander, assaultTurn, progressTurn, last }
const campaignRetry = new Map();  // target "x,y" -> the turn it may be tried again
let campaignNoted = -1;           // the turn UI.log described the campaign, or why none started
let campaignSeq = 0;

function resetCampaign() {
    campaign = null;
    campaignRetry.clear();
    campaignNoted = -1;
}

/** The running campaign, a copy (the hud, tests). */
export function campaignState() {
    return campaign ? { ...campaign, members: [...campaign.members] } : null;
}

/** Peace with this leader now ("SEEK"), or continue briefly ("CONTINUE": core/xpl-campaign.js peaceIntent). */
export function peaceIntentFor(enemy) {
    return peaceIntent(campaign, enemy, Game.turn);
}

const leaderOf = (id) => safe(() => Locale.compose(Players.get(id).leaderName), null) ?? safe(() => Locale.compose(Players.get(id).civilizationName), String(id));

/**
 * Our settlements another player holds while we are at war with it: city.originalOwner is us (the game's own record, as
 * its city banners and peace deal screen read it; research/37 §9D: never a name). @returns [{ x, y, name, owner, cityId }]
 */
function lostSettlements() {
    const me = safe(() => Players.get(pid()), null);
    const out = [];
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p || p.id === pid() || !safe(() => me.Diplomacy.isAtWarWith(p.id), false)) continue;
        for (const c of safe(() => p.Cities.getCities(), []) ?? []) {
            if (c?.originalOwner !== pid() || !c.location) continue;
            out.push({ x: c.location.x, y: c.location.y, name: safe(() => Locale.compose(c.name), "?"), owner: p.id, cityId: c.id });
        }
    }
    return out;
}

/**
 * The tiles to take (Civilopedia 210, 1915): the centre and every district of the settlement with health to lose (walls,
 * fortified wonders; other urban districts stand at 0 and fall with it), each with its health (Players.Districts of its
 * owner, as the game's district health bars read it) and whether we hold it (district.controllingPlayer).
 * @returns { tiles: [{ x, y, health, max, ours, centre }], health (left in all), taken (held by us) }
 */
function districtsToTake(t) {
    const pd = safe(() => Players.Districts.get(t.owner), null);
    const city = safe(() => Cities.get(t.cityId), null);
    const tiles = [];
    const add = (loc, d) => {
        if (!loc || tiles.some((x) => same(x, loc))) return;
        const centre = same(loc, t);
        const max = Number(safe(() => pd.getDistrictMaxHealth({ x: loc.x, y: loc.y }), 0)) || 0;
        if (!centre && !(max > 0)) return;
        const health = Math.max(0, Number(safe(() => pd.getDistrictHealth({ x: loc.x, y: loc.y }), 0)) || 0);
        tiles.push({ x: loc.x, y: loc.y, health, max, ours: d ? d.controllingPlayer === pid() : false, centre });
    };
    for (const id of safe(() => city.Districts.getIds(), []) ?? []) {
        const d = safe(() => Districts.get(id), null);
        add(d?.location, d);
    }
    if (!tiles.some((x) => x.centre)) add({ x: t.x, y: t.y }, null);
    return { tiles, health: tiles.reduce((a, x) => a + (x.ours ? 0 : x.health), 0), taken: tiles.filter((x) => x.ours).length };
}

/** Our settlements' centres. */
const ourCentres = () => (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location).filter(Boolean);
const tilesAt = (loc, r) => (safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, r), []) ?? []).map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter(Boolean);
const plotDist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);

/** A land tile a soldier of ours may stand on: no water or river, passable, no hazard, nobody else's unit, none of our soldiers but `u`. */
function campaignTile(loc, u = null) {
    if (onWater(loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || hazardAt(loc) > 0) return false;
    for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
        const other = safe(() => Units.get(id), null);
        if (!other) continue;
        if (other.owner !== pid()) return false;
        if (u && sameId(other.id, u.id)) continue;
        if (isSoldier(safe(() => GameInfo.Units.lookup(other.type), null))) return false;
    }
    return true;
}

/**
 * The staging area: a free land tile CAMPAIGN.STAGE_DIST from the target's centre, with no hostile soldier next to it,
 * nearest our own settlements (our land first, then nobody's). @returns { x, y } or null
 */
function stagingTile(t, dist = CAMPAIGN.STAGE_DIST) {
    const ours = ourCentres();
    let best = null;
    for (const loc of tilesAt(t, dist)) {
        if (plotDist(loc, t) !== dist || !campaignTile(loc) || hostilesAround(loc, 1).length > 0) continue;
        const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
        const home = Math.min(Infinity, ...ours.map((c) => plotDist(c, loc)));
        const score = home * 10 + (owner === pid() ? 0 : owner === -1 || owner === null ? 3 : 6);
        if (!best || score < best.score) best = { loc, score };
    }
    return best?.loc ?? null;
}

/** A member's role: a melee soldier takes districts; ranged and siege units shoot them. */
const campaignRanged = (def) => isRangedGuard(def) || isSiegeGuard(def);
const unitRange = (def) => Math.max(1, Number(safe(() => GameInfo.Unit_Stats.lookup(def.UnitType)?.Range, 0)) || 2);

/** Hostile soldiers near the target and their best strength. */
function enemiesNear(t) {
    const h = hostilesAround(t, CAMPAIGN.ENEMY_RADIUS).filter((x) => x.def && x.def.Domain === "DOMAIN_LAND");
    return { n: h.length, best: Math.max(0, ...h.map((x) => unitStrength(x.def))) };
}

/**
 * Our settlements are safe enough to send soldiers away: every threatened one guarded or guards sent (a damaged centre too:
 * the defence plan sends the free soldiers there first, and an operation takes only those it left free). Game 53
 * (research/42 B4): a damaged centre anywhere blocked everything, so Китион was never retaken (`a settlement of ours needs
 * its soldiers`) while 15-26 soldiers stood free. Guards on their way count when they arrive within guardDeadline + 1 (W3,
 * game 60: Самара's «melee 1 + 2 coming of 3» kept every hunt home A82-A91; the operations' review runs before the defence
 * plan, when this pass's posts are none yet).
 */
function homeUnsafe(units, ctx) {
    for (const t of ctx.threats) {
        const key = `${t.settlement.x},${t.settlement.y}`;
        const d = safe(() => guardDetail(t, units, ctx.threats), null) ?? { present: [], incoming: [] };
        const counted = new Set([...d.present, ...d.incoming.filter((x) => x.turns <= guardDeadline(t) + 1).map((x) => x.u)].map((u) => unitKey(u.id)));
        const sent = [...(ctx.posts?.entries() ?? [])].filter(([k, p]) => p.key === key && !p.ranged && !counted.has(k)).length;
        if (counted.size + sent < guardsWanted(t)) return true;
    }
    return false;
}

/** Ends the running campaign: its members and commander go back to the other orders. */
function endCampaign(reason, out) {
    const c = campaign;
    if (!c) return;
    for (const [k, g] of [...goals.entries()]) if (g?.campaign === c.key) goals.delete(k);
    campaign = null;
    if (reason !== "DONE") campaignRetry.set(c.key, Game.turn + CAMPAIGN.RETRY_TURNS);
    log.warn(`campaign: ${c.target.name} of ${c.leader}: ${reason} after ${Game.turn - c.started} turn(s) (${c.stage})`);
    if (reason === "DONE") out.push({ key: "CAMPAIGN_DONE", args: [c.target.name] });
    else out.push({ key: "CAMPAIGN_ABORTED", args: [c.target.name, safe(() => Locale.compose(`LOC_XPL_AP_CAMPAIGN_WHY_${reason}`), reason)] });
}

/**
 * The running campaign's review: its members (gone, or hurt CAMPAIGN.HURT: out), progress (less health in the districts
 * to take, or more of them ours), its end (core campaignEnd), and the assault once gathered (readyToAssault).
 */
function reviewCampaign(units, ctx, options, out) {
    if (!campaign) return;
    const c = campaign;
    const byKey = new Map(units.map((u) => [unitKey(u.id), u]));
    for (const k of [...c.members]) {
        const u = byKey.get(k);
        if (!u || (Number(u.Health?.damage) || 0) >= CAMPAIGN.HURT) {
            c.members.delete(k);
            if (goals.get(k)?.campaign === c.key) goals.delete(k);
        }
    }
    if (c.commander && !byKey.has(c.commander)) c.commander = null;
    const ours = ourCentres().some((l) => same(l, c.target));
    let theirs = (safe(() => Players.get(c.enemy).Cities.getCities(), []) ?? []).some((x) => same(x.location, c.target));
    if (!theirs && !ours) {
        // Another enemy took it from them: still ours by origin, so the campaign follows it (research/37 §9F: a target
        // survives an owner change).
        const now = lostSettlements().find((t) => same(t, c.target));
        if (now) {
            log.warn(`campaign: ${c.target.name} passed from ${c.leader} to ${leaderOf(now.owner)}; the campaign goes on`);
            c.enemy = now.owner;
            c.leader = leaderOf(now.owner);
            c.target = { ...c.target, owner: now.owner, cityId: now.cityId };
            theirs = true;
        }
    }
    const atWar = !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(c.enemy), false);
    const now = theirs ? districtsToTake(c.target) : null;
    if (now && progressed(c.last, now)) c.progressTurn = Game.turn;
    if (now) c.last = { health: now.health, taken: now.taken };
    const members = [...c.members].map((k) => byKey.get(k)).filter(Boolean);
    const melee = members.filter((u) => isMeleeGuard(safe(() => GameInfo.Units.lookup(u.type), null))).length;
    const end = campaignEnd(c, {
        turn: Game.turn, ours, theirs, atWar, offensive: !!options.offensive, victoryNear: !!options.victoryNear,
        melee, units: members.length, homeUnsafe: false,
    });
    if (end) {
        endCampaign(end, out);
        return;
    }
    if (c.stage === "GATHER") {
        const arrived = members.filter((u) => u.isOnMap !== false && u.location && plotDist(u.location, c.staging) <= CAMPAIGN.NEAR_STAGE);
        const meleeArrived = arrived.filter((u) => isMeleeGuard(safe(() => GameInfo.Units.lookup(u.type), null))).length;
        if (readyToAssault(c, { turn: Game.turn, arrived: arrived.length, members: members.length, meleeArrived })) {
            c.stage = "ASSAULT";
            c.assaultTurn = Game.turn;
            c.progressTurn = Game.turn;
            out.push({ key: "CAMPAIGN_ASSAULT", args: [c.target.name, arrived.length] });
        }
    }
}

/**
 * A campaign starts (research/37 §9C-D) for the nearest settlement of ours an enemy holds within CAMPAIGN.REACH of one of
 * ours, when our own are safe (homeUnsafe), no victory of ours is near, and the soldiers defence leaves free (its supply
 * less its posts: not a front's guard, not the player's own fortified ones, not packed) that reach the staging area within
 * GATHER_TURNS are enough (core forceEnough); a land commander not posted at a threatened settlement leads it.
 */
function startCampaign(units, ctx, options, out) {
    const ours = ourCentres();
    const why = [];
    const targets = lostSettlements()
        .map((t) => ({ t, d: Math.min(Infinity, ...ours.map((c) => plotDist(c, t))) }))
        .filter(({ t, d }) => {
            if (d > CAMPAIGN.REACH) { why.push(`${t.name} ${d} tiles away`); return false; }
            const retry = campaignRetry.get(`${t.x},${t.y}`);
            if (retry !== undefined && Game.turn < retry) { why.push(`${t.name} again on turn ${retry}`); return false; }
            return true;
        })
        .sort((a, b) => a.d - b.d);
    const note = (text) => {
        if (campaignNoted === Game.turn) return;
        campaignNoted = Game.turn;
        log.warn(`campaign: none: ${text}`);
    };
    if (targets.length === 0) {
        if (why.length > 0) note(why.join("; "));
        return;
    }
    const t = targets[0].t;
    const leader = leaderOf(t.owner);
    if (options.victoryNear) return note(`${t.name} of ${leader}: a victory of ours is near`);
    if (homeUnsafe(units, ctx)) return note(`${t.name} of ${leader}: a settlement of ours needs its soldiers`);
    const staging = stagingTile(t);
    if (!staging) return note(`${t.name} of ${leader}: no staging tile ${CAMPAIGN.STAGE_DIST} tiles from it`);
    const free = (ctx.supply ?? []).filter((c) => !ctx.posts.has(c.k) && !c.packed && c.stage && c.atFront === undefined && c.from === undefined
        && (Number(c.u.Health?.damage) || 0) < ESCAPE_DAMAGE)
        .map((c) => ({ ...c, turns: pathTurns(c.u, staging) }))
        .filter((c) => c.turns !== null && c.turns <= CAMPAIGN.GATHER_TURNS)
        .sort((a, b) => a.turns - b.turns);
    const melee = free.filter((c) => !c.ranged).slice(0, CAMPAIGN.MAX_MEMBERS - Math.min(2, free.filter((x) => x.ranged).length));
    // Siege units first among the shooters (Bombard: strong against districts, Civilopedia 1936).
    const shooters = free.filter((c) => c.ranged).sort((a, b) => Number(b.siege) - Number(a.siege) || a.turns - b.turns)
        .slice(0, Math.max(0, CAMPAIGN.MAX_MEMBERS - melee.length));
    const picked = [...melee, ...shooters];
    const enemy = enemiesNear(t);
    const force = forceEnough({
        melee: melee.length, units: picked.length, enemies: enemy.n,
        ourBest: Math.max(0, ...picked.map((c) => unitStrength(c.def))), theirBest: enemy.best,
    });
    if (!force.ok) return note(`${t.name} of ${leader}: not enough force (${force.why}; ${free.length} free within ${CAMPAIGN.GATHER_TURNS} turns)`);
    const key = `${t.x},${t.y}`;
    campaign = {
        id: ++campaignSeq, key, target: t, enemy: t.owner, leader, started: Game.turn, stage: "GATHER", staging,
        members: new Set(picked.map((c) => c.k)), commander: null, assaultTurn: null, progressTurn: Game.turn, last: null,
    };
    for (const c of picked) goals.set(c.k, { campaign: key, turn: Game.turn });
    // The commander: a land commander not posted at a threatened settlement, the nearest to the staging area.
    const threatened = new Set(ctx.threats.map((x) => `${x.settlement.x},${x.settlement.y}`));
    const cmdr = units.filter((u) => u.isCommanderUnit && u.isOnMap !== false && u.location && isLandCommander(safe(() => GameInfo.Units.lookup(u.type), null))
        && !threatened.has(goals.get(unitKey(u.id))?.post ?? "") && !ctx.ordered.has(unitKey(u.id)))
        .map((u) => ({ u, turns: pathTurns(u, staging) })).filter((x) => x.turns !== null && x.turns <= CAMPAIGN.GATHER_TURNS)
        .sort((a, b) => a.turns - b.turns)[0];
    if (cmdr) {
        campaign.commander = unitKey(cmdr.u.id);
        goals.set(campaign.commander, { campaign: key, turn: Game.turn });
    }
    const last = districtsToTake(t);
    campaign.last = { health: last.health, taken: last.taken };
    log.warn(`campaign: ${t.name} of ${leader} at ${t.x},${t.y}: started with ${picked.length} [${picked.map((c) => `${c.def.UnitType} in ${c.turns}t`).join(", ")}], staging ${where(staging)}, enemies near ${enemy.n} (best ${enemy.best}), commander ${cmdr ? `${typeOf(cmdr.u)} in ${cmdr.turns}t` : "none"}`);
    out.push({ key: "CAMPAIGN_STARTED", args: [t.name, leader, picked.length] });
}

/** A free tile for a member: within `r` of `at`, the nearest to the member (reserved for this pass). */
function campaignSpot(u, at, r, taken, accept = () => true) {
    let best = null;
    for (const loc of tilesAt(at, r)) {
        const k = `${loc.x},${loc.y}`;
        if (taken.has(k) || !accept(loc) || !campaignTile(loc, u)) continue;
        const d = plotDist(u.location, loc);
        if (!best || d < best.d) best = { loc, d };
    }
    return best?.loc ?? null;
}

/**
 * The members' moves this pass (sent before the unit loop, like the naval guards: one order per unit). Gathering: each
 * to a free tile next to the staging tile. The assault: a melee member next to a district still to take (the weakest
 * first), a ranged one within its range of one (as far back as that allows, not next to a hostile soldier when it can);
 * the commander at the staging tile, then within 2 of the centre where its radius covers the most members. A member
 * already where it should be stays (the skip step skips it); a hurt one (ESCAPE_DAMAGE) gets the other orders (escape,
 * heal). @returns log entries
 */
function moveCampaign(units, ctx) {
    const out = [];
    const c = campaign;
    if (!c) return out;
    const A = globalThis.UnitActivityTypes;
    const taken = new Set();
    const todo = c.stage === "ASSAULT" ? districtsToTake(c.target).tiles.filter((x) => !x.ours) : [];
    const standing = todo.filter((x) => x.health > 0);
    const move = (u, def, loc, key) => {
        if (same(u.location, loc)) return;
        wakeUnit(u);
        if (!moveTo(u, loc)) return;
        taken.add(`${loc.x},${loc.y}`);
        ctx.ordered.add(unitKey(u.id));
        out.push({ key, args: [nameOf(def), c.target.name] });
    };
    for (const u of units) {
        const k = unitKey(u.id);
        if (!c.members.has(k) || ctx.ordered.has(k) || ctx.leave?.has(k) || u.isOnMap === false || !u.location) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || (Number(u.Health?.damage) || 0) >= ESCAPE_DAMAGE || u.canMove === false || u.hasMoved === true) continue;
        if (A && u.activityType === A.HEAL) continue;
        if (c.stage === "GATHER") {
            // Gathered, it waits there; not on the plague (the unit loop leaves a member to its campaign: game 60).
            if (plotDist(u.location, c.staging) <= CAMPAIGN.NEAR_STAGE && !(hazardAt(u.location) > 0)) continue;
            const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
            if (A && u.activityType === A.OPERATION && dest && plotDist(dest, c.staging) <= 1) continue;
            const loc = campaignSpot(u, c.staging, 1, taken);
            if (loc) move(u, def, loc, "CAMPAIGN_GATHER");
            continue;
        }
        if (campaignRanged(def)) {
            const range = unitRange(def);
            if (standing.some((x) => plotDist(u.location, x) <= range)) continue;
            const aim = [...standing].sort((a, b) => a.health - b.health)[0] ?? todo[0];
            if (!aim) continue;
            const safeSpot = (loc) => plotDist(loc, aim) <= range && plotDist(loc, aim) >= Math.min(range, 2) && hostilesAround(loc, 1).length === 0;
            const loc = campaignSpot(u, aim, range, taken, safeSpot) ?? campaignSpot(u, aim, range, taken, (l) => plotDist(l, aim) <= range);
            if (loc) move(u, def, loc, "CAMPAIGN_ADVANCE");
            continue;
        }
        if (todo.some((x) => plotDist(u.location, x) === 1)) continue;
        const aim = [...todo].sort((a, b) => a.health - b.health || plotDist(u.location, a) - plotDist(u.location, b))[0];
        if (!aim) continue;
        const loc = campaignSpot(u, aim, 1, taken, (l) => plotDist(l, aim) === 1 && !todo.some((x) => same(x, l)));
        if (loc) move(u, def, loc, "CAMPAIGN_ADVANCE");
    }
    // The commander: the staging tile while gathering; in the assault the tile within 2 of the centre where its radius (1)
    // covers the most members, never next to a hostile soldier.
    const cmdr = c.commander ? units.find((u) => unitKey(u.id) === c.commander) : null;
    if (cmdr && cmdr.isOnMap !== false && cmdr.location && !ctx.ordered.has(c.commander) && readyForOrders(cmdr)) {
        const def = safe(() => GameInfo.Units.lookup(cmdr.type), null);
        let loc = null;
        if (c.stage === "GATHER") loc = plotDist(cmdr.location, c.staging) <= 1 ? null : campaignSpot(cmdr, c.staging, 1, taken, () => true);
        else {
            const members = units.filter((u) => c.members.has(unitKey(u.id)) && u.location);
            let best = null;
            for (const l of tilesAt(c.target, 2)) {
                if (plotDist(l, c.target) < 2 || taken.has(`${l.x},${l.y}`) || hostilesAround(l, 1).length > 0) continue;
                if (onWater(l) || safe(() => GameplayMap.isImpassable(l.x, l.y), false) || hazardAt(l) > 0) continue;
                if ((safe(() => MapUnits.getUnits(l.x, l.y), []) ?? []).some((id) => safe(() => Units.get(id), null)?.owner !== pid())) continue;
                const covered = members.filter((u) => plotDist(u.location, l) <= 1).length;
                const score = covered * 10 - plotDist(cmdr.location, l);
                if (!best || score > best.score) best = { l, score };
            }
            loc = best && !same(best.l, cmdr.location) ? best.l : null;
        }
        if (loc && def) move(cmdr, def, loc, "CAMPAIGN_COMMANDER");
    }
    return out;
}

/** UI.log once a turn: the campaign, its members, the districts to take and its commander's experience. */
function logCampaign(units) {
    const c = campaign;
    if (!c || campaignNoted === Game.turn) return;
    campaignNoted = Game.turn;
    const byKey = new Map(units.map((u) => [unitKey(u.id), u]));
    const members = [...c.members].map((k) => byKey.get(k)).filter(Boolean);
    const d = districtsToTake(c.target);
    const cmdr = c.commander ? byKey.get(c.commander) : null;
    const xp = cmdr?.Experience ? ` XP ${cmdr.Experience.experiencePoints ?? "?"}/${cmdr.Experience.experienceToNextLevel ?? "?"}` : "";
    const enemy = enemiesNear(c.target);
    log.warn(`campaign: ${c.stage} ${c.target.name} of ${c.leader} at ${where(c.target)}: staging ${where(c.staging)}; members [${members.map((u) => `${typeOf(u)} ${where(u.location)}${u.Health?.damage ? ` -${u.Health.damage}` : ""}`).join("; ")}]; districts [${d.tiles.map((x) => `${where(x)} ${x.health}/${x.max}${x.ours ? " ours" : ""}`).join("; ")}]; enemies near ${enemy.n} (best ${enemy.best}); turn ${Game.turn - c.started} of ${CAMPAIGN.MAX_TURNS}${c.assaultTurn !== null ? `, assault since T${c.assaultTurn}, progress T${c.progressTurn}` : ""}; commander ${cmdr ? `${typeOf(cmdr)} ${where(cmdr.location)}${xp}` : "none"}`);
}

/**
 * The campaign's review, before the defence plan (so a campaign that ends gives its soldiers back to it in this pass):
 * with «Наступление» off a running campaign ends at once; else reviewCampaign. Members keep their goal (a move the game
 * stopped and we cancelled took it). @returns log entries
 */
function campaignReviewStep(units, ctx, options) {
    const out = [];
    if (!options.offensive) {
        if (campaign) endCampaign("OFF", out);
        return out;
    }
    reviewCampaign(units, ctx, options, out);
    if (campaign) for (const k of [campaign.commander, ...campaign.members]) if (k && goals.get(k)?.campaign !== campaign.key) goals.set(k, { campaign: campaign.key, turn: Game.turn });
    return out;
}

/**
 * The campaign step of commandUnits (after the defence plan: defence comes first): a campaign whose home needs its
 * soldiers ends (the defence plan runs again with them), else one starts, and the members move. @returns log entries
 */
function campaignStep(units, ctx, options) {
    const out = [];
    if (!options.offensive) return out;
    // A settlement of ours needs soldiers: the members go back to the defence, this pass.
    if (campaign && homeUnsafe(units, ctx)) {
        endCampaign("HOME", out);
        ctx.supply = defenceSupply(units, ctx);
        planDefence(units, ctx);
        return out;
    }
    if (!campaign) startCampaign(units, ctx, options, out);
    if (campaign) {
        out.push(...moveCampaign(units, ctx));
        logCampaign(units);
    }
    return out;
}

/** A campaign member or its commander (the unit loop leaves it to the campaign unless it is hurt). */
const inCampaign = (k) => !!campaign && (campaign.members.has(k) || campaign.commander === k);

/**
 * The assault's attacks (research/37 §9C), from the hud's strike step and again after the unit step (members that just
 * came close may still attack): ranged and siege members shoot the district to take with the least health they reach
 * (RANGE_ATTACK at its plot), melee members next to one attack it when the game's preview says it pays
 * (districtStrikeWorthIt), and a member next to a district at 0 health moves onto it (the capture: MOVE_TO with ATTACK,
 * as the map sends it, world-input.js). Each after the last one's Combat event. @returns log entries
 */
export async function campaignAssault() {
    const out = [];
    const c = campaign;
    if (!c || c.stage !== "ASSAULT") return out;
    const M = globalThis.UnitOperationMoveModifiers;
    const MOVE = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    const RANGE = globalThis.UnitOperationTypes?.RANGE_ATTACK ?? "UNITOPERATION_RANGE_ATTACK";
    const none = globalThis.OperationPlotModifiers?.NONE ?? 0;
    const members = () => (safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])
        .filter((u) => c.members.has(unitKey(u.id)) && u.isOnMap !== false && u.location && Number(u.Combat?.attacksRemaining) > 0);
    const before = districtsToTake(c.target);
    // 1. Shots at the districts.
    for (const u of members()) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || !campaignRanged(def)) continue;
        const r = safe(() => Game.UnitOperations.canStart(u.id, RANGE, {}, false), null);
        if (!r?.Plots?.length) continue;
        const offered = new Set(r.Plots.filter((_p, i) => (r.Modifiers?.[i] ?? 1) !== none));
        const aim = districtsToTake(c.target).tiles.filter((x) => !x.ours && x.health > 0 && offered.has(safe(() => GameplayMap.getIndexFromXY(x.x, x.y), -1)))
            .sort((a, b) => a.health - b.health)[0];
        if (!aim) continue;
        Game.UnitOperations.sendRequest(u.id, RANGE, { X: aim.x, Y: aim.y });
        out.push({ key: "DISTRICT_SHOT", args: [nameOf(def), c.target.name, aim.x, aim.y] });
        await untilEvent("Combat", COMBAT_WAIT_MS);
    }
    // 2. Melee attacks on the districts, when the preview pays; 3. captures of those at 0.
    if (M?.ATTACK !== undefined) {
        for (const u of members()) {
            const def = safe(() => GameInfo.Units.lookup(u.type), null);
            if (!def || campaignRanged(def) || !isSoldier(def)) continue;
            const next = districtsToTake(c.target).tiles.filter((x) => !x.ours && plotDist(u.location, x) === 1);
            const open = next.find((x) => x.health <= 0);
            const args = (x) => ({ X: x.x, Y: x.y, Modifiers: M.ATTACK + (M.MOVE_IGNORE_UNEXPLORED_DESTINATION ?? 0) });
            if (open) {
                if (!safe(() => Game.UnitOperations.canStart(u.id, MOVE, args(open), false), null)?.Success) continue;
                Game.UnitOperations.sendRequest(u.id, MOVE, args(open));
                out.push({ key: "DISTRICT_TAKEN", args: [nameOf(def), c.target.name, open.x, open.y] });
                await untilEvent("Combat", COMBAT_WAIT_MS);
                continue;
            }
            const aim = next.sort((a, b) => a.health - b.health)[0];
            if (!aim || !safe(() => Game.UnitOperations.canStart(u.id, MOVE, args(aim), false), null)?.Success) continue;
            const p = await simulateAttack(u, aim);
            if (!p?.Attacker || !p?.Defender) continue;
            const ourMax = Number(u.Health?.maxDamage) || 100;
            const ok = districtStrikeWorthIt({
                ourHealth: ourMax - (Number(u.Health?.damage) || 0), ourMax, theirHealth: aim.health,
                dealt: Number(p.Defender.DamageTo) || 0, taken: Number(p.Attacker.DamageTo) || 0,
            });
            if (!ok) continue;
            Game.UnitOperations.sendRequest(u.id, MOVE, args(aim));
            out.push({ key: "DISTRICT_STRUCK", args: [nameOf(def), c.target.name, aim.x, aim.y] });
            await untilEvent("Combat", COMBAT_WAIT_MS);
        }
    }
    const after = districtsToTake(c.target);
    if (out.length > 0 && progressed(before, after)) c.progressTurn = Game.turn;
    return out;
}

/**
 * A settlement we just took (city.isJustConqueredFrom: the game then asks raze or keep, NOTIFICATION_CONSIDER_RAZE_CITY):
 * kept, as the capture chooser's Keep sends it (CityCommands DESTROY {Directive: 2}, model-city-capture-chooser.js); one
 * of ours retaken is liberated (no unrest, Civilopedia 1478), and we may not raze a settlement we founded anyway.
 * @returns log entries
 */
export function keepRetaken() {
    const out = [];
    const DESTROY = globalThis.CityCommandTypes?.DESTROY;
    if (DESTROY === undefined) return out;
    for (const city of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        if (!safe(() => city.isJustConqueredFrom, false)) continue;
        const args = { Directive: 2 };
        if (!safe(() => Game.CityCommands.canStart(city.id, DESTROY, args, false), null)?.Success) continue;
        Game.CityCommands.sendRequest(city.id, DESTROY, args);
        out.push({ key: "CITY_KEPT", args: [safe(() => Locale.compose(city.name), "?")] });
    }
    return out;
}

// ---- field operations: village hunts and the training war (research/41 §6-§7) -----------------------------------------

// One at a time, beside a campaign (which comes first): { kind: "HUNT" | "WAR", key, target: { x, y, name }, enemy (its
// player), started, stage: "GATHER" | "FIGHT", staging, members: Set of unit keys, commander, progressTurn, kills, lost,
// enemyCount, reason, xpStart, levelStart, xpTurn, yieldsStart }
let fieldOp = null;
const fieldRetry = new Map();   // target "x,y" -> the turn it may be tried again
let fieldNoted = -1;            // the turn UI.log described the operation, or why none started
let warPlan = null;             // { enemy, turn }: a training war declared (choices), its army gathers from the next pass
let fieldReadiness = null;      // { turn, free, melee, commander }: what the defence leaves free (the training war's readiness)

function resetFieldOps() {
    fieldOp = null;
    fieldRetry.clear();
    fieldNoted = -1;
    warPlan = null;
    fieldReadiness = null;
}

/** The running field operation, a copy (the hud, choices, tests). */
export function fieldOpState() {
    return fieldOp ? { ...fieldOp, members: [...fieldOp.members] } : null;
}

/** The independent we hunt now (befriending leaves it alone), or null. */
export const huntedIndependent = () => (fieldOp?.kind === "HUNT" ? fieldOp.enemy : null);

/** The leader of our training war, declared or under way, or null (peace waits while it runs). */
export const trainingWarEnemy = () => (fieldOp?.kind === "WAR" ? fieldOp.enemy : warPlan?.enemy ?? null);

/** A training war declared on this leader this turn (choices): its army gathers from the next pass. */
export function planTrainingWar(enemy) {
    warPlan = { enemy, turn: Game.turn };
}

/** The soldiers the defence left free at the last unit step, and whether a land commander was free (the war's readiness). */
export const readinessForWar = () => (fieldReadiness?.turn === Game.turn ? fieldReadiness : null);

const inField = (k) => !!fieldOp && (fieldOp.members.has(k) || fieldOp.commander === k);
/** An operation's name in UI.log. */
const fieldKindName = (op) => (op.kind === "HUNT" ? "hunt" : op.kind === "RAIDERS" ? "raiders" : "training war");
const FIELD_RULES = { HUNT, WAR: TRAINING, RAIDERS: RAIDER };

/**
 * Soldiers of `owner` we see on the land within `r` of a tile: { n, best (melee strength), tiles: [{ x, y, id }] }; `commanders`:
 * its land commanders too (a raider hunt's targets, M2).
 */
function soldiersOf(owner, loc, r, { commanders = false } = {}) {
    const tiles = [];
    let best = 0;
    for (const at of tilesAt(loc, r)) {
        // Only those we see now (unitsSeenAt: game 60, SCM-2); its tiles are targets.
        for (const { unit } of unitsSeenAt(at.x, at.y, { remembered: false })) {
            const def = unit ? safe(() => GameInfo.Units.lookup(unit.type), null) : null;
            const commander = commanders && def?.FormationClass === "FORMATION_CLASS_COMMAND";
            if (!unit || unit.owner !== owner || !(isSoldier(def) || commander) || def.Domain !== "DOMAIN_LAND") continue;
            tiles.push({ x: at.x, y: at.y, id: unit.id });
            best = Math.max(best, unitStrength(def));
        }
    }
    return { n: tiles.length, best, tiles };
}

const REL_NAMES = ["HOSTILE", "UNFRIENDLY", "NEUTRAL", "FRIENDLY", "HELPFUL"];
/** Our relationship with a leader by name ("HOSTILE".."HELPFUL"), or null. */
function relationName(id) {
    const R = globalThis.DiplomacyPlayerRelationships ?? {};
    const rel = safe(() => Players.get(pid()).Diplomacy.getRelationshipEnum(id), null);
    return REL_NAMES.find((n) => R[`PLAYER_RELATIONSHIP_${n}`] === rel) ?? null;
}

/**
 * The villages we will not befriend (core huntReason; the user, 21 October), seen, within HUNT.REACH of our settlements,
 * the nearest first: a crisis encampment, one another leader befriends (not one already Unfriendly or Hostile with us),
 * any past half the age, or one whose befriending our Influence does not pay for within HUNT.SAVE_TURNS turns. Never one
 * we befriend, never a city-state. @returns [{ x, y, id, name, reason, d }]
 */
function huntTargets() {
    const ours = ourCentres();
    const GIVE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN;
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const me = safe(() => Players.get(pid()), null);
    const influence = Number(safe(() => me.DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    const income = Number(safe(() => me.Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY), 0)) || 0;
    const apm = Game.AgeProgressManager;
    const max = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0)) || 0;
    const ageShare = max > 0 ? (Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0)) || 0) / max : 0;
    const out = [];
    for (const v of safe(() => villagesOf(pid()), []) ?? []) {
        if (v.friendly) continue;
        const p = safe(() => Players.get(v.id), null);
        if (!p || p.isMinor) continue;
        const d = Math.min(Infinity, ...ours.map((c) => plotDist(c, v)));
        if (d > HUNT.REACH) continue;
        const gives = (safe(() => Game.Diplomacy.getPlayerEvents(v.id), []) ?? []).filter((a) => GIVE !== undefined && a.actionType === GIVE);
        const project = GIVE === undefined ? null : (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), v.id, T, G, -1, T), []) ?? []).find((pr) => pr.actionType === GIVE);
        const target = (project?.targetList1 ?? []).find((t) => t?.targetID === v.id) ?? project?.targetList1?.[0];
        const reason = huntReason({
            ours: gives.some((a) => a.initialPlayer === pid()),
            others: gives.filter((a) => a.initialPlayer !== pid()).map((a) => relationName(a.initialPlayer) ?? "NEUTRAL"),
            crisis: v.type === "IMPROVEMENT_ENCAMPMENT", ageShare, influence, income, cost: Number(target?.costYieldD) || 0,
        });
        if (!reason) continue;
        out.push({ x: v.x, y: v.y, id: v.id, name: safe(() => independentNameOf(v.id), null) ?? `village ${v.id}`, reason, d });
    }
    return out.sort((a, b) => a.d - b.d);
}

const HOME_DAMAGE_SHARE = 0.5; // a centre hit only by the hunted owner's raiders keeps a hunt going while it keeps this share

/**
 * Our settlements need their soldiers: a centre damaged, or a threatened settlement short of guards, raiders of anyone but
 * `ignore` (the village we hunt, the leader of our training war: their raids are the fight we went for). Ships alone do not
 * call them home while the centre holds: no land soldier answers them (root CLAUDE.md gotcha 78), and game 58's hunt of
 * Керманцы ended after a turn of fighting for one galley at Хоалы, 11 tiles away. A centre damaged by `ignore` alone does
 * not either while it keeps HOME_DAMAGE_SHARE of its health (W3, game 60: Самара at 171/200 behind its walls, hit by Шэнле's
 * own raiders, kept every hunt of Шэнле home A82-A91).
 */
function homeUnsafeFor(units, ctx, ignore) {
    const others = ctx.threats.filter((t) => {
        if (!(t.damaged || Number(t.land) > 0)) return false;
        const owners = t.owners ?? [];
        const onlyIgnored = ignore !== null && ignore !== undefined && owners.length > 0 && owners.every((o) => o?.id === ignore);
        if (!onlyIgnored) return true;
        return !!t.damaged && centreShare(t.settlement) < HOME_DAMAGE_SHARE;
    });
    return homeUnsafe(units, { ...ctx, threats: others });
}

/** Free soldiers for an operation: the defence's supply (not posted, not packed, not at a front, healthy) reaching `at` in time. */
function freeSoldiers(ctx, at, turns) {
    return (ctx.supply ?? []).filter((c) => !ctx.posts.has(c.k) && !c.packed && c.stage && c.atFront === undefined && c.from === undefined
        && (Number(c.u.Health?.damage) || 0) < ESCAPE_DAMAGE)
        .map((c) => ({ ...c, turns: at ? pathTurns(c.u, at) : 0 }))
        .filter((c) => c.turns !== null && c.turns <= turns)
        .sort((a, b) => a.turns - b.turns);
}

/** The members picked: melee first, then shooters (siege last: no districts here), up to MAX_MEMBERS. */
function pickMembers(free, rules) {
    const shooters = free.filter((c) => c.ranged && !c.siege);
    const melee = free.filter((c) => !c.ranged).slice(0, rules.MAX_MEMBERS - Math.min(2, shooters.length));
    return { melee, picked: [...melee, ...shooters.slice(0, Math.max(0, rules.MAX_MEMBERS - melee.length))] };
}

/**
 * A land commander for an operation: the vanguard first, not posted at a threatened settlement (unless `postOk` says that
 * post's fight is this operation's: a raider hunt, M1), reaching `at` in time. Against `independent`s one still below
 * EXPERIENCE_MAX_BARB_LEVEL first (W6, game 60: from level 2 an independent's fight gave 1 XP). @returns { u, turns, post } or null
 */
function fieldCommander(units, ctx, at, turns, { independent = false, postOk = null } = {}) {
    const threatened = new Set(ctx.threats.map((x) => `${x.settlement.x},${x.settlement.y}`));
    const capped = (u) => independent && !belowIndependentCap(xpOf(u).level, xpParams());
    return units.filter((u) => u.isCommanderUnit && u.isOnMap !== false && u.location && isLandCommander(safe(() => GameInfo.Units.lookup(u.type), null))
        && !ctx.ordered.has(unitKey(u.id)) && !inCampaign(unitKey(u.id)))
        .map((u) => ({ u, post: goals.get(unitKey(u.id))?.post ?? null }))
        .filter((x) => !threatened.has(x.post ?? "") || !!postOk?.(x.post))
        .map((x) => ({ ...x, turns: pathTurns(x.u, at), vanguard: ctx.commanderRoles?.get(unitKey(x.u.id)) === "VANGUARD" }))
        .filter((x) => x.turns !== null && x.turns <= turns)
        .sort((a, b) => Number(capped(a.u)) - Number(capped(b.u)) || Number(b.vanguard) - Number(a.vanguard) || a.turns - b.turns)[0] ?? null;
}

let xpParamCache = null;
/** The game's EXPERIENCE_* parameters (GameInfo.GlobalParameters), core XP_DEFAULTS where the game has none. */
function xpParams() {
    const source = GameInfo.GlobalParameters;
    if (xpParamCache?.source === source) return xpParamCache.params;
    const params = { ...XP_DEFAULTS };
    for (const r of source?.filter((x) => String(x.Name).startsWith("EXPERIENCE_")) ?? []) {
        const v = Number(r.Value);
        if (Number.isFinite(v)) params[r.Name] = v;
    }
    xpParamCache = { source, params };
    return params;
}

const xpOf = (u) => ({ level: Number(safe(() => u.Experience?.getLevel, 0)) || 0, xp: Number(safe(() => u.Experience?.experiencePoints, 0)) || 0 });

/** Starts an operation: its members and commander carry the goal { field: key }. */
function beginField(op, picked, cmdr, units) {
    fieldOp = op;
    for (const c of picked) goals.set(c.k, { field: op.key, turn: Game.turn });
    if (cmdr) {
        op.commander = unitKey(cmdr.u.id);
        goals.set(op.commander, { field: op.key, turn: Game.turn });
        const x = xpOf(cmdr.u);
        op.levelStart = x.level;
        op.xp = x.level * 1000 + x.xp;
        op.xpTurn = Game.turn;
    }
}

/** Ends the running operation: its members and commander go back to the other orders. */
function endFieldOp(reason, out) {
    const op = fieldOp;
    if (!op) return;
    for (const [k, g] of [...goals.entries()]) if (g?.field === op.key) goals.delete(k);
    // A raider hunt's general gets back the post it hunted from (M1).
    if (op.tie && op.commander) goals.set(op.commander, { post: op.tie, turn: Game.turn });
    fieldOp = null;
    if (op.kind === "WAR") warPlan = null;
    if (reason !== "DONE") fieldRetry.set(op.key, Game.turn + (op.kind === "HUNT" ? HUNT.RETRY_TURNS : op.kind === "RAIDERS" ? RAIDER.RETRY_TURNS : TRAINING.MAX_TURNS));
    const what = fieldKindName(op);
    log.warn(`${what}: ${op.target.name}: ${reason} after ${Game.turn - op.started} turn(s) (${op.stage}; kills ${op.kills}, lost ${op.lost})`);
    // A raider hunt has its own words for its end (its raiders, not a village; its own stall).
    const why = op.kind === "RAIDERS" && RAIDER_WHY.has(reason) ? `LOC_XPL_AP_RAIDER_WHY_${reason}` : `LOC_XPL_AP_FIELD_WHY_${reason}`;
    out.push({ key: op.kind === "HUNT" ? "HUNT_ENDED" : op.kind === "RAIDERS" ? "RAIDER_HUNT_ENDED" : "TRAINING_WAR_ENDED", args: [op.target.name, safe(() => Locale.compose(why), reason)] });
}

/** Ends our training war from outside (choices: the option switched off). */
export function endTrainingWar(reason = "OFF") {
    const out = [];
    if (fieldOp?.kind === "WAR") endFieldOp(reason, out);
    warPlan = null;
    return out;
}

/** Declares war on an independent (its village), as the game's map does it (diplomacy-manager.js startWarFromMap). */
function declareOnIndependent(id) {
    if (safe(() => Players.get(pid()).Diplomacy.isAtWarWith(id), false)) return true;
    if (!safe(() => Players.get(pid()).Diplomacy.canDeclareWarOn(id), null)?.Success) return false;
    const DECLARE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_DECLARE_WAR;
    const OP = globalThis.PlayerOperationTypes?.DECLARE_WAR;
    if (DECLARE === undefined || OP === undefined) return false;
    const args = { Player1: pid(), Player2: id, Type: DECLARE };
    if (!safe(() => Game.PlayerOperations.canStart(pid(), OP, args, false), null)?.Success) return false;
    Game.PlayerOperations.sendRequest(pid(), OP, args);
    return true;
}

/** Our War Support lead in the war with this leader (the ribbon's reading: model-diplo-ribbon.js), or null with no war. */
export function warSupportNet(enemy) {
    const war = (safe(() => Game.Diplomacy.getJointEvents(pid(), enemy, false), []) ?? []).find((e) => e?.actionTypeName === "DIPLOMACY_ACTION_DECLARE_WAR");
    if (!war) return null;
    const header = safe(() => Game.Diplomacy.getDiplomaticEventData(war.uniqueID), null);
    const supporting = (safe(() => Game.Diplomacy.getSupportingPlayersWithBonusEnvoys(war.uniqueID), []) ?? []).length;
    const opposing = (safe(() => Game.Diplomacy.getOpposingPlayersWithBonusEnvoys(war.uniqueID), []) ?? []).length;
    const initial = header?.initialPlayer === pid();
    return { id: war.uniqueID, initial, net: initial ? supporting - opposing : opposing - supporting };
}

/** The empire's science, culture, gold and production a turn (the training war's cost: research/41 §7E). */
function empireYields() {
    const me = safe(() => Players.get(pid()), null);
    const Y = globalThis.YieldTypes ?? {};
    return ["YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_GOLD", "YIELD_PRODUCTION"]
        .reduce((a, k) => a + (Number(safe(() => me.Stats.getNetYield(Y[k]), 0)) || 0), 0);
}

/** Majors at war with us besides `enemy`. */
const otherWars = (enemy) => (safe(() => Players.getAlive(), []) ?? [])
    .some((p) => p?.isMajor && p.id !== pid() && p.id !== enemy && !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(p.id), false));

/**
 * The operation's review, before the defence plan (one that ends gives its soldiers back to it this pass): members gone
 * (lost) or hurt HURT (out), its progress (fewer of their soldiers near it: kills), its end (core huntEnd / trainingEnd),
 * and the fight once gathered (fieldReady; a hunt declares war on the village then).
 */
function reviewFieldOp(units, ctx, options, out) {
    const op = fieldOp;
    if (!op) return;
    const rules = FIELD_RULES[op.kind];
    const byKey = new Map(units.map((u) => [unitKey(u.id), u]));
    for (const k of [...op.members]) {
        const u = byKey.get(k);
        if (!u) op.lost++;
        if (!u || (Number(u.Health?.damage) || 0) >= rules.HURT) {
            op.members.delete(k);
            if (goals.get(k)?.field === op.key) goals.delete(k);
        }
    }
    if (op.commander && !byKey.has(op.commander)) op.commander = null;
    // The opponents of our fights in this operation (the Combat listener: noteFights) that are gone are kills, counted
    // before a raider hunt follows the next soldier (W7, game 60 A71: the hunted Archer died, the next one 2 tiles away kept
    // the count at 1, and the hunt ended STALL with «kills 0»). One fought before last turn and still alive is forgotten: it
    // may walk out of sight later, which is no kill.
    let tracked = 0;
    for (const [k, f] of [...(op.fought ?? new Map())]) {
        const e = safe(() => Units.get(f.id), null);
        if (e && e.isOnMap !== false && (Number(e.Health?.damage) || 0) < (Number(e.Health?.maxDamage) || 100)) {
            if (!(Game.turn - f.turn <= 1)) op.fought.delete(k);
            continue;
        }
        op.fought.delete(k);
        tracked++;
    }
    // A raider hunt follows the one hunted (it moves).
    if (op.kind === "RAIDERS") followRaider(op);
    const anchor = op.kind === "WAR" ? op.staging : op.target;
    const enemies = soldiersOf(op.enemy, anchor, op.kind === "HUNT" ? HUNT.ENEMY_RADIUS : op.kind === "RAIDERS" ? RAIDER.ENEMY_RADIUS : TRAINING.DEPTH, { commanders: op.kind === "RAIDERS" });
    const dropped = op.enemyCount !== null && op.stage === "FIGHT" ? Math.max(0, op.enemyCount - enemies.n) : 0;
    if (Math.max(dropped, tracked) > 0) {
        op.kills += Math.max(dropped, tracked);
        op.progressTurn = Game.turn;
    }
    op.enemyCount = enemies.n;
    const members = [...op.members].map((k) => byKey.get(k)).filter(Boolean);
    const melee = members.filter((u) => isMeleeGuard(safe(() => GameInfo.Units.lookup(u.type), null))).length;
    const homeUnsafeNow = homeUnsafeFor(units, ctx, op.enemy);
    let end;
    if (op.kind === "HUNT") {
        const gone = !(safe(() => villagesOf(pid(), true), []) ?? []).some((v) => v.id === op.enemy && same(v, op.target));
        const FRIENDLY = globalThis.IndependentRelationship?.FRIENDLY;
        const befriended = !!safe(() => Players.get(op.enemy)?.isMinor, false)
            || (FRIENDLY !== undefined && safe(() => Game.IndependentPowers.getIndependentRelationship(op.enemy, pid()), null) === FRIENDLY);
        end = huntEnd(op, {
            turn: Game.turn, gone, befriended, on: !!options.hunt, victoryNear: !!options.victoryNear, homeUnsafe: homeUnsafeNow,
            melee, units: members.length, lost: op.lost, kills: op.kills,
        });
    } else if (op.kind === "RAIDERS") {
        // Tied to the settlement its general was posted at (M1): not followed beyond GUARD_RADIUS + 2 of it.
        const far = Math.min(Infinity, ...ourCentres().map((c) => plotDist(c, op.target))) > RAIDER.REACH + 2
            || (!!op.tie && plotDist(keyAt(op.tie), op.target) > GUARD_RADIUS + 2);
        end = raiderEnd(op, {
            turn: Game.turn, gone: !!op.gone, far, on: !!options.huntRaiders, victoryNear: !!options.victoryNear, homeUnsafe: homeUnsafeNow,
            melee, units: members.length, lost: op.lost, kills: op.kills,
        });
    } else {
        const cmdr = op.commander ? byKey.get(op.commander) : null;
        if (cmdr) {
            const x = xpOf(cmdr);
            const now = x.level * 1000 + x.xp;
            if (now > op.xp) op.xpTurn = Game.turn;
            op.xp = now;
            op.promotions = Math.max(0, x.level - (op.levelStart ?? x.level));
        }
        const weary = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).some((c) => !!safe(() => c.Happiness?.hasWarWeariness, false));
        end = trainingEnd(op, {
            turn: Game.turn, on: !!options.trainingWar, atWar: !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(op.enemy), false),
            promotions: op.promotions ?? 0, weary, supportNet: warSupportNet(op.enemy)?.net ?? 0, lost: op.lost, kills: op.kills,
            thirdParty: otherWars(op.enemy), homeUnsafe: homeUnsafeNow, yields: empireYields(), yieldsStart: op.yieldsStart,
        });
        if (!end && melee < 1) end = "FORCE";
    }
    if (end) {
        endFieldOp(end, out);
        return;
    }
    if (op.stage === "GATHER") {
        const arrived = members.filter((u) => u.isOnMap !== false && u.location && plotDist(u.location, op.staging) <= rules.NEAR_STAGE);
        const meleeArrived = arrived.filter((u) => isMeleeGuard(safe(() => GameInfo.Units.lookup(u.type), null))).length;
        const cmdr = op.commander ? byKey.get(op.commander) : null;
        const commanderAway = !!cmdr && cmdr.isOnMap !== false && !!cmdr.location && plotDist(cmdr.location, op.staging) > rules.NEAR_STAGE;
        if (!fieldReady(op, { turn: Game.turn, arrived: arrived.length, members: members.length, meleeArrived, commanderAway }, rules)) return;
        // A hunt starts the war with the village now, when its army stands by (not before: its units would raid).
        if (op.kind === "HUNT" && !declareOnIndependent(op.enemy)) {
            endFieldOp("NO_WAR", out);
            return;
        }
        op.stage = "FIGHT";
        op.progressTurn = Game.turn;
        op.xpTurn = Game.turn;
        out.push({ key: op.kind === "HUNT" ? "HUNT_FIGHT" : "TRAINING_WAR_FIGHT", args: [op.target.name, arrived.length] });
    }
}

/**
 * A hunt starts (the user, 21 October: "villages that will not be befriended") for the nearest village of huntTargets when
 * our settlements are safe, no victory of ours is near, and the soldiers the defence leaves free reaching its staging area
 * within GATHER_TURNS are enough (core fieldForce: 2 melee, 3 in all, 1 more than its soldiers near it); a land commander,
 * the vanguard first, leads it. Its war is declared only once they have gathered (reviewFieldOp).
 */
function startHunt(units, ctx, options, out) {
    const note = (text) => {
        if (fieldNoted === Game.turn) return;
        fieldNoted = Game.turn;
        log.info(`hunt: none: ${text}`);
    };
    const targets = huntTargets().filter((t) => {
        const retry = fieldRetry.get(`${t.x},${t.y}`);
        return retry === undefined || Game.turn >= retry;
    });
    if (targets.length === 0) return;
    const t = targets[0];
    if (options.victoryNear) return note(`${t.name}: a victory of ours is near`);
    // Its own raids are the fight we go for (W3: game 60 passed null, so Шэнле's raids on Самара kept its hunt home).
    if (homeUnsafeFor(units, ctx, t.id)) return note(`${t.name}: a settlement of ours needs its soldiers`);
    const staging = stagingTile(t, HUNT.STAGE_DIST);
    if (!staging) return note(`${t.name}: no staging tile ${HUNT.STAGE_DIST} tiles from it`);
    const free = freeSoldiers(ctx, staging, HUNT.GATHER_TURNS);
    const { melee, picked } = pickMembers(free, HUNT);
    const enemy = soldiersOf(t.id, t, HUNT.ENEMY_RADIUS);
    // Its general (the hunt is for its XP: game 54's hunt of Аванти went without one, 8 turns away): one reaching it within
    // COMMANDER_TURNS, and none starts without one while a general of ours stands on the map. The soldiers packed in its army
    // go too (they unpack at the staging area: moveFieldOp).
    const cmdr = fieldCommander(units, ctx, staging, HUNT.COMMANDER_TURNS, { independent: true });
    const packed = cmdr ? packedSoldiers(cmdr.u, units) : [];
    const defOf = (u) => safe(() => GameInfo.Units.lookup(u.type), null);
    const force = fieldForce({
        melee: melee.length + packed.filter((u) => isMeleeGuard(defOf(u))).length, units: picked.length + packed.length, enemies: enemy.n,
        ourBest: Math.max(0, ...picked.map((c) => unitStrength(c.def)), ...packed.map((u) => unitStrength(defOf(u)))), theirBest: enemy.best,
    }, HUNT);
    if (!force.ok) return note(`${t.name} (${t.reason}): not enough force (${force.why}; ${free.length} free within ${HUNT.GATHER_TURNS} turns${packed.length ? `, ${packed.length} packed` : ""})`);
    if (!cmdr && landCommanders(units).some((u) => u.isOnMap !== false && !!u.location)) return note(`${t.name} (${t.reason}): no free general within ${HUNT.COMMANDER_TURNS} turns`);
    const key = `${t.x},${t.y}`;
    beginField({
        kind: "HUNT", key, target: { x: t.x, y: t.y, name: t.name }, enemy: t.id, started: Game.turn, stage: "GATHER", staging,
        members: new Set([...picked.map((c) => c.k), ...packed.map((u) => unitKey(u.id))]), commander: null, progressTurn: Game.turn, kills: 0, lost: 0, enemyCount: null, reason: t.reason,
    }, [...picked, ...packed.map((u) => ({ k: unitKey(u.id) }))], cmdr, units);
    log.warn(`hunt: ${t.name} at ${where(t)} (${t.reason}): started with ${picked.length} [${picked.map((c) => `${c.def.UnitType} in ${c.turns}t`).join(", ")}], staging ${where(staging)}, its soldiers ${enemy.n} (best ${enemy.best}), commander ${cmdr ? `${typeOf(cmdr.u)} in ${cmdr.turns}t` : "none"}`);
    out.push({ key: "HUNT_STARTED", args: [t.name, picked.length] });
}

// ---- raider hunts («Охота на рейдеров», after game 54) ----------------------------------------------------------------

let raiderNoted = -1; // the turn UI.log said why no raider hunt started
const RAIDER_WHY = new Set(["DONE", "STALL", "FAR"]); // ends a raider hunt words its own way (LOC_XPL_AP_RAIDER_WHY_*)

/** A tile a raider hunt may stand on or follow to: within RAIDER.REACH + 1 of our settlements, on our land or nobody's. */
function raiderGround(l) {
    const owner = safe(() => GameplayMap.getOwner(l.x, l.y), -1);
    if (owner !== -1 && owner !== null && owner !== pid()) return false;
    return ourCentres().some((c) => plotDist(c, l) <= RAIDER.REACH + 1);
}

/**
 * Hostile soldiers roaming near our land (after game 54): a land soldier of a player at war with us (an independent's too)
 * that we see within RAIDER.REACH of one of our settlements, on our land or nobody's, not on a village or a district, not
 * guarding its own village (within VILLAGE_GUARD_RADIUS: that is a village hunt), with its fellows within ENEMY_RADIUS; the
 * nearest to our settlements first, the smallest group on a tie. @returns [{ x, y, owner, name, n, best, d }]
 */
function raiderTargets() {
    const ours = ourCentres();
    const VISIBLE = globalThis.RevealedStates?.VISIBLE;
    const villages = safe(() => villagesOf(pid(), true), []) ?? [];
    const seen = new Set();
    const out = [];
    for (const c of ours) {
        for (const at of tilesAt(c, RAIDER.REACH)) {
            const k = `${at.x},${at.y}`;
            if (seen.has(k)) continue;
            seen.add(k);
            if (VISIBLE !== undefined && safe(() => GameplayMap.getRevealedState(pid(), at.x, at.y), VISIBLE) !== VISIBLE) continue;
            for (const { unit } of unitsSeenAt(at.x, at.y, { remembered: false })) {
                const def = unit ? safe(() => GameInfo.Units.lookup(unit.type), null) : null;
                // A hostile land commander too (M2: game 60's pillager next to Тула, T89-T139).
                const commander = !!hostileCommander(unit);
                if (!unit || (!commander && (unit.isCommanderUnit || !hostileOwner(unit) || !isSoldier(def))) || def.Domain !== "DOMAIN_LAND") continue;
                // Not one a fight of ours this pass already finished (W7).
                if ((Number(unit.Health?.damage) || 0) >= (Number(unit.Health?.maxDamage) || 100)) continue;
                if (!raiderGround(at) || validId(safe(() => Game.Combat.getDefensibleDistrict({ x: at.x, y: at.y }), null))) continue;
                if (villages.some((v) => v.id === unit.owner && plotDist(v, at) <= VILLAGE_GUARD_RADIUS)) continue;
                const group = soldiersOf(unit.owner, at, RAIDER.ENEMY_RADIUS, { commanders: true });
                const name = safe(() => Players.get(unit.owner)?.isMajor, false) ? leaderOf(unit.owner) : (safe(() => independentNameOf(unit.owner), null) ?? `p${unit.owner}`);
                out.push({ x: at.x, y: at.y, owner: unit.owner, name, n: group.n, best: group.best, d: Math.min(Infinity, ...ours.map((o) => plotDist(o, at))), id: unit.id, commander });
            }
        }
    }
    return out.sort((a, b) => a.d - b.d || a.n - b.n);
}

/**
 * A raider hunt starts (the user, after game 54: "will commander chase exp much more aggressively so we can get more
 * level?"; «Охота на рейдеров», on by default with «Оборона»): the nearest raider of raiderTargets whose owner's last hunt did
 * not fail within RETRY_TURNS, when our settlements are safe (that owner's raids aside), a general reaches it within
 * COMMANDER_TURNS (the point is its XP: none without one), and the soldiers the defence leaves free within GATHER_TURNS plus
 * those packed in the general's army are enough (core fieldForce: a melee one, two in all, one more than their soldiers
 * near it). No gathering: it is fought at once (moveFieldOp, fieldAssault), followed while it stays near our land.
 */
function startRaiderHunt(units, ctx, options, out) {
    const note = (text) => {
        if (raiderNoted === Game.turn) return;
        raiderNoted = Game.turn;
        log.info(`raiders: none: ${text}`);
    };
    const targets = raiderTargets().filter((t) => {
        const retry = fieldRetry.get(`raid:${t.owner}`);
        return retry === undefined || Game.turn >= retry;
    });
    if (targets.length === 0) return;
    const t = targets[0];
    if (options.victoryNear) return note(`${t.name} at ${where(t)}: a victory of ours is near`);
    if (homeUnsafeFor(units, ctx, t.owner)) return note(`${t.name} at ${where(t)}: a settlement of ours needs its soldiers`);
    const staging = stagingTile(t, 2) ?? stagingTile(t, 1);
    if (!staging) return note(`${t.name} at ${where(t)}: no tile to come from`);
    // The general posted at the very settlement this raider threatens may hunt it: that fight is this one (M1, game 60: 44
    // of 73 `raiders: none` lines were «no free general», the only one posted at a threatened settlement, in 20 of them the
    // one the raider stood at). The hunt stays tied to that settlement (raiderEnd's FAR) and gives the post back at its end.
    const tiedTo = (post) => {
        const th = ctx.threats.find((x) => `${x.settlement.x},${x.settlement.y}` === post);
        return !!th && plotDist(th.settlement, t) <= THREAT_RADIUS && (th.owners ?? []).some((o) => o?.id === t.owner);
    };
    const independent = !!safe(() => Players.get(t.owner)?.isIndependent, false);
    const cmdr = fieldCommander(units, ctx, staging, RAIDER.COMMANDER_TURNS, { independent, postOk: tiedTo });
    if (!cmdr) return note(`${t.name} at ${where(t)}: no free general within ${RAIDER.COMMANDER_TURNS} turns`);
    const tie = cmdr.post && tiedTo(cmdr.post) ? cmdr.post : null;
    const packed = packedSoldiers(cmdr.u, units);
    const free = freeSoldiers(ctx, staging, RAIDER.GATHER_TURNS);
    const { melee, picked } = pickMembers(free, RAIDER);
    const defOf = (u) => safe(() => GameInfo.Units.lookup(u.type), null);
    const force = fieldForce({
        melee: melee.length + packed.filter((u) => isMeleeGuard(defOf(u))).length, units: picked.length + packed.length, enemies: t.n,
        ourBest: Math.max(0, ...picked.map((c) => unitStrength(c.def)), ...packed.map((u) => unitStrength(defOf(u)))), theirBest: t.best,
    }, RAIDER);
    if (!force.ok) return note(`${t.name} at ${where(t)}: not enough force (${force.why}; ${free.length} free within ${RAIDER.GATHER_TURNS} turns, ${packed.length} packed)`);
    beginField({
        kind: "RAIDERS", key: `raid:${t.owner}`, target: { x: t.x, y: t.y, name: t.name }, enemy: t.owner, started: Game.turn, stage: "FIGHT", staging,
        members: new Set([...picked.map((c) => c.k), ...packed.map((u) => unitKey(u.id))]), commander: null, progressTurn: Game.turn, kills: 0, lost: 0,
        enemyCount: t.n, reason: "RAIDERS", tie, targetId: t.id ?? null, fought: new Map(),
    }, [...picked, ...packed.map((u) => ({ k: unitKey(u.id) }))], cmdr, units);
    const tieName = tie ? safe(() => Locale.compose(settlementAt(keyAt(tie)).name), null) ?? tie : null;
    log.warn(`raiders: ${t.name} at ${where(t)} (${t.n} of theirs, best ${t.best}): hunted by ${typeOf(cmdr.u)} in ${cmdr.turns}t with ${picked.length} [${picked.map((c) => `${c.def.UnitType} in ${c.turns}t`).join(", ")}]${packed.length ? ` and ${packed.length} packed` : ""}${tieName ? `; hunted by the general posted at ${tieName}` : ""}`);
    out.push({ key: "RAIDER_HUNT_STARTED", args: [t.name, picked.length + packed.length] });
}

/** A raider hunt follows the one hunted: the soldier of theirs within FOLLOW of where it stood, the nearest; gone with none. */
function followRaider(op) {
    const near = soldiersOf(op.enemy, op.target, RAIDER.FOLLOW, { commanders: true }).tiles.sort((a, b) => plotDist(a, op.target) - plotDist(b, op.target));
    op.gone = near.length === 0;
    if (near[0]) op.target = { x: near[0].x, y: near[0].y, name: op.target.name };
}

/** Unpacks a commander's army on the offered tile nearest `toward` (UNITCOMMAND_UNPACK_ARMY, as unpackArmies). @returns the tile or null */
function unpackToward(c, toward) {
    const OP = "UNITCOMMAND_UNPACK_ARMY";
    const plots = (safe(() => Game.UnitCommands.canStart(c.id, OP, {}, false), null)?.Plots ?? [])
        .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter((l) => l && !onWater(l));
    const best = plots.sort((a, b) => plotDist(a, toward) - plotDist(b, toward))[0];
    if (!best) return null;
    Game.UnitCommands.sendRequest(c.id, OP, { X: best.x, Y: best.y });
    return best;
}

/**
 * A training war declared (choices, the turn before) starts here: the army gathers 3 tiles from their settlement nearest
 * ours, on our side, with the soldiers the defence leaves free and the vanguard (research/41 §7C).
 */
function startTrainingWar(units, ctx, out) {
    const enemy = warPlan.enemy;
    if (!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(enemy), false)) {
        if (Game.turn - warPlan.turn > 1) warPlan = null; // the declaration did not take
        return;
    }
    const ours = ourCentres();
    const theirs = (safe(() => Players.get(enemy).Cities.getCities(), []) ?? []).filter((c) => c?.location)
        .map((c) => ({ c, d: Math.min(Infinity, ...ours.map((o) => plotDist(o, c.location))) })).sort((a, b) => a.d - b.d)[0];
    if (!theirs) {
        warPlan = null;
        return;
    }
    const t = { x: theirs.c.location.x, y: theirs.c.location.y, name: safe(() => Locale.compose(theirs.c.name), "?") };
    const staging = stagingTile(t, TRAINING.STAGE_DIST);
    if (!staging) return;
    const free = freeSoldiers(ctx, staging, TRAINING.GATHER_TURNS);
    const { picked } = pickMembers(free, TRAINING);
    const cmdr = fieldCommander(units, ctx, staging, TRAINING.COMMANDER_TURNS);
    const leader = leaderOf(enemy);
    beginField({
        kind: "WAR", key: `war:${enemy}`, target: { ...t, name: `${t.name} (${leader})` }, enemy, started: Game.turn, stage: "GATHER", staging,
        members: new Set(picked.map((c) => c.k)), commander: null, progressTurn: Game.turn, kills: 0, lost: 0, enemyCount: null,
        reason: "WAR", yieldsStart: empireYields(), promotions: 0,
    }, picked, cmdr, units);
    log.warn(`training war: ${leader}: the army gathers at ${where(staging)} facing ${t.name} with ${picked.length} [${picked.map((c) => `${c.def.UnitType} in ${c.turns}t`).join(", ")}], commander ${cmdr ? `${typeOf(cmdr.u)} in ${cmdr.turns}t` : "none"}`);
    out.push({ key: "TRAINING_WAR_GATHER", args: [leader, picked.length] });
}

/**
 * The members' moves this pass (sent before the unit loop). Gathering: next to the staging tile. The fight: a melee member
 * next to their nearest soldier (a hunt: next to the village when none is left), a ranged one within its range of one, not
 * next to one when it can; never past DEPTH tiles of the staging tile in a war. The commander: the tile within 2 of the
 * fight where its radius covers the most members, never next to a soldier of theirs (a hunt: next to the village when it
 * can, so the dispersal's XP is its own). @returns log entries
 */
function moveFieldOp(units, ctx) {
    const out = [];
    const op = fieldOp;
    if (!op) return out;
    const rules = FIELD_RULES[op.kind];
    const A = globalThis.UnitActivityTypes;
    const taken = new Set();
    const planned = new Map(); // unit key -> where a member goes this pass
    const anchor = op.kind === "WAR" ? op.staging : op.target;
    const depth = op.kind === "HUNT" ? HUNT.ENEMY_RADIUS + 1 : op.kind === "RAIDERS" ? RAIDER.ENEMY_RADIUS + 1 : TRAINING.DEPTH;
    const enemies = op.stage === "FIGHT" ? soldiersOf(op.enemy, anchor, depth, { commanders: op.kind === "RAIDERS" }).tiles : [];
    // A raider is followed only on our land or nobody's, near our settlements (raiderGround).
    const inBounds = (l) => op.kind === "HUNT" || (op.kind === "RAIDERS" ? raiderGround(l) : plotDist(l, op.staging) <= TRAINING.DEPTH);
    const move = (u, def, loc, key) => {
        if (same(u.location, loc)) return;
        wakeUnit(u);
        if (!moveTo(u, loc)) return;
        taken.add(`${loc.x},${loc.y}`);
        planned.set(unitKey(u.id), loc);
        ctx.ordered.add(unitKey(u.id));
        out.push({ key, args: [nameOf(def), op.target.name] });
    };
    for (const u of units) {
        const k = unitKey(u.id);
        if (!op.members.has(k) || ctx.ordered.has(k) || ctx.leave?.has(k) || u.isOnMap === false || !u.location) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || (Number(u.Health?.damage) || 0) >= ESCAPE_DAMAGE || u.canMove === false || u.hasMoved === true) continue;
        if (A && u.activityType === A.HEAL) continue;
        if (op.stage === "GATHER") {
            // Gathered, it waits there; not on the plague (the unit loop leaves a member to its operation: game 60).
            if (plotDist(u.location, op.staging) <= rules.NEAR_STAGE && !(hazardAt(u.location) > 0)) continue;
            const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
            if (A && u.activityType === A.OPERATION && dest && plotDist(dest, op.staging) <= 1) continue;
            const loc = campaignSpot(u, op.staging, 1, taken);
            if (loc) move(u, def, loc, "FIELD_GATHER");
            continue;
        }
        if (campaignRanged(def)) {
            const range = unitRange(def);
            if (enemies.some((e) => plotDist(u.location, e) <= range)) continue;
            const aim = [...enemies].sort((a, b) => plotDist(u.location, a) - plotDist(u.location, b))[0];
            if (!aim) continue;
            const ok = (l) => inBounds(l) && plotDist(l, aim) <= range && !enemies.some((e) => plotDist(l, e) <= 1);
            const loc = campaignSpot(u, aim, range, taken, ok);
            if (loc) move(u, def, loc, "FIELD_ADVANCE");
            continue;
        }
        if (enemies.some((e) => plotDist(u.location, e) === 1)) continue;
        const aim = [...enemies].sort((a, b) => plotDist(u.location, a) - plotDist(u.location, b))[0] ?? (op.kind === "HUNT" ? op.target : null);
        if (!aim || (op.kind === "HUNT" && !enemies.length && plotDist(u.location, aim) <= 1)) continue;
        const loc = campaignSpot(u, aim, 1, taken, (l) => inBounds(l) && plotDist(l, aim) === 1 && !(op.kind === "HUNT" && same(l, op.target)));
        if (loc) move(u, def, loc, "FIELD_ADVANCE");
    }
    // The commander, by the fight: its radius (1) over the most members; a hunt's next to the village first.
    const cmdr = op.commander ? units.find((u) => unitKey(u.id) === op.commander) : null;
    // One already on its way is judged again each pass (game 61, E9-E12: the hunt's general walked alone for three turns to
    // 54,23, next to a Heavy Archer standing on the staging tile, its soldiers 2-5 tiles behind, and was shot down there):
    // a next stop or a destination it may no longer stand on stops the walk; it is placed again on the next pass.
    if (cmdr && cmdr.isOnMap !== false && cmdr.location && !ctx.ordered.has(op.commander) && !readyForOrders(cmdr)) {
        const out2 = stopUnsafeWalk(cmdr, units, ctx);
        if (out2) out.push(out2);
    }
    if (cmdr && cmdr.isOnMap !== false && cmdr.location && !ctx.ordered.has(op.commander) && !ctx.leave?.has(op.commander) && readyForOrders(cmdr)) {
        const def = safe(() => GameInfo.Units.lookup(cmdr.type), null);
        // Members packed in its army (after game 54) unpack at the staging area, or by the fight toward their nearest soldier.
        const packedHere = units.filter((u) => u.isOnMap === false && op.members.has(unitKey(u.id)) && sameId(u.armyId, cmdr.armyId));
        const place = op.stage === "GATHER" ? op.staging : anchor;
        if (packedHere.length > 0 && plotDist(cmdr.location, place) <= 2) {
            const toward = op.stage === "GATHER" ? op.staging : [...enemies].sort((a, b) => plotDist(cmdr.location, a) - plotDist(cmdr.location, b))[0] ?? anchor;
            const at = unpackToward(cmdr, toward);
            if (at) {
                ctx.ordered.add(op.commander);
                log.info(`${fieldKindName(op)}: ${typeOf(cmdr)} at ${where(cmdr.location)} unpacks ${packedHere.length} toward ${where(toward)} (${op.target.name})`);
                out.push({ key: "FIELD_UNPACKED", args: [nameOf(def), packedHere.length, op.target.name] });
                return out;
            }
        }
        let loc = null;
        const packedArmy = armyShields(cmdr, units);
        // Gathering, it stands where it may (commanderSafeAt: never next to a hostile land unit, out of every one's reach, or
        // under a soldier of ours), else as close as is safe (game 61: it went to the staging area first, alone).
        if (op.stage === "GATHER" && plotDist(cmdr.location, op.staging) > 1) {
            loc = campaignSpot(cmdr, op.staging, 1, taken, (l) => packedArmy || commanderSafeAt(l, units, ctx));
            if (!loc && !packedArmy && def) loc = commanderAdvance(cmdr, def, op.staging, units, ctx);
        }
        else {
            const members = units.filter((u) => op.members.has(unitKey(u.id)) && u.location && u.isOnMap !== false);
            const at = (u) => planned.get(unitKey(u.id)) ?? u.location;
            // A member about to fight after this pass's moves (an enemy within its range): its fight is a focused attack for the
            // general (after game 54: 4-8 XP each).
            const fighting = (u) => {
                const d = safe(() => GameInfo.Units.lookup(u.type), null);
                const range = d && campaignRanged(d) ? unitRange(d) : 1;
                return enemies.some((e) => plotDist(at(u), e) <= range);
            };
            // It stands under a healthy member (where one stands or goes this pass: the soldier is the one attacked, research/42
            // A2), or where commanderSafeAt allows, or anywhere with its army packed; elsewhere it escaped the next pass.
            const shields = new Set(members.filter((u) => (Number(u.Health?.damage) || 0) < SHIELD_DAMAGE).map((u) => `${at(u).x},${at(u).y}`));
            let best = null;
            for (const l of tilesAt(anchor, 2)) {
                const shielded = shields.has(`${l.x},${l.y}`);
                if (!shielded && (taken.has(`${l.x},${l.y}`) || enemies.some((e) => plotDist(l, e) <= 1))) continue;
                if ((op.kind === "HUNT" && same(l, op.target)) || (op.kind === "RAIDERS" && !raiderGround(l))) continue;
                if (onWater(l) || safe(() => GameplayMap.isImpassable(l.x, l.y), false) || hazardAt(l) > 0) continue;
                if ((safe(() => MapUnits.getUnits(l.x, l.y), []) ?? []).some((id) => safe(() => Units.get(id), null)?.owner !== pid())) continue;
                if (!shielded && !packedArmy && !commanderSafeAt(l, units, ctx)) continue;
                const covered = members.filter((u) => plotDist(at(u), l) <= 1).length;
                const fights = members.filter((u) => plotDist(at(u), l) <= 1 && fighting(u)).length;
                const score = covered * 10 + fights * 20 + (fights > 0 ? 30 : 0) + (shielded ? 10 : 0)
                    + (op.kind === "HUNT" && plotDist(l, op.target) === 1 ? 5 : 0) - plotDist(cmdr.location, l);
                if (!best || score > best.score) best = { l, score };
            }
            loc = best && !same(best.l, cmdr.location) ? best.l : null;
            // No safe tile by the fight: as close as is safe (commanderAdvance).
            if (!best && plotDist(cmdr.location, anchor) > 2 && def) loc = commanderAdvance(cmdr, def, anchor, units, ctx);
        }
        // A walk whose first turn stops where it may not stand: as close as is safe this turn instead (gathering too: game 61).
        if (loc && def && !packedArmy) {
            const p = pathTo(cmdr, loc);
            const stop = p && p.turns > 1 ? turnStop(p) : null;
            if (stop && !commanderSafeAt(stop, units, ctx)) loc = commanderAdvance(cmdr, def, loc, units, ctx);
        }
        if (loc && def) move(cmdr, def, loc, "FIELD_COMMANDER");
    }
    return out;
}

/**
 * A commander on its way whose next end-of-turn stop, or its destination when that is reached this turn, it may no longer
 * stand on (commanderSafeAt; its army packed aside): the order is cancelled (UNITCOMMAND_CANCEL, as checkWalks) and it is
 * placed again on the next pass. @returns a log entry or null
 */
function stopUnsafeWalk(u, units, ctx) {
    const A = globalThis.UnitActivityTypes;
    if (!A || u.activityType !== A.OPERATION || armyShields(u, units)) return null;
    const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
    if (!dest || !(dest.x >= 0) || same(dest, u.location)) return null;
    const p = pathTo(u, dest);
    const stop = p && p.turns > 1 ? turnStop(p) : dest;
    if (!stop || same(stop, u.location) || commanderSafeAt(stop, units, ctx)) return null;
    const CANCEL = "UNITCOMMAND_CANCEL";
    if (!safe(() => Game.UnitCommands.canStart(u.id, CANCEL, NO_TARGET, false), null)?.Success) return null;
    Game.UnitCommands.sendRequest(u.id, CANCEL, { ...NO_TARGET });
    ctx.ordered.add(unitKey(u.id));
    const def = safe(() => GameInfo.Units.lookup(u.type), null);
    log.info(`generals: ${def?.UnitType ?? "?"} at ${u.location.x},${u.location.y} walking to ${dest.x},${dest.y}: its stop ${stop.x},${stop.y} is unsafe now (${hostilesInReach(stop).length} hostile(s) reach it), the walk is cancelled`);
    return { key: "COMMANDER_WALK_STOPPED", args: [nameOf(def), stop.x, stop.y] };
}

/** UI.log once a turn: the operation, its members, its enemies near and its commander's experience. */
function logFieldOp(units) {
    const op = fieldOp;
    if (!op || fieldNoted === Game.turn) return;
    fieldNoted = Game.turn;
    const byKey = new Map(units.map((u) => [unitKey(u.id), u]));
    const members = [...op.members].map((k) => byKey.get(k)).filter(Boolean);
    const cmdr = op.commander ? byKey.get(op.commander) : null;
    const rules = FIELD_RULES[op.kind];
    const support = op.kind === "WAR" ? warSupportNet(op.enemy) : null;
    log.warn(`${fieldKindName(op)}: ${op.stage} ${op.target.name} at ${where(op.target)} (${op.reason}): staging ${where(op.staging)}; members [${members.map((u) => `${typeOf(u)} ${where(u.location)}${u.Health?.damage ? ` -${u.Health.damage}` : ""}`).join("; ")}]; their soldiers near ${op.enemyCount ?? "?"}; kills ${op.kills}, lost ${op.lost}; turn ${Game.turn - op.started} of ${rules.MAX_TURNS}${support ? `; War Support ${support.net}` : ""}; commander ${cmdr ? `${typeOf(cmdr)} ${where(cmdr.location)} (${xpText(cmdr)})` : "none"}`);
}

/** The operation's review step, before the defence plan. @returns log entries */
function fieldReviewStep(units, ctx, options) {
    const out = [];
    if (fieldOp?.kind === "HUNT" && !options.hunt) endFieldOp("OFF", out);
    if (fieldOp?.kind === "WAR" && !options.trainingWar) endFieldOp("OFF", out);
    if (!options.trainingWar) warPlan = null;
    reviewFieldOp(units, ctx, options, out);
    if (fieldOp) for (const k of [fieldOp.commander, ...fieldOp.members]) if (k && goals.get(k)?.field !== fieldOp.key) goals.set(k, { field: fieldOp.key, turn: Game.turn });
    return out;
}

/**
 * The field step of commandUnits (after the defence plan and a campaign: they come first): the readiness for a training war
 * (choices reads it), an operation's end when home needs its soldiers, else one starts (a declared training war first, then
 * a hunt), and the members move. @returns log entries
 */
function fieldStep(units, ctx, options) {
    const out = [];
    const free = freeSoldiers(ctx, null, Infinity);
    fieldReadiness = {
        turn: Game.turn, free: free.length, melee: free.filter((c) => !c.ranged).length,
        commander: units.some((u) => u.isCommanderUnit && u.isOnMap !== false && isLandCommander(safe(() => GameInfo.Units.lookup(u.type), null))
            && !inCampaign(unitKey(u.id)) && !ctx.threats.some((t) => goals.get(unitKey(u.id))?.post === `${t.settlement.x},${t.settlement.y}`)),
    };
    if (fieldOp && homeUnsafeFor(units, ctx, fieldOp.enemy)) {
        endFieldOp("HOME", out);
        ctx.supply = defenceSupply(units, ctx);
        planDefence(units, ctx);
        return out;
    }
    if (!fieldOp && !campaign && options.trainingWar && warPlan) startTrainingWar(units, ctx, out);
    // Raiders near our land before villages: they come and go (after game 54).
    if (!fieldOp && !campaign && options.huntRaiders) startRaiderHunt(units, ctx, options, out);
    if (!fieldOp && !campaign && options.hunt) startHunt(units, ctx, options, out);
    if (fieldOp) {
        out.push(...moveFieldOp(units, ctx));
        logFieldOp(units);
    }
    return out;
}

// ---- skirmishes (after game 58; core SKIRMISH) ---------------------------------------------------------------------------

let skirmishNoted = -1; // the turn of the last `skirmish:` line

/** Is this independent at war with us (its relationship Hostile, or a war declared)? */
function atWarWithIndependent(id) {
    const R = globalThis.IndependentRelationship;
    const rel = safe(() => Game.IndependentPowers.getIndependentRelationship(id, pid()), null);
    if (R && rel === R.HOSTILE) return true;
    if (R && rel !== null && rel !== undefined) return false;
    return !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(id), false);
}

/**
 * The village to skirmish with: seen, at war with us, within SKIRMISH.REACH of our settlements, with soldiers of its own near
 * it (an empty one is dispersed: disperseHere), the nearest first; not while home needs the soldiers. @returns
 * { v, name, s (our settlement nearest it: the fight is held there), enemies: [{ x, y, id, melee }], d } or null
 */
function skirmishTarget(units, ctx) {
    const ours = ourCentres();
    const list = [];
    for (const v of safe(() => villagesOf(pid()), []) ?? []) {
        if (v.friendly || safe(() => Players.get(v.id)?.isMinor, false) || !atWarWithIndependent(v.id)) continue;
        const d = Math.min(Infinity, ...ours.map((c) => plotDist(c, v)));
        if (d > SKIRMISH.REACH) continue;
        const enemies = soldiersOf(v.id, v, SKIRMISH.GUARD_RADIUS).tiles.map((t) => {
            const def = safe(() => GameInfo.Units.lookup(safe(() => Units.get(t.id), null)?.type), null);
            return { ...t, melee: !!def && !campaignRanged(def) };
        });
        if (enemies.length === 0) continue;
        const s = [...ours].sort((a, b) => plotDist(a, v) - plotDist(b, v))[0];
        list.push({ v, d, s, enemies, name: safe(() => independentNameOf(v.id), null) ?? `village ${v.id}` });
    }
    list.sort((a, b) => a.d - b.d);
    return list.find((t) => !homeUnsafeFor(units, ctx, t.v.id)) ?? null;
}

let skirmishNoneNoted = -1; // the turn of the last `skirmish: none:` line

/** Why no village is skirmished with (W9), for UI.log: the nearest village at war with us, how far, unseen, empty, home. */
function skirmishWhy(units, ctx) {
    const ours = ourCentres();
    const near = (safe(() => villagesOf(pid(), true), []) ?? [])
        .filter((v) => !v.friendly && !safe(() => Players.get(v.id)?.isMinor, false) && atWarWithIndependent(v.id))
        .map((v) => ({ v, d: Math.min(Infinity, ...ours.map((c) => plotDist(c, v))) })).sort((a, b) => a.d - b.d)[0];
    if (!near) return "no village at war with us";
    const name = safe(() => independentNameOf(near.v.id), null) ?? `village ${near.v.id}`;
    const parts = [`nearest ${name} at ${near.d} tiles (reach ${SKIRMISH.REACH})`];
    if (near.v.revealed === false) parts.push("unseen");
    else if (near.d <= SKIRMISH.REACH) {
        if (soldiersOf(near.v.id, near.v, SKIRMISH.GUARD_RADIUS).n === 0) parts.push("no soldier of theirs near it");
        const home = ctx.threats.find((x) => homeUnsafeFor(units, { ...ctx, threats: [x] }, near.v.id));
        if (home) parts.push(`home unsafe: ${home.settlement.name}`);
    }
    return parts.join(", ");
}

/**
 * A shooter's post: our settlement's centre or a tile next to it (the fight is held there: the simulator showed shooters
 * posted in the open struck dead the next turn), never next to one of the village's melee soldiers, free for a soldier,
 * reached within SKIRMISH.TURNS; one within its range of their soldiers first (else it waits there for them), then by the
 * enemy melee soldiers within MELEE_NEAR of it and its walk. Its own tile when that is such a post already.
 * @returns { loc, turns, inRange } or null
 */
function skirmishPost(u, def, t, taken, ctx) {
    const range = unitRange(def);
    const inRange = (l) => t.enemies.some((e) => plotDist(l, e) <= range);
    const safeFrom = (l) => !t.enemies.some((e) => e.melee && plotDist(l, e) <= 1) && t.enemies.filter((e) => plotDist(l, e) <= SKIRMISH.EXPOSURE_RADIUS).length <= SKIRMISH.EXPOSURE_MAX;
    const pre = (l) => (inRange(l) ? 0 : SKIRMISH.OUT_OF_RANGE) + t.enemies.filter((e) => e.melee && plotDist(l, e) <= SKIRMISH.MELEE_NEAR).length * SKIRMISH.MELEE_COST;
    let best = null;
    if (plotDist(u.location, t.s) <= 1 && safeFrom(u.location) && !taken.has(`${u.location.x},${u.location.y}`)) best = { loc: { x: u.location.x, y: u.location.y }, turns: 0, score: pre(u.location) };
    for (const l of tilesAt(t.s, 1)) {
        const k = `${l.x},${l.y}`;
        if (taken.has(k) || ctx.stepTo.has(k) || !safeFrom(l) || same(l, u.location)) continue;
        if (onWater(l) || safe(() => GameplayMap.isImpassable(l.x, l.y), false) || hazardAt(l) > 0 || !roomForSoldier(l)) continue;
        if ((safe(() => MapUnits.getUnits(l.x, l.y), []) ?? []).some((id) => safe(() => Units.get(id), null)?.owner !== pid())) continue;
        const p = pre(l);
        if (best && p >= best.score) continue;
        const turns = pathTurns(u, l);
        if (turns === null || turns > SKIRMISH.TURNS || startsWar(u, l)) continue;
        const score = p + turns * SKIRMISH.WALK_COST;
        if (!best || score < best.score) best = { loc: l, turns, score };
    }
    return best ? { loc: best.loc, turns: best.turns, inRange: inRange(best.loc) } : null;
}

/**
 * A skirmish with a hostile village next to our land (core SKIRMISH; the user, after game 58). The free ranged soldiers (the
 * defence's supply, healthy) and those already shooting there take posts within range of its soldiers; a general (the
 * vanguard first) stands where its radius covers the most of them, safe (commanderSafeAt), unpacking its army there; the strike
 * step shoots (shootRaiders: soldiers we are at war with), again after this step when they arrived (SKIRMISH_POST). A hurt one
 * leaves (it escapes or heals) and the next pass takes a fresh one. Not while a hunt, a raider hunt or a campaign runs. Its
 * shooters and general are ordered for the pass (ctx.ordered), so the vanguard's rally and the unit loop leave them alone.
 * @returns log entries
 */
function skirmishStep(units, ctx) {
    const out = [];
    if (fieldOp || campaign) return out;
    const t = skirmishTarget(units, ctx);
    if (!t) {
        // Why none, every SKIRMISH.NONE_EVERY turns (W9: game 60 had no `skirmish:` line in 140 turns).
        if (skirmishNoneNoted < 0 || Game.turn < skirmishNoneNoted || Game.turn - skirmishNoneNoted >= SKIRMISH.NONE_EVERY) {
            skirmishNoneNoted = Game.turn;
            log.info(`skirmish: none: ${skirmishWhy(units, ctx)}`);
        }
        return out;
    }
    const taken = new Set();
    const shooters = [];
    const byDist = (u) => plotDist(u.location, t.v);
    // Those shooting there already (not posted elsewhere), then the free ones, the nearest first.
    const here = units.filter((u) => {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const k = unitKey(u.id);
        return def && isRangedGuard(def) && !u.isCommanderUnit && u.isOnMap !== false && u.location && !ctx.ordered.has(k) && !ctx.posts.has(k)
            && !ctx.garrison.has(k) && !inField(k) && !inCampaign(k) && (Number(u.Health?.damage) || 0) < SKIRMISH.HURT
            && plotDist(u.location, t.s) <= 1;
    });
    const free = (ctx.supply ?? []).filter((c) => c.ranged && !c.siege && !c.packed && c.stage && !ctx.posts.has(c.k) && !ctx.ordered.has(c.k)
        && c.from === undefined && c.atFront === undefined && !inField(c.k) && !inCampaign(c.k) && (Number(c.u.Health?.damage) || 0) < SKIRMISH.HURT).map((c) => c.u);
    for (const u of [...here.sort((a, b) => byDist(a) - byDist(b)), ...free.filter((u) => !here.includes(u)).sort((a, b) => byDist(a) - byDist(b))]) {
        if (shooters.length >= SKIRMISH.SHOOTERS) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || u.canMove === false) continue;
        const post = skirmishPost(u, def, t, taken, ctx);
        if (!post) continue;
        const k = unitKey(u.id);
        taken.add(`${post.loc.x},${post.loc.y}`);
        ctx.ordered.add(k);
        if (post.turns > 0 && u.hasMoved !== true) {
            wakeUnit(u);
            if (moveTo(u, post.loc)) {
                restedByUs.delete(k);
                out.push({ key: "SKIRMISH_POST", args: [nameOf(def), t.name] });
            }
        }
        shooters.push({ u, at: post.loc, turns: post.turns });
    }
    if (shooters.length === 0) {
        if (skirmishNoted !== Game.turn) {
            skirmishNoted = Game.turn;
            log.info(`skirmish: none: ${t.name} at ${where(t.v)}: no ranged soldier of ours reaches a post within ${SKIRMISH.TURNS} turns`);
        }
        return out;
    }
    // Its general: the vanguard first, any land commander not posted at a threatened settlement, reaching it in time.
    const threatened = new Set(ctx.threats.map((x) => `${x.settlement.x},${x.settlement.y}`));
    const aim = t.s;
    const cmdr = landCommanders(units).filter((c) => c.isOnMap !== false && c.location && !ctx.ordered.has(unitKey(c.id)) && !inField(unitKey(c.id)) && !inCampaign(unitKey(c.id))
        && !threatened.has(goals.get(unitKey(c.id))?.post ?? "") && !marching(c))
        .map((c) => ({ c, turns: pathTurns(c, aim), vanguard: ctx.commanderRoles?.get(unitKey(c.id)) === "VANGUARD" }))
        .filter((x) => x.turns !== null && x.turns <= SKIRMISH.COMMANDER_TURNS)
        .sort((a, b) => Number(b.vanguard) - Number(a.vanguard) || a.turns - b.turns)[0]?.c ?? null;
    let cmdrText = "none";
    if (cmdr) {
        const ck = unitKey(cmdr.id);
        const def = safe(() => GameInfo.Units.lookup(cmdr.type), null);
        ctx.ordered.add(ck);
        // Its packed soldiers come out by the shooters (they fight; packed they cannot).
        const packed = packedSoldiers(cmdr, units);
        if (packed.length > 0 && plotDist(cmdr.location, aim) <= 2 && unpackToward(cmdr, aim)) {
            out.push({ key: "SKIRMISH_UNPACKED", args: [nameOf(def), packed.length, t.name] });
            cmdrText = `${typeOf(cmdr)} ${where(cmdr.location)} unpacks ${packed.length}`;
        } else {
            const shields = new Set((ctx.ourUnits ?? []).filter((x) => x.isOnMap !== false && x.location && !x.isCommanderUnit && isMeleeGuard(safe(() => GameInfo.Units.lookup(x.type), null))
                && (Number(x.Health?.damage) || 0) < SHIELD_DAMAGE).map((x) => `${x.location.x},${x.location.y}`));
            let best = null;
            for (const l of tilesAt(aim, 2)) {
                const lk = `${l.x},${l.y}`;
                const shielded = shields.has(lk);
                if (!shielded && taken.has(lk)) continue;
                if (onWater(l) || safe(() => GameplayMap.isImpassable(l.x, l.y), false) || hazardAt(l) > 0) continue;
                if ((safe(() => MapUnits.getUnits(l.x, l.y), []) ?? []).some((id) => safe(() => Units.get(id), null)?.owner !== pid())) continue;
                if (!commanderSafeAt(l, units, ctx) && !(same(l, cmdr.location) && armyShields(cmdr, units))) continue;
                const covered = shooters.filter((s) => plotDist(s.at, l) <= 1).length;
                if (covered === 0) continue;
                const turns = same(l, cmdr.location) ? 0 : pathTurns(cmdr, l);
                if (turns === null || turns > SKIRMISH.COMMANDER_TURNS) continue;
                const score = covered * 20 + (shielded ? 10 : 0) + (same(l, t.s) ? 15 : 0) - turns * 5 - plotDist(cmdr.location, l);
                if (!best || score > best.score) best = { l, score, covered };
            }
            if (best && !same(best.l, cmdr.location)) {
                const p = pathTo(cmdr, best.l);
                const stop = p && p.turns > 1 ? turnStop(p) : null;
                const loc = stop && !commanderSafeAt(stop, units, ctx) && def ? commanderAdvance(cmdr, def, best.l, units, ctx) : best.l;
                if (loc && moveTo(cmdr, loc)) out.push({ key: "SKIRMISH_COMMANDER", args: [nameOf(def), t.name] });
                cmdrText = `${typeOf(cmdr)} ${where(cmdr.location)} -> ${where(loc ?? best.l)} covers ${best.covered}`;
            } else if (best) cmdrText = `${typeOf(cmdr)} ${where(cmdr.location)} stays over ${best.covered}`;
            else if (def) {
                const loc = commanderAdvance(cmdr, def, aim, units, ctx);
                if (loc && moveTo(cmdr, loc)) out.push({ key: "SKIRMISH_COMMANDER", args: [nameOf(def), t.name] });
                cmdrText = `${typeOf(cmdr)} ${where(cmdr.location)} advances${loc ? ` to ${where(loc)}` : " (no safe tile)"}`;
            }
        }
    }
    if (skirmishNoted !== Game.turn) {
        skirmishNoted = Game.turn;
        log.warn(`skirmish: ${t.name} at ${where(t.v)}: their soldiers ${t.enemies.length} [${t.enemies.map((e) => `${where(e)}${e.melee ? "" : " ranged"}`).join("; ")}]; shooters [${shooters.map((s) => `${typeOf(s.u)} ${where(s.u.location)}${s.turns > 0 ? ` -> ${where(s.at)} ${s.turns}t` : ""}${s.u.Health?.damage ? ` -${s.u.Health.damage}` : ""}`).join("; ")}]; commander ${cmdr ? `${cmdrText} (${xpText(cmdr)})` : "none"}`);
    }
    return out;
}

/**
 * A melee strike on a soldier next to `u` when the game's preview says it pays (tradePays: strikeWorthIt, a general's radius, a
 * lone commander), not one left to a raider hunt's general (`hold`). Only a member with a move and an attack left, and only a
 * strike the game carried out (a Combat event naming it) counts (W10, game 60 T109: three attack-moves sent by a Warrior
 * FIELD_ADVANCE had spent, logged FIELD_STRUCK, no fight). @returns the target tile or null
 */
async function fieldStrike(u, targets, hold = null) {
    const M = globalThis.UnitOperationMoveModifiers;
    const MOVE = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    if (M?.ATTACK === undefined) return null;
    if (!(Number(u.Combat?.attacksRemaining) > 0) || !(Number(u.Movement?.movementMovesRemaining ?? 1) > 0)) return null;
    const ourMax = Number(u.Health?.maxDamage) || 100;
    const ourHealth = ourMax - (Number(u.Health?.damage) || 0);
    let best = null;
    for (const t of targets) {
        if (plotDist(u.location, t) !== 1 || heldFor(hold, u, t)) continue;
        const args = { X: t.x, Y: t.y, Modifiers: M.ATTACK };
        if (!safe(() => Game.UnitOperations.canStart(u.id, MOVE, args, false), null)?.Success) continue;
        const r = await simulateAttack(u, t);
        if (!r?.Attacker || !r?.Defender) continue;
        const enemy = safe(() => Units.get(r.Defender.ID ?? t.id), null);
        const theirMax = Number(r.Defender.MaxHitPoints ?? enemy?.Health?.maxDamage) || 100;
        const theirHealth = theirMax - (Number(enemy?.Health?.damage) || 0);
        const dealt = Number(r.Defender.DamageTo) || 0;
        const taken = Number(r.Attacker.DamageTo) || 0;
        if (!tradePays(u, t, { answered: true, ourHealth, ourMax, theirHealth, dealt, taken })) continue;
        const score = (dealt >= theirHealth ? 1000 : 0) + dealt - taken;
        if (!best || score > best.score) best = { t, score };
    }
    if (!best) return null;
    Game.UnitOperations.sendRequest(u.id, MOVE, { X: best.t.x, Y: best.t.y, Modifiers: M.ATTACK + (M.MOVE_IGNORE_UNEXPLORED_DESTINATION ?? 0) });
    if (await untilCombatOf(u.id, COMBAT_WAIT_MS)) return best.t;
    log.info(`field: ${typeOf(u)} strike on ${where(best.t)} not carried out (no Combat in ${COMBAT_WAIT_MS} ms)`);
    return null;
}

/**
 * The fight's attacks (from the hud's strike step, after the raiders' strikes and shots, and again after the unit step):
 * melee members strike a soldier of theirs next to them when the preview pays; in a hunt, with no soldier of theirs on the
 * village, a member next to it steps onto it to disperse it (disperseArrivals then; DISPERSE_INDEPENDENT works with no move
 * left), the vanguard beside it. Ranged members shoot in the strike step (shootRaiders: soldiers we are at war with).
 * @returns log entries
 */
export async function fieldAssault() {
    const out = [];
    const op = fieldOp;
    if (!op || op.stage !== "FIGHT") return out;
    const anchor = op.kind === "WAR" ? op.staging : op.target;
    const depth = op.kind === "HUNT" ? HUNT.ENEMY_RADIUS + 1 : op.kind === "RAIDERS" ? RAIDER.ENEMY_RADIUS + 1 : TRAINING.DEPTH;
    const members = () => (safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])
        .filter((u) => op.members.has(unitKey(u.id)) && u.isOnMap !== false && u.location);
    // A raider hunt's members out of its coming general's radius leave the raider to it (W5: raiderHold).
    const hold = raiderHold(safe(() => Players.get(pid()).Units.getUnits(), []) ?? []);
    for (const u of members()) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || campaignRanged(def) || !isSoldier(def) || !(Number(u.Combat?.attacksRemaining) > 0)) continue;
        const targets = soldiersOf(op.enemy, anchor, depth, { commanders: op.kind === "RAIDERS" }).tiles;
        const hit = await fieldStrike(u, targets, hold);
        if (hit) out.push({ key: "FIELD_STRUCK", args: [nameOf(def), op.target.name, hit.x, hit.y] });
    }
    if (op.kind !== "HUNT") return out;
    // The village: empty of their soldiers, a member steps onto it (or stands there: it disperses it now).
    if (soldiersOf(op.enemy, op.target, 0).n > 0) return out;
    const ctx = {};
    for (const u of members()) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || !isSoldier(def) || def.Domain !== "DOMAIN_LAND") continue;
        if (same(u.location, op.target)) {
            const e = safe(() => disperseHere(u, def, ctx), null);
            if (e) out.push(e);
            return out;
        }
    }
    const walker = members().map((u) => ({ u, def: safe(() => GameInfo.Units.lookup(u.type), null) }))
        .filter(({ u, def }) => def && isSoldier(def) && !campaignRanged(def) && u.canMove !== false && plotDist(u.location, op.target) <= 2)
        .map((x) => ({ ...x, turns: pathTurns(x.u, op.target) })).filter((x) => x.turns !== null && x.turns <= 1)
        .sort((a, b) => (Number(a.u.Health?.damage) || 0) - (Number(b.u.Health?.damage) || 0))[0];
    if (!walker || !moveTo(walker.u, op.target)) return out;
    goals.set(unitKey(walker.u.id), { field: op.key, disperse: `${op.target.x},${op.target.y}`, turn: Game.turn });
    out.push({ key: "DISPERSE_MOVE", args: [nameOf(walker.def), op.target.name, op.target.x, op.target.y] });
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
    return hazardInfo(loc).damage;
}

/**
 * What a tile deals at a turn's start, and for how long: { damage (hazardAt), turns } (turns: the longest of its damaging
 * effects' `duration`, as the game's plot tooltip shows it (plot-tooltip helpers.js getVisiblePlotEffects), PLAGUE.TURNS_UNKNOWN
 * when it gives none; 0 on a safe tile).
 */
export function hazardInfo(loc) {
    const idx = loc ? safe(() => GameplayMap.getIndexFromXY(loc.x, loc.y), -1) : -1;
    if (!(idx >= 0)) return { damage: 0, turns: 0 };
    if (passMemo?.hazards.has(idx)) return passMemo.hazards.get(idx);
    const h = hazardNow(idx);
    passMemo?.hazards.set(idx, h);
    return h;
}

function hazardNow(idx) {
    let damage = 0;
    const durations = [];
    for (const e of safe(() => MapPlotEffects.getPlotEffects(idx), []) ?? []) {
        const def = safe(() => GameInfo.PlotEffects.lookup(e.effectType), null);
        if (!def || truthy(def.TriggerOnEnter) || !(Number(def.Damage) > 0)) continue;
        damage = Math.max(damage, Number(def.Damage) || 0);
        durations.push(e.duration);
    }
    return { damage, turns: damage > 0 ? hazardTurns(durations) : 0 };
}

/** What a way's end-of-turn stop (a plot index) deals at the next turn's start: its hazard while it lasts until that turn. */
function stopHazard(idx, turn) {
    const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
    if (!loc) return 0;
    const h = hazardInfo(loc);
    return h.turns >= turn ? h.damage : 0;
}

/** The hazard's damage a walk takes at its end-of-turn stops before its destination (core turnStops, wayCost). */
function wayHazard(u, p) {
    const start = safe(() => GameplayMap.getIndexFromXY(u.location.x, u.location.y), -1);
    return wayCost(turnStops(p, start), { hazard: stopHazard });
}

/** The tiles a unit reaches this turn lie within this radius: its moves left (2 when unknown), at most STEP_AWAY_MAX. */
function reachRadius(u) {
    const moves = Math.floor(Number(u?.Movement?.movementMovesRemaining ?? 2));
    return Math.max(1, Math.min(STEP_AWAY_MAX, Number.isFinite(moves) ? moves : 2));
}

const HAZARD_HOLD_HEALTH = 0.5; // with a hostile unit next to it a soldier above this health share holds its tile
// A safe tile next to the plague is caught next (game 48: 60 moves off plague tiles at A63-A67 and E55-E67, each to the nearest
// safe tile, and our land units fell 23 -> 18 over E61-E67 with one loss in combat): a tile next to one counts this much more
// walking, one 2 away half of it.
const HAZARD_EDGE = 4;

/** Whether a hazardous tile lies within `r` of this one (the plague spreads to its neighbours). */
function hazardWithin(loc, r) {
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, r), []) ?? []) {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (at && !same(at, loc) && hazardAt(at) > 0) return true;
    }
    return false;
}

/**
 * Does this unit hold its hazardous tile? A healthy soldier holds a settlement's centre with raiders within DANGER_RADIUS (an
 * empty centre is taken); elsewhere only an enemy next to it holds it there (game 48: within 3 kept units on plague tiles at
 * the fronts). @returns the reason or null
 */
function holdsHazard(u, def, ctx) {
    const health = 1 - (Number(u.Health?.damage) || 0) / (Number(u.Health?.maxDamage) || 100);
    const centre = !!settlementAt(u.location);
    if (!isSoldier(def) || !(health > HAZARD_HOLD_HEALTH) || !hostileNear(u.location, centre ? DANGER_RADIUS : 1, ctx)) return null;
    return centre ? "holds the centre: raiders near" : "holds: a hostile unit next to it";
}

/**
 * A clean tile a unit on a hazard may go to, or why not: { score } (the nearest, our land, clear of the hazard's edge:
 * HAZARD_EDGE) or { why } ("infected", "taken", "impassable", "water", "marks"). `room`: none of its kind stands there (off:
 * a tile one of our soldiers may free for it).
 */
function hazardRefuge(u, def, ctx, loc, { room = true } = {}) {
    const here = u.location;
    const key = `${loc.x},${loc.y}`;
    if (hazardAt(loc) > 0) return { why: "infected" };
    const kept = ctx.plagueReserved?.get(key);
    if ((kept !== undefined && kept !== unitKey(u.id)) || ctx.stepTo.has(key) || (room && !roomFor(def, loc))) return { why: "taken" };
    if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) return { why: "impassable" };
    // Land for a land unit (a navigable river would embark it); water or a navigable river for a ship.
    if (!standsOn(def, loc)) return { why: "water" };
    // Our units' hit spots near it count, not those around the tile it leaves (dangerNear's `from`; game 60: our Quadrireme's
    // own attacks from 66,5 kept 65,5 out at T133).
    if (!ctx.bold && marksNear(loc, 1, here)) return { why: "marks" };
    const ours = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid();
    const d = safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), 9);
    const edge = hazardWithin(loc, 1) ? HAZARD_EDGE : hazardWithin(loc, 2) ? HAZARD_EDGE / 2 : 0;
    return { score: d + (ours ? 0 : 2) + edge };
}

/**
 * A unit on a hazardous tile (hazardAt) leaves it by the cheapest way (core escapeWays; game 60, research/game60: Астрахань's
 * Warrior, Slinger and Spearman found no clean tile reached in one turn at T133 and stood on the plague until it killed them at
 * T135-T137, while 2-turn ways out cost at most 25): the nearest PLAGUE.PATHS clean tiles within PLAGUE.LOOK (hazardRefuge),
 * reached within PLAGUE.ESCAPE_TURNS, each costing the plague's damage at its end-of-turn stops while it lasts there and
 * PLAGUE.HOSTILE_COST for a stop next to a hostile unit, when that costs less than staying (the damage for each turn the plague
 * still lasts here: MapPlotEffects `duration`). A resting or fortified one is woken; a healthy soldier with hostile units near
 * holds its tile (holdsHazard). A walk of several turns carries the goal { hazard } and is checked every pass (checkWalks).
 * @returns a log entry or null (ctx.hazardWhy says why it stays)
 */
function leaveHazard(u, def, ctx) {
    const here = u.location;
    const { damage, turns: left } = hazardInfo(here);
    if (!(damage > 0) || def.CanBeDamaged === false || def.CanBeDamaged === "false") return null;
    const k = unitKey(u.id);
    const why = (reason) => {
        (ctx.hazardWhy ??= new Map()).set(k, reason);
        return null;
    };
    const hold = holdsHazard(u, def, ctx);
    if (hold) return why(hold);
    const refused = {};
    const count = (w) => {
        refused[w] = (refused[w] ?? 0) + 1;
    };
    // The game's ways are asked for the tiles it likely reaches soonest (its moves a turn), the best scored first.
    const radius = reachRadius(u);
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, PLAGUE.LOOK), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here)) continue;
        const t = hazardRefuge(u, def, ctx, loc);
        if (t.why) count(t.why);
        else tiles.push({ loc, score: t.score, guess: Math.ceil(safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), 9) / radius) });
    }
    tiles.sort((a, b) => a.guess - b.guess || a.score - b.score);
    const start = safe(() => GameplayMap.getIndexFromXY(here.x, here.y), -1);
    const hostile = (idx) => {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        return !!at && hostileNear(at, 1, ctx);
    };
    const options = [];
    let asked = 0;
    for (const t of tiles) {
        // Farther than its moves take it in PLAGUE.ESCAPE_TURNS: not asked.
        if (t.guess > PLAGUE.ESCAPE_TURNS) {
            count(`beyond ${PLAGUE.ESCAPE_TURNS} turns`);
            continue;
        }
        if (asked >= PLAGUE.PATHS) {
            count("not asked");
            continue;
        }
        asked++;
        const p = pathTo(u, t.loc);
        if (!p) count("unreachable");
        else if (p.turns > PLAGUE.ESCAPE_TURNS) count(`beyond ${PLAGUE.ESCAPE_TURNS} turns`);
        else if (startsWar(u, t.loc)) count("war");
        else {
            const stops = turnStops(p, start);
            const cost = wayCost(stops, { hazard: stopHazard, hostile });
            // The stops it takes on the plague knowingly (checkWalks re-plans only for others).
            const infected = stops.slice(0, -1).filter((idx, i) => stopHazard(idx, i + 1) > 0);
            options.push({ ...t, turns: Math.max(1, p.turns), cost, infected });
            // Nothing beats the best scored clean tile reached this turn with no hostile unit next to it.
            if (cost === 0 && p.turns <= 1) break;
        }
    }
    const stay = damage * left;
    const ways = escapeWays(options, stay);
    if (ways.length > 0) wakeUnit(u);
    for (const w of ways) {
        if (!moveTo(u, w.loc, { throughHazard: true })) {
            count("move refused");
            continue;
        }
        ctx.stepTo.add(`${w.loc.x},${w.loc.y}`);
        if (w.turns <= 1) return { key: "LEFT_HAZARD", args: [nameOf(def), w.loc.x, w.loc.y, damage] };
        // Its errand (a site, a village, a post) waits under the walk and comes back once it ends (endHazardWalk).
        const was = goals.get(k);
        goals.set(k, { hazard: `${w.loc.x},${w.loc.y}`, cost: w.cost, infected: w.infected, turn: Game.turn, was: was?.hazard !== undefined ? was.was : was });
        return { key: "LEFT_HAZARD_WALK", args: [nameOf(def), w.loc.x, w.loc.y, stay, w.turns, w.cost] };
    }
    const cheapest = [...options].sort((a, b) => a.cost - b.cost || a.turns - b.turns)[0];
    const parts = Object.entries(refused).map(([w, n]) => `${n} ${w}`);
    // Packing into a commander's army next to it is not tried (PLG-3): whether a hurt unit may join one and whether packed units
    // are spared the plague's damage are unproven; UI.log names the case.
    const cmdr = (ctx.ourUnits ?? []).find((c) => c.isCommanderUnit && c.isOnMap !== false && c.location && isLandCommander(safe(() => GameInfo.Units.lookup(c.type), null))
        && safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, here.x, here.y), 9) === 1 && !(hazardAt(c.location) > 0));
    return why(`no way out: ${parts.join(", ") || "no tile"}${cheapest ? `; the cheapest costs ${cheapest.cost} in ${cheapest.turns}t to ${cheapest.loc.x},${cheapest.loc.y}` : ""}; staying costs ${stay}`
        + `${cmdr ? `; a commander's army next to it at ${cmdr.location.x},${cmdr.location.y} (packing not tried)` : ""}`);
}

/** A clean tile with room this unit reaches this turn with no hostile unit next to it (the cheapest way out), the best by hazardRefuge. */
function freeRefuge(u, def, ctx) {
    const here = u.location;
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, reachRadius(u)), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here)) continue;
        const t = hazardRefuge(u, def, ctx, loc);
        if (!t.why && !hostileNear(loc, 1, ctx)) tiles.push({ loc, score: t.score });
    }
    tiles.sort((a, b) => a.score - b.score);
    for (const t of tiles) {
        const turns = pathTurns(u, t.loc);
        if (turns !== null && turns <= 1 && !startsWar(u, t.loc)) return t.loc;
    }
    return null;
}

/** Where a soldier of ours freeing a tile for a unit on the plague steps to: a clean tile it reaches this turn, never `avoid`. */
function stepOffFor(b, bdef, avoid, ctx) {
    const from = b.location;
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(from.x, from.y, reachRadius(b)), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        const key = loc ? `${loc.x},${loc.y}` : "";
        if (!loc || same(loc, from) || same(loc, avoid) || hazardAt(loc) > 0 || ctx.stepTo.has(key) || ctx.plagueReserved?.has(key)) continue;
        if (!roomFor(bdef, loc) || !standsOn(bdef, loc) || safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || hostileNear(loc, 1, ctx)) continue;
        const ours = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid();
        const edge = hazardWithin(loc, 1) ? HAZARD_EDGE : 0;
        tiles.push({ loc, score: safe(() => GameplayMap.getPlotDistance(from.x, from.y, loc.x, loc.y), 9) + (ours ? 0 : 2) + edge });
    }
    tiles.sort((a, b2) => a.score - b2.score);
    for (const t of tiles) {
        const turns = pathTurns(b, t.loc);
        if (turns !== null && turns <= 1 && !startsWar(b, t.loc)) return t.loc;
    }
    return null;
}

/**
 * A tile freed for a unit on the plague: a clean one it reaches this turn where exactly one soldier of ours stands, healthy
 * (hurt less than ESCAPE_DAMAGE), free to move and not ordered this pass, that steps to another clean tile it reaches
 * (stepOffFor). The unit moves in once it has gone (plagueArrivals). @returns a log entry or null
 */
function makePlagueRoom(u, def, ctx) {
    const here = u.location;
    const A = globalThis.UnitActivityTypes;
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, reachRadius(u)), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here)) continue;
        const there = (safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []).map((id) => safe(() => Units.get(id), null));
        if (there.length === 0 || there.some((o) => !o || o.owner !== pid())) continue;
        const soldiers = there.filter((o) => isSoldier(safe(() => GameInfo.Units.lookup(o.type), null)));
        if (soldiers.length !== 1) continue;
        const t = hazardRefuge(u, def, ctx, loc, { room: false });
        if (t.why || hostileNear(loc, 1, ctx)) continue;
        tiles.push({ loc, b: soldiers[0], score: t.score });
    }
    tiles.sort((a, b) => a.score - b.score);
    for (const t of tiles) {
        const b = t.b;
        const bk = unitKey(b.id);
        const bdef = safe(() => GameInfo.Units.lookup(b.type), null);
        if (!bdef || b.isCommanderUnit || b.canMove === false || b.hasMoved === true || ctx.ordered.has(bk) || inCampaign(bk) || inField(bk)) continue;
        // One with a post or a formation move of its own goes there (the defence's).
        if (ctx.posts?.has(bk) || ctx.formation?.has(bk)) continue;
        if ((Number(b.Health?.damage) || 0) >= ESCAPE_DAMAGE || (A && b.activityType === A.OPERATION)) continue;
        const turns = pathTurns(u, t.loc);
        if (turns === null || turns > 1 || startsWar(u, t.loc)) continue;
        const to = stepOffFor(b, bdef, here, ctx);
        if (!to) continue;
        wakeUnit(b);
        if (!moveTo(b, to)) continue;
        restedByUs.delete(bk);
        ctx.stepTo.add(`${to.x},${to.y}`);
        ctx.stepTo.add(`${t.loc.x},${t.loc.y}`);
        ctx.ordered.add(bk);
        ctx.ordered.add(unitKey(u.id));
        plagueRooms.set(unitKey(u.id), { x: t.loc.x, y: t.loc.y, turn: Game.turn });
        return { key: "PLAGUE_ROOM", args: [nameOf(bdef), nameOf(def), t.loc.x, t.loc.y] };
    }
    return null;
}

/**
 * Room on the plague's way out (game 60 T133: our own Archer stood on 67,7, the one clean tile Астрахань's three infected units
 * reached that turn; it could have stepped aside, and none of them left): the units on hazardous tiles that will leave
 * (holdsHazard aside), the most hurt first (their damage and the tile's against their health). Each keeps the clean free tile it
 * reaches this turn (ctx.plagueReserved, which leaveHazard honours); one with none gets a tile freed (makePlagueRoom), one a pass
 * and settlement, and moves in after (plagueArrivals); the others take a longer way (leaveHazard). Before the unit loop.
 * @returns log entries
 */
function planPlagueRooms(units, ctx) {
    const out = [];
    ctx.plagueReserved = new Map();
    const A = globalThis.UnitActivityTypes;
    const list = [];
    for (const u of units) {
        const k = unitKey(u.id);
        if (u.isOnMap === false || !u.location || u.canMove === false || u.hasMoved === true || ctx.ordered.has(k)) continue;
        if (A && u.activityType === A.OPERATION && !ctx.walkCancelled?.has(k)) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || def.CanBeDamaged === false || def.CanBeDamaged === "false") continue;
        const damage = hazardAt(u.location);
        if (!(damage > 0) || holdsHazard(u, def, ctx)) continue;
        list.push({ u, def, k, hurt: ((Number(u.Health?.damage) || 0) + damage) / (Number(u.Health?.maxDamage) || 100) });
    }
    if (list.length === 0) return out;
    list.sort((a, b) => b.hurt - a.hurt);
    const centres = ourCentres();
    const freed = new Set(); // settlements that freed a tile this pass
    for (const x of list) {
        const free = freeRefuge(x.u, x.def, ctx);
        if (free) {
            ctx.plagueReserved.set(`${free.x},${free.y}`, x.k);
            continue;
        }
        // One soldier of ours blocks only another soldier (one military unit a tile).
        if (!isSoldier(x.def)) continue;
        const home = [...centres].sort((a, b) => plotDist(a, x.u.location) - plotDist(b, x.u.location))[0];
        const s = home ? `${home.x},${home.y}` : "field";
        if (freed.has(s)) continue;
        const e = makePlagueRoom(x.u, x.def, ctx);
        if (!e) continue;
        freed.add(s);
        out.push(e);
    }
    return out;
}

/**
 * Units on the plague move into the tiles our soldiers freed for them this pass (PLAGUE_ROOM), once the game shows those tiles
 * free; the hud calls this right after the unit step. One still taken waits for the next pass. @returns log entries
 */
export function plagueArrivals() {
    const out = [];
    for (const u of safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
        const k = unitKey(u.id);
        const r = plagueRooms.get(k);
        if (!r || r.turn !== Game.turn || !u.location) continue;
        plagueRooms.delete(k);
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def) continue;
        const damage = hazardAt(u.location);
        if (!roomFor(def, r) || !moveTo(u, r, { throughHazard: true })) {
            log.info(`plague: ${def.UnitType} at ${u.location.x},${u.location.y} did not move into ${r.x},${r.y}: ${roomFor(def, r) ? "the move was refused" : "still taken"}`);
            continue;
        }
        out.push({ key: "LEFT_HAZARD", args: [nameOf(def), r.x, r.y, damage] });
    }
    for (const [k, r] of [...plagueRooms]) if (r.turn !== Game.turn) plagueRooms.delete(k);
    return out;
}

/**
 * Walks that would stop on the plague (game 60: every walk of several turns was blind to it: moveTo checked only the
 * destination, and leaveHazard skips units on their way): a unit on its way whose destination is now hazardous, or whose next
 * end-of-turn stop is while it lasts, has its order cancelled (UNITCOMMAND_CANCEL, as releaseStuckMoves) and is re-planned:
 * leaveHazard takes it this pass when it stands on a hazard (ctx.walkCancelled), else its own step next pass (moveTo then
 * goes around the plague a turn at a time, cleanStep, or waits). A way out of the plague (goal { hazard }) is cancelled only for a stop infected since it
 * was chosen, and its goal ends once the unit stops (the errand it had comes back). @returns log entries
 */
function checkWalks(units, ctx) {
    const out = [];
    ctx.walkCancelled = new Set();
    const A = globalThis.UnitActivityTypes;
    if (!A) return out;
    for (const u of units) {
        const k = unitKey(u.id);
        const g = goals.get(k);
        if (u.activityType !== A.OPERATION || u.isOnMap === false || !u.location) {
            endHazardWalk(k, g);
            continue;
        }
        const dest = safe(() => Units.getQueuedOperationDestination(u.id), null);
        if (!dest || !(dest.x >= 0) || same(dest, u.location)) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!def || def.CanBeDamaged === false || def.CanBeDamaged === "false") continue;
        let bad = hazardAt(dest) > 0 ? "its destination" : null;
        // Its next stop lies within a turn's move: with no hazard that close, no way is asked of the game.
        if (!bad && hazardWithin(u.location, reachRadius(u))) {
            const p = pathTo(u, dest);
            if (!p) continue;
            // Not a unit that stays where it stands this turn (no move left): its next stop is its own tile.
            const start = safe(() => GameplayMap.getIndexFromXY(u.location.x, u.location.y), -1);
            const stops = turnStops(p, start);
            if (g?.hazard !== undefined) {
                // A way out of the plague: only a stop on it that was clean when it was chosen and is infected now.
                const known = new Set(g.infected ?? []);
                bad = stops.slice(0, -1).some((idx, i) => idx !== start && !known.has(idx) && stopHazard(idx, i + 1) > 0) ? "a stop on its way out" : null;
            } else bad = stops.length > 1 && stops[0] !== start && stopHazard(stops[0], 1) > 0 ? "its next stop" : null;
        }
        if (!bad) continue;
        const CANCEL = "UNITCOMMAND_CANCEL";
        if (!safe(() => Game.UnitCommands.canStart(u.id, CANCEL, NO_TARGET, false), null)?.Success) continue;
        Game.UnitCommands.sendRequest(u.id, CANCEL, { ...NO_TARGET });
        endHazardWalk(k, g);
        // A guard on its way is one no longer (guardProgress reads its move order, which the game drops only later): the
        // defence plan sends it again this pass, around the plague (moveTo).
        if (goals.get(k)?.guard !== undefined) goals.delete(k);
        ctx.walkCancelled.add(k);
        log.info(`plague: ${def.UnitType} at ${u.location.x},${u.location.y} walking to ${dest.x},${dest.y}: ${bad} is on the plague, the order is cancelled`);
        out.push({ key: "WALK_HAZARD", args: [nameOf(def), dest.x, dest.y] });
    }
    return out;
}

/** A way out of the plague ends (the unit stopped, or its walk was cancelled): the errand it had before comes back. */
function endHazardWalk(k, g) {
    if (g?.hazard === undefined) return;
    if (g.was) goals.set(k, g.was);
    else goals.delete(k);
}

/**
 * UI.log once a turn while units of ours stand on a hazardous tile after the unit step (research/game48: the plague's losses
 * could not be told from the logs): each one, its damage, the plague's turns left there and why it stayed (game 60: why each
 * tile was refused).
 */
function logPlague(units, ctx, ordered) {
    const left = [];
    for (const u of units) {
        const k = unitKey(u.id);
        if (u.isOnMap === false || !u.location) continue;
        // Not one sent off it by any step (game 60: a Migrant resettle sent away was listed as stuck); not one an earlier step
        // ordered (its reason is not ours to give); one that holds it and then fortifies is listed.
        const sent = movesSent.get(k);
        if (sent?.turn === Game.turn && !same(sent, u.location) && !(hazardAt(sent) > 0)) continue;
        if (ordered.has(k) && !ctx.hazardWhy?.has(k)) continue;
        const { damage, turns } = hazardInfo(u.location);
        if (!(damage > 0)) continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const A = globalThis.UnitActivityTypes;
        const why = ctx.hazardWhy?.get(k) ?? (A && u.activityType === A.OPERATION ? "on its way" : u.canMove === false ? "no moves" : "not looked at");
        left.push(`${def?.UnitType ?? "?"} at ${u.location.x},${u.location.y} hurt ${Number(u.Health?.damage) || 0}, ${damage} a turn for ${turns} more turn(s) (${why})`);
    }
    if (left.length === 0 || plagueNoted === Game.turn) return;
    plagueNoted = Game.turn;
    log.info(`plague: ${left.length} unit(s) of ours on hazardous tiles (a way out looked for within ${PLAGUE.LOOK} tiles and ${PLAGUE.ESCAPE_TURNS} turns): ${left.join("; ")}`);
}
let plagueNoted = -1;

// ---- the generals (research/41 Phase 2) ---------------------------------------------------------------

/** has(promotion type) for a unit, through its promotion class's disciplines (as promoteUnits reads them). */
function promotionHas(u, def, { chosen = false } = {}) {
    const discipline = new Map();
    GameInfo.UnitPromotionClassSets?.forEach((set) => {
        if (set.PromotionClassType !== def?.PromotionClass) return;
        GameInfo.UnitPromotionDisciplineDetails?.filter((d) => d.UnitPromotionDisciplineType === set.UnitPromotionDisciplineType)
            .forEach((d) => discipline.set(d.UnitPromotionType, set.UnitPromotionDisciplineType));
    });
    const free = chosen ? freePromotions() : null;
    return (p) => discipline.has(p) && !free?.has(p) && !!safe(() => u.Experience?.hasPromotion(discipline.get(p), p), false);
}

let freePromotionIndex = null; // { source, set }: the promotions the game hands out through an effect

/**
 * Promotions the game grants through an effect (EFFECT_GRANT_UNIT_PROMOTION naming a UnitPromotionType): every commander
 * gets them, so they are no choice of ours and decide no role (`promotionHas(…, {chosen: true})`). Game 55: Rome's Cursus
 * honorum gave every Army Commander Bulwark, a Bastion promotion, at A34; all three generals read BASTION from then on, so
 * there was no vanguard (no packed army, no raids watched) and the next promotion went to Steadfast instead of Mobility.
 */
function freePromotions() {
    const source = GameInfo.ModifierArguments;
    if (freePromotionIndex && freePromotionIndex.source === source) return freePromotionIndex.set;
    const effect = new Map();
    for (const d of GameInfo.DynamicModifiers ?? []) effect.set(d.ModifierType, d.EffectType);
    const type = new Map();
    for (const m of GameInfo.Modifiers ?? []) type.set(m.ModifierId, m.ModifierType);
    const set = new Set();
    for (const a of source ?? []) {
        if (a.Name === "UnitPromotionType" && effect.get(type.get(a.ModifierId)) === "EFFECT_GRANT_UNIT_PROMOTION") set.add(a.Value);
    }
    freePromotionIndex = { source, set };
    return set;
}

/** Our land commanders, off the map too (one waiting to respawn still has its role). */
const landCommanders = (units) => (units ?? []).filter((u) => u.isCommanderUnit && isLandCommander(safe(() => GameInfo.Units.lookup(u.type), null)));

/**
 * Every land commander's role (core assignRoles): VANGUARD or BASTION by what it took; of the undecided the one with the most
 * XP is the vanguard when no other is. A campaign's leader with no Bastion promotion is the vanguard. @returns Map(key -> role)
 */
export function commanderRoles(units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? []) {
    const list = landCommanders(units).map((u) => {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const xp = (Number(safe(() => u.Experience?.getLevel, 0)) || 0) * 100 + (Number(safe(() => u.Experience?.experiencePoints, 0)) || 0);
        return { key: unitKey(u.id), has: promotionHas(u, def, { chosen: true }), xp };
    });
    // An undecided vanguard stays the vanguard (game 49: with no XP the role followed the unit ids and changed hands when the
    // second commander came).
    const roles = assignRoles(list, lastRoles);
    for (const c of list) if ((inCampaign(c.key) || inField(c.key)) && roleFromPromotions(c.has) !== "BASTION") roles.set(c.key, "VANGUARD");
    lastRoles = roles;
    return roles;
}

/**
 * What the generals' effects are worth now (core/xpl-effect-value.js): our land commanders, whether one still lacks its role's
 * key promotions, and whether one fights (a threatened settlement or a war at our door).
 */
export function generalsState() {
    const units = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const list = landCommanders(units);
    const roles = commanderRoles(units);
    const wanting = list.some((u) => keyPromotionsLeft(roles.get(unitKey(u.id)) ?? "BASTION", promotionHas(u, safe(() => GameInfo.Units.lookup(u.type), null))) > 0);
    const me = safe(() => Players.get(pid()), null);
    const atWar = (safe(() => Players.getAlive(), []) ?? []).some((p) => p && p.id !== pid() && p.isMajor !== false && !!safe(() => me.Diplomacy.isAtWarWith(p.id), false));
    const fighting = atWar || (safe(() => threatenedSettlements(), []) ?? []).length > 0;
    return { commanders: list.length, wanting, fighting };
}

const raidHistory = new Map(); // settlement key -> the turns it was threatened (the last GENERAL.RAIDED_TURNS)
let lastRoles = new Map();      // unit key -> the role it had last (assignRoles keeps an undecided vanguard)

/** Notes this turn's threatened settlements (once a turn each). */
function noteRaids(threats) {
    const turn = safe(() => Game.turn, -1);
    for (const t of threats ?? []) {
        const k = `${t.settlement.x},${t.settlement.y}`;
        const turns = raidHistory.get(k) ?? [];
        if (turns[turns.length - 1] !== turn) turns.push(turn);
        raidHistory.set(k, turns.filter((x) => turn - x < GENERAL.RAIDED_TURNS && x <= turn));
    }
}

/** Of these settlements, the one threatened on most of the last RAIDED_TURNS turns, else an exposed one; or null. */
function mostRaided(cities, ctx) {
    const turn = safe(() => Game.turn, -1);
    const raids = (c) => (raidHistory.get(`${c.location.x},${c.location.y}`) ?? []).filter((x) => turn - x < GENERAL.RAIDED_TURNS && x <= turn).length;
    const exposed = (c) => (ctx.exposed ?? []).some((e) => same(e.settlement, c.location));
    const scored = cities.map((c) => ({ c, s: raids(c) * 2 + (exposed(c) ? 1 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return scored[0]?.c ?? null;
}

const COMMANDER_ESCAPE_RADIUS = 3; // a commander in danger looks this far for a safer tile it reaches this turn
const SHIELD_DAMAGE = 50;          // a land soldier of ours hurt less than this shields a commander on its tile...
const DISTRICT_SAFE_SHARE = 0.5;   // ...and our centre does while its district keeps this share of its health

/**
 * A healthy land soldier of ours on this tile (research/42 A1; the user: "hiding underneath another war units"): a
 * commander is another formation class (FORMATION_CLASS_COMMAND), so it shares the soldier's tile, and the soldier is the
 * one attacked.
 */
function shieldAt(loc, units) {
    return (units ?? []).some((s) => {
        if (s.isCommanderUnit || s.isOnMap === false || !s.location || !same(s.location, loc)) return false;
        if ((Number(s.Health?.damage) || 0) >= SHIELD_DAMAGE) return false;
        const def = safe(() => GameInfo.Units.lookup(s.type), null);
        return isSoldier(def) && def.Domain === "DOMAIN_LAND";
    });
}

/**
 * A hurt soldier of ours that still shields a land commander on its tile (shieldAt): it does not step away, withdraw or escape
 * from under it in the pass, which would leave the commander alone where it stood for that shield (the fight simulator's
 * raids60 after game 60's packages merged: the general escaped, or was placed by its hunt, under a Warrior hurt 40-48 that
 * then withdrew in the same pass, and a raider caught the general alone, 2 of 10 seeds).
 */
const ourUnitsOf = (ctx) => ctx?.ourUnits ?? safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];

function sheltersCommander(u, units) {
    if (!u?.location || u.isCommanderUnit || u.isOnMap === false || !shieldAt(u.location, [u])) return false;
    return landCommanders(units).some((c) => c.isOnMap !== false && !!c.location && same(c.location, u.location));
}

/** Our centre here with its district at DISTRICT_SAFE_SHARE of its health or more (it takes the attacks; unknown: it does). */
function districtHolds(loc) {
    if (!settlementAt(loc)) return false;
    const districts = safe(() => Players.Districts.get(pid()), null);
    const health = Number(safe(() => districts.getDistrictHealth(loc), NaN));
    const max = Number(safe(() => districts.getDistrictMaxHealth(loc), NaN));
    if (!Number.isFinite(health) || !(max > 0)) return true;
    return health / max >= DISTRICT_SAFE_SHARE;
}

/**
 * Is this commander in danger: hit since our last pass (its tile is a hit spot of this turn), or standing where it may not
 * (commanderSafeAt). @returns the reason or null
 */
function commanderDanger(u, units, ctx) {
    if (!u.location || u.isOnMap === false || afloat(u)) return null;
    // A hit on our centre while its district holds is its holder's: the district stands between them (the fight simulator,
    // after game 58: the general left the town centre every time its holder was struck, and its XP with it).
    // So is a hit under a healthy soldier of ours that still stands there (shieldAt): the soldier took it (the fight simulator's
    // raids60, after the packages of game 60 merged: a general whose army had unpacked hurt stood under the healthy Warrior
    // that had just struck, escaped off it for the hit, and an Archer caught it alone).
    if (hitSpots.some((h) => h.turn === Game.turn && same(h, u.location)) && !districtHolds(u.location) && !shieldAt(u.location, units)) return "hit";
    return armyShields(u, units) || commanderSafeAt(u.location, units, ctx) ? null : "in reach";
}

/**
 * A healthy soldier packed in this commander's army: "If an Assembled Army is attacked, it defends as a single unit,
 * leveraging the combined strength of all its components" (the Civilopedia's armies page; after game 54). Hit, it escapes
 * all the same (a strong enough attack makes it deploy).
 */
function armyShields(c, units) {
    return (units ?? []).some((u) => u !== c && !u.isCommanderUnit && u.isOnMap === false && sameId(u.armyId, c.armyId)
        && (Number(u.Health?.damage) || 0) < SHIELD_DAMAGE && isSoldier(safe(() => GameInfo.Units.lookup(u.type), null)));
}

/**
 * Where a commander may end its move, the one rule its escape and its walk share (game 49: walking to Йезд it stopped in a
 * raider's reach, escaped back, and sat in the capital T16-T25 while Йезд was raided): under a healthy soldier of ours
 * (shieldAt), on our centre while its district holds (districtHolds), else never next to a hostile land unit and out of
 * every hostile unit's reach (ships too). Game 53 (research/42): any centre of ours counted, so the bastion stood alone on
 * Китион's 0-health centre after its holder died and was hit four times and killed (M72-M74), and walking beside soldiers
 * counted, so a Frigate shot it three times on the coast (M149-M150).
 */
function commanderSafeAt(loc, units, ctx, margin = 0) {
    if (shieldAt(loc, units) || districtHolds(loc)) return true;
    if (ctx?.hostileAt && hostileNear(loc, 1, ctx)) return false;
    return hostilesInReach(loc, margin).length + shipsReaching(loc).length === 0;
}

/** The tile a path ends this turn on (the last plot the game reaches on turn 1), or null. */
function turnStop(p) {
    let at = null;
    (p?.plots ?? []).forEach((idx, i) => {
        if ((Number(p.steps?.[i]) || 1) <= 1) at = idx;
    });
    return at === null ? null : safe(() => GameplayMap.getLocationFromIndex(at), null);
}

const COMMANDER_ADVANCE_LOOK = 8; // tiles a commander checks a way to when it advances toward its post
const ADVANCE_MARGIN = 1;         // ...and a tile in the open out of reach by this much more (a raider moves toward it)

/**
 * The tile nearest its post a commander reaches this turn and may stand on (commanderSafeAt), nearer than where it stands; or
 * null (research/41 §4D: as close to the fight as is safe). In the open it must be out of reach by ADVANCE_MARGIN more: game
 * 54 (A41-A48), the vanguard advanced from Ашшур to 67,15 out of reach, a raider stepped closer, and it escaped back the next
 * turn, twice.
 */
function commanderAdvance(u, def, post, units, ctx) {
    const here = u.location;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const now = dist(here, post);
    const radius = Math.max(1, Number(def?.BaseMoves) || 2);
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, radius), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || same(loc, here) || !(dist(loc, post) < now)) continue;
        if (onWater(loc) || !standsOn(def, loc) || !roomFor(def, loc) || hazardAt(loc) > 0) continue;
        if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false) || !commanderSafeAt(loc, units, ctx, ADVANCE_MARGIN)) continue;
        tiles.push({ loc, d: dist(loc, post), h: dist(here, loc) });
    }
    tiles.sort((a, b) => a.d - b.d || a.h - b.h);
    for (const t of tiles.slice(0, COMMANDER_ADVANCE_LOOK)) {
        const turns = pathTurns(u, t.loc);
        if (turns !== null && turns <= 1 && !startsWar(u, t.loc)) return t.loc;
    }
    return null;
}

const ESCORT_DAMAGE = 30; // an escort is a free soldier of ours hurt less than this

/**
 * A commander walking to its post with an escort (research/42 A3; game 53: alone on the coast it was shot by Frigates at
 * M31, M57 and M149-M150): when its walk would stop this turn where it may not stand (commanderSafeAt), a free soldier
 * next to it (the defence's supply, not posted; last turn's escort first) that is healthy and reaches that stop this turn
 * goes there first, and the commander joins it on its tile. The soldier carries the goal { escort } for the pass, so the
 * defence leaves it alone. Runs after the defence plan, before the unit loop. @returns log entries
 */
function escortCommanders(units, ctx) {
    const out = [];
    for (const u of landCommanders(units)) {
        const k = unitKey(u.id);
        if (ctx.ordered.has(k) || u.canMove === false || u.isOnMap === false || !u.location || afloat(u)) continue;
        if (u.hasMoved === true && !(Number(u.Movement?.movementMovesRemaining ?? 0) > 0)) continue;
        const post = goals.get(k)?.post?.split(",").map(Number);
        if (post?.length !== 2) continue;
        const to = { x: post[0], y: post[1] };
        if (safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, to.x, to.y), 0) <= GUARD_RADIUS) continue;
        const p = pathTo(u, to);
        if (!p || p.turns <= 1 || startsWar(u, to)) continue;
        const stop = turnStop(p);
        if (!stop || same(stop, u.location) || commanderSafeAt(stop, units, ctx) || !roomForSoldier(stop) || hazardAt(stop) > 0) continue;
        const near = (x) => safe(() => GameplayMap.getPlotDistance(x.location.x, x.location.y, u.location.x, u.location.y), 9) <= 1;
        const candidates = [
            ...units.filter((x) => goals.get(unitKey(x.id))?.escort === k),
            ...(ctx.supply ?? []).filter((c) => !c.packed && c.stage && !ctx.posts?.has(c.k) && !c.ranged).map((c) => c.u),
        ].filter((x, i, all) => all.indexOf(x) === i && !ctx.ordered.has(unitKey(x.id)) && x.isOnMap !== false && !!x.location && near(x)
            && (Number(x.Health?.damage) || 0) < ESCORT_DAMAGE && x.canMove !== false && x.hasMoved !== true);
        const escort = candidates.find((x) => {
            const t = pathTurns(x, stop);
            return t !== null && t <= 1 && !startsWar(x, stop);
        });
        if (!escort) continue;
        wakeUnit(escort);
        if (!moveTo(escort, stop)) continue;
        const ek = unitKey(escort.id);
        ctx.ordered.add(ek);
        restedByUs.delete(ek);
        goals.set(ek, { escort: k, turn: Game.turn });
        wakeUnit(u);
        moveTo(u, stop);
        ctx.ordered.add(k);
        ctx.stepTo.add(`${stop.x},${stop.y}`);
        ctx.commanderPosts ??= new Set();
        ctx.commanderPosts.add(`${to.x},${to.y}`);
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const edef = safe(() => GameInfo.Units.lookup(escort.type), null);
        log.info(`generals: ${def?.UnitType ?? "?"} walks to ${to.x},${to.y} with ${edef?.UnitType ?? "?"} as its escort: both to ${stop.x},${stop.y} (${p.turns} turn(s) to go; that stop alone is in hostile reach)`);
        out.push({ key: "COMMANDER_ESCORTED", args: [nameOf(def), nameOf(edef), stop.x, stop.y] });
    }
    // Last turn's escorts not taken again are free.
    for (const [ek, g] of [...goals.entries()]) if (g?.escort !== undefined && g.turn !== Game.turn) goals.delete(ek);
    return out;
}

/**
 * Commanders in danger escape first (research/41 §4F; the user, 21 October: "escaping as first unit if dangerous or under
 * attack: a valuable asset"): to the tile within COMMANDER_ESCAPE_RADIUS it reaches this turn where it may stand
 * (commanderSafeAt: under a healthy soldier first), the nearest its post, else the one in the fewest hostile units' reach
 * (ships too); only when it is safer than where it stands. A commander that moved this turn but has moves left escapes too
 * (game 53: on its walk along the coast it took a second Frigate shot). Game 32's commander was shot dead at its post by a
 * Cog; game 45's Hazarapatis by a Warrior. When it finds nothing, UI.log says so once a turn. @returns entries
 */
function escapeCommanders(units, ctx) {
    const out = [];
    for (const u of landCommanders(units)) {
        const k = unitKey(u.id);
        if (ctx.ordered.has(k) || u.canMove === false) continue;
        if (u.hasMoved === true && !(Number(u.Movement?.movementMovesRemaining ?? 0) > 0)) continue;
        const why = commanderDanger(u, units, ctx);
        if (!why) continue;
        // Marching with its army packed (research/42 B2): it goes on unless hit.
        if (marching(u) && why !== "hit") continue;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const here = u.location;
        const exposure = (loc) => hostilesInReach(loc).length + shipsReaching(loc).length;
        // A tile it may stand on (commanderSafeAt) first, under a soldier before the rest, the nearest its post (it stays near
        // the fight), else the fewest hostile units in reach.
        const post = goals.get(k)?.post?.split(",").map(Number);
        const toPost = (loc) => (post?.length === 2 ? safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, post[0], post[1]), 0) : 0);
        const score = (loc) => (commanderSafeAt(loc, units, ctx) ? toPost(loc) : 1000 + exposure(loc) * 100)
            - (shieldAt(loc, units) ? 30 : 0) - (settlementAt(loc) ? 20 : 0);
        const stay = why === "hit" ? Infinity : score(here);
        const options = [];
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(here.x, here.y, COMMANDER_ESCAPE_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || same(loc, here) || onWater(loc) || !standsOn(def, loc) || !roomFor(def, loc) || hazardAt(loc) > 0) continue;
            if (safe(() => GameplayMap.isImpassable(loc.x, loc.y), false)) continue;
            const d = safe(() => GameplayMap.getPlotDistance(here.x, here.y, loc.x, loc.y), 9);
            options.push({ loc, s: score(loc) + d });
        }
        options.sort((a, b) => a.s - b.s);
        let tried = 0;
        let escaped = false;
        const refused = { path: 0, far: 0, war: 0, move: 0 }; // game 61: «none reached this turn» while the game listed 3 tiles
        for (const o of options) {
            if (o.s >= stay) break;
            tried++;
            const t = pathTurns(u, o.loc);
            if (t === null) { refused.path++; continue; }
            if (t > 1) { refused.far++; continue; }
            if (startsWar(u, o.loc)) { refused.war++; continue; }
            wakeUnit(u);
            if (!moveTo(u, o.loc)) { refused.move++; continue; }
            ctx.ordered.add(k);
            ctx.stepTo.add(`${o.loc.x},${o.loc.y}`);
            // Its post stays its own: the other general picks another (game 54 A44: the vanguard escaped, and the bastion was
            // posted to the same fight).
            if (goals.get(k)?.post) (ctx.commanderPosts ??= new Set()).add(goals.get(k).post);
            log.info(`generals: ${def?.UnitType ?? "?"} escaped from ${here.x},${here.y} to ${o.loc.x},${o.loc.y} (${why}${shieldAt(o.loc, units) ? ", under a soldier" : ""}; ${exposure(here)} hostile(s) reached it, ${exposure(o.loc)} there)`);
            out.push({ key: "COMMANDER_ESCAPED", args: [nameOf(def), o.loc.x, o.loc.y] });
            escaped = true;
            break;
        }
        if (!escaped && escapeNoted.get(k) !== Game.turn) {
            escapeNoted.set(k, Game.turn);
            log.warn(`generals: ${def?.UnitType ?? "?"} at ${here.x},${here.y} is in danger (${why}; ${exposure(here)} hostile(s) reach it) and stays: ${options.length} tile(s) within ${COMMANDER_ESCAPE_RADIUS}, ${tried} safer, none reached this turn (no way ${refused.path}, more than a turn ${refused.far}, a war ${refused.war}, refused ${refused.move})`);
        }
    }
    return out;
}
const escapeNoted = new Map(); // unit key -> the turn UI.log said a commander in danger found no way out

/**
 * UI.log once a turn while we have a land commander (research/41 §4): each one's role, tile, post and XP, so the next games
 * show whether the generals stood at the fights and what they earned.
 */
function logGenerals(units, ctx) {
    const list = landCommanders(units);
    if (list.length === 0 || generalsNoted === Game.turn) return;
    generalsNoted = Game.turn;
    const parts = list.map((u) => {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const where = u.isOnMap === false || !u.location ? "off the map" : `at ${u.location.x},${u.location.y}`;
        const post = goals.get(unitKey(u.id))?.post;
        return `${ctx.commanderRoles?.get(unitKey(u.id)) ?? "?"} ${def?.UnitType ?? "?"} ${where}${post ? ` post ${post}` : ""} (${xpText(u)})`;
    });
    log.info(`generals: ${parts.join("; ")}`);
}
let generalsNoted = -1;

/**
 * The generals for the Autopilot tab (game 60's review, UI-8: their levels were only in UI.log): each land commander's role, type,
 * level, XP, the XP of its next level and its post, read as the `xp:` lines read them.
 */
function generalsSummary(units, ctx) {
    const num = (f) => {
        const v = Number(safe(f, NaN));
        return Number.isFinite(v) ? v : null;
    };
    return landCommanders(units).map((u) => ({
        role: ctx.commanderRoles?.get(unitKey(u.id)) ?? null,
        type: safe(() => GameInfo.Units.lookup(u.type).UnitType, null),
        level: num(() => u.Experience.getLevel),
        xp: num(() => u.Experience.experiencePoints),
        next: num(() => u.Experience.experienceToNextLevel),
        post: goals.get(unitKey(u.id))?.post ?? null,
    }));
}

/**
 * The units in their order, the land commanders among them by level, the lowest first: each takes its post in turn
 * (commanderPost), so a fight with independents goes to the one that still gains full XP there (W6).
 */
function byLevel(units) {
    const at = [];
    units.forEach((u, i) => {
        if (u.isCommanderUnit && isLandCommander(safe(() => GameInfo.Units.lookup(u.type), null))) at.push(i);
    });
    if (at.length < 2) return units;
    const sorted = at.map((i) => units[i]).sort((a, b) => xpOf(a).level - xpOf(b).level);
    const out = [...units];
    at.forEach((i, n) => {
        out[i] = sorted[n];
    });
    return out;
}

/** Units in a general's radius first (their fights give it XP: research/41 §6), the rest in their order. */
function byGeneral(units) {
    const cmd = landCommanders(units).filter((c) => c.isOnMap !== false && c.location);
    if (cmd.length === 0) return units;
    const radius = (c) => 1 + (safe(() => c.Experience?.hasPromotion("DISCIPLINE_ARMY_COMMENDATION_MERIT", "PROMOTION_COMMENDATION_ARMY_MERIT"), false) ? 1 : 0);
    const near = (u) => !!u.location && cmd.some((c) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, u.location.x, u.location.y), Infinity) <= radius(c));
    return [...units.filter(near), ...units.filter((u) => !near(u))];
}

// ---- commanders (research/25) ------------------------------------------------------------------

/** A land army commander (its promotion class): commanders of fleets are not posted. */
export function isLandCommander(def) {
    return def?.Domain === "DOMAIN_LAND" && (def.PromotionClass === "PROMOTION_CLASS_LAND_COMMANDER" || hasTag(def, "UNIT_CLASS_ARMY_COMMANDER"));
}

const COMMANDER_THREAT_TURNS = 6; // a threatened settlement draws a land commander that reaches it within this many turns...
const COMMANDER_PEACE_TURNS = 4;  // ...an unhappy one in peace, this many
const COMMANDER_UNHAPPY_GAIN = 3; // in peace a commander leaves a centre only for a settlement this much unhappier (below zero)
const COMMANDER_PEACE_HOLD = 10;  // ...and not within this many turns of reaching its post (game 50: the bastion walked between
                                  // the capital and Сучжоу three times in Modern, 4-5 turns each way, and left the capital the
                                  // turn it arrived)
const postArrived = new Map();    // unit key -> { post: "x,y", turn } the turn it first stood on its post
const FRONT_SHARE_ARMY = 4;       // a war front facing this many enemy soldiers is shared by two generals

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
    // Threatened settlements, a damaged centre first, then by raiders (research/41 Phase 2, game 48: both commanders kept
    // their posts at settlements with one raider while Киото, 7 raiders, fell at A59): its own post unless another it reaches
    // is much worse; one no other commander holds first, else the fight is shared (core threatPost).
    const threatened = ctx.threats.map((t) => ({ t, c: at(t) })).filter((x) => x.c)
        .sort((a, b) => Number(!!b.t.damaged) - Number(!!a.t.damaged) || b.t.count - a.t.count);
    // Each fight's walk (0 within GUARD_RADIUS: it is there), and the fight it stands at is its own before its post (game 54:
    // the vanguard walked away from Ашшур's 4 raiders toward Имгур-Энлиль's 2, three turns off).
    const walk = (c) => {
        if (dist(c) <= GUARD_RADIUS) return 0;
        reaches(c, COMMANDER_THREAT_TURNS);
        return turns.get(keyOf(c)) ?? Infinity;
    };
    const atFight = threatened.filter((x) => dist(x.c) <= GUARD_RADIUS).sort((a, b) => dist(a.c) - dist(b.c))[0];
    // A fight's raiders count at the XP they give this general (W6: from EXPERIENCE_MAX_BARB_LEVEL an independent's fight
    // gives the soft cap's 1); a far damaged centre at its health (threatPost's FAR_TURNS).
    const level = xpOf(u).level;
    const xpAt = (t) => fightXpShare({ level, independent: (t.owners ?? []).length > 0 && t.owners.every((o) => o?.independent) }, xpParams());
    const entries = threatened.map((x) => ({
        key: keyOf(x.c), count: x.t.count, damaged: !!x.t.damaged, health: centreShare(x.c.location), reach: dist(x.c) <= GUARD_RADIUS || reaches(x.c, COMMANDER_THREAT_TURNS),
        taken: !free(x.c), turns: walk(x.c), shipsOnly: !(Number(x.t.land) > 0) && Number(x.t.ships) > 0, xp: xpAt(x.t),
    }));
    // Where it stands, or its post, with a fight of ours lately and no raider counted (an enemy commander, a ship our units
    // fight: W4, game 60 A88-A98): one raider's worth, kept against a walk to another fight that is not much worse.
    const fought = cities.filter((c) => !threatened.some((x) => x.c === c) && foughtLately(c.location) && (dist(c) <= GUARD_RADIUS || keyOf(c) === kept));
    for (const c of fought) entries.push({ key: keyOf(c), count: 1, damaged: false, health: 1, reach: dist(c) <= GUARD_RADIUS || reaches(c, COMMANDER_THREAT_TURNS), taken: !free(c), turns: walk(c), fought: true });
    const foughtHere = fought.find((c) => dist(c) <= GUARD_RADIUS);
    const postKey = threatPost(entries, atFight ? keyOf(atFight.c) : foughtHere ? keyOf(foughtHere) : kept);
    if (postKey) return { c: [...threatened.map((x) => x.c), ...fought].find((c) => keyOf(c) === postKey) };
    // A war at our door and no fight in reach: each general waits at a war front facing an army of theirs, the biggest army
    // first, one each (one facing FRONT_SHARE_ARMY soldiers or more is shared), its own kept while it stays one: the next
    // raid starts there (game 54: in Antiquity's war both generals walked 4-6 turns between Ниневия and Дур-Катлимму behind
    // the raids, the vanguard ended the age at XP 0 and the bastion at 4 of 7, lost at the age change).
    const fronts = (ctx.fronts ?? []).filter((f) => f.atWar && Number(f.army) > 0)
        .map((f) => ({ f, c: cities.find((c) => same(c.location, f.settlement)) }))
        .filter((x) => x.c && reaches(x.c, COMMANDER_THREAT_TURNS))
        .sort((a, b) => b.f.army - a.f.army || dist(a.c) - dist(b.c));
    const front = fronts.find((x) => keyOf(x.c) === kept && (free(x.c) || x.f.army >= FRONT_SHARE_ARMY))
        ?? fronts.find((x) => free(x.c)) ?? fronts.find((x) => x.f.army >= FRONT_SHARE_ARMY);
    if (front) return { c: front.c };
    // In peace it keeps the post it reached within COMMANDER_PEACE_HOLD turns.
    const standing = cities.find((c) => same(c.location, here));
    const arrived = postArrived.get(unitKey(u.id));
    if (standing && free(standing) && arrived?.post === keyOf(standing) && Game.turn >= arrived.turn && Game.turn - arrived.turn < COMMANDER_PEACE_HOLD) {
        return { c: standing };
    }
    // In peace the vanguard waits where raids come most (the last RAIDED_TURNS), else at an exposed settlement: its fights.
    if (ctx.commanderRoles?.get(unitKey(u.id)) === "VANGUARD") {
        const raided = mostRaided(cities.filter((c) => free(c) && reaches(c, COMMANDER_THREAT_TURNS)), ctx);
        if (raided) return { c: raided };
    }
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
    if (same(u.location, loc)) {
        // At its post: the skip step skips its turn. The turn it first stood there is noted (COMMANDER_PEACE_HOLD).
        const k = unitKey(u.id);
        if (postArrived.get(k)?.post !== `${loc.x},${loc.y}`) postArrived.set(k, { post: `${loc.x},${loc.y}`, turn: Game.turn });
        return null;
    }
    const p = pathTo(u, loc);
    if (!p || startsWar(u, loc)) return null;
    // Its centre reached this turn is safe (the district takes the attacks); a longer walk only by a safe way that ends this
    // turn where it may stand (commanderSafeAt); else as close as is safe (game 49: the way to Йезд passed its raiders, so
    // the commander sat in the capital T16-T25, 3 tiles from the fights).
    const units = ctx.ourUnits ?? [];
    const stop = p.turns > 1 ? turnStop(p) : null;
    // The vanguard's packed army to a fight that cannot wait: Force March first (after game 54).
    if (p.turns > 1 && rapid?.ck === unitKey(u.id)) forceMarchIfUrgent(u, ctx.threats.find((t) => same(t.settlement, loc)), units);
    if ((p.turns <= 1 || (wayIsSafe(u, p, 1, ctx) && (!stop || armyShields(u, units) || commanderSafeAt(stop, units, ctx)))) && moveTo(u, loc)) {
        return { key: "COMMANDER_POST", args: [nameOf(def), safe(() => Locale.compose(post.c.name), "?")] };
    }
    const step = commanderAdvance(u, def, loc, units, ctx);
    if (!step || !moveTo(u, step)) return null;
    log.info(`generals: ${def?.UnitType ?? "?"} advances from ${u.location.x},${u.location.y} to ${step.x},${step.y} toward its post ${loc.x},${loc.y} (${p.turns} turn(s) away; the way or this turn's stop is in hostile reach)`);
    return { key: "COMMANDER_ADVANCE", args: [nameOf(def), safe(() => Locale.compose(post.c.name), "?"), step.x, step.y] };
}

let commanderParamsLogged = false;

/** Once per session, UI.log lists the game's experience and army parameters (their values are compiled into the game). */
function logCommanderParameters() {
    if (commanderParamsLogged) return;
    // P-XP-1 (research/41 §2): with the focused attack's bonus and the purchase multiplier; the line comes out whole now
    // (xpl-log splits what UI.log would cut at 1,022 characters).
    const rows = GameInfo.GlobalParameters?.filter((r) => /^(EXPERIENCE_|ARMY_|COMMANDER_|COMBAT_FOCUSED_ATTACK_|UNIT_PURCHASE_MULTIPLIER)/.test(String(r.Name))) ?? [];
    if (rows.length === 0) return;
    commanderParamsLogged = true;
    log.warn(`commander parameters: ${rows.map((r) => `${r.Name}=${r.Value}`).join(", ")}`);
}

const focusNoted = new Map();   // "commander|command" -> the turn UI.log said why it made no focused attack
const FOCUS_MIN_UNITS = 1;     // a focused attack needs this many of our units joining it...
const FOCUS_MIN_HEALTH = 0.5;  // ...each melee one with at least this share of its health

/**
 * Commanders' focused attacks (research/25: every unit in its radius attacks one target, +2 strength each; each fight
 * gives the commander XP): Focus Fire (UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED) when a ranged unit with an attack left can
 * shoot the target, Coordinated Attack (…_MELEE) when healthy melee ones stand next to it and the target is no stronger
 * than the best of them + 2 and not in a district; with one melee unit only when the game's preview says its strike pays
 * (strikeWorthIt). The game sets no minimum ("Order all Ranged Units within Command Radius to fire on a specified target.
 * All Units have +2 Combat Strength"); ours of 2 refused 49 attacks in game 53 (`at most 0-1 of ours joining (need 2)`;
 * research/42 A4). Targets come from the game (canStart(…, {}).Plots), hostile units only, the most joining, then the most
 * damaged first. @returns { entries, ordered (unit keys) }
 */
async function commanderAttacks(units, M) {
    const entries = [];
    const ordered = new Set();
    for (const cmdr of units) {
        const def = safe(() => GameInfo.Units.lookup(cmdr.type), null);
        // An air commander strikes with every plane based with it (research/42 C3), a carrier too.
        if (cmdr.isCommanderUnit && isAirCommander(def)) {
            const a = await airCommanderAttack(cmdr, def, units);
            if (a) {
                entries.push(a.entry);
                for (const k of a.ordered) ordered.add(k);
            }
            continue;
        }
        // A Fleet Commander's focused attacks too (game 54's review: Focus Fire orders "all Heavy Naval Units within Command
        // Radius", Coordinated Naval Attack "all Light Naval Units"): ranged ships and screens.
        const fleet = isFleetCommander(def);
        if (!cmdr.isCommanderUnit || !(isLandCommander(def) || fleet) || cmdr.isOnMap === false) continue;
        // An army with soldiers packed in it overruns a weaker unit first (after game 54: a fight without deploying).
        if (!fleet) {
            const o = await overrunRaider(cmdr, def, units);
            if (o) {
                entries.push(o);
                ordered.add(unitKey(cmdr.id));
                continue;
            }
        }
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
        for (const [cmd, ranged] of fleet ? SEA_FOCUS : LAND_FOCUS) {
            const plots = safe(() => Game.UnitCommands.canStart(cmdr.id, cmd, {}, false), null)?.Plots ?? [];
            const cands = [];
            // Why no attack, for UI.log once a turn (game 12 T31: the player found a Coordinated Attack we never made).
            const why = { targets: plots.length, hostile: 0, district: 0, joining: 0, stronger: 0, poor: 0 };
            for (const idx of plots) {
                const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
                const enemy = hostileSeenAt(loc) ?? null;
                if (!enemy) continue;
                why.hostile++;
                // Not into a settlement's defences (the game answers an invalid id elsewhere).
                if (!ranged && validId(safe(() => Game.Combat.getDefensibleDistrict({ x: loc.x, y: loc.y }), null))) {
                    why.district++;
                    continue;
                }
                const joining = near.filter((x) => {
                    const xd = safe(() => GameInfo.Units.lookup(x.type), null);
                    if (ranged) return (fleet ? shipRole(xd) === "RANGED" : isRangedGuard(xd)) && (safe(() => Game.UnitOperations.canStart(x.id, "UNITOPERATION_RANGE_ATTACK", {}, false), null)?.Plots ?? []).includes(idx);
                    const health = 1 - (Number(x.Health?.damage) || 0) / (Number(x.Health?.maxDamage) || 100);
                    return (fleet ? shipRole(xd) === "SCREEN" : isMeleeGuard(xd)) && health >= FOCUS_MIN_HEALTH && safe(() => GameplayMap.getPlotDistance(x.location.x, x.location.y, loc.x, loc.y), 9) === 1;
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
                cands.push({ loc, enemy, joining, score });
            }
            cands.sort((a, b) => b.score - a.score);
            let best = null;
            for (const c of cands) {
                // A lone melee unit: only when the game's preview says its strike pays (the +2 is not in it: a safe margin).
                if (!ranged && c.joining.length === 1 && !(await strikePays(c.joining[0], c.loc, c.enemy))) {
                    why.poor++;
                    continue;
                }
                best = c;
                break;
            }
            if (!best) {
                const key = `${unitKey(cmdr.id)}|${cmd}`;
                if (why.targets > 0 && focusNoted.get(key) !== Game.turn) {
                    focusNoted.set(key, Game.turn);
                    log.warn(`commander: no ${ranged ? "Focus Fire" : "Coordinated Attack"}: ${why.targets} target plot(s), ${why.hostile} hostile, ${why.district} in a district, at most ${why.joining} of ours joining (need ${FOCUS_MIN_UNITS}), ${why.stronger} too strong, ${why.poor} not worth it alone; ${near.length} unit(s) in its radius with an attack left`);
                }
                continue;
            }
            Game.UnitCommands.sendRequest(cmdr.id, cmd, { X: best.loc.x, Y: best.loc.y });
            for (const x of best.joining) ordered.add(unitKey(x.id));
            ordered.add(unitKey(cmdr.id));
            const theirs = safe(() => GameInfo.Units.lookup(best.enemy.type), null);
            entries.push({ key: fleet ? (ranged ? "NAVAL_FOCUS_FIRE" : "NAVAL_COORDINATED_ATTACK") : ranged ? "FOCUS_FIRE" : "COORDINATED_ATTACK", args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.loc.x, best.loc.y, best.joining.length] });
            await untilEvent("Combat", COMBAT_WAIT_MS);
            break; // one focused attack per commander a pass
        }
        if (ordered.has(unitKey(cmdr.id)) || fleet) continue;
        // Its own commands (research/40 C: unlocked by commendations and never used): Commander Attack on a raider already
        // half dead, or one the game's preview says it beats keeping COMMANDER_STRIKE_KEEP of its health (research/42 A5),
        // from the plots the game offers; Defensive Perimeter fortifies every unit in its radius while raiders stand within
        // 2 of it.
        const offered = (safe(() => Game.UnitCommands.canStart(cmdr.id, COMMANDER_ATTACK, {}, false), null)?.Plots ?? [])
            .map((idx) => {
                const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
                const enemy = hostileSeenAt(loc) ?? null;
                return { loc, enemy, damage: Number(enemy?.Health?.damage) || 0 };
            })
            .filter((t) => t.enemy)
            .sort((a, b) => b.damage - a.damage);
        let finish = offered.find((t) => t.damage >= COMMANDER_FINISH_DAMAGE) ?? null;
        for (const t of finish ? [] : offered.slice(0, 3)) {
            const trade = await strikeTrade(cmdr, t.loc, t.enemy);
            if (!trade?.answered) continue;
            const kept = (trade.ourHealth - trade.taken) / trade.ourMax;
            if (kept >= COMMANDER_STRIKE_KEEP && (trade.dealt >= trade.theirHealth || trade.dealt >= 2 * trade.taken)) {
                finish = t;
                break;
            }
        }
        if (finish) {
            Game.UnitCommands.sendRequest(cmdr.id, COMMANDER_ATTACK, { X: finish.loc.x, Y: finish.loc.y });
            ordered.add(unitKey(cmdr.id));
            entries.push({ key: "COMMANDER_ATTACK", args: [nameOf(def), finish.loc.x, finish.loc.y] });
            await untilEvent("Combat", COMBAT_WAIT_MS);
            continue;
        }
        const raidersNear = !!safe(() => hostileNear(cmdr.location, 2, { hostileAt: new Map() }), false);
        if (raidersNear && safe(() => Game.UnitCommands.canStart(cmdr.id, DEFENSIVE_PERIMETER, NO_TARGET, false), null)?.Success) {
            Game.UnitCommands.sendRequest(cmdr.id, DEFENSIVE_PERIMETER, { ...NO_TARGET });
            ordered.add(unitKey(cmdr.id));
            entries.push({ key: "DEFENSIVE_PERIMETER", args: [nameOf(def)] });
        }
    }
    return { entries, ordered };
}

const LAND_FOCUS = [["UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED", true], ["UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE", false]];
const SEA_FOCUS = [["UNITCOMMAND_FOCUSED_ATTACK_SEA_RANGED", true], ["UNITCOMMAND_FOCUSED_ATTACK_SEA_MELEE", false]];
const COMMANDER_ATTACK = "UNITCOMMAND_COMMANDER_ATTACK";
const DEFENSIVE_PERIMETER = "UNITCOMMAND_DEFENSIVE_PERIMETER";
const COMMANDER_FINISH_DAMAGE = 50; // a commander attacks a raider at least this hurt (a commander is precious)...
const COMMANDER_STRIKE_KEEP = 0.7;  // ...or one the game's preview says it beats keeping this share of its health

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
function dispersible(v, { hunted = false } = {}) {
    const R = globalThis.IndependentRelationship;
    const hostile = (R !== undefined && safe(() => Game.IndependentPowers.getIndependentRelationship(v.id, pid()), null) === R.HOSTILE)
        || !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(v.id), false);
    if (!hostile) return false;
    // The village we hunt: another leader's befriending does not stop it (the user, 21 October; huntReason checked it).
    if (hunted) return true;
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
    if (!here || !dispersible(here, { hunted: fieldOp?.kind === "HUNT" && fieldOp.enemy === here.id }) || !operate(u, "UNITOPERATION_DISPERSE_INDEPENDENT")) return null;
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
function hostilesInReach(loc, margin = 0) {
    return hostilesAround(loc, REACH_LOOK + margin).filter((h) => {
        if (!h.def || h.def.Domain === "DOMAIN_AIR") return false;
        return safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, h.at.x, h.at.y), Infinity) <= reachOf(h) + margin;
    });
}

/** How far a hostile unit's next turn reaches (hostilesAround's { def }): a melee one its moves + 1, a ranged one its moves + its range. */
function reachOf(h) {
    const st = safe(() => GameInfo.Unit_Stats.lookup(h.def.UnitType), null);
    const ranged = Number(st?.RangedCombat) > 0 || Number(st?.Bombard) > 0;
    return Math.max(1, Number(h.def.BaseMoves) || 2) + (ranged ? Math.max(1, Number(st?.Range) || 1) : 1);
}

// ---- ships' reach (research/41 §3) ------------------------------------------------------------------

let shipCache = { turn: -1, time: 0, list: [] };
const SHIP_CACHE_MS = 1500;   // ships do not move within a pass
const shoreMemo = new Map();  // "area|x,y|range" -> a water tile of that body within range (terrain: kept)

/**
 * The hostile warships we see (hostileOwner, a visible tile; trade ships and submarines aside: they never hit land), read
 * from the players' unit lists once a pass: [{ at, def, stats, moves, range, area }].
 */
function hostileShips() {
    const turn = safe(() => Game.turn, -1);
    if (shipCache.turn === turn && Date.now() - shipCache.time < SHIP_CACHE_MS) return shipCache.list;
    const VISIBLE = globalThis.RevealedStates?.VISIBLE;
    const list = [];
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p || p.id === pid()) continue;
        for (const unit of safe(() => p.Units.getUnits(), []) ?? []) {
            const def = safe(() => GameInfo.Units.lookup(unit.type), null);
            if (def?.Domain !== "DOMAIN_SEA" || !unit.location || !(unit.location.x >= 0)) continue;
            const role = shipRole(def);
            if (role !== "SCREEN" && role !== "RANGED") continue;
            if (VISIBLE !== undefined && safe(() => GameplayMap.getRevealedState(pid(), unit.location.x, unit.location.y), VISIBLE) !== VISIBLE) continue;
            if (!seenNow(unit) || !hostileOwner(unit)) continue;
            list.push(shipRecord(unit, def, unit.location));
        }
    }
    shipCache = { turn, time: Date.now(), list };
    return list;
}

/** A ship as the reach rules read it (core inShipReach): { at, def, stats, moves, range, area }. */
function shipRecord(unit, def, at) {
    const stats = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    // getAreaId takes x and y, as the game's UI calls it (game 49: an index was refused six times, so every ship's
    // water body was unknown and counted as all water).
    return {
        at: { x: at.x, y: at.y }, def, stats, moves: Math.max(1, Number(def.BaseMoves) || 3),
        range: Math.max(1, Number(stats?.Range) || 1), area: safe(() => GameplayMap.getAreaId(at.x, at.y), null),
    };
}

/** Whether a water tile of this ship's own body lies within `range` of a tile (a navigable river counts: the cautious side). */
function shoreOf(ship) {
    return (tile, range) => {
        const k = `${ship.area}|${tile.x},${tile.y}|${range}`;
        if (shoreMemo.has(k)) return shoreMemo.get(k);
        let near = false;
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(tile.x, tile.y, range), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc || !onWater(loc)) continue;
            const area = safe(() => GameplayMap.getAreaId(loc.x, loc.y), null);
            if (ship.area === null || ship.area === undefined || area === ship.area || safe(() => GameplayMap.isNavigableRiver(loc.x, loc.y), false)) {
                near = true;
                break;
            }
        }
        if (shoreMemo.size > 20000) shoreMemo.clear();
        shoreMemo.set(k, near);
        return near;
    };
}

/** The hostile warships whose next turn reaches this land tile (core inShipReach). */
function shipsReaching(loc) {
    const ships = hostileShips();
    if (!loc || ships.length === 0) return [];
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    return ships.filter((s) => inShipReach(loc, s, dist, shoreOf(s)));
}

/**
 * The ships reaching this tile that a land unit of this type does not out-gun (core outGuns): all of them for a unit with
 * no Bombard (melee units, scouts, commanders). Empty when it may stand there. @returns [ship]
 */
function shipThreat(loc, def) {
    const ships = shipsReaching(loc);
    if (ships.length === 0) return [];
    const stats = def ? safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null) : null;
    return outGuns(stats, ships.map((s) => s.stats)) ? [] : ships;
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

/** Hostile military units (at war with us) we see within `radius`, or saw there lately (unitsSeenAt): [{ def, at, unit, seen, turn }]. */
function hostilesAround(loc, radius) {
    const out = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!at) continue;
        for (const { unit, seen, turn } of unitsSeenAt(at.x, at.y)) {
            if (hostileOwner(unit)) out.push({ def: safe(() => GameInfo.Units.lookup(unit.type), null), at, unit, seen, turn });
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
    if (afloat(u) || ctx.garrison.has(unitKey(u.id)) || !inDanger(u, def) || sheltersCommander(u, ourUnitsOf(ctx))) return null;
    const wake = () => wakeUnit(u);
    const water = waterRefuge(u, def, ctx);
    if (water) {
        wake();
        if (moveTo(u, water)) {
            ctx.stepTo.add(`${water.x},${water.y}`);
            return fled(u, def, { key: "TO_WATER", args: [nameOf(def), water.x, water.y] }, ctx);
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
        return fled(u, def, { key: "WITHDRAW", args: [nameOf(def), at.x, at.y] }, ctx);
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
    // A raider hunt's target is left to its coming general here too (W5: ctx.raiderHold; the review: an idle Slinger shot it).
    if (def.Domain === "DOMAIN_AIR") return ctx.ordered.has(unitKey(u.id)) ? null : airAttack(u, def, ctx.raiderHold);
    const here = disperseHere(u, def, ctx);
    if (here) return here;
    const shot = rangedAttack(u, def, { held: ctx.raiderHold });
    if (shot) return shot;
    if (Number(u.Health?.damage) > 0) {
        // It stays under the commander it shields (it rests there).
        const shelter = sheltersCommander(u, ourUnitsOf(ctx));
        // Not within reach of hostile units (ships too): a step back first, garrisons aside (research/23 D11:
        // game 8, a Mamluk healed on the coast next to two Cogs and was killed the next turn).
        // Away from our settlements, also when a raider's next turn reaches it (hostilesInReach; game 37 E8).
        // Within a ship's reach, also at its post (research/41 §3: game 38's Abambowa healed four turns on one coastal tile).
        if (!shelter && !ctx.garrison.has(unitKey(u.id)) && (hostileNear(u.location, HEAL_SAFE_RADIUS, ctx)
            || (!nearOwnCentre(u.location, ctx) && hostilesInReach(u.location).length > 0) || shipsReaching(u.location).length > 0)) {
            const back = stepAway(u, def, ctx, "WITHDRAW");
            if (back) return back;
        }
        // Not within VILLAGE_REST_KEEP of a hostile village in the field (game 60's scout: its soldiers gather there).
        if (!shelter && !ctx.garrison.has(unitKey(u.id))) {
            const off = restAwayFromVillages(u, def, ctx, "WITHDRAW");
            if (off) return off;
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

/** Resolves true when a Combat event names this unit as its attacker or defender, false after `ms` without one (W10). */
function untilCombatOf(id, ms) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (fired) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            safe(() => engine.off("Combat", onEvent), null);
            resolve(fired);
        };
        const onEvent = (d) => {
            if (sameId(d?.attacker, id) || sameId(d?.defender, id)) finish(true);
        };
        const timer = setTimeout(() => finish(false), ms);
        safe(() => engine.on("Combat", onEvent), null);
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

const STRIKE_TRADE_GENERAL = 1.2; // in the radius of a general that gains full XP from that enemy (W11)...
const STRIKE_KEEP_GENERAL = 0.6;  // ...while our unit keeps this share of its health

/**
 * Is the predicted attack worth it? Our unit keeps at least STRIKE_KEEP of its health, and the
 * enemy dies or takes STRIKE_TRADE times the damage we take. In the radius of a general that still gains full XP from that
 * enemy (`general`: below EXPERIENCE_MAX_BARB_LEVEL, or a major's unit) STRIKE_TRADE_GENERAL will do while our unit keeps
 * STRIKE_KEEP_GENERAL (W11, game 60: previews of 30/30, 32/28 and 22/40 taken/dealt on the hunted Archer were refused A72-A74
 * and the raider hunt ended STALL; a melee fight in radius gave a general below level 2 about 3.4 XP).
 */
export function strikeWorthIt({ ourHealth, ourMax, theirHealth, dealt, taken, siege = false, general = false }) {
    if (!(ourMax > 0) || !(dealt > 0)) return false;
    if (ourHealth - taken < STRIKE_KEEP * ourMax) return false;
    if (dealt >= theirHealth) return true;
    if (general && ourHealth - taken >= STRIKE_KEEP_GENERAL * ourMax && dealt >= STRIKE_TRADE_GENERAL * Math.max(1, taken)) return true;
    return dealt >= (siege ? STRIKE_TRADE_SIEGE : STRIKE_TRADE) * Math.max(1, taken);
}

/**
 * A trade on that tile pays (strikeWorthIt, `general` when xpGeneralOver), or the target is a hostile commander alone on its
 * tile and the game's preview says we take nothing (M2: a commander does no damage back, game 60's CombatLog: AttDmg 0).
 */
function tradePays(u, loc, trade, { siege = false } = {}) {
    if (!trade || trade.impossible) return false;
    // Only those we see now (unitsSeenAt: game 60, SCM-2).
    const there = unitsSeenAt(loc.x, loc.y, { remembered: false }).map((e) => e.unit).filter(Boolean);
    const enemy = there.find((e) => e.owner !== pid()) ?? null;
    const loneCommander = there.length > 0 && there.every((e) => hostileCommander(e));
    if (loneCommander && trade.answered && trade.taken === 0 && trade.dealt > 0) return true;
    return strikeWorthIt({ ourHealth: trade.ourHealth, ourMax: trade.ourMax, theirHealth: trade.theirHealth, dealt: trade.dealt, taken: trade.taken, siege, general: !!xpGeneralOver(u, enemy?.owner) });
}

/** A land commander's radius: 1, +1 with Merit (byGeneral's). */
const generalRadius = (c) => 1 + (safe(() => c.Experience?.hasPromotion("DISCIPLINE_ARMY_COMMENDATION_MERIT", "PROMOTION_COMMENDATION_ARMY_MERIT"), false) ? 1 : 0);

/** A land commander of ours whose radius covers `u` and that gains full XP from `enemyOwner`'s units (W6, W11), or null. */
function xpGeneralOver(u, enemyOwner) {
    if (!u?.location || enemyOwner === undefined || enemyOwner === null) return null;
    const independent = !!safe(() => Players.get(enemyOwner)?.isIndependent, false);
    return landCommanders(safe(() => Players.get(pid()).Units.getUnits(), []) ?? []).find((c) => c !== u && c.isOnMap !== false && c.location
        && plotDist(c.location, u.location) <= generalRadius(c) && fightXpShare({ level: xpOf(c).level, independent }, xpParams()) >= 1) ?? null;
}

/**
 * A raider hunt's targets left to its general (W5, game 60 A109-A111: the strike step's STRUCK and a SORTIE killed the hunted
 * Archer 3 tiles from the general, which got no XP; the hunt is for its XP): while the general is on its way (the hunt's first
 * RAIDER.COMMANDER_TURNS turns), the tiles of the hunted owner's units near the target. @returns { op, cmdr, tiles } or null
 */
function raiderHold(units) {
    const op = fieldOp;
    if (op?.kind !== "RAIDERS" || op.stage !== "FIGHT" || !op.commander || Game.turn - op.started >= RAIDER.COMMANDER_TURNS) return null;
    const cmdr = (units ?? []).find((u) => unitKey(u.id) === op.commander && u.isOnMap !== false && u.location);
    if (!cmdr) return null;
    const tiles = new Set(soldiersOf(op.enemy, op.target, RAIDER.ENEMY_RADIUS, { commanders: true }).tiles.map((t) => `${t.x},${t.y}`));
    return tiles.size > 0 ? { op, cmdr, tiles } : null;
}

let holdNoted = -1; // the turn UI.log said a raider waits for its general

/**
 * Is a strike of `u` on `loc` left to the hunt's general (raiderHold)? Not when `u` stands in its radius (that fight is its XP),
 * the raider besieges a settlement of ours, or it would kill `u` in its turn (core estimateStrike, its high end).
 */
function heldFor(hold, u, loc) {
    if (!hold?.tiles.has(`${loc.x},${loc.y}`) || !u?.location) return false;
    if (plotDist(hold.cmdr.location, u.location) <= generalRadius(hold.cmdr) || besieging(loc)) return false;
    const enemy = unitsSeenAt(loc.x, loc.y, { remembered: false }).map((e) => e.unit).find((e) => e && e.owner !== pid());
    if (enemy && plotDist(u.location, loc) <= 2) {
        const ours = { strength: Number(safe(() => u.Combat.getMeleeStrength(false), 0)) || 0, damage: Number(u.Health?.damage) || 0 };
        const blow = estimateStrike(ours, { strength: enemyStrength(enemy), damage: Number(enemy.Health?.damage) || 0 });
        if (enemyStrength(enemy) > 0 && blow.taken >= (Number(u.Health?.maxDamage) || 100) - ours.damage) return false;
    }
    if (holdNoted !== Game.turn) {
        holdNoted = Game.turn;
        log.info(`raiders: ${hold.op.target.name} at ${where(loc)} waits for its general (${plotDist(hold.cmdr.location, loc)} tiles)`);
    }
    return true;
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
 * Hostile military units (hostileOwner) we see now (unitsSeenAt, not those only remembered: they cannot be struck) on our land
 * or within THREAT_RADIUS of one of our settlements, except those in a district (a settlement's defences: a siege, not a raid);
 * `commanders`: hostile land commanders too (M2), `scouts`: hostile scouts (SC-6), each marked with its `kind`.
 * @returns [{ loc, id, kind: "soldier" | "commander" | "scout" }]
 */
function raidersNear({ commanders = false, scouts = false } = {}) {
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
            for (const { unit } of unitsSeenAt(loc.x, loc.y, { remembered: false })) {
                if (hostileOwner(unit)) out.push({ loc: { x: loc.x, y: loc.y }, id: unit.id, kind: "soldier" });
                else if (commanders && hostileCommander(unit)) out.push({ loc: { x: loc.x, y: loc.y }, id: unit.id, kind: "commander" });
                else if (scouts && hostileScout(unit)) out.push({ loc: { x: loc.x, y: loc.y }, id: unit.id, kind: "scout" });
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
 * gives the Plots, then {X, Y} (interface-mode-air-attack.js); `held`: a raider hunt's targets left to its general
 * (raiderHold). @returns a log entry or null
 */
function airAttack(u, def, held = null) {
    const best = airTargets(u, "UNITOPERATION_AIR_ATTACK", false, held)[0];
    return best ? sendAirAttack(u, def, best) : null;
}

/**
 * The hostile soldiers an air unit (or an air commander's focused attack: `command`) may strike, the best first: within
 * AIR_STRIKE_RADIUS of our settlements, a raider next to a damaged centre (a capture to prevent), an attacker of a
 * settlement, a kill; less where an enemy fighter's base covers it (research/37 §7D); none `held` for a raider hunt's general
 * (W5: heldFor). @returns [{ loc, enemy, score }]
 */
function airTargets(u, op, command = false, held = null) {
    if (!command && u.Combat && !(Number(u.Combat.attacksRemaining) > 0)) return [];
    const r = command ? safe(() => Game.UnitCommands.canStart(u.id, op, {}, false), null) : safe(() => Game.UnitOperations.canStart(u.id, op, {}, false), null);
    if (!r?.Plots?.length) return [];
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const fighters = enemyFighterBases();
    const out = [];
    for (const idx of r.Plots) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || startsWar(u, loc)) continue;
        const enemy = hostileSeenAt(loc);
        if (!enemy || (held && heldFor(held, u, loc))) continue;
        const d = Math.min(Infinity, ...ours.map((c) => dist(c, loc)));
        if (!(d <= AIR_STRIKE_RADIUS)) continue;
        const capture = ours.some((c) => dist(c, loc) === 1 && centreDamaged(c));
        const covered = fighters.some((f) => dist(f.at, loc) <= f.range);
        out.push({ loc, enemy, score: airTargetScore({ d, damage: damageAt(loc), capture, covered }) });
    }
    return out.sort((a, b) => b.score - a.score);
}

/** The game's air attack on that target, as its air attack mode sends it. @returns a log entry */
function sendAirAttack(u, def, t) {
    Game.UnitOperations.sendRequest(u.id, "UNITOPERATION_AIR_ATTACK", { X: t.loc.x, Y: t.loc.y });
    const theirs = safe(() => GameInfo.Units.lookup(t.enemy.type), null);
    return { key: "AIR_STRIKE", args: [nameOf(def), theirs ? nameOf(theirs) : "?", t.loc.x, t.loc.y] };
}

/**
 * An air strike that asks the game's preview first (research/41 Phase 6, P-AIR-4; research/42 C3): of the best targets,
 * the first whose trade pays (strikeWorthIt). What the preview says of an air attack is not known yet: only a full answer
 * that the trade is poor holds a strike back; no answer, or one without our side, strikes as before (the game's canStart
 * offered the tile). UI.log says once a turn what the preview answered (probe P-AIR-4). @returns a log entry or null
 */
async function airStrike(u, def, held = null) {
    const list = airTargets(u, "UNITOPERATION_AIR_ATTACK", false, held);
    for (const t of list.slice(0, AIR_PREVIEW_TRIES)) {
        const trade = await strikeTrade(u, t.loc, t.enemy);
        if (airPreviewNoted !== Game.turn) {
            airPreviewNoted = Game.turn;
            log.info(`air: preview for ${def?.UnitType ?? "?"} on ${t.loc.x},${t.loc.y}: ${trade?.impossible ? "no attacker side" : trade?.answered ? `${trade.dealt} dealt, ${trade.taken} taken` : "no answer"} (probe P-AIR-4)`);
        }
        if (trade?.answered && !strikeWorthIt({ ourHealth: trade.ourHealth, ourMax: trade.ourMax, theirHealth: trade.theirHealth, dealt: trade.dealt, taken: trade.taken })) continue;
        return sendAirAttack(u, def, t);
    }
    return null;
}
let airPreviewNoted = -1;
const AIR_PREVIEW_TRIES = 3; // targets an air strike's preview is asked for, the best first

/**
 * An air commander's focused attack (research/42 C3; every plane of its class based there strikes one target, +2 each), by
 * the class each command orders (the game's text, after game 54: Ground Attack, `…_AIR_TO_LAND`, orders "eligible Attack Air
 * Units"; Carpet Bomb, `…_AIR_BOMB`, "Bomber Units"; Fighter Sweep, `…_AIR_TO_AIR`, "all Fighter Units ... engage any
 * intercepting enemy Fighters"; research/42 sent Ground Attack for bombers): with AIR_FOCUS_MIN planes of that class with an
 * attack left, at the best target (airTargets). When an enemy fighter covers that target and AIR_FOCUS_MIN of our fighters are
 * there, they sweep it first and the strike waits for the next pass. A carrier is an air commander too.
 * @returns { entry, ordered } or null
 */
async function airCommanderAttack(cmdr, def, units) {
    const planes = units.filter((u) => !u.isCommanderUnit && sameId(u.armyId, cmdr.armyId) && isAircraft(safe(() => GameInfo.Units.lookup(u.type), null), u)
        && Number(u.Combat?.attacksRemaining) > 0);
    const ofClass = (tag) => planes.filter((u) => hasTag(safe(() => GameInfo.Units.lookup(u.type), null), tag));
    const fighters = ofClass("UNIT_CLASS_INTERCEPTOR");
    for (const [OP, tag, key] of AIR_COMMANDS) {
        const group = ofClass(tag);
        if (group.length < AIR_FOCUS_MIN) continue;
        const best = airTargets(cmdr, OP, true)[0];
        if (!best) continue;
        const theirs = safe(() => GameInfo.Units.lookup(best.enemy.type), null);
        // Their fighters cover it: ours sweep it first (Fighter Sweep), when the game offers that tile.
        const SWEEP = "UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR";
        const covered = enemyFighterBases().some((f) => safe(() => GameplayMap.getPlotDistance(f.at.x, f.at.y, best.loc.x, best.loc.y), Infinity) <= f.range);
        const idx = safe(() => GameplayMap.getIndexFromXY(best.loc.x, best.loc.y), -1);
        if (covered && fighters.length >= AIR_FOCUS_MIN && (safe(() => Game.UnitCommands.canStart(cmdr.id, SWEEP, {}, false), null)?.Plots ?? []).includes(idx)) {
            Game.UnitCommands.sendRequest(cmdr.id, SWEEP, { X: best.loc.x, Y: best.loc.y });
            await untilEvent("Combat", COMBAT_WAIT_MS);
            return { entry: { key: "AIR_SWEEP", args: [nameOf(def), best.loc.x, best.loc.y, fighters.length] }, ordered: [unitKey(cmdr.id), ...fighters.map((u) => unitKey(u.id))] };
        }
        Game.UnitCommands.sendRequest(cmdr.id, OP, { X: best.loc.x, Y: best.loc.y });
        await untilEvent("Combat", COMBAT_WAIT_MS);
        return { entry: { key, args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.loc.x, best.loc.y, group.length] }, ordered: [unitKey(cmdr.id), ...group.map((u) => unitKey(u.id))] };
    }
    return null;
}
const AIR_FOCUS_MIN = 2; // an air commander's focused attack wants this many planes of the class it orders
// Its commands, bombers first (the heaviest strike), and the class each orders (the game's text).
const AIR_COMMANDS = [
    ["UNITCOMMAND_FOCUSED_ATTACK_AIR_BOMB", "UNIT_CLASS_BOMBER", "AIR_CARPET_BOMB"],
    ["UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_LAND", "UNIT_CLASS_GROUND_ATTACKER", "AIR_FOCUSED_ATTACK"],
];
/** An air commander: an Aerodrome or Squadron Commander, or a carrier (a naval Squadron Commander: research/54). */
const isAirCommander = (def) => !!def && (def.Domain === "DOMAIN_AIR" || hasTag(def, "UNIT_CLASS_CARRIER_COMMANDER")) && hasTag(def, "UNIT_CLASS_COMMAND");

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
 * Our air bases (research/37 §3E, §7A): each Airfield's Aerodrome Commander, each Squadron Commander and each carrier (game
 * 54's review: "Once based on a carrier, Air Units can launch air attacks and intercept enemy aircraft just as they would on
 * land"), its tile, the city an Airfield belongs to, its free slots (the army's combatUnitCapacity less our aircraft packed
 * in it), the planes in it and how far a fighter based there intercepts (INTERCEPT_RANGE, +1 for an Aerodrome, +1 after
 * Flight's mastery; Ace promotions not counted). @returns [{ at, type, city (ComponentID) or null, free, range, planes: [type] }]
 */
export function airBases() {
    const mine = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const mastery = (Number(safe(() => Game.ProgressionTrees.getNode(pid(), FLIGHT_MASTERY)?.depthUnlocked, 0)) || 0) >= 2 ? 1 : 0;
    const out = [];
    for (const c of mine) {
        const def = safe(() => GameInfo.Units.lookup(c.type), null);
        // An Airfield's Aerodrome Commander (+1 interception range), a Squadron Commander (research/37 §7A) or a carrier.
        const aerodrome = def?.UnitType === "UNIT_AERODROME_COMMANDER";
        if (!aerodrome && !isSquadronCommander(def) && !isCarrier(def)) continue;
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
 * gives each ship type's answers once a session (probe P-NAV-1). `held`: a raider hunt's targets left to its general
 * (raiderHold). @returns a log entry or null
 */
async function shipAttack(u, def, held = null) {
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
            const enemy = hostileSeenAt(loc);
            // A raider hunt's target is left to its coming general (W5: heldFor).
            if (!enemy || (held && heldFor(held, u, loc))) continue;
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
function navalPost(x, s, ctx, why = null) {
    const tiles = [];
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(s.x, s.y, GUARD_RADIUS), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc || ctx.stepTo.has(`${loc.x},${loc.y}`) || !standsOn(x.def, loc) || !roomForSoldier(loc) || hazardAt(loc) > 0) continue;
        const near = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, s.x, s.y), 9);
        const far = safe(() => GameplayMap.getPlotDistance(loc.x, loc.y, x.u.location.x, x.u.location.y), 99);
        tiles.push({ loc, score: near * 100 + far });
    }
    tiles.sort((a, b) => a.score - b.score);
    if (why) why.reason = tiles.length === 0 ? "no free water tile" : "no path";
    for (const { loc } of tiles.slice(0, REINFORCE_TRIES)) {
        const turns = pathTurns(x.u, loc);
        if (why && turns !== null && turns > NAVAL.POST_MAX_TURNS) why.reason = `${turns} turns`;
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
            // Why each free warship stayed (research/41 §3: 46 of 186 `naval:` lines of games 37-47 had free warships and sent none).
            const idle = ships.filter((x) => !used.has(x.k) && free(x));
            const notSent = idle.map((x) => {
                if (lack <= 0) return `${name(x)} at ${where(x.u.location)} (not needed)`;
                const why = {};
                navalPost(x, t.settlement, ctx, why);
                return `${name(x)} at ${where(x.u.location)} (${why.reason ?? "?"})`;
            });
            log.info(`naval: ${t.settlement.name}: ships ${t.ships}; warships there [${present.map(name).join(", ")}], coming [${coming.map(name).join(", ")}]; sent [${sent.join("; ")}]; ${idle.length} free warship(s)${notSent.length > 0 ? `; not sent [${notSent.join("; ")}]` : ""}`);
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

/** A Squadron Commander (an air one: a carrier is a naval Squadron Commander), a carrier, a Fleet Commander (the game's tags). */
export const isSquadronCommander = (def) => def?.Domain === "DOMAIN_AIR" && (def.UnitType === "UNIT_SQUADRON_COMMANDER" || hasTag(def, "UNIT_CLASS_SQUADRON_COMMANDER"));
export const isCarrier = (def) => !!def && (def.UnitType === "UNIT_CARRIER_COMMANDER" || hasTag(def, "UNIT_CLASS_CARRIER_COMMANDER"));
export const isFleetCommander = (def) => def?.Domain === "DOMAIN_SEA" && (def.PromotionClass === "PROMOTION_CLASS_NAVAL_COMMANDER" || hasTag(def, "UNIT_CLASS_FLEET_COMMANDER"));

const SQUADRON_HOLD = 5;          // a Squadron Commander moves its base at most every this many turns
const squadronMoved = new Map();  // unit key -> the turn it last established a base

/**
 * Squadron Commanders set up their air base where fighter cover is wanted (game 54's review: the game's text, "Air
 * Squadrons ... can Establish Air Bases on flat tiles with no Urban District that are not owned by another player", and
 * planes "cannot Rebase to a Squadron Commander until that Squadron Commander has used its Establish Air Base action";
 * research/42 left them unused): `ctx.airCover` settlements no other base covers, on the tile the game offers
 * (UNITOPERATION_ESTABLISH_BASE: canStart with no target gives the Plots, then {X, Y}, as interface-mode-establish-base.js
 * sends it) that covers the most of them within a fighter's interception from it, then the nearest them; only for more than
 * it covers where it stands, at most every SQUADRON_HOLD turns. The fighters rebase to it after (rebaseFighters).
 * @returns log entries
 */
function establishSquadronBases(ctx, units) {
    const out = [];
    const targets = ctx.airCover ?? [];
    if (targets.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const bases = safe(() => airBases(), []) ?? [];
    const mastery = (Number(safe(() => Game.ProgressionTrees.getNode(pid(), FLIGHT_MASTERY)?.depthUnlocked, 0)) || 0) >= 2 ? 1 : 0;
    const range = INTERCEPT_RANGE + mastery;
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (!u.isCommanderUnit || !isSquadronCommander(def)) continue;
        const k = unitKey(u.id);
        if (ctx.ordered.has(k) || Game.turn - (squadronMoved.get(k) ?? -Infinity) < SQUADRON_HOLD) continue;
        const here = unitTile(u);
        const others = bases.filter((b) => !(here && same(b.at, here) && b.type === def.UnitType));
        const open = targets.filter((t) => !others.some((b) => dist(b.at, t) <= b.range));
        if (open.length === 0) continue;
        const now = here ? open.filter((t) => dist(here, t) <= range).length : 0;
        let best = null;
        for (const idx of safe(() => Game.UnitOperations.canStart(u.id, "UNITOPERATION_ESTABLISH_BASE", {}, false), null)?.Plots ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            const covers = open.filter((t) => dist(loc, t) <= range);
            if (covers.length <= now) continue;
            const near = Math.min(...covers.map((t) => dist(loc, t)));
            const score = covers.length * 100 - near * 10 - (here ? dist(here, loc) : 0);
            if (!best || score > best.score) best = { loc, covers, score };
        }
        if (!best) continue;
        Game.UnitOperations.sendRequest(u.id, "UNITOPERATION_ESTABLISH_BASE", { X: best.loc.x, Y: best.loc.y });
        squadronMoved.set(k, Game.turn);
        ctx.ordered.add(k);
        const names = best.covers.map((t) => t.name ?? where(t));
        log.info(`air: ${def.UnitType} establishes a base at ${where(best.loc)} (from ${here ? where(here) : "off the map"}) for ${names.join(", ")}: no other base of ours covers them`);
        out.push({ key: "SQUADRON_BASE", args: [nameOf(def), names.join(", ")] });
    }
    return out;
}

/**
 * Carriers sail where fighter cover is wanted and no land base covers it (game 54's review: "a powerful, mobile, Naval
 * Squadron Commander that can extend the range of your airforce across the sea"): `ctx.airCover` settlements that no
 * Airfield or Squadron base covers, the nearest first, to a water tile within GUARD_RADIUS of it (navalPost, as warships);
 * its fighters there intercept and its planes strike from it (commanderAttacks). @returns log entries
 */
function postCarriers(units, ctx) {
    const out = [];
    const targets = ctx.airCover ?? [];
    if (targets.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const land = (safe(() => airBases(), []) ?? []).filter((b) => !isCarrier(safe(() => GameInfo.Units.lookup(b.type), null)));
    const open = targets.filter((t) => !land.some((b) => dist(b.at, t) <= b.range));
    const taken = new Set();
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const k = unitKey(u.id);
        if (!isCarrier(def) || u.isOnMap === false || !u.location || ctx.ordered.has(k) || u.canMove === false || u.hasMoved === true) continue;
        const range = INTERCEPT_RANGE;
        // It covers one already: it stays.
        if (open.some((t) => dist(u.location, t) <= range - 1)) continue;
        const target = open.filter((t) => !taken.has(`${t.x},${t.y}`)).sort((a, b) => dist(u.location, a) - dist(u.location, b))[0];
        if (!target) continue;
        const post = navalPost({ u, def, k }, target, ctx);
        if (!post) continue;
        wakeUnit(u);
        if (!moveTo(u, post.loc)) continue;
        taken.add(`${target.x},${target.y}`);
        ctx.ordered.add(k);
        ctx.stepTo.add(`${post.loc.x},${post.loc.y}`);
        log.info(`air: ${def.UnitType} sails to ${where(post.loc)} (${post.turns} turn(s)) to cover ${target.name ?? where(target)}: no land base of ours covers it`);
        out.push({ key: "CARRIER_SAILS", args: [nameOf(def), target.name ?? "?"] });
    }
    return out;
}

/**
 * Fleet Commanders stand with our warships where ships attack us (game 54's review: Coordinated Naval Attack orders "all
 * Light Naval Units within Command Radius", Focus Fire "all Heavy Naval Units", +2 each; commanderAttacks sends them): at
 * the threatened settlement with ships where the most of our warships stand or are sent (planNavalGuards), on the water tile
 * a warship of ours holds (it shares the tile: FORMATION_CLASS_COMMAND; the ship is the one attacked) that covers the most
 * of them, else toward that settlement's waters (navalPost) when the walk's first stop is out of every hostile ship's reach
 * or under a warship of ours. With no such fight it stays. @returns log entries
 */
function postFleetCommanders(units, ctx) {
    const out = [];
    const fights = ctx.threats.filter((t) => Number(t.ships) > 0);
    if (fights.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const warships = units.filter((x) => !x.isCommanderUnit && x.isOnMap !== false && !!x.location && isWarship(shipRole(safe(() => GameInfo.Units.lookup(x.type), null))));
    if (warships.length === 0) return out;
    const keyOf = (t) => `${t.settlement.x},${t.settlement.y}`;
    const ours = (t) => warships.filter((x) => dist(x.location, t.settlement) <= GUARD_RADIUS + 1 || (goals.get(unitKey(x.id))?.naval && goals.get(unitKey(x.id))?.guard === keyOf(t))).length;
    const shielded = (loc) => warships.some((x) => same(x.location, loc) && (Number(x.Health?.damage) || 0) < SHIELD_DAMAGE);
    for (const u of units) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        const k = unitKey(u.id);
        if (!u.isCommanderUnit || !isFleetCommander(def) || u.isOnMap === false || !u.location || ctx.ordered.has(k) || u.canMove === false || u.hasMoved === true) continue;
        const fight = [...fights].sort((a, b) => ours(b) - ours(a) || dist(u.location, a.settlement) - dist(u.location, b.settlement))[0];
        if (!fight || ours(fight) === 0) continue;
        // Near the fight: the warship's tile covering the most of them (radius 1), reached this turn.
        let best = null;
        for (const x of warships) {
            if (dist(x.location, fight.settlement) > GUARD_RADIUS + 1 || !shielded(x.location)) continue;
            const covered = warships.filter((y) => dist(y.location, x.location) <= 1).length;
            const t = same(x.location, u.location) ? 0 : pathTurns(u, x.location);
            if (t === null || t > 1) continue;
            if (!best || covered > best.covered || (covered === best.covered && t < best.t)) best = { loc: x.location, covered, t };
        }
        let to = best?.loc ?? null;
        if (!best) {
            const post = navalPost({ u, def, k }, fight.settlement, ctx);
            const p = post ? pathTo(u, post.loc) : null;
            const stop = p ? (p.turns <= 1 ? post.loc : turnStop(p)) : null;
            if (stop && (shielded(stop) || shipsReaching(stop).length === 0)) to = post.loc;
        }
        if (!to || same(to, u.location)) continue;
        wakeUnit(u);
        if (!moveTo(u, to)) continue;
        ctx.ordered.add(k);
        log.info(`naval: ${def.UnitType} to ${where(to)} for ${fight.settlement.name ?? where(fight.settlement)}: ${ours(fight)} warship(s) of ours there${best ? `, ${best.covered} in its radius, under a warship` : ""}`);
        out.push({ key: "FLEET_COMMANDER_POST", args: [nameOf(def), fight.settlement.name ?? "?"] });
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
    log.info(`air: bases [${bases.map((b) => `${b.type === "UNIT_AERODROME_COMMANDER" ? "airfield" : isCarrier(safe(() => GameInfo.Units.lookup(b.type), null)) ? "carrier" : "squadron"} ${where(b.at)} [${b.planes.join(", ")}] free ${b.free} intercepts ${b.range}`).join("; ")}]; cover wanted [${cover.join("; ")}]; rebases [${(ctx.airRebases ?? []).join("; ")}]`);
}

// ---- probes for the next phases (research/37 §3F, §11C; UI.log only) ----------------------------------

const armyNoted = new Map(); // commander key -> its last army line (written again only when it changes)
const PROBE_AIR_LINES = 12;  // aircraft lines a turn at most
const PROBE_COMBAT_LINES = 2; // Combat event payloads a turn, while aircraft are about
let probeTurn = -1;
let airAbout = false;        // aircraft of ours or of a leader at war with us seen this turn (the Combat probe listens then)
let combatLogged = { turn: -1, n: 0 };
const xpNoted = new Map();    // commander key -> its last xp line (P-XP-2, P-DEATH-1)

const where = (l) => (l ? `${l.x},${l.y}` : "?");
const typeOf = (u) => safe(() => GameInfo.Units.lookup(u.type)?.UnitType, "?");

/** A commander's level, XP and promotions, as the game's promotion panel reads them (model-unit-promotion.js). */
function xpText(u) {
    const e = u?.Experience;
    if (!e) return "no Experience";
    const v = (f) => safe(f, "?");
    return `level ${v(() => e.getLevel)}, XP ${v(() => e.experiencePoints)}/${v(() => e.experienceToNextLevel)}, promotions ${v(() => e.getTotalPromotionsEarned)} (points ${v(() => e.getStoredPromotionPoints)}, commendations ${v(() => e.getStoredCommendations)})`;
}

/**
 * What a fight gave our land commanders (W6, game 60), for the `fight:` line (data/xpl-unit-log.js noteFight: it replaced the
 * `xp: combat` probe). generalXpAtFight: a commander's XP when last read (the `xp:` probe, its last fight line) and at the
 * fight, which becomes the last read. @returns { was: { level, xp } | null, at: { level, xp } }
 */
export function generalXpAtFight(c) {
    const k = unitKey(c.id);
    const was = xpSeen.get(k) ?? null;
    const at = xpOf(c);
    xpSeen.set(k, at);
    return { was, at };
}

/**
 * A moment (XP_AFTER_MS) after a fight of ours at `at`, `xp: after the fight T…: <type> <key> XP a -> b` for each land
 * commander of ours within 2 tiles whose XP moved since the event (whichever way the game orders the award and the event;
 * and whether a commander 2 tiles away, outside its radius, gains).
 */
export function xpAfterFight(at) {
    if (!at || !(at.x >= 0)) return;
    const turn = safe(() => Game.turn, -1);
    const near = (safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])
        .filter((c) => c.isCommanderUnit && c.isOnMap !== false && c.location && isLandCommander(safe(() => GameInfo.Units.lookup(c.type), null)) && plotDist(c.location, at) <= 2)
        .map((c) => ({ id: c.id, k: unitKey(c.id), at: xpOf(c) }));
    if (near.length === 0) return;
    const xpFmt = (x) => (x ? `L${x.level} ${x.xp}` : "?");
    const after = () => {
        for (const n of near) {
            const c = safe(() => Units.get(n.id), null);
            const later = c ? xpOf(c) : null;
            if (!later || (later.level === n.at.level && later.xp === n.at.xp)) continue;
            xpSeen.set(n.k, later);
            log.info(`xp: after the fight T${turn}: ${typeOf(c)} ${n.k} XP ${xpFmt(n.at)} -> ${xpFmt(later)}`);
        }
    };
    const timer = safe(() => setTimeout(() => safe(after, null), XP_AFTER_MS), null);
    safe(() => timer?.unref?.(), null);
}

const XP_AFTER_MS = 250;      // a fight's XP is read again this long after its Combat event
const xpSeen = new Map();     // commander key -> { level, xp } last read (fight lines, the xp: probe)

/**
 * Our fights, for the generals' posts and the operations' kills (the Combat event: attacker, defender). A settlement of ours
 * within THREAT_RADIUS of a fight of ours keeps its general's post FIGHT_MEMORY turns (W4: an enemy commander or a ship our
 * units fight counts, which threatenedSettlements leaves out); an opponent of a field operation's enemy is remembered, its
 * death a kill (W7: reviewFieldOp).
 */
function noteFights(d) {
    const me = pid();
    const side = d?.attacker?.owner === me ? "attacker" : d?.defender?.owner === me ? "defender" : null;
    if (!side) return;
    const ours = d[side];
    const theirs = side === "attacker" ? d.defender : d.attacker;
    const turn = safe(() => Game.turn, -1);
    const at = safe(() => Units.get(ours), null)?.location ?? safe(() => Districts.get(ours)?.location, null);
    if (at && at.x >= 0) {
        for (const c of ourCentres()) if (plotDist(c, at) <= THREAT_RADIUS) fightMemory.set(`${c.x},${c.y}`, turn);
    }
    // A unit of theirs, not a district (a training war's shot at a soldier in their city hits its district: no kill to count).
    if (fieldOp && theirs && theirs.owner === fieldOp.enemy && !safe(() => Districts.get(theirs), null)) (fieldOp.fought ??= new Map()).set(idString(theirs), { id: theirs, turn });
}
const fightMemory = new Map(); // settlement "x,y" -> the last turn of a fight of ours near it

/** Was there a fight of ours near this settlement within GENERAL.FIGHT_MEMORY turns (noteFights)? */
function foughtLately(loc) {
    const t = fightMemory.get(`${loc.x},${loc.y}`);
    return t !== undefined && Game.turn >= t && Game.turn - t <= GENERAL.FIGHT_MEMORY;
}

const PROBE_HOSTILE_COMMANDERS = 4; // hostile commanders a turn in UI.log at most

/**
 * M2's probe (UI.log, once a turn): each hostile land commander we see now (unitsSeenAt) within THREAT_RADIUS of our
 * settlements, its army's size, and whether the game offers an attack on it to our soldiers next to it (MOVE_TO with ATTACK,
 * as the map asks) and an Overrun to our generals with soldiers packed (UNITCOMMAND_ARMY_OVERRUN's Plots, as overrunRaider
 * asks).
 */
function probeHostileCommanders(mine) {
    const M = globalThis.UnitOperationMoveModifiers;
    const MOVE = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    const seen = new Set();
    for (const c of ourCentres()) {
        for (const at of tilesAt(c, THREAT_RADIUS)) {
            for (const { unit } of unitsSeenAt(at.x, at.y, { remembered: false })) {
                if (seen.size >= PROBE_HOSTILE_COMMANDERS || seen.has(idString(unit.id)) || !hostileCommander(unit)) continue;
                seen.add(idString(unit.id));
                const army = safe(() => Armies.get(unit.armyId), null);
                const attack = mine.filter((u) => !u.isCommanderUnit && u.isOnMap !== false && u.location && plotDist(u.location, at) === 1 && isSoldier(safe(() => GameInfo.Units.lookup(u.type), null)))
                    .map((u) => `${typeOf(u)} ${safe(() => Game.UnitOperations.canStart(u.id, MOVE, { X: at.x, Y: at.y, Modifiers: M?.ATTACK ?? 0 }, false), null)?.Success ? "yes" : "no"}`);
                const idx = safe(() => GameplayMap.getIndexFromXY(at.x, at.y), -1);
                const overrun = landCommanders(mine).filter((g) => g.isOnMap !== false && packedSoldiers(g, mine).length > 0)
                    .map((g) => `${typeOf(g)} ${(safe(() => Game.UnitCommands.canStart(g.id, OVERRUN, {}, false), null)?.Plots ?? []).includes(idx) ? "yes" : "no"}`);
                const name = safe(() => Locale.compose(settlementAt(c).name), null) ?? where(c);
                log.info(`hostile commander: p${unit.owner} ${typeOf(unit)} at ${where(at)} ${plotDist(c, at)} tile(s) from ${name}: army ${army?.unitCount ?? "?"}, damage ${unit.Health?.damage ?? "?"}; attack offered [${attack.join(", ") || "no soldier of ours next to it"}]; overrun offered [${overrun.join(", ") || "no army of ours packed"}]`);
            }
        }
    }
}

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
    // P-XP-2, P-DEATH-1 (research/41 §2): each land commander's level, XP and promotions when they change; a defeated
    // one shows onMap=false at -9999,-9999 until it respawns.
    for (const c of mine) {
        if (!c.isCommanderUnit || !isLandCommander(safe(() => GameInfo.Units.lookup(c.type), null))) continue;
        const line = `xp: ${typeOf(c)} ${unitKey(c.id)} at ${where(c.location)} onMap=${c.isOnMap}; ${xpText(c)}`;
        const k = unitKey(c.id);
        if (xpNoted.get(k) !== line) log.info(line);
        xpNoted.set(k, line);
        xpSeen.set(k, xpOf(c));
    }
    // M2: hostile commanders near us, and whether the game lets us attack or overrun them.
    safe(() => probeHostileCommanders(mine), null);
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
        safe(() => noteFights(d), null);
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
async function shootRaiders(ordered, hold = null) {
    const out = [];
    const A = globalThis.UnitActivityTypes;
    const centres = new Set((safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => `${c.location.x},${c.location.y}`));
    for (const u of byGeneral(safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])) {
        if (out.length >= SHOTS_MAX) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        // Aircraft too (based ones may count as off the map): the game's air attack (airAttack).
        const air = def?.Domain === "DOMAIN_AIR";
        if (!isSoldier(def) || u.isCommanderUnit || (!air && u.isOnMap === false) || ordered.has(unitKey(u.id)) || !shootsFromAfar(def)) continue;
        if (!(Number(u.Combat?.attacksRemaining) > 0) || (A && u.activityType === A.OPERATION)) continue;
        if (def.Domain === "DOMAIN_LAND" && !centres.has(`${u.location?.x},${u.location?.y}`) && inDanger(u, def)) continue;
        const e = air ? await airStrike(u, def, hold) : def.Domain === "DOMAIN_SEA" ? await shipAttack(u, def, hold) : rangedAttack(u, def, { hostileOnly: true, held: hold });
        if (!e) continue;
        ordered.add(unitKey(u.id));
        out.push(e);
        await untilEvent("Combat", COMBAT_WAIT_MS);
    }
    return out;
}

/**
 * What a strike of this unit on that tile would trade, by the game's preview (simulateAttack), else the estimate
 * (core/xpl-combat.js, pessimistic for us). @returns { answered, impossible, dealt, taken, ourHealth, ourMax, theirHealth }
 * or null (no estimate either)
 */
async function strikeTrade(u, loc, enemy) {
    const r = await simulateAttack(u, loc);
    const answered = !!(r?.Attacker && r?.Defender);
    // An answer without our side: the game says no attack is possible (its attack preview hides itself).
    if (r && !answered) return { impossible: true };
    const ourMax = Number(u.Health?.maxDamage) || 100;
    const ourHealth = ourMax - (Number(u.Health?.damage) || 0);
    const them = answered ? safe(() => Units.get(r.Defender.ID), null) ?? enemy : enemy;
    const theirMax = Number((answered ? r.Defender.MaxHitPoints : null) ?? them?.Health?.maxDamage) || 100;
    const theirHealth = theirMax - (Number(them?.Health?.damage) || 0);
    if (answered) return { answered, dealt: Number(r.Defender.DamageTo) || 0, taken: Number(r.Attacker.DamageTo) || 0, ourHealth, ourMax, theirHealth };
    const melee = Number(safe(() => u.Combat.getMeleeStrength(false), 0)) || 0;
    const guess = estimateStrike({ strength: melee, damage: Number(u.Health?.damage) || 0 }, { strength: enemyStrength(them), damage: Number(them?.Health?.damage) || 0 });
    if (!guess || !(enemyStrength(them) > 0)) return null;
    return { answered: false, dealt: guess.dealt, taken: guess.taken, ourHealth, ourMax, theirHealth };
}

/** Does a strike of this unit on that tile pay (tradePays on strikeTrade: strikeWorthIt, a general's radius, a lone commander)? */
async function strikePays(u, loc, enemy) {
    const t = await strikeTrade(u, loc, enemy);
    return tradePays(u, loc, t, { siege: besieging(loc) });
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
    // A raider hunt's target is left to its general while it comes (W5: raiderHold).
    const hold = raiderHold(safe(() => Players.get(pid()).Units.getUnits(), []) ?? []);
    // Ranged soldiers next, those on guard too (game 27): their damage may make a melee strike worth it.
    const shots = await shootRaiders(ordered, hold);
    entries.push(...shots);
    if (!strikes) return { entries, ordered };
    const MOVE = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    // Why nothing struck, for UI.log (seen in game: no strike in a whole game, cause unknown).
    const seen = { pairs: 0, noAnswer: 0, impossible: 0, poor: 0 };
    for (const u of byGeneral(safe(() => Players.get(pid()).Units.getUnits(), []) ?? [])) {
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
        // Hostile commanders too (M2): a lone one only when the preview says we take nothing (tradePays).
        for (const t of raidersNear({ commanders: true })) {
            if (safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, t.loc.x, t.loc.y), 9) !== 1) continue;
            if (heldFor(hold, u, t.loc)) continue;
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
            if (!tradePays(u, t.loc, { answered, ourHealth, ourMax, theirHealth, dealt, taken }, { siege: besieging(t.loc) })) {
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
    entries.push(...await sorties(ordered, M, hold));
    return { entries, ordered };
}

const SORTIE_RADIUS = 3;   // a raider this close to one of our settlements is struck by soldiers that reach it this turn...
const SORTIE_MAX = 3;      // ...at most this many a pass...
const SORTIE_DAMAGE = 30;  // ...each hurt less than this...
const SORTIE_CROWD = 2;    // ...never into a raider with more than this many other hostile land units next to it
const SORTIE_SCOUTS = 1;   // hostile scouts struck a pass at most (SC-6)

/**
 * Sorties (research/42 B3; game 53: 407 attacks on us in Modern, 129 on districts, while we struck only raiders already next
 * to a melee unit and 15-26 soldiers stood free): a healthy melee soldier with every move and an attack left, not on one of
 * our centres (its holder stays), goes out to a hostile land unit within SORTIE_RADIUS of our settlements that it reaches
 * this turn, when the game's preview says the strike pays (strikeTrade, strikeWorthIt), the general's radius first; sent as
 * the map's attack (MOVE_TO with ATTACK). Not into a crowd. A hostile commander too (M2; a lone one when the preview says we
 * take nothing), and a hostile scout (SC-6: game 60's scouts of Шэнле and Цзэши walked 2-3 tiles from the capital, never
 * struck) only by a soldier in a land commander's radius, after every other target, SORTIE_SCOUTS a pass. A raider hunt's
 * target is left to its general while it comes (W5: heldFor). @returns log entries
 */
async function sorties(ordered, M, hold = null) {
    const out = [];
    if (M?.ATTACK === undefined) return out;
    const MOVE = globalThis.UnitOperationTypes?.MOVE_TO ?? "UNITOPERATION_MOVE_TO";
    const cities = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const targets = raidersNear({ commanders: true, scouts: true }).filter((t) => cities.some((c) => dist(c, t.loc) <= SORTIE_RADIUS));
    if (targets.length === 0) return out;
    const struck = new Set();
    const all = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const generals = landCommanders(all).filter((c) => c.isOnMap !== false && c.location);
    let scouts = 0;
    for (const u of byGeneral(all)) {
        if (out.length >= SORTIE_MAX) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (def?.CoreClass !== "CORE_CLASS_MILITARY" || def.Domain !== "DOMAIN_LAND" || u.isCommanderUnit || u.isOnMap === false || !u.location) continue;
        if (u.canMove === false || u.hasMoved === true || ordered.has(unitKey(u.id)) || afloat(u)) continue;
        if (!(Number(u.Combat?.attacksRemaining) > 0) || (Number(u.Health?.damage) || 0) >= SORTIE_DAMAGE) continue;
        if (cities.some((c) => same(c, u.location))) continue;
        const melee = Number(safe(() => u.Combat.getMeleeStrength(false), 0)) || 0;
        if (!(melee > 0) || Number(u.Combat?.rangedStrength ?? 0) > melee || Number(u.Combat?.bombardStrength ?? 0) > melee) continue;
        const reachTiles = Math.max(1, Number(def.BaseMoves) || 2);
        const underGeneral = generals.some((c) => dist(c.location, u.location) <= generalRadius(c));
        let best = null;
        for (const t of targets) {
            const k = `${t.loc.x},${t.loc.y}`;
            const d = dist(u.location, t.loc);
            if (struck.has(k) || d < 2 || d > reachTiles) continue;
            if (t.kind === "scout" && (scouts >= SORTIE_SCOUTS || !underGeneral)) continue;
            if (heldFor(hold, u, t.loc)) continue;
            const enemy = safe(() => Units.get(t.id), null);
            if (safe(() => GameInfo.Units.lookup(enemy?.type)?.Domain, null) !== "DOMAIN_LAND") continue;
            const crowd = targets.filter((o) => o !== t && o.kind === "soldier" && dist(o.loc, t.loc) === 1).length;
            if (crowd > SORTIE_CROWD || startsWar(u, t.loc)) continue;
            const turns = pathTurns(u, t.loc);
            if (turns === null || turns > 1) continue;
            if (!safe(() => Game.UnitOperations.canStart(u.id, MOVE, { X: t.loc.x, Y: t.loc.y, Modifiers: M.ATTACK }, false), null)?.Success) continue;
            const trade = await strikeTrade(u, t.loc, enemy);
            if (!tradePays(u, t.loc, trade, { siege: besieging(t.loc) })) continue;
            const score = (trade.dealt >= trade.theirHealth ? 1000 : 0) + trade.dealt - trade.taken - d - (t.kind === "scout" ? 2000 : 0);
            if (!best || score > best.score) best = { t, enemy, score };
        }
        if (!best) continue;
        if (best.t.kind === "scout") scouts++;
        wakeUnit(u);
        Game.UnitOperations.sendRequest(u.id, MOVE, { X: best.t.loc.x, Y: best.t.loc.y, Modifiers: M.ATTACK + (M.MOVE_IGNORE_UNEXPLORED_DESTINATION ?? 0) });
        ordered.add(unitKey(u.id));
        restedByUs.delete(unitKey(u.id));
        struck.add(`${best.t.loc.x},${best.t.loc.y}`);
        const theirs = safe(() => GameInfo.Units.lookup(best.enemy?.type), null);
        out.push({ key: "SORTIE", args: [nameOf(def), theirs ? nameOf(theirs) : "?", best.t.loc.x, best.t.loc.y] });
        await untilEvent("Combat", COMBAT_WAIT_MS);
    }
    return out;
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

// ---- nuclear weapons (research/42 D, «Ядерное оружие») -------------------------------------------------------------

const WMD_DEVICE = "WMD_NUCLEAR_DEVICE";
const WMD_PROJECT = "PROJECT_PRODUCE_WMD";
export const MANHATTAN = "WONDER_MANHATTAN_PROJECT";
const WMD_MEMORY = "wmd"; // the settings' game memory: "<made>|<used>" (no screen of the game reads the stock)

/** The weapons we hold: the Manhattan Project's and each one produced, less the strikes made (our own count). */
export function nuclearArsenal() {
    const [made, used] = String(safe(() => settings.recall(gameKey(), WMD_MEMORY), null) ?? "0|0").split("|").map(Number);
    return Math.max(0, (made || 0) - (used || 0));
}

function noteWeapons(made, used) {
    const [m, u] = String(safe(() => settings.recall(gameKey(), WMD_MEMORY), null) ?? "0|0").split("|").map(Number);
    safe(() => settings.remember(gameKey(), { [WMD_MEMORY]: `${(m || 0) + made}|${(u || 0) + used}` }), null);
}

// Our cities finishing the Manhattan Project or a weapon (CityProductionCompleted: its productionItem is the type's hash).
try {
    engine.on("CityProductionCompleted", (d) => {
        const city = safe(() => Cities.get(d?.cityID), null);
        if ((city?.owner ?? d?.cityID?.owner) !== pid()) return;
        const item = d?.productionItem;
        const project = safe(() => GameInfo.Projects.lookup(WMD_PROJECT)?.$hash, null);
        const wonder = safe(() => GameInfo.Constructibles.lookup(MANHATTAN)?.$hash, null);
        if (item === undefined || item === null || (item !== project && item !== wonder)) return;
        noteWeapons(1, 0);
        log.info(`nuclear: ${item === wonder ? MANHATTAN : WMD_PROJECT} done in ${safe(() => Locale.compose(city.name), "?")}: ${nuclearArsenal()} weapon(s) held`);
    });
} catch (_e) {
    // No engine events here.
}

let nukedTurn = -1;     // one strike a turn at most
let nukeNoted = -1;     // the turn UI.log said why no strike was made

/**
 * A nuclear strike on an enemy army attacking us (research/42 D3; «Ядерное оружие»): an air commander of ours with a
 * Bomber based there (Aerodrome, Squadron, Carrier) that the game lets strike (canStart UNITOPERATION_WMD_STRIKE with
 * {Type: WMD_NUCLEAR_DEVICE}: its Plots, as the game's strike mode asks), on the tile whose blast (the weapon's BlastRadius
 * and the commander's wMDBlastRadius, as that mode draws it) holds the most land units of players at war with us, at least
 * NUKE.MIN_UNITS, within NUKE.NEAR of our settlements; never a blast that touches a unit or a tile of ours, of a player not
 * at war with us, or a settlement's centre (armies only), and never one the game says starts a new war
 * (willActionStartWarInArea). One a turn. @returns log entries
 */
export async function nuclearStrike({ cities = false } = {}) {
    const out = [];
    if (nukedTurn === Game.turn) return out;
    const me = pid();
    const player = safe(() => Players.get(me), null);
    const ours = safe(() => player.Units.getUnits(), []) ?? [];
    const commanders = ours.filter((u) => u.isCommanderUnit && isAirCommander(safe(() => GameInfo.Units.lookup(u.type), null)));
    if (commanders.length === 0) return out;
    const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
    const home = (safe(() => player.Cities.getCities(), []) ?? []).map((c) => c.location);
    const centres = new Map(); // "x,y" -> { owner, wasOurs }
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        for (const c of safe(() => p.Cities.getCities(), []) ?? []) centres.set(`${c.location.x},${c.location.y}`, { owner: p.id, wasOurs: safe(() => c.originalOwner, -1) === me && p.id !== me, name: safe(() => Locale.compose(c.name), "") });
    }
    const atWar = (owner) => owner === me ? false : !!safe(() => player.Diplomacy.isAtWarWith(owner), false);
    const facts = (loc) => {
        const owner = safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
        const c = centres.get(`${loc.x},${loc.y}`);
        const f = {
            ours: owner === me, third: owner !== -1 && owner !== null && owner !== me && !atWar(owner), centre: !!c, enemies: 0,
            // «Ядерные удары по городам»: an enemy city may be the target, never one that was ours (game 54's review).
            enemyCentre: !!c && c.owner !== me && atWar(c.owner) && !!safe(() => Players.get(c.owner)?.isMajor, false), wasOurs: !!c?.wasOurs,
        };
        for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
            const u = safe(() => Units.get(id), null);
            if (!u) continue;
            if (u.owner === me) f.ours = true;
            // Enemies only where we see them (game 60, SCM-2); anyone else's unit keeps the blast off, seen or not.
            else if (hostileOwner(u)) f.enemies += seenNow(u) && safe(() => GameInfo.Units.lookup(u.type)?.Domain, null) === "DOMAIN_LAND" ? 1 : 0;
            else f.third = true;
        }
        return f;
    };
    let best = null;
    let city = null;
    let offered = 0;
    for (const cmdr of commanders) {
        const args = { Type: Database.makeHash(WMD_DEVICE) };
        const r = safe(() => Game.UnitOperations.canStart(cmdr.id, "UNITOPERATION_WMD_STRIKE", args, false), null);
        const plots = r?.Plots ?? [];
        offered += plots.length;
        if (plots.length === 0) continue;
        const stats = safe(() => GameInfo.Unit_Stats.lookup(GameInfo.Units.lookup(cmdr.type).UnitType), null);
        const wmd = safe(() => GameInfo.WMDs.lookup(stats?.WMDType ?? WMD_DEVICE), null);
        const radius = (Number(wmd?.BlastRadius) || 1) + (Number(safe(() => cmdr.Combat.combatModifiers.wMDBlastRadius, 0)) || 0);
        const cands = [];
        const cityCands = [];
        for (const idx of plots) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            const near = Math.min(Infinity, ...home.map((h) => dist(h, loc)));
            if (!(near <= NUKE.NEAR)) continue;
            const tiles = (safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? [])
                .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null)).filter(Boolean).map(facts);
            const verdict = blastVerdict(tiles);
            const onCity = cities && !verdict.ok ? cityBlastVerdict(tiles) : null;
            if (!verdict.ok && !onCity?.ok) continue;
            if (safe(() => player.Diplomacy.willActionStartWarInArea(cmdr.id, loc, radius), null)?.Success) continue;
            if (verdict.ok) cands.push({ cmdr, loc, radius, near, verdict });
            else cityCands.push({ cmdr, loc, radius, near, verdict: onCity });
        }
        const b = bestBlast(cands);
        if (b && (!best || b.verdict.enemies > best.verdict.enemies)) best = b;
        const c = bestCityBlast(cityCands);
        if (c && (!city || c.near < city.near)) city = c;
    }
    // An army attacking us first (the defensive default); an enemy city only with «Ядерные удары по городам».
    if (!best && city) {
        Game.UnitOperations.sendRequest(city.cmdr.id, "UNITOPERATION_WMD_STRIKE", { X: city.loc.x, Y: city.loc.y, Type: Database.makeHash(WMD_DEVICE) });
        nukedTurn = Game.turn;
        noteWeapons(0, 1);
        const def = safe(() => GameInfo.Units.lookup(city.cmdr.type), null);
        const name = centres.get(`${city.loc.x},${city.loc.y}`)?.name || `${city.loc.x},${city.loc.y}`;
        log.warn(`nuclear: ${def?.UnitType ?? "?"} struck the city at ${city.loc.x},${city.loc.y} (${name}; radius ${city.radius}): ${city.verdict.cities} enemy city(ies), ${city.verdict.enemies} enemy land unit(s), ${city.near} tile(s) from our nearest settlement; ${nuclearArsenal()} weapon(s) left`);
        out.push({ key: "NUKE_CITY_STRUCK", args: [nameOf(def), name] });
        await untilEvent("Combat", COMBAT_WAIT_MS);
        return out;
    }
    if (!best) {
        if (offered > 0 && nukeNoted !== Game.turn) {
            nukeNoted = Game.turn;
            log.info(`nuclear: no strike: ${offered} tile(s) offered, none with ${NUKE.MIN_UNITS}+ enemy land units within ${NUKE.NEAR} of our settlements clear of ours, a third party and every settlement`);
        }
        return out;
    }
    Game.UnitOperations.sendRequest(best.cmdr.id, "UNITOPERATION_WMD_STRIKE", { X: best.loc.x, Y: best.loc.y, Type: Database.makeHash(WMD_DEVICE) });
    nukedTurn = Game.turn;
    noteWeapons(0, 1);
    const def = safe(() => GameInfo.Units.lookup(best.cmdr.type), null);
    log.warn(`nuclear: ${def?.UnitType ?? "?"} struck ${best.loc.x},${best.loc.y} (radius ${best.radius}): ${best.verdict.enemies} enemy land unit(s), ${best.near} tile(s) from our nearest settlement; ${nuclearArsenal()} weapon(s) left`);
    out.push({ key: "NUKE_STRUCK", args: [nameOf(def), best.loc.x, best.loc.y, best.verdict.enemies] });
    await untilEvent("Combat", COMBAT_WAIT_MS);
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

/** Is this tile an urban district of a settlement (its centre or an urban quarter)? */
function urbanAt(loc) {
    const type = districtTypeAt(loc);
    return type === "DISTRICT_CITY_CENTER" || type === "DISTRICT_URBAN";
}

/** The district on a tile (Districts.getAtLocation: DISTRICT_CITY_CENTER, DISTRICT_URBAN, DISTRICT_RURAL, …), or null. */
function districtTypeAt(loc) {
    const d = safe(() => Districts.getAtLocation({ x: loc.x, y: loc.y }), null);
    return d ? safe(() => GameInfo.Districts.lookup(d.type)?.DistrictType, null) : null;
}

const ruralAt = (loc) => districtTypeAt(loc) === "DISTRICT_RURAL";

const MISSION_REFUSED_TURNS = 10; // a tile the game refused to spread on stays off this long...
const MISSION_CITY_REFUSALS = 2;  // ...and a settlement refused this many times within it
const missionRefused = new Map(); // "x,y" -> the turn the game refused a spread there
const missionCities = new Map();  // settlement key -> { n, turn }: refusals there lately

/**
 * A Missionary converts our own settlements (research/40 B1; data/xpl-missions.js): where it stands on a settlement of ours
 * to convert, on the half that still needs our religion (urban or rural; any tile when it follows none), it spreads our
 * religion (UNITOPERATION_SPREAD_RELIGION, untargeted, as the unit panel sends it); else it walks there by a safe way, the
 * most urgent settlement no other Missionary walks to (goal `{mission}`). Nothing while Ius Reformandi is slotted.
 */
function spreadReligion(u, def, ctx) {
    if (iusReformandiActive()) return null;
    const keyOf = (c) => `${c.location.x},${c.location.y}`;
    // Not a settlement the game refused us twice lately (game 43: a Missionary walked 73,20 ↔ 74,20 E55-E69, refused on both
    // tiles of Нехеб, its urban half back to Buddhism and its rural half ours).
    const targets = conversionTargets().filter((t) => (missionCities.get(keyOf(t.city))?.n ?? 0) < MISSION_CITY_REFUSALS);
    if (targets.length === 0) return null;
    const tileKey = (l) => `${l.x},${l.y}`;
    const refused = (l) => Game.turn - (missionRefused.get(tileKey(l)) ?? -Infinity) < MISSION_REFUSED_TURNS;
    // A settlement of no religion from any of its districts, urban or rural (game 60: 9 of 29 spreads refused, «must stand in
    // the appropriate district», every one on a tile of no district in a settlement of no religion), else from the half that
    // still needs ours: an urban district, or a rural one. Never unit.getActivationPlots here: it takes a unit command, and
    // asked for this operation it crashed the game (a native null read, 20 October: our first Missionary's first order;
    // gotcha 74).
    const fits = (t, loc) => !refused(loc) && (t.none ? urbanAt(loc) || ruralAt(loc) : t.urban ? urbanAt(loc) : ruralAt(loc));
    const hereId = safe(() => GameplayMap.getOwningCityFromXY(u.location.x, u.location.y), null);
    const here = hereId ? safe(() => Cities.get(hereId), null) : null;
    const t0 = here ? targets.find((t) => keyOf(t.city) === keyOf(here)) : null;
    if (t0 && fits(t0, u.location)) {
        if (operate(u, SPREAD, NO_TARGET)) {
            goals.delete(unitKey(u.id));
            return { key: "MISSION_SPREAD", args: [nameOf(def), safe(() => Locale.compose(t0.city.name), "?")] };
        }
        // Refused: this tile is off, and a settlement refused twice is left for MISSION_REFUSED_TURNS.
        missionRefused.set(tileKey(u.location), Game.turn);
        const c = missionCities.get(keyOf(t0.city));
        missionCities.set(keyOf(t0.city), { n: c && Game.turn - c.turn < MISSION_REFUSED_TURNS ? c.n + 1 : 1, turn: Game.turn });
        const r = safe(() => Game.UnitOperations.canStart(u.id, SPREAD, NO_TARGET, false), null);
        log.info(`mission: ${def.UnitType} at ${u.location.x},${u.location.y} in ${safe(() => Locale.compose(t0.city.name), "?")} refused: ${JSON.stringify(r?.FailureReasons ?? [])}; urban ${t0.urban}, rural ${t0.rural}, none ${t0.none}; district ${districtTypeAt(u.location) ?? "none"} (probe)`);
    }
    // Where to go: its own goal while that settlement still needs it, else the first no other Missionary walks to.
    const own = goals.get(unitKey(u.id))?.mission;
    const walking = new Set(errands().filter(([k, g]) => k !== unitKey(u.id) && g.mission).map(([, g]) => g.mission));
    const ordered = [...targets.filter((t) => keyOf(t.city) === own), ...targets.filter((t) => keyOf(t.city) !== own && !walking.has(keyOf(t.city)))];
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, l.x, l.y), Infinity);
    for (const t of ordered.slice(0, 4)) {
        // The nearest urban tile first for a settlement of no religion (it converts both halves at once from there).
        const plots = (safe(() => t.city.getPurchasedPlots(), []) ?? [])
            .map((i) => safe(() => GameplayMap.getLocationFromIndex(i), null))
            .filter((l) => l && !safe(() => GameplayMap.isWater(l.x, l.y), false) && fits(t, l))
            .sort((a, b) => Number(t.none && urbanAt(b)) - Number(t.none && urbanAt(a)) || dist(a) - dist(b));
        for (const p of plots.slice(0, 6)) {
            if (same(u.location, p)) continue;
            const way = pathTo(u, p);
            if (!way || !wayIsSafe(u, way, 1, ctx) || !moveTo(u, p)) continue;
            goals.set(unitKey(u.id), { mission: keyOf(t.city) });
            return { key: "MISSION_MOVE", args: [nameOf(def), safe(() => Locale.compose(t.city.name), "?")] };
        }
    }
    return null;
}

const FOUND = "UNITOPERATION_FOUND_CITY";
const CONVERT_INDEPENDENTS = "UNITOPERATION_CONVERT_BARBARIANS";
const LEGATUS_MAX_TURNS = 6; // a Legatus walks at most this far to found a town

/**
 * A commander's own powers (research/40 C, civ notes G9), before its post:
 *  - Rome's Legatus (UNIT_CLASS_ALTERNATE_SETTLE) gets a land-claim charge every 3 promotions. With one (the unit panel's own
 *    test: canStart(FOUND_CITY, …, true), the action applies) and «Поселенцы», in peace (no threatened settlement), it founds
 *    a town where it stands on a known site, else walks there by a safe way, the nearest site no settler goes to, within
 *    LEGATUS_MAX_TURNS. Game 41's Legatus stood at its post all game.
 *  - A commander that may convert independents' units (Genghis: UNITOPERATION_CONVERT_BARBARIANS) does so where the game
 *    offers it, with «Оборона».
 * UI.log says what the game answered the first time (probe P-LEG-2). @returns a log entry or null
 */
function commanderSpecial(u, def, ctx, options) {
    const convert = options.defend ? safe(() => Game.UnitOperations.canStart(u.id, CONVERT_INDEPENDENTS, {}, false), null) : null;
    if (convert?.Success) {
        const plot = (convert.Plots ?? [])[0];
        const loc = plot !== undefined ? safe(() => GameplayMap.getLocationFromIndex(plot), null) : null;
        if (operate(u, CONVERT_INDEPENDENTS, loc ? { X: loc.x, Y: loc.y } : NO_TARGET)) return { key: "INDEPENDENTS_CONVERTED", args: [nameOf(def)] };
    }
    if (!options.settlers || !hasTag(def, "UNIT_CLASS_ALTERNATE_SETTLE") || (ctx.threats ?? []).length > 0) return null;
    const charge = safe(() => Game.UnitOperations.canStart(u.id, FOUND, NO_TARGET, true), null);
    if (!legatusProbed.has(unitKey(u.id))) {
        legatusProbed.add(unitKey(u.id));
        log.info(`legatus: ${def.UnitType} at ${u.location?.x},${u.location?.y}: a town ${JSON.stringify({ applies: charge?.Success, here: safe(() => Game.UnitOperations.canStart(u.id, FOUND, NO_TARGET, false), null)?.Success })} (probe P-LEG-2)`);
    }
    if (!charge?.Success) return null;
    const picks = (state.get().results.sites?.picks ?? []).map((p) => ({ x: p.x, y: p.y }));
    const sameSite = (a, b) => a.x === b.x && a.y === b.y;
    if (picks.some((p) => sameSite(p, u.location)) && operate(u, FOUND, NO_TARGET)) {
        goals.delete(unitKey(u.id));
        return { key: "LEGATUS_FOUNDED", args: [nameOf(def), u.location.x, u.location.y] };
    }
    const taken = new Set(errands().filter(([k, g]) => k !== unitKey(u.id) && g.x !== undefined).map(([, g]) => `${g.x},${g.y}`));
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, l.x, l.y), Infinity);
    for (const p of picks.filter((x) => !taken.has(`${x.x},${x.y}`)).sort((a, b) => dist(a) - dist(b)).slice(0, 4)) {
        const way = pathTo(u, p);
        if (!way || way.turns > LEGATUS_MAX_TURNS || !wayIsSafe(u, way, 1, ctx) || !moveTo(u, p)) continue;
        goals.set(unitKey(u.id), { x: p.x, y: p.y, legatus: true });
        return { key: "LEGATUS_MOVE", args: [nameOf(def), p.x, p.y] };
    }
    return null;
}

const legatusProbed = new Set();

const ACTIVATE_GP = "UNITCOMMAND_ACTIVATE_GREAT_PERSON";
const GP_MAX_TURNS = 10;       // a great person walks at most this far to a tile where it works
const gpProbed = new Set();    // unit types whose activation answer UI.log has shown (probe P-GP-1)

/**
 * Our civilization's great people (research/40 B4: Tjaty, Logios, Shi Dafu, 'Alim, Conquistador, Jacobin…; free techs, +200
 * production on a wonder, yields on the Palace): activated where they stand when the game allows it
 * (UNITCOMMAND_ACTIVATE_GREAT_PERSON, untargeted, as the unit panel sends it), else they walk by a safe way to the nearest
 * tile the game lists for them (unit.getActivationPlots, as the panel shows them) within GP_MAX_TURNS. None listed: they
 * wait (a wonder great person waits for a wonder in production). Before, only the Great Banker was ever activated.
 */
function useGreatPerson(u, def, ctx) {
    const here = safe(() => Game.UnitCommands.canStart(u.id, ACTIVATE_GP, NO_TARGET, false), null);
    // As the unit panel asks (unit-actions.js): a command's activation tiles only where it shows them (an operation's ask
    // crashed the game: spreadReligion).
    const shown = !!safe(() => u.shouldShowActivationPlots(ACTIVATE_GP), false);
    const plots = (shown ? safe(() => u.getActivationPlots(ACTIVATE_GP, false), []) ?? [] : [])
        .map((p) => (typeof p === "number" ? safe(() => GameplayMap.getLocationFromIndex(p), null) : p))
        .filter((l) => l && Number.isFinite(l.x));
    if (!gpProbed.has(def.UnitType)) {
        gpProbed.add(def.UnitType);
        log.info(`great person: ${def.UnitType} at ${u.location?.x},${u.location?.y}: here ${JSON.stringify({ Success: here?.Success, FailureReasons: here?.FailureReasons })}, ${plots.length} tile(s) listed (probe P-GP-1)`);
    }
    if (here?.Success) {
        Game.UnitCommands.sendRequest(u.id, ACTIVATE_GP, { ...NO_TARGET });
        goals.delete(unitKey(u.id));
        return { key: "GREAT_PERSON_USED", args: [nameOf(def)] };
    }
    const dist = (l) => safe(() => GameplayMap.getPlotDistance(u.location.x, u.location.y, l.x, l.y), Infinity);
    for (const p of plots.filter((l) => !same(l, u.location)).sort((a, b) => dist(a) - dist(b)).slice(0, 6)) {
        const way = pathTo(u, p);
        if (!way || way.turns > GP_MAX_TURNS || !wayIsSafe(u, way, 1, ctx) || !moveTo(u, p)) continue;
        goals.set(unitKey(u.id), { gp: `${p.x},${p.y}` });
        return { key: "GREAT_PERSON_MOVE", args: [nameOf(def)] };
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

/** The best trade route we could open now (the first within its partner's capacity, as the merchants take them): { value, imports } or null. */
export function bestOpenRoute(settings) {
    for (const r of tradeRoutes(settings)) if (capacityLeft(r.city.owner, new Map()) > 0) return { value: r.value, imports: r.imports };
    return null;
}

/** Routes to this owner we may still open (trade capacity), counting the ones sent this turn. */
function capacityLeft(owner, sentTo) {
    const trade = safe(() => Players.get(pid()).Trade, null);
    const cap = Number(safe(() => trade.getTradeCapacityFromPlayer(owner), NaN));
    const used = Number(safe(() => trade.countPlayerTradeRoutesTo(owner), 0)) || 0;
    const pending = sentTo.get(owner) ?? 0;
    return Number.isFinite(cap) ? cap - used - pending : 1 - pending;
}

const ROAD = "UNITCOMMAND_CONNECT_WITH_ROAD";
const ROAD_TOWN_POPULATION = 7; // a town this big takes a Focus, which needs a connected city (root gotcha 12)

/**
 * A town big enough for a Focus with no city connected to it (root gotcha 12: its Focus would feed nobody, so it keeps
 * growing) gets a road from the merchant standing in one of our cities, when the game offers that town's tile («Build
 * Road to Settlement», UNITCOMMAND_CONNECT_WITH_ROAD: canStart {} → Plots, then {X, Y}, as its interface mode sends it;
 * it uses the merchant up). Research/40 C. @returns a log entry or null
 */
function roadToTown(u, def) {
    const towns = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).filter((c) => c.isTown && (Number(c.population) || 0) >= ROAD_TOWN_POPULATION
        && !(safe(() => c.getConnectedCities(), []) ?? []).some((id) => safe(() => Cities.get(id)?.isTown === false, false)));
    if (towns.length === 0) return null;
    const plots = new Set(safe(() => Game.UnitCommands.canStart(u.id, ROAD, {}, false), null)?.Plots ?? []);
    if (plots.size === 0) return null;
    for (const t of towns) {
        const at = safe(() => GameplayMap.getIndexFromXY(t.location.x, t.location.y), -1);
        if (!plots.has(at)) continue;
        Game.UnitCommands.sendRequest(u.id, ROAD, { X: t.location.x, Y: t.location.y });
        goals.delete(unitKey(u.id));
        return { key: "ROAD_BUILT", args: [nameOf(def), safe(() => Locale.compose(t.name), "?")] };
    }
    return null;
}

function trade(u, def, ctx) {
    if (!truthy(def.MakeTradeRoute)) return null;
    // A town that cannot take its Focus for want of a road first (research/40 C).
    const road = safe(() => roadToTown(u, def), null);
    if (road) return road;
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

// One unit pass reads the map as it stands (the game carries out our orders only after it): each of the game's ways and each
// tile's hazards is asked once in it (the review of game 60's package: moveTo's look at a walk's stops doubled the path calls,
// and a way out of the plague read each tile's plot effects about 20 times). { paths: key -> pathTo, hazards: plot -> hazardInfo,
// sent: "x,y" -> the unit moveTo sent there }
let passMemo = null;

/**
 * Orders for every unit waiting for them, by what the options allow.
 * @param options { explore, settlers, defend, merchants, roam, random, approach: [independent ids],
 *                  victory: the victory focus is on (victory units act), distant: settlers to the Distant Lands first,
 *                  leave: Set of unit keys left alone this time (their order did not take),
 *                  threats: threatenedSettlements() (soldiers go to those lacking defenders) }
 * @returns { entries, ordered: Set of unit keys, orderedAt: Map unit key -> { x, y } }
 */
export function commandUnits(settings, options) {
    passMemo = { paths: new Map(), hazards: new Map(), sent: new Map() };
    try {
        return commandUnitsPass(settings, options);
    } finally {
        passMemo = null;
    }
}

function commandUnitsPass(settings, options) {
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
    // A sight tile reached with its village still unseen: blind (game 60, SC-1).
    if (options.explore || options.defend || options.roam) safe(() => noteBlindSight(units, {}), null);
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
        // A march that ended (research/42 B2): its soldiers are free again.
        else if (g?.march !== undefined && !marches.has(g.march)) goals.delete(k);
    }
    const taken = new Set(errandGoals().filter((g) => g.x !== undefined).map((g) => `${g.x},${g.y}`));
    let routes = null;
    const walking = errandGoals().filter((g) => g.city);
    const owners = new Map();
    for (const g of walking) owners.set(g.owner, (owners.get(g.owner) ?? 0) + 1);
    const garrison = new Set();
    const ctx = {
        routes: () => (routes ??= tradeRoutes(settings)), cities: new Set(walking.map((g) => g.city)), owners, unstacked: new Set(), stepTo: new Set(),
        leave: options.leave ?? new Set(), // units whose order did not take this turn: no operation orders them again
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
        approached: new Set(errandGoals().filter((g) => g.approach !== undefined).map((g) => g.approach)),
        // Villages a soldier walks to, to disperse them (one each).
        dispersing: new Set(errandGoals().filter((g) => g.disperse).map((g) => g.disperse)),
        // Discoveries other units walk to (their goals), so two scouts never go for the same one.
        discoveries: new Set(errandGoals().filter((g) => g.discovery).map((g) => g.discovery)),
        // Dig and research sites other explorers walk to; the sites themselves are scanned once, when needed.
        artifactTaken: new Set([
            ...errandGoals().filter((g) => g.artifact).map((g) => g.artifact),
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
        // Walks that would stop on the plague are cancelled and re-planned (game 60).
        entries.push(...(safe(() => checkWalks(units, ctx), []) ?? []));
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
    // The generals (research/41 Phase 2): each land commander's role, the raids remembered for the vanguard's peace post, and
    // a commander in danger escapes before any other unit takes the tiles it needs (the user: "a valuable asset").
    ctx.ourUnits = units;
    ctx.commanderRoles = safe(() => commanderRoles(units), null) ?? new Map();
    safe(() => noteRaids(ctx.threats), null);
    if (options.defend || options.roam) entries.push(...(safe(() => escapeCommanders(units, ctx), []) ?? []));
    // A running campaign's review first (research/37 Phase 7): one that ends gives its soldiers back to the defence below.
    if (options.defend) entries.push(...(safe(() => campaignReviewStep(units, ctx, options), []) ?? []));
    // A village hunt or a training war (research/41 §6-§7): its review too, before the defence plan.
    if (options.defend) entries.push(...(safe(() => fieldReviewStep(units, ctx, options), []) ?? []));
    // No settler escort this pass: their soldiers are free for the defence below (game 60, economy E5).
    if (!options.settlers || !(options.defend || options.roam)) releaseSettlerEscorts();
    // Who defends where (research/36 §4): with «Оборона» or «Армия».
    if (options.defend || options.roam) {
        try {
            // Armies (research/37 Phase 3): the inventory, and those at a threatened settlement or a front unpack first.
            ctx.armies = armyInventory(units);
            noteRapid(units, ctx);
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
        // Hurt soldiers there swap out for fresh ones (research/41 Phase 4).
        entries.push(...(safe(() => rotateFront(units, ctx), []) ?? []));
        // A commander whose walk stops in hostile reach takes a free soldier along (research/42 A3).
        entries.push(...(safe(() => escortCommanders(units, ctx), []) ?? []));
        // A settler kept from its site by independents' raiders walks there with one (game 60, economy E5).
        if (options.settlers) entries.push(...(safe(() => escortSettlers(units, ctx, taken), []) ?? []));
        // A general packs the soldiers walking far to one fight and marches with them (research/42 B2).
        if (options.defend) entries.push(...(safe(() => packMarches(units, ctx), []) ?? []));
    }
    // Campaigns (research/37 Phase 7, «Наступление»): with the soldiers defence leaves free; off, a running one ends.
    if (options.defend) {
        try {
            entries.push(...campaignStep(units, ctx, options));
        } catch (error) {
            log.debug("autopilot campaign failed", error);
        }
        try {
            entries.push(...fieldStep(units, ctx, options));
        } catch (error) {
            log.debug("autopilot field operation failed", error);
        }
        // A skirmish with a hostile village next to our land (after game 58): with village hunts or raider hunts on.
        if (options.hunt || options.huntRaiders) entries.push(...(safe(() => skirmishStep(units, ctx), []) ?? []));
        // The vanguard keeps a packed army ready while a war or raids call for it (after game 54), from the soldiers a hunt
        // or a campaign left.
        entries.push(...(safe(() => rallyVanguard(units, ctx), []) ?? []));
    }
    // Fighters rebase to cover what needs it (research/37 Phase 5); warships sail to the coasts ships attack (Phase 6).
    // Squadron Commanders set up bases and carriers sail where cover is wanted (game 54's review), before the fighters rebase.
    if (options.defend) entries.push(...(safe(() => establishSquadronBases(ctx, units), []) ?? []));
    if (options.defend) entries.push(...(safe(() => postCarriers(units, ctx), []) ?? []));
    if (options.defend) entries.push(...(safe(() => rebaseFighters(ctx, units), []) ?? []));
    if (options.defend) entries.push(...(safe(() => planNavalGuards(units, ctx), []) ?? []));
    // Fleet Commanders stand with the warships where ships attack us (their focused attacks: commanderAttacks).
    if (options.defend) entries.push(...(safe(() => postFleetCommanders(units, ctx), []) ?? []));
    // Units on the plague: the most hurt keep their clean tile, and a soldier of ours makes room where none is free (game 60).
    if (options.defend || options.roam || options.explore || options.settlers || options.merchants) {
        entries.push(...(safe(() => planPlagueRooms(units, ctx), []) ?? []));
    }
    // A raider hunt's target is left to its coming general in the loop too (W5: defend's shots; the hunt may start above).
    ctx.raiderHold = safe(() => raiderHold(units), null);
    const A = globalThis.UnitActivityTypes;
    const seen = [];
    // Each entry the loop makes is noted with its unit and the tile it stood on (entryUnit), when the next unit comes.
    let untagged = entries.length;
    let loopUnit = null;
    let loopAt = null;
    const tagEntries = () => {
        for (let i = untagged; i < entries.length; i++) noteEntryUnit(entries[i], loopUnit, loopAt);
        untagged = entries.length;
    };
    for (const u of byLevel(units)) {
        tagEntries();
        loopUnit = u;
        loopAt = u.location ? { x: u.location.x, y: u.location.y } : null;
        if (ordered.size >= MAX_UNIT_ORDERS) break;
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        // Settlers and scouts see hostile commanders as danger too (M2: hostileNear).
        ctx.civilian = !!def && (truthy(def.FoundCity) || hasTag(def, "UNIT_CLASS_AUTOEXPLORE"));
        const what = `${def?.UnitType ?? u.type}(act=${u.activityType},move=${u.canMove},moved=${u.hasMoved})`;
        // Ordered already in this pass, before the loop (an army's unpacking, a fighter's rebase, a warship's post) or by a
        // neighbour's room-making: its order stands (before, an unpacking commander could be sent to its post as well).
        if (ordered.has(unitKey(u.id))) {
            seen.push(`${what}:ordered`);
            continue;
        }
        // A campaign's member or commander, not hurt: the campaign's (its moves were sent; one standing where it should is
        // skipped by the skip step). A hurt one escapes or heals like any other.
        if (def && inCampaign(unitKey(u.id)) && (Number(u.Health?.damage) || 0) < ESCAPE_DAMAGE) {
            seen.push(`${what}:campaign`);
            continue;
        }
        // A hunt's or a training war's member or commander, not hurt: the operation's.
        if (def && inField(unitKey(u.id)) && (Number(u.Health?.damage) || 0) < ESCAPE_DAMAGE) {
            seen.push(`${what}:field`);
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
                // Asleep by our hand (rough seas, nothing to explore): woken when the seas calm or after SCOUT.SLEEP_TURNS (after a
                // reload, when only the save remembers it, at once).
                const slept = scoutsAsleep.get(unitKey(u.id)) ?? (restedByUs.has(unitKey(u.id)) && A && u.activityType === A.SLEEP ? -Infinity : undefined);
                const asleep = slept !== undefined && roughSeas() && Game.turn - slept < SCOUT.SLEEP_TURNS && Game.turn >= slept;
                // Exploring by itself into hostile units: away from them first; hurt, or with danger within
                // SCOUT_WIDE, it explores by our rules (explore: heal, our frontier widely) instead of the game's.
                const danger = hostileNear(u.location, SCOUT_DANGER, ctx) || shipsReaching(u.location).length > 0;
                // Walking to a goal that still holds: it keeps its way; only a discovery it reaches this turn may take over
                // (game 60, SC-2).
                const kept = slept === undefined && !danger && own ? scoutGoalHolds(u, own, ctx) : null;
                // Asleep, it is woken in danger too and gets away first (explore): UNITOPERATION_SLEEP lasts "until woken"; only
                // ALERT wakes a unit when an enemy comes near (the game's text).
                if (slept !== undefined && (!asleep || danger)) {
                    scoutsAsleep.delete(unitKey(u.id));
                    restedByUs.delete(unitKey(u.id));
                    wakeUnit(u);
                    e = explore(u, def, ctx);
                } else if (kept) {
                    e = toDiscovery(u, def, ctx, DISCOVERY_RADIUS, SCOUT.PREEMPT_TURNS);
                    if (!e) scoutLine(`${unitKey(u.id)}|keeps`, `${def.UnitType} at ${u.location.x},${u.location.y} keeps its way to ${own.village ? `the village at ${own.village} (sight tile ${own.at})` : own.discovery ? `the discovery at ${own.discovery}` : `the frontier at ${own.frontier}`}`);
                } else if (!asleep) {
                    if (own && !danger) goals.delete(unitKey(u.id));
                    e = (danger ? scoutFlees(u, def, ctx) : null)
                        ?? (autoExploreIsSafe(u, ctx) ? null : explore(u, def, ctx))
                        ?? scoutVillage(u, def, ctx)
                        ?? toDiscovery(u, def, ctx, DISCOVERY_RADIUS, DISCOVERY_MAX_TURNS);
                }
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
                const own = errandOf(goals.get(unitKey(u.id)));
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
        // On a plague (or fallout, fire) tile: out of it, resting or not (game 18: the plague killed our fortified garrisons;
        // game 60: by a way of several turns too). Not a unit on its way (its move goes on), unless its walk was just cancelled
        // for the plague (checkWalks).
        if (def && u.isOnMap !== false && u.canMove !== false && (!A || u.activityType !== A.OPERATION || ctx.walkCancelled?.has(unitKey(u.id)))
            && (options.defend || options.roam || options.explore || options.settlers || options.merchants)) {
            const e = safe(() => leaveHazard(u, def, ctx), null);
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
        }
        // A commander the game stopped on its way (moves left) gets its post again; a unit whose walk the plague cancelled this
        // pass (checkWalks) gets new orders now (the review of game 60's package: it stood idle, and the skip step skipped it).
        if (!isIdle(u) && !ctx.walkCancelled?.has(unitKey(u.id)) && !(u.isCommanderUnit && readyForOrders(u))) {
            seen.push(`${what}:busy`);
            continue;
        }
        // A commander's own powers first (research/40 C): Rome's Legatus founds a town with its land-claim charge, Genghis's
        // commander converts independents' units next to it.
        if (def && u.isCommanderUnit && isLandCommander(def) && readyForOrders(u)) {
            const e = safe(() => commanderSpecial(u, def, ctx, options), null);
            if (e) {
                seen.push(`${what}:${e.key}`);
                entries.push(e);
                ordered.add(unitKey(u.id));
                continue;
            }
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
                const own = errandOf(goals.get(unitKey(u.id)));
                if (own?.x !== undefined) taken.delete(`${own.x},${own.y}`);
                e = asSettler(ctx, () => settle(u, def, taken, ctx));
            } else if (options.settlers && hasTag(def, "UNIT_CLASS_POPULATION")) e = resettle(u, def, ctx);
            // Treasure convoys go home and unload whatever options are on (else they wait forever).
            else if (def.UnitType === "UNIT_TREASURE_FLEET") e = deliverTreasure(u, def, ctx);
            // Missionaries convert our own settlements whatever options are on (research/40 B1; else they idle for ever).
            else if (isMissionary(def)) e = spreadReligion(u, def, ctx);
            // Our civilization's great people are activated where they work (research/40 B4), whatever options are on.
            else if (hasTag(def, "UNIT_CLASS_GREATPERSON") && !truthy(def.VictoryUnit)) e = useGreatPerson(u, def, ctx);
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
    tagEntries();
    ctx.civilian = false;
    if (options.defend || options.roam) {
        safe(() => logDefence(ctx, units), null);
        safe(() => logFormations(ctx), null);
    }
    if (options.defend) safe(() => logAirWing(ctx), null);
    safe(() => logPlague(units, ctx, ordered), null);
    if (options.defend || options.roam) safe(() => logGenerals(units, ctx), null);
    safe(() => saveRested(), null);
    // The game cuts log lines at about 1000 characters: busy units are only counted.
    const busy = seen.filter((t) => t.endsWith(":busy")).length;
    log.info(`autopilot units: ${busy} busy; ${seen.filter((t) => !t.endsWith(":busy")).join("; ") || "no other"}`);
    for (const u of units) if (ordered.has(unitKey(u.id))) orderedAt.set(unitKey(u.id), { x: u.location?.x, y: u.location?.y });
    // For the tab: the generals and the field operation under way (game 60's review, UI-8).
    const generals = options.defend || options.roam ? safe(() => generalsSummary(units, ctx), []) : null;
    return { entries, ordered, orderedAt, generals, fieldOp: fieldOp ? { kind: fieldOp.kind, stage: fieldOp.stage } : null };
}
