/**
 * Yields our modifiers give every quarter (adjacency F8, game 60). Pure: the game's tables come in as `info`.
 *
 * Russia's ability (TRAIT_RUSSIA_ABILITY → PROSVESHCHENIE_CITY_YIELDS, EFFECT_ATTACH_MODIFIERS) gives +1 Culture on every
 * quarter of a city (PROSVESHCHENIE_CITY_CULTURE: EFFECT_PLOT_ADJUST_YIELD, subject REQUIREMENT_PLOT_IS_QUARTER, owner
 * REQUIREMENT_CITY_IS_CITY) and +1 Science in a tundra city; pantheons (ATTACH_PANTHEON_URBAN_CULTURE / _SCIENCE: a city with
 * an Altar) and cards do the same. The plan valued a quarter only through adjacency rules, so these yields were invisible.
 *
 * A modifier counts here only when every requirement on its way is one we can judge for a settlement (KNOWN); any other
 * leaves it out (a tile-level biome, an ANY set, a player test we do not read).
 */
import { YIELD_KEYS } from './xpl-yields.js';

const QUARTER = "REQUIREMENT_PLOT_IS_QUARTER";
const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";

/**
 * The requirements we judge for a settlement: `facts` { city, town, capital, biome (its centre's), has(buildingType) }.
 * A test of the owner only where it says so (a biome on the subject would be the tile's).
 */
const KNOWN = {
    [QUARTER]: () => true, // the tile valued is a quarter
    REQUIREMENT_CITY_IS_CITY: (f) => !!f.city,
    REQUIREMENT_CITY_IS_TOWN: (f) => !!f.town,
    REQUIREMENT_CITY_IS_CAPITAL: (f) => !!f.capital,
    REQUIREMENT_CITY_HAS_BUILDING: (f, a) => !!a.BuildingType && !!f.has?.(a.BuildingType),
    REQUIREMENT_PLAYER_HAS_PANTHEON: () => true, // the source is our own pantheon
    REQUIREMENT_PLOT_BIOME_TYPE_MATCHES: (f, a) => !!a.BiomeType && f.biome === a.BiomeType,
};
/** Can we judge this test for a settlement (a biome only on the owner: the city's centre)? */
const judgeable = (t) => t.type in KNOWN && (t.type !== "REQUIREMENT_PLOT_BIOME_TYPE_MATCHES" || t.owner);

const rows = (t) => (t ? Array.from(t) : []);

const indexes = new WeakMap(); // info.Modifiers -> its index (the game's tables do not change within a session)

/** The game's tables indexed once: modifiers, their effects and arguments, requirement sets. */
function index(info) {
    const key = info.Modifiers && typeof info.Modifiers === "object" ? info.Modifiers : null;
    if (key && indexes.has(key)) return indexes.get(key);
    const effect = new Map(rows(info.DynamicModifiers).map((d) => [d.ModifierType, d.EffectType]));
    const mods = new Map(rows(info.Modifiers).map((m) => [m.ModifierId, m]));
    const args = new Map();
    for (const a of rows(info.ModifierArguments)) {
        if (!args.has(a.ModifierId)) args.set(a.ModifierId, {});
        args.get(a.ModifierId)[a.Name] = a.Value;
    }
    const setType = new Map(rows(info.RequirementSets).map((s) => [s.RequirementSetId, s.RequirementSetType]));
    const inSet = new Map();
    for (const r of rows(info.RequirementSetRequirements)) {
        if (!inSet.has(r.RequirementSetId)) inSet.set(r.RequirementSetId, []);
        inSet.get(r.RequirementSetId).push(r.RequirementId);
    }
    const reqs = new Map(rows(info.Requirements).map((r) => [r.RequirementId, r]));
    const reqArgs = new Map();
    for (const a of rows(info.RequirementArguments)) {
        if (!reqArgs.has(a.RequirementId)) reqArgs.set(a.RequirementId, {});
        reqArgs.get(a.RequirementId)[a.Name] = a.Value;
    }
    const ix = { effect, mods, args, setType, inSet, reqs, reqArgs };
    if (key) indexes.set(key, ix);
    return ix;
}

/** A requirement set as tests ({ type, args, inverse, owner }), or null when it is not an ALL set. */
function setTests(ix, setId, owner) {
    if (!setId) return [];
    const type = ix.setType.get(setId) ?? "REQUIREMENTSET_TEST_ALL";
    if (type !== "REQUIREMENTSET_TEST_ALL") return null;
    return (ix.inSet.get(setId) ?? []).map((id) => {
        const r = ix.reqs.get(id);
        return { type: r?.RequirementType ?? "?", args: ix.reqArgs.get(id) ?? {}, inverse: truthy(r?.Inverse), owner };
    });
}

/**
 * Our quarter yield modifiers among these sources (trait, card and pantheon modifier ids), attached ones followed
 * (EFFECT_ATTACH_MODIFIERS, as core/xpl-effect-value.js's callers do). @returns [{ id, yields: [F, P, G, S, C, H, I], tests }]
 * (the tests: every requirement on the way, the quarter's own included), none we cannot judge
 */
export function quarterModifiers(sourceIds, info) {
    if (!info || !(sourceIds?.length > 0)) return [];
    const ix = index(info);
    const out = [];
    const walk = (id, carried, depth) => {
        const m = ix.mods.get(id);
        if (!m || depth > 3) return;
        const subject = setTests(ix, m.SubjectRequirementSetId, false);
        const owner = setTests(ix, m.OwnerRequirementSetId, true);
        if (subject === null || owner === null) return;
        const tests = [...carried, ...subject, ...owner];
        const effect = ix.effect.get(m.ModifierType);
        const a = ix.args.get(id) ?? {};
        if (effect === "EFFECT_ATTACH_MODIFIERS") {
            for (const child of String(a.ModifierId ?? "").split(",").map((x) => x.trim()).filter(Boolean)) walk(child, tests, depth + 1);
            return;
        }
        if (effect !== "EFFECT_PLOT_ADJUST_YIELD" || !subject.some((t) => t.type === QUARTER)) return;
        const j = YIELD_KEYS.indexOf(a.YieldType);
        const amount = Number(a.Amount);
        if (j < 0 || !Number.isFinite(amount) || amount === 0) return;
        if (!tests.every(judgeable)) return;
        const yields = [0, 0, 0, 0, 0, 0, 0];
        yields[j] = amount;
        out.push({ id, yields, tests });
    };
    for (const id of sourceIds ?? []) walk(id, [], 0);
    return out;
}

/** What these modifiers give each quarter of one settlement (`facts`: KNOWN's). @returns [F, P, G, S, C, H, I] */
export function quarterYieldsFor(mods, facts) {
    const out = [0, 0, 0, 0, 0, 0, 0];
    for (const m of mods ?? []) {
        if (!m.tests.every((t) => !!KNOWN[t.type](facts ?? {}, t.args) !== t.inverse)) continue;
        for (let i = 0; i < out.length; i++) out[i] += m.yields[i];
    }
    return out;
}

/** The modifiers and their yields as one string (the plan's inputs: a new card or pantheon is another plan). */
export const quarterSignature = (mods) => (mods ?? []).map((m) => `${m.id}:${m.yields.join(".")}`).sort().join(",");
