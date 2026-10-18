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
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const P = (t) => GameInfo.Projects.lookup(t).$hash;
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const builds = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => [s.id.id, s.args.ProjectType ?? s.args.ConstructibleType]);
const offered = new Set(["PROJECT_LAUNCH_SATELLITE", "PROJECT_CREWED_SPACE_FLIGHT_PREP", "BUILDING_LAUNCH_PAD", "BUILDING_FACTORY"]);
// Research brings Innovation too (research/38 A1: Rocketry, the masteries, Future Tech). A test about the projects alone sets a
// tree where the masteries are in and Future Tech is out of reach (`late()`); the fake's tree answers 5 turns a node.
const LATE_RESEARCH = {
    NODE_TECH_MO_ELECTRICITY: 2, NODE_TECH_MO_COMBUSTION: 2, NODE_TECH_MO_INDUSTRIALIZATION: 2, NODE_TECH_MO_RADIO: 2, NODE_TECH_MO_ARMOR: 2,
    NODE_TECH_MO_AERODYNAMICS: 2, NODE_TECH_MO_FLIGHT: 2, NODE_TECH_MO_ROCKETRY: 1, NODE_TECH_MO_NUCLEAR_FISSION: 1,
};
const late = (depth = {}) => ({ depth: { ...LATE_RESEARCH, ...depth }, turns: { NODE_TECH_MO_FUTURE_TECH: 400 } });
world.canBuild = (type, id) => (type === undefined ? { Success: true } : offered.has(type) ? { Success: true, Plots: type.startsWith("BUILDING") ? [idx(id.id === 0 ? 4 : 11, 3)] : [], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });

test("science: the first Launch Pad in the best producing city, more (up to 3) where done within 10 turns or where no gold buys them sooner; the Airfield only in a city without a Launch Pad; no Radio Station; Preparation wherever a Launch Pad stands and no one-off there; the Radio Telescope only where a Radio Station stands and no Launch Pad", () => {
    world.cities.push({ owner: 0, x: 3, y: 9, name: "Nice", prod: 20 }, { owner: 0, x: 10, y: 9, name: "Lille", prod: 5 });
    const SITES = ["BUILDING_LAUNCH_PAD", "BUILDING_AIRFIELD", "BUILDING_RADIO_STATION"];
    // Turns each city would take (seen in game 5: 13-15 turns each in a 46-production capital).
    const TURNS = { Paris: 8, Nice: 9, Lyon: 20, Lille: 25 };
    world.turnsFor = (c) => TURNS[c.name] ?? -1;
    const pads = new Set(); // city names with a Launch Pad standing
    const padAt = (c) => ({ x: c.x + 1, y: c.y });
    const canBuild = world.canBuild;
    world.canBuild = (type, id) => {
        const c = world.cities.find((x) => x.name === Cities.get(id)?.name);
        if (SITES.includes(type)) return { Success: true, Plots: [idx(padAt(c).x, padAt(c).y)], ExpandUrbanPlots: [] };
        // Projects need a Launch Pad in their own city.
        if (type === "PROJECT_CREWED_SPACE_FLIGHT_PREP" || type === "PROJECT_LAUNCH_SATELLITE") return { Success: pads.has(c.name), Plots: [] };
        // The Radio Telescope: offered where a Radio Station stands (Paris, Lille); queued only where no Launch Pad's
        // Crewed Space Flight Preparation would wait for it (research/31 §2.6).
        if (type === "PROJECT_CREWED_SPACE_FLIGHT_RESEARCH") return { Success: c.name === "Paris" || c.name === "Lille", Plots: [] };
        return { Success: false, Plots: [] };
    };
    world.structures = (x, y) => ({ district: null, constructibles: world.cities.some((c) => pads.has(c.name) && padAt(c).x === x && padAt(c).y === y) ? ["BUILDING_LAUNCH_PAD"] : [] });
    const city = (name) => Players.get(0).Cities.getCities().find((c) => c.name === name).id.id;
    world.research = { depth: { NODE_TECH_MO_FLIGHT: 2 } }; // Trans-Oceanic Flight open: the Airfield is wanted
    // The one-off projects cheap enough for weak Lille, Preparation (600) for Lyon: each site brings the goal sooner.
    world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 600 : t.startsWith("PROJECT_") ? 100 : undefined);
    // 95 Innovation to go: Trans-Oceanic Flight's 5 make the goal come at turn 70 instead of 84 (siteHelps).
    world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 5 } };
    try {
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        // No Launch Pad yet: Paris, Nice, and Lyon too (20 turns, but no gold buys it sooner: research/31 §2); the
        // Airfield only in a city without a Launch Pad (research/32 §3: there Preparation gives more Innovation): Lille,
        // which no city beats within 10 turns, while it builds it within 30 and it and its project fit the age
        // (research/24 P1: never built in game 9); no Radio Station; no project can start yet but the Radio Telescope
        // in Lille.
        const sites = [
            [city("Paris"), C("BUILDING_LAUNCH_PAD")], [city("Nice"), C("BUILDING_LAUNCH_PAD")], [city("Lyon"), C("BUILDING_LAUNCH_PAD")],
            [city("Lille"), C("BUILDING_AIRFIELD")],
            [city("Lille"), P("PROJECT_CREWED_SPACE_FLIGHT_RESEARCH")],
        ];
        assert.deepEqual(builds(), sites);
        // 40 turns in Lille: too slow (SLOW_PAD_MAX_TURNS 30), no Airfield anywhere.
        TURNS.Lille = 40;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.ok(!builds().some(([, t]) => t === C("BUILDING_AIRFIELD")), JSON.stringify(builds()));
        TURNS.Lille = 25;
        // A weak empire: Paris is slow too, yet the victory's first Launch Pad goes there; Nice's and Lyon's pads too (no
        // gold buys them sooner). With 18 turns left: only the victory's pad.
        TURNS.Paris = 30;
        TURNS.Nice = 25;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), sites);
        world.agePoints = 85;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        delete world.agePoints;
        assert.deepEqual(builds(), [[city("Paris"), C("BUILDING_LAUNCH_PAD")]]);
        TURNS.Paris = 8;
        TURNS.Nice = 9;
        const pad = fake.sent.find((s) => s.args.ConstructibleType === C("BUILDING_LAUNCH_PAD"));
        assert.deepEqual([pad.args.X, pad.args.Y], [4, 3], "on a tile the game offers");
        // Launch Pads stand in Paris and Lyon: a third goes to Nice; Crewed Space Flight Preparation in both cities
        // with a Launch Pad, and no Launch Satellite there (research/32 §3: 15 Innovation for 1000 against 5 for 500).
        pads.add("Paris").add("Lyon");
        fake.sent.length = 0;
        const out = steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds().filter(([, t]) => t === C("BUILDING_LAUNCH_PAD")), [[city("Nice"), C("BUILDING_LAUNCH_PAD")]]);
        assert.deepEqual(builds().filter(([, t]) => t === P("PROJECT_CREWED_SPACE_FLIGHT_PREP") || t === P("PROJECT_LAUNCH_SATELLITE")), [
            [city("Paris"), P("PROJECT_CREWED_SPACE_FLIGHT_PREP")], [city("Lyon"), P("PROJECT_CREWED_SPACE_FLIGHT_PREP")],
        ]);
        assert.ok(out.every((e) => e.key === "VICTORY_WORK"));
        assert.deepEqual(builds().filter(([, t]) => t === P("PROJECT_CREWED_SPACE_FLIGHT_RESEARCH")), [[city("Lille"), P("PROJECT_CREWED_SPACE_FLIGHT_RESEARCH")]], "the Radio Telescope: not in Paris, its Launch Pad's preparation first");
        // Three Launch Pads: no fourth.
        pads.add("Nice");
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.ok(!builds().some(([, t]) => t === C("BUILDING_LAUNCH_PAD")));
    } finally {
        world.canBuild = canBuild;
        delete world.structures;
        delete world.turnsFor;
        delete world.research;
        delete world.costOf;
        delete world.victoryPoints;
        world.cities.splice(-2, 2);
    }
});

test("science: cities buy the Launch Pad queued there, then the age's science buildings, with the gold above the reserve", () => {
    world.cities[0].queued = ["BUILDING_LAUNCH_PAD"];
    world.canBuy = (type, id) => (id.id !== 0 ? { Success: false }
        : type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(4, 3)], Cost: 900 }
        : type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(4, 4)], Cost: 300 }
        : type === "BUILDING_SCHOOLHOUSE" ? { Success: true, Plots: [idx(2, 3)], Cost: 400 }
        : { Success: false });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => [s.id.id, s.args.ConstructibleType]);
    try {
        world.goldIncome = 0;
        world.gold = 1000;
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 2);
        assert.deepEqual(bought(), [[0, C("BUILDING_LAUNCH_PAD")]], "the queued Launch Pad first (the Airfield, not queued, after the science buildings)");
        world.cities[0].queued = [];
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 2);
        assert.deepEqual(bought(), [[0, C("BUILDING_SCHOOLHOUSE")]], "then the age's science building");
        // No science building left to buy: the sites nobody builds (too slow everywhere) are bought.
        const buy = world.canBuy;
        world.canBuy = (type, id) => (type === "BUILDING_SCHOOLHOUSE" ? { Success: false } : buy(type, id));
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 2);
        assert.deepEqual(bought(), [[0, C("BUILDING_LAUNCH_PAD")]], "a missing Launch Pad");
    } finally {
        delete world.cities[0].queued;
        delete world.canBuy;
        delete world.gold;
        delete world.goldIncome;
    }
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

// Research/38 §3.7: after the masteries science buys only Future Tech (3 Innovation for 5,000 science and more) while 1,000
// production runs a Preparation (15); game 30's London fell from 66 to 36 production at M55 as specialists kept coming.
test("the science victory's last stretch: Rocketry and the Innovation masteries in and a Launch Pad standing, the pass weighs production ×1.5 and science ÷1.5", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const off = { research: false, production: false, growth: false, towns: false, resources: false, choices: false, befriend: false, wonders: false, purchases: false };
    const turn = Game.turn;
    const warn = console.warn;
    const lines = [];
    try {
        steps.resetSpacePush();
        world.research = late();
        assert.equal(steps.spacePushNow("SCIENCE").on, false, "no Launch Pad stands");
        world.structures = (x, y) => (x === 4 && y === 3 ? { district: null, constructibles: ["BUILDING_LAUNCH_PAD"] } : { district: null, constructibles: [] });
        assert.equal(steps.spacePushNow("SCIENCE").on, true);
        assert.equal(steps.spacePushNow("CULTURE").on, false, "another focus");
        world.research = late({ NODE_TECH_MO_ELECTRICITY: 1 });
        assert.equal(steps.spacePushNow("SCIENCE").on, false, "Electricity's mastery still to research");
        world.research = late();
        GameInfo.LegacyPaths = [{ LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
        GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 500 }];
        Players.get(0).LegacyPaths = { getScore: () => 20 };
        settings.patch({ autopilot: { ...off, focus: true, victory: "SCIENCE", replanEvery: 0, skipUnits: false, endTurn: false } });
        steps.resetSpacePush();
        state.set({ autopilot: { ...(state.get().autopilot ?? {}), log: [] } });
        console.warn = (...a) => lines.push(a.join(" "));
        Game.turn = 110; // the economy line (every 10 turns) prints the balance the pass uses
        await autopilot.runTurn(true);
        console.warn = warn;
        assert.ok((state.get().autopilot?.log ?? []).some((e) => e.key === "SPACE_PUSH"));
        const economy = lines.filter((l) => l.includes("economy: T110"));
        assert.ok(economy.some((l) => /balance SCIENCE F0\.7,P1\.5;/.test(l)), economy.join(" | "));
    } finally {
        console.warn = warn;
        Game.turn = turn;
        settings.patch({ autopilot: { ...Object.fromEntries(Object.keys(off).map((k) => [k, true])), focus: false, victory: "AUTO" } });
        for (const k of ["structures", "research"]) delete world[k];
        delete Players.get(0).LegacyPaths;
        steps.resetSpacePush();
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

test("science research: until Rocketry is researched, only its way (masteries wait); then the masteries", () => {
    // Seen in game 5: Radio's and Flight's masteries came first (~6000 science) and Rocketry was never reached.
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const chosen = () => fake.sent.filter((s) => s.op === TECH).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);
    const done = ["ACADEMICS", "STEAM_ENGINE", "MILITARY_SCIENCE", "ELECTRICITY", "URBANIZATION", "COMBUSTION", "RADIO", "FLIGHT"];
    const depth = Object.fromEntries(done.map((t) => [`NODE_TECH_MO_${t}`, 1]));
    try {
        // Flight's mastery (Trans-Oceanic Flight, wanted) is offered first; Industrialization is on Rocketry's way.
        world.research = { tech: { available: [N("NODE_TECH_MO_FLIGHT"), N("NODE_TECH_MO_INDUSTRIALIZATION")] }, culture: { available: [] }, depth };
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_TECH_MO_INDUSTRIALIZATION"], JSON.stringify(r));
        assert.match(r.args[0], /→/, "names the goal");
        // Rocketry available: taken.
        world.research = { tech: { available: [N("NODE_TECH_MO_FLIGHT"), N("NODE_TECH_MO_ROCKETRY")] }, culture: { available: [] }, depth };
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_TECH_MO_ROCKETRY"]);
        // Rocketry researched: Flight's mastery opens Trans-Oceanic Flight, which needs an Airfield (research/38 §4 C2): none
        // stands or is queued, so Nuclear Fission (the Manhattan Project); with one queued in Lyon, the mastery.
        world.research = { tech: { available: [N("NODE_TECH_MO_FLIGHT"), N("NODE_TECH_MO_NUCLEAR_FISSION")] }, culture: { available: [] }, depth: { ...depth, NODE_TECH_MO_ROCKETRY: 1 } };
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_TECH_MO_NUCLEAR_FISSION"]);
        world.cities[1].queued = ["BUILDING_AIRFIELD"];
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        delete world.cities[1].queued;
        assert.deepEqual(chosen(), ["NODE_TECH_MO_FLIGHT"]);
        // Other focuses: no gate.
        world.research = { tech: { available: [N("NODE_TECH_MO_FLIGHT"), N("NODE_TECH_MO_INDUSTRIALIZATION")] }, culture: { available: [] }, depth };
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "ECONOMIC");
        assert.notDeepEqual(chosen(), [], "economy researches something");
    } finally {
        delete world.research;
    }
});

// Research/38 §3.6: after Rocketry game 30 took Flight's mastery (no Innovation, no Airfield) and Nuclear Fission (4-5 turns,
// none either) before the 2-point masteries: about 4 turns late for 10 Innovation.
test("Rocketry in: the research that brings the most Innovation per turn first", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const chosen = () => fake.sent.filter((s) => s.op === TECH).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);
    const depth = { NODE_TECH_MO_ROCKETRY: 1, NODE_TECH_MO_FLIGHT: 1, NODE_TECH_MO_ELECTRICITY: 1, NODE_TECH_MO_AERODYNAMICS: 1 };
    try {
        world.research = {
            tech: { available: [N("NODE_TECH_MO_FLIGHT"), N("NODE_TECH_MO_NUCLEAR_FISSION"), N("NODE_TECH_MO_ELECTRICITY"), N("NODE_TECH_MO_AERODYNAMICS")] }, culture: { available: [] }, depth,
            turns: { NODE_TECH_MO_FLIGHT: 2, NODE_TECH_MO_NUCLEAR_FISSION: 2, NODE_TECH_MO_ELECTRICITY: 3, NODE_TECH_MO_AERODYNAMICS: 8 },
        };
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_TECH_MO_ELECTRICITY"], "2 in 3 turns beats Aerodynamics' 5 in 8; Flight's and Fission's bring none");
        // An Airfield queued: Flight's mastery opens Trans-Oceanic Flight there, 5 in 2 turns.
        world.cities[1].queued = ["BUILDING_AIRFIELD"];
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_TECH_MO_FLIGHT"]);
    } finally {
        delete world.research;
        delete world.cities[1].queued;
    }
});

// Research/38 §4 E3: games 30 and 31 got Socialism (Public Works, +30% to every project) from the advisor at M38 and M33.
test("science civics: Socialism (Public Works) is a goal once we are in the Communism branch; the branch is never chosen for it", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const CIVIC = PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    const chosen = () => fake.sent.filter((s) => s.op === CIVIC).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);
    const turns = { NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION: 1, NODE_CIVIC_MO_BRANCH_CENTRALISM: 5, NODE_CIVIC_MO_BRANCH_COMMUNISM: 5 };
    try {
        world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_MO_BRANCH_CENTRALISM"), N("NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION")] }, depth: { NODE_CIVIC_MO_BRANCH_COMMUNISM: 1 }, turns };
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_MO_BRANCH_CENTRALISM"], "on Socialism's way");
        world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_MO_BRANCH_COMMUNISM"), N("NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION")] }, depth: {}, turns };
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION"], "not in the branch: no ideology chosen for a policy");
    } finally {
        delete world.research;
    }
});

test("the gate's progress: the share of Rocketry's way researched; open once Rocketry is in", () => {
    const pre = new Map();
    for (const r of GameInfo.ProgressionTreePrereqs) pre.set(r.Node, [...(pre.get(r.Node) ?? []), r.PrereqNode]);
    const gate = steps.gateState("SCIENCE").goal;
    assert.ok(gate, "a node unlocks the Launch Pad");
    const way = new Set();
    const stack = [gate];
    while (stack.length) {
        const n = stack.pop();
        if (way.has(n)) continue;
        way.add(n);
        stack.push(...(pre.get(n) ?? []));
    }
    const half = [...way].filter((n) => n !== gate).slice(0, Math.floor(way.size / 2));
    world.research = { depth: Object.fromEntries(half.map((n) => [n, 1])) };
    try {
        const g = steps.gateState("SCIENCE");
        assert.equal(g.open, false);
        assert.ok(Math.abs(g.progress - half.length / way.size) < 1e-9, JSON.stringify(g));
        world.research.depth[gate] = 1;
        assert.equal(steps.gateState("SCIENCE").open, true);
    } finally {
        delete world.research;
    }
});

// Research/38 §3.3, §4 B1: game 30's bank held one pad's price, priced in the cheapest city (2,148) while London's (2,620) was
// bought a turn late, and 3,088 went on Schoolhouses before Rocketry (1,072 three turns before it): one pad bought.
test("before Rocketry the bank holds the Launch Pads the race still needs, priced in the best producers, as research nears it; near it, all the gold above the reserve (research/21 L3)", () => {
    world.cities.push({ owner: 0, x: 3, y: 9, name: "Nice", prod: 20 }, { owner: 0, x: 10, y: 9, name: "Lille", prod: 5 });
    const PRICE = { Paris: 1200, Nice: 1000, Lyon: 800, Lille: 700 };
    world.buyCost = (type, c) => (type === "BUILDING_LAUNCH_PAD" ? PRICE[c?.name] ?? 1000 : 400);
    world.canBuy = (type, id) => (type === "BUILDING_SCHOOLHOUSE" && id.id === 0 ? { Success: true, Plots: [idx(2, 3)], Cost: 400 } : { Success: false });
    world.research = late(); // research brings no more Innovation
    world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 70 } }; // 30 to go: two Preparation runs
    const s = (progress) => ({ ...DEFAULT_SETTINGS, strategy: { goals: ["CONVERT", "PADS"], pads: 4, gate: { open: false, progress }, phase: "COMMIT" } });
    const bought = () => fake.sent.filter((x) => x.kind === "command" && x.op === CityCommandTypes.PURCHASE).length;
    try {
        world.goldIncome = 50;
        world.gold = 3000;
        steps.resetGoldPlan();
        fake.sent.length = 0;
        let p = steps.goldPlan(s(0.5), { focus: "SCIENCE", reserveTurns: 1 });
        assert.deepEqual([p.budget.goal?.kind, p.budget.goal?.cost, p.budget.goal?.hold], ["PADS", 2200, 1100], "two pads, in Paris and Nice (not the cheapest Lille and Lyon); half the way: half of it held");
        steps.buyVictoryWork("SCIENCE", 1, p.budget, { pads: 4, commit: true });
        assert.equal(bought(), 1, "2950 above the reserve, 1100 held: the Schoolhouse");
        // Near Rocketry: the whole bank, from all the gold above the reserve.
        world.gold = 2000;
        fake.sent.length = 0;
        p = steps.goldPlan(s(0.9), { focus: "SCIENCE", reserveTurns: 1 });
        assert.equal(p.budget.goal?.hold, 1950);
        steps.buyVictoryWork("SCIENCE", 1, p.budget, { pads: 4, commit: true });
        assert.equal(bought(), 0, "nothing free: the Schoolhouse waits");
        // Farther from it, a bank beyond the treasury never freezes it (research/22 B3: game 7 held 6,832 against 1,395).
        world.gold = 600;
        world.canBuy = (type, id) => (type === "BUILDING_SCHOOLHOUSE" && id.id === 0 ? { Success: true, Plots: [idx(2, 3)], Cost: 100 } : { Success: false });
        fake.sent.length = 0;
        p = steps.goldPlan(s(0.5), { focus: "SCIENCE", reserveTurns: 1 });
        steps.buyVictoryWork("SCIENCE", 1, p.budget, { pads: 4, commit: true });
        assert.equal(bought(), 1, "550 above the reserve, at most 412 held: the 100 Schoolhouse is bought");
        // Rocketry in: the pads go to the best producers first, where the bank priced them.
        world.canBuy = (type, id) => (type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(1 + id.id * 3, 6)], Cost: PRICE[Cities.get(id)?.name] ?? 1000 } : { Success: false });
        world.gold = 2200;
        world.goldIncome = 0;
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 0, undefined, { pads: 4, commit: true });
        const where = fake.sent.filter((x) => x.kind === "command" && x.op === CityCommandTypes.PURCHASE).map((x) => Cities.get(x.id)?.name);
        assert.deepEqual(where, ["Paris", "Nice"]);
    } finally {
        steps.resetGoldPlan();
        world.cities.splice(-2, 2);
        for (const k of ["buyCost", "canBuy", "gold", "goldIncome", "research", "victoryPoints"]) delete world[k];
    }
});

test("Rocketry in: Launch Pads bought in up to 5 cities in one pass (research/21 L3, D8)", () => {
    world.cities.push({ owner: 0, x: 3, y: 9, name: "Nice", prod: 20 }, { owner: 0, x: 10, y: 9, name: "Lille", prod: 5 }, { owner: 0, x: 16, y: 9, name: "Lens", prod: 5 });
    world.canBuy = (type, id) => (type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(1 + id.id * 3, 6)], Cost: 1500 } : { Success: false });
    const pads = () => fake.sent.filter((x) => x.kind === "command" && x.op === CityCommandTypes.PURCHASE && x.args.ConstructibleType === C("BUILDING_LAUNCH_PAD")).length;
    try {
        world.goldIncome = 0;
        world.gold = 10000;
        fake.sent.length = 0;
        const out = steps.buyVictoryWork("SCIENCE", 1, undefined, { pads: 5, commit: true });
        assert.equal(pads(), 5, JSON.stringify(out));
    } finally {
        world.cities.splice(-3, 3);
        for (const k of ["canBuy", "gold", "goldIncome"]) delete world[k];
    }
});

// Research/38 §4 C1: no Airfield flight ran in games 28-31, and the Radio Telescope came only where a Radio Station happened to
// stand: 15 Innovation that needs no Launch Pad. The sites now come once their building is unlocked, before the masteries their
// projects need, where the race says they bring the goal sooner (research/21 D5's idle Airfield is what siteHelps weighs).
test("the Airfield once Flight is researched, the Radio Station once Radio is, each in a city without a Launch Pad", () => {
    const placed = (type) => fake.sent.filter((x) => x.kind === "operation" && x.args.ConstructibleType === C(type)).map((x) => x.id.id);
    const canBuild = world.canBuild;
    // A Launch Pad only in Paris: the other sites go to Lyon (never to a Launch Pad's city: research/32 §3).
    const SITES = ["BUILDING_AIRFIELD", "BUILDING_RADIO_STATION"];
    world.canBuild = (type, id) => (SITES.includes(type) || (type === "BUILDING_LAUNCH_PAD" && id.id === 0) ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    // Lyon: each site 20 turns, its project 10; Preparation at its own 2000.
    world.costOf = (t) => ({ BUILDING_AIRFIELD: 200, BUILDING_RADIO_STATION: 200 })[t] ?? (t.startsWith("PROJECT_") && t !== "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 100 : undefined);
    try {
        world.research = { depth: {} };
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual([placed("BUILDING_AIRFIELD"), placed("BUILDING_RADIO_STATION")], [[], []], "neither unlocked");
        world.research = { depth: { NODE_TECH_MO_FLIGHT: 1, NODE_TECH_MO_RADIO: 1 } };
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual([placed("BUILDING_AIRFIELD"), placed("BUILDING_RADIO_STATION")], [[1], [1]], "Lyon, before the masteries");
    } finally {
        world.canBuild = canBuild;
        for (const k of ["research", "costOf"]) delete world[k];
    }
});

test("science, Modern: owned Tea (a science factory resource) gets a Factory in the best producing city (research/21 L7)", () => {
    const factory = () => fake.sent.filter((x) => x.kind === "operation" && x.args.ConstructibleType === C("BUILDING_FACTORY")).map((x) => x.id.id);
    try {
        world.resources = [{ value: 1, type: "RESOURCE_TEA" }];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(factory(), [0], "Paris");
        world.resources = [{ value: 1, type: "RESOURCE_COTTON" }];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(factory(), [], "Cotton gives production, not science");
    } finally {
        delete world.resources;
    }
});

test("Rocketry too late to pay (the strategy's gateLate): the Innovation masteries come first, no gate (research/22 A2)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const chosen = () => fake.sent.filter((s) => s.op === TECH).map((s) => s.args.ProgressionTreeNodeType);
    world.research = {
        tech: { available: [N("NODE_TECH_MO_ELECTRICITY"), N("NODE_TECH_MO_RADIO")] }, culture: { available: [] },
        depth: { NODE_TECH_MO_ELECTRICITY: 1 }, turns: { NODE_TECH_MO_ELECTRICITY: 6, NODE_TECH_MO_RADIO: 2 },
    };
    try {
        fake.sent.length = 0;
        steps.chooseResearch("tech", { ...DEFAULT_SETTINGS, strategy: { gateLate: true } }, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_TECH_MO_ELECTRICITY")], "Electricity's mastery: 2 Innovation now");
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_TECH_MO_RADIO")], "in time: the way to Rocketry");
    } finally {
        delete world.research;
    }
});

test("the Airfield as a savings goal, also more than 12 turns of income away while it fits the age (research/24 P1: «goal none» with 234-795 gold)", () => {
    const canBuild = world.canBuild;
    world.canBuild = (type, id) => (type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : canBuild(type, id));
    world.canBuy = (type, id) => (type === "BUILDING_AIRFIELD" && id.id === 0 ? { Success: false, InsufficientFunds: true, Plots: [idx(4, 4)], Cost: 1100 } : { Success: false });
    const s = { ...DEFAULT_SETTINGS, strategy: { goals: ["AIRFIELD"], phase: "COMMIT" } };
    try {
        world.research = { depth: { NODE_TECH_MO_FLIGHT: 2 } };
        world.goldIncome = 50;
        world.gold = 100;
        steps.resetGoldPlan();
        let p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.deepEqual([p.budget.goal?.kind, p.budget.goal?.cost], ["AIRFIELD", 1100], "20 turns of income: still a goal");
        world.research = { depth: {} };
        p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(p.budget.goal, null, "Flight not researched: no Airfield yet");
    } finally {
        world.canBuild = canBuild;
        for (const k of ["canBuy", "gold", "goldIncome", "research"]) delete world[k];
    }
});

// Game 11 (Лянчжоу): the Launch Pad's overflow went into a Cannery the plan had queued behind it, and Crewed Space
// Flight Preparation waited 9 turns behind the Cannery's progress.
const MOVE = () => fake.sent.filter((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo).map((s) => [s.id.id, s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
const withPad = (fn) => {
    const structures = world.structures;
    const canBuild = world.canBuild;
    world.structures = (x, y) => (x === 4 && y === 3 ? { district: null, constructibles: ["BUILDING_LAUNCH_PAD"] } : { district: null, constructibles: [] });
    world.canBuild = (type, id) => (type === undefined || type === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? { Success: true, Plots: [] } : canBuild(type, id));
    try {
        fn();
    } finally {
        world.structures = structures;
        world.canBuild = canBuild;
        delete world.cities[0].queue;
        delete world.cities[0].queued;
        world.cities[0].queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
    }
};

test("a space city: Crewed Space Flight Preparation goes ahead of a plain building with progress (nothing is lost either way)", () => {
    withPad(() => {
        world.cities[0].queue = { type: "BUILDING_CANNERY", turns: 9, pct: 30 };
        world.cities[0].queued = ["PROJECT_CREWED_SPACE_FLIGHT_PREP"];
        world.costOf = () => 400;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        delete world.costOf;
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [[0, 1, 0]]);
    });
});

test("a science project never goes ahead of a Launch Pad in production: the projects need it", () => {
    withPad(() => {
        world.cities[0].queue = { type: "BUILDING_LAUNCH_PAD", turns: 5, pct: 50 };
        world.cities[0].queued = ["PROJECT_LAUNCH_SATELLITE"];
        world.costOf = () => 700;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        delete world.costOf;
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [], "behind the pad");
    });
});

// Research/38 §3.2: games 30 and 31 started their Launch Pads 2-8 turns after Rocketry, behind a Cannery, a Laboratory and
// City Parks begun just before it.
test("Rocketry in: a queued Launch Pad goes ahead of a plain building with progress, not of a wonder", () => {
    const paris = world.cities[0];
    try {
        paris.queue = { type: "BUILDING_CANNERY", turns: 9, pct: 30 };
        paris.queued = ["BUILDING_LAUNCH_PAD"];
        world.costOf = () => 400; // 120 in the Cannery: more than a turn of Paris's 30
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [[0, 1, 0]]);
        paris.queue = { type: "WONDER_EIFFEL_TOWER", turns: 9, pct: 30 };
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [], "behind a wonder");
    } finally {
        delete world.costOf;
        delete paris.queued;
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
    }
});

test("the final push: a space city's empty queue takes no plan building but its science sites; no explorer, settler or scout from it", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const plans = state.get().results.plans;
    const C2 = (t) => GameInfo.Constructibles.lookup(t)?.ConstructibleType;
    withPad(() => {
        const canBuild = world.canBuild;
        world.canBuild = (type, id, args) => (type === "BUILDING_CANNERY" ? { Success: true, Plots: [idx(4, 2)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
        delete world.cities[0].queue;
        state.set({ results: { ...state.get().results, plans: { placements: [{ sid: `c:${PARIS.x}-${PARIS.y}`, type: "BUILDING_CANNERY", x: 4, y: 2 }] } } });
        const commit = { victory: "SCIENCE", strategy: { phase: "COMMIT", pads: 3, gate: { open: true } } };
        try {
            fake.sent.length = 0;
            steps.fillProduction(new Map(), commit);
            const built = fake.sent.filter((s) => s.kind === "operation" && s.id.id === 0 && s.args.ConstructibleType !== undefined).map((s) => C2(s.args.ConstructibleType));
            assert.ok(!built.includes("BUILDING_CANNERY"), JSON.stringify(built));
            // Nor the advisor's buildings (only its projects).
            const subjects = GameInfo.AdvisorySubjects;
            GameInfo.AdvisorySubjects = { lookup: (h) => (h === 9 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_CONSTRUCTIBLES" } : null) };
            world.buildRecs = () => [{ subject: 9, recommendedType: "BUILDING_CANNERY", whichAdvisors: [] }];
            state.set({ results: { ...state.get().results, plans: { placements: [] } } });
            fake.sent.length = 0;
            steps.fillProduction(new Map(), commit);
            delete world.buildRecs;
            GameInfo.AdvisorySubjects = subjects;
            assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.id.id === 0 && C2(s.args.ConstructibleType) === "BUILDING_CANNERY"), "the advisor's Cannery neither");
            state.set({ results: { ...state.get().results, plans: { placements: [{ sid: `c:${PARIS.x}-${PARIS.y}`, type: "BUILDING_CANNERY", x: 4, y: 2 }] } } });
            fake.sent.length = 0;
            steps.fillProduction(new Map(), { victory: "SCIENCE", strategy: { phase: "BUILD" } });
            assert.ok(fake.sent.some((s) => s.kind === "operation" && s.id.id === 0 && C2(s.args.ConstructibleType) === "BUILDING_CANNERY"), "outside the final push: the plan as before");
            // Explorers and scouts wanted: not from Paris (a space city); Lyon trains them.
            world.cities[0].queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 20 };
            world.canBuild = (type, id, args) => (type === "UNIT_SCOUT" ? { Success: true } : canBuild(type, id, args));
            fake.sent.length = 0;
            steps.fillProduction(new Map(), { ...commit, explore: true });
            const scouts = fake.sent.filter((s) => s.kind === "operation" && GameInfo.Units.lookup(s.args.UnitType)?.UnitType === "UNIT_SCOUT").map((s) => s.id.id);
            assert.ok(scouts.length > 0 && scouts.every((id) => id !== 0), JSON.stringify(scouts));
            // The age's first melee unit, wanted in a peaceful final push too (research/37 §2): not from Paris either.
            settings.remember(gameKey(), { melee: null });
            world.canBuild = (type, id, args) => (type === "UNIT_LINE_INFANTRY" ? { Success: true } : canBuild(type, id, args));
            fake.sent.length = 0;
            const out = steps.fillProduction(new Map(), { ...commit, defend: true });
            const melee = fake.sent.filter((s) => s.kind === "operation" && steps.meleeStrength(GameInfo.Units.lookup(s.args.UnitType)) > 0).map((s) => s.id.id);
            assert.deepEqual(melee, [1], `Lyon: ${JSON.stringify(out)}`);
        } finally {
            world.canBuild = canBuild;
            state.set({ results: { ...state.get().results, plans } });
        }
    });
});

test("the final age: a Launch Pad or an Airfield only where it and its project are done before the game ends (research/30 §3: game 23 ended with six Launch Pads unfinished, and an Airfield done with no time for its projects)", () => {
    const SITES = ["BUILDING_LAUNCH_PAD", "BUILDING_AIRFIELD"];
    const TURNS = { Paris: 8, Lyon: 9 };
    world.turnsFor = (c) => TURNS[c.name] ?? -1;
    const canBuild = world.canBuild;
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : SITES.includes(type) ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.research = { depth: { NODE_TECH_MO_FLIGHT: 2 } }; // Trans-Oceanic Flight open: the Airfield is wanted
    world.costOf = (t) => (t.startsWith("PROJECT_") ? 1000 : 900);
    const city = (name) => Players.get(0).Cities.getCities().find((c) => c.name === name).id.id;
    try {
        world.finalAge = true;
        world.agePoints = 50; // 60 turns left: Paris (30 production) a site in 8 turns and a project in 34; Lyon (10) in 9 and 100
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), [[city("Paris"), C("BUILDING_LAUNCH_PAD")]], "not in Lyon; and no Airfield in Paris, the Launch Pad's city (research/32 §3)");
        world.agePoints = 75; // 30 left: none, not even the victory's first Launch Pad
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), []);
        // One already queued that can no longer be done in time is not pushed ahead (the age-end step would move it back).
        world.cities[0].queued = ["BUILDING_LAUNCH_PAD"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.ok(!fake.sent.some((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo), JSON.stringify(fake.sent));
    } finally {
        world.canBuild = canBuild;
        delete world.cities[0].queued;
        for (const k of ["turnsFor", "research", "costOf", "finalAge", "agePoints"]) delete world[k];
    }
});

test("the final age: a Launch Pad is bought only where Launch Satellite is still done after it; no Airfield goal where its projects would not be (research/30 §3)", () => {
    world.canBuy = (type, id) => (type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(1 + id.id * 3, 6)], Cost: 1500 } : { Success: false });
    world.costOf = (t) => (t.startsWith("PROJECT_") ? 1000 : 900);
    const pads = () => fake.sent.filter((x) => x.kind === "command" && x.op === CityCommandTypes.PURCHASE && x.args.ConstructibleType === C("BUILDING_LAUNCH_PAD")).map((x) => x.id.id);
    try {
        world.goldIncome = 0;
        world.gold = 10000;
        world.finalAge = true;
        world.agePoints = 50; // 60 left: Launch Satellite in 34 turns in Paris, 100 in Lyon
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 1, undefined, { pads: 5, commit: true });
        assert.deepEqual(pads(), [0], "Paris only");
        world.agePoints = 80; // 24 left: neither
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 1, undefined, { pads: 5, commit: true });
        assert.deepEqual(pads(), []);
        // The Airfield goal: Trans-Oceanic Flight takes Paris 34 turns.
        const canBuild = world.canBuild;
        world.canBuild = (type, id) => (type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : canBuild(type, id));
        world.canBuy = (type, id) => (type === "BUILDING_AIRFIELD" && id.id === 0 ? { Success: false, InsufficientFunds: true, Plots: [idx(4, 4)], Cost: 1100 } : { Success: false });
        world.research = { depth: { NODE_TECH_MO_FLIGHT: 2 } };
        world.goldIncome = 100;
        world.gold = 100;
        const s = { ...DEFAULT_SETTINGS, strategy: { goals: ["AIRFIELD"], phase: "COMMIT" } };
        try {
            world.agePoints = 50;
            steps.resetGoldPlan();
            assert.equal(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.kind, "AIRFIELD", "60 left");
            world.agePoints = 80;
            steps.resetGoldPlan();
            assert.equal(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal, null, "24 left");
        } finally {
            world.canBuild = canBuild;
        }
    } finally {
        steps.resetGoldPlan();
        for (const k of ["canBuy", "costOf", "gold", "goldIncome", "finalAge", "agePoints", "research"]) delete world[k];
    }
});

test("the final age: Crewed Space Flight Preparation only where a run is done before the game ends (research/30 §3)", () => {
    withPad(() => {
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 600 : 900); // 20 turns in Paris
        const preps = () => fake.sent.filter((s) => s.kind === "operation" && s.args.ProjectType === P("PROJECT_CREWED_SPACE_FLIGHT_PREP")).length;
        try {
            world.finalAge = true;
            world.agePoints = 50; // 60 left
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.equal(preps(), 1);
            world.agePoints = 85; // 18 left
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.equal(preps(), 0);
        } finally {
            for (const k of ["costOf", "finalAge", "agePoints"]) delete world[k];
        }
    });
});

test("the final age with the score victory off goes on past its 100%: Launch Pads, the Airfield and Crewed Space Flight Preparation are not cut (research/31 §1: game 26)", () => {
    const vm = Game.VictoryManager;
    const canBuild = world.canBuild;
    // A Launch Pad only in Paris; the Airfield goes to Lyon (never to a Launch Pad's city: research/32 §3).
    const site = (type, id) => type === "BUILDING_AIRFIELD" || (type === "BUILDING_LAUNCH_PAD" && id.id === 0);
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : site(type, id) ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.turnsFor = (c) => ({ Paris: 8, Lyon: 9 })[c.name] ?? -1;
    world.research = late();
    world.costOf = (t) => (t.startsWith("PROJECT_") ? 1000 : 900);
    // 95 Innovation to go: Trans-Oceanic Flight's 5 bring the goal from turn 264 to 231 (siteHelps).
    world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 5 } };
    const city = (name) => Players.get(0).Cities.getCities().find((c) => c.name === name).id.id;
    try {
        world.finalAge = true;
        world.agePoints = 100; // the age's points are full: the game goes on with the score victory off
        Game.VictoryManager = { isScoreVictoryEnabled: () => false };
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), [[city("Paris"), C("BUILDING_LAUNCH_PAD")], [city("Lyon"), C("BUILDING_AIRFIELD")]]);
        Game.VictoryManager = { isScoreVictoryEnabled: () => true };
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), [], "the score victory on: the game ends now");
    } finally {
        Game.VictoryManager = vm;
        world.canBuild = canBuild;
        for (const k of ["turnsFor", "research", "costOf", "finalAge", "agePoints", "victoryPoints"]) delete world[k];
    }
    withPad(() => {
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 600 : 900);
        // Only Paris has a Launch Pad: only there may it run.
        const padded = world.canBuild;
        world.canBuild = (type, id, args) => (type === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? { Success: id.id === 0, Plots: [] } : padded(type, id, args));
        const preps = () => fake.sent.filter((s) => s.kind === "operation" && s.args.ProjectType === P("PROJECT_CREWED_SPACE_FLIGHT_PREP")).length;
        try {
            world.finalAge = true;
            world.agePoints = 100;
            Game.VictoryManager = { isScoreVictoryEnabled: () => false };
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.equal(preps(), 1, "a 20-turn run past the age's 100%");
            Game.VictoryManager = { isScoreVictoryEnabled: () => true };
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.equal(preps(), 0, "the score victory on: the game ends now");
        } finally {
            Game.VictoryManager = vm;
            for (const k of ["costOf", "finalAge", "agePoints"]) delete world[k];
        }
    });
});

test("a city picked for a Launch Pad builds its plan until its pad is queued (research/31 §2: game 26's pad cities ran «Научная инициатива» for 36-75 turns)", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const plans = state.get().results.plans;
    world.cities.push({ owner: 0, x: 3, y: 9, name: "Nice", prod: 20 }, { owner: 0, x: 10, y: 9, name: "Lille", prod: 5 });
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === "BUILDING_CANNERY" ? { Success: true, Plots: [idx(11, 2)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    const C2 = (t) => GameInfo.Constructibles.lookup(t)?.ConstructibleType;
    // Lyon (10 production): one of the 3 best producers once Rocketry is in, no pad of its own yet, an empty queue.
    state.set({ results: { ...state.get().results, plans: { placements: [{ sid: `c:${LYON.x}-${LYON.y}`, type: "BUILDING_CANNERY", x: 11, y: 2 }] } } });
    const commit = { victory: "SCIENCE", strategy: { phase: "COMMIT", pads: 3, gate: { open: true } } };
    try {
        assert.ok(steps.padCities(3).has(`c:${LYON.x}-${LYON.y}`), "a pad city");
        fake.sent.length = 0;
        steps.fillProduction(new Map(), commit);
        assert.ok(fake.sent.some((s) => s.kind === "operation" && s.id.id === 1 && C2(s.args.ConstructibleType) === "BUILDING_CANNERY"), JSON.stringify(fake.sent));
    } finally {
        world.canBuild = canBuild;
        world.cities.splice(-2, 2);
        state.set({ results: { ...state.get().results, plans } });
    }
});

// Research/38 §3.2: games 30 and 31 started Canneries, Laboratories and City Parks in their pad cities a turn or two before
// Rocketry, and the pads waited 2-8 turns behind them.
test("near Rocketry a city kept for a Launch Pad starts no building that would still be in production then, production buildings aside", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const plans = state.get().results.plans;
    const paris = world.cities[0];
    const canBuild = world.canBuild;
    const OFFER = ["BUILDING_CITY_PARK", "BUILDING_IRONWORKS"];
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : OFFER.includes(type) ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    // Rocketry's way all in but Rocketry itself (3 turns); no pad offered yet.
    const pre = new Map();
    for (const r of GameInfo.ProgressionTreePrereqs) pre.set(r.Node, [...(pre.get(r.Node) ?? []), r.PrereqNode]);
    const depth = {};
    const stack = [...(pre.get("NODE_TECH_MO_ROCKETRY") ?? [])];
    while (stack.length > 0) {
        const n = stack.pop();
        if (depth[n]) continue;
        depth[n] = 1;
        stack.push(...(pre.get(n) ?? []));
    }
    world.research = { depth, turns: { NODE_TECH_MO_ROCKETRY: 3 } };
    world.costOf = (t) => ({ BUILDING_CITY_PARK: 420, BUILDING_IRONWORKS: 535 })[t]; // Paris: 14 and 18 turns
    state.set({ results: { ...state.get().results, plans: null } });
    const queued = (id) => fake.sent.filter((s) => s.kind === "operation" && s.id.id === id && s.args.ConstructibleType !== undefined).map((s) => GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleType);
    const commit = (progress) => ({ victory: "SCIENCE", strategy: { phase: "COMMIT", pads: 2, padCitiesNoWonders: true, gate: { open: false, progress } } });
    try {
        delete paris.queue;
        assert.ok(steps.padCities(2).has(`c:${PARIS.x}-${PARIS.y}`) && !steps.padCities(2).has(`c:${LYON.x}-${LYON.y}`));
        fake.sent.length = 0;
        steps.fillProduction(new Map(), commit(0.9));
        assert.deepEqual([queued(0), queued(1)], [["BUILDING_IRONWORKS"], ["BUILDING_CITY_PARK"]], "Paris: the Ironworks (production), not the 14-turn City Park; Lyon is no pad city");
        fake.sent.length = 0;
        steps.fillProduction(new Map(), commit(0.4));
        assert.deepEqual(queued(0), ["BUILDING_CITY_PARK"], "Rocketry still far: the cheapest");
        // The plan's own Launch Pad is never held back for room (game 32: «keeps room for its Launch Pad: no BUILDING_LAUNCH_PAD»).
        state.set({ results: { ...state.get().results, plans: { placements: [{ sid: `c:${PARIS.x}-${PARIS.y}`, type: "BUILDING_LAUNCH_PAD", x: 4, y: 4 }], fillers: [] } } });
        const lines = [];
        const warn = console.warn;
        const info = console.log;
        console.warn = console.log = (...a) => lines.push(a.join(" "));
        Game.turn += 1;
        try {
            steps.fillProduction(new Map(), commit(0.9));
        } finally {
            console.warn = warn;
            console.log = info;
            Game.turn -= 1;
        }
        assert.ok(!lines.some((l) => l.includes("no BUILDING_LAUNCH_PAD")), lines.filter((l) => l.includes("keeps room")).join(" | "));
    } finally {
        world.canBuild = canBuild;
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
        for (const k of ["research", "costOf"]) delete world[k];
        state.set({ results: { ...state.get().results, plans } });
    }
});

test("a Launch Pad slower than 10 turns is built where the gold would buy it later, up to 30 turns; else left to the purchase (research/31 §2: game 26's pads cost 3,864 gold against about 80 a turn)", () => {
    const canBuild = world.canBuild;
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    const TURNS = { Paris: 8, Lyon: 25 };
    world.turnsFor = (c) => TURNS[c.name] ?? -1;
    world.buyCost = (t) => (t === "BUILDING_LAUNCH_PAD" ? 3000 : 250);
    const pads = () => builds().filter(([, t]) => t === C("BUILDING_LAUNCH_PAD")).map(([id]) => id);
    try {
        world.gold = 0;
        world.goldIncome = 50; // 60 turns of income
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(pads(), [0, 1], "Lyon builds its own in 25 turns");
        world.gold = 5000;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(pads(), [0], "the gold buys Lyon's at once");
        world.gold = 0;
        TURNS.Lyon = 35;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(pads(), [0], "35 turns: too slow");
    } finally {
        world.canBuild = canBuild;
        for (const k of ["turnsFor", "buyCost", "gold", "goldIncome"]) delete world[k];
    }
});

test("production first: a city with a Launch Pad queued builds the production buildings that pay for themselves before its space work, and they go ahead of the pad (research/31 §2.4: Бак, 40 production, a 24-turn pad)", () => {
    const PROD = GameInfo.Yields.lookup("YIELD_PRODUCTION").$index;
    const gain = (g) => {
        const y = [];
        y[PROD] = g;
        return y;
    };
    const COSTS = { BUILDING_LAUNCH_PAD: 900, BUILDING_IRONWORKS: 267, BUILDING_STEEL_MILL: 900, BUILDING_GROCER: 267, BUILDING_MILITARY_ACADEMY: 300 };
    world.costOf = (t) => COSTS[t] ?? 1000;
    const canBuild = world.canBuild;
    const BUILT = ["BUILDING_IRONWORKS", "BUILDING_STEEL_MILL", "BUILDING_GROCER", "BUILDING_MILITARY_ACADEMY"];
    world.canBuild = (type, id, args) => (BUILT.includes(type) && id.id === 0 ? { Success: true, Plots: [idx(5, 3)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    // The game's placement numbers: the Ironworks +10 production, the Steel Mill +5 (900: it does not pay), the Grocer food
    // only, the Military Academy +20 (tagged PRODUCTION as well as MILITARY: a production building, research/34).
    world.placements = (c) => (c.name !== "Paris" ? null : {
        buildings: [
            { constructibleType: C("BUILDING_MILITARY_ACADEMY"), placements: [{ plotID: idx(5, 3), yieldChanges: gain(20) }] },
            { constructibleType: C("BUILDING_IRONWORKS"), placements: [{ plotID: idx(5, 3), yieldChanges: gain(10) }] },
            { constructibleType: C("BUILDING_STEEL_MILL"), placements: [{ plotID: idx(5, 3), yieldChanges: gain(5) }] },
            { constructibleType: C("BUILDING_GROCER"), placements: [{ plotID: idx(5, 3), yieldChanges: [6] }] },
        ],
    });
    const paris = world.cities[0];
    try {
        steps.resetProductionFirst();
        paris.queued = ["BUILDING_LAUNCH_PAD"];
        fake.sent.length = 0;
        const out = steps.pushVictoryWork("SCIENCE");
        const first = builds().filter(([id, t]) => id === 0 && BUILT.some((b) => C(b) === t));
        assert.deepEqual(first, [[0, C("BUILDING_MILITARY_ACADEMY")], [0, C("BUILDING_IRONWORKS")]], JSON.stringify(out));
        const e = out.find((x) => x.key === "PRODUCTION_FIRST");
        // 900 for the pad and what Paris runs before the goal or the age's end (96 turns away): one Preparation run, 1000.
        assert.deepEqual(e?.args.slice(2), [20, 1900], "the pad and the one Preparation run done in time");
        // Next pass: the Ironworks in the queue goes to the front first (the city's one edit), the pad stays behind it.
        paris.queued = ["BUILDING_LAUNCH_PAD", "BUILDING_IRONWORKS", "BUILDING_MILITARY_ACADEMY"];
        fake.sent.length = 0;
        steps.beginQueuePass();
        steps.pushVictoryWork("SCIENCE");
        steps.endQueuePass();
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [[0, 2, 0]]);
        assert.deepEqual(builds().filter(([id, t]) => id === 0 && (t === C("BUILDING_IRONWORKS") || t === C("BUILDING_MILITARY_ACADEMY"))), [], "queued once");
        // The Ironworks in production, nothing in it yet: the pad stays behind it.
        paris.queue = { type: "BUILDING_IRONWORKS", turns: 7, pct: 0 };
        paris.queued = ["BUILDING_LAUNCH_PAD"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [], "the pad does not jump ahead of it");
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
        // A city with no space work and none to come (the game refuses it a Launch Pad): none.
        paris.queued = [];
        steps.resetProductionFirst();
        const offer = world.canBuild;
        world.canBuild = (type, id, args) => (type === "BUILDING_LAUNCH_PAD" ? { Success: false, Plots: [] } : offer(type, id, args));
        assert.ok(!steps.pushVictoryWork("SCIENCE").some((x) => x.key === "PRODUCTION_FIRST"));
        world.canBuild = offer;
    } finally {
        steps.resetProductionFirst();
        world.canBuild = canBuild;
        delete paris.queued;
        for (const k of ["costOf", "placements"]) delete world[k];
    }
});

test("one-off projects spread: the next goes to another city that may run it when the one-offs queued in the first make it later (research/31 §2: game 26's three, 17 turns each, in one city)", () => {
    world.cities.push({ owner: 0, x: 3, y: 9, name: "Nice", prod: 20 });
    const structures = world.structures;
    const canBuild = world.canBuild;
    // Launch Pads in Paris and Nice: both may run Launch Satellite.
    world.structures = (x, y) => ((x === 4 && y === 3) || (x === 4 && y === 9) ? { district: null, constructibles: ["BUILDING_LAUNCH_PAD"] } : { district: null, constructibles: [] });
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : type === "PROJECT_LAUNCH_SATELLITE" ? { Success: true, Plots: [] } : { Success: false, Plots: [] });
    world.costOf = () => 1000;
    const satellite = () => builds().filter(([, t]) => t === P("PROJECT_LAUNCH_SATELLITE")).map(([id]) => id);
    const nice = () => Players.get(0).Cities.getCities().find((c) => c.name === "Nice").id.id;
    try {
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(satellite(), [0], "Paris: 33 turns, Nice 50");
        // Paris has Break the Sound Barrier queued (33 turns): 67 there, 50 in Nice.
        world.cities[0].queued = ["PROJECT_BREAK_SOUND_BARRIER"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(satellite(), [nice()]);
        // The Radio Telescope where a Radio Station stands and no Launch Pad: Lyon (10 production), not in 120 turns.
        world.canBuild = (type, id) => (type === undefined ? { Success: true } : type === "PROJECT_CREWED_SPACE_FLIGHT_RESEARCH" ? { Success: id.id === 1, Plots: [] } : { Success: false, Plots: [] });
        const telescope = () => builds().filter(([, t]) => t === P("PROJECT_CREWED_SPACE_FLIGHT_RESEARCH")).map(([id]) => id);
        world.costOf = () => 250;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(telescope(), [1], "25 turns");
        world.costOf = () => 500;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(telescope(), [], "50 turns: too long, though the age has more left");
    } finally {
        world.structures = structures;
        world.canBuild = canBuild;
        delete world.costOf;
        delete world.cities[0].queued;
        world.cities.splice(-1, 1);
    }
});

// Research/32 §2: the victory work moved with one queue edit a pass. Each pass the fake's queue takes the moves sent.
const applyMoves = (city, id) => {
    for (const m of fake.sent.filter((s) => s.kind === "operation" && s.id.id === id && s.args.InsertMode === CityOperationsParametersValues.MoveTo)) {
        const list = [city.queue.type, ...(city.queued ?? [])];
        const [item] = list.splice(m.args.QueueSourceLocation, 1);
        list.splice(m.args.QueueDestinationLocation, 0, item);
        city.queue = { type: list[0], turns: 3 };
        city.queued = list.slice(1);
    }
};
const passes = (n, city, id) => {
    const moves = [];
    for (let i = 0; i < n; i++) {
        fake.sent.length = 0;
        steps.beginQueuePass();
        steps.pushVictoryWork("SCIENCE");
        steps.endQueuePass();
        moves.push(MOVE().filter(([c]) => c === id).length);
        applyMoves(city, id);
    }
    return moves;
};

test("the space work keeps one order: the Launch Pad moves first, ahead of the Airfield and a path's building queued before it, and then nothing takes turns at the front (research/32 §2: game 27, the capital's Airfield and Launch Pad traded places every pass, and the Airfield went first)", () => {
    const paris = world.cities[0];
    world.research = { depth: { NODE_TECH_MO_FLIGHT: 2 } }; // the Airfield's flights open
    try {
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 3 };
        paris.queued = ["BUILDING_SCHOOLHOUSE", "BUILDING_AIRFIELD", "BUILDING_LAUNCH_PAD"];
        passes(1, paris, 0);
        assert.equal(paris.queue.type, "BUILDING_LAUNCH_PAD", `the first pass's one move is the pad's: ${JSON.stringify([paris.queue.type, ...paris.queued])}`);
        const moves = passes(5, paris, 0);
        assert.deepEqual([paris.queue.type, ...paris.queued], ["BUILDING_LAUNCH_PAD", "BUILDING_AIRFIELD", "BUILDING_SCHOOLHOUSE", "BUILDING_RAIL_STATION"], JSON.stringify(moves));
        assert.deepEqual(moves.slice(2), [0, 0, 0], "settled");
    } finally {
        delete world.research;
        delete paris.queued;
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
    }
});

test("in a Launch Pad's city Crewed Space Flight Preparation goes ahead of a one-off, and stays there (research/32 §3: 15 Innovation for 1000, the one-offs 5 for 500)", () => {
    withPad(() => {
        const paris = world.cities[0];
        paris.queue = { type: "BUILDING_CANNERY", turns: 3 };
        paris.queued = ["PROJECT_LAUNCH_SATELLITE", "PROJECT_CREWED_SPACE_FLIGHT_PREP"];
        const moves = passes(5, paris, 0);
        assert.deepEqual([paris.queue.type, ...paris.queued], ["PROJECT_CREWED_SPACE_FLIGHT_PREP", "PROJECT_LAUNCH_SATELLITE", "BUILDING_CANNERY"], JSON.stringify(moves));
        assert.deepEqual(moves.slice(2), [0, 0, 0], "settled");
    });
});

test("the Airfield never in a Launch Pad's city: one there does not count, and none is placed, bought or saved for there (research/32 §3)", () => {
    world.cities[0].queued = ["BUILDING_LAUNCH_PAD"]; // Paris: a Launch Pad queued; Lyon cannot build one
    const canBuild = world.canBuild;
    world.canBuild = (type, id) => (type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] }
        : type === "BUILDING_LAUNCH_PAD" && id.id !== 0 ? { Success: false, Plots: [] } : canBuild(type, id));
    world.research = { depth: { NODE_TECH_MO_FLIGHT: 2 } };
    const airfields = (kind) => fake.sent.filter((x) => x.kind === kind && x.args.ConstructibleType === C("BUILDING_AIRFIELD")).map((x) => x.id.id);
    try {
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(airfields("operation"), [1], "Lyon builds it");
        // An Airfield queued in Paris (before this rule) does not count: Lyon still gets one.
        world.cities[0].queued = ["BUILDING_LAUNCH_PAD", "BUILDING_AIRFIELD"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(airfields("operation"), [1]);
        // Bought: in Lyon, not in Paris.
        world.canBuy = (type) => (type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(11, 4)], Cost: 300 } : { Success: false });
        world.gold = 5000;
        world.goldIncome = 0;
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 0);
        assert.deepEqual(airfields("command"), [1]);
        // The savings goal: Lyon's.
        world.canBuy = (type, id) => (type === "BUILDING_AIRFIELD" ? { Success: false, InsufficientFunds: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], Cost: 1100 } : { Success: false });
        world.gold = 100;
        world.goldIncome = 50;
        steps.resetGoldPlan();
        const goal = steps.goldPlan({ ...DEFAULT_SETTINGS, strategy: { goals: ["AIRFIELD"], phase: "COMMIT" } }, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal;
        assert.equal(goal?.key, `c:${LYON.x}-${LYON.y}|BUILDING_AIRFIELD`);
        // A wonder queued in Lyon: no Airfield saved for there (research/32 §6).
        world.cities[1].queued = ["WONDER_EIFFEL_TOWER"];
        steps.resetGoldPlan();
        const none = steps.goldPlan({ ...DEFAULT_SETTINGS, strategy: { goals: ["AIRFIELD"], phase: "COMMIT" } }, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal;
        assert.notEqual(none?.key, `c:${LYON.x}-${LYON.y}|BUILDING_AIRFIELD`);
    } finally {
        steps.resetGoldPlan();
        world.canBuild = canBuild;
        delete world.cities[0].queued;
        delete world.cities[1].queued;
        for (const k of ["canBuy", "gold", "goldIncome", "research"]) delete world[k];
    }
});

// Research/38 §3.5: game 30 held 2,216-2,284 gold for about 20 turns for an Airfield the purchase step kept refusing (it
// would not bring the goal sooner), then spent it on a Laboratory at M55.
test("no Airfield savings goal where it would not bring the science victory sooner, as its purchase would not", () => {
    withPad(() => {
        const canBuild = world.canBuild;
        world.canBuild = (type, id) => (type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 4)], ExpandUrbanPlots: [] } : canBuild(type, id));
        world.canBuy = (type, id) => (type === "BUILDING_AIRFIELD" && id.id === 1 ? { Success: false, InsufficientFunds: true, Plots: [idx(11, 4)], Cost: 1100 } : { Success: false });
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 600 : t.startsWith("PROJECT_") ? 100 : undefined); // Paris's run 20 turns, Lyon's flights 10 each
        world.research = late();
        const goal = () => {
            steps.resetGoldPlan();
            return steps.goldPlan({ ...DEFAULT_SETTINGS, strategy: { goals: ["AIRFIELD"], phase: "COMMIT" } }, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.key ?? null;
        };
        try {
            world.gold = 100;
            world.goldIncome = 50;
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 95 } }; // 5 to go: Lyon's first flight (10 turns) beats Paris's run (20)
            assert.equal(goal(), `c:${LYON.x}-${LYON.y}|BUILDING_AIRFIELD`);
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 85 } }; // 15 to go: Paris's run at 20 either way
            assert.equal(goal(), null);
        } finally {
            steps.resetGoldPlan();
            world.canBuild = canBuild;
            for (const k of ["canBuy", "costOf", "gold", "goldIncome", "research", "victoryPoints"]) delete world[k];
        }
    });
});

// Research/38 §3.3: a Launch Pad in production was never bought, though the game sells an item in progress at what it lacks
// (game 30: 1,600-2,100 gold M47-M53 beside three half-built pads).
test("Rocketry in: a Launch Pad under way is bought on its own tile, and saved for", () => {
    const paris = world.cities[0];
    paris.queue = { type: "BUILDING_LAUNCH_PAD", turns: 10, pct: 50 };
    world.canBuy = (type, id) => (type === "BUILDING_LAUNCH_PAD" && id.id === 0
        ? (world.gold >= 700 ? { Success: true, InProgress: true, Plots: [idx(4, 3)], Cost: 700 } : { Success: false, InsufficientFunds: true, InProgress: true, Plots: [idx(4, 3)], Cost: 700 })
        : { Success: false });
    const bought = () => fake.sent.filter((x) => x.kind === "command" && x.op === CityCommandTypes.PURCHASE && x.args.ConstructibleType === C("BUILDING_LAUNCH_PAD")).map((x) => [x.id.id, x.args.X, x.args.Y]);
    try {
        world.gold = 5000;
        world.goldIncome = 0;
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 0, undefined, { pads: 1, commit: true });
        assert.deepEqual(bought(), [[0, 4, 3]]);
        // Short of gold: the savings goal holds for it.
        world.gold = 100;
        world.goldIncome = 50;
        steps.resetGoldPlan();
        const goal = steps.goldPlan({ ...DEFAULT_SETTINGS, strategy: { goals: ["PADS"], pads: 1, gate: { open: true, progress: 1 }, phase: "COMMIT" } }, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal;
        assert.deepEqual([goal?.kind, goal?.cost], ["PADS", 700]);
    } finally {
        steps.resetGoldPlan();
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
        for (const k of ["canBuy", "gold", "goldIncome"]) delete world[k];
    }
});

test("no building is bought in a city whose queue holds a wonder; the other cities' are (research/32 §6: four wonders left the queue the turn after a building was bought in their city)", () => {
    world.cities[0].queued = ["BUILDING_LAUNCH_PAD"];
    world.canBuy = (type, id) => (type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(id.id === 0 ? 4 : 11, 3)], Cost: 900 } : { Success: false });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => s.id.id);
    try {
        world.goldIncome = 0;
        world.gold = 5000;
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 0, undefined, { pads: 2, commit: true });
        assert.deepEqual(bought(), [0, 1], "Paris' queued pad, and Lyon's");
        world.cities[0].queued = ["WONDER_STATUE_OF_LIBERTY", "BUILDING_LAUNCH_PAD"];
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 0, undefined, { pads: 2, commit: true });
        assert.deepEqual(bought(), [1], "Lyon's only");
    } finally {
        delete world.cities[0].queued;
        for (const k of ["canBuy", "gold", "goldIncome"]) delete world[k];
    }
});

test("a path's building never passes a queued wonder, wherever it stands in the queue (research/32 §2; research/23 S1)", () => {
    const paris = world.cities[0];
    try {
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 3 };
        paris.queued = ["WONDER_EIFFEL_TOWER", "BUILDING_SCHOOLHOUSE"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(MOVE().filter(([id]) => id === 0), [], "the Schoolhouse stays behind the Eiffel Tower");
    } finally {
        delete paris.queued;
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
    }
});


// The victory work and its purchases took the game's best tile for today's yields, often one the building plan keeps for a
// quarter or a wonder's neighbours.
test("the victory work and its purchases take the building plan's tile; without one, the game's best of the tiles the plan leaves free", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const paris = world.cities[0];
    const sid = `c:${PARIS.x}-${PARIS.y}`;
    const tiles = [idx(4, 3), idx(2, 3), idx(3, 4)];
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === "BUILDING_LAUNCH_PAD" && id.id === 0 ? { Success: true, Plots: tiles, ExpandUrbanPlots: [] } : canBuild(type, id, args));
    world.canBuy = (type, id) => (type === "BUILDING_LAUNCH_PAD" && id.id === 0 ? { Success: true, Plots: tiles, Cost: 900 } : { Success: false });
    // The game rates (4,3) best for today's yields.
    world.placements = (c) => (c.name !== "Paris" ? null : {
        buildings: [{ constructibleType: C("BUILDING_LAUNCH_PAD"), placements: [[4, 3, 5], [2, 3, 1], [3, 4, 3]].map(([x, y, v]) => ({ plotID: idx(x, y), yieldChanges: [v] })) }],
    });
    const before = state.get().results.plans;
    const plan = (rows) => state.set({ results: { ...state.get().results, plans: { timeAware: true, placements: rows.map(([type, x, y]) => ({ sid, type, x, y, eta: 5 })), fillers: [], anchors: [] } } });
    const at = (kind) => fake.sent.filter((s) => s.kind === kind && s.id.id === 0 && s.args.ConstructibleType === C("BUILDING_LAUNCH_PAD")).map((s) => [s.args.X, s.args.Y]);
    try {
        plan([["BUILDING_LAUNCH_PAD", 2, 3], ["BUILDING_SCHOOLHOUSE", 4, 3]]);
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(at("operation"), [[2, 3]], "the plan's tile");
        world.gold = 5000;
        world.goldIncome = 0;
        paris.queued = ["BUILDING_LAUNCH_PAD"];
        fake.sent.length = 0;
        steps.buyVictoryWork("SCIENCE", 0, undefined, { commit: true });
        assert.deepEqual(at("command"), [[2, 3]], "bought on the plan's tile");
        delete paris.queued;
        // No tile planned for the pad: (4,3) is kept for the Schoolhouse, so the best of the others.
        plan([["BUILDING_SCHOOLHOUSE", 4, 3]]);
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(at("operation"), [[3, 4]]);
    } finally {
        state.set({ results: { ...state.get().results, plans: before } });
        world.canBuild = canBuild;
        delete paris.queued;
        for (const k of ["canBuy", "placements", "gold", "goldIncome"]) delete world[k];
    }
});

// The victory step queues the path's buildings only where they are built within 12 turns (leverSoon: game 16), but the
// plan's own queueing did not ask: a 40-turn Laboratory the victory step refused went in through the plan.
test("an empty queue takes no path's building from the plan or the advisor where it takes longer than the victory step allows", async () => {
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const lyon = world.cities[1];
    const sid = `c:${LYON.x}-${LYON.y}`;
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (id.id === 1 && (type === "BUILDING_LABORATORY" || type === "BUILDING_FACTORY") ? { Success: true, Plots: [idx(11, 4), idx(11, 2)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    world.costOf = (t) => (t === "BUILDING_LABORATORY" ? 400 : 100);
    const before = state.get().results.plans;
    state.set({ results: { ...state.get().results, plans: { timeAware: true, placements: [{ sid, type: "BUILDING_LABORATORY", x: 11, y: 4, eta: 40 }, { sid, type: "BUILDING_FACTORY", x: 11, y: 2, eta: 50 }], fillers: [] } } });
    const queued = () => builds().filter(([id]) => id === 1).map(([, t]) => t);
    try {
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { victory: "SCIENCE" });
        assert.deepEqual(queued(), [C("BUILDING_FACTORY")], "40 turns in Lyon: the Laboratory is left to the purchases");
        lyon.prod = 40;
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { victory: "SCIENCE" });
        assert.deepEqual(queued(), [C("BUILDING_LABORATORY"), C("BUILDING_FACTORY")], "10 turns: as the plan says");
    } finally {
        lyon.prod = 10;
        state.set({ results: { ...state.get().results, plans: before } });
        world.canBuild = canBuild;
        delete world.costOf;
    }
});

// With the score victory off the final age has no end on its clock (research/31 §1), and a rival's science countdown gave
// none either: production went on as if the game had no end (game 27: Xerxes's countdown ran M97-M102).
test("a rival's science countdown is the game's end: the outlook counts to it, and Preparation not done by then is not started", async () => {
    const { ageOutlook } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
    const vm = Game.VictoryManager;
    withPad(() => {
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 300 : 900); // 10 turns in Paris
        const preps = () => fake.sent.filter((s) => s.kind === "operation" && s.id.id === 0 && s.args.ProjectType === P("PROJECT_CREWED_SPACE_FLIGHT_PREP")).length;
        try {
            world.finalAge = true;
            world.agePoints = 100;
            Game.VictoryManager = { isScoreVictoryEnabled: () => false };
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.equal(preps(), 1, "no end: a 10-turn run");
            world.countdowns = { VICTORY_SCIENCE_MODERN: { 1: 3 } }; // 3 of its 5 turns gone
            const o = ageOutlook();
            assert.deepEqual([o.turnsLeft, o.endless, o.rivalWin?.player], [2, false, 1]);
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.equal(preps(), 0, "the game ends in 2 turns");
        } finally {
            Game.VictoryManager = vm;
            for (const k of ["costOf", "finalAge", "agePoints", "countdowns"]) delete world[k];
        }
    });
});

// Production first for a city's space work: its Ironworks +10 production for 267 (the game's placement numbers).
const withIronworks = (fn) => {
    const PROD = GameInfo.Yields.lookup("YIELD_PRODUCTION").$index;
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === "BUILDING_IRONWORKS" && id.id === 0 ? { Success: true, Plots: [idx(5, 3)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    world.placements = (c) => {
        if (c.name !== "Paris") return null;
        const y = [];
        y[PROD] = 10;
        return { buildings: [{ constructibleType: C("BUILDING_IRONWORKS"), placements: [{ plotID: idx(5, 3), yieldChanges: y }] }] };
    };
    try {
        steps.resetProductionFirst();
        fn();
    } finally {
        steps.resetProductionFirst();
        world.canBuild = canBuild;
        delete world.placements;
    }
};

// Upgrades were weighed only once a science site was queued: a 40-turn Launch Pad started first, its Ironworks was queued
// the next turn and stayed behind the pad's progress for 40 turns.
test("production first is weighed before a city's first science site is ordered: its buildings go in ahead of the site", () => {
    const paris = world.cities[0];
    withIronworks(() => {
        world.costOf = (t) => ({ BUILDING_LAUNCH_PAD: 1200, BUILDING_IRONWORKS: 267 })[t] ?? 1000; // a 40-turn pad
        try {
            delete paris.queue; // nothing in production: the pad would start this turn
            paris.queued = [];
            fake.sent.length = 0;
            const out = steps.pushVictoryWork("SCIENCE");
            const buildings = builds().filter(([id, t]) => id === 0 && (t === C("BUILDING_IRONWORKS") || t === C("BUILDING_LAUNCH_PAD"))).map(([, t]) => t);
            assert.deepEqual(buildings, [C("BUILDING_IRONWORKS"), C("BUILDING_LAUNCH_PAD")], JSON.stringify(out));
            assert.ok(out.some((e) => e.key === "PRODUCTION_FIRST"));
        } finally {
            delete world.costOf;
            delete paris.queued;
            paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
        }
    });
});

// The payback assumed 2000 production of projects whatever was left: near the goal an Ironworks made the last run later.
test("production first weighs the projects still needed to win: one run under way at 95 Innovation buys no upgrade, at 0 it does", () => {
    withPad(() => withIronworks(() => {
        const paris = world.cities[0];
        world.costOf = (t) => ({ BUILDING_IRONWORKS: 267 })[t] ?? 1000;
        paris.queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 10, pct: 70 }; // 300 left, 10 turns
        try {
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 95 } };
            fake.sent.length = 0;
            assert.ok(!steps.pushVictoryWork("SCIENCE").some((e) => e.key === "PRODUCTION_FIRST"), "300 left to win: 267 for +10 makes it later");
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 0 } };
            steps.resetProductionFirst();
            fake.sent.length = 0;
            const out = steps.pushVictoryWork("SCIENCE");
            assert.deepEqual(out.find((e) => e.key === "PRODUCTION_FIRST")?.args.slice(2), [10, 2300], "the run under way and two more before the age ends");
        } finally {
            delete world.costOf;
            delete world.victoryPoints;
        }
    }));
});

// Preparation always went first in a Launch Pad's city, and no one-off ran there: at 95 Innovation a 20-turn run was
// chosen over a 10-turn Launch Satellite that would also reach 100.
test("near the goal a one-off that closes the gap sooner goes ahead of Preparation in a Launch Pad's city, and stays there", () => {
    withPad(() => {
        const paris = world.cities[0];
        world.costOf = (t) => ({ PROJECT_CREWED_SPACE_FLIGHT_PREP: 600, PROJECT_LAUNCH_SATELLITE: 300 })[t] ?? 1000; // 20 and 10 turns
        world.research = late();
        const projects = () => builds().filter(([id, t]) => id === 0 && (t === P("PROJECT_LAUNCH_SATELLITE") || t === P("PROJECT_CREWED_SPACE_FLIGHT_PREP"))).map(([, t]) => t);
        try {
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 95 } };
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.deepEqual(projects(), [P("PROJECT_LAUNCH_SATELLITE"), P("PROJECT_CREWED_SPACE_FLIGHT_PREP")], "the satellite first");
            // Both queued, Preparation ahead: the satellite moves ahead of it and stays.
            paris.queue = { type: "BUILDING_CANNERY", turns: 3 };
            paris.queued = ["PROJECT_CREWED_SPACE_FLIGHT_PREP", "PROJECT_LAUNCH_SATELLITE"];
            const moves = passes(4, paris, 0);
            assert.deepEqual([paris.queue.type, ...paris.queued].slice(0, 2), ["PROJECT_LAUNCH_SATELLITE", "PROJECT_CREWED_SPACE_FLIGHT_PREP"], JSON.stringify(moves));
            assert.deepEqual(moves.slice(2), [0, 0], "settled");
            // 20 to go: Preparation first (both orders reach it at 30 turns; Preparation gives more for the production).
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 80 } };
            paris.queue = { type: "BUILDING_CANNERY", turns: 3 };
            paris.queued = [];
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE");
            assert.deepEqual(projects(), [P("PROJECT_CREWED_SPACE_FLIGHT_PREP")]);
        } finally {
            for (const k of ["costOf", "victoryPoints", "research"]) delete world[k];
        }
    });
});

// Research/34 §2, §4: game 28's Kalhu stayed below zero Happiness all Modern (−33 at worst, its yields 80% gone) while it
// built for its space work; an Ironworks there adds a fifth of its production, and Happiness wins production back.
test("production first in an unhappy city: new production counts at what the city keeps, and a Happiness building wins production back", () => {
    const PROD = GameInfo.Yields.lookup("YIELD_PRODUCTION").$index;
    const HAPPY = GameInfo.Yields.lookup("YIELD_HAPPINESS").$index;
    const change = (i, v) => {
        const y = [];
        y[i] = v;
        return y;
    };
    const paris = world.cities[0];
    const canBuild = world.canBuild;
    const BUILT = ["BUILDING_IRONWORKS", "BUILDING_GROCER"];
    world.canBuild = (type, id, args) => (BUILT.includes(type) && id.id === 0 ? { Success: true, Plots: [idx(5, 3)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    world.costOf = (t) => ({ BUILDING_LAUNCH_PAD: 900, BUILDING_IRONWORKS: 267, BUILDING_GROCER: 267 })[t] ?? 1000;
    world.placements = (c) => (c.name !== "Paris" ? null : {
        buildings: [
            { constructibleType: C("BUILDING_IRONWORKS"), placements: [{ plotID: idx(5, 3), yieldChanges: change(PROD, 10) }] },
            { constructibleType: C("BUILDING_GROCER"), placements: [{ plotID: idx(5, 3), yieldChanges: change(HAPPY, 8) }] },
        ],
    });
    const queued = () => builds().filter(([id, t]) => id === 0 && BUILT.some((b) => C(b) === t)).map(([, t]) => t);
    try {
        paris.queued = ["BUILDING_LAUNCH_PAD"];
        paris.happy = 10;
        steps.resetProductionFirst();
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(queued(), [C("BUILDING_IRONWORKS")], "calm: the Ironworks; Happiness wins nothing back");
        paris.happy = -25;
        steps.resetProductionFirst();
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(queued(), [C("BUILDING_GROCER")], "at −25: the Ironworks keeps a fifth of its 10; the Grocer's 8 Happiness win production back");
    } finally {
        steps.resetProductionFirst();
        world.canBuild = canBuild;
        delete paris.queued;
        delete paris.happy;
        for (const k of ["costOf", "placements"]) delete world[k];
    }
});

// Research/34 §5: game 28's fifth Launch Pad (M83) ran no Preparation before the victory at M93, and Kalhu's Airfield
// came at M89 with its first flight unfinished. A site beyond the victory's own pad only where it brings the goal sooner.
test("one more Launch Pad only where it brings the science victory's Innovation sooner", () => {
    withPad(() => {
        const nice = { owner: 0, x: 3, y: 9, name: "Nice", prod: 20 };
        world.cities.push(nice);
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 600 : t === "BUILDING_LAUNCH_PAD" ? 900 : undefined);
        world.turnsFor = (c) => (c.name === "Nice" ? 9 : -1); // done within 10 turns: wanted by the old rule
        const pads = () => builds().filter(([id, t]) => id === 2 && t === C("BUILDING_LAUNCH_PAD")).length;
        try {
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 85 } }; // 15 to go: Paris's next run (20 turns) makes it
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE", { pads: 2 });
            assert.equal(pads(), 0, "Nice's pad (45 turns) and its run would come after the goal");
            world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 0 } }; // 100 to go: two cities running Preparation win sooner
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE", { pads: 2 });
            assert.equal(pads(), 1);
        } finally {
            world.cities.splice(world.cities.indexOf(nice), 1);
            for (const k of ["costOf", "turnsFor", "victoryPoints"]) delete world[k];
        }
    });
});

// Research/38 §3.4: the race counted only projects (game 30's M35 forecast 44 turns; 26 came) and approved Launch Pads in weak
// cities that never ran a Preparation. Research's Innovation counts too: Rocketry, the masteries, Future Tech.
test("the race counts the Innovation research brings: a pad that helped on projects alone does not once the masteries count", () => {
    withPad(() => {
        const nice = { owner: 0, x: 3, y: 9, name: "Nice", prod: 20 };
        world.cities.push(nice);
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 600 : t === "BUILDING_LAUNCH_PAD" ? 900 : undefined);
        world.turnsFor = (c) => (c.name === "Nice" ? 9 : -1);
        // 60 to go: Paris's runs every 20 turns; Nice's pad (45 turns) and its run (30) at 75.
        world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 40 } };
        const pads = () => builds().filter(([id, t]) => id === 2 && t === C("BUILDING_LAUNCH_PAD")).length;
        try {
            world.research = late(); // nothing more from research: Paris alone at 80, with Nice 75
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE", { pads: 2 });
            assert.equal(pads(), 1, "Nice's pad brings the goal sooner");
            // The masteries still to research (5 turns a node, each mastery's tech too): Aerodynamics 5 at 10, then 2 every
            // 10 turns: 15 by turn 60, when Paris's third run makes 60.
            world.research = { depth: { NODE_TECH_MO_ROCKETRY: 1 }, turns: { NODE_TECH_MO_FUTURE_TECH: 400 } };
            fake.sent.length = 0;
            steps.pushVictoryWork("SCIENCE", { pads: 2 });
            assert.equal(pads(), 0, "the goal comes at turn 60 either way");
        } finally {
            world.cities.splice(world.cities.indexOf(nice), 1);
            for (const k of ["costOf", "turnsFor", "victoryPoints", "research"]) delete world[k];
        }
    });
});

// The audit of game 28 found the race counting a site in production twice: once as the item ahead of the projects, once
// as the site still to be built.
test("the race counts a Launch Pad in production once: the production-first work is its rest and the runs after it", () => {
    withIronworks(() => {
        const paris = world.cities[0];
        world.costOf = (t) => ({ BUILDING_LAUNCH_PAD: 900, BUILDING_IRONWORKS: 267, PROJECT_CREWED_SPACE_FLIGHT_PREP: 1000 })[t] ?? 1000;
        paris.queue = { type: "BUILDING_LAUNCH_PAD", turns: 15, pct: 50 }; // 450 left: 15 turns
        try {
            fake.sent.length = 0;
            const e = steps.pushVictoryWork("SCIENCE").find((x) => x.key === "PRODUCTION_FIRST");
            // 15 turns, then runs at 48 and 82 within the age's 95: 450 + 2 × 1000 (counted twice, 30 turns: one run).
            assert.equal(e?.args[3], 2450);
        } finally {
            delete world.costOf;
            paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
        }
    });
});

// Research/34 §6: game 28's capital trained Tanks for two new settlements (Sirjan, Ardebil) while its Launch Pad, ordered at
// M51, waited until M73. A defender comes from a city without space work when one within reach can train it.
// Research/38 §3.8: game 29's Preparation at 510 of 1,000 lost the front to two Tanks and two walls (M53-M64), and the run
// came eleven turns late.
test("a Crewed Space Flight Preparation run within 3 turns of done keeps the front from a defender and walls, unless the centre is damaged", () => {
    const paris = world.cities[0];
    const centre = idx(PARIS.x, PARIS.y);
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === "BUILDING_DEFENSIVE_FORTIFICATIONS" ? { Success: true, Plots: [centre], ExpandUrbanPlots: [] }
        : typeof type === "string" && type.startsWith("UNIT_") ? { Success: true } : canBuild(type, id, args));
    world.canBuy = () => ({ Success: false });
    world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 1000 : undefined);
    const threats = (extra = {}) => [{ settlement: { name: "Paris", x: PARIS.x, y: PARIS.y }, count: 2, land: 2, owners: [{ id: 5, independent: true }], ...extra }];
    const moves = () => MOVE().filter(([id]) => id === 0);
    try {
        steps.resetWar();
        paris.queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 2, pct: 90 };
        paris.queued = ["UNIT_LINE_INFANTRY"];
        fake.sent.length = 0;
        steps.frontLoadUnits({ defend: true, threats: threats() });
        assert.deepEqual(moves(), [], "2 turns left: the defender waits");
        fake.sent.length = 0;
        steps.frontLoadUnits({ defend: true, threats: threats({ damaged: true }) });
        assert.deepEqual(moves(), [[0, 1, 0]], "the centre is damaged");
        paris.queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 10, pct: 30 };
        fake.sent.length = 0;
        steps.frontLoadUnits({ defend: true, threats: threats() });
        assert.deepEqual(moves(), [[0, 1, 0]], "10 turns left: the defender first");
        // The walls the same (wallsSlot).
        paris.queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 2, pct: 90 };
        paris.queued = ["BUILDING_DEFENSIVE_FORTIFICATIONS"];
        fake.sent.length = 0;
        steps.fortifyThreatened(threats());
        assert.deepEqual(moves(), [], "the walls wait 2 turns");
        fake.sent.length = 0;
        steps.fortifyThreatened(threats({ damaged: true }));
        assert.deepEqual(moves(), [[0, 1, 0]]);
    } finally {
        steps.resetWar();
        world.canBuild = canBuild;
        for (const k of ["canBuy", "costOf"]) delete world[k];
        delete paris.queued;
        paris.queue = { type: "BUILDING_RAIL_STATION", turns: 4 };
    }
});

// Game 32, E64: Liverpool's damaged University was repaired with gold, the same pass ordered it again (the game offers a damaged
// building as its repair), the game refused, and the empty queue held the turn.
test("the victory step never orders a building the city has: a damaged one is the repairs' to buy or queue", () => {
    const structures = world.structures;
    const canBuild = world.canBuild;
    world.structures = (x, y) => (x === 2 && y === 3 ? { district: null, constructibles: ["BUILDING_SCHOOLHOUSE"] } : { district: null, constructibles: [] });
    world.canBuild = (type, id, args) => (type === "BUILDING_SCHOOLHOUSE" && id.id === 0 ? { Success: true, RepairDamaged: true, Plots: [idx(2, 3)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    try {
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.ok(!builds().some(([id, t]) => id === 0 && t === C("BUILDING_SCHOOLHOUSE")), JSON.stringify(builds()));
    } finally {
        world.structures = structures;
        world.canBuild = canBuild;
    }
});

test("a defender for a threatened settlement comes from a city without space work when one within reach can train it", () => {
    const paris = world.cities[0];
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (typeof type === "string" && type.startsWith("UNIT_") ? { Success: true } : canBuild(type, id, args));
    world.costOf = (t) => (t.startsWith("UNIT_") ? 50 : undefined);
    const threats = [{ settlement: { name: "Sirjan", x: 6, y: 3 }, count: 2, land: 2, owners: [{ id: 5, independent: true }] }];
    const trainer = (out) => out.filter((e) => e.key === "QUEUED_DEFENDER").map((e) => e.args[0]);
    try {
        paris.queued = ["BUILDING_LAUNCH_PAD"];
        assert.deepEqual(trainer(steps.fillProduction(new Map(), { threats, defend: true })), ["Lyon"], "though Paris is nearer");
        paris.queued = [];
        assert.deepEqual(trainer(steps.fillProduction(new Map(), { threats, defend: true })), ["Paris"], "no space work in Paris: the nearest");
    } finally {
        world.canBuild = canBuild;
        delete world.costOf;
        delete paris.queued;
    }
});
