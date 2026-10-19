/**
 * Formations for the soldiers already at a threatened settlement (research/37 §6, Phase 4). Pure: no engine globals; the
 * hex distance, a tile's terrain defence and whether a unit reaches a tile this turn come in as functions.
 *
 * planDefence (data/xpl-autopilot-units.js) decides who goes to which settlement and stops once each has enough guards. A
 * formation then improves where those guards stand:
 *   1. a melee unit holds the centre (an empty centre is taken by moving in; the unit on it never leaves);
 *   2. melee units screen each approach: the raiders in sight are split into sectors (raiders within SECTOR_LINK of each
 *      other share one: two opponents through one pass share it, one opponent on opposite sides makes two), and each
 *      sector wants up to SCREEN_MAX melee units next to the centre, between it and that sector;
 *   3. ranged units stand within their range of a raider (or a ship), never next to a land raider, as far back as that
 *      allows;
 *   4. the commander stands where its radius covers the most of them, never next to a land raider.
 * A formation that shuffles fights worse than a still, imperfect one: a unit moves only for a gain of MIN_GAIN or more,
 * after the cost of the fortification it gives up, one move a unit a pass, onto a tile free now that it reaches this turn
 * (so no swap and no chain of moves: a tile left this pass is taken next pass, once the game shows it free).
 */

export const FORM = Object.freeze({
    HOLD: 100,        // a melee unit of ours on the centre
    SCREEN: 50,       // each melee unit screening a sector, up to its need
    SCREEN_MAX: 2,    // a sector's need: one melee unit a raider in it, at most this many
    SECTOR_LINK: 3,   // raiders this close to each other come by one approach
    DEFENCE: 5,       // a point of the tile's terrain defence (forest +2, marsh -2: Features.DefenseModifier)
    FLANK: 15,        // a melee unit next to more than one land raider: each beyond the first can hit it
    IN_RANGE: 60,     // a ranged unit with a raider (or a ship) within its range
    EXPOSED: 40,      // a ranged unit or a commander next to a land raider
    BACK: 5,          // a ranged unit's distance from the nearest land raider, up to its range
    COVER: 20,        // a soldier of ours within the commander's radius
    CENTRE: 5,        // the commander on the centre (a tie goes to the district)
    FORTIFIED: 15,    // a fortified unit gives its fortification up to move
    MIN_GAIN: 20,     // less than this, nobody moves...
    COMMANDER_GAIN: 40, // ...and a commander moves only to cover two more soldiers (game 38: it stepped 14,19 -> 14,20 -> 15,20
                        // -> 14,20 on three turns in a row as the soldiers around it moved, the last for +20)
    COMMANDER_HOLD: 2,  // nor within this many turns of its last formation move
});

/**
 * The approaches: land raiders grouped by single linkage (within `link` of one of the group), largest first, then in
 * the order the raiders came. @param raiders [{ x, y }] @param dist (a, b) => hex distance @returns [[{ x, y }]]
 */
export function sectorsOf(raiders, dist, link = FORM.SECTOR_LINK) {
    const list = [...(raiders ?? [])];
    const group = list.map((_, i) => i);
    const root = (i) => (group[i] === i ? i : (group[i] = root(group[i])));
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            if (dist(list[i], list[j]) <= link) group[root(j)] = root(i);
        }
    }
    const out = new Map();
    list.forEach((r, i) => {
        const k = root(i);
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(r);
    });
    return [...out.values()].sort((a, b) => b.length - a.length);
}

const keyOf = (l) => `${l.x},${l.y}`;
const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

/**
 * The formation's value with each member at `at` (unit key -> tile).
 * @param f { centre, sectors: [[{x,y}]], land: [{x,y}] (land raiders), targets: [{x,y}] (every raider a ranged unit may
 *   shoot: land and ships), members: [{ key, role: "melee" | "ranged", range }], dist, defence(loc) -> terrain modifier }
 */
export function formationValue(f, at) {
    const dist = f.dist;
    const near = (loc, list) => list.reduce((m, h) => Math.min(m, dist(loc, h)), Infinity);
    const adjacent = (loc) => f.land.filter((h) => dist(loc, h) === 1).length;
    let value = 0;
    let held = false;
    const screens = f.sectors.map(() => 0);
    for (const m of f.members) {
        const loc = at.get(m.key);
        if (!loc) continue;
        const terrain = FORM.DEFENCE * (Number(f.defence?.(loc)) || 0);
        if (m.role === "melee") {
            value += terrain - FORM.FLANK * Math.max(0, adjacent(loc) - 1);
            if (same(loc, f.centre)) held = true;
            else if (dist(loc, f.centre) === 1) {
                f.sectors.forEach((s, i) => {
                    if (near(loc, s) < near(f.centre, s)) screens[i]++;
                });
            }
        } else if (m.role === "ranged") {
            const range = Math.max(1, Number(m.range) || 1);
            const inRange = f.targets.some((h) => dist(loc, h) <= range);
            value += terrain + (inRange ? FORM.IN_RANGE : 0) - FORM.EXPOSED * adjacent(loc);
            if (f.land.length > 0) value += FORM.BACK * Math.min(range, near(loc, f.land));
        }
    }
    if (held) value += FORM.HOLD;
    f.sectors.forEach((s, i) => {
        value += FORM.SCREEN * Math.min(Math.min(FORM.SCREEN_MAX, s.length), screens[i]);
    });
    return value;
}

/**
 * The moves that improve the formation, best first, each worth MIN_GAIN after its cost: greedy, one move a unit, onto
 * a tile of `tiles` (free now) no other move takes; a melee unit may take the centre, a ranged one never does; the unit
 * on the centre never moves. Ties go to the shorter step, then the lower tile.
 * @param opts { tiles: [{x,y}], movable: Set(unit key), reach(key, loc) -> bool (this turn, legal), cost(key) -> number }
 * @returns { moves: [{ key, from, to, gain }], at: Map(unit key -> tile after the moves) }
 */
export function planFormation(f, { tiles, movable, reach, cost = () => 0 } = {}) {
    const at = new Map();
    for (const m of f.members) if (m.at) at.set(m.key, m.at);
    const moves = [];
    const taken = new Set();
    const moved = new Set();
    for (let round = 0; round < f.members.length; round++) {
        const now = formationValue(f, at);
        let best = null;
        for (const m of f.members) {
            const from = at.get(m.key);
            if (!from || moved.has(m.key) || !movable?.has(m.key) || same(from, f.centre)) continue;
            const options = [];
            for (const t of tiles ?? []) {
                if (taken.has(keyOf(t)) || same(t, from) || (m.role !== "melee" && same(t, f.centre))) continue;
                at.set(m.key, t);
                const gain = formationValue(f, at) - now - (Number(cost(m.key)) || 0);
                at.set(m.key, from);
                if (gain >= FORM.MIN_GAIN) options.push({ t, gain, step: f.dist(from, t) });
            }
            options.sort((a, b) => b.gain - a.gain || a.step - b.step || a.t.y - b.t.y || a.t.x - b.t.x);
            const pick = options.find((o) => reach(m.key, o.t));
            if (pick && (!best || pick.gain > best.gain)) best = { m, from, ...pick };
        }
        if (!best) break;
        at.set(best.m.key, best.t);
        taken.add(keyOf(best.t));
        moved.add(best.m.key);
        moves.push({ key: best.m.key, from: best.from, to: best.t, gain: best.gain });
    }
    return { moves, at };
}

/**
 * The commander's tile: covering the most soldiers (`soldiers`, their tiles after the formation's moves) within its
 * radius, never onto a tile next to a land raider (research/37 §6B: protected), the centre on a tie; a move only for
 * `minGain` (COMMANDER_GAIN: two more soldiers covered) or more.
 * @param c { at, radius } @param tiles candidate tiles (free for a commander, legal) @returns { to, gain } or null (stay)
 */
export function commanderTile(f, c, soldiers, tiles, reach, minGain = FORM.COMMANDER_GAIN) {
    const dist = f.dist;
    const value = (loc) => FORM.COVER * soldiers.filter((s) => dist(loc, s) <= c.radius).length
        - FORM.EXPOSED * f.land.filter((h) => dist(loc, h) === 1).length + (same(loc, f.centre) ? FORM.CENTRE : 0);
    const now = value(c.at);
    const options = (tiles ?? []).filter((t) => !same(t, c.at) && f.land.every((h) => dist(t, h) > 1))
        .map((t) => ({ to: t, gain: value(t) - now, step: dist(c.at, t) }))
        .filter((o) => o.gain >= minGain)
        .sort((a, b) => b.gain - a.gain || a.step - b.step || a.to.y - b.to.y || a.to.x - b.to.x);
    const pick = options.find((o) => reach(o.to));
    return pick ? { to: pick.to, gain: pick.gain } : null;
}
