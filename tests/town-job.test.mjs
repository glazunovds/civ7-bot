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

test("a new age's first turns: the age length is the last age's, not 120 turns (research/24 F3: E1 said 118, the age had 70)", async () => {
    const { ageOutlook } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
    const key = Database.makeHash("_XPL_OBJ_AGE_SAMPLES");
    const before = GameTutorial.getProperty(key);
    try {
        GameTutorial.setProperty(key, JSON.stringify({ age: "AGE_OLD", samples: [{ turn: 1, points: 0 }, { turn: 70, points: 100 }] }));
        assert.equal(ageOutlook().turnsLeft, 56, "80% of a 70-turn age left");
        assert.equal(JSON.parse(GameTutorial.getProperty(key)).lastTurns, 70);
    } finally {
        GameTutorial.setProperty(key, before);
    }
});

test("the last age's length outlives the age change in the settings (game 22: the save's properties were gone at E1, the estimate said 118 turns again)", async () => {
    const { ageOutlook } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
    const { gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { getRules } = await import("../mod/expansion-planner/ui/data/xpl-rules-loader.js");
    const key = Database.makeHash("_XPL_OBJ_AGE_SAMPLES");
    const before = GameTutorial.getProperty(key);
    try {
        settings.remember(gameKey(), { age: "AGE_OLD", ageTurns: 70 });
        GameTutorial.setProperty(key, null); // the age change wiped the save's properties
        assert.equal(ageOutlook().turnsLeft, 56, "80% of a 70-turn age left");
        // This age's length is remembered as it goes: the turn plus the turns left, from two samples on.
        GameTutorial.setProperty(key, JSON.stringify({ age: getRules().age, samples: [{ turn: Game.turn - 9, points: 0 }] }));
        const left = ageOutlook().turnsLeft;
        assert.deepEqual([settings.recall(gameKey(), "age"), settings.recall(gameKey(), "ageTurns")], [getRules().age, Game.turn + left]);
    } finally {
        GameTutorial.setProperty(key, before);
    }
});

test("advisor ranks the productive town above the farming town", () => {
    const towns = runTownAdvisor(DEFAULT_SETTINGS);
    assert.equal(towns.rows.length, 2);
    assert.equal(towns.rows[0].town.name, "Forge");
    assert.equal(towns.rows[0].advice.verdict, "CONVERT");
    assert.equal(towns.rows[1].advice.verdict, "KEEP");
    assert.equal(towns.ctx.prodToGold, 2.5);
    assert.ok(towns.ctx.ageTurnsLeft > 0);
});
