/**
 * What a repair waits for (core/xpl-repairs.js): hostile land units of any class near a pillaged tile, and the tiles we
 * repaired lately. Engine adapter: every engine call wrapped in safe().
 *
 * Game 60: an independent's UNIT_ARMY_COMMANDER (CoreClass CORE_CLASS_SUPPORT in units.xml) pillaged our Woodcutters every
 * second turn; the threat scan reads only CORE_CLASS_MILITARY units (units.js hostileOwner), so nothing saw it.
 */

import { unitsSeenAt } from './xpl-seen-units.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;

/**
 * Is this unit's owner at war with us? An independent's while its relationship with us is HOSTILE (as its unit flags show
 * it: Game.IndependentPowers), a major's while we are at war with it (as units.js hostileOwner reads it, any unit class).
 */
function ownerAtWar(unit) {
    if (!unit || unit.owner === pid()) return false;
    const owner = safe(() => Players.get(unit.owner), null);
    if (owner?.isIndependent) {
        const indep = safe(() => Game.IndependentPowers.getIndependentPlayerIDFromUnit(unit.id), unit.owner);
        const rel = safe(() => Game.IndependentPowers.getIndependentRelationship(indep, pid()), null);
        const R = globalThis.IndependentRelationship;
        if (R && rel === R.HOSTILE) return true;
        if (R && rel !== null && rel !== undefined) return false;
        return !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(indep), false);
    }
    return !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(unit.owner), false);
}

/**
 * The nearest land unit of any class (a commander too) within `radius` of this tile whose owner is at war with us
 * and that we see, or saw there within LAST_SEEN_TURNS (unitsSeenAt, as the threat scan reads them). @returns { type, owner, d } or null
 */
export function hostileLandNear(loc, radius) {
    let best = null;
    for (const idx of safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, radius), []) ?? []) {
        const at = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!at) continue;
        const d = Number(safe(() => GameplayMap.getPlotDistance(at.x, at.y, loc.x, loc.y), Infinity));
        if (!(d <= radius) || (best && best.d <= d)) continue;
        // Only units we see, or saw there lately (data/xpl-seen-units.js; PLAN.md §14): a pillager hidden in the fog is no
        // reason for the repair to wait (the integration review of game 60's packages: the threat and danger readers count
        // only those since SCM-2, and this one read MapUnits through the fog).
        for (const { unit } of safe(() => unitsSeenAt(at.x, at.y), []) ?? []) {
            if (!unit || unit.owner === pid()) continue;
            const def = safe(() => GameInfo.Units.lookup(unit.type), null);
            if (def?.Domain === "DOMAIN_SEA" || def?.Domain === "DOMAIN_AIR") continue;
            if (!ownerAtWar(unit)) continue;
            best = { type: def?.UnitType ?? "?", owner: unit.owner, d };
            break;
        }
    }
    return best;
}

const repaired = new Map(); // "x,y" -> the turn we bought its repair

/** Notes a repair bought on this tile this turn. */
export function noteRepaired(loc, turn) {
    if (loc) repaired.set(`${loc.x},${loc.y}`, Number(turn) || 0);
}

/** Turns since we repaired this tile (null: not remembered; a later turn of an earlier save is forgotten). */
export function repairedAgo(loc, turn) {
    const t = loc ? repaired.get(`${loc.x},${loc.y}`) : undefined;
    if (t === undefined) return null;
    const ago = (Number(turn) || 0) - t;
    if (ago < 0) {
        repaired.delete(`${loc.x},${loc.y}`);
        return null;
    }
    return ago;
}

/** Forgets the repairs (tests: a fresh game). */
export function resetRepairWatch() {
    repaired.clear();
}
