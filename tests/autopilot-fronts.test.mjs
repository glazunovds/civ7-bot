// Game 29 (research/36): the army's deployment. Guards on their way count only when they come in time, stale guard goals
// stop counting, asleep and fortified reserves are woken, the most endangered settlement is served first and a spare guard
// moves on, ranged units reinforce too, war fronts get a guard before the war, a defender is bought from all the gold
// (less a short deficit cushion) and trained where it arrives soonest, and UI.log describes each front.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const FRONT = { x: 15, y: 5 };
const SECOND = { x: 25, y: 5 };
const MOSCOW = { x: 31, y: 7 };
let grid = null;
const ours = [HOME, FRONT, SECOND];
const world = {
    width: 40, height: 20, wrapX: false,
    // Our land: 3 tiles around each of our settlements.
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: grid && ours.some((c) => grid.distanceXY(x, y, c.x, c.y) <= 3) ? 0 : -1 }),
    players: [{ id: 0 }, { id: 1, name: "Russia" }, { id: 9, isIndependent: true, name: "Raiders" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 10 },
        { owner: 0, ...FRONT, name: "Front", pop: 4, prod: 10 },
        { owner: 0, ...SECOND, name: "Second", pop: 4, prod: 10 },
        { owner: 1, ...MOSCOW, name: "Moscow", pop: 6 },
    ],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world);
grid = fake.grid;
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const A = UnitActivityTypes;
const cities = world.cities;
const reset = (list = [], extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["canBuy", "canBuild", "costOf", "enemies", "relations", "wars", "unitCommandOk"]) delete world[k];
    world.cities = cities;
    world.units = list;
    world.gold = 500;
    world.goldIncome = 10;
    Object.assign(world, extra);
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], ...options });
const threat = (at, name, o = {}) => ({
    settlement: { ...at, name }, count: o.count ?? (o.land ?? 1) + (o.ships ?? 0), land: o.land ?? 1, ships: o.ships ?? 0,
    close: o.close ?? 0, damaged: !!o.damaged, owners: [],
});
const moveOf = (id) => {
    const a = fake.sent.find((s) => s.kind === "unit" && s.id.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
    return a ? { x: a.X, y: a.Y } : undefined;
};
const keys = (r) => r.entries.map((e) => e.key);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const trains = (...types) => (type) => (type?.startsWith?.("UNIT_") ? { Success: types.includes(type) } : undefined);
const quiet = (fn) => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        console.warn = warn;
    }
    return lines;
};

test("a soldier on its way counts against sending another, not against buying one it would come too late for (research/36 §1)", () => {
    // Game 29 M4-M6: a Cuirassier sent to Ollantaytambo counted as its guard at once; nothing was bought with 711-1,034
    // gold, and one Line Infantry took the town.
    const t = threat(FRONT, "Front", { close: 1 });
    reset([{ id: 1, type: "UNIT_WARRIOR", x: 6, y: 5 }]);
    let r;
    const lines = quiet(() => (r = run({ threats: [t] })));
    assert.deepEqual(keys(r), ["REINFORCE"]);
    assert.equal(units.guardsFor(t, undefined, [t]), 1, "on its way: nobody else is sent");
    assert.equal(units.guardsFor(t, undefined, [t], { within: units.guardDeadline(t) }), 0, "4+ turns away, a raider within 2");
    // UI.log describes the front (research/36 §10).
    const line = lines.find((l) => l.includes("defence: Front:"));
    assert.match(line ?? "", /raiders 1 .*close 1.*melee 0 \+ 1 coming of 1 \[UNIT_WARRIOR in \d+t\].*sent \[UNIT_WARRIOR from 6,5 in \d+t\]/, JSON.stringify(lines));
    world.canBuy = sells({ UNIT_WARRIOR: 100 });
    steps.buyDefenders([t], { budget: createBudget({ gold: 500, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", 1]], "bought for Front now");
    // Raiders 3-4 tiles away strike in 2 turns: one 3 tiles off comes in time, none bought.
    const later = threat(FRONT, "Front");
    reset([{ id: 2, type: "UNIT_WARRIOR", x: 18, y: 5 }], { canBuy: sells({ UNIT_WARRIOR: 100 }) });
    assert.deepEqual(keys(run({ threats: [later] })), ["REINFORCE"]);
    assert.equal(units.guardDeadline(later), 2);
    assert.equal(units.guardsFor(later, undefined, [later], { within: 2 }), 1);
    fake.sent.length = 0;
    steps.buyDefenders([later], { budget: createBudget({ gold: 500, reserve: 0 }) });
    assert.deepEqual(bought(), []);
});

test("a guard goal that no longer holds stops counting: healing elsewhere, stopped on an earlier turn, or walking elsewhere (research/36 §1)", () => {
    const t = threat(FRONT, "Front");
    const turn = Game.turn;
    try {
        reset([{ id: 1, type: "UNIT_WARRIOR", x: 6, y: 5 }]);
        run({ threats: [t] });
        const u = world.units[0];
        Object.assign(u, { x: 8, y: 5, activity: A.OPERATION, dest: { x: 14, y: 5 } });
        assert.equal(units.guardsFor(t, undefined, [t]), 1, "on its way");
        Game.turn = turn + 1;
        assert.equal(units.guardsFor(t, undefined, [t]), 1, "still walking there the next turn");
        Object.assign(u, { dest: { x: 3, y: 12 } });
        assert.equal(units.guardsFor(t, undefined, [t]), 0, "walking somewhere else");
        Object.assign(u, { x: 3, y: 5, activity: A.HEAL, dest: undefined });
        assert.equal(units.guardsFor(t, undefined, [t]), 0, "healing far away (the reproduction of research/36)");
        Object.assign(u, { x: 8, y: 5, activity: A.NONE });
        assert.equal(units.guardsFor(t, undefined, [t]), 0, "stopped on its way on an earlier turn");
        // Its next pass sends it again (it is idle), and the goal is fresh.
        assert.deepEqual(keys(run({ threats: [t] })), ["REINFORCE"]);
        assert.equal(units.guardsFor(t, undefined, [t]), 1);
    } finally {
        Game.turn = turn;
    }
});

test("with «Оборона» alone a soldier asleep or fortified is woken and sent to a settlement short of guards (research/36 §4)", () => {
    // Game 29 M52-M54: Куско stood at 0 of 1, then 0 of 4 guards, while reserves slept.
    const t = threat(FRONT, "Front");
    reset([{ id: 1, type: "UNIT_WARRIOR", x: 6, y: 5, activity: A.SLEEP }], { unitCommandOk: (_id, op) => op === "UNITCOMMAND_WAKE" });
    const r = run({ threats: [t] });
    assert.deepEqual(keys(r), ["REINFORCE"]);
    const ops = fake.sent.filter((s) => s.id?.id === 1).map((s) => s.op);
    assert.deepEqual(ops, ["UNITCOMMAND_WAKE", UnitOperationTypes.MOVE_TO]);
    assert.ok(dist(moveOf(1), FRONT) <= 2);
});

test("ranged units reinforce too: an archer goes to a coast shot by ships, and behind the screen against a land army (research/36 §5)", () => {
    const ships = threat(FRONT, "Front", { land: 0, ships: 2 });
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }, { id: 2, type: "UNIT_ARCHER", x: 6, y: 5 }]);
    let r = run({ threats: [ships] });
    assert.ok(keys(r).includes("REINFORCE"), JSON.stringify(r.entries));
    const post = moveOf(2);
    assert.ok(post && dist(post, FRONT) <= 2 && dist(post, FRONT) > 0, JSON.stringify(post));
    // A land army of two from the east: its melee guards are there; the archer stands behind them.
    const army = threat(FRONT, "Front", { land: 2 });
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }, { id: 3, type: "UNIT_WARRIOR", x: 16, y: 5 }, { id: 2, type: "UNIT_ARCHER", x: 6, y: 5 }], {
        enemies: [{ x: 18, y: 5, owner: 9 }, { x: 18, y: 6, owner: 9 }],
    });
    assert.equal(units.rangedWanted(army), 1);
    assert.equal(units.rangedWanted(army, { support: false }), 0, "not bought");
    r = run({ threats: [army] });
    const back = moveOf(2);
    assert.ok(back, JSON.stringify(r.entries));
    // Within its range (2) of a raider, and as far from them as that allows (research/37 §3B), off the centre.
    const gap = Math.min(dist(back, { x: 18, y: 5 }), dist(back, { x: 18, y: 6 }));
    assert.equal(gap, 2, `in range, as far back as it allows: ${JSON.stringify(back)}`);
    assert.ok(dist(back, FRONT) > 0);
});

test("the settlement in most danger gets the free soldier first, and a settlement with a spare guard lends it to one with none (research/36 §4)", () => {
    // Game 29 M52: four reinforcements went to Антавайлья, listed first, while Куско had none.
    const big = threat(FRONT, "Front", { land: 3 });
    const hit = threat(SECOND, "Second", { land: 1, damaged: true });
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }, { id: 3, type: "UNIT_WARRIOR", x: 20, y: 5 }]);
    let r = run({ threats: [big, hit] });
    assert.ok(dist(moveOf(3) ?? { x: -9, y: -9 }, SECOND) <= 2, `to Second, its centre damaged and no guard: ${JSON.stringify(r.entries)}`);
    // Two at Front against one raider (neither on the centre); Second has none: one goes.
    const a = threat(FRONT, "Front");
    const b = threat(SECOND, "Second");
    reset([{ id: 1, type: "UNIT_WARRIOR", x: 14, y: 5 }, { id: 2, type: "UNIT_WARRIOR", x: 15, y: 6 }]);
    r = run({ threats: [a, b] });
    const sent = [1, 2].filter((id) => moveOf(id));
    assert.equal(sent.length, 1, JSON.stringify(r.entries));
    assert.ok(dist(moveOf(sent[0]), SECOND) <= 2);
    // The one on the centre never leaves it.
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }]);
    run({ threats: [threat(FRONT, "Front", { land: 0, ships: 1, count: 1 }), b] });
    assert.equal(moveOf(1), undefined);
});

test("a defender is bought from all the gold, ranged ones too, less 3 turns of a deficit; UI.log says why none is (research/36 §8)", () => {
    // Ships that hit the centre: a real attack (game 60: ships that have not hit it buy from the free gold only).
    const ships = threat(FRONT, "Front", { land: 0, ships: 2, damaged: true });
    // The reproduction of research/36: 500 gold all reserved, income below zero, an archer for 120.
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }], { goldIncome: -10, canBuy: sells({ UNIT_ARCHER: 120 }) });
    steps.buyDefenders([ships], { budget: createBudget({ gold: 500, reserve: 500 }) });
    assert.deepEqual(bought(), [["UNIT_ARCHER", 1]]);
    reset([{ id: 1, type: "UNIT_WARRIOR", ...FRONT }], { gold: 100, goldIncome: -10, canBuy: sells({ UNIT_ARCHER: 120 }) });
    const lines = quiet(() => steps.buyDefenders([ships], { budget: createBudget({ gold: 100, reserve: 100 }) }));
    assert.deepEqual(bought(), []);
    assert.ok(lines.some((l) => l.includes("defenders: none for Front") && l.includes("the cheapest, UNIT_ARCHER, costs 120; 70 of 100 gold usable (3 turns of the -10 deficit kept)")), JSON.stringify(lines));
});

test("war fronts: a war risk's nearest settlement gets a guard from the army before any war, our land only; the player's own fortified units stay; a front outlives a passing warning (research/36 §2)", () => {
    // Game 29: Catherine was a war risk from M36 (gone on M50, back on M51); nothing moved before her war at M52.
    const base = Game.turn;
    Game.turn = 10; // not an age's first turns (research/37: soldiers resting then were carried over by the game)
    const turn = Game.turn;
    try {
        reset([{ id: 1, type: "UNIT_WARRIOR", x: 12, y: 5 }], { relations: { 1: "UNFRIENDLY" } });
        steps.assessWar([]);
        const fronts = steps.warFronts();
        assert.deepEqual(fronts.map((f) => f.settlement.name), ["Second"]);
        let r = run({ fronts });
        assert.deepEqual(keys(r), ["STAGED"], JSON.stringify(r.entries));
        const post = moveOf(1);
        assert.ok(dist(post, SECOND) <= 2 && GameplayMap.getOwner(post.x, post.y) === 0, JSON.stringify(post));
        // On its way it is the front's guard: nobody else goes.
        world.units[0].activity = A.OPERATION;
        world.units.push({ id: 2, type: "UNIT_WARRIOR", x: 12, y: 6 });
        fake.sent.length = 0;
        r = run({ fronts });
        assert.equal(moveOf(2), undefined, JSON.stringify(r.entries));
        // A soldier the player fortified is not woken for a front; one the autopilot fortified is.
        reset([{ id: 3, type: "UNIT_WARRIOR", x: 12, y: 5, activity: A.SLEEP }], { relations: { 1: "UNFRIENDLY" }, unitCommandOk: (_id, op) => op === "UNITCOMMAND_WAKE" });
        steps.assessWar([]);
        assert.deepEqual(keys(run({ fronts: steps.warFronts() })), []);
        world.units[0].activity = A.NONE;
        assert.deepEqual(keys(run({})), ["FORTIFY"], "no front: it fortifies (the autopilot's own)");
        world.units[0].activity = A.SLEEP;
        fake.sent.length = 0;
        assert.deepEqual(keys(run({ fronts: steps.warFronts() })), ["STAGED"]);
        assert.deepEqual(fake.sent.filter((s) => s.id?.id === 3).map((s) => s.op), ["UNITCOMMAND_WAKE", UnitOperationTypes.MOVE_TO]);
        // The warning passes: the front stays 5 turns, then goes.
        world.relations = {};
        Game.turn = turn + 3;
        steps.assessWar([]);
        assert.deepEqual(steps.warFronts().map((f) => f.settlement.name), ["Second"]);
        Game.turn = turn + 6;
        steps.assessWar([]);
        assert.deepEqual(steps.warFronts(), []);
    } finally {
        Game.turn = base;
    }
});

test("war fronts take the soldiers the age change brought back fortified, and those the autopilot fortified before a reload (game 30)", async () => {
    // Game 30: under the game's default age transition (Continuity) 11 soldiers started Modern fortified; Данди's front
    // stood at 0 of 1 guards from M55 to M62 with 13 soldiers available, until a new Tank was trained.
    const base = Game.turn;
    try {
        Game.turn = 1;
        reset([{ id: 3, type: "UNIT_WARRIOR", x: 12, y: 5, activity: A.SLEEP }], { relations: { 1: "UNFRIENDLY" }, unitCommandOk: (_id, op) => op === "UNITCOMMAND_WAKE" });
        steps.assessWar([]);
        assert.deepEqual(keys(run({ fronts: steps.warFronts() })), ["STAGED"], "an age's first turn: carried over");
        // Later in the age, one the autopilot fortified before a reload: the save remembers it.
        Game.turn = 10;
        reset([{ id: 3, type: "UNIT_WARRIOR", x: 12, y: 5 }], { relations: { 1: "UNFRIENDLY" }, unitCommandOk: (_id, op) => op === "UNITCOMMAND_WAKE" });
        assert.deepEqual(keys(run({})), ["FORTIFY"]);
        world.units[0].activity = A.SLEEP;
        const reloaded = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js?reload");
        steps.assessWar([]);
        fake.sent.length = 0;
        const r = reloaded.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: steps.warFronts() });
        assert.deepEqual(r.entries.map((e) => e.key), ["STAGED"], "after a reload");
    } finally {
        Game.turn = base;
    }
});

test("a defender is trained where it arrives soonest, not in the nearest city, and a soldier of another role queued there does not stop it (research/36 §9)", () => {
    // Front is a town (it cannot train); Near is 4 tiles from it and listed first, Home 10 (city 2).
    const NEAR = { x: 19, y: 5 };
    const setCities = (near, home) => [
        { owner: 0, ...NEAR, name: "Near", pop: 4, ...near },
        { owner: 0, ...FRONT, name: "Front", pop: 4, isTown: true },
        { owner: 0, ...HOME, name: "Home", pop: 8, ...home },
    ];
    const t = threat(FRONT, "Front");
    try {
        // Near trains an archer already (wrong role): Home trains the warrior.
        reset([], { canBuild: trains("UNIT_WARRIOR", "UNIT_ARCHER"), costOf: () => 30 });
        world.cities = setCities({ prod: 10, queue: { type: "BUILDING_MONUMENT", turns: 5 }, queued: ["UNIT_ARCHER"] }, { prod: 10 });
        let out = steps.fillProduction(new Map(), { threats: [t] });
        assert.deepEqual(trained().filter(([type]) => type === "UNIT_WARRIOR"), [["UNIT_WARRIOR", 2]], JSON.stringify(out));
        // Near takes 10 turns and walks 2; Home takes 2 and walks 5: Home.
        reset([], { canBuild: trains("UNIT_WARRIOR"), costOf: () => 100 });
        world.cities = setCities({ prod: 10 }, { prod: 50 });
        out = steps.fillProduction(new Map(), { threats: [t] });
        assert.deepEqual(trained(), [["UNIT_WARRIOR", 2]], JSON.stringify(out));
        // A warrior queued in Near covers Front: nothing more.
        reset([], { canBuild: trains("UNIT_WARRIOR"), costOf: () => 30 });
        world.cities = setCities({ prod: 10, queue: { type: "BUILDING_MONUMENT", turns: 1 }, queued: ["UNIT_WARRIOR"] }, { prod: 10 });
        out = steps.fillProduction(new Map(), { threats: [t] });
        assert.deepEqual(trained(), [], JSON.stringify(out));
    } finally {
        world.cities = cities;
    }
});

test("a lone raider 3-4 tiles away is an early warning: a guard, not walls ahead of the queue (research/36 §3)", () => {
    const centre = GameplayMap.getIndexFromXY(FRONT.x, FRONT.y);
    const walls = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], Cost: 200 } : { Success: true, Plots: [] });
    const early = { settlement: { ...FRONT, name: "Front" }, count: 1, land: 1, ships: 0, close: 0, damaged: false, strong: true, owners: [] };
    assert.ok(units.earlyWarning(early));
    reset([], { canBuild: walls, canBuy: walls });
    assert.deepEqual(steps.fortifyThreatened([early], { budget: createBudget({ gold: 1000, reserve: 0 }), pool: "all" }), []);
    reset([], { canBuild: walls, canBuy: walls });
    const close = { ...early, close: 1 };
    assert.ok(!units.earlyWarning(close));
    assert.deepEqual(steps.fortifyThreatened([close], { budget: createBudget({ gold: 1000, reserve: 0 }), pool: "all" }).map((e) => e.key), ["WALLS_BOUGHT"]);
});

test("a defender bought this turn counts when training is decided: no second one for the same lack (research/36 §1)", () => {
    const t = threat(FRONT, "Front", { close: 1 });
    const queuedFor = () => trained().filter(([type]) => type === "UNIT_WARRIOR");
    reset([], { canBuy: sells({ UNIT_WARRIOR: 100 }), canBuild: trains("UNIT_WARRIOR"), costOf: () => 30 });
    steps.buyDefenders([t], { budget: createBudget({ gold: 500, reserve: 0 }) });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", 1]]);
    steps.fillProduction(new Map(), { threats: [t] });
    assert.deepEqual(queuedFor(), [], "the bought one is the guard Front lacked");
    // Two raiders: one bought, one trained.
    const two = threat(FRONT, "Front", { land: 2, close: 1 });
    reset([], { canBuy: sells({ UNIT_WARRIOR: 100 }), canBuild: trains("UNIT_WARRIOR"), costOf: () => 30 });
    steps.buyDefenders([two], { budget: createBudget({ gold: 500, reserve: 0 }) });
    steps.fillProduction(new Map(), { threats: [two] });
    assert.equal(queuedFor().length, 1);
});

// Game 48 (research/game48): Киото, a town on Amina's front, kept one guard for 9 turns of her war risk while the gold plan
// held 565 to make it a city; at A54 her 5-7 Spearmen took its centre from 62 to 0 in three turns, and besieged it could buy
// nothing. A front now wants a guard for every two of that leader's soldiers near it (up to 3), buys one while it can, and is
// no conversion goal.
const russianArmy = (n) => Array.from({ length: n }, (_, i) => ({ x: 30, y: 3 + i, owner: 1, type: "UNIT_WARRIOR" }));

test("a war front facing an army wants a guard for every two of that leader's soldiers near it, up to 3 (game 48: Киото)", () => {
    const base = Game.turn;
    Game.turn = 10;
    try {
        const free = [12, 13, 14, 15].map((x, i) => ({ id: 20 + i, type: "UNIT_WARRIOR", x, y: 7 }));
        reset(free, { relations: { 1: "UNFRIENDLY" }, enemies: russianArmy(5) });
        steps.assessWar([]);
        const fronts = steps.warFronts();
        assert.deepEqual(fronts.map((f) => [f.settlement.name, f.army]), [["Second", 5]]);
        assert.equal(units.frontGuardsWanted(fronts[0]), 3);
        const r = run({ fronts });
        assert.deepEqual(keys(r).filter((k) => k === "STAGED"), ["STAGED", "STAGED", "STAGED"], JSON.stringify(r.entries));
        // No army near: one guard, as before.
        reset(free, { relations: { 1: "UNFRIENDLY" } });
        steps.assessWar([]);
        assert.deepEqual(keys(run({ fronts: steps.warFronts() })).filter((k) => k === "STAGED"), ["STAGED"]);
    } finally {
        Game.turn = base;
    }
});

test("a war front facing an army has its extra guards trained; without the army one guard is enough (game 48)", () => {
    const base = Game.turn;
    Game.turn = 10;
    const guardsQueued = () => trained().filter(([type]) => type === "UNIT_WARRIOR").length;
    try {
        const one = [{ id: 20, type: "UNIT_WARRIOR", x: 12, y: 7 }];
        reset(one, { relations: { 1: "UNFRIENDLY" }, canBuild: trains("UNIT_WARRIOR"), costOf: () => 30 });
        steps.assessWar([]);
        steps.warFronts();
        steps.fillProduction(new Map(), { defend: true });
        assert.equal(guardsQueued(), 0, "one risky leader, one guard: none wanted");
        reset(one, { relations: { 1: "UNFRIENDLY" }, enemies: russianArmy(5), canBuild: trains("UNIT_WARRIOR"), costOf: () => 30 });
        steps.assessWar([]);
        steps.warFronts();
        const out = steps.fillProduction(new Map(), { defend: true });
        assert.equal(guardsQueued(), 2, JSON.stringify(out));
    } finally {
        Game.turn = base;
    }
});

test("a war front facing an army and short of guards buys one from the free gold while it can, one a turn (game 48)", () => {
    const base = Game.turn;
    Game.turn = 10;
    try {
        reset([], { relations: { 1: "UNFRIENDLY" }, enemies: russianArmy(5), canBuy: sells({ UNIT_WARRIOR: 60 }) });
        steps.assessWar([]);
        steps.warFronts();
        steps.buyDefenders([], { budget: createBudget({ gold: 500, reserve: 0 }) });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", 2]], "Second");
        // Two soldiers near: no purchase (a passing patrol is no army).
        reset([], { relations: { 1: "UNFRIENDLY" }, enemies: russianArmy(2), canBuy: sells({ UNIT_WARRIOR: 60 }) });
        steps.assessWar([]);
        steps.warFronts();
        steps.buyDefenders([], { budget: createBudget({ gold: 500, reserve: 0 }) });
        assert.deepEqual(bought(), []);
    } finally {
        Game.turn = base;
    }
});

test("a town at a war front is no conversion candidate (game 48: 565 gold held A50-A54 to make Киото, Amina's front, a city)", async () => {
    const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
    const base = Game.turn;
    Game.turn = 10;
    const second = cities[2];
    const was = { ...second };
    Object.assign(second, { isTown: true, pop: 8, prod: 30, cost: 300 });
    try {
        reset([], {});
        steps.assessWar([]);
        steps.warFronts();
        clearEngineCache();
        const names = () => steps.conversionCandidates(DEFAULT_SETTINGS).map((r) => r.town.name);
        assert.deepEqual(names(), ["Second"], "no front: a candidate");
        reset([], { relations: { 1: "UNFRIENDLY" } });
        steps.assessWar([]);
        steps.warFronts();
        clearEngineCache();
        assert.deepEqual(names(), [], "Russia's front");
    } finally {
        Object.keys(second).forEach((k) => delete second[k]);
        Object.assign(second, was);
        Game.turn = base;
    }
});

// Game 53 (research/42 B1): in Modern's war each front kept one guard (`melee 1 of 1`) while 15-26 soldiers stood free, and
// Китион's reinforcements came one at a time, 2-6 turns out, while its centre fell in five turns.
test("in a war (not a risk alone) the free soldiers go to its fronts: a share each, up to 4; training keeps the old want", () => {
    const base = Game.turn;
    Game.turn = 10;
    try {
        const free = [12, 13, 14, 15, 16].map((x, i) => ({ id: 20 + i, type: "UNIT_WARRIOR", x, y: 7 }));
        reset(free, { wars: [1] });
        steps.assessWar([]);
        const fronts = steps.warFronts();
        assert.deepEqual(fronts.map((f) => [f.settlement.name, f.atWar]), [["Second", true]]);
        assert.equal(units.frontGuardsWanted(fronts[0]), 1, "training and purchases: one guard");
        let r = run({ fronts });
        assert.deepEqual(keys(r).filter((k) => k === "STAGED").length, 4, JSON.stringify(r.entries));
        // A risk alone: one guard.
        reset(free, { relations: { 1: "UNFRIENDLY" } });
        steps.assessWar([]);
        r = run({ fronts: steps.warFronts() });
        assert.deepEqual(keys(r).filter((k) => k === "STAGED").length, 1, JSON.stringify(r.entries));
    } finally {
        Game.turn = base;
    }
});

// Game 56: Керетаро's front saw 0-1 of Trung Trac's soldiers; at M18 he declared war and 5 land units and 4 ships came.
test("a war front's army is the most of their soldiers seen near it within 10 turns: they walk out of sight (game 56)", () => {
    const base = Game.turn;
    try {
        Game.turn = 10;
        reset([], { relations: { 1: "UNFRIENDLY" }, enemies: russianArmy(5) });
        steps.assessWar([]);
        assert.equal(steps.warFronts()[0].army, 5);
        world.enemies = [];
        Game.turn = 14;
        steps.assessWar([]);
        const f = steps.warFronts()[0];
        assert.deepEqual([f.army, f.seen], [5, 0], "out of sight 4 turns: still 5");
        assert.equal(units.frontGuardsWanted(f), 3);
        Game.turn = 21;
        steps.assessWar([]);
        assert.equal(steps.warFronts()[0].army, 0, "11 turns: forgotten");
    } finally {
        Game.turn = base;
    }
});

// Game 56: town purchases took about 1,700 gold during the war risk; the declaration found 246 gold against a 540 defender.
// Game 57: two prices held ~1,100 for 35 turns of a risk that never came, and the GDP goal's Ports waited for them.
test("while a war risk lasts the free gold keeps one defender's price, not the savings goal's; none in peace (games 56-57)", () => {
    const base = Game.turn;
    try {
        Game.turn = 10;
        reset([], { relations: { 1: "UNFRIENDLY" }, canBuild: trains("UNIT_WARRIOR"), buyCost: () => 60 });
        steps.resetGoldPlan();
        steps.assessWar([]);
        assert.equal(steps.warFronts().length, 1);
        const b = steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget;
        assert.deepEqual([b.keep, b.reserve], [60, 0], "one front: one Warrior's price, kept");
        assert.deepEqual([b.free(), b.forGoal()], [440, 500], "small purchases leave it; the goal's own purchase may use it");
        // Two fronts: still one defender's price.
        reset([], { relations: { 1: "UNFRIENDLY" }, canBuild: trains("UNIT_WARRIOR"), buyCost: () => 60, cities: [...cities, { owner: 0, x: 30, y: 12, name: "South", pop: 4, prod: 10 }] });
        steps.resetGoldPlan();
        steps.assessWar([]);
        assert.equal(steps.warFronts().length, 2);
        assert.equal(steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget.keep, 60, "two fronts: one price");
        reset([], { canBuild: trains("UNIT_WARRIOR"), buyCost: () => 60 });
        steps.resetGoldPlan();
        steps.assessWar([]);
        steps.warFronts();
        assert.equal(steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget.keep, 0, "peace");
    } finally {
        delete world.buyCost;
        Game.turn = base;
    }
});
