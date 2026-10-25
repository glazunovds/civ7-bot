// Our civilization's own wonder, still locked, takes an anchor in our best producing city (research/27 §7). That city may hold
// the other anchors already; a city builds one wonder at a time, so ours is timed after them (adjacency M2, game 60), and left
// out when that is past the age's end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
let near = () => false;
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: x === 12 && y === 7 ? "TERRAIN_HILL" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: near(x, y) ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0, civ: "CIVILIZATION_GREECE" }, { id: 1 }],
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
const SAMPLES = Database.makeHash("_XPL_OBJ_AGE_SAMPLES");

async function anchors() {
    state.set({ results: { ...state.get().results, wonders: null } });
    await startBuildingPlan(listTargets()[0], settings).promise;
    return Object.fromEntries((state.get().results.plans.anchors ?? []).map((a) => [a.type, a.eta]));
}

test("our own wonder, locked, in the city that holds two anchors: done after them (Greece: the Oracle at 20 + 10, not 15 + 10)", async () => {
    assert.deepEqual(await anchors(), { WONDER_HANGING_GARDENS: 10, WONDER_PYRAMIDS: 20, WONDER_ORACLE: 30 });
});

test("our own wonder past the age's end behind that city's anchors gets no tile", async () => {
    // About 24 turns left (no pace known yet: that share of 120 turns): the Oracle at 30 is past it, the Pyramids at 20 are not.
    GameTutorial.setProperty(SAMPLES, null);
    world.agePoints = 80;
    try {
        assert.deepEqual(await anchors(), { WONDER_HANGING_GARDENS: 10, WONDER_PYRAMIDS: 20 });
    } finally {
        world.agePoints = 20;
    }
});
