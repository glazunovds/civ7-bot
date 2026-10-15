// Wonders tab data end to end on the fake engine (real antiquity rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";

const W = 22, H = 16;
const grid = new HexGrid(W, H, false);
const C = { x: 8, y: 8 };                  // Athens
const P = { x: 10, y: 6 };                 // good wonder tile: next to a Library and a Market
const Q = { x: 5, y: 10 };                 // plain tile, nothing around it
const pIdx = grid.index(P.x, P.y);
const around = grid.neighbours(pIdx).map((i) => ({ x: grid.x(i), y: grid.y(i) }));
const L = around[0];
const M = around[1];
const RIVAL_SITE = { x: 16, y: 4 };        // rival's Hanging Gardens site we can see

const fake = installFakeEngine({
    width: W, height: H, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: grid.distanceXY(x, y, C.x, C.y) <= 3 ? 0 : -1 }),
    structures: (x, y) => {
        if (x === C.x && y === C.y) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] };
        if (x === L.x && y === L.y) return { district: "DISTRICT_URBAN", constructibles: ["BUILDING_LIBRARY"] };
        if (x === M.x && y === M.y) return { district: "DISTRICT_URBAN", constructibles: ["BUILDING_MARKET"] };
        return { district: null, constructibles: [] };
    },
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: C.x, y: C.y, name: "Athens", pop: 6, prod: 20 },
        { owner: 1, x: 18, y: 12, name: "Babylon", pop: 6, prod: 20, queue: { type: "WONDER_PYRAMIDS", turns: 3, pct: 70 } },
    ],
    wonders: [
        { owner: 1, type: "WONDER_COLOSSUS", x: 19, y: 13, complete: true },
        { owner: 1, type: "WONDER_HANGING_GARDENS", x: RIVAL_SITE.x, y: RIVAL_SITE.y, complete: false },
    ],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100),
    canBuild: (type) => {
        if (!type.startsWith("WONDER_")) return undefined;
        if (["WONDER_PYRAMIDS", "WONDER_COLOSSEUM", "WONDER_HANGING_GARDENS"].includes(type)) {
            return { Success: true, Plots: [grid.index(Q.x, Q.y), pIdx], ExpandUrbanPlots: [] };
        }
        return { Success: false, Plots: [], FailureReasons: ["LOC_XPL_TEST_LOCKED"] };
    },
    agePoints: 20,
});
const { runWonderPlanner } = await import("../mod/expansion-planner/ui/data/xpl-wonder-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const row = (w, type) => w.rows.find((r) => r.type === type);

test("fair mode: tiles, turns, statuses and race labels", () => {
    const w = runWonderPlanner({ ...DEFAULT_SETTINGS });
    assert.equal(w.omniscient, false);
    const colosseum = row(w, "WONDER_COLOSSEUM");
    const pyramids = row(w, "WONDER_PYRAMIDS");
    const gardens = row(w, "WONDER_HANGING_GARDENS");
    assert.equal(colosseum.status, "AVAILABLE");
    assert.equal(colosseum.turns, 15); // 300 / 20
    assert.equal(row(w, "WONDER_COLOSSUS").status, "BUILT");
    assert.equal(row(w, "WONDER_COLOSSUS").race.label, "NONE");
    assert.equal(row(w, "WONDER_ORACLE").status, "LOCKED");
    assert.equal(row(w, "WONDER_ORACLE").failure, "LOC_XPL_TEST_LOCKED");
    // Fair mode cannot see Babylon's queue: Pyramids look open.
    assert.equal(pyramids.race.label, "MEDIUM");
    // The rival's Hanging Gardens site is on a revealed tile.
    assert.equal(gardens.rivalsSeen, 1);
    assert.equal(gardens.race.label, "LOW");
    // The first available wonder gets the tile next to the Library and Market; the next one the other tile.
    const available = w.rows.filter((r) => r.status === "AVAILABLE");
    assert.equal(available[0].best.idx, pIdx);
    assert.equal(available[0].best.buildings, 2);
    assert.ok(available[0].best.byYield[3] >= 1 && available[0].best.byYield[2] >= 1, "science + gold boost");
    assert.equal(available[1].best.idx, grid.index(Q.x, Q.y));
    // Sorted: available before locked before built.
    const order = w.rows.map((r) => r.status);
    assert.ok(order.indexOf("LOCKED") > order.lastIndexOf("AVAILABLE"));
    assert.ok(order.indexOf("BUILT") > order.lastIndexOf("LOCKED"));
    void fake;
});

test("omniscient mode reads rivals' queues", () => {
    const w = runWonderPlanner({ ...DEFAULT_SETTINGS, wonders: { omniscient: true } });
    const pyramids = row(w, "WONDER_PYRAMIDS");
    assert.deepEqual(pyramids.rivalTurns, [3]);
    assert.equal(pyramids.race.label, "LOW");
    assert.equal(row(w, "WONDER_COLOSSEUM").race.label, "MEDIUM"); // nobody is building it, but 15 turns: capped (research/24 P5)
});
