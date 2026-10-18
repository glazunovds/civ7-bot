// Building plan end to end on the fake engine (real antiquity rules + engine validity).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => {
        if (x === 12 && (y === 7 || y === 8)) return { terrain: "TERRAIN_MOUNTAIN", yields: { YIELD_PRODUCTION: 1 } };
        if (x === 8 || x === 7) return { terrain: "TERRAIN_COAST", biome: "BIOME_MARINE", yields: { YIELD_FOOD: 1, YIELD_GOLD: 1 } };
        const owned = Math.abs(x - C.x) <= 1 && Math.abs(y - C.y) <= 1;
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: owned ? 0 : -1 };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
};
const fake = installFakeEngine(world);
const worldCity = () => world.cities[0];
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("plans a layout for the capital with the real rules", async () => {
    const targets = listTargets();
    assert.equal(targets.length, 1);
    assert.equal(targets[0].kind, "city");
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_MONUMENT", "BUILDING_MARKET", "BUILDING_LIBRARY", "BUILDING_GRANARY"] } };
    await startBuildingPlan(targets[0], settings).promise;
    const plans = state.get().results.plans;
    assert.ok(plans, "plan stored");
    const byType = Object.fromEntries(plans.placements.map((p) => [p.type, p]));
    assert.ok(byType.BUILDING_MONUMENT, JSON.stringify(plans.unplaced));
    const mon = byType.BUILDING_MONUMENT;
    const centre = fake.grid.index(10, 8);
    const byMountain = fake.grid.neighbours(mon.idx).some((n) => fake.grid.x(n) === 12);
    const quarterNextToPalace = mon.quarter && fake.grid.distance(mon.idx, centre) === 1;
    // Either the mountain bonus, or a quarter next to the Palace (+1 Culture +1 Science per adjacent quarter): the latter wins here.
    assert.ok(byMountain || quarterNextToPalace, "monument placed for adjacency");
    assert.ok(byType.BUILDING_MARKET.adjacencyTotal >= 1, "market touches the coast");
    assert.equal(plans.fillers.length, 1, "granary placed as a filler");
    assert.ok(plans.engineUsed);
    // The mountains at (12,7) and (12,8) never get a building (the game data has no "Mountain" column).
    for (const p of [...plans.placements, ...plans.fillers]) {
        assert.ok(!(fake.grid.x(p.idx) === 12 && (fake.grid.y(p.idx) === 7 || fake.grid.y(p.idx) === 8)), `${p.type} planned on a mountain`);
    }
});

// Research/34 §2: game 28's cities sat below zero Happiness most of Modern while the plan valued a happiness building by its
// happiness alone. Below zero the game takes 5% of the other yields a point: the Altar's 3 win that back.
test("in a settlement below zero Happiness a happiness building's value includes the yields it wins back", async () => {
    const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, incremental: false, selected: ["BUILDING_ALTAR", "BUILDING_LIBRARY"] } };
    const plan = async (happy) => {
        Object.assign(worldCity(), { happy, nets: { YIELD_SCIENCE: 20, YIELD_GOLD: 10, YIELD_CULTURE: 10 } });
        clearEngineCache();
        await startBuildingPlan(listTargets()[0], settings).promise;
        return state.get().results.plans.placements.find((p) => p.type === "BUILDING_ALTAR");
    };
    try {
        const calm = await plan(5);
        const unhappy = await plan(-8);
        assert.equal(calm.recovery, 0);
        assert.ok(unhappy.recovery > 5, `recovery ${unhappy.recovery}`);
        assert.ok(unhappy.net > calm.net + 5, `net ${calm.net} -> ${unhappy.net}`);
    } finally {
        delete worldCity().happy;
        delete worldCity().nets;
        clearEngineCache();
    }
});
