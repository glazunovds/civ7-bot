// Research/40 C: Rome's Legatus founds a town with the land-claim charge it gets every 3 promotions (game 41's stood at its
// post all game); a commander that may convert independents' units does so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ROMA = { x: 4, y: 5 }, SITE = { x: 9, y: 5 };
const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, ...ROMA, name: "Roma" }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const FOUND = "UNITOPERATION_FOUND_CITY";
const sent = (op) => fake.sent.filter((s) => s.op === op);

test("a Legatus with a land-claim charge walks to a known site in peace and founds a town there; none without the charge or under threat", () => {
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: SITE.x, y: SITE.y, rank: 1 }] } } });
    let charged = true;
    world.unitCanStart = (id, op, args, exclusion) => (op === FOUND ? { Success: charged && (exclusion || world.units[0].x === SITE.x) }
        : op === "UNITOPERATION_CONVERT_BARBARIANS" ? { Success: false } : undefined);
    try {
        units.resetUnitGoals();
        world.units = [{ id: 3, type: "UNIT_LEGATUS", ...ROMA, commander: true }];
        fake.sent.length = 0;
        let r = units.commandUnits(DEFAULT_SETTINGS, { settlers: true, defend: true });
        const move = sent(UnitOperationTypes.MOVE_TO)[0]?.args;
        assert.deepEqual([move?.X, move?.Y], [SITE.x, SITE.y], JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "LEGATUS_MOVE"));
        world.units = [{ id: 3, type: "UNIT_LEGATUS", ...SITE, commander: true }];
        fake.sent.length = 0;
        r = units.commandUnits(DEFAULT_SETTINGS, { settlers: true, defend: true });
        assert.equal(sent(FOUND).length, 1, JSON.stringify(r.entries));
        charged = false;
        units.resetUnitGoals();
        world.units = [{ id: 3, type: "UNIT_LEGATUS", ...ROMA, commander: true }];
        fake.sent.length = 0;
        r = units.commandUnits(DEFAULT_SETTINGS, { settlers: true, defend: true });
        assert.ok(!r.entries.some((e) => e.key.startsWith("LEGATUS")), "no charge: its post");
    } finally {
        delete world.unitCanStart;
        world.units = [];
    }
});

test("a commander converts the independents' units next to it when the game offers it", () => {
    world.unitCanStart = (id, op) => (op === "UNITOPERATION_CONVERT_BARBARIANS" ? { Success: true, Plots: [GameplayMap.getIndexFromXY(5, 5)] } : undefined);
    try {
        units.resetUnitGoals();
        world.units = [{ id: 7, type: "UNIT_ARMY_COMMANDER", ...ROMA }];
        fake.sent.length = 0;
        const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true });
        const c = sent("UNITOPERATION_CONVERT_BARBARIANS")[0]?.args;
        assert.deepEqual([c?.X, c?.Y], [5, 5], JSON.stringify(r.entries));
    } finally {
        delete world.unitCanStart;
        world.units = [];
    }
});
