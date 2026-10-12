/**
 * Bridge to Detailed Map Tacks (DMT), using only its engine-event contract:
 *   engine.trigger("AddMapTackRequest", { x, y, type, classType, validStatus, yieldDetails })
 *   engine.trigger("RemoveMapTackRequest", { x, y, type })
 * (dmt-map-tack-change-processor.js:21-48; unchanged by the local compatibility patch).
 * Reads go straight to DMT's GameTutorial properties, as Drongo's City Planner does.
 *
 * DMT's add handler validates nothing, so every add is checked here first:
 * no duplicate type on a plot, at most 2 slot-using tacks per plot, full-tile
 * types alone. DMT re-computes validStatus/yieldDetails right after the add, so a
 * minimal payload is enough (validStatus must still be an object).
 *
 * Readiness: DMT populates its cache in Loading.runWhenLoaded. Adding before that
 * would overwrite the plot's existing tacks, so writes wait for readiness.
 */
import { log } from '../services/xpl-log.js';
import { isDmtActive } from './xpl-dmt-status.js';
import { addEntries, loadRegistry, reconcile, removeEntries, tackKey } from './xpl-tack-registry.js';

const MAX_TACKS_PER_PLOT = 2;
const TACKS_PER_FRAME = 3;
const SLOTLESS_TAGS = ["IGNORE_DISTRICT_PLACEMENT_CAP"];

let ready = false;
let readyListeners = [];

function serialHash(key) {
    return Database.makeHash(`_DMT_OBJ_MAP_TACK_${key}`);
}

// Tack work runs one operation at a time: two at once (a click while the automatic refresh
// is running) each cleared and re-added tacks the other was handling, and our registry
// lost track of tacks we had placed.
let chain = Promise.resolve();
let busy = 0;

function exclusive(fn) {
    busy++;
    const run = chain.then(fn, fn).finally(() => {
        busy--;
    });
    chain = run.catch(() => {});
    return run;
}

/** True while tacks are being placed or removed (or queued to be). */
export function isTackWorkBusy() {
    return busy > 0;
}

function nextFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 16);
    });
}

function markReady(reason) {
    if (ready) return;
    ready = true;
    log.info(`dmt bridge ready (${reason})`);
    const listeners = readyListeners;
    readyListeners = [];
    listeners.forEach((fn) => fn());
}

/** Called once at boot. */
export function initDmtBridge() {
    try {
        engine.on("MapTackLoadedFromStore", () => markReady("MapTackLoadedFromStore"));
    } catch (_e) {
        // engine.on may reject unknown events in some builds; the timer below covers it.
    }
    Loading.runWhenLoaded(() => {
        // DMT (loaded earlier via <References>) fills its cache in its own runWhenLoaded
        // callback; give it two frames to be safe.
        nextFrame().then(nextFrame).then(() => markReady("game loaded"));
    });
}

export function isDmtReady() {
    return ready && isDmtActive();
}

export function onDmtReady(fn) {
    if (ready) fn();
    else readyListeners.push(fn);
}

/** Tacks on one plot as DMT stored them: [{ x, y, type, classType, ... }]. */
export function readPlotTacks(x, y) {
    try {
        const raw = GameTutorial.getProperty(serialHash(`${x}-${y}`));
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (_e) {
        return [];
    }
}

/** All tacks: [{ x, y, mapTackList }]. */
export function readAllTacks() {
    const out = [];
    try {
        const keys = GameTutorial.getProperty(serialHash("KEYS"));
        if (typeof keys !== "string" || keys.length === 0) return out;
        for (const key of new Set(keys.split(","))) {
            const [x, y] = key.split("-").map(Number);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const list = readPlotTacks(x, y);
            if (list.length > 0) out.push({ x, y, mapTackList: list });
        }
    } catch (error) {
        log.warn("readAllTacks failed", error);
    }
    return out;
}

export function tackExists(x, y, type) {
    return readPlotTacks(x, y).some((t) => t.type === type);
}

function hasTag(type, tag) {
    for (const row of GameInfo.TypeTags) {
        if (row.Type === type && row.Tag === tag) return true;
    }
    return false;
}

function isSlotless(type) {
    return SLOTLESS_TAGS.some((t) => hasTag(type, t));
}

function isFullTile(type) {
    const def = GameInfo.Constructibles.lookup(type);
    return def?.ConstructibleClass === "WONDER" || hasTag(type, "FULL_TILE");
}

export function isCityCenterType(type) {
    return Number(GameInfo.Buildings.lookup(type)?.CityCenterPriority) > 0;
}

/** Plots with a city-centre tack (planned settlements), excluding the ones we placed. */
export function plannedCityCentres({ excludeOurs = true } = {}) {
    const ours = excludeOurs ? new Set(loadRegistry().map((e) => tackKey(e.x, e.y, e.type))) : new Set();
    const out = [];
    for (const { x, y, mapTackList } of readAllTacks()) {
        if (mapTackList.some((t) => isCityCenterType(t.type) && !ours.has(tackKey(x, y, t.type)))) out.push({ x, y });
    }
    return out;
}

/** Why a tack can't be added here, or null if it can. */
export function checkAdd(x, y, type) {
    const def = GameInfo.Constructibles.lookup(type);
    if (!def) return "UNKNOWN_TYPE";
    const live = readPlotTacks(x, y);
    if (live.some((t) => t.type === type)) return "ALREADY_TACKED";
    const slotUsers = live.filter((t) => !isSlotless(t.type));
    if (slotUsers.length >= MAX_TACKS_PER_PLOT) return "PLOT_FULL";
    if (slotUsers.length > 0 && (isFullTile(type) || slotUsers.some((t) => isFullTile(t.type)))) return "FULL_TILE";
    return null;
}

function isNetworkMultiplayer() {
    try {
        return !!Configuration.getGame().isNetworkMultiplayer;
    } catch (_e) {
        return false;
    }
}

/**
 * Places tacks. entries: [{ x, y, type }]; src: "settle" | "build" | "wonder".
 * replacePrevious: our earlier tacks of this source (matching replaceFilter) that the new
 * entries do not include are removed; the ones they include stay as they are, so a
 * recalculated plan only touches the tacks that changed.
 * onProgress(done, total) is called while working (a few tacks per frame).
 * @returns Promise<{ placed: [], kept: number, skipped: [{ entry, reason }], removed }>
 *          placed includes the kept ones (they are on the map)
 */
export function placeTacks(entries, src, options = {}) {
    return exclusive(() => placeTacksNow(entries, src, options));
}

async function placeTacksNow(entries, src, { replacePrevious = false, replaceFilter = null, onProgress = null } = {}) {
    const out = { placed: [], kept: 0, skipped: [], removed: 0 };
    if (!isDmtActive()) {
        out.skipped = entries.map((entry) => ({ entry, reason: "DMT_ABSENT" }));
        return out;
    }
    if (!ready) {
        out.skipped = entries.map((entry) => ({ entry, reason: "NOT_READY" }));
        return out;
    }
    const wanted = new Set(entries.map((e) => tackKey(e.x, e.y, e.type)));
    const pid = GameContext.localPlayerID;
    const mine = (e) => e.src === src && (e.pid == null || e.pid === pid);
    const stale = loadRegistry().filter((e) => mine(e) && (!replaceFilter || replaceFilter(e)) && !wanted.has(tackKey(e.x, e.y, e.type)));
    const total = (replacePrevious ? stale.length : 0) + entries.length;
    let done = 0;
    if (replacePrevious) {
        out.removed = (await clearOurTacksNow({
            src,
            filter: (e) => (!replaceFilter || replaceFilter(e)) && !wanted.has(tackKey(e.x, e.y, e.type)),
            onStep: () => onProgress?.(++done, total),
        })).removed;
    }
    // Our tacks already on the map for these entries stay (no remove + re-add).
    const ours = new Set(loadRegistry().filter(mine).map((e) => tackKey(e.x, e.y, e.type)));
    const turn = Game.turn;
    const added = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        onProgress?.(++done, total);
        if (ours.has(tackKey(entry.x, entry.y, entry.type)) && tackExists(entry.x, entry.y, entry.type)) {
            out.kept++;
            out.placed.push(entry);
            continue;
        }
        const reason = checkAdd(entry.x, entry.y, entry.type);
        if (reason) {
            out.skipped.push({ entry, reason });
            continue;
        }
        try {
            engine.trigger("AddMapTackRequest", {
                x: entry.x,
                y: entry.y,
                type: entry.type,
                classType: GameInfo.Constructibles.lookup(entry.type)?.ConstructibleClass ?? "BUILDING",
                validStatus: { isValid: true, preventPlacement: false, reasons: [] },
                yieldDetails: {},
            });
        } catch (error) {
            log.error("AddMapTackRequest failed", error);
            out.skipped.push({ entry, reason: "ERROR" });
            continue;
        }
        added.push({ ...entry, src, pid, turn });
        out.placed.push(entry);
        if (added.length % TACKS_PER_FRAME === 0) await nextFrame();
    }
    addEntries(added);
    // Verify the writes landed (engine.trigger to DMT's handler is expected to be synchronous).
    await nextFrame();
    const missing = added.filter((e) => !tackExists(e.x, e.y, e.type));
    if (missing.length > 0) {
        log.warn(`${missing.length} placed tack(s) not found in DMT storage after placing`, missing.slice(0, 3));
    }
    log.info(`placed ${out.placed.length - out.kept} tack(s), kept ${out.kept}, removed ${out.removed}, skipped ${out.skipped.length}${isNetworkMultiplayer() ? " [network MP]" : ""}`, out.skipped.map((s) => s.reason));
    return out;
}

/**
 * Removes tacks we placed (optionally only one source), for the local player only.
 * Tacks the player already removed by hand are just dropped from the registry.
 */
export function clearOurTacks(options = {}) {
    return exclusive(() => clearOurTacksNow(options));
}

async function clearOurTacksNow({ src = null, filter = null, onStep = null } = {}) {
    const pid = GameContext.localPlayerID;
    const minePredicate = (e) => (src == null || e.src === src) && (e.pid == null || e.pid === pid) && (!filter || filter(e));
    const mine = loadRegistry().filter(minePredicate);
    let removed = 0;
    for (let i = 0; i < mine.length; i++) {
        const e = mine[i];
        if (isDmtActive() && tackExists(e.x, e.y, e.type)) {
            try {
                engine.trigger("RemoveMapTackRequest", { x: e.x, y: e.y, type: e.type });
                removed++;
            } catch (error) {
                log.error("RemoveMapTackRequest failed", error);
            }
            onStep?.();
            if (removed % TACKS_PER_FRAME === 0) await nextFrame();
        }
    }
    removeEntries(minePredicate);
    log.info(`cleared ${removed} tack(s)${src ? ` (${src})` : ""}`);
    return { removed };
}

/** Keeps our registry in line with what DMT actually has. */
export function reconcileRegistry() {
    if (!isDmtActive() || !ready) return;
    const { removed } = reconcile((x, y, type) => tackExists(x, y, type));
    if (removed > 0) log.info(`registry: dropped ${removed} tack(s) no longer in DMT`);
}

/** Our tacks for the local player (optionally from one source): Set of "x-y-type". */
export function ourTackKeys(src = null) {
    const pid = GameContext.localPlayerID;
    return new Set(loadRegistry().filter((e) => (e.pid == null || e.pid === pid) && (src == null || e.src === src)).map((e) => tackKey(e.x, e.y, e.type)));
}

/** Our registry entries for the local player (optionally from one source). */
export function ourTackEntries(src = null) {
    const pid = GameContext.localPlayerID;
    return loadRegistry().filter((e) => (e.pid == null || e.pid === pid) && (src == null || e.src === src));
}

export function networkMultiplayer() {
    return isNetworkMultiplayer();
}
