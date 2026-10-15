/**
 * Wonders tab data (PLAN.md section 10, phase 2): for each wonder of the current age,
 * which of our cities can build it soonest, which tile there boosts the most
 * buildings ("+1 per adjacent wonder"), and how likely we are to win the race.
 *
 * Fair mode reads only what the player knows: our own cities and queues, wonders
 * completed anywhere (every civ is told), and rival wonder sites seen on our map.
 * Omniscient mode (opt-in setting) also reads rivals' build queues, as Wonder Alert does.
 *
 * Engine use (read-only): Game.CityOperations.canStart(BUILD) -> Plots / FailureReasons,
 * city.BuildQueue.getTurnsLeft / getQueue, player.Constructibles.getWonders,
 * Constructibles.getByComponentID, MapConstructibles.getHiddenFilteredConstructibles.
 */
import { RACE_ORDER, raceLabel, wonderBoost } from '../core/xpl-wonder-race.js';
import { profileFor } from '../core/xpl-profiles.js';
import { dot, yieldIndex, zeroYields } from '../core/xpl-yields.js';
import { getEngineMap } from './xpl-engine-map.js';
import { getRules } from './xpl-rules-loader.js';
import { FactsCache } from './xpl-map-facts.js';
import { ageOutlook } from './xpl-town-job.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { isCityCenterType, readAllTacks } from '../integrations/xpl-dmt-bridge.js';

const OPEN_NEIGHBOUR_VALUE = 0.25; // a free neighbour can later hold a building that gets the +1
const RURAL_LOSS = 0.5;            // share of the tile's own yields lost under the wonder
const STATUS_ORDER = { IN_PROGRESS: 0, AVAILABLE: 1, LOCKED: 2, OURS: 3, BUILT: 4 };

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null || Number.isNaN(v) ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

function compose(key, ...args) {
    return safe(() => Locale.compose(key, ...args), key);
}

/** Wonders of the current age (and ageless ones without an Age). */
function currentAgeWonders(age) {
    const out = [];
    for (const def of GameInfo.Constructibles) {
        if (def.ConstructibleClass !== "WONDER") continue;
        if (def.Age && def.Age !== age) continue;
        out.push(def);
    }
    return out;
}

function wonderBaseYields() {
    const out = new Map();
    for (const row of GameInfo.Constructible_YieldChanges ?? []) {
        const i = yieldIndex(row.YieldType);
        if (i < 0) continue;
        if (!out.has(row.ConstructibleType)) out.set(row.ConstructibleType, zeroYields());
        out.get(row.ConstructibleType)[i] += Number(row.YieldChange) || 0;
    }
    return out;
}

/** Is a rival's wonder site known to us (on a revealed plot, in our fog-filtered view)? */
function seenOnMap(localId, location, type) {
    if (!location) return false;
    const { x, y } = location;
    const revealed = safe(() => GameplayMap.getRevealedState(localId, x, y) != RevealedStates.HIDDEN, false);
    if (!revealed) return false;
    const ids = safe(() => MapConstructibles.getHiddenFilteredConstructibles(x, y), null);
    if (!Array.isArray(ids)) return true;
    return ids.some((id) => safe(() => Constructibles.getByComponentID(id)?.type, null) === type);
}

/**
 * What is known about every wonder in the world.
 * @returns Map type(hash) -> { ours, oursSite, elsewhere, seen, rivalTurns: number[] }
 */
function scanWorld(localId, omniscient) {
    const out = new Map();
    const entry = (hash) => {
        if (!out.has(hash)) out.set(hash, { ours: false, oursSite: null, elsewhere: false, seen: 0, rivalTurns: [] });
        return out.get(hash);
    };
    for (const player of safe(() => Players.getAlive(), [])) {
        const pid = player?.id;
        if (pid == null) continue;
        const ids = safe(() => player.Constructibles.getWonders(pid), null) ?? safe(() => player.Constructibles.getWonders(), []);
        for (const id of ids ?? []) {
            const c = safe(() => Constructibles.getByComponentID(id), null);
            const def = c ? GameInfo.Constructibles.lookup(c.type) : null;
            if (!def || def.ConstructibleClass !== "WONDER") continue;
            const e = entry(def.$hash);
            const complete = c.complete !== false;
            if (pid === localId) {
                if (complete) e.ours = true;
                else e.oursSite = c.location ? { x: c.location.x, y: c.location.y } : null;
            } else if (complete) {
                e.elsewhere = true; // completions are announced to everyone
            } else if (!omniscient && seenOnMap(localId, c.location, c.type)) {
                e.seen++;
            }
        }
        if (!omniscient || pid === localId) continue;
        for (const city of safe(() => player.Cities.getCities(), [])) {
            const bq = city?.BuildQueue;
            if (!bq || bq.isEmpty) continue;
            if (globalThis.ProductionKind && bq.currentProductionKind !== ProductionKind.CONSTRUCTIBLE) continue;
            const def = GameInfo.Constructibles.lookup(bq.currentProductionTypeHash);
            if (!def || def.ConstructibleClass !== "WONDER") continue;
            const turns = Number(safe(() => bq.currentTurnsLeft, 0)) || Number(safe(() => bq.getTurnsLeft(def.ConstructibleType), 0));
            entry(def.$hash).rivalTurns.push(turns > 0 ? turns : 1);
        }
    }
    return out;
}

/** Our queued wonders: type -> { cityKey, turns, pct }. */
function ourQueues(cities) {
    const out = new Map();
    for (const city of cities) {
        for (const item of safe(() => city.BuildQueue.getQueue(), []) ?? []) {
            if (globalThis.ProductionKind && item.kind !== ProductionKind.CONSTRUCTIBLE) continue;
            const def = GameInfo.Constructibles.lookup(item.constructibleType);
            if (!def || def.ConstructibleClass !== "WONDER") continue;
            const turns = Number(safe(() => city.BuildQueue.getTurnsLeft(def.ConstructibleType), 0));
            const pct = Number(safe(() => city.BuildQueue.getPercentComplete(item.type), 0));
            const prev = out.get(def.ConstructibleType);
            if (!prev || turns < prev.turns) out.set(def.ConstructibleType, { cityKey: keyOf(city), turns: turns > 0 ? turns : 1, pct });
        }
    }
    return out;
}

function keyOf(city) {
    return `c:${city.location.x}-${city.location.y}`;
}

/** Tacks by plot: idx -> [type]; building tacks count as planned neighbours. */
function tacksByPlot(engineMap) {
    const out = new Map();
    if (!isDmtActive()) return out;
    for (const { x, y, mapTackList } of readAllTacks()) {
        out.set(engineMap.index(x, y), mapTackList.map((t) => t.type));
    }
    return out;
}

/**
 * Every valid plot for a wonder in one city, scored: buildings around it that get
 * "+1 per adjacent wonder" (built and tacked), free neighbours, minus the tile's own yields.
 */
function scorePlots(plots, ctx) {
    const { engineMap, facts, rules, weights, tacks, wonderType } = ctx;
    const scored = [];
    for (const idx of plots) {
        const here = tacks.get(idx) ?? [];
        if (here.some((t) => t !== wonderType && t !== "DMT_WONDER")) continue; // planned for something else
        const built = [];
        const planned = [];
        let open = 0;
        for (const n of engineMap.map.neighbours(idx)) {
            const s = facts.structures(n);
            if (!s?.known) continue;
            const types = s.constructibles.filter((c) => c.cls === "BUILDING" && !c.obsolete && c.complete).map((c) => c.type);
            built.push(...types);
            const tacked = (tacks.get(n) ?? []).filter((t) => rules.classOf(t) === "BUILDING" && !isCityCenterType(t) && !types.includes(t));
            planned.push(...tacked);
            const empty = types.length === 0 && tacked.length === 0 && (s.district == null || s.district === "DISTRICT_RURAL");
            if (empty && s.urbanizable && (s.owner === ctx.localId || s.owner === -1)) open++;
        }
        const isActive = (t) => rules.isActive(t);
        const now = wonderBoost(built, rules.rulesByType, isActive);
        const later = wonderBoost(planned, rules.rulesByType, isActive);
        const f = facts.structures(idx);
        const urban = f?.district === "DISTRICT_URBAN" || f?.district === "DISTRICT_CITY_CENTER";
        const loss = f?.known && !urban ? RURAL_LOSS * dot(weights, f.yields) : 0;
        const byYield = now.byYield.map((v, i) => v + later.byYield[i]);
        const value = dot(weights, byYield) + open * OPEN_NEIGHBOUR_VALUE - loss;
        const { x, y } = engineMap.location(idx);
        scored.push({ idx, x, y, value, byYield, buildings: now.buildings, planned: later.buildings, open, loss, tacked: here.includes(wonderType) });
    }
    scored.sort((a, b) => b.value - a.value || a.idx - b.idx);
    return scored;
}

export function runWonderPlanner(settings) {
    const started = Date.now();
    const localId = GameContext.localPlayerID;
    const player = Players.get(localId);
    const engineMap = getEngineMap();
    const rules = getRules();
    const weights = profileFor(settings).y;
    const omniscient = !!settings.wonders?.omniscient;
    const facts = new FactsCache(engineMap, rules, { playerId: localId, includeHidden: false });
    const cities = (safe(() => player.Cities.getCities(), []) ?? []).filter((c) => !c.isTown);
    const outlook = safe(() => ageOutlook(), null);
    // The final age ends too (at 100% the game ends: research/24 F3, Dogo Onsen and Ubudiah were started in
    // game 9's Modern age though they could not finish).
    const ageTurnsLeft = outlook ? outlook.turnsLeft : null;
    const world = scanWorld(localId, omniscient);
    const queued = ourQueues(cities);
    const tacks = tacksByPlot(engineMap);
    const base = wonderBaseYields();

    const rows = [];
    for (const def of currentAgeWonders(rules.age)) {
        const type = def.ConstructibleType;
        try {
            const known = world.get(def.$hash) ?? { ours: false, oursSite: null, elsewhere: false, seen: 0, rivalTurns: [] };
            const baseYields = base.get(type) ?? zeroYields();
            const options = [];
            let failure = null;
            for (const city of cities) {
                const r = safe(() => Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, { ConstructibleType: def.$index }, false), null);
                if (!r) continue;
                const startable = !!(r.Success || r.InQueue || r.InProgress);
                if (!startable) {
                    failure ??= (r.FailureReasons ?? [])[0] ?? null;
                    continue;
                }
                const plots = [...(r.Plots ?? []), ...(r.ExpandUrbanPlots ?? [])];
                const cost = Number(safe(() => city.Production.getConstructibleProductionCost(type), 0)) || Number(def.Cost) || 0;
                const prod = Math.max(1, Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0);
                let turns = Number(safe(() => city.BuildQueue.getTurnsLeft(type), 0));
                if (!(turns > 0)) turns = Math.max(1, Math.ceil(cost / prod));
                options.push({
                    cityKey: keyOf(city),
                    cityName: compose(city.name),
                    turns,
                    cost,
                    plots: scorePlots(plots, { engineMap, facts, rules, weights, tacks, wonderType: type, localId }),
                });
            }
            options.sort((a, b) => a.turns - b.turns || (b.plots[0]?.value ?? -Infinity) - (a.plots[0]?.value ?? -Infinity));

            const inQueue = queued.get(type) ?? null;
            let status = "LOCKED";
            if (known.ours) status = "OURS";
            else if (known.elsewhere) status = "BUILT";
            else if (inQueue || known.oursSite) status = "IN_PROGRESS";
            else if (options.length > 0) status = "AVAILABLE";

            const fastest = inQueue ? inQueue.turns : options[0]?.turns ?? Infinity;
            const race = status === "OURS" ? { label: "HIGH", reasons: [] } : raceLabel({
                ourTurns: fastest,
                completedElsewhere: known.elsewhere,
                rivalsSeen: known.seen,
                rivalTurns: omniscient ? known.rivalTurns : null,
                ageTurnsLeft,
            });
            rows.push({
                type,
                name: compose(def.Name),
                status,
                race,
                baseYields,
                baseValue: dot(weights, baseYields),
                turns: Number.isFinite(fastest) ? fastest : null,
                inQueue,
                site: known.oursSite,
                options,
                failure,
                rivalsSeen: known.seen,
                rivalTurns: omniscient ? known.rivalTurns : null,
            });
        } catch (error) {
            log.error(`wonder planner failed for ${type}`, error);
        }
    }

    rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        || RACE_ORDER[a.race.label] - RACE_ORDER[b.race.label]
        || (a.turns ?? 999) - (b.turns ?? 999)
        || a.name.localeCompare(b.name));
    assignTiles(rows);

    const wonders = { rows, omniscient, ageTurnsLeft, isFinalAge: !!outlook?.isFinalAge, ageFrac: outlook?.ageFrac ?? 0, elapsedMs: Date.now() - started };
    state.set({ results: { ...state.get().results, wonders }, stale: { ...state.get().stale, wonders: false } });
    log.info(`wonder planner: ${rows.length} wonders (${rows.filter((r) => r.status === "AVAILABLE").length} available), ${cities.length} cities, ${omniscient ? "omniscient" : "fair"}, ${wonders.elapsedMs} ms`);
    return wonders;
}

/**
 * Picks one tile per wonder in list order, so two wonders never get the same tile:
 * the fastest city's best free plot (an in-progress wonder keeps its site).
 */
function assignTiles(rows) {
    const claimed = new Set();
    for (const row of rows) {
        row.best = null;
        if (row.status !== "AVAILABLE" && row.status !== "IN_PROGRESS") continue;
        if (row.site) {
            row.best = { ...row.site, cityName: row.options[0]?.cityName ?? "", turns: row.turns, inProgress: true };
            continue;
        }
        const option = row.inQueue ? row.options.find((o) => o.cityKey === row.inQueue.cityKey) ?? row.options[0] : row.options[0];
        if (!option) continue;
        const plot = option.plots.find((p) => !claimed.has(p.idx)) ?? null;
        if (!plot) {
            row.best = { cityName: option.cityName, turns: option.turns, noPlot: true };
            continue;
        }
        claimed.add(plot.idx);
        row.best = { ...plot, cityName: option.cityName, cityKey: option.cityKey, turns: option.turns, cost: option.cost };
    }
}
