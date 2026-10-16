// Wonder anchors (research/27 P1): the building plan reserves the tiles of the wonders we will build and plans the
// quarters around them (every building group gets +1 next to a wonder), and the autopilot builds them there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { installFakeEngine, loadGameInfo } from "./fakes/fake-engine.mjs";
import { makeRandomCity, planValue, randomCityState } from "./fakes/random-city.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { PlanState } from "../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { solveLayout } from "../mod/expansion-planner/ui/core/xpl-placement-solver.js";
import { runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const book = buildRuleBook(loadGameInfo("antiquity").info, "AGE_ANTIQUITY");

function smallCity(patches = (w) => w, settlement = {}) {
    const w = new FakeWorld(24, 18);
    w.patch(10, 8, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }], owner: 0 });
    patches(w);
    const C = w.at(10, 8);
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        area: w.grid.radius(C, 3).map((p) => p.idx),
        settlements: [{ id: "s0", centre: C, owned: new Set(w.grid.radius(C, 2).map((p) => p.idx)), ...settlement }],
        book,
        weights: getProfile("BALANCE").y,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
    });
    return { w, C, state };
}

test("a wonder's tile follows its rules: biome, terrain, an urban neighbour, no resource; the game's tiles when it knows them", () => {
    const { w, C, state } = smallCity((w) => {
        w.set(12, 8, "hill");
        w.patch(11, 10, { biome: "BIOME_PLAINS" });
        w.patch(9, 10, { resource: "RESOURCE_IRON", urbanizable: false });
    });
    const at = (x, y) => w.at(x, y);
    assert.equal(state.canPlace("WONDER_TERRACOTTA_ARMY", at(11, 10)).reason, "BIOME", "grassland only");
    assert.equal(state.canPlace("WONDER_TERRACOTTA_ARMY", at(9, 10)).reason, "RESOURCE");
    assert.ok(state.canPlace("WONDER_TERRACOTTA_ARMY", at(12, 10)).ok, "no urban neighbour needed, two tiles out");
    assert.equal(state.canPlace("WONDER_ORACLE", at(11, 9)).reason, "TERRAIN", "rough terrain only");
    assert.ok(state.canPlace("WONDER_ORACLE", at(12, 8)).ok);
    const ring2 = w.grid.radius(C, 2).map((p) => p.idx).find((i) => w.grid.distance(i, C) === 2 && !w.table[i].resource && w.table[i].biome === "BIOME_GRASSLAND");
    assert.equal(state.canPlace("WONDER_COLOSSEUM", ring2).reason, "NEEDS_DISTRICT", "must touch an urban district");
    assert.ok(state.canPlace("WONDER_COLOSSEUM", w.grid.neighbours(C)[0]).ok, "next to the city centre");
    const known = smallCity(undefined, { wonderPlots: new Map([["WONDER_TERRACOTTA_ARMY", new Set([at(12, 10)])]]) });
    assert.equal(known.state.canPlace("WONDER_TERRACOTTA_ARMY", at(11, 9)).reason, "ENGINE", "the game's tiles win");
});

test("a planned wonder is a wonder district: the buildings next to it get its +1", () => {
    const { w, state } = smallCity();
    const X = w.at(11, 9);
    const wonder = w.at(12, 9);
    state.place("BUILDING_LIBRARY", X, state.canPlace("BUILDING_LIBRARY", X), 0);
    const before = state.adjacencyOf("BUILDING_LIBRARY", X).byYield[3];
    state.place("WONDER_TERRACOTTA_ARMY", wonder, state.canPlace("WONDER_TERRACOTTA_ARMY", wonder), 0);
    assert.equal(state.tiles.get(wonder).district, "DISTRICT_WONDER");
    assert.equal(state.adjacencyOf("BUILDING_LIBRARY", X).byYield[3], before + 1);
    assert.equal(state.canPlace("BUILDING_MONUMENT", wonder).ok, false, "nothing else on the wonder's tile");
});

test("planned together with the buildings, a wonder leaves a better plan than placed after them on its best tile", () => {
    const ALL = [...book.buildings.map((b) => b.type)];
    const WH = book.warehouses.map((b) => b.type);
    const WONDER = "WONDER_TERRACOTTA_ARMY";
    let after = 0;
    let joint = 0;
    for (const m of [3, 4, 6]) {
        const a = randomCityState(makeRandomCity(m * 7919), book);
        a.setExtraValue("s0", WONDER, 10);
        runToEnd(solveLayout(a, ALL, WH));
        let best = null;
        for (const t of a.tilesOf("s0")) {
            const c = a.canPlace(WONDER, t.idx);
            if (c.ok) {
                const g = a.delta(WONDER, t.idx, c, 0);
                if (!best || g > best.g) best = { idx: t.idx, c, g };
            }
        }
        a.place(WONDER, best.idx, best.c, 0);
        after += planValue(a);
        const j = randomCityState(makeRandomCity(m * 7919), book);
        j.setExtraValue("s0", WONDER, 10);
        runToEnd(solveLayout(j, [...ALL, WONDER], WH));
        assert.ok(j.settlements.get("s0").planned.has(WONDER), `map ${m}: the wonder has a tile`);
        joint += planValue(j);
    }
    assert.ok(joint > after * 1.03, `three cities: after ${after.toFixed(1)}, together ${joint.toFixed(1)}`);
});

// End to end: which wonders get a tile, and the autopilot builds on it.
const C = { x: 10, y: 8 };
let near = () => false; // the city's own tiles: its centre and the ring around it (the fake's purchased plots)
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => {
        if (x === 12 && y === 7) return { terrain: "TERRAIN_HILL", yields: { YIELD_PRODUCTION: 2 }, owner: near(x, y) ? 0 : -1 };
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: near(x, y) ? 0 : -1 };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0, civ: "CIVILIZATION_GREECE" }, { id: 1 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 8, prod: 30, isCapital: true }],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100),
    agePoints: 20,
};
const engineFake = installFakeEngine(world);
const grid = engineFake.grid;
near = (x, y) => grid.distanceXY(x, y, C.x, C.y) <= 1;
const gardens = [grid.index(12, 9), grid.index(8, 9)];
world.canBuild = (type) => {
    if (!type?.startsWith("WONDER_")) return { Success: true, Plots: [], ExpandUrbanPlots: [] };
    if (type === "WONDER_HANGING_GARDENS") return { Success: true, Plots: gardens, ExpandUrbanPlots: [] };
    return { Success: false, Plots: [], FailureReasons: ["LOC_XPL_TEST_LOCKED"] };
};
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { runWonderPlanner } = await import("../mod/expansion-planner/ui/data/xpl-wonder-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, timeAware: false, incremental: false, selected: ["BUILDING_LIBRARY", "BUILDING_MONUMENT", "BUILDING_MARKET", "BUILDING_BARRACKS"] } };

test("the plan keeps tiles for the wonder the autopilot would start and for our own (Greece: the Oracle, still locked), apart from the buildings", async () => {
    await startBuildingPlan(listTargets()[0], settings).promise;
    const plans = state.get().results.plans;
    const byType = Object.fromEntries((plans.anchors ?? []).map((a) => [a.type, a]));
    assert.ok(byType.WONDER_HANGING_GARDENS, JSON.stringify(plans.anchors));
    assert.ok(gardens.includes(byType.WONDER_HANGING_GARDENS.idx), "one of the tiles the game allows");
    assert.ok(byType.WONDER_ORACLE, "our civilization's wonder");
    assert.equal(byType.WONDER_ORACLE.idx, grid.index(12, 7), "the only rough tile");
    assert.ok(!plans.placements.some((p) => p.type.startsWith("WONDER_")), "not among the buildings to queue or buy");
    const nextToGardens = plans.placements.filter((p) => grid.neighbours(byType.WONDER_HANGING_GARDENS.idx).includes(p.idx));
    assert.ok(nextToGardens.length > 0, "buildings stand around it");
});

test("the Wonders tab and the autopilot build on the plan's tile", () => {
    const plans = state.get().results.plans;
    const plotsOf = () => runWonderPlanner(settings).rows.find((r) => r.type === "WONDER_HANGING_GARDENS").options[0].plots;
    const anchored = plotsOf()[0].idx;
    assert.equal(anchored, plans.anchors.find((a) => a.type === "WONDER_HANGING_GARDENS").idx);
    // The other tile, when the plan keeps that one (it may stand second by its own value).
    const other = gardens.find((g) => g !== anchored);
    state.set({ results: { ...state.get().results, plans: { ...plans, anchors: [{ type: "WONDER_HANGING_GARDENS", idx: other }] } } });
    try {
        assert.equal(plotsOf()[0].idx, other);
        assert.equal(plotsOf()[0].anchor, true);
    } finally {
        state.set({ results: { ...state.get().results, plans } });
    }
});

test("a race we would lose gets no tile", async () => {
    world.canBuild = (type) => (type?.startsWith("WONDER_") ? { Success: false, Plots: [], FailureReasons: ["LOC_XPL_TEST_LOCKED"] } : { Success: true, Plots: [], ExpandUrbanPlots: [] });
    world.wonders = [{ owner: 1, type: "WONDER_ORACLE", x: 1, y: 1, complete: true }];
    try {
        state.set({ results: { ...state.get().results, wonders: null } });
        await startBuildingPlan(listTargets()[0], settings).promise;
        assert.deepEqual(state.get().results.plans.anchors, [], "the Oracle is built elsewhere, the Gardens locked");
    } finally {
        delete world.wonders;
    }
});
