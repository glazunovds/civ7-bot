// Game 60 (research/game60, the plague review): the unit loop leaves a hunt's or a campaign's members to the operation, and a
// member gathered by its staging tile waited there whatever the tile did: on the plague it would take 25 a turn for up to
// GATHER_MAX turns. A gathered member on an infected tile takes a clean one by the staging tile instead, and stays a member.
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

const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const moves = (id) => fake.sent.filter((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO).map((s) => ({ x: s.args.X, y: s.args.Y }));
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, hunt: true, threats: [], fronts: [], exposed: [] });

test("a hunt's member gathered by the staging tile on the plague takes a clean tile there, and stays a member", () => {
    // The hunts test's village (befriending out of reach: hunted); pass 1 gathers the free soldiers 2 tiles from it.
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...ATHENS },
        { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5 },
        { id: 3, type: "UNIT_WARRIOR", x: 6, y: 6 },
        { id: 4, type: "UNIT_WARRIOR", x: 5, y: 6 },
        { id: 7, type: "UNIT_ARMY_COMMANDER", x: 4, y: 5 },
    ];
    Object.assign(world, {
        villages: [{ owner: 9, ...VILLAGE }], indepRelation: { 9: IndependentRelationship.NEUTRAL },
        befriend: { 9: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } },
    });
    try {
        run();
        const op = units.fieldOpState();
        assert.equal(op?.stage, "GATHER");
        const spots = Object.fromEntries([2, 3, 4].map((id) => [id, moves(id).at(-1)]));
        assert.ok([2, 3, 4].every((id) => spots[id] && dist(spots[id], op.staging) <= 1), JSON.stringify(spots));
        // Pass 2: they stand there (one still to come, so the hunt gathers on); the plague now on member 2's tile.
        world.units = world.units.map((u) => (u.id === 2 || u.id === 3 ? { ...u, ...spots[u.id] } : u));
        world.plotEffects = (x, y) => (x === spots[2].x && y === spots[2].y ? ["PLOTEFFECT_PLAGUE"] : []);
        fake.sent.length = 0;
        const r = run();
        assert.equal(units.fieldOpState()?.stage, "GATHER", JSON.stringify(r.entries));
        const to = moves(2).at(-1);
        assert.ok(to && dist(to, op.staging) <= 1 && !(to.x === spots[2].x && to.y === spots[2].y), `off the plague by the staging tile: ${JSON.stringify(r.entries)}`);
        assert.ok([...units.fieldOpState().members].includes("0:2"), "still a member");
        assert.deepEqual(moves(3), [], "a gathered member on a clean tile waits there");
    } finally {
        for (const k of ["villages", "indepRelation", "befriend", "influence", "playerYields", "plotEffects"]) delete world[k];
        units.resetUnitGoals();
    }
});
