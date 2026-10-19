/**
 * Campaigns (research/37 Phase 7, behind «Наступление», off by default): retaking a settlement of ours that another
 * player took in a war it started. Pure module: distances, previews and unit facts come in as numbers.
 *
 * The game's rules (research/37 §9; Civilopedia concepts 210, 216, 1915, 1478): a settlement is taken by occupying its
 * centre and every walled (fortified) district once its health is 0; a melee unit's attack and a ranged or siege unit's
 * shot bring the health down, and a unit moving onto a district at 0 occupies it. Districts heal only while no enemy stands
 * on or next to them and the city was not attacked lately. A settlement of ours retaken is liberated: no unrest.
 */

export const CAMPAIGN = {
    REACH: 10,          // a lost settlement this close to one of ours (tiles) may be retaken
    STAGE_DIST: 3,      // the staging area: this far from the target's centre
    GATHER_TURNS: 8,    // members are soldiers reaching the staging area within this many turns
    GATHER_MAX: 8,      // the assault starts after this many turns of gathering with what came (the minimum at least)
    NEAR_STAGE: 2,      // a member this close to the staging tile has arrived
    MIN_MELEE: 2,       // the force wanted at least: melee soldiers (they take the districts)...
    MIN_UNITS: 3,       // ...soldiers in all...
    MARGIN: 2,          // ...and this many more than the enemy soldiers near the target
    MAX_MEMBERS: 6,     // soldiers a campaign takes at most
    STRENGTH_GAP: 5,    // our best soldier no weaker than theirs less this
    ENEMY_RADIUS: 3,    // enemy soldiers this close to the target count against us
    MAX_TURNS: 25,      // a campaign's whole life
    STALL_TURNS: 5,     // an assault with no progress (health taken or a district occupied) this long ends
    RETRY_TURNS: 10,    // a target given up waits this long
    PEACE_HOLD: 3,      // peace waits while the assault made progress within this many turns...
    PEACE_MAX: 8,       // ...and at most this many turns after the assault began
    KEEP: 0.4,          // a melee attack on a district keeps at least this share of our unit's health
    HURT: 50,           // a member hurt this much leaves the campaign (it heals or gets out of reach)
};

/**
 * Is the force enough to start? @param f { melee, units, enemies, ourBest, theirBest }
 * @returns { ok, why } (why: what is missing, for UI.log)
 */
export function forceEnough({ melee = 0, units = 0, enemies = 0, ourBest = 0, theirBest = 0 }) {
    if (melee < CAMPAIGN.MIN_MELEE) return { ok: false, why: `melee ${melee} of ${CAMPAIGN.MIN_MELEE}` };
    if (units < CAMPAIGN.MIN_UNITS) return { ok: false, why: `soldiers ${units} of ${CAMPAIGN.MIN_UNITS}` };
    if (units < enemies + CAMPAIGN.MARGIN) return { ok: false, why: `soldiers ${units} against ${enemies} (+${CAMPAIGN.MARGIN} wanted)` };
    if (theirBest > 0 && ourBest < theirBest - CAMPAIGN.STRENGTH_GAP) return { ok: false, why: `strength ${ourBest} against ${theirBest}` };
    return { ok: true, why: "" };
}

/**
 * Why a running campaign ends, or null. The first that holds, in this order: DONE (the settlement is ours again), GONE
 * (no longer the enemy's: razed or taken by another), PEACE (no war with its owner), OFF (the checkbox), VICTORY (one of
 * our victories is near: research/37 §9D), LATE (MAX_TURNS), STALL (an assault with no progress), FORCE (too few
 * members left), HOME (a settlement of ours needs them).
 * @param c the campaign { started, stage, progressTurn }
 * @param f { turn, ours, theirs, atWar, offensive, victoryNear, melee, units, homeUnsafe }
 */
export function campaignEnd(c, f) {
    if (f.ours) return "DONE";
    if (!f.theirs) return "GONE";
    if (!f.atWar) return "PEACE";
    if (!f.offensive) return "OFF";
    if (f.victoryNear) return "VICTORY";
    if (f.turn - c.started > CAMPAIGN.MAX_TURNS) return "LATE";
    if (c.stage === "ASSAULT" && f.turn - c.progressTurn > CAMPAIGN.STALL_TURNS) return "STALL";
    if ((f.melee ?? 0) < 1 || (f.units ?? 0) < 2) return "FORCE";
    if (f.homeUnsafe) return "HOME";
    return null;
}

/**
 * Gathering gives way to the assault when every member has arrived, or after GATHER_MAX turns with the minimum there.
 * @param c { started, stage } @param f { turn, arrived, members, meleeArrived }
 */
export function readyToAssault(c, { turn, arrived = 0, members = 0, meleeArrived = 0 }) {
    if (c.stage !== "GATHER") return false;
    if (members > 0 && arrived >= members && meleeArrived >= 1) return true;
    return turn - c.started >= CAMPAIGN.GATHER_MAX && arrived >= CAMPAIGN.MIN_UNITS - 1 && meleeArrived >= 1;
}

/**
 * Peace with this enemy now, or continue briefly (research/37 §9E): only during an assault on its settlement that made
 * progress within PEACE_HOLD turns, and no longer than PEACE_MAX turns after the assault began. Consulted only with
 * «Наступление» on. @returns "CONTINUE" | "SEEK"
 */
export function peaceIntent(c, enemy, turn) {
    if (!c || c.enemy !== enemy || c.stage !== "ASSAULT") return "SEEK";
    if (turn - c.progressTurn > CAMPAIGN.PEACE_HOLD || turn - c.assaultTurn > CAMPAIGN.PEACE_MAX) return "SEEK";
    return "CONTINUE";
}

/**
 * A melee attack on a district, by the game's preview: our unit keeps KEEP of its health, and it brings the district to 0
 * or deals at least what it takes (a district hits back: Civilopedia 228). @returns boolean
 */
export function districtStrikeWorthIt({ ourHealth, ourMax, theirHealth, dealt, taken }) {
    if (!(ourMax > 0) || !(dealt > 0)) return false;
    if (ourHealth - taken < CAMPAIGN.KEEP * ourMax) return false;
    return dealt >= theirHealth || dealt >= taken;
}

/** Did the assault progress? Less health in the districts to take, or more of them ours. */
export const progressed = (before, now) => !!before && !!now && (now.health < before.health || now.taken > before.taken);

// A mobile commander's promotions (research/37 §9B): Initiative (Assault's root: it moves after unpacking), Mobility
// (Maneuver's root: +1 movement on land, terrain ignored while packed), Quartermaster and Regiments (+2 slots, faster
// reinforcement), then Assault's Rout and Storm. Then the defensive order.
export const MOBILE_PROMOTIONS = ["PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_QUARTERMASTER", "PROMOTION_ARMY_REGIMENTS",
    "PROMOTION_ARMY_ROUT", "PROMOTION_ARMY_STORM"];
// Bastion's promotions: a commander that has one is a defender and keeps that profile (research/37 §9F).
export const DEFENSIVE_PROMOTIONS = ["PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_HOLD_THE_LINE", "PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_RESOLUTE",
    "PROMOTION_ARMY_BULWARK", "PROMOTION_ARMY_DEFILADE"];

/**
 * A commander's promotion profile: DEFENSIVE once it took a defensive promotion (a veteran defender keeps its profile;
 * the defensive order reaches Initiative later too); else MOBILE when it leads a campaign or already took a mobile one.
 * @param has (promotion type) -> boolean
 */
export function commanderProfile(has, { leads = false } = {}) {
    if (DEFENSIVE_PROMOTIONS.some(has)) return "DEFENSIVE";
    return leads || MOBILE_PROMOTIONS.some(has) ? "MOBILE" : "DEFENSIVE";
}
