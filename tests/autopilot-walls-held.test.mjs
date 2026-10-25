// Game 60 (Antiquity): walls for another district of the capital, its centre walled and scratched to 181 of 200, went ahead of
// the Ha'amonga a Maui two turns from done, and the wonder was lost by a turn; walls were queued on four more districts of walled
// centres against independents and ships (80 to 140 production each), one of them ahead of Byrsa at 81%; and Archers were bought
// against ships that never hit a walled centre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const DISTRICT = { x: LONDON.x + 1, y: LONDON.y };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: 0 }),
    structures: (x, y) => (x === LONDON.x && y === LONDON.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 2 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [{ owner: 0, ...LONDON, name: "London", pop: 8, prod: 25, queue: { type: "BUILDING_MONUMENT", turns: 5 } }],
    gold: 1000,
    goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const WALLS = () => GameInfo.Constructibles.lookup("BUILDING_ANCIENT_WALLS").$hash;
const london = world.cities[0];
const indep = [{ id: 5, independent: true }];
const threatOf = (extra = {}) => ({ settlement: { name: "London", ...LONDON }, count: 3, land: 2, ships: 0, owners: indep, ...extra });
const capture = (fn) => {
    const lines = [];
    const [warn, info] = [console.warn, console.info];
    console.warn = (...a) => lines.push(a.join(" "));
    console.info = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        [console.warn, console.info] = [warn, info];
    }
    return lines;
};
const move = () => {
    const m = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    return m ? [m.args.QueueSourceLocation, m.args.QueueDestinationLocation] : null;
};
const wallsSent = () => fake.sent.filter((s) => s.args.ConstructibleType === WALLS()).map((s) => s.kind);
const keep = { queue: london.queue, queued: london.queued };
const restore = () => {
    london.queue = keep.queue;
    london.queued = keep.queued;
    delete world.canBuild;
    delete world.canBuy;
    world.units = [];
    steps.resetWar();
    state.set({ results: { ...state.get().results, wonders: null } });
};
// The Pyramids in production, 87% done and 2 turns left; a rival `rival` turns from done (omniscient).
const racedWonder = (rival) => {
    london.queue = { type: "WONDER_PYRAMIDS", turns: 2, pct: 87 };
    const row = { type: "WONDER_PYRAMIDS", status: "IN_PROGRESS", inQueue: { cityKey: `c:${LONDON.x}-${LONDON.y}`, turns: 2 }, rivalTurns: [rival] };
    state.set({ results: { ...state.get().results, wonders: { rows: [row], ageTurnsLeft: 50 } } });
};

test("walls for another district of a walled centre wait their turn: never ahead of a wonder in production (game 60: Ha'amonga a Maui, 181/200)", () => {
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    try {
        racedWonder(3);
        london.queued = ["BUILDING_LIBRARY", { type: "BUILDING_ANCIENT_WALLS", ...DISTRICT }];
        fake.sent.length = 0;
        steps.fortifyThreatened([threatOf({ damaged: true, walled: true, health: 181, maxHealth: 200 })]);
        assert.deepEqual(move(), [2, 1], "behind the wonder, not at the very front");
        // A district's walls behind a plain building with progress: they wait their turn too (frontSlot).
        london.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 60 };
        fake.sent.length = 0;
        steps.fortifyThreatened([threatOf({ damaged: true, walled: false, health: 181, maxHealth: 200 })]);
        assert.deepEqual(move(), [2, 1], "walls ordered on a district tile, the centre unwalled");
    } finally {
        restore();
    }
});

test("walls for another district still go first when the walled centre is below half its health, or a war is at our door (a settlement falls once every fortified district is taken)", () => {
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    try {
        london.queue = { type: "BUILDING_MONUMENT", turns: 3, pct: 60 };
        london.queued = ["BUILDING_LIBRARY", { type: "BUILDING_ANCIENT_WALLS", ...DISTRICT }];
        fake.sent.length = 0;
        steps.fortifyThreatened([threatOf({ damaged: true, walled: true, health: 90, maxHealth: 200 })]);
        assert.deepEqual(move(), [2, 0], "90 of 200: ahead of the Monument with progress");
        // A major's raiders: a war at our door.
        const major = threatOf({ walled: true, owners: [{ id: 2, independent: false }] });
        steps.assessWar([major]);
        assert.equal(steps.warState().near, true);
        fake.sent.length = 0;
        steps.fortifyThreatened([major]);
        assert.deepEqual(move(), [2, 0], "a war at our door, the centre at full health: ahead of a plain building");
        racedWonder(5); // ours in 2, the rival's in 5: holdsFront keeps the wonder
        fake.sent.length = 0;
        steps.fortifyThreatened([major]);
        assert.deepEqual(move(), [2, 0], "a war at our door: ahead of a raced wonder too (the user's rule after game 27)");
    } finally {
        restore();
    }
});

test("walls at a walled centre pass a raced wonder only below half its health; a scratch does not send them ahead (game 60), an unwalled centre under attack does", () => {
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    const run = (extra) => {
        fake.sent.length = 0;
        steps.fortifyThreatened([threatOf(extra)]);
        return move();
    };
    try {
        racedWonder(5); // ours in 2, the rival's in 5: the walls' turns would lose it
        london.queued = ["BUILDING_ANCIENT_WALLS"];
        assert.equal(run({ damaged: true, walled: true, health: 181, maxHealth: 200 }), null, "a walled centre at 181 of 200 (game 60): the wonder keeps the front");
        assert.deepEqual(run({ damaged: true, health: 181, maxHealth: 200 }), [1, 0], "an unwalled centre under attack: the walls go first (the user's rule after game 27)");
        assert.deepEqual(run({ damaged: true, health: 90, maxHealth: 200 }), [1, 0], "90 of 200: the walls go first");
        assert.deepEqual(run({ damaged: true }), [1, 0], "damaged, its health unknown: as before");
        // A race we lose anyway (the rival's 1 turn against our 2): the walls go first.
        racedWonder(1);
        assert.deepEqual(run({ damaged: true, health: 181, maxHealth: 200 }), [1, 0]);
        assert.equal(units.centreLow({ damaged: true, health: 100, maxHealth: 200 }), false, "half its health is not below half");
    } finally {
        restore();
    }
});

test("no more walls for a walled centre that holds against independents, nor against ships alone; an unwalled centre or a major's raiders still get them (game 60: ~520 production)", () => {
    const district = GameplayMap.getIndexFromXY(DISTRICT.x, DISTRICT.y);
    world.canBuild = (type) => (type === undefined ? { Success: true } : type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [district], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });
    world.canBuy = (type) => (type === "BUILDING_ANCIENT_WALLS" ? { Success: true, Plots: [district], Cost: 5000 } : { Success: false });
    const run = (extra) => {
        fake.sent.length = 0;
        let keys = [];
        const lines = capture(() => {
            keys = steps.fortifyThreatened([threatOf(extra)]).map((e) => e.key);
        });
        return { keys, lines: lines.filter((l) => l.includes("walls: London")) };
    };
    const turn = Game.turn;
    try {
        london.queued = [];
        let r = run({ walled: true });
        assert.deepEqual([r.keys, wallsSent()], [[], []], "independents, the centre unhit");
        assert.ok(r.lines.some((l) => l.includes("walled, independents only: no more walls")), JSON.stringify(r.lines));
        Game.turn += 1; // UI.log says it once a turn
        r = run({ walled: true, land: 0, ships: 2, count: 2 });
        assert.deepEqual([r.keys, wallsSent()], [[], []], "ships only");
        assert.ok(r.lines.some((l) => l.includes("walled, ships only: no more walls")), JSON.stringify(r.lines));
        assert.deepEqual(run({ walled: false }).keys, ["WALLS_QUEUED"], "no walls on the centre yet");
        assert.deepEqual(run({ walled: true, owners: [{ id: 2, independent: false }] }).keys, ["WALLS_QUEUED"], "a major's raiders");
        assert.deepEqual(run({ walled: true, damaged: true, health: 150, maxHealth: 200 }).keys, ["WALLS_QUEUED"], "the centre hit: the walls do not hold");
    } finally {
        Game.turn = turn;
        restore();
    }
});

test("ships alone at a walled centre they have not hit: no ranged guard bought (trained or sent instead); once they hit it, bought (game 60: Archers for 200 against ships)", () => {
    const sells = { UNIT_WARRIOR: 100, UNIT_ARCHER: 120 };
    world.canBuild = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_WARRIOR", "UNIT_ARCHER"].includes(type) } : undefined);
    world.canBuy = (type) => (sells[type] !== undefined ? { Success: true, Cost: sells[type] } : { Success: false });
    settings.remember(gameKey(), { melee: null });
    const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType);
    const ships = (extra = {}) => [threatOf({ count: 2, land: 0, ships: 2, walled: true, ...extra })];
    const turn = Game.turn;
    try {
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...LONDON }]; // its melee guard stands on the centre
        steps.resetWar();
        fake.sent.length = 0;
        const lines = capture(() => steps.buyDefenders(ships(), { reserveTurns: 0 }));
        assert.deepEqual(bought(), [], "a walled centre at full health");
        assert.ok(lines.some((l) => l.includes("ships only at its walled centre")), JSON.stringify(lines));
        fake.sent.length = 0;
        steps.buyDefenders(ships({ walled: false }), { reserveTurns: 0 });
        assert.deepEqual(bought(), ["UNIT_ARCHER"], "no walls: an archer bought as before");
        // Hit two turns ago (noteThreats saw the centre damaged): bought.
        steps.resetWar();
        Game.turn = turn + 10;
        steps.noteThreats(ships({ damaged: true, health: 150, maxHealth: 200 }));
        Game.turn = turn + 12;
        fake.sent.length = 0;
        steps.buyDefenders(ships(), { reserveTurns: 0 });
        assert.deepEqual(bought(), ["UNIT_ARCHER"], "hit lately");
        Game.turn = turn + 15; // 5 turns since: unhit again
        steps.noteThreats(ships());
        fake.sent.length = 0;
        steps.buyDefenders(ships(), { reserveTurns: 0 });
        assert.deepEqual(bought(), [], "unhit for 5 turns");
    } finally {
        Game.turn = turn;
        restore();
    }
});

test("walls right behind a wonder in production keep that place: the refund guard does not move a building ahead of them (the two would take turns there every pass)", () => {
    world.canBuild = (type) => (type === undefined ? { Success: true } : { Success: false, Plots: [] });
    world.costOf = (type) => (type.startsWith("WONDER_") ? 400 : type === "BUILDING_ANCIENT_WALLS" ? 60 : type === "BUILDING_LIBRARY" ? 200 : 100);
    const threat = threatOf({ damaged: true, walled: true, health: 181, maxHealth: 200 });
    const moves = [];
    const pass = () => {
        fake.sent.length = 0;
        steps.beginQueuePass();
        try {
            steps.fortifyThreatened([threat]);
            steps.frontLoadUnits({ defend: true, threats: [threat] });
        } finally {
            steps.endQueuePass();
        }
        const m = move();
        if (m) moves.push(m);
        // The game carries the move out.
        if (m) london.queued.splice(m[1] - 1, 0, ...london.queued.splice(m[0] - 1, 1));
    };
    try {
        london.queue = { type: "WONDER_PYRAMIDS", turns: 8, pct: 50 }; // a refund of 200 / 2 + 25; the walls have room for 60
        london.queued = [{ type: "BUILDING_ANCIENT_WALLS", ...DISTRICT }, "BUILDING_LIBRARY"];
        pass();
        pass();
        assert.ok(moves.length <= 1, JSON.stringify(moves));
    } finally {
        delete world.costOf;
        restore();
    }
});
