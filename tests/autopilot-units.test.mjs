// Autopilot unit orders (each option off by default): settlers walk to their own best site
// in reach and found it, scouts explore, idle military shoots at the most damaged enemy in
// range, heals or fortifies, merchants take the trade screen's best route. Only units waiting
// for orders are touched; no order may start a war.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [
        { owner: 0, x: 5, y: 5, name: "Athens" },
        { owner: 1, x: 20, y: 5, name: "Babylon" },
        { owner: 1, x: 25, y: 12, name: "Ur" },
        { owner: 2, x: 30, y: 5, name: "Memphis" },
        { owner: 2, x: 34, y: 15, name: "Thebes" },
    ],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }, { x: 9, y: 10, rank: 2 }, { x: 38, y: 18, rank: 3 }] } } });

const run = (options) => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: false, merchants: false, ...options });
const orders = () => fake.sent.filter((s) => s.kind === "unit" || s.kind === "unitCommand");
const orderOf = (id) => orders().filter((s) => s.id.id === id);
const moveOf = (id) => orderOf(id).find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["startsWar", "claimOk", "aiSuggestions", "rangeTargets", "enemies", "tradeRoutes", "unitCommandOk", "unitCommandResult", "unitCanStart", "tradeCapacity", "unreachable", "owningCity", "expand", "wars", "combat", "districtAt", "villages", "indepRelation"]) delete world[k];
    Object.assign(world, extra);
};

test("settlers: each to its own best site in reach; no war; the game's suggestion when ours are gone", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }, { id: 3, type: "UNIT_SETTLER", x: 6, y: 5 }]);
    const r = run({ settlers: true });
    assert.deepEqual([moveOf(2).X, moveOf(2).Y], [12, 5], "the best site");
    assert.deepEqual([moveOf(3).X, moveOf(3).Y], [9, 10], "the next one: the best is taken; #3 is more than 10 turns away");
    assert.deepEqual(r.entries.map((e) => e.key), ["SETTLE_MOVE", "SETTLE_MOVE"]);
    assert.ok(r.ordered.has("0:2") && r.ordered.has("0:3"));

    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }, { id: 3, type: "UNIT_SETTLER", x: 6, y: 5 }], {
        startsWar: (_id, l) => (l.x === 12 && l.y === 5 ? 1 : undefined),
        aiSuggestions: () => [{ location: { x: 8, y: 2 } }],
    });
    run({ settlers: true });
    assert.deepEqual([moveOf(2).X, moveOf(2).Y], [9, 10], "walking to 12,5 would declare war");
    assert.deepEqual([moveOf(3).X, moveOf(3).Y], [8, 2], "the game's own suggestion");
});

test("a settler on its site founds; a site taken meanwhile is dropped", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }]);
    const r = run({ settlers: true });
    assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_FOUND_CITY"]);
    assert.equal(r.entries[0].key, "SETTLE_FOUND");

    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { claimOk: (x, y) => !(x === 12 && y === 5) });
    run({ settlers: true });
    assert.deepEqual([moveOf(2).X, moveOf(2).Y], [9, 10]);
});

test("at the settlement cap a settler on its site waits (skips its turn), keeps its site, and founds once the cap rises", () => {
    const n = Players.get(0).Stats.numSettlements;
    try {
        world.settlementCap = n; // at the cap
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }]);
        let r = run({ settlers: true });
        assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_SKIP_TURN"]);
        assert.equal(r.entries[0].key, "SETTLER_AT_CAP");
        assert.deepEqual(units.settlerGoals().map((g) => [g.x, g.y]), [[12, 5]], "the site stays its own");
        // Next turn, still at the cap: it waits again on its own site.
        fake.sent.length = 0;
        run({ settlers: true });
        assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_SKIP_TURN"]);
        world.settlementCap = n + 1;
        fake.sent.length = 0;
        r = run({ settlers: true });
        assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_FOUND_CITY"]);
    } finally {
        delete world.settlementCap;
    }
});

test("the military lever founds past the cap (research/30 §1): at the cap one settler founds with one allowed past it, the other waits", () => {
    const n = Players.get(0).Stats.numSettlements;
    try {
        world.settlementCap = n; // at the cap
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }, { id: 3, type: "UNIT_SETTLER", x: 9, y: 10 }]);
        const r = run({ settlers: true, pastCap: 1 });
        assert.equal(orders().filter((s) => s.op === "UNITOPERATION_FOUND_CITY").length, 1, JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "SETTLER_AT_CAP"), "the second would be 2 past it");
    } finally {
        delete world.settlementCap;
    }
});

test("a settler keeps its site while walking; a new settler does not take it", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
    run({ settlers: true });
    assert.deepEqual([moveOf(2).X, moveOf(2).Y], [12, 5]);
    // Next turn: the first one is on its way, a second one appears.
    fake.sent.length = 0;
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 7, y: 5, activity: UnitActivityTypes.OPERATION }, { id: 3, type: "UNIT_SETTLER", x: 5, y: 5 }];
    run({ settlers: true });
    assert.deepEqual(orderOf(2), [], "a unit with an order is left alone");
    assert.deepEqual([moveOf(3).X, moveOf(3).Y], [9, 10]);
});

const army = () => [
    { id: 1, type: "UNIT_SCOUT", x: 5, y: 6 },
    { id: 4, type: "UNIT_ARCHER", x: 4, y: 5 },
    { id: 5, type: "UNIT_WARRIOR", x: 4, y: 4, damage: 30 },
    { id: 6, type: "UNIT_WARRIOR", x: 6, y: 4 },
    { id: 7, type: "UNIT_MERCHANT", x: 5, y: 5 },
    { id: 9, type: "UNIT_WARRIOR", x: 6, y: 6, activity: UnitActivityTypes.OPERATION },
];

test("defence: the archer shoots the most damaged enemy (of two soldiers away from our settlements), the hurt unit heals, the rest fortify", () => {
    const targets = { rangeTargets: (id) => (id.id === 4 ? [{ x: 9, y: 9 }, { x: 10, y: 9 }] : []), enemies: [{ x: 9, y: 9, damage: 10 }, { x: 10, y: 9, damage: 50 }] };
    fresh(army(), targets);
    const r = run({ defend: true });
    const shot = orderOf(4).find((s) => s.op === UnitOperationTypes.RANGE_ATTACK)?.args;
    assert.deepEqual([shot?.X, shot?.Y], [10, 9]);
    assert.deepEqual(orderOf(5).map((s) => s.op), ["UNITOPERATION_REST_UNTIL_HEALED"]);
    assert.deepEqual(orderOf(6).map((s) => s.op), ["UNITOPERATION_FORTIFY"]);
    for (const id of [1, 7, 9]) assert.deepEqual(orderOf(id), [], `unit ${id}: not military, or busy`);
    assert.deepEqual(r.entries.map((e) => e.key).sort(), ["FORTIFY", "HEAL", "RANGED"]);

    fresh(army(), { ...targets, startsWar: (_id, l) => (l.x === 10 && l.y === 9 ? 2 : undefined) });
    run({ defend: true });
    const safeShot = orderOf(4).find((s) => s.op === UnitOperationTypes.RANGE_ATTACK)?.args;
    assert.deepEqual([safeShot?.X, safeShot?.Y], [9, 9], "never a shot that declares war");
});

test("defence: archers shoot the soldier attacking our settlement first, then soldiers, then the rest; never an empty tile", () => {
    // Seen in game 5: crossbowmen shot scouts and an empty village tile while a swordsman took the town.
    const all = [{ x: 4, y: 7 }, { x: 9, y: 9 }, { x: 8, y: 3 }, { x: 9, y: 3 }];
    const shotAt = (enemies, targets = all) => {
        fresh(army(), { rangeTargets: (id) => (id.id === 4 ? targets : []), enemies });
        run({ defend: true });
        const shot = orderOf(4).find((s) => s.op === UnitOperationTypes.RANGE_ATTACK)?.args;
        return shot ? [shot.X, shot.Y] : null;
    };
    const near = { x: 4, y: 7, damage: 10 };                         // 2 tiles from Athens
    const far = { x: 9, y: 9, damage: 60 };                          // a soldier away from our settlements
    const scout = { x: 8, y: 3, damage: 90, type: "UNIT_SCOUT" };    // not a soldier
    assert.deepEqual(shotAt([near, far, scout]), [4, 7], "the one attacking Athens");
    assert.deepEqual(shotAt([far, scout]), [9, 9], "a soldier before a scout");
    assert.deepEqual(shotAt([scout]), [8, 3]);
    assert.equal(shotAt([], [{ x: 9, y: 3 }]), null, "an empty tile (a village, a district): no shot");
});

test("defence: when the game refuses to fortify (a new capital), the unit stands guard", () => {
    fresh(army(), { unitCanStart: (_id, op) => (op === "UNITOPERATION_FORTIFY" ? { Success: false, FailureReasons: ["LOC_NO"] } : undefined) });
    const r = run({ defend: true });
    assert.deepEqual(orderOf(6).map((s) => s.op), ["UNITOPERATION_ALERT"]);
    assert.ok(r.entries.some((e) => e.key === "ALERT"));
});

test("defence: two military units on one tile (a new one from the city): one steps to a free tile of ours", () => {
    const CITY = { x: 5, y: 5 };
    const ours = (x, y) => GameplayMap.getPlotDistance(x, y, CITY.x, CITY.y) <= 1 && x <= CITY.x;
    const tiles = world.tiles;
    // Like the game: while stacked, a unit may only move.
    const stacked = (id) => {
        const u = world.units.find((w) => w.id === id.id);
        return world.units.some((w) => w !== u && w.x === u.x && w.y === u.y && w.type === "UNIT_WARRIOR");
    };
    fresh([{ id: 3, type: "UNIT_WARRIOR", ...CITY }, { id: 4, type: "UNIT_WARRIOR", ...CITY }, { id: 5, type: "UNIT_WARRIOR", x: 4, y: 5 }], {
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
        tiles: (x, y) => ({ ...tiles(x, y), owner: ours(x, y) ? 0 : -1 }),
    });
    const r = run({ defend: true });
    const to = moveOf(3);
    assert.ok(to, JSON.stringify(orders()));
    assert.equal(GameplayMap.getPlotDistance(to.X, to.Y, CITY.x, CITY.y), 1, "the nearest tile");
    assert.ok(ours(to.X, to.Y), "our own land first");
    assert.ok(!(to.X === 4 && to.Y === 5), "not onto another unit");
    assert.deepEqual(orderOf(4), [], "the other one waits until the move is done");
    assert.ok(r.entries.some((e) => e.key === "STEP_ASIDE"));
    // The move is done: the one left behind can fortify now.
    fake.sent.length = 0;
    world.units = [{ id: 3, type: "UNIT_WARRIOR", x: to.X, y: to.Y, moved: true }, { id: 4, type: "UNIT_WARRIOR", ...CITY }, { id: 5, type: "UNIT_WARRIOR", x: 4, y: 5, activity: UnitActivityTypes.SLEEP }];
    run({ defend: true });
    assert.deepEqual(orderOf(4).map((s) => s.op), ["UNITOPERATION_FORTIFY"]);
    world.tiles = tiles;
});

test("a settler and a scout on one tile (both civilian formation) with no order: one steps aside so the turn can end", () => {
    const SPOT = { x: 8, y: 8 };
    const stacked = (id) => {
        const u = world.units.find((w) => w.id === id.id);
        return world.units.some((w) => w !== u && w.x === u.x && w.y === u.y);
    };
    // Settler and scout have nothing to do (no site: every claim refused; exploring off).
    fresh([{ id: 6, type: "UNIT_SETTLER", ...SPOT }, { id: 7, type: "UNIT_SCOUT", ...SPOT }], {
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
        claimOk: () => false,
    });
    const r = run({ settlers: true });
    const movers = [6, 7].filter((id) => moveOf(id));
    assert.equal(movers.length, 1, JSON.stringify(orders()));
    const to = moveOf(movers[0]);
    assert.equal(GameplayMap.getPlotDistance(to.X, to.Y, SPOT.x, SPOT.y), 1);
    assert.ok(r.entries.some((e) => e.key === "STEP_ASIDE"));
    // Our merchants (civilian too) on every neighbour but one: only that one is free.
    const around = Array.from(GameplayMap.getPlotIndicesInRadius(SPOT.x, SPOT.y, 1), (i) => GameplayMap.getLocationFromIndex(i)).filter((l) => !(l.x === SPOT.x && l.y === SPOT.y));
    const free = around[around.length - 1];
    const merchants = around.slice(0, -1).map((l, i) => ({ id: 20 + i, type: "UNIT_MERCHANT", x: l.x, y: l.y, activity: UnitActivityTypes.SLEEP }));
    fresh([{ id: 6, type: "UNIT_SETTLER", ...SPOT }, { id: 7, type: "UNIT_SCOUT", ...SPOT }, ...merchants], {
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
        claimOk: () => false,
    });
    run({ settlers: true });
    const moved = [6, 7].map(moveOf).find(Boolean);
    assert.deepEqual([moved?.X, moved?.Y], [free.x, free.y], "not onto another civilian");
});

test("explore: scouts explore by themselves, nothing else moves", () => {
    fresh(army());
    run({ explore: true });
    assert.deepEqual(orders().map((s) => [s.id.id, s.op]), [[1, "UNITOPERATION_AUTOMATE_EXPLORE"]]);
});

test("merchants: most imported resources first, one per city, within each civ's trade limit", () => {
    const B = { owner: 1, id: 0 }, U = { owner: 1, id: 1 }, M = { owner: 2, id: 0 }, T = { owner: 2, id: 1 };
    const tradeRoutes = [
        { targetCityId: B, status: [TradeRouteStatus.SUCCESS], importPayloads: [{}, {}], exportYields: [{ yieldType: "YIELD_GOLD", amount: 2 }] },
        { targetCityId: U, status: [TradeRouteStatus.SUCCESS], importPayloads: [{}, {}], exportYields: [{ yieldType: "YIELD_GOLD", amount: 5 }] },
        { targetCityId: M, status: [TradeRouteStatus.SUCCESS], importPayloads: [{}], exportYields: [{ yieldType: "YIELD_GOLD", amount: 10 }] },
        { targetCityId: T, status: [TradeRouteStatus.DISTANCE], importPayloads: [{}, {}, {}], exportYields: [] },
    ];
    const merchants = [{ id: 7, type: "UNIT_MERCHANT", x: 5, y: 5 }, { id: 8, type: "UNIT_MERCHANT", x: 5, y: 5 }];
    fresh(merchants, { tradeRoutes });
    const r = run({ merchants: true });
    const near = (args, city) => GameplayMap.getPlotDistance(args.X, args.Y, city.x, city.y) <= 1;
    assert.ok(near(moveOf(7), world.cities[2]), `walks to Ur (2 resources, 5 gold beats 2): ${JSON.stringify(moveOf(7))}`);
    assert.ok(near(moveOf(8), world.cities[3]), "Memphis: Babylon is taken by Ur's civ trade limit, Thebes is out of range");
    assert.deepEqual(r.entries.map((e) => e.key), ["TRADE_MOVE", "TRADE_MOVE"]);

    fresh(merchants, { tradeRoutes, unitCommandOk: (id) => id.id === 7 });
    run({ merchants: true });
    const route = orderOf(7).find((s) => s.op === UnitCommandTypes.MAKE_TRADE_ROUTE);
    assert.deepEqual([route?.args.X, route?.args.Y], [25, 12], "already there: the route starts");
});

test("every option off: no unit gets an order", () => {
    fresh([...army(), { id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { rangeTargets: () => [{ x: 4, y: 7 }], enemies: [{ x: 4, y: 7 }] });
    const r = run({});
    assert.deepEqual(orders(), []);
    assert.equal(r.ordered.size, 0);
});

test("skipping idle units never cancels an order the game has not taken yet", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    fresh([]);
    world.readyUnits = [{ owner: 0, id: 6 }, { owner: 0, id: 8 }];
    await steps.skipIdleUnits(new Set(["0:6"]));
    assert.deepEqual(orders(), [], "unit 6 was just told to fortify");
    await steps.skipIdleUnits(new Set());
    assert.deepEqual(orders().map((s) => s.id.id), [6, 8]);
    assert.deepEqual(orders()[0].args, { X: -9999, Y: -9999, UnitAbilityType: -1 }, "the parameters the game's unit panel sends");
});

test("skipping: every idle unit, even when the first ready one was just given an order", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    fresh([{ id: 1, type: "UNIT_FOUNDER", x: 5, y: 5 }, { id: 3, type: "UNIT_WARRIOR", x: 6, y: 5 }, { id: 4, type: "UNIT_WARRIOR", x: 4, y: 5, activity: UnitActivityTypes.OPERATION }]);
    world.readyUnits = [{ owner: 0, id: 1 }];
    const out = await steps.skipIdleUnits(new Set(["0:1"]));
    assert.deepEqual(orders().map((s) => s.id.id), [3], "the founder keeps its order, the busy warrior its own");
    assert.deepEqual(orders()[0].args, { X: -9999, Y: -9999, UnitAbilityType: -1 }, "the parameters the game's unit panel sends");
    assert.equal(out[0].key, "UNITS_SKIPPED");
});

test("skipping: a unit the game stopped after part of a move (moves left) is skipped too (game 12 T31)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    fresh([{ id: 1, type: "UNIT_WARRIOR", x: 5, y: 5, moved: true }, { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5, moved: true, moves: 0 }]);
    world.readyUnits = [];
    await steps.skipIdleUnits(new Set());
    assert.deepEqual(orders().map((s) => s.id.id), [1], "moves left: skipped; none left: nothing to do");
});

test("skipping: the game's ready list is followed while it takes each skip a moment later", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    fresh([]);
    world.readyUnits = [{ owner: 0, id: 6 }, { owner: 0, id: 8 }, { owner: 0, id: 9 }];
    world.readyLag = 20;
    try {
        const out = await steps.skipIdleUnits(new Set());
        assert.deepEqual(orders().map((s) => s.id.id), [6, 8, 9], "before: only the first, the next ask still named it");
        assert.deepEqual(out[0].args, [3]);
    } finally {
        delete world.readyLag;
    }
});

test("a move order kept 2 turns on one tile is cancelled; walking or fortified units are left alone", () => {
    const at = (turn) => {
        Game.turn = turn;
        fake.sent.length = 0;
        return run({ defend: true });
    };
    const OP = UnitActivityTypes.OPERATION;
    units.resetUnitGoals();
    world.units = [
        { id: 3, type: "UNIT_WARRIOR", x: 8, y: 5, activity: OP, dest: { x: 12, y: 5 } },
        { id: 4, type: "UNIT_WARRIOR", x: 8, y: 7, activity: UnitActivityTypes.SLEEP },
    ];
    const turn0 = Game.turn;
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_CANCEL";
    try {
        at(10);
        at(11);
        assert.deepEqual(orders().filter((s) => s.op === "UNITCOMMAND_CANCEL"), [], "one turn: it may still go");
        const r = at(12);
        assert.deepEqual(orders().filter((s) => s.op === "UNITCOMMAND_CANCEL").map((s) => s.id.id), [3]);
        assert.deepEqual(r.entries.find((e) => e.key === "MOVE_STUCK")?.args.slice(1), [12, 5, 2]);
        // A unit that moves on is not stuck.
        units.resetUnitGoals();
        world.units = [{ id: 3, type: "UNIT_WARRIOR", x: 8, y: 5, activity: OP, dest: { x: 12, y: 5 } }];
        at(20);
        world.units[0].x = 9;
        at(22);
        assert.deepEqual(orders().filter((s) => s.op === "UNITCOMMAND_CANCEL"), []);
    } finally {
        Game.turn = turn0;
        delete world.unitCommandOk;
    }
});

test("stepping aside in a crowded city: a tile with only our civilian is fine, never one with someone else's unit", () => {
    const CITY = { x: 5, y: 5 };
    const ring = GameplayMap.getPlotIndicesInRadius(CITY.x, CITY.y, 1).map((i) => GameplayMap.getLocationFromIndex(i)).filter((l) => !(l.x === CITY.x && l.y === CITY.y));
    const [free, ...taken] = ring;
    const stacked = (id) => id.id === 3 || id.id === 4;
    const guards = taken.map((l, i) => ({ id: 100 + i, type: "UNIT_WARRIOR", x: l.x, y: l.y, activity: UnitActivityTypes.SLEEP }));
    fresh([{ id: 3, type: "UNIT_WARRIOR", ...CITY }, { id: 4, type: "UNIT_WARRIOR", ...CITY }, ...guards, { id: 9, type: "UNIT_SETTLER", ...free, activity: UnitActivityTypes.SLEEP }], {
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
    });
    units.commandUnits(DEFAULT_SETTINGS, { defend: true });
    assert.deepEqual([moveOf(3)?.X, moveOf(3)?.Y], [free.x, free.y], "our settler's tile");
    // Someone else's unit there instead: not that tile.
    fresh([{ id: 3, type: "UNIT_WARRIOR", ...CITY }, { id: 4, type: "UNIT_WARRIOR", ...CITY }, ...guards], {
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
        enemies: [{ x: free.x, y: free.y, owner: 1, type: "UNIT_SCOUT" }],
    });
    units.commandUnits(DEFAULT_SETTINGS, { defend: true });
    const to = moveOf(3);
    assert.ok(to && !(to.X === free.x && to.Y === free.y), JSON.stringify(to));
    assert.equal(GameplayMap.getPlotDistance(to.X, to.Y, CITY.x, CITY.y), 2, "the next ring");
});

test("a soldier with nowhere to step joins the army of the commander on its tile", () => {
    const CITY = { x: 5, y: 5 };
    const stacked = (id) => id.id === 3;
    // Every tile around is someone's: no room.
    fresh([{ id: 3, type: "UNIT_ARCHER", ...CITY }, { id: 4, type: "UNIT_ARMY_COMMANDER", ...CITY, activity: UnitActivityTypes.SLEEP }], {
        unitCanStart: (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined),
        unitCommandOk: (id, op) => stacked(id) && op === "UNITCOMMAND_ADD_TO_ARMY",
        enemies: GameplayMap.getPlotIndicesInRadius(CITY.x, CITY.y, 3).map((i) => GameplayMap.getLocationFromIndex(i)).filter((l) => !(l.x === CITY.x && l.y === CITY.y)).map((l) => ({ ...l, owner: 1, type: "UNIT_SCOUT" })),
    });
    const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true });
    assert.deepEqual(orderOf(3).map((s) => s.op), ["UNITCOMMAND_ADD_TO_ARMY"], JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "JOINED_ARMY"));
});

test("boxed in by our own soldiers (seen in game: every tile within 3 taken or out of reach): a neighbour steps out, the new unit moves in on the retry", () => {
    const CITY = { x: 5, y: 5 };
    const at = (i) => GameplayMap.getLocationFromIndex(i);
    const isCity = (l) => l.x === CITY.x && l.y === CITY.y;
    const around = GameplayMap.getPlotIndicesInRadius(CITY.x, CITY.y, 3).map(at).filter((l) => !isCity(l));
    // One free tile two steps out, which the stacked crossbowmen cannot reach this turn.
    const free = around.find((l) => GameplayMap.getPlotDistance(l.x, l.y, CITY.x, CITY.y) === 2);
    const guards = around.filter((l) => !(l.x === free.x && l.y === free.y)).map((l, i) => ({ id: 100 + i, type: "UNIT_WARRIOR", x: l.x, y: l.y, activity: UnitActivityTypes.SLEEP }));
    const stacked = (id) => id.id === 3 || id.id === 4;
    const canStart = (id, op) => (op !== UnitOperationTypes.MOVE_TO && stacked(id) ? { Success: false } : undefined);
    fresh([{ id: 3, type: "UNIT_ARCHER", ...CITY }, { id: 4, type: "UNIT_WARRIOR", ...CITY }, ...guards], {
        unitCanStart: canStart,
        unreachable: (x, y, id) => stacked(id) && x === free.x && y === free.y,
    });
    const r = run({ defend: true });
    const shoves = orders().filter((s) => s.op === UnitOperationTypes.MOVE_TO);
    assert.equal(shoves.length, 1, JSON.stringify(orders()));
    const mover = guards.find((g) => g.id === shoves[0].id.id);
    assert.equal(GameplayMap.getPlotDistance(mover.x, mover.y, CITY.x, CITY.y), 1, "a neighbour of the city");
    assert.deepEqual([shoves[0].args.X, shoves[0].args.Y], [free.x, free.y], "into the free tile next to it");
    assert.ok(r.entries.some((e) => e.key === "MADE_ROOM"));
    assert.ok(r.ordered.has(`0:${mover.id}`), "its order is not skipped away");
    assert.ok(!r.ordered.has("0:3"), "the stacked one has no order yet: the retry may still move it");
    // The retry: the neighbour has gone; the archer takes its tile.
    fake.sent.length = 0;
    world.units = world.units.map((u) => (u.id === mover.id ? { ...u, x: free.x, y: free.y, moved: true } : u));
    run({ defend: true });
    assert.deepEqual([moveOf(3)?.X, moveOf(3)?.Y], [mover.x, mover.y]);
});

test("under threat: soldiers away from the threatened settlement walk there until it has as many as the hostile units; the garrison and those already there stay", () => {
    const CITY = { x: 5, y: 5 };
    const SPARTA = { x: 15, y: 5, name: "Sparta" };
    const threats = [{ settlement: SPARTA, count: 2, owners: [] }];
    fresh([
        { id: 3, type: "UNIT_WARRIOR", ...CITY },              // the garrison
        { id: 4, type: "UNIT_WARRIOR", x: 6, y: 5 },
        { id: 5, type: "UNIT_WARRIOR", x: 4, y: 5 },
        { id: 7, type: "UNIT_WARRIOR", x: 14, y: 6 },          // already at Sparta
    ]);
    const r = run({ defend: true, threats });
    const moves = orders().filter((s) => s.op === UnitOperationTypes.MOVE_TO);
    assert.equal(moves.length, 1, "Sparta lacks one: one goes " + JSON.stringify(orders()));
    assert.ok([4, 5].includes(moves[0].id.id));
    assert.ok(GameplayMap.getPlotDistance(moves[0].args.X, moves[0].args.Y, SPARTA.x, SPARTA.y) <= 2);
    assert.ok(!(moves[0].args.X === 14 && moves[0].args.Y === 6), "not onto our soldier");
    assert.ok(r.entries.some((e) => e.key === "REINFORCE"));
    for (const id of [3, 7]) assert.deepEqual(orderOf(id).map((s) => s.op), ["UNITOPERATION_FORTIFY"], `unit ${id}`);
    // On its way it counts for Sparta.
    const walker = world.units.find((u) => u.id === moves[0].id.id);
    walker.activity = UnitActivityTypes.OPERATION;
    assert.equal(units.guardsFor(threats[0]), 2);
});

test("migrants: on a city's land they join it on the tile the growth advice rates best; elsewhere they walk to our nearest city", () => {
    const CITY = { x: 5, y: 5 };
    const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
    const resettle = () => orders().find((s) => s.op === "UNITCOMMAND_RESETTLE");
    const tiles = world.tiles;
    const extra = {
        owningCity: (x, y) => (GameplayMap.getPlotDistance(x, y, CITY.x, CITY.y) <= 1 ? { owner: 0, id: 0 } : null),
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_RESETTLE" ? { Success: false, Plots: [idx(4, 4), idx(6, 6)] } : undefined),
        expand: () => ({ Success: true, Plots: [idx(4, 4), idx(6, 6)], ConstructibleTypes: [-1, -1] }),
        tiles: (x, y) => ({ ...tiles(x, y), yields: x === 6 && y === 6 ? { YIELD_FOOD: 5 } : { YIELD_FOOD: 1 } }),
    };
    fresh([{ id: 50, type: "UNIT_MIGRANT", x: 6, y: 5 }], extra);
    let r = run({ settlers: true });
    assert.deepEqual(resettle()?.args, { X: 6, Y: 6 }, JSON.stringify(orders()));
    assert.ok(r.entries.some((e) => e.key === "RESETTLED"));

    fresh([{ id: 50, type: "UNIT_MIGRANT", x: 12, y: 5 }], extra);
    r = run({ settlers: true });
    const to = moveOf(50);
    assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, CITY.x, CITY.y) <= 1, JSON.stringify(orders()));
    assert.equal(resettle(), undefined, "not on our land yet");
    assert.ok(r.entries.some((e) => e.key === "MIGRANT_MOVE"));

    fresh([{ id: 50, type: "UNIT_MIGRANT", x: 6, y: 5 }], extra);
    run({ settlers: false });
    assert.deepEqual(orders(), [], "migrants move with the settlers option");
    world.tiles = tiles;
});

test("rough seas (seen in game: a settler sent 10 turns across the ocean): before Shipbuilding no land unit walks across deep ocean; coast, Shipbuilding or another age is fine", () => {
    const tiles = world.tiles;
    const age = Game.age;
    // A deep-ocean strait at x = 10 between the settler and the best site (12,5).
    const strait = (terrain) => (x, y) => ({ ...tiles(x, y), terrain: x === 10 && y >= 3 && y <= 6 ? terrain : "TERRAIN_FLAT" });
    const send = () => {
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        run({ settlers: true });
        return [moveOf(2)?.X, moveOf(2)?.Y];
    };
    try {
        Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION").$hash;
        world.tiles = strait("TERRAIN_OCEAN");
        assert.deepEqual(send(), [9, 10], "the best site lies across the ocean: the next one");
        world.techs = ["NODE_TECH_EX_SHIPBUILDING"];
        assert.deepEqual(send(), [12, 5], "after Shipbuilding the ocean neither stops nor hurts");
        delete world.techs;
        world.tiles = strait("TERRAIN_COAST");
        assert.deepEqual(send(), [12, 5], "shallow water");
        world.tiles = strait("TERRAIN_OCEAN");
        Game.age = age;
        assert.deepEqual(send(), [12, 5], "Antiquity: the game's own paths (no rough seas)");
    } finally {
        Game.age = age;
        world.tiles = tiles;
        delete world.techs;
    }
});

test("migrants join a town too: the one they stand in, else the nearest settlement (town or city)", () => {
    const TOWN = { owner: 0, x: 5, y: 12, name: "Delphi", isTown: true };
    world.cities.push(TOWN);
    const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
    const extra = {
        owningCity: (x, y) => (GameplayMap.getPlotDistance(x, y, 5, 5) <= 1 ? { owner: 0, id: 0 } : GameplayMap.getPlotDistance(x, y, TOWN.x, TOWN.y) <= 1 ? { owner: 0, id: 1 } : null),
        unitCommandResult: (_id, op) => (op === "UNITCOMMAND_RESETTLE" ? { Success: false, Plots: [idx(4, 12)] } : undefined),
    };
    try {
        fresh([{ id: 50, type: "UNIT_MIGRANT", x: 5, y: 13 }], extra);
        let r = run({ settlers: true });
        assert.deepEqual(orders().find((s) => s.op === "UNITCOMMAND_RESETTLE")?.args, { X: 4, Y: 12 }, JSON.stringify(orders()));
        assert.deepEqual(r.entries[0]?.args, ["LOC_UNIT_MIGRANT_NAME", "Delphi"]);

        fresh([{ id: 50, type: "UNIT_MIGRANT", x: 5, y: 16 }], extra);
        r = run({ settlers: true });
        const to = moveOf(50);
        assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, TOWN.x, TOWN.y) <= 1, `to the nearer town: ${JSON.stringify(to)}`);
        assert.deepEqual(r.entries[0]?.args, ["LOC_UNIT_MIGRANT_NAME", "Delphi"]);
    } finally {
        world.cities.pop();
    }
});

// Settlers keep away from hostile military units (here: a civilization at war with us).
const AT_WAR = { wars: [1] };
const foe = (x, y) => ({ x, y, owner: 1, type: "UNIT_WARRIOR" });
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);

test("settlers: no site with an enemy within 3 tiles, no way passing within 2 of one", () => {
    const enemyNearSite = foe(15, 5); // 3 tiles from the site, more than 2 from its way
    assert.equal(dist(enemyNearSite, { x: 12, y: 5 }), 3);
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [enemyNearSite] });
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], "the best site has an enemy next to it");
    // An enemy beside the way to the best site (the site itself 4+ tiles from it).
    const beside = foe(8, 3);
    assert.ok(dist(beside, { x: 12, y: 5 }) > 3 && dist(beside, { x: 8, y: 5 }) <= 2);
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [beside] });
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], "its way passes the enemy");
    // Not at war, no independent: no danger.
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { enemies: [beside] });
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
    delete world.wars;
});

test("settlers: a war risk's soldiers next to the way are danger too, though we are not at war; 2 tiles away only when its leader is Hostile (research/23 D9, research/24 X4)", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { enemies: [foe(8, 4)] });
    run({ settlers: true, riskOwners: [1] });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], "its way passes next to the risk's soldier");
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { enemies: [foe(8, 4)] });
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5], "no risk: no danger");
    // Two tiles from the way: game 9's espionage risk kept every site «unsafe» for 48 turns.
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { enemies: [foe(8, 3)] });
    run({ settlers: true, riskOwners: [1] });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5], "a risk that is not Hostile, 2 tiles away");
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { enemies: [foe(8, 3)], relations: { 1: "HOSTILE" } });
    try {
        run({ settlers: true, riskOwners: [1] });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], "Hostile: 2 tiles is too close");
    } finally {
        delete world.relations;
    }
});

test("settlers: an enemy within 3 tiles: back to our nearest settlement by a way never next to it; in a settlement it waits", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 8, y: 5 }], { ...AT_WAR, enemies: [foe(10, 5)] });
    let r = run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [5, 5], JSON.stringify(orders()));
    assert.equal(r.entries[0]?.key, "SETTLER_RETREAT");
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [foe(7, 5)] });
    r = run({ settlers: true });
    assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_SKIP_TURN"]);
    assert.equal(r.entries[0]?.key, "SETTLER_WAITS");
    // The enemy stands between it and home: never walk past it; step away instead.
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }], { ...AT_WAR, enemies: [foe(10, 5)] });
    r = run({ settlers: true });
    assert.equal(r.entries[0]?.key, "SETTLER_AWAY", JSON.stringify(orders()));
    // Cut off from home: it steps to the reachable tile furthest from the enemy.
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }], { ...AT_WAR, enemies: [foe(10, 5)] });
    world.unreachable = (x, y) => x === 5 && y === 5;
    r = run({ settlers: true });
    const to = moveOf(2);
    assert.ok(to && dist({ x: to.X, y: to.Y }, { x: 10, y: 5 }) > dist({ x: 12, y: 5 }, { x: 10, y: 5 }), JSON.stringify(to));
    assert.equal(r.entries[0]?.key, "SETTLER_AWAY");
    delete world.wars;
});

test("settlers: in a settlement with raiders near, it leaves for a safe site by a way out of their reach; else it waits", () => {
    // Raiders 3 tiles west of Athens; the best site lies east, every step of the way 4+ tiles from them.
    const raider = foe(2, 5);
    assert.equal(dist(raider, { x: 5, y: 5 }), 3);
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [raider] });
    let r = run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5], JSON.stringify(r.entries));
    assert.deepEqual(r.entries[0]?.key, "SETTLER_LEAVES");
    assert.deepEqual(r.entries[0]?.args.slice(1, 4), ["Athens", 12, 5]);
    // Walking now, away from them: it keeps going.
    fake.sent.length = 0;
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 7, y: 5, activity: UnitActivityTypes.OPERATION }];
    run({ settlers: true });
    assert.deepEqual(orders(), []);
    // A way that comes within 3 of them is not taken, though the site is safe: the next site.
    const north = foe(9, 2);
    assert.ok(dist(north, { x: 12, y: 5 }) > 3 && dist(north, { x: 8, y: 5 }) === 3);
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [raider, north] });
    r = run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], JSON.stringify(r.entries));
    // No safe site left: it waits.
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [raider, north, foe(9, 12), foe(13, 6)] });
    r = run({ settlers: true });
    assert.equal(r.entries[0]?.key, "SETTLER_WAITS", JSON.stringify(r.entries));
    delete world.wars;
});

test("settlers: one already walking gets a new order when an enemy comes near it or its way", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
    // Walking now (two tiles on): nothing new while the way is clear.
    fake.sent.length = 0;
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 7, y: 5, activity: UnitActivityTypes.OPERATION }];
    run({ settlers: true });
    assert.deepEqual(orders(), []);
    // An enemy turns up on its way: back home.
    Object.assign(world, AT_WAR, { enemies: [foe(9, 5)] });
    const r = run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [5, 5], JSON.stringify(r.entries));
    // On its own site it founds even with an enemy in sight.
    fake.sent.length = 0;
    world.enemies = [];
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }];
    run({ settlers: true });
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }];
    world.enemies = [foe(14, 5)];
    fake.sent.length = 0;
    run({ settlers: true });
    assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_FOUND_CITY"]);
    delete world.wars;
});

test("raiders: a melee soldier strikes one next to it when the game's prediction says it pays", async () => {
    const attackOf = (id) => orderOf(id).find((s) => s.op === UnitOperationTypes.MOVE_TO && s.args.Modifiers & UnitOperationMoveModifiers.ATTACK)?.args;
    const raider = foe(6, 5); // next to Athens
    // Fortified in Athens: it wakes to strike (a good trade: 60 dealt, 20 taken).
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5, activity: UnitActivityTypes.SLEEP }], { ...AT_WAR, enemies: [raider], combat: () => ({ dealt: 60, taken: 20 }) });
    let r = await units.strikeRaiders();
    assert.deepEqual([attackOf(4)?.X, attackOf(4)?.Y], [6, 5], JSON.stringify(orders()));
    assert.equal(r.entries[0]?.key, "STRUCK");
    assert.ok(r.ordered.has("0:4"));
    // A poor trade, or one that leaves it below half its health: no attack (and UI.log says why).
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        for (const combat of [() => ({ dealt: 30, taken: 25 }), () => ({ dealt: 90, taken: 60 }), () => null]) {
            fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5 }], { ...AT_WAR, enemies: [raider], combat });
            r = await units.strikeRaiders();
            assert.deepEqual(orders(), [], String(combat));
        }
    } finally {
        console.warn = warn;
    }
    const why = lines.filter((l) => l.includes("strike: 1 raider"));
    assert.equal(why.length, 3, JSON.stringify(lines));
    assert.match(why[0], /0 without the game's prediction, 0 impossible, 1 not worth it/);
    assert.match(why[2], /0 without the game's prediction, 1 impossible, 0 not worth it/, "an answer without the attacker: no attack possible");
    // An even trade that kills a wounded raider: yes.
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5 }], { ...AT_WAR, enemies: [{ ...raider, damage: 70 }], combat: () => ({ dealt: 35, taken: 30 }) });
    await units.strikeRaiders();
    assert.ok(attackOf(4));
    // A ranged unit (it shoots instead), no attack left, a raider in a settlement's defences, one not next to it: no.
    const good = () => ({ dealt: 60, taken: 20 });
    for (const [list, extra, why] of [
        [[{ id: 4, type: "UNIT_ARCHER", x: 5, y: 5, ranged: 25, melee: 15 }], {}, "ranged"],
        [[{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5, attacks: 0 }], {}, "no attack left"],
        [[{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5 }], { districtAt: (x, y) => x === 6 && y === 5 }, "a settlement"],
        [[{ id: 4, type: "UNIT_WARRIOR", x: 4, y: 5 }], {}, "two tiles away"],
    ]) {
        fresh(list, { ...AT_WAR, enemies: [raider], combat: good, ...extra });
        await units.strikeRaiders();
        assert.deepEqual(orders(), [], why);
    }
    // Far from our settlements, or not hostile (no war): no.
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 14, y: 15 }], { ...AT_WAR, enemies: [foe(15, 15)], combat: good });
    await units.strikeRaiders();
    assert.deepEqual(orders(), [], "far from home");
    fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5 }], { enemies: [raider], combat: good });
    await units.strikeRaiders();
    assert.deepEqual(orders(), [], "not at war");
    delete world.wars;
});

test("raiders: ranged soldiers on guard shoot the hostile soldiers they reach (game 27: Ханькоу's Field Gun slept on alert while two Dreadnoughts shelled the centre)", async () => {
    const shotOf = (id) => orderOf(id).find((s) => s.op === UnitOperationTypes.RANGE_ATTACK)?.args;
    const ship = { x: 6, y: 6, owner: 1, type: "UNIT_GALLEY" }; // next to Athens (5,5)
    const reach = (ids) => (id) => (ids.includes(id.id) ? [{ x: 6, y: 6 }] : []);
    // On alert in Athens' centre (busy: commandUnits leaves it alone): it shoots, and the pass knows it has its order.
    fresh([{ id: 4, type: "UNIT_ARCHER", x: 5, y: 5, activity: UnitActivityTypes.SLEEP }], { ...AT_WAR, enemies: [ship], rangeTargets: reach([4]) });
    let r = await units.strikeRaiders();
    assert.deepEqual([shotOf(4)?.X, shotOf(4)?.Y], [6, 6], JSON.stringify(orders()));
    assert.deepEqual(r.entries.map((e) => e.key), ["RANGED"]);
    assert.ok(r.ordered.has("0:4"));
    // Two guards, one after the other; one resting hurt in the centre (a garrison holds its tile) shoots too.
    fresh([
        { id: 4, type: "UNIT_ARCHER", x: 5, y: 5, activity: UnitActivityTypes.HEAL, damage: 40 },
        { id: 6, type: "UNIT_ARCHER", x: 4, y: 5, activity: UnitActivityTypes.SLEEP },
    ], { ...AT_WAR, enemies: [ship], rangeTargets: reach([4, 6]) });
    r = await units.strikeRaiders();
    assert.ok(shotOf(4) && shotOf(6), JSON.stringify(orders()));
    assert.deepEqual(r.entries.map((e) => e.key), ["RANGED", "RANGED"]);
    // No shot: at a unit we are not at war with; from a unit on its way (a move order); from one hurt and resting off
    // a centre with the enemy next to it (it gets out of reach: escape); with no attack left.
    for (const [list, wars, why] of [
        [[{ id: 4, type: "UNIT_ARCHER", x: 5, y: 5, activity: UnitActivityTypes.SLEEP }], [], "not at war"],
        [[{ id: 4, type: "UNIT_ARCHER", x: 5, y: 5, activity: UnitActivityTypes.OPERATION }], [1], "on its way"],
        [[{ id: 4, type: "UNIT_ARCHER", x: 6, y: 5, activity: UnitActivityTypes.HEAL, damage: 40 }], [1], "in danger off the centre"],
        [[{ id: 4, type: "UNIT_ARCHER", x: 5, y: 5, activity: UnitActivityTypes.SLEEP, attacks: 0 }], [1], "no attack left"],
    ]) {
        fresh(list, { wars, enemies: [ship], rangeTargets: reach([4]) });
        await units.strikeRaiders();
        assert.deepEqual(orders(), [], why);
    }
    delete world.wars;
});

test("raiders: the trade rule", () => {
    const at = (o) => units.strikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, ...o });
    assert.equal(at({ dealt: 40, taken: 20 }), true);
    assert.equal(at({ dealt: 39, taken: 20 }), false);
    assert.equal(at({ dealt: 41, taken: 22, siege: true }), true, "a siege: 1.3 times is enough (research/23 D8)");
    assert.equal(at({ dealt: 25, taken: 22, siege: true }), false);
    assert.equal(at({ dealt: 100, taken: 45 }), true, "a kill");
    assert.equal(at({ dealt: 100, taken: 51 }), false, "below half");
    assert.equal(at({ dealt: 0, taken: 0 }), false);
});

test("settlers: never a site closer than 5 tiles to another player's settlement (the game's suggestions too)", () => {
    const babylon = world.cities.find((c) => c.name === "Babylon");
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: babylon.x - 3, y: babylon.y, rank: 1 }, { x: 12, y: 5, rank: 2 }] } } });
    try {
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { aiSuggestions: () => [{ location: { x: babylon.x - 2, y: babylon.y } }] });
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
        state.set({ results: { ...state.get().results, sites: { picks: [] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { aiSuggestions: () => [{ location: { x: babylon.x - 2, y: babylon.y } }] });
        run({ settlers: true });
        assert.equal(moveOf(2), undefined, "the game's suggestion is 2 tiles from Babylon");
    } finally {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }, { x: 9, y: 10, rank: 2 }, { x: 38, y: 18, rank: 3 }] } } });
    }
});

test("rough seas: a unit on deep ocean heads for the nearest coast (a ship) or land; the game's own exploring waits for calm seas", () => {
    const tiles = world.tiles;
    const age = Game.age;
    const terrainAt = (x, y) => world.tiles(x, y).terrain;
    try {
        Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION").$hash;
        world.tiles = (x, y) => ({ ...tiles(x, y), terrain: y >= 12 ? "TERRAIN_OCEAN" : y >= 10 ? "TERRAIN_COAST" : "TERRAIN_FLAT" });
        fresh([{ id: 7, type: "UNIT_GALLEY", x: 5, y: 14 }, { id: 8, type: "UNIT_SCOUT", x: 9, y: 13 }]);
        const r = run({ explore: true, roam: true });
        assert.equal(terrainAt(moveOf(7)?.X, moveOf(7)?.Y), "TERRAIN_COAST", JSON.stringify(orders()));
        assert.equal(terrainAt(moveOf(8)?.X, moveOf(8)?.Y), "TERRAIN_FLAT", "a land unit to land");
        assert.deepEqual(r.entries.map((e) => e.key), ["LEFT_OCEAN", "LEFT_OCEAN"]);
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 5, y: 5 }]);
        run({ explore: true });
        assert.ok(!orders().some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), "it would sail or embark into the ocean");
        // A ship roaming the coast: the edge of the fog lies on deep ocean, so it stays.
        world.tiles = (x, y) => ({ ...tiles(x, y), terrain: y >= 12 ? "TERRAIN_OCEAN" : y >= 10 ? "TERRAIN_COAST" : "TERRAIN_FLAT", revealed: y < 13 });
        fresh([{ id: 7, type: "UNIT_GALLEY", x: 5, y: 10 }]);
        run({ roam: true });
        assert.ok(!orders().some((s) => s.op === UnitOperationTypes.MOVE_TO && terrainAt(s.args.X, s.args.Y) === "TERRAIN_OCEAN"), JSON.stringify(orders()));
        world.tiles = (x, y) => ({ ...tiles(x, y), terrain: y >= 12 ? "TERRAIN_OCEAN" : y >= 10 ? "TERRAIN_COAST" : "TERRAIN_FLAT" });
        Game.age = age;
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 5, y: 5 }]);
        run({ explore: true });
        assert.ok(orders().some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), "Antiquity: the game explores");
    } finally {
        Game.age = age;
        world.tiles = tiles;
    }
});

test("a soldier or scout waiting on water (coast, a navigable river: embarked, it cannot fight) goes ashore; one walking keeps its order", () => {
    const tiles = world.tiles;
    const terrainAt = (x, y) => world.tiles(x, y).terrain;
    try {
        // Calm seas (Antiquity): coast below y 10, a navigable river along x 20.
        world.tiles = (x, y) => ({ ...tiles(x, y), terrain: y >= 10 ? "TERRAIN_COAST" : x === 20 ? "TERRAIN_NAVIGABLE_RIVER" : "TERRAIN_FLAT" });
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 9, y: 11 }, { id: 9, type: "UNIT_ARCHER", x: 20, y: 6 }]);
        const r = run({ explore: false, defend: true });
        assert.equal(terrainAt(moveOf(8)?.X, moveOf(8)?.Y), "TERRAIN_FLAT", JSON.stringify(orders()));
        assert.equal(terrainAt(moveOf(9)?.X, moveOf(9)?.Y), "TERRAIN_FLAT", "off the river");
        assert.deepEqual(r.entries.map((e) => e.key), ["LEFT_WATER", "LEFT_WATER"]);
        // Not next to a hostile unit: every land tile beside the archer touches one, so it walks further.
        const enemies = [foe(18, 5), foe(18, 7), foe(22, 6)];
        const beside = GameplayMap.getPlotIndicesInRadius(20, 6, 1).map((i) => GameplayMap.getLocationFromIndex(i)).filter((l) => l.x !== 20);
        assert.ok(beside.length > 0 && beside.every((l) => enemies.some((e) => dist(e, l) === 1)), JSON.stringify(beside));
        fresh([{ id: 9, type: "UNIT_ARCHER", x: 20, y: 6 }], { ...AT_WAR, enemies });
        run({ defend: true });
        const to = moveOf(9);
        assert.ok(to && enemies.every((e) => dist({ x: to.X, y: to.Y }, e) > 1) && terrainAt(to.X, to.Y) === "TERRAIN_FLAT", JSON.stringify(orders()));
        delete world.wars;
        // Walking across the water: its order stands.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 9, y: 11, activity: UnitActivityTypes.OPERATION }]);
        run({ explore: false });
        assert.deepEqual(orders(), []);
    } finally {
        world.tiles = tiles;
    }
});

test("scouts step away from hostile units, even while exploring by themselves; with one in sight the game's exploring is not used", () => {
    const here = { x: 8, y: 5 };
    const enemy = foe(9, 5);
    fresh([{ id: 8, type: "UNIT_SCOUT", ...here }], { ...AT_WAR, enemies: [enemy] });
    let r = run({ explore: true });
    const to = moveOf(8);
    assert.ok(to && dist({ x: to.X, y: to.Y }, enemy) > dist(here, enemy), JSON.stringify(orders()));
    assert.equal(r.entries[0]?.key, "UNIT_AWAY");
    fresh([{ id: 8, type: "UNIT_SCOUT", ...here, activity: 999 }], { ...AT_WAR, enemies: [enemy] });
    r = run({ explore: true });
    assert.equal(r.entries[0]?.key, "UNIT_AWAY", "exploring by itself");
    fresh([{ id: 8, type: "UNIT_SCOUT", ...here }], { ...AT_WAR, enemies: [foe(11, 5)] });
    run({ explore: true });
    assert.ok(!orders().some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"));
});

test("discoveries: none next to hostile units; after a scout died on its way the next one goes around; after two, it is left alone", () => {
    const structures = world.structures;
    const CAVE = { x: 12, y: 5 };
    world.structures = (x, y) => (x === CAVE.x && y === CAVE.y ? { district: null, constructibles: ["IMPROVEMENT_CAVE"] } : { district: null, constructibles: [] });
    const toCave = () => orders().some((s) => s.op === UnitOperationTypes.MOVE_TO && s.args.X === CAVE.x && s.args.Y === CAVE.y);
    try {
        fresh([{ id: 60, type: "UNIT_SCOUT", x: 5, y: 5 }], { ...AT_WAR, enemies: [foe(12, 7)] });
        run({ explore: true });
        assert.ok(!toCave(), "an enemy stands 2 tiles from it");
        // Scout 60 goes for it, gets as far as 8,5 and dies there.
        fresh([{ id: 60, type: "UNIT_SCOUT", x: 5, y: 5 }]);
        run({ explore: true });
        assert.ok(toCave());
        fake.sent.length = 0;
        world.units = [{ id: 60, type: "UNIT_SCOUT", x: 8, y: 5, activity: UnitActivityTypes.OPERATION, moved: true }];
        run({ explore: true });
        world.units = [{ id: 61, type: "UNIT_SCOUT", x: 5, y: 5 }];
        fake.sent.length = 0;
        let r = run({ explore: true });
        const detour = r.entries.find((e) => e.key === "DETOUR");
        assert.ok(detour, JSON.stringify(r.entries));
        const via = moveOf(61);
        assert.ok(dist({ x: via.X, y: via.Y }, { x: 8, y: 5 }) > 2, "the waypoint keeps clear of where 60 died");
        assert.ok(dist({ x: via.X, y: via.Y }, CAVE) < dist({ x: 5, y: 5 }, CAVE), "and gets closer to the cave");
        // Scout 61 dies as well: the cave is left alone for now.
        world.units = [{ id: 62, type: "UNIT_SCOUT", x: 5, y: 5 }];
        fake.sent.length = 0;
        r = run({ explore: true });
        assert.ok(!r.entries.some((e) => e.key === "DISCOVERY" || e.key === "DETOUR"), JSON.stringify(r.entries));
    } finally {
        world.structures = structures;
    }
});

test("settlers: never a site that would anger an independent's village: within 6 of any, friendly or not (the game's suggestions too)", () => {
    // Seen in game 5: five villages declared war the turn we settled 4-5 tiles away; four of those settlements fell.
    const village = { owner: 9, x: 16, y: 5 };
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }, { x: 9, y: 10, rank: 2 }] } } });
    try {
        // 12,5 is 4 tiles from a neutral village: skipped for the next site.
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { villages: [village], indepRelation: { 9: IndependentRelationship.NEUTRAL } });
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10]);
        // A friendly village too (probe P2, game 6: friendly camps declared war at a founding 4-5 tiles away).
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { villages: [village], indepRelation: { 9: IndependentRelationship.FRIENDLY } });
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10]);
        // 3 tiles: never, friendly or not; nor the game's own suggestion that close.
        state.set({ results: { ...state.get().results, sites: { picks: [] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { villages: [{ ...village, x: 15 }], indepRelation: { 9: IndependentRelationship.FRIENDLY }, aiSuggestions: () => [{ location: { x: 12, y: 5 } }] });
        run({ settlers: true });
        assert.equal(moveOf(2), undefined, "the game's suggestion is 3 tiles from the village");
        // An unseen village does not count (we cannot know it).
        const tiles = world.tiles;
        world.tiles = (x, y) => ({ ...tiles(x, y), revealed: !(x === 15 && y === 5) });
        try {
            fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { villages: [{ ...village, x: 15 }], aiSuggestions: () => [{ location: { x: 12, y: 5 } }] });
            run({ settlers: true });
            assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
        } finally {
            world.tiles = tiles;
        }
    } finally {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }, { x: 9, y: 10, rank: 2 }, { x: 38, y: 18, rank: 3 }] } } });
    }
});

test("raiders: no prediction from the game (probe P1): a clearly stronger soldier strikes on the estimate, a weaker one does not", async () => {
    const attackOf = (id) => orderOf(id).find((s) => s.op === UnitOperationTypes.MOVE_TO && s.args.Modifiers & UnitOperationMoveModifiers.ATTACK)?.args;
    const raider = { x: 6, y: 5, owner: 1, type: "UNIT_WARRIOR" };
    try {
        fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5, melee: 45 }], { wars: [1], enemies: [raider], noPrediction: true });
        let r = await units.strikeRaiders();
        assert.deepEqual([attackOf(4)?.X, attackOf(4)?.Y], [6, 5], JSON.stringify(r.entries));
        fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5, melee: 15 }], { wars: [1], enemies: [raider], noPrediction: true });
        r = await units.strikeRaiders();
        assert.equal(attackOf(4), undefined, "weaker: no");
    } finally {
        delete world.noPrediction;
        delete world.wars;
    }
});

test("a settler walking for 12 turns takes the nearest safe site, any role (research/21 C3a)", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 8, y: 9 }]);
    let r = run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5], "the best site first");
    const turn = Game.turn;
    try {
        Game.turn += 12;
        fake.sent.length = 0;
        r = run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "SETTLER_GIVES_UP"));
    } finally {
        Game.turn = turn;
    }
});

test("a rival's countdown to beat (settleNear, research/24 F1): a settler takes the nearest safe site, over a farther goal too", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 8, y: 9 }]);
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5], "the best site first");
    fake.sent.length = 0;
    run({ settlers: true, settleNear: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10]);
});

test("threats count the land raiders apart: ships near a settlement are not land raiders (research/22 B7)", () => {
    fresh([], { ...AT_WAR, enemies: [{ x: 6, y: 5, owner: 1, type: "UNIT_GALLEY" }, { x: 4, y: 5, owner: 1, type: "UNIT_GALLEY" }] });
    try {
        const [t] = units.threatenedSettlements();
        assert.deepEqual([t?.settlement.name, t?.count, t?.land, t?.ships], ["Athens", 2, 0, 2], "ships are counted apart (game 10: ranged defenders against them)");
        fresh([], { ...AT_WAR, enemies: [foe(6, 5), { x: 4, y: 5, owner: 1, type: "UNIT_GALLEY" }] });
        assert.equal(units.threatenedSettlements()[0]?.land, 1);
    } finally {
        delete world.wars;
    }
});

test("a settler stepping away from raiders stays on our land (research/22 B8: one stepped out of our borders and was killed)", () => {
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), owner: x <= 8 && Math.abs(y - 5) <= 3 ? 0 : -1 });
    try {
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 8, y: 5, damage: 50 }], { ...AT_WAR, enemies: [foe(7, 5)] });
        const r = run({ settlers: true });
        const m = moveOf(2);
        assert.ok(!m || GameplayMap.getOwner(m.X, m.Y) === 0, `moved to ${JSON.stringify(m)}: ${JSON.stringify(r.entries)}`);
    } finally {
        world.tiles = tiles;
        delete world.wars;
    }
});

test("few settlements: only sites within 5 turns, the best value per turn of walking (research/22 A1: game 7 walks of 6-10 turns)", () => {
    const keep = state.get().results.sites;
    try {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 16, y: 14, rank: 1 }, { x: 9, y: 7, rank: 2 }] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 7], "16,14 is 8 turns away");
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 14, y: 5, rank: 1, value: 1 }, { x: 7, y: 6, rank: 2, value: 0.9 }] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [7, 6], "0.9 a turn away beats 1.0 five turns away");
    } finally {
        state.set({ results: { ...state.get().results, sites: keep } });
    }
});

test("a settler waiting in a threatened settlement goes for a near site after 3 turns, by a way never next to the raiders (research/22 A1: game 7, 19 turns)", () => {
    const raider = foe(2, 5);
    const north = foe(9, 2);
    // Only the site itself can be walked to (no waypoint around the danger: the wide detour is not possible).
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [raider, north, foe(9, 12)], unreachable: (x, y) => !(x === 12 && y === 5) });
    const turn = Game.turn;
    try {
        let r;
        for (let i = 0; i < 3; i++) {
            fake.sent.length = 0;
            Game.turn = turn + i;
            r = run({ settlers: true });
            assert.equal(r.entries[0]?.key, "SETTLER_WAITS", `turn ${i + 1}: ${JSON.stringify(r.entries)}`);
        }
        fake.sent.length = 0;
        Game.turn = turn + 3;
        r = run({ settlers: true });
        assert.equal(r.entries[0]?.key, "SETTLER_GOES", JSON.stringify(r.entries));
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
    } finally {
        Game.turn = turn;
        delete world.wars;
    }
});

test("a settler takes a site from the relaxed search 4 tiles from a foreign settlement; a normal one keeps 5 (research/22 A1)", () => {
    const keep = state.get().results.sites;
    try {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 16, y: 5, rank: 1, relaxed: true }] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 14, y: 5 }]);
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [16, 5], "4 tiles from Babylon: relaxed");
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 16, y: 5, rank: 1 }] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 14, y: 5 }]);
        run({ settlers: true });
        assert.notDeepEqual([moveOf(2)?.X, moveOf(2)?.Y], [16, 5], "not relaxed: 5 tiles");
    } finally {
        state.set({ results: { ...state.get().results, sites: keep } });
    }
});

test("raiders next to our settlement (a siege): a 41-to-22 trade is taken; away from it, not (research/23 D8: Забид fell while such strikes were refused)", async () => {
    const attackOf = (id) => orderOf(id).find((s) => s.op === UnitOperationTypes.MOVE_TO && s.args.Modifiers & UnitOperationMoveModifiers.ATTACK)?.args;
    try {
        fresh([{ id: 4, type: "UNIT_WARRIOR", x: 5, y: 5 }], { wars: [1], enemies: [foe(6, 5)], combat: () => ({ dealt: 41, taken: 22 }) });
        await units.strikeRaiders();
        assert.deepEqual([attackOf(4)?.X, attackOf(4)?.Y], [6, 5], "next to Athens");
        fresh([{ id: 4, type: "UNIT_WARRIOR", x: 6, y: 7 }], { wars: [1], enemies: [foe(7, 8)], combat: () => ({ dealt: 41, taken: 22 }) });
        await units.strikeRaiders();
        assert.equal(attackOf(4), undefined, "two tiles from Athens, its centre whole");
    } finally {
        delete world.wars;
    }
});

test("a hurt soldier near hostile units steps back before it heals; a garrison heals where it stands (research/23 D11)", () => {
    try {
        fresh([{ id: 4, type: "UNIT_WARRIOR", x: 8, y: 5, damage: 40 }], { wars: [1], enemies: [foe(10, 5)] });
        let r = run({ defend: true });
        assert.equal(r.entries[0]?.key, "WITHDRAW", JSON.stringify(r.entries));
        assert.ok(moveOf(4));
        fresh([{ id: 4, type: "UNIT_WARRIOR", x: 8, y: 5, damage: 40 }], { wars: [1], enemies: [foe(14, 5)] });
        r = run({ defend: true });
        assert.equal(r.entries[0]?.key, "HEAL", "no hostile unit near");
    } finally {
        delete world.wars;
    }
});

test("a hurt soldier resting next to land melee raiders hides on shallow water when no ship or ranged unit is near; with a ship near it withdraws on land (research/24 W6)", () => {
    const tiles = world.tiles;
    const terrainAt = (x, y) => world.tiles(x, y).terrain;
    try {
        world.tiles = (x, y) => ({ ...tiles(x, y), terrain: y >= 10 ? "TERRAIN_COAST" : "TERRAIN_FLAT" });
        const hurt = { id: 7, type: "UNIT_WARRIOR", x: 12, y: 9, damage: 60, activity: UnitActivityTypes.HEAL };
        fresh([hurt], { ...AT_WAR, enemies: [foe(12, 8), foe(13, 8)] });
        let r = run({ defend: true });
        assert.equal(terrainAt(moveOf(7)?.X, moveOf(7)?.Y), "TERRAIN_COAST", JSON.stringify(orders()));
        assert.equal(r.entries[0]?.key, "TO_WATER");
        fresh([hurt], { ...AT_WAR, enemies: [foe(12, 8), foe(13, 8), { x: 12, y: 13, owner: 1, type: "UNIT_GALLEY" }] });
        r = run({ defend: true });
        assert.equal(terrainAt(moveOf(7)?.X, moveOf(7)?.Y), "TERRAIN_FLAT", "a galley would sink it there");
        assert.equal(r.entries[0]?.key, "WITHDRAW");
        fresh([hurt], { ...AT_WAR, enemies: [foe(12, 8), { x: 13, y: 7, owner: 1, type: "UNIT_ARCHER" }] });
        r = run({ defend: true });
        assert.notEqual(r.entries[0]?.key, "TO_WATER", "an archer shoots onto the water");
    } finally {
        world.tiles = tiles;
    }
});

test("on shallow water with land raiders ashore it stays there (no ship, no ranged unit near); with them gone it goes ashore (the user: units die where water would save them)", () => {
    const tiles = world.tiles;
    try {
        world.tiles = (x, y) => ({ ...tiles(x, y), terrain: y >= 10 ? "TERRAIN_COAST" : "TERRAIN_FLAT" });
        fresh([{ id: 7, type: "UNIT_WARRIOR", x: 12, y: 10, damage: 60 }], { ...AT_WAR, enemies: [foe(12, 9), foe(13, 8)] });
        let r = run({ defend: true });
        assert.deepEqual([r.entries[0]?.key, moveOf(7)], ["WATER_WAIT", undefined], JSON.stringify(orders()));
        assert.ok(orderOf(7).some((s) => s.op === "UNITOPERATION_SKIP_TURN"));
        fresh([{ id: 7, type: "UNIT_WARRIOR", x: 12, y: 10, damage: 60 }], { ...AT_WAR, enemies: [foe(30, 2)] });
        r = run({ defend: true });
        assert.equal(r.entries[0]?.key, "LEFT_WATER");
    } finally {
        world.tiles = tiles;
    }
});

test("a new age's upkeep above the gold income: soldiers above 2 per settlement are disbanded, furthest from foreign settlements first, never a garrison (research/24 G3)", () => {
    const soldiers = [
        { id: 70, type: "UNIT_WARRIOR", x: 5, y: 5 },  // Athens' garrison
        { id: 71, type: "UNIT_WARRIOR", x: 12, y: 5 },
        { id: 72, type: "UNIT_WARRIOR", x: 2, y: 2 },
        { id: 73, type: "UNIT_WARRIOR", x: 10, y: 5 },
        { id: 74, type: "UNIT_WARRIOR", x: 6, y: 7 },
    ];
    const deleted = () => orders().filter((s) => s.op === "UNITCOMMAND_DELETE").map((s) => s.id.id).sort((a, b) => a - b);
    const go = (o) => units.disbandSurplus({ income: 10, ageFrac: 0.02, firstAge: false, peace: true, ...o });
    try {
        fresh(soldiers, { unitUpkeep: () => 5, unitCommandOk: (_id, op) => op === "UNITCOMMAND_DELETE" });
        const out = go();
        assert.deepEqual(deleted(), [72, 74], JSON.stringify(out));
        assert.equal(out[0]?.key, "DISBANDED");
        for (const o of [{ peace: false }, { firstAge: true }, { ageFrac: 0.5 }, { income: 30 }]) {
            fresh(soldiers, { unitUpkeep: () => 5, unitCommandOk: (_id, op) => op === "UNITCOMMAND_DELETE" });
            assert.deepEqual([go(o), deleted()], [[], []], JSON.stringify(o));
        }
    } finally {
        delete world.unitUpkeep;
    }
});

test("below 3 settlements a settler with no site 5 turns away for 2 turns takes one up to 10 turns away; the nearest give-up looks that far at once (research/24 X2)", () => {
    const picks = state.get().results.sites;
    const turn = Game.turn;
    try {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 5, y: 19, rank: 1 }] } } }); // 7 turns away
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        run({ settlers: true });
        assert.equal(moveOf(2), undefined, "turn 1: beyond 5 turns");
        assert.equal(units.settlersStarved(), false);
        Game.turn = turn + 1;
        fake.sent.length = 0;
        run({ settlers: true });
        assert.equal(moveOf(2), undefined, "turn 2");
        assert.equal(units.settlersStarved(), true, "the hud's relaxed search runs");
        Game.turn = turn + 2;
        fake.sent.length = 0;
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [5, 19], "turn 3: up to 10 turns");
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        run({ settlers: true, settleNear: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [5, 19], "the nearest: up to 10 turns at once");
    } finally {
        Game.turn = turn;
        state.set({ results: { ...state.get().results, sites: picks } });
    }
});

test("a settler in a garrisoned, undamaged centre waits instead of retreating; retreats count as waits, then it goes for a near site (research/24 X5: 18 retreats in Antiquity)", () => {
    const turn = Game.turn;
    world.cities.push({ owner: 0, x: 5, y: 12, name: "Sparta" });
    try {
        // No site anywhere: it may only wait or retreat.
        state.set({ results: { ...state.get().results, sites: { picks: [] } } });
        const garrison = { id: 9, type: "UNIT_WARRIOR", x: 5, y: 5 };
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }, garrison], { ...AT_WAR, enemies: [foe(3, 3)] });
        let r = run({ settlers: true });
        assert.ok(r.entries.some((e) => e.key === "SETTLER_WAITS"), JSON.stringify(r.entries));
        assert.equal(moveOf(2), undefined, "it stays in Athens behind its garrison");
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [foe(3, 3)] });
        const keys = [];
        for (let i = 0; i < 4; i++) {
            Game.turn = turn + 300 + i;
            fake.sent.length = 0;
            keys.push(run({ settlers: true }).entries.map((e) => e.key).find((k) => k.startsWith("SETTLER_")));
        }
        assert.deepEqual(keys, ["SETTLER_RETREAT", "SETTLER_RETREAT", "SETTLER_RETREAT", "SETTLER_WAITS"], "the fourth turn of waiting and retreating: no more back and forth");
    } finally {
        Game.turn = turn;
        world.cities.pop();
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }, { x: 9, y: 10, rank: 2 }, { x: 38, y: 18, rank: 3 }] } } });
    }
});

test("a walking settler with no progress for 2 turns founds where it stands; when it may not, it drops that site and takes another (research/24 X6)", () => {
    const turn = Game.turn;
    const walking = { id: 2, type: "UNIT_SETTLER", x: 10, y: 5, activity: UnitActivityTypes.OPERATION };
    try {
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 10, y: 5 }]);
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
        world.units = [walking];
        for (let i = 1; i <= 2; i++) {
            Game.turn = turn + 400 + i;
            fake.sent.length = 0;
            run({ settlers: true });
        }
        assert.ok(orderOf(2).some((s) => s.op === "UNITOPERATION_FOUND_CITY"), JSON.stringify(orders()));
        // The game will not let it found there: another site.
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 10, y: 5 }], { unitCanStart: (_id, op) => (op === "UNITOPERATION_FOUND_CITY" ? { Success: false } : undefined) });
        run({ settlers: true });
        world.units = [walking];
        for (let i = 1; i <= 2; i++) {
            Game.turn = turn + 500 + i;
            fake.sent.length = 0;
            run({ settlers: true });
        }
        assert.ok(moveOf(2) && !(moveOf(2).X === 12 && moveOf(2).Y === 5), JSON.stringify(orders()));
    } finally {
        Game.turn = turn;
    }
});

test("a settler leaves a raided settlement around the danger, widely: a waypoint first, its site kept (game 10: it waited and shuttled instead)", () => {
    const raider = foe(2, 5);
    const north = foe(9, 2);
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [raider, north, foe(9, 12)] });
    const r = run({ settlers: true });
    const to = moveOf(2);
    assert.equal(r.entries[0]?.key, "SETTLER_LEAVES", JSON.stringify(r.entries));
    assert.ok(to && !(to.X === 12 && to.Y === 5), "not straight past the northern raider");
    assert.ok([raider, north, foe(9, 12)].every((e) => dist({ x: to.X, y: to.Y }, e) > 3), JSON.stringify(to));
    assert.deepEqual(units.settlerGoals().map((g) => [g.x, g.y]), [[12, 5]], "the site stays its goal");
    delete world.wars;
});

test("a walking settler whose way now passes danger goes around it widely instead of home (game 10: home twice, 4 turns lost)", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 8, y: 7 }]);
    run({ settlers: true });
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
    // A raider appears beside the way, 3 tiles from the settler and 4 from the site.
    fake.sent.length = 0;
    Object.assign(world, { ...AT_WAR, enemies: [foe(9, 4)] });
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 8, y: 7, activity: UnitActivityTypes.OPERATION }];
    const r = run({ settlers: true });
    assert.equal(r.entries[0]?.key, "SETTLER_DETOUR", JSON.stringify(r.entries));
    const to = moveOf(2);
    assert.ok(to && dist({ x: to.X, y: to.Y }, foe(9, 4)) > 3, JSON.stringify(to));
    delete world.wars;
});

test("two settlers on one raided settlement cannot skip: one steps aside, away from the raiders, so the turn can end (game 10)", () => {
    const stacked = (id, op) => (op === "UNITOPERATION_SKIP_TURN" ? { Success: false } : undefined);
    state.set({ results: { ...state.get().results, sites: { picks: [] } } });
    try {
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }, { id: 3, type: "UNIT_SETTLER", x: 5, y: 5 }], { ...AT_WAR, enemies: [foe(7, 5)], unitCanStart: stacked });
        const r = run({ settlers: true });
        const moved = [2, 3].map(moveOf).filter(Boolean);
        assert.ok(moved.length >= 1, JSON.stringify(r.entries));
        assert.ok(moved.every((m) => dist({ x: m.X, y: m.Y }, foe(7, 5)) > 1), JSON.stringify(moved));
        assert.ok(r.entries.some((e) => e.key === "STEP_ASIDE"));
    } finally {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }, { x: 9, y: 10, rank: 2 }, { x: 38, y: 18, rank: 3 }] } } });
        delete world.wars;
    }
});

test("a scout hit twice in one place: the spot is avoided, no game auto-explore while hurt or near danger; badly hurt it heals at home (game 10)", () => {
    const turn = Game.turn;
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), revealed: x < 22 }); // fog from x 22: a frontier to explore
    try {
        // Turn 1: unhurt, nobody near: the game explores with it.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 14, y: 8 }]);
        run({ explore: true });
        assert.ok(orderOf(8).some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"));
        // Turn 2: hit (damage rose), the warrior out of sight now: our own frontier, widely, not the game's exploring.
        Game.turn = turn + 1;
        fake.sent.length = 0;
        world.units = [{ id: 8, type: "UNIT_SCOUT", x: 14, y: 8, damage: 30 }];
        let r = run({ explore: true });
        assert.ok(!orderOf(8).some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), JSON.stringify(r.entries));
        const to = moveOf(8);
        assert.ok(to && dist({ x: to.X, y: to.Y }, { x: 14, y: 8 }) > 3, `away from where it was hit: ${JSON.stringify(r.entries)}`);
        // Another scout, unhurt, 2 tiles from that spot (the warrior unseen): no game auto-explore there either.
        fake.sent.length = 0;
        world.units = [{ id: 8, type: "UNIT_SCOUT", x: 14, y: 8, damage: 30 }, { id: 9, type: "UNIT_SCOUT", x: 16, y: 8 }];
        run({ explore: true });
        assert.ok(!orderOf(9).some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), "the hit spot is danger for 5 turns");
        // Badly hurt: home to heal (Athens).
        Game.turn = turn + 2;
        fake.sent.length = 0;
        world.units = [{ id: 8, type: "UNIT_SCOUT", x: 10, y: 8, damage: 60 }];
        r = run({ explore: true });
        assert.equal(r.entries[0]?.key, "SCOUT_HOME", JSON.stringify(r.entries));
        assert.deepEqual([moveOf(8)?.X, moveOf(8)?.Y], [5, 5]);
    } finally {
        Game.turn = turn;
        world.tiles = tiles;
    }
});

test("scouts first reveal the unseen villages near our settlements, the nearest first, one scout each (game 10: «0 seen, 16 unseen», no befriending until turn 56)", () => {
    const tiles = world.tiles;
    const villages = [{ owner: 9, x: 14, y: 5 }, { owner: 9, x: 9, y: 9 }];
    world.tiles = (x, y) => ({ ...tiles(x, y), revealed: !villages.some((v) => v.x === x && v.y === y) });
    try {
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 5, y: 5 }, { id: 9, type: "UNIT_SCOUT", x: 6, y: 5 }], { villages });
        const r = run({ explore: true });
        const keys = r.entries.map((e) => e.key);
        assert.deepEqual(keys, ["SCOUT_VILLAGE", "SCOUT_VILLAGE"], JSON.stringify(r.entries));
        const to8 = moveOf(8);
        const to9 = moveOf(9);
        assert.ok(dist({ x: to8.X, y: to8.Y }, villages[1]) <= 2, "the nearer village first");
        assert.ok(dist({ x: to9.X, y: to9.Y }, villages[0]) <= 2, "the other scout to the other one");
        // A scout the game explores with is taken off it for the village too.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 5, y: 5, activity: UnitActivityTypes.OPERATION }], { villages });
        assert.equal(run({ explore: true }).entries[0]?.key, "SCOUT_VILLAGE");
        // Seen now: back to exploring.
        world.tiles = tiles;
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 5, y: 5 }], { villages });
        run({ explore: true });
        assert.ok(orderOf(8).some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"));
    } finally {
        world.tiles = tiles;
    }
});

test("scouts keep exploring with the game's help when hostile units are 4+ tiles away; a lightly hurt one with nothing safe to explore heals (game 11: scouts idle in half the passes)", () => {
    fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 5 }], { ...AT_WAR, enemies: [foe(12, 5)] });
    run({ explore: true });
    assert.ok(orderOf(8).some((s) => s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), "a hostile unit 4 tiles away");
    fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 5, damage: 10 }], { ...AT_WAR, enemies: [foe(11, 5)] });
    const r = run({ explore: true });
    assert.equal(r.entries[0]?.key, "HEAL", JSON.stringify(r.entries));
    delete world.wars;
});

// Game 18: the plague (25 damage a turn to units starting their turn on infected tiles, 6 turns) killed our fortified
// garrisons. Plague here: Athens and the tiles next to it.
const ATHENS = { x: 5, y: 5 };
const plagued = (x, y) => (GameplayMap.getPlotDistance(x, y, ATHENS.x, ATHENS.y) <= 1 ? ["PLOTEFFECT_PLAGUE"] : []);

test("plague: a fortified soldier in an infected city wakes and walks to the nearest safe tile it reaches this turn", () => {
    fresh([{ id: 4, type: "UNIT_WARRIOR", ...ATHENS, activity: UnitActivityTypes.SLEEP }], { plotEffects: plagued, unitCommandOk: (_id, op) => op === "UNITCOMMAND_WAKE" });
    try {
        const r = run({ defend: true });
        assert.ok(orderOf(4).some((s) => s.op === "UNITCOMMAND_WAKE"), JSON.stringify(orders()));
        const to = moveOf(4);
        assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, ATHENS.x, ATHENS.y) === 2, JSON.stringify(to));
        assert.deepEqual(r.entries.find((e) => e.key === "LEFT_HAZARD")?.args.slice(3), [25]);
        // Unit options off: the autopilot leaves units alone.
        fresh([{ id: 4, type: "UNIT_WARRIOR", ...ATHENS }], { plotEffects: plagued });
        run({});
        assert.deepEqual(orders(), []);
        // A trap hurts only who enters: no reason to leave.
        fresh([{ id: 4, type: "UNIT_WARRIOR", ...ATHENS }], { plotEffects: (x, y) => (x === ATHENS.x && y === ATHENS.y ? ["PLOTEFFECT_STONE_TRAP"] : []) });
        const t = run({ defend: true });
        assert.ok(!t.entries.some((e) => e.key === "LEFT_HAZARD"));
    } finally {
        delete world.plotEffects;
    }
});

test("plague: a healthy soldier with raiders near holds its city; a badly hurt one leaves", () => {
    const raider = { x: 8, y: 5, owner: 1, type: "UNIT_WARRIOR" };
    fresh([{ id: 4, type: "UNIT_WARRIOR", ...ATHENS }], { ...AT_WAR, enemies: [raider], plotEffects: plagued });
    try {
        let r = run({ defend: true });
        assert.ok(!r.entries.some((e) => e.key === "LEFT_HAZARD"), JSON.stringify(r.entries));
        fresh([{ id: 4, type: "UNIT_WARRIOR", ...ATHENS, damage: 60 }], { ...AT_WAR, enemies: [raider], plotEffects: plagued });
        r = run({ defend: true });
        assert.ok(r.entries.some((e) => e.key === "LEFT_HAZARD"), JSON.stringify(r.entries));
    } finally {
        delete world.plotEffects;
        delete world.wars;
    }
});

test("plague: no order sends a unit onto an infected tile (a settler takes its other site)", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }], { plotEffects: (x, y) => (x === 12 && y === 5 ? ["PLOTEFFECT_PLAGUE"] : []) });
    try {
        run({ settlers: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 10], "12,5 is infected");
    } finally {
        delete world.plotEffects;
    }
});

test("foundings ordered in a pass count toward the cap: one below it, one settler founds and the other waits (game 21 E23: three founded at once, 11 of 9)", () => {
    const n = Players.get(0).Stats.numSettlements;
    try {
        world.settlementCap = n + 1;
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5 }, { id: 3, type: "UNIT_SETTLER", x: 9, y: 10 }]);
        const r = run({ settlers: true });
        assert.equal(orders().filter((s) => s.op === "UNITOPERATION_FOUND_CITY").length, 1, JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "SETTLER_AT_CAP"), JSON.stringify(r.entries));
    } finally {
        delete world.settlementCap;
    }
});

test("a countdown to block (the strategy's settleAnywhere) and no site for a turn: the settler founds on the nearest tile the game accepts, our spacing aside, never on a village's doorstep (research/31 §3: game 25's settler stood idle 23 turns; game 42: 3 idle turns came at M53)", () => {
    const picks = state.get().results.sites;
    const turn = Game.turn;
    state.set({ results: { ...state.get().results, sites: { picks: [] } } });
    // Only 17,6 takes a settlement (3 tiles from Babylon: too close by our own rule, not by the game's).
    const extra = { claimOk: (x, y) => x === 17 && y === 6 };
    try {
        let r = null;
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }], extra);
        for (let t = 1; t <= 2; t++) {
            Game.turn = turn + t;
            fake.sent.length = 0;
            world.units = [{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }];
            r = run({ settlers: true, anywhere: true });
            if (t < 2) assert.deepEqual(orderOf(2).filter((s) => s.op === UnitOperationTypes.MOVE_TO), [], `turn ${t}: it waits`);
        }
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [17, 6], JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "SETTLE_ANYWHERE"));
        // Without the strategy's word: it waits on.
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }], extra);
        for (let t = 1; t <= 4; t++) {
            Game.turn = turn + 10 + t;
            fake.sent.length = 0;
            world.units = [{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }];
            run({ settlers: true });
        }
        assert.deepEqual(orderOf(2).filter((s) => s.op === UnitOperationTypes.MOVE_TO), [], "no countdown to block");
        // A village 2 tiles from the only valid tile: it turns hostile at once, so not there.
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }], { ...extra, villages: [{ owner: 9, x: 18, y: 7, type: "IMPROVEMENT_VILLAGE" }] });
        for (let t = 1; t <= 4; t++) {
            Game.turn = turn + 20 + t;
            fake.sent.length = 0;
            world.units = [{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }];
            run({ settlers: true, anywhere: true });
        }
        assert.deepEqual(orderOf(2).filter((s) => s.op === UnitOperationTypes.MOVE_TO), [], "a village's doorstep");
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }], extra);
        for (let t = 1; t <= 2; t++) {
            Game.turn = turn + 30 + t;
            fake.sent.length = 0;
            world.units = [{ id: 2, type: "UNIT_SETTLER", x: 14, y: 6 }];
            run({ settlers: true, anywhere: true });
        }
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [17, 6], "again, for the arrival");
        // Arrived: it founds there.
        Game.turn += 1;
        fake.sent.length = 0;
        world.units = [{ id: 2, type: "UNIT_SETTLER", x: 17, y: 6 }];
        run({ settlers: true, anywhere: true });
        assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_FOUND_CITY"]);
    } finally {
        Game.turn = turn;
        state.set({ results: { ...state.get().results, sites: picks } });
    }
});

// Game 42: two settlers stood ~25 turns with 4-5 of 7-8 sites «DANGER» (and 2 «FAR») while Tubman's military countdown ran,
// which one or two settlements would have broken. With a countdown to block or to start (settleAnywhere) a settler is bold:
// only live hostile units are danger (not where ours were hit lately), and it walks up to 15 turns. The log says what is danger.
test("a military countdown makes settlers bold: a site near a hit mark only, and one 15 turns away, are taken; the log names the danger", () => {
    const picks = state.get().results.sites;
    const turn = Game.turn;
    const lines = [];
    const warn = console.warn;
    const warrior = (damage) => ({ id: 7, type: "UNIT_WARRIOR", x: 12, y: 6, damage, activity: UnitActivityTypes.SLEEP });
    try {
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }] } } });
        // Our Warrior next to the site is hit: that tile is danger for a few turns (game 10's marks).
        fresh([warrior(0)]);
        Game.turn = turn + 1;
        run({});
        world.units = [warrior(20)];
        Game.turn = turn + 2;
        run({});
        console.warn = (...a) => lines.push(a.join(" "));
        world.units = [{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }, warrior(20)];
        fake.sent.length = 0;
        run({ settlers: true });
        assert.equal(moveOf(2), undefined, "a hit next to the site: not without a countdown");
        assert.ok(lines.some((l) => l.includes("settler: no order") && l.includes('danger {"marks":1}')), lines.join("\n"));
        fake.sent.length = 0;
        run({ settlers: true, anywhere: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5], "bold: only live hostile units are danger");
        // A site 11-15 turns away: too far, unless bold.
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 24, y: 18, rank: 1 }] } } });
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        const turns = Units.getPathTo({ owner: 0, id: 2 }, { x: 24, y: 18 })?.turns?.at(-1);
        assert.ok(turns > 10 && turns <= 15, `${turns} turns`);
        run({ settlers: true });
        assert.equal(moveOf(2), undefined, "FAR");
        fake.sent.length = 0;
        run({ settlers: true, anywhere: true });
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [24, 18]);
    } finally {
        console.warn = warn;
        Game.turn = turn;
        state.set({ results: { ...state.get().results, sites: picks } });
    }
});

test("a settler's «no order» line judges a relaxed pick by the relaxed rules, as pickSite does (research/31 §3: game 25 reported them FOREIGN)", () => {
    const picks = state.get().results.sites;
    // 16,5 is 4 tiles from Babylon: too close by the strict rule (5), fine by the relaxed one; 6 turns away (FAR).
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 16, y: 5, rank: 1, relaxed: true }] } } });
    const lines = [];
    const warn = console.warn;
    try {
        fresh([{ id: 2, type: "UNIT_SETTLER", x: 5, y: 5 }]);
        console.warn = (...a) => lines.push(a.join(" "));
        run({ settlers: true });
        console.warn = warn;
        const line = lines.find((l) => l.includes("settler: no order"));
        assert.ok(line?.includes('"FAR":1') && !line.includes("FOREIGN"), line);
    } finally {
        console.warn = warn;
        state.set({ results: { ...state.get().results, sites: picks } });
    }
});

// Game 35: Бристоль's settler stood next to its site when an independent's Warrior came within 3 tiles; it walked home and
// founded 5 turns later.
test("a settler next to its site with a raider near steps onto it and founds at once, not home; not with the raider next to the site", () => {
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 11, y: 5 }]);
    run({ settlers: true });
    assert.deepEqual(units.settlerGoals().map((g) => [g.x, g.y]), [[12, 5]], "its site");
    // A raider 3 tiles from the settler and the site.
    fake.sent.length = 0;
    Object.assign(world, { ...AT_WAR, enemies: [foe(12, 2)] });
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 11, y: 5, activity: UnitActivityTypes.OPERATION }];
    const r = run({ settlers: true });
    assert.equal(r.entries[0]?.key, "SETTLER_DASH", JSON.stringify(r.entries));
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [12, 5]);
    // On the site a moment later: it founds in the same pass.
    fake.sent.length = 0;
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 12, y: 5, moves: 1 }];
    const f = units.foundArrivals();
    assert.deepEqual(orderOf(2).map((s) => s.op), ["UNITOPERATION_FOUND_CITY"]);
    assert.equal(f[0]?.key, "SETTLE_FOUND");
    // A raider next to the site: no step onto it.
    units.resetUnitGoals();
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 11, y: 5 }]);
    run({ settlers: true });
    fake.sent.length = 0;
    Object.assign(world, { ...AT_WAR, enemies: [foe(13, 5)] });
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: 11, y: 5, activity: UnitActivityTypes.OPERATION }];
    const r2 = run({ settlers: true });
    assert.ok(!r2.entries.some((e) => e.key === "SETTLER_DASH"), JSON.stringify(r2.entries));
    delete world.wars;
});
