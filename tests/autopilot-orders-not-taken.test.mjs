// Orders the game does not carry out hold the turn (game 65). A52: a hunt's Warrior was sent to 72,20 in every round of the
// settle loop, the game never moved it, and each round's release was undone by the hunt's next order, so the skip step never
// skipped it («Отдать приказы юнитам»). A51: the hunt's Legatus unpacked its army and kept a move; it was never released.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 5 };
const VILLAGE = { x: 11, y: 5 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...ATHENS, name: "Athens", pop: 6, prod: 10 }],
    units: [],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, hunt: true, threats: [], fronts: [], exposed: [], ...options });
const movesOf = (id) => fake.sent.filter((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO);

test("a hunt member whose move the game did not carry out is not sent again that turn: the skip step may skip it", () => {
    units.resetUnitGoals();
    Object.assign(world, {
        villages: [{ owner: 9, ...VILLAGE }], indepRelation: { 9: IndependentRelationship.NEUTRAL }, befriend: { 9: { status: -3, cost: 200 } },
        influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } }, enemies: [{ x: 10, y: 6, owner: 9, type: "UNIT_WARRIOR" }],
    });
    // Gathered around the staging tile; unit 4 stands 2 from the village's Warrior.
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...ATHENS }, { id: 2, type: "UNIT_WARRIOR", x: 9, y: 6 }, { id: 3, type: "UNIT_WARRIOR", x: 10, y: 7 },
        { id: 4, type: "UNIT_WARRIOR", x: 8, y: 5 }, { id: 7, type: "UNIT_ARMY_COMMANDER", x: 8, y: 4 }];
    run();
    run();
    assert.equal(units.fieldOpState()?.stage, "FIGHT");
    world.wars = [9];
    world.indepRelation = { 9: IndependentRelationship.HOSTILE };
    fake.sent.length = 0;
    let r = run();
    assert.equal(movesOf(4).length, 1, "the fight: unit 4 advances next to their Warrior");
    assert.ok(r.ordered.has("0:4"));
    // The game does not move it (the fake carries out no move): the settle round releases it, as the hud does.
    const released = units.releaseStuckOrders(r.orderedAt);
    assert.ok(released.includes("0:4"), JSON.stringify(released));
    const refused = movesOf(4)[0].args;
    // Whoever orders it, that move is not sent again this turn (moveTo).
    fake.sent.length = 0;
    run();
    assert.ok(!movesOf(4).some((s) => s.args.X === refused.X && s.args.Y === refused.Y), JSON.stringify(movesOf(4)));
    // With the hud's list of units left this turn the hunt orders it nowhere, not even to another tile (their Warrior moved).
    world.enemies = [{ x: 12, y: 7, owner: 9, type: "UNIT_WARRIOR" }];
    fake.sent.length = 0;
    r = run({ leave: new Set(released) });
    // Before, the hunt sent the same move again and kept it from the skip step, in every round.
    assert.equal(movesOf(4).length, 0, JSON.stringify(movesOf(4)));
    assert.ok(!r.ordered.has("0:4"), "free for the skip step");
    // The next turn it may be ordered there again.
    Game.turn += 1;
    try {
        fake.sent.length = 0;
        run();
        assert.equal(movesOf(4).length, 1);
    } finally {
        Game.turn -= 1;
    }
});

test("a unit that acted without moving (an army unpacked) and still has a move is released for the skip step", () => {
    units.resetUnitGoals();
    world.units = [{ id: 7, type: "UNIT_ARMY_COMMANDER", x: 8, y: 4, moved: true, moves: 1, activity: UnitActivityTypes.AWAKE }];
    assert.deepEqual(units.releaseStuckOrders(new Map([["0:7", { x: 8, y: 4 }]])), ["0:7"]);
    // Not one with no move left, nor one that went elsewhere (its order was carried out).
    world.units[0].moves = 0;
    assert.deepEqual(units.releaseStuckOrders(new Map([["0:7", { x: 8, y: 4 }]])), []);
    world.units[0].moves = 1;
    assert.deepEqual(units.releaseStuckOrders(new Map([["0:7", { x: 7, y: 4 }]])), []);
});
