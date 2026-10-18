// Aircraft (research/36 §7): game 29 had none while Russia's Bomber hit our centres M60-M65. Our aircraft strike raiders
// near our settlements with the game's air attack, and with a war at our door and enemy aircraft in sight, fighters are
// trained where their base covers the settlements those aircraft reach (research/37 §3E: air units are always packed in a
// commander, an Airfield's Aerodrome Commander is an air unit too, and a fighter intercepts only 3-5 tiles from its base).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const FRONT = { x: 15, y: 5 };
const MOSCOW = { x: 24, y: 5 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Russia" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
        { owner: 0, ...FRONT, name: "Front", pop: 4, prod: 10 },
        { owner: 1, ...MOSCOW, name: "Moscow", pop: 6 },
    ],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world, "modern");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "unitCanStart", "canBuild", "costOf", "armies", "owningCity"]) delete world[k];
    world.units = [];
    Object.assign(world, extra);
};
// Our Airfields: Home's at 6,5 (army 8), Front's at 16,5 (army 7), each with its Aerodrome Commander; the tiles next to a
// city are that city's (getOwningCityFromXY).
const HOME_BASE = { id: 80, type: "UNIT_AERODROME_COMMANDER", x: 6, y: 5, army: 8 };
const FRONT_BASE = { id: 70, type: "UNIT_AERODROME_COMMANDER", x: 16, y: 5, army: 7 };
const bases = {
    armies: { "0:7": { x: 16, y: 5, capacity: 4 }, "0:8": { x: 6, y: 5, capacity: 4 } },
    owningCity: (x, y) => (GameplayMap.getPlotDistance(x, y, HOME.x, HOME.y) <= 1 ? { owner: 0, id: 0 } : GameplayMap.getPlotDistance(x, y, FRONT.x, FRONT.y) <= 1 ? { owner: 0, id: 1 } : null),
};
const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;

test("our aircraft strike a raider near our settlements with the game's air attack; not one far away (research/36 §7)", async () => {
    const near = { x: 17, y: 5, owner: 1, type: "UNIT_INFANTRY_COMPANY" };
    const far = { x: 30, y: 15, owner: 1, type: "UNIT_TANK" };
    reset({
        wars: [1], enemies: [far, near],
        units: [{ id: 1, type: "UNIT_FIGHTER", ...HOME }],
        // Like the game: the air attack's targets come from canStart with no target (interface-mode-air-attack.js).
        unitCanStart: (_id, op) => (op === "UNITOPERATION_AIR_ATTACK" ? { Success: false, Plots: [idx(far.x, far.y), idx(near.x, near.y)] } : undefined),
    });
    const r = await units.strikeRaiders();
    const air = fake.sent.filter((s) => s.op === "UNITOPERATION_AIR_ATTACK");
    assert.deepEqual(air.map((s) => [s.id.id, s.args.X, s.args.Y]), [[1, near.x, near.y]], JSON.stringify(fake.sent));
    assert.deepEqual(r.entries.map((e) => e.key), ["AIR_STRIKE"]);
    // Only the far one: nothing (defence, not conquest).
    reset({ wars: [1], enemies: [far], units: [{ id: 1, type: "UNIT_FIGHTER", ...HOME }], unitCanStart: (_id, op) => (op === "UNITOPERATION_AIR_ATTACK" ? { Plots: [idx(far.x, far.y)] } : undefined) });
    await units.strikeRaiders();
    assert.deepEqual(fake.sent.filter((s) => s.op === "UNITOPERATION_AIR_ATTACK"), []);
});

const fighterOrders = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined && /FIGHTER|BIPLANE/.test(unitName(s))).map((s) => [unitName(s), s.id.id]);
const allow = { canBuild: (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_BIPLANE", "UNIT_FIGHTER", "UNIT_TANK"].includes(type) } : undefined), costOf: () => 100 };
const train = () => {
    steps.assessWar([]);
    return steps.fillProduction(new Map(), { defend: true, threats: [] });
};

test("enemy aircraft in sight with a war at our door: a fighter is trained in the Airfield city whose base covers the settlement they reach (research/36 §7, research/37 §3E)", () => {
    const bomber = { x: 20, y: 5, owner: 1, type: "UNIT_BOMBER" };
    reset({ wars: [1], enemies: [bomber], ...allow, ...bases, units: [HOME_BASE, FRONT_BASE] });
    const out = train();
    // The Bomber (Range 10) reaches Front, 5 away, not Home; Home's base is 10 from Front, Front's 1.
    assert.deepEqual(fighterOrders(), [["UNIT_FIGHTER", 1]], `the best of them, in Front: ${JSON.stringify(out)}`);
    assert.ok(out.some((e) => e.key === "QUEUED_INTERCEPTOR"));
    // None in sight: none.
    reset({ wars: [1], ...allow, ...bases, units: [HOME_BASE, FRONT_BASE] });
    train();
    assert.deepEqual(fighterOrders(), []);
    // Two of ours based at Front already: none (packed in its Aerodrome's army, as aircraft always are).
    reset({
        wars: [1], enemies: [bomber, { ...bomber, x: 21 }], ...allow, ...bases,
        units: [HOME_BASE, FRONT_BASE, { id: 1, type: "UNIT_FIGHTER", x: 16, y: 5, onMap: false, army: 7 }, { id: 2, type: "UNIT_BIPLANE", x: 16, y: 5, onMap: false, army: 7 }],
    });
    train();
    assert.deepEqual(fighterOrders(), []);
    // At peace: none.
    reset({ enemies: [bomber], ...allow, ...bases, units: [HOME_BASE, FRONT_BASE] });
    train();
    assert.deepEqual(fighterOrders(), []);
});

test("an enemy Airfield's commander alone asks for no fighter; an enemy bomber packed in a commander is found at its army's tile (research/37 §3E)", () => {
    // The Aerodrome Commander every Airfield grants is DOMAIN_AIR: before, any visible enemy Airfield asked for fighters.
    reset({ wars: [1], enemies: [{ x: 20, y: 5, owner: 1, type: "UNIT_AERODROME_COMMANDER", army: 50 }], ...allow, ...bases, units: [HOME_BASE, FRONT_BASE] });
    assert.deepEqual(units.hostileAircraft(), []);
    train();
    assert.deepEqual(fighterOrders(), []);
    // A Bomber packed in that commander's army, off the map: its army stands 5 tiles from Front.
    reset({
        wars: [1], ...allow, ...bases, units: [HOME_BASE, FRONT_BASE],
        enemies: [{ x: 20, y: 5, owner: 1, type: "UNIT_AERODROME_COMMANDER", army: 50 }, { x: -1, y: -1, owner: 1, type: "UNIT_BOMBER", onMap: false, army: 50 }],
        armies: { ...bases.armies, "1:50": { x: 20, y: 5 } },
    });
    const seen = units.hostileAircraft();
    assert.deepEqual(seen.map((a) => [a.type, a.at.x, a.at.y, a.targets.map((t) => t.name)]), [["UNIT_BOMBER", 20, 5, ["Front"]]]);
    train();
    assert.deepEqual(fighterOrders(), [["UNIT_FIGHTER", 1]]);
});

test("a fighter based far away does not cover the settlement; one is trained where an Airfield stands nearer, never where none covers it (research/37 §3E)", () => {
    const bomber = { x: 20, y: 5, owner: 1, type: "UNIT_BOMBER" };
    // Ours at Home's Airfield, 9 from Front: it intercepts within 4 (3, +1 for the Aerodrome).
    const far = { id: 1, type: "UNIT_FIGHTER", x: 6, y: 5, onMap: false, army: 8 };
    reset({ wars: [1], enemies: [bomber], ...allow, ...bases, units: [HOME_BASE, FRONT_BASE, far] });
    train();
    assert.deepEqual(fighterOrders(), [["UNIT_FIGHTER", 1]], "Front's own Airfield");
    // Two bombers: Front trains one; Home, whose Airfield does not cover Front, none (only aircraft to train, so no guard
    // takes Home's queue first).
    const planesOnly = (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_BIPLANE", "UNIT_FIGHTER"].includes(type) } : undefined);
    reset({ wars: [1], enemies: [bomber, { ...bomber, x: 21 }], ...allow, canBuild: planesOnly, ...bases, units: [HOME_BASE, FRONT_BASE] });
    train();
    assert.deepEqual(fighterOrders(), [["UNIT_FIGHTER", 1]], "not Home");
    // Front's Airfield is full: nowhere else covers Front, so none (the old rule trained one in any city).
    reset({
        wars: [1], enemies: [bomber], ...allow, ...bases,
        armies: { ...bases.armies, "0:7": { x: 16, y: 5, capacity: 1 } },
        units: [HOME_BASE, FRONT_BASE, far, { id: 3, type: "UNIT_TANK", x: 15, y: 5 }, { id: 4, type: "UNIT_BOMBER", x: 16, y: 5, onMap: false, army: 7 }],
    });
    train();
    assert.deepEqual(fighterOrders(), []);
    // No Airfield at Front at all: none either.
    reset({ wars: [1], enemies: [bomber], ...allow, ...bases, units: [HOME_BASE, far] });
    train();
    assert.deepEqual(fighterOrders(), []);
});
