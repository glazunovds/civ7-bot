/**
 * The air wing (research/37 §7, Phase 5). Pure: no engine globals; the hex distance comes in as a function.
 *
 * Aircraft are always packed in an air commander (an Airfield's Aerodrome Commander, a Squadron Commander, a carrier) and
 * move between them by rebasing. A fighter intercepts by itself, within a few tiles of its base, so where it is based is
 * what it covers. Ground attackers strike units; every plane strikes from its base.
 */

export const AIR = Object.freeze({
    RAID_TURNS: 10,    // an enemy air attack on us is remembered this long...
    RAID_RADIUS: 2,    // ...for our settlements this close to where it hit
    REBASE_HOLD: 3,    // a fighter rebased lately stays at least this many turns
    REBASE_RETRY: 5,   // a base the game would not take a plane to is not asked again for it this long
    CAPTURE: 4000,     // a raider next to a damaged centre: striking it may prevent a capture
    ATTACKER: 2000,    // a raider within ATTACKER_RADIUS of one of our settlements attacks it
    ATTACKER_RADIUS: 2,
    COVERED: 500,      // a target an enemy fighter's base covers (an interception) is worth this much less
});

/**
 * A target's worth to our aircraft (research/37 §7D): a raider next to a damaged centre first (a capture to prevent), then
 * one attacking a settlement, then its damage (a kill); a little for being nearer; less under an enemy fighter's cover.
 * Never a bystander before an attacker because its damage counter is larger.
 * @param t { d: distance to our nearest settlement, damage, capture, covered }
 */
export function airTargetScore(t) {
    return (t.capture ? AIR.CAPTURE : 0) + (t.d <= AIR.ATTACKER_RADIUS ? AIR.ATTACKER : 0) + (Number(t.damage) || 0)
        - (t.covered ? AIR.COVERED : 0) - (Number(t.d) || 0);
}

const keyOf = (l) => `${l.x},${l.y}`;

/**
 * Which fighters rebase where (research/37 §7B). Each wanted settlement (`targets`, the most important first: lower rank)
 * that no fighter covers where it is based takes the nearest spare fighter that the game would send to a base covering
 * it with a slot free: a spare is one that may move now and whose base covers no wanted settlement that only it covers.
 * One plane a slot, each slot taken once in the pass; the slot a plane leaves frees only next pass, when the game shows it.
 * @param fighters [{ key, at, range: its base's interception range, movable, offered: Set("x,y") the game's rebase tiles }]
 * @param bases [{ at, free, range }] @param targets [{ x, y, rank }]
 * @returns [{ key, to, target }]
 */
export function planRebases({ fighters, bases, targets, dist }) {
    const pos = new Map(fighters.map((f) => [f.key, { at: f.at, range: f.range }]));
    const covers = (p, t) => dist(p.at, t) <= p.range;
    const coverers = (t) => fighters.filter((f) => covers(pos.get(f.key), t)).length;
    const free = new Map((bases ?? []).map((b) => [keyOf(b.at), Number(b.free) || 0]));
    const sorted = [...(targets ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    const out = [];
    for (const t of sorted) {
        if (coverers(t) > 0) continue;
        let best = null;
        for (const f of fighters) {
            if (!f.movable || out.some((o) => o.key === f.key)) continue;
            const p = pos.get(f.key);
            if (sorted.some((o) => covers(p, o) && coverers(o) === 1)) continue; // the only cover of another settlement
            for (const b of bases ?? []) {
                const k = keyOf(b.at);
                if (!(free.get(k) > 0) || k === keyOf(p.at) || !f.offered?.has(k) || dist(b.at, t) > b.range) continue;
                const d = dist(p.at, b.at);
                if (!best || d < best.d || (d === best.d && k < best.k)) best = { f, b, k, d };
            }
        }
        if (!best) continue;
        free.set(best.k, free.get(best.k) - 1);
        pos.set(best.f.key, { at: best.b.at, range: best.b.range });
        out.push({ key: best.f.key, to: { x: best.b.at.x, y: best.b.at.y }, target: t });
    }
    return out;
}
