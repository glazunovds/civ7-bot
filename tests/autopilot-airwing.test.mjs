// Research/37 Phase 5: the air wing. Enemy air attacks on us are remembered from the game's Combat event; fighters rebase
// to cover the settlements hit lately or in enemy bombers' reach (a Launch Pad city first), never back and forth, and a
// rebase the game refuses is re-planned, not resent; a ground attacker is trained at a lasting front where an Airfield
// with a free slot reaches it (fighters first); and our aircraft strike a raider about to take a damaged centre first, a
// settlement's attacker before a damaged bystander, and one out of enemy fighters' cover before one under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const FRONT = { x: 15, y: 5 };
const MOSCOW = { x: 24, y: 5 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Russia" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
        { owner: 0, ...FRONT, name: "Front", pop: 4, prod: 10 },
        { owner: 1, ...MOSCOW, name: "Moscow", pop: 6 },
    ],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world, "modern");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { AIR, airTargetScore, planRebases } = await import("../mod/expansion-planner/ui/core/xpl-air.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const at = (x, y) => ({ x, y });
// Home's Airfield at 6,5 (army 8), Front's at 16,5 (army 7): each with its Aerodrome Commander; a Squadron Commander's
// base at 13,6 (army 9) covers Front too (2 tiles; a squadron's fighters intercept within 3).
const HOME_BASE = { id: 80, type: "UNIT_AERODROME_COMMANDER", x: 6, y: 5, army: 8 };
const FRONT_BASE = { id: 70, type: "UNIT_AERODROME_COMMANDER", x: 16, y: 5, army: 7 };
const SQUADRON = { id: 90, type: "UNIT_SQUADRON_COMMANDER", x: 13, y: 6, army: 9 };
const ARMIES = { "0:7": { x: 16, y: 5, capacity: 4 }, "0:8": { x: 6, y: 5, capacity: 4 }, "0:9": { x: 13, y: 6, capacity: 4 } };
const owningCity = (x, y) => (GameplayMap.getPlotDistance(x, y, HOME.x, HOME.y) <= 1 ? { owner: 0, id: 0 } : GameplayMap.getPlotDistance(x, y, FRONT.x, FRONT.y) <= 1 ? { owner: 0, id: 1 } : null);
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "unitCanStart", "canBuild", "costOf", "armies", "owningCity", "structures", "districtHealth"]) delete world[k];
    world.units = [];
    Game.turn = 20;
    Object.assign(world, { armies: ARMIES, owningCity }, extra);
};
const lines = (fn) => {
    const warn = console.warn;
    const out = [];
    console.warn = (...a) => out.push(a.join(" "));
    try {
        return { result: fn(), lines: out };
    } finally {
        console.warn = warn;
    }
};
// A bomber of Russia's hits our infantry at Front (the game's Combat event, as probe P-AIR-5 saw its payload in game 36).
const raid = (bomberAt = at(20, 5)) => {
    world.enemies = [{ ...bomberAt, owner: 1, type: "UNIT_BOMBER" }];
    const attacker = MapUnits.getUnits(bomberAt.x, bomberAt.y)[0];
    const defender = Players.get(0).Units.getUnits().find((u) => u.id.id === 3).id;
    engine.trigger("Combat", { attacker, defender, interceptor: { owner: -1, id: -1, type: 0 }, antiAir: { owner: -1, id: -1, type: 0 } });
};
const WARRIOR = { id: 3, type: "UNIT_INFANTRY_COMPANY", ...FRONT };
const rebaseOffer = (tiles) => (_id, op) => (op === "UNITOPERATION_REBASE" ? { Success: false, Plots: tiles.map((t) => idx(t.x, t.y)) } : undefined);
const run = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [], airCover: steps.airCoverTargets() });
const rebases = () => fake.sent.filter((s) => s.op === "UNITOPERATION_REBASE").map((s) => [s.id.id, s.args.X, s.args.Y]);

test("planRebases: the most important settlement first, one plane a free slot, and a fighter that alone covers another stays", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const offered = new Set(["10,0", "20,0"]);
    const bases = [{ at: at(10, 0), free: 1, range: 3 }, { at: at(20, 0), free: 1, range: 3 }];
    const fighters = [
        { key: "a", at: at(0, 0), range: 3, movable: true, offered },
        { key: "b", at: at(1, 0), range: 3, movable: true, offered },
    ];
    // Two spares and one slot covering the target: one rebase.
    assert.deepEqual(planRebases({ fighters, bases: [bases[0]], targets: [{ x: 11, y: 0, rank: 1 }], dist: line }).map((m) => m.key), ["b"], "the nearer of them");
    // The pad city (rank 0) before the raided one (rank 1).
    const two = planRebases({ fighters: [fighters[0]], bases, targets: [{ x: 11, y: 0, rank: 1 }, { x: 21, y: 0, rank: 0 }], dist: line });
    assert.deepEqual(two.map((m) => [m.key, m.to.x]), [["a", 20]]);
    // A fighter that alone covers a wanted settlement where it is stays there.
    const stay = planRebases({ fighters: [fighters[0]], bases, targets: [{ x: 1, y: 0, rank: 1 }, { x: 11, y: 0, rank: 1 }], dist: line });
    assert.deepEqual(stay, []);
});

test("air targets: a raider next to a damaged centre, then a settlement's attacker, then a damaged bystander; under enemy fighter cover last", () => {
    const capture = airTargetScore({ d: 1, damage: 0, capture: true });
    const attacker = airTargetScore({ d: 2, damage: 0 });
    const bystander = airTargetScore({ d: 4, damage: 90 });
    assert.ok(capture > attacker && attacker > bystander, JSON.stringify([capture, attacker, bystander]));
    assert.ok(airTargetScore({ d: 2, damage: 0, covered: true }) < attacker);
    assert.ok(AIR.REBASE_RETRY > 0 && AIR.RAID_TURNS > 0);
});

test("an enemy air attack is remembered from the game's Combat event: a fighter is wanted there with no enemy aircraft in sight, until the memory ends", () => {
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR], canBuild: (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_FIGHTER"].includes(type) } : undefined), costOf: () => 100 });
    const { lines: said } = lines(() => raid());
    assert.ok(said.some((l) => l.includes("UNIT_BOMBER of p1 hit ours at 15,5")), JSON.stringify(said));
    assert.deepEqual(units.airRaidTargets().map((t) => t.name), ["Front"]);
    delete world.enemies; // gone from sight
    steps.assessWar([]);
    const out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.ok(out.some((e) => e.key === "QUEUED_INTERCEPTOR" && e.args[0] === "Front"), JSON.stringify(out));
    // The memory ends after AIR.RAID_TURNS.
    Game.turn += AIR.RAID_TURNS;
    assert.deepEqual(units.airRaidTargets(), []);
    // A Combat between others, or an attack by a land unit, is no air raid.
    assert.equal(units.noteAirRaid({ attacker: { owner: 1, id: 999, type: 1 }, defender: { owner: 2, id: 1, type: 1 } }), false);
});

test("a fighter whose base covers nothing wanted rebases to the base that covers a settlement hit from the air; one there stays; one slot, one plane", () => {
    const home1 = { id: 1, type: "UNIT_FIGHTER", x: 6, y: 5, onMap: false, army: 8 };
    const home2 = { id: 2, type: "UNIT_FIGHTER", x: 6, y: 5, onMap: false, army: 8 };
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR, home1], unitCanStart: rebaseOffer([at(16, 5)]) });
    raid();
    const { result: r, lines: said } = lines(run);
    assert.deepEqual(rebases(), [[1, 16, 5]], JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "FIGHTER_REBASED" && e.args[1] === "Front"));
    assert.ok(said.some((l) => l.includes("air: bases [") && l.includes("Front (hit from the air lately) covered by 0")), JSON.stringify(said));
    // Based at Front already: it stays.
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR, { ...home1, x: 16, y: 5, army: 7 }], unitCanStart: rebaseOffer([at(6, 5)]) });
    raid();
    run();
    assert.deepEqual(rebases(), []);
    // Two spare fighters at Home and one free slot at Front: one rebase.
    reset({
        wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR, home1, home2], unitCanStart: rebaseOffer([at(16, 5)]),
        armies: { ...ARMIES, "0:7": { x: 16, y: 5, capacity: 1 } },
    });
    raid();
    run();
    assert.deepEqual(rebases().length, 1);
    // Front's base full (one slot, a bomber in it): no fighter goes there.
    reset({
        wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR, home1, { id: 6, type: "UNIT_BOMBER", x: 16, y: 5, onMap: false, army: 7 }],
        unitCanStart: rebaseOffer([at(16, 5)]), armies: { ...ARMIES, "0:7": { x: 16, y: 5, capacity: 1 } },
    });
    raid();
    run();
    assert.deepEqual(rebases(), []);
});

test("a Launch Pad city wants cover first: the one spare fighter goes to its base, not to the other raided settlement's", () => {
    // Both Home and Front were hit; Front has the Launch Pad. The fighter waits at the squadron's base, 4 tiles from Front.
    const fighter = { id: 1, type: "UNIT_FIGHTER", x: 30, y: 15, onMap: false, army: 10 };
    reset({
        wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR, { id: 4, type: "UNIT_INFANTRY_COMPANY", ...HOME }, fighter],
        unitCanStart: rebaseOffer([at(6, 5), at(16, 5)]),
        armies: { ...ARMIES, "0:7": { x: 16, y: 5, capacity: 1 }, "0:8": { x: 6, y: 5, capacity: 1 }, "0:10": { x: 30, y: 15, capacity: 4 } },
        structures: (x, y) => ({ district: null, constructibles: x === FRONT.x && y === FRONT.y ? ["BUILDING_LAUNCH_PAD"] : [] }),
    });
    raid();
    const homeHit = Players.get(0).Units.getUnits().find((u) => u.id.id === 4).id;
    engine.trigger("Combat", { attacker: MapUnits.getUnits(20, 5)[0], defender: homeHit });
    assert.deepEqual(steps.airCoverTargets().map((t) => [t.name, t.rank]), [["Front", 0], ["Home", 1]]);
    run();
    assert.deepEqual(rebases(), [[1, 16, 5]]);
});

test("a rebase the game does not carry out is re-planned, not resent: that base is left out for the plane and another one taken", () => {
    const fighter = { id: 1, type: "UNIT_FIGHTER", x: 6, y: 5, onMap: false, army: 8 };
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, SQUADRON, WARRIOR, fighter], unitCanStart: rebaseOffer([at(16, 5), at(13, 6)]) });
    raid();
    run();
    assert.deepEqual(rebases(), [[1, 13, 6]], "of the bases covering Front, the nearer to the plane: the squadron's");
    // The next turn it is still at Home: the game did not take it there. Not sent there again: Front's Airfield.
    Game.turn += 1;
    fake.sent.length = 0;
    const { lines: said } = lines(run);
    assert.deepEqual(rebases(), [[1, 16, 5]]);
    assert.ok(said.some((l) => l.includes("was not rebased to 13,6")), JSON.stringify(said));
});

test("a ground attacker at a lasting front: trained where an Airfield with a free slot reaches it, the strongest against units; not before the third turn, nor a second", () => {
    const threats = [{ settlement: { ...FRONT, name: "Front" }, count: 2, land: 2, owners: [] }];
    const planes = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_TRENCH_FIGHTER", "UNIT_DIVEBOMBER"].includes(type) } : undefined);
    const ordered = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => [GameInfo.Units.lookup(s.args.UnitType)?.UnitType, s.id.id]);
    const train = (turn) => {
        Game.turn = turn;
        fake.sent.length = 0;
        steps.assessWar([]);
        return steps.fillProduction(new Map(), { defend: true, threats });
    };
    reset({ units: [HOME_BASE, FRONT_BASE], canBuild: planes, costOf: () => 100 });
    train(20);
    train(21);
    assert.deepEqual(ordered(), [], "two turns: not lasting yet");
    const out = train(22);
    assert.deepEqual(ordered(), [["UNIT_DIVEBOMBER", 1]], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_GROUND_ATTACKER"));
    // One already: no second.
    world.units = [HOME_BASE, FRONT_BASE, { id: 5, type: "UNIT_TRENCH_FIGHTER", x: 16, y: 5, onMap: false, army: 7 }];
    train(23);
    assert.deepEqual(ordered(), []);
    // No Airfield with a free slot in reach (Front's full, none at Home): none, and UI.log says why.
    reset({ units: [FRONT_BASE, { id: 6, type: "UNIT_BOMBER", x: 16, y: 5, onMap: false, army: 7 }], canBuild: planes, costOf: () => 100, armies: { ...ARMIES, "0:7": { x: 16, y: 5, capacity: 1 } } });
    train(20);
    train(21);
    const { lines: said } = lines(() => train(22));
    assert.deepEqual(ordered(), []);
    assert.ok(said.some((l) => l.includes("air: no ground attacker for Front")), JSON.stringify(said));
});

test("fighters first: while enemy aircraft over us want a fighter, no ground attacker is trained", () => {
    const threats = [{ settlement: { ...FRONT, name: "Front" }, count: 2, land: 2, owners: [] }];
    const planes = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_FIGHTER", "UNIT_DIVEBOMBER"].includes(type) } : undefined);
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE], canBuild: planes, costOf: () => 100, enemies: [{ x: 20, y: 5, owner: 1, type: "UNIT_BOMBER" }] });
    let out = [];
    for (const turn of [20, 21, 22]) {
        Game.turn = turn;
        steps.assessWar([]);
        out = steps.fillProduction(new Map(), { defend: true, threats });
    }
    assert.ok(out.some((e) => e.key === "QUEUED_INTERCEPTOR"), JSON.stringify(out));
    assert.ok(!out.some((e) => e.key === "QUEUED_GROUND_ATTACKER"));
});

test("our aircraft, packed in their base, strike: a raider next to a damaged centre first, a settlement's attacker before a damaged bystander, out of enemy fighter cover first", async () => {
    const bomber = { id: 1, type: "UNIT_DIVEBOMBER", x: 16, y: 5, onMap: false, army: 7 };
    const strike = async (enemies, extra = {}) => {
        reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, bomber], enemies, ...extra });
        world.unitCanStart = (_id, op) => (op === "UNITOPERATION_AIR_ATTACK" ? { Success: false, Plots: enemies.filter((e) => e.type !== "UNIT_FIGHTER").map((e) => idx(e.x, e.y)) } : undefined);
        await units.strikeRaiders();
        return fake.sent.filter((s) => s.op === "UNITOPERATION_AIR_ATTACK").map((s) => [s.args.X, s.args.Y]);
    };
    // An attacker of Front (2 tiles) before a damaged bystander (4 tiles).
    const bystander = { x: 19, y: 5, owner: 1, type: "UNIT_INFANTRY_COMPANY", damage: 80 };
    const attacker = { x: 17, y: 5, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    assert.deepEqual(await strike([bystander, attacker]), [[17, 5]]);
    // A raider next to Home's damaged centre before Front's attacker, though that one is hurt (a likelier kill).
    const capture = { x: 6, y: 6, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    assert.deepEqual(await strike([{ ...attacker, damage: 30 }, capture], { districtHealth: (x, y) => (x === HOME.x && y === HOME.y ? 50 : 100) }), [[6, 6]]);
    // Two attackers of Front alike; an enemy fighter based 4 tiles from one covers it: the other.
    const other = { x: 15, y: 7, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    const cover = { x: 21, y: 5, owner: 1, type: "UNIT_FIGHTER" };
    assert.deepEqual(await strike([attacker, other, cover]), [[15, 7]]);
});
