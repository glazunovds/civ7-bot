// Region planning, time-aware value and unique quarters (real antiquity rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { PlanState } from "../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { solveLayout } from "../mod/expansion-planner/ui/core/xpl-placement-solver.js";
import { runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const { info } = loadGameInfo("antiquity");
const book = buildRuleBook(info, "AGE_ANTIQUITY");

function centreFacts(w, x, y, building) {
    w.patch(x, y, { district: "DISTRICT_CITY_CENTER", constructibles: building ? [{ type: building }] : [] });
}

function makeState(w, settlements, extra = {}) {
    const area = new Set();
    for (const s of settlements) for (const { idx } of w.grid.radius(s.centre, 3)) area.add(idx);
    return new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        area,
        settlements,
        book,
        weights: getProfile("BALANCE").y,
        adjOpts: { playerId: 0 },
        ...extra,
    });
}

test("region: tiles are split between settlements and each gets its own buildings", () => {
    const w = new FakeWorld(30, 16);
    centreFacts(w, 8, 8, "BUILDING_PALACE");
    centreFacts(w, 14, 8, "BUILDING_CITY_HALL");
    const a = w.at(8, 8), b = w.at(14, 8);
    const state = makeState(w, [
        { id: "A", centre: a, owned: new Set(w.grid.radius(a, 1).map((p) => p.idx)), adjMult: 1 },
        { id: "B", centre: b, owned: new Set(w.grid.radius(b, 1).map((p) => p.idx)), adjMult: 1 },
    ]);
    assert.equal(state.tiles.get(w.at(9, 8)).sid, "A");
    assert.equal(state.tiles.get(w.at(13, 8)).sid, "B");
    const plan = runToEnd(solveLayout(state, ["BUILDING_LIBRARY", "BUILDING_MONUMENT"]));
    const libs = plan.placements.filter((p) => p.type === "BUILDING_LIBRARY");
    assert.deepEqual(libs.map((p) => p.sid).sort(), ["A", "B"], "one library per settlement");
    assert.ok(state.isConnected());
    for (const p of plan.placements) assert.equal(state.tiles.get(p.idx).sid, p.sid, "placed inside its own settlement");
});

test("region: a wonder on the border feeds buildings of both settlements", () => {
    const w = new FakeWorld(30, 16);
    centreFacts(w, 8, 8, "BUILDING_CITY_HALL");
    centreFacts(w, 12, 8, "BUILDING_CITY_HALL");
    const a = w.at(8, 8), b = w.at(12, 8);
    const wonder = w.at(10, 8); // distance 2 from both centres
    const state = makeState(w, [
        { id: "A", centre: a, owned: new Set([a]), adjMult: 1 },
        { id: "B", centre: b, owned: new Set([b]), adjMult: 1 },
    ]);
    const tile = state.tiles.get(wonder);
    tile.district = "DISTRICT_WONDER";
    tile.origDistrict = "DISTRICT_WONDER";
    const plan = runToEnd(solveLayout(state, ["BUILDING_BARRACKS"]));
    assert.equal(plan.placements.length, 2);
    for (const p of plan.placements) assert.equal(w.grid.distance(p.idx, wonder), 1, `${p.sid} barracks next to the shared wonder`);
});

/**
 * One settlement. Tile M (next to the centre) touches a mountain: +1 Culture for a
 * Monument right away. Tile W (also next to the centre) touches two tiles where
 * wonders are planned at turn `wonderTurn`: +2 Culture, but only from then on.
 */
function timingCase(horizon, wonderTurn) {
    const w = new FakeWorld(24, 16);
    centreFacts(w, 10, 8, "BUILDING_CITY_HALL");
    const c = w.at(10, 8);
    w.set(12, 8, "mountain"); // touches (11,8)
    const state = makeState(w, [{ id: "S", centre: c, owned: new Set(w.grid.radius(c, 1).map((p) => p.idx)), adjMult: 1, production: 10, costOf: () => 90 }], { horizon });
    // W = (10,9) touches (10,10) and (11,10); neither touches the mountain tile M = (11,8).
    const W = w.at(10, 9);
    const M = w.at(11, 8);
    const others = [w.at(10, 10), w.at(11, 10)];
    for (const n of others) assert.ok(w.grid.neighbours(W).includes(n) && !w.grid.neighbours(M).includes(n));
    for (const n of others) {
        const t = state.tiles.get(n);
        t.district = "DISTRICT_WONDER";
        t.origDistrict = "DISTRICT_WONDER";
        t.districtTime = wonderTurn;
    }
    const plan = runToEnd(solveLayout(state, ["BUILDING_MONUMENT"]));
    return { plan, M, W, state };
}

test("time-aware: a tile that only pays later loses when the payoff comes too late", () => {
    const late = timingCase(100, 80);
    assert.equal(late.plan.placements[0].idx, late.M, "late wonders: take the mountain tile now");
    const early = timingCase(100, 20);
    assert.equal(early.plan.placements[0].idx, early.W, "early wonders: worth waiting next to them");
    const stat = timingCase(undefined, 80);
    assert.equal(stat.plan.placements[0].idx, stat.W, "static mode ignores timing");
});

test("time-aware: build order puts quick, valuable buildings first and reports ETAs", () => {
    const w = new FakeWorld(24, 16);
    centreFacts(w, 10, 8, "BUILDING_PALACE");
    const c = w.at(10, 8);
    const costs = { BUILDING_LIBRARY: 90, BUILDING_ACADEMY: 180, BUILDING_MONUMENT: 90 };
    const state = makeState(w, [{ id: "S", centre: c, owned: new Set(w.grid.radius(c, 1).map((p) => p.idx)), adjMult: 1, production: 10, costOf: (t) => costs[t] ?? 100 }], { horizon: 120 });
    const plan = runToEnd(solveLayout(state, Object.keys(costs)));
    const etas = plan.placements.map((p) => p.eta);
    assert.deepEqual(etas, [...etas].sort((a, b) => a - b), "listed in build order");
    assert.ok(plan.placements.at(-1).type === "BUILDING_ACADEMY", "the expensive one comes last");
    assert.equal(plan.placements[0].eta, 9);
});

test("locked buildings cannot complete before the unlock delay", () => {
    const w = new FakeWorld(24, 16);
    centreFacts(w, 10, 8, "BUILDING_CITY_HALL");
    const c = w.at(10, 8);
    const state = makeState(w, [{ id: "S", centre: c, owned: new Set([c]), adjMult: 1, production: 10, costOf: () => 90 }], {
        horizon: 120, lockDelay: 25, isLocked: (t) => t === "BUILDING_LIBRARY",
    });
    const plan = runToEnd(solveLayout(state, ["BUILDING_LIBRARY"]));
    assert.equal(plan.placements[0].eta, 34);
});

test("unique quarter: both unique buildings go on the same tile", () => {
    const w = new FakeWorld(24, 16);
    centreFacts(w, 10, 8, "BUILDING_CITY_HALL");
    const c = w.at(10, 8);
    const uq = info.UniqueQuarters.lookup("QUARTER_ACROPOLIS") ?? info.UniqueQuarters[0];
    const state = makeState(w, [{ id: "S", centre: c, owned: new Set(w.grid.radius(c, 1).map((p) => p.idx)), adjMult: 1 }], {
        uniqueQuarters: [{ type: uq.UniqueQuarterType, b1: uq.BuildingType1, b2: uq.BuildingType2 }],
        uqBonus: 6,
    });
    const plan = runToEnd(solveLayout(state, [uq.BuildingType1, uq.BuildingType2]));
    assert.equal(plan.placements.length, 2);
    assert.equal(plan.placements[0].idx, plan.placements[1].idx, "same tile");
    assert.equal(plan.placements[0].uniqueQuarter, uq.UniqueQuarterType);
});

test("rule book: the player's civ uniques and unique quarter come from their traits", () => {
    const greece = info.CivilizationTraits.filter((r) => r.CivilizationType === "CIVILIZATION_GREECE").map((r) => r.TraitType);
    const b = buildRuleBook(info, "AGE_ANTIQUITY", () => false, { traits: new Set(greece) });
    const types = b.uniques.map((u) => u.type).sort();
    assert.deepEqual(types, ["BUILDING_ODEON", "BUILDING_PARTHENON"]);
    assert.equal(b.uniqueQuarters.length, 1);
    assert.equal(b.uniqueQuarters[0].type, "QUARTER_ACROPOLIS");
    assert.ok(b.uniques.find((u) => u.type === "BUILDING_ODEON").rules.some((r) => r.sel.AdjacentQuarter));
    assert.equal(b.costOf("BUILDING_LIBRARY"), 90);
});
