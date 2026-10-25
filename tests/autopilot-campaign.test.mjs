// Research/37 Phase 7: campaigns, behind «Наступление» (autopilot.offensive, off by default). With it off nothing of it
// runs and peace is sought as before; on, in a war someone else started, a settlement of ours the enemy holds (the game's
// city.originalOwner) is retaken: the soldiers defence leaves free gather with a commander, shoot and attack its
// defences by the game's preview, occupy every district at 0, keep the settlement, and end on peace, a home in danger, a
// near victory, a stall or the deadline; peace waits only while the assault makes progress.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

const HOME = { x: 5, y: 8 };
const LOST = { x: 13, y: 8 };
const QUARTER = { x: 14, y: 8 }; // a walled district of Lost
const world = {
    width: 30, height: 18, wrapX: false,
    tiles: (x) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: x < 11 ? 0 : 1 }),
    players: [{ id: 0 }, { id: 1, name: "Rome" }, { id: 2, name: "Persia" }],
    cities: [
        { owner: 0, ...HOME, name: "Home", pop: 8, prod: 40 },
        { owner: 1, ...LOST, name: "Lost", originalOwner: 0, districts: [LOST, QUARTER] },
    ],
    units: [], gold: 0,
};
const fake = installFakeEngine(world);
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const core = await import("../mod/expansion-planner/ui/core/xpl-campaign.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const lost = world.cities[1];
const soldiers = () => [
    { id: 1, type: "UNIT_WARRIOR", x: 6, y: 8 },
    { id: 2, type: "UNIT_WARRIOR", x: 6, y: 9 },
    { id: 3, type: "UNIT_SLINGER", x: 7, y: 8 },
    { id: 9, type: "UNIT_ARMY_COMMANDER", x: 4, y: 9 },
];
const reset = (extra = {}) => {
    units.resetUnitGoals();
    choices.resetPeace();
    fake.sent.length = 0;
    for (const k of ["enemies", "wars", "rangeTargets", "combat", "districtHealth", "controlled", "peaceOk", "dealAnswer", "incomingDeals", "unitCommandOk"]) delete world[k];
    Object.assign(lost, { owner: 1, originalOwner: 0, justConquered: false });
    world.units = soldiers();
    world.enemies = [{ ...LOST, owner: 1, type: "UNIT_WARRIOR" }];
    world.wars = [1];
    Game.turn = 20;
    Object.assign(world, extra);
};
const quiet = (fn) => {
    const warn = console.warn;
    const said = [];
    console.warn = (...a) => said.push(a.join(" "));
    try {
        return { r: fn(), said };
    } finally {
        console.warn = warn;
    }
};
const run = (options = {}) => quiet(() => units.commandUnits(DEFAULT_SETTINGS, { defend: true, offensive: true, threats: [], fronts: [], exposed: [], ...options }));
const movesOf = (id) => fake.sent.filter((s) => s.kind === "unit" && s.id?.id === id && s.op === UnitOperationTypes.MOVE_TO).map((s) => ({ x: s.args.X, y: s.args.Y, attack: !!(s.args.Modifiers & UnitOperationMoveModifiers.ATTACK) }));
const d = (a, b) => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y);
const keys = (r) => r.entries.map((e) => e.key);
const place = (pos) => { for (const u of world.units) if (pos[u.id]) Object.assign(u, pos[u.id]); };
// A campaign started on turn 20, gathered at its staging area on turn 21: in the assault.
const toAssault = () => {
    run();
    const staging = units.campaignState().staging;
    const near = GameplayMap.getPlotIndicesInRadius(staging.x, staging.y, 1).map((i) => GameplayMap.getLocationFromIndex(i))
        .filter((l) => l.x < 12 && !(l.x === staging.x && l.y === staging.y));
    place({ 1: { ...staging }, 2: { ...near[0] }, 3: { ...near[1] }, 9: { ...near[2] } });
    Game.turn = 21;
    fake.sent.length = 0;
    const out = run();
    assert.equal(units.campaignState()?.stage, "ASSAULT", JSON.stringify(keys(out.r)));
    return out;
};

test("off by default: no campaign starts and a running one ends (WHY_OFF); the soldiers get their usual orders", () => {
    assert.equal(DEFAULT_SETTINGS.autopilot.offensive, false);
    reset();
    const { r } = quiet(() => units.commandUnits(DEFAULT_SETTINGS, { defend: true, threats: [], fronts: [], exposed: [] }));
    assert.equal(units.campaignState(), null);
    assert.ok(!keys(r).includes("CAMPAIGN_STARTED"));
    assert.deepEqual([1, 2, 3].flatMap(movesOf), [], "nobody walks toward Lost");
    // A campaign under way, then the checkbox off: it ends, and its soldiers are free again.
    reset();
    run();
    assert.ok(units.campaignState());
    Game.turn = 21;
    const off = quiet(() => units.commandUnits(DEFAULT_SETTINGS, { defend: true, offensive: false, threats: [], fronts: [], exposed: [] })).r;
    assert.equal(units.campaignState(), null);
    assert.deepEqual(off.entries.find((e) => e.key === "CAMPAIGN_ABORTED")?.args, ["Lost", "LOC_XPL_AP_CAMPAIGN_WHY_OFF"]);
});

test("a campaign retakes our settlement the enemy holds: the free soldiers gather 3 tiles from it with a commander", () => {
    reset();
    const { r, said } = run();
    const c = units.campaignState();
    assert.ok(c, JSON.stringify(said));
    assert.deepEqual(r.entries.find((e) => e.key === "CAMPAIGN_STARTED")?.args, ["Lost", "Rome", 3]);
    assert.equal(d(c.staging, LOST), core.CAMPAIGN.STAGE_DIST);
    assert.ok(c.staging.x < LOST.x, "on our side");
    for (const id of [1, 2, 3]) {
        const [m] = movesOf(id);
        assert.ok(m && d(m, c.staging) <= 1 && !m.attack, `${id}: ${JSON.stringify(movesOf(id))}`);
    }
    assert.ok(r.entries.some((e) => e.key === "CAMPAIGN_COMMANDER"), "the commander goes too");
    assert.equal(c.commander, "0:9");
    assert.ok(said.some((l) => l.includes("campaign: GATHER Lost of Rome")), JSON.stringify(said));
    // On its way the campaign keeps its soldiers: no second order, nothing from the defence.
    Game.turn = 21;
    fake.sent.length = 0;
    for (const u of world.units) Object.assign(u, { activity: UnitActivityTypes.OPERATION, dest: { ...c.staging } });
    run();
    assert.deepEqual([1, 2, 3, 9].flatMap(movesOf), []);
    // Two arrived, the slinger still on its way (it moved this turn): those waiting are left to the campaign by the unit
    // loop (no fortifying, no roaming); the skip step skips them.
    const near = GameplayMap.getPlotIndicesInRadius(c.staging.x, c.staging.y, 1).map((i) => GameplayMap.getLocationFromIndex(i)).filter((l) => !(l.x === c.staging.x && l.y === c.staging.y));
    for (const u of world.units) Object.assign(u, { activity: UnitActivityTypes.NONE, dest: undefined });
    place({ 1: { ...c.staging }, 2: { ...near[0] }, 3: { moved: true }, 9: { ...near[2] } });
    Game.turn = 22;
    fake.sent.length = 0;
    const idle = run();
    assert.equal(units.campaignState()?.stage, "GATHER");
    assert.deepEqual(fake.sent.filter((s) => s.kind === "unit" && [1, 2, 9].includes(s.id?.id)).map((s) => [s.id.id, s.op]), [], JSON.stringify(keys(idle.r)));
});

test("never a settlement that was not ours, never without a war, never one far away", () => {
    reset();
    lost.originalOwner = 1;
    run();
    assert.equal(units.campaignState(), null, "Rome's own city");
    reset({ wars: [] });
    run();
    assert.equal(units.campaignState(), null, "at peace with Rome");
    reset();
    const { said } = run({ victoryNear: true });
    assert.equal(units.campaignState(), null, "a victory of ours is near");
    assert.ok(said.some((l) => l.includes("a victory of ours is near")));
});

test("defence first: no campaign while a settlement of ours needs guards or a front takes a soldier; a running one gives its soldiers back (HOME)", () => {
    const threat = { settlement: { ...HOME, name: "Home" }, count: 2, land: 2, damaged: true, owners: [{ id: 1, independent: false }] };
    // Three raiders at Home, two melee guards there and nobody free to send: Home needs its soldiers.
    reset();
    let out = run({ threats: [{ ...threat, count: 3, land: 3 }] });
    assert.equal(units.campaignState(), null);
    assert.ok(out.said.some((l) => l.includes("a settlement of ours needs its soldiers")), JSON.stringify(out.said));
    // Home damaged but guarded, and three soldiers free elsewhere: the campaign takes them (research/42 B4; game 53: a damaged
    // centre anywhere blocked the retaking of Китион while 15-26 soldiers stood free).
    reset();
    world.units.push({ id: 4, type: "UNIT_WARRIOR", x: 9, y: 8 }, { id: 5, type: "UNIT_WARRIOR", x: 9, y: 9 }, { id: 6, type: "UNIT_SLINGER", x: 10, y: 8 });
    out = run({ threats: [threat] });
    assert.deepEqual([...(units.campaignState()?.members ?? [])].sort(), ["0:4", "0:5", "0:6"], JSON.stringify(out.said));
    // A war front at Home keeps the warrior standing there: one melee soldier is left, not enough (two fronts never take
    // the same troops).
    reset();
    place({ 2: { x: 8, y: 9 } });
    out = run({ fronts: [{ settlement: { ...HOME, name: "Home" }, owners: [1] }] });
    assert.equal(units.campaignState(), null, JSON.stringify(keys(out.r)));
    assert.ok(out.said.some((l) => l.includes("not enough force (melee 1 of 2")), JSON.stringify(out.said));
    // Gathered at the staging area, then Home is hit: the campaign ends and its soldiers are sent home in the same pass.
    reset();
    run();
    const staging = units.campaignState().staging;
    place({ 1: { ...staging }, 2: { x: staging.x, y: staging.y + 1 }, 3: { x: staging.x - 1, y: staging.y } });
    Game.turn = 21;
    fake.sent.length = 0;
    out = run({ threats: [threat] });
    assert.equal(units.campaignState(), null);
    assert.deepEqual(out.r.entries.find((e) => e.key === "CAMPAIGN_ABORTED")?.args, ["Lost", "LOC_XPL_AP_CAMPAIGN_WHY_HOME"]);
    assert.ok(out.r.entries.some((e) => e.key === "REINFORCE" || e.key === "STAGED"), JSON.stringify(keys(out.r)));
});

test("the assault: shots at the defences, a melee attack only when the preview pays, the capture of a district at 0", async () => {
    reset();
    toAssault();
    // The slinger 2 from the centre, a warrior next to the centre, the other next to the quarter (already at 0).
    place({ 1: { x: 12, y: 8 }, 2: { x: 14, y: 9 }, 3: { x: 11, y: 8 } });
    world.rangeTargets = (id) => (id?.id === 3 ? [LOST, QUARTER] : []);
    world.districtHealth = (x, y) => (x === QUARTER.x && y === QUARTER.y ? 0 : 100);
    world.combat = () => ({ dealt: 30, taken: 20 });
    fake.sent.length = 0;
    const out = await units.campaignAssault();
    assert.deepEqual(out.map((e) => [e.key, e.args[0] && e.key]).map(([k]) => k), ["DISTRICT_SHOT", "DISTRICT_STRUCK", "DISTRICT_TAKEN"]);
    const shot = fake.sent.find((s) => s.op === UnitOperationTypes.RANGE_ATTACK);
    assert.deepEqual([shot?.args.X, shot?.args.Y], [LOST.x, LOST.y], "the centre: the quarter has nothing left to shoot");
    assert.deepEqual(movesOf(1), [{ ...LOST, attack: true }]);
    assert.deepEqual(movesOf(2), [{ ...QUARTER, attack: true }], "it moves onto the quarter at 0");
    // A preview that costs the warrior more than it takes from the walls: no attack.
    world.combat = () => ({ dealt: 10, taken: 70 });
    world.rangeTargets = () => [];
    fake.sent.length = 0;
    const poor = await units.campaignAssault();
    assert.ok(!poor.some((e) => e.key === "DISTRICT_STRUCK"));
    assert.deepEqual(movesOf(1), []);
});

test("a centre at 0 is not a capture: the campaign goes on until the settlement is ours, which is kept, then ends DONE", async () => {
    reset();
    toAssault();
    place({ 1: { x: 12, y: 8 } });
    world.districtHealth = () => 0;
    world.rangeTargets = () => [];
    Game.turn = 22;
    let out = run();
    assert.ok(units.campaignState(), JSON.stringify(keys(out.r)));
    assert.ok(!keys(out.r).includes("CAMPAIGN_DONE"));
    fake.sent.length = 0;
    const a = await units.campaignAssault();
    assert.ok(a.some((e) => e.key === "DISTRICT_TAKEN"));
    // The game hands it over: ours again, just conquered; kept (Keep, as the capture chooser sends it), and the campaign is done.
    Object.assign(lost, { owner: 0, justConquered: true });
    try {
        fake.sent.length = 0;
        const kept = units.keepRetaken();
        assert.deepEqual(kept.map((e) => e.key), ["CITY_KEPT"]);
        const cmd = fake.sent.find((s) => s.kind === "command" && s.op === CityCommandTypes.DESTROY);
        assert.deepEqual(cmd?.args, { Directive: 2 });
        Game.turn = 23;
        out = run();
        assert.deepEqual(out.r.entries.find((e) => e.key === "CAMPAIGN_DONE")?.args, ["Lost"]);
        assert.equal(units.campaignState(), null);
    } finally {
        Object.assign(lost, { owner: 1, justConquered: false });
    }
});

test("a target survives an owner change: Persia takes Lost from Rome and the campaign goes on against Persia", () => {
    reset({ wars: [1, 2] });
    run();
    lost.owner = 2;
    try {
        Game.turn = 21;
        const { r, said } = run();
        const c = units.campaignState();
        assert.equal(c?.enemy, 2, JSON.stringify(keys(r)));
        assert.ok(!keys(r).includes("CAMPAIGN_ABORTED"));
        assert.ok(said.some((l) => l.includes("passed from Rome to Persia")), JSON.stringify(said));
    } finally {
        lost.owner = 1;
    }
});

test("an assault with no progress for 5 turns ends (STALL), and the target waits 10 turns", () => {
    reset();
    toAssault();
    const start = units.campaignState().progressTurn;
    Game.turn = start + core.CAMPAIGN.STALL_TURNS;
    run();
    assert.ok(units.campaignState(), "5 turns: not yet");
    Game.turn = start + core.CAMPAIGN.STALL_TURNS + 1;
    const { r } = run();
    assert.deepEqual(r.entries.find((e) => e.key === "CAMPAIGN_ABORTED")?.args, ["Lost", "LOC_XPL_AP_CAMPAIGN_WHY_STALL"]);
    Game.turn += 1;
    const again = run();
    assert.equal(units.campaignState(), null);
    assert.ok(again.said.some((l) => l.includes(`Lost again on turn ${start + core.CAMPAIGN.STALL_TURNS + 1 + core.CAMPAIGN.RETRY_TURNS}`)), JSON.stringify(again.said));
});

test("peace waits while the assault makes progress (only with the checkbox); a peace giving the settlement back is taken", async () => {
    const P = DiplomacyDealProposalActions;
    const I = DiplomacyDealItemTypes;
    const deals = () => fake.sent.filter((s) => s.kind === "deal");
    const sends = () => deals().filter((x) => x.op === "send").map((x) => x.action);
    reset();
    toAssault();
    Object.assign(world, { peaceOk: [1], dealAnswer: () => P.ACCEPTED });
    fake.sent.length = 0;
    const held = await choices.seekPeace({ offensive: true });
    assert.deepEqual(held.map((e) => e.key), ["PEACE_HELD"]);
    assert.deepEqual(deals(), []);
    // Without the checkbox the intent is never consulted: white peace as before.
    choices.resetPeace();
    fake.sent.length = 0;
    await choices.seekPeace();
    assert.deepEqual(sends(), [P.INSPECT, P.PROPOSED]);
    // A peace Rome offers: refused while the assault goes on, unless it gives Lost back.
    const peace = { type: I.AGREEMENTS, subType: DiplomacyDealItemAgreementTypes.MAKE_PEACE, from: 1, to: 0 };
    const answer = (items) => {
        choices.resetPeace();
        fake.sent.length = 0;
        world.incomingDeals = { 1: items };
        const out = choices.answerIncomingDeals({ offensive: true });
        delete world.incomingDeals;
        return out;
    };
    assert.deepEqual(answer([peace]).map((e) => e.key), ["PEACE_HELD"]);
    assert.deepEqual(sends(), [P.REJECTED]);
    assert.deepEqual(answer([peace, { type: I.CITIES, from: 1, to: 0, cityId: { owner: 1, id: 0 } }]).map((e) => e.key), ["PEACE_ACCEPTED"]);
    assert.deepEqual(sends(), [P.ACCEPTED]);
    // No progress for PEACE_HOLD turns: peace is sought again.
    Game.turn = units.campaignState().progressTurn + core.CAMPAIGN.PEACE_HOLD + 1;
    choices.resetPeace();
    fake.sent.length = 0;
    await choices.seekPeace({ offensive: true });
    assert.deepEqual(sends(), [P.INSPECT, P.PROPOSED]);
});

test("the campaign's commander takes Initiative first; a veteran defender keeps the defensive order", () => {
    const saved = ["UnitPromotionClassSets", "UnitPromotionDisciplineDetails", "UnitPromotions"].map((k) => [k, GameInfo[k]]);
    GameInfo.UnitPromotionClassSets = [
        { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_ASSAULT" },
        { PromotionClassType: "PROMOTION_CLASS_LAND_COMMANDER", UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION" },
    ];
    GameInfo.UnitPromotionDisciplineDetails = [
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_ASSAULT", UnitPromotionType: "PROMOTION_ARMY_INITIATIVE" },
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION", UnitPromotionType: "PROMOTION_ARMY_STEADFAST" },
        { UnitPromotionDisciplineType: "DISCIPLINE_ARMY_BASTION", UnitPromotionType: "PROMOTION_ARMY_HOLD_THE_LINE" },
    ];
    GameInfo.UnitPromotions = { lookup: (t) => ({ Name: t }) };
    const promoted = () => {
        fake.sent.length = 0;
        units.promoteUnits();
        return fake.sent.find((s) => s.op === UnitCommandTypes.PROMOTE)?.args.PromotionType;
    };
    try {
        const earnable = ["PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_HOLD_THE_LINE"];
        // A vanguard far away (research/41 Phase 2): commander 9, undecided, is the bastion.
        reset({ unitCommandOk: (_id, op) => op === UnitCommandTypes.PROMOTE });
        world.units.push({ id: 31, type: "UNIT_ARMY_COMMANDER", x: 1, y: 16, promotions: { can: false, has: ["PROMOTION_ARMY_INITIATIVE"], earnable: [] } });
        world.units.find((u) => u.id === 9).promotions = { can: true, has: [], earnable };
        assert.equal(promoted(), Database.makeHash("PROMOTION_ARMY_STEADFAST"), "no campaign: the bastion's defensive order");
        run();
        assert.equal(units.campaignState()?.commander, "0:9");
        assert.equal(promoted(), Database.makeHash("PROMOTION_ARMY_INITIATIVE"), "leading a campaign: Initiative");
        world.units.find((u) => u.id === 9).promotions = { can: true, has: ["PROMOTION_ARMY_STEADFAST"], earnable: ["PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_HOLD_THE_LINE"] };
        assert.equal(promoted(), Database.makeHash("PROMOTION_ARMY_HOLD_THE_LINE"), "a veteran defender keeps its profile");
    } finally {
        for (const [k, v] of saved) GameInfo[k] = v;
    }
});

test("core: the force, the end's order, the assault's start, the peace intent, a strike on walls, the commander's profile", () => {
    assert.equal(core.forceEnough({ melee: 1, units: 4 }).ok, false);
    assert.equal(core.forceEnough({ melee: 2, units: 3, enemies: 2 }).ok, false, "3 against 2: 2 more wanted");
    assert.equal(core.forceEnough({ melee: 2, units: 4, enemies: 2, ourBest: 20, theirBest: 30 }).ok, false, "too weak");
    assert.equal(core.forceEnough({ melee: 2, units: 4, enemies: 2, ourBest: 25, theirBest: 30 }).ok, true);
    const c = { started: 10, stage: "ASSAULT", progressTurn: 20, assaultTurn: 18 };
    const f = { turn: 21, ours: false, theirs: true, atWar: true, offensive: true, victoryNear: false, melee: 2, units: 3, homeUnsafe: false };
    assert.equal(core.campaignEnd(c, f), null);
    assert.equal(core.campaignEnd(c, { ...f, ours: true, atWar: false }), "DONE", "retaken first, whatever else");
    assert.equal(core.campaignEnd(c, { ...f, theirs: false }), "GONE");
    assert.equal(core.campaignEnd(c, { ...f, atWar: false }), "PEACE");
    assert.equal(core.campaignEnd(c, { ...f, victoryNear: true }), "VICTORY");
    assert.equal(core.campaignEnd(c, { ...f, turn: 36 }), "LATE");
    assert.equal(core.campaignEnd(c, { ...f, turn: 26 }), "STALL");
    assert.equal(core.campaignEnd(c, { ...f, melee: 0 }), "FORCE");
    assert.equal(core.campaignEnd(c, { ...f, homeUnsafe: true }), "HOME");
    const g = { started: 10, stage: "GATHER" };
    assert.equal(core.readyToAssault(g, { turn: 12, arrived: 3, members: 3, meleeArrived: 2 }), true);
    assert.equal(core.readyToAssault(g, { turn: 12, arrived: 2, members: 3, meleeArrived: 1 }), false);
    assert.equal(core.readyToAssault(g, { turn: 18, arrived: 2, members: 3, meleeArrived: 1 }), true, "after 8 turns with the minimum");
    assert.equal(core.peaceIntent(c, 1, 21), "SEEK", "another enemy");
    assert.equal(core.peaceIntent({ ...c, enemy: 1 }, 1, 23), "CONTINUE");
    assert.equal(core.peaceIntent({ ...c, enemy: 1 }, 1, 24), "SEEK", "no progress for 4 turns");
    assert.equal(core.peaceIntent({ ...c, enemy: 1, progressTurn: 27 }, 1, 27), "SEEK", "9 turns after the assault began");
    assert.equal(core.peaceIntent({ ...c, enemy: 1, stage: "GATHER" }, 1, 21), "SEEK");
    assert.equal(core.districtStrikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, dealt: 30, taken: 20 }), true);
    assert.equal(core.districtStrikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, dealt: 30, taken: 65 }), false, "below 40% after");
    assert.equal(core.districtStrikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 100, dealt: 20, taken: 30 }), false);
    assert.equal(core.districtStrikeWorthIt({ ourHealth: 100, ourMax: 100, theirHealth: 15, dealt: 20, taken: 30 }), true, "it brings the walls to 0");
    const has = (list) => (p) => list.includes(p);
    assert.equal(core.commanderProfile(has([]), { leads: true }), "MOBILE");
    assert.equal(core.commanderProfile(has([])), "DEFENSIVE");
    assert.equal(core.commanderProfile(has(["PROMOTION_ARMY_INITIATIVE"])), "MOBILE", "it keeps its profile after the campaign");
    assert.equal(core.commanderProfile(has(["PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_INITIATIVE"]), { leads: true }), "DEFENSIVE");
});
