/**
 * How often the autopilot renews the plan's map tacks while it plays unattended (game 60's review, E7). Pure.
 *
 * Every tack request makes Detailed Map Tacks redraw and log ~100 lines per tack on the map (root gotchas 14 and 18). Game
 * 60's Antiquity replaced the plan's tacks after 97 of 140 replans (124 placed, 91 removed: the plan's order moves a little
 * with every recalculation), and UI.log took 33 MB of DMT lines in 30 minutes of Exploration (226 placed, 172 removed). So
 * while the autopilot ends turns, a full renewal (ours the plan drops removed, the new ones added) comes at most every
 * TACK_REFRESH_TURNS turns, or when the player asks (the Buildings tab opened, «Пересчитать»); in between only a settlement
 * none of whose planned buildings has a tack gets its first one (a new city, a queue that moved on), and nothing is removed.
 */

export const TACK_REFRESH_TURNS = 5;

/**
 * "FULL" (renew) or "ADD" (only the missing ones). `unattended`: the autopilot ends turns; `last`: the turn of the last full
 * renewal (-Infinity: none this session); `asked`: the player asked for it since.
 */
export function tackRefreshMode({ unattended = false, turn = 0, last = -Infinity, asked = false } = {}) {
    if (!unattended || asked || !Number.isFinite(last) || turn < last || turn - last >= TACK_REFRESH_TURNS) return "FULL";
    return "ADD";
}

/**
 * The tacks an "ADD" refresh places: for each settlement (`sid`) of the plan's placements (in plan order), its first planned
 * building when none of its planned buildings has a tack (`hasTack(p)`).
 */
export function untackedFirsts(placements, hasTack) {
    const bySid = new Map();
    for (const p of placements ?? []) {
        if (!bySid.has(p.sid)) bySid.set(p.sid, []);
        bySid.get(p.sid).push(p);
    }
    const out = [];
    for (const list of bySid.values()) if (!list.some((p) => hasTack(p))) out.push(list[0]);
    return out;
}
