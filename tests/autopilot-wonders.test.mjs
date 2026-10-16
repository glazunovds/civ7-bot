// Autopilot wonders: an empty queue starts the wonder the Wonders tab rates best (a race
// we can win, finishing this age, best value per production turn) on its best tile; only
// `maxWonders` at once; a wonder a rival is about to finish is not started.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";

const W = 26, H = 16;
const grid = new HexGrid(W, H, false);
const A = { x: 6, y: 8 };
const B = { x: 16, y: 8 };
const tileNear = (c, dx) => grid.index(c.x + dx, c.y);
const world = {
    width: W, height: H, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: [A, B].some((c) => grid.distanceXY(x, y, c.x, c.y) <= 2) ? 0 : -1 }),
    structures: (x, y) => ([A, B].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: A.x, y: A.y, name: "Athens", pop: 8, prod: 30 },
        // 15 turns for a wonder: the longest a wonder may take (research/24 P5).
        { owner: 0, x: B.x, y: B.y, name: "Sparta", pop: 6, prod: 20 },
        // A rival a few turns from the Pyramids (omniscient mode reads it; fair mode sees nothing).
        { owner: 1, x: 22, y: 3, name: "Babylon", pop: 6, prod: 20, queue: { type: "WONDER_PYRAMIDS", turns: 2, pct: 90 } },
    ],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100),
    canBuild: (type, id, args) => {
        if (!type.startsWith("WONDER_")) return { Success: true, Plots: [], ExpandUrbanPlots: [] };
        if (!["WONDER_PYRAMIDS", "WONDER_HANGING_GARDENS"].includes(type)) return { Success: false, Plots: [], FailureReasons: ["LOC_LOCKED"] };
        const c = id.id === 0 ? A : B;
        return { Success: true, Plots: [tileNear(c, 1), tileNear(c, -1)], ExpandUrbanPlots: [] };
    },
    agePoints: 20,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
// Sites known for the next settler (the Settlements search found some): expansion is real.
const sitesKnown = (on) => state.set({ results: { ...state.get().results, sites: on ? { picks: [{ x: 1, y: 1 }], computedTurn: Game.turn } : null } });

const wonderOrders = () => fake.sent.filter((s) => s.kind === "operation" && GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleClass === "WONDER");

test("the final age ends the game too: no wonder that cannot finish before it (research/24 F3: Dogo Onsen, Ubudiah)", () => {
    try {
        world.finalAge = true;
        world.agePoints = 95; // about 6 turns left; the Pyramids take 10 in Athens
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1).size, 0);
    } finally {
        delete world.finalAge;
        world.agePoints = 20;
    }
});

test("the fastest city starts the best wonder on its best tile; only one at a time", () => {
    const picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
    assert.equal(picks.size, 1);
    const [cityKey, pick] = [...picks][0];
    assert.equal(cityKey, `c:${A.x}-${A.y}`, "Athens has more production than Sparta");
    const out = steps.fillProduction(picks);
    const orders = wonderOrders();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].id.id, 0);
    assert.deepEqual([orders[0].args.X, orders[0].args.Y], [pick.x, pick.y]);
    assert.ok(out.some((e) => e.key === "QUEUED_WONDER"));
    assert.ok(out.some((e) => ["QUEUED_ADVISOR", "QUEUED_PLAN", "QUEUED_FALLBACK"].includes(e.key)), "Sparta still gets normal production");
});

test("two at once when allowed, never two in one city", () => {
    const picks = steps.chooseWonders(DEFAULT_SETTINGS, 2);
    assert.equal(picks.size, 2);
    assert.deepEqual([...picks.keys()].sort(), [`c:${A.x}-${A.y}`, `c:${B.x}-${B.y}`].sort());
});

test("omniscient: a wonder a rival finishes in 2 turns is not started", () => {
    const picks = steps.chooseWonders({ ...DEFAULT_SETTINGS, wonders: { omniscient: true } }, 2);
    assert.ok(![...picks.values()].some((p) => p.type === "WONDER_PYRAMIDS"), JSON.stringify([...picks.values()]));
});

test("expansion first: no new wonder while a settler walks or trains (sites known alone do not hold wonders: research/22 B5); science projects are queued anyway", () => {
    // Seen in game 5: the capital built three wonders; one city for 57 turns. Seen in game 6: Spherical
    // Earth waited behind expansion (research/21 D4).
    const cap = world.settlementCap;
    try {
        world.settlementCap = 4; // 2 settlements
        sitesKnown(true);
        assert.equal(steps.expandingFirst(true), false, "sites known but no settler on its way or in training: wonders go on (research/22 B5)");
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1, { settlers: true }).size, 1);
        world.cities[1].trains = "UNIT_SETTLER";
        assert.equal(steps.expandingFirst(true), true, "a settler in training");
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1, { settlers: true }).size, 0, "below the cap");
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1, { settlers: false }).size, 1, "settlers off: as before");
        world.settlementCap = 2;
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1, { settlers: true }).size, 1, "at the cap");
        // Science projects (Chart the Stars) do not wait: settlers go ahead of them anyway.
        world.settlementCap = 4;
        const projects = () => fake.sent.filter((s) => s.kind === "operation" && s.args.ProjectType === GameInfo.Projects.lookup("PROJECT_CHART_THE_STARS").$hash);
        fake.sent.length = 0;
        steps.pushVictoryWork("SCIENCE", { settlers: true });
        assert.equal(projects().length, 1);
    } finally {
        world.settlementCap = cap;
        delete world.cities[1].trains;
        sitesKnown(false);
    }
});

test("the pass with «Поселенцы» below the cap: no wonder ordered", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    settings.patch({ autopilot: { settlers: true, wonders: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false, tacks: false } });
    // No unit can be trained here, so the empty queues are free for a wonder.
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (args?.UnitType !== undefined ? { Success: false } : canBuild(type, id, args));
    try {
        world.cities[1].trains = "UNIT_SETTLER"; // a settler in training: expansion first
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.equal(wonderOrders().length, 0, JSON.stringify((state.get().autopilot.log ?? []).map((e) => e.key)));
        settings.patch({ autopilot: { settlers: false } });
        fake.sent.length = 0;
        await autopilot.runTurn(true);
        assert.ok(wonderOrders().length > 0, "settlers off: a wonder");
    } finally {
        world.canBuild = canBuild;
        delete world.cities[1].trains;
        settings.patch({ autopilot: { settlers: false } });
    }
});

test("science: an Innovation wonder (the Great Library) is chosen over a quicker Pyramids; Innovation only when the strategy says so (research/21 D7)", () => {
    const canBuild = world.canBuild;
    const costOf = world.costOf;
    // The Pyramids (tier B) only: the Hanging Gardens' tier S would win on their own (research/27 §4).
    world.canBuild = (type, id, args) => (type === "WONDER_GREAT_LIBRARY" ? canBuild("WONDER_PYRAMIDS", id, args)
        : type === "WONDER_HANGING_GARDENS" ? { Success: false, Plots: [], FailureReasons: ["LOC_LOCKED"] } : canBuild(type, id, args));
    // 14 turns against the Pyramids' 10 (a wonder over 15 turns is not started: research/24 P5): only its Innovation tips it.
    world.costOf = (type) => (type === "WONDER_GREAT_LIBRARY" ? 420 : costOf(type));
    const first = (s) => [...steps.chooseWonders(s, 1).values()][0]?.type;
    try {
        assert.ok(steps.innovationWonders().has("WONDER_GREAT_LIBRARY"));
        assert.equal(first({ ...DEFAULT_SETTINGS, profile: "SCIENCE" }), "WONDER_GREAT_LIBRARY");
        assert.notEqual(first(DEFAULT_SETTINGS), "WONDER_GREAT_LIBRARY", "no science focus: the quicker one");
        assert.equal(first({ ...DEFAULT_SETTINGS, profile: "SCIENCE", strategy: { wonderKind: "INNOVATION" } }), "WONDER_GREAT_LIBRARY", "Innovation first");
        world.canBuild = canBuild;
        world.costOf = (type) => (type === "WONDER_GREAT_LIBRARY" ? 300 : costOf(type));
        assert.ok(["WONDER_PYRAMIDS", "WONDER_HANGING_GARDENS"].includes(first({ ...DEFAULT_SETTINGS, profile: "SCIENCE", strategy: { wonderKind: "INNOVATION" } })),
            "no Innovation wonder to start: any we can win (research/23 S2: none built in game 8)");
    } finally {
        world.canBuild = canBuild;
        world.costOf = costOf;
    }
});

test("a wonder's tier counts: the Hanging Gardens (S: growth everywhere, an attribute point) before quicker Pyramids (B) (research/27 §4)", () => {
    const costOf = world.costOf;
    world.costOf = (type) => (type === "WONDER_PYRAMIDS" ? 270 : costOf(type)); // 9 turns against 10
    try {
        const pick = [...steps.chooseWonders(DEFAULT_SETTINGS, 1).values()][0];
        assert.equal(pick?.type, "WONDER_HANGING_GARDENS");
    } finally {
        world.costOf = costOf;
    }
});

test("the final push: no wonder in a city that gets a Launch Pad (research/21 D5)", () => {
    const picks = steps.chooseWonders(DEFAULT_SETTINGS, 1, { excludeCities: new Set([`c:${A.x}-${A.y}`]) });
    assert.deepEqual([...picks.keys()], [`c:${B.x}-${B.y}`], "Athens (the best producer) is a Launch Pad city: Sparta");
});

test("a chosen wonder goes into a busy queue, and a wonder waiting in a queue moves to the front (research/22 B5: no wonder all game 7)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === undefined ? { Success: true } : canBuild(type, id, args)); // queue moves
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 0 };
        const picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
        assert.equal([...picks.keys()][0], `c:${A.x}-${A.y}`);
        fake.sent.length = 0;
        const out = steps.fillProduction(picks);
        assert.equal(wonderOrders().length, 1, JSON.stringify(out));
        athens.queued = ["BUILDING_GRANARY", "WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        const move = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [2, 0]);
        // Never ahead of a project.
        athens.queued = ["PROJECT_CHART_THE_STARS", "WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        const move2 = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([move2?.args.QueueSourceLocation, move2?.args.QueueDestinationLocation], [2, 0], "ahead of the Monument (no progress)");
        athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 4, pct: 0 };
        athens.queued = ["WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        assert.equal(fake.sent.filter((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo).length, 0, "not ahead of a project");
    } finally {
        world.canBuild = canBuild;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("Launch Pad cities keep out of wonders, but never every city, and only once Rocketry is near (research/22 B5)", () => {
    assert.equal(steps.padCities(3).size, 1, "2 cities: at most 1 kept for a pad");
    const plan = (gate, gateLate = false) => ({ padCitiesNoWonders: true, pads: 3, gate, gateLate });
    assert.equal(steps.padExclusion(plan({ progress: 0.3 })), null, "Rocketry far: wonders anywhere");
    assert.equal(steps.padExclusion(plan({ progress: 0.7 }))?.size, 1);
    assert.equal(steps.padExclusion(plan({ progress: 0.7 }, true)), null, "Rocketry too late: wonders anywhere");
    assert.equal(steps.padExclusion(plan({ open: true, progress: 1 }, true))?.size, 1);
    assert.equal(steps.padExclusion({ pads: 3, gate: { open: true } }), null, "not the final push");
});

test("a wonder is not started where it takes over 15 turns, though a faster city would take it in time (research/24 P5: two at 29-30 turns, both lost)", () => {
    const costOf = world.costOf;
    world.costOf = (type) => (type.startsWith("WONDER_") ? 400 : 100); // Athens 14 turns, Sparta 20
    try {
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1, { excludeCities: new Set([`c:${A.x}-${A.y}`]) }).size, 0, "not in Sparta");
        assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1).size, 1, "Athens: 14 turns");
    } finally {
        world.costOf = costOf;
    }
});
