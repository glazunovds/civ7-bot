// Game 60 (research/game60 mechanics M12): merchants were trained only for the economic focus, and the culture focus had one
// trade route all Antiquity (from Code of Laws' free merchant, 3.3 a turn). With any focus one merchant is trained while an
// open route pays for it over the age's turns left and our settlements have free resource slots for its imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 24, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: 4, y: 5, name: "Tula", prod: 12, resourceCap: 3, queue: { type: "BUILDING_GRANARY", turns: 3 } },
        { owner: 1, x: 18, y: 5, name: "Mesa Verde" },
    ],
    canBuild: (type) => ({ Success: type === "UNIT_MERCHANT" }),
    costOf: (type) => (type === "UNIT_MERCHANT" ? 40 : undefined),
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

const merchants = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === GameInfo.Units.lookup("UNIT_MERCHANT").$hash).length;
// A route the game projects: its exports (3 Gold, 1 Culture a turn) and one import.
const route = (gold = 3, cultureYield = 1) => [{ targetCityId: { owner: 1, id: 0 }, status: [TradeRouteStatus.SUCCESS], importPayloads: [{}], exportYields: [{ yieldType: "YIELD_GOLD", amount: gold }, { yieldType: "YIELD_CULTURE", amount: cultureYield }] }];
const culture = { merchants: true, victory: "CULTURE", profile: "CULTURE" };
const run = (options = culture) => {
    fake.sent.length = 0;
    return steps.fillProduction(new Map(), options);
};

test("M12: the culture focus trains one merchant while an open route pays for it and resource slots are free", () => {
    world.tradeRoutes = route();
    try {
        const out = run();
        assert.equal(merchants(), 1, JSON.stringify(out));
        assert.ok(out.some((e) => e.key === "QUEUED_MERCHANT"));
        // One of ours already: no second (the economic focus keeps up to 2).
        world.units = [{ id: 7, type: "UNIT_MERCHANT", x: 4, y: 5 }];
        run();
        assert.equal(merchants(), 0);
        world.units = [];
        // No free resource slots for the imports.
        world.cities[0].resourceCap = 1;
        run();
        assert.equal(merchants(), 0, "one free slot only");
        world.cities[0].resourceCap = 3;
        // A route worth too little over the age's turns left.
        world.tradeRoutes = route(0.1, 0);
        run();
        assert.equal(merchants(), 0, "0.1 Gold a turn would not pay twice its 40");
        // No route open.
        world.tradeRoutes = [];
        run();
        assert.equal(merchants(), 0);
        // Without the merchants option, never.
        world.tradeRoutes = route();
        run({ ...culture, merchants: false });
        assert.equal(merchants(), 0);
    } finally {
        delete world.tradeRoutes;
        delete world.agePoints;
        world.units = [];
        world.cities[0].resourceCap = 3;
    }
});

test("M12: with our merchant out, a pass projects no trade routes for the want (every settlement's routes and slots)", () => {
    // The first build ran the payback (Players.Trade.projectPossibleTradeRoutes) on every full pass, a merchant out or not.
    let projected = 0;
    const routes = route();
    Object.defineProperty(world, "tradeRoutes", { configurable: true, get: () => (projected++, routes) });
    try {
        world.units = [{ id: 7, type: "UNIT_MERCHANT", x: 4, y: 5 }];
        run();
        assert.equal(merchants(), 0);
        assert.equal(projected, 0);
        world.units = [];
        run();
        assert.equal(merchants(), 1, "none out: the payback is asked");
        assert.ok(projected > 0);
    } finally {
        delete world.tradeRoutes;
        world.units = [];
    }
});
