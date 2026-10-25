// Befriending independents after game 60 (research/game60, mechanics M5, M6, X1; errors E6, scouts SCM-1, economy E8):
// a village the game says we have not found keeps no Influence, a befriending another leader wins or the age's end cuts
// short is not started, ours is supported when it would lose or not finish, and endeavors, steals and reconciliation
// spend what lies above the one reserve befriending keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 30, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 2 }, { id: 5, isIndependent: true }, { id: 6, isIndependent: true }, { id: 8 }],
    cities: [
        { owner: 0, x: 2, y: 2, name: "Rome" },
        { owner: 2, x: 8, y: 2, name: "Athens" },
        { owner: 5, x: 4, y: 4, name: "Celts" },     // the nearer independent
        { owner: 6, x: 12, y: 8, name: "Nubians" },
        { owner: 8, x: 25, y: 10, name: "Carthage" },
    ],
    met: [2, 8],
    influence: 180,
};
const fake = installFakeEngine(world);
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const A = DiplomacyActionTypes;
const GIVE = A.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN;
const S = DiplomacyProjectStatus;
const NO_VISION = "LOC_DIPLOMACY_ACTION_FAILURE_NO_VISION"; // the fake's Locale.compose answers the key
// The befriend project of one independent as the game lists it: its own target at its price, with the failure reasons.
const befriendProject = (id, cost, status = S.PROJECT_NO_VIABLE_TARGETS, reasons = []) => ({
    actionType: GIVE, operationType: "DIPLOMACY_ACTION_BEFRIEND", projectStatus: status,
    targetList1: [{ targetID: id, costYieldD: cost, resultData: { FailureReasons: reasons } }],
});
const collaboration = (id, cost = 60) => ({ actionType: A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, operationType: `OP_${A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION}`, projectStatus: S.PROJECT_AVAILABLE, targetList1: [{ targetID: id, costYieldD: cost }] });
const threatBy = (id) => [{ settlement: { x: 2, y: 2, name: "Rome" }, count: 2, owners: [{ id, independent: true }] }];
const befriended = () => fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_BEFRIEND").map((s) => s.args.ID);
const supported = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION).map((s) => s.args.ID);
const endeavors = () => fake.sent.filter((s) => s.kind === "player" && String(s.op).startsWith("OP_")).map((s) => [s.args.Type, s.args.Player2]);
const lines = [];
const warn = console.warn;
console.warn = (...a) => lines.push(a.join(" "));
const reset = (extra = {}) => {
    fake.sent.length = 0;
    lines.length = 0;
    for (const k of ["projects", "befriend", "events", "completion", "diplomacy", "relations"]) delete world[k];
    world.influence = 180;
    choices.resetBefriending();
    Object.assign(world, extra);
};
// The befriending's duration from the game's data (Antiquity: BaseDuration 60, BaseTokenCost 2: 30 turns at Standard).
GameInfo.DiplomacyActions = { lookup: (t) => (t === GIVE ? { DiplomacyActionType: "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN", BaseDuration: 60, BaseTokenCost: 2 } : null) };

test("X1: a threatening village the game says we have not found keeps no Influence: it is approached, the next befriending starts", () => {
    // Game 60: 49 passes «… kept for it (Вы еще не нашли их деревню.)», and every endeavor waited.
    reset({ projects: { 5: [befriendProject(5, 204, S.PROJECT_NO_VIABLE_TARGETS, [NO_VISION])], 6: [befriendProject(6, 150, S.PROJECT_AVAILABLE)] } });
    choices.befriendIndependents(threatBy(5));
    assert.deepEqual(befriended(), [6], "the next one in order is befriended");
    assert.deepEqual(choices.unbefriendable(), [5], "a unit goes toward the village not found (root gotcha 42)");
    assert.ok(lines.some((l) => /befriend: .*village not found, Influence not kept/.test(l)), lines.join("\n"));
    // Nothing else to befriend: the endeavor goes ahead.
    reset({ projects: { 5: [befriendProject(5, 204, S.PROJECT_NO_VIABLE_TARGETS, [NO_VISION])], 2: [collaboration(2)] } });
    choices.befriendIndependents(threatBy(5));
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(endeavors(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
    // The same price, short of Influence and seen (research/41 §1): kept for it, nothing else.
    reset({ projects: { 5: [befriendProject(5, 204, S.PROJECT_NO_VIABLE_TARGETS, ["not enough Influence 180/204"])], 2: [collaboration(2)] } });
    choices.befriendIndependents(threatBy(5));
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(endeavors(), [], "kept for the threatening village's befriending");
    assert.deepEqual(choices.unbefriendable(), []);
});

test("X1: only the independent's own target counts, not another one listed first", () => {
    // The project of 5 lists 6's entry only (no fallback to targetList1[0]): nothing to save for.
    const other = { ...befriendProject(6, 300), targetList1: [{ targetID: 6, costYieldD: 300, resultData: { FailureReasons: [] } }] };
    reset({ projects: { 5: [other], 2: [collaboration(2)] } });
    choices.befriendIndependents(threatBy(5));
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(endeavors(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
});

test("M5: an independent another leader befriends first is not started unless ours would win; its turns unknown: not started", () => {
    // Game 60: Mesa Verde, p8 from T18, ours from T20, cancelled at T30; independent 23, p8 from T47, ours from T64.
    const rivalOn5 = { 5: [{ initialPlayer: 8, actionType: GIVE, uniqueID: 705 }] };
    const both = { 5: [befriendProject(5, 100, S.PROJECT_AVAILABLE)], 6: [befriendProject(6, 100, S.PROJECT_AVAILABLE)] };
    reset({ projects: both, events: rivalOn5, completion: { 705: 12 } });
    choices.befriendIndependents([]);
    assert.deepEqual(befriended(), [6], "Carthage's befriending of the nearer one is done in 12 turns, ours would take 30");
    assert.ok(lines.some((l) => /befriend: .*befriends it \(done in 12 turn\(s\)\), ours would take 30: not started/.test(l)), lines.join("\n"));
    reset({ projects: both, events: rivalOn5 });
    choices.befriendIndependents([]);
    assert.deepEqual(befriended(), [6], "its turns unknown: not guessed");
    reset({ projects: both, events: rivalOn5, completion: { 705: 40 } });
    choices.befriendIndependents([]);
    assert.deepEqual(befriended(), [5], "ours (30 turns) would finish first");
});

test("M5: a befriending that cannot be done before the age ends is not started; a threatening one needs only its Friendly half", () => {
    // Game 60: independent 28, started at A121 (19 turns left), needed about 30; unfinished at A140.
    const one = { 5: [befriendProject(5, 100, S.PROJECT_AVAILABLE)] };
    reset({ projects: one });
    choices.befriendIndependents([], { ageTurnsLeft: 19 });
    assert.deepEqual(befriended(), []);
    assert.ok(lines.some((l) => /about 30 turn\(s\) to befriend, 19 left in the age: not started/.test(l)), lines.join("\n"));
    reset({ projects: one });
    choices.befriendIndependents([], { ageTurnsLeft: 40 });
    assert.deepEqual(befriended(), [5]);
    reset({ projects: one });
    choices.befriendIndependents(threatBy(5), { ageTurnsLeft: 19 });
    assert.deepEqual(befriended(), [5], "its war with us ends at the Friendly stage, 15 turns");
    // Nothing kept for one that is too late either.
    reset({ projects: { 5: [befriendProject(5, 300)], 2: [collaboration(2)] } });
    choices.befriendIndependents(threatBy(5), { ageTurnsLeft: 10 });
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(endeavors(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
});

test("M5: ours gets more Influence beyond threats: when another leader's befriending of it would finish first, or ours would miss the age's end", () => {
    const ours = { 5: [{ initialPlayer: 0, actionType: GIVE, uniqueID: 905 }] };
    // Ours as the befriend screen shows it: 32/60 (+2 a turn), 14 turns; at support 6, 5 turns.
    const progress = { 905: { progressScore: 32, completionScore: 60, support: 2 } };
    const ok = Game.PlayerOperations.canStart;
    try {
        Game.PlayerOperations.canStart = () => ({ Success: true });
        reset({ events: { 5: [...ours[5], { initialPlayer: 8, actionType: GIVE, uniqueID: 705 }] }, completion: { 905: 14, 705: 10 }, diplomacy: progress });
        choices.befriendIndependents([]);
        assert.deepEqual(supported(), [905], "Carthage would be done in 10, ours in 14");
        reset({ events: ours, completion: { 905: 14 }, diplomacy: progress });
        choices.befriendIndependents([], { ageTurnsLeft: 9 });
        assert.deepEqual(supported(), [905], "ours done in 14, 9 left in the age");
        reset({ events: ours, completion: { 905: 14 }, diplomacy: progress });
        choices.befriendIndependents([], { ageTurnsLeft: 40 });
        assert.deepEqual(supported(), [], "no threat, no race, in time: no more Influence");
        reset({ events: { 5: [...ours[5], { initialPlayer: 8, actionType: GIVE, uniqueID: 705 }] }, completion: { 905: 8, 705: 10 }, diplomacy: progress });
        choices.befriendIndependents([]);
        assert.deepEqual(supported(), [], "ours finishes first");
    } finally {
        Game.PlayerOperations.canStart = ok;
    }
});

test("M5: no more Influence into a race or an age's end that support cannot win: the Influence would be lost with it", () => {
    // The first build supported a race the rival finished the next turn, every pass up to support 6, and one whose rival's
    // turns were unknown.
    const ours = { 5: [{ initialPlayer: 0, actionType: GIVE, uniqueID: 905 }] };
    const race = { 5: [...ours[5], { initialPlayer: 8, actionType: GIVE, uniqueID: 705 }] };
    const progress = { 905: { progressScore: 10, completionScore: 60, support: 2 } }; // 25 turns; at support 6, 9
    const ok = Game.PlayerOperations.canStart;
    try {
        Game.PlayerOperations.canStart = () => ({ Success: true });
        reset({ events: race, completion: { 905: 25, 705: 1 }, diplomacy: progress });
        choices.befriendIndependents([]);
        assert.deepEqual(supported(), [], "Carthage is done next turn");
        assert.ok(lines.some((l) => /no more Influence into ours \(.*at most 9 turn\(s\) with support 6\)/.test(l)), lines.join("\n"));
        reset({ events: race, completion: { 905: 25 }, diplomacy: progress });
        choices.befriendIndependents([]);
        assert.deepEqual(supported(), [], "Carthage's turns unknown");
        reset({ events: race, completion: { 905: 25, 705: 12 }, diplomacy: progress });
        choices.befriendIndependents([]);
        assert.deepEqual(supported(), [905], "9 turns at support 6 beat Carthage's 12");
        reset({ events: ours, completion: { 905: 25 }, diplomacy: progress });
        choices.befriendIndependents([], { ageTurnsLeft: 5 });
        assert.deepEqual(supported(), [], "9 turns at best, 5 left in the age");
        // The completion data alone (its turns × progress a turn) when the event's scores are not there.
        reset({ events: ours, completion: { 905: { turnsToCompletion: 25, progressPerTurn: 2 } } });
        choices.befriendIndependents([], { ageTurnsLeft: 10 });
        assert.deepEqual(supported(), [905], "50 lacking at 2 + 6 a turn: 7 turns, 10 left");
        // A threat still gets it.
        reset({ events: race, completion: { 905: 25, 705: 1 }, diplomacy: progress });
        choices.befriendIndependents(threatBy(5));
        assert.deepEqual(supported(), [905]);
    } finally {
        Game.PlayerOperations.canStart = ok;
    }
});

test("M6: in peace a far befriending we cannot afford yet lets an endeavor go first, then keeps its price", () => {
    // Game 60's Exploration: THREAT on 12 of 140 turns, yet ENDEAVOR 0 and ESPIONAGE_STEAL 0 (befriendBusy).
    reset({ influence: 120, projects: { 6: [befriendProject(6, 300)], 2: [collaboration(2)] } });
    choices.befriendIndependents([]);
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(endeavors(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
    fake.sent.length = 0;
    choices.befriendIndependents([]);
    choices.tendDiplomacy(DEFAULT_SETTINGS);
    assert.deepEqual(endeavors(), [], "befriending's turn: 120 kept for the 300");
});

test("M6: a reserve from an earlier turn holds nothing: the befriend step switched off, endeavors and reconciliation go on", () => {
    // The first build kept the last reserve (Infinity after a befriending sent) while the hud skipped the befriend step.
    reset({ influence: 400, projects: { 6: [befriendProject(6, 100, S.PROJECT_AVAILABLE)], 2: [collaboration(2)] } });
    const turn = Game.turn;
    try {
        choices.befriendIndependents([]);
        assert.deepEqual(befriended(), [6]);
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(endeavors(), [], "sent this turn: nothing else spends Influence");
        Game.turn = turn + 1; // the next turn, no befriend step
        fake.sent.length = 0;
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(endeavors(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
    } finally {
        Game.turn = turn;
    }
});

test("M6: under threat, endeavors spend only what lies above the threatening befriending's price", () => {
    reset({ influence: 400, projects: { 5: [befriendProject(5, 300, S.PROJECT_AVAILABLE)], 2: [collaboration(2)] } });
    const ok = Game.PlayerOperations.canStart;
    try {
        // Offered but not startable this pass (the game says no): its price is kept, 100 above it pays an endeavor.
        Game.PlayerOperations.canStart = (_p, op) => ({ Success: op !== "DIPLOMACY_ACTION_BEFRIEND" });
        choices.befriendIndependents(threatBy(5));
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(endeavors(), [[A.DIPLOMACY_ACTION_RESEARCH_COLLABORATION, 2]]);
        reset({ influence: 340, projects: { 5: [befriendProject(5, 300, S.PROJECT_AVAILABLE)], 2: [collaboration(2)] } });
        choices.befriendIndependents(threatBy(5));
        choices.tendDiplomacy(DEFAULT_SETTINGS);
        assert.deepEqual(endeavors(), [], "340 − 60 is below the 300 kept");
    } finally {
        Game.PlayerOperations.canStart = ok;
    }
});

test("M6: incorporating a city-state of ours spends only what lies above the reserve", () => {
    const cs = Players.get(2);
    const before = { isMinor: cs.isMinor, Influence: cs.Influence };
    cs.isMinor = true;
    cs.Influence = { hasSuzerain: true, getSuzerain: () => 0 };
    const INC = A.DIPLOMACY_ACTION_CS_INCORPORATE;
    const incorporate = { actionType: INC, operationType: `OP_${INC}`, projectStatus: S.PROJECT_AVAILABLE, targetList1: [{ targetID: 2, costYieldD: 150 }] };
    try {
        reset({ influence: 200, projects: { 5: [befriendProject(5, 300)], 2: [incorporate] } });
        choices.befriendIndependents(threatBy(5));
        assert.deepEqual(choices.incorporateCityState({ want: true, room: 2 }), [], "200 kept for the 300 befriending");
        reset({ influence: 200, projects: { 5: [befriendProject(5, 300, S.PROJECT_NO_VIABLE_TARGETS, [NO_VISION])], 2: [incorporate] } });
        choices.befriendIndependents(threatBy(5));
        assert.equal(choices.incorporateCityState({ want: true, room: 2 })[0]?.key, "INCORPORATE", "its village not found: nothing kept");
    } finally {
        Object.assign(cs, before);
    }
});

test.after(() => {
    console.warn = warn;
});
