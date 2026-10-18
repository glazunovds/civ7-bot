/**
 * Persistent user settings.
 *
 * Primary store: localStorage["modSettings"]["expansion-planner"] (one JSON object).
 * The community convention is a single "modSettings" key shared by all mods; some
 * mods call localStorage.clear() when more than one key exists, so we never add a
 * second key and never clear anything ourselves.
 *
 * Backup store: UI.setOption("user", "Mod", "expansion-planner.settings", json),
 * because another mod's localStorage.clear() can wipe our JSON. On load we prefer
 * localStorage, then the UI option, then defaults.
 */
import { MOD_ID, PROFILES } from '../core/xpl-constants.js';
import { BIAS_DEFAULTS, normaliseBiasSets } from '../core/xpl-profiles.js';
import { log } from './xpl-log.js';

const SCHEMA_VERSION = 2;
const OPTION_NAME = `${MOD_ID}.settings`;
const SAVE_DEBOUNCE_MS = 300;

export const DEFAULT_SETTINGS = Object.freeze({
    v: SCHEMA_VERSION,
    profile: "BALANCE",
    activeTab: "settlements",
    radius: 8,
    topN: 8,
    includeHidden: false,
    overlapTol: "MEDIUM",
    siteRoles: "BOTH", // look for future cities, kept towns, or both (the better role per site)
    spread: false,
    heatmap: false,
    useAI: true,
    keepHighlights: false,
    replacePrevious: true,
    panelLarge: true, // the large panel (wider, down to the bottom of the screen)
    // The player's balance of the yields' weights («Баланс приоритетов», core/xpl-profiles.js profileFor), one set per
    // victory focus (science leans to science over food) and one without: 1 = as is.
    yieldBias: JSON.parse(JSON.stringify(BIAS_DEFAULTS)),
    // What the autopilot may do (it is switched on per session, see hud/xpl-autopilot.js).
    autopilot: { research: true, production: true, wonders: true, maxWonders: 1, growth: true, towns: true, purchases: true, choices: true, closePopups: true, befriend: true, tacks: true, focus: false, strategy: true, victory: "AUTO", resources: true, diplomacy: false, roam: false, explore: false, settlers: false, defend: false, merchants: false, skipUnits: false, endTurn: false, resumeAfterAge: true, biasOpen: false, reserveTurns: 2, replanEvery: 5, aiTurns: 5, lastHumanPlayer: -1 },
    buildings: { excluded: [], respectTacks: true, useEngine: true, futureTiles: true, specialists: 0.5, optionsOpen: false, autoTacks: false, lastTarget: null, townsAsCities: false, incremental: true, growthHints: true },
    // The player takes «All your Cities from the previous Age remain Cities» at every age change (research/39 §4.5).
    towns: { expectKeepCities: true },
    wonders: { omniscient: false },
    debug: false,
    // What must outlive an age change for this game (`remember`): the save's GameTutorial properties do not (game 22).
    memory: { game: "", values: {} },
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

/** Deep-merges `patch` into `base` for plain objects; arrays and scalars are replaced. */
function merge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const [key, value] of Object.entries(patch ?? {})) {
        if (value && typeof value === "object" && !Array.isArray(value) && base?.[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
            out[key] = merge(base[key], value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

/** Drops unknown/invalid values so a corrupt or old blob can never break the panel. */
function sanitize(raw) {
    const s = merge(clone(DEFAULT_SETTINGS), raw && typeof raw === "object" ? raw : {});
    // An old single balance ({F, P, …}) merged into the per-focus sets: migrate it from the raw blob.
    if (raw?.yieldBias && ["F", "P", "G", "S", "C", "H"].some((k) => raw.yieldBias[k] !== undefined)) s.yieldBias = raw.yieldBias;
    if (!PROFILES.includes(s.profile)) s.profile = DEFAULT_SETTINGS.profile;
    if (!["settlements", "buildings", "towns", "wonders", "empire", "autopilot"].includes(s.activeTab)) s.activeTab = DEFAULT_SETTINGS.activeTab;
    s.wonders = { omniscient: !!s.wonders?.omniscient };
    // Old saves kept the ticked list; buildings added later (e.g. the Altar) then stayed
    // unticked. We now keep the unticked ones: start again from "all ticked".
    delete s.buildings.selected;
    if (!Array.isArray(s.buildings.excluded)) s.buildings.excluded = [];
    s.radius = clampInt(s.radius, 3, 15, DEFAULT_SETTINGS.radius);
    s.topN = clampInt(s.topN, 3, 15, DEFAULT_SETTINGS.topN);
    if (!["LOW", "MEDIUM", "HIGH"].includes(s.overlapTol)) s.overlapTol = DEFAULT_SETTINGS.overlapTol;
    if (!["BOTH", "CITY", "TOWN"].includes(s.siteRoles)) s.siteRoles = DEFAULT_SETTINGS.siteRoles;
    for (const key of ["includeHidden", "spread", "heatmap", "useAI", "keepHighlights", "replacePrevious", "debug", "panelLarge"]) {
        s[key] = !!s[key];
    }
    for (const key of ["research", "production", "wonders", "growth", "towns", "purchases", "choices", "closePopups", "befriend", "tacks", "focus", "strategy", "resources", "diplomacy", "roam", "explore", "settlers", "defend", "merchants", "skipUnits", "endTurn", "resumeAfterAge"]) s.autopilot[key] = !!s.autopilot[key];
    // Version 2 (research/39): «expect to keep cities» on, the player's answer (the card is always taken).
    if (!(Number(raw?.v) >= 2)) s.towns = { ...s.towns, expectKeepCities: true };
    s.towns.expectKeepCities = !!s.towns?.expectKeepCities;
    s.autopilot.biasOpen = !!s.autopilot.biasOpen;
    s.yieldBias = normaliseBiasSets(s.yieldBias);
    s.autopilot.maxWonders = clampInt(s.autopilot.maxWonders, 1, 3, DEFAULT_SETTINGS.autopilot.maxWonders);
    if (!["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"].includes(s.autopilot.victory)) s.autopilot.victory = "AUTO";
    s.autopilot.reserveTurns = clampInt(s.autopilot.reserveTurns, 0, 10, DEFAULT_SETTINGS.autopilot.reserveTurns);
    s.autopilot.replanEvery = clampInt(s.autopilot.replanEvery, 0, 20, DEFAULT_SETTINGS.autopilot.replanEvery);
    s.autopilot.aiTurns = clampInt(s.autopilot.aiTurns, 1, 50, DEFAULT_SETTINGS.autopilot.aiTurns);
    s.autopilot.lastHumanPlayer = clampInt(s.autopilot.lastHumanPlayer, -1, 63, -1);
    s.memory = sanitizeMemory(s.memory);
    s.v = SCHEMA_VERSION;
    return s;
}

const MEMORY_VALUES = 20;

/** The game memory: { game, values } with at most MEMORY_VALUES plain values (strings, finite numbers, null). */
function sanitizeMemory(m) {
    const values = {};
    const raw = m?.values && typeof m.values === "object" ? m.values : {};
    for (const [k, v] of Object.entries(raw).slice(0, MEMORY_VALUES)) {
        if (v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) values[k] = v;
    }
    return { game: typeof m?.game === "string" ? m.game : "", values };
}

/**
 * This game's identity for `remember`: its seed and our leader, which an age change keeps (our civilization changes).
 * "" when unknown: nothing is remembered.
 */
export function gameKey() {
    try {
        const seed = Configuration.getGame()?.gameSeed;
        if (seed === undefined || seed === null) return "";
        const leader = Players.get(GameContext.localPlayerID)?.leaderType;
        return `${seed}|${leader ?? ""}`;
    } catch (_e) {
        return "";
    }
}

function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function readLocalStorage() {
    try {
        const blob = localStorage.getItem("modSettings");
        if (!blob) return null;
        const all = JSON.parse(blob);
        return all && typeof all === "object" ? all[MOD_ID] ?? null : null;
    } catch (error) {
        log.warn("settings: localStorage read failed", error);
        return null;
    }
}

function writeLocalStorage(data) {
    try {
        const blob = localStorage.getItem("modSettings");
        let all = {};
        if (blob) {
            const parsed = JSON.parse(blob);
            if (!parsed || typeof parsed !== "object") {
                // Not ours to repair: overwriting would wipe other mods' settings. The UI option backup still saves.
                log.warn("settings: modSettings is not an object; skipping localStorage write");
                return false;
            }
            all = parsed;
        }
        all[MOD_ID] = data;
        localStorage.setItem("modSettings", JSON.stringify(all));
        return true;
    } catch (error) {
        log.warn("settings: localStorage write failed", error);
        return false;
    }
}

function readUiOption() {
    try {
        const value = UI.getOption("user", "Mod", OPTION_NAME);
        if (typeof value === "string" && value.length > 0) {
            return JSON.parse(value);
        }
    } catch (error) {
        log.debug("settings: UI option read failed", error);
    }
    return null;
}

function writeUiOption(data) {
    try {
        UI.setOption("user", "Mod", OPTION_NAME, JSON.stringify(data));
        Configuration.getUser().saveCheckpoint();
    } catch (error) {
        log.debug("settings: UI option write failed", error);
    }
}

class SettingsStore {
    constructor() {
        this.data = null;
        this.listeners = new Set();
        this.saveTimer = 0;
        this.source = "defaults";
        this.depth = 0;
    }

    load() {
        let raw = readLocalStorage();
        this.source = "localStorage";
        if (!raw) {
            raw = readUiOption();
            this.source = raw ? "uiOption" : "defaults";
        }
        this.data = sanitize(raw);
        log.setDebug(this.data.debug);
        return this.data;
    }

    get() {
        if (!this.data) {
            this.load();
        }
        return this.data;
    }

    /** Merge a partial update, notify subscribers, and schedule a save. */
    patch(partial) {
        const before = this.get();
        this.data = sanitize(merge(before, partial));
        log.setDebug(this.data.debug);
        if (this.depth >= 8) {
            log.error("settings update loop stopped");
            return this.data;
        }
        this.depth++;
        try {
            for (const listener of this.listeners) {
                try {
                    listener(this.data, before);
                } catch (error) {
                    log.error("settings listener failed", error);
                }
            }
        } finally {
            this.depth--;
        }
        this.scheduleSave();
        return this.data;
    }

    /** A value remembered for this game (`remember`), or null. */
    recall(game, name) {
        const m = this.get().memory;
        return game && m.game === game ? m.values[name] ?? null : null;
    }

    /**
     * Remembers values for this game where an age change cannot wipe them: the save's GameTutorial properties do not
     * survive one (game 22: our tacks and the age's samples were gone at Exploration's and Modern's first turn).
     * Another game's values are dropped. Saved like a setting, without telling the listeners: nothing on screen shows it.
     */
    remember(game, values) {
        if (!game) return;
        const m = this.get().memory;
        const kept = m.game === game ? m.values : {};
        if (Object.entries(values).every(([k, v]) => kept[k] === v)) return;
        this.data = { ...this.get(), memory: sanitizeMemory({ game, values: { ...kept, ...values } }) };
        this.scheduleSave();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    scheduleSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = 0;
            this.saveNow();
        }, SAVE_DEBOUNCE_MS);
    }

    saveNow() {
        const data = this.get();
        writeLocalStorage(data);
        writeUiOption(data);
    }
}

export const settings = new SettingsStore();
