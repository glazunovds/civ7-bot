// The victory focus's own work (Modern game data): science projects and a Launch Pad first,
// factories for economy, and the Great Banker opening World Bank offices abroad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const PARIS = { x: 3, y: 3 }, LYON = { x: 10, y: 3 };
const BERLIN = { x: 20, y: 5 }, ROME = { x: 30, y: 5 };
const world = {
    width: 40, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }, { id: 1 }, { id: 2 }],
    cities: [
        { owner: 0, ...PARIS, name: "Paris", prod: 30, queue: { type: "BUILDING_RAIL_STATION", turns: 4 } },
        { owner: 0, ...LYON, name: "Lyon", prod: 10 },
        { owner: 1, ...BERLIN, name: "Berlin" },
        { owner: 2, ...ROME, name: "Rome" },
    ],
};
const fake = installFakeEngine(world, "modern");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const P = (t) => GameInfo.Projects.lookup(t).$hash;
const C = (t) => GameInfo.Constructibles.lookup(t).$hash;
const builds = () => fake.sent.filter((s) => s.kind === "operation" && s.args.InsertMode === undefined).map((s) => [s.id.id, s.args.ProjectType ?? s.args.ConstructibleType]);
const offered = new Set(["PROJECT_LAUNCH_SATELLITE", "PROJECT_CREWED_SPACE_FLIGHT_PREP", "BUILDING_LAUNCH_PAD", "BUILDING_FACTORY"]);
world.canBuild = (type, id) => (type === undefined ? { Success: true } : offered.has(type) ? { Success: true, Plots: type.startsWith("BUILDING") ? [idx(id.id === 0 ? 4 : 11, 3)] : [], ExpandUrbanPlots: [] } : { Success: false, Plots: [] });

test("science: every Innovation project the game offers, in the best producing city; a Launch Pad when we have none", () => {
    fake.sent.length = 0;
    const out = steps.pushVictoryWork("SCIENCE");
    assert.deepEqual(builds(), [[0, P("PROJECT_CREWED_SPACE_FLIGHT_PREP")], [0, P("PROJECT_LAUNCH_SATELLITE")], [0, C("BUILDING_LAUNCH_PAD")]]);
    assert.ok(out.every((e) => e.key === "VICTORY_WORK"));
    const pad = fake.sent.find((s) => s.args.ConstructibleType === C("BUILDING_LAUNCH_PAD"));
    assert.deepEqual([pad.args.X, pad.args.Y], [4, 3], "on a tile the game offers");
    // A Launch Pad already stands in Paris: none more.
    world.structures = (x, y) => ({ district: null, constructibles: x === 4 && y === 3 ? ["BUILDING_LAUNCH_PAD"] : [] });
    fake.sent.length = 0;
    steps.pushVictoryWork("SCIENCE");
    assert.ok(!builds().some(([, t]) => t === C("BUILDING_LAUNCH_PAD")));
    delete world.structures;
});

test("economy: a Factory in every city that can build one; one already queued goes to the front", () => {
    fake.sent.length = 0;
    steps.pushVictoryWork("ECONOMIC");
    assert.deepEqual(builds(), [[0, C("BUILDING_FACTORY")], [1, C("BUILDING_FACTORY")]]);
    world.cities[0].queued = ["BUILDING_FACTORY"];
    fake.sent.length = 0;
    steps.pushVictoryWork("ECONOMIC");
    const move = fake.sent.find((s) => s.args.InsertMode === CityOperationsParametersValues.MoveTo);
    assert.deepEqual([move?.id.id, move?.args.QueueSourceLocation, move?.args.QueueDestinationLocation], [0, 1, 0]);
    assert.deepEqual(builds(), [[1, C("BUILDING_FACTORY")]], "not queued twice in Paris");
    delete world.cities[0].queued;
    fake.sent.length = 0;
    assert.deepEqual(steps.pushVictoryWork("CULTURE"), [], "culture: wonders as usual");
});

test("the Great Banker teleports to another capital, opens the World Bank office there, then the next; refused (gold): later", () => {
    const at = (p) => world.units[0].x === p.x && world.units[0].y === p.y;
    world.owningCity = (x, y) => (GameplayMap.getPlotDistance(x, y, BERLIN.x, BERLIN.y) <= 1 ? { owner: 1, id: 0 } : GameplayMap.getPlotDistance(x, y, ROME.x, ROME.y) <= 1 ? { owner: 2, id: 0 } : GameplayMap.getPlotDistance(x, y, PARIS.x, PARIS.y) <= 1 ? { owner: 0, id: 0 } : null);
    world.unitCanStart = (_id, op) => (op === "UNITOPERATION_TELEPORT_TO_CITY" ? { Success: true, Plots: [idx(BERLIN.x, BERLIN.y), idx(ROME.x, ROME.y)] } : undefined);
    world.unitCommandOk = (_id, op) => op === "UNITCOMMAND_ACTIVATE_GREAT_PERSON" && at(BERLIN);
    const teleport = () => fake.sent.find((s) => s.op === "UNITOPERATION_TELEPORT_TO_CITY")?.args;
    const act = () => fake.sent.some((s) => s.op === "UNITCOMMAND_ACTIVATE_GREAT_PERSON");
    try {
        units.resetUnitGoals();
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...PARIS }];
        let r = units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.deepEqual(teleport(), { X: BERLIN.x, Y: BERLIN.y }, JSON.stringify(r.entries));
        assert.equal(r.entries[0].key, "BANKER_MOVE");
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...BERLIN }];
        r = units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.ok(act());
        assert.equal(r.entries[0].key, "BANK_OPENED");
        // Berlin is done: on to Rome, where the game refuses it for now (not enough gold).
        fake.sent.length = 0;
        units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.deepEqual(teleport(), { X: ROME.x, Y: ROME.y });
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...ROME }];
        r = units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.ok(!act() && !teleport(), "Berlin done, Rome refused: wait");
        // Back home: Rome is tried again only after a while.
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...PARIS }];
        units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        assert.equal(teleport(), undefined, "refused this turn");
        const turn = Game.turn;
        Game.turn = turn + 10;
        fake.sent.length = 0;
        units.commandUnits(DEFAULT_SETTINGS, { victory: true });
        Game.turn = turn;
        assert.deepEqual(teleport(), { X: ROME.x, Y: ROME.y }, "ten turns later: again");
        // Without the victory focus it is left to the player.
        units.resetUnitGoals();
        fake.sent.length = 0;
        world.units = [{ id: 9, type: "UNIT_JOHN_MAYNARD_KEYNES", ...PARIS }];
        units.commandUnits(DEFAULT_SETTINGS, { defend: true });
        assert.equal(teleport(), undefined);
    } finally {
        delete world.owningCity;
        delete world.unitCanStart;
        delete world.unitCommandOk;
        world.units = [];
    }
});
