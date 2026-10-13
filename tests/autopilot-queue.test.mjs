// Nothing is moved ahead of an item already in production with progress: the game gives the
// preempted item's progress to whatever takes its place, drops what exceeds that item's cost, and
// the preempted item starts over (seen in game: the Pyramids at 136 of 137 turned into a Market).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 24, height: 16, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 6, y: 6, name: "Athens", pop: 8, prod: 20 },
        { owner: 0, x: 14, y: 6, name: "Sparta", pop: 3, prod: 8 },
    ],
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const moves = () => fake.sent.filter((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo).map((s) => [s.id.id, s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
const athens = world.cities[0];

function reset() {
    fake.sent.length = 0;
    for (const c of world.cities) for (const k of ["queue", "queued", "trains"]) delete c[k];
    delete world.canBuild;
    world.units = [];
}

test("victory work goes behind a wonder with progress, not ahead of it", () => {
    reset();
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY"];
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), [[0, 2, 1]], "the Library right behind the Pyramids");
    // Nothing done yet on the current item: the Library may go first.
    athens.queue.pct = 0;
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), [[0, 2, 0]]);
    // Already right behind it: no move.
    athens.queue.pct = 60;
    athens.queued = ["BUILDING_LIBRARY"];
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(moves(), []);
});

test("a settler goes behind a wonder with progress, not ahead of it", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT"];
    athens.trains = "UNIT_SETTLER";
    const out = steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 1]]);
    assert.equal(out[0].key, "FRONT_LOADED");
    athens.queue.pct = 0;
    fake.sent.length = 0;
    steps.frontLoadUnits({ settlers: true });
    assert.deepEqual(moves(), [[0, 2, 0]]);
});

test("a repair goes behind a wonder with progress, not ahead of it", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    athens.queued = ["BUILDING_MONUMENT", "BUILDING_LIBRARY"];
    world.canBuild = (type, id) => (type === "BUILDING_LIBRARY" && id.id === 0 ? { Success: true, RepairDamaged: true, InQueue: true, Plots: [idx(7, 6)] } : type === undefined ? { Success: true } : { Success: false, Plots: [] });
    const out = steps.repairBuildings({ buy: false, queue: true });
    assert.deepEqual(moves(), [[0, 2, 1]]);
    assert.ok(out.some((e) => e.key === "REPAIR_FIRST"));
});

test("a wanted settler is trained where the queue is free soonest, not behind a long wonder", () => {
    reset();
    athens.queue = { type: "WONDER_PYRAMIDS", turns: 9, pct: 60 };
    world.units = [{ id: 1, type: "UNIT_SETTLER", x: 6, y: 7 }]; // one in flight: one more wanted
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === GameInfo.Units.lookup("UNIT_SETTLER").$hash).map((s) => s.id.id);
    steps.fillProduction(new Map(), { settlers: true });
    assert.deepEqual(trained(), [1], "Sparta, though Athens is bigger");
    // Athens's current item has no progress yet: the bigger city again.
    athens.queue.pct = 0;
    fake.sent.length = 0;
    steps.fillProduction(new Map(), { settlers: true });
    assert.deepEqual(trained(), [0]);
    reset();
});
