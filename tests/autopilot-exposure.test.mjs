// Research/37 Phase 2: a settlement near an independent's village at war with us is exposed, a standing demand every pass:
// it wants a holder (a healthy melee soldier on the map, on or next to its centre). A reserve walks there, else one member
// leaves an army nearby, else a holder is bought from the free gold (a deficit no longer stops it outright), else trained.
// Game 29: Ollantaytambo stood empty from M1, was threatened at M4 and fell at M6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
const LEEDS = { x: 8, y: 16 };
const VILLAGE = { owner: 5, x: YORK.x + 5, y: YORK.y };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
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

const ids = { London: 0, York: 1, Leeds: 2 };
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["canBuild", "canBuy", "buyCost", "costOf", "enemies", "indepRelation", "unitCommandOk", "unitCommandResult"]) delete world[k];
    world.villages = [VILLAGE];
    world.units = [];
    world.gold = 1000;
    world.goldIncome = 10;
    Game.turn = 10;
    settings.remember(gameKey(), { melee: null });
    Object.assign(world, extra);
};
const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const trains = (...types) => (type) => (type?.startsWith?.("UNIT_") ? { Success: types.includes(type) } : undefined);
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const moveOf = (id) => {
    const a = fake.sent.find((s) => s.kind === "unit" && s.id.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
    return a ? { x: a.X, y: a.Y } : undefined;
};
const run = (extra = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: steps.exposedSettlements([]), ...extra });
const budget = (gold = 1000, reserve = 0) => createBudget({ gold, reserve });
const keys = (r) => r.entries.map((e) => e.key);

test("a settlement within 6 of a village at war with us is exposed; a neutral village, or a visible attacker (a threat), makes it not (research/37 §4B)", () => {
    reset();
    assert.deepEqual(steps.exposedSettlements([]).map((e) => [e.settlement.name, e.d]), [["York", 5]]);
    const threat = { settlement: { ...YORK, name: "York" }, count: 1, land: 1, owners: [] };
    assert.deepEqual(steps.exposedSettlements([threat]), [], "threatened: the emergency rules instead");
    reset({ indepRelation: { 5: IndependentRelationship.NEUTRAL }, canBuy: sells({ UNIT_WARRIOR: 80 }) });
    assert.deepEqual(steps.exposedSettlements([]), []);
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), []);
});

test("an exposed town with no holder: a free soldier nearby is sent to hold it, and then nothing is bought (research/37 §4C)", () => {
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 12, y: 8 }];
    const r = run();
    assert.ok(keys(r).includes("HOLDER"), JSON.stringify(r.entries));
    assert.ok(dist(moveOf(2), YORK) <= 1, JSON.stringify(moveOf(2)));
    assert.equal(moveOf(1), undefined, "London's garrison stays");
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), [], "its holder arrives within 3 turns");
    // One too far to come within 3 turns does not stop the purchase.
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    world.units = [{ id: 2, type: "UNIT_SPEARMAN", x: 2, y: 8 }];
    run();
    assert.ok(moveOf(2), "sent anyway");
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]]);
});

test("a town's holder stays: it is not sent to another exposed town (research/37 §4D)", () => {
    reset({ villages: [VILLAGE, { owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }] });
    world.units = [{ id: 2, type: "UNIT_SPEARMAN", x: YORK.x - 1, y: YORK.y }];
    const r = run();
    assert.equal(moveOf(2), undefined, JSON.stringify(r.entries));
});

test("no holder: an Archer, a badly hurt soldier, one packed in an army or an embarked one next to the centre; a healthy melee one is (research/37 §4B)", () => {
    const cases = [
        [{ id: 1, type: "UNIT_ARCHER", ...YORK }],
        [{ id: 1, type: "UNIT_WARRIOR", ...YORK, damage: 40 }],
        [{ id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK, army: 3 }, { id: 1, type: "UNIT_WARRIOR", ...YORK, onMap: false, army: 3 }],
        [{ id: 1, type: "UNIT_WARRIOR", x: YORK.x + 1, y: YORK.y, embarked: true }],
    ];
    for (const list of cases) {
        reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
        world.units = list;
        steps.buyDefenders([], { budget: budget() });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]], JSON.stringify(list));
    }
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    world.units = [{ id: 1, type: "UNIT_SPEARMAN", x: YORK.x + 1, y: YORK.y }];
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), []);
});

test("mere proximity spends only the free gold; a visible attacker uses all of it; never twice in a turn (research/37 §4C)", () => {
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    steps.buyDefenders([], { budget: budget(500, 450) });
    assert.deepEqual(bought(), [], "50 free gold");
    steps.buyDefenders([{ settlement: { ...YORK, name: "York" }, count: 1, land: 1, close: 1, owners: [] }], { budget: budget(500, 450) });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]], "threatened: all the gold");
    reset({ canBuy: sells({ UNIT_WARRIOR: 80 }) });
    steps.buyDefenders([], { budget: budget() });
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]], "the game shows the first one only later");
});

test("the holder bought is the strongest while no melee unit was obtained this age (it sets every centre), else the cheapest (research/37 §4C)", () => {
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_WARRIOR: 80, UNIT_SPEARMAN: 150 }) });
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), [["UNIT_SPEARMAN", ids.York]]);
    assert.equal(centres.meleeThisAge()?.strength, 25);
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), canBuy: sells({ UNIT_WARRIOR: 80, UNIT_SPEARMAN: 150 }) });
    centres.noteMeleeObtained(GameInfo.Units.lookup("UNIT_SPEARMAN"), "trained");
    steps.buyDefenders([], { budget: budget() });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]]);
});

test("an exposed settlement comes after a threatened one and before a war front (research/37 §4B)", () => {
    reset();
    world.units = [{ id: 2, type: "UNIT_SPEARMAN", x: 12, y: 12 }];
    const r = run({ fronts: [{ settlement: { ...LEEDS, name: "Leeds" }, leader: 1 }] });
    assert.deepEqual(keys(r), ["HOLDER"], JSON.stringify(r.entries));
    assert.ok(dist(moveOf(2), YORK) <= 1);
    // A threatened settlement first.
    reset();
    world.units = [{ id: 2, type: "UNIT_SPEARMAN", x: 12, y: 12 }];
    const threat = { settlement: { ...LEEDS, name: "Leeds" }, count: 1, land: 1, ships: 0, close: 1, owners: [] };
    const t = run({ threats: [threat] });
    assert.deepEqual(keys(t), ["REINFORCE"], JSON.stringify(t.entries));
    assert.ok(dist(moveOf(2), LEEDS) <= 2);
});

test("one member leaves a commander's army for an exposed town (REMOVE_FROM_ARMY), onto the offered tile nearest its post; one a pass per army (research/37 §5C.2)", () => {
    // Under the Regroup age transition the army is all there is at an age's start: packed in commanders.
    reset({
        villages: [VILLAGE, { owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }],
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_REMOVE_FROM_ARMY" ? { Success: false, Plots: [idx(12, 8), idx(14, 8), idx(13, 9)] } : undefined),
    });
    world.units = [
        { id: 9, type: "UNIT_ARMY_COMMANDER", x: 13, y: 8, army: 3 },
        { id: 5, type: "UNIT_SPEARMAN", x: 13, y: 8, onMap: false, army: 3 },
        { id: 6, type: "UNIT_WARRIOR", x: 13, y: 8, onMap: false, army: 3 },
    ];
    const r = run();
    const leaves = fake.sent.filter((s) => s.op === "UNITCOMMAND_REMOVE_FROM_ARMY");
    assert.equal(leaves.length, 1, JSON.stringify(r.entries));
    assert.deepEqual([leaves[0].args.X, leaves[0].args.Y], [14, 8], "the offered tile nearest York");
    assert.ok(keys(r).includes("DEPLOYED"));
    // Then it counts as York's holder on its way: nothing is bought there.
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    fake.sent.length = 0;
    steps.buyDefenders([], { budget: budget() });
    assert.ok(!bought().some((b) => b[1] === ids.York), JSON.stringify(bought()));
    // No tile offered: nothing sent (UI.log says why).
    reset({ unitCommandResult: (_id, op) => (op === "UNITCOMMAND_REMOVE_FROM_ARMY" ? { Success: false, Plots: [], FailureReasons: ["LOC_UNITCOMMAND_LEAVE_ARMY_NO_LOCATION"] } : undefined) });
    world.units = [{ id: 9, type: "UNIT_ARMY_COMMANDER", x: 13, y: 8, army: 3 }, { id: 5, type: "UNIT_SPEARMAN", x: 13, y: 8, onMap: false, army: 3 }];
    run();
    assert.deepEqual(fake.sent.filter((s) => s.op === "UNITCOMMAND_REMOVE_FROM_ARMY"), []);
});

test("an exposed town with no holder and no gold: the city where one arrives in time trains it; not with a holder there (research/37 §4C)", () => {
    reset({ gold: 0, canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), costOf: () => 40 });
    const exposed = steps.exposedSettlements([]);
    let out = steps.fillProduction(new Map(), { defend: true, exposed });
    assert.ok(out.some((e) => e.key === "QUEUED_HOLDER"), JSON.stringify(out));
    assert.deepEqual(trained()[0], ["UNIT_SPEARMAN", ids.London]);
    reset({ gold: 0, canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN"), costOf: () => 40 });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...YORK }];
    out = steps.fillProduction(new Map(), { defend: true, exposed: steps.exposedSettlements([]) });
    assert.ok(!out.some((e) => e.key === "QUEUED_HOLDER"), JSON.stringify(out));
});

test("an exposed settlement's holder is upgraded before units elsewhere (research/37 §4C)", () => {
    reset({ buyCost: () => 100, unitCommandOk: (_id, op) => op === "UNITCOMMAND_UPGRADE" });
    const upgrades = GameInfo.UnitUpgrades;
    GameInfo.UnitUpgrades = { find: (fn) => [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }].find(fn) };
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_WARRIOR", ...YORK }];
        units.upgradeUnits(budget(150, 0), [], { exposed: steps.exposedSettlements([]) });
        assert.deepEqual(fake.sent.filter((s) => s.kind === "unitCommand").map((s) => s.id.id), [2]);
    } finally {
        GameInfo.UnitUpgrades = upgrades;
    }
});
