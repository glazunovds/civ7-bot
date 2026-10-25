// The fight simulator (tests/fakes/fight-sim.mjs) and the scene of game 58 (tests/fakes/fight-scenes.mjs). The user, 23 October:
// "the commander earned some XP, but was not taking much of it, staying in the city instead of moving more units toward the
// village and constantly fighting, swapping injured units. We need to create some fights simulator test, so we will have an
// idea how to better implement it." Керманцы, an independent's village 3 tiles from our town Дыонглам, kept 3-4 soldiers
// around it; our hunt ended after a turn of fighting, and the bastion stood on Дыонглам's centre while a Spearman of ours
// fought the village's Archer two tiles away for three turns (T63-T65), out of its radius.
//
// What the simulator showed (20 turns, `node tools/fight-sim.mjs 20 20` for 20 seeds with the game's ±18% spread):
//   before: the generals 14.7 XP, 7.7 fights in a general's radius, 0.9 kills, 2.1 soldiers lost, 0.4 generals defeated;
//   a general on our centre stays when its holder is hit (the district holds): 21.8 XP, 0.1 defeated;
//   the skirmish (archers next to the town, at most one of theirs within 3) as well: 29.6 XP, 1.4 kills, 2.8 lost, 0.1 defeated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { SIM, autopilotPass } from "./fakes/fight-sim.mjs";
import { village58, runScene } from "./fakes/fight-scenes.mjs";

const scene = village58();
const { world, TOWN, VILLAGE } = scene;
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const mods = { fake, units, steps, settings: DEFAULT_SETTINGS };

const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const ours = (id) => world.units.find((u) => u.id === id);
const id = (n) => ({ owner: 0, id: n, type: 1 });
const expected = (a, d) => Math.round(SIM.BASE_DAMAGE * Math.exp(SIM.K * (a - d)));
const quietly = async (fn) => {
    const saved = [console.warn, console.info];
    console.warn = () => {};
    console.info = () => {};
    try {
        return await fn();
    } finally {
        [console.warn, console.info] = saved;
    }
};

test("the simulator's rules: 30 damage each way at equal strength, the defender's only at range; 3 XP for a melee attack in a general's radius, 2 at range, 2 more for a kill, 1 from level 2 against independents; one soldier a tile; 20 healed on our settlement after a rest", () => {
    const base = Game.turn;
    try {
        const sim = scene.start(mods);
        sim.startTurn();
        const bastion = ours(51); // on the town, with the Spearman 2
        world.enemies = [{ id: 950, owner: 9, type: "UNIT_SPEARMAN", x: TOWN.x + 1, y: TOWN.y }];
        const M = UnitOperationMoveModifiers;
        Game.UnitOperations.sendRequest(id(2), UnitOperationTypes.MOVE_TO, { X: TOWN.x + 1, Y: TOWN.y, Modifiers: M.ATTACK });
        assert.deepEqual([world.enemies[0].damage, ours(2).damage], [30, 30], "Spearman against Spearman");
        assert.equal(bastion.xp.points, SIM.XP.MELEE + SIM.XP.ATTACKER, "melee 2 + attacker 1");
        // An Archer next to the town shoots it: no damage back; 2 XP.
        Object.assign(ours(4), { x: TOWN.x, y: TOWN.y + 1 });
        assert.ok(dist(ours(4), world.enemies[0]) <= 2);
        Game.UnitOperations.sendRequest(id(4), UnitOperationTypes.RANGE_ATTACK, { X: TOWN.x + 1, Y: TOWN.y });
        assert.deepEqual([world.enemies[0].damage, ours(4).damage ?? 0], [30 + expected(20, 25 - 3), 0]);
        assert.equal(sim.stats.xp.get(51), 5);
        // A kill: 2 more.
        sim.startTurn();
        world.enemies[0].damage = 95;
        Game.UnitOperations.sendRequest(id(2), UnitOperationTypes.MOVE_TO, { X: TOWN.x + 1, Y: TOWN.y, Modifiers: M.ATTACK });
        assert.equal(world.enemies.length, 0, "killed");
        assert.equal(sim.stats.xp.get(51), 5 + 3 + SIM.XP.KILL);
        assert.deepEqual([ours(2).x, ours(2).y], [TOWN.x + 1, TOWN.y], "the melee attacker steps into the tile it took");
        // From level 2, against independents: 1 a fight.
        bastion.xp = { level: 2, points: 0, next: SIM.LEVELS[2] };
        const beside = [[0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => ({ x: TOWN.x + dx, y: TOWN.y + dy }))
            .find((t) => dist(t, TOWN) === 1 && !(t.x === ours(2).x && t.y === ours(2).y));
        world.enemies = [{ id: 951, owner: 9, type: "UNIT_WARRIOR", ...beside }];
        Object.assign(ours(3), { x: TOWN.x, y: TOWN.y });
        Game.UnitOperations.sendRequest(id(3), UnitOperationTypes.MOVE_TO, { X: beside.x, Y: beside.y, Modifiers: M.ATTACK });
        assert.equal(bastion.xp.points, SIM.XP.BARB_SOFT);
        // One soldier a tile: the Warrior 6 told onto the Spearman 3's tile stops before it.
        sim.startTurn();
        Object.assign(ours(6), { x: TOWN.x - 1, y: TOWN.y });
        Game.UnitOperations.sendRequest(id(6), UnitOperationTypes.MOVE_TO, { X: TOWN.x, Y: TOWN.y });
        assert.deepEqual([ours(6).x, ours(6).y], [TOWN.x - 1, TOWN.y]);
        // A rest on our settlement heals 20; a unit that fought heals nothing.
        ours(3).damage = 50;
        ours(2).damage = 50;
        ours(2).acted = true;
        sim.startTurn();
        assert.deepEqual([ours(3).damage, ours(2).damage], [30, 50]);
    } finally {
        Game.turn = base;
    }
});

test("the simulator's rules (the review after game 60's packages merged): an assembled army defends as one unit (its strongest packed soldier fights, the army unpacks hurt 50); a general alone is caught; a rest until healed ends at full health", () => {
    const base = Game.turn;
    try {
        scene.start(mods);
        const sim = scene.start(mods);
        sim.startTurn();
        const spot = { x: 18, y: 4 };
        // The vanguard with a Warrior packed, next to an enemy Spearman: the Warrior takes the fight, the general stays.
        const general = ours(50);
        Object.assign(general, spot);
        world.units = world.units.filter((u) => ![1, 2, 3, 4, 5, 51].includes(u.id));
        Object.assign(ours(6), { onMap: false, x: -9999, y: -9999, army: general.army });
        world.enemies = [{ id: 960, owner: 9, type: "UNIT_SPEARMAN", x: spot.x + 1, y: spot.y, damage: 0 }];
        sim.enemyTurn();
        assert.equal(sim.stats.commanderDefeats, 0, sim.stats.log.join("\n"));
        assert.ok(ours(6).damage > 0, "the packed Warrior took the blow");
        assert.equal(general.xp.points, SIM.XP.MELEE, "the army's fight is in its general's radius");
        // Hurt 50 or more, the army unpacks around its general.
        ours(6).damage = 45;
        world.enemies[0].acted = false;
        sim.enemyTurn();
        assert.ok(ours(6).damage >= SIM.ARMY_UNPACK_DAMAGE && ours(6).onMap === true && dist(ours(6), general) === 1, JSON.stringify(ours(6)));
        // Alone (nothing packed, no soldier on its tile), the general is caught.
        world.units = world.units.filter((u) => u.id !== 6);
        world.enemies[0].acted = false;
        world.enemies[0].damage = 0;
        sim.enemyTurn();
        assert.equal(sim.stats.commanderDefeats, 1, sim.stats.log.join("\n"));
        // "Rest until fully healed": a unit resting at full health wants orders again; hurt it keeps resting.
        world.units.push({ id: 7, type: "UNIT_WARRIOR", x: 5, y: 8, damage: 10, activity: UnitActivityTypes.HEAL }, { id: 8, type: "UNIT_WARRIOR", x: 5, y: 9, damage: 40, activity: UnitActivityTypes.HEAL });
        sim.startTurn();
        assert.deepEqual([ours(7).damage, ours(7).activity, ours(8).activity], [0, UnitActivityTypes.NONE, UnitActivityTypes.HEAL]);
    } finally {
        Game.turn = base;
    }
});

test("skirmish (game 58): our free Archers take posts next to the town facing the village, never next to its melee soldiers nor within 3 of two of its soldiers; the vanguard goes to the town's centre over them", async () => {
    const base = Game.turn;
    try {
        const sim = scene.start(mods);
        sim.startTurn();
        const posts = [];
        const shooterOrders = [];
        const entries = await quietly(async () => {
            const push = fake.sent.push;
            fake.sent.push = function (...o) {
                for (const x of o) {
                    if ((x.kind === "unit" || x.kind === "unitCommand") && [4, 5].includes(x.id.id)) shooterOrders.push(x.op);
                    if (x.kind === "unit" && x.op === UnitOperationTypes.MOVE_TO && [4, 5].includes(x.id.id)) posts.push({ id: x.id.id, x: x.args.X, y: x.args.Y });
                }
                return push.apply(this, o);
            };
            try {
                return await autopilotPass({ units, steps, settings: DEFAULT_SETTINGS });
            } finally {
                fake.sent.push = push;
            }
        });
        const keys = entries.map((e) => e.key);
        assert.ok(keys.includes("SKIRMISH_POST"), JSON.stringify(keys));
        assert.ok(keys.includes("SKIRMISH_COMMANDER"), JSON.stringify(keys));
        assert.ok(posts.length > 0);
        for (const p of posts) {
            assert.ok(dist(p, TOWN) <= 1, `next to the town: ${JSON.stringify(p)}`);
            assert.ok(!world.enemies.some((e) => e.type !== "UNIT_ARCHER" && dist(e, p) <= 1), "not next to a melee soldier of theirs");
            assert.ok(world.enemies.filter((e) => dist(e, p) <= 3).length <= 1, "at most one of theirs within 3");
        }
        // The skirmish orders them for the pass: no other order (the unit loop, the vanguard's rally) besides its move or a shot.
        assert.deepEqual(shooterOrders.filter((op) => op !== UnitOperationTypes.MOVE_TO && op !== UnitOperationTypes.RANGE_ATTACK), [], JSON.stringify(shooterOrders));
        assert.ok(dist(ours(50), TOWN) < dist({ x: 4, y: 8 }, TOWN), "the vanguard walks toward the town");
        assert.ok(dist(VILLAGE, TOWN) === 3);
    } finally {
        Game.turn = base;
    }
});

test("fight simulator, game 58's village for 20 turns: the generals fight constantly in reach (70+ XP, 5+ kills), no general is caught, at most 3 soldiers lost", async () => {
    // Before (no skirmish, a general leaving the centre whenever its holder was hit): 30 XP, 4 kills, 2 lost; the skirmish
    // alone with archers posted wherever their soldiers were in range: 63 XP, 4 kills, 4 lost; the centre rule alone: 43 XP;
    // the skirmish without the centre rule: 2 generals caught.
    const sim = await runScene(scene, mods, { turns: 20 });
    const s = sim.summary();
    const xp = Object.values(s.xp).reduce((a, b) => a + b, 0);
    const text = JSON.stringify(s);
    assert.ok(xp >= 70, text);
    assert.ok(s.kills >= 5, text);
    assert.equal(s.commanderDefeats, 0, text);
    assert.ok(s.losses <= 3, text);
    assert.ok(s.inRadius >= s.combats - 2, text);
});
