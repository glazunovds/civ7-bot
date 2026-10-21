// Victory focus (pure): which victory the autopilot steers toward (the victories' own points: legacy paths count nothing in
// this game version, games 42-43), with hysteresis, and which triumphs are close.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseFocus, closeTriumphs, LEAD_FLOOR, profileForFocus, raceStandings, scoreFocus, SWITCH_STREAK, victoryOptions, wondersAtOnce } from "../mod/expansion-planner/ui/core/xpl-victory-focus.js";

const STANDINGS = [
    { cls: "CULTURE", ours: 4, rival: 2, goal: 7 },
    { cls: "SCIENCE", ours: 5, rival: 6, goal: 10 },
    { cls: "ECONOMIC", ours: 2, rival: 5, goal: 20 },
    { cls: "MILITARY", ours: 11, rival: 0, goal: 12 },
];
const best = (scores) => scores.reduce((a, b) => (b.score > a.score ? b : a)).cls;
const science = (n) => Array.from({ length: n }, (_, i) => ({ type: `T${i}`, current: 9, total: 10, category: "SCIENTIFIC" }));

test("scores: along the way to the goal and ahead of the best rival; never military; at the goal it scores highest", () => {
    const s = scoreFocus(STANDINGS);
    assert.deepEqual(s.map((x) => x.cls), ["CULTURE", "SCIENCE", "ECONOMIC"]);
    assert.equal(best(s), "CULTURE", "4/7 and 2 ahead beats 5/10 and 1 behind");
    const lead = scoreFocus([{ cls: "CULTURE", ours: 5, rival: 9, goal: 10 }, { cls: "SCIENCE", ours: 4, rival: 0, goal: 10 }]);
    assert.equal(best(lead), "SCIENCE", "a little behind on the way but far ahead of every rival");
    // A legacy path's goal was left once reached; a victory at its goal is the one to keep (game 43's economy, 4302/7444).
    assert.equal(best(scoreFocus([{ cls: "ECONOMIC", ours: 20, rival: 5, goal: 20 }, ...STANDINGS.slice(0, 2)])), "ECONOMIC");
});

// Games 42-43: the dominance goals come at Exploration 50%; before, each victory is scored by its lead alone (science's fixed 100
// too), against the larger score, at least LEAD_FLOOR (a wonder or two is no lead).
test("race standings: no goal for any class until every dominance race has one; then the game's goals (science 100)", () => {
    const race = (cls, points, rival, goal, scoring = "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION") => ({ cls, points, rival, goal, scoring, enabled: true, focusable: true });
    const early = [race("CULTURE", 29, 8, -1), race("ECONOMIC", 130, 309, -1), race("SCIENCE", 5, 10, 100, "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE"), { ...race("MILITARY", 36, 24, -1), focusable: false }];
    assert.deepEqual(raceStandings(early), [
        { cls: "CULTURE", ours: 29, rival: 8, goal: 0 }, { cls: "ECONOMIC", ours: 130, rival: 309, goal: 0 }, { cls: "SCIENCE", ours: 5, rival: 10, goal: 0 },
    ]);
    // Game 42 at E1: culture 29 against 8 leads; the economy and science trail.
    const s = scoreFocus(raceStandings(early));
    assert.equal(best(s), "CULTURE");
    assert.equal(s.find((x) => x.cls === "SCIENCE").lead, (5 - 10) / Math.max(10, LEAD_FLOOR.SCIENCE));
    // Small numbers are noise: 3 against 1 is no lead worth 2 against 0.
    assert.equal(scoreFocus([{ cls: "CULTURE", ours: 3, rival: 1, goal: 0 }])[0].lead, 2 / LEAD_FLOOR.CULTURE);
    const later = [race("CULTURE", 107, 128, 428), race("ECONOMIC", 668, 2011, 6268), race("SCIENCE", 7, 24, 100, "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE")];
    assert.deepEqual(raceStandings(later).map((r) => r.goal), [428, 6268, 100]);
    assert.deepEqual(raceStandings([{ ...race("CULTURE", 1, 2, 10), enabled: false }]), [], "a victory switched off");
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

test("choosing: the best victory at once the first time; another one must lead by a margin for several checks; past an age's first turns it stays", () => {
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
    // Past an age's first turns (mayChange false: the hud's FOCUS_CHANGE_SHARE) a lead changes nothing, however long.
    f = { cls: "CULTURE" };
    for (let i = 0; i < SWITCH_STREAK + 2; i++) f = chooseFocus(at(0.2, 0.9), f, { mayChange: false });
    assert.deepEqual([f.cls, f.streak], ["CULTURE", 0]);
    // The player's target still holds, and a victory gone (switched off) is left at once.
    assert.equal(chooseFocus(at(0.2, 0.9), { cls: "CULTURE" }, { mayChange: false, target: "SCIENCE" }).cls, "SCIENCE");
    assert.equal(chooseFocus([{ cls: "SCIENCE", score: 0.1 }], { cls: "CULTURE" }, { mayChange: false }).cls, "SCIENCE");
    assert.equal(chooseFocus([], { cls: "CULTURE" }).cls, "CULTURE", "nothing known: keep");
});

test("«Цель победы» offers only the victories switched on (all off or unknown: all)", () => {
    assert.deepEqual(victoryOptions(new Set(["CULTURE"])), ["AUTO", "SCIENCE", "ECONOMIC"]);
    assert.deepEqual(victoryOptions(new Set()), ["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"]);
    assert.deepEqual(victoryOptions(new Set(["CULTURE", "SCIENCE", "ECONOMIC"])), ["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"]);
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
