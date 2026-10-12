// One-click automation: queue a city's next planned buildings at their tiles, buy the
// best-value planned building with gold, see each building's upkeep (and which ones give
// less than they cost), set a town's Focus, and get a toolbar dot when a town needs a look.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { rankPurchases } from "../mod/expansion-planner/ui/core/xpl-purchase-advisor.js";

const C = { x: 8, y: 8 };
const T = { x: 18, y: 8 };
const world = {
    width: 28, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: C.x, y: C.y, name: "Athens", pop: 8, prod: 10 },
        { owner: 0, x: T.x, y: T.y, name: "Pella", isTown: true, pop: 6, prod: 4, connected: [0] },
    ],
    gold: 600,
    canBuild: (type, _id, args) => ({ Success: args.X !== undefined ? refusedAt !== `${args.X},${args.Y}` : true, Plots: [], ExpandUrbanPlots: [] }),
    canBuy: (type, _id, args) => ({ Success: args.X !== undefined, Cost: type === "BUILDING_LIBRARY" ? 200 : 400 }),
    // The game's per-city upkeep for the Monument is lower than the table's (a policy, say).
    maintenance: (_city, type) => (type === "BUILDING_MONUMENT" ? [0, 0, 1, 0, 0, 0, 0] : undefined),
};
let refusedAt = null;
const fake = installFakeEngine(world);
await import("../mod/expansion-planner/ui/hud/xpl-recalc-watch.js");
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const actions = await import("../mod/expansion-planner/ui/data/xpl-city-actions.js");
const { adviceFor } = await import("../mod/expansion-planner/ui/services/xpl-advice.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const selected = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_BARRACKS"];
const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected, timeAware: true } };
const athens = listTargets().find((t) => t.name === "Athens");
await startBuildingPlan(athens, settings).promise;
const plans = () => state.get().results.plans;
const sent = (kind) => fake.sent.filter((s) => s.kind === kind);

test("every planned building shows its upkeep: the game's number for that city, else the table's", () => {
    const lib = plans().placements.find((p) => p.type === "BUILDING_LIBRARY");
    const mon = plans().placements.find((p) => p.type === "BUILDING_MONUMENT");
    assert.deepEqual(lib.upkeep, [0, 0, 2, 0, 0, 2, 0]); // Constructible_Maintenances: 2 gold, 2 happiness
    assert.deepEqual(mon.upkeep, [0, 0, 1, 0, 0, 0, 0]); // from city.Constructibles.getMaintenance
    // A Library with no adjacency on plain grassland gives less than its upkeep by these priorities.
    assert.ok(lib.net < 0, `Library net ${lib.net}`);
    assert.ok(mon.net > lib.net);
});

test("queue the next planned buildings: in plan order, on their tiles, skipping refused tiles", () => {
    const order = plans().placements.filter((p) => p.sid === athens.key);
    refusedAt = `${order[0].x},${order[0].y}`; // e.g. a tile the city does not own yet
    const before = sent("operation").length;
    const r = actions.queueNextBuildings(plans(), athens.key, 2);
    const ops = sent("operation").slice(before);
    // Everything planned on the refused tile (a quarter holds two) is skipped, in order.
    const onRefused = order.filter((p) => `${p.x},${p.y}` === refusedAt);
    const expected = order.filter((p) => `${p.x},${p.y}` !== refusedAt).slice(0, 2);
    assert.ok(r.refused >= 1 && r.refused <= onRefused.length);
    assert.deepEqual(r.queued, expected.map((p) => p.type));
    assert.deepEqual(ops.map((o) => [o.args.X, o.args.Y]), expected.map((p) => [p.x, p.y]));
    assert.equal(ops[0].args.ConstructibleType, GameInfo.Constructibles.lookup(expected[0].type).$hash);
    refusedAt = null;
    assert.deepEqual(actions.queueNextBuildings(plans(), "c:18-8").queued, [], "towns have no production queue");
});

test("gold purchases: best value per gold first, within the treasury; Buy sends the purchase on the planned tile", () => {
    const advice = actions.purchaseAdvice(plans(), settings);
    assert.equal(advice.gold, 600);
    assert.ok(advice.picks.length > 0);
    for (let i = 1; i < advice.picks.length; i++) assert.ok(advice.picks[i - 1].perGold >= advice.picks[i].perGold);
    const spent = advice.picks.filter((p) => p.inBudget).reduce((s, p) => s + p.cost, 0);
    assert.ok(spent <= 600);
    const pick = advice.picks[0];
    assert.ok(actions.buyPlanned(pick));
    const buy = sent("command").at(-1);
    assert.equal(buy.op, CityCommandTypes.PURCHASE);
    assert.deepEqual([buy.args.X, buy.args.Y], [pick.x, pick.y]);
});

test("purchase ranking: a town (no production) gains the rest of the age; nothing unaffordable is in budget", () => {
    const r = rankPurchases([
        { key: "city", perTurn: 4, eta: 5, cost: 100, canBuy: true },
        { key: "town", perTurn: 2, eta: Infinity, cost: 150, canBuy: true },
        { key: "big", perTurn: 10, eta: 30, cost: 900, canBuy: true },
        { key: "no", perTurn: 9, eta: 9, cost: 10, canBuy: false },
    ], { gold: 300, turnsLeft: 40 });
    assert.deepEqual(r.picks.map((p) => p.key), ["town", "big", "city"]); // 80/150, 300/900, 20/100
    assert.equal(r.picks.find((p) => p.key === "town").turnsGained, 40);
    assert.equal(r.picks.find((p) => p.key === "big").inBudget, false);
    assert.deepEqual(r.picks.filter((p) => p.inBudget).map((p) => p.key), ["town", "city"]);
});

test("a town's Focus is set with the game's own command; a refusal says so", () => {
    const pella = Players.get(0).Cities.getCities().find((c) => c.name === "Pella");
    const r = actions.applyTownFocus(pella.id, "PROJECT_TOWN_GRANARY");
    assert.ok(r.ok);
    const cmd = sent("command").at(-1);
    assert.equal(cmd.op, CityCommandTypes.CHANGE_GROWTH_MODE);
    assert.deepEqual(cmd.args, { Type: GrowthTypes.PROJECT, ProjectType: GameInfo.Projects.lookup("PROJECT_TOWN_GRANARY").$hash, City: pella.id.id });
    world.canFocus = () => false;
    assert.equal(actions.applyTownFocus(pella.id, "PROJECT_TOWN_GRANARY").ok, false);
    delete world.canFocus;
});

test("toolbar dot: a Growing town reaching population 7, a specialized town with no city to feed", () => {
    const town = world.cities[1];
    engine.trigger("CityPopulationChanged", { cityID: { owner: 0, id: 1 } });
    assert.deepEqual(adviceFor("towns"), [], "population 6: nothing yet");
    town.pop = 7;
    engine.trigger("CityPopulationChanged", { cityID: { owner: 0, id: 1 } });
    assert.deepEqual(adviceFor("towns"), ["FOCUS_READY"]);
    town.focus = true;
    town.connected = [];
    engine.trigger("CityGrowthModeChanged", { cityID: { owner: 0, id: 1 } });
    assert.deepEqual(adviceFor("towns"), ["FOCUS_READY", "NOT_CONNECTED"]);
});
