/**
 * F8 hotkey (InputActions row "open-expansion-planner", registered in shell scope
 * by config/input.xml). Same pattern as Drongo's City Planner: an engine input
 * handler that toggles the panel when the current interface mode allows hotkeys.
 */
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { InputHandlerState } from '/core/ui/input/input-support.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { HOTKEY_ACTION, HOTKEY_WINDOW_EVENT } from '../core/xpl-constants.js';
import { log } from '../services/xpl-log.js';
import { togglePanel } from '../panel/xpl-panel.js';

class XplHotkeyHandler {
    handleInput(inputEvent) {
        try {
            if (inputEvent.detail.status == InputActionStatuses.FINISH && inputEvent.detail.name === HOTKEY_ACTION) {
                if (InterfaceMode.allowsHotKeys()) {
                    window.dispatchEvent(new CustomEvent(HOTKEY_WINDOW_EVENT));
                    return InputHandlerState.Handled;
                }
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
}
