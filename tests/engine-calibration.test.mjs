// The plan follows the game's own adjacency numbers on tiles the city can build on now,
// unless most of them disagree with our rules (then we suspect our reading, not the rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
let engineScience = new Map(); // plot -> Library science adjacency the game reports
const fake = installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 1 && Math.abs(y - C.y) <= 1 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
    placements: () => {
        const sci = GameInfo.Yields.lookup("YIELD_SCIENCE");
        const placements = [];
        for (const plotID of ring1()) {
            const adj = engineScience.get(plotID) ?? 0;
            const yieldChanges = Array.from(GameInfo.Yields, () => 0);
            yieldChanges[sci.$index] = 2 + adj; // base + adjacency
            const changeDetails = adj ? [{ sourceType: 1, sourcePlotIndex: -1, targetPlotIndex: plotID, yieldType: sci.$hash, change: adj }] : [];
            placements.push({ plotID, yieldChanges, changeDetails });
        }
        return { buildings: [{ constructibleType: GameInfo.Constructibles.lookup("BUILDING_LIBRARY").$hash, placements }] };
    },
});
const ring1 = () => fake.grid.neighbours(fake.grid.index(C.x, C.y));
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
// Each test changes the game's numbers in the same turn without a game event: forget
// the planner's per-turn cache of them (in the game a change always comes with an event).
const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_LIBRARY"], futureTiles: false, timeAware: false } };

async function plan() {
    clearEngineCache();
    await startBuildingPlan(listTargets()[0], settings).promise;
    return state.get().results.plans.placements.find((p) => p.type === "BUILDING_LIBRARY");
}

test("a tile the game rates higher wins, and its adjacency shows the game's number", async () => {
    const best = ring1()[4];
    engineScience = new Map([[best, 2]]);
    const lib = await plan();
    assert.equal(lib.idx, best);
    assert.equal(lib.adjacency[3], 2); // science adjacency as the game reports it
    assert.equal(lib.bestNow, null);
});

test("if most tiles disagree, our rules stay and the row names the game's best tile", async () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...a) => warnings.push(a.join(" "));
    const tiles = ring1();
    engineScience = new Map([[tiles[0], 1], [tiles[1], 1], [tiles[2], 1], [tiles[5], 3]]);
    let lib;
    try {
        lib = await plan();
    } finally {
        console.warn = warn;
    }
    assert.ok(warnings.some((w) => w.includes("NOT applied")), warnings.join("\n"));
    assert.notEqual(lib.idx, tiles[5]);
    assert.equal(lib.bestNow?.x, fake.grid.x(tiles[5]));
    assert.equal(lib.bestNow?.y, fake.grid.y(tiles[5]));
    assert.deepEqual(lib.bestNow.takenBy, []);
});
