// Nuclear weapons (research/42 D; the user, after game 53: "We are not learning nuclear options, not using them to produce
// and use nuclear weapons"; behind «Ядерное оружие», off by default). Game 53: every AI built the Manhattan Project and made
// 2-15 weapons each; we made none. The game's rules (age-modern data, the WMD strike mode): Nuclear Fission unlocks the
// Manhattan Project (a wonder several civilizations may build: one weapon, +3 Innovation), PROJECT_PRODUCE_WMD makes more
// (1,000 production each), and an Aerodrome, Squadron or Carrier Commander with a Bomber or Heavy Bomber based there strikes
// (UNITOPERATION_WMD_STRIKE): blast radius 1 (2 after Operation Ivy), fallout for 10 turns, -50 relationship. Pure: which
// blast to fire.

export const NUKE = Object.freeze({
    WEAPONS_MAX: 2,     // weapons kept in a war at our door
    MIN_UNITS: 3,       // a strike only on this many enemy land units in its blast...
    NEAR: 8,            // ...within this many tiles of one of our settlements (an army attacking us)
    PRODUCE_TURNS: 15,  // a weapon only where it is done within this many turns
    WONDER_TURNS: 25,   // the Manhattan Project only where it is done within this many turns
});

/**
 * Judges one blast by its tiles' facts: each { ours: a unit or a tile of ours, third: a unit or a tile of a player not at war
 * with us, centre: a settlement's centre, enemies: land units of players at war with us }. Never ours, a third party's, nor
 * a settlement (armies only: cities are not targets). @returns { ok, enemies, why }
 */
export function blastVerdict(tiles, minUnits = NUKE.MIN_UNITS) {
    let enemies = 0;
    for (const t of tiles ?? []) {
        if (t.ours) return { ok: false, enemies: 0, why: "ours" };
        if (t.third) return { ok: false, enemies: 0, why: "a third party" };
        if (t.centre) return { ok: false, enemies: 0, why: "a settlement" };
        enemies += Number(t.enemies) || 0;
    }
    return enemies >= minUnits ? { ok: true, enemies, why: null } : { ok: false, enemies, why: "too few" };
}

/** The best of the blasts judged ok: the most enemy units, then the nearest to our settlements. @returns a candidate or null */
export function bestBlast(candidates) {
    return (candidates ?? []).filter((c) => c.verdict?.ok)
        .sort((a, b) => b.verdict.enemies - a.verdict.enemies || (a.near ?? 0) - (b.near ?? 0))[0] ?? null;
}

/**
 * A blast on an enemy city («Ядерные удары по городам», off by default, with «Ядерное оружие»; the user, after game 54:
 * "implement what was not built"): the tiles' facts as blastVerdict's, plus `enemyCentre` (a centre of a player at war with
 * us) and `wasOurs` (a settlement that was ours: we want it back, not burnt). Never ours or a third party's, never a
 * settlement but enemy ones, never one that was ours; at least one enemy centre in it (the target). @returns { ok, cities, enemies, why }
 */
export function cityBlastVerdict(tiles) {
    let cities = 0;
    let enemies = 0;
    for (const t of tiles ?? []) {
        if (t.ours) return { ok: false, cities: 0, enemies: 0, why: "ours" };
        if (t.third) return { ok: false, cities: 0, enemies: 0, why: "a third party" };
        if (t.centre && !t.enemyCentre) return { ok: false, cities: 0, enemies: 0, why: "a settlement not at war" };
        if (t.wasOurs) return { ok: false, cities: 0, enemies: 0, why: "a settlement that was ours" };
        if (t.enemyCentre) cities++;
        enemies += Number(t.enemies) || 0;
    }
    return cities > 0 ? { ok: true, cities, enemies, why: null } : { ok: false, cities: 0, enemies, why: "no enemy city" };
}

/** The best city blast judged ok: the nearest to our settlements (the one that threatens us), then the most units. */
export function bestCityBlast(candidates) {
    return (candidates ?? []).filter((c) => c.verdict?.ok)
        .sort((a, b) => (a.near ?? 0) - (b.near ?? 0) || b.verdict.enemies - a.verdict.enemies)[0] ?? null;
}
