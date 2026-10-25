// Army commanders (research/25): promotions in our order with commendations spent, a post in the most
// threatened (or the unhappiest) settlement, and Focus Fire / Coordinated Attack on a raider when enough of our
// units in its radius join. Before this a commander took the game's first promotion (Bastion, then Assault), never
// spent a commendation and stood idle all game (game 11: Bastion only, 0 XP from fights).
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
        { owner: 0, ...ATHENS, name: "Athens", happy: 2 },
        { owner: 0, ...SPARTA, name: "Sparta", happy: -3 },
        { owner: 0, ...CORINTH, name: "Corinth", happy: -1 },
        { owner: 1, x: 25, y: 15, name: "Babylon" },
    ],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const orders = () => fake.sent.filter((s) => s.kind === "unit" || s.kind === "unitCommand");
const moveOf = (id) => orders().find((s) => s.id.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["enemies", "wars", "rangeTargets", "unitCommandResult", "unitCommandOk", "combat", "districtAt"]) delete world[k];
    Object.assign(world, extra);
};
const run = (options) => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: true, merchants: false, ...options });
const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);

// Two generals (research/41 Phase 2): a lone commander is the vanguard (Mobility, Initiative, Quartermaster, Regiments; Merit
// first of the commendations), a second one the bastion (the defensive order; Order first). A role comes from what it took.
test("a commander's promotion: the vanguard's way or the bastion's, promotions before commendations, and commendations are spent", () => {
    GameInfo.UnitPromotionClassSets = [
        { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_ASSAULT" },
        { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION" },
        { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_COMMENDATION_ORDER" },
        { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_COMMENDATION_MERIT" },
    ];
    GameInfo.UnitPromotionDisciplineDetails = [
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_ASSAULT", UnitPromotionType: "PROMOTION_ARMY_INITIATIVE" },
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION", UnitPromotionType: "PROMOTION_ARMY_STEADFAST" },
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_COMMENDATION_ORDER", UnitPromotionType: "PROMOTION_COMMENDATION_ARMY_ORDER" },
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_COMMENDATION_MERIT", UnitPromotionType: "PROMOTION_COMMENDATION_ARMY_MERIT" },
    ];
    const promos = {
        PROMOTION_ARMY_INITIATIVE: { Name: "Initiative" },
        PROMOTION_ARMY_STEADFAST: { Name: "Steadfast" },
        PROMOTION_COMMENDATION_ARMY_ORDER: { Name: "Order", Commendation: true },
        PROMOTION_COMMENDATION_ARMY_MERIT: { Name: "Merit", Commendation: true },
    };
    GameInfo.UnitPromotions = { lookup: (t) => promos[t] ?? null };
    // Commander 1 promotes; `other` is a second commander's promotions (none: commander 1 is alone).
    const promoted = (earnable, other = null, has = []) => {
        const list = [{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, promotions: { can: true, has, earnable } }];
        if (other) list.push({ id: 2, type: "UNIT_ARMY_COMMANDER", x: 6, y: 5, promotions: { can: false, has: other, earnable: [] } });
        fresh(list, { unitCommandOk: (_id, op) => op === UnitCommandTypes.PROMOTE });
        const out = units.promoteUnits();
        const cmd = fake.sent.find((s) => s.op === UnitCommandTypes.PROMOTE);
        return [cmd?.args.PromotionType, out.length];
    };
    const all = ["PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_STEADFAST", "PROMOTION_COMMENDATION_ARMY_ORDER", "PROMOTION_COMMENDATION_ARMY_MERIT"];
    assert.deepEqual(promoted(all), [Database.makeHash("PROMOTION_ARMY_INITIATIVE"), 1], "alone: the vanguard's Initiative");
    assert.deepEqual(promoted(all, ["PROMOTION_ARMY_INITIATIVE"]), [Database.makeHash("PROMOTION_ARMY_STEADFAST"), 1], "beside a vanguard: the bastion's Steadfast, though Assault comes first in the game's tables");
    assert.deepEqual(promoted(["PROMOTION_ARMY_INITIATIVE", "PROMOTION_COMMENDATION_ARMY_ORDER"]), [Database.makeHash("PROMOTION_ARMY_INITIATIVE"), 1], "a promotion before a commendation (one a pass)");
    assert.deepEqual(promoted(["PROMOTION_COMMENDATION_ARMY_ORDER", "PROMOTION_COMMENDATION_ARMY_MERIT"]), [Database.makeHash("PROMOTION_COMMENDATION_ARMY_MERIT"), 1], "the vanguard's commendation: Merit");
    assert.deepEqual(promoted(["PROMOTION_COMMENDATION_ARMY_ORDER", "PROMOTION_COMMENDATION_ARMY_MERIT"], ["PROMOTION_ARMY_INITIATIVE"]), [Database.makeHash("PROMOTION_COMMENDATION_ARMY_ORDER"), 1], "the bastion's: Order");
    assert.deepEqual(promoted(["PROMOTION_COMMENDATION_ARMY_ORDER"]), [Database.makeHash("PROMOTION_COMMENDATION_ARMY_ORDER"), 1], "a stored commendation is spent: Order");
});

test("a land commander takes a post: the most threatened settlement, in peace the unhappiest; one commander each", () => {
    // Under threat: to Corinth (2 raiders), not unhappy Sparta.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    const threats = [{ settlement: CORINTH, count: 2, land: 2 }, { settlement: SPARTA, count: 1, land: 1 }];
    let r = run({ threats });
    assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [CORINTH.x, CORINTH.y], JSON.stringify(orders()));
    assert.equal(r.entries.find((e) => e.key === "COMMANDER_POST")?.args[1], "Corinth");
    // Two commanders: the second to the next threatened one.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, { id: 2, type: "UNIT_ARMY_COMMANDER", x: 6, y: 5 }]);
    run({ threats });
    assert.deepEqual([[moveOf(1)?.X, moveOf(1)?.Y], [moveOf(2)?.X, moveOf(2)?.Y]], [[CORINTH.x, CORINTH.y], [SPARTA.x, SPARTA.y]]);
    // Peace: the unhappiest settlement (Sparta −3 before Corinth −1).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({});
    assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [SPARTA.x, SPARTA.y]);
    // At its post it stays (no order: the skip step skips it).
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...SPARTA }]);
    r = run({});
    assert.deepEqual(orders(), []);
    // Off the map's centres in peace with everyone happy: to the nearest centre.
    world.cities[1].happy = 1;
    world.cities[2].happy = 1;
    try {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 11, y: 7 }]);
        run({});
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [SPARTA.x, SPARTA.y]);
    } finally {
        world.cities[1].happy = -3;
        world.cities[2].happy = -1;
    }
    // Without «Оборона» and «Армия»: left alone, as before.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
    run({ defend: false });
    assert.deepEqual(orders(), []);
});

test("a far threatened settlement does not draw the commander (game 37: an 18-turn walk to a town a purchase had secured)", () => {
    // A town of ours 23 tiles east of Athens (12 turns) is threatened; Sparta (−3) is 4 turns away.
    const far = { owner: 0, x: 28, y: 5, name: "Rhodes" };
    world.cities.push(far);
    try {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
        run({ threats: [{ settlement: { x: far.x, y: far.y }, count: 3, land: 3 }] });
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [SPARTA.x, SPARTA.y], JSON.stringify(orders()));
    } finally {
        world.cities.pop();
    }
});

test("in peace a commander leaves its centre only for a settlement 3 points unhappier, and keeps its post on the way (game 37)", () => {
    // Game 37 E36-E61: re-posted seven times between three cities about 5 turns apart as their Happiness moved a point.
    const [athens, sparta, corinth] = world.cities;
    try {
        sparta.happy = 1;
        // On Athens (+2) with Corinth at −1: it stays.
        corinth.happy = -1;
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
        run({});
        assert.deepEqual(orders(), [], "−1 is not worth the walk");
        // Corinth at −4: it goes.
        corinth.happy = -4;
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }]);
        run({});
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [CORINTH.x, CORINTH.y]);
        // Stopped on its way, with Corinth back at −1 and Athens, two turns back, now at −5: Corinth stays its post.
        corinth.happy = -1;
        athens.happy = -5;
        fake.sent.length = 0;
        world.units = [{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 5, y: 8, moved: true }];
        run({});
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [CORINTH.x, CORINTH.y], JSON.stringify(orders()));
    } finally {
        athens.happy = 2;
        sparta.happy = -3;
        corinth.happy = -1;
    }
});

test("a commander the game stopped on its way (moved, moves left) gets its post again", () => {
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", x: 5, y: 8, moved: true }]);
    run({ threats: [{ settlement: CORINTH, count: 2, land: 2 }] });
    assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [CORINTH.x, CORINTH.y], JSON.stringify(orders()));
});

test("a commander's way to its post never passes next to a hostile unit", () => {
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [{ x: 9, y: 6, owner: 1, type: "UNIT_WARRIOR" }] });
    run({});
    assert.equal(moveOf(1), undefined, "the straight way to Sparta passes the warrior");
});

test("Focus Fire: the ranged units in the commander's radius that can shoot the raider; one is enough (the game sets no minimum: research/42 A4)", async () => {
    const raider = { x: 7, y: 5, owner: 1, type: "UNIT_WARRIOR" };
    const result = (_id, op) => ({ Success: false, Plots: op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED" ? [idx(raider.x, raider.y)] : [] });
    const archers = [{ id: 2, type: "UNIT_ARCHER", x: 4, y: 5, ranged: 20, melee: 10 }, { id: 3, type: "UNIT_ARCHER", x: 6, y: 5, ranged: 20, melee: 10 }];
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, ...archers], { wars: [1], enemies: [raider], unitCommandResult: result, rangeTargets: () => [raider] });
    const r = await units.strikeRaiders();
    const cmd = orders().find((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED");
    assert.deepEqual([cmd?.id.id, cmd?.args.X, cmd?.args.Y], [1, raider.x, raider.y], JSON.stringify(orders()));
    assert.deepEqual(r.entries.map((e) => [e.key, e.args[4]]), [["FOCUS_FIRE", 2]]);
    assert.ok(r.ordered.has("0:2") && r.ordered.has("0:3"), "the archers took part: no other order");
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, archers[1]], { wars: [1], enemies: [raider], unitCommandResult: result, rangeTargets: () => [raider] });
    await units.strikeRaiders();
    // One archer: the commander orders it anyway (+2 Combat Strength for the shot; game 53 refused 49 such attacks).
    assert.deepEqual(orders().map((s) => [s.id.id, s.op]), [[1, "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED"]], JSON.stringify(orders()));
    // Not a hostile unit (no war): nothing.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, ...archers], { enemies: [raider], unitCommandResult: result, rangeTargets: () => [raider] });
    await units.strikeRaiders();
    assert.deepEqual(orders(), []);
});

test("Coordinated Attack: two healthy melee units next to the raider and in the radius; not against a stronger one", async () => {
    const C = ATHENS;
    // A raider 2 tiles from the commander with two tiles next to both.
    let target = null;
    let pair = null;
    for (let y = C.y - 2; y <= C.y + 2 && !target; y++) {
        for (let x = C.x - 2; x <= C.x + 2 && !target; x++) {
            if (dist(C, { x, y }) !== 2) continue;
            const common = [];
            for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (dist({ x: xx, y: yy }, { x, y }) === 1 && dist({ x: xx, y: yy }, C) === 1) common.push({ x: xx, y: yy });
            if (common.length >= 2) {
                target = { x, y };
                pair = common.slice(0, 2);
            }
        }
    }
    assert.ok(target, "a geometry for the test");
    const result = (_id, op) => ({ Success: false, Plots: op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE" ? [idx(target.x, target.y)] : [] });
    const warriors = pair.map((p, i) => ({ id: 2 + i, type: "UNIT_WARRIOR", ...p }));
    const raider = { ...target, owner: 1, type: "UNIT_WARRIOR", damage: 30 };
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...C }, ...warriors], { wars: [1], enemies: [raider], unitCommandResult: result, combat: () => ({ dealt: 60, taken: 20 }) });
    const r = await units.strikeRaiders();
    const cmd = orders().find((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE");
    assert.deepEqual([cmd?.id.id, cmd?.args.X, cmd?.args.Y], [1, target.x, target.y], JSON.stringify(orders()));
    assert.deepEqual(r.entries.map((e) => e.key), ["COORDINATED_ATTACK"], "the warriors do not strike again on their own");
    // A stronger raider (Horseman 35 against our 20 + 2), a hurt warrior, or a raider in a district: no.
    for (const [extra, list, why] of [
        [{ enemies: [{ ...raider, type: "UNIT_HORSEMAN" }] }, warriors, "stronger"],
        [{}, [warriors[0], { ...warriors[1], damage: 60 }], "one is badly hurt"],
        [{ districtAt: (x, y) => x === target.x && y === target.y }, warriors, "in a district"],
    ]) {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...C }, ...list], { wars: [1], enemies: [raider], unitCommandResult: result, ...extra });
        await units.strikeRaiders();
        assert.equal(orders().find((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE"), undefined, why);
    }
});

test("a Coordinated Attack's unit whose attack never came (the raider died first) is skipped: it held the turn (game 36 T49)", async () => {
    // Game 36 T49: three Warriors joined a Coordinated Attack on a raider next to Манчестер; it died after two, and the
    // third, on the centre (no fortifying there), was kept from the skip step as ordered: «Отдать приказы юнитам».
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const C = ATHENS;
    let target = null;
    for (let y = C.y - 1; y <= C.y + 1 && !target; y++) for (let x = C.x - 1; x <= C.x + 1 && !target; x++) if (dist(C, { x, y }) === 1) target = { x, y };
    const pair = [];
    for (let y = C.y - 2; y <= C.y + 2; y++) for (let x = C.x - 2; x <= C.x + 2; x++) if (dist({ x, y }, C) === 1 && dist({ x, y }, target) === 1) pair.push({ x, y });
    assert.equal(pair.length, 2, "a geometry for the test");
    const result = (_id, op) => ({ Success: false, Plots: op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE" ? [idx(target.x, target.y)] : [] });
    fresh([
        { id: 1, type: "UNIT_ARMY_COMMANDER", ...C },
        { id: 2, type: "UNIT_WARRIOR", ...pair[0] },
        { id: 3, type: "UNIT_WARRIOR", ...pair[1] },
        { id: 4, type: "UNIT_WARRIOR", ...C },
    ], {
        wars: [1], enemies: [{ ...target, owner: 1, type: "UNIT_WARRIOR", damage: 30 }], unitCommandResult: result,
        combat: () => ({ dealt: 60, taken: 20 }),
        // The game's centre: no fortifying or alert there.
        unitCanStart: (id, op) => (id.id === 4 && /FORTIFY|ALERT/.test(op) ? { Success: false } : null),
    });
    // Like the game: two Warriors fight and the raider dies; the third keeps its moves and its attack.
    const send = Game.UnitCommands.sendRequest;
    Game.UnitCommands.sendRequest = (id, op, args) => {
        if (/^UNITCOMMAND_FOCUSED_ATTACK/.test(op)) {
            for (const u of world.units) if (u.id === 2 || u.id === 3) Object.assign(u, { moved: true, moves: 0, attacks: 0 });
            world.enemies = [];
        }
        return send(id, op, args);
    };
    settings.patch({ autopilot: { defend: true, skipUnits: true, endTurn: false, replanEvery: 0, research: false, choices: false, befriend: false, growth: false, towns: false, production: false, purchases: false } });
    try {
        await autopilot.runTurn(true);
        assert.ok(orders().some((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE"), JSON.stringify(orders()));
        const third = orders().filter((s) => s.id.id === 4).map((s) => s.op);
        assert.ok(third.includes(UnitOperationTypes.SKIP_TURN), `the third Warrior: ${JSON.stringify(third)}`);
    } finally {
        Game.UnitCommands.sendRequest = send;
        settings.patch({ autopilot: { defend: false, skipUnits: false, production: true, purchases: true, research: true, choices: true, befriend: true, growth: true, towns: true, replanEvery: 5 } });
    }
});

test("the game's experience and army parameters are logged once (their values are compiled into the game)", () => {
    GameInfo.GlobalParameters = [{ Name: "EXPERIENCE_MAX_BARB_LEVEL", Value: "2" }, { Name: "ARMY_MAX_UNITS", Value: "4" }, { Name: "CITY_MIN_RANGE", Value: "3" },
        { Name: "COMBAT_FOCUSED_ATTACK_BASE_BONUS", Value: "5" }];
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        fresh([]);
        run({});
        run({});
    } finally {
        console.warn = warn;
    }
    const logged = lines.filter((l) => l.includes("commander parameters"));
    assert.equal(logged.length, 1, JSON.stringify(lines));
    assert.match(logged[0], /EXPERIENCE_MAX_BARB_LEVEL=2, ARMY_MAX_UNITS=4, COMBAT_FOCUSED_ATTACK_BASE_BONUS=5$/, "P-XP-1: the focused attack's bonus too");
});

test("P-XP-2: a commander's level and XP are logged when they change (research/41 §2; each fight of ours: tests/unit-log.test.mjs)", () => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    const raider = { x: 7, y: 5, owner: 1, type: "UNIT_WARRIOR" };
    try {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS, xp: { level: 2, points: 7, next: 12 } }, { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5 }], { wars: [1], enemies: [raider] });
        Game.turn = 31;
        units.probeMilitary();
        Game.turn = 32;
        units.probeMilitary();
        const xp = lines.filter((l) => l.includes("xp: UNIT_ARMY_COMMANDER"));
        assert.equal(xp.length, 1, "unchanged: written once");
        assert.match(xp[0], /level 2, XP 7\/12/);
    } finally {
        console.warn = warn;
    }
});

test("a commander's radius is the game's own (Units.getCommandRadiusPlots): an archer 2 tiles away joins Focus Fire (research/36 §6)", async () => {
    const raider = { x: 7, y: 5, owner: 1, type: "UNIT_WARRIOR" };
    const result = (_id, op) => ({ Success: false, Plots: op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED" ? [idx(raider.x, raider.y)] : [] });
    const archers = [{ id: 2, type: "UNIT_ARCHER", x: 3, y: 5, ranged: 20, melee: 10 }, { id: 3, type: "UNIT_ARCHER", x: 6, y: 5, ranged: 20, melee: 10 }];
    const base = { wars: [1], enemies: [raider], unitCommandResult: result, rangeTargets: () => [raider] };
    const focus = () => orders().find((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED");
    try {
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, ...archers], base);
        let r = await units.strikeRaiders();
        assert.deepEqual(r.entries.map((e) => [e.key, e.args[4]]), [["FOCUS_FIRE", 1], ["RANGED", undefined]], "radius 1 without Merit: one archer in it; the other shoots on its own");
        fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }, ...archers], { ...base, commandRadius: () => [ATHENS, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 6, y: 5 }].map((p) => idx(p.x, p.y)) });
        r = await units.strikeRaiders();
        assert.deepEqual([focus()?.args.X, focus()?.args.Y], [raider.x, raider.y], JSON.stringify(orders()));
        assert.deepEqual(r.entries.map((e) => [e.key, e.args[4]]), [["FOCUS_FIRE", 2]]);
    } finally {
        delete world.commandRadius;
    }
});

// Research/40 C: commands a commendation unlocks and we never used.
test("a commander finishes a half-dead raider with its own attack; with raiders close and nothing else it sets a Defensive Perimeter", async () => {
    const raider = { x: 6, y: 5, owner: 1, type: "UNIT_WARRIOR", damage: 70 };
    const result = (_id, op) => (op === "UNITCOMMAND_COMMANDER_ATTACK" ? { Success: false, Plots: [idx(raider.x, raider.y)] }
        : op === "UNITCOMMAND_DEFENSIVE_PERIMETER" ? { Success: true } : { Success: false, Plots: [] });
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [raider], unitCommandResult: result });
    let r = await units.strikeRaiders();
    const cmd = orders().find((s) => s.op === "UNITCOMMAND_COMMANDER_ATTACK");
    assert.deepEqual([cmd?.id.id, cmd?.args.X, cmd?.args.Y], [1, raider.x, raider.y], JSON.stringify(orders()));
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ATTACK"));
    // A fresh raider: not worth risking the commander; it fortifies the units around it instead.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [{ ...raider, damage: 10 }], unitCommandResult: result });
    r = await units.strikeRaiders();
    assert.deepEqual(orders().map((s) => s.op), ["UNITCOMMAND_DEFENSIVE_PERIMETER"]);
    // Nobody near: nothing.
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [{ ...raider, x: 20, y: 15 }], unitCommandResult: result });
    await units.strikeRaiders();
    assert.deepEqual(orders(), []);
});

// Research/42 A4-A5 (game 53: one Coordinated Attack all game, 49 refused for `at most 0-1 of ours joining (need 2)`).
test("a Coordinated Attack with one melee unit when the game's preview says its strike pays; not when it does not", async () => {
    const C = ATHENS;
    const target = { x: C.x + 2, y: C.y };
    const beside = { x: C.x + 1, y: C.y };
    assert.equal(dist(beside, target), 1);
    const result = (_id, op) => ({ Success: false, Plots: op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE" ? [idx(target.x, target.y)] : [] });
    const raider = { ...target, owner: 1, type: "UNIT_WARRIOR", damage: 30 };
    const list = [{ id: 1, type: "UNIT_ARMY_COMMANDER", ...C }, { id: 2, type: "UNIT_WARRIOR", ...beside }];
    fresh(list, { wars: [1], enemies: [raider], unitCommandResult: result, combat: () => ({ dealt: 60, taken: 15 }) });
    let r = await units.strikeRaiders();
    assert.deepEqual(r.entries.map((e) => [e.key, e.args[4]]), [["COORDINATED_ATTACK", 1]], JSON.stringify(orders()));
    // A poor trade: no focused attack (and no strike of its own either).
    fresh(list, { wars: [1], enemies: [raider], unitCommandResult: result, combat: () => ({ dealt: 10, taken: 45 }) });
    r = await units.strikeRaiders();
    assert.equal(orders().find((s) => s.op === "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE"), undefined, JSON.stringify(orders()));
});

test("Commander Attack on an unhurt raider only when the game's preview says the commander beats it keeping 70% of its health", async () => {
    const raider = { x: 6, y: 5, owner: 1, type: "UNIT_WARRIOR", damage: 0 };
    const result = (_id, op) => (op === "UNITCOMMAND_COMMANDER_ATTACK" ? { Success: false, Plots: [idx(raider.x, raider.y)] } : { Success: false, Plots: [] });
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [raider], unitCommandResult: result, combat: () => ({ dealt: 60, taken: 10 }) });
    let r = await units.strikeRaiders();
    assert.ok(r.entries.some((e) => e.key === "COMMANDER_ATTACK"), JSON.stringify(orders()));
    fresh([{ id: 1, type: "UNIT_ARMY_COMMANDER", ...ATHENS }], { wars: [1], enemies: [raider], unitCommandResult: result, combat: () => ({ dealt: 80, taken: 35 }) });
    r = await units.strikeRaiders();
    assert.ok(!r.entries.some((e) => e.key === "COMMANDER_ATTACK"), "a good trade, but it would keep 65%: not worth risking it");
});
