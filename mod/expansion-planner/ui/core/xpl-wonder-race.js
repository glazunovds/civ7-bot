/**
 * Wonder race estimate (PLAN.md section 10, phase 2). Pure module.
 *
 * Fair mode uses only what the player can legitimately know: wonders already
 * completed (announced to everyone), rival wonders seen under construction on the
 * map, and how much of the age is left. Omniscient mode (opt-in) also uses rivals'
 * actual build queues.
 *
 * Labels: HIGH (likely ours), MEDIUM, LOW (likely lost), NONE (already built elsewhere).
 */
export const RACE = Object.freeze({
    QUICK_TURNS: 10,  // finishing within this many turns with no rival seen = HIGH
    TIGHT_TURNS: 5,   // a seen rival only matters if we need longer than this
    MARGIN_TURNS: 5,  // omniscient: finishing this many turns before the fastest rival = HIGH
});

export const RACE_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };

/**
 * @param input {
 *   ourTurns: number,              turns for our fastest city (Infinity if we can't build it)
 *   completedElsewhere: boolean,
 *   rivalsSeen: number,            rival constructions seen on the map
 *   rivalTurns: number[] | null,   omniscient: rivals' turns left (null in fair mode)
 *   ageTurnsLeft: number | null,   null in the final age
 * }
 * @returns { label, reasons: [{ key, args }] }
 */
export function raceLabel(input, k = RACE) {
    const reasons = [];
    if (input.completedElsewhere) return { label: "NONE", reasons: [{ key: "LOC_XPL_WONDER_R_BUILT", args: [] }] };
    if (!Number.isFinite(input.ourTurns)) return { label: "LOW", reasons: [{ key: "LOC_XPL_WONDER_R_CANNOT", args: [] }] };
    if (input.ageTurnsLeft != null && input.ourTurns > input.ageTurnsLeft) {
        return { label: "LOW", reasons: [{ key: "LOC_XPL_WONDER_R_AGE_ENDS", args: [input.ourTurns, input.ageTurnsLeft] }] };
    }
    if (input.rivalTurns && input.rivalTurns.length > 0) {
        const fastest = Math.min(...input.rivalTurns);
        reasons.push({ key: "LOC_XPL_WONDER_R_RIVAL_QUEUE", args: [input.rivalTurns.length, fastest] });
        if (fastest <= input.ourTurns) return { label: "LOW", reasons };
        if (fastest <= input.ourTurns + k.MARGIN_TURNS) return { label: "MEDIUM", reasons };
        return { label: "HIGH", reasons };
    }
    if (input.rivalsSeen > 0) {
        reasons.push({ key: "LOC_XPL_WONDER_R_RIVAL_SEEN", args: [input.rivalsSeen] });
        return { label: input.ourTurns <= k.TIGHT_TURNS ? "MEDIUM" : "LOW", reasons };
    }
    if (input.rivalTurns && input.rivalTurns.length === 0) {
        reasons.push({ key: "LOC_XPL_WONDER_R_NO_RIVAL", args: [] });
        return { label: "HIGH", reasons };
    }
    reasons.push({ key: "LOC_XPL_WONDER_R_UNKNOWN", args: [] });
    return { label: input.ourTurns <= k.QUICK_TURNS ? "HIGH" : "MEDIUM", reasons };
}

/** How much a wonder on a tile boosts neighbouring buildings (their "+1 per adjacent wonder" rules). */
export function wonderBoost(neighbourBuildings, rulesByType, isActive) {
    const byYield = [0, 0, 0, 0, 0, 0, 0];
    let buildings = 0;
    for (const type of neighbourBuildings) {
        if (!isActive(type)) continue;
        let boosted = false;
        for (const rule of rulesByType.get(type) ?? []) {
            if (!rule.isWonderRule) continue;
            byYield[rule.yieldIndex] += rule.change / rule.tilesRequired;
            boosted = true;
        }
        if (boosted) buildings++;
    }
    return { byYield, buildings };
}
