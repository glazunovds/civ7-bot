// tools/unitmap.mjs on a cut of game 60's logs (tests/fixtures/unitmap-g60: T13-T15 for the village p28, T64-T67 for us and
// p28). Game 60's review: the game's AI logs place every unit by id each turn (AI_MovementPlanning), CombatLog gives health
// after each fight and heal, AI_Tactical the AI's attack tiles; our UI.log adds packed armies, what we saw and the generals'
// radius. The T67 Slinger 1179654, hit at 65,12 on T66, withdrew to 65,11 and died there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { births, buildScene, cadenceAt, damageAt, fightsIn, parseMovement, readLogs, settlementsAt, unitsAt, warsAt } from "../tools/unitmap.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "unitmap-g60");
const logs = readLogs(DIR, { from: 64, to: 67 });
const at = (turn, owner, id) => logs.movement.at.get(turn)?.get(`${owner}:${id}`);

test("positions by id from AI_MovementPlanning: a unit's tile is its turn-1 entry with the most moves left", () => {
    assert.deepEqual([at(66, 0, 1179654)?.x, at(66, 0, 1179654)?.y], [65, 11], "the Slinger before its REINFORCE walk");
    assert.deepEqual([at(67, 0, 1179654)?.x, at(67, 0, 1179654)?.y, at(67, 0, 1179654)?.moves], [65, 12, 2], "hit there on T66");
    assert.deepEqual([at(67, 28, 65536)?.x, at(67, 28, 65536)?.y], [64, 13], "p28's Warrior that killed it");
    assert.equal(logs.types.get("28:65536"), "UNIT_WARRIOR");
    assert.equal(logs.types.get("0:1179654"), "UNIT_SLINGER");
    assert.deepEqual([logs.map.width, logs.map.height], [96, 60], "MAPSIZE_LARGE (GameCoreAppConfig.log)");
    // Only the turns asked for are placed; every unit's first and last turn are kept.
    assert.equal(parseMovement("Game Turn, Player, Unit ID, Category, Info\n5, 0, 7, MOVES, , 3:3(2/2), 4:4(1/1), 5:5(1/2)", { from: 5, to: 5 }).at.get(5).get("0:7").x, 5);
});

test("damage carried from CombatLog (fights matched by owner, type and tile, attackers by AI_Tactical's tiles), and the turn's fights with kills and losses", () => {
    const d = damageAt(logs, 67);
    assert.equal(d.get("0:1179654"), 38, "the Slinger's 62 health after T66's fight");
    assert.equal(d.get("28:65536"), 65, "its attacker's 35 (AI_Tactical: Move 64 13 Attack 65 12)");
    const f = fightsIn(logs, 67);
    assert.deepEqual([f.fights, f.naval, f.kills, f.losses], [6, 2, 1, 1]);
    assert.deepEqual([f.inRadius, f.logged], [1, 4], "our fight: lines (one with a general)");
    assert.deepEqual([fightsIn(logs, 64).inRadius, fightsIn(logs, 64).logged], [1, 1], "an old log's xp: combat probe (a commander 0 tiles away)");
});

test("our UI.log: the stamped units line (its parts joined) with the packed soldier; settlements from places: or old foundings; wars from DiplomacySummary", () => {
    const u = logs.ours.units.get(67);
    assert.ok(u, "the units line of A67");
    assert.deepEqual(u.cmdrs[0].packed.map((m) => m.id), [851977]);
    assert.equal(u.far, 0, "its second part");
    assert.equal(u.unseen, 1);
    assert.deepEqual(settlementsAt(logs, 64).map((s) => `${s.x},${s.y}`), ["65,9", "66,5", "65,15", "71,6"], "SETTLE_FOUND entries");
    assert.deepEqual(settlementsAt(logs, 67).map((s) => s.name), ["Санкт-Петербург", "Самара", "Тула", "Астрахань"], "the places: line");
    assert.deepEqual([...warsAt(logs.wars, 64)].sort(), [28, 36]);
    const s = unitsAt(logs, 67, { radius: 6 });
    assert.deepEqual(s.packed.map((m) => [m.id, m.cmdr]), [[851977, 262146]]);
    assert.ok(s.theirs.some((e) => e.owner === 28 && e.id === 65536 && e.d === 65));
    assert.ok(!s.theirs.some((e) => e.type === "UNIT_QUADRIREME"), "ships are left out unless asked");
    assert.deepEqual(logs.ours.xp.map((x) => [x.turn, x.xp]), [[63, 9], [64, 11]], "old xp: lines take the last gold: line's turn");
    // A unit the movement log lost for a turn is packed: p28's Archer with its commander at T65 (seen on T64 and T66).
    const t65 = unitsAt(logs, 65, { radius: 6 });
    assert.deepEqual(t65.theirs.filter((e) => e.packed).map((e) => [e.id, e.packed]), [[720904, 851978]]);
});

test("births: each village's new units by the turn they are first seen, bursts apart, and its cadence", () => {
    const p28 = births(logs).find((b) => b.owner === 28);
    assert.ok(p28.plain.includes(14) && p28.plain.includes(65), JSON.stringify(p28.turns));
    // A raid party (several units in one turn) is no birth gap, and the clock starts again from it (game 60's p28: 54, the
    // burst of 57, then 65).
    const first = new Map([14, 22, 30, 38, 46, 54, 65, 73].map((t, i) => [`28:${i + 1}`, t]));
    for (let i = 0; i < 5; i++) first.set(`28:${100 + i}`, 57);
    const b = births({ indep: { tribes: new Map([[28, { owner: 28, x: 53, y: 10, turn: 2 }]]) }, movement: { first }, types: new Map() })[0];
    assert.deepEqual([b.gaps.map((g) => g.gap), b.bursts.map((x) => x.turn)], [[8, 8, 8, 8, 8, 8, 8], [57]]);
    // Game 60's p28 (the whole log): 14, 22, … 54, a burst at 57, 65, 73 …: 8 turns, the burst restarting the clock.
    const g60 = { turns: [14, 22, 30, 38, 46, 54, 57, 65, 73, 81, 89, 96, 103, 110, 116], gaps: [22, 30, 38, 46, 54, 65, 73, 81, 89, 103, 110, 116].map((t, i, a) => ({ turn: t, gap: t - [14, 22, 30, 38, 46, 57, 65, 73, 81, 96, 103, 110][i] })) };
    assert.deepEqual(cadenceAt(g60, 60), { every: 8, next: 65 });
    assert.deepEqual(cadenceAt(g60, 112), { every: 7, next: 117 });
});

test("a scene: our units at the window's first turn with damage, the commander's XP and the game's level thresholds, theirs as raiders or guards, the game's own record", () => {
    const scene = buildScene(logs, { from: 66, turns: 2, radius: 6 });
    assert.deepEqual(scene.levels.slice(0, 4), [15, 30, 45, 60], "Standard: 15 × (level + 1), from the commander's 11/45 at level 2");
    const cmdr = scene.ours.find((u) => u.id === 262146);
    assert.deepEqual(cmdr.xp, { level: 2, points: 11, next: 45 });
    assert.ok(scene.ours.some((u) => u.id === 1179654 && u.x === 65 && u.y === 11));
    const p28 = scene.theirs.filter((e) => e.owner === 28);
    assert.ok(p28.length >= 3 && p28.every((e) => e.raid), "11 tiles from Цзэши: raiders");
    assert.ok(!scene.theirs.some((e) => /SCOUT|COMMANDER/.test(e.type)), "their soldiers only");
    assert.deepEqual(scene.game.map((g) => [g.turn, g.fights, g.kills, g.losses]), [[66, 2, 0, 0], [67, 6, 1, 1]]);
    assert.ok(scene.villages.some((v) => v.owner === 28 && v.x === 53 && v.y === 10));
});
