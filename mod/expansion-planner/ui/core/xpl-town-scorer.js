/**
 * Town site scoring. Pure module (same ctx as xpl-site-scorer.js, plus ctx.ownCities and
 * ctx.continentOf).
 *
 * What a kept town is for (the game's own text, Civilopedia "Town Focus"):
 *  - it grows by itself ("Growing Town") until population 7, when the Focus unlocks;
 *  - once specialized it stops growing and sends ALL its Food to Connected Cities;
 *    connected = a road directly linking them (merchants build roads within trade range)
 *    or both coastal on the same continent;
 *  - its Production is turned into Gold;
 *  - the Focus adds a bonus: Farming/Fishing +1 Food on farms, pastures, plantations,
 *    fishing boats; Mining +2 Production (= Gold) on camps, woodcutters, clay pits, mines,
 *    quarries; Resort +Happiness/Gold on appealing tiles; ...
 * So a good town site grows fast (food near the centre), has a food surplus to send,
 * is connected to a city it can feed, and has tiles for a strong Focus. It needs less
 * room than a future city (rings 1-2).
 */
import { F, G, H } from './xpl-yields.js';
import { REJECT, availability, displayScore, isCoastal, nearbyCentres, saturate, tierOf } from './xpl-site-scorer.js';

const TOWN_RADIUS = 3;

function reason(sign, key, args = [], weight = 0) {
    return { sign, key, args, weight };
}

/** Best feeding connection from a town site to one of the player's cities. */
export function townConnection(candIdx, ctx, coastal) {
    const T = ctx.tuning.TOWN;
    const cities = ctx.ownCities ?? [];
    if (cities.length === 0) return { factor: T.NO_CITY_FACTOR, dist: null, sea: false, name: "", sameContinent: true };
    const myContinent = ctx.continentOf?.(candIdx) ?? null;
    let best = null;
    for (const c of cities) {
        const dist = ctx.map.distance(candIdx, c.idx);
        const otherContinent = myContinent != null && c.continent != null && c.continent !== myContinent;
        const sea = coastal && c.coastal && !otherContinent;
        let factor = 0;
        if (sea) factor = 1;
        else if (!otherContinent) {
            factor = T.CONNECT_BEYOND;
            for (const [maxDist, f] of T.CONNECT) {
                if (dist <= maxDist) {
                    factor = f;
                    break;
                }
            }
        }
        if (!best || factor > best.factor || (factor === best.factor && dist < best.dist)) {
            best = { factor, dist, sea, name: c.name ?? "", sameContinent: !otherContinent };
        }
    }
    return best;
}

/**
 * Scores one candidate as a town that stays a town. Returns a result shaped like
 * scoreSite's (value, score, tier, yields, reasons, ...) with role "TOWN", or
 * { idx, rejected } when it cannot work as a town.
 */
export function scoreTownSite(candIdx, ctx, extraCentres = []) {
    const t = ctx.tuning;
    const T = t.TOWN;
    const P = ctx.profile;
    const centre = ctx.facts(candIdx);
    const nearby = nearbyCentres(candIdx, ctx, extraCentres);
    const charming = ctx.adjOpts?.charming ?? 3;

    let foodNear = 0, room = 0, ring1Free = 0, unknown = 0, overlap = 0, prodPot = 0;
    let farm = 0, mine = 0, resort = 0, resources = 0, newResources = 0;
    const foodTiles = [];
    const yieldsSum = [0, 0, 0, 0, 0, 0, 0];
    for (const { idx, ring } of ctx.map.radius(candIdx, TOWN_RADIUS)) {
        const f = ctx.facts(idx);
        if (!f) continue;
        if (!f.known) {
            unknown++;
            continue;
        }
        const a = ring === 0 ? 1 : availability(f, nearby, ctx);
        if (ring >= 1 && ring <= 2) {
            if (f.growable) room += a;
            if (ring === 1 && a >= t.RING1_FREE_SHARE && f.growable) ring1Free++;
            if (a < 1 && f.growable) overlap++;
        }
        const works = ring === 0 || f.workable;
        if (!works) continue;
        const food = f.yields[F] ?? 0;
        const w = T.RING_WEIGHT[ring] * a;
        foodTiles.push(w * food);
        if (ring <= 2) {
            foodNear += a * food;
            for (let i = 0; i < 7; i++) yieldsSum[i] += a * (f.yields[i] ?? 0);
            prodPot += a * ((f.yields[1] ?? 0) + (f.prodTile ? t.PROD_TILE_BONUS : 0));
            if (ring >= 1) {
                // Focus candidates: farms/pastures/plantations/fishing boats, production improvements, appealing tiles.
                if (f.terrain === "TERRAIN_COAST" || (!f.prodTile && food >= 2)) farm += a;
                if (f.prodTile) mine += a;
                if ((f.appeal ?? 0) >= charming) resort += a;
                if (f.resource && a > 0) {
                    resources++;
                    if (ctx.ownedResources && !ctx.ownedResources.has(f.resource)) newResources++;
                }
            }
        }
    }
    if (room < T.ROOM_MIN) return { idx: candIdx, role: "TOWN", rejected: { code: REJECT.ROOM, arg: Math.round(room) } };
    if (ring1Free < T.RING1_MIN_FREE) return { idx: candIdx, role: "TOWN", rejected: { code: REJECT.RING1, arg: ring1Free } };

    // Food it can send once specialized: its best WORKED tiles (unexplored ones guessed low).
    foodTiles.sort((x, y) => y - x);
    const guess = (ctx.avgKnownTileValue ?? 0) * t.UNKNOWN_TILE_GUESS * 0.5;
    const worked = foodTiles.slice(0, T.WORKED);
    for (let i = 0; worked.length < T.WORKED && i < unknown; i++) worked.push(guess);
    const feedPot = worked.reduce((s, v) => s + v, 0);

    const coastal = isCoastal(candIdx, ctx);
    const connection = townConnection(candIdx, ctx, coastal);

    const specOptions = [
        { kind: "FARM", value: farm * (P.y[F] ?? 1), count: farm },
        { kind: "MINE", value: mine * 2 * (P.y[G] ?? 1), count: mine },
        { kind: "RESORT", value: resort * ((P.y[H] ?? 1) + (P.y[G] ?? 1)), count: resort },
    ];
    const spec = specOptions.reduce((best, o) => (o.value > best.value ? o : best));

    const comps = {
        growth: saturate(foodNear / T.REF.growth),
        feed: saturate((feedPot * connection.factor * (P.y[F] ?? 1)) / T.REF.feed),
        spec: saturate(spec.value / T.REF.spec),
    };
    let bonus = 0;
    const freshWater = !!centre?.freshWater;
    if (freshWater) bonus += T.FRESH_WATER;
    bonus += newResources * T.NEW_RESOURCE;
    let indPen = 0;
    let nearestIndependent = Infinity;
    for (const ind of ctx.independents ?? []) nearestIndependent = Math.min(nearestIndependent, ctx.map.distance(candIdx, ind));
    if (nearestIndependent <= 3) indPen = t.INDEPENDENT_PENALTY.NEAR;
    else if (nearestIndependent <= 6) indPen = t.INDEPENDENT_PENALTY.MID;
    const aiFactors = ctx.aiPicks?.get(candIdx) ?? null;
    const aiPick = !!aiFactors;
    const wsum = T.W.growth + T.W.feed + T.W.spec;
    const value = (T.W.growth * comps.growth + T.W.feed * comps.feed + T.W.spec * comps.spec) / wsum
        + bonus - indPen / 100 + (aiPick ? t.AI_PICK_BONUS / 100 : 0);
    const score = displayScore(value, t);

    const reasons = [];
    reasons.push(reason("+", "LOC_XPL_RT_FOOD", [Math.round(foodNear)], foodNear / 4));
    if (connection.dist == null) reasons.push(reason("!", "LOC_XPL_RT_NO_CITY", [], 2));
    else if (!connection.sameContinent) reasons.push(reason("-", "LOC_XPL_RT_OTHER_CONTINENT", [connection.name], 6));
    else if (connection.sea) reasons.push(reason("+", "LOC_XPL_RT_FEEDS_SEA", [connection.name, Math.round(feedPot)], feedPot / 3));
    else reasons.push(reason(connection.factor >= 0.8 ? "+" : "-", "LOC_XPL_RT_FEEDS_ROAD", [connection.name, connection.dist, Math.round(feedPot)], feedPot / 3));
    if (spec.count > 0) reasons.push(reason("+", `LOC_XPL_RT_SPEC_${spec.kind}`, [Math.round(spec.count)], spec.value / 2));
    if (freshWater) reasons.push(reason("+", "LOC_XPL_R_FRESH_WATER", [], 2));
    if (newResources > 0) reasons.push(reason("+", "LOC_XPL_R_NEW_RESOURCES", [newResources], newResources * 2));
    if (overlap > 0) reasons.push(reason("-", "LOC_XPL_R_OVERLAP", [overlap], overlap * 0.3));
    if (unknown > 0) reasons.push(reason("!", "LOC_XPL_R_UNEXPLORED", [unknown], unknown * 0.2));
    if (aiPick) reasons.push(reason("+", "LOC_XPL_R_AI_PICK", [], t.AI_PICK_BONUS));

    return {
        idx: candIdx,
        role: "TOWN",
        value: Math.round(value * 1000) / 1000,
        score,
        tier: tierOf(score, t),
        comps,
        prodPot: Math.round(prodPot * 10) / 10,
        food12: Math.round(foodNear * 10) / 10,
        feedPot: Math.round(feedPot * 10) / 10,
        connection,
        spec: { kind: spec.kind, count: Math.round(spec.count * 10) / 10 },
        yields: yieldsSum.map((v) => Math.round(v * 10) / 10),
        roomTiles: Math.round(room * 10) / 10,
        roomPct: Math.round((room / 18) * 100),
        overlapTiles: overlap,
        unknownTiles: unknown > 0 ? unknown : 0,
        freshWater,
        coastal,
        aiPick,
        aiFactors,
        resources,
        nearestIndependent: Number.isFinite(nearestIndependent) ? nearestIndependent : null,
        reasons,
    };
}
