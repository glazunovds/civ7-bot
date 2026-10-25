/**
 * Our quarter yields per plan settlement (core/xpl-quarter-yields.js; adjacency F8, game 60). Engine adapter: every engine call
 * wrapped in safe(). Sources: our civilization's and leader's traits (TraitModifiers), the cards slotted (TraditionModifiers
 * of Culture.getActiveTraditions, as model-policies.js reads them) and our pantheons (BeliefModifiers of
 * Religion.getPantheons, as panel-pantheon-complete.js reads them).
 */
import { quarterModifiers, quarterSignature, quarterYieldsFor } from '../core/xpl-quarter-yields.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;

/** The modifier ids of our traits, slotted cards and pantheons. */
function sourceIds() {
    const ids = [];
    const player = safe(() => Players.get(pid()), null);
    if (!player) return ids;
    const civ = safe(() => GameInfo.Civilizations.lookup(player.civilizationType)?.CivilizationType, null);
    const leader = safe(() => GameInfo.Leaders.lookup(player.leaderType)?.LeaderType, null);
    const traits = new Set();
    for (const r of GameInfo.CivilizationTraits ?? []) if (civ && r.CivilizationType === civ) traits.add(r.TraitType);
    for (const r of GameInfo.LeaderTraits ?? []) if (leader && r.LeaderType === leader) traits.add(r.TraitType);
    for (const r of GameInfo.TraitModifiers ?? []) if (traits.has(r.TraitType)) ids.push(r.ModifierId ?? r.ModifierID);
    const T = globalThis.CultureSlotTypes;
    const cards = new Set();
    for (const slot of [T?.TRADITION_CULTURE_SLOT, T?.POLICY_CULTURE_SLOT]) {
        if (slot === undefined) continue;
        for (const h of safe(() => player.Culture.getActiveTraditions(slot), []) ?? []) {
            const type = safe(() => GameInfo.Traditions.lookup(h)?.TraditionType, null);
            if (type) cards.add(type);
        }
    }
    for (const r of GameInfo.TraditionModifiers ?? []) if (cards.has(r.TraditionType)) ids.push(r.ModifierId ?? r.ModifierID);
    const beliefs = new Set();
    for (const h of safe(() => player.Religion.getPantheons(), []) ?? []) {
        const type = safe(() => GameInfo.Beliefs.lookup(h)?.BeliefType, null);
        if (type) beliefs.add(type);
    }
    for (const r of GameInfo.BeliefModifiers ?? []) if (beliefs.has(r.BeliefType)) ids.push(r.ModifierID ?? r.ModifierId);
    return ids.filter(Boolean);
}

/**
 * Each plan settlement's quarter yields: `members` the building job's ({ key, x, y, city }), `roleOf(key)` "CITY" | "TOWN".
 * @returns { bySid: Map(key -> [F, P, G, S, C, H, I]), signature } (a settlement with none left out)
 */
export function quarterYieldsByMember(members, roleOf) {
    const mods = quarterModifiers(sourceIds(), GameInfo);
    const bySid = new Map();
    if (mods.length === 0) return { bySid, signature: "" };
    for (const m of members ?? []) {
        const role = roleOf(m.key);
        const facts = {
            city: role === "CITY",
            town: role === "TOWN",
            capital: !!safe(() => m.city?.isCapital, false),
            biome: safe(() => GameInfo.Biomes.lookup(GameplayMap.getBiomeType(m.x, m.y))?.BiomeType, null),
            has: (type) => !!safe(() => m.city?.Constructibles.hasConstructible(type, false), false),
        };
        const yields = quarterYieldsFor(mods, facts);
        if (yields.some((v) => v !== 0)) bySid.set(m.key, yields);
    }
    return { bySid, signature: quarterSignature(mods) };
}
