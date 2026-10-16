// Specialists in the building plan (root CLAUDE.md gotcha 49): each specialist repeats all the adjacency
// of its tile (game 1.4.0: 100%) and costs food and happiness, so it goes only where a tile's adjacency
// pays for it. The plan used to multiply every adjacency by a flat 1.5, so adjacency gathered on one tile
// was worth no more than the same spread over two.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { installFakeEngine, loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { PlanState, specialistCost, specialistGain } from "../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";
import { dot } from "../mod/expansion-planner/ui/core/xpl-yields.js";

const book = buildRuleBook(loadGameInfo("antiquity").info, "AGE_ANTIQUITY");

test("a specialist pays only above its upkeep, which grows with the age", () => {
    const w = getProfile("SCIENCE").y;
    const [a, e, m] = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"].map((age) => specialistCost(w, age));
    assert.ok(a > 0 && a < e && e < m, `${a} < ${e} < ${m}`);
    const sp = { slots: 2, cost: 5 };
    assert.equal(specialistGain(sp, 4), 0, "below the cost: no specialist there");
    assert.equal(specialistGain(sp, 9), 8, "two specialists, each 9 - 5");
    assert.equal(specialistGain(sp, 9, 0.5), 2 * (9 - 2.5), "the upkeep counts for the share of the age the tile stands");
    assert.equal(specialistGain(null, 9), 0);
});

/** Library and Academy on one tile, or one each on two tiles with the same adjacency (2 resources next to each). */
function libraryAndAcademy(stacked, settlement) {
    const w = new FakeWorld(24, 18);
    const C = w.at(10, 8);
    w.patch(10, 8, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }], owner: 0 });
    const [a, b] = [w.at(9, 7), w.at(11, 8)]; // two tiles next to the centre, not next to each other
    const outside = (idx) => w.grid.neighbours(idx).filter((n) => n !== C && w.grid.distance(n, C) === 2);
    for (const idx of [a, b]) for (const n of outside(idx).slice(0, 2)) w.patch(w.grid.x(n), w.grid.y(n), { resource: "RESOURCE_IRON", urbanizable: false });
    const owned = new Set(w.grid.radius(C, 1).map((p) => p.idx));
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (x, y) => w.grid.distance(x, y) },
        facts: (i) => w.table[i],
        area: w.grid.radius(C, 3).map((p) => p.idx),
        settlements: [{ id: "s0", centre: C, owned, ...settlement }],
        book,
        weights: getProfile("SCIENCE").y,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
    });
    state.place("BUILDING_LIBRARY", a, state.canPlace("BUILDING_LIBRARY", a), 0);
    const academyAt = stacked ? a : b;
    state.place("BUILDING_ACADEMY", academyAt, state.canPlace("BUILDING_ACADEMY", academyAt), 0);
    assert.equal(state.adjacencyOf("BUILDING_ACADEMY", academyAt).byYield[3] >= 2, true, "the Academy has its 2 resources");
    return state.tileValue(a) + state.tileValue(b);
}

test("adjacency gathered on one tile is worth more than the same adjacency split over two (specialists go there)", () => {
    const cost = specialistCost(getProfile("SCIENCE").y, "AGE_ANTIQUITY");
    const withSpecialists = { specialists: { slots: 1, cost } };
    const stacked = libraryAndAcademy(true, withSpecialists);
    const spread = libraryAndAcademy(false, withSpecialists);
    assert.ok(stacked > spread + 1, `stacked ${stacked.toFixed(2)} vs spread ${spread.toFixed(2)}`);
});

// End to end: the city's own specialist limit (city.Workers.getCityWorkerCap) and the setting's share of it.
const C = { x: 10, y: 8 };
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => {
        if (x === 12 && (y === 7 || y === 8)) return { terrain: "TERRAIN_MOUNTAIN", yields: { YIELD_PRODUCTION: 1 } };
        const owned = Math.abs(x - C.x) <= 1 && Math.abs(y - C.y) <= 1;
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: owned ? 0 : -1 };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12, workerCap: 3 }],
};
installFakeEngine(world);
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("the plan counts the city's own specialist limit (half of it by default), and a new limit solves that settlement again", async () => {
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, timeAware: false, selected: ["BUILDING_MONUMENT", "BUILDING_ARENA", "BUILDING_LIBRARY"] } };
    await startBuildingPlan(listTargets()[0], settings).promise;
    let plans = state.get().results.plans;
    const w = getProfile("BALANCE").y;
    const monument = plans.placements.find((p) => p.type === "BUILDING_MONUMENT");
    assert.ok(monument.adjacencyTotal > 0, "next to the mountains");
    const shown = (monument.value - dot(w, monument.base)) / dot(w, monument.adjacency);
    assert.ok(Math.abs(shown - 2.5) < 1e-6, `adjacency shown x${shown}: 1 + half of a limit of 3`);
    world.cities[0].workerCap = 1; // e.g. Urban Planning lost (or another city's numbers)
    await startBuildingPlan(listTargets()[0], settings).promise;
    plans = state.get().results.plans;
    assert.equal(plans.incremental, null, "a new specialist limit: that settlement is solved again (the only one here: a full plan)");
    const again = plans.placements.find((p) => p.type === "BUILDING_MONUMENT");
    assert.ok(Math.abs((again.value - dot(w, again.base)) / dot(w, again.adjacency) - 1.5) < 1e-6);
});
