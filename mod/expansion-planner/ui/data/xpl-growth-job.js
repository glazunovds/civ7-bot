/**
 * Growth advisor: when a city grows the game asks where the new citizen goes (its
 * INTERFACEMODE_ACQUIRE_TILE mode):
 *  - a rural tile: CityCommands canStart(EXPAND) lists them, with the improvement the
 *    game will build on each (ConstructibleTypes);
 *  - a specialist on an urban tile: city.Workers.GetAllPlacementInfo() gives each tile's
 *    yields and upkeep now and with one more specialist (the game's own numbers).
 * We rank both by the chosen priorities and connect them to the building plan:
 *  - a tile the plan needs and the city does not own yet: claiming it opens the plan;
 *  - a tile the city owns and the plan will build on: an improvement there only lasts
 *    until that building comes (its turn in the plan), so it counts for that share of the
 *    age only.
 * A specialist's food and happiness upkeep is weighted by what the city has to spare
 * (core/xpl-scarcity.js): plenty left -> cheap, running short -> expensive.
 */
import { getProfile } from '../core/xpl-profiles.js';
import { dot, yieldIndex, F, G, H } from '../core/xpl-yields.js';
import { improvementKind } from '../core/xpl-town-focus.js';
import { costValue } from '../core/xpl-scarcity.js';
import { state } from '../services/xpl-state.js';

export const PLAN_TILE_BONUS = 2;    // least weighted value of claiming a tile a planned building needs
export const PLAN_VALUE_SHARE = 0.5; // ... else this share of that building's value per turn (it could also be claimed later)
export const URBAN_SOON_PENALTY = 1; // an improvement on a tile the plan urbanises does not last (no build turn known)
export const URBAN_SOON_FLOOR = 0.1;  // ... with a build turn: value x (turn / turns left), at least this share
// What a town's future Focus adds per improvement of its kind (core/xpl-town-focus.js).
const FOCUS_TILE_VALUE = { FARM: (w) => w[F], MINE: (w) => 2 * w[G] };

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

/** A Yields-$index-ordered array as our yield order. */
function byOurOrder(arr) {
    const out = [0, 0, 0, 0, 0, 0, 0];
    (arr ?? []).forEach((v, i) => {
        const j = yieldIndex(GameInfo.Yields[i]?.YieldType);
        if (j >= 0) out[j] += Number(v) || 0;
    });
    return out;
}

/** idx -> { names, bonus, eta } of the buildings the current plan puts there (eta: earliest build turn, time-aware plans). */
function plannedTiles() {
    const plans = state.get().results.plans;
    const out = new Map();
    out.horizon = plans?.timeAware ? plans.horizon : null;
    for (const p of [...(plans?.placements ?? []), ...(plans?.fillers ?? [])]) {
        const idx = safe(() => GameplayMap.getIndexFromXY(p.x, p.y), -1);
        if (idx < 0) continue;
        if (!out.has(idx)) out.set(idx, { names: [], bonus: 0, eta: null });
        const e = out.get(idx);
        e.names.push(p.name ?? p.type);
        if (out.horizon && Number.isFinite(p.eta)) e.eta = e.eta === null ? p.eta : Math.min(e.eta, p.eta);
        e.bonus += Math.max(PLAN_TILE_BONUS, PLAN_VALUE_SHARE * (Number(p.value) || 0));
    }
    return out;
}

/**
 * Both are on one scale (weighted yields per turn by the profile, a specialist's after
 * the food and happiness it costs), so `choice` says which of the two wins overall.
 * @returns { expand: [{ idx, x, y, score, yields, improvement, planned, owned }], best,
 *            specialists: [{ idx, x, y, gain, yields, upkeep }], bestSpecialist,
 *            choice: "TILE" | "SPECIALIST" | null }
 */
export function growthAdvice(cityID, settings, { focusKind = null } = {}) {
    const city = safe(() => Cities.get(cityID), null);
    if (!city) return null;
    const pid = GameContext.localPlayerID;
    const weights = getProfile(settings.profile).y;
    const planned = plannedTiles();
    const owned = new Set(safe(() => city.getPurchasedPlots(), []) ?? []);
    // What the city has per turn of the two yields specialists cost (their weight depends on it).
    const nets = [NaN, NaN, NaN, NaN, NaN, NaN, NaN];
    nets[F] = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_FOOD), NaN));
    nets[H] = Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), NaN));

    const offer = safe(() => Game.CityCommands.canStart(cityID, CityCommandTypes.EXPAND, {}, false), null);
    const expand = [];
    (offer?.Plots ?? []).forEach((idx, i) => {
        const yields = [0, 0, 0, 0, 0, 0, 0];
        for (const [hash, amount] of safe(() => GameplayMap.getYields(idx, pid), []) ?? []) {
            const j = yieldIndex(GameInfo.Yields.lookup(hash)?.YieldType);
            if (j >= 0) yields[j] += Number(amount) || 0;
        }
        const plan = planned.get(idx);
        const names = plan?.names ?? [];
        const isOwned = owned.has(idx);
        let score = dot(weights, yields);
        let buildTurn = null;
        if (plan && !isOwned) score += plan.bonus;
        else if (plan && plan.eta !== null && planned.horizon) {
            buildTurn = Math.round(plan.eta);
            score *= Math.min(1, Math.max(URBAN_SOON_FLOOR, plan.eta / planned.horizon));
        } else if (plan) score -= URBAN_SOON_PENALTY;
        // A town that will take a Farming or Mining Focus at population 7: what that Focus will
        // add on this tile's improvement (+1 Food per farm-type, +2 Gold per mine-type).
        const improvement = GameInfo.Constructibles.lookup(offer.ConstructibleTypes?.[i])?.ConstructibleType ?? null;
        if (focusKind && improvement && improvementKind(improvement) === focusKind) score += FOCUS_TILE_VALUE[focusKind](weights);
        const loc = GameplayMap.getLocationFromIndex(idx);
        expand.push({
            idx, x: loc.x, y: loc.y, yields, score: Math.round(score * 10) / 10,
            improvement,
            planned: names, owned: isOwned, buildTurn,
        });
    });
    expand.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const specialists = [];
    for (const w of safe(() => city.Workers.GetAllPlacementInfo(), []) ?? []) {
        if (w.IsBlocked || (w.NumWorkers ?? 0) >= (w.MaxWorkers ?? 0)) continue;
        const now = byOurOrder(w.CurrentYields);
        const next = byOurOrder(w.NextYields);
        const yields = next.map((v, i) => v - now[i]);
        const upNow = byOurOrder(w.CurrentMaintenance);
        const upkeep = byOurOrder(w.NextMaintenance).map((v, i) => v - upNow[i]);
        const loc = GameplayMap.getLocationFromIndex(w.PlotIndex);
        specialists.push({ idx: w.PlotIndex, x: loc.x, y: loc.y, yields, upkeep, gain: Math.round((dot(weights, yields) - costValue(weights, upkeep, nets)) * 10) / 10 });
    }
    specialists.sort((a, b) => b.gain - a.gain || a.idx - b.idx);
    const best = expand[0] ?? null;
    const bestSpecialist = specialists[0] ?? null;
    const specialistWins = !!bestSpecialist && bestSpecialist.gain > 0 && (!best || bestSpecialist.gain > best.score);
    return { expand, best, specialists, bestSpecialist, choice: specialistWins ? "SPECIALIST" : best ? "TILE" : null, food: nets[F], happiness: nets[H] };
}
