/**
 * Our units, the hostile units near us and every fight of ours in UI.log (the user, after game 60: "log our and close enemy
 * units position for later war improvements"); the lines' format is core/xpl-unit-lines.js, read back by tools/unitmap.mjs.
 *
 *  - `units:` at a turn's start (the hud: the first pass, and the turn's activation while the autopilot is off): our soldiers
 *    and commanders by id, the visible units of players at war with us near our land, damaged centres, and how many hostile
 *    soldiers our plot scan finds that the game's own visibility test rejects (`unseen`: a count, never where: PLAN.md §14).
 *    Every turn while one of theirs is near or we fought the turn before, else every UNITS_LINE.QUIET_TURNS turns or when
 *    our army changes.
 *  - `places:` when our settlements or the villages we know change.
 *  - `fight:` for every Combat event involving us, with the generals whose radius held our unit (it replaces the `xp: combat`
 *    probe of research/41, which skipped every fight with no commander within 2 tiles and stopped at 12 a turn: game 60 had 40
 *    such lines for 110 fights of ours in T50-T100).
 * Engine adapter: every engine call is wrapped in safe().
 */
import { log, turnStamp } from '../services/xpl-log.js';
import { UNITS_LINE, activityLetter, cleanName, fitUnitsLine, formatFight, formatPlaces, unitsLineDue } from '../core/xpl-unit-lines.js';
import { THREAT_RADIUS, afloat, commanderRoles, generalXpAtFight, hazardAt, hostileOwner, isLandCommander, unitKey, unitTile, walledCentre, xpAfterFight } from './xpl-autopilot-units.js';
import { villagesOf } from './xpl-player-facts.js';
import { sameId, validId } from '../core/xpl-component-id.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), Infinity);
const defOf = (u) => safe(() => GameInfo.Units.lookup(u.type), null);
const onTile = (l) => !!l && l.x >= 0 && l.y >= 0;
/** The localId of the army a soldier of ours is on its way to as a reinforcement, or -1 (as the commander panel reads it). */
const reinforcingTo = (u) => Number(safe(() => Players.get(pid()).Armies.getUnitReinforcementCommanderId(u.id, pid()), -1) ?? -1);

let checked = "";            // the turn (its stamp) whose start was looked at
let lastLine = null;         // { turn, age, army } of the last `units:` line
let lastPlaces = "";         // the last `places:` line
let lastFight = null;        // { age, turn } of the last fight of ours
let fights = { stamp: "", n: 0, more: 0 }; // this turn's `fight:` lines

/** For tests: forget what was written. */
export function resetUnitLog() {
    checked = "";
    lastLine = null;
    lastPlaces = "";
    lastFight = null;
    fights = { stamp: "", n: 0, more: 0 };
}

/** A commander's level and XP as its promotion panel reads them (model-unit-promotion.js: properties). */
function experience(u) {
    const e = u?.Experience;
    if (!e) return {};
    const n = (f) => {
        const v = Number(safe(f, NaN));
        return Number.isFinite(v) ? v : null;
    };
    return { level: n(() => e.getLevel), xp: n(() => e.experiencePoints), next: n(() => e.experienceToNextLevel) };
}

/**
 * A unit of another player we may list: its owner's war with us (any class: scouts and commanders too). An independent at war
 * with us as its unit flags show it (data/xpl-autopilot-units.js hostileOwner).
 */
const hostile = (u) => !!hostileOwner(u, { anyClass: true });

/**
 * Seen by us, as the game's plot tooltip decides it (ui-next/tooltips/plot-tooltip/helpers.js getUnitEntries): its tile is
 * VISIBLE to us and Visibility.isVisible(us, the unit).
 */
function seenByUs(u) {
    const at = u?.location;
    if (!onTile(at)) return false;
    if (safe(() => GameplayMap.getRevealedState(pid(), at.x, at.y), null) != globalThis.RevealedStates?.VISIBLE) return false;
    if (typeof Visibility === "undefined") return true;
    return !!safe(() => Visibility.isVisible(pid(), u.id), false);
}

/** One of ours or theirs as a line's unit (theirs: no activity nor destination, which only their owner knows). */
function asEntry(u, extra = {}) {
    const at = unitTile(u);
    const off = u.isOnMap === false;
    const A = globalThis.UnitActivityTypes;
    const act = u.owner === pid() ? activityLetter(u.activityType, A) : null;
    const to = act === "O" ? safe(() => Units.getQueuedOperationDestination(u.id), null) : null;
    return {
        id: u.id?.id, type: defOf(u)?.UnitType ?? "?", x: off ? null : at?.x ?? null, y: off ? null : at?.y ?? null,
        d: Number(u.Health?.damage) || 0, act, to: onTile(to) ? { x: to.x, y: to.y } : null,
        hazard: !off && onTile(at) && hazardAt(at) > 0, afloat: !off && defOf(u)?.Domain === "DOMAIN_LAND" && afloat(u), ...extra,
    };
}

/** What the `units:` line lists now. */
function gather() {
    const me = safe(() => Players.get(pid()), null);
    const mine = safe(() => me.Units.getUnits(), []) ?? [];
    const cities = safe(() => me.Cities.getCities(), []) ?? [];
    const towns = cities.map((c) => c.location).filter(onTile);
    const roles = safe(() => commanderRoles(mine), null) ?? new Map();
    // Ours: military units and commanders; packed soldiers under their commander.
    const cmdrs = [];
    const soldiers = [];
    for (const u of mine) {
        const def = defOf(u);
        if (u.isCommanderUnit) {
            const role = isLandCommander(def) ? roles.get(unitKey(u.id)) ?? null : null;
            cmdrs.push({ u, entry: asEntry(u, { ...experience(u), role, packed: [] }) });
        } else if (def?.CoreClass === "CORE_CLASS_MILITARY") soldiers.push(u);
    }
    // Packed: off the map in a commander's army, both ids valid (two invalid ids are the same id). A soldier on its way to an
    // army as a reinforcement is off the map too, not packed yet (as armyInventory reads it): R, toward its commander's tile.
    const ours = [];
    for (const u of soldiers) {
        const to = u.isOnMap === false ? reinforcingTo(u) : -1;
        const c = u.isOnMap === false && to < 0 && validId(u.armyId) ? cmdrs.find((x) => validId(x.u.armyId) && sameId(x.u.armyId, u.armyId)) : null;
        if (c) c.entry.packed.push(asEntry(u));
        else if (to >= 0) {
            const at = cmdrs.find((x) => validId(x.u.armyId) && Number(safe(() => Armies.get(x.u.armyId)?.localId, NaN)) === to)?.u.location;
            ours.push({ u, entry: { ...asEntry(u), act: "R", to: onTile(at) ? { x: at.x, y: at.y } : null } });
        } else ours.push({ u, entry: asEntry(u) });
    }
    // Theirs: the visible units of players at war with us within RADIUS of our settlements or NEAR_OURS of our units.
    const ourTiles = [...ours, ...cmdrs].map((x) => x.entry).filter((e) => e.x !== null).map((e) => ({ x: e.x, y: e.y }));
    const theirs = [];
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p || p.id === pid()) continue;
        for (const u of safe(() => p.Units.getUnits(), []) ?? []) {
            const at = u?.location;
            if (!onTile(at) || u.isOnMap === false) continue;
            if (!towns.some((t) => dist(t, at) <= UNITS_LINE.RADIUS) && !ourTiles.some((t) => dist(t, at) <= UNITS_LINE.NEAR_OURS)) continue;
            if (!hostile(u) || !seenByUs(u)) continue;
            theirs.push(asEntry(u, { owner: u.owner }));
        }
    }
    // Unseen: hostile soldiers our threat scan (threatenedSettlements: every unit on each plot within THREAT_RADIUS) finds but
    // the game's visibility test rejects (U7 of game 60's review: does the scan count fogged units?).
    const counted = new Set();
    let unseen = 0;
    for (const t of towns) {
        for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(t.x, t.y, THREAT_RADIUS), []) ?? []) {
            const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
            if (!loc) continue;
            for (const id of safe(() => MapUnits.getUnits(loc.x, loc.y), []) ?? []) {
                const k = unitKey(id);
                if (counted.has(k)) continue;
                counted.add(k);
                const u = safe(() => Units.get(id), null);
                if (u && hostileOwner(u) && !seenByUs(u)) unseen++;
            }
        }
    }
    // Each unit of ours: how far the nearest listed unit of theirs is (a long line leaves out the farthest first).
    for (const o of ours) o.entry.near = o.entry.x === null ? Infinity : Math.min(Infinity, ...theirs.map((h) => dist(o.entry, h)));
    // Our damaged centres.
    const districts = safe(() => Players.Districts.get(pid()), null);
    const centres = [];
    for (const c of cities) {
        const l = c.location;
        if (!onTile(l)) continue;
        const health = Number(safe(() => districts.getDistrictHealth(l), NaN));
        const max = Number(safe(() => districts.getDistrictMaxHealth(l), NaN));
        if (Number.isFinite(health) && Number.isFinite(max) && max > 0 && health < max) centres.push({ x: l.x, y: l.y, health, max, walled: !!safe(() => walledCentre(l), false) });
    }
    const army = [...soldiers, ...cmdrs.map((c) => c.u)].map((u) => u.id?.id).sort((a, b) => a - b).join(",");
    return { ours: ours.map((o) => o.entry), cmdrs: cmdrs.map((c) => c.entry), theirs, unseen, centres, army, cities };
}

/** The `places:` line: our settlements and the villages we know, when they change. */
function notePlaces(cities) {
    const R = globalThis.IndependentRelationship;
    const rel = (v) => {
        const r = safe(() => Game.IndependentPowers.getIndependentRelationship(v.id, pid()), null);
        return !R || r === null ? "?" : r === R.HOSTILE ? "H" : r === R.FRIENDLY ? "F" : r === R.NEUTRAL ? "N" : "?";
    };
    const line = formatPlaces({
        settlements: cities.filter((c) => onTile(c.location)).map((c) => ({ x: c.location.x, y: c.location.y, town: !!c.isTown, name: cleanName(safe(() => Locale.compose(c.name), "?")) })),
        villages: (safe(() => villagesOf(pid()), []) ?? []).map((v) => ({ owner: v.id, x: v.x, y: v.y, rel: rel(v) })),
    });
    if (line === lastPlaces) return;
    lastPlaces = line;
    log.info(line);
}

/**
 * At a turn's start, once a turn: the `units:` line when it is due (core unitsLineDue), the `places:` line when it changed,
 * and the fights of the last turn the fight lines left out. @returns why the line was written, or null
 */
export function snapshotUnits() {
    const stamp = turnStamp() || `T${safe(() => Game.turn, -1)}`;
    if (checked === stamp) return null;
    checked = stamp;
    if (fights.more > 0 && fights.stamp !== stamp) {
        log.info(`fights: ${fights.more} more of ours on ${fights.stamp} not logged (${UNITS_LINE.FIGHTS_MAX} a turn)`);
        fights.more = 0;
    }
    const turn = Number(safe(() => Game.turn, -1));
    const age = safe(() => Game.age, null);
    const s = gather();
    safe(() => notePlaces(s.cities), null);
    const foughtLastTurn = !!lastFight && lastFight.age === age && turn - lastFight.turn <= 1 && turn - lastFight.turn >= 0;
    const last = lastLine && lastLine.age === age ? lastLine : lastLine ? { ...lastLine, turn: Infinity } : null;
    const why = unitsLineDue({ turn, last, army: s.army, hostiles: s.theirs.length, unseen: s.unseen, foughtLastTurn });
    if (!why) return null;
    lastLine = { turn, age, army: s.army };
    log.info(fitUnitsLine(s));
    return why;
}

// ---- fights ----------------------------------------------------------------------------------------------------------

/** A side of a fight: its unit, else its district (a settlement's defences). */
function side(id) {
    const u = safe(() => Units.get(id), null);
    if (u) return { u, def: defOf(u), at: unitTile(u) };
    const d = safe(() => Districts.get(id), null);
    return d ? { district: d, at: d.location ?? null } : null;
}

/**
 * What kind of fight: district (a settlement's defences on either side), air, naval, ranged (an attacker with a ranged or
 * bombard strength, as CombatLog.csv's CombatType reads Ranged for every Slinger's and Archer's attack) or melee.
 */
function fightKind(a, d) {
    if (a.district || d.district) return "district";
    if (a.def?.Domain === "DOMAIN_AIR") return "air";
    if (a.def?.Domain === "DOMAIN_SEA") return "naval";
    const st = safe(() => GameInfo.Unit_Stats.lookup(a.def?.UnitType), null);
    return Number(st?.RangedCombat) > 0 || Number(st?.Bombard) > 0 ? "ranged" : "melee";
}

/** A district's damage (its owner's district health bars). */
function districtDamage(owner, loc) {
    const ds = safe(() => Players.Districts.get(owner), null);
    const health = Number(safe(() => ds.getDistrictHealth(loc), NaN));
    const max = Number(safe(() => ds.getDistrictMaxHealth(loc), NaN));
    return Number.isFinite(health) && Number.isFinite(max) ? Math.max(0, max - health) : 0;
}

/**
 * Our land commanders whose radius holds this tile: the game's own (Units.getCommandRadiusPlots, as the unit's map decoration
 * draws it), else 1, +1 with Merit (as commanderAttacks reads it); each with its XP when last read (`was`: W6, units.js
 * generalXpAtFight).
 */
function generalsOver(at) {
    if (!onTile(at)) return [];
    const mine = safe(() => Players.get(pid()).Units.getUnits(), []) ?? [];
    const roles = safe(() => commanderRoles(mine), null) ?? new Map();
    const idx = safe(() => GameplayMap.getIndexFromXY(at.x, at.y), -2);
    const out = [];
    for (const c of mine) {
        if (!c.isCommanderUnit || c.isOnMap === false || !onTile(c.location) || !isLandCommander(defOf(c))) continue;
        const plots = safe(() => Units.getCommandRadiusPlots(c.id), null);
        const merit = safe(() => c.Experience?.hasPromotion("DISCIPLINE_ARMY_COMMENDATION_MERIT", "PROMOTION_COMMENDATION_ARMY_MERIT"), false);
        const holds = Array.isArray(plots) && plots.length > 0
            ? plots.some((p) => (typeof p === "number" ? p : safe(() => GameplayMap.getIndexFromLocation(p), -1)) === idx)
            : dist(c.location, at) <= 1 + (merit ? 1 : 0);
        if (holds) out.push({ id: c.id?.id, r: dist(c.location, at), ...experience(c), role: roles.get(unitKey(c.id)) ?? null, was: safe(() => generalXpAtFight(c).was, null) });
    }
    return out;
}

/** A Combat event (the game's payload: attacker and defender component ids): a `fight:` line when we are in it. */
export function noteFight(d) {
    const me = pid();
    const oursAttack = d?.attacker?.owner === me;
    if (!oursAttack && d?.defender?.owner !== me) return null;
    const a = side(d.attacker);
    const b = side(d.defender);
    if (!a || !b) return null;
    const stamp = turnStamp() || `T${safe(() => Game.turn, -1)}`;
    if (fights.stamp !== stamp) fights = { stamp, n: 0, more: 0 };
    lastFight = { age: safe(() => Game.age, null), turn: Number(safe(() => Game.turn, -1)) };
    if (fights.n >= UNITS_LINE.FIGHTS_MAX) {
        fights.more++;
        return null;
    }
    fights.n++;
    const entry = (s, c) => {
        const at = s.at;
        const base = { ours: c.owner === me, owner: c.owner, id: c.id, x: onTile(at) ? at.x : null, y: onTile(at) ? at.y : null };
        return s.district ? { ...base, type: "DISTRICT", d: onTile(at) ? districtDamage(c.owner, at) : 0 } : { ...base, type: s.def?.UnitType ?? "?", d: Number(s.u.Health?.damage) || 0 };
    };
    const ours = oursAttack ? a : b;
    const line = formatFight({ att: entry(a, d.attacker), def: entry(b, d.defender), kind: fightKind(a, b), gens: ours.u ? generalsOver(ours.at) : [] });
    log.info(line);
    // What the fight gave our generals within 2 tiles when the game awards it after the event (W6: `xp: after the fight`).
    if (ours.u) safe(() => xpAfterFight(ours.at), null);
    return line;
}

try {
    engine.on("Combat", (d) => {
        safe(() => noteFight(d), null);
    });
} catch (_e) {
    // No engine events here.
}
