// Raider hunts («Охота на рейдеров», after game 54; the user: "will commander chase exp much more aggressively so we can get
// more level?"). Game 54's generals sat through the turns raiders loitered 4-6 tiles from our settlements, while each
// focused attack gave 4-8 XP (the first level needs 7). A general and the soldiers the defence leaves free (and those packed
// in its army) go after a hostile soldier roaming near our land, follow it while it stays near, and end when it is gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const RAIDER = { x: 8, y: 13 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [{ owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 }],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const HOSTILE = IndependentRelationship.HOSTILE;
const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const army = () => [
    { id: 1, type: "UNIT_WARRIOR", ...LONDON }, // the garrison stays
    { id: 2, type: "UNIT_SPEARMAN", x: 9, y: 9 },
    { id: 3, type: "UNIT_SPEARMAN", x: 8, y: 10 },
    { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON }, // on the centre: safe
];
const reset = (extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["enemies", "unitCommandResult", "armies", "tiles", "villages", "speed", "unitCanStart"]) delete world[k];
    world.tiles = () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 });
    world.units = army();
    Game.turn = 20;
    Object.assign(world, {
        enemies: [{ ...RAIDER, owner: 5, type: "UNIT_WARRIOR" }],
        villages: [{ owner: 5, x: 28, y: 22 }],
        wars: [5], indepRelation: { 5: HOSTILE },
    }, extra);
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, huntRaiders: true, threats: units.threatenedSettlements(), fronts: [], exposed: [], ...options });
const keys = (r) => r.entries.map((e) => e.key);
const movesOf = (id) => fake.sent.filter((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO).map((s) => ({ x: s.args.X, y: s.args.Y }));

test("a hostile soldier roaming 5 tiles from London is hunted: the general and the free soldiers go for it at once (no gathering)", () => {
    reset();
    assert.deepEqual(units.threatenedSettlements(), [], "one raider 5 tiles out threatens nothing: the defence would leave it be");
    const r = run();
    assert.ok(keys(r).includes("RAIDER_HUNT_STARTED"), JSON.stringify(r.entries));
    const op = units.fieldOpState();
    assert.equal(op?.kind, "RAIDERS");
    assert.equal(op.stage, "FIGHT");
    assert.deepEqual([...op.members].sort(), ["0:2", "0:3"], "not the garrison");
    assert.equal(op.commander, "0:9");
    // The soldiers step next to the raider; the general under one of them (the soldier is the one attacked).
    const dests = [2, 3].map((id) => movesOf(id).at(-1));
    for (const d of dests) assert.ok(d && dist(d, RAIDER) === 1, JSON.stringify(dests));
    const c = movesOf(9).at(-1);
    assert.ok(c && dests.some((d) => d.x === c.x && d.y === c.y), `${JSON.stringify(c)} under ${JSON.stringify(dests)}`);
    assert.ok(keys(r).includes("FIELD_ADVANCE") && keys(r).includes("FIELD_COMMANDER"), JSON.stringify(r.entries));
});

test("no raider hunt: the option off, no general, a raider on another's land, a village's own guard, a unit at peace with us", () => {
    reset();
    assert.ok(!keys(run({ huntRaiders: false })).includes("RAIDER_HUNT_STARTED"), "off");
    reset();
    world.units = army().filter((u) => u.id !== 9);
    assert.ok(!keys(run()).includes("RAIDER_HUNT_STARTED"), "no general: the hunt is for its XP");
    assert.equal(units.fieldOpState(), null);
    reset();
    world.tiles = (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: x === RAIDER.x && y === RAIDER.y ? 3 : 0 });
    assert.ok(!keys(run()).includes("RAIDER_HUNT_STARTED"), "on another player's land");
    reset({ villages: [{ owner: 5, x: RAIDER.x, y: RAIDER.y + 1 }] });
    assert.ok(!keys(run({ hunt: false })).includes("RAIDER_HUNT_STARTED"), "next to its own village: a village hunt's business");
    reset({ wars: [], indepRelation: { 5: IndependentRelationship.NEUTRAL } });
    assert.ok(!keys(run()).includes("RAIDER_HUNT_STARTED"), "at peace with us: never a war of its own");
    reset({ enemies: [{ x: 8, y: 16, owner: 5, type: "UNIT_WARRIOR" }] });
    assert.ok(!keys(run()).includes("RAIDER_HUNT_STARTED"), "8 tiles out: beyond REACH");
});

test("the hunt follows its raider while it stays near; gone, it ends DONE; gone far, FAR, and that owner waits 3 turns", () => {
    reset();
    run();
    assert.equal(units.fieldOpState()?.kind, "RAIDERS");
    // It steps away: followed.
    world.enemies = [{ x: 8, y: 15, owner: 5, type: "UNIT_WARRIOR" }];
    run();
    assert.deepEqual([units.fieldOpState()?.target.x, units.fieldOpState()?.target.y], [8, 15]);
    // Gone (killed): DONE.
    world.enemies = [];
    let r = run();
    assert.ok(keys(r).includes("RAIDER_HUNT_ENDED"), JSON.stringify(r.entries));
    assert.equal(units.fieldOpState(), null);
    assert.equal(r.entries.find((e) => e.key === "RAIDER_HUNT_ENDED").args[1], "LOC_XPL_AP_RAIDER_WHY_DONE");
    // Another one, which walks off beyond 8 tiles: FAR.
    world.enemies = [{ ...RAIDER, owner: 5, type: "UNIT_WARRIOR" }];
    run();
    world.enemies = [{ x: 8, y: 16, owner: 5, type: "UNIT_WARRIOR" }];
    run();
    assert.equal(units.fieldOpState()?.kind, "RAIDERS", "8 tiles out: still followed");
    world.enemies = [{ x: 8, y: 17, owner: 5, type: "UNIT_WARRIOR" }];
    r = run();
    assert.equal(r.entries.find((e) => e.key === "RAIDER_HUNT_ENDED")?.args[1], "LOC_XPL_AP_RAIDER_WHY_FAR", JSON.stringify(r.entries));
    // That owner's raiders wait RETRY_TURNS.
    world.enemies = [{ ...RAIDER, owner: 5, type: "UNIT_WARRIOR" }];
    assert.ok(!keys(run()).includes("RAIDER_HUNT_STARTED"), "not at once");
    Game.turn += 3;
    assert.ok(keys(run()).includes("RAIDER_HUNT_STARTED"));
    // The option switched off: it ends OFF.
    r = run({ huntRaiders: false });
    assert.equal(r.entries.find((e) => e.key === "RAIDER_HUNT_ENDED")?.args[1], "LOC_XPL_AP_FIELD_WHY_OFF");
});

test("the soldiers packed in the general's army go too, and unpack by the fight toward the raider", () => {
    // The general 2 tiles from the raider with two Spearmen packed; nobody else free.
    reset({
        armies: { "0:3": { x: 8, y: 11, capacity: 4, unitCount: 2 } },
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_UNPACK_ARMY" ? { Success: false, Plots: [idx(7, 11), idx(8, 12)] } : undefined),
    });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...LONDON },
        { id: 9, type: "UNIT_ARMY_COMMANDER", x: 8, y: 11, army: 3 },
        { id: 5, type: "UNIT_SPEARMAN", x: 8, y: 11, onMap: false, army: 3 },
        { id: 6, type: "UNIT_SPEARMAN", x: 8, y: 11, onMap: false, army: 3 },
    ];
    const r = run();
    assert.ok(keys(r).includes("RAIDER_HUNT_STARTED"), JSON.stringify(r.entries));
    assert.deepEqual([...units.fieldOpState().members].sort(), ["0:5", "0:6"]);
    const unpack = fake.sent.find((s) => s.op === "UNITCOMMAND_UNPACK_ARMY");
    assert.deepEqual([unpack?.id.id, unpack?.args.X, unpack?.args.Y], [9, 8, 12], "the offered tile nearest the raider");
    assert.ok(keys(r).includes("FIELD_UNPACKED"));
});

test("the general stands under the soldier about to fight before two that are not (its focused attacks)", () => {
    // A soldier next to the raider (it fights this turn); two more side by side 2 tiles from it, out of its reach. Under one
    // of the pair the general's radius covers two; under the fighter, one. The pair used to win (2 covered against 1).
    // The game refuses the pair a move next to the raider (a river, say): they stay where they are.
    reset({
        speed: (id) => (id.id === 9 ? 9 : 2),
        unitCanStart: (id, op, args) => ((id.id === 3 || id.id === 4) && op === UnitOperationTypes.MOVE_TO && args?.X !== undefined && dist({ x: args.X, y: args.Y }, RAIDER) === 1 ? { Success: false } : null),
    });
    const near = (a, d) => [...Array(world.width * world.height).keys()].map((i) => GameplayMap.getLocationFromIndex(i)).filter((l) => dist(l, a) === d);
    let layout = null;
    for (const fighter of near(RAIDER, 1)) {
        for (const p0 of near(RAIDER, 2)) {
            const p1 = near(p0, 1).find((l) => dist(l, RAIDER) === 2 && dist(l, fighter) >= 2);
            if (p1 && dist(p0, fighter) >= 2) {
                layout = { fighter, pair: [p0, p1] };
                break;
            }
        }
        if (layout) break;
    }
    assert.ok(layout, "a layout exists");
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...LONDON },
        { id: 2, type: "UNIT_SPEARMAN", ...layout.fighter, },
        { id: 3, type: "UNIT_SPEARMAN", ...layout.pair[0], },
        { id: 4, type: "UNIT_SPEARMAN", ...layout.pair[1], },
        { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON },
    ];
    run();
    assert.equal(units.fieldOpState()?.commander, "0:9");
    const c = movesOf(9).at(-1);
    assert.deepEqual(c, layout.fighter, `${JSON.stringify(c)}; ${JSON.stringify(layout)}`);
});

test("a full pass: the general placed by the hunt in the unit step, the strike step runs again and its soldiers attack now", async () => {
    // The archer stands 2 tiles from the raider: it shoots once the general is placed (the second strike). Before, the strike
    // step ran only before the unit step, so the hunt's first fight waited a turn.
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const placed = () => fake.sent.some((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO);
    reset({ rangeTargets: (id) => (id.id === 4 && placed() ? [RAIDER] : []) });
    world.units = [...army(), { id: 4, type: "UNIT_ARCHER", x: 8, y: 11, ranged: 20, melee: 10 }];
    settings.patch({ autopilot: { defend: true, huntRaiders: true, huntVillages: false, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false, production: false, purchases: false } });
    // The general's move is carried out, as the game does (the fake moves nobody): a hunt's raider waits for its general's
    // radius (W5), and the archer's shot comes from within it.
    const push = (fake.sent.originalPush ??= fake.sent.push);
    fake.sent.push = function (...items) {
        for (const o of items) if (o.id?.id === 9 && o.op === UnitOperationTypes.MOVE_TO) Object.assign(world.units.find((u) => u.id === 9), { x: o.args.X, y: o.args.Y });
        return push.apply(this, items);
    };
    try {
        await autopilot.runTurn(true);
        const log = state.get().autopilot.log ?? [];
        assert.deepEqual(log.filter((e) => e.key === "ERROR").map((e) => e.args), []);
        assert.ok(log.some((e) => e.key === "RAIDER_HUNT_STARTED"), JSON.stringify(log.map((e) => e.key)));
        assert.ok(placed(), "the general moved by the fight");
        const shot = fake.sent.find((s) => s.id?.id === 4 && s.op === UnitOperationTypes.RANGE_ATTACK && s.args?.X === RAIDER.x);
        assert.ok(shot, JSON.stringify(fake.sent.filter((s) => s.id?.id === 4)));
    } finally {
        fake.sent.push = push;
        delete world.rangeTargets;
        settings.patch({ autopilot: { defend: false, huntRaiders: true, production: true, purchases: true, research: true, choices: true, befriend: true, growth: true, towns: true, replanEvery: 5 } });
    }
});
