/**
 * Memento Advisor settings: the chosen ranking mode, kept in the shared
 * localStorage["modSettings"] object under "memento-advisor". Other mods keep theirs in the same
 * object, and some wipe storage when more than one key exists: never add another key, never
 * clear, always read-modify-write.
 */
const KEY = "modSettings";
const ID = "memento-advisor";

function readAll() {
    try {
        const raw = localStorage.getItem(KEY);
        const all = raw ? JSON.parse(raw) : {};
        return all && typeof all === "object" ? all : {};
    } catch (_e) {
        return {};
    }
}

export function loadMode() {
    const mode = readAll()[ID]?.mode;
    return typeof mode === "string" ? mode : null;
}

export function saveMode(mode) {
    try {
        const all = readAll();
        all[ID] = { ...(all[ID] ?? {}), mode };
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch (error) {
        console.error("[MMA] settings not saved", error);
    }
}
