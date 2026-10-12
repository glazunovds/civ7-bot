import { test } from "node:test";
import assert from "node:assert/strict";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";

test("every interior plot has 6 distinct neighbours at distance 1", () => {
    const g = new HexGrid(20, 12, false);
    for (const [x, y] of [[5, 4], [6, 5], [10, 7], [3, 2]]) {
        const idx = g.index(x, y);
        const n = g.neighbours(idx);
        assert.equal(new Set(n).size, 6);
        for (const m of n) assert.equal(g.distance(idx, m), 1, `(${x},${y}) -> ${g.x(m)},${g.y(m)}`);
    }
});

test("neighbour relation is symmetric", () => {
    const g = new HexGrid(16, 10, true);
    for (let idx = 0; idx < g.size; idx++) {
        for (const m of g.neighbours(idx)) assert.ok(g.neighbours(m).includes(idx));
    }
});

test("radius-3 footprint has 1 + 6 + 12 + 18 plots and ring = distance", () => {
    const g = new HexGrid(30, 20, false);
    const centre = g.index(12, 9);
    const r = g.radius(centre, 3);
    assert.equal(r.length, 37);
    const perRing = [0, 0, 0, 0];
    for (const { idx, ring } of r) {
        perRing[ring]++;
        assert.equal(g.distance(centre, idx), ring);
    }
    assert.deepEqual(perRing, [1, 6, 12, 18]);
});

test("horizontal wrap: plots on opposite edges are close", () => {
    const g = new HexGrid(20, 10, true);
    assert.equal(g.distance(g.index(0, 4), g.index(19, 4)), 1);
    assert.equal(new HexGrid(20, 10, false).distance(g.index(0, 4), g.index(19, 4)), 19);
});

test("map edges: no neighbours outside the grid", () => {
    const g = new HexGrid(10, 8, false);
    assert.equal(g.neighbours(g.index(0, 0)).length <= 3, true);
    assert.equal(g.radius(g.index(0, 0), 3).every(({ idx }) => idx >= 0 && idx < g.size), true);
});
