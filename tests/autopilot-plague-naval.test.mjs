// Game 60 (research/game60, the plague review): Астрахань was shelled by ships and infected at once (T133-T138). A warship
// bought there would appear on the plague: it comes from a clean city of ours on the same water.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

// The naval test's map: the sea at x >= 20; Coast a town on it, Port a city on it 6 tiles south.
const COAST = { x: 19, y: 8 };
const PORT = { x: 19, y: 14 };
const world = {
    width: 34, height: 22, wrapX: false,
    tiles: (x) => ({ terrain: x >= 20 ? "TERRAIN_COAST" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    areaId: (x) => (x >= 20 ? 1 : 0),
    players: [{ id: 0 }, { id: 1, name: "Rome" }],
    cities: [
        { owner: 0, ...COAST, name: "Coast", isTown: true, pop: 3 },
        { owner: 0, ...PORT, name: "Port", pop: 6, prod: 40 },
    ],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world, "modern");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const boughtShips = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [GameInfo.Units.lookup(s.args.UnitType)?.UnitType, Cities.get(s.id)?.name]);

test("a warship for a shelled settlement that is infected comes from a clean city of ours on the same water", () => {
    const threat = { settlement: { ...COAST, name: "Coast" }, count: 1, land: 0, ships: 1, damaged: true, owners: [] };
    // Every city sells Frigates; the shelled town itself, on the water, sails none and would come first.
    world.canBuy = (type) => (type === "UNIT_FRIGATE" ? { Success: true, Cost: 300 } : { Success: false });
    const reset = () => {
        units.resetUnitGoals();
        steps.resetWar();
        fake.sent.length = 0;
        world.units = [];
        Game.turn = 20;
    };
    try {
        reset();
        steps.buyDefenders([threat], { budget: createBudget({ gold: 500 }) });
        assert.deepEqual(boughtShips(), [["UNIT_FRIGATE", "Coast"]], "clean: the town itself");
        reset();
        world.cities[0].infected = true;
        const out = steps.buyDefenders([threat], { budget: createBudget({ gold: 500 }) });
        assert.deepEqual(boughtShips(), [["UNIT_FRIGATE", "Port"]], JSON.stringify(out));
    } finally {
        delete world.canBuy;
        delete world.cities[0].infected;
    }
});
