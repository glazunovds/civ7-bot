// Victory paths, triumphs and resources as the game reports them (data/xpl-victory.js,
// assignResources), and production advice following the priority.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }],
    cities: [
        { owner: 0, x: 2, y: 2, name: "Rome", resources: [100], resourceCap: 2 },
        { owner: 0, x: 8, y: 8, name: "Ostia", isTown: true, resourceCap: 2 },
    ],
};
const fake = installFakeEngine(world);
const victory = await import("../mod/expansion-planner/ui/data/xpl-victory.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

GameInfo.LegacyPaths = [
    { LegacyPathType: "LP_CULTURE", LegacyPathClassType: "LEGACY_PATH_CLASS_CULTURE", EnabledByDefault: true, Name: "LOC_LP_CULTURE" },
    { LegacyPathType: "LP_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true, Name: "LOC_LP_SCIENCE" },
    { LegacyPathType: "LP_OFF", LegacyPathClassType: "LEGACY_PATH_CLASS_ECONOMIC", EnabledByDefault: false },
];
GameInfo.AgeProgressionMilestones = [
    { LegacyPathType: "LP_CULTURE", FinalMilestone: true, RequiredPathPoints: 7 },
    { LegacyPathType: "LP_CULTURE", FinalMilestone: false, RequiredPathPoints: 2 },
    { LegacyPathType: "LP_SCIENCE", FinalMilestone: true, RequiredPathPoints: 10 },
];
const SCORES = { 0: { LP_CULTURE: 4, LP_SCIENCE: 2 }, 1: { LP_CULTURE: 5, LP_SCIENCE: 1 }, 2: { LP_CULTURE: 7, LP_SCIENCE: 9 } };
for (const id of [0, 1, 2]) {
    const p = Players.get(id);
    p.isMajor = true;
    p.LegacyPaths = { getScore: (t) => SCORES[id][t] ?? 0 };
}
Object.assign((Players.get(0).Diplomacy ??= {}), { hasMet: (id) => id === 1 }); // player 2 not met yet

test("legacy paths: this age's enabled ones, our score, the best rival we have met, the final milestone's goal", () => {
    assert.deepEqual(victory.legacyStandings().map(({ cls, ours, rival, goal }) => ({ cls, ours, rival, goal })), [
        { cls: "CULTURE", ours: 4, rival: 5, goal: 7 },
        { cls: "SCIENCE", ours: 2, rival: 1, goal: 10 },
    ]);
});

test("the leader's preferred victory: this age's trait, else the Modern one", () => {
    const leaders = GameInfo.Leaders;
    const traits = GameInfo.LeaderTraits;
    try {
        GameInfo.Leaders = { lookup: () => ({ LeaderType: "LEADER_X" }) };
        GameInfo.LeaderTraits = [{ LeaderType: "LEADER_X", TraitType: "TRAIT_MO_SCIENCE_VICTORY" }, { LeaderType: "LEADER_Y", TraitType: "TRAIT_AQ_CULTURE_VICTORY" }];
        assert.equal(victory.leaderLeaning(), "SCIENCE", "no Antiquity trait: the Modern one");
        GameInfo.LeaderTraits.push({ LeaderType: "LEADER_X", TraitType: "TRAIT_AQ_ECONOMIC_VICTORY" });
        assert.equal(victory.leaderLeaning(), "ECONOMIC", "this age's (Antiquity) trait first");
    } finally {
        GameInfo.Leaders = leaders;
        GameInfo.LeaderTraits = traits;
    }
});

test("triumphs: this game's set, progress, done, taken first by a rival, kind", () => {
    const tags = GameInfo.TypeTags;
    try {
        GameInfo.Legacies = [
            { LegacyType: "TR_WONDERS", Name: "LOC_TR_WONDERS" },
            { LegacyType: "TR_RACE", Name: "LOC_TR_RACE", FirstPlayerOnly: true },
            { LegacyType: "TR_OTHER_SET", Name: "LOC_TR_OTHER" },
        ];
        GameInfo.TypeTags = [{ Type: "TR_WONDERS", Tag: "CULTURAL" }, { Type: "TR_RACE", Tag: "SCIENTIFIC" }];
        Players.get(0).Legacies = {
            isValidLegacy: (t) => t !== "TR_OTHER_SET",
            getProgress: (t) => (t === "TR_WONDERS" ? { progress: [{ current: 14, total: 20 }], raceWinner: -1 } : { progress: [{ current: 1, total: 1 }], raceWinner: 2 }),
            isTriggered: () => false,
        };
        assert.deepEqual(victory.triumphs().map(({ type, current, total, done, lost, category }) => ({ type, current, total, done, lost, category })), [
            { type: "TR_WONDERS", current: 14, total: 20, done: false, lost: false, category: "CULTURAL" },
            { type: "TR_RACE", current: 1, total: 1, done: false, lost: true, category: "SCIENTIFIC" },
        ]);
    } finally {
        GameInfo.TypeTags = tags;
        delete Players.get(0).Legacies;
    }
});

test("resources: unassigned ones go to free slots, most valuable by the priority first, cities before towns; empire resources never", () => {
    const at = (v) => { const l = GameplayMap.getLocationFromIndex(v); return `${l.x},${l.y}`; };
    world.resources = [
        { value: 100, type: "RESOURCE_MANGOS" },   // already in Rome
        { value: 101, type: "RESOURCE_RICE" },     // empire: never assigned
        { value: 102, type: "RESOURCE_CLAY" },     // production
        { value: 103, type: "RESOURCE_FLAX" },     // culture
    ];
    fake.sent.length = 0;
    const out = steps.assignResources({ ...DEFAULT_SETTINGS, profile: "CULTURE" });
    const sent = fake.sent.filter((s) => s.op === PlayerOperationTypes.ASSIGN_RESOURCE).map((s) => [`${s.args.Location.x},${s.args.Location.y}`, s.args.City]);
    assert.deepEqual(sent, [[at(103), 0], [at(102), 1]], "flax (culture) first into Rome's free slot, then clay into Ostia; never the rice");
    assert.equal(out[0].key, "RESOURCE_ASSIGNED");
    // The game refuses Rome: both go to Ostia.
    const canStart = Game.PlayerOperations.canStart;
    try {
        Game.PlayerOperations.canStart = (_p, op, args) => ({ Success: !(op === PlayerOperationTypes.ASSIGN_RESOURCE && args.City === 0) });
        fake.sent.length = 0;
        steps.assignResources({ ...DEFAULT_SETTINGS, profile: "CULTURE" });
        assert.deepEqual(fake.sent.filter((s) => s.op === PlayerOperationTypes.ASSIGN_RESOURCE).map((s) => s.args.City), [1, 1], "both into Ostia's two slots");
    } finally {
        Game.PlayerOperations.canStart = canStart;
    }
    // Locked (an age change): nothing.
    world.resourcesLocked = true;
    fake.sent.length = 0;
    assert.deepEqual(steps.assignResources(DEFAULT_SETTINGS), []);
    delete world.resourcesLocked;
    delete world.resources;
});

test("production advice: the advisor that matches the priority first", () => {
    GameInfo.AdvisorySubjects = { lookup: (h) => (h === 7 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_PROJECTS" } : null) };
    world.buildRecs = () => [
        { subject: 7, recommendedType: "PROJECT_CITY_SCIENCE_PROJECT", whichAdvisors: [AdvisorTypes.SCIENCE] },
        { subject: 7, recommendedType: "PROJECT_CITY_CULTURE_PROJECT", whichAdvisors: [AdvisorTypes.CULTURE] },
    ];
    const project = () => fake.sent.find((s) => s.kind === "operation" && s.id.id === 0 && s.args.ProjectType !== undefined)?.args.ProjectType;
    fake.sent.length = 0;
    steps.fillProduction(new Map(), { profile: "CULTURE" });
    assert.equal(project(), GameInfo.Projects.lookup("PROJECT_CITY_CULTURE_PROJECT").$hash);
    fake.sent.length = 0;
    steps.fillProduction(new Map(), { profile: "BALANCE" });
    assert.equal(project(), GameInfo.Projects.lookup("PROJECT_CITY_SCIENCE_PROJECT").$hash, "no matching advisor: the game's order");
    delete world.buildRecs;
});

test("production advice: never the advisor's wonder (wonders only through the race-checked wonder step)", () => {
    GameInfo.AdvisorySubjects = { lookup: (h) => (h === 8 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_CONSTRUCTIBLES" } : null) };
    world.buildRecs = () => [
        { subject: 8, recommendedType: GameInfo.Constructibles.lookup("WONDER_PYRAMIDS").$hash, whichAdvisors: [] },
        { subject: 8, recommendedType: GameInfo.Constructibles.lookup("BUILDING_GRANARY").$hash, whichAdvisors: [] },
    ];
    const canBuild = world.canBuild;
    world.canBuild = (type) => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(3, 2)], ExpandUrbanPlots: [] });
    const built = () => fake.sent.filter((s) => s.kind === "operation" && s.id.id === 0 && s.args.ConstructibleType !== undefined).map((s) => GameInfo.Constructibles.lookup(s.args.ConstructibleType).ConstructibleType);
    try {
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCE" });
        assert.deepEqual(built(), ["BUILDING_GRANARY"]);
    } finally {
        world.canBuild = canBuild;
        delete world.buildRecs;
    }
});

test("switched-off victories: the classes the game's victory manager says no to (the game's Victories rows: VictoryClassType)", () => {
    const vm = Game.VictoryManager;
    try {
        Game.VictoryManager = { isCountdownVictoryEnabled: (t) => t !== "VICTORY_CULTURE_MODERN" };
        assert.deepEqual([...victory.disabledVictories()], ["CULTURE"]);
        Game.VictoryManager = {};
        assert.deepEqual([...victory.disabledVictories()], [], "unknown: nothing is off");
    } finally {
        Game.VictoryManager = vm;
    }
});

test("victory races: our points, the goal (science: a fixed 100), the best rival we have met, the countdown while we lead, switched on or not", () => {
    const vm = Game.VictoryManager;
    const hashOf = (t) => GameInfo.VictoryTypes.lookup(t).$hash;
    try {
        world.victoryPoints = { VICTORY_SCIENCE_MODERN: { 0: 34, 1: 20, 2: 90 }, VICTORY_ECONOMIC_MODERN: { 0: 300, 1: 410 } };
        world.countdown = { VICTORY_SCIENCE_MODERN: 2 };
        Game.VictoryManager = {
            isCountdownVictoryEnabled: (t) => t !== "VICTORY_CULTURE_MODERN",
            getCountdownVictoryDominanceScore: (h) => (h === hashOf("VICTORY_ECONOMIC_MODERN") ? 600 : -1),
        };
        const races = victory.victoryRaces();
        assert.deepEqual(races.map((r) => r.cls), ["MILITARY", "CULTURE", "ECONOMIC", "SCIENCE"], "never score");
        const of = (cls) => races.find((r) => r.cls === cls);
        const { board, scoring, focusable, ...science } = of("SCIENCE");
        assert.deepEqual(science, { cls: "SCIENCE", type: "VICTORY_SCIENCE_MODERN", points: 34, goal: 100, rival: 20, turnsLeft: 3, enabled: true }, "player 2 (90) not met yet");
        assert.equal(focusable, true);
        assert.equal(of("MILITARY").focusable, false, "the watch reads it; the focus never takes it");
        assert.deepEqual([of("ECONOMIC").points, of("ECONOMIC").goal, of("ECONOMIC").rival, of("ECONOMIC").turnsLeft], [300, 600, 410, null]);
        assert.equal(of("CULTURE").enabled, false);
    } finally {
        Game.VictoryManager = vm;
        delete world.victoryPoints;
        delete world.countdown;
    }
});

test("only this age's legacy paths (GameInfo.LegacyPaths holds every age's; seen in game: no focus after an age change)", () => {
    const rows = GameInfo.LegacyPaths;
    const milestones = GameInfo.AgeProgressionMilestones;
    try {
        GameInfo.LegacyPaths = [
            { LegacyPathType: "LP_EX_ECONOMIC", Age: "AGE_EXPLORATION", LegacyPathClassType: "LEGACY_PATH_CLASS_ECONOMIC", EnabledByDefault: true },
            { LegacyPathType: "LP_AQ_ECONOMIC", Age: "AGE_ANTIQUITY", LegacyPathClassType: "LEGACY_PATH_CLASS_ECONOMIC", EnabledByDefault: true },
        ];
        GameInfo.AgeProgressionMilestones = [
            { LegacyPathType: "LP_EX_ECONOMIC", FinalMilestone: true, RequiredPathPoints: 30 },
            { LegacyPathType: "LP_AQ_ECONOMIC", FinalMilestone: true, RequiredPathPoints: 20 },
        ];
        assert.deepEqual(victory.legacyStandings().map((s) => s.path), ["LP_AQ_ECONOMIC"], "this game is in Antiquity");
    } finally {
        GameInfo.LegacyPaths = rows;
        GameInfo.AgeProgressionMilestones = milestones;
    }
});

test("legacy paths switched off in the game setup are left out (the player's enabled paths)", () => {
    const me = Players.get(0);
    me.LegacyPaths.getEnabledLegacyPaths = () => [{ legacyPath: Database.makeHash("LP_SCIENCE") }];
    try {
        assert.deepEqual(victory.legacyStandings().map((s) => s.cls), ["SCIENCE"]);
    } finally {
        delete me.LegacyPaths.getEnabledLegacyPaths;
    }
    assert.deepEqual(victory.legacyStandings().map((s) => s.cls), ["CULTURE", "SCIENCE"], "unknown: all of them");
    // The list names another age's paths (as after an age change): matched by class.
    me.LegacyPaths.getEnabledLegacyPaths = () => [{ legacyPath: Database.makeHash("LEGACY_PATH_ANTIQUITY_SCIENCE"), legacyPathClass: Database.makeHash("LEGACY_PATH_CLASS_SCIENCE") }];
    try {
        assert.deepEqual(victory.legacyStandings().map((s) => s.cls), ["SCIENCE"]);
    } finally {
        delete me.LegacyPaths.getEnabledLegacyPaths;
    }
    // A list that matches none of this age's paths is not believed: all of them.
    me.LegacyPaths.getEnabledLegacyPaths = () => [{ legacyPath: Database.makeHash("LEGACY_PATH_SOMETHING_ELSE") }];
    try {
        assert.deepEqual(victory.legacyStandings().map((s) => s.cls), ["CULTURE", "SCIENCE"]);
    } finally {
        delete me.LegacyPaths.getEnabledLegacyPaths;
    }
});

test("victory races carry every major's points, sorted (the victories screen's leaderboard), met or not, and who counts down", () => {
    const vm = Game.VictoryManager;
    try {
        world.victoryPoints = { VICTORY_CULTURE_MODERN: { 0: 300, 1: 1400, 2: 388 } };
        world.countdowns = { VICTORY_CULTURE_MODERN: { 1: 2 } };
        Game.VictoryManager = { isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => 1552 };
        const culture = victory.victoryRaces().find((r) => r.cls === "CULTURE");
        assert.deepEqual(culture.board.map((b) => [b.id, b.points, b.dominant]), [[1, 1400, true], [2, 388, false], [0, 300, false]]);
        assert.equal(culture.board.find((b) => b.id === 2).met, (world.met ?? []).includes(2), "met or not, every major is on the board");
        assert.equal(culture.scoring, "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION");
    } finally {
        Game.VictoryManager = vm;
        delete world.victoryPoints;
        delete world.countdowns;
    }
});

test("the score victory: every major's score, sorted, as the victory screen's score tab reads it (research/30 §1)", () => {
    world.victoryPoints = { VICTORY_SCORE: { 0: 923, 1: 933, 2: 913 } };
    try {
        assert.deepEqual(victory.scoreBoard(), [{ id: 1, points: 933 }, { id: 0, points: 923 }, { id: 2, points: 913 }]);
    } finally {
        delete world.victoryPoints;
    }
});
