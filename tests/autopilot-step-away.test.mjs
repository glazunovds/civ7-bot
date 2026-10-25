// Game 60 (research/game60, the unit-log and scouts reviews): a scout with 3 moves stepped away to a tile two Warriors
// reached (T96) while one out of every reach lay a step further; a hurt scout cycled 3 tiles from a hostile village and its
// last step away took it 2 from it; a lone Slinger was sent on a 4-turn walk past four raiders (T66) and killed. A step away
// now looks at every tile the unit reaches this turn and ranks them by the hostile units reaching them, a hurt unit keeps off
// hostile villages, and a ranged soldier is not sent on a walk whose first night falls in the raiders' reach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const FLAT = { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } };
const HOME = { x: 5, y: 5 };
const FRONT = { x: 15, y: 5 };
const world = {
    width: 40, height: 20, wrapX: false,
    // world.map(x, y): a test's own tiles (else flat land of nobody's)
    tiles: (x, y) => world.map?.(x, y) ?? FLAT,
    players: [{ id: 0 }, { id: 1 }, { id: 9, isIndependent: true, name: "Raiders" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 10 },
        { owner: 0, ...FRONT, name: "Front", pop: 4, prod: 10 },
    ],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { awayOrder, stopUnsafe } = await import("../mod/expansion-planner/ui/core/xpl-unit-safety.js");

const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const orderOf = (id) => fake.sent.filter((s) => (s.kind === "unit" || s.kind === "unitCommand") && s.id.id === id);
const moveOf = (id) => {
    const a = orderOf(id).find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
    return a ? { x: a.X, y: a.Y } : undefined;
};
const raider = (x, y, type = "UNIT_WARRIOR", extra = {}) => ({ x, y, owner: 9, type, ...extra });
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["map", "speed", "unreachable", "enemies", "villages", "indepRelation", "unitCommandOk"]) delete world[k];
    Object.assign(world, extra);
};
const run = (options = {}) => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        const r = units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: false, merchants: false, ...options });
        return { ...r, lines, keys: r.entries.map((e) => e.key) };
    } finally {
        console.warn = warn;
    }
};

test("core: a step away's order: never next to a land raider, then the fewest raiders reaching it, then the gap, then beside ours", () => {
    const tile = (adjacent, reach, gap, beside) => ({ adjacent, reach, gap, beside });
    assert.ok(awayOrder(tile(false, 2, 1, false), tile(true, 0, 1, false)) < 0, "not next to one");
    assert.ok(awayOrder(tile(false, 1, 2, false), tile(false, 2, 4, false)) < 0, "fewer in reach beats a wider gap (game 60 T96)");
    assert.ok(awayOrder(tile(false, 1, 3, false), tile(false, 1, 2, true)) < 0);
    assert.ok(awayOrder(tile(false, 1, 3, true), tile(false, 1, 3, false)) < 0, "beside a soldier of ours");
    assert.ok(stopUnsafe({ nextToRaider: true }));
    assert.ok(stopUnsafe({ reach: 2, ours: 1 }), "two in reach, it and one of ours: not out-numbered");
    assert.ok(!stopUnsafe({ reach: 2, ours: 2 }));
    assert.ok(!stopUnsafe({ reach: 1 }));
});

test("a scout steps to a tile it reaches this turn out of every raider's reach, 3 tiles away with 3 moves (game 60 T96)", () => {
    // A Warrior next to it at 19,9 and another 3 away at 17,10: every tile within 2 is in a Warrior's reach (its 2 moves + 1);
    // 19,13, 20,13, 21,13, 22,11, 22,12 and 23,10 are out of both.
    const warriors = [raider(19, 9), raider(17, 10)];
    fresh([{ id: 8, type: "UNIT_SCOUT", x: 20, y: 10, moves: 3 }], { enemies: warriors, speed: () => 3 });
    const r = run({ explore: true });
    const to = moveOf(8);
    assert.ok(to && dist(to, { x: 20, y: 10 }) === 3 && warriors.every((w) => dist(to, w) >= 4), `out of reach: ${JSON.stringify(to)} ${JSON.stringify(r.entries)}`);
    assert.ok(r.keys.includes("UNIT_AWAY"));
});

test("a hurt soldier steps to the tile fewer raiders reach, not the first of two at one gap (game 60 T67)", () => {
    // Only 19,8 and 19,12 open around the Slinger (mountains else), both 3 from the Warrior next to it; an Archer (2 moves,
    // range 2) reaches one of them. Mirrored, the other.
    const open = new Set(["20,10", "19,8", "19,12"]);
    const map = (x, y) => (GameplayMap.getPlotDistance(x, y, 20, 10) <= 2 && !open.has(`${x},${y}`) ? { terrain: "TERRAIN_MOUNTAIN", yields: {} } : FLAT);
    for (const [archer, safe] of [[raider(15, 8, "UNIT_ARCHER"), { x: 19, y: 12 }], [raider(15, 12, "UNIT_ARCHER"), { x: 19, y: 8 }]]) {
        fresh([{ id: 4, type: "UNIT_SLINGER", x: 20, y: 10, damage: 40 }], { map, enemies: [raider(21, 10), archer] });
        const r = run({ defend: true });
        assert.deepEqual(moveOf(4), safe, `the Archer at ${archer.x},${archer.y}: ${JSON.stringify(r.entries)}`);
        assert.ok(r.keys.includes("WITHDRAW"));
    }
    // The fewest in reach before the widest gap: 19,12 lies 3 from both Warriors (both reach it), 21,10 2 from one (only it).
    const open2 = new Set(["20,10", "19,12", "21,10"]);
    const map2 = (x, y) => (GameplayMap.getPlotDistance(x, y, 20, 10) <= 2 && !open2.has(`${x},${y}`) ? { terrain: "TERRAIN_MOUNTAIN", yields: {} } : FLAT);
    fresh([{ id: 4, type: "UNIT_SLINGER", x: 20, y: 10, damage: 40 }], { map: map2, enemies: [raider(19, 9), raider(16, 11)] });
    const r = run({ defend: true });
    assert.deepEqual(moveOf(4), { x: 21, y: 10 }, JSON.stringify(r.entries));
});

test("a raider killed earlier in the pass is no danger: the scout explores (game 60 T67: a dead Warrior still counted)", () => {
    fresh([{ id: 8, type: "UNIT_SCOUT", x: 20, y: 10 }], { enemies: [raider(21, 10, "UNIT_WARRIOR", { damage: 100 })] });
    const r = run({ explore: true });
    assert.ok(!r.keys.includes("UNIT_AWAY"), JSON.stringify(r.entries));
    assert.ok(orderOf(8).some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), JSON.stringify(fake.sent));
});

test("a hurt scout far from home does not rest 3 tiles from a hostile village: it steps away from it first (game 60: killed 2 from tribe 14's village)", () => {
    // Its soldiers are out: the village itself is the danger. No way home (our cities unreachable).
    const village = { owner: 9, x: 23, y: 10 };
    const home = (x, y) => (x === HOME.x && y === HOME.y) || (x === FRONT.x && y === FRONT.y);
    fresh([{ id: 8, type: "UNIT_SCOUT", x: 20, y: 10, damage: 60 }], { villages: [village], unreachable: home });
    let r = run({ explore: true });
    const to = moveOf(8);
    assert.ok(to && dist(to, village) > 4, `away from the village: ${JSON.stringify(r.entries)}`);
    assert.ok(!orderOf(8).some((s) => s.op === "UNITOPERATION_REST_UNTIL_HEALED"), JSON.stringify(fake.sent));
    // Five tiles from it: it rests there.
    fresh([{ id: 8, type: "UNIT_SCOUT", x: 18, y: 10, damage: 60 }], { villages: [village], unreachable: home });
    r = run({ explore: true });
    assert.ok(orderOf(8).some((s) => s.op === "UNITOPERATION_REST_UNTIL_HEALED"), JSON.stringify(r.entries));
    // A hurt soldier in the field likewise steps off before it heals.
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 20, y: 10, damage: 20 }], { villages: [village] });
    r = run({ defend: true });
    assert.ok(moveOf(4) && dist(moveOf(4), village) > 4, JSON.stringify(r.entries));
    assert.ok(r.keys.includes("WITHDRAW"));
});

test("a ranged soldier is not sent on a walk whose first night falls next to a raider; a melee one is; the defence line says why (game 60 T66)", () => {
    // Two raiders west of Front (15,5); our Slinger at 9,5 walks 2 tiles a turn: its first night at 11,5, next to 12,4.
    const threat = { settlement: { ...FRONT, name: "Front" }, count: 2, land: 2, ships: 0, close: 0, damaged: false, owners: [] };
    const enemies = [raider(12, 4), raider(12, 6)];
    fresh([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }, { id: 2, type: "UNIT_SLINGER", x: 9, y: 5 }], { enemies });
    let r = run({ defend: true, threats: [threat] });
    assert.equal(moveOf(2), undefined, JSON.stringify(r.entries));
    const line = r.lines.find((l) => l.includes("defence: Front"));
    assert.ok(line?.includes("not sent [UNIT_SLINGER at 9,5 (unsafe way)]"), line);
    // A Warrior on the same way is sent (a melee soldier holds its own there).
    fresh([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }, { id: 3, type: "UNIT_WARRIOR", x: 9, y: 5 }], { enemies });
    r = run({ defend: true, threats: [threat] });
    assert.ok(moveOf(3) && dist(moveOf(3), FRONT) <= 2, JSON.stringify(r.entries));
    // Raiders on the far side: the Slinger's first night is out of their reach: it goes.
    fresh([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }, { id: 2, type: "UNIT_SLINGER", x: 9, y: 5 }], { enemies: [raider(18, 4), raider(18, 6)] });
    r = run({ defend: true, threats: [threat] });
    assert.ok(moveOf(2), JSON.stringify(r.entries));
});
