// Region + timing building plan end to end on the fake engine (real antiquity rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };
const B = { x: 14, y: 8 };
const fake = installFakeEngine({
    width: 26, height: 18, wrapX: false,
    tiles: (x, y) => {
        if (x === 11 && y === 6) return { terrain: "TERRAIN_MOUNTAIN", yields: { YIELD_PRODUCTION: 1 } };
        const ownA = Math.max(Math.abs(x - A.x), Math.abs(y - A.y)) <= 1;
        const ownB = Math.max(Math.abs(x - B.x), Math.abs(y - B.y)) <= 1;
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: ownA || ownB ? 0 : -1 };
    },
    structures: (x, y) => {
        if (x === A.x && y === A.y) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] };
        if (x === B.x && y === B.y) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_CITY_HALL"] };
        return { district: null, constructibles: [] };
    },
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: A.x, y: A.y, name: "Athens", pop: 6, prod: 12 }, { owner: 0, x: B.x, y: B.y, name: "Sparta", pop: 3, prod: 6 }],
    agePoints: 20,
});
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("region plan covers both cities, with a build order per city", async () => {
    const targets = listTargets();
    const athens = targets.find((t) => t.name === "Athens");
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, region: true, timeAware: true, selected: ["BUILDING_LIBRARY", "BUILDING_MONUMENT", "BUILDING_MARKET"] } };
    await startBuildingPlan(athens, settings).promise;
    const plans = state.get().results.plans;
    assert.equal(plans.members.length, 2);
    assert.ok(plans.timeAware && plans.horizon > 0);
    const bySid = new Map();
    for (const p of plans.placements) {
        if (!bySid.has(p.sid)) bySid.set(p.sid, []);
        bySid.get(p.sid).push(p);
    }
    assert.equal(bySid.size, 2, "both cities get buildings");
    for (const list of bySid.values()) {
        const etas = list.map((p) => p.eta);
        assert.deepEqual(etas, [...etas].sort((a, b) => a - b), "build order per city");
        assert.equal(new Set(list.map((p) => p.type)).size, list.length, "one of each per city");
    }
    // Sparta has half Athens' production: its first building finishes later.
    const first = (name) => Math.min(...plans.placements.filter((p) => p.settlementName === name).map((p) => p.eta));
    assert.equal(first("Athens"), 8);  // 100 production / 12 per turn
    assert.equal(first("Sparta"), 17); // 100 / 6
    for (const p of plans.placements) assert.ok(p.settlementName);
    void fake;
});
