// Research/40 C (root gotcha 12): a town big enough for a Focus with no city connected to it keeps growing (its Focus would
// feed nobody). A merchant standing in one of our cities builds it a road when the game offers the town's tile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const CAPITAL = { x: 3, y: 5 }, TOWN = { x: 9, y: 5 };
const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, ...CAPITAL, name: "Ur" }, { owner: 0, ...TOWN, name: "Eridu", isTown: true, pop: 8 }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const ROAD = "UNITCOMMAND_CONNECT_WITH_ROAD";
const roads = () => fake.sent.filter((s) => s.op === ROAD).map((s) => [s.args.X, s.args.Y]);

test("a merchant in a city builds a road to a town of 7+ with no connected city; not to a connected or small one", () => {
    world.unitCommandResult = (_id, op) => (op === ROAD ? { Success: false, Plots: [GameplayMap.getIndexFromXY(TOWN.x, TOWN.y)] } : null);
    try {
        units.resetUnitGoals();
        world.units = [{ id: 5, type: "UNIT_MERCHANT", ...CAPITAL }];
        fake.sent.length = 0;
        const r = units.commandUnits(DEFAULT_SETTINGS, { merchants: true });
        assert.deepEqual(roads(), [[TOWN.x, TOWN.y]], JSON.stringify(r.entries));
        world.cities[1].connected = [0];
        fake.sent.length = 0;
        units.commandUnits(DEFAULT_SETTINGS, { merchants: true });
        assert.deepEqual(roads(), [], "connected to Ur already");
        world.cities[1].connected = [];
        world.cities[1].pop = 5;
        fake.sent.length = 0;
        units.commandUnits(DEFAULT_SETTINGS, { merchants: true });
        assert.deepEqual(roads(), [], "too small for a Focus yet");
    } finally {
        delete world.unitCommandResult;
        world.units = [];
        world.cities[1].pop = 8;
        delete world.cities[1].connected;
    }
});
