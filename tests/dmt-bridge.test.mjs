// DMT bridge against a simulated Detailed Map Tacks (same storage layout and events).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

installFakeEngine({ width: 20, height: 12, tiles: () => ({ terrain: "TERRAIN_FLAT" }), players: [{ id: 0 }] });
const dmt = installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
const registry = await import("../mod/expansion-planner/ui/integrations/xpl-tack-registry.js");

bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

test("places city-centre tacks and records them as ours", async () => {
    const r = await bridge.placeTacks([{ x: 3, y: 3, type: "BUILDING_CITY_HALL" }, { x: 8, y: 4, type: "BUILDING_CITY_HALL" }], "settle");
    assert.equal(r.placed.length, 2);
    assert.equal(dmt.read(3, 3).length, 1);
    assert.equal(dmt.read(3, 3)[0].classType, "BUILDING");
    assert.deepEqual(registry.loadRegistry().map((e) => `${e.x}-${e.y}`).sort(), ["3-3", "8-4"]);
});

test("never duplicates a type on a plot and respects 2 tacks per plot", async () => {
    let r = await bridge.placeTacks([{ x: 3, y: 3, type: "BUILDING_CITY_HALL" }], "settle");
    assert.equal(r.kept, 1, "our own tack is already there: kept, not added twice");
    assert.equal(dmt.read(3, 3).length, 1);
    dmt.add(12, 2, "BUILDING_CITY_HALL"); // the player's own tack of that type
    r = await bridge.placeTacks([{ x: 12, y: 2, type: "BUILDING_CITY_HALL" }], "settle");
    assert.equal(r.skipped[0].reason, "ALREADY_TACKED");
    engine.trigger("RemoveMapTackRequest", { x: 12, y: 2, type: "BUILDING_CITY_HALL" }); // the player removes it again
    dmt.add(10, 6, "BUILDING_LIBRARY");
    dmt.add(10, 6, "BUILDING_MARKET");
    r = await bridge.placeTacks([{ x: 10, y: 6, type: "BUILDING_CITY_HALL" }], "settle");
    assert.equal(r.skipped[0].reason, "PLOT_FULL");
    r = await bridge.placeTacks([{ x: 1, y: 1, type: "NOT_A_TYPE" }], "settle");
    assert.equal(r.skipped[0].reason, "UNKNOWN_TYPE");
});

test("clear removes only our tacks; the player's tack on the same plot stays", async () => {
    dmt.add(8, 4, "BUILDING_LIBRARY"); // player's own tack next to ours
    const { removed } = await bridge.clearOurTacks({ src: "settle" });
    assert.equal(removed, 2);
    assert.deepEqual(dmt.read(3, 3), []);
    assert.deepEqual(dmt.read(8, 4).map((t) => t.type), ["BUILDING_LIBRARY"]);
    assert.equal(registry.loadRegistry().length, 0);
});

test("planned city centres exclude our own tacks; reconcile drops vanished entries", async () => {
    dmt.add(15, 8, "BUILDING_CITY_HALL"); // player's planned settlement
    await bridge.placeTacks([{ x: 5, y: 9, type: "BUILDING_CITY_HALL" }], "settle");
    assert.deepEqual(bridge.plannedCityCentres(), [{ x: 15, y: 8 }]);
    // Player deletes our tack by hand:
    engine.trigger("RemoveMapTackRequest", { x: 5, y: 9, type: "BUILDING_CITY_HALL" });
    bridge.reconcileRegistry();
    assert.equal(registry.loadRegistry().length, 0);
});

test("replacePrevious clears our earlier settle tacks first", async () => {
    await bridge.placeTacks([{ x: 2, y: 2, type: "BUILDING_CITY_HALL" }], "settle");
    const r = await bridge.placeTacks([{ x: 6, y: 2, type: "BUILDING_CITY_HALL" }], "settle", { replacePrevious: true });
    assert.equal(r.removed, 1);
    assert.deepEqual(dmt.read(2, 2), []);
    assert.equal(dmt.read(6, 2).length, 1);
});

test("two placements at once run one after the other; the second finds everything in place", async () => {
    const entries = [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8]].map(([x, y], i) => ({ x, y, type: i % 2 ? "BUILDING_MARKET" : "BUILDING_LIBRARY" }));
    const [a, b] = await Promise.all([
        bridge.placeTacks(entries, "build", { replacePrevious: true }),
        bridge.placeTacks(entries, "build", { replacePrevious: true }),
    ]);
    assert.equal(a.placed.length - a.kept, 6);
    assert.equal(b.kept, 6);
    assert.equal(b.removed, 0);
    for (const e of entries) assert.equal(dmt.read(e.x, e.y).filter((t) => t.type === e.type).length, 1);
    assert.equal(registry.loadRegistry().filter((e) => e.src === "build").length, 6, "every tack we placed is recorded once");
});

test("re-placing a changed plan only touches the tacks that changed", async () => {
    const before = registry.loadRegistry().filter((e) => e.src === "build").map((e) => ({ x: e.x, y: e.y, type: e.type }));
    const next = [...before.slice(1), { x: 9, y: 9, type: "BUILDING_ALTAR" }];
    const requests = [];
    const trigger = engine.trigger;
    engine.trigger = (name, ...args) => {
        if (/MapTackRequest$/.test(name)) requests.push(name);
        return trigger(name, ...args);
    };
    let progress = 0;
    const r = await bridge.placeTacks(next, "build", { replacePrevious: true, onProgress: (done) => (progress = done) });
    engine.trigger = trigger;
    assert.deepEqual({ added: r.placed.length - r.kept, kept: r.kept, removed: r.removed }, { added: 1, kept: 5, removed: 1 });
    assert.deepEqual(requests.sort(), ["AddMapTackRequest", "RemoveMapTackRequest"]);
    assert.equal(progress, 7, "progress counted every tack (1 removal + 6 entries)");
    assert.deepEqual(dmt.read(before[0].x, before[0].y).filter((t) => t.type === before[0].type), []);
});
