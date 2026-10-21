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
    players: [{ id: 0 }, { id: 2 }, { id: 5, isIndependent: true, name: "Hittites" }, { id: 6, isIndependent: true, name: "Celts" }, { id: 7, isIndependent: true, name: "Scythians" }, { id: 8, isIndependent: true, name: "Nubians" }],
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

test("a commander with a promotion takes one it can earn, a promotion before a commendation", () => {
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

test("independents are befriended nearest first, one a pass; ongoing or unaffordable ones are skipped", () => {
    reset();
    world.befriend = { 5: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE }, 6: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE }, 7: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE, ongoing: true } };
    const first = choices.befriendIndependents();
    const started = () => fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_BEFRIEND").map((s) => s.args.ID);
    // Seen in game 5: 4-6 requests in the same second, only the first ever started (the Influence paid for one).
    assert.deepEqual(started(), [5], "Hattusa is nearer than Alesia; Pazyryk already in progress; one a pass");
    assert.deepEqual(first.map((e) => e.key), ["BEFRIEND"]);
    reset();
    world.befriend[5].ongoing = true;
    choices.befriendIndependents();
    assert.deepEqual(started(), [6], "the next pass: the next one");
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
    // Walls at the front (a threatened settlement's first: game 27): the settler waits behind them.
    const monument = world.cities[0].queue;
    world.cities[0].queue = { type: "BUILDING_ANCIENT_WALLS", turns: 5 };
    reset();
    steps.frontLoadUnits({ settlers: true });
    world.cities[0].queue = monument;
    assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.args.InsertMode === CityOperationsParametersValues.MoveTo), "behind the walls");
    reset();
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", pop: 2 });
    world.settlementCap = 5; // 4 of 5: one at a time (two only below the cap less one: research/23 E3)
    steps.fillProduction(new Map(), { settlers: true });
    delete world.settlementCap;
    assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler), "4 settlements of 5: one at a time, and one is already in training (Bath trains none)");
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

// Research/35: a conversion cost 250-475 gold in game 28's Antiquity, 1,100-1,500 in Exploration, 2,500 in Modern, and the
// empire stopped at 1:1 (3 cities, 3 towns). The strategy aims at more cities while those it has are healthy (research/34 §2).
test("the strategy's city target: past 1:1 a town becomes a city while every city stands at or above zero Happiness", () => {
    world.gold = 1000;
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", pop: 1 });
    const cities = world.cities.filter((c) => c.owner === 0 && !c.isTown);
    const s = { ...DEFAULT_SETTINGS, strategy: { cityTarget: 3, goals: ["CONVERT"] } };
    try {
        reset();
        assert.equal(steps.convertTowns(s, 2)[0]?.key, "TOWN_CONVERTED", "2 cities of the 3 wanted");
        for (const c of cities) c.happy = 5;
        cities[0].happy = -2;
        reset();
        assert.deepEqual(steps.convertTowns(s, 2), [], "a city below zero: its Happiness first");
    } finally {
        world.cities.pop();
        for (const c of cities) delete c.happy;
    }
});

// Game 33: the plague crisis took London, Manchester and Bradford below zero from A59, so Бирмингем's 500 waited to the age's
// end and cost 1,500 at E31. A crisis's unhappiness ends with the age; the revolt guard buys Happiness where a revolt threatens.
test("the city target does not wait for the cities' Happiness during a crisis", () => {
    world.gold = 1000;
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", pop: 1 });
    const cities = world.cities.filter((c) => c.owner === 0 && !c.isTown);
    const towns = world.cities.filter((c) => c.owner === 0 && c.isTown);
    const player = Players.get(0);
    const s = { ...DEFAULT_SETTINGS, strategy: { cityTarget: 3, goals: ["CONVERT"] } };
    try {
        for (const c of cities) c.happy = 5;
        cities[0].happy = -2;
        for (const t of towns) t.happy = 8; // calm enough in a crisis (6 to spare)
        player.Culture = { getNumCultureSlots: (slot) => (slot === CultureSlotTypes.CRISIS_CULTURE_SLOT ? 1 : 2) };
        reset();
        assert.equal(steps.convertTowns(s, 2)[0]?.key, "TOWN_CONVERTED", "a crisis: the target goes on");
    } finally {
        world.cities.pop();
        for (const c of [...cities, ...towns]) delete c.happy;
        delete player.Culture;
    }
});

test("no town becomes a city while it is in unrest or unhappy, nor during a crisis without 6 Happiness to spare", () => {
    // Seen in game 5: a town converted while a -6 Happiness-in-cities crisis card was slotted went
    // into unrest that turn and revolted 5 turns later (it joined Maurya).
    const towns = world.cities.filter((c) => c.owner === 0 && c.isTown);
    const converted = () => fake.sent.some((s) => s.kind === "command" && s.args.Directive === OrderTypes.ORDER_TOWN_UPGRADE);
    const player = Players.get(0);
    try {
        for (const t of towns) t.happy = -1;
        reset();
        steps.convertTowns(DEFAULT_SETTINGS, 2);
        assert.equal(converted(), false, "unhappy");
        for (const t of towns) Object.assign(t, { happy: 3, unrest: true });
        reset();
        steps.convertTowns(DEFAULT_SETTINGS, 2);
        assert.equal(converted(), false, "in unrest");
        for (const t of towns) t.unrest = false;
        player.Culture = { getNumCultureSlots: (slot) => (slot === CultureSlotTypes.CRISIS_CULTURE_SLOT ? 1 : 2) };
        reset();
        steps.convertTowns(DEFAULT_SETTINGS, 2);
        assert.equal(converted(), false, "a crisis, 3 Happiness");
        for (const t of towns) t.happy = 8;
        reset();
        steps.convertTowns(DEFAULT_SETTINGS, 2);
        assert.equal(converted(), true, "a crisis, 8 Happiness");
    } finally {
        for (const t of towns) {
            delete t.happy;
            delete t.unrest;
        }
        delete player.Culture;
    }
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

test("threat: 2+ hostile military units near a settlement; befriended independents and a lone unit 3+ tiles away that our guard there matches do not count", () => {
    world.enemies = [{ x: YORK.x + 1, y: YORK.y, owner: 5 }, { x: YORK.x, y: YORK.y - 2, owner: 5 }, { x: LONDON.x + 3, y: LONDON.y, owner: 6 }];
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
    let threats = units.threatenedSettlements();
    assert.deepEqual(threats.map((t) => [t.settlement.name, t.count]), [["York", 2]], "London has only one, 3 tiles away, and a warrior of ours");
    assert.deepEqual(threats[0].owners, [{ id: 5, independent: true }]);
    world.indepRelation = { 5: IndependentRelationship.FRIENDLY };
    threats = units.threatenedSettlements();
    assert.deepEqual(threats, [], "a befriended independent is no threat");
    delete world.indepRelation;
    delete world.enemies;
    world.units = [];
});

test("threat: an independent at peace with us (NEUTRAL) is no threat; only one at war (HOSTILE)", () => {
    // Seen in game 6: a village at peace with us for 40 turns kept two towns "threatened".
    try {
        world.enemies = [{ x: YORK.x + 1, y: YORK.y, owner: 5 }, { x: YORK.x, y: YORK.y - 2, owner: 5 }];
        world.indepRelation = { 5: IndependentRelationship.NEUTRAL };
        assert.deepEqual(units.threatenedSettlements(), [], "neutral: at peace");
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        assert.deepEqual(units.threatenedSettlements().map((t) => t.settlement.name), ["York"], "hostile: at war");
    } finally {
        delete world.enemies;
        delete world.indepRelation;
    }
});

test("threat: a village's own units at home (within 2 of it) are no threat, unless next to the settlement or it is under attack", () => {
    // Seen in game 6: a crisis encampment 4 tiles from two towns kept its units at home all age and
    // never attacked; both towns were "threatened" for 20 turns (walls, soldiers, gold gone).
    try {
        world.villages = [{ owner: 5, x: YORK.x + 4, y: YORK.y }];
        world.enemies = [{ x: YORK.x + 3, y: YORK.y, owner: 5 }, { x: YORK.x + 3, y: YORK.y + 1, owner: 5 }, { x: YORK.x + 2, y: YORK.y, owner: 5 }];
        assert.deepEqual(units.threatenedSettlements(), [], "all three within 2 of their village");
        // York's centre is damaged: they are attacking.
        world.districtHealth = (x, y) => (x === YORK.x && y === YORK.y ? 70 : 100);
        assert.deepEqual(units.threatenedSettlements().map((t) => [t.settlement.name, t.count]), [["York", 3]]);
        delete world.districtHealth;
        // A village 2 tiles from York: its unit next to York counts.
        world.villages = [{ owner: 5, x: YORK.x + 2, y: YORK.y }];
        world.enemies = [{ x: YORK.x + 1, y: YORK.y, owner: 5 }];
        assert.deepEqual(units.threatenedSettlements().map((t) => [t.settlement.name, t.count]), [["York", 1]]);
        // Away from their village: raiders.
        world.villages = [{ owner: 5, x: YORK.x + 8, y: YORK.y }];
        world.enemies = [{ x: YORK.x + 3, y: YORK.y, owner: 5 }, { x: YORK.x + 3, y: YORK.y + 1, owner: 5 }];
        assert.deepEqual(units.threatenedSettlements().map((t) => [t.settlement.name, t.count]), [["York", 2]]);
    } finally {
        delete world.villages;
        delete world.enemies;
        delete world.districtHealth;
    }
});

test("threat: one hostile unit within 2 tiles, or one within 4 while the centre is damaged (seen in game 5: lone Line Infantry took three settlements)", () => {
    try {
        // A warrior of ours on London: a lone warrior 3-4 tiles away is no stronger than it.
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        world.enemies = [{ x: LONDON.x + 2, y: LONDON.y, owner: 6 }];
        assert.deepEqual(units.threatenedSettlements().map((t) => [t.settlement.name, t.count]), [["London", 1]], "2 tiles away");
        world.enemies = [{ x: LONDON.x + 4, y: LONDON.y, owner: 6 }];
        assert.deepEqual(units.threatenedSettlements(), [], "4 tiles away, centre intact");
        world.districtHealth = (x, y) => (x === LONDON.x && y === LONDON.y ? 60 : 100);
        assert.deepEqual(units.threatenedSettlements().map((t) => t.settlement.name), ["London"], "4 tiles away, centre damaged");
        world.enemies = [];
        assert.deepEqual(units.threatenedSettlements(), [], "damaged with nobody near: healing, not threatened");
    } finally {
        delete world.enemies;
        delete world.districtHealth;
        world.units = [];
    }
});

test("threat: one land raider 3-4 tiles away stronger than every guard of ours there (none: any) is a threat, and asks one guard more (research/36 §3)", () => {
    // Game 29: one independent Line Infantry at 50 took Ollantaytambo, whose centre defended at 20, in two attacks.
    try {
        world.enemies = [{ x: LONDON.x + 4, y: LONDON.y, owner: 6, type: "UNIT_SPEARMAN" }];
        let t = units.threatenedSettlements();
        assert.deepEqual(t.map((x) => [x.settlement.name, x.strong, x.strongest]), [["London", true, "UNIT_SPEARMAN"]], "no guard at all");
        assert.equal(units.guardsWanted(t[0]), 2, "one for the raider, one that can match it");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", x: LONDON.x + 1, y: LONDON.y }];
        t = units.threatenedSettlements();
        assert.deepEqual(t.map((x) => [x.settlement.name, x.strong]), [["London", true]], "a warrior (20) does not match a spearman (25)");
        world.units = [{ id: 1, type: "UNIT_SPEARMAN", x: LONDON.x + 1, y: LONDON.y }];
        assert.deepEqual(units.threatenedSettlements(), [], "a spearman of ours there does");
        world.units = [{ id: 1, type: "UNIT_SPEARMAN", x: LONDON.x + 3, y: LONDON.y + 3 }];
        assert.deepEqual(units.threatenedSettlements().map((x) => x.settlement.name), ["London"], "ours 3+ tiles from London guards nothing there");
    } finally {
        delete world.enemies;
        world.units = [];
    }
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
        // Nothing done: the game's answers go to UI.log (once a turn), so a game without walls tells why.
        const warn = console.warn;
        const lines = [];
        console.warn = (...a) => lines.push(a.join(" "));
        try {
            assert.deepEqual(steps.fortifyThreatened(york), [], "a town cannot build them");
            steps.fortifyThreatened(york);
        } finally {
            console.warn = warn;
        }
        const why = lines.filter((l) => l.includes("walls: none for York"));
        assert.equal(why.length, 1, JSON.stringify(lines));
        assert.match(why[0], /BUILDING_ANCIENT_WALLS build true\/\d+ buy/);
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

// Game 45: Экбатана's walls were queued on 74,46, where the plan's Monument had been queued ten seconds before; the Monument
// stood at 100% A50-A69 and never completed (281 of 67).
test("walls go to a tile no other order of ours takes, when the game offers one", () => {
    const WALLS = GameInfo.Constructibles.lookup("BUILDING_ANCIENT_WALLS").$hash;
    const london = world.cities[0];
    const keep = { queue: london.queue, queued: london.queued };
    const beside = GameplayMap.getIndexFromXY(LONDON.x + 1, LONDON.y);
    const below = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y + 1);
    world.canBuy = () => ({ Success: false });
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [beside, below], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    const london3 = [{ settlement: { name: "London", x: LONDON.x, y: LONDON.y }, count: 3 }];
    try {
        london.queue = { type: "BUILDING_MONUMENT", turns: 5, pct: 0, x: LONDON.x + 1, y: LONDON.y };
        london.queued = [];
        fake.sent.length = 0;
        steps.fortifyThreatened(london3);
        const walls = fake.sent.filter((s) => s.kind === "operation" && s.args.ConstructibleType === WALLS).map((s) => [s.args.X, s.args.Y]);
        assert.deepEqual(walls, [[LONDON.x, LONDON.y + 1]], "not on the Monument's tile");
    } finally {
        london.queue = keep.queue;
        london.queued = keep.queued;
        delete world.canBuy;
        delete world.canBuild;
        steps.resetWonderOrders();
    }
});

test("a threatened settlement's walls go to the very front, ahead of an item with progress (the user, game 27: Ханькоу's walls waited 10 turns behind a Laboratory); not ahead of an item done this turn, nor, the centre undamaged, of a raced wonder", () => {
    const london = world.cities[0];
    const keep = { queue: london.queue, queued: london.queued };
    const results = state.get().results;
    const centre = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y);
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.canBuy = () => ({ Success: false });
    const move = (extra = {}) => {
        reset();
        steps.fortifyThreatened([{ settlement: { name: "London", x: LONDON.x, y: LONDON.y }, count: 3, land: 3, ...extra }]);
        const m = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        return m ? [m.args.QueueSourceLocation, m.args.QueueDestinationLocation] : null;
    };
    steps.resetWar();
    try {
        london.queued = ["BUILDING_ANCIENT_WALLS"];
        london.queue = { type: "BUILDING_MONUMENT", turns: 5, pct: 40 }; // more than a turn's 10 production in it
        assert.deepEqual(move(), [1, 0], "ahead of the Monument with progress");
        london.queue = { type: "BUILDING_MONUMENT", turns: 1, pct: 90 };
        assert.equal(move(), null, "the Monument is done this turn");
        // A wonder in a race (a rival seen building it) keeps the front, unless the centre is under fire.
        state.set({ results: { ...results, wonders: { rows: [{ type: "WONDER_PYRAMIDS", rivalsSeen: 1 }] } } });
        london.queue = { type: "WONDER_PYRAMIDS", turns: 8, pct: 30 };
        assert.equal(move(), null, "behind a raced wonder");
        assert.deepEqual(move({ damaged: true }), [1, 0], "the centre is damaged");
        // Rivals' turns known (omniscient): the walls' own 10 turns count. A rival 12 turns away would win; 30, no.
        state.set({ results: { ...results, wonders: { rows: [{ type: "WONDER_PYRAMIDS", rivalTurns: [12] }] } } });
        assert.equal(move(), null, "8 turns left + 10 for the walls: the rival's 12 would win");
        state.set({ results: { ...results, wonders: { rows: [{ type: "WONDER_PYRAMIDS", rivalTurns: [30] }] } } });
        assert.deepEqual(move(), [1, 0], "a rival 30 turns away: the walls first");
    } finally {
        state.set({ results });
        london.queue = keep.queue;
        london.queued = keep.queued;
        delete world.canBuild;
        delete world.canBuy;
    }
});

test("walls are bought where a wonder is queued only against a real attack, else queued (research/32 §6)", () => {
    const centre = GameplayMap.getIndexFromXY(LONDON.x, LONDON.y);
    const london = world.cities[0];
    const keep = london.queued;
    world.canBuy = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], Cost: 120 } : { Success: false });
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    const keys = (extra) => {
        reset();
        return steps.fortifyThreatened([{ settlement: { name: "London", x: LONDON.x, y: LONDON.y }, count: 1, land: 1, ...extra }]).map((e) => e.key);
    };
    steps.resetWar();
    try {
        london.queued = ["WONDER_PYRAMIDS"];
        assert.deepEqual(keys(), ["WALLS_QUEUED"], "one raider: queued");
        assert.deepEqual(keys({ damaged: true }), ["WALLS_BOUGHT"], "the centre damaged: bought");
        london.queued = keep;
        assert.deepEqual(keys(), ["WALLS_BOUGHT"], "no wonder: bought");
    } finally {
        london.queued = keep;
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
    assert.deepEqual(fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_BEFRIEND").map((s) => s.args.ID), [6], "the threatening one first, though farther (one a pass)");
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
    // Offered but unusable (its village unseen: no viable target): approached too (research/23 E5: a camp raided
    // game 8's capital 40 turns, never befriended nor approached).
    reset();
    world.befriend = { 6: { status: DiplomacyProjectStatus.PROJECT_NO_VIABLE_TARGETS } };
    choices.befriendIndependents(threats);
    assert.deepEqual(choices.unbefriendable(), [6], "no viable target");
    reset();
    world.befriend = { 6: { status: DiplomacyProjectStatus.PROJECT_NOT_ENOUGH_INFLUENCE } };
    choices.befriendIndependents(threats);
    assert.deepEqual(choices.unbefriendable(), [], "short of Influence: it waits, no unit sent");
    delete world.befriend;
});

test("befriending: a village counts by its own tile (it is not a city), those at war with us before nearer neutral ones", () => {
    reset();
    // The Nubians have only a village (no city), 2 tiles from London: before, their distance was
    // unknown (from their cities: none) and they came last.
    world.villages = [{ owner: 8, x: LONDON.x + 1, y: LONDON.y + 2 }];
    world.indepRelation = { 5: IndependentRelationship.NEUTRAL, 6: IndependentRelationship.NEUTRAL, 7: IndependentRelationship.NEUTRAL, 8: IndependentRelationship.NEUTRAL };
    world.befriend = { 5: { status: 0 }, 6: { status: 0 }, 8: { status: 0 } };
    const started = () => fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_BEFRIEND").map((s) => s.args.ID);
    try {
        choices.befriendIndependents([]);
        assert.deepEqual(started(), [8], "the village next to London first");
        // At war with us (hostile): before nearer neutral ones.
        reset();
        world.indepRelation[6] = IndependentRelationship.HOSTILE;
        choices.befriendIndependents([]);
        assert.deepEqual(started(), [6], "the hostile one, though farthest");
        // The first one in order cannot be afforded yet: the Influence is kept for it, nothing else starts.
        reset();
        world.befriend[6].status = DiplomacyProjectStatus.PROJECT_NOT_ENOUGH_INFLUENCE;
        choices.befriendIndependents([]);
        assert.deepEqual(started(), [], "saving for the hostile one");
    } finally {
        delete world.villages;
        delete world.indepRelation;
        delete world.befriend;
    }
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

test("a unit walks toward a village too (an independent with no city)", () => {
    reset();
    const village = { owner: 8, x: 16, y: 8 };
    world.villages = [village];
    world.units = [{ id: 30, type: "UNIT_WARRIOR", ...LONDON }, { id: 31, type: "UNIT_WARRIOR", x: 9, y: 9 }];
    try {
        const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, approach: [8] });
        const to = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
        assert.ok(to, JSON.stringify(r.entries));
        assert.equal(GameplayMap.getPlotDistance(to.X, to.Y, village.x, village.y), 2);
    } finally {
        delete world.villages;
        world.units = [];
    }
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

test("under threat the nearest city trains its strongest melee unit first, even with a busy queue", () => {
    reset();
    const threats = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 3, owners: [{ id: 5, independent: true }] }];
    const out = steps.fillProduction(new Map(), { threats });
    const unit = fake.sent.find((s) => s.kind === "operation" && s.args.UnitType !== undefined);
    const def = GameInfo.Units.lookup(unit?.args.UnitType);
    assert.equal(def?.CoreClass, "CORE_CLASS_MILITARY", JSON.stringify(out));
    const melee = Array.from(GameInfo.Units, (u) => u).filter((u) => u.CanTrain !== "false" && u.CanTrain !== false).map((u) => steps.meleeStrength(u));
    assert.equal(steps.meleeStrength(def), Math.max(...melee), "the strongest melee unit (the centres' defence follows it)");
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

// Game 42: the growth step placed citizens on Гордион's 32,36 while Battersea was "in production" there, and it never completed
// (one order per tile). A queued wonder's tile is the last resort, never the first (a new citizen holds the turn until placed).
test("a new citizen goes elsewhere than a tile a wonder of ours is queued on; there only when nothing else is offered", () => {
    reset();
    const london = world.cities.find((c) => c.name === "London");
    london.readyToGrow = true;
    const a = GameplayMap.getIndexFromXY(9, 8), b = GameplayMap.getIndexFromXY(7, 8);
    world.expand = () => ({ Success: true, Plots: [a, b], ConstructibleTypes: [] });
    world.workers = () => [];
    const placed = () => fake.sent.filter((s) => s.op === CityCommandTypes.EXPAND).map((s) => [s.args.X, s.args.Y]);
    try {
        steps.placeGrowth(DEFAULT_SETTINGS);
        const first = placed()[0];
        assert.ok(first, "a tile");
        london.queued = [{ type: "WONDER_PYRAMIDS", x: first[0], y: first[1] }];
        london.readyToGrow = true; // the fake takes the citizen placed
        fake.sent.length = 0;
        steps.placeGrowth(DEFAULT_SETTINGS);
        assert.equal(placed().length, 1);
        assert.notDeepEqual(placed()[0], first, "not under the wonder");
        world.expand = () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(first[0], first[1])], ConstructibleTypes: [] });
        london.readyToGrow = true;
        fake.sent.length = 0;
        steps.placeGrowth(DEFAULT_SETTINGS);
        assert.deepEqual(placed(), [first], "the only tile offered");
    } finally {
        delete london.readyToGrow;
        delete london.queued;
        delete world.expand;
        delete world.workers;
    }
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
    // Gold income below zero (each upgrade adds upkeep): only the threatened settlement's unit.
    const income = world.goldIncome;
    world.goldIncome = -5;
    reset();
    units.upgradeUnits(100, threats);
    assert.deepEqual(fake.sent.filter((s) => s.op === "UNITCOMMAND_UPGRADE").map((s) => s.id.id), [91]);
    world.goldIncome = income;
    delete world.unitCommandOk;
    world.units = [];
});

test("upgrades are counted in the pass's gold: no more than the free gold covers (the game gives no price; the unit's purchase price stands in)", () => {
    reset();
    world.units = [90, 91, 92].map((id, i) => ({ id, type: "UNIT_WARRIOR", x: 2 + i, y: 2, activity: UnitActivityTypes.SLEEP }));
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_UPGRADE";
    GameInfo.UnitUpgrades = [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }];
    world.gold = 600; // 500 above the 100 kept: two upgrades at 250
    try {
        units.upgradeUnits(100, []);
        assert.equal(fake.sent.filter((s) => s.op === "UNITCOMMAND_UPGRADE").length, 2);
    } finally {
        world.gold = 1000;
        delete world.unitCommandOk;
        world.units = [];
    }
});

test("the strategy's upgrades: only units near a threatened settlement; none in the age's last turns (research/21 E4)", () => {
    reset();
    world.units = [
        { id: 90, type: "UNIT_WARRIOR", x: 2, y: 2, activity: UnitActivityTypes.SLEEP },
        { id: 91, type: "UNIT_WARRIOR", x: YORK.x, y: YORK.y + 1, activity: UnitActivityTypes.SLEEP },
    ];
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_UPGRADE";
    GameInfo.UnitUpgrades = [{ Unit: "UNIT_WARRIOR", UpgradeUnit: "UNIT_SPEARMAN" }];
    const threats = [{ settlement: { name: "York", x: YORK.x, y: YORK.y }, count: 2, owners: [] }];
    const ids = () => fake.sent.filter((s) => s.op === "UNITCOMMAND_UPGRADE").map((s) => s.id.id);
    try {
        units.upgradeUnits(100, threats, { mode: "THREAT" });
        assert.deepEqual(ids(), [91], "York's only");
        reset();
        units.upgradeUnits(100, threats, { mode: "ANY", ageEnding: true });
        assert.deepEqual(ids(), [], "the age is ending");
    } finally {
        delete world.unitCommandOk;
        world.units = [];
    }
});

test("the final age (the strategy's Commit): no settler is trained", () => {
    reset();
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    const out = steps.fillProduction(new Map(), { settlers: true, trainSettlers: false });
    assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler), JSON.stringify(out));
    reset();
    steps.fillProduction(new Map(), { settlers: true });
    assert.ok(fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler), "without a strategy: trained as before");
});

test("the final age's last 8 turns: no settler is trained, it could not walk and found in time (research/24 F3: game 9, one at M67 of 70)", () => {
    reset();
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    try {
        world.finalAge = true;
        world.agePoints = 95; // about 6 turns left
        steps.fillProduction(new Map(), { settlers: true });
        assert.ok(!fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler));
        reset();
        world.agePoints = 50;
        steps.fillProduction(new Map(), { settlers: true });
        assert.ok(fake.sent.some((s) => s.kind === "operation" && s.args.UnitType === settler), "half way through: trained");
    } finally {
        delete world.finalAge;
        delete world.agePoints;
    }
});

test("a refused open borders request waits 10 turns before it is asked again (research/21 G2)", () => {
    reset();
    world.openBorders = { 6: { status: 0 } };
    const asked = () => fake.sent.filter((s) => s.op === "DIPLOMACY_ACTION_OPEN_BORDERS").length;
    const turn = Game.turn;
    try {
        choices.proposeOpenBorders([6]);
        assert.equal(asked(), 1);
        reset();
        Game.turn = turn + 1;
        choices.proposeOpenBorders([6]);
        assert.equal(asked(), 0, "refused (nothing pending): not again the next turn");
        Game.turn = turn + 10;
        choices.proposeOpenBorders([6]);
        assert.equal(asked(), 1, "10 turns later");
    } finally {
        Game.turn = turn;
        delete world.openBorders;
    }
});

test("a town the towns step just gave a Focus is not 'considered' again in the same pass (research/22 B6)", () => {
    reset();
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_TOWN_PROJECT", target: { owner: 0, id: 2 } }];
    try {
        assert.deepEqual(choices.considerTownProjects(new Set(["0:2"])), []);
        assert.ok(!fake.sent.some((s) => s.op === CityOperationTypes.CONSIDER_TOWN_PROJECT));
        assert.equal(choices.considerTownProjects()[0]?.key, "TOWN_KEEPS_GROWING", "no Focus set: considered as before");
    } finally {
        delete world.notifications;
    }
});

test("an independent is named as its flag names it (its own village name), else by its player (research/24: «деревни» in every line)", () => {
    reset();
    world.befriend = { 5: { status: DiplomacyProjectStatus.PROJECT_AVAILABLE } };
    world.indepNames = { 5: "LOC_INDEPENDENT_HITTITE_VILLAGE" };
    try {
        assert.equal(choices.befriendIndependents()[0]?.args[0], "LOC_INDEPENDENT_HITTITE_VILLAGE");
        reset();
        delete world.indepNames;
        assert.equal(choices.befriendIndependents()[0]?.args[0], "Hittites");
    } finally {
        delete world.befriend;
        delete world.indepNames;
    }
});

test("at peace again, the guards the autopilot queued and not started are dropped from the queues (research/24: leftover defenders built after the peace)", () => {
    reset();
    const london = world.cities[0];
    const RemoveAt = CityOperationsParametersValues.RemoveAt;
    const removed = () => fake.sent.filter((s) => s.args.InsertMode === RemoveAt).map((s) => s.args.QueueLocation);
    const keep = { canBuild: world.canBuild, queue: london.queue, queued: london.queued };
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "UNIT_SPEARMAN" ? { Success: true } : { Success: false, Plots: [] });
    try {
        steps.resetWar();
        world.units = [];
        world.relations = { 2: "UNFRIENDLY" };
        world.cities.push({ owner: 2, x: 13, y: 8, name: "Babylon" }); // seen (x < 14), 5 tiles from London
        assert.deepEqual(steps.assessWar([]).risk, [2]);
        const first = steps.fillProduction(new Map(), { defend: true });
        assert.ok(first.some((e) => e.key === "QUEUED_GUARD"), JSON.stringify(first));
        // Next turn the risk is gone; the guard waits behind the Monument.
        london.queued = ["UNIT_SPEARMAN"];
        delete world.relations;
        world.cities.pop();
        reset();
        steps.assessWar([]);
        steps.fillProduction(new Map(), { defend: true });
        assert.deepEqual(removed(), [1]);
    } finally {
        world.canBuild = keep.canBuild;
        london.queue = keep.queue;
        london.queued = keep.queued;
        delete world.relations;
        steps.resetWar();
    }
});

test("a trait that gives two settlers for one (Carthage's colonists): a queued settler counts twice, so no second one is trained (game 21: six settlers walked toward two places)", () => {
    reset();
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    const me = Players.get(0);
    const civ = me.civilizationType;
    const names = ["CivilizationTraits", "TraitModifiers", "Modifiers", "DynamicModifiers", "ModifierArguments"];
    const tables = Object.fromEntries(names.map((t) => [t, GameInfo[t]]));
    world.cities.push({ owner: 0, x: 2, y: 2, name: "Bath", pop: 2 });
    world.cities[0].trains = "UNIT_SETTLER";
    world.settlementCap = 8; // 4 of 8: two wanted
    const trained = () => {
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { settlers: true });
        return fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === settler).length;
    };
    try {
        assert.equal(steps.settlerCopies(), 1);
        assert.equal(trained(), 1, "one in London's queue, Bath trains the second");
        me.civilizationType = GameInfo.Civilizations.lookup("CIVILIZATION_ROME").$hash;
        GameInfo.CivilizationTraits = [{ CivilizationType: "CIVILIZATION_ROME", TraitType: "TRAIT_TEST_COLONISTS" }];
        GameInfo.TraitModifiers = [{ TraitType: "TRAIT_TEST_COLONISTS", ModifierId: "MOD_TEST_DOUBLE_COLONISTS" }];
        GameInfo.Modifiers = [{ ModifierId: "MOD_TEST_DOUBLE_COLONISTS", ModifierType: "MT_TEST_DOUBLE_COLONISTS" }];
        GameInfo.DynamicModifiers = [{ ModifierType: "MT_TEST_DOUBLE_COLONISTS", EffectType: "EFFECT_PLAYER_ADJUST_UNIT_EXTRA_COPY" }];
        GameInfo.ModifierArguments = [
            { ModifierId: "MOD_TEST_DOUBLE_COLONISTS", Name: "Tag", Value: "UNIT_CLASS_CREATE_TOWN" },
            { ModifierId: "MOD_TEST_DOUBLE_COLONISTS", Name: "Amount", Value: "1" },
            { ModifierId: "MOD_TEST_DOUBLE_COLONISTS", Name: "PurchaseValid", Value: "true" },
        ];
        assert.equal(steps.settlerCopies(), 2);
        assert.equal(trained(), 0, "London's one gives two");
    } finally {
        me.civilizationType = civ;
        for (const t of names) GameInfo[t] = tables[t];
        world.cities.pop();
        delete world.cities[0].trains;
        delete world.settlementCap;
    }
});
