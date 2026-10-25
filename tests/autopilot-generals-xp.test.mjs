// The generals chase their experience (game 60, research/game60's war review): a post kept where our units fight lately, the
// fights against independents given to a general below EXPERIENCE_MAX_BARB_LEVEL, closer trades in a general's radius, and
// each fight's XP in UI.log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 5 };
const SPARTA = { x: 12, y: 5 };
const CORINTH = { x: 5, y: 12 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 1 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...ATHENS, name: "Athens", happy: 2, prod: 10 },
        { owner: 0, ...SPARTA, name: "Sparta", happy: 2, prod: 10 },
        { owner: 0, ...CORINTH, name: "Corinth", happy: 2, prod: 10 },
        { owner: 1, x: 25, y: 15, name: "Babylon" },
    ],
    gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const orders = () => fake.sent.filter((s) => s.kind === "unit" || s.kind === "unitCommand");
const moveOf = (id) => orders().find((s) => s.id.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const at = (a) => (a ? [a.X, a.Y] : null);
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["enemies", "wars", "rangeTargets", "unitCommandResult", "unitCommandOk", "combat", "districtHealth", "indepRelation"]) delete world[k];
    Object.assign(world, extra);
};
const run = (options) => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: true, merchants: false, ...options });
const ids = (x, y) => MapUnits.getUnits(x, y);
const lines = async (fn) => {
    const saved = [console.warn, console.info];
    const out = [];
    console.warn = (...a) => out.push(a.join(" "));
    console.info = (...a) => out.push(a.join(" "));
    try {
        await fn();
    } finally {
        [console.warn, console.info] = saved;
    }
    return out;
};

// Game 60 A88-A98: Тула dropped out of the threats when our Warrior killed Вьядхапура's last Spearman, but our Slinger kept
// shooting its Army Commander beside Тула; the general walked to Самара, 6 turns away and walled at 171/200, and its XP stood
// at 28/45 for 11 turns while about 9 fights went on at Тула.
test("W4: a general keeps the settlement where our units fought lately; a far, barely damaged threat does not take it", () => {
    const turn = Game.turn;
    const commander = { x: 6, y: 5, owner: 5, type: "UNIT_ARMY_COMMANDER" };
    const corinth = [{ settlement: CORINTH, count: 2, land: 2, damaged: true, owners: [{ id: 5, independent: true }] }];
    try {
        Game.turn = 30;
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, { id: 2, type: "UNIT_SLINGER", x: 4, y: 5 }],
            { enemies: [commander], indepRelation: { 5: IndependentRelationship.HOSTILE }, districtHealth: (x, y) => (x === CORINTH.x && y === CORINTH.y ? 85 : 100) });
        // Our Slinger shoots the enemy commander next to Athens (the Combat event: attacker and defender).
        engine.trigger("Combat", { attacker: Players.get(0).Units.getUnits().find((u) => u.id.id === 2).id, defender: ids(commander.x, commander.y)[0] });
        run({ threats: corinth });
        assert.equal(moveOf(1), undefined, `stays at Athens: ${JSON.stringify(orders())}`);
        // Two turns later the fight is past FIGHT_MEMORY: it goes.
        Game.turn = 33;
        fake.sent.length = 0;
        run({ threats: corinth });
        assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], JSON.stringify(orders()));
        // Corinth's centre at half its health: worth the walk at once.
        Game.turn = 30;
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, { id: 2, type: "UNIT_SLINGER", x: 4, y: 5 }],
            { enemies: [commander], districtHealth: (x, y) => (x === CORINTH.x && y === CORINTH.y ? 50 : 100) });
        engine.trigger("Combat", { attacker: Players.get(0).Units.getUnits().find((u) => u.id.id === 2).id, defender: ids(commander.x, commander.y)[0] });
        run({ threats: corinth });
        assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y]);
    } finally {
        Game.turn = turn;
    }
});

// Game 60: from level 2 its fights against independents gave the general 1 XP each (48 fights, 54 XP); below, about 3.4.
test("W6: of two generals the one below level 2 takes the bigger fight against independents; a level-3 one counts it at a third", () => {
    const threats = [
        { settlement: SPARTA, count: 3, land: 3, owners: [{ id: 5, independent: true }] },
        { settlement: CORINTH, count: 2, land: 2, owners: [{ id: 5, independent: true }] },
    ];
    // The veteran listed first, as the game's unit list may give it.
    fresh([
        { id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, xp: { level: 3, points: 11, next: 60 } },
        { id: 2, type: "UNIT_ARMY_COMMANDER", x: 5, y: 6, xp: { level: 0, points: 0, next: 15 } },
    ]);
    run({ threats });
    assert.deepEqual([at(moveOf(2)), at(moveOf(1))], [[SPARTA.x, SPARTA.y], [CORINTH.x, CORINTH.y]], JSON.stringify(orders()));
});

test("W6: a level-3 general prefers a major's fight of 2 to an independents' fight of 3 (worth 1 XP a fight to it)", () => {
    const threats = [
        { settlement: SPARTA, count: 3, land: 3, owners: [{ id: 5, independent: true }] },
        { settlement: CORINTH, count: 2, land: 2, owners: [{ id: 1, independent: false }] },
    ];
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, xp: { level: 3, points: 11, next: 60 } }]);
    run({ threats });
    assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], JSON.stringify(orders()));
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, xp: { level: 0, points: 0, next: 15 } }]);
    run({ threats });
    assert.deepEqual(at(moveOf(1)), [SPARTA.x, SPARTA.y], "below the cap: the bigger fight");
});

test("W11: in the radius of a general below the cap, a 34-for-27 strike on an independent's raider pays; capped, it does not; a major's, it does", async () => {
    const raider = { x: 7, y: 5, owner: 5, type: "UNIT_WARRIOR" };
    const soldier = { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5 };
    const general = (level) => ({ id: 1, type: "UNIT_ARMY_COMMANDER", x: 6, y: 6, xp: { level, points: 0, next: 15 } });
    const struck = () => fake.sent.some((s) => s.id?.id === 2 && s.op === UnitOperationTypes.MOVE_TO && s.args?.X === raider.x);
    fresh([general(0), { ...soldier }], { enemies: [raider], combat: () => ({ dealt: 34, taken: 27 }) });
    await units.strikeRaiders();
    assert.ok(struck(), JSON.stringify(fake.sent));
    fresh([general(2), { ...soldier }], { enemies: [raider], combat: () => ({ dealt: 34, taken: 27 }) });
    await lines(() => units.strikeRaiders());
    assert.equal(struck(), false, "1 XP a fight from level 2: the plain trade (2 to 1)");
    fresh([general(2), { ...soldier }], { enemies: [{ ...raider, owner: 1 }], wars: [1], combat: () => ({ dealt: 34, taken: 27 }) });
    await units.strikeRaiders();
    assert.ok(struck(), "a major's soldier gives full XP at any level");
    // No general: the plain trade.
    fresh([{ ...soldier }], { enemies: [raider], combat: () => ({ dealt: 34, taken: 27 }) });
    await lines(() => units.strikeRaiders());
    assert.equal(struck(), false);
    assert.equal(units.strikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, dealt: 34, taken: 27, general: true }), true);
    assert.equal(units.strikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, dealt: 34, taken: 27 }), false);
    assert.equal(units.strikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, dealt: 25, taken: 15, general: true }), true);
    assert.equal(units.strikeWorthIt({ ourHealth: 70, ourMax: 100, theirHealth: 100, dealt: 25, taken: 15, general: true }), false, "keeps 55 of 100: below 0.6");
});

// The `fight:` line (data/xpl-unit-log.js) replaced the `xp: combat` probe: a general in its radius carries its XP when last
// read (`was`) beside its XP at the fight.
test("W6: each fight's XP: the fight line gives a general's XP when last read and at the fight, and a line after when it moved", async () => {
    const unitLog = await import("../mod/expansion-planner/ui/data/xpl-unit-log.js");
    unitLog.resetUnitLog();
    const raider = { x: 7, y: 5, owner: 1, type: "UNIT_WARRIOR" };
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, xp: { level: 1, points: 4, next: 30 } }, { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5 }], { wars: [1], enemies: [raider] });
    const out = await lines(async () => {
        Game.turn += 1;
        units.probeMilitary(); // the xp: probe reads it (L1 4)
        world.units[0].xp = { level: 1, points: 7, next: 30 }; // the game's award came before the event
        engine.trigger("Combat", { attacker: Players.get(0).Units.getUnits().find((u) => u.id.id === 2).id, defender: ids(raider.x, raider.y)[0] });
        world.units[0].xp = { level: 1, points: 8, next: 30 }; // ...or after it
        await new Promise((r) => setTimeout(r, 350));
    });
    const fight = out.find((l) => l.includes("fight: ours WARRIOR 2@6,5"));
    assert.match(fight ?? "", /melee; gen 1 r1 L1 7\/30( [VB])? was L1 4$/, JSON.stringify(out));
    // tools/unitmap.mjs reads it back (core parseFight): the general with its XP then and when last read.
    const { parseFight } = await import("../mod/expansion-planner/ui/core/xpl-unit-lines.js");
    const gen = parseFight(fight.replace(/^.*?fight: /, "fight: "))?.gens?.[0];
    assert.deepEqual([gen?.id, gen?.level, gen?.xp, gen?.next, gen?.was], [1, 1, 7, 30, { level: 1, xp: 4 }]);
    assert.ok(out.some((l) => /xp: after the fight T\d+: UNIT_ARMY_COMMANDER 0:1 XP L1 7 -> L1 8/.test(l)), JSON.stringify(out));
});
