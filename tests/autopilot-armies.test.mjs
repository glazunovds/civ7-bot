// Research/37 Phase 3: armies. The inventory of our land commanders' armies (members packed in them, reinforcements on
// their way), a packed army at a threatened settlement unpacking toward the raiders (packed units cannot attack), and a
// native reinforcement (UNITOPERATION_REINFORCE_ARMY: the soldier travels off the map to a commander standing at the
// settlement) when it comes sooner than walking, counted as on its way with the game's ETA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
const LEEDS = { x: 8, y: 16 };
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
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const COMMANDER = { id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK, army: 3 };
const ARMY = { "0:3": { ...YORK, capacity: 4, unitCount: 0 } };
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["canBuild", "canBuy", "enemies", "unitCommandResult", "unitCanStart", "unreachable", "armies", "villages"]) delete world[k];
    world.units = [];
    world.gold = 1000;
    Game.turn = 10;
    settings.remember(gameKey(), { melee: null });
    Object.assign(world, extra);
};
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => s.id.id);
const york = () => units.threatenedSettlements().find((t) => t.settlement.name === "York");
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
const sentOp = (op) => fake.sent.filter((s) => s.op === op);
const keys = (r) => r.entries.map((e) => e.key);

test("the army inventory: a commander's packed members, and the units on their way to it as reinforcements with their turns (research/37 §5C.1)", () => {
    reset({ armies: ARMY });
    world.units = [
        COMMANDER,
        { id: 5, type: "UNIT_SPEARMAN", ...YORK, onMap: false, army: 3 },
        // On its way it may carry the army's id already (not known: probe P-A3): it is not packed yet either way.
        { id: 6, type: "UNIT_WARRIOR", x: -1, y: -1, onMap: false, army: 3, reinforcing: { to: 3, eta: 2, from: LONDON } },
        { id: 7, type: "UNIT_WARRIOR", ...LONDON },
    ];
    const inv = units.armyInventory();
    assert.equal(inv.length, 1);
    assert.deepEqual([inv[0].localId, inv[0].capacity], [3, 4]);
    assert.deepEqual(inv[0].packed.map((u) => u.id.id), [5], "the reinforcement is not packed yet; the walker is not in it");
    assert.deepEqual(inv[0].incoming.map((x) => [x.u.id.id, x.turns]), [[6, 2]]);
});

test("a packed army at a threatened settlement unpacks toward the raiders, once a turn; its members count as on their way (research/37 §5C.2)", () => {
    const unpackAt = [idx(15, 8), idx(17, 8), idx(16, 9)];
    reset({
        armies: ARMY,
        enemies: [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }],
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_UNPACK_ARMY" ? { Success: true, Plots: unpackAt } : undefined),
    });
    world.units = [COMMANDER, { id: 5, type: "UNIT_SPEARMAN", ...YORK, onMap: false, army: 3 }, { id: 6, type: "UNIT_WARRIOR", ...YORK, onMap: false, army: 3 }];
    const r = run();
    const sent = sentOp("UNITCOMMAND_UNPACK_ARMY");
    assert.equal(sent.length, 1, JSON.stringify(r.entries));
    assert.deepEqual([sent[0].id.id, sent[0].args.X, sent[0].args.Y], [9, 17, 8], "the offered tile nearest the raider at 18,8");
    assert.ok(keys(r).includes("ARMY_UNPACKED"));
    // Its members are on their way, a turn out: York needs nothing bought.
    const t = york();
    assert.deepEqual(units.guardDetail(t, undefined, [t]).incoming.map((x) => [x.u.id.id, x.turns]), [[5, 1], [6, 1]]);
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    fake.sent.length = 0;
    steps.buyDefenders([t], { budget: createBudget({ gold: 1000, reserve: 0 }) });
    assert.deepEqual(bought(), [], "nothing bought while the army unpacks there");
    // The end-of-turn retry, the game not having moved them yet: no second request.
    fake.sent.length = 0;
    run();
    assert.deepEqual(sentOp("UNITCOMMAND_UNPACK_ARMY"), [], "once a turn");
    // No threat there: it stays packed.
    reset({ armies: ARMY, unitCommandResult: (_id, op) => (op === "UNITCOMMAND_UNPACK_ARMY" ? { Success: true, Plots: unpackAt } : undefined) });
    world.units = [COMMANDER, { id: 5, type: "UNIT_SPEARMAN", ...YORK, onMap: false, army: 3 }];
    run();
    assert.deepEqual(sentOp("UNITCOMMAND_UNPACK_ARMY"), [], "no threat");
    // No tile offered (no room around it): it waits.
    reset({
        armies: ARMY, enemies: [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }],
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_UNPACK_ARMY" ? { Success: false, Plots: [], FailureReasons: ["LOC_UNITCOMMAND_LEAVE_ARMY_NO_LOCATION"] } : undefined),
    });
    world.units = [COMMANDER, { id: 5, type: "UNIT_SPEARMAN", ...YORK, onMap: false, army: 3 }];
    run();
    assert.deepEqual(sentOp("UNITCOMMAND_UNPACK_ARMY"), [], "no tile");
});

test("a far soldier with no way on foot reinforces the army of our commander at the threatened settlement; walking when that is as quick (research/37 §5C.3)", () => {
    const setup = (extra = {}) => {
        reset({
            armies: ARMY,
            enemies: [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }, { x: YORK.x + 2, y: YORK.y + 1, owner: 5, type: "UNIT_WARRIOR" }],
            unitCanStart: (_id, op) => (op === "UNITOPERATION_REINFORCE_ARMY" ? { Success: true, Plots: [idx(YORK.x, YORK.y)] } : null),
            ...extra,
        });
    };
    const guard = { id: 4, type: "UNIT_WARRIOR", ...YORK };
    const far = { id: 7, type: "UNIT_WARRIOR", x: LONDON.x, y: LONDON.y + 1 };
    // No way on foot (another landmass, a pass held by raiders...): off the map to the commander.
    setup({ unreachable: (_x, _y, id) => id?.id === 7 });
    world.units = [COMMANDER, guard, far];
    let r = run();
    const rein = sentOp("UNITOPERATION_REINFORCE_ARMY");
    assert.deepEqual(rein.map((s) => [s.id.id, s.args.X, s.args.Y]), [[7, YORK.x, YORK.y]], JSON.stringify(r.entries));
    assert.ok(keys(r).includes("REINFORCE_ARMY"));
    // On its way off the map: counted for York with the game's ETA and a turn to deploy, and no second one is sent.
    setup({ unreachable: (_x, _y, id) => id?.id === 7 || id?.id === 8 });
    world.units = [COMMANDER, guard, { ...far, x: -1, y: -1, onMap: false, reinforcing: { to: 3, eta: 2, from: far } }, { id: 8, type: "UNIT_WARRIOR", x: LONDON.x, y: LONDON.y - 1 }];
    const t = york();
    assert.deepEqual(units.guardDetail(t, undefined, [t]).incoming.map((x) => [x.u.id.id, x.turns]), [[7, 3]]);
    run();
    assert.deepEqual(sentOp("UNITOPERATION_REINFORCE_ARMY"), [], "York's lack is covered");
    // Hurt, or without its commander there: nothing.
    setup({ unreachable: (_x, _y, id) => id?.id === 7 });
    world.units = [COMMANDER, guard, { ...far, damage: 10 }];
    run();
    assert.deepEqual(sentOp("UNITOPERATION_REINFORCE_ARMY"), [], "hurt");
    setup({
        armies: { "0:3": { ...LEEDS, capacity: 4, unitCount: 0 } }, unreachable: (_x, _y, id) => id?.id === 7,
        unitCanStart: (_id, op) => (op === "UNITOPERATION_REINFORCE_ARMY" ? { Success: true, Plots: [idx(LEEDS.x, LEEDS.y)] } : null),
    });
    world.units = [{ ...COMMANDER, ...LEEDS }, guard, far];
    run();
    assert.deepEqual(sentOp("UNITOPERATION_REINFORCE_ARMY"), [], "no commander at York");
    // A way on foot about as quick: it walks.
    setup();
    world.units = [COMMANDER, guard, far];
    r = run();
    assert.deepEqual(sentOp("UNITOPERATION_REINFORCE_ARMY"), [], JSON.stringify(r.entries));
    assert.ok(fake.sent.some((s) => s.id?.id === 7 && s.op === UnitOperationTypes.MOVE_TO), "it walks");
    // The game does not offer the commander's tile: no reinforcement, and the slow walker goes (7 turns on foot; the
    // reinforcement would have taken 5).
    const walker = { id: 8, type: "UNIT_WARRIOR", x: 1, y: YORK.y };
    setup({ unreachable: (_x, _y, id) => id?.id === 7, unitCanStart: (_id, op) => (op === "UNITOPERATION_REINFORCE_ARMY" ? { Success: false, Plots: [] } : null) });
    world.units = [COMMANDER, guard, far, walker];
    r = run();
    assert.deepEqual(sentOp("UNITOPERATION_REINFORCE_ARMY"), [], "not offered");
    assert.ok(fake.sent.some((s) => s.id?.id === 8 && s.op === UnitOperationTypes.MOVE_TO), `the walker goes: ${JSON.stringify(r.entries)}`);
});
