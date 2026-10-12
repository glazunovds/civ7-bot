/**
 * Expansion Planner side panel (non-modal).
 *
 * Pushed WITHOUT a mouse guard (a guard sets ViewManager.isWorldInputAllowed=false)
 * and with InputContext.Dual (as the base game's side choosers do), so the map can
 * still be panned, zoomed and clicked while the panel is open.
 * Closes on Esc / cancel / system menu, but NOT on right mouse button, so right-click
 * unit orders on the map keep working. The mouse wheel scrolls the panel's lists and
 * only zooms the map while the pointer is outside the panel.
 */
import Panel from '/core/ui/panel-support.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { InputEngineEventName } from '/core/ui/input/input-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import NavTray from '/core/ui/navigation-tray/model-navigation-tray.js';
import { MOD_VERSION, PANEL_TAG, PROFILES, TABS, modUrl } from '../core/xpl-constants.js';
import { log } from '../services/xpl-log.js';
import { settings } from '../services/xpl-settings.js';
import { dmtLevel } from '../integrations/xpl-dmt-status.js';
import { SettlementsTab } from './xpl-tab-settlements.js';
import { TownsTab } from './xpl-tab-towns.js';
import { BuildingsTab } from './xpl-tab-buildings.js';
import { WondersTab } from './xpl-tab-wonders.js';
import { EmpireTab } from './xpl-tab-empire.js';
import { AutopilotTab } from './xpl-tab-autopilot.js';

const CLOSE_INPUTS = new Set(["cancel", "keyboard-escape", "sys-menu"]);
const WHEEL_INPUTS = new Set(["camera-zoom-in", "camera-zoom-out", "mousewheel-up", "mousewheel-down"]);

class XplPanel extends Panel {
    constructor(root) {
        super(root);
        this.inputContext = InputContext.Dual;
        this.engineInputListener = this.onEngineInput.bind(this);
        this.closeListener = () => this.close();
        this.tabSelectedListener = this.onTabSelected.bind(this);
        this.profileChangedListener = this.onProfileChanged.bind(this);
        this.unsubscribeSettings = null;
        this.tabs = {};
        this.activeTab = null;
        this.pointerInside = false;
        this.pointerEnterListener = () => { this.pointerInside = true; };
        this.pointerLeaveListener = () => { this.pointerInside = false; };
        this.sizeListener = () => {
            settings.patch({ panelLarge: !settings.get().panelLarge });
            this.applySize();
        };
    }

    /** Large (default): wider and down to the bottom of the screen; compact: the old size. */
    applySize() {
        const large = settings.get().panelLarge !== false;
        this.frame.classList.toggle("xpl-frame--large", large);
        this.sizeButton?.setAttribute("caption", Locale.compose(large ? "LOC_XPL_SIZE_COMPACT" : "LOC_XPL_SIZE_LARGE"));
    }

    onInitialize() {
        super.onInitialize();
        this.frame = MustGetElement(".xpl-frame", this.Root);
        this.tabBar = MustGetElement(".xpl-tabs", this.Root);
        this.profileDropdown = MustGetElement(".xpl-priority__dropdown", this.Root);
        this.statusElement = MustGetElement(".xpl-status", this.Root);
        this.versionElement = MustGetElement(".xpl-version", this.Root);
        this.sizeButton = this.Root.querySelector(".xpl-size-toggle");
        this.applySize();
        this.tabElements = new Map();
        for (const element of this.Root.querySelectorAll(".xpl-tab")) {
            this.tabElements.set(element.getAttribute("data-tab"), element);
        }

        const current = settings.get();
        // fxs-dropdown: items must be set before the selected index.
        this.profileDropdown.setAttribute("dropdown-items", JSON.stringify(PROFILES.map((p) => ({ label: `LOC_XPL_PROFILE_${p}` }))));
        this.profileDropdown.setAttribute("selected-item-index", String(Math.max(0, PROFILES.indexOf(current.profile))));

        const tabIndex = Math.max(0, TABS.findIndex((t) => t.id === current.activeTab));
        this.tabBar.setAttribute("tab-items", JSON.stringify(TABS));
        this.tabBar.setAttribute("selected-tab-index", String(tabIndex));
        this.showTab(TABS[tabIndex].id);

        this.versionElement.textContent = Locale.compose("LOC_XPL_VERSION", MOD_VERSION);

        // Tooltips in the HTML template are LOC keys; compose them once.
        for (const element of this.Root.querySelectorAll("[data-tooltip-content^='LOC_']")) {
            element.setAttribute("data-tooltip-content", Locale.compose(element.getAttribute("data-tooltip-content")));
        }

        this.tabs.settlements = new SettlementsTab(this.tabElements.get("settlements"));
        this.tabs.towns = new TownsTab(this.tabElements.get("towns"));
        this.tabs.buildings = new BuildingsTab(this.tabElements.get("buildings"));
        this.tabs.wonders = new WondersTab(this.tabElements.get("wonders"));
        this.tabs.empire = new EmpireTab(this.tabElements.get("empire"));
        this.tabs.autopilot = new AutopilotTab(this.tabElements.get("autopilot"));
        for (const tab of Object.values(this.tabs)) {
            try {
                tab.initialize();
            } catch (error) {
                log.error("tab initialize failed", error);
            }
        }
    }

    onAttach() {
        super.onAttach();
        this.Root.addEventListener(InputEngineEventName, this.engineInputListener);
        this.frame.addEventListener("mouseenter", this.pointerEnterListener);
        this.frame.addEventListener("mouseleave", this.pointerLeaveListener);
        this.tabBar.addEventListener("tab-selected", this.tabSelectedListener);
        this.profileDropdown.addEventListener("dropdown-selection-change", this.profileChangedListener);
        MustGetElement(".xpl-close", this.Root).addEventListener("action-activate", this.closeListener);
        this.sizeButton?.addEventListener("action-activate", this.sizeListener);
        this.unsubscribeSettings = settings.subscribe(() => this.renderStatus());
        this.renderStatus();
        for (const tab of Object.values(this.tabs)) {
            try {
                tab.attach();
            } catch (error) {
                log.error("tab attach failed", error);
            }
        }
        this.activateTab(settings.get().activeTab);
        log.info("panel opened");
    }

    onDetach() {
        this.Root.removeEventListener(InputEngineEventName, this.engineInputListener);
        this.frame.removeEventListener("mouseenter", this.pointerEnterListener);
        this.frame.removeEventListener("mouseleave", this.pointerLeaveListener);
        this.pointerInside = false;
        this.tabBar.removeEventListener("tab-selected", this.tabSelectedListener);
        this.profileDropdown.removeEventListener("dropdown-selection-change", this.profileChangedListener);
        this.sizeButton?.removeEventListener("action-activate", this.sizeListener);
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        for (const tab of Object.values(this.tabs)) {
            try {
                tab.detach();
            } catch (error) {
                log.error("tab detach failed", error);
            }
        }
        this.activeTab = null;
        log.info("panel closed");
        super.onDetach();
    }

    onReceiveFocus() {
        super.onReceiveFocus();
        NavTray.clear();
        NavTray.addOrUpdateGenericBack();
    }

    onLoseFocus() {
        NavTray.clear();
        super.onLoseFocus();
    }

    onEngineInput(inputEvent) {
        // Wheel over the panel scrolls its lists; keep the camera from zooming too
        // (the base city panels block the same actions, for every input status).
        if (this.pointerInside && WHEEL_INPUTS.has(inputEvent.detail.name)) {
            inputEvent.preventDefault();
            inputEvent.stopImmediatePropagation();
            return;
        }
        if (inputEvent.detail.status != InputActionStatuses.FINISH) {
            return;
        }
        if (CLOSE_INPUTS.has(inputEvent.detail.name)) {
            this.close();
            inputEvent.stopPropagation();
            inputEvent.preventDefault();
        }
        // Everything else (including mousebutton-right) falls through to the world.
    }

    onTabSelected(event) {
        const tab = TABS[event.detail?.index];
        if (!tab) {
            return;
        }
        this.showTab(tab.id);
        this.activateTab(tab.id);
        if (settings.get().activeTab !== tab.id) {
            settings.patch({ activeTab: tab.id });
        }
    }

    /** Tells tab views which one is visible (only the visible tab computes). */
    activateTab(tabId) {
        if (this.activeTab === tabId) return;
        this.tabs[this.activeTab]?.hide?.();
        this.activeTab = tabId;
        try {
            this.tabs[tabId]?.show?.();
        } catch (error) {
            log.error(`tab ${tabId} show failed`, error);
        }
    }

    onProfileChanged(event) {
        const profile = PROFILES[event.detail?.selectedIndex];
        if (profile && profile !== settings.get().profile) {
            settings.patch({ profile });
            log.info(`priority -> ${profile}`);
        }
    }

    showTab(tabId) {
        for (const [id, element] of this.tabElements) {
            element.classList.toggle("hidden", id !== tabId);
        }
    }

    renderStatus() {
        const level = dmtLevel();
        this.statusElement.textContent = Locale.compose(level === "L0" ? "LOC_XPL_STATUS_DMT_OFF" : "LOC_XPL_STATUS_DMT_ON");
    }
}

Controls.define(PANEL_TAG, {
    createInstance: XplPanel,
    description: "Expansion Planner panel",
    styles: [modUrl("ui/panel/xpl-panel.css")],
    content: [modUrl("ui/panel/xpl-panel.html")],
    attributes: [],
    classNames: ["xpl-panel", "absolute", "inset-0", "pointer-events-none"],
});

export function isPanelOpen() {
    return ContextManager.hasInstanceOf(PANEL_TAG);
}

export function togglePanel() {
    try {
        if (isPanelOpen()) {
            ContextManager.pop(PANEL_TAG);
        } else {
            // No createMouseGuard: keep world input enabled.
            ContextManager.push(PANEL_TAG, { singleton: true });
        }
    } catch (error) {
        log.error("togglePanel failed", error);
    }
}
