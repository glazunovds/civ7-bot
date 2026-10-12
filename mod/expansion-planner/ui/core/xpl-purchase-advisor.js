/**
 * Which planned buildings to buy with gold, and where. Pure module.
 *
 * Buying a building makes its yields start sooner:
 *  - in a city, by the turns its production would still take (its place in the plan's
 *    build order, `eta`);
 *  - in a town, for the rest of the age: a town's production turns into gold, so it never
 *    builds anything itself (`eta` = Infinity).
 * Value of buying = net weighted yields per turn (after upkeep) x turns gained, capped by
 * the turns left in the age. Candidates are ranked by value per gold; then the gold in
 * the treasury is handed out down that ranking (`inBudget`).
 */

/**
 * @param candidates [{ key, perTurn, eta, cost, canBuy }]  canBuy: the game accepts the
 *        purchase on that tile now (enough gold or not)
 * @param o { gold, turnsLeft, max }
 * @returns { picks: [{ ...candidate, turnsGained, value, perGold, inBudget, affordable }], budgetLeft }
 */
export function rankPurchases(candidates, o = {}) {
    const turnsLeft = Math.max(1, Number(o.turnsLeft) || 1);
    const gold = Math.max(0, Number(o.gold) || 0);
    const ranked = [];
    for (const c of candidates) {
        if (!c.canBuy || !(c.cost > 0) || !(c.perTurn > 0)) continue;
        const turnsGained = Math.min(Number.isFinite(c.eta) ? Math.max(1, c.eta) : turnsLeft, turnsLeft);
        const value = c.perTurn * turnsGained;
        ranked.push({ ...c, turnsGained, value: Math.round(value * 10) / 10, perGold: value / c.cost });
    }
    ranked.sort((a, b) => b.perGold - a.perGold || a.cost - b.cost);
    let left = gold;
    for (const r of ranked) {
        r.affordable = r.cost <= gold;
        r.inBudget = r.cost <= left;
        if (r.inBudget) left -= r.cost;
    }
    return { picks: ranked.slice(0, o.max ?? 5), budgetLeft: left };
}
