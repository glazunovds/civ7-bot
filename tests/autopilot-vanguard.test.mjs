// The vanguard's packed army and Overrun (after game 54; the user: "did we implement packing units into a commander and
// moving them that way to move faster? and using multiple attack from inside?"). Packed, soldiers move at the commander's
// speed (+1 when packed, Mobility: terrain ignored), "If an Assembled Army is attacked, it defends as a single unit"
// (the Civilopedia), and an army overruns a much weaker unit without deploying. While a war or raids call for a quick
// answer the vanguard keeps up to 3 soldiers packed; they count as coming to its post, the defence does not split them up,
// a far urgent fight gets a Force March, and a weaker raider next to it is overrun.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 18, y: 8 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
    ],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const budgets = await import("../mod/expansion-planner/ui/core/xpl-savings.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const VANGUARD = { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON, army: 3 };
const commands = (extra = {}) => (_id, op) => (op === "UNITCOMMAND_ADD_TO_ARMY" ? { Success: false, Plots: [idx(LONDON.x, LONDON.y)] }
    : op === "UNITCOMMAND_REMOVE_FROM_ARMY" ? { Success: false, Plots: [idx(LONDON.x + 1, LONDON.y)] }
    : op === "UNITCOMMAND_FORCE_MARCH" ? { Success: true } : extra[op]);
const reset = (extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["enemies", "unitCommandResult", "armies", "wars", "indepRelation"]) delete world[k];
    Game.turn = 10;
    Object.assign(world, {
        armies: { "0:3": { ...LONDON, capacity: 4, unitCount: 0 } },
        unitCommandResult: commands(),
        wars: [5], indepRelation: { 5: IndependentRelationship.HOSTILE },
    }, extra);
};
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
const keys = (r) => r.entries.map((e) => e.key);
const sentOp = (op) => fake.sent.filter((s) => s.op === op);
const raidersAtYork = [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }];

test("after raids the vanguard packs the free soldiers next to it and calls those within 3 turns, up to 3; in peace nothing", () => {
    reset({ enemies: raidersAtYork });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD];
    run(); // York raided this turn: remembered
    Game.turn = 11;
    world.enemies = [];
    fake.sent.length = 0;
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...LONDON }, // the garrison stays
        VANGUARD,
        { id: 2, type: "UNIT_SPEARMAN", x: 9, y: 8 },
        { id: 4, type: "UNIT_SPEARMAN", x: 7, y: 8 },
        { id: 5, type: "UNIT_SPEARMAN", x: 10, y: 8 },
        { id: 3, type: "UNIT_SPEARMAN", x: 11, y: 8 },
    ];
    const r = run();
    const adds = sentOp("UNITCOMMAND_ADD_TO_ARMY");
    assert.deepEqual(adds.map((s) => [s.id.id, s.args.X, s.args.Y]).sort(), [[2, LONDON.x, LONDON.y], [4, LONDON.x, LONDON.y]], JSON.stringify(r.entries));
    const walk = fake.sent.find((s) => s.id?.id === 5 && s.op === UnitOperationTypes.MOVE_TO);
    assert.ok(walk && dist({ x: walk.args.X, y: walk.args.Y }, LONDON) <= 1, JSON.stringify(walk));
    assert.ok(!fake.sent.some((s) => s.id?.id === 3 && s.op === UnitOperationTypes.MOVE_TO && dist({ x: s.args.X, y: s.args.Y }, LONDON) <= 1), "room for 3: the farther one stays");
    assert.ok(!fake.sent.some((s) => s.id?.id === 1 && s.op === "UNITCOMMAND_ADD_TO_ARMY"), "never the garrison");
    assert.deepEqual(r.entries.filter((e) => e.key.startsWith("VANGUARD_")).map((e) => [e.key, e.args[1]]), [["VANGUARD_PACKS", 2], ["VANGUARD_RALLY", 1]]);
    // No raid remembered, no war: nothing.
    reset();
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD, { id: 2, type: "UNIT_SPEARMAN", x: 9, y: 8 }];
    run();
    assert.deepEqual(sentOp("UNITCOMMAND_ADD_TO_ARMY"), []);
});

test("York threatened: the vanguard's packed army is not split up; it force-marches there and its soldiers count as coming", () => {
    reset({ enemies: raidersAtYork });
    const packed = () => [5, 6].map((id) => ({ id, type: "UNIT_SPEARMAN", ...LONDON, onMap: false, army: 3 }));
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD, ...packed()];
    const r = run();
    assert.deepEqual(sentOp("UNITCOMMAND_REMOVE_FROM_ARMY"), [], "the army stays packed (it moves faster so)");
    const go = fake.sent.find((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO);
    assert.deepEqual([go?.args.X, go?.args.Y], [YORK.x, YORK.y], JSON.stringify(r.entries));
    assert.equal(sentOp("UNITCOMMAND_FORCE_MARCH").length, 1, "raiders close to York: Force March");
    // The next pass of the turn: its soldiers are coming to York.
    run();
    const york = units.threatenedSettlements().find((t) => t.settlement.name === "York");
    const d = units.guardDetail(york);
    assert.deepEqual(d.incoming.map((x) => x.u.id.id).sort(), [5, 6], JSON.stringify(d.incoming.map((x) => [x.u.id.id, x.turns])));
});

test("a commander with soldiers packed in its army defends as one unit: it does not escape a raider's reach; alone it does", () => {
    const raider = [{ x: 8, y: 13, owner: 5, type: "UNIT_WARRIOR" }];
    reset({ enemies: raider, armies: { "0:3": { x: 8, y: 11, capacity: 4, unitCount: 1 } } });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { ...VANGUARD, x: 8, y: 11 }, { id: 5, type: "UNIT_SPEARMAN", x: 8, y: 11, onMap: false, army: 3 }];
    let r = run();
    assert.ok(!keys(r).includes("COMMANDER_ESCAPED"), JSON.stringify(r.entries));
    reset({ enemies: raider, armies: { "0:3": { x: 8, y: 11, capacity: 4, unitCount: 0 } } });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { ...VANGUARD, x: 8, y: 11 }];
    r = run();
    assert.ok(keys(r).includes("COMMANDER_ESCAPED"), JSON.stringify(r.entries));
});

test("an army with soldiers packed in it overruns a weaker raider next to it (the game's Overrun), not one with company", async () => {
    const AT = { x: 8, y: 11 };
    const target = { x: 8, y: 12 };
    const overrun = { UNITCOMMAND_ARMY_OVERRUN: { Success: false, Plots: [idx(target.x, target.y)] } };
    const army = (packed) => [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { ...VANGUARD, ...AT },
        ...(packed ? [{ id: 5, type: "UNIT_SPEARMAN", ...AT, onMap: false, army: 3 }] : [])];
    reset({ enemies: [{ ...target, owner: 5, type: "UNIT_WARRIOR" }], unitCommandResult: commands(overrun) });
    world.units = army(true);
    let r = await units.strikeRaiders();
    const sent = sentOp("UNITCOMMAND_ARMY_OVERRUN");
    assert.deepEqual(sent.map((s) => [s.id.id, s.args.X, s.args.Y]), [[9, target.x, target.y]], JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "ARMY_OVERRUN"));
    // Nothing packed: no Overrun.
    reset({ enemies: [{ ...target, owner: 5, type: "UNIT_WARRIOR" }], unitCommandResult: commands(overrun) });
    world.units = army(false);
    await units.strikeRaiders();
    assert.deepEqual(sentOp("UNITCOMMAND_ARMY_OVERRUN"), []);
    // Another raider next to the target: the army would end its move beside it.
    const beside = [...Array(world.width * world.height).keys()].map((i) => GameplayMap.getLocationFromIndex(i))
        .find((l) => dist(l, target) === 1 && dist(l, AT) >= 2);
    reset({ enemies: [{ ...target, owner: 5, type: "UNIT_WARRIOR" }, { ...beside, owner: 5, type: "UNIT_WARRIOR" }], unitCommandResult: commands(overrun) });
    world.units = army(true);
    r = await units.strikeRaiders();
    assert.deepEqual(sentOp("UNITCOMMAND_ARMY_OVERRUN"), [], JSON.stringify(r.entries));
});

// After game 55 (the user: "are we able to upgrade packed units? UI allows to select each unit and upgrade them, or upgrade all
// of them using the commander's button"): the army's upgrade, UNITCOMMAND_UPGRADE_ARMY on the commander.
test("a commander's packed soldiers are upgraded together, where their army stands; a packed one may be the age's first melee (after game 55)", () => {
    const { createBudget } = budgets;
    const saved = GameInfo.UnitUpgrades;
    GameInfo.UnitUpgrades = { find: (fn) => [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }].find(fn) };
    const ok = (_id, op) => (op === "UNITCOMMAND_UPGRADE_ARMY" || op === "UNITCOMMAND_UPGRADE" ? { Success: true } : undefined);
    const packed = () => [5, 6].map((id) => ({ id, type: "UNIT_WARRIOR", x: -9999, y: -9999, onMap: false, army: 3 }));
    const sent = (op) => fake.sent.filter((s) => s.op === op).map((s) => s.id.id);
    try {
        reset({ unitCommandResult: ok, buyCost: () => 100 });
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD, ...packed()];
        // Only units near a threatened settlement (the strategy's THREAT mode): the army stands at London, so they count.
        const threat = [{ settlement: { ...LONDON, name: "London" }, count: 1, land: 1, ships: 0, owners: [] }];
        let out = units.upgradeUnits(createBudget({ gold: 1000 }), threat, { mode: "THREAT" });
        assert.deepEqual(sent("UNITCOMMAND_UPGRADE_ARMY"), [9], JSON.stringify(out));
        assert.deepEqual(sent("UNITCOMMAND_UPGRADE").filter((id) => id === 5 || id === 6), [], "not one by one as well");
        assert.deepEqual(out.find((e) => e.key === "ARMY_UPGRADED")?.args.slice(1), [2, 200]);
        // Too little gold for both: no army upgrade.
        reset({ unitCommandResult: ok, buyCost: () => 100 });
        world.units = [VANGUARD, ...packed()];
        out = units.upgradeUnits(createBudget({ gold: 150 }), threat, { mode: "THREAT" });
        assert.deepEqual(sent("UNITCOMMAND_UPGRADE_ARMY"), []);
        // A packed soldier is the cheapest way to the age's first melee unit too.
        reset({ unitCommandResult: ok, buyCost: () => 100 });
        world.units = [VANGUARD, ...packed()];
        const first = units.upgradeFirstMelee(1, 1000);
        assert.ok(first?.entry.key === "FIRST_MELEE_UPGRADED", JSON.stringify(first));
    } finally {
        GameInfo.UnitUpgrades = saved;
        delete world.buyCost;
    }
});
