// Research/40 B4: our civilization's great people (Egypt's Tjaty, Greece's Logios, Han's Shi Dafu…) are trained one at a
// time where the game allows and activated where they work. Before, only the Great Banker was ever activated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const MEMPHIS = { x: 4, y: 5 }, THEBES = { x: 12, y: 5 };
const WONDER_TILE = { x: 13, y: 5 };
const world = {
    width: 22, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, ...MEMPHIS, name: "Memphis", prod: 20 }, { owner: 0, ...THEBES, name: "Thebes", prod: 6 }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const ACT = "UNITCOMMAND_ACTIVATE_GREAT_PERSON";
const egypt = () => {
    const me = Players.get(0);
    const before = { civ: me.civilizationType, traits: GameInfo.CivilizationTraits };
    me.civilizationType = GameInfo.Civilizations.lookup("CIVILIZATION_EGYPT").$hash;
    GameInfo.CivilizationTraits = [{ CivilizationType: "CIVILIZATION_EGYPT", TraitType: "TRAIT_EGYPT" }];
    return () => {
        me.civilizationType = before.civ;
        GameInfo.CivilizationTraits = before.traits;
    };
};

test("a great person walks to a tile where it works (a wonder in production) and is activated there", () => {
    units.resetUnitGoals();
    world.units = [{ id: 8, type: "UNIT_TJATY_HEMIUNU", ...MEMPHIS }];
    world.activationPlots = (_id, cmd) => (cmd === ACT ? [GameplayMap.getIndexFromXY(WONDER_TILE.x, WONDER_TILE.y)] : []);
    world.unitCommandOk = (id, op) => op === ACT && world.units[0].x === WONDER_TILE.x;
    try {
        fake.sent.length = 0;
        let r = units.commandUnits(DEFAULT_SETTINGS, {});
        const move = fake.sent.find((s) => s.op === UnitOperationTypes.MOVE_TO)?.args;
        assert.deepEqual([move?.X, move?.Y], [WONDER_TILE.x, WONDER_TILE.y], JSON.stringify(r.entries));
        world.units = [{ id: 8, type: "UNIT_TJATY_HEMIUNU", ...WONDER_TILE }];
        fake.sent.length = 0;
        r = units.commandUnits(DEFAULT_SETTINGS, {});
        assert.ok(fake.sent.some((s) => s.kind === "unitCommand" && s.op === ACT), JSON.stringify(r.entries));
        assert.ok(r.entries.some((e) => e.key === "GREAT_PERSON_USED"));
    } finally {
        world.units = [];
        delete world.activationPlots;
        delete world.unitCommandOk;
    }
});

test("our civilization's great person is trained one at a time, where the game allows and soon", () => {
    const restore = egypt();
    // Memphis has the Necropolis: only it trains the Tjaty.
    world.canBuild = (type, id) => ({ Success: type !== "UNIT_TJATY" || id?.id === 0, Plots: [], ExpandUrbanPlots: [] });
    world.costOf = (type) => (type === "UNIT_TJATY" ? 60 : 100);
    const trained = () => fake.sent.filter((s) => s.kind === "operation" && s.args.UnitType === GameInfo.Units.lookup("UNIT_TJATY").$hash).map((s) => world.cities[s.id.id].name);
    try {
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.deepEqual(trained(), ["Memphis"], JSON.stringify(out));
        assert.ok(out.some((e) => e.key === "QUEUED_GREAT_PERSON"));
        world.units = [{ id: 9, type: "UNIT_TJATY_AMHOSE", ...MEMPHIS }];
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.deepEqual(trained(), [], "one waits to be used");
        world.units = [];
        world.costOf = (type) => (type === "UNIT_TJATY" ? 300 : 100); // 15 turns in Memphis
        fake.sent.length = 0;
        steps.fillProduction(new Map(), { profile: "BALANCED" });
        assert.deepEqual(trained(), [], "too slow");
    } finally {
        restore();
        world.units = [];
        delete world.canBuild;
        delete world.costOf;
    }
});
