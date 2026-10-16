// Ageless quarters (root CLAUDE.md gotcha 50, research/27): at an age change every building that is not
// ageless loses its adjacency and stops making quarters, so only a quarter of ageless buildings
// (warehouses, uniques) still gives the Palace its +1 Science +1 Culture in the next age. The plan counts
// a share of the next age for that (none in the final age): warehouses go next to the Palace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { installFakeEngine, loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { PlanState } from "../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { solveLayout } from "../mod/expansion-planner/ui/core/xpl-placement-solver.js";
import { runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const book = buildRuleBook(loadGameInfo("antiquity").info, "AGE_ANTIQUITY");
const PAIR_TYPES = ["BUILDING_LIBRARY", "BUILDING_ACADEMY", "BUILDING_GRANARY", "BUILDING_SAW_PIT"];

/** A Palace whose only buildable neighbour is X (the rest is coast). */
function palaceWithOneNeighbour(nextAge) {
    const w = new FakeWorld(24, 18);
    const C = w.at(10, 8);
    const ring1 = w.grid.neighbours(C);
    const X = ring1[0];
    for (const n of ring1.slice(1)) w.set(w.grid.x(n), w.grid.y(n), "coast");
    w.patch(10, 8, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }], owner: 0 });
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        area: w.grid.radius(C, 3).map((p) => p.idx),
        settlements: [{ id: "s0", centre: C, owned: new Set(w.grid.radius(C, 2).map((p) => p.idx)) }],
        book,
        weights: getProfile("BALANCE").y,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
        nextAge,
    });
    return { w, C, X, state };
}

test("the Palace keeps its bonus next age only from a quarter of ageless buildings", () => {
    const value = (nextAge, pair) => {
        const { C, X, state } = palaceWithOneNeighbour(nextAge);
        for (const type of pair) state.place(type, X, state.canPlace(type, X), 0);
        return state.tileValue(C);
    };
    const warehouses = ["BUILDING_GRANARY", "BUILDING_SAW_PIT"];
    const ordinary = ["BUILDING_LIBRARY", "BUILDING_BARRACKS"];
    assert.ok(Math.abs(value(0, warehouses) - value(0, ordinary)) < 1e-9, "this age: any quarter counts the same");
    const w = getProfile("BALANCE").y;
    const nextAge = value(0.5, warehouses) - value(0.5, ordinary);
    assert.ok(Math.abs(nextAge - 0.5 * (w[3] + w[4])) < 1e-9, `half an age of +1 Science +1 Culture: ${nextAge}`);
});

test("warehouses take the tile next to the Palace; the Library goes elsewhere", () => {
    const { X, state } = palaceWithOneNeighbour(0.5);
    runToEnd(solveLayout(state, PAIR_TYPES.slice(0, 2), PAIR_TYPES.slice(2), { annealSteps: 0 }));
    const s = state.settlements.get("s0");
    assert.equal(s.planned.get("BUILDING_GRANARY"), X);
    assert.equal(s.planned.get("BUILDING_SAW_PIT"), X);
    assert.notEqual(s.planned.get("BUILDING_LIBRARY"), X);
});

// End to end: the building job counts the next age except in the final age.
const C = { x: 10, y: 8 };
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => {
        const owned = Math.abs(x - C.x) <= 1 && Math.abs(y - C.y) <= 1;
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: owned ? 0 : -1 };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
    agePoints: 10,
};
installFakeEngine(world);
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");

test("the building job counts half of the next age for ageless adjacency, but nothing in the final age", async () => {
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, timeAware: false, incremental: false, selected: PAIR_TYPES } };
    await startBuildingPlan(listTargets()[0], settings).promise;
    assert.equal(state.get().results.plans.nextAge, 0.5);
    world.finalAge = true;
    clearEngineCache();
    await startBuildingPlan(listTargets()[0], settings).promise;
    assert.equal(state.get().results.plans.nextAge, 0, "the final age: no next age to keep it for");
});
