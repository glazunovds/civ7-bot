// Game 60: repairs of pillaged tiles. 54 repairs for 1,408 gold (21% of Antiquity's income), 31 re-pillaged within 1-5 turns
// by one independent's Army Commander (a support unit: never a raider of ours), Тула's and Нижний Новгород's Woodcutters
// bought back 9 times each; four repairs queued in the capital while a wonder stood in its queue waited 21-33 turns and then
// took a turn of production each (~107 lost to the overflow cap). Now an improvement is bought from the free gold, also in a
// wonder city, and queued only where it cannot be bought (unrest, purchases off) and no wonder is queued; it waits while a
// hostile land unit of any class stands within 2 and for 6 turns after we repaired it; at most one repair stands in a city's
// queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const world = {
    width: 24, height: 14, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 35, isIndependent: true, name: "Raiders" }],
    cities: [
        { owner: 0, x: 3, y: 3, name: "Rome", prod: 20, queue: { type: "BUILDING_MONUMENT", turns: 3 } },
        { owner: 0, x: 12, y: 3, name: "Ostia", isTown: true },
    ],
    gold: 500,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { resetRepairWatch } = await import("../mod/expansion-planner/ui/data/xpl-repair-watch.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");
const { REPAIR, improvementRepairWait } = await import("../mod/expansion-planner/ui/core/xpl-repairs.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
// world.damaged: city id -> [{ type, x, y }] (the game's BUILD answer: RepairDamaged, the damaged tile in Plots).
world.canBuild = (type, id) => {
    const d = (world.damaged?.[id.id] ?? []).find((x) => x.type === type);
    if (d) return { Success: true, RepairDamaged: true, Plots: [idx(d.x, d.y)], InQueue: !!d.inQueue };
    return { Success: true, Plots: [] };
};
world.canBuy = (type) => ({ Success: true, Cost: type?.startsWith("IMPROVEMENT_") ? 24 : 60 });
const sent = (kind, op) => fake.sent.filter((s) => s.kind === kind && (op === undefined || s.op === op));
const bought = () => sent("command", CityCommandTypes.PURCHASE).map((s) => GameInfo.Constructibles.lookup(s.args.ConstructibleType).ConstructibleType);
const queued = () => sent("operation").filter((s) => s.args.InsertMode === undefined).map((s) => GameInfo.Constructibles.lookup(s.args.ConstructibleType).ConstructibleType);
const rome = world.cities[0];

function fresh() {
    fake.sent.length = 0;
    resetRepairWatch();
    world.gold = 500;
    for (const k of ["damaged", "enemies"]) delete world[k];
    delete rome.queued;
    Game.turn += 20; // a new turn: the once-a-turn lines and the repairs remembered start afresh
}

function lines(fn) {
    const out = [];
    const warn = console.warn;
    console.warn = (...a) => out.push(a.join(" "));
    try {
        return { result: fn(), out };
    } finally {
        console.warn = warn;
    }
}

test("the rule: an improvement waits for a hostile unit within 2, for 6 turns after its repair, for the age-end conversion", () => {
    assert.equal(improvementRepairWait({}), null);
    assert.equal(improvementRepairWait({ hostile: { type: "UNIT_ARMY_COMMANDER", d: 2 } })?.why, "HOSTILE");
    assert.equal(improvementRepairWait({ hostile: { type: "UNIT_ARMY_COMMANDER", d: 3 } }), null);
    assert.equal(improvementRepairWait({ repairedAgo: REPAIR.REPEAT_TURNS })?.why, "RECENT");
    assert.equal(improvementRepairWait({ repairedAgo: REPAIR.REPEAT_TURNS + 1 }), null);
    assert.equal(improvementRepairWait({ conversion: "Samara" })?.why, "CONVERT");
});

// Game 60: Byrsa's city and the capital queued repairs of a Camp, a Farm and a Saw Pit behind their wonders (A96-A125).
test("a pillaged improvement is bought where a wonder is queued, never queued; UI.log's probe says so", () => {
    fresh();
    rome.queued = ["WONDER_PYRAMIDS"];
    world.damaged = { 0: [{ type: "IMPROVEMENT_CAMP", x: 4, y: 4 }] };
    const { result, out } = lines(() => steps.repairBuildings());
    assert.deepEqual(bought(), ["IMPROVEMENT_CAMP"]);
    assert.deepEqual(queued(), []);
    assert.deepEqual(result.map((e) => e.key), ["REPAIR_BOUGHT"]);
    assert.ok(out.some((l) => l.includes("repairs: IMPROVEMENT_CAMP at 4,4 bought in Rome while WONDER_PYRAMIDS is in its queue")), out.join(" | "));
    // Short of gold it waits: an improvement is never queued (a building still is).
    fresh();
    world.gold = 10;
    world.damaged = { 0: [{ type: "IMPROVEMENT_CAMP", x: 4, y: 4 }, { type: "BUILDING_GRANARY", x: 3, y: 4 }] };
    steps.repairBuildings();
    assert.deepEqual(bought(), []);
    assert.deepEqual(queued(), ["BUILDING_GRANARY"]);
});

test("at most one repair stands in a city's queue; the one we queued goes to the front by our own record", () => {
    fresh();
    world.gold = 0;
    world.damaged = { 0: [{ type: "BUILDING_GRANARY", x: 3, y: 4 }, { type: "BUILDING_ALTAR", x: 4, y: 3 }] };
    let out = steps.repairBuildings();
    assert.equal(queued().length, 1, JSON.stringify(queued()));
    assert.deepEqual(out.map((e) => e.key), ["REPAIR_QUEUED"]);
    const first = queued()[0];
    // Next pass: the queue shows it behind another item, and the game lists the queued repair without its tile.
    fake.sent.length = 0;
    rome.queued = ["BUILDING_LIBRARY", first];
    world.damaged = { 0: [{ type: "BUILDING_GRANARY", x: 3, y: 4 }, { type: "BUILDING_ALTAR", x: 4, y: 3 }].filter((d) => d.type !== first) };
    steps.beginQueuePass();
    try {
        out = steps.repairBuildings();
    } finally {
        steps.endQueuePass();
    }
    assert.deepEqual(queued(), [], "one is in the queue already");
    const move = sent("operation").find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [2, 0], "ours, to the front (behind no progress)");
    assert.ok(out.some((e) => e.key === "REPAIR_FIRST"));
});

// Game 60: player 35's UNIT_ARMY_COMMANDER pillaged every second turn T89-T139; each Woodcutter was bought back 9 times.
test("an improvement waits while a hostile land unit of any class stands within 2 of it (an independent's Army Commander)", () => {
    fresh();
    world.damaged = { 1: [{ type: "IMPROVEMENT_WOODCUTTER", x: 13, y: 4 }] };
    world.enemies = [{ owner: 35, type: "UNIT_ARMY_COMMANDER", x: 14, y: 5 }];
    const { result, out } = lines(() => steps.repairBuildings());
    assert.deepEqual(bought(), []);
    assert.deepEqual(result.map((e) => e.key), ["REPAIR_DEFERRED"]);
    assert.ok(out.some((l) => l.includes("repairs: waiting") && l.includes("UNIT_ARMY_COMMANDER")), out.join(" | "));
    // At peace with that village: no wait.
    fresh();
    world.damaged = { 1: [{ type: "IMPROVEMENT_WOODCUTTER", x: 13, y: 4 }] };
    world.enemies = [{ owner: 35, type: "UNIT_ARMY_COMMANDER", x: 14, y: 5 }];
    world.indepRelation = { 35: IndependentRelationship.NEUTRAL };
    try {
        steps.repairBuildings();
        assert.deepEqual(bought(), ["IMPROVEMENT_WOODCUTTER"]);
    } finally {
        delete world.indepRelation;
    }
    // It walks 4 tiles away: bought.
    fresh();
    world.damaged = { 1: [{ type: "IMPROVEMENT_WOODCUTTER", x: 13, y: 4 }] };
    world.enemies = [{ owner: 35, type: "UNIT_ARMY_COMMANDER", x: 17, y: 4 }];
    steps.repairBuildings();
    assert.deepEqual(bought(), ["IMPROVEMENT_WOODCUTTER"]);
});

// The integration review of game 60's packages: since SCM-2 every danger reader counts only the units we see (PLAN.md §14);
// the repair's wait read MapUnits through the fog.
test("a hostile unit we do not see does not hold an improvement's repair back", () => {
    fresh();
    world.damaged = { 1: [{ type: "IMPROVEMENT_WOODCUTTER", x: 13, y: 4 }] };
    world.enemies = [{ owner: 35, type: "UNIT_ARMY_COMMANDER", x: 14, y: 5, hidden: true }];
    const result = steps.repairBuildings();
    assert.deepEqual(bought(), ["IMPROVEMENT_WOODCUTTER"]);
    assert.deepEqual(result.map((e) => e.key), ["REPAIR_BOUGHT"]);
});

test("a tile we repaired waits 6 turns before it is bought again (a pillager that comes back)", () => {
    fresh();
    world.damaged = { 1: [{ type: "IMPROVEMENT_WOODCUTTER", x: 13, y: 4 }] };
    steps.repairBuildings();
    assert.deepEqual(bought(), ["IMPROVEMENT_WOODCUTTER"]);
    Game.turn += 2;
    fake.sent.length = 0;
    const out = steps.repairBuildings();
    assert.deepEqual(bought(), [], "pillaged again 2 turns later");
    assert.equal(out[0]?.key, "REPAIR_DEFERRED");
    assert.ok(String(out[0]?.args[2]).includes("LOC_XPL_AP_REPAIR_WHY_RECENT"), JSON.stringify(out));
    Game.turn += REPAIR.REPEAT_TURNS - 1;
    fake.sent.length = 0;
    steps.repairBuildings();
    assert.deepEqual(bought(), ["IMPROVEMENT_WOODCUTTER"], "7 turns later");
});

// Game 60: a CONVERT goal held 950 while repairs took 1,408 from all the gold under it.
test("an improvement's repair takes the free gold (a savings goal keeps its own); a building's still takes all the gold", () => {
    fresh();
    world.damaged = { 0: [{ type: "IMPROVEMENT_FARM", x: 2, y: 3 }, { type: "BUILDING_GRANARY", x: 3, y: 4 }] };
    const b = createBudget({ gold: 500, reserve: 100 });
    b.setGoal({ kind: "CONVERT", key: "convert:12,3", label: "Ostia", cost: 380 });
    steps.repairBuildings({ budget: b });
    assert.deepEqual(bought(), ["BUILDING_GRANARY"], "20 free gold: the Farm's 24 waits");
});

// Review of game 60's build: «Settlements suffering from Unrest cannot purchase … Improvements, or Repairs» (Civilopedia),
// and with «Покупки» off nothing is bought: never queued, an improvement stayed pillaged all the while (game 60 had four
// settlements in unrest A109-A139). Where it cannot be bought it is queued, as before, unless a wonder waits in the queue.
test("an improvement that cannot be bought (unrest, purchases off) is queued, where no wonder waits in the queue", () => {
    const canBuy = world.canBuy;
    // The game sells nothing in a city in unrest (canPurchaseWhileInUnrest false: the fake's default).
    world.canBuy = (type, id) => (world.cities[id.id].unrest ? { Success: false, FailureReasons: ["LOC_UNREST"] } : canBuy(type, id));
    try {
        fresh();
        rome.unrest = true;
        world.damaged = { 0: [{ type: "IMPROVEMENT_FARM", x: 2, y: 3 }] };
        let out = steps.repairBuildings();
        assert.deepEqual(bought(), []);
        assert.deepEqual(queued(), ["IMPROVEMENT_FARM"]);
        assert.deepEqual(out.map((e) => e.key), ["REPAIR_QUEUED"]);
        // An effect lets it buy in unrest: bought.
        fresh();
        rome.unrest = true;
        rome.buyInUnrest = true;
        world.damaged = { 0: [{ type: "IMPROVEMENT_FARM", x: 2, y: 3 }] };
        world.canBuy = canBuy;
        steps.repairBuildings();
        assert.deepEqual(bought(), ["IMPROVEMENT_FARM"]);
        assert.deepEqual(queued(), []);
        delete rome.buyInUnrest;
        world.canBuy = (type, id) => (world.cities[id.id].unrest ? { Success: false, FailureReasons: ["LOC_UNREST"] } : canBuy(type, id));
        // A wonder waits in the queue: not queued behind it (it waits, and UI.log says the game refuses the purchase).
        fresh();
        rome.unrest = true;
        rome.queued = ["WONDER_PYRAMIDS"];
        world.damaged = { 0: [{ type: "IMPROVEMENT_FARM", x: 2, y: 3 }] };
        const r = lines(() => steps.repairBuildings());
        assert.deepEqual(queued(), []);
        assert.ok(r.out.some((l) => l.includes("repairs: waiting") && l.includes("LOC_UNREST")), r.out.join(" | "));
        // «Покупки» off: queued; still not while a hostile unit stands within 2 of it.
        fresh();
        world.damaged = { 0: [{ type: "IMPROVEMENT_FARM", x: 2, y: 3 }] };
        out = steps.repairBuildings({ buy: false });
        assert.deepEqual(queued(), ["IMPROVEMENT_FARM"]);
        fresh();
        world.damaged = { 0: [{ type: "IMPROVEMENT_FARM", x: 2, y: 3 }] };
        world.enemies = [{ owner: 35, type: "UNIT_ARMY_COMMANDER", x: 2, y: 4 }];
        out = steps.repairBuildings({ buy: false });
        assert.deepEqual(queued(), []);
        assert.deepEqual(out.map((e) => e.key), ["REPAIR_DEFERRED"]);
    } finally {
        world.canBuy = canBuy;
        delete rome.unrest;
        delete rome.buyInUnrest;
    }
});

// Review of game 60's build: with a wonder with progress in production, REPAIR_FIRST moved the repair right behind it, where
// the refund guard (guardWonderRefund) wants a big building, and the two took the city's one queue edit turn about.
test("a queued repair stays where it is while a wonder is in production, and goes to the front once the wonder is done", () => {
    const pass = () => {
        fake.sent.length = 0;
        steps.beginQueuePass();
        try {
            return steps.repairBuildings();
        } finally {
            steps.endQueuePass();
        }
    };
    const moves = () => sent("operation").filter((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo).map((s) => [s.args.QueueSourceLocation, s.args.QueueDestinationLocation]);
    try {
        fresh();
        world.gold = 0;
        rome.queue = { type: "WONDER_PYRAMIDS", turns: 5, pct: 50 };
        world.damaged = { 0: [{ type: "BUILDING_GRANARY", x: 3, y: 4 }] };
        assert.deepEqual(pass().map((e) => e.key), ["REPAIR_QUEUED"]);
        // The queue shows it behind a Library (and the game lists it without its tile).
        world.damaged = {};
        rome.queued = ["BUILDING_LIBRARY", "BUILDING_GRANARY"];
        for (let i = 0; i < 2; i++) {
            const out = pass();
            assert.deepEqual(moves(), [], `pass ${i + 1}`);
            assert.ok(!out.some((e) => e.key === "REPAIR_FIRST"));
        }
        // The wonder is done: the repair goes first.
        rome.queue = { type: "BUILDING_LIBRARY", turns: 4 };
        rome.queued = ["BUILDING_GRANARY"];
        assert.ok(pass().some((e) => e.key === "REPAIR_FIRST"));
        assert.deepEqual(moves(), [[1, 0]]);
    } finally {
        rome.queue = { type: "BUILDING_MONUMENT", turns: 3 };
    }
});

// Review of game 60's build: our record of the repairs we queued is runtime state; after a reload a queued repair the game
// lists without its tile was invisible again (no REPAIR_FIRST, no QUEUED_MAX). A queued building standing damaged on its own
// tile is a repair.
test("after a reload: a queued building standing damaged on its tile is a repair (it goes first, and counts for the one in the queue)", () => {
    try {
        fresh();
        steps.repairBuildings(); // an empty queue: the record of earlier tests is dropped, as a reload would
        fresh();
        world.gold = 0;
        rome.queued = ["BUILDING_LIBRARY", { type: "BUILDING_GRANARY", x: 3, y: 4 }];
        world.structures = (x, y) => (x === 3 && y === 4 ? { district: "DISTRICT_URBAN", constructibles: ["BUILDING_GRANARY"], damaged: ["BUILDING_GRANARY"] } : { district: null, constructibles: [] });
        world.damaged = { 0: [{ type: "BUILDING_ALTAR", x: 4, y: 3 }] }; // the queued Granary is listed without its tile
        steps.beginQueuePass();
        let out;
        try {
            out = steps.repairBuildings();
        } finally {
            steps.endQueuePass();
        }
        assert.deepEqual(queued(), [], "one repair is in the queue already");
        const move = sent("operation").find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
        assert.deepEqual([move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [2, 0]);
        assert.ok(out.some((e) => e.key === "REPAIR_FIRST"));
        // Standing undamaged there: a building to build, not a repair (nothing moves; the Altar's repair is queued).
        fresh();
        world.gold = 0;
        rome.queued = ["BUILDING_LIBRARY", { type: "BUILDING_GRANARY", x: 3, y: 4 }];
        world.structures = (x, y) => (x === 3 && y === 4 ? { district: "DISTRICT_URBAN", constructibles: ["BUILDING_GRANARY"] } : { district: null, constructibles: [] });
        world.damaged = { 0: [{ type: "BUILDING_ALTAR", x: 4, y: 3 }] };
        steps.beginQueuePass();
        try {
            out = steps.repairBuildings();
        } finally {
            steps.endQueuePass();
        }
        assert.deepEqual(queued(), ["BUILDING_ALTAR"]);
        assert.ok(!out.some((e) => e.key === "REPAIR_FIRST"));
        // An entry with no tile: the city's tiles, unless the building may stand more than once there (walls: MultiplePerCity).
        for (const [type, repair] of [["BUILDING_GRANARY", true], ["BUILDING_ANCIENT_WALLS", false]]) {
            fresh();
            world.gold = 0;
            rome.queued = ["BUILDING_LIBRARY", type];
            world.structures = (x, y) => (x === 3 && y === 4 ? { district: "DISTRICT_URBAN", constructibles: [type], damaged: [type] } : { district: null, constructibles: [] });
            world.damaged = { 0: [{ type: "BUILDING_ALTAR", x: 4, y: 3 }] };
            steps.beginQueuePass();
            try {
                out = steps.repairBuildings();
            } finally {
                steps.endQueuePass();
            }
            assert.equal(out.some((e) => e.key === "REPAIR_FIRST"), repair, type);
            assert.deepEqual(queued(), repair ? [] : ["BUILDING_ALTAR"], type);
        }
    } finally {
        delete world.structures;
    }
});
