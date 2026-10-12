/**
 * Fixed 7-slot yield vector used everywhere in the core: [F, P, G, S, C, H, I].
 * Pure module.
 */
export const YIELD_KEYS = [
    "YIELD_FOOD",
    "YIELD_PRODUCTION",
    "YIELD_GOLD",
    "YIELD_SCIENCE",
    "YIELD_CULTURE",
    "YIELD_HAPPINESS",
    "YIELD_DIPLOMACY",
];
export const F = 0;
export const P = 1;
export const G = 2;
export const S = 3;
export const C = 4;
export const H = 5;
export const I = 6;
export const YIELD_COUNT = YIELD_KEYS.length;

const INDEX_BY_KEY = new Map(YIELD_KEYS.map((key, i) => [key, i]));

export function yieldIndex(yieldType) {
    return INDEX_BY_KEY.has(yieldType) ? INDEX_BY_KEY.get(yieldType) : -1;
}

export function zeroYields() {
    return [0, 0, 0, 0, 0, 0, 0];
}

export function dot(weights, yields) {
    let sum = 0;
    for (let i = 0; i < YIELD_COUNT; i++) {
        sum += (weights[i] ?? 0) * (yields[i] ?? 0);
    }
    return sum;
}

export function addInto(target, source, scale = 1) {
    for (let i = 0; i < YIELD_COUNT; i++) {
        target[i] += (source[i] ?? 0) * scale;
    }
    return target;
}
