// Field operations for the generals' experience (research/41 §6-§7; the user, 21 October, after game 50): which villages
// are hunted, when a hunt or a training war has the force, starts its fight and ends, and who is a training-war target.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HUNT, RAIDER, TRAINING, denounceAllowed, fieldForce, fieldReady, huntEnd, huntReason, raiderEnd, supportWanted, trainingEnd, trainingTarget } from "../mod/expansion-planner/ui/core/xpl-field-ops.js";

test("a village is hunted when we will not befriend it: a crisis camp, another's friend (not an unfriendly one's), past half the age, or out of our Influence", () => {
    assert.equal(huntReason({ crisis: true }), "CRISIS");
    assert.equal(huntReason({ others: ["NEUTRAL"] }), "OTHERS", "another leader befriends it");
    assert.equal(huntReason({ others: ["UNFRIENDLY"] }), null, "dispersing it could tip that leader into a war");
    assert.equal(huntReason({ others: ["HOSTILE"], crisis: true }), null);
    assert.equal(huntReason({ ageShare: HUNT.HALF_AGE }), "LATE");
    assert.equal(huntReason({ cost: 200, influence: 50, income: 10 }), "INFLUENCE", "50 + 10 x 10 < 200");
    assert.equal(huntReason({ cost: 150, influence: 50, income: 10 }), null, "we befriend it within 10 turns");
    assert.equal(huntReason({ cost: 0, ageShare: 0.2 }), null, "early, its price unknown");
    assert.equal(huntReason({ ours: true, ageShare: 0.9 }), null, "our own befriending");
    assert.equal(huntReason({ cityState: true, crisis: true }), null, "a city-state: a war on its suzerain");
});

test("the force, the start of the fight and the end of a hunt", () => {
    assert.equal(fieldForce({ melee: 2, units: 3, enemies: 1, ourBest: 20, theirBest: 20 }).ok, true);
    assert.equal(fieldForce({ melee: 1, units: 3, enemies: 1 }).ok, false);
    assert.equal(fieldForce({ melee: 2, units: 3, enemies: 3 }).ok, false, "one more than its soldiers");
    assert.equal(fieldForce({ melee: 2, units: 3, enemies: 0, ourBest: 10, theirBest: 25 }).ok, false);
    const h = { started: 10, stage: "GATHER", progressTurn: 10 };
    assert.equal(fieldReady(h, { turn: 11, arrived: 3, members: 3, meleeArrived: 2 }), true, "all arrived");
    assert.equal(fieldReady(h, { turn: 11, arrived: 2, members: 3, meleeArrived: 1 }), false);
    assert.equal(fieldReady(h, { turn: 10 + HUNT.GATHER_MAX, arrived: 2, members: 3, meleeArrived: 1 }), true, "after GATHER_MAX with the minimum");
    const f = { turn: 12, gone: false, befriended: false, on: true, victoryNear: false, homeUnsafe: false, melee: 2, units: 3, lost: 0, kills: 0 };
    assert.equal(huntEnd(h, f), null);
    assert.equal(huntEnd(h, { ...f, gone: true }), "DONE");
    assert.equal(huntEnd(h, { ...f, befriended: true }), "BEFRIENDED");
    assert.equal(huntEnd(h, { ...f, on: false }), "OFF");
    assert.equal(huntEnd(h, { ...f, homeUnsafe: true }), "HOME");
    assert.equal(huntEnd(h, { ...f, turn: 10 + HUNT.MAX_TURNS + 1 }), "LATE");
    assert.equal(huntEnd({ ...h, stage: "FIGHT" }, { ...f, turn: 10 + HUNT.STALL_TURNS + 1 }), "STALL");
    assert.equal(huntEnd(h, { ...f, lost: 2 }), "LOSSES");
    assert.equal(huntEnd(h, { ...f, lost: 2, kills: 1 }), null, "losses with a kill go on");
    assert.equal(huntEnd(h, { ...f, melee: 0 }), "FORCE");
});

// A weak neighbour by research/41 §7A: 3 land soldiers against our 8, production 20 against 50, 2 settlements against 5.
const weak = {
    met: true, atPeace: true, ally: false, cityState: false, relation: "HOSTILE", formalOk: true,
    theirSoldiers: 3, ourSoldiers: 8, theirBest: 20, ourBest: 25, theirProduction: 20, ourProduction: 50,
    theirSettlements: 2, ourSettlements: 5, distance: 7, thirdAlly: false, threatened: false, otherWar: false, otherRisk: false,
    supportOurs: 1, supportTheirs: 0, influenceSpare: 200, supportPrice: 60, ageTurn: 30, ageTurnsLeft: 40, ideologyBlock: false,
    warsThisAge: 0, outcomeOpen: true, ownChance: false, rivalDanger: false, spaceFinal: false, ready: true,
};

test("a training-war target: weak, close, alone, Hostile, our side ready; each condition alone says no", () => {
    assert.equal(trainingTarget(weak).why, null);
    for (const [change, why] of [
        [{ ally: true }, "our ally"], [{ thirdAlly: true }, "allied"], [{ theirSoldiers: 5 }, "soldiers"], [{ theirBest: 30 }, "best melee"],
        [{ theirProduction: 31 }, "production"], [{ theirSettlements: 5 }, "settlements"], [{ distance: 11 }, "tiles away"],
        [{ threatened: true }, "threatened"], [{ otherWar: true }, "another war"], [{ otherRisk: true }, "risk"], [{ ageTurn: 5 }, "age's turn"],
        [{ ageTurnsLeft: 19 }, "turns left"], [{ ideologyBlock: true }, "ideolog"], [{ warsThisAge: 1 }, "this age"], [{ outcomeOpen: false }, "decided"],
        [{ ownChance: true }, "victory of ours"], [{ rivalDanger: true }, "rival"], [{ spaceFinal: true }, "space"], [{ ready: false }, "not ready"],
        [{ formalOk: false }, "formal"], [{ supportTheirs: 2 }, "War Support"], [{ influenceSpare: 100 }, "Influence"],
    ]) {
        const r = trainingTarget({ ...weak, ...change });
        assert.ok(r.why && r.why.includes(why), `${JSON.stringify(change)}: ${r.why}`);
    }
    const neutral = trainingTarget({ ...weak, relation: "NEUTRAL" });
    assert.deepEqual([neutral.why, neutral.need], ["relation", "DENOUNCE"], "a Neutral one is denounced toward Hostile");
    assert.deepEqual([trainingTarget({ ...weak, relation: "FRIENDLY" }).need], [null], "a friend is never one");
    assert.equal(trainingTarget({ ...weak, theirSoldiers: 2, theirProduction: 19 }).veryWeak, true);
});

test("denouncing: 2 times, 4 when very weak, 10 turns apart; War Support bought when theirs reaches ours and it fits", () => {
    assert.equal(denounceAllowed({ denounced: 0, turn: 20 }), true);
    assert.equal(denounceAllowed({ denounced: 1, lastTurn: 15, turn: 20 }), false, "10 turns apart");
    assert.equal(denounceAllowed({ denounced: 2, lastTurn: 0, turn: 20 }), false);
    assert.equal(denounceAllowed({ denounced: 2, lastTurn: 0, turn: 20, veryWeak: true }), true);
    assert.equal(denounceAllowed({ denounced: TRAINING.DENOUNCE_MAX_WEAK, lastTurn: 0, turn: 40, veryWeak: true }), false);
    assert.equal(supportWanted({ net: 0, price: 60, spare: 150 }), true);
    assert.equal(supportWanted({ net: 1, price: 60, spare: 150 }), false, "ours leads");
    assert.equal(supportWanted({ net: 0, price: 90, spare: 150 }), false, "more than half the spare Influence");
});

test("a training war ends: a promotion, weariness, losses, a third party, home, its length, its XP stalled, our yields", () => {
    const w = { started: 10, stage: "FIGHT", xpTurn: 12 };
    const f = { turn: 14, on: true, atWar: true, promotions: 0, weary: false, supportNet: 1, lost: 0, kills: 0, thirdParty: false, homeUnsafe: false, yields: 100, yieldsStart: 100 };
    assert.equal(trainingEnd(w, f), null);
    assert.equal(trainingEnd(w, { ...f, atWar: false }), "PEACE");
    assert.equal(trainingEnd(w, { ...f, on: false }), "OFF");
    assert.equal(trainingEnd(w, { ...f, promotions: 1 }), "PROMOTED");
    assert.equal(trainingEnd(w, { ...f, weary: true }), "WEARINESS");
    assert.equal(trainingEnd(w, { ...f, supportNet: -1 }), "WEARINESS");
    assert.equal(trainingEnd(w, { ...f, lost: 2 }), "LOSSES");
    assert.equal(trainingEnd(w, { ...f, thirdParty: true }), "THIRD");
    assert.equal(trainingEnd(w, { ...f, homeUnsafe: true }), "HOME");
    assert.equal(trainingEnd(w, { ...f, turn: 10 + TRAINING.MAX_TURNS + 1 }), "LATE");
    assert.equal(trainingEnd(w, { ...f, turn: 12 + TRAINING.XP_STALL_TURNS + 1 }), "XP_STALL");
    assert.equal(trainingEnd(w, { ...f, yields: 89 }), "YIELDS");
});

// Game 54: Аванти's hunt went without a general; the fight now waits for it up to COMMANDER_TURNS from the start.
test("the fight waits for the operation's general up to COMMANDER_TURNS, then goes on without it", () => {
    const op = { started: 10, stage: "GATHER" };
    const all = { arrived: 3, members: 3, meleeArrived: 2 };
    assert.equal(fieldReady(op, { turn: 12, ...all }), true, "everyone there, no general on its way");
    assert.equal(fieldReady(op, { turn: 12, ...all, commanderAway: true }), false, "its general still on its way");
    assert.equal(fieldReady(op, { turn: 10 + HUNT.COMMANDER_TURNS, ...all, commanderAway: true }), true, "waited long enough");
    assert.equal(fieldReady(op, { turn: 12, ...all, commanderAway: true }, TRAINING), false);
});

test("a raider hunt ends: gone, off, a victory near, home, gone far, its length, no kill, losses, no melee member (after game 54)", () => {
    const h = { started: 10, progressTurn: 10 };
    const f = (o = {}) => ({ turn: 12, gone: false, far: false, on: true, victoryNear: false, homeUnsafe: false, melee: 1, units: 2, lost: 0, kills: 0, ...o });
    assert.equal(raiderEnd(h, f()), null);
    assert.equal(raiderEnd(h, f({ gone: true, on: false })), "DONE", "gone first");
    assert.equal(raiderEnd(h, f({ on: false })), "OFF");
    assert.equal(raiderEnd(h, f({ victoryNear: true })), "VICTORY");
    assert.equal(raiderEnd(h, f({ homeUnsafe: true })), "HOME");
    assert.equal(raiderEnd(h, f({ far: true })), "FAR");
    assert.equal(raiderEnd(h, f({ turn: 10 + RAIDER.MAX_TURNS + 1 })), "LATE");
    assert.equal(raiderEnd({ started: 10, progressTurn: 10 }, f({ turn: 10 + RAIDER.STALL_TURNS + 1 })), "STALL");
    assert.equal(raiderEnd(h, f({ lost: RAIDER.LOSSES })), "LOSSES");
    assert.equal(raiderEnd(h, f({ lost: RAIDER.LOSSES, kills: 1 })), null, "a kill pays for them");
    assert.equal(raiderEnd(h, f({ melee: 0 })), "FORCE");
    // The force to start one: a melee one, two in all, one more than theirs near it.
    assert.ok(fieldForce({ melee: 1, units: 2, enemies: 1, ourBest: 25, theirBest: 20 }, RAIDER).ok);
    assert.ok(!fieldForce({ melee: 1, units: 2, enemies: 2, ourBest: 25, theirBest: 20 }, RAIDER).ok);
});
