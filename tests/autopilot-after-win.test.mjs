// After the win (game 40): our countdown to a fixed-score victory runs with its goal reached, or the game is decided (a victory
// awarded, a game played on past its end): nothing chases a victory any more. Game 40 (Ada, science, won at M55): 107 of 100
// Innovation from M49, yet Preparation, the Radio Telescope, a satellite, a flight and two Launch Pads took 1,518 production,
// a pad was bought for 252, Future Tech was researched with four masteries left, and settlers went for a military countdown.
// Playing on after it (the user): several wonders at once, idle gold for conversions and buildings, the satellite that reveals
// the map, and every remaining building on its best tile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 40, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }],
    cities: [
        { owner: 0, x: 3, y: 3, name: "Paris", prod: 30 },
        { owner: 0, x: 10, y: 3, name: "Lyon", prod: 20 },
        { owner: 0, x: 17, y: 3, name: "Nice", prod: 10 },
        { owner: 1, x: 25, y: 5, name: "Berlin" },
        { owner: 2, x: 33, y: 5, name: "Rome" },
    ],
};
const fake = installFakeEngine(world, "modern");
const { victoryOutcome } = await import("../mod/expansion-planner/ui/core/xpl-victory-focus.js");
const victory = await import("../mod/expansion-planner/ui/data/xpl-victory.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const V = (t) => GameInfo.Victories.lookup(t).$hash;
const city = (name) => world.cities.findIndex((c) => c.name === name);
const removals = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.RemoveAt).map((s) => [world.cities[s.id.id].name, s.args.QueueLocation]);
const appended = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => [world.cities[s.id.id].name, GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleType ?? GameInfo.Projects.lookup(s.args.ProjectType)?.ProjectType]);
const researched = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);
// Each city offers a Factory on a tile next to it; projects where world.projectsOk says so.
world.canBuild = (type, id) => {
    if (type === undefined) return { Success: true };
    const c = world.cities[id.id];
    if (type === "BUILDING_FACTORY") return { Success: true, Plots: [idx(c.x + 1, c.y)], ExpandUrbanPlots: [] };
    if (type?.startsWith("PROJECT_")) return { Success: !!world.projectsOk?.(type, c), Plots: [] };
    if (type?.startsWith("WONDER_") && world.wondersOk?.(type)) return { Success: true, Plots: [idx(c.x, c.y + 1), idx(c.x, c.y - 1)], ExpandUrbanPlots: [] };
    return { Success: false, Plots: [] };
};

const FIXED = "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE", DOMINATION = "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION";
const science = (points, turnsLeft, board = []) => ({ cls: "SCIENCE", scoring: FIXED, enabled: true, points, goal: 100, turnsLeft, board: [{ id: 0, points, dominant: turnsLeft !== null, turns: turnsLeft }, ...board] });

test("core: a fixed-score countdown of ours with its goal reached is SECURED unless a rival's ends sooner; a victory awarded is WON (ours) or DECIDED", () => {
    assert.equal(victoryOutcome([science(99, null)], 0).state, "OPEN", "below the goal");
    assert.equal(victoryOutcome([science(107, null)], 0).state, "OPEN", "no countdown (the Launch Pad damaged)");
    assert.equal(victoryOutcome([science(95, 3)], 0).state, "OPEN", "a countdown below the goal is not ours to keep");
    assert.deepEqual(victoryOutcome([science(107, 3)], 0), { state: "SECURED", cls: "SCIENCE", name: null, turnsLeft: 3 }, "game 40, M49-M54");
    const culture = (turns) => ({ cls: "CULTURE", scoring: DOMINATION, enabled: true, points: 50, goal: 200, turnsLeft: null, board: [{ id: 2, points: 210, dominant: true, turns }, { id: 0, points: 50 }] });
    assert.equal(victoryOutcome([science(107, 3), culture(2)], 0).state, "OPEN", "a rival's countdown ends first: still to fight");
    assert.equal(victoryOutcome([science(107, 3), culture(3)], 0).state, "SECURED", "the same turn: both first places (game 16)");
    assert.equal(victoryOutcome([{ ...culture(2), enabled: false }, science(107, 3)], 0).state, "SECURED", "a victory switched off");
    const ours = { cls: "ECONOMIC", scoring: DOMINATION, enabled: true, points: 4000, goal: 3500, turnsLeft: 2, board: [{ id: 0, points: 4000, dominant: true, turns: 2 }] };
    assert.equal(victoryOutcome([ours], 0).state, "OPEN", "a dominance countdown: the second place may still rise");
    assert.deepEqual(victoryOutcome([science(50, null)], 0, { victories: [{ cls: "SCIENCE", name: "LOC_V", ours: true }] }), { state: "WON", cls: "SCIENCE", name: "LOC_V", turnsLeft: null });
    assert.equal(victoryOutcome([science(50, null)], 0, { victories: [{ cls: "CULTURE", ours: false }] }).state, "DECIDED", "a rival won, and we play on");
    assert.equal(victoryOutcome([science(50, null)], 0, { extended: true }).state, "DECIDED", "a game played on past its end");
});

test("data: the game's victories (Game.VictoryManager.getVictories), ours by team, and the outcome now", () => {
    const vm = Game.VictoryManager;
    try {
        Players.get(0).team = 0;
        Players.get(1).team = 1;
        Game.VictoryManager = { getVictories: () => [{ victory: V("VICTORY_SCIENCE_MODERN"), team: 0, place: 1 }], isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => -1 };
        assert.deepEqual(victory.gameVictories(), [{ cls: "SCIENCE", type: "VICTORY_SCIENCE_MODERN", name: "LOC_VICTORY_MODERN_SCIENCE_NAME", place: 1, ours: true }]);
        assert.equal(victory.victoryOutcomeNow().state, "WON");
        Game.VictoryManager.getVictories = () => [{ victory: V("VICTORY_CULTURE_MODERN"), team: 1, place: 1 }];
        assert.deepEqual([victory.gameVictories()[0].ours, victory.victoryOutcomeNow().state], [false, "DECIDED"]);
        Game.VictoryManager.getVictories = () => [];
        assert.equal(victory.victoryOutcomeNow().state, "OPEN");
        world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 107 } };
        world.countdown = { VICTORY_SCIENCE_MODERN: 2 };
        assert.deepEqual(victory.victoryOutcomeNow(), { state: "SECURED", cls: "SCIENCE", name: null, turnsLeft: 3 });
        world.extendedGame = true;
        assert.equal(victory.victoryOutcomeNow().state, "DECIDED");
    } finally {
        Game.VictoryManager = vm;
        for (const k of ["victoryPoints", "countdown", "extendedGame"]) delete world[k];
    }
});

test("after the win, the projects that serve only a victory leave the queues, one a city; alone, the plan's or the cheapest building takes its place first; a Launch Pad and the satellite stay", () => {
    try {
        world.cities[city("Paris")].queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 9, pct: 30 };
        world.cities[city("Paris")].queued = ["BUILDING_FACTORY", "PROJECT_LAUNCH_SATELLITE"];
        world.cities[city("Lyon")].queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_RESEARCH", turns: 1, pct: 98 };
        world.cities[city("Nice")].queue = { type: "BUILDING_FACTORY", turns: 4 };
        world.cities[city("Nice")].queued = ["PROJECT_OPERATION_IVY"];
        fake.sent.length = 0;
        const out = steps.dropVictoryWork();
        assert.deepEqual(removals(), [["Paris", 0], ["Lyon", 0], ["Nice", 1]], "progress or not; one a city a pass");
        assert.deepEqual(appended(), [["Lyon", "BUILDING_FACTORY"]], "Lyon's queue would be empty");
        assert.deepEqual(out.map((e) => [e.key, e.args[0]]), [["VICTORY_WORK_DROPPED", "Paris"], ["VICTORY_WORK_DROPPED", "Lyon"], ["VICTORY_WORK_DROPPED", "Nice"]]);
        // A Launch Pad (a building: +18 Science) and Launch Satellite (it reveals the map) are no victory work.
        world.cities[city("Paris")].queue = { type: "BUILDING_LAUNCH_PAD", turns: 3, pct: 40 };
        world.cities[city("Paris")].queued = ["PROJECT_LAUNCH_SATELLITE"];
        world.cities[city("Lyon")].queue = undefined;
        world.cities[city("Nice")].queued = [];
        fake.sent.length = 0;
        assert.deepEqual(steps.dropVictoryWork(), []);
        // Nothing of a victory in a queue: nothing happens.
        for (const c of world.cities) delete c.queued;
        world.cities[city("Paris")].queue = { type: "BUILDING_FACTORY", turns: 3 };
        world.cities[city("Lyon")].queue = undefined;
        fake.sent.length = 0;
        assert.deepEqual(steps.dropVictoryWork(), []);
        assert.equal(fake.sent.length, 0);
    } finally {
        for (const c of world.cities) {
            delete c.queue;
            delete c.queued;
        }
    }
});

test("research takes every other technology and mastery before Future Tech (after the win too), the advisor's first, else the quickest", () => {
    const S = { ...DEFAULT_SETTINGS, afterWin: "WON" };
    try {
        world.research = { tech: { available: [N("NODE_TECH_MO_FUTURE_TECH"), N("NODE_TECH_MO_MOBILIZATION"), N("NODE_TECH_MO_URBANIZATION")] }, culture: { available: [] },
            depth: { NODE_TECH_MO_URBANIZATION: 1 }, turns: { NODE_TECH_MO_FUTURE_TECH: 3, NODE_TECH_MO_MOBILIZATION: 9, NODE_TECH_MO_URBANIZATION: 6 } };
        // Game 40, M45 and M49: the game's advisor named Future Tech.
        world.treeRecs = () => [{ recommendedType: N("NODE_TECH_MO_FUTURE_TECH"), whichAdvisors: [] }];
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(researched(), ["NODE_TECH_MO_URBANIZATION"], "before the win too (game 41: Future Civic while Rome Reborn waited)");
        fake.sent.length = 0;
        steps.chooseResearch("tech", S, null);
        assert.deepEqual(researched(), ["NODE_TECH_MO_URBANIZATION"], "Urbanization's mastery: the quickest of the rest");
        world.treeRecs = () => [{ recommendedType: N("NODE_TECH_MO_FUTURE_TECH"), whichAdvisors: [] }, { recommendedType: N("NODE_TECH_MO_MOBILIZATION"), whichAdvisors: [] }];
        // Urbanization's mastery raises the settlement cap: far from it (research/40 A1), the advisor's.
        world.settlementCap = 20;
        fake.sent.length = 0;
        steps.chooseResearch("tech", S, null);
        assert.deepEqual(researched(), ["NODE_TECH_MO_MOBILIZATION"], "the advisor's among the rest");
        delete world.settlementCap;
        world.research.tech.available = [N("NODE_TECH_MO_FUTURE_TECH")];
        fake.sent.length = 0;
        steps.chooseResearch("tech", S, null);
        assert.deepEqual(researched(), ["NODE_TECH_MO_FUTURE_TECH"], "nothing else is left");
    } finally {
        delete world.research;
        delete world.treeRecs;
    }
});

test("after the win every remaining building comes before the advisor, on the plan's or the game's best free tile, a Launch Pad too; no victory project from the advisor or the last resort", () => {
    const subjects = GameInfo.AdvisorySubjects;
    const canBuild = world.canBuild;
    try {
        GameInfo.AdvisorySubjects = { lookup: (h) => (h === 7 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_PROJECTS" } : null) };
        world.projectsOk = (type) => type === "PROJECT_CREWED_SPACE_FLIGHT_PREP" || type === "PROJECT_CITY_SCIENCE_PROJECT";
        world.buildRecs = () => [{ subject: 7, recommendedType: "PROJECT_CITY_SCIENCE_PROJECT", whichAdvisors: [] }];
        const opts = { profile: "BALANCED", strategy: null };
        const paris = (out) => out.filter((e) => e.args[0] === "Paris").map((e) => e.key);
        fake.sent.length = 0;
        assert.deepEqual(paris(steps.fillProduction(new Map(), opts)), ["QUEUED_ADVISOR"], "before the win the advisor's project");
        fake.sent.length = 0;
        assert.deepEqual(paris(steps.fillProduction(new Map(), { ...opts, afterWin: "WON" })), ["QUEUED_REMAINING"]);
        assert.deepEqual(appended().filter(([c]) => c === "Paris"), [["Paris", "BUILDING_FACTORY"]], "the remaining building");
        // A Launch Pad, the cheapest building left: a building like any other once the race is over.
        world.costOf = (t) => (t === "BUILDING_LAUNCH_PAD" ? 50 : undefined);
        world.canBuild = (type, id, args) => (type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(world.cities[id.id].x, world.cities[id.id].y + 1)], ExpandUrbanPlots: [] } : canBuild(type, id, args));
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { ...opts, afterWin: "WON" });
        assert.deepEqual(appended().filter(([c]) => c === "Paris"), [["Paris", "BUILDING_LAUNCH_PAD"]]);
        // No building left: the advisor's Preparation is not taken, nor the last resort's, the cheapest project.
        world.canBuild = (type, id, args) => (type?.startsWith("BUILDING_") ? { Success: false, Plots: [] } : canBuild(type, id, args));
        world.buildRecs = () => [{ subject: 7, recommendedType: "PROJECT_CREWED_SPACE_FLIGHT_PREP", whichAdvisors: [] }];
        world.projectsOk = (type) => type === "PROJECT_CREWED_SPACE_FLIGHT_PREP" || type === "PROJECT_TOWN_GRANARY";
        world.costOf = (t) => (t === "PROJECT_CREWED_SPACE_FLIGHT_PREP" ? 50 : undefined); // the cheapest project
        fake.sent.length = 0;
        steps.fillProduction(new Map(), opts);
        assert.deepEqual(appended().filter(([c]) => c === "Paris"), [["Paris", "PROJECT_CREWED_SPACE_FLIGHT_PREP"]], "before the win");
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { ...opts, afterWin: "WON" });
        assert.deepEqual(appended().filter(([c]) => c === "Paris"), [["Paris", "PROJECT_TOWN_GRANARY"]]);
    } finally {
        world.canBuild = canBuild;
        GameInfo.AdvisorySubjects = subjects;
        delete world.projectsOk;
        delete world.buildRecs;
        delete world.costOf;
    }
});

test("playing on: Launch Satellite once (it reveals the map), in the Launch Pad city that runs it soonest; not while queued or running", () => {
    try {
        world.projectsOk = (type, c) => type === "PROJECT_LAUNCH_SATELLITE" && (c.name === "Lyon" || c.name === "Nice");
        fake.sent.length = 0;
        assert.deepEqual(steps.launchSatellite().map((e) => [e.key, e.args[0]]), [["SATELLITE_QUEUED", "Lyon"]], "Lyon (20 production) before Nice (10)");
        assert.deepEqual(appended(), [["Lyon", "PROJECT_LAUNCH_SATELLITE"]]);
        // Lyon busy 80 turns more (50 + 80 against Nice's 100): Nice runs it sooner.
        world.cities[city("Lyon")].queue = { type: "BUILDING_FACTORY", turns: 80 };
        fake.sent.length = 0;
        assert.deepEqual(steps.launchSatellite().map((e) => e.args[0]), ["Nice"]);
        delete world.cities[city("Lyon")].queue;
        world.cities[city("Nice")].queued = ["PROJECT_LAUNCH_SATELLITE"];
        fake.sent.length = 0;
        assert.deepEqual(steps.launchSatellite(), [], "queued in Nice");
        delete world.cities[city("Nice")].queued;
        world.projectsOk = () => false; // done (MaxPlayerInstances 1), or no Launch Pad
        assert.deepEqual(steps.launchSatellite(), []);
        assert.equal(fake.sent.length, 0);
    } finally {
        delete world.projectsOk;
        delete world.cities[city("Nice")].queued;
        delete world.cities[city("Lyon")].queue;
    }
});

test("after the win a town whose conversion pays back slowly (CONSIDER) becomes a city too, past the 1:1 floor; a feeder stays", () => {
    world.cities.push(
        { owner: 0, x: 24, y: 3, name: "Arles", isTown: true, pop: 8, prod: 34, cost: 20000 },
        { owner: 0, x: 31, y: 3, name: "Tours", isTown: true, pop: 8, prod: 30, cost: 1000 },
        { owner: 0, x: 24, y: 9, name: "Vichy", isTown: true, pop: 8, prod: 12, cost: 2500 },
    );
    try {
        world.finalAge = true;
        world.extendedGame = true;
        clearEngineCache();
        const names = (list) => list.map((r) => `${r.town.name} ${r.advice.verdict}`);
        assert.deepEqual(names(steps.conversionCandidates(DEFAULT_SETTINGS)), ["Tours CONVERT"], "3 cities, 3 towns: CONVERT only");
        assert.deepEqual(names(steps.conversionCandidates({ ...DEFAULT_SETTINGS, afterWin: "WON" })), ["Tours CONVERT", "Arles CONSIDER"], "Vichy (KEEP) stays a town");
        // The gold plan saves for it: Tours a city, Arles is the one town to convert.
        world.cities[city("Tours")].isTown = false;
        world.gold = 100;
        world.goldIncome = 2000;
        const goal = (s) => {
            steps.resetGoldPlan();
            return steps.goldPlan(s, { focus: null, reserveTurns: 0 }).budget.goal;
        };
        assert.notEqual(goal(DEFAULT_SETTINGS)?.kind, "CONVERT");
        assert.deepEqual([goal({ ...DEFAULT_SETTINGS, afterWin: "WON" })?.kind, goal({ ...DEFAULT_SETTINGS, afterWin: "WON" })?.key], ["CONVERT", "convert:24,3"]);
    } finally {
        steps.resetGoldPlan();
        delete world.gold;
        delete world.goldIncome;
        world.cities.splice(-3, 3);
        delete world.finalAge;
        delete world.extendedGame;
        clearEngineCache();
    }
});

test("the pass: with the science countdown running at 107 of 100 the victory work stops (logged once); in a game played on after our win, the focus is off", async () => {
    const vm = Game.VictoryManager;
    const off = { research: false, production: false, growth: false, towns: false, resources: false, choices: false, befriend: false, wonders: false, purchases: false };
    const log = () => state.get().autopilot?.log ?? [];
    try {
        Players.get(0).team = 0;
        GameInfo.LegacyPaths = [{ LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
        GameInfo.AgeProgressionMilestones = [{ LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 500 }];
        Players.get(0).LegacyPaths = { getScore: () => 20 };
        Game.VictoryManager = { getVictories: () => [], isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => -1, isScoreVictoryEnabled: () => true };
        world.finalAge = true;
        world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 107 } };
        world.countdown = { VICTORY_SCIENCE_MODERN: 2 };
        // A Launch Pad stands in Paris (Rocketry and its masteries in), Preparation runs there; projects are offered.
        world.structures = (x, y) => ({ district: null, constructibles: x === 4 && y === 3 ? ["BUILDING_LAUNCH_PAD"] : [] });
        world.techs = ["NODE_TECH_MO_ROCKETRY"];
        world.projectsOk = (_type, c) => c.name === "Paris";
        world.cities[city("Paris")].queue = { type: "PROJECT_CREWED_SPACE_FLIGHT_PREP", turns: 9, pct: 10 };
        world.research = { tech: { available: [N("NODE_TECH_MO_FUTURE_TECH"), N("NODE_TECH_MO_MOBILIZATION")] }, culture: { available: [] }, turns: { NODE_TECH_MO_FUTURE_TECH: 3, NODE_TECH_MO_MOBILIZATION: 9 } };
        world.treeRecs = () => [{ recommendedType: N("NODE_TECH_MO_FUTURE_TECH"), whichAdvisors: [] }];
        settings.patch({ autopilot: { ...off, focus: true, victory: "SCIENCE", production: true, research: true, replanEvery: 0, skipUnits: false, endTurn: false } });
        state.set({ autopilot: { ...(state.get().autopilot ?? {}), log: [], outcome: null } });
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.deepEqual(log().filter((e) => e.key === "VICTORY_SECURED").map((e) => e.args[1]), [3]);
        assert.ok(!log().some((e) => e.key === "VICTORY_WORK"), JSON.stringify(log().map((e) => e.key)));
        assert.ok(!appended().some(([, t]) => /^PROJECT_|LAUNCH_PAD/.test(t)), JSON.stringify(appended()));
        assert.deepEqual(removals(), [["Paris", 0]], "Preparation leaves Paris's queue");
        assert.deepEqual(researched(), ["NODE_TECH_MO_MOBILIZATION"], "not Future Tech");
        assert.equal(state.get().autopilot.outcome.state, "SECURED");
        // The next pass says nothing new.
        await autopilot.runTurn(true);
        assert.equal(log().filter((e) => e.key === "VICTORY_SECURED").length, 1);
        // The game is won and played on («Ещё один ход»), the next turn: the focus is off, the satellite goes into Paris (its
        // Launch Pad), and two wonders start at once in two cities.
        Game.VictoryManager.getVictories = () => [{ victory: V("VICTORY_SCIENCE_MODERN"), team: 0, place: 1 }];
        world.extendedGame = true;
        delete world.countdown;
        world.wondersOk = (t) => t === "WONDER_EIFFEL_TOWER" || t === "WONDER_STATUE_OF_LIBERTY";
        delete world.cities[city("Paris")].queue; // Preparation left it (the fake's queue does not follow a removal)
        settings.patch({ autopilot: { wonders: true } });
        Game.turn += 1;
        clearEngineCache();
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.ok(log().some((e) => e.key === "VICTORY_WON"), JSON.stringify(log().map((e) => e.key)));
        assert.equal(state.get().autopilot.focus ?? null, null);
        assert.ok(log().some((e) => e.key === "SATELLITE_QUEUED" && e.args[0] === "Paris"), JSON.stringify(log().map((e) => e.key)));
        assert.deepEqual(appended().filter(([, t]) => t.startsWith("WONDER_")).map(([c]) => c).sort(), ["Lyon", "Paris"], JSON.stringify(appended()));
    } finally {
        Game.VictoryManager = vm;
        settings.patch({ autopilot: { ...Object.fromEntries(Object.keys(off).map((k) => [k, true])), focus: false, victory: "AUTO" } });
        for (const k of ["finalAge", "victoryPoints", "countdown", "structures", "techs", "projectsOk", "research", "treeRecs", "extendedGame", "wondersOk"]) delete world[k];
        delete world.cities[city("Paris")].queue;
        delete Players.get(0).LegacyPaths;
    }
});
