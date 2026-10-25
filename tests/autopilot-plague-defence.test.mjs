// Game 60 (research/game60, the plague review): Астрахань was threatened by ships and infected at once (T133-T138), and its
// formation listed its hurt Spearman and Slinger on infected tiles. A unit bought for an infected settlement would appear on
// the plague (only training checked city.isInfected), and a swap would put a fresh soldier there (a swap bypasses moveTo's
// hazard guard): purchases go to our nearest clean settlement in time, and the swap leaves the plague's members to their
// own way out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
const FLAT = { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 };
const CITIES = [
    { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
    { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
];
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => FLAT,
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: CITIES,
    units: [], gold: 1000, goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const at = (x, y) => ({ x, y });
const d = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const raider = (x, y) => ({ x, y, owner: 5, type: "UNIT_WARRIOR" });
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "plotEffects", "unitCanStart", "canBuy", "canBuild", "villages", "indepRelation"]) delete world[k];
    world.cities = CITIES.map((c) => ({ ...c }));
    world.units = [];
    world.gold = 1000;
    Game.turn = 10;
    settings.remember(gameKey(), { melee: null });
    Object.assign(world, extra);
};
const quiet = (fn) => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        return { out: fn(), lines };
    } finally {
        console.warn = warn;
    }
};

test("a defender for an infected settlement is bought in our nearest clean one in time, else none and UI.log says why", () => {
    // York infected, threatened by two raiders; Selby clean 3 tiles away (2 turns at 2 tiles a turn).
    const threats = [{ settlement: { name: "York", ...YORK }, count: 2, land: 2, close: 0, owners: [{ id: 5, independent: true }] }];
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    world.cities[1].infected = true;
    world.cities.push({ owner: 0, x: 19, y: 8, name: "Selby", isTown: true, pop: 3 });
    let { out } = quiet(() => steps.buyDefenders(threats, { reserveTurns: 2 }));
    assert.deepEqual(bought(), [["UNIT_WARRIOR", 2]], JSON.stringify(out));
    assert.equal(out.find((e) => e.key === "DEFENDER_BOUGHT")?.args[1], "Selby");
    // Selby too far (5 turns): nothing bought in York, and the reason.
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    world.cities[1].infected = true;
    world.cities.push({ owner: 0, x: 26, y: 8, name: "Selby", isTown: true, pop: 3 });
    const r = quiet(() => steps.buyDefenders(threats, { reserveTurns: 2 }));
    assert.deepEqual(bought(), [], JSON.stringify(r.out));
    assert.ok(r.lines.some((l) => l.includes("defenders: none for York") && l.includes("infected (plague), no clean settlement of ours within 2 turn(s)")), r.lines.join(" | "));
    // Clean: bought in York itself, as before.
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    ({ out } = quiet(() => steps.buyDefenders(threats, { reserveTurns: 2 })));
    assert.deepEqual(bought(), [["UNIT_WARRIOR", 1]], JSON.stringify(out));
});

test("no commander bought in an infected settlement", () => {
    // York (city 1) sells it cheaper: the cheapest is taken unless it is infected.
    const sellsCommander = (type, id) => (type === "UNIT_ARMY_COMMANDER" ? { Success: true, Cost: id?.id === 1 ? 100 : 150 } : { Success: false });
    reset({ canBuy: sellsCommander });
    for (const c of world.cities) c.infected = true;
    assert.deepEqual(steps.buyCommander(createBudget({ gold: 600, reserve: 0 })), []);
    reset({ canBuy: sellsCommander });
    world.cities[1].infected = true;
    const out = steps.buyCommander(createBudget({ gold: 600, reserve: 0 }));
    assert.deepEqual(out.map((e) => e.key), ["COMMANDER_BOUGHT"]);
    assert.deepEqual(bought().map(([, city]) => city), [0], "in London, not infected York");
});

test("the age's first melee unit and a settler are not bought in an infected settlement: a clean one buys them", () => {
    const trains = (...types) => (type) => (type?.startsWith?.("UNIT_") ? { Success: types.includes(type) } : undefined);
    // London (the bigger, and first) infected: York buys the age's first Spearman; both infected: none.
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }) });
    world.cities[0].infected = true;
    steps.buyFirstMelee([], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_SPEARMAN", 1]]);
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }) });
    for (const c of world.cities) c.infected = true;
    steps.buyFirstMelee([], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), []);
    // Far below the settlement cap with a site known: the settler from York, not infected London.
    reset({ canBuy: sells({ UNIT_SETTLER: 300 }), aiSuggestions: () => [{ location: { x: 12, y: 13 } }], settlementCap: 8 });
    world.cities[0].infected = true;
    try {
        const out = steps.buySettlers(createBudget({ gold: 1000, reserve: 0 }));
        assert.deepEqual(bought(), [["UNIT_SETTLER", 1]], JSON.stringify(out));
    } finally {
        delete world.aiSuggestions;
        delete world.settlementCap;
    }
});

test("a hurt member on the plague is not swapped out: it leaves by itself, and the formation line says so", () => {
    // The formations test's rotation: York's holder, a hurt screen at 17,8 and a fresh soldier next to it at 17,9; two raiders
    // east. With the plague on 17,8 no fresh soldier is swapped onto it; the hurt one gets off the plague by itself.
    const swap = (_id, op) => (op === "UNITOPERATION_SWAP_UNITS" ? { Success: true } : undefined);
    const swaps = () => fake.sent.filter((s) => s.op === "UNITOPERATION_SWAP_UNITS");
    const scene = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 17, y: 8, damage: 45 },
        { id: 3, type: "UNIT_WARRIOR", x: 17, y: 9 },
        { id: 4, type: "UNIT_WARRIOR", x: 15, y: 8 },
    ];
    const run = () => quiet(() => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] }));
    reset({ enemies: [raider(19, 8), raider(19, 7)], unitCanStart: swap, plotEffects: (x, y) => (x === 17 && y === 8 ? ["PLOTEFFECT_PLAGUE"] : []) });
    world.units = scene;
    let r = run();
    assert.equal(swaps().length, 0, JSON.stringify(r.out.entries));
    const off = fake.sent.find((s) => s.op === "UNITOPERATION_MOVE_TO" && s.id.id === 2)?.args;
    assert.ok(off && !(off.X === 17 && off.Y === 8), `off the plague: ${JSON.stringify(r.out.entries)}`);
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("UNIT_WARRIOR at 17,8 (plague)"), r.lines.join(" | "));
    // The fresh one on the plague (17,9): no swap either (the hurt one would take its tile).
    reset({ enemies: [raider(19, 8), raider(19, 7)], unitCanStart: swap, plotEffects: (x, y) => (x === 17 && y === 9 ? ["PLOTEFFECT_PLAGUE"] : []) });
    world.units = scene;
    r = run();
    assert.ok(!swaps().some((s) => s.id.id === 3), JSON.stringify(r.out.entries));
    // No plague: the swap as before.
    reset({ enemies: [raider(19, 8), raider(19, 7)], unitCanStart: swap });
    world.units = scene;
    r = run();
    assert.deepEqual(swaps().map((s) => [s.id.id, s.args.X, s.args.Y]), [[3, 17, 8]], JSON.stringify(r.out.entries));
    assert.ok(d(at(17, 8), YORK) === 1);
});
