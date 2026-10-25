// Game 48 (research/game48): one settlement for 21 turns of Antiquity, and Modern's military countdown a turn late. The first
// settler went for 9,31, then 19,31, then 17,46, 15 tiles south, and founded only at A21; in Modern a settler stood at the
// capital ten turns because "settle anywhere" looked only 8 tiles around it, and settlers walked 15 turns from the capital to
// the free land. Now: below 3 settlements a site within 4 turns and walking weighs double; a stuck settler founds on a free
// tile next to it; "settle anywhere" looks as far as a bold walk; a settler is trained where it reaches a known site soonest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 5 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, ...HOME, name: "Home", pop: 6, prod: 10 }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const picks = (list) => state.set({ results: { ...state.get().results, sites: { picks: list } } });
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const fresh = (unitList, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = unitList;
    for (const k of ["claimOk", "unreachable", "aiSuggestions"]) delete world[k];
    world.cities = [{ owner: 0, ...HOME, name: "Home", pop: 6, prod: 10 }];
    Object.assign(world, extra);
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { settlers: true, ...options });
const others = [{ owner: 0, x: 2, y: 15, name: "Two", pop: 2 }, { owner: 0, x: 8, y: 15, name: "Three", pop: 2 }];

test("below 3 settlements a site 5 turns away is not walked to (game 48: 17,46); with 3 it is", () => {
    picks([{ x: 15, y: 5, rank: 1 }]);
    fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }]);
    run();
    assert.equal(moveOf(2), undefined, "one settlement: 10 tiles is too far");
    fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }]);
    world.cities.push(...others);
    run();
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [15, 5], "three settlements: as before");
});

test("below 3 settlements a turn of walking weighs double: a near site wins over a better one 4 turns away; later the better one", () => {
    picks([{ x: 13, y: 5, value: 1 }, { x: 7, y: 5, value: 0.6 }]);
    fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }]);
    run();
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [7, 5], "the near one");
    fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }]);
    world.cities.push(...others);
    run();
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [13, 5], "three settlements: the better one");
});

test("a settler stuck on its way founds on a free tile next to it rather than going for another far site (game 48: 12,31)", () => {
    picks([{ x: 13, y: 5, rank: 1 }]);
    world.cities.push(...others);
    fresh([{ id: 2, type: "UNIT_SETTLER", x: 9, y: 5 }], { claimOk: (x, y) => (x === 13 && y === 5) || (x === 10 && y === 6) });
    world.cities.push(...others);
    for (const turn of [50, 51, 52]) {
        Game.turn = turn;
        fake.sent.length = 0;
        run();
    }
    // The fake never moves units: two turns with no progress toward 13,5, and 9,5 itself is no claim.
    assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [10, 6], JSON.stringify(fake.sent.filter((s) => s.id?.id === 2)));
});

test("settle anywhere looks past 8 tiles: our own land all around, the free land 12 tiles away (game 48 M39-M49)", () => {
    picks([]);
    const owned = (x, y) => Math.abs(x - HOME.x) + Math.abs(y - HOME.y) <= 9;
    fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }], { claimOk: (x, y) => !owned(x, y) && x >= 15 });
    world.cities.push(...others);
    for (const turn of [60, 61]) {
        Game.turn = turn;
        fake.sent.length = 0;
        run({ anywhere: true });
    }
    const to = moveOf(2);
    assert.ok(to && to.X >= 15, JSON.stringify(fake.sent.filter((s) => s.id?.id === 2)));
});

test("a settler is trained in the city that reaches a known site soonest, not the bigger one far away", () => {
    picks([{ x: 34, y: 5, rank: 1 }]);
    fresh([], {});
    world.cities = [{ owner: 0, ...HOME, name: "Home", pop: 9, prod: 10 }, { owner: 0, x: 30, y: 5, name: "Far", pop: 3, prod: 10 }];
    const settler = GameInfo.Units.lookup("UNIT_SETTLER").$hash;
    steps.fillProduction(new Map(), { settlers: true });
    const build = fake.sent.find((s) => s.kind === "operation" && s.args.UnitType === settler);
    assert.equal(build?.id.id, 1, "Far, next to the site");
});

// Research/42 F (game 53: Китион was founded at M42 on Tecumseh's front with one guard and fell at M74).
test("a site on a war front waits until two free melee soldiers could guard it", () => {
    picks([{ x: 9, y: 5, rank: 1 }]);
    const rival = { owner: 1, x: 14, y: 5, name: "Rival", pop: 3 };
    const go = () => run({ defend: true, threats: [], fronts: [], exposed: [] });
    try {
        fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }], { wars: [1] });
        world.cities.push(rival, ...others);
        go();
        assert.equal(moveOf(2), undefined, "5 tiles from Rival's city, no soldier to spare");
        fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }, { id: 3, type: "UNIT_WARRIOR", x: 4, y: 6 }, { id: 4, type: "UNIT_WARRIOR", x: 6, y: 4 }], { wars: [1] });
        world.cities.push(rival, ...others);
        go();
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 5], "two free Warriors");
        // At peace: no front.
        fresh([{ id: 2, type: "UNIT_SETTLER", ...HOME }], { wars: [] });
        world.cities.push(rival, ...others);
        go();
        assert.deepEqual([moveOf(2)?.X, moveOf(2)?.Y], [9, 5]);
    } finally {
        delete world.wars;
    }
});
