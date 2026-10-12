/**
 * Adjacency rule matching, written from the gameplay schema
 * (Base/Assets/schema/gameplay/01_GameplaySchema.sql, table Adjacency_YieldChanges).
 * Pure module: works on normalised rule objects and plain plot-fact objects.
 *
 * A rule counts the neighbouring tiles (or, for constructible selectors, the
 * matching constructibles on them) that satisfy ALL of its selectors, then yields
 * floor(count / TilesRequired) * YieldChange of YieldType.
 *
 * Plot facts used (see data/map-facts.js): terrain, biome, feature, featureClass,
 * resource, resourceClass, isWater, isLake, isRiver, isNavRiver, isNaturalWonder,
 * district, constructibles[], isQuarter, uniqueQuarterType, owner, appeal, known.
 */
import { yieldIndex } from './xpl-yields.js';

/** Selector columns we can evaluate. A rule using any other Adjacent* column is rejected at load. */
export const SUPPORTED_SELECTORS = new Set([
    "AdjacentBiome", "AdjacentTerrain", "AdjacentFeature", "AdjacentFeatureClass", "AdjacentDistrict",
    "AdjacentResource", "AdjacentResourceClass", "AdjacentSpecificResource", "AdjacentSeaResource",
    "AdjacentRiver", "AdjacentNavigableRiver", "AdjacentLake", "AdjacentNaturalWonder",
    "AdjacentQuarter", "AdjacentUniqueQuarter", "AdjacentUniqueQuarterType", "AdjacentOtherOwner",
    "AdjacentBreathtakingAppeal", "AdjacentCharmingAppeal",
    "AdjacentConstructible", "AdjacentConstructibleClass", "AdjacentConstructibleTag",
]);

/** Selectors that depend on buildings/districts/quarters rather than on terrain. */
export const STRUCTURAL_SELECTORS = new Set([
    "AdjacentDistrict", "AdjacentQuarter", "AdjacentUniqueQuarter", "AdjacentUniqueQuarterType",
    "AdjacentConstructible", "AdjacentConstructibleClass", "AdjacentConstructibleTag", "AdjacentOtherOwner",
]);

const STRING_FIELDS = [
    "AdjacentBiome", "AdjacentTerrain", "AdjacentFeature", "AdjacentFeatureClass", "AdjacentDistrict",
    "AdjacentSpecificResource", "AdjacentUniqueQuarterType", "AdjacentConstructible",
    "AdjacentConstructibleClass", "AdjacentConstructibleTag",
];
const BOOL_FIELDS = [
    "AdjacentResource", "AdjacentSeaResource", "AdjacentRiver", "AdjacentNavigableRiver", "AdjacentLake",
    "AdjacentNaturalWonder", "AdjacentQuarter", "AdjacentUniqueQuarter", "AdjacentOtherOwner",
    "AdjacentBreathtakingAppeal", "AdjacentCharmingAppeal",
];

export function isEnabled(value) {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

/**
 * Converts a raw Adjacency_YieldChanges row (GameInfo or fixture) into a rule object.
 * Returns { rule } or { error } when the row uses something we can't evaluate.
 */
export function normaliseRule(row) {
    for (const key of Object.keys(row)) {
        if (key.startsWith("Adjacent") && !SUPPORTED_SELECTORS.has(key) && row[key] != null && row[key] !== false && row[key] !== 0 && row[key] !== "0" && row[key] !== "false") {
            return { error: `unsupported selector ${key}` };
        }
    }
    if (isEnabled(row.Self)) {
        return { error: "Self rules are not supported" };
    }
    const yi = yieldIndex(row.YieldType);
    if (yi < 0) {
        return { error: `unknown yield ${row.YieldType}` };
    }
    const tilesRequired = Number(row.TilesRequired ?? 1);
    const change = Number(row.YieldChange ?? 0);
    if (!Number.isFinite(tilesRequired) || tilesRequired <= 0 || !Number.isFinite(change)) {
        return { error: "invalid numbers" };
    }
    const sel = {};
    for (const f of STRING_FIELDS) {
        if (row[f]) sel[f] = String(row[f]);
    }
    if (row.AdjacentResourceClass && row.AdjacentResourceClass !== "NO_RESOURCECLASS") {
        sel.AdjacentResourceClass = String(row.AdjacentResourceClass);
    }
    for (const f of BOOL_FIELDS) {
        if (isEnabled(row[f])) sel[f] = true;
    }
    const structural = Object.keys(sel).some((k) => STRUCTURAL_SELECTORS.has(k));
    return {
        rule: {
            id: row.ID,
            yieldType: row.YieldType,
            yieldIndex: yi,
            change,
            tilesRequired,
            age: row.Age ?? null,
            sel,
            structural,
            isWonderRule: sel.AdjacentDistrict === "DISTRICT_WONDER" && Object.keys(sel).length === 1,
        },
    };
}

/**
 * How many times a single neighbouring plot satisfies the rule: 0 or 1 for tile
 * selectors; for constructible selectors, the number of matching constructibles
 * on the plot (an urban tile can hold two buildings).
 * @param opts { playerId, charming, breathtaking, classOf(type), hasTag(type, tag) }
 */
export function matchCount(rule, plot, opts) {
    if (!plot || plot.known === false) return 0;
    const s = rule.sel;
    if (s.AdjacentBiome && s.AdjacentBiome !== plot.biome) return 0;
    if (s.AdjacentTerrain && s.AdjacentTerrain !== plot.terrain) return 0;
    if (s.AdjacentFeature && s.AdjacentFeature !== plot.feature) return 0;
    if (s.AdjacentFeatureClass && s.AdjacentFeatureClass !== plot.featureClass) return 0;
    if (s.AdjacentDistrict && s.AdjacentDistrict !== plot.district) return 0;
    if (s.AdjacentSpecificResource && s.AdjacentSpecificResource !== plot.resource) return 0;
    if (s.AdjacentResourceClass && s.AdjacentResourceClass !== plot.resourceClass) return 0;
    if (s.AdjacentResource && !plot.resource) return 0;
    if (s.AdjacentSeaResource && !(plot.resource && plot.isWater)) return 0;
    if (s.AdjacentRiver && !plot.isRiver) return 0;
    if (s.AdjacentNavigableRiver && !plot.isNavRiver) return 0;
    if (s.AdjacentLake && !plot.isLake) return 0;
    if (s.AdjacentNaturalWonder && !plot.isNaturalWonder) return 0;
    if (s.AdjacentQuarter && !plot.isQuarter) return 0;
    if (s.AdjacentUniqueQuarter && !plot.uniqueQuarterType) return 0;
    if (s.AdjacentUniqueQuarterType && s.AdjacentUniqueQuarterType !== plot.uniqueQuarterType) return 0;
    if (s.AdjacentOtherOwner && !(plot.owner >= 0 && plot.owner !== opts?.playerId)) return 0;
    if (s.AdjacentBreathtakingAppeal && !(plot.appeal >= (opts?.breathtaking ?? Infinity))) return 0;
    if (s.AdjacentCharmingAppeal && !(plot.appeal >= (opts?.charming ?? Infinity) && plot.appeal < (opts?.breathtaking ?? Infinity))) return 0;

    if (s.AdjacentConstructible || s.AdjacentConstructibleClass || s.AdjacentConstructibleTag) {
        let n = 0;
        for (const type of new Set(plot.constructibles ?? [])) {
            if (s.AdjacentConstructible && s.AdjacentConstructible !== type) continue;
            if (s.AdjacentConstructibleClass && opts?.classOf?.(type) !== s.AdjacentConstructibleClass) continue;
            if (s.AdjacentConstructibleTag && !opts?.hasTag?.(type, s.AdjacentConstructibleTag)) continue;
            n++;
        }
        return n;
    }
    return 1;
}

export function ruleAmount(rule, count) {
    return Math.floor(count / rule.tilesRequired) * rule.change;
}

/**
 * Adjacency of one building (its rule list) given the facts of its neighbouring plots.
 * Returns { total, byYield: number[7], parts: [{ id, count, amount, yieldIndex }] }.
 */
export function adjacencyFromNeighbours(rules, neighbourPlots, opts) {
    const byYield = [0, 0, 0, 0, 0, 0, 0];
    const parts = [];
    let total = 0;
    for (const rule of rules) {
        let count = 0;
        for (const plot of neighbourPlots) count += matchCount(rule, plot, opts);
        const amount = ruleAmount(rule, count);
        if (amount !== 0) {
            byYield[rule.yieldIndex] += amount;
            total += amount;
            parts.push({ id: rule.id, count, amount, yieldIndex: rule.yieldIndex });
        }
    }
    return { total, byYield, parts };
}
