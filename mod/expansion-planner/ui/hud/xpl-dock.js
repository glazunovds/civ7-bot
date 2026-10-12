/**
 * Adds the Expansion Planner button to the top-left sub-system dock
 * (the row of round Tech / Civics / Government buttons).
 *
 * Uses the dock's own addButton() via a decorator, like Drongo's City Planner and
 * Wonder Alert do; no base files are replaced. afterAttach() can run more than once
 * (HUD re-attach, age transition), so we guard against adding a second button.
 * If addButton disappears in a future patch, we fall back to appending an
 * fxs-activatable to the dock's official mod slot.
 */
import { DOCK_MODIFIER_CLASS, modUrl } from '../core/xpl-constants.js';
import { log } from '../services/xpl-log.js';
import { togglePanel } from '../panel/xpl-panel.js';
import { refreshDockAdvice } from './xpl-recalc-watch.js';

const BUTTON_CLASS = "xpl-dock-button";

Controls.loadStyle(modUrl("ui/hud/xpl-dock.css"));

function existingButton(dockRoot) {
    return dockRoot?.querySelector?.(`.${BUTTON_CLASS}`) ?? null;
}

function addFallbackButton(dockRoot) {
    const slot = dockRoot.querySelector("#panel-sub-system-dock-mod-slot") ?? dockRoot;
    const button = document.createElement("fxs-activatable");
    button.classList.add("ssb__button", "ssb__element", DOCK_MODIFIER_CLASS, BUTTON_CLASS);
    button.setAttribute("data-tooltip-content", Locale.compose("LOC_XPL_DOCK_TT"));
    const icon = document.createElement("div");
    icon.classList.add("ssb__button-icon", DOCK_MODIFIER_CLASS);
    button.appendChild(icon);
    button.addEventListener("action-activate", () => togglePanel());
    slot.appendChild(button);
    return button;
}

class XplDockDecorator {
    constructor(panel) {
        this.panel = panel;
    }

    beforeAttach() {}

    afterAttach() {
        try {
            const root = this.panel?.Root;
            if (existingButton(root)) {
                return;
            }
            if (typeof this.panel?.addButton === "function") {
                this.panel.addButton({
                    tooltip: "LOC_XPL_DOCK_TT",
                    modifierClass: DOCK_MODIFIER_CLASS,
                    callback: togglePanel,
                    class: BUTTON_CLASS,
                    audio: "data-audio-press-small",
                    focusedAudio: "data-audio-focus-small",
                });
                log.info("dock button added");
                refreshDockAdvice(); // a recalculation may already be suggested (HUD re-attach)
            } else if (root) {
                addFallbackButton(root);
                log.warn("dock addButton() missing; used mod-slot fallback");
            }
        } catch (error) {
            log.error("dock decorator failed", error);
        }
    }

    beforeDetach() {}

    afterDetach() {}
}

Controls.decorate("panel-sub-system-dock", (panel) => new XplDockDecorator(panel));
