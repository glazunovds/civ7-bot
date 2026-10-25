// Probes of the building plan for the next review (game 60: no Library in 140 turns and no line showed where the plan ranked
// it; layouts annealed +0 to +2.5 and nothing showed whether they paid; 55 new citizens went onto tiles, 0 to specialists, and
// GROWTH_TILE carried only the city and the tile's score).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const R = { x: 4, y: 4 };
const world = {
    width: 20, height: 12, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: x === 5 && y === 4 ? { YIELD_SCIENCE: 3, YIELD_FOOD: 2 } : { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: Math.abs(x - R.x) <= 2 && Math.abs(y - R.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === R.x && y === R.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, ...R, name: "Rome", pop: 6, prod: 12, food: 8, happy: 6 }],
    owningCity: (x, y) => (Math.abs(x - R.x) <= 2 && Math.abs(y - R.y) <= 2 ? { owner: 0, id: 0, type: 1 } : null),
};
installFakeEngine(world);
const probes = await import("../mod/expansion-planner/ui/data/xpl-plan-probes.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const TYPES = ["BUILDING_GRANARY", "BUILDING_MONUMENT", "BUILDING_SAW_PIT", "BUILDING_BRICKYARD", "BUILDING_BARRACKS", "BUILDING_ALTAR", "BUILDING_LIBRARY"];
const row = (type, i) => ({
    sid: `c:${R.x}-${R.y}`, type, x: 5, y: 4 + (i % 2), eta: 3 + 4 * i, net: 2 + i, value: 2 + i,
    base: [0, 0, 0, type === "BUILDING_LIBRARY" ? 2 : 0, 0, 0, 0], adjacency: [0, 0, 0, type === "BUILDING_LIBRARY" ? 2 : 0, 0, 0, 0], quarter: type === "BUILDING_LIBRARY",
    engineYields: type === "BUILDING_LIBRARY" ? [0, 0, 0, 4, 0, 0, 0] : null,
});
state.set({ results: { ...state.get().results, plans: { placements: TYPES.map(row), fillers: [], horizon: 60, timeAware: true } } });
function capture(fn) {
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        return { out: fn(), lines };
    } finally {
        console.warn = warn;
    }
}

test("every 10 turns UI.log names each settlement's first 6 planned buildings in build order (game 60: where was the Library?)", () => {
    Game.turn = 40;
    const { out } = capture(() => probes.logPlanOrder());
    assert.equal(out.length, 1);
    assert.ok(out[0].startsWith("plan: Rome: BUILDING_GRANARY T+3 2, BUILDING_MONUMENT T+7 3,"), out[0]);
    assert.ok(out[0].includes("BUILDING_ALTAR T+23 7 (+1 more)"), out[0]);
    assert.ok(!out[0].includes("BUILDING_LIBRARY"), "the 7th");
    Game.turn = 41;
    assert.deepEqual(capture(() => probes.logPlanOrder()).out, []);
});

test("a building of ours completed: the plan's adjacency there against the game's numbers and the tile now (the buildings audit)", () => {
    const { lines } = capture(() => engine.trigger("ConstructibleBuildCompleted", { constructible: { owner: 0, id: 7, type: 1 }, constructibleType: C("BUILDING_LIBRARY"), location: { x: 5, y: 4 } }));
    const line = lines.find((l) => l.includes("buildings audit:"));
    assert.ok(line?.includes("buildings audit: Rome BUILDING_LIBRARY at 5,4: planned here: adjacency +2 (S2), base S2, ETA T+27, quarter yes; the game's placement then +4 (S4); tile now 5 (F2 S3)"), line);
    // Elsewhere than planned; not in the plan; another player's: said, said, nothing.
    let r = capture(() => engine.trigger("ConstructibleBuildCompleted", { constructible: { owner: 0 }, constructibleType: C("BUILDING_GRANARY"), location: { x: 3, y: 4 } }));
    assert.ok(r.lines.some((l) => l.includes("BUILDING_GRANARY at 3,4: planned at 5,4 (adjacency +0)")), r.lines.join(" | "));
    r = capture(() => engine.trigger("ConstructibleBuildCompleted", { constructible: { owner: 0 }, constructibleType: C("BUILDING_ARENA"), location: { x: 3, y: 4 } }));
    assert.ok(r.lines.some((l) => l.includes("BUILDING_ARENA at 3,4: not in the plan")), r.lines.join(" | "));
    r = capture(() => engine.trigger("ConstructibleBuildCompleted", { constructible: { owner: 1 }, constructibleType: C("BUILDING_LIBRARY"), location: { x: 5, y: 4 } }));
    assert.ok(!r.lines.some((l) => l.includes("buildings audit")), r.lines.join(" | "));
    r = capture(() => engine.trigger("ConstructibleBuildCompleted", { constructible: { owner: 0 }, constructibleType: C("IMPROVEMENT_FARM"), location: { x: 5, y: 5 } }));
    assert.ok(!r.lines.some((l) => l.includes("buildings audit")), "not a building");
});

test("GROWTH_TILE carries the best specialist's gain and both tiles next to the tile's score", () => {
    const rome = world.cities[0];
    rome.readyToGrow = true;
    world.expand = () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(6, 4)], ConstructibleTypes: [] });
    world.workers = () => [{ PlotIndex: GameplayMap.getIndexFromXY(5, 4), IsBlocked: false, NumWorkers: 0, MaxWorkers: 1, CurrentYields: [0, 0, 0, 0, 0, 0, 0], NextYields: [0, 0, 0, 1, 0, 0, 0], CurrentMaintenance: [0, 0, 0, 0, 0, 0, 0], NextMaintenance: [2, 0, 0, 0, 0, 2, 0] }];
    try {
        const out = steps.placeGrowth(DEFAULT_SETTINGS);
        const e = out.find((x) => x.key === "GROWTH_TILE");
        assert.ok(e, JSON.stringify(out));
        assert.equal(e.args.length, 5, JSON.stringify(e.args));
        assert.match(String(e.args[2]), /^[+-]\d/, "the specialist's gain");
        assert.deepEqual([e.args[3], e.args[4]], ["6,4", "5,4"]);
    } finally {
        delete rome.readyToGrow;
        delete world.expand;
        delete world.workers;
    }
});
