// Research/37 Phase 1. A settlement centre defends at the strongest melee unit obtained this age, 20 with none (§2: game
// 29's Modern centres stood at 20 for 35 turns while carried-over Line Infantry met the old want); units packed in an army
// are no guards (§3A); land soldiers are never posted on a navigable river (§3C); defenders against ships are ranked by
// their Bombard, siege units included (§3D).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 14, y: 8 };
const LEEDS = { x: 8, y: 16 };
let river = new Set(); // "x,y" of navigable river tiles
const world = {
    width: 30, height: 24, wrapX: false,
    tiles: (x, y) => ({ terrain: river.has(`${x},${y}`) ? "TERRAIN_NAVIGABLE_RIVER" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", pop: 5, prod: 10 },
        { owner: 0, ...LEEDS, name: "Leeds", isTown: true, pop: 3 },
    ],
    units: [], gold: 1000, goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const centres = await import("../mod/expansion-planner/ui/data/xpl-centre-defence.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const ANTIQUITY = Game.age;
const ids = { London: 0, York: 1, Leeds: 2 };
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["canBuild", "canBuy", "buyCost", "costOf", "enemies", "villages", "indepRelation", "unitCommandOk", "plotEffects"]) delete world[k];
    world.units = [];
    world.gold = 1000;
    world.goldIncome = 10;
    for (const c of world.cities) {
        delete c.queue;
        delete c.queued;
    }
    river = new Set();
    Game.turn = 10;
    Game.age = ANTIQUITY;
    settings.remember(gameKey(), { melee: null }); // no melee unit obtained this age
    Object.assign(world, extra);
};
const def = (type) => GameInfo.Units.lookup(type);
const unitName = (s) => def(s.args.UnitType)?.UnitType;
const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const trains = (...types) => (type) => (type?.startsWith?.("UNIT_") ? { Success: types.includes(type) } : undefined);
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const completed = (type, owner = 0) => engine.trigger("CityProductionCompleted", { cityID: { owner, id: 0 }, productionKind: ProductionKind.UNIT, productionItem: def(type).$hash });
const threat = (at, name, o = {}) => ({ settlement: { ...at, name }, count: (o.land ?? 1) + (o.ships ?? 0), land: o.land ?? 1, ships: o.ships ?? 0, close: o.close ?? 1, damaged: false, owners: [] });

test("a carried-over melee unit does not hold the centres' defence: one as strong as the best we can train is still wanted (research/37 §2)", () => {
    // Game 29: Modern's carried Line Infantry met the old want (units we have), and every centre defended at 20 for 35 turns.
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    world.units = [{ id: 1, type: "UNIT_SPEARMAN", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", ...YORK }];
    const out = steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained().map((t) => t[0]), ["UNIT_SPEARMAN"], JSON.stringify(out));
    assert.equal(out.find((e) => e.key === "QUEUED_MELEE")?.args[2], 25, "its full strength: no minus 10");
    // A Warrior raises nothing above the base 20: with only Warriors to train, none is wanted.
    reset({ canBuild: trains("UNIT_WARRIOR") });
    steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), []);
});

test("a melee unit trained (the game's CityProductionCompleted), bought or upgraded this age holds it; a ranged one, another player's, does not (research/37 §2)", () => {
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    completed("UNIT_ARCHER");
    completed("UNIT_SPEARMAN", 5);
    assert.equal(centres.meleeThisAge(), null, "an archer, or another player's Spearman: no");
    assert.equal(centres.centreDefence(), 20);
    completed("UNIT_SPEARMAN");
    assert.equal(centres.meleeThisAge()?.strength, 25);
    assert.equal(centres.centreDefence(), 25);
    const out = steps.fillProduction(new Map(), { defend: true });
    assert.ok(!out.some((e) => e.key === "QUEUED_MELEE"), JSON.stringify(out));
    // Bought for a threatened settlement.
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }) });
    steps.buyDefenders([threat(YORK, "York")], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_SPEARMAN", ids.York]]);
    assert.equal(centres.meleeThisAge()?.strength, 25);
    // Upgraded (very likely counts: probe P-DEF-3).
    reset({ buyCost: () => 100, unitCommandOk: (_id, op) => op === "UNITCOMMAND_UPGRADE" });
    const upgrades = GameInfo.UnitUpgrades;
    GameInfo.UnitUpgrades = { find: (fn) => [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }].find(fn) };
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        units.upgradeUnits(createBudget({ gold: 1000, reserve: 0 }), []);
        assert.equal(centres.meleeThisAge()?.strength, 25);
    } finally {
        GameInfo.UnitUpgrades = upgrades;
    }
});

test("a peaceful final push trains the age's first melee unit, not a stronger second one; never in a space city (research/37 §2)", () => {
    const commit = { defend: true, strategy: { phase: "COMMIT" } };
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    steps.fillProduction(new Map(), commit);
    assert.deepEqual(trained().map((t) => t[0]), ["UNIT_SPEARMAN"]);
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    centres.noteMeleeObtained(def("UNIT_WARRIOR"), "trained");
    steps.fillProduction(new Map(), commit);
    assert.deepEqual(trained(), [], "a Warrior obtained: the Spearman would be a second one");
});

test("the city that has it soonest trains it: its wait plus its training (research/37 §2)", () => {
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    world.cities[0].prod = 12; // London, the bigger: 9 turns; York: 5
    world.cities[1].prod = 20;
    try {
        steps.fillProduction(new Map(), { defend: true });
        assert.deepEqual(trained(), [["UNIT_SPEARMAN", ids.York]]);
    } finally {
        world.cities[0].prod = 10;
        world.cities[1].prod = 10;
    }
});

test("the memory belongs to the age: a new age forgets it, a reload keeps it, an earlier save of the age does not see it (research/37 §2)", () => {
    reset();
    centres.noteMeleeObtained(def("UNIT_SPEARMAN"), "trained");
    assert.equal(centres.meleeThisAge()?.strength, 25);
    settings.saveNow();
    settings.load();
    assert.equal(centres.meleeThisAge()?.strength, 25, "a reload");
    Game.turn = 9;
    assert.equal(centres.meleeThisAge(), null, "an earlier save of this age");
    Game.turn = 10;
    Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION")?.$hash ?? -1;
    assert.equal(centres.meleeThisAge(), null, "the next age");
    assert.equal(centres.centreDefence(), 20);
    Game.age = ANTIQUITY;
    assert.equal(centres.meleeThisAge()?.strength, 25);
    // A weaker one later does not lower it.
    centres.noteMeleeObtained(def("UNIT_WARRIOR"), "bought");
    assert.equal(centres.meleeThisAge()?.strength, 25);
});

test("the age's first melee unit is bought with the free gold where no soldier stands, and the one queued for it leaves its queue (research/37 §2)", () => {
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_WARRIOR: 60, UNIT_SPEARMAN: 120 }) });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
    steps.fillProduction(new Map(), { defend: true });
    const queuedAt = trained().find((t) => t[0] === "UNIT_SPEARMAN")?.[1];
    assert.equal(queuedAt, ids.London);
    // The game shows it in London's queue, behind a Monument.
    world.cities[0].queue = { type: "BUILDING_MONUMENT", turns: 5 };
    world.cities[0].queued = ["UNIT_SPEARMAN"];
    fake.sent.length = 0;
    const out = steps.buyFirstMelee([], { budget: createBudget({ gold: 1000, reserve: 100 }) });
    assert.deepEqual(bought(), [["UNIT_SPEARMAN", ids.York]], "York: no soldier there");
    assert.equal(out[0]?.key, "FIRST_MELEE_BOUGHT");
    assert.equal(centres.meleeThisAge()?.strength, 25);
    const drop = fake.sent.find((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.RemoveAt);
    assert.deepEqual([drop?.id.id, drop?.args.QueueLocation], [ids.London, 1], JSON.stringify(fake.sent));
    // Only the reserve's gold: none (training will do).
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }) });
    steps.buyFirstMelee([], { budget: createBudget({ gold: 150, reserve: 100 }) });
    assert.deepEqual(bought(), []);
    // ...but a threatened settlement may use all of it.
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }) });
    steps.buyFirstMelee([threat(LEEDS, "Leeds")], { budget: createBudget({ gold: 150, reserve: 100 }) });
    assert.deepEqual(bought(), [["UNIT_SPEARMAN", ids.Leeds]]);
    // One nearly done in production: none bought.
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }) });
    world.cities[1].queue = { type: "UNIT_SPEARMAN", turns: 1, pct: 80 };
    steps.buyFirstMelee([], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), []);
    // Only a weaker one on sale: none (it would set the centres below the best we can train).
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_WARRIOR: 60 }) });
    steps.buyFirstMelee([], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), []);
});

test("an upgrade of one of ours comes first when the game offers one to a strong enough melee type (research/37 §2)", () => {
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_SPEARMAN: 120 }), buyCost: () => 100, unitCommandOk: (_id, op) => op === "UNITCOMMAND_UPGRADE" });
    const upgrades = GameInfo.UnitUpgrades;
    GameInfo.UnitUpgrades = { find: (fn) => [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }].find(fn) };
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        const out = steps.buyFirstMelee([], { budget: createBudget({ gold: 1000, reserve: 0 }) });
        assert.deepEqual(out.map((e) => e.key), ["FIRST_MELEE_UPGRADED"]);
        assert.deepEqual(fake.sent.filter((s) => s.kind === "unitCommand").map((s) => [s.op, s.id.id]), [["UNITCOMMAND_UPGRADE", 1]]);
        assert.deepEqual(bought(), []);
        assert.equal(centres.meleeThisAge()?.strength, 25);
    } finally {
        GameInfo.UnitUpgrades = upgrades;
    }
});

test("a melee unit packed in an army is no guard: the settlement lacks one, a lone strong raider threatens it, an exposed town buys a garrison (research/37 §3A)", () => {
    reset();
    const commander = { id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK, army: 3 };
    const packed = { id: 1, type: "UNIT_SPEARMAN", ...YORK, onMap: false, army: 3 };
    const t = threat(YORK, "York");
    world.units = [commander, packed];
    assert.equal(units.guardsFor(t), 0, "packed");
    world.units = [commander, { ...packed, onMap: true, army: undefined }];
    assert.equal(units.guardsFor(t), 1, "deployed");
    world.units = [{ id: 1, type: "UNIT_SPEARMAN", x: YORK.x + 1, y: YORK.y, embarked: true }];
    assert.equal(units.guardsFor(t), 0, "embarked");
    // A lone Spearman raider 3 tiles away: our Spearman on the centre matches it; packed, it does not.
    world.enemies = [{ x: YORK.x + 3, y: YORK.y, owner: 5, type: "UNIT_SPEARMAN" }];
    world.units = [{ id: 1, type: "UNIT_SPEARMAN", ...YORK }];
    assert.ok(!units.threatenedSettlements().some((x) => x.settlement.name === "York"));
    world.units = [commander, packed];
    assert.ok(units.threatenedSettlements().find((x) => x.settlement.name === "York")?.strong);
    // An exposed town with only a packed unit: a garrison is bought.
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }), villages: [{ owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }], indepRelation: { 5: IndependentRelationship.HOSTILE } });
    world.units = [{ id: 9, type: "UNIT_ARMY_COMMANDER", ...LEEDS, army: 4 }, { id: 1, type: "UNIT_WARRIOR", ...LEEDS, onMap: false, army: 4 }];
    steps.buyDefenders([], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.Leeds]]);
});

test("a land soldier is never posted on a navigable river; a ship leaving the plague may move along one (research/37 §3C)", () => {
    // Every tile next to York is a navigable river: its second guard stands 2 away, on land.
    reset();
    river = new Set(GameplayMap.getPlotIndicesInRadius(YORK.x, YORK.y, 1).map((i) => GameplayMap.getLocationFromIndex(i)).filter((l) => l.x !== YORK.x || l.y !== YORK.y).map((l) => `${l.x},${l.y}`));
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_WARRIOR", ...YORK }, { id: 3, type: "UNIT_SPEARMAN", x: 9, y: 9 }];
    const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [threat(YORK, "York", { land: 2 })], fronts: [] });
    const move = fake.sent.find((s) => s.kind === "unit" && s.id.id === 3 && s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.ok(move, JSON.stringify(r.entries));
    assert.ok(!river.has(`${move.X},${move.Y}`), `not on the river: ${move.X},${move.Y}`);
    assert.equal(GameplayMap.getPlotDistance(move.X, move.Y, YORK.x, YORK.y), 2);
    // A galley on the plague, on a river: it moves along the river (before, only GameplayMap.isWater tiles were water).
    reset({ plotEffects: (x, y) => (x === 20 && y === 15 ? ["PLOTEFFECT_PLAGUE"] : []) });
    river = new Set(["20,15", "21,15", "22,15"]);
    world.units = [{ id: 4, type: "UNIT_GALLEY", x: 20, y: 15 }];
    const s = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [] });
    const sail = fake.sent.find((x) => x.kind === "unit" && x.id.id === 4 && x.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.ok(sail && river.has(`${sail.X},${sail.Y}`), JSON.stringify(s.entries));
});

test("against ships the defender is the one with the best Bombard, siege units included; against a land raider a melee one (research/37 §3D)", () => {
    // Land units fire at ships with their Bombard: a Ballista 30, an Archer 10 (Civilopedia).
    const ships = threat(YORK, "York", { land: 0, ships: 2 });
    reset({ canBuy: sells({ UNIT_WARRIOR: 60, UNIT_ARCHER: 100, UNIT_BALLISTA: 150 }) });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...YORK }];
    steps.buyDefenders([ships], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_BALLISTA", ids.York]]);
    // A Ballista next to York guards it against ships, not against a land army.
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...YORK }, { id: 2, type: "UNIT_BALLISTA", x: YORK.x + 1, y: YORK.y }];
    assert.equal(units.guardsFor(ships, undefined, null, { ranged: true }), 1);
    assert.equal(units.guardsFor(threat(YORK, "York", { land: 2 }), undefined, null, { ranged: true }), 0);
    // A land raider: a melee unit, never a siege unit.
    reset({ canBuy: sells({ UNIT_WARRIOR: 60, UNIT_ARCHER: 100, UNIT_BALLISTA: 150 }) });
    steps.buyDefenders([threat(YORK, "York")], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]]);
    // Trained against ships: the Ballista too.
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_ARCHER", "UNIT_BALLISTA") });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...YORK }];
    steps.fillProduction(new Map(), { threats: [ships] });
    assert.deepEqual(trained().filter((t) => t[0] !== "UNIT_WARRIOR"), [["UNIT_BALLISTA", ids.York]]);
});

test("a defender the gold cannot buy yet is saved for: the free gold waits while the gap closes within two turns of income (game 38)", () => {
    // Game 38: Бутооло's centre fell from 100 to 0 M7-M11 while 108 gold a turn bought buildings and the cheapest
    // defender, 540, stayed out of reach of 361-365 at +106 a turn.
    const short = (type) => (type === "UNIT_SPEARMAN" ? { Success: false, InsufficientFunds: true, Cost: 500 } : { Success: false });
    reset({ canBuy: short, goldIncome: 100 });
    const budget = createBudget({ gold: 400, reserve: 0 });
    const out = steps.buyDefenders([threat(YORK, "York")], { budget });
    assert.deepEqual(bought(), []);
    assert.equal(budget.goal?.kind, "DEFENDER", JSON.stringify(out));
    assert.equal(budget.free(), 0, "the building purchases wait");
    assert.ok(out.some((e) => e.key === "SAVING"));
    // Out of reach for now (100 short at 10 a turn): nothing is held.
    reset({ canBuy: short, goldIncome: 10 });
    const far = createBudget({ gold: 400, reserve: 0 });
    steps.buyDefenders([threat(YORK, "York")], { budget: far });
    assert.equal(far.goal, null);
    assert.equal(far.free(), 400);
});
