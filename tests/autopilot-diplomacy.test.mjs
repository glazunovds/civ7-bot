// Diplomacy with other leaders («Дипломатия»): counter-spy against a caught spy's leader,
// reconciliation with an unfriendly leader, an endeavor («Инициатива») while Influence is not
// going to befriending independents, and supporting a leader's endeavor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 30, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 5, isIndependent: true }],
    cities: [
        { owner: 0, x: 2, y: 2, name: "Rome" },
        { owner: 1, x: 20, y: 2, name: "Carthage" },
        { owner: 2, x: 8, y: 2, name: "Athens" },
        { owner: 3, x: 4, y: 3, name: "Memphis" },  // nearer than Athens
        { owner: 5, x: 4, y: 8, name: "Celts" },
    ],
    met: [1, 2, 3],
    influence: 200,
};
const fake = installFakeEngine(world);
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const A = DiplomacyActionTypes;
const project = (actionType, target, cost = 60, status = DiplomacyProjectStatus.PROJECT_AVAILABLE) =>
    ({ actionType, operationType: `OP_${actionType}`, projectStatus: status, targetList1: [{ targetID: target, costYieldD: cost }] });
const started = () => fake.sent.filter((s) => s.kind === "player" && String(s.op).startsWith("OP_")).map((s) => [s.args.Type, s.args.Player2]);
const reset = (extra = {}) => {
    fake.sent.length = 0;
    for (const k of ["projects", "relations", "relationLevels", "events", "notifications", "diplomacy", "wars", "befriend", "allies", "blocker", "nextCallToArms", "peaceOk", "pendingDeals"]) delete world[k];
    world.influence = 200;
    Object.assign(world, extra);
};
const caught = (initialPlayer, revealed = true) => ({
    notifications: [{ name: "NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE", target: { id: 70 } }],
    diplomacy: { 70: { initialPlayer, targetPlayer: initialPlayer === 0 ? 1 : 0, revealed } },
});

test("a spy caught against us: counter-spy against that leader (the panel's quick start), not twice", () => {
    reset({ ...caught(1), projects: { 1: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 1, 80)] } });
    let out = choices.tendDiplomacy(DEFAULT_SETTINGS);
    const sent = fake.sent.find((s) => s.op === `OP_${A.DIPLOMACY_ACTION_COUNTER_SPY}`);
    assert.deepEqual(sent?.args, { Amount: 1, Player1: 0, Type: A.DIPLOMACY_ACTION_COUNTER_SPY, Player2: 1, ID: 1 });
    assert.deepEqual(out.map((e) => e.key), ["COUNTER_SPY"]);
    // Next turn (the notice is gone): nothing more.
    reset({ projects: { 1: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 1, 80)] } });
    out = choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started().filter(([t]) => t === A.DIPLOMACY_ACTION_COUNTER_SPY), []);
});

test("counter-spy: not for our own spy caught, not for an unrevealed one, not while one runs; short of Influence it waits", () => {
    const projects = { 1: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 1, 80)] };
    reset({ ...caught(0), projects: { ...projects, 0: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 0, 80)] } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "our own spy");
    reset({ ...caught(1, false), projects });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "an unknown leader");
    reset({ ...caught(1), projects, events: { 0: [{ initialPlayer: 0, targetPlayer: 1, actionType: A.DIPLOMACY_ACTION_COUNTER_SPY }] } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "already running");
    reset({ ...caught(1), projects, influence: 50 });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "80 Influence needed");
    reset({ projects, influence: 100 });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_COUNTER_SPY, 1]], "remembered: started once Influence allows");
});

test("reconciliation with an Unfriendly leader; nothing but counter-spy while a settlement is threatened", () => {
    const projects = { 1: [project(A.DIPLOMACY_ACTION_SEND_DELEGATION, 1)], 2: [project(A.DIPLOMACY_ACTION_SEND_DELEGATION, 2)] };
    reset({ projects, relations: { 1: "UNFRIENDLY", 2: "FRIENDLY" } });
    const out = choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_SEND_DELEGATION, 1]]);
    assert.equal(out[0].key, "RECONCILE");
    reset({ projects, relations: { 1: "UNFRIENDLY" } });
    choices.tendDiplomacy(DEFAULT_SETTINGS, { threatened: true });
    assert.deepEqual(started(), []);
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_SEND_DELEGATION, 2)] }, relations: { 2: "NEUTRAL" } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "no reconciliation needed with a Neutral leader");
});

test("an endeavor that fits the priority, with the leader we stand worst with (not hostile, not at war); one a turn", () => {
    const both = (id) => [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, id), project(A.DIPLOMACY_ACTION_CULTURAL_EXCHANGE, id)];
    const projects = { 1: both(1), 2: both(2), 3: both(3) };
    reset({ projects, relations: { 1: "HOSTILE", 2: "NEUTRAL", 3: "FRIENDLY" }, wars: [] });
    let out = choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "CULTURE" });
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_CULTURAL_EXCHANGE, 2]], "Neutral Pericles before Friendly; nothing with the Hostile one");
    assert.deepEqual(out.map((e) => e.key), ["ENDEAVOR"]);
    reset({ projects, relations: { 2: "NEUTRAL", 3: "NEUTRAL" } });
    choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 3]], "equal standing: the nearest; science first");
    reset({ projects, relations: { 2: "NEUTRAL", 3: "NEUTRAL" }, wars: [3] });
    choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]], "never with a leader at war with us");
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2, 300)] } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "not enough Influence");
});

test("no endeavor while Influence goes to befriending independents", () => {
    const projects = { 2: [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2)] };
    reset({ projects, befriend: { 5: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE } } });
    const canStart = Game.PlayerOperations.canStart;
    try {
        // The befriend project is offered but the Influence is short: we are saving for it.
        Game.PlayerOperations.canStart = (_p, op) => ({ Success: op !== "DIPLOMACY_ACTION_BEFRIEND" });
        choices.befriendIndependents([]);
        fake.sent.length = 0;
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(started(), []);
        // Nothing to befriend: the endeavor goes ahead.
        reset({ projects });
        choices.befriendIndependents([]);
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
    } finally {
        Game.PlayerOperations.canStart = canStart;
    }
});

test("a leader's endeavor is supported (not only accepted) with the diplomacy option, when Influence allows", async () => {
    const R = DiplomaticResponseTypes;
    const proposal = (group) => ({
        notifications: [{ name: "NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED", target: { id: 80 } }],
        diplomacy: { 80: { initialPlayer: 2, actionType: 35, actionGroup: group, responses: [
            { responseType: R.DIPLOMACY_RESPONSE_ACCEPT, cost: 0, responseName: "Accept" },
            { responseType: R.DIPLOMACY_RESPONSE_SUPPORT, cost: 60, responseName: "Support" },
            { responseType: R.DIPLOMACY_RESPONSE_REJECT, cost: 20, responseName: "Reject" },
        ] } },
    });
    const answer = () => fake.sent.find((s) => s.op === PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION)?.args.Type;
    reset(proposal(DiplomacyActionGroups.DIPLOMACY_ACTION_GROUP_ENDEAVOR));
    choices.answerDiplomacy({ support: true });
    assert.equal(answer(), R.DIPLOMACY_RESPONSE_SUPPORT);
    reset(proposal(DiplomacyActionGroups.DIPLOMACY_ACTION_GROUP_ENDEAVOR));
    choices.answerDiplomacy();
    assert.equal(answer(), R.DIPLOMACY_RESPONSE_ACCEPT, "without the option: the cheapest");
    reset({ ...proposal(DiplomacyActionGroups.DIPLOMACY_ACTION_GROUP_ENDEAVOR), influence: 40 });
    choices.answerDiplomacy({ support: true });
    assert.equal(answer(), R.DIPLOMACY_RESPONSE_ACCEPT, "not enough Influence to support");
    reset(proposal(7));
    choices.answerDiplomacy({ support: true });
    assert.equal(answer(), R.DIPLOMACY_RESPONSE_ACCEPT, "only endeavors are supported");
    // Every choices pass does it when the option is on.
    reset(proposal(DiplomacyActionGroups.DIPLOMACY_ACTION_GROUP_ENDEAVOR));
    await choices.makeChoices({ ...DEFAULT_SETTINGS, autopilot: { ...DEFAULT_SETTINGS.autopilot, diplomacy: true } });
    assert.equal(answer(), R.DIPLOMACY_RESPONSE_SUPPORT);
});

test("an ally's call to arms is never joined (a surprise war with war weariness, seen in game): set aside; declined only while the game still holds the turn", async () => {
    const CALL = "NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR";
    const call = (enemy) => ({ notifications: [{ name: CALL, target: { id: 90 } }], diplomacy: { 90: { initialPlayer: 2, targetPlayer: enemy } }, allies: [2] });
    const war = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.DECLARE_WAR);
    const breaks = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.CANCEL_ALLIANCE).map((s) => s.args);
    reset(call(1)); // Carthage, far away: still not joined
    let out = choices.answerCallsToArms();
    assert.deepEqual(war(), []);
    assert.deepEqual(breaks(), [], "the first time only set aside");
    assert.equal(fake.sent.filter((s) => s.kind === "dismiss").length, 1);
    assert.equal(out[0].key, "WAR_CALL_SEEN");
    // The game still holds the turn for it on the end-of-turn retry: declined as the screen does.
    reset({ ...call(3), blocker: { type: EndTurnBlockingTypes.OTHER, name: CALL }, nextCallToArms: 90 });
    out = choices.answerCallsToArms({ retry: true });
    assert.deepEqual(war(), []);
    assert.deepEqual(breaks(), [{ Player1: 0, Player2: 2, Type: A.DIPLOMACY_ACTION_FORM_ALLIANCE }]);
    assert.ok(out.some((e) => e.key === "DECLINED_WAR"));
    reset({ ...call(1), blocker: { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_BELIEF" }, nextCallToArms: 90 });
    choices.answerCallsToArms({ retry: true });
    assert.deepEqual(breaks(), [], "something else holds the turn: the alliance stays");
    reset(call(1));
    out = await choices.makeChoices(DEFAULT_SETTINGS);
    assert.ok(out.some((e) => e.key === "WAR_CALL_SEEN"), "every choices pass reads it");
    assert.deepEqual(war(), []);
});

test("peace, nothing given or asked, is proposed to a leader at war with us when the game allows it, every 3 turns at most", () => {
    const deals = () => fake.sent.filter((s) => s.kind === "deal");
    reset({ wars: [1], peaceOk: [1] });
    const out = choices.seekPeace();
    assert.deepEqual(deals().map((d) => d.op), ["clear", "add", "send"]);
    assert.deepEqual(deals()[0].id, { direction: DiplomacyDealDirection.OUTGOING, player1: 0, player2: 1 });
    assert.deepEqual(deals()[1].item, { type: DiplomacyDealItemTypes.AGREEMENTS, agreementType: DiplomacyDealItemAgreementTypes.MAKE_PEACE });
    assert.equal(deals()[2].action, DiplomacyDealProposalActions.PROPOSED);
    assert.equal(out[0].key, "PEACE_PROPOSED");
    reset({ wars: [1], peaceOk: [1] });
    choices.seekPeace();
    assert.deepEqual(deals(), [], "not again so soon");
    const turn = Game.turn;
    try {
        Game.turn = turn + 3;
        reset({ wars: [1], peaceOk: [1], pendingDeals: [1] });
        choices.seekPeace();
        assert.deepEqual(deals(), [], "a deal is pending");
        reset({ wars: [1] });
        choices.seekPeace();
        assert.deepEqual(deals(), [], "the game does not allow peace yet");
        reset({ wars: [1], peaceOk: [1] });
        choices.seekPeace();
        assert.equal(deals().length, 3, "three turns later: again");
    } finally {
        Game.turn = turn;
    }
});
