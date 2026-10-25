/**
 * Probes of the building plan for the next review (game 60; UI.log only). Engine adapter: every engine call wrapped in
 * safe().
 *  - `plan: <city>: …` every PLAN_LOG_EVERY turns: each settlement's first PLAN_LOG_ITEMS planned buildings in build order
 *    (game 60: no Library in 140 turns, and no line showed where the plan ranked it);
 *  - `buildings audit: …` when a building of ours is completed (the game's ConstructibleBuildCompleted, as its tutorial and
 *    conquest lens read it: constructible, constructibleType, location): what the plan predicted there (our adjacency, its
 *    ETA, a quarter or not, the game's own placement numbers when planned) against the tile's yields now (GameplayMap.getYields,
 *    as the plot tooltip reads them). Game 60's layouts annealed +0 to +2.5 and nothing showed whether they paid.
 */
import { plannedInOrder } from './xpl-city-actions.js';
import { yieldIndex } from '../core/xpl-yields.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
const nameOf = (c) => safe(() => Locale.compose(c.name), String(c?.name ?? ""));
const sidOf = (c) => `c:${c.location.x}-${c.location.y}`;
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const sum = (ys) => round1((ys ?? []).reduce((a, b) => a + (Number(b) || 0), 0));
const SHORT = ["F", "P", "G", "S", "C", "H", "I"];
/** "F2 P1 C1" from a [F, P, G, S, C, H, I] vector (zeros left out). */
const yieldText = (ys) => (ys ?? []).map((v, i) => (Number(v) ? `${SHORT[i]}${round1(v)}` : "")).filter(Boolean).join(" ") || "0";

export const PLAN_LOG_EVERY = 10; // turns between two `plan:` lines
export const PLAN_LOG_ITEMS = 6;  // planned buildings named per settlement

/** UI.log every PLAN_LOG_EVERY turns: each settlement's first planned buildings in build order. @returns the lines written */
export function logPlanOrder() {
    const turn = Number(safe(() => Game.turn, 0)) || 0;
    if (turn % PLAN_LOG_EVERY !== 0) return [];
    const plans = state.get().results?.plans;
    if (!plans?.placements) return [];
    const lines = [];
    for (const c of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const order = plannedInOrder(plans, sidOf(c));
        if (order.length === 0) continue;
        const items = order.slice(0, PLAN_LOG_ITEMS).map((p) => `${p.type}${Number.isFinite(p.eta) && plans.timeAware ? ` T+${p.eta}` : ""} ${p.net ?? round1(p.value)}`);
        lines.push(`plan: ${nameOf(c)}${c.isTown ? " (town)" : ""}: ${items.join(", ")}${order.length > PLAN_LOG_ITEMS ? ` (+${order.length - PLAN_LOG_ITEMS} more)` : ""}`);
    }
    for (const l of lines) log.info(l);
    return lines;
}

/** The tile's yields now, in our [F, P, G, S, C, H, I] order (GameplayMap.getYields: [yield type, amount] pairs). */
function tileYields(loc) {
    const out = [0, 0, 0, 0, 0, 0, 0];
    const plot = safe(() => GameplayMap.getIndexFromXY(loc.x, loc.y), -1);
    for (const [type, amount] of safe(() => GameplayMap.getYields(plot, pid()), []) ?? []) {
        const j = yieldIndex(safe(() => GameInfo.Yields.lookup(type)?.YieldType, null));
        if (j >= 0) out[j] += Number(amount) || 0;
    }
    return out;
}

/**
 * The audit line of a building of ours just completed (ConstructibleBuildCompleted's payload). @returns the line, or null
 * (not ours, not a building)
 */
export function auditBuilding(data) {
    const loc = data?.location;
    if (!loc) return null;
    const owner = data?.constructible?.owner ?? safe(() => GameplayMap.getOwner(loc.x, loc.y), -1);
    if (owner !== pid()) return null;
    const def = safe(() => GameInfo.Constructibles.lookup(data.constructibleType), null);
    if (def?.ConstructibleClass !== "BUILDING") return null;
    const plans = state.get().results?.plans;
    const rows = [...(plans?.placements ?? []), ...(plans?.fillers ?? [])].filter((p) => p.type === def.ConstructibleType);
    const city = safe(() => Cities.get(GameplayMap.getOwningCityFromXY(loc.x, loc.y)), null);
    const here = rows.find((p) => p.x === loc.x && p.y === loc.y) ?? null;
    const mine = city ? rows.find((p) => p.sid === sidOf(city)) ?? null : null;
    const where = city ? nameOf(city) : here?.settlementName ?? "?";
    const now = tileYields(loc);
    let planned;
    if (here) {
        const adj = here.adjacency ?? null;
        planned = `planned here: adjacency +${sum(adj)} (${yieldText(adj)}), base ${yieldText(here.base)}${Number.isFinite(here.eta) && plans?.timeAware ? `, ETA T+${here.eta}` : ""}, quarter ${here.quarter ? "yes" : "no"}`
            + `${here.engineYields ? `; the game's placement then +${sum(here.engineYields)} (${yieldText(here.engineYields)})` : ""}`;
    } else if (mine) {
        planned = `planned at ${mine.x},${mine.y} (adjacency +${sum(mine.adjacency)})`;
    } else planned = "not in the plan";
    const line = `buildings audit: ${where} ${def.ConstructibleType} at ${loc.x},${loc.y}: ${planned}; tile now ${sum(now)} (${yieldText(now)})`;
    log.info(line);
    return line;
}

// Our buildings completed, whether the autopilot is on or not (bought ones too, very likely: the event is the constructible's).
try {
    engine.on("ConstructibleBuildCompleted", (d) => safe(() => auditBuilding(d), null));
} catch (_e) {
    // No engine events here.
}
