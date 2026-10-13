// The victory focus's own work (Modern game data): science projects and a Launch Pad first,
// factories for economy, and the Great Banker opening World Bank offices abroad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const PARIS = { x: 3, y: 3 }, LYON = { x: 10, y: 3 };
const BERLIN = { x: 20, y: 5 }, ROME = { x: 30, y: 5 };
const world = {
    width: 40, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }],
    cities: [
        { owner: 0, ...PARIS, name: "Paris", prod: 30, queue: { type: "BUILDING_RAIL_STATION", turns: 4 } },
        { owner: 0, ...LYON, name: "Lyon", prod: 10 },
        { owner: 1, ...BERLIN, name: "Berlin" },
        { owner: 2, ...ROME, name: "Rome" },
    ],
};
const fake = installFakeEngine(world, "modern");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const P = (t) => GameInfo.Projects.lookup(t).$hash;
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const builds = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => [s.id.id, s.args.ProjectType ?? s.args.ConstructibleType]);
const offered = new Set(["PROJECT_LAUNCH_SATELLITE", "PROJECT_CREWED_SPACE_FLIGHT_PREP", "BUILDING_LAUNCH_PAD", "BUILDING_FACTORY"]);
world.canBuild = (type, id) => (type === undefined ? { Success: true } : offered.has(type) ? { Success: true, Plots: type.startsWith("BUILDING") ? [idx(id.id === 0 ? 4 : 11, 3)] : [], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });

test("science: every Innovation project the game offers, in the best producing city; a Launch Pad when we have none", () => {
    fake.sent.length = 0;
    const out = steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(builds(), [[0, P("PROJECT_CREWED_SPACE_FLIGHT_PREP")], [0, P("PROJECT_LAUNCH_SATELLITE")], [0, C("BUILDING_LAUNCH_PAD")]]);
    assert.ok(out.every((e) => e.key === "VICTORY_WORK"));
    const pad = fake.sent.find((s) => s.args.ConstructibleType === C("BUILDING_LAUNCH_PAD"));
    assert.deepEqual([pad.args.X, pad.args.Y], [4, 3], "on a tile the game offers");
    // A Launch Pad already stands in Paris: none more.
    world.structures = (x, y) => ({ district: null, constructibles: x === 4 && y === 3 ? ["BUILDING_LAUNCH_PAD"] : [] });
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.ok(!builds().some(([, t]) => t === C("BUILDING_LAUNCH_PAD")));
    delete world.structures;
});

test("economy: Rail Station, Port and Factory in every city that can build them; the first of them queued goes to the front, behind repairs", () => {
    const move = () => fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    const moved = () => [move()?.id.id, move()?.args.QueueSourceLocation, move()?.args.QueueDestinationLocation];
    offered.add("BUILDING_RAIL_STATION").add("BUILDING_PORT");
    const canBuild = world.canBuild;
    try {
        fake.sent.length = 0;
        steps.pushVictoryWork("ECONOMIC");
        // Paris already builds its Rail Station (the path's first: it stays first); Lyon gets all three.
        assert.deepEqual(builds(), [[0, C("BUILDING_PORT")], [0, C("BUILDING_FACTORY")], [1, C("BUILDING_RAIL_STATION")], [1, C("BUILDING_PORT")], [1, C("BUILDING_FACTORY")]]);
        assert.equal(move(), undefined);
        // Paris builds a Schoolhouse; its queued Factory goes to the front, and is not queued twice.
        world.cities[0].queue = { type: "BUILDING_SCHOOLHOUSE", turns: 4 };
        world.cities[0].queued = ["BUILDING_FACTORY"];
        fake.sent.length = 0;
        steps.pushVictoryWork("ECONOMIC");
        assert.deepEqual(moved(), [0, 1, 0]);
        assert.ok(!builds().some(([id, t]) => id === 0 && t === C("BUILDING_FACTORY")), "not queued twice in Paris");
        // Both a Factory and a Rail Station queued: the Rail Station (first on the path) goes to the front.
        world.cities[0].queued = ["BUILDING_FACTORY", "BUILDING_RAIL_STATION"];
        fake.sent.length = 0;
        steps.pushVictoryWork("ECONOMIC");
        assert.deepEqual(moved(), [0, 2, 0]);
        // The Schoolhouse is a repair (damaged): repairs come first, the Factory goes right behind it.
        world.cities[0].queued = ["BUILDING_STOCK_EXCHANGE", "BUILDING_FACTORY"];
        world.canBuild = (type, id, args) => (type === "BUILDING_SCHOOLHOUSE" && id.id === 0 ? { Success: true, RepairDamaged: true, Plots: [idx(4, 3)] } : canBuild(type, id, args));
        fake.sent.length = 0;
        steps.pushVictoryWork("ECONOMIC");
        assert.deepEqual(moved(), [0, 2, 1]);
    } finally {
        world.canBuild = canBuild;
        world.cities[0].queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
        delete world.cities[0].queued;
        offered.delete("BUILDING_RAIL_STATION");
        offered.delete("BUILDING_PORT");
    }
    fake.sent.length = 0;
    assert.deepEqual(steps.pushVictoryWork("CULTURE"), [], "culture: wonders as usual");
});

test("economy: towns buy the path's buildings with the gold above the reserve, in the path's order", () => {
    const NICE = { x: 6, y: 9 };
    world.cities.push({ owner: 0, ...NICE, name: "Nice", isTown: true });
    // Nice may buy a Rail Station (600) or a Port (200); a Factory only once on the rail network.
    let station = true;
    world.canBuy = (type, id) => (id.id !== 2 ? { Success: false }
        : type === "BUILDING_RAIL_STATION" ? { Success: station, Plots: [idx(NICE.x + 1, NICE.y)], Cost: 600 }
        : type === "BUILDING_PORT" ? { Success: true, Plots: [idx(NICE.x, NICE.y + 1)], Cost: 200 }
        : { Success: false });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => [s.id.id, s.args.ConstructibleType, s.args.X, s.args.Y]);
    try {
        world.goldIncome = 50; // reserve: 2 turns = 100
        world.gold = 750;
        fake.sent.length = 0;
        const purchases = { bought: new Set(), spent: 0 };
        const out = steps.buyVictoryWork("ECONOMIC", 2, purchases);
        assert.deepEqual(bought(), [[2, C("BUILDING_RAIL_STATION"), NICE.x + 1, NICE.y]], "the Rail Station first, one a pass");
        assert.deepEqual([[...purchases.bought], purchases.spent], [[`c:${NICE.x}-${NICE.y}|BUILDING_RAIL_STATION`], 600], "told to the plan's purchases");
        assert.equal(out[0]?.key, "VICTORY_BOUGHT");
        world.gold = 650; // 550 above the reserve: not enough for the station, and the Port waits
        fake.sent.length = 0;
        steps.buyVictoryWork("ECONOMIC", 2);
        assert.deepEqual(bought(), []);
        station = false; // it has one now
        fake.sent.length = 0;
        steps.buyVictoryWork("ECONOMIC", 2);
        assert.deepEqual(bought(), [[2, C("BUILDING_PORT"), NICE.x, NICE.y + 1]]);
        fake.sent.length = 0;
        assert.deepEqual(steps.buyVictoryWork("SCIENCE", 2), [], "nothing for towns on the science path");
    } finally {
        world.cities.pop();
        delete world.canBuy;
        delete world.gold;
        delete world.goldIncome;
    }
});

test("economy: cities buy the path's buildings too (after towns), never the one they are producing with progress; the reserve is at most 1000 gold", () => {
    // Paris may buy a Rail Station (500) and a Port (400); Lyon a Port (400).
    world.canBuy = (type, id) => (type === "BUILDING_RAIL_STATION" && id.id === 0 ? { Success: true, Plots: [idx(4, 3)], Cost: 500 }
        : type === "BUILDING_PORT" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], Cost: 400 } : { Success: false });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => [s.id.id, s.args.ConstructibleType]);
    const queue = world.cities[0].queue;
    try {
        // Income 5000: 3 turns would keep 15000 back; the cap keeps 1000, so 1000 is free.
        world.goldIncome = 5000;
        world.gold = 2000;
        fake.sent.length = 0;
        steps.buyVictoryWork("ECONOMIC", 3);
        assert.deepEqual(bought(), [[0, C("BUILDING_RAIL_STATION")], [1, C("BUILDING_PORT")]], "one a city, path order, within 1000");
        assert.equal(steps.goldReserve(3), 1000);
        // Paris is producing its Rail Station with progress: not bought, nor anything after it there.
        world.cities[0].queue = { type: "BUILDING_RAIL_STATION", turns: 3, pct: 40 };
        fake.sent.length = 0;
        steps.buyVictoryWork("ECONOMIC", 3);
        assert.deepEqual(bought(), [[0, C("BUILDING_PORT")], [1, C("BUILDING_PORT")]]);
    } finally {
        world.cities[0].queue = queue;
        delete world.canBuy;
        delete world.gold;
        delete world.goldIncome;
    }
});

test("the pass: with the economy focus, towns buy the path's buildings in the purchase step", async () => {
    world.cities.push({ owner: 0, x: 6, y: 9, name: "Nice", isTown: true });
    world.canBuy = (type, id) => (id.id === 2 && type === "BUILDING_RAIL_STATION" ? { Success: true, Plots: [idx(7, 9)], Cost: 300 } : { Success: false });
    world.gold = 1000;
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_ECONOMIC", LegacyPathClassType: "LEGACY_PATH_CLASS_ECONOMIC", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_ECONOMIC", FinalMilestone: true, RequiredPathPoints: 500 }];
    Players.get(0).LegacyPaths = { getScore: () => 20 };
    const off = { research: false, production: false, growth: false, towns: false, resources: false, choices: false, befriend: false, wonders: false };
    settings.patch({ autopilot: { ...off, focus: true, victory: "ECONOMIC", purchases: true, replanEvery: 0, skipUnits: false, endTurn: false } });
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        const buy = fake.sent.find((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE);
        assert.deepEqual([buy?.id.id, buy?.args.ConstructibleType, buy?.args.X, buy?.args.Y], [2, C("BUILDING_RAIL_STATION"), 7, 9]);
    } finally {
        settings.patch({ autopilot: { ...Object.fromEntries(Object.keys(off).map((k) => [k, true])), focus: false, victory: "AUTO" } });
        world.cities.pop();
        delete world.canBuy;
        delete world.gold;
        delete Players.get(0).LegacyPaths;
    }
});

test("factory resources first: into the settlement holding that type, then one with a Factory and none yet", () => {
    world.cities[0].resourceCap = 3; // Paris: a Factory, holds cotton
    world.cities[0].factory = true;
    world.cities[0].factoryResource = "RESOURCE_COTTON";
    world.cities[1].resourceCap = 4; // Lyon: a Factory, none yet, more free slots
    world.cities[1].factory = true;
    world.resources = [
        { value: idx(2, 8), type: "RESOURCE_WINE" },
        { value: idx(3, 8), type: "RESOURCE_TEA" },
        { value: idx(4, 8), type: "RESOURCE_COTTON" },
    ];
    // The game takes one factory-resource type per settlement.
    const types = { 0: "RESOURCE_COTTON", 1: null };
    const canStart = Game.PlayerOperations.canStart;
    Game.PlayerOperations.canStart = (p, op, args) => {
        if (op !== PlayerOperationTypes.ASSIGN_RESOURCE) return canStart(p, op, args);
        const type = world.resources.find((r) => r.value === GameplayMap.getIndexFromXY(args.Location.x, args.Location.y))?.type;
        const factory = GameInfo.Resources.lookup(type).ResourceClassType === "RESOURCECLASS_FACTORY";
        return { Success: !factory || types[args.City] === null || types[args.City] === type };
    };
    const assigned = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.ASSIGN_RESOURCE).map((s) => [GameplayMap.getIndexFromXY(s.args.Location.x, s.args.Location.y), s.args.City]);
    try {
        fake.sent.length = 0;
        steps.assignResources({ ...DEFAULT_SETTINGS, profile: "GOLD" });
        assert.deepEqual(assigned(), [[idx(4, 8), 0], [idx(3, 8), 1], [idx(2, 8), 1]], "cotton to Paris (cotton) though Lyon has more room, tea to Lyon (none yet), then the wine where most room is");
    } finally {
        Game.PlayerOperations.canStart = canStart;
        for (const c of world.cities) for (const k of ["resourceCap", "factory", "factoryResource"]) delete c[k];
        delete world.resources;
    }
});

test("the Great Banker teleports to another capital, opens the World Bank office there, then the next; refused (gold): later", () => {
    const at = (p) => world.units[0].x === p.x && world.units[0].y === p.y;
    world.owningCity = (x, y) => (GameplayMap.getPlotDistance(x, y, BERLIN.x, BERLIN.y) <= 1 ? { owner: 1, id: 0 } : GameplayMap.getPlotDistance(x, y, ROME.x, ROME.y) <= 1 ? { owner: 2, id: 0 } : GameplayMap.getPlotDistance(x, y, PARIS.x, PARIS.y) <= 1 ? { owner: 0, id: 0 } : null);
    world.unitCanStart = (_id, op) => (op === "UNITOPERATION_TELEPORT_TO_CITY" ? { Success: true, Plots: [idx(BERLIN.x, BERLIN.y), idx(ROME.x, ROME.y)] } : undefined);
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_ACTIVATE_GREAT_PERSON" && at(BERLIN);
    const teleport = () => fake.sent.find((s) => s.op === "UNITOPERATION_TELEPORT_TO_CITY")?.args;
    const act = () => fake.sent.some((s) => s.op === "UNITCOMMAND_ACTIVATE_GREAT_PERSON");
    try {
        units.resetUnitGoals();
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...PARIS }];
        let r = units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.deepEqual(teleport(), { X: BERLIN.x, Y: BERLIN.y }, JSON.stringify(r.entries));
        assert.equal(r.entries[0].key, "BANKER_MOVE");
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...BERLIN }];
        r = units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.ok(act());
        assert.equal(r.entries[0].key, "BANK_OPENED");
        // Berlin is done: on to Rome, where the game refuses it for now (not enough gold).
        fake.sent.length = 0;
        units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.deepEqual(teleport(), { X: ROME.x, Y: ROME.y });
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...ROME }];
        r = units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.ok(!act() && !teleport(), "Berlin done, Rome refused: wait");
        // Back home: Rome is tried again only after a while.
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...PARIS }];
        units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.equal(teleport(), undefined, "refused this turn");
        const turn = Game.turn;
        Game.turn = turn + 10;
        fake.sent.length = 0;
        units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        Game.turn = turn;
        assert.deepEqual(teleport(), { X: ROME.x, Y: ROME.y }, "ten turns later: again");
        // Without the victory focus it is left to the player.
        units.resetUnitGoals();
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...PARIS }];
        units.commandUnits(DEFAULT_SETTINGS, { defend: true });
        assert.equal(teleport(), undefined);
    } finally {
        delete world.owningCity;
        delete world.unitCanStart;
        delete world.unitCommandOk;
        world.units = [];
    }
});
