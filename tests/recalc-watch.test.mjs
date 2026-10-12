// Suggested recalculation: the watcher records why the last plan / site list may be
// outdated, only for events that touch them, and recalculating clears the reasons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
installFakeEngine({
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
});
const dmt = installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
await import("../mod/expansion-planner/ui/hud/xpl-recalc-watch.js");
const { adviceFor, clearAdvice } = await import("../mod/expansion-planner/ui/services/xpl-advice.js");
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_LIBRARY", "BUILDING_MARKET"], timeAware: false } };
await startBuildingPlan(listTargets()[0], settings).promise;
const near = { x: C.x + 1, y: C.y };
const far = { x: 25, y: 16 };

test("only events that touch the plan suggest recalculating it", async () => {
    assert.deepEqual(adviceFor("plans"), []);
    engine.trigger("ConstructibleAddedToMap", { location: far, constructibleType: "BUILDING_LIBRARY" });
    engine.trigger("ConstructibleAddedToMap", { location: near, constructibleType: "IMPROVEMENT_FARM" });
    engine.trigger("PlotOwnershipChanged", { location: far });
    engine.trigger("PlayerTurnActivated", { player: 0 }); // same turn as the plan
    assert.deepEqual(adviceFor("plans"), []);

    engine.trigger("ConstructibleAddedToMap", { location: near, constructibleType: "BUILDING_LIBRARY" });
    engine.trigger("PlotOwnershipChanged", { location: near });
    assert.deepEqual(adviceFor("plans"), ["BUILT", "TILES"]);

    Game.turn += 10;
    engine.trigger("PlayerTurnActivated", { player: 1 }); // someone else's turn: nothing
    assert.ok(!adviceFor("plans").includes("TURNS"));
    engine.trigger("PlayerTurnActivated", { player: 0 });
    assert.ok(adviceFor("plans").includes("TURNS"));

    dmt.add(C.x - 1, C.y, "BUILDING_ALTAR"); // the player's own tack in the area
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.ok(adviceFor("plans").includes("TACKS"));

    clearAdvice("plans"); // what pressing "Recalculate" does
    assert.deepEqual(adviceFor("plans"), []);
});

test("site list: a city founded near a pick, borders moving onto it", () => {
    const m = { idx: (x, y) => GameplayMap.getIndexFromXY(x, y) };
    state.set({ results: { ...state.get().results, sites: { picks: [{ idx: m.idx(20, 10) }], computedTurn: Game.turn } } });
    engine.trigger("PlotOwnershipChanged", { location: { x: 2, y: 2 } });
    assert.deepEqual(adviceFor("sites"), []);
    engine.trigger("PlotOwnershipChanged", { location: { x: 21, y: 10 } });
    engine.trigger("CityInitialized", { cityID: { owner: 3, id: 1 } }); // location unknown: suggest to be safe
    assert.deepEqual(adviceFor("sites"), ["BORDERS", "CITIES"]);
});
