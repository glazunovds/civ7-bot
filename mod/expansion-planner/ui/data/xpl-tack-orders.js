/**
 * Orders a building or wonder on the tile of one of the player's map tacks: finds a
 * tack of the right type on a tile the city may use now, and sends the same request
 * the game's placement mode sends after a tile click (ConstructibleType + X + Y).
 * Used by the production-menu buttons (hud/xpl-production-tacks.js).
 */
import { log } from '../services/xpl-log.js';
import { readAllTacks } from '../integrations/xpl-dmt-bridge.js';
import { DMT_GENERIC_TACKS } from '../core/xpl-rule-book.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

function plotSet(result) {
    return new Set([...(result?.Plots ?? []), ...(result?.ExpandUrbanPlots ?? [])]);
}

let adjacencyIdsByType = null;
function adjacencyIdsOf(type) {
    if (!adjacencyIdsByType) {
        adjacencyIdsByType = new Map();
        for (const row of GameInfo.Constructible_Adjacencies ?? []) {
            if (!adjacencyIdsByType.has(row.ConstructibleType)) adjacencyIdsByType.set(row.ConstructibleType, new Set());
            adjacencyIdsByType.get(row.ConstructibleType).add(row.YieldChangeId);
        }
    }
    return adjacencyIdsByType.get(type) ?? new Set();
}

function isUniqueQuarterBuilding(type) {
    for (const q of GameInfo.UniqueQuarters ?? []) if (q.BuildingType1 === type || q.BuildingType2 === type) return true;
    return false;
}

/** Does a DMT generic tack (e.g. "a science building") stand for this constructible? Same test DMT uses. */
export function genericMatches(genericType, def) {
    const g = DMT_GENERIC_TACKS[genericType];
    if (!g || !def) return false;
    if (genericType === "DMT_WONDER") return def.ConstructibleClass === "WONDER";
    if (def.ConstructibleClass !== "BUILDING") return false;
    if (genericType === "DMT_BUILDING") return true;
    if (genericType === "DMT_BUILDING_UNIQUE_QUARTER") return isUniqueQuarterBuilding(def.ConstructibleType);
    if (g.adjacencyIds.length === 0) return false;
    const ids = adjacencyIdsOf(def.ConstructibleType);
    return g.adjacencyIds.every((id) => ids.has(id));
}

/** Tacks a building could be ordered on: its own type first, then matching generic tacks. */
export function candidateTacks(def, tacks) {
    const out = (tacks.get(def.ConstructibleType) ?? []).map((t) => ({ ...t, generic: null }));
    for (const generic of Object.keys(DMT_GENERIC_TACKS)) {
        if (!tacks.has(generic) || !genericMatches(generic, def)) continue;
        for (const t of tacks.get(generic)) out.push({ ...t, generic });
    }
    return out;
}

/** Tacks by type: type -> [{ x, y }]. */
export function tacksByType() {
    const out = new Map();
    for (const { x, y, mapTackList } of readAllTacks()) {
        for (const t of mapTackList) {
            if (!out.has(t.type)) out.set(t.type, []);
            out.get(t.type).push({ x, y });
        }
    }
    return out;
}

/**
 * The first tack of this type on a tile the city can use now, and which actions work there.
 * @returns { x, y, idx, build: bool, buy: bool, cost } | null
 */
export function findTackSpot(city, def, tacks) {
    const args = { ConstructibleType: def.$hash };
    const build = city.isTown ? null : safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
    const buy = def.ConstructibleClass === "WONDER" ? null : safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
    if (build?.InQueue || build?.InProgress) return null; // already ordered somewhere
    const buildPlots = build?.Success ? plotSet(build) : new Set();
    const buyPlots = buy?.Success ? plotSet(buy) : new Set();
    for (const { x, y, generic } of tacks) {
        const idx = GameplayMap.getIndexFromXY(x, y);
        const canBuild = buildPlots.has(idx);
        const canBuy = buyPlots.has(idx);
        if (canBuild || canBuy) {
            const cost = canBuy ? Number(safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType), 0)) : 0;
            return { x, y, idx, build: canBuild, buy: canBuy, cost, generic: generic ?? null };
        }
    }
    return null;
}

const NEAR_CITY = 4; // a tack this close to the city centre is treated as meant for it

function sameCity(a, b) {
    if (!a || !b) return false;
    return a.owner == b.owner && a.id == b.id;
}

/**
 * No tack of this building can be used right now: why, for the tack nearest the city,
 * so the menu can say so instead of showing nothing.
 *  - NOT_OWNED: the tile is not this city's yet (the plan uses future tiles);
 *  - NOT_YET:   the city owns it but the game refuses it now, usually because it does
 *               not touch an urban tile yet (build the plan's nearer buildings first).
 * @returns { x, y, idx, reason, detail, generic } | null  (null: no tack near this city,
 *          the building is already queued, or the city cannot build it at all right now)
 */
export function explainTack(city, def, tacks) {
    const { x: cx, y: cy } = city.location;
    let best = null;
    for (const t of tacks) {
        const d = safe(() => GameplayMap.getPlotDistance(cx, cy, t.x, t.y), 99);
        if (d <= NEAR_CITY && (!best || d < best.d)) best = { ...t, d };
    }
    if (!best) return null;
    const args = { ConstructibleType: def.$hash };
    const build = city.isTown ? null : safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false), null);
    const buy = def.ConstructibleClass === "WONDER" ? null : safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
    if (build?.InQueue || build?.InProgress) return null;
    if (!build?.Success && !buy?.Success) return null; // not available at all: the row itself says why
    const idx = GameplayMap.getIndexFromXY(best.x, best.y);
    const out = { x: best.x, y: best.y, idx, generic: best.generic ?? null, detail: null };
    const owner = safe(() => GameplayMap.getOwningCityFromXY(best.x, best.y), null);
    // Tiles the game accepts right now (so the menu can say "you can still build it elsewhere today").
    out.validNow = plotSet(build?.Success ? build : buy).size;
    if (!sameCity(owner, city.id)) return { ...out, reason: "NOT_OWNED" };
    const at = { ...args, X: best.x, Y: best.y };
    const r = build?.Success
        ? safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, at, false), null)
        : safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, at, false), null);
    return { ...out, reason: "NOT_YET", detail: r?.FailureReasons?.[0] ?? null };
}

/** Sends the same request the placement mode sends after a tile click. */
export function orderAtTack(cityID, def, spot, purchase) {
    const args = { ConstructibleType: def.$hash, X: spot.x, Y: spot.y };
    if (purchase) {
        const r = Game.CityCommands.canStart(cityID, CityCommandTypes.PURCHASE, args, false);
        if (!r?.Success) return false;
        Game.CityCommands.sendRequest(cityID, CityCommandTypes.PURCHASE, args);
    } else {
        const r = Game.CityOperations.canStart(cityID, CityOperationTypes.BUILD, args, false);
        if (!r?.Success) return false;
        Game.CityOperations.sendRequest(cityID, CityOperationTypes.BUILD, args);
    }
    log.info(`${purchase ? "bought" : "queued"} ${def.ConstructibleType} at tack ${spot.x},${spot.y}`);
    return true;
}
