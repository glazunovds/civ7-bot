/**
 * Our own record of the map tacks this mod placed, so "Clear my tacks" removes only
 * ours and never the player's manual tacks (DMT tacks carry no owner/label field).
 *
 * Stored in a GameTutorial property: saved with the game, game-scoped (the same
 * storage and lifetime as Detailed Map Tacks' own tacks). Entries carry the placing
 * player's id so hotseat players don't clear each other's tacks.
 */
import { log } from '../services/xpl-log.js';

const KEY_NAME = "_XPL_OBJ_TACKS_LIST";
let keyHash = null;

function key() {
    if (keyHash === null) keyHash = Database.makeHash(KEY_NAME);
    return keyHash;
}

export function tackKey(x, y, type) {
    return `${x}-${y}-${type}`;
}

export function loadRegistry() {
    try {
        const raw = GameTutorial.getProperty(key());
        const list = typeof raw === "string" && raw.length > 0 ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter((e) => e && Number.isFinite(e.x) && Number.isFinite(e.y) && typeof e.type === "string") : [];
    } catch (error) {
        log.warn("tack registry unreadable; starting empty", error);
        return [];
    }
}

function saveRegistry(list) {
    try {
        GameTutorial.setProperty(key(), JSON.stringify(list));
        return true;
    } catch (error) {
        log.error("tack registry write failed", error);
        return false;
    }
}

export function addEntries(entries) {
    const list = loadRegistry();
    const seen = new Set(list.map((e) => tackKey(e.x, e.y, e.type)));
    for (const e of entries) {
        const k = tackKey(e.x, e.y, e.type);
        if (!seen.has(k)) {
            list.push({ x: e.x, y: e.y, type: e.type, src: e.src, pid: e.pid, turn: e.turn, ...(e.role ? { role: e.role } : {}) });
            seen.add(k);
        }
    }
    saveRegistry(list);
    return list;
}

export function removeEntries(predicate) {
    const list = loadRegistry();
    const kept = list.filter((e) => !predicate(e));
    if (kept.length !== list.length) saveRegistry(kept);
    return { removed: list.length - kept.length, kept };
}

/** Drops entries whose tack no longer exists in DMT (player removed it, or it was fulfilled). */
export function reconcile(existsInDmt) {
    return removeEntries((e) => !existsInDmt(e.x, e.y, e.type));
}
