/**
 * What research gives beyond yields (research/40 A1): "structural" unlocks, the ones the game's advisor cannot see. It
 * recommends research only for the MILITARY, CULTURE, SCIENCE and ECONOMIC classes (advisory.xml:208-220), so 101 of the
 * 106 Test of Time nodes, every base-game Exploration civilization tree and Irrigation, Entertainment and Globalism (FOOD,
 * HAPPINESS, DIPLOMACY) came last. Game 41: Rome Reborn (800 culture: +1 tradition slot, +1 settlement cap), available
 * from E1, waited until the player picked it at about 87% of Exploration. Pure: the adapter gives each candidate's next
 * unlocks and a function from a modifier id to its effect type.
 */

// A modifier's effect → what it gives for the rest of the age.
export const STRUCTURE_EFFECTS = Object.freeze({
    EFFECT_PLAYER_ADJUST_SETTLEMENT_CAP: "CAP",          // one more settlement without −5 Happiness in every settlement
    EFFECT_PLAYER_GRANT_TRADITION_SLOTS: "SLOT",         // one more card (a tradition slot also takes policies once they are full)
    EFFECT_CITY_ADJUST_WORKER_CAP: "SPECIALIST",         // one more specialist on every tile in every city
    EFFECT_DISTRICT_ADJUST_WORKER_CAP: "SPECIALIST",
    EFFECT_PLAYER_GRANT_SYNCRETIC_CHOICE: "SYNCRETIC",   // a unique quarter or a culture slot (root gotcha 13)
    EFFECT_ADJUST_CITY_LIMIT: "CITY_LIMIT",              // Joseon's and Carthage's city limit
});

// When the game's effect tables do not answer (the test fixtures have none): the modifier's own name.
const STRUCTURE_NAMES = [
    [/SETTLEMENT_CAP_INCREASE/, "CAP"],
    [/TRADITION_SLOT/, "SLOT"],
    [/SPECIALIST_CAP_INCREASE/, "SPECIALIST"],
    [/^MOD_SYNCRETISM$/, "SYNCRETIC"],
];

export const CAP_ROOM = 2;               // a settlement cap counts while we are within this many settlements of it
export const STRUCTURE_MIN_TURNS = 8;    // a structural node this quick always qualifies...
export const STRUCTURE_TURN_SHARE = 2;   // ...else up to this many times the median node's turns

/** The structural gains among a node's next unlocks (TargetTypes). @returns ["CAP" | "SLOT" | …] */
export function structureKinds(targets, effectOf = () => null) {
    const out = [];
    for (const t of targets ?? []) {
        const kind = STRUCTURE_EFFECTS[effectOf(t)] ?? STRUCTURE_NAMES.find(([re]) => re.test(String(t)))?.[1];
        if (kind) out.push(kind);
    }
    return out;
}

/**
 * What these gains are worth (1 a slot, a syncretic choice, a city limit; a settlement cap only while it binds soon,
 * `capRoom` ≤ CAP_ROOM; a specialist cap 1 for the science focus, which lives on specialists (root gotcha 49), else 0.5).
 */
export function structureValue(kinds, { capRoom = Infinity, science = false } = {}) {
    let v = 0;
    for (const k of kinds ?? []) {
        if (k === "CAP") v += capRoom <= CAP_ROOM ? 1 : 0;
        else if (k === "SPECIALIST") v += science ? 1 : 0.5;
        else v += 1;
    }
    return v;
}

// Each Future Tech or Future Civic we complete adds this many age progress points (AGE_PROGRESSION_FUTURE_TECH / _CIVIC,
// HumanOnly: only our own research moves the clock this way; research/40 notes/research-trees.md §3).
export const FUTURE_AGE_POINTS = 10;

/**
 * The turns one Future node takes off the age's end: its points at the age's pace (the points still to come over the turns
 * left). @returns turns, or Infinity when nothing is left
 */
export function futureClockTurns(turnsLeft, pointsLeft) {
    if (!(pointsLeft > 0) || !Number.isFinite(turnsLeft)) return Infinity;
    return turnsLeft * FUTURE_AGE_POINTS / pointsLeft;
}

/**
 * Is the k-th Future node (1 = the next), done `at` turns from now, done before the end it brings nearer with the earlier
 * ones (research/40 A7: in the final age each Future Tech's +3 Innovation also ends the game about 5 turns sooner)?
 */
export function futureInTime(at, k, turnsLeft, perFuture) {
    if (!Number.isFinite(turnsLeft)) return true;
    return at <= turnsLeft - k * perFuture;
}

/**
 * The structural node to research first: the most value per turn among the non-repeatable candidates whose gains count,
 * within max(STRUCTURE_MIN_TURNS, STRUCTURE_TURN_SHARE × the median candidate's turns); ties to the quicker.
 * @param candidates [{ node, nodeType, targets, turns, repeat }] @returns { ...candidate, kinds, value } or null
 */
export function pickStructural(candidates, { capRoom = Infinity, science = false, effectOf = () => null } = {}) {
    const list = (candidates ?? []).filter((c) => !c.repeat);
    const limit = turnLimit(list);
    let best = null;
    for (const c of list) {
        const kinds = structureKinds(c.targets, effectOf);
        const value = structureValue(kinds, { capRoom, science });
        const t = Math.max(1, Number(c.turns) || 99);
        if (value <= 0 || t > limit) continue;
        const score = value / t;
        if (!best || score > best.score || (score === best.score && t < best.t)) best = { ...c, kinds, value, score, t };
    }
    return best;
}

/** The slowest node worth taking ahead of the rest: max(STRUCTURE_MIN_TURNS, STRUCTURE_TURN_SHARE × the median candidate's turns). */
function turnLimit(list) {
    const turns = list.map((c) => Number(c.turns)).filter((t) => t > 0 && t < 99).sort((a, b) => a - b);
    const median = turns.length > 0 ? turns[Math.floor(turns.length / 2)] : STRUCTURE_MIN_TURNS;
    return Math.max(STRUCTURE_MIN_TURNS, STRUCTURE_TURN_SHARE * median);
}

// ---- policy cards a node unlocks ----------------------------------------------------------------------
// The user, game 44 (Exploration T53): Reformation, 2 turns away, unlocks Religious Orders (+32 Culture, +52 Happiness in
// our settlements following our religion, by Policy Yield Previews) and Rationalism (+19 Gold, +10 Science), each worth more
// than the weakest cards slotted. The culture focus walked the main tree toward Future Civic, and Reformation, a branch
// civic the game's advisor never names, came last (E61).

export const SWAP_MIN_GAIN = 2;       // a card swap must win at least this (weighted yield per turn)...
export const SWAP_MIN_SHARE = 0.25;   // ...and this share of the card it takes out
export const CARD_GAIN_MIN = 10;      // a node's new cards must win this much a turn over the cards they replace
export const CARD_USE_TURNS = 5;      // and be slotted at least this many turns before the age ends

/** Is a swap that wins `gain` over a slotted card worth `out` worth making (the policy step's own rule)? */
export function swapWorth(gain, out) {
    return gain >= Math.max(SWAP_MIN_GAIN, SWAP_MIN_SHARE * Math.abs(out));
}

/**
 * What new cards win over the cards they would replace: the best new card against the weakest replaceable one (a free
 * slot counts 0), the next against the next, each pair only when the policy step would make that swap (swapWorth). A
 * tradition card takes only a tradition slot; a policy card a policy slot or a tradition slot (once the policy slots are
 * full, which they are when cards are swapped). Cards of unknown value (null) are neither counted nor replaced.
 * @param cards [{ type, value, slot: "TRADITION" | "POLICY" }] @param slotted the same, the cards in use
 * @param free { TRADITION, POLICY } free slots @returns { gain, pairs: [{ card, out }] } (`out.type` null: a free slot)
 */
export function cardSwapGain(cards, slotted, free = {}) {
    const known = (c) => c.value !== null && c.value !== undefined && Number.isFinite(Number(c.value));
    const pool = [
        ...(slotted ?? []).filter(known),
        ...Array.from({ length: free.TRADITION ?? 0 }, () => ({ type: null, value: 0, slot: "TRADITION" })),
        ...Array.from({ length: free.POLICY ?? 0 }, () => ({ type: null, value: 0, slot: "POLICY" })),
    ].sort((a, b) => a.value - b.value);
    const used = new Set();
    const pairs = [];
    let gain = 0;
    for (const card of (cards ?? []).filter(known).sort((a, b) => b.value - a.value)) {
        const i = pool.findIndex((s, j) => !used.has(j) && (card.slot === "POLICY" || s.slot === "TRADITION"));
        if (i < 0) continue;
        const out = pool[i];
        const g = card.value - out.value;
        if (!(g > 0) || (out.type !== null && !swapWorth(g, out.value))) continue;
        used.add(i);
        pairs.push({ card, out });
        gain += g;
    }
    return { gain, pairs };
}

/**
 * The node whose new cards win the most a turn of research: at least CARD_GAIN_MIN over the cards they replace
 * (`gainOf`: cardSwapGain of its next unlocks, null when it unlocks no card), within the structural limit
 * (turnLimit), done CARD_USE_TURNS before the age ends (`turnsLeft`); repeatable nodes never; ties to the quicker.
 * @param candidates [{ node, nodeType, targets, turns, repeat }] @returns { ...candidate, gain, pairs, t } or null
 */
export function pickCardResearch(candidates, gainOf, { turnsLeft = Infinity } = {}) {
    const list = (candidates ?? []).filter((c) => !c.repeat);
    const limit = turnLimit(list);
    let best = null;
    for (const c of list) {
        const t = Math.max(1, Number(c.turns) || 99);
        if (t > limit || turnsLeft - t < CARD_USE_TURNS) continue;
        const r = gainOf(c);
        if (!r || !(r.gain >= CARD_GAIN_MIN)) continue;
        const score = r.gain / t;
        if (!best || score > best.score || (score === best.score && t < best.t)) best = { ...c, gain: r.gain, pairs: r.pairs, score, t };
    }
    return best;
}
