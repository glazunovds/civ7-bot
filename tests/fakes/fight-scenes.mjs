// Scenes for the fight simulator (tests/fakes/fight-sim.mjs), shared by tests/fight-sim.test.mjs and tools/fight-sim.mjs.
// Each scene is a world for installFakeEngine and a `start` that places the units and returns the simulator.
import { createFightSim, autopilotPass } from "./fight-sim.mjs";
import { HexGrid } from "../../mod/expansion-planner/ui/core/xpl-hex.js";

/**
 * Game 58 (research/game58): Керманцы, an independent's village 3 tiles from our town Дыонглам and 9 from our capital, keeps
 * a Warrior, a Spearman and an Archer around it and spawns another every 4 turns (4 at most); we have two generals (the
 * vanguard at the capital, the bastion on the town) and six soldiers: a Warrior on the capital, two Spearmen and an Archer at
 * the town, an Archer and a Warrior by the capital. The village's befriending is out of reach (200 Influence, 5 a turn).
 */
export function village58() {
    const CAPITAL = { x: 4, y: 8 };
    const TOWN = { x: 10, y: 8 };
    const VILLAGE = { x: 13, y: 8 };
    const world = {
        width: 26, height: 16, wrapX: false,
        tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: [CAPITAL, TOWN].some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) <= 2) ? 0 : -1 }),
        players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 9, isIndependent: true, name: "Kermans" }],
        cities: [{ owner: 0, ...CAPITAL, name: "Тханглонг", pop: 8, prod: 10 }, { owner: 0, ...TOWN, name: "Дыонглам", pop: 4, prod: 5 }],
        units: [],
    };
    const start = ({ fake, units, steps }, options = {}) => {
        units.resetUnitGoals();
        steps.resetWar();
        fake.sent.length = 0;
        for (const k of ["enemies", "wars", "armies", "combat", "rangeTargets", "commandRadius", "unitCommandResult", "unitCanStart"]) delete world[k];
        world.units = [
            { id: 1, type: "UNIT_WARRIOR", ...CAPITAL },
            { id: 2, type: "UNIT_SPEARMAN", ...TOWN },
            { id: 3, type: "UNIT_SPEARMAN", x: 9, y: 8 },
            { id: 4, type: "UNIT_ARCHER", x: 9, y: 9 },
            { id: 5, type: "UNIT_ARCHER", x: 5, y: 8 },
            { id: 6, type: "UNIT_WARRIOR", x: 5, y: 9 },
            { id: 50, type: "UNIT_ARMY_COMMANDER", ...CAPITAL },
            { id: 51, type: "UNIT_ARMY_COMMANDER", ...TOWN },
        ];
        world.enemies = [
            { id: 900, owner: 9, type: "UNIT_ARCHER", ...VILLAGE },
            { id: 901, owner: 9, type: "UNIT_SPEARMAN", x: 13, y: 9 },
            { id: 902, owner: 9, type: "UNIT_WARRIOR", x: 14, y: 8 },
        ];
        world.villages = [{ owner: 9, ...VILLAGE }];
        Object.assign(world, { befriend: { 9: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } } });
        return createFightSim(world, fake, {
            village: { ...VILLAGE, owner: 9, spawn: ["UNIT_WARRIOR", "UNIT_ARCHER", "UNIT_SPEARMAN"], every: 4, max: 4, leash: 2 },
            ours: [CAPITAL, TOWN], random: !!options.random, seed: options.seed ?? 1,
        });
    };
    return { world, start, CAPITAL, TOWN, VILLAGE };
}

/**
 * A game's turns as a scene (tools/unitmap.mjs scene=<file>: game 60's logs and later): our units and the hostile ones near
 * our settlements at the window's first turn, by id, tile and damage, the commanders' level and XP, packed soldiers, the
 * villages of the hostile owners with their measured spawn cadence, and the game's level thresholds. Terrain is not logged:
 * every tile is flat land, ours within 3 of a city and 1 of a town; ships are left out by the tool (the simulator has no
 * water). A village we had not seen (`seen: false`) stands on a hidden tile. A unit type this age's game data does not know
 * fights as a Warrior.
 * @param data the scene's JSON @returns { world, start, data } like village58's
 */
export function replayScene(data) {
    const grid = new HexGrid(data.map.width, data.map.height, data.map.wrapX ?? true);
    const towns = data.settlements ?? [];
    const ours = (x, y) => towns.some((c) => grid.distanceXY(c.x, c.y, x, y) <= (c.town ? 1 : 3));
    const owners = data.owners ?? [];
    const hidden = new Set((data.villages ?? []).filter((v) => v.seen === false).map((v) => `${v.x},${v.y}`));
    const world = {
        width: data.map.width, height: data.map.height, wrapX: data.map.wrapX ?? true,
        tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: ours(x, y) ? 0 : -1, ...(hidden.has(`${x},${y}`) ? { revealed: false } : {}) }),
        players: [{ id: 0 }, ...owners.map((o) => ({ id: o.id, isIndependent: o.independent !== false, name: `P${o.id}` }))],
        cities: towns.map((c, i) => ({ owner: 0, x: c.x, y: c.y, name: c.name || `S${i + 1}`, isTown: !!c.town, pop: c.town ? 4 : 8, prod: 10 })),
        units: [],
    };
    const ARMY = 1000000; // a commander's army id: ARMY + its id (its packed soldiers carry it too)
    const start = ({ fake, units, steps }, options = {}) => {
        units.resetUnitGoals();
        steps.resetWar();
        fake.sent.length = 0;
        for (const k of ["enemies", "wars", "armies", "combat", "rangeTargets", "commandRadius", "unitCommandResult", "unitCanStart"]) delete world[k];
        const known = (t) => (GameInfo.Units.lookup(t) ? t : "UNIT_WARRIOR");
        const isCommander = (t) => /_COMMANDER$/.test(t);
        // The damage read is after the turn's heals: no heal on the first turn (`acted`).
        world.units = [
            ...data.ours.map((u) => ({ id: u.id, type: known(u.type), x: u.x, y: u.y, damage: u.damage ?? 0, acted: true, ...(isCommander(u.type) ? { army: ARMY + u.id, ...(u.xp ? { xp: { ...u.xp } } : {}) } : {}) })),
            ...(data.packed ?? []).filter((m) => data.ours.some((c) => c.id === m.cmdr)).map((m) => ({ id: m.id, type: known(m.type), x: -9999, y: -9999, onMap: false, army: ARMY + m.cmdr, damage: m.damage ?? 0, acted: true })),
        ];
        world.enemies = (data.theirs ?? []).map((e) => ({ id: e.id, owner: e.owner, type: known(e.type), x: e.x, y: e.y, damage: e.damage ?? 0, raid: !!e.raid, acted: true }));
        world.villages = (data.villages ?? []).map((v) => ({ owner: v.owner, x: v.x, y: v.y }));
        world.wars = owners.filter((o) => o.independent === false).map((o) => o.id);
        // Befriending is out of reach (the hunts and skirmishes decide by it).
        world.befriend = Object.fromEntries(owners.filter((o) => o.independent !== false).map((o) => [o.id, { status: -3, cost: 999 }]));
        Object.assign(world, { influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 0 } } });
        Game.turn = data.from - 1;
        return createFightSim(world, fake, {
            villages: (data.villages ?? []).map((v) => ({ ...v, spawn: (v.spawn ?? ["UNIT_WARRIOR"]).map(known) })),
            levels: data.levels, ours: towns, random: !!options.random, seed: options.seed ?? 1,
        });
    };
    return { world, start, data };
}

// Standard speed's levels (game 60's `xp:` lines: 15, 30, 45, 60; Online's are half).
const STANDARD_LEVELS = [15, 30, 45, 60, 75, 90, 105];

/**
 * Game 60 (Catherine, Antiquity at Standard speed; research/game60): raids on several settlements from far villages. Our capital
 * and three towns, one general (the vanguard, at the capital, as game 60's only one) and nine soldiers; Цзэши's village 9-10
 * tiles south-west of Тула and Вьядхапура's 9-10 tiles east of Нижний Новгород send raiders (Warriors, Archers, Spearmen; two
 * at a time each) that walk to our nearest settlement; neither may be befriended (200 Influence, 5 a turn) nor hunted (beyond
 * HUNT.REACH 8).
 * Game 60's general saw 32% of our fights in its radius and made about 0.8 XP a turn.
 */
export function raids60() {
    const CAPITAL = { x: 6, y: 10 };
    const TULA = { x: 10, y: 15 };
    const SAMARA = { x: 12, y: 5 };
    const NIZHNY = { x: 16, y: 10 };
    const TSZESHI = { x: 2, y: 20 };
    const VYADHAPURA = { x: 26, y: 12 };
    const towns = [CAPITAL, TULA, SAMARA, NIZHNY];
    const world = {
        width: 32, height: 24, wrapX: false,
        tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: towns.some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) <= 2) ? 0 : -1 }),
        players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 8, isIndependent: true, name: "Tszeshi" }, { id: 9, isIndependent: true, name: "Vyadhapura" }],
        cities: [
            { owner: 0, ...CAPITAL, name: "Санкт-Петербург", pop: 8, prod: 10 }, { owner: 0, ...TULA, name: "Тула", pop: 4, prod: 5 },
            { owner: 0, ...SAMARA, name: "Самара", pop: 4, prod: 5 }, { owner: 0, ...NIZHNY, name: "Нижний Новгород", pop: 4, prod: 5 },
        ],
        units: [],
    };
    const start = ({ fake, units, steps }, options = {}) => {
        units.resetUnitGoals();
        steps.resetWar();
        fake.sent.length = 0;
        for (const k of ["enemies", "wars", "armies", "combat", "rangeTargets", "commandRadius", "unitCommandResult", "unitCanStart"]) delete world[k];
        world.units = [
            { id: 1, type: "UNIT_WARRIOR", ...CAPITAL }, { id: 2, type: "UNIT_SLINGER", x: 7, y: 10 },
            { id: 3, type: "UNIT_WARRIOR", ...TULA }, { id: 4, type: "UNIT_SLINGER", x: 11, y: 15 },
            { id: 5, type: "UNIT_WARRIOR", ...SAMARA }, { id: 6, type: "UNIT_SPEARMAN", ...NIZHNY }, { id: 9, type: "UNIT_WARRIOR", x: 15, y: 10 },
            { id: 7, type: "UNIT_WARRIOR", x: 7, y: 11 }, { id: 8, type: "UNIT_WARRIOR", x: 5, y: 11 },
            { id: 50, type: "UNIT_ARMY_COMMANDER", ...CAPITAL },
        ];
        world.enemies = [
            { id: 900, owner: 8, type: "UNIT_WARRIOR", x: 5, y: 18 },
            { id: 910, owner: 9, type: "UNIT_SPEARMAN", x: 22, y: 11 },
        ];
        world.villages = [{ owner: 8, ...TSZESHI }, { owner: 9, ...VYADHAPURA }];
        Object.assign(world, { befriend: { 8: { status: -3, cost: 200 }, 9: { status: -3, cost: 200 } }, influence: 0, playerYields: { 0: { YIELD_DIPLOMACY: 5 } } });
        return createFightSim(world, fake, {
            villages: [
                { ...TSZESHI, owner: 8, spawn: ["UNIT_WARRIOR", "UNIT_ARCHER"], every: 4, max: 2, raid: true },
                { ...VYADHAPURA, owner: 9, spawn: ["UNIT_WARRIOR", "UNIT_SPEARMAN"], every: 5, max: 2, raid: true },
            ],
            ours: towns, random: !!options.random, seed: options.seed ?? 1, levels: STANDARD_LEVELS,
        });
    };
    return { world, start, CAPITAL, TULA, SAMARA, NIZHNY };
}

// The autopilot's UI.log lines are silenced during a run; those about hunts, raiders, generals, skirmishes, formations and
// the army go to `keep` when one is given.
const SIM_LINES = /\b(hunt|raiders|generals|skirmish|formation|army|defence):/;
async function quiet(fn, keep = null, turn = () => 0) {
    const saved = [console.warn, console.info, console.log];
    const take = (...a) => {
        const line = a.join(" ");
        if (keep && SIM_LINES.test(line)) keep.push(`T${turn()}   ${line.replace(/^\[XPL\]\s*(?:[A-Z]\d+\s+)?/, "").slice(0, 300)}`);
    };
    console.warn = take;
    console.info = take;
    console.log = take;
    try {
        return await fn();
    } finally {
        [console.warn, console.info, console.log] = saved;
    }
}

// Entry keys that only report; the rest go to the simulator's log as the autopilot's decisions.
const QUIET_KEYS = new Set(["THREAT", "WAR_RISK", "PROMOTED"]);

/**
 * Runs `turns` turns of a scene with the autopilot's unit steps. @param mods { fake, units, steps, settings }
 * @returns the simulator (its stats and log)
 */
export async function runScene(scene, mods, { turns = 20, random = false, seed = 1, log = false } = {}) {
    const base = Game.turn;
    const sim = scene.start(mods, { random, seed });
    const pass = async () => {
        const entries = await autopilotPass({ units: mods.units, steps: mods.steps, settings: mods.settings });
        const keys = entries.map((e) => e.key).filter((k) => !QUIET_KEYS.has(k));
        if (keys.length > 0) sim.stats.log.push(`T${Game.turn} autopilot: ${keys.join(", ")}`);
    };
    try {
        await quiet(async () => {
            for (let t = 0; t < turns; t++) await sim.turn(pass);
            // The XP lines read a moment after a fight (units.js XP_AFTER_MS) come before the console is back.
            await new Promise((r) => setTimeout(r, 300));
        }, log ? sim.stats.log : null, () => Game.turn);
    } finally {
        Game.turn = base;
    }
    return sim;
}
