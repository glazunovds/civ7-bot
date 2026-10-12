/**
 * Victory focus (pure logic): which legacy path the autopilot steers toward, and which
 * triumphs are close.
 *
 * Each path (culture, science, economic; never military: the autopilot does not attack) is
 * scored by how far along this age's final milestone we are, how far ahead of the best rival
 * we are, the leader's preferred victory (the game's TRAIT_<age>_<path>_VICTORY), and how many
 * close triumphs of that kind there are. A path we already completed this age scores lowest.
 * The focus changes only when another path has been ahead by SWITCH_MARGIN for SWITCH_STREAK
 * checks in a row (or the current one is completed), so it does not flip back and forth.
 * Paths whose victory is switched off in this game are never chosen; the player may also name
 * the target («Цель победы»), which is then followed while its path is known and switched on.
 */

export const FOCUS_CLASSES = ["CULTURE", "SCIENCE", "ECONOMIC"];
// The player's choice of target («Цель победы»): AUTO = the path chosen here.
export const VICTORY_TARGETS = ["AUTO", ...FOCUS_CLASSES];
// The priority profile each focus switches to (core/xpl-profiles.js).
export const PROFILE_FOR_FOCUS = Object.freeze({ CULTURE: "CULTURE", SCIENCE: "SCIENCE", ECONOMIC: "GOLD" });
// The triumph category (TypeTags) of each focus.
export const TRIUMPH_CATEGORY = Object.freeze({ CULTURE: "CULTURAL", SCIENCE: "SCIENTIFIC", ECONOMIC: "ECONOMIC" });

/** Wonders in production at once: one more while the focus is culture (wonders are its path in Antiquity). */
export function wondersAtOnce(base, focus) {
    return (Number(base) || 1) + (focus === "CULTURE" ? 1 : 0);
}

const LEAD_WEIGHT = 0.5;        // being ahead of the best rival (in goals)
const LEANING_BONUS = 0.15;     // the leader's preferred victory
const TRIUMPH_BONUS = 0.05;     // per close triumph of the path's kind...
const TRIUMPH_BONUS_MAX = 0.15; // ...up to this
export const SWITCH_MARGIN = 0.1;
export const SWITCH_STREAK = 3;
export const CLOSE_TRIUMPH = 0.7; // done at least this share: "close"

const fraction = (t) => (t.total > 0 ? t.current / t.total : 0);

/**
 * Triumphs still open to us (not done, not taken first by a rival) at least CLOSE_TRIUMPH done,
 * closest first.
 * @param triumphs [{ type, name, current, total, done, lost, category }]
 */
export function closeTriumphs(triumphs) {
    return (triumphs ?? [])
        .filter((t) => !t.done && !t.lost && t.total > 0 && fraction(t) >= CLOSE_TRIUMPH)
        .sort((a, b) => fraction(b) - fraction(a) || (a.total - a.current) - (b.total - b.current));
}

/**
 * @param standings [{ cls, ours, rival, goal }] (this age's legacy paths)
 * @param leaning the leader's preferred class, or null
 * @param triumphs as for closeTriumphs
 * @param options { disabled: Set of classes whose victory is switched off in this game }
 * @returns [{ cls, score, progress, lead, done, ours, rival, goal }] in FOCUS_CLASSES order (paths we know)
 */
export function scoreFocus(standings, leaning = null, triumphs = [], { disabled = new Set() } = {}) {
    const close = closeTriumphs(triumphs);
    const out = [];
    for (const cls of FOCUS_CLASSES) {
        if (disabled.has(cls)) continue;
        const s = (standings ?? []).find((x) => x.cls === cls);
        if (!s || !(s.goal > 0)) continue;
        const ours = Number(s.ours) || 0;
        const rival = Number(s.rival) || 0;
        const progress = Math.min(1, ours / s.goal);
        const lead = Math.max(-1, Math.min(1, (ours - rival) / s.goal));
        const done = ours >= s.goal;
        const kind = TRIUMPH_CATEGORY[cls];
        const bonus = Math.min(TRIUMPH_BONUS_MAX, TRIUMPH_BONUS * close.filter((t) => t.category === kind).length);
        const score = done ? -1 : progress + LEAD_WEIGHT * lead + (leaning === cls ? LEANING_BONUS : 0) + bonus;
        out.push({ cls, score, progress, lead, done, ours, rival, goal: s.goal });
    }
    return out;
}

/**
 * @param scores from scoreFocus
 * @param previous { cls, candidate, streak } from the last check (or nothing)
 * @param options { target: one of VICTORY_TARGETS (the player's choice; AUTO = choose here) }
 * @returns { cls, candidate, streak, changed } (cls null when no path is known)
 */
export function chooseFocus(scores, previous = {}, { target = "AUTO" } = {}) {
    const none = { cls: previous.cls ?? null, candidate: null, streak: 0, changed: false };
    if (!scores?.length) return none;
    // The player's target, while its path is known (and its victory switched on).
    if (target !== "AUTO" && scores.some((s) => s.cls === target)) return { cls: target, candidate: null, streak: 0, changed: previous.cls !== target };
    const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
    if (!previous.cls) return { cls: best.cls, candidate: null, streak: 0, changed: true };
    if (best.cls === previous.cls) return { cls: previous.cls, candidate: null, streak: 0, changed: false };
    const current = scores.find((s) => s.cls === previous.cls);
    // The current path is unknown now or already completed this age: switch at once.
    if (!current || current.done) return { cls: best.cls, candidate: null, streak: 0, changed: true };
    if (best.score - current.score < SWITCH_MARGIN) return { cls: previous.cls, candidate: null, streak: 0, changed: false };
    const streak = previous.candidate === best.cls ? (previous.streak ?? 0) + 1 : 1;
    if (streak >= SWITCH_STREAK) return { cls: best.cls, candidate: null, streak: 0, changed: true };
    return { cls: previous.cls, candidate: best.cls, streak, changed: false };
}
