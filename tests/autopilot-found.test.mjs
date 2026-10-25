// Turn 1 (the user's first autopilot run): no city yet, a Founder, a scout and a warrior.
// The pass founds the capital first, waits for the game to create it, then picks research
// and production for it in the same pass and ends the turn; the other units still skip
// although the Founder is the first "ready" unit. A choice that appears late in the pass
// gets one more try before the turn is left waiting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const SITE = { x: 10, y: 8 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 } }),
    structures: (x, y) => (world.cities.some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [],
    units: [
        { id: 1, type: "UNIT_FOUNDER", x: SITE.x, y: SITE.y },
        { id: 2, type: "UNIT_SCOUT", x: 11, y: 8 },
        { id: 3, type: "UNIT_WARRIOR", x: 9, y: 8 },
    ],
    aiSuggestions: () => [{ location: { ...SITE } }],
    // Nothing to research before the capital exists.
    research: { tech: { available: [] }, culture: { available: [] } },
    buildRecs: () => [{ subject: 7, recommendedType: "PROJECT_CITY_SCIENCE_PROJECT", whichAdvisors: [] }],
};
const fake = installFakeEngine(world);
GameInfo.AdvisorySubjects = { lookup: (h) => (h === 7 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_PROJECTS" } : null) };

// The game: founding creates the city a moment later; the tech tree opens with it.
const send = Game.UnitOperations.sendRequest;
Game.UnitOperations.sendRequest = (id, op, args) => {
    send(id, op, args);
    // A move or a skip ends the unit's turn (a move also changes its tile).
    const unit = world.units.find((u) => u.id === id.id);
    if (unit && op === UnitOperationTypes.MOVE_TO) {
        const move = () => Object.assign(unit, { x: args.X, y: args.Y, moved: true, moves: 0 });
        if (world.slowMoves) world.pendingMoves.push(move);
        else move();
    }
    // Like the game: a skip ends the unit's turn (no moves left, so it is not ready again).
    if (unit && op === "UNITOPERATION_SKIP_TURN") Object.assign(unit, { moved: true, moves: 0 });
    if (op !== "UNITOPERATION_FOUND_CITY") return;
    setTimeout(() => {
        world.units = world.units.filter((u) => u.id !== id.id);
        world.cities.push({ owner: 0, ...SITE, name: "Rome", pop: 1, prod: 3 });
        world.research.tech.available = [9011];
        engine.trigger("CityInitialized", { cityID: { owner: 0, id: 0 } });
    }, 600); // longer than a step pause: the pass must wait for the city
};
// What holds the turn, like the game: production for a city with an empty queue, then a tech.
const built = () => fake.sent.some((s) => s.kind === "operation" && s.id.id === 0);
const teched = () => fake.sent.some((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE);
const civicked = () => fake.sent.some((s) => s.op === PlayerOperationTypes.SET_CULTURE_TREE_NODE);
Object.defineProperty(world, "blocker", {
    configurable: true,
    get: () => {
        if (world.cities.length > 0 && !built()) return { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_CITY_PRODUCTION" };
        if (world.research.tech.available.length > 0 && !teched()) return { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_TECH" };
        if (world.research.culture.available.length > 0 && !civicked()) return { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_CIVIC" };
        if (world.units.some((u) => !u.moved)) return { type: EndTurnBlockingTypes.UNITS, name: "NOTIFICATION_COMMAND_UNITS" };
        return undefined;
    },
});

const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const keys = () => (state.get().autopilot.log ?? []).map((e) => e.key);
const pass = async () => {
    autopilot.setAutopilot(true);
    await new Promise((r) => setTimeout(r, 6000));
    autopilot.setAutopilot(false);
};

test("turn 1: found the capital, then research and production for it in the same pass", async () => {
    settings.patch({ autopilot: { settlers: true, explore: false, defend: false, merchants: false, skipUnits: true, endTurn: true, replanEvery: 0 } });
    await autopilot.runTurn(true); // "Do it now": one pass, no second try
    const unitOps = fake.sent.filter((s) => s.kind === "unit");
    assert.deepEqual(unitOps.filter((s) => s.id.id === 1).map((s) => s.op), ["UNITOPERATION_FOUND_CITY"]);
    assert.ok(built(), `Rome's queue is filled in the same pass: ${keys()}`);
    assert.ok(teched(), "the first technology too");
    assert.deepEqual(unitOps.filter((s) => s.op === "UNITOPERATION_SKIP_TURN").map((s) => s.id.id).sort(), [2, 3], "the scout and warrior skip; the Founder's order stands");
});

test("a choice that appears late in the pass gets one more try before the turn waits", async () => {
    world.turnSent = false;
    fake.sent.length = 0;
    world.units = [];
    // A civic opens only once the city's production is chosen (after the research step).
    const build = Game.CityOperations.sendRequest;
    Game.CityOperations.sendRequest = (id, op, args) => {
        build(id, op, args);
        world.research.culture.available = [9021];
    };
    world.cities[0].queue = undefined;
    await pass();
    Game.CityOperations.sendRequest = build;
    assert.ok(civicked(), String(keys()));
    assert.ok(!keys().slice(0, 5).includes("BLOCKED"));
    assert.equal(fake.sent.filter((s) => s.kind === "endTurn").length, 1);
});

test("production: the advisor's settler only when the autopilot moves settlers, else the cheapest building", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    GameInfo.AdvisorySubjects = { lookup: (h) => (h === 8 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_UNITS" } : null) };
    world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_SETTLER", whichAdvisors: [] }];
    const near = GameplayMap.getIndexFromXY(SITE.x + 1, SITE.y);
    world.canBuild = (type) => (type === undefined || type.startsWith("UNIT_") || ["BUILDING_MONUMENT", "BUILDING_GRANARY"].includes(type) ? { Success: true, Plots: [near], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.costOf = (type) => ({ BUILDING_MONUMENT: 90, BUILDING_GRANARY: 55 })[type] ?? 999;
    const queued = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args);

    fake.sent.length = 0;
    let out = steps.fillProduction(new Map(), { settlers: true });
    assert.equal(queued()[0]?.UnitType, settler, JSON.stringify(out));
    assert.equal(out[0].key, "QUEUED_SETTLER", "settlers first while we have few settlements (not the turn-1 Founder)");

    fake.sent.length = 0;
    out = steps.fillProduction(new Map(), { settlers: false });
    assert.equal(queued()[0]?.ConstructibleType, GameInfo.Constructibles.lookup("BUILDING_GRANARY").$hash, JSON.stringify(out));
    assert.equal(out[0].key, "QUEUED_FALLBACK");
});

test("production: the advisor's military unit only below 2 soldiers per settlement (seen in game: ~25 filled every tile around a city)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const warrior = GameInfo.Units.lookup("UNIT_WARRIOR").$hash;
    world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_WARRIOR", whichAdvisors: [] }];
    const queued = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args);
    const before = world.units;
    const settlements = Players.get(0).Cities.getCities().length;
    world.units = Array.from({ length: 2 * settlements - 1 }, (_, i) => ({ id: 70 + i, type: "UNIT_WARRIOR", x: 0, y: i, activity: UnitActivityTypes.SLEEP }));
    fake.sent.length = 0;
    let out = steps.fillProduction(new Map(), {});
    assert.equal(queued()[0]?.UnitType, warrior, JSON.stringify(out));
    world.units.push({ id: 99, type: "UNIT_WARRIOR", x: 1, y: 0, activity: UnitActivityTypes.SLEEP });
    fake.sent.length = 0;
    out = steps.fillProduction(new Map(), {});
    assert.equal(out[0]?.key, "QUEUED_FALLBACK", JSON.stringify(out));
    world.units = before;
    delete world.buildRecs;
});

test("science or economy in peace: the advisor's soldier is skipped, the Barracks (a production building too) is not; under threat the soldier is allowed (research/21 E2, research/34)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const warrior = GameInfo.Units.lookup("UNIT_WARRIOR").$hash;
    const barracks = GameInfo.Constructibles.lookup("BUILDING_BARRACKS").$hash;
    const subjects = GameInfo.AdvisorySubjects;
    GameInfo.AdvisorySubjects = { lookup: (h) => ({ 8: { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_UNITS" }, 9: { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_CONSTRUCTIBLES" } })[h] ?? null };
    const near = GameplayMap.getIndexFromXY(SITE.x + 1, SITE.y);
    const canBuild = world.canBuild;
    const costOf = world.costOf;
    world.canBuild = (type, id, args) => (type === "BUILDING_BARRACKS" ? { Success: true, Plots: [near], ExpandUrbanPlots: [] } : canBuild(type, id, args));
    world.costOf = (type) => (type === "BUILDING_BARRACKS" ? 10 : costOf(type)); // the cheapest building too
    const queued = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args);
    const before = world.units;
    world.units = [];
    const strategy = { advisorSoldiers: false, militaryBuildings: false };
    try {
        world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_WARRIOR", whichAdvisors: [] }, { subject: 9, recommendedType: "BUILDING_BARRACKS", whichAdvisors: [] }];
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), { strategy });
        assert.ok(queued()[0]?.UnitType !== warrior, JSON.stringify(out));
        // Tagged PRODUCTION as well as MILITARY (+3 Production): a production building, not skipped in peace.
        assert.equal(queued()[0]?.ConstructibleType, barracks, JSON.stringify(out));
        assert.equal(out[0]?.key, "QUEUED_ADVISOR");
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), { strategy, threats: [{ settlement: { name: "Rome", x: SITE.x, y: SITE.y }, count: 0, owners: [] }] });
        assert.equal(queued()[0]?.UnitType, warrior, `under threat: ${JSON.stringify(out)}`);
        fake.sent.length = 0;
        steps.fillProduction(new Map(), {});
        assert.equal(queued()[0]?.UnitType, warrior, "no strategy: as before");
    } finally {
        world.units = before;
        world.canBuild = canBuild;
        world.costOf = costOf;
        GameInfo.AdvisorySubjects = subjects;
        delete world.buildRecs;
    }
});

test("turn 4: two warriors on the capital (the game refuses fortify): one steps aside, the other is skipped, the turn ends", async () => {
    world.turnSent = false;
    fake.sent.length = 0;
    world.units = [{ id: 7, type: "UNIT_WARRIOR", ...SITE }, { id: 8, type: "UNIT_WARRIOR", ...SITE }];
    const stacked = (id) => {
        const u = world.units.find((w) => w.id === id.id);
        return world.units.some((w) => w !== u && w.x === u.x && w.y === u.y);
    };
    // The game takes a moment to carry out a move: here it lands just after the first
    // (refused) skip, so only the end-of-turn retry can skip the warrior left behind.
    world.slowMoves = true;
    world.pendingMoves = [];
    // As seen in game: no fortify or guard in the new capital; while stacked, only moving.
    const skipChecks = new Map();
    world.unitCanStart = (id, op) => {
        // The 1st skip check of a unit is the step-aside test, the 2nd the skip step's own.
        const n = op === "UNITOPERATION_SKIP_TURN" ? (skipChecks.get(id.id) ?? 0) + 1 : 0;
        if (n) skipChecks.set(id.id, n);
        if (n >= 2 && world.pendingMoves.length > 0) {
            const moves = world.pendingMoves.splice(0);
            setTimeout(() => moves.forEach((m) => m()), 200);
        }
        if (["UNITOPERATION_FORTIFY", "UNITOPERATION_ALERT"].includes(op)) return { Success: false };
        if (op !== UnitOperationTypes.MOVE_TO && stacked(id)) return { Success: false };
        return undefined;
    };
    settings.patch({ autopilot: { defend: true, skipUnits: true, endTurn: true } });
    await pass();
    delete world.unitCanStart;
    world.slowMoves = false;
    const ops = fake.sent.filter((s) => s.kind === "unit").map((s) => [s.id.id, s.op]);
    assert.equal(ops.filter(([, op]) => op === UnitOperationTypes.MOVE_TO).length, 1, JSON.stringify(ops));
    assert.equal(ops.filter(([, op]) => op === "UNITOPERATION_SKIP_TURN").length, 1, JSON.stringify(ops));
    assert.equal(fake.sent.filter((s) => s.kind === "endTurn").length, 1, String(keys()));
});

test("production: the advisor's scout, settler or merchant only below what the autopilot keeps (seen in game: 32 scouts)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    GameInfo.AdvisorySubjects = { lookup: (h) => (h === 8 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_UNITS" } : null) };
    const near = GameplayMap.getIndexFromXY(SITE.x + 1, SITE.y);
    world.canBuild = (type) => (type === undefined || type.startsWith("UNIT_") || type === "BUILDING_GRANARY" ? { Success: true, Plots: [near], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    const unit = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args.UnitType).find((t) => t !== undefined);
    const before = world.units;
    try {
        // Two scouts already: the advisor's third is not built.
        world.units = [{ id: 20, type: "UNIT_SCOUT", x: 3, y: 3 }, { id: 21, type: "UNIT_SCOUT", x: 4, y: 3 }];
        world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_SCOUT", whichAdvisors: [] }];
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), { explore: true });
        assert.equal(unit(), undefined, JSON.stringify(out));
        // At the settlement cap: no settler from the advisor (ours stop there too).
        world.units = [];
        world.settlementCap = Players.get(0).Stats.numSettlements;
        world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_SETTLER", whichAdvisors: [] }];
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), { settlers: true });
        assert.equal(unit(), undefined, JSON.stringify(out));
        delete world.settlementCap;
        // No trade route open: no merchant from the advisor.
        world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_MERCHANT", whichAdvisors: [] }];
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), { merchants: true });
        assert.equal(unit(), undefined, JSON.stringify(out));
    } finally {
        world.units = before;
        delete world.buildRecs;
        delete world.canBuild;
        delete world.settlementCap;
    }
});

test("production: nothing else to build: a project, else the strongest soldier, else any unit but a settler (an empty queue holds the turn)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    let allowed = new Set(["PROJECT_CITY_SCIENCE_PROJECT", "UNIT_WARRIOR", "UNIT_SCOUT", "UNIT_SETTLER"]);
    world.canBuild = (type) => (type === undefined ? { Success: true } : allowed.has(type) ? { Success: true, Plots: [], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    const queued = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args).map((a) => a.ProjectType !== undefined ? GameInfo.Projects.lookup(a.ProjectType).ProjectType : a.UnitType !== undefined ? GameInfo.Units.lookup(a.UnitType).UnitType : "?");
    const before = world.units;
    try {
        world.units = [];
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), {});
        assert.deepEqual(queued(), ["PROJECT_CITY_SCIENCE_PROJECT"], JSON.stringify(out));
        assert.equal(out[0].key, "QUEUED_FALLBACK");
        allowed = new Set(["UNIT_WARRIOR", "UNIT_SCOUT", "UNIT_SETTLER"]);
        fake.sent.length = 0;
        steps.fillProduction(new Map(), {});
        assert.deepEqual(queued(), ["UNIT_WARRIOR"]);
        allowed = new Set(["UNIT_SETTLER", "UNIT_SCOUT"]);
        fake.sent.length = 0;
        steps.fillProduction(new Map(), {});
        assert.deepEqual(queued(), ["UNIT_SCOUT"]);
        allowed = new Set(["UNIT_SETTLER"]);
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), {});
        assert.deepEqual(queued(), [], "never a settler (the settlement cap)");
    } finally {
        world.units = before;
        delete world.canBuild;
    }
});

test("exploring: cities train scouts first until there are two (counting those in training)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const scout = GameInfo.Units.lookup("UNIT_SCOUT").$hash;
    // The second one comes once a settler is trained (game 60): one stands here.
    world.units = [{ id: 20, type: "UNIT_SCOUT", x: 3, y: 3 }, { id: 21, type: "UNIT_SETTLER", x: 4, y: 3 }];
    fake.sent.length = 0;
    let out = steps.fillProduction(new Map(), { explore: true });
    const queued = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args);
    assert.equal(queued()[0]?.UnitType, scout, JSON.stringify(out));
    assert.equal(out[0].key, "QUEUED_SCOUT");
    // The second one is in training now: no third.
    world.cities[0].trains = "UNIT_SCOUT";
    fake.sent.length = 0;
    out = steps.fillProduction(new Map(), { explore: true });
    assert.notEqual(queued()[0]?.UnitType, scout, JSON.stringify(out));
    // Not exploring: no scouts at all.
    delete world.cities[0].trains;
    fake.sent.length = 0;
    steps.fillProduction(new Map(), { explore: false });
    assert.notEqual(queued()[0]?.UnitType, scout);
    world.units = [];
});

test("a step that fails (an in-game API surprise) is logged; the rest of the pass still runs", async () => {
    world.turnSent = false;
    fake.sent.length = 0;
    world.units = [{ id: 30, type: "UNIT_WARRIOR", x: 2, y: 2 }];
    // In game, `GameInfo.TypeTags.some` did not exist and the whole pass stopped.
    const find = GameInfo.TypeTags.find;
    Object.defineProperty(GameInfo.TypeTags, "find", { value: () => { throw new TypeError("GameInfo.TypeTags.find is not a function"); }, configurable: true });
    settings.patch({ autopilot: { explore: true, defend: false, settlers: false, skipUnits: true, endTurn: true } });
    await pass();
    Object.defineProperty(GameInfo.TypeTags, "find", { value: find, configurable: true });
    const errors = (state.get().autopilot.log ?? []).filter((e) => e.key === "ERROR").map((e) => e.args[0]);
    assert.ok(errors.some((m) => m.startsWith("production:")), JSON.stringify(errors));
    assert.ok(fake.sent.some((s) => s.kind === "unit" && s.id.id === 30 && s.op === "UNITOPERATION_SKIP_TURN"), "the warrior is still skipped");
    assert.equal(fake.sent.filter((s) => s.kind === "endTurn").length, 0, "production is still missing: the turn waits");
    assert.ok(keys().includes("BLOCKED"));
    world.units = [];
});

test("settlers: the Settlements search runs by itself when a settler needs a site", async () => {
    state.set({ results: { ...state.get().results, sites: null } });
    world.units = [{ id: 40, type: "UNIT_SETTLER", x: SITE.x, y: SITE.y + 1 }];
    settings.patch({ autopilot: { settlers: true, explore: false, defend: false, roam: false, skipUnits: false, endTurn: false } });
    await autopilot.runTurn(true);
    assert.ok(keys().includes("SITES_FOUND"), String(keys()));
    assert.ok(state.get().results.sites?.picks?.length > 0, "picks to walk to");
    assert.ok(keys().includes("SETTLE_MOVE"), "and the settler walks to one");
    world.units = [];
});

test("an order the game does not carry out (a settler that never moves) is released: the unit skips, the turn ends, the site is not tried again", async () => {
    world.turnSent = false;
    fake.sent.length = 0;
    world.slowMoves = true; // moves are "sent" but never happen
    world.pendingMoves = [];
    world.units = [{ id: 70, type: "UNIT_SETTLER", x: SITE.x + 1, y: SITE.y }];
    state.set({ results: { ...state.get().results, sites: { computedTurn: Game.turn, picks: [{ x: 18, y: 8, rank: 1, role: "CITY" }, { x: 10, y: 14, rank: 2, role: "CITY" }] } } });
    settings.patch({ autopilot: { settlers: true, explore: false, defend: false, roam: false, skipUnits: true, endTurn: true, tacks: false } });
    await pass();
    const moves = () => fake.sent.filter((s) => s.kind === "unit" && s.id.id === 70 && s.op === UnitOperationTypes.MOVE_TO).map((s) => [s.args.X, s.args.Y]);
    assert.deepEqual(moves()[0], [18, 8]);
    assert.ok(keys().includes("ORDERS_NOT_TAKEN"), String(keys()));
    assert.ok(fake.sent.some((s) => s.kind === "unit" && s.id.id === 70 && s.op === "UNITOPERATION_SKIP_TURN"), "skipped after all");
    assert.equal(fake.sent.filter((s) => s.kind === "endTurn").length, 1, "the turn ends");
    // Next turn: another site.
    fake.sent.length = 0;
    world.units = [{ id: 70, type: "UNIT_SETTLER", x: SITE.x + 1, y: SITE.y }];
    await autopilot.runTurn(true);
    assert.deepEqual(moves()[0], [10, 14], "not 18,8 again");
    world.slowMoves = false;
    world.units = [];
});

test("a citizen that arrives after the growth step is placed in the end-of-turn retry", async () => {
    world.turnSent = false;
    fake.sent.length = 0;
    world.units = [{ id: 80, type: "UNIT_WARRIOR", x: SITE.x + 2, y: SITE.y }];
    const rome = world.cities[0];
    delete rome.readyToGrow;
    world.expand = () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(SITE.x + 1, SITE.y + 1)], ConstructibleTypes: [] });
    // The citizen arrives when the unit is skipped (after the growth step), like a late reward.
    const send = Game.UnitOperations.sendRequest;
    Game.UnitOperations.sendRequest = (id, op, args) => {
        send(id, op, args);
        if (op === "UNITOPERATION_SKIP_TURN" && rome.readyToGrow === undefined) rome.readyToGrow = true;
    };
    Object.defineProperty(world, "blocker", {
        configurable: true,
        get: () => (rome.readyToGrow ? { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_NEW_POPULATION" } : undefined),
    });
    settings.patch({ autopilot: { settlers: false, skipUnits: true, endTurn: true, growth: true } });
    await pass();
    Game.UnitOperations.sendRequest = send;
    assert.ok(fake.sent.some((s) => s.kind === "command" && s.op === CityCommandTypes.EXPAND), String(keys()));
    assert.equal(fake.sent.filter((s) => s.kind === "endTurn").length, 1);
    delete world.expand;
    world.units = [];
});

test("no site known (our search and the game's both empty): no settler trained (research/21 C3b)", async () => {
    const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    const suggestions = world.aiSuggestions;
    const sites = state.get().results.sites;
    world.aiSuggestions = () => [];
    state.set({ results: { ...state.get().results, sites: null } });
    const canBuild = world.canBuild;
    world.canBuild = (type, id, args) => (type === "UNIT_SETTLER" ? { Success: true } : canBuild ? canBuild(type, id, args) : { Success: false, Plots: [] });
    try {
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { settlers: true });
        assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler));
        world.aiSuggestions = suggestions;
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { settlers: true });
        assert.ok(fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler), "the game suggests a site: trained");
    } finally {
        world.aiSuggestions = suggestions;
        world.canBuild = canBuild;
        state.set({ results: { ...state.get().results, sites } });
    }
});
