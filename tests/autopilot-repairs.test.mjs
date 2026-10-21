// Repairs first: damaged buildings and improvements are bought with gold when it covers them
// (before the gold reserve), else queued and moved to the front of the city's queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 3, y: 3, name: "Rome", queue: { type: "BUILDING_MONUMENT", turns: 3 } },
        { owner: 0, x: 10, y: 3, name: "Ostia", isTown: true },
    ],
    gold: 500,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const LIBRARY = GameInfo.Constructibles.lookup("BUILDING_LIBRARY").$hash;
const GRANARY = GameInfo.Constructibles.lookup("BUILDING_GRANARY").$hash;
// The game's build answer marks a damaged building (RepairDamaged, its tile in Plots).
world.canBuild = (type, id) => {
    if (type === "BUILDING_LIBRARY" && id.id === 0) return { Success: true, RepairDamaged: true, Plots: [idx(4, 3)], InQueue: !!world.libraryQueued };
    if (type === "BUILDING_GRANARY" && id.id === 1) return { Success: true, RepairDamaged: true, Plots: [idx(11, 3)] };
    return { Success: true, Plots: [] };
};
world.canBuy = () => ({ Success: true, Cost: 120 });
const sent = (kind, op) => fake.sent.filter((s) => s.kind === kind && (op === undefined || s.op === op));

test("damaged buildings are bought with gold when it covers them, in towns too", () => {
    fake.sent.length = 0;
    world.gold = 500;
    const out = steps.repairBuildings();
    assert.deepEqual(sent("command", CityCommandTypes.PURCHASE).map((s) => [s.id.id, s.args.ConstructibleType, s.args.X, s.args.Y]), [[0, LIBRARY, 4, 3], [1, GRANARY, 11, 3]]);
    assert.deepEqual(out.map((e) => e.key), ["REPAIR_BOUGHT", "REPAIR_BOUGHT"]);
});

test("two repairs that each fit the gold are not both bought: the treasury does not change during a pass (seen in game 6)", () => {
    fake.sent.length = 0;
    world.gold = 200;
    const out = steps.repairBuildings();
    assert.deepEqual(sent("command", CityCommandTypes.PURCHASE).map((s) => [s.id.id, s.args.ConstructibleType]), [[0, LIBRARY]], "120 of 200 spent: Ostia's 120 waits");
    assert.deepEqual(out.map((e) => e.key), ["REPAIR_BOUGHT"]);
    world.gold = 500;
});

test("not enough gold: the repair is queued in a city (towns only buy)", () => {
    fake.sent.length = 0;
    world.gold = 100;
    const out = steps.repairBuildings();
    assert.deepEqual(sent("command", CityCommandTypes.PURCHASE), []);
    assert.deepEqual(sent("operation").map((s) => [s.id.id, s.args.ConstructibleType, s.args.X, s.args.Y]), [[0, LIBRARY, 4, 3]]);
    assert.deepEqual(out.map((e) => e.key), ["REPAIR_QUEUED"]);
    world.gold = 500;
});

test("a queued repair waiting behind other items goes to the front", () => {
    fake.sent.length = 0;
    world.gold = 0;
    world.libraryQueued = true;
    world.cities[0].queued = ["BUILDING_LIBRARY"];
    const out = steps.repairBuildings();
    const move = sent("operation").find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [1, 0]);
    assert.ok(!sent("operation").some((s) => s.args.ConstructibleType === LIBRARY), "not queued twice");
    assert.ok(out.some((e) => e.key === "REPAIR_FIRST"));
    delete world.libraryQueued;
    delete world.cities[0].queued;
    world.gold = 500;
});

test("without purchases nothing is bought; without production nothing is queued", () => {
    fake.sent.length = 0;
    steps.repairBuildings({ buy: false, queue: false });
    assert.deepEqual(fake.sent, []);
});

// Game 42: a Pairidaeza's repair queued on 43,35, then Battersea ordered there; the wonder never completed. One order per tile:
// no repair is queued under a wonder of ours.
test("no repair is queued on a tile a wonder of ours is queued on (one order per tile: game 42)", () => {
    fake.sent.length = 0;
    world.gold = 100;
    world.cities[0].queued = [{ type: "WONDER_PYRAMIDS", x: 4, y: 3 }];
    try {
        steps.repairBuildings();
        assert.deepEqual(sent("operation").filter((s) => s.args.ConstructibleType === LIBRARY), []);
    } finally {
        delete world.cities[0].queued;
        world.gold = 500;
    }
});
