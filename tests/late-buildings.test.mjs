// Time-aware plans keep buildings that cannot be finished this age by production alone:
// they still get a tile (marked "after the age") instead of being dropped as "no gain".
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 3, prod: 3 }], // 100 production per building: ~33 turns each
    agePoints: 60,
});
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("slow city: every building is placed, the late ones are flagged", async () => {
    const selected = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_BARRACKS"];
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected, timeAware: true } };
    await startBuildingPlan(listTargets()[0], settings).promise;
    const plans = state.get().results.plans;
    assert.ok(plans.timeAware && plans.horizon > 0);
    assert.equal(plans.unplaced.filter((u) => u.reason === "NO_GAIN").length, 0, JSON.stringify(plans.unplaced));
    assert.equal(plans.placements.length, selected.length);
    assert.ok(plans.placements.some((p) => p.afterAge), "some finish after the age");
    assert.ok(plans.placements.some((p) => !p.afterAge), "the first ones fit in the age");
    // Build order: the ones that fit come first.
    const order = plans.placements.map((p) => p.afterAge);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
