/**
 * Tunable constants for site scoring (PLAN.md section 4.3). Starting values;
 * calibrated in-game in M1. Pure module.
 */
/**
 * Few sites and far below the settlement cap (research/22 A1; the user: "too low space to settle, but we
 * should if we have too few cities"): a second search with looser rules — 4 tiles from a foreign
 * settlement instead of 5, 5-6 tiles from a village allowed (still none within 4), unseen villages
 * ignored, overlap HIGH. @returns the tuning for a search (relaxed or the normal one)
 */
export function siteTuning(relaxed = false) {
    return relaxed ? Object.freeze({ ...TUNING, FOREIGN_MIN_DISTANCE: 4, VILLAGE_ANGER_DISTANCE: 4, RELAXED: true }) : TUNING;
}
export const RELAXED_MIN_PICKS = 2; // fewer picks than this (and far below the cap): search again, relaxed

export const TUNING = Object.freeze({
    // Weight of a tile's value by ring (0 = centre). Ring 1 is owned at founding,
    // rings 2-3 come with growth.
    RING_WEIGHT: [1.0, 1.0, 0.75, 0.5],

    // Expected share of a tile at distance d (index) from another settlement centre.
    // 0 = that settlement will own it; beyond distance 3 the tile is not contested.
    SHARE: {
        OWN: [0, 0, 0.4, 0.6],
        FOREIGN: [0, 0, 0.2, 0.4],
        PLANNED: [0, 0, 0.4, 0.5],
        PLANNED_TOWN: [0, 0, 0.5, 0.8], // a kept town mostly works rings 1-2
    },

    // Free tile next to another civilization's territory: they will usually claim it first.
    FOREIGN_BORDER_SHARE: 0.5,

    // No city or town planned closer than this to another player's settlement centre
    // (another civilization's, an independent's or a city-state's): the user's rule.
    FOREIGN_MIN_DISTANCE: 5,

    // An independent's village (not a city: player.Cities is empty for it) turns hostile when a
    // settlement is founded within 3 tiles, and its relationship drops one level (friendly →
    // neutral, neutral → hostile) within 6 (Civilopedia, walls page). Seen in game 5: five villages
    // declared war on the turn we settled 4–5 tiles away, and took four of those settlements.
    // No site that close: within 3 of any village, within 6 of one not friendly to us.
    VILLAGE_HOSTILE_DISTANCE: 3,
    VILLAGE_ANGER_DISTANCE: 6,

    // Minimum availability-weighted growable tiles in rings 1-3 (out of 36),
    // keyed by the "overlap tolerance" setting.
    ROOM_HARD_MIN: { LOW: 24, MEDIUM: 18, HIGH: 12 },
    // Ring-1 tiles with availability >= RING1_FREE_SHARE needed to found a working town.
    RING1_MIN_FREE: 4,
    RING1_FREE_SHARE: 0.4,

    // Availability-weighted food in rings 1-2 below which growth stalls.
    FOOD_GATE: 12,

    FRESH_WATER: 5,          // happiness units (+5 Happiness when founded on fresh water)
    COASTAL: 3,              // generic units (harbour, water buildings, coastal connection)
    RESOURCE_BONUS: 0.5,     // per resource tile, on top of its yields
    NEW_RESOURCE_BONUS: 1.0, // resource type the player doesn't have yet
    LUXURY_BONUS: 0.5,       // empire (luxury) resource class

    ADJ_TOP_K: 4,            // best urban tiles per adjacency family
    ADJ_MULT_CITY: 1.5,      // 1 + expected specialist share (specialists repeat adjacency)

    UNKNOWN_TILE_GUESS: 0.5, // unexplored ring tile = this x average known tile value

    INDEPENDENT_PENALTY: { NEAR: 15, MID: 4 }, // hundredths of site value at <=3 and 4-6 tiles
    AI_PICK_BONUS: 3,        // hundredths of site value for sites the game's AI also suggests

    // Component values of a "reference good" site (value 1.0).
    SCORE_REF: { tiles: 70, adj: 10, prod: 20 },
    SCORE_BASE: 60,          // display score of a reference site (value 1.0)
    SCORE_SLOPE: 120,        // display points per 1.0 of value
    TIERS: { EXCELLENT: 85, GOOD: 70, FAIR: 55 },

    PROD_TILE_BONUS: 0.5,    // production potential added per vegetated/rough tile
    // A natural wonder the settlement would own: 10 culture victory points (victories.xml VICTORY_TRACKER_NATURAL_WONDER;
    // research/26 §4.5), in site value (1.0 = a reference good site), by ring: ring 1 is owned at founding, rings 2-3
    // only if growth reaches them. Counted while the culture victory is on (ctx.naturalWonders).
    NATURAL_WONDER: 0.12,
    NATURAL_WONDER_RING: [0, 1, 0.5, 0.25],
    ADJ_TO_PROD: 0.5,        // share of production-family adjacency added to production potential

    // Kept towns (xpl-town-scorer.js): grow to population 7, then send all Food to connected cities.
    TOWN: {
        RING_WEIGHT: [1, 1, 0.8, 0.4],
        ROOM_MIN: 7,           // growable tiles in rings 1-2: enough to work ~7 tiles at the Focus
        RING1_MIN_FREE: 3,
        WORKED: 7,             // tiles worked at population 7, when the Focus unlocks
        REF: { growth: 16, feed: 18, spec: 6 }, // a "reference good" town (value 1.0)
        W: { growth: 0.3, feed: 0.45, spec: 0.25 },
        CONNECT: [[6, 1.0], [9, 0.8], [12, 0.6]], // road connection: easier the closer the city
        CONNECT_BEYOND: 0.35,
        NO_CITY_FACTOR: 0.5,
        FRESH_WATER: 0.04,
        NEW_RESOURCE: 0.03,
    },
});
