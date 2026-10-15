/**
 * Which Town Focus (specialization) to choose. Pure module.
 *
 * Game facts (Projects table and Civilopedia, base game 1.5):
 *  - every Focus needs population 7 (PrereqPopulation) and, except "Growing Town",
 *    stops the town growing and sends all its Food to its connected cities;
 *  - a town's Production is converted into Gold, so Mining's +2 Production per
 *    improvement is +2 Gold per improvement;
 *  - Hub Town: at most one per continent (MaxSpecializationInstancesOnContinent).
 * Focus projects and what each adds (counts come from the town's own tiles):
 *   FARM      PROJECT_TOWN_GRANARY / _FISHING  +1 Food per farm, pasture, plantation, fishing boat
 *   MINE      PROJECT_TOWN_PRODUCTION          +2 Production (= Gold) per woodcutter, camp, clay pit, mine, quarry
 *   RESORT    PROJECT_TOWN_RESORT              +1 Happiness and +1 Gold per appealing tile
 *   URBAN     PROJECT_TOWN_URBAN_CENTER        +1 Science and +1 Culture per quarter
 *   HUB       PROJECT_TOWN_INN                 +1 Influence per connected settlement
 *   RELIGIOUS PROJECT_TOWN_TEMPLE              +2 Happiness per building (+ relic slots)
 *   TRADE     PROJECT_TOWN_TRADE               +1 Happiness per resource tile (+5 trade range; distant lands)
 * Fort Town (and Factory Town) add no yields we can weigh: never recommended by value.
 */
import { dot, F, G, S, C, H, I } from './xpl-yields.js';

export const FOCUS_PROJECTS = Object.freeze({
    FARM: ["PROJECT_TOWN_GRANARY", "PROJECT_TOWN_FISHING"],
    MINE: ["PROJECT_TOWN_PRODUCTION"],
    RESORT: ["PROJECT_TOWN_RESORT"],
    URBAN: ["PROJECT_TOWN_URBAN_CENTER"],
    HUB: ["PROJECT_TOWN_INN"],
    RELIGIOUS: ["PROJECT_TOWN_TEMPLE"],
    TRADE: ["PROJECT_TOWN_TRADE"],
});

export const FOCUS_POPULATION = 7;

const FARM_IMPROVEMENT = /^IMPROVEMENT_(FARM|TERRACE_FARM|PASTURE|PLANTATION|FISHING_BOAT|HAWAII_FISHING_BOAT)(_RESOURCE)?$/;
const MINE_IMPROVEMENT = /^IMPROVEMENT_(WOODCUTTER|CAMP|CLAY_PIT|MINE|QUARRY)(_RESOURCE)?$/;

/** "FARM" | "MINE" | null for an improvement type. */
export function improvementKind(type) {
    if (FARM_IMPROVEMENT.test(type)) return "FARM";
    if (MINE_IMPROVEMENT.test(type)) return "MINE";
    return null;
}

function gainVector(entries) {
    const v = [0, 0, 0, 0, 0, 0, 0];
    for (const [i, n] of entries) v[i] += n;
    return v;
}

/**
 * @param t { farm, mine, appealing, quarters, buildings, resources, connectedSettlements,
 *            connectedCities, population, available: Set<ProjectType> | null, current: ProjectType | "GROWTH" | null,
 *            urbanBuys: buildings of the focus an Urban Center would let the town buy }
 * @param bias the strategy's lean per Focus key (townFocusBias); with a lean to Urban Center, a town that could
 *             buy a building of the path there takes it even with no quarter yet (research/22 C2)
 * @param weights profile yield weights
 * @returns { best, options: [{ key, project, gain, value, count, availableNow, current }], notes: [{ key, args }] }
 */
export function recommendFocus(t, weights, bias = null) {
    const defs = [
        { key: "FARM", count: t.farm ?? 0, gain: gainVector([[F, t.farm ?? 0]]) },
        { key: "MINE", count: t.mine ?? 0, gain: gainVector([[G, 2 * (t.mine ?? 0)]]) },
        { key: "RESORT", count: t.appealing ?? 0, gain: gainVector([[H, t.appealing ?? 0], [G, t.appealing ?? 0]]) },
        { key: "URBAN", count: t.quarters ?? 0, opens: Number(bias?.URBAN) > 0 ? t.urbanBuys ?? 0 : 0, gain: gainVector([[S, t.quarters ?? 0], [C, t.quarters ?? 0]]) },
        { key: "HUB", count: t.connectedSettlements ?? 0, gain: gainVector([[I, t.connectedSettlements ?? 0]]) },
        { key: "RELIGIOUS", count: t.buildings ?? 0, gain: gainVector([[H, 2 * (t.buildings ?? 0)]]) },
        { key: "TRADE", count: t.resources ?? 0, gain: gainVector([[H, t.resources ?? 0]]) },
    ];
    const available = t.available ?? null;
    const options = defs.map((d) => {
        const projects = FOCUS_PROJECTS[d.key];
        const usable = available ? projects.filter((p) => available.has(p)) : projects;
        return {
            ...d,
            project: usable[0] ?? projects[0],
            // The strategy's lean (core/xpl-strategy.js townFocusBias: Growth leans to farming, science to Urban Center...).
            value: Math.round((dot(weights, d.gain) + (d.count > 0 || d.opens > 0 ? Number(bias?.[d.key]) || 0 : 0)) * 10) / 10,
            // Unknown availability (no list from the game): assume the common ones exist.
            availableNow: available ? usable.length > 0 : !["HUB", "RELIGIOUS", "TRADE"].includes(d.key),
            current: projects.includes(t.current),
        };
    }).filter((o) => o.count > 0 || o.opens > 0 || o.current);
    options.sort((a, b) => Number(b.availableNow) - Number(a.availableNow) || b.value - a.value);
    const notes = [];
    if ((t.population ?? 0) < FOCUS_POPULATION) notes.push({ key: "LOC_XPL_FOCUS_GROW_FIRST", args: [t.population ?? 0] });
    if ((t.connectedCities ?? 0) === 0) notes.push({ key: "LOC_XPL_FOCUS_NOT_CONNECTED", args: [] });
    // A town whose Focus cannot unlock yet still gets a recommendation for later.
    const best = options.find((o) => o.availableNow && o.value > 0) ?? options.find((o) => o.value > 0) ?? null;
    return { best, options, notes, current: t.current ?? null };
}
