/**
 * What a recurring cost in food or happiness is worth to one settlement. Pure module.
 *
 * Both are local in Civ VII: a settlement that runs out of food stops growing (or starves)
 * and one below zero happiness falls into unrest, while a settlement with plenty to spare
 * hardly feels a few points less. So a cost of food or happiness is weighted by how much
 * the settlement keeps after paying it:
 *  - it would go below zero: SHORTAGE (a real problem, avoid);
 *  - nothing left: full weight; the more left over, the lower, down to MIN.
 *    multiplier = MIN + (1 - MIN) * REF / (REF + left)
 *    (left 0 -> 1.0, left 20 -> 0.65, left 140 -> 0.39)
 * Other yields (gold is the empire's, science and culture have no threshold) keep the
 * profile's weight; gold weighs more for the whole empire while its income stays below zero
 * (goldPressure).
 *
 * Below zero Happiness the game itself takes a share of the settlement's other yields
 * (unhappinessDelta): a happiness cost that pushes it there costs that share too, and a
 * happiness gain that lifts it wins it back. The settlement's other yields come in `nets`;
 * where they are unknown, SHORTAGE stands in for it.
 */
import { C, F, G, H, I, P, S } from './xpl-yields.js';

export const SCARCITY = Object.freeze({ REF: 20, MIN: 0.3, SHORTAGE: 2 });
const LOCAL = [F, H];

// The game's penalty below zero Happiness (Civilopedia, Concepts: Happiness): each point of a settlement's net local
// unhappiness takes 5% of its other yields (food and happiness aside), at most 80%. Research/31 §8: game 27's Лоян took two
// Modern specialists at 6 Happiness each, went to about −12, and its production fell from 31 to 12 a turn: its next
// building, an Examination Hall, showed 49 turns.
export const UNHAPPINESS = Object.freeze({ PER_POINT: 0.05, MAX: 0.8 });
const PENALISED = [P, G, S, C, I];

/** The share of a settlement's other yields the game takes at `net` Happiness (0 at or above zero). */
export function unhappinessShare(net) {
    return Number.isFinite(net) && net < 0 ? Math.min(UNHAPPINESS.MAX, -net * UNHAPPINESS.PER_POINT) : 0;
}

/**
 * The weighted yields a settlement loses (positive) or wins back (negative) when its net Happiness goes from `from` to
 * `to`: its other yields' weighted total before any penalty × the change in the penalty's share. `nets` holds its yields
 * now (already reduced when below zero). 0 when they are not known.
 */
export function unhappinessDelta(weights, nets, from, to) {
    if (!nets || !Number.isFinite(from) || !Number.isFinite(to)) return 0;
    let total = 0;
    for (const i of PENALISED) if (Number.isFinite(nets[i]) && nets[i] > 0) total += (weights[i] ?? 0) * nets[i];
    if (!(total > 0)) return 0;
    const now = unhappinessShare(from);
    return (total / (1 - now)) * (unhappinessShare(to) - now);
}

/**
 * What a change of `delta` Happiness from `from` is worth in the game's penalty on a settlement's other yields (positive:
 * yields won back, negative: yields lost; `nets` as for unhappinessDelta). Exact while the penalty's share moves (5% a
 * point). A settlement held at the 80% cap counts the cap's share of the way back: each point between it and zero is
 * worth the cap over those points, so a gain there is not worth nothing, nor a further loss free. Research/34 §2: game
 * 28's Kalhu sat at −33 all Modern, where a +5 building alone changes no share, and nothing was done about it; its
 * yields lost 80%.
 */
export function happinessWorth(weights, nets, from, delta) {
    if (!nets || !Number.isFinite(from) || !Number.isFinite(delta) || delta === 0) return 0;
    const exact = -unhappinessDelta(weights, nets, from, from + delta);
    if (!(from < 0)) return exact;
    let total = 0;
    for (const i of PENALISED) if (Number.isFinite(nets[i]) && nets[i] > 0) total += (weights[i] ?? 0) * nets[i];
    if (!(total > 0)) return exact;
    const now = unhappinessShare(from);
    // The share each point below zero holds on the way back (5% until the cap, less beyond it).
    const slope = now / -from;
    const raw = total / (1 - now);
    const path = raw * slope * (delta > 0 ? Math.min(delta, -from) : delta);
    return delta > 0 ? Math.max(exact, path) : Math.min(exact, path);
}

/** Weight multiplier for paying `cost` of a yield the settlement has `net` per turn of. */
export function costMultiplier(net, cost) {
    if (!Number.isFinite(net)) return 1;
    const left = net - cost;
    if (left < 0) return SCARCITY.SHORTAGE;
    return SCARCITY.MIN + (1 - SCARCITY.MIN) * SCARCITY.REF / (SCARCITY.REF + left);
}

/**
 * Weight multiplier for gaining a yield the settlement already has `net` per turn of: the same curve, the other way
 * round (research/26 §3.2: game 14's Exploration had twice the rivals' food and half their science; new citizens
 * went to farm tiles 44 times and to specialists 8). Short (net ≤ 0): full weight; plenty: down to MIN.
 */
export function gainMultiplier(net) {
    if (!Number.isFinite(net) || net <= 0) return 1;
    return SCARCITY.MIN + (1 - SCARCITY.MIN) * SCARCITY.REF / (SCARCITY.REF + net);
}

/**
 * Weighted value of a recurring gain (amounts by yield): food and happiness scaled down by what the settlement has
 * to spare (gainMultiplier); the other yields at the profile's weight, less the share the game takes of them below zero
 * Happiness (at `happinessAfter`, the settlement's Happiness once the gain and its upkeep are in; default: now plus the
 * gain's own happiness). Losses (negative amounts) at full weight.
 * @param weights profile weights[7] @param gains number[7] @param nets number[7] | null (null: plain weights)
 */
export function gainValue(weights, gains, nets, { happinessAfter = null } = {}) {
    // Research/34 §3: game 28's Nineveh at −23 took a specialist valued 19.6, and its science moved 26 → 27: the game took
    // 80% of the new yields too.
    const after = !nets ? NaN : Number.isFinite(happinessAfter) ? happinessAfter : nets[H] + Math.max(0, gains[H] || 0);
    const kept = 1 - unhappinessShare(after);
    let v = 0;
    gains.forEach((g, i) => {
        if (!g) return;
        const m = nets && LOCAL.includes(i) && g > 0 ? gainMultiplier(nets[i]) : 1;
        const share = g > 0 && PENALISED.includes(i) ? kept : 1;
        // Happiness in a settlement below zero also wins back the game's penalty on its other yields (happinessWorth).
        const won = nets && i === H && g > 0 ? happinessWorth(weights, nets, nets[H], g) : 0;
        v += (weights[i] ?? 0) * g * m * share + won;
    });
    return v;
}

/**
 * Weighted value of a recurring cost (positive amounts by yield), food and happiness
 * scaled by what the settlement has to spare.
 * @param weights profile weights[7]
 * @param costs   number[7] (positive = paid)
 * @param nets    number[7] | null  the settlement's net per turn (null: plain weights)
 */
export function costValue(weights, costs, nets) {
    let v = 0;
    costs.forEach((c, i) => {
        if (!c) return;
        const local = !!nets && LOCAL.includes(i) && c > 0;
        // Happiness pushed below zero: the game's penalty on the settlement's other yields when they are known (the
        // happiness itself then at full weight; at the 80% cap still the way back it adds: happinessWorth), else SHORTAGE.
        const penalty = local && i === H ? -happinessWorth(weights, nets, nets[H], -c) : 0;
        const m = !local ? 1 : penalty > 0 ? 1 : costMultiplier(nets[i], c);
        v += (weights[i] ?? 0) * c * m + penalty;
    });
    return v;
}

// The gold weight's multiplier by level, and the turns that raise and lower it (goldPressure).
export const GOLD_PRESSURE = Object.freeze({ STEPS: Object.freeze([1, 1.5, 2]), START_TURNS: 3, HARD_TURNS: 8, RECOVER_TURNS: 3 });

/**
 * Gold weighs more while the treasury bleeds. Game 31: the gold income stood below zero for most of Modern (unit upkeep
 * 90-115 a turn against 53-76 gross gold), the treasury at 0 from M24 to M43, and no settler could be bought for our own
 * military countdown, two settlements away; every choice still weighed gold as in peace. The level rises with the
 * deficit: START_TURNS turns in a row below zero, or a treasury that covers one more turn of it, give level 1; a deficit on
 * all but two of the last HARD_TURNS turns, or both of the above, level 2. It falls one level at a time, only after
 * RECOVER_TURNS turns in a row at or above zero (no thrash: the building plan replans when it changes).
 * @param turns the gold income of the last turns, oldest first @param balance the treasury @param level the level before
 * @returns { level, factor: the gold weight's multiplier (STEPS[level]) }
 */
export function goldPressure(turns, balance, level = 0) {
    const t = (turns ?? []).map((x) => Number(x) || 0);
    const { STEPS, START_TURNS, HARD_TURNS, RECOVER_TURNS } = GOLD_PRESSURE;
    const income = t.length > 0 ? t[t.length - 1] : 0;
    const last = t.slice(-START_TURNS);
    const deficit = last.length >= START_TURNS && last.every((x) => x < 0);
    const empty = income < 0 && (Number(balance) || 0) <= -income;
    const recent = t.slice(-HARD_TURNS);
    const long = recent.length >= HARD_TURNS && recent.filter((x) => x < 0).length >= HARD_TURNS - 2;
    const want = long || (deficit && empty) ? 2 : deficit || empty ? 1 : 0;
    const before = Math.max(0, Math.min(STEPS.length - 1, Number(level) || 0));
    const back = t.slice(-RECOVER_TURNS);
    const recovered = back.length >= RECOVER_TURNS && back.every((x) => x >= 0);
    const next = want >= before ? want : recovered ? Math.max(want, before - 1) : before;
    return { level: next, factor: STEPS[next] };
}
