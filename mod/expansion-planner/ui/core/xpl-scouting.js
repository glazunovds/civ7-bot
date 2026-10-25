/**
 * Scouting rules (game 60's review: scouts loop, re-target and stand idle). Pure: no engine globals.
 *
 * Game 60 (Catherine, Standard speed): our two scouts came back to within one tile of where they stood two turns earlier on
 * 31 of 73 moving turns T1-T40 (the AI civilizations' scouts 6-15%), and revealed the least land of ten civilizations by T20.
 *  - A village's sight tile that never shows it: 14 of 16 orders for Шэнле went to 70,11; the scout stood there nine times
 *    and fled every other turn from the guard on the village (SCOUT_VILLAGE and UNIT_AWAY alternated T13-T31 and T120-T139).
 *  - A walking scout switched between a village and a discovery every pass (T1-T12: 62,16 / 68,8 / 62,16 / ...).
 *  - Our own frontier target was a random tile re-drawn every pass.
 *  - Exploration before Shipbuilding: both scouts stood idle every pass from T31 (rough seas forbid the game's exploring).
 */

export const SCOUT = Object.freeze({
    VILLAGE_RETRY_TURNS: 10, // a village no sight tile shows (or one a scout fled from) is left this long
    HIDDEN_RADIUS: 2,        // a frontier tile is worth the hidden tiles this close to it, over 1 + the turns to it...
    HEADING_BONUS: 2,        // ...plus this when it keeps the way the unit went last time (within 60°)...
    CROWD_PENALTY: 3,        // ...less this when another unit's goal lies this close to it
    CROWD_RADIUS: 4,
    PREEMPT_TURNS: 1,        // a walking scout's goal gives way only to a discovery it reaches this turn
    FAR_RADIUS: 25,          // rough seas: a land scout with no frontier near looks this far on its own landmass...
    FAR_TURNS: 12,           // ...walking up to this many turns...
    SLEEP_TURNS: 10,         // ...else it sleeps, woken after this many turns or once the seas are calm
});

/** A frontier tile's worth: the hidden tiles near it over 1 + the turns to it, the heading kept, another unit's goal near. */
export function frontierScore({ hidden = 0, turns = 0, aligned = false, crowded = false } = {}) {
    return (Number(hidden) || 0) / (1 + Math.max(0, Number(turns) || 0)) + (aligned ? SCOUT.HEADING_BONUS : 0) - (crowded ? SCOUT.CROWD_PENALTY : 0);
}

/** Does the step (dx, dy) keep the heading (within 60°)? No heading, or no step: false. */
export function keepsHeading(heading, dx, dy) {
    if (!heading) return false;
    const a = Math.hypot(heading.dx, heading.dy);
    const b = Math.hypot(dx, dy);
    if (!(a > 0) || !(b > 0)) return false;
    return (heading.dx * dx + heading.dy * dy) / (a * b) > 0.5;
}

/** dx from a to b on a map `width` wide that wraps east-west (the shorter way), else the plain difference. */
export function wrapDx(ax, bx, width = 0, wraps = false) {
    let dx = bx - ax;
    if (wraps && width > 0) {
        if (dx > width / 2) dx -= width;
        else if (dx < -width / 2) dx += width;
    }
    return dx;
}

/**
 * What our scouts learned about villages' sight tiles: a tile they stood on while the village stayed unseen (blind: the land
 * between blocks sight, it stays so), a tile a scout fled from (left VILLAGE_RETRY_TURNS), and villages given up for
 * VILLAGE_RETRY_TURNS (every sight tile failed or in danger). Keyed by "x,y" strings.
 */
export function createSightMemory() {
    const tiles = new Map(); // village -> Map tile -> { turn, blind }
    const gaveUp = new Map(); // village -> the turn it was given up
    return {
        fail(village, tile, turn, blind) {
            if (!tiles.has(village)) tiles.set(village, new Map());
            const before = tiles.get(village).get(tile);
            tiles.get(village).set(tile, { turn, blind: !!blind || !!before?.blind });
        },
        failed(village, tile, turn) {
            const f = tiles.get(village)?.get(tile);
            return !!f && (f.blind || (turn - f.turn < SCOUT.VILLAGE_RETRY_TURNS && turn >= f.turn));
        },
        blindCount(village) {
            return [...(tiles.get(village)?.values() ?? [])].filter((f) => f.blind).length;
        },
        giveUp(village, turn) {
            gaveUp.set(village, turn);
        },
        givenUp(village, turn) {
            const t = gaveUp.get(village);
            return t !== undefined && turn - t < SCOUT.VILLAGE_RETRY_TURNS && turn >= t;
        },
        clear() {
            tiles.clear();
            gaveUp.clear();
        },
    };
}
