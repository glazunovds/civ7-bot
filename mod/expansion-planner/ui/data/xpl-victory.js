/**
 * Victories and triumphs as the game reports them (engine adapter for the autopilot's
 * victory focus, core/xpl-victory-focus.js). Same calls as the game's own screens:
 *  - the victories (victoryRaces, below); legacy paths are not read: `player.LegacyPaths.getScore`
 *    answered 0 for every path in every age of games 42-43, and their milestones count nothing in
 *    this game version (the focus scores the victories' own points: core raceStandings);
 *  - triumphs: GameInfo.Legacies rows the player's Legacies.isValidLegacy, getProgress(type) →
 *    { progress: [{ current, total }], raceWinner }, isTriggered(type); "taken by a rival" =
 *    FirstPlayerOnly and raceWinner another player; the kind from GameInfo.TypeTags
 *    (ui-next/screens/legacies/legacies-model.js);
 *  - the leader's preferred victory: GameInfo.LeaderTraits TRAIT_<AQ|EX|MO>_<path>_VICTORY.
 */
import { FOCUS_CLASSES, victoryOutcome } from '../core/xpl-victory-focus.js';
import { gameKey, settings } from '../services/xpl-settings.js';
import { log } from '../services/xpl-log.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
const truthy = (v) => v === true || v === 1 || v === "true";
const AGE_PREFIX = { AGE_ANTIQUITY: "AQ", AGE_EXPLORATION: "EX", AGE_MODERN: "MO" };
const TRIUMPH_KINDS = new Set(["CULTURAL", "SCIENTIFIC", "ECONOMIC", "MILITARISTIC", "EXPANSIONIST", "DIPLOMATIC", "CRISIS"]);

/**
 * Classes ("CULTURE", "SCIENCE", "ECONOMIC", "MILITARY") whose victory is switched off in this
 * game: GameInfo.Victories rows (VictoryClassType VICTORY_CLASS_<class>; the table has no
 * LegacyPathClassType) for which Game.VictoryManager says no, as the victories screen asks.
 * Unknown (no such call or table): nothing is off.
 */
export function disabledVictories() {
    const out = new Set();
    const VM = safe(() => Game.VictoryManager, null);
    if (typeof VM?.isCountdownVictoryEnabled !== "function") return out;
    for (const v of GameInfo.Victories ?? []) {
        const cls = String(v.VictoryClassType ?? "").replace("VICTORY_CLASS_", "");
        if (!cls || !v.VictoryType) continue;
        const on = safe(() => VM.isCountdownVictoryEnabled(v.VictoryType), null);
        if (on === false) out.add(cls);
    }
    return out;
}

/**
 * The victories themselves (1.4+ countdown races, GameInfo.VictoryTypes), as the victories screen
 * reads them (ui-next/screens/victories/victories-screen-model.js): our points
 * (player.Victories.getPointsForVictoryType: Innovation for science, GDP for economy; earned in
 * every age, StaticCarryover), the goal (a fixed score's MinimumPoints, science 100; else
 * Game.VictoryManager.getCountdownVictoryDominanceScore, -1 = not yet), the best rival's points
 * (majors we have met), the countdown (getVictoryCountdownStatus → { isDominant, turns }: turns
 * left of CountdownDuration while we lead) and whether it is switched on in this game.
 * Also the military race (`focusable: false`: the focus never takes it, the victory watch does) and
 * every alive major's standing, sorted by points (the victories screen's leaderboard,
 * victories-screen-model.js calcVictoryLeaderboard; met or not: the game's dominance goal counts
 * them all, root CLAUDE.md gotcha 32).
 * @returns [{ cls, type, scoring, focusable, points, goal, rival, turnsLeft (null unless counting down), enabled,
 *   board: [{ id, points, dominant, turns, met }] }]
 */
export function victoryRaces() {
    const me = safe(() => Players.get(pid()), null);
    if (!me?.Victories) return [];
    const majors = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMajor);
    const rivals = majors.filter((p) => p.id !== pid() && safe(() => me.Diplomacy.hasMet(p.id), false));
    const VM = safe(() => Game.VictoryManager, null);
    const out = [];
    for (const v of GameInfo.VictoryTypes ?? []) {
        const def = safe(() => GameInfo.Victories.find((a) => a.VictoryType === v.VictoryType), null);
        const cls = String(def?.VictoryClassType ?? "").replace("VICTORY_CLASS_", "");
        if (!RACE_CLASSES.includes(cls)) continue;
        const h = v.$hash ?? safe(() => Database.makeHash(v.VictoryType), null);
        const points = (p) => Number(safe(() => p.Victories.getPointsForVictoryType(h), 0)) || 0;
        const fixed = v.ScoringType === "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE";
        const goal = fixed ? Number(v.MinimumPoints) || 0 : Number(safe(() => VM.getCountdownVictoryDominanceScore(h), -1));
        const status = safe(() => me.Victories.getVictoryCountdownStatus(h), null);
        const duration = Number(v.CountdownDuration) || 0;
        const board = majors.map((p) => {
            const st = safe(() => p.Victories.getVictoryCountdownStatus(h), null);
            return {
                id: p.id, points: points(p), dominant: !!st?.isDominant,
                turns: st?.isDominant ? Math.max(0, duration - (Number(st.turns) || 0)) : null,
                met: p.id === pid() || !!safe(() => me.Diplomacy.hasMet(p.id), false),
            };
        }).sort((a, b) => b.points - a.points);
        out.push({
            cls,
            type: v.VictoryType,
            scoring: v.ScoringType ?? null,
            focusable: FOCUS_CLASSES.includes(cls),
            board,
            points: points(me),
            goal: Number.isFinite(goal) ? goal : -1,
            rival: rivals.reduce((m, p) => Math.max(m, points(p)), 0),
            turnsLeft: status?.isDominant ? Math.max(0, duration - (Number(status.turns) || 0)) : null,
            enabled: safe(() => VM.isCountdownVictoryEnabled(v.VictoryType), null) !== false,
        });
    }
    return out;
}

const RACE_CLASSES = [...FOCUS_CLASSES, "MILITARY"];
const FIXED_SCORE = "COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE";

/**
 * The victories the game has awarded (Game.VictoryManager.getVictories: { victory, team, place }, as the end-game screen and
 * the victories screen read them): their class, type, name and whether our team won it. [] before anyone wins.
 */
export function gameVictories() {
    const list = safe(() => Game.VictoryManager.getVictories(), null) ?? [];
    const team = safe(() => Players.get(pid()).team, null);
    const out = [];
    for (const v of list) {
        const def = safe(() => GameInfo.Victories.lookup(v.victory), null);
        const cls = String(def?.VictoryClassType ?? "").replace("VICTORY_CLASS_", "") || null;
        out.push({ cls, type: def?.VictoryType ?? null, name: def?.Name ?? null, place: v.place ?? null, ours: team !== null && v.team === team });
    }
    return out;
}

/** After the win (core victoryOutcome): the game's victories, our races and whether the game is played on past its end. */
export function victoryOutcomeNow() {
    let races = [];
    try {
        races = victoryRaces();
    } catch (error) {
        log.debug("victory outcome: races unknown", error);
    }
    return victoryOutcome(races, pid(), { victories: gameVictories(), extended: !!safe(() => Game.AgeProgressManager.isExtendedGame, false) });
}

/** The science victory's Innovation: { ours, goal, need: what is still missing } or null (no such victory known). */
export function innovationNeed() {
    const v = GameInfo.VictoryTypes?.find((x) => x.ScoringType === FIXED_SCORE && String(x.VictoryType).includes("SCIENCE"));
    const goal = Number(v?.MinimumPoints) || 0;
    if (!(goal > 0)) return null;
    const h = v.$hash ?? safe(() => Database.makeHash(v.VictoryType), null);
    const ours = Number(safe(() => Players.get(pid()).Victories.getPointsForVictoryType(h), 0)) || 0;
    return { ours, goal, need: Math.max(0, goal - ours) };
}

/**
 * The soonest a rival's countdown to a fixed-score victory ends the game (science: 100 Innovation and an undamaged Launch
 * Pad, then CountdownDuration turns), of the victories switched on: { turns, player, type } or null. Nothing we hold
 * stops such a countdown (a dominance countdown we may break by holding second place: research/31 §3), so whatever is
 * not done by then is lost. Game 27: Xerxes's countdown ran M97-M102 while our production had no end in sight (the score
 * victory was off).
 */
export function rivalWinTurns() {
    const VM = safe(() => Game.VictoryManager, null);
    let best = null;
    for (const v of GameInfo.VictoryTypes ?? []) {
        if (v.ScoringType !== FIXED_SCORE) continue;
        if (safe(() => VM.isCountdownVictoryEnabled(v.VictoryType), null) === false) continue;
        const h = v.$hash ?? safe(() => Database.makeHash(v.VictoryType), null);
        const duration = Number(v.CountdownDuration) || 0;
        for (const p of safe(() => Players.getAlive(), []) ?? []) {
            if (!p?.isMajor || p.id === pid()) continue;
            const st = safe(() => p.Victories.getVictoryCountdownStatus(h), null);
            if (!st?.isDominant) continue;
            const turns = Math.max(0, duration - (Number(st.turns) || 0));
            if (!best || turns < best.turns) best = { turns, player: p.id, type: v.VictoryType };
        }
    }
    return best;
}

/**
 * The score victory (VICTORY_SCORE, decided when the final age ends with no winner): every alive major's score, as the
 * victories screen's score tab reads it (victories-screen-model.js calcScoreDetails: getPointsForVictoryType), sorted.
 * @returns [{ id, points }] (empty: no such victory)
 */
/** Is the score victory on (the game ends with the final age and the score decides it)? Unknown: yes. */
export function scoreVictoryOn() {
    try {
        return Game.VictoryManager.isScoreVictoryEnabled() !== false;
    } catch (_e) {
        return true;
    }
}

export function scoreBoard() {
    const v = GameInfo.VictoryTypes?.find((x) => x.VictoryType === "VICTORY_SCORE");
    if (!v) return [];
    const h = v.$hash ?? safe(() => Database.makeHash(v.VictoryType), null);
    const majors = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMajor);
    return majors.map((p) => ({ id: p.id, points: Number(safe(() => p.Victories.getPointsForVictoryType(h), 0)) || 0 })).sort((a, b) => b.points - a.points);
}

/** The leader's preferred victory for this age (else its Modern one), as a focus class, or null. */
const FOCUS_KEY = "_XPL_OBJ_FOCUS"; // GameTutorial property: the last focus, kept in the save within an age

/** The focus kept in the save, or null. */
function focusInSave() {
    try {
        const raw = GameTutorial.getProperty(Database.makeHash(FOCUS_KEY));
        const data = typeof raw === "string" && raw ? JSON.parse(raw) : null;
        return FOCUS_CLASSES.includes(data?.cls) ? data.cls : null;
    } catch (_e) {
        return null;
    }
}

let memoryLogged = false;

/**
 * The focus last chosen in this game. The autopilot's state starts afresh with each age, and so do the save's
 * properties (game 22: our tacks and the age's samples were gone at E1 and M1), so the settings remember it too.
 */
export function savedFocus() {
    const kept = focusInSave();
    if (kept) return kept;
    const cls = settings.recall(gameKey(), "focus");
    if (!FOCUS_CLASSES.includes(cls)) return null;
    if (!memoryLogged) {
        memoryLogged = true;
        log.warn(`victory focus: ${cls} remembered from the last age (the settings: the save's properties do not outlive an age change)`);
    }
    return cls;
}

/** Keeps the focus in the save and in the settings' memory of this game (only when it changes). */
export function saveFocus(cls) {
    if (!FOCUS_CLASSES.includes(cls)) return;
    settings.remember(gameKey(), { focus: cls });
    if (focusInSave() === cls) return;
    try {
        GameTutorial.setProperty(Database.makeHash(FOCUS_KEY), JSON.stringify({ cls }));
    } catch (_e) {
        // no save: the settings still remember it
    }
}

export function leaderLeaning() {
    const leader = safe(() => GameInfo.Leaders.lookup(Players.get(pid()).leaderType)?.LeaderType, null);
    if (!leader) return null;
    const traits = new Set();
    for (const row of GameInfo.LeaderTraits ?? []) if (row.LeaderType === leader) traits.add(row.TraitType);
    const age = AGE_PREFIX[safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, "")];
    for (const prefix of [age, "MO"]) {
        if (!prefix) continue;
        const cls = FOCUS_CLASSES.find((c) => traits.has(`TRAIT_${prefix}_${c}_VICTORY`));
        if (cls) return cls;
    }
    return null;
}

/** @returns [{ type, name, current, total, done, lost, category, major }] (this game's triumphs) */
export function triumphs() {
    const legacies = safe(() => Players.get(pid()).Legacies, null);
    if (!legacies) return [];
    const kind = new Map();
    for (const t of GameInfo.TypeTags ?? []) if (TRIUMPH_KINDS.has(t.Tag) && !kind.has(t.Type)) kind.set(t.Type, t.Tag);
    const out = [];
    for (const def of GameInfo.Legacies ?? []) {
        if (!safe(() => legacies.isValidLegacy(def.LegacyType), false)) continue;
        const p = safe(() => legacies.getProgress(def.LegacyType), null);
        const first = p?.progress?.[0];
        const winner = p?.raceWinner ?? -1;
        out.push({
            type: def.LegacyType,
            name: def.Name,
            current: Number(first?.current) || 0,
            total: Number(first?.total) || 0,
            done: !!safe(() => legacies.isTriggered(def.LegacyType), false),
            lost: truthy(def.FirstPlayerOnly) && winner !== -1 && winner !== pid(),
            category: kind.get(def.LegacyType) ?? null,
            major: truthy(def.MajorLegacy),
        });
    }
    return out;
}
