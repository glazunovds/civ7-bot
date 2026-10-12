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
 * profile's weight.
 */
import { F, H } from './xpl-yields.js';

export const SCARCITY = Object.freeze({ REF: 20, MIN: 0.3, SHORTAGE: 2 });
const LOCAL = [F, H];

/** Weight multiplier for paying `cost` of a yield the settlement has `net` per turn of. */
export function costMultiplier(net, cost) {
    if (!Number.isFinite(net)) return 1;
    const left = net - cost;
    if (left < 0) return SCARCITY.SHORTAGE;
    return SCARCITY.MIN + (1 - SCARCITY.MIN) * SCARCITY.REF / (SCARCITY.REF + left);
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
        const m = nets && LOCAL.includes(i) && c > 0 ? costMultiplier(nets[i], c) : 1;
        v += (weights[i] ?? 0) * c * m;
    });
    return v;
}
