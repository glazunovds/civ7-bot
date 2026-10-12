/**
 * Loads the game rules the planner needs from the live GameInfo (never hard-coded, so
 * DLC and other mods are picked up). Thin wrapper around core/rule-book.js, memoised
 * per age.
 */
import { buildRuleBook } from '../core/xpl-rule-book.js';
import { log } from '../services/xpl-log.js';

let cache = null;

function globalNumber(name, fallback) {
    try {
        const value = Number(GameInfo.GlobalParameters.lookup(name)?.Value);
        return Number.isFinite(value) ? value : fallback;
    } catch (_e) {
        return fallback;
    }
}

/** RequiresActivation adjacencies, judged on the capital (activation is mostly player-wide; V31). */
function activationCheck() {
    try {
        const player = Players.get(GameContext.localPlayerID);
        const capital = player?.Cities?.getCapital?.() ?? player?.Cities?.getCities?.()[0];
        if (capital?.Constructibles?.isAdjacencyUnlocked) {
            return (id) => {
                try {
                    return !!capital.Constructibles.isAdjacencyUnlocked(id); // takes the ID string (constructible-details.js:216)
                } catch (_e) {
                    return false;
                }
            };
        }
    } catch (_e) {
        // no capital yet
    }
    return () => false;
}

/**
 * The unique quarters the game lets the local player build, sorted. Same source as the
 * production menu (GetUniqueQuartersForPlayer): the own civ's quarter, earlier ages' civs'
 * quarters and a quarter adopted through Syncretism (e.g. the Abbasid Ulema for a
 * Time-Tested Greece), which can appear in the middle of a turn.
 */
export function unlockedUniqueQuarters() {
    const out = [];
    try {
        const player = Players.get(GameContext.localPlayerID);
        const constructibles = globalThis.Players?.Constructibles?.get?.(GameContext.localPlayerID) ?? player?.Constructibles;
        for (const q of constructibles?.getUnlockedUniqueQuarters?.() ?? []) {
            const def = GameInfo.UniqueQuarters.lookup(q);
            if (def) out.push(def.UniqueQuarterType);
        }
    } catch (error) {
        log.debug("unique quarters failed", error);
    }
    return out.sort();
}

/** The local player's civ/leader traits and unlocked unique quarters. */
function playerContext() {
    const traits = new Set();
    let civ = null;
    try {
        const player = Players.get(GameContext.localPlayerID);
        civ = GameInfo.Civilizations.lookup(player?.civilizationType)?.CivilizationType ?? null;
        const leader = GameInfo.Leaders?.lookup(player?.leaderType)?.LeaderType ?? null;
        for (const row of GameInfo.CivilizationTraits ?? []) if (row.CivilizationType === civ) traits.add(row.TraitType);
        for (const row of GameInfo.LeaderTraits ?? []) if (row.LeaderType === leader) traits.add(row.TraitType);
    } catch (error) {
        log.debug("player context failed", error);
    }
    return { civ, traits, uniqueQuarterTypes: new Set(unlockedUniqueQuarters()) };
}

/**
 * The rule book for the current age and player. Rebuilt (about 10 ms) whenever what it
 * depends on can have changed: a new turn (techs and civics activate adjacencies) or a
 * different set of unique quarters (Syncretism adopts one mid-turn).
 */
export function getRules() {
    const age = GameInfo.Ages.lookup(Game.age)?.AgeType ?? "AGE_ANTIQUITY";
    const player = playerContext();
    const key = [age, player.civ, Game.turn, [...player.uniqueQuarterTypes].join(",")].join("|");
    if (cache && cache.key === key) return cache;
    const started = Date.now();
    const book = buildRuleBook(GameInfo, age, activationCheck(), player);
    cache = {
        ...book,
        key,
        civ: player.civ,
        minSpacing: globalNumber("CITY_MIN_RANGE", 3),
        appealCharming: globalNumber("APPEAL_FOR_HAPPINESS_TILE_YIELD", 3),
        appealBreathtaking: globalNumber("APPEAL_FOR_DOUBLE_HAPPINESS_TILE_YIELD", 5),
        oceanWorkable: age !== "AGE_ANTIQUITY",
    };
    if (book.ruleErrors.size > 0) log.debug(`skipped ${book.ruleErrors.size} adjacency rules`, [...book.ruleErrors.entries()].slice(0, 10));
    log.info(`rules loaded for ${age} / ${player.civ}: ${book.buildings.length} common buildings, ${book.uniques.length} uniques, ${book.uniqueQuarters.length} unique quarters, ${book.warehouses.length} warehouses, CITY_MIN_RANGE=${cache.minSpacing} (${Date.now() - started} ms)`);
    return cache;
}

/** Forget cached rules (e.g. after a tech/civic unlocks an adjacency). */
export function resetRules() {
    cache = null;
}
