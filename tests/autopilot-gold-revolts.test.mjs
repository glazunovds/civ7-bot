// Game 60 (errors M2): the revolt guard in Antiquity's plague crisis. «Settlements suffering from Unrest cannot purchase Units,
// Buildings, Improvements, or Repairs» and «Infected Settlements suffer from Unrest» (Civilopedia): Самара (+2, infected),
// Казань, Астрахань and the capital stood in unrest A109-A139, 24 «a revolt may take it» lines, nothing bought, nothing
// said why. Now plague unrest is no revolt risk (a line says purchases are closed), a city in unrest queues its cheapest
// Happiness building at the front, an unhappy settlement before unrest still buys one, and a risk that buys nothing says why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const R = { x: 4, y: 4 };    // Rome, the capital
const S = { x: 12, y: 4 };   // Samara, a town
const K = { x: 4, y: 11 };   // Kazan, a city
const world = {
    width: 24, height: 16, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...R, name: "Rome", prod: 20, happy: 10 },
        { owner: 0, ...S, name: "Samara", isTown: true, happy: 2 },
        { owner: 0, ...K, name: "Kazan", prod: 10, happy: -2, queue: { type: "BUILDING_MONUMENT", turns: 4, pct: 40 } },
    ],
    gold: 700,
    costOf: (type) => ({ BUILDING_ALTAR: 90, BUILDING_GARDEN: 70, BUILDING_MONUMENT: 60 })[type] ?? 200,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const samara = world.cities[1];
const kazan = world.cities[2];
const HAPPY = ["BUILDING_ALTAR", "BUILDING_GARDEN"];
// The game sells and builds the Altar and the Garden next to each centre.
const nextTo = (id) => [idx(world.cities[id.id].x + 1, world.cities[id.id].y)];
world.canBuild = (type, id) => (HAPPY.includes(type) ? { Success: true, Plots: nextTo(id) } : { Success: true, Plots: [] });
world.canBuy = (type, id) => (HAPPY.includes(type) ? { Success: true, Plots: nextTo(id), Cost: type === "BUILDING_GARDEN" ? 140 : 180 } : { Success: false });
const purchases = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => [s.id.id, GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleType]);
const builds = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => [s.id.id, GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleType]);
const crisis = (on) => {
    const culture = Players.get(0).Culture;
    if (on) culture.getNumCultureSlots = (slot) => (slot === CultureSlotTypes.CRISIS_CULTURE_SLOT ? 1 : 2);
    else delete culture.getNumCultureSlots;
};
function capture(fn) {
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        return { out: fn(), lines };
    } finally {
        console.warn = warn;
    }
}
function fresh() {
    fake.sent.length = 0;
    Game.turn += 1;
    for (const c of world.cities) for (const k of ["unrest", "infected", "queued"]) delete c[k];
    kazan.happy = -2;
    crisis(false);
}

test("plague unrest is no revolt risk: purchases are closed until it ends, and UI.log says so instead of «a revolt may take it»", () => {
    fresh();
    samara.unrest = true;
    samara.infected = true;
    const { out, lines } = capture(() => steps.guardRevolts(createBudget({ gold: 700 })));
    assert.deepEqual(out, []);
    assert.deepEqual(purchases(), []);
    assert.ok(lines.some((l) => l.includes("happiness: Samara in unrest from the plague: purchases closed until it ends")), lines.join(" | "));
    assert.ok(!lines.some((l) => l.includes("a revolt may take it")), lines.join(" | "));
});

// The integration review of game 60's packages: the revolt guard runs in the purchases step, and queued and moved buildings
// while «Производство» was off.
test("with «Production» off a city in unrest gets no Happiness building queued or moved, only the log line", () => {
    fresh();
    kazan.unrest = true;
    const { out, lines } = capture(() => steps.guardRevolts(createBudget({ gold: 700 }), { queue: false }));
    assert.deepEqual(out, []);
    assert.deepEqual(builds(), []);
    assert.ok(lines.some((l) => l.includes("Kazan") && l.includes("nothing queued")), lines.join(" | "));
    fresh();
    kazan.unrest = true;
    kazan.queued = ["BUILDING_LIBRARY", "BUILDING_GARDEN"];
    steps.beginQueuePass();
    try {
        assert.deepEqual(steps.guardRevolts(createBudget({ gold: 700 }), { queue: false }), []);
    } finally {
        steps.endQueuePass();
    }
    assert.equal(fake.sent.filter((s) => s.kind === "operation").length, 0, "no move either");
});

test("a city in unrest (no purchases there) queues its cheapest Happiness building, then moves it to the front", () => {
    fresh();
    kazan.unrest = true;
    let out = steps.guardRevolts(createBudget({ gold: 700 }));
    assert.deepEqual(purchases(), [], "the game sells nothing in unrest");
    assert.deepEqual(builds(), [[2, "BUILDING_GARDEN"]], "the cheapest to build (70)");
    assert.equal(out[0]?.key, "REVOLT_QUEUED");
    // Next pass the queue shows it behind the Monument with progress: it goes ahead (each keeps its own: gotcha 20).
    fresh();
    kazan.unrest = true;
    kazan.queued = ["BUILDING_LIBRARY", "BUILDING_GARDEN"];
    steps.beginQueuePass();
    try {
        out = steps.guardRevolts(createBudget({ gold: 700 }));
    } finally {
        steps.endQueuePass();
    }
    const move = fake.sent.find((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [2, 0]);
    assert.equal(out[0]?.key, "REVOLT_FIRST");
    assert.deepEqual(builds(), [], "not queued twice");
    // An effect that lets it buy in unrest (city.Gold.canPurchaseWhileInUnrest): bought.
    fresh();
    kazan.unrest = true;
    kazan.buyInUnrest = true;
    try {
        out = steps.guardRevolts(createBudget({ gold: 700 }));
        assert.deepEqual(purchases(), [[2, "BUILDING_GARDEN"]]);
    } finally {
        delete kazan.buyInUnrest;
    }
});

test("an unhappy settlement in a crisis, before unrest, still buys its Happiness building from all the gold", () => {
    fresh();
    crisis(true);
    try {
        const out = steps.guardRevolts(createBudget({ gold: 300, reserve: 250 }));
        assert.deepEqual(purchases(), [[2, "BUILDING_GARDEN"]], "the reserve too");
        assert.equal(out[0]?.key, "REVOLT_GUARD");
    } finally {
        crisis(false);
    }
});

test("a listed risk that buys nothing says why: the price, or the game's FailureReasons", () => {
    fresh();
    crisis(true);
    const canBuy = world.canBuy;
    world.canBuy = (type) => (HAPPY.includes(type) ? { Success: false, FailureReasons: ["LOC_NO_PURCHASE_HERE"] } : { Success: false });
    try {
        const { out, lines } = capture(() => steps.guardRevolts(createBudget({ gold: 700 })));
        assert.deepEqual(out, []);
        assert.ok(lines.some((l) => l.includes("happiness: Kazan: no Happiness building bought (none on sale); the game: BUILDING_ALTAR: LOC_NO_PURCHASE_HERE")), lines.join(" | "));
        // Too dear: the price.
        world.canBuy = canBuy;
        fresh();
        crisis(true);
        const r = capture(() => steps.guardRevolts(createBudget({ gold: 100 })));
        assert.ok(r.lines.some((l) => l.includes("happiness: Kazan: no Happiness building bought (BUILDING_GARDEN costs 140, 100 gold usable)")), r.lines.join(" | "));
    } finally {
        world.canBuy = canBuy;
        crisis(false);
    }
});

// Review of game 60's build: with a wonder in production the Happiness building went to the front, the wonder step put the
// wonder back ahead of it the next pass, and the two took turns at the front (a wonder waiting behind it also loses our
// item's progress when a rival finishes it: root gotcha 55). It waits behind a wonder, a project or walls in production.
test("in unrest the Happiness building waits behind a wonder or a project in production: the wonder step has nothing to move back", () => {
    const moves = () => fake.sent.filter((s) => s.kind === "operation" && s.id.id === 2 && s.args.InsertMode === CityOperationsParametersValues.MoveTo)
        .map((s) => [s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
    const pass = () => {
        steps.beginQueuePass();
        try {
            return { revolt: steps.guardRevolts(createBudget({ gold: 700 })), fill: steps.fillProduction(new Map()) };
        } finally {
            steps.endQueuePass();
        }
    };
    for (const front of [
        { type: "WONDER_HANGING_GARDENS", turns: 6, pct: 30 },
        { type: "WONDER_HANGING_GARDENS", turns: 9, pct: 0 },
        { type: "PROJECT_CITY_CULTURE_PROJECT", turns: 4, pct: 20 },
    ]) {
        fresh();
        kazan.unrest = true;
        kazan.queue = front;
        kazan.queued = ["BUILDING_MONUMENT", "BUILDING_GARDEN"];
        const { revolt } = pass();
        // Right behind it, ahead of the Monument; nothing goes ahead of it (the revolt step nor the wonder step after it).
        assert.equal(revolt[0]?.key, "REVOLT_FIRST", `${front.type} ${front.pct}%`);
        assert.deepEqual(moves(), [[2, 1]], `${front.type} ${front.pct}%`);
        // The next pass, the queue as the move left it: no step moves anything (before, the wonder went back ahead of the
        // Garden in production, and the revolt step moved the Garden ahead again the pass after: game 60's capital).
        fresh();
        kazan.unrest = true;
        kazan.queue = front;
        kazan.queued = ["BUILDING_GARDEN", "BUILDING_MONUMENT"];
        pass();
        assert.deepEqual(moves(), [], `${front.type} ${front.pct}%, the next pass`);
    }
    kazan.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 40 };
});
