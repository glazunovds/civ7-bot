// A non-final age's last turns (research/29 §3): production in progress is lost at an age change. Game 22 lost 732 at
// the end of Exploration: Universities at 287 of 313 (two lancers had gone ahead of it), 258 of 266 and 109 of 313,
// and a settler at 77 of 115 queued 7 turns before the end; 100 at the end of Antiquity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

// 25 production: a Bath at a University's 313 takes 13 turns, the Academy 10, the Library 4, the Monument 3, a scout 2,
// a melee unit 4 (the Antiquity fixture has no University).
const COSTS = { BUILDING_BATH: 313, BUILDING_ACADEMY: 250, BUILDING_LIBRARY: 90, BUILDING_MONUMENT: 60, UNIT_SCOUT: 50 };
const world = {
    width: 24, height: 14, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - 6) <= 2 && Math.abs(y - 6) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === 6 && y === 6 ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [{ owner: 0, x: 6, y: 6, name: "Athens", pop: 8, prod: 25 }],
    costOf: (type) => COSTS[type] ?? 100,
    canBuild: () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(7, 6)], ExpandUrbanPlots: [] }),
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");
const athens = world.cities[0];
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const { MoveTo } = CityOperationsParametersValues;
const moves = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === MoveTo).map((s) => [s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
const builds = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => s.args.ConstructibleType ?? s.args.UnitType);
const units = (type) => builds().filter((h) => h === GameInfo.Units.lookup(type).$hash);
const plan = (types) => state.set({ results: { ...state.get().results, plans: { placements: types.map((type) => ({ sid: "c:6-6", type, x: 7, y: 6, locked: false })) } } });

/** About `left` turns before the age ends (no pace known yet: that share of 120 turns), final or not. */
function ageLeft(left, { final = false } = {}) {
    GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
    world.agePoints = 100 - (left / 120) * 100;
    world.finalAge = final;
}
function reset() {
    for (const k of ["queue", "queued", "trains", "progress"]) delete athens[k];
    for (const k of ["agePoints", "finalAge"]) delete world[k];
    GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
    plan([]);
    fake.sent.length = 0;
}

test("the item in production that is not done before the age ends gives way to the costliest queued one that is (game 22: Universities at 287 and 258 of 313 and 266)", () => {
    try {
        athens.queue = { type: "BUILDING_BATH", turns: 13, pct: 0 };
        athens.queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_ACADEMY"];
        ageLeft(8); // a turn early: the Library (4) and the Monument (3) are done, the Academy (10) is not
        const out = steps.ageEndOrder();
        assert.deepEqual(moves(), [[2, 0]], "the Library");
        assert.equal(out[0]?.key, "AGE_END_FIRST");
        // Mid-age: nothing.
        ageLeft(40);
        fake.sent.length = 0;
        assert.deepEqual(steps.ageEndOrder(), [], "40 left");
        // The final age: the game ends with it, and the production with it (research/30 §3).
        ageLeft(8, { final: true });
        fake.sent.length = 0;
        steps.ageEndOrder();
        assert.deepEqual(moves(), [[2, 0]], "the final age: the Library too");
        // Its own progress counted: done in time, it stays.
        ageLeft(8);
        athens.queue = { type: "BUILDING_BATH", turns: 3, pct: 80 };
        fake.sent.length = 0;
        assert.deepEqual(steps.ageEndOrder(), []);
        // A queued item's own progress counts too (an item moved back keeps it): the Academy at 80% (2 turns) goes first.
        athens.queue = { type: "BUILDING_BATH", turns: 13, pct: 0 };
        athens.progress = { BUILDING_ACADEMY: 80 };
        fake.sent.length = 0;
        steps.ageEndOrder();
        assert.deepEqual(moves(), [[3, 0]], "the Academy: 250 production in a finished building");
    } finally {
        reset();
    }
});

test("a repair in production stays: the repairs step moves it to the front every pass", () => {
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => ({ ...canBuild(type, id, args), RepairDamaged: type === "BUILDING_BATH" });
    try {
        athens.queue = { type: "BUILDING_BATH", turns: 13, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY"];
        ageLeft(8);
        assert.deepEqual(steps.ageEndOrder(), []);
        assert.deepEqual(moves(), []);
    } finally {
        world.canBuild = canBuild;
        reset();
    }
});

test("nothing queued is done before the age ends: the plan's costliest building that is gets queued, to go first next pass", () => {
    try {
        athens.queue = { type: "BUILDING_BATH", turns: 13, pct: 0 };
        athens.queued = ["BUILDING_ACADEMY"];
        plan(["BUILDING_ACADEMY", "BUILDING_MONUMENT", "BUILDING_LIBRARY"]);
        ageLeft(8);
        const out = steps.ageEndOrder();
        assert.deepEqual(builds(), [C("BUILDING_LIBRARY")]);
        assert.equal(out[0]?.key, "AGE_END_QUEUED");
    } finally {
        reset();
    }
});

test("an empty queue in the age's last turns: the plan's building that is done before the age ends, not the one that is not", () => {
    try {
        plan(["BUILDING_BATH", "BUILDING_LIBRARY"]);
        ageLeft(8);
        steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_LIBRARY")]);
        ageLeft(40);
        fake.sent.length = 0;
        steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_BATH"), C("BUILDING_LIBRARY")]);
    } finally {
        reset();
    }
});

test("a unit is not trained where it is done only after the age ends (game 22: a settler at 77 of 115 queued 7 turns before the end)", () => {
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 0 };
        ageLeft(2); // a scout takes 2 turns, 1 is left a turn early
        steps.fillProduction(new Map(), { explore: true });
        assert.deepEqual(units("UNIT_SCOUT"), []);
        ageLeft(30);
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { explore: true });
        assert.equal(units("UNIT_SCOUT").length, 1);
    } finally {
        reset();
    }
});

test("nor a defender: one done after the age ends is lost too (the purchase step may buy one)", () => {
    const threats = [{ settlement: { name: "Athens", x: 6, y: 6 }, count: 2, land: 2, owners: [{ id: 5, independent: true }] }];
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 0 };
        ageLeft(3); // a melee unit takes 4 turns
        let out = steps.fillProduction(new Map(), { threats });
        assert.ok(!out.some((e) => e.key === "QUEUED_DEFENDER"), JSON.stringify(out));
        ageLeft(30);
        fake.sent.length = 0;
        steps.resetWar();
        out = steps.fillProduction(new Map(), { threats });
        assert.ok(out.some((e) => e.key === "QUEUED_DEFENDER"), JSON.stringify(out));
    } finally {
        steps.resetWar();
        reset();
    }
});

test("an empty queue and nothing of the plan: the advisor's pick only where it is done before the age ends, else the cheapest building that is", () => {
    const subjects = GameInfo.AdvisorySubjects;
    GameInfo.AdvisorySubjects = { lookup: (h) => (h === 6 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_CONSTRUCTIBLES" } : null) };
    world.buildRecs = () => [{ subject: 6, recommendedType: "BUILDING_BATH", whichAdvisors: [] }];
    try {
        ageLeft(8);
        let out = steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_MONUMENT")], JSON.stringify(out));
        assert.ok(out.some((e) => e.key === "QUEUED_FALLBACK"), JSON.stringify(out));
        ageLeft(40);
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_BATH")]);
        assert.ok(out.some((e) => e.key === "QUEUED_ADVISOR"), JSON.stringify(out));
    } finally {
        GameInfo.AdvisorySubjects = subjects;
        delete world.buildRecs;
        reset();
    }
});

test("a unit is not moved ahead where it is done only after the age ends", () => {
    try {
        athens.queue = { type: "BUILDING_LIBRARY", turns: 4, pct: 0 };
        athens.trains = "UNIT_SCOUT";
        ageLeft(2);
        steps.frontLoadUnits({ explore: true });
        assert.deepEqual(moves(), []);
        ageLeft(30);
        fake.sent.length = 0;
        steps.frontLoadUnits({ explore: true });
        assert.deepEqual(moves(), [[1, 0]]);
    } finally {
        reset();
    }
});

test("the final age is timed all through: the game ends with it (research/30 §3: game 23 ended with six Launch Pads, a Laboratory and a Tank unfinished)", () => {
    const prod = athens.prod;
    try {
        athens.prod = 10; // the Bath (313) takes 32 turns, the Library 9
        plan(["BUILDING_BATH", "BUILDING_LIBRARY"]);
        ageLeft(20, { final: true });
        steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_LIBRARY")], "20 turns before the game ends: not the Bath");
        // A non-final age is timed only in its last AGE_END_TURNS (12).
        ageLeft(20);
        fake.sent.length = 0;
        steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_BATH"), C("BUILDING_LIBRARY")]);
        // The Bath in production 20 turns before the game ends gives way to the Library.
        plan([]);
        athens.queue = { type: "BUILDING_BATH", turns: 32, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY"];
        ageLeft(20, { final: true });
        fake.sent.length = 0;
        const out = steps.ageEndOrder();
        assert.deepEqual(moves(), [[1, 0]]);
        assert.equal(out[0]?.key, "GAME_END_FIRST", "in the game's own words");
    } finally {
        athens.prod = prod;
        reset();
    }
});

test("a non-final age's last turn: a building in production at least half done is bought, else its production is lost (research/30 §4: the capital's Bazaar ended Exploration 19 short)", () => {
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => [s.args.ConstructibleType, s.args.X, s.args.Y]);
    world.canBuy = (type) => (type === "BUILDING_ACADEMY" ? { Success: true, InProgress: true, Plots: [GameplayMap.getIndexFromXY(7, 6)], Cost: 230 } : { Success: false });
    const lastTurn = () => {
        ageLeft(0);
        world.agePoints = 100; // the age's points are full: its last turn
    };
    try {
        world.gold = 800;
        athens.queue = { type: "BUILDING_ACADEMY", turns: 3, pct: 77 };
        lastTurn();
        const out = steps.buyAgeEndItems();
        assert.deepEqual(bought(), [[C("BUILDING_ACADEMY"), 7, 6]], "on the tile it is built on");
        assert.equal(out[0]?.key, "AGE_END_BOUGHT");
        // On the last turn one turn short is too late as well.
        athens.queue = { type: "BUILDING_ACADEMY", turns: 1, pct: 90 };
        fake.sent.length = 0;
        steps.buyAgeEndItems();
        assert.equal(bought().length, 1, "the last turn: one turn short");
        // Less than half done (no bargain), mid-age, the final age (nothing carries over anyway), the gold short: none.
        for (const [what, set] of [
            ["40% done", () => (athens.queue = { type: "BUILDING_ACADEMY", turns: 6, pct: 40 })],
            ["mid-age", () => ageLeft(40)],
            ["the final age", () => (world.finalAge = true)],
            ["100 gold", () => (world.gold = 100)],
        ]) {
            athens.queue = { type: "BUILDING_ACADEMY", turns: 3, pct: 77 };
            world.gold = 800;
            lastTurn();
            set();
            fake.sent.length = 0;
            steps.buyAgeEndItems();
            assert.deepEqual(bought(), [], what);
            delete world.finalAge;
        }
        // The turn before the last: done next turn, it is not bought; three turns short, it is.
        world.gold = 800;
        athens.queue = { type: "BUILDING_ACADEMY", turns: 1, pct: 90 };
        ageLeft(1);
        fake.sent.length = 0;
        steps.buyAgeEndItems();
        assert.deepEqual(bought(), [], "one more turn does it");
        athens.queue = { type: "BUILDING_ACADEMY", turns: 3, pct: 77 };
        fake.sent.length = 0;
        steps.buyAgeEndItems();
        assert.equal(bought().length, 1);
    } finally {
        delete world.canBuy;
        delete world.gold;
        delete world.finalAge;
        reset();
    }
});

test("no end on the clock, no deadline: the final age with the score victory off, a game played on past its end, an age with no timer (research/31 §1: game 26 went 52 turns past Modern's 100% and every space project was refused)", () => {
    const vm = Game.VictoryManager;
    const prod = athens.prod;
    try {
        athens.prod = 10; // the Bath (313) takes 32 turns, the Library 9
        Game.VictoryManager = { isScoreVictoryEnabled: () => false };
        ageLeft(20, { final: true });
        assert.equal(steps.ageEndTurns(), null, "the score victory off: the game does not end with the age");
        plan(["BUILDING_BATH", "BUILDING_LIBRARY"]);
        steps.fillProduction(new Map(), {});
        assert.deepEqual(builds(), [C("BUILDING_BATH"), C("BUILDING_LIBRARY")], "the Bath too");
        // The age's points full and the game going on: nothing gives way.
        plan([]);
        world.agePoints = 100;
        athens.queue = { type: "BUILDING_BATH", turns: 32, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY"];
        fake.sent.length = 0;
        assert.deepEqual(steps.ageEndOrder(), []);
        assert.deepEqual(moves(), []);
        // The score victory on: the game ends with the age (research/30 §3).
        Game.VictoryManager = { isScoreVictoryEnabled: () => true };
        assert.equal(steps.ageEndTurns(), 1);
        // Played on after the game's end ("one more turn"): no end.
        world.extendedGame = true;
        assert.equal(steps.ageEndTurns(), null, "an extended game");
        delete world.extendedGame;
        // A non-final age with no timer: no end either.
        ageLeft(5);
        assert.equal(steps.ageEndTurns(), 5);
        world.ageMax = 0;
        assert.equal(steps.ageEndTurns(), null, "no age timer");
    } finally {
        Game.VictoryManager = vm;
        athens.prod = prod;
        for (const k of ["extendedGame", "ageMax"]) delete world[k];
        reset();
    }
});

test("an age with no end on its clock is never ending: upgrades are not held back (research/31 §1)", () => {
    const vm = Game.VictoryManager;
    try {
        world.finalAge = true;
        world.ageCountdown = true;
        world.agePoints = 99; // a point left
        Game.VictoryManager = { isScoreVictoryEnabled: () => true };
        assert.equal(steps.ageEnding(), true);
        Game.VictoryManager = { isScoreVictoryEnabled: () => false };
        assert.equal(steps.ageEnding(), false);
        // No age timer (a non-final age): never ending either.
        Game.VictoryManager = vm;
        world.finalAge = false;
        world.ageMax = 0;
        assert.equal(steps.ageEnding(), false, "no age timer");
    } finally {
        Game.VictoryManager = vm;
        delete world.ageCountdown;
        delete world.ageMax;
        reset();
    }
});

test("the age's last turn buys from the reserve too, not while a settlement is threatened (research/31 §5: game 25 lost an Academy at 94% for about 30 gold behind a reserve of 64)", () => {
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).length;
    world.canBuy = (type) => (type === "BUILDING_ACADEMY" ? { Success: true, InProgress: true, Plots: [GameplayMap.getIndexFromXY(7, 6)], Cost: 230 } : { Success: false });
    try {
        athens.queue = { type: "BUILDING_ACADEMY", turns: 3, pct: 77 };
        ageLeft(0);
        world.agePoints = 100; // the age's last turn
        // 260 gold, 64 of it the reserve: 196 free, 260 in all.
        const out = steps.buyAgeEndItems(createBudget({ gold: 260, reserve: 64 }));
        assert.equal(bought(), 1, JSON.stringify(out));
        fake.sent.length = 0;
        steps.buyAgeEndItems(createBudget({ gold: 260, reserve: 64 }), { threatened: true });
        assert.equal(bought(), 0, "threatened: the free gold only");
        // Played on past the game's end: no age ends, nothing to buy for it.
        world.extendedGame = true;
        fake.sent.length = 0;
        steps.buyAgeEndItems(createBudget({ gold: 1000 }));
        assert.equal(bought(), 0, "an extended game");
    } finally {
        delete world.canBuy;
        delete world.extendedGame;
        reset();
    }
});
