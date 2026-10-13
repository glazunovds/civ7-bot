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

export function getProfile(key) {
    return PROFILE_DEFS[key] ?? PROFILE_DEFS.BALANCE;
}
