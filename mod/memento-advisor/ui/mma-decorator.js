/**
 * Memento Advisor: badges 1–6 on the suggested memento cards and a row to switch the ranking.
 *
 * Decorates the screen's host element (a real custom element: "create-game-sp" in the front end,
 * "age-transition-bootstrap" in game), because the memento screen itself is a SolidJS component
 * (research/15-memento-screen.md §5). A MutationObserver on the host is the only re-render
 * signal; every pass is idempotent and throttled to one frame. Solid owns the children of the
 * list and of each card wrapper, so we only append: a badge as the last child of each card root
 * (.img-unit-panelbox) and our row after the filter bar. Never classes on the screen's elements
 * (Solid rewrites them). Every entry point is guarded: an error here must never break the screen.
 * Works with the base screen and with Mattifus's Memento Editor (same skeleton).
 */
import { nameOf, readContext, typeOfIcon } from './mma-context.js';
import { equippable, MODES, rankingOf, rankMementos } from './mma-ranking.js';
import { loadMode, saveMode } from './mma-settings.js';

const LIST = '[data-name="create-game-mementos-slot(SpatialSlot)"]';
const ICON_URL = /^url\('blp:(.+)'\)$/;
const LOCKED = "memento-select-locked";

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
    if (text !== undefined) e.textContent = text;
    return e;
}

export class MmaScreenDecorator {
    constructor(component) {
        this.c = component;
        this.observer = null;
        this.frame = 0;
        this.list = null;
        this.ctx = null;
        this.seen = new Map(); // memento type -> its card is locked (what the screen shows)
        this.mode = "AUTO";
        this.ranks = new Map();
    }

    beforeAttach() {}

    afterAttach() {
        try {
            this.observer = new MutationObserver(() => this.schedule());
            this.observer.observe(this.c.Root, { childList: true, subtree: true });
            this.schedule();
        } catch (error) {
            console.error("[MMA] afterAttach", error);
        }
    }

    beforeDetach() {
        try {
            this.observer?.disconnect();
        } catch (_e) {
            // nothing to do
        }
        this.observer = null;
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.list = null;
    }

    afterDetach() {}

    schedule() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.reconcile();
        });
    }

    reconcile() {
        try {
            const list = this.c.Root.querySelector(LIST);
            if (!list) {
                this.list = null; // the memento tab is not open
                return;
            }
            if (list !== this.list) {
                // The tab was (re)opened: leader, civilization and unlocked mementos may have changed.
                this.list = list;
                this.ctx = readContext();
                this.seen = new Map();
                const saved = loadMode();
                this.mode = MODES.includes(saved) ? saved : "AUTO";
                this.rerank();
            }
            this.ensureSwitch();
            const cards = list.querySelectorAll(".img-unit-panelbox");
            const types = [];
            let changed = false;
            for (let i = 0; i < cards.length; i++) {
                const type = this.cardType(cards[i]);
                types.push(type);
                if (!type) continue;
                const locked = cards[i].classList.contains(LOCKED);
                if (this.seen.get(type) !== locked) {
                    this.seen.set(type, locked);
                    changed = true;
                }
            }
            if (changed) this.rerank();
            for (let i = 0; i < cards.length; i++) this.decorateCard(cards[i], types[i]);
        } catch (error) {
            console.error("[MMA] reconcile", error);
        }
    }

    cardType(card) {
        const icons = card.querySelectorAll('[data-name="Icon"]');
        for (let i = 0; i < icons.length; i++) {
            const m = ICON_URL.exec(icons[i].getAttribute("name") ?? "");
            if (m) return typeOfIcon(this.ctx, m[1]);
        }
        return null;
    }

    /** Ranks for the mode, over what the player can equip: the game's data, corrected by the cards shown. */
    rerank() {
        this.ranks = rankMementos(this.ctx?.picks, this.mode, equippable(this.ctx?.available ?? null, this.seen));
    }

    decorateCard(card, type) {
        const rank = type && !card.classList.contains(LOCKED) ? this.ranks.get(type) : undefined;
        let badge = null;
        for (let i = 0; i < card.children.length; i++) {
            if (card.children[i].classList.contains("mma-badge")) {
                badge = card.children[i];
                break;
            }
        }
        if (!rank) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = el("div", "mma-badge font-title");
            card.appendChild(badge);
        }
        const text = String(rank);
        if (badge.textContent !== text) badge.textContent = text; // no mutation when unchanged
        const reason = this.ctx.picks?.reasons?.[type]?.[this.ctx.lang] ?? "";
        const tip = compose("LOC_MMA_BADGE_TT", rank, this.modeLabel(), reason);
        if (badge.getAttribute("data-tooltip-content") !== tip) badge.setAttribute("data-tooltip-content", tip);
    }

    modeLabel(mode = this.mode) {
        if (mode === "AUTO") return compose("LOC_MMA_MODE_AUTO", compose(`LOC_MMA_MODE_${rankingOf("AUTO", this.ctx?.picks)}`));
        return compose(`LOC_MMA_MODE_${mode}`);
    }

    /** Our row after the filter bar: who the advice is for, and one button per ranking. */
    ensureSwitch() {
        const bar = this.c.Root.querySelector(".memento-select-filter-bar");
        if (!bar?.parentElement) return;
        let row = bar.nextElementSibling;
        if (!row?.classList.contains("mma-switch")) {
            row = el("div", "mma-switch");
            bar.parentElement.insertBefore(row, bar.nextSibling);
            this.shownMode = null;
        }
        if (this.shownMode === this.mode && row.childElementCount > 0) return;
        this.shownMode = this.mode;
        row.innerHTML = "";
        const lang = this.ctx?.lang ?? "en";
        const leader = this.ctx?.leader ? nameOf("leader", this.ctx.leader, lang) : null;
        const civ = this.ctx?.civ ? nameOf("civ", this.ctx.civ, lang) : null;
        const who = leader && civ ? compose("LOC_MMA_FOR_PAIR", leader, civ) : leader ? compose("LOC_MMA_FOR_LEADER", leader) : compose("LOC_MMA_FOR_ANY");
        row.appendChild(el("div", "mma-switch-label font-body", who));
        for (const mode of MODES) {
            const b = el("div", `mma-mode font-body${mode === this.mode ? " mma-mode--on" : ""}`, this.modeLabel(mode));
            b.setAttribute("data-tooltip-content", compose(mode === "AUTO" ? "LOC_MMA_MODE_AUTO_TT" : "LOC_MMA_MODE_TT"));
            b.addEventListener("click", (event) => {
                try {
                    event.stopPropagation();
                    this.setMode(mode);
                } catch (error) {
                    console.error("[MMA] switch", error);
                }
            });
            row.appendChild(b);
        }
    }

    setMode(mode) {
        this.mode = mode;
        saveMode(mode);
        this.rerank();
        this.schedule();
    }
}
