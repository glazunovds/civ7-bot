// Research/42 B2 (the user, after game 53: "commanders are not packing units"; Китион's reinforcements came one at a time,
// 2-6 turns out, while its centre fell in five turns): a general packs the soldiers walking far to one fight
// (UNITCOMMAND_ADD_TO_ARMY on each, as the game's add-to-army mode sends it) and marches with them when its packed way is no
// slower than their walk; its members count as coming; a march whose settlement needs nothing any more unpacks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
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
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const COMMANDER = { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON, army: 3 };
const raiders = [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }, { x: YORK.x + 2, y: YORK.y + 1, owner: 5, type: "UNIT_WARRIOR" }];
// Two Spearmen next to London, slow walkers (a tile a turn): 7-8 turns to York; the commander's packed army takes 4.
const soldiers = () => [{ id: 1, type: "UNIT_SPEARMAN", x: 9, y: 8 }, { id: 2, type: "UNIT_SPEARMAN", x: 8, y: 9 }];
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "unitCommandResult", "armies", "speed"]) delete world[k];
    world.units = [];
    Game.turn = 10;
    settings.remember(gameKey(), { melee: null });
    Object.assign(world, {
        armies: { "0:3": { ...LONDON, capacity: 4, unitCount: 0 } },
        enemies: raiders,
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_ADD_TO_ARMY" ? { Success: false, Plots: [idx(LONDON.x, LONDON.y)] }
            : op === "UNITCOMMAND_UNPACK_ARMY" ? { Success: false, Plots: [idx(LONDON.x + 1, LONDON.y)] } : undefined),
    }, extra);
};
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
const sentOp = (op) => fake.sent.filter((s) => s.op === op);
const keys = (r) => r.entries.map((e) => e.key);
const york = () => units.threatenedSettlements().find((t) => t.settlement.name === "York");

test("a general packs the slow soldiers bound for a threatened settlement and marches with them; they count as coming", () => {
    reset({ speed: (id) => (id.id === 9 ? 2 : 1) });
    world.units = [COMMANDER, ...soldiers()];
    const r = run();
    const adds = sentOp("UNITCOMMAND_ADD_TO_ARMY");
    assert.deepEqual(adds.map((s) => [s.id.id, s.args.X, s.args.Y]).sort(), [[1, LONDON.x, LONDON.y], [2, LONDON.x, LONDON.y]], JSON.stringify(r.entries));
    const go = fake.sent.find((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO);
    assert.deepEqual([go?.args.X, go?.args.Y], [YORK.x, YORK.y]);
    assert.ok(keys(r).includes("ARMY_MARCH"), JSON.stringify(r.entries));
    assert.ok(!keys(r).includes("REINFORCE"), "they do not walk on their own");
    // York counts them as coming with the march's turns (4, and 1 to unpack).
    const d = units.guardDetail(york());
    assert.deepEqual(d.incoming.map((x) => [x.u.id.id, x.turns]).sort(), [[1, 5], [2, 5]]);
});

test("no march when the soldiers walk as fast as the general; a march goes on while it is needed and unpacks when it is not", () => {
    // Walking as fast: each walks on its own (a turn to pack and one to unpack would only lose time).
    reset();
    world.units = [COMMANDER, ...soldiers()];
    let r = run();
    assert.deepEqual(sentOp("UNITCOMMAND_ADD_TO_ARMY"), [], JSON.stringify(r.entries));
    assert.ok(keys(r).includes("REINFORCE"));
    // A march under way: packed (off the map), the general still at London; the next turn it goes on toward York.
    reset({ speed: (id) => (id.id === 9 ? 2 : 1) });
    world.units = [COMMANDER, ...soldiers()];
    run();
    Game.turn = 11;
    fake.sent.length = 0;
    world.units = [COMMANDER, ...soldiers().map((u) => ({ ...u, ...LONDON, onMap: false, army: 3 }))];
    r = run();
    const go = fake.sent.find((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO);
    assert.deepEqual([go?.args.X, go?.args.Y], [YORK.x, YORK.y], JSON.stringify(r.entries));
    assert.deepEqual(sentOp("UNITCOMMAND_ADD_TO_ARMY"), []);
    // York safe again: the army unpacks where it stands.
    Game.turn = 12;
    fake.sent.length = 0;
    world.enemies = [];
    r = run();
    assert.deepEqual(sentOp("UNITCOMMAND_UNPACK_ARMY").map((s) => [s.id.id, s.args.X, s.args.Y]), [[9, LONDON.x + 1, LONDON.y]], JSON.stringify(r.entries));
});
