// Game 60's hunts (research/game60's war review, W3, W5, W7, W9, W10, M1): 3 raider hunts in Antiquity and no village hunt or
// skirmish, while one general sat posted at threatened settlements; the hunted Archer was killed outside the general's radius.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 8, y: 16 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 5, isIndependent: true, name: "Hittites" }, { id: 6, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 }],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const HOSTILE = IndependentRelationship.HOSTILE;
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const keys = (r) => r.entries.map((e) => e.key);
const army = () => [
    { id: 1, type: "UNIT_WARRIOR", ...LONDON }, // the garrison stays
    { id: 2, type: "UNIT_SPEARMAN", x: 9, y: 9 },
    { id: 3, type: "UNIT_SPEARMAN", x: 7, y: 9 },
    { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON },
];
const reset = (extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    for (const k of ["enemies", "unitCommandResult", "armies", "villages", "unitCanStart", "combat", "districtHealth", "befriend", "influence", "playerYields", "rangeTargets"]) delete world[k];
    world.cities = [{ owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 }];
    world.units = army();
    Game.turn = 20;
    Object.assign(world, { villages: [{ owner: 5, x: 28, y: 22 }], wars: [1, 5, 6], indepRelation: { 5: HOSTILE, 6: HOSTILE } }, extra);
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, huntRaiders: true, threats: units.threatenedSettlements(), fronts: [], exposed: [], ...options });
const logged = async (fn) => {
    const saved = [console.warn, console.info];
    const out = [];
    console.warn = (...a) => out.push(a.join(" "));
    console.info = (...a) => out.push(a.join(" "));
    try {
        await fn();
    } finally {
        [console.warn, console.info] = saved;
    }
    return out;
};

// M1: 44 of game 60's 73 `raiders: none` lines were «no free general within 3 turns»; in 20 of them the raider stood within 4
// of the general's post, the very settlement it threatened (A76-A79: Вьядхапура's Spearmen next to Тула, the post).
test("M1: the general posted at the settlement a raider threatens hunts it; tied to it: FAR beyond 4 tiles of it", async () => {
    reset({ enemies: [{ id: 700, x: 8, y: 10, owner: 5, type: "UNIT_WARRIOR" }] });
    // London's guard on its centre; two Spearmen free 3 tiles out, 2 from the raider.
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 10, y: 11 }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 11 }, { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON }];
    assert.ok([2, 3].every((id) => dist(world.units.find((u) => u.id === id), LONDON) > 2));
    // The first pass posts the general at London (threatened: a raider 2 tiles out).
    run({ huntRaiders: false });
    assert.ok(units.threatenedSettlements().length === 1);
    fake.sent.length = 0;
    let r = null;
    const out = await logged(() => {
        r = run();
    });
    assert.ok(keys(r).includes("RAIDER_HUNT_STARTED"), JSON.stringify(out));
    assert.equal(units.fieldOpState()?.tie, "8,8");
    assert.ok(out.some((l) => /raiders: Hittites at 8,10 .*hunted by the general posted at London/.test(l)), JSON.stringify(out));
    // It leads the hunt 5 tiles from London: no longer London's fight.
    world.enemies = [{ id: 700, x: 8, y: 13, owner: 5, type: "UNIT_WARRIOR" }];
    r = run();
    assert.equal(r.entries.find((e) => e.key === "RAIDER_HUNT_ENDED")?.args[1], "LOC_XPL_AP_RAIDER_WHY_FAR", JSON.stringify(r.entries));
});

test("M1: a tied hunt's general gets its post back when the hunt ends (not the nearest settlement it stands by)", async () => {
    // A bastion (Steadfast: no peace post of a vanguard's) posted at London hunts London's raider; it ends 2 tiles from York.
    reset({ enemies: [{ id: 705, x: 8, y: 10, owner: 5, type: "UNIT_WARRIOR" }] });
    world.cities.push({ owner: 0, ...YORK, name: "York", pop: 4, prod: 5 });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 4, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_SPEARMAN", x: 10, y: 11 }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 11 },
        { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON, promotions: { can: false, has: ["PROMOTION_ARMY_STEADFAST"], earnable: [] } },
    ];
    // The land commander's promotion tables (the fixtures carry none): Steadfast makes it the bastion.
    const saved = ["UnitPromotionClassSets", "UnitPromotionDisciplineDetails"].map((k) => [k, GameInfo[k]]);
    GameInfo.UnitPromotionClassSets = [{ PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION" }];
    GameInfo.UnitPromotionDisciplineDetails = [{ UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION", UnitPromotionType: "PROMOTION_ARMY_STEADFAST" }];
    try {
        run({ huntRaiders: false });
        fake.sent.length = 0;
        await logged(() => run());
        assert.equal(units.fieldOpState()?.tie, "8,8", JSON.stringify(units.fieldOpState()));
        // The raider is gone (DONE); the general followed it south.
        world.enemies = [];
        Object.assign(world.units.find((u) => u.id === 9), { x: 8, y: 14 });
        assert.ok(dist({ x: 8, y: 14 }, YORK) < dist({ x: 8, y: 14 }, LONDON));
        Game.turn += 1;
        fake.sent.length = 0;
        const r = await logged(() => run());
        assert.equal(units.fieldOpState(), null, JSON.stringify(r));
        assert.ok(r.some((l) => /generals: BASTION/.test(l)), JSON.stringify(r.filter((l) => l.includes("generals:"))));
        const back = fake.sent.filter((s) => s.id?.id === 9 && s.op === UnitOperationTypes.MOVE_TO).map((s) => [s.args.X, s.args.Y]);
        assert.deepEqual(back, [[LONDON.x, LONDON.y]], JSON.stringify(fake.sent.filter((s) => s.id?.id === 9)));
    } finally {
        for (const [k, v] of saved) GameInfo[k] = v;
    }
});

test("W6: a raider hunt of an independent's soldier takes the general below level 2, though the veteran is nearer", () => {
    const veteran = { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON, xp: { level: 3, points: 11, next: 60 } };
    const fresh = { id: 8, type: "UNIT_ARMY_COMMANDER", x: 7, y: 8, xp: { level: 0, points: 0, next: 15 } };
    reset({ enemies: [{ id: 760, x: 8, y: 13, owner: 5, type: "UNIT_WARRIOR" }] });
    world.units = [...army().filter((u) => u.id !== 9), veteran, fresh];
    run();
    assert.equal(units.fieldOpState()?.commander, "0:8", JSON.stringify(units.fieldOpState()));
    // A major's soldier: the vanguard (the veteran: the most XP), full XP at any level.
    reset({ enemies: [{ id: 761, x: 8, y: 13, owner: 1, type: "UNIT_WARRIOR" }] });
    world.units = [...army().filter((u) => u.id !== 9), veteran, fresh];
    run();
    assert.equal(units.fieldOpState()?.commander, "0:9", JSON.stringify(units.fieldOpState()));
});

test("M1: not a general posted where another owner's raid is (a ship of the Nubians at London, the Hittites' raider at York)", () => {
    reset({ enemies: [{ id: 701, x: 9, y: 10, owner: 6, type: "UNIT_GALLEY" }, { id: 702, x: 8, y: 14, owner: 5, type: "UNIT_WARRIOR" }] });
    world.cities.push({ owner: 0, ...YORK, name: "York", pop: 4, prod: 5 });
    world.units.push({ id: 4, type: "UNIT_WARRIOR", ...YORK });
    run({ huntRaiders: false });
    fake.sent.length = 0;
    const r = run();
    assert.ok(!keys(r).includes("RAIDER_HUNT_STARTED"), JSON.stringify(r.entries));
});

// W3: A82-A91, 11 lines «hunt: none: Шэнле: a settlement of ours needs its soldiers»: Самара, walled at 171/200, was hit by
// Шэнле's own raiders, with «melee 1 + 2 coming of 3»; startHunt passed no owner to leave out.
test("W3: a village's own raids, and a centre it hit that keeps half its health, do not keep its hunt home; a centre below half does", async () => {
    // Bath, a town 2 tiles from the Hittites' raider, beyond our soldiers' reach (no guard can be sent this pass: its lack
    // stays); their village 6 tiles from it, our army by London.
    const BATH = { x: 16, y: 8 };
    const VILLAGE = { x: 22, y: 8 };
    const soldiers = [2, 3, 4, 5, 6].map((id, i) => ({ id, type: "UNIT_WARRIOR", x: 9 + (i % 3), y: 9 + Math.floor(i / 3) }));
    const setup = (health) => {
        reset({
            villages: [{ owner: 5, ...VILLAGE }], enemies: [{ id: 703, x: 16, y: 10, owner: 5, type: "UNIT_WARRIOR" }],
            befriend: { 5: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } },
            unreachable: (x, y) => dist({ x, y }, BATH) <= 2,
        });
        if (health !== null) world.districtHealth = (x, y) => (x === BATH.x && y === BATH.y ? health : 100);
        world.cities.push({ owner: 0, ...BATH, name: "Bath", pop: 3, prod: 3 });
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, ...soldiers.map((u) => ({ ...u })), { id: 9, type: "UNIT_ARMY_COMMANDER", x: 10, y: 8 }];
    };
    const why = async () => (await logged(() => run({ hunt: true, huntRaiders: false }))).find((l) => l.includes("hunt: none:")) ?? "";
    try {
        setup(null);
        const quiet = await why();
        assert.equal(units.fieldOpState()?.kind, "HUNT", `its own raider: ${quiet}`);
        setup(85);
        const hit = await why();
        assert.equal(units.fieldOpState()?.kind, "HUNT", `85 of 100: ${hit}`);
        setup(40);
        const broken = await why();
        assert.match(broken, /needs its soldiers/, "40 of 100");
    } finally {
        delete world.unreachable;
    }
});

test("W3: guards on their way within the deadline count: a settlement with one there and two coming does not keep a hunt home", async () => {
    // Rome's three raiders 3 tiles from Bath; one Spearman there, two on their way (guard goals from the last pass).
    const BATH = { x: 16, y: 8 };
    reset({ enemies: [16, 17, 18].map((x, i) => ({ id: 710 + i, x, y: 11, owner: 1, type: "UNIT_WARRIOR" })), villages: [{ owner: 5, x: 22, y: 6 }],
        befriend: { 5: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } } });
    world.cities.push({ owner: 0, ...BATH, name: "Bath", pop: 3, prod: 3 });
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", ...BATH },
        { id: 3, type: "UNIT_SPEARMAN", x: 12, y: 8 }, { id: 4, type: "UNIT_SPEARMAN", x: 12, y: 9 },
        ...[5, 6, 7, 8].map((id) => ({ id, type: "UNIT_WARRIOR", x: 12 + (id % 2), y: 6 + Math.floor((id - 5) / 2) })),
        { id: 9, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8 },
    ];
    // The first pass sends the Spearmen 3 and 4 to Bath (its guards).
    run({ hunt: false, huntRaiders: false });
    const sent = fake.sent.filter((s) => [3, 4].includes(s.id?.id) && s.op === UnitOperationTypes.MOVE_TO);
    assert.equal(sent.length, 2, JSON.stringify(fake.sent));
    // Next turn they are on their way, 3 tiles out.
    Game.turn += 1;
    Object.assign(world.units.find((u) => u.id === 3), { x: 13, y: 8, activity: UnitActivityTypes.OPERATION, dest: BATH });
    Object.assign(world.units.find((u) => u.id === 4), { x: 13, y: 9, activity: UnitActivityTypes.OPERATION, dest: BATH });
    fake.sent.length = 0;
    const out = await logged(() => run({ hunt: true, huntRaiders: false }));
    const why = out.find((l) => l.includes("hunt: none:")) ?? "";
    assert.ok(why || units.fieldOpState()?.kind === "HUNT", `the village is a target: ${JSON.stringify(out)}`);
    assert.doesNotMatch(why, /needs its soldiers/, `${why} | ${out.filter((l) => l.includes("defence:")).join(" | ")}`);
});

// W5: A109-A111, the strike step's STRUCK and a SORTIE killed the hunted Archer 3 tiles from the general: no XP.
test("W5: a raider hunt's target is left to its coming general: no strike or sortie from outside its radius, unless the turns passed or a siege", async () => {
    const raider = { id: 720, x: 8, y: 12, owner: 5, type: "UNIT_WARRIOR" };
    reset({ enemies: [raider], combat: () => ({ dealt: 60, taken: 10 }) });
    run();
    assert.equal(units.fieldOpState()?.kind, "RAIDERS");
    const strikes = () => fake.sent.filter((s) => s.op === UnitOperationTypes.MOVE_TO && s.args?.Modifiers & UnitOperationMoveModifiers.ATTACK && s.args.X === raider.x && s.args.Y === raider.y);
    // A member next to it, another 2 tiles out (a sortie), the general still at London (4 tiles).
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 8, y: 11 }, { id: 3, type: "UNIT_SPEARMAN", x: 9, y: 10 }, { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON }];
    fake.sent.length = 0;
    const out = await logged(async () => {
        const r = await units.strikeRaiders();
        assert.deepEqual(r.entries.filter((e) => e.key === "STRUCK" || e.key === "SORTIE"), [], JSON.stringify(r.entries));
        assert.deepEqual(await units.fieldAssault(), []);
    });
    assert.equal(strikes().length, 0);
    assert.ok(out.some((l) => /raiders: Hittites at 8,12 waits for its general \(4 tiles\)/.test(l)), JSON.stringify(out));
    // The general beside the member: its fight is the general's XP.
    Object.assign(world.units.find((u) => u.id === 9), { x: 8, y: 10 });
    assert.equal(dist({ x: 8, y: 10 }, { x: 8, y: 11 }), 1);
    fake.sent.length = 0;
    let r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "STRUCK" || e.key === "COORDINATED_ATTACK"), JSON.stringify(r.entries));
    // The general far again, but its 3 turns are over: struck all the same.
    world.units.find((u) => u.id === 9).y = 8;
    world.units.find((u) => u.id === 9).x = 8;
    Game.turn += 3;
    fake.sent.length = 0;
    r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "STRUCK"), JSON.stringify(r.entries));
    // A raider next to our centre (a siege) is struck at once.
    reset({ enemies: [{ ...raider, x: 8, y: 9 }], combat: () => ({ dealt: 60, taken: 10 }) });
    run();
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 9, y: 9 }, { id: 9, type: "UNIT_ARMY_COMMANDER", x: 12, y: 8 }];
    fake.sent.length = 0;
    r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "STRUCK"), JSON.stringify(r.entries));
});

// The review of W5: the hold covered the strike step's soldiers only; the unit step's idle ranged soldiers (defend) and the
// strike step's ships (and planes: autopilot-hunts-hold-air.test.mjs) still shot the hunted raider from outside the radius.
test("W5: an idle ranged soldier in the unit step, and a warship in the strike step, leave the hunted raider to its coming general too", async () => {
    const raider = { id: 720, x: 8, y: 12, owner: 5, type: "UNIT_WARRIOR" };
    reset({ enemies: [raider], combat: () => ({ dealt: 60, taken: 10 }) });
    run();
    assert.equal(units.fieldOpState()?.kind, "RAIDERS");
    // An idle Slinger 2 tiles from the raider and a Galley next to it, out of the general's radius (still at London, 4 off).
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 9, y: 9 }, { id: 3, type: "UNIT_SPEARMAN", x: 7, y: 9 },
        { id: 4, type: "UNIT_SLINGER", x: 8, y: 10 }, { id: 5, type: "UNIT_GALLEY", x: 9, y: 12 }, { id: 9, type: "UNIT_ARMY_COMMANDER", ...LONDON }];
    const idx = GameplayMap.getIndexFromXY(raider.x, raider.y);
    world.rangeTargets = (id) => (id.id === 4 ? [{ x: raider.x, y: raider.y }] : []);
    world.unitCanStart = (id, op) => (id.id === 5 && op === "UNITOPERATION_NAVAL_ATTACK" ? { Success: false, Plots: [idx] } : undefined);
    const at12 = (s) => s.args?.X === raider.x && s.args?.Y === raider.y;
    const shots = () => fake.sent.filter((s) => s.id?.id === 4 && s.op === UnitOperationTypes.RANGE_ATTACK && at12(s));
    const naval = () => fake.sent.filter((s) => s.id?.id === 5 && s.op === "UNITOPERATION_NAVAL_ATTACK" && at12(s));
    fake.sent.length = 0;
    await logged(() => units.strikeRaiders());
    assert.equal(shots().length, 0, "strike step: the Slinger");
    assert.equal(naval().length, 0, "strike step: the Galley");
    await logged(() => run());
    assert.equal(units.fieldOpState()?.kind, "RAIDERS", "the hunt goes on");
    assert.equal(shots().length, 0, JSON.stringify(fake.sent.filter((s) => s.id?.id === 4)));
    // Its 3 turns over: both strike.
    Game.turn += 3;
    fake.sent.length = 0;
    await logged(() => units.strikeRaiders());
    assert.equal(naval().length, 1, JSON.stringify(fake.sent.filter((s) => s.id?.id === 5)));
    fake.sent.length = 0;
    world.units = world.units.filter((u) => u.id !== 5);
    await logged(() => run());
    assert.equal(shots().length, 1, JSON.stringify(fake.sent.filter((s) => s.id?.id === 4)));
});

// W7: A70-A74, the hunted Archer died at T71, the next Archer 2 tiles away kept the count at 1, and the hunt ended STALL.
test("W7: the death of an opponent of our fights in a hunt is its kill, though another of theirs comes near", () => {
    reset({ enemies: [{ id: 730, x: 8, y: 12, owner: 5, type: "UNIT_WARRIOR" }] });
    run();
    const op = units.fieldOpState();
    assert.equal(op?.enemyCount, 1);
    // Our Spearman fights it (the Combat event), and it dies; another of theirs steps in 1 tile away.
    engine.trigger("Combat", { attacker: Players.get(0).Units.getUnits().find((u) => u.id.id === 2).id, defender: { owner: 5, id: 730, type: 1 } });
    world.enemies = [{ id: 731, x: 9, y: 12, owner: 5, type: "UNIT_ARCHER" }];
    Game.turn += 1;
    run();
    assert.equal(units.fieldOpState()?.kills, 1, JSON.stringify(units.fieldOpState()));
    assert.equal(units.fieldOpState()?.progressTurn, Game.turn);
});

test("W7: a shot at a district of theirs is no kill, nor an opponent fought two turns ago that has walked out of sight", () => {
    const spearman = () => Players.get(0).Units.getUnits().find((u) => u.id.id === 2).id;
    reset({ enemies: [{ id: 732, x: 8, y: 12, owner: 5, type: "UNIT_WARRIOR" }] });
    run();
    assert.equal(units.fieldOpState()?.kind, "RAIDERS");
    // A district of the Hittites (Districts.get answers it): remembered, its id would read as a dead unit.
    engine.trigger("Combat", { attacker: spearman(), defender: { owner: 5, id: 90000 + 9 * 100 + 12, type: 4 } });
    Game.turn += 1;
    run();
    assert.equal(units.fieldOpState()?.kills, 0, JSON.stringify(units.fieldOpState()));
    // The raider fought this turn and alive two turns later; then (the end-of-turn pass) out of sight, another of theirs near:
    // not a kill.
    engine.trigger("Combat", { attacker: spearman(), defender: { owner: 5, id: 732, type: 1 } });
    Game.turn += 2;
    run();
    world.enemies = [{ id: 733, x: 9, y: 12, owner: 5, type: "UNIT_ARCHER" }];
    run();
    assert.equal(units.fieldOpState()?.kind, "RAIDERS", "the hunt goes on");
    assert.equal(units.fieldOpState().kills, 0, JSON.stringify(units.fieldOpState()));
});

// W10: T109, a Warrior whose moves FIELD_ADVANCE had spent sent three attack-moves; FIELD_STRUCK was logged, no fight came.
test("W10: no FIELD_STRUCK for a member with no move left, nor for a strike the game did not carry out", async () => {
    reset({ enemies: [{ id: 740, x: 8, y: 12, owner: 5, type: "UNIT_WARRIOR" }], combat: () => ({ dealt: 60, taken: 10 }) });
    run();
    // The general beside them (nothing held), the member next to the raider with no move left.
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_SPEARMAN", x: 8, y: 11, moves: 0 }, { id: 9, type: "UNIT_ARMY_COMMANDER", x: 7, y: 11 }];
    fake.sent.length = 0;
    let entries = await units.fieldAssault();
    assert.deepEqual(entries.filter((e) => e.key === "FIELD_STRUCK"), []);
    assert.equal(fake.sent.filter((s) => s.op === UnitOperationTypes.MOVE_TO).length, 0, "not sent");
    // With its moves, but the game fires no Combat for it.
    world.units[1].moves = 2;
    const trigger = engine.trigger;
    engine.trigger = (name, d) => (name === "Combat" ? undefined : trigger(name, d));
    let out;
    try {
        out = await logged(async () => {
            entries = await units.fieldAssault();
        });
    } finally {
        engine.trigger = trigger;
    }
    assert.deepEqual(entries.filter((e) => e.key === "FIELD_STRUCK"), []);
    assert.ok(out.some((l) => /field: UNIT_SPEARMAN strike on 8,12 not carried out/.test(l)), JSON.stringify(out));
    // Carried out: logged.
    entries = await units.fieldAssault();
    assert.deepEqual(entries.map((e) => e.key), ["FIELD_STRUCK"]);
});

// W9: Шэнле, the one hostile village near us, stood 5 tiles from Самара and Нижний Новгород; skirmishStep never ran (REACH 4)
// and wrote nothing.
test("W9: a hostile village 5 tiles from our settlement is skirmished with; with none in reach UI.log says why every 10 turns", async () => {
    reset({ villages: [{ owner: 5, x: 8, y: 13 }], enemies: [{ id: 750, x: 8, y: 12, owner: 5, type: "UNIT_WARRIOR" }] });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 4, type: "UNIT_ARCHER", x: 9, y: 9 }];
    let out = await logged(() => run({ hunt: true, huntRaiders: true, befriend: false }));
    assert.ok(out.some((l) => /^\[XPL\].*skirmish: Hittites at 8,13/.test(l) || /skirmish: Hittites at 8,13/.test(l)), JSON.stringify(out.filter((l) => /skirmish|hunt|raiders/.test(l))));
    // 7 tiles away: none, said once in 10 turns.
    reset({ villages: [{ owner: 5, x: 8, y: 15 }], enemies: [{ id: 751, x: 8, y: 14, owner: 5, type: "UNIT_WARRIOR" }] });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 4, type: "UNIT_ARCHER", x: 9, y: 9 }];
    out = await logged(() => run({ hunt: true }));
    assert.ok(out.some((l) => /skirmish: none: nearest Hittites at 7 tiles \(reach 5\)/.test(l)), JSON.stringify(out.filter((l) => /skirmish/.test(l))));
    Game.turn += 1;
    out = await logged(() => run({ hunt: true }));
    assert.equal(out.filter((l) => l.includes("skirmish: none")).length, 0);
    Game.turn += 9;
    out = await logged(() => run({ hunt: true }));
    assert.equal(out.filter((l) => l.includes("skirmish: none")).length, 1);
});
