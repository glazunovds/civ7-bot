/**
 * Keeping our units alive (game 60, research/game60: three units died on Астрахань's plague tiles at T135-T137, a hurt scout
 * stepped into two Warriors' reach at T96, a Slinger walked past four raiders at T66). Pure: the engine adapter
 * (data/xpl-autopilot-units.js) gives these rules the tiles, the game's paths and the hostile units it sees.
 */

export const PLAGUE = Object.freeze({
    LOOK: 5,           // a unit on a hazardous tile looks this far for a clean one...
    ESCAPE_TURNS: 3,   // ...that it reaches within this many turns...
    PATHS: 12,         // ...asking the game's pathfinder for at most this many ways, the nearest tiles first
    HOSTILE_COST: 30,  // an end-of-turn stop next to a hostile unit: about a fight's damage (research/43: 29.5 a melee blow)
    TURNS_UNKNOWN: 6,  // the hazard's turns left when the game does not say (random-events.xml: a plague outbreak lasts 6)
});

// A hurt unit keeps this far from a hostile village, where its soldiers spawn and gather: the village counts like a hostile
// unit in a step away's gap, and it rests no closer (game 60: a hurt scout cycled 3 tiles from tribe 14's village T73-T95,
// and its last step away took it to 2 tiles from it, where a Warrior killed it).
export const VILLAGE_REST_KEEP = 4;

// A ranged soldier's walk to a post is unsafe when its first end-of-turn stop is next to a land raider, or in reach of this
// many hostile soldiers or more that it and ours next to that stop do not out-number (game 60 T66: a Slinger sent to Тула
// 4 turns away past four raiders was hit on its first step and killed the next turn).
export const WALK = Object.freeze({ REACH_MIN: 2 });

/**
 * The plot a path stops on at the end of each turn: [turn 1's, turn 2's, …] up to its last (the destination). A turn the path
 * makes no step stays on the turn before's stop (`start` on the first turn). `path`: { plots, steps } (steps[i]: the turn
 * plots[i] is reached, as the game's Units.getPathTo gives it).
 */
export function turnStops(path, start = null) {
    const plots = path?.plots ?? [];
    const steps = path?.steps ?? [];
    const out = [];
    plots.forEach((idx, i) => {
        const t = Math.max(1, Number(steps[i]) || 1);
        while (out.length < t - 1) out.push(out.length > 0 ? out[out.length - 1] : start);
        out[t - 1] = idx;
    });
    return out;
}

/**
 * What a way out of a hazard costs: the damage of each end-of-turn stop before its destination, while the hazard there lasts
 * (`hazard(plot, turn)`), and HOSTILE_COST for each stop next to a hostile unit (`hostile(plot)`), the destination too.
 */
export function wayCost(stops, { hazard = () => 0, hostile = () => false } = {}) {
    let cost = 0;
    stops.forEach((plot, i) => {
        if (i < stops.length - 1) cost += Number(hazard(plot, i + 1)) || 0;
        if (hostile(plot)) cost += PLAGUE.HOSTILE_COST;
    });
    return cost;
}

/** The hazard's turns left from the game's durations on a tile: the longest, PLAGUE.TURNS_UNKNOWN for one it does not give. */
export function hazardTurns(durations) {
    let turns = 0;
    for (const d of durations ?? []) turns = Math.max(turns, Number(d) > 0 ? Number(d) : PLAGUE.TURNS_UNKNOWN);
    return turns;
}

/**
 * The ways out of a hazard worth taking, the best first: those costing less than staying (the hazard's damage for each turn
 * it still lasts), the cheapest (wayCost), then the fewest turns, then the lowest score (the nearest, our land, away from the
 * hazard's edge). `options`: [{ cost, turns, score, … }].
 */
export function escapeWays(options, stay) {
    return (options ?? []).filter((o) => o.cost < stay).sort((a, b) => a.cost - b.cost || a.turns - b.turns || a.score - b.score);
}

/** The way out to take (escapeWays' first), or null when none costs less than staying. */
export function escapeChoice(options, stay) {
    return escapeWays(options, stay)[0] ?? null;
}

/**
 * The order of tiles to step away to (after game 60's T96 scout, which stepped to a tile two Warriors reached while one out of
 * every reach was a step further): not next to a hostile land unit, then the fewest hostile units reaching it next turn
 * (ships too), then the widest gap to them (a hurt unit's: hostile villages too), then next to a healthy soldier of ours (its
 * zone of control). `a`, `b`: { adjacent, reach, gap, beside }. @returns < 0 when `a` is the better
 */
export function awayOrder(a, b) {
    return (Number(!!a.adjacent) - Number(!!b.adjacent)) || (a.reach - b.reach) || (b.gap - a.gap) || (Number(!!b.beside) - Number(!!a.beside));
}

/**
 * A ranged soldier's first end-of-turn stop on its walk to a post (WALK): next to a land raider, or in reach of WALK.REACH_MIN
 * or more hostile soldiers that it and `ours` (our soldiers on or next to that stop) do not out-number.
 */
export function stopUnsafe({ nextToRaider = false, reach = 0, ours = 0 } = {}) {
    return !!nextToRaider || (reach >= WALK.REACH_MIN && ours + 1 <= reach);
}
