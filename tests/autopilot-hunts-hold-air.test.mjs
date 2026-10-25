// The review of W5 (game 60's hunts): a raider hunt's target is left to its coming general (raiderHold), and that covered the
// strike step's soldiers only; our planes still struck it, in the strike step (airStrike) and in the unit step (airAttack),
// from a base far outside the general's radius. Modern data: the Antiquity fixtures have no aircraft.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [{ owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 }],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world, "modern");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const raider = { id: 720, x: 8, y: 12, owner: 5, type: "UNIT_INFANTRY_COMPANY" };
const army = () => [
    { id: 1, type: "UNIT_INFANTRY_COMPANY", ...LONDON }, // the garrison stays
    { id: 2, type: "UNIT_INFANTRY_COMPANY", x: 9, y: 9 },
    { id: 3, type: "UNIT_INFANTRY_COMPANY", x: 7, y: 9 },
    { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON },
];
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, huntRaiders: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
const quiet = async (fn) => {
    const saved = [console.warn, console.info];
    console.warn = () => {};
    console.info = () => {};
    try {
        return await fn();
    } finally {
        [console.warn, console.info] = saved;
    }
};

test("W5: a plane based far from the general leaves the hunted raider to it, in the strike step and the unit step, until its turns are over", async () => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    Game.turn = 20;
    Object.assign(world, {
        units: army(), enemies: [raider], wars: [5], indepRelation: { 5: IndependentRelationship.HOSTILE }, villages: [{ owner: 5, x: 28, y: 22 }],
        combat: () => ({ dealt: 60, taken: 10 }),
    });
    await quiet(() => run());
    assert.equal(units.fieldOpState()?.kind, "RAIDERS");
    // A Dive Bomber based 4 tiles from London, the general still there (4 tiles from the raider).
    world.units = [...army(), { id: 6, type: "UNIT_DIVEBOMBER", x: 12, y: 8 }];
    const idx = GameplayMap.getIndexFromXY(raider.x, raider.y);
    world.unitCanStart = (id, op) => (id.id === 6 && op === "UNITOPERATION_AIR_ATTACK" ? { Success: false, Plots: [idx] } : undefined);
    const strikes = () => fake.sent.filter((s) => s.id?.id === 6 && s.op === "UNITOPERATION_AIR_ATTACK" && s.args?.X === raider.x && s.args?.Y === raider.y);
    fake.sent.length = 0;
    await quiet(() => units.strikeRaiders());
    assert.equal(strikes().length, 0, "the strike step");
    await quiet(() => run());
    assert.equal(units.fieldOpState()?.kind, "RAIDERS", "the hunt goes on");
    assert.equal(strikes().length, 0, JSON.stringify(fake.sent.filter((s) => s.id?.id === 6)));
    // Its 3 turns over: struck, in either step.
    Game.turn += 3;
    fake.sent.length = 0;
    await quiet(() => units.strikeRaiders());
    assert.equal(strikes().length, 1, JSON.stringify(fake.sent.filter((s) => s.id?.id === 6)));
    fake.sent.length = 0;
    await quiet(() => run());
    assert.equal(strikes().length, 1, JSON.stringify(fake.sent.filter((s) => s.id?.id === 6)));
});
