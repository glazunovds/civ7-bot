// The victory focus's levers (core/xpl-victory-levers.js): which research and buildings serve each
// path in each age, and the 40-yield bonus for Exploration science specialists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { highYieldBonus, highYieldTarget, leverBuildings, pickVictoryResearch, researchToward, wantedResearch } from "../mod/expansion-planner/ui/core/xpl-victory-levers.js";

test("research: the quickest of the candidates whose next research unlocks the path's work", () => {
    const c = [
        { node: 1, nodeType: "NODE_A", targets: ["BUILDING_BRICKYARD"], turns: 2 },
        { node: 2, nodeType: "NODE_B", targets: ["MOD_AQ_CODEX"], turns: 6 },
        { node: 3, nodeType: "NODE_C", targets: ["BUILDING_LIBRARY"], turns: 4 },
    ];
    assert.equal(pickVictoryResearch("SCIENCE", c).node, 3, "Library (4 turns) before the codex (6)");
    assert.equal(pickVictoryResearch("ECONOMIC", c), null);
    assert.equal(pickVictoryResearch(null, c), null);
    assert.ok(wantedResearch("ECONOMIC", { nodeType: "NODE_TECH_EX_SHIPBUILDING", targets: [] }), "Shipbuilding: the Distant Lands");
    assert.ok(wantedResearch("ECONOMIC", { targets: ["MOD_MO_FACTORY_RESOURCE_GDP"] }), "Mass Production: factory resources count");
    assert.ok(wantedResearch("SCIENCE", { targets: ["MOD_AQ_MATHEMATICS_CODEX"] }));
    assert.ok(!wantedResearch("CULTURE", { targets: ["MOD_AQ_CODEX"] }));
});

test("toward the path: the goal with the fewest unresearched nodes before it, then the quickest step (Shipbuilding: Feudalism and Heraldry first)", () => {
    const pre = { SHIP: ["FEUD", "HERA"], FEUD: ["CART", "ASTR"], HERA: ["ASTR", "MACH"], ROCKET: ["A", "B"], B: ["C"] };
    const done = new Set(["CART", "ASTR", "MACH"]);
    const available = [{ nodeType: "FEUD", turns: 4 }, { nodeType: "HERA", turns: 8 }, { nodeType: "C", turns: 1 }, { nodeType: "OTHER", turns: 1 }];
    let r = researchToward(["SHIP", "ROCKET"], available, (t) => pre[t], (t) => done.has(t));
    assert.deepEqual([r.goal, r.via.nodeType, r.steps], ["SHIP", "FEUD", 2], "Shipbuilding is 2 away, Rocketry 3; Feudalism is quicker");
    r = researchToward(["ROCKET"], available, (t) => pre[t], (t) => done.has(t));
    assert.equal(r.via.nodeType, "C");
    assert.equal(researchToward(["SHIP"], [{ nodeType: "OTHER", turns: 1 }], (t) => pre[t], (t) => done.has(t)), null, "nothing on the way available");
});

test("buildings by path and age", () => {
    assert.deepEqual(leverBuildings("SCIENCE", "AGE_ANTIQUITY"), ["BUILDING_LIBRARY", "BUILDING_ACADEMY"]);
    assert.deepEqual(leverBuildings("ECONOMIC", "AGE_MODERN"), ["BUILDING_RAIL_STATION", "BUILDING_PORT", "BUILDING_FACTORY", "BUILDING_STOCK_EXCHANGE"]);
    assert.deepEqual(leverBuildings("CULTURE", "AGE_ANTIQUITY"), []);
    assert.deepEqual(leverBuildings("ECONOMIC", null), []);
});

test("40-yield bonus: full when a specialist reaches it, else the share of the way; nothing past it", () => {
    assert.equal(highYieldBonus(36, 5, 40, 10), 10);
    assert.equal(highYieldBonus(20, 5, 40, 10), 2.5);
    assert.equal(highYieldBonus(40, 5, 40, 10), 0, "already counts");
    assert.equal(highYieldBonus(30, 0, 40, 10), 0);
    assert.equal(highYieldBonus(30, 5, 0, 10), 0, "no threshold this age");
    // The age's next mark: Exploration 40 (the path) until 5 urban tiles reach it, then 75 (the triumph).
    assert.equal(highYieldTarget("AGE_EXPLORATION", [41, 40, 50, 12, 39]), 40, "4 at 40");
    assert.equal(highYieldTarget("AGE_EXPLORATION", [41, 40, 50, 12, 45, 60]), 75);
    assert.equal(highYieldTarget("AGE_EXPLORATION", [75, 80, 90, 100, 76]), 0, "both done");
    assert.equal(highYieldTarget("AGE_MODERN", []), 120);
    assert.equal(highYieldTarget("AGE_UNKNOWN", []), 0);
});
