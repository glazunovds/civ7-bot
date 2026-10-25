// The autopilot's option spec (game 60's review, UI-4/UI-5): one list of keys, defaults, groups, text keys and what each option
// needs. The settings, the tab and the panel's HTML read the same keys; a pass acts on `effectiveOptions` (an option whose needs
// are off acts as off); the end-of-pass round runs only for what the options handle; F7 is a second input action of ours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The settings save to localStorage (the game's): an in-memory one here.
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const root = new URL("../mod/expansion-planner/", import.meta.url);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, root)), "utf-8");
const { AP_GROUPS, AP_OPTIONS, blockedBy, blockerKind, blockerText, effectiveOptions, isOptionOn, optionDefaults, optionKeys, optionOf, settles, strategyOverride } = await import("../mod/expansion-planner/ui/core/xpl-ap-options.js");
const { chipKeys } = await import("../mod/expansion-planner/ui/core/xpl-ap-view.js");
const { DEFAULT_SETTINGS, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { HOTKEY_ACTION, HOTKEY_WINDOW_EVENT, STEP_ACTION, STEP_WINDOW_EVENT, hotkeyEvent } = await import("../mod/expansion-planner/ui/core/xpl-constants.js");
const { TACK_REFRESH_TURNS, tackRefreshMode, untackedFirsts } = await import("../mod/expansion-planner/ui/core/xpl-tack-refresh.js");

test("the spec has every option the settings keep, with the defaults they had", () => {
    // The defaults before the spec (xpl-settings.js before game 60's review).
    const before = { research: true, production: true, wonders: true, maxWonders: 1, growth: true, towns: true, purchases: true, choices: true, closePopups: true, befriend: true, tacks: true, focus: false, strategy: true, victory: "AUTO", resources: true, diplomacy: false, roam: false, explore: false, settlers: false, defend: false, offensive: false, huntVillages: true, huntRaiders: true, trainingWar: false, nuclear: false, nuclearCities: false, merchants: false, skipUnits: false, endTurn: false, resumeAfterAge: true, biasOpen: false, reserveTurns: 2, replanEvery: 5, aiTurns: 5, lastHumanPlayer: -1 };
    // `ui`: the tab's own (the compact frame's view, the log's filter, the open groups: core/xpl-ap-view.js).
    assert.deepEqual({ ...DEFAULT_SETTINGS.autopilot }, { ...before, ui: { view: "LOG", logFilter: "MAIN", open: {} } });
    const hidden = new Set(["biasOpen", "lastHumanPlayer", "ui"]);
    assert.deepEqual(Object.keys(before).filter((k) => !hidden.has(k)).sort(), optionKeys().sort());
    assert.deepEqual(optionDefaults(), Object.fromEntries(Object.entries(before).filter(([k]) => !hidden.has(k))));
    // Each key once, each in a known group, every group used.
    assert.equal(new Set(optionKeys()).size, AP_OPTIONS.length);
    const groups = new Set(AP_GROUPS.map((g) => g.id));
    for (const o of AP_OPTIONS) assert.ok(groups.has(o.group), o.key);
    for (const g of groups) assert.ok(AP_OPTIONS.some((o) => o.group === g), g);
    // What an option needs is an option.
    for (const o of AP_OPTIONS) for (const k of [...(o.needs ?? []), ...(o.needsAny ?? []).flat()]) assert.ok(optionOf(k), `${o.key} needs ${k}`);
});

test("the settings sanitize every check of the spec as a boolean, and the tab's own settings", () => {
    settings.patch({ autopilot: { huntRaiders: "yes", nuclear: 0, defend: 1, ui: { view: "MAP", logFilter: "ERRORS", open: { wars: true, nope: true, economy: 1 } } } });
    try {
        const o = settings.get().autopilot;
        assert.deepEqual([o.huntRaiders, o.nuclear, o.defend], [true, false, true]);
        for (const k of optionKeys("check")) assert.equal(typeof o[k], "boolean", k);
        assert.deepEqual(o.ui, { view: "LOG", logFilter: "ERRORS", open: { wars: true } });
        // A group opened later merges into the others (settings.patch merges deeply).
        settings.patch({ autopilot: { ui: { open: { defence: true } } } });
        assert.deepEqual(settings.get().autopilot.ui.open, { wars: true, defence: true });
    } finally {
        settings.patch({ autopilot: { huntRaiders: true, nuclear: false, defend: false, ui: { view: "LOG", logFilter: "MAIN" } } });
    }
});

// M2: the old tooltips ran to 2,383 characters (FOCUS_TT), 11 of 35 over 700, against the game's tooltip box of about 50
// Cyrillic characters a line (tooltip-controller.js: maxWidth 21.333rem): a short tip each, the full text under «?».
test("the options' text keys: a label, a short tip of at most 300 characters and the full text, in both languages", () => {
    const en = read("text/en_us/InGameText.xml");
    const ru = read("text/ru_ru/InGameText.xml");
    const text = (xml, open, key) => xml.match(new RegExp(`${open.replace("KEY", key)}\\s*<Text>([\\s\\S]*?)</Text>`))?.[1] ?? null;
    for (const o of AP_OPTIONS) {
        assert.equal(o.tip, `LOC_XPL_AP_${o.name}_TIP`, o.key);
        assert.match(o.details, /^LOC_XPL_AP_[A-Z_]+_TT$/, o.key);
        for (const [lang, xml, open] of [["en", en, '<Row Tag="KEY">'], ["ru", ru, '<Replace Tag="KEY" Language="ru_RU">']]) {
            const tip = text(xml, open, o.tip);
            const details = text(xml, open, o.details);
            assert.ok(tip, `${lang} ${o.tip}`);
            assert.ok(tip.length <= 300, `${lang} ${o.tip}: ${tip.length} characters`);
            assert.ok(details && details.length >= tip.length * 0.5, `${lang} ${o.details}`);
        }
    }
    // The panel's HTML holds none of them: the tab builds every option from the spec (tests/autopilot-tab.test.mjs).
    const html = read("ui/panel/xpl-panel.html");
    assert.ok(!/xpl-ap-(research|defend|nuclear)\b/.test(html) && !/LOC_XPL_AP_[A-Z_]+_LABEL/.test(html));
});

test("every text key the spec, the groups and the input actions name is in both languages", () => {
    const en = read("text/en_us/InGameText.xml");
    const ru = read("text/ru_ru/InGameText.xml");
    const input = read("config/input.xml");
    const keys = [
        ...AP_OPTIONS.flatMap((o) => [o.label, o.tip, o.details]),
        ...AP_GROUPS.map((g) => g.label),
        ...chipKeys(),
        // The tab's own (step 2: UI-1, UI-4, UI-6, UI-8).
        "LOC_XPL_AP_MOVES_UNITS", "LOC_XPL_AP_MASTER_TT", "LOC_XPL_AP_ALL_OFF", "LOC_XPL_AP_ALL_OFF_TT", "LOC_XPL_AP_DETAILS_TT", "LOC_XPL_AP_PHASE_TT",
        "LOC_XPL_AP_VIEW_SETTINGS", "LOC_XPL_AP_VIEW_LOG", "LOC_XPL_AP_FOCUS_HEAD", "LOC_XPL_AP_LOG_TURN", "LOC_XPL_AP_THREATS",
        "LOC_XPL_AP_LOG_FILTER_MAIN", "LOC_XPL_AP_LOG_FILTER_ALL", "LOC_XPL_AP_LOG_FILTER_ERRORS", "LOC_XPL_AP_LOG_FILTER_TT",
        "LOC_XPL_AP_GENERAL_ENTRY", "LOC_XPL_AP_ROLE_VANGUARD", "LOC_XPL_AP_ROLE_BASTION", "LOC_XPL_AP_ROLE_NONE", "LOC_XPL_AP_GENERALS_NONE", "LOC_XPL_AP_GENERALS_TT",
        "LOC_XPL_AP_FIELD_HUNT", "LOC_XPL_AP_FIELD_RAIDERS", "LOC_XPL_AP_FIELD_WAR", "LOC_XPL_AP_FIELD_LINE", "LOC_XPL_AP_STAGE_GATHER", "LOC_XPL_AP_STAGE_FIGHT",
        ...[...input.matchAll(/(?:Name|Description)="(LOC_[A-Z_]+)"/g)].map((m) => m[1]),
        "LOC_XPL_AP_BLOCKED_FREE", "LOC_XPL_AP_BLOCKED_HOLDS", "LOC_XPL_AP_BLOCKED_PRODUCTION", "LOC_XPL_AP_BLOCKED_RESEARCH", "LOC_XPL_AP_BLOCKED_CITIZEN", "LOC_XPL_AP_BLOCKED_UNITS",
        "LOC_XPL_AP_STEP_DONE", "LOC_XPL_AP_STEP_BUSY", "LOC_XPL_AP_STEP_NOT_YOUR_TURN", "LOC_XPL_AP_STEP_AI", "LOC_XPL_AP_STATUS_STEPPING",
        "LOC_XPL_DOCK_STEP_DONE", "LOC_XPL_DOCK_STEP_BUSY", "LOC_XPL_DOCK_STEP_NOT_YOUR_TURN", "LOC_XPL_DOCK_STEP_AI", "LOC_XPL_AP_SETTLER_DROPPED",
    ];
    for (const k of keys) {
        assert.ok(en.includes(`<Row Tag="${k}">`), `en ${k}`);
        assert.ok(ru.includes(`<Replace Tag="${k}" Language="ru_RU">`), `ru ${k}`);
    }
    // «Оборона» is the option's name in the game too (the docs called it so; the label said «Армия: стрелять или укрепиться»).
    assert.match(ru, /<Replace Tag="LOC_XPL_AP_DEFEND_LABEL" Language="ru_RU">\s*<Text>Оборона: армия защищает поселения<\/Text>/);
    assert.ok(!/стрелять или укреп/.test(ru) && !/shoot or fortify/.test(en), "no tooltip names the old label");
});

test("effectiveOptions: what needs «Оборона», «Ядерное оружие», «Фокус на победу» or «Производство» acts as off without it", () => {
    const o = { ...optionDefaults() };
    // Defaults: the hunts are ticked, «Оборона» is not.
    const e = effectiveOptions(o);
    assert.deepEqual([e.huntRaiders, e.huntVillages, o.huntRaiders], [false, false, true], "the stored value is kept");
    assert.deepEqual([e.strategy, o.strategy], [false, true], "strategy needs the victory focus");
    const on = effectiveOptions({ ...o, defend: true, focus: true });
    assert.deepEqual([on.huntRaiders, on.huntVillages, on.strategy], [true, true, true]);
    // Nuclear weapons need «Оборона», the strikes on cities both.
    assert.equal(effectiveOptions({ ...o, nuclear: true }).nuclear, false);
    assert.equal(effectiveOptions({ ...o, nuclear: true, defend: true }).nuclear, true);
    assert.equal(effectiveOptions({ ...o, nuclear: true, nuclearCities: true }).nuclearCities, false);
    assert.equal(effectiveOptions({ ...o, defend: true, nuclearCities: true }).nuclearCities, false);
    assert.equal(effectiveOptions({ ...o, defend: true, nuclear: true, nuclearCities: true }).nuclearCities, true);
    for (const k of ["offensive", "trainingWar"]) {
        assert.equal(effectiveOptions({ ...o, [k]: true })[k], false, k);
        assert.equal(effectiveOptions({ ...o, [k]: true, defend: true })[k], true, k);
    }
    // Inside production: the wonders and the recalculation (never, 0).
    const noProd = effectiveOptions({ ...o, production: false });
    assert.deepEqual([noProd.wonders, noProd.replanEvery, noProd.maxWonders], [false, 0, 1]);
    // The tacks: the plan's (production, recalculated) or the settlers'.
    assert.equal(effectiveOptions({ ...o, production: false }).tacks, false);
    assert.equal(effectiveOptions({ ...o, production: false, settlers: true }).tacks, true);
    assert.equal(effectiveOptions({ ...o, replanEvery: 0 }).tacks, false);
    assert.equal(effectiveOptions({ ...o, replanEvery: 0, settlers: true }).tacks, true);
    // A missing value is its default (as the hud reads `!== false`), and keys outside the spec stay.
    assert.equal(effectiveOptions({ nuclear: true }).nuclear, false);
    assert.equal(effectiveOptions({ explorers: true, trainSettlers: false }).explorers, true);
    assert.equal(isOptionOn({}, "production"), true);
    assert.equal(isOptionOn({}, "focus"), false);
});

test("blockedBy names what an option waits for", () => {
    const o = optionDefaults();
    assert.equal(blockedBy(o, "offensive"), "defend");
    assert.equal(blockedBy({ ...o, defend: true }, "offensive"), null);
    assert.equal(blockedBy(o, "nuclearCities"), "nuclear");
    assert.equal(blockedBy({ ...o, nuclear: true }, "nuclearCities"), "defend");
    assert.equal(blockedBy({ ...o, production: false }, "tacks"), "production");
    assert.equal(blockedBy({ ...o, production: false, settlers: true }, "tacks"), null);
    assert.equal(blockedBy({ ...o, production: false }, "maxWonders"), "production", "the root: the wonders are ticked");
    assert.equal(blockedBy({ ...o, wonders: false }, "maxWonders"), "wonders");
    assert.equal(blockedBy(o, "victory"), "focus");
    assert.equal(blockedBy(o, "research"), null);
    // Only while the autopilot is on: a hint, never blocked.
    assert.deepEqual(AP_OPTIONS.filter((x) => x.whenOn).map((x) => x.key), ["closePopups", "endTurn"]);
});

test("the strategy's phase values replace the reserve and the wonders only while it runs", () => {
    const o = { ...optionDefaults(), focus: true };
    const plan = { reserveTurns: 1, wonders: 2 };
    assert.equal(strategyOverride("reserveTurns", o, plan), 1);
    assert.equal(strategyOverride("maxWonders", o, plan), 2);
    assert.equal(strategyOverride("reserveTurns", { ...o, strategy: false }, plan), null);
    assert.equal(strategyOverride("reserveTurns", { ...o, focus: false }, plan), null);
    assert.equal(strategyOverride("reserveTurns", o, null), null);
    assert.equal(strategyOverride("replanEvery", o, plan), null);
});

test("the end-of-pass round runs for what the options handle, never for the age's choices", () => {
    const o = optionDefaults();
    assert.equal(blockerKind("NOTIFICATION_CHOOSE_CIVILIZATION"), "AGE");
    assert.equal(settles("NOTIFICATION_CHOOSE_CIVILIZATION", o), false, "the age is over: the player's");
    assert.equal(settles("NOTIFICATION_AGE_TRANSITION", o), false, "the dedications: the player's");
    assert.equal(settles(null, o), false);
    assert.equal(settles("NOTIFICATION_CHOOSE_CITY_PRODUCTION", o), true);
    assert.equal(settles("NOTIFICATION_CHOOSE_CITY_PRODUCTION", { ...o, production: false }), false);
    assert.equal(settles("NOTIFICATION_CHOOSE_TECH", { ...o, research: false }), false);
    assert.equal(settles("NOTIFICATION_NEW_POPULATION", o), true);
    assert.equal(settles("NOTIFICATION_CHOOSE_BELIEF", o), true, "a choice");
    assert.equal(settles("NOTIFICATION_CHOOSE_BELIEF", { ...o, choices: false }), false);
    assert.equal(settles("NOTIFICATION_COMMAND_UNITS", o), false, "no unit option");
    assert.equal(settles("NOTIFICATION_COMMAND_UNITS", { ...o, focus: true }), false, "the focus orders no waiting unit");
    assert.equal(settles("NOTIFICATION_COMMAND_UNITS", { ...o, explore: true }), true);
    assert.equal(settles("NOTIFICATION_COMMAND_UNITS", { ...o, skipUnits: true }), true);
    // A step or a watched pass: the units waiting are mostly the player's, which only skipping releases.
    const attended = { endsTurn: false };
    assert.equal(settles("NOTIFICATION_COMMAND_UNITS", { ...o, explore: true, defend: true }, attended), false);
    assert.equal(settles("NOTIFICATION_COMMAND_UNITS", { ...o, skipUnits: true }, attended), true);
    assert.equal(settles("NOTIFICATION_CHOOSE_CITY_PRODUCTION", o, attended), true, "the rest as on the automatic pass");
    assert.equal(settles("NOTIFICATION_CHOOSE_BELIEF", o, attended), true);
    assert.equal(settles("NOTIFICATION_AGE_TRANSITION", o, attended), false);
});

test("what holds the turn, in the game's words when it has them", () => {
    const compose = (k, ...a) => (a.length ? `${k}(${a.join(",")})` : k);
    assert.equal(blockerText(null, compose), "LOC_XPL_AP_BLOCKED_FREE");
    assert.equal(blockerText({ type: null }, compose), "LOC_XPL_AP_BLOCKED_FREE");
    assert.equal(blockerText({ type: "NOTIFICATION_CHOOSE_CITY_PRODUCTION", message: "LOC_NOTIFICATION_CHOOSE_CITY_PRODUCTION_MESSAGE" }, compose), "LOC_XPL_AP_BLOCKED_HOLDS(LOC_NOTIFICATION_CHOOSE_CITY_PRODUCTION_MESSAGE)");
    assert.equal(blockerText({ type: "NOTIFICATION_CHOOSE_CITY_PRODUCTION" }, compose), "LOC_XPL_AP_BLOCKED_HOLDS(LOC_XPL_AP_BLOCKED_PRODUCTION)");
    assert.equal(blockerText({ type: "NOTIFICATION_CHOOSE_BELIEF" }, compose), "LOC_XPL_AP_BLOCKED_HOLDS(NOTIFICATION_CHOOSE_BELIEF)");
});

// UI-2: F7 is an input action of ours, like F8: no context constraint (the panel holds the Dual context; the base game's
// Input.xml says an action missing from that table is allowed everywhere), a key the game and the mods we know leave free.
test("config/input.xml: F8 and F7, both without a context constraint, each mapped to its window event; F7 is free in the game", () => {
    const xml = read("config/input.xml");
    assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>\s*<Database>[\s\S]*<\/Database>\s*$/);
    const rows = (table) => [...(xml.match(new RegExp(`<${table}>([\\s\\S]*?)</${table}>`))?.[1] ?? "").matchAll(/<Row ([^>]*?)\s*\/>/g)]
        .map((m) => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
    assert.deepEqual(rows("InputActions").map((r) => [r.ActionId, r.DeviceType]), [[HOTKEY_ACTION, "Keyboard"], [STEP_ACTION, "Keyboard"]]);
    assert.deepEqual(rows("InputActionDefaultGestures").map((r) => [r.ActionId, r.GestureType, r.GestureData]), [[HOTKEY_ACTION, "KBMouse", "KEY_F8"], [STEP_ACTION, "KBMouse", "KEY_F7"]]);
    assert.ok(!/InputContextConstraints/.test(xml), "no context constraint");
    assert.equal(hotkeyEvent(HOTKEY_ACTION), HOTKEY_WINDOW_EVENT);
    assert.equal(hotkeyEvent(STEP_ACTION), STEP_WINDOW_EVENT);
    assert.equal(hotkeyEvent("open-rankings"), null);
    assert.equal(hotkeyEvent("toString"), null);
    const game = "D:/SteamLibrary/steamapps/common/Sid Meier's Civilization VII/Base/modules/core/config/Input.xml";
    if (existsSync(game)) {
        const used = new Set([...readFileSync(game, "utf-8").matchAll(/GestureType="KBMouse" GestureData="([^"]+)"/g)].map((m) => m[1]));
        for (const r of rows("InputActionDefaultGestures")) assert.ok(!used.has(r.GestureData), `${r.GestureData} is the game's`);
    }
});

test("tack refresh: full renewal at most every 5 turns while unattended (or when asked), else only the missing ones", () => {
    assert.equal(TACK_REFRESH_TURNS, 5);
    assert.equal(tackRefreshMode({ unattended: false, turn: 10, last: 9 }), "FULL", "the player watches");
    assert.equal(tackRefreshMode({ unattended: true, turn: 10, last: -Infinity }), "FULL", "none this session");
    assert.equal(tackRefreshMode({ unattended: true, turn: 10, last: 9 }), "ADD");
    assert.equal(tackRefreshMode({ unattended: true, turn: 14, last: 10 }), "ADD");
    assert.equal(tackRefreshMode({ unattended: true, turn: 15, last: 10 }), "FULL");
    assert.equal(tackRefreshMode({ unattended: true, turn: 11, last: 10, asked: true }), "FULL");
    assert.equal(tackRefreshMode({ unattended: true, turn: 3, last: 10 }), "FULL", "an earlier save");
    const p = [{ sid: "a", type: "X" }, { sid: "a", type: "Y" }, { sid: "b", type: "Z" }, { sid: "c", type: "W" }, { sid: "c", type: "V" }];
    // a: its second building has a tack; b: none; c: its first has one.
    const tacked = new Set(["Y", "W"]);
    assert.deepEqual(untackedFirsts(p, (x) => tacked.has(x.type)).map((x) => x.type), ["Z"]);
});
