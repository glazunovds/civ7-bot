/**
 * Logging. Everything goes through console.warn/console.error because console.log
 * is filtered out of UI.log at the default UILogLevel. Lines are tagged [XPL] so
 * tools/tail-ui-log.ps1 can filter them. A ring buffer keeps the last entries for
 * the debug handle (window.__XPL.log()).
 */
import { LOG_TAG } from '../core/xpl-constants.js';

const MAX_ENTRIES = 200;
const ring = [];
let debugEnabled = false;

function format(value) {
    if (value instanceof Error) {
        return `${value.message}${value.stack ? "\n" + value.stack : ""}`;
    }
    if (value !== null && typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch (_e) {
            return String(value);
        }
    }
    return String(value);
}

function record(level, args) {
    const message = args.map(format).join(" ");
    ring.push({ time: Date.now(), level, message });
    if (ring.length > MAX_ENTRIES) {
        ring.shift();
    }
    return message;
}

export const log = {
    setDebug(enabled) {
        debugEnabled = !!enabled;
    },
    isDebug() {
        return debugEnabled;
    },
    info(...args) {
        console.warn(`${LOG_TAG} ${record("info", args)}`);
    },
    warn(...args) {
        console.warn(`${LOG_TAG} WARN ${record("warn", args)}`);
    },
    error(...args) {
        console.error(`${LOG_TAG} ERROR ${record("error", args)}`);
    },
    debug(...args) {
        if (!debugEnabled) {
            return;
        }
        console.warn(`${LOG_TAG} DEBUG ${record("debug", args)}`);
    },
    /** Returns a copy of the ring buffer (oldest first). */
    entries() {
        return ring.slice();
    },
};

/**
 * Wraps a function so an exception is logged instead of propagating into the
 * game's UI code (a throw inside a decorator or engine callback can break the HUD).
 */
export function guarded(label, fn) {
    return function guardedCall(...args) {
        try {
            return fn.apply(this, args);
        } catch (error) {
            log.error(`${label} failed:`, error);
            return undefined;
        }
    };
}
