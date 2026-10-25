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
const budgets = await import("../mod/expansion-planner/ui/core/xpl-savings.js");
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
    // Why a free warship stayed (research/41 §3: 46 of 186 such lines in games 37-47 sent none and said nothing).
    assert.ok(said.some((l) => l.includes("not sent [UNIT_FRIGATE at 5,3 (no path)]")), JSON.stringify(said));
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

// Game 54's review of the game's text: a Fleet Commander's Focus Fire orders "all Heavy Naval Units within Command Radius",
// Coordinated Naval Attack "all Light Naval Units", +2 each; research/42 left fleets unused.
test("a Fleet Commander's Focus Fire: every ranged ship in its radius on one target; Coordinated Naval Attack with its screens", async () => {
    const enemy = { x: 22, y: 8, owner: 1, type: "UNIT_FRIGATE" };
    const sea = (_id, op) => (op === "UNITCOMMAND_FOCUSED_ATTACK_SEA_RANGED" ? { Success: false, Plots: [idx(22, 8)] } : undefined);
    const shot = (_id, op) => (op === UnitOperationTypes.RANGE_ATTACK || op === "UNITOPERATION_RANGE_ATTACK" ? { Success: false, Plots: [idx(22, 8)] } : undefined);
    reset({ wars: [1], enemies: [enemy], units: [{ id: 9, type: "UNIT_FLEET_COMMANDER", x: 21, y: 9 }, { id: 5, type: "UNIT_FRIGATE", x: 21, y: 8 }], unitCanStart: shot });
    world.unitCommandResult = sea;
    try {
        const r = await units.strikeRaiders();
        assert.deepEqual(r.entries.filter((e) => e.key === "NAVAL_FOCUS_FIRE").map((e) => [e.args[2], e.args[3], e.args[4]]), [[22, 8, 1]], JSON.stringify(r.entries));
        assert.ok(fake.sent.some((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_SEA_RANGED" && s.id.id === 9 && s.args.X === 22), JSON.stringify(fake.sent));
        // A screen next to the target: Coordinated Naval Attack (the preview says the lone one's strike pays).
        reset({ wars: [1], enemies: [enemy], units: [{ id: 9, type: "UNIT_FLEET_COMMANDER", x: 22, y: 10 }, { id: 6, type: "UNIT_IRONCLAD", x: 22, y: 9, melee: 50 }], combat: () => ({ dealt: 70, taken: 10 }) });
        world.unitCommandResult = (_id, op) => (op === "UNITCOMMAND_FOCUSED_ATTACK_SEA_MELEE" ? { Success: false, Plots: [idx(22, 8)] } : undefined);
        const m = await units.strikeRaiders();
        assert.ok(m.entries.some((e) => e.key === "NAVAL_COORDINATED_ATTACK"), JSON.stringify(m.entries));
    } finally {
        delete world.unitCommandResult;
    }
});

test("a Fleet Commander stands on a warship's tile where ships attack us; with no such fight it stays", () => {
    const threats = [{ settlement: { ...COAST, name: "Coast" }, count: 2, land: 0, ships: 2, owners: [{ id: 1 }] }];
    const go = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats, fronts: [], exposed: [] });
    reset({ wars: [1], units: [{ id: 9, type: "UNIT_FLEET_COMMANDER", x: 22, y: 8 }, { id: 5, type: "UNIT_FRIGATE", x: 21, y: 8 }] });
    const r = go();
    assert.ok(r.entries.some((e) => e.key === "FLEET_COMMANDER_POST"), JSON.stringify(r.entries));
    assert.ok(fake.sent.some((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO && s.args.X === 21 && s.args.Y === 8), JSON.stringify(ops(9)));
    reset({ units: [{ id: 9, type: "UNIT_FLEET_COMMANDER", x: 22, y: 8 }, { id: 5, type: "UNIT_FRIGATE", x: 21, y: 8 }] });
    const quiet = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [] });
    assert.ok(!quiet.entries.some((e) => e.key === "FLEET_COMMANDER_POST"));
});

test("a lasting coastal front with two warships of ours gets a Fleet Commander trained on its water; a carrier for a coast no land base covers 5 turns", () => {
    const threats = [{ settlement: { ...COAST, name: "Coast" }, count: 2, land: 0, ships: 2, owners: [{ id: 1 }] }];
    const can = (type) => (["UNIT_FLEET_COMMANDER", "UNIT_CARRIER_COMMANDER"].includes(type) ? { Success: true } : type?.startsWith?.("UNIT_") ? { Success: false } : undefined);
    const ordered = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [GameInfo.Units.lookup(s.args.UnitType)?.UnitType, Cities.get(s.id)?.name]);
    const ourShips = [{ id: 5, type: "UNIT_FRIGATE", x: 21, y: 8 }, { id: 6, type: "UNIT_FRIGATE", x: 21, y: 9 }];
    const train = (turn) => {
        Game.turn = turn;
        fake.sent.length = 0;
        steps.assessWar(threats);
        return steps.fillProduction(new Map(), { defend: true, threats });
    };
    reset({ wars: [1], canBuild: can, costOf: () => 100, units: ourShips });
    train(20);
    train(21);
    assert.deepEqual(ordered().filter(([t]) => t === "UNIT_FLEET_COMMANDER"), [], "not a lasting front yet");
    const out = train(22);
    assert.deepEqual(ordered().filter(([t]) => t === "UNIT_FLEET_COMMANDER"), [["UNIT_FLEET_COMMANDER", "Port"]], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_FLEET_COMMANDER"));
    // One warship only: none.
    reset({ wars: [1], canBuild: can, costOf: () => 100, units: ourShips.slice(0, 1) });
    for (const t of [20, 21, 22]) train(t);
    assert.deepEqual(ordered().filter(([t]) => t === "UNIT_FLEET_COMMANDER"), []);
    // An enemy Bomber reaches Coast: it wants fighter cover, and no land base of ours gives it. After 5 turns: a carrier.
    reset({ wars: [1], canBuild: can, costOf: () => 100, units: ourShips, enemies: [{ x: 24, y: 6, owner: 1, type: "UNIT_BOMBER" }] });
    for (const t of [20, 21, 22, 23]) train(t);
    assert.deepEqual(ordered().filter(([t]) => t === "UNIT_CARRIER_COMMANDER"), [], "4 turns");
    const c = train(24);
    assert.deepEqual(ordered().filter(([t]) => t === "UNIT_CARRIER_COMMANDER"), [["UNIT_CARRIER_COMMANDER", "Port"]], JSON.stringify(c));
});

test("a carrier is an air base, and sails where cover is wanted that no land base gives; one covering it stays", () => {
    const cover = [{ x: COAST.x, y: COAST.y, name: "Coast", why: "hit from the air lately", rank: 1 }];
    reset({ units: [{ id: 9, type: "UNIT_CARRIER_COMMANDER", x: 30, y: 14, army: 9 }], armies: { "0:9": { x: 30, y: 14, capacity: 4 } } });
    assert.deepEqual(units.airBases().map((b) => [b.type, b.at.x, b.at.y, b.free]), [["UNIT_CARRIER_COMMANDER", 30, 14, 4]]);
    const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [], airCover: cover });
    const to = fake.sent.find((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.ok(to && d({ x: to.X, y: to.Y }, COAST) <= units.GUARD_RADIUS && to.X >= 20, JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "CARRIER_SAILS"));
    reset({ units: [{ id: 9, type: "UNIT_CARRIER_COMMANDER", x: 21, y: 8, army: 9 }], armies: { "0:9": { x: 21, y: 8, capacity: 4 } } });
    units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [], airCover: cover });
    assert.equal(fake.sent.filter((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO).length, 0, "it covers Coast already");
});

test("a carrier is an air commander: its bombers Carpet Bomb a raider together", async () => {
    const enemy = { x: 21, y: 9, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    const plane = (id) => ({ id, type: "UNIT_BOMBER", x: 23, y: 9, onMap: false, army: 9 });
    reset({ wars: [1], enemies: [enemy], units: [{ id: 9, type: "UNIT_CARRIER_COMMANDER", x: 23, y: 9, army: 9 }, plane(1), plane(2)], armies: { "0:9": { x: 23, y: 9, capacity: 4 } } });
    world.unitCommandResult = (_id, op) => (op === "UNITCOMMAND_FOCUSED_ATTACK_AIR_BOMB" ? { Success: false, Plots: [idx(21, 9)] } : undefined);
    try {
        const r = await units.strikeRaiders();
        assert.deepEqual(r.entries.filter((e) => e.key === "AIR_CARPET_BOMB").map((e) => e.args[4]), [2], JSON.stringify(r.entries));
    } finally {
        delete world.unitCommandResult;
        delete world.armies;
    }
});

// Game 55: one independent Cog shelled Катана from 100 to 0 E18-E24; no land unit on sale could fight it, we had no
// warship, Cogs were queued at E19 and the first sailed at E22, five turns away, while about 1,000 gold waited.
test("ships shelling a settlement no land unit on sale fights: a warship bought on its water, the soonest there; not for a passing ship (game 55)", () => {
    const { createBudget } = budgets;
    const threat = (o = {}) => ({ settlement: { ...COAST, name: "Coast" }, count: 1, land: 0, ships: 1, damaged: true, owners: [], ...o });
    const boughtShips = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [GameInfo.Units.lookup(s.args.UnitType)?.UnitType, Cities.get(s.id)?.name]);
    // Every city sells warships, the port for less: the shelled town itself, on the water, sails none and comes first.
    const sea = (only) => (type, id) => (["UNIT_FRIGATE", "UNIT_IRONCLAD"].includes(type) && (!only || only.includes(Cities.get(id)?.name))
        ? { Success: true, Cost: Cities.get(id)?.name === "Port" ? 250 : 300 } : { Success: false });
    reset({ canBuy: sea() });
    let out = steps.buyDefenders([threat()], { budget: createBudget({ gold: 500 }) });
    assert.deepEqual(boughtShips(), [["UNIT_FRIGATE", "Coast"]], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "WARSHIP_BOUGHT"));
    // The town sells none: the port on the same sea; never the lake city.
    reset({ canBuy: sea(["Port", "Lakeside"]) });
    steps.buyDefenders([threat()], { budget: createBudget({ gold: 500 }) });
    assert.deepEqual(boughtShips(), [["UNIT_FRIGATE", "Port"]]);
    reset({ canBuy: sea(["Lakeside"]) });
    steps.buyDefenders([threat()], { budget: createBudget({ gold: 500 }) });
    assert.deepEqual(boughtShips(), [], "a lake ship never reaches the sea");
    // A ship passing by (centre unhit, first turn), a warship of ours already near, or too little gold: none.
    reset({ canBuy: sea() });
    steps.buyDefenders([threat({ damaged: false })], { budget: createBudget({ gold: 500 }) });
    assert.deepEqual(boughtShips(), [], "a passing ship");
    reset({ canBuy: sea() });
    world.units = [{ id: 5, type: "UNIT_IRONCLAD", x: 21, y: 9 }];
    steps.buyDefenders([threat()], { budget: createBudget({ gold: 500 }) });
    assert.deepEqual(boughtShips(), [], "ours is there");
    reset({ canBuy: sea() });
    steps.buyDefenders([threat()], { budget: createBudget({ gold: 200 }) });
    assert.deepEqual(boughtShips(), [], "200 gold");
});
