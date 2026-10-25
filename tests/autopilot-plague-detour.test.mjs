// The review of game 60's plague package: a walk whose end-of-turn stop lies on the plague goes around it a turn at a time
// (cleanStep), and that turn's stop is one no safety rule had seen: the step that sent the unit judged the way it replaced
// (a ranged guard's first night, a settler's way, a commander's stop). A guard's step around the plague ended next to a
// raider. Now the step never ends next to a hostile land unit, and a unit that is not a healthy melee soldier keeps out of
// every hostile soldier's reach there; with no such tile the walk waits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const PETERS = { x: 31, y: 10 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [
        { owner: 0, x: 5, y: 10, name: "Home" },
        { owner: 0, ...PETERS, name: "Petersburg" },
    ],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const moveOf = (id) => {
    const a = fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
    return a ? { x: a.X, y: a.Y } : undefined;
};
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["plotEffects", "enemies"]) delete world[k];
    // The plague on column 21 for 6 turns: a walk from 19,10 to Petersburg ends its first turn on 21,10.
    Object.assign(world, { plotEffects: (x) => (x === 21 ? [{ type: "PLOTEFFECT_PLAGUE", duration: 6 }] : []) }, extra);
};
const run = (threat) => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: true, merchants: false, threats: [threat] });

test("a turn's step around the plague never ends next to a raider; a ranged soldier's keeps out of its reach, else it waits", () => {
    // Two raiders threaten Petersburg (a melee guard each and a ranged one behind them); one raider of theirs is seen here.
    const threat = { settlement: { ...PETERS, name: "Petersburg" }, count: 2, land: 2, ships: 0, close: 0, damaged: false, owners: [] };
    // The raider on the plague column next to every clean step nearer Petersburg (20,9, 20,10, 20,11): the guard waits.
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 19, y: 10 }], { enemies: [{ x: 21, y: 10, owner: 9, type: "UNIT_WARRIOR" }] });
    let r = run(threat);
    let to = moveOf(4);
    assert.ok(!to || dist(to, { x: 21, y: 10 }) > 1, `next to the raider: ${JSON.stringify(to)} ${JSON.stringify(r.entries)}`);
    // The raider two tiles past the plague (23,10): the clean steps are in its reach, none next to it. A healthy Warrior
    // takes one; a Slinger (its first night, 21,10, in one raider's reach only, is no unsafe way) waits.
    const far = { enemies: [{ x: 23, y: 10, owner: 9, type: "UNIT_WARRIOR" }] };
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 19, y: 10 }], far);
    r = run(threat);
    to = moveOf(4);
    assert.ok(to && to.x === 20 && dist(to, { x: 23, y: 10 }) > 1, `the Warrior steps around: ${JSON.stringify(to)} ${JSON.stringify(r.entries)}`);
    fresh([{ id: 5, type: "UNIT_SLINGER", x: 19, y: 10 }], far);
    r = run(threat);
    assert.equal(moveOf(5), undefined, `the Slinger waits: ${JSON.stringify(r.entries)}`);
    // No raider: the Slinger steps around the plague too.
    fresh([{ id: 5, type: "UNIT_SLINGER", x: 19, y: 10 }]);
    r = run(threat);
    to = moveOf(5);
    assert.ok(to && to.x === 20, `${JSON.stringify(to)} ${JSON.stringify(r.entries)}`);
});

test("a guard whose walk the plague cancels is sent again in the same pass, around the plague (it stood idle a turn)", () => {
    const threat = { settlement: { ...PETERS, name: "Petersburg" }, count: 1, land: 1, ships: 0, close: 0, damaged: false, owners: [] };
    // Pass 1, no plague: the Warrior at 17,10 is sent to Petersburg.
    fresh([{ id: 6, type: "UNIT_WARRIOR", x: 17, y: 10 }], { plotEffects: () => [], unitCommandOk: (_id, op) => op === "UNITCOMMAND_CANCEL" });
    Game.turn = 20;
    try {
        let r = run(threat);
        const dest = moveOf(6);
        assert.ok(dest && dist(dest, PETERS) <= 2 && r.entries.some((e) => e.key === "REINFORCE"), JSON.stringify(r.entries));
        // Pass 2, a turn later at 19,10 on its way: the plague on column 21, its next night. Its walk is cancelled, and it
        // is sent again at once: this turn to the clean tile nearest Petersburg.
        Game.turn = 21;
        fake.sent.length = 0;
        world.units = [{ id: 6, type: "UNIT_WARRIOR", x: 19, y: 10, activity: UnitActivityTypes.OPERATION, dest }];
        world.plotEffects = (x) => (x === 21 ? [{ type: "PLOTEFFECT_PLAGUE", duration: 6 }] : []);
        r = run(threat);
        assert.ok(fake.sent.some((s) => s.id?.id === 6 && s.op === "UNITCOMMAND_CANCEL") && r.entries.some((e) => e.key === "WALK_HAZARD"), JSON.stringify(r.entries));
        const again = moveOf(6);
        assert.ok(again && again.x === 20 && r.entries.some((e) => e.key === "REINFORCE"), `sent again: ${JSON.stringify(again)} ${JSON.stringify(r.entries)}`);
    } finally {
        Game.turn = 1;
        delete world.unitCommandOk;
    }
});
