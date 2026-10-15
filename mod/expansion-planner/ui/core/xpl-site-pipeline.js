/**
 * Settlement site search pipeline: candidates -> scores -> diverse top-N.
 * Written as a generator so services/scheduler.js can run it a few milliseconds
 * per frame (it yields progress fractions). Pure module: all engine access goes
 * through the injected ctx / input functions.
 *
 * input:
 *   origins:      [idx]   centres of the player's own settlements (search origins)
 *   radius:       number  search radius from any origin
 *   minSpacing:   number  CITY_MIN_RANGE (centres closer than minSpacing+1 are illegal)
 *   minForeignDistance: number  no site closer than this to a FOREIGN centre (0 = no limit)
 *   minPickDist:  number  minimum distance between picks
 *   topN:         number
 *   includeHidden: boolean
 *   isSettleable(idx) -> boolean   engine land-claim check (called last, it is the expensive one)
 *   ctx:          scoring context (see site-scorer.js); ctx.centres must contain all known centres
 */
import { dot } from './xpl-yields.js';
import { angersVillage, REJECT } from './xpl-site-scorer.js';
import { scoreSiteRoles } from './xpl-site-roles.js';
import { selectSites } from './xpl-site-selector.js';

const YIELD_EVERY = 40;

export function* findSites(input) {
    const { ctx } = input;
    const stats = { scanned: 0, candidates: 0, scored: 0, rejected: {} };
    const reject = (code) => {
        stats.rejected[code] = (stats.rejected[code] ?? 0) + 1;
    };
    const rejectedPlots = [];

    // 1. Scan area (union of radius around each origin).
    const area = new Set();
    for (const origin of input.origins) {
        for (const { idx } of ctx.map.radius(origin, input.radius)) area.add(idx);
    }

    // Average known tile value (for unexplored-tile guesses).
    let valueSum = 0, valueCount = 0;
    for (const idx of area) {
        const f = ctx.facts(idx);
        if (f && f.known && f.workable) {
            valueSum += dot(ctx.profile.y, f.yields);
            valueCount++;
        }
    }
    ctx.avgKnownTileValue = valueCount > 0 ? valueSum / valueCount : 0;
    yield 0.05;

    // 2. Candidates (cheap filters first, engine claim check last).
    const candidates = [];
    let n = 0;
    for (const idx of area) {
        stats.scanned++;
        const f = ctx.facts(idx);
        if (++n % YIELD_EVERY === 0) yield 0.05 + 0.35 * (n / area.size);
        if (!f) continue;
        if (!f.known && !input.includeHidden) { reject(REJECT.HIDDEN); continue; }
        if (f.isWater || f.isNavRiver || f.isMountain || f.isNaturalWonder) { reject(REJECT.TERRAIN); continue; }
        if (f.owner !== -1) { reject(REJECT.OWNED); continue; }
        let nearest = Infinity;
        let nearestOwn = Infinity;
        let nearestForeign = Infinity;
        for (const c of ctx.centres) {
            const d = ctx.map.distance(idx, c.idx);
            if (d < nearest) nearest = d;
            if (c.kind === "OWN" && d < nearestOwn) nearestOwn = d;
            if (c.kind === "FOREIGN" && d < nearestForeign) nearestForeign = d;
        }
        if (nearest <= input.minSpacing) { reject(REJECT.SPACING); rejectedPlots.push({ idx, code: REJECT.SPACING }); continue; }
        if (nearestForeign < (input.minForeignDistance ?? 0)) { reject(REJECT.FOREIGN); rejectedPlots.push({ idx, code: REJECT.FOREIGN }); continue; }
        if ((ctx.villages ?? []).some((v) => angersVillage(ctx.map.distance(idx, v.idx), v.friendly, ctx.tuning))) { reject(REJECT.INDEPENDENT); rejectedPlots.push({ idx, code: REJECT.INDEPENDENT }); continue; }
        if (!input.isSettleable(idx)) { reject(REJECT.CLAIM); rejectedPlots.push({ idx, code: REJECT.CLAIM }); continue; }
        candidates.push({ idx, nearestOwnDist: nearestOwn });
    }
    stats.candidates = candidates.length;

    // 3. Score.
    const scored = [];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const result = scoreSiteRoles(c.idx, ctx, [], ctx.siteRoles); // city, town, or the better of both
        result.nearestOwnDist = c.nearestOwnDist;
        if (result.rejected) {
            reject(result.rejected.code);
            rejectedPlots.push({ idx: c.idx, code: result.rejected.code });
        } else {
            scored.push(result);
        }
        if (i % 10 === 9) yield 0.4 + 0.5 * (i / candidates.length);
    }
    stats.scored = scored.length;

    // 4. Select.
    const picks = selectSites(scored, ctx, input.topN, input.minPickDist);
    yield 1;
    return { picks, scored, rejectedPlots, stats };
}

/** Runs a generator to completion synchronously (tests and small jobs). */
export function runToEnd(gen) {
    let step = gen.next();
    while (!step.done) step = gen.next();
    return step.value;
}
