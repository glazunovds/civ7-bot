// Renewing the plan's building tacks: ours are replaced, the player's stay, and a tack
// whose building is already in the city's queue is kept where it is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
const city = { owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 };
const fake = installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [city],
});
const dmt = installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
const { listTargets, startBuildingPlan, placePlanTacks, hasPlanTacks } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET"], timeAware: false } };
async function plan() {
    await startBuildingPlan(listTargets()[0], settings).promise;
    return state.get().results.plans;
}
const typesAt = (x, y) => dmt.read(x, y).map((t) => t.type);

test("renewing replaces our tacks, keeps the player's and the queued one", async () => {
    let plans = await plan();
    assert.equal(hasPlanTacks(plans), false); // nothing placed yet: auto-refresh would not start
    await placePlanTacks(plans);
    assert.equal(hasPlanTacks(plans), true);
    const lib = plans.placements.find((p) => p.type === "BUILDING_LIBRARY");
    assert.deepEqual(typesAt(lib.x, lib.y).filter((t) => t === "BUILDING_LIBRARY"), ["BUILDING_LIBRARY"]);

    // The player queues the Library (on our tack) and puts their own Market tack somewhere.
    city.queue = { type: "BUILDING_LIBRARY", turns: 5, pct: 10 };
    const own = fake.grid.neighbours(fake.grid.index(C.x, C.y)).map((i) => ({ x: fake.grid.x(i), y: fake.grid.y(i) })).find((p) => !(p.x === lib.x && p.y === lib.y));
    dmt.add(own.x, own.y, "BUILDING_MARKET");

    plans = await plan();
    assert.ok(plans.keptTacks.includes(`${lib.x}-${lib.y}-BUILDING_LIBRARY`), JSON.stringify(plans.keptTacks));
    assert.ok(!plans.placements.some((p) => p.type === "BUILDING_LIBRARY"), "queued Library is not planned again");
    assert.ok(!plans.placements.some((p) => p.type === "BUILDING_MARKET"), "the player's Market tack is respected");
    await placePlanTacks(plans);
    assert.ok(typesAt(lib.x, lib.y).includes("BUILDING_LIBRARY"), "queued Library tack stays");
    assert.ok(typesAt(own.x, own.y).includes("BUILDING_MARKET"), "player's tack stays");
    const mon = plans.placements.find((p) => p.type === "BUILDING_MONUMENT");
    assert.ok(typesAt(mon.x, mon.y).includes("BUILDING_MONUMENT"));
    // Exactly one Monument tack in the whole area (the old one, if it moved, is gone).
    let monuments = 0;
    for (const { mapTackList } of bridge.readAllTacks()) monuments += mapTackList.filter((t) => t.type === "BUILDING_MONUMENT").length;
    assert.equal(monuments, 1);
});
