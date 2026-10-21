// Towns (and planned sites meant to stay towns) get a town-sized plan: the Altar and
// the warehouses, which is all a town can buy. "Plan towns as future cities" overrides.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const CITY = { x: 6, y: 8 };
const TOWN = { x: 16, y: 8 };
const SITE = { x: 26, y: 8 };
const near = (x, y, c) => Math.abs(x - c.x) <= 1 && Math.abs(y - c.y) <= 1;
const world = {
    width: 34, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: near(x, y, CITY) || near(x, y, TOWN) ? 0 : -1 }),
    structures: (x, y) => {
        if (x === CITY.x && y === CITY.y) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] };
        if (x === TOWN.x && y === TOWN.y) return { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_CITY_HALL"] };
        return { district: null, constructibles: [] };
    },
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: CITY.x, y: CITY.y, name: "Athens", pop: 6, prod: 12 },
        { owner: 0, x: TOWN.x, y: TOWN.y, name: "Argos", pop: 3, prod: 4, isTown: true },
    ],
};
installFakeEngine(world);
installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
const { allTarget, listTargets, settlementRole, startBuildingPlan } = await import("../mod/expansion-planner/ui/data/xpl-building-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

// The site search marked SITE as a town and placed its city-centre tack.
await bridge.placeTacks([{ x: SITE.x, y: SITE.y, type: "BUILDING_CITY_HALL", role: "TOWN" }], "settle");

const TOWN_OK = new Set(["BUILDING_ALTAR", "BUILDING_GRANARY", "BUILDING_SAW_PIT", "BUILDING_BRICKYARD", "BUILDING_FISHING_QUAY", "BUILDING_HARBOR"]);
const selected = ["BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_MONUMENT", "BUILDING_ALTAR", "BUILDING_GRANARY"];

async function planAll(extra = {}) {
    const settings = { ...DEFAULT_SETTINGS, includeHidden: true, buildings: { ...DEFAULT_SETTINGS.buildings, selected, timeAware: false, ...extra } };
    await startBuildingPlan(allTarget(listTargets()), settings).promise;
    return state.get().results.plans;
}

const typesFor = (plans, name) => [...plans.placements, ...plans.fillers].filter((p) => p.settlementName.startsWith(name)).map((p) => p.type);

test("roles: city, existing town, planned site remembered as a town", () => {
    const targets = listTargets();
    const site = targets.find((t) => t.kind === "planned");
    assert.equal(site.role, "TOWN");
    assert.equal(settlementRole(targets.find((t) => t.name === "Athens"), DEFAULT_SETTINGS), "CITY");
    assert.equal(settlementRole(targets.find((t) => t.name === "Argos"), DEFAULT_SETTINGS), "TOWN");
    assert.equal(settlementRole(site, DEFAULT_SETTINGS), "TOWN");
});

test("towns get the Altar and warehouses only; the city gets everything", async () => {
    const plans = await planAll();
    const athens = typesFor(plans, "Athens");
    const argos = typesFor(plans, "Argos");
    assert.ok(athens.includes("BUILDING_LIBRARY") && athens.includes("BUILDING_MARKET"), athens.join());
    assert.ok(argos.length > 0);
    for (const t of argos) assert.ok(TOWN_OK.has(t), `Argos (town) got ${t}`);
    const siteMember = plans.members.find((m) => m.role === "TOWN" && m.key.startsWith("p:"));
    assert.ok(siteMember, JSON.stringify(plans.members));
    const site = [...plans.placements, ...plans.fillers].filter((p) => p.sid === siteMember.key).map((p) => p.type);
    for (const t of site) assert.ok(TOWN_OK.has(t), `planned town got ${t}`);
    // Not being allowed in a town is not "unplaced".
    assert.ok(!plans.unplaced.some((u) => u.sid !== "c:6-8" && !TOWN_OK.has(u.type)), JSON.stringify(plans.unplaced));
});

test("“plan towns as future cities” plans full sets for towns too", async () => {
    const plans = await planAll({ townsAsCities: true });
    assert.ok(typesFor(plans, "Argos").includes("BUILDING_LIBRARY"));
    assert.ok(plans.members.every((m) => m.role === "CITY"));
});

test("a city-centre tack without a remembered role is scored on the spot", async () => {
    await bridge.placeTacks([{ x: 26, y: 14, type: "BUILDING_CITY_HALL" }], "settle"); // e.g. placed before roles existed
    const site = listTargets().find((t) => t.kind === "planned" && t.x === 26 && t.y === 14);
    assert.equal(site.role, null);
    assert.ok(["CITY", "TOWN"].includes(settlementRole(site, { ...DEFAULT_SETTINGS, includeHidden: true })));
});

// Research/40 B8: Augustus's towns may buy culture buildings (the game's PURCHASE answer says so): the town plan holds them.
test("a town gets what the game lets it buy too (a civilization's or leader's ability: the Monument), not the rest", async () => {
    const argosId = { owner: 0, id: 1 };
    world.canBuy = (type, id) => (id?.id === argosId.id && type === "BUILDING_MONUMENT" ? { Success: false, InsufficientFunds: true, Plots: [] } : { Success: false });
    const { clearEngineCache } = await import("../mod/expansion-planner/ui/data/xpl-engine-cache.js");
    clearEngineCache(); // the game's answers changed within the turn
    try {
        const plans = await planAll({ incremental: false });
        const argos = typesFor(plans, "Argos");
        assert.ok(argos.includes("BUILDING_MONUMENT"), argos.join());
        assert.ok(!argos.includes("BUILDING_LIBRARY") && !argos.includes("BUILDING_MARKET"), argos.join());
    } finally {
        delete world.canBuy;
    }
});
