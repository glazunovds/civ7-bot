// "All my settlements": one plan for every city, one click places every tack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const centres = [[6, 6], [14, 6], [22, 6], [6, 14], [14, 14], [22, 14]];
const near = (x, y) => centres.some(([cx, cy]) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1);
installFakeEngine({
    width: 30, height: 22, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: near(x, y) ? 0 : -1 }),
    structures: (x, y) => (centres.some(([cx, cy]) => cx === x && cy === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: centres.map(([x, y], i) => ({ owner: 0, x, y, name: `City${i}`, pop: 5, prod: 10 })),
});
const dmt = installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
const { allTarget, resolveTarget, listTargets, startBuildingPlan, placePlanTacks } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

const selected = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_BARRACKS", "BUILDING_ALTAR", "BUILDING_GRANARY"];

test("one plan covers all six cities and one call tacks them all", async () => {
    const all = allTarget(listTargets());
    assert.equal(all.count, 6);
    assert.equal(resolveTarget("all").key, "all");
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected, timeAware: true } };
    const started = Date.now();
    await startBuildingPlan(all, settings).promise;
    const ms = Date.now() - started;
    const plans = state.get().results.plans;
    assert.equal(plans.targetKey, "all");
    assert.equal(plans.members.length, 6);
    const perCity = new Map();
    for (const p of plans.placements) perCity.set(p.settlementName, (perCity.get(p.settlementName) ?? 0) + 1);
    assert.equal(perCity.size, 6, JSON.stringify([...perCity]));
    for (const n of perCity.values()) assert.ok(n >= 4, `each city gets its buildings (${n})`);
    assert.ok(ms < 10000, `planned in ${ms} ms`);

    const r = await placePlanTacks(plans);
    assert.equal(r.skipped.length, 0, JSON.stringify(r.skipped.slice(0, 3)));
    assert.equal(r.placed.length, plans.placements.length + plans.fillers.length);
    let tacks = 0;
    for (const { mapTackList } of bridge.readAllTacks()) tacks += mapTackList.length;
    assert.equal(tacks, r.placed.length);

    // The autopilot's tacks: each settlement's next 3 planned buildings, the rest removed.
    const few = await placePlanTacks(plans, { perSettlement: 3 });
    tacks = 0;
    for (const { mapTackList } of bridge.readAllTacks()) tacks += mapTackList.length;
    assert.equal(tacks, 6 * 3, JSON.stringify({ placed: few.placed.length, removed: few.removed }));
    assert.ok(few.removed > 0 && few.kept > 0, "unchanged tacks stay, extra ones go");
    void dmt;
});
