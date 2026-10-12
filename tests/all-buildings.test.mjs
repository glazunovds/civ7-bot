// Every slot building, every civ's own uniques, and every kind of map tack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt, loadGameInfo } from "./fakes/fake-engine.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";

test("each civilization gets exactly its own unique buildings", () => {
    const { info } = loadGameInfo("antiquity");
    const civs = [...new Set(Array.from(info.CivilizationTraits, (r) => r.CivilizationType))];
    assert.ok(civs.length >= 5);
    for (const civ of civs) {
        const traits = new Set(info.CivilizationTraits.filter((r) => r.CivilizationType === civ).map((r) => r.TraitType));
        const book = buildRuleBook(info, "AGE_ANTIQUITY", () => false, { traits });
        const expected = info.Buildings
            .filter((b) => b.TraitType && traits.has(b.TraitType))
            .map((b) => b.ConstructibleType)
            .filter((t) => {
                const p = book.placementOf(t);
                return (!p.age || p.age === "AGE_ANTIQUITY") && !p.slotless && !p.multiplePerCity;
            })
            .sort();
        assert.deepEqual(book.uniques.map((u) => u.type).sort(), expected, civ);
        // Nobody else's uniques sneak into the common list.
        for (const b of book.buildings) assert.ok(!info.Buildings.lookup(b.type)?.TraitType, `${civ}: ${b.type} is someone's unique`);
    }
});

test("a later age keeps the earlier civ's unlocked unique quarter (Acropolis in Exploration)", () => {
    const { info } = loadGameInfo("antiquity");
    // New civ in the Exploration Age (none of Greece's traits), the game still lists the Acropolis as unlocked.
    const book = buildRuleBook(info, "AGE_EXPLORATION", () => false, { traits: new Set(["TRAIT_SOME_EXPLORATION_CIV"]), uniqueQuarterTypes: new Set(["QUARTER_ACROPOLIS"]) });
    assert.deepEqual(book.uniques.map((u) => u.type).sort(), ["BUILDING_ODEON", "BUILDING_PARTHENON"]);
    assert.deepEqual(book.uniqueQuarters.map((q) => q.type), ["QUARTER_ACROPOLIS"]);
    assert.ok(book.isActive("BUILDING_ODEON"), "ageless: still counts for adjacency and quarters");
    // Another civ's quarter that is not unlocked stays out.
    assert.ok(!book.uniques.some((u) => u.type === "BUILDING_MASTABA"));
});

test("buildings without their own adjacency (Altar) are offered too", () => {
    const { info } = loadGameInfo("antiquity");
    const book = buildRuleBook(info, "AGE_ANTIQUITY");
    assert.ok(book.buildings.some((b) => b.type === "BUILDING_ALTAR"));
});

// ---- tacks of every kind on a real plan ------------------------------------------------
const C = { x: 10, y: 8 };
const fake = installFakeEngine({
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - C.x) <= 2 && Math.abs(y - C.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Rome", pop: 6, prod: 12 }],
});
const dmt = installFakeDmt();
const { listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { candidateTacks, genericMatches, tacksByType } = await import("../mod/expansion-planner/ui/data/xpl-tack-orders.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("generic building tacks fill a slot; improvement tacks keep a tile rural", async () => {
    const ring = fake.grid.neighbours(fake.grid.index(C.x, C.y)).map((i) => ({ x: fake.grid.x(i), y: fake.grid.y(i), idx: i }));
    const [g, farm] = ring;
    dmt.add(g.x, g.y, "DMT_BUILDING_SCIENCE");
    dmt.add(farm.x, farm.y, "IMPROVEMENT_FARM");
    const generic = ring[2];
    dmt.add(generic.x, generic.y, "DMT_IMPROVEMENT");
    const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, timeAware: false } };
    await startBuildingPlan(listTargets()[0], settings).promise;
    const plans = state.get().results.plans;
    assert.equal(plans.tacksRespected, 3);
    const all = [...plans.placements, ...plans.fillers];
    for (const r of [farm, generic]) assert.ok(!all.some((p) => p.idx === r.idx), `nothing built on the improvement tack at ${r.x},${r.y}`);
    assert.ok(all.filter((p) => p.idx === g.idx).length <= 1, "the generic tack takes one of two slots");
    // Every other building still finds a tile further out.
    assert.ok(plans.placements.length >= 5);
});

test("production-menu matching: generic tacks stand for the right buildings", () => {
    const lib = GameInfo.Constructibles.lookup("BUILDING_LIBRARY");
    const market = GameInfo.Constructibles.lookup("BUILDING_MARKET");
    const odeon = GameInfo.Constructibles.lookup("BUILDING_ODEON");
    const pyramids = GameInfo.Constructibles.lookup("WONDER_PYRAMIDS");
    assert.ok(genericMatches("DMT_BUILDING_SCIENCE", lib));
    assert.ok(!genericMatches("DMT_BUILDING_SCIENCE", market));
    assert.ok(genericMatches("DMT_BUILDING_GOLD", market));
    assert.ok(genericMatches("DMT_BUILDING", market));
    assert.ok(genericMatches("DMT_BUILDING_UNIQUE_QUARTER", odeon));
    assert.ok(!genericMatches("DMT_BUILDING_UNIQUE_QUARTER", lib));
    assert.ok(genericMatches("DMT_WONDER", pyramids));
    assert.ok(!genericMatches("DMT_WONDER", lib));
    const tacks = tacksByType();
    const libCandidates = candidateTacks(lib, tacks);
    assert.ok(libCandidates.some((t) => t.generic === "DMT_BUILDING_SCIENCE"));
    assert.ok(!candidateTacks(market, tacks).some((t) => t.generic === "DMT_BUILDING_SCIENCE"));
});
