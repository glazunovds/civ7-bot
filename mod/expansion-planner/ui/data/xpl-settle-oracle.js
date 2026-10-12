/**
 * Settle validity and the game AI's own settlement suggestions.
 *
 * isSettleable uses the same engine check as the base Settler lens
 * (player.Diplomacy.isValidLandClaimLocation, appeal-layer.js:52). Like the base
 * code, we always pass a fresh { x, y } literal, never an object returned by the
 * engine. If the engine check refuses every candidate, site-job.js falls back to
 * ownRule() (min distance, resource on plot, impassable) and logs a diagnosis.
 * AI suggestions come from player.AI.getBestSettleLocationsForSettler
 * (settlement-recommendations-layer.js:43); unlike the base layer we de-duplicate on
 * the suggestion's own location.
 */
import { log } from '../services/xpl-log.js';

export function createSettleOracle(playerId, engineMap) {
    const player = Players.get(playerId);
    const diplomacy = player?.Diplomacy;
    const hasClaimCheck = typeof diplomacy?.isValidLandClaimLocation === "function";
    if (!hasClaimCheck) {
        log.warn("isValidLandClaimLocation unavailable; relying on spacing rules only");
    }
    let claimErrors = 0;
    const coord = (idx) => {
        const l = engineMap.location(idx);
        return { x: l.x, y: l.y };
    };
    const safe = (fn) => {
        try {
            return fn();
        } catch (error) {
            return `throws: ${error?.message ?? error}`;
        }
    };

    return {
        hasClaimCheck,

        isSettleable(idx) {
            if (!hasClaimCheck) return true;
            try {
                return !!diplomacy.isValidLandClaimLocation(coord(idx), true);
            } catch (error) {
                if (claimErrors++ < 3) log.error("isValidLandClaimLocation failed", error);
                return true;
            }
        },

        /** Our own settle rule, used only if the engine check refuses everything. */
        ownRule(idx) {
            const { x, y } = coord(idx);
            if (safe(() => GameplayMap.isCityWithinMinimumDistance(x, y)) === true) return false;
            if (safe(() => GameplayMap.isImpassable(x, y)) === true) return false;
            const resource = safe(() => GameplayMap.getResourceType(x, y));
            if (typeof resource === "number" && resource >= 0 && resource !== globalThis.ResourceTypes?.NO_RESOURCE) return false;
            return true;
        },

        /** Logs what the engine says about some plots, in every call form we know. */
        diagnose(idxList) {
            for (const idx of idxList) {
                const { x, y } = coord(idx);
                const engineObj = safe(() => GameplayMap.getLocationFromIndex(idx));
                log.warn(`settle diagnosis (${x},${y}): ` + JSON.stringify({
                    literalTrue: safe(() => diplomacy?.isValidLandClaimLocation({ x, y }, true)),
                    literalFalse: safe(() => diplomacy?.isValidLandClaimLocation({ x, y }, false)),
                    engineObjTrue: safe(() => diplomacy?.isValidLandClaimLocation(engineObj, true)),
                    engineObjKeys: safe(() => Object.keys(engineObj ?? {}).join(",")),
                    cityWithinMinDistance: safe(() => GameplayMap.isCityWithinMinimumDistance(x, y)),
                    impassable: safe(() => GameplayMap.isImpassable(x, y)),
                    resource: safe(() => GameplayMap.getResourceType(x, y)),
                    revealed: safe(() => GameplayMap.getRevealedState(playerId, x, y)),
                    owner: safe(() => GameplayMap.getOwner(x, y)),
                }));
            }
        },

        hasAI: typeof player?.AI?.getBestSettleLocationsForSettler === "function",

        /**
         * Adds the AI's suggestions around one origin to `picks` (Map<idx, factors[]>).
         * Suggestions on plots that fail isKnown(idx) are dropped (fog).
         */
        addAiPicks(origin, isKnown, picks, perOrigin = 3) {
            if (!this.hasAI) return;
            let suggestions = null;
            try {
                suggestions = player.AI.getBestSettleLocationsForSettler(perOrigin, coord(origin));
            } catch (error) {
                log.debug("getBestSettleLocationsForSettler failed", error);
                return;
            }
            for (const s of suggestions ?? []) {
                if (!s?.location) continue;
                const idx = GameplayMap.getIndexFromXY(s.location.x, s.location.y);
                if (idx < 0 || picks.has(idx) || !isKnown(idx)) continue;
                picks.set(idx, (s.factors ?? []).map((f) => ({ positive: !!f.positive, title: f.title, description: f.description })));
            }
        },
    };
}
