/**
 * Field operations for the generals' experience (research/41 §6-§7; the user, 21 October, after game 50): hunting the
 * villages we will not befriend, and «Учебная война», a training war on a weak neighbour. Pure: the facts come in as numbers.
 *
 * Experience comes only from fights in a commander's radius, and XP short of a level is lost at every age change (games 48
 * and 50), so a commander levels only where several fights come within one age. Peaceful games gave none.
 */

export const HUNT = {
    REACH: 8,           // a village this close to one of our settlements may be hunted
    STAGE_DIST: 2,      // the staging area: this far from the village
    GATHER_TURNS: 6,    // members are soldiers reaching the staging area within this many turns
    COMMANDER_TURNS: 10, // a general reaching it within this many turns leads it, and the fight waits for it as long (game 54:
                         // Аванти's hunt went without one, the vanguard 8 turns away, and gave no general any XP)
    GATHER_MAX: 6,      // the fight starts after this many turns of gathering with the minimum there
    NEAR_STAGE: 2,      // a member this close to the staging tile has arrived
    MIN_MELEE: 2,       // the force wanted at least: melee soldiers (one disperses the village)...
    MIN_UNITS: 3,       // ...soldiers in all...
    MARGIN: 1,          // ...and this many more than the village's soldiers near it
    MAX_MEMBERS: 5,     // soldiers a hunt takes at most
    STRENGTH_GAP: 5,    // our best soldier no weaker than theirs less this
    ENEMY_RADIUS: 3,    // the village's soldiers this close to it count against us
    MAX_TURNS: 20,      // a hunt's whole life (its general may take COMMANDER_TURNS to come)
    STALL_TURNS: 5,     // a fight with no soldier of theirs gone this long ends
    RETRY_TURNS: 15,    // a village given up waits this long
    HURT: 50,           // a member hurt this much leaves the hunt (it heals or gets out of reach)
    LOSSES: 2,          // members lost with no kill that end it
    SAVE_TURNS: 10,     // a village whose befriending our Influence does not pay for within this many turns is hunted
    HALF_AGE: 0.5,      // past this share of the age a village is hunted, not befriended
};

/**
 * Why a village is hunted, or null when it is not (we will befriend it, or it may not be touched). The user (21 October):
 * "villages that will not be befriended: not enough points, half past the era, or even one another civilization befriends,
 * if that does not cause a war".
 * @param f { cityState (a befriended independent: attacking it is a war on its suzerain), ours (our befriending under way),
 *   others: [relationship name of each other leader befriending it], crisis (an encampment: never befriendable), ageShare,
 *   influence, income (Influence a turn), cost (its befriending's price; 0 unknown) }
 * @returns "CRISIS" | "OTHERS" | "LATE" | "INFLUENCE" | null
 */
export function huntReason({ cityState = false, ours = false, others = [], crisis = false, ageShare = 0, influence = 0, income = 0, cost = 0 } = {}) {
    if (cityState || ours) return null;
    // Another leader befriending it: dispersing costs that leader's favour (−30); not one already Unfriendly or Hostile,
    // whom it could tip into a war.
    if ((others ?? []).some((r) => r === "UNFRIENDLY" || r === "HOSTILE")) return null;
    if (crisis) return "CRISIS";
    if ((others ?? []).length > 0) return "OTHERS";
    if (ageShare >= HUNT.HALF_AGE) return "LATE";
    if (cost > 0 && influence + Math.max(0, income) * HUNT.SAVE_TURNS < cost) return "INFLUENCE";
    return null;
}

/**
 * Is the force enough to start? @param f { melee, units, enemies, ourBest, theirBest } @param rules HUNT or TRAINING
 * @returns { ok, why } (why: what is missing, for UI.log)
 */
export function fieldForce({ melee = 0, units = 0, enemies = 0, ourBest = 0, theirBest = 0 }, rules = HUNT) {
    if (melee < rules.MIN_MELEE) return { ok: false, why: `melee ${melee} of ${rules.MIN_MELEE}` };
    if (units < rules.MIN_UNITS) return { ok: false, why: `soldiers ${units} of ${rules.MIN_UNITS}` };
    if (units < enemies + rules.MARGIN) return { ok: false, why: `soldiers ${units} against ${enemies} (+${rules.MARGIN} wanted)` };
    if (theirBest > 0 && ourBest < theirBest - rules.STRENGTH_GAP) return { ok: false, why: `strength ${ourBest} against ${theirBest}` };
    return { ok: true, why: "" };
}

/**
 * Gathering gives way to the fight when every member has arrived, or after GATHER_MAX turns with the minimum there; its
 * general still on its way is waited for up to COMMANDER_TURNS from the start (the fights are for its XP).
 * @param op { started, stage } @param f { turn, arrived, members, meleeArrived, commanderAway } @param rules HUNT or TRAINING
 */
export function fieldReady(op, { turn, arrived = 0, members = 0, meleeArrived = 0, commanderAway = false }, rules = HUNT) {
    if (op.stage !== "GATHER") return false;
    if (commanderAway && turn - op.started < (rules.COMMANDER_TURNS ?? 0)) return false;
    if (members > 0 && arrived >= members && meleeArrived >= 1) return true;
    return turn - op.started >= rules.GATHER_MAX && arrived >= rules.MIN_UNITS - 1 && meleeArrived >= 1;
}

/**
 * Why a running hunt ends, or null; the first that holds: DONE (the village is gone), BEFRIENDED (it is a friend or a
 * city-state now), OFF (the option), VICTORY (one of ours is near), HOME (a settlement of ours needs the soldiers: raiders
 * of another player, or a damaged centre), LATE (MAX_TURNS), STALL (a fight with no soldier of theirs gone), LOSSES (members
 * lost with no kill), FORCE (too few members left).
 * @param h { started, stage, progressTurn } @param f { turn, gone, befriended, on, victoryNear, homeUnsafe, melee, units, lost, kills }
 */
export function huntEnd(h, f) {
    if (f.gone) return "DONE";
    if (f.befriended) return "BEFRIENDED";
    if (!f.on) return "OFF";
    if (f.victoryNear) return "VICTORY";
    if (f.homeUnsafe) return "HOME";
    if (f.turn - h.started > HUNT.MAX_TURNS) return "LATE";
    if (h.stage === "FIGHT" && f.turn - h.progressTurn > HUNT.STALL_TURNS) return "STALL";
    if ((f.lost ?? 0) >= HUNT.LOSSES && !(f.kills > 0)) return "LOSSES";
    if ((f.melee ?? 0) < 1 || (f.units ?? 0) < 2) return "FORCE";
    return null;
}

// ---- Skirmishes (after game 58) ---------------------------------------------------------------------------------------

/**
 * A hostile village next to our land (the user, after game 58: "the commander stayed in the city instead of moving more units
 * toward the village and constantly fighting, swapping injured units"). Our ranged soldiers stand in range of its soldiers,
 * never next to their melee ones, and shoot every turn, a general's radius over them; a hurt one falls back to heal and a
 * fresh one takes its place. No war to declare (the village is at war with us), no gathering, no end: it runs while no hunt,
 * raider hunt or campaign does. The fight simulator (tests/fight-sim.test.mjs) measures it.
 */
export const SKIRMISH = {
    REACH: 5,           // a hostile village this close to one of our settlements (game 60: Шэнле, 5 tiles from Самара and
                        // Нижний Новгород, the one village near us, was left out at 4 and skirmishStep never ran)...
    GUARD_RADIUS: 3,    // ...its soldiers this close to it are the targets
    SHOOTERS: 3,        // ranged soldiers posted at most
    TURNS: 3,           // a shooter takes a post it reaches within this many turns
    HURT: 40,           // a shooter hurt this much is no shooter (it heals; a fresh one comes)
    COMMANDER_TURNS: 4, // a general reaching the shooters within this many turns stands over them
    EXPOSURE_RADIUS: 3, // a post within this of more than EXPOSURE_MAX of their soldiers is none (the simulator: two attacks
    EXPOSURE_MAX: 1,    // in one turn killed an Archer at full health; with at most one, lost 2.8 soldiers in 20 turns, not 3.6)
    MELEE_NEAR: 2,      // a post with an enemy melee soldier this close counts against it (MELEE_COST each)...
    MELEE_COST: 25,
    WALK_COST: 20,      // ...each turn of walking...
    OUT_OF_RANGE: 50,   // ...and no soldier of theirs within its range (it waits there for them)
    NONE_EVERY: 10,     // with no village to skirmish with, UI.log says why every this many turns
};

// ---- «Охота на рейдеров» (after game 54) -------------------------------------------------------------------------------

/**
 * Raider hunts (the user, after game 54: "will commander chase exp much more aggressively so we can get more level?"): a general
 * and the soldiers the defence leaves free (and those packed in its army) go after hostile soldiers roaming near our land,
 * not only those at a settlement's door. In game 54 each focused attack gave a general 4-8 XP (its first level needs 7), and
 * the generals sat through the turns raiders loitered 4-6 tiles out.
 */
export const RAIDER = {
    REACH: 6,           // a hostile soldier this close to one of our settlements may be hunted...
    FOLLOW: 3,          // ...and followed this far from where it stood last pass
    GATHER_TURNS: 2,    // members: free soldiers reaching it within this many turns...
    COMMANDER_TURNS: 3, // ...and a general within this many: the hunt is for its XP
    MIN_MELEE: 1,
    MIN_UNITS: 2,
    MARGIN: 1,          // our soldiers at least theirs near it plus this
    MAX_MEMBERS: 4,
    STRENGTH_GAP: 5,
    ENEMY_RADIUS: 2,    // their soldiers this close to the one hunted count against us, and are fought
    MAX_TURNS: 6,       // a hunt's whole life
    STALL_TURNS: 3,     // no soldier of theirs gone this long ends it
    RETRY_TURNS: 3,     // that owner's raiders wait this long after a hunt that failed
    HURT: 50,           // a member hurt this much leaves it
    LOSSES: 2,          // members lost with no kill end it
    NEAR_STAGE: 2,
    GATHER_MAX: 0,
    COMMANDER_WAIT: 0,
};

/**
 * Why a raider hunt ends, or null; the first that holds: DONE (no soldier of theirs within FOLLOW of where the one hunted
 * stood), OFF, VICTORY, HOME (a settlement of ours needs its soldiers), FAR (it went beyond REACH + 2 of our settlements:
 * never chased), LATE, STALL, LOSSES, FORCE (no melee member left).
 * @param h { started, progressTurn } @param f { turn, gone, far, on, victoryNear, homeUnsafe, melee, units, lost, kills }
 */
export function raiderEnd(h, f) {
    if (f.gone) return "DONE";
    if (!f.on) return "OFF";
    if (f.victoryNear) return "VICTORY";
    if (f.homeUnsafe) return "HOME";
    if (f.far) return "FAR";
    if (f.turn - h.started > RAIDER.MAX_TURNS) return "LATE";
    if (f.turn - h.progressTurn > RAIDER.STALL_TURNS) return "STALL";
    if ((f.lost ?? 0) >= RAIDER.LOSSES && !(f.kills > 0)) return "LOSSES";
    if ((f.melee ?? 0) < 1 || (f.units ?? 0) < 1) return "FORCE";
    return null;
}

// ---- «Учебная война» (research/41 §7) ---------------------------------------------------------------------------------

export const TRAINING = {
    REACH: 10,           // one of their settlements this close to one of ours
    STAGE_DIST: 3,       // the staging area: this far from their nearest settlement, on our side
    DEPTH: 4,            // the army fights their soldiers within this many tiles of the staging tile, never deeper
    GATHER_TURNS: 8,
    GATHER_MAX: 8,
    COMMANDER_TURNS: 10, // its general, as a hunt's
    NEAR_STAGE: 2,
    MIN_MELEE: 2,
    MIN_UNITS: 4,        // "ready: the vanguard and 4 soldiers or more"
    MARGIN: 0,
    MAX_MEMBERS: 6,
    STRENGTH_GAP: 0,     // their best melee no stronger than ours
    SOLDIER_SHARE: 0.5,  // weak: their land soldiers at most this share of ours...
    PRODUCTION_SHARE: 0.6, // ...their production at most this share of ours...
    WEAK_SOLDIERS: 1 / 3, // ...very weak (denounced up to DENOUNCE_MAX_WEAK times): soldiers at most this share...
    WEAK_PRODUCTION: 0.4, // ...and production at most this share
    AGE_START: 10,       // not an age's first turns...
    AGE_END: 20,         // ...nor its last
    MAX_TURNS: 20,       // a training war's whole life
    HURT: 50,            // a member hurt this much leaves the army (it heals or gets out of reach)
    XP_STALL_TURNS: 5,   // the vanguard's XP not moving this long ends it
    LOSSES: 2,           // units lost with no kill end it
    PROMOTIONS: 1,       // promotions gained that end it
    YIELD_LOSS: 0.1,     // the empire's yields falling this share from the start end it
    SUPPORT_SHARE: 0.5,  // a War Support point bought only for at most this share of the spare Influence
    SUPPORT_POINTS: 2,   // Influence for this many points wanted before declaring
    DENOUNCE_MAX: 2,     // denounced at most this many times...
    DENOUNCE_MAX_WEAK: 4, // ...this many when it is very weak
    DENOUNCE_EVERY: 10,  // turns between two denunciations
    ASK_SUPPORT_GAP: 3,  // the peace deal asks for a settlement when our War Support leads by this much
};

/**
 * Why this leader is no training target now, or null when it is one (research/41 §7A). `need` names what the relationship
 * still needs: "DENOUNCE" while it is Neutral or Unfriendly and may be denounced, else null.
 * @param f { met, atPeace, ally, cityState, relation ("HOSTILE".."HELPFUL"), formalOk, theirSoldiers, ourSoldiers,
 *   theirBest, ourBest, theirProduction, ourProduction, theirSettlements, ourSettlements, distance, thirdAlly,
 *   threatened, otherWar, otherRisk, supportOurs, supportTheirs, influenceSpare, supportPrice, ageTurn, ageTurnsLeft,
 *   ideologyBlock, warsThisAge, outcomeOpen, ownChance, rivalDanger, spaceFinal, ready, readyWhy }
 * @returns { why: string|null, need: "DENOUNCE"|null, weak: boolean, veryWeak: boolean }
 */
export function trainingTarget(f) {
    const veryWeak = f.ourSoldiers > 0 && f.theirSoldiers <= f.ourSoldiers * TRAINING.WEAK_SOLDIERS
        && f.ourProduction > 0 && f.theirProduction <= f.ourProduction * TRAINING.WEAK_PRODUCTION;
    const res = (why, need = null) => ({ why, need, weak: !why || why === "relation", veryWeak });
    if (!f.met) return res("not met");
    if (!f.atPeace) return res("at war already");
    if (f.ally) return res("our ally");
    if (f.cityState) return res("a city-state");
    if (f.thirdAlly) return res("allied with another leader");
    if (!(f.ourSoldiers > 0) || f.theirSoldiers > f.ourSoldiers * TRAINING.SOLDIER_SHARE) return res(`soldiers ${f.theirSoldiers} against our ${f.ourSoldiers}`);
    if (f.theirBest > f.ourBest - TRAINING.STRENGTH_GAP) return res(`best melee ${f.theirBest} against our ${f.ourBest}`);
    if (!(f.ourProduction > 0) || f.theirProduction > f.ourProduction * TRAINING.PRODUCTION_SHARE) return res(`production ${Math.round(f.theirProduction)} against our ${Math.round(f.ourProduction)}`);
    if (f.theirSettlements >= f.ourSettlements) return res(`settlements ${f.theirSettlements} against our ${f.ourSettlements}`);
    if (!(f.distance <= TRAINING.REACH)) return res(`${f.distance} tiles away`);
    if (f.threatened) return res("a settlement of ours is threatened");
    if (f.otherWar) return res("another war");
    if (f.otherRisk) return res("another war risk");
    if (f.ageTurn < TRAINING.AGE_START) return res(`the age's turn ${f.ageTurn}`);
    if (f.ageTurnsLeft < TRAINING.AGE_END) return res(`${f.ageTurnsLeft} turns left in the age`);
    if (f.ideologyBlock) return res("ideologies chosen");
    if (f.warsThisAge > 0) return res("a training war this age already");
    if (!f.outcomeOpen) return res("the game is decided");
    if (f.ownChance) return res("a victory of ours is near");
    if (f.rivalDanger) return res("a rival's victory to block");
    if (f.spaceFinal) return res("the space race's final push");
    if (!f.ready) return res(`not ready (${f.readyWhy ?? "?"})`);
    if (f.relation !== "HOSTILE") return res("relation", f.relation === "NEUTRAL" || f.relation === "UNFRIENDLY" ? "DENOUNCE" : null);
    if (!f.formalOk) return res("no formal war allowed now");
    if (f.supportOurs < f.supportTheirs) return res(`War Support ${f.supportOurs} against ${f.supportTheirs}`);
    if (f.supportPrice > 0 && f.influenceSpare < f.supportPrice * TRAINING.SUPPORT_POINTS) return res(`Influence ${Math.round(f.influenceSpare)} for ${TRAINING.SUPPORT_POINTS} points of ${f.supportPrice}`);
    return res(null);
}

/** May we denounce them now (a relation to bring to Hostile): fewer than the limit, DENOUNCE_EVERY turns apart. */
export function denounceAllowed({ denounced = 0, lastTurn = -Infinity, turn = 0, veryWeak = false }) {
    if (denounced >= (veryWeak ? TRAINING.DENOUNCE_MAX_WEAK : TRAINING.DENOUNCE_MAX)) return false;
    return turn - lastTurn >= TRAINING.DENOUNCE_EVERY;
}

/** A War Support point is bought when theirs reaches ours and its price fits SUPPORT_SHARE of the spare Influence. */
export function supportWanted({ net = 0, price = 0, spare = 0 }) {
    return net <= 0 && price > 0 && price <= TRAINING.SUPPORT_SHARE * spare;
}

/**
 * Why a training war ends, or null (research/41 §7D): OFF (the option), PROMOTED (the vanguard gained its promotion),
 * XP_STALL (its XP did not move for XP_STALL_TURNS while fighting), WEARINESS (a settlement of ours is weary, or their
 * support leads), LOSSES (units lost with no kill), THIRD (a third party joined), HOME (a settlement of ours threatened by
 * another), LATE (MAX_TURNS), YIELDS (the empire's yields fell YIELD_LOSS), PEACE (no war any more).
 * @param w { started, stage, xpTurn } @param f { turn, on, atWar, promotions, weary, supportNet, lost, kills, thirdParty,
 *   homeUnsafe, yields, yieldsStart }
 */
export function trainingEnd(w, f) {
    if (!f.atWar) return "PEACE";
    if (!f.on) return "OFF";
    if ((f.promotions ?? 0) >= TRAINING.PROMOTIONS) return "PROMOTED";
    if (f.weary || (f.supportNet ?? 0) < 0) return "WEARINESS";
    if ((f.lost ?? 0) >= TRAINING.LOSSES && !(f.kills > 0)) return "LOSSES";
    if (f.thirdParty) return "THIRD";
    if (f.homeUnsafe) return "HOME";
    if (f.turn - w.started > TRAINING.MAX_TURNS) return "LATE";
    if (w.stage === "FIGHT" && f.turn - w.xpTurn > TRAINING.XP_STALL_TURNS) return "XP_STALL";
    if (f.yieldsStart > 0 && f.yields < f.yieldsStart * (1 - TRAINING.YIELD_LOSS)) return "YIELDS";
    return null;
}
