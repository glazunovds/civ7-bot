// Game 40, playing on after the win (the user): every remaining building is built, each on its best tile. The plan places a
// building that gains nothing there too (the greedy step's best is then the least loss), and the change of state is a full plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 3, prod: 30 }],
    agePoints: 20,
}, "modern");
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("after the win the plan places a building that gains nothing, on its best tile; the change is a full plan", async () => {
    // Every yield weighed 0 («Баланс приоритетов» at ×0): the Airfield gains nothing anywhere.
    const base = { ...DEFAULT_SETTINGS, yieldBias: { F: 0, P: 0, G: 0, S: 0, C: 0, H: 0 }, buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_AIRFIELD"] } };
    await startBuildingPlan(listTargets()[0], base).promise;
    let plans = state.get().results.plans;
    assert.deepEqual(plans.unplaced.map((u) => [u.type, u.reason]), [["BUILDING_AIRFIELD", "NO_GAIN"]]);
    assert.equal(plans.placements.length, 0);
    await startBuildingPlan(listTargets()[0], { ...base, afterWin: "WON" }).promise;
    plans = state.get().results.plans;
    assert.deepEqual(plans.placements.map((p) => p.type), ["BUILDING_AIRFIELD"]);
    assert.deepEqual(plans.unplaced, []);
    assert.match(String(plans.fullWhy), /everything/);
});
