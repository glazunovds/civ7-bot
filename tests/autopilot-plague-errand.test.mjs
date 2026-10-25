// The review of game 60's plague package: a way out of the plague of several turns keeps the unit's errand under its goal
// ({ hazard, was }), and every step that read other units' goals lost it for those turns: a settler's site was free for
// another settler, and its map tack went; an order the game did not carry out dropped the errand for good. The errand is now
// what they read (errandOf), and a way out released unmoved gives it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ASTRA = { x: 20, y: 10 };
const SITE = { x: 25, y: 14 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, ...ASTRA, name: "Astrakhan" }, { owner: 0, x: 31, y: 10, name: "Petersburg" }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const moveOf = (id) => {
    const a = fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
    return a ? { x: a.X, y: a.Y } : undefined;
};
const run = () => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: true, defend: false, merchants: false });
const sites = (picks) => state.set({ results: { ...state.get().results, sites: { picks } } });

// Pass 1: the settler at Astrakhan takes the site. Pass 2, a turn later: the plague on Astrakhan and its ring, one tile a
// turn: a way out of 2 turns. @returns pass 2's result
const walkOut = () => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    delete world.plotEffects;
    delete world.speed;
    sites([{ ...SITE, rank: 1 }]);
    world.units = [{ id: 2, type: "UNIT_SETTLER", ...ASTRA, moves: 1 }];
    Game.turn = 70;
    run();
    assert.deepEqual(moveOf(2), SITE);
    fake.sent.length = 0;
    Game.turn = 71;
    world.plotEffects = (x, y) => (GameplayMap.getPlotDistance(x, y, ASTRA.x, ASTRA.y) <= 1 ? ["PLOTEFFECT_PLAGUE"] : []);
    world.speed = () => 1;
    const r = run();
    assert.ok(r.entries.some((e) => e.key === "LEFT_HAZARD_WALK"), JSON.stringify(r.entries));
    return r;
};

test("a settler walking out of the plague keeps its site: taken from another settler, and on the map tacks' list", () => {
    try {
        walkOut();
        assert.deepEqual(units.settlerGoals().map((g) => ({ x: g.x, y: g.y })), [SITE]);
        // Pass 3, a turn later: on its way out; a second settler, 3 tiles from the site, looks for one: not this one.
        const out = moveOf(2) ?? ASTRA;
        fake.sent.length = 0;
        Game.turn = 72;
        delete world.speed;
        world.units = [
            { id: 2, type: "UNIT_SETTLER", x: 21, y: 10, damage: 25, moves: 1, activity: UnitActivityTypes.OPERATION, dest: out },
            { id: 3, type: "UNIT_SETTLER", x: 28, y: 13, moves: 2 },
        ];
        const r = run();
        const to = moveOf(3);
        assert.ok(!to || to.x !== SITE.x || to.y !== SITE.y, `the second settler took its site: ${JSON.stringify(r.entries)}`);
    } finally {
        Game.turn = 1;
        sites([]);
    }
});

test("a way out of the plague the game did not carry out gives the settler its site back (releaseStuckOrders)", () => {
    try {
        const r = walkOut();
        // The game did not move it: still idle where it got the order.
        const released = units.releaseStuckOrders(r.orderedAt);
        assert.equal(released.length, 1);
        assert.deepEqual(units.settlerGoals().map((g) => ({ x: g.x, y: g.y })), [SITE]);
        // Its site did not fail: the next pass, the plague gone, it walks there.
        fake.sent.length = 0;
        Game.turn = 72;
        delete world.plotEffects;
        sites([]);
        run();
        assert.deepEqual(moveOf(2), SITE);
    } finally {
        Game.turn = 1;
        sites([]);
    }
});

test("a settler whose walk the plague cancels gets its next order in the same pass, around the plague", () => {
    // Pass 1: a settler at 12,4 takes its site (19,4). Pass 2, a turn later at 13,4 on its way: the plague on column 15, its
    // next night. Its walk is cancelled and at once it walks on, this turn to a clean tile short of the plague.
    const site = { x: 19, y: 4 };
    units.resetUnitGoals();
    fake.sent.length = 0;
    delete world.plotEffects;
    delete world.speed;
    sites([{ ...site, rank: 1 }]);
    world.units = [{ id: 7, type: "UNIT_SETTLER", x: 12, y: 4, moves: 2 }];
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_CANCEL";
    Game.turn = 80;
    try {
        run();
        assert.deepEqual(moveOf(7), site);
        fake.sent.length = 0;
        Game.turn = 81;
        world.units = [{ id: 7, type: "UNIT_SETTLER", x: 13, y: 4, moves: 2, activity: UnitActivityTypes.OPERATION, dest: site }];
        world.plotEffects = (x) => (x === 15 ? [{ type: "PLOTEFFECT_PLAGUE", duration: 6 }] : []);
        const r = run();
        assert.ok(fake.sent.some((s) => s.id?.id === 7 && s.op === "UNITCOMMAND_CANCEL"), JSON.stringify(r.entries));
        const to = moveOf(7);
        assert.ok(to && to.x === 14, `walks on around the plague: ${JSON.stringify(to)} ${JSON.stringify(r.entries)}`);
    } finally {
        Game.turn = 1;
        sites([]);
        delete world.unitCommandOk;
        delete world.plotEffects;
    }
});
