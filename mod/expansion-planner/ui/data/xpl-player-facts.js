/**
 * Settlements on the map, as the local player may legitimately know them.
 * Own settlements are always known; foreign and independent centres count only if
 * their centre plot has been revealed (or "include unexplored" is on).
 */
import { log } from '../services/xpl-log.js';

function safeName(name) {
    try {
        return Locale.compose(name ?? "");
    } catch (_e) {
        return String(name ?? "");
    }
}

function citiesOf(player) {
    try {
        return player?.Cities?.getCities?.() ?? [];
    } catch (_e) {
        return [];
    }
}

const VILLAGE_TYPES = new Set(["IMPROVEMENT_VILLAGE", "IMPROVEMENT_ENCAMPMENT"]);

/**
 * Independents' villages (and crisis encampments) on the map: not cities (player.Cities is empty
 * for them; only a city-state has a city), so read the way the game's banners find them
 * (city-banner-manager.js createAllBanners): the independent's constructibles of type
 * IMPROVEMENT_VILLAGE / IMPROVEMENT_ENCAMPMENT. Only villages whose tile we have seen, unless
 * includeHidden. `friendly`: Game.IndependentPowers says FRIENDLY to us.
 * @returns [{ id: the independent's player id, x, y, friendly, type, revealed }]
 */
export function villagesOf(playerId, includeHidden = false) {
    const out = [];
    const FRIENDLY = globalThis.IndependentRelationship?.FRIENDLY;
    let players = [];
    try {
        players = Players.getAlive() ?? [];
    } catch (_e) {
        return out;
    }
    for (const p of players) {
        if (!p?.isIndependent || p.id === playerId) continue;
        let list = [];
        try {
            list = p.Constructibles?.getConstructibles?.() ?? [];
        } catch (_e) {
            continue;
        }
        for (const c of list) {
            let type = null;
            try {
                type = GameInfo.Constructibles.lookup(c.type)?.ConstructibleType ?? null;
            } catch (_e) {
                type = null;
            }
            const loc = c?.location;
            if (!VILLAGE_TYPES.has(type) || !loc) continue;
            let revealed = false;
            try {
                revealed = GameplayMap.getRevealedState(playerId, loc.x, loc.y) != RevealedStates.HIDDEN;
            } catch (_e) {
                revealed = false;
            }
            if (!revealed && !includeHidden) continue;
            let rel = null;
            try {
                rel = Game.IndependentPowers.getIndependentRelationship(p.id, playerId);
            } catch (_e) {
                rel = null;
            }
            out.push({ id: p.id, x: loc.x, y: loc.y, friendly: FRIENDLY !== undefined && rel === FRIENDLY, type, revealed });
        }
    }
    return out;
}

/**
 * @returns {
 *   own: [{ id, idx, x, y, name, isTown, isCapital, population }],
 *   centres: [{ idx, kind: "OWN"|"FOREIGN", name }],
 *   independents: [idx] (city-states' centres and villages),
 *   villages: [{ idx, id, friendly }] (independents' villages: the site rule angersVillage),
 *   ownedResources: Set<ResourceType>
 * }
 */
export function gatherSettlements(playerId, engineMap, includeHidden) {
    const own = [];
    const centres = [];
    const independents = [];
    const ownedResources = new Set();
    const isRevealed = (x, y) => includeHidden || GameplayMap.getRevealedState(playerId, x, y) != RevealedStates.HIDDEN;

    const me = Players.get(playerId);
    for (const city of citiesOf(me)) {
        const { x, y } = city.location;
        const idx = GameplayMap.getIndexFromXY(x, y);
        const entry = { id: city.id, idx, x, y, name: safeName(city.name), isTown: !!city.isTown, isCapital: !!city.isCapital, population: city.population ?? 0 };
        own.push(entry);
        centres.push({ idx, kind: "OWN", name: entry.name });
        try {
            for (const plot of city.getPurchasedPlots?.() ?? []) {
                const loc = engineMap.location(plot);
                const r = GameplayMap.getResourceType(loc.x, loc.y);
                if (r != null && r >= 0) {
                    const type = GameInfo.Resources.lookup(r)?.ResourceType;
                    if (type) ownedResources.add(type);
                }
            }
        } catch (error) {
            log.debug("owned resources scan failed", error);
        }
    }

    let players = [];
    try {
        players = Players.getAlive() ?? [];
    } catch (error) {
        log.warn("Players.getAlive failed", error);
    }
    for (const player of players) {
        if (!player || player.id === playerId) continue;
        for (const city of citiesOf(player)) {
            const { x, y } = city.location;
            if (!isRevealed(x, y)) continue;
            const idx = GameplayMap.getIndexFromXY(x, y);
            if (player.isIndependent) {
                independents.push(idx);
            }
            centres.push({ idx, kind: "FOREIGN", name: safeName(city.name) });
        }
    }
    const villages = villagesOf(playerId, includeHidden).map((v) => ({ idx: GameplayMap.getIndexFromXY(v.x, v.y), id: v.id, friendly: v.friendly, revealed: v.revealed !== false }));
    for (const v of villages) independents.push(v.idx);
    return { own, centres, independents, villages, ownedResources };
}

/**
 * An independent's own name, as its unit flags and the befriend panel show it (Game.IndependentPowers.independentName:
 * «Хеттская деревня»), else its player's civilization name (research/24: the log said «деревни» for every one).
 */
export function independentNameOf(id) {
    try {
        const loc = Game.IndependentPowers?.independentName?.(id)?.toString();
        if (loc) return Locale.compose(loc);
    } catch (_e) {
        // fall through
    }
    try {
        const p = Players.get(id);
        return Locale.compose(p.civilizationName ?? p.name);
    } catch (_e) {
        return String(id);
    }
}
