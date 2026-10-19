/**
 * Autopilot tab: the on/off switch, which decisions it may make, the gold reserve and how
 * often to recalculate the building plan, "do it now", the single-player "AI plays N
 * turns", and the log of what the autopilot did (newest first).
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { aiPlayAvailable, isAiPlaying, isAutopilotOn, isControlLost, runTurn, setAutopilot, startAiTurns, stopAiTurns, takeBackControl } from '../hud/xpl-autopilot.js';
import { log } from '../services/xpl-log.js';
import { disabledVictories } from '../data/xpl-victory.js';
import { victoryOptions } from '../core/xpl-victory-focus.js';
import { BIAS_DEFAULTS, BIAS_KEYS, BIAS_SETS, normaliseBias } from '../core/xpl-profiles.js';

const BIAS_SAVE_MS = 300; // a dragged slider is saved once it rests

const CHECKS = ["research", "production", "wonders", "growth", "towns", "purchases", "choices", "closePopups", "befriend", "tacks", "focus", "strategy", "resources", "diplomacy", "roam", "explore", "settlers", "defend", "offensive", "merchants", "skipUnits", "endTurn", "resumeAfterAge"];
const MAX_WONDER_OPTIONS = [1, 2, 3];
const RESERVE_OPTIONS = [0, 1, 2, 3, 5];
const REPLAN_OPTIONS = [0, 1, 3, 5, 10];
const AI_TURN_OPTIONS = [1, 3, 5, 10, 20, 50];
const VICTORY_OPTIONS = ["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"];

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
}

export class AutopilotTab {
    constructor(root) {
        this.root = root;
        this.active = false;
        this.listeners = [];
        this.unsubscribe = null;
    }

    initialize() {
        const q = (sel) => this.root.querySelector(sel);
        this.status = q(".xpl-ap-status");
        this.toggle = q(".xpl-ap-toggle");
        this.now = q(".xpl-ap-now");
        this.logBox = q(".xpl-ap-log");
        this.focusBox = q(".xpl-ap-focus-box");
        this.goldLine = q(".xpl-ap-gold");
        this.aiButton = q(".xpl-ap-ai-start");
        this.aiNote = q(".xpl-ap-ai-note");
        this.lostBox = q(".xpl-ap-lost");
        this.takeBack = q(".xpl-ap-take-back");
        this.checks = Object.fromEntries(CHECKS.map((k) => [k, q(`.xpl-ap-${k}`)]));
        // «Баланс приоритетов»: a multiplier per yield on every profile (core/xpl-profiles.js profileFor).
        this.biasBox = q(".xpl-ap-bias");
        this.biasToggle = q(".xpl-ap-bias-toggle");
        this.biasReset = q(".xpl-ap-bias-reset");
        this.biasSetLabel = q(".xpl-ap-bias-set");
        this.biasSliders = Object.fromEntries(BIAS_KEYS.map((k) => [k, { slider: q(`.xpl-ap-bias-${k}`), value: q(`.xpl-ap-bias-value-${k}`) }]));
        this.biasTimer = null;
        this.renderBias();
        this.dropdowns = {
            reserveTurns: { el: q(".xpl-ap-reserve"), options: RESERVE_OPTIONS, label: (v) => compose("LOC_XPL_AP_RESERVE_N", v) },
            replanEvery: { el: q(".xpl-ap-replan"), options: REPLAN_OPTIONS, label: (v) => (v === 0 ? compose("LOC_XPL_AP_REPLAN_NEVER") : compose("LOC_XPL_AP_REPLAN_N", v)) },
            aiTurns: { el: q(".xpl-ap-ai-turns"), options: AI_TURN_OPTIONS, label: (v) => compose("LOC_XPL_AP_AI_TURNS_N", v) },
            maxWonders: { el: q(".xpl-ap-max-wonders"), options: MAX_WONDER_OPTIONS, label: (v) => compose("LOC_XPL_AP_MAX_WONDERS_N", v) },
            victory: { el: q(".xpl-ap-victory"), options: VICTORY_OPTIONS, label: (v) => compose(v === "AUTO" ? "LOC_XPL_AP_VICTORY_AUTO" : `LOC_XPL_FOCUS_${v}`) },
        };
        const o = settings.get().autopilot;
        for (const [k, box] of Object.entries(this.checks)) box?.setAttribute("selected", o[k] ? "true" : "false");
        for (const [k, d] of Object.entries(this.dropdowns)) {
            d.el?.setAttribute("dropdown-items", JSON.stringify(d.options.map((v) => ({ label: d.label(v) }))));
            d.el?.setAttribute("selected-item-index", String(Math.max(0, d.options.findIndex((v) => v === o[k] || v === Number(o[k])))));
        }
    }

    listen(target, type, fn) {
        if (!target) return;
        target.addEventListener(type, fn);
        this.listeners.push([target, type, fn]);
    }

    attach() {
        this.listen(this.toggle, "action-activate", () => {
            setAutopilot(!isAutopilotOn());
            this.render();
        });
        this.listen(this.now, "action-activate", () => {
            runTurn(true).catch((error) => log.error("autopilot run failed", error));
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
        for (const [k, box] of Object.entries(this.checks)) {
            this.listen(box, "component-value-changed", (e) => {
                if (e.detail?.forced) return; // set from code, not a click
                const v = !!e.detail.value;
                if (v !== !!settings.get().autopilot[k]) settings.patch({ autopilot: { [k]: v } });
            });
        }
        for (const [k, d] of Object.entries(this.dropdowns)) {
            this.listen(d.el, "dropdown-selection-change", (e) => {
                const v = d.options[e.detail.selectedIndex];
                const now = settings.get().autopilot[k];
                if (v !== undefined && v !== now && v !== Number(now)) settings.patch({ autopilot: { [k]: v } });
            });
        }
        this.unsubscribe = state.subscribe((_s, changed) => {
            if (this.active && changed.includes("autopilot")) {
                this.render();
                // The focus may have changed: the sliders show its own balance.
                if (this.shownBiasSet !== this.biasSet()) this.renderBias();
            }
        });
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
        this.unsubscribe?.();
        this.offAuto?.();
        this.active = false;
    }

    show() {
        this.active = true;
        this.refreshVictoryOptions();
        this.render();
    }

    /**
     * «Цель победы» offers only the victories switched on in this game (Game.VictoryManager, as
     * the victories screen asks; all off or unknown: all offered, like the focus itself).
     */
    refreshVictoryOptions() {
        const d = this.dropdowns?.victory;
        if (!d?.el) return;
        let off = new Set();
        try {
            off = disabledVictories();
        } catch (error) {
            log.debug("autopilot tab: victories unknown", error);
        }
        const usable = victoryOptions(off);
        if (usable.join() === d.options.join()) return;
        d.options = usable;
        d.el.setAttribute("dropdown-items", JSON.stringify(usable.map((v) => ({ label: d.label(v) }))));
        d.el.setAttribute("selected-item-index", String(Math.max(0, usable.indexOf(settings.get().autopilot.victory))));
    }

    hide() {
        this.active = false;
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
        const on = !!ap.enabled;
        if (this.status) {
            this.status.textContent = compose(on ? (ap.running ? "LOC_XPL_AP_STATUS_WORKING" : "LOC_XPL_AP_STATUS_ON") : "LOC_XPL_AP_STATUS_OFF");
            this.status.classList.toggle("xpl-ap-status--on", on);
        }
        this.toggle?.setAttribute("caption", compose(on ? "LOC_XPL_AP_TURN_OFF" : "LOC_XPL_AP_TURN_ON"));
        const aiOk = aiPlayAvailable();
        this.aiButton?.setAttribute("disabled", aiOk ? "false" : "true");
        this.aiButton?.setAttribute("caption", compose(isAiPlaying() ? "LOC_XPL_AP_AI_STOP" : "LOC_XPL_AP_AI_START"));
        if (this.aiNote) this.aiNote.textContent = compose(aiOk ? "LOC_XPL_AP_AI_NOTE" : "LOC_XPL_AP_AI_MP");
        // The game plays the civ by itself (the slot became AI at an age change during an older run).
        const lost = isControlLost();
        this.lostBox?.classList.toggle("hidden", !lost);
        this.renderGold(ap.gold);
        this.renderFocus(ap.focus, ap.strategy);
        if (!this.logBox) return;
        this.logBox.innerHTML = "";
        const entries = ap.log ?? [];
        // Newest first: when entries arrive, back to the top so they are seen.
        const newest = entries.length > 0 ? `${entries[0].turn}|${entries[0].key}|${entries.length}` : "";
        if (newest !== this.shownNewest) {
            this.shownNewest = newest;
            this.logBox.closest("fxs-scrollable")?.setAttribute("scrollpercent", "0");
        }
        if (entries.length === 0) this.logBox.appendChild(el("div", "xpl-empty", compose("LOC_XPL_AP_LOG_EMPTY")));
        for (const e of entries) {
            const row = el("div", "xpl-ap-log-row");
            row.setAttribute("data-l10n-id", `${compose("LOC_XPL_AP_TURN_N", e.turn)} ${compose(`LOC_XPL_AP_${e.key}`, ...(e.args ?? []))}`);
            this.logBox.appendChild(row);
        }
    }

    /** The last pass's gold plan (steps.logGold): the treasury, the reserve, the goal saved for, what was spent. */
    renderGold(gold) {
        if (!this.goldLine) return;
        this.goldLine.classList.toggle("hidden", !gold);
        if (!gold) return;
        const g = gold.goal && !gold.goal.done ? gold.goal : null;
        let text = g
            ? compose("LOC_XPL_AP_GOLD_LINE", gold.balance, gold.reserve, g.label, g.cost)
            : compose("LOC_XPL_AP_GOLD_NO_GOAL", gold.balance, gold.reserve);
        if (gold.spent > 0) text += `; ${compose("LOC_XPL_AP_GOLD_SPENT", gold.spent)}`;
        this.goldLine.setAttribute("data-l10n-id", text);
    }

    /** The victory focus: the chosen path, each path against the best rival, the close triumphs. */
    renderFocus(focus, strategy = null) {
        if (!this.focusBox) return;
        this.focusBox.innerHTML = "";
        this.focusBox.classList.toggle("hidden", !focus);
        if (!focus) return;
        const line = (text) => this.focusBox.appendChild(el("div", "xpl-ap-focus-row", text));
        line(compose("LOC_XPL_AP_FOCUS_NOW", focus.cls ? compose(`LOC_XPL_FOCUS_${focus.cls}`) : compose("LOC_XPL_AP_FOCUS_NONE")));
        // The strategy's phase, with what it changes this pass in the tooltip (core/xpl-strategy.js strategyLines).
        if (strategy?.phase) {
            const row = line(compose("LOC_XPL_AP_STRATEGY_NOW", compose(`LOC_XPL_AP_PHASE_${strategy.phase}`), compose(`LOC_XPL_FOCUS_${strategy.focus}`)));
            const tip = (strategy.lines ?? []).map((l) => compose(l.key, ...(l.args ?? []))).join("[N]");
            if (tip) row.setAttribute("data-tooltip-content", tip);
        }
        for (const p of focus.scores ?? []) {
            line(compose(p.done ? "LOC_XPL_AP_FOCUS_PATH_DONE" : "LOC_XPL_AP_FOCUS_PATH", compose(`LOC_XPL_FOCUS_${p.cls}`), p.ours, p.goal, p.rival));
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
}
