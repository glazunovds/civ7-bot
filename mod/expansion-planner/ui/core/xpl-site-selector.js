/**
 * Diversity-aware selection of the top-N settlement sites (PLAN.md section 4.7).
 * Lazy greedy: pop the best candidate, re-score it with the already accepted picks
 * counted as PLANNED centres (they claim shared tiles), and accept it only if it is
 * still at least as good as the next candidate. Pure module.
 */
import { MaxHeap } from './xpl-heap.js';
import { scoreSiteRoles } from './xpl-site-roles.js';

/** value desc, production potential desc, overlap asc, distance to own settlement asc, index asc. */
export function compareSites(a, b) {
    if (a.value !== b.value) return a.value - b.value;
    if (a.prodPot !== b.prodPot) return a.prodPot - b.prodPot;
    if (a.overlapTiles !== b.overlapTiles) return b.overlapTiles - a.overlapTiles;
    const da = a.nearestOwnDist ?? 0;
    const db = b.nearestOwnDist ?? 0;
    if (da !== db) return db - da;
    return b.idx - a.idx;
}

/**
 * @param scored   results of scoreSite (rejected ones are ignored)
 * @param ctx      scoring context (see site-scorer.js)
 * @param n        number of picks wanted
 * @param minPickDist  minimum distance between picks (CITY_MIN_RANGE + 1, or more with "spread")
 */
export function selectSites(scored, ctx, n, minPickDist) {
    const heap = new MaxHeap(compareSites, scored.filter((s) => !s.rejected));
    const picks = [];
    const planned = [];
    while (picks.length < n && heap.size > 0) {
        const top = heap.pop();
        if (picks.some((p) => ctx.map.distance(p.idx, top.idx) < minPickDist)) continue;
        // Re-score only if picks were accepted since this item was last scored.
        const upToDate = (top.plannedVersion ?? 0) === planned.length;
        const fresh = upToDate ? top : scoreSiteRoles(top.idx, ctx, planned, ctx.siteRoles);
        if (fresh.rejected) continue;
        fresh.plannedVersion = planned.length;
        fresh.nearestOwnDist = top.nearestOwnDist;
        if (heap.size > 0 && compareSites(fresh, heap.peek()) < 0) {
            heap.push(fresh); // got worse because of earlier picks; let the next one compete
            continue;
        }
        fresh.rank = picks.length + 1;
        picks.push(fresh);
        planned.push({ idx: fresh.idx, kind: fresh.role === "TOWN" ? "PLANNED_TOWN" : "PLANNED", name: "" });
    }
    return picks;
}
