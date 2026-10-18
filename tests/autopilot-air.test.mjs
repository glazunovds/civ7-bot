// Aircraft (research/36 §7): game 29 had none while Russia's Bomber hit our centres M60-M65. Our aircraft strike raiders
// near our settlements with the game's air attack, and with a war at our door and enemy aircraft in sight, fighters are
// trained where the game allows them (an Airfield or Aerodrome there).
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
    for (const k of ["enemies", "wars", "unitCanStart", "canBuild", "costOf"]) delete world[k];
    world.units = [];
    Object.assign(world, extra);
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

test("enemy aircraft in sight with a war at our door: a fighter is trained where the game allows it, up to 2 (research/36 §7)", () => {
    const bomber = { x: 20, y: 5, owner: 1, type: "UNIT_BOMBER" };
    const fighters = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType !== undefined).map(unitName).filter((t) => /FIGHTER|BIPLANE/.test(t));
    const allow = { canBuild: (type) => (type?.startsWith?.("UNIT_") ? { Success: ["UNIT_BIPLANE", "UNIT_FIGHTER", "UNIT_TANK"].includes(type) } : undefined), costOf: () => 100 };
    reset({ wars: [1], enemies: [bomber], ...allow });
    steps.assessWar([]);
    let out = steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.deepEqual(fighters(), ["UNIT_FIGHTER"], `the best of them: ${JSON.stringify(out)}`);
    assert.ok(out.some((e) => e.key === "QUEUED_INTERCEPTOR"));
    // None in sight: none.
    reset({ wars: [1], ...allow });
    steps.assessWar([]);
    steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.deepEqual(fighters(), []);
    // Two of ours already: none.
    reset({ wars: [1], enemies: [bomber, { ...bomber, x: 21 }], ...allow, units: [{ id: 1, type: "UNIT_FIGHTER", ...HOME }, { id: 2, type: "UNIT_BIPLANE", ...HOME }] });
    steps.assessWar([]);
    steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.deepEqual(fighters(), []);
    // At peace: none.
    reset({ enemies: [bomber], ...allow });
    steps.assessWar([]);
    steps.fillProduction(new Map(), { defend: true, threats: [] });
    assert.deepEqual(fighters(), []);
});
