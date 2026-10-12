// Empire overview and the food network: which towns feed which cities (the game's rule:
// a town with a Focus sends getSentFoodPerCity() to every connected city), towns that
// feed nobody, and what each city is strongest at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { HexGrid, hexLine } from "../mod/expansion-planner/ui/core/xpl-hex.js";

installFakeEngine({
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    structures: () => ({ district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 5, y: 5, name: "Athens", pop: 12, prod: 20 },
        { owner: 0, x: 15, y: 5, name: "Thebes", pop: 9, prod: 8 },
        { owner: 0, x: 10, y: 9, name: "Fields", isTown: true, pop: 8, focus: "PROJECT_TOWN_GRANARY", foodSent: 3, connected: [0, 1] },
        { owner: 0, x: 30, y: 9, name: "Island", isTown: true, pop: 7, focus: "PROJECT_TOWN_PRODUCTION", foodSent: 4, connected: [] },
        { owner: 0, x: 6, y: 14, name: "Village", isTown: true, pop: 4, connected: [0] },
    ],
});
const { foodNetwork, runEmpireOverview, focusKeyOf } = await import("../mod/expansion-planner/ui/data/xpl-empire-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("food flows from towns with a Focus to every connected city", () => {
    const n = foodNetwork();
    assert.deepEqual(n.links.map((l) => [l.from, l.to, l.amount]).sort(), [["10-9", "15-5", 3], ["10-9", "5-5", 3]]);
    const athens = n.cities.find((c) => c.name === "Athens");
    assert.equal(athens.received, 3);
    const island = n.towns.find((t) => t.name === "Island");
    assert.ok(island.exporting && island.to.length === 0, "a Focus but nobody to feed");
    const village = n.towns.find((t) => t.name === "Village");
    assert.equal(village.exporting, false, "a Growing town keeps its food");
    assert.equal(n.towns.find((t) => t.name === "Fields").focusKey, "FARM");
    assert.equal(focusKeyOf("PROJECT_TOWN_FORT"), "OTHER");
});

test("overview rows: cities first, food received, towns with Focus, recommendation and warnings", () => {
    const o = runEmpireOverview(DEFAULT_SETTINGS);
    assert.deepEqual(o.rows.map((r) => r.name), ["Athens", "Thebes", "Fields", "Island", "Village"]);
    assert.deepEqual(o.totals, { cities: 2, towns: 3, foodSent: 6, lonely: 1, growing: 1 });
    const thebes = o.rows.find((r) => r.name === "Thebes");
    assert.deepEqual(thebes.from, ["Fields"]);
    const fields = o.rows.find((r) => r.name === "Fields");
    assert.equal(fields.focus, "PROJECT_TOWN_GRANARY");
    assert.deepEqual(fields.to.sort(), ["Athens", "Thebes"]);
    const athens = o.rows.find((r) => r.name === "Athens");
    assert.equal(athens.strongest, "YIELD_PRODUCTION"); // 20 vs the average 14
    assert.equal(thebes.strongest, null);
});

test("a map line between two plots steps through neighbours", () => {
    const g = new HexGrid(30, 20, false);
    const map = { neighbours: (i) => g.neighbours(i), distance: (a, b) => g.distance(a, b) };
    const a = g.index(3, 4);
    const b = g.index(9, 7);
    const line = hexLine(map, a, b);
    assert.equal(line[0], a);
    assert.equal(line.at(-1), b);
    assert.equal(line.length, g.distance(a, b) + 1);
    for (let i = 1; i < line.length; i++) assert.ok(g.neighbours(line[i - 1]).includes(line[i]));
});
