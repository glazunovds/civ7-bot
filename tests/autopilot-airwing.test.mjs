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

test("a ground attacker at a lasting front: trained where an Airfield with a free slot reaches it, the strongest against units; not before the third turn; two at most (research/42 C1)", () => {
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
    assert.deepEqual(ordered().sort(), [["UNIT_DIVEBOMBER", 0], ["UNIT_DIVEBOMBER", 1]], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_GROUND_ATTACKER"));
    // One already: a second (an Aerodrome holds 4; game 53's held one plane); two: no third.
    world.units = [HOME_BASE, FRONT_BASE, { id: 5, type: "UNIT_TRENCH_FIGHTER", x: 16, y: 5, onMap: false, army: 7 }];
    train(23);
    assert.deepEqual(ordered().map((o) => o[0]), ["UNIT_DIVEBOMBER"]);
    world.units.push({ id: 6, type: "UNIT_DIVEBOMBER", x: 16, y: 5, onMap: false, army: 7 });
    train(24);
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

// ---- research/42 C-E (game 53: one Dive Bomber in an Aerodrome that holds 4, no fighter against 11 Bomber raids out of the
// only base's reach, no nuclear weapon while every AI made 2-15, and the satellite 77 turns after the game was decided) ----

const { gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const hash = (t) => Database.makeHash(t);
const builds = () => fake.sent.filter((s) => s.kind === "operation");

test("bombers in a war at our door, where an air base has room and the gold income covers them; one to carry a nuclear weapon held", () => {
    const planes = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_BOMBER"].includes(type) } : undefined);
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE], canBuild: planes, costOf: () => 100, goldIncome: 30 });
    steps.assessWar([]);
    let out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.equal(out.filter((e) => e.key === "QUEUED_BOMBER").length, 2, JSON.stringify(out));
    // Their upkeep: not while the income cannot carry one more.
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE], canBuild: planes, costOf: () => 100, goldIncome: 10 });
    steps.assessWar([]);
    out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.ok(!out.some((e) => e.key === "QUEUED_BOMBER"), JSON.stringify(out));
    // At peace: none; with «Ядерное оружие» and a weapon held: one.
    try {
        settings.remember(gameKey(), { wmd: "1|0" });
        reset({ units: [HOME_BASE, FRONT_BASE], canBuild: planes, costOf: () => 100, goldIncome: 30 });
        steps.assessWar([]);
        assert.ok(!steps.fillProduction(new Map(), { defend: true, threats: [] }).some((e) => e.key === "QUEUED_BOMBER"));
        out = steps.fillProduction(new Map(), { defend: true, threats: [], nuclear: true });
        assert.equal(out.filter((e) => e.key === "QUEUED_BOMBER").length, 1, JSON.stringify(out));
    } finally {
        settings.remember(gameKey(), { wmd: null });
        world.goldIncome = 10;
    }
});

test("an Airfield where enemy aircraft raid a settlement no air base covers, in the nearest city that covers it; none when one does", () => {
    const airfield = (type) => (type === "BUILDING_AIRFIELD" ? { Success: true, Plots: [idx(15, 6)] } : undefined);
    reset({ wars: [1], units: [HOME_BASE, WARRIOR], canBuild: airfield, costOf: () => 100 });
    raid();
    const out = steps.airfieldForRaids();
    assert.deepEqual(out.map((e) => [e.key, e.args[0]]), [["QUEUED_AIRFIELD", "Front"]]);
    const b = builds().find((s) => s.args.ConstructibleType === hash("BUILDING_AIRFIELD"));
    assert.deepEqual([b?.id.id, b?.args.X, b?.args.Y], [1, 15, 6], JSON.stringify(builds()));
    // Front's own base covers it: nothing.
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, WARRIOR], canBuild: airfield, costOf: () => 100 });
    raid();
    assert.deepEqual(steps.airfieldForRaids(), []);
});

// Game 54's review of the game's text: Ground Attack orders "eligible Attack Air Units", Carpet Bomb "Bomber Units", Fighter
// Sweep "all Fighter Units"; research/42 sent Ground Attack for bombers.
test("an air commander strikes with every plane of the class its command orders: bombers Carpet Bomb, attackers Ground Attack; a lone plane asks the preview first", async () => {
    const enemy = { x: 17, y: 5, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    const plane = (id, type) => ({ id, type, x: 16, y: 5, onMap: false, army: 7 });
    const bombers = [plane(1, "UNIT_BOMBER"), plane(2, "UNIT_BOMBER")];
    const offered = [idx(enemy.x, enemy.y)];
    const focus = (_id, op) => (/^UNITCOMMAND_FOCUSED_ATTACK_AIR_/.test(op) ? { Success: false, Plots: offered } : undefined);
    const airAttack = (_id, op) => (op === "UNITOPERATION_AIR_ATTACK" ? { Success: false, Plots: offered } : undefined);
    const commands = () => fake.sent.filter((s) => /^UNITCOMMAND_FOCUSED_ATTACK_AIR_/.test(s.op)).map((s) => s.op);
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, ...bombers], enemies: [enemy], unitCommandResult: focus, unitCanStart: airAttack });
    let r = await units.strikeRaiders();
    assert.deepEqual(r.entries.map((e) => [e.key, e.args[4]]), [["AIR_CARPET_BOMB", 2]], JSON.stringify(fake.sent));
    assert.deepEqual(commands(), ["UNITCOMMAND_FOCUSED_ATTACK_AIR_BOMB"]);
    assert.equal(fake.sent.filter((s) => s.op === "UNITOPERATION_AIR_ATTACK").length, 0, "the planes struck in it");
    // Two ground attackers: Ground Attack. A fighter based there does not hold it back (Fighter Sweep is its own command).
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, plane(4, "UNIT_DIVEBOMBER"), plane(5, "UNIT_DIVEBOMBER"), plane(3, "UNIT_FIGHTER")], enemies: [enemy], unitCommandResult: focus, unitCanStart: airAttack });
    r = await units.strikeRaiders();
    assert.deepEqual(commands(), ["UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_LAND"], JSON.stringify(r.entries));
    // One bomber and one ground attacker: neither command has two of its class; they strike one by one.
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, plane(1, "UNIT_BOMBER"), plane(4, "UNIT_DIVEBOMBER")], enemies: [enemy], unitCommandResult: focus, unitCanStart: airAttack });
    r = await units.strikeRaiders();
    assert.deepEqual(commands(), [], JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "AIR_STRIKE"));
    // An enemy fighter covers the target and two of ours are based there: they sweep it first, the bombing waits.
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, ...bombers, plane(3, "UNIT_FIGHTER"), plane(6, "UNIT_FIGHTER")], enemies: [enemy, { x: 19, y: 5, owner: 1, type: "UNIT_FIGHTER" }], unitCommandResult: focus, unitCanStart: airAttack });
    r = await units.strikeRaiders();
    assert.deepEqual(commands(), ["UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR"], JSON.stringify(r.entries));
    assert.deepEqual(r.entries.filter((e) => e.key === "AIR_SWEEP").map((e) => e.args[3]), [2]);
    // One bomber: a strike the preview says loses is not sent; a good one is.
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, bombers[0]], enemies: [enemy], unitCanStart: airAttack, combat: () => ({ dealt: 10, taken: 70 }) });
    r = await units.strikeRaiders();
    assert.ok(!r.entries.some((e) => e.key === "AIR_STRIKE"), JSON.stringify(r.entries));
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE, bombers[0]], enemies: [enemy], unitCanStart: airAttack, combat: () => ({ dealt: 60, taken: 10 }) });
    r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "AIR_STRIKE"), JSON.stringify(r.entries));
    delete world.combat;
    delete world.unitCommandResult;
});

test("«Ядерное оружие» in a war with a major: Nuclear Fission first; not without the option", () => {
    reset({ wars: [1], research: { tech: { available: [hash("NODE_TECH_MO_NUCLEAR_FISSION")] } } });
    steps.assessWar([]);
    const on = steps.chooseResearch("tech", { autopilot: { nuclear: true, defend: true } }, null);
    assert.deepEqual([on?.key], ["TECH_FOR_NUCLEAR"], JSON.stringify(on));
    fake.sent.length = 0;
    const off = steps.chooseResearch("tech", { autopilot: {} }, null);
    assert.notEqual(off?.key, "TECH_FOR_NUCLEAR");
    delete world.research;
});

test("«Ядерное оружие»: the Manhattan Project where it is done soonest; with it standing and the war at our door, weapons up to 2", () => {
    const s = { autopilot: { nuclear: true, defend: true } };
    const can = (type) => (type === "WONDER_MANHATTAN_PROJECT" ? { Success: true, Plots: [idx(5, 6)] } : type === "PROJECT_PRODUCE_WMD" ? { Success: true } : undefined);
    try {
        settings.remember(gameKey(), { wmd: null });
        reset({ wars: [1], units: [HOME_BASE], canBuild: can, costOf: () => 200 });
        steps.assessWar([]);
        let out = steps.nuclearWork(s);
        assert.deepEqual(out.map((e) => e.key), ["NUCLEAR_PROJECT"], JSON.stringify(out));
        assert.ok(builds().some((b) => b.args.ConstructibleType === hash("WONDER_MANHATTAN_PROJECT") && b.args.X === 5 && b.args.Y === 6), JSON.stringify(builds()));
        // Off: nothing.
        fake.sent.length = 0;
        assert.deepEqual(steps.nuclearWork({ autopilot: {} }), []);
        // Standing at Home: a weapon queued in the city that has it soonest.
        reset({ wars: [1], units: [HOME_BASE], canBuild: can, costOf: () => 200, structures: (x, y) => ({ district: null, constructibles: x === HOME.x && y === HOME.y ? ["WONDER_MANHATTAN_PROJECT"] : [] }) });
        steps.assessWar([]);
        out = steps.nuclearWork(s);
        assert.deepEqual(out.map((e) => e.key), ["NUCLEAR_WEAPON_QUEUED"], JSON.stringify(out));
        assert.ok(builds().some((b) => b.id.id === 0 && b.args.ProjectType === hash("PROJECT_PRODUCE_WMD")));
        // Two held: no more.
        settings.remember(gameKey(), { wmd: "2|0" });
        fake.sent.length = 0;
        assert.deepEqual(steps.nuclearWork(s), []);
    } finally {
        settings.remember(gameKey(), { wmd: null });
    }
});

test("a nuclear strike on an enemy army of 3+ near us, never touching ours, a settlement or too few; the stock counted", async () => {
    const strike = (_id, op, args) => (op === "UNITOPERATION_WMD_STRIKE" && args?.Type === hash("WMD_NUCLEAR_DEVICE") ? { Success: true, Plots: [idx(19, 5), idx(23, 5)] } : undefined);
    const army = [{ x: 19, y: 5, owner: 1, type: "UNIT_INFANTRY_COMPANY" }, { x: 20, y: 5, owner: 1, type: "UNIT_TANK" }, { x: 18, y: 5, owner: 1, type: "UNIT_INFANTRY_COMPANY" }];
    try {
        settings.remember(gameKey(), { wmd: "1|0" });
        reset({ wars: [1], units: [FRONT_BASE, WARRIOR, { id: 5, type: "UNIT_BOMBER", x: 16, y: 5, onMap: false, army: 7 }], enemies: army, unitCanStart: strike });
        const out = await units.nuclearStrike();
        const sent = fake.sent.find((s) => s.op === "UNITOPERATION_WMD_STRIKE");
        assert.deepEqual([sent?.id.id, sent?.args.X, sent?.args.Y, sent?.args.Type], [70, 19, 5, hash("WMD_NUCLEAR_DEVICE")], JSON.stringify(fake.sent));
        assert.deepEqual(out.map((e) => [e.key, e.args[3]]), [["NUKE_STRUCK", 3]]);
        assert.equal(units.nuclearArsenal(), 0, "the weapon is spent");
        // Our soldier in the blast; only two of theirs; their army around Moscow's centre: no strike.
        for (const [list, enemies, why] of [
            [[FRONT_BASE, { id: 6, type: "UNIT_INFANTRY_COMPANY", x: 19, y: 6 }], army, "ours in the blast"],
            [[FRONT_BASE], army.slice(0, 2), "too few"],
            [[FRONT_BASE], army.map((e) => ({ ...e, x: e.x + 4 })), "Moscow in the blast"],
        ]) {
            settings.remember(gameKey(), { wmd: "1|0" });
            reset({ wars: [1], units: list, enemies, unitCanStart: strike });
            Game.turn += 1;
            await units.nuclearStrike();
            assert.equal(fake.sent.filter((s) => s.op === "UNITOPERATION_WMD_STRIKE").length, 0, why);
        }
    } finally {
        settings.remember(gameKey(), { wmd: null });
    }
});

test("the satellite after the game is decided: a Launch Pad in our best producer when none can launch it; not without being asked", () => {
    const can = (type) => (type === "PROJECT_LAUNCH_SATELLITE" ? { Success: false } : type === "BUILDING_LAUNCH_PAD" ? { Success: true, Plots: [idx(5, 6)] } : undefined);
    reset({ canBuild: can, costOf: () => 100 });
    assert.deepEqual(steps.launchSatellite(), []);
    const out = steps.launchSatellite({ buildPad: true });
    assert.deepEqual(out.map((e) => [e.key, e.args[0]]), [["SATELLITE_PAD_QUEUED", "Home"]]);
    assert.ok(builds().some((b) => b.id.id === 0 && b.args.ConstructibleType === hash("BUILDING_LAUNCH_PAD")));
});

test("a full pass with «Оборона» and «Ядерное оружие» in a war: no step fails, and the Manhattan Project is ordered (the hud's wiring)", async () => {
    // Games 51-53: a step's error is logged, never thrown (the hunt's fight was called before it was defined, 832 passes).
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const can = (type) => (type === "WONDER_MANHATTAN_PROJECT" ? { Success: true, Plots: [idx(5, 6)] } : undefined);
    reset({ wars: [1], units: [HOME_BASE, WARRIOR], canBuild: can, costOf: () => 200 });
    steps.resetWonderOrders(); // an earlier test ordered it on the same tile this turn
    settings.patch({ autopilot: { defend: true, nuclear: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false, purchases: false, wonders: false } });
    try {
        await autopilot.runTurn(true);
        const log = state.get().autopilot.log ?? [];
        assert.deepEqual(log.filter((e) => e.key === "ERROR").map((e) => e.args), []);
        assert.ok(log.some((e) => e.key === "NUCLEAR_PROJECT"), JSON.stringify(log.map((e) => e.key)));
    } finally {
        settings.patch({ autopilot: { defend: false, nuclear: false, purchases: true, research: true, choices: true, befriend: true, growth: true, towns: true, wonders: true, replanEvery: 5 } });
    }
});

test("fighters against three enemy bombers in sight: three wanted (an Aerodrome holds 4; research/42 C1)", () => {
    const planes = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_FIGHTER"].includes(type) } : undefined);
    reset({ wars: [1], units: [HOME_BASE, FRONT_BASE], canBuild: planes, costOf: () => 100,
        enemies: [{ x: 20, y: 5, owner: 1, type: "UNIT_BOMBER" }, { x: 20, y: 6, owner: 1, type: "UNIT_BOMBER" }, { x: 21, y: 5, owner: 1, type: "UNIT_BOMBER" }] });
    steps.assessWar([]);
    const out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    const f = out.filter((e) => e.key === "QUEUED_INTERCEPTOR");
    assert.ok(f.length > 0 && f.every((e) => e.args[2] === 3), JSON.stringify(out));
});

// Game 54's review of the game's text: Squadron Commanders "can Establish Air Bases on flat tiles with no Urban District that are
// not owned by another player", and planes rebase to them only after that; research/42 never used them.
test("a Squadron Commander establishes its base where fighter cover is wanted that no other base gives; not again within 5 turns", () => {
    const cover = [{ x: FRONT.x, y: FRONT.y, name: "Front", why: "hit from the air lately", rank: 1 }];
    const offer = (_id, op) => (op === "UNITOPERATION_ESTABLISH_BASE" ? { Success: false, Plots: [idx(25, 12), idx(14, 6)] } : undefined);
    const squadron = { id: 90, type: "UNIT_SQUADRON_COMMANDER", x: 30, y: 12, army: 9 };
    const armies = { ...ARMIES, "0:9": { x: 30, y: 12, capacity: 4 } };
    const go = () => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [], airCover: cover });
    const established = () => fake.sent.filter((s) => s.op === "UNITOPERATION_ESTABLISH_BASE").map((s) => [s.id.id, s.args.X, s.args.Y]);
    reset({ units: [HOME_BASE, squadron], unitCanStart: offer, armies });
    const r = go();
    assert.deepEqual(established(), [[90, 14, 6]], JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "SQUADRON_BASE"));
    Game.turn += 1;
    fake.sent.length = 0;
    go();
    assert.deepEqual(established(), [], "not again within 5 turns");
    // Front's own Airfield covers it: nothing to do.
    reset({ units: [HOME_BASE, FRONT_BASE, squadron], unitCanStart: offer, armies });
    go();
    assert.deepEqual(established(), []);
});

test("cover wanted that no air base gives: a Squadron Commander is trained; with its base covering it, fighters come from any Airfield of ours", () => {
    const can = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_SQUADRON_COMMANDER", "UNIT_FIGHTER"].includes(type) } : undefined);
    reset({ wars: [1], units: [HOME_BASE, WARRIOR], canBuild: can, costOf: () => 100 });
    lines(() => raid());
    delete world.enemies;
    steps.assessWar([]);
    let out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.ok(out.some((e) => e.key === "QUEUED_SQUADRON"), JSON.stringify(out));
    assert.ok(!out.some((e) => e.key === "QUEUED_INTERCEPTOR"), "Home's Airfield does not cover Front");
    // A Squadron base covering Front with room: a fighter from Home's Airfield (it rebases there); no second squadron.
    reset({ wars: [1], units: [HOME_BASE, SQUADRON, WARRIOR], canBuild: can, costOf: () => 100 });
    lines(() => raid());
    delete world.enemies;
    steps.assessWar([]);
    out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.ok(out.some((e) => e.key === "QUEUED_INTERCEPTOR" && e.args[0] === "Home"), JSON.stringify(out));
    assert.ok(!out.some((e) => e.key === "QUEUED_SQUADRON"));
});

test("«Ядерные удары по городам»: with no army to strike, an enemy city near us; never one that was ours; not without the option", async () => {
    const kazan = { owner: 1, x: 21, y: 5, name: "Kazan", pop: 4 };
    world.cities.push(kazan);
    const strike = (_id, op, args) => (op === "UNITOPERATION_WMD_STRIKE" && args?.Type === hash("WMD_NUCLEAR_DEVICE") ? { Success: true, Plots: [idx(21, 5)] } : undefined);
    const struck = () => fake.sent.filter((s) => s.op === "UNITOPERATION_WMD_STRIKE").map((s) => [s.id.id, s.args.X, s.args.Y]);
    const bomber = { id: 5, type: "UNIT_BOMBER", x: 16, y: 5, onMap: false, army: 7 };
    try {
        settings.remember(gameKey(), { wmd: "1|0" });
        reset({ wars: [1], units: [FRONT_BASE, bomber], unitCanStart: strike });
        await units.nuclearStrike();
        assert.deepEqual(struck(), [], "the option off: armies only");
        Game.turn += 1;
        const out = await units.nuclearStrike({ cities: true });
        assert.deepEqual(struck(), [[70, 21, 5]], JSON.stringify(out));
        assert.deepEqual(out.map((e) => [e.key, e.args[1]]), [["NUKE_CITY_STRUCK", "Kazan"]]);
        // A city that was ours: never (we want it back).
        kazan.originalOwner = 0;
        settings.remember(gameKey(), { wmd: "1|0" });
        reset({ wars: [1], units: [FRONT_BASE, bomber], unitCanStart: strike });
        Game.turn += 5; // a turn with no strike yet (one a turn)
        await units.nuclearStrike({ cities: true });
        assert.deepEqual(struck(), []);
    } finally {
        world.cities.pop();
        delete kazan.originalOwner;
        settings.remember(gameKey(), { wmd: null });
    }
});

test("a full pass with «Ядерное оружие» and «Ядерные удары по городам»: an enemy city near us is struck (the hud's wiring)", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const kazan = { owner: 1, x: 21, y: 5, name: "Kazan", pop: 4 };
    world.cities.push(kazan);
    const strike = (_id, op, args) => (op === "UNITOPERATION_WMD_STRIKE" && args?.Type === hash("WMD_NUCLEAR_DEVICE") ? { Success: true, Plots: [idx(21, 5)] } : undefined);
    settings.patch({ autopilot: { defend: true, nuclear: true, nuclearCities: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false, purchases: false, production: false, wonders: false } });
    try {
        settings.remember(gameKey(), { wmd: "1|0" });
        reset({ wars: [1], units: [FRONT_BASE, { id: 5, type: "UNIT_BOMBER", x: 16, y: 5, onMap: false, army: 7 }], unitCanStart: strike });
        Game.turn += 50;
        await autopilot.runTurn(true);
        const log = state.get().autopilot.log ?? [];
        assert.ok(log.some((e) => e.key === "NUKE_CITY_STRUCK"), JSON.stringify(log.map((e) => e.key)));
    } finally {
        world.cities.pop();
        settings.remember(gameKey(), { wmd: null });
        settings.patch({ autopilot: { defend: false, nuclear: false, nuclearCities: false, production: true, purchases: true, research: true, choices: true, befriend: true, growth: true, towns: true, wonders: true, replanEvery: 5 } });
    }
});
