// Game 60's review, UI-5: «Ядерное оружие» acts only with «Оборона». Before, Nuclear Fission's research and the Manhattan
// Project and its weapons checked only «Ядерное оружие», while the strike needed «Оборона» too: with «Оборона» off the
// autopilot researched and built weapons it never used. The steps check both, and every pass acts on the effective options
// (core/xpl-ap-options.js effectiveOptions), so its tooltip («Вместе с «Оборона»») is what happens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const MOSCOW = { x: 24, y: 5 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Russia" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
        { owner: 1, ...MOSCOW, name: "Moscow", pop: 6 },
    ],
    units: [], gold: 0, goldIncome: 10, wars: [1],
};
const fake = installFakeEngine(world, "modern");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");

const hash = (t) => Database.makeHash(t);
const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const fission = () => ({ tech: { available: [hash("NODE_TECH_MO_NUCLEAR_FISSION")] } });
const manhattan = (type) => (type === "WONDER_MANHATTAN_PROJECT" ? { Success: true, Plots: [idx(5, 6)] } : undefined);
const reset = () => {
    fake.sent.length = 0;
    steps.resetWar();
    steps.resetWonderOrders();
    Object.assign(world, { research: fission(), canBuild: manhattan, costOf: () => 200 });
    steps.assessWar([]);
};

test("Nuclear Fission's research and the Manhattan Project need «Оборона» as well as «Ядерное оружие»", () => {
    reset();
    assert.notEqual(steps.chooseResearch("tech", { autopilot: { nuclear: true, defend: false } }, null)?.key, "TECH_FOR_NUCLEAR");
    assert.notEqual(steps.chooseResearch("tech", { autopilot: { nuclear: true } }, null)?.key, "TECH_FOR_NUCLEAR", "a missing «Оборона» is off (its default)");
    assert.deepEqual(steps.nuclearWork({ autopilot: { nuclear: true, defend: false } }), []);
    assert.ok(!fake.sent.some((s) => s.kind === "operation"), JSON.stringify(fake.sent));
    // With «Оборона»: as before.
    reset();
    assert.equal(steps.chooseResearch("tech", { autopilot: { nuclear: true, defend: true } }, null)?.key, "TECH_FOR_NUCLEAR");
    assert.deepEqual(steps.nuclearWork({ autopilot: { nuclear: true, defend: true } }).map((e) => e.key), ["NUCLEAR_PROJECT"]);
});

test("a pass with «Ядерное оружие» ticked and «Оборона» off, at war: no nuclear research, no Manhattan Project", async () => {
    reset();
    settings.patch({ autopilot: { defend: false, nuclear: true, replanEvery: 0, skipUnits: false, endTurn: false, choices: false, befriend: false, growth: false, towns: false, purchases: false, wonders: false } });
    try {
        await autopilot.runTurn(true);
        const log = state.get().autopilot.log ?? [];
        assert.deepEqual(log.filter((e) => e.key === "ERROR").map((e) => e.args), []);
        for (const k of ["TECH_FOR_NUCLEAR", "NUCLEAR_PROJECT"]) assert.ok(!log.some((e) => e.key === k), `${k}: ${JSON.stringify(log.map((e) => e.key))}`);
        assert.ok(!fake.sent.some((s) => s.args?.ConstructibleType === hash("WONDER_MANHATTAN_PROJECT")));
    } finally {
        settings.patch({ autopilot: { nuclear: false, choices: true, befriend: true, growth: true, towns: true, purchases: true, wonders: true, replanEvery: 5 } });
    }
});
