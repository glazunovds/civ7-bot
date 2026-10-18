// Cities for the science victory (research/39): conversions saved for at any horizon and kept on one town, the cheapest
// conversions on a new age's first turn, a revolt guard, «expect to keep cities» on, and why no conversion is listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };    // Athens, the capital
const P = { x: 14, y: 8 };   // Pella, a town (a city last age)
const T = { x: 8, y: 14 };   // Thebes, a town
const K = { x: 14, y: 14 };  // Corinth, a town
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: Math.abs(x - A.x) <= 1 && Math.abs(y - A.y) <= 1 ? 0 : -1 }),
    structures: (x, y) => (x === A.x && y === A.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...A, name: "Athens", pop: 10, prod: 20, food: 10, happy: 10 },
        { owner: 0, ...P, name: "Pella", isTown: true, pop: 6, prod: 4, happy: 5, cost: 1000 },
        { owner: 0, ...T, name: "Thebes", isTown: true, pop: 5, prod: 2, happy: 5, cost: 900 },
        { owner: 0, ...K, name: "Corinth", isTown: true, pop: 7, prod: 6, happy: 5, cost: 600 },
    ],
    gold: 100,
    goldIncome: 10,
};
const fake = installFakeEngine(world, "exploration");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const science = { ...DEFAULT_SETTINGS, strategy: { goals: ["CONVERT", "LEVER"], cityTarget: 6, phase: "BUILD" } };
const converted = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE && s.args.Directive === OrderTypes.ORDER_TOWN_UPGRADE).map((s) => world.cities.filter((c) => c.owner === 0)[s.id.id].name);

// Game 32 (research/39 §2B): no savings goal at all E1-E16 (every conversion more than 12 turns of income away), then the goal
// went back and forth between Liverpool and the cheaper Leeds.
test("a conversion below the city target is saved for at any horizon, and the town chosen stays the goal", () => {
    const pella = world.cities[1];
    try {
        steps.resetGoldPlan();
        world.gold = 100;
        world.goldIncome = 10; // Corinth's 600 is 50 turns of income away
        let goal = steps.goldPlan(science, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal;
        assert.deepEqual([goal?.kind, goal?.key], ["CONVERT", `convert:${K.x},${K.y}`], "the most production per gold");
        // Pella now makes the most per gold: Corinth stays the goal.
        pella.prod = 60;
        goal = steps.goldPlan(science, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal;
        assert.equal(goal?.key, `convert:${K.x},${K.y}`);
        // Forgotten (a new game): Pella first.
        steps.resetGoldPlan();
        goal = steps.goldPlan(science, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal;
        assert.equal(goal?.key, `convert:${P.x},${P.y}`);
    } finally {
        pella.prod = 4;
        steps.resetGoldPlan();
        world.gold = 100;
        world.goldIncome = 10;
    }
});

// Research/39 §2A: every city but the capital is a town on a new age's first turn, until the card brings them back on turn 2:
// only the capital counts in a conversion's price then.
test("a new age's first turn converts the best towns that were not cities in the last age, one after another", async () => {
    const send = Game.CityCommands.sendRequest;
    // The game makes the town a city a moment after the purchase.
    Game.CityCommands.sendRequest = (id, op, args) => {
        send(id, op, args);
        if (args?.Directive === OrderTypes.ORDER_TOWN_UPGRADE) world.cities.filter((c) => c.owner === 0)[id.id].isTown = false;
    };
    const towns = world.cities.map((c) => c.isTown);
    try {
        settings.remember(gameKey(), { ageCities: `AGE_ANTIQUITY|${A.x},${A.y};${P.x},${P.y}` }); // Athens and Pella were cities
        world.gold = 2000;
        fake.sent.length = 0;
        let out = await steps.convertAtAgeStart(createBudget({ gold: 2000 }), "CULTURE");
        assert.deepEqual(out, [], "science and economy only");
        out = await steps.convertAtAgeStart(createBudget({ gold: 2000 }), "SCIENCE");
        assert.deepEqual(converted(), ["Corinth", "Thebes"], "Pella comes back with the card");
        assert.deepEqual(out.map((e) => e.key), ["TOWN_CONVERTED_AGE_START", "TOWN_CONVERTED_AGE_START"]);
        // The gold above the reserve only.
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        world.gold = 1000;
        fake.sent.length = 0;
        await steps.convertAtAgeStart(createBudget({ gold: 1000, reserve: 300 }), "SCIENCE");
        assert.deepEqual(converted(), ["Corinth"], "700 above the reserve: Thebes's 900 waits");
        // This age's own cities remembered (a later turn, or a reload): no window, though fewer cities stand.
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        settings.remember(gameKey(), { ageCities: `AGE_EXPLORATION|${A.x},${A.y};${P.x},${P.y}` });
        world.gold = 2000;
        fake.sent.length = 0;
        await steps.convertAtAgeStart(createBudget({ gold: 2000 }), "SCIENCE");
        assert.deepEqual(converted(), []);
        steps.noteCitiesForNextAge();
        assert.equal(settings.recall(gameKey(), "ageCities"), `AGE_EXPLORATION|${A.x},${A.y}`);
    } finally {
        Game.CityCommands.sendRequest = send;
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        settings.remember(gameKey(), { ageCities: null });
        world.gold = 100;
    }
});

// Game 32 (research/39 §2C): Бирмингем, a city since A28, revolted at A61 in Antiquity's Revolts crisis; the game's warning
// asks for Happiness infrastructure there.
test("a settlement a revolt may take buys a Happiness building there from all the gold", () => {
    const thebes = world.cities[2];
    world.canBuy = (type, id) => (type === "BUILDING_TEMPLE" && id.id === 2 ? { Success: true, Plots: [idx(T.x + 1, T.y)], Cost: 200 } : { Success: false });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE && s.args.ConstructibleType === GameInfo.Constructibles.lookup("BUILDING_TEMPLE").$hash).map((s) => s.id.id);
    try {
        fake.sent.length = 0;
        assert.deepEqual(steps.guardRevolts(createBudget({ gold: 300, reserve: 250 })), [], "calm: nothing");
        thebes.unrest = true;
        fake.sent.length = 0;
        const out = steps.guardRevolts(createBudget({ gold: 300, reserve: 250 }));
        assert.deepEqual(bought(), [2], "the reserve too");
        assert.equal(out[0]?.key, "REVOLT_GUARD");
    } finally {
        delete thebes.unrest;
        delete world.canBuy;
    }
});

test("«expect to keep cities» is on: the player always takes the card that keeps them (research/39 §4.5)", () => {
    const store = globalThis.localStorage;
    const before = store.getItem("modSettings");
    try {
        assert.equal(DEFAULT_SETTINGS.towns.expectKeepCities, true);
        store.setItem("modSettings", JSON.stringify({ "expansion-planner": { v: 1, towns: { expectKeepCities: false } } }));
        assert.equal(settings.load().towns.expectKeepCities, true, "an older blob is moved on");
        store.setItem("modSettings", JSON.stringify({ "expansion-planner": { v: 2, towns: { expectKeepCities: false } } }));
        assert.equal(settings.load().towns.expectKeepCities, false, "the player's own choice since stays");
    } finally {
        if (before === null) store.removeItem("modSettings");
        else store.setItem("modSettings", before);
        settings.load();
    }
});

// Research/39 §4.8: game 32's Antiquity listed no conversion at A52-A60 and the log did not say why.
test("UI.log says why no town may become a city", () => {
    const lines = [];
    const warn = console.warn;
    const info = console.log;
    console.warn = console.log = (...a) => lines.push(a.join(" "));
    world.canConvert = false;
    Game.turn += 1;
    try {
        steps.resetGoldPlan();
        steps.goldPlan(science, { focus: "SCIENCE", reserveTurns: 0 });
    } finally {
        console.warn = warn;
        console.log = info;
        Game.turn -= 1;
        delete world.canConvert;
    }
    assert.ok(lines.some((l) => l.includes("conversions: none of 3 town(s)") && l.includes("Pella") && l.includes("cannot")), lines.filter((l) => l.includes("conversion")).join(" | "));
});

test("the pass: a new age's first-turn conversion, a revolt guard's purchase, and the cities remembered for the next age", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const thebes = world.cities[2];
    const send = Game.CityCommands.sendRequest;
    Game.CityCommands.sendRequest = (id, op, args) => {
        send(id, op, args);
        if (args?.Directive === OrderTypes.ORDER_TOWN_UPGRADE) world.cities.filter((c) => c.owner === 0)[id.id].isTown = false;
    };
    const towns = world.cities.map((c) => c.isTown);
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 500 }];
    Players.get(0).LegacyPaths = { getScore: () => 20 };
    const off = { research: false, production: false, growth: false, choices: false, befriend: false, wonders: false, resources: false, tacks: false };
    settings.patch({ autopilot: { ...off, focus: true, victory: "SCIENCE", purchases: true, towns: true, replanEvery: 0, skipUnits: false, endTurn: false } });
    world.canBuy = (type, id) => (type === "BUILDING_TEMPLE" && id.id === 2 ? { Success: true, Plots: [idx(T.x + 1, T.y)], Cost: 200 } : { Success: false });
    try {
        settings.remember(gameKey(), { ageCities: `AGE_ANTIQUITY|${A.x},${A.y};${P.x},${P.y}` });
        world.gold = 2000;
        thebes.unrest = true; // not converted (calmEnough), guarded
        state.set({ autopilot: { ...(state.get().autopilot ?? {}), log: [] } });
        await autopilot.runTurn(true);
        const keys = (state.get().autopilot.log ?? []).map((e) => e.key);
        assert.ok(keys.includes("TOWN_CONVERTED_AGE_START") && keys.includes("REVOLT_GUARD"), JSON.stringify(keys));
        assert.ok(String(settings.recall(gameKey(), "ageCities")).startsWith("AGE_EXPLORATION|"), "this age's cities, for the next");
    } finally {
        Game.CityCommands.sendRequest = send;
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        delete thebes.unrest;
        delete world.canBuy;
        delete Players.get(0).LegacyPaths;
        world.gold = 100;
        settings.remember(gameKey(), { ageCities: null });
        settings.patch({ autopilot: { ...Object.fromEntries(Object.keys(off).map((k) => [k, true])), focus: false, victory: "AUTO" } });
    }
});
