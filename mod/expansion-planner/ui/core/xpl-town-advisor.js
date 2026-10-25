/**
 * Town -> city advisor (PLAN.md section 5). Pure module.
 *
 * A town turns all its production into gold. Converting it buys a production queue,
 * so the gain per turn is the production's extra value over that gold, minus the
 * empire-wide building cost increase (+10% per extra city), minus the town focus
 * that is lost. Cities revert to towns at the end of every age except the last, so
 * the conversion has to pay back well before the age ends.
 *
 * Town input t:
 *   { name, pop, prodNow, prodPot, cost, canConvert, failureReasons[], hasFocus,
 *     focusValue, foodSurplus, costFallsWithPop }
 * Context ctx:
 *   { age, numCities, cityLimit, numTowns, sumCityProduction, prodToGold,
 *     agePoints, ageMax, isFinalAge, ageTurnsLeft, expectKeepCities }
 */

export const ADVISOR = Object.freeze({
    PROD_MIN_NOW: { AGE_ANTIQUITY: 6, AGE_EXPLORATION: 12, AGE_MODERN: 18 },
    PROD_MIN_POT: { AGE_ANTIQUITY: 12, AGE_EXPLORATION: 20, AGE_MODERN: 28 },
    PAYBACK_FRAC: 0.4,   // must pay back within this share of the turns left in the age
    LATE_AGE_FRAC: 0.8,  // don't convert in the last 20% of an age (it reverts at age end)
    HORIZON: 40,         // turns of benefit counted at most
    BUILD_SHARE: 0.6,    // share of city production spent on non-warehouse buildings (hit by the +10%)
    EMPIRE_TAX: 0.10,    // +10% building cost per city beyond the capital
    FOCUS_LOSS: 0.15,    // share of a focused town's yields lost with its focus
    POP_FOR_DISCOUNT: 7, // cost falls with population; worth waiting below this
    FEEDER_FOOD: 6,      // food surplus that makes a town a good feeder instead
});

export const VERDICT_ORDER = { CONVERT: 0, CONSIDER: 1, WAIT: 2, KEEP: 3, BLOCKED: 4 };

function reason(sign, key, args = []) {
    return { sign, key, args };
}

function threshold(table, age) {
    return table[age] ?? table.AGE_ANTIQUITY;
}

/** @returns { verdict, value, gainPerTurn, paybackTurns, reasons[] } */
export function adviseTown(t, ctx, k = ADVISOR) {
    const reasons = [];
    const finalAge = !!ctx.isFinalAge || !!ctx.expectKeepCities;
    const ageLeft = finalAge ? Infinity : Math.max(1, ctx.ageTurnsLeft ?? 60);
    const ageFrac = ctx.ageMax > 0 ? ctx.agePoints / ctx.ageMax : 0;

    const tax = k.EMPIRE_TAX * k.BUILD_SHARE * (ctx.sumCityProduction ?? 0);
    const lost = t.hasFocus ? k.FOCUS_LOSS * (t.focusValue ?? 0) : 0;
    const gainPerTurn = ((ctx.prodToGold ?? 2) - 1) * t.prodNow - tax - lost;
    const paybackTurns = gainPerTurn > 0 && t.cost > 0 ? Math.ceil(t.cost / gainPerTurn) : Infinity;
    const value = gainPerTurn * Math.min(ageLeft, k.HORIZON) - Math.max(0, t.cost);

    const result = (verdict) => {
        // Notes that apply whatever the verdict.
        if (ctx.cityLimit > 0 && ctx.numCities + 1 === ctx.cityLimit && verdict !== "BLOCKED") {
            reasons.push(reason("!", "LOC_XPL_TOWN_R_LAST_SLOT"));
        }
        if (verdict === "CONVERT" || verdict === "CONSIDER") {
            if (ctx.numCities + 1 > Math.max(1, (ctx.numTowns ?? 0) - 1)) reasons.push(reason("!", "LOC_XPL_TOWN_R_RATIO"));
            if (t.hasFocus) reasons.push(reason("-", "LOC_XPL_TOWN_R_FOCUS_LOSS"));
            if (!finalAge) reasons.push(reason("!", "LOC_XPL_TOWN_R_REVERTS"));
            if (tax > 0.5) reasons.push(reason("-", "LOC_XPL_TOWN_R_TAX", [Math.round(tax * 10) / 10]));
        }
        return { verdict, value: Math.round(value), gainPerTurn: Math.round(gainPerTurn * 10) / 10, paybackTurns, reasons };
    };

    if (ctx.cityLimit > 0 && ctx.numCities >= ctx.cityLimit) {
        reasons.push(reason("-", "LOC_XPL_TOWN_R_CITY_LIMIT", [ctx.numCities, ctx.cityLimit]));
        return result("BLOCKED");
    }
    if (!t.canConvert) {
        for (const r of t.failureReasons ?? []) reasons.push(reason("-", "LOC_XPL_TOWN_R_ENGINE", [r]));
        if (reasons.length === 0) reasons.push(reason("-", "LOC_XPL_TOWN_R_CANNOT"));
        return result("BLOCKED");
    }
    if (t.prodPot < threshold(k.PROD_MIN_POT, ctx.age)) {
        reasons.push(reason("-", "LOC_XPL_TOWN_R_PROD_POT_LOW", [Math.round(t.prodPot), threshold(k.PROD_MIN_POT, ctx.age)]));
        if ((t.foodSurplus ?? 0) >= k.FEEDER_FOOD) reasons.push(reason("+", "LOC_XPL_TOWN_R_FEEDER"));
        return result("KEEP");
    }
    if (!finalAge && ageFrac > k.LATE_AGE_FRAC) {
        reasons.push(reason("-", "LOC_XPL_TOWN_R_LATE_AGE", [Math.round(ageFrac * 100)]));
        return result("KEEP");
    }
    if (t.prodNow < threshold(k.PROD_MIN_NOW, ctx.age) || (t.pop < k.POP_FOR_DISCOUNT && t.costFallsWithPop)) {
        reasons.push(reason("!", "LOC_XPL_TOWN_R_GROW_FIRST", [Math.round(t.prodNow), threshold(k.PROD_MIN_NOW, ctx.age)]));
        if (t.costFallsWithPop) reasons.push(reason("+", "LOC_XPL_TOWN_R_COST_DROPS"));
        return result("WAIT");
    }
    if (paybackTurns <= k.PAYBACK_FRAC * ageLeft && value > 0) {
        reasons.push(reason("+", "LOC_XPL_TOWN_R_PAYBACK", [paybackTurns]));
        reasons.push(reason("+", "LOC_XPL_TOWN_R_PROD_GAIN", [Math.round(t.prodNow)]));
        return result("CONVERT");
    }
    reasons.push(reason("!", "LOC_XPL_TOWN_R_PAYBACK_SLOW", [Number.isFinite(paybackTurns) ? paybackTurns : "-"]));
    return result("CONSIDER");
}

/** Sorts advice rows: verdict order, then value descending. */
export function compareAdvice(a, b) {
    const va = VERDICT_ORDER[a.advice.verdict] ?? 9;
    const vb = VERDICT_ORDER[b.advice.verdict] ?? 9;
    if (va !== vb) return va - vb;
    return b.advice.value - a.advice.value;
}

// The age's clock is exact when its points rose one a turn over this many last turns (game 60: Antiquity's last turns).
export const EXACT_CLOCK_TURNS = 5;

/**
 * Did the age's points rise exactly one a turn over the last EXACT_CLOCK_TURNS turns, the last sample now's points? Then the turns
 * left are max - points, and a deadline needs no margin (game 60: a 1-turn margin on such a clock lost the capital's Altar).
 */
export function exactClock(samples, points, max, n = EXACT_CLOCK_TURNS) {
    const usable = (samples ?? []).filter((s) => Number.isFinite(s.turn) && Number.isFinite(s.points));
    if (usable.length < n + 1 || !(max > 0)) return false;
    const last = usable.slice(-(n + 1));
    if (last[last.length - 1].points !== points) return false;
    for (let i = 1; i < last.length; i++) {
        if (last[i].turn - last[i - 1].turn !== 1 || last[i].points - last[i - 1].points !== 1) return false;
    }
    return true;
}

/** Turns left in the age from samples [{ turn, points }] (oldest first). */
export function estimateAgeTurnsLeft(samples, points, max, fallbackTotalTurns = 120) {
    const usable = (samples ?? []).filter((s) => Number.isFinite(s.turn) && Number.isFinite(s.points));
    if (usable.length >= 2) {
        const first = usable[0];
        const last = usable[usable.length - 1];
        const dt = last.turn - first.turn;
        const dp = last.points - first.points;
        if (dt > 0 && dp > 0) {
            return Math.max(1, Math.round((max - points) / (dp / dt)));
        }
    }
    const frac = max > 0 ? points / max : 0;
    return Math.max(1, Math.round((1 - frac) * fallbackTotalTurns));
}
