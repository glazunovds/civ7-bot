/**
 * The victory focus's levers: what the autopilot pushes for the science or economic legacy
 * path of each age (research/13-economy-science-paths-by-age.md). Pure module.
 *
 *  - Science:
 *    - Antiquity: codices displayed (3/6/10). Codex slots come from the Library (2) and the
 *      Academy (3); codices from tech masteries and Literacy.
 *    - Exploration: urban tiles with 40 total yield (1/3/5). University tiles, specialists
 *      stacked on one tile, specialist cap from Education and Urban Planning.
 *    - Modern: the three space projects (1/2/3), then the victory: 100 Innovation and an
 *      undamaged Launch Pad (research/14). Projects need their building in the city that runs
 *      them: an Airfield, Launch Pads in several cities (the repeatable Crewed Space Flight
 *      Preparation); Schoolhouse and Laboratory raise science.
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
    "PROJECT_LAUNCH_SATELLITE", "PROJECT_TRANS_OCEANIC_FLIGHT", "PROJECT_BREAK_SOUND_BARRIER", // 5 each
    // Not Crewed Space Flight Research: 5 Innovation for a Radio Station (643 production in game 5's
    // capital) plus 1200, and Radio's mastery; Crewed Space Flight Preparation gives 15 for 2000.
];
// Innovation projects run only where their building already stands: never built for, never researched for (research/31
// §2.6). The Radio Telescope (Crewed Space Flight Research: 5 Innovation for 1200 production) once a Radio Station stands
// there; not in SCIENCE_PROJECTS, since building a Radio Station for it is a poor deal (research/14).
export const STANDING_SITE_PROJECTS = ["PROJECT_CREWED_SPACE_FLIGHT_RESEARCH"];
export const LAUNCH_PAD = "BUILDING_LAUNCH_PAD"; // the science victory needs one, undamaged
// Projects done again and again (no MaxPlayerInstances): every city that may start one keeps one going.
export const REPEATABLE_PROJECTS = new Set(["PROJECT_CREWED_SPACE_FLIGHT_PREP"]);

/**
 * Buildings a science project needs in the city that runs it (projects.xml PrereqConstructible:
 * "Requires a … in the city"), and in how many cities, the best producing first; most important
 * first. Launch Pads: the victory needs one undamaged, and Crewed Space Flight Preparation (15
 * Innovation, repeatable, 2000 production) runs only in a city with its own, so several cities
 * run it at once. Airfield: Trans-Oceanic Flight and Break the Sound Barrier (path milestones 1
 * and 2). `always`: that many are queued whatever it takes (the victory's Launch Pad); the rest
 * only in a city that finishes it within SITE_MAX_TURNS, else bought with gold (seen in game 5: a
 * Radio Station and an Airfield took a 46-production capital 28 turns, and no Launch Pad came).
 * `projects` (else `needs`): the project the final age wants done after it, before the game ends (the
 * cheapest it serves; research/30 §3).
 */
export const SCIENCE_SITES = {
    AGE_MODERN: [
        { type: LAUNCH_PAD, cities: 3, always: 1, projects: ["PROJECT_LAUNCH_SATELLITE"] },
        // Once the building is unlocked (Flight), before its projects can start (Flight's and Aerodynamics' masteries), where
        // the race says it brings the goal sooner: its flights count from the turn the research plan brings their mastery
        // (research/38 §4 C1: no Airfield flight ran in games 28-31, 10 Innovation that needs no Launch Pad).
        { type: "BUILDING_AIRFIELD", cities: 1, always: 0, needs: ["PROJECT_TRANS_OCEANIC_FLIGHT", "PROJECT_BREAK_SOUND_BARRIER"] },
        // The Radio Telescope's (Radio's mastery): 5 Innovation for a Radio Station and 1200 production, in a city without a
        // Launch Pad, the same way (research/38 §4 C1).
        { type: "BUILDING_RADIO_STATION", cities: 1, always: 0, needs: ["PROJECT_CREWED_SPACE_FLIGHT_RESEARCH"] },
    ],
};
export const SITE_MAX_TURNS = 10;

// Innovation (the science victory's points, VICTORY_SCIENCE_MODERN) each project grants (projects-gameeffects.xml:
// EFFECT_PLAYER_GRANT_VICTORY_TRACKER_POINTS, Points); the data layer reads the game's own numbers first.
export const PROJECT_INNOVATION = Object.freeze({ PROJECT_CREWED_SPACE_FLIGHT_PREP: 15, PROJECT_INVENT_CALCULUS: 10 });
export const ONE_OFF_INNOVATION = 5;

// Policies that speed every project (EFFECT_CITY_ADJUST_PROJECT_PRODUCTION): Public Works +30% (Socialism, in the Communism
// branch). Its civic is a science goal once we are in that branch (research/38 §4 E3: games 30 and 31 got Socialism from the
// advisor at M38 and M33). Think Tanks (Globalism) needs Elective Republic: left to the advisor.
export const PROJECT_PRODUCTION_TRADITIONS = Object.freeze(["TRADITION_PUBLIC_WORKS"]);
export const REACH_MAX_TURNS = 300; // the race is not looked at further ahead

// Innovation a technology grants by itself (its *_SCIENCE_VP unlock: progression-trees-tech-gameeffects.xml Points; Rocketry
// and Aerodynamics' mastery 5, Future Tech 3, the other Modern masteries 2); the data layer reads the game's own number first.
export const RESEARCH_INNOVATION = Object.freeze({ MOD_TECH_MO_ROCKETRY_SCIENCE_VP: 5, MOD_TECH_MO_AERODYNAMICS_SCIENCE_VP: 5, MOD_MO_FUTURE_TECH_SCIENCE_VP: 3 });
export const MASTERY_INNOVATION = 2;

/**
 * The order to research what brings Innovation (research/38 §4 C2: game 30 took Flight's mastery and Nuclear Fission, no
 * Innovation, before the 2-point masteries): Innovation per turn of research, the points the research grants itself plus a
 * one-off project it opens where that project's site stands or is queued (Flight's mastery: Trans-Oceanic Flight with an
 * Airfield). Nothing for neither. Ties: the quicker first.
 * @param cands [{ nodeType, points, oneOff, turns }] @returns the ones worth something, best first
 */
export function rankInnovationResearch(cands) {
    const worth = (c) => ((Number(c.points) || 0) + (Number(c.oneOff) || 0)) / Math.max(0.5, Number(c.turns) || 0);
    return (cands ?? []).filter((c) => worth(c) > 0).sort((a, b) => worth(b) - worth(a) || (Number(a.turns) || 0) - (Number(b.turns) || 0));
}

/**
 * When the science victory's Innovation still needed is reached, each city running its projects one after another: its
 * `runs` in order once `wait` turns have passed (the items ahead of them), then `repeat` (Crewed Space Flight Preparation
 * where a Launch Pad stands) again and again. A run with `start` begins no earlier than that turn (a flight waiting for its
 * mastery). Runs done on one turn count together. Research is one more such "city" (spaceRace: its runs are the techs).
 * @param need Innovation still needed
 * @param cities [{ id, wait, runs: [{ key, innovation, turns, cost, start? }], repeat: { key, innovation, turns, cost } | null }]
 * @returns { turn (0: nothing needed; Infinity: not within maxTurns), done: Map(id -> the runs done by then) }
 */
export function innovationReach(need, cities, maxTurns = REACH_MAX_TURNS) {
    const done = new Map((cities ?? []).map((c) => [c.id, []]));
    if (!(need > 0)) return { turn: 0, done };
    const events = [];
    for (const c of cities ?? []) {
        let t = Math.max(0, Number(c.wait) || 0);
        for (const run of c.runs ?? []) {
            t = Math.max(t, Number(run.start) || 0) + Math.max(0, Number(run.turns) || 0);
            if (t <= maxTurns) events.push({ t, id: c.id, run });
        }
        const r = c.repeat;
        if (r && r.turns > 0 && r.innovation > 0) {
            for (t += r.turns; t <= maxTurns; t += r.turns) events.push({ t, id: c.id, run: r });
        }
    }
    events.sort((a, b) => a.t - b.t);
    let sum = 0;
    for (let i = 0; i < events.length;) {
        let j = i;
        for (; j < events.length && events[j].t === events[i].t; j++) {
            sum += Number(events[j].run.innovation) || 0;
            done.get(events[j].id).push(events[j].run);
        }
        if (sum >= need) return { turn: events[i].t, done };
        i = j;
    }
    return { turn: Infinity, done };
}

/**
 * Should a one-off project run next in this city, ahead of its next Crewed Space Flight Preparation run? Preparation
 * gives more Innovation for its production (15 for 2000 against 5 for 1000: research/32 §3), but near the goal a one-off
 * may close the gap sooner (at 95 of 100, Launch Satellite's 5 come in half the time of Preparation's 15). Every place
 * the one-off could take in the city's runs (behind `lock` runs under way), Preparation filling the rest, is tried, and
 * none at all: it runs next only when that place reaches the need strictly soonest (a tie keeps Preparation first).
 * @param race { need, cities, maxTurns } (innovationReach's) @param id the city @param oneOff { key, innovation, turns, cost }
 * @returns { next, at: the reach turn with it next, best: the soonest any other way }
 */
export function oneOffNext(race, id, oneOff, lock = 0) {
    const city = race?.cities?.find((c) => c.id === id);
    if (!city || !(race.need > 0)) return { next: false, at: Infinity, best: 0 };
    const reach = (runs) => innovationReach(race.need, race.cities.map((c) => (c.id === id ? { ...c, runs } : c)), race.maxTurns).turn;
    const extra = city.repeat ? Math.ceil(race.need / Math.max(1, city.repeat.innovation)) + 1 : 0;
    const base = [...(city.runs ?? []), ...Array(extra).fill(city.repeat)];
    const first = Math.min(lock, base.length);
    let best = reach(city.runs ?? []);
    let at = Infinity;
    for (let k = first; k <= base.length; k++) {
        const turn = reach([...base.slice(0, k), oneOff, ...base.slice(k)]);
        if (k === first) at = turn;
        else best = Math.min(best, turn);
    }
    return { next: at < best, at, best };
}

export function scienceSites(age, { pads = null } = {}) {
    const rows = SCIENCE_SITES[age] ?? [];
    return pads > 0 ? rows.map((r) => (r.type === LAUNCH_PAD ? { ...r, cities: pads } : r)) : rows;
}

/** Buildings each settlement gets for the path, in order (one at a time per settlement). */
// The yield tag (TypeTags) of the buildings that serve a path. An Urban Center town may buy this age's
// URBANCENTER buildings (probe P3: Kiln, Observatory, Museum, Port, Schoolhouse); those with this tag are
// the town's levers (Library, Observatory, Schoolhouse for science; research/22 C2).
export const FOCUS_YIELD_TAG = Object.freeze({ SCIENCE: "SCIENCE", ECONOMIC: "GOLD" });

export const LEVER_BUILDINGS = {
    SCIENCE: {
        AGE_ANTIQUITY: ["BUILDING_LIBRARY", "BUILDING_ACADEMY"],   // 2 + 3 codex slots
        AGE_EXPLORATION: ["BUILDING_UNIVERSITY"],                   // a 40-yield tile's core; +1 science on every quarter tile
        AGE_MODERN: ["BUILDING_SCHOOLHOUSE", "BUILDING_LABORATORY"], // science for Rocketry and the 120-yield tiles; projects and their buildings first (SCIENCE_SITES)
    },
    ECONOMIC: {
        AGE_ANTIQUITY: ["BUILDING_MARKET", "BUILDING_LIGHTHOUSE"], // +1 / +2 resource slots (gold buildings)
        AGE_EXPLORATION: [],                                       // convoys and the Distant Lands (units)
        AGE_MODERN: ["BUILDING_RAIL_STATION", "BUILDING_PORT", "BUILDING_FACTORY", "BUILDING_STOCK_EXCHANGE"],
    },
    CULTURE: {
        // The Exploration path counts relics on display: a Temple's relic slot, while relics wait in the archive (LEVER_WHILE;
        // game 60: 10 relics archived E89-E127, up to ~37 turns each; the relic triumph ended 19/20).
        AGE_EXPLORATION: ["BUILDING_TEMPLE"],
    },
};

// A lever building wanted only while a condition holds (the data layer's numbers, passed to leverBuildings): its name.
const LEVER_WHILE = Object.freeze({ BUILDING_TEMPLE: "relicsWaiting" });

/** The path's buildings of an age; one in LEVER_WHILE only while its number in `now` is above 0. */
export function leverBuildings(focus, age, now = {}) {
    return (LEVER_BUILDINGS[focus]?.[age] ?? []).filter((t) => !(t in LEVER_WHILE) || (Number(now[LEVER_WHILE[t]]) || 0) > 0);
}

// The mark steps adds to a node's unlocks when one of them is a wonder granting Innovation (research/23 S2:
// game 8, Society's mastery and the Abbasids' Al-Jabr unlock the House of Wisdom; Egypt built it).
export const INNOVATION_WONDER = "INNOVATION_WONDER";
// The mark steps adds to a node's unlocks when one of them switches on a victory point tracker of the focus's victory
// (EFFECT_PLAYER_ACTIVATE_VICTORY_POINT_TRACKER: Entertainment's celebrations, 2 culture points each; game 60's celebrations
// at A43 and A80 earned nothing, Entertainment came at A94).
export const FOCUS_VP_TRACKER = "FOCUS_VP_TRACKER";

// Research worth taking first for the path: what a node's next research unlocks
// (GameInfo.ProgressionTreeNodeUnlocks TargetType), or the node itself.
const RESEARCH_TARGETS = {
    SCIENCE: [
        INNOVATION_WONDER,                         // research unlocking a wonder that grants Innovation (steps marks it)
        /CODEX/,                                   // MOD_AQ_CODEX(_REDUX), MOD_AQ_MATHEMATICS_CODEX, MOD_AQ_CODEX_CIVIC
        // One more specialist per tile, every age's (research/40 A1: not only Exploration's Education and Urban Planning, also
        // Antiquity's Currency, Modern's Electricity and Capitalism, and the Test of Time's for a tall civilization).
        /SPECIALIST_CAP_INCREASE$/,
        ...SCIENCE_PROJECTS, LAUNCH_PAD,
        ...Object.values(LEVER_BUILDINGS.SCIENCE).flat(),
        ...Object.values(SCIENCE_SITES).flat().map((site) => site.type),
    ],
    // The culture path's research (research/40 B9: the culture focus had none, every civic came from the advisor): wonders
    // (Antiquity's path), relics and their slots (Exploration's: Theology, the masteries' relics), artifacts (Modern's:
    // Natural History's Explorers and Museums, Hegemony's archaeology), and the masteries granting culture points.
    CULTURE: [
        /^WONDER_/,                                // steps leaves out a wonder whose race is not ours (game 60: Discipline, Tactics)
        /RELIC/,
        /ARCHAEOLOGY$/,
        "UNIT_EXPLORER", "BUILDING_MUSEUM",
        /_(CULTURE|TOURISM)_VP(_UI)?$/,
        /_CELEBRATION_VP$/,                        // MOD_AQ_ENTERTAINMENT_CELEBRATION_VP (when the effect tables do not answer)
        FOCUS_VP_TRACKER,
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

// Research that gates the focus's victory: until it is researched, research goes only its way (its
// prerequisites; among them the path's wanted ones first), and masteries and side research wait.
// Science: the node unlocking the Launch Pad (Rocketry: also Launch Satellite and the repeatable Crewed
// Space Flight Preparation, the victory itself). Seen in game 5: Radio's and Flight's masteries
// (Crewed Space Flight Research, Trans-Oceanic Flight) were taken first, about 6000 science, and
// Rocketry was never reached in 46 turns; it needs 14 of the 17 Modern techs.
/**
 * Research gates per age (research/21 D1): what the focus's research goes to first, prerequisites
 * and masteries included. Science: Antiquity Spherical Earth and Chart the Stars (Mathematics,
 * Navigation), Exploration Invent Calculus and Heliocentric Model (the Urban Planning and Education
 * masteries: seen in game 6, Calculus came at Exploration turn 65), Modern the Launch Pad (Rocketry).
 */
export const RESEARCH_GATES = {
    SCIENCE: {
        AGE_ANTIQUITY: ["PROJECT_SPHERICAL_EARTH", "PROJECT_CHART_THE_STARS"],
        AGE_EXPLORATION: ["PROJECT_INVENT_CALCULUS", "PROJECT_HELIOCENTRIC_MODEL"],
        AGE_MODERN: [LAUNCH_PAD],
    },
};

/** The research gates of a focus in an age (unlock targets). */
export function gateTargets(focus, age) {
    return RESEARCH_GATES[focus]?.[age] ?? [];
}

/** Does research unlocking these targets gate the focus's victory in that age (default: the final one, the Launch Pad)? */
export function isGateResearch(focus, targets, age = "AGE_MODERN") {
    const gates = gateTargets(focus, age);
    return (targets ?? []).some((t) => gates.includes(t));
}

/** Innovation (science victory points) expected by the end of each age (research/20: experts enter Modern with 76-95). */
// Exploration 55: research/14's sources give Exploration 20-35 (projects 15, masteries 8, Social Class 2,
// wonders); the web's "76-95 entering Modern" does not match this game's data (research/22 A5).
export const INNOVATION_TARGETS = Object.freeze({ AGE_ANTIQUITY: 25, AGE_EXPLORATION: 55, AGE_MODERN: 100 });

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

// Research that grants the focus's victory points by itself, taken once nothing of the path is
// left to research or reach: science, the tech masteries and civics whose unlock is a
// *_SCIENCE_VP modifier (2 to 5 Innovation each, about 20 in a game; research/14). Not before:
// the path's research (Rocketry is 14 techs deep) gates far more.
const BONUS_TARGETS = {
    SCIENCE: [/_SCIENCE_VP$/],
    // Culture (research/40 B9): Future Civic's culture points (Modern: +10 and an artifact, about 15 points, more than a
    // Modern wonder's 12) once nothing else of the path is left.
    CULTURE: [/_(CULTURE|TOURISM)_VP$/, "MOD_MO_ARTIFACT"],
};

/** The quickest candidate whose next research grants the focus's victory points, or null. */
export function pickBonusResearch(focus, candidates) {
    const wanted = BONUS_TARGETS[focus] ?? [];
    let best = null;
    for (const c of candidates ?? []) {
        if (!(c.targets ?? []).some((t) => wanted.some((w) => (typeof w === "string" ? w === t : w.test(String(t)))))) continue;
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
// a mark, and each mark wants HIGH_YIELD_COUNT such tiles: the Exploration path (5 at 40), then
// its triumph (5 at 75, LEGACY_EX_SCIENTIFIC_1: +1 specialist in every city), and the triumphs
// of the other ages (Antiquity: 5 at 30, LEGACY_AQ_SCIENTIFIC_2, +1 specialist; Modern: 5 at 120
// «Составная прибыль», +50% production for projects).
export const HIGH_YIELD_DISTRICT = { AGE_ANTIQUITY: [30], AGE_EXPLORATION: [40, 75], AGE_MODERN: [120] };
export const HIGH_YIELD_COUNT = 5;
// What reaching it is worth to a specialist's choice (weighted yield per turn): a path point.
export const HIGH_YIELD_VALUE = 10;

/**
 * The mark specialists aim at now: the age's first one that fewer than HIGH_YIELD_COUNT of our
 * urban tiles reach (`totals`: each urban tile's total yield), else 0 (all done).
 */
export function highYieldTarget(age, totals) {
    for (const mark of HIGH_YIELD_DISTRICT[age] ?? []) {
        if ((totals ?? []).filter((v) => v >= mark).length < HIGH_YIELD_COUNT) return mark;
    }
    return 0;
}

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
