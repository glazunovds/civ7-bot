// Analysis only: these assertions document CURRENT defects, not desired behavior.
// Run: node research/game29/reproduce.mjs. No real engine or gameplay files are modified.
import assert from 'node:assert/strict';
import { installFakeEngine } from '../../tests/fakes/fake-engine.mjs';

const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: 'TERRAIN_FLAT', yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1 }],
    cities: [{ owner: 0, x: 5, y: 5, name: 'Home' }, { owner: 0, x: 15, y: 5, name: 'Front' }],
    units: [], gold: 500, goldIncome: 10,
};
const fake = installFakeEngine(world);
const units = await import('../../mod/expansion-planner/ui/data/xpl-autopilot-units.js');
const steps = await import('../../mod/expansion-planner/ui/data/xpl-autopilot-steps.js');
const { DEFAULT_SETTINGS } = await import('../../mod/expansion-planner/ui/services/xpl-settings.js');
const { createBudget } = await import('../../mod/expansion-planner/ui/core/xpl-savings.js');
const front = { settlement: { x: 15, y: 5, name: 'Front' }, count: 1, land: 1, ships: 0, owners: [] };
const reset = (list) => {
    units.resetUnitGoals(); steps.resetWar(); fake.sent.length = 0;
    world.units = list; world.goldIncome = 10; delete world.canBuy;
};
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [front], ...options });
const warrior = (activity) => ({ id: 1, type: 'UNIT_WARRIOR', x: 6, y: 5, activity });
const results = [];

reset([warrior(UnitActivityTypes.AWAKE)]);
assert.ok(run().entries.some(e => e.key === 'REINFORCE'));
assert.equal(units.guardsFor(front), 1);
const distance = GameplayMap.getPlotDistance(6, 5, 15, 5);
assert.ok(distance > units.GUARD_RADIUS);
results.push({ defect: 'Incoming unit counts immediately as a present guard', distance, counted: units.guardsFor(front) });

world.units[0].x = 3; world.units[0].activity = UnitActivityTypes.HEAL;
assert.equal(units.guardsFor(front), 1);
results.push({ defect: 'Old guard assignment still counts after withdrawal and healing elsewhere', counted: units.guardsFor(front) });

reset([warrior(UnitActivityTypes.SLEEP)]);
assert.ok(!run().entries.some(e => e.key === 'REINFORCE'));
results.push({ defect: 'Defend alone does not wake a sleeping reserve to reinforce', moved: false });

reset([{ id: 1, type: 'UNIT_ARCHER', x: 6, y: 5, activity: UnitActivityTypes.AWAKE }]);
const ships = { ...front, land: 0, ships: 2, count: 2 };
assert.ok(!run({ threats: [ships] }).entries.some(e => e.key === 'REINFORCE'));
results.push({ defect: 'Existing ranged reserve is not sent to a threatened coast', moved: false });

reset([
    { id: 1, type: 'UNIT_WARRIOR', x: 14, y: 5, activity: UnitActivityTypes.AWAKE },
    { id: 2, type: 'UNIT_WARRIOR', x: 15, y: 6, activity: UnitActivityTypes.AWAKE },
]);
const second = { ...front, settlement: { x: 22, y: 5, name: 'Second front' } };
assert.ok(!run({ threats: [front, second] }).entries.some(e => e.key === 'REINFORCE'));
results.push({ defect: 'Unit near one threatened settlement cannot be reallocated to another', moved: false });

reset([{ id: 1, type: 'UNIT_WARRIOR', x: 15, y: 5 }]);
world.goldIncome = -10;
world.canBuy = type => type === 'UNIT_ARCHER' ? { Success: true, Cost: 120 } : { Success: false };
const budget = createBudget({ gold: 500, reserve: 500 });
assert.equal(steps.buyDefenders([ships], { budget }).length, 0);
assert.equal(budget.all(), 500);
results.push({ defect: 'Urgent ranged purchase uses free budget in deficit despite available emergency cash', cash: 500, archerCost: 120 });

console.log(JSON.stringify({ reproduced: results.length, results }, null, 2));
