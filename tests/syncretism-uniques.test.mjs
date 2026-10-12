// A unique quarter can become buildable in the middle of a turn: Syncretism lets a
// Time-Tested civ adopt an Apex civ's quarter (in game: Greece adopting the Abbasid
// Ulema, Madrasa + Mosque). The next recalculation must plan its buildings, and the
// toolbar dot must suggest that recalculation. Antiquity data here: Greece adopts Rome's Forum.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
const greece = { id: 0, civ: "CIVILIZATION_GREECE", uniqueQuarters: ["QUARTER_ACROPOLIS"] };
installFakeEngine({
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [greece],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 8, prod: 15 }],
});
installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
await import("../mod/expansion-planner/ui/hud/xpl-recalc-watch.js");
const { getRules } = await import("../mod/expansion-planner/ui/data/xpl-rules-loader.js");
const { adviceFor, clearAdvice } = await import("../mod/expansion-planner/ui/services/xpl-advice.js");
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

const FORUM = ["BUILDING_BASILICA", "BUILDING_TEMPLE_OF_JUPITER"];
const settings = {
    ...DEFAULT_SETTINGS,
    buildings: { ...DEFAULT_SETTINGS.buildings, selected: ["BUILDING_LIBRARY", "BUILDING_ODEON", ...FORUM], timeAware: false },
};
const uniques = () => getRules().uniques.map((b) => b.type).sort();
const planned = () => new Set(state.get().results.plans.placements.map((p) => p.type));

test("a quarter adopted mid-turn reaches the rules, the advice and the next plan", async () => {
    assert.deepEqual(uniques(), ["BUILDING_ODEON", "BUILDING_PARTHENON"]);
    await startBuildingPlan(listTargets()[0], settings).promise;
    assert.ok(planned().has("BUILDING_ODEON"));
    assert.ok(!FORUM.some((t) => planned().has(t)));
    assert.deepEqual(adviceFor("plans"), []);

    greece.uniqueQuarters.push("QUARTER_FORUM"); // the Syncretism choice, same turn
    engine.trigger("PlayerUnlockChanged", { player: 0 });
    assert.deepEqual(adviceFor("plans"), ["UNIQUES"]);

    assert.deepEqual(uniques(), ["BUILDING_BASILICA", "BUILDING_ODEON", "BUILDING_PARTHENON", "BUILDING_TEMPLE_OF_JUPITER"]);
    clearAdvice("plans"); // what «Пересчитать» does
    await startBuildingPlan(listTargets()[0], settings).promise;
    for (const t of FORUM) assert.ok(planned().has(t), `${t} gets a tile`);
    engine.trigger("PlayerTurnActivated", { player: 0 });
    assert.deepEqual(adviceFor("plans"), [], "no advice once the plan includes the quarter");
});

test("the rules are rebuilt on a new turn (techs and civics activate adjacencies)", () => {
    const before = getRules();
    assert.equal(getRules(), before, "same turn, same quarters: cached");
    Game.turn += 1;
    assert.notEqual(getRules(), before);
});
