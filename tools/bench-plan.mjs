// Benchmark: an "All my settlements" building plan on a fake 8-city map with every
// building selected (time-aware, like the game's default). Prints CPU time per phase.
//   node tools/bench-plan.mjs            (current code)
//   node tools/bench-plan.mjs nomemo     (tile view/value memo switched off, for comparison)
import { installFakeEngine } from "../tests/fakes/fake-engine.mjs";

const W = 48, H = 30;
const centres = [[6, 6], [14, 6], [22, 6], [30, 6], [6, 15], [14, 15], [22, 15], [30, 15]];
const dist = (x, y, cx, cy) => Math.max(Math.abs(x - cx), Math.abs(y - cy));
function tiles(x, y) {
    const owner = centres.some(([cx, cy]) => dist(x, y, cx, cy) <= 2) ? 0 : -1;
    const t = { terrain: "TERRAIN_FLAT", biome: "BIOME_GRASSLAND", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner };
    if ((x * 7 + y * 3) % 11 === 0) return { ...t, terrain: "TERRAIN_HILL", yields: { YIELD_PRODUCTION: 2 } };
    if ((x + y * 5) % 13 === 0) return { ...t, feature: "FEATURE_FOREST" };
    if (y === 10 || y === 11) return { ...t, river: true };
    return t;
}
installFakeEngine({
    width: W, height: H, wrapX: false, tiles,
    structures: (x, y) => (centres.some(([cx, cy]) => cx === x && cy === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0, civ: "CIVILIZATION_GREECE", uniqueQuarters: ["QUARTER_ACROPOLIS"] }],
    cities: centres.map(([x, y], i) => ({ owner: 0, x, y, name: `City${i}`, pop: 7, prod: 12 })),
    agePoints: 30,
});
const { PlanState } = await import("../mod/expansion-planner/ui/core/xpl-placement-model.js");
if (process.argv.includes("nomemo")) {
    PlanState.prototype.tileValue = PlanState.prototype.computeTileValue;
    PlanState.prototype.view = PlanState.prototype.computeView;
}
const { allTarget, listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, timeAware: true } };
for (let run = 1; run <= 2; run++) {
    const outcome = await startBuildingPlan(allTarget(listTargets()), settings).promise;
    const p = state.get().results.plans;
    console.log(`run ${run}: ${p.placements.length} placed, ${p.fillers.length} fillers, ${p.unplaced.length} unplaced; busy ${outcome.busyMs} ms over ${outcome.frames} frames; total ${p.total}; ${JSON.stringify(p.timings ?? {})}`);
}
