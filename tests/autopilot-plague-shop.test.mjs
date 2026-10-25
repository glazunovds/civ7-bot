// The review of game 60's plague package: a defender for an infected settlement is bought in our nearest clean one
// (unitShop), and nothing remembered it after its turn. With the plague on every tile within 2 of York (as Астрахань at T133)
// the defence plan found no post to send it to, and with no soldier of its own in Selby it stayed there as Selby's garrison:
// a Warrior was bought in Selby for York every turn, none sent. Now none is bought while every post is infected, a city with
// a soldier of its own buys first, and one bought elsewhere counts as coming until it is sent or its walk and a turn are over.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
const FLAT = { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => FLAT,
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [],
    units: [], gold: 1000, goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS, gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const moves = () => fake.sent.filter((s) => s.op === UnitOperationTypes.MOVE_TO).map((s) => [s.id.id, s.args.X, s.args.Y]);
const cityId = (name) => world.cities.findIndex((c) => c.name === name);

const reset = (cities, extra = {}) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    for (const k of ["enemies", "plotEffects", "unreachable", "villages", "indepRelation"]) delete world[k];
    world.cities = cities;
    world.units = [];
    world.gold = 1000;
    world.canBuy = (type) => (type === "UNIT_WARRIOR" ? { Success: true, Cost: 80 } : { Success: false });
    settings.remember(gameKey(), { melee: null });
    Object.assign(world, extra);
};

// The hud's order: the unit step, then the purchases; the game makes a unit bought in its city by the next turn.
const turns = (list, threats, { unitId = (turn) => 100 + turn } = {}) => {
    const log = [];
    for (const turn of list) {
        Game.turn = turn;
        fake.sent.length = 0;
        const warn = console.warn;
        console.warn = (...a) => log.push(`T${turn} ${a.join(" ")}`);
        try {
            units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: true, merchants: false, threats, exposed: steps.exposedSettlements(threats) });
            steps.buyDefenders(threats, { reserveTurns: 2 });
            const b = bought();
            log.push(`T${turn} bought ${JSON.stringify(b)} moves ${JSON.stringify(moves())}`);
            for (const [, id] of b) world.units.push({ id: unitId(turn), type: "UNIT_WARRIOR", x: world.cities[id].x, y: world.cities[id].y });
        } finally {
            console.warn = warn;
        }
    }
    return log;
};
const boughtOn = (log) => log.filter((l) => / bought \[\[/.test(l)).map((l) => Number(l.match(/^T(\d+)/)[1]));

test("no defender is bought elsewhere for an infected settlement whose every post is infected: it would stand in the city that bought it", () => {
    // The plague on York and every tile within 2 (Астрахань at T133), two raiders 3 tiles west; Selby clean, 3 tiles east,
    // with a Warrior of its own.
    reset([
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4, infected: true },
        { owner: 0, x: 19, y: 8, name: "Selby", isTown: true, pop: 3 },
    ], {
        plotEffects: (x, y) => (GameplayMap.getPlotDistance(x, y, YORK.x, YORK.y) <= 2 ? ["PLOTEFFECT_PLAGUE"] : []),
        enemies: [{ x: 13, y: 7, owner: 5, type: "UNIT_WARRIOR" }, { x: 13, y: 9, owner: 5, type: "UNIT_WARRIOR" }],
    });
    world.units = [{ id: 50, type: "UNIT_WARRIOR", x: 19, y: 8 }];
    const threats = [{ settlement: { name: "York", ...YORK }, count: 2, land: 2, close: 0, owners: [{ id: 5, independent: true }] }];
    try {
        const log = turns([10, 11, 12], threats);
        assert.deepEqual(boughtOn(log), [], log.join("\n"));
        assert.ok(log.some((l) => l.includes("defenders: none for York") && l.includes("infected (plague), every post by it is infected")), log.join("\n"));
    } finally {
        Game.turn = 1;
    }
});

test("a defender bought elsewhere comes from a city with a soldier of its own, and counts as coming while it cannot be sent", () => {
    // Only York's centre infected; one raider 3 tiles west (a guard wanted, 2 turns to come). Selby (3 tiles, 2 turns) has no
    // soldier: one bought there would stay as its garrison. Whitby (4 tiles, 2 turns) has a Warrior of its own: it buys.
    const cities = () => [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4, infected: true },
        { owner: 0, x: 19, y: 8, name: "Selby", isTown: true, pop: 3 },
        { owner: 0, x: 16, y: 12, name: "Whitby", isTown: true, pop: 3 },
    ];
    const extra = {
        plotEffects: (x, y) => (x === YORK.x && y === YORK.y ? ["PLOTEFFECT_PLAGUE"] : []),
        enemies: [{ x: 13, y: 8, owner: 5, type: "UNIT_WARRIOR" }],
    };
    const threats = [{ settlement: { name: "York", ...YORK }, count: 1, land: 1, close: 0, owners: [{ id: 5, independent: true }] }];
    try {
        // The one bought cannot reach York yet (its way blocked): it counts as coming for its walk and a turn (T11-T13), and
        // no other is bought meanwhile; then another.
        reset(cities(), { ...extra, unreachable: (_x, _y, id) => id?.id === 110 });
        world.units = [{ id: 51, type: "UNIT_WARRIOR", x: 16, y: 12 }];
        let log = turns([10, 11, 12, 13, 14], threats);
        assert.deepEqual(boughtOn(log), [10, 14], log.join("\n"));
        assert.ok(log.some((l) => l.startsWith("T10 ") && l.includes("bought for York (in Whitby, 2 turn(s) away: York is infected)")), log.join("\n"));
        // Sent the next turn: it counts as on its way, as any guard does.
        reset(cities(), extra);
        world.units = [{ id: 51, type: "UNIT_WARRIOR", x: 16, y: 12 }];
        log = turns([10, 11], threats);
        assert.deepEqual(boughtOn(log), [10], log.join("\n"));
        assert.ok(log.some((l) => l.startsWith("T11 bought") && l.includes("[110,")), `sent the next turn: ${log.join("\n")}`);
        // No city with a soldier of its own in time: Selby buys, and its first stays as its garrison: the next turn buys the
        // one that goes.
        reset(cities().filter((c) => c.name !== "Whitby"), extra);
        log = turns([10, 11, 12], threats);
        assert.deepEqual(boughtOn(log), [10, 11], log.join("\n"));
        assert.ok(log.some((l) => l.startsWith("T12 bought") && l.includes("[111,")), `the second one sent: ${log.join("\n")}`);
    } finally {
        Game.turn = 1;
    }
});

test("an exposed settlement that is infected gets its holder from a clean city only while a post by its centre is clean", () => {
    // A village at war with us 5 tiles north of York (exposed); Selby, 3 tiles east, holds its own Warrior (not exposed: its
    // holder stands there) and sells one.
    const cities = () => [
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4, infected: true },
        { owner: 0, x: 19, y: 8, name: "Selby", isTown: true, pop: 3 },
    ];
    const village = { villages: [{ owner: 5, x: 16, y: 3 }], indepRelation: { 5: IndependentRelationship.HOSTILE } };
    try {
        // The plague on York and every tile next to it (a holder stands on or next to the centre): none bought.
        reset(cities(), { ...village, plotEffects: (x, y) => (GameplayMap.getPlotDistance(x, y, YORK.x, YORK.y) <= 1 ? ["PLOTEFFECT_PLAGUE"] : []) });
        world.units = [{ id: 50, type: "UNIT_WARRIOR", x: 19, y: 8 }];
        let log = turns([10, 11], []);
        assert.deepEqual(boughtOn(log), [], log.join("\n"));
        assert.ok(log.some((l) => l.includes("defenders: none for York: exposed") && l.includes("every post by it is infected")), log.join("\n"));
        // Only the centre infected: one bought in Selby; it cannot reach York yet, and counts as coming for its walk and a turn.
        reset(cities(), { ...village, plotEffects: (x, y) => (x === YORK.x && y === YORK.y ? ["PLOTEFFECT_PLAGUE"] : []), unreachable: (_x, _y, id) => id?.id === 110 });
        world.units = [{ id: 50, type: "UNIT_WARRIOR", x: 19, y: 8 }];
        log = turns([10, 11, 12, 13, 14], []);
        assert.deepEqual(boughtOn(log), [10, 14], log.join("\n"));
        assert.ok(log.filter((l) => / bought \[\[/.test(l)).every((l) => l.includes('bought [["UNIT_WARRIOR",1]]')), "in Selby");
    } finally {
        Game.turn = 1;
    }
});
