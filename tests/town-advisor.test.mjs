import { test } from "node:test";
import assert from "node:assert/strict";
import { adviseTown, compareAdvice, estimateAgeTurnsLeft } from "../mod/expansion-planner/ui/core/xpl-town-advisor.js";

const ctx = {
    age: "AGE_ANTIQUITY", numCities: 1, cityLimit: 4, numTowns: 4, sumCityProduction: 20, prodToGold: 2.5,
    agePoints: 30, ageMax: 100, isFinalAge: false, ageTurnsLeft: 80, expectKeepCities: false,
};
const town = { name: "T", pop: 8, prodNow: 14, prodPot: 22, cost: 200, canConvert: true, failureReasons: [], hasFocus: false, focusValue: 0, foodSurplus: 3, costFallsWithPop: false };

test("productive town early in the age: convert", () => {
    const a = adviseTown(town, ctx);
    assert.equal(a.verdict, "CONVERT");
    assert.ok(a.gainPerTurn > 0);
    assert.ok(a.reasons.some((r) => r.key === "LOC_XPL_TOWN_R_REVERTS"));
});

test("city limit or engine refusal blocks", () => {
    assert.equal(adviseTown(town, { ...ctx, numCities: 4 }).verdict, "BLOCKED");
    const a = adviseTown({ ...town, canConvert: false, failureReasons: ["Not enough gold"] }, ctx);
    assert.equal(a.verdict, "BLOCKED");
    assert.deepEqual(a.reasons[0].args, ["Not enough gold"]);
});

test("low production potential: keep as town, flag food feeders", () => {
    const a = adviseTown({ ...town, prodPot: 8, foodSurplus: 7 }, ctx);
    assert.equal(a.verdict, "KEEP");
    assert.ok(a.reasons.some((r) => r.key === "LOC_XPL_TOWN_R_FEEDER"));
});

test("late in the age: keep (it would revert at the transition)", () => {
    assert.equal(adviseTown(town, { ...ctx, agePoints: 85 }).verdict, "KEEP");
    assert.equal(adviseTown(town, { ...ctx, agePoints: 85, isFinalAge: true }).verdict, "CONVERT");
});

test("not enough production yet: wait", () => {
    assert.equal(adviseTown({ ...town, prodNow: 4 }, ctx).verdict, "WAIT");
});

test("slow payback: consider", () => {
    const a = adviseTown({ ...town, cost: 2000 }, ctx);
    assert.equal(a.verdict, "CONSIDER");
});

test("ordering: verdict first, then value", () => {
    const rows = [
        { advice: { verdict: "KEEP", value: 900 } },
        { advice: { verdict: "CONVERT", value: 10 } },
        { advice: { verdict: "CONVERT", value: 50 } },
    ];
    rows.sort(compareAdvice);
    assert.deepEqual(rows.map((r) => `${r.advice.verdict}${r.advice.value}`), ["CONVERT50", "CONVERT10", "KEEP900"]);
});

test("age turns left from samples, with a fallback", () => {
    assert.equal(estimateAgeTurnsLeft([{ turn: 10, points: 10 }, { turn: 20, points: 20 }], 20, 100), 80);
    assert.equal(estimateAgeTurnsLeft([], 50, 100, 120), 60);
});
