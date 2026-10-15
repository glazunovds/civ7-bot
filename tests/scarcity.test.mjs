// A specialist's (or a building's) food and happiness upkeep weighs less when the
// settlement has plenty to spare, and a lot when it would run short. Numbers from a real
// Modern-age growth choice: specialist A adds +11 science +6 culture for -8 food -9
// happiness, B adds +7 / +6 for -3 / -4; the best new tile gives +1 food +4 production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { costMultiplier, costValue, gainMultiplier, gainValue, SCARCITY } from "../mod/expansion-planner/ui/core/xpl-scarcity.js";
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
