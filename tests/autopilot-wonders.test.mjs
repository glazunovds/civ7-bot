// Autopilot wonders: an empty queue starts the wonder the Wonders tab rates best (a race
// we can win, finishing this age, best value per production turn) on its best tile; only
// `maxWonders` at once; a wonder a rival is about to finish is not started.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";

const W = 26, H = 16;
const grid = new HexGrid(W, H, false);
const A = { x: 6, y: 8 };
const B = { x: 16, y: 8 };
const tileNear = (c, dx) => grid.index(c.x + dx, c.y);
const world = {
    width: W, height: H, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: [A, B].some((c) => grid.distanceXY(x, y, c.x, c.y) <= 2) ? 0 : -1 }),
    structures: (x, y) => ([A, B].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [
        { owner: 0, x: A.x, y: A.y, name: "Athens", pop: 8, prod: 30 },
        { owner: 0, x: B.x, y: B.y, name: "Sparta", pop: 6, prod: 10 },
        // A rival a few turns from the Pyramids (omniscient mode reads it; fair mode sees nothing).
        { owner: 1, x: 22, y: 3, name: "Babylon", pop: 6, prod: 20, queue: { type: "WONDER_PYRAMIDS", turns: 2, pct: 90 } },
    ],
    costOf: (type) => (type.startsWith("WONDER_") ? 300 : 100),
    canBuild: (type, id, args) => {
        if (!type.startsWith("WONDER_")) return { Success: true, Plots: [], ExpandUrbanPlots: [] };
        if (!["WONDER_PYRAMIDS", "WONDER_HANGING_GARDENS"].includes(type)) return { Success: false, Plots: [], FailureReasons: ["LOC_LOCKED"] };
        const c = id.id === 0 ? A : B;
        return { Success: true, Plots: [tileNear(c, 1), tileNear(c, -1)], ExpandUrbanPlots: [] };
    },
    agePoints: 20,
};
const fake = installFakeEngine(world);
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const wonderOrders = () => fake.sent.filter((s) => s.kind === "operation" && GameInfo.Constructibles.lookup(s.args.ConstructibleType)?.ConstructibleClass === "WONDER");

test("the fastest city starts the best wonder on its best tile; only one at a time", () => {
    const picks = steps.chooseWonders(DEFAULT_SETTINGS, 1);
    assert.equal(picks.size, 1);
    const [cityKey, pick] = [...picks][0];
    assert.equal(cityKey, `c:${A.x}-${A.y}`, "Athens has three times Sparta's production");
    const out = steps.fillProduction(picks);
    const orders = wonderOrders();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].id.id, 0);
    assert.deepEqual([orders[0].args.X, orders[0].args.Y], [pick.x, pick.y]);
    assert.ok(out.some((e) => e.key === "QUEUED_WONDER"));
    assert.ok(out.some((e) => ["QUEUED_ADVISOR", "QUEUED_PLAN", "QUEUED_FALLBACK"].includes(e.key)), "Sparta still gets normal production");
});

test("two at once when allowed, never two in one city", () => {
    const picks = steps.chooseWonders(DEFAULT_SETTINGS, 2);
    assert.equal(picks.size, 2);
    assert.deepEqual([...picks.keys()].sort(), [`c:${A.x}-${A.y}`, `c:${B.x}-${B.y}`].sort());
});

test("omniscient: a wonder a rival finishes in 2 turns is not started", () => {
    const picks = steps.chooseWonders({ ...DEFAULT_SETTINGS, wonders: { omniscient: true } }, 2);
    assert.ok(![...picks.values()].some((p) => p.type === "WONDER_PYRAMIDS"), JSON.stringify([...picks.values()]));
});
