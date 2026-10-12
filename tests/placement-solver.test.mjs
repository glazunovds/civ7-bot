// Building placement model + solver on a hand-built map, with the REAL antiquity rules.
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

// Centre (10,8) on an even row ("odd-r" layout). Its neighbours: (11,8) (9,8) (9,7) (10,7) (9,9) (10,9).
// Mountains east (next to (11,8)), coast column x=8 (next to (9,8)), resources south-east (next to (10,9)).
function makeWorld() {
    const w = new FakeWorld(24, 18);
    const C = { x: 10, y: 8 };
    for (const [x, y] of [[12, 8], [12, 7]]) w.set(x, y, "mountain");
    for (let y = 5; y <= 11; y++) w.set(8, y, "coast");
    for (let y = 5; y <= 11; y++) w.set(7, y, "coast");
    for (const [x, y] of [[11, 10], [10, 10]]) w.patch(x, y, { resource: "RESOURCE_IRON", urbanizable: false });
    w.patch(C.x, C.y, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }] });
    const centre = w.at(C.x, C.y);
    const area = w.grid.radius(centre, 3).map((p) => p.idx);
    const owned = new Set(w.grid.radius(centre, 1).map((p) => p.idx));
    return { w, centre, area, owned };
}

function newState(profile = "BALANCE", extra = {}) {
    const { w, centre, area, owned } = makeWorld();
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        centre,
        area,
        owned,
        book,
        weights: getProfile(profile).y,
        adjMult: 1.5,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
        ...extra,
    });
    return { state, w, centre };
}

const COMMON = ["BUILDING_LIBRARY", "BUILDING_MONUMENT", "BUILDING_MARKET", "BUILDING_GARDEN", "BUILDING_BARRACKS", "BUILDING_ARENA"];

function neighbourKinds(w, idx) {
    return w.grid.neighbours(idx).map((n) => w.table[n]);
}

test("each building goes next to its adjacency source", () => {
    const { state, w } = newState();
    const plan = runToEnd(solveLayout(state, COMMON));
    const at = Object.fromEntries(plan.placements.map((p) => [p.type, p.idx]));
    assert.ok(neighbourKinds(w, at.BUILDING_MONUMENT).some((f) => f.isMountain), "monument by a mountain");
    assert.ok(neighbourKinds(w, at.BUILDING_ARENA).some((f) => f.isMountain), "arena by a mountain");
    assert.ok(neighbourKinds(w, at.BUILDING_MARKET).some((f) => f.terrain === "TERRAIN_COAST"), "market by the coast");
    assert.ok(neighbourKinds(w, at.BUILDING_GARDEN).some((f) => f.terrain === "TERRAIN_COAST"), "garden by the coast");
    assert.ok(neighbourKinds(w, at.BUILDING_LIBRARY).some((f) => f.resource), "library by a resource");
    for (const p of plan.placements) assert.ok(p.adjacencyTotal >= 1, `${p.type} has adjacency`);
});

test("layout invariants: slots, one per settlement, connected, no resources or water for land buildings", () => {
    const { state, w } = newState();
    runToEnd(solveLayout(state, COMMON));
    assert.ok(state.isConnected());
    const seen = new Set();
    for (const t of state.tiles.values()) {
        const slotUsers = t.items.filter((i) => !book.placementOf(i.type).slotless);
        assert.ok(slotUsers.length <= 2, `tile ${t.idx} has ${slotUsers.length} buildings`);
        for (const i of t.items.filter((x) => x.planned)) {
            assert.ok(!seen.has(i.type));
            seen.add(i.type);
            assert.ok(!w.table[t.idx].isWater && !w.table[t.idx].resource && !w.table[t.idx].isMountain);
        }
    }
});

test("pairs buildings into quarters (specialists repeat adjacency)", () => {
    const { state } = newState();
    const plan = runToEnd(solveLayout(state, COMMON));
    assert.ok(plan.placements.some((p) => p.quarter), "at least one quarter formed");
});

test("lighthouse goes on a coast tile next to land", () => {
    const { state, w } = newState("GOLD");
    const plan = runToEnd(solveLayout(state, ["BUILDING_LIGHTHOUSE", "BUILDING_MARKET"]));
    const lh = plan.placements.find((p) => p.type === "BUILDING_LIGHTHOUSE");
    assert.ok(lh, `lighthouse placed (unplaced: ${JSON.stringify(plan.unplaced)})`);
    assert.equal(w.table[lh.idx].terrain, "TERRAIN_COAST");
});

test("a planned wonder pulls buildings next to it", () => {
    const { state, w } = newState();
    const wonderTile = w.at(11, 9);
    state.tiles.get(wonderTile).district = "DISTRICT_WONDER";
    state.tiles.get(wonderTile).origDistrict = "DISTRICT_WONDER";
    const plan = runToEnd(solveLayout(state, ["BUILDING_BARRACKS", "BUILDING_BLACKSMITH"]));
    for (const p of plan.placements) {
        assert.ok(w.grid.distance(p.idx, wonderTile) === 1, `${p.type} next to the wonder`);
    }
});

test("existing buildings are respected; warehouses fill low-value slots", () => {
    const { w, centre, area, owned } = makeWorld();
    const lib = w.at(10, 10);
    w.patch(10, 10, { district: "DISTRICT_URBAN", constructibles: [{ type: "BUILDING_LIBRARY" }] });
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i], centre, area, owned, book, weights: getProfile("BALANCE").y, adjMult: 1,
        adjOpts: { playerId: 0 },
    });
    const plan = runToEnd(solveLayout(state, ["BUILDING_LIBRARY", "BUILDING_ACADEMY"], ["BUILDING_GRANARY"]));
    assert.ok(!plan.placements.some((p) => p.type === "BUILDING_LIBRARY"), "library already built");
    assert.ok(plan.placements.some((p) => p.type === "BUILDING_ACADEMY"));
    assert.equal(plan.fillers.length, 1);
    assert.equal(state.tiles.get(lib).items.length <= 2, true);
});

test("engine validity overrides JS for owned tiles", () => {
    const { state, centre } = newState("BALANCE", { engineValid: (type, idx) => (idx === centre ? true : undefined) });
    // Only the centre is engine-approved among owned tiles; other owned tiles are JS-checked.
    const check = state.canPlace("BUILDING_LIBRARY", centre);
    assert.equal(check.ok, true);
    const { state: s2, centre: c2 } = newState("BALANCE", { engineValid: () => false });
    assert.equal(s2.canPlace("BUILDING_LIBRARY", c2).reason, "ENGINE");
});

test("Bath (RiverPlacement=RIVER) needs a river on the tile itself, not just water nearby", () => {
    const { state, w } = newState();
    const nextToRiver = w.at(11, 8);           // next to the centre, no river on the tile
    w.set(12, 9, "coast", { terrain: "TERRAIN_NAVIGABLE_RIVER", isNavRiver: true });
    state.tiles.get(nextToRiver).facts = { ...w.table[nextToRiver] };
    assert.equal(state.canPlace("BUILDING_BATH", nextToRiver).reason, "NEEDS_RIVER");
    state.tiles.get(nextToRiver).facts = { ...w.table[nextToRiver], isRiver: true };
    assert.equal(state.canPlace("BUILDING_BATH", nextToRiver).ok, true);
});

test("Lighthouse (OFF_COAST) only on coast touching land, never on a lake-less ocean or inland", () => {
    const { state, w } = newState("GOLD");
    const inland = w.at(11, 8);
    assert.equal(state.canPlace("BUILDING_LIGHTHOUSE", inland).ok, false);
});

test("navigable river tiles only take buildings that list them (Fishing Quay), even if the engine calls them land", () => {
    const { state, w } = newState();
    const river = w.at(11, 8); // next to the centre
    w.set(11, 8, "navriver");
    for (const urbanizable of [false, true]) {
        state.tiles.get(river).facts = { ...w.table[river], urbanizable };
        assert.equal(state.canPlace("BUILDING_LIBRARY", river).ok, false);
        assert.equal(state.canPlace("BUILDING_MARKET", river).ok, false);
    }
    assert.equal(state.canPlace("BUILDING_FISHING_QUAY", river).ok, true);
});

test("a Fishing Quay on a navigable river does not open the tile to land buildings (warehouse filler bug)", () => {
    const { state, w } = newState();
    const river = w.at(11, 8);
    w.set(11, 8, "navriver");
    state.tiles.get(river).facts = { ...w.table[river] };
    assert.equal(state.canPlace("BUILDING_FISHING_QUAY", river).ok, true);
    state.place("BUILDING_FISHING_QUAY", river);
    for (const type of ["BUILDING_SAW_PIT", "BUILDING_GRANARY", "BUILDING_BRICKYARD", "BUILDING_LIBRARY"]) {
        assert.equal(state.canPlace(type, river).ok, false, type);
    }
});

test("local search with swaps never ends below the greedy layout", () => {
    for (const profile of ["BALANCE", "SCIENCE", "GOLD", "CULTURE"]) {
        const a = newState(profile);
        const types = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_GRANARY", "BUILDING_BARRACKS", "BUILDING_ALTAR"];
        const plan = runToEnd(solveLayout(a.state, types));
        // Every planned building still passes its own placement check where it stands.
        for (const p of plan.placements) {
            const lifted = a.state.lift(p.type, p.sid);
            assert.ok(a.state.canPlace(p.type, p.idx).ok, `${profile}: ${p.type} valid at its tile`);
            a.state.restore(lifted);
        }
        assert.ok(a.state.isConnected());
        // Greedy only (no local search) for comparison.
        const b = newState(profile);
        const greedyTotal = (() => {
            const gen = solveLayout(b.state, types, [], {});
            let r = gen.next();
            while (!r.done && r.value < 0.7) r = gen.next();
            let v = 0;
            for (const t of b.state.tiles.values()) v += b.state.tileValue(t.idx);
            return v;
        })();
        let finalTotal = 0;
        for (const t of a.state.tiles.values()) finalTotal += a.state.tileValue(t.idx);
        assert.ok(finalTotal >= greedyTotal - 1e-6, `${profile}: ${finalTotal} >= ${greedyTotal}`);
    }
});

test("a valuable building with a single possible tile wins it (warehouses compete like any building)", () => {
    const { state, w } = newState("CULTURE");
    const river = w.at(11, 8); // next to the centre and the mountains: everyone wants it
    w.patch(11, 8, { isRiver: true });
    const sid = [...state.settlements.keys()][0];
    state.setExtraValue(sid, "BUILDING_BATH", 8); // e.g. a Mill's +1 food on every farm of the settlement
    const plan = runToEnd(solveLayout(state, ["BUILDING_MONUMENT", "BUILDING_AMPHITHEATER", "BUILDING_LIBRARY", "BUILDING_BATH"]));
    const bath = plan.placements.find((p) => p.type === "BUILDING_BATH");
    assert.ok(bath, JSON.stringify(plan.unplaced));
    assert.equal(bath.idx, river);
});

test("repair: a building left without a tile moves another one off the only tile it can use", () => {
    const { state, w } = newState("CULTURE");
    const river = w.at(11, 8);
    w.patch(11, 8, { isRiver: true });
    const sid = [...state.settlements.keys()][0];
    // The river tile is already full (two planned buildings), the Bath can only stand there.
    state.place("BUILDING_MONUMENT", river);
    state.place("BUILDING_AMPHITHEATER", river);
    state.setExtraValue(sid, "BUILDING_BATH", 10);
    const plan = runToEnd(solveLayout(state, ["BUILDING_BATH"]));
    assert.ok(!plan.unplaced.some((u) => u.type === "BUILDING_BATH"), JSON.stringify(plan.unplaced));
    assert.equal(plan.placements.find((p) => p.type === "BUILDING_BATH").idx, river);
    // Both earlier buildings are still in the plan (one of them moved).
    assert.ok(plan.placements.some((p) => p.type === "BUILDING_MONUMENT"));
    assert.ok(plan.placements.some((p) => p.type === "BUILDING_AMPHITHEATER"));
    assert.ok(state.isConnected());
});

test("a building worth the same anywhere goes on a tile the city owns now, not a future one", () => {
    // The city owns only (11,8) next to its centre; the other neighbours are future tiles
    // (and come first in tile order, which used to decide ties).
    const ownedNow = new Set([new FakeWorld(24, 18).at(11, 8)]);
    for (const horizon of [undefined, 60]) {
        const { state, centre } = newState("BALANCE", { owned: ownedNow, ...(horizon ? { horizon } : {}) });
        const sid = [...state.settlements.keys()][0];
        state.setExtraValue(sid, "BUILDING_GRANARY", 5);
        const plan = runToEnd(solveLayout(state, [], ["BUILDING_GRANARY"]));
        const g = plan.fillers.find((f) => f.type === "BUILDING_GRANARY");
        assert.ok(g, JSON.stringify(plan.unplaced));
        assert.ok(state.owned.has(g.idx) || g.idx === centre, `horizon ${horizon}: granary on a future tile ${g.idx}`);
    }
});
