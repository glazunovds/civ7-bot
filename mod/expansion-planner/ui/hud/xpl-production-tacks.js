/**
 * "Build / buy at my tack" buttons in the city production menu.
 *
 * For each building or wonder row that has a Detailed Map Tacks tack of the same type
 * on a tile this city may use right now, adds small pills next to the row's cost:
 *  - pin + hammer: queue it on the tack's tile (no tile picking),
 *  - pin + gold:   buy it on the tack's tile.
 * The request is exactly what the game's own placement mode sends after a tile click
 * (interface-mode-place-building.js commitPlot: ConstructibleType + X + Y), checked
 * with canStart first, so it is network-safe and follows every game rule.
 *
 * Works with the base menu and with Drongo's Compact Production (its rows have a
 * .drongo-compact-action-wrap); decorates the panel, replaces no files.
 */
import { idString } from '../core/xpl-component-id.js';
import { modUrl } from '../core/xpl-constants.js';
import { log } from '../services/xpl-log.js';
import { isDmtActive } from '../integrations/xpl-dmt-status.js';
import { candidateTacks, explainTack, findTackSpot, orderAtTack, tacksByType } from '../data/xpl-tack-orders.js';
import { focusPlot } from '../map/xpl-camera.js';
import { DMT_GENERIC_TACKS } from '../core/xpl-rule-book.js';
import { overlay } from '../map/xpl-overlay.js';

const ACTIONS_CLASS = "xpl-tack-actions";
const REFRESH_EVENTS = ["CityMadePurchase", "CityProductionQueueChanged", "CitySelectionChanged", "CityProductionChanged", "MapTackUIUpdated", "PlayerTurnActivated", "TreasuryChanged"];
const EVENT_DELAY_MS = 120;   // after the menu has re-rendered its rows
const POLL_MS = 500;          // rows can be rebuilt without an event (accordion toggles)
const PLACEABLE = new Set(["BUILDING", "WONDER"]);

Controls.loadStyle(modUrl("ui/hud/xpl-production-tacks.css"));

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

function pill(kind, tooltip, onActivate) {
    const p = document.createElement("fxs-activatable");
    p.classList.add("xpl-tack-pill", `xpl-tack-pill--${kind}`);
    p.setAttribute("data-tooltip-content", tooltip);
    p.setAttribute("data-audio-group-ref", "city-actions");
    const pin = document.createElement("div");
    pin.classList.add("xpl-tack-pill__pin");
    const icon = document.createElement("div");
    icon.classList.add("xpl-tack-pill__icon");
    const url = kind === "blocked" ? "" : safe(() => UI.getIconURL(kind === "buy" ? "YIELD_GOLD" : "YIELD_PRODUCTION", "YIELD"), "");
    if (url) icon.style.setProperty("background-image", `url(${url})`);
    else icon.classList.add("hidden");
    p.appendChild(pin);
    p.appendChild(icon);
    // Keep the row itself from reacting (it would open the tile picker).
    for (const name of ["pointerdown", "mousedown", "click"]) p.addEventListener(name, (e) => e.stopPropagation());
    p.addEventListener("action-activate", (e) => {
        e.stopPropagation();
        e.preventDefault();
        onActivate();
    });
    return p;
}

class ProductionTackDecorator {
    constructor(panel) {
        this.panel = panel;
        this.timer = 0;
        this.poll = 0;
        this.signature = "";
        this.handlers = [];
    }

    beforeAttach() {}

    afterAttach() {
        if (!isDmtActive()) return;
        for (const name of REFRESH_EVENTS) {
            const handler = () => this.schedule();
            engine.on(name, handler);
            this.handlers.push([name, handler]);
        }
        this.poll = setInterval(() => this.refresh(false), POLL_MS);
        this.schedule();
    }

    beforeDetach() {
        for (const [name, handler] of this.handlers) engine.off(name, handler);
        this.handlers = [];
        clearInterval(this.poll);
        clearTimeout(this.timer);
        overlay.showTarget(null);
    }

    afterDetach() {}

    schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.refresh(true), EVENT_DELAY_MS);
    }

    cityID() {
        return safe(() => this.panel.cityID, null) ?? safe(() => UI.Player.getHeadSelectedCity(), null);
    }

    /** @param force recompute even if nothing visible changed */
    refresh(force) {
        try {
            const root = this.panel?.Root;
            if (!root) return;
            const items = [...root.querySelectorAll("production-chooser-item")];
            const cityID = this.cityID();
            const city = cityID ? safe(() => Cities.get(cityID), null) : null;
            const signature = `${idString(cityID)}|${Game.turn}|${items.map((i) => i.getAttribute("data-type")).join(",")}|${items.filter((i) => i.querySelector(`.${ACTIONS_CLASS}`)).length}`;
            if (!force && signature === this.signature) return;
            this.signature = signature;
            if (!city || city.owner !== GameContext.localPlayerID) {
                for (const item of items) item.querySelector(`.${ACTIONS_CLASS}`)?.remove();
                return;
            }
            const tacks = tacksByType();
            for (const item of items) this.decorateItem(item, city, tacks);
            // Recount after our own changes so the next poll does not redo the work.
            this.signature = `${idString(cityID)}|${Game.turn}|${items.map((i) => i.getAttribute("data-type")).join(",")}|${items.filter((i) => i.querySelector(`.${ACTIONS_CLASS}`)).length}`;
        } catch (error) {
            log.error("production tack buttons failed", error);
        }
    }

    decorateItem(item, city, tacks) {
        const existing = item.querySelector(`.${ACTIONS_CLASS}`);
        const type = item.getAttribute("data-type");
        const def = type ? GameInfo.Constructibles.lookup(type) : null;
        const candidates = def && PLACEABLE.has(def.ConstructibleClass) ? candidateTacks(def, tacks) : [];
        const spot = candidates.length > 0 ? findTackSpot(city, def, candidates) : null;
        if (!spot) {
            // A tack for this city that cannot be used yet: a dimmed pin that says why and shows it.
            const why = candidates.length > 0 ? explainTack(city, def, candidates) : null;
            if (why) this.renderBlocked(item, existing, why);
            else existing?.remove();
            return;
        }
        const key = `${spot.x},${spot.y}|${spot.build}|${spot.buy}|${spot.cost}|${spot.generic ?? ""}`;
        const via = spot.generic ? ` (${Locale.compose("LOC_XPL_TACK_GENERIC", Locale.compose(DMT_GENERIC_TACKS[spot.generic].name))})` : "";
        if (existing?.getAttribute("data-key") === key) return;
        existing?.remove();

        const box = document.createElement("div");
        box.classList.add(ACTIONS_CLASS);
        box.setAttribute("data-key", key);
        const cityID = city.id;
        const hover = (on) => overlay.showTarget(on ? spot.idx : null);
        if (spot.build) {
            const p = pill("build", Locale.compose("LOC_XPL_TACK_BUILD_TT", spot.x, spot.y) + via, () => {
                if (orderAtTack(cityID, def, spot, false)) this.schedule();
            });
            p.addEventListener("mouseenter", () => hover(true));
            p.addEventListener("mouseleave", () => hover(false));
            box.appendChild(p);
        }
        if (spot.buy) {
            const p = pill("buy", Locale.compose("LOC_XPL_TACK_BUY_TT", spot.cost, spot.x, spot.y) + via, () => {
                if (orderAtTack(cityID, def, spot, true)) this.schedule();
            });
            p.addEventListener("mouseenter", () => hover(true));
            p.addEventListener("mouseleave", () => hover(false));
            box.appendChild(p);
        }
        this.mount(item, box);
    }

    mount(item, box) {
        const compactSlot = item.querySelector(".drongo-compact-action-wrap");
        if (compactSlot) {
            compactSlot.appendChild(box);
        } else {
            box.classList.add(`${ACTIONS_CLASS}--floating`);
            item.appendChild(box);
        }
    }

    renderBlocked(item, existing, why) {
        const key = `blocked|${why.x},${why.y}|${why.reason}|${why.detail ?? ""}`;
        if (existing?.getAttribute("data-key") === key) return;
        existing?.remove();
        const box = document.createElement("div");
        box.classList.add(ACTIONS_CLASS);
        box.setAttribute("data-key", key);
        const via = why.generic ? ` (${Locale.compose("LOC_XPL_TACK_GENERIC", Locale.compose(DMT_GENERIC_TACKS[why.generic].name))})` : "";
        const detail = (why.detail ? `[N]${Locale.compose(why.detail)}` : "")
            + (why.validNow > 0 ? `[N]${Locale.compose("LOC_XPL_TACK_VALID_NOW", why.validNow)}` : "");
        const p = pill("blocked", Locale.compose(`LOC_XPL_TACK_BLOCKED_${why.reason}`, why.x, why.y) + via + detail, () => focusPlot(why.x, why.y));
        p.addEventListener("mouseenter", () => overlay.showTarget(why.idx));
        p.addEventListener("mouseleave", () => overlay.showTarget(null));
        box.appendChild(p);
        this.mount(item, box);
    }
}

Controls.decorate("panel-production-chooser", (panel) => new ProductionTackDecorator(panel));
