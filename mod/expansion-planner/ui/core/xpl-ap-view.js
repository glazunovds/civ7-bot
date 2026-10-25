/**
 * The Autopilot tab's view model (game 60's review, UI-1, UI-4 to UI-8). Pure: no engine globals; texts come through `compose`.
 *
 * - Groups: each spec group's items with their depth under what they need, the master checkbox's state over the group's checks
 *   and the patch a click on it sends; each item's chips (what it waits for, the phase's value that replaces it, a hint).
 * - The log: game 60 recorded 2,171 entries in 141 turns (median 16 a turn, 37 at most), 52% routine housekeeping, and the tab
 *   kept 80, newest first, rebuilt on every state change and thrown back to the top on every entry. Now the rows are oldest
 *   first with a header per turn, a turn's THREAT entries one row, filtered (Главное | Всё | Ошибки), and `reconcileRows` gives
 *   the rows to remove, update and append between two renders (rows leave at the top and arrive at the bottom).
 * - The tab's own settings (`autopilot.ui`): the compact frame's view, the log's filter, the groups left open.
 */
import { AP_GROUPS, blockedBy, groupOptions, optionOf, storedOn, strategyOverride } from './xpl-ap-options.js';

// ---- groups and items ----------------------------------------------------------------------------------------------

/** A group's items in order, each with its depth: one more than the first item of the group it needs (0 at the top). */
export function groupItems(group) {
    const depth = new Map();
    return groupOptions(group).map((o) => {
        const parent = [...(o.needs ?? []), ...(o.needsAny?.[0] ?? [])].find((k) => depth.has(k));
        const d = parent ? depth.get(parent) + 1 : 0;
        depth.set(o.key, d);
        return { key: o.key, kind: o.kind, depth: d };
    });
}

/** The master checkbox over a group's checks (stored values): { on, total, state: ON | OFF | MIXED }. */
export function groupState(o, group) {
    const checks = groupOptions(group).filter((x) => x.kind === "check");
    const on = checks.filter((x) => storedOn(o, x.key)).length;
    return { on, total: checks.length, state: on === 0 ? "OFF" : on === checks.length ? "ON" : "MIXED" };
}

/**
 * What a click on a group's master sends: every check of the group set to `value`. A group without a master (the wars, off by
 * default by the user's choice) is only ever switched off: on gives {}.
 */
export function groupPatch(group, value) {
    const spec = AP_GROUPS.find((g) => g.id === group);
    if (!spec || (spec.noMaster && value)) return {};
    return Object.fromEntries(groupOptions(group).filter((x) => x.kind === "check").map((x) => [x.key, !!value]));
}

// The phase's value replaces these two (core/xpl-strategy.js applyStrategy): the chip that shows it.
const PHASE_CHIPS = Object.freeze({ reserveTurns: "LOC_XPL_AP_PHASE_RESERVE", maxWonders: "LOC_XPL_AP_PHASE_WONDERS" });

/** The chip for what an option waits for: «нужна «Оборона»» (one per option it can wait for), or one for a choice of needs. */
export function needsChip(key, blocker) {
    const spec = optionOf(key);
    if (!spec || !blocker) return null;
    if (spec.needsAny && !(spec.needs ?? []).length) return `LOC_XPL_AP_NEEDS_ANY_${spec.name}`;
    return `LOC_XPL_AP_NEEDS_${optionOf(blocker)?.name ?? blocker}`;
}

/** Every chip key the tab may show (both languages need them). */
export function chipKeys() {
    const out = new Set(["LOC_XPL_AP_WHEN_ON", ...Object.values(PHASE_CHIPS)]);
    for (const g of AP_GROUPS) {
        for (const it of groupOptions(g.id)) {
            const spec = optionOf(it.key);
            for (const k of spec.needs ?? []) out.add(needsChip(it.key, k));
            if (spec.needsAny) for (const k of spec.needsAny.flat()) out.add(needsChip(it.key, k));
            if (spec.note) out.add(`LOC_XPL_AP_NOTE_${spec.note}`);
        }
    }
    return [...out];
}

/**
 * An item as the tab shows it: { stored, blocked (the option it waits for, or null), dim, chips: [{ key, args, kind }] }.
 * Dimmed: a check stored on that acts as off, a choice whose value no pass reads, or a value the phase replaces; each stays
 * editable (the stored value is the player's). `autopilotOn`: closePopups and endTurn act only then (a hint while off).
 */
export function itemView(o, key, { autopilotOn = false, strategy = null } = {}) {
    const spec = optionOf(key);
    if (!spec) return null;
    const stored = spec.kind === "check" ? storedOn(o, key) : (o?.[key] === undefined ? spec.default : o[key]);
    const blocked = blockedBy(o, key);
    const chips = [];
    if (blocked) chips.push({ key: needsChip(key, blocked), args: [], kind: "NEEDS" });
    const phase = strategyOverride(key, o, strategy);
    if (phase !== null) chips.push({ key: PHASE_CHIPS[key], args: [phase], kind: "PHASE" });
    if (spec.whenOn && !autopilotOn) chips.push({ key: "LOC_XPL_AP_WHEN_ON", args: [], kind: "HINT" });
    if (spec.note) chips.push({ key: `LOC_XPL_AP_NOTE_${spec.note}`, args: [], kind: "HINT" });
    const dim = (!!blocked && (spec.kind !== "check" || stored)) || phase !== null;
    return { stored, blocked, dim, chips };
}

// ---- the generals (UI-8) -------------------------------------------------------------------------------------------

const ROLES = new Set(["VANGUARD", "BASTION"]);
const FIELD_KINDS = new Set(["HUNT", "RAIDERS", "WAR"]);
const STAGES = new Set(["GATHER", "FIGHT"]);

/**
 * The «Оборона и генералы» header's line: «Авангард ур. 2 (34/45) · Бастион ур. 1 (3/7) · охота на рейдеров: бой» from
 * state.autopilot.generals (units.js generalsSummary) and fieldOp ({ kind, stage }); "" before the unit step has run.
 */
export function generalsLine(generals, fieldOp, compose) {
    if (!Array.isArray(generals)) return "";
    const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : "?");
    const parts = generals.map((g) => compose("LOC_XPL_AP_GENERAL_ENTRY", compose(`LOC_XPL_AP_ROLE_${ROLES.has(g?.role) ? g.role : "NONE"}`), num(g?.level), num(g?.xp), num(g?.next)));
    if (parts.length === 0) parts.push(compose("LOC_XPL_AP_GENERALS_NONE"));
    if (FIELD_KINDS.has(fieldOp?.kind)) {
        const kind = compose(`LOC_XPL_AP_FIELD_${fieldOp.kind}`);
        parts.push(STAGES.has(fieldOp.stage) ? compose("LOC_XPL_AP_FIELD_LINE", kind, compose(`LOC_XPL_AP_STAGE_${fieldOp.stage}`)) : kind);
    }
    return parts.join(" · ");
}

// ---- the log (UI-6) ------------------------------------------------------------------------------------------------

export const LOG_FILTERS = Object.freeze(["MAIN", "ALL", "ERRORS"]);

// Housekeeping that repeats every turn (game 60: 52% of the entries): «Главное» hides it.
const ROUTINE = new Set([
    "TURN_ENDED", "UNITS_SKIPPED", "REPLANNED", "TACKS", "SETTLE_TACKS", "SITES_FOUND", "GROWTH_TILE", "GROWTH_SPECIALIST",
    "ACKNOWLEDGED", "ADVISOR_SEEN", "LEADER_MESSAGE", "OPEN_BORDERS", "ROAM", "EXPLORE", "SCOUT_VILLAGE", "FORTIFY", "HEAL",
    "ALERT", "UNIT_AWAY", "WITHDRAW", "TO_WATER", "LEFT_WATER", "WATER_WAIT", "STEP_ASIDE", "REINFORCE", "VANGUARD_RALLY",
    "MISSION_MOVE", "SETTLE_MOVE", "SETTLER_WAITS", "SETTLER_DETOUR", "SETTLER_AT_CAP", "FIELD_ADVANCE", "COMMANDER_ADVANCE",
]);
// What did not happen, or holds the turn: «Ошибки» shows only these.
const ERRORS = new Set([
    "ERROR", "BLOCKED", "END_TURN_REFUSED", "WAIT_DIPLOMACY", "ORDERS_NOT_TAKEN", "AI_REFUSED_AGE_END", "MOVE_STUCK",
    "QUEUE_UNSTUCK", "QUEUE_UNSTUCK_QUEUED", "QUEUE_STUCK_DROPPED", "STEP_BUSY", "STEP_NOT_YOUR_TURN", "STEP_AI",
]);

/** An entry's category: ERROR (also the age's choices, the player's), ROUTINE, or MAIN. */
export function logCategory(key) {
    if (ERRORS.has(key) || /^AGE_(OVER|START)/.test(key ?? "")) return "ERROR";
    return ROUTINE.has(key) ? "ROUTINE" : "MAIN";
}

const shows = (filter, cat) => (filter === "ALL" ? true : filter === "ERRORS" ? cat === "ERROR" : cat !== "ROUTINE");

/**
 * The log's rows, oldest first (`entries`: state.autopilot.log, in any order: sorted by `seq`). A header for each run of a
 * turn with an entry shown, then its entries; a turn's THREAT entries are one row where the first stood, each settlement
 * with its last count. Rows: { id, kind: TURN | ENTRY | THREATS, turn, key?, args?, cat?, threats? ([name, count]...) }.
 */
export function logRows(entries, filter = "MAIN") {
    const list = (entries ?? []).filter(Boolean).map((e, i) => ({ e, i }))
        .sort((a, b) => (a.e.seq ?? -a.i) - (b.e.seq ?? -b.i)).map((x) => x.e);
    const rows = [];
    const runs = new Map(); // turn -> runs of it so far (an earlier save loaded: the same turn again)
    let turn;
    let run = "";
    let threats = null;
    for (const e of list) {
        const cat = logCategory(e.key);
        if (!shows(filter, cat)) continue;
        if (e.turn !== turn) {
            turn = e.turn;
            const n = runs.get(turn) ?? 0;
            runs.set(turn, n + 1);
            run = `${turn}:${n}`;
            rows.push({ id: `T${run}`, kind: "TURN", turn });
            threats = null;
        }
        if (e.key === "THREAT") {
            if (!threats) {
                threats = { id: `H${run}`, kind: "THREATS", turn, byName: new Map() };
                rows.push(threats);
            }
            threats.byName.set(String(e.args?.[0] ?? "?"), e.args?.[1]);
            continue;
        }
        rows.push({ id: `E${e.seq ?? `${turn}:${e.key}:${rows.length}`}`, kind: "ENTRY", turn, key: e.key, args: e.args ?? [], cat });
    }
    for (const r of rows) {
        if (r.kind !== "THREATS") continue;
        r.threats = [...r.byName.entries()];
        delete r.byName;
    }
    return rows;
}

/**
 * The rows to change from `rendered` ([{ id, text }], as shown) to `desired` ([{ id, text, ... }]): { reset: true } when the
 * rows kept are out of order or a new one falls between them, else { remove: [id], update: [row], append: [row] }.
 */
export function reconcileRows(rendered, desired) {
    const at = new Map(desired.map((r, i) => [r.id, i]));
    const kept = rendered.filter((r) => at.has(r.id));
    if (kept.length === 0) return { reset: true };
    let last = -1;
    for (const r of kept) {
        const i = at.get(r.id);
        if (i <= last) return { reset: true };
        last = i;
    }
    const have = new Set(kept.map((r) => r.id));
    const append = desired.filter((r) => !have.has(r.id));
    if (append.some((r) => at.get(r.id) < last)) return { reset: true };
    return {
        reset: false,
        remove: rendered.filter((r) => !at.has(r.id)).map((r) => r.id),
        update: kept.map((r) => desired[at.get(r.id)]).filter((d, i) => d.text !== kept[i].text),
        append,
    };
}

// ---- the tab's own settings (autopilot.ui) -------------------------------------------------------------------------

export const AP_VIEWS = Object.freeze(["LOG", "SETTINGS"]);
// What may stay open: each group and the victory box above the log.
const OPEN_IDS = () => [...AP_GROUPS.map((g) => g.id), "focusBox"];

/** The defaults: the compact frame shows the log, «Главное», every group closed and the victory box open. */
export const AP_UI_DEFAULTS = Object.freeze({ view: "LOG", logFilter: "MAIN", open: Object.freeze({}) });

/** Drops unknown values: { view, logFilter, open: { id: boolean } }. */
export function sanitizeApUi(ui) {
    const open = {};
    for (const id of OPEN_IDS()) if (typeof ui?.open?.[id] === "boolean") open[id] = ui.open[id];
    return {
        view: AP_VIEWS.includes(ui?.view) ? ui.view : AP_UI_DEFAULTS.view,
        logFilter: LOG_FILTERS.includes(ui?.logFilter) ? ui.logFilter : AP_UI_DEFAULTS.logFilter,
        open,
    };
}

/** A group (or the victory box) is open: as stored, else closed (the victory box open). */
export function isOpen(ui, id) {
    const v = ui?.open?.[id];
    return typeof v === "boolean" ? v : id === "focusBox";
}
