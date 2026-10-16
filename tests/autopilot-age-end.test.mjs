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
        // Mid-age, or in the final age (the game ends with it: nothing carries over): nothing.
        for (const [left, final] of [[40, false], [8, true]]) {
            ageLeft(left, { final });
            fake.sent.length = 0;
            assert.deepEqual(steps.ageEndOrder(), [], `${left} left, final ${final}`);
        }
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
