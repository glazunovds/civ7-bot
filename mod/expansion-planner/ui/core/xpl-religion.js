/**
 * Pantheons and beliefs by what they give our empire (research/40 A3, notes/religion.md). Pure module.
 *
 * Policy Yield Previews gives these nothing (a pantheon acts only through the Altar, `BeliefModifiers` rows "have no effect
 * for human players"; beliefs add yields per follower, relics and slots), so the first the game allowed was taken: game 41's
 * Earth Goddess (+1 Happiness adjacency for mountains on the Altar), then Icons (relics for converting city-states we never
 * convert), Interfaith Dialogue, Conversion and Stewardship (foreign natural wonders). Each type's yields a turn come from
 * the empire's own numbers (`facts`); the caller weighs them by the priority.
 *
 * Pantheon facts: { settlements (each one gets an Altar), production (the cities'), food, influence, farms (farms,
 * pastures, plantations), camps (camps, woodcutters), fishing (fishing boats), mines (mines, clay pits, quarries),
 * resources (resource tiles), quarters, focus }.
 * Belief facts: { settlements, cities, followers (our settlements that will follow: the Missionaries convert our own,
 * research/40 B1), foreign (foreign settlements following ours), specialists (settlements with 3+ specialists),
 * naturalWonders (settlements with one), rural10 / urban10 (settlements with 10+ rural / urban population), treasure
 * (settlements making treasure fleets), distant (Distant Lands settlements), wonders (a wonder an age), focus }.
 */
import { YIELD_KEYS } from './xpl-yields.js';

const BUILDING_SHARE = 0.5;   // city production going into buildings
const WONDER_SHARE = { CULTURE: 0.4 };
const WONDER_SHARE_DEFAULT = 0.15;
const UNIT_SHARE = 0.05;      // ...into soldiers in peace
const SETTLER_SHARE = 0.1;    // ...into settlers
const ALTAR_ADJACENCY = 0.6;  // the share of Altars next to a mountain or natural wonder (Earth Goddess), or water (Sacred Waters)

// A displayed relic: +2 Culture and +2 Happiness where it stands; the culture path counts it (Exploration: 12 relics; Modern:
// 3 culture victory points each, carried over).
export const RELIC = Object.freeze({ YIELD_CULTURE: 2, YIELD_HAPPINESS: 2 });
const RELIC_PATH_CULTURE = 2; // more a relic for the culture focus (its path)

export const PANTHEON_YIELDS = Object.freeze({
    PANTHEON_BONUS_1: (f) => ({ YIELD_DIPLOMACY: 2 * f.settlements }),                                    // City Patron Goddess
    PANTHEON_BONUS_2: (f) => ({ YIELD_HAPPINESS: ALTAR_ADJACENCY * f.settlements }),                      // Earth Goddess
    PANTHEON_BONUS_3: (f) => ({ YIELD_FOOD: 0.1 * f.food }),                                              // Fertility Rites
    PANTHEON_BONUS_4: (f) => ({ YIELD_CULTURE: f.quarters }),                                             // Goddess of Festivals
    PANTHEON_BONUS_5: () => ({}),                                                                         // God of Healing
    PANTHEON_BONUS_6: (f) => ({ YIELD_FOOD: f.farms }),                                                   // Goddess of the Harvest
    PANTHEON_BONUS_7: (f) => ({ YIELD_GOLD: f.camps }),                                                   // God of the Forest
    PANTHEON_BONUS_8: (f) => ({ YIELD_PRODUCTION: 0.1 * f.production * BUILDING_SHARE }),                 // God of the Forge
    PANTHEON_BONUS_9: (f) => ({ YIELD_PRODUCTION: f.fishing }),                                           // God of the Sea
    PANTHEON_BONUS_10: (f) => ({ YIELD_FOOD: f.settlements, YIELD_PRODUCTION: f.settlements, YIELD_GOLD: f.settlements,   // God of the Sun
        YIELD_SCIENCE: f.settlements, YIELD_CULTURE: f.settlements, YIELD_HAPPINESS: f.settlements }),
    PANTHEON_BONUS_11: (f) => ({ YIELD_PRODUCTION: 0.15 * f.production * UNIT_SHARE }),                   // God of War
    PANTHEON_BONUS_12: (f) => ({ YIELD_SCIENCE: f.quarters }),                                            // God of Wisdom
    PANTHEON_BONUS_13: (f) => ({ YIELD_PRODUCTION: 0.1 * f.production * (WONDER_SHARE[f.focus] ?? WONDER_SHARE_DEFAULT) }), // Monument to the Gods
    PANTHEON_BONUS_14: (f) => ({ YIELD_PRODUCTION: 0.1 * f.production * SETTLER_SHARE }),                 // Oral Tradition
    PANTHEON_BONUS_15: (f) => ({ YIELD_HAPPINESS: ALTAR_ADJACENCY * f.settlements }),                     // Sacred Waters
    PANTHEON_BONUS_16: (f) => ({ YIELD_PRODUCTION: f.mines }),                                            // Stone Circles
    PANTHEON_BONUS_17: (f) => ({ YIELD_HAPPINESS: f.resources }),                                         // God of Revelry
    PANTHEON_BONUS_18: (f) => ({ YIELD_DIPLOMACY: 0.25 * 0.5 * (f.influence ?? 0) }),                     // Trickster God
});

const relics = (n, f) => ({ YIELD_CULTURE: n * (RELIC.YIELD_CULTURE + (f.focus === "CULTURE" ? RELIC_PATH_CULTURE : 0)), YIELD_HAPPINESS: n * RELIC.YIELD_HAPPINESS });
const perFollower = (yieldType, foreign, own) => (f) => ({ [yieldType]: foreign * (f.foreign ?? 0) + own * (f.followers ?? 0) });

export const BELIEF_YIELDS = Object.freeze({
    // Founder
    BELIEF_BONUS_30: () => ({ YIELD_SCIENCE: 3, YIELD_CULTURE: 3, YIELD_HAPPINESS: 3, YIELD_DIPLOMACY: 3, YIELD_GOLD: 3 }), // Covenant
    FOUNDER_BELIEF_BONUS_16: (f) => ({ YIELD_PRODUCTION: 4 * (f.followers ?? 0) }),                      // Chesed
    FOUNDER_BELIEF_BONUS_15: (f) => ({ YIELD_FOOD: 6 * (f.followers ?? 0) }),                             // Feed the World
    BELIEF_BONUS_17: perFollower("YIELD_SCIENCE", 4, 1),                                                  // Interfaith Dialogue
    BELIEF_BONUS_20: perFollower("YIELD_GOLD", 4, 1),                                                     // Tithe
    BELIEF_BONUS_21: perFollower("YIELD_CULTURE", 4, 1),                                                  // Holy Ecumene
    BELIEF_BONUS_25: perFollower("YIELD_HAPPINESS", 4, 1),                                                // Vipassana
    FOUNDER_BELIEF_BONUS_13: perFollower("YIELD_DIPLOMACY", 2, 1),                                        // Tikkun Olam
    FOUNDER_BELIEF_BONUS_17: (f) => ({ YIELD_HAPPINESS: 2 * (f.followers ?? 0) }),                        // Salat: the Temple's adjacency
    BELIEF_BONUS_18: (f) => ({ YIELD_SCIENCE: 0.5 * (f.foreign ?? 0), YIELD_CULTURE: 0.5 * (f.foreign ?? 0), YIELD_GOLD: 0.5 * (f.foreign ?? 0) }), // Stewardship
    BELIEF_BONUS_19: (f) => ({ YIELD_SCIENCE: 0.5 * (f.foreign ?? 0), YIELD_CULTURE: 0.5 * (f.foreign ?? 0), YIELD_GOLD: 0.5 * (f.foreign ?? 0) }), // Kami
    BELIEF_BONUS_22: (f) => ({ YIELD_SCIENCE: 0.5 * (f.foreign ?? 0) }),
    BELIEF_BONUS_23: (f) => ({ YIELD_CULTURE: 0.5 * (f.foreign ?? 0) }),
    BELIEF_BONUS_24: (f) => ({ YIELD_GOLD: 0.5 * (f.foreign ?? 0) }),
    BELIEF_BONUS_26: (f) => ({ YIELD_HAPPINESS: 0.5 * (f.foreign ?? 0) }),
    BELIEF_BONUS_27: (f) => ({ YIELD_SCIENCE: 0.5 * (f.foreign ?? 0) }),
    BELIEF_BONUS_28: (f) => ({ YIELD_SCIENCE: 0.5 * (f.foreign ?? 0) }),
    FOUNDER_BELIEF_BONUS_14: (f) => ({ YIELD_DIPLOMACY: 0.5 * (f.foreign ?? 0) }),
    // Reliquary: relics on a settlement's first conversion (ours count: the Missionaries convert them)
    BELIEF_BONUS_33: (f) => relics(Math.max(0, (f.cities ?? 0) - 1), f),                                 // Akhlaq: our cities (the Holy City follows already)
    BELIEF_BONUS_34: (f) => relics(2 * (f.specialists ?? 0), f),                                          // Sukha
    BELIEF_BONUS_35: (f) => relics(2 * (f.naturalWonders ?? 0), f),                                       // Barakah
    BELIEF_BONUS_15: (f) => relics(f.rural10 ?? 0, f),                                                    // Lay Followers
    BELIEF_BONUS_16: (f) => relics(f.urban10 ?? 0, f),                                                    // Ecclesiasticism
    BELIEF_BONUS_14: (f) => relics(2 * (f.treasure ?? 0), f),                                             // Charoen
    BELIEF_BONUS_9: (f) => relics(2 * (f.cityStates ?? 0), f),                                            // Icons (city-states we convert: none yet)
    BELIEF_BONUS_10: () => ({}), BELIEF_BONUS_11: () => ({}), BELIEF_BONUS_12: () => ({}), BELIEF_BONUS_13: () => ({}), BELIEF_BONUS_29: () => ({}),
    // Enhancer
    BELIEF_BONUS_8: (f) => relics(0.5 * (f.cities ?? 0), f),                                             // Sanctum: a relic slot in each city's Temple, half used
    ENHANCER_BELIEF_BONUS_9: (f) => relics(0.5 * (f.cities ?? 0), f),                                    // Parampara: in science buildings
    BELIEF_BONUS_6: (f) => ({ YIELD_PRODUCTION: 0.3 * (f.settlements ?? 0) }),                            // Zeal: fewer Missionaries
    BELIEF_BONUS_31: (f) => ({ YIELD_PRODUCTION: 2 * (f.wonders ?? 0) }),                                 // Divine Inspiration: free Missionaries
    BELIEF_BONUS_1: (f) => ({ YIELD_PRODUCTION: 0.5 * (f.distant ?? 0) }),                                // Conversion: Distant Lands towns
    BELIEF_BONUS_3: () => ({}), BELIEF_BONUS_2: () => ({}), BELIEF_BONUS_4: () => ({}), BELIEF_BONUS_5: () => ({}), BELIEF_BONUS_7: () => ({}),
    BELIEF_BONUS_32: () => ({}), ENHANCER_BELIEF_BONUS_10: (f) => ({ YIELD_GOLD: 0.5 * (f.treasure ?? 0) }),
});

/** A { YIELD_X: n } map weighed by the profile's weights (by YIELD_KEYS index). */
export function weigh(yields, weights) {
    let v = 0;
    for (const [k, n] of Object.entries(yields ?? {})) {
        const i = YIELD_KEYS.indexOf(k);
        if (i >= 0) v += (weights?.[i] ?? 0) * (Number(n) || 0);
    }
    return v;
}

/** A pantheon's worth a turn, or null when not known (another mod's). */
export function pantheonValue(type, facts, weights) {
    const fn = PANTHEON_YIELDS[type];
    return fn ? weigh(fn(facts ?? {}), weights) : null;
}

/** A belief's worth a turn, or null when not known. */
export function beliefValue(type, facts, weights) {
    const fn = BELIEF_YIELDS[type];
    return fn ? weigh(fn(facts ?? {}), weights) : null;
}

/** Types ranked by worth, best first; unknown ones (null) after the known, in their order. */
export function rankByValue(types, valueOf) {
    return (types ?? []).map((t, i) => ({ t, i, v: valueOf(t) }))
        .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity) || a.i - b.i)
        .map((x) => x.t);
}
