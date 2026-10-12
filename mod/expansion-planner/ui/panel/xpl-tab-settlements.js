/**
 * Settlements tab: search controls, ranked site list, map highlights.
 * Row click pans the camera and selects the site (border + reasons); hover shows the
 * radius-3 footprint; checkboxes mark rows for "Place tacks" (milestone M2).
 */
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { adviceFor, clearAdvice } from '../services/xpl-advice.js';
import { log } from '../services/xpl-log.js';
import { startSiteSearch } from '../data/xpl-site-job.js';
import { cancelJob } from '../services/xpl-scheduler.js';
import { overlay } from '../map/xpl-overlay.js';
import { focusPlot } from '../map/xpl-camera.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { clearOurTacks, isDmtReady, networkMultiplayer, onDmtReady, ourTackKeys, placeTacks } from '../integrations/xpl-dmt-bridge.js';
import { tackKey } from '../integrations/xpl-tack-registry.js';

const SETTLE_TACK_TYPE = "BUILDING_CITY_HALL";

const OVERLAP_OPTIONS = ["LOW", "MEDIUM", "HIGH"];
const ROLE_OPTIONS = ["BOTH", "CITY", "TOWN"];
const SORT_OPTIONS = ["SCORE", "PROD", "FOOD", "ROOM", "DIST"];
const RECOMPUTE_DEBOUNCE_MS = 300;
const YIELD_ICONS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"];

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

/** Rich text (supports [icon:...] markup) through the localisation attribute, like fxs-dropdown does. */
function rich(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.setAttribute("data-l10n-id", text);
    return e;
}

export class SettlementsTab {
    constructor(root) {
        this.root = root;
        this.sort = "SCORE";
        this.selectedIdx = -1;
        this.recomputeTimer = 0;
        this.unsubscribe = [];
        this.engineHandlers = [];
        this.active = false;
    }

    /** Called once from the panel's onInitialize. */
    initialize() {
        const q = (sel) => this.root.querySelector(sel);
        this.radiusSlider = q(".xpl-radius");
        this.radiusValue = q(".xpl-radius-value");
        this.topNSlider = q(".xpl-topn");
        this.topNValue = q(".xpl-topn-value");
        this.overlapDropdown = q(".xpl-overlap");
        this.rolesDropdown = q(".xpl-roles");
        this.sortDropdown = q(".xpl-sort");
        this.checkboxes = {
            includeHidden: q(".xpl-include-hidden"),
            spread: q(".xpl-spread"),
            useAI: q(".xpl-use-ai"),
            heatmap: q(".xpl-heatmap"),
            keepHighlights: q(".xpl-keep-highlights"),
        };
        this.rows = q(".xpl-site-rows");
        this.statusLine = q(".xpl-site-status");
        this.recalcButton = q(".xpl-recalc");
        this.selectAllButton = q(".xpl-select-all");
        this.placeButton = q(".xpl-place-tacks");
        this.clearButton = q(".xpl-clear-tacks");
        this.tackMessage = "";

        const s = settings.get();
        this.radiusSlider.setAttribute("value", String(s.radius));
        this.topNSlider.setAttribute("value", String(s.topN));
        this.rolesDropdown?.setAttribute("dropdown-items", JSON.stringify(ROLE_OPTIONS.map((o) => ({ label: `LOC_XPL_ROLES_${o}` }))));
        this.rolesDropdown?.setAttribute("selected-item-index", String(Math.max(0, ROLE_OPTIONS.indexOf(s.siteRoles))));
        this.overlapDropdown.setAttribute("dropdown-items", JSON.stringify(OVERLAP_OPTIONS.map((o) => ({ label: `LOC_XPL_OVERLAP_${o}` }))));
        this.overlapDropdown.setAttribute("selected-item-index", String(OVERLAP_OPTIONS.indexOf(s.overlapTol)));
        this.sortDropdown.setAttribute("dropdown-items", JSON.stringify(SORT_OPTIONS.map((o) => ({ label: `LOC_XPL_SORT_${o}` }))));
        this.sortDropdown.setAttribute("selected-item-index", "0");
        for (const [key, box] of Object.entries(this.checkboxes)) {
            box.setAttribute("selected", s[key] ? "true" : "false");
        }
        this.radiusValue.textContent = String(s.radius);
        this.topNValue.textContent = String(s.topN);
        this.updateTackButtons();
    }

    /** Called from the panel's onAttach. */
    attach() {
        this.listen(this.radiusSlider, "component-value-changed", (e) => {
            const v = Math.round(e.detail.value);
            this.radiusValue.textContent = String(v);
            if (v !== settings.get().radius) settings.patch({ radius: v });
        });
        this.listen(this.topNSlider, "component-value-changed", (e) => {
            const v = Math.round(e.detail.value);
            this.topNValue.textContent = String(v);
            if (v !== settings.get().topN) settings.patch({ topN: v });
        });
        this.listen(this.rolesDropdown, "dropdown-selection-change", (e) => {
            const v = ROLE_OPTIONS[e.detail.selectedIndex];
            if (v && v !== settings.get().siteRoles) settings.patch({ siteRoles: v });
        });
        this.listen(this.overlapDropdown, "dropdown-selection-change", (e) => {
            const v = OVERLAP_OPTIONS[e.detail.selectedIndex];
            if (v && v !== settings.get().overlapTol) settings.patch({ overlapTol: v });
        });
        this.listen(this.sortDropdown, "dropdown-selection-change", (e) => {
            this.sort = SORT_OPTIONS[e.detail.selectedIndex] ?? "SCORE";
            this.render();
        });
        for (const [key, box] of Object.entries(this.checkboxes)) {
            this.listen(box, "component-value-changed", (e) => {
                if (e.detail?.forced) return; // set from code, not a click
                const v = !!e.detail.value;
                if (v !== settings.get()[key]) settings.patch({ [key]: v });
            });
        }
        this.listen(this.recalcButton, "action-activate", () => this.recompute());
        this.listen(this.selectAllButton, "action-activate", () => this.toggleSelectAll());
        this.listen(this.placeButton, "action-activate", () => this.onPlaceTacks());
        this.listen(this.clearButton, "action-activate", () => this.onClearTacks());
        onDmtReady(() => this.updateTackButtons());

        this.unsubscribe.push(settings.subscribe((now, before) => this.onSettingsChanged(now, before)));
        this.unsubscribe.push(state.subscribe((_s, changed) => {
            if (!this.active) return; // another tab owns the map overlay
            if (changed.includes("results")) this.render();
            else if (changed.includes("selection")) this.updateTackButtons();
            else if (changed.includes("status")) this.renderStatus();
            else if (changed.includes("advice")) this.render();
        }));
        // Map changes are watched by hud/xpl-recalc-watch.js and only suggest a new search.
    }

    detach() {
        for (const off of this.unsubscribe) off();
        this.unsubscribe = [];
        for (const [name, handler] of this.engineHandlers) engine.off(name, handler);
        this.engineHandlers = [];
        for (const [target, type, fn] of this.domListeners ?? []) target.removeEventListener(type, fn);
        this.domListeners = [];
        clearTimeout(this.recomputeTimer);
        cancelJob("sites");
        if (!settings.get().keepHighlights) overlay.clear();
        this.active = false;
    }

    listen(target, type, fn) {
        if (!target) return;
        target.addEventListener(type, fn);
        (this.domListeners ??= []).push([target, type, fn]);
    }

    /** Tab became visible. */
    show() {
        this.active = true;
        const sites = state.get().results.sites;
        if (!sites) {
            this.recompute(); // first visit: one quick search
        } else {
            this.render();
        }
    }

    hide() {
        this.active = false;
    }

    onSettingsChanged(now, before) {
        const keys = ["profile", "radius", "topN", "includeHidden", "overlapTol", "spread", "useAI", "siteRoles"];
        if (keys.some((k) => now[k] !== before[k])) {
            state.set({ stale: { ...state.get().stale, sites: true } });
            if (this.active) this.scheduleRecompute(RECOMPUTE_DEBOUNCE_MS);
        } else if (now.heatmap !== before.heatmap) {
            this.render();
        }
    }

    scheduleRecompute(delay) {
        state.set({ stale: { ...state.get().stale, sites: true } });
        if (!this.active) return;
        clearTimeout(this.recomputeTimer);
        this.recomputeTimer = setTimeout(() => this.recompute(), delay);
    }

    recompute() {
        clearTimeout(this.recomputeTimer);
        clearAdvice("sites");
        try {
            startSiteSearch(settings.get());
        } catch (error) {
            log.error("startSiteSearch failed", error);
            state.set({ status: { busy: false, progress: 0, message: "LOC_XPL_ERROR" } });
        }
    }

    toggleSelectAll() {
        const picks = state.get().results.sites?.picks ?? [];
        const selection = new Set(state.get().selection.sites);
        const allSelected = picks.length > 0 && picks.every((p) => selection.has(p.idx));
        if (allSelected) picks.forEach((p) => selection.delete(p.idx));
        else picks.forEach((p) => selection.add(p.idx));
        state.set({ selection: { ...state.get().selection, sites: selection } });
        // Reflect it on the visible checkboxes (their change events are "forced" and ignored).
        for (const box of this.rows.querySelectorAll(".xpl-site-check")) {
            box.setAttribute("selected", selection.has(Number(box.getAttribute("data-idx"))) ? "true" : "false");
        }
    }

    toggleRowSelected(idx, value) {
        const current = state.get().selection.sites;
        if (current.has(idx) === value) return;
        const selection = new Set(current);
        if (value) selection.add(idx);
        else selection.delete(idx);
        state.set({ selection: { ...state.get().selection, sites: selection } });
    }

    updateTackButtons() {
        const n = state.get().selection.sites.size;
        const active = isDmtActive();
        const ready = isDmtReady();
        const canPlace = active && ready && n > 0;
        this.placeButton.setAttribute("caption", n > 0 ? compose("LOC_XPL_PLACE_TACKS", n) : compose("LOC_XPL_PLACE_TACKS_NONE"));
        this.placeButton.setAttribute("disabled", canPlace ? "false" : "true");
        this.clearButton.setAttribute("disabled", active && ready ? "false" : "true");
        let tooltip = "LOC_XPL_PLACE_TACKS_TT";
        if (!active) tooltip = "LOC_XPL_DMT_MISSING_TT";
        else if (!ready) tooltip = "LOC_XPL_DMT_NOT_READY_TT";
        else if (networkMultiplayer()) tooltip = "LOC_XPL_MP_TACKS_TT";
        this.placeButton.setAttribute("data-tooltip-content", compose(tooltip));
        this.clearButton.setAttribute("data-tooltip-content", compose(active ? "LOC_XPL_CLEAR_TACKS_TT" : "LOC_XPL_DMT_MISSING_TT"));
    }

    async onPlaceTacks() {
        const picks = state.get().results.sites?.picks ?? [];
        const selected = state.get().selection.sites;
        // The role (future city / kept town) goes with the tack, so the Buildings tab plans the right buildings.
        const entries = picks.filter((p) => selected.has(p.idx)).map((p) => ({ x: p.x, y: p.y, type: SETTLE_TACK_TYPE, role: p.role ?? "CITY" }));
        if (entries.length === 0) return;
        try {
            const result = await placeTacks(entries, "settle", { replacePrevious: settings.get().replacePrevious });
            this.tackMessage = compose("LOC_XPL_TACKS_PLACED", result.placed.length, result.skipped.length);
            if (networkMultiplayer()) this.tackMessage += " " + compose("LOC_XPL_MP_TACKS_NOTE");
            state.set({ selection: { ...state.get().selection, sites: new Set() } });
        } catch (error) {
            log.error("place tacks failed", error);
            this.tackMessage = compose("LOC_XPL_ERROR");
        }
        this.render();
    }

    async onClearTacks() {
        try {
            const { removed } = await clearOurTacks({ src: "settle" });
            this.tackMessage = compose("LOC_XPL_TACKS_CLEARED", removed);
        } catch (error) {
            log.error("clear tacks failed", error);
            this.tackMessage = compose("LOC_XPL_ERROR");
        }
        this.render();
    }

    sortedPicks(picks) {
        const list = picks.slice();
        const by = {
            SCORE: (a, b) => b.value - a.value,
            PROD: (a, b) => b.prodPot - a.prodPot,
            FOOD: (a, b) => b.food12 - a.food12,
            ROOM: (a, b) => b.roomTiles - a.roomTiles,
            DIST: (a, b) => (a.nearest?.dist ?? 99) - (b.nearest?.dist ?? 99),
        }[this.sort];
        return by ? list.sort(by) : list;
    }

    renderStatus() {
        if (!this.statusLine) return;
        const { status, results } = state.get();
        const sites = results.sites;
        if (status.busy) {
            this.statusLine.textContent = compose("LOC_XPL_COMPUTING", Math.round((status.progress ?? 0) * 100));
        } else if (status.message) {
            this.statusLine.textContent = compose(status.message);
        } else if (sites?.stats) {
            const st = sites.stats;
            this.statusLine.textContent = compose("LOC_XPL_SITE_STATUS", st.scanned, st.candidates, sites.picks.length, st.elapsedMs)
                + (sites.claimFallback ? ` | ${compose("LOC_XPL_CLAIM_FALLBACK")}` : "");
        } else {
            this.statusLine.textContent = "";
        }
    }

    render() {
        if (!this.rows) return;
        const { results, selection } = state.get();
        const sites = results.sites;
        this.renderStatus();
        this.rows.innerHTML = "";
        if (!sites) return;
        if (sites.empty) {
            this.rows.appendChild(el("div", "xpl-empty", compose(sites.empty === "NO_SETTLEMENTS" ? "LOC_XPL_EMPTY_NO_SETTLEMENTS" : "LOC_XPL_EMPTY_NO_SITES")));
            overlay.showSites([]);
            return;
        }

        const picks = this.sortedPicks(sites.picks);
        const ours = isDmtActive() ? ourTackKeys() : new Set();
        for (const pick of picks) {
            const tacked = ours.has(tackKey(pick.x, pick.y, SETTLE_TACK_TYPE));
            this.rows.appendChild(this.renderRow(pick, selection.sites.has(pick.idx), tacked));
        }
        overlay.showSites(sites.picks, settings.get().heatmap ? sites.scored : null);
        overlay.select(sites.picks.find((p) => p.idx === this.selectedIdx) ?? null);

        this.updateTackButtons();
        if (this.tackMessage) this.statusLine.textContent += ` | ${this.tackMessage}`;
        const advice = adviceFor("sites");
        const stale = !!state.get().results.sites && advice.length > 0 && !state.get().status.busy;
        if (stale) this.statusLine.textContent += ` | ${compose("LOC_XPL_SITES_STALE", advice.map((r) => compose(`LOC_XPL_SITES_STALE_${r}`)).join(", "))}`;
        this.recalcButton?.classList.toggle("xpl-suggested", stale);
    }

    renderRow(pick, checked, tacked) {
        const row = el("div", `xpl-site-row xpl-tier--${pick.tier.toLowerCase()}${pick.idx === this.selectedIdx ? " xpl-site-row--selected" : ""}`);
        const line = el("div", "xpl-site-line");

        const box = document.createElement("fxs-checkbox");
        box.classList.add("xpl-site-check");
        box.setAttribute("data-idx", String(pick.idx));
        box.setAttribute("selected", checked ? "true" : "false");
        box.addEventListener("component-value-changed", (e) => {
            e.stopPropagation();
            if (e.detail?.forced) return; // set from code (render), not a click
            this.toggleRowSelected(pick.idx, !!e.detail.value);
        });
        box.addEventListener("click", (e) => e.stopPropagation()); // don't also select/pan the row
        line.appendChild(box);

        line.appendChild(el("div", "xpl-site-rank", `#${pick.rank}`));
        const score = el("div", "xpl-site-score", String(pick.score));
        const both = pick.cityScore != null && pick.townScore != null ? `[N]${compose("LOC_XPL_ROLE_SCORES", pick.cityScore, pick.townScore)}` : "";
        score.setAttribute("data-tooltip-content", compose(`LOC_XPL_TIER_${pick.tier}`) + both);
        line.appendChild(score);
        if (pick.role) {
            const role = el("div", `xpl-role xpl-role--${pick.role.toLowerCase()}`, compose(`LOC_XPL_ROLE_${pick.role}`));
            role.setAttribute("data-tooltip-content", compose(`LOC_XPL_ROLE_${pick.role}_TT`) + both);
            line.appendChild(role);
        }

        const where = pick.nearest
            ? compose("LOC_XPL_WHERE", pick.nearest.dist, compose(`LOC_XPL_DIR_${pick.nearest.dir || "X"}`), pick.nearest.name)
            : `${pick.x},${pick.y}`;
        line.appendChild(el("div", "xpl-site-where", where));

        const tags = [];
        if (tacked) tags.push(compose("LOC_XPL_TAG_TACKED"));
        if (pick.freshWater) tags.push(compose("LOC_XPL_TAG_FRESH_WATER"));
        if (pick.coastal) tags.push(compose("LOC_XPL_TAG_COAST"));
        if (pick.aiPick) tags.push(compose("LOC_XPL_TAG_AI"));
        if (pick.unknownTiles > 0) tags.push(`!${pick.unknownTiles}`);
        if (pick.nearestIndependent != null && pick.nearestIndependent <= 6) tags.push(compose("LOC_XPL_TAG_INDEPENDENT"));
        line.appendChild(el("div", "xpl-site-tags", tags.join(" ")));
        row.appendChild(line);

        const yieldsText = YIELD_ICONS.map((key, i) => `[icon:${key}]${Math.round(pick.yields[i])}`).join(" ");
        const stats = rich("div", "xpl-site-yields", `${yieldsText}  ${compose("LOC_XPL_SITE_PROD_ROOM", Math.round(pick.prodPot), pick.roomPct)}`);
        row.appendChild(stats);

        if (pick.idx === this.selectedIdx) {
            const reasons = el("div", "xpl-site-reasons");
            for (const r of pick.shownReasons) {
                const args = r.args.map((a) => (typeof a === "string" && a.startsWith("LOC_") ? compose(a) : a));
                reasons.appendChild(rich("div", `xpl-reason xpl-reason--${r.sign === "+" ? "pos" : r.sign === "-" ? "neg" : "warn"}`, `${r.sign} ${compose(r.key, ...args)}`));
            }
            if (pick.aiFactors?.length) {
                const ai = pick.aiFactors.filter((f) => f.positive).map((f) => compose(f.title)).join(", ");
                if (ai) reasons.appendChild(el("div", "xpl-reason xpl-reason--ai", compose("LOC_XPL_R_AI_FACTORS", ai)));
            }
            row.appendChild(reasons);
        }

        row.addEventListener("click", () => this.onRowClicked(pick));
        row.addEventListener("mouseenter", () => overlay.hover(pick));
        row.addEventListener("mouseleave", () => overlay.hover(null));
        return row;
    }

    onRowClicked(pick) {
        this.selectedIdx = this.selectedIdx === pick.idx ? -1 : pick.idx;
        focusPlot(pick.x, pick.y);
        this.render();
    }
}
