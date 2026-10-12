/**
 * Same-turn cache of the game's per-city answers the building planner asks for:
 * which tiles each building may use (CityOperations/CityCommands canStart) and the exact
 * yields of every placement (calculateAllBuildingsPlacements). Recalculating twice in a
 * turn (after unticking a building, changing a priority...) then skips those queries.
 *
 * An entry is reused only if nothing it depends on can have changed: same turn, same
 * build queue and owned tiles, and no game event since that touches buildings, tiles,
 * unlocks, population or specialists. Any such event drops every entry (they are rare).
 */
import { log } from '../services/xpl-log.js';

const EVENTS = [
    "ConstructibleAddedToMap", "ConstructibleRemovedFromMap", "DistrictAddedToMap", "PlotOwnershipChanged",
    "CityProductionQueueChanged", "CityProductionCompleted", "CityMadePurchase", "CityPopulationChanged",
    "CityInitialized", "CityRemovedFromMap", "CityTransfered", "WorkerAdded", "WorkerRemoved",
    "TechNodeCompleted", "CultureNodeCompleted", "PlayerUnlockChanged", "TraditionChanged",
];

let epoch = 0;
const entries = new Map(); // settlement key -> entry
const stats = { hits: 0, misses: 0 };

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

for (const name of EVENTS) {
    try {
        engine.on(name, () => {
            epoch++;
        });
    } catch (error) {
        log.debug(`engine cache: cannot watch ${name}`, error);
    }
}

/** Cheap fingerprint of a city's own state: owned tiles and build queue. */
function stampOf(city) {
    const plots = safe(() => city.getPurchasedPlots(), []) ?? [];
    const queue = (safe(() => city.BuildQueue.getQueue(), []) ?? []).map((q) => `${q.constructibleType ?? q.type}@${q.location?.x ?? ""},${q.location?.y ?? ""}`);
    return `${plots.length}:${[...plots].sort((a, b) => a - b).join(",")}|${queue.join(";")}`;
}

/**
 * The cache entry for one settlement, emptied if anything it depends on changed.
 * @returns { validity: Map<type, { exists, buildable, plots: Set|null }>, placements: Map|null }
 */
export function cityEntry(key, city, isTown) {
    const turn = safe(() => Game.turn, 0);
    const stamp = stampOf(city);
    let e = entries.get(key);
    if (!e || e.turn !== turn || e.epoch !== epoch || e.stamp !== stamp || e.isTown !== isTown) {
        e = { turn, epoch, stamp, isTown, validity: new Map(), placements: null };
        entries.set(key, e);
    }
    return e;
}

export function noteCache(hit) {
    if (hit) stats.hits++;
    else stats.misses++;
}

export function engineCacheStats() {
    return { ...stats, epoch };
}

/** Forget everything (tests, or after loading a game). */
export function clearEngineCache() {
    entries.clear();
    epoch++;
}
