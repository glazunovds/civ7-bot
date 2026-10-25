// Game 60 (errors E2): the conversion the gold plan saved Самара's 950 for 14 turns was missed on Antiquity's last two turns.
// T139: 1,142 gold less a 24-gold repair and the 181 reserve left it 13 short; T140 dropped the goal (the horizon 0, 1,032
// less a 199 reserve below the price), and Самара cost 2,350 from E2. The gold carries over in full (root gotcha 31), so on
// a non-final age's last turns a conversion goal takes the reserve too, stays while the whole treasury covers it, and
// improvement repairs wait for it. And the culture focus never tried a new age's first-turn window: every focus now converts
// there up to the 1:1 floor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };    // the capital
const S = { x: 14, y: 8 };   // Samara, a town: its conversion 950
const T = { x: 8, y: 14 };   // Tula, a town (a city last age)
const K = { x: 14, y: 14 };  // Kazan, a town
const V = { x: 20, y: 8 };   // Saratov, a town
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: Math.abs(x - A.x) <= 1 && Math.abs(y - A.y) <= 1 ? 0 : -1 }),
    structures: (x, y) => (x === A.x && y === A.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...A, name: "Petersburg", pop: 10, prod: 20, food: 10, happy: 10 },
        { owner: 0, ...S, name: "Samara", isTown: true, pop: 7, prod: 6, happy: 5, cost: 950 },
        { owner: 0, ...T, name: "Tula", isTown: true, pop: 5, prod: 2, happy: 5, cost: 1400 },
        { owner: 0, ...K, name: "Kazan", isTown: true, pop: 5, prod: 3, happy: 5, cost: 800 },
        { owner: 0, ...V, name: "Saratov", isTown: true, pop: 5, prod: 2, happy: 5, cost: 1200 },
    ],
    gold: 1142,
    goldIncome: 90.5, // 2 turns: a reserve of 181
    canConvert: (id) => id.id === 1,
};
const fake = installFakeEngine(world, "exploration");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { resetRepairWatch } = await import("../mod/expansion-planner/ui/data/xpl-repair-watch.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const culture = { ...DEFAULT_SETTINGS, strategy: { goals: ["CONVERT"] } };
const purchases = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE);
const converted = () => purchases().filter((s) => s.args.Directive === OrderTypes.ORDER_TOWN_UPGRADE).map((s) => world.cities.filter((c) => c.owner === 0)[s.id.id].name);
const repaired = () => purchases().filter((s) => s.args.ConstructibleType !== undefined).map((s) => GameInfo.Constructibles.lookup(s.args.ConstructibleType).ConstructibleType);
// The capital's Gristmill (a building: all the gold) and Tula's Woodcutter (an improvement) pillaged, 24 gold each.
world.canBuild = (type, id) => {
    if (type === "BUILDING_GRISTMILL" && id.id === 0) return { Success: true, RepairDamaged: true, Plots: [idx(A.x, A.y + 1)] };
    if (type === "IMPROVEMENT_WOODCUTTER" && id.id === 2) return { Success: true, RepairDamaged: true, Plots: [idx(T.x + 1, T.y)] };
    return { Success: true, Plots: [] };
};
world.canBuy = () => ({ Success: true, Cost: 24 });

/** About `left` turns before the age ends (no pace known yet: that share of 120 turns); 0: its points are full. */
function ageLeft(left) {
    GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
    world.agePoints = 100 - (left / 120) * 100;
}

/** The pass's gold steps in the hud's order: the plan, repairs, then the town conversion. */
function pass(gold, income, settingsNow = culture) {
    world.gold = gold;
    world.goldIncome = income;
    fake.sent.length = 0;
    resetRepairWatch();
    steps.resetGoldPlan();
    Game.turn += 1;
    const p = steps.goldPlan(settingsNow, { focus: "CULTURE", reserveTurns: 2 });
    const repairs = steps.repairBuildings({ budget: p.budget });
    const towns = steps.convertTowns(settingsNow, p, { focus: "CULTURE" });
    return { p, repairs, towns };
}

test("T139: the last turns' conversion takes the reserve too, ahead of an improvement's repair (1,142 gold, a 24 repair, a 181 reserve, 950)", () => {
    try {
        ageLeft(0);
        const { p, repairs, towns } = pass(1142, 90.5);
        assert.equal(p.budget.reserve, 181);
        assert.deepEqual(converted(), ["Samara"], JSON.stringify(towns));
        assert.ok(repaired().includes("BUILDING_GRISTMILL"), "a building's repair still comes first");
        assert.ok(!repaired().includes("IMPROVEMENT_WOODCUTTER"), "the improvement waits for the conversion");
        const deferred = repairs.find((e) => e.key === "REPAIR_DEFERRED");
        assert.ok(String(deferred?.args?.[2]).includes("LOC_XPL_AP_REPAIR_WHY_CONVERT"), JSON.stringify(repairs));
    } finally {
        delete world.agePoints;
    }
});

test("T140: the goal stays while the whole treasury covers it (1,032 gold, a 199 reserve), and the conversion is bought", () => {
    try {
        ageLeft(0);
        const { p } = pass(1032, 99.5);
        assert.equal(p.budget.reserve, 199);
        assert.equal(p.budget.goal?.kind, "CONVERT", "kept on the last turn");
        assert.deepEqual(converted(), ["Samara"]);
    } finally {
        delete world.agePoints;
    }
});

// Review of game 60's build: at a deficit the reserve is DEFICIT_RESERVE_TURNS of it, there to keep the treasury above zero
// (negative gold carries over too: «Cities will become Unhappy and Units may be forced to disband»), and it stays.
test("at a deficit the last turns' conversion leaves the reserve (T139's gold at −20 a turn: a 200 reserve)", () => {
    try {
        ageLeft(0);
        const { p } = pass(1142, -20);
        assert.equal(p.budget.reserve, 200);
        assert.ok(!p.budget.goal?.noReserve, JSON.stringify(p.budget.goal));
        assert.deepEqual(converted(), [], "1,118 after the repair less the 200 reserve is below the 950");
        assert.ok(p.budget.all() >= p.budget.reserve, `${p.budget.all()} left`);
    } finally {
        delete world.agePoints;
    }
});

test("mid-age the reserve stays: the same T139 numbers 40 turns before the end convert nothing; nor without «expect to keep cities» at the end", () => {
    try {
        ageLeft(40);
        pass(1142, 90.5);
        assert.deepEqual(converted(), [], "937 above the reserve");
        ageLeft(0);
        pass(1142, 90.5, { ...culture, towns: { ...DEFAULT_SETTINGS.towns, expectKeepCities: false } });
        assert.deepEqual(converted(), [], "the age's last turns convert nothing when the cities are not expected back");
    } finally {
        delete world.agePoints;
    }
});

// Game 60: Exploration's first turn tried no conversion with the culture focus (convertAtAgeStart: science and economy only).
test("a new age's first turn converts for any focus up to the 1:1 floor (science and economy up to their city target)", async () => {
    const send = Game.CityCommands.sendRequest;
    Game.CityCommands.sendRequest = (id, op, args) => {
        send(id, op, args);
        if (args?.Directive === OrderTypes.ORDER_TOWN_UPGRADE) world.cities.filter((c) => c.owner === 0)[id.id].isTown = false;
    };
    const towns = world.cities.map((c) => c.isTown);
    world.canConvert = () => true;
    try {
        settings.remember(gameKey(), { ageCities: `AGE_ANTIQUITY|${A.x},${A.y};${T.x},${T.y}` }); // Tula comes back with the card
        world.gold = 5000;
        fake.sent.length = 0;
        let out = await steps.convertAtAgeStart(createBudget({ gold: 5000 }), "CULTURE");
        assert.deepEqual(converted(), ["Samara"], "2 cities (Tula back) and 3 towns: the most production per gold reaches the floor");
        assert.deepEqual(out.map((e) => e.key), ["TOWN_CONVERTED_AGE_START"]);
        // No focus at all: the same floor.
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        fake.sent.length = 0;
        out = await steps.convertAtAgeStart(createBudget({ gold: 5000 }), null);
        assert.equal(out.length, 1);
        // Science: up to its target (6 entering Exploration): every town that was no city.
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        fake.sent.length = 0;
        out = await steps.convertAtAgeStart(createBudget({ gold: 5000 }), "SCIENCE");
        assert.equal(out.length, 3);
    } finally {
        Game.CityCommands.sendRequest = send;
        world.cities.forEach((c, i) => { c.isTown = towns[i]; });
        world.canConvert = (id) => id.id === 1;
        settings.remember(gameKey(), { ageCities: null });
        world.gold = 1142;
    }
});

// Game 60, A98: the goal went from Самара (700) to Нижний Новгород (850), and no line said why Самара left the list.
test("UI.log says why the town a conversion goal saved for left the list", () => {
    const samara = world.cities[1];
    const lines = [];
    const warn = console.warn;
    try {
        ageLeft(40);
        steps.resetGoldPlan();
        world.gold = 200;
        world.goldIncome = 50; // within reach before the age ends
        const goal = steps.goldPlan(culture, { focus: "CULTURE", reserveTurns: 2 }).budget.goal;
        assert.equal(goal?.key, `convert:${S.x},${S.y}`);
        samara.unrest = true;
        console.warn = (...a) => lines.push(a.join(" "));
        steps.goldPlan(culture, { focus: "CULTURE", reserveTurns: 2 });
        console.warn = warn;
        assert.ok(lines.some((l) => l.includes("conversions: Samara left the list: unrest or unhappy")), lines.join(" | "));
        // Said once: the goal is gone with it.
        lines.length = 0;
        console.warn = (...a) => lines.push(a.join(" "));
        steps.goldPlan(culture, { focus: "CULTURE", reserveTurns: 2 });
        assert.ok(!lines.some((l) => l.includes("left the list")), lines.join(" | "));
    } finally {
        console.warn = warn;
        delete samara.unrest;
        delete world.agePoints;
        steps.resetGoldPlan();
        world.gold = 1142;
        world.goldIncome = 90.5;
    }
});

// Game 61: Antiquity's last turn bought two Granaries for 156; on Exploration's first turn the window had 71 gold above the
// reserve against Спахан's 550 (1,500 once the card brought the cities back). With no conversion to make now (Спахан waited
// in unrest), a non-final age's last 2 turns keep the cheapest town's price for the window, held whole (a BANK goal).
test("game 61: the age's last turns with no conversion to make now keep the cheapest town's price for the next age's window", () => {
    const canConvert = world.canConvert;
    try {
        world.canConvert = () => false;
        ageLeft(1);
        const { p } = pass(600, 50);
        assert.deepEqual([p.budget.goal?.kind, p.budget.goal?.key], ["BANK", "WINDOW_BANK"], JSON.stringify(p.budget.goal));
        assert.equal(p.budget.goal.cost, Math.ceil(800 * 1.15), "Kazan's 800, the cheapest town, and a margin");
        assert.equal(p.budget.free(), 0, "nothing free for buildings below it");
        ageLeft(30);
        assert.notEqual(pass(600, 50).p.budget.goal?.key, "WINDOW_BANK", "mid-age: no window bank");
    } finally {
        world.canConvert = canConvert;
        delete world.agePoints;
    }
});

// Game 62 (Deity): on A69 a conversion was listed but out of reach (115 gold against 487); it dropped the window's bank and
// left no goal, and Exploration's window had 153 gold against 525. The bank stays unless the treasury buys a conversion now.
test("game 62: a conversion listed but out of the treasury's reach on the last turns leaves the window's bank in place", () => {
    try {
        ageLeft(1);
        const { p, towns } = pass(600, 50);
        assert.deepEqual([p.budget.goal?.kind, p.budget.goal?.key], ["BANK", "WINDOW_BANK"], "Samara's 950 is out of reach with 600");
        assert.deepEqual(converted(), [], JSON.stringify(towns));
        // With 1,142 the conversion is bought now (the T139 test), and no bank.
        assert.notEqual(pass(1142, 90.5).p.budget.goal?.key, "WINDOW_BANK");
    } finally {
        delete world.agePoints;
    }
});
