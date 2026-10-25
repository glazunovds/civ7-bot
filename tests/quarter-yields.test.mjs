// Quarter yield modifiers (adjacency F8, game 60): Russia's ability gives +1 Culture on every quarter of a city
// (PROSVESHCHENIE_CITY_CULTURE: EFFECT_PLOT_ADJUST_YIELD, subject REQUIREMENT_PLOT_IS_QUARTER, owner REQUIREMENT_CITY_IS_CITY,
// attached by PROSVESHCHENIE_CITY_YIELDS) and +1 Science in a tundra city; the urban pantheons give +1 on quarters of a city
// with an Altar. The plan valued a quarter only through adjacency rules; now it counts these for the age's remaining share
// (the next age's too when the quarter lasts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { PlanState } from "../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { quarterModifiers, quarterSignature, quarterYieldsFor } from "../mod/expansion-planner/ui/core/xpl-quarter-yields.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

// The game's rows (age-modern civilizations-shared-gameeffects.xml, age-antiquity religion-gameeffects.xml), as GameInfo
// shows them.
const req = (id, type, args = {}) => ({ id, type, args });
const info = (() => {
    const mods = [
        { id: "PROSVESHCHENIE_CITY_YIELDS", type: "MT_ATTACH", args: { ModifierId: "PROSVESHCHENIE_CITY_CULTURE,PROSVESHCHENIE_CITY_SCIENCE" } },
        { id: "PROSVESHCHENIE_CITY_CULTURE", type: "MT_PLOT", args: { YieldType: "YIELD_CULTURE", Amount: "1" }, subject: [req("RQ_Q1", "REQUIREMENT_PLOT_IS_QUARTER")], owner: [req("RQ_C1", "REQUIREMENT_CITY_IS_CITY")] },
        { id: "PROSVESHCHENIE_CITY_SCIENCE", type: "MT_PLOT", args: { YieldType: "YIELD_SCIENCE", Amount: "1" }, subject: [req("RQ_Q2", "REQUIREMENT_PLOT_IS_QUARTER")], owner: [req("RQ_C2", "REQUIREMENT_CITY_IS_CITY"), req("RQ_B2", "REQUIREMENT_PLOT_BIOME_TYPE_MATCHES", { BiomeType: "BIOME_TUNDRA" })] },
        { id: "MOD_PANTHEON_URBAN_CULTURE", type: "MT_ATTACH", args: { ModifierId: "ATTACH_PANTHEON_URBAN_CULTURE" }, subject: [req("RQ_P", "REQUIREMENT_PLAYER_HAS_PANTHEON")] },
        { id: "ATTACH_PANTHEON_URBAN_CULTURE", type: "MT_PLOT", args: { YieldType: "YIELD_CULTURE", Amount: "1" }, subject: [req("RQ_Q3", "REQUIREMENT_PLOT_IS_QUARTER"), req("RQ_A3", "REQUIREMENT_CITY_HAS_BUILDING", { BuildingType: "BUILDING_ALTAR" })] },
        // A tile-level biome on the subject: the quarter's own tile, which we cannot judge for a settlement.
        { id: "MOD_TILE_BIOME", type: "MT_PLOT", args: { YieldType: "YIELD_GOLD", Amount: "2" }, subject: [req("RQ_Q4", "REQUIREMENT_PLOT_IS_QUARTER"), req("RQ_B4", "REQUIREMENT_PLOT_BIOME_TYPE_MATCHES", { BiomeType: "BIOME_DESERT" })] },
        // Not a quarter's yield.
        { id: "MOD_ANY_PLOT", type: "MT_PLOT", args: { YieldType: "YIELD_FOOD", Amount: "1" } },
    ];
    const out = { DynamicModifiers: [{ ModifierType: "MT_ATTACH", EffectType: "EFFECT_ATTACH_MODIFIERS" }, { ModifierType: "MT_PLOT", EffectType: "EFFECT_PLOT_ADJUST_YIELD" }], Modifiers: [], ModifierArguments: [], RequirementSets: [], RequirementSetRequirements: [], Requirements: [], RequirementArguments: [] };
    for (const m of mods) {
        const row = { ModifierId: m.id, ModifierType: m.type };
        for (const [field, list] of [["SubjectRequirementSetId", m.subject], ["OwnerRequirementSetId", m.owner]]) {
            if (!list) continue;
            const set = `${m.id}_${field}`;
            row[field] = set;
            out.RequirementSets.push({ RequirementSetId: set, RequirementSetType: "REQUIREMENTSET_TEST_ALL" });
            for (const r of list) {
                out.RequirementSetRequirements.push({ RequirementSetId: set, RequirementId: r.id });
                out.Requirements.push({ RequirementId: r.id, RequirementType: r.type, Inverse: false });
                for (const [Name, Value] of Object.entries(r.args)) out.RequirementArguments.push({ RequirementId: r.id, Name, Value });
            }
        }
        out.Modifiers.push(row);
        for (const [Name, Value] of Object.entries(m.args)) out.ModifierArguments.push({ ModifierId: m.id, Name, Value });
    }
    return out;
})();

test("Russia's ability: +1 Culture on a city's quarters, +1 Science more in a tundra city, nothing in a town", () => {
    const mods = quarterModifiers(["PROSVESHCHENIE_CITY_YIELDS"], info);
    assert.deepEqual(mods.map((m) => m.id).sort(), ["PROSVESHCHENIE_CITY_CULTURE", "PROSVESHCHENIE_CITY_SCIENCE"]);
    assert.deepEqual(quarterYieldsFor(mods, { city: true, biome: "BIOME_GRASSLAND" }), [0, 0, 0, 0, 1, 0, 0]);
    assert.deepEqual(quarterYieldsFor(mods, { city: true, biome: "BIOME_TUNDRA" }), [0, 0, 0, 1, 1, 0, 0]);
    assert.deepEqual(quarterYieldsFor(mods, { town: true, biome: "BIOME_TUNDRA" }), [0, 0, 0, 0, 0, 0, 0]);
    assert.equal(quarterSignature(mods), "PROSVESHCHENIE_CITY_CULTURE:0.0.0.0.1.0.0,PROSVESHCHENIE_CITY_SCIENCE:0.0.0.1.0.0.0");
});

test("the urban pantheon counts where the city has an Altar; a requirement we cannot judge leaves a modifier out", () => {
    const mods = quarterModifiers(["MOD_PANTHEON_URBAN_CULTURE", "MOD_TILE_BIOME", "MOD_ANY_PLOT"], info);
    assert.deepEqual(mods.map((m) => m.id), ["ATTACH_PANTHEON_URBAN_CULTURE"]);
    assert.deepEqual(quarterYieldsFor(mods, { city: true, has: (t) => t === "BUILDING_ALTAR" }), [0, 0, 0, 0, 1, 0, 0]);
    assert.deepEqual(quarterYieldsFor(mods, { city: true, has: () => false }), [0, 0, 0, 0, 0, 0, 0]);
});

const book = buildRuleBook(loadGameInfo("antiquity").info, "AGE_ANTIQUITY");

/** A city and one tile X next to it; two buildings put on X make it a quarter. */
function cityWithTile(quarterYields, { horizon = 0, nextAge = 0 } = {}) {
    const w = new FakeWorld(24, 18);
    const C = w.at(10, 8);
    const X = w.grid.neighbours(C)[0];
    w.patch(10, 8, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }], owner: 0 });
    const state = new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        area: w.grid.radius(C, 3).map((p) => p.idx),
        settlements: [{ id: "s0", centre: C, owned: new Set(w.grid.radius(C, 2).map((p) => p.idx)), quarterYields }],
        book,
        weights: getProfile("CULTURE").y,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
        horizon,
        nextAge,
    });
    return { X, state };
}

test("the plan counts a quarter's yields from our modifiers: the age's share after it forms, the next age's when it lasts", () => {
    const culture = getProfile("CULTURE").y[4];
    const value = (qy, pair, o) => {
        const { X, state } = cityWithTile(qy, o);
        for (const [type, t] of pair) state.place(type, X, state.canPlace(type, X), t);
        return state.tileValue(X);
    };
    const qy = [0, 0, 0, 0, 1, 0, 0];
    const pair = [["BUILDING_LIBRARY", 0], ["BUILDING_BARRACKS", 0]];
    assert.ok(Math.abs(value(qy, pair) - value(null, pair) - culture) < 1e-9, "a quarter: +1 Culture weighted");
    assert.ok(Math.abs(value(qy, pair.slice(0, 1)) - value(null, pair.slice(0, 1))) < 1e-9, "one building: no quarter");
    // Time-aware: formed at turn 30 of 60, half the age.
    const late = [["BUILDING_LIBRARY", 10], ["BUILDING_BARRACKS", 30]];
    const half = value(qy, late, { horizon: 60 }) - value(null, late, { horizon: 60 });
    assert.ok(Math.abs(half - culture * 0.5) < 1e-9, `half the age: ${half}`);
    // A lasting quarter (two warehouses, ageless) counts the next age's share too.
    const lasting = [["BUILDING_GRANARY", 0], ["BUILDING_SAW_PIT", 0]];
    const next = value(qy, lasting, { nextAge: 0.5 }) - value(null, lasting, { nextAge: 0.5 });
    assert.ok(Math.abs(next - culture * 1.5) < 1e-9, `this age and half the next: ${next}`);
    const plain = value(qy, pair, { nextAge: 0.5 }) - value(null, pair, { nextAge: 0.5 });
    assert.ok(Math.abs(plain - culture) < 1e-9, `not lasting: this age only (${plain})`);
});
