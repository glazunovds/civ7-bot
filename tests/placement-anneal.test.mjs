// The building solver's annealing step (root CLAUDE.md gotcha 48): greedy and local search cannot build a
// chain of connector buildings toward far tiles, so whole quarters stayed by the Palace at +0
// (tools/bench-optimality.mjs, research/27).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGameInfo } from "./fakes/fake-engine.mjs";
import { layoutOf, makeRandomCity, planValue, randomCityState } from "./fakes/random-city.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { solveLayout } from "../mod/expansion-planner/ui/core/xpl-placement-solver.js";
import { runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";

const book = buildRuleBook(loadGameInfo("antiquity").info, "AGE_ANTIQUITY");
const ALL = book.buildings.map((b) => b.type);
const WAREHOUSES = book.warehouses.map((b) => b.type);

function solve(seed, annealSteps, options = {}) {
    const map = makeRandomCity(seed);
    const state = randomCityState(map, book, options);
    const plan = runToEnd(solveLayout(state, ALL, WAREHOUSES, { annealSteps }));
    return { map, state, plan, value: planValue(state) };
}

function resourcesNextTo(r, type) {
    const idx = r.state.settlements.get("s0").planned.get(type);
    return r.map.w.grid.neighbours(idx).filter((n) => r.map.w.table[n].resource).length;
}

test("annealing takes the production quarter to the resources two rings out that greedy and local search left empty", () => {
    const before = solve(4 * 7919, 0); // the benchmark's map 4: 13.6% below the best layout found
    const after = solve(4 * 7919, undefined);
    assert.equal(resourcesNextTo(before, "BUILDING_BARRACKS"), 0, "the trap: Barracks by the Palace at +0");
    assert.ok(resourcesNextTo(after, "BUILDING_BARRACKS") >= 2 && resourcesNextTo(after, "BUILDING_BLACKSMITH") >= 2, "both by the resource cluster");
    assert.ok(after.value > before.value + 3, `plan value ${before.value.toFixed(1)} -> ${after.value.toFixed(1)}`);
    assert.ok(after.plan.timings.annealGain > 3);
    assert.ok(after.state.isConnected(), "every urban tile still reaches the centre");
});

test("annealing never returns a layout worse than the one local search gave it; the same input gives the same layout", () => {
    for (let m = 1; m <= 6; m++) {
        for (const horizon of [undefined, 80]) {
            const plain = solve(m * 7919, 0, { horizon });
            const annealed = solve(m * 7919, undefined, { horizon });
            assert.ok(annealed.value >= plain.value - 1e-6, `map ${m} horizon ${horizon}: ${plain.value.toFixed(2)} -> ${annealed.value.toFixed(2)}`);
            const again = solve(m * 7919, undefined, { horizon });
            const key = (r) => layoutOf(r.state).map(({ type, idx }) => `${type}@${idx}`).sort();
            assert.deepEqual(key(again), key(annealed), `map ${m}: deterministic`);
        }
    }
});

// Moves and swaps keep a building's completion turn: replayed in that order, 26 of 30 random layouts had a building whose
// tile touched no urban tile standing by then (its connector came later), which the game refuses until then.
test("every layout can be built in its own completion order: each building's tile touches the urban area standing by then", () => {
    for (let m = 1; m <= 15; m++) {
        const { map, state, plan } = solve(m * 7919, undefined, { horizon: 80 });
        const urban = new Set(state.tilesOf("s0").filter((t) => t.origDistrict === "DISTRICT_URBAN" || t.origDistrict === "DISTRICT_CITY_CENTER").map((t) => t.idx));
        const items = [...plan.placements, ...plan.fillers].filter((p) => book.classOf(p.type) !== "WONDER").sort((a, b) => a.eta - b.eta);
        const late = [];
        // Buildings done on the same turn may stand in any order among themselves.
        for (let i = 0; i < items.length;) {
            let j = i;
            while (j < items.length && items[j].eta === items[i].eta) j++;
            let left = items.slice(i, j);
            for (let progress = true; left.length > 0 && progress;) {
                progress = false;
                left = left.filter((p) => {
                    if (!urban.has(p.idx) && !map.w.grid.neighbours(p.idx).some((n) => urban.has(n))) return true;
                    urban.add(p.idx);
                    progress = true;
                    return false;
                });
            }
            for (const p of left) urban.add(p.idx);
            late.push(...left.map((p) => `${p.type}@${p.idx} T${p.eta}`));
            i = j;
        }
        assert.deepEqual(late, [], `map ${m}`);
    }
});
