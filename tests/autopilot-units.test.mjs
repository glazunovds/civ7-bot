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
    players: [{ id: 0 }, { id: 1 }, { id: 2 }],
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
    for (const k of ["startsWar", "claimOk", "aiSuggestions", "rangeTargets", "enemies", "tradeRoutes", "unitCommandOk", "unitCommandResult", "unitCanStart", "tradeCapacity", "unreachable", "owningCity", "expand", "wars"]) delete world[k];
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

test("defence: the archer shoots the most damaged enemy, the hurt unit heals, the rest fortify", () => {
    const targets = { rangeTargets: (id) => (id.id === 4 ? [{ x: 4, y: 7 }, { x: 3, y: 6 }] : []), enemies: [{ x: 4, y: 7, damage: 10 }, { x: 3, y: 6, damage: 50 }] };
    fresh(army(), targets);
    const r = run({ defend: true });
    const shot = orderOf(4).find((s) => s.op === UnitOperationTypes.RANGE_ATTACK)?.args;
    assert.deepEqual([shot?.X, shot?.Y], [3, 6]);
    assert.deepEqual(orderOf(5).map((s) => s.op), ["UNITOPERATION_REST_UNTIL_HEALED"]);
    assert.deepEqual(orderOf(6).map((s) => s.op), ["UNITOPERATION_FORTIFY"]);
    for (const id of [1, 7, 9]) assert.deepEqual(orderOf(id), [], `unit ${id}: not military, or busy`);
    assert.deepEqual(r.entries.map((e) => e.key).sort(), ["FORTIFY", "HEAL", "RANGED"]);

    fresh(army(), { ...targets, startsWar: (_id, l) => (l.x === 3 && l.y === 6 ? 2 : undefined) });
    run({ defend: true });
    const safeShot = orderOf(4).find((s) => s.op === UnitOperationTypes.RANGE_ATTACK)?.args;
    assert.deepEqual([safeShot?.X, safeShot?.Y], [4, 7], "never a shot that declares war");
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
    steps.skipIdleUnits(new Set(["0:6"]));
    assert.deepEqual(orders(), [], "unit 6 was just told to fortify");
    steps.skipIdleUnits(new Set());
    assert.deepEqual(orders().map((s) => s.id.id), [6, 8]);
    assert.deepEqual(orders()[0].args, { X: -9999, Y: -9999, UnitAbilityType: -1 }, "the parameters the game's unit panel sends");
});

test("skipping: every idle unit, even when the first ready one was just given an order", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    fresh([{ id: 1, type: "UNIT_FOUNDER", x: 5, y: 5 }, { id: 3, type: "UNIT_WARRIOR", x: 6, y: 5 }, { id: 4, type: "UNIT_WARRIOR", x: 4, y: 5, activity: UnitActivityTypes.OPERATION }]);
    world.readyUnits = [{ owner: 0, id: 1 }];
    const out = steps.skipIdleUnits(new Set(["0:1"]));
    assert.deepEqual(orders().map((s) => s.id.id), [3], "the founder keeps its order, the busy warrior its own");
    assert.deepEqual(orders()[0].args, { X: -9999, Y: -9999, UnitAbilityType: -1 }, "the parameters the game's unit panel sends");
    assert.equal(out[0].key, "UNITS_SKIPPED");
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
