// Game 60, A89 (research/game60 mechanics M9): «Совершенствование» offered an attribute point (LEADER_CHAIN_1041B, a quest: an
// Amphitheater) and +25% production toward Ancient Walls (1041C); the autopilot took the walls because its YIELD_PRODUCTION icon
// counted a full production weight and the ATTRIBUTE icon 0.5. Options are valued by their rewards' modifiers, icons only as
// the fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 20, height: 10, wrapX: false, tiles: () => ({ terrain: "TERRAIN_FLAT" }), players: [{ id: 0 }],
    cities: [{ owner: 0, x: 2, y: 2, name: "Moscow", prod: 10 }],
};
const fake = installFakeEngine(world);
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const stories = [
    { NarrativeStoryType: "LEADER_CHAIN_1041A", Name: "LOC_1041A", StoryTitle: "LOC_1041A_TITLE" },
    { NarrativeStoryType: "LEADER_CHAIN_1041B", Activation: "LINKED", IsQuest: "TRUE" },
    { NarrativeStoryType: "LEADER_CHAIN_1041C", Activation: "LINKED" },
];
const mods = [
    { id: "M_B", effect: "EFFECT_PLAYER_ATTRIBUTE", args: { AttributeType: "ATTRIBUTE_SCIENTIFIC", Amount: 1 } },
    { id: "M_B2", effect: "EFFECT_PLAYER_GRANT_NARRATIVE_TAG", args: { NarrativeTagType: "NARRATIVE_TAG_LEADER_CHAIN_A", Amount: 1 } },
    { id: "M_C", effect: "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION", args: { Percent: 25, ConstructibleType: "BUILDING_ANCIENT_WALLS" } },
];
const tables = {
    NarrativeStories: { lookup: (t) => stories.find((s) => s.NarrativeStoryType === t) ?? null },
    NarrativeStory_Links: [
        { FromNarrativeStoryType: "LEADER_CHAIN_1041A", ToNarrativeStoryType: "LEADER_CHAIN_1041C" },
        { FromNarrativeStoryType: "LEADER_CHAIN_1041A", ToNarrativeStoryType: "LEADER_CHAIN_1041B" },
    ],
    NarrativeRewardIcons: [
        { NarrativeStoryType: "LEADER_CHAIN_1041B", RewardIconType: "QUEST" }, { NarrativeStoryType: "LEADER_CHAIN_1041B", RewardIconType: "ATTRIBUTE_SCIENTIFIC" },
        { NarrativeStoryType: "LEADER_CHAIN_1041C", RewardIconType: "YIELD_PRODUCTION" },
    ],
    NarrativeStory_Rewards: [
        { NarrativeStoryType: "LEADER_CHAIN_1041B", NarrativeRewardType: "R_B" }, { NarrativeStoryType: "LEADER_CHAIN_1041B", NarrativeRewardType: "R_B2" },
        { NarrativeStoryType: "LEADER_CHAIN_1041C", NarrativeRewardType: "R_C" },
    ],
    NarrativeRewards: [{ NarrativeRewardType: "R_B", ModifierID: "M_B" }, { NarrativeRewardType: "R_B2", ModifierID: "M_B2" }, { NarrativeRewardType: "R_C", ModifierID: "M_C" }],
    Modifiers: mods.map((m) => ({ ModifierId: m.id, ModifierType: `MT_${m.id}` })),
    DynamicModifiers: mods.map((m) => ({ ModifierType: `MT_${m.id}`, EffectType: m.effect })),
    ModifierArguments: mods.flatMap((m) => Object.entries(m.args).map(([Name, Value]) => ({ ModifierId: m.id, Name, Value: String(Value) }))),
};
const before = Object.fromEntries(Object.keys(tables).map((k) => [k, GameInfo[k]]));
const answer = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION).map((s) => s.args.TargetType);
const ask = (settings = DEFAULT_SETTINGS) => {
    fake.sent.length = 0;
    return choices.chooseStory(new Set(), settings);
};

test("an attribute point (a quest's, halved) beats +25% production toward walls nobody builds much", () => {
    Object.assign(GameInfo, tables);
    Players.get(0).Stories = { getFirstPendingMetId: () => ({ owner: 0, id: 21, type: 3 }), find: () => ({ type: "LEADER_CHAIN_1041A" }), canAfford: () => true, determineRequisiteLink: () => false };
    try {
        ask();
        assert.deepEqual(answer(), ["LEADER_CHAIN_1041B"]);
        // Walls queued in a city with the age near its end: the +25% is worth that share of their cost a turn.
        const city = world.cities[0];
        city.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 6 };
        world.costOf = (t) => (t === "BUILDING_ANCIENT_WALLS" ? 1000 : undefined);
        world.agePoints = 99;
        ask();
        assert.deepEqual(answer(), ["LEADER_CHAIN_1041C"], "250 production toward the walls queued, over the age's last turns");
    } finally {
        Object.assign(GameInfo, before);
        delete Players.get(0).Stories;
        delete world.cities[0].queue;
        delete world.costOf;
        delete world.agePoints;
    }
});

test("without reward modifiers the icons decide as before", () => {
    Object.assign(GameInfo, { ...tables, NarrativeStory_Rewards: [], NarrativeRewards: [] });
    Players.get(0).Stories = { getFirstPendingMetId: () => ({ owner: 0, id: 22, type: 3 }), find: () => ({ type: "LEADER_CHAIN_1041A" }), canAfford: () => true, determineRequisiteLink: () => false };
    try {
        ask();
        assert.deepEqual(answer(), ["LEADER_CHAIN_1041C"], "a production icon (≈1) over an attribute icon (0.5)");
    } finally {
        Object.assign(GameInfo, before);
        delete Players.get(0).Stories;
    }
});

test("a quest valued by its icons alone counts at the quest's share too, as one valued by its rewards", () => {
    // The first build halved a quest only when an attribute or production modifier valued it: a quest of yield icons
    // counted in full against an option paid at once.
    const quest = { NarrativeStoryType: "QUEST_Q", Activation: "LINKED", IsQuest: "TRUE" };
    const now = { NarrativeStoryType: "NOW_R", Activation: "LINKED" };
    Object.assign(GameInfo, {
        ...tables,
        NarrativeStories: { lookup: (t) => [...stories, quest, now].find((s) => s.NarrativeStoryType === t) ?? null },
        NarrativeStory_Links: [
            { FromNarrativeStoryType: "LEADER_CHAIN_1041A", ToNarrativeStoryType: "QUEST_Q" },
            { FromNarrativeStoryType: "LEADER_CHAIN_1041A", ToNarrativeStoryType: "NOW_R" },
        ],
        NarrativeRewardIcons: [
            ...["YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_GOLD"].map((t) => ({ NarrativeStoryType: "QUEST_Q", RewardIconType: t })),
            ...["YIELD_PRODUCTION", "YIELD_GOLD"].map((t) => ({ NarrativeStoryType: "NOW_R", RewardIconType: t })),
        ],
        NarrativeStory_Rewards: [],
        NarrativeRewards: [],
    });
    Players.get(0).Stories = { getFirstPendingMetId: () => ({ owner: 0, id: 23, type: 3 }), find: () => ({ type: "LEADER_CHAIN_1041A" }), canAfford: () => true, determineRequisiteLink: () => false };
    try {
        ask();
        assert.deepEqual(answer(), ["NOW_R"], "Production + Gold now over half of Production + 2 Gold later");
    } finally {
        Object.assign(GameInfo, before);
        delete Players.get(0).Stories;
    }
});
