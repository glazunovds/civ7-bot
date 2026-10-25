// Game 60 (adjacency M2): in 13 of 28 plans both wonder anchors stood in the capital, each timed as if built at once, though a
// city builds one wonder at a time; Dur-Sharrukin held a tile next to the Palace A70-A92 and was never ordered. A second anchor in
// a city is now timed after the first, and left out when that is past the age's end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
let near = () => false;
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: near(x, y) ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 8, prod: 30, isCapital: true }],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100), // 10 turns a wonder
    agePoints: 20,
};
const fake = installFakeEngine(world);
const grid = fake.grid;
near = (x, y) => grid.distanceXY(x, y, C.x, C.y) <= 1;
const tiles = { WONDER_HANGING_GARDENS: [grid.index(12, 9)], WONDER_PYRAMIDS: [grid.index(8, 9)] };
world.canBuild = (type) => {
    if (!type?.startsWith("WONDER_")) return { Success: true, Plots: [], ExpandUrbanPlots: [] };
    return tiles[type] ? { Success: true, Plots: tiles[type], ExpandUrbanPlots: [] } : { Success: false, Plots: [], FailureReasons: ["LOC_XPL_TEST_LOCKED"] };
};
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, incremental: false, selected: ["BUILDING_LIBRARY", "BUILDING_MONUMENT", "BUILDING_MARKET"] } };

test("two wonder anchors in one city: the second is done after the first, not at the same time", async () => {
    state.set({ results: { ...state.get().results, wonders: null } });
    await startBuildingPlan(listTargets()[0], settings).promise;
    const anchors = state.get().results.plans.anchors ?? [];
    assert.deepEqual(anchors.map((a) => a.eta).sort((a, b) => a - b), [10, 20], JSON.stringify(anchors));
});

test("a second anchor in a city that would be done past the age's end gets no tile", async () => {
    // About 18 turns left (no pace known yet: that share of 120 turns): the second, done at 20, is past it.
    GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
    world.agePoints = 85;
    try {
        state.set({ results: { ...state.get().results, wonders: null } });
        await startBuildingPlan(listTargets()[0], settings).promise;
        const anchors = state.get().results.plans.anchors ?? [];
        assert.equal(anchors.length, 1, JSON.stringify(anchors));
        assert.equal(anchors[0].eta, 10);
    } finally {
        world.agePoints = 20;
    }
});
