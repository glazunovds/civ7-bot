// The Autopilot tab's redesign (game 60's review, step 2: UI-1, UI-4 to UI-9, M2), on the panel's own HTML in a small fake
// DOM (tests/fakes/fake-dom.mjs). Game 60: 28 checkboxes, 5 dropdowns and 6 sliders in one column pushed the log ~17rem below
// the visible bottom; the log kept 80 entries, newest first, rebuilt and thrown back to the top on every entry; «Охота на
// рейдеров» and «Охота на деревни» stood ticked while «Оборона» was off; the dropdowns showed 2 turns and 1 wonder while the
// phase used other values on 59 and 81 of 140 turns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { installFakeDom } from "./fakes/fake-dom.mjs";

const A = { x: 8, y: 8 };
const world = {
    width: 20, height: 20, wrapX: false,
    tiles: (x, y) => ({ terrain: "TERRAIN_FLAT", yields: { YIELD_FOOD: 2 }, owner: Math.abs(x - A.x) <= 2 && Math.abs(y - A.y) <= 2 ? 0 : -1 }),
    structures: (x, y) => (x === A.x && y === A.y ? { district: "DISTRICT_CITY_CENTER", constructibles: ["BUILDING_PALACE"] } : { district: null, constructibles: [] }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: A.x, y: A.y, name: "Athens", pop: 5, prod: 10, queue: { type: "BUILDING_MONUMENT", turns: 3 } }],
    gold: 0,
    units: [],
};
installFakeEngine(world);
const { parseHtml, userToggle, userSelect, click } = installFakeDom();
const { AutopilotTab } = await import("../mod/expansion-planner/ui/panel/xpl-tab-autopilot.js");
const autopilot = await import("../mod/expansion-planner/ui/hud/xpl-autopilot.js");
const { AP_GROUPS, AP_OPTIONS, optionDefaults } = await import("../mod/expansion-planner/ui/core/xpl-ap-options.js");
const { settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");

const html = readFileSync(fileURLToPath(new URL("../mod/expansion-planner/ui/panel/xpl-panel.html", import.meta.url)), "utf-8");
const css = readFileSync(fileURLToPath(new URL("../mod/expansion-planner/ui/panel/xpl-panel.css", import.meta.url)), "utf-8");
const block = (h) => h.slice(h.indexOf('<div class="xpl-tab xpl-tab--autopilot'), h.indexOf('<div class="xpl-tab xpl-tab--empire'));
const frames = async (n = 8) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

/** A fresh tab on the panel's HTML, shown, with the default options (the last one closed, as the panel closes). */
let current = null;
function openTab(o = {}) {
    current?.detach();
    settings.patch({ autopilot: { ...optionDefaults(), ui: { view: "LOG", logFilter: "MAIN", open: Object.fromEntries(AP_GROUPS.map((g) => [g.id, false])) }, ...o } });
    state.set({ autopilot: { enabled: false, running: false, log: [] } });
    const root = parseHtml(block(html)).firstChild;
    const tab = new AutopilotTab(root);
    tab.initialize();
    tab.attach();
    tab.show();
    current = tab;
    return { tab, root, q: (s) => root.querySelector(s), qa: (s) => root.querySelectorAll(s) };
}
const groupEl = (root, id) => root.querySelector(`.xpl-ap-group--${id}`);
const itemEl = (root, key) => root.querySelector(`.xpl-ap-item--${key}`);
const chips = (root, key) => itemEl(root, key).querySelectorAll(".xpl-chip").map((c) => c.textContent);

test("UI-1: the tab is a top bar over two panes, each with one fill scrollable; no option control in the HTML", () => {
    const b = block(html);
    // The options are built from the spec (tests/ap-options.test.mjs: the HTML names none of them).
    assert.ok(!/<fxs-(checkbox|dropdown|slider)/.test(b), "no option control in the HTML");
    const root = parseHtml(b).firstChild;
    for (const pane of [".xpl-ap-pane--settings", ".xpl-ap-pane--log"]) {
        const p = root.querySelector(pane);
        assert.ok(p, pane);
        assert.equal(p.querySelectorAll("fxs-scrollable").length, 1, `${pane}: one scrollable`);
        assert.ok(p.querySelector("fxs-scrollable").classList.contains("xpl-scroll--fill"), `${pane}: it fills the pane`);
    }
    assert.equal(root.querySelectorAll("fxs-scrollable").length, 2);
    // The log follows its end the game's way (the multiplayer chat's).
    assert.equal(root.querySelector(".xpl-ap-pane--log fxs-scrollable").getAttribute("scroll-on-resize-when-bottom"), "true");
    // The top bar: status, what holds the turn, the step, the switch; the intro is the status's tooltip (UI-9).
    const top = root.querySelector(".xpl-ap-top");
    assert.ok(top.querySelector(".xpl-ap-status") && top.querySelector(".xpl-ap-blocker") && top.querySelector(".xpl-ap-now") && top.querySelector(".xpl-ap-toggle"));
    assert.equal(top.querySelector(".xpl-ap-state").getAttribute("data-tooltip-content"), "LOC_XPL_AP_INTRO");
    assert.ok(!/data-l10n-id="LOC_XPL_AP_(INTRO|UNITS_TITLE|AI_NOTE)"/.test(b), "no static notes inline");
    // Side by side in the large frame (the switch hidden there), one pane at a time in the compact one.
    assert.match(css, /\.xpl-frame--large \.xpl-ap-pane--off \{ display: flex; \}/);
    assert.match(css, /\.xpl-ap-pane--off \{ display: none; \}/);
    assert.match(css, /\.xpl-frame--large \.xpl-ap-switch \{ display: none; \}/);
    assert.match(css, /\.xpl-frame--large \.xpl-ap-pane--settings \{[^}]*width: 55%;/);
    // UI-9: the footer only while Detailed Map Tacks is missing; the version by the title.
    assert.match(html, /<div class="xpl-title-box">\s*<div class="xpl-title font-title" data-l10n-id="LOC_XPL_TITLE"><\/div>\s*<div class="xpl-version"><\/div>/);
    assert.match(html, /<div class="xpl-footer hidden">\s*<div class="xpl-status"><\/div>\s*<\/div>/);
});

test("UI-4: the groups are built from the spec, collapsible, each item once, a master over the checks (none for the wars)", async () => {
    const { root } = openTab();
    const groups = root.querySelectorAll(".xpl-ap-group");
    assert.deepEqual(groups.map((g) => g.querySelector(".xpl-ap-group__title").getAttribute("data-l10n-id")), AP_GROUPS.map((g) => g.label));
    for (const o of AP_OPTIONS) {
        const it = root.querySelectorAll(`.xpl-ap-item--${o.key}`);
        assert.equal(it.length, 1, o.key);
        assert.ok(groupEl(root, o.group).querySelector(`.xpl-ap-item--${o.key}`), `${o.key} in ${o.group}`);
        // M2: the short tip on the row, the full text under «?».
        assert.equal(it[0].querySelector(".xpl-ap-item__line").getAttribute("data-tooltip-content"), o.tip, o.key);
        assert.equal(it[0].querySelector(".xpl-ap-details").getAttribute("data-l10n-id"), o.details, o.key);
        assert.equal(it[0].querySelector(o.kind === "check" ? "fxs-checkbox" : "fxs-dropdown") !== null, true, o.key);
    }
    assert.ok(itemEl(root, "wonders").classList.contains("xpl-ap-item--d1"));
    assert.ok(itemEl(root, "maxWonders").classList.contains("xpl-ap-item--d2"));
    // The wars: «Всё выкл.», no master; the others a master.
    assert.equal(groupEl(root, "wars").querySelector(".xpl-ap-master"), null);
    assert.ok(groupEl(root, "wars").querySelector(".xpl-ap-all-off"));
    for (const g of AP_GROUPS.filter((x) => !x.noMaster)) assert.ok(groupEl(root, g.id).querySelector(".xpl-ap-master fxs-checkbox"), g.id);
    // The units' groups say so (the old «Юниты» title).
    assert.deepEqual(groups.filter((g) => g.querySelector(".xpl-chip--units")).map((g) => g.className.match(/xpl-ap-group--(\w+)/)[1]), ["expansion", "defence", "wars"]);
    // Collapsed by default; a click on the header (its sign too: the click bubbles) opens it, once, and it is remembered.
    const items = groupEl(root, "economy").querySelector(".xpl-ap-group__items");
    assert.ok(items.classList.contains("hidden"));
    click(groupEl(root, "economy").querySelector("fxs-minus-plus"));
    assert.ok(!items.classList.contains("hidden"));
    assert.equal(settings.get().autopilot.ui.open.economy, true);
    assert.equal(groupEl(root, "economy").querySelector("fxs-minus-plus").getAttribute("type"), "minus");
    // The master's own click never opens or closes the group.
    userToggle(groupEl(root, "economy").querySelector(".xpl-ap-master fxs-checkbox"));
    assert.ok(!items.classList.contains("hidden"));
    // «?» opens the full text under its item.
    const help = itemEl(root, "defend").querySelector(".xpl-ap-help");
    click(help);
    assert.ok(!itemEl(root, "defend").querySelector(".xpl-ap-details").classList.contains("hidden"));
    click(help);
    assert.ok(itemEl(root, "defend").querySelector(".xpl-ap-details").classList.contains("hidden"));
    // Kept when the panel opens again.
    const again = openTab({ ui: settings.get().autopilot.ui });
    assert.ok(!groupEl(again.root, "economy").querySelector(".xpl-ap-group__items").classList.contains("hidden"));
    assert.ok(groupEl(again.root, "choices").querySelector(".xpl-ap-group__items").classList.contains("hidden"));
});

test("UI-4: the master toggles its whole group; a mixed group shows its bar; boxes set from code change nothing (gotcha 8)", () => {
    const { root } = openTab();
    let patches = 0;
    const off = settings.subscribe(() => patches++);
    try {
        const head = groupEl(root, "choices");
        const master = head.querySelector(".xpl-ap-master fxs-checkbox");
        // Defaults: diplomacy off, the rest on.
        assert.equal(master.getAttribute("selected"), "false");
        assert.ok(head.querySelector(".xpl-ap-master").classList.contains("xpl-ap-master--mixed"));
        assert.equal(head.querySelector(".xpl-ap-group__count").textContent, "5/6");
        // A click on a mixed master: all on, one patch, the items follow (their forced changes ignored).
        userToggle(master);
        const o = settings.get().autopilot;
        assert.deepEqual(["research", "choices", "closePopups", "befriend", "diplomacy", "resources"].map((k) => o[k]), Array(6).fill(true));
        assert.equal(patches, 1, "one patch, none from the boxes set from code");
        assert.equal(itemEl(root, "diplomacy").querySelector("fxs-checkbox").getAttribute("selected"), "true");
        assert.ok(!head.querySelector(".xpl-ap-master").classList.contains("xpl-ap-master--mixed"));
        assert.equal(head.querySelector(".xpl-ap-group__count").textContent, "6/6");
        // One item off: the master is unticked from code (mixed), and that forced change switches nothing else off.
        userToggle(itemEl(root, "diplomacy").querySelector("fxs-checkbox"));
        assert.equal(master.getAttribute("selected"), "false");
        assert.deepEqual(["research", "choices", "closePopups", "befriend", "diplomacy", "resources"].map((k) => settings.get().autopilot[k]), [true, true, true, true, false, true]);
        assert.ok(head.querySelector(".xpl-ap-master").classList.contains("xpl-ap-master--mixed"));
        assert.equal(patches, 2);
        userToggle(itemEl(root, "diplomacy").querySelector("fxs-checkbox"));
        assert.equal(master.getAttribute("selected"), "true");
        patches = 0;
        // Again: all off.
        userToggle(master);
        assert.deepEqual(["research", "choices", "diplomacy"].map((k) => settings.get().autopilot[k]), [false, false, false]);
        assert.equal(patches, 1);
        // One item back on: mixed again.
        userToggle(itemEl(root, "research").querySelector("fxs-checkbox"));
        assert.equal(settings.get().autopilot.research, true);
        assert.ok(head.querySelector(".xpl-ap-master").classList.contains("xpl-ap-master--mixed"));
        assert.equal(master.getAttribute("selected"), "false");
        // The wars: «Всё выкл.» switches them off and only off.
        settings.patch({ autopilot: { defend: true, offensive: true, nuclear: true } });
        groupEl(root, "wars").querySelector(".xpl-ap-all-off").dispatchEvent({ type: "action-activate" });
        assert.deepEqual(["offensive", "trainingWar", "nuclear", "nuclearCities", "defend"].map((k) => settings.get().autopilot[k]), [false, false, false, false, true]);
        assert.equal(groupEl(root, "wars").querySelector(".xpl-ap-all-off").getAttribute("disabled"), "true", "nothing left to switch off");
        // A dropdown: the pick is saved; its index set from code sends nothing.
        userSelect(itemEl(root, "replanEvery").querySelector("fxs-dropdown"), 1);
        assert.equal(settings.get().autopilot.replanEvery, 1);
    } finally {
        off();
    }
});

test("UI-5 and UI-7: an option waiting for another is dimmed with a chip and stays editable; the phase's values show", async () => {
    const { root } = openTab();
    // The hunts are ticked by default while «Оборона» is not.
    assert.ok(itemEl(root, "huntRaiders").classList.contains("xpl-ap-item--dim"));
    assert.deepEqual(chips(root, "huntRaiders"), ["LOC_XPL_AP_NEEDS_DEFEND"]);
    assert.deepEqual(chips(root, "nuclear"), ["LOC_XPL_AP_NEEDS_DEFEND"], "unticked: the chip, not dimmed");
    assert.ok(!itemEl(root, "nuclear").classList.contains("xpl-ap-item--dim"));
    // Still editable: a click stores it.
    userToggle(itemEl(root, "huntRaiders").querySelector("fxs-checkbox"));
    assert.equal(settings.get().autopilot.huntRaiders, false);
    userToggle(itemEl(root, "huntRaiders").querySelector("fxs-checkbox"));
    userToggle(itemEl(root, "defend").querySelector("fxs-checkbox"));
    assert.ok(!itemEl(root, "huntRaiders").classList.contains("xpl-ap-item--dim"));
    assert.deepEqual(chips(root, "huntRaiders"), []);
    // A hint only while the autopilot is off.
    assert.deepEqual(chips(root, "endTurn"), ["LOC_XPL_AP_WHEN_ON"]);
    // The phase replaces the reserve and the wonders while the strategy runs.
    settings.patch({ autopilot: { focus: true } });
    state.set({ autopilot: { ...state.get().autopilot, enabled: true, strategy: { phase: "GROWTH", focus: "CULTURE", reserveTurns: 1, wonders: 2, lines: [] } } });
    await frames();
    assert.deepEqual(chips(root, "reserveTurns"), ["LOC_XPL_AP_PHASE_RESERVE(1)"]);
    assert.deepEqual(chips(root, "maxWonders"), ["LOC_XPL_AP_PHASE_WONDERS(2)"]);
    assert.ok(itemEl(root, "reserveTurns").classList.contains("xpl-ap-item--dim"));
    assert.equal(itemEl(root, "reserveTurns").querySelector(".xpl-chip--phase").getAttribute("data-tooltip-content"), "LOC_XPL_AP_PHASE_TT");
    assert.deepEqual(chips(root, "endTurn"), [], "the autopilot is on");
    assert.equal(itemEl(root, "reserveTurns").querySelector("fxs-dropdown").getAttribute("selected-item-index"), "2", "the player's own value stays");
    settings.patch({ autopilot: { strategy: false } });
    assert.deepEqual(chips(root, "reserveTurns"), []);
});

test("UI-8: the generals' line in the defence group's header", async () => {
    const { root } = openTab();
    const line = groupEl(root, "defence").querySelector(".xpl-ap-group__line");
    assert.ok(line.classList.contains("hidden"), "nothing before the unit step");
    state.set({ autopilot: { ...state.get().autopilot, generals: [{ role: "VANGUARD", level: 2, xp: 34, next: 45 }], fieldOp: { kind: "HUNT", stage: "GATHER" } } });
    await frames();
    assert.ok(!line.classList.contains("hidden"));
    assert.equal(line.textContent, "LOC_XPL_AP_GENERAL_ENTRY(LOC_XPL_AP_ROLE_VANGUARD,2,34,45) · LOC_XPL_AP_FIELD_LINE(LOC_XPL_AP_FIELD_HUNT,LOC_XPL_AP_STAGE_GATHER)");
});

test("UI-6: the log appends its new rows once a frame, oldest first, a header per turn, the threats in one row; filters", async () => {
    const { root } = openTab();
    const log = root.querySelector(".xpl-ap-log");
    const rows = () => log.children.map((c) => c.getAttribute("data-l10n-id"));
    assert.deepEqual(rows(), ["LOC_XPL_AP_LOG_EMPTY"]);
    const e = (seq, turn, key, ...args) => ({ seq, turn, key, args });
    const put = (list) => state.set({ autopilot: { ...state.get().autopilot, log: list } });
    let entries = [e(2, 1, "UNITS_SKIPPED", 1), e(1, 1, "BOUGHT", "Athens", "Monument")];
    put(entries);
    put(entries); // several state changes in a frame: one render
    await frames();
    assert.deepEqual(rows(), ["LOC_XPL_AP_LOG_TURN(1)", "LOC_XPL_AP_BOUGHT(Athens,Monument)"], "«Главное» hides the routine");
    const first = log.children[1];
    entries = [e(4, 2, "THREAT", "Athens", 3), e(3, 2, "ERROR", "boom"), ...entries];
    put(entries);
    await frames();
    assert.deepEqual(rows(), ["LOC_XPL_AP_LOG_TURN(1)", "LOC_XPL_AP_BOUGHT(Athens,Monument)", "LOC_XPL_AP_LOG_TURN(2)", "LOC_XPL_AP_ERROR(boom)", "LOC_XPL_AP_THREATS(Athens 3)"]);
    assert.equal(log.children[1], first, "appended: the rows shown stay as they are");
    assert.ok(log.children[3].classList.contains("xpl-ap-log-row--error"));
    // The turn's next threats update its row in place.
    const threats = log.children[4];
    put([e(5, 2, "THREAT", "Sparta", 1), e(6, 2, "THREAT", "Athens", 4), ...entries]);
    await frames();
    assert.equal(log.children[4], threats);
    assert.equal(threats.getAttribute("data-l10n-id"), "LOC_XPL_AP_THREATS(Athens 4, Sparta 1)");
    // «Всё» shows the routine; «Ошибки» only the errors.
    const byFilter = (f) => root.querySelectorAll(".xpl-ap-filter").find((b) => b.getAttribute("data-filter") === f);
    click(byFilter("ALL"));
    assert.equal(settings.get().autopilot.ui.logFilter, "ALL");
    assert.ok(byFilter("ALL").classList.contains("xpl-ap-seg--on"));
    assert.ok(rows().includes("LOC_XPL_AP_UNITS_SKIPPED(1)"));
    click(byFilter("ERRORS"));
    assert.deepEqual(rows(), ["LOC_XPL_AP_LOG_TURN(2)", "LOC_XPL_AP_ERROR(boom)"]);
});

test("UI-6: the hud keeps 300 entries, each numbered in the order recorded", async () => {
    world.turnSent = true; // off our turn: each step is refused with one entry
    state.set({ autopilot: { ...state.get().autopilot, log: [] } });
    const quiet = ["log", "info", "warn"].map((k) => [k, console[k]]);
    for (const [k] of quiet) console[k] = () => {};
    try {
        for (let i = 0; i < 320; i++) await autopilot.stepNow();
    } finally {
        world.turnSent = false;
        for (const [k, fn] of quiet) console[k] = fn;
    }
    const log = state.get().autopilot.log;
    assert.equal(autopilot.LOG_MAX, 300);
    assert.equal(log.length, 300);
    assert.ok(log.every((x) => x.key === "STEP_NOT_YOUR_TURN"));
    assert.ok(log.every((x, i) => i === 0 || x.seq === log[i - 1].seq - 1), "newest first, numbered in order");
});

test("UI-1: the compact frame's switch shows one pane at a time; the victory box opens and closes above the log", async () => {
    const { root } = openTab();
    const settingsPane = root.querySelector(".xpl-ap-pane--settings");
    const logPane = root.querySelector(".xpl-ap-pane--log");
    assert.ok(settingsPane.classList.contains("xpl-ap-pane--off") && !logPane.classList.contains("xpl-ap-pane--off"), "the log by default");
    click(root.querySelectorAll(".xpl-ap-view").find((b) => b.getAttribute("data-view") === "SETTINGS"));
    assert.equal(settings.get().autopilot.ui.view, "SETTINGS");
    assert.ok(!settingsPane.classList.contains("xpl-ap-pane--off") && logPane.classList.contains("xpl-ap-pane--off"));
    // The victory box: its header names the focus and the phase.
    const head = root.querySelector(".xpl-ap-focus-head");
    assert.ok(head.classList.contains("hidden"), "no focus yet");
    state.set({ autopilot: { ...state.get().autopilot, focus: { cls: "CULTURE", races: [], watch: [] }, strategy: { phase: "GROWTH", focus: "CULTURE", lines: [] } } });
    await frames();
    assert.equal(head.textContent, "– LOC_XPL_AP_FOCUS_HEAD(LOC_XPL_FOCUS_CULTURE) · LOC_XPL_AP_PHASE_GROWTH");
    const box = root.querySelector(".xpl-ap-focus-box");
    assert.ok(!box.classList.contains("hidden"));
    click(head);
    assert.ok(box.classList.contains("hidden"));
    assert.equal(settings.get().autopilot.ui.open.focusBox, false);
});
