/**
 * The other players' units we see (game 60, SCM-2; PLAN.md §14: hidden information is opt-in). The game's plot tooltip shows a
 * unit only when its tile is VISIBLE to us and Visibility.isVisible(us, unit) (ui-next/tooltips/plot-tooltip/helpers.js
 * getUnitEntries), and our danger and threat readers count the same units. Before, they read MapUnits.getUnits through the fog:
 * a scout standing on 70,11 stepped away nine times from the guard of a village whose tile was still hidden, while the player
 * saw only an enemy scout or a merchant next to it.
 *
 * A hostile unit seen lately is remembered where it was last seen for LAST_SEEN_TURNS turns, so a raider stepping into a forest
 * is not forgotten at once; once it is seen again it counts where it stands.
 */

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
const keyOf = (id) => `${id?.owner}:${id?.id}`;

/** Turns a unit we saw is still counted where it was last seen (seen on turn T: counted to T + this). */
export const LAST_SEEN_TURNS = 2;

const lastSeen = new Map(); // unit key -> { id, x, y, turn }
const byTile = new Map();   // "x,y" -> Set of unit keys last seen there

/** Forget every sighting (tests, a new game). */
export function resetSeenUnits() {
    lastSeen.clear();
    byTile.clear();
}

/**
 * Do we see this unit now? Our own always; another player's when its tile is VISIBLE to us and the game says the unit is
 * visible to us (the plot tooltip's test). Without the game's answer (an older version) it counts as seen, as before.
 */
export function seenNow(unit) {
    if (!unit) return false;
    if (unit.owner === pid()) return true;
    const at = unit.location;
    if (!at || !(at.x >= 0) || !(at.y >= 0)) return false;
    const VISIBLE = globalThis.RevealedStates?.VISIBLE;
    if (VISIBLE !== undefined && safe(() => GameplayMap.getRevealedState(pid(), at.x, at.y), VISIBLE) !== VISIBLE) return false;
    const V = globalThis.Visibility;
    if (V?.isVisible && !safe(() => V.isVisible(pid(), unit.id), true)) return false;
    return true;
}

const MEMORY_MAX = 2000; // sightings kept before the old ones are dropped

function remember(unit, x, y) {
    if (lastSeen.size > MEMORY_MAX) for (const [k, e] of [...lastSeen]) if (Game.turn - e.turn > LAST_SEEN_TURNS) forget(k);
    const k = keyOf(unit.id);
    const before = lastSeen.get(k);
    if (before && (before.x !== x || before.y !== y)) byTile.get(`${before.x},${before.y}`)?.delete(k);
    lastSeen.set(k, { id: unit.id, x, y, turn: Game.turn });
    const t = `${x},${y}`;
    if (!byTile.has(t)) byTile.set(t, new Set());
    byTile.get(t).add(k);
}

function forget(k) {
    const e = lastSeen.get(k);
    if (e) byTile.get(`${e.x},${e.y}`)?.delete(k);
    lastSeen.delete(k);
}

/**
 * The units on a tile we may count: those we see there now (each one noted as seen), and, unless `remembered` is false,
 * other players' units last seen there within LAST_SEEN_TURNS that we do not see anywhere now.
 * @returns [{ unit, at: { x, y }, seen: true | false (remembered), turn (when it was seen) }]
 */
export function unitsSeenAt(x, y, { remembered = true } = {}) {
    const out = [];
    const here = new Set();
    for (const id of safe(() => MapUnits.getUnits(x, y), []) ?? []) {
        const unit = safe(() => Units.get(id), null);
        if (!unit || !seenNow(unit)) continue;
        if (unit.owner !== pid()) remember(unit, x, y);
        here.add(keyOf(unit.id));
        out.push({ unit, at: { x, y }, seen: true, turn: Game.turn });
    }
    if (!remembered) return out;
    for (const k of [...(byTile.get(`${x},${y}`) ?? [])]) {
        const e = lastSeen.get(k);
        if (!e || here.has(k)) continue;
        // Too old, or from a later turn (an earlier save was loaded): forgotten.
        if (Game.turn - e.turn > LAST_SEEN_TURNS || e.turn > Game.turn) {
            forget(k);
            continue;
        }
        const unit = safe(() => Units.get(e.id), null);
        if (!unit) {
            forget(k);
            continue;
        }
        // Seen elsewhere now: it counts where it stands.
        if (seenNow(unit)) continue;
        out.push({ unit, at: { x, y }, seen: false, turn: e.turn });
    }
    return out;
}
