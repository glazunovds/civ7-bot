// Research/37 Phase 4: formations. The soldiers already at a threatened settlement improve their posts after planDefence
// has decided who goes where: a melee unit holds the centre, melee units screen each approach (raiders far apart make two
// sectors), ranged units stand within range of a raider and not next to one, and the commander stands where its radius
// covers the most of them, never onto water or next to a raider. Nobody moves for a small gain, a fortified soldier only
// for one worth its fortification, and the unit on the centre never leaves it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
const FLAT = { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 };
const world = {
    width: 34, height: 26, wrapX: false,
    // world.map(x, y): a test's own tiles around York (else flat land of ours)
    tiles: (x, y) => world.map?.(x, y) ?? FLAT,
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
    ],
    units: [], gold: 1000, goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { FORM, commanderTile, planFormation, sectorsOf } = await import("../mod/expansion-planner/ui/core/xpl-formation.js");

// The fake's hex grid around York (16,8): its ring 1 is 17,8 15,8 16,7 15,7 16,9 15,9.
const d = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const at = (x, y) => ({ x, y });
const raider = (x, y) => ({ x, y, owner: 5, type: "UNIT_WARRIOR" });
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "map", "unitCanStart", "unreachable", "armies", "villages", "commandRadius"]) delete world[k];
    world.units = [];
    Game.turn = 10;
    Object.assign(world, extra);
};
// One pass of unit orders with «Оборона», UI.log's lines kept.
const run = () => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });
        return { ...r, lines };
    } finally {
        console.warn = warn;
    }
};
const movesOf = (id) => fake.sent.filter((s) => s.op === "UNITOPERATION_MOVE_TO" && s.id.id === id).map((s) => at(s.args.X, s.args.Y));
const formationKeys = (r) => r.entries.filter((e) => e.key.startsWith("FORMATION_")).map((e) => e.key);

test("sectors: raiders within SECTOR_LINK of each other come by one approach; on opposite sides they make two, the largest first", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    assert.deepEqual(sectorsOf([at(3, 0), at(4, 0), at(-3, 0)], line).map((s) => s.length), [2, 1]);
    assert.deepEqual(sectorsOf([at(3, 0), at(5, 0), at(7, 0)], line).map((s) => s.length), [3], "a chain within the link is one approach");
    assert.deepEqual(sectorsOf([], line), []);
});

test("the commander never stands next to a land raider, even where its radius would cover the most (research/37 §6B: protected)", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    // Six soldiers within 2 of 3,0, a raider at 4,0 next to it; the commander (radius 2) at -3,0 covers none of them.
    const f = { centre: at(0, 0), land: [at(4, 0)], targets: [at(4, 0)], sectors: [[at(4, 0)]], members: [], dist: line };
    const soldiers = [at(2, 0), at(3, 1), at(3, -1), at(2, 1), at(2, -1), at(3, 2)];
    const tiles = [at(3, 0), at(1, 0), at(0, 0)];
    const pick = commanderTile(f, { at: at(-3, 0), radius: 2 }, soldiers, tiles, () => true);
    assert.notDeepEqual(pick?.to, at(3, 0), "3,0 covers all six (+120, -40 next to the raider) but stands next to it");
    assert.deepEqual(pick?.to, at(1, 0), "1,0 covers three: +60");
});

test("planFormation: one move a unit, onto a tile no other move takes, worth FORM.MIN_GAIN; the unit on the centre stays", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const f = {
        centre: at(0, 0), land: [at(3, 0)], targets: [at(3, 0)], sectors: [[at(3, 0)]], dist: line, defence: () => 0,
        members: [{ key: "a", role: "melee", at: at(0, 0) }, { key: "b", role: "melee", at: at(-1, 0) }],
    };
    const { moves } = planFormation(f, { tiles: [at(1, 0), at(0, 1)], movable: new Set(["a", "b"]), reach: () => true });
    assert.deepEqual(moves.map((m) => [m.key, m.to]), [["b", at(1, 0)]], "b screens the raider's side; a holds the centre");
    assert.ok(moves[0].gain >= FORM.MIN_GAIN);
});

test("a ranged guard out of range of every raider moves to a firing post within range, not next to one, still guarding York", () => {
    reset({ enemies: [raider(19, 8), raider(18, 7)] });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 17, y: 8 },
        { id: 3, type: "UNIT_SLINGER", x: 16, y: 10 }, // range 2: 4 tiles from either raider
    ];
    const r = run();
    const [to] = movesOf(3);
    assert.ok(to, `the Slinger moved: ${JSON.stringify(r.entries)}`);
    assert.deepEqual(to, at(17, 9), "the nearest firing post: 2 tiles from both raiders, 2 from York");
    assert.ok(world.enemies.every((e) => d(to, e) > 1) && world.enemies.some((e) => d(to, e) <= 2) && d(to, YORK) <= units.GUARD_RADIUS);
    assert.ok(formationKeys(r).includes("FORMATION_RANGED"));
    assert.deepEqual(movesOf(1), [], "the centre's holder stays");
    const line = r.lines.find((l) => l.includes("formation: York"));
    assert.ok(line?.includes("sectors 1") && line.includes("UNIT_SLINGER 16,10 -> 17,9 RANGED"), line);
});

test("raiders on opposite sides make two sectors: of two melee units screening the east, one turns to face the west", () => {
    // East: one raider at 18,7 (screened from 17,8 or 16,7); west: one at 13,9 (screened from 15,8 or 15,9).
    reset({ enemies: [raider(18, 7), raider(13, 9)] });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 17, y: 8 },
        { id: 3, type: "UNIT_WARRIOR", x: 16, y: 7 },
    ];
    const r = run();
    const moved = [2, 3].map((id) => movesOf(id)).filter((m) => m.length > 0);
    assert.equal(moved.length, 1, JSON.stringify(r.entries));
    const to = moved[0][0];
    assert.ok(d(to, YORK) === 1 && d(to, at(13, 9)) < d(YORK, at(13, 9)), `in front of the west raider: ${JSON.stringify(to)}`);
    assert.deepEqual(formationKeys(r), ["FORMATION_SCREEN"]);
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("sectors 2"));
});

test("a single choke tile: one melee unit takes it, the other does not follow it there", () => {
    // 16,7 is a mountain: 17,8 is the only tile next to York in front of the raiders at 19,8 and 18,7.
    reset({ enemies: [raider(19, 8), raider(18, 7)], map: (x, y) => (x === 16 && y === 7 ? { ...FLAT, terrain: "TERRAIN_MOUNTAIN" } : null) });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 15, y: 8 },
        { id: 3, type: "UNIT_WARRIOR", x: 15, y: 9 },
    ];
    const r = run();
    const sent = [2, 3].flatMap((id) => movesOf(id));
    assert.deepEqual(sent, [at(17, 8)], JSON.stringify(r.entries));
    assert.deepEqual(formationKeys(r), ["FORMATION_SCREEN"]);
});

test("the centre's holder stays while the screen is empty and its replacement cannot arrive this turn", () => {
    // A second Warrior four tiles away is sent to York (two turns): the holder does not step out to screen meanwhile.
    reset({ enemies: [raider(19, 8), raider(18, 7)] });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 12, y: 8 },
    ];
    const r = run();
    assert.deepEqual(movesOf(1), [], JSON.stringify(r.entries));
    assert.deepEqual(formationKeys(r), []);
    assert.ok(r.entries.some((e) => e.key === "REINFORCE"), "the far Warrior walks to York");
});

test("a small gain moves nobody: a screen on open ground does not step onto the forest next to it", () => {
    // 16,7 is forest (+2 defence: +10) and in front of the raider at 18,7 too; the screen at 17,8 stays.
    reset({ enemies: [raider(19, 8), raider(18, 7)], map: (x, y) => (x === 16 && y === 7 ? { ...FLAT, feature: "FEATURE_FOREST" } : null) });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 17, y: 8 },
    ];
    const r = run();
    assert.deepEqual(formationKeys(r), [], JSON.stringify(r.entries));
    assert.deepEqual(movesOf(2), []);
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("UNIT_WARRIOR at 17,8 (no better post)"));
});

test("a fortified soldier gives its fortification up only for a gain worth it; the player's own fortified soldiers stay", () => {
    // At 18,8 a Warrior stands next to both raiders (one more can hit it: -15); the forest at 17,9 is +10 and next to
    // neither (+25 in all). 16,7 is a mountain, so no screen post is free.
    const map = (x, y) => (x === 16 && y === 7 ? { ...FLAT, terrain: "TERRAIN_MOUNTAIN" } : x === 17 && y === 9 ? { ...FLAT, feature: "FEATURE_FOREST" } : null);
    const soldiers = (activity) => [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 17, y: 8 },
        { id: 3, type: "UNIT_WARRIOR", x: 18, y: 8, activity },
    ];
    reset({ enemies: [raider(19, 8), raider(18, 7)], map });
    world.units = soldiers(undefined);
    let r = run();
    assert.deepEqual(movesOf(3), [at(17, 9)], `awake: +25 is worth a move ${JSON.stringify(r.entries)}`);
    // Fortified by the autopilot (a soldier resting on an age's first turns is taken as its own): 25 - 15 < 20.
    reset({ enemies: [raider(19, 8), raider(18, 7)], map });
    Game.turn = 1;
    world.units = soldiers(UnitActivityTypes.SLEEP);
    r = run();
    assert.deepEqual(movesOf(3), [], JSON.stringify(r.entries));
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("UNIT_WARRIOR at 18,8 (no better post)"));
    // Fortified by the player: not ours to move at all, even to the free screen post at 16,7 (no mountain now: +65).
    reset({ enemies: [raider(19, 8), raider(18, 7)], map: (x, y) => (x === 17 && y === 9 ? { ...FLAT, feature: "FEATURE_FOREST" } : null) });
    world.units = soldiers(UnitActivityTypes.SLEEP);
    r = run();
    assert.deepEqual(movesOf(3), [], JSON.stringify(r.entries));
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("UNIT_WARRIOR at 18,8 (the player's)"));
});

test("the commander never stands on water: the coast covering two soldiers is no post; it stays on the centre", () => {
    // Two soldiers who have moved this turn stand at 17,7 and 17,9; only 17,8 and 18,8 (coast) are next to both. On the
    // centre the commander's radius (1) covers neither; a land tile covers one (+20, the centre's +5 lost: too little).
    // A commander may share a soldier's tile (one of each formation class).
    const coast = (x, y) => (x === 17 && y === 8) || (x === 18 && y === 8);
    reset({ enemies: [raider(13, 9), raider(13, 7)], map: (x, y) => (coast(x, y) ? { ...FLAT, terrain: "TERRAIN_COAST" } : null) });
    world.units = [
        { id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK },
        { id: 1, type: "UNIT_WARRIOR", x: 17, y: 7, moved: true },
        { id: 3, type: "UNIT_WARRIOR", x: 17, y: 9, moved: true },
    ];
    const r = run();
    assert.deepEqual(movesOf(9), [], JSON.stringify(r.entries));
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("commander UNIT_ARMY_COMMANDER at 16,8 stays"));
});

test("the commander moves where its radius covers the most soldiers, on land, when that is worth two of them; not again soon", () => {
    // On land: 17,8 covers all three (+60, the centre's +5 lost); with two (+35) it stays (game 38: +20 moves on three
    // turns in a row as the soldiers around it moved).
    reset({ enemies: [raider(13, 9), raider(13, 7)] });
    world.units = [
        { id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK },
        { id: 1, type: "UNIT_WARRIOR", x: 17, y: 7, moved: true },
        { id: 3, type: "UNIT_WARRIOR", x: 17, y: 9, moved: true },
    ];
    let r = run();
    assert.deepEqual(movesOf(9), [], `two more covered: not worth a move ${JSON.stringify(r.entries)}`);
    world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 18, y: 8, moved: true });
    r = run();
    assert.deepEqual(movesOf(9), [at(17, 8)], JSON.stringify(r.entries));
    assert.ok(formationKeys(r).includes("FORMATION_COMMANDER"));
    // The next turn it stands at 17,8 and the three soldiers have gone west (15,8 would cover them all: +60): it stays;
    // two turns on it may move again.
    const west = [{ id: 1, type: "UNIT_WARRIOR", x: 15, y: 7, moved: true }, { id: 3, type: "UNIT_WARRIOR", x: 15, y: 9, moved: true }, { id: 2, type: "UNIT_WARRIOR", x: 14, y: 8, moved: true }];
    Game.turn += 1;
    fake.sent.length = 0;
    world.units = [{ id: 9, type: "UNIT_ARMY_COMMANDER", x: 17, y: 8 }, ...west];
    r = run();
    assert.deepEqual(movesOf(9), [], JSON.stringify(r.entries));
    assert.ok(r.lines.find((l) => l.includes("formation: York"))?.includes("stays (moved lately)"));
    Game.turn += 1;
    fake.sent.length = 0;
    r = run();
    assert.equal(movesOf(9).length, 1, JSON.stringify(r.entries));
});
