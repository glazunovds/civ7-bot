// Autopilot: one pass makes this turn's decisions with the game's own commands (research,
// production from the plan or the advisor, growth, town Focus, purchases), skips idle units,
// ends the turn when asked, and never moves units. Off: it does nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };    // a city with an empty queue, a plan, a new citizen waiting
const B = { x: 18, y: 8 };   // a city where the plan's tiles are refused: the advisor decides
const T = { x: 13, y: 13 };  // a Growing town at population 8, connected to Athens
const owned = (x, y) => [A, B].some((c) => Math.abs(x - c.x) <= 2 && Math.abs(y - c.y) <= 2);
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: owned(x, y) ? 0 : -1 }),
    structures: (x, y) => {
        if ([A, B].some((c) => c.x === x && c.y === y)) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] };
        if (Math.abs(x - T.x) <= 1 && Math.abs(y - T.y) <= 1 && !(x === T.x && y === T.y)) return { district: "DISTRICT_RURAL", constructibles: ["IMPROVEMENT_FARM"] };
        return { district: null, constructibles: [] };
    },
    focusProjects: () => ["PROJECT_TOWN_GRANARY"],
    players: [{ id: 0 }, { id: 5 }], // 5: a rival major (the victory watch)
    cities: [
        { owner: 0, x: A.x, y: A.y, name: "Athens", pop: 8, prod: 12, food: 20, happy: 20, readyToGrow: true },
        { owner: 0, x: B.x, y: B.y, name: "Sparta", pop: 6, prod: 10 },
        { owner: 0, x: T.x, y: T.y, name: "Pella", isTown: true, pop: 8, prod: 4, connected: [0] },
    ],
    gold: 900,
    goldIncome: 100,
    canBuild: (_type, id, args) => ({ Success: !(id.id === 1 && args.X !== undefined), Plots: [], ExpandUrbanPlots: [] }),
    canBuy: (type, _id, args) => ({ Success: args.X !== undefined, Cost: 300 }),
    expand: () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(A.x + 3, A.y)], ConstructibleTypes: [] }),
    research: { tech: { available: [9011, 9012] }, culture: { available: [9021], active: 9021 } },
    treeRecs: (subject) => (subject === AdvisorySubjectTypes.CHOOSE_TECH ? [{ recommendedType: 9012, whichAdvisors: [AdvisorTypes.SCIENCE] }] : []),
    buildRecs: () => [{ subject: 7, recommendedType: "PROJECT_CITY_SCIENCE_PROJECT", whichAdvisors: [AdvisorTypes.SCIENCE] }],
    readyUnits: [{ owner: 0, id: 1 }, { owner: 0, id: 2 }],
};
const fake = installFakeEngine(world);
// The advisor's subject table (not in the fixture): 7 = produce projects.
GameInfo.AdvisorySubjects = { lookup: (h) => (h === 7 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_PROJECTS" } : null) };
const { allTarget, listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");

const selected = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET"];
settings.patch({ buildings: { timeAware: true }, autopilot: { replanEvery: 0, reserveTurns: 2 } });
await startBuildingPlan(allTarget(listTargets()), { ...settings.get(), buildings: { ...settings.get().buildings, selected } }).promise;
const sent = (kind) => fake.sent.filter((s) => s.kind === kind);
const keys = () => (state.get().autopilot.log ?? []).map((e) => e.key);

test("off: a turn start does nothing", async () => {
    engine.trigger("PlayerTurnActivated", { player: 0 });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fake.sent.length, 0);
    await autopilot.runTurn();
    assert.equal(fake.sent.length, 0);
});

test("one pass: research, production (plan, then advisor), growth, town Focus, purchases", async () => {
    await autopilot.runTurn(true);
    const players = sent("player");
    assert.ok(players.some((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE && s.args.ProgressionTreeNodeType === 9012), "the advisor's technology");
    assert.ok(!players.some((s) => s.op === PlayerOperationTypes.SET_CULTURE_TREE_NODE), "a civic is already being studied");
    const builds = sent("operation");
    assert.ok(builds.some((s) => s.id.id === 0 && s.args.X !== undefined), "Athens queues planned buildings on their tiles");
    assert.ok(builds.some((s) => s.id.id === 1 && s.args.ProjectType === GameInfo.Projects.lookup("PROJECT_CITY_SCIENCE_PROJECT").$hash), "Sparta gets the advisor's project");
    const commands = sent("command");
    assert.ok(commands.some((s) => s.op === CityCommandTypes.EXPAND && s.args.X === A.x + 3), "the new citizen takes the offered tile");
    assert.ok(commands.some((s) => s.op === CityCommandTypes.CHANGE_GROWTH_MODE && s.id.id === 2), "Pella takes a Focus");
    const buys = commands.filter((s) => s.op === CityCommandTypes.PURCHASE);
    assert.equal(buys.length, 2, "900 gold, 200 kept (2 turns of income), 300 each");
    assert.equal(sent("unit").length, 0, "units are left alone unless asked");
    assert.equal(sent("endTurn").length, 0, "'do it now' never ends the turn");
    for (const k of ["TECH", "QUEUED_PLAN", "QUEUED_ADVISOR", "GROWTH_TILE", "FOCUS", "BOUGHT"]) assert.ok(keys().includes(k), k);
});

test("on: the turn start runs it; idle units skip; the turn ends", async () => {
    settings.patch({ autopilot: { skipUnits: true, endTurn: true, purchases: false } });
    autopilot.setAutopilot(true);
    assert.ok(autopilot.isAutopilotOn());
    await new Promise((r) => setTimeout(r, 2500)); // switched on: it acts at once
    assert.equal(sent("unit").length, 2);
    assert.equal(sent("endTurn").length, 1);
    assert.ok(keys().includes("UNITS_SKIPPED") && keys().includes("TURN_ENDED"));
    autopilot.setAutopilot(false);
    assert.ok(!autopilot.isAutopilotOn());
});

test("a choice still holds the turn: the turn is not ended, the log says why", async () => {
    settings.patch({ autopilot: { skipUnits: false, endTurn: true, purchases: false } });
    world.turnSent = false;
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_BELIEF" };
    const ends = sent("endTurn").length;
    autopilot.setAutopilot(true);
    await new Promise((r) => setTimeout(r, 6000)); // the pass, then up to two more tries
    autopilot.setAutopilot(false);
    delete world.blocker;
    assert.equal(sent("endTurn").length, ends);
    const blocked = state.get().autopilot.log.find((e) => e.key === "BLOCKED");
    assert.deepEqual(blocked?.args, ["NOTIFICATION_CHOOSE_BELIEF"]);
});

// Game 32, E64: the victory step's order in Liverpool was refused (a building already repaired with gold), and every end-of-turn
// retry skipped Liverpool's empty queue as "queued by the victory step this pass": «Выбрать производство» held the turn.
test("an end-of-turn retry fills a queue the victory step's refused order left empty", async () => {
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", skipUnits: false, endTurn: true, purchases: false, replanEvery: 0 } });
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 500 }];
    Players.get(0).LegacyPaths = { getScore: () => 20 };
    const hashOf = (t) => GameInfo.Constructibles.lookup(t)?.$hash ?? GameInfo.Projects.lookup(t)?.$hash ?? GameInfo.Units.lookup(t)?.$hash;
    const athensBuilds = () => sent("operation").filter((x) => x.id.id === 0 && x.args.InsertMode === undefined).map((x) => x.args.ConstructibleType ?? x.args.ProjectType ?? x.args.UnitType);
    const canBuild = world.canBuild;
    // Athens's queue is empty. The game takes an order once; asked again it refuses (the queue the fake keeps never shows
    // it), as it refused Liverpool's: the queue stays empty.
    world.canBuild = (type, id, args) => (id.id === 0 && type !== undefined && athensBuilds().includes(hashOf(type)) ? { Success: false, Plots: [] } : canBuild(type, id, args));
    world.turnSent = false;
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_CITY_PRODUCTION" };
    const filled = () => (state.get().autopilot.log ?? []).filter((e) => /^QUEUED_(PLAN|ADVISOR|FALLBACK)$/.test(e.key) && e.args?.[0] === "Athens");
    try {
        fake.sent.length = 0;
        state.set({ autopilot: { ...(state.get().autopilot ?? {}), log: [] } });
        autopilot.setAutopilot(true);
        await new Promise((r) => setTimeout(r, 6000)); // the pass, then up to two more tries
        autopilot.setAutopilot(false);
        assert.ok((state.get().autopilot.log ?? []).some((e) => e.key === "VICTORY_WORK" && e.args?.[0] === "Athens"), "the victory step ordered in Athens first");
        assert.ok(filled().length > 0, `a retry fills Athens's queue: ${JSON.stringify((state.get().autopilot.log ?? []).map((e) => e.key))}`);
    } finally {
        delete world.blocker;
        world.canBuild = canBuild;
        delete Players.get(0).LegacyPaths;
        settings.patch({ autopilot: { focus: false, victory: "AUTO", endTurn: false } });
    }
});

test("victory focus: the path we lead sets this pass's priority (research follows its advisor); off, the player's own priority again", async () => {
    settings.patch({ autopilot: { focus: true, replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    GameInfo.LegacyPaths = [
        { LegacyPathType: "LP_CULTURE", LegacyPathClassType: "LEGACY_PATH_CLASS_CULTURE", EnabledByDefault: true },
        { LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true },
    ];
    GameInfo.AgeProgressionMilestones = [
        { LegacyPathType: "LP_CULTURE", FinalMilestone: true, RequiredPathPoints: 7 },
        { LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 10 },
    ];
    Players.get(0).LegacyPaths = { getScore: (t) => (t === "LP_SCIENCE" ? 8 : 1) };
    const recs = world.treeRecs;
    world.treeRecs = (subject) => (subject === AdvisorySubjectTypes.CHOOSE_TECH ? [{ recommendedType: 9011, whichAdvisors: [AdvisorTypes.CULTURE] }, { recommendedType: 9012, whichAdvisors: [AdvisorTypes.SCIENCE] }] : []);
    const tech = () => sent("player").filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => s.args.ProgressionTreeNodeType);
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.focus?.cls, "SCIENCE");
        assert.ok(keys().includes("VICTORY_FOCUS"));
        assert.deepEqual(tech(), [9012], "the science advisor's technology");
        // The player's target: culture, though science leads.
        settings.patch({ autopilot: { victory: "CULTURE" } });
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.focus?.cls, "CULTURE");
        assert.deepEqual(tech(), [9011], "the culture advisor's technology");
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.focus, null);
        assert.deepEqual(tech(), [9011], "the player's own priority (Balance): the advisor's first");
    } finally {
        world.treeRecs = recs;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
        delete Players.get(0).LegacyPaths;
    }
});

test("the pass follows the strategy (the final age: 1 turn of income kept) while the saved settings stay the user's", async () => {
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", strategy: true, replanEvery: 0, skipUnits: false, endTurn: false, purchases: true, reserveTurns: 2 } });
    GameInfo.LegacyPaths = [
        { LegacyPathType: "LP_CULTURE", LegacyPathClassType: "LEGACY_PATH_CLASS_CULTURE", EnabledByDefault: true },
        { LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true },
    ];
    GameInfo.AgeProgressionMilestones = [
        { LegacyPathType: "LP_CULTURE", FinalMilestone: true, RequiredPathPoints: 7 },
        { LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 10 },
    ];
    Players.get(0).LegacyPaths = { getScore: (t) => (t === "LP_SCIENCE" ? 8 : 1) };
    world.finalAge = true;
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.strategy?.phase, "COMMIT", JSON.stringify(keys()));
        assert.equal(state.get().autopilot.focus?.innovation?.target, 25, "science: Innovation against the age's target (the fake is in Antiquity)");
        assert.equal(state.get().autopilot.gold?.reserve, 100, "1 turn of the 100 income");
        assert.equal(settings.get().autopilot.reserveTurns, 2, "the saved settings stay the user's");
        assert.ok(keys().includes("PHASE"));
        settings.patch({ autopilot: { strategy: false } });
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.gold?.reserve, 200, "«Стратегия по фазам» off: the user's 2 turns");
        assert.equal(state.get().autopilot.strategy, null);
    } finally {
        delete world.finalAge;
        settings.patch({ autopilot: { focus: false, victory: "AUTO", strategy: true, purchases: false } });
        delete Players.get(0).LegacyPaths;
    }
});

test("a rival near a win is logged once per rival and class (RIVAL_NEAR_WIN), its countdown once (RIVAL_COUNTDOWN)", async () => {
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    Players.get(0).LegacyPaths = { getScore: (t) => (t === "LP_SCIENCE" ? 8 : 1) };
    const vm = Game.VictoryManager;
    world.victoryPoints = { VICTORY_CULTURE_MODERN: { 0: 300, 5: 1400, 1: 388 } };
    Game.VictoryManager = { isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: (h) => (h === GameInfo.VictoryTypes.lookup("VICTORY_CULTURE_MODERN").$hash ? 1552 : -1) };
    const count = (k) => (state.get().autopilot.log ?? []).filter((e) => e.key === k).length;
    try {
        state.set({ autopilot: { ...state.get().autopilot, log: [] } });
        await autopilot.runTurn(true);
        await autopilot.runTurn(true);
        assert.equal(count("RIVAL_NEAR_WIN"), 1, JSON.stringify(keys()));
        assert.ok((state.get().autopilot.focus?.watch ?? []).some((w) => w.cls === "CULTURE" && w.level === "DANGER"));
        world.countdowns = { VICTORY_CULTURE_MODERN: { 5: 2 } };
        await autopilot.runTurn(true);
        await autopilot.runTurn(true);
        assert.equal(count("RIVAL_COUNTDOWN"), 1);
    } finally {
        Game.VictoryManager = vm;
        delete world.victoryPoints;
        delete world.countdowns;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
        delete Players.get(0).LegacyPaths;
    }
});

test("victory focus on science: the pass puts science projects first", async () => {
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 10 }];
    Players.get(0).LegacyPaths = { getScore: () => 2 };
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.ok(keys().includes("VICTORY_WORK"), JSON.stringify(keys()));
        assert.ok(fake.sent.some((s) => s.args?.ProjectType === GameInfo.Projects.lookup("PROJECT_CHART_THE_STARS").$hash));
        // With «Поселенцы» below the settlement cap (Antiquity): projects are not held for expansion
        // (research/21 D4; settlers go ahead of them anyway).
        settings.patch({ autopilot: { settlers: true, tacks: false } });
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.ok(fake.sent.some((s) => s.args?.ProjectType === GameInfo.Projects.lookup("PROJECT_CHART_THE_STARS").$hash), JSON.stringify(keys()));
    } finally {
        settings.patch({ autopilot: { focus: false, victory: "AUTO", settlers: false } });
        delete Players.get(0).LegacyPaths;
    }
});

test("victory focus on economy: research, growth and merchants follow the path", async () => {
    settings.patch({ autopilot: { focus: true, victory: "ECONOMIC", merchants: true, replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_ECONOMIC", LegacyPathClassType: "LEGACY_PATH_CLASS_ECONOMIC", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_ECONOMIC", FinalMilestone: true, RequiredPathPoints: 20 }];
    Players.get(0).LegacyPaths = { getScore: () => 2 };
    const currency = GameInfo.ProgressionTreeNodes.lookup("NODE_TECH_AQ_CURRENCY").$hash;
    const PLAIN = { x: A.x + 3, y: A.y }, SALT = { x: A.x + 3, y: A.y + 1 };
    const { tiles, expand, research } = world;
    world.research = { ...research, tech: { available: [9011, 9012, currency] } };
    world.tiles = (x, y) => (x === SALT.x && y === SALT.y ? { ...tiles(x, y), resource: "RESOURCE_SALT", yields: { YIELD_FOOD: 1, YIELD_PRODUCTION: 1 } } : tiles(x, y));
    world.expand = () => ({ Success: true, Plots: [PLAIN, SALT].map((p) => GameplayMap.getIndexFromXY(p.x, p.y)), ConstructibleTypes: [] });
    world.cities[0].readyToGrow = true;
    world.tradeRoutes = [{ targetCityId: { owner: 0, id: 1 }, status: [TradeRouteStatus.SUCCESS], importPayloads: [{}], exportYields: [] }];
    const merchant = GameInfo.Units.lookup("UNIT_MERCHANT").$hash;
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.focus?.cls, "ECONOMIC");
        assert.deepEqual(sent("player").filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => s.args.ProgressionTreeNodeType), [currency], "Currency: the Market");
        const grew = sent("command").find((s) => s.op === CityCommandTypes.EXPAND);
        assert.deepEqual([grew?.args.X, grew?.args.Y], [SALT.x, SALT.y], "the resource tile");
        assert.ok(fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === merchant), JSON.stringify(keys()));
        assert.equal(state.get().autopilot.focus.profile, "GOLD_SCIENCE", "Currency (the Market) still to research: science kept up");
    } finally {
        Object.assign(world, { tiles, expand, research });
        delete world.tradeRoutes;
        world.cities[0].readyToGrow = false;
        settings.patch({ autopilot: { focus: false, victory: "AUTO", merchants: false } });
        delete Players.get(0).LegacyPaths;
    }
});

test("victory focus: a game saying every victory is off is not believed (the focus stays)", async () => {
    settings.patch({ autopilot: { focus: true, victory: "ECONOMIC", replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_ECONOMIC", LegacyPathClassType: "LEGACY_PATH_CLASS_ECONOMIC", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_ECONOMIC", FinalMilestone: true, RequiredPathPoints: 20 }];
    Players.get(0).LegacyPaths = { getScore: () => 2 };
    const vm = Game.VictoryManager;
    Game.VictoryManager = { isCountdownVictoryEnabled: () => false };
    try {
        // A fresh start (as after a load): no focus yet.
        settings.patch({ autopilot: { focus: false } });
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.focus, null);
        settings.patch({ autopilot: { focus: true } });
        await autopilot.runTurn(true);
        assert.equal(state.get().autopilot.focus?.cls, "ECONOMIC");
    } finally {
        Game.VictoryManager = vm;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
        delete Players.get(0).LegacyPaths;
    }
});

test("victory focus: the victories themselves and those switched off are kept for the tab; our countdown starting is logged once", async () => {
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 3 }];
    Players.get(0).LegacyPaths = { getScore: () => 3 };
    const vm = Game.VictoryManager;
    // Domination is not a countdown race: the game says it is off in every game (seen in game).
    Game.VictoryManager = { isCountdownVictoryEnabled: (t) => t !== "VICTORY_CULTURE_MODERN" && t !== "VICTORY_DOMINATION" };
    world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 100 } };
    const countdowns = () => (state.get().autopilot.log ?? []).filter((e) => e.key === "VICTORY_COUNTDOWN");
    try {
        await autopilot.runTurn(true);
        const f = state.get().autopilot.focus;
        assert.deepEqual(f.off, ["CULTURE"]);
        assert.deepEqual(f.races.find((r) => r.cls === "SCIENCE"), { cls: "SCIENCE", points: 100, goal: 100, rival: 0, turnsLeft: null });
        assert.ok(!f.races.some((r) => r.cls === "CULTURE"), "a victory switched off is not shown");
        assert.equal(countdowns().length, 0);
        world.countdown = { VICTORY_SCIENCE_MODERN: 1 };
        await autopilot.runTurn(true);
        assert.equal(countdowns().length, 1);
        assert.equal(countdowns()[0].args[1], 4, "4 of 5 turns left");
        await autopilot.runTurn(true);
        assert.equal(countdowns().length, 1, "logged once");
    } finally {
        Game.VictoryManager = vm;
        delete world.victoryPoints;
        delete world.countdown;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
        delete Players.get(0).LegacyPaths;
    }
});

// Games 42-43: legacy paths read 0 in every age (their milestones count nothing in this game version), so the focus comes from
// the victories' own points; within an age the lead went back and forth, so only a new age's first turns re-decide it.
test("victory focus: from the victories' own points; a new age's first turns re-decide it, later in the age it stays", async () => {
    settings.patch({ autopilot: { focus: true, victory: "AUTO", replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    const vm = Game.VictoryManager;
    Game.VictoryManager = { isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => -1 };
    const points = (culture, economic) => ({
        VICTORY_CULTURE_MODERN: { 0: culture[0], 5: culture[1] },
        VICTORY_ECONOMIC_MODERN: { 0: economic[0], 5: economic[1] },
        VICTORY_SCIENCE_MODERN: { 0: 1, 5: 4 },
    });
    const focus = () => state.get().autopilot.focus?.cls;
    world.met = [5]; // the best rival is one we have met
    try {
        state.set({ autopilot: { ...state.get().autopilot, focus: null } });
        world.agePoints = 5;
        world.victoryPoints = points([30, 5], [50, 300]);
        for (let i = 0; i < 4; i++) await autopilot.runTurn(true); // an earlier focus is kept in the game's memory: a switch
        assert.equal(focus(), "CULTURE", "far ahead in culture, behind in the economy");
        // The economy far ahead in the middle of the age: the focus stays.
        world.agePoints = 50;
        world.victoryPoints = points([30, 25], [900, 100]);
        for (let i = 0; i < 4; i++) await autopilot.runTurn(true);
        assert.equal(focus(), "CULTURE", "past the age's first turns");
        // A new age's first turns: it changes.
        world.agePoints = 5;
        for (let i = 0; i < 4; i++) await autopilot.runTurn(true);
        assert.equal(focus(), "ECONOMIC");
    } finally {
        Game.VictoryManager = vm;
        delete world.victoryPoints;
        delete world.agePoints;
        delete world.met;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
    }
});

test("«Оборона»: the pass strikes a raider next to a soldier when the game's prediction says it pays", async () => {
    settings.patch({ autopilot: { defend: true, focus: false, replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    world.units = [{ id: 30, type: "UNIT_WARRIOR", x: A.x, y: A.y }];
    world.enemies = [{ x: A.x + 1, y: A.y, owner: 1, type: "UNIT_WARRIOR" }];
    world.wars = [1];
    world.combat = () => ({ dealt: 70, taken: 10 });
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        const attack = fake.sent.find((s) => s.kind === "unit" && s.id.id === 30 && s.op === UnitOperationTypes.MOVE_TO && s.args.Modifiers & UnitOperationMoveModifiers.ATTACK);
        assert.deepEqual([attack?.args.X, attack?.args.Y], [A.x + 1, A.y], JSON.stringify(keys()));
        assert.ok(keys().includes("STRUCK"));
    } finally {
        for (const k of ["units", "enemies", "wars", "combat"]) delete world[k];
        settings.patch({ autopilot: { defend: false } });
    }
});

test("purchases: the plan's purchases skip what the victory step bought this pass and count its gold (seen in game: one Port bought twice)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => `${s.id.id}|${GameInfo.Constructibles.lookup(s.args.ConstructibleType).ConstructibleType}`);
    const gold = world.gold;
    try {
        world.gold = 5000;
        fake.sent.length = 0;
        steps.buyBuildings(settings.get(), 0);
        const all = bought();
        assert.ok(all.length > 0, "the plan buys something");
        // The first of them was bought by the victory step already: not again.
        const [cityId, type] = all[0].split("|");
        const city = Players.get(0).Cities.getCities()[Number(cityId)];
        const purchases = { bought: new Set([`c:${city.location.x}-${city.location.y}|${type}`]), spent: 0 };
        fake.sent.length = 0;
        steps.buyBuildings(settings.get(), 0, purchases);
        assert.ok(!bought().includes(all[0]), JSON.stringify(bought()));
        // Its gold is spent already: nothing left for the plan.
        fake.sent.length = 0;
        steps.buyBuildings(settings.get(), 0, { bought: new Set(), spent: 5000 });
        assert.deepEqual(bought(), []);
    } finally {
        world.gold = gold;
    }
});

test("purchases: the plan buys no building in a city whose queue holds a wonder (research/32 §6)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.op === CityCommandTypes.PURCHASE).map((s) => s.id.id);
    const gold = world.gold;
    try {
        world.gold = 5000;
        fake.sent.length = 0;
        steps.buyBuildings(settings.get(), 0);
        const cities = Players.get(0).Cities.getCities();
        const id = bought().find((i) => !cities[i].isTown);
        assert.ok(id !== undefined, JSON.stringify(bought()));
        const city = world.cities[id];
        const queued = city.queued;
        city.queued = [...(queued ?? []), "WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        steps.buyBuildings(settings.get(), 0);
        city.queued = queued;
        assert.ok(!bought().includes(id), JSON.stringify(bought()));
    } finally {
        world.gold = gold;
    }
});

test("diplomacy option: the pass starts a counter-spy against a caught spy's leader", async () => {
    settings.patch({ autopilot: { diplomacy: true, focus: false, replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    world.notifications = [{ name: "NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE", target: { id: 71 } }];
    world.diplomacy = { 71: { initialPlayer: 1, targetPlayer: 0, revealed: true } };
    world.projects = { 1: [{ actionType: DiplomacyActionTypes.DIPLOMACY_ACTION_COUNTER_SPY, operationType: "OP_COUNTER_SPY", projectStatus: DiplomacyProjectStatus.PROJECT_AVAILABLE }] };
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.ok(fake.sent.some((s) => s.op === "OP_COUNTER_SPY"), JSON.stringify(keys()));
        assert.ok(keys().includes("COUNTER_SPY"));
    } finally {
        settings.patch({ autopilot: { diplomacy: false } });
        for (const k of ["notifications", "diplomacy", "projects"]) delete world[k];
    }
});

test("repairs come first in the pass: a damaged building is bought", async () => {
    settings.patch({ autopilot: { purchases: true, production: true, replanEvery: 0, skipUnits: false, endTurn: false } });
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === "BUILDING_LIBRARY" && id.id === 0 && args.X === undefined
        ? { Success: true, RepairDamaged: true, Plots: [GameplayMap.getIndexFromXY(A.x + 1, A.y)] } : canBuild(type, id, args));
    try {
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.ok(keys().includes("REPAIR_BOUGHT"), JSON.stringify(keys()));
    } finally {
        world.canBuild = canBuild;
    }
});

test("the building plan is recalculated when due", async () => {
    settings.patch({ autopilot: { replanEvery: 1, skipUnits: false, endTurn: false } });
    Game.turn += 1;
    await autopilot.runTurn(true);
    assert.ok(keys().includes("REPLANNED"));
    assert.equal(state.get().results.plans.computedTurn, Game.turn);
});

test("AI plays N turns: never offered without the game's Autoplay or in multiplayer", () => {
    assert.equal(autopilot.aiPlayAvailable(), false); // no Autoplay in the fake engine
    assert.equal(autopilot.startAiTurns(5), false);
});

// ---- AI plays N turns: the game's Autoplay, stopped before an age change or after a win.
const auto = { active: false, turns: 0, ret: null, obs: null };
function installAutoplay() {
    globalThis.Autoplay = {
        get isActive() { return auto.active; },
        setTurns: (n) => (auto.turns = n),
        setReturnAsPlayer: (p) => (auto.ret = p),
        setObserveAsPlayer: (p) => (auto.obs = p),
        setActive: (v) => (auto.active = !!v),
    };
}

test("AI run: starts for the human player and stops one turn before the age ends", () => {
    installAutoplay();
    assert.ok(autopilot.aiPlayAvailable());
    assert.ok(autopilot.startAiTurns(50));
    assert.deepEqual([auto.active, auto.turns, auto.ret, auto.obs], [true, 50, 0, 0]);
    engine.trigger("TurnBegin", {});
    assert.ok(auto.active, "the age is far from over: it keeps playing");
    Game.AgeProgressManager.ageCountdownStarted = true;
    world.agePoints = 99; // one turn of the countdown left
    engine.trigger("TurnBegin", {});
    assert.equal(auto.active, false, "stopped so the player chooses the next civilization");
    assert.ok(keys().includes("AI_STOPPED"));
    assert.equal(autopilot.startAiTurns(5), false, "not started on the last turn of an age");
    assert.ok(keys().includes("AI_REFUSED_AGE_END"));
    Game.AgeProgressManager.ageCountdownStarted = false;
    world.agePoints = 20;
});

test("AI run: stops when someone wins, when the age ends, and at the player's defeat", () => {
    for (const [event, data] of [["TeamVictory", {}], ["GameAgeEnded", {}], ["PlayerDefeat", { player: 0 }]]) {
        assert.ok(autopilot.startAiTurns(10), event);
        engine.trigger(event, data);
        assert.equal(auto.active, false, event);
    }
    assert.ok(autopilot.startAiTurns(10));
    engine.trigger("PlayerDefeat", { player: 5 }); // someone else
    assert.ok(auto.active);
    autopilot.stopAiTurns();
    assert.equal(auto.active, false);
});

test("control lost (the slot became AI at an older age change): taking it back runs one returning turn", () => {
    const player = Players.get(0);
    player.isHuman = false;
    assert.ok(autopilot.isControlLost());
    assert.ok(autopilot.takeBackControl());
    assert.deepEqual([auto.active, auto.turns, auto.ret], [true, 1, 0]);
    assert.equal(autopilot.isControlLost(), false, "while the returning turn runs");
    auto.active = false;
    player.isHuman = true;
    assert.equal(autopilot.isControlLost(), false);
});

test("a diplomacy screen is open: the turn is not ended until it closes (research/23 D1: the game refused 15 end turns in 30 s)", async () => {
    const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
    settings.patch({ autopilot: { skipUnits: false, endTurn: true, purchases: false } });
    const turn = Game.turn;
    Game.turn = turn + 40;
    world.turnSent = false;
    const ends = sent("endTurn").length;
    choices.setDiplomacyScreenProbe(() => true);
    try {
        autopilot.setAutopilot(true);
        await new Promise((r) => setTimeout(r, 3000));
        assert.equal(sent("endTurn").length, ends);
        assert.ok(keys().includes("WAIT_DIPLOMACY"));
        choices.setDiplomacyScreenProbe(null);
        engine.trigger("DiplomacySessionClosed", {});
        await new Promise((r) => setTimeout(r, 4000));
        assert.equal(sent("endTurn").length, ends + 1, "the session closed: the pass ran again and ended the turn");
    } finally {
        choices.setDiplomacyScreenProbe(null);
        autopilot.setAutopilot(false);
        Game.turn = turn;
    }
});

test("the end of the turn is asked at most 4 times in one turn (research/23 D1)", async () => {
    settings.patch({ autopilot: { skipUnits: false, endTurn: true, purchases: false } });
    const turn = Game.turn;
    Game.turn = turn + 60;
    world.turnSent = false;
    const ends = sent("endTurn").length;
    try {
        autopilot.setAutopilot(true);
        await new Promise((r) => setTimeout(r, 3000));
        for (let i = 0; i < 4; i++) {
            world.turnSent = false; // the game refused it and activated the turn again
            await autopilot.runTurn();
        }
        assert.equal(sent("endTurn").length, ends + 4);
        assert.ok(keys().includes("END_TURN_REFUSED"));
    } finally {
        autopilot.setAutopilot(false);
        Game.turn = turn;
    }
});

test("the age is over (the game asks for the next civilization): the autopilot says so and switches off", async () => {
    settings.patch({ autopilot: { skipUnits: false, endTurn: true, purchases: false, replanEvery: 0 } });
    world.turnSent = false;
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_CIVILIZATION" };
    autopilot.setAutopilot(true);
    await new Promise((r) => setTimeout(r, 6000));
    delete world.blocker;
    assert.ok(state.get().autopilot.log.some((e) => e.key === "AGE_OVER"));
    assert.ok(!autopilot.isAutopilotOn(), "switched off");
});

test("a new age starts (the game asks for its dedications): the autopilot says so and switches off", async () => {
    world.turnSent = false;
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_AGE_TRANSITION" };
    autopilot.setAutopilot(true);
    await new Promise((r) => setTimeout(r, 6000));
    delete world.blocker;
    assert.ok(state.get().autopilot.log.some((e) => e.key === "AGE_START"));
    assert.ok(!autopilot.isAutopilotOn());
});

test("any victory, or our defeat, switches the autopilot off (seen in game: it kept playing after Mexico won)", () => {
    const off = () => (state.get().autopilot.log ?? []).filter((e) => e.key === "GAME_OVER_OFF").length;
    const before = off();
    autopilot.setAutopilot(true);
    engine.trigger("TeamVictory", { team: 4, victory: 0 });
    assert.equal(autopilot.isAutopilotOn(), false);
    assert.equal(off(), before + 1);
    // Switched on again by the player ("one more turn"): only our own defeat stops it.
    autopilot.setAutopilot(true);
    engine.trigger("PlayerDefeat", { player: 3 });
    assert.equal(autopilot.isAutopilotOn(), true, "another player's defeat");
    engine.trigger("PlayerDefeat", { player: 0 });
    assert.equal(autopilot.isAutopilotOn(), false);
    assert.equal(off(), before + 2);
});

test("unattended (it ends turns): 1 plan tack per settlement and settle tacks only where settlers walk (research/21 H3: UI.log reached 200 MB)", () => {
    assert.deepEqual(autopilot.tackLimits({ endTurn: true }), { perSettlement: 1, nextSites: 0 });
    assert.deepEqual(autopilot.tackLimits({ endTurn: false }), { perSettlement: 3, nextSites: 3 });
});

test("the age change's entries name the science picks with the science focus (research/21 L8, J1, J2)", () => {
    assert.equal(autopilot.ageChoiceKey("NOTIFICATION_AGE_TRANSITION", "SCIENCE"), "AGE_START_SCIENCE");
    assert.equal(autopilot.ageChoiceKey("NOTIFICATION_CHOOSE_CIVILIZATION", "SCIENCE"), "AGE_OVER_SCIENCE");
    assert.equal(autopilot.ageChoiceKey("NOTIFICATION_AGE_TRANSITION", "CULTURE"), "AGE_START");
    assert.equal(autopilot.ageChoiceKey("NOTIFICATION_CHOOSE_BELIEF", "SCIENCE"), null);
});

test("the game's second turn activation in the same turn only orders units and ends the turn: nothing bought or queued twice (research/22 B9)", async () => {
    settings.patch({ autopilot: { purchases: true, production: true, towns: true, skipUnits: false, endTurn: false, focus: false, replanEvery: 0 } });
    const gold = world.gold;
    world.gold = 900;
    Game.turn += 1;
    const buys = () => sent("command").filter((s) => s.op === CityCommandTypes.PURCHASE).length;
    try {
        fake.sent.length = 0;
        autopilot.setAutopilot(true); // the turn's first pass
        await new Promise((r) => setTimeout(r, 2500));
        assert.ok(buys() > 0, "the first pass buys");
        fake.sent.length = 0;
        engine.trigger("PlayerTurnActivated", { player: 0 }); // the game activates the turn again
        await new Promise((r) => setTimeout(r, 3000));
        assert.equal(buys(), 0, "nothing bought again");
        assert.equal(sent("operation").length, 0, "nothing queued again");
    } finally {
        autopilot.setAutopilot(false);
        world.gold = gold;
    }
});

test("the final age's score line only while the score victory is on (research/31 §1: game 26 printed «score: ours 0» every turn)", async () => {
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", replanEvery: 0, skipUnits: false, endTurn: false, purchases: false } });
    Players.get(0).LegacyPaths = { getScore: (t) => (t === "LP_SCIENCE" ? 8 : 1) };
    const vm = Game.VictoryManager;
    const turn = Game.turn;
    world.finalAge = true;
    world.victoryPoints = { VICTORY_SCORE: { 0: 900, 5: 910 } };
    const lines = [];
    const warn = console.warn;
    const scored = () => lines.filter((l) => l.includes("score: ours")).length;
    try {
        console.warn = (...a) => lines.push(a.join(" "));
        Game.VictoryManager = { isCountdownVictoryEnabled: () => true, isScoreVictoryEnabled: () => false };
        Game.turn = turn + 1; // the races are logged once a turn
        await autopilot.runTurn(true);
        assert.equal(scored(), 0, "the score victory off");
        Game.VictoryManager = { isCountdownVictoryEnabled: () => true, isScoreVictoryEnabled: () => true };
        Game.turn = turn + 2;
        await autopilot.runTurn(true);
        assert.equal(scored(), 1);
    } finally {
        console.warn = warn;
        Game.VictoryManager = vm;
        Game.turn = turn;
        delete world.finalAge;
        delete world.victoryPoints;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
        delete Players.get(0).LegacyPaths;
    }
});
