/**
 * Victory paths and triumphs as the game reports them (engine adapter for the autopilot's
 * victory focus, core/xpl-victory-focus.js). Same calls as the game's own screens:
 *  - legacy paths: GameInfo.LegacyPaths (this age's, EnabledByDefault), each player's
 *    player.LegacyPaths.getScore(type), the goal = RequiredPathPoints of the path's final
 *    GameInfo.AgeProgressionMilestones row (ui/victory-manager/victory-manager.js); rivals are
 *    the majors we have met, as that screen shows them;
 *  - triumphs: GameInfo.Legacies rows the player's Legacies.isValidLegacy, getProgress(type) →
 *    { progress: [{ current, total }], raceWinner }, isTriggered(type); "taken by a rival" =
 *    FirstPlayerOnly and raceWinner another player; the kind from GameInfo.TypeTags
 *    (ui-next/screens/legacies/legacies-model.js);
 *  - the leader's preferred victory: GameInfo.LeaderTraits TRAIT_<AQ|EX|MO>_<path>_VICTORY.
 */
import { FOCUS_CLASSES } from '../core/xpl-victory-focus.js';

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

/** @returns [{ cls: "CULTURE"|"SCIENCE"|"ECONOMIC"|"MILITARY", path, name, ours, rival, goal }] */
export function legacyStandings() {
    const me = safe(() => Players.get(pid()), null);
    if (!me?.LegacyPaths) return [];
    const rivals = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMajor && p.id !== pid() && safe(() => me.Diplomacy.hasMet(p.id), false));
    // A path switched off in the game setup keeps its row (EnabledByDefault): the player's
    // enabled paths are the truth (panel-age-rankings.js getEnabledLegacyPaths).
    const enabled = new Set((safe(() => me.LegacyPaths.getEnabledLegacyPaths(), null) ?? []).map((e) => e.legacyPath));
    const out = [];
    for (const path of GameInfo.LegacyPaths ?? []) {
        if (!truthy(path.EnabledByDefault)) continue;
        if (enabled.size > 0 && !enabled.has(Database.makeHash(path.LegacyPathType))) continue;
        const cls = String(path.LegacyPathClassType ?? "").replace("LEGACY_PATH_CLASS_", "");
        let goal = 0;
        for (const m of GameInfo.AgeProgressionMilestones ?? []) {
            if (truthy(m.FinalMilestone) && m.LegacyPathType === path.LegacyPathType) goal = Number(m.RequiredPathPoints) || 0;
        }
        const score = (p) => Number(safe(() => p.LegacyPaths.getScore(path.LegacyPathType), 0)) || 0;
        out.push({ cls, path: path.LegacyPathType, name: path.Name, ours: score(me), rival: rivals.reduce((m, p) => Math.max(m, score(p)), 0), goal });
    }
    return out;
}

/**
 * Classes ("CULTURE", "SCIENCE", "ECONOMIC", "MILITARY") whose victory is switched off in this
 * game: GameInfo.Victories rows (LegacyPathClassType) for which Game.VictoryManager says no.
 * Unknown (no such call or table): nothing is off.
 */
export function disabledVictories() {
    const out = new Set();
    const VM = safe(() => Game.VictoryManager, null);
    if (typeof VM?.isCountdownVictoryEnabled !== "function") return out;
    for (const v of GameInfo.Victories ?? []) {
        const cls = String(v.LegacyPathClassType ?? "").replace("LEGACY_PATH_CLASS_", "");
        if (!cls || !v.VictoryType) continue;
        const on = safe(() => VM.isCountdownVictoryEnabled(v.VictoryType), null);
        if (on === false) out.add(cls);
    }
    return out;
}

/** The leader's preferred victory for this age (else its Modern one), as a focus class, or null. */
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
