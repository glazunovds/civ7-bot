// The autopilot's step (game 60's review, UI-2, UI-3, M1, M3): F7 or the tab's «Следующий шаг (F7)» runs one pass with the
// ticked options, the autopilot on or off, then the settle round, and never ends the turn; it is refused off our turn, while a
// pass runs and while the game's AI plays; it leaves its outcome and what holds the turn in the state and a `step:` UI.log line.
// Also the age's turns (errors E5, E8): before the dedications only the conversion window runs, and the age-over choice gets no
// settle round; and a queued settler the cap's room no longer needs leaves its queue (E5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const A = { x: 8, y: 8 };
const B = { x: 18, y: 8 };
const owned = (x, y) => [A, B].some((c) => Math.abs(x - c.x) <= 2 && Math.abs(y - c.y) <= 2);
const world = {
    width: 30, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2, YIELD_PRODUCTION: 1 }, owner: owned(x, y) ? 0 : -1 }),
    structures: (x, y) => ([A, B].some((c) => c.x === x && c.y === y) ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [
        { owner: 0, x: A.x, y: A.y, name: "Athens", pop: 8, prod: 12, food: 20, happy: 20, queue: { type: "BUILDING_MONUMENT", turns: 3 } },
        { owner: 0, x: B.x, y: B.y, name: "Sparta", pop: 6, prod: 10, queue: { type: "BUILDING_GRANARY", turns: 3 } },
    ],
    gold: 0,
    goldIncome: 5,
    settlementCap: 8,
    canBuild: () => ({ Success: true, Plots: [], ExpandUrbanPlots: [] }),
    research: { tech: { available: [9011, 9012] }, culture: { available: [9021], active: 9021 } },
    treeRecs: (subject) => (subject === AdvisorySubjectTypes.CHOOSE_TECH ? [{ recommendedType: 9012, whichAdvisors: [AdvisorTypes.SCIENCE] }] : []),
    buildRecs: () => [{ subject: 7, recommendedType: "PROJECT_CITY_SCIENCE_PROJECT", whichAdvisors: [AdvisorTypes.SCIENCE] }],
    units: [],
};
const fake = installFakeEngine(world);
GameInfo.AdvisorySubjects = { lookup: (h) => (h === 7 ? { AdvisorySubjectType: "ADVISORY_SUBJECT_PRODUCE_PROJECTS" } : null) };
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const { DEFAULT_SETTINGS, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");

const OFF = { purchases: false, towns: false, befriend: false, choices: false, resources: false, wonders: false, replanEvery: 0, skipUnits: false, focus: false };
settings.patch({ autopilot: { ...OFF, endTurn: true } });
const sent = (kind) => fake.sent.filter((s) => s.kind === kind);
const techRequests = () => sent("player").filter((s) => s.op === PlayerOperationTypes.SET_TECH_TREE_NODE).length;
const log = () => state.get().autopilot?.log ?? [];
const keys = () => log().map((e) => e.key);
const fresh = () => {
    fake.sent.length = 0;
    state.set({ autopilot: { ...(state.get().autopilot ?? {}), log: [] } });
    delete world.blocker;
    world.turnSent = false;
};
const uiLines = async (fn) => {
    const warn = console.warn;
    const out = [];
    console.warn = (...a) => out.push(a.join(" "));
    try {
        await fn();
    } finally {
        console.warn = warn;
    }
    return out;
};

test("a step: one pass with the ticked options while the autopilot is off; never the end of the turn, «End the turn» ticked or not", async () => {
    fresh();
    assert.equal(autopilot.isAutopilotOn(), false);
    let pending;
    const lines = await uiLines(async () => {
        pending = autopilot.stepNow();
        assert.equal(state.get().autopilot.running, true, "the tab and the dock see it working");
        await pending;
    });
    assert.equal(techRequests(), 1, "the research the options tick");
    assert.equal(sent("endTurn").length, 0, "a step never ends the turn");
    const done = log()[0];
    assert.equal(done.key, "STEP_DONE");
    assert.equal(done.args[0], log().length - 1, "the entries the pass recorded");
    assert.equal(done.args[2], "LOC_XPL_AP_BLOCKED_FREE");
    const step = state.get().autopilot.lastStep;
    assert.deepEqual([step.turn, step.source, step.entries, step.blocker.type], [Game.turn, "HOTKEY", log().length - 1, null]);
    assert.ok(lines.some((l) => new RegExp(`step: T${Game.turn} by HOTKEY: ${step.entries} entries in \\d+ ms; blocker none`).test(l)), lines.join("\n"));
    assert.equal(state.get().autopilot.running, false);
});

test("a step is refused off our turn, while a pass runs and while the game's AI plays: nothing is sent", async () => {
    fresh();
    world.turnSent = true; // the turn was ended
    assert.deepEqual(await autopilot.stepNow(), { refused: "NOT_YOUR_TURN" });
    world.turnSent = false;
    Players.get(0).isTurnActive = false; // another player's turn (hotseat, multiplayer)
    assert.deepEqual(await autopilot.stepNow({ source: "BUTTON" }), { refused: "NOT_YOUR_TURN" });
    delete Players.get(0).isTurnActive;
    globalThis.Autoplay = { isActive: true };
    try {
        assert.deepEqual(await autopilot.stepNow(), { refused: "AI" });
    } finally {
        delete globalThis.Autoplay;
    }
    assert.equal(fake.sent.length, 0, JSON.stringify(fake.sent));
    assert.deepEqual(keys(), ["STEP_AI", "STEP_NOT_YOUR_TURN", "STEP_NOT_YOUR_TURN"]);
    assert.deepEqual([state.get().autopilot.lastStep.refused, state.get().autopilot.lastStep.source], ["AI", "HOTKEY"]);
    // Pressed twice: the second press waits for nothing, and one pass's requests are sent.
    const first = autopilot.stepNow();
    assert.deepEqual(await autopilot.stepNow(), { refused: "BUSY" });
    await first;
    assert.equal(techRequests(), 1);
    assert.ok(keys().includes("STEP_BUSY") && keys().includes("STEP_DONE"));
});

// Game 60's review, M1: the T76 pass converted Астрахань into a city after the production step; its queue was filled only in the
// end-of-turn retry, which a forced pass skipped: a step would have left «Выбрать производство» holding the turn.
test("a step's settle round: a queue that empties late in the pass (a town converted after the production step) is filled", async () => {
    fresh();
    const sparta = world.cities[1];
    const queue = sparta.queue;
    const send = Game.CityCommands.sendRequest;
    const build = Game.CityOperations.sendRequest;
    // The pass's growth step places Athens's citizen; then Sparta stands with an empty queue and the game asks for production.
    world.cities[0].readyToGrow = true;
    world.expand = () => ({ Success: true, Plots: [GameplayMap.getIndexFromXY(A.x + 1, A.y)], ConstructibleTypes: [] });
    Game.CityCommands.sendRequest = (id, op, args) => {
        send(id, op, args);
        if (op === CityCommandTypes.EXPAND) {
            sparta.queue = undefined;
            world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_CITY_PRODUCTION" };
        }
    };
    Game.CityOperations.sendRequest = (id, op, args) => {
        build(id, op, args);
        if (id.id === 1 && args.InsertMode === undefined) {
            sparta.queue = queue;
            delete world.blocker;
        }
    };
    try {
        await autopilot.stepNow();
        const spartaBuilds = sent("operation").filter((s) => s.id.id === 1 && s.args.InsertMode === undefined);
        assert.equal(spartaBuilds.length, 1, JSON.stringify(log().map((e) => e.key)));
        assert.equal(sent("endTurn").length, 0);
        assert.equal(state.get().autopilot.blocker.type, null, "nothing holds the turn after it");
    } finally {
        Game.CityCommands.sendRequest = send;
        Game.CityOperations.sendRequest = build;
        sparta.queue = queue;
        delete world.expand;
        world.cities[0].readyToGrow = false;
        delete world.blocker;
    }
});

test("after a pass the state says what holds the turn, in the game's words; the round does not run for what the options leave", async () => {
    fresh();
    const getMessage = Game.Notifications.getMessage;
    Game.Notifications.getMessage = (id) => (id?.id === 77 ? "LOC_NOTIFICATION_CHOOSE_BELIEF_MESSAGE" : null);
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_BELIEF" };
    try {
        // «Выборы» off: the belief is the player's; one pass, no round.
        await autopilot.stepNow();
        assert.equal(techRequests(), 1, "no settle round for a choice the options leave");
        assert.deepEqual(state.get().autopilot.blocker, { turn: Game.turn, type: "NOTIFICATION_CHOOSE_BELIEF", message: "LOC_NOTIFICATION_CHOOSE_BELIEF_MESSAGE" });
        assert.equal(log()[0].args[2], "LOC_XPL_AP_BLOCKED_HOLDS(LOC_NOTIFICATION_CHOOSE_BELIEF_MESSAGE)");
        assert.equal(state.get().autopilot.lastStep.blocker.type, "NOTIFICATION_CHOOSE_BELIEF");
    } finally {
        Game.Notifications.getMessage = getMessage;
        delete world.blocker;
    }
});

// The review of the step: the settle round after a step ran makeChoices' end-of-turn retry, which declines an ally's call to
// arms (CANCEL_ALLIANCE) or joins it (DECLARE_WAR), forces the least bad card into an empty slot and marks screens seen: what
// only ending the turn needs. A step never ends the turn, so it answers none of that; the automatic pass still does.
test("a step's settle round answers nothing only ending the turn needs: an ally's call to arms stays the player's", async () => {
    fresh();
    const CALL = "NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR";
    const call = () => Object.assign(world, {
        notifications: [{ name: CALL, target: { id: 90 } }], diplomacy: { 90: { initialPlayer: 2, targetPlayer: 3 } }, allies: [2],
        nextCallToArms: 90, blocker: { type: EndTurnBlockingTypes.OTHER, name: CALL },
    });
    const ops = (...names) => sent("player").filter((s) => names.some((n) => s.op === PlayerOperationTypes[n]));
    settings.patch({ autopilot: { choices: true } });
    call();
    try {
        await autopilot.stepNow();
        assert.equal(techRequests(), 3, "the round ran (a choice holds the turn and «Выборы» is ticked)");
        assert.deepEqual(ops("CANCEL_ALLIANCE", "DECLARE_WAR"), [], "the alliance and the peace are the player's");
        assert.deepEqual(ops("CONSIDER_ASSIGN_TRADITIONS", "CONSIDER_ASSIGN_RESOURCE", "CONSIDER_ASSIGN_ATTRIBUTE"), [], "nothing marked seen");
        assert.ok(!keys().includes("DECLINED_WAR"), JSON.stringify(keys()));
        // The automatic pass, the player away: declined as the call-to-arms screen does, then the turn waits no more for it.
        fresh();
        call();
        autopilot.setAutopilot(true);
        await autopilot.runTurn();
        assert.equal(ops("CANCEL_ALLIANCE").length > 0, true, JSON.stringify(keys()));
        assert.ok(keys().includes("DECLINED_WAR"));
    } finally {
        autopilot.setAutopilot(false);
        settings.patch({ autopilot: { choices: false } });
        for (const k of ["notifications", "diplomacy", "allies", "nextCallToArms", "blocker"]) delete world[k];
        await new Promise((r) => setTimeout(r, 300)); // the switch-on's own pass (200 ms) finds it off
    }
});

// The review of the step: with «Разведка» ticked and the player's own units waiting for orders, a step ran both rounds (3.5 s
// instead of 0.8, the same orders sent again), and none of it could release the player's units. Off the automatic pass only
// «Пропускать юнитов» settles them.
test("a step's settle round is not for the player's units waiting: only with «Пропускать юнитов»; the automatic pass as before", async () => {
    fresh();
    const UNITS = { type: EndTurnBlockingTypes.UNITS ?? EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_COMMAND_UNITS" };
    settings.patch({ autopilot: { explore: true } });
    try {
        world.blocker = UNITS;
        await autopilot.stepNow();
        assert.equal(techRequests(), 1, "no round: ordering our units again releases none of the player's");
        fresh();
        world.blocker = UNITS;
        settings.patch({ autopilot: { skipUnits: true } });
        await autopilot.stepNow();
        assert.equal(techRequests(), 3, "skipping them may release the turn: the round runs");
        // The automatic pass ends the turn: the unit options settle them too.
        fresh();
        world.blocker = UNITS;
        settings.patch({ autopilot: { skipUnits: false } });
        autopilot.setAutopilot(true);
        await autopilot.runTurn();
        assert.equal(techRequests(), 3, JSON.stringify(keys()));
        assert.ok(keys().includes("BLOCKED"));
    } finally {
        autopilot.setAutopilot(false);
        settings.patch({ autopilot: { explore: false, skipUnits: false } });
        delete world.blocker;
        await new Promise((r) => setTimeout(r, 300));
    }
});

// Errors E8 (game 60): on Antiquity's last turn the end-of-turn retries re-ran the plan and production twice (~8 s, six tack
// requests the age change wiped) although the next civilization is the player's choice.
test("the age is over: no settle round before the player's choice; AGE_OVER, and the autopilot is off", async () => {
    fresh();
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_CHOOSE_CIVILIZATION" };
    try {
        autopilot.setAutopilot(true);
        await autopilot.runTurn();
        assert.equal(techRequests(), 1, "one pass, no retries");
        assert.ok(keys().includes("AGE_OVER"), JSON.stringify(keys()));
        assert.equal(autopilot.isAutopilotOn(), false);
    } finally {
        autopilot.setAutopilot(false);
        delete world.blocker;
        await new Promise((r) => setTimeout(r, 300)); // the switch-on's own pass (200 ms) finds it off
    }
});

// Errors E5 (game 60, E1): switched on before the dedications, the first pass slotted policies, set town Focus and queued a
// settler; the card's two settlers came after it, and one of the three stood at the cap for 50 turns.
test("the dedications wait: the pass decides nothing (only the conversion window), and the pass after them is full", async () => {
    fresh();
    const turn = Game.turn;
    Game.turn = turn + 1; // a turn no pass has done yet
    const sparta = world.cities[1];
    const queue = sparta.queue;
    sparta.queue = undefined; // an empty queue: only a full pass fills it
    world.blocker = { type: EndTurnBlockingTypes.OTHER, name: "NOTIFICATION_AGE_TRANSITION" };
    settings.patch({ autopilot: { endTurn: false } });
    try {
        autopilot.setAutopilot(true);
        await autopilot.runTurn();
        assert.equal(techRequests(), 0, "no research");
        assert.equal(sent("operation").length, 0, "nothing queued");
        assert.equal(sent("command").length, 0, "no citizen, Focus or purchase");
        assert.ok(keys().includes("AGE_START"));
        assert.equal(autopilot.isAutopilotOn(), false, "off until they are chosen");
        assert.notEqual(state.get().autopilot.lastTurn, Game.turn, "the turn is not marked done");
        // Chosen: on again, and its pass is a full one.
        delete world.blocker;
        assert.equal(autopilot.resumeAfterAgeChange(), true);
        for (let i = 0; i < 50 && state.get().autopilot.lastTurn !== Game.turn; i++) await new Promise((r) => setTimeout(r, 100));
        assert.equal(state.get().autopilot.lastTurn, Game.turn);
        assert.equal(techRequests(), 1);
        assert.ok(sent("operation").some((s) => s.id.id === 1), "Sparta's empty queue filled: a full pass");
    } finally {
        autopilot.setAutopilot(false);
        sparta.queue = queue;
        delete world.blocker;
        settings.patch({ autopilot: { endTurn: true } });
        Game.turn = turn;
    }
});

test("a queued settler leaves its queue when the settlers we have already fill the cap's room; not one with progress, not without «Поселенцы»", () => {
    const sparta = world.cities[1];
    const settler = (id) => ({ id, type: "UNIT_SETTLER", x: A.x + 1, y: A.y });
    const drops = (out) => out.filter((e) => e.key === "SETTLER_DROPPED");
    try {
        // 2 settlements of 3: room for 1, two settlers on the map and one queued in Sparta.
        Object.assign(world, { settlementCap: 3, units: [settler(41), settler(42)] });
        sparta.queued = ["UNIT_SETTLER"];
        fake.sent.length = 0;
        let out = steps.fillProduction(new Map(), { settlers: true, threats: [] });
        assert.deepEqual(drops(out).map((e) => e.args.slice(0, 1).concat(e.args.slice(2))), [["Sparta", 2, 3]], JSON.stringify(out));
        const removal = sent("operation").find((s) => s.args.InsertMode === CityOperationsParametersValues.RemoveAt);
        assert.deepEqual([removal?.id.id, removal?.args.QueueLocation], [1, 1]);
        // Its production is not thrown away.
        sparta.progress = { UNIT_SETTLER: 10 };
        assert.deepEqual(drops(steps.fillProduction(new Map(), { settlers: true, threats: [] })), []);
        delete sparta.progress;
        // The player's own settlers: left alone without «Поселенцы».
        assert.deepEqual(drops(steps.fillProduction(new Map(), { threats: [] })), []);
        // Room for all three.
        world.settlementCap = 5;
        assert.deepEqual(drops(steps.fillProduction(new Map(), { settlers: true, threats: [] })), []);
    } finally {
        Object.assign(world, { settlementCap: 8, units: [] });
        delete sparta.queued;
    }
});

test("commandUnits gives the tab the generals (role, level, XP to the next level, post) and the field operation; the pass keeps them", async () => {
    fresh();
    world.units = [{ id: 50, type: "UNIT_ARMY_COMMANDER", x: A.x, y: A.y, xp: { level: 2, points: 34, next: 45 } }];
    try {
        const r = units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [], airCover: [] });
        assert.deepEqual(r.generals.map(({ role, type, level, xp, next }) => ({ role, type, level, xp, next })), [{ role: "VANGUARD", type: "UNIT_ARMY_COMMANDER", level: 2, xp: 34, next: 45 }]);
        assert.equal(r.fieldOp, null);
        assert.equal(units.commandUnits(DEFAULT_SETTINGS, { explore: true, threats: [] }).generals, null, "only with «Оборона» or «Бродить»");
        units.resetUnitGoals();
        settings.patch({ autopilot: { defend: true } });
        await autopilot.stepNow();
        assert.deepEqual(state.get().autopilot.generals?.map((g) => [g.role, g.level, g.xp, g.next]), [["VANGUARD", 2, 34, 45]]);
        // «Оборона» off: the unit step gives no generals, and the tab's line from the last pass goes (the review of step 2).
        settings.patch({ autopilot: { defend: false, explore: true } });
        await autopilot.stepNow();
        assert.equal(state.get().autopilot.generals, null, "a unit step without «Оборона» or «Бродить»");
        settings.patch({ autopilot: { defend: true, explore: false } });
        await autopilot.stepNow();
        assert.equal(state.get().autopilot.generals?.length, 1);
        settings.patch({ autopilot: { defend: false } });
        await autopilot.stepNow();
        assert.equal(state.get().autopilot.generals, null, "no unit step at all");
        assert.equal(state.get().autopilot.fieldOp, null);
    } finally {
        settings.patch({ autopilot: { defend: false, explore: false } });
        world.units = [];
        units.resetUnitGoals();
    }
});

// Game 60's review, UI-7: the phase replaced «Запас золота» and «Чудес одновременно» on every Antiquity turn (reserve 1 turn on
// 59 turns, 2 wonders on 81) while the tab showed the player's 2 turns and 1 wonder: the state now keeps the phase's numbers.
test("the strategy's phase keeps its reserve and wonders in the state, for the tab", async () => {
    fresh();
    const { strategyOverride } = await import("../mod/expansion-planner/ui/core/xpl-ap-options.js");
    settings.patch({ autopilot: { focus: true, victory: "SCIENCE", strategy: true, reserveTurns: 2, maxWonders: 1 } });
    world.finalAge = true;
    try {
        await autopilot.stepNow();
        const strategy = state.get().autopilot.strategy;
        assert.equal(strategy?.phase, "COMMIT", JSON.stringify(keys()));
        assert.equal(strategy.reserveTurns, 1, "the final push keeps 1 turn of income");
        assert.equal(typeof strategy.wonders, "number");
        assert.equal(strategyOverride("reserveTurns", settings.get().autopilot, strategy), 1);
        assert.equal(settings.get().autopilot.reserveTurns, 2, "the player's own stays");
    } finally {
        delete world.finalAge;
        settings.patch({ autopilot: { focus: false, victory: "AUTO" } });
    }
});
