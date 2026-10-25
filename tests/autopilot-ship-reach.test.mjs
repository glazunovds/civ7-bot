// Research/41 Phase 1: ships' reach. Ships killed 29 of the 56 land units we lost in games 30-47 (18 scouts, 11 soldiers),
// each standing within a ship's reach: we sent any ranged unit against ships, posted it within their range, and hurt units
// healed or stepped along the coast. A land unit now stands in a ship's reach only when it out-guns the ship (Bombard and
// Combat) or, against a Range-1 ship, out-ranges it from inland; hurt units and scouts step inland; a hurt melee unit next
// to an empty, damaged centre steps onto it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

// The sea: x >= 20 (area 1). Coast stands at 19,8, next to it; Home inland.
const COAST = { x: 19, y: 8 };
const HOME = { x: 8, y: 8 };
const world = {
    width: 34, height: 22, wrapX: false,
    tiles: (x) => ({ terrain: x >= 20 ? "TERRAIN_COAST" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: x >= 20 ? -1 : 0 }),
    areaId: (x) => (x >= 20 ? 1 : 0),
    players: [{ id: 0 }, { id: 1, name: "Rome" }],
    cities: [
        { owner: 0, ...COAST, name: "Coast", pop: 6, prod: 20 },
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
    ],
    units: [], gold: 2000, goldIncome: 20,
};
const fake = installFakeEngine(world, "modern");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const reset = (extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "unitCanStart", "canBuild", "canBuy", "districtHealth"]) delete world[k];
    world.units = [];
    Game.turn = 30 + Math.floor(Math.random() * 1000); // a new turn: the ships are read afresh
    Object.assign(world, extra);
};
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [], ...options });
const frigates = [{ x: 22, y: 8, owner: 1, type: "UNIT_FRIGATE" }, { x: 22, y: 9, owner: 1, type: "UNIT_FRIGATE" }];
const sells = (prices) => (type) => (prices[type] !== undefined ? { Success: true, Cost: prices[type] } : { Success: false });
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType);

test("against ships alone a Field Cannon is not sent (it does not out-gun Frigates); a Mortar is", () => {
    reset({ wars: [1], enemies: frigates, units: [
        { id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST },
        { id: 2, type: "UNIT_FIELD_CANNON", x: 15, y: 8 },
        { id: 3, type: "UNIT_MORTAR", x: 15, y: 10 },
    ] });
    const t = units.threatenedSettlements().find((x) => x.settlement.x === COAST.x);
    assert.equal(t?.ships, 2, JSON.stringify(t));
    run();
    assert.equal(moveOf(2), undefined, "the Field Cannon stays: game 38's two died this way");
    assert.ok(moveOf(3), "the Mortar goes");
    // A Field Cannon next to Coast does not count as its guard against the Frigates; a Mortar does.
    reset({ wars: [1], enemies: frigates, units: [{ id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST }, { id: 2, type: "UNIT_FIELD_CANNON", x: 18, y: 7 }] });
    assert.equal(units.guardsFor(t, undefined, null, { ranged: true }), 0);
    reset({ wars: [1], enemies: frigates, units: [{ id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST }, { id: 2, type: "UNIT_MORTAR", x: 18, y: 7 }] });
    assert.equal(units.guardsFor(t, undefined, null, { ranged: true }), 1);
});

test("against Frigates a Mortar is bought, not a Field Cannon; with none on sale that out-guns them, nothing is bought", () => {
    const t = () => units.threatenedSettlements().find((x) => x.settlement.x === COAST.x);
    reset({ wars: [1], enemies: frigates, units: [{ id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST }], canBuy: sells({ UNIT_FIELD_CANNON: 300, UNIT_MORTAR: 500 }) });
    steps.buyDefenders([t()], { budget: createBudget({ gold: 2000, reserve: 0 }) });
    assert.deepEqual(bought(), ["UNIT_MORTAR"]);
    reset({ wars: [1], enemies: frigates, units: [{ id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST }], canBuy: sells({ UNIT_FIELD_CANNON: 300 }) });
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        steps.buyDefenders([t()], { budget: createBudget({ gold: 2000, reserve: 0 }) });
    } finally {
        console.warn = warn;
    }
    assert.deepEqual(bought(), [], "a Field Cannon would die on the coast");
    assert.ok(lines.some((l) => l.includes("out-guns or out-ranges their ships")), lines.join(" | "));
});

test("a hurt soldier at its coastal post within a Frigate's reach steps inland before it heals", () => {
    reset({ wars: [1], enemies: [{ x: 23, y: 8, owner: 1, type: "UNIT_FRIGATE" }], units: [
        { id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST },
        { id: 2, type: "UNIT_INFANTRY_COMPANY", x: 18, y: 8, damage: 20 },
    ] });
    run();
    const to = moveOf(2);
    assert.ok(to, JSON.stringify(fake.sent.filter((s) => s.id?.id === 2)));
    assert.ok(to.X <= 17, `inland, out of the Frigate's reach: ${to.X},${to.Y}`);
});

test("a scout within a ship's reach steps inland", () => {
    reset({ wars: [1], enemies: [{ x: 23, y: 12, owner: 1, type: "UNIT_FRIGATE" }], units: [{ id: 5, type: "UNIT_SCOUT", x: 19, y: 12 }] });
    units.commandUnits(DEFAULT_SETTINGS, { explore: true, threats: [], fronts: [], exposed: [] });
    const to = moveOf(5);
    const frigate = GameInfo.Units.lookup("UNIT_FRIGATE");
    const reach = (Number(frigate.BaseMoves) || 3) + 2;
    assert.ok(to && (to.X <= 17 || GameplayMap.getPlotDistance(to.X, to.Y, 23, 12) > reach), `out of the Frigate's reach: ${JSON.stringify(fake.sent.filter((s) => s.id?.id === 5))}`);
});

// Game 49: getAreaId was called with a plot index and refused six times ("Argument conversion failed"), so every ship's
// water body was unknown and counted as all water. A Frigate on a lake does not reach the sea's coast.
test("a ship's own water body: a scout by the sea is out of reach of a Frigate on a lake inland", () => {
    const tiles = world.tiles;
    const areaId = world.areaId;
    const lake = (x, y) => x >= 13 && x <= 14 && y === 12;
    world.tiles = (x, y) => (lake(x, y) ? { terrain: "TERRAIN_COAST", lake: true, yields: {}, owner: -1 } : tiles(x, y));
    world.areaId = (x, y) => (lake(x, y) ? 2 : areaId(x, y));
    try {
        reset({ wars: [1], enemies: [{ x: 14, y: 12, owner: 1, type: "UNIT_FRIGATE" }], units: [{ id: 5, type: "UNIT_SCOUT", x: 19, y: 12 }] });
        units.commandUnits(DEFAULT_SETTINGS, { explore: true, threats: [], fronts: [], exposed: [] });
        assert.ok(!fake.sent.some((s) => s.id?.id === 5 && s.op === UnitOperationTypes.MOVE_TO), `no step away: ${JSON.stringify(fake.sent.filter((s) => s.id?.id === 5))}`);
        // Beside the lake it steps away.
        reset({ wars: [1], enemies: [{ x: 14, y: 12, owner: 1, type: "UNIT_FRIGATE" }], units: [{ id: 5, type: "UNIT_SCOUT", x: 15, y: 12 }] });
        units.commandUnits(DEFAULT_SETTINGS, { explore: true, threats: [], fronts: [], exposed: [] });
        const to = moveOf(5);
        assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, 14, 12) > 2, JSON.stringify(fake.sent.filter((s) => s.id?.id === 5)));
    } finally {
        world.tiles = tiles;
        world.areaId = areaId;
    }
});

test("a hurt melee unit next to an empty, damaged centre steps onto it (the 11 empty damaged centres of games 37-47)", () => {
    const raiders = [{ x: 16, y: 6, owner: 1, type: "UNIT_INFANTRY_COMPANY" }, { x: 16, y: 10, owner: 1, type: "UNIT_INFANTRY_COMPANY" }];
    reset({ wars: [1], enemies: raiders, districtHealth: (x, y) => (x === COAST.x && y === COAST.y ? 40 : 100), units: [
        { id: 2, type: "UNIT_INFANTRY_COMPANY", x: 18, y: 8, damage: 25 },
    ] });
    run();
    const to = moveOf(2);
    assert.deepEqual(to ? [to.X, to.Y] : null, [COAST.x, COAST.y], JSON.stringify(fake.sent.filter((s) => s.id?.id === 2)));
});

test("a ranged unit sent as support against land raiders takes a post out of a Frigate's reach", () => {
    const raiders = [{ x: 17, y: 4, owner: 1, type: "UNIT_INFANTRY_COMPANY" }, { x: 17, y: 12, owner: 1, type: "UNIT_INFANTRY_COMPANY" }];
    reset({ wars: [1], enemies: [...raiders, { x: 22, y: 8, owner: 1, type: "UNIT_FRIGATE" }], units: [
        { id: 1, type: "UNIT_INFANTRY_COMPANY", ...COAST },
        { id: 6, type: "UNIT_INFANTRY_COMPANY", x: 18, y: 7 },
        { id: 2, type: "UNIT_FIELD_CANNON", x: 12, y: 8 },
    ] });
    run();
    const to = moveOf(2);
    assert.ok(to, JSON.stringify(fake.sent.filter((s) => s.id?.id === 2)));
    assert.ok(to.X <= 17, `two tiles or more from the water: ${to.X},${to.Y}`);
});
