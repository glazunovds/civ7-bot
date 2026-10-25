// Our units, the hostile units near us and every fight of ours in UI.log (the user, after game 60: "log our and close enemy
// units position for later war improvements"; core/xpl-unit-lines.js, data/xpl-unit-log.js). Game 60's review: no log rebuilt
// a fight turn by turn, the `xp: combat` probe logged 40 of the 110 fights of ours in T50-T100 (a commander within 2 tiles,
// 12 a turn), and our lines carried no turn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { UNITS_LINE, fitUnitsLine, formatFight, formatUnitsLine, joinParts, parseFight, parseUnitsLine, readLine, unitsLineDue } from "../mod/expansion-planner/ui/core/xpl-unit-lines.js";

const ATHENS = { x: 5, y: 5 };
const PELLA = { x: 11, y: 5 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, ...(world.fog?.has(`${x},${y}`) ? { revealed: false } : {}) }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 9, isIndependent: true, name: "Kermans" }],
    cities: [{ owner: 0, ...ATHENS, name: "Athens" }, { owner: 0, ...PELLA, name: "Pella", isTown: true }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const unitLog = await import("../mod/expansion-planner/ui/data/xpl-unit-log.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const capture = async (fn) => {
    const lines = [];
    const [warn, error] = [console.warn, console.error];
    console.warn = (...a) => lines.push(a.join(" "));
    console.error = (...a) => lines.push(a.join(" "));
    try {
        await fn();
    } finally {
        [console.warn, console.error] = [warn, error];
    }
    return lines;
};
// The messages of our lines, their parts joined (as tools/unitmap.mjs reads UI.log).
const messages = (lines) => joinParts(lines.map(readLine));
const ofKind = (lines, kind) => messages(lines).filter((m) => m.text.startsWith(`${kind}: `));

const OURS = () => [
    { id: 2, type: "UNIT_SPEARMAN", ...PELLA },
    { id: 3, type: "UNIT_WARRIOR", x: 6, y: 5, activity: UnitActivityTypes.SLEEP },
    { id: 4, type: "UNIT_ARCHER", x: 10, y: 6, damage: 30, activity: UnitActivityTypes.OPERATION, dest: { x: 10, y: 4 } },
    { id: 51, type: "UNIT_ARMY_COMMANDER", ...PELLA, army: 151, xp: { level: 2, points: 11, next: 45 } },
    { id: 5, type: "UNIT_WARRIOR", x: -9999, y: -9999, onMap: false, army: 151, damage: 10 },
];
const THEIRS = () => [
    { id: 900, owner: 9, type: "UNIT_ARCHER", x: 13, y: 5, damage: 20 },
    { id: 901, owner: 9, type: "UNIT_WARRIOR", x: 14, y: 6, hidden: true },     // in fog on a tile we see: unseen
    { id: 902, owner: 9, type: "UNIT_WARRIOR", x: 12, y: 3 },                   // its tile hidden (world.fog): unseen
    { id: 903, owner: 9, type: "UNIT_SCOUT", x: 12, y: 7 },                     // a scout: listed, never counted unseen
    { id: 904, owner: 9, type: "UNIT_WARRIOR", x: 30, y: 15 },                  // far from us
    { id: 910, owner: 1, type: "UNIT_WARRIOR", x: 5, y: 7 },                    // Rome's: listed only while at war
];
const fresh = (extra = {}) => {
    unitLog.resetUnitLog();
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "fog", "plotEffects", "districtHealth", "commandRadius", "indepRelation", "unitCanStart", "unreachable"]) delete world[k];
    world.units = OURS();
    world.enemies = THEIRS();
    world.fog = new Set(["12,3"]);
    world.armies = { "0:151": { x: PELLA.x, y: PELLA.y, capacity: 4, unitCount: 1 } };
    Object.assign(world, extra);
};

test("the lines' format: units with their flags, commanders with level, XP, role and packed soldiers, theirs by owner; read back, through UI.log's parts too", async () => {
    const s = {
        ours: [{ type: "UNIT_WARRIOR", id: 851977, x: 65, y: 9, act: "F" }, { type: "UNIT_SLINGER", id: 1179654, x: 65, y: 12, d: 38, act: "O", to: { x: 65, y: 11 }, hazard: true }],
        cmdrs: [{ type: "UNIT_ARMY_COMMANDER", id: 262146, x: 69, y: 7, level: 2, xp: 11, next: 45, role: "VANGUARD", packed: [{ type: "UNIT_WARRIOR", id: 1310735, x: null, y: null, d: 10 }] }],
        theirs: [{ owner: 28, type: "UNIT_WARRIOR", id: 327680, x: 64, y: 12, afloat: true }, { owner: 28, type: "UNIT_ARCHER", id: 393216, x: 64, y: 11, d: 27 }],
        unseen: 2, centres: [{ x: 65, y: 9, health: 190, max: 200, walled: true }],
    };
    const line = formatUnitsLine(s);
    assert.equal(line, "units: ours 2 [WARRIOR 851977@65,9 F; SLINGER 1179654@65,12 d38 O>65,11 P]; cmdrs [ARMY_COMMANDER 262146@69,7 L2 11/45 V {WARRIOR 1310735@- d10}]; theirs 2 [p28 WARRIOR 327680@64,12 ~; p28 ARCHER 393216@64,11 d27]; unseen 2; centres [65,9 190/200 W]");
    const back = parseUnitsLine(line);
    assert.deepEqual(back.ours.map((u) => [u.type, u.id, u.x, u.y, u.d, u.act, u.to, u.hazard]), [["UNIT_WARRIOR", 851977, 65, 9, 0, "F", null, false], ["UNIT_SLINGER", 1179654, 65, 12, 38, "O", { x: 65, y: 11 }, true]]);
    assert.deepEqual([back.cmdrs[0].level, back.cmdrs[0].xp, back.cmdrs[0].next, back.cmdrs[0].role], [2, 11, 45, "VANGUARD"]);
    assert.deepEqual(back.cmdrs[0].packed.map((m) => [m.id, m.x, m.d]), [[1310735, null, 10]]);
    assert.deepEqual(back.theirs.map((u) => [u.owner, u.type, u.id, u.afloat, u.d]), [[28, "UNIT_WARRIOR", 327680, true, 0], [28, "UNIT_ARCHER", 393216, false, 27]]);
    assert.deepEqual([back.unseen, back.centres], [2, [{ x: 65, y: 9, health: 190, max: 200, walled: true }]]);
    // A big war: 60 of ours and 30 of theirs go out in numbered parts (each stamped) and come back whole.
    const big = {
        ours: Array.from({ length: 60 }, (_, i) => ({ type: i % 2 ? "UNIT_WARRIOR" : "UNIT_SLINGER", id: 458756 + 65537 * i, x: 60 + (i % 15), y: 5 + (i % 9), d: i % 3 ? 0 : 25 })),
        cmdrs: [], theirs: Array.from({ length: 30 }, (_, i) => ({ owner: 28 + (i % 3), type: "UNIT_WARRIOR", id: 131072 + 65537 * i, x: 70, y: i })), unseen: 0, centres: [],
    };
    globalThis.Game.turn = 67;
    const { log } = await import("../mod/expansion-planner/ui/services/xpl-log.js");
    const lines = await capture(() => log.info(formatUnitsLine(big)));
    assert.ok(lines.length >= 2 && lines.every((l) => /^\[XPL\] A67 /.test(l)), lines.map((l) => l.slice(0, 16)).join(" | "));
    const joined = messages(lines);
    assert.equal(joined.length, 1);
    assert.equal(joined[0].turn, 67);
    const again = parseUnitsLine(joined[0].text);
    assert.deepEqual([again.ours.length, again.theirs.length], [60, 30]);
    // Within UNITS_LINE.PARTS_MAX parts: our units farthest from theirs are counted only.
    const huge = { ...big, ours: Array.from({ length: 400 }, (_, i) => ({ type: "UNIT_WARRIOR", id: 1000 + i, x: i % 80, y: i % 50, near: i })) };
    const fitted = fitUnitsLine(huge);
    assert.ok(fitted.length <= UNITS_LINE.PARTS_MAX * UNITS_LINE.LINE_MAX, String(fitted.length));
    const kept = parseUnitsLine(fitted);
    assert.equal(kept.ours.length + kept.far, 400);
    assert.ok(kept.ours.every((u) => u.id < 1000 + kept.ours.length), "the nearest kept");
    // A review's x.txt line keeps its own turn unless the line carries one.
    assert.deepEqual([readLine("A66 16:51:18 autopilot: WITHDRAW").turn, readLine("A66 16:51:18 A67 WARN fight: x").turn, readLine("A66 16:51:18 A67 WARN fight: x").level], [66, 67, "WARN"]);
    assert.equal(readLine("[2026-10-24 16:51:18]\tJS Error"), null);
});

test("when the units line is written: every turn while theirs are near or we fought the turn before; else when our army changes, every 10 turns, after a load and when the turn went back", () => {
    const last = { turn: 50, army: "1,2" };
    assert.equal(unitsLineDue({ turn: 51, last: null, army: "1,2" }), "FIRST");
    assert.equal(unitsLineDue({ turn: 51, last, army: "1,2", hostiles: 1 }), "HOSTILES");
    assert.equal(unitsLineDue({ turn: 51, last, army: "1,2", unseen: 1 }), "HOSTILES");
    assert.equal(unitsLineDue({ turn: 51, last, army: "1,2", foughtLastTurn: true }), "FOUGHT");
    assert.equal(unitsLineDue({ turn: 51, last, army: "1,2,3" }), "ARMY");
    assert.equal(unitsLineDue({ turn: 51, last, army: "1,2" }), null);
    assert.equal(unitsLineDue({ turn: 59, last, army: "1,2" }), null);
    assert.equal(unitsLineDue({ turn: 60, last, army: "1,2" }), "QUIET");
    assert.equal(unitsLineDue({ turn: 3, last, army: "1,2" }), "BACK");
});

test("the units line in game: our soldiers by id (plague, activity, destination), the commander with its packed soldier, theirs we see within 6 of our settlements, those we do not only counted; damaged centres", async () => {
    fresh({ plotEffects: (x, y) => (x === 6 && y === 5 ? ["PLOTEFFECT_PLAGUE"] : []), districtHealth: (x, y) => (x === PELLA.x && y === PELLA.y ? 60 : 100) });
    Game.turn = 5;
    let why = null;
    const lines = await capture(() => {
        why = unitLog.snapshotUnits();
    });
    assert.equal(why, "FIRST");
    const [line] = ofKind(lines, "units");
    assert.ok(line, lines.join("\n"));
    const s = parseUnitsLine(line.text);
    const ours = Object.fromEntries(s.ours.map((u) => [u.id, u]));
    assert.deepEqual(Object.keys(ours).map(Number).sort(), [2, 3, 4], "soldiers on the map; the packed one under its commander");
    assert.deepEqual([ours[3].act, ours[3].hazard], ["F", true], "asleep on the plague");
    assert.deepEqual([ours[4].d, ours[4].act, ours[4].to], [30, "O", { x: 10, y: 4 }]);
    assert.deepEqual([s.cmdrs[0].id, s.cmdrs[0].x, s.cmdrs[0].level, s.cmdrs[0].xp, s.cmdrs[0].next, s.cmdrs[0].role], [51, PELLA.x, 2, 11, 45, "VANGUARD"]);
    assert.deepEqual(s.cmdrs[0].packed.map((m) => [m.id, m.d]), [[5, 10]]);
    // Theirs: the archer and the village's scout (any class); not the one in fog, nor on a hidden tile, nor the far one, nor
    // Rome's (no war).
    assert.deepEqual(s.theirs.map((u) => [u.owner, u.id, u.x, u.y, u.d]).sort((a, b) => a[1] - b[1]), [[9, 900, 13, 5, 20], [9, 903, 12, 7, 0]]);
    assert.equal(s.unseen, 2, "the warrior in fog and the one on a hidden tile: counted, never placed");
    assert.deepEqual(s.centres, [{ x: PELLA.x, y: PELLA.y, health: 60, max: 100, walled: false }]);
    assert.ok(ofKind(lines, "places")[0]?.text.includes(`settlements [${ATHENS.x},${ATHENS.y} C Athens|${PELLA.x},${PELLA.y} T Pella]`), lines.join("\n"));
    // Once a turn.
    assert.deepEqual(await capture(() => unitLog.snapshotUnits()), []);
    // At war with Rome: its warrior near Athens is listed too.
    Game.turn = 6;
    world.wars = [1];
    const next = ofKind(await capture(() => unitLog.snapshotUnits()), "units");
    assert.ok(parseUnitsLine(next[0].text).theirs.some((u) => u.owner === 1 && u.id === 910));
});

test("a soldier off the map is packed only under the commander whose valid army holds it: none with no army (two invalid ids are equal), R on its way as a reinforcement", async () => {
    fresh({ enemies: [] });
    Game.turn = 8;
    world.units = [
        ...OURS(),
        // A second commander with no army (an invalid id), listed first: the old match put every army-less soldier off the map under it.
        { id: 52, type: "UNIT_ARMY_COMMANDER", ...ATHENS, army: -1 },
        { id: 6, type: "UNIT_WARRIOR", x: -9999, y: -9999, onMap: false, army: -1 },
        // On its way to the army of commander 51 (its army's id already, as the armies' tests have it): not packed yet.
        { id: 8, type: "UNIT_SPEARMAN", x: -1, y: -1, onMap: false, army: 151, reinforcing: { to: 151, eta: 2, from: ATHENS } },
    ];
    world.units.sort((a, b) => (a.id === 52 ? -1 : b.id === 52 ? 1 : 0));
    const [line] = ofKind(await capture(() => unitLog.snapshotUnits()), "units");
    const s = parseUnitsLine(line?.text ?? "");
    const cmdr = (id) => s.cmdrs.find((c) => c.id === id);
    assert.deepEqual(cmdr(52)?.packed, [], line?.text);
    assert.deepEqual(cmdr(51)?.packed.map((m) => m.id), [5], "the one packed in its army");
    const ours = Object.fromEntries(s.ours.map((u) => [u.id, u]));
    assert.deepEqual([ours[6]?.x, ours[6]?.act], [null, null], "off the map, in no army");
    assert.deepEqual([ours[8]?.x, ours[8]?.act, ours[8]?.to], [null, "R", { x: PELLA.x, y: PELLA.y }], "toward its commander's army at Pella");
});

test("in peace the units line waits: written again when our army changes or after 10 turns; a fight of ours makes the next turn's", async () => {
    fresh({ enemies: [] });
    Game.turn = 20;
    await capture(() => unitLog.snapshotUnits());
    const at = async (turn) => {
        Game.turn = turn;
        return ofKind(await capture(() => unitLog.snapshotUnits()), "units").length;
    };
    assert.equal(await at(21), 0, "nothing near, nothing changed");
    world.units.push({ id: 6, type: "UNIT_SLINGER", ...ATHENS });
    assert.equal(await at(22), 1, "a new soldier");
    assert.equal(await at(23), 0);
    // A fight of ours on turn 23 (after the turn's start): the line comes on turn 24.
    world.enemies = [{ id: 950, owner: 9, type: "UNIT_WARRIOR", x: 30, y: 15 }];
    await capture(() => engine.trigger("Combat", { attacker: { owner: 9, id: 950, type: 1 }, defender: { owner: 0, id: 6, type: 1 } }));
    world.enemies = [];
    assert.equal(await at(24), 1, "we fought last turn");
    assert.equal(await at(25), 0);
    assert.equal(await at(34), 1, "10 turns since the last");
});

test("a fight line for every Combat event of ours: both sides' ids, tiles and damage, the kind, and our generals whose radius held our unit with their XP; 40 a turn, the rest counted", async () => {
    fresh();
    Game.turn = 30;
    // The village's archer shoots our Spearman in Pella; the commander stands 9 tiles away (no fight is skipped for that:
    // the xp: combat probe skipped it).
    world.units = OURS().map((u) => (u.id === 51 ? { ...u, x: 2, y: 12 } : u));
    let lines = await capture(() => engine.trigger("Combat", { attacker: { owner: 9, id: 900, type: 1 }, defender: { owner: 0, id: 2, type: 1 } }));
    const [line] = ofKind(lines, "fight");
    assert.equal(line?.text, `fight: p9 ARCHER 900@13,5 d20 > ours SPEARMAN 2@${PELLA.x},${PELLA.y} ranged; gen none`, lines.join("\n"));
    assert.equal(line.turn, 30);
    // With the commander on Pella and its radius (the game's) over Pella: its id, distance, level, XP and role.
    world.units = OURS();
    world.commandRadius = (id) => (id?.id === 51 ? [PELLA, { x: 10, y: 5 }].map((p) => GameplayMap.getIndexFromXY(p.x, p.y)) : []);
    lines = await capture(() => engine.trigger("Combat", { attacker: { owner: 0, id: 2, type: 1 }, defender: { owner: 9, id: 900, type: 1 } }));
    const f = parseFight(ofKind(lines, "fight")[0]?.text ?? "");
    assert.deepEqual([f?.att.ours, f?.att.id, f?.def.owner, f?.def.id, f?.kind], [true, 2, 9, 900, "melee"]);
    assert.deepEqual(f?.gens, [{ id: 51, r: 0, level: 2, xp: 11, next: 45, role: "VANGUARD" }]);
    // The archer at 10,6 is outside the game's radius (Pella and 10,5 only), though 1 tile away.
    lines = await capture(() => engine.trigger("Combat", { attacker: { owner: 0, id: 4, type: 1 }, defender: { owner: 9, id: 900, type: 1 } }));
    assert.match(ofKind(lines, "fight")[0]?.text ?? "", /^fight: ours ARCHER 4@10,6 d30 > p9 ARCHER 900@13,5 d20 ranged; gen none$/);
    // Not ours: nothing.
    assert.deepEqual(await capture(() => engine.trigger("Combat", { attacker: { owner: 9, id: 900, type: 1 }, defender: { owner: 1, id: 910, type: 1 } })), []);
    // 40 lines a turn; the rest are counted at the next turn's start.
    Game.turn = 31;
    lines = await capture(() => {
        for (let i = 0; i < UNITS_LINE.FIGHTS_MAX + 3; i++) engine.trigger("Combat", { attacker: { owner: 9, id: 900, type: 1 }, defender: { owner: 0, id: 2, type: 1 } });
    });
    assert.equal(ofKind(lines, "fight").length, UNITS_LINE.FIGHTS_MAX);
    Game.turn = 32;
    lines = await capture(() => unitLog.snapshotUnits());
    assert.ok(lines.some((l) => /^\[XPL\] A32 fights: 3 more of ours on A31 not logged/.test(l)), lines.join("\n"));
});

test("the unit loop's orders name their unit and the tile it stood on (entryUnit): UI.log's `autopilot:` line carries them", async () => {
    fresh({ wars: [1], enemies: [{ id: 920, owner: 1, type: "UNIT_WARRIOR", x: 10, y: 5 }] });
    world.units = [{ id: 7, type: "UNIT_WARRIOR", x: 8, y: 5, damage: 40 }];
    let r = null;
    await capture(() => {
        r = units.commandUnits(DEFAULT_SETTINGS, { defend: true });
    });
    const e = r.entries.find((x) => x.key === "WITHDRAW");
    assert.ok(e, JSON.stringify(r.entries));
    assert.deepEqual(units.entryUnit(e), { id: 7, at: { x: 8, y: 5 } });
    assert.deepEqual(Object.keys(e), ["key", "args"], "the entry itself keeps its shape (the tab's log)");
    assert.equal(units.entryUnit({ key: "X", args: [] }), null);
});

test("with two units in the loop an order names the unit that made it, not the next one; MADE_ROOM names the neighbour that stepped out", async () => {
    // Unit 7, hurt next to a raider, withdraws; unit 8, healthy far away, comes after it in the loop.
    fresh({ wars: [1], enemies: [{ id: 920, owner: 1, type: "UNIT_WARRIOR", x: 10, y: 5 }] });
    world.units = [{ id: 7, type: "UNIT_WARRIOR", x: 8, y: 5, damage: 40 }, { id: 8, type: "UNIT_WARRIOR", x: 30, y: 15 }];
    let r = null;
    await capture(() => {
        r = units.commandUnits(DEFAULT_SETTINGS, { defend: true });
    });
    const e = r.entries.find((x) => x.key === "WITHDRAW");
    assert.ok(e, JSON.stringify(r.entries));
    assert.deepEqual(units.entryUnit(e), { id: 7, at: { x: 8, y: 5 } });
    for (const x of r.entries.filter((y) => y !== e && units.entryUnit(y))) assert.notEqual(units.entryUnit(x).id, 7, JSON.stringify(x));
    // Boxed in at Athens by our own soldiers (one free tile two steps out the stacked ones cannot reach): a neighbour steps out.
    const at = (i) => GameplayMap.getLocationFromIndex(i);
    const isAthens = (l) => l.x === ATHENS.x && l.y === ATHENS.y;
    const around = GameplayMap.getPlotIndicesInRadius(ATHENS.x, ATHENS.y, 3).map(at).filter((l) => !isAthens(l));
    const free = around.find((l) => GameplayMap.getPlotDistance(l.x, l.y, ATHENS.x, ATHENS.y) === 2);
    const guards = around.filter((l) => !(l.x === free.x && l.y === free.y)).map((l, i) => ({ id: 100 + i, type: "UNIT_WARRIOR", x: l.x, y: l.y, activity: UnitActivityTypes.SLEEP }));
    const stacked = (id) => id.id === 3 || id.id === 4;
    fresh({
        enemies: [],
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
        unreachable: (x, y, id) => stacked(id) && x === free.x && y === free.y,
    });
    world.units = [{ id: 3, type: "UNIT_ARCHER", ...ATHENS }, { id: 4, type: "UNIT_WARRIOR", ...ATHENS }, ...guards];
    await capture(() => {
        r = units.commandUnits(DEFAULT_SETTINGS, { defend: true });
    });
    const made = r.entries.find((x) => x.key === "MADE_ROOM");
    const shove = fake.sent.find((s) => s.kind === "unit" && s.op === UnitOperationTypes.MOVE_TO);
    assert.ok(made && shove, JSON.stringify(r.entries));
    const mover = guards.find((g) => g.id === shove.id.id);
    assert.deepEqual(units.entryUnit(made), { id: mover.id, at: { x: mover.x, y: mover.y } });
});

test("each pass starts with a `pass:` line (full, repeat, or a step asked for), then the turn's units line; an order's line names its unit", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    fresh({ wars: [1], enemies: [{ id: 920, owner: 1, type: "UNIT_WARRIOR", x: 10, y: 5 }] });
    world.units = [{ id: 7, type: "UNIT_WARRIOR", x: 8, y: 5, damage: 40 }];
    Game.turn = 40;
    settings.patch({ autopilot: { defend: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, production: false, wonders: false, purchases: false, choices: false, befriend: false, growth: false, towns: false, resources: false, tacks: false } });
    try {
        const lines = await capture(() => autopilot.runTurn(true));
        const ours = messages(lines);
        assert.equal(ours[0]?.text, "pass: A40 step", lines.slice(0, 3).join("\n"));
        assert.equal(ours[0].turn, 40);
        assert.ok(ofKind(lines, "units").length === 1, "the turn's units line");
        assert.ok(ours.some((m) => /^autopilot: WITHDRAW \[.*\] u7 from 8,5$/.test(m.text)), ours.map((m) => m.text).filter((t) => t.startsWith("autopilot:")).join("\n"));
        // The game activates our turn again (gotcha 35): a repeat pass, no second units line.
        state.set({ autopilot: { ...state.get().autopilot, enabled: true } });
        const again = await capture(() => autopilot.runTurn());
        assert.equal(messages(again)[0]?.text, "pass: A40 repeat");
        assert.equal(ofKind(again, "units").length, 0);
    } finally {
        state.set({ autopilot: { ...state.get().autopilot, enabled: false } });
        settings.patch({ autopilot: { defend: false } });
    }
});
