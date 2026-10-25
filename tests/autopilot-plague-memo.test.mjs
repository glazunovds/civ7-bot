// The review of game 60's plague package: the plague's rules asked the game much more per pass. moveTo asks for a walk's way
// to look at its stops (most callers had just asked for the same way), and a way out of the plague read each tile's plot
// effects about 20 times (each candidate tile and the tiles around it). One unit pass reads the map as it stands, so each way
// and each tile's hazards is asked once in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ASTRA = { x: 20, y: 10 };
const PETERS = { x: 31, y: 10 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, ...ASTRA, name: "Astrakhan" }, { owner: 0, ...PETERS, name: "Petersburg" }],
};
installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("one unit pass asks the game for each way and each tile's hazards once", () => {
    const effects = new Map();
    const paths = new Map();
    const getPlotEffects = MapPlotEffects.getPlotEffects;
    const getPathTo = Units.getPathTo;
    MapPlotEffects.getPlotEffects = (idx) => {
        effects.set(idx, (effects.get(idx) ?? 0) + 1);
        return getPlotEffects(idx);
    };
    Units.getPathTo = (id, l) => {
        const k = `${id.id}|${l.x},${l.y}`;
        paths.set(k, (paths.get(k) ?? 0) + 1);
        return getPathTo(id, l);
    };
    try {
        units.resetUnitGoals();
        // The plague within 2 of Astrakhan, one tile a turn: two units there look for a way out; a guard is sent from 25,10
        // to Petersburg (its post's way asked, then its walk's stops looked at).
        world.plotEffects = (x, y) => (GameplayMap.getPlotDistance(x, y, ASTRA.x, ASTRA.y) <= 2 ? ["PLOTEFFECT_PLAGUE"] : []);
        world.speed = () => 1;
        world.units = [
            { id: 4, type: "UNIT_WARRIOR", ...ASTRA, moves: 1 },
            { id: 5, type: "UNIT_SLINGER", x: 21, y: 10, damage: 25, moves: 1 },
            { id: 6, type: "UNIT_SPEARMAN", x: 25, y: 10, moves: 1 },
        ];
        const threat = { settlement: { ...PETERS, name: "Petersburg" }, count: 1, land: 1, ships: 0, close: 0, damaged: false, owners: [] };
        const r = units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: true, merchants: false, threats: [threat] });
        assert.ok(r.entries.some((e) => e.key.startsWith("LEFT_HAZARD")), JSON.stringify(r.entries));
        const twice = [...effects].filter(([, n]) => n > 1);
        assert.equal(twice.length, 0, `plots read more than once: ${twice.length} of ${effects.size} (most ${Math.max(...effects.values())})`);
        const again = [...paths].filter(([, n]) => n > 1);
        assert.deepEqual(again, [], "ways asked more than once");
        // Outside a pass nothing is kept: a tile infected since is seen.
        world.plotEffects = () => ["PLOTEFFECT_PLAGUE"];
        assert.ok(units.hazardAt({ x: 5, y: 5 }) > 0);
    } finally {
        MapPlotEffects.getPlotEffects = getPlotEffects;
        Units.getPathTo = getPathTo;
        delete world.plotEffects;
        delete world.speed;
    }
});
