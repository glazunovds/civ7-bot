// The gold plan of one autopilot pass (core/xpl-savings.js): one budget for every purchase,
// a goal saved for before small purchases, towns' share, goals the game refuses, which towns
// may become cities and in what order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseGoal, conversionRule, createBudget, GOAL_COOLDOWN, goalAllowed, noteGoalBought, rankConversions, withinReach } from "../mod/expansion-planner/ui/core/xpl-savings.js";

test("budget: all the gold for what cannot wait, the reserve kept for the rest, a goal's cost held from everything but the goal", () => {
    const b = createBudget({ gold: 1000, reserve: 100 });
    assert.deepEqual([b.all(), b.forGoal(), b.free()], [1000, 900, 900]);
    b.setGoal({ kind: "CONVERT", key: "convert:1,1", label: "Pella", cost: 500 });
    assert.deepEqual([b.forGoal(), b.free()], [900, 400], "500 held for the goal");
    assert.equal(b.poolFor("convert:1,1"), 900, "the goal's own purchase may use it");
    assert.equal(b.poolFor("c:1-1|BUILDING_GRANARY"), 400);
    b.spend(200, { kind: "REPAIR", label: "Granary" });
    assert.deepEqual([b.all(), b.forGoal(), b.free()], [800, 700, 200], "every spend counts in every pool");
    b.spend(500, { kind: "CONVERT", key: "convert:1,1" }, { goal: true });
    assert.equal(b.goal.done, true);
    assert.deepEqual([b.forGoal(), b.free()], [200, 200], "the goal bought: nothing held any more");
    assert.deepEqual(b.entries.map((e) => [e.kind, e.cost]), [["REPAIR", 200], ["CONVERT", 500]]);
    assert.equal(b.spent, 700);
});

test("budget: towns' plan purchases take at most half the free gold, none while a goal waits", () => {
    const b = createBudget({ gold: 1000, reserve: 0 });
    assert.equal(b.townLeft(0.5), 500);
    b.spend(300, { kind: "BOUGHT", key: "c:1-1|BUILDING_SAW_PIT" }, { town: true });
    assert.equal(b.townLeft(0.5), 200, "half of the 1000 free at first, 300 of it spent in towns");
    b.spend(300, { kind: "BOUGHT", key: "c:2-2|BUILDING_LIBRARY" });
    assert.equal(b.townLeft(0.5), 50, "a city's purchase shrinks the free gold the share is taken from");
    assert.ok(b.bought.has("c:1-1|BUILDING_SAW_PIT") && b.bought.has("c:2-2|BUILDING_LIBRARY"), "plan purchases are remembered for the pass");
    const g = createBudget({ gold: 1000, reserve: 0 });
    g.setGoal({ kind: "CONVERT", key: "k", cost: 100 });
    assert.equal(g.townLeft(0.5), 0, "a goal waits: no warehouse");
});

test("the old { bought, spent } record carries over into a budget", () => {
    const bought = new Set(["c:1-1|BUILDING_PORT"]);
    const b = createBudget({ gold: 1000, reserve: 100, spent: 600, bought });
    assert.equal(b.free(), 300);
    assert.equal(b.bought, bought);
});

test("the goal: the first kind in the order with a candidate; a goal the game refused three turns in a row waits a while", () => {
    const candidates = { CONVERT: [], LEVER: [{ key: "c:1-1|BUILDING_LIBRARY", label: "Library", cost: 400 }, { key: "c:2-2|BUILDING_LIBRARY", label: "Library", cost: 300 }] };
    assert.equal(chooseGoal(candidates, ["CONVERT", "LEVER"])?.key, "c:1-1|BUILDING_LIBRARY");
    assert.equal(chooseGoal({ CONVERT: [{ key: "convert:3,3", cost: 500 }], LEVER: candidates.LEVER }, ["CONVERT", "LEVER"])?.kind, "CONVERT");
    assert.equal(chooseGoal(candidates, ["CONVERT"]), null, "LEVER not in the order");
    // Bought on turns 10, 11, 12 and still offered: the game refuses it.
    let memory = {};
    for (const turn of [10, 11, 12]) memory = noteGoalBought(memory, "c:1-1|BUILDING_LIBRARY", turn);
    assert.equal(goalAllowed(memory, "c:1-1|BUILDING_LIBRARY", 13), false);
    assert.equal(chooseGoal(candidates, ["LEVER"], { memory, turn: 13 })?.key, "c:2-2|BUILDING_LIBRARY", "the next candidate meanwhile");
    assert.equal(goalAllowed(memory, "c:1-1|BUILDING_LIBRARY", 12 + GOAL_COOLDOWN), true, "back after the cooldown");
    // Twice the same turn, or with a gap: not a refusal streak.
    let gaps = {};
    for (const turn of [10, 10, 10, 12, 14]) gaps = noteGoalBought(gaps, "k", turn);
    assert.equal(goalAllowed(gaps, "k", 15), true);
});

test("which towns may become cities: any while towns outnumber cities; at 1:1 or more cities only those rated CONVERT (decision 3)", () => {
    assert.deepEqual(conversionRule({ cities: 1, towns: 2 }), { floor: true, verdicts: null });
    assert.deepEqual(conversionRule({ cities: 3, towns: 2 }), { floor: false, verdicts: ["CONVERT"] });
    assert.deepEqual(conversionRule({ cities: 2, towns: 2 }), { floor: false, verdicts: ["CONVERT"] });
    assert.deepEqual(conversionRule({ cities: 2, towns: 0 }).verdicts, []);
    // The strategy's city target (research/35): below it any town, while the cities are healthy (research/34 §2).
    assert.deepEqual(conversionRule({ cities: 3, towns: 3, cityTarget: 5 }), { floor: true, verdicts: null });
    assert.deepEqual(conversionRule({ cities: 3, towns: 3, cityTarget: 5, healthy: false }), { floor: false, verdicts: ["CONVERT"] });
    assert.deepEqual(conversionRule({ cities: 5, towns: 3, cityTarget: 5 }), { floor: false, verdicts: ["CONVERT"] });
    // The science focus's final age (research/39 §4.6): towns outnumbering cities is no floor; a city a Launch Pad needs is.
    assert.deepEqual(conversionRule({ cities: 4, towns: 7, finalAge: true }), { floor: false, verdicts: ["CONVERT"] });
    assert.deepEqual(conversionRule({ cities: 4, towns: 7, minCities: 5, finalAge: true }), { floor: true, verdicts: null });
});

test("conversion order: a planned city site, then the verdict; science and economy take the most production, culture the cheapest", () => {
    const row = (name, verdict, cost, prodPot, plannedCity = false, pop = 5) => ({ town: { name, cost, prodPot, pop }, advice: { verdict }, plannedCity });
    const a = row("A", "CONSIDER", 300, 5);
    const b = row("B", "CONSIDER", 400, 15);
    const names = (rows) => rows.map((r) => r.town.name);
    assert.deepEqual(names(rankConversions([a, b], "SCIENCE")), ["B", "A"], "production land makes the better city (research/20 §2)");
    assert.deepEqual(names(rankConversions([a, b], "ECONOMIC")), ["B", "A"]);
    assert.deepEqual(names(rankConversions([a, b], "CULTURE")), ["A", "B"]);
    assert.deepEqual(names(rankConversions([a, b], null)), ["A", "B"]);
    const c = row("C", "CONVERT", 900, 1);
    const d = row("D", "KEEP", 999, 0, true);
    assert.deepEqual(names(rankConversions([a, b, c, d], "SCIENCE")), ["D", "C", "B", "A"]);
    // A planned city site founded this turn (population 1) waits until it has grown (research/23 E7: game 8,
    // a population-1 town at 1000 gold was converted before a developed one at 850).
    const fresh = row("F", "WAIT", 1000, 2, true, 1);
    const grown = row("G", "CONSIDER", 850, 6, false, 6);
    assert.deepEqual(names(rankConversions([fresh, grown], "SCIENCE")), ["G", "F"]);
    assert.deepEqual(names(rankConversions([{ ...fresh, town: { ...fresh.town, pop: 3 } }, grown], "SCIENCE")), ["F", "G"], "grown to 3: first");
});

test("a goal within reach: covered now, or at most 12 turns of a positive income away; a bank is judged by what it holds (research/23 S6)", () => {
    assert.equal(withinReach(500, 600, 0), true, "covered");
    assert.equal(withinReach(500, 200, 25), true, "12 turns");
    assert.equal(withinReach(500, 200, 20), false, "15 turns");
    assert.equal(withinReach(500, 200, -5), false);
    // A goal sized to what the gold reaches (the bank for the next age) is not checked again: rounded, it fell a hair
    // beyond the age's end (game 32, E64-E69).
    const bank = { key: "MODERN_BANK", cost: 1088, hold: 1088 };
    assert.equal(chooseGoal({ BANK: [bank] }, ["BANK"], { have: 500.4, income: 117.4, turnsLeft: 6 }), null, "587.6 over 117.4 a turn: 5.005 turns");
    assert.equal(chooseGoal({ BANK: [{ ...bank, sized: true }] }, ["BANK"], { have: 500.4, income: 117.4, turnsLeft: 6 })?.key, "MODERN_BANK");
    const goal = chooseGoal({ PADS: [{ key: "bank", cost: 7000, hold: 400 }] }, ["PADS"], { have: 200, income: 25 });
    assert.equal(goal?.key, "bank", "the bank holds 400 now");
});

test("a goal the gold cannot cover before the age ends is not saved for; a site marked anyHorizon may take longer than 12 turns, not past the age (research/24 G2, P1)", () => {
    const lever = { LEVER: [{ key: "c:1-1|BUILDING_ACADEMY", cost: 500 }] };
    assert.equal(chooseGoal(lever, ["LEVER"], { have: 100, income: 50 })?.key, "c:1-1|BUILDING_ACADEMY", "8 turns");
    assert.equal(chooseGoal(lever, ["LEVER"], { have: 100, income: 50, turnsLeft: 5 }), null, "game 9: a codex goal held 432 gold A67-A70");
    const site = { LEVER: [{ key: "c:1-1|BUILDING_AIRFIELD", cost: 1100, anyHorizon: true }] };
    assert.equal(chooseGoal({ LEVER: [{ ...site.LEVER[0], anyHorizon: false }] }, ["LEVER"], { have: 100, income: 50, turnsLeft: 40 }), null, "20 turns: beyond 12");
    assert.equal(chooseGoal(site, ["LEVER"], { have: 100, income: 50, turnsLeft: 40 })?.key, "c:1-1|BUILDING_AIRFIELD");
    assert.equal(chooseGoal(site, ["LEVER"], { have: 100, income: 50, turnsLeft: 15 }), null, "not past the age");
    assert.equal(withinReach(1100, 100, 50, 20), true);
});

// Research/39 §4.3: game 32 saved for Liverpool (2 production, 1,425) while Leeds made 11 for 1,087.
test("conversions for science and economy: the most production per gold (now, or half the potential)", () => {
    const row = (name, prodNow, prodPot, cost) => ({ town: { name, prodNow, prodPot, cost }, advice: { verdict: "WAIT" } });
    const leeds = row("Leeds", 11, 25, 1087);
    const liverpool = row("Liverpool", 2, 30, 1425);
    assert.deepEqual(rankConversions([liverpool, leeds], "SCIENCE").map((r) => r.town.name), ["Leeds", "Liverpool"]);
    assert.deepEqual(rankConversions([liverpool, leeds], "ECONOMIC").map((r) => r.town.name), ["Leeds", "Liverpool"]);
    // A fresh town with a large potential still counts half of it: 0.5 × 60 = 30 for 1,000.
    const fresh = row("Fresh", 1, 60, 1000);
    assert.equal(rankConversions([leeds, fresh], "SCIENCE")[0].town.name, "Fresh");
});
