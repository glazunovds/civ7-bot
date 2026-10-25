// A general's tile at a threatened settlement (formCommander) follows the rule its escape and its walk share
// (commanderSafeAt: under a soldier of ours that stays, on a centre that holds, else out of every hostile unit's reach). The
// fight simulator's raids60 scene (game 60's raids on four settlements) found two holes: the general went under a Warrior with
// 17 damage that withdrew from the raiders in the same pass, and onto a tile two tiles from an Archer, merely not next to a
// raider; an Archer caught it alone in 4 of 10 seeds (0 after the fix).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const LONDON = { x: 8, y: 8 };
const YORK = { x: 16, y: 8 };
const world = {
    width: 34, height: 26, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: 0 }),
    players: [{ id: 0 }, { id: 5, isIndependent: true, name: "Hittites" }],
    cities: [
        { owner: 0, ...LONDON, name: "London", pop: 8, prod: 10 },
        { owner: 0, ...YORK, name: "York", isTown: true, pop: 4 },
    ],
    units: [], gold: 0, goldIncome: 10,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const d = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const at = (x, y) => ({ x, y });
const reset = (enemies) => {
    units.resetUnitGoals();
    steps.resetWar();
    fake.sent.length = 0;
    world.units = [];
    Game.turn = 10;
    world.enemies = enemies;
};
const run = () => {
    const saved = [console.warn, console.info];
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    console.info = (...a) => lines.push(a.join(" "));
    try {
        return { ...units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: units.threatenedSettlements(), fronts: [], exposed: [] }), lines };
    } finally {
        [console.warn, console.info] = saved;
    }
};
const movesOf = (id) => fake.sent.filter((s) => s.op === "UNITOPERATION_MOVE_TO" && s.id.id === id).map((s) => at(s.args.X, s.args.Y));

test("the general does not go under a hurt soldier that withdraws from the raiders this pass, nor beside it in the raider's reach", () => {
    // York's garrison on its centre; a Warrior with 17 damage two tiles east, next to two raiders: it is about to fight (the
    // general's tile under it was worth +115), and it withdraws (defend's stepAway: hurt, a raider near). The general comes
    // after it in the unit list (the Warrior's order is sent first) or before it (the Warrior is still there).
    for (const first of [false, true]) {
        reset([{ x: 19, y: 8, owner: 5, type: "UNIT_WARRIOR" }, { x: 20, y: 8, owner: 5, type: "UNIT_WARRIOR" }]);
        const general = { id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK };
        world.units = [
            ...(first ? [general] : []),
            { id: 1, type: "UNIT_WARRIOR", ...YORK },
            { id: 2, type: "UNIT_WARRIOR", x: 18, y: 8, damage: 17 },
            ...(first ? [] : [general]),
        ];
        assert.equal(d(at(18, 8), YORK), 2);
        assert.equal(units.threatenedSettlements().length, 1);
        const r = run();
        assert.ok(r.lines.some((l) => l.includes("formation: York")), r.lines.join(" | "));
        const order = first ? "the general first" : "the Warrior first";
        assert.ok(r.entries.some((e) => e.key === "WITHDRAW"), `${order}: the hurt Warrior steps back: ${JSON.stringify(r.entries)}`);
        const moves = movesOf(9);
        assert.ok(!moves.some((m) => m.x === 18 && m.y === 8), `${order}: not under the Warrior that leaves: ${JSON.stringify(moves)}`);
        assert.ok(!moves.some((m) => d(m, at(19, 8)) <= 2), `${order}: not beside it in the raider's reach either: ${JSON.stringify(moves)}`);
    }
});

test("the general covers two fighting soldiers from under one of them, not from the open tile two tiles from the Archers", () => {
    // Two Warriors of ours at 14,7 and 14,9, each next to an Archer of theirs (13,7 and 13,9). 15,8 covers both (+155) but
    // stands in both Archers' range; under a Warrior it covers one (+115) and the Warrior is the one attacked.
    reset([{ x: 13, y: 7, owner: 5, type: "UNIT_ARCHER" }, { x: 13, y: 9, owner: 5, type: "UNIT_ARCHER" }]);
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", ...YORK },
        { id: 2, type: "UNIT_WARRIOR", x: 14, y: 7, moved: true },
        { id: 3, type: "UNIT_WARRIOR", x: 14, y: 9, moved: true },
        { id: 9, type: "UNIT_ARMY_COMMANDER", ...YORK },
    ];
    assert.deepEqual([d(at(15, 8), at(14, 7)), d(at(15, 8), at(14, 9)), d(at(15, 8), at(13, 7)), d(at(14, 7), at(14, 9))], [1, 1, 2, 2]);
    const r = run();
    const moves = movesOf(9);
    assert.equal(moves.length, 1, `${JSON.stringify(r.entries)} | ${r.lines.filter((l) => l.includes("formation:")).join(" | ")}`);
    assert.ok([at(14, 7), at(14, 9)].some((t) => t.x === moves[0].x && t.y === moves[0].y), `under a Warrior: ${JSON.stringify(moves)}`);
});
