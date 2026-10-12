// Navigable rivers end to end (map facts -> plan): the game does not call them water,
// but ordinary buildings cannot stand on them (Detailed Map Tacks flags them too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
const isRiver = (x, y) => x >= 11 || (y === 7 && x >= 9) || (x === 9 && y === 8);
const fake = installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => {
        const owned = Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2;
        if (!(x === C.x && y === C.y) && isRiver(x, y)) return { terrain: "TERRAIN_NAVIGABLE_RIVER", yields: { YIELD_FOOD: 1, YIELD_GOLD: 1 }, owner: owned ? 0 : -1, river: true };
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: owned ? 0 : -1 };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
});
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const WATER_OK = new Set(["BUILDING_FISHING_QUAY", "BUILDING_HARBOR", "BUILDING_ANCIENT_BRIDGE"]);

test("no ordinary building is planned on a navigable river tile", async () => {
    const selected = ["BUILDING_MONUMENT", "BUILDING_MARKET", "BUILDING_LIBRARY", "BUILDING_BATH", "BUILDING_BARRACKS", "BUILDING_GRANARY", "BUILDING_SAW_PIT", "BUILDING_BRICKYARD", "BUILDING_FISHING_QUAY"];
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected } };
    await startBuildingPlan(listTargets()[0], settings).promise;
    const plans = state.get().results.plans;
    const all = [...plans.placements, ...plans.fillers];
    assert.ok(all.length >= 3, JSON.stringify(plans.unplaced));
    for (const p of all) {
        const onRiver = isRiver(fake.grid.x(p.idx), fake.grid.y(p.idx)) && p.idx !== fake.grid.index(C.x, C.y);
        if (onRiver) assert.ok(WATER_OK.has(p.type), `${p.type} planned on a navigable river at ${p.x},${p.y}`);
    }
});
