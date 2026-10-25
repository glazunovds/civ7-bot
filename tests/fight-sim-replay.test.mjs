// The fight simulator on a game's own turns (tools/unitmap.mjs scene=, tests/fakes/fight-scenes.mjs replayScene): the game's
// level thresholds per scene (game 60, Standard speed: 15, 30, 45, where the simulator had Online's 7, 15, 23), each village's
// measured spawn cadence (game 60: 8, then 7, then 6 turns, where the simulator spawned every 4), several villages at once, and
// a replay of the cut of game 60's logs in tests/fixtures/unitmap-g60.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { SIM, createFightSim } from "./fakes/fight-sim.mjs";
import { replayScene, runScene } from "./fakes/fight-scenes.mjs";
import { buildScene, readLogs } from "../tools/unitmap.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "unitmap-g60");
const data = buildScene(readLogs(DIR, { from: 66, to: 67 }), { from: 66, turns: 2, radius: 6 });
const replay = replayScene(data);
const { world } = replay;
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const mods = { fake, units, steps, settings: DEFAULT_SETTINGS };
const CAPITAL = { x: 65, y: 9 };
const id = (n) => ({ owner: 0, id: n, type: 1 });

test("a scene's own level thresholds: at Standard a commander at 14 of 15 reaches level 1 and then needs 30 (the simulator's Online table: 15)", () => {
    const base = Game.turn;
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...CAPITAL }, { id: 50, type: "UNIT_ARMY_COMMANDER", ...CAPITAL, xp: { level: 0, points: 14, next: 15 } }];
        world.enemies = [{ id: 900, owner: 28, type: "UNIT_WARRIOR", x: CAPITAL.x + 1, y: CAPITAL.y }];
        const sim = createFightSim(world, fake, { levels: data.levels });
        sim.startTurn();
        Game.UnitOperations.sendRequest(id(1), UnitOperationTypes.MOVE_TO, { X: CAPITAL.x + 1, Y: CAPITAL.y, Modifiers: UnitOperationMoveModifiers.ATTACK });
        const c = world.units.find((u) => u.id === 50);
        assert.deepEqual(c.xp, { level: 1, points: 14 + SIM.XP.MELEE + SIM.XP.ATTACKER - 15, next: 30 });
        assert.deepEqual(data.levels.slice(0, 3), [15, 30, 45]);
    } finally {
        Game.turn = base;
    }
});

test("each village spawns on its own measured cadence: its first birth on the scene's turn `first`, then every `every`; two villages at once", () => {
    const base = Game.turn;
    try {
        world.units = [];
        world.enemies = [];
        const sim = createFightSim(world, fake, {
            villages: [{ x: 53, y: 10, owner: 28, every: 8, first: 6, max: 9, spawn: ["UNIT_WARRIOR", "UNIT_ARCHER"] }, { x: 72, y: 11, owner: 36, every: 7, max: 9 }],
        });
        for (let t = 0; t < 16; t++) {
            sim.startTurn();
            sim.enemyTurn();
        }
        assert.deepEqual(sim.stats.births.filter((b) => b.owner === 28).map((b) => [b.turn, b.type]), [[6, "UNIT_WARRIOR"], [14, "UNIT_ARCHER"]], "game 60's p28: T65 and T73 seen from T60");
        assert.deepEqual(sim.stats.births.filter((b) => b.owner === 36).map((b) => b.turn), [1, 8, 15]);
    } finally {
        Game.turn = base;
    }
});

test("a raider (away from its village) walks to our nearest settlement; a guard keeps within its leash of the village; a village we had not seen stands on a hidden tile", () => {
    const base = Game.turn;
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...CAPITAL }];
        world.enemies = [{ id: 901, owner: 28, type: "UNIT_WARRIOR", x: 60, y: 10, raid: true }, { id: 902, owner: 28, type: "UNIT_WARRIOR", x: 54, y: 10 }];
        const sim = createFightSim(world, fake, { villages: [{ x: 53, y: 10, owner: 28, every: 99, first: 99, leash: 2 }] });
        const d = (e, t) => GameplayMap.getPlotDistance(e.x, e.y, t.x, t.y);
        const before = d(world.enemies[0], CAPITAL);
        sim.startTurn();
        sim.enemyTurn();
        const [raider, guard] = [901, 902].map((n) => world.enemies.find((e) => e.id === n));
        assert.ok(d(raider, CAPITAL) < before, `the raider walked toward the capital: ${raider.x},${raider.y}`);
        assert.ok(d(guard, { x: 53, y: 10 }) <= 2, "the guard stayed home");
    } finally {
        Game.turn = base;
    }
    const v = data.villages.find((x) => x.owner === 28);
    assert.equal(v.seen, true, "listed in our places: line");
    assert.equal(replayScene({ ...data, villages: [{ ...v, seen: false }] }).world.tiles(v.x, v.y).revealed, false);
    assert.equal(world.tiles(v.x, v.y).revealed, undefined);
});

test("a replay of game 60's T66-T67: our units and theirs from the logs, the commander at level 2 with 11 of 45, run by the autopilot's unit steps", async () => {
    const sim = await runScene(replay, mods, { turns: 2 });
    const s = sim.summary();
    assert.equal(s.turns, 2);
    const cmdr = world.units.find((u) => u.id === 262146);
    assert.deepEqual([cmdr?.xp.level, cmdr?.xp.next], [2, 45], JSON.stringify(cmdr?.xp));
    assert.ok(sim.stats.log.some((l) => l.startsWith("T66 end:")) && sim.stats.log.some((l) => l.startsWith("T67 end:")), "the game's own turn numbers");
    assert.ok(world.units.some((u) => u.id === 1179654) || s.losses > 0, "the Slinger is there (or fell)");
    assert.ok(Number.isFinite(s.combats));
    // The game's own record of the same turns, beside it (tools/fight-sim.mjs scene=).
    assert.deepEqual(data.game.map((g) => g.turn), [66, 67]);
});
