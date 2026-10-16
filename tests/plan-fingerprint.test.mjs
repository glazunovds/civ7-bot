// What marks a settlement changed for a fast recalculation (root CLAUDE.md gotcha 16): the game's adjacency per
// building and tile, not the settlement's yield totals there, which move with every citizen and modifier (game 20:
// 584 settlements re-solved in 166 incremental plans).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
let extra = 0; // the settlement's other yields (a new citizen, a modifier)
let adjacency = 1; // the game's adjacency of a Library on the first tile
const fake = installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 1 && Math.abs(y - C.y) <= 1 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
    placements: () => {
        const sci = GameInfo.Yields.lookup("YIELD_SCIENCE");
        const placements = fake.grid.neighbours(fake.grid.index(C.x, C.y)).map((plotID, i) => {
            const yieldChanges = Array.from(GameInfo.Yields, () => 0);
            const adj = i === 0 ? adjacency : 0;
            yieldChanges[sci.$index] = 2 + adj + extra;
            const changeDetails = adj ? [{ sourceType: 1, sourcePlotIndex: -1, targetPlotIndex: plotID, yieldType: sci.$hash, change: adj }] : [];
            return { plotID, yieldChanges, changeDetails };
        });
        return { buildings: [{ constructibleType: GameInfo.Constructibles.lookup("BUILDING_LIBRARY").$hash, placements }] };
    },
});
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_LIBRARY", "BUILDING_MONUMENT"] } };
const plan = async () => {
    clearEngineCache(); // the game would fire an event
    await startBuildingPlan(listTargets()[0], settings).promise;
    return state.get().results.plans;
};

test("the game's totals moved (a new citizen): every layout kept; its adjacency changed: that settlement is solved again", async () => {
    await plan();
    extra = 3;
    assert.deepEqual((await plan()).incremental, { changed: 0, of: 1 }, "same adjacency, other totals");
    adjacency = 2;
    const after = await plan();
    assert.equal(after.incremental, null);
    assert.equal(after.fullWhy, "every settlement changed", "the only settlement is solved again");
});
