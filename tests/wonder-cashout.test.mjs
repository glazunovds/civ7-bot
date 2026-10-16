// Lost wonder races (research/27 §6). Game 20: Mexico started Petra 2 turns after us at twice our production and
// won it the turn we were 14 short; our 173 became 105 in a 90-cost Pagoda (a lost wonder refunds half its progress
// plus that turn's production into the next item, up to that item's cost), and the Weiyang Palace's 162 became 97 in
// 40-cost walls. A building goes ahead of a race we lose, so no more production goes into it. In game 21 the wonder
// kept its progress (research/28 §3); game 3 once saw a building take it (root gotcha 20), so the building chosen is
// the one that would keep the most.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const COSTS = { WONDER_PYRAMIDS: 300, BUILDING_MONUMENT: 60, BUILDING_LIBRARY: 90, BUILDING_ACADEMY: 200 };
const world = {
    width: 26, height: 16, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - 6) <= 2 && Math.abs(y - 8) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === 6 && y === 8 ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: 6, y: 8, name: "Athens", pop: 8, prod: 30, queue: { type: "WONDER_PYRAMIDS", turns: 5, pct: 50 }, queued: ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_ACADEMY"] },
        { owner: 1, x: 20, y: 8, name: "Tenochtitlan", pop: 8, prod: 60, queue: { type: "WONDER_PYRAMIDS", turns: 2, pct: 60 } },
    ],
    costOf: (type) => COSTS[type] ?? 100,
    canBuild: (type) => (type?.startsWith("WONDER_") ? { Success: true, InQueue: true, Plots: [], ExpandUrbanPlots: [] } : { Success: true, Plots: [], ExpandUrbanPlots: [] }),
    agePoints: 20,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { runWonderPlanner } = await import("../mod/expansion-planner/ui/data/xpl-wonder-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const OMNISCIENT = { ...DEFAULT_SETTINGS, wonders: { omniscient: true } };
const { MoveTo, RemoveAt } = CityOperationsParametersValues;
const queueOps = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode !== undefined);
function run(settings) {
    fake.sent.length = 0;
    runWonderPlanner(settings);
    return steps.cashOutLostWonders();
}

test("a rival finishing first (its own queue, omniscient): the building that would keep the most goes ahead of the wonder", () => {
    const out = run(OMNISCIENT);
    assert.deepEqual(queueOps().map((s) => s.args), [{ InsertMode: MoveTo, QueueSourceLocation: 3, QueueDestinationLocation: 0 }], "the Academy (200) keeps all 150, the Library only 90");
    assert.equal(out[0]?.key, "WONDER_CASHED_OUT");
    assert.deepEqual([out[0].args[2], out[0].args[4]], [150, 150]);
});

test("fair mode cannot see a rival's progress: the wonder goes on; a rival slower than us changes nothing", () => {
    assert.equal(run(DEFAULT_SETTINGS).length, 0);
    assert.equal(queueOps().length, 0);
    world.cities[1].queue.turns = 9;
    try {
        assert.equal(run(OMNISCIENT).length, 0, "we finish in 5, the rival in 9");
    } finally {
        world.cities[1].queue.turns = 2;
    }
});

test("a tie is cashed out too: the rival's production of a turn comes after our pass (game 22: the Shwedagon Pagoda, 79% done, lost to America by a turn)", () => {
    world.cities[1].queue.turns = 5; // ours 5 too
    try {
        const out = run(OMNISCIENT);
        assert.equal(out[0]?.key, "WONDER_CASHED_OUT", JSON.stringify(out));
    } finally {
        world.cities[1].queue.turns = 2;
    }
});

test("a lost wonder with nothing in it leaves the queue, so no more production goes into it", () => {
    world.cities[0].queue.pct = 0;
    try {
        const out = run(OMNISCIENT);
        assert.deepEqual(queueOps().map((s) => s.args), [{ InsertMode: RemoveAt, QueueLocation: 0 }]);
        assert.equal(out[0]?.key, "WONDER_DROPPED");
    } finally {
        world.cities[0].queue.pct = 50;
    }
});

test("the building behind a wonder can hold its refund: half its progress and a turn's production (game 20: 105 into a 90-cost Pagoda)", () => {
    world.cities[1].queue = null; // no rival: the wonder goes on
    world.cities[0].queue.pct = 60; // 180 of 300: a refund of 90 + 30
    runWonderPlanner(OMNISCIENT); // as each pass does before the refund guard
    try {
        fake.sent.length = 0;
        steps.frontLoadUnits({});
        assert.deepEqual(queueOps().map((s) => s.args), [{ InsertMode: MoveTo, QueueSourceLocation: 3, QueueDestinationLocation: 1 }], "the Academy, not the 60-cost Monument, stands behind it");
        world.cities[0].queued = ["BUILDING_ACADEMY", "BUILDING_MONUMENT"];
        fake.sent.length = 0;
        steps.frontLoadUnits({});
        assert.equal(queueOps().length, 0, "already big enough");
    } finally {
        world.cities[1].queue = { type: "WONDER_PYRAMIDS", turns: 2, pct: 60 };
        world.cities[0].queue.pct = 50;
        world.cities[0].queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_ACADEMY"];
    }
});

// Game 21 (research/28 §2-3).
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");

test("a lost race is not moved back to the front by the wonder step (game 21: Chicago's Serpent Mound went back and forth with its Dungeon)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    world.turnsFor = (c, type) => (type === "WONDER_PYRAMIDS" ? 5 : -1); // ours 5, the rival's 2
    try {
        // After the cash-out: the Academy in production, the lost Pyramids behind it.
        athens.queue = { type: "BUILDING_ACADEMY", turns: 6, pct: 10 };
        athens.queued = ["WONDER_PYRAMIDS", "BUILDING_MONUMENT"];
        runWonderPlanner(OMNISCIENT);
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        assert.deepEqual(queueOps().map((s) => s.args), []);
    } finally {
        delete world.turnsFor;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("within a pass a city's queue is edited once: a second move would read positions the game has not updated (game 21 T44: the settler's move put the Library ahead of the Mausoleum)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued, rival: world.cities[1].queue };
    world.cities[1].queue = null;
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY", "WONDER_PYRAMIDS"];
        runWonderPlanner(OMNISCIENT);
        steps.beginQueuePass();
        fake.sent.length = 0;
        steps.fillProduction(new Map()); // the Pyramids to the front
        steps.fillProduction(new Map()); // the same reading again (the end-of-turn retry)
        assert.deepEqual(queueOps().map((s) => [s.args.QueueSourceLocation, s.args.QueueDestinationLocation]), [[2, 0]]);
        steps.endQueuePass();
        steps.beginQueuePass();
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        assert.equal(queueOps().length, 1, "the next pass may move again");
    } finally {
        steps.endQueuePass();
        athens.queue = keep.queue;
        athens.queued = keep.queued;
        world.cities[1].queue = keep.rival;
    }
});

test("a lost race: the cash-out queues the plan's building once, the refund guard leaves it alone (game 21: two Dungeons in Chicago)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued, plans: state.get().results.plans };
    const plan = { placements: [{ sid: `c:6-8`, type: "BUILDING_ACADEMY", x: 7, y: 8, locked: false }] };
    try {
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 5, pct: 50 };
        athens.queued = [];
        state.set({ results: { ...state.get().results, plans: plan } });
        fake.sent.length = 0;
        run(OMNISCIENT); // the rival finishes in 2: lost
        steps.frontLoadUnits({});
        const academy = GameInfo.Constructibles.lookup("BUILDING_ACADEMY").$hash;
        assert.equal(fake.sent.filter((s) => s.kind === "operation" && s.args.ConstructibleType === academy).length, 1);
    } finally {
        state.set({ results: { ...state.get().results, plans: keep.plans } });
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("the refund guard queues a building once a pass, though the game's queue does not show it yet (the end-of-turn retry)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued, plans: state.get().results.plans, rival: world.cities[1].queue };
    const plan = { placements: [{ sid: `c:6-8`, type: "BUILDING_ACADEMY", x: 7, y: 8, locked: false }] };
    world.cities[1].queue = null; // no rival: the race goes on
    try {
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 5, pct: 50 };
        athens.queued = [];
        state.set({ results: { ...state.get().results, plans: plan } });
        runWonderPlanner(OMNISCIENT);
        steps.beginQueuePass();
        fake.sent.length = 0;
        steps.frontLoadUnits({});
        steps.frontLoadUnits({});
        const academy = GameInfo.Constructibles.lookup("BUILDING_ACADEMY").$hash;
        assert.equal(fake.sent.filter((s) => s.kind === "operation" && s.args.ConstructibleType === academy).length, 1);
    } finally {
        steps.endQueuePass();
        state.set({ results: { ...state.get().results, plans: keep.plans } });
        athens.queue = keep.queue;
        athens.queued = keep.queued;
        world.cities[1].queue = keep.rival;
    }
});
