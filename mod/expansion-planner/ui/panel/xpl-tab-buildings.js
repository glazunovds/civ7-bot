/**
 * Buildings tab: pick a settlement (or planned site) and the buildings to plan; the
 * solver lays them out for the best weighted adjacency. Results show each planned
 * building's tile, base + adjacency yields, and the game's own number where known.
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { adviceFor, clearAdvice, suggestRecalc } from '../services/xpl-advice.js';
import { log } from '../services/xpl-log.js';
import { getRules } from '../data/xpl-rules-loader.js';
import { allTarget, hasPlanTacks, listTargets, nearCentres, placePlanTacks, startBuildingPlan } from '../data/xpl-building-job.js';
import { cancelJob } from '../services/xpl-scheduler.js';
import { overlay } from '../map/xpl-overlay.js';
import { focusPlot } from '../map/xpl-camera.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { clearOurTacks, isDmtReady, onDmtReady } from '../integrations/xpl-dmt-bridge.js';
import { QUEUE_MAX_NEW, buyPlanned, cityOfSid, purchaseAdvice, queueNextBuildings } from '../data/xpl-city-actions.js';

const SPECIALIST_OPTIONS = [0, 0.5, 1];
const WAITING_BUDGET_MS = 12; // CPU per frame for a plan while the panel is open (the player waits for it)
const IDLE_BUDGET_MS = 6;     // ... and after the panel was closed
const GOLD_EVENTS = ["TreasuryChanged", "CityMadePurchase", "CityProductionQueueChanged", "ConstructibleAddedToMap"];
const GOLD_REFRESH_MS = 400;
const YIELD_ICONS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"];
const FAMILY_ORDER = ["YIELD_SCIENCE", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_FOOD", "YIELD_CULTURE", "YIELD_HAPPINESS"];

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
        if (Math.abs(v) >= 0.05) parts.push(`[icon:${YIELD_ICONS[i]}]${Math.round(v * 10) / 10}`);
    });
    return parts.join(" ");
}

export class BuildingsTab {
    constructor(root) {
        this.root = root;
        this.targets = [];
        this.targetKey = null;
        this.active = false;
        this.timer = 0;
        this.handlers = [];
        this.listeners = [];
        this.tackMessage = "";
    }

    initialize() {
        const q = (sel) => this.root.querySelector(sel);
        this.targetDropdown = q(".xpl-target");
        this.specialistsDropdown = q(".xpl-specialists");
        this.buildingList = q(".xpl-building-list");
        this.optionsToggle = q(".xpl-building-toggle");
        this.optionsBox = q(".xpl-building-box");
        this.rows = q(".xpl-plan-rows");
        this.statusLine = q(".xpl-plan-status");
        this.staleHint = q(".xpl-plan-stale");
        this.checks = {
            futureTiles: q(".xpl-future-tiles"),
            respectTacks: q(".xpl-respect-tacks"),
            useEngine: q(".xpl-use-engine"),
            region: q(".xpl-region"),
            timeAware: q(".xpl-time-aware"),
            autoTacks: q(".xpl-auto-tacks"),
            townsAsCities: q(".xpl-towns-as-cities"),
            incremental: q(".xpl-incremental"),
            growthHints: q(".xpl-growth-hints"),
        };
        this.buttons = { all: q(".xpl-select-buildings-all"), none: q(".xpl-select-buildings-none"), recalc: q(".xpl-plan-recalc"), place: q(".xpl-place-building-tacks"), clear: q(".xpl-clear-building-tacks") };
        const bs = settings.get().buildings;
        this.specialistsDropdown.setAttribute("dropdown-items", JSON.stringify(SPECIALIST_OPTIONS.map((v) => ({ label: `LOC_XPL_SPECIALISTS_${String(v).replace(".", "_")}` }))));
        this.specialistsDropdown.setAttribute("selected-item-index", String(Math.max(0, SPECIALIST_OPTIONS.indexOf(Number(bs.specialists)))));
        for (const [key, box] of Object.entries(this.checks)) box.setAttribute("selected", this.checkValue(key) ? "true" : "false");
        this.buildChecklist();
        this.applyOptionsOpen();
    }

    /** Options and the building checklist fold away so the plan gets the room. */
    applyOptionsOpen() {
        const open = !!settings.get().buildings.optionsOpen;
        this.optionsBox?.classList.toggle("hidden", !open);
        this.updateOptionsSummary();
    }

    updateOptionsSummary() {
        if (!this.optionsToggle) return;
        const rules = getRules();
        const total = rules.buildings.length + rules.uniques.length + rules.warehouses.length;
        const selected = this.selectedSet().size;
        const flags = [];
        if (this.checkValue("region")) flags.push(compose("LOC_XPL_OPTIONS_REGION"));
        if (this.checkValue("timeAware")) flags.push(compose("LOC_XPL_OPTIONS_TIMING"));
        const sign = settings.get().buildings.optionsOpen ? "\u2013" : "+";
        this.optionsToggle.textContent = `${sign} ${compose("LOC_XPL_OPTIONS_SUMMARY", Math.min(selected, total), total)}${flags.length ? ` | ${flags.join(", ")}` : ""}`;
    }

    /** Checkbox defaults: region planning and auto-refreshed tacks are opt-in, the rest default to on. */
    checkValue(key) {
        const v = settings.get().buildings[key];
        return key === "region" || key === "autoTacks" || key === "townsAsCities" ? v === true : v !== false;
    }

    allTypes() {
        const rules = getRules();
        return [...rules.buildings, ...rules.uniques, ...rules.warehouses].map((b) => b.type);
    }

    /** Ticked buildings: everything except what the player unticked (new buildings start ticked). */
    selectedSet() {
        const excluded = new Set(settings.get().buildings.excluded ?? []);
        return new Set(this.allTypes().filter((t) => !excluded.has(t)));
    }

    buildChecklist() {
        const rules = getRules();
        const selected = this.selectedSet();
        this.buildingList.innerHTML = "";
        const groups = new Map();
        for (const b of rules.buildings) {
            const fam = FAMILY_ORDER.includes(b.family) ? b.family : "OTHER";
            if (!groups.has(fam)) groups.set(fam, []);
            groups.get(fam).push(b);
        }
        if (rules.uniques.length > 0) groups.set("UNIQUE", rules.uniques);
        groups.set("WAREHOUSE", rules.warehouses);
        for (const [fam, list] of groups) {
            if (list.length === 0) continue;
            const group = el("div", "xpl-building-group");
            const title = fam === "WAREHOUSE" ? compose("LOC_XPL_FAMILY_WAREHOUSE")
                : fam === "UNIQUE" ? compose("LOC_XPL_FAMILY_UNIQUE")
                : `[icon:${fam}] ${compose(`LOC_XPL_FAMILY_${fam.replace("YIELD_", "")}`)}`;
            group.appendChild(rich("div", "xpl-building-group__title", title));
            for (const b of list) {
                const item = el("div", "xpl-check xpl-building-check");
                const box = document.createElement("fxs-checkbox");
                box.setAttribute("selected", selected.has(b.type) ? "true" : "false");
                box.addEventListener("component-value-changed", (e) => {
                    if (e.detail?.forced) return; // set from code, not a click
                    this.toggleBuilding(b.type, !!e.detail.value);
                });
                item.appendChild(box);
                item.appendChild(el("span", null, compose(b.name)));
                group.appendChild(item);
            }
            this.buildingList.appendChild(group);
        }
    }

    toggleBuilding(type, on) {
        const excluded = new Set(settings.get().buildings.excluded ?? []);
        if (excluded.has(type) === !on) return;
        if (on) excluded.delete(type);
        else excluded.add(type);
        settings.patch({ buildings: { excluded: [...excluded] } });
        this.updateOptionsSummary();
        this.markStale("OPTIONS");
    }

    listen(target, type, fn) {
        if (!target) return;
        target.addEventListener(type, fn);
        this.listeners.push([target, type, fn]);
    }

    attach() {
        this.listen(this.targetDropdown, "dropdown-selection-change", (e) => {
            const t = this.targets[e.detail.selectedIndex];
            if (t && t.key !== this.targetKey) {
                this.targetKey = t.key;
                if (t.kind !== "all") focusPlot(t.x, t.y);
                this.compute();
            }
        });
        this.listen(this.specialistsDropdown, "dropdown-selection-change", (e) => {
            const v = SPECIALIST_OPTIONS[e.detail.selectedIndex];
            if (v !== undefined && v !== Number(settings.get().buildings.specialists)) {
                settings.patch({ buildings: { specialists: v } });
                this.markStale("OPTIONS");
            }
        });
        for (const [key, box] of Object.entries(this.checks)) {
            this.listen(box, "component-value-changed", (e) => {
                if (e.detail?.forced) return;
                const v = !!e.detail.value;
                if (v !== this.checkValue(key)) {
                    settings.patch({ buildings: { [key]: v } });
                    this.updateOptionsSummary();
                    if (!["autoTacks", "incremental", "growthHints"].includes(key)) this.markStale("OPTIONS");
                }
            });
        }
        this.listen(this.buttons.all, "action-activate", () => {
            settings.patch({ buildings: { excluded: [] } });
            this.buildChecklist();
            this.updateOptionsSummary();
            this.markStale("OPTIONS");
        });
        this.listen(this.buttons.none, "action-activate", () => {
            settings.patch({ buildings: { excluded: this.allTypes() } });
            this.buildChecklist();
            this.updateOptionsSummary();
            this.markStale("OPTIONS");
        });
        this.listen(this.buttons.recalc, "action-activate", () => this.compute());
        this.listen(this.optionsToggle, "click", () => {
            settings.patch({ buildings: { optionsOpen: !settings.get().buildings.optionsOpen } });
            this.applyOptionsOpen();
        });
        this.listen(this.buttons.place, "action-activate", () => this.onPlaceTacks());
        this.listen(this.buttons.clear, "action-activate", () => this.onClearTacks());
        // Game events are watched by hud/xpl-recalc-watch.js (also while the panel is closed).
        this.unsubscribe = state.subscribe((_s, changed) => {
            if (!this.active) return;
            if (changed.includes("results")) this.render();
            else if (changed.includes("status") || changed.includes("advice")) this.renderStatus();
        });
        onDmtReady(() => this.updateButtons());
        // Gold, purchases and queues change what can be bought: refresh the gold box.
        for (const name of GOLD_EVENTS) {
            const handler = () => {
                this.goldAdvice = null;
                if (!this.active) return;
                clearTimeout(this.goldTimer);
                this.goldTimer = setTimeout(() => this.renderActionBoxes(), GOLD_REFRESH_MS);
            };
            engine.on(name, handler);
            this.handlers.push([name, handler]);
        }
    }

    detach() {
        for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
        this.listeners = [];
        this.unsubscribe?.();
        for (const [name, handler] of this.handlers) engine.off(name, handler);
        this.handlers = [];
        clearTimeout(this.timer);
        cancelJob("buildings");
        this.active = false;
    }

    /** Opening the tab shows the last plan; it never starts a new one by itself. */
    show() {
        this.active = true;
        this.refreshTargets();
        this.render();
    }

    markStale(reason) {
        state.set({ stale: { ...state.get().stale, plans: true } });
        suggestRecalc("plans", reason);
    }

    hide() {
        this.active = false;
        cancelJob("buildings");
        overlay.clearPlan();
    }

    refreshTargets() {
        try {
            const list = listTargets();
            // "All my settlements" first: one plan, one click to tack everything.
            this.targets = list.length > 1 ? [allTarget(list), ...list] : list;
        } catch (error) {
            log.error("listTargets failed", error);
            this.targets = [];
        }
        this.targetKey ??= settings.get().buildings.lastTarget;
        if (!this.targets.some((t) => t.key === this.targetKey)) this.targetKey = this.targets[0]?.key ?? null;
        const items = this.targets.map((t) => ({
            label: t.kind === "all" ? compose("LOC_XPL_TARGET_ALL_N", t.count)
                : t.kind === "planned" ? compose("LOC_XPL_TARGET_PLANNED", t.x, t.y) + (t.role === "TOWN" ? ` — ${compose("LOC_XPL_ROLE_TOWN")}` : t.role === "CITY" ? ` — ${compose("LOC_XPL_ROLE_CITY")}` : "")
                : compose(t.kind === "town" ? "LOC_XPL_TARGET_TOWN" : "LOC_XPL_TARGET_CITY", t.name),
        }));
        this.targetDropdown.setAttribute("dropdown-items", JSON.stringify(items));
        const index = this.targets.findIndex((t) => t.key === this.targetKey);
        if (index >= 0) this.targetDropdown.setAttribute("selected-item-index", String(index));
    }

    compute() {
        clearTimeout(this.timer);
        clearAdvice("plans");
        const target = this.targets.find((t) => t.key === this.targetKey);
        if (!target) {
            this.rows.innerHTML = "";
            this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_EMPTY_NO_SETTLEMENTS")));
            return;
        }
        if (settings.get().buildings.lastTarget !== target.key) settings.patch({ buildings: { lastTarget: target.key } });
        try {
            // The player is waiting: more CPU per frame while the panel is open.
            startBuildingPlan(target, settings.get(), { budgetMs: () => (this.rows?.isConnected ? WAITING_BUDGET_MS : IDLE_BUDGET_MS) });
        } catch (error) {
            log.error("startBuildingPlan failed", error);
            state.set({ status: { busy: false, progress: 0, message: "LOC_XPL_ERROR" } });
        }
    }

    renderStatus() {
        const { status, results } = state.get();
        const plans = results.plans;
        if (status.busy) this.statusLine.textContent = compose("LOC_XPL_COMPUTING", Math.round((status.progress ?? 0) * 100));
        else if (status.message) this.statusLine.textContent = compose(status.message);
        else if (plans) {
            this.statusLine.textContent = compose("LOC_XPL_PLAN_STATUS", plans.placements.length, plans.fillers.length, plans.elapsedMs)
                + (plans.incremental ? ` | ${compose("LOC_XPL_PLAN_INCREMENTAL", plans.incremental.changed, plans.incremental.of)}` : "")
                + (plans.timeAware ? ` | ${compose("LOC_XPL_PLAN_HORIZON", plans.horizon)}` : "")
                + (this.tackMessage ? ` | ${this.tackMessage}` : "");
        }
        const shown = !!plans && plans.targetKey === this.targetKey;
        const advice = adviceFor("plans");
        const suggest = !status.busy && (!shown || advice.length > 0);
        this.buttons.recalc?.classList.toggle("xpl-suggested", suggest);
        if (this.staleHint) {
            const reasons = advice.map((r) => compose(`LOC_XPL_STALE_${r}`)).join(", ");
            this.staleHint.textContent = !status.busy && shown && reasons ? compose("LOC_XPL_PLAN_STALE", reasons) : "";
        }
    }

    updateButtons() {
        const plans = state.get().results.plans;
        const ready = isDmtActive() && isDmtReady();
        const canPlace = ready && !!plans && plans.placements.length + plans.fillers.length > 0;
        this.buttons.place.setAttribute("disabled", canPlace && !this.placing ? "false" : "true");
        this.buttons.clear.setAttribute("disabled", ready && !this.placing ? "false" : "true");
        this.buttons.place.setAttribute("data-tooltip-content", compose(isDmtActive() ? "LOC_XPL_PLACE_BUILDING_TACKS_TT" : "LOC_XPL_DMT_MISSING_TT"));
    }

    render() {
        const plans = state.get().results.plans;
        this.renderStatus();
        this.updateButtons();
        this.rows.innerHTML = "";
        if (!plans || plans.targetKey !== this.targetKey) {
            this.rows.appendChild(el("div", "xpl-empty", compose("LOC_XPL_PLAN_PRESS_RECALC")));
            overlay.clearPlan();
            return;
        }
        if (plans.placements.length === 0 && plans.fillers.length === 0) {
            this.rows.appendChild(el("div", "xpl-empty", compose(plans.unexplored ? "LOC_XPL_EMPTY_UNEXPLORED_SITE" : "LOC_XPL_EMPTY_NO_PLAN")));
            if (plans.unexplored) return; // per-building "no valid tile" lines add nothing here
        }
        const grouped = plans.members.length > 1;
        this.actionBoxes = el("div", "xpl-plan-actions");
        this.rows.appendChild(this.actionBoxes);
        this.renderActionBoxes();
        const counts = new Map();
        for (const p of plans.placements) counts.set(p.sid, (counts.get(p.sid) ?? 0) + 1);
        let lastGroup = null;
        for (const p of plans.placements) {
            if (p.sid !== lastGroup) {
                lastGroup = p.sid;
                this.rows.appendChild(this.groupHeader(p.sid, `${p.settlementName} (${counts.get(p.sid)})`, plans));
            }
            this.rows.appendChild(this.renderPlacement(p, plans.timeAware));
        }
        if (plans.fillers.length > 0) this.rows.appendChild(el("div", "xpl-plan-group", `${compose("LOC_XPL_FAMILY_WAREHOUSE")} (${plans.fillers.length})`));
        for (const f of plans.fillers) {
            const row = el("div", "xpl-plan-row xpl-plan-row--filler");
            const line = el("div", "xpl-plan-line");
            line.appendChild(el("div", "xpl-plan-name", f.name));
            line.appendChild(el("div", "xpl-plan-where", this.where(f) + (grouped ? `, ${f.settlementName}` : "")));
            row.appendChild(line);
            if (f.upkeep?.some((v) => v > 0)) row.appendChild(rich("div", "xpl-plan-yields", `${compose("LOC_XPL_PLAN_UPKEEP")} ${yieldsText(f.upkeep.map((v) => -v))}`));
            row.addEventListener("click", () => focusPlot(f.x, f.y));
            this.rows.appendChild(row);
        }
        if (plans.unplaced.length > 0) {
            const box = el("div", "xpl-site-reasons");
            for (const u of plans.unplaced) {
                const name = grouped && u.settlementName ? `${u.name} (${u.settlementName})` : u.name;
                box.appendChild(el("div", "xpl-reason xpl-reason--warn", compose(`LOC_XPL_UNPLACED_${u.reason}`, name)));
            }
            this.rows.appendChild(box);
        }
        const future = new Set(plans.placements.filter((p) => p.future).map((p) => p.idx));
        overlay.showPlan(plans.placements, plans.fillers, future);
        this.autoRefreshTacks(plans);
    }

    /** "Keep my tacks up to date": a new plan replaces the tacks we placed for it earlier. */
    autoRefreshTacks(plans) {
        if (!settings.get().buildings.autoTacks || plans === this.tackedPlan || !isDmtReady()) return;
        if (!hasPlanTacks(plans)) return; // only renew tacks the player asked for once
        this.runPlacement(plans, true);
    }

    /**
     * Places the plan's tacks (button or automatic refresh). One run at a time: the
     * buttons are disabled meanwhile and the status line counts the progress.
     */
    async runPlacement(plans, auto) {
        if (this.placing) return;
        this.placing = true;
        this.tackedPlan = plans;
        this.updateButtons();
        let shown = 0;
        try {
            const r = await placePlanTacks(plans, {
                replacePrevious: auto || settings.get().replacePrevious,
                onProgress: (done, total) => {
                    if (done - shown < 6 && done < total) return; // a few updates per second are enough
                    shown = done;
                    this.tackMessage = compose("LOC_XPL_TACKS_WORKING", done, total);
                    this.renderStatus();
                },
            });
            this.tackMessage = compose(auto ? "LOC_XPL_TACKS_AUTO_DIFF" : "LOC_XPL_TACKS_PLACED_DIFF", r.placed.length - r.kept, r.kept, r.removed, r.skipped.length);
        } catch (error) {
            log.error("place building tacks failed", error);
            this.tackMessage = compose("LOC_XPL_ERROR");
        } finally {
            this.placing = false;
            this.updateButtons();
            this.renderStatus();
        }
    }

    where(p) {
        if (p.dist === 0) return compose("LOC_XPL_WHERE_CENTRE");
        return compose("LOC_XPL_WHERE_FROM_CENTRE", p.dist, compose(`LOC_XPL_DIR_${p.dir || "X"}`));
    }

    renderPlacement(p, timeAware) {
        const row = el("div", "xpl-plan-row");
        const line = el("div", "xpl-plan-line");
        line.appendChild(el("div", "xpl-plan-name", p.name));
        line.appendChild(el("div", "xpl-plan-where", this.where(p)));
        row.appendChild(line);
        const chips = [];
        if (timeAware) chips.push(p.afterAge ? ["late", compose("LOC_XPL_BADGE_AFTER_AGE")] : ["eta", compose("LOC_XPL_BADGE_ETA", p.eta)]);
        if (p.uniqueQuarter) chips.push(["unique", compose("LOC_XPL_BADGE_UNIQUE_QUARTER")]);
        else if (p.unique) chips.push(["unique", compose("LOC_XPL_BADGE_UNIQUE")]);
        if (p.quarter) chips.push(["quarter", compose("LOC_XPL_BADGE_QUARTER")]);
        if (p.future) chips.push(["future", compose("LOC_XPL_BADGE_FUTURE")]);
        if (p.locked) chips.push(["locked", compose("LOC_XPL_BADGE_LOCKED")]);
        if (p.overbuild) chips.push(["overbuild", compose("LOC_XPL_BADGE_OVERBUILD")]);
        if (p.net < 0) chips.push(["costly", compose("LOC_XPL_BADGE_COSTLY")]);
        const info = el("div", "xpl-plan-info");
        for (const [kind, text] of chips) info.appendChild(el("div", `xpl-chip xpl-chip--${kind}`, text));
        const adj = p.adjacencyTotal > 0 ? `  ${compose("LOC_XPL_PLAN_ADJ")} ${yieldsText(p.adjacency)}` : "";
        const engine = p.engineYields ? `  ${compose("LOC_XPL_PLAN_ENGINE")} ${yieldsText(p.engineYields)}` : "";
        const upkeep = p.upkeep?.some((v) => v > 0) ? `  ${compose("LOC_XPL_PLAN_UPKEEP")} ${yieldsText(p.upkeep.map((v) => -v))}` : "";
        info.appendChild(rich("div", "xpl-plan-yields", `${compose("LOC_XPL_PLAN_BASE")} ${yieldsText(p.base)}${adj}${engine}${upkeep}`));
        row.appendChild(info);
        if (p.bestNow) {
            // The production menu shows the game's best tile right now; say why the plan differs.
            const b = p.bestNow;
            const parts = [compose("LOC_XPL_BEST_NOW", this.where(b), yieldsText(b.yields))];
            if (b.here) parts.push(compose("LOC_XPL_BEST_NOW_HERE", yieldsText(b.here)));
            parts.push(b.takenBy.length ? compose("LOC_XPL_BEST_NOW_TAKEN", b.takenBy.join(", ")) : compose("LOC_XPL_BEST_NOW_LATER"));
            row.appendChild(rich("div", "xpl-plan-note", parts.join("; ")));
        }
        row.addEventListener("click", () => focusPlot(p.x, p.y));
        return row;
    }

    /** A small button inside a row (its click does not reach the row). */
    pill(caption, onClick, disabled = false) {
        const b = document.createElement("fxs-button");
        b.classList.add("xpl-small-button", "xpl-row-action");
        b.setAttribute("caption", caption);
        if (disabled) b.setAttribute("disabled", "true");
        b.addEventListener("action-activate", (e) => {
            e.stopPropagation?.();
            if (!disabled) onClick();
        });
        b.addEventListener("click", (e) => e.stopPropagation());
        return b;
    }

    /** Settlement header; a city's has a button to queue its next planned buildings. */
    groupHeader(sid, text, plans) {
        const head = el("div", "xpl-plan-group");
        head.appendChild(el("div", "xpl-plan-group__name", text));
        const city = cityOfSid(sid);
        if (city && !city.isTown) {
            const b = this.pill(compose("LOC_XPL_QUEUE_NEXT", QUEUE_MAX_NEW), () => this.onQueue(plans, sid));
            b.setAttribute("data-tooltip-content", compose("LOC_XPL_QUEUE_NEXT_TT", QUEUE_MAX_NEW));
            head.appendChild(b);
        }
        return head;
    }

    onQueue(plans, sid) {
        const r = queueNextBuildings(plans, sid);
        const city = plans.members.find((m) => m.key === sid)?.name ?? "";
        const names = r.queued.map((t) => plans.placements.find((p) => p.sid === sid && p.type === t)?.name ?? t);
        this.tackMessage = names.length > 0 ? compose("LOC_XPL_QUEUED", names.length, city, names.join(", ")) : compose("LOC_XPL_QUEUE_NONE", city);
        this.renderStatus();
    }

    /** Upkeep warnings and gold purchases for the shown plan. */
    renderActionBoxes() {
        const box = this.actionBoxes;
        const plans = state.get().results.plans;
        if (!box || !plans || plans.targetKey !== this.targetKey) return;
        box.innerHTML = "";
        // 1. Buildings that give less than their upkeep (by the chosen priorities).
        const all = [...plans.placements, ...plans.fillers];
        const costly = all.filter((p) => p.net < 0);
        if (costly.length > 0) {
            const warn = el("div", "xpl-action-box xpl-action-box--warn");
            const grouped = plans.members.length > 1;
            const list = costly.map((p) => (grouped ? `${p.name} (${p.settlementName})` : p.name)).join(", ");
            warn.appendChild(rich("div", "xpl-action-box__text", compose("LOC_XPL_COSTLY_HEADER", list)));
            // Unticking is for every settlement: offer it only where the building loses everywhere.
            const types = [...new Set(costly.map((p) => p.type))].filter((t) => all.filter((p) => p.type === t).every((p) => p.net < 0));
            const buttons = el("div", "xpl-action-box__buttons");
            for (const t of types) {
                const name = costly.find((p) => p.type === t).name;
                buttons.appendChild(this.pill(compose("LOC_XPL_UNTICK", name), () => {
                    this.toggleBuilding(t, false);
                    this.buildChecklist();
                }));
            }
            if (types.length > 0) warn.appendChild(buttons);
            box.appendChild(warn);
        }
        // 2. Gold purchases from this plan.
        if (!this.goldAdvice || this.goldAdvice.plans !== plans) {
            try {
                this.goldAdvice = { plans, advice: purchaseAdvice(plans, settings.get()) };
            } catch (error) {
                log.error("purchase advice failed", error);
                this.goldAdvice = { plans, advice: null };
            }
        }
        const advice = this.goldAdvice.advice;
        if (!advice) return;
        const gold = el("div", "xpl-action-box xpl-action-box--gold");
        gold.appendChild(rich("div", "xpl-action-box__title", compose("LOC_XPL_GOLD_HEADER", Math.floor(advice.gold))));
        if (advice.picks.length === 0) gold.appendChild(el("div", "xpl-action-box__text", compose("LOC_XPL_GOLD_NONE")));
        for (const pick of advice.picks) {
            const line = el("div", "xpl-action-line");
            const key = pick.town ? "LOC_XPL_GOLD_PICK_TOWN" : "LOC_XPL_GOLD_PICK";
            line.appendChild(rich("div", `xpl-action-box__text${pick.inBudget ? "" : " xpl-dim"}`, compose(key, pick.name, pick.settlementName, Math.round(pick.cost), Math.round(pick.turnsGained), Math.round(pick.value))));
            // One purchase per pick and turn: the game handles the request a moment later, so the
            // offer would still look valid and a second click could send it again.
            const boughtKey = `${Game.turn}|${pick.key}`;
            const already = this.bought?.has(boughtKey);
            line.appendChild(this.pill(compose(already ? "LOC_XPL_BOUGHT_SHORT" : "LOC_XPL_BUY"), () => {
                if (this.bought?.has(boughtKey)) return;
                const ok = buyPlanned(pick);
                if (ok) (this.bought ??= new Set()).add(boughtKey);
                this.tackMessage = compose(ok ? "LOC_XPL_BOUGHT" : "LOC_XPL_ACTION_REFUSED", pick.name);
                this.renderStatus();
                this.renderActionBoxes();
            }, !pick.affordable || already));
            line.addEventListener("click", () => focusPlot(pick.x, pick.y));
            gold.appendChild(line);
        }
        box.appendChild(gold);
    }

    async onPlaceTacks() {
        const plans = state.get().results.plans;
        if (!plans) return;
        await this.runPlacement(plans, false);
    }

    async onClearTacks() {
        const plans = state.get().results.plans;
        if (this.placing) return;
        try {
            const { removed } = await clearOurTacks({ src: "build", filter: plans ? nearCentres(plans.centres) : null });
            this.tackMessage = compose("LOC_XPL_TACKS_CLEARED", removed);
        } catch (error) {
            log.error("clear building tacks failed", error);
            this.tackMessage = compose("LOC_XPL_ERROR");
        }
        this.renderStatus();
    }
}
