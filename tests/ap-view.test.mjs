// The Autopilot tab's view model (game 60's review, UI-4 to UI-8): the groups' items and depths, the master checkbox's state
// and patch, each item's dimming and chips, the generals' line, and the log's rows (oldest first, a header per turn, a turn's
// threats in one row, filtered) with the rows to change between two renders. Pure: core/xpl-ap-view.js.
import { test } from "node:test";
import assert from "node:assert/strict";

const { AP_GROUPS, AP_OPTIONS, optionDefaults } = await import("../mod/expansion-planner/ui/core/xpl-ap-options.js");
const view = await import("../mod/expansion-planner/ui/core/xpl-ap-view.js");
const { chipKeys, generalsLine, groupItems, groupPatch, groupState, isOpen, itemView, logCategory, logRows, reconcileRows, sanitizeApUi } = view;

const compose = (k, ...a) => (a.length ? `${k}(${a.join(",")})` : k);

test("the groups: the task's seven, every option once, a dependent item one step under what it needs", () => {
    assert.deepEqual(AP_GROUPS.map((g) => g.id), ["choices", "economy", "victory", "expansion", "defence", "wars", "turn"]);
    const all = AP_GROUPS.flatMap((g) => groupItems(g.id).map((i) => i.key));
    assert.deepEqual([...all].sort(), AP_OPTIONS.map((o) => o.key).sort());
    const depth = Object.fromEntries(AP_GROUPS.flatMap((g) => groupItems(g.id).map((i) => [i.key, i.depth])));
    assert.deepEqual(
        [depth.production, depth.wonders, depth.maxWonders, depth.tacks, depth.purchases, depth.reserveTurns, depth.victory, depth.strategy, depth.defend, depth.roam, depth.huntRaiders, depth.offensive, depth.nuclearCities, depth.replanEvery],
        [0, 1, 2, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0],
        "an item needing one of another group stays at the top (the wars need «Оборона»; the recalculation needs «Производство»)",
    );
    // The groups that move units, and the one without a master.
    assert.deepEqual(AP_GROUPS.filter((g) => g.movesUnits).map((g) => g.id), ["expansion", "defence", "wars"]);
    assert.deepEqual(AP_GROUPS.filter((g) => g.noMaster).map((g) => g.id), ["wars"]);
});

test("the master checkbox: on, off or mixed over the group's checks, and a click sets them all", () => {
    const o = optionDefaults();
    // Decisions by default: research, choices, popups, befriend and resources on; diplomacy off.
    assert.deepEqual(groupState(o, "choices"), { on: 5, total: 6, state: "MIXED" });
    assert.deepEqual(groupState({ ...o, diplomacy: true }, "choices").state, "ON");
    assert.deepEqual(groupState(o, "wars"), { on: 0, total: 4, state: "OFF" });
    // A missing value counts as its default (as the hud reads it).
    assert.deepEqual(groupState({}, "expansion"), { on: 0, total: 3, state: "OFF" });
    assert.deepEqual(groupPatch("choices", true), { research: true, choices: true, closePopups: true, befriend: true, diplomacy: true, resources: true });
    assert.deepEqual(groupPatch("economy", false), { production: false, wonders: false, tacks: false, growth: false, towns: false, purchases: false }, "checks only: the choices keep their values");
    // The wars: never all switched on from here (off by default by the user's choice), only off.
    assert.deepEqual(groupPatch("wars", true), {});
    assert.deepEqual(groupPatch("wars", false), { offensive: false, trainingWar: false, nuclear: false, nuclearCities: false });
    assert.deepEqual(groupPatch("nope", true), {});
});

test("an item: dimmed with a chip while what it needs is off, editable; the phase's value; the hints", () => {
    const o = optionDefaults();
    // The hunts are ticked by default while «Оборона» is not: they look on and do nothing.
    assert.deepEqual(itemView(o, "huntRaiders"), { stored: true, blocked: "defend", dim: true, chips: [{ key: "LOC_XPL_AP_NEEDS_DEFEND", args: [], kind: "NEEDS" }] });
    assert.deepEqual(itemView({ ...o, defend: true }, "huntRaiders").chips, []);
    // Unticked, it waits too, but does not look on.
    const nuke = itemView(o, "nuclear");
    assert.deepEqual([nuke.dim, nuke.chips.map((c) => c.key)], [false, ["LOC_XPL_AP_NEEDS_DEFEND"]]);
    // The root of a chain: the wonders at once wait for production when the wonders are ticked.
    assert.equal(itemView({ ...o, production: false }, "maxWonders").chips[0].key, "LOC_XPL_AP_NEEDS_PRODUCTION");
    assert.equal(itemView({ ...o, production: false }, "maxWonders").dim, true, "a choice no pass reads");
    assert.equal(itemView({ ...o, production: false }, "tacks").chips[0].key, "LOC_XPL_AP_NEEDS_ANY_TACKS");
    assert.equal(itemView({ ...o, production: false, settlers: true }, "tacks").chips.length, 0);
    // The phase replaces the reserve and the wonders (UI-7): its value as a chip, the player's own kept.
    const focused = { ...o, focus: true };
    const strategy = { reserveTurns: 1, wonders: 2 };
    assert.deepEqual(itemView(focused, "reserveTurns", { strategy }), { stored: 2, blocked: null, dim: true, chips: [{ key: "LOC_XPL_AP_PHASE_RESERVE", args: [1], kind: "PHASE" }] });
    assert.deepEqual(itemView(focused, "maxWonders", { strategy }).chips, [{ key: "LOC_XPL_AP_PHASE_WONDERS", args: [2], kind: "PHASE" }]);
    assert.deepEqual(itemView({ ...focused, strategy: false }, "reserveTurns", { strategy }).chips, [], "the strategy off: the player's");
    // Only while the autopilot is on: a hint while it is off, never dimmed.
    assert.deepEqual(itemView(o, "endTurn"), { stored: false, blocked: null, dim: false, chips: [{ key: "LOC_XPL_AP_WHEN_ON", args: [], kind: "HINT" }] });
    assert.deepEqual(itemView(o, "endTurn", { autopilotOn: true }).chips, []);
    assert.equal(itemView(o, "resumeAfterAge").chips[0].key, "LOC_XPL_AP_NOTE_AGE_END");
    assert.equal(itemView(o, "nope"), null);
    // Every chip the tab may show has a key (both languages: tests/ap-options.test.mjs).
    assert.deepEqual(chipKeys().sort(), ["LOC_XPL_AP_NEEDS_ANY_TACKS", "LOC_XPL_AP_NEEDS_DEFEND", "LOC_XPL_AP_NEEDS_FOCUS", "LOC_XPL_AP_NEEDS_NUCLEAR", "LOC_XPL_AP_NEEDS_PRODUCTION", "LOC_XPL_AP_NEEDS_PURCHASES", "LOC_XPL_AP_NEEDS_WONDERS", "LOC_XPL_AP_NOTE_AGE_END", "LOC_XPL_AP_PHASE_RESERVE", "LOC_XPL_AP_PHASE_WONDERS", "LOC_XPL_AP_WHEN_ON"]);
});

test("the generals' line (UI-8): role, level, XP toward the next level, the operation under way", () => {
    const generals = [{ role: "VANGUARD", level: 2, xp: 34, next: 45 }, { role: "BASTION", level: 1, xp: 3, next: 7 }];
    assert.equal(generalsLine(generals, { kind: "RAIDERS", stage: "FIGHT" }, compose),
        "LOC_XPL_AP_GENERAL_ENTRY(LOC_XPL_AP_ROLE_VANGUARD,2,34,45) · LOC_XPL_AP_GENERAL_ENTRY(LOC_XPL_AP_ROLE_BASTION,1,3,7) · LOC_XPL_AP_FIELD_LINE(LOC_XPL_AP_FIELD_RAIDERS,LOC_XPL_AP_STAGE_FIGHT)");
    assert.equal(generalsLine([{ role: null, level: null, xp: 0, next: 15 }], null, compose), "LOC_XPL_AP_GENERAL_ENTRY(LOC_XPL_AP_ROLE_NONE,?,0,15)");
    assert.equal(generalsLine([], null, compose), "LOC_XPL_AP_GENERALS_NONE");
    assert.equal(generalsLine(undefined, null, compose), "", "before the unit step ran");
});

// Entries as the hud keeps them: newest batch first, each batch in its own order, numbered by `seq`.
const entry = (seq, turn, key, ...args) => ({ seq, turn, key, args });

test("the log: oldest first, a header per turn, a turn's threats in one row, filtered", () => {
    const log = [
        entry(6, 2, "TURN_ENDED"),
        entry(4, 2, "THREAT", "Тула", 4),
        entry(5, 2, "THREAT", "Москва", 1),
        entry(1, 1, "BOUGHT", "Monument"),
        entry(2, 1, "ERROR", "boom"),
        entry(3, 1, "UNITS_SKIPPED", 2),
        entry(7, 2, "THREAT", "Тула", 5),
    ];
    const main = logRows(log, "MAIN");
    assert.deepEqual(main.map((r) => r.id), ["T1:0", "E1", "E2", "T2:0", "H2:0"], "routine hidden");
    assert.deepEqual(main.find((r) => r.kind === "THREATS").threats, [["Тула", 5], ["Москва", 1]], "each settlement's last count, in first order");
    assert.deepEqual(logRows(log, "ALL").map((r) => r.id), ["T1:0", "E1", "E2", "E3", "T2:0", "H2:0", "E6"]);
    assert.deepEqual(logRows(log, "ERRORS").map((r) => r.id), ["T1:0", "E2"], "a turn with nothing shown has no header");
    assert.deepEqual(logRows([], "MAIN"), []);
    // An earlier save loaded: the same turn again is another run.
    assert.deepEqual(logRows([entry(2, 5, "BOUGHT"), entry(1, 5, "BOUGHT"), entry(3, 4, "BOUGHT"), entry(4, 5, "BOUGHT")], "ALL").map((r) => r.id), ["T5:0", "E1", "E2", "T4:0", "E3", "T5:1", "E4"]);
    // Categories.
    assert.deepEqual(["TURN_ENDED", "UNITS_SKIPPED", "REPLANNED", "TACKS", "HEAL", "FORTIFY"].map(logCategory), Array(6).fill("ROUTINE"));
    assert.deepEqual(["ERROR", "BLOCKED", "END_TURN_REFUSED", "STEP_NOT_YOUR_TURN", "AGE_OVER", "AGE_START_SCIENCE"].map(logCategory), Array(6).fill("ERROR"));
    assert.deepEqual(["BOUGHT", "THREAT", "STEP_DONE", "TOWN_CONVERTED"].map(logCategory), Array(4).fill("MAIN"));
});

test("the log's rows between two renders: appended at the bottom, removed at the top, threats updated in place", () => {
    const shown = (rows) => rows.map((r) => ({ id: r.id, text: r.text }));
    const a = [{ id: "T1:0", text: "t1" }, { id: "E1", text: "a" }, { id: "E2", text: "b" }];
    // New entries at the bottom: appended.
    assert.deepEqual(reconcileRows(shown(a), [...a, { id: "T2:0", text: "t2" }, { id: "E3", text: "c" }]), { reset: false, remove: [], update: [], append: [{ id: "T2:0", text: "t2" }, { id: "E3", text: "c" }] });
    // The oldest trimmed (LOG_MAX), a new one appended; the turn's header stays.
    assert.deepEqual(reconcileRows(shown(a), [{ id: "T1:0", text: "t1" }, { id: "E2", text: "b" }, { id: "E3", text: "c" }]), { reset: false, remove: ["E1"], update: [], append: [{ id: "E3", text: "c" }] });
    // The turn's threats row changes its text in place.
    const b = [...a, { id: "H1:0", text: "threats: A 1" }];
    assert.deepEqual(reconcileRows(shown(b), [...a, { id: "H1:0", text: "threats: A 2" }]).update, [{ id: "H1:0", text: "threats: A 2" }]);
    // A row between the kept ones, an order changed, or nothing kept: rebuilt.
    assert.deepEqual(reconcileRows(shown(a), [{ id: "T1:0", text: "t1" }, { id: "X", text: "x" }, { id: "E1", text: "a" }]), { reset: true });
    assert.deepEqual(reconcileRows(shown(a), [{ id: "E1", text: "a" }, { id: "T1:0", text: "t1" }]), { reset: true });
    assert.deepEqual(reconcileRows(shown(a), [{ id: "E9", text: "z" }]), { reset: true });
    assert.deepEqual(reconcileRows([], [{ id: "E1", text: "a" }]), { reset: true });
});

test("the tab's own settings: the view, the log's filter, the open groups; junk drops to the defaults", () => {
    assert.deepEqual(sanitizeApUi(undefined), { view: "LOG", logFilter: "MAIN", open: {} });
    assert.deepEqual(sanitizeApUi({ view: "SETTINGS", logFilter: "ERRORS", open: { wars: true, choices: false, focusBox: false, nope: true, defence: "yes" } }),
        { view: "SETTINGS", logFilter: "ERRORS", open: { wars: true, choices: false, focusBox: false } });
    assert.deepEqual(sanitizeApUi({ view: "MAP", logFilter: "SOME" }), { view: "LOG", logFilter: "MAIN", open: {} });
    // Groups start closed, the victory box open.
    assert.equal(isOpen({}, "economy"), false);
    assert.equal(isOpen({}, "focusBox"), true);
    assert.equal(isOpen({ open: { economy: true, focusBox: false } }, "economy"), true);
    assert.equal(isOpen({ open: { focusBox: false } }, "focusBox"), false);
});
