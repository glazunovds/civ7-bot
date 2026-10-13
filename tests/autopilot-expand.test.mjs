// Autopilot expansion and the turn-holders seen at turn 51: a commander's promotion,
// befriending independents, settlers into busy queues (moved to the front), settling 1 city
// to 1 town (site roles, then converting a town), military exploring with one garrison per
// city, and a town's new citizens on tiles that suit its future Focus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const near = (c, r) => (x, y) => Math.abs(x - c.x) <= r && Math.abs(y - c.y) <= r;
const world = {
    width: 30, height: 20, wrapX: false,
    // Our land around London; far columns still unexplored.
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: near(LONDON, 2)(x, y) ? 0 : -1, revealed: x < 14 }),
    structures: (x, y) => (x === LONDON.x && y === LONDON.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 2 }, { id: 5, isIndependent: true, name: "Hittites" }, { id: 6, isIndependent: true, name: "Celts" }, { id: 7, isIndependent: true, name: "Scythians" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10, queue: { type: "BUILDING_MONUMENT", turns: 5 } },
        { owner: 0, x: 4, y: 14, name: "Leeds", isTown: true, pop: 4 },
        { owner: 0, x: 12, y: 14, name: "York", isTown: true, pop: 3 },
        { owner: 5, x: 13, y: 4, name: "Hattusa" },
        { owner: 6, x: 27, y: 18, name: "Alesia" },
        { owner: 7, x: 20, y: 9, name: "Pazyryk" },
    ],
    gold: 1000,
    goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { growthAdvice } = await import("../mod/expansion-planner/ui/data/xpl-growth-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const reset = () => {
    fake.sent.length = 0;
    units.resetUnitGoals();
};
// A new turn: requests cleared, the units' goals (and losses) kept.
const reset0 = () => {
    fake.sent.length = 0;
};

test("a commander with a promotion takes the first one it can earn (not a commendation)", () => {
    reset();
    GameInfo.UnitPromotionClassSets = [{ PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISC_BASTION" }];
    GameInfo.UnitPromotionDisciplineDetails = [
        { UnitPromotionDisciplineType: "DISC_BASTION", UnitPromotionType: "PROMO_COMMENDATION" },
        { UnitPromotionDisciplineType: "DISC_BASTION", UnitPromotionType: "PROMO_STEADFAST" },
        { UnitPromotionDisciplineType: "DISC_BASTION", UnitPromotionType: "PROMO_TURTLE" },
    ];
    const promos = { PROMO_COMMENDATION: { Name: "C", Commendation: true }, PROMO_STEADFAST: { Name: "Steadfast" }, PROMO_TURTLE: { Name: "Turtle" } };
    GameInfo.UnitPromotions = { lookup: (t) => promos[t] ?? null };
    world.units = [{ id: 1, type: "UNIT_ARMY_COMMANDER", ...LONDON, promotions: { can: true, has: ["PROMO_STEADFAST"], earnable: ["PROMO_COMMENDATION", "PROMO_STEADFAST", "PROMO_TURTLE"] } }];
    world.unitCommandOk = (_id, op) => op === UnitCommandTypes.PROMOTE;
    const out = units.promoteUnits();
    delete world.unitCommandOk;
    const cmd = fake.sent.find((s) => s.op === UnitCommandTypes.PROMOTE);
    assert.equal(cmd?.args.PromotionType, Database.makeHash("PROMO_TURTLE"));
    assert.equal(cmd?.args.PromotionDisciplineType, Database.makeHash("DISC_BASTION"));
    assert.equal(out[0].key, "PROMOTED");
    world.units[0].promotions.can = false;
    reset();
    assert.deepEqual(units.promoteUnits(), [], "no points: nothing");
});

test("independents are befriended nearest first; ongoing or unaffordable ones are skipped", () => {
    reset();
    world.befriend = { 5: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE }, 6: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE }, 7: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE, ongoing: true } };
    const first = choices.befriendIndependents();
    const started = () => fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_BEFRIEND").map((s) => s.args.ID);
    assert.deepEqual(started(), [5, 6], "Hattusa is nearer than Alesia; Pazyryk already in progress");
    assert.deepEqual(first.map((e) => e.key), ["BEFRIEND", "BEFRIEND"]);
    reset();
    world.befriend = { 5: { status: DiplomacyProjectStatus.PROJECT_NOT_ENOUGH_INFLUENCE } };
    choices.befriendIndependents();
    assert.deepEqual(started(), [], "not enough influence");
    delete world.befriend;
});

test("military explores toward the fog; the first unit in each city stays as its garrison", () => {
    reset();
    world.units = [
        { id: 10, type: "UNIT_WARRIOR", ...LONDON, activity: UnitActivityTypes.SLEEP },
        { id: 11, type: "UNIT_WARRIOR", ...LONDON, activity: UnitActivityTypes.SLEEP },
        { id: 12, type: "UNIT_WARRIOR", x: 10, y: 10 },
        { id: 13, type: "UNIT_WARRIOR", x: 11, y: 9, damage: 40 },
    ];
    // The game does not let warriors explore automatically.
    world.unitCanStart = (_id, op) => (op === "UNITOPERATION_AUTOMATE_EXPLORE" ? { Success: false } : undefined);
    const r = units.commandUnits(DEFAULT_SETTINGS, { roam: true, defend: true, random: () => 0 });
    delete world.unitCanStart;
    const moves = fake.sent.filter((s) => s.op === UnitOperationTypes.MOVE_TO);
    const mover = (id) => moves.find((s) => s.id.id === id)?.args;
    assert.equal(mover(10), undefined, "the garrison stays");
    for (const id of [11, 12]) {
        const to = mover(id);
        assert.ok(to, `unit ${id} roams (a fortified one is woken): ${JSON.stringify(r.entries)}`);
        assert.equal(to.X, 13, "to the last explored column, next to the fog");
    }
    assert.notEqual(mover(11).Y === mover(12).Y && mover(11).X === mover(12).X, true, "not both to the same tile");
    assert.ok(!mover(13), "the hurt one heals instead");
    assert.ok(fake.sent.some((s) => s.id?.id === 13 && s.op === "UNITOPERATION_REST_UNTIL_HEALED"));
    world.units = [];
});

test("settlers keep cities and towns 1 to 1: the role we lack first", () => {
    reset();
    // 1 city, 2 towns: the next site should be a city site, then (one walking there) a town site.
    state.set({ results: { ...state.get().results, sites: { picks: [
        { x: 7, y: 11, rank: 1, role: "TOWN" }, // 5+ tiles from every foreign settlement
        { x: 4, y: 4, rank: 2, role: "CITY" },
        { x: 13, y: 11, rank: 3, role: "TOWN" },
    ] } } });
    world.units = [{ id: 20, type: "UNIT_SETTLER", ...LONDON }];
    units.commandUnits(DEFAULT_SETTINGS, { settlers: true });
    let to = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.deepEqual([to?.X, to?.Y], [4, 4], "the best CITY site, though a TOWN site ranks higher");
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", isTown: false, pop: 1 }); // 2 cities, 2 towns, + the city site walked to
    fake.sent.length = 0;
    world.units.push({ id: 21, type: "UNIT_SETTLER", x: 9, y: 8 });
    world.units[0].activity = UnitActivityTypes.OPERATION;
    units.commandUnits(DEFAULT_SETTINGS, { settlers: true });
    to = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.deepEqual([to?.X, to?.Y], [7, 11], "now a TOWN site");
    world.cities.pop();
    world.units = [];
});

test("settlers go into the biggest city even with a busy queue, then to the front", () => {
    reset();
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    const out = steps.fillProduction(new Map(), { settlers: true });
    const build = fake.sent.find((s) => s.kind === "operation" && s.args.UnitType === settler);
    assert.equal(build?.id.id, 0, `London (busy with a Monument) trains it: ${JSON.stringify(out)}`);
    assert.ok(out.some((e) => e.key === "QUEUED_SETTLER"));
    // Next turn it is in the queue behind the Monument: moved to the front.
    world.cities[0].trains = "UNIT_SETTLER";
    reset();
    const front = steps.frontLoadUnits({ settlers: true });
    const move = fake.sent.find((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [1, 0]);
    assert.equal(front[0].key, "FRONT_LOADED");
    reset();
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", pop: 2 });
    world.settlementCap = 8;
    steps.fillProduction(new Map(), { settlers: true });
    delete world.settlementCap;
    assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler), "4 settlements: one at a time, and one is already in training (Bath trains none)");
    world.cities.pop();
    delete world.cities[0].trains;
});

test("while towns outnumber cities, the best town becomes a city when gold above the reserve allows", () => {
    reset();
    const out = steps.convertTowns(DEFAULT_SETTINGS, 2);
    const cmd = fake.sent.find((s) => s.kind === "command" && s.args.Directive === OrderTypes.ORDER_TOWN_UPGRADE);
    assert.ok(cmd, JSON.stringify(out));
    assert.equal(out[0].key, "TOWN_CONVERTED");
    reset();
    world.gold = 300 + 2 * 10 - 1; // the 300 conversion would cut into 2 turns of income
    assert.deepEqual(steps.convertTowns(DEFAULT_SETTINGS, 2), []);
    // A late, big income: the reserve is at most 1000 gold, not 2 × 5000.
    const income = world.goldIncome;
    world.goldIncome = 5000;
    world.gold = 1300;
    reset();
    assert.equal(steps.convertTowns(DEFAULT_SETTINGS, 2)[0]?.key, "TOWN_CONVERTED");
    world.goldIncome = income;
    world.gold = 1000;
    reset();
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", pop: 1 });
    assert.deepEqual(steps.convertTowns(DEFAULT_SETTINGS, 2), [], "2 cities, 2 towns: balanced");
    world.cities.pop();
});

test("a town that will farm puts new citizens on tiles that get a farm", () => {
    const farm = GameplayMap.getIndexFromXY(5, 14);
    const mine = GameplayMap.getIndexFromXY(3, 14);
    world.expand = () => ({ Success: true, Plots: [mine, farm], ConstructibleTypes: [GameInfo.Constructibles.lookup("IMPROVEMENT_MINE")?.$hash, GameInfo.Constructibles.lookup("IMPROVEMENT_FARM")?.$hash] });
    const leedsId = Players.get(0).Cities.getCities().find((c) => c.name === "Leeds").id;
    const plain = growthAdvice(leedsId, DEFAULT_SETTINGS);
    const farming = growthAdvice(leedsId, DEFAULT_SETTINGS, { focusKind: "FARM" });
    const mining = growthAdvice(leedsId, DEFAULT_SETTINGS, { focusKind: "MINE" });
    assert.equal(plain.expand[0].score, plain.expand[1].score, "same yields: a tie without a Focus");
    assert.equal(farming.best.idx, farm);
    assert.equal(mining.best.idx, mine);
    delete world.expand;
});

// ---- threats (towns lost to independents' units), open borders, town projects ----

const YORK = { x: 12, y: 14 };
const hattusa = { x: 13, y: 4 };

test("threat: 2+ hostile military units near a settlement; befriended independents and lone units do not count", () => {
    world.enemies = [{ x: YORK.x + 1, y: YORK.y, owner: 5 }, { x: YORK.x, y: YORK.y - 2, owner: 5 }, { x: LONDON.x + 2, y: LONDON.y, owner: 6 }];
    let threats = units.threatenedSettlements();
    assert.deepEqual(threats.map((t) => [t.settlement.name, t.count]), [["York", 2]], "London has only one");
    assert.deepEqual(threats[0].owners, [{ id: 5, independent: true }]);
    world.indepRelation = { 5: IndependentRelationship.FRIENDLY };
    threats = units.threatenedSettlements();
    assert.deepEqual(threats, [], "a befriended independent is no threat");
    delete world.indepRelation;
    delete world.enemies;
});

test("under threat: walls on the settlement's centre, bought when the gold covers them, else queued first (a town only buys)", () => {
    const WALLS = GameInfo.Constructibles.lookup("BUILDING_ANCIENT_WALLS").$hash;
    const centre = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y);
    const beside = GameplayMap.getIndexFromXY(LONDON.x + 1, LONDON.y);
    let cost = 120;
    world.canBuy = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [beside, centre], Cost: cost } : { Success: false });
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [beside, centre], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    const london = [{ settlement: { name: "London", x: LONDON.x, y: LONDON.y }, count: 3 }];
    const york = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 3 }];
    const sent = (kind) => fake.sent.filter((s) => s.kind === kind && s.args.ConstructibleType === WALLS).map((s) => [s.id.id, s.args.X, s.args.Y]);
    try {
        reset();
        let out = steps.fortifyThreatened(london);
        assert.deepEqual(sent("command"), [[0, LONDON.x, LONDON.y]], "bought, on the centre");
        assert.equal(out[0].key, "WALLS_BOUGHT");
        cost = 5000; // more than the gold
        reset();
        out = steps.fortifyThreatened(london);
        assert.deepEqual([sent("command"), sent("operation")], [[], [[0, LONDON.x, LONDON.y]]], "queued instead");
        assert.equal(out[0].key, "WALLS_QUEUED");
        reset();
        assert.deepEqual(steps.fortifyThreatened(york), [], "a town cannot build them");
        // Already queued behind the Monument: moved first, not queued again.
        world.cities[0].queued = ["BUILDING_ANCIENT_WALLS"];
        reset();
        steps.fortifyThreatened(london);
        const move = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([sent("operation"), move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [[], 1, 0]);
    } finally {
        delete world.cities[0].queued;
        delete world.canBuy;
        delete world.canBuild;
    }
});

test("the pass: raiders near London: walls bought there", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const WALLS = GameInfo.Constructibles.lookup("BUILDING_ANCIENT_WALLS").$hash;
    const centre = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y);
    world.canBuy = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], Cost: 120 } : { Success: false });
    world.enemies = [{ x: LONDON.x + 2, y: LONDON.y, owner: 5 }, { x: LONDON.x, y: LONDON.y - 2, owner: 5 }];
    settings.patch({ autopilot: { replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false } });
    try {
        reset();
        await autopilot.runTurn(true);
        assert.ok(fake.sent.some((s) => s.kind === "command" && s.args.ConstructibleType === WALLS), JSON.stringify((state.get().autopilot.log ?? []).map((e) => e.key)));
    } finally {
        delete world.canBuy;
        delete world.enemies;
        settings.patch({ autopilot: { research: true, choices: true, befriend: true, growth: true, towns: true } });
    }
});

test("under threat: befriending that independent first, more Influence if already under way; not offered: listed for a visit", () => {
    reset();
    const threats = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 2, owners: [{ id: 6, independent: true }] }];
    world.befriend = { 5: { status: 0 }, 6: { status: 0 } };
    choices.befriendIndependents(threats);
    assert.deepEqual(fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_BEFRIEND").map((s) => s.args.ID), [6, 5], "the threatening one first, though farther");
    reset();
    world.befriend = { 6: { status: 0, ongoing: true } };
    const out = choices.befriendIndependents(threats);
    const support = fake.sent.find((s) => s.op === PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION);
    assert.deepEqual(support?.args, { ID: 906, Type: DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true });
    assert.ok(out.some((e) => e.key === "BEFRIEND_SUPPORT"));
    reset();
    world.befriend = {};
    choices.befriendIndependents(threats);
    assert.deepEqual(choices.unbefriendable(), [6], "the game offers nothing for it (not met yet)");
    delete world.befriend;
});

test("a unit walks toward an independent we cannot befriend yet, stopping 2 tiles from its settlement; the garrison stays", () => {
    reset();
    world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, { id: 31, type: "UNIT_WARRIOR", x: 9, y: 9 }];
    const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] });
    const to = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.equal(fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.id.id, 31, JSON.stringify(r.entries));
    assert.equal(GameplayMap.getPlotDistance(to.X, to.Y, hattusa.x, hattusa.y), 2);
    assert.ok(r.entries.some((e) => e.key === "APPROACH"));
    // A unit already next to its settlement never steps onto it (that would be an attack).
    reset();
    world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, { id: 32, type: "UNIT_WARRIOR", x: hattusa.x - 1, y: hattusa.y }];
    units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] });
    const close = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.equal(GameplayMap.getPlotDistance(close.X, close.Y, hattusa.x, hattusa.y), 2, JSON.stringify(close));
    world.units = [];
});

test("visits to an independent: one unit at a time; after two died on the way, none for a while", () => {
    reset();
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), revealed: true });
    const walking = (u) => ({ ...u, activity: UnitActivityTypes.OPERATION, moved: true });
    const approaches = (r) => r.entries.filter((e) => e.key === "APPROACH" || e.key === "DETOUR").length;
    try {
        world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, { id: 31, type: "UNIT_WARRIOR", x: 9, y: 9 }];
        assert.equal(approaches(units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] })), 1);
        // 31 is on its way: another soldier is not sent.
        reset0();
        world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, walking({ id: 31, type: "UNIT_WARRIOR", x: 10, y: 8 }), { id: 32, type: "UNIT_WARRIOR", x: 9, y: 9 }];
        assert.equal(approaches(units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] })), 0);
        // 31 died (at 10,8): 32, coming from London, goes (around that spot).
        reset0();
        world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, { id: 32, type: "UNIT_WARRIOR", x: 6, y: 8 }];
        assert.equal(approaches(units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] })), 1);
        reset0();
        world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, walking({ id: 32, type: "UNIT_WARRIOR", x: 10, y: 8 })];
        units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] });
        // 32 died too: nobody else for now.
        reset0();
        world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, { id: 33, type: "UNIT_WARRIOR", x: 6, y: 8 }]; // where 32 could go from
        assert.equal(approaches(units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [5] })), 0);
    } finally {
        world.tiles = tiles;
        world.units = [];
    }
});

test("under threat the nearest city trains its strongest military unit first, even with a busy queue", () => {
    reset();
    const threats = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 3, owners: [{ id: 5, independent: true }] }];
    const out = steps.fillProduction(new Map(), { threats });
    const unit = fake.sent.find((s) => s.kind === "operation" && s.args.UnitType !== undefined);
    const def = GameInfo.Units.lookup(unit?.args.UnitType);
    assert.equal(def?.CoreClass, "CORE_CLASS_MILITARY", JSON.stringify(out));
    const tiers = Array.from(GameInfo.Units, (u) => u).filter((u) => u.CoreClass === "CORE_CLASS_MILITARY" && u.Domain === "DOMAIN_LAND").map((u) => Number(u.Tier) || 0);
    assert.equal(Number(def.Tier) || 0, Math.max(...tiers), "the highest tier");
    assert.ok(out.some((e) => e.key === "QUEUED_DEFENDER"));
});

test("defenders: none once the threatened settlement has as many of our soldiers around it (or walking there) as hostile units, nor past 4 per settlement", () => {
    const threats = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 2, owners: [] }];
    const trained = () => fake.sent.some((s) => s.kind === "operation" && GameInfo.Units.lookup(s.args.UnitType)?.CoreClass === "CORE_CLASS_MILITARY");
    const SLEEP = UnitActivityTypes.SLEEP;
    reset();
    world.units = [{ id: 40, type: "UNIT_WARRIOR", x: YORK.x + 1, y: YORK.y, activity: SLEEP }, { id: 41, type: "UNIT_WARRIOR", ...LONDON, activity: SLEEP }];
    steps.fillProduction(new Map(), { threats });
    assert.ok(trained(), "York has one of two");
    // A soldier from London sets off for York: enough now.
    reset();
    world.units.push({ id: 42, type: "UNIT_WARRIOR", x: 9, y: 9 });
    const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats });
    assert.ok(r.entries.some((e) => e.key === "REINFORCE"), JSON.stringify(r.entries));
    fake.sent.length = 0;
    world.units[2].activity = UnitActivityTypes.OPERATION;
    steps.fillProduction(new Map(), { threats });
    assert.ok(!trained(), "one at York, one on its way");
    // Twelve soldiers for three settlements (none near York): no more.
    reset();
    world.units = Array.from({ length: 12 }, (_, i) => ({ id: 60 + i, type: "UNIT_WARRIOR", x: 1 + (i % 6), y: 1 + Math.floor(i / 6), activity: SLEEP }));
    steps.fillProduction(new Map(), { threats });
    assert.ok(!trained(), "4 per settlement");
    world.units.pop();
    steps.fillProduction(new Map(), { threats });
    assert.ok(trained(), "one below the limit");
    world.units = [];
});

test("a town at 7 that takes no Focus is marked considered, so the turn goes on", () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_TOWN_PROJECT", target: { owner: 0, id: 2 } }];
    const out = choices.considerTownProjects();
    const op = fake.sent.find((s) => s.op === CityOperationTypes.CONSIDER_TOWN_PROJECT);
    assert.deepEqual(op?.id, { owner: 0, id: 2 });
    assert.equal(out[0].key, "TOWN_KEEPS_GROWING");
    delete world.notifications;
});

test("open borders: asked when an explorer reaches a civilization's land, not when already asked", () => {
    reset();
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), owner: x >= 11 && y <= 3 ? 2 : tiles(x, y).owner });
    world.units = [{ id: 40, type: "UNIT_SCOUT", x: 10, y: 3 }, { id: 41, type: "UNIT_WARRIOR", x: 10, y: 3 }];
    assert.deepEqual(units.leadersNearExplorers({ explore: true }), [2]);
    assert.deepEqual(units.leadersNearExplorers({}), [], "nobody exploring");
    world.openBorders = { 2: { status: 0 } };
    choices.proposeOpenBorders([2]);
    const sent = fake.sent.find((s) => s.op === "DIPLOMACY_ACTION_OPEN_BORDERS");
    assert.deepEqual(sent?.args, { Player1: 0, Player2: 2, Type: DiplomacyActionTypes.DIPLOMACY_ACTION_OPEN_BORDERS, Amount: 1 });
    reset();
    world.openBorders = { 2: { status: 0, ongoing: true } };
    assert.deepEqual(choices.proposeOpenBorders([2]), [], "already proposed");
    delete world.openBorders;
    world.tiles = tiles;
    world.units = [];
});

test("scouts: when the game's automatic exploring is not offered, they walk to the edge of the fog, further than soldiers", () => {
    reset();
    world.units = [{ id: 50, type: "UNIT_SCOUT", x: 5, y: 8 }];
    world.unitCanStart = (_id, op) => (op === "UNITOPERATION_AUTOMATE_EXPLORE" ? { Success: false } : undefined);
    const r = units.commandUnits(DEFAULT_SETTINGS, { explore: true, random: () => 0 });
    delete world.unitCanStart;
    const to = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.equal(to?.X, 13, `the fog starts at column 14, 8 tiles away: ${JSON.stringify(r.entries)}`);
    world.units = [];
});

test("discoveries: scouts go for the nearest one first, even while exploring on their own; never two for one", () => {
    reset();
    const structures = world.structures;
    const CAVE = { x: 5, y: 5 }, RUINS = { x: 3, y: 3 }, FAR = { x: 13, y: 18 };
    const at = (p) => (x, y) => x === p.x && y === p.y;
    world.structures = (x, y) => (at(CAVE)(x, y) ? { district: null, constructibles: ["IMPROVEMENT_CAVE"] }
        : at(RUINS)(x, y) ? { district: null, constructibles: ["IMPROVEMENT_RUINS"] }
        : at(FAR)(x, y) ? { district: null, constructibles: ["IMPROVEMENT_CAVE"] } : structures(x, y));
    assert.ok(GameInfo.Constructibles.lookup("IMPROVEMENT_CAVE")?.Discovery, "fixture: caves are discoveries");
    world.units = [
        { id: 60, type: "UNIT_SCOUT", x: 6, y: 6 },
        { id: 61, type: "UNIT_SCOUT", x: 6, y: 7, activity: 999 }, // exploring by itself
    ];
    const r = units.commandUnits(DEFAULT_SETTINGS, { explore: true, random: () => 0 });
    const move = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.deepEqual([move(60)?.X, move(60)?.Y], [CAVE.x, CAVE.y], JSON.stringify(r.entries));
    assert.deepEqual([move(61)?.X, move(61)?.Y], [RUINS.x, RUINS.y], "the other one takes the next discovery, not the same");
    // Next turn the first one is still on its way: a third scout does not take its cave.
    fake.sent.length = 0;
    world.units = [{ id: 60, type: "UNIT_SCOUT", x: 6, y: 6, activity: UnitActivityTypes.OPERATION, moved: true }, { id: 62, type: "UNIT_SCOUT", x: 7, y: 6 }];
    units.commandUnits(DEFAULT_SETTINGS, { explore: true, random: () => 0 });
    assert.deepEqual([move(62)?.X, move(62)?.Y], [RUINS.x, RUINS.y], "the cave is taken by the scout walking there");
    world.units.length = 0;
    world.structures = structures;
});

test("discoveries: too far (more than 4 turns) is left for later; a roaming soldier takes one near it", () => {
    reset();
    const structures = world.structures;
    // 6 tiles away over rough land (one tile a turn): 6 turns.
    const FAR = { x: 6, y: 12 };
    world.structures = (x, y) => (x === FAR.x && y === FAR.y ? { district: null, constructibles: ["IMPROVEMENT_CAVE"] } : structures(x, y));
    world.units = [{ id: 63, type: "UNIT_SCOUT", x: 6, y: 6 }];
    const path = Units.getPathTo;
    Units.getPathTo = (id, l) => {
        const r = path(id, l);
        return { plots: r.plots, turns: r.plots.map((_, i) => i + 1) };
    };
    units.commandUnits(DEFAULT_SETTINGS, { explore: true, random: () => 0 });
    Units.getPathTo = path;
    const scoutOps = fake.sent.filter((s) => s.id?.id === 63).map((s) => s.op);
    assert.deepEqual(scoutOps, ["UNITOPERATION_AUTOMATE_EXPLORE"], "6 turns away: it explores instead");
    reset();
    const NEAR = { x: 9, y: 11 };
    world.structures = (x, y) => (x === NEAR.x && y === NEAR.y ? { district: null, constructibles: ["IMPROVEMENT_RUINS"] } : structures(x, y));
    world.units = [{ id: 64, type: "UNIT_WARRIOR", ...LONDON }, { id: 65, type: "UNIT_WARRIOR", x: 9, y: 9 }];
    units.commandUnits(DEFAULT_SETTINGS, { roam: true, random: () => 0 });
    const to = fake.sent.find((s) => s.id?.id === 65 && s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.deepEqual([to?.X, to?.Y], [NEAR.x, NEAR.y]);
    world.units = [];
    world.structures = structures;
});

test("a new citizen is always placed: a town takes a tile even when a specialist looks better; a refused tile gives way to the next", () => {
    reset();
    const leeds = world.cities.find((c) => c.name === "Leeds");
    leeds.readyToGrow = true;
    const first = GameplayMap.getIndexFromXY(5, 14), second = GameplayMap.getIndexFromXY(3, 14);
    world.expand = () => ({ Success: true, Plots: [first, second], ConstructibleTypes: [] });
    // A specialist slot worth far more than any tile (the game offers none to towns in practice).
    world.workers = () => [{ PlotIndex: GameplayMap.getIndexFromXY(4, 14), IsBlocked: false, NumWorkers: 0, MaxWorkers: 2, CurrentYields: [0, 0, 0, 0, 0, 0, 0], NextYields: [0, 0, 0, 20, 0, 0, 0], CurrentMaintenance: [0, 0, 0, 0, 0, 0, 0], NextMaintenance: [0, 0, 0, 0, 0, 0, 0] }];
    const canStart = Game.CityCommands.canStart;
    Game.CityCommands.canStart = (id, op, args) => (op === CityCommandTypes.EXPAND && args?.X === 3 ? { Success: false } : canStart(id, op, args));
    const out = steps.placeGrowth(DEFAULT_SETTINGS);
    Game.CityCommands.canStart = canStart;
    const expand = fake.sent.filter((s) => s.op === CityCommandTypes.EXPAND);
    assert.deepEqual(expand.map((s) => [s.args.X, s.args.Y]), [[5, 14]], `3,14 (tried first) refused: ${JSON.stringify(out)}`);
    assert.ok(!fake.sent.some((s) => s.op === PlayerOperationTypes.ASSIGN_WORKER), "no specialist in a town");
    delete leeds.readyToGrow;
    delete world.expand;
    delete world.workers;
});

test("upgrades: military units the game allows, threatened ones first, while gold stays above the reserve", () => {
    reset();
    world.units = [
        { id: 90, type: "UNIT_WARRIOR", x: 2, y: 2, activity: UnitActivityTypes.SLEEP },
        { id: 91, type: "UNIT_WARRIOR", x: YORK.x, y: YORK.y + 1, activity: UnitActivityTypes.SLEEP }, // near York, threatened
        { id: 92, type: "UNIT_SCOUT", x: 3, y: 3 },
        { id: 93, type: "UNIT_WARRIOR", x: 4, y: 4, activity: UnitActivityTypes.OPERATION }, // walking
    ];
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_UPGRADE";
    GameInfo.UnitUpgrades = [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }];
    const threats = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 2, owners: [] }];
    const out = units.upgradeUnits(100, threats);
    const ids = fake.sent.filter((s) => s.op === "UNITCOMMAND_UPGRADE").map((s) => s.id.id);
    assert.deepEqual(ids, [91, 90], "York's warrior first; no scout, none walking");
    assert.equal(out[0].key, "UPGRADED");
    reset();
    world.gold = 100;
    assert.deepEqual(units.upgradeUnits(100, threats), [], "gold at the reserve: none");
    world.gold = 1000;
    delete world.unitCommandOk;
    world.units = [];
});
