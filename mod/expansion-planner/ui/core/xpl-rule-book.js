/**
 * Builds the planner's rule book from GameInfo-like tables. Pure module: `info` is
 * any object whose tables are iterable rows with lookup(), so the same code runs on
 * the live GameInfo and on test fixtures extracted from the game's XML.
 */
import { normaliseRule } from './xpl-adjacency-rules.js';
import { YIELD_KEYS, yieldIndex, zeroYields } from './xpl-yields.js';

// Drongo's City Planner fallbacks (used only if the DB-derived sets come out empty).
const FALLBACK_MINE_RESOURCES = ["RESOURCE_GOLD", "RESOURCE_SILVER", "RESOURCE_COAL", "RESOURCE_CLAY", "RESOURCE_GYPSUM", "RESOURCE_IRON", "RESOURCE_JADE", "RESOURCE_KAOLIN", "RESOURCE_LIMESTONE", "RESOURCE_MARBLE", "RESOURCE_NITER", "RESOURCE_RUBIES", "RESOURCE_SALT", "RESOURCE_TIN"];
const FALLBACK_MINE_FEATURES = ["FEATURE_MANGROVE", "FEATURE_MARSH", "FEATURE_OASIS", "FEATURE_TUNDRA_BOG", "FEATURE_WATERING_HOLE"];
const MINE_IMPROVEMENTS = new Set(["IMPROVEMENT_MINE", "IMPROVEMENT_MINE_RESOURCE", "IMPROVEMENT_QUARRY", "IMPROVEMENT_CLAY_PIT", "IMPROVEMENT_CLAY_PIT_RESOURCE"]);
const PRODUCTION_IMPROVEMENTS = new Set([...MINE_IMPROVEMENTS, "IMPROVEMENT_CAMP", "IMPROVEMENT_CAMP_RESOURCE", "IMPROVEMENT_WOODCUTTER", "IMPROVEMENT_WOODCUTTER_RESOURCE"]);

export const FAMILY_YIELDS = ["YIELD_SCIENCE", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_FOOD", "YIELD_CULTURE", "YIELD_HAPPINESS"];

/**
 * Detailed Map Tacks' generic tacks (dmt-map-tack-generics.js): "a science building",
 * "any building", "a unique quarter", "a wonder", "an improvement". The planner treats
 * them as fixed, ageless placeholders with these adjacency rules (same ids as DMT).
 */
export const DMT_GENERIC_TACKS = Object.freeze({
    DMT_BUILDING_FOOD: { cls: "BUILDING", adjacencyIds: ["CoastFood", "RiverFood", "WonderFood"], name: "LOC_DMT_BUILDING_FOOD" },
    DMT_BUILDING_PRODUCTION: { cls: "BUILDING", adjacencyIds: ["ResourceProduction", "WonderProduction"], name: "LOC_DMT_BUILDING_PRODUCTION" },
    DMT_BUILDING_GOLD: { cls: "BUILDING", adjacencyIds: ["CoastGold", "RiverGold", "WonderGold"], name: "LOC_DMT_BUILDING_GOLD" },
    DMT_BUILDING_SCIENCE: { cls: "BUILDING", adjacencyIds: ["ResourceScience", "WonderScience"], name: "LOC_DMT_BUILDING_SCIENCE" },
    DMT_BUILDING_CULTURE: { cls: "BUILDING", adjacencyIds: ["MountainCulture", "NaturalWonderCulture", "WonderCulture"], name: "LOC_DMT_BUILDING_CULTURE" },
    DMT_BUILDING_HAPPINESS: { cls: "BUILDING", adjacencyIds: ["MountainHappiness", "NaturalWonderHappiness", "WonderHappiness"], name: "LOC_DMT_BUILDING_HAPPINESS" },
    DMT_BUILDING_DIPLOMACY: { cls: "BUILDING", adjacencyIds: [], name: "LOC_DMT_BUILDING_DIPLOMACY" },
    DMT_BUILDING: { cls: "BUILDING", adjacencyIds: [], name: "LOC_CONSTRUCTIBLE_CLASS_NAME_BUILDING" },
    DMT_BUILDING_UNIQUE_QUARTER: { cls: "BUILDING", adjacencyIds: [], fullTile: true, name: "LOC_UI_PRODUCTION_UNIQUE_QUARTER" },
    DMT_WONDER: { cls: "WONDER", adjacencyIds: [], name: "LOC_CONSTRUCTIBLE_CLASS_NAME_WONDER" },
    DMT_IMPROVEMENT: { cls: "IMPROVEMENT", adjacencyIds: [], name: "LOC_CONSTRUCTIBLE_CLASS_NAME_IMPROVEMENT" },
});

function truthy(v) {
    return v === true || v === 1 || v === "1" || v === "true";
}

function each(table, fn) {
    if (!table) return;
    for (const row of table) fn(row);
}

function groupBy(table, keyCol, valueFn) {
    const map = new Map();
    each(table, (row) => {
        const k = row[keyCol];
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(valueFn(row));
    });
    return map;
}

/**
 * @param info  GameInfo-like tables
 * @param age   current AgeType, e.g. "AGE_ANTIQUITY"
 * @param isActivated(yieldChangeId) -> bool  for RequiresActivation rules (optional)
 * @param player { traits: Set<TraitType>, uniqueQuarterTypes: Set<UniqueQuarterType> } (optional)
 */
export function buildRuleBook(info, age, isActivated = () => false, player = {}) {
    const tags = new Map();
    each(info.TypeTags, (row) => {
        if (!tags.has(row.Type)) tags.set(row.Type, new Set());
        tags.get(row.Type).add(row.Tag);
    });
    const hasTag = (type, tag) => tags.get(type)?.has(tag) ?? false;

    // Production classification (Drongo-compatible).
    const mineResources = new Set();
    const mineFeatures = new Set();
    const cityResources = new Set();
    each(info.Constructible_ValidResources, (row) => {
        if (MINE_IMPROVEMENTS.has(row.ConstructibleType)) mineResources.add(row.ResourceType);
        if (PRODUCTION_IMPROVEMENTS.has(row.ConstructibleType)) cityResources.add(row.ResourceType);
    });
    each(info.District_FreeConstructibles, (row) => {
        if (row.ResourceType && MINE_IMPROVEMENTS.has(row.ConstructibleType)) mineResources.add(row.ResourceType);
        if (row.ResourceType && PRODUCTION_IMPROVEMENTS.has(row.ConstructibleType)) cityResources.add(row.ResourceType);
        if (row.FeatureType && MINE_IMPROVEMENTS.has(row.ConstructibleType)) mineFeatures.add(row.FeatureType);
    });
    if (mineResources.size === 0) FALLBACK_MINE_RESOURCES.forEach((r) => mineResources.add(r));
    if (mineFeatures.size === 0) FALLBACK_MINE_FEATURES.forEach((f) => mineFeatures.add(f));
    for (const r of mineResources) cityResources.add(r);

    // Base yields per constructible.
    const baseYields = new Map();
    each(info.Constructible_YieldChanges, (row) => {
        const i = yieldIndex(row.YieldType);
        if (i < 0) return;
        if (!baseYields.has(row.ConstructibleType)) baseYields.set(row.ConstructibleType, zeroYields());
        baseYields.get(row.ConstructibleType)[i] += Number(row.YieldChange) || 0;
    });
    // Upkeep per building (positive amounts, per yield), as the production menu shows it.
    const upkeep = new Map();
    each(info.Constructible_Maintenances, (row) => {
        const i = yieldIndex(row.YieldType);
        if (i < 0) return;
        if (!upkeep.has(row.ConstructibleType)) upkeep.set(row.ConstructibleType, zeroYields());
        upkeep.get(row.ConstructibleType)[i] += Number(row.Amount) || 0;
    });

    // Adjacency rules per constructible (current-age or ageless rule rows only).
    const ruleErrors = new Map();
    const rulesByType = new Map();
    each(info.Constructible_Adjacencies, (link) => {
        if (truthy(link.RequiresActivation) && !isActivated(link.YieldChangeId)) return;
        const row = info.Adjacency_YieldChanges.lookup(link.YieldChangeId);
        if (!row) return;
        const { rule, error } = normaliseRule(row);
        if (error) {
            ruleErrors.set(link.YieldChangeId, error);
            return;
        }
        if (rule.age && rule.age !== age) return;
        if (!rulesByType.has(link.ConstructibleType)) rulesByType.set(link.ConstructibleType, []);
        rulesByType.get(link.ConstructibleType).push(rule);
    });

    const validTerrains = groupBy(info.Constructible_ValidTerrains, "ConstructibleType", (r) => r.TerrainType);
    const validFeatures = groupBy(info.Constructible_ValidFeatures, "ConstructibleType", (r) => r.FeatureType);
    const requiredFeatureClasses = groupBy(info.Constructible_RequiredFeatureClasses, "ConstructibleType", (r) => r.FeatureClassType);
    const validDistricts = groupBy(info.Constructible_ValidDistricts, "ConstructibleType", (r) => r.DistrictType);
    const slots = new Map();
    each(info.Districts, (row) => slots.set(row.DistrictType, Number(row.MaxConstructibles) || 1));

    const defs = new Map();
    each(info.Constructibles, (def) => defs.set(def.ConstructibleType, def));
    // DMT's generic tacks become ageless pseudo-constructibles with their adjacency rules.
    for (const [type, g] of Object.entries(DMT_GENERIC_TACKS)) {
        defs.set(type, { ConstructibleType: type, ConstructibleClass: g.cls, generic: true });
        tags.set(type, new Set(g.fullTile ? ["AGELESS", "FULL_TILE"] : ["AGELESS"]));
        const rules = [];
        for (const id of g.adjacencyIds) {
            const row = info.Adjacency_YieldChanges?.lookup?.(id);
            const { rule } = row ? normaliseRule(row) : {};
            if (rule && (!rule.age || rule.age === age)) rules.push(rule);
        }
        if (rules.length > 0) rulesByType.set(type, rules);
    }
    const buildingRows = new Map();
    each(info.Buildings, (b) => buildingRows.set(b.ConstructibleType, b));

    function placementOf(type) {
        const def = defs.get(type) ?? {};
        return {
            type,
            cls: def.ConstructibleClass ?? null,
            age: def.Age ?? null,
            ageless: hasTag(type, "AGELESS"),
            fullTile: def.ConstructibleClass === "WONDER" || hasTag(type, "FULL_TILE"),
            slotless: hasTag(type, "IGNORE_DISTRICT_PLACEMENT_CAP") || truthy(def.ExistingDistrictOnly),
            warehouse: hasTag(type, "WAREHOUSE"),
            validTerrains: new Set(validTerrains.get(type) ?? []),
            validFeatures: new Set(validFeatures.get(type) ?? []),
            requiredFeatureClasses: new Set(requiredFeatureClasses.get(type) ?? []),
            validDistricts: new Set(validDistricts.get(type) ?? []),
            riverPlacement: def.RiverPlacement ?? null,
            adjacentRiver: truthy(def.AdjacentRiver),
            adjacentLake: truthy(def.AdjacentLake),
            adjacentTerrain: def.AdjacentTerrain ?? null,
            noRiver: truthy(def.NoRiver),
            noFeature: truthy(def.NoFeature),
            cityCentre: Number(buildingRows.get(type)?.CityCenterPriority) > 0,
            multiplePerCity: truthy(buildingRows.get(type)?.MultiplePerCity),
            unique: !!buildingRows.get(type)?.TraitType,
            town: truthy(buildingRows.get(type)?.Town),
        };
    }

    /** Counts toward a quarter / gives & receives adjacency in the current age. */
    function isActive(type) {
        const p = placementOf(type);
        return p.ageless || p.age === age || p.age == null;
    }

    function mainYield(type) {
        const y = baseYields.get(type);
        let best = null;
        for (const yt of FAMILY_YIELDS) {
            const v = y?.[yieldIndex(yt)] ?? 0;
            if (v > 0 && (!best || v > best.v)) best = { yt, v };
        }
        return best?.yt ?? null;
    }

    // The player's unique quarters (given by the engine, or derived from their traits).
    const traits = player.traits ?? new Set();
    const uniqueQuarters = [];
    each(info.UniqueQuarters, (row) => {
        if (player.uniqueQuarterTypes?.has(row.UniqueQuarterType) || (row.TraitType && traits.has(row.TraitType))) {
            uniqueQuarters.push({ type: row.UniqueQuarterType, b1: row.BuildingType1, b2: row.BuildingType2, name: row.Name });
        }
    });
    const uqBuildings = new Set(uniqueQuarters.flatMap((q) => [q.b1, q.b2]));

    // "Common" buildings (PLAN.md 6.1) and the player's civ-unique buildings.
    const buildings = [];
    const warehouses = [];
    const uniques = [];
    for (const [type, b] of buildingRows) {
        const def = defs.get(type);
        if (!def || def.ConstructibleClass !== "BUILDING") continue;
        const p = placementOf(type);
        // Unique quarters stay buildable in later ages (their buildings are AGELESS and the
        // game keeps the quarter unlocked), e.g. Greece's Acropolis in the Exploration Age.
        const ownUnique = !!b.TraitType && (traits.has(b.TraitType) || uqBuildings.has(type));
        if (def.Age !== age && !p.ageless && !(ownUnique && uqBuildings.has(type))) continue;
        if (ownUnique && !p.slotless && !p.multiplePerCity) {
            uniques.push({
                type,
                name: def.Name,
                family: mainYield(type) ?? null,
                baseYields: baseYields.get(type) ?? zeroYields(),
                rules: rulesByType.get(type) ?? [],
                tags: tags.get(type) ?? new Set(),
                placement: p,
                fullTile: p.fullTile,
                unique: true,
            });
            continue;
        }
        if (b.TraitType || p.multiplePerCity || p.slotless || p.cityCentre) continue;
        if (p.warehouse) {
            warehouses.push({ type, name: def.Name, family: mainYield(type), baseYields: baseYields.get(type) ?? zeroYields(), placement: p });
            continue;
        }
        // Every building that takes a slot, with or without its own adjacency (an Altar
        // still fills a slot, forms quarters and gets +1 next to a wonder).
        const rules = rulesByType.get(type) ?? [];
        buildings.push({
            type,
            name: def.Name,
            family: mainYield(type) ?? rules.find((r) => !r.isWonderRule)?.yieldType ?? null,
            baseYields: baseYields.get(type) ?? zeroYields(),
            rules,
            tags: tags.get(type) ?? new Set(),
            placement: p,
            fullTile: p.fullTile,
        });
    }

    const siteFamilies = [];
    for (const yieldType of FAMILY_YIELDS) {
        const members = buildings
            .filter((b) => b.family === yieldType)
            .map((b) => ({ type: b.type, rules: b.rules.filter((r) => !r.structural) }))
            .filter((b) => b.rules.length > 0);
        if (members.length > 0) siteFamilies.push({ key: yieldType.replace("YIELD_", ""), yieldIndex: yieldIndex(yieldType), buildings: members });
    }

    return {
        age,
        tags,
        hasTag,
        uniques,
        uniqueQuarters,
        costOf: (type) => Number(defs.get(type)?.Cost) || 100,
        mineResources,
        mineFeatures,
        cityResources,
        baseYields,
        upkeepOf: (type) => upkeep.get(type) ?? zeroYields(),
        rulesByType,
        ruleErrors,
        slots,
        placementOf,
        isActive,
        classOf: (type) => defs.get(type)?.ConstructibleClass ?? null,
        isGeneric: (type) => !!DMT_GENERIC_TACKS[type],
        buildings,
        warehouses,
        siteFamilies,
        yieldKeys: YIELD_KEYS,
    };
}
