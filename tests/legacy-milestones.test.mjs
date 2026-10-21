// Research/40 B2 and games 42-43: legacy beyond the victory focus. Legacy paths count nothing in this game version (their
// score read 0 in every age, and no path milestone moved the age's clock); the rewards are the triumphs. Exploration's Homeland
// triumph wants 16 settlements (+2 cap in Modern). Game 41: Exploration ended at 12 of 16; game 43 bought two settlers at E69.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { MILESTONE_LATE_TURNS, settlementMilestone, triumphLine, triumphsUnderWay } from "../mod/expansion-planner/ui/core/xpl-legacy.js";

const world = {
    width: 30, height: 14, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [0, 1, 2, 3, 4].map((i) => ({ owner: 0, x: 3 + 5 * i, y: 4, name: `S${i}`, isTown: i > 1 })),
    settlementCap: 6,
    gold: 2000,
    canBuy: (type) => ({ Success: type === "UNIT_SETTLER", Cost: 300 }),
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const ageHash = (t) => GameInfo.Ages.lookup(t).$hash;
const TRIUMPHS = [
    { type: "LEGACY_EX_A", name: "A", current: 12, total: 16, done: false, lost: false },
    { type: "LEGACY_EX_B", name: "B", current: 1, total: 5, done: false, lost: false },
    { type: "LEGACY_EX_C", name: "C", current: 5, total: 5, done: true, lost: false },
    { type: "LEGACY_EX_D", name: "D", current: 4, total: 5, done: false, lost: true },
    { type: "LEGACY_EX_E", name: "E", current: 0, total: 3, done: false, lost: false },
];

test("core: settlers only toward the Homeland triumph, in Exploration, within the cap's room, not in the age's last turns", () => {
    assert.deepEqual(settlementMilestone({ age: "AGE_EXPLORATION", settlements: 12, homeland: 12, cap: 16 }), { need: 4, why: "HOMELAND", next: 16 });
    assert.equal(settlementMilestone({ age: "AGE_EXPLORATION", settlements: 17, homeland: 16, cap: 18 }), null);
    assert.equal(settlementMilestone({ age: "AGE_EXPLORATION", settlements: 13, homeland: 13, cap: 14, turnsLeft: MILESTONE_LATE_TURNS }), null, "game 43: bought at E69, never founded");
    assert.ok(settlementMilestone({ age: "AGE_EXPLORATION", settlements: 13, homeland: 13, cap: 14, turnsLeft: MILESTONE_LATE_TURNS + 1 }));
    // Antiquity's military path (6 / 9 settlements) counts nothing in this game version.
    assert.equal(settlementMilestone({ age: "AGE_ANTIQUITY", settlements: 5, cap: 6 }), null);
    assert.equal(settlementMilestone({ age: "AGE_MODERN", settlements: 5, cap: 9 }), null);
});

test("core: the triumphs under way, closest first (not done, not lost, some progress), and the log's part", () => {
    assert.deepEqual(triumphsUnderWay(TRIUMPHS).map((t) => t.type), ["LEGACY_EX_A", "LEGACY_EX_B"]);
    assert.equal(triumphLine(TRIUMPHS), "1 done; LEGACY_EX_A 12/16, LEGACY_EX_B 1/5");
});

test("Exploration: a settler is bought toward the Homeland triumph, one a pass; none in the age's last turns", () => {
    const age = Game.age;
    Game.age = ageHash("AGE_EXPLORATION");
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 26, y: 9, rank: 1 }] } } });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType === GameInfo.Units.lookup("UNIT_SETTLER").$hash).length;
    try {
        fake.sent.length = 0;
        let out = steps.buySettlers(createBudget({ gold: 2000, reserve: 0 }), []);
        assert.equal(bought(), 1, JSON.stringify(out));
        assert.equal(out[0].key, "SETTLER_BOUGHT");
        // The savings goal bought one this pass (game 43, E69: buyGoal, then buySettlers again): no second.
        const b = createBudget({ gold: 2000, reserve: 0 });
        b.spend(300, { kind: "SETTLER", label: "S0" }, { goal: true });
        fake.sent.length = 0;
        assert.deepEqual(steps.buySettlers(b, []), []);
        assert.equal(bought(), 0);
        // The other order: one bought by buySettlers, then the SETTLER goal's own purchase (buyGoal) buys no second.
        const g = steps.goldPlan({ ...DEFAULT_SETTINGS, autopilot: { ...DEFAULT_SETTINGS.autopilot, settlers: true }, strategy: { goals: ["SETTLER"] } }, { reserveTurns: 0 }).budget;
        assert.equal(g.goal?.kind, "SETTLER");
        fake.sent.length = 0;
        assert.equal(steps.buySettlers(g, [])[0]?.key, "SETTLER_BOUGHT");
        assert.deepEqual(steps.buyGoal(g), []);
        assert.equal(bought(), 1);
        // Short of gold: a settler is saved for (no town to convert here).
        world.gold = 100;
        world.goldIncome = 50;
        world.canConvert = false;
        const s = { ...DEFAULT_SETTINGS, autopilot: { ...DEFAULT_SETTINGS.autopilot, settlers: true }, strategy: { goals: ["CONVERT"] } };
        assert.equal(steps.goldPlan(s, { reserveTurns: 0 }).budget.goal?.kind, "SETTLER");
        // The age's last turns: a settler would found after it ends.
        world.agePoints = 97;
        assert.notEqual(steps.goldPlan(s, { reserveTurns: 0 }).budget.goal?.kind, "SETTLER");
        world.gold = 2000;
        fake.sent.length = 0;
        steps.buySettlers(createBudget({ gold: 2000, reserve: 0 }), []);
        assert.equal(bought(), 0);
    } finally {
        Game.age = age;
        world.gold = 2000;
        delete world.agePoints;
        delete world.goldIncome;
        delete world.canConvert;
    }
});

test("Antiquity: a legacy path near its military milestone buys no settler (path milestones count nothing: games 42-43)", () => {
    const LP = [{ LegacyPathType: "LEGACY_PATH_ANTIQUITY_MILITARY", LegacyPathClassType: "LEGACY_PATH_CLASS_MILITARY", EnabledByDefault: true, Age: "AGE_ANTIQUITY" }];
    const MS = [6, 9, 12].map((n, i) => ({ LegacyPathType: "LEGACY_PATH_ANTIQUITY_MILITARY", RequiredPathPoints: n, FinalMilestone: i === 2 }));
    const tables = { LegacyPaths: GameInfo.LegacyPaths, AgeProgressionMilestones: GameInfo.AgeProgressionMilestones };
    GameInfo.LegacyPaths = LP;
    GameInfo.AgeProgressionMilestones = MS;
    Players.get(0).LegacyPaths = { getScore: () => 5, getEnabledLegacyPaths: () => [] };
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 26, y: 9, rank: 1 }] } } });
    try {
        fake.sent.length = 0;
        assert.deepEqual(steps.buySettlers(createBudget({ gold: 2000, reserve: 0 }), []), []);
    } finally {
        GameInfo.LegacyPaths = tables.LegacyPaths;
        GameInfo.AgeProgressionMilestones = tables.AgeProgressionMilestones;
        delete Players.get(0).LegacyPaths;
    }
});

test("a legacy path near its first milestone does not move the research (the codices' path counts nothing: games 42-43)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const tables = { LegacyPaths: GameInfo.LegacyPaths, AgeProgressionMilestones: GameInfo.AgeProgressionMilestones };
    const prereqs = GameInfo.ProgressionTreePrereqs;
    GameInfo.ProgressionTreePrereqs = [];
    world.research = { tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] }, depth: { NODE_TECH_AQ_MASONRY: 1 } };
    world.treeRecs = () => [{ recommendedType: N("NODE_TECH_AQ_POTTERY"), whichAdvisors: [] }];
    world.cities[0].gwBuildings = [{ type: "BUILDING_LIBRARY", slots: [-1, -1] }]; // room for codices
    GameInfo.LegacyPaths = [{ LegacyPathType: "LP_AQ_SCIENCE", LegacyPathClassType: "LEGACY_PATH_CLASS_SCIENCE", EnabledByDefault: true }];
    GameInfo.AgeProgressionMilestones = [3, 6, 10].map((n, i) => ({ LegacyPathType: "LP_AQ_SCIENCE", RequiredPathPoints: n, FinalMilestone: i === 2 }));
    Players.get(0).LegacyPaths = { getScore: () => 1, getEnabledLegacyPaths: () => [] };
    const turn = Game.turn;
    const chosen = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);
    try {
        Game.turn = turn + 1;
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "CULTURE");
        assert.deepEqual(chosen(), ["NODE_TECH_AQ_POTTERY"], "the advisor's, not a codex's");
    } finally {
        Game.turn = turn;
        GameInfo.LegacyPaths = tables.LegacyPaths;
        GameInfo.AgeProgressionMilestones = tables.AgeProgressionMilestones;
        GameInfo.ProgressionTreePrereqs = prereqs;
        delete Players.get(0).LegacyPaths;
        delete world.research;
        delete world.treeRecs;
        delete world.cities[0].gwBuildings;
    }
});

/** Our triumphs for a test: GameInfo.Legacies rows and the player's Legacies, as data/xpl-victory.js triumphs() reads them. */
function withTriumphs(list, fn) {
    const legacies = GameInfo.Legacies;
    GameInfo.Legacies = list.map((t) => ({ LegacyType: t.type, Name: t.name, FirstPlayerOnly: !!t.lost }));
    const by = new Map(list.map((t) => [t.type, t]));
    Players.get(0).Legacies = {
        isValidLegacy: (t) => by.has(t),
        getProgress: (t) => ({ progress: [{ current: by.get(t).current, total: by.get(t).total }], raceWinner: by.get(t).lost ? 3 : -1 }),
        isTriggered: (t) => by.get(t).done,
    };
    try {
        return fn();
    } finally {
        GameInfo.Legacies = legacies;
        delete Players.get(0).Legacies;
    }
}

test("the legacy summary for the tab: only in a non-final age's last turns, the triumphs under way, closest first", () => {
    withTriumphs(TRIUMPHS, () => {
        try {
            world.agePoints = 20;
            assert.equal(steps.legacySummary(), null, "far from the end");
            world.agePoints = 96;
            const s = steps.legacySummary();
            assert.ok(s && s.turnsLeft <= 12, JSON.stringify(s));
            assert.deepEqual(s.triumphs, [{ name: "A", current: 12, total: 16 }, { name: "B", current: 1, total: 5 }]);
            world.finalAge = true;
            assert.equal(steps.legacySummary(), null, "the final age: no cards after it");
        } finally {
            delete world.agePoints;
            delete world.finalAge;
        }
    });
});

test("probes: the legacy line carries the triumphs, the settlements and the age's points with our Future research done since the last turn (P-INC-1, P-AGE-1)", () => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    const turn = Game.turn;
    try {
        withTriumphs(TRIUMPHS, () => {
            world.agePoints = 40;
            world.research = { tech: { available: [] }, culture: { available: [] }, depth: {} };
            Game.turn = turn + 10;
            steps.logLegacy();
            world.agePoints = 52;
            world.research.depth.NODE_CIVIC_AQ_MAIN_FUTURE_CIVIC = 1;
            Game.turn = turn + 11;
            steps.logLegacy();
        });
        const line = lines.filter((l) => l.includes("legacy:")).at(-1) ?? "";
        assert.match(line, /triumphs 1 done; LEGACY_EX_A 12\/16/, line);
        assert.match(line, /settlements 5\/6/, line);
        assert.match(line, /age 52\/100 \(\+12 since T\d+; our Future research done: CIVIC_AQ_MAIN_FUTURE_CIVIC 0→1\)/, line);
    } finally {
        console.warn = warn;
        Game.turn = turn;
        delete world.agePoints;
        delete world.research;
    }
});
