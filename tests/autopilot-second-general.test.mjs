// The second general (W1, game 60: Catherine at Standard speed had one general all Antiquity). A commander costs 300
// production at Standard, 10-17 turns of the capital, against GENERAL.TRAIN_TURNS 8 tuned at Online, so none was queued; the
// gold plan's town conversion held the free gold T61-T131, so none was bought either.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };    // Athens, the city
const P = { x: 14, y: 8 };   // Pella, a town: conversion 500
const T = { x: 8, y: 14 };   // Thebes, a town: conversion 400, the game offers none
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: Math.abs(x - A.x) <= 1 && Math.abs(y - A.y) <= 1 ? 0 : -1 }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...A, name: "Athens", pop: 8, prod: 25, food: 10, happy: 10 },
        { owner: 0, ...P, name: "Pella", isTown: true, pop: 5, prod: 4, happy: 5, cost: 500 },
        { owner: 0, ...T, name: "Thebes", isTown: true, pop: 5, prod: 2, happy: 5, cost: 400 },
    ],
    units: [], gold: 0, goldIncome: 10,
    canConvert: (id) => id.id === 1,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const DEFEND = { ...DEFAULT_SETTINGS, autopilot: { ...DEFAULT_SETTINGS.autopilot, defend: true } };
const sells = (price) => (type) => (type === "UNIT_ARMY_COMMANDER" ? { Success: true, Cost: price } : { Success: false });
const trained = () => fake.sent.filter((s) => s.kind === "operation" && GameInfo.Units.lookup(s.args.UnitType)?.UnitType === "UNIT_ARMY_COMMANDER");
const bought = () => fake.sent.filter((s) => s.kind === "command" && GameInfo.Units.lookup(s.args.UnitType)?.UnitType === "UNIT_ARMY_COMMANDER");
const fresh = (extra = {}) => {
    steps.resetGoldPlan();
    fake.sent.length = 0;
    for (const k of ["canBuy", "costOf", "agePoints"]) delete world[k];
    world.units = [{ id: 1, type: "UNIT_ARMY_COMMANDER", ...A }];
    Object.assign(world, { gold: 0, goldIncome: 10 }, extra);
    GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
};
// Standard speed (GameSpeeds CostMultiplier 100, read as carriedGoldCap reads it); the fixtures have no GameSpeeds (×1).
const atStandard = (fn) => {
    const config = Configuration.getGame;
    const speeds = GameInfo.GameSpeeds;
    GameInfo.GameSpeeds = { lookup: (t) => (t === "GAMESPEED_STANDARD" ? { CostMultiplier: 100 } : null) };
    Configuration.getGame = () => ({ ...config(), gameSpeedType: "GAMESPEED_STANDARD" });
    try {
        return fn();
    } finally {
        Configuration.getGame = config;
        GameInfo.GameSpeeds = speeds;
    }
};
const quiet = (fn) => {
    const saved = [console.warn, console.info];
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    console.info = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        [console.warn, console.info] = saved;
    }
    return lines;
};

test("W1: at Standard a second commander is trained where it takes up to 16 turns (game 60: 300 production at 25 a turn, 12)", () => {
    fresh({ costOf: () => 300 });
    steps.fillProduction(new Map(), { defend: true });
    assert.equal(trained().length, 0, "at Online's limit (no game speed known) 12 turns is too slow");
    fresh({ costOf: () => 300 });
    atStandard(() => steps.fillProduction(new Map(), { defend: true }));
    assert.equal(trained().length, 1, JSON.stringify(fake.sent));
    // Too slow at Standard as well: 300 at 10 a turn.
    fresh({ costOf: () => 300 });
    world.cities[0].prod = 10;
    try {
        atStandard(() => steps.fillProduction(new Map(), { defend: true }));
        assert.equal(trained().length, 0, "30 turns");
    } finally {
        world.cities[0].prod = 25;
    }
});

test("W1: not where the age leaves no time to reach the first level; UI.log says why every 10 turns", () => {
    const turn = Game.turn;
    try {
        // 25 turns left: 12 to train, 20 more for the first level at Standard (XP short of it is lost at the age change).
        fresh({ costOf: () => 300, agePoints: 100 - (25 / 120) * 100, canBuy: sells(1200) });
        Game.turn = 40;
        let lines = quiet(() => atStandard(() => steps.fillProduction(new Map(), { defend: true })));
        assert.equal(trained().length, 0);
        const why = lines.filter((l) => l.includes("generals: no second commander"));
        assert.equal(why.length, 1, JSON.stringify(lines));
        assert.match(why[0], /no second commander: 12 turns in Athens \(limit 16, 2[45] left in the age\), price 1200, free -?\d+/);
        // Once in 10 turns.
        Game.turn = 41;
        lines = quiet(() => atStandard(() => steps.fillProduction(new Map(), { defend: true })));
        assert.equal(lines.filter((l) => l.includes("no second commander")).length, 0);
        Game.turn = 50;
        lines = quiet(() => atStandard(() => steps.fillProduction(new Map(), { defend: true })));
        assert.equal(lines.filter((l) => l.includes("no second commander")).length, 1);
        // 60 turns left: trained.
        fresh({ costOf: () => 300, agePoints: 100 - (60 / 120) * 100 });
        atStandard(() => steps.fillProduction(new Map(), { defend: true }));
        assert.equal(trained().length, 1);
        // 25 turns left: none trained in time, but one bought now has its 20 (the gold buys it; short of it, it is saved for);
        // 15 left: none bought, nor saved for.
        for (const [left, buys] of [[25, true], [15, false]]) {
            fresh({ gold: 2000, goldIncome: 100, costOf: () => 300, agePoints: 100 - (left / 120) * 100, canBuy: sells(600), canConvert: () => false });
            const pass = atStandard(() => steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 }));
            assert.equal(atStandard(() => steps.buyCommander(pass.budget)).length, buys ? 1 : 0, `${left} turns left`);
            steps.resetGoldPlan();
            world.gold = 300;
            const goal = atStandard(() => steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 })).budget.goal?.kind;
            if (buys) assert.equal(goal, "COMMANDER", `${left} turns left: saved for`);
            else assert.notEqual(goal, "COMMANDER", `${left} turns left: not saved for`);
        }
    } finally {
        Game.turn = turn;
        delete world.agePoints;
        world.canConvert = (id) => id.id === 1;
        GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
    }
});

test("W1: the want's purchase test is buyCommander's free gold: with a conversion holding the rest, the commander is trained", () => {
    // 900 gold, a 20 reserve, Pella's conversion held (500): 380 free against a 600 commander. All the gold above the reserve
    // (880) would buy it, so the want said «bought», and buyCommander, on the free gold, bought nothing.
    fresh({ gold: 900, costOf: () => 50, canBuy: sells(600) });
    const pass = steps.goldPlan(DEFEND, { focus: null, reserveTurns: 2 });
    assert.equal(pass.budget.goal?.kind, "CONVERT", JSON.stringify(pass.budget.goal));
    assert.deepEqual(steps.buyCommander(pass.budget), []);
    steps.fillProduction(new Map(), { defend: true });
    assert.equal(trained().length, 1, JSON.stringify(fake.sent));
    // The free gold buys it: bought, none trained (one bought this turn counts).
    fresh({ gold: 1500, costOf: () => 50, canBuy: sells(600) });
    const rich = steps.goldPlan(DEFEND, { focus: null, reserveTurns: 2 });
    assert.deepEqual(steps.buyCommander(rich.budget).map((e) => e.key), ["COMMANDER_BOUGHT"]);
    steps.fillProduction(new Map(), { defend: true });
    assert.equal(trained().length, 0, "bought this turn");
    assert.equal(bought().length, 1);
});

test("W1: a commander no city trains in time is a savings goal after a town conversion, bought from the gold held for it", () => {
    // No conversion offered (Pella's town refused): the commander is the goal.
    fresh({ gold: 300, goldIncome: 100, costOf: () => 300, canBuy: sells(600), canConvert: () => false });
    try {
        let pass = steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 });
        assert.equal(pass.budget.goal?.kind, "COMMANDER", JSON.stringify(pass.budget.goal));
        assert.equal(pass.budget.goal.label, "LOC_XPL_AP_GOAL_COMMANDER(Athens)");
        assert.deepEqual(steps.buyCommander(pass.budget), [], "300 of 600");
        // With the gold: bought from the goal's own (free() leaves out what the goal holds).
        steps.resetGoldPlan();
        world.gold = 700;
        pass = steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 });
        assert.ok(pass.budget.free() < 600, `free ${pass.budget.free()}`);
        assert.deepEqual(steps.buyCommander(pass.budget).map((e) => e.key), ["COMMANDER_BOUGHT"]);
        // A conversion comes first.
        fresh({ gold: 300, goldIncome: 100, costOf: () => 300, canBuy: sells(600), canConvert: (id) => id.id === 1 });
        pass = steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 });
        assert.equal(pass.budget.goal?.kind, "CONVERT");
        // No goal when a city trains one in time, nor without «Оборона».
        fresh({ gold: 300, goldIncome: 100, costOf: () => 50, canBuy: sells(600), canConvert: () => false });
        assert.notEqual(steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 }).budget.goal?.kind, "COMMANDER");
        fresh({ gold: 300, goldIncome: 100, costOf: () => 300, canBuy: sells(600), canConvert: () => false });
        assert.notEqual(steps.goldPlan(DEFAULT_SETTINGS, { focus: null, reserveTurns: 0 }).budget.goal?.kind, "COMMANDER");
    } finally {
        world.canConvert = (id) => id.id === 1;
        steps.resetGoldPlan();
    }
});

// The review of W1: the goal and the training asked "a city trains it in time" by different rules, a refused purchase held the
// goal's gold for good, and with purchases off the free gold kept the want away though nothing would buy one.
test("W1: no city trains it where the training would not (infected, kept for a Launch Pad): it is saved for", () => {
    try {
        // Athens trains one in 2 turns, but it is infected: none trained, so it is the goal.
        fresh({ gold: 300, goldIncome: 100, costOf: () => 50, canBuy: sells(600), canConvert: () => false });
        world.cities[0].infected = true;
        steps.fillProduction(new Map(), { defend: true });
        assert.equal(trained().length, 0, "infected");
        assert.equal(steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 }).budget.goal?.kind, "COMMANDER");
        delete world.cities[0].infected;
        // Athens kept for a Launch Pad near Rocketry (padExclusion), Pella a city too slow for one (50 at 4 a turn).
        fresh({ gold: 300, goldIncome: 100, costOf: () => 50, canBuy: sells(600), canConvert: () => false });
        world.cities[1].isTown = false;
        const strategy = { padCitiesNoWonders: true, gate: { open: true }, pads: 1 };
        assert.deepEqual([...steps.padExclusion(strategy)], ["c:8-8"]);
        steps.fillProduction(new Map(), { defend: true, strategy });
        assert.equal(trained().length, 0, "kept for a pad");
        assert.equal(steps.goldPlan({ ...DEFEND, strategy }, { focus: null, reserveTurns: 0 }).budget.goal?.kind, "COMMANDER");
        // Without the pad rule Athens trains it: no goal.
        steps.resetGoldPlan();
        assert.notEqual(steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 }).budget.goal?.kind, "COMMANDER");
    } finally {
        delete world.cities[0].infected;
        world.cities[1].isTown = true;
        world.canConvert = (id) => id.id === 1;
        steps.resetGoldPlan();
    }
});

test("W1: a commander goal the game refuses three turns in a row is dropped for a while", () => {
    const turn = Game.turn;
    try {
        fresh({ gold: 700, goldIncome: 100, costOf: () => 300, canBuy: sells(600), canConvert: () => false });
        // The purchase is sent each turn and the game never counts it (our one commander stays the only one).
        for (let i = 0; i < 3; i++) {
            const pass = steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 });
            assert.equal(pass.budget.goal?.kind, "COMMANDER", `turn ${i}`);
            assert.deepEqual(steps.buyCommander(pass.budget).map((e) => e.key), ["COMMANDER_BOUGHT"]);
            Game.turn++;
        }
        assert.notEqual(steps.goldPlan(DEFEND, { focus: null, reserveTurns: 0 }).budget.goal?.kind, "COMMANDER");
    } finally {
        Game.turn = turn;
        world.canConvert = (id) => id.id === 1;
        steps.resetGoldPlan();
    }
});

test("W1: with purchases off the free gold does not keep the second commander out of production", () => {
    // 1,500 gold buys one (600): with purchases on, buyCommander does (none trained); off, it is trained.
    fresh({ gold: 1500, costOf: () => 50, canBuy: sells(600) });
    steps.goldPlan(DEFEND, { focus: null, reserveTurns: 2 });
    steps.fillProduction(new Map(), { defend: true });
    assert.equal(trained().length, 0, "the purchase step buys it");
    fresh({ gold: 1500, costOf: () => 50, canBuy: sells(600) });
    steps.goldPlan(DEFEND, { focus: null, reserveTurns: 2 });
    steps.fillProduction(new Map(), { defend: true, purchases: false });
    assert.equal(trained().length, 1, JSON.stringify(fake.sent));
});
