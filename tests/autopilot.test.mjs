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
    research: { tech: { available: [11, 12] }, culture: { available: [21], active: 21 } },
    treeRecs: (subject) => (subject === AdvisorySubjectTypes.CHOOSE_TECH ? [{ recommendedType: 12, whichAdvisors: [AdvisorTypes.SCIENCE] }] : []),
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
    assert.ok(players.some((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE && s.args.ProgressionTreeNodeType === 12), "the advisor's technology");
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
