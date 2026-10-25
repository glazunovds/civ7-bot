/**
 * Two generals (research/41 Phase 2; the user, 21 October: "a couple of experienced generals, one of them moves quickly, packs
 * a lot of units, they can move immediately after unpack ... all generals as close to the fight as possible, also escaping as
 * first unit if dangerous or under attack: a valuable asset"). Pure: a commander's promotions come in as `has(type)`.
 *
 * Roles: the VANGUARD (the fast general: Maneuver, Logistics and Assault) and the BASTION (the defender: Bastion, Leadership).
 * A commander's role comes from what it took, so it needs no memory: promotions outlive age changes and defeats
 * (research/41-notes/commanders.md §1.7). An undecided one is the vanguard when no other is.
 */
import { DEFENSIVE_PROMOTIONS } from './xpl-campaign.js';

export const GENERAL = Object.freeze({
    WANTED: 2,          // land commanders wanted: a vanguard and a bastion
    TRAIN_TURNS: 8,     // a second one is trained only where it is done this soon (else bought, or none), at Online speed
                        // (× speedFactor: game 60 at Standard, 300 production, 10-17 turns of the capital: never trained)...
    FIRST_LEVEL_TURNS: 10, // ...and while the age leaves this many more turns (× speedFactor) to reach its first level: XP
                        // short of it is lost at the age change (gotcha 80; game 60's first level took A35-A45 of raids)
    SWITCH_RAIDERS: 3,  // a commander leaves its threatened post for one worth this much more (threatPost), or a damaged centre
    FAR_TURNS: 3,       // ...but a damaged centre further than this many turns away only below FAR_DAMAGED_SHARE of its health
    FAR_DAMAGED_SHARE: 0.75, // (game 60 A90: the general left Тула's fights for Самара, 6 turns away, walled at 171/200)
    FIGHT_MEMORY: 2,    // a settlement where a fight of ours came within this many turns keeps its general (an enemy
                        // commander or a ship our units fight there too: game 60, Тула T89-T98, XP flat at 28/45)
    TURN_COST: 0.5,     // a fight's worth: its raiders, less this for each turn of the walk there (game 54)...
    DAMAGED_WORTH: 3,   // ...and this more while its centre is damaged
    RAIDED_TURNS: 20,   // in peace the vanguard waits at the settlement threatened on most turns of the last this many
    PROMOTION_VALUE: 40, // a free promotion, while a commander still lacks its role's key promotions (weighted yields, a lump)
    XP_RATE_VALUE: 1,   // +10% commander XP, a turn, while a commander fights
    MOVEMENT_VALUE: 2,  // +1 army movement, a turn, while a commander fights
});

// The game speed the turn limits above were tuned at (research/41's games were Online: CostMultiplier 50; Standard is 100).
export const TUNED_COST_MULTIPLIER = 50;

/**
 * The game speed against Online (GameSpeeds CostMultiplier / 50): production costs and the XP a level needs grow with it, a
 * city's yields do not (game 60, Standard: a commander 300 production, levels at 15 / 30 / 45 / 60). 1 when unknown.
 */
export function speedFactor(costMultiplier) {
    const m = Number(costMultiplier);
    return m > 0 ? m / TUNED_COST_MULTIPLIER : 1;
}

/** The turns a second commander may take to train at this speed (GENERAL.TRAIN_TURNS at Online). */
export const commanderTrainTurns = (factor = 1) => Math.round(GENERAL.TRAIN_TURNS * (Number(factor) > 0 ? factor : 1));

/**
 * Does the age leave a commander trained in `trainTurns` the time to reach its first level (FIRST_LEVEL_TURNS × factor more)?
 * `ageTurnsLeft` null or Infinity: no end on the clock.
 */
export function timeForFirstLevel(trainTurns, ageTurnsLeft, factor = 1) {
    if (ageTurnsLeft === null || ageTurnsLeft === undefined || !Number.isFinite(Number(ageTurnsLeft))) return true;
    return Number(ageTurnsLeft) >= (Number(trainTurns) || 0) + GENERAL.FIRST_LEVEL_TURNS * (Number(factor) > 0 ? factor : 1);
}

// The game's experience parameters (GameInfo.GlobalParameters, UI.log's `commander parameters:` line of game 60), used when the
// game does not answer: a melee fight 2 (EXPERIENCE_NOT_COMBAT_RANGED), a ranged one 1, +1 attacking, +2 for a kill; against
// independents only EXPERIENCE_BARB_SOFT_CAP 1 a fight from EXPERIENCE_MAX_BARB_LEVEL 2 on.
export const XP_DEFAULTS = Object.freeze({
    EXPERIENCE_NOT_COMBAT_RANGED: 2, EXPERIENCE_COMBAT_RANGED: 1, EXPERIENCE_COMBAT_ATTACKER_BONUS: 1, EXPERIENCE_KILL_BONUS: 2,
    EXPERIENCE_MAX_BARB_LEVEL: 2, EXPERIENCE_BARB_SOFT_CAP: 1,
});

const param = (params, name) => {
    const v = Number(params?.[name]);
    return Number.isFinite(v) ? v : XP_DEFAULTS[name];
};

/** Does a commander of this level still gain full XP against independents (below EXPERIENCE_MAX_BARB_LEVEL)? */
export const belowIndependentCap = (level, params = XP_DEFAULTS) => (Number(level) || 0) < param(params, "EXPERIENCE_MAX_BARB_LEVEL");

/**
 * The share of a fight's XP a commander of this level gets (W6, game 60: from level 2 its independent fights gave 1 XP each,
 * 48 fights 54 XP, against about 3.4 below): 1 against a major or below the cap, else the soft cap over a melee attack's XP.
 */
export function fightXpShare({ level = 0, independent = false } = {}, params = XP_DEFAULTS) {
    if (!independent || belowIndependentCap(level, params)) return 1;
    const full = param(params, "EXPERIENCE_NOT_COMBAT_RANGED") + param(params, "EXPERIENCE_COMBAT_ATTACKER_BONUS");
    return full > 0 ? Math.min(1, param(params, "EXPERIENCE_BARB_SOFT_CAP") / full) : 1;
}

// The vanguard's way (research/41 §4B): packed speed 4 and terrain ignored, units move after unpacking, +2 slots; then the
// Maneuver tree to its commendation, Assault's attacks, Logistics' rest.
export const VANGUARD_PROMOTIONS = Object.freeze([
    "PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_QUARTERMASTER", "PROMOTION_ARMY_RECRUITMENT",
    "PROMOTION_ARMY_REGIMENTS", "PROMOTION_ARMY_HARASSMENT", "PROMOTION_ARMY_REDEPLOY", "PROMOTION_ARMY_PATHFINDER",
    "PROMOTION_ARMY_AMPHIBIOUS", "PROMOTION_ARMY_AREA_DENIAL", "PROMOTION_ARMY_ROUT", "PROMOTION_ARMY_STORM",
    "PROMOTION_ARMY_SHOCK_TACTICS", "PROMOTION_ARMY_ENFILADE", "PROMOTION_ARMY_ADVANCEMENT", "PROMOTION_ARMY_FIELD_MEDIC",
    "PROMOTION_ARMY_LOOTING", "PROMOTION_ARMY_SURVIVAL_TRAINING",
]);
// Its four that make it the fast general (Quartermaster or Recruitment: either opens Regiments).
const VANGUARD_KEYS = [["PROMOTION_ARMY_MOBILITY"], ["PROMOTION_ARMY_INITIATIVE"], ["PROMOTION_ARMY_QUARTERMASTER", "PROMOTION_ARMY_RECRUITMENT"], ["PROMOTION_ARMY_REGIMENTS"]];
const BASTION_KEYS = [["PROMOTION_ARMY_STEADFAST"], ["PROMOTION_ARMY_HOLD_THE_LINE", "PROMOTION_ARMY_BULWARK"], ["PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_DEFILADE"], ["PROMOTION_ARMY_RESOLUTE"]];
// Merit (+1 radius: more fights give it XP, more units join its focused attacks) first for the vanguard; Order (+5 combat
// strength in its radius) first for the bastion.
export const VANGUARD_COMMENDATIONS = Object.freeze(["PROMOTION_COMMENDATION_ARMY_MERIT", "PROMOTION_COMMENDATION_ARMY_SERVICE",
    "PROMOTION_COMMENDATION_ARMY_ORDER", "PROMOTION_COMMENDATION_ARMY_VALOR", "PROMOTION_COMMENDATION_ARMY_DUTY"]);
export const BASTION_COMMENDATIONS = Object.freeze(["PROMOTION_COMMENDATION_ARMY_ORDER", "PROMOTION_COMMENDATION_ARMY_MERIT",
    "PROMOTION_COMMENDATION_ARMY_SERVICE", "PROMOTION_COMMENDATION_ARMY_VALOR", "PROMOTION_COMMENDATION_ARMY_DUTY"]);

/** A commander's role from what it took: the one with more of its kind (a Hazarapatis starts with Initiative), else null. */
export function roleFromPromotions(has) {
    const v = VANGUARD_PROMOTIONS.filter(has).length;
    const b = DEFENSIVE_PROMOTIONS.filter(has).length;
    if (v === 0 && b === 0) return null;
    return v >= b ? "VANGUARD" : "BASTION";
}

/**
 * Every land commander's role: decided ones by their promotions; of the undecided, the last vanguard (`previous`: its role
 * stays while it took nothing), else the one with the most XP, is the vanguard when no other is, the others bastions.
 * @param list [{ key, has, xp }] @param previous Map(key -> role) of the last call @returns Map(key -> "VANGUARD" | "BASTION")
 */
export function assignRoles(list, previous = null) {
    const roles = new Map();
    for (const c of list ?? []) roles.set(c.key, roleFromPromotions(c.has));
    let vanguard = [...roles.values()].includes("VANGUARD");
    const was = (c) => (previous?.get(c.key) === "VANGUARD" ? 0 : 1);
    const open = (list ?? []).filter((c) => roles.get(c.key) === null)
        .sort((a, b) => was(a) - was(b) || (Number(b.xp) || 0) - (Number(a.xp) || 0) || String(a.key).localeCompare(String(b.key)));
    for (const c of open) {
        roles.set(c.key, vanguard ? "BASTION" : "VANGUARD");
        vanguard = true;
    }
    return roles;
}

/** The role's four key promotions it still lacks (0: it has its way). */
export function keyPromotionsLeft(role, has) {
    return (role === "VANGUARD" ? VANGUARD_KEYS : BASTION_KEYS).filter((any) => !any.some(has)).length;
}

// Leadership's way to its commendation (W2, game 60): Zeal (+5% yields on a district), Field Commission (heal 10, upgrades in
// its radius), Old Guard (+10 defending), Barrage (+5 to a Focus Fire's units), the one tree end that grants its commendation
// by either parent (unit-promotions.xml GrantCommendationWithAnyPrereq; the others' have two rows). Every army tree ends after
// 4 promotions; game 60's only general took Mobility, Initiative and Quartermaster, three trees, and never had a commendation
// (the old order reached its first tree end at the 10th promotion).
export const LEADERSHIP_WAY = Object.freeze(["PROMOTION_ARMY_ZEAL", "PROMOTION_ARMY_FIELD_COMMISSION", "PROMOTION_ARMY_OLD_GUARD", "PROMOTION_ARMY_BARRAGE"]);
// Each role's order: its key promotion first (it decides the role: roleFromPromotions; Leadership decides none), Leadership to
// the first commendation by the 5th promotion (the vanguard's Merit: +1 radius, more fights give it XP; the bastion's Order),
// then the role's way.
export const VANGUARD_ORDER = Object.freeze(["PROMOTION_ARMY_MOBILITY", ...LEADERSHIP_WAY, ...VANGUARD_PROMOTIONS.filter((p) => p !== "PROMOTION_ARMY_MOBILITY")]);
export const BASTION_ORDER = Object.freeze(["PROMOTION_ARMY_STEADFAST", ...LEADERSHIP_WAY, "PROMOTION_ARMY_HOLD_THE_LINE", "PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_RESOLUTE"]);

/** The order a commander of this role takes promotions in: its role's order first, then `base` (the defensive order). */
export function promotionOrder(role, base) {
    const first = role === "VANGUARD" ? VANGUARD_ORDER : BASTION_ORDER;
    return [...first, ...base.filter((p) => !first.includes(p))];
}

/** The order of its commendations. */
export const commendationOrder = (role) => (role === "VANGUARD" ? VANGUARD_COMMENDATIONS : BASTION_COMMENDATIONS);

/**
 * A commander's threatened post (game 48: both commanders kept posts with one raider while Киото, 7 raiders, fell): its own
 * post while that stays threatened, unless another reached in time is worth SWITCH_RAIDERS more or has a damaged centre
 * while its own has not; else the one worth most that no other commander holds, else the one worth most, shared (the
 * user, 21 October: "all generals as close to the fight as possible"). A fight's worth is its raiders (DAMAGED_WORTH more
 * with its centre damaged) less TURN_COST for each turn of the walk there, and `own` is the fight a commander stands at
 * (turns 0) before its post: game 54 (A42-A48), the vanguard walked from Ашшур's fight (4 raiders) toward Имгур-Энлиль's
 * (2, three turns away), escaped back and forth, and both generals arrived where the raiders had already left.
 *
 * A fight's raiders count at the XP they give this general (`xp`: fightXpShare; W6, game 60: from level 2 an independent's
 * fight gave 1 XP). A damaged centre further than FAR_TURNS counts as damaged only below FAR_DAMAGED_SHARE of its health
 * (`health`); a settlement with a fight of ours lately and no raider counted (`fought`, FIGHT_MEMORY) is one raider (W4,
 * game 60 A88-A98: the general walked from Тула, where our Slinger kept shooting an enemy commander, to Самара 6 turns away,
 * walled at 171/200, and its XP stood at 28/45 for 11 turns).
 * @param threats [{ key, count, damaged, health (0-1), reach (bool), taken (bool: another commander's), turns (its walk
 *   there), xp (0-1), fought }]
 * @returns the key or null
 */
export function threatPost(threats, own = null) {
    // A fight only ships make is no general's to share: one may stand there (the centre's fights give it XP), a second gains
    // nothing (game 55: all three generals went to Катана, shelled by one Cog E18-E24, and were hit on and around its centre).
    const list = (threats ?? []).filter((t) => t.reach && !(t.shipsOnly && t.taken));
    const damaged = (t) => !!t.damaged && (!((Number(t.turns) || 0) > GENERAL.FAR_TURNS) || Number(t.health ?? 0) < GENERAL.FAR_DAMAGED_SHARE);
    const worth = (t) => t.count * (t.xp ?? 1) + (damaged(t) ? GENERAL.DAMAGED_WORTH : 0) - GENERAL.TURN_COST * (Number(t.turns) || 0);
    const ranked = [...list].sort((a, b) => worth(b) - worth(a));
    const mine = list.find((t) => t.key === own);
    const best = ranked.find((t) => !t.taken) ?? ranked[0] ?? null;
    if (mine && !(best && best.key !== mine.key && (worth(best) >= worth(mine) + GENERAL.SWITCH_RAIDERS || (damaged(best) && !damaged(mine))))) return mine.key;
    return best?.key ?? null;
}
