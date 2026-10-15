// What Policy Yield Previews cannot value (pure): production toward projects or buildings,
// lump grants, mastery speed, cheaper purchases, as yields per turn; and the government ranking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectYields, focusOfProfile, LUMP_TURNS, rankGovernments } from "../mod/expansion-planner/ui/core/xpl-effect-value.js";

const near = (a, b) => Math.abs(a - b) < 1e-9;

test("production toward projects: a science game in the Modern age counts it most (Crewed Space Flight Preparation); a named project that earns no Innovation counts nothing", () => {
    const pw = [{ effect: "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION", args: { Percent: "30" } }];
    const modern = effectYields(pw, { focus: "SCIENCE", age: "AGE_MODERN", production: 100 }).YIELD_PRODUCTION;
    const early = effectYields(pw, { focus: "SCIENCE", age: "AGE_ANTIQUITY", production: 100 }).YIELD_PRODUCTION;
    const economy = effectYields(pw, { focus: "ECONOMIC", age: "AGE_MODERN", production: 100 }).YIELD_PRODUCTION;
    assert.ok(near(modern, 30) && near(early, 4.5) && near(economy, 1.5), JSON.stringify([modern, early, economy]));
    assert.deepEqual(effectYields([{ effect: "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION", args: { Percent: "50", ProjectType: "PROJECT_CONVERT_TOWN_TO_CITY" } }], { focus: "SCIENCE", age: "AGE_MODERN", production: 100 }), {});
    const named = effectYields([{ effect: "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION", args: { Percent: "10", ProjectType: "PROJECT_CREWED_SPACE_FLIGHT_PREP" } }], { focus: "SCIENCE", age: "AGE_MODERN", production: 100 });
    assert.ok(near(named.YIELD_PRODUCTION, 10));
});

test("production toward buildings: the focus's kind counts more than another kind (Literature: science buildings)", () => {
    const lit = [{ effect: "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION", args: { Tag: "SCIENCE", Percent: "20" } }];
    assert.ok(near(effectYields(lit, { focus: "SCIENCE", production: 100 }).YIELD_PRODUCTION, 6));
    assert.ok(near(effectYields(lit, { focus: "ECONOMIC", production: 100 }).YIELD_PRODUCTION, 2));
    const all = [{ effect: "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION", args: { ConstructibleClass: "BUILDING", Percent: "10" } }];
    assert.ok(near(effectYields(all, { focus: "SCIENCE", production: 100 }).YIELD_PRODUCTION, 5), "Oligarchy: every building");
});

test("lump grants spread over a few turns (Elective Republic's +1000 Science celebration); mastery speed and cheaper purchases from the empire's own numbers", () => {
    const er = effectYields([{ effect: "EFFECT_PLAYER_GRANT_YIELD", args: { YieldType: "YIELD_SCIENCE", Amount: "1000" } }], {});
    assert.deepEqual(er, { YIELD_SCIENCE: 1000 / LUMP_TURNS });
    const mastery = effectYields([{ effect: "EFFECT_PLAYER_ADJUST_PROGRESSION_TREE_MASTERY_EFFICIENCY", args: { SystemType: "SYSTEM_TECH", Percent: "25" } }], { science: 100 });
    assert.ok(near(mastery.YIELD_SCIENCE, 7.5));
    const buy = effectYields([{ effect: "EFFECT_ADJUST_PLAYER_OR_CITY_BUILDING_PURCHASE_EFFICIENCY", args: { Percent: "15" } }], { gold: 200 });
    assert.ok(near(buy.YIELD_GOLD, 15));
    assert.deepEqual(effectYields([{ effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_GOLD", Amount: "5" } }], { production: 100 }), {}, "plain yields are Policy Yield Previews' part");
});

test("governments: the focus's best first, military ones last, the rest in the game's order", () => {
    const ex = ["GOVERNMENT_FEUDAL_MONARCHY", "GOVERNMENT_PLUTOCRACY", "GOVERNMENT_THEOCRACY"];
    assert.equal(rankGovernments(ex, "SCIENCE")[0], "GOVERNMENT_PLUTOCRACY");
    assert.equal(rankGovernments(ex, "CULTURE")[0], "GOVERNMENT_THEOCRACY");
    assert.deepEqual(rankGovernments(ex, null), ["GOVERNMENT_PLUTOCRACY", "GOVERNMENT_THEOCRACY", "GOVERNMENT_FEUDAL_MONARCHY"], "no focus: never a military one first");
    const mo = ["GOVERNMENT_AUTHORITARIANISM", "GOVERNMENT_BUREAUCRATIC_MONARCHY", "GOVERNMENT_ELECTIVE_REPUBLIC"];
    assert.equal(rankGovernments(mo, "SCIENCE")[0], "GOVERNMENT_ELECTIVE_REPUBLIC");
    assert.equal(rankGovernments(mo, "ECONOMIC")[0], "GOVERNMENT_BUREAUCRATIC_MONARCHY");
    assert.equal(rankGovernments(["GOVERNMENT_CLASSICAL_REPUBLIC", "GOVERNMENT_DESPOTISM", "GOVERNMENT_OLIGARCHY"], "SCIENCE")[0], "GOVERNMENT_OLIGARCHY");
    assert.deepEqual(["SCIENCE", "GOLD", "GOLD_SCIENCE", "CULTURE", "BALANCE"].map(focusOfProfile), ["SCIENCE", "ECONOMIC", "ECONOMIC", "CULTURE", null]);
});
