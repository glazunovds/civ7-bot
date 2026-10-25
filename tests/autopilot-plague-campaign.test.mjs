// Game 60 (research/game60, the plague review): the unit loop leaves a campaign's members to the campaign, and a member
// gathered by the staging tile waited there whatever the tile did: on the plague it would take 25 a turn for up to
// GATHER_MAX turns. A gathered member on an infected tile takes a clean one by the staging tile instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

// The campaign test's map: Lost, ours once, held by Rome.
const HOME = { x: 5, y: 8 };
const LOST = { x: 13, y: 8 };
const world = {
    width: 30, height: 18, wrapX: false,
    tiles: (x) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: x < 11 ? 0 : 1 }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
        { owner: 1, ...LOST, name: "Lost", originalOwner: 0, districts: [LOST, { x: 14, y: 8 }] },
    ],
    units: [], gold: 0,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const d = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const movesOf = (id) => fake.sent.filter((s) => s.kind === "unit" && s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO).map((s) => ({ x: s.args.X, y: s.args.Y }));
const run = () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
        return units.commandUnits(DEFAULT_SETTINGS, { defend: true, offensive: true, threats: [], fronts: [], exposed: [] });
    } finally {
        console.warn = warn;
    }
};

test("a campaign's member gathered by the staging tile on the plague takes a clean tile there; the others wait", () => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = [
        { id: 1, type: "UNIT_WARRIOR", x: 6, y: 8 },
        { id: 2, type: "UNIT_WARRIOR", x: 6, y: 9 },
        { id: 3, type: "UNIT_SLINGER", x: 7, y: 8 },
        { id: 9, type: "UNIT_ARMY_COMMANDER", x: 4, y: 9 },
    ];
    world.enemies = [{ ...LOST, owner: 1, type: "UNIT_WARRIOR" }];
    world.wars = [1];
    Game.turn = 20;
    try {
        run();
        const c = units.campaignState();
        assert.equal(c?.stage, "GATHER");
        // Two arrived by the staging tile, the slinger still on its way (it moved this turn); the plague now on member 2's tile.
        const near = GameplayMap.getPlotIndicesInRadius(c.staging.x, c.staging.y, 1).map((i) => GameplayMap.getLocationFromIndex(i))
            .filter((l) => !(l.x === c.staging.x && l.y === c.staging.y));
        const at = { 1: { ...c.staging }, 2: { ...near[0] }, 9: { ...near[2] } };
        for (const u of world.units) Object.assign(u, at[u.id] ?? { moved: true });
        world.plotEffects = (x, y) => (x === near[0].x && y === near[0].y ? ["PLOTEFFECT_PLAGUE"] : []);
        Game.turn = 21;
        fake.sent.length = 0;
        const r = run();
        assert.equal(units.campaignState()?.stage, "GATHER", JSON.stringify(r.entries));
        const to = movesOf(2).at(-1);
        assert.ok(to && d(to, c.staging) <= 1 && !(to.x === near[0].x && to.y === near[0].y), `off the plague by the staging tile: ${JSON.stringify(r.entries)}`);
        assert.deepEqual(movesOf(1), [], "a gathered member on a clean tile waits there");
    } finally {
        for (const k of ["enemies", "wars", "plotEffects"]) delete world[k];
        units.resetUnitGoals();
        Game.turn = 1;
    }
});
