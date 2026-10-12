import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseRule, matchCount, adjacencyFromNeighbours } from "../mod/expansion-planner/ui/core/xpl-adjacency-rules.js";

// Rows copied from base-standard/data/constructibles.xml (standard adjacencies).
const ROWS = {
    MountainCulture: { ID: "MountainCulture", YieldType: "YIELD_CULTURE", YieldChange: 1, TilesRequired: 1, ProjectMaxYield: "true", AdjacentTerrain: "TERRAIN_MOUNTAIN" },
    CoastGold: { ID: "CoastGold", YieldType: "YIELD_GOLD", YieldChange: 1, TilesRequired: 1, AdjacentTerrain: "TERRAIN_COAST" },
    RiverGold: { ID: "RiverGold", YieldType: "YIELD_GOLD", YieldChange: 1, TilesRequired: 1, AdjacentTerrain: "TERRAIN_NAVIGABLE_RIVER" },
    ResourceScience: { ID: "ResourceScience", YieldType: "YIELD_SCIENCE", YieldChange: 1, TilesRequired: 1, AdjacentResource: "true" },
    WonderScience: { ID: "WonderScience", YieldType: "YIELD_SCIENCE", YieldChange: 1, TilesRequired: 1, AdjacentDistrict: "DISTRICT_WONDER" },
    QuarterCulture: { ID: "QuarterCulture", YieldType: "YIELD_CULTURE", YieldChange: 1, TilesRequired: 1, AdjacentQuarter: "true" },
    BasilicaCultureGold: { ID: "BasilicaCultureGold", YieldType: "YIELD_GOLD", YieldChange: 1, TilesRequired: 1, AdjacentConstructibleTag: "CULTURE" },
    TwoForOne: { ID: "TwoForOne", YieldType: "YIELD_FOOD", YieldChange: 1, TilesRequired: 2, AdjacentFeatureClass: "FEATURE_CLASS_VEGETATED" },
};
const rule = (id) => normaliseRule(ROWS[id]).rule;

test("normaliseRule accepts standard rows and flags structural/wonder rules", () => {
    assert.equal(rule("MountainCulture").yieldIndex, 4);
    assert.equal(rule("MountainCulture").structural, false);
    assert.equal(rule("WonderScience").isWonderRule, true);
    assert.equal(rule("WonderScience").structural, true);
    assert.equal(rule("QuarterCulture").structural, true);
    assert.equal(rule("ResourceScience").sel.AdjacentResource, true);
});

test("normaliseRule rejects unknown selectors and Self rules", () => {
    assert.ok(normaliseRule({ ID: "x", YieldType: "YIELD_GOLD", YieldChange: 1, AdjacentSomethingNew: "A" }).error);
    assert.ok(normaliseRule({ ID: "y", YieldType: "YIELD_GOLD", YieldChange: 1, Self: "true" }).error);
    assert.ok(normaliseRule({ ID: "z", YieldType: "YIELD_NOPE", YieldChange: 1 }).error);
    // Defaults present in GameInfo rows must not trip the check.
    assert.ok(normaliseRule({ ID: "w", YieldType: "YIELD_GOLD", YieldChange: 1, AdjacentLake: false, AdjacentResourceClass: "NO_RESOURCECLASS" }).rule);
});

test("terrain, resource and district selectors", () => {
    const opts = { playerId: 0 };
    assert.equal(matchCount(rule("MountainCulture"), { known: true, terrain: "TERRAIN_MOUNTAIN" }, opts), 1);
    assert.equal(matchCount(rule("MountainCulture"), { known: true, terrain: "TERRAIN_HILL" }, opts), 0);
    assert.equal(matchCount(rule("MountainCulture"), { known: false, terrain: "TERRAIN_MOUNTAIN" }, opts), 0);
    assert.equal(matchCount(rule("ResourceScience"), { known: true, resource: "RESOURCE_IRON" }, opts), 1);
    assert.equal(matchCount(rule("ResourceScience"), { known: true, resource: null }, opts), 0);
    assert.equal(matchCount(rule("WonderScience"), { known: true, district: "DISTRICT_WONDER" }, opts), 1);
});

test("constructible selectors count each matching building on a tile", () => {
    const opts = { playerId: 0, hasTag: (type, tag) => tag === "CULTURE" && (type === "BUILDING_MONUMENT" || type === "BUILDING_AMPHITHEATER") };
    const plot = { known: true, constructibles: ["BUILDING_MONUMENT", "BUILDING_AMPHITHEATER"] };
    assert.equal(matchCount(rule("BasilicaCultureGold"), plot, opts), 2);
});

test("adjacencyFromNeighbours sums per rule and honours TilesRequired", () => {
    const neighbours = [
        { known: true, terrain: "TERRAIN_COAST" },
        { known: true, terrain: "TERRAIN_COAST" },
        { known: true, terrain: "TERRAIN_NAVIGABLE_RIVER" },
        { known: true, terrain: "TERRAIN_FLAT", featureClass: "FEATURE_CLASS_VEGETATED" },
        { known: true, terrain: "TERRAIN_FLAT", featureClass: "FEATURE_CLASS_VEGETATED" },
        { known: true, terrain: "TERRAIN_FLAT", featureClass: "FEATURE_CLASS_VEGETATED" },
    ];
    const market = adjacencyFromNeighbours([rule("CoastGold"), rule("RiverGold")], neighbours, {});
    assert.equal(market.total, 3);
    assert.equal(market.byYield[2], 3);
    const half = adjacencyFromNeighbours([rule("TwoForOne")], neighbours, {});
    assert.equal(half.total, 1); // floor(3 / 2)
});
