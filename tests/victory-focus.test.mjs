// Victory focus (pure): which legacy path the autopilot steers toward, with hysteresis, and
// which triumphs are close.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseFocus, closeTriumphs, profileForFocus, scoreFocus, SWITCH_STREAK, victoryOptions, wondersAtOnce } from "../mod/expansion-planner/ui/core/xpl-victory-focus.js";

const STANDINGS = [
    { cls: "CULTURE", ours: 4, rival: 2, goal: 7 },
    { cls: "SCIENCE", ours: 5, rival: 6, goal: 10 },
    { cls: "ECONOMIC", ours: 20, rival: 5, goal: 20 },
    { cls: "MILITARY", ours: 11, rival: 0, goal: 12 },
];
const best = (scores) => scores.reduce((a, b) => (b.score > a.score ? b : a)).cls;
const science = (n) => Array.from({ length: n }, (_, i) => ({ type: `T${i}`, current: 9, total: 10, category: "SCIENTIFIC" }));

test("scores: along this age's path and ahead of the best rival; never military; a completed path scores lowest", () => {
    const s = scoreFocus(STANDINGS);
    assert.deepEqual(s.map((x) => x.cls), ["CULTURE", "SCIENCE", "ECONOMIC"]);
    assert.equal(best(s), "CULTURE", "4/7 and 2 ahead beats 5/10 and 1 behind");
    const lead = scoreFocus([{ cls: "CULTURE", ours: 5, rival: 9, goal: 10 }, { cls: "SCIENCE", ours: 4, rival: 0, goal: 10 }]);
    assert.equal(best(lead), "SCIENCE", "a little behind on the path but far ahead of every rival");
    const eco = s.find((x) => x.cls === "ECONOMIC");
    assert.ok(eco.done && eco.score < 0, "economic is complete this age");
});

test("each class's path with a goal this age is scored, not another age's path of that class (no goal here)", () => {
    const scores = scoreFocus([
        { cls: "ECONOMIC", path: "AQ", ours: 0, rival: 0, goal: 0 },
        { cls: "ECONOMIC", path: "EX", ours: 6, rival: 0, goal: 30 },
    ]);
    assert.deepEqual(scores.map((s) => [s.cls, s.goal, s.ours]), [["ECONOMIC", 30, 6]]);
});

test("the leader's preferred victory and close triumphs of a kind add a little", () => {
    assert.equal(best(scoreFocus(STANDINGS, "SCIENCE")), "CULTURE", "a preference alone does not beat a clear lead");
    assert.equal(best(scoreFocus(STANDINGS, "SCIENCE", science(3))), "SCIENCE", "with three close science triumphs it does");
    const capped = scoreFocus(STANDINGS, null, science(10)).find((x) => x.cls === "SCIENCE").score;
    const three = scoreFocus(STANDINGS, null, science(3)).find((x) => x.cls === "SCIENCE").score;
    assert.equal(capped, three, "the triumph bonus is capped");
});

test("close triumphs: open ones at least 70% done, closest first", () => {
    const list = closeTriumphs([
        { type: "A", current: 7, total: 10 },
        { type: "B", current: 9, total: 10 },
        { type: "C", current: 6, total: 10 },
        { type: "D", current: 10, total: 10, done: true },
        { type: "E", current: 9, total: 10, lost: true },
        { type: "F", current: 0, total: 0 },
    ]);
    assert.deepEqual(list.map((t) => t.type), ["B", "A"]);
});

test("choosing: the best path at once the first time; another one must lead by a margin for several checks; a completed path is left at once", () => {
    const at = (c, s) => [{ cls: "CULTURE", score: c }, { cls: "SCIENCE", score: s }];
    let f = chooseFocus(at(0.7, 0.4));
    assert.deepEqual([f.cls, f.changed], ["CULTURE", true]);
    f = chooseFocus(at(0.7, 0.75), f);
    assert.deepEqual([f.cls, f.changed, f.streak], ["CULTURE", false, 0], "ahead by less than the margin");
    for (let i = 1; i < SWITCH_STREAK; i++) {
        f = chooseFocus(at(0.5, 0.8), f);
        assert.deepEqual([f.cls, f.candidate, f.streak], ["CULTURE", "SCIENCE", i]);
    }
    f = chooseFocus(at(0.5, 0.8), f);
    assert.deepEqual([f.cls, f.changed], ["SCIENCE", true]);
    // A completed path is left at once.
    const done = [{ cls: "SCIENCE", score: -1, done: true }, { cls: "CULTURE", score: 0.2 }];
    f = chooseFocus(done, { cls: "SCIENCE" });
    assert.deepEqual([f.cls, f.changed], ["CULTURE", true]);
    assert.equal(chooseFocus([], { cls: "CULTURE" }).cls, "CULTURE", "nothing known: keep");
});

test("«Цель победы» offers only the victories switched on (all off or unknown: all)", () => {
    assert.deepEqual(victoryOptions(new Set(["CULTURE"])), ["AUTO", "SCIENCE", "ECONOMIC"]);
    assert.deepEqual(victoryOptions(new Set()), ["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"]);
    assert.deepEqual(victoryOptions(new Set(["CULTURE", "SCIENCE", "ECONOMIC"])), ["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"]);
});

test("the final age: a completed path is kept, its victory goes on (science: 100 Innovation after the 3 space projects)", () => {
    const standings = [{ cls: "SCIENCE", ours: 3, rival: 1, goal: 3 }, { cls: "CULTURE", ours: 9, rival: 2, goal: 15 }];
    const before = scoreFocus(standings);
    assert.ok(before.find((x) => x.cls === "SCIENCE").score < 0, "an earlier age: completed scores lowest");
    const final = scoreFocus(standings, null, [], { finalAge: true });
    const sci = final.find((x) => x.cls === "SCIENCE");
    assert.ok(sci.done && sci.score > final.find((x) => x.cls === "CULTURE").score, JSON.stringify(final));
    let f = chooseFocus(final, { cls: "SCIENCE" }, { finalAge: true });
    assert.deepEqual([f.cls, f.changed], ["SCIENCE", false]);
    // Even when another path scores higher, a completed one is not left at once there.
    const ahead = [{ cls: "SCIENCE", score: 0.9, done: true }, { cls: "CULTURE", score: 0.95 }];
    f = chooseFocus(ahead, { cls: "SCIENCE" }, { finalAge: true });
    assert.equal(f.cls, "SCIENCE");
    f = chooseFocus(ahead, { cls: "SCIENCE" });
    assert.equal(f.cls, "CULTURE", "before the final age it is");
});

test("the focus's priority: economy keeps science up while its path's techs are missing", () => {
    assert.equal(profileForFocus("ECONOMIC", { techsLeft: 2 }), "GOLD_SCIENCE");
    assert.equal(profileForFocus("ECONOMIC", { techsLeft: 0 }), "GOLD");
    assert.equal(profileForFocus("SCIENCE", { techsLeft: 3 }), "SCIENCE");
    assert.equal(profileForFocus("CULTURE"), "CULTURE");
    assert.equal(profileForFocus(null), null);
});

test("culture builds one more wonder at a time", () => {
    assert.equal(wondersAtOnce(1, "CULTURE"), 2);
    assert.equal(wondersAtOnce(1, "SCIENCE"), 1);
    assert.equal(wondersAtOnce(2, null), 2);
});

test("victories switched off in this game are never chosen; the player's target is followed while its path is known", () => {
    const off = scoreFocus(STANDINGS, null, [], { disabled: new Set(["CULTURE"]) });
    assert.deepEqual(off.map((x) => x.cls), ["SCIENCE", "ECONOMIC"]);
    assert.equal(best(off), "SCIENCE");
    const scores = scoreFocus(STANDINGS);
    let f = chooseFocus(scores, { cls: "CULTURE" }, { target: "ECONOMIC" });
    assert.deepEqual([f.cls, f.changed], ["ECONOMIC", true], "the player's choice, even with culture ahead");
    f = chooseFocus(scores, f, { target: "ECONOMIC" });
    assert.deepEqual([f.cls, f.changed], ["ECONOMIC", false]);
    f = chooseFocus(off, { cls: "SCIENCE" }, { target: "CULTURE" });
    assert.equal(f.cls, "SCIENCE", "a switched-off target: the autopilot's own choice");
});

// Game 19: at Modern turn 1 every new path stood at 0, Ada's leaning (+0.15) took the focus from science (26
// Innovation) to culture (46 against the leader's 117), and the game was lost to culture with 30 Innovation.
const NEW_AGE = [{ cls: "CULTURE", ours: 0, rival: 0, goal: 15 }, { cls: "SCIENCE", ours: 0, rival: 0, goal: 10 }, { cls: "ECONOMIC", ours: 0, rival: 0, goal: 20 }];

test("the final age keeps the focus it began with; only our own countdown within reach elsewhere moves it", () => {
    const scores = scoreFocus(NEW_AGE, "CULTURE", [], { finalAge: true });
    assert.equal(best(scores), "CULTURE", "the leaning alone");
    let pick = chooseFocus(scores, { cls: "SCIENCE" }, { finalAge: true });
    assert.deepEqual([pick.cls, pick.changed], ["SCIENCE", false]);
    for (let i = 0; i < SWITCH_STREAK + 2; i++) pick = chooseFocus(scores, pick, { finalAge: true });
    assert.equal(pick.cls, "SCIENCE", "not after several checks either");
    pick = chooseFocus(scores, { cls: "SCIENCE" }, { finalAge: true, chances: new Set(["ECONOMIC"]) });
    assert.deepEqual([pick.cls, pick.changed], ["ECONOMIC", true], "our economic countdown is near");
    assert.equal(chooseFocus(scores, { cls: "SCIENCE" }, { finalAge: true, chances: new Set(["SCIENCE", "CULTURE"]) }).cls, "SCIENCE", "a chance of our own: stay");
    assert.equal(chooseFocus(scores, {}, { finalAge: true }).cls, "CULTURE", "nothing known before: the best, leaning included");
});

test("the leader's leaning picks a first focus but never makes a switch; a real lead does", () => {
    const scores = scoreFocus(NEW_AGE, "CULTURE");
    let pick = { cls: "SCIENCE" };
    for (let i = 0; i < SWITCH_STREAK + 2; i++) pick = chooseFocus(scores, pick);
    assert.equal(pick.cls, "SCIENCE", "culture ahead by the leaning alone");
    const ahead = scoreFocus([{ cls: "CULTURE", ours: 6, rival: 0, goal: 15 }, { cls: "SCIENCE", ours: 0, rival: 0, goal: 10 }], "CULTURE");
    pick = { cls: "SCIENCE" };
    for (let i = 0; i < SWITCH_STREAK; i++) pick = chooseFocus(ahead, pick);
    assert.equal(pick.cls, "CULTURE", "40% along its path: a real lead");
});
