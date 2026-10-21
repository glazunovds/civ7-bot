// Research/40 B1: our own settlements follow our religion. Only the Holy City does by itself; Missionaries (3 charges, a
// Temple to train them) convert the others: those following no religion first (1 charge), then the rest (2: urban and rural).
// Game 41: rivals converted 4 of our 5 settlements and trained 19 Missionaries; we trained none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ROME = { x: 3, y: 5 }, CAPUA = { x: 9, y: 5 }, NOLA = { x: 15, y: 5 };
const world = {
    width: 22, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 6 }], // 6: a city-state (the last test)
    cities: [
        { owner: 0, ...ROME, name: "Roma", religion: 77, queue: { type: "BUILDING_TEMPLE", turns: 3 } },
        { owner: 0, ...CAPUA, name: "Capua", isTown: true },
        { owner: 0, ...NOLA, name: "Nola", religion: 88 },
    ],
    religion: 77,
    // Each settlement owns its centre and the ring around it; the centres are urban.
    owningCity: (x, y) => {
        const i = [ROME, CAPUA, NOLA].findIndex((c) => GameplayMap.getPlotDistance(x, y, c.x, c.y) <= 1);
        return i < 0 ? null : { owner: 0, id: i };
    },
    structures: (x, y) => ([ROME, CAPUA, NOLA].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: [] } : { district: "DISTRICT_RURAL", constructibles: [] }),
};
const fake = installFakeEngine(world, "exploration");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const missions = await import("../mod/expansion-planner/ui/data/xpl-missions.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const SPREAD = "UNITOPERATION_SPREAD_RELIGION";
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const spread = (id) => fake.sent.some((s) => s.id?.id === id && s.op === SPREAD);
const run = () => {
    fake.sent.length = 0;
    return units.commandUnits(DEFAULT_SETTINGS, {});
};

test("our settlements to convert: none of a religion first (1 charge), then another's (2); in the religious crisis an unhappy one first", () => {
    assert.deepEqual(missions.conversionTargets({ crisis: false }).map((t) => [t.city.name, t.charges]), [["Capua", 1], ["Nola", 2]]);
    world.cities[2].happy = -3;
    try {
        assert.deepEqual(missions.conversionTargets({ crisis: true }).map((t) => t.city.name), ["Nola", "Capua"], "it may defect to its religion's founder");
    } finally {
        delete world.cities[2].happy;
    }
    assert.deepEqual(missions.missionNeed({ crisis: false }), { settlements: 2, charges: 3 });
});

test("a Missionary walks to the settlement to convert and spreads our religion there; none while Ius Reformandi is slotted", () => {
    units.resetUnitGoals();
    world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...ROME }];
    world.unitCanStart = (id, op) => (op === SPREAD ? { Success: (world.units.find((u) => u.id === id?.id)?.x ?? 0) >= 8 } : undefined);
    try {
        world.crashes = [];
        let r = run();
        const to = moveOf(4);
        assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, CAPUA.x, CAPUA.y) <= 1, JSON.stringify(r.entries));
        // 20 October: the game crashed on getActivationPlots asked for this operation (our first Missionary's first order).
        assert.deepEqual(world.crashes, [], "no call that crashes the game");
        assert.equal(r.entries.find((e) => e.key.startsWith("MISSION"))?.key, "MISSION_MOVE");
        // Arrived inside Capua's borders (it follows no religion: any of its tiles).
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", x: CAPUA.x - 1, y: CAPUA.y }];
        r = run();
        assert.ok(spread(4), JSON.stringify(r.entries));
        // Nola follows another religion: its urban half from the centre.
        world.cities[1].religion = 77;
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", x: NOLA.x - 1, y: NOLA.y }];
        run();
        assert.ok(!spread(4), "a rural tile while Nola's urban half follows another religion");
        assert.deepEqual([moveOf(4)?.X, moveOf(4)?.Y], [NOLA.x, NOLA.y]);
        // Ius Reformandi slotted: every conversion of ours damages 3 buildings.
        const traditions = GameInfo.Traditions;
        const culture = Players.get(0).Culture;
        GameInfo.Traditions = { lookup: (t) => (t === "TRADITION_IUS_REFORMANDI" ? { TraditionType: t, $hash: 901 } : null) };
        culture.isTraditionActive = (h) => h === 901;
        try {
            world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...NOLA }];
            run();
            assert.ok(!spread(4));
        } finally {
            GameInfo.Traditions = traditions;
            delete culture.isTraditionActive;
        }
    } finally {
        world.cities[1].religion = undefined;
        world.units = [];
        delete world.unitCanStart;
        delete world.crashes;
    }
});

test("Missionaries are trained where the game allows (a Temple) while two of our settlements do not follow our religion", () => {
    world.canBuild = (type, id) => ({ Success: type === "UNIT_MISSIONARY" ? id?.id === 0 : true });
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === GameInfo.Units.lookup("UNIT_MISSIONARY").$hash).map((s) => world.cities[s.id.id].name);
    try {
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.deepEqual(trained(), ["Roma"], JSON.stringify(out));
        assert.ok(out.some((e) => e.key === "QUEUED_MISSIONARY"));
        world.cities[2].religion = 77;
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.deepEqual(trained(), [], "one settlement left: the Missionaries we have do");
        world.cities[2].religion = 88;
        world.religion = -1;
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.deepEqual(trained(), [], "no religion of ours");
    } finally {
        world.religion = 77;
        world.cities[2].religion = 88;
        delete world.canBuild;
    }
});

test("once ours follow, a Missionary converts the city-states we are suzerain of (no Missionary trained for them)", () => {
    const CS = { x: 18, y: 9 };
    world.cities.push({ owner: 6, ...CS, name: "Kabul" });
    const cs = Players.get(6);
    cs.isMinor = true;
    cs.Influence = { hasSuzerain: true, getSuzerain: () => 0 };
    const religions = world.cities.map((c) => c.religion);
    for (const c of world.cities) if (c.owner === 0) c.religion = 77;
    const owning = world.owningCity;
    world.owningCity = (x, y) => (GameplayMap.getPlotDistance(x, y, CS.x, CS.y) <= 1 ? { owner: 6, id: 0 } : owning(x, y));
    try {
        assert.deepEqual(missions.conversionTargets({ crisis: false }).map((t) => [t.city.name, t.foreign]), [["Kabul", true]]);
        assert.equal(missions.missionNeed({ crisis: false }), null, "none of ours to convert: no Missionary trained");
        units.resetUnitGoals();
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...NOLA }];
        fake.sent.length = 0;
        const r = units.commandUnits(DEFAULT_SETTINGS, {});
        const to = moveOf(4);
        assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, CS.x, CS.y) <= 1, JSON.stringify(r.entries));
    } finally {
        world.owningCity = owning;
        world.cities.forEach((c, i) => { c.religion = religions[i]; });
        world.cities.pop();
        world.units = [];
    }
});

// Game 43: a Missionary walked 73,20 <-> 74,20 every turn E55-E69: the game refused to spread on both of Нехеб's urban tiles
// (its urban half back to Buddhism, its rural half ours), and nothing remembered the refusal.
test("a Missionary the game refuses twice in a settlement leaves it for a while: no walking back and forth between its tiles", () => {
    units.resetUnitGoals();
    const structures = world.structures;
    world.structures = (x, y) => (x === NOLA.x + 1 && y === NOLA.y ? { district: "DISTRICT_URBAN", constructibles: [] } : structures(x, y));
    world.cities[1].religion = 77; // Capua follows ours: Nola is the only one to convert
    world.unitCanStart = (_id, op) => (op === SPREAD ? { Success: false, FailureReasons: ["LOC_TEST_REFUSED"] } : undefined);
    const turn = Game.turn;
    try {
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...NOLA }];
        Game.turn = turn + 1;
        run();
        assert.deepEqual([moveOf(4)?.X, moveOf(4)?.Y], [NOLA.x + 1, NOLA.y], "refused on the centre: the other urban tile");
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", x: NOLA.x + 1, y: NOLA.y }];
        Game.turn = turn + 2;
        run();
        assert.equal(moveOf(4), undefined, "refused there too: not back to the centre");
        Game.turn = turn + 3;
        run();
        assert.equal(moveOf(4), undefined);
        assert.deepEqual(world.crashes ?? [], [], "no call that crashes the game");
    } finally {
        delete world.crashes;
        Game.turn = turn;
        world.structures = structures;
        world.cities[1].religion = undefined;
        world.units = [];
        delete world.unitCanStart;
        units.resetUnitGoals();
    }
});

// Game 42: two Missionaries queued at E65-E66, one finished at E69 and never used.
test("no Missionary is trained in an age's last turns", () => {
    world.canBuild = (type, id) => ({ Success: type === "UNIT_MISSIONARY" ? id?.id === 0 : true });
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === GameInfo.Units.lookup("UNIT_MISSIONARY").$hash).length;
    world.costOf = (type) => (type === "UNIT_MISSIONARY" ? 10 : 100); // trained at once: done in time, too late to be used
    try {
        world.agePoints = 94; // about 7 turns left
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.equal(trained(), 0);
        world.agePoints = 50;
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.equal(trained(), 1, "earlier in the age");
    } finally {
        delete world.agePoints;
        delete world.canBuild;
        delete world.costOf;
    }
});
