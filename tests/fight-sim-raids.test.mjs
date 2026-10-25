// The fight simulator on game 60's raids (tests/fakes/fight-scenes.mjs raids60): Catherine's one general all Antiquity, four
// settlements raided from two villages 9-10 tiles away (beyond a village hunt's reach), Standard speed's levels (15, 30, 45).
// Game 60's general saw 32% of our fights in its radius and made about 0.8 XP a turn.
//
// `node tools/fight-sim.mjs 20 20 raids60` (20 seeds, the game's ±18% spread), before this package and after it:
//   before: XP 13.1, 34.4 fights (6.3 in a general's radius), 6.3 kills, 4.0 lost, 0.6 generals defeated;
//   after:  XP 24.4, 38.4 fights (15.5 in radius), 6.0 kills, 4.2 lost, 0 generals defeated.
// Game 58's village (`node tools/fight-sim.mjs 20 20`): XP 61.6 before, 66.5 after; fights, kills and losses the same.
// After the nine packages of game 60 merged (20 seeds): XP 21.8, 15.1 in radius, 0.1 defeated. The simulator then learned
// that an assembled army defends as one unit and that a rest until healed ends at full health (healed soldiers had stood
// "busy" by the general for the rest of the scene): 23.8, 11.2, 0.2; with the merge fixes (no step away from under a general,
// a general under a healthy soldier stays when that soldier is hit, the rally leaves the formation's soldiers, no two units
// to one tile around the plague): XP 25.1, 38.3 fights (11.7 in radius), 7.7 kills, 2.9 lost, 0.1 defeated. The war package
// alone on the new simulator: 28.8, 17.4, 0; the rest of the gap is the plague package's step away (behind the centre)
// and its safer walks, which change who stands by the general.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { raids60, runScene } from "./fakes/fight-scenes.mjs";

const scene = raids60();
const { world } = scene;
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const mods = { fake, units, steps, settings: DEFAULT_SETTINGS };

test("the simulator's paths count the zone of control as its moves do: a step next to an enemy soldier ends the turn", () => {
    const base = Game.turn;
    try {
        scene.start(mods);
        // The general on the capital (6,10) walks 7,10, 7,11, 8,12; an enemy Warrior at 7,9 is next to 7,10, its first step.
        const walk = () => Units.getPathTo({ owner: 0, id: 50, type: 1 }, { x: 8, y: 12 });
        const tiles = (p) => p.plots.map((idx) => GameplayMap.getLocationFromIndex(idx)).map((l) => `${l.x},${l.y}`);
        world.enemies = [];
        assert.deepEqual([tiles(walk()), walk().turns], [["7,10", "7,11", "8,12"], [1, 1, 2]], "the fake's two tiles a turn");
        world.enemies = [{ id: 990, owner: 8, type: "UNIT_WARRIOR", x: 7, y: 9 }];
        assert.equal(GameplayMap.getPlotDistance(7, 10, 7, 9), 1);
        assert.deepEqual(walk().turns, [1, 2, 2], "its moves end beside the Warrior");
    } finally {
        Game.turn = base;
    }
});

test("fight simulator, game 60's raids for 20 turns: the general fights in reach of most raids (15+ fights in its radius) and is never caught", async () => {
    // Before (one general held at its post, raider hunts refused it, a formation tile in an Archer's range): 13 fights in
    // its radius of 38; with the expected damage, no general caught (4 of 10 random seeds before the formation fix).
    const sim = await runScene(scene, mods, { turns: 20 });
    const s = sim.summary();
    const text = JSON.stringify(s);
    assert.ok(s.inRadius >= 15, text);
    assert.ok(Object.values(s.xp).reduce((a, b) => a + b, 0) >= 20, text);
    assert.equal(s.commanderDefeats, 0, text);
    // Both villages raid: soldiers of both owners died.
    assert.ok(s.kills >= 4, text);
});
