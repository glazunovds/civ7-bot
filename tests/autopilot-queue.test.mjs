// Nothing is moved ahead of an item already in production with progress: the game gives the
// preempted item's progress to whatever takes its place, drops what exceeds that item's cost, and
// the preempted item starts over (seen in game: the Pyramids at 136 of 137 turned into a Market).
// Units are the exception: they may go ahead of a wonder or a project (a unit moved ahead of a
// wonder did not take its progress; settlers waited behind them for 7-12 turns at a time).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 24, height: 16, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 6, y: 6, name: "Athens", pop: 8, prod: 20 },
        { owner: 0, x: 14, y: 6, name: "Sparta", pop: 3, prod: 8 },
    ],
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const moves = () => fake.sent.filter((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo).map((s) => [s.id.id, s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
const athens = world.cities[0];

function reset() {
    fake.sent.length = 0;
    for (const c of world.cities) for (const k of ["queue", "queued", "trains"]) delete c[k];
    delete world.canBuild;
    world.units = [];
}

test("victory work goes behind a wonder with progress, not ahead of it", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY"];
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), [[0, 2, 1]], "the Library right behind the Pyramids");
    // Nothing done yet on the wonder: the Library still goes behind it (research/21 E1: seen in game 6,
    // Oxford never started because the levers were moved ahead of it every pass).
    athens.queue.pct = 0;
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), [[0, 2, 1]]);
    // A building just started (0%) at the front: the Library may go first.
    athens.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 0 };
    athens.queued = ["BUILDING_GRANARY", "BUILDING_LIBRARY"];
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), [[0, 2, 0]]);
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    // Already right behind it: no move.
    athens.queue.pct = 60;
    athens.queued = ["BUILDING_LIBRARY"];
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), []);
});

test("a settler goes ahead of a wonder or a project in production (units do not take their progress), behind a building with progress", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT"];
    athens.trains = "UNIT_SETTLER";
    const out = steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 0]], "seen in game: settlers waited 7-12 turns behind wonders and projects");
    assert.equal(out[0].key, "FRONT_LOADED");
    athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 11, pct: 40 };
    fake.sent.length = 0;
    steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 0]]);
    // A building with progress keeps the front (another building would take its progress).
    athens.queue = { type: "BUILDING_LIBRARY", turns: 4, pct: 60 };
    fake.sent.length = 0;
    steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 1]]);
    athens.queue.pct = 0;
    fake.sent.length = 0;
    steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 0]]);
});

test("a repair goes behind a wonder with progress, not ahead of it", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY"];
    world.canBuild = (type, id) => (type === "BUILDING_LIBRARY" && id.id === 0 ? { Success: true, RepairDamaged: true, InQueue: true, Plots: [idx(7, 6)] } : type === undefined ? { Success: true } : { Success: false, Plots: [] });
    const out = steps.repairBuildings({ buy: false, queue: true });
    assert.deepEqual(moves(), [[0, 2, 1]]);
    assert.ok(out.some((e) => e.key === "REPAIR_FIRST"));
});

test("a wanted settler is trained where the queue is free soonest, not behind a long building; a wonder does not hold it", () => {
    reset();
    athens.queue = { type: "BUILDING_LIBRARY", turns: 9, pct: 60 };
    world.units = [{ id: 1, type: "UNIT_SETTLER", x: 6, y: 7 }]; // one in flight: one more wanted
    world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }]; // a site is known (C3b)
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === GameInfo.Units.lookup("UNIT_SETTLER").$hash).map((s) => s.id.id);
    steps.fillProduction(new Map(), { settlers: true });
    assert.deepEqual(trained(), [1], "Sparta, though Athens is bigger");
    // Athens's current item has no progress yet: the bigger city again.
    athens.queue.pct = 0;
    fake.sent.length = 0;
    steps.fillProduction(new Map(), { settlers: true });
    assert.deepEqual(trained(), [0]);
    // A wonder in progress: units go ahead of it, so Athens is free for them.
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    fake.sent.length = 0;
    steps.fillProduction(new Map(), { settlers: true });
    assert.deepEqual(trained(), [0]);
    delete world.aiSuggestions;
    reset();
});

test("a science project already queued is found (its constructibleType is -1): not requested again, moved to the front", () => {
    // Seen in game: Chart the Stars requested 22 times, Crewed Space Flight Research 18, never moved up.
    reset();
    athens.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 0 };
    athens.queued = ["BUILDING_GRANARY", "PROJECT_CHART_THE_STARS"];
    world.canBuild = (type) => (type === undefined || type === "PROJECT_CHART_THE_STARS" ? { Success: true, Plots: [] } : { Success: false, Plots: [] });
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(fake.sent.filter((s) => s.args?.ProjectType !== undefined && s.args.InsertMode === undefined), [], "not requested again");
    assert.ok(moves().some(([id, from, to]) => id === 0 && from === 2 && to === 0), JSON.stringify(moves()));
    reset();
});

test("a science project goes to the city that finishes it soonest, not behind a building with 8 turns left in the best city (research/21 D3)", () => {
    reset();
    athens.prod = 30;
    athens.queue = { type: "BUILDING_MONUMENT", turns: 8, pct: 50 };
    world.cities[1].prod = 20;
    world.costOf = (t) => (t === "PROJECT_CHART_THE_STARS" ? 200 : 100);
    const chart = GameInfo.Projects.lookup("PROJECT_CHART_THE_STARS").$hash;
    world.canBuild = (type) => (type === "PROJECT_CHART_THE_STARS" ? { Success: true } : { Success: false, Plots: [] });
    try {
        steps.pushVictoryWork("SCIENCE");
        const where = fake.sent.filter((s) => s.kind === "operation" && s.args.ProjectType === chart).map((s) => s.id.id);
        assert.deepEqual(where, [1], "Sparta: 200 / 20 = 10 turns; Athens: 8 + 200 / 30 ≈ 15");
        reset();
        athens.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 50 };
        world.canBuild = (type) => (type === "PROJECT_CHART_THE_STARS" ? { Success: true } : { Success: false, Plots: [] });
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(fake.sent.filter((s) => s.kind === "operation" && s.args.ProjectType === chart).map((s) => s.id.id), [0], "1 + 200 / 30 ≈ 8: Athens");
    } finally {
        athens.prod = 20;
        world.cities[1].prod = 8;
        delete world.costOf;
        reset();
    }
});

test("what the victory step queued this pass is not queued again by the plan or the advisor (research/21 H2)", () => {
    reset();
    const library = GameInfo.Constructibles.lookup("BUILDING_LIBRARY").$hash;
    world.canBuild = (type) => (type === "BUILDING_LIBRARY" ? { Success: true, Plots: [idx(7, 6)], ExpandUrbanPlots: [] } : type === undefined ? { Success: true } : { Success: false, Plots: [] });
    const queued = new Map();
    steps.pushVictoryWork("SCIENCE", { queued });
    assert.ok(fake.sent.some((s) => s.kind === "operation" && s.id.id === 0 && s.args.ConstructibleType === library), "the Library in Athens");
    fake.sent.length = 0;
    const out = steps.fillProduction(new Map(), { queued });
    assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.id.id === 0), `Athens has its Library: ${JSON.stringify(out)}`);
    reset();
});

test("Build-up: a settler waits behind a wonder in production; a defender under threat still goes ahead (research/21 E1)", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT"];
    athens.trains = "UNIT_SETTLER";
    const strategy = { unitsAheadOfWonders: false };
    world.settlementCap = 3; // 2 settlements: one below the cap, no expansion deficit
    steps.frontLoadUnits({ settlers: true, strategy });
    assert.deepEqual(moves(), [[0, 2, 1]], "behind the Pyramids");
    // Far below the cap: expansion first, the settler goes ahead (research/22 A1: game 7, one waited behind Chart the Stars).
    world.settlementCap = 8;
    fake.sent.length = 0;
    steps.frontLoadUnits({ settlers: true, strategy });
    assert.deepEqual(moves(), [[0, 2, 0]], "far below the cap");
    world.settlementCap = 3;
    fake.sent.length = 0;
    steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 0]], "no strategy (or Growth): ahead of the wonder, as before");
    athens.trains = "UNIT_WARRIOR";
    fake.sent.length = 0;
    steps.frontLoadUnits({ strategy, threats: [{ settlement: { name: "Athens", x: 6, y: 6 }, count: 2, owners: [] }] });
    assert.deepEqual(moves(), [[0, 2, 0]], "a defender under threat goes first");
    delete world.settlementCap;
    reset();
});

test("no front-loading ping-pong: a wanted settler is not moved ahead of a wanted scout already at the front; a lever building never ahead of a queued unit (research/21 H1)", () => {
    reset();
    athens.queued = ["UNIT_SCOUT", "BUILDING_MONUMENT", "UNIT_SETTLER"];
    steps.frontLoadUnits({ explore: true, settlers: true });
    assert.deepEqual(moves(), [], "the scout is already first: the settler stays (it moved ahead and back every pass)");
    reset();
    athens.queued = ["UNIT_SETTLER", "BUILDING_MONUMENT", "BUILDING_LIBRARY"];
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), [[0, 2, 1]], "the Library behind the settler");
    reset();
});

test("no settler trained in a threatened settlement; two at a time while below half the cap (research/22 A1)", () => {
    reset();
    world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === settler).map((s) => s.id.id);
    try {
        // Ships off Athens (no land defender to train there): still no settler in it.
        steps.fillProduction(new Map(), { settlers: true, threats: [{ settlement: { name: "Athens", x: 6, y: 6 }, count: 2, land: 0, owners: [] }] });
        assert.deepEqual(trained(), [1], "Sparta, not the raided Athens");
        reset();
        world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
        world.cities.push({ owner: 0, x: 20, y: 6, name: "Corinth", pop: 4, prod: 8 });
        world.settlementCap = 8; // 3 of 8
        steps.fillProduction(new Map(), { settlers: true });
        assert.equal(trained().length, 2, "below half the cap: two at a time");
    } finally {
        world.cities.splice(2);
        delete world.settlementCap;
        delete world.aiSuggestions;
        reset();
    }
});

test("a science project that would miss the age's end behind a wonder with progress goes to the very front (research/22 A3: Invent Calculus missed by 19 production)", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 8, pct: 50 };
    athens.queued = ["BUILDING_GRANARY", "PROJECT_CHART_THE_STARS"];
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    world.costOf = (t) => (t === "PROJECT_CHART_THE_STARS" ? 100 : 100);
    try {
        world.agePoints = 95; // about 6 turns left: 8 behind the Monument + 5 for the project would miss it
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [[0, 2, 0]]);
        fake.sent.length = 0;
        world.agePoints = 20; // plenty of time: behind the Pyramids
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [[0, 2, 1]]);
        // A plain building with progress: the project goes ahead with plenty of time too, nothing is lost (it takes
        // the progress or the building keeps it; research/24 P3: a Kiln held the Heliocentric Model back E60-E63).
        athens.queue = { type: "BUILDING_MONUMENT", turns: 8, pct: 50 };
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [[0, 2, 0]]);
    } finally {
        delete world.agePoints;
        delete world.costOf;
        reset();
    }
});

test("progress that is only overflow (one turn of production or less) does not hold the front; real progress does (research/23 E1)", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
    try {
        athens.queue = { type: "BUILDING_LIBRARY", turns: 4, pct: 4 }; // 4 of 100 production, Athens makes 20
        athens.queued = ["UNIT_SETTLER"];
        steps.frontLoadUnits({ settlers: true });
        assert.deepEqual(moves(), [[0, 1, 0]], "the settler ahead of 4 production of overflow");
        reset();
        world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
        athens.queue = { type: "BUILDING_LIBRARY", turns: 2, pct: 50 };
        athens.queued = ["UNIT_SETTLER"];
        steps.frontLoadUnits({ settlers: true });
        assert.deepEqual(moves(), [], "50 production: it stays behind");
    } finally {
        reset();
    }
});

test("a defender under threat goes ahead of a building with progress (research/23 D4: Забид's defender waited behind a Tavern until the city fell)", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
    try {
        athens.queue = { type: "BUILDING_LIBRARY", turns: 2, pct: 50 };
        athens.queued = ["UNIT_WARRIOR"];
        steps.frontLoadUnits({ defend: true, threats: [{ settlement: { x: 6, y: 6, name: "Athens" }, count: 1, land: 1, owners: [] }] });
        assert.deepEqual(moves(), [[0, 1, 0]]);
    } finally {
        reset();
    }
});

test("a lever building never moves ahead of a queued wonder or project (research/23 S1: the University and Shwedagon swapped places every pass)", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 60 };
        athens.queued = ["WONDER_PYRAMIDS", "BUILDING_LIBRARY"];
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [], "the Library stays behind the Pyramids");
        athens.queued = ["PROJECT_CHART_THE_STARS", "BUILDING_LIBRARY"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves().filter(([, from]) => from === 2), [], "nor ahead of Chart the Stars");
    } finally {
        reset();
    }
});

test("a threatened city trains a settler when no other city could start one soon and its guards match the raiders (research/23 E2)", () => {
    reset();
    world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === settler).map((s) => s.id.id);
    const threat = [{ settlement: { name: "Athens", x: 6, y: 6 }, count: 1, land: 1, owners: [] }];
    try {
        world.cities[1].queue = { type: "BUILDING_LIBRARY", turns: 9, pct: 60 }; // Sparta busy for 9 turns
        world.units = [{ id: 30, type: "UNIT_WARRIOR", x: 6, y: 6 }]; // one guard against one raider
        steps.fillProduction(new Map(), { settlers: true, threats: threat });
        assert.deepEqual(trained(), [0, 1], "Athens too, though threatened (two wanted below the cap less one)");
        reset();
        world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
        world.cities[1].queue = { type: "BUILDING_LIBRARY", turns: 9, pct: 60 };
        // No soldier can be trained (so Athens' queue is free): only the guard rule keeps the settler out.
        world.canBuild = (type) => (type === "UNIT_SETTLER" || type === undefined ? { Success: true } : type?.startsWith?.("UNIT_") ? { Success: false } : { Success: true, Plots: [] });
        steps.fillProduction(new Map(), { settlers: true, threats: threat });
        assert.deepEqual(trained(), [1], "no guard in Athens: Sparta, however late");
        reset();
        world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
        world.units = [{ id: 30, type: "UNIT_WARRIOR", x: 6, y: 6 }];
        steps.fillProduction(new Map(), { settlers: true, threats: threat });
        assert.deepEqual(trained(), [1], "Sparta free now: Sparta");
    } finally {
        delete world.aiSuggestions;
        reset();
    }
});

test("two settlers at a time while below the settlement cap less one, not only below half of it (research/23 E3)", () => {
    reset();
    world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    try {
        world.cities.push({ owner: 0, x: 20, y: 6, name: "Corinth", isTown: true, pop: 3 });
        world.settlementCap = 6; // 3 of 6
        steps.fillProduction(new Map(), { settlers: true });
        assert.equal(fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === settler).length, 2);
    } finally {
        world.cities.splice(2);
        delete world.settlementCap;
        delete world.aiSuggestions;
        reset();
    }
});

test("a settler waiting in a queue behind other items is bought, and its entry dropped (research/23 E4: game 8 bought a Brickyard instead)", async () => {
    reset();
    const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");
    world.aiSuggestions = () => [{ location: { x: 20, y: 12 } }];
    world.settlementCap = 6;
    world.canBuy = (type) => (type === "UNIT_SETTLER" ? { Success: true, Cost: 200 } : { Success: false });
    try {
        athens.queue = { type: "BUILDING_LIBRARY", turns: 6, pct: 40 };
        athens.queued = ["UNIT_SETTLER"];
        world.cities[1].queue = { type: "BUILDING_LIBRARY", turns: 6, pct: 40 };
        world.cities[1].queued = ["UNIT_SETTLER"];
        const out = steps.buySettlers(createBudget({ gold: 1000, reserve: 0 }));
        assert.equal(out[0]?.key, "SETTLER_BOUGHT", "two settlers queued, both late: neither is on its way");
        const drop = fake.sent.find((s) => s.args?.InsertMode === CityOperationsParametersValues.RemoveAt);
        assert.deepEqual([drop?.id.id, drop?.args.QueueLocation], [0, 1], "Athens' queued settler dropped");
    } finally {
        delete world.aiSuggestions;
        delete world.settlementCap;
        delete world.canBuy;
        reset();
    }
});

test("only the city defending a threatened settlement puts a soldier ahead of a building with progress (research/24 P2)", () => {
    reset();
    const sparta = world.cities[1];
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
    try {
        sparta.queue = { type: "BUILDING_LIBRARY", turns: 2, pct: 50 };
        sparta.queued = ["UNIT_WARRIOR"];
        steps.frontLoadUnits({ defend: true, threats: [{ settlement: { x: 6, y: 6, name: "Athens" }, count: 1, land: 1, owners: [] }] });
        assert.deepEqual(moves(), [], "Athens defends itself; Sparta's soldier waits its turn");
    } finally {
        reset();
    }
});

test("units keep behind a wonder in a race, and behind a science project that would then miss the age; no expansion overtaking in the final push (research/24 P2: Oxford lost by 97, the Heliocentric Model by 51)", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const wonders = state.get().results.wonders;
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    try {
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
        athens.queued = ["BUILDING_MONUMENT"];
        athens.trains = "UNIT_SETTLER";
        state.set({ results: { ...state.get().results, wonders: { rows: [{ type: "WONDER_PYRAMIDS", rivalsSeen: 1 }] } } });
        steps.frontLoadUnits({ settlers: true });
        assert.deepEqual(moves(), [[0, 2, 1]], "a rival builds the Pyramids too");
        state.set({ results: { ...state.get().results, wonders: { rows: [{ type: "WONDER_PYRAMIDS", rivalsSeen: 0, rivalTurns: [40] }] } } });
        fake.sent.length = 0;
        steps.frontLoadUnits({ settlers: true });
        assert.deepEqual(moves(), [[0, 2, 0]], "the rival needs 40 turns: we still win it");
        state.set({ results: { ...state.get().results, wonders } });
        // The final push, far below the cap: the settler waits behind the wonder.
        world.settlementCap = 8;
        fake.sent.length = 0;
        steps.frontLoadUnits({ settlers: true, strategy: { unitsAheadOfWonders: false, phase: "COMMIT" } });
        assert.deepEqual(moves(), [[0, 2, 1]], "Commit");
        delete world.settlementCap;
        // A science project with 5 turns left in the final age with about 5: ahead of it a scout would make it miss the
        // end, behind it the scout would be done only after the game ends (research/30 §3): it stays.
        athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 5, pct: 40 };
        athens.trains = "UNIT_SCOUT";
        world.agePoints = 96;
        world.finalAge = true;
        fake.sent.length = 0;
        steps.frontLoadUnits({ explore: true });
        assert.deepEqual(moves(), [], "the final age");
        // Before an age change: behind the project the scout would be done only after the age ends, so it stays (game 22).
        world.finalAge = false;
        fake.sent.length = 0;
        steps.frontLoadUnits({ explore: true });
        assert.deepEqual(moves(), [], "its production would be lost at the age change");
        world.agePoints = 20;
        fake.sent.length = 0;
        steps.frontLoadUnits({ explore: true });
        assert.deepEqual(moves(), [[0, 2, 0]], "plenty of time");
    } finally {
        state.set({ results: { ...state.get().results, wonders } });
        delete world.settlementCap;
        delete world.agePoints;
        delete world.finalAge;
        reset();
    }
});

test("the military lever: in the final push a settler overtakes a wonder (no race) while below the cap (research/26 §3.3)", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    try {
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
        athens.queued = ["BUILDING_MONUMENT"];
        athens.trains = "UNIT_SETTLER";
        world.settlementCap = 8;
        steps.frontLoadUnits({ settlers: true, strategy: { unitsAheadOfWonders: false, phase: "COMMIT", militaryLever: true } });
        assert.deepEqual(moves(), [[0, 2, 0]], "the lever: ahead of the wonder");
        world.settlementCap = 2; // at the cap: nothing to found
        fake.sent.length = 0;
        steps.frontLoadUnits({ settlers: true, strategy: { unitsAheadOfWonders: false, phase: "COMMIT", militaryLever: true } });
        assert.deepEqual(moves(), [[0, 2, 1]]);
    } finally {
        delete world.settlementCap;
        reset();
    }
});

test("never a unit right behind a wonder in production: a building moves in between, else one is queued (research/24 P4: the Red Fort's 300 into a 15-cost Scout)", () => {
    reset();
    try {
        world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_GRANARY" ? { Success: true, Plots: [idx(7, 6)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
        athens.queued = ["UNIT_SCOUT", "BUILDING_MONUMENT"];
        steps.frontLoadUnits({});
        assert.deepEqual(moves(), [[0, 2, 1]]);
        athens.queued = ["UNIT_SCOUT"];
        fake.sent.length = 0;
        steps.frontLoadUnits({});
        const built = fake.sent.filter((s) => s.kind === "operation" && s.args.ConstructibleType !== undefined).map((s) => GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleType);
        assert.deepEqual(built, ["BUILDING_GRANARY"]);
    } finally {
        reset();
    }
});

test("a science project the soonest city would not finish before the age ends is not queued (research/24: Spherical Earth, 76 production lost)", () => {
    reset();
    world.canBuild = (type) => (type === "PROJECT_SPHERICAL_EARTH" ? { Success: true, Plots: [] } : type === undefined ? { Success: true } : { Success: false, Plots: [] });
    world.costOf = () => 200; // 10 turns in Athens (20 production)
    const projects = () => fake.sent.filter((s) => s.args.ProjectType !== undefined).length;
    try {
        world.agePoints = 95; // about 6 turns left
        steps.pushVictoryWork("SCIENCE");
        assert.equal(projects(), 0);
        world.agePoints = 20;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.equal(projects(), 1);
    } finally {
        delete world.agePoints;
        delete world.costOf;
        reset();
    }
});

test("the queue probe names the item in production whatever it is (research/24: it printed «?» for a project)", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        athens.queue = { type: "BUILDING_LIBRARY", turns: 2, pct: 50 };
        athens.queued = ["UNIT_WARRIOR"];
        steps.frontLoadUnits({ defend: true, threats: [{ settlement: { x: 6, y: 6, name: "Athens" }, count: 1, land: 1, owners: [] }] });
        assert.ok(lines.some((l) => l.includes("moved ahead of BUILDING_LIBRARY")), JSON.stringify(lines));
        athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 2, pct: 50 };
        lines.length = 0;
        fake.sent.length = 0;
        steps.frontLoadUnits({ defend: true, threats: [{ settlement: { x: 6, y: 6, name: "Athens" }, count: 1, land: 1, owners: [] }] });
        assert.ok(lines.some((l) => l.includes("moved ahead of PROJECT_CHART_THE_STARS")), JSON.stringify(lines));
    } finally {
        console.warn = warn;
        reset();
    }
});

// Game 33: Брэдфорд's City Park stood at 100% from M56 (945 of 451 by M60) and its Granary from A66 to Antiquity's end; the
// game never completed them, and Crewed Space Flight Preparation and both flights waited behind the park.
test("an item the game does not complete (100% since an earlier turn) gives way: the next item goes ahead of it, items may go ahead of it, and none brings it back to the front", () => {
    reset();
    steps.resetStuckItems();
    const turn = Game.turn;
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
    try {
        athens.queue = { type: "BUILDING_LIBRARY", turns: 1, pct: 100 };
        athens.queued = ["BUILDING_GRANARY"];
        assert.deepEqual(steps.unstickQueues(), [], "100% for the first time: done at the turn's end");
        assert.deepEqual(moves(), []);
        Game.turn = turn + 1;
        const out = steps.unstickQueues();
        assert.deepEqual(moves(), [[0, 1, 0]], "the Granary goes ahead of it");
        assert.equal(out[0]?.key, "QUEUE_UNSTUCK");
        // The Granary in production, the Library behind it: the victory work does not bring the Library back.
        athens.queue = { type: "BUILDING_GRANARY", turns: 3, pct: 0 };
        athens.queued = ["BUILDING_LIBRARY"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [], "not back to the front");
        // A stuck item in production holds no front: a lever goes ahead of it (frontSlot 0, not 1).
        steps.resetStuckItems();
        athens.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 100 };
        athens.queued = ["BUILDING_GRANARY", "BUILDING_LIBRARY"];
        steps.unstickQueues(); // turn + 1: first seen
        Game.turn = turn + 2;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [[0, 2, 0]], "the Library to the very front");
        // A stuck project holds nothing behind it either (a lever never passes a project otherwise: research/23 S1).
        steps.resetStuckItems();
        athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 1, pct: 100 };
        athens.queued = ["BUILDING_GRANARY", "BUILDING_LIBRARY"];
        steps.unstickQueues(); // turn + 2: first seen
        Game.turn = turn + 3;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(moves(), [[0, 2, 0]], "past the stuck project");
    } finally {
        Game.turn = turn;
        steps.resetStuckItems();
        reset();
    }
});

test("a stuck item alone in its queue: a building is queued to go ahead of it next pass", () => {
    reset();
    steps.resetStuckItems();
    const turn = Game.turn;
    const sparta = world.cities[1];
    const spot = GameplayMap.getIndexFromXY(15, 6);
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_GRANARY" ? { Success: true, Plots: [spot] } : { Success: false, Plots: [] });
    try {
        sparta.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 100 };
        steps.unstickQueues();
        Game.turn = turn + 1;
        const out = steps.unstickQueues();
        const built = fake.sent.filter((s) => s.kind === "operation" && s.id.id === 1 && s.args.ConstructibleType === GameInfo.Constructibles.lookup("BUILDING_GRANARY").$hash);
        assert.equal(built.length, 1, JSON.stringify(fake.sent));
        assert.equal(out[0]?.key, "QUEUE_UNSTUCK_QUEUED");
    } finally {
        Game.turn = turn;
        steps.resetStuckItems();
        reset();
    }
});
