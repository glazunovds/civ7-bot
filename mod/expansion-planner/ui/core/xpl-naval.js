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
});

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
