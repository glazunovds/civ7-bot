/**
 * Priority profiles (PLAN.md section 4.4). Yield weights are normalised to mean 1.0
 * so profiles are comparable; term weights (tiles / adjacency / production) stay
 * as listed. Every profile except Food keeps w.prod >= 0.4 because the goal is towns
 * that can become productive cities; Food lowers it so food-rich land wins under that
 * priority. Pure module.
 */
import { YIELD_COUNT } from './xpl-yields.js';

//                F    P    G    S    C    H    I
const RAW = {
    BALANCE:    { y: [1.0, 1.2, 0.8, 0.9, 0.8, 0.8, 0.5], w: { tiles: 1.0, adj: 0.6, prod: 0.6 } },
    PRODUCTION: { y: [0.8, 2.0, 0.5, 0.5, 0.5, 0.6, 0.3], w: { tiles: 0.8, adj: 0.4, prod: 1.4 } },
    SCIENCE:    { y: [0.9, 1.0, 0.5, 2.0, 0.6, 0.7, 0.4], w: { tiles: 0.8, adj: 1.0, prod: 0.5 } },
    GOLD:       { y: [0.9, 1.0, 2.0, 0.5, 0.5, 0.7, 0.5], w: { tiles: 0.8, adj: 1.0, prod: 0.5 } },
    // The economy focus while its path's techs are missing (not offered in the priority list):
    // seen in game, under GOLD only 3 techs came in the whole Modern age (no Factory, no railroads).
    GOLD_SCIENCE: { y: [0.9, 1.0, 1.6, 1.4, 0.5, 0.7, 0.5], w: { tiles: 0.8, adj: 1.0, prod: 0.5 } },
    CULTURE:    { y: [0.9, 1.0, 0.5, 0.6, 2.0, 0.8, 0.6], w: { tiles: 0.8, adj: 1.0, prod: 0.5 } },
    // The strategy's GROWTH phase (core/xpl-strategy.js; not offered in the priority list): food and
    // production first, so towns and cities grow and later build the focus's buildings faster
    // (research/21 decision 7); then happiness, gold and the focus's own yield.
    GROWTH_SCIENCE: { y: [1.0, 0.8, 0.5, 0.5, 0.3, 0.6, 0.3], w: { tiles: 1.2, adj: 0.5, prod: 0.8 } },
    GROWTH_CULTURE: { y: [1.0, 0.8, 0.5, 0.3, 0.5, 0.6, 0.3], w: { tiles: 1.2, adj: 0.5, prod: 0.8 } },
    GROWTH_GOLD:    { y: [1.0, 0.8, 0.5, 0.3, 0.3, 0.6, 0.3], w: { tiles: 1.2, adj: 0.5, prod: 0.8 } },
    FOOD:       { y: [2.0, 1.0, 0.6, 0.5, 0.5, 0.8, 0.4], w: { tiles: 1.4, adj: 0.3, prod: 0.25 } },
    HAPPINESS:  { y: [0.9, 1.0, 0.6, 0.5, 0.6, 2.0, 0.4], w: { tiles: 0.8, adj: 1.0, prod: 0.5 } },
};

function normalise(vector) {
    const mean = vector.reduce((a, b) => a + b, 0) / YIELD_COUNT;
    return vector.map((v) => v / mean);
}

export const PROFILE_DEFS = Object.freeze(
    Object.fromEntries(Object.entries(RAW).map(([key, def]) => [key, Object.freeze({ key, y: Object.freeze(normalise(def.y)), w: Object.freeze({ ...def.w }) })]))
);

// The player's balance («Баланс приоритетов»): a multiplier per yield on top of whichever profile is in use (the
// strategy's phase profiles included), so the weights can be tuned in game instead of in code.
export const BIAS_KEYS = Object.freeze(["F", "P", "G", "S", "C", "H"]); // food, production, gold, science, culture, happiness
export const BIAS_MIN = 0;
export const BIAS_MAX = 2;
export const BIAS_STEP = 0.1;

/** A clean balance: every BIAS_KEYS multiplier a number within BIAS_MIN..BIAS_MAX, rounded to BIAS_STEP (1 if missing). */
export function normaliseBias(raw) {
    const out = {};
    for (const k of BIAS_KEYS) {
        const n = Number(raw?.[k]);
        out[k] = Number.isFinite(n) ? Math.round(Math.min(BIAS_MAX, Math.max(BIAS_MIN, n)) / BIAS_STEP) * BIAS_STEP : 1;
        out[k] = Math.round(out[k] * 100) / 100;
    }
    return out;
}

// One balance per victory focus (the sliders show the focus's own), and one without a focus. Science starts leaning
// to science over food: game 16 with Еда ×0.7 and Наука ×1.5 had 383 science at Exploration turn 60 (the best rival
// 208) and 13 specialists; game 19 at ×1.0 had 113 (the best rival 204) and 1 specialist.
export const BIAS_SETS = Object.freeze(["SCIENCE", "CULTURE", "ECONOMIC", "NONE"]);
const ONES = Object.freeze({ F: 1, P: 1, G: 1, S: 1, C: 1, H: 1 });
export const BIAS_DEFAULTS = Object.freeze({
    SCIENCE: Object.freeze({ ...ONES, F: 0.7, S: 1.5 }),
    CULTURE: ONES,
    ECONOMIC: ONES,
    NONE: ONES,
});

const isFlat = (raw) => !!raw && BIAS_KEYS.some((k) => raw[k] !== undefined);

/**
 * Clean balances, one per BIAS_SETS (missing: the set's default). An old single balance ({F, P, …}) at ×1 is
 * dropped (the defaults apply); a changed one becomes every set's.
 */
export function normaliseBiasSets(raw) {
    const out = {};
    const flat = isFlat(raw) && !BIAS_KEYS.every((k) => raw[k] === undefined || Number(raw[k]) === 1) ? normaliseBias(raw) : null;
    for (const set of BIAS_SETS) out[set] = flat ? { ...flat } : normaliseBias(raw?.[set] ?? BIAS_DEFAULTS[set]);
    return out;
}

/** The balance set this pass uses: the victory focus (settings.biasFocus, the autopilot's), else NONE. */
export function biasKey(settings) {
    return BIAS_SETS.includes(settings?.biasFocus) ? settings.biasFocus : "NONE";
}

/**
 * The balance in use: the focus's set (its default when unset); a single balance ({F, …}) as it is. While the treasury
 * bleeds, gold's multiplier is raised by the autopilot's `settings.goldPressure` (core/xpl-scarcity.js goldPressure), so
 * every reader of the weights (profileFor) and the building plan's inputs see it.
 */
export function biasFor(settings) {
    const raw = settings?.yieldBias;
    const b = isFlat(raw) ? normaliseBias(raw) : normaliseBias(raw?.[biasKey(settings)] ?? BIAS_DEFAULTS[biasKey(settings)]);
    const g = Number(settings?.goldPressure);
    const out = g > 1 ? { ...b, G: Math.round(b.G * g * 100) / 100 } : b;
    // The science victory's last stretch (the autopilot's `settings.spacePush`): production SPACE_PUSH times more, science
    // that many times less (research/38 §4 E1).
    // HALF from Rocketry with a Launch Pad standing or queued, the full push once the Innovation masteries are in.
    const push = settings?.spacePush === "HALF" ? SPACE_PUSH_HALF : settings?.spacePush ? SPACE_PUSH : 1;
    return push > 1 ? { ...out, P: Math.round(out.P * push * 100) / 100, S: Math.round((out.S / push) * 100) / 100 } : out;
}

// From Rocketry, while the masteries still bring Innovation: half the push (research/39 §4.7: game 32 had 11-13 turns between
// Rocketry and the full push).
export const SPACE_PUSH_HALF = 1.25;

// Once Rocketry and the Innovation masteries are in and a Launch Pad stands, science buys only Future Tech (3 Innovation for
// 5,000 science and more) while 1,000 production runs a Crewed Space Flight Preparation (15): research/38 §3.7, game 30's
// London fell from 66 to 36 production at M55 while the science balance still placed specialists.
export const SPACE_PUSH = 1.5;

const biased = new Map(); // "<profile>|<bias>" -> the profile with the balance applied

/**
 * The profile the settings ask for (settings.profile), with the player's balance applied (biasFor: the victory
 * focus's set of settings.yieldBias): each yield's weight times its multiplier (influence unchanged). All 1:
 * getProfile itself.
 */
export function profileFor(settings) {
    const base = getProfile(settings?.profile);
    const bias = biasFor(settings);
    if (BIAS_KEYS.every((k) => bias[k] === 1)) return base;
    const key = `${base.key}|${BIAS_KEYS.map((k) => bias[k]).join(",")}`;
    let p = biased.get(key);
    if (!p) {
        p = Object.freeze({ key: base.key, y: Object.freeze(base.y.map((v, i) => (i < BIAS_KEYS.length ? v * bias[BIAS_KEYS[i]] : v))), w: base.w, bias });
        biased.set(key, p);
    }
    return p;
}

export function getProfile(key) {
    return PROFILE_DEFS[key] ?? PROFILE_DEFS.BALANCE;
}
