// Game 60 (research/game60 mechanics M4, M8): one Altar in seven settlements while the pantheon pays only through Altars, and
// codices waiting in the archive with no Library all Antiquity. The building plan values the Altar by our pantheon there and
// a great-work slot by the works waiting for it, in the plan's order and in the purchases' value (`net`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, hash } from "./fakes/fake-engine.mjs";

const C = { x: 10, y: 8 };
const T = { x: 16, y: 8 };
const ring = (c) => [[c.x + 1, c.y], [c.x - 1, c.y], [c.x - 1, c.y - 1], [c.x, c.y - 1], [c.x - 1, c.y + 1], [c.x, c.y + 1]]; // odd-r, an even row
const world = {
    width: 24, height: 18, wrapX: false,
    tiles: (x, y) => {
        const owned = (Math.abs(x - C.x) <= 1 || Math.abs(x - T.x) <= 1) && Math.abs(y - C.y) <= 1;
        // Four resource tiles around the capital, two around the town (God of Revelry: +1 Happiness on each with an Altar).
        const resource = [...ring(C).slice(0, 4), ...ring(T).slice(0, 2)].some(([a, b]) => a === x && b === y) ? "RESOURCE_WINE" : undefined;
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: owned ? 0 : -1, ...(resource ? { resource } : {}) };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Moscow", pop: 6, prod: 12, gwBuildings: [{ type: "BUILDING_PALACE", slots: [9] }] }],
};
installFakeEngine(world);
const { allTarget, listTargets, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { purchaseAdvice } = await import("../mod/expansion-planner/ui/data/xpl-city-actions.js");
const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { profileFor } = await import("../mod/expansion-planner/ui/core/xpl-profiles.js");
const { yieldIndex } = await import("../mod/expansion-planner/ui/core/xpl-yields.js");

const settings = { ...DEFAULT_SETTINGS, buildings: { ...DEFAULT_SETTINGS.buildings, incremental: false, selected: ["BUILDING_ALTAR", "BUILDING_LIBRARY", "BUILDING_MONUMENT"] } };
const weight = (y) => profileFor(settings).y[yieldIndex(y)];
const row = (type) => state.get().results.plans.placements.find((p) => p.type === type);
const plan = async () => {
    clearEngineCache();
    await startBuildingPlan(listTargets()[0], settings).promise;
};
const table = (rows, key) => ({ filter: (f) => rows.filter(f), find: (f) => rows.find(f), lookup: (k) => rows.find((r) => r[key] === k || hash(r[key]) === k) ?? null, [Symbol.iterator]: () => rows[Symbol.iterator](), length: rows.length });
const stubs = (tables, fn) => async () => {
    const before = Object.fromEntries(Object.keys(tables).map((k) => [k, GameInfo[k]]));
    Object.assign(GameInfo, tables);
    try {
        await fn();
    } finally {
        Object.assign(GameInfo, before);
    }
};

test("M4: the Altar is worth our pantheon's yields in its settlement (God of Revelry: +1 Happiness on each resource tile)", stubs({
    Beliefs: table([{ BeliefType: "PANTHEON_BONUS_17", BeliefClassType: "BELIEF_CLASS_PANTHEON", Shareable: "true" }], "BeliefType"),
}, async () => {
    try {
        await plan();
        const before = row("BUILDING_ALTAR");
        assert.equal(before?.extra, 0, "no pantheon: nothing more");
        world.pantheons = [hash("PANTHEON_BONUS_17")];
        await plan();
        const after = row("BUILDING_ALTAR");
        assert.ok(after, JSON.stringify(state.get().results.plans.unplaced));
        assert.equal(after.extra, Math.round(4 * weight("YIELD_HAPPINESS") * 10) / 10, "four resource tiles");
        assert.ok(after.net > before.net + 3, `net ${before.net} -> ${after.net}`);
        assert.match(state.get().results.plans.inputSig, /PANTHEON_BONUS_17/, "a pantheon founded is a new plan");
    } finally {
        delete world.pantheons;
    }
}));

test("M4: a town's Altar too (towns buy theirs): its purchase is worth the pantheon there", stubs({
    Beliefs: table([{ BeliefType: "PANTHEON_BONUS_17", BeliefClassType: "BELIEF_CLASS_PANTHEON", Shareable: "true" }], "BeliefType"),
}, async () => {
    world.cities.push({ owner: 0, x: T.x, y: T.y, name: "Tula", isTown: true, pop: 4, prod: 6 });
    world.canBuy = (type) => (type === "BUILDING_ALTAR" ? { Success: true, Plots: ring(T).map(([x, y]) => GameplayMap.getIndexFromXY(x, y)), Cost: 100 } : { Success: false });
    try {
        const townAltar = async () => {
            clearEngineCache();
            await startBuildingPlan(allTarget(), settings).promise;
            const plans = state.get().results.plans;
            const town = plans.members.find((m) => m.name.startsWith("Tula"))?.key;
            return { plans, row: plans.placements.find((p) => p.type === "BUILDING_ALTAR" && p.sid === town) };
        };
        const before = await townAltar();
        assert.ok(before.row, JSON.stringify(before.plans.unplaced));
        assert.equal(before.row.extra, 0);
        world.pantheons = [hash("PANTHEON_BONUS_17")];
        const after = await townAltar();
        assert.equal(after.row.extra, Math.round(2 * weight("YIELD_HAPPINESS") * 10) / 10, "two resource tiles in Tula");
        const pick = (p) => purchaseAdvice(p.plans, settings, 10).picks.find((x) => x.sid === p.row.sid && x.type === "BUILDING_ALTAR");
        assert.ok(pick(after)?.perTurn > (pick(before)?.perTurn ?? 0), `${pick(before)?.perTurn} -> ${pick(after)?.perTurn}`);
    } finally {
        delete world.pantheons;
        delete world.canBuy;
        world.cities.pop();
    }
}));

test("M8: a Library's writing slots are worth the codices waiting in the archive (3 waiting: its 2 slots), none with an empty archive", stubs({
    Constructible_GreatWorks: table([
        { ConstructibleType: "BUILDING_LIBRARY", GreatWorkSlotType: "GREATWORKSLOT_WRITING", NumSlots: 2 },
        { ConstructibleType: "BUILDING_PALACE", GreatWorkSlotType: "GREATWORKSLOT_WRITING", NumSlots: 1 },
    ], "ConstructibleType"),
    GreatWork_YieldChanges: table(["GREATWORK_CODEX_1", "GREATWORK_CODEX_2", "GREATWORK_CODEX_3"].map((t) => ({ GreatWorkType: t, YieldType: "YIELD_SCIENCE", YieldChange: 2 })), "GreatWorkType"),
}, async () => {
    try {
        await plan();
        const empty = row("BUILDING_LIBRARY");
        assert.equal(empty?.extra, 0);
        // The Palace's slot holds a codex already (index 9); three more wait.
        world.greatWorks = { 9: "GREATWORK_CODEX_1", 1: "GREATWORK_CODEX_1", 2: "GREATWORK_CODEX_2", 3: "GREATWORK_CODEX_3" };
        world.archive = [1, 2, 3];
        await plan();
        const lib = row("BUILDING_LIBRARY");
        assert.equal(lib.extra, Math.round(2 * 2 * weight("YIELD_SCIENCE") * 10) / 10, "two codices of 2 Science");
        assert.ok(lib.net > empty.net, `net ${empty.net} -> ${lib.net}`);
        assert.match(state.get().results.plans.inputSig, /GREATWORKOBJECT_WRITING:2/, "3 wait; one building takes 2 at most");
        // An empty slot in the Palace takes one of them first: two left for the Library.
        world.cities[0].gwBuildings = [{ type: "BUILDING_PALACE", slots: [-1] }];
        await plan();
        assert.equal(row("BUILDING_LIBRARY").extra, Math.round(2 * 2 * weight("YIELD_SCIENCE") * 10) / 10);
        world.archive = [1];
        await plan();
        assert.equal(row("BUILDING_LIBRARY").extra, 0, "the one waiting goes into the Palace's empty slot");
    } finally {
        delete world.greatWorks;
        delete world.archive;
        world.cities[0].gwBuildings = [{ type: "BUILDING_PALACE", slots: [9] }];
    }
}));

// The rows of an Exploration game: relic slots in the Palace and the Temple; Antiquity's Library has none (its writing slots
// load with age-antiquity's greatworks.xml only).
const exploration = {
    Constructible_GreatWorks: table([
        { ConstructibleType: "BUILDING_PALACE", GreatWorkSlotType: "GREATWORKSLOT_RELIC", NumSlots: 1 },
        { ConstructibleType: "BUILDING_TEMPLE", GreatWorkSlotType: "GREATWORKSLOT_RELIC", NumSlots: 1 },
    ], "ConstructibleType"),
    GreatWorks: table(["GREATWORK_RELIC_1", "GREATWORK_RELIC_2", "GREATWORK_RELIC_3", "GREATWORK_RELIC_4", "GREATWORK_RELIC_5", "GREATWORK_RELIC_6"]
        .map((t) => ({ GreatWorkType: t, GreatWorkObjectType: "GREATWORKOBJECT_RELIC" })), "GreatWorkType"),
    GreatWork_ValidSubTypes: table([], "GreatWorkSlotType"),
    GreatWork_YieldChanges: table([], "GreatWorkType"),
};
const { archiveSignature, relicsWaiting } = await import("../mod/expansion-planner/ui/data/xpl-building-extras.js");

test("an empty slot of a building with no slot row this age, or a damaged one, takes no waiting relic", stubs(exploration, async () => {
    // The first build counted such a slot as GREATWORKSLOT_ANY: a carried-over Library's empty codex slot took the relic, and
    // the culture path's Temple (relicsWaiting) and the slots' value went to 0.
    world.greatWorks = { 1: "GREATWORK_RELIC_1" };
    world.archive = [1];
    try {
        world.cities[0].gwBuildings = [{ type: "BUILDING_LIBRARY", slots: [-1, -1] }];
        assert.equal(relicsWaiting(), 1);
        world.cities[0].gwBuildings = [{ type: "BUILDING_PALACE", slots: [-1], damaged: true }];
        assert.equal(relicsWaiting(), 1, "a damaged Palace's slot");
        world.cities[0].gwBuildings = [{ type: "BUILDING_PALACE", slots: [-1] }];
        assert.equal(relicsWaiting(), 0, "the Palace's empty relic slot takes it");
    } finally {
        delete world.greatWorks;
        delete world.archive;
        world.cities[0].gwBuildings = [{ type: "BUILDING_PALACE", slots: [9] }];
    }
}));

test("the plan's archive input stops at what one building takes: 1 or 6 relics waiting for one-slot Temples is one plan", stubs(exploration, async () => {
    // Every relic that came or was slotted forced a full plan (root gotcha 16), though a Temple's one slot is worth the same.
    world.greatWorks = { 1: "GREATWORK_RELIC_1", 2: "GREATWORK_RELIC_2", 3: "GREATWORK_RELIC_3", 4: "GREATWORK_RELIC_4", 5: "GREATWORK_RELIC_5", 6: "GREATWORK_RELIC_6" };
    world.cities[0].gwBuildings = [{ type: "BUILDING_PALACE", slots: [9] }];
    try {
        world.archive = [1];
        const one = archiveSignature();
        assert.equal(one, "GREATWORKOBJECT_RELIC:1");
        world.archive = [1, 2, 3, 4, 5, 6];
        assert.equal(archiveSignature(), one);
        world.archive = [];
        assert.equal(archiveSignature(), "", "nothing waits");
    } finally {
        delete world.greatWorks;
        delete world.archive;
    }
}));
