// Game 60 (research: g60 review, scouts SC-5, SC-7, SCM-2): our units looked "scared of enemy scouts". No rule counts a scout
// (CORE_CLASS_RECON), but every danger and threat reader read MapUnits.getUnits through the fog: a scout fled nine times from
// the guard of a village whose tile was still hidden, while the player saw only an enemy scout next to it, and no log said what
// a unit fled from. Settlers in a garrisoned capital waited for a Quadrireme parked 2 tiles off on the water.
// Now hostile units count only when we see them (the plot tooltip's test), remembered LAST_SEEN_TURNS where last seen; each
// flight's UI.log line names its trigger; a settler minds a ship only where it reaches, and none on our held centre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const ATHENS = { x: 5, y: 8 };
const world = {
    width: 40, height: 20, wrapX: false,
    // Coast at x 0-3, 4,8 (Athens is on the shore) and 6,7 (an inlet by its way east): the galley's water; land elsewhere.
    // world.fog marks tiles out of sight (revealed, not visible).
    tiles: (x, y) => ({ terrain: x <= 3 || (x === 4 && y === 8) || (x === 6 && y === 7) ? "TERRAIN_COAST" : "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, visible: !world.fog?.(x, y) }),
    players: [{ id: 0 }, { id: 1 }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...ATHENS, name: "Athens", pop: 3, prod: 5 }],
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { LAST_SEEN_TURNS } = await import("../mod/expansion-planner/ui/data/xpl-seen-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const FLEE = new Set(["UNIT_AWAY", "WITHDRAW", "TO_WATER", "SETTLER_WAITS", "SETTLER_RETREAT", "SETTLER_DETOUR", "SETTLER_AWAY", "SETTLER_LEAVES"]);
const run = (options) => units.commandUnits(DEFAULT_SETTINGS, { explore: false, settlers: false, defend: false, merchants: false, ...options });
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const fresh = (list, extra = {}) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    for (const k of ["enemies", "wars", "fog", "unitCanStart", "villages"]) delete world[k];
    Object.assign(world, extra);
};
const lines = (fn) => {
    const out = [];
    const warn = console.warn;
    console.warn = (...a) => out.push(a.join(" "));
    try {
        return { r: fn(), out };
    } finally {
        console.warn = warn;
    }
};

test("an enemy scout (no Combat, CORE_CLASS_RECON) next to our settler, scout, hurt soldier and city: no flight, no wait, no threat (pinning)", () => {
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 8, rank: 1 }] } } });
    try {
        fresh([
            { id: 1, type: "UNIT_SETTLER", ...ATHENS },
            { id: 2, type: "UNIT_SCOUT", x: 9, y: 13 },
            { id: 3, type: "UNIT_WARRIOR", x: 14, y: 14, damage: 40 },
        ], {
            wars: [1],
            enemies: [
                { x: 6, y: 8, owner: 1, type: "UNIT_SCOUT" },
                { x: 10, y: 13, owner: 1, type: "UNIT_SCOUT" },
                { x: 15, y: 14, owner: 1, type: "UNIT_SCOUT" },
            ],
        });
        const r = run({ explore: true, settlers: true, defend: true });
        assert.deepEqual(r.entries.filter((e) => FLEE.has(e.key)), [], JSON.stringify(r.entries));
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [12, 8], "the settler goes for its site");
        assert.ok(fake.sent.some((s) => s.id?.id === 2 && s.op === "UNITOPERATION_AUTOMATE_EXPLORE"), "the scout explores with the game's help");
        assert.deepEqual(units.threatenedSettlements(), [], "no threat to Athens");
    } finally {
        state.set({ results: { ...state.get().results, sites: { picks: [] } } });
    }
});

test("a Warrior in the fog (its tile out of sight, or the unit hidden) is no danger to our scout and no threat; one in sight is", () => {
    const scout = { id: 2, type: "UNIT_SCOUT", x: 12, y: 8 };
    const warrior = { x: 13, y: 8, owner: 1, type: "UNIT_WARRIOR" };
    // The game's plot tooltip: tile VISIBLE and Visibility.isVisible. Its tile out of sight:
    fresh([{ ...scout }], { wars: [1], enemies: [{ ...warrior }], fog: (x, y) => x === 13 && y === 8 });
    let r = run({ explore: true });
    assert.ok(!r.entries.some((e) => e.key === "UNIT_AWAY"), `in the fog: ${JSON.stringify(r.entries)}`);
    // The unit itself not visible to us (its tile in sight):
    fresh([{ ...scout }], { wars: [1], enemies: [{ ...warrior, seen: false }] });
    r = run({ explore: true });
    assert.ok(!r.entries.some((e) => e.key === "UNIT_AWAY"), `hidden: ${JSON.stringify(r.entries)}`);
    // Next to Athens in the fog: no threat.
    fresh([], { wars: [1], enemies: [{ ...warrior, x: 6, y: 8 }], fog: (x, y) => x === 6 && y === 8 });
    assert.deepEqual(units.threatenedSettlements(), [], "a raider nobody sees");
    // In sight: the scout steps away, Athens is threatened.
    fresh([{ ...scout }], { wars: [1], enemies: [{ ...warrior }] });
    r = run({ explore: true });
    assert.equal(r.entries[0]?.key, "UNIT_AWAY", JSON.stringify(r.entries));
    fresh([], { wars: [1], enemies: [{ ...warrior, x: 6, y: 8 }] });
    assert.deepEqual(units.threatenedSettlements().map((t) => t.settlement.name), ["Athens"]);
});

test(`a raider seen and then lost in the fog is remembered where it was last seen for ${LAST_SEEN_TURNS} turns, then forgotten`, () => {
    const turn = Game.turn;
    try {
        fresh([], { wars: [1], enemies: [{ x: 6, y: 8, owner: 1, type: "UNIT_WARRIOR", id: 77 }] });
        Game.turn = 30;
        assert.deepEqual(units.threatenedSettlements().map((t) => t.settlement.name), ["Athens"], "seen next to Athens");
        // It steps into a forest out of sight, 3 tiles off.
        world.enemies = [{ x: 9, y: 8, owner: 1, type: "UNIT_WARRIOR", id: 77 }];
        world.fog = (x, y) => x === 9 && y === 8;
        Game.turn = 31;
        assert.deepEqual(units.threatenedSettlements().map((t) => [t.settlement.name, t.close]), [["Athens", 1]], "remembered at 6,8");
        Game.turn = 30 + LAST_SEEN_TURNS;
        assert.equal(units.threatenedSettlements().length, 1, "still remembered");
        Game.turn = 31 + LAST_SEEN_TURNS;
        assert.deepEqual(units.threatenedSettlements(), [], "forgotten");
        // Seen again, where it stands now: 3 tiles off, alone, and Athens has no guard: a strong lone raider (gotcha 61).
        delete world.fog;
        const t = units.threatenedSettlements();
        assert.equal(t.length, 1);
        assert.equal(t[0].close, 0, "counted where it stands, not where it was");
    } finally {
        Game.turn = turn;
    }
});

test("a flight's UI.log line names what the unit fled from: type, owner, distance, land or ship, seen or remembered", () => {
    fresh([{ id: 2, type: "UNIT_SCOUT", x: 12, y: 8 }], { wars: [1], enemies: [{ x: 13, y: 8, owner: 9, type: "UNIT_WARRIOR" }, { x: 15, y: 8, owner: 1, type: "UNIT_SCOUT" }] });
    world.indepRelation = { 9: IndependentRelationship.HOSTILE };
    try {
        const { r, out } = lines(() => run({ explore: true }));
        assert.equal(r.entries[0]?.key, "UNIT_AWAY", JSON.stringify(r.entries));
        const flee = out.find((l) => l.includes("flee: UNIT_SCOUT at 12,8 UNIT_AWAY"));
        assert.ok(flee, out.join("\n"));
        assert.match(flee, /from \[UNIT_WARRIOR of independent 9 at 1 \(land, seen\)\]/);
        assert.ok(!/UNIT_SCOUT of/.test(flee), "the enemy scout is no trigger");
        // The next turn it is out of sight: the scout (back on 12,8) still steps away from where it was last seen.
        Game.turn += 1;
        fake.sent.length = 0;
        world.units = [{ id: 2, type: "UNIT_SCOUT", x: 12, y: 8 }];
        world.enemies = [{ x: 14, y: 9, owner: 9, type: "UNIT_WARRIOR" }];
        world.fog = (x, y) => x === 14 && y === 9;
        const next = lines(() => run({ explore: true }));
        assert.equal(next.r.entries[0]?.key, "UNIT_AWAY", JSON.stringify(next.r.entries));
        assert.match(next.out.find((l) => l.includes("flee: UNIT_SCOUT")) ?? "", new RegExp(`UNIT_WARRIOR of independent 9 at 1 \\(land, seen T${Game.turn - 1}\\)`));
    } finally {
        Game.turn -= 1;
        delete world.indepRelation;
    }
});

test("a settler in our garrisoned, undamaged centre leaves for a site out of a galley's reach instead of waiting for it (game 60: St Petersburg, T81-T82)", () => {
    state.set({ results: { ...state.get().results, sites: { picks: [{ x: 12, y: 8, rank: 1 }] } } });
    try {
        // The galley 2 tiles off on the water (3,8): its next turn reaches Athens on the shore (held by a warrior), and 6,8 by the
        // inlet, 3 tiles off; the way east from 6,8 on is out of its reach. Not in danger in its held centre, the settler goes
        // straight for its site (in danger it would only leave by a way 3 tiles clear of the galley's reach, around it).
        fresh([{ id: 1, type: "UNIT_SETTLER", ...ATHENS }, { id: 3, type: "UNIT_WARRIOR", ...ATHENS }], { wars: [1], enemies: [{ x: 3, y: 8, owner: 1, type: "UNIT_GALLEY" }] });
        const r = run({ settlers: true });
        const e = r.entries.find((x) => x.args?.[0] === "LOC_UNIT_SETTLER_NAME");
        assert.ok(e && (e.key === "SETTLE_MOVE" || e.key === "SETTLER_LEAVES"), JSON.stringify(r.entries));
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [12, 8]);
        // Out in the open on the shore (water next to it), the galley's next turn reaches it: it gets away.
        fresh([{ id: 1, type: "UNIT_SETTLER", x: 4, y: 12 }], { wars: [1], enemies: [{ x: 2, y: 12, owner: 1, type: "UNIT_GALLEY" }] });
        const r2 = run({ settlers: true });
        assert.ok(r2.entries.some((x) => FLEE.has(x.key)), `the shore is in its reach: ${JSON.stringify(r2.entries)}`);
        // A site 3 tiles from a galley but with no water next to it is out of its reach (Range 1: it must come alongside): safe.
        state.set({ results: { ...state.get().results, sites: { picks: [{ x: 5, y: 15, rank: 1 }] } } });
        fresh([{ id: 1, type: "UNIT_SETTLER", x: 8, y: 15 }], { wars: [1], enemies: [{ x: 2, y: 15, owner: 1, type: "UNIT_GALLEY" }] });
        const r3 = run({ settlers: true });
        assert.deepEqual([moveOf(1)?.X, moveOf(1)?.Y], [5, 15], `out of its reach: ${JSON.stringify(r3.entries)}`);
    } finally {
        state.set({ results: { ...state.get().results, sites: { picks: [] } } });
    }
});
