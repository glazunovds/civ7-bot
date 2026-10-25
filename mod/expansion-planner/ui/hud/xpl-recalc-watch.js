/**
 * Watches the game (always on, cheap: no planning here) and records when a recalculation
 * of the last building plan or site list would make sense, with the reason. A gold dot
 * on the toolbar button and its tooltip show the suggestion; the tabs list the reasons
 * and highlight "Recalculate". Nothing is ever recalculated automatically.
 */
import { state } from '../services/xpl-state.js';
import { log } from '../services/xpl-log.js';
import { adviceFor, suggestRecalc } from '../services/xpl-advice.js';
import { nearCentres, userTackSignature } from '../data/xpl-building-job.js';
import { getEngineMap } from '../data/xpl-engine-map.js';
import { unlockedUniqueQuarters } from '../data/xpl-rules-loader.js';
import { FOCUS_POPULATION } from '../core/xpl-town-focus.js';
import { blockerText } from '../core/xpl-ap-options.js';

const TURNS_BEFORE_SUGGESTING = 10;  // timing priorities drift as the age goes on; new land gets explored
const SITE_CITY_RANGE = 6;           // a city founded or lost this close to a pick changes its room
const TACK_CHECK_DELAY_MS = 600;
const STEP_NOTE_MS = 3000;           // a step's outcome stays next to the toolbar button this long (game 60's review, UI-3)
let stepNoteTimer = 0;

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

const local = () => GameContext.localPlayerID;
const plans = () => state.get().results.plans;
const sites = () => state.get().results.sites;

function nearPlan(loc) {
    const p = plans();
    return !!p && !!loc && nearCentres(p.centres)({ x: loc.x, y: loc.y });
}

function nearPicks(loc, range) {
    const s = sites();
    if (!s?.picks?.length || !loc) return false;
    const m = getEngineMap();
    const idx = m.index(loc.x, loc.y);
    return s.picks.some((p) => m.map.distance(p.idx, idx) <= range);
}

function isBuildingOrWonder(type) {
    const cls = GameInfo.Constructibles.lookup(type)?.ConstructibleClass;
    return cls === "BUILDING" || cls === "WONDER";
}

function cityLocation(cityID) {
    try {
        return Cities.get(cityID)?.location ?? null;
    } catch (_e) {
        return null;
    }
}

function onCityChange(data, ownOnlyForPlans) {
    const loc = cityLocation(data?.cityID);
    if (plans() && data?.cityID?.owner === local() && ownOnlyForPlans) suggestRecalc("plans", "CITY");
    if (sites() && (!loc || nearPicks(loc, SITE_CITY_RANGE))) suggestRecalc("sites", "CITIES");
}

let tackTimer = 0;
function checkTacks() {
    const p = plans();
    if (!p || p.userTackSig == null) return;
    if (userTackSignature(p.centres) !== p.userTackSig) suggestRecalc("plans", "TACKS");
}

/** A unique quarter became buildable since the plan (Syncretism, a new civ's quarter). */
function checkUniques() {
    const p = plans();
    if (!p || p.uniqueQuartersSig == null) return;
    if (unlockedUniqueQuarters().join(",") !== p.uniqueQuartersSig) suggestRecalc("plans", "UNIQUES");
}

// Towns worth a look (kind "towns"), each town reported once until its situation changes:
// FOCUS_READY = it reached population 7 while still Growing (a Focus can be chosen);
// NOT_CONNECTED = it has a Focus but no connected city (its food feeds nobody).
const reportedReady = new Set();
const reportedLonely = new Set();

function townKey(c) {
    return `${c.location?.x}-${c.location?.y}`;
}

function hasConnectedCity(town) {
    for (const id of town.getConnectedCities?.() ?? []) {
        try {
            const c = Cities.get(id);
            if (c && !c.isTown) return true;
        } catch (_e) {
            // ignore
        }
    }
    return false;
}

function checkTowns(cityID) {
    let list;
    try {
        list = cityID ? [Cities.get(cityID)] : Players.get(local()).Cities.getCities();
    } catch (_e) {
        return;
    }
    for (const c of list ?? []) {
        if (!c?.isTown || (c.owner ?? c.id?.owner) !== local()) continue;
        const key = townKey(c);
        const growing = c.Growth?.growthType !== GrowthTypes.PROJECT;
        if (growing && (c.population ?? 0) >= FOCUS_POPULATION) {
            if (!reportedReady.has(key)) suggestRecalc("towns", "FOCUS_READY");
            reportedReady.add(key);
        } else {
            reportedReady.delete(key);
        }
        if (!growing && !hasConnectedCity(c)) {
            if (!reportedLonely.has(key)) suggestRecalc("towns", "NOT_CONNECTED");
            reportedLonely.add(key);
        } else {
            reportedLonely.delete(key);
        }
    }
}

const HANDLERS = {
    ConstructibleAddedToMap: (d) => {
        if (isBuildingOrWonder(d?.constructibleType) && nearPlan(d?.location)) suggestRecalc("plans", "BUILT");
    },
    ConstructibleRemovedFromMap: (d) => {
        if (isBuildingOrWonder(d?.constructibleType) && nearPlan(d?.location)) suggestRecalc("plans", "BUILT");
    },
    PlotOwnershipChanged: (d) => {
        if (nearPlan(d?.location)) suggestRecalc("plans", "TILES");
        if (nearPicks(d?.location, 3)) suggestRecalc("sites", "BORDERS");
    },
    CityInitialized: (d) => onCityChange(d, true),
    CityRemovedFromMap: (d) => onCityChange(d, true),
    CityTransfered: (d) => onCityChange(d, true),
    TechNodeCompleted: (d) => {
        if (d?.player === local() && plans()?.placements?.some((p) => p.locked)) suggestRecalc("plans", "UNLOCKED");
    },
    CultureNodeCompleted: (d) => {
        if (d?.player === local() && plans()?.placements?.some((p) => p.locked)) suggestRecalc("plans", "UNLOCKED");
        checkUniques();
    },
    // The Syncretism choice is a player operation, not a civic: these are the events it can raise.
    PlayerUnlockChanged: checkUniques,
    TraditionChanged: checkUniques,
    PlayerTurnActivated: (d) => {
        if (d?.player !== local()) return;
        checkUniques();
        checkTowns(null);
        const turn = Game.turn;
        const p = plans();
        if (p?.computedTurn != null && turn - p.computedTurn >= TURNS_BEFORE_SUGGESTING) suggestRecalc("plans", "TURNS");
        const s = sites();
        if (s?.computedTurn != null && turn - s.computedTurn >= TURNS_BEFORE_SUGGESTING) suggestRecalc("sites", "TURNS");
    },
    CityPopulationChanged: (d) => {
        if (d?.cityID?.owner === local()) checkTowns(d.cityID);
    },
    CityGrowthModeChanged: (d) => {
        if (d?.cityID?.owner === local()) checkTowns(d.cityID);
    },
    MapTackUIUpdated: () => {
        clearTimeout(tackTimer);
        tackTimer = setTimeout(checkTacks, TACK_CHECK_DELAY_MS);
    },
};

for (const [name, handler] of Object.entries(HANDLERS)) {
    engine.on(name, (data) => {
        try {
            handler(data);
        } catch (error) {
            log.debug(`recalc watch ${name} failed`, error);
        }
    });
}

/** Gold dot + reasons in the tooltip of our toolbar button while a recalculation is suggested. */
export function refreshDockAdvice() {
    try {
        const button = document.querySelector(".xpl-dock-button");
        if (!button) return;
        const reasons = [
            ...adviceFor("plans").map((r) => compose(`LOC_XPL_STALE_${r}`)),
            ...adviceFor("sites").map((r) => compose(`LOC_XPL_SITES_STALE_${r}`)),
            ...adviceFor("towns").map((r) => compose(`LOC_XPL_TOWNS_ADVICE_${r}`)),
        ];
        let badge = button.querySelector(".xpl-dock-badge");
        if (reasons.length > 0 && !badge) {
            badge = document.createElement("div");
            badge.classList.add("xpl-dock-badge");
            button.appendChild(badge);
        } else if (reasons.length === 0 && badge) {
            badge.remove();
        }
        // A green dot (other corner) while the autopilot is on, amber while a pass works (a step with it off too).
        const ap = state.get().autopilot ?? {};
        const autoOn = !!ap.enabled;
        const working = !!ap.running;
        let auto = button.querySelector(".xpl-dock-auto");
        if ((autoOn || working) && !auto) {
            auto = document.createElement("div");
            auto.classList.add("xpl-dock-auto");
            button.appendChild(auto);
        } else if (!autoOn && !working && auto) {
            auto.remove();
        }
        auto?.classList.toggle("xpl-dock-auto--working", working);
        // A step's outcome (F7, «Следующий шаг») for a few seconds next to the button: done, or why it was refused.
        const step = ap.lastStep ?? null;
        const age = step ? Date.now() - (Number(step.at) || 0) : Infinity;
        let note = button.querySelector(".xpl-dock-note");
        if (age < STEP_NOTE_MS) {
            if (!note) {
                note = document.createElement("div");
                note.classList.add("xpl-dock-note");
                button.appendChild(note);
            }
            note.textContent = step.refused ? compose(`LOC_XPL_DOCK_STEP_${step.refused}`) : compose("LOC_XPL_DOCK_STEP_DONE", step.entries ?? 0);
            clearTimeout(stepNoteTimer);
            stepNoteTimer = setTimeout(refreshDockAdvice, STEP_NOTE_MS - age + 50);
        } else if (note) {
            note.remove();
        }
        // What holds the turn after this turn's last pass (game 60's review, M3).
        const turn = (() => {
            try {
                return Game.turn;
            } catch (_e) {
                return null;
            }
        })();
        const blocker = ap.blocker && ap.blocker.turn === turn ? `[N]${blockerText(ap.blocker, compose)}` : "";
        const status = autoOn ? `[N]${compose("LOC_XPL_DOCK_AUTOPILOT")}` : working ? `[N]${compose("LOC_XPL_AP_STATUS_STEPPING")}` : "";
        const tip = compose("LOC_XPL_DOCK_TT") + status + blocker + (reasons.length > 0 ? `[N][N]${compose("LOC_XPL_DOCK_ADVICE", reasons.join(", "))}` : "");
        button.setAttribute("data-tooltip-content", tip);
    } catch (error) {
        log.debug("dock advice failed", error);
    }
}

state.subscribe((_s, changed) => {
    if (changed.includes("advice") || changed.includes("autopilot")) refreshDockAdvice();
});
