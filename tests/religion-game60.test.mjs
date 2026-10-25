// Game 60's religion (research/game60 mechanics M2, X2): Lay Followers, Ecclesiasticism and Charoen pay relics only for
// converting another civilization's settlements, which our Missionaries never do; and 9 of 29 spreads were refused («must
// stand in the appropriate district») on tiles of no district in settlements following no religion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { beliefValue } from "../mod/expansion-planner/ui/core/xpl-religion.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";

const ROMA = { x: 3, y: 5 }, CAPUA = { x: 9, y: 5 };
const FARM = { x: 9, y: 4 };   // Capua's improved tile: a rural district
const world = {
    width: 22, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, ...ROMA, name: "Roma", religion: 77 },
        { owner: 0, ...CAPUA, name: "Capua", isTown: true },
    ],
    religion: 77,
    owningCity: (x, y) => {
        const i = [ROMA, CAPUA].findIndex((c) => GameplayMap.getPlotDistance(x, y, c.x, c.y) <= 1);
        return i < 0 ? null : { owner: 0, id: i };
    },
    // Centres are urban, Capua's farm tile rural; its other tiles have no district.
    structures: (x, y) => ([ROMA, CAPUA].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: [] }
        : x === FARM.x && y === FARM.y ? { district: "DISTRICT_RURAL", constructibles: [] } : { district: null, constructibles: [] }),
};
const fake = installFakeEngine(world, "exploration");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const SPREAD = "UNITOPERATION_SPREAD_RELIGION";
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const spread = (id) => fake.sent.some((s) => s.id?.id === id && s.op === SPREAD);
const run = () => {
    fake.sent.length = 0;
    return units.commandUnits(DEFAULT_SETTINGS, {});
};

test("M2: the relic beliefs for converting other civilizations' settlements are worth nothing while we convert none; Akhlaq still counts our cities", () => {
    const w = getProfile("CULTURE").y;
    // Big settlements of ours (10+ rural and urban population) once made Lay Followers worth 5 relics.
    const facts = { settlements: 5, cities: 3, followers: 5, foreign: 0, specialists: 0, rural10: 5, urban10: 5, treasure: 2, focus: "CULTURE" };
    assert.equal(beliefValue("BELIEF_BONUS_15", facts, w), 0, "Lay Followers");
    assert.equal(beliefValue("BELIEF_BONUS_16", facts, w), 0, "Ecclesiasticism");
    assert.equal(beliefValue("BELIEF_BONUS_14", facts, w), 0, "Charoen");
    assert.ok(beliefValue("BELIEF_BONUS_33", facts, w) > 0, "Akhlaq: our own cities' first conversion");
    assert.ok(beliefValue("BELIEF_BONUS_15", { ...facts, convertRural10: 2 }, w) > 0, "with foreign conversions (an opt-in to come) it counts");
});

test("X2: a settlement of no religion is converted only from a district, the nearest urban tile first; a refusal names the district", () => {
    units.resetUnitGoals();
    const next = { x: CAPUA.x - 1, y: CAPUA.y }; // Capua's tile with no district
    const asked = []; // where a spread was tried (the game refuses it off a district)
    world.unitCanStart = (id, op) => {
        if (op !== SPREAD) return undefined;
        const u = world.units.find((x) => x.id === id?.id);
        if (u) asked.push(`${u.x},${u.y}`);
        return { Success: !!u && !(u.x === next.x && u.y === next.y), FailureReasons: ["LOC_TEST_MUST_STAND_IN_DISTRICT"] };
    };
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...next }];
        let r = run();
        assert.ok(!spread(4), "no spread on a tile with no district");
        assert.deepEqual(asked, [], "not even tried there: a refusal keeps the tile off 10 turns, two the settlement");
        assert.ok(!lines.some((l) => /mission: .* refused/.test(l)));
        assert.deepEqual([moveOf(4)?.X, moveOf(4)?.Y], [CAPUA.x, CAPUA.y], `the centre, the nearest urban tile: ${JSON.stringify(r.entries)}`);
        // From outside, the farm is nearer, yet the centre goes first (an urban district surely converts both halves).
        units.resetUnitGoals();
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", x: FARM.x, y: FARM.y - 1 }];
        r = run();
        assert.deepEqual([moveOf(4)?.X, moveOf(4)?.Y], [CAPUA.x, CAPUA.y], JSON.stringify(r.entries));
        // On the farm (a rural district): it spreads there.
        units.resetUnitGoals();
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...FARM }];
        run();
        assert.ok(spread(4));
        // Refused on a district all the same: the probe names it.
        world.unitCanStart = (id, op) => (op === SPREAD ? { Success: false, FailureReasons: ["LOC_TEST_REFUSED"] } : undefined);
        units.resetUnitGoals();
        world.units = [{ id: 4, type: "UNIT_MISSIONARY", ...FARM }];
        run();
        assert.ok(lines.some((l) => /mission: UNIT_MISSIONARY at 9,4 in Capua refused: .*district DISTRICT_RURAL/.test(l)), lines.filter((l) => /mission/.test(l)).join("\n"));
    } finally {
        console.warn = warn;
        world.units = [];
        delete world.unitCanStart;
    }
});
