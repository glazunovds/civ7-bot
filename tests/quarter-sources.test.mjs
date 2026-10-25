// The building job's quarter yields (adjacency F8): our traits', slotted cards' and pantheons' modifiers, judged for each
// settlement (a city, a town, its centre's biome), reach the plan's settlements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const R = { x: 4, y: 4 };   // a city on tundra
const N = { x: 12, y: 4 };  // a city on grassland
const T = { x: 4, y: 11 };  // a town
const world = {
    width: 20, height: 14, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", biome: x === R.x && y === R.y ? "BIOME_TUNDRA" : "BIOME_GRASSLAND", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - R.x) <= 1 && Math.abs(y - R.y) <= 1 ? 0 : -1 }),
    structures: (x, y) => ((x === R.x && y === R.y) || (x === N.x && y === N.y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0, civ: "CIVILIZATION_ROME" }],
    cities: [
        { owner: 0, ...R, name: "Moscow" },
        { owner: 0, ...N, name: "Novgorod" },
        { owner: 0, ...T, name: "Tula", isTown: true },
    ],
};
installFakeEngine(world);
const { quarterYieldsByMember } = await import("../mod/expansion-planner/ui/data/xpl-quarter-sources.js");
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

// Russia's ability, as GameInfo shows it (age-modern civilizations-shared-gameeffects.xml), given to the fixture's Rome.
Object.assign(GameInfo, {
    CivilizationTraits: [{ CivilizationType: "CIVILIZATION_ROME", TraitType: "TRAIT_RUSSIA_ABILITY" }],
    TraitModifiers: [{ TraitType: "TRAIT_RUSSIA_ABILITY", ModifierId: "PROSVESHCHENIE_CITY_YIELDS" }],
    DynamicModifiers: [{ ModifierType: "MT_ATTACH", EffectType: "EFFECT_ATTACH_MODIFIERS" }, { ModifierType: "MT_PLOT", EffectType: "EFFECT_PLOT_ADJUST_YIELD" }],
    Modifiers: [
        { ModifierId: "PROSVESHCHENIE_CITY_YIELDS", ModifierType: "MT_ATTACH" },
        { ModifierId: "PROSVESHCHENIE_CITY_CULTURE", ModifierType: "MT_PLOT", SubjectRequirementSetId: "S1", OwnerRequirementSetId: "O1" },
        { ModifierId: "PROSVESHCHENIE_CITY_SCIENCE", ModifierType: "MT_PLOT", SubjectRequirementSetId: "S2", OwnerRequirementSetId: "O2" },
    ],
    ModifierArguments: [
        { ModifierId: "PROSVESHCHENIE_CITY_YIELDS", Name: "ModifierId", Value: "PROSVESHCHENIE_CITY_CULTURE,PROSVESHCHENIE_CITY_SCIENCE" },
        { ModifierId: "PROSVESHCHENIE_CITY_CULTURE", Name: "YieldType", Value: "YIELD_CULTURE" },
        { ModifierId: "PROSVESHCHENIE_CITY_CULTURE", Name: "Amount", Value: "1" },
        { ModifierId: "PROSVESHCHENIE_CITY_SCIENCE", Name: "YieldType", Value: "YIELD_SCIENCE" },
        { ModifierId: "PROSVESHCHENIE_CITY_SCIENCE", Name: "Amount", Value: "1" },
    ],
    RequirementSets: ["S1", "O1", "S2", "O2"].map((id) => ({ RequirementSetId: id, RequirementSetType: "REQUIREMENTSET_TEST_ALL" })),
    RequirementSetRequirements: [
        { RequirementSetId: "S1", RequirementId: "Q1" }, { RequirementSetId: "O1", RequirementId: "C1" },
        { RequirementSetId: "S2", RequirementId: "Q2" }, { RequirementSetId: "O2", RequirementId: "C2" }, { RequirementSetId: "O2", RequirementId: "B2" },
    ],
    Requirements: [
        { RequirementId: "Q1", RequirementType: "REQUIREMENT_PLOT_IS_QUARTER" }, { RequirementId: "C1", RequirementType: "REQUIREMENT_CITY_IS_CITY" },
        { RequirementId: "Q2", RequirementType: "REQUIREMENT_PLOT_IS_QUARTER" }, { RequirementId: "C2", RequirementType: "REQUIREMENT_CITY_IS_CITY" },
        { RequirementId: "B2", RequirementType: "REQUIREMENT_PLOT_BIOME_TYPE_MATCHES" },
    ],
    RequirementArguments: [{ RequirementId: "B2", Name: "BiomeType", Value: "BIOME_TUNDRA" }],
});

test("each settlement's quarter yields: a tundra city Culture and Science, a city Culture, a town nothing", () => {
    const cities = Players.get(0).Cities.getCities();
    const members = cities.map((c) => ({ key: `c:${c.location.x}-${c.location.y}`, x: c.location.x, y: c.location.y, city: c }));
    const { bySid, signature } = quarterYieldsByMember(members, (k) => (k === `c:${T.x}-${T.y}` ? "TOWN" : "CITY"));
    assert.deepEqual(bySid.get(`c:${R.x}-${R.y}`), [0, 0, 0, 1, 1, 0, 0]);
    assert.deepEqual(bySid.get(`c:${N.x}-${N.y}`), [0, 0, 0, 0, 1, 0, 0]);
    assert.equal(bySid.has(`c:${T.x}-${T.y}`), false);
    assert.ok(signature.includes("PROSVESHCHENIE_CITY_CULTURE"), signature);
});

test("the building job hands them to its plan, and its inputs name them (a new card or pantheon is a full plan)", async () => {
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, timeAware: false, incremental: false, selected: ["BUILDING_LIBRARY", "BUILDING_BARRACKS"] } };
    await startBuildingPlan(listTargets()[0], settings).promise;
    const inputs = JSON.parse(state.get().results.plans.inputSig);
    assert.ok(String(inputs.quarters).includes("PROSVESHCHENIE_CITY_CULTURE:0.0.0.0.1.0.0"), JSON.stringify(inputs.quarters));
    // Each settlement carries its own (its fingerprint: a new Altar or role re-solves it).
    const sigs = state.get().results.plans.memberSigs;
    assert.ok(String(sigs[`c:${R.x}-${R.y}`]).endsWith("/0.0.0.1.1.0.0"), JSON.stringify(sigs));
});
