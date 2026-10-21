// Research for its policy cards. The user, game 44 (Exploration T53): Reformation, 2 turns away, unlocks Religious Orders
// (+32 Culture, +52 Happiness in our settlements following our religion) and Rationalism (+19 Gold, +10 Science), each
// worth more than the weakest cards slotted; the culture focus walked the main tree toward Future Civic and Reformation, a
// branch civic the game's advisor never names, came last (E61).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { CARD_GAIN_MIN, cardSwapGain, pickCardResearch, swapWorth } from "../mod/expansion-planner/ui/core/xpl-research-value.js";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 3, y: 5, name: "Rouen" }, { owner: 0, x: 9, y: 5, name: "Dover", isTown: true }],
    settlementCap: 20,
};
const fake = installFakeEngine(world, "exploration");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const chosen = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_CULTURE_TREE_NODE).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);

test("core: new cards against the weakest they may replace (a policy card a tradition slot too, a tradition card only a tradition slot)", () => {
    const P = (type, value) => ({ type, value, slot: "POLICY" });
    const T = (type, value) => ({ type, value, slot: "TRADITION" });
    let r = cardSwapGain([P("A", 40), P("B", 12)], [P("X", 5), P("Y", 30), T("t", 3)]);
    assert.deepEqual(r.pairs.map((p) => [p.card.type, p.out.type]), [["A", "t"], ["B", "X"]]);
    assert.equal(r.gain, 37 + 7);
    r = cardSwapGain([T("C", 10)], [P("X", 1), T("t", 6)]);
    assert.deepEqual(r.pairs.map((p) => [p.card.type, p.out.type]), [["C", "t"]], "a tradition card only into a tradition slot");
    assert.equal(cardSwapGain([P("A", 10)], [P("X", 9)]).gain, 0, "a swap the policy step would not make (less than 2)");
    assert.ok(!swapWorth(10, 50) && swapWorth(13, 50), "and at least a quarter of the card taken out");
    r = cardSwapGain([P("A", 5)], [P("X", null)], { POLICY: 1 });
    assert.deepEqual(r.pairs.map((p) => [p.card.type, p.out.type]), [["A", null]], "a free slot counts 0; a card of unknown value stays");
    assert.equal(cardSwapGain([P("A", -3)], [], { POLICY: 1 }).gain, 0, "a card worth less than nothing wins nothing");
});

test("core: the node whose cards win the most a turn of research, at least CARD_GAIN_MIN, slotted long enough before the age ends", () => {
    const c = (nodeType, turns, gain, repeat = false) => ({ node: nodeType, nodeType, turns, targets: [], repeat, gain });
    const gainOf = (x) => (x.gain === null ? null : { gain: x.gain, pairs: [] });
    const list = [c("R", 2, 60), c("S", 1, 25), c("F", 1, 99, true), c("W", 1, CARD_GAIN_MIN - 1), c("N", 1, null)];
    assert.equal(pickCardResearch(list, gainOf).nodeType, "R", "30 a turn of research beats 25; a repeatable node never");
    assert.equal(pickCardResearch(list, gainOf, { turnsLeft: 6 }).nodeType, "S", "R's cards would be slotted for 4 turns");
    assert.equal(pickCardResearch([c("W", 1, CARD_GAIN_MIN - 1), c("N", 1, null)], gainOf), null);
    assert.equal(pickCardResearch([c("R", 40, 60), c("P", 5, null), c("Q", 5, null)], gainOf), null, "far slower than the other nodes");
});

// The game's numbers for the cards (Policy Yield Previews, which previews a card not unlocked yet as its civic tooltips do).
const CARDS = [
    { TraditionType: "TRADITION_RATIONALISM", Name: "LOC_TRADITION_RATIONALISM_NAME", CultureSlotType: "POLICY_CULTURE_SLOT", yields: { YIELD_GOLD: 19, YIELD_SCIENCE: 10 } },
    { TraditionType: "TRADITION_RELIGIOUS_ORDERS", Name: "LOC_TRADITION_RELIGIOUS_ORDERS_NAME", CultureSlotType: "POLICY_CULTURE_SLOT", yields: { YIELD_CULTURE: 32, YIELD_HAPPINESS: 52 } },
    { TraditionType: "TRADITION_COMMUNE", Name: "LOC_TRADITION_COMMUNE_NAME", CultureSlotType: "POLICY_CULTURE_SLOT", yields: { YIELD_GOLD: 6 } },
    { TraditionType: "TRADITION_POESIS", Name: "LOC_TRADITION_POESIS_NAME", CultureSlotType: "POLICY_CULTURE_SLOT", yields: { YIELD_CULTURE: 9 } },
    { TraditionType: "TRADITION_PATRONAGE", Name: "LOC_TRADITION_PATRONAGE_NAME", CultureSlotType: "POLICY_CULTURE_SLOT", yields: { YIELD_CULTURE: 60 } },
];
const rows = CARDS.map((c, i) => ({ ...c, $index: i, $hash: 500 + i }));
const card = (t) => rows.find((r) => r.TraditionType === t);
const slotted = new Set(["TRADITION_COMMUNE", "TRADITION_POESIS", "TRADITION_PATRONAGE"]);
const unlocked = new Set(slotted);

function withCards(fn) {
    const traditions = GameInfo.Traditions;
    const culture = Players.get(0).Culture;
    GameInfo.Traditions = { lookup: (h) => rows.find((r) => r.$hash === h || r.TraditionType === h) ?? null };
    Object.assign(culture, {
        getNumCultureSlots: (t) => (t === CultureSlotTypes.POLICY_CULTURE_SLOT ? 3 : 0),
        getActiveTraditions: (t) => (t === CultureSlotTypes.POLICY_CULTURE_SLOT ? rows.filter((r) => slotted.has(r.TraditionType)).map((r) => r.$hash) : []),
        getUnlockedTraditions: (t) => (t === CultureSlotTypes.POLICY_CULTURE_SLOT ? rows.filter((r) => unlocked.has(r.TraditionType)).map((r) => r.$hash) : []),
        isTraditionActive: (h) => rows.some((r) => r.$hash === h && slotted.has(r.TraditionType)),
    });
    globalThis.LfYieldsPreview = { previewPolicyYields: ({ TraditionType }) => ({ isValid: true, yields: card(TraditionType)?.yields ?? {} }) };
    world.research = {
        tech: { available: [] },
        culture: { available: [N("NODE_CIVIC_EX_BRANCH_REFORMATION"), N("NODE_CIVIC_EX_MAIN_SOCIAL_CLASS")] },
        turns: { NODE_CIVIC_EX_BRANCH_REFORMATION: 2, NODE_CIVIC_EX_MAIN_SOCIAL_CLASS: 3 },
    };
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_EX_MAIN_SOCIAL_CLASS"), whichAdvisors: [] }];
    try {
        fn();
    } finally {
        GameInfo.Traditions = traditions;
        for (const k of ["getNumCultureSlots", "getActiveTraditions", "getUnlockedTraditions", "isTraditionActive"]) delete culture[k];
        delete globalThis.LfYieldsPreview;
        delete world.research;
        delete world.treeRecs;
    }
}

test("game 44: Reformation for Religious Orders and Rationalism before the culture focus's walk toward Future Civic", () => {
    withCards(() => {
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_BRANCH_REFORMATION"], JSON.stringify(r));
        assert.equal(r.key, "CARD_CIVIC");
        assert.match(r.args[1], /RELIGIOUS_ORDERS.*RATIONALISM/, "the better card first");
        assert.ok(r.args[2] >= CARD_GAIN_MIN);
        // No focus: before the advisor's pick too.
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_BRANCH_REFORMATION"]);
    });
});

test("the path's research first when the card civic is slower, or its cards win little over those slotted", () => {
    withCards(() => {
        world.research.turns.NODE_CIVIC_EX_BRANCH_REFORMATION = 6;
        fake.sent.length = 0;
        let r = steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_SOCIAL_CLASS"], JSON.stringify(r));
        assert.equal(r.key, "VICTORY_CIVIC");
        world.research.turns.NODE_CIVIC_EX_BRANCH_REFORMATION = 2;
        // Both cards unlocked already (nothing new), then every card slotted strong.
        unlocked.add("TRADITION_RELIGIOUS_ORDERS");
        unlocked.add("TRADITION_RATIONALISM");
        try {
            fake.sent.length = 0;
            steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
            assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_SOCIAL_CLASS"], "no new card");
        } finally {
            unlocked.delete("TRADITION_RELIGIOUS_ORDERS");
            unlocked.delete("TRADITION_RATIONALISM");
        }
        const yields = CARDS.map((c) => c.yields);
        for (const r2 of rows) if (slotted.has(r2.TraditionType)) r2.yields = { YIELD_CULTURE: 500 };
        try {
            fake.sent.length = 0;
            steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
            assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_SOCIAL_CLASS"], "the cards slotted are worth more");
        } finally {
            rows.forEach((r2, i) => { r2.yields = yields[i]; });
        }
    });
});

test("without Policy Yield Previews no card has a value: the path's research as before", () => {
    withCards(() => {
        delete globalThis.LfYieldsPreview;
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_SOCIAL_CLASS"]);
    });
});
