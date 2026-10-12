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
