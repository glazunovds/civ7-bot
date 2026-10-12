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

/**
 * @returns {
 *   own: [{ id, idx, x, y, name, isTown, isCapital, population }],
 *   centres: [{ idx, kind: "OWN"|"FOREIGN", name }],
 *   independents: [idx],
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
    return { own, centres, independents, ownedResources };
}
