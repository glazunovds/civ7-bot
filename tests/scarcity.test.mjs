// A specialist's (or a building's) food and happiness upkeep weighs less when the
// settlement has plenty to spare, and a lot when it would run short. Numbers from a real
// Modern-age growth choice: specialist A adds +11 science +6 culture for -8 food -9
// happiness, B adds +7 / +6 for -3 / -4; the best new tile gives +1 food +4 production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { costMultiplier, costValue, gainMultiplier, gainValue, SCARCITY, UNHAPPINESS, unhappinessDelta, unhappinessShare } from "../mod/expansion-planner/ui/core/xpl-scarcity.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";
import { dot } from "../mod/expansion-planner/ui/core/xpl-yields.js";

const A = { yields: [0, 0, 0, 11, 6, 0, 0], upkeep: [8, 0, 0, 0, 0, 9, 0] };
const B = { yields: [0, 0, 0, 7, 6, 0, 0], upkeep: [3, 0, 0, 0, 0, 4, 0] };
const TILE = [1, 4, 0, 0, 0, 0, 0];
const nets = (food, happy) => [food, NaN, NaN, NaN, NaN, happy, NaN];
const gain = (s, w, n) => dot(w, s.yields) - costValue(w, s.upkeep, n);

test("the multiplier: full weight with nothing left, less with plenty, a penalty when short", () => {
    assert.equal(costMultiplier(10, 10), 1);
    assert.ok(costMultiplier(150, 8) < 0.45 && costMultiplier(150, 8) >= SCARCITY.MIN);
    assert.equal(costMultiplier(5, 9), SCARCITY.SHORTAGE);
    assert.equal(costMultiplier(NaN, 9), 1, "unknown net: plain weight");
});

test("only food and happiness depend on the settlement; gold keeps its weight", () => {
    const w = getProfile("BALANCE").y;
    assert.equal(costValue(w, [0, 0, 3, 0, 0, 0, 0], nets(200, 200)), w[2] * 3);
    assert.ok(costValue(w, [3, 0, 0, 0, 0, 0, 0], nets(200, 200)) < w[0] * 3);
});

test("a city with plenty of food and happiness: both specialists beat the tile; Science priority prefers A", () => {
    const rich = nets(149, 50);
    const balance = getProfile("BALANCE").y;
    const tile = dot(balance, TILE);
    assert.ok(gain(A, balance, rich) > tile && gain(B, balance, rich) > tile, `A ${gain(A, balance, rich)} B ${gain(B, balance, rich)} tile ${tile}`);
    assert.ok(Math.abs(gain(A, balance, rich) - gain(B, balance, rich)) < 1, "about equal by Balance");
    const science = getProfile("SCIENCE").y;
    assert.ok(gain(A, science, rich) > gain(B, science, rich) + 3);
    // Without looking at the city (plain weights) A looked worthless.
    assert.ok(gain(A, balance, null) < 0);
});

test("a city short of happiness: A would push it into unrest, B is the safe choice", () => {
    const poor = nets(149, 6);
    const w = getProfile("BALANCE").y;
    assert.ok(gain(A, w, poor) < 0);
    assert.ok(gain(B, w, poor) > gain(A, w, poor) + 10);
});

test("gains: food (and happiness) a settlement already has plenty of is worth less; short of it, full weight (research/26 §3.2)", () => {
    assert.equal(gainMultiplier(0), 1);
    assert.equal(gainMultiplier(-5), 1, "starving: full weight");
    assert.ok(Math.abs(gainMultiplier(20) - 0.65) < 1e-9);
    assert.ok(gainMultiplier(140) < 0.4 && gainMultiplier(140) >= SCARCITY.MIN);
    assert.equal(gainMultiplier(NaN), 1, "unknown: plain weight");
    const w = getProfile("BALANCE").y;
    assert.equal(gainValue(w, [0, 0, 0, 3, 0, 0, 0], nets(200, 200)), w[3] * 3, "science keeps its weight");
    assert.ok(gainValue(w, [4, 0, 0, 0, 0, 0, 0], nets(60, 0)) < w[0] * 4 * 0.5, "a 4-food tile in a city with 60 food");
    assert.equal(gainValue(w, [4, 0, 0, 0, 0, 0, 0], null), w[0] * 4, "no nets: plain weights");
});

test("below zero Happiness the game takes 5% of the settlement's other yields a point, at most 80% (research/31 §8: game 27's Лоян)", () => {
    assert.equal(unhappinessShare(3), 0);
    assert.equal(unhappinessShare(0), 0);
    assert.ok(Math.abs(unhappinessShare(-4) - 0.2) < 1e-9);
    assert.equal(unhappinessShare(-16), UNHAPPINESS.MAX);
    assert.equal(unhappinessShare(-30), UNHAPPINESS.MAX, "capped");
    assert.equal(unhappinessShare(NaN), 0);
    const w = [1, 1, 1, 1, 1, 1, 1];
    // Production 30, gold 10, science 40, culture 20: 100 a turn before any penalty (food and happiness are not taken).
    const rich = [50, 30, 10, 40, 20, 2, 0];
    assert.ok(Math.abs(unhappinessDelta(w, rich, 2, -4) - 20) < 1e-9, "2 → −4: 20% of 100");
    assert.equal(unhappinessDelta(w, rich, 8, 2), 0, "above zero: nothing");
    // Already at −4 (its yields shown reduced by 20%: 80 of 100): to −10 takes 30% more of the 100.
    const hurt = [50, 24, 8, 32, 16, -4, 0];
    assert.ok(Math.abs(unhappinessDelta(w, hurt, -4, -10) - 30) < 1e-9);
    assert.ok(Math.abs(unhappinessDelta(w, hurt, -4, 0) + 20) < 1e-9, "back to zero wins the 20% back");
    assert.equal(unhappinessDelta(w, [50, NaN, NaN, NaN, NaN, 2, NaN], 2, -4), 0, "other yields unknown: nothing to count");
});

test("a happiness cost that crosses zero costs the penalty on the other yields; a gain back above zero wins it back", () => {
    const w = getProfile("BALANCE").y;
    const yields = [50, 30, 10, 40, 20, 2, 0];
    // 6 Happiness (a Modern specialist) in a settlement with 2: −4, the game takes 20% of the rest.
    const crossing = costValue(w, [0, 0, 0, 0, 0, 6, 0], yields);
    const penalty = 0.2 * (w[1] * 30 + w[2] * 10 + w[3] * 40 + w[4] * 20);
    assert.ok(Math.abs(crossing - (w[5] * 6 + penalty)) < 1e-9, `${crossing} vs ${w[5] * 6 + penalty}`);
    // With plenty left the cost is the scarcity curve's, no penalty.
    const calm = costValue(w, [0, 0, 0, 0, 0, 6, 0], [50, 30, 10, 40, 20, 40, 0]);
    assert.ok(calm < w[5] * 6 && calm > 0);
    // Other yields unknown: the old SHORTAGE weight stands in.
    assert.equal(costValue(w, [0, 0, 0, 0, 0, 6, 0], nets(50, 2)), w[5] * 6 * SCARCITY.SHORTAGE);
    // At −4 (yields shown reduced), 4 Happiness back wins the 20% back on top of the happiness itself.
    const hurt = [50, 24, 8, 32, 16, -4, 0];
    const won = gainValue(w, [0, 0, 0, 0, 0, 4, 0], hurt);
    assert.ok(Math.abs(won - (w[5] * 4 + 0.2 * (w[1] * 30 + w[2] * 10 + w[3] * 40 + w[4] * 20))) < 1e-9, String(won));
});
