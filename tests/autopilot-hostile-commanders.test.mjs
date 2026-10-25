// Hostile commanders and scouts (M2, game 60's E3, SC-6). Вьядхапура's Army Commander pillaged next to Тула every 2 turns
// T89-T139 (54 repairs, 1,408 gold): CORE_CLASS_SUPPORT, it was no raider, no strike or sortie target, no hunt's; only idle
// Slingers shot it. It does no damage back (CombatLog AttDmg 0). Hostile scouts walked 2-3 tiles from the capital, never struck.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Vyadhapura" }],
    cities: [{ owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 }],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const keys = (r) => r.entries.map((e) => e.key);
const reset = (enemies, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["combat", "rangeTargets", "villages", "unitCommandResult"]) delete world[k];
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
    Game.turn += 1;
    Object.assign(world, { enemies, villages: [{ owner: 5, x: 28, y: 22 }], wars: [5], indepRelation: { 5: IndependentRelationship.HOSTILE } }, extra);
};
const attacksOn = (at) => fake.sent.filter((s) => s.op === UnitOperationTypes.MOVE_TO && s.args?.Modifiers & UnitOperationMoveModifiers.ATTACK && s.args.X === at.x && s.args.Y === at.y);
const quiet = async (fn) => {
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

test("M2: a hostile commander alone is no threat: it buys no walls or guards", () => {
    reset([{ id: 800, x: 8, y: 10, owner: 5, type: "UNIT_ARMY_COMMANDER" }]);
    assert.deepEqual(units.threatenedSettlements(), []);
});

test("M2: a melee soldier strikes a lone hostile commander next to it when the preview says it takes nothing; not a poor trade", async () => {
    const cmdr = { id: 801, x: 9, y: 9, owner: 5, type: "UNIT_ARMY_COMMANDER" };
    reset([cmdr], { combat: () => ({ dealt: 30, taken: 0 }) });
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 9, y: 10 });
    assert.equal(dist(cmdr, { x: 9, y: 10 }), 1);
    const r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "STRUCK"), JSON.stringify(r.entries));
    assert.equal(attacksOn(cmdr).length, 1);
    // A hurt Warrior too (40 of 100 left: no other strike keeps half its health): the commander strikes nothing back.
    reset([cmdr], { combat: () => ({ dealt: 30, taken: 0 }) });
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 9, y: 10, damage: 60 });
    await units.strikeRaiders();
    assert.equal(attacksOn(cmdr).length, 1, "hurt, but it takes nothing");
    reset([cmdr], { combat: () => ({ dealt: 8, taken: 5 }) });
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 9, y: 10 });
    await quiet(() => units.strikeRaiders());
    assert.equal(attacksOn(cmdr).length, 0, "8 for 5: neither nothing taken nor twice dealt");
});

test("M2: a sortie goes out to a hostile commander 2 tiles off; a fortified ranged guard shoots one after any soldier", async () => {
    const cmdr = { id: 802, x: 8, y: 11, owner: 5, type: "UNIT_ARMY_COMMANDER" };
    reset([cmdr], { combat: () => ({ dealt: 30, taken: 0 }) });
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 8, y: 9 });
    assert.equal(dist(cmdr, { x: 8, y: 9 }), 2);
    const r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "SORTIE"), JSON.stringify(r.entries));
    // An Archer on London's centre, on guard: it shoots the commander, a soldier first when both are in range.
    const soldier = { id: 803, x: 9, y: 10, owner: 5, type: "UNIT_WARRIOR" };
    reset([cmdr], { rangeTargets: (id) => (id.id === 3 ? world.enemies.map((e) => ({ x: e.x, y: e.y })) : []) });
    world.units = [{ id: 3, type: "UNIT_ARCHER", ...LONDON, activity: UnitActivityTypes.SLEEP, ranged: 20, melee: 10 }];
    let shots = (await units.strikeRaiders()).entries.filter((e) => e.key === "RANGED");
    assert.deepEqual(shots.map((e) => [e.args[1], e.args[2]]), [[cmdr.x, cmdr.y]]);
    reset([cmdr, soldier], { rangeTargets: (id) => (id.id === 3 ? world.enemies.map((e) => ({ x: e.x, y: e.y })) : []) });
    world.units = [{ id: 3, type: "UNIT_ARCHER", ...LONDON, activity: UnitActivityTypes.SLEEP, ranged: 20, melee: 10 }];
    shots = (await units.strikeRaiders()).entries.filter((e) => e.key === "RANGED");
    assert.deepEqual(shots.map((e) => [e.args[1], e.args[2]]), [[soldier.x, soldier.y]]);
});

test("M2: a hostile commander is danger for a scout, and a raider hunt's target", async () => {
    const cmdr = { id: 804, x: 12, y: 8, owner: 5, type: "UNIT_ARMY_COMMANDER" };
    reset([cmdr]);
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 4, type: "UNIT_SCOUT", x: 11, y: 8 }];
    const r = units.commandUnits(DEFAULT_SETTINGS, { explore: true, defend: false, threats: [], fronts: [], exposed: [] });
    const away = r.entries.find((e) => e.key === "UNIT_AWAY");
    assert.ok(away, JSON.stringify(r.entries));
    assert.ok(dist({ x: away.args[1], y: away.args[2] }, cmdr) > 1);
    // 4 tiles from London, the free soldiers and the general hunt it.
    reset([{ ...cmdr }]);
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 10, y: 9 }, { id: 3, type: "UNIT_SPEARMAN", x: 10, y: 7 }, { id: 9, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8 }];
    let hunt = null;
    await quiet(() => {
        hunt = units.commandUnits(DEFAULT_SETTINGS, { defend: true, huntRaiders: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
    });
    assert.ok(keys(hunt).includes("RAIDER_HUNT_STARTED"), JSON.stringify(hunt.entries));
    assert.equal(units.fieldOpState()?.enemyCount, 1, "the commander is the one hunted");
});

// The merge of the war package with the scouts' (game 60, SCM-2): a hostile commander counts only when we see it, like every
// other hostile unit (data/xpl-seen-units.js unitsSeenAt): no danger for a scout, no line in the probe.
test("M2 with SCM-2: a hostile commander in fog is no danger for a scout, and the probe does not name it", async () => {
    const cmdr = { id: 808, x: 12, y: 8, owner: 5, type: "UNIT_ARMY_COMMANDER", seen: false };
    reset([cmdr]);
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 4, type: "UNIT_SCOUT", x: 11, y: 8 }];
    const r = units.commandUnits(DEFAULT_SETTINGS, { explore: true, defend: false, threats: [], fronts: [], exposed: [] });
    assert.ok(!r.entries.some((e) => e.key === "UNIT_AWAY"), JSON.stringify(r.entries));
    reset([{ ...cmdr, x: 8, y: 10 }]);
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 8, y: 9 });
    const out = await quiet(() => units.probeMilitary());
    assert.ok(!out.some((l) => /hostile commander:/.test(l)), JSON.stringify(out));
    // Seen, it is both (the M2 tests above).
    reset([{ ...cmdr, x: 8, y: 10, seen: true }]);
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 8, y: 9 });
    assert.ok((await quiet(() => units.probeMilitary())).some((l) => /hostile commander: p5 UNIT_ARMY_COMMANDER at 8,10/.test(l)));
});

test("M2's probe: a hostile commander near us, its army, and whether the game offers our soldiers an attack on it", async () => {
    reset([{ id: 805, x: 8, y: 10, owner: 5, type: "UNIT_ARMY_COMMANDER" }]);
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 8, y: 9 });
    const out = await quiet(() => units.probeMilitary());
    assert.ok(out.some((l) => /hostile commander: p5 UNIT_ARMY_COMMANDER at 8,10 2 tile\(s\) from London: army \?, damage 0; attack offered \[UNIT_WARRIOR yes\]; overrun offered \[no army of ours packed\]/.test(l)), JSON.stringify(out));
});

test("SC-6: a hostile scout near us is a sortie target only in a general's radius, one a pass", async () => {
    const scout = { id: 806, x: 8, y: 11, owner: 5, type: "UNIT_SCOUT" };
    const other = { id: 807, x: 5, y: 8, owner: 5, type: "UNIT_SCOUT" };
    reset([scout], { combat: () => ({ dealt: 50, taken: 5 }) });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_WARRIOR", x: 8, y: 9 }];
    await quiet(() => units.strikeRaiders());
    assert.equal(attacksOn(scout).length, 0, "no general near: it walks by");
    reset([scout, other], { combat: () => ({ dealt: 50, taken: 5 }) });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_WARRIOR", x: 8, y: 9 }, { id: 3, type: "UNIT_WARRIOR", x: 7, y: 8 },
        { id: 9, type: "UNIT_ARMY_COMMANDER", x: 7, y: 9 },
    ];
    assert.ok(dist({ x: 7, y: 9 }, { x: 8, y: 9 }) <= 1 && dist({ x: 7, y: 9 }, { x: 7, y: 8 }) <= 1);
    assert.ok(dist(scout, { x: 8, y: 9 }) === 2 && dist(other, { x: 7, y: 8 }) === 2, "each Warrior reaches a scout");
    const r = await units.strikeRaiders();
    assert.equal(r.entries.filter((e) => e.key === "SORTIE").length, 1, JSON.stringify(r.entries));
});
