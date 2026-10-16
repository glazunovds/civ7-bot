// The victory focus's levers in the Antiquity and Exploration ages (research/13): research that
// unlocks the path's work, the path's buildings in every city, growth toward resource tiles
// (economy) or 40-yield urban tiles (Exploration science), merchants while trade routes are open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, hash } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 8, y: 8 }, SPARTA = { x: 14, y: 8 };
const PLAIN = { x: 10, y: 8 };      // food 3
const WINE = { x: 10, y: 9 };       // food 2, wine
const NEAR = { x: 9, y: 8 };        // urban: 36 total yield
const FAR = { x: 7, y: 8 };         // urban: 20 total yield
const world = {
    width: 24, height: 16, wrapX: false,
    tiles: (x, y) => {
        if (x === PLAIN.x && y === PLAIN.y) return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 3 } };
        if (x === WINE.x && y === WINE.y) return { terrain: "TERRAIN_FLAT", resource: "RESOURCE_WINE", yields: { YIELD_FOOD: 2 } };
        if (x === NEAR.x && y === NEAR.y) return { terrain: "TERRAIN_FLAT", yields: { YIELD_SCIENCE: 30, YIELD_GOLD: 6 } };
        if (x === FAR.x && y === FAR.y) return { terrain: "TERRAIN_FLAT", yields: { YIELD_SCIENCE: 20 } };
        if (x === ATHENS.x && y === ATHENS.y) return { terrain: "TERRAIN_FLAT", yields: { YIELD_SCIENCE: 38 } };
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } };
    },
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        // A Library with two empty slots: codex masteries are wanted only with room for codices (research/24 P6).
        { owner: 0, ...ATHENS, name: "Athens", pop: 5, prod: 12, gwBuildings: [{ type: "BUILDING_LIBRARY", slots: [-1, -1] }] },
        { owner: 0, ...SPARTA, name: "Sparta", pop: 3, prod: 6 },
        { owner: 1, x: 20, y: 4, name: "Babylon" },
    ],
    research: { tech: { available: [] }, culture: { available: [] } },
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { growthAdvice } = await import("../mod/expansion-planner/ui/data/xpl-growth-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (p) => GameplayMap.getIndexFromXY(p.x, p.y);
const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const chosen = (op) => fake.sent.filter((s) => s.op === op).map((s) => s.args.ProgressionTreeNodeType);
const builds = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => [s.id.id, s.args.ConstructibleType ?? s.args.UnitType]);
const athens = () => Players.get(0).Cities.getCities()[0];

test("research: the path's unlocks first (a codex mastery once the base is researched, Literacy, Code of Laws); else the advisor", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE, CIVIC = PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    world.treeRecs = (subject) => [{ recommendedType: N(subject === AdvisorySubjectTypes.CHOOSE_TECH ? "NODE_TECH_AQ_POTTERY" : "NODE_CIVIC_AQ_MAIN_MYSTICISM"), whichAdvisors: [] }];
    // The path's research directly available (the way toward it through prerequisites: next test).
    const prereqs = GameInfo.ProgressionTreePrereqs;
    GameInfo.ProgressionTreePrereqs = [];
    try {
        // Masonry's codex comes with its mastery (depth 2): not yet wanted while Masonry itself is next.
        world.research = { tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] } };
        fake.sent.length = 0;
        assert.equal(steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE")?.key, "TECH");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_POTTERY")], "the advisor's");
        world.research.depth = { NODE_TECH_AQ_MASONRY: 1 };
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_MASONRY")], "the mastery gives a codex");
        assert.equal(r.key, "VICTORY_TECH");
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_POTTERY")], "no focus: the advisor's");
        // Civics: Literacy (a codex) for science, Code of Laws (merchants) for economy; Foundation's
        // codex needs a scientific attribute trait, so it is not counted.
        world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_AQ_MAIN_MYSTICISM"), N("NODE_CIVIC_AQ_MAIN_LITERACY"), N("NODE_CIVIC_AQ_MAIN_CODE_OF_LAWS"), N("NODE_CIVIC_AQ_FOUNDATION")] } };
        fake.sent.length = 0;
        assert.equal(steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE")?.key, "VICTORY_CIVIC");
        assert.deepEqual(chosen(CIVIC), [N("NODE_CIVIC_AQ_MAIN_LITERACY")]);
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "ECONOMIC");
        assert.deepEqual(chosen(CIVIC), [N("NODE_CIVIC_AQ_MAIN_CODE_OF_LAWS")]);
        world.research.culture.available = [N("NODE_CIVIC_AQ_MAIN_MYSTICISM"), N("NODE_CIVIC_AQ_FOUNDATION")];
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(CIVIC), [N("NODE_CIVIC_AQ_MAIN_MYSTICISM")], "Foundation's codex is not ours: the advisor's");
    } finally {
        GameInfo.ProgressionTreePrereqs = prereqs;
        delete world.treeRecs;
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});

test("research: none of the path's research available yet: the way toward the nearest (Pottery, then Writing's Library)", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    world.treeRecs = () => [{ recommendedType: N("NODE_TECH_AQ_ANIMAL_HUSBANDRY"), whichAdvisors: [] }];
    world.research = { tech: { available: [N("NODE_TECH_AQ_ANIMAL_HUSBANDRY"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] }, depth: { NODE_TECH_AQ_AGRICULTURE: 1 } };
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_POTTERY")], JSON.stringify(r));
        assert.equal(r.key, "VICTORY_TECH");
        assert.match(r.args[0], /→/, "names the goal");
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_ANIMAL_HUSBANDRY")], "no focus: the advisor's");
    } finally {
        delete world.treeRecs;
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});

test("research: nothing of the path left to research or reach: what grants Innovation by itself (Future Tech: 2); never before the path's own", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    world.treeRecs = () => [{ recommendedType: N("NODE_TECH_AQ_POTTERY"), whichAdvisors: [] }];
    // No prerequisites known: no way toward the path's other research.
    const prereqs = GameInfo.ProgressionTreePrereqs;
    GameInfo.ProgressionTreePrereqs = [];
    try {
        world.research = { tech: { available: [N("NODE_TECH_AQ_POTTERY"), N("NODE_TECH_AQ_FUTURE_TECH")] }, culture: { available: [] } };
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_FUTURE_TECH")], JSON.stringify(r));
        assert.equal(r.key, "VICTORY_TECH");
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "ECONOMIC");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_POTTERY")], "economy: the advisor's");
        // The path's own research (a codex mastery) comes first.
        world.research = { tech: { available: [N("NODE_TECH_AQ_FUTURE_TECH"), N("NODE_TECH_AQ_MASONRY")] }, culture: { available: [] }, depth: { NODE_TECH_AQ_MASONRY: 1 } };
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_MASONRY")]);
    } finally {
        GameInfo.ProgressionTreePrereqs = prereqs;
        delete world.treeRecs;
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});

test("buildings: science gets a Library and an Academy in every city (codex slots), economy a Market and a Lighthouse (resource slots)", () => {
    const offered = new Set(["BUILDING_LIBRARY", "BUILDING_ACADEMY", "BUILDING_MARKET"]);
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : offered.has(type) ? { Success: true, Plots: [GameplayMap.getIndexFromXY(id.id === 0 ? 9 : 15, 9)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.costOf = () => 50; // both cities build them within 12 turns (leverSoon)
    try {
        fake.sent.length = 0;
        const out = steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), [[0, C("BUILDING_LIBRARY")], [0, C("BUILDING_ACADEMY")], [1, C("BUILDING_LIBRARY")], [1, C("BUILDING_ACADEMY")]]);
        assert.ok(out.length === 4 && out.every((e) => e.key === "VICTORY_WORK"));
        fake.sent.length = 0;
        steps.pushVictoryWork("ECONOMIC");
        assert.deepEqual(builds(), [[0, C("BUILDING_MARKET")], [1, C("BUILDING_MARKET")]], "no Lighthouse inland (the game offers none)");
        // A Library already queued behind something else goes to the front.
        world.cities[1].queue = { type: "BUILDING_GRANARY", turns: 3 };
        world.cities[1].queued = ["BUILDING_LIBRARY"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        const move = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([move?.id.id, move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [1, 1, 0]);
    } finally {
        delete world.canBuild;
        delete world.costOf;
        delete world.cities[1].queue;
        delete world.cities[1].queued;
    }
});

test("the path's buildings only where built within 12 turns, and in the final age with 10 turns left to pay (game 16: Laboratories took 25-36 turns)", () => {
    const offered = new Set(["BUILDING_LIBRARY", "BUILDING_ACADEMY"]);
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : offered.has(type) ? { Success: true, Plots: [GameplayMap.getIndexFromXY(id.id === 0 ? 9 : 15, 9)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.costOf = () => 120; // Athens (12) 10 turns, Sparta (6) 20 turns
    try {
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds().map(([id]) => id), [0, 0], "Athens only");
        // Sparta's Library already queued behind a Granary: not moved ahead (20 turns).
        world.cities[1].queue = { type: "BUILDING_GRANARY", turns: 3 };
        world.cities[1].queued = ["BUILDING_LIBRARY"];
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.equal(fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo && s.id.id === 1), undefined);
        // The final age's last turns: nothing that would not pay.
        world.finalAge = true;
        world.agePoints = 96;
        delete world.cities[1].queue;
        delete world.cities[1].queued;
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds(), [], "10 turns to build, too few left to pay");
    } finally {
        delete world.canBuild;
        delete world.costOf;
        delete world.finalAge;
        delete world.agePoints;
        delete world.cities[1].queue;
        delete world.cities[1].queued;
    }
});

test("a non-final age's last turns: no path building that is done only after the age ends (game 22: three Universities lost when Exploration ended)", () => {
    const offered = new Set(["BUILDING_LIBRARY", "BUILDING_ACADEMY"]);
    world.canBuild = (type, id) => (type === undefined ? { Success: true } : offered.has(type) ? { Success: true, Plots: [GameplayMap.getIndexFromXY(id.id === 0 ? 9 : 15, 9)], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.costOf = () => 60; // Athens (12) 5 turns, Sparta (6) 10 turns
    const samples = Database.makeHash("_XPL_OBJ_AGE_SAMPLES");
    try {
        GameTutorial.setProperty(samples, null);
        world.agePoints = 95; // about 6 turns left
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE");
        assert.deepEqual(builds().map(([id]) => id), [0, 0], "Athens only: Sparta's would be done after the age ends");
    } finally {
        delete world.canBuild;
        delete world.costOf;
        delete world.agePoints;
        GameTutorial.setProperty(samples, null);
    }
});

test("growth, economy: a tile with a resource beats a slightly richer one", () => {
    world.expand = () => ({ Success: true, Plots: [idx(PLAIN), idx(WINE)], ConstructibleTypes: [] });
    try {
        let a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.deepEqual([a.best.x, a.best.y], [PLAIN.x, PLAIN.y], "no focus: the richer tile");
        a = growthAdvice(athens().id, DEFAULT_SETTINGS, { victory: "ECONOMIC" });
        assert.deepEqual([a.best.x, a.best.y], [WINE.x, WINE.y]);
        assert.equal(a.best.resource, true);
        a = growthAdvice(athens().id, DEFAULT_SETTINGS, { victory: "SCIENCE" });
        assert.deepEqual([a.best.x, a.best.y], [PLAIN.x, PLAIN.y], "science: no resource bonus");
    } finally {
        delete world.expand;
    }
});

test("growth, science: specialists stack on the urban tile closest to the age's high-yield mark (Exploration path 40, Antiquity triumph 30; not the city centre)", () => {
    const sci = GameInfo.Yields.lookup("YIELD_SCIENCE").$index;
    const arr = (v) => Array.from(GameInfo.Yields, (_y, i) => (i === sci ? v : 0));
    const slot = (p, add) => ({ PlotIndex: idx(p), IsBlocked: false, NumWorkers: 0, MaxWorkers: 2, CurrentYields: arr(0), NextYields: arr(add), CurrentMaintenance: arr(0), NextMaintenance: arr(0) });
    // NEAR (36) +5 reaches 40; FAR (20) +6 does not; the centre (38) +6 would, but does not count.
    world.workers = () => [slot(NEAR, 5), slot(FAR, 6), slot(ATHENS, 6)];
    const age = Game.age;
    try {
        // Antiquity: the triumph's 30 instead: NEAR (36) counts already, FAR (20) is on its way.
        let a = growthAdvice(athens().id, DEFAULT_SETTINGS, { victory: "SCIENCE" });
        assert.equal(a.bestSpecialist.idx, idx(FAR));
        assert.equal(a.specialists.find((s) => s.idx === idx(NEAR)).highYield, false);
        assert.equal(a.specialists.find((s) => s.idx === idx(FAR)).highYield, true);
        Game.age = hash("AGE_EXPLORATION");
        a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.notEqual(a.bestSpecialist.idx, idx(NEAR), "no focus: the bigger yield");
        a = growthAdvice(athens().id, DEFAULT_SETTINGS, { victory: "SCIENCE" });
        assert.equal(a.bestSpecialist.idx, idx(NEAR));
        assert.equal(a.bestSpecialist.highYield, true);
        assert.equal(a.specialists.find((s) => s.idx === idx(ATHENS)).highYield, false, "the city centre is not a district");
        // 5 urban tiles at 40 already (the path is done): the triumph's 75 is next, NEAR's +5 no longer counts.
        const ring = GameplayMap.getPlotIndicesInRadius(ATHENS.x, ATHENS.y, 1).map((i) => GameplayMap.getLocationFromIndex(i))
            .filter((l) => ![ATHENS, NEAR, FAR].some((p) => p.x === l.x && p.y === l.y)).slice(0, 3);
        const forty = new Set(ring.map((p) => `${p.x},${p.y}`));
        const urban = new Set([NEAR, FAR, ...ring].map((p) => `${p.x},${p.y}`));
        world.structures = (x, y) => ({ district: urban.has(`${x},${y}`) ? "DISTRICT_URBAN" : null, constructibles: [] });
        const tiles = world.tiles;
        world.tiles = (x, y) => (forty.has(`${x},${y}`) ? { terrain: "TERRAIN_FLAT", yields: { YIELD_SCIENCE: 45 } } : x === NEAR.x && y === NEAR.y ? { terrain: "TERRAIN_FLAT", yields: { YIELD_SCIENCE: 40 } } : x === FAR.x && y === FAR.y ? { terrain: "TERRAIN_FLAT", yields: { YIELD_SCIENCE: 72 } } : tiles(x, y));
        try {
            a = growthAdvice(athens().id, DEFAULT_SETTINGS, { victory: "SCIENCE" });
            assert.equal(a.bestSpecialist.idx, idx(FAR), JSON.stringify(a.specialists));
            assert.equal(a.bestSpecialist.highYield, true, "FAR (72) +6 reaches 75");
            assert.ok(a.specialists.find((s) => s.idx === idx(NEAR)).gain < a.bestSpecialist.gain - 5, "NEAR's +5 is far from 75");
        } finally {
            world.tiles = tiles;
            delete world.structures;
        }
    } finally {
        Game.age = age;
        delete world.workers;
    }
});

test("merchants, economy: trained while trade routes are open, up to 2 at a time", () => {
    const B = { owner: 1, id: 0 };
    world.tradeRoutes = [{ targetCityId: B, status: [TradeRouteStatus.SUCCESS], importPayloads: [{}], exportYields: [] }];
    world.canBuild = (type) => ({ Success: type === "UNIT_MERCHANT" });
    const merchants = () => builds().filter(([, t]) => t === GameInfo.Units.lookup("UNIT_MERCHANT").$hash).length;
    const options = { merchants: true, victory: "ECONOMIC", profile: "GOLD" };
    // Both cities busy: an empty queue would take any unit as a last resort (merchants are added to busy ones).
    for (const c of world.cities.slice(0, 2)) c.queue = { type: "BUILDING_GRANARY", turns: 3 };
    try {
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), options);
        assert.equal(merchants(), 1, "one route open: one merchant");
        assert.ok(out.some((e) => e.key === "QUEUED_MERCHANT"));
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { ...options, victory: "SCIENCE" });
        assert.equal(merchants(), 0, "not for science");
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { ...options, merchants: false });
        assert.equal(merchants(), 0, "not without the merchants option");
        // Babylon's civ takes no more routes from us.
        world.tradeCapacity = () => 0;
        fake.sent.length = 0;
        steps.fillProduction(new Map(), options);
        assert.equal(merchants(), 0, "no route open");
        delete world.tradeCapacity;
        // A merchant already on its way: the one route is covered.
        world.units = [{ id: 5, type: "UNIT_MERCHANT", x: 9, y: 9 }];
        fake.sent.length = 0;
        steps.fillProduction(new Map(), options);
        assert.equal(merchants(), 0, "covered");
    } finally {
        delete world.tradeRoutes;
        delete world.canBuild;
        delete world.tradeCapacity;
        for (const c of world.cities.slice(0, 2)) delete c.queue;
        world.units = [];
    }
});

test("science, Antiquity: the research gates (Mathematics' Spherical Earth, Navigation's Chart the Stars) come before a quicker path research off their way (research/21 D1)", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    world.research = {
        tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_MATHEMATICS")] }, culture: { available: [] },
        depth: { NODE_TECH_AQ_MASONRY: 1 }, turns: { NODE_TECH_AQ_MASONRY: 2, NODE_TECH_AQ_MATHEMATICS: 8 },
    };
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_MATHEMATICS")], `not Masonry's codex mastery (2 turns): ${JSON.stringify(r)}`);
        assert.equal(r.key, "VICTORY_TECH");
        // Both gates reached: the quicker codex mastery.
        world.research.depth = { NODE_TECH_AQ_MASONRY: 1, NODE_TECH_AQ_MATHEMATICS: 1, NODE_TECH_AQ_NAVIGATION: 1 };
        world.research.tech.available = [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_MATHEMATICS")];
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_MASONRY")]);
    } finally {
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});

test("Future Tech is taken again after the first (repeatable: 2 Innovation each time; research/21 L2)", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const prereqs = GameInfo.ProgressionTreePrereqs;
    GameInfo.ProgressionTreePrereqs = [];
    world.research = { tech: { available: [N("NODE_TECH_AQ_FUTURE_TECH")] }, culture: { available: [] }, depth: { NODE_TECH_AQ_FUTURE_TECH: 1 } };
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_FUTURE_TECH")], JSON.stringify(r));
        assert.equal(r.key, "VICTORY_TECH");
    } finally {
        GameInfo.ProgressionTreePrereqs = prereqs;
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});

test("no Future Tech while a rival is near a dominance win (it advances the age: every multiple falls)", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const prereqs = GameInfo.ProgressionTreePrereqs;
    GameInfo.ProgressionTreePrereqs = [];
    world.treeRecs = () => [{ recommendedType: N("NODE_TECH_AQ_POTTERY"), whichAdvisors: [] }];
    world.research = { tech: { available: [N("NODE_TECH_AQ_POTTERY"), N("NODE_TECH_AQ_FUTURE_TECH")] }, culture: { available: [] } };
    try {
        fake.sent.length = 0;
        steps.chooseResearch("tech", { ...DEFAULT_SETTINGS, strategy: { noFutureTech: true } }, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_POTTERY")]);
    } finally {
        GameInfo.ProgressionTreePrereqs = prereqs;
        delete world.treeRecs;
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});

test("a codex mastery is wanted only with room for the codex: empty great-work slots, or a building with slots queued (research/24 P6: 5 codices archived)", () => {
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const athens = world.cities[0];
    const slots = athens.gwBuildings;
    world.treeRecs = () => [{ recommendedType: N("NODE_TECH_AQ_POTTERY"), whichAdvisors: [] }];
    const prereqs = GameInfo.ProgressionTreePrereqs;
    GameInfo.ProgressionTreePrereqs = [];
    try {
        world.research = { tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] }, depth: { NODE_TECH_AQ_MASONRY: 1 } };
        athens.gwBuildings = [{ type: "BUILDING_LIBRARY", slots: [7, 8] }];
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_POTTERY")], "both slots full: the advisor's");
        athens.gwBuildings = [{ type: "BUILDING_LIBRARY", slots: [7, -1] }];
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(TECH), [N("NODE_TECH_AQ_MASONRY")], "one slot free");
    } finally {
        athens.gwBuildings = slots;
        GameInfo.ProgressionTreePrereqs = prereqs;
        delete world.treeRecs;
        world.research = { tech: { available: [] }, culture: { available: [] } };
    }
});
