/**
 * Gathers town and empire facts from the engine and runs the town -> city advisor.
 * Engine calls are the same ones the production chooser uses for its
 * "Convert to City" button (production-chooser-operations.js, panel-production-chooser.js).
 */
import { adviseTown, compareAdvice, estimateAgeTurnsLeft } from '../core/xpl-town-advisor.js';
import { improvementKind, recommendFocus } from '../core/xpl-town-focus.js';
import { profileFor } from '../core/xpl-profiles.js';
import { focusOfProfile } from '../core/xpl-effect-value.js';
import { FOCUS_YIELD_TAG } from '../core/xpl-victory-levers.js';
import { getEngineMap } from './xpl-engine-map.js';
import { getRules } from './xpl-rules-loader.js';
import { FactsCache } from './xpl-map-facts.js';
import { rivalWinTurns } from './xpl-victory.js';
import { state } from '../services/xpl-state.js';
import { gameKey, settings } from '../services/xpl-settings.js';
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

let lastAgeTurns = null; // how many turns the previous age took (sampleAgeProgress)

/** How many turns an age took, from its samples (sampling may have started late: scaled by the points seen). */
function ageLength(samples) {
    const s = (samples ?? []).filter((x) => Number.isFinite(x?.turn) && Number.isFinite(x?.points));
    if (s.length < 2) return null;
    const first = s[0];
    const last = s[s.length - 1];
    const dt = last.turn - first.turn;
    const dp = last.points - first.points;
    if (!(dt > 0) || !(dp > 0)) return null;
    return Math.round((dt * last.points) / dp) + 1;
}

/** Records (turn, age points) once per turn so the age's pace can be estimated. */
function sampleAgeProgress(ageType, points) {
    try {
        const hash = Database.makeHash(AGE_SAMPLES_KEY);
        const raw = GameTutorial.getProperty(hash);
        let data = typeof raw === "string" && raw ? JSON.parse(raw) : null;
        if (!data || data.age !== ageType) {
            // A new age: remember how long the last one took, for this one's first turns (research/24 F3: at E1 the
            // estimate said 118 turns, the age had 70). The save's properties do not outlive the age change (game 22:
            // 118 again at E1 and M1): the settings remember the last age's length (rememberAge).
            data = { age: ageType, samples: [], lastTurns: ageLength(data?.samples) ?? data?.lastTurns ?? rememberedAgeTurns(ageType) };
        }
        lastAgeTurns = data.lastTurns ?? null;
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

/** The last age's length the settings remember for this game (rememberAge), or null. */
function rememberedAgeTurns(ageType) {
    const key = gameKey();
    const age = settings.recall(key, "age");
    const turns = Number(settings.recall(key, "ageTurns"));
    return age && age !== ageType && turns > 0 ? turns : null;
}

let ageRemembered = null; // `${age}|${turn}` last remembered

/** Remembers this age's length (the turn plus the turns left, from two samples on) once a turn, for the next age. */
function rememberAge(ageType, turnsLeft, samples) {
    const k = `${ageType}|${Game.turn}`;
    if (ageRemembered === k || samples < 2 || !Number.isFinite(turnsLeft)) return;
    ageRemembered = k;
    settings.remember(gameKey(), { age: ageType, ageTurns: Game.turn + turnsLeft });
}

/**
 * Does this age end on its clock? A non-final age does (its points reach the maximum, then the next age begins). The final
 * age ends the game only while the score victory is on: the game shows the final age's countdown only then
 * (age-progression-warning-popup-manager.js, `!isFinalAge || scoreVictoryEnabled`). Nothing ends in a game played on past
 * its end ("one more turn": `isExtendedGame`) or with no age timer (`getMaxAgeProgressionPoints() <= 0`; the victories
 * screen's isOneMoreTurnMode). Game 26 (research/31 §1): only the science victory was on, Modern reached 100% at M70 and
 * the game went on to M122, while our final-age deadline refused every space project from M65.
 */
export function ageHasEnd() {
    const apm = safe(() => Game.AgeProgressManager, null);
    if (!apm) return true;
    if (safe(() => apm.isExtendedGame, false)) return false;
    if (!(Number(safe(() => apm.getMaxAgeProgressionPoints(), 1)) > 0)) return false;
    if (!safe(() => apm.isFinalAge, false)) return true;
    return !!safe(() => Game.VictoryManager.isScoreVictoryEnabled(), true);
}

/**
 * Turns left in this age, from the age-progress samples (also used by building timing). Unlimited (Infinity, `endless`)
 * when the age has no end on its clock (ageHasEnd); the estimate is still remembered for the next age. A rival's countdown
 * to a fixed-score victory (science) ends the game sooner, clock or not (`rivalWin`: rivalWinTurns): every deadline then
 * counts to it.
 */
export function ageOutlook() {
    const rules = getRules();
    const apm = Game.AgeProgressManager;
    const points = Number(safe(() => apm.getCurrentAgeProgressionPoints(), 0));
    const max = Number(safe(() => apm.getMaxAgeProgressionPoints(), 0));
    const isFinalAge = !!safe(() => apm.isFinalAge, false);
    const samples = sampleAgeProgress(rules.age, points);
    const turnsLeft = estimateAgeTurnsLeft(samples, points, max, lastAgeTurns ?? undefined);
    rememberAge(rules.age, turnsLeft, samples.length);
    const endless = !ageHasEnd();
    const rivalWin = safe(() => rivalWinTurns(), null);
    const clock = endless ? Infinity : turnsLeft;
    return { turnsLeft: rivalWin ? Math.min(clock, rivalWin.turns) : clock, isFinalAge, endless: endless && !rivalWin, rivalWin, ageFrac: max > 0 ? points / max : 0 };
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

/**
 * How many of this age's buildings an Urban Center would let the town buy for the focus (TypeTags URBANCENTER
 * and the focus's yield tag: Library, Observatory, Schoolhouse for science), unlocked and not there yet
 * (research/22 C2, probe P3).
 */
function urbanBuys(have, focus) {
    const tag = FOCUS_YIELD_TAG[focus];
    if (!tag) return 0;
    const pid = GameContext.localPlayerID;
    const reached = (r) => (Number(safe(() => Game.ProgressionTrees.getNode(pid, r.ProgressionTreeNodeType)?.depthUnlocked, 0)) || 0) >= (Number(r.UnlockDepth) || 1);
    let n = 0;
    for (const t of GameInfo.TypeTags?.filter((r) => r.Tag === "URBANCENTER") ?? []) {
        if (have.has(t.Type) || !GameInfo.TypeTags.find((r) => r.Type === t.Type && r.Tag === tag)) continue;
        if (safe(() => GameInfo.Constructibles.lookup(t.Type)?.ConstructibleClass, null) !== "BUILDING") continue;
        const unlocks = GameInfo.ProgressionTreeNodeUnlocks?.filter((r) => r.TargetType === t.Type && !r.RequiredTraitType) ?? [];
        if (unlocks.length === 0 || unlocks.some(reached)) n++;
    }
    return n;
}

/** What a Town Focus would act on, counted on the town's own tiles. */
function townFocusFacts(city, facts, rules, focus = null) {
    const out = { farm: 0, mine: 0, appealing: 0, quarters: 0, buildings: 0, resources: 0 };
    const have = new Set();
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
            if (c.cls === "BUILDING") have.add(c.type);
        }
        out.buildings += buildingsHere;
        if (buildingsHere >= 2) out.quarters++;
        const urban = s.district === "DISTRICT_URBAN" || s.district === "DISTRICT_CITY_CENTER";
        if (!urban && (s.appeal ?? 0) >= charming) out.appealing++;
        if (s.resource) out.resources++;
    }
    out.urbanBuys = urbanBuys(have, focus);
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
        // No end on the clock (ageHasEnd): no late cut for conversions either (research/31 §1); a rival's science
        // countdown ends the game sooner (rivalWinTurns).
        ageTurnsLeft: Math.min(ageHasEnd() ? estimateAgeTurnsLeft(samples, agePoints, ageMax, lastAgeTurns ?? undefined) : Infinity, safe(() => rivalWinTurns()?.turns, Infinity) ?? Infinity),
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
                // The game says Success false while the gold is short (its button is disabled then): the
                // conversion is still possible, and the gold plan saves for it (research/22 B2).
                canConvert: !!(check?.Success || check?.InsufficientFunds),
                affordable: !!check?.Success,
                failureReasons: check?.InsufficientFunds ? [] : check?.FailureReasons ?? [],
                hasFocus,
                focusValue: [YieldTypes.YIELD_FOOD, YieldTypes.YIELD_GOLD, YieldTypes.YIELD_SCIENCE, YieldTypes.YIELD_CULTURE, YieldTypes.YIELD_HAPPINESS].reduce((s, y) => s + Math.max(0, net(city, y)), 0),
                foodSurplus: net(city, YieldTypes.YIELD_FOOD),
                costFallsWithPop: true, // Civilopedia: the conversion cost falls as the town grows
            };
            const focus = recommendFocus({ ...townFocusFacts(city, facts, rules, focusOfProfile(settings.profile)), ...townFocusContext(city), population: town.pop }, profileFor(settings).y, settings.strategy?.townFocusBias ?? null);
            rows.push({ town, advice: adviseTown(town, ctx), focus });
        } catch (error) {
            log.error(`town advisor failed for a town`, error);
        }
    }
    rows.sort(compareAdvice);
    const towns = { rows, ctx, ageFrac: ageMax > 0 ? agePoints / ageMax : 0, elapsedMs: Date.now() - started };
    state.set({ results: { ...state.get().results, towns }, stale: { ...state.get().stale, towns: false } });
    log.info(`town advisor: ${rows.length} towns, prod->gold ${ctx.prodToGold}, age ${Math.round(towns.ageFrac * 100)}% (${Number.isFinite(ctx.ageTurnsLeft) ? `~${ctx.ageTurnsLeft} turns left` : "no end"}), ${towns.elapsedMs} ms`);
    return towns;
}
