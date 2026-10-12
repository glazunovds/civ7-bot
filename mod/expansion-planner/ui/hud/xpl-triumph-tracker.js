/**
 * Ticks «Отслеживать» on the triumphs the autopilot's victory focus pushes
 * (state.autopilot.focus.track: close triumphs of the focus's kind), as the triumph card's
 * checkbox does (ui-next/screens/legacies/triumph-tracking-manager.js trackTriumph). Only the
 * game's display changes: tracking sends nothing to the game. Each triumph is tracked at most
 * once per session, so one the player untracks stays untracked. Kept out of
 * hud/xpl-autopilot.js because it imports the game's legacies screen.
 */
import { getTriumphTrackingManager } from '/base-standard/ui-next/screens/legacies/triumph-tracking-manager.js';
import { getQuestTracker } from '/base-standard/ui/quest-tracker/quest-tracker.js';
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';

const done = new Set();

state.subscribe((_s, changed) => {
    if (!changed.includes("autopilot")) return;
    for (const type of state.get().autopilot?.focus?.track ?? []) {
        if (done.has(type)) continue;
        done.add(type);
        try {
            if (getQuestTracker().has(type, "triumph")) continue;
            const def = GameInfo.Legacies.lookup(type);
            if (!def) continue;
            getTriumphTrackingManager().trackTriumph(def);
            log.info(`autopilot: tracking triumph ${type}`);
        } catch (error) {
            log.debug("tracking a triumph failed", error);
        }
    }
});
