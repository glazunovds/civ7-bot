// Research/37 Phase 6: the navy. Ship roles come from the data (an Ironclad is a screen though it has a ranged strength, the
// Mikasa a ranged ship without the RANGED tag, a Submarine may not target land); our warships attack the game's way (a melee
// ship's naval attack when the preview says it pays, else a ranged shot); warships sail to guard a settlement ships attack,
// by their own path (a lake ship never reaches the sea), without taking its land holder's place; and a lasting coastal front
// gets a warship trained in a city on the same water.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

// The sea: x >= 20; a lake at 5,3 and 6,3 (its own water body, area 2).
const lake = (x, y) => y === 3 && (x === 5 || x === 6);
const COAST = { x: 19, y: 8 };
const PORT = { x: 19, y: 14 };
const LAKESIDE = { x: 5, y: 4 };
const HOME = { x: 8, y: 14 };
const world = {
    width: 34, height: 22, wrapX: false,
    tiles: (x, y) => ({ terrain: x >= 20 || lake(x, y) ? "TERRAIN_COAST" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    areaId: (x, y) => (lake(x, y) ? 2 : x >= 20 ? 1 : 0),
    players: [{ id: 0 }, { id: 1, name: "Rome" }],
    cities: [
        { owner: 0, ...COAST, name: "Coast", isTown: true, pop: 3 },
        { owner: 0, ...PORT, name: "Port", pop: 6, prod: 40 },
        { owner: 0, ...LAKESIDE, name: "Lakeside", pop: 6, prod: 40 },
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
    ],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world, "modern");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const d = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const role = (type) => units.shipRole(GameInfo.Units.lookup(type));
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "unitCanStart", "rangeTargets", "combat", "unreachable", "canBuild", "costOf"]) delete world[k];
    world.units = [];
    Game.turn = 20;
    Object.assign(world, extra);
};
const ops = (id) => fake.sent.filter((s) => s.id?.id === id).map((s) => [s.op, s.args?.X, s.args?.Y]);
const frigates = [{ x: 22, y: 8, owner: 1, type: "UNIT_FRIGATE" }, { x: 22, y: 9, owner: 1, type: "UNIT_FRIGATE" }];
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] });

test("ship roles from the data: an Ironclad is a screen, the Mikasa a ranged ship without the RANGED tag, a Submarine may not target land", () => {
    assert.equal(role("UNIT_IRONCLAD"), "SCREEN", "Range 1, though it has a ranged strength");
    assert.equal(role("UNIT_FRIGATE"), "RANGED");
    assert.equal(role("UNIT_MIKASA"), "RANGED", "tagged SIEGE, not RANGED");
    assert.equal(role("UNIT_SUBMARINE"), "SUBMARINE");
    assert.equal(role("UNIT_FLEET_COMMANDER"), "COMMANDER");
    assert.equal(role("UNIT_CARRIER_COMMANDER"), "CARRIER");
    assert.equal(role("UNIT_TRADE_SHIP"), "CIVILIAN");
    assert.equal(role("UNIT_TREASURE_FLEET_SMALL"), "CIVILIAN");
    assert.equal(role("UNIT_INFANTRY_COMPANY"), null, "not a ship");
});

test("our warships attack the game's way: a melee ship's naval attack when the preview pays, a ranged ship's shot; a submarine never at land", async () => {
    const shipAt = { x: 22, y: 8, owner: 1, type: "UNIT_FRIGATE" };
    const landAt = { x: 19, y: 9, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    // The Ironclad: the game offers its naval attack on the frigate; the preview says it pays.
    reset({
        wars: [1], enemies: [shipAt], units: [{ id: 1, type: "UNIT_IRONCLAD", x: 21, y: 8 }],
        unitCanStart: (_id, op) => (op === "UNITOPERATION_NAVAL_ATTACK" ? { Success: false, Plots: [idx(22, 8)] } : undefined),
        combat: () => ({ dealt: 60, taken: 20 }),
    });
    await units.strikeRaiders();
    assert.deepEqual(ops(1), [["UNITOPERATION_NAVAL_ATTACK", 22, 8]]);
    // The preview says it does not pay: no naval attack (and the Ironclad has no ranged one offered).
    reset({ wars: [1], enemies: [shipAt], units: [{ id: 1, type: "UNIT_IRONCLAD", x: 21, y: 8 }], combat: () => ({ dealt: 10, taken: 60 }), unitCanStart: (_id, op) => (op === "UNITOPERATION_NAVAL_ATTACK" ? { Success: false, Plots: [idx(22, 8)] } : undefined) });
    await units.strikeRaiders();
    assert.deepEqual(ops(1), []);
    // The Frigate shoots (RANGE_ATTACK).
    reset({ wars: [1], enemies: [shipAt], units: [{ id: 2, type: "UNIT_FRIGATE", x: 23, y: 10 }], rangeTargets: () => [shipAt] });
    await units.strikeRaiders();
    assert.deepEqual(ops(2), [[UnitOperationTypes.RANGE_ATTACK, 22, 8]]);
    // The Submarine: offered the land raider next to Coast (worth more) and the frigate, it takes the frigate.
    reset({ wars: [1], enemies: [landAt, shipAt], units: [{ id: 3, type: "UNIT_SUBMARINE", x: 21, y: 9 }], rangeTargets: () => [landAt, shipAt] });
    await units.strikeRaiders();
    assert.deepEqual(ops(3), [[UnitOperationTypes.RANGE_ATTACK, 22, 8]]);
});

test("warships sail to guard a settlement ships attack, by their own path: a lake ship stays; one there counts; the land holder is still wanted", () => {
    const sea = { id: 5, type: "UNIT_FRIGATE", x: 27, y: 8 };
    const lakeShip = { id: 6, type: "UNIT_FRIGATE", x: 5, y: 3 };
    reset({ wars: [1], enemies: frigates, units: [sea, lakeShip], unreachable: (x, y, id) => id?.id === 6 && !lake(x, y) });
    const t = units.threatenedSettlements().find((s) => s.settlement.name === "Coast");
    assert.equal(t?.ships, 2, JSON.stringify(t));
    const warn = console.warn;
    const said = [];
    console.warn = (...a) => said.push(a.join(" "));
    let r;
    try {
        r = run();
    } finally {
        console.warn = warn;
    }
    const moves = (id) => fake.sent.filter((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO).map((s) => ({ x: s.args.X, y: s.args.Y }));
    const [to] = moves(5);
    assert.ok(to && d(to, COAST) <= units.GUARD_RADIUS && to.x >= 20, JSON.stringify(r.entries));
    assert.deepEqual(moves(6), [], "the lake ship has no way there");
    assert.ok(r.entries.some((e) => e.key === "NAVAL_GUARD" && e.args[1] === "Coast"));
    assert.deepEqual(ops(5).length, 1, `its post only, nothing more in the same pass: ${JSON.stringify(ops(5))}`);
    assert.ok(said.some((l) => l.includes("naval: Coast: ships 2; warships there []") && l.includes("FRIGATE from 27,8")), JSON.stringify(said));
    // A warship is no land guard: Coast still lacks its melee holder.
    assert.equal(units.guardDetail(t, undefined, [t]).present.length, 0);
    // One of ours there already: one more is sent (two wanted against two ships), not both free frigates.
    reset({ wars: [1], enemies: frigates, units: [sea, { id: 8, type: "UNIT_FRIGATE", x: 28, y: 12 }, { id: 7, type: "UNIT_IRONCLAD", x: 20, y: 8 }] });
    run();
    assert.equal(moves(5).length + moves(8).length, 1);
    assert.equal(moves(7).length, 0, "the one there stays");
});

test("a lasting coastal front gets a warship trained in a city on its water, the best ranged ship; not in a lake city; not before the third turn", () => {
    const threats = [{ settlement: { ...COAST, name: "Coast" }, count: 2, land: 0, ships: 2, owners: [] }];
    const ships = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_FRIGATE", "UNIT_IRONCLAD"].includes(type) } : undefined);
    const ordered = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [GameInfo.Units.lookup(s.args.UnitType)?.UnitType, Cities.get(s.id)?.name]);
    const train = (turn) => {
        Game.turn = turn;
        fake.sent.length = 0;
        steps.assessWar([]);
        return steps.fillProduction(new Map(), { defend: true, threats });
    };
    reset({ canBuild: ships, costOf: () => 100 });
    train(20);
    train(21);
    assert.deepEqual(ordered().filter(([t]) => /FRIGATE|IRONCLAD/.test(t)), [], "two turns: not lasting yet");
    const out = train(22);
    const warships = ordered().filter(([t]) => /FRIGATE|IRONCLAD/.test(t));
    assert.deepEqual(warships, [["UNIT_FRIGATE", "Port"]], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_WARSHIP"));
    // Only the lake city could build one: none, and UI.log says why.
    const port = world.cities.find((c) => c.name === "Port");
    port.isTown = true;
    try {
        reset({ canBuild: ships, costOf: () => 100 });
        train(20);
        train(21);
        const warn = console.warn;
        const said = [];
        console.warn = (...a) => said.push(a.join(" "));
        try {
            train(22);
        } finally {
            console.warn = warn;
        }
        assert.deepEqual(ordered().filter(([t]) => /FRIGATE|IRONCLAD/.test(t)), []);
        assert.ok(said.some((l) => l.includes("naval: no warship for Coast")), JSON.stringify(said));
    } finally {
        port.isTown = false;
    }
});

test("game 39: a warship goes where it arrives soonest, not to the nearest city with a busy queue, and moves up its queue", () => {
    const threats = [{ settlement: { ...COAST, name: "Coast" }, count: 2, land: 0, ships: 2, owners: [] }];
    const ships = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_FRIGATE", "UNIT_IRONCLAD"].includes(type) } : undefined);
    const ordered = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [GameInfo.Units.lookup(s.args.UnitType)?.UnitType, Cities.get(s.id)?.name]);
    const port = world.cities.find((c) => c.name === "Port");
    // Port (6 tiles from Coast) builds a Factory with progress for 10 more turns; Bay (7 tiles, the same sea) has a free queue.
    const bay = { owner: 0, x: 19, y: 1, name: "Bay", pop: 3, prod: 40 };
    world.cities.push(bay);
    try {
        port.queue = { type: "BUILDING_FACTORY", turns: 10, pct: 50 };
        reset({ canBuild: ships, costOf: () => 100 });
        for (const turn of [20, 21, 22]) {
            Game.turn = turn;
            fake.sent.length = 0;
            steps.assessWar([]);
            steps.fillProduction(new Map(), { defend: true, threats });
        }
        // Two wanted against two ships: Bay's first (in 5 turns), then Port's (10 + 3 + the sail: still within 16).
        assert.deepEqual(ordered().filter(([t]) => /FRIGATE|IRONCLAD/.test(t)), [["UNIT_FRIGATE", "Bay"], ["UNIT_FRIGATE", "Port"]]);
        // A frigate queued in Port behind two buildings: on a lasting coastal front it moves up, behind the Factory with
        // progress; on a front of two turns it stays.
        delete port.queue;
        world.cities.pop();
        port.queue = { type: "BUILDING_FACTORY", turns: 5, pct: 50 };
        port.queued = ["BUILDING_SCHOOLHOUSE", "UNIT_FRIGATE"];
        const moves = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.MoveTo)
            .map((s) => [Cities.get(s.id)?.name, s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
        reset({ costOf: () => 100 });
        for (const turn of [20, 21]) {
            Game.turn = turn;
            fake.sent.length = 0;
            steps.frontLoadUnits({ defend: true, threats });
        }
        assert.deepEqual(moves(), [], "two turns: not a lasting front yet");
        Game.turn = 22;
        fake.sent.length = 0;
        steps.frontLoadUnits({ defend: true, threats });
        assert.deepEqual(moves(), [["Port", 2, 1]]);
    } finally {
        if (world.cities.includes(bay)) world.cities.pop();
        delete port.queue;
        delete port.queued;
    }
});
