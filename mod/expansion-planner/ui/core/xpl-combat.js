/**
 * A melee attack's outcome when the game's own prediction (Game.Combat.simulateAttackAsync, the
 * attack preview's) does not answer (probe P1: in game 6 none ever arrived). Pure: no engine globals.
 *
 * Community formula (verify against CombatLog.csv): damage dealt = 30 · e^(0.04 · Δ), taken =
 * 30 · e^(−0.04 · Δ), Δ = our strength − theirs, each strength less 1 per 10 damage. The ±20%
 * spread is taken against us: we deal the low end and take the high end, so an estimate only
 * strikes when the trade is clearly good.
 */

export const COMBAT_BASE = 30;
export const COMBAT_SLOPE = 0.04;
export const COMBAT_SPREAD = 0.2;

/** @param ours { strength, damage } @param theirs { strength, damage } @returns { dealt, taken } */
export function estimateStrike(ours, theirs) {
    const s = (u) => (Number(u?.strength) || 0) - Math.floor((Number(u?.damage) || 0) / 10);
    const delta = s(ours) - s(theirs);
    return {
        dealt: Math.round(COMBAT_BASE * Math.exp(COMBAT_SLOPE * delta) * (1 - COMBAT_SPREAD)),
        taken: Math.round(COMBAT_BASE * Math.exp(-COMBAT_SLOPE * delta) * (1 + COMBAT_SPREAD)),
    };
}
