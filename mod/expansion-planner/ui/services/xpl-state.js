/**
 * Small observable store for runtime (non-persistent) state: computed results,
 * selection, job status and stale flags. Views subscribe and re-render; compute
 * jobs write results here.
 */
import { log } from './xpl-log.js';

const MAX_NESTED_UPDATES = 8;

class StateStore {
    constructor() {
        this.data = {
            status: { busy: false, progress: 0, message: "" },
            dmt: { level: "L0", detail: "" },
            results: { sites: null, plans: null, towns: null, wonders: null },
            selection: { sites: new Set(), placements: new Set() },
            stale: { sites: true, plans: true, towns: true, wonders: true },
            advice: { plans: [], sites: [] }, // why a recalculation is suggested (xpl-advice.js)
            autopilot: { enabled: false, running: false, log: [], lastTurn: null }, // hud/xpl-autopilot.js
        };
        this.listeners = new Set();
        this.depth = 0;
    }

    get() {
        return this.data;
    }

    /** Shallow-merges top-level keys and notifies subscribers with the list of changed keys. */
    set(partial) {
        const changed = Object.keys(partial);
        this.data = { ...this.data, ...partial };
        // A listener that sets state which re-triggers itself would loop until the
        // stack overflows and freezes the game; stop it early and say so.
        if (this.depth >= MAX_NESTED_UPDATES) {
            log.error(`state update loop stopped (${changed.join(",")})`);
            return;
        }
        this.depth++;
        try {
            for (const listener of this.listeners) {
                try {
                    listener(this.data, changed);
                } catch (error) {
                    log.error("state listener failed", error);
                }
            }
        } finally {
            this.depth--;
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const state = new StateStore();
