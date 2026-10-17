/**
 * The autopilot's strategy by phase (research/21 §3, decisions in §9): a balanced, growing start,
 * then building toward the victory focus, then everything into it in the final age. Pure: no
 * engine globals.
 *
 *  - GROWTH: Antiquity's first quarter (and while settlements are well below the cap), the start of
 *    Exploration while we re-expand or re-convert: food and production first (decision 7), so towns
 *    and cities grow and later build the focus's buildings faster;
 *  - BUILD:  the focus's buildings, savings for conversions and the path's buildings;
 *  - COMMIT: the final age: the victory itself (science: Launch Pads, banked before Rocketry).
 *
 * The plan narrows what the user allowed, never widens it, and never changes the saved settings
 * (applyStrategy returns an effective copy for the pass).
 */

export const PHASES = Object.freeze(["GROWTH", "BUILD", "COMMIT"]);
const RANK = { GROWTH: 0, BUILD: 1, COMMIT: 2 };

export const GROWTH_ANTIQUITY_FRAC = 0.25;    // commit about 25% into Antiquity (research/20, L5)
export const GROWTH_MAX_FRAC = 0.5;           // below the cap, growth still ends half way through the age
export const GROWTH_EXPLORATION_FRAC = 0.15;  // the new age's re-expansion
// Rocketry must come this many turns before the age's end for Launch Pads and Crewed Space Flight
// Preparation to pay; later, no bank and the Innovation masteries first (research/22 B3, A2).
export const GATE_MARGIN = 10;
export const PADS_MIN = 3;
export const PADS_MAX = 5;                    // Launch Pads in 4-5 cities (research/20; decision 8)

/**
 * The phase this pass. Forward only within an age: a lost settlement does not send BUILD back to
 * GROWTH; a new age starts afresh. @param facts { age, ageFrac, finalAge, settlements, cap, cities,
 * towns } @param previous { phase, age } or null @returns a PHASES value
 */
export function phaseOf(facts, previous = null) {
    if (!facts) return null;
    const frac = Number(facts.ageFrac) || 0;
    const settlements = Number(facts.settlements) || 0;
    const cap = Number(facts.cap) || 0;
    const belowCap = cap > 0 && settlements < cap - 1;
    let phase = "BUILD";
    if (facts.finalAge) phase = "COMMIT";
    else if (facts.age === "AGE_ANTIQUITY" && (frac < GROWTH_ANTIQUITY_FRAC || (belowCap && frac < GROWTH_MAX_FRAC))) phase = "GROWTH";
    else if (facts.age === "AGE_EXPLORATION" && frac < GROWTH_EXPLORATION_FRAC && (belowCap || (Number(facts.towns) || 0) > (Number(facts.cities) || 0) + 1)) phase = "GROWTH";
    if (previous && previous.age === facts.age && RANK[previous.phase] > RANK[phase]) phase = previous.phase;
    return phase;
}

/** The growth profile of a focus (core/xpl-profiles.js GROWTH_*): food and production first. */
export function growthProfile(focus) {
    return { SCIENCE: "GROWTH_SCIENCE", CULTURE: "GROWTH_CULTURE", ECONOMIC: "GROWTH_GOLD" }[focus] ?? "GROWTH_GOLD";
}

/**
 * Will Rocketry come too late to pay (its estimate `gate.eta` beyond the age's turns left − GATE_MARGIN)?
 * Seen in game 7: it came at Modern turn 59 of 61; the bank froze the gold all age and the Innovation
 * masteries waited behind it.
 */
export function gateLate(facts, wasLate = false) {
    const g = facts?.gate;
    if (!g || g.open || !g.known) return false;
    const left = Number(facts.turnsLeft);
    if (!Number.isFinite(left)) return false;
    // Once late, late until the estimate is clearly back in time (research/24 P8: it flickered on every tech pick,
    // the goals going PADS ↔ LEVER at M1, M4, M8, M11).
    return Number(g.eta) > left - GATE_MARGIN - (wasLate ? GATE_HYSTERESIS : 0);
}

const GATE_HYSTERESIS = 4; // turns the estimate must gain before a late gate counts as in time again

/** Launch Pads wanted in the final age with the science focus: one per city, 3 to 5. */
export function padsWanted(cities) {
    return Math.min(PADS_MAX, Math.max(PADS_MIN, Number(cities) || 0));
}

// The table of research/21 §3.3 (focus × phase). GROWTH is the same for every focus but its profile,
// wonders and explorers.
const BUILD = {
    SCIENCE: { reserveTurns: 2, goals: ["CONVERT", "CODEX", "LEVER"], townShare: 0.25, wonders: 1, wonderKind: "INNOVATION", explorers: false, advisorSoldiers: false, militaryBuildings: false, townFocusBias: { URBAN: 6, FARM: 2 } },
    ECONOMIC: { reserveTurns: 2, goals: ["CONVERT", "LEVER"], townShare: 0.5, wonders: 1, wonderKind: "ANY", explorers: false, advisorSoldiers: false, militaryBuildings: false, townFocusBias: { TRADE: 3, MINE: 2 } },
    CULTURE: { reserveTurns: 2, goals: ["CONVERT"], townShare: 0.5, wonders: 2, wonderKind: "ANY", explorers: true, advisorSoldiers: true, militaryBuildings: true, townFocusBias: { RESORT: 3, RELIGIOUS: 2, URBAN: 2 } },
};
const COMMIT = {
    SCIENCE: { reserveTurns: 1, townShare: 0, planBuys: "CITIES", wonders: 1, wonderKind: "INNOVATION", padCitiesNoWonders: true, explorers: false, advisorSoldiers: false, militaryBuildings: false, townFocusBias: { URBAN: 6, FARM: 3 } },
    ECONOMIC: { reserveTurns: 1, goals: ["LEVER", "CONVERT"], townShare: 0.5, wonders: 1, wonderKind: "ANY", explorers: false, advisorSoldiers: false, militaryBuildings: false, townFocusBias: { TRADE: 3, MINE: 2 } },
    CULTURE: { reserveTurns: 1, goals: [], townShare: 0.5, wonders: 3, wonderKind: "ANY", explorers: true, advisorSoldiers: true, militaryBuildings: true, townFocusBias: { RESORT: 4 } },
};

/**
 * The plan for this pass. @param facts strategyFacts (phaseOf's, plus `gate: { open, progress }`)
 * @param focus SCIENCE | ECONOMIC | CULTURE @param options { previous, profile: the focus's profile
 * (profileForFocus), watch } @returns the plan (applyStrategy) or null without a focus
 */
export function planStrategy(facts, focus, { previous = null, profile = null, watch = [] } = {}) {
    if (!focus || !facts) return null;
    return withOverlay(basePlan(facts, focus, { previous, profile }), focus, watch, !!facts.finalAge);
}

/**
 * A rival near another victory (victoryWatch DANGER, a class other than our focus; research/21 §3.4):
 * culture — one more wonder, any kind, each worth more (denied to them), explorers, resort towns;
 * economy — a savings goal for this age's gold buildings (GDP); military — settlers even in the final
 * push (each settlement is points); any — no Future Tech (it advances the age, lowering every
 * multiple: research/20 §0).
 */
function withOverlay(plan, focus, watch, finalAge = false) {
    // The final age: a rival's countdown, even of one turn, decides the score victory (1000 a turn; research/24
    // F1: Alexander's single turn won game 9), and so does ours (F2): act from WATCH, and on our own CHANCE.
    const urgent = (w) => w.cls !== focus && (w.level === "DANGER" || (finalAge && (w.level === "WATCH" || w.level === "CHANCE")));
    const danger = (watch ?? []).filter(urgent);
    if (danger.length === 0) return plan;
    // A culture leader is blocked only by holding `need` ourselves: wonders and the rest are spent only when that is
    // within CULTURE_BLOCK_REACH points (game 16: 97 against about 255, and Dogo Onsen took the capital).
    const acting = danger.filter((w) => w.own || w.cls !== "CULTURE" || cultureBlockable(w));
    const out = { ...plan, noFutureTech: true, overlay: [...new Set(acting.map((w) => w.cls))] };
    if (out.overlay.includes("CULTURE")) {
        // Launch Pad cities stay out of wonders (the science push's best producers).
        Object.assign(out, { wonders: out.wonders + 1, wonderKind: "ANY", denyWonders: true, explorers: true });
        out.townFocusBias = { ...out.townFocusBias, RESORT: Math.max(out.townFocusBias?.RESORT ?? 0, 4) };
    }
    if (out.overlay.includes("ECONOMIC")) out.goals = [...out.goals, "GDP"];
    // Military: settlements are points; the nearest safe site, founded soon (F1: the denial settler walked 7 turns); in the
    // final age a settler with no site founds wherever the game allows (research/31 §3: game 25's settler stood idle 23
    // turns while two more settlements would have stopped Ashoka's countdown). Our own lever is a MILITARY entry here too.
    if (out.overlay.includes("MILITARY")) Object.assign(out, { trainSettlers: true, settleNear: true, settleAnywhere: finalAge });
    // Our own military countdown is within reach of the settlements we may still found (research/26 §3.3): settlers
    // first (the first savings goal, ahead in the queues), Operation Ivy when it closes the gap.
    const lever = danger.find((w) => w.own && w.cls === "MILITARY" && w.settlements !== undefined);
    if (lever) {
        // Past the cap when its room falls short (research/30 §1: one countdown turn is 1000 score).
        Object.assign(out, { militaryLever: true, ivy: !!lever.withIvy, fillCap: true, pastCap: Math.max(0, Number(lever.pastCap) || 0) });
        out.goals = ["SETTLER", ...(out.goals ?? []).filter((g) => g !== "SETTLER")];
    }
    return out;
}

// A culture block is worth wonders only when we are at most this many points short of the score it needs.
export const CULTURE_BLOCK_REACH = 30;

/** Can we hold the score that blocks this culture leader (its `need` within CULTURE_BLOCK_REACH of ours)? Unknown: yes. */
function cultureBlockable(w) {
    const need = Number(w.need);
    const ours = Number(w.ours);
    if (!Number.isFinite(need) || !Number.isFinite(ours)) return true;
    return need - ours <= CULTURE_BLOCK_REACH;
}

function basePlan(facts, focus, { previous = null, profile = null } = {}) {
    const phase = phaseOf(facts, previous);
    const base = {
        phase, age: facts.age, focus,
        profile: profile ?? { SCIENCE: "SCIENCE", ECONOMIC: "GOLD", CULTURE: "CULTURE" }[focus] ?? null,
        reserveTurns: 2, goals: ["CONVERT", "LEVER"], townShare: 0.5, planBuys: "ALL",
        wonders: 1, wonderKind: "ANY", padCitiesNoWonders: false, unitsAheadOfWonders: false,
        explorers: true, trainSettlers: true, upgrades: "THREAT", advisorSoldiers: true, militaryBuildings: true,
        townFocusBias: {}, pads: null, minCities: 0,
    };
    if (phase === "GROWTH") {
        return {
            ...base, profile: growthProfile(focus), reserveTurns: 1, goals: ["CONVERT", "LEVER"], townShare: 0.5,
            wonders: 1, wonderKind: focus === "SCIENCE" ? "INNOVATION" : "ANY", unitsAheadOfWonders: true,
            explorers: focus === "CULTURE", upgrades: "ANY", townFocusBias: { FARM: 2 },
        };
    }
    if (phase === "BUILD") return { ...base, ...BUILD[focus], trainSettlers: true, gate: facts.gate ?? null };
    // The final push fills the settlement cap, nearest safe sites first: each settlement is 4 military points
    // (research/26 §3.3: game 12 stood at 11 of 16 from M30 with sites known, game 11 lost by one countdown turn).
    const plan = {
        ...base, ...COMMIT[focus], trainSettlers: (Number(facts.settlements) || 0) < (Number(facts.cap) || 0),
        fillCap: true, settleNear: true, gate: facts.gate ?? null,
    };
    if (focus === "SCIENCE") {
        plan.pads = padsWanted(facts.cities);
        // Before Rocketry: conversions until a city stands for every pad, and the pads' bank; after: the pads first.
        plan.minCities = plan.pads;
        plan.gateLate = gateLate(facts, !!previous?.gateLate && previous.age === facts.age);
        // The Airfield (Trans-Oceanic Flight, Break the Sound Barrier) is a goal before Rocketry too (research/24 P1:
        // never built nor bought in game 9, 234-795 gold idle with «goal none»).
        plan.goals = facts.gate?.open ? ["PADS", "CONVERT", "AIRFIELD", "LEVER"] : plan.gateLate ? ["CONVERT", "AIRFIELD", "LEVER"] : ["CONVERT", "PADS", "AIRFIELD"];
    }
    return plan;
}

/**
 * The settings this pass runs with: the user's, narrowed by the plan. Numbers (reserve, wonders at
 * once) and the profile are replaced; permissions are AND-ed (explorers, training settlers); the
 * plan's own knobs go under `strategy`. Pure: the input is never changed. No plan: the input itself.
 */
export function applyStrategy(settings, plan) {
    if (!plan) return settings;
    const o = settings?.autopilot ?? {};
    return {
        ...settings,
        profile: plan.profile ?? settings.profile,
        autopilot: {
            ...o,
            reserveTurns: plan.reserveTurns,
            maxWonders: plan.wonders,
            explorers: !!o.explore && plan.explorers,
            trainSettlers: !!o.settlers && plan.trainSettlers,
        },
        strategy: {
            phase: plan.phase, goals: plan.goals, townShare: plan.townShare, planBuys: plan.planBuys,
            wonderKind: plan.wonderKind, padCitiesNoWonders: plan.padCitiesNoWonders, unitsAheadOfWonders: plan.unitsAheadOfWonders,
            upgrades: plan.upgrades, advisorSoldiers: plan.advisorSoldiers, militaryBuildings: plan.militaryBuildings,
            townFocusBias: plan.townFocusBias, pads: plan.pads, minCities: plan.minCities, gate: plan.gate ?? null,
            noFutureTech: !!plan.noFutureTech, denyWonders: !!plan.denyWonders, overlay: plan.overlay ?? [], gateLate: !!plan.gateLate,
            settleNear: !!plan.settleNear, fillCap: !!plan.fillCap, militaryLever: !!plan.militaryLever, ivy: !!plan.ivy,
            pastCap: Number(plan.pastCap) || 0, settleAnywhere: !!plan.settleAnywhere,
        },
    };
}

/**
 * The plan's tooltip lines for the Autopilot tab: [{ key, args }] (LOC_XPL_AP_STRATEGY_TT_*).
 */
export function strategyLines(plan) {
    if (!plan) return [];
    const out = [{ key: "LOC_XPL_AP_STRATEGY_TT_RESERVE", args: [plan.reserveTurns] }];
    out.push({ key: plan.wonderKind === "INNOVATION" ? "LOC_XPL_AP_STRATEGY_TT_WONDERS_INNOVATION" : "LOC_XPL_AP_STRATEGY_TT_WONDERS", args: [plan.wonders] });
    if (plan.phase === "GROWTH") out.push({ key: "LOC_XPL_AP_STRATEGY_TT_GROWTH", args: [] });
    if (!plan.explorers) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_NO_EXPLORERS", args: [] });
    if (!plan.trainSettlers) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_NO_SETTLERS", args: [] });
    else if (plan.fillCap) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_FILL_CAP", args: [] });
    if (plan.militaryLever) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_MILITARY_LEVER", args: [] });
    if (plan.militaryLever && plan.pastCap > 0) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_PAST_CAP", args: [plan.pastCap] });
    if (plan.upgrades === "THREAT") out.push({ key: "LOC_XPL_AP_STRATEGY_TT_UPGRADES_THREAT", args: [] });
    if (!plan.advisorSoldiers) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_PEACE_ARMY", args: [] });
    if (plan.planBuys === "CITIES") out.push({ key: "LOC_XPL_AP_STRATEGY_TT_CITIES_ONLY", args: [] });
    if (plan.pads) out.push({ key: "LOC_XPL_AP_STRATEGY_TT_PADS", args: [plan.pads] });
    for (const cls of plan.overlay ?? []) out.push({ key: `LOC_XPL_AP_STRATEGY_TT_BLOCK_${cls}`, args: [] });
    return out;
}
