/**
 * Autopilot tab: the on/off switch, which decisions it may make, the gold reserve and how
 * often to recalculate the building plan, "do it now", the single-player "AI plays N
 * turns", and the log of what the autopilot did (newest first).
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { aiPlayAvailable, isAiPlaying, isAutopilotOn, isControlLost, runTurn, setAutopilot, startAiTurns, stopAiTurns, takeBackControl } from '../hud/xpl-autopilot.js';
import { log } from '../services/xpl-log.js';

const CHECKS = ["research", "production", "wonders", "growth", "towns", "purchases", "choices", "closePopups", "befriend", "tacks", "roam", "explore", "settlers", "defend", "merchants", "skipUnits", "endTurn"];
const MAX_WONDER_OPTIONS = [1, 2, 3];
const RESERVE_OPTIONS = [0, 1, 2, 3, 5];
const REPLAN_OPTIONS = [0, 1, 3, 5, 10];
const AI_TURN_OPTIONS = [1, 3, 5, 10, 20, 50];

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
        this.aiButton = q(".xpl-ap-ai-start");
        this.aiNote = q(".xpl-ap-ai-note");
        this.lostBox = q(".xpl-ap-lost");
        this.takeBack = q(".xpl-ap-take-back");
        this.checks = Object.fromEntries(CHECKS.map((k) => [k, q(`.xpl-ap-${k}`)]));
        this.dropdowns = {
            reserveTurns: { el: q(".xpl-ap-reserve"), options: RESERVE_OPTIONS, label: (v) => compose("LOC_XPL_AP_RESERVE_N", v) },
            replanEvery: { el: q(".xpl-ap-replan"), options: REPLAN_OPTIONS, label: (v) => (v === 0 ? compose("LOC_XPL_AP_REPLAN_NEVER") : compose("LOC_XPL_AP_REPLAN_N", v)) },
            aiTurns: { el: q(".xpl-ap-ai-turns"), options: AI_TURN_OPTIONS, label: (v) => compose("LOC_XPL_AP_AI_TURNS_N", v) },
            maxWonders: { el: q(".xpl-ap-max-wonders"), options: MAX_WONDER_OPTIONS, label: (v) => compose("LOC_XPL_AP_MAX_WONDERS_N", v) },
        };
        const o = settings.get().autopilot;
        for (const [k, box] of Object.entries(this.checks)) box?.setAttribute("selected", o[k] ? "true" : "false");
        for (const [k, d] of Object.entries(this.dropdowns)) {
            d.el?.setAttribute("dropdown-items", JSON.stringify(d.options.map((v) => ({ label: d.label(v) }))));
            d.el?.setAttribute("selected-item-index", String(Math.max(0, d.options.indexOf(Number(o[k])))));
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
                if (v !== undefined && v !== Number(settings.get().autopilot[k])) settings.patch({ autopilot: { [k]: v } });
            });
        }
        this.unsubscribe = state.subscribe((_s, changed) => {
            if (this.active && changed.includes("autopilot")) this.render();
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
        this.render();
    }

    hide() {
        this.active = false;
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
}
