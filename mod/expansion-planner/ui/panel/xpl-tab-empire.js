/**
 * Empire tab: every settlement on one page.
 *  - Cities: population and growth, net yields, what the city is strongest at, the food
 *    its towns send it, and what is left of the current building plan there.
 *  - Towns: their Focus (and the recommended one when it differs), where their food goes,
 *    or a warning when it goes nowhere.
 * "Food network on the map" switches the food lens (map/xpl-food-lens.js). Cheap, so it
 * refreshes on game events while shown.
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { runEmpireOverview } from '../data/xpl-empire-job.js';
import { focusPlot } from '../map/xpl-camera.js';
import { isFoodLensActive, toggleFoodLens } from '../map/xpl-food-lens.js';
import { FOCUS_POPULATION } from '../core/xpl-town-focus.js';
import { focusGain, focusName } from './xpl-tab-towns.js';
import { applyTownFocus, cityOfSid } from '../data/xpl-city-actions.js';

const RECOMPUTE_EVENTS = ["CityPopulationChanged", "CityGrowthModeChanged", "CityYieldChanged", "CityInitialized", "CityRemovedFromMap", "CityTransfered", "PlayerTurnActivated"];
const EVENT_DEBOUNCE_MS = 800;
const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"];

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

function yieldsLine(y) {
    return YIELDS.map((k) => `[icon:${k}]${Math.round(y[k] ?? 0)}`).join(" ");
}

function projectName(projectType) {
    const name = GameInfo.Projects?.lookup?.(projectType)?.Name;
    return name ? compose(name) : projectType;
}

export class EmpireTab {
    constructor(root) {
        this.root = root;
        this.active = false;
        this.timer = 0;
        this.handlers = [];
        this.unsubscribe = null;
    }

    initialize() {
        this.header = this.root.querySelector(".xpl-empire-header");
        this.rows = this.root.querySelector(".xpl-empire-rows");
        this.lensButton = this.root.querySelector(".xpl-food-lens-toggle");
    }

    attach() {
        this.unsubscribe = state.subscribe((_s, changed) => {
            if (changed.includes("results") && this.active) this.render();
        });
        const onLens = () => {
            toggleFoodLens();
            this.updateLensButton();
        };
        this.lensButton?.addEventListener("action-activate", onLens);
        this.offLens = () => this.lensButton?.removeEventListener("action-activate", onLens);
        for (const name of RECOMPUTE_EVENTS) {
            const handler = (data) => {
                if (name === "PlayerTurnActivated" && data?.player !== GameContext.localPlayerID) return;
                if (!this.active) return;
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.compute(), EVENT_DEBOUNCE_MS);
            };
            engine.on(name, handler);
            this.handlers.push([name, handler]);
        }
    }

    detach() {
        this.unsubscribe?.();
        this.offLens?.();
        for (const [name, handler] of this.handlers) engine.off(name, handler);
        this.handlers = [];
        clearTimeout(this.timer);
        this.active = false;
    }

    show() {
        this.active = true;
        this.compute();
        this.updateLensButton();
    }

    hide() {
        this.active = false;
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

    /** Sets the recommended Focus (the game's own command); the tab refreshes on the game's event. */
    apply(r, option) {
        const town = cityOfSid(`c:${r.key}`);
        const result = town ? applyTownFocus(town.id, option.project) : { ok: false };
        if (this.header) this.header.textContent = result.ok ? compose("LOC_XPL_FOCUS_APPLIED", r.name, focusName(option)) : compose("LOC_XPL_ACTION_REFUSED", focusName(option));
    }

    updateLensButton() {
        this.lensButton?.setAttribute("caption", compose(isFoodLensActive() ? "LOC_XPL_FOOD_LENS_OFF" : "LOC_XPL_FOOD_LENS_ON"));
    }

    compute() {
        try {
            runEmpireOverview(settings.get());
        } catch (error) {
            log.error("empire overview failed", error);
            if (this.rows) {
                this.rows.innerHTML = "";
                this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_ERROR")));
            }
        }
    }

    render() {
        const o = state.get().results.empire;
        if (!o || !this.rows) return;
        const t = o.totals;
        this.header.textContent = compose("LOC_XPL_EMPIRE_HEADER", t.cities, t.towns, Math.round(t.foodSent), t.lonely, t.growing);
        this.rows.innerHTML = "";
        const cities = o.rows.filter((r) => !r.isTown);
        const towns = o.rows.filter((r) => r.isTown);
        if (cities.length > 0) this.rows.appendChild(el("div", "xpl-plan-group", compose("LOC_XPL_EMPIRE_CITIES", cities.length)));
        for (const r of cities) this.rows.appendChild(this.cityRow(r));
        if (towns.length > 0) this.rows.appendChild(el("div", "xpl-plan-group", compose("LOC_XPL_EMPIRE_TOWNS", towns.length)));
        for (const r of towns) this.rows.appendChild(this.townRow(r));
    }

    baseLine(r) {
        const line = el("div", "xpl-site-line");
        line.appendChild(el("div", "xpl-town-name", `${r.isCapital ? "★ " : ""}${r.name}`));
        const grow = r.turnsToGrow > 0 ? compose("LOC_XPL_EMPIRE_GROWS_IN", r.turnsToGrow) : "";
        line.appendChild(rich("div", "xpl-town-stats", `${compose("LOC_XPL_EMPIRE_POP", r.pop)}${grow ? `, ${grow}` : ""}`));
        return line;
    }

    cityRow(r) {
        const row = el("div", "xpl-town-row xpl-empire-row");
        row.appendChild(this.baseLine(r));
        row.appendChild(rich("div", "xpl-plan-yields", yieldsLine(r.yields)));
        const notes = [];
        if (r.strongest) notes.push(compose("LOC_XPL_EMPIRE_STRONGEST", `[icon:${r.strongest}]`, compose(`LOC_XPL_FAMILY_${r.strongest.replace("YIELD_", "")}`)));
        if (r.received > 0) notes.push(compose("LOC_XPL_EMPIRE_RECEIVES", Math.round(r.received), r.from.join(", ")));
        if (r.plan) notes.push(r.plan.next ? compose("LOC_XPL_EMPIRE_PLAN", r.plan.left, r.plan.next.name, r.plan.next.eta) : compose("LOC_XPL_EMPIRE_PLAN_N", r.plan.left));
        for (const n of notes) row.appendChild(rich("div", "xpl-reason", n));
        row.addEventListener("click", () => focusPlot(r.x, r.y));
        return row;
    }

    townRow(r) {
        const lonely = r.exporting && r.to.length === 0;
        const row = el("div", `xpl-town-row xpl-empire-row${lonely ? " xpl-empire-row--lonely" : ""}`);
        row.appendChild(this.baseLine(r));
        row.appendChild(rich("div", "xpl-plan-yields", yieldsLine(r.yields)));
        const focusText = r.focus ? compose("LOC_XPL_EMPIRE_FOCUS", projectName(r.focus))
            : r.pop >= FOCUS_POPULATION ? compose("LOC_XPL_EMPIRE_GROWING_READY", r.pop)
            : compose("LOC_XPL_EMPIRE_GROWING", r.pop, FOCUS_POPULATION);
        row.appendChild(rich("div", "xpl-town-focus", focusText));
        const rec = r.recommended;
        if (rec && !rec.current) {
            const line = el("div", "xpl-action-line");
            const text = rich("div", "xpl-reason xpl-reason--focus", compose("LOC_XPL_EMPIRE_RECOMMENDED", focusName(rec), focusGain(rec)));
            text.style.flex = "1 1 0";
            text.style.minWidth = "0";
            line.appendChild(text);
            if (rec.availableNow && r.pop >= FOCUS_POPULATION) line.appendChild(this.pill(compose("LOC_XPL_FOCUS_APPLY"), () => this.apply(r, rec)));
            row.appendChild(line);
        }
        if (lonely) row.appendChild(rich("div", "xpl-reason xpl-reason--neg", compose("LOC_XPL_EMPIRE_LONELY")));
        else if (r.exporting) row.appendChild(rich("div", "xpl-reason xpl-reason--pos", compose("LOC_XPL_EMPIRE_SENDS", Math.round(r.sentPerCity), r.to.join(", "))));
        else if (r.to.length === 0) row.appendChild(rich("div", "xpl-reason xpl-reason--warn", compose("LOC_XPL_EMPIRE_NO_CITY_YET")));
        row.addEventListener("click", () => focusPlot(r.x, r.y));
        return row;
    }
}
