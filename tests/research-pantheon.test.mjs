// Game 60 (research/game60 mechanics M3, economy E6): the pantheon came at T77, last of 10, because Mysticism was invisible to
// research; Code of Laws' policy slot waited behind it; the culture path researched Discipline and Tactics for wonders it never
// raced; and Entertainment, which switches on the celebrations' culture points, came at A94.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { PANTHEON_WORTH, pantheonWorth, pickStructural, structureKinds, structureValue } from "../mod/expansion-planner/ui/core/xpl-research-value.js";
import { wantedResearch } from "../mod/expansion-planner/ui/core/xpl-victory-levers.js";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", owner: 0 }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, x: 5, y: 5, name: "Moscow", prod: 5 }, { owner: 1, x: 15, y: 5, name: "Babylon" }],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100),
    canBuild: (type) => (type.startsWith("WONDER_") ? { Success: false, Plots: [], FailureReasons: ["LOC_XPL_TEST_LOCKED"] } : undefined),
    research: { tech: { available: [] }, culture: { available: [] } },
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { runWonderPlanner } = await import("../mod/expansion-planner/ui/data/xpl-wonder-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const chosen = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_CULTURE_TREE_NODE).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);
const CULTURE = { ...DEFAULT_SETTINGS, profile: "CULTURE" };
const c = (nodeType, turns, targets, opens) => ({ node: nodeType, nodeType, turns, targets, opens });
// Pantheons as the game lists them: 10 exclusive, 17 shareable (age-antiquity religion.xml).
const pantheons = [{ BeliefType: "PANTHEON_BONUS_10", BeliefClassType: "BELIEF_CLASS_PANTHEON" }, { BeliefType: "PANTHEON_BONUS_17", BeliefClassType: "BELIEF_CLASS_PANTHEON", Shareable: "true" }];
const withBeliefs = (claimable, fn) => {
    const before = { beliefs: GameInfo.Beliefs, religion: Game.Religion };
    GameInfo.Beliefs = { filter: (f) => pantheons.filter(f), find: (f) => pantheons.find(f), [Symbol.iterator]: () => pantheons[Symbol.iterator]() };
    Game.Religion = { isBeliefClaimable: (t) => claimable.includes(t) };
    try {
        return fn();
    } finally {
        GameInfo.Beliefs = before.beliefs;
        Game.Religion = before.religion;
    }
};

test("core: the pantheon's unlock is structural: 2 while an exclusive one is left, 1 for the shareable ones, 0 once ours", () => {
    assert.deepEqual(structureKinds(["TRADITION_PRIESTHOOD", "BUILDING_ALTAR", "MOD_PANTHEON_UNLOCK"]), ["PANTHEON"]);
    assert.deepEqual(structureKinds(["MOD_X"], () => "EFFECT_PLAYER_UNLOCK_PANTHEON"), ["PANTHEON"]);
    assert.equal(pantheonWorth({ exclusiveFree: true }), PANTHEON_WORTH.EXCLUSIVE);
    assert.equal(pantheonWorth({ exclusiveFree: false, anyFree: true }), PANTHEON_WORTH.SHAREABLE);
    assert.equal(pantheonWorth({ have: true, exclusiveFree: true }), PANTHEON_WORTH.NONE);
    const mysticism = c("MYSTICISM", 6, ["TRADITION_PRIESTHOOD", "BUILDING_ALTAR", "MOD_PANTHEON_UNLOCK"]);
    const discipline = c("DISCIPLINE", 6, ["WONDER_DUR_SHARRUKIN"]);
    const slot = c("ORGANIZED", 5, ["MOD_TOT_TRADITION_SLOT"]);
    assert.equal(pickStructural([discipline, mysticism, slot], { pantheon: 2 }).nodeType, "MYSTICISM", "an exclusive pantheon left beats a slot");
    assert.equal(pickStructural([discipline, mysticism, slot], { pantheon: 0 }).nodeType, "ORGANIZED", "ours founded: nothing for the pantheon");
    assert.equal(structureValue(["PANTHEON"], { pantheon: 0 }), 0);
});

test("core: a node's value adds the gains of the nodes it is the last prerequisite of (Mysticism opens Code of Laws' slot)", () => {
    const codeOfLaws = { nodeType: "CODE_OF_LAWS", targets: ["MOD_TOT_TRADITION_SLOT", "UNIT_MERCHANT"], turns: 6 };
    const discipline = c("DISCIPLINE", 6, ["WONDER_DUR_SHARRUKIN"], [codeOfLaws]);
    const pick = pickStructural([discipline, c("POTTERY_ISH", 6, [])], {});
    assert.equal(pick.nodeType, "DISCIPLINE");
    assert.deepEqual(pick.kinds, ["SLOT"]);
    const mysticism = c("MYSTICISM", 6, ["MOD_PANTHEON_UNLOCK"], [codeOfLaws]);
    const both = pickStructural([mysticism], { pantheon: 2 });
    assert.equal(both.value, 3, "the pantheon and the slot it opens");
    assert.deepEqual(both.kinds, ["PANTHEON", "SLOT"]);
    assert.ok(both.score > 2 / 6 && both.score < 3 / 6, "the opened slot counts over both nodes' turns");
});

test("Mysticism goes first while a pantheon is left (game 60: Discipline at A8 for a wonder never raced); once ours, it does not", () => {
    world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_AQ_MAIN_DISCIPLINE"), N("NODE_CIVIC_AQ_MAIN_MYSTICISM")] }, depth: { NODE_CIVIC_AQ_MAIN_CHIEFDOM: 1 } };
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_AQ_MAIN_DISCIPLINE"), whichAdvisors: [] }];
    try {
        withBeliefs(["PANTHEON_BONUS_10", "PANTHEON_BONUS_17"], () => {
            fake.sent.length = 0;
            const r = steps.chooseResearch("culture", CULTURE, "CULTURE");
            assert.deepEqual(chosen(), ["NODE_CIVIC_AQ_MAIN_MYSTICISM"], JSON.stringify(r));
            assert.equal(r.key, "STRUCTURAL_CIVIC");
            assert.match(r.args[1], /LOC_XPL_AP_STRUCT_PANTHEON/);
            world.pantheons = [Database.makeHash("PANTHEON_BONUS_17")];
            fake.sent.length = 0;
            const again = steps.chooseResearch("culture", CULTURE, "CULTURE");
            assert.notEqual(again?.key, "STRUCTURAL_CIVIC", JSON.stringify(again));
        });
    } finally {
        delete world.pantheons;
        delete world.treeRecs;
    }
});

test("with Discipline done, Mysticism also brings Code of Laws' policy slot within reach", () => {
    world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_AQ_MAIN_MYSTICISM")] }, depth: { NODE_CIVIC_AQ_MAIN_CHIEFDOM: 1, NODE_CIVIC_AQ_MAIN_DISCIPLINE: 1 } };
    try {
        withBeliefs(["PANTHEON_BONUS_17"], () => {
            fake.sent.length = 0;
            const r = steps.chooseResearch("culture", CULTURE, "CULTURE");
            assert.equal(r?.key, "STRUCTURAL_CIVIC", JSON.stringify(r));
            assert.match(r.args[1], /LOC_XPL_AP_STRUCT_PANTHEON.*LOC_XPL_AP_STRUCT_SLOT/);
        });
        // Our pantheon founded: Mysticism is structural for the slot it opens alone.
        world.pantheons = [Database.makeHash("PANTHEON_BONUS_17")];
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", CULTURE, "CULTURE");
        assert.equal(r?.key, "STRUCTURAL_CIVIC", JSON.stringify(r));
        assert.doesNotMatch(r.args[1], /PANTHEON/);
        assert.match(r.args[1], /LOC_XPL_AP_STRUCT_SLOT/);
    } finally {
        delete world.pantheons;
    }
});

test("the wonder planner rates a locked wonder by the race its unlock would start; the culture path researches only for a race of ours", () => {
    // Moscow makes 5 production: Dur-Sharrukin (300) would take 60 turns, a race lost (game 60's A23 line: LOW).
    let w = runWonderPlanner({ ...CULTURE });
    const row = w.rows.find((r) => r.type === "WONDER_DUR_SHARRUKIN");
    assert.equal(row.status, "LOCKED");
    assert.equal(row.unlockRace.label, "LOW");
    world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_AQ_MAIN_DISCIPLINE")] }, depth: { NODE_CIVIC_AQ_MAIN_CHIEFDOM: 1 } };
    world.pantheons = [Database.makeHash("PANTHEON_BONUS_17")];
    world.treeRecs = () => [];
    try {
        fake.sent.length = 0;
        let r = steps.chooseResearch("culture", CULTURE, "CULTURE");
        // Not for the wonder itself (at most on the way to another goal of the path, named after the arrow).
        assert.ok(!(r?.key === "VICTORY_CIVIC" && r.args[0] === "LOC_CIVIC_DISCIPLINE_NAME"), JSON.stringify(r));
        // A city making 40: 8 turns, nobody seen building it: HIGH, the path's research.
        world.cities[0].prod = 40;
        w = runWonderPlanner({ ...CULTURE });
        assert.equal(w.rows.find((x) => x.type === "WONDER_DUR_SHARRUKIN").unlockRace.label, "HIGH");
        fake.sent.length = 0;
        r = steps.chooseResearch("culture", CULTURE, "CULTURE");
        assert.deepEqual([r?.key, r?.args[0]], ["VICTORY_CIVIC", "LOC_CIVIC_DISCIPLINE_NAME"], "for Dur-Sharrukin itself");
        assert.deepEqual(chosen(), ["NODE_CIVIC_AQ_MAIN_DISCIPLINE"]);
    } finally {
        world.cities[0].prod = 5;
        delete world.pantheons;
        delete world.treeRecs;
        state.set({ results: { ...state.get().results, wonders: null } });
    }
});

test("E6: the culture path researches what switches on the celebrations' culture points (Entertainment)", () => {
    assert.ok(wantedResearch("CULTURE", { targets: ["MOD_AQ_ENTERTAINMENT_CELEBRATION_VP"] }));
    assert.ok(!wantedResearch("SCIENCE", { targets: ["MOD_AQ_ENTERTAINMENT_CELEBRATION_VP"] }));
    // By the game's own tables: any modifier that activates a tracker scoring the focus's victory (here under a name the
    // regular expression does not know).
    const before = { m: GameInfo.Modifiers, d: GameInfo.DynamicModifiers, a: GameInfo.ModifierArguments, s: GameInfo.VictoryScorings, v: GameInfo.Victories, u: GameInfo.ProgressionTreeNodeUnlocks };
    const table = (rows) => ({ filter: (f) => rows.filter(f), find: (f) => rows.find(f), lookup: (k) => rows.find((r) => r.VictoryType === k), [Symbol.iterator]: () => rows[Symbol.iterator](), length: rows.length });
    GameInfo.ProgressionTreeNodeUnlocks = table(Array.from(before.u, (r) => (r.TargetType === "MOD_AQ_ENTERTAINMENT_CELEBRATION_VP" ? { ...r, TargetType: "MOD_TEST_CELEBRATIONS" } : r)));
    GameInfo.Modifiers = table([{ ModifierId: "MOD_TEST_CELEBRATIONS", ModifierType: "MODTYPE_TRACKER" }]);
    GameInfo.DynamicModifiers = table([{ ModifierType: "MODTYPE_TRACKER", EffectType: "EFFECT_PLAYER_ACTIVATE_VICTORY_POINT_TRACKER" }]);
    GameInfo.ModifierArguments = table([{ ModifierId: "MOD_TEST_CELEBRATIONS", Name: "TrackerName", Value: "VICTORY_TRACKER_CELEBRATIONS_ANTIQUITY" }]);
    GameInfo.VictoryScorings = table([{ VictoryType: "VICTORY_CULTURE_MODERN", ScoringId: "VICTORY_TRACKER_CELEBRATIONS_ANTIQUITY" }]);
    GameInfo.Victories = table([{ VictoryType: "VICTORY_CULTURE_MODERN", VictoryClassType: "VICTORY_CLASS_CULTURE" }]);
    world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_AQ_MAIN_ENTERTAINMENT"), N("NODE_CIVIC_AQ_MAIN_CITIZENSHIP")] }, turns: { NODE_CIVIC_AQ_MAIN_ENTERTAINMENT: 8, NODE_CIVIC_AQ_MAIN_CITIZENSHIP: 4 } };
    world.pantheons = [Database.makeHash("PANTHEON_BONUS_17")];
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_AQ_MAIN_CITIZENSHIP"), whichAdvisors: [] }];
    // Both nodes' wonders are built elsewhere: only the celebrations make Entertainment the path's research.
    state.set({ results: { ...state.get().results, wonders: { rows: ["WONDER_COLOSSEUM", "WONDER_EMILE_BELL"].map((type) => ({ type, status: "BUILT", race: { label: "NONE" } })) } } });
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", CULTURE, "CULTURE");
        assert.equal(r?.key, "VICTORY_CIVIC", JSON.stringify(r));
        assert.deepEqual(chosen(), ["NODE_CIVIC_AQ_MAIN_ENTERTAINMENT"]);
    } finally {
        state.set({ results: { ...state.get().results, wonders: null } });
        Object.assign(GameInfo, { Modifiers: before.m, DynamicModifiers: before.d, ModifierArguments: before.a, VictoryScorings: before.s, Victories: before.v, ProgressionTreeNodeUnlocks: before.u });
        delete world.pantheons;
        delete world.treeRecs;
    }
});
