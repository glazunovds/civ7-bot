/**
 * What a building is worth beyond its own yields and adjacency, for the building plan (research/game60, mechanics M1, M4,
 * M8). Engine adapter: every read goes through `safe`.
 *  - The pantheon acts only through the Altar ("… in Settlements with an Altar", "on the Altar"): game 60 founded God of
 *    Revelry at T77 and had one Altar in seven settlements at T140 (Saratov's, bought by the revolt guard), while the plan
 *    valued the Altar by its own +3 Happiness. Each settlement's Altar is worth that pantheon's yields there
 *    (core/xpl-religion.js PANTHEON_YIELDS on the settlement's own tiles).
 *  - A great-work slot is worth the works waiting in the archive for it: game 60 kept 3 codices archived with no Library all
 *    Antiquity (every AI built 9-20 Libraries or Academies), and 10 relics waited up to ~37 turns in Exploration; the relic
 *    triumph ended 19/20.
 */
import { PANTHEON_YIELDS, PATH_WORK_YIELD, RELIC, weigh } from '../core/xpl-religion.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;
export const ALTAR = "BUILDING_ALTAR";
const ANY_SLOT = "GREATWORKSLOT_ANY";

/**
 * One settlement's tiles as religion counts them: farms (farms, pastures, plantations), camps (camps, woodcutters), fishing
 * boats, mines (mines, clay pits, quarries), resource tiles, quarters (2+ buildings), and whether a natural wonder is there.
 */
export function settlementTiles(city) {
    const out = { farms: 0, camps: 0, fishing: 0, mines: 0, resources: 0, quarters: 0, naturalWonder: false };
    for (const idx of safe(() => city.getPurchasedPlots(), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        if (!loc) continue;
        if (Number(safe(() => GameplayMap.getResourceType(loc.x, loc.y), -1)) >= 0) out.resources++;
        if (safe(() => GameplayMap.isNaturalWonder(loc.x, loc.y), false)) out.naturalWonder = true;
        let buildings = 0;
        for (const id of safe(() => MapConstructibles.getHiddenFilteredConstructibles(loc.x, loc.y), []) ?? []) {
            const c = safe(() => Constructibles.getByComponentID(id), null);
            const def = c ? safe(() => GameInfo.Constructibles.lookup(c.type), null) : null;
            const t = def?.ConstructibleType ?? "";
            if (def?.ConstructibleClass === "BUILDING") buildings++;
            else if (/^IMPROVEMENT_(FARM|TERRACE_FARM|PASTURE|PLANTATION)/.test(t)) out.farms++;
            else if (/^IMPROVEMENT_(CAMP|WOODCUTTER)/.test(t)) out.camps++;
            else if (/FISHING_BOAT/.test(t)) out.fishing++;
            else if (/^IMPROVEMENT_(MINE|CLAY_PIT|QUARRY)/.test(t)) out.mines++;
        }
        if (buildings >= 2) out.quarters++;
    }
    return out;
}

/** Our pantheon's BeliefType (player.Religion.getPantheons(), as the pantheon-complete panel reads it), or null. */
export function ourPantheonType() {
    const list = safe(() => Players.get(pid()).Religion.getPantheons(), []) ?? [];
    for (const p of list) {
        const type = safe(() => GameInfo.Beliefs.lookup(p)?.BeliefType, null);
        if (type) return type;
    }
    return null;
}

/**
 * What the Altar of this settlement brings through our pantheon a turn, weighed (0 without a pantheon or for one we do not
 * know): the pantheon's yields on this settlement alone (its production for a city's share, its food, its tiles; the
 * capital's Influence for the Trickster God).
 */
export function altarPantheonValue(city, weights, { pantheon = ourPantheonType(), focus = null } = {}) {
    const fn = pantheon ? PANTHEON_YIELDS[pantheon] : null;
    if (!fn || !city) return 0;
    const t = settlementTiles(city);
    const net = (y) => Number(safe(() => city.Yields.getNetYield(YieldTypes[y]), 0)) || 0;
    const capital = !!safe(() => city.isCapital, false);
    const facts = {
        settlements: 1,
        production: city.isTown ? 0 : net("YIELD_PRODUCTION"),
        food: Math.max(0, net("YIELD_FOOD")),
        influence: capital ? Number(safe(() => Players.get(pid()).Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY), 0)) || 0 : 0,
        farms: t.farms, camps: t.camps, fishing: t.fishing, mines: t.mines, resources: t.resources, quarters: t.quarters,
        focus,
    };
    return Math.max(0, weigh(fn(facts), weights));
}

/** The works in our archive: [{ type, objectType, yields: { YIELD_X: n } }]. */
function archivedWorks() {
    const culture = safe(() => Players.get(pid()).Culture, null);
    const count = Number(safe(() => culture.getNumWorksInArchive(), 0)) || 0;
    const out = [];
    for (let i = 0; i < count; i++) {
        const index = safe(() => culture.getArchivedGreatWork(i), -1);
        const def = index === null || index < 0 ? null : safe(() => GameInfo.GreatWorks.lookup(Game.Culture.getGreatWorkType(index)), null);
        if (!def) continue;
        const yields = {};
        for (const r of GameInfo.GreatWork_YieldChanges?.filter((y) => y.GreatWorkType === def.GreatWorkType) ?? []) {
            yields[r.YieldType] = (yields[r.YieldType] ?? 0) + (Number(r.YieldChange) || 0);
        }
        // A relic without the table (the test fixtures): its yields as the game gives them (greatworks.xml: +2 Culture +2 Happiness).
        if (Object.keys(yields).length === 0 && def.GreatWorkObjectType === "GREATWORKOBJECT_RELIC") Object.assign(yields, RELIC);
        out.push({ type: def.GreatWorkType, objectType: def.GreatWorkObjectType, yields });
    }
    return out;
}

/** Can a work of this object type stand in a slot of this type (GreatWork_ValidSubTypes; the ANY slot takes all)? */
function fits(slotType, objectType) {
    if (slotType === ANY_SLOT) return true;
    const rows = GameInfo.GreatWork_ValidSubTypes?.filter((r) => r.GreatWorkSlotType === slotType) ?? [];
    if (rows.length === 0) return slotType.replace("GREATWORKSLOT_", "") === objectType.replace("GREATWORKOBJECT_", "");
    return rows.some((r) => r.GreatWorkObjectType === objectType);
}

/** Each building type's great-work slots (Constructible_GreatWorks): Map(type -> [{ slotType, slots }]). */
function slotRows() {
    const out = new Map();
    for (const r of GameInfo.Constructible_GreatWorks ?? []) {
        if (!out.has(r.ConstructibleType)) out.set(r.ConstructibleType, []);
        out.get(r.ConstructibleType).push({ slotType: r.GreatWorkSlotType, slots: Number(r.NumSlots) || 1 });
    }
    return out;
}

/**
 * Empty slots in our buildings, by slot type (the building's Constructible_GreatWorks rows, its empty slots). A building with
 * no row in this age takes nothing: the rows load by age (Antiquity's Library and Academy writing slots are in
 * age-antiquity's greatworks.xml only), and the slots the game lists carry no type. A damaged one takes nothing either, as
 * slotGreatWorks leaves it out.
 */
function freeSlots(rows) {
    const free = new Map();
    for (const city of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        for (const b of safe(() => city.Constructibles.getGreatWorkBuildings(), []) ?? []) {
            const building = safe(() => Constructibles.getByComponentID(b.constructibleID), null);
            const type = building ? safe(() => GameInfo.Constructibles.lookup(building.type)?.ConstructibleType, null) : null;
            const empty = (b.slots ?? []).filter((s) => s.greatWorkIndex === undefined || s.greatWorkIndex === null || s.greatWorkIndex < 0).length;
            if (!type || empty <= 0 || !rows.has(type) || building.damaged) continue;
            const slotType = rows.get(type)[0].slotType;
            free.set(slotType, (free.get(slotType) ?? 0) + empty);
        }
    }
    return free;
}

/** The works waiting for a slot: the archive less what our empty slots take now (as slotGreatWorks places them). */
function waitingWorks(rows) {
    const works = archivedWorks();
    if (works.length === 0) return works;
    for (const [slotType, n] of freeSlots(rows)) {
        for (let k = 0; k < n; k++) {
            const i = works.findIndex((w) => fits(slotType, w.objectType));
            if (i < 0) break;
            works.splice(i, 1);
        }
    }
    return works;
}

/** A work's worth a turn on display: its yields, plus its victory path's points for that focus (core PATH_WORK_YIELD). */
function workValue(work, weights, focus) {
    const extra = PATH_WORK_YIELD[focus]?.[work.objectType] ?? null;
    const yields = extra ? { ...work.yields, [extra.yield]: (work.yields[extra.yield] ?? 0) + extra.amount } : work.yields;
    return weigh(yields, weights);
}

/**
 * What each building type's slots are worth now, a turn (research/game60 M8): its slots filled with the works waiting in the
 * archive that fit them, the most valuable first (each type on its own: the first one built takes them).
 * @returns Map(type -> value)
 */
export function greatWorkSlotValues(weights, focus = null) {
    const rows = slotRows();
    const out = new Map();
    if (rows.size === 0) return out;
    const waiting = waitingWorks(rows).map((w) => ({ ...w, value: workValue(w, weights, focus) })).sort((a, b) => b.value - a.value);
    if (waiting.length === 0) return out;
    for (const [type, slots] of rows) {
        const pool = [...waiting];
        let value = 0;
        for (const s of slots) {
            for (let k = 0; k < s.slots; k++) {
                const i = pool.findIndex((w) => fits(s.slotType, w.objectType));
                if (i < 0) break;
                value += pool[i].value;
                pool.splice(i, 1);
            }
        }
        if (value > 0) out.set(type, value);
    }
    return out;
}

/** Relics waiting for a slot (archived relics our empty slots cannot take): the culture path's Temple while > 0 (M1). */
export function relicsWaiting() {
    return waitingWorks(slotRows()).filter((w) => w.objectType === "GREATWORKOBJECT_RELIC").length;
}

/** The most works of this object type one building of this age can take (its slots that fit it). */
function mostSlotsFor(rows, objectType) {
    let most = 0;
    for (const slots of rows.values()) most = Math.max(most, slots.filter((s) => fits(s.slotType, objectType)).reduce((n, s) => n + s.slots, 0));
    return most;
}

/**
 * The works waiting for a slot by object type, for the plan's inputs ("GREATWORKOBJECT_RELIC:1,…"): a work our empty slots
 * take this pass changes no plan, nor one beyond what one building's slots take (greatWorkSlotValues values each building
 * type on its own: a Temple's one relic slot is worth as much with 6 relics waiting as with 1), so each count stops there.
 */
export function archiveSignature() {
    const rows = slotRows();
    const counts = new Map();
    for (const w of waitingWorks(rows)) counts.set(w.objectType, (counts.get(w.objectType) ?? 0) + 1);
    return [...counts].map(([k, n]) => [k, Math.min(n, mostSlotsFor(rows, k))]).filter(([, n]) => n > 0)
        .sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => `${k}:${n}`).join(",");
}
