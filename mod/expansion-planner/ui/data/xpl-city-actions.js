/**
 * One-click actions the planner offers. Each one starts only from the player's click and
 * sends exactly what the game's own menus send:
 *  - a town's Focus: CityCommands CHANGE_GROWTH_MODE { Type: PROJECT, ProjectType, City }
 *    (production-chooser-helpers.js SetTownFocus);
 *  - queue planned buildings at their planned tiles: CityOperations BUILD
 *    { ConstructibleType, X, Y } (no InsertMode = added to the end of the queue);
 *  - buy a planned building there: CityCommands PURCHASE { ConstructibleType, X, Y }.
 * Plus the gold-purchase suggestions for the current building plan.
 */
import { orderAtTack } from './xpl-tack-orders.js';
import { getRules } from './xpl-rules-loader.js';
import { ageOutlook } from './xpl-town-job.js';
import { rankPurchases } from '../core/xpl-purchase-advisor.js';
import { profileFor } from '../core/xpl-profiles.js';
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { log } from '../services/xpl-log.js';

export const QUEUE_MAX_NEW = 3; // buildings queued per click (the queue shows a few at a time)

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

/** The local player's settlement at a plan settlement key ("c:x-y"), or null. */
export function cityOfSid(sid) {
    const m = /^c:(-?\d+)-(-?\d+)$/.exec(sid ?? "");
    if (!m) return null;
    const x = Number(m[1]);
    const y = Number(m[2]);
    const cities = safe(() => Players.get(GameContext.localPlayerID).Cities.getCities(), []) ?? [];
    return cities.find((c) => c.location?.x === x && c.location?.y === y) ?? null;
}

/** Sets a town's Focus. @returns { ok, reason? } */
export function applyTownFocus(cityID, projectType) {
    const def = GameInfo.Projects?.lookup?.(projectType);
    if (!def) return { ok: false, reason: "LOC_XPL_ACTION_REFUSED" };
    const args = { Type: GrowthTypes.PROJECT, ProjectType: def.$hash, City: cityID?.id };
    const r = safe(() => Game.CityCommands.canStart(cityID, CityCommandTypes.CHANGE_GROWTH_MODE, args, false), null);
    if (!r?.Success) return { ok: false, reason: r?.FailureReasons?.[0] ?? "LOC_XPL_ACTION_REFUSED" };
    Game.CityCommands.sendRequest(cityID, CityCommandTypes.CHANGE_GROWTH_MODE, args);
    log.info(`town focus set to ${projectType}`);
    return { ok: true };
}

/** Building types in a city's build queue. */
function queuedTypes(city) {
    const out = new Set();
    for (const q of safe(() => city.BuildQueue.getQueue(), []) ?? []) {
        const type = GameInfo.Constructibles.lookup(q.constructibleType ?? q.type)?.ConstructibleType;
        if (type) out.add(type);
    }
    return out;
}

/**
 * Queues a city's next planned buildings (plan order) at their planned tiles, skipping
 * those already queued and those the game refuses there now (a future tile, locked...).
 * @returns { queued: [type], refused: number }
 */
export function queueNextBuildings(plans, sid, max = QUEUE_MAX_NEW, { skip = null } = {}) {
    const city = cityOfSid(sid);
    if (!city || city.isTown) return { queued: [], refused: 0 };
    const inQueue = queuedTypes(city);
    const queued = [];
    let refused = 0;
    for (const p of plans.placements.filter((q) => q.sid === sid)) {
        if (queued.length >= max) break;
        if (inQueue.has(p.type) || p.locked || skip?.(p.type)) continue;
        const def = GameInfo.Constructibles.lookup(p.type);
        if (!def) continue;
        if (orderAtTack(city.id, def, { x: p.x, y: p.y }, false)) queued.push(p.type);
        else refused++;
    }
    return { queued, refused };
}

/** Buys one planned building on its planned tile. @returns boolean */
export function buyPlanned(pick) {
    const city = cityOfSid(pick.sid);
    const def = GameInfo.Constructibles.lookup(pick.type);
    if (!city || !def) return false;
    return orderAtTack(city.id, def, { x: pick.x, y: pick.y }, true);
}

/** The game's upkeep of a building in a city (by our yield order), or the static table's. */
export function upkeepIn(city, type, rules = getRules()) {
    const engine = city ? safe(() => city.Constructibles.getMaintenance(type), null) : null;
    if (Array.isArray(engine) && engine.length > 0) {
        const out = [0, 0, 0, 0, 0, 0, 0];
        engine.forEach((v, i) => {
            const j = yieldIndex(GameInfo.Yields[i]?.YieldType);
            if (j >= 0) out[j] += Number(v) || 0;
        });
        return out;
    }
    return rules.upkeepOf(type).slice();
}

/** The local player's gold in the treasury. */
export function goldBalance() {
    const pid = GameContext.localPlayerID;
    return Number(safe(() => Players.Treasury?.get?.(pid)?.goldBalance, null) ?? safe(() => Players.get(pid).Treasury.goldBalance, 0)) || 0;
}

/**
 * Gold purchases worth making from the current plan: buildings the game lets you buy on
 * their planned tile now, ranked by value per gold.
 * @returns { gold, picks, budgetLeft }
 */
export function purchaseAdvice(plans, settings, max = 5) {
    const weights = profileFor(settings).y;
    const turnsLeft = plans.horizon ?? safe(() => ageOutlook().turnsLeft, 60) ?? 60;
    // Turns until production would finish it: the plan's build order when it has one.
    const etaOf = (city, p) => {
        if (city.isTown) return Infinity;
        if (plans.timeAware && p.eta > 0) return p.eta;
        const prod = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
        const cost = Number(safe(() => city.Production.getConstructibleProductionCost(p.type), 0)) || 0;
        return prod > 0 && cost > 0 ? cost / prod : Infinity;
    };
    const candidates = [];
    const cityBySid = new Map();
    for (const p of [...plans.placements, ...plans.fillers]) {
        if (!cityBySid.has(p.sid)) cityBySid.set(p.sid, cityOfSid(p.sid));
        const city = cityBySid.get(p.sid);
        if (!city || p.locked) continue;
        const def = GameInfo.Constructibles.lookup(p.type);
        if (!def) continue;
        const args = { ConstructibleType: def.$hash, X: p.x, Y: p.y };
        const r = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, args, false), null);
        if (!r || !(r.Success || r.InsufficientFunds)) continue;
        const cost = Number(r.Cost ?? safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, p.type), 0)) || 0;
        // Value per turn after upkeep (the plan's `net` already weighs food/happiness by what the city has to spare).
        const perTurn = Number.isFinite(p.net) ? p.net : (p.value ?? 0) - dot(weights, p.upkeep ?? upkeepIn(city, p.type));
        candidates.push({
            key: `${p.sid}|${p.type}`, sid: p.sid, type: p.type, name: p.name, settlementName: p.settlementName, x: p.x, y: p.y,
            perTurn, eta: etaOf(city, p), cost, canBuy: true, town: !!city.isTown,
        });
    }
    const gold = goldBalance();
    return { gold, ...rankPurchases(candidates, { gold, turnsLeft, max }) };
}
