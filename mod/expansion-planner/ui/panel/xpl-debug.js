/**
 * Debug handle for the UI debugger / FireTuner console: window.__XPL.
 * Read-only helpers; nothing here changes game state.
 */
import { MOD_VERSION } from '../core/xpl-constants.js';
import { log } from '../services/xpl-log.js';
import { settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { dmtLevel, probeDmtPatch } from '../integrations/xpl-dmt-status.js';
import { isPanelOpen, togglePanel } from './xpl-panel.js';
import { crossCheckCity, listTargets } from '../data/xpl-building-job.js';

export function installDebugHandle() {
    globalThis.__XPL = {
        version: MOD_VERSION,
        settings: () => settings.get(),
        settingsSource: () => settings.source,
        state: () => state.get(),
        log: () => log.entries(),
        dmt: () => dmtLevel(),
        probeDmtPatch,
        toggle: togglePanel,
        isOpen: isPanelOpen,
        /** Number of our dock buttons in the DOM (should always be 1). */
        dockButtons: () => document.querySelectorAll(".xpl-dock-button").length,
        /** Compare our adjacency maths with the game's for every city (verification task V13/V15). */
        crossCheck() {
            return listTargets().filter((t) => t.kind === "city").map((t) => ({ city: t.name, ...crossCheckCity(t) }));
        },
        setDebug(enabled) {
            settings.patch({ debug: !!enabled });
            return log.isDebug();
        },
    };
}
