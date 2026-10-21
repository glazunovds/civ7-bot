/**
 * Legacy beyond the victory focus (research/40 B2; games 42-43). Pure module.
 *
 * Legacy paths add nothing in this game version: `player.LegacyPaths.getScore` read 0 for every path in every age of games
 * 42 and 43 while triumphs came (Player_Legacies.csv), and every age lasted 70 turns at one age point a turn, so no path
 * milestone moved the clock. The game's rewards are the triumphs (GameInfo.Legacies, `player.Legacies.getProgress`):
 * Exploration's «We Have Habsburgs at Home» (16 Homeland settlements, the old ones counting) gives +2 settlement cap in
 * Modern. Game 41 ended Exploration at 12 of 16, one settler at a time.
 */

export const HOMELAND_TRIUMPH = 16;
// A settler bought or saved for with this many turns or fewer left in the age founds after it ends (game 43: two bought at E69
// toward the Homeland triumph, neither founded).
export const MILESTONE_LATE_TURNS = 5;
export const SUMMARY_TRIUMPHS = 4; // triumphs the legacy summary shows

/**
 * Settlers toward the Homeland triumph (B2): in Exploration while below 16 Homeland settlements and the cap, and not in the
 * age's last MILESTONE_LATE_TURNS turns (`turnsLeft`: null = no end near). @returns { need, why, next } or null
 */
export function settlementMilestone({ age, settlements, homeland, cap, turnsLeft = null }) {
    const room = (Number(cap) || 0) - (Number(settlements) || 0);
    if (!(room > 0) || age !== "AGE_EXPLORATION") return null;
    if (turnsLeft !== null && Number(turnsLeft) <= MILESTONE_LATE_TURNS) return null;
    const h = Number(homeland) || 0;
    if (h >= HOMELAND_TRIUMPH) return null;
    return { need: Math.min(room, HOMELAND_TRIUMPH - h), why: "HOMELAND", next: HOMELAND_TRIUMPH };
}

/**
 * The triumphs still open to us with some progress (not done, not taken first by a rival), the closest to done first.
 * @param triumphs [{ type, name, current, total, done, lost }] (data/xpl-victory.js triumphs) @returns at most `n`
 */
export function triumphsUnderWay(triumphs, n = SUMMARY_TRIUMPHS) {
    const share = (t) => (t.total > 0 ? t.current / t.total : 0);
    return (triumphs ?? [])
        .filter((t) => !t.done && !t.lost && t.total > 0 && t.current > 0)
        .sort((a, b) => share(b) - share(a) || (a.total - a.current) - (b.total - b.current))
        .slice(0, n);
}

/** UI.log's part: the triumphs done this age and those under way ("3 done; LEGACY_EX_X 12/16, …"). */
export function triumphLine(triumphs) {
    const done = (triumphs ?? []).filter((t) => t.done).length;
    const open = triumphsUnderWay(triumphs).map((t) => `${t.type} ${t.current}/${t.total}`);
    return `${done} done${open.length ? `; ${open.join(", ")}` : ""}`;
}
