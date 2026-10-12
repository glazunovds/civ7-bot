// Town advisor end to end on the fake engine (real antiquity rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

installFakeEngine({
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: x % 5 === 0 ? "TERRAIN_HILL" : "TERRAIN_FLAT", yields: x % 5 === 0 ? { YIELD_PRODUCTION: 2 } : { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 5, y: 10, name: "Capital", pop: 9, prod: 20 },
        { owner: 0, x: 12, y: 10, name: "Forge", isTown: true, pop: 8, prod: 14, cost: 200 },
        { owner: 0, x: 20, y: 10, name: "Fields", isTown: true, pop: 4, prod: 2, food: 8, cost: 400 },
    ],
    cityLimit: 3,
});
const { runTownAdvisor } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("advisor ranks the productive town above the farming town", () => {
    const towns = runTownAdvisor(DEFAULT_SETTINGS);
    assert.equal(towns.rows.length, 2);
    assert.equal(towns.rows[0].town.name, "Forge");
    assert.equal(towns.rows[0].advice.verdict, "CONVERT");
    assert.equal(towns.rows[1].advice.verdict, "KEEP");
    assert.equal(towns.ctx.prodToGold, 2.5);
    assert.ok(towns.ctx.ageTurnsLeft > 0);
});
