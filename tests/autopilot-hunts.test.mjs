// Village hunts (the user, 21 October, after game 50: "we can hunt villages that will not be befriended: not enough points,
// half past the era, or even one another civilization befriends if that will not cause a war"). The generals' XP comes
// only from fights in their radius, and peaceful games gave none. A hunt gathers the soldiers the defence leaves free with a
// commander 2 tiles from the village, declares war on it only then, strikes its soldiers when the preview pays, and steps
// onto the empty village to disperse it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 5 };
const VILLAGE = { x: 11, y: 5 };
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...ATHENS, name: "Athens", pop: 6, prod: 10 }],
    units: [],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const NEUTRAL = IndependentRelationship.NEUTRAL;
const army = () => [
    { id: 1, type: "UNIT_WARRIOR", ...ATHENS }, // the garrison stays
    { id: 2, type: "UNIT_WARRIOR", x: 6, y: 5 },
    { id: 3, type: "UNIT_WARRIOR", x: 6, y: 6 },
    { id: 4, type: "UNIT_WARRIOR", x: 5, y: 6 },
    { id: 7, type: "UNIT_ARMY_COMMANDER", x: 4, y: 5 },
];
// The village of the Nubians, neutral; befriending it costs 200 Influence, we have 0 and make 5 a turn: not within 10 turns.
const reset = (extra = {}) => {
    units.resetUnitGoals();
    choices.resetPeace?.();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "events", "befriend", "influence", "playerYields", "indepRelation", "combat", "agePoints"]) delete world[k];
    world.units = army();
    world.villages = [{ owner: 9, ...VILLAGE }];
    Object.assign(world, { indepRelation: { 9: NEUTRAL }, befriend: { 9: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } } }, extra);
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, hunt: true, threats: [], fronts: [], exposed: [], ...options });
const keys = (r) => r.entries.map((e) => e.key);
const dist = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const declared = () => fake.sent.filter((s) => s.kind === "player" && s.op === PlayerOperationTypes.DECLARE_WAR);

test("a village our Influence will not befriend within 10 turns is hunted: the free soldiers and the commander gather 2 tiles from it", () => {
    reset();
    const r = run();
    assert.ok(keys(r).includes("HUNT_STARTED"), JSON.stringify(r.entries));
    const op = units.fieldOpState();
    assert.equal(op?.kind, "HUNT");
    assert.equal(op.reason, "INFLUENCE");
    assert.equal(op.stage, "GATHER");
    assert.equal(dist(op.staging, VILLAGE), 2);
    assert.deepEqual([...op.members].sort(), ["0:2", "0:3", "0:4"], "not the garrison");
    assert.equal(op.commander, "0:7");
    assert.ok(keys(r).filter((k) => k === "FIELD_GATHER").length >= 3, JSON.stringify(r.entries));
    assert.deepEqual(declared(), [], "no war while they gather (its units would raid)");
});

test("no hunt: the option off, a village we can afford to befriend early, one an unfriendly leader befriends, one we befriend", () => {
    reset();
    assert.ok(!keys(run({ hunt: false })).includes("HUNT_STARTED"), "off");
    reset({ befriend: { 9: { status: 0, cost: 40 } }, influence: 50 });
    assert.ok(!keys(run()).includes("HUNT_STARTED"), "we befriend it soon");
    reset({ befriend: { 9: { status: 0, cost: 40 } }, influence: 50, agePoints: 60 });
    assert.ok(keys(run()).includes("HUNT_STARTED"), "past half the age it is hunted");
    reset({ events: { 9: [{ initialPlayer: 1, actionType: DiplomacyActionTypes.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN }] }, relations: { 1: "UNFRIENDLY" } });
    assert.ok(!keys(run()).includes("HUNT_STARTED"), "Rome, unfriendly, befriends it: no war over it");
    reset({ events: { 9: [{ initialPlayer: 1, actionType: DiplomacyActionTypes.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN }] }, relations: { 1: "NEUTRAL" } });
    assert.equal(units.fieldOpState() ?? null, null);
    run();
    assert.equal(units.fieldOpState()?.reason, "OTHERS", "a neutral Rome befriends it: hunted");
    reset({ befriend: { 9: { status: 1, cost: 200, ongoing: true } } });
    assert.ok(!keys(run()).includes("HUNT_STARTED"), "our own befriending");
    delete world.relations;
});

test("gathered, the hunt declares war on the village and fights; an empty village gets a soldier, who disperses it; then it ends", () => {
    reset();
    run();
    const op = units.fieldOpState();
    // Everyone at the staging area (the commander too).
    const around = [op.staging, ...[...Array(6)].map((_, i) => ({ x: op.staging.x + [1, -1, 0, 0, 1, -1][i], y: op.staging.y + [0, 0, 1, -1, 1, -1][i] }))]
        .filter((l) => dist(l, op.staging) <= 1 && !(l.x === VILLAGE.x && l.y === VILLAGE.y));
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...ATHENS }, ...[2, 3, 4].map((id, i) => ({ id, type: "UNIT_WARRIOR", ...around[i] })), { id: 7, type: "UNIT_ARMY_COMMANDER", ...around[3] }];
    fake.sent.length = 0;
    let r = run();
    assert.ok(keys(r).includes("HUNT_FIGHT"), JSON.stringify(r.entries));
    assert.deepEqual(declared().map((s) => [s.args.Player2, s.args.Type]), [[9, DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_WAR]], "war on the village, as the map declares it");
    assert.equal(units.fieldOpState().stage, "FIGHT");
    // At war; the village empty: the member nearest it steps on and disperses it.
    world.wars = [9];
    world.indepRelation = { 9: IndependentRelationship.HOSTILE };
    const next = world.units.find((u) => u.id !== 1 && u.id !== 7 && dist(u, VILLAGE) <= 2);
    assert.ok(next, "a member within 2 of the village");
    fake.sent.length = 0;
    return units.fieldAssault().then((entries) => {
        assert.ok(entries.some((e) => e.key === "DISPERSE_MOVE"), JSON.stringify(entries));
        const mover = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO && s.args.X === VILLAGE.x && s.args.Y === VILLAGE.y);
        assert.ok(mover, JSON.stringify(fake.sent));
        // It arrives; disperseArrivals disperses it.
        world.units.find((u) => u.id === mover.id.id).x = VILLAGE.x;
        world.units.find((u) => u.id === mover.id.id).y = VILLAGE.y;
        fake.sent.length = 0;
        const d = units.disperseArrivals();
        assert.deepEqual(d.map((e) => e.key), ["DISPERSED"]);
        // The village gone: the hunt ends DONE.
        world.villages = [];
        r = run();
        assert.ok(keys(r).includes("HUNT_ENDED"), JSON.stringify(r.entries));
        assert.equal(units.fieldOpState(), null);
    });
});

test("a member next to the village's soldier strikes it when the game's preview pays; a poor trade is left", async () => {
    // The village's Warrior at 10,6; our members gathered around 9,6 already.
    reset({ enemies: [{ x: 10, y: 6, owner: 9, type: "UNIT_WARRIOR" }] });
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...ATHENS }, { id: 2, type: "UNIT_WARRIOR", x: 9, y: 6 }, { id: 3, type: "UNIT_WARRIOR", x: 10, y: 7 },
        { id: 4, type: "UNIT_WARRIOR", x: 8, y: 5 }, { id: 7, type: "UNIT_ARMY_COMMANDER", x: 8, y: 4 }];
    run();
    assert.equal(units.fieldOpState()?.stage, "GATHER");
    run();
    assert.equal(units.fieldOpState()?.stage, "FIGHT", "all within 2 of the staging tile: the fight");
    world.wars = [9];
    world.indepRelation = { 9: IndependentRelationship.HOSTILE };
    assert.equal(dist({ x: 9, y: 6 }, { x: 10, y: 6 }), 1);
    assert.equal(dist({ x: 10, y: 7 }, { x: 10, y: 6 }), 1);
    world.combat = (id) => (id.id === 2 ? { dealt: 60, taken: 15 } : { dealt: 10, taken: 40 });
    fake.sent.length = 0;
    const entries = await units.fieldAssault();
    assert.ok(entries.some((e) => e.key === "FIELD_STRUCK"), JSON.stringify(entries));
    assert.ok(fake.sent.some((s) => s.op === UnitOperationTypes.MOVE_TO && s.id.id === 2 && s.args.X === 10 && s.args.Y === 6), JSON.stringify(fake.sent));
    assert.ok(!fake.sent.some((s) => s.op === UnitOperationTypes.MOVE_TO && s.id.id === 3 && s.args.X === 10 && s.args.Y === 6), "a poor trade: no strike");
});

// Game 58: the hunt of Керманцы ended after a turn of fighting («a settlement of ours needs its soldiers») for one galley at
// Хоалы, 11 tiles away, whose guards no land soldier could have helped.
test("a hunt goes on while ships alone raid a settlement of ours whose centre holds; land raiders there call it home (game 58)", () => {
    const cities = world.cities;
    try {
        reset();
        world.cities = [...cities, { owner: 0, x: 5, y: 15, name: "Corinth", pop: 3, prod: 5 }];
        run();
        assert.equal(units.fieldOpState()?.kind, "HUNT");
        const corinth = { settlement: { x: 5, y: 15, name: "Corinth" }, count: 1, land: 0, ships: 1, close: 1, damaged: false, owners: [{ id: 20, independent: true }] };
        let r = run({ threats: [corinth] });
        assert.ok(!keys(r).includes("HUNT_ENDED"), JSON.stringify(r.entries));
        assert.equal(units.fieldOpState()?.kind, "HUNT");
        r = run({ threats: [{ ...corinth, land: 1, ships: 0 }] });
        assert.ok(keys(r).includes("HUNT_ENDED"), JSON.stringify(r.entries));
    } finally {
        world.cities = cities;
    }
});

test("befriending leaves the village we hunt alone", () => {
    reset();
    run();
    assert.equal(units.huntedIndependent(), 9);
    world.befriend = { 9: { status: 0, cost: 40 } };
    world.influence = 100;
    fake.sent.length = 0;
    const out = choices.befriendIndependents([]);
    assert.ok(!out.some((e) => e.key === "BEFRIEND"), JSON.stringify(out));
});

test("a village another leader befriends (that leader not unfriendly) is hunted and dispersed all the same", async () => {
    reset({ events: { 9: [{ initialPlayer: 1, actionType: DiplomacyActionTypes.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN }] }, relations: { 1: "NEUTRAL" } });
    run();
    assert.equal(units.fieldOpState()?.reason, "OTHERS");
    const op = units.fieldOpState();
    world.units = [{ id: 1, type: "UNIT_WARRIOR", ...ATHENS }, { id: 2, type: "UNIT_WARRIOR", ...op.staging }, { id: 3, type: "UNIT_WARRIOR", x: op.staging.x, y: op.staging.y + 1 },
        { id: 4, type: "UNIT_WARRIOR", x: op.staging.x - 1, y: op.staging.y }, { id: 7, type: "UNIT_ARMY_COMMANDER", x: op.staging.x - 1, y: op.staging.y + 1 }];
    run();
    assert.equal(units.fieldOpState()?.stage, "FIGHT");
    world.wars = [9];
    world.indepRelation = { 9: IndependentRelationship.HOSTILE };
    // A member on the village: it disperses it though Rome befriends it.
    world.units.find((u) => u.id === 2).x = VILLAGE.x;
    world.units.find((u) => u.id === 2).y = VILLAGE.y;
    fake.sent.length = 0;
    const entries = await units.fieldAssault();
    assert.ok(entries.some((e) => e.key === "DISPERSED"), JSON.stringify(entries));
    delete world.relations;
});

test("a full pass with «Оборона» and the hunts runs its strike step without an error (games 51-53: the hunt's fight was called before it was defined)", async () => {
    // Games 51-53 logged `strike: Cannot access 'fieldFight' before initialization` on every pass (832 times): the strike
    // step called the hud's fieldFight above its declaration, so the hunt's fight never ran there.
    const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
    const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
    reset();
    settings.patch({ autopilot: { defend: true, huntVillages: true, replanEvery: 0, skipUnits: false, endTurn: false, research: false, choices: false, befriend: false, growth: false, towns: false, production: false, purchases: false } });
    try {
        await autopilot.runTurn(true);
        const errors = (state.get().autopilot.log ?? []).filter((e) => e.key === "ERROR").map((e) => e.args);
        assert.deepEqual(errors, []);
    } finally {
        settings.patch({ autopilot: { defend: false, production: true, purchases: true, research: true, choices: true, befriend: true, growth: true, towns: true, replanEvery: 5 } });
    }
});

// Game 54: Аванти's hunt (E5-E11) went without a general: the vanguard stood 8 turns from the staging area (6 allowed), and the
// hunt gave no general any XP. Now a general within 10 turns leads it, the fight waits for it, and none starts without one.
test("a hunt waits for its general: one 8 turns away leads it and the fight waits until it is there; none starts without one", () => {
    try {
        // The general 8 tiles from the staging area at a tile a turn: 8 turns.
        reset({ speed: (id) => (id.id === 7 ? 1 : 2) });
        world.units = [...army().filter((u) => u.id !== 7), { id: 7, type: "UNIT_ARMY_COMMANDER", x: 1, y: 5 }];
        let r = run();
        const op = units.fieldOpState();
        assert.ok(keys(r).includes("HUNT_STARTED"), JSON.stringify(r.entries));
        assert.equal(op.commander, "0:7", "the general 8 turns away leads it");
        // Every member at the staging area, the general still on its way: they wait.
        const near = [{ x: op.staging.x, y: op.staging.y + 1 }, { x: op.staging.x - 1, y: op.staging.y }, { x: op.staging.x, y: op.staging.y - 1 }];
        world.units = [{ id: 1, type: "UNIT_WARRIOR", ...ATHENS }, ...[2, 3, 4].map((id, i) => ({ id, type: "UNIT_WARRIOR", ...near[i] })), { id: 7, type: "UNIT_ARMY_COMMANDER", x: 3, y: 5 }];
        r = run();
        assert.equal(units.fieldOpState().stage, "GATHER", JSON.stringify(r.entries));
        assert.deepEqual(declared(), [], "no war before its general is there");
        // It arrives: the fight.
        world.units.find((u) => u.id === 7).x = op.staging.x - 1;
        world.units.find((u) => u.id === 7).y = op.staging.y + 1;
        r = run();
        assert.equal(units.fieldOpState().stage, "FIGHT", JSON.stringify(r.entries));
        // A general on the map but out of reach: no hunt.
        reset({ unreachable: (_x, _y, id) => id?.id === 7 });
        r = run();
        assert.ok(!keys(r).includes("HUNT_STARTED"), JSON.stringify(r.entries));
        assert.equal(units.fieldOpState(), null);
    } finally {
        delete world.speed;
        delete world.unreachable;
    }
});
