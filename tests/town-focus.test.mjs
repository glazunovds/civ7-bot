import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendFocus, improvementKind } from "../mod/expansion-planner/ui/core/xpl-town-focus.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const BALANCE = getProfile("BALANCE").y;
const base = { farm: 0, mine: 0, appealing: 0, quarters: 0, buildings: 0, resources: 0, connectedSettlements: 2, connectedCities: 1, population: 8, available: null, current: "GROWTH" };

test("improvement kinds match the game's types (and not camp fires or encampments)", () => {
    for (const t of ["IMPROVEMENT_FARM", "IMPROVEMENT_PASTURE", "IMPROVEMENT_PLANTATION", "IMPROVEMENT_FISHING_BOAT", "IMPROVEMENT_FISHING_BOAT_RESOURCE", "IMPROVEMENT_TERRACE_FARM"]) assert.equal(improvementKind(t), "FARM", t);
    for (const t of ["IMPROVEMENT_WOODCUTTER", "IMPROVEMENT_CAMP", "IMPROVEMENT_CLAY_PIT_RESOURCE", "IMPROVEMENT_MINE", "IMPROVEMENT_MINE_RESOURCE", "IMPROVEMENT_QUARRY"]) assert.equal(improvementKind(t), "MINE", t);
    for (const t of ["IMPROVEMENT_CAMPFIRE", "IMPROVEMENT_ENCAMPMENT", "IMPROVEMENT_BARBARIAN_CAMP"]) assert.equal(improvementKind(t), null, t);
});

test("farms win in a farming town, mines (2 gold each) in a mining town", () => {
    assert.equal(recommendFocus({ ...base, farm: 6, mine: 1 }, BALANCE).best.key, "FARM");
    assert.equal(recommendFocus({ ...base, farm: 2, mine: 4 }, BALANCE).best.key, "MINE");
    const r = recommendFocus({ ...base, farm: 2, mine: 4 }, BALANCE);
    assert.equal(r.best.gain[2], 8); // 4 improvements x 2 production -> gold
});

test("only Focuses the game offers now count as 'now'; the rest are for later", () => {
    const r = recommendFocus({ ...base, farm: 3, mine: 5, available: new Set(["PROJECT_TOWN_GRANARY"]) }, BALANCE);
    assert.equal(r.best.key, "FARM");
    assert.equal(r.options.find((o) => o.key === "MINE").availableNow, false);
    // The Fishing variant is used when that is the one offered.
    const f = recommendFocus({ ...base, farm: 3, available: new Set(["PROJECT_TOWN_FISHING"]) }, BALANCE);
    assert.equal(f.best.project, "PROJECT_TOWN_FISHING");
});

test("notes: too small yet, not connected to a city", () => {
    const r = recommendFocus({ ...base, farm: 4, population: 5, connectedCities: 0 }, BALANCE);
    assert.deepEqual(r.notes.map((n) => n.key), ["LOC_XPL_FOCUS_GROW_FIRST", "LOC_XPL_FOCUS_NOT_CONNECTED"]);
    assert.equal(r.best.key, "FARM"); // still says what to pick later
});

test("the current Focus is marked", () => {
    const r = recommendFocus({ ...base, farm: 4, mine: 1, current: "PROJECT_TOWN_PRODUCTION" }, BALANCE);
    assert.ok(r.options.find((o) => o.key === "MINE").current);
});

test("a science lean picks Urban Center for a town that could buy a Library there, even with no quarter yet (research/22 C2)", () => {
    const SCIENCE = getProfile("SCIENCE").y;
    const bias = { URBAN: 6, FARM: 2 };
    assert.equal(recommendFocus({ ...base, farm: 3, urbanBuys: 1 }, SCIENCE, bias).best.key, "URBAN");
    assert.equal(recommendFocus({ ...base, farm: 3, urbanBuys: 0 }, SCIENCE, bias).best.key, "FARM", "nothing to buy there");
    assert.equal(recommendFocus({ ...base, farm: 3, urbanBuys: 1 }, SCIENCE).best.key, "FARM", "no lean: as before");
    assert.equal(recommendFocus({ ...base, farm: 3, urbanBuys: 1 }, SCIENCE).options.some((o) => o.key === "URBAN"), false);
});

// Research/40 A6: the Modern Factory Town was missing from the Focus table.
test("Factory Town (Modern): an option where an improved factory resource stands, once the game offers it; the economic lean takes it", () => {
    const GOLD = getProfile("GOLD").y;
    const offered = new Set(["PROJECT_TOWN_GRANARY", "PROJECT_TOWN_TRADE", "PROJECT_TOWN_FACTORY"]);
    const town = { ...base, farm: 4, resources: 3, factory: 2, available: offered };
    const r = recommendFocus(town, GOLD, { TRADE: 3, MINE: 2, FACTORY: 4 });
    assert.equal(r.best.key, "FACTORY", JSON.stringify(r.options.map((o) => [o.key, o.value])));
    assert.equal(r.best.project, "PROJECT_TOWN_FACTORY");
    assert.equal(recommendFocus({ ...town, factory: 0 }, GOLD).options.some((o) => o.key === "FACTORY"), false, "no factory resource: no option");
    assert.equal(recommendFocus({ ...town, available: null }, GOLD).options.find((o) => o.key === "FACTORY").availableNow, false, "unknown offer: not now");
});
