/**
 * Settlement site scoring (PLAN.md sections 4.2-4.6). Pure module.
 *
 * A site is a town founded now that should grow into a productive city with a
 * radius-3 footprint (36 tiles + centre). Each ring tile contributes its yields,
 * weighted by the player's priority profile, by ring, and by how much of the tile
 * this site can expect to own ("availability": shared with neighbouring centres).
 *
 * ctx (built by data/site-context.js, or by test fakes):
 *   map:       { radius(idx, r) -> [{idx, ring}], neighbours(idx) -> idx[], distance(a, b) }
 *   facts(idx) -> TileFacts | null
 *   profile:   { key, y: number[7], w: { tiles, adj, prod } }
 *   tuning:    TUNING
 *   overlapTol: "LOW" | "MEDIUM" | "HIGH"
 *   centres:   [{ idx, kind: "OWN"|"FOREIGN"|"PLANNED", name }] known settlement centres
 *   independents: [idx]  independent-people village centres
 *   adjFamilies: [{ key, yieldIndex, buildings: [{ type, rules }] }]  terrain-only rules
 *   adjOpts:   { playerId, charming, breathtaking }
 *   avgKnownTileValue: number
 *   aiPicks:   Map<idx, factors[]>
 *   ownedResources: Set<ResourceType>
 */
import { dot, F, P as PROD, H } from './xpl-yields.js';
import { adjacencyFromNeighbours } from './xpl-adjacency-rules.js';

export const REJECT = Object.freeze({
    HIDDEN: "HIDDEN",
    TERRAIN: "TERRAIN",
    OWNED: "OWNED",
    SPACING: "SPACING",
    FOREIGN: "FOREIGN", // closer than TUNING.FOREIGN_MIN_DISTANCE to another player's settlement
    CLAIM: "CLAIM",
    ROOM: "ROOM",
    RING1: "RING1",
});

const FOOTPRINT_RADIUS = 3;
const CENTRE_SEARCH_RADIUS = 6; // a centre further than this cannot touch any ring tile

function reason(sign, key, args = [], weight = 0) {
    return { sign, key, args, weight };
}

/** Centres (from ctx.centres + extra planned ones) that can influence this candidate's footprint. */
export function nearbyCentres(candIdx, ctx, extraCentres = []) {
    const out = [];
    for (const list of [ctx.centres, extraCentres]) {
        for (const c of list) {
            if (c.idx === candIdx) continue;
            const d = ctx.map.distance(candIdx, c.idx);
            if (d <= CENTRE_SEARCH_RADIUS) out.push({ ...c, dCand: d });
        }
    }
    return out;
}

/** Centre is next to a known coast or lake tile (lakes are TERRAIN_COAST). */
export function isCoastal(idx, ctx) {
    for (const n of ctx.map.neighbours(idx)) {
        const f = ctx.facts(n);
        if (f && f.known && f.terrain === "TERRAIN_COAST") return true;
    }
    return false;
}

function isOwned(f) {
    return f.owner !== -1 && f.owner !== undefined && f.owner !== null;
}

/** Owned by another civilization (or independent people), not by us. */
export function isForeignOwned(f, ctx) {
    return !!f && isOwned(f) && f.owner !== (ctx.adjOpts?.playerId ?? 0);
}

/** A free tile touching another civilization's territory. */
export function touchesForeignBorder(f, ctx) {
    for (const n of ctx.map.neighbours(f.idx)) {
        if (isForeignOwned(ctx.facts(n), ctx)) return true;
    }
    return false;
}

/** 0..1: how much of tile f a site can expect to own, given nearby settlement centres and borders. */
export function availability(f, nearby, ctx) {
    if (isOwned(f)) return 0;
    let a = 1;
    if (touchesForeignBorder(f, ctx)) a = ctx.tuning.FOREIGN_BORDER_SHARE ?? 0.5;
    for (const c of nearby) {
        const d = ctx.map.distance(f.idx, c.idx);
        if (d <= FOOTPRINT_RADIUS) {
            const share = ctx.tuning.SHARE[c.kind] ?? ctx.tuning.SHARE.OWN;
            a = Math.min(a, share[d]);
        }
    }
    return a;
}

function resourceBonus(f, ctx) {
    if (!f.resource) return 0;
    const t = ctx.tuning;
    let bonus = t.RESOURCE_BONUS;
    if (ctx.ownedResources && !ctx.ownedResources.has(f.resource)) bonus += t.NEW_RESOURCE_BONUS;
    if (f.resourceClass === "RESOURCECLASS_EMPIRE") bonus += t.LUXURY_BONUS;
    return bonus;
}

/** Future adjacency potential: best urbanisable tiles in rings 1-2 for each building family. */
export function adjacencyPotential(ringTiles, ctx) {
    const byFamily = {};
    let total = 0;
    const core = ringTiles.filter(({ idx, ring }) => {
        if (ring < 1 || ring > 2) return false;
        const f = ctx.facts(idx);
        return f && f.known && f.urbanizable;
    });
    for (const fam of ctx.adjFamilies ?? []) {
        const values = [];
        for (const { idx } of core) {
            const neighbours = ctx.map.neighbours(idx).map((n) => ctx.facts(n)).filter(Boolean);
            let best = 0;
            for (const building of fam.buildings) {
                const adj = adjacencyFromNeighbours(building.rules, neighbours, ctx.adjOpts);
                if (adj.total > best) best = adj.total;
            }
            values.push(best);
        }
        values.sort((a, b) => b - a);
        const k = ctx.tuning.ADJ_TOP_K;
        const top = values.slice(0, k);
        const sum = top.reduce((a, b) => a + b, 0);
        byFamily[fam.key] = { sum, top, yieldIndex: fam.yieldIndex };
        total += (ctx.profile.y[fam.yieldIndex] ?? 1) * sum * ctx.tuning.ADJ_MULT_CITY / k;
    }
    return { byFamily, total };
}

/**
 * 0-100 display score. A "reference good" site (value 1.0) shows SCORE_BASE; each
 * 0.1 of value is SCORE_SLOPE/10 points. Calibrated on a real Antiquity map, where
 * site values spread about 0.98 (p10) .. 1.13 (median) .. 1.31 (best).
 */
export function displayScore(value, tuning) {
    return Math.max(0, Math.min(100, Math.round(tuning.SCORE_BASE + (value - 1) * tuning.SCORE_SLOPE)));
}

export function tierOf(score, tuning) {
    if (score >= tuning.TIERS.EXCELLENT) return "EXCELLENT";
    if (score >= tuning.TIERS.GOOD) return "GOOD";
    if (score >= tuning.TIERS.FAIR) return "FAIR";
    return "POOR";
}

/**
 * Scores one candidate centre. Returns either a full result or
 * { idx, rejected: { code, arg } } when the site fails a hard gate.
 */
export function scoreSite(candIdx, ctx, extraCentres = []) {
    const t = ctx.tuning;
    const P = ctx.profile;
    const centre = ctx.facts(candIdx);
    const nearby = nearbyCentres(candIdx, ctx, extraCentres);
    const ringTiles = ctx.map.radius(candIdx, FOOTPRINT_RADIUS);

    let tileVal = 0, food12 = 0, prodPot = 0, room = 0, ring1Free = 0;
    let unknown = 0, overlap = 0, prodTiles = 0, prodResources = 0, resources = 0, newResources = 0;
    const foreignOwned = [];
    let foreignBorder = 0;
    const yieldsSum = [0, 0, 0, 0, 0, 0, 0];

    for (const { idx, ring } of ringTiles) {
        const f = ctx.facts(idx);
        if (!f) continue;
        if (!f.known) {
            unknown++;
            continue;
        }
        const a = ring === 0 ? 1 : availability(f, nearby, ctx);
        if (ring >= 1) {
            if (f.growable) room += a;
            if (isForeignOwned(f, ctx)) foreignOwned.push(idx);
            else if (!isOwned(f) && touchesForeignBorder(f, ctx)) foreignBorder++;
            else if (a < 1 && f.growable) overlap++;
            if (ring === 1 && a >= t.RING1_FREE_SHARE && f.growable) ring1Free++;
        }
        const counts = ring === 0 || f.workable;
        if (counts) {
            const v = dot(P.y, f.yields) + resourceBonus(f, ctx);
            tileVal += t.RING_WEIGHT[ring] * a * v;
            for (let i = 0; i < 7; i++) yieldsSum[i] += t.RING_WEIGHT[ring] * a * (f.yields[i] ?? 0);
            if (ring <= 2) food12 += a * (f.yields[F] ?? 0);
            prodPot += t.RING_WEIGHT[ring] * a * ((f.yields[PROD] ?? 0) + (f.prodTile ? t.PROD_TILE_BONUS : 0));
        }
        if (a > 0) {
            if (f.prodTile) prodTiles++;
            if (f.prodResource) prodResources++;
            if (f.resource) {
                resources++;
                if (ctx.ownedResources && !ctx.ownedResources.has(f.resource)) newResources++;
            }
        }
    }

    if (room < t.ROOM_HARD_MIN[ctx.overlapTol ?? "MEDIUM"]) {
        return { idx: candIdx, rejected: { code: REJECT.ROOM, arg: Math.round(room) } };
    }
    if (ring1Free < t.RING1_MIN_FREE) {
        return { idx: candIdx, rejected: { code: REJECT.RING1, arg: ring1Free } };
    }

    const reasons = [];
    tileVal += unknown * t.UNKNOWN_TILE_GUESS * (ctx.avgKnownTileValue ?? 0);

    let bonus = 0;
    const freshWater = !!centre?.freshWater;
    const coastal = isCoastal(candIdx, ctx);
    if (freshWater) {
        const w = t.FRESH_WATER * (P.y[H] ?? 1);
        bonus += w;
        reasons.push(reason("+", "LOC_XPL_R_FRESH_WATER", [], w));
    }
    if (coastal) {
        bonus += t.COASTAL;
        reasons.push(reason("+", "LOC_XPL_R_COASTAL", [], t.COASTAL));
    }

    const adj = adjacencyPotential(ringTiles, ctx);
    const prodFam = adj.byFamily.PRODUCTION?.sum ?? 0;
    prodPot += t.ADJ_TO_PROD * prodFam;

    let pen = 0;
    if (food12 < t.FOOD_GATE) {
        const w = (t.FOOD_GATE - food12) * (P.y[F] ?? 1);
        pen += w;
        reasons.push(reason("-", "LOC_XPL_R_LOW_FOOD", [Math.round(food12), t.FOOD_GATE], w));
    }

    let indPen = 0;
    let nearestIndependent = Infinity;
    for (const ind of ctx.independents ?? []) {
        nearestIndependent = Math.min(nearestIndependent, ctx.map.distance(candIdx, ind));
    }
    if (nearestIndependent <= 3) indPen = t.INDEPENDENT_PENALTY.NEAR;
    else if (nearestIndependent <= 6) indPen = t.INDEPENDENT_PENALTY.MID;
    if (indPen > 0) {
        reasons.push(reason("-", nearestIndependent <= 3 ? "LOC_XPL_R_NEAR_INDEPENDENT_HOSTILE" : "LOC_XPL_R_NEAR_INDEPENDENT", [nearestIndependent], indPen * 2));
    }

    // Tiles stay linear (the main term); adjacency and production potential saturate
    // at 2x their reference so one extreme dimension cannot override the profile.
    const ref = t.SCORE_REF;
    const comps = {
        tiles: tileVal / ref.tiles,
        adj: saturate(adj.total / ref.adj),
        prod: saturate(prodPot / ref.prod),
        bonus: bonus / ref.tiles,
        pen: pen / ref.tiles,
    };
    const wsum = P.w.tiles + P.w.adj + P.w.prod;
    const raw = (P.w.tiles * comps.tiles + P.w.adj * comps.adj + P.w.prod * comps.prod) / wsum + comps.bonus - comps.pen;
    const aiFactors = ctx.aiPicks?.get(candIdx) ?? null;
    const aiPick = !!aiFactors;
    // value: unbounded ranking key (1.0 = "reference good" site). score: 0-100 for display.
    const value = raw - indPen / 100 + (aiPick ? t.AI_PICK_BONUS / 100 : 0);
    const score = displayScore(value, t);

    // Explanations (sorted later by weight). The land summary is always present.
    reasons.push(reason("+", "LOC_XPL_R_LAND", [Math.round(yieldsSum[F]), Math.round(yieldsSum[PROD])], tileVal / 20));
    if (prodTiles > 0) reasons.push(reason("+", "LOC_XPL_R_PROD_TILES", [prodTiles], prodTiles * 0.6));
    if (resources > 0) reasons.push(reason("+", "LOC_XPL_R_RESOURCES", [resources], resources * t.RESOURCE_BONUS * 2));
    if (newResources > 0) reasons.push(reason("+", "LOC_XPL_R_NEW_RESOURCES", [newResources], newResources * t.NEW_RESOURCE_BONUS * 2));
    const topFamily = bestFamily(adj, P);
    if (topFamily && topFamily.sum > 0) {
        reasons.push(reason("+", "LOC_XPL_R_ADJ_FAMILY", [`LOC_XPL_FAMILY_${topFamily.key}`, topFamily.top.join(", ")], topFamily.sum));
    }
    if (foreignOwned.length > 0) reasons.push(reason("-", "LOC_XPL_R_FOREIGN_OWNED", [foreignOwned.length], foreignOwned.length * 1.0));
    if (foreignBorder > 0) reasons.push(reason("-", "LOC_XPL_R_FOREIGN_BORDER", [foreignBorder], foreignBorder * 0.5));
    if (overlap > 0) reasons.push(reason("-", "LOC_XPL_R_OVERLAP", [overlap], overlap * 0.5));
    if (unknown > 0) reasons.push(reason("!", "LOC_XPL_R_UNEXPLORED", [unknown], unknown * 0.4));
    if (aiPick) reasons.push(reason("+", "LOC_XPL_R_AI_PICK", [], t.AI_PICK_BONUS));

    return {
        idx: candIdx,
        value: Math.round(value * 1000) / 1000,
        score,
        tier: tierOf(score, t),
        comps,
        prodPot: round1(prodPot),
        food12: round1(food12),
        yields: yieldsSum.map(round1),
        roomTiles: round1(room),
        roomPct: Math.round((room / 36) * 100),
        overlapTiles: overlap,
        foreignOwned,
        foreignBorderTiles: foreignBorder,
        unknownTiles: unknown,
        freshWater,
        coastal,
        aiPick,
        aiFactors,
        nearestIndependent: Number.isFinite(nearestIndependent) ? nearestIndependent : null,
        adjacency: adj.byFamily,
        drongoScore: Math.min(99, 3 * prodTiles + 5 * prodResources),
        reasons,
    };
}

/** The adjacency family that matters most for this profile (profile-weighted sum). */
function bestFamily(adj, profile) {
    let best = null;
    let bestWeighted = -Infinity;
    for (const [key, v] of Object.entries(adj.byFamily)) {
        const weighted = v.sum * (profile.y[v.yieldIndex] ?? 1);
        if (weighted > bestWeighted) {
            bestWeighted = weighted;
            best = { key, ...v };
        }
    }
    return best;
}

/** Diminishing returns: saturate(1) = 1, approaches 2 for large c. */
export function saturate(c) {
    return c <= 0 ? 0 : (2 * c) / (1 + c);
}

function round1(v) {
    return Math.round(v * 10) / 10;
}

/** Top reasons for display: up to 3 positives and 2 negatives/warnings, by weight. */
export function topReasons(reasons, maxPos = 3, maxNeg = 2) {
    const pos = reasons.filter((r) => r.sign === "+").sort((a, b) => b.weight - a.weight).slice(0, maxPos);
    const neg = reasons.filter((r) => r.sign !== "+").sort((a, b) => b.weight - a.weight).slice(0, maxNeg);
    return [...pos, ...neg];
}
