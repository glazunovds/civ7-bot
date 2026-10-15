/**
 * Deals a leader offers us (research/23 D1). Pure module.
 *
 * In game 8 Prussia offered a plain peace, asking nothing, and the autopilot could not answer it: the
 * turn's end was refused 15 times in 30 s, and the war went on. A deal is a list of items
 * (Game.DiplomacyDeals.getWorkingDealItem: { type, subType, from, to, amount, cityId }); peace is an
 * AGREEMENTS item of subType MAKE_PEACE.
 */

// A peace may ask at most this share of our gold, and of our Influence, and no settlement.
export const DEAL_GIVE_SHARE = 0.25;

/**
 * @param items deal items
 * @param ctx { me: our player id, gold, influence, T: { AGREEMENTS, CITIES, GOLD, INFLUENCE, MAKE_PEACE } }
 * @returns { accept, peace, asks: { cities, gold, influence } }
 */
export function judgeDeal(items, { me, gold = 0, influence = 0, T }) {
    const peace = (items ?? []).some((i) => i?.type === T.AGREEMENTS && i.subType === T.MAKE_PEACE);
    const asks = { cities: 0, gold: 0, influence: 0 };
    for (const i of items ?? []) {
        if (!i || i.from !== me) continue;
        if (i.type === T.CITIES) asks.cities++;
        else if (i.type === T.GOLD) asks.gold += Number(i.amount) || 0;
        else if (i.type === T.INFLUENCE) asks.influence += Number(i.amount) || 0;
    }
    const accept = peace && asks.cities === 0
        && asks.gold <= DEAL_GIVE_SHARE * Math.max(0, Number(gold) || 0)
        && asks.influence <= DEAL_GIVE_SHARE * Math.max(0, Number(influence) || 0);
    return { accept, peace, asks };
}
