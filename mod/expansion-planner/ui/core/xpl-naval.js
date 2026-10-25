/**
 * Naval roles (research/37 §8C, Phase 6). Pure: a unit's row of GameInfo.Units, its Unit_Stats row and its tags come in.
 *
 * The land classifier (isMeleeGuard) leaves out anything with a ranged or bombard strength, and it is for land units only.
 * Ships differ: every warship has a RangedCombat, Modern's light ships (Ironclad, Cruiser, Destroyer) are tagged LIGHT and
 * SKIRMISH, not MELEE, and the Mikasa is SIEGE but not RANGED. So a role is read from the data a ship has in common:
 * its domain, core class, formation class, promotion class, its Range and whether it may target land.
 */

export const NAVAL = Object.freeze({
    STRIKE_RADIUS: 6,   // our ships strike hostile units this close to one of our settlements (defence, not conquest)
    GUARDS_MAX: 2,      // warships posted at a settlement ships attack, at most
    POST_MAX_TURNS: 6,  // a warship sails at most this many turns to its post
    SHIPS_MAX: 2,       // warships trained for lasting coastal fronts, ours near them and queued included
    // Ships' reach (research/41 §3): ships killed 29 of the 56 land units we lost in games 30-47, every soldier among them
    // standing within a ship's reach.
    SHIP_MARGIN: 10,    // a land unit standing in a ship's reach survives its shots: its Combat at least the ship's attack less this...
    CLOSE_MARGIN: 5,    // ...or less this against a Range-1 ship, which closes in (game 42: a Privateer killed a Catapult)
    SEVERAL_SHIPS: 1.2, // with two ships or more in reach, their hits add up: its Bombard must beat the strongest hull by this much
    REACH_LOOK: 8,      // ships this close to a tile are looked at (moves 3-4 plus range 1-3)
});

/** A ship's attack on land: its RangedCombat with Range 2 or more, else the larger of its Combat and RangedCombat. */
export function shipAttack(stats) {
    const ranged = Number(stats?.RangedCombat) || 0;
    return (Number(stats?.Range) || 0) >= 2 ? ranged : Math.max(Number(stats?.Combat) || 0, ranged);
}

/**
 * Does a land unit out-gun these ships (research/41 §3)? Its Bombard at least their strongest hull's Combat (× SEVERAL_SHIPS
 * with two or more), and its own Combat no more than SHIP_MARGIN below each one's attack (CLOSE_MARGIN for a Range-1 ship).
 * Game 38: Field Cannons (Bombard 35) sent against Frigates (Combat 45, ranged 50) died; Mortars (55) and Heavy Artillery
 * (60) sink them; Catapults sank Cogs.
 * @param unit the land unit's Unit_Stats row @param ships [Unit_Stats rows] (none: true)
 */
export function outGuns(unit, ships) {
    const list = (ships ?? []).filter(Boolean);
    if (list.length === 0) return true;
    const bombard = Number(unit?.Bombard) || 0;
    const combat = Number(unit?.Combat) || 0;
    const hull = Math.max(...list.map((s) => Number(s.Combat) || 0)) * (list.length >= 2 ? NAVAL.SEVERAL_SHIPS : 1);
    const margin = (s) => ((Number(s.Range) || 0) >= 2 ? NAVAL.SHIP_MARGIN : NAVAL.CLOSE_MARGIN);
    return bombard > 0 && bombard >= hull && list.every((s) => combat >= shipAttack(s) - margin(s));
}

/**
 * Does a land unit out-range these ships: its Range beyond each one's, so it may shoot them from a tile out of their reach
 * (two tiles from water against a Range-1 Galley or Privateer, which must close in)? Against ranged ships out-ranging adds
 * nothing: they move 3-4 and then fire (research/41-notes/air-sea-formations.md A1.4).
 */
export function outRanges(unit, ships) {
    const list = (ships ?? []).filter(Boolean);
    const range = Number(unit?.Range) || 0;
    return list.length === 0 || (range > 0 && list.every((s) => range > Math.max(1, Number(s.Range) || 1)));
}

/** May a land unit be set against these ships: it out-guns them, or out-ranges them (and its post keeps it out of their reach). */
export const fightsShips = (unit, ships) => outGuns(unit, ships) || outRanges(unit, ships);

/**
 * Is a land tile within a ship's reach this coming turn: within its moves plus its range, and within its range of a water
 * tile of its own body of water (a lake ship never reaches the sea coast; a tile 3 from water is out of a Frigate's reach
 * however near the ship stands). We never ask the engine for an enemy unit's reach: the game asks it only for the player's
 * own selected unit (gotcha 75).
 * @param ship { at, moves, range } @param dist (a, b) => hex distance
 * @param shore (tile, range) => a water tile of the ship's own body lies within `range` of the tile
 */
export function inShipReach(tile, ship, dist, shore) {
    const range = Math.max(1, Number(ship?.range) || 1);
    if (!tile || !ship?.at || dist(tile, ship.at) > (Number(ship.moves) || 0) + range) return false;
    return !!shore(tile, range);
}

/**
 * A ship's role: "COMMANDER" (a Fleet Commander), "CARRIER" (a Carrier Commander: its aircraft are the air wing's),
 * "CIVILIAN" (a trade ship, a treasure fleet: no warship), "SUBMARINE" (may not target land: CanTargetLand false),
 * "RANGED" (Range 2 or more: Cog, Frigate, Dreadnought, Battleship, the Mikasa), "SCREEN" (Range 1 or none: Galley,
 * Privateer, Ironclad, Cruiser, Destroyer; close combat, their naval attack). Not a ship: null.
 * @param def a GameInfo.Units row @param stats its Unit_Stats row @param tags [tag strings]
 */
export function navalRole(def, stats = null, tags = []) {
    if (!def || def.Domain !== "DOMAIN_SEA") return null;
    const has = (t) => (tags ?? []).includes(t);
    if (def.PromotionClass === "PROMOTION_CLASS_CARRIER_COMMANDER" || has("UNIT_CLASS_CARRIER_COMMANDER")) return "CARRIER";
    if (def.PromotionClass === "PROMOTION_CLASS_NAVAL_COMMANDER" || has("UNIT_CLASS_FLEET_COMMANDER")) return "COMMANDER";
    if (def.CoreClass !== "CORE_CLASS_MILITARY") return "CIVILIAN";
    if (def.CanTargetLand === false || def.CanTargetLand === "false" || def.CanTargetLand === 0) return "SUBMARINE";
    return (Number(stats?.Range) || 0) >= 2 ? "RANGED" : "SCREEN";
}

/** A warship that fights: a screen, a ranged ship or a submarine. */
export const isWarship = (role) => role === "SCREEN" || role === "RANGED" || role === "SUBMARINE";
