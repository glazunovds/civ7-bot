// Game 60 (the user: "Scouts may waste a lot of turns at the start of the game"): our scouts came back to within a tile of
// where they stood two turns earlier on 42% of their moving turns T1-T40 (the AIs' 6-15%). A village sight tile that never
// showed the village was ordered 14 times and fled from every other turn; a walking scout switched between a village and a
// discovery every pass; our own frontier target was a random tile re-drawn every pass; Exploration's scouts stood idle every
// pass from E31 (rough seas); and the capital trained a second scout before its first settler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 8 };
const world = {
    width: 40, height: 20, wrapX: false,
    // world.hidden(x, y): tiles never seen; world.water(x, y): coast.
    tiles: (x, y) => ({ terrain: world.water?.(x, y) ? "TERRAIN_COAST" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, revealed: !world.hidden?.(x, y) }),
    structures: (x, y) => (world.caves?.some((c) => c.x === x && c.y === y) ? { district: null, constructibles: ["IMPROVEMENT_CAVE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...ATHENS, name: "Athens", pop: 3, prod: 10 }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { SCOUT, createSightMemory, frontierScore, keepsHeading, wrapDx } = await import("../mod/expansion-planner/ui/core/xpl-scouting.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");

const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { explore: true, random: () => 0.5, ...options });
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const opsOf = (id) => fake.sent.filter((s) => s.id?.id === id).map((s) => s.op);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["enemies", "wars", "hidden", "water", "caves", "villages", "areaId", "techs", "unitCanStart", "unitCommandOk", "indepRelation"]) delete world[k];
    Object.assign(world, extra);
};
const next = (list) => {
    Game.turn += 1;
    fake.sent.length = 0;
    world.units = list;
};
const lines = (fn) => {
    const out = [];
    const warn = console.warn;
    console.warn = (...a) => out.push(a.join(" "));
    try {
        return { r: fn(), out };
    } finally {
        console.warn = warn;
    }
};
const at = (m) => (m ? { x: m.X, y: m.Y } : null);

test("rules: a frontier's worth, the heading, the shorter way round, the sight memory", () => {
    assert.ok(frontierScore({ hidden: 6, turns: 2 }) > frontierScore({ hidden: 1, turns: 2 }), "more hidden tiles");
    assert.ok(frontierScore({ hidden: 4, turns: 1 }) > frontierScore({ hidden: 4, turns: 3 }), "nearer");
    assert.equal(frontierScore({ hidden: 2, turns: 1, aligned: true }) - frontierScore({ hidden: 2, turns: 1 }), SCOUT.HEADING_BONUS);
    assert.equal(frontierScore({ hidden: 2, turns: 1 }) - frontierScore({ hidden: 2, turns: 1, crowded: true }), SCOUT.CROWD_PENALTY);
    assert.ok(keepsHeading({ dx: 3, dy: 0 }, 4, 1) && !keepsHeading({ dx: 3, dy: 0 }, -4, 0) && !keepsHeading(null, 1, 0));
    assert.equal(wrapDx(78, 2, 80, true), 4, "across the seam");
    assert.equal(wrapDx(10, 14, 80, true), 4);
    const m = createSightMemory();
    m.fail("v", "a", 10, true);
    m.fail("v", "b", 10, false);
    assert.ok(m.failed("v", "a", 40), "a blind tile stays blind");
    assert.ok(m.failed("v", "b", 19) && !m.failed("v", "b", 10 + SCOUT.VILLAGE_RETRY_TURNS), "a tile fled from is tried again later");
    m.giveUp("v", 10);
    assert.ok(m.givenUp("v", 19) && !m.givenUp("v", 20));
    assert.equal(m.blindCount("v"), 1);
});

test("a village's sight tile that does not show it is not taken again; when every one failed the village is left for a while (game 60: 70,11)", () => {
    const turn = Game.turn;
    // Шэнле's pocket: the village on a cape, two land tiles in sight of it, the rest water.
    const V = { x: 16, y: 8 };
    const land = new Set(["16,8", "15,8", "14,8", "13,8", "12,8", "11,8", "10,8"]);
    try {
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 11, y: 8 }], {
            villages: [{ owner: 9, ...V }],
            hidden: (x, y) => x === V.x && y === V.y,
            water: (x, y) => dist({ x, y }, V) <= 3 && !land.has(`${x},${y}`),
        });
        Game.turn = 40;
        let r = run();
        assert.equal(r.entries[0]?.key, "SCOUT_VILLAGE", JSON.stringify(r.entries));
        const first = at(moveOf(8));
        assert.ok(dist(first, V) <= 2, `a sight tile: ${JSON.stringify(first)}`);
        // It stands there and the village stays unseen (the land between blocks sight): another tile.
        next([{ id: 8, type: "UNIT_SCOUT", ...first }]);
        const { r: r2, out } = lines(() => run());
        assert.equal(r2.entries[0]?.key, "SCOUT_VILLAGE", JSON.stringify(r2.entries));
        const second = at(moveOf(8));
        assert.ok(second && !(second.x === first.x && second.y === first.y) && dist(second, V) <= 2, `not ${JSON.stringify(first)} again: ${JSON.stringify(second)}`);
        assert.ok(out.some((l) => l.includes(`scout: `) && l.includes(`unseen from ${first.x},${first.y}`)), out.join("\n"));
        // That one is blind too: every sight tile failed, the village is left alone for a while, the scout explores.
        next([{ id: 8, type: "UNIT_SCOUT", ...second }]);
        const { r: r3, out: out3 } = lines(() => run());
        assert.ok(!r3.entries.some((e) => e.key === "SCOUT_VILLAGE"), JSON.stringify(r3.entries));
        assert.ok(out3.some((l) => l.includes("skipped for 10 turns") && l.includes("2 blind or fled from")), out3.join("\n"));
        next([{ id: 8, type: "UNIT_SCOUT", x: 11, y: 8 }]);
        assert.ok(!run().entries.some((e) => e.key === "SCOUT_VILLAGE"), "still left alone");
    } finally {
        Game.turn = turn;
    }
});

test("a sight tile within 2 of a hostile unit is not picked, and one the scout fled from is not its next pick (game 60, E4: 37 turns of SCOUT_VILLAGE and UNIT_AWAY)", () => {
    const turn = Game.turn;
    const V = { x: 16, y: 8 };
    try {
        // One radius for the tile, its way and the step away: 14,8 (the nearest) is 2 from the warrior at 13,6.
        const warrior = { x: 13, y: 6, owner: 1, type: "UNIT_WARRIOR" };
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 10, y: 8 }], { villages: [{ owner: 9, ...V }], hidden: (x, y) => x === V.x && y === V.y, wars: [1], enemies: [warrior] });
        Game.turn = 60;
        let r = run();
        let pick = at(moveOf(8));
        assert.ok(!r.entries.some((e) => e.key === "SCOUT_VILLAGE") || dist(pick, warrior) > 2, `not within 2 of the warrior: ${JSON.stringify(r.entries)}`);
        assert.ok(!(pick?.x === 14 && pick?.y === 8), "not 14,8");
        // No warrior: the nearest tile, 14,8.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 10, y: 8 }], { villages: [{ owner: 9, ...V }], hidden: (x, y) => x === V.x && y === V.y, wars: [1] });
        run();
        const first = at(moveOf(8));
        assert.deepEqual(first, { x: 14, y: 8 });
        // On its way a warrior comes next to it: it steps away, and gives that tile up.
        next([{ id: 8, type: "UNIT_SCOUT", x: 12, y: 8, activity: UnitActivityTypes.OPERATION, dest: first }]);
        world.enemies = [{ x: 13, y: 8, owner: 1, type: "UNIT_WARRIOR" }];
        r = run();
        assert.equal(r.entries[0]?.key, "UNIT_AWAY", JSON.stringify(r.entries));
        // The warrior gone and the scout back on 12,8: another sight tile, not the one it fled from (the nearest).
        delete world.enemies;
        next([{ id: 8, type: "UNIT_SCOUT", x: 12, y: 8 }]);
        r = run();
        pick = at(moveOf(8));
        assert.equal(r.entries[0]?.key, "SCOUT_VILLAGE", JSON.stringify(r.entries));
        assert.ok(dist(pick, V) <= 2 && !(pick.x === first.x && pick.y === first.y), `not the tile it fled from: ${JSON.stringify(pick)}`);
    } finally {
        Game.turn = turn;
    }
});

test("a soldier sent toward an unseen village (approach) learns the blind tiles too: standing on one with the village unseen, it takes another", () => {
    const turn = Game.turn;
    const V = { x: 16, y: 8 };
    try {
        fresh([{ id: 20, type: "UNIT_WARRIOR", x: 10, y: 8 }], { villages: [{ owner: 9, ...V }], hidden: (x, y) => x === V.x && y === V.y, indepRelation: { 9: IndependentRelationship.NEUTRAL } });
        Game.turn = 70;
        let r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [9] });
        assert.ok(r.entries.some((e) => e.key === "APPROACH"), JSON.stringify(r.entries));
        const first = at(moveOf(20));
        assert.equal(dist(first, V), 2);
        // There, the village still unseen: another tile 2 from it.
        next([{ id: 20, type: "UNIT_WARRIOR", ...first }]);
        r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [9] });
        const second = at(moveOf(20));
        assert.ok(r.entries.some((e) => e.key === "APPROACH") && second && dist(second, V) === 2 && !(second.x === first.x && second.y === first.y), JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

test("a walking scout keeps its way to its village: no discovery the other way takes it, only one it reaches this turn (game 60: T1-T12)", () => {
    const turn = Game.turn;
    const V = { x: 5, y: 15 };
    try {
        fresh([{ id: 8, type: "UNIT_SCOUT", ...ATHENS }], { villages: [{ owner: 9, ...V }], hidden: (x, y) => x === V.x && y === V.y, caves: [{ x: 9, y: 4 }] });
        Game.turn = 2;
        let r = run();
        assert.equal(r.entries[0]?.key, "SCOUT_VILLAGE", JSON.stringify(r.entries));
        const sight = at(moveOf(8));
        // On its way (a move order the game keeps): no new order, twice.
        for (const y of [10, 11]) {
            next([{ id: 8, type: "UNIT_SCOUT", x: 5, y, activity: UnitActivityTypes.OPERATION, dest: sight }]);
            r = run();
            assert.equal(moveOf(8), undefined, `kept its way at 5,${y}: ${JSON.stringify(r.entries)}`);
        }
        // A cave it reaches this turn may take it.
        world.caves = [{ x: 9, y: 4 }, { x: 6, y: 12 }];
        next([{ id: 8, type: "UNIT_SCOUT", x: 5, y: 11, activity: UnitActivityTypes.OPERATION, dest: sight }]);
        r = run();
        assert.deepEqual(at(moveOf(8)), { x: 6, y: 12 }, JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

test("a scout going around danger toward a discovery keeps its detour while it walks to the waypoint", () => {
    const turn = Game.turn;
    const CAVE = { x: 12, y: 8 };
    try {
        // Scout 60 dies on its way at 8,8: the next one goes around that spot by a waypoint.
        fresh([{ id: 60, type: "UNIT_SCOUT", x: 5, y: 8 }], { caves: [CAVE] });
        Game.turn = 20;
        run();
        next([{ id: 60, type: "UNIT_SCOUT", x: 8, y: 8, activity: UnitActivityTypes.OPERATION, moved: true }]);
        run();
        next([{ id: 61, type: "UNIT_SCOUT", x: 5, y: 8 }]);
        const r = run();
        assert.ok(r.entries.some((e) => e.key === "DETOUR"), JSON.stringify(r.entries));
        const via = at(moveOf(61));
        // Walking to the waypoint: no new order.
        next([{ id: 61, type: "UNIT_SCOUT", x: 5, y: 8, activity: UnitActivityTypes.OPERATION, dest: via }]);
        run();
        assert.equal(moveOf(61), undefined, JSON.stringify(fake.sent));
    } finally {
        Game.turn = turn;
    }
});

test("a scout the game explores with has no goal of ours left: a discovery 3 turns away still takes it", () => {
    const turn = Game.turn;
    try {
        // Fog east of x 20: our frontier first (the game's exploring refused), a goal kept while it walks.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 14, y: 8 }], { hidden: (x) => x >= 20 });
        world.unitCanStart = (_id, op) => (op === "UNITOPERATION_AUTOMATE_EXPLORE" ? { Success: false } : undefined);
        Game.turn = 5;
        assert.equal(run().entries[0]?.key, "ROAM");
        // Arrived and idle, the game's exploring is offered now: it explores by itself.
        delete world.unitCanStart;
        next([{ id: 8, type: "UNIT_SCOUT", x: 17, y: 8 }]);
        assert.equal(run().entries[0]?.key, "EXPLORE");
        // Exploring by itself, a cave 3 turns away: it goes (before, the old frontier goal held it back).
        world.caves = [{ x: 11, y: 8 }];
        next([{ id: 8, type: "UNIT_SCOUT", x: 17, y: 8, activity: 999 }]);
        const r = run();
        assert.deepEqual(at(moveOf(8)), { x: 11, y: 8 }, JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

test("our frontier: the most hidden land nearest, the heading kept, not near another scout's goal; then kept while walking (game 60: a random tile each pass)", () => {
    const turn = Game.turn;
    // A big blob of fog 4 tiles east (19-21, 7-9) and a single unseen tile 4 tiles north (14,4).
    const blob = (x, y) => (x >= 19 && x <= 21 && y >= 7 && y <= 9) || (x === 14 && y === 4);
    const refuse = (_id, op) => (op === "UNITOPERATION_AUTOMATE_EXPLORE" ? { Success: false } : undefined);
    try {
        for (const random of [() => 0, () => 0.99]) {
            fresh([{ id: 8, type: "UNIT_SCOUT", x: 14, y: 8 }], { hidden: blob, unitCanStart: refuse });
            Game.turn = 10;
            const r = units.commandUnits(DEFAULT_SETTINGS, { explore: true, random });
            const to = at(moveOf(8));
            assert.ok(to && to.x >= 17, `toward the blob east, whatever chance says: ${JSON.stringify(r.entries)}`);
        }
        // Walking there: no new order.
        const goal = at(moveOf(8));
        next([{ id: 8, type: "UNIT_SCOUT", x: 15, y: 8, activity: UnitActivityTypes.OPERATION, dest: goal }]);
        run();
        assert.equal(moveOf(8), undefined, "it keeps its frontier");
        // Another scout next to it goes elsewhere than near the first one's goal.
        next([{ id: 8, type: "UNIT_SCOUT", x: 15, y: 8, activity: UnitActivityTypes.OPERATION, dest: goal }, { id: 9, type: "UNIT_SCOUT", x: 14, y: 8 }]);
        run();
        const other = at(moveOf(9));
        assert.ok(other && dist(other, goal) > SCOUT.CROWD_RADIUS, `away from the first one's goal: ${JSON.stringify(other)}`);
    } finally {
        Game.turn = turn;
    }
});

test("rough seas: a land scout looks farther on its own landmass, never another; with nothing left it sleeps, and wakes when the seas calm (game 60: idle every pass from E31)", () => {
    const turn = Game.turn;
    const age = Game.age;
    try {
        Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION").$hash;
        // Everything within 10 tiles seen. Unseen land 16 tiles east on our landmass (x 25+), and nearer, 11 tiles north across
        // a strait, an island (area 2) half unseen.
        const island = (x, y) => y <= 1;
        const strait = (x, y) => y === 2 || y === 3;
        const areaId = (x, y) => (island(x, y) ? 2 : strait(x, y) ? 1 : 0);
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12 }], { hidden: (x, y) => (x >= 25 && y >= 4) || (island(x, y) && x <= 8), water: strait, areaId });
        Game.turn = 31;
        let r = run();
        assert.equal(r.entries[0]?.key, "ROAM", JSON.stringify(r.entries));
        assert.ok(at(moveOf(8)).x >= 20 && at(moveOf(8)).y >= 4, `east, on its own land: ${JSON.stringify(moveOf(8))}`);
        // Nothing unseen on its land: it sleeps.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12 }], { hidden: (x, y) => island(x, y) && x <= 8, water: strait, areaId });
        r = run();
        assert.equal(r.entries[0]?.key, "SCOUT_SLEEPS", JSON.stringify(r.entries));
        assert.ok(opsOf(8).includes("UNITOPERATION_SLEEP"));
        // Asleep: left alone while the seas are rough...
        next([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12, activity: UnitActivityTypes.SLEEP }]);
        run();
        assert.deepEqual(opsOf(8), [], "asleep");
        // ...and woken once Shipbuilding comes, exploring with the game's help again.
        world.techs = ["NODE_TECH_EX_SHIPBUILDING"];
        world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_WAKE";
        next([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12, activity: UnitActivityTypes.SLEEP }]);
        run();
        assert.deepEqual(opsOf(8), ["UNITCOMMAND_WAKE", "UNITOPERATION_AUTOMATE_EXPLORE"], JSON.stringify(fake.sent));
    } finally {
        Game.age = age;
        Game.turn = turn;
        delete world.techs;
    }
});

test("a scout we put to sleep is kept in the save: after a reload it is woken and looks again", async () => {
    const turn = Game.turn;
    const age = Game.age;
    try {
        Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION").$hash;
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12 }]);
        Game.turn = 40;
        assert.equal(run().entries[0]?.key, "SCOUT_SLEEPS");
        // The UI reloads (a new module instance, the save's properties kept): the sleeping scout is woken once.
        const reloaded = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js?reload");
        world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_WAKE";
        next([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12, activity: UnitActivityTypes.SLEEP }]);
        reloaded.commandUnits(DEFAULT_SETTINGS, { explore: true, random: () => 0.5 });
        assert.equal(opsOf(8)[0], "UNITCOMMAND_WAKE", JSON.stringify(fake.sent));
        reloaded.resetUnitGoals();
    } finally {
        Game.age = age;
        Game.turn = turn;
    }
});

test("a scout we put to sleep is woken by danger and gets away first (UNITOPERATION_SLEEP lasts until woken; only ALERT wakes a unit for an enemy)", () => {
    const turn = Game.turn;
    const age = Game.age;
    try {
        Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION").$hash;
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12 }]);
        Game.turn = 40;
        assert.equal(run().entries[0]?.key, "SCOUT_SLEEPS");
        // The next turn, still rough seas, a hostile Warrior next to it.
        world.wars = [1];
        world.enemies = [{ x: 9, y: 12, owner: 1, type: "UNIT_WARRIOR" }];
        world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_WAKE";
        next([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12, activity: UnitActivityTypes.SLEEP }]);
        const r = run();
        assert.equal(opsOf(8)[0], "UNITCOMMAND_WAKE", JSON.stringify(fake.sent));
        assert.equal(r.entries[0]?.key, "UNIT_AWAY", JSON.stringify(r.entries));
        assert.ok(dist(at(moveOf(8)), { x: 9, y: 12 }) > 1, JSON.stringify(moveOf(8)));
    } finally {
        Game.age = age;
        Game.turn = turn;
    }
});

test("rough seas, nothing to explore: a scout in a ship's reach that cannot get away is not put to sleep there", () => {
    const turn = Game.turn;
    const age = Game.age;
    try {
        Game.age = GameInfo.Ages.lookup("AGE_EXPLORATION").$hash;
        // The sea from y 13 (its own water body); a Galley at war with us at 8,15 reaches 8,12 next turn. No way anywhere.
        const sea = (x, y) => y >= 13;
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12 }], {
            water: sea, areaId: (x, y) => (sea(x, y) ? 1 : 0), wars: [1], enemies: [{ x: 8, y: 15, owner: 1, type: "UNIT_GALLEY" }],
        });
        world.unreachable = () => true;
        Game.turn = 140;
        const r = run();
        assert.ok(!opsOf(8).includes("UNITOPERATION_SLEEP"), JSON.stringify(r.entries));
        assert.ok(!r.entries.some((x) => x.key === "SCOUT_SLEEPS"), JSON.stringify(r.entries));
        // Out of the Galley's reach it sleeps as before.
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 8, y: 12 }], { water: sea, areaId: (x, y) => (sea(x, y) ? 1 : 0) });
        world.unreachable = () => true;
        Game.turn = 141;
        assert.equal(run().entries[0]?.key, "SCOUT_SLEEPS");
    } finally {
        delete world.unreachable;
        Game.age = age;
        Game.turn = turn;
    }
});

test("the second scout comes only after the first settler is trained or queued (game 60: it took the capital's first 6 turns)", () => {
    const scout = GameInfo.Units.lookup("UNIT_SCOUT").$hash;
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 8, rank: 1 }] } } });
    const city = world.cities[0];
    try {
        fresh([{ id: 8, type: "UNIT_SCOUT", x: 6, y: 8 }]);
        world.goldIncome = 5;
        let out = steps.fillProduction(new Map(), { explore: true, settlers: true });
        const queued = () => fake.sent.filter((s) => s.kind === "operation").map((s) => s.args?.UnitType);
        assert.ok(!queued().includes(scout), `one scout, no settler yet: no second scout: ${JSON.stringify(out)}`);
        assert.ok(out.some((e) => e.key === "QUEUED_SETTLER"), JSON.stringify(out));
        // The settler queued: the second scout follows.
        city.trains = "UNIT_SETTLER";
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), { explore: true, settlers: true });
        assert.ok(out.some((e) => e.key === "QUEUED_SCOUT"), JSON.stringify(out));
        // The starting scout lost: one is trained at once.
        delete city.trains;
        fresh([]);
        fake.sent.length = 0;
        out = steps.fillProduction(new Map(), { explore: true });
        assert.ok(out.some((e) => e.key === "QUEUED_SCOUT"), JSON.stringify(out));
    } finally {
        delete city.trains;
        delete world.goldIncome;
        state.set({ results: { ...state.get().results, sites: { picks: [] } } });
    }
});
