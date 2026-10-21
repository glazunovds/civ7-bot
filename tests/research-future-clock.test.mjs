// Research/40 A7: each Future Tech we complete adds 10 age progress points (HumanOnly), so in the final age its +3 Innovation
// also ends the game sooner. The path takes one only when it is done before the end it brings nearer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { futureClockTurns, futureInTime } from "../mod/expansion-planner/ui/core/xpl-research-value.js";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 3, y: 5, name: "Houston" }],
};
const fake = installFakeEngine(world, "modern");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const researched = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);

test("core: a Future node takes its 10 points off the end at the age's pace; it must be done before that shortened end", () => {
    assert.equal(futureClockTurns(20, 40), 5, "40 points in 20 turns: 10 points are 5 turns");
    assert.equal(futureClockTurns(20, 0), Infinity);
    assert.ok(futureInTime(10, 1, 20, 5));
    assert.ok(!futureInTime(16, 1, 20, 5), "done at 16, the end comes at 15");
    assert.ok(!futureInTime(12, 2, 20, 5), "the second one: the end at 10");
    assert.ok(futureInTime(99, 3, Infinity, 5), "no end on the clock");
});

test("final age, science: Future Tech only when done before the end it brings nearer; else another node", () => {
    world.research = {
        tech: { available: [N("NODE_TECH_MO_FUTURE_TECH"), N("NODE_TECH_MO_MOBILIZATION")] }, culture: { available: [] },
        turns: { NODE_TECH_MO_FUTURE_TECH: 4, NODE_TECH_MO_MOBILIZATION: 6 },
        depth: { NODE_TECH_MO_ROCKETRY: 1 }, // the gate is in: the research that brings Innovation
    };
    world.treeRecs = () => [{ recommendedType: N("NODE_TECH_MO_MOBILIZATION"), whichAdvisors: [] }];
    world.finalAge = true;
    world.settlementCap = 20; // no structural gain from a settlement cap here
    try {
        world.agePoints = 20; // 80 points left: plenty of time
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(researched(), ["NODE_TECH_MO_FUTURE_TECH"], "the path's Innovation");
        world.agePoints = 92; // 8 points left: one Future Tech ends the game before it is done
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(researched(), ["NODE_TECH_MO_MOBILIZATION"]);
    } finally {
        delete world.research;
        delete world.treeRecs;
        delete world.finalAge;
        delete world.agePoints;
        delete world.settlementCap;
    }
});

test("the science race plans Future Techs only while each is done before the end it brings nearer", () => {
    world.research = { tech: { available: [] }, culture: { available: [] }, turns: { NODE_TECH_MO_FUTURE_TECH: 4 }, depth: { NODE_TECH_MO_ROCKETRY: 1, NODE_TECH_MO_NUCLEAR_FISSION: 1 } };
    world.finalAge = true;
    const futures = () => steps.researchPlan(Players.get(0).Cities.getCities()).runs.filter((r) => r.key === "NODE_TECH_MO_FUTURE_TECH").length;
    try {
        // Six Innovation masteries first (60 turns), then Future Tech (4 turns, then 8).
        world.agePoints = 20; // about 96 turns left, 12 a Future Tech
        assert.equal(futures(), 2, "plenty of time: FUTURE_TECH_AHEAD");
        world.agePoints = 30; // about 84 left: the first is done at 64 (the end then at 72), the second at 72 (the end at 60)
        assert.equal(futures(), 1);
        world.agePoints = 60;
        assert.equal(futures(), 0);
    } finally {
        delete world.research;
        delete world.finalAge;
        delete world.agePoints;
    }
});
