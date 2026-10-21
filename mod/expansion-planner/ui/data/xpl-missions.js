/**
 * Our own settlements follow our religion (research/40 B1, notes/religion.md §5.3). Only the Holy City follows it by itself;
 * the founder beliefs that pay for our own followers (Chesed +4 Production, Feed the World +6 Food, the "+1 per own" halves),
 * the relic beliefs that pay for our own settlements (Akhlaq, Sukha) and the Distant Lands military points (doubled for a
 * follower) need Missionaries. Game 41: rivals converted 4 of our 5 settlements and trained 19 Missionaries; we trained none.
 * In the religious crisis an unhappy settlement following another civilization's religion may revolt and defect to its
 * founder, so those come first then.
 *
 * Game facts (age-exploration data): UNIT_MISSIONARY (SpreadCharges 3, 150 production, a Temple in the training city);
 * UNITOPERATION_SPREAD_RELIGION, untargeted, on the unit's own tile (unit-actions.js). A settlement that follows no religion
 * converts at once from inside its borders (1 charge); one following another needs it on an urban district and on a rural
 * tile (its urbanReligion and ruralReligion, 2 charges).
 */
import { followsOurReligion, ourReligion } from './xpl-player-facts.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;

export const MISSIONARY_CHARGES = 3;   // UNIT_MISSIONARY's SpreadCharges
export const MISSIONARIES_AT_ONCE = 2;
export const MISSION_MIN = 2;          // Missionaries are trained while at least this many of ours do not follow our religion
export const MISSION_LATE_TURNS = 8;   // ...and not in an age's last turns (trained, walked and spread before it ends)
export const SPREAD = "UNITOPERATION_SPREAD_RELIGION";

/** A crisis runs (its cards take crisis slots): the religious crisis's revolts then defect to a religion's founder. */
export function crisisNow() {
    return (Number(safe(() => Players.get(pid()).Culture.getNumCultureSlots(CultureSlotTypes.CRISIS_CULTURE_SLOT), 0)) || 0) > 0;
}

/** A unit that spreads a religion (UNIT_MISSIONARY and the unique ones: Kahuna, Pedanda). */
export function isMissionary(def) {
    return !!def && Number(def.SpreadCharges) > 0;
}

/** The crisis card that damages 3 buildings in every settlement of ours newly following our religion (research/40 A2). */
export function iusReformandiActive() {
    const def = safe(() => GameInfo.Traditions.lookup("TRADITION_IUS_REFORMANDI"), null);
    return !!def && !!safe(() => Players.get(pid()).Culture.isTraditionActive(def.$hash), false);
}

const same = (a, b) => a !== null && a !== -1 && b !== null && (safe(() => GameInfo.Religions.lookup(a)?.ReligionType, null) ?? a) === (safe(() => GameInfo.Religions.lookup(b)?.ReligionType, null) ?? b);

/** City-states we are suzerain of (player.isMinor, Influence.getSuzerain(), as the city banners read it). */
export function ourCityStatePlayers() {
    return (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMinor && safe(() => p.Influence.hasSuzerain, false) && safe(() => p.Influence.getSuzerain(), -1) === pid());
}

/**
 * Our settlements to convert, the most urgent first: in the religious crisis an unhappy one following another religion,
 * then those following none (1 charge), then the others (2); after all of ours, the city-states we are suzerain of
 * (research/40 C: no diplomatic cost found, and Icons' relics; `foreign`). @returns [{ city, charges, urban, rural, crisis,
 * foreign }] where `urban` / `rural` say which half still needs our religion
 */
export function conversionTargets({ crisis = crisisNow() } = {}) {
    const ours = ourReligion();
    if (ours === null) return [];
    const out = [];
    const cities = [
        ...(safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((city) => ({ city, foreign: false })),
        ...ourCityStatePlayers().flatMap((p) => (safe(() => p.Cities.getCities(), []) ?? []).map((city) => ({ city, foreign: true }))),
    ];
    for (const { city, foreign } of cities) {
        if (followsOurReligion(city)) continue;
        const urban = !same(safe(() => city.Religion.urbanReligion, -1), ours);
        const rural = !same(safe(() => city.Religion.ruralReligion, -1), ours);
        if (!urban && !rural) continue;
        const major = safe(() => city.Religion.majorityReligion, -1);
        const none = major === -1 || major === null;
        const unhappy = (Number(safe(() => city.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0) < 0 || !!safe(() => city.Happiness.hasUnrest, false);
        out.push({ city, charges: none ? 1 : (urban ? 1 : 0) + (rural ? 1 : 0), urban, rural, crisis: !foreign && crisis && !none && unhappy, none, foreign });
    }
    return out.sort((a, b) => Number(a.foreign) - Number(b.foreign) || Number(b.crisis) - Number(a.crisis) || Number(b.none) - Number(a.none));
}

/**
 * Missionaries wanted (core of the training want): the settlements to convert and the charges they take; none while Ius
 * Reformandi is slotted or before we have a religion. @returns { settlements, charges } or null
 */
export function missionNeed(opts = {}) {
    if (ourReligion() === null || iusReformandiActive()) return null;
    const targets = conversionTargets(opts).filter((t) => !t.foreign);
    if (targets.length === 0) return null;
    return { settlements: targets.length, charges: targets.reduce((n, t) => n + t.charges, 0) };
}
