// Game 60's Exploration (research/game60 mechanics M1, corrected): 10 relics archived E89-E127 waited up to ~37 turns for a
// slot, the relic triumph ended 19/20. With the culture focus, a Temple (a relic slot) is the path's building while relics
// wait in the archive with no slot: queued in no more cities than relics wait, bought in a town.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { leverBuildings } from "../mod/expansion-planner/ui/core/xpl-victory-levers.js";

const world = {
    width: 40, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        // The Palace's relic slot holds one already.
        { owner: 0, x: 3, y: 5, name: "Novgorod", prod: 30, gwBuildings: [{ type: "BUILDING_PALACE", slots: [5] }] },
        { owner: 0, x: 12, y: 5, name: "Samara", prod: 25 },
        { owner: 0, x: 21, y: 5, name: "Kazan", prod: 20 },
        { owner: 0, x: 30, y: 5, name: "Tula", isTown: true },
    ],
    agePoints: 20,
};
const fake = installFakeEngine(world, "exploration");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const temples = () => fake.sent.filter((s) => s.kind === "operation" && s.args.ConstructibleType === C("BUILDING_TEMPLE")).map((s) => s.id.id);
const relics = Array.from(GameInfo.GreatWorks, (r) => r).filter((r) => r.GreatWorkObjectType === "GREATWORKOBJECT_RELIC").map((r) => r.GreatWorkType);
const at = (c) => GameplayMap.getIndexFromXY(c.x + 1, c.y);
world.canBuild = (type, id) => (type === "BUILDING_TEMPLE" ? { Success: true, Plots: [at(world.cities[id.id])], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
world.turnsFor = () => 6;
const slots = {
    filter: (f) => [{ ConstructibleType: "BUILDING_TEMPLE", GreatWorkSlotType: "GREATWORKSLOT_RELIC", NumSlots: 1 }, { ConstructibleType: "BUILDING_PALACE", GreatWorkSlotType: "GREATWORKSLOT_RELIC", NumSlots: 1 }].filter(f),
    [Symbol.iterator]: function* () {
        yield { ConstructibleType: "BUILDING_TEMPLE", GreatWorkSlotType: "GREATWORKSLOT_RELIC", NumSlots: 1 };
        yield { ConstructibleType: "BUILDING_PALACE", GreatWorkSlotType: "GREATWORKSLOT_RELIC", NumSlots: 1 };
    },
};

test("core: the culture path's Temple is a lever building in Exploration only while relics wait", () => {
    assert.deepEqual(leverBuildings("CULTURE", "AGE_EXPLORATION", { relicsWaiting: 2 }), ["BUILDING_TEMPLE"]);
    assert.deepEqual(leverBuildings("CULTURE", "AGE_EXPLORATION", { relicsWaiting: 0 }), []);
    assert.deepEqual(leverBuildings("CULTURE", "AGE_EXPLORATION"), []);
    assert.deepEqual(leverBuildings("CULTURE", "AGE_ANTIQUITY", { relicsWaiting: 2 }), []);
    assert.deepEqual(leverBuildings("SCIENCE", "AGE_ANTIQUITY"), ["BUILDING_LIBRARY", "BUILDING_ACADEMY"]);
});

test("M1: two relics waiting and the Palace's slot full: Temples in the two best cities, none with the archive empty", () => {
    const before = GameInfo.Constructible_GreatWorks;
    GameInfo.Constructible_GreatWorks = slots;
    world.greatWorks = { 5: relics[0], 6: relics[1], 7: relics[2] };
    try {
        world.archive = [6, 7];
        fake.sent.length = 0;
        steps.pushVictoryWork("CULTURE");
        assert.deepEqual(temples(), [0, 1], "Novgorod and Samara, the best producers; not Kazan (two relics)");
        // One queued in Samara already: one more, in Novgorod.
        world.cities[1].queued = ["BUILDING_TEMPLE"];
        fake.sent.length = 0;
        steps.pushVictoryWork("CULTURE");
        assert.deepEqual(temples(), [0]);
        delete world.cities[1].queued;
        world.archive = [];
        fake.sent.length = 0;
        steps.pushVictoryWork("CULTURE");
        assert.deepEqual(temples(), [], "nothing waits");
    } finally {
        GameInfo.Constructible_GreatWorks = before;
        delete world.greatWorks;
        delete world.archive;
    }
});

test("M1: a town buys a Temple for the culture path while a relic waits", () => {
    const before = GameInfo.Constructible_GreatWorks;
    GameInfo.Constructible_GreatWorks = slots;
    world.greatWorks = { 5: relics[0], 6: relics[1] };
    world.canBuy = (type, id) => (type === "BUILDING_TEMPLE" && id.id === 3 ? { Success: true, Plots: [at(world.cities[3])], Cost: 200 } : { Success: false });
    try {
        world.archive = [6];
        assert.deepEqual(steps.victoryPurchases("CULTURE").map((i) => [i.city.id.id, i.def.ConstructibleType]), [[3, "BUILDING_TEMPLE"]]);
        world.archive = [];
        assert.deepEqual(steps.victoryPurchases("CULTURE"), []);
    } finally {
        GameInfo.Constructible_GreatWorks = before;
        delete world.greatWorks;
        delete world.archive;
        delete world.canBuy;
    }
});

test("M1: one relic waiting buys one Temple in a pass, not one in every settlement that can; none on top of one ordered", () => {
    // The first build listed a Temple row in every settlement and bought MAX_PURCHASES (3) of them for one relic.
    const before = GameInfo.Constructible_GreatWorks;
    GameInfo.Constructible_GreatWorks = slots;
    world.greatWorks = { 5: relics[0], 6: relics[1] };
    world.gold = 2000;
    const temple = C("BUILDING_TEMPLE");
    world.canBuy = (type, id, args) => (type === "BUILDING_TEMPLE" ? { Success: true, Plots: [at(world.cities[id.id])], Cost: 200 } : { Success: false });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args?.ConstructibleType === temple).map((s) => s.id.id);
    try {
        world.archive = [6];
        fake.sent.length = 0;
        steps.buyVictoryWork("CULTURE", 0);
        assert.deepEqual(bought(), [3], "one Temple, in the town (towns first)");
        // A Temple queued in Samara takes the relic: none bought elsewhere, the queued one may be.
        world.cities[1].queued = ["BUILDING_TEMPLE"];
        fake.sent.length = 0;
        steps.buyVictoryWork("CULTURE", 0);
        assert.deepEqual(bought(), [1], "Samara's queued Temple only");
        delete world.cities[1].queued;
        // Ordered this pass by the victory step: nothing bought on top of it, nor elsewhere.
        steps.beginQueuePass();
        fake.sent.length = 0;
        steps.pushVictoryWork("CULTURE");
        assert.deepEqual(temples(), [0], "Novgorod's Temple queued");
        fake.sent.length = 0;
        steps.buyVictoryWork("CULTURE", 0);
        assert.deepEqual(bought(), []);
        steps.endQueuePass();
        // Two relics: two Temples.
        world.archive = [6, 7];
        world.greatWorks[7] = relics[2];
        fake.sent.length = 0;
        steps.buyVictoryWork("CULTURE", 0);
        assert.deepEqual(bought(), [3, 0]);
    } finally {
        GameInfo.Constructible_GreatWorks = before;
        delete world.greatWorks;
        delete world.archive;
        delete world.canBuy;
        delete world.gold;
        delete world.cities[1].queued;
        steps.endQueuePass();
    }
});

test("M1: the savings goal holds gold for no more Temples than relics wait", () => {
    const before = GameInfo.Constructible_GreatWorks;
    GameInfo.Constructible_GreatWorks = slots;
    world.greatWorks = { 5: relics[0], 6: relics[1] };
    world.gold = 50;
    world.goldIncome = 20;
    // Every settlement short of gold for its Temple; Samara has one queued, which takes the one relic.
    world.canBuy = (type) => (type === "BUILDING_TEMPLE" ? { Success: false, InsufficientFunds: true, Plots: [], Cost: 200 } : { Success: false });
    world.costOf = (t) => (t === "BUILDING_TEMPLE" ? 200 : undefined);
    try {
        world.archive = [6];
        const goal = () => steps.goldPlan({ autopilot: {} }, { focus: "CULTURE", reserveTurns: 0, order: ["LEVER"] }).budget.goal;
        assert.equal(goal()?.kind, "LEVER", "a Temple is saved for while the relic waits");
        world.cities[1].queued = ["BUILDING_TEMPLE"];
        assert.equal(goal(), null, "Samara's queued Temple takes it");
    } finally {
        GameInfo.Constructible_GreatWorks = before;
        delete world.greatWorks;
        delete world.archive;
        delete world.canBuy;
        delete world.gold;
        delete world.goldIncome;
        delete world.costOf;
        delete world.cities[1].queued;
    }
});
