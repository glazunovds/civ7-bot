// The final age's military lever (research/26 §3.3-3.4): the settlements we may still found (the cap's room) and
// Operation Ivy (+25 military points) when the Manhattan Project is ours and it fits in the time left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: 5, y: 5, name: "Athens", pop: 12, prod: 100 },
        { owner: 0, x: 12, y: 5, name: "Sparta", pop: 6, prod: 40 },
        { owner: 1, x: 25, y: 15, name: "Babylon" },
    ],
};
const fake = installFakeEngine(world, "modern");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const IVY = GameInfo.Projects.lookup("PROJECT_OPERATION_IVY");
const ivyOrders = () => fake.sent.filter((s) => s.kind === "operation" && s.args.ProjectType === IVY.$hash).map((s) => s.id.id);

test("the military room: only in the final age; the cap's room; Operation Ivy when a city may run it in time", () => {
    assert.equal(steps.militaryRoom(), null, "not the final age");
    world.finalAge = true;
    world.agePoints = 50;
    world.settlementCap = 6;
    try {
        world.canBuild = (type) => (type === "PROJECT_OPERATION_IVY" ? { Success: false } : undefined);
        assert.deepEqual(steps.militaryRoom(), { room: 4, ivy: false }, "2 of 6: 4 to found; no Manhattan Project");
        world.canBuild = (type) => (type === "PROJECT_OPERATION_IVY" ? { Success: true } : undefined);
        world.costOf = (t) => (t === "PROJECT_OPERATION_IVY" ? 500 : 100);
        assert.deepEqual(steps.militaryRoom(), { room: 4, ivy: true }, "Athens runs it in 5 turns");
        world.costOf = (t) => (t === "PROJECT_OPERATION_IVY" ? 100000 : 100);
        assert.equal(steps.militaryRoom().ivy, false, "it would not finish before the game ends");
    } finally {
        delete world.finalAge;
        delete world.agePoints;
        delete world.settlementCap;
        delete world.canBuild;
        delete world.costOf;
    }
});

test("Operation Ivy is queued for the lever only when it is needed, in the best producer without a Launch Pad", () => {
    world.finalAge = true;
    world.agePoints = 50;
    world.canBuild = (type) => (type === "PROJECT_OPERATION_IVY" ? { Success: true } : undefined);
    world.costOf = (t) => (t === "PROJECT_OPERATION_IVY" ? 500 : 100);
    const structures = world.structures;
    try {
        fake.sent.length = 0;
        assert.deepEqual(steps.pushOperationIvy({ militaryLever: true, ivy: false }), [], "the settlements suffice");
        assert.deepEqual(steps.pushOperationIvy({ militaryLever: false, ivy: true }), []);
        const out = steps.pushOperationIvy({ militaryLever: true, ivy: true });
        assert.deepEqual(ivyOrders(), [0], "Athens, the best producer");
        assert.equal(out[0]?.key, "VICTORY_WORK");
        // Athens has a Launch Pad: its production stays with the space programme; Sparta runs Ivy.
        world.structures = (x, y) => (x === 5 && y === 5 ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_LAUNCH_PAD"] } : { district: null, constructibles: [] });
        fake.sent.length = 0;
        steps.pushOperationIvy({ militaryLever: true, ivy: true });
        assert.deepEqual(ivyOrders(), [1]);
        // Already queued: not again.
        world.structures = structures;
        world.cities[0].queued = ["PROJECT_OPERATION_IVY"];
        world.turnsFor = (_c, type) => (type === IVY.$hash || type === "PROJECT_OPERATION_IVY" ? 5 : -1);
        fake.sent.length = 0;
        assert.deepEqual(steps.pushOperationIvy({ militaryLever: true, ivy: true }), []);
    } finally {
        world.structures = structures;
        delete world.cities[0].queued;
        delete world.turnsFor;
        delete world.finalAge;
        delete world.agePoints;
        delete world.canBuild;
        delete world.costOf;
    }
});
