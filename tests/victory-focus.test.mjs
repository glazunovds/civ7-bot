// Victory focus (pure): which legacy path the autopilot steers toward, with hysteresis, and
// which triumphs are close.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseFocus, closeTriumphs, scoreFocus, SWITCH_STREAK, wondersAtOnce } from "../mod/expansion-planner/ui/core/xpl-victory-focus.js";

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
