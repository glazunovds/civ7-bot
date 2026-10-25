/**
 * F8 and F7 hotkeys (InputActions rows "open-expansion-planner" and "xpl-autopilot-step", registered
 * in shell scope by config/input.xml, without context constraints: they work while the panel holds
 * the Dual context too). Same pattern as Drongo's City Planner: an engine input handler that acts
 * when the current interface mode allows hotkeys. F8 toggles the panel; F7 makes the autopilot's
 * next step (one pass with the ticked options, never the end of the turn: hud/xpl-autopilot.js).
 */
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { InputHandlerState } from '/core/ui/input/input-support.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { HOTKEY_WINDOW_EVENT, STEP_WINDOW_EVENT, hotkeyEvent } from '../core/xpl-constants.js';
import { log } from '../services/xpl-log.js';
import { togglePanel } from '../panel/xpl-panel.js';
import { stepNow } from './xpl-autopilot.js';

class XplHotkeyHandler {
    handleInput(inputEvent) {
        try {
            const event = inputEvent.detail.status == InputActionStatuses.FINISH ? hotkeyEvent(inputEvent.detail.name) : null;
            if (event && InterfaceMode.allowsHotKeys()) {
                window.dispatchEvent(new CustomEvent(event));
                return InputHandlerState.Handled;
            }
        } catch (error) {
            log.error("hotkey handler failed", error);
        }
        return InputHandlerState.Active;
    }
}

if (!globalThis.__XPL_HOTKEY_REGISTERED) {
    globalThis.__XPL_HOTKEY_REGISTERED = true;
    ContextManager.registerEngineInputHandler(new XplHotkeyHandler());
    window.addEventListener(HOTKEY_WINDOW_EVENT, () => togglePanel());
    window.addEventListener(STEP_WINDOW_EVENT, () => {
        stepNow({ source: "HOTKEY" }).catch((error) => log.error("autopilot step failed", error));
    });
}
