// Game 60 (economy E4, missed M2): about 70% of Antiquity's gold went to the all-gold spends while a conversion goal waited 89
// turns. Archers were bought for 200 against ships that never hit a centre (Астрахань A116, the capital A129, Казань A139),
// and defenders where walls held against independents only. A defender comes from all the gold under a real attack only
// (a damaged centre, land raiders the walls do not hold, ships that hit the centre or stayed 3 turns, a war at our door);
// otherwise from the free gold, and it is no savings goal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const FRONT = { x: 15, y: 5 };
let grid = null;
const ours = [HOME, FRONT];
const world = {
    width: 30, height: 14, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: grid && ours.some((c) => grid.distanceXY(x, y, c.x, c.y) <= 3) ? 0 : -1 }),
    players: [{ id: 0 }, { id: 1, name: "Russia" }, { id: 9, isIndependent: true, name: "Raiders" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 10 },
        { owner: 0, ...FRONT, name: "Front", pop: 4, prod: 10 },
    ],
    units: [], gold: 965, goldIncome: 86,
};
const fake = installFakeEngine(world);
grid = fake.grid;
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => unitName(s));
const threat = (o = {}) => ({
    settlement: { ...FRONT, name: "Front" }, count: o.count ?? (o.land ?? 0) + (o.ships ?? 0), land: o.land ?? 0, ships: o.ships ?? 0,
    close: o.close ?? 0, damaged: !!o.damaged, walled: !!o.walled, owners: o.owners ?? [{ id: 9, independent: true }],
});
// T117's numbers: 965 gold, a 172 reserve, the conversion goal holding 800 (nothing free).
const saving = () => {
    const b = createBudget({ gold: 965, reserve: 172 });
    b.setGoal({ kind: "CONVERT", key: "convert:20,5", label: "Nizhny", cost: 800 });
    return b;
};
const reset = (list, prices, { keepFronts = false } = {}) => {
    units.resetUnitGoals();
    if (!keepFronts) steps.resetWar(); // it forgets the turns a settlement was threatened too
    fake.sent.length = 0;
    world.units = list;
    world.canBuy = sells(prices);
};
const quiet = (fn) => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        console.warn = warn;
    }
    return lines;
};

test("ships that have not hit the centre: a ranged defender from the free gold only, and no savings goal for it (game 60: Archers at A116, A129, A139)", () => {
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }], { UNIT_ARCHER: 200 });
    Game.turn += 10;
    const b = saving();
    const lines = quiet(() => steps.buyDefenders([threat({ ships: 2 })], { budget: b }));
    assert.deepEqual(bought(), [], "nothing free: the conversion keeps its gold");
    assert.equal(b.goal?.kind, "CONVERT", "no defender goal in its place");
    assert.ok(lines.some((l) => l.includes("defenders: none for Front") && l.includes("the free gold: ships only, the centre unhit")), lines.join(" | "));
    // The ships hit the centre: a real attack, all the gold.
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }], { UNIT_ARCHER: 200 });
    steps.buyDefenders([threat({ ships: 2, damaged: true })], { budget: saving() });
    assert.deepEqual(bought(), ["UNIT_ARCHER"]);
});

test("ships that stay 3 turns in a row are a lasting front: then all the gold", () => {
    const turn = Game.turn + 10;
    for (let i = 0; i < 3; i++) {
        Game.turn = turn + i;
        reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }], { UNIT_ARCHER: 200 }, { keepFronts: i > 0 });
        steps.buyDefenders([threat({ ships: 2 })], { budget: saving() });
        assert.deepEqual(bought(), i < 2 ? [] : ["UNIT_ARCHER"], `turn ${i + 1}`);
    }
});

test("walls that hold (walled, unhit, independents only): the one guard from the free gold; a major's raiders take all the gold", () => {
    Game.turn += 10;
    reset([], { UNIT_WARRIOR: 100 });
    steps.buyDefenders([threat({ land: 3, walled: true })], { budget: saving() });
    assert.deepEqual(bought(), [], "walls hold");
    reset([], { UNIT_WARRIOR: 100 });
    steps.buyDefenders([threat({ land: 3, walled: true, damaged: true })], { budget: saving() });
    assert.deepEqual(bought(), ["UNIT_WARRIOR"], "the centre is hit");
    reset([], { UNIT_WARRIOR: 100 });
    steps.buyDefenders([threat({ land: 3, walled: true, owners: [{ id: 1, independent: false }] })], { budget: saving() });
    assert.deepEqual(bought(), ["UNIT_WARRIOR"], "a major's army");
    // Free gold covers it: bought.
    reset([], { UNIT_WARRIOR: 100 });
    steps.buyDefenders([threat({ land: 3, walled: true })], { budget: createBudget({ gold: 965, reserve: 172 }) });
    assert.deepEqual(bought(), ["UNIT_WARRIOR"], "793 free");
});

// Review of game 60's build: the age's first melee unit took all the gold for any threatened settlement, ships that never hit
// a centre too, so the same pass that kept the Archer off the conversion's gold could spend it on the strongest melee unit.
test("the age's first melee unit: all the gold only under a real attack (ships that have not hit the centre: the free gold)", async () => {
    const { gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const trains = (type) => (type?.startsWith?.("UNIT_") ? { Success: type === "UNIT_WARRIOR" || type === "UNIT_SPEARMAN" } : undefined);
    try {
        for (const [t, want] of [[threat({ ships: 2 }), []], [threat({ ships: 2, damaged: true }), ["UNIT_SPEARMAN"]], [threat({ land: 2 }), ["UNIT_SPEARMAN"]]]) {
            Game.turn += 10;
            reset([], { UNIT_SPEARMAN: 120 });
            world.canBuild = trains;
            settings.remember(gameKey(), { melee: null }); // none obtained this age
            steps.buyFirstMelee([t], { budget: saving() });
            assert.deepEqual(bought(), want, JSON.stringify(t));
        }
    } finally {
        delete world.canBuild;
        settings.remember(gameKey(), { melee: null });
    }
});
