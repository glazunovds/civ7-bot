// Town Focus advice end to end: counts the town's own improvements and its connections.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const FARM_TOWN = { x: 12, y: 10 };
const MINE_TOWN = { x: 22, y: 10 };
const near = (x, y, c) => Math.abs(x - c.x) <= 1 && Math.abs(y - c.y) <= 1 && !(x === c.x && y === c.y);
const fake = installFakeEngine({
    width: 30, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    structures: (x, y) => {
        if (near(x, y, FARM_TOWN)) return { district: "DISTRICT_RURAL", constructibles: [x === FARM_TOWN.x + 1 ? "IMPROVEMENT_MINE" : "IMPROVEMENT_FARM"] };
        if (near(x, y, MINE_TOWN)) return { district: "DISTRICT_RURAL", constructibles: [y === MINE_TOWN.y ? "IMPROVEMENT_PASTURE" : "IMPROVEMENT_WOODCUTTER"] };
        return { district: null, constructibles: [] };
    },
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: 4, y: 10, name: "Capital", pop: 9, prod: 20 },
        { owner: 0, x: FARM_TOWN.x, y: FARM_TOWN.y, name: "Fields", isTown: true, pop: 8, prod: 4, connected: [0] },
        { owner: 0, x: MINE_TOWN.x, y: MINE_TOWN.y, name: "Pits", isTown: true, pop: 5, prod: 6 },
    ],
});
const { runTownAdvisor } = await import("../mod/expansion-planner/ui/data/xpl-town-job.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("each town gets the Focus its own tiles favour, with the right warnings", () => {
    const rows = runTownAdvisor(DEFAULT_SETTINGS).rows;
    const fields = rows.find((r) => r.town.name === "Fields").focus;
    const pits = rows.find((r) => r.town.name === "Pits").focus;
    assert.equal(fields.best.key, "FARM", JSON.stringify(fields.options));
    assert.ok(fields.best.count >= 3);
    assert.equal(fields.notes.length, 0, JSON.stringify(fields.notes)); // pop 8, connected to the capital
    assert.equal(pits.best.key, "MINE", JSON.stringify(pits.options));
    const notes = pits.notes.map((n) => n.key);
    assert.ok(notes.includes("LOC_XPL_FOCUS_GROW_FIRST"));
    assert.ok(notes.includes("LOC_XPL_FOCUS_NOT_CONNECTED"));
    void fake;
});
