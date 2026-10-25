// Game 60 (adjacency M1): Byrsa was ordered on Астрахань's worked mine (65,7), the mine just repaired six times, and the city
// lost 4-5 production a turn for the 30 turns it took. The wonder planner charged only half a tile's yields under a wonder, and a
// pillaged improvement read at its pillaged yields. An improved tile (a citizen works it) or a resource now costs all of them,
// a pillaged improvement its intact yields, and UI.log names the improvement a wonder replaces when it is ordered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";

const W = 22, H = 16;
const grid = new HexGrid(W, H, false);
const C = { x: 8, y: 8 };     // Athens
const MINE = { x: 10, y: 6 }; // next to a Library: the better wonder tile, but a worked mine
const PLAIN = { x: 5, y: 10 }; // no yields, and no tile of ours around it
const mineIdx = grid.index(MINE.x, MINE.y);
const L = (() => {
    const i = grid.neighbours(mineIdx)[0];
    return { x: grid.x(i), y: grid.y(i) };
})();
const tile = { production: 2.5, damaged: false };
const nextToPlain = (x, y) => grid.distanceXY(x, y, PLAIN.x, PLAIN.y) === 1;
const world = {
    width: W, height: H, wrapX: false,
    tiles: (x, y) => ({
        terrain: "TERRAIN_FLAT",
        yields: x === MINE.x && y === MINE.y ? (tile.damaged ? {} : { YIELD_PRODUCTION: tile.production }) : x === PLAIN.x && y === PLAIN.y ? {} : { YIELD_FOOD: 2 },
        owner: nextToPlain(x, y) ? 1 : grid.distanceXY(x, y, C.x, C.y) <= 3 ? 0 : -1,
    }),
    structures: (x, y) => {
        if (x === C.x && y === C.y) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] };
        if (x === L.x && y === L.y) return { district: "DISTRICT_URBAN", constructibles: ["BUILDING_LIBRARY"] };
        if (x === MINE.x && y === MINE.y) return { district: "DISTRICT_RURAL", constructibles: [{ type: "IMPROVEMENT_MINE", damaged: tile.damaged }] };
        return { district: null, constructibles: [] };
    },
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 6, prod: 20 }],
    costOf: (type) => (type.startsWith("WONDER_") ? 200 : 100),
    canBuild: (type) => {
        if (type === undefined) return { Success: true };
        if (!type.startsWith("WONDER_")) return undefined;
        return type === "WONDER_PYRAMIDS" ? { Success: true, Plots: [grid.index(PLAIN.x, PLAIN.y), mineIdx], ExpandUrbanPlots: [] } : { Success: false, Plots: [] };
    },
    agePoints: 20,
};
const fake = installFakeEngine(world);
const { runWonderPlanner } = await import("../mod/expansion-planner/ui/data/xpl-wonder-job.js");
const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const plotsOf = () => {
    clearEngineCache();
    return runWonderPlanner(DEFAULT_SETTINGS).rows.find((r) => r.type === "WONDER_PYRAMIDS").options[0].plots;
};
const first = () => {
    const p = plotsOf()[0];
    return `${p.x},${p.y}`;
};

test("a worked improvement under a wonder costs all its yields: the plain tile before a mine next to a Library", () => {
    const plots = plotsOf();
    const mine = plots.find((p) => p.x === MINE.x && p.y === MINE.y);
    assert.ok(mine.byYield.some((v) => v > 0), "the Library next to it gets the wonder's +1");
    assert.equal(first(), `${PLAIN.x},${PLAIN.y}`, JSON.stringify(plots.map((p) => [p.x, p.y, p.value, p.loss])));
    assert.deepEqual(mine.replaces, { type: "IMPROVEMENT_MINE", text: "production 2.5" });
    tile.production = 0.5; // a mine that gives next to nothing: the Library's +1 wins
    try {
        assert.equal(first(), `${MINE.x},${MINE.y}`);
    } finally {
        tile.production = 2.5;
    }
});

test("a pillaged improvement counts at the yields it gave intact (game 60: the mine at 65,7 was repaired six times)", () => {
    plotsOf(); // seen intact
    tile.damaged = true;
    try {
        const mine = plotsOf().find((p) => p.x === MINE.x && p.y === MINE.y);
        assert.ok(mine.loss > 0, JSON.stringify(mine));
        assert.equal(first(), `${PLAIN.x},${PLAIN.y}`);
    } finally {
        tile.damaged = false;
    }
});

test("UI.log names the improvement a wonder replaces when it is ordered there", () => {
    steps.resetWonderOrders();
    const picks = new Map([[`c:${C.x}-${C.y}`, { type: "WONDER_PYRAMIDS", name: "LOC_WONDER_PYRAMIDS_NAME", x: MINE.x, y: MINE.y, replaces: { type: "IMPROVEMENT_MINE", text: "production 3" }, plots: [], race: "HIGH" }]]);
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        fake.sent.length = 0;
        steps.fillProduction(picks);
    } finally {
        console.warn = warn;
    }
    assert.ok(lines.some((l) => l.includes(`wonders: WONDER_PYRAMIDS on ${MINE.x},${MINE.y} replaces IMPROVEMENT_MINE (yields production 3)`)), JSON.stringify(lines));
});
