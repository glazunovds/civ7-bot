// Game 60 (Antiquity): the Hanging Gardens (tier S), ordered at A66 in the capital, never reached production. Walls, Slingers for
// towns and a settler kept the front for 14 turns; the race ignored that wait; the wonder held one of the two wonder slots; and
// Mexico, who started them 8 turns after our order, finished them at T81 (0 returned). The Colosseum was dropped as AGE_ENDS the
// pass after its order (13 turns with 15 left, then a turn over). Refunds were measured by a building's whole cost (a Monument at
// 86% "kept" a refund it had 14 of room for), and the Ha'amonga a Maui's 164 went into walls that had passed it.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";

const W = 26, H = 16;
const grid = new HexGrid(W, H, false);
const A = { x: 6, y: 8 };
const B = { x: 16, y: 8 };
const tileNear = (c, dx) => grid.index(c.x + dx, c.y);
const world = {
    width: W, height: H, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: [A, B].some((c) => grid.distanceXY(x, y, c.x, c.y) <= 2) ? 0 : -1 }),
    structures: (x, y) => ([A, B].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: A.x, y: A.y, name: "Athens", pop: 8, prod: 30 },
        { owner: 0, x: B.x, y: B.y, name: "Sparta", pop: 6, prod: 20 },
        { owner: 1, x: 22, y: 3, name: "Babylon", pop: 6, prod: 20 },
    ],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100),
    canBuild: (type, id, args) => {
        if (type === undefined) return { Success: true }; // queue moves
        if (!type.startsWith("WONDER_")) return { Success: true, Plots: [], ExpandUrbanPlots: [] };
        if (!["WONDER_PYRAMIDS", "WONDER_HANGING_GARDENS"].includes(type)) return { Success: false, Plots: [], FailureReasons: ["LOC_LOCKED"] };
        const c = id.id === 0 ? A : B;
        return { Success: true, Plots: [tileNear(c, 1), tileNear(c, -1)], ExpandUrbanPlots: [] };
    },
    agePoints: 20,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { runWonderPlanner } = await import("../mod/expansion-planner/ui/data/xpl-wonder-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const OMNISCIENT = { ...DEFAULT_SETTINGS, wonders: { omniscient: true } };
const athens = world.cities[0];
const babylon = world.cities[2];
const ATHENS = `c:${A.x}-${A.y}`;
const SPARTA = `c:${B.x}-${B.y}`;
const { MoveTo, RemoveAt } = CityOperationsParametersValues;
const queueOps = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode !== undefined).map((s) => (s.args.InsertMode === MoveTo ? ["move", s.args.QueueSourceLocation, s.args.QueueDestinationLocation] : ["remove", s.args.QueueLocation]));
const capture = (fn) => {
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        console.warn = warn;
    }
    return lines;
};
const turn = Game.turn;
beforeEach(() => {
    steps.resetWonderOrders();
    Game.turn = turn;
    for (const c of world.cities) for (const k of ["queue", "queued", "progress"]) delete c[k];
    delete world.wonders;
    delete world.turnsFor;
    fake.sent.length = 0;
});

test("the wait counts when a wonder is chosen: not ordered where walls and units hold the queue over 3 turns; UI.log says so (game 60: the Hanging Gardens)", () => {
    athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 2, pct: 50 };
    athens.queued = ["UNIT_SLINGER"]; // 100 at 30 a turn: 4 turns
    let picks;
    const lines = capture(() => {
        picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
    });
    assert.deepEqual([...picks.keys()], [SPARTA], "Athens waits 6 turns: Sparta, 15 turns, takes it");
    assert.ok(lines.some((l) => /wonders: WONDER_\w+ not ordered in Athens: walls\/units hold its queue 6 turns/.test(l)), JSON.stringify(lines));
    athens.queued = [];
    assert.deepEqual([...steps.chooseWonders(DEFAULT_SETTINGS, 1).keys()], [ATHENS], "the walls' 2 turns alone: Athens, at 12");
});

test("the race is judged at the ETA after the wait (game 60: Mexico started the Hanging Gardens 8 turns after our order and won)", () => {
    world.wonders = [{ owner: 1, type: "WONDER_PYRAMIDS", x: 22, y: 3 }]; // built: only the Hanging Gardens are left
    babylon.queue = { type: "WONDER_HANGING_GARDENS", turns: 12 };
    assert.deepEqual([...steps.chooseWonders(OMNISCIENT, 1).keys()], [ATHENS], "ours in 10, the rival's in 12: a race we can win");
    athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 2, pct: 50 };
    steps.resetWonderOrders();
    assert.equal(steps.chooseWonders(OMNISCIENT, 1).size, 0, "2 turns of walls first: 12 against 12, lost");
});

test("a wonder that gets no production for 5 turns leaves the queue, its slot freed; one holding more than a turn's production stays", () => {
    athens.queue = { type: "UNIT_SLINGER", turns: 3 };
    athens.queued = ["WONDER_PYRAMIDS"];
    const pass = () => {
        fake.sent.length = 0;
        runWonderPlanner(DEFAULT_SETTINGS);
        return steps.cashOutLostWonders();
    };
    assert.deepEqual(pass(), [], "first seen");
    Game.turn = turn + 4;
    assert.deepEqual(pass(), [], "4 turns");
    Game.turn = turn + 5;
    const out = pass();
    assert.deepEqual(queueOps(), [["remove", 1]]);
    assert.deepEqual(out.map((e) => [e.key, e.args[2]]), [["WONDER_STARVED", 5]]);
    // 20% of 300 = 60, over a turn's 30: it stays.
    steps.resetWonderOrders();
    athens.progress = { WONDER_PYRAMIDS: 20 };
    Game.turn = turn;
    pass();
    Game.turn = turn + 6;
    assert.deepEqual(pass(), []);
    assert.deepEqual(queueOps(), []);
});

test("a race lost behind other items, its wait counted: the wonder with nothing in it leaves the queue (game 60: the Hanging Gardens held a slot until Mexico finished them)", () => {
    babylon.queue = { type: "WONDER_PYRAMIDS", turns: 12 };
    world.turnsFor = (c, type) => (type === "WONDER_PYRAMIDS" ? 10 : -1); // ours 10 alone
    athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 3, pct: 10 };
    athens.queued = ["WONDER_PYRAMIDS"];
    runWonderPlanner(OMNISCIENT);
    const out = steps.cashOutLostWonders();
    assert.deepEqual(queueOps(), [["remove", 1]], "10 turns + 3 of walls: 13 against the rival's 12");
    assert.equal(out[0]?.key, "WONDER_DROPPED");
});

test("one turn past the age's end is lost only if it still is the next turn; two turns past, at once (game 60: the Colosseum dropped the pass after its order)", () => {
    athens.queued = ["BUILDING_LIBRARY"];
    const pass = () => {
        fake.sent.length = 0;
        runWonderPlanner(DEFAULT_SETTINGS);
        return steps.cashOutLostWonders().map((e) => e.key);
    };
    const left = Number(runWonderPlanner(DEFAULT_SETTINGS).ageTurnsLeft);
    assert.ok(left > 0 && left < 200, String(left));
    athens.queue = { type: "WONDER_PYRAMIDS", turns: left + 1, pct: 10 };
    assert.deepEqual(pass(), [], "a turn over: not yet");
    Game.turn = turn + 1;
    athens.queue.turns = Number(runWonderPlanner(DEFAULT_SETTINGS).ageTurnsLeft) + 1;
    assert.deepEqual(pass(), ["WONDER_CASHED_OUT"], "still over the next turn");
    steps.resetWonderOrders();
    athens.queue.turns = Number(runWonderPlanner(DEFAULT_SETTINGS).ageTurnsLeft) + 2;
    assert.deepEqual(pass(), ["WONDER_CASHED_OUT"], "two turns over: at once");
});

test("no unit passes an item done this turn, but a defender of a centre below half its health (game 60: Slingers ahead of walls at 85-98%)", () => {
    athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 1, pct: 85 };
    athens.queued = ["UNIT_SLINGER"];
    const threat = (extra = {}) => ({ settlement: { name: "Athens", ...A }, count: 2, land: 2, owners: [{ id: 5, independent: true }], ...extra });
    steps.resetWar();
    steps.frontLoadUnits({ defend: true, threats: [threat()] });
    assert.deepEqual(queueOps(), [], "the walls are done this turn");
    fake.sent.length = 0;
    steps.frontLoadUnits({ defend: true, threats: [threat({ damaged: true, health: 40, maxHealth: 100 })] });
    assert.deepEqual(queueOps(), [["move", 1, 0]], "its centre at 40 of 100");
});

test("a lost wonder's refund is measured by the room a building has left: the Library, not a Monument at 86%, stands behind the wonder (game 60)", () => {
    const costOf = world.costOf;
    world.costOf = (type) => (type.startsWith("WONDER_") ? 300 : type === "BUILDING_MONUMENT" ? 120 : type === "BUILDING_LIBRARY" ? 110 : 100);
    try {
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 5, pct: 50 }; // a refund of 150 / 2 + 30
        athens.queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY"];
        athens.progress = { BUILDING_MONUMENT: 86 }; // room 17
        runWonderPlanner(DEFAULT_SETTINGS);
        steps.frontLoadUnits({});
        assert.deepEqual(queueOps(), [["move", 2, 1]]);
    } finally {
        world.costOf = costOf;
    }
});

test("an absorber keeps no more than its room: a Monument at 61% (38 left) keeps less of a 44 than a fresh 60-cost building (game 60: the Great Stele)", async () => {
    const { bestAbsorber } = await import("../mod/expansion-planner/ui/core/xpl-wonder-race.js");
    const best = bestAbsorber([{ type: "BUILDING_MONUMENT", cost: 99, room: 38.6 }, { type: "BUILDING_GRANARY", cost: 60, room: 60 }], 44);
    assert.deepEqual([best.type, best.keeps], ["BUILDING_GRANARY", 44]);
    assert.equal(bestAbsorber([{ type: "BUILDING_LIBRARY", cost: 90 }], 44).keeps, 44, "no room given: its cost");
});

test("a raced wonder with progress waiting behind an item with less room than its refund: UI.log says so (game 60, row 110: the Ha'amonga a Maui's 164 into walls at 89 of 100)", () => {
    athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 2, pct: 33 };
    athens.queued = ["WONDER_PYRAMIDS"];
    athens.progress = { WONDER_PYRAMIDS: 87 };
    runWonderPlanner(DEFAULT_SETTINGS);
    const lines = capture(() => steps.frontLoadUnits({}));
    assert.ok(lines.some((l) => l.includes("WONDER_PYRAMIDS waits behind BUILDING_ANCIENT_WALLS with 261 production in it: a rival finishing it would pour about 161 into BUILDING_ANCIENT_WALLS, which has room for 67")), JSON.stringify(lines));
});

test("a unit queued behind a building passes a wonder no race protects (frontLoadUnits): its turns count; a raced wonder keeps the front from it", () => {
    Game.turn = turn + 20; // UI.log's line comes once a turn (the first test's was this file's first turn)
    athens.queue = { type: "BUILDING_LIBRARY", turns: 2, pct: 40 };
    athens.queued = ["BUILDING_MONUMENT", "UNIT_SETTLER"]; // 100 at 30 a turn: 4 turns
    let picks;
    const lines = capture(() => {
        picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
    });
    assert.deepEqual([...picks.keys()], [SPARTA], "no rival: the settler goes first, 4 turns");
    assert.ok(lines.some((l) => /wonders: WONDER_\w+ not ordered in Athens: walls\/units hold its queue 4 turns/.test(l)), JSON.stringify(lines));
    // A rival 12 turns from the Hanging Gardens (omniscient): holdsFront keeps the settler behind ours (10 + 4 + 1 >= 12).
    world.wonders = [{ owner: 1, type: "WONDER_PYRAMIDS", x: 22, y: 3 }];
    babylon.queue = { type: "WONDER_HANGING_GARDENS", turns: 12 };
    steps.resetWonderOrders();
    assert.deepEqual([...steps.chooseWonders(OMNISCIENT, 1).keys()], [ATHENS]);
});

test("a queued wonder's own turns behind other items: the lesser of the game's number and ours, so a wait the game counts is not counted twice; UI.log compares them", () => {
    babylon.queue = { type: "WONDER_PYRAMIDS", turns: 14 };
    world.turnsFor = (c, type) => (type === "WONDER_PYRAMIDS" ? 13 : -1); // ours 10 alone, and the walls' 3 if the game counts them
    athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 3, pct: 10 };
    athens.queued = ["WONDER_PYRAMIDS"];
    runWonderPlanner(OMNISCIENT);
    let out;
    const lines = capture(() => {
        out = steps.cashOutLostWonders();
    });
    assert.deepEqual([queueOps(), out], [[], []], "10 + 3 against the rival's 14: not lost");
    assert.ok(lines.some((l) => l.includes("wonders: probe: WONDER_PYRAMIDS at 1 in Athens's queue") && l.includes("the game's turns left 13, ours 10, the wait ahead 3")), JSON.stringify(lines));
});

test("one turn past the age's end on its first turn: still lost at once to a rival who finishes first; a wonder ordered again starts its turn afresh", () => {
    athens.queued = ["BUILDING_LIBRARY"];
    const pass = (settings) => {
        fake.sent.length = 0;
        runWonderPlanner(settings);
        return steps.cashOutLostWonders().map((e) => e.key);
    };
    const leftNow = () => Number(runWonderPlanner(DEFAULT_SETTINGS).ageTurnsLeft);
    babylon.queue = { type: "WONDER_PYRAMIDS", turns: 3 };
    athens.queue = { type: "WONDER_PYRAMIDS", turns: leftNow() + 1, pct: 10 };
    assert.deepEqual(pass(OMNISCIENT), ["WONDER_CASHED_OUT"], "the rival's 3 turns: lost now");
    delete babylon.queue;
    steps.resetWonderOrders();
    assert.deepEqual(pass(DEFAULT_SETTINGS), [], "a turn over, its first turn");
    // Out of the queue (the cash-out's), then ordered again 5 turns later a turn over: its first turn again.
    Game.turn = turn + 1;
    athens.queue = { type: "BUILDING_LIBRARY", turns: 4 };
    athens.queued = [];
    assert.deepEqual(pass(DEFAULT_SETTINGS), []);
    Game.turn = turn + 5;
    athens.queue = { type: "WONDER_PYRAMIDS", turns: leftNow() + 1, pct: 10 };
    athens.queued = ["BUILDING_LIBRARY"];
    assert.deepEqual(pass(DEFAULT_SETTINGS), [], "ordered again: not lost on its first turn");
});

test("an item stuck at 100% does not keep the front from a defender as an item done this turn would (root gotcha 77)", () => {
    athens.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 100 };
    athens.queued = ["UNIT_SLINGER"];
    const threat = { settlement: { name: "Athens", ...A }, count: 2, land: 2, owners: [{ id: 5, independent: true }] };
    steps.resetWar();
    steps.frontLoadUnits({ defend: true, threats: [threat] });
    assert.deepEqual(queueOps(), [], "first seen at 100%: done this turn");
    Game.turn = turn + 1;
    fake.sent.length = 0;
    steps.frontLoadUnits({ defend: true, threats: [threat] });
    assert.deepEqual(queueOps(), [["move", 1, 0]], "still at 100% the next turn: stuck, the defender goes first");
});
