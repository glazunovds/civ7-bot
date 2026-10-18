// Defence against independents (game 5, research/17): melee defenders (a settlement centre defends
// at the strongest melee unit trained, minus 10), defenders bought on the spot in threatened and
// exposed settlements (towns too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 12, y: 14 };
const LEEDS = { x: 4, y: 14 };
const world = {
    width: 30, height: 22, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 } }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }, { id: 6, isIndependent: true, name: "Celts" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10, queue: { type: "BUILDING_MONUMENT", turns: 5 } },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
        { owner: 0, ...LEEDS, name: "Leeds", isTown: true, pop: 3 },
    ],
    gold: 1000,
    goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const centres = await import("../mod/expansion-planner/ui/data/xpl-centre-defence.js");

const reset = () => {
    fake.sent.length = 0;
    for (const k of ["canBuild", "canBuy", "buyCost", "villages", "indepRelation", "enemies"]) delete world[k];
    world.units = [];
    world.gold = 1000;
    // The defenders bought and queued this turn (a purchase stops a defender being trained for it in the same turn).
    steps.resetWar();
    settings.remember(gameKey(), { melee: null }); // no melee unit obtained this age (research/37 §2)
};
const obtained = (type) => centres.noteMeleeObtained(GameInfo.Units.lookup(type), "trained");
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map(unitName);
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const ids = { London: 0, York: 1, Leeds: 2 };
// Only these units can be trained (BUILD); everything else as the fake allows.
const trains = (...types) => (type) => (type?.startsWith?.("UNIT_") ? { Success: types.includes(type) } : undefined);
// Only these units can be bought, at these prices.
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });

test("melee strength: from Unit_Stats; ranged and siege units have none", () => {
    const str = (t) => steps.meleeStrength(GameInfo.Units.lookup(t));
    assert.equal(str("UNIT_WARRIOR"), 20);
    assert.equal(str("UNIT_SPEARMAN"), 25);
    assert.equal(str("UNIT_ARCHER"), 0, "ranged");
    assert.equal(str("UNIT_BALLISTA"), 0, "siege");
    assert.equal(str("UNIT_SETTLER"), 0, "not military");
});

test("under threat the nearest city trains its strongest melee unit, not a ranged one of a higher tier", () => {
    // Seen in game 5: only ranged units (the highest tier) were trained after Antiquity, so our
    // centres defended at 20-30 against Line Infantry at 50.
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_ARCHER", "UNIT_SLINGER");
    const threats = [{ settlement: { name: "York", ...YORK }, count: 3, owners: [{ id: 5, independent: true }] }];
    const out = steps.fillProduction(new Map(), { threats });
    assert.deepEqual(trained(), ["UNIT_WARRIOR"], JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_DEFENDER"));
});

test("defence: one melee unit as strong as the best we can train, obtained this age (the centres' defence follows it)", () => {
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN", "UNIT_ARCHER");
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
    let out = steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), ["UNIT_SPEARMAN"], JSON.stringify(out));
    const e = out.find((x) => x.key === "QUEUED_MELEE");
    assert.equal(e?.args[2], 25, "centres would defend at the Spearman's full 25 (research/37 §2: no minus 10)");
    // One obtained this age, or one in a queue: nothing more.
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN", "UNIT_ARCHER");
    world.units = [{ id: 1, type: "UNIT_SPEARMAN", ...LONDON }];
    obtained("UNIT_SPEARMAN");
    out = steps.fillProduction(new Map(), { defend: true });
    assert.deepEqual(trained(), [], JSON.stringify(out));
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN", "UNIT_ARCHER");
    world.cities[0].queued = ["UNIT_SPEARMAN"];
    try {
        out = steps.fillProduction(new Map(), { defend: true });
        assert.ok(!out.some((x) => x.key === "QUEUED_MELEE"), JSON.stringify(out));
    } finally {
        delete world.cities[0].queued;
    }
    // Without «Оборона» nothing is trained for it.
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
    steps.fillProduction(new Map(), {});
    assert.ok(!trained().includes("UNIT_SPEARMAN"));
    // The final push in peace: a stronger one than this age's (a Warrior) is not trained (game 16: a Landship, then a
    // Tank took the capital 15 turns); under a threat: yes.
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN", "UNIT_ARCHER");
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
    obtained("UNIT_WARRIOR");
    out = steps.fillProduction(new Map(), { defend: true, strategy: { phase: "COMMIT" } });
    assert.ok(!out.some((x) => x.key === "QUEUED_MELEE"), JSON.stringify(out));
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN", "UNIT_ARCHER");
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
    obtained("UNIT_WARRIOR");
    out = steps.fillProduction(new Map(), { defend: true, strategy: { phase: "COMMIT" }, threats: [{ settlement: { name: "York", ...YORK }, count: 1, owners: [{ id: 5, independent: true }] }] });
    assert.ok(out.some((x) => x.key === "QUEUED_MELEE" || x.key === "QUEUED_DEFENDER"), JSON.stringify(out));
});

test("defence: that melee unit goes to the front of its city's queue", () => {
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
    world.cities[0].queued = ["UNIT_SPEARMAN"];
    try {
        steps.frontLoadUnits({ defend: true });
        const move = fake.sent.find((s) => s.args?.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [1, 0]);
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        steps.frontLoadUnits({});
        assert.equal(fake.sent.length, 0, "not without «Оборона»");
    } finally {
        delete world.cities[0].queued;
    }
});

test("a threatened settlement buys its strongest melee defender on the spot, a town too, with all the gold", () => {
    // Seen in game 5: not one unit was bought all game while 230-950 gold sat idle during each siege.
    reset();
    world.canBuy = sells({ UNIT_WARRIOR: 80, UNIT_SPEARMAN: 300, UNIT_ARCHER: 200 });
    const threats = [{ settlement: { name: "York", ...YORK }, count: 2, owners: [{ id: 5, independent: true }] }];
    let out = steps.buyDefenders(threats, { reserveTurns: 2 });
    assert.deepEqual(bought(), [["UNIT_SPEARMAN", ids.York]]);
    assert.equal(out[0].key, "DEFENDER_BOUGHT");
    // Little gold: the melee unit it can afford.
    reset();
    world.gold = 150;
    world.canBuy = sells({ UNIT_WARRIOR: 80, UNIT_SPEARMAN: 300, UNIT_ARCHER: 120 });
    steps.buyDefenders(threats, { reserveTurns: 2 });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]]);
    // Already as many of our soldiers around it as hostile units: none.
    reset();
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    world.units = [{ id: 7, type: "UNIT_WARRIOR", x: YORK.x + 1, y: YORK.y }, { id: 8, type: "UNIT_WARRIOR", x: YORK.x, y: YORK.y + 1 }];
    steps.buyDefenders(threats, { reserveTurns: 2 });
    assert.deepEqual(bought(), []);
});

test("an exposed settlement (a village at war with us within 6) with no soldier gets one bought with the gold above the reserve", () => {
    reset();
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    world.villages = [{ owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }];
    world.indepRelation = { 5: IndependentRelationship.HOSTILE };
    let out = steps.buyDefenders([], { reserveTurns: 2 });
    assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.Leeds]], JSON.stringify(out));
    assert.equal(out[0].key, "GARRISON_BOUGHT");
    // A soldier next to its centre: enough.
    reset();
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    world.villages = [{ owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }];
    world.indepRelation = { 5: IndependentRelationship.HOSTILE };
    world.units = [{ id: 7, type: "UNIT_WARRIOR", x: LEEDS.x + 1, y: LEEDS.y }];
    steps.buyDefenders([], { reserveTurns: 2 });
    assert.deepEqual(bought(), []);
    // A neutral village: not exposed.
    reset();
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    world.villages = [{ owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }];
    world.indepRelation = { 5: IndependentRelationship.NEUTRAL };
    steps.buyDefenders([], { reserveTurns: 2 });
    assert.deepEqual(bought(), []);
    // Only the reserve left (2 turns × 10 income): not for an exposed one.
    reset();
    world.gold = 90;
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    world.villages = [{ owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }];
    world.indepRelation = { 5: IndependentRelationship.HOSTILE };
    steps.buyDefenders([], { reserveTurns: 2 });
    assert.deepEqual(bought(), []);
});

test("the pass with «Оборона»: a defender bought where raiders are, and the strong melee unit queued", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    reset();
    world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
    world.canBuy = sells({ UNIT_WARRIOR: 80 });
    world.enemies = [{ x: YORK.x + 2, y: YORK.y, owner: 5 }, { x: YORK.x, y: YORK.y - 2, owner: 5 }];
    settings.patch({ autopilot: { defend: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false } });
    try {
        await autopilot.runTurn(true);
        const keys = (state.get().autopilot.log ?? []).map((e) => e.key);
        assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.York]], JSON.stringify(keys));
        assert.ok(keys.includes("DEFENDER_BOUGHT"));
        // No raiders: the strong melee unit is still kept.
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        await autopilot.runTurn(true);
        assert.deepEqual(trained(), ["UNIT_SPEARMAN"], JSON.stringify((state.get().autopilot.log ?? []).map((e) => e.key)));
    } finally {
        settings.patch({ autopilot: { defend: false } });
        reset();
    }
});

test("a settler in a threatened settlement walks to a safe one of ours instead of waiting there", async () => {
    // Seen in game 5: settlers waited inside threatened towns (SETTLER_WAITS) and were lost with them.
    const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
    const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    reset();
    units.resetUnitGoals();
    world.units = [{ id: 20, type: "UNIT_SETTLER", ...YORK }];
    world.enemies = [{ x: YORK.x + 2, y: YORK.y, owner: 5 }];
    const r = units.commandUnits(DEFAULT_SETTINGS, { settlers: true });
    const move = fake.sent.find((s) => s.id?.id === 20 && s.op === UnitOperationTypes.MOVE_TO)?.args;
    assert.ok(move, JSON.stringify(r.entries));
    assert.ok([[LONDON.x, LONDON.y], [LEEDS.x, LEEDS.y]].some(([x, y]) => move.X === x && move.Y === y), JSON.stringify(move));
    assert.equal(r.entries[0].key, "SETTLER_RETREAT");
    // Raiders near the other settlements too: it waits where it is.
    reset();
    units.resetUnitGoals();
    world.units = [{ id: 20, type: "UNIT_SETTLER", ...YORK }];
    // (on their far side: the ways there stay clear of them, the settlements do not)
    world.enemies = [{ x: YORK.x + 2, y: YORK.y, owner: 5 }, { x: LONDON.x - 3, y: LONDON.y, owner: 5 }, { x: LEEDS.x - 3, y: LEEDS.y, owner: 5 }];
    const w = units.commandUnits(DEFAULT_SETTINGS, { settlers: true });
    assert.equal(w.entries[0]?.key, "SETTLER_WAITS", JSON.stringify(w.entries));
    reset();
});

test("dispersing: a soldier walks onto an empty village at war with us, and disperses it once there", async () => {
    // Nobody dispersed a village in game 5, though villages were often empty (their units out raiding).
    const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
    const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const village = { owner: 5, x: LONDON.x + 4, y: LONDON.y };
    const soldier = { id: 21, type: "UNIT_WARRIOR", x: LONDON.x + 1, y: LONDON.y + 1 };
    const order = (extra = {}, options = { defend: true }) => {
        reset();
        units.resetUnitGoals();
        world.units = [{ id: 20, type: "UNIT_WARRIOR", ...LONDON }, { ...soldier }];
        world.villages = [village];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        Object.assign(world, extra);
        const r = units.commandUnits(DEFAULT_SETTINGS, options);
        return { r, move: fake.sent.find((s) => s.id?.id === 21 && s.op === UnitOperationTypes.MOVE_TO)?.args };
    };
    try {
        let { r, move } = order();
        assert.deepEqual([move?.X, move?.Y], [village.x, village.y], JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "DISPERSE_MOVE"));
        assert.ok(!fake.sent.some((s) => s.id?.id === 20 && s.op === UnitOperationTypes.MOVE_TO), "the garrison stays");
        // A roaming soldier too.
        ({ r, move } = order({}, { roam: true, random: () => 0 }));
        assert.deepEqual([move?.X, move?.Y], [village.x, village.y], JSON.stringify(r.entries));
        // Someone in the village: no.
        ({ move } = order({ enemies: [{ ...village }] }));
        assert.equal(move, undefined, "not empty");
        // Not at war with us: no.
        ({ move } = order({ indepRelation: { 5: IndependentRelationship.NEUTRAL } }));
        assert.equal(move, undefined, "neutral");
        // Another leader is befriending it (−30 relationship with them): no.
        ({ move } = order({ events: { 5: [{ initialPlayer: 3, targetPlayer: 5, actionType: DiplomacyActionTypes.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN }] } }));
        assert.equal(move, undefined, "someone befriends it");
        // Standing on it: dispersed.
        reset();
        units.resetUnitGoals();
        world.units = [{ id: 20, type: "UNIT_WARRIOR", ...LONDON }, { id: 21, type: "UNIT_WARRIOR", x: village.x, y: village.y }];
        world.villages = [village];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        r = units.commandUnits(DEFAULT_SETTINGS, { defend: true });
        assert.ok(fake.sent.some((s) => s.id?.id === 21 && s.op === "UNITOPERATION_DISPERSE_INDEPENDENT"), JSON.stringify(r.entries));
        assert.equal(r.entries.find((e) => e.key === "DISPERSED")?.args[1], "Hittites");
    } finally {
        delete world.events;
        reset();
    }
});

test("Fort Town: a growing town at population 7 near a village at war with us (or threatened) takes it; then its walls are bought", () => {
    // Towns cannot build, and walls cannot be bought, except by a Fort Town (research/17).
    const york = world.cities[1];
    const FORT = GameInfo.Projects.lookup("PROJECT_TOWN_FORT").$hash;
    const focusSet = () => fake.sent.filter((s) => s.op === CityCommandTypes.CHANGE_GROWTH_MODE).map((s) => [s.id.id, s.args.ProjectType]);
    try {
        york.pop = 7;
        reset();
        world.villages = [{ owner: 5, x: YORK.x + 5, y: YORK.y }];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        let out = steps.setTownFocus(DEFAULT_SETTINGS, []);
        assert.deepEqual(focusSet(), [[ids.York, FORT]], JSON.stringify(out));
        assert.equal(out[0].key, "FOCUS_FORT");
        // A neutral village: the usual Focus advice instead.
        reset();
        world.villages = [{ owner: 5, x: YORK.x + 5, y: YORK.y }];
        world.indepRelation = { 5: IndependentRelationship.NEUTRAL };
        steps.setTownFocus(DEFAULT_SETTINGS, []);
        assert.ok(!focusSet().some(([, p]) => p === FORT));
        // Threatened (raiders near), no village known: Fort Town too.
        reset();
        steps.setTownFocus(DEFAULT_SETTINGS, [{ settlement: { name: "York", ...YORK }, count: 1, owners: [] }]);
        assert.deepEqual(focusSet(), [[ids.York, FORT]]);
        // Without «Оборона» (no threats given): the usual advice.
        reset();
        world.villages = [{ owner: 5, x: YORK.x + 5, y: YORK.y }];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        steps.setTownFocus(DEFAULT_SETTINGS);
        assert.ok(!focusSet().some(([, p]) => p === FORT), "not without «Оборона»");
        // Below population 7: not yet.
        york.pop = 6;
        reset();
        world.villages = [{ owner: 5, x: YORK.x + 5, y: YORK.y }];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        steps.setTownFocus(DEFAULT_SETTINGS, []);
        assert.deepEqual(focusSet(), []);
        // A Fort Town near that village: walls bought on its centre with the gold above the reserve.
        york.focus = "PROJECT_TOWN_FORT";
        reset();
        world.villages = [{ owner: 5, x: YORK.x + 5, y: YORK.y }];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        const centre = GameplayMap.getIndexFromXY(YORK.x, YORK.y);
        world.canBuy = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], Cost: 120 } : { Success: false });
        const fort = steps.exposedFortTowns();
        assert.deepEqual(fort.map((t) => t.settlement.name), ["York"]);
        out = steps.fortifyThreatened(fort, { queue: false, reserve: steps.goldReserve(2) });
        assert.equal(out[0]?.key, "WALLS_BOUGHT", JSON.stringify(out));
        world.gold = 130; // 120 + the 20 reserve is more
        fake.sent.length = 0;
        assert.deepEqual(steps.fortifyThreatened(fort, { queue: false, reserve: steps.goldReserve(2) }), []);
    } finally {
        york.pop = 4;
        delete york.focus;
        reset();
    }
});

test("the pass with «Оборона»: an exposed Fort Town's walls are bought; a threatened growing town takes Fort Town", async () => {
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    const york = world.cities[1];
    const FORT = GameInfo.Projects.lookup("PROJECT_TOWN_FORT").$hash;
    const centre = GameplayMap.getIndexFromXY(YORK.x, YORK.y);
    settings.patch({ autopilot: { defend: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: true } });
    try {
        reset();
        york.focus = "PROJECT_TOWN_FORT";
        world.villages = [{ owner: 5, x: YORK.x + 5, y: YORK.y }];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        world.canBuy = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [centre], Cost: 120 } : { Success: false });
        await autopilot.runTurn(true);
        const keys = (state.get().autopilot.log ?? []).map((e) => e.key);
        assert.ok(fake.sent.some((s) => s.kind === "command" && s.id.id === ids.York && s.args.ConstructibleType === GameInfo.Constructibles.lookup("BUILDING_ANCIENT_WALLS").$hash), JSON.stringify(keys));
        // A threatened growing town at 7 (one raider 2 tiles away): Fort Town.
        reset();
        delete york.focus;
        york.pop = 7;
        world.enemies = [{ x: YORK.x + 2, y: YORK.y, owner: 5 }];
        await autopilot.runTurn(true);
        assert.ok(fake.sent.some((s) => s.op === CityCommandTypes.CHANGE_GROWTH_MODE && s.args.ProjectType === FORT), JSON.stringify((state.get().autopilot.log ?? []).map((e) => e.key)));
    } finally {
        settings.patch({ autopilot: { defend: false } });
        delete york.focus;
        york.pop = 4;
        reset();
    }
});

test("gold income below zero: the reserve covers 10 turns of the deficit; no new upkeep (the strong melee unit, garrisons, the advisor's soldiers)", () => {
    // Seen in game 6: crisis cards doubled unit upkeep, income fell to -13, the reserve was 0, the
    // treasury emptied, and Horsemen were still trained.
    try {
        reset();
        world.goldIncome = -13;
        assert.equal(steps.goldReserve(2), 130);
        world.goldIncome = 10;
        assert.equal(steps.goldReserve(2), 20, "as before with a positive income");
        // A stronger melee unit than this age's: not while broke...
        world.goldIncome = -13;
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        obtained("UNIT_WARRIOR");
        steps.fillProduction(new Map(), { defend: true });
        assert.ok(!trained().includes("UNIT_SPEARMAN"), JSON.stringify(trained()));
        // ...but the age's first one is (every centre stands at 20 until then: research/37 §2).
        reset();
        world.goldIncome = -13;
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        steps.fillProduction(new Map(), { defend: true });
        assert.deepEqual(trained(), ["UNIT_SPEARMAN"]);
        // An exposed settlement's holder at a deficit: only from the gold above the reserve (10 turns of the deficit here:
        // research/37 §4C), no longer never.
        reset();
        world.goldIncome = -13;
        world.gold = 200;
        world.canBuy = sells({ UNIT_WARRIOR: 80 });
        world.villages = [{ owner: 5, x: LEEDS.x, y: LEEDS.y + 5 }];
        world.indepRelation = { 5: IndependentRelationship.HOSTILE };
        steps.buyDefenders([], { reserveTurns: 2 });
        assert.deepEqual(bought(), [], "70 free gold");
        world.gold = 1000;
        steps.buyDefenders([], { reserveTurns: 2 });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.Leeds]], "870 free gold");
        fake.sent.length = 0;
        steps.resetWar();
        // ...but a threatened settlement still buys its defender.
        steps.buyDefenders([{ settlement: { name: "Leeds", ...LEEDS }, count: 1, owners: [{ id: 5, independent: true }] }], { reserveTurns: 2 });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", ids.Leeds]]);
        // The advisor's soldier (London's queue empty): not while broke; with income, yes.
        const queue = world.cities[0].queue;
        delete world.cities[0].queue;
        world.buildRecs = () => [{ subject: 8, recommendedType: "UNIT_WARRIOR", whichAdvisors: [] }];
        GameInfo.AdvisorySubjects = { lookup: (h) => (h === 8 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_UNITS" } : null) };
        reset();
        world.goldIncome = 10;
        steps.fillProduction(new Map(), {});
        assert.ok(trained().includes("UNIT_WARRIOR"), "with income: " + JSON.stringify(trained()));
        reset();
        world.goldIncome = -13;
        steps.fillProduction(new Map(), {});
        assert.ok(!trained().includes("UNIT_WARRIOR"), JSON.stringify(trained()));
        world.cities[0].queue = queue;
    } finally {
        world.goldIncome = 10;
        world.cities[0].queue ??= { type: "BUILDING_MONUMENT", turns: 5 };
        delete world.buildRecs;
        delete GameInfo.AdvisorySubjects;
        reset();
    }
});

test("ships near a settlement: one melee guard for its centre, no more (research/22 B7, research/24 W2); land raiders get one each", () => {
    reset();
    world.canBuild = trains("UNIT_WARRIOR");
    world.canBuy = sells({ UNIT_WARRIOR: 100 });
    const threat = (land) => [{ settlement: { name: "London", ...LONDON }, count: 2, land, owners: [] }];
    try {
        steps.buyDefenders(threat(0), { reserveTurns: 0 });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", 0]], "game 9: Нант fell to 2 Cogs and a Knight while a ranged unit held its centre");
        reset();
        world.canBuild = trains("UNIT_WARRIOR");
        world.canBuy = sells({ UNIT_WARRIOR: 100 });
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        steps.buyDefenders(threat(0), { reserveTurns: 0 });
        let out = steps.fillProduction(new Map(), { defend: true, threats: threat(0) });
        assert.deepEqual(bought(), [], "cogs and privateers: seen in game 7, two Knights bought against them");
        assert.ok(!out.some((e) => e.key === "QUEUED_DEFENDER"), JSON.stringify(out));
        world.units = [];
        reset();
        world.canBuild = trains("UNIT_WARRIOR");
        world.canBuy = sells({ UNIT_WARRIOR: 100 });
        steps.buyDefenders(threat(2), { reserveTurns: 0 });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", 0]]);
        out = steps.fillProduction(new Map(), { defend: true, threats: threat(2) });
        assert.ok(out.some((e) => e.key === "QUEUED_DEFENDER"));
    } finally {
        reset();
    }
});

test("a growing town at population 7 in unrest takes the Focus that gives the most Happiness (research/22 A4)", () => {
    const york = world.cities[1];
    const keep = { tiles: world.tiles, structures: world.structures };
    const RESORT = GameInfo.Projects.lookup("PROJECT_TOWN_RESORT").$hash;
    const focusSet = () => fake.sent.filter((s) => s.op === CityCommandTypes.CHANGE_GROWTH_MODE).map((s) => [s.id.id, s.args.ProjectType]);
    // Farms all round York, one appealing tile: the usual advice is farming.
    world.structures = (x, y) => (GameplayMap.getPlotDistance(x, y, YORK.x, YORK.y) === 1 ? { district: "DISTRICT_RURAL", constructibles: ["IMPROVEMENT_FARM"] } : { district: null, constructibles: [] });
    world.tiles = (x, y) => ({ ...keep.tiles(x, y), appeal: x === YORK.x + 1 && y === YORK.y ? 4 : 0 });
    try {
        york.pop = 7;
        reset();
        steps.setTownFocus(DEFAULT_SETTINGS);
        assert.ok(!focusSet().some(([, p]) => p === RESORT), JSON.stringify(focusSet()));
        reset();
        york.unrest = true;
        const out = steps.setTownFocus(DEFAULT_SETTINGS);
        assert.deepEqual(focusSet(), [[ids.York, RESORT]], JSON.stringify(out));
        assert.equal(out[0].key, "FOCUS_CALM");
    } finally {
        world.tiles = keep.tiles;
        if (keep.structures) world.structures = keep.structures; else delete world.structures;
        york.unrest = false;
        york.pop = 4;
        reset();
    }
});

test("science past the Growth phase: a farming town that could buy a Library with Urban Center takes it (research/23 S7: both towns kept Fishing all age)", () => {
    const york = world.cities[1];
    const URBAN = GameInfo.Projects.lookup("PROJECT_TOWN_URBAN_CENTER").$hash;
    const focusSet = () => fake.sent.filter((s) => s.op === CityCommandTypes.CHANGE_GROWTH_MODE).map((s) => [s.id.id, s.args.ProjectType]);
    const s = { ...DEFAULT_SETTINGS, profile: "SCIENCE", strategy: { phase: "BUILD", townFocusBias: { URBAN: 6, FARM: 2 } } };
    try {
        Object.assign(york, { pop: 7, focus: "PROJECT_TOWN_FISHING" });
        world.research = { tech: { available: [] }, culture: { available: [] }, depth: { NODE_TECH_AQ_WRITING: 1 } };
        reset();
        let out = steps.setTownFocus(s, null, { revisit: true });
        assert.deepEqual(focusSet(), [[ids.York, URBAN]], JSON.stringify(out));
        assert.equal(out[0].key, "FOCUS_URBAN");
        reset();
        steps.setTownFocus(s, null);
        assert.deepEqual(focusSet(), [], "in Growth: a chosen Focus stays");
        // Nothing to buy with Urban Center yet (no Writing): it keeps Fishing, and UI.log says why, once an age
        // (research/24: S7 never fired in game 9 and nothing said why).
        world.research = { tech: { available: [] }, culture: { available: [] }, depth: {} };
        const warn = console.warn;
        const lines = [];
        console.warn = (...a) => lines.push(a.join(" "));
        try {
            reset();
            steps.setTownFocus(s, null, { revisit: true });
            steps.setTownFocus(s, null, { revisit: true });
        } finally {
            console.warn = warn;
        }
        assert.deepEqual(focusSet(), []);
        assert.equal(lines.filter((l) => l.includes("keeps PROJECT_TOWN_FISHING")).length, 1, JSON.stringify(lines));
    } finally {
        delete york.focus;
        york.pop = 4;
        delete world.research;
        reset();
    }
});

test("ships shooting a settlement: ranged defenders (they alone hit ships), trained and bought; a melee one first only with land raiders too (game 10)", () => {
    const threat = (land, ships) => [{ settlement: { name: "London", ...LONDON }, count: land + ships, land, ships, owners: [] }];
    const trainedNow = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType);
    try {
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_ARCHER");
        world.canBuy = sells({ UNIT_WARRIOR: 100, UNIT_ARCHER: 120 });
        steps.buyDefenders(threat(0, 2), { reserveTurns: 0 });
        assert.deepEqual(bought(), [["UNIT_ARCHER", 0]], "two galleys: an archer");
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_ARCHER");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        steps.fillProduction(new Map(), { defend: true, threats: threat(0, 2) });
        assert.deepEqual(trainedNow(), ["UNIT_ARCHER"], "the centre held: an archer trained");
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_ARCHER");
        world.canBuy = sells({ UNIT_WARRIOR: 100, UNIT_ARCHER: 120 });
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }, { id: 2, type: "UNIT_ARCHER", x: LONDON.x + 1, y: LONDON.y }, { id: 3, type: "UNIT_ARCHER", x: LONDON.x, y: LONDON.y + 1 }];
        steps.buyDefenders(threat(0, 2), { reserveTurns: 0 });
        assert.deepEqual(bought(), [], "two archers there: enough");
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_ARCHER");
        world.canBuy = sells({ UNIT_WARRIOR: 100, UNIT_ARCHER: 120 });
        steps.buyDefenders(threat(1, 1), { reserveTurns: 0 });
        assert.deepEqual(bought(), [["UNIT_WARRIOR", 0]], "a land raider too: melee first");
    } finally {
        world.units = [];
        reset();
    }
});

test("defenders come from the nearest city that trains them within 10 turns and is not infected; none: they are bought instead (game 18: a Landship for 33 turns)", () => {
    reset();
    const york = world.cities[1];
    Object.assign(york, { isTown: false, prod: 2 });
    world.canBuild = trains("UNIT_WARRIOR");
    world.costOf = () => 30;
    const threats = [{ settlement: { name: "York", ...YORK }, count: 1, land: 1, owners: [{ id: 5, independent: true }] }];
    const from = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map((s) => s.id.id);
    try {
        let out = steps.fillProduction(new Map(), { threats });
        assert.deepEqual(from(), [ids.London], `York trains 30 at 2 a turn (15 turns); London at 10: ${JSON.stringify(out)}`);
        reset();
        world.canBuild = trains("UNIT_WARRIOR");
        york.prod = 10;
        york.infected = true;
        out = steps.fillProduction(new Map(), { threats });
        assert.deepEqual(from(), [ids.London], "York is infected: its new unit would stand in the plague");
        reset();
        world.canBuild = trains("UNIT_WARRIOR");
        york.infected = false;
        york.prod = 2;
        world.cities[0].prod = 2;
        out = steps.fillProduction(new Map(), { threats });
        assert.deepEqual(from(), [], "nobody trains it within 10 turns");
    } finally {
        Object.assign(york, { isTown: true, prod: undefined, infected: false });
        world.cities[0].prod = 10;
        delete world.costOf;
        reset();
    }
});

test("wanted soldiers: not in an infected city, not where they take more than 10 turns", () => {
    const london = world.cities[0];
    try {
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        world.costOf = () => 30;
        let out = steps.fillProduction(new Map(), { defend: true });
        assert.ok(out.some((x) => x.key === "QUEUED_MELEE"), JSON.stringify(out));
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        london.infected = true;
        out = steps.fillProduction(new Map(), { defend: true });
        assert.ok(!out.some((x) => x.key === "QUEUED_MELEE"), "London is infected");
        reset();
        world.canBuild = trains("UNIT_WARRIOR", "UNIT_SPEARMAN");
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }];
        london.infected = false;
        london.prod = 2;
        out = steps.fillProduction(new Map(), { defend: true });
        assert.ok(!out.some((x) => x.key === "QUEUED_MELEE"), "15 turns");
    } finally {
        london.infected = false;
        london.prod = 10;
        delete world.costOf;
        reset();
    }
});
