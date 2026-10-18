// The victory focus's levers (core/xpl-victory-levers.js): which research and buildings serve each
// path in each age, and the 40-yield bonus for Exploration science specialists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { highYieldBonus, highYieldTarget, innovationReach, leverBuildings, oneOffNext, pickVictoryResearch, researchToward, wantedResearch } from "../mod/expansion-planner/ui/core/xpl-victory-levers.js";

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

// The science victory's race (research/32 §3 and the review after it): Preparation 15 Innovation, a one-off 5.
const PREP = { key: "PREP", innovation: 15, turns: 10, cost: 1000 };
const SAT = { key: "SAT", innovation: 5, turns: 5, cost: 500 };

test("the race: the turn the Innovation still needed is reached, and the runs each city has done by then", () => {
    const cities = [{ id: "a", wait: 3, runs: [SAT], repeat: PREP }, { id: "b", wait: 0, runs: [], repeat: PREP }];
    const r = innovationReach(30, cities);
    // a: SAT at 8, PREP 18, 28; b: PREP 10, 20 -> 5 + 15 + 15 = 35 by 18.
    assert.equal(r.turn, 18);
    assert.deepEqual([r.done.get("a").map((x) => x.key), r.done.get("b").map((x) => x.key)], [["SAT", "PREP"], ["PREP"]]);
    assert.equal(innovationReach(0, cities).turn, 0, "nothing needed");
    assert.equal(innovationReach(200, cities, 40).turn, Infinity, "not within 40 turns");
});

test("a one-off goes ahead of Preparation only when it reaches the goal strictly sooner", () => {
    const race = (need, runs = []) => ({ need, maxTurns: 300, cities: [{ id: "a", wait: 0, runs, repeat: PREP }] });
    assert.equal(oneOffNext(race(5), "a", SAT).next, true, "5 to go: the satellite at 5, Preparation at 10");
    assert.equal(oneOffNext(race(15), "a", SAT).next, false, "15 to go: one Preparation run");
    assert.equal(oneOffNext(race(20), "a", SAT).next, false, "20 to go: both orders reach it at 15, so Preparation first");
    const half = { ...PREP, turns: 4, cost: 400 };
    assert.equal(oneOffNext(race(5, [half]), "a", SAT, 1).next, false, "a run under way stays first and makes it at 4");
});
