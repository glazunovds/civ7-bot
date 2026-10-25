// Game 60 (adjacency F4): the capital trained Slingers for towns, settlers and walls from A40 to A79. Its queue was never empty,
// so the plan, which queues only into empty queues, queued nothing there from A24 to A93: 0% of its production went into
// buildings for 40 turns, and its first Monument came at A90. A queue that holds no building now gets the plan's next one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 24, height: 14, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - 6) <= 2 && Math.abs(y - 6) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === 6 && y === 6 ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 6, y: 6, name: "Athens", pop: 8, prod: 25 }],
    canBuild: () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(7, 6)], ExpandUrbanPlots: [] }),
    agePoints: 20,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const athens = world.cities[0];
const MONUMENT = () => GameInfo.Constructibles.lookup("BUILDING_MONUMENT").$hash;
state.set({ results: { ...state.get().results, plans: { placements: [{ sid: "c:6-6", type: "BUILDING_MONUMENT", x: 7, y: 6, locked: false }] } } });
const run = (queue, queued) => {
    athens.queue = queue;
    athens.queued = queued;
    fake.sent.length = 0;
    steps.resetWonderOrders(); // a new turn's tiles
    const out = steps.fillProduction(new Map(), {});
    return { keys: out.map((e) => e.key), monument: fake.sent.filter((s) => s.kind === "operation" && s.args.ConstructibleType === MONUMENT()).length };
};

test("a queue of units and walls gets the plan's next building behind them (game 60: the capital, A40-A79)", () => {
    assert.deepEqual(run({ type: "UNIT_SLINGER", turns: 3 }, ["BUILDING_ANCIENT_WALLS", "UNIT_SETTLER"]), { keys: ["QUEUED_PLAN"], monument: 1 });
    assert.deepEqual(run({ type: "BUILDING_ANCIENT_WALLS", turns: 2, pct: 40 }, []), { keys: ["QUEUED_PLAN"], monument: 1 }, "walls alone");
});

test("a queue that holds a building, a wonder or a project gets nothing more from the plan", () => {
    assert.deepEqual(run({ type: "UNIT_SLINGER", turns: 3 }, ["BUILDING_LIBRARY"]), { keys: [], monument: 0 });
    assert.deepEqual(run({ type: "UNIT_SLINGER", turns: 3 }, ["WONDER_PYRAMIDS"]), { keys: [], monument: 0 });
    assert.deepEqual(run({ type: "PROJECT_CHART_THE_STARS", turns: 3 }, []), { keys: [], monument: 0 });
    assert.deepEqual(run({ type: "UNIT_SLINGER", turns: 3 }, ["BUILDING_MONUMENT"]), { keys: [], monument: 0 }, "the plan's building queued already");
});

test("in an age's last turns the plan's share waits for the units and walls ahead of it: none that would not be done in time", () => {
    try {
        world.agePoints = 100 - (8 / 120) * 100; // about 8 turns left (no pace known yet)
        // The Monument, 100 at 25 a turn: 4 turns, behind a settler's 6.
        assert.deepEqual(run({ type: "UNIT_SETTLER", turns: 6 }, []), { keys: [], monument: 0 });
        assert.deepEqual(run({ type: "UNIT_SETTLER", turns: 2 }, []), { keys: ["QUEUED_PLAN"], monument: 1 }, "2 + 4 within 8 less a turn");
    } finally {
        world.agePoints = 20;
    }
});
