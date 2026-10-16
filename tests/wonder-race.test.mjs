import { test } from "node:test";
import assert from "node:assert/strict";
import { raceLabel, raceLost, wonderBoost } from "../mod/expansion-planner/ui/core/xpl-wonder-race.js";
import { loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";

const base = { ourTurns: 8, completedElsewhere: false, rivalsSeen: 0, rivalTurns: null, ageTurnsLeft: 80 };

test("fair mode labels", () => {
    assert.equal(raceLabel(base).label, "HIGH");
    assert.equal(raceLabel({ ...base, ourTurns: 12 }).label, "MEDIUM");
    assert.equal(raceLabel({ ...base, ourTurns: 25 }).label, "LOW", "research/24 P5: 29-30 turns, both lost to rivals unseen");
    assert.equal(raceLabel({ ...base, rivalsSeen: 1 }).label, "LOW");
    assert.equal(raceLabel({ ...base, ourTurns: 4, rivalsSeen: 1 }).label, "MEDIUM");
    assert.equal(raceLabel({ ...base, completedElsewhere: true }).label, "NONE");
    assert.equal(raceLabel({ ...base, ourTurns: 90 }).label, "LOW"); // the age ends first
    assert.equal(raceLabel({ ...base, ourTurns: 12, ageTurnsLeft: null }).label, "MEDIUM"); // final age
    assert.equal(raceLabel({ ...base, ourTurns: Infinity }).label, "LOW");
});

test("omniscient mode compares with rivals' queues", () => {
    assert.equal(raceLabel({ ...base, rivalTurns: [6] }).label, "LOW");
    assert.equal(raceLabel({ ...base, rivalTurns: [11] }).label, "MEDIUM");
    assert.equal(raceLabel({ ...base, rivalTurns: [30, 40] }).label, "HIGH");
    assert.equal(raceLabel({ ...base, ourTurns: 9, rivalTurns: [] }).label, "HIGH");
    assert.deepEqual([12, 25].map((t) => raceLabel({ ...base, ourTurns: t, rivalTurns: [] }).label), ["MEDIUM", "LOW"], "no rival: capped by our turns (research/24 P5)");
});

test("a race is lost on a tie: a rival's production of a turn comes after our pass (game 22: the Shwedagon Pagoda, 3 turns each at our T37; America finished it at T39)", () => {
    assert.equal(raceLost({ ourTurns: 3, rivalTurns: [3], ageTurnsLeft: 50 }), "RIVAL_AHEAD");
    assert.equal(raceLost({ ourTurns: 3, rivalTurns: [2, 6], ageTurnsLeft: 50 }), "RIVAL_AHEAD");
    assert.equal(raceLost({ ourTurns: 3, rivalTurns: [4], ageTurnsLeft: 50 }), null);
    assert.equal(raceLost({ ourTurns: 3, rivalTurns: [], ageTurnsLeft: 50 }), null);
});

test("wonder boost counts every adjacent yield building's +1 per wonder", () => {
    const { info } = loadGameInfo("antiquity");
    const book = buildRuleBook(info, "AGE_ANTIQUITY");
    const boost = wonderBoost(["BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_PALACE", "BUILDING_GRANARY"], book.rulesByType, (t) => book.isActive(t));
    assert.equal(boost.buildings, 2); // Palace and Granary have no wonder adjacency
    assert.equal(boost.byYield[3], 1); // science (Library)
    assert.equal(boost.byYield[2], 1); // gold (Market)
});
