/**
 * What the game's non-yield effects are worth per turn, as yields (pure module), for the
 * autopilot's choices: policy cards, celebrations, leader attributes, city-state bonuses.
 *
 * Policy Yield Previews (the values of those choices) turns only plain yields into numbers: every
 * effect below comes back as 0 there (research/14, "Choices"), so Elective Republic's +1000
 * Science celebration lost to a little culture, and Literature's +20% production toward science
 * buildings or Public Works' +30% toward projects counted for nothing. Each effect is turned into
 * the yield it brings this pass, from the empire's own numbers (ctx) and rough shares of where
 * production, research and gold go; the caller weighs those yields by the priority.
 *
 * @param effects [{ effect: EffectType, args: { Name: Value } }] (modifiers resolved through
 *        GameInfo.Modifiers → DynamicModifiers, ModifierArguments; attached ones included)
 * @param ctx { focus: "SCIENCE"|"ECONOMIC"|"CULTURE"|null, age, production (cities' production
 *        per turn), science, culture, gold (per turn), masteries (tech masteries completed) }
 * @returns { YIELD_X: n } per turn
 */
import { SCIENCE_PROJECTS } from './xpl-victory-levers.js';

export const LUMP_TURNS = 10;       // a one-off grant counts as this many turns of income
const BUILDING_SHARE = 0.5;         // city production going into buildings
const TAGGED_SHARE = 0.3;           // ...into buildings of the focus's kind (science, gold, culture buildings)
const OTHER_TAGGED_SHARE = 0.1;     // ...into buildings of another kind
const ONE_TYPE_SHARE = 0.05;        // ...into one building type
const OVERBUILD_SHARE = 0.1;        // ...into replacing an older age's buildings
const MASTERY_SHARE = 0.3;          // research (or civics) going into masteries
const PURCHASE_SHARE = 0.5;         // gold spent on buildings
const DEFAULT_MASTERIES = 5;        // masteries completed, when not known
const TAG_OF_FOCUS = { SCIENCE: "SCIENCE", ECONOMIC: "GOLD", CULTURE: "CULTURE" };

/**
 * Production going into projects, and what it is worth against plain production: the science
 * focus runs its Innovation projects, in the Modern age Crewed Space Flight Preparation without
 * end (the victory itself: 15 Innovation per 2000 production), so there it counts double.
 */
export function projectShare(focus, age) {
    if (focus !== "SCIENCE") return { share: 0.05, worth: 1 };
    return age === "AGE_MODERN" ? { share: 0.5, worth: 2 } : { share: 0.15, worth: 1 };
}

function wonderShare(focus) {
    return focus === "CULTURE" ? 0.4 : 0.15;
}

export function effectYields(effects, ctx = {}) {
    const out = {};
    const add = (yieldType, n) => {
        if (!yieldType || !Number.isFinite(n) || n === 0) return;
        out[yieldType] = (out[yieldType] ?? 0) + n;
    };
    const production = Math.max(0, Number(ctx.production) || 0);
    const masteries = Number.isFinite(Number(ctx.masteries)) ? Number(ctx.masteries) : DEFAULT_MASTERIES;
    const projects = projectShare(ctx.focus ?? null, ctx.age ?? null);
    for (const { effect, args = {} } of effects ?? []) {
        const percent = (Number(args.Percent) || 0) / 100;
        switch (effect) {
            case "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION":
                // A named project that earns no Innovation (e.g. a town's conversion) is not ours.
                if (args.ProjectType && !SCIENCE_PROJECTS.includes(args.ProjectType)) break;
                add("YIELD_PRODUCTION", percent * production * projects.share * projects.worth);
                break;
            case "EFFECT_CITY_ADJUST_PROJECT_PRODUCTION_PER_COMPLETED_MASTERY":
                add("YIELD_PRODUCTION", percent * masteries * production * projects.share * projects.worth);
                break;
            case "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION":
            case "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION_PER_SUZERAIN_OF": {
                const share = args.Tag ? (args.Tag === TAG_OF_FOCUS[ctx.focus] ? TAGGED_SHARE : OTHER_TAGGED_SHARE)
                    : args.ConstructibleType ? ONE_TYPE_SHARE : BUILDING_SHARE;
                add("YIELD_PRODUCTION", percent * production * share);
                break;
            }
            case "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION_PER_MASTERY":
                add("YIELD_PRODUCTION", ((Number(args.Amount) || 0) / 100) * masteries * production * BUILDING_SHARE);
                break;
            case "EFFECT_CITY_ADJUST_WONDER_PRODUCTION":
                add("YIELD_PRODUCTION", percent * production * wonderShare(ctx.focus));
                break;
            case "EFFECT_CITY_ADJUST_OVERBUILD_PRODUCTION_MOD":
                add("YIELD_PRODUCTION", percent * production * OVERBUILD_SHARE);
                break;
            case "EFFECT_PLAYER_GRANT_YIELD":
                add(args.YieldType, (Number(args.Amount) || 0) / LUMP_TURNS);
                break;
            case "EFFECT_PLAYER_ADJUST_PROGRESSION_TREE_MASTERY_EFFICIENCY":
                if (args.SystemType === "SYSTEM_TECH") add("YIELD_SCIENCE", percent * (Number(ctx.science) || 0) * MASTERY_SHARE);
                else if (args.SystemType === "SYSTEM_CULTURE") add("YIELD_CULTURE", percent * (Number(ctx.culture) || 0) * MASTERY_SHARE);
                break;
            case "EFFECT_ADJUST_PLAYER_OR_CITY_BUILDING_PURCHASE_EFFICIENCY":
                add("YIELD_GOLD", percent * Math.max(0, Number(ctx.gold) || 0) * PURCHASE_SHARE);
                break;
            default:
                break;
        }
    }
    return out;
}

/**
 * The government to take, by focus and age (research/14 "Choices"): science wants Oligarchy
 * (+10% production toward every building: Libraries, Academies), Plutocracy (overbuilding, the
 * Gold buildings' Science cards) and Elective Republic (specialists +1 Science, Think Tanks, a
 * +1000 Science celebration); economy the same first two, then Bureaucratic Monarchy (cheaper
 * purchases, +1000 Gold); culture Classical Republic, Theocracy, Elective Republic. Military
 * governments come last for every focus (the autopilot never attacks); the rest keep the game's
 * order. Before this, the first government the game allowed was taken: Feudal Monarchy and
 * Authoritarianism in the later ages.
 * @param types the governments the game offers, in its order @returns them ranked
 */
export const GOVERNMENTS_FOR_FOCUS = {
    SCIENCE: ["GOVERNMENT_OLIGARCHY", "GOVERNMENT_PLUTOCRACY", "GOVERNMENT_REVOLUTIONARY_REPUBLIC", "GOVERNMENT_ELECTIVE_REPUBLIC"],
    ECONOMIC: ["GOVERNMENT_OLIGARCHY", "GOVERNMENT_PLUTOCRACY", "GOVERNMENT_BUREAUCRATIC_MONARCHY", "GOVERNMENT_ELECTIVE_REPUBLIC"],
    CULTURE: ["GOVERNMENT_CLASSICAL_REPUBLIC", "GOVERNMENT_THEOCRACY", "GOVERNMENT_ELECTIVE_REPUBLIC"],
    BALANCE: ["GOVERNMENT_CLASSICAL_REPUBLIC", "GOVERNMENT_OLIGARCHY", "GOVERNMENT_PLUTOCRACY", "GOVERNMENT_ELECTIVE_REPUBLIC", "GOVERNMENT_BUREAUCRATIC_MONARCHY"],
};
const MILITARY_GOVERNMENTS = new Set(["GOVERNMENT_DESPOTISM", "GOVERNMENT_FEUDAL_MONARCHY", "GOVERNMENT_AUTHORITARIANISM", "GOVERNMENT_REVOLUTIONARY_AUTHORITARIANISM"]);

export function rankGovernments(types, focus) {
    const wanted = GOVERNMENTS_FOR_FOCUS[focus] ?? GOVERNMENTS_FOR_FOCUS.BALANCE;
    const rank = (t) => {
        const i = wanted.indexOf(t);
        if (i >= 0) return i;
        return MILITARY_GOVERNMENTS.has(t) ? 2000 : 1000;
    };
    return types.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

/** The focus a priority profile serves (the victory focus sets the pass's profile). */
export function focusOfProfile(profile) {
    if (profile === "SCIENCE" || profile === "GROWTH_SCIENCE") return "SCIENCE";
    if (profile === "GOLD" || profile === "GOLD_SCIENCE" || profile === "GROWTH_GOLD") return "ECONOMIC";
    if (profile === "CULTURE" || profile === "GROWTH_CULTURE") return "CULTURE";
    return null;
}
