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
    for (const k of ["projects", "relations", "relationLevels", "events", "notifications", "diplomacy", "wars", "befriend", "allies", "blocker", "nextCallToArms", "peaceOk", "pendingDeals", "formalWarOk", "dealAnswer", "incomingDeals", "warSupport", "possibleDealItems"]) delete world[k];
    world.influence = 200;
    choices.resetBefriending();
    Object.assign(world, extra);
};
// A threat by independent 5 (threatenedSettlements' shape) and its befriending short of Influence: the reserve.
const threatBy5 = [{ settlement: { x: 2, y: 2, name: "Rome" }, count: 2, owners: [{ id: 5, independent: true }] }];
const saving = { 5: { status: DiplomacyProjectStatus.PROJECT_NO_VIABLE_TARGETS, cost: 300 } };
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

test("counter-spy also against a leader whose espionage reached us as a proposal to answer; a sanction is a hostile act, not a spy (research/23 D10)", () => {
    const projects = { 3: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 3, 80)] };
    const steal = { initialPlayer: 3, targetPlayer: 0, actionType: A.DIPLOMACY_ACTION_ESPIONAGE_STEAL_RICHES, responses: [{ responseType: 1, responseName: "OK", cost: 0 }] };
    reset({ notifications: [{ name: "NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED", target: { id: 72 } }], diplomacy: { 72: steal }, projects });
    choices.answerDiplomacy();
    reset({ projects });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started().filter(([t]) => t === A.DIPLOMACY_ACTION_COUNTER_SPY), [[A.DIPLOMACY_ACTION_COUNTER_SPY, 3]]);
    assert.equal(choices.hostileActs().get(3), Game.turn);
    reset({ events: { 0: [{ initialPlayer: 2, targetPlayer: 0, actionType: A.DIPLOMACY_ACTION_SABOTAGE_RESEARCH }] }, projects: { 2: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 2, 80)] } });
    assert.equal(choices.hostileActs().get(2), Game.turn, "a sanction under way against us");
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started().filter(([t]) => t === A.DIPLOMACY_ACTION_COUNTER_SPY), [], "no spy: no counter-spy");
});

test("reconciliation with an Unfriendly leader; nothing but counter-spy while we save for a threatening independent's befriending", () => {
    const projects = { 1: [project(A.DIPLOMACY_ACTION_SEND_DELEGATION, 1)], 2: [project(A.DIPLOMACY_ACTION_SEND_DELEGATION, 2)] };
    reset({ projects, relations: { 1: "UNFRIENDLY", 2: "FRIENDLY" } });
    const out = choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_SEND_DELEGATION, 1]]);
    assert.equal(out[0].key, "RECONCILE");
    reset({ projects, relations: { 1: "UNFRIENDLY" }, befriend: saving });
    choices.befriendIndependents(threatBy5);
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "200 Influence kept for a 300 befriending of the independent that threatens us");
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
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 1]], "never with a leader at war with us; Carthage not approached this age before Pericles (research/40 A4)");
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2, 300)] } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "not enough Influence");
});

test("a befriending we save for takes turns with endeavors: one endeavor, then the Influence is kept for it (game 60, M6)", () => {
    const projects = { 2: [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2)] };
    reset({ projects, befriend: { 5: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE } } });
    const canStart = Game.PlayerOperations.canStart;
    try {
        // The befriend project is offered but the Influence is short; no threat: an endeavor first (game 60: a waiting
        // befriending kept every endeavor out, 2 in Antiquity, none in Exploration).
        Game.PlayerOperations.canStart = (_p, op) => ({ Success: op !== "DIPLOMACY_ACTION_BEFRIEND" });
        choices.befriendIndependents([]);
        fake.sent.length = 0;
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]], "befriending's turn comes after an endeavor");
        // The next pass: befriending's turn, we are saving for it.
        fake.sent.length = 0;
        choices.befriendIndependents([]);
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

test("the game's -3 with the village listed above our Influence is a befriending to save for; -3 with no target is not (research/41: game 44)", () => {
    // Game 44: "status -3" came with the target's failure "not enough Influence 71/180", and the Influence went to
    // endeavors (befriending read -3 as "cannot befriend").
    const projects = { 2: [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2)] };
    reset({ projects, influence: 100, befriend: { 5: { status: DiplomacyProjectStatus.PROJECT_NO_VIABLE_TARGETS, cost: 160 } } });
    choices.befriendIndependents(threatBy5);
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [], "saving for the village: no endeavor");
    // No target listed (its village unseen): nothing to save for, the endeavor goes ahead.
    reset({ projects, influence: 100, befriend: { 5: { status: DiplomacyProjectStatus.PROJECT_NO_VIABLE_TARGETS } } });
    choices.befriendIndependents(threatBy5);
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
});

test("P-WAR-1 and P-STAT-1: what the declare-war popup reads for each met major at peace, written when it changes; the majors' strength every 10 turns (research/41 §2)", () => {
    reset({ relations: { 1: "HOSTILE", 2: "NEUTRAL" }, formalWarOk: [1], wars: [3], warSupport: { 1: { ours: 1, theirs: 0, influence: 0 }, 2: { ours: -2, theirs: 2, influence: 40 } } });
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        Game.turn = 40;
        choices.probeWars();
        const war = (id) => lines.filter((l) => l.includes(`war probe: p${id} `));
        assert.match(war(1)[0] ?? "", /: HOSTILE; surprise war yes; formal war yes; war support ours 1 theirs 0; their Influence \+0$/, lines.join(" | "));
        assert.match(war(2)[0] ?? "", /: NEUTRAL; surprise war yes; formal war no; war support ours -2 theirs 2; their Influence \+40$/);
        assert.equal(war(3).length, 0, "at war with us: not asked");
        assert.equal(lines.filter((l) => l.includes("war probe: stats T40 p0 (us)")).length, 1, "the strength line, ours first");
        lines.length = 0;
        Game.turn = 41;
        choices.probeWars();
        assert.deepEqual(lines, [], "nothing changed: nothing written (stats every 10 turns)");
    } finally {
        console.warn = warn;
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

const P = DiplomacyDealProposalActions;
const deals = () => fake.sent.filter((s) => s.kind === "deal");
const dealSends = () => deals().filter((d) => d.op === "send").map((d) => d.action);

test("peace: the AI is first asked privately (INSPECT, nothing shown), white peace is proposed only when it would accept, then not again for 3 turns (research/23 D2)", async () => {
    choices.resetPeace();
    reset({ wars: [1], peaceOk: [1], dealAnswer: () => P.ACCEPTED });
    const out = await choices.seekPeace();
    assert.deepEqual(deals().map((d) => d.op), ["clear", "add", "send", "send"]);
    assert.deepEqual(deals()[0].id, { direction: DiplomacyDealDirection.OUTGOING, player1: 0, player2: 1 });
    assert.deepEqual(deals()[1].item, { type: DiplomacyDealItemTypes.AGREEMENTS, agreementType: DiplomacyDealItemAgreementTypes.MAKE_PEACE });
    assert.deepEqual(dealSends(), [P.INSPECT, P.PROPOSED]);
    assert.equal(out[0].key, "PEACE_PROPOSED");
    reset({ wars: [1], peaceOk: [1], dealAnswer: () => P.ACCEPTED });
    await choices.seekPeace();
    assert.deepEqual(deals(), [], "not again so soon");
    const turn = Game.turn;
    try {
        Game.turn = turn + 3;
        reset({ wars: [1], peaceOk: [1], pendingDeals: [1], dealAnswer: () => P.ACCEPTED });
        await choices.seekPeace();
        assert.deepEqual(deals(), [], "a deal is pending");
        reset({ wars: [1], dealAnswer: () => P.ACCEPTED });
        await choices.seekPeace();
        assert.deepEqual(deals(), [], "the game does not allow peace yet");
        reset({ wars: [1], peaceOk: [1], dealAnswer: () => P.ACCEPTED });
        await choices.seekPeace();
        assert.deepEqual(dealSends(), [P.INSPECT, P.PROPOSED], "three turns later: again");
    } finally {
        Game.turn = turn;
    }
});

test("peace: our settlement they hold is asked back first; refused, a white peace (game 48: Киото stayed Amina's after a white peace)", async () => {
    // Carthage's second city was ours (originalOwner 0); the peace screen offers it from them (OFFER).
    world.cities.push({ owner: 1, x: 22, y: 6, name: "Kyoto", originalOwner: 0 });
    const kyoto = { owner: 1, id: 1 };
    const offer = { type: DiplomacyDealItemTypes.CITIES, subType: DiplomacyDealItemCityTransferTypes.OFFER, cityId: kyoto };
    const theirs = { type: DiplomacyDealItemTypes.CITIES, subType: DiplomacyDealItemCityTransferTypes.OFFER, cityId: { owner: 1, id: 0 } };
    try {
        choices.resetPeace();
        reset({ wars: [1], peaceOk: [1], possibleDealItems: { 1: [theirs, offer] }, dealAnswer: () => P.ACCEPTED });
        await choices.seekPeace();
        assert.deepEqual(deals().filter((d) => d.op === "add").map((d) => d.item), [
            { type: DiplomacyDealItemTypes.AGREEMENTS, agreementType: DiplomacyDealItemAgreementTypes.MAKE_PEACE }, offer,
        ], "Kyoto, not Carthage itself");
        assert.deepEqual(dealSends(), [P.INSPECT, P.PROPOSED]);
        // Refused with Kyoto, accepted without: the white peace is inspected and proposed in the same pass.
        choices.resetPeace();
        reset({ wars: [1], peaceOk: [1], possibleDealItems: { 1: [offer] }, dealAnswer: (_id, items) => (items.some((i) => i.cityId) ? P.REJECTED : P.ACCEPTED) });
        const out = await choices.seekPeace();
        assert.deepEqual(dealSends(), [P.INSPECT, P.INSPECT, P.PROPOSED]);
        assert.deepEqual(deals().filter((d) => d.op === "add").map((d) => !!d.item.cityId), [false, true, false], "the second deal is white");
        assert.equal(out[0]?.key, "PEACE_PROPOSED");
    } finally {
        world.cities.pop();
    }
});

test("peace: a leader who would refuse gets no proposal (no dialog); it is asked again after 3, then 6 turns (research/23 D2: 8 refusals in game 8)", async () => {
    choices.resetPeace();
    const turn = Game.turn;
    try {
        reset({ wars: [1], peaceOk: [1], dealAnswer: () => P.REJECTED });
        const out = await choices.seekPeace();
        assert.deepEqual(dealSends(), [P.INSPECT]);
        assert.deepEqual(out, []);
        assert.ok(deals().some((d) => d.op === "closeSession"), "the inspect's session is closed");
        for (const [dt, asked] of [[2, false], [3, true], [8, false], [9, true]]) {
            Game.turn = turn + dt;
            reset({ wars: [1], peaceOk: [1], dealAnswer: () => P.REJECTED });
            await choices.seekPeace();
            assert.deepEqual(dealSends(), asked ? [P.INSPECT] : [], `turn +${dt}`);
        }
    } finally {
        Game.turn = turn;
    }
});

test("peace: nothing is proposed while a diplomacy screen is open (research/23 D1)", async () => {
    choices.resetPeace();
    choices.setDiplomacyScreenProbe(() => true);
    try {
        reset({ wars: [1], peaceOk: [1], dealAnswer: () => P.ACCEPTED });
        await choices.seekPeace();
        assert.deepEqual(deals(), []);
    } finally {
        choices.setDiplomacyScreenProbe(null);
    }
});

test("a deal a leader sends us: a peace asking nothing, or a little gold, is accepted; one asking a settlement or much gold is rejected, so it never holds the turn (research/23 D1)", () => {
    const I = DiplomacyDealItemTypes;
    const peace = { type: I.AGREEMENTS, subType: DiplomacyDealItemAgreementTypes.MAKE_PEACE, from: 1, to: 0 };
    const answer = (items, gold = 1000) => {
        choices.resetPeace();
        reset({ wars: [1], incomingDeals: { 1: items } });
        world.gold = gold;
        return choices.answerIncomingDeals();
    };
    let out = answer([peace]);
    assert.deepEqual(deals().map((d) => [d.op, d.action, d.id.player2]), [["send", P.ACCEPTED, 1]]);
    assert.equal(out[0].key, "PEACE_ACCEPTED");
    out = answer([peace, { type: I.CITIES, from: 0, to: 1, cityId: { owner: 0, id: 3 } }]);
    assert.deepEqual(dealSends(), [P.REJECTED]);
    assert.deepEqual(out[0].key, "DEAL_REJECTED");
    answer([peace, { type: I.GOLD, from: 0, to: 1, amount: 200 }]);
    assert.deepEqual(dealSends(), [P.ACCEPTED], "200 of 1000 gold");
    answer([peace, { type: I.GOLD, from: 0, to: 1, amount: 400 }]);
    assert.deepEqual(dealSends(), [P.REJECTED], "400 of 1000 gold");
    answer([peace, { type: I.GOLD, from: 1, to: 0, amount: 400 }]);
    assert.deepEqual(dealSends(), [P.ACCEPTED], "gold for us");
    delete world.incomingDeals;
});

test("a call to arms against an enemy far away on another continent is joined with a formal war; on our continent or near, declined (research/21 G1, decision 5)", () => {
    const CALL = "NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR";
    const call = (enemy) => ({ notifications: [{ name: CALL, target: { id: 90 } }], diplomacy: { 90: { initialPlayer: 2, targetPlayer: enemy } }, allies: [2], blocker: { type: EndTurnBlockingTypes.OTHER, name: CALL }, nextCallToArms: 90 });
    const war = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.DECLARE_WAR).map((s) => s.args);
    const tiles = world.tiles;
    // Carthage (20,2) on continent 2, Rome (2,2) on continent 1.
    world.tiles = (x, y) => ({ ...tiles(x, y), continent: x >= 15 ? 2 : 1 });
    try {
        reset({ ...call(1), formalWarOk: [1] });
        let out = choices.answerCallsToArms({ retry: true });
        assert.deepEqual(war(), [{ Player1: 0, Player2: 1, Type: A.DIPLOMACY_ACTION_DECLARE_FORMAL_WAR }], JSON.stringify(out));
        assert.ok(out.some((e) => e.key === "JOINED_WAR"));
        reset({ ...call(1) });
        out = choices.answerCallsToArms({ retry: true });
        assert.deepEqual(war(), [], "no formal war allowed: declined");
        assert.ok(out.some((e) => e.key === "DECLINED_WAR"));
        reset({ ...call(3), formalWarOk: [3] });
        choices.answerCallsToArms({ retry: true });
        assert.deepEqual(war(), [], "Memphis is on our continent, 2 tiles away: declined");
        world.tiles = (x, y) => ({ ...tiles(x, y), continent: 1 });
        reset({ ...call(1), formalWarOk: [1] });
        choices.answerCallsToArms({ retry: true });
        assert.deepEqual(war(), [], "Carthage is far away but on our continent: declined");
        world.tiles = (x, y) => ({ ...tiles(x, y), continent: x >= 15 ? 2 : 1 });
        world.tiles = (x, y) => ({ ...tiles(x, y), continent: x >= 3 ? 2 : 1 });
        reset({ ...call(3), formalWarOk: [3] });
        choices.answerCallsToArms({ retry: true });
        assert.deepEqual(war(), [], "another continent but only 2 tiles away: declined");
    } finally {
        world.tiles = tiles;
    }
});

test("counter-spy renewed against a leader whose spy hit us within 30 turns, once ours has run its 20 turns (research/24 W9: steals at M40, M49, M66)", () => {
    const projects = { 2: [project(A.DIPLOMACY_ACTION_COUNTER_SPY, 2, 80)] };
    const counter = () => started().filter(([t, p]) => t === A.DIPLOMACY_ACTION_COUNTER_SPY && p === 2).length;
    const turn = Game.turn;
    try {
        Game.turn = turn + 1000;
        reset({ ...caught(2), projects });
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.equal(counter(), 1);
        Game.turn = turn + 1010;
        reset({ projects });
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.equal(counter(), 0, "ours still runs (20 turns)");
        Game.turn = turn + 1020;
        reset({ projects });
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.equal(counter(), 1, "ran out, the spy came 20 turns ago: renewed");
        Game.turn = turn + 1060;
        reset({ projects });
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.equal(counter(), 0, "no spy for 60 turns");
    } finally {
        Game.turn = turn;
    }
});

// Research/40 A4: endeavors from what the game offers, not a list of six; Lafayette's Reform; a leader per endeavor.
const { gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const forgetTargets = () => settings.remember(gameKey(), { endeavors: "" });

test("endeavors: the one worth most of those the game offers (a Reform over a collaboration), an unlocked one too (Military Aid), never Send Gold", () => {
    forgetTargets();
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_SEND_GOLD, 2), project(A.DIPLOMACY_ACTION_MILITARY_AID, 2)] }, relations: { 1: "HOSTILE", 3: "HOSTILE" } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_MILITARY_AID, 2]]);
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2), project(A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, 2)] }, relations: { 1: "HOSTILE", 3: "HOSTILE" } });
    choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, 2]], "a policy slot for good beats the priority's own");
});

test("endeavors go to a leader not approached this age before the one we stand worst with (Gregarious Animal: an action with every leader)", () => {
    forgetTargets();
    const both = (id) => [project(A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, id)];
    reset({ projects: { 2: both(2), 3: both(3) }, relations: { 1: "HOSTILE", 2: "NEUTRAL", 3: "NEUTRAL" } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 3]], "Memphis, the nearest");
    reset({ projects: { 2: both(2), 3: both(3) }, relations: { 1: "HOSTILE", 2: "NEUTRAL", 3: "NEUTRAL" } });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]], "then Athens, never approached");
});

test("Lafayette's Reform is started with every leader the game allows, whatever «Дипломатия» says; a leader's Reform is supported", () => {
    forgetTargets();
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, 2, 140)] } });
    let out = choices.startReforms();
    assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, 2]]);
    assert.equal(out[0].key, "REFORM");
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, 2, 140)] }, befriend: saving });
    choices.befriendIndependents(threatBy5);
    fake.sent.length = 0;
    choices.startReforms();
    assert.deepEqual(started(), [], "a threat: the Influence is kept for its independent's befriending");
    reset({ projects: { 2: [project(A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, 2, 400)] } });
    choices.startReforms();
    assert.deepEqual(started(), [], "not enough Influence");
    const R = DiplomaticResponseTypes;
    reset({ notifications: [{ name: "NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED", target: { id: 81 } }],
        diplomacy: { 81: { initialPlayer: 2, actionType: A.DIPLOMACY_ACTION_GRANT_POLICY_SLOT, actionGroup: 7, responses: [
            { responseType: R.DIPLOMACY_RESPONSE_ACCEPT, cost: 0, responseName: "Accept" },
            { responseType: R.DIPLOMACY_RESPONSE_SUPPORT, cost: 150, responseName: "Support" },
        ] } } });
    out = choices.answerDiplomacy();
    assert.equal(fake.sent.find((s) => s.op === PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION)?.args.Type, R.DIPLOMACY_RESPONSE_SUPPORT, "a tradition slot for good to its supporters");
});

// Research/40 B6: espionage. Game 41's rivals stole 45 technologies and 36 civics from us; we stole none.
test("espionage: the science focus steals a technology from the leader with the most science (Neutral or better), one at a time", () => {
    forgetTargets();
    const steal = (id) => project(A.DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH, id, 80);
    const science = { 2: 40, 3: 90 };
    const stats = [2, 3].map((id) => [id, Players.get(id).Stats]);
    for (const [id] of stats) Players.get(id).Stats = { getNetYield: () => science[id] };
    try {
        reset({ projects: { 2: [steal(2)], 3: [steal(3)] }, relations: { 1: "HOSTILE", 2: "NEUTRAL", 3: "FRIENDLY" } });
        const out = choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(started(), [[A.DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH, 3]], JSON.stringify(out));
        assert.equal(out[0].key, "ESPIONAGE_STEAL");
        reset({ projects: { 2: [steal(2)], 3: [steal(3)] }, relations: { 1: "HOSTILE", 2: "NEUTRAL", 3: "FRIENDLY" },
            events: { 0: [{ initialPlayer: 0, targetPlayer: 3, actionType: A.DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH }] } });
        choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(started().filter(([t]) => t === A.DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH), [], "ours runs already");
        reset({ projects: { 2: [steal(2)] }, relations: { 1: "HOSTILE", 2: "UNFRIENDLY", 3: "HOSTILE" } });
        choices.tendDiplomacy({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(started().filter(([t]) => t === A.DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH), [], "an Unfriendly leader: a spy revealed would make it worse");
    } finally {
        for (const [id, s] of stats) Players.get(id).Stats = s;
    }
});

test("espionage: a rival near the science victory gets its space program sabotaged, whatever «Дипломатия» says", () => {
    const SAB = A.DIPLOMACY_ACTION_ESPIONAGE_SABOTAGE_SPACE_PROGRAM;
    reset({ projects: { 2: [project(SAB, 2, 150)] } });
    let out = choices.sabotageSpace([{ cls: "SCIENCE", fixed: true, leader: 2, level: "DANGER" }]);
    assert.deepEqual(started(), [[SAB, 2]]);
    assert.equal(out[0].key, "SABOTAGE_SPACE");
    reset({ projects: { 2: [project(SAB, 2, 150)] } });
    out = choices.sabotageSpace([{ cls: "CULTURE", leader: 2, level: "DANGER" }, { cls: "SCIENCE", own: true, fixed: true, level: "CHANCE" }]);
    assert.deepEqual(started(), [], "no science rival near");
    reset({ projects: { 2: [project(SAB, 2, 150)] }, wars: [2] });
    choices.sabotageSpace([{ cls: "SCIENCE", fixed: true, leader: 2, level: "WATCH" }]);
    assert.deepEqual(started(), [], "at war with us");
});

// Research/40 B7: city-states we are suzerain of.
const ourCityState = () => {
    const cs = Players.get(5);
    const before = { isMinor: cs.isMinor, Influence: cs.Influence };
    cs.isMinor = true;
    cs.Influence = { hasSuzerain: true, getSuzerain: () => 0 };
    return () => Object.assign(cs, before);
};
const csArgs = (type) => fake.sent.filter((s) => s.kind === "player" && s.args.Type === type).map((s) => s.args);

test("a city-state we are suzerain of is incorporated while settlements count for us and the cap has room", () => {
    const restore = ourCityState();
    const INC = A.DIPLOMACY_ACTION_CS_INCORPORATE;
    try {
        reset({ projects: { 5: [project(INC, 5, 150)] } });
        let out = choices.incorporateCityState({ want: true, room: 2 });
        assert.deepEqual(csArgs(INC), [{ Player1: 0, Type: INC, Amount: 1, ID: 5 }], JSON.stringify(out));
        assert.equal(out[0].key, "INCORPORATE");
        reset({ projects: { 5: [project(INC, 5, 150)] } });
        assert.deepEqual(choices.incorporateCityState({ want: false, room: 2 }), [], "settlements do not count now");
        assert.deepEqual(choices.incorporateCityState({ want: true, room: 0 }), [], "at the cap");
    } finally {
        restore();
    }
});

test("a threatened settlement short of guards levies the strongest soldier a nearby city-state of ours offers", () => {
    const restore = ourCityState();
    const LEVY = A.DIPLOMACY_ACTION_CS_LEVY_UNIT;
    const unit = (t) => ({ parameterName: "Unit", targetName: t, targetID: GameInfo.Units.lookup(t).$hash, costYieldD: 60 });
    const threat = { settlement: { x: 2, y: 2, name: "Rome" }, count: 2, land: 2, owners: [] };
    try {
        reset({ projects: { 5: [{ ...project(LEVY, 5, 60), targetList2: [unit("UNIT_SLINGER"), unit("UNIT_WARRIOR"), unit("UNIT_SPEARMAN")] }] } });
        const out = choices.levyDefenders([threat]);
        assert.deepEqual(csArgs(LEVY).map((a) => [a.ID, GameInfo.Units.lookup(a.Unit)?.UnitType]), [[5, "UNIT_SPEARMAN"]], JSON.stringify(out));
        assert.equal(out[0].key, "LEVIED");
        assert.equal(out[0].args[1], "Celts", "the city-state by its city's name (game 42 logged «деревни»)");
        reset({ projects: { 5: [{ ...project(LEVY, 5, 60), targetList2: [unit("UNIT_SPEARMAN")] }] } });
        assert.deepEqual(choices.levyDefenders([]), [], "no threat");
        // Ships only (game 42: all five levies answered ships, which a land soldier cannot hit).
        reset({ projects: { 5: [{ ...project(LEVY, 5, 60), targetList2: [unit("UNIT_SPEARMAN")] }] } });
        assert.deepEqual(choices.levyDefenders([{ ...threat, count: 2, land: 0, ships: 2 }]), []);
        assert.deepEqual(csArgs(LEVY), []);
    } finally {
        restore();
    }
});
