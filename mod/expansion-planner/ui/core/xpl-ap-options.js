/**
 * The autopilot's options in one place (game 60's review, UI-4/UI-5). Pure: no engine globals.
 *
 * Before, the 28 option keys were copied by hand in the tab, the settings' sanitize list and the panel's HTML, and what an
 * option needs lived only in the hud's conditions and the tooltips' prose: «Охота на деревни» and «Охота на рейдеров» were
 * ticked by default while «Оборона», which they act with, was off, and «Ядерное оружие» researched Fission and built the
 * Manhattan Project with «Оборона» off, while only the strike checked it. Each option here has its key, kind, default,
 * group, its text keys and what it needs; `effectiveOptions` gives the options a pass acts on (the hud applies it to every
 * pass) and the tab dims what it switches off.
 *
 * Item: { key, kind: "check" | "choice", default, group, name, label, tip, details,
 *         needs?: [key...] (every one on), needsAny?: [[key...], ...] (one group all on),
 *         options? (a choice's values), off? (a choice's value when switched off by what it needs),
 *         whenOn? (acts only while the autopilot is on), note? (a hint for the tab) }
 * `tip` is the short tooltip (LOC_XPL_AP_<NAME>_TIP, at most about 300 characters: what it does, its default, what it needs;
 * game 60's review, M2: the old tooltips ran to 2,400 characters, past the game's tooltip box), `details` the full text the
 * tab's «?» opens under the item (LOC_XPL_AP_<NAME>_TT, the old tooltip).
 * A choice counts as on unless it has an `off` value and holds it (replanEvery 0: never).
 */

// The tab's groups, in order (the tab builds one collapsible group each, with a master checkbox over its checks).
export const AP_GROUPS = Object.freeze([
    { id: "choices", label: "LOC_XPL_AP_GROUP_CHOICES" },
    { id: "economy", label: "LOC_XPL_AP_GROUP_ECONOMY" },
    { id: "victory", label: "LOC_XPL_AP_GROUP_VICTORY" },
    { id: "expansion", label: "LOC_XPL_AP_GROUP_EXPANSION", movesUnits: true },
    { id: "defence", label: "LOC_XPL_AP_GROUP_DEFENCE", movesUnits: true },
    // Off by default by the user's choice (defensive): no master switch that turns them all on, only «Всё выкл.».
    { id: "wars", label: "LOC_XPL_AP_GROUP_WARS", movesUnits: true, noMaster: true },
    { id: "turn", label: "LOC_XPL_AP_GROUP_TURN" },
]);

const item = (key, kind, def, group, name, extra = {}) => Object.freeze({
    key, kind, default: def, group, name,
    label: kind === "check" ? `LOC_XPL_AP_${name}_LABEL` : `LOC_XPL_AP_${name}`,
    tip: `LOC_XPL_AP_${name}_TIP`,
    details: `LOC_XPL_AP_${extra.detailsName ?? name}_TT`,
    ...extra,
});

export const AP_OPTIONS = Object.freeze([
    // Decisions: research and civics, the choices that hold the turn, diplomacy, resources.
    item("research", "check", true, "choices", "RESEARCH"),
    item("choices", "check", true, "choices", "CHOICES"),
    item("closePopups", "check", true, "choices", "CLOSE_POPUPS", { whenOn: true }),
    item("befriend", "check", true, "choices", "BEFRIEND"),
    item("diplomacy", "check", false, "choices", "DIPLOMACY"),
    item("resources", "check", true, "choices", "RESOURCES"),
    // Production and gold. The plan's tacks: the plan's (production, recalculated: replanEvery > 0) or the settle tacks (settlers).
    item("production", "check", true, "economy", "PRODUCTION"),
    item("wonders", "check", true, "economy", "WONDERS", { needs: ["production"] }),
    item("maxWonders", "choice", 1, "economy", "MAX_WONDERS", { detailsName: "WONDERS", needs: ["wonders"], options: [1, 2, 3] }),
    item("tacks", "check", true, "economy", "TACKS", { needsAny: [["production", "replanEvery"], ["settlers"]] }),
    item("growth", "check", true, "economy", "GROWTH"),
    item("towns", "check", true, "economy", "TOWNS"),
    item("purchases", "check", true, "economy", "PURCHASES"),
    item("reserveTurns", "choice", 2, "economy", "RESERVE", { needs: ["purchases"], options: [0, 1, 2, 3, 5] }),
    // The victory focus.
    item("focus", "check", false, "victory", "FOCUS"),
    item("victory", "choice", "AUTO", "victory", "VICTORY", { needs: ["focus"], options: ["AUTO", "CULTURE", "SCIENCE", "ECONOMIC"] }),
    item("strategy", "check", true, "victory", "STRATEGY", { needs: ["focus"] }),
    // Expansion and scouting (units).
    item("explore", "check", false, "expansion", "EXPLORE"),
    item("settlers", "check", false, "expansion", "SETTLERS"),
    item("merchants", "check", false, "expansion", "MERCHANTS"),
    // «Оборона» and the generals; the army explores on its own.
    item("defend", "check", false, "defence", "DEFEND"),
    item("roam", "check", false, "defence", "ROAM"),
    item("huntRaiders", "check", true, "defence", "HUNT_RAIDERS", { needs: ["defend"] }),
    item("huntVillages", "check", true, "defence", "HUNT_VILLAGES", { needs: ["defend"] }),
    // Wars, all with «Оборона».
    item("offensive", "check", false, "wars", "OFFENSIVE", { needs: ["defend"] }),
    item("trainingWar", "check", false, "wars", "TRAINING_WAR", { needs: ["defend"] }),
    item("nuclear", "check", false, "wars", "NUCLEAR", { needs: ["defend"] }),
    item("nuclearCities", "check", false, "wars", "NUCLEAR_CITIES", { needs: ["nuclear", "defend"] }),
    // The turn.
    item("replanEvery", "choice", 5, "turn", "REPLAN", { needs: ["production"], options: [0, 1, 3, 5, 10], off: 0 }),
    item("skipUnits", "check", false, "turn", "SKIP_UNITS"),
    item("endTurn", "check", false, "turn", "END_TURN", { whenOn: true }),
    // Acts while the autopilot is off: it was on when the last age ended.
    item("resumeAfterAge", "check", true, "turn", "RESUME", { note: "AGE_END" }),
    item("aiTurns", "choice", 5, "turn", "AI", { options: [1, 3, 5, 10, 20, 50] }),
]);

const BY_KEY = new Map(AP_OPTIONS.map((o) => [o.key, o]));

/** The spec item of an option key, or null. */
export const optionOf = (key) => BY_KEY.get(key) ?? null;

/** The option keys, of one kind ("check" | "choice") or all, in the spec's order. */
export function optionKeys(kind = null) {
    return AP_OPTIONS.filter((o) => !kind || o.kind === kind).map((o) => o.key);
}

/** The options' defaults: { key: default }. */
export function optionDefaults() {
    return Object.fromEntries(AP_OPTIONS.map((o) => [o.key, Array.isArray(o.default) ? [...o.default] : o.default]));
}

/** The items of a group, in order. */
export function groupOptions(group) {
    return AP_OPTIONS.filter((o) => o.group === group);
}

/** The stored value of an option is on (a missing value reads as its default, like the hud's `!== false` checks)? */
export function storedOn(o, key) {
    const spec = BY_KEY.get(key);
    if (!spec) return !!o?.[key];
    const v = o?.[key] === undefined ? spec.default : o[key];
    if (spec.kind === "check") return !!v;
    return spec.off === undefined || (v !== spec.off && Number(v) !== spec.off);
}

/**
 * The option `key` waits for in `o`: a needed one that is off, or what holds that one back (the root: maxWonders with
 * production off waits for production, not for the ticked wonders), or null when nothing does. With `needsAny`, the first
 * group's.
 */
export function blockedBy(o, key, seen = new Set()) {
    const spec = BY_KEY.get(key);
    if (!spec || seen.has(key)) return null;
    seen.add(key);
    const why = (k) => (storedOn(o, k) ? blockedBy(o, k, new Set(seen)) : k);
    for (const k of spec.needs ?? []) {
        const w = why(k);
        if (w) return w;
    }
    if (spec.needsAny && !spec.needsAny.some((g) => g.every((k) => !why(k)))) return spec.needsAny[0].map(why).find(Boolean) ?? spec.needsAny[0][0];
    return null;
}

/** The option acts in a pass: stored on, and nothing it needs is off. */
export function isOptionOn(o, key) {
    return storedOn(o, key) && blockedBy(o, key) === null;
}

/**
 * The options a pass acts on: a copy of `o` with every option whose needs are off switched off (a check false, a choice to
 * its `off` value; a choice without one keeps its value: nothing reads it then). Keys outside the spec stay as they are.
 */
export function effectiveOptions(o = {}) {
    const out = { ...(o ?? {}) };
    for (const spec of AP_OPTIONS) {
        if (blockedBy(o, spec.key) === null) continue;
        if (spec.kind === "check") out[spec.key] = false;
        else if (spec.off !== undefined) out[spec.key] = spec.off;
    }
    return out;
}

// The strategy's phase replaces these two choices in every pass while it runs (core/xpl-strategy.js applyStrategy; game 60:
// the dropdowns showed 2 turns and 1 wonder while the phase used 1 turn on 59 turns and 2 wonders on 81).
const STRATEGY_VALUES = Object.freeze({ reserveTurns: "reserveTurns", maxWonders: "wonders" });

/** The phase's value of `key` while the strategy overrides it (focus and strategy on, a strategy known), else null. */
export function strategyOverride(key, o, strategy) {
    const field = STRATEGY_VALUES[key];
    if (!field || !strategy || !isOptionOn(o, "focus") || !isOptionOn(o, "strategy")) return null;
    const v = strategy[field];
    return v === undefined || v === null ? null : v;
}

// ---- what holds the turn (game 60's review, M1/M3) ------------------------------------------------------------------

// The age's choices are the player's: the next civilization when an age is over, the dedications when one starts.
export const AGE_CHOICE_BLOCKERS = Object.freeze(["NOTIFICATION_CHOOSE_CIVILIZATION", "NOTIFICATION_AGE_TRANSITION"]);

const BLOCKER_KINDS = Object.freeze({
    NOTIFICATION_CHOOSE_CITY_PRODUCTION: "PRODUCTION",
    NOTIFICATION_CHOOSE_TECH: "RESEARCH",
    NOTIFICATION_CHOOSE_CULTURE_NODE: "RESEARCH",
    NOTIFICATION_NEW_POPULATION: "CITIZEN",
    NOTIFICATION_COMMAND_UNITS: "UNITS",
});

/** What kind of thing holds the turn: PRODUCTION, RESEARCH, CITIZEN, UNITS, AGE (the player's), OTHER (a choice), or null. */
export function blockerKind(blocker) {
    if (!blocker) return null;
    if (AGE_CHOICE_BLOCKERS.includes(blocker)) return "AGE";
    return BLOCKER_KINDS[blocker] ?? "OTHER";
}

// The options whose steps the end-of-pass round runs again for each kind (the hud's settle round): units waiting for orders
// are ordered with a unit option, or skipped with «Пропускать юнитов» (the player's own units otherwise: no round for them).
const SETTLED_BY = Object.freeze({
    PRODUCTION: ["production"],
    RESEARCH: ["research"],
    CITIZEN: ["growth"],
    UNITS: ["explore", "settlers", "defend", "merchants", "roam", "skipUnits"],
    OTHER: ["choices"],
    AGE: [],
});

// Off the automatic pass (a step, «Завершать ход» off) the units waiting are mostly the player's own: ordering ours again
// releases none of them, only skipping does (the review of game 60's step: an F7 step with «Разведка» on and the player's units
// waiting took 3.5 s instead of 0.8, two rounds that sent the same orders again).
const SETTLED_ATTENDED = Object.freeze({ ...SETTLED_BY, UNITS: ["skipUnits"] });

/**
 * The autopilot's options handle what holds the turn (the settle round runs again for it)? `endsTurn`: the automatic pass that
 * ends the turn (the player is away), else a step or a pass the player watches.
 */
export function settles(blocker, o, { endsTurn = true } = {}) {
    const kind = blockerKind(blocker);
    return !!kind && ((endsTurn ? SETTLED_BY : SETTLED_ATTENDED)[kind] ?? []).some((k) => isOptionOn(o, k));
}

/**
 * The text for what holds the turn: the game's own message for it (the end-turn button shows Game.Notifications.getMessage),
 * else LOC_XPL_AP_BLOCKED_<kind>, else its type name; "the turn can end" without one. `compose`: Locale.compose.
 */
export function blockerText(blocker, compose) {
    if (!blocker?.type) return compose("LOC_XPL_AP_BLOCKED_FREE");
    const kind = blockerKind(blocker.type);
    const what = blocker.message ? compose(blocker.message) : kind && kind !== "OTHER" && kind !== "AGE" ? compose(`LOC_XPL_AP_BLOCKED_${kind}`) : blocker.type;
    return compose("LOC_XPL_AP_BLOCKED_HOLDS", what);
}
