/**
 * Per-plot facts read from the engine (TileFacts, see core/site-scorer.js), cached.
 *
 * Fog: when includeHidden is false, plots the local player has not revealed are
 * returned as { known: false } with NO real data, so hidden terrain, resources and
 * yields can never leak into scores. GameplayMap getters return true map data
 * regardless of fog, so this module is the single place that enforces it.
 */
import { yieldIndex } from '../core/xpl-yields.js';
import { log } from '../services/xpl-log.js';

const NO_OWNER = -1;

function lookupType(table, index, column) {
    if (index == null || index < 0) return null;
    return table.lookup(index)?.[column] ?? null;
}

export class FactsCache {
    /**
     * @param engineMap  from data/engine-map.js
     * @param rules      from data/rules-loader.js
     * @param options    { playerId, includeHidden }
     */
    constructor(engineMap, rules, options) {
        this.engineMap = engineMap;
        this.rules = rules;
        this.playerId = options.playerId;
        this.includeHidden = !!options.includeHidden;
        this.table = new Map();
        this.errors = 0;
    }

    facts(idx) {
        let f = this.table.get(idx);
        if (f === undefined) {
            try {
                f = this.build(idx);
            } catch (error) {
                if (this.errors++ < 5) log.error(`facts(${idx}) failed`, error);
                f = null;
            }
            this.table.set(idx, f);
        }
        return f;
    }

    /**
     * District type and constructibles on a plot (fog-filtered), for building planning.
     * Returns { district: "DISTRICT_URBAN"|... |null, constructibles: [{ type, obsolete, complete }] }.
     */
    structures(idx) {
        const f = this.facts(idx);
        if (!f || !f.known) return { district: null, constructibles: [] };
        if (f.structuresLoaded) return f;
        try {
            const district = safe(() => Districts.getAtLocation({ x: f.x, y: f.y }));
            f.district = district ? GameInfo.Districts.lookup(district.type)?.DistrictType ?? null : null;
            const ids = safe(() => MapConstructibles.getHiddenFilteredConstructibles(f.x, f.y)) ?? [];
            f.constructibles = [];
            for (const id of ids) {
                const c = safe(() => Constructibles.getByComponentID(id));
                const def = c ? GameInfo.Constructibles.lookup(c.type) : null;
                if (!def) continue;
                const ageless = this.rules.hasTag(def.ConstructibleType, "AGELESS");
                const obsolete = def.ConstructibleClass === "BUILDING" && !!def.Age && def.Age !== this.rules.age && !ageless;
                f.constructibles.push({ type: def.ConstructibleType, cls: def.ConstructibleClass, obsolete, complete: c.complete !== false });
            }
            // Improvements are not "buildings" for placement purposes; keep them for adjacency selectors only.
        } catch (error) {
            log.debug(`structures(${idx}) failed`, error);
        }
        f.structuresLoaded = true;
        return f;
    }

    invalidate(idx) {
        this.table.delete(idx);
    }

    invalidateAll() {
        this.table.clear();
    }

    build(idx) {
        const { x, y } = this.engineMap.location(idx);
        const revealed = GameplayMap.getRevealedState(this.playerId, x, y) != RevealedStates.HIDDEN;
        if (!revealed && !this.includeHidden) {
            return { idx, x, y, known: false, revealed: false, owner: NO_OWNER, yields: [0, 0, 0, 0, 0, 0, 0], constructibles: [] };
        }
        const terrainDef = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y));
        const terrain = terrainDef?.TerrainType ?? null;
        const biome = lookupType(GameInfo.Biomes, GameplayMap.getBiomeType(x, y), "BiomeType");
        const featureIndex = GameplayMap.getFeatureType(x, y);
        const featureDef = featureIndex != null && featureIndex >= 0 ? GameInfo.Features.lookup(featureIndex) : null;
        const resourceIndex = GameplayMap.getResourceType(x, y);
        const resourceDef = resourceIndex != null && resourceIndex >= 0 && resourceIndex !== globalThis.ResourceTypes?.NO_RESOURCE ? GameInfo.Resources.lookup(resourceIndex) : null;

        const isWater = !!GameplayMap.isWater(x, y);
        const isLake = !!GameplayMap.isLake(x, y);
        // The Terrains table has no "Mountain" column (mountains are Impassable terrain):
        // reading one made every mountain look like flat land. Ask the map and the type.
        const isMountain = terrain === "TERRAIN_MOUNTAIN" || !!safe(() => GameplayMap.isMountain(x, y));
        const terrainImpassable = terrainDef?.Impassable === true || terrainDef?.Impassable === "true" || terrainDef?.Impassable === 1;
        const isNaturalWonder = !!GameplayMap.isNaturalWonder(x, y);
        const isOcean = terrain === "TERRAIN_OCEAN";
        const featureImpassable = !!featureDef?.Impassable && !isNaturalWonder;
        const isNavRiver = terrain === "TERRAIN_NAVIGABLE_RIVER" || !!safe(() => GameplayMap.isNavigableRiver(x, y));
        const rawOwner = GameplayMap.getOwner(x, y);
        const owner = rawOwner == null || rawOwner < 0 || rawOwner === globalThis.PlayerIds?.NO_PLAYER ? NO_OWNER : rawOwner;

        const yields = [0, 0, 0, 0, 0, 0, 0];
        const raw = GameplayMap.getYields(idx, this.playerId);
        if (raw) {
            for (const [yieldType, amount] of raw) {
                const i = yieldIndex(GameInfo.Yields.lookup(yieldType)?.YieldType);
                if (i >= 0) yields[i] += Number(amount) || 0;
            }
        }

        const feature = featureDef?.FeatureType ?? null;
        const featureClass = featureDef?.FeatureClassType ?? null;
        const resource = resourceDef?.ResourceType ?? null;
        const workable = !isMountain && !terrainImpassable && !featureImpassable && (!isOcean || this.rules.oceanWorkable);
        const r = this.rules;
        return {
            idx,
            x,
            y,
            known: true,
            revealed,
            terrain,
            biome,
            feature,
            featureClass,
            resource,
            resourceClass: resourceDef?.ResourceClassType ?? null,
            isWater,
            isLake,
            isOcean,
            isRiver: !!safe(() => GameplayMap.isRiver(x, y)),
            isNavRiver,
            isMountain,
            isNaturalWonder,
            isHill: !!terrainDef?.Hills,
            freshWater: !!safe(() => GameplayMap.isFreshWater(x, y)),
            appeal: Number(safe(() => GameplayMap.getAppeal(x, y))) || 0,
            owner,
            district: null,
            constructibles: [],
            isQuarter: false,
            uniqueQuarterType: null,
            yields,
            workable,
            growable: workable,
            // Navigable rivers are not water to the game, but only buildings that list
            // TERRAIN_NAVIGABLE_RIVER (Fishing Quay, Harbor, bridges) may stand on them.
            urbanizable: !isWater && !isNavRiver && !isMountain && !terrainImpassable && !isNaturalWonder && !featureImpassable && !resource,
            prodTile: featureClass === "FEATURE_CLASS_VEGETATED" || !!terrainDef?.Hills || (resource && r.mineResources.has(resource)) || (feature && r.mineFeatures.has(feature)) || false,
            prodResource: !!resource && r.cityResources.has(resource),
        };
    }
}

function safe(fn) {
    try {
        return fn();
    } catch (_e) {
        return undefined;
    }
}
