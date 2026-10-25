// Two generals (research/41 Phase 2; the user, 21 October: "all generals as close to the fight as possible, also escaping as
// first unit if dangerous or under attack: a valuable asset"; game 48: both commanders kept posts with one raider while Киото,
// 7 raiders, fell at A59). Posts at the worst fight, shared when none is free; the vanguard waits where raids come in peace;
// a commander in danger escapes first; units in a general's radius strike first; a second commander trained or bought.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 5 };
const SPARTA = { x: 12, y: 5 };
const CORINTH = { x: 5, y: 12 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, ...ATHENS, name: "Athens", happy: 2, prod: 10 },
        { owner: 0, ...SPARTA, name: "Sparta", happy: -3, prod: 10 },
        { owner: 0, ...CORINTH, name: "Corinth", happy: -1, prod: 10 },
        { owner: 1, x: 25, y: 15, name: "Babylon" },
    ],
    gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const orders = () => fake.sent.filter((s) => s.kind === "unit" || s.kind === "unitCommand");
const moveOf = (id) => orders().find((s) => s.id.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const at = (a) => (a ? [a.X, a.Y] : null);
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["enemies", "wars", "rangeTargets", "unitCommandResult", "unitCommandOk", "combat", "canBuy", "costOf"]) delete world[k];
    world.gold = 0;
    Object.assign(world, extra);
};
const run = (options) => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: true, merchants: false, ...options });
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
// The land commander's promotion tables (the fixtures carry none): a role comes from what a commander took.
GameInfo.UnitPromotionClassSets = [
    { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_ASSAULT" },
    { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION" },
];
GameInfo.UnitPromotionDisciplineDetails = [
    { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_ASSAULT", UnitPromotionType: "PROMOTION_ARMY_INITIATIVE" },
    { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION", UnitPromotionType: "PROMOTION_ARMY_STEADFAST" },
];
const VANGUARD = { can: false, has: ["PROMOTION_ARMY_INITIATIVE"], earnable: [] };
const BASTION = { can: false, has: ["PROMOTION_ARMY_STEADFAST"], earnable: [] };

test("game 48: a commander leaves its post with one raider for a settlement with many more; with one fight both generals go", () => {
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({ threats: [{ settlement: ATHENS, count: 1, land: 1 }] });
    assert.deepEqual(orders(), [], "at its post");
    fake.sent.length = 0;
    run({ threats: [{ settlement: ATHENS, count: 1, land: 1 }, { settlement: CORINTH, count: 7, land: 7 }] });
    assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], "Corinth's 7 raiders: worth leaving its post for");
    // One fight, two generals: both go (before, the second went to the unhappiest settlement).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", x: 6, y: 5, promotions: BASTION }]);
    run({ threats: [{ settlement: CORINTH, count: 3, land: 3 }] });
    assert.deepEqual([at(moveOf(1)), at(moveOf(2))], [[CORINTH.x, CORINTH.y], [CORINTH.x, CORINTH.y]], JSON.stringify(orders()));
    // A damaged centre first, though another has more raiders (Corinth, 4 turns off, at half its health: W4's far rule).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { districtHealth: (x, y) => (x === CORINTH.x && y === CORINTH.y ? 50 : 100) });
    try {
        run({ threats: [{ settlement: SPARTA, count: 3, land: 3 }, { settlement: CORINTH, count: 1, land: 1, damaged: true }] });
        assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], "Corinth's centre is damaged");
    } finally {
        delete world.districtHealth;
    }
});

test("in peace the vanguard waits where raids came most; the bastion goes to the unhappiest settlement", () => {
    const turn = Game.turn;
    try {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }]);
        // Corinth raided on two turns.
        for (const t of [turn, turn + 1]) {
            Game.turn = t;
            run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
        }
        Game.turn = turn + 2;
        fake.sent.length = 0;
        // Another vanguard (no post of its own on the way to Corinth).
        world.units = [{ id: 5, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }];
        run({});
        assert.deepEqual(at(moveOf(5)), [CORINTH.x, CORINTH.y], "the vanguard: Corinth, raided");
        fake.sent.length = 0;
        world.units = [{ id: 3, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: BASTION }];
        run({});
        assert.deepEqual(at(moveOf(3)), [SPARTA.x, SPARTA.y], "the bastion: Sparta, the unhappiest");
    } finally {
        Game.turn = turn;
    }
});

test("UI.log names each general's role, tile, post and XP once a turn", () => {
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", ...SPARTA, promotions: BASTION }]);
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
        run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
    } finally {
        console.warn = warn;
    }
    const g = lines.filter((l) => l.includes("generals: "));
    assert.equal(g.length, 1, "once a turn");
    assert.ok(g[0].includes("VANGUARD UNIT_ARMY_COMMANDER at 5,5 post 5,12") && g[0].includes("BASTION UNIT_ARMY_COMMANDER at 12,5"), g[0]);
});

// Game 50: the bastion walked between the capital and Сучжоу three times in Modern (4-5 turns each way) and left the capital
// the turn it arrived, each time for a settlement 3 points unhappier.
test("in peace a commander keeps the post it reached for 10 turns, though another settlement grows unhappier", () => {
    const [athens, sparta, corinth] = world.cities;
    const turn = Game.turn;
    try {
        athens.happy = -3;
        sparta.happy = 1;
        corinth.happy = -1;
        // Arrived at Athens (the unhappiest) this turn.
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: BASTION }]);
        run({});
        assert.deepEqual(orders(), [], "at its post");
        // Corinth now 6 points unhappier than Athens: it stays while its 10 turns last.
        corinth.happy = -9;
        Game.turn = turn + 3;
        fake.sent.length = 0;
        run({});
        assert.deepEqual(orders(), [], "kept 3 turns after arriving");
        Game.turn = turn + 10;
        fake.sent.length = 0;
        run({});
        assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], "after 10 turns it goes");
    } finally {
        Game.turn = turn;
        athens.happy = 2;
        sparta.happy = -3;
        corinth.happy = -1;
    }
});

test("a commander in danger off our centres escapes first, out of the hostile units' reach; not on a centre whose district holds", () => {
    const raider = { x: 11, y: 8, owner: 1, type: "UNIT_WARRIOR" };
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8 }], { wars: [1], enemies: [raider] });
    const r = run({});
    const to = moveOf(1);
    assert.ok(to && dist({ x: to.X, y: to.Y }, raider) > dist({ x: 9, y: 8 }, raider), JSON.stringify(orders()));
    assert.equal(r.entries[0]?.key, "COMMANDER_ESCAPED", JSON.stringify(r.entries));
    // On a centre: the district takes the attacks.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...SPARTA }], { wars: [1], enemies: [{ ...raider, x: 14, y: 5 }] });
    assert.ok(!run({}).entries.some((e) => e.key === "COMMANDER_ESCAPED"), "on Sparta's centre");
    // No war: nobody's unit is a danger.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8 }], { enemies: [raider] });
    assert.ok(!run({}).entries.some((e) => e.key === "COMMANDER_ESCAPED"), "at peace");
});

// Game 53 (research/42 A1): the bastion stood alone on Китион's 0-health centre after its holder died and was hit four times
// and killed (M72-M74); walking beside soldiers counted as safe, so a Frigate shot it three times on the coast (M149-M150).
test("a commander is safe under a healthy soldier of ours, not beside one, and not alone on a centre whose district has fallen", () => {
    const raider = { x: 11, y: 8, owner: 1, type: "UNIT_WARRIOR" };
    // Beside a soldier: it goes under it (the soldier is the one attacked), though that tile is next to the raider.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8 }, { id: 2, type: "UNIT_WARRIOR", x: 10, y: 8 }], { wars: [1], enemies: [raider] });
    let r = run({});
    assert.deepEqual(at(moveOf(1)), [10, 8], JSON.stringify(r.entries));
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ESCAPED"));
    // Already under a healthy soldier: it stays.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 10, y: 8 }, { id: 2, type: "UNIT_WARRIOR", x: 10, y: 8 }], { wars: [1], enemies: [raider] });
    assert.ok(!run({}).entries.some((e) => e.key === "COMMANDER_ESCAPED"), "under its soldier");
    // Under a soldier hurt 60: no shield; it leaves (a raider 2 tiles off: a tile out of its reach is a turn's walk away).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 10, y: 8 }, { id: 2, type: "UNIT_WARRIOR", x: 10, y: 8, damage: 60 }], { wars: [1], enemies: [{ ...raider, x: 12 }] });
    assert.ok(run({}).entries.some((e) => e.key === "COMMANDER_ESCAPED"), "a hurt soldier shields nothing");
    // Alone on Sparta's centre with its district at 0 (Китион): it leaves; at full health it stays.
    const near = { ...raider, x: SPARTA.x + 2, y: SPARTA.y };
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...SPARTA }], { wars: [1], enemies: [near], districtHealth: (x, y) => (x === SPARTA.x && y === SPARTA.y ? 0 : 100) });
    r = run({});
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ESCAPED"), JSON.stringify(r.entries));
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...SPARTA }], { wars: [1], enemies: [near], districtHealth: () => 100 });
    assert.ok(!run({}).entries.some((e) => e.key === "COMMANDER_ESCAPED"), "its district holds");
    delete world.districtHealth;
});

// The fight simulator (after game 58): the general on a town's centre left it every time its holder was struck there, and
// the XP of the fights by the town with it; the district stands between them while it holds.
test("a general on our centre stays when its holder there is hit while the district holds; with the district down it leaves once the holder no longer shields it", () => {
    const raider = { x: SPARTA.x + 1, y: SPARTA.y, owner: 1, type: "UNIT_WARRIOR" };
    const scene = (damage) => [{ id: 1, type: "UNIT_ARMY_COMMANDER", ...SPARTA }, { id: 2, type: "UNIT_SPEARMAN", ...SPARTA, damage, activity: UnitActivityTypes.SLEEP }];
    try {
        // The district down, a holder hurt 30 still shields it (the hit was the holder's: gotcha 81's shieldAt); hurt 60 it
        // does not, and the general leaves.
        for (const [health, hurt, leaves] of [[100, 30, false], [30, 30, false], [30, 60, true]]) {
            fresh(scene(0), { wars: [1], enemies: [raider], districtHealth: () => health });
            run({});
            // The holder is struck the same turn (the end-of-turn retry sees it).
            world.units = scene(hurt);
            fake.sent.length = 0;
            const r = run({});
            assert.equal(r.entries.some((e) => e.key === "COMMANDER_ESCAPED"), leaves, `district ${health}, holder hurt ${hurt}: ${JSON.stringify(r.entries)}`);
        }
    } finally {
        delete world.districtHealth;
    }
});

// Game 49: Йезд (3 tiles from the capital) was raided T16-T25; the commander's way passed the raiders, so it stayed in the
// capital, and once it stopped in a raider's reach on its way it escaped back. It never got a fight's XP.
test("game 49: a commander whose walk would stop in a raider's reach goes as far as is safe; next to its centre it goes in", () => {
    // The post: Corinth (5,12); the commander on Athens' centre (5,5), 4 turns away; a raider at 3,10, its first turn's stop
    // (4,7) within the raider's reach (3): game 49's T26. It goes as far as stays out of reach by a tile more (game 54).
    const raider = { x: 3, y: 10, owner: 1, type: "UNIT_WARRIOR" };
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [raider] });
    let r = run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
    const to = moveOf(1);
    assert.ok(to && !(to.X === CORINTH.x && to.Y === CORINTH.y), `not the whole walk: ${JSON.stringify(orders())}`);
    assert.ok(dist({ x: to.X, y: to.Y }, CORINTH) < dist(ATHENS, CORINTH), "nearer its post");
    assert.ok(dist({ x: to.X, y: to.Y }, raider) > 4, "out of the raider's reach, and of its next step");
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ADVANCE"), JSON.stringify(r.entries));
    // Game 54 (A41-A48): the only tiles nearer its post lie one step outside the raider's reach (6,9 reaches 3; 4,6 is 4
    // away): it waits on Athens' centre instead of stepping out and escaping back the next turn.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [{ x: 6, y: 9, owner: 1, type: "UNIT_WARRIOR" }] });
    r = run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
    assert.equal(moveOf(1), undefined, JSON.stringify(orders()));
    assert.ok(!r.entries.some((e) => e.key === "COMMANDER_ADVANCE"), JSON.stringify(r.entries));
    // Next to Corinth with a raider beside it: into the centre (the district takes the attacks), not away.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 5, y: 11 }], { wars: [1], enemies: [{ x: 6, y: 11, owner: 1, type: "UNIT_WARRIOR" }] });
    r = run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
    assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], JSON.stringify(r.entries));
});

// Game 49: on its way to Йезд it stopped in a raider's reach and escaped back to the capital, away from the fight.
test("a commander in danger escapes toward its post: into the threatened centre it reaches, not back to a quiet one", () => {
    const delphi = { owner: 0, x: 5, y: 8, name: "Delphi", happy: 0, prod: 10 };
    world.cities.push(delphi);
    const raider = { x: 6, y: 9, owner: 1, type: "UNIT_WARRIOR" };
    const threats = [{ settlement: { x: 5, y: 8 }, count: 2, land: 2 }];
    try {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [raider] });
        run({ threats }); // its post: Delphi
        fake.sent.length = 0;
        world.units = [{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 5, y: 6 }]; // in the raider's reach, Athens and Delphi near
        const r = run({ threats });
        assert.deepEqual(at(moveOf(1)), [5, 8], JSON.stringify(r.entries));
        assert.equal(r.entries[0]?.key, "COMMANDER_ESCAPED");
    } finally {
        world.cities.pop();
    }
});

test("an undecided vanguard stays the vanguard when a second commander comes (game 49: the role followed the unit ids)", () => {
    fresh([{ id: 9, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({});
    assert.equal(units.commanderRoles().get("0:9"), "VANGUARD");
    world.units = [{ id: 9, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, { id: 10, type: "UNIT_ARMY_COMMANDER", ...SPARTA }];
    const roles = units.commanderRoles();
    assert.deepEqual([roles.get("0:9"), roles.get("0:10")], ["VANGUARD", "BASTION"], "0:10 sorts before 0:9 by its key");
});

test("units in a general's radius strike first: their fights give it XP (research/41 §6)", async () => {
    const ship = { x: 6, y: 6, owner: 1, type: "UNIT_GALLEY" };
    const shots = () => fake.sent.filter((s) => s.op === UnitOperationTypes.RANGE_ATTACK).map((s) => s.id.id);
    // Archer 4 is listed first but stands far from the commander; archer 6 stands next to it.
    const list = [
        { id: 4, type: "UNIT_ARCHER", x: 7, y: 7, activity: UnitActivityTypes.SLEEP },
        { id: 6, type: "UNIT_ARCHER", x: 5, y: 6, activity: UnitActivityTypes.SLEEP },
        { id: 1, type: "UNIT_ARMY_COMMANDER", x: 4, y: 6 },
    ];
    fresh(list, { wars: [1], enemies: [ship], rangeTargets: (id) => ([4, 6].includes(id.id) ? [{ x: 6, y: 6 }] : []) });
    await units.strikeRaiders();
    assert.deepEqual(shots(), [6, 4], JSON.stringify(fake.sent));
    // No commander: the list's order.
    fresh(list.slice(0, 2), { wars: [1], enemies: [ship], rangeTargets: (id) => ([4, 6].includes(id.id) ? [{ x: 6, y: 6 }] : []) });
    await units.strikeRaiders();
    assert.deepEqual(shots(), [4, 6]);
    delete world.wars;
});

test("a second general: trained where it is done within 8 turns, bought from the free gold instead when it can; none with two", () => {
    const trainedCommanders = () => fake.sent.filter((s) => s.kind === "operation" && GameInfo.Units.lookup(s.args.UnitType)?.UnitType === "UNIT_ARMY_COMMANDER");
    const boughtCommanders = () => fake.sent.filter((s) => s.kind === "command" && GameInfo.Units.lookup(s.args.UnitType)?.UnitType === "UNIT_ARMY_COMMANDER");
    // One commander, no gold: one trained (cost 50 at 10 a turn: 5 turns).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { costOf: () => 50 });
    let out = steps.fillProduction(new Map(), { defend: true });
    assert.equal(trainedCommanders().length, 1, JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_COMMANDER"));
    // Too slow (cost 200: 20 turns): none trained.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { costOf: () => 200 });
    steps.fillProduction(new Map(), { defend: true });
    assert.equal(trainedCommanders().length, 0, "20 turns");
    // The free gold buys one: none trained, the purchase step buys it.
    const sells = (type) => (type === "UNIT_ARMY_COMMANDER" ? { Success: true, Cost: 150 } : { Success: false });
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { costOf: () => 50, canBuy: sells, gold: 600 });
    steps.fillProduction(new Map(), { defend: true });
    assert.equal(trainedCommanders().length, 0, "bought instead");
    out = steps.buyCommander(createBudget({ gold: 600, reserve: 0 }));
    assert.deepEqual(out.map((e) => e.key), ["COMMANDER_BOUGHT"]);
    assert.equal(boughtCommanders().length, 1);
    // A queued commander waiting behind other items moves to the front (game 49: queued at A26, started at A49).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    const athens = world.cities[0];
    Object.assign(athens, { queue: { type: "BUILDING_GRANARY", turns: 5 }, queued: ["BUILDING_MONUMENT"], trains: "UNIT_ARMY_COMMANDER" });
    try {
        steps.frontLoadUnits({ defend: true });
        const move = fake.sent.find((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [2, 0], JSON.stringify(fake.sent));
    } finally {
        delete athens.queue;
        delete athens.queued;
        delete athens.trains;
    }
    // Two commanders: neither.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, { id: 2, type: "UNIT_ARMY_COMMANDER", ...SPARTA }], { costOf: () => 50, canBuy: sells, gold: 600 });
    steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(steps.buyCommander(createBudget({ gold: 600, reserve: 0 })), []);
    assert.equal(trainedCommanders().length + boughtCommanders().length, 0);
});

// Game 53 (research/42 A3): walking alone along the coast the bastion was shot by Frigates at M31, M57 and M149-M150.
test("a commander whose walk stops in hostile reach takes a free healthy soldier next to it along: both to that stop", () => {
    // Corinth is threatened by one raider and holds with its own guard; the commander on Athens' centre is posted there (the
    // first pass), 4 turns away, its first turn's stop in the reach of a raider at 6,9 (game 49's geometry).
    const raider = { x: 6, y: 9, owner: 1, type: "UNIT_WARRIOR" };
    const threats = [{ settlement: CORINTH, count: 1, land: 1 }];
    const list = () => [
        { id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS },
        { id: 2, type: "UNIT_WARRIOR", x: 5, y: 6 },
        { id: 3, type: "UNIT_WARRIOR", ...CORINTH },
    ];
    fresh(list(), { wars: [1], enemies: [raider] });
    run({ threats });
    // The next pass, the commander still at Athens: the free Warrior beside it walks with it.
    fake.sent.length = 0;
    world.units = list();
    const r = run({ threats });
    const c = moveOf(1);
    const w = moveOf(2);
    assert.ok(c && w && c.X === w.X && c.Y === w.Y, JSON.stringify(orders()));
    assert.ok(dist({ x: c.X, y: c.Y }, CORINTH) < dist(ATHENS, CORINTH), "toward its post");
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ESCORTED"), JSON.stringify(r.entries));
    // The Warrior hurt 40: no escort; the commander only advances as far as is safe.
    fake.sent.length = 0;
    world.units = list().map((u) => (u.id === 2 ? { ...u, damage: 40 } : u));
    const r2 = run({ threats });
    assert.ok(!r2.entries.some((e) => e.key === "COMMANDER_ESCORTED"), JSON.stringify(r2.entries));
});

// Game 53, M149-M150: walking along the coast the bastion was shot by a Frigate (100 -> 54 -> 4) and still stood there the
// next turn: a commander that had moved was never considered for the escape.
test("a commander hit on its walk escapes though it has moved this turn, while it has moves left", () => {
    const raider = { x: 11, y: 8, owner: 1, type: "UNIT_WARRIOR" };
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8, moved: true, moves: 1 }], { wars: [1], enemies: [raider] });
    const r = run({});
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ESCAPED"), JSON.stringify(r.entries));
    // No moves left: nothing to send.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 9, y: 8, moved: true, moves: 0 }], { wars: [1], enemies: [raider] });
    assert.ok(!run({}).entries.some((e) => e.key === "COMMANDER_ESCAPED"));
});

// Game 54 (A42-A48): the vanguard stood at Ашшур's fight (4 raiders) but kept its post at Имгур-Энлиль (2, three turns off),
// walked out, escaped back, and both generals arrived where the raiders had already left.
test("game 54: a general stays at the fight it stands at rather than walk to its post's smaller one; a far big fight is worth the walk", () => {
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] }); // its post: Corinth
    fake.sent.length = 0;
    const r = run({ threats: [{ settlement: ATHENS, count: 3, land: 3 }, { settlement: CORINTH, count: 4, land: 4 }] });
    assert.equal(moveOf(1), undefined, `it stays at Athens' fight (3 here; Corinth's 4, 4 turns away, less than 3 more): ${JSON.stringify(r.entries)}`);
    // Corinth's fight much bigger (9 raiders, 4 turns away: 9 - 2 against 4): worth the walk.
    fake.sent.length = 0;
    run({ threats: [{ settlement: ATHENS, count: 4, land: 4 }, { settlement: CORINTH, count: 9, land: 9 }] });
    assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y]);
});

// Game 54: in Antiquity's war both generals walked 4-6 turns behind the raids; the vanguard ended the age at XP 0.
test("a war at our door with no fight in reach: each general waits at a war front facing their army, the biggest first; a big one is shared", () => {
    const front = (s, army) => ({ settlement: { ...s, name: "front" }, leader: "Rome", army, atWar: true });
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({ fronts: [front(CORINTH, 3)] });
    assert.deepEqual(at(moveOf(1)), [CORINTH.x, CORINTH.y], "Corinth's front, not Sparta (the unhappiest, in peace)");
    // No army in sight at the front, or only a war risk: the peace rule (Sparta, the unhappiest).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({ fronts: [{ ...front(CORINTH, 3), atWar: false }] });
    assert.deepEqual(at(moveOf(1)), [SPARTA.x, SPARTA.y]);
    // Two generals, one front of 2 soldiers: one goes there; a front of 5 takes both.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", x: 6, y: 5, promotions: BASTION }]);
    run({ fronts: [front(CORINTH, 2)] });
    assert.deepEqual([at(moveOf(1)), at(moveOf(2))], [[CORINTH.x, CORINTH.y], [SPARTA.x, SPARTA.y]], JSON.stringify(orders()));
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", x: 6, y: 5, promotions: BASTION }]);
    run({ fronts: [front(CORINTH, 5)] });
    assert.deepEqual([at(moveOf(1)), at(moveOf(2))], [[CORINTH.x, CORINTH.y], [CORINTH.x, CORINTH.y]], JSON.stringify(orders()));
});

// Game 54 A44: the vanguard escaped on its way, and the bastion was posted to the same fight.
test("a general that escapes keeps its post: the other one takes another fight", () => {
    const threats = [{ settlement: CORINTH, count: 7, land: 7 }, { settlement: SPARTA, count: 3, land: 3 }];
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 5, y: 9, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: BASTION }]);
    run({ threats });
    assert.deepEqual([at(moveOf(1)), at(moveOf(2))], [[CORINTH.x, CORINTH.y], [SPARTA.x, SPARTA.y]], JSON.stringify(orders()));
    // A raider in the vanguard's reach (both back where they stood): it escapes; the bastion keeps Sparta.
    fake.sent.length = 0;
    world.units = [{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 5, y: 9, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: BASTION }];
    world.wars = [1];
    world.enemies = [{ x: 3, y: 9, owner: 1, type: "UNIT_WARRIOR" }];
    const r = run({ threats });
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ESCAPED"), JSON.stringify(r.entries));
    assert.deepEqual(at(moveOf(2)), [SPARTA.x, SPARTA.y], JSON.stringify(orders()));
});

// Game 55: Rome's Cursus honorum gave every Army Commander Bulwark for free; all three generals read BASTION from A34 on, so
// none was the vanguard (no packed army, no raids watched) and the next promotion went to Steadfast.
test("a promotion the game hands out decides no role: with Cursus honorum's free Bulwark one general is still the vanguard (game 55)", () => {
    const saved = { details: GameInfo.UnitPromotionDisciplineDetails, Modifiers: GameInfo.Modifiers, DynamicModifiers: GameInfo.DynamicModifiers, ModifierArguments: GameInfo.ModifierArguments };
    GameInfo.UnitPromotionDisciplineDetails = [...saved.details, { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION", UnitPromotionType: "PROMOTION_ARMY_BULWARK" }];
    GameInfo.Modifiers = [{ ModifierId: "CURSUS_HONORUM_MOD_COMMANDER_PROMOTION", ModifierType: "MODIFIER_GRANT_PROMOTION" }];
    GameInfo.DynamicModifiers = [{ ModifierType: "MODIFIER_GRANT_PROMOTION", EffectType: "EFFECT_GRANT_UNIT_PROMOTION" }];
    GameInfo.ModifierArguments = [
        { ModifierId: "CURSUS_HONORUM_MOD_COMMANDER_PROMOTION", Name: "UnitPromotionType", Value: "PROMOTION_ARMY_BULWARK" },
        { ModifierId: "CURSUS_HONORUM_MOD_COMMANDER_PROMOTION", Name: "UnitPromotionDisciplineType", Value: "DISCIPLINE_ARMY_BASTION" },
    ];
    try {
        const free = { can: false, has: ["PROMOTION_ARMY_BULWARK"], earnable: [] };
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: free, xp: { level: 2, points: 9, next: 23 } },
            { id: 2, type: "UNIT_ARMY_COMMANDER", ...SPARTA, promotions: free, xp: { level: 2, points: 19, next: 23 } }]);
        let roles = units.commanderRoles();
        assert.deepEqual([roles.get("0:1"), roles.get("0:2")], ["BASTION", "VANGUARD"], "the one with the most XP is the vanguard");
        // Bulwark and a Bastion promotion it took itself: a bastion; the other is the vanguard.
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: free, xp: { level: 2, points: 9, next: 23 } },
            { id: 2, type: "UNIT_ARMY_COMMANDER", ...SPARTA, promotions: { can: false, has: ["PROMOTION_ARMY_BULWARK", "PROMOTION_ARMY_STEADFAST"], earnable: [] }, xp: { level: 2, points: 19, next: 23 } }]);
        roles = units.commanderRoles();
        assert.deepEqual([roles.get("0:1"), roles.get("0:2")], ["VANGUARD", "BASTION"]);
    } finally {
        Object.assign(GameInfo, { UnitPromotionDisciplineDetails: saved.details, Modifiers: saved.Modifiers, DynamicModifiers: saved.DynamicModifiers, ModifierArguments: saved.ModifierArguments });
    }
});

// Game 55: all three generals went to Катана, shelled by one Cog E18-E24, and were hit on and around its centre.
test("a fight only ships make takes one general; a land fight is still shared (game 55)", () => {
    const two = () => [{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: VANGUARD }, { id: 2, type: "UNIT_ARMY_COMMANDER", x: 6, y: 5, promotions: BASTION }];
    fresh(two());
    run({ threats: [{ settlement: CORINTH, count: 2, land: 0, ships: 2 }] });
    const posts = [at(moveOf(1)), at(moveOf(2))];
    assert.equal(posts.filter((p) => p && p[0] === CORINTH.x && p[1] === CORINTH.y).length, 1, JSON.stringify(orders()));
    fresh(two());
    run({ threats: [{ settlement: CORINTH, count: 2, land: 1, ships: 1 }] });
    assert.deepEqual([at(moveOf(1)), at(moveOf(2))], [[CORINTH.x, CORINTH.y], [CORINTH.x, CORINTH.y]], "raiders on land: both");
});
