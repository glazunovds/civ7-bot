/**
 * Wonders tab: current-age wonders with the fastest city, the best tile there (most
 * buildings boosted by "+1 per adjacent wonder"), turns and a race estimate.
 * Click a row to pan to the tile and expand the details; checkboxes pick wonders for
 * "Place wonder tacks". Rivals' build queues are read only with the opt-in setting.
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { runWonderPlanner } from '../data/xpl-wonder-job.js';
import { overlay } from '../map/xpl-overlay.js';
import { focusPlot } from '../map/xpl-camera.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { clearOurTacks, isDmtReady, networkMultiplayer, onDmtReady, placeTacks } from '../integrations/xpl-dmt-bridge.js';

const RECOMPUTE_EVENTS = ["WonderCompleted", "CityProductionChanged", "CityProductionCompleted", "ConstructibleAddedToMap", "CityInitialized", "PlayerTurnActivated"];
const EVENT_DEBOUNCE_MS = 1500;
const RACE_COLOURS = { HIGH: 0x4caf50, MEDIUM: 0xe8c547, LOW: 0xe07b39, NONE: 0x888888 };
const YIELD_ICONS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"];

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

function rich(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.setAttribute("data-l10n-id", text);
    return e;
}

function yieldsText(values) {
    const parts = [];
    values.forEach((v, i) => {
        const r = Math.round(v * 10) / 10;
        if (r !== 0) parts.push(`[icon:${YIELD_ICONS[i]}]${r > 0 ? "+" : ""}${r}`);
    });
    return parts.join(" ");
}

export class WondersTab {
    constructor(root) {
        this.root = root;
        this.active = false;
        this.expanded = null;
        this.selected = new Set();
        this.timer = 0;
        this.tackMessage = "";
        this.listeners = [];
        this.handlers = [];
        this.unsubscribe = [];
    }

    initialize() {
        const q = (sel) => this.root.querySelector(sel);
        this.header = q(".xpl-wonder-header");
        this.omniscientBox = q(".xpl-omniscient");
        this.rows = q(".xpl-wonder-rows");
        this.placeButton = q(".xpl-place-wonder-tacks");
        this.clearButton = q(".xpl-clear-wonder-tacks");
        this.statusLine = q(".xpl-wonder-status");
        this.omniscientBox?.setAttribute("selected", settings.get().wonders?.omniscient ? "true" : "false");
        this.updateButtons();
    }

    listen(target, type, fn) {
        if (!target) return;
        target.addEventListener(type, fn);
        this.listeners.push([target, type, fn]);
    }

    attach() {
        this.listen(this.omniscientBox, "component-value-changed", (e) => {
            if (e.detail?.forced) return; // set from code, not a click
            const v = !!e.detail.value;
            if (v !== !!settings.get().wonders?.omniscient) {
                settings.patch({ wonders: { omniscient: v } });
                this.compute();
            }
        });
        this.listen(this.placeButton, "action-activate", () => this.onPlaceTacks());
        this.listen(this.clearButton, "action-activate", () => this.onClearTacks());
        onDmtReady(() => this.updateButtons());
        this.unsubscribe.push(state.subscribe((_s, changed) => {
            if (this.active && changed.includes("results")) this.render();
        }));
        this.unsubscribe.push(settings.subscribe((now, before) => {
            if (this.active && now.profile !== before?.profile) this.schedule(300);
        }));
        for (const name of RECOMPUTE_EVENTS) {
            const handler = (data) => {
                if (name === "PlayerTurnActivated" && data?.player !== GameContext.localPlayerID) return;
                state.set({ stale: { ...state.get().stale, wonders: true } });
                this.schedule(EVENT_DEBOUNCE_MS);
            };
            engine.on(name, handler);
            this.handlers.push([name, handler]);
        }
    }

    detach() {
        for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
        this.listeners = [];
        for (const off of this.unsubscribe) off();
        this.unsubscribe = [];
        for (const [name, handler] of this.handlers) engine.off(name, handler);
        this.handlers = [];
        clearTimeout(this.timer);
        this.active = false;
    }

    show() {
        this.active = true;
        this.compute();
    }

    hide() {
        this.active = false;
        clearTimeout(this.timer);
        overlay.clearPlan();
        overlay.clearSites();
    }

    schedule(delay) {
        clearTimeout(this.timer);
        if (!this.active) return;
        this.timer = setTimeout(() => this.compute(), delay);
    }

    compute() {
        clearTimeout(this.timer);
        try {
            runWonderPlanner(settings.get());
        } catch (error) {
            log.error("wonder planner failed", error);
            this.rows.innerHTML = "";
            this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_ERROR")));
        }
    }

    render() {
        const wonders = state.get().results.wonders;
        if (!wonders || !this.rows) return;
        const left = wonders.isFinalAge || !Number.isFinite(wonders.ageTurnsLeft) ? "-" : wonders.ageTurnsLeft;
        this.header.textContent = compose("LOC_XPL_WONDER_HEADER", Math.round(wonders.ageFrac * 100), left)
            + (wonders.omniscient ? ` | ${compose("LOC_XPL_WONDER_OMNISCIENT_ON")}` : "");
        const placeable = new Set(wonders.rows.filter((r) => r.best?.idx != null && r.status === "AVAILABLE").map((r) => r.type));
        for (const type of [...this.selected]) if (!placeable.has(type)) this.selected.delete(type);
        this.rows.innerHTML = "";
        if (wonders.rows.length === 0) {
            this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_EMPTY_NO_WONDERS")));
        }
        for (const row of wonders.rows) this.rows.appendChild(this.renderRow(row, placeable.has(row.type)));
        const spots = wonders.rows
            .filter((r) => r.best?.idx != null)
            .map((r) => ({ idx: r.best.idx, type: r.type, colour: RACE_COLOURS[r.race.label] ?? RACE_COLOURS.NONE }));
        overlay.showWonders(spots);
        this.renderStatus();
    }

    renderStatus() {
        if (!this.statusLine) return;
        const wonders = state.get().results.wonders;
        const parts = [];
        if (wonders) parts.push(compose("LOC_XPL_WONDER_STATUS", wonders.rows.filter((r) => r.status === "AVAILABLE").length, wonders.rows.length, wonders.elapsedMs));
        if (this.tackMessage) parts.push(this.tackMessage);
        this.statusLine.textContent = parts.join(" | ");
        this.updateButtons();
    }

    renderRow(w, placeable) {
        const live = w.status === "AVAILABLE" || w.status === "IN_PROGRESS";
        const row = el("div", `xpl-wonder-row xpl-race--${live ? w.race.label.toLowerCase() : "none"}${this.expanded === w.type ? " xpl-site-row--selected" : ""}`);
        const line = el("div", "xpl-site-line");
        if (placeable) {
            const box = document.createElement("fxs-checkbox");
            box.classList.add("xpl-site-check");
            box.setAttribute("selected", this.selected.has(w.type) ? "true" : "false");
            box.addEventListener("component-value-changed", (e) => {
                e.stopPropagation();
                if (e.detail?.forced) return;
                if (e.detail.value) this.selected.add(w.type);
                else this.selected.delete(w.type);
                this.updateButtons();
            });
            box.addEventListener("click", (e) => e.stopPropagation());
            line.appendChild(box);
        }
        line.appendChild(el("div", "xpl-wonder-name", w.name));
        line.appendChild(el("div", "xpl-wonder-where", this.where(w)));
        if (w.tier) {
            const tier = el("div", `xpl-wonder-tier xpl-wonder-tier--${w.tier.toLowerCase()}`, compose("LOC_XPL_WONDER_TIER", w.tier));
            tier.setAttribute("data-tooltip-content", compose("LOC_XPL_WONDER_TIER_TT"));
            line.appendChild(tier);
        }
        line.appendChild(el("div", "xpl-wonder-race", this.badge(w)));
        row.appendChild(line);

        const parts = [];
        const base = yieldsText(w.baseYields);
        if (base) parts.push(base);
        if (w.best?.idx != null) {
            const boost = yieldsText(w.best.byYield);
            if (w.best.buildings + w.best.planned > 0 && boost) {
                parts.push(compose("LOC_XPL_WONDER_BOOST", boost, w.best.buildings, w.best.planned));
            } else {
                parts.push(compose("LOC_XPL_WONDER_NO_BOOST"));
            }
            if (w.best.tacked) parts.push(compose("LOC_XPL_TAG_TACKED"));
            if (w.best.anchor) parts.push(compose("LOC_XPL_WONDER_ANCHOR"));
        }
        if (parts.length) row.appendChild(rich("div", "xpl-site-yields", parts.join("  ")));

        if (this.expanded === w.type) row.appendChild(this.renderDetails(w));
        row.addEventListener("click", () => {
            this.expanded = this.expanded === w.type ? null : w.type;
            const at = w.best?.idx != null ? w.best : w.site ?? null;
            if (at) focusPlot(at.x, at.y);
            this.render();
        });
        return row;
    }

    where(w) {
        if (w.status === "OURS") return compose("LOC_XPL_WONDER_OURS");
        if (w.status === "BUILT") return compose("LOC_XPL_WONDER_BUILT");
        if (w.status === "LOCKED") return compose("LOC_XPL_WONDER_LOCKED");
        if (!w.best) return "";
        const turns = compose("LOC_XPL_WONDER_TURNS", w.best.turns ?? w.turns ?? "-");
        return w.status === "IN_PROGRESS" ? `${compose("LOC_XPL_WONDER_IN_PROGRESS")} ${w.best.cityName} ${turns}` : `${w.best.cityName} ${turns}`;
    }

    badge(w) {
        if (w.status !== "AVAILABLE" && w.status !== "IN_PROGRESS") return "";
        return compose(`LOC_XPL_RACE_${w.race.label}`);
    }

    renderDetails(w) {
        const box = el("div", "xpl-site-reasons");
        if (w.description) box.appendChild(rich("div", "xpl-reason", compose(w.description)));
        for (const r of w.race.reasons ?? []) box.appendChild(el("div", "xpl-reason xpl-reason--warn", compose(r.key, ...r.args)));
        if (w.status === "LOCKED" && w.failure) box.appendChild(el("div", "xpl-reason xpl-reason--neg", compose(w.failure)));
        if (w.best?.noPlot) box.appendChild(el("div", "xpl-reason xpl-reason--warn", compose("LOC_XPL_WONDER_NO_PLOT")));
        if (w.best?.idx != null && w.best.open > 0) box.appendChild(el("div", "xpl-reason xpl-reason--pos", compose("LOC_XPL_WONDER_OPEN", w.best.open)));
        if (w.best?.loss > 0) box.appendChild(el("div", "xpl-reason xpl-reason--neg", compose("LOC_XPL_WONDER_LOSS")));
        for (const o of w.options.slice(1, 4)) {
            const best = o.plots[0];
            const boost = best ? yieldsText(best.byYield) : "";
            box.appendChild(rich("div", "xpl-reason", compose("LOC_XPL_WONDER_ALT", o.cityName, o.turns, boost || "-")));
        }
        return box;
    }

    updateButtons() {
        if (!this.placeButton) return;
        const active = isDmtActive();
        const ready = isDmtReady();
        const n = this.selected.size;
        this.placeButton.setAttribute("caption", n > 0 ? compose("LOC_XPL_PLACE_WONDER_TACKS", n) : compose("LOC_XPL_PLACE_TACKS_NONE"));
        this.placeButton.setAttribute("disabled", active && ready && n > 0 ? "false" : "true");
        this.clearButton.setAttribute("disabled", active && ready ? "false" : "true");
        let tooltip = "LOC_XPL_PLACE_WONDER_TACKS_TT";
        if (!active) tooltip = "LOC_XPL_DMT_MISSING_TT";
        else if (!ready) tooltip = "LOC_XPL_DMT_NOT_READY_TT";
        else if (networkMultiplayer()) tooltip = "LOC_XPL_MP_TACKS_TT";
        this.placeButton.setAttribute("data-tooltip-content", compose(tooltip));
    }

    async onPlaceTacks() {
        const rows = state.get().results.wonders?.rows ?? [];
        const entries = rows.filter((r) => this.selected.has(r.type) && r.best?.idx != null).map((r) => ({ x: r.best.x, y: r.best.y, type: r.type }));
        if (entries.length === 0) return;
        try {
            const r = await placeTacks(entries, "wonder", { replacePrevious: settings.get().replacePrevious });
            this.tackMessage = compose("LOC_XPL_TACKS_PLACED", r.placed.length, r.skipped.length);
            if (networkMultiplayer()) this.tackMessage += " " + compose("LOC_XPL_MP_TACKS_NOTE");
            this.selected.clear();
        } catch (error) {
            log.error("place wonder tacks failed", error);
            this.tackMessage = compose("LOC_XPL_ERROR");
        }
        this.compute();
    }

    async onClearTacks() {
        try {
            const { removed } = await clearOurTacks({ src: "wonder" });
            this.tackMessage = compose("LOC_XPL_TACKS_CLEARED", removed);
        } catch (error) {
            log.error("clear wonder tacks failed", error);
            this.tackMessage = compose("LOC_XPL_ERROR");
        }
        this.compute();
    }
}
