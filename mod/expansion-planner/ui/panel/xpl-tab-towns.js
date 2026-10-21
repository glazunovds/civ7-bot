/**
 * Towns tab: one row per town with a convert / consider / wait / keep / blocked
 * verdict and the reasons behind it. Click a row to pan to the town and expand it.
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { runTownAdvisor } from '../data/xpl-town-job.js';
import { focusPlot } from '../map/xpl-camera.js';
import { applyTownFocus } from '../data/xpl-city-actions.js';
import { clearAdvice } from '../services/xpl-advice.js';
import { FOCUS_POPULATION } from '../core/xpl-town-focus.js';

const RECOMPUTE_EVENTS = ["CityPopulationChanged", "CityYieldChanged", "CityGrowthModeChanged", "CityProductionChanged", "PlayerCityLimitChanged", "PlayerSettlementCapChanged", "CityInitialized", "CityRemovedFromMap", "PlayerTurnActivated"];
const EVENT_DEBOUNCE_MS = 800;

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

const YIELD_ICONS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"];

/** The game's own name for a Focus project, or ours. */
export function focusName(o) {
    const name = GameInfo.Projects?.lookup?.(o.project)?.Name;
    return name ? compose(name) : compose(`LOC_XPL_FOCUS_${o.key}`);
}

/** "+6 [food] to connected cities (6 farms, pastures, ...)" for one Focus. */
export function focusGain(o) {
    const n = o.count;
    const args = { FARM: [n], MINE: [2 * n, n], RESORT: [n], URBAN: [n], HUB: [n], RELIGIOUS: [2 * n, n], TRADE: [n], FACTORY: [n] }[o.key] ?? [n];
    return compose(`LOC_XPL_FOCUS_GAIN_${o.key}`, ...args);
}

function rich(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.setAttribute("data-l10n-id", text);
    return e;
}

export class TownsTab {
    constructor(root) {
        this.root = root;
        this.expanded = null;
        this.active = false;
        this.timer = 0;
        this.handlers = [];
        this.unsubscribe = [];
    }

    initialize() {
        this.header = this.root.querySelector(".xpl-town-header");
        this.rows = this.root.querySelector(".xpl-town-rows");
        this.keepBox = this.root.querySelector(".xpl-expect-keep");
        this.keepBox?.setAttribute("selected", settings.get().towns?.expectKeepCities ? "true" : "false");
    }

    attach() {
        this.unsubscribe.push(state.subscribe((_s, changed) => {
            if (changed.includes("results") && this.active) this.render();
        }));
        const onKeep = (e) => {
            if (e.detail?.forced) return;
            const v = !!e.detail.value;
            if (v !== !!settings.get().towns?.expectKeepCities) {
                settings.patch({ towns: { expectKeepCities: v } });
                this.compute();
            }
        };
        this.keepBox?.addEventListener("component-value-changed", onKeep);
        this.unsubscribe.push(() => this.keepBox?.removeEventListener("component-value-changed", onKeep));
        for (const name of RECOMPUTE_EVENTS) {
            const handler = (data) => {
                if (name === "PlayerTurnActivated" && data?.player !== GameContext.localPlayerID) return;
                state.set({ stale: { ...state.get().stale, towns: true } });
                if (!this.active) return;
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.compute(), EVENT_DEBOUNCE_MS);
            };
            engine.on(name, handler);
            this.handlers.push([name, handler]);
        }
    }

    detach() {
        for (const off of this.unsubscribe) off();
        this.unsubscribe = [];
        for (const [name, handler] of this.handlers) engine.off(name, handler);
        this.handlers = [];
        clearTimeout(this.timer);
        this.active = false;
    }

    show() {
        this.active = true;
        clearAdvice("towns"); // the player is looking at the towns now
        this.compute();
    }

    /** A small button inside a row (its click does not reach the row). */
    pill(caption, onClick) {
        const b = document.createElement("fxs-button");
        b.classList.add("xpl-small-button", "xpl-row-action");
        b.setAttribute("caption", caption);
        b.addEventListener("action-activate", (e) => {
            e.stopPropagation?.();
            onClick();
        });
        b.addEventListener("click", (e) => e.stopPropagation());
        return b;
    }

    /** Sets the town's Focus (the game's own command); the tab refreshes on the game's event. */
    apply(town, option) {
        const r = applyTownFocus(town.id, option.project);
        this.message = r.ok ? compose("LOC_XPL_FOCUS_APPLIED", town.name, focusName(option)) : compose("LOC_XPL_ACTION_REFUSED", focusName(option));
        if (this.messageLine) this.messageLine.textContent = this.message;
    }

    hide() {
        this.active = false;
    }

    compute() {
        try {
            runTownAdvisor(settings.get());
        } catch (error) {
            log.error("town advisor failed", error);
            this.rows.innerHTML = "";
            this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_ERROR")));
        }
    }

    render() {
        const towns = state.get().results.towns;
        if (!towns || !this.rows) return;
        const c = towns.ctx;
        const limit = c.cityLimit > 0 ? c.cityLimit : "-";
        this.header.textContent = compose("LOC_XPL_TOWN_HEADER", c.numCities, limit, c.numSettlements, c.settlementCap || "-", Math.round(towns.ageFrac * 100), c.isFinalAge || !Number.isFinite(c.ageTurnsLeft) ? "-" : c.ageTurnsLeft);
        this.rows.innerHTML = "";
        this.messageLine = el("div", "xpl-status-line", this.message ?? "");
        this.rows.appendChild(this.messageLine);
        if (towns.rows.length === 0) {
            this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_EMPTY_NO_TOWNS")));
            return;
        }
        for (const row of towns.rows) this.rows.appendChild(this.renderRow(row));
    }

    renderRow({ town, advice, focus }) {
        const key = `${town.x}-${town.y}`;
        const row = el("div", `xpl-town-row xpl-verdict--${advice.verdict.toLowerCase()}`);
        const line = el("div", "xpl-site-line");
        line.appendChild(el("div", "xpl-town-name", town.name));
        line.appendChild(rich("div", "xpl-town-stats", compose("LOC_XPL_TOWN_STATS", town.pop, Math.round(town.prodNow), Math.round(town.prodPot), town.cost >= 0 ? town.cost : "-")));
        line.appendChild(el("div", "xpl-town-verdict", compose(`LOC_XPL_TOWN_${advice.verdict}`)));
        row.appendChild(line);
        const canApply = (o) => !o.current && o.availableNow && town.pop >= FOCUS_POPULATION;
        if (focus?.best) {
            const b = focus.best;
            const text = b.current ? compose("LOC_XPL_FOCUS_KEEP", focusName(b)) : compose("LOC_XPL_FOCUS_BEST", focusName(b), focusGain(b));
            const focusLine = el("div", "xpl-action-line");
            const label = rich("div", "xpl-town-focus", text);
            label.style.flex = "1 1 0";
            label.style.minWidth = "0";
            focusLine.appendChild(label);
            if (canApply(b)) focusLine.appendChild(this.pill(compose("LOC_XPL_FOCUS_APPLY"), () => this.apply(town, b)));
            row.appendChild(focusLine);
        }
        if (this.expanded === key) {
            const list = el("div", "xpl-site-reasons");
            if (Number.isFinite(advice.paybackTurns)) {
                list.appendChild(rich("div", "xpl-reason", compose("LOC_XPL_TOWN_ECON", advice.gainPerTurn, advice.paybackTurns, state.get().results.towns.ctx.prodToGold)));
            }
            for (const r of advice.reasons) {
                list.appendChild(rich("div", `xpl-reason xpl-reason--${r.sign === "+" ? "pos" : r.sign === "-" ? "neg" : "warn"}`, `${r.sign} ${compose(r.key, ...r.args)}`));
            }
            if (focus) {
                for (const n of focus.notes) list.appendChild(rich("div", "xpl-reason xpl-reason--warn", `! ${compose(n.key, ...n.args)}`));
                for (const o of focus.options) {
                    const tags = [o.current ? compose("LOC_XPL_FOCUS_CURRENT") : "", o.availableNow ? "" : compose("LOC_XPL_FOCUS_LATER")].filter(Boolean).join(", ");
                    const optLine = el("div", "xpl-action-line");
                    const optText = rich("div", "xpl-reason xpl-reason--focus", `${focusName(o)}: ${focusGain(o)}${tags ? ` (${tags})` : ""}`);
                    optText.style.flex = "1 1 0";
                    optText.style.minWidth = "0";
                    optLine.appendChild(optText);
                    if (canApply(o) && o !== focus.best) optLine.appendChild(this.pill(compose("LOC_XPL_FOCUS_APPLY"), () => this.apply(town, o)));
                    list.appendChild(optLine);
                }
            }
            row.appendChild(list);
        }
        row.addEventListener("click", () => {
            this.expanded = this.expanded === key ? null : key;
            focusPlot(town.x, town.y);
            this.render();
        });
        return row;
    }
}
