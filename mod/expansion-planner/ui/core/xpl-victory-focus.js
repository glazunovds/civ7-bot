/**
 * Victory focus (pure logic): which legacy path the autopilot steers toward, and which
 * triumphs are close.
 *
 * Each path (culture, science, economic; never military: the autopilot does not attack) is
 * scored by how far along this age's final milestone we are, how far ahead of the best rival
 * we are, the leader's preferred victory (the game's TRAIT_<age>_<path>_VICTORY), and how many
 * close triumphs of that kind there are. A path we already completed this age scores lowest,
 * except in the final age: there the victory itself goes on past the path (science: 100
 * Innovation, mostly from Crewed Space Flight Preparation after the 3 space projects; economy:
 * the GDP race), so a completed path keeps its score and the focus stays on it.
 * The focus changes only when another path has been ahead by SWITCH_MARGIN for SWITCH_STREAK
 * checks in a row (or the current one is completed, before the final age), so it does not flip
 * back and forth.
 * Paths whose victory is switched off in this game are never chosen; the player may also name
 * the target («Цель победы»), which is then followed while its path is known and switched on.
 */

export const FOCUS_CLASSES = ["CULTURE", "SCIENCE", "ECONOMIC"];

// ---- the victory watch (research/21 §3.4, M4) ----------------------------------------------
//
// A culture, economic or military victory needs a multiple of the second place's score (root CLAUDE.md
// gotcha 32): the game's own dominance goal, ⌊multiple × second⌋, ≤ 0 until Exploration 50%. A rival
// near it is blocked by holding second place (or more) high enough: with `need` points the leader
// stands at no more than 1 / BLOCK_MARGIN of its goal.
export const BLOCK_MARGIN = 1.15;
export const WATCH_SHARE = 0.6;
export const DANGER_SHARE = 0.85;
const DOMINATION = "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION";

/** The official multiple of the second place's score by age progress (a fallback: the game's goal comes first). null: no race yet. */
export function dominanceMultiple(age, ageFrac) {
    const f = Number(ageFrac) || 0;
    if (age === "AGE_EXPLORATION") return f < 0.5 ? null : f < 0.8 ? 6 : 4;
    if (age === "AGE_MODERN") return f < 0.2 ? 4 : f < 0.4 ? 3 : f < 0.6 ? 2 : f < 0.8 ? 1.5 : 1.25;
    return null;
}

/**
 * Rivals close to a dominance victory (culture, economic, military) that is switched on (decision 6:
 * a victory off in this game is never watched). Per race whose leader is not us: the goal G (the
 * game's; ≤ 0: second × the table's multiple, none before Exploration 50%), share = leader ÷ G,
 * multiple = G ÷ second, need = ⌈leader × BLOCK_MARGIN ÷ multiple⌉ (the score we must hold as second),
 * level DANGER (share ≥ DANGER_SHARE or the leader's countdown runs) or WATCH (share ≥ WATCH_SHARE).
 * In the final age the next step's lower multiple counts too (`step`, `stepGoal`): a leader that step would put nearer
 * its goal takes that step's level now, and the block it takes is judged at that step (game 31: Augustus's culture, 220 against
 * a goal of 284 at ×2, began its countdown when ×1.5 came at Modern's 60%, and won five turns later).
 * @param races victoryRaces() @param me our player id
 * @returns [{ cls, leader, points, goal, share, multiple, ours, need, level, countdown, step, stepGoal }]
 */
export function victoryWatch(races, me, { age = null, ageFrac = 0, military = null } = {}) {
    const out = [];
    for (const r of races ?? []) {
        if (r.enabled === false) continue;
        // Science: a fixed score (fixedWatch). Before, only dominance races were watched: a rival two turns from winning
        // the science victory gave no entry.
        if (r.scoring === FIXED_SCORE) {
            out.push(...fixedWatch(r, me));
            continue;
        }
        if (r.scoring !== DOMINATION) continue;
        const board = r.board ?? [];
        // The final age: settlements we may still found can start our own military countdown (militaryOutlook).
        const lever = r.cls === "MILITARY" && military ? militaryOutlook(r, me, { age, ageFrac, ...military }) : null;
        const own = lever?.reachable && lever.need > 0 ? leverEntry(lever) : ownChance(r, board, me, { age, ageFrac });
        if (own) out.push(own);
        const leader = board[0];
        if (!leader || leader.id === me || !(leader.points > 0)) continue;
        const second = Number(board[1]?.points) || 0;
        const ours = Number(board.find((b) => b.id === me)?.points) || 0;
        let goal = Number(r.goal) || 0;
        let multiple = null;
        if (goal > 0) multiple = second > 0 ? goal / second : dominanceMultiple(age, ageFrac);
        else {
            multiple = dominanceMultiple(age, ageFrac);
            goal = multiple && second > 0 ? Math.floor(second * multiple) : 0;
        }
        if (!(goal > 0) || !(multiple > 0)) {
            out.push({ cls: r.cls, leader: leader.id, points: leader.points, goal: null, share: null, multiple: null, ours, need: null, level: null, countdown: leader.dominant ? leader.turns : null });
            continue;
        }
        const share = leader.points / goal;
        // The next step's goal (the final age): the leader's share of it, when that is what puts it near its goal.
        const next = nextDominanceMultiple(age, ageFrac);
        const stepGoal = next && next < multiple && second > 0 ? Math.floor(second * next) : 0;
        const stepShare = stepGoal > 0 ? leader.points / stepGoal : 0;
        // Only when the step raises its level: a leader near the current goal is blocked now, at the current multiple.
        const rank = (x) => (x >= DANGER_SHARE ? 2 : x >= WATCH_SHARE ? 1 : 0);
        const atStep = !leader.dominant && rank(stepShare) > rank(share);
        const top = atStep ? stepShare : share;
        const level = leader.dominant || top >= DANGER_SHARE ? "DANGER" : top >= WATCH_SHARE ? "WATCH" : null;
        const need = Math.ceil((leader.points * BLOCK_MARGIN) / (atStep ? next : multiple));
        out.push({
            cls: r.cls, leader: leader.id, points: leader.points, goal, share: Math.round(share * 100) / 100,
            multiple: Math.round(multiple * 100) / 100, ours, need,
            step: atStep ? next : null, stepGoal: atStep ? stepGoal : null,
            // Military points are settlements, 4 each: the settlements that would hold `need` (research/31 §3: game 25 was
            // second, so its own settlements set Ashoka's goal; two more by M67 would have stopped his countdown).
            ...(r.cls === "MILITARY" ? { block: Math.ceil(Math.max(0, need - ours) / SETTLEMENT_MILITARY_POINTS) } : {}),
            level, countdown: leader.dominant ? leader.turns : null,
        });
    }
    return out;
}
// Our own countdown is within reach at this share of its goal (research/24 F2: at the final age's end every
// turn in a countdown is 1000 score, more than a whole game's score).
export const CHANCE_SHARE = 0.85;
const FIXED_SCORE = "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE";

/**
 * A fixed-score race (science: 100 Innovation and an undamaged Launch Pad, then its countdown). Nobody's score holds it
 * back, so there is no `need` and no multiple: the rival nearest to winning is watched (the first whose countdown ends,
 * else the most points), level DANGER (its countdown runs, or DANGER_SHARE of the goal) or WATCH (WATCH_SHARE), with
 * `countdown` its turns left and `fixed`; and our own CHANCE at CHANCE_SHARE. Its countdown is the game's end
 * (data/xpl-victory.js rivalWinTurns, ageOutlook).
 */
function fixedWatch(r, me) {
    const goal = Number(r.goal) || 0;
    if (!(goal > 0)) return [];
    const out = [];
    const board = r.board ?? [];
    const round = (x) => Math.round(x * 100) / 100;
    const ours = Number(board.find((b) => b.id === me)?.points) || 0;
    if (ours / goal >= CHANCE_SHARE) out.push({ cls: r.cls, own: true, fixed: true, ours, goal, share: round(ours / goal), need: Math.max(0, goal - ours), level: "CHANCE", multiple: null });
    const rivals = board.filter((b) => b.id !== me && Number(b.points) > 0);
    const counting = rivals.filter((b) => b.dominant).sort((a, b) => (a.turns ?? Infinity) - (b.turns ?? Infinity));
    const leader = counting[0] ?? [...rivals].sort((a, b) => b.points - a.points)[0];
    if (!leader) return out;
    const share = leader.points / goal;
    const level = leader.dominant || share >= DANGER_SHARE ? "DANGER" : share >= WATCH_SHARE ? "WATCH" : null;
    out.push({ cls: r.cls, leader: leader.id, points: leader.points, goal, share: round(share), multiple: null, ours, need: null, level, countdown: leader.dominant ? leader.turns : null, fixed: true });
    return out;
}

/**
 * Our own chance at a dominance countdown in this race: our goal is the multiple × the best of the others
 * (we would lead, they would be second). @returns a watch entry { cls, own: true, ours, goal, share, need,
 * level: "CHANCE" } or null
 */
function ownChance(r, board, me, { age, ageFrac }) {
    const ours = Number(board.find((b) => b.id === me)?.points) || 0;
    const others = board.filter((b) => b.id !== me);
    const top = Number(others[0]?.points) || 0;
    if (!(ours > 0) || !(top > 0)) return null;
    const second = Number(board[1]?.points) || 0;
    const multiple = Number(r.goal) > 0 && second > 0 ? Number(r.goal) / second : dominanceMultiple(age, ageFrac);
    if (!(multiple > 0)) return null;
    const goal = Math.floor(top * multiple);
    const share = goal > 0 ? ours / goal : 0;
    if (share < CHANCE_SHARE) return null;
    return { cls: r.cls, own: true, ours, goal, share: Math.round(share * 100) / 100, need: Math.max(0, goal - ours), level: "CHANCE", multiple: Math.round(multiple * 100) / 100 };
}

// Military points (victories.xml VICTORY_TRACKER_SETTLEMENT): 4 a settlement we own (+1 conquered, +1 in the
// Distant Lands, +2 with our ideology: not counted); Operation Ivy's triumph (MOD_LEGACY_MO_SCIENTIFIC_3) gives 25.
export const SETTLEMENT_MILITARY_POINTS = 4;
export const IVY_MILITARY_POINTS = 25;
// Where the final age's multiple steps down (dominanceMultiple's table).
const MODERN_STEPS = [0.2, 0.4, 0.6, 0.8];

/** The multiple the final age's next step brings, or null (not the final age, or no step left). */
export function nextDominanceMultiple(age, ageFrac) {
    if (age !== "AGE_MODERN") return null;
    const next = MODERN_STEPS.find((s) => s > (Number(ageFrac) || 0));
    return next === undefined ? null : dominanceMultiple(age, next);
}

/**
 * Settlements that would start our own military countdown (research/26 §3.3: game 11 ended 55 to the leader's 60;
 * five more settlements would have made us first with the 75 the goal then asks). We would lead, so our goal is
 * ⌊multiple × the best other⌋; at the current multiple when the settlements it takes are within reach, else at the next
 * step's when it is lower (a settler takes turns to found; the multiple only falls). Rivals' own growth is not foreseen.
 * @param race the MILITARY victoryRaces entry (board sorted, the game's goal) @param me our player id
 * @param { age, ageFrac, room: settlements we may still found, over: more past the cap (research/30 §1), ivy: Operation
 * Ivy can still be ours in time }
 * @returns { ours, top, multiple, goal, need, needIvy, room, over, reachable, withIvy, pastCap: settlements it takes past
 * the cap } or null (no race yet)
 */
export function militaryOutlook(race, me, { age = null, ageFrac = 0, room = 0, over = 0, ivy = false } = {}) {
    const board = race?.board ?? [];
    const ours = Number(board.find((b) => b.id === me)?.points) || 0;
    const top = Number(board.filter((b) => b.id !== me)[0]?.points) || 0;
    if (!(top > 0)) return null;
    const second = Number(board[1]?.points) || 0;
    const now = Number(race.goal) > 0 && second > 0 ? Number(race.goal) / second : dominanceMultiple(age, ageFrac);
    if (!(now > 0)) return null;
    const free = Math.max(0, Number(room) || 0);
    const past = Math.max(0, Number(over) || 0);
    const at = (multiple) => {
        const goal = Math.floor(top * multiple);
        const short = Math.max(0, goal - ours);
        const need = Math.ceil(short / SETTLEMENT_MILITARY_POINTS);
        const needIvy = ivy ? Math.ceil(Math.max(0, short - IVY_MILITARY_POINTS) / SETTLEMENT_MILITARY_POINTS) : need;
        // Under the cap first, then with Operation Ivy, then past the cap (Happiness everywhere), then both.
        let reachable = true;
        let withIvy = false;
        let pastCap = 0;
        if (need <= free) withIvy = false;
        else if (ivy && needIvy <= free) withIvy = true;
        else if (need <= free + past) pastCap = need - free;
        else if (ivy && needIvy <= free + past) [withIvy, pastCap] = [true, needIvy - free];
        else reachable = false;
        return { ours, top, multiple: Math.round(multiple * 100) / 100, goal, need, needIvy, room: free, over: past, reachable, withIvy, pastCap };
    };
    // Starting the countdown now beats waiting for the next step: a rival's countdown may start at that step (game 31:
    // at Modern's 60% Augustus's culture countdown began while ours, two settlements away at ×1.5, waited for ×1.25 and
    // the lever trained and bought no more settlers). The next step's multiple only when the current one is out of reach.
    const current = at(now);
    const next = nextDominanceMultiple(age, ageFrac);
    return next && next < now && !current.reachable ? at(next) : current;
}

/** The watch entry of a reachable military lever: our own CHANCE, with the settlements it takes. */
function leverEntry(o) {
    return {
        cls: "MILITARY", own: true, ours: o.ours, goal: o.goal, share: Math.round((o.ours / o.goal) * 100) / 100, need: o.goal - o.ours,
        settlements: o.withIvy ? o.needIvy : o.need, withIvy: o.withIvy, pastCap: o.pastCap ?? 0, level: "CHANCE", multiple: o.multiple,
    };
}

/**
 * Our place in each race the score counts (the ones switched on: 1000 − 10 × the sum of our places, plus 1000 a turn of
 * any countdown and 1 a major triumph; research/30 §1), and the points that would share the next place up (the nearest
 * score above ours). Ties share a place (everyone has 970 on the first turn of a game with three races).
 * @param races victoryRaces (each with its board) @param me our player id @returns [{ cls, place, of, gap: null when first }]
 */
export function scorePlaces(races, me) {
    const out = [];
    for (const r of races ?? []) {
        if (r.enabled === false) continue;
        const board = r.board ?? [];
        const ours = Number(board.find((b) => b.id === me)?.points) || 0;
        const above = board.filter((b) => b.id !== me && (Number(b.points) || 0) > ours).map((b) => Number(b.points) || 0);
        out.push({ cls: r.cls, place: above.length + 1, of: board.length, gap: above.length > 0 ? Math.min(...above) - ours : null });
    }
    return out;
}

// The player's choice of target («Цель победы»): AUTO = the path chosen here.
export const VICTORY_TARGETS = ["AUTO", ...FOCUS_CLASSES];

/**
 * The targets «Цель победы» offers: those whose victory is switched on in this game (`disabled`:
 * classes switched off); when that would leave only Auto (all off, or unknown), all of them,
 * like the focus itself ignores a game saying every victory is off.
 */
export function victoryOptions(disabled = new Set()) {
    const options = VICTORY_TARGETS.filter((v) => v === "AUTO" || !disabled.has(v));
    return options.length > 1 ? options : VICTORY_TARGETS;
}
// The priority profile each focus switches to (core/xpl-profiles.js).
export const PROFILE_FOR_FOCUS = Object.freeze({ CULTURE: "CULTURE", SCIENCE: "SCIENCE", ECONOMIC: "GOLD" });
// The triumph category (TypeTags) of each focus.
export const TRIUMPH_CATEGORY = Object.freeze({ CULTURE: "CULTURAL", SCIENCE: "SCIENTIFIC", ECONOMIC: "ECONOMIC" });

/**
 * The priority profile of a focus this pass: economy keeps science up (GOLD_SCIENCE) while techs
 * that unlock its path's work are still to research (`techsLeft`), else its own (PROFILE_FOR_FOCUS).
 */
export function profileForFocus(focus, { techsLeft = 0 } = {}) {
    if (focus === "ECONOMIC" && techsLeft > 0) return "GOLD_SCIENCE";
    return PROFILE_FOR_FOCUS[focus] ?? null;
}

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
 * @param options { disabled: Set of classes whose victory is switched off in this game,
 *                  finalAge: the age the victories are won in (a completed path keeps its score) }
 * @returns [{ cls, score, progress, lead, done, ours, rival, goal }] in FOCUS_CLASSES order (paths we know)
 */
export function scoreFocus(standings, leaning = null, triumphs = [], { disabled = new Set(), finalAge = false } = {}) {
    const close = closeTriumphs(triumphs);
    const out = [];
    for (const cls of FOCUS_CLASSES) {
        if (disabled.has(cls)) continue;
        // The class's path with a goal this age (other ages' paths have none here).
        const s = (standings ?? []).find((x) => x.cls === cls && x.goal > 0);
        if (!s) continue;
        const ours = Number(s.ours) || 0;
        const rival = Number(s.rival) || 0;
        const progress = Math.min(1, ours / s.goal);
        const lead = Math.max(-1, Math.min(1, (ours - rival) / s.goal));
        const done = ours >= s.goal;
        const kind = TRIUMPH_CATEGORY[cls];
        const bonus = Math.min(TRIUMPH_BONUS_MAX, TRIUMPH_BONUS * close.filter((t) => t.category === kind).length);
        const lean = leaning === cls ? LEANING_BONUS : 0;
        const score = done && !finalAge ? -1 : progress + LEAD_WEIGHT * lead + lean + bonus;
        out.push({ cls, score, progress, lead, done, ours, rival, goal: s.goal, lean: done && !finalAge ? 0 : lean });
    }
    return out;
}

/**
 * @param scores from scoreFocus
 * @param previous { cls, candidate, streak } from the last check (or the focus kept across the age change)
 * @param options { target: one of VICTORY_TARGETS (the player's choice; AUTO = choose here),
 *                  finalAge: a completed path is kept (its victory goes on); there the focus the age began with is kept
 *                  unless another victory's own countdown is within reach (`chances`: classes with our CHANCE in the
 *                  victory watch) — game 19: at Modern turn 1 every new path stood at 0 and Ada's leaning took the focus
 *                  from science (26 Innovation) to culture (46 against the leader's 117) }
 * @returns { cls, candidate, streak, changed } (cls null when no path is known)
 */
export function chooseFocus(scores, previous = {}, { target = "AUTO", finalAge = false, chances = new Set() } = {}) {
    const none = { cls: previous.cls ?? null, candidate: null, streak: 0, changed: false };
    if (!scores?.length) return none;
    // The player's target, while its path is known (and its victory switched on).
    if (target !== "AUTO" && scores.some((s) => s.cls === target)) return { cls: target, candidate: null, streak: 0, changed: previous.cls !== target };
    const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
    if (!previous.cls) return { cls: best.cls, candidate: null, streak: 0, changed: true };
    const current = scores.find((s) => s.cls === previous.cls);
    // The final age: keep the focus, unless another victory's own countdown is within reach.
    if (finalAge && current) {
        const chance = scores.find((s) => s.cls !== previous.cls && chances.has(s.cls));
        if (chance && !chances.has(previous.cls)) return { cls: chance.cls, candidate: null, streak: 0, changed: true };
        return { cls: previous.cls, candidate: null, streak: 0, changed: false };
    }
    if (best.cls === previous.cls) return { cls: previous.cls, candidate: null, streak: 0, changed: false };
    // The current path is unknown now or already completed this age (before the final age): switch at once.
    if (!current || (current.done && !finalAge)) return { cls: best.cls, candidate: null, streak: 0, changed: true };
    // The leader's leaning picks a first focus, it never makes a switch (at an age's start every path is at 0).
    const base = (s) => s.score - (s.lean ?? 0);
    if (base(best) - base(current) < SWITCH_MARGIN) return { cls: previous.cls, candidate: null, streak: 0, changed: false };
    const streak = previous.candidate === best.cls ? (previous.streak ?? 0) + 1 : 1;
    if (streak >= SWITCH_STREAK) return { cls: best.cls, candidate: null, streak: 0, changed: true };
    return { cls: previous.cls, candidate: best.cls, streak, changed: false };
}
