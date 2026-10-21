// Research/40 B5: our civilization's unique improvements (the Khmer Baray: +3 Food, +1 more per floodplain) were never queued:
// the building plan holds buildings only. A city with none queued gets the one that pays back soonest, on a tile the game
// offers and the plan leaves free.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ANGKOR = { x: 6, y: 6 };
const world = {
    width: 16, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, ...ANGKOR, name: "Angkor", prod: 10, queue: { type: "BUILDING_GRANARY", turns: 3 } }],
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const queued = () => fake.sent.filter((s) => s.kind === "operation" && GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleType === "IMPROVEMENT_BARAY").map((s) => [s.args.X, s.args.Y]);

test("a unique improvement that pays back soon is queued on a tile the plan leaves free; not another civilization's, not a slow one", () => {
    const me = Players.get(0);
    const before = { civ: me.civilizationType, traits: GameInfo.CivilizationTraits };
    GameInfo.Improvements = [{ ConstructibleType: "IMPROVEMENT_BARAY", TraitType: "TRAIT_KHMER" }];
    world.canBuild = (type) => (type === "IMPROVEMENT_BARAY" ? { Success: true, Plots: [idx(7, 6), idx(5, 6)] } : { Success: true, Plots: [] });
    world.costOf = (type) => (type === "IMPROVEMENT_BARAY" ? 40 : 100);
    // The plan keeps 7,6 for a building.
    state.set({ results: { ...state.get().results, plans: { placements: [{ type: "BUILDING_LIBRARY", sid: "c:6-6", x: 7, y: 6 }] } } });
    try {
        fake.sent.length = 0;
        assert.deepEqual(steps.queueUniqueImprovements(DEFAULT_SETTINGS), [], "not Khmer");
        me.civilizationType = GameInfo.Civilizations.lookup("CIVILIZATION_KHMER").$hash;
        GameInfo.CivilizationTraits = [{ CivilizationType: "CIVILIZATION_KHMER", TraitType: "TRAIT_KHMER" }];
        fake.sent.length = 0;
        const out = steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), [[5, 6]], JSON.stringify(out));
        assert.equal(out[0].key, "QUEUED_UNIQUE_IMPROVEMENT");
        world.costOf = (type) => (type === "IMPROVEMENT_BARAY" ? 200 : 100); // 3 Food a turn: 67 turns to pay back
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), []);
    } finally {
        me.civilizationType = before.civ;
        GameInfo.CivilizationTraits = before.traits;
        delete GameInfo.Improvements;
        delete world.canBuild;
        delete world.costOf;
        state.set({ results: { ...state.get().results, plans: null } });
    }
});

// Games 42-43: Pairidaezas and Stepwells may not stand next to their own kind (Improvements.SameAdjacentValid false), yet the
// game offered those tiles and cancelled the orders later (NOTIFICATION_PRODUCTION_INVALIDATED): one tile of Парса was ordered
// seven times, one of Васет five. And a Pairidaeza queued on a wonder's tile spoiled the wonder (one order per tile).
test("a unique improvement keeps off a wonder's tile, off tiles next to its own kind when it may not stand there, and off a tile whose order the game cancelled", () => {
    const me = Players.get(0);
    const before = { civ: me.civilizationType, traits: GameInfo.CivilizationTraits };
    const angkor = world.cities[0];
    me.civilizationType = GameInfo.Civilizations.lookup("CIVILIZATION_KHMER").$hash;
    GameInfo.CivilizationTraits = [{ CivilizationType: "CIVILIZATION_KHMER", TraitType: "TRAIT_KHMER" }];
    GameInfo.Improvements = [{ ConstructibleType: "IMPROVEMENT_BARAY", TraitType: "TRAIT_KHMER", SameAdjacentValid: false }];
    world.canBuild = (type) => (type === "IMPROVEMENT_BARAY" ? { Success: true, Plots: [idx(7, 6), idx(5, 6)] } : { Success: true, Plots: [] });
    world.costOf = (type) => (type === "IMPROVEMENT_BARAY" ? 40 : 100);
    const turn = Game.turn;
    try {
        steps.resetUniqueImprovements();
        steps.resetWonderOrders();
        // A wonder of ours queued on 5,6: only 7,6.
        angkor.queued = [{ type: "WONDER_PYRAMIDS", x: 5, y: 6 }];
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), [[7, 6]]);
        // A Baray standing next to 7,6 (on 7,5): not there either, nothing left.
        world.structures = (x, y) => (x === 7 && y === 5 ? { district: null, constructibles: ["IMPROVEMENT_BARAY"] } : { district: null, constructibles: [] });
        steps.resetWonderOrders();
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), []);
        // One that may stand next to its own kind does.
        GameInfo.Improvements = [{ ConstructibleType: "IMPROVEMENT_BARAY", TraitType: "TRAIT_KHMER" }];
        steps.resetUniqueImprovements();
        steps.resetWonderOrders();
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), [[7, 6]]);
        // That order left the queue unbuilt (the game cancelled it): 7,6 is off for UQI_RETRY_TURNS.
        delete world.structures;
        Game.turn = turn + 1;
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), [], "7,6 off; 5,6 has the wonder");
        Game.turn = turn + 1 + steps.UQI_RETRY_TURNS;
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), [[7, 6]], "tried again later");
        // One a settlement (Kabaka's Lake: OnePerSettlement): none while the city has one.
        GameInfo.Improvements = [{ ConstructibleType: "IMPROVEMENT_BARAY", TraitType: "TRAIT_KHMER", OnePerSettlement: true }];
        world.structures = (x, y) => (x === 6 && y === 7 ? { district: null, constructibles: ["IMPROVEMENT_BARAY"] } : { district: null, constructibles: [] });
        steps.resetUniqueImprovements();
        Game.turn = turn + 40;
        fake.sent.length = 0;
        steps.queueUniqueImprovements(DEFAULT_SETTINGS);
        assert.deepEqual(queued(), []);
    } finally {
        Game.turn = turn;
        me.civilizationType = before.civ;
        GameInfo.CivilizationTraits = before.traits;
        delete GameInfo.Improvements;
        delete world.canBuild;
        delete world.costOf;
        delete world.structures;
        delete angkor.queued;
        steps.resetUniqueImprovements();
        steps.resetWonderOrders();
    }
});
