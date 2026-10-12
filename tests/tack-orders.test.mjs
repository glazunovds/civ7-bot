// "Build / buy at my tack" from the production menu: tile choice and the exact request sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const C = { x: 8, y: 8 };
const fake = installFakeEngine({
    width: 20, height: 16, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 6, prod: 12 }],
    // The game allows the Library on two tiles; with X/Y it checks that exact tile.
    canBuild: (type, _id, args) => {
        const plots = type === "BUILDING_LIBRARY" ? [fake.grid.index(9, 8), fake.grid.index(7, 8)] : [];
        if (args.X != null) return { Success: plots.includes(fake.grid.index(args.X, args.Y)) };
        return { Success: plots.length > 0, Plots: plots };
    },
    canBuy: (type, _id, args) => {
        const plots = type === "BUILDING_LIBRARY" ? [fake.grid.index(9, 8)] : [];
        if (args.X != null) return { Success: plots.includes(fake.grid.index(args.X, args.Y)) };
        return { Success: plots.length > 0, Plots: plots };
    },
});
const dmt = installFakeDmt();
const { findTackSpot, orderAtTack, tacksByType } = await import("../mod/expansion-planner/ui/data/xpl-tack-orders.js");

const city = Players.get(0).Cities.getCities()[0];
const lib = GameInfo.Constructibles.lookup("BUILDING_LIBRARY");
const market = GameInfo.Constructibles.lookup("BUILDING_MARKET");

dmt.add(12, 12, "BUILDING_LIBRARY"); // a tack the city cannot use
dmt.add(9, 8, "BUILDING_LIBRARY");
dmt.add(12, 12, "BUILDING_MARKET");

test("finds the tack on a tile the city may use, with build and buy", () => {
    const tacks = tacksByType();
    const spot = findTackSpot(city, lib, tacks.get("BUILDING_LIBRARY"));
    assert.deepEqual({ x: spot.x, y: spot.y, build: spot.build, buy: spot.buy, cost: spot.cost }, { x: 9, y: 8, build: true, buy: true, cost: 250 });
    assert.equal(findTackSpot(city, market, tacks.get("BUILDING_MARKET")), null);
});

test("sends the placement-mode request (type hash + tack X/Y)", () => {
    const spot = findTackSpot(city, lib, tacksByType().get("BUILDING_LIBRARY"));
    assert.equal(orderAtTack(city.id, lib, spot, false), true);
    assert.equal(orderAtTack(city.id, lib, spot, true), true);
    assert.deepEqual(fake.sent.map((s) => s.kind), ["operation", "command"]);
    for (const s of fake.sent) assert.deepEqual(s.args, { ConstructibleType: lib.$hash, X: 9, Y: 8 });
    // A tile the game refuses is never sent.
    assert.equal(orderAtTack(city.id, lib, { x: 12, y: 12 }, false), false);
    assert.equal(fake.sent.length, 2);
});
