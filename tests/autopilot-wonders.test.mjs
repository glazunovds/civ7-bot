// Autopilot wonders: an empty queue starts the wonder the Wonders tab rates best (a race
// we can win, finishing this age, best value per production turn) on its best tile; only
// `maxWonders` at once; a wonder a rival is about to finish is not started.
import { beforeEach, test } from "node:test";
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
// Every test starts a new turn for the wonders we ordered (an order of this turn counts as started: research/28 §1).
beforeEach(() => steps.resetWonderOrders());
const capture = (fn) => {
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        console.warn = warn;
    }
    return lines;
};

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

// Game 21 (research/28 §1): wonders that waited behind other items left the queue unbuilt, each with nothing in it
// (the Emile Bell three times, the Mausoleum of Theodoric once), and the end-of-turn retry ordered the Emile Bell twice.
test("a wonder waiting in a queue goes to the very front, ahead of a building with progress; not ahead of a wonder in production nor of an item done this turn (research/28 §1)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === undefined ? { Success: true } : canBuild(type, id, args)); // queue moves
    const move = () => {
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        const m = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        return m ? [m.args.QueueSourceLocation, m.args.QueueDestinationLocation] : null;
    };
    try {
        athens.queued = ["BUILDING_GRANARY", "WONDER_PYRAMIDS"];
        athens.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 60 }; // 60 of 100: more than a turn's 30
        assert.deepEqual(move(), [2, 0], "ahead of the Monument with progress (game 21: each item kept its own)");
        athens.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 80 };
        assert.deepEqual(move(), [2, 1], "the Monument is done this turn");
        athens.queue = { type: "WONDER_HANGING_GARDENS", turns: 6, pct: 30 };
        assert.equal(move(), null, "not ahead of the wonder in production (game 34: nor waiting behind it)");
        // A threatened settlement's walls, just moved to the front (game 27): nothing passes them.
        athens.queue = { type: "BUILDING_ANCIENT_WALLS", turns: 3, pct: 0 };
        assert.deepEqual(move(), [2, 1], "behind the walls");
    } finally {
        world.canBuild = canBuild;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("a wonder ordered this turn is not ordered again in the end-of-turn retry, though the game's queue does not show it yet (game 21: the Emile Bell twice in one turn)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 0 };
        fake.sent.length = 0;
        steps.fillProduction(steps.chooseWonders(DEFAULT_SETTINGS, 1));
        assert.equal(wonderOrders().length, 1);
        // The retry a moment later: like the game's then, the fake's queue does not show the order.
        fake.sent.length = 0;
        const again = steps.chooseWonders(DEFAULT_SETTINGS, 1);
        steps.fillProduction(again);
        assert.equal(wonderOrders().length, 0, `ordered twice: ${JSON.stringify([...again])}`);
    } finally {
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("the game refuses the chosen tile: the wonder's next tile is ordered; with every tile refused UI.log says why (research/28 §1)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    const canBuild = world.canBuild;
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 0 };
        const picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
        const pick = picks.get(`c:${A.x}-${A.y}`);
        world.canBuild = (type, id, args) => (args?.X === pick.x && args?.Y === pick.y ? { Success: false, FailureReasons: ["LOC_TEST_TILE_TAKEN"] } : canBuild(type, id, args));
        fake.sent.length = 0;
        steps.fillProduction(picks);
        const order = wonderOrders()[0];
        assert.ok(order && !(order.args.X === pick.x && order.args.Y === pick.y), `the other tile: ${JSON.stringify(order?.args)}`);
        world.canBuild = (type, id, args) => (type?.startsWith("WONDER_") && args?.X !== undefined ? { Success: false, FailureReasons: ["LOC_TEST_TILE_TAKEN"] } : canBuild(type, id, args));
        steps.resetWonderOrders();
        fake.sent.length = 0;
        const lines = capture(() => steps.fillProduction(steps.chooseWonders(DEFAULT_SETTINGS, 1)));
        assert.equal(wonderOrders().length, 0);
        assert.ok(lines.some((l) => l.includes("could not order") && l.includes("LOC_TEST_TILE_TAKEN")), lines.join("\n"));
    } finally {
        world.canBuild = canBuild;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("our orders are watched and the planner's rows refreshed while no wonder may start (game 22: during a war at our door the Shwedagon Pagoda's loss was logged 26 turns late)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued, cap: world.settlementCap };
    const turn = Game.turn;
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 0 };
        fake.sent.length = 0;
        steps.fillProduction(steps.chooseWonders(DEFAULT_SETTINGS, 1));
        const ordered = GameInfo.Constructibles.lookup(wonderOrders()[0].args.ConstructibleType).ConstructibleType;
        Game.turn = turn + 1;
        athens.queued = [ordered];
        steps.chooseWonders(DEFAULT_SETTINGS, 1);
        // The turn after: gone unbuilt, while a settler trains below the cap (expansion first: no wonder may start).
        Game.turn = turn + 2;
        athens.queued = [];
        world.settlementCap = 4;
        sitesKnown(true);
        world.cities[1].trains = "UNIT_SETTLER";
        assert.equal(steps.expandingFirst(true), true);
        const lines = capture(() => assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1, { settlers: true }).size, 0));
        assert.ok(lines.some((l) => l.includes(`${ordered} left Athens's queue unbuilt`)), lines.join("\n"));
        assert.equal(state.get().results.wonders.computedTurn, Game.turn, "the cash-out reads this pass's rows");
    } finally {
        Game.turn = turn;
        world.settlementCap = keep.cap;
        delete world.cities[1].trains;
        sitesKnown(false);
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("a wonder that leaves the queue unbuilt goes to UI.log with the game's notices (game 21: the Emile Bell three times, the Mausoleum of Theodoric once)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    const turn = Game.turn;
    try {
        athens.queue = { type: "BUILDING_MONUMENT", turns: 4, pct: 0 };
        fake.sent.length = 0;
        steps.fillProduction(steps.chooseWonders(DEFAULT_SETTINGS, 1));
        const ordered = GameInfo.Constructibles.lookup(wonderOrders()[0].args.ConstructibleType).ConstructibleType;
        // Next turn the game shows it in the queue; the turn after it is gone, not built, and the game says so.
        Game.turn = turn + 1;
        athens.queued = [ordered];
        assert.deepEqual(capture(() => steps.chooseWonders(DEFAULT_SETTINGS, 1)).filter((l) => l.includes("left")), []);
        Game.turn = turn + 2;
        athens.queued = [];
        world.notifications = [{ name: "NOTIFICATION_PRODUCTION_INVALIDATED", player: 0, summary: "LOC_TEST_CANCELLED" }];
        const lines = capture(() => steps.chooseWonders(DEFAULT_SETTINGS, 1));
        assert.ok(lines.some((l) => l.includes(`${ordered} left Athens's queue unbuilt`) && l.includes(`last seen T${turn + 1}`) && l.includes("NOTIFICATION_PRODUCTION_INVALIDATED: LOC_TEST_CANCELLED")), lines.join("\n"));
        assert.ok(lines.some((l) => l.includes("game notice: NOTIFICATION_PRODUCTION_INVALIDATED: LOC_TEST_CANCELLED")), lines.join("\n"));
        assert.deepEqual(capture(() => steps.chooseWonders(DEFAULT_SETTINGS, 1)).filter((l) => l.includes("game notice") || l.includes("left")), [], "once");
    } finally {
        Game.turn = turn;
        delete world.notifications;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});

test("the queue probe: a queue holding a wonder, and an item that stays at 100% on a later turn, go to UI.log with each entry's progress and the purchases there, once a turn (research/31 §5: Carthage's Altar at 290 of 49)", () => {
    const athens = world.cities[0];
    const sparta = world.cities[1];
    const keep = { a: athens.queue, aq: athens.queued, s: sparta.queue };
    const turn = Game.turn;
    try {
        Game.turn = turn + 1;
        athens.queue = { type: "WONDER_PYRAMIDS", turns: 10, pct: 20 };
        athens.queued = ["BUILDING_MONUMENT"];
        sparta.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 100 };
        engine.trigger("CityMadePurchase", { cityID: Players.get(0).Cities.getCities()[0].id });
        let lines = capture(() => steps.chooseWonders(DEFAULT_SETTINGS, 1));
        const probe = (l, city) => l.filter((x) => x.includes(`queue probe: ${city}`));
        assert.equal(probe(lines, "Athens").length, 1, lines.join("\n"));
        assert.ok(probe(lines, "Athens")[0].includes("WONDER_PYRAMIDS 20%*, BUILDING_MONUMENT 0%"), probe(lines, "Athens")[0]);
        assert.ok(probe(lines, "Athens")[0].includes(`bought here T${turn + 1}`));
        assert.deepEqual(probe(lines, "Sparta"), [], "100% for the first time: not yet stuck");
        lines = capture(() => steps.probeQueues());
        assert.deepEqual(probe(lines, "Athens"), [], "once a turn");
        // A turn later Sparta's Monument still stands at 100%.
        Game.turn = turn + 2;
        lines = capture(() => steps.probeQueues());
        assert.ok(probe(lines, "Sparta")[0]?.includes(`BUILDING_MONUMENT at 100% since T${turn + 1}`), lines.join("\n"));
    } finally {
        Game.turn = turn;
        athens.queue = keep.a;
        athens.queued = keep.aq;
        sparta.queue = keep.s;
    }
});

test("no building is bought in a city where a wonder was ordered this turn, nor while one waits in its queue: a repair is queued instead (research/32 §6: game 27's Serpent Mound left the queue after a Harbor was bought in the same pass)", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    const canBuild = world.canBuild;
    const turn = Game.turn;
    const LIBRARY = GameInfo.Constructibles.lookup("BUILDING_LIBRARY").$hash;
    const tile = grid.index(A.x, A.y + 1);
    const repairs = (kind) => fake.sent.filter((s) => s.kind === kind && s.args.ConstructibleType === LIBRARY).map((s) => s.id.id);
    try {
        fake.sent.length = 0;
        steps.fillProduction(steps.chooseWonders(DEFAULT_SETTINGS, 1));
        assert.ok(wonderOrders().some((s) => s.id.id === 0), "a wonder ordered in Athens");
        // A damaged Library in Athens, gold enough to buy its repair.
        world.canBuild = (type, id, args) => (type === "BUILDING_LIBRARY" && id.id === 0 ? { Success: true, RepairDamaged: true, Plots: [tile] } : canBuild(type, id, args));
        world.canBuy = () => ({ Success: true, Cost: 50 });
        world.gold = 1000;
        fake.sent.length = 0;
        steps.repairBuildings();
        assert.deepEqual([repairs("command"), repairs("operation")], [[], [0]], "queued, not bought");
        // The next turn: no order of this turn, no wonder in the queue: bought.
        Game.turn = turn + 1;
        fake.sent.length = 0;
        steps.repairBuildings();
        assert.deepEqual(repairs("command"), [0]);
        // A wonder waiting in its queue: queued again.
        athens.queued = ["WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        steps.repairBuildings();
        assert.deepEqual(repairs("command"), []);
    } finally {
        Game.turn = turn;
        world.canBuild = canBuild;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
        for (const k of ["canBuy", "gold"]) delete world[k];
    }
});

// Game 34: Лондон's Chart the Stars lost 78 at A39 and 181 at A57 when rivals finished the Colossus and the Ha'amonga a Maui,
// both waiting behind it (the game drops the wonder, «0 returned», and the item in production starts over).
test("no wonder waits behind a project or a wonder in production: none is ordered there, and one waiting with nothing in it leaves the queue", () => {
    const athens = world.cities[0];
    const keep = { queue: athens.queue, queued: athens.queued };
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === undefined ? { Success: true } : canBuild(type, id, args)); // queue edits
    const removed = () => fake.sent.filter((s) => s.args.InsertMode === CityOperationsParametersValues.RemoveAt).map((s) => [s.id.id, s.args.QueueLocation]);
    try {
        athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 6, pct: 30 };
        athens.queued = [];
        const picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
        assert.equal([...picks.keys()][0], `c:${A.x}-${A.y}`);
        fake.sent.length = 0;
        steps.fillProduction(picks);
        assert.equal(wonderOrders().filter((s) => s.id.id === 0).length, 0, "not behind Chart the Stars");
        athens.queued = ["WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        const out = steps.fillProduction(new Map());
        assert.deepEqual(removed(), [[0, 1]]);
        assert.ok(out.some((e) => e.key === "WONDER_WAIT_DROPPED"), JSON.stringify(out));
        // The project done this turn: the wonder may wait, and a chosen one is ordered.
        athens.queue = { type: "PROJECT_CHART_THE_STARS", turns: 1, pct: 90 };
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        assert.deepEqual(removed(), []);
        athens.queued = [];
        steps.resetWonderOrders();
        fake.sent.length = 0;
        steps.fillProduction(picks);
        assert.equal(wonderOrders().filter((s) => s.id.id === 0).length, 1, "ordered behind a project done this turn");
        // Behind a wonder in production, the same.
        athens.queue = { type: "WONDER_HANGING_GARDENS", turns: 6, pct: 30 };
        athens.queued = ["BUILDING_GRANARY", "WONDER_PYRAMIDS"];
        fake.sent.length = 0;
        steps.fillProduction(new Map());
        assert.deepEqual(removed(), [[0, 2]]);
    } finally {
        world.canBuild = canBuild;
        athens.queue = keep.queue;
        athens.queued = keep.queued;
    }
});
