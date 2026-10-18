// The war (research/23, game 8): majors at war with us at our door, and war risks (Unfriendly and close, or
// spying on us). Guards for every settlement, no settler at war, no savings goal at war, conversions keeping
// the gold for two defenders, no siege unit bought as a defender, defenders passing a queued settler,
// upgrades from all the gold near a threatened settlement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const BERLIN = { x: 18, y: 8 }; // Prussia, 10 tiles from London
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 } }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, x: 12, y: 14, name: "York", isTown: true, pop: 4, cost: 300 },
        { owner: 0, x: 4, y: 14, name: "Leeds", isTown: true, pop: 3, cost: 300 },
        { owner: 1, ...BERLIN, name: "Berlin" },
        { owner: 2, x: 36, y: 18, name: "Boston" },
    ],
    gold: 1000,
    goldIncome: 10,
    settlementCap: 8,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const A = DiplomacyActionTypes;
const reset = (extra = {}) => {
    fake.sent.length = 0;
    for (const k of ["wars", "relations", "events", "canBuild", "canBuy", "buyCost", "enemies", "unitCommandOk", "agePoints"]) delete world[k];
    world.units = [];
    world.gold = 1000;
    world.goldIncome = 10;
    for (const c of world.cities) {
        delete c.queue;
        delete c.queued;
        delete c.trains;
    }
    Object.assign(world, extra);
    steps.resetWar();
    steps.resetGoldPlan();
};
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map(unitName);
const trains = (...types) => (type) => (type?.startsWith?.("UNIT_") ? { Success: types.includes(type) } : undefined);
state.set({ results: { ...state.get().results, sites: { picks: [{ x: 4, y: 4 }], computedTurn: Game.turn } } });

test("war: a major at war with a settlement near ours is at our door; an Unfriendly major close by, or one sabotaging us, is a risk (research/23 D3)", () => {
    reset({ relations: { 1: "UNFRIENDLY" } });
    let w = steps.assessWar([]);
    assert.deepEqual([w.atWar, w.near, w.risk], [[], false, [1]], "Prussia: Unfriendly, 10 tiles away");
    assert.deepEqual(w.entries.map((e) => e.key), ["WAR_RISK"]);
    assert.deepEqual(steps.assessWar([]).entries, [], "noted once");
    reset({ relations: { 2: "UNFRIENDLY" } });
    assert.deepEqual(steps.assessWar([]).risk, [], "America: Unfriendly but far away");
    reset({ relations: { 2: "UNFRIENDLY" }, events: { 0: [{ initialPlayer: 2, targetPlayer: 0, actionType: A.DIPLOMACY_ACTION_SABOTAGE_RESEARCH }] } });
    assert.deepEqual(steps.assessWar([]).risk, [2], "far, but its sanction hits us");
    reset({ relations: { 1: "FRIENDLY" } });
    assert.deepEqual(steps.assessWar([]).risk, [], "close but Friendly");
    reset({ wars: [1] });
    w = steps.assessWar([]);
    assert.deepEqual([w.atWar, w.near], [[1], true]);
    reset({ wars: [2] });
    w = steps.assessWar([]);
    assert.deepEqual([w.atWar, w.near], [[2], false], "a war far away");
    w = steps.assessWar([{ settlement: { x: 12, y: 14, name: "York" }, count: 1, land: 1, owners: [{ id: 2, independent: false }] }]);
    assert.equal(w.near, true, "its units at York");
});

test("war risk: a guard for our settlement nearest to the risky leader, the strongest melee unit a city can train (research/23 D3)", () => {
    reset({ relations: { 1: "UNFRIENDLY" }, canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    steps.assessWar([]);
    const out = steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), ["UNIT_SPEARMAN"], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_GUARD"));
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    world.units = [{ id: 30, type: "UNIT_SPEARMAN", x: 8, y: 8 }];
    steps.assessWar([]);
    steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), [], "no risk: none");
});

// The Pyramids can be built next to London (and nothing else is a wonder we may start).
const pyramids = (type) => (type === "WONDER_PYRAMIDS" ? { Success: true, Plots: [GameplayMap.getIndexFromXY(LONDON.x + 1, LONDON.y)], ExpandUrbanPlots: [] }
    : type?.startsWith?.("WONDER_") ? { Success: false, Plots: [] } : { Success: true, Plots: [], ExpandUrbanPlots: [] });

test("a war at our door: no settler trained, no savings goal, no new wonder (research/23 D3, D5, D9)", () => {
    reset({ wars: [1], canBuild: pyramids, agePoints: 20 });
    steps.assessWar([]);
    const settler = () => trained().filter((t) => t === "UNIT_SETTLER");
    steps.fillProduction(new Map(), { settlers: true, trainSettlers: true });
    assert.deepEqual(settler(), [], "at war: no settler");
    world.gold = 200; // short of a conversion: it would be the savings goal
    assert.equal(steps.goldPlan(DEFAULT_SETTINGS, {}).budget.goal, null, "at war: no savings goal");
    assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1).size, 0);
    reset({ canBuild: pyramids, agePoints: 20 });
    steps.assessWar([]);
    assert.equal(steps.chooseWonders(DEFAULT_SETTINGS, 1).size, 1, "at peace: the Pyramids");
    world.gold = 200;
    assert.equal(steps.goldPlan(DEFAULT_SETTINGS, {}).budget.goal?.kind, "CONVERT", "at peace: the conversion");
    steps.fillProduction(new Map(), { settlers: true, trainSettlers: true });
    assert.deepEqual(settler(), ["UNIT_SETTLER"], "at peace: a settler");
});

test("conversions: none with a war at our door; with a war risk the gold for two defenders stays (research/23 D3)", () => {
    const converted = () => fake.sent.filter((s) => s.args?.Directive === OrderTypes.ORDER_TOWN_UPGRADE).length;
    reset({ relations: { 1: "UNFRIENDLY" }, gold: 600 });
    steps.assessWar([]);
    steps.convertTowns(DEFAULT_SETTINGS, 0);
    assert.equal(converted(), 0, "300 + two defenders at 250 > 600");
    reset({ gold: 600 });
    steps.assessWar([]);
    steps.convertTowns(DEFAULT_SETTINGS, 0);
    assert.equal(converted(), 1, "no risk");
    reset({ wars: [1], gold: 2000 });
    steps.assessWar([]);
    steps.convertTowns(DEFAULT_SETTINGS, 0);
    assert.equal(converted(), 0, "at war");
});

test("a defender bought: never a siege unit; with the income below zero it leaves 3 turns of the deficit, not the whole reserve (research/23 D6, research/36 §8)", () => {
    const threat = [{ settlement: { x: LONDON.x, y: LONDON.y, name: "London" }, count: 1, land: 1, owners: [{ id: 1, independent: false }] }];
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map(unitName);
    const sells = { UNIT_ARCHER: 150, UNIT_BALLISTA: 100 };
    reset({ wars: [1], goldIncome: -10, gold: 400, canBuy: (type) => (sells[type] ? { Success: true, Cost: sells[type] } : { Success: false }) });
    steps.buyDefenders(threat, { reserveTurns: 2 });
    assert.deepEqual(bought(), ["UNIT_ARCHER"], "not the Ballista");
    // 10 turns of the deficit (100) are the reserve; a defender may take all but 3 turns of it (30).
    reset({ wars: [1], goldIncome: -10, gold: 200, canBuy: (type) => (sells[type] ? { Success: true, Cost: sells[type] } : { Success: false }) });
    steps.buyDefenders(threat, { reserveTurns: 2 });
    assert.deepEqual(bought(), ["UNIT_ARCHER"], "200 - 30 >= 150");
    reset({ wars: [1], goldIncome: -10, gold: 170, canBuy: (type) => (sells[type] ? { Success: true, Cost: sells[type] } : { Success: false }) });
    steps.buyDefenders(threat, { reserveTurns: 2 });
    assert.deepEqual(bought(), [], "170 - 30 < 150");
});

test("a defender at war passes a queued settler at the front of the queue (research/23 D9)", () => {
    reset({ wars: [1] });
    steps.assessWar([]);
    const london = world.cities[0];
    london.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 50 };
    london.queued = ["UNIT_SETTLER", "UNIT_SPEARMAN"];
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: true, Plots: [] });
    const threats = [{ settlement: { x: LONDON.x, y: LONDON.y, name: "London" }, count: 1, land: 1, owners: [{ id: 1, independent: false }] }];
    steps.frontLoadUnits({ defend: true, settlers: true, threats });
    const move = fake.sent.find((s) => s.args?.InsertMode === CityOperationsParametersValues.MoveTo);
    assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [2, 0], "past the settler, to the very front (D4)");
});

test("with a war at our door, units near a threatened settlement are upgraded from all the gold (research/23 D5)", () => {
    reset({ wars: [1], unitCommandOk: (_id, op) => op === "UNITCOMMAND_UPGRADE" });
    world.units = [{ id: 91, type: "UNIT_WARRIOR", x: LONDON.x + 1, y: LONDON.y, activity: UnitActivityTypes.SLEEP }];
    GameInfo.UnitUpgrades = [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }];
    const threats = [{ settlement: { x: LONDON.x, y: LONDON.y, name: "London" }, count: 2, land: 2, owners: [{ id: 1, independent: false }] }];
    const upgraded = () => fake.sent.filter((s) => s.op === "UNITCOMMAND_UPGRADE").length;
    try {
        world.gold = 300; // 250 for the upgrade; 900 held by a savings goal elsewhere
        let b = createBudget({ gold: 300, reserve: 0 });
        b.setGoal({ kind: "CONVERT", key: "x", cost: 900 });
        units.upgradeUnits(b, threats, { mode: "ANY", war: true });
        assert.equal(upgraded(), 1);
        fake.sent.length = 0;
        b = createBudget({ gold: 300, reserve: 0 });
        b.setGoal({ kind: "CONVERT", key: "x", cost: 900 });
        units.upgradeUnits(b, threats, { mode: "ANY" });
        assert.equal(upgraded(), 0, "not at war: the free gold only");
    } finally {
        delete GameInfo.UnitUpgrades;
    }
});

test("a war risk: the advisor's soldier is trained whatever the strategy says (research/23 D3)", () => {
    const subjects = GameInfo.AdvisorySubjects;
    GameInfo.AdvisorySubjects = { lookup: (h) => (h === 8 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_UNITS" } : null) };
    const strategy = { advisorSoldiers: false, militaryBuildings: false };
    const recs = () => [{ subject: 8, recommendedType: "UNIT_WARRIOR", whichAdvisors: [] }];
    try {
        reset({ relations: { 1: "UNFRIENDLY" }, buildRecs: recs });
        steps.assessWar([]);
        steps.fillProduction(new Map(), { strategy });
        assert.ok(trained().includes("UNIT_WARRIOR"), JSON.stringify(trained()));
        reset({ buildRecs: recs });
        steps.assessWar([]);
        steps.fillProduction(new Map(), { strategy });
        assert.ok(!trained().includes("UNIT_WARRIOR"), "no risk: the strategy's peace");
    } finally {
        GameInfo.AdvisorySubjects = subjects;
        delete world.buildRecs;
    }
});

test("walls are researched with a war at our door, or after 3 turns of a threatened settlement (research/23 D7)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const chosen = () => fake.sent.filter((s) => s.op === TECH).map((s) => s.args.ProgressionTreeNodeType);
    // Masonry is available: its prerequisites are researched.
    const research = { tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] }, turns: { NODE_TECH_AQ_MASONRY: 6, NODE_TECH_AQ_POTTERY: 2 }, depth: { NODE_TECH_AQ_AGRICULTURE: 1, NODE_TECH_AQ_ANIMAL_HUSBANDRY: 1 } };
    const turn = Game.turn;
    const threat = [{ settlement: { x: LONDON.x, y: LONDON.y, name: "London" }, count: 2, land: 2, owners: [] }];
    try {
        reset({ wars: [1], research });
        steps.assessWar([]);
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual([r?.key, chosen()], ["TECH_FOR_WALLS", [N("NODE_TECH_AQ_MASONRY")]]);
        reset({ research });
        steps.assessWar([]);
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), [N("NODE_TECH_AQ_POTTERY")], "at peace, no threat: the quickest");
        for (let i = 0; i < 3; i++) {
            Game.turn = turn + 100 + i;
            steps.noteThreats(threat);
        }
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), [N("NODE_TECH_AQ_MASONRY")], "3 turns threatened");
    } finally {
        Game.turn = turn;
        steps.noteThreats([]);
        delete world.research;
    }
});

test("walls are not queued in an age's last turns (research/23 E6: Ancient Walls queued 2 turns before the end lost 34 of 40)", () => {
    const centre = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y);
    const threat = [{ settlement: { x: LONDON.x, y: LONDON.y, name: "London" }, count: 2, land: 2, owners: [] }];
    const walls = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre] } : { Success: true, Plots: [] });
    try {
        reset({ canBuild: walls, canBuy: () => ({ Success: false }), agePoints: 98, ageCountdown: true });
        let out = steps.fortifyThreatened(threat);
        assert.deepEqual(out, [], "the countdown with 2 points left");
        reset({ canBuild: walls, canBuy: () => ({ Success: false }) });
        out = steps.fortifyThreatened(threat);
        assert.equal(out[0]?.key, "WALLS_QUEUED");
    } finally {
        delete world.ageCountdown;
    }
});

test("a leader near a military win (the watch's DANGER, or its countdown) is a war risk at any distance and relationship (research/24 W5)", () => {
    reset();
    const watch = [{ cls: "MILITARY", level: "DANGER", leader: 2 }, { cls: "CULTURE", level: "DANGER", leader: 1 }];
    const w = steps.assessWar([], { watch });
    assert.deepEqual([w.risk, w.near], [[2], false], "Boston is 28 tiles away and neutral; a culture leader is no war risk");
    reset();
    assert.deepEqual(steps.assessWar([], { watch: [{ cls: "MILITARY", level: null, countdown: 3, leader: 2 }] }).risk, [2], "its countdown runs");
    reset();
    assert.deepEqual(steps.assessWar([], { watch: [{ cls: "MILITARY", level: "WATCH", leader: 2 }] }).risk, []);
});

const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const chosenNodes = () => fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => s.args.ProgressionTreeNodeType);

test("a war at our door switches research under way to the walls' way; walls' own way is kept (research/24 W4: Castles came 4 turns into the war)", () => {
    const research = (active) => ({ tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_POTTERY")], active }, culture: { available: [] }, turns: { NODE_TECH_AQ_MASONRY: 6, NODE_TECH_AQ_POTTERY: 2 }, depth: { NODE_TECH_AQ_AGRICULTURE: 1, NODE_TECH_AQ_ANIMAL_HUSBANDRY: 1 } });
    try {
        reset({ wars: [1], research: research(N("NODE_TECH_AQ_POTTERY")) });
        steps.assessWar([]);
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual([r?.key, chosenNodes()], ["TECH_FOR_WALLS", [N("NODE_TECH_AQ_MASONRY")]]);
        reset({ wars: [1], research: research(N("NODE_TECH_AQ_MASONRY")) });
        steps.assessWar([]);
        assert.equal(steps.chooseResearch("tech", DEFAULT_SETTINGS, null), null, "already on the walls' way");
        reset({ research: research(N("NODE_TECH_AQ_POTTERY")) });
        steps.assessWar([]);
        assert.equal(steps.chooseResearch("tech", DEFAULT_SETTINGS, null), null, "at peace: research under way is kept");
    } finally {
        delete world.research;
    }
});

test("walls research: 3 turns of the last 5 with a serious threat (a major's units or 2+ raiders); one independent raider is not (research/24 W4)", () => {
    const research = { tech: { available: [N("NODE_TECH_AQ_MASONRY"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] }, turns: { NODE_TECH_AQ_MASONRY: 6, NODE_TECH_AQ_POTTERY: 2 }, depth: { NODE_TECH_AQ_AGRICULTURE: 1, NODE_TECH_AQ_ANIMAL_HUSBANDRY: 1 } };
    const at = { x: LONDON.x, y: LONDON.y, name: "London" };
    const serious = [{ settlement: at, count: 2, land: 2, owners: [{ id: 5, independent: true }] }];
    const lone = [{ settlement: at, count: 1, land: 1, owners: [{ id: 5, independent: true }] }];
    const turn = Game.turn;
    try {
        reset({ research });
        steps.assessWar([]);
        for (const [i, t] of [serious, [], serious, [], serious].entries()) {
            Game.turn = turn + 100 + i;
            steps.noteThreats(t);
        }
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosenNodes(), [N("NODE_TECH_AQ_MASONRY")], "3 of the last 5 turns");
        reset({ research });
        steps.assessWar([]);
        for (let i = 0; i < 4; i++) {
            Game.turn = turn + 200 + i;
            steps.noteThreats(lone);
        }
        steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosenNodes(), [N("NODE_TECH_AQ_POTTERY")], "one raider at a time: no walls");
    } finally {
        Game.turn = turn;
        steps.resetWar();
        delete world.research;
    }
});

test("a war at our door: research toward a melee unit stronger than any we train, when its node is one step away; not for a war risk alone, nor a war far away (research/24 W1: Coursers 40 against Knights 45; research/32 §4: game 27's six Antiquity techs for a risk)", () => {
    const research = { tech: { available: [N("NODE_TECH_AQ_IRON_WORKING"), N("NODE_TECH_AQ_POTTERY")] }, culture: { available: [] }, turns: { NODE_TECH_AQ_IRON_WORKING: 8, NODE_TECH_AQ_POTTERY: 2 }, depth: { NODE_TECH_AQ_MILITARY_TRAINING: 1, NODE_TECH_AQ_MASONRY: 1 } };
    try {
        reset({ wars: [1], research, canBuild: trains("UNIT_WARRIOR") });
        steps.assessWar([]);
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.deepEqual([r?.key, chosenNodes()], ["TECH_FOR_MELEE", [N("NODE_TECH_AQ_IRON_WORKING")]]);
        assert.equal(r.args[2], 35, "the Horseman");
        for (const [extra, why] of [[{ relations: { 1: "UNFRIENDLY" } }, "a war risk"], [{ wars: [2] }, "a war far away"], [{}, "at peace"]]) {
            reset({ research, canBuild: trains("UNIT_WARRIOR"), ...extra });
            steps.assessWar([]);
            steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
            assert.deepEqual(chosenNodes(), [N("NODE_TECH_AQ_POTTERY")], `${why}: the quickest`);
        }
    } finally {
        delete world.research;
    }
});

test("walls bought with all the gold only against 2+ raiders, a damaged centre or a war at our door; else from the free gold (research/24 W8)", () => {
    const centre = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y);
    const at = { x: LONDON.x, y: LONDON.y, name: "London" };
    const walls = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], Cost: 200 } : { Success: true, Plots: [] });
    const run = (threat) => steps.fortifyThreatened([threat], { budget: createBudget({ gold: 1000, reserve: 950 }), pool: "all" }).map((e) => e.key);
    reset({ canBuild: walls, canBuy: walls });
    assert.deepEqual(run({ settlement: at, count: 1, land: 1, owners: [] }), ["WALLS_QUEUED"], "game 9: 1,068 of 1,078 gold against one raider");
    reset({ canBuild: walls, canBuy: walls });
    assert.deepEqual(run({ settlement: at, count: 2, land: 2, owners: [] }), ["WALLS_BOUGHT"]);
    reset({ canBuild: walls, canBuy: walls });
    assert.deepEqual(run({ settlement: at, count: 1, land: 1, damaged: true, owners: [] }), ["WALLS_BOUGHT"], "its centre is attacked");
});

test("guards: melee units within 2 of a threatened settlement, each counted for its nearest one; ranged units and units 3+ away are not (research/24 W2)", () => {
    const a = { settlement: { x: 8, y: 8, name: "A" }, count: 2, land: 2, owners: [] };
    const b = { settlement: { x: 10, y: 8, name: "B" }, count: 2, land: 2, owners: [] };
    const u = (id, type, x, y) => ({ id: { owner: 0, id, type: 1 }, type: GameInfo.Units.lookup(type).$hash, location: { x, y } });
    assert.equal(units.guardsFor(a, [u(1, "UNIT_ARCHER", 9, 8)]), 0, "an archer holds no centre");
    assert.equal(units.guardsFor(a, [u(1, "UNIT_WARRIOR", 11, 8)]), 0, "3 tiles away");
    assert.equal(units.guardsFor(a, [u(1, "UNIT_WARRIOR", 8, 9)]), 1);
    const between = [u(1, "UNIT_WARRIOR", 9, 8)];
    assert.deepEqual([units.guardsFor(a, between, [a, b]), units.guardsFor(b, between, [a, b])], [1, 0], "one unit for one settlement");
    assert.deepEqual([units.guardsWanted({ count: 2, land: 0 }), units.guardsWanted({ count: 3, land: 2 })], [1, 2], "ships: one on the centre");
});

test("a war at our door: a defender's price stays for each threatened settlement short of melee guards; the plan buys from the rest (research/24 W3)", () => {
    const threats = [{ settlement: { x: LONDON.x, y: LONDON.y, name: "London" }, count: 2, land: 2, owners: [{ id: 1, independent: false }] }];
    reset({ wars: [1], canBuild: trains("UNIT_WARRIOR"), buyCost: (type) => (type === "UNIT_WARRIOR" ? 120 : 250) });
    steps.assessWar(threats);
    const short = steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0, threats }).budget.free();
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_WARRIOR", x: LONDON.x + 1, y: LONDON.y }];
    const guarded = steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0, threats }).budget.free();
    assert.deepEqual([guarded, guarded - short], [1000, 120]);
});

test("a war risk's conversion goal needs the town's cost and two defenders' price, and says so (research/24 G1: «held 225/1500»)", () => {
    reset({ relations: { 1: "UNFRIENDLY" }, gold: 200, goldIncome: 100 });
    steps.assessWar([]);
    const goal = steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget.goal;
    assert.deepEqual([goal?.kind, goal?.cost], ["CONVERT", 300 + 2 * 250]);
    assert.match(goal.label, /LOC_XPL_AP_GOAL_CONVERT_KEEP/);
    reset({ gold: 200, goldIncome: 100 });
    steps.assessWar([]);
    assert.equal(steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget.goal?.cost, 300, "no risk: the town's cost");
});

test("guards only near the enemy: a far conqueror calls one, for our settlement nearest to it; a risk alone one per leader; a war every settlement near it (research/24 G3; research/30 §2: game 23's ring held 14-18 of 18 settlements, six Tanks for a war that never came)", () => {
    reset({ canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    world.units = [{ id: 30, type: "UNIT_SPEARMAN", x: 8, y: 8 }];
    steps.assessWar([], { watch: [{ cls: "MILITARY", level: "DANGER", leader: 2 }] });
    steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), [], "Boston is far: the Spearman is that one guard");
    reset({ relations: { 1: "UNFRIENDLY" }, canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    world.units = [{ id: 30, type: "UNIT_SPEARMAN", x: 8, y: 8 }];
    steps.assessWar([]);
    steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), [], "Prussia, Unfriendly 10 tiles from London and York: one guard, for London: the Spearman");
    reset({ wars: [1], canBuild: trains("UNIT_WARRIOR", "UNIT_SPEARMAN") });
    world.units = [{ id: 30, type: "UNIT_SPEARMAN", x: 8, y: 8 }];
    steps.assessWar([]);
    steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), ["UNIT_SPEARMAN"], "at war with Prussia: London and York, two guards");
});

test("no savings goal the gold cannot cover before the age (here the game) ends (research/24 G2)", () => {
    try {
        reset({ gold: 0, goldIncome: 100, finalAge: true, agePoints: 99 });
        steps.assessWar([]);
        assert.equal(steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget.goal, null, "3 turns of income, 1 turn left");
        reset({ gold: 0, goldIncome: 100, finalAge: true, agePoints: 50 });
        steps.assessWar([]);
        assert.equal(steps.goldPlan(DEFAULT_SETTINGS, { reserveTurns: 0 }).budget.goal?.kind, "CONVERT");
    } finally {
        delete world.finalAge;
    }
});

test("no settler bought with a war at our door, nor where no safe site lies within reach (research/24 X7: 380 gold at E51, idle until the age ended)", () => {
    const settlerBuys = () => fake.sent.filter((s) => s.kind === "command" && unitName(s) === "UNIT_SETTLER").length;
    const sell = (type) => (type === "UNIT_SETTLER" ? { Success: true, Cost: 300 } : { Success: false });
    const sites = state.get().results.sites;
    try {
        reset({ canBuy: sell, settlementCap: 8 });
        steps.assessWar([]);
        assert.equal(steps.buySettlers(createBudget({ gold: 1000, reserve: 0 })).length, 1, "at peace: bought");
        reset({ canBuy: sell, settlementCap: 8, wars: [1] });
        steps.assessWar([]);
        assert.deepEqual([steps.buySettlers(createBudget({ gold: 1000, reserve: 0 })), settlerBuys()], [[], 0], "at war");
        // The only site has raiders on it.
        reset({ canBuy: sell, settlementCap: 8, wars: [2], enemies: [{ x: 4, y: 4, owner: 2, type: "UNIT_WARRIOR" }] });
        steps.assessWar([]);
        assert.deepEqual([steps.buySettlers(createBudget({ gold: 1000, reserve: 0 })), settlerBuys()], [[], 0], "no safe site");
    } finally {
        world.settlementCap = 8;
        state.set({ results: { ...state.get().results, sites } });
    }
});
