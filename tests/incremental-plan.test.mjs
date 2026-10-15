// Faster recalculation: the game's per-city answers are reused within a turn, and a
// recalculation of the same plan re-solves only the settlements whose inputs changed
// (the others keep their layout). Anything else (settings, 10 turns) means a full plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const centres = [[6, 6], [16, 6], [26, 6]];
const built = new Map(); // "x,y" -> constructible types built since the start
const near = (x, y) => centres.some(([cx, cy]) => Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2);
installFakeEngine({
    width: 34, height: 14, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: near(x, y) ? 0 : -1 }),
    structures: (x, y) => {
        if (centres.some(([cx, cy]) => cx === x && cy === y)) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] };
        const b = built.get(`${x},${y}`);
        return b ? { district: "DISTRICT_URBAN", constructibles: b } : { district: null, constructibles: [] };
    },
    players: [{ id: 0 }],
    cities: centres.map(([x, y], i) => ({ owner: 0, x, y, name: `City${i}`, pop: 6, prod: 10 })),
});
// Count the game queries the planner makes.
let queries = 0;
const canStart = Game.CityOperations.canStart;
Game.CityOperations.canStart = (...a) => {
    queries++;
    return canStart(...a);
};
const { allTarget, listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { runJob } = await import("../mod/expansion-planner/ui/services/xpl-scheduler.js");

const selected = ["BUILDING_MONUMENT", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_BARRACKS", "BUILDING_ALTAR"];
const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected, timeAware: true } };
const plan = async (s = settings) => {
    await startBuildingPlan(allTarget(listTargets()), s).promise;
    return state.get().results.plans;
};
const layoutOf = (plans, sid) => plans.placements.filter((p) => p.sid === sid).map((p) => `${p.type}@${p.idx}`).sort();

test("same turn, nothing changed: no new game queries, every layout kept", async () => {
    const first = await plan();
    assert.equal(first.incremental, null, "the first plan is a full one");
    const asked = queries;
    assert.ok(asked > 0);
    const second = await plan();
    assert.equal(queries, asked, "answers come from this turn's cache");
    assert.deepEqual(second.incremental, { changed: 0, of: 3 });
    assert.equal(second.total, first.total);
    for (const m of first.members) assert.deepEqual(layoutOf(second, m.key), layoutOf(first, m.key));
});

test("a building completed in one city: only that city is re-solved", async () => {
    const before = state.get().results.plans;
    const lib = before.placements.find((p) => p.sid === "c:6-6" && p.type === "BUILDING_LIBRARY");
    built.set(`${lib.x},${lib.y}`, ["BUILDING_LIBRARY"]);
    const asked = queries;
    engine.trigger("ConstructibleAddedToMap", { location: { x: lib.x, y: lib.y }, constructibleType: "BUILDING_LIBRARY" });
    const after = await plan();
    assert.ok(queries > asked, "the event invalidated the cached answers");
    assert.deepEqual(after.incremental, { changed: 1, of: 3 });
    assert.ok(!after.placements.some((p) => p.sid === "c:6-6" && p.type === "BUILDING_LIBRARY"), "the built Library is no longer planned");
    for (const sid of ["c:16-6", "c:26-6"]) assert.deepEqual(layoutOf(after, sid), layoutOf(before, sid), `${sid} keeps its layout`);
});

test("changed settings, ten turns later, or the option off: a full plan", async () => {
    const fewer = { ...settings, buildings: { ...settings.buildings, selected: selected.slice(0, 3) } };
    assert.equal((await plan(fewer)).incremental, null);
    assert.notEqual((await plan(fewer)).incremental, null, "same settings again: incremental");
    Game.turn += 10;
    assert.equal((await plan(fewer)).incremental, null);
    const off = { ...fewer, buildings: { ...fewer.buildings, incremental: false } };
    assert.equal((await plan(off)).incremental, null);
});

test("a changed priority balance (the Autopilot tab's sliders): a full plan", async () => {
    await plan();
    assert.notEqual((await plan()).incremental, null, "same settings: incremental");
    const tilted = { ...settings, yieldBias: { F: 0.5, P: 1, G: 1, S: 2, C: 1, H: 1 } };
    assert.equal((await plan(tilted)).incremental, null, "the weights changed: every layout is solved again");
    assert.notEqual((await plan(tilted)).incremental, null);
});

test("the plan logs its timing per phase", async () => {
    const t = (await plan()).timings;
    for (const k of ["engine", "setup", "greedy", "search", "repair", "describe", "busy", "frames", "deltas"]) assert.equal(typeof t[k], "number", k);
});

test("the scheduler reads a budget function every frame", async () => {
    let calls = 0;
    function* job() {
        for (let i = 0; i < 3; i++) {
            const until = Date.now() + 3;
            while (Date.now() < until);
            yield i / 3;
        }
        return "done";
    }
    const out = await runJob("budget-test", job(), { budgetMs: () => (calls++, 1) }).promise;
    assert.equal(out.result, "done");
    assert.ok(calls >= 3, `budget asked ${calls} times`);
});
