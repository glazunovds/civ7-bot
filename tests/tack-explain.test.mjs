// Production menu: when a tack cannot be used yet, say why (instead of showing nothing).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const C = { x: 8, y: 8 };
const fake = installFakeEngine({
    width: 20, height: 16, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 6, prod: 12 }],
    // The city owns its ring 1 and (9,10); only (9,8) is buildable now.
    owningCity: (x, y) => (fake.grid.distanceXY(x, y, C.x, C.y) <= 1 || (x === 9 && y === 10) ? { owner: 0, id: 0 } : null),
    canBuild: (type, _id, args) => {
        if (type !== "BUILDING_LIBRARY") return { Success: false };
        const plots = [fake.grid.index(9, 8)];
        if (args.X != null) {
            const ok = plots.includes(fake.grid.index(args.X, args.Y));
            return ok ? { Success: true } : { Success: false, FailureReasons: ["LOC_TEST_NEEDS_URBAN_NEIGHBOUR"] };
        }
        return { Success: true, Plots: plots };
    },
});
const dmt = installFakeDmt();
const { candidateTacks, explainTack, findTackSpot, tacksByType } = await import("../mod/expansion-planner/ui/data/xpl-tack-orders.js");
const city = Players.get(0).Cities.getCities()[0];
const lib = GameInfo.Constructibles.lookup("BUILDING_LIBRARY");
const market = GameInfo.Constructibles.lookup("BUILDING_MARKET");

test("a tack on a tile the city does not own yet", () => {
    dmt.add(10, 11, "BUILDING_LIBRARY");
    const c = candidateTacks(lib, tacksByType());
    assert.equal(findTackSpot(city, lib, c), null);
    const why = explainTack(city, lib, c);
    assert.equal(why.reason, "NOT_OWNED");
    assert.deepEqual([why.x, why.y], [10, 11]);
});

test("an owned tile the game refuses for now, with the game's own reason", () => {
    dmt.add(9, 10, "BUILDING_LIBRARY"); // owned, closer than (10,11)
    const why = explainTack(city, lib, candidateTacks(lib, tacksByType()));
    assert.equal(why.reason, "NOT_YET");
    assert.deepEqual([why.x, why.y], [9, 10]);
    assert.equal(why.detail, "LOC_TEST_NEEDS_URBAN_NEIGHBOUR");
});

test("no pin for tacks far from this city, or buildings it cannot build now", () => {
    dmt.add(18, 2, "BUILDING_MARKET");
    assert.equal(explainTack(city, market, candidateTacks(market, tacksByType())), null);
    dmt.add(9, 7, "BUILDING_MARKET"); // near, but the Market is not buildable here now
    assert.equal(explainTack(city, market, candidateTacks(market, tacksByType())), null);
});
