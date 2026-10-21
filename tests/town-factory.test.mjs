// Research/40 A6: the Modern Factory Town, counted on the town's own tiles (an improved factory resource) and offered when the
// game lists it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const TOWN = { x: 12, y: 10 };
const TEA = { x: 13, y: 10 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => (x === TEA.x && y === TEA.y ? { terrain: "TERRAIN_FLAT", resource: "RESOURCE_TEA" } : { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    structures: (x, y) => (x === TEA.x && y === TEA.y ? { district: "DISTRICT_RURAL", constructibles: ["IMPROVEMENT_PLANTATION"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 4, y: 10, name: "Capital", pop: 9, prod: 20 },
        { owner: 0, ...TOWN, name: "Assam", isTown: true, pop: 8, prod: 4, connected: [0] },
    ],
    focusProjects: () => ["PROJECT_TOWN_GRANARY", "PROJECT_TOWN_FACTORY"],
};
installFakeEngine(world, "modern");
const { runTownAdvisor } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("a town with an improved factory resource has the Factory Town option, offered by the game", () => {
    const focus = runTownAdvisor({ ...DEFAULT_SETTINGS, profile: "GOLD" }).rows.find((r) => r.town.name === "Assam").focus;
    const factory = focus.options.find((o) => o.key === "FACTORY");
    assert.ok(factory, JSON.stringify(focus.options));
    assert.equal(factory.count, 1);
    assert.equal(factory.availableNow, true);
});
