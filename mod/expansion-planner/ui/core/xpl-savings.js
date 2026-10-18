/**
 * The gold plan of one autopilot pass (research/21 §4). Pure: no engine globals.
 *
 * The treasury does not change while the pass runs: every purchase step reads the same balance
 * (seen in game 6: a town conversion and a Granary bought in one pass, the Granary refused; two
 * repairs that each "fit" the same gold). So every spend goes through one budget:
 *  - all():     the gold not spent yet (repairs, walls and defenders under threat: they cannot wait);
 *  - forGoal(): above the reserve (the goal's own purchase);
 *  - free():    above the reserve and what the goal holds (everything else);
 *  - townLeft(share): plan purchases in towns (warehouses) take at most `share` of the free gold,
 *    none while a goal waits.
 * A goal is the most important purchase we are saving for (a town conversion, the victory path's
 * next building): while it waits, small purchases do not eat its gold.
 */

export const GOAL_KINDS = Object.freeze(["CONVERT", "CODEX", "LEVER", "PADS", "AIRFIELD", "GDP", "BANK"]);
export const TOWN_SHARE = 0.5;        // towns' plan purchases take at most this share of the free gold
export const GOAL_FAIL_TURNS = 3;     // a goal bought this many turns in a row and still there: the game refuses it...
export const GOAL_COOLDOWN = 5;       // ...dropped for this many turns
export const CONVERT_VERDICTS_PAST_FLOOR = Object.freeze(["CONVERT"]);

/**
 * @param { gold, reserve, spent = 0, bought = Set of "sid|type" }
 * The old `{ bought, spent }` purchases record is a subset of this object, so callers written for
 * it still work.
 */
export function createBudget({ gold = 0, reserve = 0, spent = 0, bought = new Set() } = {}) {
    const b = {
        gold: Number(gold) || 0,
        reserve: Math.max(0, Number(reserve) || 0),
        spent: Number(spent) || 0,
        townSpent: 0,
        bought,
        goal: null,
        entries: [],
        held() {
            return b.goal && !b.goal.done ? b.goal.hold : 0;
        },
        all() {
            return b.gold - b.spent;
        },
        forGoal() {
            return b.gold - b.spent - b.reserve;
        },
        free() {
            return Math.max(0, b.gold - b.spent - b.reserve - b.held());
        },
        /** Gold left for plan purchases in towns: 0 while a goal waits, else `share` of the free gold (what towns spent included). */
        townLeft(share = TOWN_SHARE) {
            if (b.goal && !b.goal.done) return 0;
            return Math.max(0, Math.min(b.free(), share * (b.free() + b.townSpent) - b.townSpent));
        },
        /**
         * @param goal { kind, key, label, cost, hold = cost, holdShare }: `holdShare` caps what a long-term
         * goal holds at that share of the gold above the reserve (the Launch Pad bank: seen in game 7, it
         * held more than the treasury and nothing else was bought for a whole age; research/22 B3).
         */
        setGoal(goal) {
            if (!goal) {
                b.goal = null;
                return null;
            }
            let hold = Math.max(0, Number(goal.hold ?? goal.cost) || 0);
            if (goal.holdShare > 0) hold = Math.min(hold, goal.holdShare * Math.max(0, b.gold - b.spent - b.reserve));
            b.goal = { ...goal, hold: Math.round(hold), done: false };
            return b.goal;
        },
        isGoal(key) {
            return !!b.goal && !b.goal.done && b.goal.key === key;
        },
        /** The gold this purchase may use: the goal's own from forGoal, anything else from free. */
        poolFor(key) {
            return b.isGoal(key) ? b.forGoal() : b.free();
        },
        /**
         * Records a purchase. @param entry { key, kind, label } @param options { goal: it buys the
         * goal, town: a plan purchase in a town (counts against townLeft) }
         */
        spend(cost, entry = {}, { goal = false, town = false } = {}) {
            const c = Math.max(0, Number(cost) || 0);
            b.spent += c;
            if (town) b.townSpent += c;
            if (goal && b.goal) b.goal.done = true;
            if (entry.key && entry.key.includes("|")) b.bought.add(entry.key);
            b.entries.push({ ...entry, cost: Math.round(c) });
            return c;
        },
    };
    return b;
}

/**
 * The goal to save for: the first kind in `order` with a candidate (each kind's best first).
 * @param candidatesByKind { CONVERT: [goal], LEVER: [goal], ... } @param order kinds
 * @param memory goal memory (noteGoalBought) and the turn: goals the game kept refusing are skipped
 */
export function chooseGoal(candidatesByKind, order, { memory = {}, turn = 0, have = Infinity, income = Infinity, turnsLeft = Infinity } = {}) {
    // Nothing the gold cannot cover before the age ends (research/24 G2: a codex building held 432 gold A67-A70);
    // a goal marked `anyHorizon` (a site its project needs) may take longer than GOAL_HORIZON, not past the age.
    const ageEnd = Number.isFinite(Number(turnsLeft)) ? Math.max(0, Number(turnsLeft) - 1) : Infinity;
    for (const kind of order ?? []) {
        for (const c of candidatesByKind?.[kind] ?? []) {
            if (!c || !(Number(c.cost) > 0)) continue;
            if (!goalAllowed(memory, c.key, turn)) continue;
            // A goal sized to what the gold reaches (`sized`: the bank for the next age) is never out of reach; checked again,
            // a rounded gold or income dropped it (game 32: E64-E69 lost the Modern bank to a University goal).
            if (!c.sized && !withinReach(Number(c.hold ?? c.cost), have, income, Math.min(c.anyHorizon ? Infinity : GOAL_HORIZON, ageEnd))) continue;
            return { kind, ...c };
        }
    }
    return null;
}

// A goal more than this many turns of income away is not saved for (research/23 S6: game 8, an Academy goal
// of 504 held all the free gold 17 turns at 2-13 income, a University goal of 836 at −22).
export const GOAL_HORIZON = 12;

/** Can `need` gold be had within `horizon` turns: covered now, or by a positive income soon enough? */
export function withinReach(need, have, income, horizon = GOAL_HORIZON) {
    if (!(need > have)) return true;
    if (!(income > 0)) return false;
    return (need - have) / income <= horizon;
}

/** Was this goal not dropped (bought GOAL_FAIL_TURNS turns in a row and still offered)? */
export function goalAllowed(memory, key, turn) {
    const m = memory?.[key];
    return !(m && Number(m.until) > turn);
}

/**
 * The goal's purchase was sent this turn. Bought on GOAL_FAIL_TURNS turns in a row means the game
 * refuses it (it is still offered): dropped for GOAL_COOLDOWN turns. @returns the new memory
 */
export function noteGoalBought(memory, key, turn) {
    const out = { ...(memory ?? {}) };
    const m = out[key] ?? { attempts: 0, lastTurn: -Infinity, until: -Infinity };
    if (m.lastTurn === turn) return out;
    const attempts = turn - m.lastTurn === 1 ? m.attempts + 1 : 1;
    out[key] = attempts >= GOAL_FAIL_TURNS
        ? { attempts: 0, lastTurn: turn, until: turn + GOAL_COOLDOWN }
        : { attempts, lastTurn: turn, until: m.until };
    // Old entries go (a goal bought long ago).
    for (const [k, v] of Object.entries(out)) if (turn - v.lastTurn > 20 && !(v.until > turn)) delete out[k];
    return out;
}

/**
 * Which towns may become cities (decision 3, research/21 §9): cities and towns 1 to 1 is a floor,
 * not a cap. While towns outnumber cities any town may (the best first); at 1:1 or more cities only
 * a town the Towns tab rates CONVERT on its yields. `minCities` (the strategy: science in the final age
 * wants a city for every Launch Pad) also counts as below the floor, and so does `cityTarget` (the strategy's cities for
 * the age: research/35) while every city stands at or above zero Happiness (`healthy`: the cities we have come first,
 * research/34 §2). @returns { floor, verdicts or null (any) }
 */
export function conversionRule({ cities = 0, towns = 0, minCities = 0, cityTarget = 0, healthy = true, finalAge = false } = {}) {
    if (towns <= 0) return { floor: false, verdicts: [] };
    const target = healthy && cities < cityTarget;
    // `finalAge` (the science focus's final age): towns outnumbering cities is no floor there; a 2,500 conversion makes
    // ~20 production for the rest of the game, a Launch Pad bought with it runs the space work (research/39 §4.6).
    return (towns > cities && !finalAge) || cities < minCities || target ? { floor: true, verdicts: null } : { floor: false, verdicts: CONVERT_VERDICTS_PAST_FLOOR };
}

const VERDICT_RANK = { CONVERT: 0, CONSIDER: 1, WAIT: 2, KEEP: 3 };

// A town founded on a planned CITY site comes first once it has grown this much (research/23 E7: game 8, a
// population-1 town founded that turn, 1000 gold, was converted before a developed one at 850).
export const PLANNED_CITY_MIN_POP = 3;

/**
 * Orders conversion candidates (C1): a town founded on a planned CITY site first, then the Towns
 * tab's verdict; then for science and economy the most production potential (production land
 * makes the better city; research/20 §2), ties by cost; otherwise (culture, no focus) the cheapest.
 * @param rows [{ town: { cost, prodPot }, advice: { verdict }, plannedCity }]
 */
export function rankConversions(rows, focus = null) {
    const byProduction = focus === "SCIENCE" || focus === "ECONOMIC";
    const rank = (r) => (r.plannedCity && (Number(r.town.pop) || 0) >= PLANNED_CITY_MIN_POP ? -1 : VERDICT_RANK[r.advice?.verdict] ?? 4);
    return [...rows].sort((a, b) => rank(a) - rank(b)
        || (byProduction ? conversionValue(b.town) - conversionValue(a.town) : 0)
        || (Number(a.town.cost) || 0) - (Number(b.town.cost) || 0));
}

// The share of a town's production potential a new city counts on (it is reached only over time).
export const PROD_POT_SHARE = 0.5;

/**
 * What a conversion's gold buys (research/39 §4.3): the production the city makes now, or a share of its potential, per
 * gold. Game 32 saved for Liverpool (2 production for 1,425) while Leeds made 11 for 1,087.
 */
export function conversionValue(town) {
    const production = Math.max(Number(town?.prodNow) || 0, PROD_POT_SHARE * (Number(town?.prodPot) || 0));
    return production / Math.max(1, Number(town?.cost) || 0);
}
