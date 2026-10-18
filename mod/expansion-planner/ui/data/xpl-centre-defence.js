/**
 * A settlement centre's defence this age (research/37 §2). Every centre of ours defends at the full Combat strength of the
 * strongest melee land unit (infantry or cavalry) we trained, bought or (very likely) upgraded in the current age, 20 while
 * there is none, in every centre at once from the turn it is finished. Game 29's and game 28's CombatLog: DefStr matched
 * that unit's own Combat in 262 of 309 centre-defence rows (the Civilopedia's "minus 10" is not in the log). Carried-over
 * units do not count: the age change rebuilds every unit as the new age's first unit of its class, with a new id. Game
 * 29's Modern centres stood at 20 for 35 turns while carried Line Infantry stood around, and Ollantaytambo fell at M6 to one
 * independent Line Infantry (80, then 78 damage).
 *
 * The strongest one obtained is kept in the settings' memory of this game (root gotcha 57) with its age and turn: the save's
 * properties do not outlive an age change, and unit ids do not either.
 */
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
const currentAge = () => safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null);

/** A centre's defence while no melee unit was obtained this age. */
export const CENTRE_BASE = 20;
const MEMORY = "melee"; // the settings' game memory: "<AgeType>|<turn>|<strength>|<UnitType>"

/**
 * A unit's melee strength (GameInfo.Unit_Stats Combat), 0 unless it is a land combat unit with no ranged or bombard
 * attack: the units a centre's defence follows. Seen in game 5: only ranged units were trained after Antiquity (the
 * highest Tier was a Xunleichong, then a Mortar), so our centres defended at 20-30 against Line Infantry at 50.
 */
export function meleeStrength(def) {
    if (!def || def.CoreClass !== "CORE_CLASS_MILITARY" || def.Domain === "DOMAIN_SEA" || def.Domain === "DOMAIN_AIR") return 0;
    if (def.FormationClass && def.FormationClass !== "FORMATION_CLASS_LAND_COMBAT") return 0;
    const s = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
    if (!s || Number(s.RangedCombat) > 0 || Number(s.Bombard) > 0) return 0;
    return Number(s.Combat) || 0;
}

/**
 * The strongest melee unit we obtained this age: { strength, unit, turn }, or null (none: every centre defends at 20).
 * Another age's memory, or one from a later turn (an earlier save of this age was loaded), is none.
 */
export function meleeThisAge() {
    const raw = settings.recall(gameKey(), MEMORY);
    if (typeof raw !== "string") return null;
    const [age, turn, strength, unit] = raw.split("|");
    const t = Number(turn);
    const s = Number(strength);
    if (age !== currentAge() || !Number.isFinite(t) || t > Number(safe(() => Game.turn, 0)) || !(s > 0)) return null;
    return { strength: s, unit: unit ?? "?", turn: t };
}

/** What our centres defend at now: this age's strongest melee unit obtained, else CENTRE_BASE. */
export const centreDefence = () => Math.max(CENTRE_BASE, meleeThisAge()?.strength ?? 0);

/**
 * A melee unit we obtained (`how`: trained, bought, upgraded): the strongest of the age is remembered and becomes every
 * centre's defence. UI.log says so for each one (probe P-DEF-1; an upgrade is probe P-DEF-3: the CombatLog will tell
 * whether it counts). @returns true when it raised the centres' defence
 */
export function noteMeleeObtained(def, how, where = "") {
    const s = meleeStrength(def);
    if (!(s > 0)) return false;
    const before = meleeThisAge();
    const age = currentAge();
    const raise = !!age && (!before || s > before.strength);
    if (raise) settings.remember(gameKey(), { [MEMORY]: `${age}|${Game.turn}|${s}|${def.UnitType}` });
    const at = where ? ` in ${where}` : "";
    const probe = how === "upgraded" ? " (probe P-DEF-3: does an upgrade count?)" : "";
    log.info(`melee: ${def.UnitType} ${how}${at} (${age ?? "?"}, strength ${s})${raise ? `: obtained this age, centres defend at ${s}` : `; this age's best ${before?.strength ?? "?"} (${before?.unit ?? "?"})`}${probe}`);
    return raise;
}

// Units our cities finish (the game's CityProductionCompleted, as its tutorial reads it: productionKind UNIT and the unit
// type in productionItem). The player's own training counts too: this listens whether the autopilot is on or not.
try {
    engine.on("CityProductionCompleted", (d) => {
        const UNIT = globalThis.ProductionKind?.UNIT;
        if (UNIT === undefined || d?.productionKind !== UNIT) return;
        const city = safe(() => Cities.get(d.cityID), null);
        if ((city?.owner ?? d?.cityID?.owner) !== pid()) return;
        const def = safe(() => GameInfo.Units.lookup(d.productionItem), null);
        if (def) noteMeleeObtained(def, "trained", safe(() => Locale.compose(city.name), ""));
    });
} catch (_e) {
    // No engine events here.
}
