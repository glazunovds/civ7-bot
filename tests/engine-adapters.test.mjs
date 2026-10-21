// Runs the engine-facing modules (ui/data/*) against a fake engine loaded with the
// real antiquity rules, to catch runtime errors before testing in the game.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const W = 36, H = 22;
const CAPITAL = { x: 10, y: 11 };
const FOREIGN = { x: 26, y: 11 };

function tiles(x, y) {
    const t = { terrain: "TERRAIN_FLAT", biome: "BIOME_GRASSLAND", yields: { YIELD_FOOD: 2 } };
    if (y <= 1 || y >= H - 2) return { terrain: "TERRAIN_OCEAN", biome: "BIOME_MARINE", yields: { YIELD_FOOD: 1, YIELD_GOLD: 1 } };
    if (x >= 14 && x <= 17 && y >= 3 && y <= 7) return { ...t, terrain: "TERRAIN_HILL", biome: "BIOME_PLAINS", yields: { YIELD_PRODUCTION: 2 } };
    if (x === 18 && y === 5) return { ...t, terrain: "TERRAIN_MOUNTAIN", yields: { YIELD_PRODUCTION: 1 } };
    if (x >= 5 && x <= 8 && y >= 15 && y <= 18) return { ...t, feature: "FEATURE_FOREST", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 } };
    if (x === 12 && y === 16) return { ...t, resource: "RESOURCE_IRON", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 } };
    if (x >= 20) return { ...t, revealed: false };
    const dc = Math.max(Math.abs(x - CAPITAL.x), Math.abs(y - CAPITAL.y));
    if (dc <= 1) return { ...t, owner: 0 };
    const df = Math.max(Math.abs(x - FOREIGN.x), Math.abs(y - FOREIGN.y));
    if (df <= 1) return { ...t, owner: 1 };
    return t;
}

const world = {
    width: W,
    height: H,
    wrapX: false,
    tiles,
    cities: [{ owner: 0, x: CAPITAL.x, y: CAPITAL.y, name: "Rome" }, { owner: 1, x: FOREIGN.x, y: FOREIGN.y, name: "Carthage" }],
    players: [{ id: 0 }, { id: 1 }, { id: 4, isIndependent: true, name: "Nubians" }],
    aiSuggestions: () => [{ location: { x: 15, y: 9 }, factors: [{ positive: true, title: "LOC_FRESH", description: "" }] }],
};

const fake = installFakeEngine(world);
const { getRules } = await import("../mod/expansion-planner/ui/data/xpl-rules-loader.js");
const { getEngineMap } = await import("../mod/expansion-planner/ui/data/xpl-engine-map.js");
const { startSiteSearch } = await import("../mod/expansion-planner/ui/data/xpl-site-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("rules loader picks the standard antiquity buildings from real data", () => {
    const rules = getRules();
    const types = rules.buildings.map((b) => b.type).sort();
    // Every building that takes a slot, including ones without adjacency of their own (Altar).
    for (const t of ["BUILDING_LIBRARY", "BUILDING_ACADEMY", "BUILDING_MONUMENT", "BUILDING_AMPHITHEATER", "BUILDING_MARKET", "BUILDING_LIGHTHOUSE", "BUILDING_GARDEN", "BUILDING_BATH", "BUILDING_BARRACKS", "BUILDING_BLACKSMITH", "BUILDING_ARENA", "BUILDING_VILLA", "BUILDING_ALTAR"]) {
        assert.ok(types.includes(t), `missing ${t} in ${types.join(",")}`);
    }
    // Not "common": city centres, walls (no slot), warehouses (own list), civ uniques (own list).
    for (const t of ["BUILDING_PALACE", "BUILDING_CITY_HALL", "BUILDING_GRANARY", "BUILDING_ANCIENT_WALLS", "BUILDING_ODEON"]) {
        assert.ok(!types.includes(t), `${t} should be excluded`);
    }
    const fam = Object.fromEntries(rules.siteFamilies.map((f) => [f.key, f]));
    assert.deepEqual(Object.keys(fam).sort(), ["CULTURE", "FOOD", "GOLD", "HAPPINESS", "PRODUCTION", "SCIENCE"]);
    const market = rules.buildings.find((b) => b.type === "BUILDING_MARKET");
    assert.equal(market.family, "YIELD_GOLD");
    assert.deepEqual(market.rules.map((r) => r.id).sort(), ["CoastGold", "RiverGold", "WonderGold"]);
    assert.equal(rules.minSpacing, 3); // CITY_MIN_RANGE is compiled into the engine; fallback 3
    assert.ok(rules.mineResources.has("RESOURCE_IRON"));
});

test("engine map self-test passes against matching geometry", () => {
    const m = getEngineMap();
    assert.equal(m.usingEngineGeometry, false);
    assert.equal(m.map.radius(m.index(10, 10), 3).length, 37);
});

test("site search runs end to end on the fake engine", async () => {
    const handle = startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 5, useAI: true });
    const outcome = await handle.promise;
    assert.ok(!outcome.cancelled);
    const sites = state.get().results.sites;
    assert.ok(sites, "results stored");
    assert.equal(sites.empty, null);
    assert.ok(sites.picks.length >= 3, `picks: ${sites.picks.length}`);
    const capital = fake.grid.index(CAPITAL.x, CAPITAL.y);
    for (const p of sites.picks) {
        assert.ok(fake.grid.distance(p.idx, capital) >= 4, "spacing to capital");
        assert.ok(p.x < 20, "never picks unrevealed plots");
        assert.ok(p.role === "CITY" || p.role === "TOWN");
        assert.equal(p.footprint.length, p.role === "TOWN" ? 19 : 37); // a kept town works rings 1-2
        assert.ok(p.nearest && p.nearest.name === "Rome");
        assert.ok(p.shownReasons.length > 0);
    }
    assert.ok(sites.stats.rejected.HIDDEN > 0, "hidden plots rejected");
    assert.equal(sites.stats.aiPicks, 1);
    assert.equal(state.get().status.busy, false);
});

test("site search: an independent's village (not a city) keeps sites away: none within 6 of a hostile one", async () => {
    // Seen in game 5: villages are not in player.Cities, so the rule never applied; every site
    // was 4-5 tiles from a village we had seen, and settling there made it hostile.
    const village = { owner: 4, x: 15, y: 11 };
    world.villages = [village];
    try {
        const handle = startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 8, useAI: false });
        await handle.promise;
        const sites = state.get().results.sites;
        const at = fake.grid.index(village.x, village.y);
        assert.ok(sites.picks.length > 0);
        for (const p of sites.picks) assert.ok(fake.grid.distance(p.idx, at) > 6, `pick ${p.x},${p.y} is ${fake.grid.distance(p.idx, at)} from the village`);
        assert.ok(sites.stats.rejected.INDEPENDENT > 0);
    } finally {
        delete world.villages;
    }
});

test("the relaxed search (sites ran out far below the cap): 5-6 tiles from a village allowed, never within 4; its picks say so (research/22 A1)", async () => {
    const village = { owner: 4, x: 15, y: 11 };
    world.villages = [village];
    try {
        await startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 15, useAI: false, relaxedSites: true }).promise;
        const sites = state.get().results.sites;
        const at = fake.grid.index(village.x, village.y);
        const d = sites.picks.map((p) => fake.grid.distance(p.idx, at));
        assert.ok(d.some((x) => x >= 5 && x <= 6), `distances ${JSON.stringify(d)}`);
        assert.ok(d.every((x) => x > 4));
        assert.ok(sites.relaxed && sites.picks.every((p) => p.relaxed));
    } finally {
        delete world.villages;
    }
});

test("the sites line counts only the villages we have seen as seen (research/23: «18 seen, 18 unseen» in game 8)", async () => {
    const village = { owner: 4, x: 15, y: 11 };
    world.villages = [village];
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), revealed: !(x === village.x && y === village.y) });
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        await startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 15, useAI: false, includeHidden: true }).promise;
        const line = lines.find((l) => l.includes("sites:") && l.includes("villages"));
        assert.match(line ?? "", /villages 0 seen, 1 unseen/);
    } finally {
        console.warn = warn;
        world.tiles = tiles;
        delete world.villages;
    }
});

test("include-hidden mode can pick plots beyond the fog", async () => {
    const handle = startSiteSearch({ ...DEFAULT_SETTINGS, radius: 15, topN: 15, includeHidden: true, useAI: false });
    await handle.promise;
    const sites = state.get().results.sites;
    assert.equal(sites.stats.rejected.HIDDEN ?? 0, 0);
});

test("if the game's settle check refuses everything, falls back to own rules", async () => {
    world.claimOk = () => false;
    try {
        const handle = startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 5, useAI: false });
        await handle.promise;
        const sites = state.get().results.sites;
        assert.equal(sites.claimFallback, true);
        assert.ok(sites.picks.length >= 3, `fallback picks: ${sites.picks.length}`);
        for (const p of sites.picks) assert.ok(fake.grid.distance(p.idx, fake.grid.index(CAPITAL.x, CAPITAL.y)) >= 4);
    } finally {
        delete world.claimOk;
    }
});

test("mountains are mountains: not workable, not buildable (Terrains has no Mountain column)", async () => {
    const { FactsCache } = await import("../mod/expansion-planner/ui/data/xpl-map-facts.js");
    const engineMap = getEngineMap();
    const facts = new FactsCache(engineMap, getRules(), { playerId: 0, includeHidden: false });
    const m = facts.facts(engineMap.index(18, 5));
    assert.equal(GameInfo.Terrains.lookup("TERRAIN_MOUNTAIN").Mountain, undefined); // as in the real game data
    assert.equal(m.isMountain, true);
    assert.equal(m.workable, false);
    assert.equal(m.urbanizable, false);
    // The Inca (research/40 C): a trait unlocks an improvement on mountains: workable, never buildable.
    const inca = new FactsCache(engineMap, { ...getRules(), mountainsWorkable: true }, { playerId: 0, includeHidden: false });
    assert.equal(inca.facts(engineMap.index(18, 5)).workable, true);
    assert.equal(inca.facts(engineMap.index(18, 5)).urbanizable, false);
});

test("trait tile rules: an improvement unlocked on mountains makes them workable; a natural-wonder trait values them", async () => {
    const { traitTileRules } = await import("../mod/expansion-planner/ui/data/xpl-rules-loader.js");
    const info = {
        TraitModifiers: [{ TraitType: "TRAIT_INCA", ModifierId: "M_APUS" }, { TraitType: "TRAIT_ISABELLA", ModifierId: "M_NW" }],
        Constructible_ValidTerrains: [{ ConstructibleType: "IMPROVEMENT_INCA_MOUNTAIN", TerrainType: "TERRAIN_MOUNTAIN" }],
        ModifierArguments: [{ ModifierId: "M_APUS", Name: "ConstructibleType", Value: "IMPROVEMENT_INCA_MOUNTAIN" }],
        Modifiers: [{ ModifierId: "M_APUS", ModifierType: "MT_A" }, { ModifierId: "M_NW", ModifierType: "MT_N" }],
        DynamicModifiers: [{ ModifierType: "MT_A", EffectType: "EFFECT_PLAYER_GRANT_CONSTRUCTIBLE_UNLOCK" }, { ModifierType: "MT_N", EffectType: "EFFECT_PLOT_ADJUST_YIELD_PER_PLAYER_NATURAL_WONDER" }],
    };
    assert.deepEqual(traitTileRules(new Set(["TRAIT_INCA"]), info), { mountainsWorkable: true, naturalWonderTrait: false });
    assert.deepEqual(traitTileRules(new Set(["TRAIT_ISABELLA"]), info), { mountainsWorkable: false, naturalWonderTrait: true });
    assert.deepEqual(traitTileRules(new Set(["TRAIT_ROME"]), info), { mountainsWorkable: false, naturalWonderTrait: false });
    const { naturalWondersValued } = await import("../mod/expansion-planner/ui/data/xpl-site-job.js");
    const vm = Game.VictoryManager;
    try {
        // The culture victory off in the setup: valued only for a natural-wonder trait.
        Game.VictoryManager = { isCountdownVictoryEnabled: (t) => !String(GameInfo.Victories.lookup(t)?.VictoryClassType ?? t).includes("CULTURE"), isScoreVictoryEnabled: () => true };
        assert.equal(naturalWondersValued({}), false);
        assert.equal(naturalWondersValued({ naturalWonderTrait: true }), true);
    } finally {
        Game.VictoryManager = vm;
    }
});

test("far below the cap (unseenVillagePenalty) a village never seen costs a site value, not the site (research/24 X3: «18 unseen; INDEPENDENT 171»)", async () => {
    const village = { owner: 4, x: 15, y: 11 };
    world.villages = [village];
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), revealed: !(x === village.x && y === village.y) });
    try {
        const at = fake.grid.index(village.x, village.y);
        await startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 15, useAI: false, includeHidden: true }).promise;
        assert.ok(state.get().results.sites.picks.every((p) => fake.grid.distance(p.idx, at) > 6), "the strict rule");
        await startSiteSearch({ ...DEFAULT_SETTINGS, radius: 10, topN: 15, useAI: false, includeHidden: true, unseenVillagePenalty: true }).promise;
        const sites = state.get().results.sites;
        assert.ok(sites.picks.some((p) => fake.grid.distance(p.idx, at) <= 6), JSON.stringify(sites.picks.map((p) => fake.grid.distance(p.idx, at))));
        assert.ok(!(sites.stats.rejected.INDEPENDENT > 0), JSON.stringify(sites.stats.rejected));
    } finally {
        world.tiles = tiles;
        delete world.villages;
    }
});
