// Modern age: explorers («Исследователь», units with ExtractsArtifacts) dig up artifacts on
// ruins and natural wonders, research new dig sites at our museums, and cities train up to
// two while there is something to dig or research. Uses the Modern game data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const RUINS = [{ x: 8, y: 5 }, { x: 3, y: 8 }];
const MUSEUM = { x: 2, y: 2 };
let ruins = RUINS;
const world = {
    width: 20, height: 12, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", owner: x <= 3 && y <= 3 ? 0 : -1 }),
    structures: (x, y) => ({
        district: null,
        constructibles: [
            ...(ruins.some((r) => r.x === x && r.y === y) ? ["IMPROVEMENT_RUINS"] : []),
            ...(x === MUSEUM.x && y === MUSEUM.y ? ["BUILDING_MUSEUM"] : []),
        ],
    }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 2, y: 2, name: "Paris" }],
};
const fake = installFakeEngine(world, "modern");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const at = (id) => world.units.find((u) => u.id === id.id);
const onRuins = (id) => ruins.some((r) => r.x === at(id).x && r.y === at(id).y);
const onMuseum = (id) => at(id).x === MUSEUM.x && at(id).y === MUSEUM.y;
// Like the game: digging only on a dig site, researching only at a museum with ages left.
world.unitCanStart = (id, op) => {
    if (op === "UNITOPERATION_EXCAVATE") return { Success: onRuins(id) };
    if (op === "UNITOPERATION_RESEARCH_ARTIFACTS") return { Success: onMuseum(id) && (world.researchAges?.(0) ?? 0) > 0 };
    return undefined;
};
const run = () => units.commandUnits(DEFAULT_SETTINGS, { explore: true });
const fresh = (list) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
};
const ops = (id) => fake.sent.filter((s) => s.kind === "unit" && s.id.id === id).map((s) => [s.op, s.args?.X, s.args?.Y]);

test("an explorer on ruins digs; another walks to the nearest ruins nobody else digs", () => {
    ruins = RUINS;
    fresh([{ id: 1, type: "UNIT_EXPLORER", x: 7, y: 7 }, { id: 2, type: "UNIT_EXPLORER", ...RUINS[0] }]);
    const r = run();
    assert.deepEqual(ops(2), [["UNITOPERATION_EXCAVATE", -9999, -9999]]);
    assert.deepEqual(ops(1), [["UNITOPERATION_MOVE_TO", 3, 8]], "not the ruins explorer 2 digs, though nearer");
    assert.deepEqual(r.entries.map((e) => e.key).sort(), ["ARTIFACT_MOVE", "EXCAVATED"]);
});

test("no ruins left: explorers research new sites at our museum while its continent has ages left", () => {
    ruins = [];
    world.researchAges = () => 1;
    fresh([{ id: 1, type: "UNIT_EXPLORER", x: 7, y: 7 }]);
    run();
    assert.deepEqual(ops(1), [["UNITOPERATION_MOVE_TO", MUSEUM.x, MUSEUM.y]]);
    fresh([{ id: 1, type: "UNIT_EXPLORER", ...MUSEUM }]);
    const r = run();
    assert.deepEqual(ops(1), [["UNITOPERATION_RESEARCH_ARTIFACTS", -9999, -9999]]);
    assert.equal(r.entries[0].key, "RESEARCHED_ARTIFACTS");
    // Nothing left to research there: nothing to do.
    world.researchAges = () => 0;
    fresh([{ id: 1, type: "UNIT_EXPLORER", x: 7, y: 7 }]);
    run();
    assert.deepEqual(ops(1), []);
    delete world.researchAges;
});

test("a natural wonder that still holds an artifact is a dig site", () => {
    ruins = [];
    const tiles = world.tiles;
    world.tiles = (x, y) => ({ ...tiles(x, y), ...(x === 12 && y === 3 ? { naturalWonder: true, feature: "FEATURE_MOUNT_EVEREST" } : {}) });
    try {
        assert.deepEqual(units.artifactSites().dig, []);
        world.wonderArtifacts = [GameplayMap.getFeatureType(12, 3)];
        assert.deepEqual(units.artifactSites().dig, [{ x: 12, y: 3 }]);
    } finally {
        world.tiles = tiles;
        delete world.wonderArtifacts;
    }
});

test("cities train explorers (up to 2) while there is something to dig or research", () => {
    const explorer = GameInfo.Units.lookup("UNIT_EXPLORER").$hash;
    const queued = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === explorer).length;
    const scouts = [{ id: 10, type: "UNIT_SCOUT", x: 9, y: 9, activity: UnitActivityTypes.SLEEP }, { id: 11, type: "UNIT_SCOUT", x: 9, y: 9, activity: UnitActivityTypes.SLEEP }];
    ruins = RUINS;
    fresh(scouts);
    let out = steps.fillProduction(new Map(), { explore: true });
    assert.equal(queued(), 1, JSON.stringify(out));
    assert.ok(out.some((e) => e.key === "QUEUED_EXPLORER"));
    fresh([...scouts, { id: 1, type: "UNIT_EXPLORER", x: 7, y: 7 }, { id: 2, type: "UNIT_EXPLORER", x: 6, y: 7 }]);
    steps.fillProduction(new Map(), { explore: true });
    assert.equal(queued(), 0, "two already");
    ruins = [];
    fresh(scouts);
    steps.fillProduction(new Map(), { explore: true });
    assert.equal(queued(), 0, "nothing to dig or research");
    ruins = RUINS;
    fresh(scouts);
    steps.fillProduction(new Map(), { explore: false });
    assert.equal(queued(), 0, "only while the autopilot explores");
});
