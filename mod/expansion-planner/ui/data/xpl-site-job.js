/**
 * Builds the scoring context from the live game and runs the settlement site search
 * (core/site-pipeline.js) through the scheduler. Results go to services/state.js.
 */
import { siteTuning, TUNING } from '../core/xpl-tuning.js';
import { profileFor } from '../core/xpl-profiles.js';
import { findSites } from '../core/xpl-site-pipeline.js';
import { topReasons } from '../core/xpl-site-scorer.js';
import { getEngineMap } from './xpl-engine-map.js';
import { getRules } from './xpl-rules-loader.js';
import { FactsCache } from './xpl-map-facts.js';
import { createSettleOracle } from './xpl-settle-oracle.js';
import { gatherSettlements, villagesOf } from './xpl-player-facts.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { plannedCityCentres } from '../integrations/xpl-dmt-bridge.js';
import { runJob } from '../services/xpl-scheduler.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

import { rolesOf, scoreSiteRoles } from '../core/xpl-site-roles.js';
import { isCoastal } from '../core/xpl-site-scorer.js';
import { disabledVictories } from './xpl-victory.js';

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

const JOB_NAME = "sites";
let settleDiagnosed = false; // the engine-check diagnosis is logged once per session

/** Builds the plain-data description of each pick that the panel and overlay need. */
function describePick(pick, settlements, engineMap) {
    let nearest = null;
    for (const s of settlements.own) {
        const d = engineMap.map.distance(pick.idx, s.idx);
        if (!nearest || d < nearest.dist) nearest = { name: s.name, dist: d, idx: s.idx };
    }
    const { x, y } = engineMap.location(pick.idx);
    return {
        ...pick,
        x,
        y,
        nearest: nearest ? { name: nearest.name, dist: nearest.dist, dir: engineMap.direction(nearest.idx, pick.idx) } : null,
        footprint: engineMap.map.radius(pick.idx, pick.role === "TOWN" ? 2 : 3).map((p) => p.idx),
        mapLabel: pick.role === "TOWN" ? `#${pick.rank}${compose("LOC_XPL_TOWN_MARK")}` : `#${pick.rank}`,
        shownReasons: topReasons(pick.reasons),
    };
}

/**
 * Starts (or restarts) the site search with the given settings.
 * @returns the scheduler handle
 */
/** Everything the site scorers need, for a search or for scoring a single site. */
function buildSiteContext(settings) {
    const playerId = GameContext.localPlayerID;
    const engineMap = getEngineMap();
    const rules = getRules();
    const includeHidden = !!settings.includeHidden;
    const facts = new FactsCache(engineMap, rules, { playerId, includeHidden });
    const settlements = gatherSettlements(playerId, engineMap, includeHidden);
    const oracle = createSettleOracle(playerId, engineMap);
    // The player's own city-centre tacks are planned settlements: they claim tiles too.
    // (Tacks placed by this mod mirror the current picks and are not counted.)
    if (isDmtActive()) {
        try {
            for (const { x, y } of plannedCityCentres({ excludeOurs: true })) {
                settlements.centres.push({ idx: engineMap.index(x, y), kind: "PLANNED", name: "" });
            }
        } catch (error) {
            log.warn("reading planned city-centre tacks failed", error);
        }
    }

    // Relaxed (the autopilot when sites ran out far below the cap): looser distances, HIGH overlap, and
    // villages we have never seen do not count.
    const relaxed = !!settings.relaxedSites;
    const ctx = {
        map: engineMap.map,
        facts: (idx) => facts.facts(idx),
        profile: profileFor(settings),
        tuning: siteTuning(relaxed, { anyRoom: !!settings.anyRoomSites }),
        overlapTol: relaxed ? "HIGH" : settings.overlapTol,
        centres: settlements.centres,
        independents: settlements.independents,
        // Far below the cap (the autopilot's unseenVillagePenalty) an unseen village is only a penalty: it stays among
        // the independents (INDEPENDENT_PENALTY), not the villages the site rule rejects (research/24 X3).
        villages: relaxed || settings.unseenVillagePenalty ? settlements.villages.filter((v) => v.revealed) : settlements.villages,
        adjFamilies: rules.siteFamilies,
        adjOpts: { playerId, charming: rules.appealCharming, breathtaking: rules.appealBreathtaking },
        avgKnownTileValue: 0,
        aiPicks: new Map(),
        ownedResources: settlements.ownedResources,
        siteRoles: rolesOf(settings.siteRoles),
        naturalWonders: naturalWondersValued(rules),
        continentOf: (idx) => {
            const { x, y } = engineMap.location(idx);
            try {
                return GameplayMap.getContinentType(x, y);
            } catch (_e) {
                return null;
            }
        },
    };
    // Cities a kept town could feed (towns themselves are not fed).
    ctx.ownCities = settlements.own
        .filter((s) => !s.isTown)
        .map((s) => ({ idx: s.idx, name: s.name, coastal: isCoastal(s.idx, ctx), continent: ctx.continentOf(s.idx) }));
    return { playerId, engineMap, rules, includeHidden, facts, settlements, oracle, ctx };
}

/**
 * City or town: the better job for a planned site (scored like the site search does).
 * Used for city-centre tacks placed by hand or before roles were remembered.
 */

/**
 * Natural wonders are culture victory points (research/26 §4.5): valued in site scores while the culture victory is on, and
 * always for a civilization or leader whose trait pays for them (research/40 C: Isabella; rules.naturalWonderTrait).
 */
export function naturalWondersValued(rules) {
    if (rules?.naturalWonderTrait) return true;
    try {
        return !disabledVictories().has("CULTURE");
    } catch (_e) {
        return false;
    }
}

export function siteRoleAt(x, y, settings) {
    try {
        const { ctx, engineMap } = buildSiteContext(settings);
        const r = scoreSiteRoles(engineMap.index(x, y), ctx, [], rolesOf("BOTH"));
        return r?.rejected ? "CITY" : r?.role ?? "CITY";
    } catch (error) {
        log.debug("site role failed", error);
        return "CITY";
    }
}

export function startSiteSearch(settings) {
    const { playerId, engineMap, rules, includeHidden, facts, settlements, oracle, ctx } = buildSiteContext(settings);
    const origins = settlements.own.map((s) => s.idx);
    const input = {
        ctx,
        origins,
        radius: settings.radius,
        minSpacing: rules.minSpacing,
        minForeignDistance: ctx.tuning.FOREIGN_MIN_DISTANCE,
        minPickDist: rules.minSpacing + (settings.spread ? 2 : 1),
        topN: settings.topN,
        includeHidden,
        // The game's check refuses land the player hasn't seen, so unexplored plots
        // (only scanned with "include unexplored") use our own rule instead.
        isSettleable: (idx) => (facts.facts(idx)?.revealed ? oracle.isSettleable(idx) : oracle.ownRule(idx)),
    };

    function* job() {
        if (origins.length === 0) {
            return { empty: "NO_SETTLEMENTS" };
        }
        if (settings.useAI) {
            const isKnown = (idx) => facts.facts(idx)?.known === true;
            for (const origin of origins) {
                oracle.addAiPicks(origin, isKnown, ctx.aiPicks);
                yield 0.01;
            }
        }
        let result = yield* findSites(input);
        // If the game's settle check refused every candidate, our call is probably not
        // what the engine expects in this build: log a diagnosis and use our own rule.
        const claim = result.stats.rejected.CLAIM ?? 0;
        if (result.stats.candidates === 0 && claim >= 5) {
            if (!settleDiagnosed) {
                settleDiagnosed = true;
                // Prefer revealed plots in the diagnosis (hidden ones may be refused for being hidden).
                const claimed = result.rejectedPlots.filter((p) => p.code === "CLAIM").map((p) => p.idx);
                const revealedFirst = [...claimed.filter((i) => facts.facts(i)?.revealed), ...claimed.filter((i) => !facts.facts(i)?.revealed)];
                oracle.diagnose(revealedFirst.slice(0, 4));
                log.warn(`settle check refused all ${claim} candidates; using own settle rules (logged once)`);
            }
            result = yield* findSites({ ...input, isSettleable: (idx) => oracle.ownRule(idx) });
            result.claimFallback = true;
        }
        return result;
    }

    state.set({ status: { busy: true, progress: 0, message: "" } });
    const handle = runJob(JOB_NAME, job(), {
        onProgress: (p) => state.set({ status: { busy: true, progress: p, message: "" } }),
    });
    handle.promise
        .then((outcome) => {
            if (outcome.cancelled) return;
            const r = outcome.result;
            if (r.empty) {
                state.set({ status: { busy: false, progress: 1, message: "" }, results: { ...state.get().results, sites: { empty: r.empty, picks: [], stats: null } } });
                return;
            }
            const picks = r.picks.map((p) => ({ ...describePick(p, settlements, engineMap), relaxed: !!settings.relaxedSites }));
            const sites = {
                picks,
                scored: r.scored.map((s) => ({ idx: s.idx, score: s.score, tier: s.tier })),
                rejected: r.rejectedPlots,
                stats: { ...r.stats, elapsedMs: outcome.elapsedMs, busyMs: outcome.busyMs, frames: outcome.frames, aiPicks: ctx.aiPicks.size },
                origins,
                settingsKey: JSON.stringify([settings.profile, settings.radius, settings.topN, settings.includeHidden, settings.overlapTol, settings.spread, settings.useAI, settings.siteRoles]),
                claimFallback: !!r.claimFallback,
                relaxed: !!settings.relaxedSites,
                empty: picks.length === 0 ? "NO_SITES" : null,
                computedTurn: Game.turn,
            };
            state.set({
                status: { busy: false, progress: 1, message: "" },
                results: { ...state.get().results, sites },
                stale: { ...state.get().stale, sites: false },
            });
            const values = r.scored.map((s) => s.value).sort((a, b) => a - b);
            const pct = (q) => (values.length ? values[Math.min(values.length - 1, Math.floor(q * values.length))] : 0);
            const top = r.picks[0];
            log.info(`site values p10=${pct(0.1)} p50=${pct(0.5)} p90=${pct(0.9)} max=${pct(1)}; top comps ${top ? JSON.stringify(top.comps) : "-"}`);
            // Villages the rule saw, and those still unseen (probe P2: a settlement founded 4 tiles from a camp).
            let unseen = "?";
            try {
                unseen = villagesOf(playerId, true).filter((v) => !v.revealed).length;
            } catch (_e) {
                unseen = "?";
            }
            log.info(`sites: ${r.stats.scanned} scanned, ${r.stats.candidates} candidates, ${r.stats.scored} scored, ${picks.length} picks${settings.relaxedSites ? " (relaxed)" : ""} in ${outcome.elapsedMs} ms (${outcome.busyMs} ms busy, ${outcome.frames} frames); villages ${(ctx.villages ?? []).filter((v) => v.revealed !== false).length} seen, ${unseen} unseen; rejected ${JSON.stringify(r.stats.rejected)}`);
        })
        .catch((error) => {
            log.error("site search failed", error);
            state.set({ status: { busy: false, progress: 0, message: "LOC_XPL_ERROR" } });
        });
    return handle;
}
