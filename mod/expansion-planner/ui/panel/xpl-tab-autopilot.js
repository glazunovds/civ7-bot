/**
 * Autopilot tab (game 60's review, UI-1 to UI-9). A fixed top bar: what the autopilot does and what holds the turn,
 * «Следующий шаг (F7)» and «Включить»; the gold line; then the settings and the log, each in its own fill scrollable: side by
 * side in the large frame, one at a time in the compact one («Настройки | Журнал»).
 * - Settings: the option spec's groups (core/xpl-ap-options.js) built here, each collapsible (fxs-minus-plus, as the city
 *   details do) with a master checkbox over its checks (a bar over the box while mixed: fxs-checkbox has no third state); an item
 *   whose needs are off is dimmed with a chip and stays editable; the phase's reserve and wonders show as chips; a short tooltip
 *   and the full text under «?»; the generals' line in the defence group's header; the balance sliders in the victory group.
 * - The log: oldest first, a header per turn, a turn's threats in one row, filtered (core/xpl-ap-view.js), rendered once a frame
 *   by appending and removing rows (never rebuilt per entry) and followed at the bottom by the game's own
 *   scroll-on-resize-when-bottom (the multiplayer chat's).
 * Checkboxes set from code send a forced change, never acted on (root CLAUDE.md gotcha 8); the scrollables are never emptied,
 * only the lists inside them (gotcha 18).
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { aiPlayAvailable, isAiPlaying, isAutopilotOn, isControlLost, setAutopilot, startAiTurns, stepNow, stopAiTurns, takeBackControl } from '../hud/xpl-autopilot.js';
import { log } from '../services/xpl-log.js';
import { disabledVictories } from '../data/xpl-victory.js';
import { victoryOptions } from '../core/xpl-victory-focus.js';
import { BIAS_DEFAULTS, BIAS_KEYS, BIAS_SETS, normaliseBias } from '../core/xpl-profiles.js';
import { AP_GROUPS, blockerText, optionOf, storedOn } from '../core/xpl-ap-options.js';
import { generalsLine, groupItems, groupPatch, groupState, isOpen, itemView, logRows, reconcileRows } from '../core/xpl-ap-view.js';

const BIAS_SAVE_MS = 300; // a dragged slider is saved once it rests
const SCROLL_FRAMES = 6;  // frames before scrolling the log to its end (the game's chat waits as long: screen-mp-chat.js)

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

function safeTurn() {
    try {
        return Game.turn;
    } catch (_e) {
        return null;
    }
}

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
}

/** An attribute set only when it changes (a component re-renders on every set). */
function setAttr(e, name, value) {
    if (e && e.getAttribute(name) !== value) e.setAttribute(name, value);
}

/** A choice's value among its options (the settings keep numbers; a dropdown's index). */
const indexOf = (options, v) => options.findIndex((x) => x === v || x === Number(v));

function choiceLabel(key, v) {
    switch (key) {
        case "reserveTurns": return compose("LOC_XPL_AP_RESERVE_N", v);
        case "replanEvery": return v === 0 ? compose("LOC_XPL_AP_REPLAN_NEVER") : compose("LOC_XPL_AP_REPLAN_N", v);
        case "aiTurns": return compose("LOC_XPL_AP_AI_TURNS_N", v);
        case "maxWonders": return compose("LOC_XPL_AP_MAX_WONDERS_N", v);
        case "victory": return compose(v === "AUTO" ? "LOC_XPL_AP_VICTORY_AUTO" : `LOC_XPL_FOCUS_${v}`);
        default: return String(v);
    }
}

function fxsButton(classes, caption, tooltip = null) {
    const b = document.createElement("fxs-button");
    for (const c of classes) b.classList.add(c);
    b.setAttribute("caption", compose(caption));
    if (tooltip) b.setAttribute("data-tooltip-content", compose(tooltip));
    return b;
}

/** A log row's look: the turn's header, a turn's threats, an entry by its category. */
function rowClass(r) {
    if (r.kind === "TURN") return "xpl-ap-log-turn";
    if (r.kind === "THREATS") return "xpl-ap-log-row xpl-ap-log-row--threat";
    return `xpl-ap-log-row${r.cat === "ERROR" ? " xpl-ap-log-row--error" : r.cat === "ROUTINE" ? " xpl-ap-log-row--routine" : ""}`;
}

export class AutopilotTab {
    constructor(root) {
        this.root = root;
        this.active = false;
        this.listeners = [];
        this.unsubscribe = [];
        this.groups = new Map(); // group id -> its header's parts and items box
        this.items = new Map();  // option key -> its row's parts
        this.rendered = [];      // the log's rows as shown: [{ id, text }]
        this.rowEls = new Map(); // row id -> element
        this.rowTexts = new Map(); // row id -> its text (an entry's never changes)
        this.renderQueued = false;
    }

    initialize() {
        const q = (sel) => this.root.querySelector(sel);
        this.status = q(".xpl-ap-status");
        this.blocker = q(".xpl-ap-blocker");
        this.toggle = q(".xpl-ap-toggle");
        this.now = q(".xpl-ap-now");
        this.goldLine = q(".xpl-ap-gold");
        this.lostBox = q(".xpl-ap-lost");
        this.takeBack = q(".xpl-ap-take-back");
        this.panes = { SETTINGS: q(".xpl-ap-pane--settings"), LOG: q(".xpl-ap-pane--log") };
        this.viewButtons = [...this.root.querySelectorAll(".xpl-ap-view")];
        this.filterButtons = [...this.root.querySelectorAll(".xpl-ap-filter")];
        this.focusHead = q(".xpl-ap-focus-head");
        this.focusBox = q(".xpl-ap-focus-box");
        this.logBox = q(".xpl-ap-log");
        this.logScroll = this.logBox?.closest("fxs-scrollable") ?? null;
        this.buildGroups(q(".xpl-ap-groups"));
        // «Баланс приоритетов» (built in the victory group): a multiplier per yield on every profile (core/xpl-profiles.js profileFor).
        this.biasBox = q(".xpl-ap-bias");
        this.biasToggle = q(".xpl-ap-bias-toggle");
        this.biasReset = q(".xpl-ap-bias-reset");
        this.biasSetLabel = q(".xpl-ap-bias-set");
        this.biasSliders = Object.fromEntries(BIAS_KEYS.map((k) => [k, { slider: q(`.xpl-ap-bias-${k}`), value: q(`.xpl-ap-bias-value-${k}`) }]));
        this.biasTimer = null;
        this.renderBias();
        this.renderSettings();
        this.applyUi();
    }

    // ---- building the settings from the spec -------------------------------------------------------------------------

    buildGroups(box) {
        if (!box) return;
        box.innerHTML = "";
        for (const g of AP_GROUPS) {
            const group = el("div", `xpl-ap-group xpl-ap-group--${g.id}`);
            const head = el("div", "xpl-ap-group__head");
            // The toggle opens and closes the group; the master is its sibling, so a click on it never does.
            const toggle = el("div", "xpl-ap-group__toggle");
            const sign = document.createElement("fxs-minus-plus");
            sign.setAttribute("type", "plus");
            toggle.appendChild(sign);
            const titles = el("div", "xpl-ap-group__titles");
            const title = el("div", "xpl-ap-group__title");
            title.setAttribute("data-l10n-id", g.label);
            titles.appendChild(title);
            const line = el("div", "xpl-ap-group__line hidden");
            titles.appendChild(line);
            toggle.appendChild(titles);
            if (g.movesUnits) toggle.appendChild(el("div", "xpl-chip xpl-chip--units", compose("LOC_XPL_AP_MOVES_UNITS")));
            const count = el("div", "xpl-ap-group__count");
            toggle.appendChild(count);
            head.appendChild(toggle);
            const parts = { spec: g, toggle, sign, line, count, master: null, masterBox: null, allOff: null };
            if (g.noMaster) {
                // The wars stay off by default (the user's choice): only switched off from here.
                parts.allOff = fxsButton(["xpl-small-button", "xpl-ap-all-off"], "LOC_XPL_AP_ALL_OFF", "LOC_XPL_AP_ALL_OFF_TT");
                head.appendChild(parts.allOff);
            } else {
                parts.masterBox = el("div", "xpl-ap-master");
                parts.masterBox.setAttribute("data-tooltip-content", compose("LOC_XPL_AP_MASTER_TT"));
                parts.master = document.createElement("fxs-checkbox");
                parts.masterBox.appendChild(parts.master);
                parts.masterBox.appendChild(el("div", "xpl-ap-master__mixed"));
                head.appendChild(parts.masterBox);
            }
            group.appendChild(head);
            parts.items = el("div", "xpl-ap-group__items hidden");
            for (const it of groupItems(g.id)) parts.items.appendChild(this.buildItem(it));
            if (g.id === "victory") this.buildBias(parts.items);
            group.appendChild(parts.items);
            box.appendChild(group);
            this.groups.set(g.id, parts);
        }
    }

    /** One option's row: checkbox or dropdown, label, chips, «?»; under it the full text (hidden). */
    buildItem({ key, kind, depth }) {
        const spec = optionOf(key);
        const row = el("div", `xpl-ap-item xpl-ap-item--${key}${depth > 0 ? ` xpl-ap-item--d${Math.min(depth, 2)}` : ""}`);
        const line = el("div", "xpl-ap-item__line");
        line.setAttribute("data-tooltip-content", compose(spec.tip));
        const parts = { key, kind, row, line };
        if (kind === "check") {
            parts.box = document.createElement("fxs-checkbox");
            line.appendChild(parts.box);
        }
        const label = el("span", "xpl-ap-item__label");
        label.setAttribute("data-l10n-id", spec.label);
        line.appendChild(label);
        parts.chips = el("div", "xpl-ap-item__chips");
        parts.chipSig = "";
        line.appendChild(parts.chips);
        if (kind === "choice") {
            parts.dropdown = document.createElement("fxs-dropdown");
            parts.dropdown.classList.add("xpl-ap-item__dropdown");
            parts.dropdown.setAttribute("has-border", "true");
            parts.dropdown.setAttribute("has-background", "true");
            parts.options = [...spec.options];
            this.fillDropdown(parts);
            line.appendChild(parts.dropdown);
        }
        if (key === "aiTurns") {
            // The AI's start: its stop rules in the tooltip (they were a note under it; game 60's review, UI-9).
            this.aiButton = fxsButton(["xpl-small-button", "xpl-ap-ai-start"], "LOC_XPL_AP_AI_START", "LOC_XPL_AP_AI_NOTE");
            line.appendChild(this.aiButton);
        }
        parts.help = el("div", "xpl-ap-help", "?");
        parts.help.setAttribute("data-tooltip-content", compose("LOC_XPL_AP_DETAILS_TT"));
        line.appendChild(parts.help);
        row.appendChild(line);
        parts.details = el("div", "xpl-ap-details hidden");
        parts.details.setAttribute("data-l10n-id", spec.details);
        row.appendChild(parts.details);
        if (key === "aiTurns") {
            // Why the button is off in multiplayer: shown there only.
            this.aiNote = el("div", "xpl-ap-note hidden");
            row.appendChild(this.aiNote);
        }
        this.items.set(key, parts);
        return row;
    }

    /** fxs-dropdown: its items before its index (gotcha 8). */
    fillDropdown(parts) {
        const v = settings.get().autopilot?.[parts.key];
        parts.dropdown.setAttribute("dropdown-items", JSON.stringify(parts.options.map((x) => ({ label: choiceLabel(parts.key, x) }))));
        parts.dropdown.setAttribute("selected-item-index", String(Math.max(0, indexOf(parts.options, v))));
    }

    /** «Баланс приоритетов»: its row (focus set, show/hide, reset) and a slider per yield. */
    buildBias(parent) {
        const head = el("div", "xpl-control-row xpl-ap-bias-row");
        head.setAttribute("data-tooltip-content", compose("LOC_XPL_AP_BIAS_TT"));
        const title = el("span", "xpl-control-label");
        title.setAttribute("data-l10n-id", "LOC_XPL_AP_BIAS_TITLE");
        head.appendChild(title);
        head.appendChild(el("span", "xpl-control-value xpl-bias-set xpl-ap-bias-set"));
        head.appendChild(fxsButton(["xpl-ap-bias-toggle", "xpl-small-button"], "LOC_XPL_AP_BIAS_SHOW"));
        head.appendChild(fxsButton(["xpl-ap-bias-reset", "xpl-small-button"], "LOC_XPL_AP_BIAS_RESET"));
        parent.appendChild(head);
        const box = el("div", "xpl-ap-bias hidden");
        for (const k of BIAS_KEYS) {
            const r = el("div", "xpl-control-row");
            const label = el("span", "xpl-control-label");
            label.setAttribute("data-l10n-id", `LOC_XPL_AP_BIAS_${k}`);
            r.appendChild(label);
            const slider = document.createElement("fxs-slider");
            slider.classList.add(`xpl-ap-bias-${k}`, "xpl-slider");
            slider.setAttribute("min", "0");
            slider.setAttribute("max", "2");
            slider.setAttribute("steps", "20");
            r.appendChild(slider);
            r.appendChild(el("span", `xpl-control-value xpl-bias-value xpl-ap-bias-value-${k}`));
            box.appendChild(r);
        }
        parent.appendChild(box);
    }

    listen(target, type, fn) {
        if (!target) return;
        target.addEventListener(type, fn);
        this.listeners.push([target, type, fn]);
    }

    /** The tab's own settings (core/xpl-ap-view.js: the compact frame's view, the log's filter, the open groups). */
    ui() {
        return settings.get().autopilot?.ui ?? {};
    }

    patchUi(patch) {
        settings.patch({ autopilot: { ui: patch } });
    }

    attach() {
        this.listen(this.toggle, "action-activate", () => {
            setAutopilot(!isAutopilotOn());
            this.render();
        });
        this.listen(this.now, "action-activate", () => {
            stepNow({ source: "BUTTON" }).catch((error) => log.error("autopilot step failed", error));
        });
        this.listen(this.takeBack, "action-activate", () => {
            takeBackControl();
            this.render();
        });
        this.listen(this.aiButton, "action-activate", () => {
            if (isAiPlaying()) stopAiTurns();
            else startAiTurns(Number(settings.get().autopilot.aiTurns) || 5);
            this.render();
        });
        this.listen(this.biasToggle, "action-activate", () => {
            settings.patch({ autopilot: { biasOpen: !settings.get().autopilot.biasOpen } });
            this.renderBias();
        });
        this.listen(this.biasReset, "action-activate", () => {
            const set = this.biasSet();
            settings.patch({ yieldBias: { [set]: { ...BIAS_DEFAULTS[set] } } });
            this.renderBias({ sliders: true });
        });
        for (const [k, b] of Object.entries(this.biasSliders)) {
            this.listen(b.slider, "component-value-changed", (e) => {
                const v = normaliseBias({ [k]: e.detail?.value })[k];
                if (b.value) b.value.textContent = compose("LOC_XPL_AP_BIAS_VALUE", v.toFixed(1));
                const set = this.biasSet();
                if (v === this.biasOf(set)[k]) return; // set from code, or no change
                clearTimeout(this.biasTimer);
                this.biasTimer = setTimeout(() => {
                    if (this.biasOf(set)[k] !== v) settings.patch({ yieldBias: { [set]: { ...this.biasOf(set), [k]: v } } });
                }, BIAS_SAVE_MS);
            });
        }
        for (const [k, it] of this.items) {
            this.listen(it.box, "component-value-changed", (e) => {
                if (e.detail?.forced) return; // set from code, not a click
                const v = !!e.detail.value;
                if (v !== storedOn(settings.get().autopilot, k)) settings.patch({ autopilot: { [k]: v } });
            });
            this.listen(it.dropdown, "dropdown-selection-change", (e) => {
                const v = it.options[e.detail.selectedIndex];
                const now = settings.get().autopilot[k];
                if (v !== undefined && v !== now && v !== Number(now)) settings.patch({ autopilot: { [k]: v } });
            });
            this.listen(it.help, "click", () => {
                const open = it.details.classList.contains("hidden");
                it.details.classList.toggle("hidden", !open);
                it.help.classList.toggle("xpl-ap-help--on", open);
            });
        }
        for (const [id, g] of this.groups) {
            this.listen(g.toggle, "click", () => this.patchUi({ open: { [id]: !isOpen(this.ui(), id) } }));
            this.listen(g.master, "component-value-changed", (e) => {
                if (e.detail?.forced) return; // set from code (the group's state), not a click
                const patch = groupPatch(id, !!e.detail.value);
                if (Object.keys(patch).length > 0) settings.patch({ autopilot: patch });
            });
            this.listen(g.allOff, "action-activate", () => settings.patch({ autopilot: groupPatch(id, false) }));
        }
        for (const b of this.viewButtons) this.listen(b, "click", () => this.patchUi({ view: b.getAttribute("data-view") }));
        for (const b of this.filterButtons) this.listen(b, "click", () => this.patchUi({ logFilter: b.getAttribute("data-filter") }));
        this.listen(this.focusHead, "click", () => this.patchUi({ open: { focusBox: !isOpen(this.ui(), "focusBox") } }));
        this.unsubscribe.push(state.subscribe((_s, changed) => {
            if (this.active && changed.includes("autopilot")) this.scheduleRender();
        }));
        this.unsubscribe.push(settings.subscribe((now, before) => this.onSettings(now, before)));
        const onAuto = () => this.active && this.render();
        engine.on("AutoplayStarted", onAuto);
        engine.on("AutoplayEnded", onAuto);
        this.offAuto = () => {
            engine.off("AutoplayStarted", onAuto);
            engine.off("AutoplayEnded", onAuto);
        };
    }

    detach() {
        for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
        this.listeners = [];
        for (const off of this.unsubscribe) off();
        this.unsubscribe = [];
        this.offAuto?.();
        this.active = false;
    }

    show() {
        this.active = true;
        this.refreshVictoryOptions();
        this.render();
        this.scrollLogToEnd();
    }

    hide() {
        this.active = false;
    }

    /** A setting changed (a click here, or elsewhere): the items, the groups and the views follow it. */
    onSettings(now, before) {
        this.renderSettings();
        const view = now?.autopilot?.ui?.view;
        this.applyUi();
        if (this.active && now?.autopilot?.ui?.logFilter !== before?.autopilot?.ui?.logFilter) this.renderLog({ reset: true });
        if (this.active && view === "LOG" && before?.autopilot?.ui?.view !== "LOG") this.scrollLogToEnd();
    }

    /** One render a frame however many state changes a pass makes (16-37 entries in 2-6 s in game 60). */
    scheduleRender() {
        if (this.renderQueued) return;
        this.renderQueued = true;
        requestAnimationFrame(() => {
            this.renderQueued = false;
            if (this.active) this.render();
        });
    }

    /** The log to its end, a few frames after its rows changed (the game's own follow then keeps it there). */
    scrollLogToEnd() {
        const s = this.logScroll;
        if (!s) return;
        let frames = SCROLL_FRAMES;
        const step = () => {
            if (--frames > 0) {
                requestAnimationFrame(step);
                return;
            }
            try {
                s.component?.scrollToPercentage?.(1);
            } catch (error) {
                log.debug("autopilot tab: log scroll failed", error);
            }
        };
        requestAnimationFrame(step);
    }

    /** The compact frame's view, the log's filter, the open groups and the victory box. */
    applyUi() {
        const ui = this.ui();
        const view = ui.view === "SETTINGS" ? "SETTINGS" : "LOG";
        for (const [v, pane] of Object.entries(this.panes ?? {})) pane?.classList.toggle("xpl-ap-pane--off", v !== view);
        for (const b of this.viewButtons ?? []) b.classList.toggle("xpl-ap-seg--on", b.getAttribute("data-view") === view);
        for (const b of this.filterButtons ?? []) b.classList.toggle("xpl-ap-seg--on", b.getAttribute("data-filter") === (ui.logFilter ?? "MAIN"));
        for (const [id, g] of this.groups) {
            const open = isOpen(ui, id);
            g.items.classList.toggle("hidden", !open);
            setAttr(g.sign, "type", open ? "minus" : "plus");
        }
        const ap = state.get().autopilot ?? {};
        this.renderFocus(ap.focus, ap.strategy, ap.legacy ?? null);
    }

    /**
     * «Цель победы» offers only the victories switched on in this game (Game.VictoryManager, as
     * the victories screen asks; all off or unknown: all offered, like the focus itself).
     */
    refreshVictoryOptions() {
        const d = this.items.get("victory");
        if (!d?.dropdown) return;
        let off = new Set();
        try {
            off = disabledVictories();
        } catch (error) {
            log.debug("autopilot tab: victories unknown", error);
        }
        const usable = victoryOptions(off);
        if (usable.join() === d.options.join()) return;
        d.options = usable;
        this.fillDropdown(d);
    }

    /** The balance set the sliders edit: the autopilot's victory focus (its own set), else the one without a focus. */
    biasSet() {
        const focus = state.get().autopilot?.focus?.cls;
        return BIAS_SETS.includes(focus) ? focus : "NONE";
    }

    /** A balance set as saved (its default when unset). */
    biasOf(set) {
        return normaliseBias(settings.get().yieldBias?.[set] ?? BIAS_DEFAULTS[set]);
    }

    /** The balance block: shown or hidden, the focus it belongs to, each slider's value («×1.2»); `sliders`: move the sliders too. */
    renderBias({ sliders = true } = {}) {
        const s = settings.get();
        const open = !!s.autopilot?.biasOpen;
        this.biasBox?.classList.toggle("hidden", !open);
        this.biasToggle?.setAttribute("caption", compose(open ? "LOC_XPL_AP_BIAS_HIDE" : "LOC_XPL_AP_BIAS_SHOW"));
        const set = this.biasSet();
        this.shownBiasSet = set;
        if (this.biasSetLabel) this.biasSetLabel.textContent = compose(set === "NONE" ? "LOC_XPL_AP_BIAS_SET_NONE" : `LOC_XPL_FOCUS_${set}`);
        const bias = this.biasOf(set);
        for (const [k, b] of Object.entries(this.biasSliders ?? {})) {
            if (sliders && b.slider && Number(b.slider.getAttribute("value")) !== bias[k]) b.slider.setAttribute("value", String(bias[k]));
            if (b.value) b.value.textContent = compose("LOC_XPL_AP_BIAS_VALUE", bias[k].toFixed(1));
        }
    }

    render() {
        const ap = state.get().autopilot ?? { enabled: false, log: [] };
        this.renderTop(ap);
        this.renderGold(ap.gold);
        this.renderFocus(ap.focus, ap.strategy, ap.legacy ?? null);
        this.renderSettings();
        this.renderLog();
        // The focus may have changed: the sliders show its own balance.
        if (this.shownBiasSet !== this.biasSet()) this.renderBias();
    }

    /** The top bar: on, off, working or stepping; what holds the turn after the last pass (game 60's review, M3). */
    renderTop(ap) {
        const on = !!ap.enabled;
        if (this.status) {
            // A step (F7) works with the autopilot off too.
            this.status.textContent = compose(ap.running ? (on ? "LOC_XPL_AP_STATUS_WORKING" : "LOC_XPL_AP_STATUS_STEPPING") : on ? "LOC_XPL_AP_STATUS_ON" : "LOC_XPL_AP_STATUS_OFF");
            this.status.classList.toggle("xpl-ap-status--on", on || !!ap.running);
        }
        const b = !ap.running && ap.blocker && ap.blocker.turn === safeTurn() ? ap.blocker : null;
        if (this.blocker) {
            this.blocker.classList.toggle("hidden", !b);
            this.blocker.classList.toggle("xpl-ap-blocker--held", !!b?.type);
            if (b) this.blocker.textContent = blockerText(b, compose);
        }
        setAttr(this.toggle, "caption", compose(on ? "LOC_XPL_AP_TURN_OFF" : "LOC_XPL_AP_TURN_ON"));
        const aiOk = aiPlayAvailable();
        setAttr(this.aiButton, "disabled", aiOk ? "false" : "true");
        setAttr(this.aiButton, "caption", compose(isAiPlaying() ? "LOC_XPL_AP_AI_STOP" : "LOC_XPL_AP_AI_START"));
        if (this.aiNote) {
            this.aiNote.classList.toggle("hidden", aiOk);
            if (!aiOk) this.aiNote.textContent = compose("LOC_XPL_AP_AI_MP");
        }
        // The game plays the civ by itself (the slot became AI at an age change during an older run).
        this.lostBox?.classList.toggle("hidden", !isControlLost());
    }

    /** Every item and group from the settings and the state: values, dimming, chips, masters, counts, the generals' line. */
    renderSettings() {
        const o = settings.get().autopilot ?? {};
        const ap = state.get().autopilot ?? {};
        const ctx = { autopilotOn: !!ap.enabled, strategy: ap.strategy ?? null };
        for (const [key, it] of this.items) {
            const v = itemView(o, key, ctx);
            if (!v) continue;
            if (it.box) setAttr(it.box, "selected", v.stored ? "true" : "false");
            if (it.dropdown) {
                const i = indexOf(it.options, o[key]);
                if (i >= 0) setAttr(it.dropdown, "selected-item-index", String(i));
            }
            it.row.classList.toggle("xpl-ap-item--dim", v.dim);
            const sig = v.chips.map((c) => `${c.key}(${c.args.join(",")})`).join("|");
            if (sig === it.chipSig) continue;
            it.chipSig = sig;
            it.chips.innerHTML = "";
            for (const c of v.chips) {
                const chip = el("span", `xpl-chip xpl-chip--${c.kind.toLowerCase()}`, compose(c.key, ...c.args));
                if (c.kind === "PHASE") chip.setAttribute("data-tooltip-content", compose("LOC_XPL_AP_PHASE_TT"));
                it.chips.appendChild(chip);
            }
        }
        for (const [id, g] of this.groups) {
            const st = groupState(o, id);
            const count = `${st.on}/${st.total}`;
            if (g.count.textContent !== count) g.count.textContent = count;
            if (g.master) {
                setAttr(g.master, "selected", st.state === "ON" ? "true" : "false");
                g.masterBox.classList.toggle("xpl-ap-master--mixed", st.state === "MIXED");
            }
            setAttr(g.allOff, "disabled", st.on === 0 ? "true" : "false");
        }
        // The generals in the defence group's header (game 60's review, UI-8: their levels were only in UI.log).
        const d = this.groups.get("defence");
        if (d) {
            const text = generalsLine(ap.generals, ap.fieldOp, compose);
            d.line.classList.toggle("hidden", !text);
            if (d.line.textContent !== text) d.line.textContent = text;
            setAttr(d.line, "data-tooltip-content", compose("LOC_XPL_AP_GENERALS_TT"));
        }
    }

    /** The log's rows: appended, updated and removed in place; rebuilt only when the filter changes or the order breaks. */
    renderLog({ reset = false } = {}) {
        if (!this.logBox) return;
        const ap = state.get().autopilot ?? {};
        const filter = this.ui().logFilter ?? "MAIN";
        const desired = logRows(ap.log ?? [], filter).map((r) => ({ id: r.id, cls: rowClass(r), text: this.rowText(r) }));
        if (desired.length === 0) desired.push({ id: "EMPTY", cls: "xpl-empty", text: compose("LOC_XPL_AP_LOG_EMPTY") });
        const plan = reset || filter !== this.shownFilter ? { reset: true } : reconcileRows(this.rendered, desired);
        this.shownFilter = filter;
        if (plan.reset) {
            this.logBox.innerHTML = "";
            this.rowEls = new Map();
            for (const r of desired) this.appendRow(r);
        } else {
            for (const id of plan.remove) {
                this.rowEls.get(id)?.remove();
                this.rowEls.delete(id);
            }
            for (const r of plan.update) this.rowEls.get(r.id)?.setAttribute("data-l10n-id", r.text);
            for (const r of plan.append) this.appendRow(r);
        }
        this.rendered = desired.map((r) => ({ id: r.id, text: r.text }));
        if (this.rowTexts.size > 2 * desired.length + 50) {
            const shown = new Set(desired.map((r) => r.id));
            for (const id of [...this.rowTexts.keys()]) if (!shown.has(id)) this.rowTexts.delete(id);
        }
        if (plan.reset) this.scrollLogToEnd();
    }

    /** A row's text: an entry's and a header's once (they never change), a turn's threats each time. */
    rowText(r) {
        if (r.kind === "THREATS") return compose("LOC_XPL_AP_THREATS", r.threats.map(([name, n]) => `${compose(name)} ${n}`).join(", "));
        let text = this.rowTexts.get(r.id);
        if (text === undefined) {
            text = r.kind === "TURN" ? compose("LOC_XPL_AP_LOG_TURN", r.turn) : compose(`LOC_XPL_AP_${r.key}`, ...(r.args ?? []));
            this.rowTexts.set(r.id, text);
        }
        return text;
    }

    appendRow(r) {
        const row = el("div", r.cls);
        row.setAttribute("data-l10n-id", r.text);
        this.logBox.appendChild(row);
        this.rowEls.set(r.id, row);
    }

    /** The last pass's gold plan (steps.logGold): the treasury, the reserve, the goal saved for, what was spent. */
    renderGold(gold) {
        if (!this.goldLine) return;
        this.goldLine.classList.toggle("xpl-ap-gold--none", !gold);
        if (!gold) return;
        const g = gold.goal && !gold.goal.done ? gold.goal : null;
        let text = g
            ? compose("LOC_XPL_AP_GOLD_LINE", gold.balance, gold.reserve, g.label, g.cost)
            : compose("LOC_XPL_AP_GOLD_NO_GOAL", gold.balance, gold.reserve);
        if (gold.spent > 0) text += `; ${compose("LOC_XPL_AP_GOLD_SPENT", gold.spent)}`;
        setAttr(this.goldLine, "data-l10n-id", text);
    }

    /**
     * The victory box above the log: its header («Победа: Культура · Рост», opens and closes it) and the chosen path, each
     * victory against the best rival, the rivals near a victory, the close triumphs.
     */
    renderFocus(focus, strategy = null, legacy = null) {
        if (!this.focusBox) return;
        const lines = [];
        const line = (text, tip = null) => lines.push({ text, tip });
        // The age's last turns: the triumphs under way, for the player's cards (research/40 C; legacy paths count nothing in this
        // game version: games 42-43).
        if (legacy) {
            const open = (legacy.triumphs ?? []).map((t) => compose("LOC_XPL_AP_LEGACY_TRIUMPH", compose(t.name), t.current, t.total));
            line(compose("LOC_XPL_AP_LEGACY_SUMMARY", legacy.turnsLeft, open.join("; ")));
        }
        if (focus) {
            line(compose("LOC_XPL_AP_FOCUS_NOW", focus.cls ? compose(`LOC_XPL_FOCUS_${focus.cls}`) : compose("LOC_XPL_AP_FOCUS_NONE")));
            // The strategy's phase, with what it changes this pass in the tooltip (core/xpl-strategy.js strategyLines).
            if (strategy?.phase) {
                const tip = (strategy.lines ?? []).map((l) => compose(l.key, ...(l.args ?? []))).join("[N]");
                line(compose("LOC_XPL_AP_STRATEGY_NOW", compose(`LOC_XPL_AP_PHASE_${strategy.phase}`), compose(`LOC_XPL_FOCUS_${strategy.focus}`)), tip || null);
            }
            // The victories themselves (Innovation, GDP…), once they have points or a goal.
            for (const r of focus.races ?? []) {
                if (!(r.points > 0) && !(r.goal > 0)) continue;
                const goal = r.goal > 0 ? r.goal : "—";
                const name = compose(`LOC_XPL_FOCUS_${r.cls}`);
                line(r.turnsLeft === null || r.turnsLeft === undefined
                    ? compose("LOC_XPL_AP_FOCUS_RACE", name, r.points, goal, r.rival)
                    : compose("LOC_XPL_AP_FOCUS_RACE_COUNTDOWN", name, r.points, goal, r.turnsLeft));
            }
            // Rivals near a victory (victoryWatch): «… у порога победы (Культура): 1400 из 1552 (×4); нам нужно 403».
            for (const w of focus.watch ?? []) {
                if (!w.level) continue;
                if (w.own) {
                    line(w.settlements !== undefined
                        ? compose("LOC_XPL_AP_WATCH_LEVER", w.settlements, w.ours, w.goal)
                        : compose("LOC_XPL_AP_WATCH_OWN", compose(`LOC_XPL_FOCUS_${w.cls}`), w.ours, w.goal));
                    continue;
                }
                // A fixed score (science): no multiple, nothing of ours holds it back; its countdown is the game's end.
                if (w.fixed) {
                    line(w.countdown !== null && w.countdown !== undefined
                        ? compose("LOC_XPL_AP_WATCH_FIXED_COUNTDOWN", w.leaderName, compose(`LOC_XPL_FOCUS_${w.cls}`), w.points, w.goal, w.countdown)
                        : compose(w.level === "DANGER" ? "LOC_XPL_AP_WATCH_FIXED_DANGER" : "LOC_XPL_AP_WATCH_FIXED", w.leaderName, compose(`LOC_XPL_FOCUS_${w.cls}`), w.points, w.goal));
                    continue;
                }
                // Near its goal only at the final age's next step (victoryWatch `step`).
                if (w.step) line(compose("LOC_XPL_AP_WATCH_STEP", w.leaderName, compose(`LOC_XPL_FOCUS_${w.cls}`), w.points, w.stepGoal, w.step, w.need));
                else line(compose(w.level === "DANGER" ? "LOC_XPL_AP_WATCH_DANGER" : "LOC_XPL_AP_WATCH", w.leaderName, compose(`LOC_XPL_FOCUS_${w.cls}`), w.points, w.goal, w.multiple, w.need));
            }
            if (focus.innovation?.target) line(compose("LOC_XPL_AP_INNOVATION_TARGET", focus.innovation.points, focus.innovation.target));
            if ((focus.off ?? []).length > 0) line(compose("LOC_XPL_AP_FOCUS_OFF", focus.off.map((c) => compose(`LOC_XPL_FOCUS_${c}`)).join(", ")));
            if ((focus.close ?? []).length > 0) {
                line(compose("LOC_XPL_AP_FOCUS_TRIUMPHS", focus.close.map((t) => `${compose(t.name)} ${t.current}/${t.total}`).join("; ")));
            }
        }
        const shown = lines.length > 0;
        const open = isOpen(this.ui(), "focusBox");
        this.focusHead?.classList.toggle("hidden", !shown);
        this.focusBox.classList.toggle("hidden", !shown || !open);
        if (this.focusHead && shown) {
            const name = focus?.cls ? compose(`LOC_XPL_FOCUS_${focus.cls}`) : compose("LOC_XPL_AP_FOCUS_NONE");
            let head = `${open ? "–" : "+"} ${compose("LOC_XPL_AP_FOCUS_HEAD", name)}`;
            if (strategy?.phase) head += ` · ${compose(`LOC_XPL_AP_PHASE_${strategy.phase}`)}`;
            if (this.focusHead.textContent !== head) this.focusHead.textContent = head;
        }
        // Rebuilt only when a line changed.
        const sig = lines.map((l) => `${l.text}|${l.tip ?? ""}`).join("\n");
        if (sig === this.focusSig) return;
        this.focusSig = sig;
        this.focusBox.innerHTML = "";
        for (const l of lines) {
            const row = el("div", "xpl-ap-focus-row", l.text);
            if (l.tip) row.setAttribute("data-tooltip-content", l.tip);
            this.focusBox.appendChild(row);
        }
    }
}
