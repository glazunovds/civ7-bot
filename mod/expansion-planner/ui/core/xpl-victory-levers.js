/**
 * The victory focus's levers: what the autopilot pushes for the science or economic legacy
 * path of each age (research/13-economy-science-paths-by-age.md). Pure module.
 *
 *  - Science:
 *    - Antiquity: codices displayed (3/6/10). Codex slots come from the Library (2) and the
 *      Academy (3); codices from tech masteries and Literacy.
 *    - Exploration: urban tiles with 40 total yield (1/3/5). University tiles, specialists
 *      stacked on one tile, specialist cap from Education and Urban Planning.
 *    - Modern: Innovation projects and a Launch Pad.
 *  - Economy:
 *    - Antiquity: resources assigned, towns included (7/14/20). Resource slots from the
 *      Market (+1) and Lighthouse (+2); resources from improved resource tiles and trade routes.
 *    - Exploration: treasure from convoys out of the Distant Lands (Shipbuilding first).
 *    - Modern: factory resources in settlements with a Factory on the rail network
 *      (150/300/500). A Rail Station in each settlement links them; Ports link across water;
 *      a Factory can only be built once the city is on that network.
 */

// Projects that earn Innovation (science victory points), most per production first (projects.xml
// of each age, projects-gameeffects.xml); a project the game does not offer is skipped.
export const SCIENCE_PROJECTS = [
    "PROJECT_CREWED_SPACE_FLIGHT_PREP",      // 15, repeatable (Launch Pad)
    "PROJECT_INVENT_CALCULUS",               // 10
    "PROJECT_CHART_THE_STARS", "PROJECT_SPHERICAL_EARTH", "PROJECT_HELIOCENTRIC_MODEL",
    "PROJECT_LAUNCH_SATELLITE", "PROJECT_TRANS_OCEANIC_FLIGHT", "PROJECT_BREAK_SOUND_BARRIER",
    "PROJECT_CREWED_SPACE_FLIGHT_RESEARCH",  // 5 each
];
export const LAUNCH_PAD = "BUILDING_LAUNCH_PAD"; // the science victory needs one, undamaged

/** Buildings each settlement gets for the path, in order (one at a time per settlement). */
export const LEVER_BUILDINGS = {
    SCIENCE: {
        AGE_ANTIQUITY: ["BUILDING_LIBRARY", "BUILDING_ACADEMY"],   // 2 + 3 codex slots
        AGE_EXPLORATION: ["BUILDING_UNIVERSITY"],                   // a 40-yield tile's core; +1 science on every quarter tile
        AGE_MODERN: [],                                             // projects and the Launch Pad instead
    },
    ECONOMIC: {
        AGE_ANTIQUITY: ["BUILDING_MARKET", "BUILDING_LIGHTHOUSE"], // +1 / +2 resource slots (gold buildings)
        AGE_EXPLORATION: [],                                       // convoys and the Distant Lands (units)
        AGE_MODERN: ["BUILDING_RAIL_STATION", "BUILDING_PORT", "BUILDING_FACTORY", "BUILDING_STOCK_EXCHANGE"],
    },
};

export function leverBuildings(focus, age) {
    return LEVER_BUILDINGS[focus]?.[age] ?? [];
}

// Research worth taking first for the path: what a node's next research unlocks
// (GameInfo.ProgressionTreeNodeUnlocks TargetType), or the node itself.
const RESEARCH_TARGETS = {
    SCIENCE: [
        /CODEX/,                                   // MOD_AQ_CODEX(_REDUX), MOD_AQ_MATHEMATICS_CODEX, MOD_AQ_CODEX_CIVIC
        "MOD_EX_SPECIALIST_CAP_INCREASE",          // Education, Urban Planning: one more specialist per tile
        ...SCIENCE_PROJECTS, LAUNCH_PAD,
        ...Object.values(LEVER_BUILDINGS.SCIENCE).flat(),
    ],
    ECONOMIC: [
        "UNIT_MERCHANT",                           // trade routes import resources
        "MOD_MO_FACTORY_RESOURCE_GDP",             // Mass Production: factory resources start to count
        ...Object.values(LEVER_BUILDINGS.ECONOMIC).flat(),
    ],
};
const RESEARCH_NODES = {
    ECONOMIC: ["NODE_TECH_EX_SHIPBUILDING"],       // deep ocean, then the Distant Lands (treasure)
};

/** Is this unlock (a TargetType) or this node worth researching first for the path? */
export function wantedResearch(focus, { nodeType = null, targets = [] } = {}) {
    if (nodeType && (RESEARCH_NODES[focus] ?? []).includes(nodeType)) return true;
    const wanted = RESEARCH_TARGETS[focus] ?? [];
    return targets.some((t) => wanted.some((w) => (typeof w === "string" ? w === t : w.test(String(t)))));
}

/**
 * The research to take for the path: among candidates whose next research unlocks something
 * wanted, the quickest. @param candidates [{ node, nodeType, targets, turns }] @returns one or null
 */
export function pickVictoryResearch(focus, candidates) {
    let best = null;
    for (const c of candidates ?? []) {
        if (!wantedResearch(focus, c)) continue;
        if (!best || (c.turns ?? 99) < (best.turns ?? 99)) best = c;
    }
    return best;
}

/**
 * Research toward the path when none of its research is available yet (seen in game: Shipbuilding
 * needs Feudalism and Heraldry, so the economy path's convoys never came in Exploration; Rocketry,
 * the Launch Pad, is 14 techs deep): the goal with the fewest unresearched nodes before it (its
 * prerequisites, transitively), then the quickest available one of those.
 * @param goals [nodeType] the path's research not done yet
 * @param available [{ node, nodeType, turns }]
 * @param prereqsOf (nodeType) -> [nodeType] (GameInfo.ProgressionTreePrereqs)
 * @param isResearched (nodeType) -> bool
 * @returns { via, goal, steps } or null
 */
export function researchToward(goals, available, prereqsOf, isResearched) {
    const byType = new Map((available ?? []).map((a) => [a.nodeType, a]));
    let best = null;
    for (const goal of goals ?? []) {
        const before = new Set();
        const stack = [...(prereqsOf(goal) ?? [])];
        while (stack.length > 0) {
            const n = stack.pop();
            if (before.has(n) || isResearched(n)) continue;
            before.add(n);
            stack.push(...(prereqsOf(n) ?? []));
        }
        const via = [...before].map((n) => byType.get(n)).filter(Boolean).sort((a, b) => (a.turns ?? 99) - (b.turns ?? 99))[0];
        if (!via) continue;
        if (!best || before.size < best.steps || (before.size === best.steps && (via.turns ?? 99) < (best.via.turns ?? 99))) best = { via, goal, steps: before.size };
    }
    return best;
}

// Science: an urban tile (not the city centre) counts once its total yield (all yields) reaches
// this: the Exploration path (5 at 40), and the triumphs of the other ages (Antiquity: 5 at 30,
// LEGACY_AQ_SCIENTIFIC_2; Modern: 5 at 120 «Составная прибыль», +50% production for projects).
export const HIGH_YIELD_DISTRICT = { AGE_ANTIQUITY: 30, AGE_EXPLORATION: 40, AGE_MODERN: 120 };
// What reaching it is worth to a specialist's choice (weighted yield per turn): a path point.
export const HIGH_YIELD_VALUE = 10;

/**
 * Bonus for a specialist that adds `increment` total yield to a tile with `total` now: the full
 * value when it reaches `threshold`, else the share of the way it covers. So specialists stack on
 * the tile closest to the threshold instead of spreading out.
 */
export function highYieldBonus(total, increment, threshold, value = HIGH_YIELD_VALUE) {
    if (!(threshold > 0) || !(increment > 0) || total >= threshold) return 0;
    return value * Math.min(1, increment / (threshold - total));
}

// Economy: a growth tile with a resource. Improving it gains the resource: one more to assign
// (Antiquity), treasure for convoys (Exploration), factory resources (Modern).
export const RESOURCE_TILE_VALUE = 4;
// Economy: merchants trained at once while trade routes are open (imports count as resources).
export const MERCHANTS_AT_ONCE = 2;
