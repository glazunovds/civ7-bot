/**
 * Expansion Planner entry point (the only UIScript of the main action group).
 * Everything else is reached through imports, so each stateful module has exactly
 * one instance.
 */
import { MOD_VERSION } from './core/xpl-constants.js';
import { log } from './services/xpl-log.js';
import { settings } from './services/xpl-settings.js';
import { dmtLevel, probeDmtPatch } from './integrations/xpl-dmt-status.js';
import { initDmtBridge, onDmtReady, reconcileRegistry } from './integrations/xpl-dmt-bridge.js';
import './panel/xpl-panel.js';
import './hud/xpl-dock.js';
import './hud/xpl-hotkey.js';
import './hud/xpl-production-tacks.js';
import './hud/xpl-recalc-watch.js';
import './hud/xpl-growth-advisor.js';
import './hud/xpl-autopilot.js';
import './hud/xpl-autopilot-popups.js';
import { installDebugHandle } from './panel/xpl-debug.js';

try {
    settings.load();
    initDmtBridge();
    installDebugHandle();
    log.info(`boot v${MOD_VERSION} (settings from ${settings.source})`);
} catch (error) {
    log.error("boot failed", error);
}

// Keep our tack registry in line with DMT (player may delete our tacks by hand;
// DMT auto-removes a tack when the matching building is completed).
let reconcileTimer = 0;
onDmtReady(() => {
    reconcileRegistry();
    engine.on("MapTackUIUpdated", () => {
        clearTimeout(reconcileTimer);
        reconcileTimer = setTimeout(() => reconcileRegistry(), 500);
    });
});

// DMT's ModInUse-gated script may load after us, so report its status once the game has loaded.
Loading.runWhenLoaded(() => {
    probeDmtPatch()
        .then((patched) => log.info(`game loaded; dmt=${dmtLevel()} dmtPatch=${patched}`))
        .catch((error) => log.error("dmt probe failed", error));
});
