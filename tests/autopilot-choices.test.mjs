// Autopilot choices: empty policy slots get the card worth most by Policy Yield Previews'
// numbers (its LfYieldsPreview global), crisis slots the least bad card, a celebration the
// best bonus, a story the AI's preferred option; without the mod the first offered card
// still fills the slot. Nothing is requested twice while the game has not answered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = { width: 10, height: 10, wrapX: false, tiles: () => ({ terrain: "TERRAIN_FLAT" }), players: [{ id: 0 }], cities: [] };
const fake = installFakeEngine(world);
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

// Cards: index = $index; hash = 100 + index.
const CARDS = [
    { TraditionType: "TRADITION_GOLD", Name: "Gold card", slot: 2, yields: { YIELD_GOLD: 6 } },
    { TraditionType: "TRADITION_SCIENCE", Name: "Science card", slot: 2, yields: { YIELD_SCIENCE: 8 } },
    { TraditionType: "TRADITION_CIV", Name: "Civ tradition", slot: 1, yields: { YIELD_CULTURE: 3 } },
    { TraditionType: "CRISIS_BAD", Name: "Bad crisis", slot: 3, yields: { YIELD_FOOD: -10 } },
    { TraditionType: "CRISIS_MILD", Name: "Mild crisis", slot: 3, yields: { YIELD_GOLD: -2 } },
    { TraditionType: "TRADITION_WEAK", Name: "Weak card", slot: 2, yields: { YIELD_GOLD: 0 } },
];
const rows = CARDS.map((c, i) => ({ ...c, $index: i, $hash: 100 + i }));
GameInfo.Traditions = { lookup: (h) => rows.find((r) => r.$hash === h || r.TraditionType === h) ?? null };
const slots = { 1: 0, 2: 0, 3: 0 };
const active = new Set();
const culture = Players.get(0).Culture;
Object.assign(culture, {
    getNumCultureSlots: (t) => slots[t] ?? 0,
    getActiveTraditions: (t) => rows.filter((r) => active.has(r.$hash) && r.slot === t).map((r) => r.$hash),
    getUnlockedTraditions: (t) => rows.filter((r) => r.slot === t).map((r) => r.$hash),
    isTraditionActive: (h) => active.has(h),
});
Game.PlayerOperations.canStart = () => ({ Success: true });
const sendRequest = Game.PlayerOperations.sendRequest;
Game.PlayerOperations.sendRequest = (pid, op, args) => {
    if (op === PlayerOperationTypes.CHANGE_TRADITION) active.add(rows[args.TraditionType].$hash);
    return sendRequest(pid, op, args);
};
const installPreviews = () => {
    globalThis.LfYieldsPreview = {
        previewPolicyYields: ({ TraditionType }) => ({ isValid: true, yields: rows.find((r) => r.TraditionType === TraditionType).yields }),
        previewModifierByIds: (ids) => ({ isValid: true, yields: ids.includes("MOD_SCIENCE") ? { YIELD_SCIENCE: 5 } : { YIELD_GOLD: 1 } }),
    };
};
const reset = () => {
    active.clear();
    fake.sent.length = 0;
};
const chosen = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CHANGE_TRADITION).map((s) => rows[s.args.TraditionType].TraditionType);

test("with Policy Yield Previews: the card worth most by the chosen priority", () => {
    installPreviews();
    reset();
    slots[2] = 1;
    const out = choices.fillOnePolicySlot({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    assert.deepEqual(chosen(), ["TRADITION_SCIENCE"]);
    assert.equal(out[0].key, "POLICY");
    assert.deepEqual(choices.fillOnePolicySlot(DEFAULT_SETTINGS), [], "no empty slot left");
    reset();
    choices.fillOnePolicySlot({ ...DEFAULT_SETTINGS, profile: "GOLD" });
    assert.deepEqual(chosen(), ["TRADITION_GOLD"], "6 gold beats 8 science when gold matters most");
    slots[2] = 0;
});

test("without Policy Yield Previews the first offered card still fills the slot", () => {
    delete globalThis.LfYieldsPreview;
    reset();
    slots[2] = 1;
    choices.fillOnePolicySlot(DEFAULT_SETTINGS);
    assert.deepEqual(chosen(), ["TRADITION_GOLD"]);
    slots[2] = 0;
});

test("a crisis slot takes the least bad card", () => {
    installPreviews();
    reset();
    slots[3] = 1;
    choices.fillOnePolicySlot(DEFAULT_SETTINGS);
    assert.deepEqual(chosen(), ["CRISIS_MILD"]);
    slots[3] = 0;
});

test("policy slots full: the best policy card may take a free tradition slot", () => {
    installPreviews();
    reset();
    active.add(100); // the gold card fills the only policy slot
    slots[1] = 1;
    slots[2] = 1;
    choices.fillOnePolicySlot({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    assert.deepEqual(chosen(), ["TRADITION_SCIENCE"], "8 science beats the 3 culture tradition");
    slots[1] = 0;
    slots[2] = 0;
});

test("one pass fills every empty slot, one card after the game confirms the last", async () => {
    installPreviews();
    reset();
    slots[2] = 2;
    // The game slots the card and fires TraditionChanged a moment later.
    const withConfirm = (pid, op, args) => {
        const r = sendRequest(pid, op, args);
        if (op === PlayerOperationTypes.CHANGE_TRADITION) {
            active.add(rows[args.TraditionType].$hash);
            setTimeout(() => engine.trigger("TraditionChanged", { player: pid }), 10);
        }
        return r;
    };
    const before = Game.PlayerOperations.sendRequest;
    Game.PlayerOperations.sendRequest = withConfirm;
    const out = await choices.makeChoices({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    Game.PlayerOperations.sendRequest = before;
    assert.deepEqual(chosen(), ["TRADITION_SCIENCE", "TRADITION_GOLD"]);
    assert.equal(out.filter((e) => e.key === "POLICY").length, 2);
    slots[2] = 0;
});

test("a slow game (no confirmation): one card per pass, never the same card twice", async () => {
    installPreviews();
    reset();
    slots[2] = 2;
    const before = Game.PlayerOperations.sendRequest;
    Game.PlayerOperations.sendRequest = sendRequest; // requests are logged but not applied
    await choices.makeChoices({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    assert.deepEqual(chosen(), ["TRADITION_SCIENCE"]);
    const sent = new Set();
    choices.fillOnePolicySlot(DEFAULT_SETTINGS, sent);
    choices.fillOnePolicySlot(DEFAULT_SETTINGS, sent);
    const second = chosen().slice(1);
    assert.equal(new Set(second).size, second.length, JSON.stringify(second));
    Game.PlayerOperations.sendRequest = before;
    slots[2] = 0;
});

test("swaps: when the game allows it, the weakest active card makes way for one clearly better", async () => {
    installPreviews();
    reset();
    const H = (t) => rows.find((r) => r.TraditionType === t).$hash;
    slots[2] = 2;
    active.add(H("TRADITION_WEAK"));
    active.add(H("TRADITION_GOLD"));
    let canSwap = false;
    culture.canSwapCultureSlot = () => canSwap;
    // The game applies the change (Deactivate takes the card out) and confirms it a moment later.
    const before = Game.PlayerOperations.sendRequest;
    Game.PlayerOperations.sendRequest = (pid, op, args) => {
        const r = sendRequest(pid, op, args);
        if (op === PlayerOperationTypes.CHANGE_TRADITION) {
            const h = rows[args.TraditionType].$hash;
            if (args.Action === PlayerOperationParameters.Deactivate) active.delete(h);
            else active.add(h);
            setTimeout(() => engine.trigger("TraditionChanged", { player: pid }), 10);
        }
        return r;
    };
    const science = { ...DEFAULT_SETTINGS, profile: "SCIENCE" };
    try {
        assert.deepEqual(choices.swapOnePolicy(science), [], "not while the game does not allow swaps");
        canSwap = true;
        const out = await choices.makeChoices(science);
        const swap = out.find((e) => e.key === "POLICY_SWAP");
        assert.deepEqual([swap?.args[0], swap?.args[2]], ["Weak card", "Science card"], JSON.stringify(out));
        assert.deepEqual([...active].sort(), [H("TRADITION_GOLD"), H("TRADITION_SCIENCE")].sort());
        assert.deepEqual(choices.swapOnePolicy(science), [], "nothing clearly better left");
        // A small gain is not worth a swap: the weak card at 7 science (14) against 8 (16).
        active.clear();
        slots[2] = 1;
        active.add(H("TRADITION_WEAK"));
        const previews = globalThis.LfYieldsPreview;
        globalThis.LfYieldsPreview = { previewPolicyYields: ({ TraditionType }) => ({ isValid: true, yields: TraditionType === "TRADITION_WEAK" ? { YIELD_SCIENCE: 7 } : rows.find((r) => r.TraditionType === TraditionType).yields }) };
        assert.deepEqual(choices.swapOnePolicy(science), []);
        // A card of unknown value is never taken out.
        globalThis.LfYieldsPreview = { previewPolicyYields: ({ TraditionType }) => (TraditionType === "TRADITION_WEAK" ? { isValid: false } : previews.previewPolicyYields({ TraditionType })) };
        assert.deepEqual(choices.swapOnePolicy(science), []);
        globalThis.LfYieldsPreview = previews;
    } finally {
        Game.PlayerOperations.sendRequest = before;
        delete culture.canSwapCultureSlot;
        slots[2] = 0;
        active.clear();
    }
});

test("leader attributes: the node worth most by the priority (unknown values: the focus's tree); every point spent, one after the game confirms", async () => {
    installPreviews();
    reset();
    const BUY = PlayerOperationTypes.BUY_ATTRIBUTE_TREE_NODE;
    const me = Players.get(0);
    me.Identity = { getAvailableAttributePoints: () => 1, getWildcardPoints: () => 0 };
    const open = new Set(["NODE_ATTRIBUTE_ECONOMIC_01", "NODE_ATTRIBUTE_CULTURAL_01", "NODE_ATTRIBUTE_SCIENTIFIC_01"]);
    const typeOf = (n) => GameInfo.ProgressionTreeNodes.lookup(n)?.ProgressionTreeNodeType;
    const canStart = Game.PlayerOperations.canStart;
    Game.PlayerOperations.canStart = (p, op, args) => (op === BUY ? { Success: open.has(typeOf(args.ProgressionTreeNodeType)) } : canStart(p, op, args));
    const previews = globalThis.LfYieldsPreview;
    globalThis.LfYieldsPreview = {
        ...previews,
        previewModifierByIds: (ids) => ({ isValid: true, yields: ids.some((i) => i.includes("SCIENTIFIC")) ? { YIELD_SCIENCE: 10 } : ids.some((i) => i.includes("ECONOMIC")) ? { YIELD_GOLD: 4 } : { YIELD_CULTURE: 2 } }),
    };
    const boughtTypes = () => fake.sent.filter((s) => s.op === BUY).map((s) => typeOf(s.args.ProgressionTreeNodeType));
    const before = Game.PlayerOperations.sendRequest;
    try {
        // Culture priority, yet 10 science is worth more than 2 culture: the value decides.
        let out = choices.buyOneAttribute({ ...DEFAULT_SETTINGS, profile: "CULTURE" });
        assert.deepEqual(boughtTypes(), ["NODE_ATTRIBUTE_SCIENTIFIC_01"]);
        assert.equal(out[0].key, "ATTRIBUTE_BOUGHT");
        reset();
        choices.buyOneAttribute({ ...DEFAULT_SETTINGS, profile: "GOLD" });
        assert.deepEqual(boughtTypes(), ["NODE_ATTRIBUTE_ECONOMIC_01"]);
        // Without the values (no Policy Yield Previews): the focus's tree (not the game's first, Culture).
        delete globalThis.LfYieldsPreview;
        reset();
        choices.buyOneAttribute({ ...DEFAULT_SETTINGS, profile: "GOLD" });
        assert.deepEqual(boughtTypes(), ["NODE_ATTRIBUTE_ECONOMIC_01"]);
        // A pass spends every point the game allows, one after each confirmation.
        Game.PlayerOperations.sendRequest = (pid, op, args) => {
            const r = before(pid, op, args);
            if (op === BUY) {
                open.delete(typeOf(args.ProgressionTreeNodeType));
                setTimeout(() => engine.trigger("AttributeNodeCompleted", { player: pid }), 10);
            }
            return r;
        };
        reset();
        out = await choices.makeChoices({ ...DEFAULT_SETTINGS, profile: "CULTURE" });
        assert.equal(boughtTypes().length, 3, JSON.stringify(out));
        assert.equal(open.size, 0);
    } finally {
        Game.PlayerOperations.sendRequest = before;
        Game.PlayerOperations.canStart = canStart;
        globalThis.LfYieldsPreview = previews;
        delete me.Identity;
    }
});

test("celebration: the bonus worth most by the chosen priority", () => {
    installPreviews();
    reset();
    const ages = [
        { GoldenAgeType: "GOLDEN_AGE_GOLD", Name: "Gold age", $hash: 501 },
        { GoldenAgeType: "GOLDEN_AGE_SCIENCE", Name: "Science age", $hash: 502 },
    ];
    GameInfo.GoldenAges = { lookup: (h) => ages.find((a) => a.$hash === h) ?? null };
    GameInfo.GoldenAgeModifiers = [
        { GoldenAgeType: "GOLDEN_AGE_GOLD", ModifierID: "MOD_GOLD" },
        { GoldenAgeType: "GOLDEN_AGE_SCIENCE", ModifierID: "MOD_SCIENCE" },
    ];
    culture.getGoldenAgeChoices = () => [501, 502];
    // The game offers the choices all the time; only its notification says one is due.
    assert.deepEqual(choices.chooseCelebration({ ...DEFAULT_SETTINGS, profile: "SCIENCE" }), []);
    assert.equal(fake.sent.length, 0);
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_GOLDEN_AGE" }];
    const out = choices.chooseCelebration({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    delete world.notifications;
    const req = fake.sent.find((s) => s.op === PlayerOperationTypes.CHOOSE_GOLDEN_AGE);
    assert.equal(req?.args.GoldenAgeType, Database.makeHash("GOLDEN_AGE_SCIENCE"));
    assert.equal(out[0].key, "CELEBRATION");
    culture.getGoldenAgeChoices = () => [];
});

// Modifier tables as the game has them (GameInfo.Modifiers → DynamicModifiers, ModifierArguments).
const useModifiers = (mods) => {
    GameInfo.Modifiers = mods.map((m) => ({ ModifierId: m.id, ModifierType: `MT_${m.id}` }));
    GameInfo.DynamicModifiers = mods.map((m) => ({ ModifierType: `MT_${m.id}`, EffectType: m.effect }));
    GameInfo.ModifierArguments = mods.flatMap((m) => Object.entries(m.args ?? {}).map(([Name, Value]) => ({ ModifierId: m.id, Name, Value: String(Value) })));
};
const clearModifiers = () => {
    for (const t of ["Modifiers", "DynamicModifiers", "ModifierArguments", "TraditionModifiers", "CityStateBonusModifiers", "CityStateBonuses"]) delete GameInfo[t];
};

test("celebration: a lump grant Policy Yield Previews cannot value counts (Elective Republic's +1000 Science beats a little culture)", () => {
    reset();
    const ages = [
        { GoldenAgeType: "GOLDEN_AGE_ELECTIVE_REPUBLIC_1", Name: "Science", $hash: 511 },
        { GoldenAgeType: "GOLDEN_AGE_ELECTIVE_REPUBLIC_2", Name: "Culture", $hash: 512 },
    ];
    GameInfo.GoldenAges = { lookup: (h) => ages.find((a) => a.$hash === h) ?? null };
    GameInfo.GoldenAgeModifiers = [
        { GoldenAgeType: "GOLDEN_AGE_ELECTIVE_REPUBLIC_1", ModifierID: "MOD_ER_SCIENCE" },
        { GoldenAgeType: "GOLDEN_AGE_ELECTIVE_REPUBLIC_2", ModifierID: "MOD_ER_CULTURE" },
    ];
    useModifiers([
        { id: "MOD_ER_SCIENCE", effect: "EFFECT_PLAYER_GRANT_YIELD", args: { YieldType: "YIELD_SCIENCE", Amount: 1000 } },
        { id: "MOD_ER_CULTURE", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_CULTURE", Amount: 2 } },
    ]);
    const previews = globalThis.LfYieldsPreview;
    // As Policy Yield Previews answers: the lump grant is worth nothing to it.
    globalThis.LfYieldsPreview = { previewModifierByIds: (ids) => ({ isValid: true, yields: ids.includes("MOD_ER_CULTURE") ? { YIELD_CULTURE: 10 } : {} }) };
    culture.getGoldenAgeChoices = () => [511, 512];
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_GOLDEN_AGE" }];
    try {
        choices.chooseCelebration({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        const req = fake.sent.find((s) => s.op === PlayerOperationTypes.CHOOSE_GOLDEN_AGE);
        assert.equal(req?.args.GoldenAgeType, Database.makeHash("GOLDEN_AGE_ELECTIVE_REPUBLIC_1"));
    } finally {
        delete world.notifications;
        culture.getGoldenAgeChoices = () => [];
        globalThis.LfYieldsPreview = previews;
        clearModifiers();
    }
});

test("policies: what Policy Yield Previews cannot value counts too (Public Works, +30% production toward projects, in a Modern science game)", () => {
    installPreviews();
    const card = { TraditionType: "TRADITION_PUBLIC_WORKS", Name: "Public Works", slot: 2, yields: {}, $index: rows.length, $hash: 100 + rows.length };
    rows.push(card);
    GameInfo.TraditionModifiers = [{ TraditionType: "TRADITION_PUBLIC_WORKS", ModifierId: "PUBLIC_WORKS_MOD_PROJECT_PRODUCTION" }];
    useModifiers([{ id: "PUBLIC_WORKS_MOD_PROJECT_PRODUCTION", effect: "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION", args: { Percent: 30 } }]);
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Rome", prod: 100 });
    const age = Game.age;
    Game.age = GameInfo.Ages.lookup("AGE_MODERN").$hash;
    try {
        reset();
        slots[2] = 1;
        choices.fillOnePolicySlot({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(chosen(), ["TRADITION_PUBLIC_WORKS"], "30 production toward the Innovation projects beats 8 science");
        reset();
        choices.fillOnePolicySlot({ ...DEFAULT_SETTINGS, profile: "GOLD" });
        assert.deepEqual(chosen(), ["TRADITION_GOLD"], "economy: projects matter little");
    } finally {
        rows.pop();
        slots[2] = 0;
        world.cities.pop();
        Game.age = age;
        clearModifiers();
    }
});

test("city-state bonus: an effect it attaches counts (Professional Architects: +25% production toward projects)", () => {
    reset();
    const bonuses = [
        { CityStateBonusType: "CS_SCIENCE_YIELD", Name: "Science" },
        { CityStateBonusType: "CS_PROFESSIONAL_ARCHITECTS", Name: "Architects" },
    ];
    GameInfo.CityStateBonuses = bonuses;
    GameInfo.CityStateBonusModifiers = [{ CityStateBonusType: "CS_PROFESSIONAL_ARCHITECTS", ModifierID: "MOD_CS_ARCHITECTS" }];
    useModifiers([
        { id: "MOD_CS_ARCHITECTS", effect: "EFFECT_ATTACH_MODIFIERS", args: { ModifierId: "ATTACH_PROJECT_PRODUCTION" } },
        { id: "ATTACH_PROJECT_PRODUCTION", effect: "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION", args: { Percent: 25 } },
    ]);
    const previews = globalThis.LfYieldsPreview;
    globalThis.LfYieldsPreview = { previewCityStateBonusYields: (t) => ({ isValid: true, yields: t === "CS_SCIENCE_YIELD" ? { YIELD_SCIENCE: 3 } : {} }) };
    const cs = Game.CityStates;
    Game.CityStates = { getCityStateBonusToSelect: () => 7, canHaveBonus: () => true };
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Rome", prod: 100 });
    const age = Game.age;
    Game.age = GameInfo.Ages.lookup("AGE_MODERN").$hash;
    try {
        choices.chooseCityStateBonus({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        const req = fake.sent.find((s) => s.op === PlayerOperationTypes.CHOOSE_CITY_STATE_BONUS);
        assert.equal(req?.args.CityStateBonusType, Database.makeHash("CS_PROFESSIONAL_ARCHITECTS"));
    } finally {
        Game.CityStates = cs;
        Game.age = age;
        world.cities.pop();
        globalThis.LfYieldsPreview = previews;
        clearModifiers();
    }
});

test("a civilization that pays per policy slotted (Ming: -15 Science each, traditions free): no policy worth less than an empty slot, unless the empty slot holds the turn; never dropped into an empty slot", () => {
    installPreviews();
    reset();
    const me = Players.get(0);
    const civ = me.civilizationType;
    const tables = { CivilizationTraits: GameInfo.CivilizationTraits, TraitModifiers: GameInfo.TraitModifiers };
    me.civilizationType = GameInfo.Civilizations.lookup("CIVILIZATION_HAN").$hash;
    GameInfo.CivilizationTraits = [{ CivilizationType: "CIVILIZATION_HAN", TraitType: "TRAIT_TEST_ABILITY" }];
    GameInfo.TraitModifiers = [{ TraitType: "TRAIT_TEST_ABILITY", ModifierId: "TRAIT_MOD_LOSE_SCIENCE_PER_NON_UNIQUE_TRADITION" }];
    useModifiers([{ id: "TRAIT_MOD_LOSE_SCIENCE_PER_NON_UNIQUE_TRADITION", effect: "EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION", args: { YieldType: "YIELD_SCIENCE", Amount: -15, CivUnique: "true", Invert: "true" } }]);
    const own = { TraditionType: "TRADITION_OWN", Name: "Own tradition", slot: 2, TraitType: "TRAIT_HAN", yields: { YIELD_CULTURE: 2 }, $index: rows.length, $hash: 100 + rows.length };
    const H = (t) => rows.find((r) => r.TraditionType === t).$hash;
    const science = { ...DEFAULT_SETTINGS, profile: "SCIENCE" };
    const before = Game.PlayerOperations.sendRequest;
    try {
        // Every policy loses 30 (15 Science x 2): even the 8-science card (16) is worth less than nothing.
        slots[2] = 1;
        assert.deepEqual(choices.fillOnePolicySlot(science), [], "the slot stays empty");
        assert.deepEqual(chosen(), []);
        // The civilization's own tradition costs nothing: it goes in.
        rows.push(own);
        choices.fillOnePolicySlot(science);
        assert.deepEqual(chosen(), ["TRADITION_OWN"]);
        rows.pop();
        // The empty slot holds the turn (seen in game 6): the least bad policy goes in.
        reset();
        const out1 = choices.fillOnePolicySlot(science, new Set(), { forced: true });
        assert.deepEqual(chosen(), ["TRADITION_SCIENCE"], "8 science: the least bad");
        assert.equal(out1[0]?.key, "POLICY_FORCED");
        // A policy already slotted is not taken out into an empty slot (the game would hold the
        // turn until it is filled again): only for a better card.
        reset();
        active.add(H("TRADITION_SCIENCE"));
        culture.canSwapCultureSlot = () => true;
        Game.PlayerOperations.sendRequest = (pid, op, args) => {
            if (op === PlayerOperationTypes.CHANGE_TRADITION && args.Action === PlayerOperationParameters.Deactivate) {
                fake.sent.push({ kind: "player", op, args: { ...args } });
                active.delete(rows[args.TraditionType].$hash);
                return;
            }
            return before(pid, op, args);
        };
        const out = choices.swapOnePolicy(science);
        assert.deepEqual(out, [], "every other policy is worse");
        assert.equal(active.size, 1);
    } finally {
        Game.PlayerOperations.sendRequest = before;
        delete culture.canSwapCultureSlot;
        me.civilizationType = civ;
        slots[2] = 0;
        active.clear();
        Object.assign(GameInfo, tables);
        clearModifiers();
    }
});

test("the end-of-turn retry: an empty policy slot holding the turn (NOTIFICATION_TRADITIONS_AVAILABLE) gets the least bad card; not in the first pass", async () => {
    // Seen in game 6 (Ming): the empty slot held the turn; «seen it» (CONSIDER_ASSIGN_TRADITIONS) did not release it.
    installPreviews();
    reset();
    const me = Players.get(0);
    const civ = me.civilizationType;
    const tables = { CivilizationTraits: GameInfo.CivilizationTraits, TraitModifiers: GameInfo.TraitModifiers };
    me.civilizationType = GameInfo.Civilizations.lookup("CIVILIZATION_HAN").$hash;
    GameInfo.CivilizationTraits = [{ CivilizationType: "CIVILIZATION_HAN", TraitType: "TRAIT_TEST_ABILITY" }];
    GameInfo.TraitModifiers = [{ TraitType: "TRAIT_TEST_ABILITY", ModifierId: "TRAIT_MOD_LOSE_SCIENCE_PER_NON_UNIQUE_TRADITION" }];
    useModifiers([{ id: "TRAIT_MOD_LOSE_SCIENCE_PER_NON_UNIQUE_TRADITION", effect: "EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION", args: { YieldType: "YIELD_SCIENCE", Amount: -15, CivUnique: "true", Invert: "true" } }]);
    const science = { ...DEFAULT_SETTINGS, profile: "SCIENCE" };
    try {
        slots[2] = 1;
        world.blocker = { type: 5, name: "NOTIFICATION_TRADITIONS_AVAILABLE" };
        await choices.makeChoices(science);
        assert.deepEqual(chosen(), [], "the first pass leaves it empty");
        await choices.makeChoices(science, { retry: true });
        assert.deepEqual(chosen(), ["TRADITION_SCIENCE"], "the retry fills it");
        // Another hold: the retry does not force a card in.
        reset();
        world.blocker = { type: 5, name: "NOTIFICATION_CHOOSE_TECH" };
        await choices.makeChoices(science, { retry: true });
        assert.ok(!chosen().includes("TRADITION_SCIENCE"));
    } finally {
        delete world.blocker;
        me.civilizationType = civ;
        slots[2] = 0;
        active.clear();
        Object.assign(GameInfo, tables);
        clearModifiers();
    }
});

test("story event: the option the game's AI prefers, answered once", () => {
    reset();
    const id = { owner: 0, id: 9, type: 3 };
    let pending = id;
    const stories = [
        { NarrativeStoryType: "STORY_A", Name: "A story" },
        { NarrativeStoryType: "STORY_A_PLAIN", Activation: "LINKED" },
        { NarrativeStoryType: "STORY_A_AI", Activation: "LINKED" },
        { NarrativeStoryType: "STORY_A_LOCKED", Activation: "LINKED_REQUISITE" },
    ];
    GameInfo.NarrativeStories = { lookup: (t) => stories.find((s) => s.NarrativeStoryType === t) ?? null };
    GameInfo.NarrativeStory_Links = [
        { FromNarrativeStoryType: "STORY_A", ToNarrativeStoryType: "STORY_A_PLAIN" },
        { FromNarrativeStoryType: "STORY_A", ToNarrativeStoryType: "STORY_A_AI", AIPriority: true },
        { FromNarrativeStoryType: "STORY_A", ToNarrativeStoryType: "STORY_A_LOCKED", AIPriority: true },
    ];
    GameInfo.NarrativeRewardIcons = [];
    Players.get(0).Stories = {
        getFirstPendingMetId: () => pending,
        find: () => ({ type: "STORY_A" }),
        canAfford: () => true,
        determineRequisiteLink: () => false,
    };
    const answered = new Set();
    const out = choices.chooseStory(answered);
    const req = fake.sent.filter((s) => s.op === PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION);
    assert.equal(req.length, 1);
    assert.equal(req[0].args.TargetType, "STORY_A_AI", "the locked option is skipped even though the AI likes it");
    assert.equal(out[0].key, "STORY");
    assert.deepEqual(choices.chooseStory(answered), [], "the game has not taken the answer yet: not sent again");
    pending = null;
    delete Players.get(0).Stories;
});

test("advisor warnings are marked as seen even when another hold comes first; the blocker is reported by name", () => {
    reset();
    world.blocker = { type: EndTurnBlockingTypes.UNITS, name: "NOTIFICATION_COMMAND_UNITS" };
    world.notifications = [{ name: "NOTIFICATION_TRADITIONS_AVAILABLE" }, { name: "NOTIFICATION_ADVISOR_WARNING_SCIENCE" }];
    assert.equal(choices.turnBlocker(), "NOTIFICATION_COMMAND_UNITS");
    const out = choices.dismissAdvisorWarnings();
    const req = fake.sent.filter((s) => s.op === PlayerOperationTypes.VIEWED_ADVISOR_WARNING);
    assert.deepEqual(req.map((s) => s.args.Target), [{ owner: 0, id: 1, type: 2 }], "only the warning, by its own id");
    assert.equal(out[0].key, "ADVISOR_SEEN");
    delete world.blocker;
    delete world.notifications;
    assert.equal(choices.turnBlocker(), null);
});

test("\"seen it\" requests only when something holds the turn", async () => {
    reset();
    const considered = () => fake.sent.filter((s) => [PlayerOperationTypes.CONSIDER_ASSIGN_TRADITIONS, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, PlayerOperationTypes.CONSIDER_ASSIGN_ATTRIBUTE].includes(s.op));
    await choices.makeChoices(DEFAULT_SETTINGS, { retry: true });
    assert.equal(considered().length, 0, "nothing holds the turn");
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_SOMETHING" };
    await choices.makeChoices(DEFAULT_SETTINGS);
    assert.equal(considered().length, 0, "the first pass leaves screens alone");
    await choices.makeChoices(DEFAULT_SETTINGS, { retry: true });
    delete world.blocker;
    assert.equal(considered().length, 3, "the end-of-turn retry marks them seen");
});

test("a newly met leader gets a friendly greeting, or a neutral one when friendly is not allowed", () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_PLAYER_MET", player: 3 }];
    const greetings = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET).map((s) => [s.args.Player2, s.args.Type]);
    choices.answerFirstMeetings();
    assert.deepEqual(greetings(), [[3, DiplomacyPlayerFirstMeets.PLAYER_REALATIONSHIP_FIRSTMEET_FRIENDLY]]);
    reset();
    Game.PlayerOperations.canStart = (_p, op, args) => ({ Success: !(op === PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET && args.Type === DiplomacyPlayerFirstMeets.PLAYER_REALATIONSHIP_FIRSTMEET_FRIENDLY) });
    const out = choices.answerFirstMeetings();
    Game.PlayerOperations.canStart = () => ({ Success: true });
    assert.deepEqual(greetings(), [[3, DiplomacyPlayerFirstMeets.PLAYER_REALATIONSHIP_FIRSTMEET_NEUTRAL]]);
    assert.equal(out[0].key, "FIRST_MEET");
    delete world.notifications;
    reset();
    assert.deepEqual(choices.answerFirstMeetings(), [], "nobody new");
});

test("government: only when the game asks for one", () => {
    reset();
    GameInfo.StartingGovernments = [{ GovernmentType: "GOVERNMENT_CHIEFDOM" }];
    GameInfo.Governments = { lookup: (t) => (t === "GOVERNMENT_CHIEFDOM" ? { GovernmentType: t, Name: "Chiefdom", $index: 0 } : null) };
    culture.getGovernmentType = () => 4;
    assert.deepEqual(choices.chooseGovernment(), [], "already has one, nothing asked");
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_GOVERNMENT" }];
    assert.equal(choices.chooseGovernment()[0]?.key, "GOVERNMENT");
    delete world.notifications;
});

test("government: the best the game allows for the focus; a military one only when nothing else is allowed", () => {
    reset();
    const govs = ["GOVERNMENT_FEUDAL_MONARCHY", "GOVERNMENT_PLUTOCRACY", "GOVERNMENT_THEOCRACY"];
    GameInfo.StartingGovernments = govs.map((GovernmentType) => ({ GovernmentType }));
    GameInfo.Governments = { lookup: (t) => (govs.includes(t) ? { GovernmentType: t, Name: t, $index: govs.indexOf(t) } : null) };
    culture.getGovernmentType = () => -1;
    const picked = () => govs[fake.sent.filter((s) => s.op === PlayerOperationTypes.CHANGE_GOVERNMENT).at(-1)?.args.GovernmentType];
    const canStart = Game.PlayerOperations.canStart;
    try {
        choices.chooseGovernment({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.equal(picked(), "GOVERNMENT_PLUTOCRACY");
        choices.chooseGovernment({ ...DEFAULT_SETTINGS, profile: "CULTURE" });
        assert.equal(picked(), "GOVERNMENT_THEOCRACY");
        choices.chooseGovernment(DEFAULT_SETTINGS);
        assert.equal(picked(), "GOVERNMENT_PLUTOCRACY", "no focus: not the military one listed first");
        Game.PlayerOperations.canStart = (p, op, args) => (op === PlayerOperationTypes.CHANGE_GOVERNMENT ? { Success: govs[args.GovernmentType] === "GOVERNMENT_FEUDAL_MONARCHY" } : canStart(p, op, args));
        choices.chooseGovernment({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.equal(picked(), "GOVERNMENT_FEUDAL_MONARCHY", "the only one allowed");
    } finally {
        Game.PlayerOperations.canStart = canStart;
        culture.getGovernmentType = () => 4;
    }
});

test("a leader's proposal: the cheapest answer that is not a rejection; only rejection possible: left for the player", () => {
    reset();
    const R = DiplomaticResponseTypes;
    world.notifications = [{ name: "NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED", target: { owner: 1, id: 41, type: 5 } }, { name: "NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED", target: { owner: 1, id: 42, type: 5 } }];
    world.diplomacy = {
        41: { initialPlayer: 1, actionType: 0, responses: [
            { responseType: R.DIPLOMACY_RESPONSE_SUPPORT, responseName: "Support", cost: 0 },
            { responseType: R.DIPLOMACY_RESPONSE_REJECT, responseName: "Reject", cost: 0 },
            { responseType: R.DIPLOMACY_RESPONSE_ACCEPT, responseName: "Accept", cost: 0 },
        ] },
        42: { initialPlayer: 1, actionType: 0, responses: [{ responseType: R.DIPLOMACY_RESPONSE_REJECT, responseName: "Reject", cost: 0 }] },
    };
    const out = choices.answerDiplomacy();
    const sent = fake.sent.filter((s) => s.op === PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION).map((s) => [s.args.ID, s.args.Type]);
    assert.deepEqual(sent, [[41, R.DIPLOMACY_RESPONSE_ACCEPT]], "accept (free) before support, never reject; 42 untouched");
    assert.deepEqual(out.map((e) => e.key), ["DIPLO_RESPONSE", "DIPLO_LEFT"]);
    // Support is the only free answer: it is taken; a paid one loses to a free one.
    reset();
    world.notifications = [world.notifications[0]];
    world.diplomacy[41].responses = [
        { responseType: R.DIPLOMACY_RESPONSE_ACCEPT, responseName: "Accept", cost: 30 },
        { responseType: R.DIPLOMACY_RESPONSE_SUPPORT, responseName: "Support", cost: 0 },
    ];
    choices.answerDiplomacy();
    assert.deepEqual(fake.sent.filter((s) => s.op === PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION).map((s) => s.args.Type), [R.DIPLOMACY_RESPONSE_SUPPORT]);
    delete world.notifications;
    delete world.diplomacy;
});

test("a leader's message about their agenda is read (dismissed like its close button does)", () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_DIPLOMATIC_ACTION_AGENDA", player: 1 }, { name: "NOTIFICATION_TRADITIONS_AVAILABLE" }];
    const out = choices.readLeaderMessages();
    assert.deepEqual(fake.sent.filter((s) => s.kind === "dismiss").map((s) => s.id.id), [0]);
    assert.equal(out[0].key, "LEADER_MESSAGE");
    assert.deepEqual(world.notifications.map((n) => n.name), ["NOTIFICATION_TRADITIONS_AVAILABLE"], "other notifications stay");
    delete world.notifications;
});

test("religion: the first one not founded yet, then the beliefs worth most while the game accepts them", async () => {
    reset();
    installPreviews();
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_RELIGION" }];
    Players.get(0).Religion = { canCreateReligion: () => true, hasCreatedReligion: () => false };
    GameInfo.Religions = [{ ReligionType: "RELIGION_TAKEN", Name: "Taken" }, { ReligionType: "RELIGION_OURS", Name: "Ours" }];
    GameInfo.Beliefs = [
        { BeliefType: "BELIEF_PANTHEON_X", BeliefClassType: "BELIEF_CLASS_PANTHEON" },
        { BeliefType: "BELIEF_GOLD", BeliefClassType: "BELIEF_CLASS_FOUNDER", Name: "Gold belief" },
        { BeliefType: "BELIEF_SCIENCE", BeliefClassType: "BELIEF_CLASS_FOLLOWER", Name: "Science belief" },
        { BeliefType: "BELIEF_OTHER", BeliefClassType: "BELIEF_CLASS_FOLLOWER", Name: "Other" },
    ];
    GameInfo.BeliefModifiers = [{ BeliefType: "BELIEF_SCIENCE", ModifierID: "MOD_SCIENCE" }, { BeliefType: "BELIEF_GOLD", ModifierID: "MOD_GOLD" }];
    Game.Religion = { hasBeenFounded: (t) => t === "RELIGION_TAKEN", isBeliefClaimable: () => true };
    // The game accepts two beliefs, confirming each a moment later.
    let added = 0;
    Game.PlayerOperations.canStart = (_p, op) => ({ Success: op !== PlayerOperationTypes.ADD_BELIEF || added < 2 });
    const send = Game.PlayerOperations.sendRequest;
    Game.PlayerOperations.sendRequest = (pid, op, args) => {
        send(pid, op, args);
        if (op === PlayerOperationTypes.ADD_BELIEF) {
            added++;
            setTimeout(() => engine.trigger("BeliefAdded", {}), 5);
        }
        if (op === PlayerOperationTypes.FOUND_RELIGION) setTimeout(() => engine.trigger("ReligionFounded", {}), 5);
    };
    const out = await choices.foundReligion({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    Game.PlayerOperations.sendRequest = send;
    Game.PlayerOperations.canStart = () => ({ Success: true });
    const ops = fake.sent.filter((s) => s.op === PlayerOperationTypes.FOUND_RELIGION || s.op === PlayerOperationTypes.ADD_BELIEF).map((s) => s.args.ReligionType ?? s.args.BeliefType);
    assert.deepEqual(ops, [Database.makeHash("RELIGION_OURS"), Database.makeHash("BELIEF_SCIENCE"), Database.makeHash("BELIEF_GOLD")]);
    assert.deepEqual(out.map((e) => e.key), ["RELIGION_FOUNDED", "BELIEF", "BELIEF"]);
    delete world.notifications;
    delete Players.get(0).Religion;
});

test("the choices pass founds the religion the game asks for", async () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_RELIGION" }];
    Players.get(0).Religion = { canCreateReligion: () => true, hasCreatedReligion: () => false };
    Game.Religion = { hasBeenFounded: () => false, isBeliefClaimable: () => false };
    await choices.makeChoices(DEFAULT_SETTINGS);
    assert.ok(fake.sent.some((s) => s.op === PlayerOperationTypes.FOUND_RELIGION));
    delete world.notifications;
    delete Players.get(0).Religion;
});

test("«Обнаружен шпионаж» (seen holding the turn) is read; if the game still holds the turn, it is opened like the end turn button does", () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE", player: 0 }, { name: "NOTIFICATION_TRADITIONS_AVAILABLE" }];
    let out = choices.readEspionageReports();
    assert.deepEqual(fake.sent.filter((s) => s.kind === "dismiss").map((s) => s.id.id), [0]);
    assert.equal(out[0].key, "ESPIONAGE_SEEN");
    assert.deepEqual(world.notifications.map((n) => n.name), ["NOTIFICATION_TRADITIONS_AVAILABLE"]);
    assert.equal(fake.sent.filter((s) => s.kind === "activate").length, 0, "not opened on the first try");
    // Dismissing did not release the turn: the end-of-turn retry opens it.
    reset();
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE" };
    out = choices.readEspionageReports({ retry: true });
    assert.equal(fake.sent.filter((s) => s.kind === "activate").length, 1);
    assert.ok(out.some((e) => e.key === "ESPIONAGE_OPENED"));
    delete world.blocker;
    delete world.notifications;
});

test("great works waiting in the archive go into free slots the game accepts; damaged buildings and full slots are skipped", async () => {
    reset();
    const LIBRARY = GameInfo.Constructibles.lookup("BUILDING_LIBRARY").$hash;
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Rome", gwBuildings: [
        { type: "BUILDING_MONUMENT", slots: [-1], damaged: true },
        { type: "BUILDING_LIBRARY", slots: [5, -1] },
    ] });
    world.greatWorks = { 5: "GREATWORK_SHOWN", 7: "GREATWORK_RELIC", 8: "GREATWORK_CODEX" };
    world.archive = [7, 8];
    GameInfo.GreatWorks = { lookup: (h) => ["GREATWORK_SHOWN", "GREATWORK_RELIC", "GREATWORK_CODEX"].map((t) => ({ GreatWorkType: t, Name: t })).find((w) => Database.makeHash(w.GreatWorkType) === h) ?? null };
    const moves = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.MOVE_GREAT_WORK).map((s) => s.args);
    const canStart = Game.PlayerOperations.canStart;
    try {
        let out = choices.slotGreatWorks();
        assert.deepEqual(moves(), [{ Player1: 0, GreatWorkIndex: 7, DestinationCity: 0, DestinationBuilding: LIBRARY }], "the library's one free slot; not the damaged monument");
        assert.equal(out[0].key, "GREAT_WORK_SLOTTED");
        // The game does not take the relic there: the codex goes instead.
        reset();
        Game.PlayerOperations.canStart = (_p, op, args) => ({ Success: !(op === PlayerOperationTypes.MOVE_GREAT_WORK && args.GreatWorkIndex === 7) });
        out = choices.slotGreatWorks();
        assert.deepEqual(moves().map((a) => a.GreatWorkIndex), [8]);
        // Every pass of choices does it.
        reset();
        Game.PlayerOperations.canStart = canStart;
        out = await choices.makeChoices(DEFAULT_SETTINGS);
        assert.ok(out.some((e) => e.key === "GREAT_WORK_SLOTTED"), JSON.stringify(out.map((e) => e.key)));
        // Nothing in the archive: nothing to do.
        reset();
        world.archive = [];
        assert.deepEqual(choices.slotGreatWorks(), []);
    } finally {
        Game.PlayerOperations.canStart = canStart;
        world.cities.pop();
        delete world.greatWorks;
        delete world.archive;
    }
});

test("a crisis card Policy Yield Previews cannot value (a combat penalty) counts as 0, not below a known gold penalty (probe P9)", () => {
    installPreviews();
    reset();
    rows.push({ TraditionType: "CRISIS_COMBAT", Name: "Combat crisis", slot: 3, yields: null, $index: rows.length, $hash: 100 + rows.length });
    slots[3] = 1;
    try {
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["CRISIS_COMBAT"], "not the −2 gold one");
    } finally {
        rows.pop();
        slots[3] = 0;
    }
});

test("an advisor warning is marked as seen once, not on every choices pass (research/21 G3)", () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_ADVISOR_WARNING_CULTURE" }];
    const marked = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.VIEWED_ADVISOR_WARNING).length;
    try {
        choices.dismissAdvisorWarnings();
        choices.dismissAdvisorWarnings();
        assert.equal(marked(), 1);
    } finally {
        delete world.notifications;
    }
});

test("a crisis card's Happiness loss counts double where it would push a settlement below 0 (research/22 A4: a town revolted)", () => {
    installPreviews();
    reset();
    rows.push({ TraditionType: "CRISIS_SCORN", Name: "Provincial scorn", slot: 3, yields: { YIELD_HAPPINESS: -6 }, $index: rows.length, $hash: 100 + rows.length });
    rows.push({ TraditionType: "CRISIS_TAX", Name: "Tax", slot: 3, yields: { YIELD_GOLD: -7 }, $index: rows.length, $hash: 100 + rows.length });
    const offeredBefore = culture.getUnlockedTraditions;
    culture.getUnlockedTraditions = (t) => (t === 3 ? rows.filter((r) => r.TraditionType === "CRISIS_SCORN" || r.TraditionType === "CRISIS_TAX").map((r) => r.$hash) : offeredBefore(t));
    useModifiers([{ id: "SCORN_MOD", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: -6 } }]);
    GameInfo.Modifiers[0].SubjectRequirementSetId = "REQSET_TOWNS";
    GameInfo.TraditionModifiers = [{ TraditionType: "CRISIS_SCORN", ModifierId: "SCORN_MOD" }];
    GameInfo.RequirementSetRequirements = [{ RequirementSetId: "REQSET_TOWNS", RequirementId: "REQ_TOWN" }];
    GameInfo.Requirements = [{ RequirementId: "REQ_TOWN", RequirementType: "REQUIREMENT_CITY_IS_TOWN" }];
    world.cities = [{ owner: 0, x: 2, y: 2, name: "Rome", happy: 20 }, { owner: 0, x: 6, y: 6, name: "Cole", isTown: true, happy: -1 }];
    slots[3] = 1;
    try {
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["CRISIS_TAX"], "−6 Happiness in a town at −1 is worse than −7 gold");
        reset();
        world.cities[1].happy = 30;
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["CRISIS_SCORN"], "a town with plenty to spare hardly feels it");
    } finally {
        rows.splice(-2);
        culture.getUnlockedTraditions = offeredBefore;
        clearModifiers();
        delete GameInfo.RequirementSetRequirements;
        delete GameInfo.Requirements;
        world.cities = [];
        slots[3] = 0;
    }
});

// Research/40 A2: game 41 slotted Ius Reformandi («Право на реформу»), valued "?": every settlement of ours newly following
// our religion gets 3 buildings damaged. And the religious crisis's Happiness cards were not weighed: the game's
// REQUIREMENT_CITY_FOLLOWS_RELIGION was an unknown test.
test("religious crisis cards: Ius Reformandi's damage goes last; Tolerance and Zeal by which of our settlements follow our religion", () => {
    reset();
    delete globalThis.LfYieldsPreview; // the previews value none of them
    const cards = [
        { TraditionType: "TRADITION_IUS_REFORMANDI", Name: "Ius Reformandi", slot: 3, yields: null },
        { TraditionType: "TRADITION_LITURGICAL_DISPUTES", Name: "Liturgical Disputes", slot: 3, yields: null },
        { TraditionType: "TRADITION_RELIGIOUS_ZEAL", Name: "Zeal", slot: 3, yields: null },
        { TraditionType: "TRADITION_RELIGIOUS_TOLERANCE", Name: "Tolerance", slot: 3, yields: null },
        { TraditionType: "TRADITION_RELIGIOUS_ESPIONAGE", Name: "Schism", slot: 3, yields: null },
        { TraditionType: "TRADITION_RELIGIOUS_MERCHANTS", Name: "Jizya", slot: 3, yields: null },
    ];
    for (const c of cards) rows.push({ ...c, $index: rows.length, $hash: 100 + rows.length });
    const offeredBefore = culture.getUnlockedTraditions;
    let offer = [];
    culture.getUnlockedTraditions = (t) => (t === 3 ? rows.filter((r) => offer.includes(r.TraditionType)).map((r) => r.$hash) : offeredBefore(t));
    useModifiers([
        { id: "IUS_REFORMANDI_MOD_PILLAGE", effect: "EFFECT_CITY_DAMAGE_CONSTRUCTIBLES", args: { Amount: 3, DamageType: "UNHAPPINESS" } },
        { id: "LITURGICAL_DISPUTES_MOD_HAPPINESS", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: -4 } },
        { id: "RELIGIOUS_ZEAL_MOD_HAPPINESS", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: -8 } },
        { id: "RELIGIOUS_TOLERANCE_MOD_HAPPINESS", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: 8 } },
        { id: "RELIGIOUS_ESPIONAGE_MOD_HAPPINESS", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: -4 } },
        { id: "RELIGIOUS_MERCHANTS_MOD_HAPPINESS", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: -4 } },
    ]);
    const sets = { LITURGICAL_DISPUTES_MOD_HAPPINESS: "REQSET_FOLLOWS", RELIGIOUS_ZEAL_MOD_HAPPINESS: "REQSET_NOT_FOLLOWS", RELIGIOUS_TOLERANCE_MOD_HAPPINESS: "REQSET_NOT_FOLLOWS",
        RELIGIOUS_ESPIONAGE_MOD_HAPPINESS: "REQSET_HOMELAND", RELIGIOUS_MERCHANTS_MOD_HAPPINESS: "REQSET_DISTANT" };
    for (const m of GameInfo.Modifiers) m.SubjectRequirementSetId = sets[m.ModifierId] ?? null;
    GameInfo.TraditionModifiers = [
        { TraditionType: "TRADITION_IUS_REFORMANDI", ModifierId: "IUS_REFORMANDI_MOD_PILLAGE" },
        { TraditionType: "TRADITION_LITURGICAL_DISPUTES", ModifierId: "LITURGICAL_DISPUTES_MOD_HAPPINESS" },
        { TraditionType: "TRADITION_RELIGIOUS_ZEAL", ModifierId: "RELIGIOUS_ZEAL_MOD_HAPPINESS" },
        { TraditionType: "TRADITION_RELIGIOUS_TOLERANCE", ModifierId: "RELIGIOUS_TOLERANCE_MOD_HAPPINESS" },
        { TraditionType: "TRADITION_RELIGIOUS_ESPIONAGE", ModifierId: "RELIGIOUS_ESPIONAGE_MOD_HAPPINESS" },
        { TraditionType: "TRADITION_RELIGIOUS_MERCHANTS", ModifierId: "RELIGIOUS_MERCHANTS_MOD_HAPPINESS" },
    ];
    GameInfo.RequirementSetRequirements = [{ RequirementSetId: "REQSET_FOLLOWS", RequirementId: "REQ_FOLLOWS" }, { RequirementSetId: "REQSET_NOT_FOLLOWS", RequirementId: "REQ_NOT_FOLLOWS" },
        { RequirementSetId: "REQSET_HOMELAND", RequirementId: "REQ_HOMELAND" }, { RequirementSetId: "REQSET_DISTANT", RequirementId: "REQ_DISTANT" }];
    GameInfo.Requirements = [
        { RequirementId: "REQ_FOLLOWS", RequirementType: "REQUIREMENT_CITY_FOLLOWS_RELIGION" },
        { RequirementId: "REQ_NOT_FOLLOWS", RequirementType: "REQUIREMENT_CITY_FOLLOWS_RELIGION", Inverse: "true" },
        { RequirementId: "REQ_HOMELAND", RequirementType: "REQUIREMENT_CITY_IS_DISTANT_LANDS", Inverse: "true" },
        { RequirementId: "REQ_DISTANT", RequirementType: "REQUIREMENT_CITY_IS_DISTANT_LANDS" },
    ];
    world.religion = 77;
    world.cities = [{ owner: 0, x: 2, y: 2, name: "Rome", happy: 2, religion: 77, nets: { YIELD_PRODUCTION: 20, YIELD_SCIENCE: 20 } },
        { owner: 0, x: 6, y: 6, name: "Cole", isTown: true, happy: 2, religion: 88, nets: { YIELD_PRODUCTION: 10, YIELD_GOLD: 10 } }];
    slots[3] = 1;
    try {
        offer = ["TRADITION_IUS_REFORMANDI", "TRADITION_LITURGICAL_DISPUTES"];
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["TRADITION_LITURGICAL_DISPUTES"], "−4 Happiness in Rome, not 3 damaged buildings per conversion");
        reset();
        offer = ["TRADITION_RELIGIOUS_ZEAL", "TRADITION_RELIGIOUS_TOLERANCE"];
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["TRADITION_RELIGIOUS_TOLERANCE"], "Cole follows another religion: +8 there, not −8");
        // Schism hits the Homeland (Rome at +2 goes below zero), Jizya the Distant Lands (Cole at +30 hardly feels it).
        reset();
        world.cities[1].distant = true;
        world.cities[1].happy = 30;
        offer = ["TRADITION_RELIGIOUS_ESPIONAGE", "TRADITION_RELIGIOUS_MERCHANTS"];
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["TRADITION_RELIGIOUS_MERCHANTS"]);
    } finally {
        rows.splice(-cards.length);
        culture.getUnlockedTraditions = offeredBefore;
        clearModifiers();
        delete GameInfo.RequirementSetRequirements;
        delete GameInfo.Requirements;
        delete world.religion;
        world.cities = [];
        slots[3] = 0;
    }
});

test("a story's Happiness option comes first while a settlement is in unrest (research/22 A4: War Support was taken instead)", () => {
    reset();
    const id = { owner: 0, id: 11, type: 3 };
    const stories = [
        { NarrativeStoryType: "STORY_R", Name: "Revolt" },
        { NarrativeStoryType: "STORY_R_WAR", Activation: "LINKED" },
        { NarrativeStoryType: "STORY_R_HAPPY", Activation: "LINKED" },
    ];
    GameInfo.NarrativeStories = { lookup: (t) => stories.find((s) => s.NarrativeStoryType === t) ?? null };
    GameInfo.NarrativeStory_Links = [
        { FromNarrativeStoryType: "STORY_R", ToNarrativeStoryType: "STORY_R_WAR", AIPriority: true },
        { FromNarrativeStoryType: "STORY_R", ToNarrativeStoryType: "STORY_R_HAPPY" },
    ];
    // The War Support option also brings gold and science: worth more than Happiness while all is calm.
    GameInfo.NarrativeRewardIcons = [{ NarrativeStoryType: "STORY_R_WAR", RewardIconType: "YIELD_GOLD" }, { NarrativeStoryType: "STORY_R_WAR", RewardIconType: "YIELD_SCIENCE" }, { NarrativeStoryType: "STORY_R_HAPPY", RewardIconType: "YIELD_HAPPINESS" }];
    Players.get(0).Stories = { getFirstPendingMetId: () => id, find: () => ({ type: "STORY_R" }), canAfford: () => true, determineRequisiteLink: () => false };
    const answer = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION).map((s) => s.args.TargetType);
    try {
        world.cities = [{ owner: 0, x: 2, y: 2, name: "Rome", happy: 5 }, { owner: 0, x: 6, y: 6, name: "Cole", isTown: true, happy: 2, unrest: true }];
        choices.chooseStory(new Set());
        assert.deepEqual(answer(), ["STORY_R_HAPPY"]);
        reset();
        world.cities[1].unrest = false;
        choices.chooseStory(new Set());
        assert.deepEqual(answer(), ["STORY_R_WAR"], "all calm: the option worth most");
    } finally {
        delete Players.get(0).Stories;
        world.cities = [];
    }
});

test("a story's option is chosen by what the profile values: +Science over +Gold for science, a negative icon subtracts (research/23 S5: the base game sets no AIPriority)", () => {
    reset();
    const id = { owner: 0, id: 12, type: 3 };
    const stories = [
        { NarrativeStoryType: "STORY_D", Name: "LOC_STORY_D_NAME", StoryTitle: "LOC_STORY_D_TITLE" },
        { NarrativeStoryType: "STORY_D_B", Activation: "LINKED" },
        { NarrativeStoryType: "STORY_D_C", Activation: "LINKED" },
    ];
    GameInfo.NarrativeStories = { lookup: (t) => stories.find((s) => s.NarrativeStoryType === t) ?? null };
    GameInfo.NarrativeStory_Links = [
        { FromNarrativeStoryType: "STORY_D", ToNarrativeStoryType: "STORY_D_C" },
        { FromNarrativeStoryType: "STORY_D", ToNarrativeStoryType: "STORY_D_B" },
    ];
    GameInfo.NarrativeRewardIcons = [
        { NarrativeStoryType: "STORY_D_B", RewardIconType: "YIELD_SCIENCE" }, { NarrativeStoryType: "STORY_D_B", RewardIconType: "YIELD_GOLD", Negative: true },
        { NarrativeStoryType: "STORY_D_C", RewardIconType: "YIELD_GOLD" },
    ];
    Players.get(0).Stories = { getFirstPendingMetId: () => id, find: () => ({ type: "STORY_D" }), canAfford: () => true, determineRequisiteLink: () => false };
    const answer = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION).map((s) => s.args.TargetType);
    try {
        world.cities = [{ owner: 0, x: 2, y: 2, name: "Rome", happy: 5 }];
        const out = choices.chooseStory(new Set(), { ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(answer(), ["STORY_D_B"], "2.0 science − 0.5 gold beats 0.5 gold");
        assert.equal(out[0].args[0], "LOC_STORY_D_TITLE", "the story's title, not its Name");
        reset();
        choices.chooseStory(new Set(), { ...DEFAULT_SETTINGS, profile: "GOLD" });
        assert.deepEqual(answer(), ["STORY_D_C"], "gold: the gold option");
    } finally {
        delete Players.get(0).Stories;
        world.cities = [];
    }
});

test("story options with no icons are valued by their rewards' yields: +Happiness in unrest over war support (research/24 W10: game 9's revolt)", () => {
    reset();
    const id = { owner: 0, id: 13, type: 3 };
    const stories = [
        { NarrativeStoryType: "LOYALTY002A", Name: "Revolt" },
        { NarrativeStoryType: "LOYALTY002C", Activation: "LINKED" },
        { NarrativeStoryType: "LOYALTY002D", Activation: "LINKED" },
    ];
    GameInfo.NarrativeStories = { lookup: (t) => stories.find((s) => s.NarrativeStoryType === t) ?? null };
    GameInfo.NarrativeStory_Links = [
        { FromNarrativeStoryType: "LOYALTY002A", ToNarrativeStoryType: "LOYALTY002C" },
        { FromNarrativeStoryType: "LOYALTY002A", ToNarrativeStoryType: "LOYALTY002D" },
    ];
    GameInfo.NarrativeRewardIcons = [];
    GameInfo.NarrativeStory_Rewards = [{ NarrativeStoryType: "LOYALTY002C", NarrativeRewardType: "R_C" }, { NarrativeStoryType: "LOYALTY002D", NarrativeRewardType: "R_D" }];
    GameInfo.NarrativeRewards = [{ NarrativeRewardType: "R_C", ModifierID: "M_C" }, { NarrativeRewardType: "R_D", ModifierID: "M_D" }];
    useModifiers([
        { id: "M_C", effect: "EFFECT_DIPLOMACY_ADJUST_DIPLOMATIC_ACTION_TOKEN_BONUS", args: { ActionType: "DIPLOMACY_ACTION_DECLARE_WAR", Amount: 2 } },
        { id: "M_D", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: 2 } },
    ]);
    Players.get(0).Stories = { getFirstPendingMetId: () => id, find: () => ({ type: "LOYALTY002A" }), canAfford: () => true, determineRequisiteLink: () => false };
    const answer = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION).map((s) => s.args.TargetType);
    try {
        world.cities = [{ owner: 0, x: 2, y: 2, name: "Rome", happy: 5 }, { owner: 0, x: 6, y: 6, name: "Cole", isTown: true, happy: -2, unrest: true }];
        choices.chooseStory(new Set());
        assert.deepEqual(answer(), ["LOYALTY002D"]);
    } finally {
        delete Players.get(0).Stories;
        delete GameInfo.NarrativeStory_Rewards;
        delete GameInfo.NarrativeRewards;
        clearModifiers();
        world.cities = [];
    }
});

// Research/40 C (legacy notes P7): a crisis story's option carrying the crisis's narrative tag completes a crisis triumph (a
// crisis card for the next age's dedications).
test("a crisis story: of two equal options, the one granting the crisis's narrative tag", () => {
    reset();
    const id = { owner: 0, id: 14, type: 3 };
    const stories = [{ NarrativeStoryType: "AC001", Name: "Invasion" }, { NarrativeStoryType: "AC001A", Activation: "LINKED" }, { NarrativeStoryType: "AC001B", Activation: "LINKED" }];
    GameInfo.NarrativeStories = { lookup: (t) => stories.find((s) => s.NarrativeStoryType === t) ?? null };
    GameInfo.NarrativeStory_Links = [{ FromNarrativeStoryType: "AC001", ToNarrativeStoryType: "AC001B" }, { FromNarrativeStoryType: "AC001", ToNarrativeStoryType: "AC001A" }];
    GameInfo.NarrativeRewardIcons = [];
    GameInfo.NarrativeStory_Rewards = [{ NarrativeStoryType: "AC001A", NarrativeRewardType: "R_A" }, { NarrativeStoryType: "AC001B", NarrativeRewardType: "R_B" }];
    GameInfo.NarrativeRewards = [{ NarrativeRewardType: "R_A", ModifierID: "M_A" }, { NarrativeRewardType: "R_B", ModifierID: "M_B" }];
    useModifiers([
        { id: "M_A", effect: "EFFECT_PLAYER_GRANT_NARRATIVE_TAG", args: { NarrativeTagType: "NARRATIVE_TAG_CRISIS_INVASION", Amount: 1 } },
        { id: "M_B", effect: "EFFECT_PLAYER_GRANT_NARRATIVE_TAG", args: { NarrativeTagType: "NARRATIVE_TAG_SOMETHING", Amount: 1 } },
    ]);
    Players.get(0).Stories = { getFirstPendingMetId: () => id, find: () => ({ type: "AC001" }), canAfford: () => true, determineRequisiteLink: () => false };
    const answer = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION).map((s) => s.args.TargetType);
    try {
        choices.chooseStory(new Set());
        assert.deepEqual(answer(), ["AC001A"]);
    } finally {
        delete Players.get(0).Stories;
        delete GameInfo.NarrativeStory_Rewards;
        delete GameInfo.NarrativeRewards;
        clearModifiers();
    }
});

test("syncretism: its own civilization when that brings a culture slot, else the infrastructure with a unique quarter; only while the game asks, once a turn (research/31 §5: game 26 held at M84; game 41: twice, with nothing chosen)", async () => {
    reset();
    const turn = Game.turn;
    const unlocks = Game.Unlocks;
    const identity = Players.get(0).Identity;
    const civ = (t) => GameInfo.Civilizations.lookup(t).$hash;
    const T = SyncreticChoiceTypes;
    Game.Unlocks = {
        getSyncreticCivUnlocksForChoice: (_p, flag) => (flag === T.SYNCRETIC_CHOICE_SELF ? [civ("CIVILIZATION_GREECE")] : flag === T.SYNCRETIC_CHOICE_INFRASTRUCTURE ? [civ("CIVILIZATION_ROME"), civ("CIVILIZATION_EGYPT")] : [civ("CIVILIZATION_PERSIA")]),
        getSelfChoiceSyncreticUnlocks: () => [{ kind: "KIND_TRADITION", typeHash: 1 }, { kind: "KIND_CULTURE_SLOT", typeHash: 2 }],
        getInfrastructureChoiceSyncreticUnlocks: (t) => (t === "CIVILIZATION_EGYPT" ? [{ kind: "KIND_QUARTER", typeHash: 3 }] : [{ kind: "KIND_CONSTRUCTIBLE", typeHash: 4 }, { kind: "KIND_CONSTRUCTIBLE", typeHash: 5 }]),
    };
    Players.get(0).Identity = { ...identity, getSyncreticCivType: () => null };
    const ops = [PlayerOperationTypes.CHOOSE_SYNCRETISM_UNITS, PlayerOperationTypes.CHOOSE_SYNCRETISM_INFRASTRUCTURE, PlayerOperationTypes.CHOOSE_SYNCRETISM_SELF];
    const picked = () => fake.sent.filter((s) => ops.includes(s.op)).map((s) => [s.op, s.args.CivilizationType]);
    try {
        assert.deepEqual(choices.chooseSyncretism(), [], "not asked");
        world.notifications = [{ name: "NOTIFICATION_CHOOSE_SYNCRETISM" }];
        fake.sent.length = 0;
        const out = await choices.makeChoices(DEFAULT_SETTINGS);
        assert.deepEqual(picked(), [[PlayerOperationTypes.CHOOSE_SYNCRETISM_SELF, civ("CIVILIZATION_GREECE")]], "the choices pass answers it");
        assert.ok(out.some((e) => e.key === "SYNCRETISM"));
        // Once a turn: the notice stays until the game handles the choice.
        fake.sent.length = 0;
        assert.deepEqual(choices.chooseSyncretism(), []);
        assert.deepEqual(picked(), []);
        // Its own without a culture slot: the infrastructure with a unique quarter (Egypt over Rome's two buildings).
        Game.Unlocks.getSelfChoiceSyncreticUnlocks = () => [{ kind: "KIND_TRADITION", typeHash: 1 }];
        Game.turn += 1;
        fake.sent.length = 0;
        choices.chooseSyncretism();
        assert.deepEqual(picked(), [[PlayerOperationTypes.CHOOSE_SYNCRETISM_INFRASTRUCTURE, civ("CIVILIZATION_EGYPT")]]);
        // Game 41: the game answers "none" (-1) before a choice; the notice waits: the choice is made.
        Players.get(0).Identity = { ...identity, getSyncreticCivType: () => -1 };
        Game.turn += 1;
        fake.sent.length = 0;
        assert.ok(choices.chooseSyncretism().some((e) => e.key === "SYNCRETISM"));
        assert.equal(picked().length, 1);
        // The game refuses (a choice made): nothing sent, UI.log says why.
        const canStart = Game.PlayerOperations.canStart;
        Game.PlayerOperations.canStart = () => ({ Success: false, FailureReasons: ["LOC_ALREADY"] });
        Game.turn += 1;
        fake.sent.length = 0;
        assert.deepEqual(choices.chooseSyncretism(), []);
        Game.PlayerOperations.canStart = canStart;
        assert.deepEqual(picked(), []);
    } finally {
        Game.turn = turn;
        Game.Unlocks = unlocks;
        if (identity === undefined) delete Players.get(0).Identity;
        else Players.get(0).Identity = identity;
        delete world.notifications;
    }
});

// Research/34 §1: game 28 swapped Living Standards (−25% building upkeep, Happiness too) for Social Science (+3 Science a
// specialist, +1 Food and Happiness upkeep a specialist) while its cities stood below zero; their production fell 187 → 110
// and their science 260 → 182. The previews' empire-wide sum hid what each city lost to the game's penalty.
test("a policy's Happiness is priced in each settlement: below zero, Social Science does not replace Living Standards; in calm cities it does", () => {
    installPreviews();
    reset();
    const SPEC = 4; // specialists in each city, 6 Happiness and 2 Food upkeep each (the Modern age's)
    rows.push({ TraditionType: "TRADITION_LIVING", Name: "Living Standards", slot: 2, yields: { YIELD_GOLD: 4, YIELD_HAPPINESS: 4 }, $index: rows.length, $hash: 100 + rows.length });
    rows.push({ TraditionType: "TRADITION_SOCIAL", Name: "Social Science", slot: 2, yields: { YIELD_SCIENCE: 3 * SPEC * 2, YIELD_FOOD: -SPEC * 2, YIELD_HAPPINESS: -SPEC * 2 }, $index: rows.length, $hash: 100 + rows.length });
    const H = (t) => rows.find((r) => r.TraditionType === t).$hash;
    useModifiers([
        { id: "LIVING_MOD", effect: "EFFECT_CITY_ADJUST_BUILDING_MAINTENANCE_EFFICIENCY", args: { Gold: "true", Happiness: "true", Amount: 25 } },
        { id: "SOCIAL_SCI", effect: "EFFECT_CITY_ADJUST_WORKER_YIELD", args: { YieldType: "YIELD_SCIENCE", Amount: 3 } },
        { id: "SOCIAL_HAPPY", effect: "EFFECT_CITY_ADJUST_WORKER_MAINTENANCE_EFFICIENCY", args: { YieldType: "YIELD_HAPPINESS", Amount: 1 } },
        { id: "SOCIAL_FOOD", effect: "EFFECT_CITY_ADJUST_WORKER_MAINTENANCE_EFFICIENCY", args: { YieldType: "YIELD_FOOD", Amount: 1 } },
    ]);
    GameInfo.TraditionModifiers = [
        { TraditionType: "TRADITION_LIVING", ModifierId: "LIVING_MOD" },
        { TraditionType: "TRADITION_SOCIAL", ModifierId: "SOCIAL_SCI" }, { TraditionType: "TRADITION_SOCIAL", ModifierId: "SOCIAL_HAPPY" }, { TraditionType: "TRADITION_SOCIAL", ModifierId: "SOCIAL_FOOD" },
    ];
    const at = (yieldType, n) => {
        const a = Array.from(GameInfo.Yields, () => 0);
        a[GameInfo.Yields.lookup(yieldType).$index] = n;
        return a;
    };
    const happyFood = (h, f) => at("YIELD_HAPPINESS", h).map((v, i) => v + at("YIELD_FOOD", f)[i]);
    // Each city: two buildings costing 4 Happiness each on a tile next to it (Living Standards gives 2 of those 8 back).
    world.cities = [{ owner: 0, x: 2, y: 2, name: "Nineveh" }, { owner: 0, x: 6, y: 6, name: "Kalhu" }];
    for (const c of world.cities) Object.assign(c, { prod: 40, food: 10, nets: { YIELD_SCIENCE: 40, YIELD_GOLD: 20, YIELD_CULTURE: 10 } });
    world.structures = (x, y) => (world.cities.some((c) => c.x + 1 === x && c.y === y) ? { district: "DISTRICT_URBAN", constructibles: ["BUILDING_LIBRARY", "BUILDING_MONUMENT"] } : { district: null, constructibles: [] });
    world.maintenance = () => at("YIELD_HAPPINESS", 4);
    world.workers = () => [{ PlotIndex: 0, IsBlocked: false, NumWorkers: SPEC, MaxWorkers: SPEC, CurrentYields: at("YIELD_SCIENCE", 0), NextYields: at("YIELD_SCIENCE", 0), CurrentMaintenance: happyFood(6 * SPEC, 2 * SPEC), NextMaintenance: happyFood(6 * SPEC, 2 * SPEC) }];
    culture.canSwapCultureSlot = () => true;
    slots[2] = 1;
    active.add(H("TRADITION_LIVING"));
    const science = { ...DEFAULT_SETTINGS, profile: "SCIENCE" };
    try {
        for (const c of world.cities) c.happy = -5;
        assert.deepEqual(choices.swapOnePolicy(science), [], "below zero: 4 more upkeep a city costs 20% of its other yields");
        for (const c of world.cities) c.happy = 30;
        const out = choices.swapOnePolicy(science);
        assert.deepEqual([out[0]?.args[0], out[0]?.args[2]], ["Living Standards", "Social Science"], JSON.stringify(out));
    } finally {
        rows.splice(-2);
        clearModifiers();
        delete culture.canSwapCultureSlot;
        for (const k of ["structures", "maintenance", "workers"]) delete world[k];
        world.cities = [];
        slots[2] = 0;
        active.clear();
    }
});

// A crisis card's Happiness pushed below zero was weighed ×2 (the old stand-in for the game's penalty); the penalty on the
// settlement's other yields is now priced on its own (localHappiness), so the Happiness itself counts once, as costValue does.
test("a crisis card's Happiness that crosses zero: the penalty on the other yields once, the Happiness at full weight", async () => {
    const { profileFor } = await import("../mod/expansion-planner/ui/core/xpl-profiles.js");
    const { happinessWorth } = await import("../mod/expansion-planner/ui/core/xpl-scarcity.js");
    installPreviews();
    reset();
    const w = profileFor(DEFAULT_SETTINGS).y;
    // The town's yields as the fake reports them: production 30, the rest 1; Happiness 2, −6 takes it to −4.
    const pen = happinessWorth(w, [1, 30, 1, 1, 1, 2, 1], 2, -6);
    const gold = (9 * w[5] - pen) / w[2]; // a gold card worth what the happiness card is worth with its Happiness ×1.5
    rows.push({ TraditionType: "CRISIS_SCORN", Name: "Provincial scorn", slot: 3, yields: { YIELD_HAPPINESS: -6 }, $index: rows.length, $hash: 100 + rows.length });
    rows.push({ TraditionType: "CRISIS_TAX", Name: "Tax", slot: 3, yields: { YIELD_GOLD: -gold }, $index: rows.length, $hash: 100 + rows.length });
    const offeredBefore = culture.getUnlockedTraditions;
    culture.getUnlockedTraditions = (t) => (t === 3 ? rows.filter((r) => r.TraditionType === "CRISIS_SCORN" || r.TraditionType === "CRISIS_TAX").map((r) => r.$hash) : offeredBefore(t));
    useModifiers([{ id: "SCORN_MOD", effect: "EFFECT_CITY_ADJUST_YIELD", args: { YieldType: "YIELD_HAPPINESS", Amount: -6 } }]);
    GameInfo.TraditionModifiers = [{ TraditionType: "CRISIS_SCORN", ModifierId: "SCORN_MOD" }];
    world.cities = [{ owner: 0, x: 6, y: 6, name: "Cole", isTown: true, happy: 2, prod: 30 }];
    slots[3] = 1;
    try {
        choices.fillOnePolicySlot(DEFAULT_SETTINGS);
        assert.deepEqual(chosen(), ["CRISIS_SCORN"], `−6 Happiness with its penalty (${pen.toFixed(1)}) against ${gold.toFixed(1)} gold`);
    } finally {
        rows.splice(-2);
        culture.getUnlockedTraditions = offeredBefore;
        clearModifiers();
        world.cities = [];
        slots[3] = 0;
    }
});
