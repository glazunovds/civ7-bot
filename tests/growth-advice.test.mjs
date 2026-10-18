// Growth advisor: when a city grows, rank the tiles the game offers (with the building
// plan's needs) and the specialist tiles (from the game's before/after numbers).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const C = { x: 8, y: 8 };
const RICH = { x: 10, y: 8 };     // food 4, nothing planned
const NEEDED = { x: 10, y: 9 };   // food 2, the plan's Library goes here, not owned yet
const URBAN = { x: 9, y: 8 };     // food 3, owned, the plan's Market goes here
let urbanScience = 6;             // what one more specialist adds on URBAN (the game's NextYields - CurrentYields)
let urbanHappiness = 0;           // ...and the Happiness it costs (Modern: 6)
const world = {
    width: 20, height: 16, wrapX: false,
    tiles: (x, y) => {
        if (x === RICH.x && y === RICH.y) return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 4 } };
        if (x === URBAN.x && y === URBAN.y) return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 3 } };
        return { terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } };
    },
    structures: (x, y) => (x === C.x && y === C.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: C.x, y: C.y, name: "Athens", pop: 5, prod: 8 }],
    expand: () => ({
        Success: true,
        Plots: [RICH, NEEDED, URBAN].map((l) => GameplayMap.getIndexFromXY(l.x, l.y)),
        ConstructibleTypes: ["IMPROVEMENT_FARM", "IMPROVEMENT_FARM", "IMPROVEMENT_FARM"].map((t) => GameInfo.Constructibles.lookup(t)?.$hash),
    }),
    workers: () => {
        const sci = GameInfo.Yields.lookup("YIELD_SCIENCE").$index;
        const food = GameInfo.Yields.lookup("YIELD_FOOD").$index;
        const happy = GameInfo.Yields.lookup("YIELD_HAPPINESS").$index;
        const arr = (pairs) => {
            const a = Array.from(GameInfo.Yields, () => 0);
            for (const [i, v] of pairs) a[i] = v;
            return a;
        };
        return [
            { PlotIndex: GameplayMap.getIndexFromXY(C.x, C.y), IsBlocked: false, NumWorkers: 0, MaxWorkers: 1, CurrentYields: arr([]), NextYields: arr([[sci, 2]]), CurrentMaintenance: arr([]), NextMaintenance: arr([[food, 2]]) },
            { PlotIndex: GameplayMap.getIndexFromXY(URBAN.x, URBAN.y), IsBlocked: false, NumWorkers: 0, MaxWorkers: 1, CurrentYields: arr([]), NextYields: arr([[sci, urbanScience]]), CurrentMaintenance: arr([]), NextMaintenance: arr([[food, 2], [happy, urbanHappiness]]) },
            { PlotIndex: GameplayMap.getIndexFromXY(7, 8), IsBlocked: true, NumWorkers: 0, MaxWorkers: 1, CurrentYields: arr([]), NextYields: arr([[sci, 20]]), CurrentMaintenance: arr([]), NextMaintenance: arr([]) },
        ];
    },
};
const fake = installFakeEngine(world);
const { growthAdvice } = await import("../mod/expansion-planner/ui/data/xpl-growth-job.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const athens = () => Players.get(0).Cities.getCities()[0];

test("without a plan the richest tile wins", () => {
    const a = growthAdvice(athens().id, DEFAULT_SETTINGS);
    assert.deepEqual([a.best.x, a.best.y], [RICH.x, RICH.y]);
    assert.equal(a.best.improvement, "IMPROVEMENT_FARM");
});

test("a tile the plan needs wins; a tile the plan urbanises is marked and loses a little", () => {
    state.set({ results: { ...state.get().results, plans: { placements: [{ ...NEEDED, type: "BUILDING_LIBRARY", name: "Library", value: 6 }, { ...URBAN, type: "BUILDING_MARKET", name: "Market" }], fillers: [] } } });
    const a = growthAdvice(athens().id, DEFAULT_SETTINGS);
    assert.deepEqual([a.best.x, a.best.y], [NEEDED.x, NEEDED.y]);
    assert.deepEqual(a.best.planned, ["Library"]);
    const urban = a.expand.find((e) => e.x === URBAN.x && e.y === URBAN.y);
    assert.equal(urban.owned, true); // the fake city owns its ring-1 tiles
    assert.deepEqual(urban.planned, ["Market"]);
    assert.ok(urban.score < a.expand.find((e) => e.x === RICH.x).score);
});

test("specialists: the game's gain minus the added upkeep; blocked tiles skipped", () => {
    const a = growthAdvice(athens().id, DEFAULT_SETTINGS);
    assert.equal(a.specialists.length, 2);
    assert.deepEqual([a.bestSpecialist.x, a.bestSpecialist.y], [URBAN.x, URBAN.y]);
    assert.ok(a.bestSpecialist.gain > a.specialists[1].gain);
    assert.equal(a.bestSpecialist.upkeep[0], 2); // food
    void fake;
});

test("one overall winner on one scale: a specialist's gain after its upkeep against the best tile", () => {
    let a = growthAdvice(athens().id, DEFAULT_SETTINGS);
    assert.equal(a.choice, "TILE", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
    urbanScience = 14; // a tile where a specialist would add a lot
    a = growthAdvice(athens().id, DEFAULT_SETTINGS);
    assert.equal(a.choice, "SPECIALIST", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
    urbanScience = 6;
});

test("a tile where the plan builds counts only until that building's turn", () => {
    const plans = (eta) => ({ timeAware: true, horizon: 100, placements: [{ ...URBAN, type: "BUILDING_MARKET", name: "Market", eta }], fillers: [] });
    state.set({ results: { ...state.get().results, plans: plans(50) } });
    const late = growthAdvice(athens().id, DEFAULT_SETTINGS).expand.find((e) => e.x === URBAN.x && e.y === URBAN.y);
    assert.equal(late.buildTurn, 50);
    state.set({ results: { ...state.get().results, plans: plans(10) } });
    const soon = growthAdvice(athens().id, DEFAULT_SETTINGS).expand.find((e) => e.x === URBAN.x && e.y === URBAN.y);
    assert.equal(soon.buildTurn, 10);
    assert.ok(soon.score < late.score, `soon ${soon.score} late ${late.score}`);
    assert.ok(Math.abs(late.score / soon.score - 5) < 0.6, "half the age left vs a tenth");
});

test("a specialist's food upkeep weighs less in a city with plenty of food", () => {
    const lean = growthAdvice(athens().id, DEFAULT_SETTINGS).bestSpecialist.gain;
    world.cities[0].food = 150;
    const rich = growthAdvice(athens().id, DEFAULT_SETTINGS).bestSpecialist.gain;
    world.cities[0].food = undefined;
    assert.ok(rich > lean + 1, `lean ${lean} rich ${rich}`);
});

test("a city with plenty of food values more food less: a specialist beats the farm; short of food the farm wins (research/26 §3.2: game 14, 44 farms to 8 specialists)", () => {
    urbanScience = 5;
    try {
        world.cities[0].food = 40;
        let a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.equal(a.choice, "SPECIALIST", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
        world.cities[0].food = 1;
        a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.equal(a.choice, "TILE", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
    } finally {
        delete world.cities[0].food;
        urbanScience = 6;
    }
});

test("the player's balance tilts the choice: science ×2 sends the citizen to the specialist, food ×2 keeps it on the farm", () => {
    let a = growthAdvice(athens().id, DEFAULT_SETTINGS);
    assert.equal(a.choice, "TILE");
    a = growthAdvice(athens().id, { ...DEFAULT_SETTINGS, yieldBias: { F: 1, P: 1, G: 1, S: 2, C: 1, H: 1 } });
    assert.equal(a.choice, "SPECIALIST", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
    world.cities[0].food = 40;
    try {
        a = growthAdvice(athens().id, { ...DEFAULT_SETTINGS, yieldBias: { F: 2, P: 1, G: 1, S: 0.5, C: 1, H: 1 } });
        assert.equal(a.choice, "TILE", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
    } finally {
        delete world.cities[0].food;
    }
});

test("a specialist that would take the city below zero Happiness pays the game's penalty on its other yields: the tile wins (research/31 §8: game 27's Лоян, production 31 → 12)", () => {
    const city = world.cities[0];
    urbanScience = 20;
    urbanHappiness = 6;
    try {
        Object.assign(city, { food: 40, prod: 30, nets: { YIELD_GOLD: 20, YIELD_SCIENCE: 40, YIELD_CULTURE: 10 } });
        city.happy = 30; // 30 − 6: plenty left, the specialist's 20 science wins
        let a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.equal(a.choice, "SPECIALIST", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
        city.happy = 0; // 0 − 6: the game would take 30% of 30 production, 40 science, 20 gold and 10 culture
        a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.equal(a.choice, "TILE", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
    } finally {
        for (const k of ["food", "prod", "nets", "happy"]) delete city[k];
        urbanScience = 6;
        urbanHappiness = 0;
    }
});

// Below zero Happiness the game takes a share of the new yields too: at the 80% cap a specialist's own science counts a
// fifth, and the penalty it adds is nothing (research/34 §3: game 28's Nineveh at −23 took one valued 19.6, and its
// science moved 26 → 27).
test("in a city at the unhappiness cap a specialist's own yields count at what the city keeps: the tile wins", () => {
    const city = world.cities[0];
    urbanScience = 20;
    urbanHappiness = 6;
    try {
        Object.assign(city, { food: 40, prod: 30, nets: { YIELD_GOLD: 20, YIELD_SCIENCE: 40, YIELD_CULTURE: 10 } });
        city.happy = -23;
        const a = growthAdvice(athens().id, DEFAULT_SETTINGS);
        assert.equal(a.choice, "TILE", `tile ${a.best.score} vs specialist ${a.bestSpecialist.gain}`);
        const urban = a.specialists.find((s) => s.x === URBAN.x && s.y === URBAN.y);
        city.happy = 30;
        const calm = growthAdvice(athens().id, DEFAULT_SETTINGS).specialists.find((s) => s.x === URBAN.x && s.y === URBAN.y);
        assert.ok(urban.gain < calm.gain - 10, `at −23 ${urban.gain}, at 30 ${calm.gain}`);
    } finally {
        for (const k of ["food", "prod", "nets", "happy"]) delete city[k];
        urbanScience = 6;
        urbanHappiness = 0;
    }
});
