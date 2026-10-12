// A building limited to some terrain still follows the land rules. The Modern Airfield
// (ValidTerrains = TERRAIN_FLAT, a full tile) was planned on flat tiles with Ivory,
// Horses and Saltpeter, which the game refuses ("cannot be placed on Ivory").
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { PlanState } from "../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { solveLayout } from "../mod/expansion-planner/ui/core/xpl-placement-solver.js";
import { runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const { info } = loadGameInfo("modern");
const book = buildRuleBook(info, "AGE_MODERN");

function setup() {
    const w = new FakeWorld(20, 16);
    const C = { x: 10, y: 8 };
    w.patch(C.x, C.y, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }] });
    const centre = w.at(C.x, C.y);
    const ring = w.grid.neighbours(centre);
    // Every neighbour but one carries a resource (the game: no buildings on resources).
    const free = ring[0];
    for (const idx of ring.slice(1)) w.table[idx] = { ...w.table[idx], resource: "RESOURCE_HORSES", urbanizable: false };
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        centre,
        area: w.grid.radius(centre, 1).map((p) => p.idx),
        owned: new Set(w.grid.radius(centre, 1).map((p) => p.idx)),
        book,
        weights: getProfile("BALANCE").y,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
    });
    return { state, ring, free };
}

test("the Airfield (flat land only) never goes on a resource tile", () => {
    assert.ok(book.placementOf("BUILDING_AIRFIELD").validTerrains.has("TERRAIN_FLAT"), "fixture: Airfield lists TERRAIN_FLAT");
    const { state, ring, free } = setup();
    for (const idx of ring.slice(1)) assert.equal(state.canPlace("BUILDING_AIRFIELD", idx).reason, "RESOURCE");
    assert.ok(state.canPlace("BUILDING_AIRFIELD", free).ok);
    const plan = runToEnd(solveLayout(state, ["BUILDING_AIRFIELD"], [], { placeEvenIfNegative: true }));
    assert.deepEqual(plan.placements.map((p) => p.idx), [free]);
});
