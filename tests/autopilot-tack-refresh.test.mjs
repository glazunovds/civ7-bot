// Game 60's review, E7: every tack request makes Detailed Map Tacks redraw and log ~100 lines per tack on the map, and the
// autopilot replaced the plan's tacks after every recalculation (the plan's order moves a little each time): 33 MB of UI.log in
// 30 minutes of Exploration. While it plays unattended, the plan's tacks are renewed at most every 5 turns (or when the player
// opens the Buildings tab or recalculates there); in between only a settlement none of whose planned buildings has a tack gets
// its first one. A tack whose building is in that city's queue is never removed (DMT removes it when the building is done).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine, installFakeDmt } from "./fakes/fake-engine.mjs";

const R = { x: 10, y: 8 };
const O = { x: 20, y: 8 };
const near = (c) => (x, y) => Math.abs(x - c.x) <= 2 && Math.abs(y - c.y) <= 2;
const rome = { owner: 0, x: R.x, y: R.y, name: "Rome", pop: 6, prod: 12 };
const ostia = { owner: 0, x: O.x, y: O.y, name: "Ostia", pop: 5, prod: 10 };
installFakeEngine({
    width: 32, height: 18, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: near(R)(x, y) || near(O)(x, y) ? 0 : -1 }),
    structures: (x, y) => ([R, O].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [rome, ostia],
    // The cities' own ids, as the game's owning-city answer matches them (the fake's city ids carry no type).
    owningCity: (x, y) => (near(R)(x, y) ? { owner: 0, id: 0 } : near(O)(x, y) ? { owner: 0, id: 1 } : null),
});
const dmt = installFakeDmt();
const bridge = await import("../mod/expansion-planner/ui/integrations/xpl-dmt-bridge.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
bridge.initDmtBridge();
await new Promise((resolve) => bridge.onDmtReady(resolve));

const requests = [];
const trigger = engine.trigger;
engine.trigger = (name, data) => {
    if (name === "AddMapTackRequest" || name === "RemoveMapTackRequest") requests.push(`${name === "AddMapTackRequest" ? "+" : "-"}${data.type}@${data.x},${data.y}`);
    return trigger(name, data);
};
const idx = (x, y) => GameplayMap.getIndexFromXY(x, y);
const P = (sid, x, y, type) => ({ sid, x, y, type });
const ROME = [P("r", 11, 8, "BUILDING_MONUMENT"), P("r", 9, 8, "BUILDING_LIBRARY"), P("r", 10, 9, "BUILDING_GRANARY")];
const OSTIA = [P("o", 21, 8, "BUILDING_MONUMENT"), P("o", 19, 8, "BUILDING_LIBRARY"), P("o", 20, 9, "BUILDING_GRANARY")];
const rotate = (list, n) => list.map((_p, i) => list[(i + n) % list.length]);
const plan = (placements) => ({ centres: [idx(R.x, R.y), idx(O.x, O.y)], placements, fillers: [], anchors: [], keptTacks: [] });
const UNATTENDED = { tacks: true, endTurn: true }; // 1 tack a settlement
const typesAt = (x, y) => dmt.read(x, y).map((t) => t.type);

test("unattended: renewed on the first pass and every 5 turns, nothing in between while each settlement keeps a tack", async () => {
    autopilot.resetTackRefresh();
    const perTurn = [];
    for (let n = 0; n < 10; n++) {
        Game.turn = 20 + n;
        requests.length = 0;
        // The plan's order moves every recalculation.
        await autopilot.refreshPlanTacks(plan([...rotate(ROME, n), ...rotate(OSTIA, n)]), UNATTENDED, { unattended: true });
        perTurn.push(requests.length);
    }
    assert.deepEqual(perTurn, [2, 0, 0, 0, 0, 4, 0, 0, 0, 0], "one tack each, then renewed at turn 25 (old one out, the first one in)");
    // The player opens the Buildings tab: the next pass renews them.
    autopilot.askTackRefresh();
    Game.turn = 30;
    requests.length = 0;
    await autopilot.refreshPlanTacks(plan([...rotate(ROME, 1), ...rotate(OSTIA, 1)]), UNATTENDED, { unattended: true });
    assert.equal(requests.length, 4, JSON.stringify(requests));
    // While the player watches (the autopilot does not end turns), every recalculation renews them as before.
    Game.turn = 31;
    requests.length = 0;
    await autopilot.refreshPlanTacks(plan([...rotate(ROME, 2), ...rotate(OSTIA, 2)]), { tacks: true }, { unattended: false });
    assert.ok(requests.length > 0, "renewed");
});

test("between renewals a new settlement, or one whose tacked building left the plan, gets its first building's tack; nothing is removed", async () => {
    autopilot.resetTackRefresh();
    Game.turn = 40;
    await autopilot.refreshPlanTacks(plan([...ROME, ...OSTIA]), UNATTENDED, { unattended: true });
    Game.turn = 41;
    requests.length = 0;
    // Rome's Monument went into its queue (no longer planned); a new site "n" joined the plan.
    const site = [P("n", 15, 14, "BUILDING_GRANARY")];
    const out = await autopilot.refreshPlanTacks(plan([...ROME.slice(1), ...OSTIA, ...site]), UNATTENDED, { unattended: true });
    assert.deepEqual(requests.sort(), ["+BUILDING_GRANARY@15,14", "+BUILDING_LIBRARY@9,8"]);
    assert.deepEqual(out.map((e) => [e.key, ...e.args]), [["TACKS", 2, 0]]);
    assert.ok(typesAt(11, 8).includes("BUILDING_MONUMENT"), "the old tack stays");
});

test("a renewal never removes a tack whose building is in that city's queue", async () => {
    autopilot.resetTackRefresh();
    Game.turn = 50;
    // Ostia's Library first in the plan: tacked.
    await autopilot.refreshPlanTacks(plan([...ROME, ...rotate(OSTIA, 1)]), UNATTENDED, { unattended: true });
    assert.ok(typesAt(19, 8).includes("BUILDING_LIBRARY"));
    // Queued on its tile; the next plan (the player's own tacks not respected: no kept tacks) plans Ostia's Granary first.
    ostia.queued = [{ type: "BUILDING_LIBRARY", x: 19, y: 8 }];
    try {
        autopilot.askTackRefresh();
        Game.turn = 51;
        await autopilot.refreshPlanTacks(plan([...ROME, ...rotate(OSTIA, 2)]), UNATTENDED, { unattended: true });
        assert.ok(typesAt(19, 8).includes("BUILDING_LIBRARY"), "queued: stays until the building is done");
        assert.ok(typesAt(20, 9).includes("BUILDING_GRANARY"), "the new first one");
        // Not queued any more (the player took it out): a renewal removes it.
        ostia.queued = [];
        autopilot.askTackRefresh();
        Game.turn = 52;
        await autopilot.refreshPlanTacks(plan([...ROME, ...rotate(OSTIA, 2)]), UNATTENDED, { unattended: true });
        assert.ok(!typesAt(19, 8).includes("BUILDING_LIBRARY"));
    } finally {
        delete ostia.queued;
    }
});

// The review of step 1: the renewal's filter read every city's queue for each of our tacks, twice (the stale list, then the
// removal), so the full plan's 150-200 tacks in 15-20 cities made thousands of engine calls a renewal.
test("a renewal reads the cities' queues once, however many of our tacks it looks at", async () => {
    autopilot.resetTackRefresh();
    Game.turn = 60;
    const watched = { tacks: true }; // every recalculation renews them
    await autopilot.refreshPlanTacks(plan([...ROME, ...OSTIA]), watched, { unattended: false });
    // The Library on its tile; the Granary with no tile given (the city that owns the tack's tile queues it).
    ostia.queued = [{ type: "BUILDING_LIBRARY", x: 19, y: 8 }, "BUILDING_GRANARY"];
    const player = Players.get(0);
    const getCities = player.Cities.getCities;
    let reads = 0;
    player.Cities.getCities = () => {
        reads++;
        return getCities();
    };
    try {
        Game.turn = 61;
        await autopilot.refreshPlanTacks(plan([...rotate(ROME, 1), ...rotate(OSTIA, 2)].slice(0, 2)), watched, { unattended: false });
        assert.equal(reads, 1, "one read for the six tacks of ours");
        assert.ok(typesAt(19, 8).includes("BUILDING_LIBRARY"), "the queued one stays");
        assert.ok(typesAt(20, 9).includes("BUILDING_GRANARY"), "queued in Ostia, which owns its tile: it stays");
        assert.ok(!typesAt(11, 8).includes("BUILDING_MONUMENT"), "the others the plan dropped go");
    } finally {
        player.Cities.getCities = getCities;
        delete ostia.queued;
    }
});
