// The autopilot's gold plan in a pass (research/21 M1): every purchase is paid from one budget,
// the gold is saved for the most important goal (a town conversion, the victory path's next
// building) before small purchases, towns' warehouses take a share, conversions past 1:1 follow
// the Towns tab's verdict, and the pass leaves its gold line for the tab and UI.log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };    // Athens, the city
const P = { x: 14, y: 8 };   // Pella, a town: conversion 500
const T = { x: 8, y: 14 };   // Thebes, a town: conversion 400, the game offers none
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: Math.abs(x - A.x) <= 1 && Math.abs(y - A.y) <= 1 ? 0 : -1 }),
    structures: (x, y) => (x === A.x && y === A.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...A, name: "Athens", pop: 8, prod: 12, food: 10, happy: 10 },
        { owner: 0, ...P, name: "Pella", isTown: true, pop: 5, prod: 4, happy: 5, cost: 500 },
        { owner: 0, ...T, name: "Thebes", isTown: true, pop: 5, prod: 2, happy: 5, cost: 400 },
    ],
    gold: 600,
    goldIncome: 25, // goals within reach (research/23 S6: 12 turns of income at most)
    canConvert: (id) => id.id === 1,
    canBuy: (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 }),
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
// A plan: [settlement, building, x, y] each worth 5 a turn.
const plan = (items) => state.set({
    results: {
        ...state.get().results,
        plans: { placements: items.map(([c, type, x, y]) => ({ sid: `c:${c.x}-${c.y}`, type, x, y, name: type, settlementName: c.name, net: 5 })), fillers: [], horizon: 50, timeAware: false },
    },
});
const purchases = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE);
const converted = () => purchases().filter((s) => s.args.Directive === OrderTypes.ORDER_TOWN_UPGRADE).map((s) => s.id.id);
const keys = () => (state.get().autopilot?.log ?? []).map((e) => e.key);
settings.patch({ autopilot: { research: false, production: false, wonders: false, growth: false, towns: true, purchases: true, choices: false, befriend: false, tacks: false, resources: false, replanEvery: 0, reserveTurns: 2, focus: false } });
plan([[A, "BUILDING_MONUMENT", A.x + 1, A.y], [A, "BUILDING_GRANARY", A.x - 1, A.y]]);

async function pass(gold) {
    world.gold = gold;
    fake.sent.length = 0;
    state.set({ autopilot: { ...(state.get().autopilot ?? {}), log: [] } });
    await autopilot.runTurn(true);
}

test("towns outnumber cities: below the conversion's cost nothing else is bought, then the town is converted", async () => {
    steps.resetGoldPlan();
    await pass(400);
    assert.deepEqual(purchases(), [], "400 of 500: the plan's 250 buildings wait");
    assert.equal(state.get().autopilot.gold?.goal?.kind, "CONVERT");
    assert.ok(keys().includes("SAVING"), JSON.stringify(keys()));
    await pass(550);
    assert.deepEqual(converted(), [1], "Pella");
    assert.ok(keys().includes("TOWN_CONVERTED"));
    assert.equal(purchases().length, 1, "50 left: no building");
});

test("a conversion and a building are never paid from the same gold (seen in game 6: a conversion and a Granary in one pass, the Granary refused)", async () => {
    steps.resetGoldPlan();
    await pass(600);
    assert.deepEqual(converted(), [1]);
    assert.equal(purchases().length, 1, `exactly one purchase, the town upgrade: ${JSON.stringify(keys())}`);
});

test("the pass keeps its gold plan for the tab: balance, reserve, goal, what was spent", async () => {
    steps.resetGoldPlan();
    await pass(600);
    const g = state.get().autopilot.gold;
    assert.equal(g.balance, 600);
    assert.equal(g.reserve, 50, "2 turns of 25");
    assert.deepEqual([g.goal?.kind, g.goal?.cost, g.goal?.done], ["CONVERT", 500, true]);
    assert.equal(g.spent, 500);
    assert.deepEqual(g.bought.map((e) => [e.kind, e.cost]), [["CONVERT", 500]]);
    assert.deepEqual([g.cheapestConversion?.name, g.cheapestConversion?.cost], ["Pella", 500], "the cheapest the game offers (not Thebes)");
});

test("no conversion offered: no goal, the plan's purchases go on", async () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    try {
        await pass(400);
        assert.equal(purchases().length, 1, "one 250 building with 400");
        assert.ok(!keys().includes("SAVING"));
        assert.equal(state.get().autopilot.gold?.goal, null);
    } finally {
        world.canConvert = (id) => id.id === 1;
    }
});

test("towns' plan purchases take at most half the free gold, none while a goal waits", () => {
    plan([[P, "BUILDING_GRANARY", P.x + 1, P.y], [P, "BUILDING_ALTAR", P.x - 1, P.y], [A, "BUILDING_MONUMENT", A.x + 1, A.y]]);
    world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 300 });
    const where = () => purchases().map((s) => s.id.id).sort();
    try {
        world.gold = 1000;
        fake.sent.length = 0;
        steps.buyBuildings(settings.get(), 0, createBudget({ gold: 1000, reserve: 0 }));
        assert.deepEqual(where(), [0, 1], "one in Pella (half of 1000), then Athens");
        fake.sent.length = 0;
        const b = createBudget({ gold: 1000, reserve: 0 });
        b.setGoal({ kind: "CONVERT", key: "convert:0,0", cost: 100 });
        steps.buyBuildings(settings.get(), 0, b);
        assert.deepEqual(where(), [0], "a goal waits: Athens only");
    } finally {
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
        plan([[A, "BUILDING_MONUMENT", A.x + 1, A.y], [A, "BUILDING_GRANARY", A.x - 1, A.y]]);
    }
});

test("victory focus: the path's next building is saved for before the plan's purchases, then bought", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    world.canBuy = (type, _id, args) => (type === "BUILDING_LIBRARY" ? { Success: true, Plots: [idx(A.x, A.y + 1)], Cost: 400 } : { Success: args.X !== undefined, Cost: 250 });
    try {
        world.gold = 300;
        fake.sent.length = 0;
        let p = steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(p.budget.goal?.kind, "LEVER");
        steps.buyVictoryWork("SCIENCE", 0, p.budget);
        steps.buyBuildings(settings.get(), 0, p.budget);
        assert.deepEqual(purchases(), [], "300 of the Library's 400: nothing");
        world.gold = 500;
        fake.sent.length = 0;
        p = steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 });
        const out = steps.buyVictoryWork("SCIENCE", 0, p.budget);
        steps.buyBuildings(settings.get(), 0, p.budget);
        assert.equal(out[0]?.key, "VICTORY_BOUGHT");
        assert.deepEqual(purchases().map((s) => s.args.ConstructibleType), [C("BUILDING_LIBRARY")], "100 left: no 250 building");
    } finally {
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("past 1:1 a town rated CONVERT on its yields still becomes a city; a KEEP one never (decision 3)", () => {
    steps.resetGoldPlan();
    world.cities.push({ owner: 0, x: 20, y: 4, name: "Sparta", pop: 6, prod: 12 }, { owner: 0, x: 24, y: 14, name: "Corinth", pop: 6, prod: 12 });
    const pella = world.cities[1];
    Object.assign(pella, { prod: 20, pop: 8, cost: 600 });
    world.canConvert = true;
    try {
        world.gold = 2000;
        fake.sent.length = 0;
        const out = steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), [1], `Pella (production 20) of 3 cities and 2 towns: ${JSON.stringify(out)}`);
        // Pella weak too: both KEEP, nothing converted past 1:1.
        Object.assign(pella, { prod: 2, pop: 5 });
        fake.sent.length = 0;
        steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), []);
    } finally {
        world.cities.splice(3, 2);
        Object.assign(pella, { prod: 4, pop: 5, cost: 500 });
        world.canConvert = (id) => id.id === 1;
    }
});

test("the pass: on a non-final age's last turn the purchase step buys a nearly done building first (research/30 §4)", async () => {
    const buy = world.canBuy;
    world.canBuy = (type, id, args) => (type === "BUILDING_LIBRARY" ? { Success: true, InProgress: true, Plots: [idx(A.x + 1, A.y + 1)], Cost: 120 } : buy(type, id, args));
    world.cities[0].queue = { type: "BUILDING_LIBRARY", turns: 2, pct: 80 };
    world.agePoints = 100; // the age's last turn
    steps.resetGoldPlan();
    try {
        await pass(2000);
        assert.ok(keys().includes("AGE_END_BOUGHT"), JSON.stringify(keys()));
        const library = purchases().find((s) => s.args.ConstructibleType === C("BUILDING_LIBRARY"));
        assert.deepEqual([library?.args.X, library?.args.Y], [A.x + 1, A.y + 1]);
    } finally {
        world.canBuy = buy;
        delete world.cities[0].queue;
        delete world.agePoints;
        steps.resetGoldPlan();
    }
});

test("no conversion in a non-final age's last 10 turns (cities become towns again at an age change: probe P6, game 6), nor in the final age's last 25 (research/30 §3)", () => {
    steps.resetGoldPlan();
    try {
        world.gold = 2000;
        world.agePoints = 95; // about 6 turns left
        fake.sent.length = 0;
        steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), [], "the age is ending");
        // The final age: cities stay, but in its last 25 turns a city builds too little before the game ends.
        world.finalAge = true;
        fake.sent.length = 0;
        steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), [], "the final age, about 6 turns left");
        world.agePoints = 85; // about 18 left
        fake.sent.length = 0;
        steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), [], "18 turns before the game ends");
        world.agePoints = 50; // 60 left
        fake.sent.length = 0;
        steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), [1], "the final age, 60 turns left: cities stay");
    } finally {
        delete world.agePoints;
        delete world.finalAge;
    }
});

test("a rival near an economic win (the strategy's GDP goal): the cheapest gold building is saved for, then bought", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    world.canBuy = (type, _id, args) => (type === "BUILDING_MARKET" ? { Success: true, Plots: [idx(A.x, A.y + 1)], Cost: 300 } : { Success: args.X !== undefined, Cost: 250 });
    const s = { ...settings.get(), strategy: { goals: ["GDP"] } };
    try {
        world.gold = 250;
        fake.sent.length = 0;
        let p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(p.budget.goal?.kind, "GDP");
        assert.deepEqual([...steps.buyGoal(p.budget), ...steps.buyBuildings(s, 0, p.budget)], [], "250 of 300: nothing");
        world.gold = 400;
        fake.sent.length = 0;
        p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(steps.buyGoal(p.budget)[0]?.key, "GOAL_BOUGHT");
        assert.deepEqual(purchases().map((x) => x.args.ConstructibleType), [C("BUILDING_MARKET")]);
        // A wonder queued in Athens: no gold building saved for there (research/32 §6).
        world.cities[0].queued = ["WONDER_PYRAMIDS"];
        steps.resetGoldPlan();
        assert.notEqual(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.kind, "GDP");
    } finally {
        delete world.cities[0].queued;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("a codex in the archive with every slot full: the Academy is saved for, the plan's purchases wait (research/21 D6)", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    world.archive = [7];
    world.canBuy = (type, _id, args) => (type === "BUILDING_ACADEMY" ? { Success: true, Plots: [idx(A.x, A.y + 1)], Cost: 300 } : { Success: args.X !== undefined && type !== "BUILDING_LIBRARY", Cost: 250 });
    const s = { ...settings.get(), strategy: { goals: ["CONVERT", "CODEX", "LEVER"] } };
    try {
        world.gold = 250;
        fake.sent.length = 0;
        let p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(p.budget.goal?.kind, "CODEX");
        // A wonder queued in Athens since the goal was chosen: the goal is not bought there, and the next plan saves for
        // nothing there (research/32 §6).
        world.gold = 1000;
        const rich = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(rich.budget.goal?.kind, "CODEX");
        world.cities[0].queued = ["WONDER_PYRAMIDS"];
        try {
            assert.deepEqual(steps.buyGoal(rich.budget), []);
            steps.resetGoldPlan();
            assert.notEqual(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.kind, "CODEX");
        } finally {
            delete world.cities[0].queued;
            world.gold = 250;
            steps.resetGoldPlan();
        }
        p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        steps.buyGoal(p.budget);
        steps.buyBuildings(s, 0, p.budget);
        assert.deepEqual(purchases(), [], "250 of 300: the plan's 250 building waits");
        world.gold = 320;
        fake.sent.length = 0;
        p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(steps.buyGoal(p.budget)[0]?.key, "GOAL_BOUGHT");
        assert.deepEqual(purchases().map((x) => x.args.ConstructibleType), [C("BUILDING_ACADEMY")]);
    } finally {
        delete world.archive;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("a building the settlement already has is never the savings goal (the game says InsufficientFunds by the gold alone; research/22 B4)", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    const structures = world.structures;
    world.structures = (x, y) => (x === A.x + 1 && y === A.y ? { district: "DISTRICT_URBAN", constructibles: ["BUILDING_LIBRARY"] } : structures(x, y));
    world.canBuy = (type, id, args) => ((type === "BUILDING_LIBRARY" || type === "BUILDING_ACADEMY") && id.id === 0
        ? { Success: false, InsufficientFunds: true, Plots: [idx(A.x, A.y + 1)], Cost: type === "BUILDING_LIBRARY" ? 400 : 600 }
        : { Success: args.X !== undefined, Cost: 250 });
    try {
        world.gold = 300;
        const p = steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(p.budget.goal?.key, `c:${A.x}-${A.y}|BUILDING_ACADEMY`, "Athens has its Library: the Academy");
    } finally {
        world.structures = structures;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("far below the settlement cap settlers are bought: the savings goal below half the cap, else from the free gold (research/22 A1: game 7, 7 of 16 with ~1,000 gold idle)", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    world.aiSuggestions = () => [{ location: { x: 20, y: 15 } }];
    world.canBuy = (type, _id, args) => (type === "UNIT_SETTLER"
        ? ((world.gold ?? 0) >= 300 ? { Success: true, Cost: 300 } : { Success: false, InsufficientFunds: true, Cost: 300 })
        : { Success: args.X !== undefined, Cost: 250 });
    const s = { ...settings.get(), autopilot: { ...settings.get().autopilot, settlers: true } };
    const settlers = () => purchases().filter((x) => x.args.UnitType === GameInfo.Units.lookup("UNIT_SETTLER").$hash).length;
    try {
        world.settlementCap = 8; // 3 of 8: below half
        world.gold = 250;
        fake.sent.length = 0;
        let p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.equal(p.budget.goal?.kind, "SETTLER");
        steps.buyGoal(p.budget);
        steps.buyBuildings(s, 0, p.budget);
        assert.deepEqual(purchases(), [], "250 of 300 saved, the 250 buildings wait");
        world.gold = 350;
        fake.sent.length = 0;
        p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.equal(steps.buyGoal(p.budget)[0]?.key, "SETTLER_BOUGHT");
        assert.equal(settlers(), 1);
        world.settlementCap = 6; // 3 of 6: far below the cap, not below half: no goal, bought from the free gold
        world.gold = 400;
        fake.sent.length = 0;
        p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.notEqual(p.budget.goal?.kind, "SETTLER");
        assert.equal(steps.buySettlers(p.budget)[0]?.key, "SETTLER_BOUGHT");
        world.finalAge = true;
        world.agePoints = 96; // the final age's last 5 turns: it could not walk and found in time (research/24 F3)
        fake.sent.length = 0;
        p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.deepEqual(steps.buySettlers(p.budget), []);
        delete world.finalAge;
        delete world.agePoints;
        world.settlementCap = 4; // one below the cap: none
        fake.sent.length = 0;
        p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.deepEqual(steps.buySettlers(p.budget), []);
    } finally {
        delete world.finalAge;
        delete world.agePoints;
        delete world.settlementCap;
        delete world.aiSuggestions;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("the final age fills the settlement cap: a settler bought one below the cap; the military lever saves for it first (research/26 §3.3)", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    world.aiSuggestions = () => [{ location: { x: 20, y: 15 } }];
    world.canBuy = (type, _id, args) => (type === "UNIT_SETTLER"
        ? ((world.gold ?? 0) >= 300 ? { Success: true, Cost: 300 } : { Success: false, InsufficientFunds: true, Cost: 300 })
        : { Success: args.X !== undefined, Cost: 250 });
    const base = settings.get();
    const s = { ...base, autopilot: { ...base.autopilot, settlers: true }, strategy: { phase: "COMMIT", goals: ["CONVERT"], fillCap: true } };
    try {
        world.finalAge = true;
        world.agePoints = 50;
        world.settlementCap = 4; // 3 of 4: one below the cap
        world.gold = 400;
        fake.sent.length = 0;
        let p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.deepEqual(steps.buySettlers(p.budget, []), [], "not filling the cap: none one below it");
        fake.sent.length = 0;
        p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.equal(steps.buySettlers(p.budget, [], { fill: true })[0]?.key, "SETTLER_BOUGHT", "the final age fills the cap");
        world.settlementCap = 3; // at the cap: none
        fake.sent.length = 0;
        p = steps.goldPlan(s, { reserveTurns: 0 });
        assert.deepEqual(steps.buySettlers(p.budget, [], { fill: true }), []);
        // The military lever: SETTLER the first goal, also one below the cap.
        world.settlementCap = 4;
        world.gold = 100;
        const lever = { ...s, strategy: { ...s.strategy, goals: ["SETTLER", "CONVERT"], militaryLever: true } };
        p = steps.goldPlan(lever, { reserveTurns: 0 });
        assert.equal(p.budget.goal?.kind, "SETTLER");
        const off = { ...lever, autopilot: { ...lever.autopilot, settlers: false, trainSettlers: false } };
        steps.resetGoldPlan();
        p = steps.goldPlan(off, { reserveTurns: 0 });
        assert.notEqual(p.budget.goal?.kind, "SETTLER", "«Поселенцы» off: no settler goal");
    } finally {
        delete world.finalAge;
        delete world.agePoints;
        delete world.settlementCap;
        delete world.aiSuggestions;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("a savings goal more than 12 turns of income away is not saved for; nor a lever its own city builds sooner (research/23 S6)", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    // Only Athens may buy a Library.
    world.canBuy = (type, id, args) => (type === "BUILDING_LIBRARY" ? (id.id === 0 ? { Success: true, Plots: [idx(A.x, A.y + 1)], Cost: 400 } : { Success: false }) : { Success: args.X !== undefined, Cost: 250 });
    const income = world.goldIncome;
    const athens = world.cities[0];
    try {
        world.gold = 100;
        world.goldIncome = 25; // 300 short: 12 turns
        assert.equal(steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.kind, "LEVER");
        world.goldIncome = 20; // 15 turns
        assert.equal(steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 }).budget.goal, null, "15 turns away");
        world.goldIncome = -5;
        assert.equal(steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 }).budget.goal, null, "income below zero");
        // Athens builds the Library itself in 3 turns: no gold held for it.
        world.goldIncome = 25;
        athens.queue = { type: "BUILDING_LIBRARY", turns: 3, pct: 0 };
        assert.equal(steps.goldPlan(settings.get(), { focus: "SCIENCE", reserveTurns: 0 }).budget.goal, null, "its city builds it in 3 turns");
    } finally {
        delete athens.queue;
        world.goldIncome = income;
        world.gold = 600;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("codices waiting: an Academy already queued may be bought (research/23 S8: it sat queued 17 turns while codices waited)", () => {
    steps.resetGoldPlan();
    world.canConvert = false;
    world.archive = [7];
    world.canBuy = (type, _id, args) => (type === "BUILDING_ACADEMY" ? { Success: true, Plots: [idx(A.x, A.y + 1)], Cost: 300 } : { Success: args.X !== undefined && type !== "BUILDING_LIBRARY", Cost: 250 });
    const s = { ...settings.get(), strategy: { goals: ["CODEX"] } };
    const athens = world.cities[0];
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 5, pct: 50 };
        athens.queued = ["BUILDING_ACADEMY"];
        world.gold = 400;
        assert.equal(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.kind, "CODEX");
        athens.queue = { type: "BUILDING_ACADEMY", turns: 5, pct: 50 };
        delete athens.queued;
        steps.resetGoldPlan();
        assert.equal(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal, null, "in production with progress: not bought");
    } finally {
        delete athens.queue;
        delete athens.queued;
        delete world.archive;
        world.gold = 600;
        world.canConvert = (id) => id.id === 1;
        world.canBuy = (_type, _id, args) => ({ Success: args.X !== undefined, Cost: 250 });
    }
});

test("the final age with the score victory off has no last turns: conversions go on (research/31 §1: game 26 went 52 turns past Modern's 100%)", () => {
    steps.resetGoldPlan();
    const vm = Game.VictoryManager;
    try {
        world.gold = 2000;
        world.finalAge = true;
        world.agePoints = 95; // the estimate says about 6 turns left
        Game.VictoryManager = { isScoreVictoryEnabled: () => false };
        fake.sent.length = 0;
        steps.convertTowns(settings.get(), 0);
        assert.deepEqual(converted(), [1], "the game does not end with the age");
    } finally {
        Game.VictoryManager = vm;
        delete world.agePoints;
        delete world.finalAge;
    }
});
