/**
 * Expansion Planner: identity and shared constants.
 * Pure module (no engine globals) so it can be imported by Node unit tests.
 */
export const MOD_ID = "expansion-planner";
export const MOD_VERSION = "1.0.0";
export const LOG_TAG = "[XPL]";
export const MOD_FS_ROOT = `fs://game/${MOD_ID}/`;

export const PANEL_TAG = "xpl-panel";
export const HOTKEY_ACTION = "open-expansion-planner";
export const HOTKEY_WINDOW_EVENT = "xpl-hotkey-toggle";
// F7 (game 60's review, UI-2): the autopilot's next step (hud/xpl-autopilot.js stepNow).
export const STEP_ACTION = "xpl-autopilot-step";
export const STEP_WINDOW_EVENT = "xpl-hotkey-step";
// Each input action of config/input.xml and the window event its hotkey dispatches (hud/xpl-hotkey.js).
const HOTKEY_EVENTS = new Map([[HOTKEY_ACTION, HOTKEY_WINDOW_EVENT], [STEP_ACTION, STEP_WINDOW_EVENT]]);

/** The window event for an input action of ours, or null. */
export function hotkeyEvent(action) {
    return HOTKEY_EVENTS.get(action) ?? null;
}
export const DOCK_MODIFIER_CLASS = "xpl-planner";

export const TABS = [
    { id: "settlements", label: "LOC_XPL_TAB_SETTLEMENTS" },
    { id: "buildings", label: "LOC_XPL_TAB_BUILDINGS" },
    { id: "towns", label: "LOC_XPL_TAB_TOWNS" },
    { id: "wonders", label: "LOC_XPL_TAB_WONDERS" },
    { id: "empire", label: "LOC_XPL_TAB_EMPIRE" },
    { id: "autopilot", label: "LOC_XPL_TAB_AUTOPILOT" },
];

export const PROFILES = ["BALANCE", "PRODUCTION", "SCIENCE", "GOLD", "CULTURE", "FOOD", "HAPPINESS"];

export function modUrl(relativePath) {
    return MOD_FS_ROOT + relativePath;
}
