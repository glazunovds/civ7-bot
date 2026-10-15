// «Баланс приоритетов»: the player's multiplier per yield on top of any profile (core/xpl-profiles.js profileFor),
// kept in settings.yieldBias (sanitised), and the economy line in UI.log every 10 turns (research/26 §3.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { BIAS_DEFAULTS, BIAS_KEYS, biasFor, biasKey, getProfile, normaliseBias, normaliseBiasSets, profileFor } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const world = {
    width: 20, height: 16, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: 5, y: 5, name: "Athens", pop: 8, prod: 20, food: 30 },
        { owner: 0, x: 12, y: 5, name: "Sparta", isTown: true, pop: 4, prod: 6, food: 5 },
    ],
};
installFakeEngine(world);
const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

test("profileFor: no balance (or all 1) is the profile itself; a multiplier scales that yield's weight only", () => {
    assert.equal(profileFor({ profile: "SCIENCE" }), getProfile("SCIENCE"));
    assert.equal(profileFor({ profile: "SCIENCE", yieldBias: { F: 1, P: 1, G: 1, S: 1, C: 1, H: 1 } }), getProfile("SCIENCE"));
    const base = getProfile("SCIENCE").y;
    const p = profileFor({ profile: "SCIENCE", yieldBias: { F: 0.5, S: 2 } });
    assert.deepEqual([p.y[0], p.y[1], p.y[3], p.y[6]], [base[0] * 0.5, base[1], base[3] * 2, base[6]], "food halved, science doubled, the rest (influence too) as is");
    assert.equal(p.key, "SCIENCE");
    assert.equal(profileFor({ profile: "SCIENCE", yieldBias: { S: 2 } }), profileFor({ profile: "SCIENCE", yieldBias: { S: 2, F: 1 } }), "memoised");
});

test("normaliseBias: within 0..2, steps of 0.1, missing or broken = 1", () => {
    assert.deepEqual(normaliseBias({ F: 5, P: -1, G: 1.234, S: "x" }), { F: 2, P: 0, G: 1.2, S: 1, C: 1, H: 1 });
    assert.deepEqual(Object.keys(normaliseBias(null)), BIAS_KEYS);
});

test("settings keep one clean balance per focus: science starts at Food ×0.7, Science ×1.5; the others at ×1", () => {
    const ones = { F: 1, P: 1, G: 1, S: 1, C: 1, H: 1 };
    assert.deepEqual(settings.get().yieldBias, { SCIENCE: { ...ones, F: 0.7, S: 1.5 }, CULTURE: ones, ECONOMIC: ones, NONE: ones });
    settings.patch({ yieldBias: { SCIENCE: { S: 3 } } });
    assert.deepEqual(settings.get().yieldBias.SCIENCE, { ...ones, F: 0.7, S: 2 }, "within 0..2; the rest of the set kept");
    assert.deepEqual(settings.get().yieldBias.CULTURE, ones, "another focus untouched");
    // An old single balance: a changed one becomes every set's.
    settings.patch({ yieldBias: { F: 0.8, S: 1.2 } });
    for (const set of ["SCIENCE", "CULTURE", "ECONOMIC", "NONE"]) assert.deepEqual(settings.get().yieldBias[set], { ...ones, F: 0.8, S: 1.2 }, set);
    settings.patch({ yieldBias: JSON.parse(JSON.stringify(BIAS_DEFAULTS)) });
});

test("the balance in use: the victory focus's own set (science leans to science), else the one without a focus", () => {
    assert.deepEqual(biasFor({ biasFocus: "SCIENCE" }), { F: 0.7, P: 1, G: 1, S: 1.5, C: 1, H: 1 }, "unset: the science default");
    assert.deepEqual(biasFor({}), { F: 1, P: 1, G: 1, S: 1, C: 1, H: 1 });
    assert.equal(biasKey({ biasFocus: "MILITARY" }), "NONE");
    assert.deepEqual(biasFor({ biasFocus: "CULTURE", yieldBias: { CULTURE: { C: 1.5 } } }).C, 1.5);
    assert.deepEqual(biasFor({ yieldBias: { F: 0.5 } }).F, 0.5, "a single balance as it is");
    const base = getProfile("SCIENCE").y;
    const p = profileFor({ profile: "SCIENCE", biasFocus: "SCIENCE" });
    assert.deepEqual([p.y[0], p.y[3]], [base[0] * 0.7, base[3] * 1.5], "a science game: food ×0.7, science ×1.5 without touching the sliders");
    assert.equal(profileFor({ profile: "SCIENCE" }), getProfile("SCIENCE"), "no focus: the profile itself");
    // Migration of an old single balance: at ×1 the defaults; changed, every set.
    assert.deepEqual(normaliseBiasSets({ F: 1, P: 1, G: 1, S: 1, C: 1, H: 1 }).SCIENCE, BIAS_DEFAULTS.SCIENCE);
    assert.deepEqual(normaliseBiasSets({ S: 2 }).ECONOMIC.S, 2);
    assert.deepEqual(normaliseBiasSets(null), JSON.parse(JSON.stringify(BIAS_DEFAULTS)));
});

test("the economy line: every 10 turns, yields and population, new citizens by kind, the balance, each settlement", () => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    const turn0 = Game.turn;
    try {
        Game.turn = 11;
        assert.equal(steps.logEconomy(settings.get()), null, "not this turn");
        Game.turn = 20;
        const line = steps.logEconomy({ ...settings.get(), yieldBias: { F: 0.7, P: 1, G: 1, S: 1.3, C: 1, H: 1 } });
        assert.match(line, /^economy: T20 AGE_ANTIQUITY: food 35, production 26,/);
        assert.match(line, /new citizens this age 0 on tiles, 0 specialists; balance NONE F0.7,S1.3;/);
        const science = steps.logEconomy({ ...settings.get(), biasFocus: "SCIENCE" });
        assert.match(science, /balance SCIENCE F0.7,S1.5;/, "a science game: its own balance");
        assert.match(line, /Athens 30\/20\/\d+\/\d+ u\d+ r\d+ s\d+; Sparta\(t\) 5\/6/);
        assert.ok(lines.some((l) => l.includes("economy: T20")));
    } finally {
        console.warn = warn;
        Game.turn = turn0;
    }
});
