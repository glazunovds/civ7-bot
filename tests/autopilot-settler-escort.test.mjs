// Game 60 (economy E5): settlers wandered 10-28 turns each around independents' raiders (77 settler-turns from done to
// founded) while 2-6 free soldiers stood idle. Now a settler whose only sites are unsafe because of independents' land soldiers
// walks there with a free soldier as strong as the strongest raider near its way (less 5): the soldier comes to it first, then
// both go to the settler's stop each turn, and on the site the settler founds at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 8 };
const SITE = { x: 11, y: 8 };
const world = {
    width: 40, height: 20, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 } }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 9, isIndependent: true, name: "Nubians" }],
    cities: [{ owner: 0, ...HOME, name: "Home", pop: 4, prod: 5 }],
};
const CITIES = world.cities;
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const picks = (list) => state.set({ results: { ...state.get().results, sites: { picks: list } } });
picks([{ ...SITE, rank: 1 }]);
const run = (options = {}) => units.commandUnits(DEFAULT_SETTINGS, { settlers: true, defend: true, ...options });
const moveOf = (id) => fake.sent.find((s) => s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO)?.args;
const at = (m) => (m ? { x: m.X, y: m.Y } : null);
const fresh = (list, enemies) => {
    units.resetUnitGoals();
    fake.sent.length = 0;
    world.units = list;
    world.enemies = enemies;
    for (const k of ["settlementCap", "wars", "relations"]) delete world[k];
    world.cities = CITIES;
    picks([{ ...SITE, rank: 1 }]);
};
const escorted = (r) => r.entries.some((x) => x.key === "SETTLER_ESCORTED" || x.key === "SETTLER_ESCORT_COMING");
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
// An independent's Warrior 2 tiles from the site: the site is DANGER, its way unsafe.
const raider = (type = "UNIT_WARRIOR") => [{ x: 13, y: 8, owner: 9, type, id: 900 }];

test("a settler whose site an independent's warrior keeps unsafe walks there with a free spearman, stop by stop, and founds on arrival", () => {
    const turn = Game.turn;
    try {
        Game.turn = 62;
        fresh([
            { id: 1, type: "UNIT_SETTLER", ...HOME },
            { id: 2, type: "UNIT_WARRIOR", ...HOME }, // the garrison stays
            { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 },
        ], raider());
        const { r, out } = lines(run);
        const e = r.entries.find((x) => x.key === "SETTLER_ESCORTED");
        assert.ok(e, JSON.stringify(r.entries));
        const stop = at(moveOf(1));
        assert.ok(stop && stop.x > HOME.x, `toward the site: ${JSON.stringify(stop)}`);
        assert.deepEqual(at(moveOf(3)), stop, "the escort to the settler's stop");
        assert.equal(moveOf(2), undefined, "the garrison stays");
        assert.ok(out.some((l) => l.includes("settler: UNIT_SETTLER") && l.includes("escorted by UNIT_SPEARMAN") && l.includes("escorted 1 turn(s)")), out.join("\n"));
        // The next turns, together, to the site; there it founds right after (foundArrivals).
        let here = stop;
        for (let t = 1; t <= 3 && !(here.x === SITE.x && here.y === SITE.y); t++) {
            Game.turn += 1;
            fake.sent.length = 0;
            world.units = [{ id: 1, type: "UNIT_SETTLER", ...here }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", ...here }];
            const step = run();
            assert.ok(step.entries.some((x) => x.key === "SETTLER_ESCORTED"), JSON.stringify(step.entries));
            here = at(moveOf(1));
            assert.deepEqual(at(moveOf(3)), here);
        }
        assert.deepEqual(here, SITE, "on the site");
        world.units = [{ id: 1, type: "UNIT_SETTLER", ...SITE }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", ...SITE }];
        const founded = units.foundArrivals();
        assert.deepEqual(founded.map((x) => x.key), ["SETTLE_FOUND"]);
    } finally {
        Game.turn = turn;
    }
});

test("the escort comes to the settler first while it waits; none too weak for the raider, and the garrison stays", () => {
    const turn = Game.turn;
    try {
        Game.turn = 70;
        // Three tiles off: it comes; the settler waits for it.
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 5, y: 11 }], raider());
        let r = run();
        assert.ok(r.entries.some((x) => x.key === "SETTLER_ESCORT_COMING"), JSON.stringify(r.entries));
        const spot = at(moveOf(3));
        assert.ok(spot && GameplayMap.getPlotDistance(spot.x, spot.y, HOME.x, HOME.y) <= 1, "on or next to the settler");
        assert.equal(moveOf(1), undefined, "the settler waits");
        // A Horseman (35) near the site: a Warrior (20) is too weak to escort.
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_WARRIOR", x: 6, y: 8 }], raider("UNIT_HORSEMAN"));
        r = run();
        assert.ok(!r.entries.some((x) => x.key === "SETTLER_ESCORTED" || x.key === "SETTLER_ESCORT_COMING"), JSON.stringify(r.entries));
        // Only the garrison: no escort.
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }], raider());
        r = run();
        assert.ok(!r.entries.some((x) => x.key === "SETTLER_ESCORTED" || x.key === "SETTLER_ESCORT_COMING"), JSON.stringify(r.entries));
        // A safe site: it goes alone.
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], []);
        r = run();
        assert.ok(r.entries.some((x) => x.key === "SETTLE_MOVE") && !r.entries.some((x) => x.key === "SETTLER_ESCORTED"), JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

// Walks the escorted settler (1) and its escort (3) to the site, turn by turn: the settler's tile at the end.
const walkToSite = (from) => {
    let here = from;
    for (let t = 1; t <= 4 && here && !(here.x === SITE.x && here.y === SITE.y); t++) {
        Game.turn += 1;
        fake.sent.length = 0;
        world.units = [{ id: 1, type: "UNIT_SETTLER", ...here }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", ...here }];
        run();
        here = at(moveOf(1)) ?? here;
    }
    return here;
};

test("at the settlement cap an escorted settler does not found on arrival: it waits on its site (SETTLER_AT_CAP), as every settler does", () => {
    const turn = Game.turn;
    try {
        Game.turn = 62;
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], raider());
        world.settlementCap = 1; // Home alone fills it
        assert.ok(run().entries.some((x) => x.key === "SETTLER_ESCORTED"));
        const here = walkToSite(at(moveOf(1)));
        assert.deepEqual(here, SITE, "on the site");
        world.units = [{ id: 1, type: "UNIT_SETTLER", ...SITE }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", ...SITE }];
        assert.deepEqual(units.foundArrivals(), [], "no founding past the cap");
        Game.turn += 1;
        fake.sent.length = 0;
        const r = run();
        assert.ok(r.entries.some((x) => x.key === "SETTLER_AT_CAP"), JSON.stringify(r.entries));
        assert.ok(!fake.sent.some((s) => s.op === "UNITOPERATION_FOUND_CITY"), "nothing founded");
    } finally {
        Game.turn = turn;
    }
});

test("an escort's soldier is free again when no escort runs («Поселенцы» off) or when a settlement of ours lacks guards", () => {
    const turn = Game.turn;
    try {
        // A second settlement 8 tiles south; the escort comes from 5,11.
        const second = { owner: 0, x: 5, y: 16, name: "Second", pop: 4, prod: 5 };
        const start = () => {
            Game.turn = 62;
            fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 4, type: "UNIT_WARRIOR", x: 5, y: 16 }, { id: 3, type: "UNIT_SPEARMAN", x: 5, y: 11 }], raider());
            world.cities = [...CITIES, second];
            const r = run({ threats: units.threatenedSettlements() });
            assert.ok(r.entries.some((x) => x.key === "SETTLER_ESCORT_COMING"), JSON.stringify(r.entries));
            // The next turn Rome's two Warriors stand at Second, at war with us; the spearman has come to 5,10.
            Game.turn = 63;
            fake.sent.length = 0;
            world.wars = [1];
            world.enemies = [...raider(), { x: 7, y: 16, owner: 1, type: "UNIT_WARRIOR", id: 901 }, { x: 7, y: 17, owner: 1, type: "UNIT_WARRIOR", id: 902 }];
            world.units = [{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 4, type: "UNIT_WARRIOR", x: 5, y: 16 }, { id: 3, type: "UNIT_SPEARMAN", x: 5, y: 10 }];
        };
        // «Поселенцы» off: the spearman goes to Second at once.
        start();
        let r = run({ settlers: false, threats: units.threatenedSettlements() });
        assert.ok(r.entries.some((x) => x.key === "REINFORCE" && x.args[1] === "Second"), JSON.stringify(r.entries));
        // On: the escort ends that pass (Second lacks a guard) and the defence takes the spearman the next.
        start();
        const { r: r2, out } = lines(() => run({ threats: units.threatenedSettlements() }));
        assert.ok(!escorted(r2), JSON.stringify(r2.entries));
        assert.ok(out.some((l) => l.includes("its escort leaves (a settlement of ours needs its soldiers)")), out.join("\n"));
        fake.sent.length = 0;
        r = run({ threats: units.threatenedSettlements() });
        assert.ok(r.entries.some((x) => x.key === "REINFORCE" && x.args[1] === "Second"), JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

test("a relaxed pick stays relaxed under escort: the strict distance to a foreign city does not end the plan on the next pass", () => {
    const turn = Game.turn;
    try {
        Game.turn = 80;
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], raider());
        // Rome's city 4 tiles from the site: too close by the strict rules (5), not by the relaxed ones (4).
        world.cities = [...CITIES, { owner: 1, x: 11, y: 12, name: "Rome", pop: 4, prod: 5 }];
        picks([{ ...SITE, rank: 1, relaxed: true }]);
        let r = run();
        assert.ok(r.entries.some((x) => x.key === "SETTLER_ESCORTED"), JSON.stringify(r.entries));
        const stop = at(moveOf(1));
        Game.turn += 1;
        fake.sent.length = 0;
        world.units = [{ id: 1, type: "UNIT_SETTLER", ...stop }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", ...stop }];
        r = run();
        assert.ok(r.entries.some((x) => x.key === "SETTLER_ESCORTED"), JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

test("below 3 settlements no escort makes a 6-turn site near (the settler's own limit, 4 turns); with 3 it goes", () => {
    const turn = Game.turn;
    try {
        Game.turn = 90;
        const far = { x: 17, y: 8 }; // 12 tiles: 6 turns
        const setup = () => {
            fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], [{ x: 19, y: 8, owner: 9, type: "UNIT_WARRIOR", id: 900 }]);
            picks([{ ...far, rank: 1 }]);
        };
        setup();
        assert.ok(!escorted(run()), "one settlement: none");
        setup();
        world.cities = [...CITIES, { owner: 0, x: 5, y: 2, name: "North", pop: 2, prod: 2 }, { owner: 0, x: 5, y: 16, name: "South", pop: 2, prod: 2 }];
        const r = run();
        assert.ok(r.entries.some((x) => x.key === "SETTLER_ESCORTED"), JSON.stringify(r.entries));
    } finally {
        Game.turn = turn;
    }
});

test("no escort walks past a Hostile war risk's soldier near the way (it is no independent's raider)", () => {
    const turn = Game.turn;
    try {
        Game.turn = 100;
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }],
            [...raider(), { x: 9, y: 11, owner: 1, type: "UNIT_WARRIOR", id: 910 }]);
        world.relations = { 1: "HOSTILE" };
        assert.ok(!escorted(run({ riskOwners: [1] })), "Rome's soldier 3 from the way");
        // Not a war risk: its soldier is nobody's danger, and the escort goes.
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }],
            [...raider(), { x: 9, y: 11, owner: 1, type: "UNIT_WARRIOR", id: 910 }]);
        assert.ok(run().entries.some((x) => x.key === "SETTLER_ESCORTED"));
    } finally {
        Game.turn = turn;
    }
});

test("the escort is a free melee soldier: not one the defence posts, not a ranged one, not one at a war front, not one the player rests", () => {
    const turn = Game.turn;
    try {
        Game.turn = 110;
        const settler = { id: 1, type: "UNIT_SETTLER", ...HOME };
        const garrison = { id: 2, type: "UNIT_WARRIOR", ...HOME };
        const second = { owner: 0, x: 5, y: 16, name: "Second", pop: 4, prod: 5 };
        // Posted: Second, 8 tiles south, has an independent's Warrior next to it and no guard; the two spearmen at 5,11 and
        // 4,11 are sent there. A third at 6,8 is free: it escorts.
        const posted = [{ id: 3, type: "UNIT_SPEARMAN", x: 5, y: 11 }, { id: 5, type: "UNIT_SPEARMAN", x: 4, y: 11 }];
        fresh([settler, garrison, ...posted], [...raider(), { x: 6, y: 17, owner: 9, type: "UNIT_WARRIOR", id: 920 }]);
        world.cities = [...CITIES, second];
        let r = run({ threats: units.threatenedSettlements() });
        assert.ok(!escorted(r), `posted: ${JSON.stringify(r.entries)}`);
        assert.equal(r.entries.filter((x) => x.key === "REINFORCE" && x.args[1] === "Second").length, 2, JSON.stringify(r.entries));
        fresh([settler, garrison, ...posted, { id: 6, type: "UNIT_SPEARMAN", x: 6, y: 8 }], [...raider(), { x: 6, y: 17, owner: 9, type: "UNIT_WARRIOR", id: 920 }]);
        world.cities = [...CITIES, second];
        r = run({ threats: units.threatenedSettlements() });
        assert.ok(r.entries.some((x) => x.key === "SETTLER_ESCORTED"), JSON.stringify(r.entries));
        assert.deepEqual(at(moveOf(6)), at(moveOf(1)), "the free one escorts");
        // Ranged: an Archer next to the settler (a Slinger near the site: its Combat would do).
        fresh([settler, garrison, { id: 3, type: "UNIT_ARCHER", x: 6, y: 8 }], raider("UNIT_SLINGER"));
        assert.ok(!escorted(run()), "an Archer");
        // At a war front (Home): the spearman stays for it.
        fresh([settler, garrison, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], raider());
        r = run({ fronts: [{ settlement: { ...HOME, name: "Home" }, owners: [1] }] });
        assert.ok(!escorted(r), `front: ${JSON.stringify(r.entries)}`);
        // Asleep by the player's hand (not ours): left alone.
        fresh([settler, garrison, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8, activity: UnitActivityTypes.SLEEP }], raider());
        assert.ok(!escorted(run()), "the player's sleeping spearman");
    } finally {
        Game.turn = turn;
    }
});

test("a settler whose own goal is still safe keeps it: no escort to another, dangerous site", () => {
    const turn = Game.turn;
    try {
        Game.turn = 120;
        const safeSite = { x: 5, y: 13 };
        fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], raider());
        picks([{ ...safeSite, rank: 2 }]);
        let r = run();
        assert.deepEqual(at(moveOf(1)), safeSite, JSON.stringify(r.entries));
        // The game stopped it at home; the dangerous site is the better one now.
        Game.turn += 1;
        fake.sent.length = 0;
        picks([{ ...SITE, rank: 1 }, { ...safeSite, rank: 2 }]);
        r = run();
        assert.ok(!escorted(r), JSON.stringify(r.entries));
        assert.deepEqual(at(moveOf(1)), safeSite);
    } finally {
        Game.turn = turn;
    }
});

test("the settlers' site search runs once a pass: the escort's answer is settle()'s (no second search)", () => {
    const turn = Game.turn;
    const getPathTo = Units.getPathTo;
    try {
        Game.turn = 130;
        let calls = 0;
        Units.getPathTo = (id, l) => {
            if (id?.id === 1) calls++;
            return getPathTo(id, l);
        };
        const count = (options) => {
            fresh([{ id: 1, type: "UNIT_SETTLER", ...HOME }, { id: 2, type: "UNIT_WARRIOR", ...HOME }, { id: 3, type: "UNIT_SPEARMAN", x: 6, y: 8 }], []);
            picks([{ ...SITE, rank: 1 }, { x: 5, y: 13, rank: 2 }, { x: 9, y: 4, rank: 3 }]);
            calls = 0;
            const r = run(options);
            assert.ok(r.entries.some((x) => x.key === "SETTLE_MOVE"), JSON.stringify(r.entries));
            return calls;
        };
        const alone = count({ defend: false });
        assert.equal(count({ defend: true }), alone, "with the escorts asking too");
    } finally {
        Units.getPathTo = getPathTo;
        Game.turn = turn;
    }
});
