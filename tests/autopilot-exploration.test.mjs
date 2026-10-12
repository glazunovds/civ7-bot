// Exploration age: treasure convoys go home and unload; with the economy focus settlers head for
// the Distant Lands first (the game's own suggestions), once the seas are safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 3, y: 5 }, COLONY = { x: 30, y: 5 };
const world = {
    width: 40, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...HOME, name: "Lisbon" },
        { owner: 0, ...COLONY, name: "Macau", distant: true, isTown: true },
    ],
    distantAt: (x) => x >= 20,
    techs: ["NODE_TECH_EX_SHIPBUILDING"],
};
const fake = installFakeEngine(world, "exploration");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const run = (options) => {
    fake.sent.length = 0;
    return units.commandUnits(DEFAULT_SETTINGS, options);
};

test("a treasure convoy walks home to our Homeland and unloads there, whatever unit options are on", () => {
    world.owningCity = (x, y) => (GameplayMap.getPlotDistance(x, y, HOME.x, HOME.y) <= 1 ? { owner: 0, id: 0 } : null);
    units.resetUnitGoals();
    world.units = [{ id: 5, type: "UNIT_TREASURE_FLEET", ...COLONY }];
    let r = run({ defend: true });
    const to = moveOf(5);
    assert.ok(to && GameplayMap.getPlotDistance(to.X, to.Y, HOME.x, HOME.y) <= 1, JSON.stringify(r.entries));
    assert.equal(r.entries[0].key, "TREASURE_HOME");
    // Inside Lisbon's borders: unload.
    world.units = [{ id: 5, type: "UNIT_TREASURE_FLEET", x: HOME.x + 1, y: HOME.y }];
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_DISBAND";
    r = run({ defend: true });
    assert.ok(fake.sent.some((s) => s.op === "UNITCOMMAND_DISBAND"));
    assert.deepEqual(r.entries[0].args, ["Lisbon"]);
    delete world.unitCommandOk;
    delete world.owningCity;
    world.units = [];
});

test("economy focus: settlers go to a Distant Lands site the game suggests before our own sites", () => {
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 8, y: 5, rank: 1 }] } } });
    world.aiSuggestions = () => [{ location: { x: 9, y: 8 } }, { location: { x: 24, y: 6 } }];
    try {
        units.resetUnitGoals();
        world.units = [{ id: 7, type: "UNIT_SETTLER", ...HOME }];
        let r = run({ settlers: true, distant: true });
        assert.deepEqual([moveOf(7)?.X, moveOf(7)?.Y], [24, 6], JSON.stringify(r.entries));
        units.resetUnitGoals();
        r = run({ settlers: true });
        assert.deepEqual([moveOf(7)?.X, moveOf(7)?.Y], [8, 5], "without it: our best site");
        // Before Shipbuilding the ocean between would hurt: no Distant Lands (here no ocean, but rough seas block nothing else).
    } finally {
        delete world.aiSuggestions;
        world.units = [];
    }
});
