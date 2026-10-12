/**
 * Gathers town and empire facts from the engine and runs the town -> city advisor.
 * Engine calls are the same ones the production chooser uses for its
 * "Convert to City" button (production-chooser-operations.js, panel-production-chooser.js).
 */
import { adviseTown, compareAdvice, estimateAgeTurnsLeft } from '../core/xpl-town-advisor.js';
import { improvementKind, recommendFocus } from '../core/xpl-town-focus.js';
import { getProfile } from '../core/xpl-profiles.js';
import { getEngineMap } from './xpl-engine-map.js';
import { getRules } from './xpl-rules-loader.js';
import { FactsCache } from './xpl-map-facts.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

const AGE_SAMPLES_KEY = "_XPL_OBJ_AGE_SAMPLES";
const MAX_AGE_SAMPLES = 40;
const PROD_TO_GOLD_FALLBACK = 2.0;
const GROWTH_TILES = 4; // extra tiles counted for "production potential"

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null || Number.isNaN(v) ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

function net(city, yieldType) {
    return Number(safe(() => city.Yields.getNetYield(yieldType), 0)) || 0;
}

/** Records (turn, age points) once per turn so the age's pace can be estimated. */
function sampleAgeProgress(ageType, points) {
    try {
        const hash = Database.makeHash(AGE_SAMPLES_KEY);
        const raw = GameTutorial.getProperty(hash);
        let data = typeof raw === "string" && raw ? JSON.parse(raw) : null;
        if (!data || data.age !== ageType) data = { age: ageType, samples: [] };
        const turn = Game.turn;
        const last = data.samples[data.samples.length - 1];
        if (!last || last.turn !== turn) {
            data.samples.push({ turn, points });
            if (data.samples.length > MAX_AGE_SAMPLES) data.samples.splice(1, data.samples.length - MAX_AGE_SAMPLES);
            GameTutorial.setProperty(hash, JSON.stringify(data));
        }
        return data.samples;
    } catch (error) {
        log.debug("age sampling failed", error);
        return [];
    }
}

/** Turns left in this age, from the age-progress samples (also used by building timing). */
export function ageOutlook() {
    const rules = getRules();
    const apm = Game.AgeProgressManager;
    const points = Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0));
    const max = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0));
    const isFinalAge = !!safe(() => apm.isFinalAge, false);
    const samples = sampleAgeProgress(rules.age, points);
    return { turnsLeft: estimateAgeTurnsLeft(samples, points, max), isFinalAge, ageFrac: max > 0 ? points / max : 0 };
}

/** Median of (gold purchase cost / production cost) for current-age buildings in a real city. */
export function productionToGoldRatio(cities, rules) {
    const city = cities.find((c) => !c.isTown) ?? null;
    if (!city?.Gold || !city?.Production) return PROD_TO_GOLD_FALLBACK;
    const ratios = [];
    for (const b of rules.buildings) {
        const gold = Number(safe(() => city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, b.type), 0));
        const prod = Number(safe(() => city.Production.getConstructibleProductionCost(b.type), 0));
        if (gold > 0 && prod > 0) ratios.push(gold / prod);
    }
    if (ratios.length === 0) return PROD_TO_GOLD_FALLBACK;
    ratios.sort((a, b) => a - b);
    return Math.round(ratios[Math.floor(ratios.length / 2)] * 100) / 100;
}

/** Current production plus the best few unclaimed production tiles in reach. */
function productionPotential(city, prodNow, facts, engineMap) {
    const centre = engineMap.index(city.location.x, city.location.y);
    const extra = [];
    for (const { idx, ring } of engineMap.map.radius(centre, 3)) {
        if (ring === 0) continue;
        const f = facts.facts(idx);
        if (!f || !f.known || !f.workable || f.owner !== -1) continue;
        extra.push(f.yields[1] ?? 0);
    }
    extra.sort((a, b) => b - a);
    return prodNow + extra.slice(0, GROWTH_TILES).reduce((a, b) => a + b, 0);
}

/** What a Town Focus would act on, counted on the town's own tiles. */
function townFocusFacts(city, facts, rules) {
    const out = { farm: 0, mine: 0, appealing: 0, quarters: 0, buildings: 0, resources: 0 };
    const charming = rules.appealCharming ?? 3;
    for (const plot of safe(() => city.getPurchasedPlots(), []) ?? []) {
        const s = facts.structures(plot);
        if (!s?.known) continue;
        let buildingsHere = 0;
        for (const c of s.constructibles ?? []) {
            if (c.cls === "IMPROVEMENT") {
                const kind = improvementKind(c.type);
                if (kind === "FARM") out.farm++;
                else if (kind === "MINE") out.mine++;
            } else if (c.cls === "BUILDING" && !c.obsolete) {
                buildingsHere++;
            }
        }
        out.buildings += buildingsHere;
        if (buildingsHere >= 2) out.quarters++;
        const urban = s.district === "DISTRICT_URBAN" || s.district === "DISTRICT_CITY_CENTER";
        if (!urban && (s.appeal ?? 0) >= charming) out.appealing++;
        if (s.resource) out.resources++;
    }
    return out;
}

/** The town's connections (food goes to connected cities) and the Focus choices the game offers now. */
function townFocusContext(city) {
    const connected = safe(() => city.getConnectedCities(), []) ?? [];
    let connectedCities = 0;
    for (const id of connected) {
        const c = safe(() => Cities.get(id), null);
        if (c && !c.isTown) connectedCities++;
    }
    const offer = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.CHANGE_GROWTH_MODE, { Type: GrowthTypes.PROJECT }, false), null);
    const available = Array.isArray(offer?.Projects)
        ? new Set(offer.Projects.map((id) => safe(() => GameInfo.Projects.lookup(id)?.ProjectType, null)).filter(Boolean))
        : null;
    const current = safe(() => (city.Growth.growthType === GrowthTypes.PROJECT ? GameInfo.Projects.lookup(city.Growth.projectType)?.ProjectType ?? null : "GROWTH"), null);
    return { connectedSettlements: connected.length, connectedCities, available, current };
}

export function runTownAdvisor(settings) {
    const started = Date.now();
    const playerId = GameContext.localPlayerID;
    const player = Players.get(playerId);
    const engineMap = getEngineMap();
    const rules = getRules();
    const facts = new FactsCache(engineMap, rules, { playerId, includeHidden: false });
    const cities = safe(() => player.Cities.getCities(), []) ?? [];

    const apm = Game.AgeProgressManager;
    const agePoints = Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0));
    const ageMax = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0));
    const isFinalAge = !!safe(() => apm.isFinalAge, false);
    const samples = sampleAgeProgress(rules.age, agePoints);

    const ctx = {
        age: rules.age,
        numCities: Number(safe(() => player.Stats.numCities, cities.filter((c) => !c.isTown).length)),
        numTowns: Number(safe(() => player.Stats.numTowns, cities.filter((c) => c.isTown).length)),
        cityLimit: Number(safe(() => player.Cities.getCityLimit(), 0)),
        numSettlements: Number(safe(() => player.Stats.numSettlements, cities.length)),
        settlementCap: Number(safe(() => player.Stats.settlementCap, 0)),
        sumCityProduction: cities.filter((c) => !c.isTown).reduce((sum, c) => sum + net(c, YieldTypes.YIELD_PRODUCTION), 0),
        prodToGold: productionToGoldRatio(cities, rules),
        agePoints,
        ageMax,
        isFinalAge,
        ageTurnsLeft: estimateAgeTurnsLeft(samples, agePoints, ageMax),
        expectKeepCities: !!settings.towns?.expectKeepCities,
    };

    const rows = [];
    for (const city of cities) {
        if (!city.isTown) continue;
        try {
            const prodNow = Math.max(net(city, YieldTypes.YIELD_PRODUCTION), Number(safe(() => city.Yields.getYield(YieldTypes.YIELD_PRODUCTION), 0)));
            const check = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.PURCHASE, { Directive: OrderTypes.ORDER_TOWN_UPGRADE }, false), null);
            const hasFocus = safe(() => city.Growth.growthType == GrowthTypes.PROJECT, false);
            const town = {
                id: city.id,
                name: safe(() => Locale.compose(city.name), String(city.name)),
                x: city.location.x,
                y: city.location.y,
                pop: city.population ?? 0,
                prodNow,
                prodPot: productionPotential(city, prodNow, facts, engineMap),
                cost: Number(safe(() => city.Gold.getTownUpgradeCost(), -1)),
                canConvert: !!check?.Success,
                failureReasons: check?.FailureReasons ?? [],
                hasFocus,
                focusValue: [YieldTypes.YIELD_FOOD, YieldTypes.YIELD_GOLD, YieldTypes.YIELD_SCIENCE, YieldTypes.YIELD_CULTURE, YieldTypes.YIELD_HAPPINESS].reduce((s, y) => s + Math.max(0, net(city, y)), 0),
                foodSurplus: net(city, YieldTypes.YIELD_FOOD),
                costFallsWithPop: true, // Civilopedia: the conversion cost falls as the town grows
            };
            const focus = recommendFocus({ ...townFocusFacts(city, facts, rules), ...townFocusContext(city), population: town.pop }, getProfile(settings.profile).y);
            rows.push({ town, advice: adviseTown(town, ctx), focus });
        } catch (error) {
            log.error(`town advisor failed for a town`, error);
        }
    }
    rows.sort(compareAdvice);
    const towns = { rows, ctx, ageFrac: ageMax > 0 ? agePoints / ageMax : 0, elapsedMs: Date.now() - started };
    state.set({ results: { ...state.get().results, towns }, stale: { ...state.get().stale, towns: false } });
    log.info(`town advisor: ${rows.length} towns, prod->gold ${ctx.prodToGold}, age ${Math.round(towns.ageFrac * 100)}% (~${ctx.ageTurnsLeft} turns left), ${towns.elapsedMs} ms`);
    return towns;
}
