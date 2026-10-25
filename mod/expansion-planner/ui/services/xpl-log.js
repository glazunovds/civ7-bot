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

// UI.log cuts every line at 1,022 bytes, its time stamp included (research/41 §2, P-LOG-1: the commander parameters
// stopped at EXPERIENCE_MAX_LE). Bytes, not characters: a Russian name takes 2 a letter (game 60's Modern `economy:` lines
// stopped at 1,022 bytes, 904-909 characters, so none was split). A message longer than LINE_MAX bytes goes out in numbered
// parts of at most LINE_MAX bytes each; with the time stamp (22), our prefix (`[XPL] M140 ERROR `, 17), `… ` (4) and
// ` [12/12]` (8) a line stays within 1,001.
export const LINE_MAX = 950;

/** The bytes a text takes in UTF-8, as UI.log counts them: 1 below U+0080, 2 below U+0800 (Cyrillic), else 3 ('…'), 4 beyond U+FFFF. */
export function utf8Length(text) {
    let n = 0;
    for (const ch of String(text)) {
        const c = ch.codePointAt(0);
        n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    return n;
}

/** The message cut into parts of at most `max` bytes, never inside a character. */
function byteParts(message, max) {
    const parts = [];
    let part = "";
    let bytes = 0;
    for (const ch of message) {
        const b = utf8Length(ch);
        if (bytes + b > max && part) {
            parts.push(part);
            part = "";
            bytes = 0;
        }
        part += ch;
        bytes += b;
    }
    if (part) parts.push(part);
    return parts;
}

// Every line carries the age's letter and the game turn ("[XPL] A67 …", every part of a long one too). Game 60: a pass writes
// its unit lines before its `gold: T67` line, so reviews that dated lines by the gold line put 395 of 398 formation and
// defence lines a turn early. Nothing without the game (the shell, Node tests with no `Game`).
const AGE_LETTERS = { AGE_ANTIQUITY: "A", AGE_EXPLORATION: "E", AGE_MODERN: "M" };
let stampAge = { hash: undefined, letter: "T" };

/** "A67" (age letter and turn), or "" without a game. */
export function turnStamp() {
    try {
        if (typeof Game === "undefined" || !Game || !(Number(Game.turn) >= 0)) return "";
        if (stampAge.hash !== Game.age) {
            const type = typeof GameInfo === "undefined" ? null : GameInfo.Ages?.lookup?.(Game.age)?.AgeType ?? null;
            stampAge = { hash: Game.age, letter: AGE_LETTERS[type] ?? (type ? String(type).replace(/^AGE_/, "").charAt(0) : "T") };
        }
        return `${stampAge.letter}${Game.turn}`;
    } catch (_e) {
        return "";
    }
}

function emit(write, level, message) {
    const prefix = [LOG_TAG, turnStamp(), level].filter(Boolean).join(" ");
    // A UTF-16 unit takes at most 3 bytes (a pair of them 4): a short message needs no count.
    if (message.length * 3 <= LINE_MAX || utf8Length(message) <= LINE_MAX) {
        write(`${prefix} ${message}`);
        return;
    }
    const parts = byteParts(message, LINE_MAX);
    parts.forEach((part, i) => write(`${prefix} ${i > 0 ? "… " : ""}${part} [${i + 1}/${parts.length}]`));
}

export const log = {
    setDebug(enabled) {
        debugEnabled = !!enabled;
    },
    isDebug() {
        return debugEnabled;
    },
    info(...args) {
        emit((t) => console.warn(t), "", record("info", args));
    },
    warn(...args) {
        emit((t) => console.warn(t), "WARN", record("warn", args));
    },
    error(...args) {
        emit((t) => console.error(t), "ERROR", record("error", args));
    },
    debug(...args) {
        if (!debugEnabled) {
            return;
        }
        emit((t) => console.warn(t), "DEBUG", record("debug", args));
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
