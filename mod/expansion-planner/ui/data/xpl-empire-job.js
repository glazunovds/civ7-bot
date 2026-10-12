/**
 * Empire overview and the food network.
 *
 * Food network (the game's own rule, city-details model-city-details.js):
 *  - a town sends food while it has a Focus (Growth.growthType == PROJECT) other than a
 *    project that trains units (Project_Units);
 *  - it sends town.getSentFoodPerCity() to each connected settlement that is a city
 *    (city.getConnectedCities() lists towns too);
 *  - a town with a Focus and no connected city sends its food nowhere.
 * Overview: one row per settlement with population, growth, yields, what a city is
 * strongest at, a town's Focus (current and recommended), food sent or received, and
 * what is left of the current building plan there.
 */
import { FOCUS_PROJECTS } from '../core/xpl-town-focus.js';
import { runTownAdvisor } from './xpl-town-job.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

const ROLE_YIELDS = ["YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_GOLD", "YIELD_PRODUCTION", "YIELD_FOOD", "YIELD_HAPPINESS"];
const SHOWN_YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"];

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const keyOf = (c) => `${c.location.x}-${c.location.y}`;

/** "FARM" | "MINE" | ... | "OTHER" for a Focus project type, null for none (Growing). */
export function focusKeyOf(projectType) {
    if (!projectType) return null;
    for (const [key, projects] of Object.entries(FOCUS_PROJECTS)) if (projects.includes(projectType)) return key;
    return "OTHER";
}

/** The town's Focus project type, or null while it is Growing. */
function focusProjectOf(town) {
    if (safe(() => town.Growth.growthType, null) !== GrowthTypes.PROJECT) return null;
    return safe(() => GameInfo.Projects.lookup(town.Growth.projectType)?.ProjectType, null) ?? "UNKNOWN";
}

/**
 * @returns { towns: [{ key, name, x, y, idx, plots, focus, focusKey, exporting, sentPerCity, to: [cityKey] }],
 *            cities: [{ key, name, x, y, idx, plots, received, from: [townKey] }],
 *            links: [{ from, to, amount, fromIdx, toIdx }] }
 */
export function foodNetwork() {
    const pid = GameContext.localPlayerID;
    const all = safe(() => Players.get(pid).Cities.getCities(), []) ?? [];
    const unitProjects = new Set();
    for (const row of GameInfo.Project_Units ?? []) unitProjects.add(row.ProjectType);
    const towns = [];
    const cities = new Map();
    for (const c of all) {
        const base = { key: keyOf(c), name: safe(() => Locale.compose(c.name), String(c.name)), x: c.location.x, y: c.location.y, idx: GameplayMap.getIndexFromXY(c.location.x, c.location.y), plots: safe(() => c.getPurchasedPlots(), []) ?? [] };
        if (c.isTown) towns.push({ ...base, city: c });
        else cities.set(base.key, { ...base, received: 0, from: [] });
    }
    const links = [];
    for (const t of towns) {
        const c = t.city;
        delete t.city;
        t.focus = focusProjectOf(c);
        t.focusKey = focusKeyOf(t.focus);
        t.exporting = !!t.focus && !unitProjects.has(t.focus);
        t.sentPerCity = Number(safe(() => c.getSentFoodPerCity(), 0)) || 0;
        t.to = [];
        for (const id of safe(() => c.getConnectedCities(), []) ?? []) {
            const other = safe(() => Cities.get(id), null);
            if (!other || other.isTown) continue;
            const target = cities.get(keyOf(other));
            if (!target) continue;
            t.to.push(target.key);
            if (t.exporting) {
                target.received += t.sentPerCity;
                target.from.push(t.key);
                links.push({ from: t.key, to: target.key, amount: t.sentPerCity, fromIdx: t.idx, toIdx: target.idx });
            }
        }
    }
    return { towns, cities: [...cities.values()], links };
}

function netYields(c) {
    const out = {};
    for (const y of SHOWN_YIELDS) out[y] = Math.round((Number(safe(() => c.Yields.getNetYield(YieldTypes[y]), 0)) || 0) * 10) / 10;
    return out;
}

/** What each city is strongest at: the yield where it stands furthest above the empire's average city. */
function cityRoles(rows) {
    const cities = rows.filter((r) => !r.isTown);
    const mean = {};
    for (const y of ROLE_YIELDS) mean[y] = cities.reduce((s, r) => s + Math.max(0, r.yields[y]), 0) / Math.max(1, cities.length);
    for (const r of cities) {
        let best = null;
        let bestRatio = 0;
        for (const y of ROLE_YIELDS) {
            const ratio = mean[y] > 0 ? r.yields[y] / mean[y] : 0;
            if (ratio > bestRatio) {
                best = y;
                bestRatio = ratio;
            }
        }
        r.strongest = cities.length > 1 && bestRatio >= 1.15 ? best : null;
    }
}

/** What is left of the current building plan in each settlement: key -> { left, next: { name, eta } }. */
function planLeft() {
    const plans = state.get().results.plans;
    const out = new Map();
    for (const p of plans?.placements ?? []) {
        const key = p.sid?.replace(/^[cp]:/, "");
        if (!key) continue;
        if (!out.has(key)) out.set(key, { left: 0, next: null });
        const e = out.get(key);
        e.left++;
        if (!e.next || (p.eta ?? 0) < e.next.eta) e.next = { name: p.name, eta: p.eta ?? 0 };
    }
    return { byKey: out, timeAware: !!plans?.timeAware, targetName: plans?.targetName ?? null };
}

export function runEmpireOverview(settings) {
    const started = Date.now();
    const pid = GameContext.localPlayerID;
    const all = safe(() => Players.get(pid).Cities.getCities(), []) ?? [];
    const network = foodNetwork();
    const townAdvice = new Map();
    try {
        for (const r of runTownAdvisor(settings).rows) townAdvice.set(`${r.town.x}-${r.town.y}`, r);
    } catch (error) {
        log.debug("empire: town advice failed", error);
    }
    const plan = planLeft();
    const townByKey = new Map(network.towns.map((t) => [t.key, t]));
    const cityByKey = new Map(network.cities.map((c) => [c.key, c]));
    const rows = all.map((c) => {
        const key = keyOf(c);
        const row = {
            key,
            name: safe(() => Locale.compose(c.name), String(c.name)),
            x: c.location.x,
            y: c.location.y,
            isTown: !!c.isTown,
            isCapital: !!safe(() => c.isCapital, false),
            pop: c.population ?? 0,
            turnsToGrow: Number(safe(() => c.Growth.turnsUntilGrowth, -1)),
            yields: netYields(c),
            plan: plan.byKey.get(key) ?? null,
        };
        if (row.isTown) {
            const t = townByKey.get(key);
            const advice = townAdvice.get(key);
            row.focus = t?.focus ?? null;
            row.focusKey = t?.focusKey ?? null;
            row.exporting = !!t?.exporting;
            row.sentPerCity = t?.sentPerCity ?? 0;
            row.to = (t?.to ?? []).map((k) => cityByKey.get(k)?.name ?? k);
            row.recommended = advice?.focus?.best ?? null;
            row.verdict = advice?.advice?.verdict ?? null;
        } else {
            const cc = cityByKey.get(key);
            row.received = cc?.received ?? 0;
            row.from = (cc?.from ?? []).map((k) => townByKey.get(k)?.name ?? k);
        }
        return row;
    });
    cityRoles(rows);
    rows.sort((a, b) => Number(a.isTown) - Number(b.isTown) || Number(b.isCapital) - Number(a.isCapital) || b.pop - a.pop);
    const overview = {
        rows,
        network,
        planName: plan.targetName,
        totals: {
            cities: rows.filter((r) => !r.isTown).length,
            towns: rows.filter((r) => r.isTown).length,
            foodSent: network.links.reduce((s, l) => s + l.amount, 0),
            lonely: network.towns.filter((t) => t.exporting && t.to.length === 0).length,
            growing: network.towns.filter((t) => !t.focus).length,
        },
        elapsedMs: Date.now() - started,
    };
    state.set({ results: { ...state.get().results, empire: overview } });
    log.info(`empire overview: ${overview.totals.cities} cities, ${overview.totals.towns} towns, ${network.links.length} food links (+${overview.totals.foodSent}), ${overview.totals.lonely} unconnected, ${overview.elapsedMs} ms`);
    return overview;
}
