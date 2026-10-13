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
    players: [{ id: 0 }],
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
    } finally {
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
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
