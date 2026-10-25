// Game 60 (adjacency F9): at A136 a Monument repair went ahead of the capital's Altar (AGE_END_FIRST), and the Altar was lost at
// 107 of 121 when Antiquity ended. By the game's own count (×1.15 production on its rows) the Altar was done in 3 turns with 3
// left; ours said 4, and a 1-turn margin on a clock that rose exactly one point a turn left none. The capital was in unrest, so the
// Altar, the Happiness building it needed, could not be bought either.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const COSTS = { BUILDING_BATH: 313, BUILDING_ALTAR: 121, BUILDING_LIBRARY: 90, BUILDING_MONUMENT: 22 };
const world = {
    width: 24, height: 14, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - 6) <= 2 && Math.abs(y - 6) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === 6 && y === 6 ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 6, y: 6, name: "Athens", pop: 8, prod: 25 }],
    costOf: (type) => COSTS[type] ?? 100,
    canBuild: () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(7, 6)], ExpandUrbanPlots: [] }),
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { ageOutlook } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
const { exactClock } = await import("../mod/expansion-planner/ui/core/xpl-town-advisor.js");
const { getRules } = await import("../mod/expansion-planner/ui/data/xpl-rules-loader.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const athens = world.cities[0];
const { MoveTo } = CityOperationsParametersValues;
const moves = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === MoveTo).map((s) => [s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
const plan = (types) => state.set({ results: { ...state.get().results, plans: { placements: types.map((type) => ({ sid: "c:6-6", type, x: 7, y: 6, locked: false })) } } });
const SAMPLES = Database.makeHash("_XPL_OBJ_AGE_SAMPLES");

/** About `left` turns before the age ends, no pace known yet (that share of 120 turns). */
function ageLeft(left) {
    GameTutorial.setProperty(SAMPLES, null);
    world.agePoints = 100 - (left / 120) * 100;
}
/** `left` turns before the age ends on a clock that rose one point a turn over the last 6 turns. */
function exactLeft(left) {
    const points = 100 - left;
    const samples = [5, 4, 3, 2, 1, 0].map((d) => ({ turn: Game.turn - d, points: points - d }));
    GameTutorial.setProperty(SAMPLES, JSON.stringify({ age: getRules().age, samples, lastTurns: null }));
    world.agePoints = points;
}
function reset() {
    for (const k of ["queue", "queued", "progress", "unrest", "infected"]) delete athens[k];
    delete world.turnsFor;
    delete world.agePoints;
    GameTutorial.setProperty(SAMPLES, null);
    plan([]);
    fake.sent.length = 0;
}

test("the exact clock: one point a turn over the last 5 turns, the last sample now's", () => {
    const s = (pts) => pts.map((p, i) => ({ turn: 10 + i, points: p }));
    assert.equal(exactClock(s([90, 91, 92, 93, 94, 95]), 95, 100), true);
    assert.equal(exactClock(s([90, 91, 92, 93, 95, 96]), 96, 100), false, "a jump of 2");
    assert.equal(exactClock(s([91, 92, 93, 94, 95]), 95, 100), false, "4 turns only");
    assert.equal(exactClock(s([90, 91, 92, 93, 94, 95]), 96, 100), false, "not now's points");
    try {
        exactLeft(4);
        const o = ageOutlook();
        assert.deepEqual([o.turnsLeft, o.exact], [4, true]);
        ageLeft(4);
        assert.equal(ageOutlook().exact, false);
    } finally {
        reset();
    }
});

test("on an exact clock nothing is kept before the age's end: an item done on its last turn is done in time", () => {
    try {
        athens.queue = { type: "BUILDING_BATH", turns: 13, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY"]; // 90 at 25 a turn: 4 turns
        exactLeft(4);
        const out = steps.ageEndOrder();
        assert.deepEqual(moves(), [[1, 0]], JSON.stringify(out));
        assert.equal(out[0]?.key, "AGE_END_FIRST");
        fake.sent.length = 0;
        ageLeft(4);
        steps.ageEndOrder();
        assert.deepEqual(moves(), [], "4 turns with 4 left and a turn's margin: not in time");
    } finally {
        reset();
    }
});

test("no cheaper item goes ahead of a head the game's own count finishes in time (game 60: the capital's Altar, 3 turns by the game's count with 3 left)", () => {
    try {
        athens.queue = { type: "BUILDING_ALTAR", turns: 3, pct: 0 }; // 121 at 25: 5 turns by ours, 3 by the game's
        athens.queued = ["BUILDING_MONUMENT"];
        ageLeft(3);
        assert.deepEqual(steps.ageEndOrder(), []);
        assert.deepEqual(moves(), []);
    } finally {
        reset();
    }
});

test("an item's turns are the game's own when it answers: a planned Library 2 turns by its count, 4 by ours, is queued with 4 turns left", () => {
    try {
        plan(["BUILDING_LIBRARY"]);
        world.turnsFor = (c, type) => (type === "BUILDING_LIBRARY" ? 2 : -1);
        ageLeft(4);
        const out = steps.fillProduction(new Map(), {});
        assert.ok(out.some((e) => e.key === "QUEUED_PLAN"), JSON.stringify(out));
    } finally {
        reset();
    }
});

test("in an age's last turns a Happiness building goes first in a settlement in unrest (it cannot be bought there)", () => {
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY", "BUILDING_ALTAR"]; // the Altar: 5 turns
        ageLeft(9);
        assert.deepEqual(steps.ageEndOrder(), [], "no unrest: nothing");
        athens.unrest = true;
        const out = steps.ageEndOrder();
        assert.deepEqual(moves(), [[2, 0]]);
        assert.equal(out[0]?.key, "AGE_END_HAPPINESS");
        fake.sent.length = 0;
        ageLeft(40);
        assert.deepEqual(steps.ageEndOrder(), [], "mid-age: nothing");
    } finally {
        reset();
    }
});

// The integration review of game 60's packages: unrest from the plague is no revolt risk (the revolt guard's `plague`): no
// Happiness building ends it, so none goes ahead of the head for it.
test("in an age's last turns unrest from the plague moves no Happiness building to the front", () => {
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY", "BUILDING_ALTAR"];
        ageLeft(9);
        athens.unrest = true;
        athens.infected = true;
        assert.deepEqual(steps.ageEndOrder(), []);
        assert.deepEqual(moves(), []);
    } finally {
        reset();
    }
});

test("the Happiness building goes behind a unit or walls at the front, never ahead of an item done this turn (they would take turns at the front)", () => {
    try {
        athens.unrest = true;
        ageLeft(9);
        const run = (queue, queued) => {
            athens.queue = queue;
            athens.queued = queued;
            fake.sent.length = 0;
            return steps.ageEndOrder().map((e) => e.key);
        };
        assert.deepEqual([run({ type: "UNIT_SLINGER", turns: 2, pct: 30 }, ["BUILDING_ALTAR"]), moves()], [[], []], "a defender at the front");
        assert.deepEqual([run({ type: "BUILDING_ANCIENT_WALLS", turns: 2, pct: 30 }, ["BUILDING_ALTAR"]), moves()], [[], []], "walls at the front");
        assert.deepEqual([run({ type: "BUILDING_LIBRARY", turns: 1, pct: 80 }, ["BUILDING_ALTAR"]), moves()], [[], []], "a Library done this turn");
        assert.deepEqual([run({ type: "UNIT_SLINGER", turns: 2, pct: 30 }, ["BUILDING_LIBRARY", "BUILDING_ALTAR"]), moves()], [["AGE_END_HAPPINESS"], [[2, 1]]], "right behind the unit");
    } finally {
        reset();
    }
});
