// The review of game 60's plague package, at a war front: a front facing an army buys a guard in our nearest clean settlement
// while it is infected (unitShop), and that guard only walks to a clean post on our land by it (postFor): with every one of
// them infected none is bought (it would stand in the city that bought it, and the next turn buy another).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const THIRD = { x: 22, y: 5 };
const SECOND = { x: 25, y: 5 };
const MOSCOW = { x: 31, y: 7 };
let grid = null;
const ours = [HOME, THIRD, SECOND];
const world = {
    width: 40, height: 20, wrapX: false,
    // Our land: 3 tiles around each of our settlements.
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: grid && ours.some((c) => grid.distanceXY(x, y, c.x, c.y) <= 3) ? 0 : -1 }),
    players: [{ id: 0 }, { id: 1, name: "Russia" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 10 },
        { owner: 0, ...THIRD, name: "Third", pop: 4, prod: 10 },
        { owner: 0, ...SECOND, name: "Second", pop: 4, prod: 10, infected: true },
        { owner: 1, ...MOSCOW, name: "Moscow", pop: 6 },
    ],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world);
grid = fake.grid;
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { createBudget } = await import("../mod/expansion-planner/ui/core/xpl-savings.js");

const unitName = (s) => GameInfo.Units.lookup(s.args.UnitType)?.UnitType;
const bought = () => fake.sent.filter((s) => s.kind === "command" && s.args.UnitType !== undefined).map((s) => [unitName(s), s.id.id]);
const russianArmy = (n) => Array.from({ length: n }, (_, i) => ({ x: 30, y: 3 + i, owner: 1, type: "UNIT_WARRIOR" }));

test("an infected war front gets no guard bought elsewhere while every post on our land by it is infected", () => {
    const base = Game.turn;
    Game.turn = 10;
    const run = (plague) => {
        units.resetUnitGoals();
        steps.resetWar();
        fake.sent.length = 0;
        // Unfriendly Russia with 5 soldiers near Second (a front facing an army); Third, 3 tiles west, a front too, holds the 3
        // guards it wants (none within 2 of Second).
        Object.assign(world, { relations: { 1: "UNFRIENDLY" }, enemies: russianArmy(5), canBuy: (type) => (type === "UNIT_WARRIOR" ? { Success: true, Cost: 60 } : { Success: false }), plotEffects: plague });
        world.units = [{ id: 40, type: "UNIT_WARRIOR", ...THIRD }, { id: 41, type: "UNIT_WARRIOR", x: 21, y: 5 }, { id: 42, type: "UNIT_WARRIOR", x: 21, y: 4 }];
        steps.assessWar([]);
        steps.warFronts();
        const warn = console.warn;
        const lines = [];
        console.warn = (...a) => lines.push(a.join(" "));
        try {
            steps.buyDefenders([], { budget: createBudget({ gold: 500, reserve: 0 }) });
        } finally {
            console.warn = warn;
        }
        return lines;
    };
    try {
        // The plague on Second and every tile within 2: none.
        let lines = run((x, y) => (GameplayMap.getPlotDistance(x, y, SECOND.x, SECOND.y) <= 2 ? ["PLOTEFFECT_PLAGUE"] : []));
        assert.deepEqual(bought(), [], lines.join("\n"));
        assert.ok(lines.some((l) => l.includes("defenders: none for Second: war front") && l.includes("every post by it is infected")), lines.join("\n"));
        // Only its centre: bought in Third.
        lines = run((x, y) => (x === SECOND.x && y === SECOND.y ? ["PLOTEFFECT_PLAGUE"] : []));
        assert.deepEqual(bought(), [["UNIT_WARRIOR", 1]], lines.join("\n"));
    } finally {
        Game.turn = base;
        for (const k of ["relations", "enemies", "canBuy", "plotEffects"]) delete world[k];
    }
});
