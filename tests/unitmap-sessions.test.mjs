// tools/unitmap.mjs on a folder from one launch: the game appends each age (its turns start again at 1, unit ids are given out
// again) and each earlier save loaded to the same logs. Game 60's whole folder (AI_MovementPlanning 140 -> 1 twice) gave 33 of
// ours instead of 1 for a T30 scene, and p28's births 14 22 29 30 33 … instead of every 8. tests/fixtures/unitmap-sessions:
// Antiquity's T139-T140, then Exploration's T1-T3, our unit 65536 a Warrior in the one and a Man-at-Arms in the other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { births, damageAt, fightsIn, isShip, mapGrid, packedAt, parseCombat, parseMovement, parseOurLog, readLogs, sessionNote, sessionsOf, settlementsAt, unitsAt, warsAt } from "../tools/unitmap.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "unitmap-sessions");

test("a folder's logs are cut where the turn drops; the last session is read by default, the same one of every log", () => {
    const logs = readLogs(DIR);
    assert.deepEqual([logs.sessions.used, logs.sessions.count, logs.sessions.age, logs.sessions.first, logs.sessions.last], [2, 2, "E", 1, 3]);
    // Our unit 65536: Exploration's, its id given out again.
    assert.equal(logs.types.get("0:65536"), "UNIT_MAN_AT_ARMS");
    assert.deepEqual([logs.movement.first.get("0:65536"), logs.movement.last.get("0:65536")], [1, 3], "not Antiquity's T139");
    assert.equal(logs.movement.at.get(140), undefined);
    assert.deepEqual([logs.movement.at.get(2).get("0:65536").x, logs.movement.at.get(2).get("0:65536").y], [50, 31]);
    // The village's births of this age only (its starting unit of T2 none; Antiquity's 131073 first seen at T139 none).
    assert.deepEqual(births(logs).find((b) => b.owner === 28)?.turns, [3]);
    // CombatLog's second session has no header: its first row is read too.
    const f = fightsIn(logs, 2);
    assert.deepEqual([f.fights, f.naval], [2, 1], "the pirates' Corsair is a ship");
    assert.equal(damageAt(logs, 3).get("0:65536"), 45);
    assert.equal(fightsIn(logs, 140).fights, 0);
    // UI.log: E2's lines, not A140's (the same numbers in another age are other turns).
    assert.equal(logs.ours.units.get(140), undefined);
    assert.equal(logs.ours.units.get(2)?.ours[0]?.type, "UNIT_MAN_AT_ARMS");
    assert.deepEqual(logs.ours.fights.map((x) => x.turn), [2, 2]);
    assert.deepEqual(settlementsAt(logs, 3).map((s) => `${s.x},${s.y}`), ["50,30"]);
    assert.deepEqual([...warsAt(logs.wars, 2)].sort((a, b) => a - b), [28, 40]);
    // DiplomacySummary has a third session (a copy taken on the next age's first turn, as game 60's Antiquity copy): named.
    assert.equal(logs.sessions.files["DiplomacySummary.csv"], 3);
    assert.equal(logs.sessions.warnings.length, 1);
    assert.match(logs.sessions.warnings[0], /^DiplomacySummary\.csv has 3 session\(s\), AI_MovementPlanning\.csv 2/);
    const note = sessionNote(logs);
    assert.equal(note[0], "session 2 of 2 (UI.log E1-E3); session=N reads another");
    assert.equal(note.length, 2);
    // The game's own map (LARGE), not the setup screen's change after it (SMALL), which our unit at x 95 does not fit.
    assert.deepEqual([logs.map.size, logs.map.width, logs.map.height], ["MAPSIZE_LARGE", 96, 60]);
});

test("session=1 reads Antiquity's turns of every log, UI.log's A lines with them", () => {
    const logs = readLogs(DIR, { session: 1 });
    assert.deepEqual([logs.sessions.used, logs.sessions.age, logs.sessions.first, logs.sessions.last], [1, "A", 139, 140]);
    assert.equal(logs.types.get("0:65536"), "UNIT_WARRIOR");
    assert.deepEqual([logs.movement.first.get("0:65536"), logs.movement.at.get(140).get("0:65536").y], [139, 11]);
    assert.equal(logs.movement.at.get(2), undefined);
    assert.deepEqual([fightsIn(logs, 140).fights, fightsIn(logs, 140).naval, fightsIn(logs, 2).fights], [1, 0, 0]);
    assert.ok(logs.ours.units.get(140), "A140's units line");
    assert.equal(logs.ours.units.get(2), undefined);
    assert.deepEqual(settlementsAt(logs, 140).map((s) => s.name), ["Москва"]);
    const s = unitsAt(logs, 140, { radius: 6 });
    assert.deepEqual(s.ours.map((u) => [u.id, u.type, u.x, u.y]), [[65536, "UNIT_WARRIOR", 10, 11]]);
    assert.throws(() => readLogs(DIR, { session: 3 }), /the folder has 2/);
});

test("UI.log's sessions: a stamped line's age letter changes or its turn drops; an unstamped log's gold turn drops (a refused end of turn is none)", () => {
    const at = (t, text) => `[2026-10-25 10:00:00]\t[XPL] ${t ? `${t} ` : ""}${text}`;
    const xp = (n) => `xp: UNIT_ARMY_COMMANDER 0:262146 at 5,5 onMap=true; level 1, XP ${n}/30, promotions 1 (points 0, commendations 0)`;
    // A save of a later age's turn loaded in the same launch: no turn drop, another letter.
    const stamped = [at("A3", "pass: A3 full"), at("A3", xp(5)), at("E50", "pass: E50 full"), at("E50", xp(9))].join("\n");
    const s = parseOurLog(stamped);
    assert.deepEqual([s.count, s.session, s.age, s.xp.map((x) => [x.turn, x.xp])], [2, 2, "E", [[50, 9]]]);
    assert.deepEqual(parseOurLog(stamped, { session: 1 }).xp.map((x) => [x.turn, x.xp]), [[3, 5]]);
    // Game 60's logs had no stamp: its gold lines' turns (140 -> 1 at the age change).
    const old = [at(null, "WARN gold: T139 balance 1"), at(null, xp(12)), at(null, "autopilot: TURN_ENDED []"), at(null, "WARN gold: T140 balance 1"),
        at(null, "autopilot: TURN_ENDED []"), at(null, "WARN gold: T1 balance 1"), at(null, xp(2))].join("\n");
    const u = parseOurLog(old);
    assert.deepEqual([u.count, u.age, u.xp.map((x) => [x.turn, x.xp])], [2, null, [[1, 2]]]);
    assert.deepEqual(parseOurLog(old, { session: 1 }).xp.map((x) => [x.turn, x.xp]), [[139, 12]]);
    // TURN_ENDED sent, the turn not ended: the next gold line has the same turn, one session.
    const refused = [at(null, "WARN gold: T67 balance 1"), at(null, "autopilot: TURN_ENDED []"), at(null, "WARN gold: T67 balance 1"), at(null, xp(3))].join("\n");
    assert.deepEqual([parseOurLog(refused).count, parseOurLog(refused).xp[0].turn], [1, 67]);
    // The CSV cut: a header stays with its session; a missing log has none.
    assert.deepEqual(sessionsOf("Turn, X\n5, a\n6, b\n1, c"), [["Turn, X", "5, a", "6, b"], ["1, c"]]);
    assert.deepEqual(sessionsOf(null), []);
    assert.equal(parseCombat("2,Unit vs Unit,(1)(1),0,9,Melee,(1)UNIT_WARRIOR,(1)UNIT_WARRIOR,20,20,0,0,1,1,N/A,0,(99)100,(99)100").length, 1, "a session's first row with no header before it");
});

test("ships by the game's data: Dhows, Tankwas, Galleons, the pirates' Corsairs, Cetbangs, Kalams, the Ottru and the Mikasa too; a land unit is none", () => {
    for (const t of ["UNIT_DHOW", "UNIT_DHOW_2", "UNIT_TANKWA", "UNIT_GALLEON", "UNIT_CORSAIR", "UNIT_CORSAIR_3", "UNIT_CETBANG", "UNIT_KALAM_2", "UNIT_OTTRU", "UNIT_MIKASA", "UNIT_GALLEY", "UNIT_FLEET_COMMANDER"]) assert.ok(isShip(t), t);
    for (const t of ["UNIT_WARRIOR", "UNIT_MAN_AT_ARMS", "UNIT_ARMY_COMMANDER", "UNIT_SCOUT", null]) assert.ok(!isShip(t), String(t));
    assert.ok(isShip("UNIT_MODDED_BIREME"), "a type no age's data names: by its name");
    // The scene leaves out a ship unless asked (the simulator has no water).
    const logs = readLogs(DIR);
    assert.ok(!unitsAt(logs, 2, { radius: 6 }).theirs.some((u) => u.type === "UNIT_CORSAIR"));
    assert.ok(unitsAt(logs, 2, { radius: 6, ships: true }).theirs.some((u) => u.type === "UNIT_CORSAIR"));
    // A soldier the movement log lost for a turn is packed with an Army Commander, not with a nearer Fleet Commander.
    const moves = ["Game Turn, Player, Unit ID, Category, Info", "4, 0, 7, MOVES, , 10:10(1/2)", "4, 0, 8, MOVES, , 10:11(1/2)", "4, 0, 9, MOVES, , 20:20(1/2)",
        "5, 0, 8, MOVES, , 10:11(1/2)", "5, 0, 9, MOVES, , 20:20(1/2)", "6, 0, 7, MOVES, , 11:10(1/2)", "6, 0, 8, MOVES, , 10:11(1/2)", "6, 0, 9, MOVES, , 20:20(1/2)"].join("\n");
    const packed = packedAt({ movement: parseMovement(moves), types: new Map([["0:7", "UNIT_WARRIOR"], ["0:8", "UNIT_FLEET_COMMANDER"], ["0:9", "UNIT_ARMY_COMMANDER"]]), map: { width: 40, height: 30, wrapX: false } }, 5);
    assert.deepEqual(packed.map((p) => [p.id, p.cmdr?.id]), [[7, 9]]);
    // The map: the last game configuration the units fit, else the smallest grid they fit.
    assert.equal(mapGrid('"SizeTypeName":{"type":"char8","value":"MAPSIZE_SMALL"}', 90, 50).size, "MAPSIZE_LARGE");
    assert.equal(mapGrid("", 10, 10).size, "MAPSIZE_TINY");
});
