// A hunt's general never walks ahead of its soldiers into a hostile unit's reach (game 61, E9-E12: the second general walked
// alone for three turns to 54,23, next to a Heavy Archer standing on the staging tile, and was shot down there).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 5 };
const VILLAGE = { x: 11, y: 5 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...ATHENS, name: "Athens", pop: 6, prod: 10 }],
    units: [],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const army = () => [
    { id: 1, type: "UNIT_WARRIOR", ...ATHENS },
    { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5 },
    { id: 3, type: "UNIT_WARRIOR", x: 6, y: 6 },
    { id: 4, type: "UNIT_WARRIOR", x: 5, y: 6 },
    { id: 7, type: "UNIT_ARMY_COMMANDER", x: 4, y: 5 },
];
const reset = () => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "unitCommandOk"]) delete world[k];
    world.units = army();
    world.villages = [{ owner: 9, ...VILLAGE }];
    Object.assign(world, { indepRelation: { 9: IndependentRelationship.NEUTRAL }, befriend: { 9: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } } });
};
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, hunt: true, threats: [], fronts: [], exposed: [] });
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const movesOf = (id) => fake.sent.filter((s) => s.id?.id === id && s.op === "UNITOPERATION_MOVE_TO").map((s) => ({ x: s.args.X, y: s.args.Y }));

/** A Roman archer at war with us, next to the hunt's staging tile (on the side away from Athens). */
function archerBy(staging) {
    const at = { x: staging.x + 1, y: staging.y - 1 };
    world.wars = [1];
    world.enemies = [{ id: 950, owner: 1, type: "UNIT_ARCHER", ...at }];
    return at;
}

test("gathering, the hunt's general goes only where no hostile unit reaches it, not to the staging tile next to an archer", () => {
    reset();
    run();
    const op = units.fieldOpState();
    assert.equal(op?.stage, "GATHER");
    assert.equal(op.commander, "0:7");
    const archer = archerBy(op.staging);
    fake.sent.length = 0;
    run();
    const moves = movesOf(7);
    // Out of its reach (2 moves and a range of 2: hostilesInReach), or under a soldier of ours (commanderSafeAt). Before, it
    // went next to the staging tile, 1-2 tiles from the archer, alone.
    const underSoldier = (m) => world.units.some((u) => u.id !== 7 && u.x === m.x && u.y === m.y);
    assert.ok(moves.length > 0 && moves.every((m) => dist(m, archer) > 4 || underSoldier(m)), `the general's moves ${JSON.stringify(moves)}, the archer at ${archer.x},${archer.y}`);
    assert.ok(moves.every((m) => dist(m, op.staging) > 1 || underSoldier(m)), "not alone by the staging tile");
});

test("a hunt's general already walking toward a tile a hostile unit now reaches stops its walk", () => {
    reset();
    run();
    // A Roman Warrior at war with us by the staging tile (its reach: 2 moves + 1); the general stands out of it, under our
    // Warrior at 6,5, walking to 8,5 (one turn away), which the Warrior reaches.
    const enemy = { x: 10, y: 4 };
    world.wars = [1];
    world.enemies = [{ id: 951, owner: 1, type: "UNIT_WARRIOR", ...enemy }];
    const dest = { x: 8, y: 5 };
    const cmdr = world.units.find((u) => u.id === 7);
    Object.assign(cmdr, { x: 6, y: 5, activity: UnitActivityTypes.OPERATION, dest });
    assert.ok(dist(cmdr, enemy) > 3 && dist(dest, enemy) <= 3, "the scene: out of reach now, its stop in reach");
    world.unitCommandOk = (_id, op2) => op2 === "UNITCOMMAND_CANCEL";
    fake.sent.length = 0;
    const r = run();
    assert.ok(fake.sent.some((s) => s.id?.id === 7 && s.op === "UNITCOMMAND_CANCEL"), JSON.stringify(fake.sent.map((s) => s.op)));
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_WALK_STOPPED"), JSON.stringify(r.entries));
});
