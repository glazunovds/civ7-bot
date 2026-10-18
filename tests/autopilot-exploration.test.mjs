// Exploration age: treasure convoys go home and unload; with the economy focus settlers head for
// the Distant Lands first (the game's own suggestions), once the seas are safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 3, y: 5 }, COLONY = { x: 30, y: 5 };
const world = {
    width: 40, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...HOME, name: "Lisbon" },
        { owner: 0, ...COLONY, name: "Macau", distant: true, isTown: true },
    ],
    distantAt: (x) => x >= 20,
    techs: ["NODE_TECH_EX_SHIPBUILDING"],
};
const fake = installFakeEngine(world, "exploration");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const run = (options) => {
    fake.sent.length = 0;
    return units.commandUnits(DEFAULT_SETTINGS, options);
};

test("a treasure convoy walks home to our Homeland and unloads there, whatever unit options are on", () => {
    world.owningCity = (x, y) => (GameplayMap.getPlotDistance(x, y, HOME.x, HOME.y) <= 1 ? { owner: 0, id: 0 } : null);
    units.resetUnitGoals();
    world.units = [{ id: 5, type: "UNIT_TREASURE_FLEET", ...COLONY }];
    let r = run({ defend: true });
    const to = moveOf(5);
    assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, HOME.x, HOME.y) <= 1, JSON.stringify(r.entries));
    assert.equal(r.entries[0].key, "TREASURE_HOME");
    // Inside Lisbon's borders: unload.
    world.units = [{ id: 5, type: "UNIT_TREASURE_FLEET", x: HOME.x + 1, y: HOME.y }];
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_DISBAND";
    r = run({ defend: true });
    assert.ok(fake.sent.some((s) => s.op === "UNITCOMMAND_DISBAND"));
    assert.deepEqual(r.entries[0].args, ["Lisbon"]);
    delete world.unitCommandOk;
    delete world.owningCity;
    world.units = [];
});

test("economy focus: settlers go to a Distant Lands site the game suggests before our own sites", () => {
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 8, y: 5, rank: 1 }] } } });
    world.aiSuggestions = () => [{ location: { x: 9, y: 8 } }, { location: { x: 24, y: 6 } }];
    try {
        units.resetUnitGoals();
        world.units = [{ id: 7, type: "UNIT_SETTLER", ...HOME }];
        let r = run({ settlers: true, distant: true });
        assert.deepEqual([moveOf(7)?.X, moveOf(7)?.Y], [24, 6], JSON.stringify(r.entries));
        units.resetUnitGoals();
        r = run({ settlers: true });
        assert.deepEqual([moveOf(7)?.X, moveOf(7)?.Y], [8, 5], "without it: our best site");
        // Before Shipbuilding the ocean between would hurt: no Distant Lands (here no ocean, but rough seas block nothing else).
    } finally {
        delete world.aiSuggestions;
        world.units = [];
    }
});

test("science: the civics toward Social Class (Innovation by itself) come first, ahead of the advisor's quicker civic (research/21 D2)", () => {
    const CIVIC = PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const chosen = () => fake.sent.filter((s) => s.op === CIVIC).map((s) => s.args.ProgressionTreeNodeType);
    world.research = {
        tech: { available: [] }, culture: { available: [N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE"), N("NODE_CIVIC_EX_MAIN_MERCANTILISM")] },
        turns: { NODE_CIVIC_EX_MAIN_MERCANTILISM: 2, NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE: 6 },
    };
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_EX_MAIN_MERCANTILISM"), whichAdvisors: [] }];
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE")], JSON.stringify(r));
        assert.equal(r.key, "VICTORY_CIVIC");
        assert.match(r.args[0], /→/, "names Social Class");
        world.research.culture.available = [N("NODE_CIVIC_EX_MAIN_SOCIAL_CLASS"), N("NODE_CIVIC_EX_MAIN_MERCANTILISM")];
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_CIVIC_EX_MAIN_SOCIAL_CLASS")]);
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
        assert.deepEqual(chosen(), [N("NODE_CIVIC_EX_MAIN_MERCANTILISM")], "another focus: the advisor's");
    } finally {
        delete world.research;
        delete world.treeRecs;
    }
});

test("a settler whose only sites lie across rough seas says why, and research goes to Shipbuilding first (research/22 A1: idle 28 turns in game 7)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const tiles = world.tiles;
    const techs = world.techs;
    world.techs = [];
    world.tiles = (x, y) => ({ ...tiles(x, y), terrain: x >= 6 && x <= 9 ? "TERRAIN_OCEAN" : "TERRAIN_FLAT" });
    world.units = [{ id: 2, type: "UNIT_SETTLER", x: HOME.x, y: HOME.y }];
    world.research = { tech: { available: [N("NODE_TECH_EX_SHIPBUILDING"), N("NODE_TECH_EX_GUILDS")] }, culture: { available: [] }, turns: { NODE_TECH_EX_SHIPBUILDING: 9, NODE_TECH_EX_GUILDS: 2 } };
    const sites = state.get().results.sites;
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 5, rank: 1 }] } } });
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        units.resetUnitGoals();
        run({ settlers: true });
        assert.ok(lines.some((l) => l.includes("settler: no order") && l.includes('"SEAS":1')), JSON.stringify(lines.filter((l) => l.includes("settler"))));
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, null);
        assert.equal(r?.key, "TECH_FOR_SETTLERS");
        assert.deepEqual(fake.sent.filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).map((s) => s.args.ProgressionTreeNodeType), [N("NODE_TECH_EX_SHIPBUILDING")]);
    } finally {
        console.warn = warn;
        world.tiles = tiles;
        world.techs = techs;
        delete world.research;
        world.units = [];
        state.set({ results: { ...state.get().results, sites } });
    }
});

test("science: one research gate at a time, the most Innovation first: Urban Planning (Invent Calculus, 10) before Education's mastery (Heliocentric, 5) (research/22 A2)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const done = ["NODE_TECH_EX_ASTRONOMY", "NODE_TECH_EX_CARTOGRAPHY", "NODE_TECH_EX_FEUDALISM", "NODE_TECH_EX_GUILDS", "NODE_TECH_EX_ARCHITECTURE", "NODE_TECH_EX_HERALDRY", "NODE_TECH_EX_MACHINERY", "NODE_TECH_EX_SHIPBUILDING"];
    world.research = {
        tech: { available: [N("NODE_TECH_EX_EDUCATION"), N("NODE_TECH_EX_URBAN_PLANNING")] }, culture: { available: [] },
        depth: { ...Object.fromEntries(done.map((n) => [n, 1])), NODE_TECH_EX_EDUCATION: 1 },
        turns: { NODE_TECH_EX_EDUCATION: 3, NODE_TECH_EX_URBAN_PLANNING: 6 },
    };
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(fake.sent.filter((s) => s.op === TECH).map((s) => s.args.ProgressionTreeNodeType), [N("NODE_TECH_EX_URBAN_PLANNING")], JSON.stringify(r));
    } finally {
        delete world.research;
    }
});

test("science: an Urban Center town buys this age's science building it opens, the Observatory (research/22 C2, probe P3)", () => {
    world.canBuy = (type, id) => (type === "BUILDING_OBSERVATORY" && id.id === 1 ? { Success: true, Plots: [GameplayMap.getIndexFromXY(COLONY.x + 1, COLONY.y)], Cost: 150 } : { Success: false });
    try {
        const items = steps.victoryPurchases("SCIENCE");
        assert.deepEqual(items.map((i) => [i.city.id.id, i.def.ConstructibleType]), [[1, "BUILDING_OBSERVATORY"]]);
        assert.deepEqual(steps.townLevers("ECONOMIC").map((d) => d.ConstructibleType), ["BUILDING_BAZAAR"]);
    } finally {
        delete world.canBuy;
    }
});

test("science: a research gate that cannot be researched and built before the age ends is skipped; the next one is taken (research/23 S3: game 8, 45 turns toward an unreachable Invent Calculus)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const done = ["NODE_TECH_EX_ASTRONOMY", "NODE_TECH_EX_CARTOGRAPHY", "NODE_TECH_EX_FEUDALISM", "NODE_TECH_EX_GUILDS", "NODE_TECH_EX_ARCHITECTURE", "NODE_TECH_EX_HERALDRY", "NODE_TECH_EX_MACHINERY", "NODE_TECH_EX_SHIPBUILDING"];
    const chosen = () => fake.sent.filter((s) => s.op === TECH).map((s) => s.args.ProgressionTreeNodeType);
    world.research = {
        tech: { available: [N("NODE_TECH_EX_EDUCATION"), N("NODE_TECH_EX_URBAN_PLANNING")] }, culture: { available: [] },
        depth: { ...Object.fromEntries(done.map((n) => [n, 1])), NODE_TECH_EX_EDUCATION: 1 },
        turns: { NODE_TECH_EX_EDUCATION: 3, NODE_TECH_EX_URBAN_PLANNING: 12 },
    };
    world.costOf = () => 20; // the projects: 4 turns at Lisbon's 5 production
    try {
        world.agePoints = 80; // about 24 turns left: Urban Planning twice (24) and the project (4) are too much, Education's mastery (3) is not
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_TECH_EX_EDUCATION")]);
        world.agePoints = 20;
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_TECH_EX_URBAN_PLANNING")], "in time: Invent Calculus first");
    } finally {
        delete world.research;
        delete world.costOf;
        delete world.agePoints;
    }
});

test("science civics: one that unlocks a science building or an Innovation wonder is wanted, the civilization's own too; an Innovation civic out of reach is not (research/23 S4)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const CIVIC = PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    const chosen = () => fake.sent.filter((s) => s.op === CIVIC).map((s) => s.args.ProgressionTreeNodeType);
    try {
        world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_EX_ABBASID_MAWLA"), N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE")] }, turns: { NODE_CIVIC_EX_ABBASID_MAWLA: 8, NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE: 4 } };
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_CIVIC_EX_ABBASID_MAWLA")], "Mawla: the Madrasa");
        // Social Class (Innovation) only: in time its way; out of reach not.
        const scWay = (r) => String(r?.args?.[0] ?? "").includes("SOCIAL_CLASS");
        world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE")] }, turns: { NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE: 10, NODE_CIVIC_EX_MAIN_SOCIAL_CLASS: 10, NODE_CIVIC_EX_MAIN_SOCIETY: 10 } };
        world.agePoints = 20;
        fake.sent.length = 0;
        assert.ok(scWay(steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE")), "96 turns left: toward Social Class");
        world.agePoints = 80;
        fake.sent.length = 0;
        assert.ok(!scWay(steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE")), "24 turns left: not");
    } finally {
        delete world.research;
        delete world.agePoints;
    }
});

test("walls: another civilization's own (the Normans' Bailey and Motte) are not ours; the diagnostic names the tech they wait for (research/23 D7)", () => {
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    world.canBuild = () => ({ Success: false, Plots: [] });
    try {
        steps.fortifyThreatened([{ settlement: { x: HOME.x, y: HOME.y, name: "Lisbon" }, count: 2, land: 2, owners: [] }]);
        const line = lines.find((l) => l.includes("walls: none for"));
        assert.ok(line && line.includes("BUILDING_MEDIEVAL_WALLS") && !line.includes("BAILEY") && !line.includes("MOTTE"), line);
        assert.ok(line.includes("locked behind NODE_TECH_EX_CASTLES"), line);
    } finally {
        console.warn = warn;
        delete world.canBuild;
    }
});

test("science research: what unlocks a wonder granting Innovation is wanted, Society's mastery (the House of Wisdom) too (research/23 S2)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const CIVIC = PlayerOperationTypes.SET_CULTURE_TREE_NODE;
    const chosen = () => fake.sent.filter((s) => s.op === CIVIC).map((s) => s.args.ProgressionTreeNodeType);
    try {
        // Social Class (Innovation) out of reach this late; Society researched once, its mastery next.
        world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_EX_MAIN_SOCIETY"), N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE")] },
            depth: { NODE_CIVIC_EX_MAIN_SOCIETY: 1 }, turns: { NODE_CIVIC_EX_MAIN_SOCIETY: 6, NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE: 2, NODE_CIVIC_EX_MAIN_SOCIAL_CLASS: 30 } };
        world.agePoints = 80;
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_CIVIC_EX_MAIN_SOCIETY")]);
    } finally {
        delete world.research;
        delete world.agePoints;
    }
});

test("science: no research gate is given up before a quarter of the age, science grows (research/24 P7: Chart the Stars «out of reach» at A4, done)", () => {
    const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
    const TECH = PlayerOperationTypes.SET_TECH_TREE_NODE;
    const done = ["NODE_TECH_EX_ASTRONOMY", "NODE_TECH_EX_CARTOGRAPHY", "NODE_TECH_EX_FEUDALISM", "NODE_TECH_EX_GUILDS", "NODE_TECH_EX_ARCHITECTURE", "NODE_TECH_EX_HERALDRY", "NODE_TECH_EX_MACHINERY", "NODE_TECH_EX_SHIPBUILDING"];
    const chosen = () => fake.sent.filter((s) => s.op === TECH).map((s) => s.args.ProgressionTreeNodeType);
    world.research = {
        tech: { available: [N("NODE_TECH_EX_EDUCATION"), N("NODE_TECH_EX_URBAN_PLANNING")] }, culture: { available: [] },
        depth: { ...Object.fromEntries(done.map((n) => [n, 1])), NODE_TECH_EX_EDUCATION: 1 },
        turns: { NODE_TECH_EX_EDUCATION: 3, NODE_TECH_EX_URBAN_PLANNING: 60 },
    };
    world.costOf = () => 20;
    try {
        world.agePoints = 10; // 10% of the age: 120 turns of Urban Planning look too many, but it is early
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_TECH_EX_URBAN_PLANNING")]);
        world.agePoints = 30;
        fake.sent.length = 0;
        steps.chooseResearch("tech", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), [N("NODE_TECH_EX_EDUCATION")], "past a quarter: out of reach");
    } finally {
        delete world.research;
        delete world.costOf;
        delete world.agePoints;
    }
});

// Research/38 §4 D1: games 30 and 31 entered Modern with 1,155-1,277 gold while the age change keeps up to 4,500 at Online
// speed (9,000 × 50%), and Launch Pads cost 2,150-2,850 at Rocketry.
test("science: Exploration's last turns bank the free gold for Modern, up to what the age change keeps", () => {
    const age = (left) => {
        GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
        world.agePoints = 100 - (left / 120) * 100;
    };
    const s = { ...DEFAULT_SETTINGS, strategy: { goals: ["CONVERT", "LEVER"], phase: "BUILD" } };
    try {
        world.gold = 2000;
        world.goldIncome = 100;
        age(6);
        steps.resetGoldPlan();
        let p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.deepEqual([p.budget.goal?.kind, p.budget.goal?.cost], ["BANK", 2500], "2000 now and 5 turns of 100");
        assert.deepEqual([p.budget.free(), p.budget.all()], [0, 2000], "nothing free; defenders, repairs and nearly done buildings still buy from all of it");
        // Gold and income are not whole numbers (game 32, E64-E69: the bank was dropped for a University goal).
        world.gold = 2000.6;
        world.goldIncome = 117.4;
        steps.resetGoldPlan();
        p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.deepEqual([p.budget.goal?.kind, p.budget.goal?.cost], ["BANK", 2587], "2000.6 now and 5 turns of 117.4");
        world.goldIncome = 100;
        world.gold = 9500;
        steps.resetGoldPlan();
        p = steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 });
        assert.equal(p.budget.goal?.cost, 9000, "Continuity keeps 9,000 entering Modern");
        assert.equal(p.budget.free(), 500);
        // Another focus, or the age's end still far: no bank.
        steps.resetGoldPlan();
        assert.notEqual(steps.goldPlan(s, { focus: "CULTURE", reserveTurns: 0 }).budget.goal?.kind, "BANK");
        age(40);
        steps.resetGoldPlan();
        assert.notEqual(steps.goldPlan(s, { focus: "SCIENCE", reserveTurns: 0 }).budget.goal?.kind, "BANK");
    } finally {
        steps.resetGoldPlan();
        GameTutorial.setProperty(Database.makeHash("_XPL_OBJ_AGE_SAMPLES"), null);
        for (const k of ["gold", "goldIncome", "agePoints"]) delete world[k];
    }
});

test("the gold an age change keeps: Continuity 9,000 entering Modern, Regroup 3,000, scaled by the game speed", () => {
    const config = Configuration.getGame;
    const speeds = GameInfo.GameSpeeds;
    try {
        assert.equal(steps.carriedGoldCap("AGE_MODERN"), 9000, "the default setting, a speed the data does not know: ×1");
        GameInfo.GameSpeeds = { lookup: (t) => (t === "GAMESPEED_ONLINE" ? { CostMultiplier: 50 } : null) };
        Configuration.getGame = () => ({ ...config(), gameSpeedType: "GAMESPEED_ONLINE", getValue: (k) => (k === "AgeTransitionSettingName" ? "AGE_TRANSITION_SETTING_KEEP_MORE" : null) });
        assert.deepEqual([steps.carriedGoldCap("AGE_MODERN"), steps.carriedGoldCap("AGE_EXPLORATION")], [4500, 3000]);
        Configuration.getGame = () => ({ ...config(), gameSpeedType: "GAMESPEED_ONLINE", getValue: () => "AGE_TRANSITION_SETTING_ORIGINAL" });
        assert.equal(steps.carriedGoldCap("AGE_MODERN"), 1500, "Regroup");
    } finally {
        Configuration.getGame = config;
        GameInfo.GameSpeeds = speeds;
    }
});
