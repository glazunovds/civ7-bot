// How the unit steps of game 60's packages act together in one pass (the review after the nine packages merged): one step
// must not take a unit another step planned for this pass, and a soldier that shields a general does not leave it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 13, y: 8 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
    ],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const VANGUARD = { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON, army: 3 };
const reset = (extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["enemies", "unitCommandResult", "armies", "wars", "indepRelation"]) delete world[k];
    Game.turn = 10;
    Object.assign(world, {
        armies: { "0:3": { ...LONDON, capacity: 4, unitCount: 0 } },
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_ADD_TO_ARMY" ? { Success: false, Plots: [idx(LONDON.x, LONDON.y)] } : undefined),
        wars: [5], indepRelation: { 5: IndependentRelationship.HOSTILE },
    }, extra);
};
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
const movesOf = (id) => fake.sent.filter((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO).map((s) => ({ x: s.args.X, y: s.args.Y }));

test("a rally walker standing by a threatened town takes the formation's post there, not the walk to the vanguard", () => {
    // Turn 9: York raided (remembered: the vanguard's army is called).
    reset({ enemies: [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }] });
    Game.turn = 9;
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD];
    run();
    // Turn 10, no raider: a free Spearman 3 tiles off walks to the vanguard (goal {rally}).
    Game.turn = 10;
    world.enemies = [];
    fake.sent.length = 0;
    const spear = { id: 5, type: "UNIT_SPEARMAN", x: 11, y: 8 };
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD, spear];
    let r = run();
    assert.ok(r.entries.some((e) => e.key === "VANGUARD_RALLY"), JSON.stringify(r.entries));
    // Turn 11: it stopped next to York (the walk was cut short), York's centre stands empty and a raider comes: the formation
    // puts it on the centre (HOLD), and the rally leaves it there.
    Game.turn = 11;
    fake.sent.length = 0;
    world.enemies = [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }];
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD, { ...spear, x: 12, y: 8 }];
    r = run();
    const moves = movesOf(5);
    assert.equal(moves.length, 1, JSON.stringify({ moves, entries: r.entries }));
    assert.deepEqual(moves[0], YORK, JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "FORMATION_HOLD"), JSON.stringify(r.entries));
});

// The fight simulator's raids60 after the merge: a general escaped (or was placed by its hunt) under a Warrior hurt 40-48, the
// Warrior withdrew in the same pass, and a raider caught the general alone (seeds 9 and 10).
test("a hurt soldier that shields a general on its tile stays under it (it rests there); without the general it withdraws", () => {
    const AT = { x: 20, y: 14 };
    const raider = { x: AT.x + 2, y: AT.y, owner: 5, type: "UNIT_WARRIOR" };
    const soldier = { id: 5, type: "UNIT_WARRIOR", ...AT, damage: 40 };
    for (const withGeneral of [true, false]) {
        reset({ enemies: [raider] });
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { ...soldier }, ...(withGeneral ? [{ ...VANGUARD, ...AT }] : [])];
        run();
        const moved = movesOf(5).filter((m) => !(m.x === AT.x && m.y === AT.y));
        if (withGeneral) {
            assert.deepEqual(moved, [], `it stays under the general: ${JSON.stringify(fake.sent.filter((s) => s.id?.id === 5))}`);
            assert.ok(fake.sent.some((s) => s.id?.id === 5 && s.op === "UNITOPERATION_REST_UNTIL_HEALED"), "it rests there");
        } else {
            assert.equal(moved.length, 1, `alone it steps away: ${JSON.stringify(fake.sent.filter((s) => s.id?.id === 5))}`);
        }
    }
});

test("a general under a healthy soldier in the open stays when that soldier is hit (the hit is the soldier's); alone it escapes", () => {
    const AT = { x: 20, y: 14 };
    const raider = { x: AT.x + 1, y: AT.y, owner: 5, type: "UNIT_WARRIOR" };
    for (const [hurt, leaves] of [[20, false], [60, true]]) {
        reset({ enemies: [raider] });
        const scene = (damage) => [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { ...VANGUARD, ...AT }, { id: 5, type: "UNIT_SPEARMAN", ...AT, damage, activity: UnitActivityTypes.SLEEP }];
        world.units = scene(0);
        run();
        // The soldier is struck the same turn (the end-of-turn retry sees it).
        world.units = scene(hurt);
        fake.sent.length = 0;
        const r = run();
        assert.equal(r.entries.some((e) => e.key === "COMMANDER_ESCAPED"), leaves, `soldier hurt ${hurt}: ${JSON.stringify(r.entries)}`);
    }
});

test("the vanguard's rally and a way off the plague never send two soldiers to one tile in a pass", () => {
    // Turn 9: York raided (the vanguard's army is called); turn 10 a free Spearman walks to it, and a Warrior on a plague tile
    // between them leaves it: each to its own tile.
    reset({ enemies: [{ x: YORK.x + 2, y: YORK.y, owner: 5, type: "UNIT_WARRIOR" }] });
    Game.turn = 9;
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD];
    run();
    Game.turn = 10;
    world.enemies = [];
    fake.sent.length = 0;
    const plague = new Set(["10,8", "10,7", "10,9", "11,7", "11,9", "9,7", "9,9"]);
    world.plotEffects = (x, y) => (plague.has(`${x},${y}`) ? ["PLOTEFFECT_PLAGUE"] : []);
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, VANGUARD, { id: 5, type: "UNIT_SPEARMAN", x: 11, y: 8 }, { id: 6, type: "UNIT_WARRIOR", x: 10, y: 8 }];
        const r = run();
        const a = movesOf(5)[0];
        const b = movesOf(6)[0];
        assert.ok(a && b, JSON.stringify({ a, b, entries: r.entries }));
        assert.notDeepEqual(a, b, JSON.stringify(r.entries));
    } finally {
        delete world.plotEffects;
    }
});
