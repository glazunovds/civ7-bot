// The autopilot's strategy by phase (core/xpl-strategy.js, research/21 §3): Growth, Build, Commit;
// what each phase does for each focus; the plan narrows the user's settings, never widens them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStrategy, padsWanted, phaseOf, planStrategy, strategyLines } from "../mod/expansion-planner/ui/core/xpl-strategy.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";
import { conversionRule } from "../mod/expansion-planner/ui/core/xpl-savings.js";
import { focusOfProfile } from "../mod/expansion-planner/ui/core/xpl-effect-value.js";
import { dominanceMultiple, militaryOutlook, nextDominanceMultiple, scorePlaces, victoryWatch } from "../mod/expansion-planner/ui/core/xpl-victory-focus.js";

const facts = (o) => ({ age: "AGE_ANTIQUITY", ageFrac: 0.1, finalAge: false, settlements: 2, cap: 5, cities: 1, towns: 1, ...o });

test("phases: Antiquity before 25% or well below the cap Growth; then Build; Exploration's start Growth while towns outnumber cities; the final age Commit", () => {
    const rows = [
        [{ ageFrac: 0.1, settlements: 5, cap: 5 }, "GROWTH", "early Antiquity"],
        [{ ageFrac: 0.3, settlements: 5, cap: 5 }, "BUILD", "past 25% at the cap"],
        [{ ageFrac: 0.3, settlements: 4, cap: 5 }, "BUILD", "one below the cap"],
        [{ ageFrac: 0.3, settlements: 2, cap: 5 }, "GROWTH", "well below the cap"],
        [{ ageFrac: 0.6, settlements: 2, cap: 5 }, "BUILD", "growth ends half way through the age"],
        [{ age: "AGE_EXPLORATION", ageFrac: 0.05, settlements: 6, cap: 7, cities: 1, towns: 5 }, "GROWTH", "a new age: towns to convert"],
        [{ age: "AGE_EXPLORATION", ageFrac: 0.05, settlements: 6, cap: 7, cities: 3, towns: 3 }, "BUILD", "nothing to re-expand or convert"],
        [{ age: "AGE_EXPLORATION", ageFrac: 0.2, settlements: 2, cap: 7, cities: 1, towns: 1 }, "BUILD", "past 15%"],
        [{ age: "AGE_MODERN", finalAge: true, ageFrac: 0.01, settlements: 2, cap: 9 }, "COMMIT", "the final age"],
    ];
    for (const [o, want, why] of rows) assert.equal(phaseOf(facts(o)), want, why);
});

test("phases never go back within an age (a lost settlement keeps Build); a new age starts afresh", () => {
    const below = facts({ ageFrac: 0.3, settlements: 2, cap: 5 });
    assert.equal(phaseOf(below), "GROWTH");
    assert.equal(phaseOf(below, { phase: "BUILD", age: "AGE_ANTIQUITY" }), "BUILD");
    assert.equal(phaseOf(facts({ age: "AGE_EXPLORATION", ageFrac: 0.05, cities: 1, towns: 5, settlements: 6, cap: 7 }), { phase: "BUILD", age: "AGE_ANTIQUITY" }), "GROWTH");
});

test("Growth: food and production first, for every focus (decision 7); the focus's choices keep their focus", () => {
    const plan = planStrategy(facts({}), "SCIENCE", { profile: "SCIENCE" });
    assert.equal(plan.phase, "GROWTH");
    assert.equal(plan.profile, "GROWTH_SCIENCE");
    const y = getProfile(plan.profile).y; // F P G S C H I
    assert.ok(y[0] > y[3] && y[1] > y[3], "food and production above science");
    assert.equal(focusOfProfile(plan.profile), "SCIENCE", "governments, policies and attributes still serve the focus");
    assert.deepEqual([plan.reserveTurns, plan.trainSettlers, plan.upgrades, plan.townFocusBias], [1, true, "ANY", { FARM: 2 }]);
    assert.equal(planStrategy(facts({}), "CULTURE").profile, "GROWTH_CULTURE");
    assert.equal(planStrategy(facts({}), "ECONOMIC").profile, "GROWTH_GOLD");
});

test("profiles: science Commit keeps 1 turn of income, settlers up to the cap (nearest sites), 3 to 5 Launch Pads, the bank before Rocketry and the pads first after it", () => {
    const f = facts({ age: "AGE_MODERN", finalAge: true, cities: 4, towns: 3, settlements: 7, cap: 9, gate: { open: false, progress: 0.4 } });
    const plan = planStrategy(f, "SCIENCE", { profile: "SCIENCE" });
    assert.deepEqual([plan.phase, plan.reserveTurns, plan.explorers, plan.planBuys, plan.townShare], ["COMMIT", 1, false, "CITIES", 0]);
    // research/26 §3.3: each settlement is 4 military points; game 12 stood at 11 of 16 from M30 with sites known.
    assert.deepEqual([plan.trainSettlers, plan.fillCap, plan.settleNear], [true, true, true], "below the cap: settlers, nearest sites first");
    assert.equal(planStrategy({ ...f, settlements: 9 }, "SCIENCE").trainSettlers, false, "at the cap: none");
    assert.equal(plan.pads, 4);
    assert.deepEqual(plan.goals, ["CONVERT", "PADS", "AIRFIELD"], "the Airfield before Rocketry too (research/24 P1)");
    assert.equal(plan.minCities, 4, "towns convert until a city stands for every pad");
    assert.deepEqual(planStrategy({ ...f, gate: { open: true, progress: 1 } }, "SCIENCE").goals, ["PADS", "CONVERT", "AIRFIELD", "LEVER"]);
    assert.deepEqual([padsWanted(1), padsWanted(4), padsWanted(9)], [3, 4, 5]);
    const build = planStrategy(facts({ ageFrac: 0.5, settlements: 5 }), "SCIENCE");
    assert.deepEqual([build.phase, build.reserveTurns, build.explorers, build.advisorSoldiers, build.militaryBuildings, build.upgrades], ["BUILD", 2, false, false, false, "THREAT"]);
    const culture = planStrategy(facts({ ageFrac: 0.5, settlements: 5 }), "CULTURE");
    assert.deepEqual([culture.wonders, culture.explorers, culture.advisorSoldiers], [2, true, true]);
    assert.equal(planStrategy(facts({}), null), null, "no focus: no plan");
});

test("applyStrategy narrows the user's options, never widens them, and never changes the settings object", () => {
    const user = Object.freeze({ profile: "BALANCE", autopilot: Object.freeze({ reserveTurns: 3, maxWonders: 2, explore: false, settlers: true, focus: true }) });
    const plan = { ...planStrategy(facts({ ageFrac: 0.5, settlements: 5 }), "CULTURE"), explorers: true, trainSettlers: true };
    const s = applyStrategy(user, plan);
    assert.equal(s.autopilot.explorers, false, "«Разведка» off: the plan's explorers do not switch it on");
    assert.equal(s.autopilot.trainSettlers, true);
    assert.deepEqual([s.autopilot.reserveTurns, s.autopilot.maxWonders, s.profile], [2, 2, "CULTURE"]);
    assert.equal(s.strategy.phase, "BUILD");
    assert.deepEqual(user.autopilot, { reserveTurns: 3, maxWonders: 2, explore: false, settlers: true, focus: true }, "the saved settings stay the user's");
    const commit = applyStrategy(user, planStrategy(facts({ age: "AGE_MODERN", finalAge: true, cities: 3, settlements: 10, cap: 10 }), "SCIENCE"));
    assert.equal(commit.autopilot.trainSettlers, false, "«Поселенцы» on, the final age at the cap: none trained");
    const behind = applyStrategy(user, planStrategy(facts({ age: "AGE_MODERN", finalAge: true, cities: 3, settlements: 9, cap: 10 }), "SCIENCE"));
    assert.equal(behind.autopilot.trainSettlers, true, "below the cap: settlers trained (research/26 §3.3)");
    assert.deepEqual([behind.strategy.fillCap, behind.strategy.settleNear], [true, true]);
    const off = applyStrategy({ ...user, autopilot: { ...user.autopilot, settlers: false } }, planStrategy(facts({ age: "AGE_MODERN", finalAge: true, cities: 3, settlements: 9, cap: 10 }), "SCIENCE"));
    assert.equal(off.autopilot.trainSettlers, false, "«Поселенцы» off: never");
    assert.equal(applyStrategy(user, null), user, "no plan: the settings as they are");
});

test("the tab's tooltip says what the plan changes", () => {
    const keys = strategyLines(planStrategy(facts({ age: "AGE_MODERN", finalAge: true, cities: 4, settlements: 10, cap: 10 }), "SCIENCE")).map((l) => l.key);
    for (const k of ["RESERVE", "WONDERS_INNOVATION", "NO_EXPLORERS", "NO_SETTLERS", "UPGRADES_THREAT", "PEACE_ARMY", "CITIES_ONLY", "PADS"]) assert.ok(keys.includes(`LOC_XPL_AP_STRATEGY_TT_${k}`), k);
    const below = strategyLines(planStrategy(facts({ age: "AGE_MODERN", finalAge: true, cities: 4, settlements: 9, cap: 10 }), "SCIENCE")).map((l) => l.key);
    assert.ok(below.includes("LOC_XPL_AP_STRATEGY_TT_FILL_CAP") && !below.includes("LOC_XPL_AP_STRATEGY_TT_NO_SETTLERS"), JSON.stringify(below));
    assert.ok(strategyLines(planStrategy(facts({}), "SCIENCE")).some((l) => l.key === "LOC_XPL_AP_STRATEGY_TT_GROWTH"));
});

test("science Commit: towns may become cities until a city stands for every Launch Pad", () => {
    assert.equal(conversionRule({ cities: 3, towns: 2, minCities: 4 }).floor, true);
    assert.equal(conversionRule({ cities: 4, towns: 2, minCities: 4 }).floor, false);
});

const race = (o) => ({ cls: "CULTURE", scoring: "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION", enabled: true, goal: 1552, board: [{ id: 5, points: 1400 }, { id: 2, points: 388 }, { id: 0, points: 300 }], ...o });

test("watch: a culture leader at 90% of the game's dominance goal is DANGER; our need = leader × 1.15 ÷ multiple", () => {
    const [w] = victoryWatch([race({})], 0, { age: "AGE_MODERN", ageFrac: 0.1 });
    assert.deepEqual([w.level, w.multiple, w.need, w.ours, w.leader], ["DANGER", 4, 403, 300, 5]);
    assert.equal(victoryWatch([race({ board: [{ id: 5, points: 1000 }, { id: 2, points: 388 }] })], 0)[0].level, "WATCH", "64%");
    assert.equal(victoryWatch([race({ board: [{ id: 5, points: 500 }, { id: 2, points: 388 }] })], 0)[0].level, null, "32%");
    assert.equal(victoryWatch([race({ board: [{ id: 5, points: 500, dominant: true, turns: 3 }, { id: 2, points: 388 }] })], 0)[0].level, "DANGER", "its countdown runs");
    const lead = victoryWatch([race({ board: [{ id: 0, points: 1400 }, { id: 2, points: 388 }] })], 0);
    assert.ok(lead.every((w) => w.own), "we lead: nothing to block");
});

test("watch: in the final age a leader the next step would put near its goal is in danger now, its block judged at that step (game 31)", () => {
    // Game 31, Modern 41%: Augustus's culture 164 against 250 (×2 the second's 125) was a WATCH; at 60% ×1.5 brought a goal
    // of 187 he had passed by then, his countdown began, and he won five turns later.
    const g31 = (o = {}) => race({ goal: 250, board: [{ id: 5, points: 164 }, { id: 2, points: 125 }, { id: 0, points: 95 }], ...o });
    const [w] = victoryWatch([g31()], 0, { age: "AGE_MODERN", ageFrac: 0.41 });
    assert.deepEqual([w.level, w.step, w.stepGoal, w.need, w.goal], ["DANGER", 1.5, 187, 126, 250], "⌈164 × 1.15 ÷ 1.5⌉ = 126");
    // No step left (80% on), or not the final age: as before.
    const late = victoryWatch([g31({ goal: Math.floor(125 * 1.25) })], 0, { age: "AGE_MODERN", ageFrac: 0.85 })[0];
    assert.equal(late.step, null);
    const before = victoryWatch([g31()], 0, { age: "AGE_EXPLORATION", ageFrac: 0.9 })[0];
    assert.deepEqual([before.level, before.step, before.need], ["WATCH", null, 95]);
    // Already near the current goal: blocked now, at the current multiple (no step).
    const near = victoryWatch([g31({ board: [{ id: 5, points: 230 }, { id: 2, points: 125 }, { id: 0, points: 95 }] })], 0, { age: "AGE_MODERN", ageFrac: 0.41 })[0];
    assert.deepEqual([near.level, near.step, near.need], ["DANGER", null, 133]);
    // The culture overlay spends wonders only on a block within reach at that step: 95 of 126 is not (95 of 95 at ×2 was).
    const f = facts({ age: "AGE_MODERN", finalAge: true, ageFrac: 0.41, settlements: 5 });
    const calm = planStrategy(f, "SCIENCE");
    assert.equal(planStrategy(f, "SCIENCE", { watch: [w] }).wonders, calm.wonders);
    const [close] = victoryWatch([g31({ board: [{ id: 5, points: 164 }, { id: 2, points: 125 }, { id: 0, points: 100 }] })], 0, { age: "AGE_MODERN", ageFrac: 0.41 });
    assert.equal(planStrategy(f, "SCIENCE", { watch: [close] }).wonders, calm.wonders + 1, "100 of 126: within 30");
});

test("watch: our own countdown within reach is a CHANCE: our goal = the multiple × the best of the others (research/24 F2)", () => {
    const [own] = victoryWatch([race({ board: [{ id: 0, points: 1400 }, { id: 2, points: 388 }] })], 0);
    assert.deepEqual([own?.own, own?.level, own?.ours, own?.goal, own?.need], [true, "CHANCE", 1400, 1552, 152]);
    assert.deepEqual(victoryWatch([race({ board: [{ id: 0, points: 1200 }, { id: 2, points: 388 }] })], 0).filter((w) => w.own), [], "77%: not yet");
    const late = victoryWatch([race({ goal: -1, board: [{ id: 0, points: 500 }, { id: 2, points: 388 }] })], 0, { age: "AGE_MODERN", ageFrac: 0.9 }).find((w) => w.own);
    assert.deepEqual([late?.goal, late?.level, late?.multiple], [485, "CHANCE", 1.25], "no goal from the game: the table's multiple");
});

test("the final age: a rival's WATCH and our own CHANCE start the overlay; a military one settles the nearest site (research/24 F1, F2)", () => {
    const modern = facts({ age: "AGE_MODERN", finalAge: true, ageFrac: 0.7, cities: 3 });
    const watch = [{ cls: "MILITARY", level: "WATCH", leader: 5 }];
    const plan = planStrategy(modern, "SCIENCE", { watch });
    assert.deepEqual([plan.overlay, plan.trainSettlers, plan.settleNear], [["MILITARY"], true, true]);
    assert.equal(applyStrategy({ autopilot: { settlers: true } }, plan).strategy.settleNear, true);
    assert.equal(planStrategy(facts({ age: "AGE_EXPLORATION", ageFrac: 0.7, cities: 3 }), "SCIENCE", { watch }).overlay, undefined, "not the final age: WATCH waits");
    const own = planStrategy(modern, "SCIENCE", { watch: [{ cls: "CULTURE", level: "CHANCE", own: true }] });
    assert.deepEqual(own.overlay, ["CULTURE"], "our own culture countdown is worth pushing");
});

test("watch: no goal yet before mid-Exploration: no level; the table's multiple only as an estimate after 50%", () => {
    const early = victoryWatch([race({ goal: -1 })], 0, { age: "AGE_EXPLORATION", ageFrac: 0.3 })[0];
    assert.deepEqual([early.level, early.goal, early.multiple], [null, null, null]);
    const later = victoryWatch([race({ goal: -1 })], 0, { age: "AGE_EXPLORATION", ageFrac: 0.6 })[0];
    assert.deepEqual([later.goal, later.multiple], [388 * 6, 6]);
    assert.deepEqual([dominanceMultiple("AGE_EXPLORATION", 0.85), dominanceMultiple("AGE_MODERN", 0.3), dominanceMultiple("AGE_MODERN", 0.9), dominanceMultiple("AGE_ANTIQUITY", 0.9)], [4, 3, 1.25, null]);
});

test("culture victory off: no watch, so no overlay, even with a rival at 95% (decision 6)", () => {
    assert.deepEqual(victoryWatch([race({ enabled: false, board: [{ id: 5, points: 1480 }, { id: 2, points: 388 }] })], 0), []);
    assert.deepEqual(victoryWatch([science({ enabled: false })], 0), [], "science off: no watch either");
});

// Science is a fixed score, which nobody's score holds back: the watch read only dominance races, so a rival two turns from
// winning the science victory gave no entry (game 27: Xerxes's countdown ran M97-M102).
const science = (o) => ({ cls: "SCIENCE", scoring: "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE", enabled: true, goal: 100, board: [{ id: 3, points: 103, dominant: true, turns: 2 }, { id: 0, points: 86 }, { id: 2, points: 60 }], ...o });

test("watch: a rival in its science countdown is DANGER with its turns left; near 100 Innovation a WATCH; ours near it a CHANCE", () => {
    const w = victoryWatch([science({})], 0).find((x) => !x.own);
    assert.deepEqual([w?.cls, w?.leader, w?.level, w?.countdown, w?.points, w?.goal, w?.need, w?.ours], ["SCIENCE", 3, "DANGER", 2, 103, 100, null, 86]);
    const near = victoryWatch([science({ board: [{ id: 3, points: 70 }, { id: 0, points: 40 }] })], 0);
    assert.deepEqual(near.map((x) => [x.leader, x.level, x.countdown]), [[3, "WATCH", null]], "70 of 100");
    const first = victoryWatch([science({ board: [{ id: 2, points: 110 }, { id: 3, points: 101, dominant: true, turns: 1 }, { id: 0, points: 50 }] })], 0)[0];
    assert.deepEqual([first.leader, first.countdown], [3, 1], "the countdown that ends first, not the most points");
    const own = victoryWatch([science({ board: [{ id: 0, points: 90 }, { id: 3, points: 40 }] })], 0).find((x) => x.own);
    assert.deepEqual([own?.level, own?.need], ["CHANCE", 10]);
});

test("a rival near a culture win: one more wonder, any kind, worth more, explorers allowed, no Future Tech, in a science game", () => {
    const f = facts({ ageFrac: 0.5, settlements: 5 });
    // We hold 380 of the 403 that block it (within 30 points): worth wonders.
    const close = [race({ board: [{ id: 5, points: 1400 }, { id: 2, points: 388 }, { id: 0, points: 380 }] })];
    const watch = victoryWatch(close, 0, { age: "AGE_MODERN", ageFrac: 0.1 });
    const calm = planStrategy(f, "SCIENCE");
    const plan = planStrategy(f, "SCIENCE", { watch });
    assert.deepEqual([plan.wonders, plan.wonderKind, plan.explorers, plan.denyWonders, plan.noFutureTech], [calm.wonders + 1, "ANY", true, true, true]);
    assert.ok(strategyLines(plan).some((l) => l.key === "LOC_XPL_AP_STRATEGY_TT_BLOCK_CULTURE"));
    // 300 of 403 (game 16: 97 of about 255): out of reach, no wonders spent on it; Future Tech still held back.
    const far = planStrategy(f, "SCIENCE", { watch: victoryWatch([race({})], 0, { age: "AGE_MODERN", ageFrac: 0.1 }) });
    assert.deepEqual([far.wonders, far.wonderKind, far.denyWonders, far.noFutureTech], [calm.wonders, calm.wonderKind, undefined, true]);
    assert.ok(!strategyLines(far).some((l) => l.key === "LOC_XPL_AP_STRATEGY_TT_BLOCK_CULTURE"));
    // The final push: Launch Pad cities stay out of wonders even when a block is within reach.
    const commit = facts({ age: "AGE_MODERN", finalAge: true, ageFrac: 0.1, cities: 4, settlements: 8, cap: 10, gate: { open: true, progress: 1 } });
    assert.equal(planStrategy(commit, "SCIENCE", { watch }).padCitiesNoWonders, true);
    assert.deepEqual(planStrategy(f, "CULTURE", { watch }).overlay, undefined, "our own victory: nothing to block");
    const econ = planStrategy(f, "SCIENCE", { watch: [{ cls: "ECONOMIC", level: "DANGER" }] });
    assert.ok(econ.goals.includes("GDP"));
    // Game 32: a Port bought for 972 against Franklin's economy when ours was 878 of the 3,270 that would block him.
    const econAt = (ours, need) => planStrategy(f, "SCIENCE", { watch: [{ cls: "ECONOMIC", level: "DANGER", ours, need }] }).goals.includes("GDP");
    assert.deepEqual([econAt(878, 3270), econAt(950, 1000)], [false, true], "only a block within 15% of ours");
    const war = planStrategy(facts({ age: "AGE_MODERN", finalAge: true, cities: 3 }), "SCIENCE", { watch: [{ cls: "MILITARY", level: "DANGER" }] });
    assert.equal(war.trainSettlers, true, "settlements count for a military rival's score");
});

test("science's final push: no Launch Pad bank while Rocketry cannot come in time (research/22 B3: game 7, Rocketry at turn 59 of 61)", () => {
    const f = (eta, turnsLeft) => facts({ age: "AGE_MODERN", finalAge: true, cities: 4, gate: { open: false, known: true, progress: 0.3, eta }, turnsLeft });
    const late = planStrategy(f(60, 55), "SCIENCE");
    assert.equal(late.gateLate, true);
    assert.ok(!late.goals.includes("PADS"), JSON.stringify(late.goals));
    const soon = planStrategy(f(20, 55), "SCIENCE");
    assert.equal(soon.gateLate, false);
    assert.ok(soon.goals.includes("PADS"));
});

test("Rocketry late stays late until its estimate is clearly back in time (research/24 P8: PADS ↔ LEVER on every tech pick)", () => {
    const f = (eta) => facts({ age: "AGE_MODERN", finalAge: true, cities: 4, gate: { open: false, known: true, progress: 0.3, eta }, turnsLeft: 55 });
    assert.equal(planStrategy(f(44), "SCIENCE").gateLate, false, "44 ≤ 55 - 10");
    const late = { phase: "COMMIT", age: "AGE_MODERN", gateLate: true };
    assert.equal(planStrategy(f(44), "SCIENCE", { previous: late }).gateLate, true, "was late: 4 more turns needed");
    assert.equal(planStrategy(f(40), "SCIENCE", { previous: late }).gateLate, false);
    assert.equal(planStrategy(f(44), "SCIENCE", { previous: { ...late, age: "AGE_EXPLORATION" } }).gateLate, false, "another age");
});

// research/26 §3.3: game 11 ended with our military 55 to the leader's 60 (goal 68 = ⌊1.24 × our 55⌋).
const MIL = (o) => ({ cls: "MILITARY", scoring: "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION", enabled: true, goal: 68, board: [{ id: 3, points: 60 }, { id: 0, points: 55 }, { id: 4, points: 40 }], ...o });

test("military outlook: settlements (4 points each) to our own countdown, at the next step's multiple; Operation Ivy (25) when it counts", () => {
    const late = { age: "AGE_MODERN", ageFrac: 0.85 };
    let o = militaryOutlook(MIL({}), 0, { ...late, room: 5 });
    assert.deepEqual([o.goal, o.need, o.reachable, o.withIvy], [74, 5, true, false], "⌊60 × 68/55⌋ = 74: 19 short, 5 settlements");
    o = militaryOutlook(MIL({}), 0, { ...late, room: 4 });
    assert.deepEqual([o.need, o.reachable], [5, false], "4 free slots: out of reach");
    o = militaryOutlook(MIL({}), 0, { ...late, room: 4, ivy: true });
    assert.deepEqual([o.needIvy, o.reachable, o.withIvy], [0, true, true], "Operation Ivy's 25 closes it");
    // Half way through Modern (2×) the next step (60%) brings 1.5×: judged at 1.5.
    assert.equal(nextDominanceMultiple("AGE_MODERN", 0.5), 1.5);
    assert.equal(nextDominanceMultiple("AGE_MODERN", 0.85), null);
    assert.equal(nextDominanceMultiple("AGE_EXPLORATION", 0.5), null, "the final age only");
    o = militaryOutlook(MIL({ goal: 110 }), 0, { age: "AGE_MODERN", ageFrac: 0.5, room: 9 });
    assert.deepEqual([o.multiple, o.goal, o.need, o.reachable], [1.5, 90, 9, true], "2× (110) is out of reach: ⌊60 × 1.5⌋ = 90, 35 short");
    // Game 31, Modern 60%: ours 66, the best other 49, the goal 73 at ×1.5; two settlements start our countdown now, where
    // waiting for ×1.25 (61: none needed) lost to a rival's countdown begun at that same step.
    const g31 = { cls: "MILITARY", enabled: true, goal: 73, board: [{ id: 0, points: 66 }, { id: 5, points: 49 }, { id: 4, points: 40 }] };
    o = militaryOutlook(g31, 0, { age: "AGE_MODERN", ageFrac: 0.61, room: 2 });
    assert.deepEqual([o.multiple, o.goal, o.need, o.reachable], [1.49, 73, 2, true], "now, at ×1.5");
    o = militaryOutlook(g31, 0, { age: "AGE_MODERN", ageFrac: 0.61, room: 1 });
    assert.deepEqual([o.multiple, o.goal, o.need, o.reachable], [1.25, 61, 0, true], "out of reach now: the next step's");
    assert.equal(militaryOutlook(MIL({ board: [{ id: 0, points: 55 }] }), 0, { ...late, room: 5 }), null, "nobody else scores");
});

test("watch: the military lever is our own CHANCE with the settlements it takes; without the final age's room, as before", () => {
    const late = { age: "AGE_MODERN", ageFrac: 0.85 };
    assert.equal(victoryWatch([MIL({})], 0, late).find((w) => w.own), undefined, "55 of 74 alone: no chance");
    const w = victoryWatch([MIL({})], 0, { ...late, military: { room: 5, ivy: false } }).find((x) => x.own);
    assert.deepEqual([w?.cls, w?.level, w?.settlements, w?.ours, w?.goal], ["MILITARY", "CHANCE", 5, 55, 74]);
    assert.equal(victoryWatch([MIL({})], 0, { ...late, military: { room: 2, ivy: false } }).find((x) => x.own), undefined, "2 free slots: not within reach");
    assert.equal(victoryWatch([MIL({})], 0, { ...late, military: { room: 2, ivy: true } }).find((x) => x.own)?.withIvy, true);
});

test("the military lever: settlers first (the first savings goal), Operation Ivy only when it is needed", () => {
    const f = facts({ age: "AGE_MODERN", finalAge: true, ageFrac: 0.85, cities: 5, towns: 6, settlements: 11, cap: 16, gate: { open: true, progress: 1 } });
    const watch = victoryWatch([MIL({})], 0, { age: "AGE_MODERN", ageFrac: 0.85, military: { room: 5, ivy: false } });
    const plan = planStrategy(f, "SCIENCE", { watch });
    assert.deepEqual([plan.militaryLever, plan.ivy, plan.trainSettlers, plan.settleNear, plan.goals[0]], [true, false, true, true, "SETTLER"]);
    assert.ok(strategyLines(plan).some((l) => l.key === "LOC_XPL_AP_STRATEGY_TT_MILITARY_LEVER"));
    const ivy = planStrategy(f, "SCIENCE", { watch: victoryWatch([MIL({})], 0, { age: "AGE_MODERN", ageFrac: 0.85, military: { room: 2, ivy: true } }) });
    assert.equal(ivy.ivy, true);
    const s = applyStrategy({ autopilot: { settlers: true } }, plan);
    assert.deepEqual([s.strategy.militaryLever, s.strategy.ivy, s.strategy.goals[0]], [true, false, "SETTLER"]);
    assert.equal(planStrategy(f, "SCIENCE", { watch: [] }).militaryLever, undefined, "no lever without it");
});

test("past the cap: the lever founds settlements past it when its room falls short (research/30 §1: one countdown turn is 1000 score)", () => {
    const late = { age: "AGE_MODERN", ageFrac: 0.85 };
    let o = militaryOutlook(MIL({}), 0, { ...late, room: 3, over: 2 });
    assert.deepEqual([o.need, o.reachable, o.pastCap, o.withIvy], [5, true, 2, false], "5 needed: 3 under the cap, 2 past it");
    o = militaryOutlook(MIL({}), 0, { ...late, room: 2, over: 2 });
    assert.deepEqual([o.reachable, o.pastCap], [false, 0], "4 at most");
    o = militaryOutlook(MIL({}), 0, { ...late, room: 4, over: 2, ivy: true });
    assert.deepEqual([o.reachable, o.withIvy, o.pastCap], [true, true, 0], "Operation Ivy under the cap first");
    const w = victoryWatch([MIL({})], 0, { ...late, military: { room: 3, over: 2, ivy: false } }).find((x) => x.own);
    assert.deepEqual([w?.settlements, w?.pastCap], [5, 2]);
    const f = facts({ age: "AGE_MODERN", finalAge: true, ageFrac: 0.85, cities: 5, towns: 6, settlements: 13, cap: 16, gate: { open: true, progress: 1 } });
    const plan = planStrategy(f, "SCIENCE", { watch: [w] });
    assert.deepEqual([plan.militaryLever, plan.pastCap], [true, 2]);
    assert.ok(strategyLines(plan).some((l) => l.key === "LOC_XPL_AP_STRATEGY_TT_PAST_CAP" && l.args[0] === 2));
    assert.equal(applyStrategy({ autopilot: { settlers: true } }, plan).strategy.pastCap, 2);
});

test("the score's places: 1 + those strictly ahead in each race switched on, and the points that share the next place (research/30 §1: 923 = 1000 − 10 × (1 + 1 + 6) + 3)", () => {
    const race = (cls, board, enabled = true) => ({ cls, enabled, board: board.map(([id, points]) => ({ id, points })) });
    assert.deepEqual(scorePlaces([
        race("MILITARY", [[0, 80], [2, 74], [1, 60]]),
        race("ECONOMIC", [[1, 3992], [3, 3945], [4, 2000], [2, 1500], [5, 1440], [0, 1430]]),
        race("SCIENCE", [[0, 61], [3, 23], [1, 23]]),
        race("CULTURE", [[1, 500], [0, 10]], false),
    ], 0), [
        { cls: "MILITARY", place: 1, of: 3, gap: null },
        { cls: "ECONOMIC", place: 6, of: 6, gap: 10 },
        { cls: "SCIENCE", place: 1, of: 3, gap: null },
    ]);
    // Ties share a place (everyone has 970 on the first turn).
    assert.deepEqual(scorePlaces([race("SCIENCE", [[1, 0], [0, 0]])], 0), [{ cls: "SCIENCE", place: 1, of: 2, gap: null }]);
});

test("blocking a military countdown: the settlements that would hold the score the block needs; the final age's overlay founds anywhere the game allows (research/31 §3: game 25)", () => {
    // Ashoka 73 in his countdown; we are second with 55: his goal is ⌊1.24 × ours⌋.
    const race = MIL({ board: [{ id: 3, points: 73, dominant: true, turns: 5 }, { id: 0, points: 55 }, { id: 4, points: 40 }] });
    const w = victoryWatch([race], 0, { age: "AGE_MODERN", ageFrac: 0.85 }).find((x) => !x.own && x.cls === "MILITARY");
    assert.deepEqual([w.need, w.block], [68, 4], "⌈73 × 1.15 ÷ (68/55)⌉ = 68: 13 short, 4 settlements");
    const f = facts({ age: "AGE_MODERN", finalAge: true, ageFrac: 0.85, cities: 5, towns: 7, settlements: 12, cap: 16 });
    const plan = planStrategy(f, "SCIENCE", { watch: [w] });
    assert.equal(applyStrategy({ autopilot: { settlers: true } }, plan).strategy.settleAnywhere, true);
    // Not before the final age.
    const early = planStrategy(facts({ age: "AGE_EXPLORATION", ageFrac: 0.7, settlements: 8, cap: 10, cities: 4, towns: 4 }), "SCIENCE", { watch: [w] });
    assert.equal(applyStrategy({ autopilot: { settlers: true } }, early).strategy.settleAnywhere, false);
    // Our own military countdown within reach (the lever) founds anywhere too.
    const lever = victoryWatch([MIL({})], 0, { age: "AGE_MODERN", ageFrac: 0.85, military: { room: 5, over: 0, ivy: false } }).find((x) => x.own);
    assert.equal(applyStrategy({ autopilot: { settlers: true } }, planStrategy(f, "SCIENCE", { watch: [lever] })).strategy.settleAnywhere, true);
    // Not a block: a culture or economic race has no settlements.
    assert.equal(victoryWatch([{ ...race, cls: "CULTURE" }], 0, { age: "AGE_MODERN", ageFrac: 0.85 }).find((x) => !x.own)?.block, undefined);
});

// Research/34 §6: game 28 had only the science victory on; the final push still filled the settlement cap (10 → 16 of 17,
// one lost), 30 city-turns of settlers, and its capital trained Tanks for two new settlements.
test("the final push fills the settlement cap only while settlements score (the military or the score victory on)", () => {
    const modern = (o) => facts({ age: "AGE_MODERN", ageFrac: 0.1, finalAge: true, settlements: 10, cap: 17, cities: 6, towns: 4, ...o });
    const on = planStrategy(modern({}), "SCIENCE");
    assert.deepEqual([on.trainSettlers, on.fillCap, on.settleNear], [true, true, true], "as before");
    const off = planStrategy(modern({ settlementsScore: false }), "SCIENCE");
    assert.deepEqual([off.trainSettlers, off.fillCap, off.settleNear], [false, false, false], "10 of 17: past half the cap");
    assert.equal(planStrategy(modern({ settlementsScore: false, settlements: 6 }), "SCIENCE").trainSettlers, true, "6 of 17: below half");
    assert.equal(planStrategy(modern({ settlementsScore: false, settlements: 6, gate: { open: false, progress: 0.7 } }), "SCIENCE").trainSettlers, false, "Rocketry near: none");
});

// Research/35: cities a science or economic empire aims at before the final age (a video's model of the 1.4 rules).
test("the city target by age: Antiquity 5, Exploration 6 then 8, none in the final age nor for culture", () => {
    const at = (age, ageFrac, focus = "SCIENCE", o = {}) => planStrategy(facts({ age, ageFrac, ...o }), focus).cityTarget;
    assert.equal(at("AGE_ANTIQUITY", 0.3), 5);
    assert.deepEqual([at("AGE_EXPLORATION", 0.2), at("AGE_EXPLORATION", 0.6)], [6, 8]);
    assert.equal(at("AGE_EXPLORATION", 0.6, "ECONOMIC"), 8);
    assert.equal(at("AGE_EXPLORATION", 0.6, "CULTURE"), 0);
    assert.equal(at("AGE_MODERN", 0.2, "SCIENCE", { finalAge: true }), 0);
    assert.equal(applyStrategy({ autopilot: {} }, planStrategy(facts({ age: "AGE_ANTIQUITY", ageFrac: 0.3 }), "SCIENCE")).strategy.cityTarget, 5);
});
