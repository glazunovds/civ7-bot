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
    SLOW_TURNS: 15,   // ...beyond this LOW whatever the rivals (research/24 P5: two wonders at 29-30 turns, both lost)
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
    const r = rawRaceLabel(input, k);
    // A long build is a race lost to someone we have not seen (research/24 P5: Wat Xieng Thong and Serpent Mound at
    // 29-30 turns in 8-12 production, both lost): HIGH only within QUICK_TURNS, MEDIUM within SLOW_TURNS.
    if (r.label !== "HIGH" && r.label !== "MEDIUM") return r;
    if (input.ourTurns > k.SLOW_TURNS) return { label: "LOW", reasons: [...r.reasons, { key: "LOC_XPL_WONDER_R_SLOW", args: [input.ourTurns] }] };
    if (input.ourTurns > k.QUICK_TURNS && r.label === "HIGH") return { label: "MEDIUM", reasons: r.reasons };
    return r;
}

function rawRaceLabel(input, k) {
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

/**
 * A race already lost while we build the wonder (research/27 §6): a rival building it now finishes before us (its
 * turns left: omniscient mode), or it cannot be done before the age ends.
 * @returns "RIVAL_AHEAD" | "AGE_ENDS" | null
 */
export function raceLost({ ourTurns, rivalTurns, ageTurnsLeft }) {
    if (!Number.isFinite(ourTurns)) return null;
    if (ageTurnsLeft != null && ourTurns > ageTurnsLeft) return "AGE_ENDS";
    if (rivalTurns?.length && Math.min(...rivalTurns) < ourTurns) return "RIVAL_AHEAD";
    return null;
}

/**
 * Which building should take production that would otherwise be lost (all of it up to its cost): the one that
 * keeps the most, the earlier on ties (the plan's order). Used for a lost wonder's progress (moved ahead of it)
 * and for its refund (standing right behind it).
 * @param candidates [{ cost, ... }]  @returns the best candidate with `keeps`, or null
 */
export function bestAbsorber(candidates, amount) {
    let best = null;
    for (const c of candidates) {
        const keeps = Math.min(Number(c.cost) || 0, amount);
        if (keeps > 0 && (!best || keeps > best.keeps + 0.5)) best = { ...c, keeps };
    }
    return best;
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
