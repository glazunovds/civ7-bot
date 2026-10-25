// «Учебная война» (research/41 §7; the user, 21 October: "one close nation much weaker than us, with low production and
// gold, optional, without making us much slower"): a Formal war on a weak, close, Hostile neighbour once an age, its army
// gathered from the soldiers the defence leaves free with the vanguard, War Support kept ahead, no peace until it ends by its
// own rules (a promotion, weariness, losses, …), then peace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 5 };
const SPARTA = { x: 5, y: 10 };
const ROME = { x: 13, y: 5 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 2, name: "Babylon" }],
    cities: [
        { owner: 0, ...ATHENS, name: "Athens", pop: 6, prod: 20 },
        { owner: 0, ...SPARTA, name: "Sparta", pop: 5, prod: 20 },
        { owner: 0, x: 2, y: 8, name: "Corinth", pop: 4, prod: 10 },
        { owner: 1, ...ROME, name: "Rome", pop: 4 },
        { owner: 1, x: 12, y: 9, name: "Ostia", pop: 3, isTown: true },
        { owner: 2, x: 28, y: 18, name: "Babylon", pop: 8 },
    ],
    units: [],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const army = () => [
    { id: 1, type: "UNIT_WARRIOR", ...ATHENS }, { id: 2, type: "UNIT_WARRIOR", ...SPARTA }, { id: 3, type: "UNIT_WARRIOR", x: 2, y: 8 },
    { id: 4, type: "UNIT_WARRIOR", x: 6, y: 5 }, { id: 5, type: "UNIT_WARRIOR", x: 6, y: 6 }, { id: 6, type: "UNIT_WARRIOR", x: 5, y: 6 },
    { id: 8, type: "UNIT_WARRIOR", x: 6, y: 4 }, { id: 9, type: "UNIT_WARRIOR", x: 4, y: 6 },
    { id: 20, type: "UNIT_ARMY_COMMANDER", x: 4, y: 5, xp: { level: 1, points: 0, next: 7 } },
];
const S = { autopilot: { trainingWar: true, defend: true } };
const f = (extra = {}) => ({ threats: [], war: { atWar: [], risk: [1], near: false }, watch: [], afterWin: null, strategy: null, focus: "SCIENCE", ageTurnsLeft: 40, ...extra });
const reset = (extra = {}) => {
    units.resetUnitGoals();
    choices.resetPeace();
    choices.resetTrainingWar();
    settings.remember(String(Math.random()), {}); // another game: this one's training-war memory starts empty
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "relations", "formalWarOk", "warSupport", "influence", "playerYields", "met", "warEvents", "peaceOk", "projects", "allies", "gameSeed", "incomingDeals", "possibleDealItems", "dealAnswer", "settlementCap"]) delete world[k];
    world.gameSeed = Math.floor(Math.random() * 1e9);
    world.units = army();
    Game.turn = 30;
    Object.assign(world, {
        met: [1, 2], relations: { 1: "HOSTILE", 2: "NEUTRAL" }, formalWarOk: [1], warSupport: { 1: { ours: 1, theirs: 0 } }, influence: 200,
        playerYields: { 0: { YIELD_PRODUCTION: 50 }, 1: { YIELD_PRODUCTION: 20 }, 2: { YIELD_PRODUCTION: 80 } },
        // Rome: 2 Warriors at home; Babylon far away with many.
        enemies: [{ x: 14, y: 5, owner: 1, type: "UNIT_WARRIOR" }, { x: 13, y: 6, owner: 1, type: "UNIT_WARRIOR" },
            ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ x: 20 + (i % 5), y: 16 + Math.floor(i / 5), owner: 2, type: "UNIT_WARRIOR" }))],
    }, extra);
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, trainingWar: true, threats: [], fronts: [], exposed: [], ...options });
const keys = (r) => (Array.isArray(r) ? r : r.entries).map((e) => e.key);
const declared = () => fake.sent.filter((s) => s.kind === "player" && s.op === PlayerOperationTypes.DECLARE_WAR);

test("off (the default), nothing: no war is declared, whatever the neighbour", () => {
    reset();
    assert.equal(DEFAULT_SETTINGS.autopilot.trainingWar, false);
    run({ trainingWar: false });
    assert.deepEqual(choices.trainingWarStep({ autopilot: { trainingWar: false, defend: true } }, f()), []);
    assert.deepEqual(declared(), []);
});

test("a weak, close, Hostile neighbour alone gets a Formal war once our army is ready; the army gathers the next pass", () => {
    reset();
    run(); // the readiness: the soldiers the defence leaves free and a free commander
    const out = choices.trainingWarStep(S, f());
    assert.deepEqual(keys(out), ["TRAINING_WAR_DECLARED"], JSON.stringify(out));
    assert.deepEqual(declared().map((s) => [s.args.Player2, s.args.Type]), [[1, DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_FORMAL_WAR]], "Formal, never a surprise");
    assert.equal(units.trainingWarEnemy(), 1);
    // At war the next pass: the army gathers 3 tiles from Rome with the commander.
    world.wars = [1];
    Game.turn = 31;
    const r = run();
    assert.ok(keys(r).includes("TRAINING_WAR_GATHER"), JSON.stringify(r.entries));
    const op = units.fieldOpState();
    assert.equal(op?.kind, "WAR");
    assert.equal(GameplayMap.getPlotDistance(op.staging.x, op.staging.y, ROME.x, ROME.y), 3);
    assert.ok(op.members.length >= 4, JSON.stringify(op.members));
    assert.equal(op.commander, "0:20");
    // Once an age: not again after it.
    units.endTrainingWar("OFF");
    delete world.wars;
    fake.sent.length = 0;
    run();
    choices.trainingWarStep(S, f());
    assert.deepEqual(declared(), [], "one training war an age");
});

test("no training war: a strong neighbour, one with an ally, an unready army, the final age, a war already", () => {
    for (const [extra, why] of [
        [{ enemies: [...Array(6)].map((_, i) => ({ x: 14, y: i, owner: 1, type: "UNIT_WARRIOR" })) }, "6 soldiers against our 8: strong"],
        [{ allies: [1] }, "our ally"],
        [{ formalWarOk: [] }, "no formal war allowed"],
        [{ warSupport: { 1: { ours: 0, theirs: 1 } } }, "their War Support leads"],
        [{ influence: 100 }, "Influence for less than 2 points"],
    ]) {
        reset(extra);
        run();
        choices.trainingWarStep(S, f());
        assert.deepEqual(declared(), [], why);
    }
    reset();
    run();
    choices.trainingWarStep(S, f({ threats: [{ settlement: ATHENS, count: 2 }] }));
    assert.deepEqual(declared(), [], "a threatened settlement");
    reset();
    world.units = army().filter((u) => u.type !== "UNIT_ARMY_COMMANDER");
    run();
    choices.trainingWarStep(S, f());
    assert.deepEqual(declared(), [], "no free commander");
    reset();
    Game.AgeProgressManager.isFinalAge = true;
    try {
        run();
        choices.trainingWarStep(S, f());
        assert.deepEqual(declared(), [], "the final age (ideologies)");
    } finally {
        Game.AgeProgressManager.isFinalAge = false;
    }
    reset();
    run();
    choices.trainingWarStep(S, f({ war: { atWar: [2], risk: [1], near: false } }));
    assert.deepEqual(declared(), [], "another war");
});

test("a Neutral weak neighbour is denounced toward Hostile, 10 turns apart", () => {
    const DENOUNCE = DiplomacyActionTypes.DIPLOMACY_ACTION_DENOUNCE;
    reset({ relations: { 1: "NEUTRAL", 2: "NEUTRAL" }, formalWarOk: [] });
    world.projects = { 1: [{ actionType: DENOUNCE, operationType: "DIPLOMACY_ACTION_DENOUNCE", projectStatus: 0, targetList1: [{ targetID: 1, costYieldD: 55 }] }] };
    run();
    let out = choices.trainingWarStep(S, f());
    assert.deepEqual(keys(out), ["DENOUNCED"], JSON.stringify(out));
    assert.deepEqual(declared(), []);
    fake.sent.length = 0;
    Game.turn = 35;
    run();
    out = choices.trainingWarStep(S, f());
    assert.deepEqual(keys(out), [], "5 turns later: not yet");
    Game.turn = 40;
    run();
    out = choices.trainingWarStep(S, f());
    assert.deepEqual(keys(out), ["DENOUNCED"]);
});

test("during the war: War Support bought when theirs reaches ours, no peace proposed or taken; a promotion ends it and peace comes", async () => {
    reset();
    run();
    choices.trainingWarStep(S, f());
    world.wars = [1];
    world.peaceOk = [1];
    Game.turn = 31;
    run();
    // Their support equals ours: a point bought (60 of 200 spare).
    world.warEvents = { 1: { id: 700, initial: true, supporting: 1, opposing: 1, price: 60 } };
    fake.sent.length = 0;
    const out = choices.trainingWarStep(S, f());
    assert.deepEqual(keys(out), ["WAR_SUPPORT_BOUGHT"], JSON.stringify(out));
    const bought = fake.sent.find((s) => s.kind === "player" && s.op === PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION);
    assert.deepEqual([bought?.args.ID, bought?.args.SubType, bought?.args.Amount], [700, true, 1]);
    // No peace proposed while it runs.
    fake.sent.length = 0;
    const peace = await choices.seekPeace({});
    assert.ok(keys(peace).includes("TRAINING_PEACE_HELD"), JSON.stringify(peace));
    assert.ok(!fake.sent.some((s) => s.kind === "deal"), "no deal sent");
    // The commander levels up: the war ends, and peace is sought.
    world.units.find((u) => u.id === 20).xp = { level: 2, points: 0, next: 15 };
    Game.turn = 32;
    const r = run();
    assert.ok(keys(r).includes("TRAINING_WAR_ENDED"), JSON.stringify(r.entries));
    assert.equal(units.trainingWarEnemy(), null);
    world.dealAnswer = () => DiplomacyDealProposalActions.ACCEPTED;
    fake.sent.length = 0;
    const after = await choices.seekPeace({});
    assert.ok(keys(after).includes("PEACE_PROPOSED"), JSON.stringify(after));
    delete world.dealAnswer;
});

test("an offered white peace is refused while the training war runs; after it, our peace asks for their nearest town when our War Support leads by 3", async () => {
    reset();
    run();
    choices.trainingWarStep(S, f());
    world.wars = [1];
    world.peaceOk = [1];
    Game.turn = 31;
    run();
    const I = DiplomacyDealItemTypes;
    world.incomingDeals = { 1: [{ type: I.AGREEMENTS, subType: DiplomacyDealItemAgreementTypes.MAKE_PEACE, from: 1, to: 0 }] };
    fake.sent.length = 0;
    const answered = choices.answerIncomingDeals();
    assert.deepEqual(keys(answered), ["TRAINING_PEACE_HELD"], JSON.stringify(answered));
    assert.ok(fake.sent.some((s) => s.kind === "deal" && s.action === DiplomacyDealProposalActions.REJECTED));
    delete world.incomingDeals;
    // It ends; our War Support leads by 3 and the cap has room: Ostia, their town, is asked for.
    units.endTrainingWar("PROMOTED");
    world.warEvents = { 1: { id: 700, initial: true, supporting: 4, opposing: 1, price: 60 } };
    world.settlementCap = 6;
    world.possibleDealItems = { 1: [{ type: I.CITIES, subType: DiplomacyDealItemCityTransferTypes.OFFER, cityId: { owner: 1, id: 1, type: 1 } }] };
    world.dealAnswer = () => DiplomacyDealProposalActions.ACCEPTED;
    fake.sent.length = 0;
    await choices.seekPeace({});
    const asked = fake.sent.filter((s) => s.kind === "deal" && s.op === "add" && s.item.type === I.CITIES).map((s) => s.item.cityId.id);
    assert.deepEqual(asked, [1], JSON.stringify(fake.sent.filter((s) => s.kind === "deal")));
    // With support even: a white peace only.
    choices.resetPeace();
    world.warEvents = { 1: { id: 700, initial: true, supporting: 1, opposing: 1, price: 60 } };
    fake.sent.length = 0;
    await choices.seekPeace({});
    assert.ok(!fake.sent.some((s) => s.kind === "deal" && s.op === "add" && s.item.type === I.CITIES));
});
