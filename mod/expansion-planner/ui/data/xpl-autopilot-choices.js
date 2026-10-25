/**
 * Autopilot choices that are not about cities, the ones that hold the turn until made:
 * empty policy slots, celebration bonuses, story events, a pantheon, a government, a
 * city-state bonus, "seen it" screens. Each returns log entries { key, args } like the steps
 * in xpl-autopilot-steps.js; `makeChoices` runs them all in order.
 *
 * Values come from Leonardfactory's Policy Yield Previews when it is installed: its public
 * global `LfYieldsPreview` computes what a policy card (or a list of modifiers) would add per
 * turn for the local player (`previewPolicyYields({TraditionType})`,
 * `previewModifierByIds([id])` -> { yields: { YIELD_GOLD: n, ... }, isValid }). We weigh those
 * yields by the chosen priority. Without it (or for cards it cannot value) every card is
 * worth 0 and the first offered one fills the slot: a full slot beats an empty one.
 */
import { profileFor } from '../core/xpl-profiles.js';
import { dot, H, yieldIndex, YIELD_KEYS } from '../core/xpl-yields.js';
import { costMultiplier, happinessWorth } from '../core/xpl-scarcity.js';
import { judgeDeal } from '../core/xpl-deals.js';
import { log } from '../services/xpl-log.js';
import { effectYields, focusOfProfile, rankGovernments } from '../core/xpl-effect-value.js';
import { beliefValue, pantheonValue, rankByValue } from '../core/xpl-religion.js';
import { cardSwapGain, swapWorth } from '../core/xpl-research-value.js';
import { campaignState, endTrainingWar, generalsState, guardsFor, guardsWanted, huntedIndependent, peaceIntentFor, planTrainingWar, promoteUnits, readinessForWar, threatenedSettlements, trainingWarEnemy, warSupportNet } from './xpl-autopilot-units.js';
import { TRAINING, denounceAllowed, supportWanted, trainingTarget } from '../core/xpl-field-ops.js';
import { followsOurReligion, independentNameOf, villagesOf } from './xpl-player-facts.js';
import { settlementTiles } from './xpl-building-extras.js';
import { gameKey, settings } from '../services/xpl-settings.js';
import { state } from '../services/xpl-state.js';
import { ageOutlook } from './xpl-town-job.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

const pid = () => GameContext.localPlayerID;

/** Weighted value of a { YIELD_X: n } map. */
function valueOf(yields, weights) {
    const v = [0, 0, 0, 0, 0, 0, 0];
    for (const [k, n] of Object.entries(yields ?? {})) {
        const i = yieldIndex(k);
        if (i >= 0) v[i] += Number(n) || 0;
    }
    return dot(weights, v);
}

/**
 * The local player's notifications of one type (e.g. "NOTIFICATION_CHOOSE_GOVERNMENT"): the
 * game's own sign that a choice is waiting. The choice operations themselves are accepted
 * even when nothing is pending (seen in game: the same celebration and government sent
 * every turn), so choices that can repeat are made only while their notification is there.
 */
export function notificationsOf(typeName) {
    const out = [];
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? []) {
        const n = safe(() => Game.Notifications.find(id), null);
        if (n && safe(() => Game.Notifications.getTypeName(n.Type), null) === typeName) out.push(n);
    }
    return out;
}

const waiting = (typeName) => notificationsOf(typeName).length > 0;

// Independents threatening us that the game did not let us befriend in the last pass.
let blockedIndependents = [];
// Influence kept for befriending this pass (see befriendIndependents): a threatening independent's price while we save for
// it, any other's only on befriending's turn, Infinity once a befriending was sent this pass (the balance does not change
// within a pass). Endeavors, steals, reconciliation, reforms and incorporation spend only what lies above it (game 60, M6).
let befriendReserve = 0;
let befriendReserveTurn = -1; // the turn befriendIndependents set it (reserveNow)
// Befriending's turn: after an endeavor or a steal a befriending we save for keeps its price, after a befriending started
// the next endeavor or steal goes first (game 60: 2 endeavors and 0 steals in Antiquity, none in Exploration).
let befriendsNext = false;
// Leaders whose spy was caught against us (revealed), waiting for our counter-spy.
const caughtSpies = new Set();

// ---- effects Policy Yield Previews cannot value ------------------------------------------

let modifierIndex = null;

/**
 * GameInfo.Modifiers → DynamicModifiers (EffectType) and ModifierArguments, indexed once (again
 * when the tables change), the way Policy Yield Previews resolves them (its modifiers.js).
 */
function modifierTables() {
    const source = GameInfo.Modifiers;
    if (modifierIndex && modifierIndex.source === source) return modifierIndex;
    const type = new Map();
    for (const m of source ?? []) type.set(m.ModifierId, m.ModifierType);
    const effect = new Map();
    for (const d of GameInfo.DynamicModifiers ?? []) effect.set(d.ModifierType, d.EffectType);
    const args = new Map();
    for (const a of GameInfo.ModifierArguments ?? []) {
        if (!args.has(a.ModifierId)) args.set(a.ModifierId, {});
        args.get(a.ModifierId)[a.Name] = a.Value;
    }
    modifierIndex = { source, type, effect, args };
    return modifierIndex;
}

/** The effects of these modifiers, those they attach included (EFFECT_ATTACH_MODIFIERS: city-state bonuses). */
function effectsOf(modifierIds, depth = 0) {
    const t = modifierTables();
    const out = [];
    for (const id of modifierIds ?? []) {
        const effect = t.effect.get(t.type.get(id));
        if (!effect) continue;
        const args = t.args.get(id) ?? {};
        if (effect === "EFFECT_ATTACH_MODIFIERS" && depth < 3) out.push(...effectsOf(String(args.ModifierId ?? "").split(",").map((x) => x.trim()).filter(Boolean), depth + 1));
        else out.push({ effect, args });
    }
    return out;
}

/** A modifier's own effect type (GameInfo.Modifiers → DynamicModifiers), or null: what research unlocks (steps). */
export function modifierEffect(id) {
    const t = modifierTables();
    return t.effect.get(t.type.get(id)) ?? null;
}

/**
 * The victory class (VICTORY_CLASS_CULTURE, …) whose points a modifier switches on (EFFECT_PLAYER_ACTIVATE_VICTORY_POINT_TRACKER:
 * its TrackerName is a GameInfo.VictoryScorings ScoringId, whose VictoryType's Victories row has the class), or null.
 */
export function trackerClassOf(id) {
    const t = modifierTables();
    if (t.effect.get(t.type.get(id)) !== "EFFECT_PLAYER_ACTIVATE_VICTORY_POINT_TRACKER") return null;
    const tracker = t.args.get(id)?.TrackerName;
    const scoring = tracker ? GameInfo.VictoryScorings?.find((r) => r.ScoringId === tracker) : null;
    return scoring ? GameInfo.Victories?.lookup(scoring.VictoryType)?.VictoryClassType ?? null : null;
}

/**
 * This pass's numbers that the effects Policy Yield Previews cannot value scale with
 * (core/xpl-effect-value.js): the focus the priority serves, the age, the cities' production,
 * the empire's science, culture and gold per turn.
 */
function leverContext(settings) {
    const me = safe(() => Players.get(pid()), null);
    const net = (y) => Number(safe(() => me.Stats.getNetYield(YieldTypes[y]), 0)) || 0;
    let production = 0;
    for (const c of safe(() => me.Cities.getCities(), []) ?? []) {
        if (!c.isTown) production += Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    }
    let settlements = null;
    let generals = null;
    return {
        focus: focusOfProfile(settings?.profile),
        // The generals, read once a step when an effect asks (research/41 §4E).
        get generals() {
            generals ??= safe(() => generalsState(), null);
            return generals;
        },
        age: safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null),
        production, science: net("YIELD_SCIENCE"), culture: net("YIELD_CULTURE"), gold: net("YIELD_GOLD"),
        // Each settlement's Happiness facts, read once a step when a card needs them (localHappiness).
        get settlements() {
            settlements ??= settlementHappiness();
            return settlements;
        },
    };
}

/** What these modifiers' non-yield effects are worth per turn (0 without a context). */
function leverValue(modifierIds, weights, levers) {
    if (!levers || (modifierIds?.length ?? 0) === 0) return 0;
    return safe(() => valueOf(effectYields(effectsOf(modifierIds), levers), weights), 0);
}

// Policy Yield Previews' value plus the effects it cannot see; unknown stays unknown unless those count.
const withLevers = (value, extra) => (value === null ? (extra !== 0 ? extra : null) : value + extra);

let traitCache = null;

/**
 * What our civilization and leader gain or lose for every card slotted, by kind (their traits'
 * `EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION` modifiers): Ming loses 15 Science a turn for
 * each social policy slotted, its traditions not counted (`CivUnique` + `Invert`). Policy Yield
 * Previews values the card's own modifiers only, so the autopilot slotted policy after policy
 * (seen in game: Ming's science went below zero, 4 techs in 53 turns). Resolved once per
 * civilization and leader. @returns [{ yieldType, amount, civUnique, invert }]
 */
function perCardYields() {
    const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";
    return traitEffects()
        .filter((e) => e.effect === "EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION")
        .map((e) => ({ yieldType: e.args.YieldType, amount: Number(e.args.Amount) || 0, civUnique: truthy(e.args.CivUnique), invert: truthy(e.args.Invert) }));
}

/**
 * The effects of our civilization's and leader's trait modifiers (effectsOf), resolved once per civilization,
 * leader and set of tables. @returns [{ effect, args }]
 */
export function traitEffects() {
    const me = safe(() => Players.get(pid()), null);
    const civ = safe(() => GameInfo.Civilizations.lookup(me.civilizationType)?.CivilizationType, null);
    const leader = safe(() => GameInfo.Leaders.lookup(me.leaderType)?.LeaderType, null);
    const key = `${civ}|${leader}`;
    const tables = [GameInfo.Modifiers, GameInfo.TraitModifiers, GameInfo.CivilizationTraits, GameInfo.LeaderTraits];
    if (traitCache && traitCache.key === key && traitCache.tables.every((t, i) => t === tables[i])) return traitCache.list;
    const traits = new Set();
    for (const r of GameInfo.CivilizationTraits ?? []) if (civ && r.CivilizationType === civ) traits.add(r.TraitType);
    for (const r of GameInfo.LeaderTraits ?? []) if (leader && r.LeaderType === leader) traits.add(r.TraitType);
    const ids = [];
    for (const r of GameInfo.TraitModifiers ?? []) if (traits.has(r.TraitType)) ids.push(r.ModifierId ?? r.ModifierID);
    const list = safe(() => effectsOf(ids), []) ?? [];
    traitCache = { key, tables, list };
    return list;
}

/**
 * What slotting this card costs or brings through our traits (perCardYields): a civilization's
 * own traditions carry a TraitType, social policies none; crisis cards are not counted.
 */
function traitCardValue(def, weights) {
    if (!def || def.IsCrisis === true || def.IsCrisis === "true") return 0;
    const unique = !!def.TraitType;
    let v = 0;
    for (const t of perCardYields()) {
        const counts = !t.civUnique || (t.invert ? !unique : unique);
        if (counts && t.amount) v += valueOf({ [t.yieldType]: t.amount }, weights);
    }
    return v;
}

/**
 * What a policy card is worth per turn: Policy Yield Previews, plus (with `levers`, a
 * leverContext) what it cannot value (production toward projects or buildings, lump grants…:
 * Literature, Public Works, Think Tanks) and what its Happiness does to each settlement's other
 * yields below zero (localHappiness; `active`: the card is slotted, so its worth is what taking it
 * out would cost); null if unknown.
 */
export function cardValue(traditionType, weights, levers = null, { active = false } = {}) {
    const api = globalThis.LfYieldsPreview;
    if (!traditionType) return null;
    const r = api?.previewPolicyYields ? safe(() => api.previewPolicyYields({ TraditionType: traditionType }), null) : null;
    const value = r?.isValid && r.yields ? valueOf(r.yields, weights) : null;
    if (!levers) return value;
    const ids = (GameInfo.TraditionModifiers?.filter((m) => m.TraditionType === traditionType) ?? []).map((m) => m.ModifierId ?? m.ModifierID);
    const def = safe(() => GameInfo.Traditions.lookup(traditionType), null);
    const local = safe(() => localHappiness(ids, weights, levers.settlements, { active }), 0);
    return withLevers(value, leverValue(ids, weights, levers) + safe(() => traitCardValue(def, weights), 0) + local);
}

/** What a list of modifiers is worth per turn (Policy Yield Previews, plus with `levers` what it cannot value), or null if unknown. */
export function modifiersValue(modifierIds, weights, levers = null) {
    const api = globalThis.LfYieldsPreview;
    if (modifierIds.length === 0) return null;
    const r = api?.previewModifierByIds ? safe(() => api.previewModifierByIds(modifierIds), null) : null;
    const value = r?.isValid && r.yields ? valueOf(r.yields, weights) : null;
    return levers ? withLevers(value, leverValue(modifierIds, weights, levers)) : value;
}

// Who a card's per-settlement yield change applies to, by its modifier's subject requirements (each may be
// inverted); a requirement not listed here makes the target unknown.
const SETTLEMENT_TESTS = {
    REQUIREMENT_CITY_IS_TOWN: (c) => !!c.isTown,
    REQUIREMENT_CITY_IS_CITY: (c) => !c.isTown,
    REQUIREMENT_CITY_IS_CAPITAL: (c) => !!safe(() => c.isCapital, false),
    REQUIREMENT_CITY_IS_DISTANT_LANDS: (c) => !!safe(() => c.isDistantLands, false),
    // The religious crisis's cards (research/40 A2): Religious Tolerance +8 and Zeal −8 Happiness where a settlement does not
    // follow our religion, Liturgical Disputes −4 where it does (the requirement names the card owner's religion).
    REQUIREMENT_CITY_FOLLOWS_RELIGION: (c) => followsOurReligion(c),
};
const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";

/** The test a modifier's subject requirements make (all must hold), or null when one is unknown. */
function settlementTest(modifierId) {
    const setId = safe(() => GameInfo.Modifiers?.find((m) => m.ModifierId === modifierId)?.SubjectRequirementSetId, null);
    if (!setId) return () => true;
    const tests = [];
    for (const link of GameInfo.RequirementSetRequirements?.filter((r) => r.RequirementSetId === setId) ?? []) {
        const req = GameInfo.Requirements?.find((r) => r.RequirementId === link.RequirementId);
        const test = SETTLEMENT_TESTS[req?.RequirementType];
        if (!test) return null;
        tests.push(truthy(req.Inverse) ? (c) => !test(c) : test);
    }
    return (c) => tests.every((t) => t(c));
}

/**
 * A crisis card's Happiness losses weighed by each settlement's own Happiness (core/xpl-scarcity.js): a
 * settlement it would push below 0 counts ×2, one with plenty to spare less. Its modifiers
 * (EFFECT_CITY_ADJUST_YIELD, YIELD_HAPPINESS, a negative Amount) on the settlements their requirements
 * name (towns, cities, the capital). Research/22 A4: «Провинциальное презрение» (−6 Happiness in towns)
 * was valued −4.8 like a gold card and put a town at −1 into unrest; it revolted 5 turns later.
 * @returns { plain, weighted } values per turn (≤ 0), or null when nothing is known
 */
function happinessLoss(traditionType, weights) {
    const t = modifierTables();
    const w = weights[yieldIndex("YIELD_HAPPINESS")] ?? 0;
    const settlements = safe(() => Players.get(pid()).Cities.getCities(), []) ?? [];
    let plain = 0;
    let weighted = 0;
    let known = false;
    for (const m of GameInfo.TraditionModifiers?.filter((r) => r.TraditionType === traditionType) ?? []) {
        const id = m.ModifierId ?? m.ModifierID;
        if (t.effect.get(t.type.get(id)) !== "EFFECT_CITY_ADJUST_YIELD") continue;
        const args = t.args.get(id) ?? {};
        const loss = -Number(args.Amount);
        if (!(loss > 0) || !String(args.YieldType ?? "").split(",").map((s) => s.trim()).includes("YIELD_HAPPINESS")) continue;
        const applies = settlementTest(id);
        if (!applies) continue;
        known = true;
        for (const c of settlements.filter(applies)) {
            const net = Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), NaN));
            // Pushed below zero where the other yields are known: the game's penalty on them is priced by localHappiness,
            // so the happiness itself at full weight (core/xpl-scarcity.js costValue does the same).
            const priced = net - loss < 0 && Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), NaN)) > 0;
            plain -= w * loss;
            weighted -= w * loss * (priced ? 1 : costMultiplier(net, loss));
        }
    }
    return known ? { plain, weighted } : null;
}

// ---- a card's Happiness in each settlement (research/34 §1) ------------------------------------------

/** A per-yield array of the game's (by GameInfo.Yields index) → one yield of it (Happiness by default). */
function happinessIn(arr, yieldType = "YIELD_HAPPINESS") {
    const i = safe(() => GameInfo.Yields.lookup(yieldType).$index, null);
    return i === null ? 0 : Number(arr?.[i]) || 0;
}

/**
 * Each settlement's Happiness facts: its net yields (the base of the game's penalty below zero Happiness), its specialists
 * and the Happiness they cost now (the game's own maintenance numbers), and, read when a card needs it, what its
 * buildings cost in Happiness.
 */
function settlementHappiness() {
    const out = [];
    for (const city of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const nets = YIELD_KEYS.map((k) => Number(safe(() => city.Yields.getNetYield(YieldTypes[k]), NaN)));
        if (!Number.isFinite(nets[H])) continue;
        let specialists = 0;
        let specialistUpkeep = 0;
        let specialistFood = 0;
        for (const w of safe(() => city.Workers.GetAllPlacementInfo(), []) ?? []) {
            specialists += Number(w.NumWorkers) || 0;
            specialistUpkeep += happinessIn(w.CurrentMaintenance);
            specialistFood += happinessIn(w.CurrentMaintenance, "YIELD_FOOD");
        }
        let buildingUpkeep = null;
        out.push({
            city, nets, specialists, specialistUpkeep, specialistFood,
            get buildingUpkeep() {
                buildingUpkeep ??= buildingHappinessUpkeep(city);
                return buildingUpkeep;
            },
        });
    }
    return out;
}

/** The Happiness a settlement's buildings cost a turn (city.Constructibles.getMaintenance of each one on its tiles). */
function buildingHappinessUpkeep(city) {
    let total = 0;
    for (const idx of safe(() => city.getPurchasedPlots(), []) ?? []) {
        const loc = safe(() => GameplayMap.getLocationFromIndex(idx), null);
        for (const id of loc ? safe(() => MapConstructibles.getHiddenFilteredConstructibles(loc.x, loc.y), []) ?? [] : []) {
            const c = safe(() => Constructibles.getByComponentID(id), null);
            const def = c ? safe(() => GameInfo.Constructibles.lookup(c.type), null) : null;
            if (def?.ConstructibleClass !== "BUILDING") continue;
            total += happinessIn(safe(() => city.Constructibles.getMaintenance(def.ConstructibleType), null));
        }
    }
    return total;
}

/**
 * What these modifiers change of a settlement's Happiness a turn: flat Happiness (EFFECT_CITY_ADJUST_YIELD), Happiness
 * per specialist (…_WORKER_YIELD), the specialists' Happiness upkeep (…_WORKER_MAINTENANCE_EFFICIENCY: Amount more a
 * specialist, Percent less of it) and the buildings' (…_BUILDING_MAINTENANCE_EFFICIENCY with Happiness: that much less).
 * Only modifiers whose subject requirements we can read (settlementTest).
 */
function happinessChange(modifierIds, s) {
    const t = modifierTables();
    let change = 0;
    for (const id of modifierIds) {
        const effect = t.effect.get(t.type.get(id));
        const args = t.args.get(id) ?? {};
        const yields = String(args.YieldType ?? "").split(",").map((x) => x.trim());
        const happiness = yields.includes("YIELD_HAPPINESS");
        const amount = Number(args.Amount) || 0;
        const percent = Number(args.Percent) || 0;
        let d = 0;
        if (effect === "EFFECT_CITY_ADJUST_YIELD" && happiness && !percent) d = amount;
        else if (effect === "EFFECT_CITY_ADJUST_WORKER_YIELD" && happiness) d = amount * s.specialists;
        else if (effect === "EFFECT_CITY_ADJUST_WORKER_MAINTENANCE_EFFICIENCY" && happiness) d = amount ? -amount * s.specialists : (percent / 100) * s.specialistUpkeep;
        else if (effect === "EFFECT_CITY_ADJUST_BUILDING_MAINTENANCE_EFFICIENCY" && truthy(args.Happiness)) d = ((amount || percent) / 100) * s.buildingUpkeep;
        if (!d) continue;
        const applies = settlementTest(id);
        if (applies && applies(s.city)) change += d;
    }
    return change;
}

/**
 * What a card's Happiness is worth in the game's penalty on each settlement's other yields (core/xpl-scarcity.js
 * happinessWorth: 5% of them a point below zero, at most 80%), summed over our settlements; `active`: the card is
 * slotted, so its worth is what taking it out would cost. Policy Yield Previews counts the Happiness itself across the
 * empire, where happy towns hide unhappy cities. Research/34 §1: game 28 swapped Living Standards (23.2) for Social
 * Science (193.6) at M16, +3 Science but +1 Happiness upkeep a specialist, while the core cities stood below zero; their
 * production fell 187 → 110 and their science 260 → 182 the next turn.
 * Also the specialists' upkeep the previews get wrong: they take 2 a specialist as the base of a percent change (Free
 * Speech's −50%), the game's is the upkeep it reports (6 in the Modern age).
 */
function localHappiness(modifierIds, weights, settlements, { active = false } = {}) {
    if (!settlements || modifierIds.length === 0) return 0;
    const t = modifierTables();
    let v = 0;
    for (const s of settlements) {
        const d = happinessChange(modifierIds, s);
        if (d) v += active ? -happinessWorth(weights, s.nets, s.nets[H], -d) : happinessWorth(weights, s.nets, s.nets[H], d);
        // A percent change of the specialists' upkeep: what the previews counted (2 a specialist) against the game's own.
        for (const id of modifierIds) {
            if (t.effect.get(t.type.get(id)) !== "EFFECT_CITY_ADJUST_WORKER_MAINTENANCE_EFFICIENCY") continue;
            const args = t.args.get(id) ?? {};
            const percent = Number(args.Percent) || 0;
            if (!percent || Number(args.Amount)) continue;
            const applies = settlementTest(id);
            if (!applies || !applies(s.city)) continue;
            for (const y of String(args.YieldType ?? "").split(",").map((x) => x.trim())) {
                const upkeep = y === "YIELD_HAPPINESS" ? s.specialistUpkeep : y === "YIELD_FOOD" ? s.specialistFood : null;
                if (upkeep === null) continue;
                v += (weights[yieldIndex(y)] ?? 0) * (percent / 100) * (upkeep - 2 * s.specialists);
            }
        }
    }
    return v;
}

/** Free slots of one kind: slot type -> number free. */
function freeSlots(culture, slotType) {
    const total = Number(safe(() => culture.getNumCultureSlots(slotType), 0)) || 0;
    const active = safe(() => culture.getActiveTraditions(slotType), []) ?? [];
    return Math.max(0, total - active.length);
}

/** Cards of a slot type that are unlocked and not in use: [{ def, value }]. */
function offered(culture, slotType, weights, levers = null) {
    const out = [];
    // In a crisis slot every card is a penalty; one Policy Yield Previews cannot value (a combat or
    // other non-yield effect) counts as 0, not below every known penalty (probe P9, game 6: «Дань»
    // −11.5 gold went in while −6 strength against independents, with no attacks, would have cost nothing).
    const crisis = slotType !== undefined && slotType === globalThis.CultureSlotTypes?.CRISIS_CULTURE_SLOT;
    for (const h of safe(() => culture.getUnlockedTraditions(slotType), []) ?? []) {
        if (safe(() => culture.isTraditionActive(h), false)) continue;
        const def = safe(() => GameInfo.Traditions.lookup(h), null);
        if (!def) continue;
        let value = cardValue(def.TraditionType, weights, levers);
        // A crisis card's Happiness losses by each settlement's own Happiness (research/22 A4).
        const loss = crisis ? safe(() => happinessLoss(def.TraditionType, weights), null) : null;
        if (loss) value = value === null ? loss.weighted : value - loss.plain + loss.weighted;
        out.push({ def, value });
    }
    // Known values first, best first; unknown ones keep the game's order (crisis: unknown = 0).
    const key = (c) => c.value ?? (crisis ? 0 : -Infinity);
    out.sort((a, b) => key(b) - key(a));
    if (crisis && out.length > 0) log.info(`policy: crisis cards offered ${out.map((c) => `${c.def.TraditionType} ${c.value === null ? "?" : Math.round(c.value * 10) / 10}`).join(", ")}`);
    return out;
}

function activate(def) {
    const args = { TraditionType: def.$index, Action: globalThis.PlayerOperationParameters?.Activate };
    const ok = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHANGE_TRADITION, args, false), null);
    if (!ok?.Success) return false;
    Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHANGE_TRADITION, args);
    return true;
}

/**
 * Puts the best offered card into one empty slot (the game wants one change at a time;
 * the autopilot calls this again after a pause until it returns nothing).
 * Crisis slots too: there every card is a penalty, so the least bad one goes in.
 * A policy card may also take a free tradition slot once the policy slots are full.
 * `sent` (card hashes already requested in this pass) keeps a card the game has not slotted
 * yet from being requested twice.
 */
export function fillOnePolicySlot(settings, sent = new Set(), { forced = false } = {}) {
    const culture = safe(() => Players.get(pid()).Culture, null);
    const T = globalThis.CultureSlotTypes;
    if (!culture || !T) return [];
    const weights = profileFor(settings).y;
    const levers = leverContext(settings);
    const order = [T.CRISIS_CULTURE_SLOT, T.TRADITION_CULTURE_SLOT, T.POLICY_CULTURE_SLOT].filter((t) => t !== undefined);
    for (const slotType of order) {
        if (freeSlots(culture, slotType) <= 0) continue;
        let cards = offered(culture, slotType, weights, levers);
        if (slotType === T.TRADITION_CULTURE_SLOT && T.POLICY_CULTURE_SLOT !== undefined && freeSlots(culture, T.POLICY_CULTURE_SLOT) === 0) {
            cards = [...cards, ...offered(culture, T.POLICY_CULTURE_SLOT, weights, levers)].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
        }
        for (const c of cards) {
            if (sent.has(c.def.$hash)) continue;
            // An empty slot is worth 0: a card worth less stays out (crisis cards must go in) —
            // unless the empty slot holds the turn (`forced`): the least bad card goes in.
            const negative = slotType !== T.CRISIS_CULTURE_SLOT && c.value !== null && c.value < 0;
            if (negative && !forced) continue;
            if (activate(c.def)) {
                sent.add(c.def.$hash);
                const value = c.value === null ? "?" : (Math.round(c.value * 10) / 10).toFixed(1);
                return [{ key: negative ? "POLICY_FORCED" : "POLICY", args: [Locale.compose(c.def.Name), value] }];
            }
        }
    }
    return [];
}

/**
 * What a node's new policy cards would win over the cards slotted now (core cardSwapGain), for research (the user, game
 * 44: Reformation's Religious Orders and Rationalism came last). Each card is valued as the policy step values it
 * (cardValue: Policy Yield Previews previews a card not unlocked yet, as its civic tooltips show), the slotted ones as what
 * taking them out would cost; crisis cards and cards already unlocked are left out. Weights, levers and the slotted cards
 * are read once, at the first card. @returns (targets) → { gain, pairs: [{ card: { type, name, value, slot }, out }] } or null
 */
export function cardGains(settings) {
    let ctx = null;
    const values = new Map();
    const setup = () => {
        const culture = safe(() => Players.get(pid()).Culture, null);
        const T = globalThis.CultureSlotTypes;
        if (!culture || !T || !globalThis.LfYieldsPreview?.previewPolicyYields) return false;
        const weights = profileFor(settings).y;
        const levers = leverContext(settings);
        const slotted = [];
        const free = {};
        const unlocked = new Set();
        for (const [slot, t] of [["TRADITION", T.TRADITION_CULTURE_SLOT], ["POLICY", T.POLICY_CULTURE_SLOT]]) {
            if (t === undefined) continue;
            free[slot] = freeSlots(culture, t);
            for (const h of safe(() => culture.getUnlockedTraditions(t), []) ?? []) unlocked.add(h);
            for (const h of safe(() => culture.getActiveTraditions(t), []) ?? []) {
                const def = safe(() => GameInfo.Traditions.lookup(h), null);
                if (def) slotted.push({ type: def.TraditionType, name: def.Name, slot, value: cardValue(def.TraditionType, weights, levers, { active: true }) });
            }
        }
        return { weights, levers, slotted, free, unlocked };
    };
    return (targets) => {
        const defs = (targets ?? []).map((t) => safe(() => GameInfo.Traditions.lookup(t), null))
            .filter((d) => d && !truthy(d.IsCrisis) && d.CultureSlotType !== "CRISIS_CULTURE_SLOT");
        if (defs.length === 0) return null;
        ctx ??= setup();
        if (!ctx) return null;
        const cards = [];
        for (const def of defs) {
            if (ctx.unlocked.has(def.$hash)) continue;
            if (!values.has(def.TraditionType)) values.set(def.TraditionType, cardValue(def.TraditionType, ctx.weights, ctx.levers));
            const value = values.get(def.TraditionType);
            if (value !== null) cards.push({ type: def.TraditionType, name: def.Name, value, slot: def.CultureSlotType === "TRADITION_CULTURE_SLOT" ? "TRADITION" : "POLICY" });
        }
        return cards.length > 0 ? cardSwapGain(cards, ctx.slotted, ctx.free) : null;
    };
}

/**
 * When the game lets the player swap cards (Culture.canSwapCultureSlot, as the policies screen
 * asks; after a new civic or government) and no slot is free: the active card worth least
 * (Policy Yield Previews) is taken out when an unslotted card that may take its slot is worth
 * clearly more (SWAP_MIN_GAIN and SWAP_MIN_SHARE); the freed slot is then filled by
 * fillOnePolicySlot. Same request as the screen: CHANGE_TRADITION {TraditionType: $index, Action:
 * Deactivate}. Cards of unknown value stay; crisis slots are left alone. `sent` (cards requested
 * this pass) gets the card taken out, so it is not put back in the same pass.
 * Seen in game: «Демагогия» (+0) stayed active while «Порт наций» (+64 gold) waited.
 * Never into an empty slot: the game will not end the turn while a slot is empty and cards are
 * offered (NOTIFICATION_TRADITIONS_AVAILABLE; seen in game 6: Ming's policy slot left empty held the
 * turn, «seen it» did not release it), so a card is only swapped for a better one, even a negative one.
 */
export function swapOnePolicy(settings, sent = new Set()) {
    const culture = safe(() => Players.get(pid()).Culture, null);
    const T = globalThis.CultureSlotTypes;
    const Deactivate = globalThis.PlayerOperationParameters?.Deactivate;
    if (!culture || !T || Deactivate === undefined) return [];
    if (!safe(() => culture.canSwapCultureSlot(T.POLICY_CULTURE_SLOT), false)) return [];
    const kinds = [T.TRADITION_CULTURE_SLOT, T.POLICY_CULTURE_SLOT].filter((t) => t !== undefined);
    if (kinds.some((k) => freeSlots(culture, k) > 0)) return []; // empty slots are filled first
    const weights = profileFor(settings).y;
    const levers = leverContext(settings);
    let best = null;
    for (const slotType of kinds) {
        // A tradition slot also takes a policy card (fillOnePolicySlot); a policy slot only policies.
        const cards = slotType === T.TRADITION_CULTURE_SLOT ? [...offered(culture, slotType, weights, levers), ...offered(culture, T.POLICY_CULTURE_SLOT, weights, levers)] : offered(culture, slotType, weights, levers);
        const top = cards.filter((c) => c.value !== null && !sent.has(c.def.$hash)).sort((a, b) => b.value - a.value)[0];
        if (!top) continue;
        for (const h of safe(() => culture.getActiveTraditions(slotType), []) ?? []) {
            if (sent.has(h)) continue; // just put in
            const def = safe(() => GameInfo.Traditions.lookup(h), null);
            const value = def ? cardValue(def.TraditionType, weights, levers, { active: true }) : null;
            if (value === null) continue;
            const gain = top.value - value;
            if (!swapWorth(gain, value)) continue;
            if (!best || gain > best.gain) best = { out: def, outValue: value, into: top, gain };
        }
    }
    if (!best) return [];
    const args = { TraditionType: best.out.$index, Action: Deactivate };
    if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHANGE_TRADITION, args, false), null)?.Success) return [];
    Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHANGE_TRADITION, args);
    sent.add(best.out.$hash);
    const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);
    return [{ key: "POLICY_SWAP", args: [Locale.compose(best.out.Name), fmt(best.outValue), Locale.compose(best.into.def.Name), fmt(best.into.value)] }];
}

// The attribute tree of each victory focus (ties between equal nodes go there).
const ATTRIBUTE_OF_PROFILE = { CULTURE: "ATTRIBUTE_CULTURAL", SCIENCE: "ATTRIBUTE_SCIENTIFIC", GOLD: "ATTRIBUTE_ECONOMIC", GOLD_SCIENCE: "ATTRIBUTE_ECONOMIC", GROWTH_CULTURE: "ATTRIBUTE_CULTURAL", GROWTH_SCIENCE: "ATTRIBUTE_SCIENTIFIC", GROWTH_GOLD: "ATTRIBUTE_ECONOMIC" };

/**
 * Leader attribute nodes we may buy now («Характеристика лидера»; seen in game: 5 points never
 * spent): every attribute tree's nodes as the game's tree screen reads them
 * (Game.ProgressionTrees.getTree(player, Attributes.ProgressionTreeType).nodes, else
 * GameInfo.ProgressionTreeNodes of that tree), the game's own check deciding which one a point
 * (its tree's or a universal one) may buy (PlayerOperations canStart BUY_ATTRIBUTE_TREE_NODE),
 * each valued by what its first research unlocks: modifiers (Policy Yield Previews
 * previewModifierByIds) and policy cards (previewPolicyYields), weighed by the priority; null
 * when unknown. @returns [{ nodeType, def, attribute, value }]
 */
function attributeOptions(weights, levers = null) {
    const BUY = globalThis.PlayerOperationTypes?.BUY_ATTRIBUTE_TREE_NODE;
    if (BUY === undefined) return [];
    const out = [];
    for (const attr of GameInfo.Attributes ?? []) {
        if (!attr.ProgressionTreeType) continue;
        const fromTree = (safe(() => Game.ProgressionTrees.getTree(pid(), attr.ProgressionTreeType)?.nodes, []) ?? []).map((n) => n.nodeType);
        const nodes = fromTree.length > 0 ? fromTree : (GameInfo.ProgressionTreeNodes?.filter((d) => d.ProgressionTree === attr.ProgressionTreeType) ?? []).map((d) => d.$hash);
        for (const nodeType of nodes) {
            const def = safe(() => GameInfo.ProgressionTreeNodes.lookup(nodeType), null);
            if (!def || def.ProgressionTree !== attr.ProgressionTreeType) continue;
            if (!safe(() => Game.PlayerOperations.canStart(pid(), BUY, { ProgressionTreeNodeType: nodeType }, false), null)?.Success) continue;
            const unlocks = GameInfo.ProgressionTreeNodeUnlocks?.filter((r) => r.ProgressionTreeNodeType === def.ProgressionTreeNodeType && (Number(r.UnlockDepth) || 1) === 1) ?? [];
            const mods = unlocks.filter((r) => r.TargetKind === "KIND_MODIFIER").map((r) => r.TargetType);
            const cards = unlocks.filter((r) => r.TargetKind === "KIND_TRADITION").map((r) => r.TargetType);
            const parts = [mods.length > 0 ? modifiersValue(mods, weights, levers) : null, ...cards.map((c) => cardValue(c, weights, levers))].filter((v) => v !== null);
            out.push({ nodeType, def, attribute: attr, value: parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null });
        }
    }
    return out;
}

/**
 * Spends one leader attribute point on the node worth most now (attributeOptions); ties (and nodes
 * of unknown value) go to the victory focus's tree, then the game's order. Same request as the
 * attribute screen (model-attribute-trees.js buyAttributeTreeNode). `bought` keeps a node the game
 * has not confirmed yet from being requested twice. @returns log entries
 */
export function buyOneAttribute(settings, bought = new Set()) {
    const BUY = globalThis.PlayerOperationTypes?.BUY_ATTRIBUTE_TREE_NODE;
    if (BUY === undefined || !safe(() => Players.get(pid()).Identity, null)) return [];
    const weights = profileFor(settings).y;
    const preferred = ATTRIBUTE_OF_PROFILE[settings.profile] ?? null;
    const options = attributeOptions(weights, leverContext(settings)).filter((o) => !bought.has(o.nodeType));
    const rank = (o) => (o.value ?? -Infinity);
    options.sort((a, b) => rank(b) - rank(a) || (b.attribute.AttributeType === preferred ? 1 : 0) - (a.attribute.AttributeType === preferred ? 1 : 0));
    const pick = options[0];
    if (!pick) return [];
    Game.PlayerOperations.sendRequest(pid(), BUY, { ProgressionTreeNodeType: pick.nodeType });
    bought.add(pick.nodeType);
    const value = pick.value === null ? "?" : (Math.round(pick.value * 10) / 10).toFixed(1);
    return [{ key: "ATTRIBUTE_BOUGHT", args: [safe(() => Locale.compose(pick.attribute.Name), pick.attribute.AttributeType), pick.def.ProgressionTreeNodeType, value] }];
}

/**
 * When a celebration starts and its bonus must be chosen: the option worth most, lump grants
 * included (Elective Republic's +1000 Science, the governments' +200/+600/+1000 Gold), which
 * Policy Yield Previews cannot value (leverContext).
 */
export function chooseCelebration(settings) {
    if (!waiting("NOTIFICATION_CHOOSE_GOLDEN_AGE")) return [];
    const culture = safe(() => Players.get(pid()).Culture, null);
    const choices = safe(() => culture.getGoldenAgeChoices(), []) ?? [];
    if (choices.length === 0) return [];
    const weights = profileFor(settings).y;
    const levers = leverContext(settings);
    const options = choices.map((h) => {
        const def = safe(() => GameInfo.GoldenAges.lookup(h), null);
        const ids = def ? (GameInfo.GoldenAgeModifiers ?? []).filter((m) => m.GoldenAgeType === def.GoldenAgeType).map((m) => m.ModifierID ?? m.ModifierId) : [];
        return { def, value: def ? modifiersValue(ids, weights, levers) : null };
    }).filter((o) => o.def);
    options.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    for (const o of options) {
        const args = { GoldenAgeType: Database.makeHash(o.def.GoldenAgeType) };
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHOOSE_GOLDEN_AGE, args, false), null);
        if (!ok?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHOOSE_GOLDEN_AGE, args);
        log.info(`autopilot: celebration ${o.def.GoldenAgeType} (${o.value ?? "?"})`);
        return [{ key: "CELEBRATION", args: [Locale.compose(o.def.Name)] }];
    }
    return [];
}

// ---- story events ---------------------------------------------------------------------

/** Is one of our settlements in unrest or below 0 Happiness? */
function unhappySettlement() {
    return (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).some((c) => safe(() => c.Happiness.hasUnrest, false)
        || (Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_HAPPINESS), 0)) || 0) < 0);
}

/**
 * A pending narrative or discovery story: the option the game's own AI prefers
 * (NarrativeStory_Links.AIPriority) among the affordable ones, else one without negative
 * rewards, else the first; a story without options is closed. While a settlement is in unrest
 * or below 0 Happiness, an option that gives Happiness (NarrativeRewardIcons YIELD_HAPPINESS, not
 * negative) comes first (research/22 A4: a revolt story was answered with War Support instead of
 * Happiness in all settlements). Same choice rules and command as the game's narrative panel
 * (small-narrative-event-model.js).
 */
// What a story option's reward icons are worth beyond yields (research/23 S5): a great work (codices count for
// science), an attribute point, a unit, a tradition slot.
const STORY_ICON_VALUE = { GREATWORK: 1, ATTRIBUTE: 0.5, UNIT: 0.3, TRADITION_SLOT: 1, PROMOTION: 0.2 };

/** A story option's worth by its reward icons and the profile's yield weights; negative icons subtract. */
function storyValue(icons, weights) {
    let v = 0;
    for (const i of icons ?? []) {
        const type = String(i.RewardIconType ?? "");
        const sign = truthy(i.Negative) ? -1 : 1;
        if (type.startsWith("YIELD_")) {
            const y = yieldIndex(type);
            v += sign * (y >= 0 ? weights?.[y] ?? 0.5 : 0.5);
        } else {
            const k = Object.keys(STORY_ICON_VALUE).find((key) => type.startsWith(key));
            v += sign * (k ? STORY_ICON_VALUE[k] : 0);
        }
    }
    return v;
}

/**
 * A story option with no reward icons (crisis stories): its rewards' yields stand in for icons
 * (NarrativeStory_Rewards → NarrativeRewards.ModifierID → the modifiers' YieldType and Amount; a negative amount
 * is a negative icon). Research/24 W10: game 9's revolt took "+2 war support" over "+2 Happiness in every
 * settlement", both icon-less, because the first was first.
 */
function rewardIcons(storyType) {
    const rewards = new Set((GameInfo.NarrativeStory_Rewards?.filter((r) => r.NarrativeStoryType === storyType) ?? []).map((r) => r.NarrativeRewardType));
    if (rewards.size === 0) return [];
    const ids = (GameInfo.NarrativeRewards?.filter((r) => rewards.has(r.NarrativeRewardType)) ?? []).map((r) => r.ModifierID ?? r.ModifierId).filter(Boolean);
    const out = [];
    for (const e of safe(() => effectsOf(ids), []) ?? []) {
        const amount = Number(e.args?.Amount);
        if (!e.args?.YieldType || !Number.isFinite(amount) || amount === 0) continue;
        out.push({ NarrativeStoryType: storyType, RewardIconType: e.args.YieldType, Negative: amount < 0 });
    }
    return out;
}

// What a story option's rewards are worth by their modifiers (research/game60 M9: at A89 an attribute point, LEADER_CHAIN_1041B,
// lost to +25% production toward Ancient Walls, 1041C, whose YIELD_PRODUCTION icon counted a full production weight while the
// ATTRIBUTE icon counted 0.5): an attribute point at least this much, a quest's rewards (paid once it is done) at this share.
const STORY_ATTRIBUTE_MIN = 3;
const STORY_QUEST_SHARE = 0.5;
const STORY_TURNS_DEFAULT = 60; // turns a lasting reward counts when the age has no end on the clock

/** An attribute point now: the best node we could buy with it (attributeOptions), at least STORY_ATTRIBUTE_MIN. */
function attributePointWorth(weights, settings) {
    const best = Math.max(0, ...(safe(() => attributeOptions(weights, leverContext(settings ?? {})), []) ?? []).map((o) => Number(o.value) || 0));
    return Math.max(STORY_ATTRIBUTE_MIN, best);
}

/**
 * Production toward one constructible in our cities (EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION): its Percent of what that
 * constructible costs where it is queued or planned this age (our queues, the building plan's placements), over the age's
 * turns left, weighed as production.
 */
function constructibleProductionWorth(args, weights) {
    const def = args?.ConstructibleType ? safe(() => GameInfo.Constructibles.lookup(args.ConstructibleType), null) : null;
    const pct = Number(args?.Percent) || 0;
    if (!def || !(pct > 0)) return 0;
    const cities = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).filter((c) => !c.isTown);
    let queued = 0;
    let cost = 0;
    for (const c of cities) {
        const each = Number(safe(() => c.Production.getConstructibleProductionCost(def.ConstructibleType), 0)) || Number(def.Cost) || 0;
        cost = Math.max(cost, each);
        if ((safe(() => c.BuildQueue.getQueue(), []) ?? []).some((q) => q?.constructibleType === def.$hash)) queued++;
    }
    const planned = (safe(() => state.get().results.plans?.placements, []) ?? []).filter((p) => p.type === def.ConstructibleType).length;
    const left = Number(safe(() => ageOutlook().turnsLeft, NaN));
    const turns = Number.isFinite(left) && left > 0 ? left : STORY_TURNS_DEFAULT;
    return (pct / 100) * Math.max(queued, planned) * (cost || Number(def.Cost) || 0) / turns * (weights?.[yieldIndex("YIELD_PRODUCTION")] ?? 1);
}

/**
 * A story option's worth by its rewards' modifiers (NarrativeStory_Rewards → NarrativeRewards → effectsOf): an attribute
 * point (attributePointWorth), production toward a constructible (constructibleProductionWorth); the icons the rest stands for
 * (yields, great works, units…) as icons. Null when no reward is one of these two: the icons alone then. A quest's share is
 * chooseStory's (questShare), on whichever value it takes.
 */
function storyRewardValue(to, icons, weights, settings) {
    const rewards = new Set((GameInfo.NarrativeStory_Rewards?.filter((r) => r.NarrativeStoryType === to.NarrativeStoryType) ?? []).map((r) => r.NarrativeRewardType));
    if (rewards.size === 0) return null;
    const ids = (GameInfo.NarrativeRewards?.filter((r) => rewards.has(r.NarrativeRewardType)) ?? []).map((r) => r.ModifierID ?? r.ModifierId).filter(Boolean);
    let value = 0;
    let attribute = false;
    let production = false;
    for (const e of safe(() => effectsOf(ids), []) ?? []) {
        if (e.effect === "EFFECT_PLAYER_ATTRIBUTE") {
            value += attributePointWorth(weights, settings) * (Number(e.args?.Amount) || 1);
            attribute = true;
        } else if (e.effect === "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION") {
            value += constructibleProductionWorth(e.args, weights);
            production = true;
        }
    }
    if (!attribute && !production) return null;
    const rest = (icons ?? []).filter((i) => {
        const t = String(i.RewardIconType ?? "");
        return !(attribute && t.startsWith("ATTRIBUTE")) && !(production && t === "YIELD_PRODUCTION");
    });
    return value + storyValue(rest, weights);
}

/** A quest's rewards come once it is done: its option counts at STORY_QUEST_SHARE, by its modifiers or by its icons alike. */
function questShare(to) {
    return to.IsQuest === true || /^(true|1)$/i.test(String(to.IsQuest ?? "")) ? STORY_QUEST_SHARE : 1;
}

// A crisis story's option that grants the crisis's narrative tag (EFFECT_PLAYER_GRANT_NARRATIVE_TAG, NARRATIVE_TAG_CRISIS_*)
// completes a crisis triumph: a crisis card for the next age's dedications (research/40 C, legacy notes P7). Worth this much.
const CRISIS_TAG_VALUE = 3;

/** Does this story option grant a crisis's narrative tag (its rewards' modifiers)? */
function grantsCrisisTag(storyType) {
    const rewards = new Set((GameInfo.NarrativeStory_Rewards?.filter((r) => r.NarrativeStoryType === storyType) ?? []).map((r) => r.NarrativeRewardType));
    if (rewards.size === 0) return false;
    const ids = (GameInfo.NarrativeRewards?.filter((r) => rewards.has(r.NarrativeRewardType)) ?? []).map((r) => r.ModifierID ?? r.ModifierId).filter(Boolean);
    return (safe(() => effectsOf(ids), []) ?? []).some((e) => e.effect === "EFFECT_PLAYER_GRANT_NARRATIVE_TAG" && /^NARRATIVE_TAG_CRISIS_/.test(String(e.args?.NarrativeTagType ?? "")));
}

export function chooseStory(answered = new Set(), settings = null) {
    const stories = safe(() => Players.get(pid()).Stories, null);
    if (!stories) return [];
    const storyId = safe(() => stories.getFirstPendingMetId(), null);
    if (!storyId || answered.has(JSON.stringify(storyId))) return [];
    const story = safe(() => stories.find(storyId), null);
    const def = story ? safe(() => GameInfo.NarrativeStories.lookup(story.type), null) : null;
    if (!def) return [];
    const links = (GameInfo.NarrativeStory_Links ?? []).filter((l) => l.FromNarrativeStoryType === def.NarrativeStoryType);
    const weights = profileFor(settings).y;
    const targets = def.VariableLinks ? safe(() => stories.getOrderedLinks(storyId), []) ?? [] : links.map((l) => l.ToNarrativeStoryType);
    const options = [];
    for (const t of targets) {
        const to = safe(() => GameInfo.NarrativeStories.lookup(t), null);
        if (!to) continue;
        const activation = String(to.Activation ?? "").toUpperCase();
        const ok = activation === "LINKED"
            || (["LINKED_REQUISITE", "LINKED_COMMON", "LINKED_SUBJECT_REQUISITE"].includes(activation) && safe(() => stories.determineRequisiteLink(to.NarrativeStoryType, storyId), false));
        if (!ok) continue;
        const affordable = !to.Cost || safe(() => stories.canAfford(to.NarrativeStoryType), false);
        if (!affordable) continue;
        const link = links.find((l) => l.ToNarrativeStoryType === to.NarrativeStoryType);
        let icons = GameInfo.NarrativeRewardIcons?.filter((i) => i.NarrativeStoryType === to.NarrativeStoryType) ?? [];
        if (icons.length === 0) icons = safe(() => rewardIcons(to.NarrativeStoryType), []) ?? [];
        const negative = icons.some((i) => truthy(i.Negative));
        const happy = icons.some((i) => i.RewardIconType === "YIELD_HAPPINESS" && !truthy(i.Negative)) && !icons.some((i) => i.RewardIconType === "YIELD_HAPPINESS" && truthy(i.Negative));
        const crisis = safe(() => grantsCrisisTag(to.NarrativeStoryType), false) ? CRISIS_TAG_VALUE : 0;
        // The rewards' modifiers where they say what an option is worth, else its icons (research/game60 M9).
        const rewards = safe(() => storyRewardValue(to, icons, weights, settings), null);
        options.push({ key: to.NarrativeStoryType, ai: !!(link?.AIPriority === true || link?.AIPriority === "true" || link?.AIPriority === 1), negative, happy, value: (rewards ?? storyValue(icons, weights)) * questShare(to) + crisis });
    }
    const calm = options.some((o) => o.happy) && unhappySettlement();
    // Happiness first in unrest; then what the profile values most (research/23 S5: the base game sets no
    // AIPriority, so the first option without a negative icon was taken: +Gold over +Science at A61).
    options.sort((a, b) => (calm ? Number(b.happy) - Number(a.happy) : 0) || b.value - a.value || Number(b.ai) - Number(a.ai) || Number(a.negative) - Number(b.negative));
    const key = options[0]?.key ?? "CLOSE";
    const args = { TargetType: key, Target: storyId, Action: globalThis.PlayerOperationParameters?.Activate };
    const okStart = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION, args, false), null);
    if (!okStart?.Success) return [];
    Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION, args);
    answered.add(JSON.stringify(storyId));
    // The title the story screen shows (a discovery's Name often has no text: research/23 S5).
    const text = (k) => (k && safe(() => Locale.keyExists?.(k) ?? true, false) ? safe(() => Locale.compose(k), null) : null);
    return [{ key: "STORY", args: [text(def.StoryTitle) ?? text(def.Name) ?? def.NarrativeStoryType, key === "CLOSE" ? "-" : key] }];
}

// ---- other one-off choices ---------------------------------------------------------------

/** A pantheon when one is unlocked: the one worth most to our empire that the game allows (research/40 A3). */
export function choosePantheon(settings = {}) {
    if (!waiting("NOTIFICATION_CHOOSE_PANTHEON")) return [];
    const religion = safe(() => Players.get(pid()).Religion, null);
    if (!religion || !(Number(safe(() => religion.getNumPantheonsUnlocked(), 0)) > 0)) return [];
    // The pantheon worth most to our empire (research/40 A3; core/xpl-religion.js), not the first the game allows (game 41:
    // Earth Goddess). Unknown ones (another mod's) after the known, in the game's order.
    const weights = profileFor(settings).y;
    const facts = safe(() => pantheonFacts(settings), {});
    const defs = (GameInfo.Beliefs?.filter((b) => b.BeliefClassType === "BELIEF_CLASS_PANTHEON") ?? []);
    const ranked = rankByValue(defs.map((b) => b.BeliefType), (t) => pantheonValue(t, facts, weights));
    for (const type of ranked) {
        const b = defs.find((d) => d.BeliefType === type);
        const args = { BeliefType: Database.makeHash(b.BeliefType) };
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.FOUND_PANTHEON, args, false), null);
        if (!ok?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.FOUND_PANTHEON, args);
        return [{ key: "PANTHEON", args: [Locale.compose(b.Name)] }];
    }
    return [];
}

/**
 * Our settlements' tiles as religion counts them: farms, camps, fishing boats, mines, resource tiles and quarters (2+
 * buildings), and per settlement its specialists and natural wonders.
 */
function empireTiles() {
    const out = { farms: 0, camps: 0, fishing: 0, mines: 0, resources: 0, quarters: 0, specialists: 0, naturalWonders: 0 };
    for (const city of safe(() => Players.get(pid()).Cities.getCities(), []) ?? []) {
        const t = settlementTiles(city);
        for (const k of ["farms", "camps", "fishing", "mines", "resources", "quarters"]) out[k] += t[k];
        if (t.naturalWonder) out.naturalWonders++;
        let workers = 0;
        for (const w of safe(() => city.Workers.GetAllPlacementInfo(), []) ?? []) workers += Number(w.NumWorkers) || 0;
        if (workers >= 3) out.specialists++;
    }
    return out;
}

const PANTHEON_GROWTH_MAX = 3;   // the empire a pantheon serves grows to the settlement cap, at most this many times today's
const QUARTERS_PER_CITY = 2;     // quarters a city has by Antiquity's end, at least

/**
 * What a pantheon acts on (core pantheonValue), for the whole age: the pantheon comes early (Mysticism) and lasts all of
 * Antiquity, so the tiles of today grow with the settlements toward the cap, and every city builds quarters.
 */
function pantheonFacts(settings) {
    const me = Players.get(pid());
    const cities = safe(() => me.Cities.getCities(), []) ?? [];
    const settlements = Math.max(1, cities.length);
    const cap = Number(safe(() => me.Stats.settlementCap, 0)) || settlements;
    const grow = Math.min(PANTHEON_GROWTH_MAX, Math.max(1, cap / settlements));
    const t = empireTiles();
    let production = 0;
    let food = 0;
    for (const c of cities) {
        if (!c.isTown) production += Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
        food += Math.max(0, Number(safe(() => c.Yields.getNetYield(YieldTypes.YIELD_FOOD), 0)) || 0);
    }
    const cityCount = Math.max(1, cities.filter((c) => !c.isTown).length);
    return {
        settlements: settlements * grow, production: production * grow, food: food * grow,
        influence: Number(safe(() => me.Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY), 0)) || 0,
        farms: t.farms * grow, camps: t.camps * grow, fishing: t.fishing * grow, mines: t.mines * grow, resources: t.resources * grow,
        quarters: Math.max(t.quarters, QUARTERS_PER_CITY * cityCount * grow),
        focus: focusOfProfile(settings?.profile),
    };
}

/**
 * What a religion's beliefs act on (core beliefValue): our settlements follow it once our Missionaries convert them
 * (research/40 B1), foreign ones only as they follow it now.
 */
function beliefFacts(settings) {
    const me = Players.get(pid());
    const cities = safe(() => me.Cities.getCities(), []) ?? [];
    const t = empireTiles();
    let foreign = 0;
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (p.id === pid()) continue;
        for (const c of safe(() => p.Cities.getCities(), []) ?? []) if (followsOurReligion(c)) foreign++;
    }
    return {
        settlements: cities.length, cities: cities.filter((c) => !c.isTown).length, followers: cities.length, foreign,
        specialists: t.specialists, naturalWonders: t.naturalWonders,
        // Lay Followers, Ecclesiasticism and Charoen pay for converting other civilizations' settlements, which our
        // Missionaries never do (research/game60 M2): no such settlements count.
        convertRural10: 0, convertUrban10: 0, convertTreasure: 0,
        distant: cities.filter((c) => safe(() => c.isDistantLands, false)).length,
        // City-states we are suzerain of: our Missionaries convert them once ours follow (research/40 C; Icons' relics).
        treasure: 0, wonders: 1, cityStates: ourCityStates().length, focus: focusOfProfile(settings?.profile),
    };
}

/**
 * Founding a religion (NOTIFICATION_CHOOSE_RELIGION) and its beliefs (NOTIFICATION_CHOOSE_BELIEF):
 * the first religion not founded yet, then beliefs one at a time (the game confirms each with
 * BeliefAdded) while the game accepts one. Beliefs worth most to our empire first (core/xpl-religion.js;
 * research/40 A3), one we do not know by Policy Yield Previews' value of its BeliefModifiers. Same
 * operations as the game's belief picker (panel-belief-picker.js: FOUND_RELIGION {ReligionType},
 * ADD_BELIEF {BeliefType}).
 */
export async function foundReligion(settings) {
    const out = [];
    const religion = safe(() => Players.get(pid()).Religion, null);
    if (!religion) return out;
    if (waiting("NOTIFICATION_CHOOSE_RELIGION") && safe(() => religion.canCreateReligion(), false) && !safe(() => religion.hasCreatedReligion(), false)) {
        for (const r of GameInfo.Religions ?? []) {
            if (safe(() => Game.Religion.hasBeenFounded(r.ReligionType), false)) continue;
            const args = { ReligionType: Database.makeHash(r.ReligionType) };
            if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.FOUND_RELIGION, args, false), null)?.Success) continue;
            Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.FOUND_RELIGION, args);
            out.push({ key: "RELIGION_FOUNDED", args: [safe(() => Locale.compose(r.Name), r.ReligionType)] });
            await nextEvent("ReligionFounded", POLICY_WAIT_MS);
            break;
        }
    }
    if (!(out.length > 0 || waiting("NOTIFICATION_CHOOSE_BELIEF") || waiting("NOTIFICATION_CHOOSE_RELIGION"))) return out;
    const weights = profileFor(settings).y;
    const facts = safe(() => beliefFacts(settings), {});
    const tried = new Set();
    for (let i = 0; i < MAX_BELIEFS; i++) {
        const options = [];
        for (const b of GameInfo.Beliefs ?? []) {
            if (b.BeliefClassType === "BELIEF_CLASS_PANTHEON" || tried.has(b.BeliefType)) continue;
            if (!safe(() => Game.Religion.isBeliefClaimable(b.BeliefType), false)) continue;
            // Our empire's numbers first (research/40 A3: game 41 took Icons, Interfaith Dialogue, Conversion and Stewardship,
            // the first rows of each class); a belief we do not know, Policy Yield Previews' value of its modifiers.
            const known = beliefValue(b.BeliefType, facts, weights);
            const ids = (GameInfo.BeliefModifiers?.filter((m) => m.BeliefType === b.BeliefType) ?? []).map((m) => m.ModifierID ?? m.ModifierId);
            options.push({ b, value: known ?? modifiersValue(ids, weights) });
        }
        options.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
        const pick = options.find(({ b }) => safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.ADD_BELIEF, { BeliefType: Database.makeHash(b.BeliefType) }, false), null)?.Success);
        if (!pick) break;
        tried.add(pick.b.BeliefType);
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.ADD_BELIEF, { BeliefType: Database.makeHash(pick.b.BeliefType) });
        out.push({ key: "BELIEF", args: [safe(() => Locale.compose(pick.b.Name), pick.b.BeliefType)] });
        if (!(await nextEvent("BeliefAdded", POLICY_WAIT_MS))) break; // slow game: the rest next pass
    }
    return out;
}

/**
 * A government when the game asks for one: the best the game allows for the focus the priority
 * serves (core rankGovernments: science Oligarchy, Plutocracy, Elective Republic; military ones
 * last). Before, the first it allowed was taken (Feudal Monarchy, Authoritarianism).
 */
export function chooseGovernment(settings = {}) {
    const current = safe(() => Players.get(pid()).Culture.getGovernmentType(), null);
    if (!waiting("NOTIFICATION_CHOOSE_GOVERNMENT") && current !== -1) return [];
    const offeredTypes = [];
    for (const g of GameInfo.StartingGovernments ?? []) if (!offeredTypes.includes(g.GovernmentType)) offeredTypes.push(g.GovernmentType);
    for (const type of rankGovernments(offeredTypes, focusOfProfile(settings.profile))) {
        const def = safe(() => GameInfo.Governments.lookup(type), null);
        if (!def) continue;
        const args = { GovernmentType: def.$index, Action: globalThis.PlayerOperationParameters?.Activate };
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHANGE_GOVERNMENT, args, false), null);
        if (!ok?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHANGE_GOVERNMENT, args);
        return [{ key: "GOVERNMENT", args: [Locale.compose(def.Name)] }];
    }
    return [];
}

/**
 * Syncretism (research/31 §5): a Time-Tested civilization adopts another civilization's units or infrastructure, or keeps
 * its own (traditions and a culture slot); NOTIFICATION_CHOOSE_SYNCRETISM holds the turn until it chooses (game 26, M84).
 * While that notice waits, once a turn (the notice stays until the game handles the choice; the game's canStart refuses a
 * second one). Game 41 held the turn twice (Exploration and Modern) with nothing chosen: the old test, any value from
 * `Identity.getSyncreticCivType()` = chosen, read the game's "none" as a choice; the game's own screen counts a choice
 * only when that type is a civilization (syncretism-screen-model.js getSyncretizedInfo). The pick: its own when that
 * brings a culture slot (one more policy card), else the infrastructure with a unique quarter, then the most buildings,
 * else the first offered (units last). Sent like the screen's confirm (syncretizeSelection):
 * CHOOSE_SYNCRETISM_SELF / _INFRASTRUCTURE / _UNITS {CivilizationType}, after canStart. UI.log says why nothing was sent.
 */
let syncretismTurn = null; // the turn a choice was sent
export function chooseSyncretism() {
    if (!waiting("NOTIFICATION_CHOOSE_SYNCRETISM")) return [];
    const T = globalThis.SyncreticChoiceTypes;
    const ops = globalThis.PlayerOperationTypes;
    if (!T || !ops) return [];
    if (syncretismTurn === Game.turn) return [];
    const offered = (flag) => [...(safe(() => Game.Unlocks.getSyncreticCivUnlocksForChoice(pid(), flag), []) ?? [])];
    const civType = (civ) => safe(() => GameInfo.LegacyCivilizationTraits.lookup(civ)?.CivilizationType, null) ?? safe(() => GameInfo.Civilizations.lookup(civ)?.CivilizationType, null) ?? "";
    const kinds = (list, kind) => (list ?? []).filter((x) => x?.kind === kind).length;
    const options = [];
    for (const civ of offered(T.SYNCRETIC_CHOICE_SELF)) {
        const slots = kinds(safe(() => Game.Unlocks.getSelfChoiceSyncreticUnlocks(civType(civ)), []), "KIND_CULTURE_SLOT");
        options.push({ civ, flag: T.SYNCRETIC_CHOICE_SELF, op: ops.CHOOSE_SYNCRETISM_SELF, label: "LOC_UI_SYNCRETISM_SELF", score: slots > 0 ? 1000 + slots : 1 });
    }
    for (const civ of offered(T.SYNCRETIC_CHOICE_INFRASTRUCTURE)) {
        const unlocks = safe(() => Game.Unlocks.getInfrastructureChoiceSyncreticUnlocks(civType(civ)), []);
        options.push({ civ, flag: T.SYNCRETIC_CHOICE_INFRASTRUCTURE, op: ops.CHOOSE_SYNCRETISM_INFRASTRUCTURE, label: "LOC_UI_SYNCRETISM_INFRASTRUCTURE", score: 10 + 100 * kinds(unlocks, "KIND_QUARTER") + kinds(unlocks, "KIND_CONSTRUCTIBLE") });
    }
    for (const civ of offered(T.SYNCRETIC_CHOICE_UNITS)) options.push({ civ, flag: T.SYNCRETIC_CHOICE_UNITS, op: ops.CHOOSE_SYNCRETISM_UNITS, label: "LOC_UI_SYNCRETISM_UNITS", score: 0 });
    // The best first; ties keep the game's order (sort is stable).
    options.sort((a, b) => b.score - a.score);
    const refused = [];
    for (const o of options) {
        if (o.op === undefined) continue;
        const args = { CivilizationType: o.civ };
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), o.op, args, false), null);
        if (!ok?.Success) {
            refused.push(`${civType(o.civ) || o.civ} ${o.label.replace("LOC_UI_SYNCRETISM_", "")}: ${JSON.stringify(ok?.FailureReasons ?? ok ?? null)}`);
            continue;
        }
        Game.PlayerOperations.sendRequest(pid(), o.op, args);
        syncretismTurn = Game.turn;
        const name = safe(() => Locale.compose(GameInfo.Civilizations.lookup(civType(o.civ))?.Name ?? civType(o.civ)), civType(o.civ));
        return [{ key: "SYNCRETISM", args: [name, safe(() => Locale.compose(o.label), o.label)] }];
    }
    log.warn(`syncretism: nothing sent; ${options.length} option(s)${refused.length ? `, refused [${refused.join("; ")}]` : ""}; chosen ${safe(() => Players.get(pid()).Identity.getSyncreticCivType(), "?")}`);
    return [];
}

/**
 * A newly met leader waits for a greeting (NOTIFICATION_PLAYER_MET holds the turn): friendly
 * when the game allows it, else neutral, never hostile. Same operation as the game's
 * first-meet dialogue (panel-diplomacy-project-reaction.js).
 */
export function answerFirstMeetings() {
    const out = [];
    const F = globalThis.DiplomacyPlayerFirstMeets;
    if (!F || PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET === undefined) return out;
    const greetings = [["FRIENDLY", F.PLAYER_REALATIONSHIP_FIRSTMEET_FRIENDLY], ["NEUTRAL", F.PLAYER_REALATIONSHIP_FIRSTMEET_NEUTRAL]];
    const answered = new Set();
    for (const n of notificationsOf("NOTIFICATION_PLAYER_MET")) {
        const other = n.Player;
        if (other === undefined || other === null || other < 0 || answered.has(other)) continue;
        for (const [label, type] of greetings) {
            if (type === undefined) continue;
            const args = { Player1: pid(), Player2: other, Type: type };
            if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET, args, false), null)?.Success) continue;
            Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET, args);
            answered.add(other);
            const leader = safe(() => Locale.compose(Players.get(other).leaderName), String(other));
            out.push({ key: "FIRST_MEET", args: [leader, Locale.compose(`LOC_XPL_AP_GREETING_${label}`)] });
            break;
        }
    }
    return out;
}

/**
 * A leader's proposal waits for an answer (NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED holds
 * the turn; its Target.id is the action). Never "reject" (it costs relations, and rejecting a
 * demand such as "denounce military presence" means war): the cheapest other response the
 * game allows, plain acceptance before paid support (supporting a sanction is a step against
 * someone else). Only "reject" left: the proposal stays for the player. Same data and
 * operation as the game's reaction panel (panel-diplomacy-project-reaction.js).
 */
export function answerDiplomacy({ support = false, reserve = 0 } = {}) {
    const out = [];
    const R = globalThis.DiplomaticResponseTypes;
    const ENDEAVOR = globalThis.DiplomacyActionGroups?.DIPLOMACY_ACTION_GROUP_ENDEAVOR;
    const balance = Number(safe(() => Players.get(pid()).DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    if (PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION === undefined) return out;
    const done = new Set();
    for (const n of notificationsOf("NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED")) {
        const actionID = n.Target?.id;
        if (actionID === undefined || actionID === null || done.has(actionID)) continue;
        done.add(actionID);
        const data = safe(() => Game.Diplomacy.getResponseDataForUI(actionID), null);
        const event = safe(() => Game.Diplomacy.getDiplomaticEventData(actionID), null);
        noteHostileAct(event);
        const who = safe(() => Locale.compose(Players.get(event.initialPlayer).leaderName), "?");
        const what = safe(() => Locale.compose(GameInfo.DiplomacyActions.lookup(event.actionType).Name), "?");
        const options = (data?.responseList ?? [])
            .filter((r) => R?.DIPLOMACY_RESPONSE_REJECT === undefined || r.responseType !== R.DIPLOMACY_RESPONSE_REJECT)
            .filter((r) => safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION, { ID: actionID, Type: r.responseType }, false), null)?.Success)
            .sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0) || Number(a.responseType === R?.DIPLOMACY_RESPONSE_SUPPORT) - Number(b.responseType === R?.DIPLOMACY_RESPONSE_SUPPORT));
        let pick = options[0];
        // «Дипломатия»: supporting a leader's endeavor improves the relationship more than
        // accepting it (the game's favor for support), when the Influence allows. A leader's Reform
        // (Lafayette's: a tradition slot for good to each supporter; research/40 A4) is supported whatever the option.
        const reform = event?.actionType !== undefined && event.actionType === globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_GRANT_POLICY_SLOT;
        if ((support && ENDEAVOR !== undefined && event?.actionGroup === ENDEAVOR) || reform) {
            // An endeavor's support from the Influence above befriending's reserve; a Reform's whatever it keeps.
            const room = reform ? balance : balance - reserve;
            pick = options.find((r) => r.responseType === R?.DIPLOMACY_RESPONSE_SUPPORT && (Number(r.cost) || 0) <= room) ?? pick;
        }
        if (!pick) {
            out.push({ key: "DIPLO_LEFT", args: [who, what] });
            continue;
        }
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION, { ID: actionID, Type: pick.responseType });
        out.push({ key: "DIPLO_RESPONSE", args: [who, what, safe(() => Locale.compose(pick.responseName), String(pick.responseType))] });
    }
    return out;
}

/**
 * Befriends independent powers, so their units leave ours alone: befriending one ends its war with
 * us once the project reaches 30 (research/17). Same data and operation as the game's diplomacy
 * panel (panel-diplomacy-actions.js quick start, screen-diplomacy-target-select.js).
 *  - One Influence spend a pass (seen in game 5: 4–6 befriend requests in the same second, logged
 *    as started, and only the first ever started — the Influence paid for one; the two villages
 *    attacking us were never befriended): the first independent in order gets it, a new befriending
 *    (DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN) or more Influence into one we already befriend (the panel's
 *    "+"): under threat, when another leader's befriending of it would finish first (the befriend screen's
 *    places: Game.Diplomacy.getCompletionData's turnsToCompletion), or when ours would not finish before the
 *    age ends. One offered that we cannot afford yet keeps the Influence for itself (no other befriending
 *    starts); from endeavors and steals only a threatening one's, or any on befriending's turn (befriendReserve).
 *  - Not started (game 60, research/game60 M5: 2 of 6 lost to a leader who had started first, one started at
 *    A121 that needed 30 turns): one another leader befriends unless ours would win the race (its turns unknown:
 *    skipped), and one that cannot be done before the age ends (befriendTurns; a threatening one only needs the
 *    Friendly stage, half of it, for its war with us to end).
 *  - A village the game says we have not found (LOC_DIPLOMACY_ACTION_FAILURE_NO_VISION; it lists it with its
 *    price all the same): not befriendable now, no Influence kept, a unit is sent toward it (game 60: 49 passes kept
 *    the Influence for such villages and blocked every endeavor).
 *  - Order: those whose units threaten a settlement, then those at war with us (hostile), then the
 *    nearest to our settlements — measured to its village (not a city: villagesOf) or its city
 *    (a city-state). Before, villages had no distance at all, so the order was arbitrary.
 * @param threats threatenedSettlements() @param ageTurnsLeft the age's turns left (ageOutlook)
 */
export function befriendIndependents(threats = [], { ageTurnsLeft = Infinity } = {}) {
    const out = [];
    const GIVE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN;
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    const HOSTILE = globalThis.IndependentRelationship?.HOSTILE;
    if (GIVE === undefined) return out;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const villages = safe(() => villagesOf(pid(), true), []) ?? [];
    const distance = (p) => {
        const places = [
            ...(safe(() => p.Cities.getCities(), []) ?? []).map((c) => c.location),
            ...villages.filter((v) => v.id === p.id),
        ];
        let best = Infinity;
        for (const c of places) {
            for (const o of ours) best = Math.min(best, safe(() => GameplayMap.getPlotDistance(o.x, o.y, c.x, c.y), Infinity));
        }
        return best;
    };
    const hostile = (p) => (HOSTILE !== undefined && safe(() => Game.IndependentPowers.getIndependentRelationship(p.id, pid()), null) === HOSTILE)
        || !!safe(() => Players.get(pid()).Diplomacy.isAtWarWith(p.id), false);
    const threatening = new Set(threats.flatMap((t) => t.owners.filter((o) => o.independent).map((o) => o.id)));
    const independents = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isIndependent)
        .map((p) => ({ p, d: distance(p), threat: threatening.has(p.id), hostile: hostile(p) }))
        .sort((a, b) => Number(b.threat) - Number(a.threat) || Number(b.hostile) - Number(a.hostile) || a.d - b.d);
    const blocked = [];
    // Statuses under which an offered befriending keeps no Influence (not now), and those that send a unit toward it.
    const NOT_NOW = ["NOT_UNLOCKED", "NO_VIABLE_TARGETS", "BLOCKED", "ACTIVE"].map((n) => globalThis.DiplomacyProjectStatus?.[`PROJECT_${n}`]).filter((v) => v !== undefined);
    const UNUSABLE = ["NOT_UNLOCKED", "NO_VIABLE_TARGETS", "BLOCKED"].map((n) => globalThis.DiplomacyProjectStatus?.[`PROJECT_${n}`]).filter((v) => v !== undefined);
    let reserve = 0; // Influence kept from endeavors and steals for a befriending we save for
    let spent = false; // this pass's Influence is spoken for: no other befriending
    const NO_VIABLE = globalThis.DiplomacyProjectStatus?.PROJECT_NO_VIABLE_TARGETS;
    const balance = Number(safe(() => Players.get(pid()).DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    const duration = befriendTurns(GIVE);
    const left = Number.isFinite(Number(ageTurnsLeft)) ? Number(ageTurnsLeft) : Infinity;
    const turnsOf = (event) => {
        const t = Number(safe(() => Game.Diplomacy.getCompletionData(event.uniqueID)?.turnsToCompletion, NaN));
        return Number.isFinite(t) ? t : null;
    };
    const keep = (threat, price) => {
        // Saving for it: a threatening one keeps its price from everything else, another only on befriending's turn.
        if (threat || befriendsNext) reserve = Math.max(reserve, Number(price) > 0 ? Number(price) : Infinity);
        spent = true;
    };
    for (const { p, threat } of independents) {
        // The village we hunt (it will not be befriended: research/41 §6): no Influence for it.
        if (p.id === huntedIndependent()) continue;
        const name = () => independentNameOf(p.id);
        const events = safe(() => Game.Diplomacy.getPlayerEvents(p.id), []) ?? [];
        const ongoing = events.find((a) => a.initialPlayer === pid() && a.actionType === GIVE);
        // Other leaders befriending it (the befriend screen's other bars), the soonest done first.
        const rivals = events.filter((a) => a.actionType === GIVE && a.initialPlayer !== pid() && a.initialPlayer >= 0)
            .map((a) => ({ a, turns: turnsOf(a) })).sort((x, y) => (x.turns ?? -1) - (y.turns ?? -1));
        const rival = rivals[0] ?? null;
        if (ongoing) {
            // Already befriending: more Influence speeds it up under threat, against a leader whose befriending of it would
            // finish first (a tie is lost, as the screen ranks it), and when ours would not be done before the age ends;
            // those two only when the support still to give can make it (`best`: its turns at BEFRIEND_SUPPORT_MAX).
            const mine = turnsOf(ongoing);
            const data = safe(() => Game.Diplomacy.getDiplomaticEventData(ongoing.uniqueID), null);
            const support = Number(data?.support) || 0;
            const best = supportedTurns(ongoing, data);
            const behind = !threat && rival && mine !== null && (rival.turns === null || rival.turns <= mine);
            const short = !threat && !behind && mine !== null && mine > left;
            const can = behind ? rival.turns !== null && best !== null && best < rival.turns : short ? best !== null && best <= left : true;
            const why = threat ? "a threat"
                : behind ? `${leaderNameOf(rival.a.initialPlayer)} done in ${rival.turns ?? "?"} turn(s), ours in ${mine}`
                : short ? `ours done in ${mine} turn(s), ${left} left in the age` : null;
            if (why && !can) {
                if (befriendSkipNoted.get(p.id) !== Game.turn) {
                    befriendSkipNoted.set(p.id, Game.turn);
                    log.info(`befriend: ${name()}: no more Influence into ours (${why}; at most ${best ?? "?"} turn(s) with support ${BEFRIEND_SUPPORT_MAX})`);
                }
                continue;
            }
            if (why && !spent && (threat || support < BEFRIEND_SUPPORT_MAX)) {
                const s = supportAction(ongoing.uniqueID, p);
                if (s.length > 0) {
                    if (!threat) log.info(`befriend: ${name()}: more Influence into ours (${why})`);
                    out.push(...s);
                    spent = true;
                }
            }
            continue;
        }
        // Too late or lost to another leader (game 60): not started, no Influence kept. A threatening one's war ends at the
        // Friendly stage, half the way.
        const need = duration === null ? null : threat ? duration / 2 : duration;
        const lost = rival && (rival.turns === null || need === null || rival.turns <= need);
        const late = need !== null && need > left;
        if (lost || late) {
            if (befriendSkipNoted.get(p.id) !== Game.turn) {
                befriendSkipNoted.set(p.id, Game.turn);
                log.info(lost
                    ? `befriend: ${name()}: ${leaderNameOf(rival.a.initialPlayer)} befriends it (done in ${rival.turns ?? "?"} turn(s)), ours would take ${need === null ? "?" : Math.ceil(need)}: not started`
                    : `befriend: ${name()}: about ${Math.ceil(need)} turn(s) to befriend, ${left} left in the age: not started`);
            }
            continue;
        }
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), p.id, T, G, -1, T), []) ?? []).find((pr) => pr.actionType === GIVE);
        const args = project ? { Player1: pid(), Type: project.actionType, Amount: 1, ID: p.id } : null;
        const ok = project && (AVAILABLE === undefined || project.projectStatus === AVAILABLE)
            && safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success;
        // NO_VIABLE_TARGETS (-3) is also the game's answer when we lack the Influence: it lists the village with its
        // price, and the failure says "not enough Influence 71/180" (research/41 §1: game 44). That one is befriendable:
        // the Influence is kept for it, as for an AVAILABLE one we cannot afford yet. Only this independent's own entry.
        const target = (project?.targetList1 ?? []).find((t) => t?.targetID === p.id) ?? null;
        const reasons = target?.resultData?.FailureReasons ?? [];
        // The game lists a village it says we have not found with its price too (game 60: «Вы еще не нашли их деревню.»):
        // not befriendable now, nothing kept for it, a unit goes toward it.
        const unseen = reasons.some((r) => noVisionTexts().includes(r));
        const short = !ok && !unseen && project && NO_VIABLE !== undefined && project.projectStatus === NO_VIABLE
            && Number(target?.costYieldD) > balance;
        if (short) {
            if (threat && befriendNoted !== Game.turn) {
                befriendNoted = Game.turn;
                log.info(`befriend: ${name()} threatens us; its project status ${project.projectStatus}: ${balance}/${target.costYieldD} Influence, kept for it (${reasons.join("; ") || "no reason given"})`);
            }
            keep(threat, target.costYieldD);
            continue;
        }
        if (!ok) {
            // Not offered, or offered but not usable (no viable target, not unlocked, blocked: its village unseen,
            // research/23 E5: game 8, a camp raided us 40 turns, never befriended nor approached): a unit is sent
            // toward it.
            if (threat && (!project || UNUSABLE.includes(project.projectStatus))) blocked.push(p.id);
            if (threat && befriendNoted !== Game.turn) {
                befriendNoted = Game.turn;
                if (unseen) {
                    const v = villages.find((x) => x.id === p.id);
                    const state = v ? safe(() => GameplayMap.getRevealedState(pid(), v.x, v.y), "?") : "?";
                    const met = safe(() => Players.get(pid()).Diplomacy.hasMet(p.id), "?");
                    log.info(`befriend: ${name()}: village not found, Influence not kept (village ${v ? `${v.x},${v.y} revealed state ${state}` : "unknown"}, met ${met}; Influence ${balance}, price ${target.costYieldD})`);
                } else {
                    const why = reasons.join("; ");
                    log.info(`befriend: ${name()} threatens us; its project ${project ? `status ${project.projectStatus}` : "not offered"}; Influence ${balance}${target ? `, price ${target.costYieldD}` : ", no target listed"}${why ? ` (${why})` : ""}`);
                }
            }
            if (project && !NOT_NOW.includes(project.projectStatus)) keep(threat, target?.costYieldD); // the Influence is kept for this one
            continue;
        }
        if (spent) {
            if (threat) reserve = Math.max(reserve, Number(target?.costYieldD) > 0 ? Number(target.costYieldD) : Infinity);
            continue;
        }
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        out.push({ key: "BEFRIEND", args: [name()] });
        befriendsNext = false;
        spent = true;
    }
    blockedIndependents = blocked;
    // Sent this pass: nothing else spends Influence (the balance changes only once the game handles it).
    befriendReserve = out.length > 0 ? Infinity : reserve;
    befriendReserveTurn = safe(() => Game.turn, -1);
    return out;
}

let befriendNoted = -1; // UI.log names a threatening independent's befriend status once a turn
const befriendSkipNoted = new Map(); // independent -> the turn UI.log said why its befriending is not started
const BEFRIEND_SUPPORT_MAX = 6; // more Influence into a befriending that is not threatened up to this support

/**
 * The turns our befriending would take once its support is at BEFRIEND_SUPPORT_MAX: what it still lacks (the event's
 * completionScore less its progressScore, as the befriend screen shows "progress/total (+support a turn)"; else the
 * completion data's turns × its progress a turn) over its progress a turn plus the support still to give. A bound: one
 * support goes in a turn. @returns turns, or null when the game does not say
 */
function supportedTurns(event, data) {
    const support = Number(data?.support) || 0;
    let lacks = Number(data?.completionScore) - Number(data?.progressScore);
    let rate = support;
    if (!(lacks > 0) || !(rate > 0)) {
        const c = safe(() => Game.Diplomacy.getCompletionData(event.uniqueID), null);
        rate = Number(c?.progressPerTurn);
        lacks = Number(c?.turnsToCompletion) * rate;
    }
    if (!(lacks > 0) || !(rate > 0)) return null;
    return Math.ceil(lacks / (rate + Math.max(0, BEFRIEND_SUPPORT_MAX - support)));
}

/** The game's "you have not found their village" failure, composed as the project data carries it, and its key. */
function noVisionTexts() {
    const key = "LOC_DIPLOMACY_ACTION_FAILURE_NO_VISION";
    return [safe(() => Locale.compose(key), key), key];
}

function leaderNameOf(id) {
    return safe(() => Locale.compose(Players.get(id).leaderName), String(id));
}

/**
 * Turns a new befriending takes at the support it starts with: the game-speed duration (Game.Diplomacy.modifyByGameSpeed,
 * as the diplomacy panel scales a project's BaseDuration) over its BaseTokenCost. Antiquity, Standard speed: 60 / 2 = 30, as
 * game 60's three befriendings each took (49→79, 80→110, 93→123). @returns turns, or null when the data is not there
 */
function befriendTurns(GIVE) {
    const def = safe(() => GameInfo.DiplomacyActions.lookup(GIVE), null);
    const base = Number(def?.BaseDuration) || 0;
    const tokens = Number(def?.BaseTokenCost) || 0;
    if (!(base > 0) || !(tokens > 0)) return null;
    const d = Number(safe(() => Game.Diplomacy.modifyByGameSpeed(base), base)) || base;
    return d / tokens;
}

/** Forgets this pass's Influence reserve and whose turn it is (tests; a new game). */
export function resetBefriending() {
    befriendReserve = 0;
    befriendReserveTurn = -1;
    befriendsNext = false;
    befriendNoted = -1;
    befriendSkipNoted.clear();
}

/**
 * What befriending keeps this turn (befriendReserve), 0 when its step did not run this turn (switched off, or it stopped
 * early): the last reserve, Infinity after a befriending was sent, would otherwise hold every endeavor, steal and
 * reconciliation for good.
 */
function reserveNow() {
    return befriendReserveTurn === safe(() => Game.turn, -1) ? befriendReserve : 0;
}

/** The Influence above what befriending keeps this pass. */
const influenceFree = () => influence() - reserveNow();

/** More Influence into our ongoing "befriend" with an independent (panel-diplomacy-actions.js). */
function supportAction(actionID, p) {
    const args = { ID: actionID, Type: globalThis.DiplomacyTokenTypes?.DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true };
    if (args.Type === undefined || PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION === undefined) return [];
    if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION, args, false), null)?.Success) return [];
    Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION, args);
    return [{ key: "BEFRIEND_SUPPORT", args: [independentNameOf(p.id)] }];
}

/** Independents threatening us that the game does not let us befriend yet (see befriendIndependents). */
export function unbefriendable() {
    return blockedIndependents;
}

/**
 * Open borders with a leader whose land our explorers have reached, so they can go on
 * (DIPLOMACY_ACTION_OPEN_BORDERS, the game's "open borders" treaty, costs Influence). Skipped
 * when the game does not offer it (already open, already asked, not enough Influence).
 */
const OPEN_BORDERS_EVERY = 10; // turns between two requests to one leader (G2: refused requests were sent every turn)
const bordersAsked = new Map(); // leader -> the turn we last asked

export function proposeOpenBorders(leaders) {
    const out = [];
    const OPEN = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_OPEN_BORDERS;
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    if (OPEN === undefined) return out;
    for (const leader of leaders) {
        const pending = (safe(() => Game.Diplomacy.getPlayerEvents(leader), []) ?? []).some((a) => a.actionType === OPEN && (a.initialPlayer === pid() || a.targetPlayer === pid()));
        if (pending) continue;
        if (Game.turn - (bordersAsked.get(leader) ?? -Infinity) < OPEN_BORDERS_EVERY) continue;
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), leader, T, G, -1, T), []) ?? []).find((pr) => pr.actionType === OPEN);
        if (!project || (AVAILABLE !== undefined && project.projectStatus !== AVAILABLE)) continue;
        const args = { Player1: pid(), Player2: leader, Type: project.actionType, Amount: 1 };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        bordersAsked.set(leader, Game.turn);
        out.push({ key: "OPEN_BORDERS", args: [safe(() => Locale.compose(Players.get(leader).leaderName), String(leader))] });
    }
    return out;
}

/**
 * A town at population 7 waits for its project (NOTIFICATION_CHOOSE_TOWN_PROJECT holds the
 * turn). Where the towns step set no Focus (e.g. not connected to a city: its food would feed
 * nobody), "considered" as the town's production panel does when it opens
 * (CONSIDER_TOWN_PROJECT): the town keeps growing and the turn goes on.
 */
export function considerTownProjects(focused = new Set()) {
    const out = [];
    const op = globalThis.CityOperationTypes?.CONSIDER_TOWN_PROJECT;
    if (op === undefined) return out;
    for (const n of notificationsOf("NOTIFICATION_CHOOSE_TOWN_PROJECT")) {
        const town = n.Target;
        if (!town) continue;
        // The towns step just set its Focus: the notice is stale (research/22 B6: seen in game 7, Fort Town
        // sent three times, each followed at once by this request).
        if (focused.has(`${town.owner}:${town.id}`)) continue;
        if (!safe(() => Game.CityOperations.canStart(town, op, {}, false), null)?.Success) continue;
        Game.CityOperations.sendRequest(town, op, {});
        out.push({ key: "TOWN_KEEPS_GROWING", args: [safe(() => Locale.compose(Cities.get(town).name), "?")] });
    }
    return out;
}

/** A city-state bonus to pick (the one worth most by Policy Yield Previews, else the first). */
export function chooseCityStateBonus(settings) {
    const cs = safe(() => Game.CityStates.getCityStateBonusToSelect(pid()), -1);
    if (cs === null || cs === undefined || cs < 0) return [];
    const weights = profileFor(settings).y;
    const levers = leverContext(settings);
    const api = globalThis.LfYieldsPreview;
    const options = (GameInfo.CityStateBonuses ?? [])
        .filter((b) => safe(() => Game.CityStates.canHaveBonus(pid(), cs, b.CityStateBonusType), false))
        .map((b) => {
            const r = api?.previewCityStateBonusYields ? safe(() => api.previewCityStateBonusYields(b.CityStateBonusType), null) : null;
            // What it cannot value: e.g. Professional Architects, +25% production toward projects.
            const ids = (GameInfo.CityStateBonusModifiers?.filter((m) => m.CityStateBonusType === b.CityStateBonusType) ?? []).map((m) => m.ModifierID ?? m.ModifierId);
            return { b, value: withLevers(r?.isValid && r.yields ? valueOf(r.yields, weights) : null, leverValue(ids, weights, levers)) };
        })
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    for (const o of options) {
        const args = { OtherPlayer: cs, CityStateBonusType: Database.makeHash(o.b.CityStateBonusType) };
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHOOSE_CITY_STATE_BONUS, args, false), null);
        if (!ok?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHOOSE_CITY_STATE_BONUS, args);
        return [{ key: "CITY_STATE_BONUS", args: [Locale.compose(o.b.Name ?? o.b.CityStateBonusType)] }];
    }
    return [];
}

/**
 * "Seen it" for screens that wait for an acknowledgement (policies, resources, attributes)
 * and for an advisor warning that holds the turn (the notification's dismiss button).
 */
export function acknowledge() {
    let n = 0;
    for (const op of ["CONSIDER_ASSIGN_TRADITIONS", "CONSIDER_ASSIGN_RESOURCE", "CONSIDER_ASSIGN_ATTRIBUTE"]) {
        const type = PlayerOperationTypes[op];
        if (type === undefined) continue;
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), type, {}, false), null);
        if (!ok?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), type, {});
        n++;
    }
    return n > 0 ? [{ key: "ACKNOWLEDGED", args: [n] }] : [];
}

/**
 * A leader's message about their agenda ("<leader> wants to tell you something",
 * NOTIFICATION_DIPLOMATIC_ACTION_AGENDA) holds the turn until read. Only news (a change in
 * relations): marked read as the message window's close button does
 * (diplo-message-popup.js: Game.Notifications.dismiss).
 */
export function readLeaderMessages() {
    const out = [];
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? []) {
        const note = safe(() => Game.Notifications.find(id), null);
        if (!note || safe(() => Game.Notifications.getTypeName(note.Type), null) !== "NOTIFICATION_DIPLOMATIC_ACTION_AGENDA") continue;
        try {
            Game.Notifications.dismiss(id);
        } catch (_e) {
            continue;
        }
        out.push({ key: "LEADER_MESSAGE", args: [safe(() => Locale.compose(Players.get(note.Player).leaderName), "?")] });
    }
    return out;
}

const MAX_GREAT_WORK_MOVES = 10;

/**
 * Great works waiting in the archive («Архив»: there was no free slot when they came; codices,
 * relics, artifacts) go into free slots, as the game's great works screen moves them
 * (model-great-works.js: PlayerOperations MOVE_GREAT_WORK {Player1, GreatWorkIndex,
 * DestinationCity: city.id.id, DestinationBuilding: the building's type}; its slots come from
 * city.Constructibles.getGreatWorkBuildings(), an empty one has no great work). Only displayed
 * works give their yields and count for triumphs such as «Географическое общество».
 */
let archiveLeft = { turn: -1, left: 0 }; // what slotGreatWorks left in the archive this turn

/**
 * Great works waiting in the archive with no slot found for them (slotGreatWorks this turn, else the
 * archive's count): the gold plan saves for a building with slots (research/21 D6).
 */
export function greatWorksWaiting() {
    if (archiveLeft.turn === Game.turn) return archiveLeft.left;
    return Number(safe(() => Players.get(pid()).Culture.getNumWorksInArchive(), 0)) || 0;
}

export function slotGreatWorks() {
    const out = [];
    const OP = globalThis.PlayerOperationTypes?.MOVE_GREAT_WORK;
    const player = safe(() => Players.get(pid()), null);
    const culture = player?.Culture;
    const count = Number(safe(() => culture.getNumWorksInArchive(), 0)) || 0;
    archiveLeft = { turn: Game.turn, left: count };
    if (OP === undefined || count <= 0) return out;
    const workOf = (index) => (index === undefined || index === null || index < 0 ? null : safe(() => GameInfo.GreatWorks.lookup(Game.Culture.getGreatWorkType(index)), null));
    const places = [];
    for (const city of safe(() => player.Cities.getCities(), []) ?? []) {
        for (const b of safe(() => city.Constructibles.getGreatWorkBuildings(), []) ?? []) {
            const building = safe(() => Constructibles.getByComponentID(b.constructibleID), null);
            if (!building || building.damaged) continue;
            const free = (b.slots ?? []).filter((s) => !workOf(s.greatWorkIndex)).length;
            if (free > 0) places.push({ city, type: building.type, free });
        }
    }
    for (let i = 0; i < count && out.length < MAX_GREAT_WORK_MOVES; i++) {
        const index = safe(() => culture.getArchivedGreatWork(i), -1);
        const work = workOf(index);
        if (!work) continue;
        for (const p of places) {
            if (p.free <= 0) continue;
            const args = { Player1: pid(), GreatWorkIndex: index, DestinationCity: p.city.id.id, DestinationBuilding: p.type };
            if (!safe(() => Game.PlayerOperations.canStart(pid(), OP, args, false), null)?.Success) continue;
            Game.PlayerOperations.sendRequest(pid(), OP, args);
            p.free--;
            out.push({ key: "GREAT_WORK_SLOTTED", args: [
                safe(() => Locale.compose(work.Name), work.GreatWorkType ?? "?"),
                safe(() => Locale.compose(p.city.name), "?"),
                safe(() => Locale.compose(GameInfo.Constructibles.lookup(p.type).Name), "?"),
            ] });
            break;
        }
    }
    archiveLeft = { turn: Game.turn, left: Math.max(0, count - out.length) };
    return out;
}

const ESPIONAGE = "NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE";

/**
 * «Обнаружен шпионаж» (NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE: a spy action against us was
 * revealed) held the turn in game. Only news (its window, screen-espionage-details, just shows
 * the report and sends nothing when closed): dismissed like a leader's message. If it still
 * holds the turn on the end-of-turn retry, it is activated the way the game's end turn button
 * activates a blocking notification (panel-action.js), which opens the report; the pop-up
 * closer then closes it.
 */
export function readEspionageReports({ retry = false } = {}) {
    const out = [];
    const spy = (note) => {
        const event = note?.Target ? safe(() => Game.Diplomacy.getDiplomaticEventData(note.Target.id), null) : null;
        const who = event?.initialPlayer ?? note?.Player;
        return safe(() => Locale.compose(Players.get(who).leaderName), "?");
    };
    noteCaughtSpies();
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? []) {
        const note = safe(() => Game.Notifications.find(id), null);
        if (!note || safe(() => Game.Notifications.getTypeName(note.Type), null) !== ESPIONAGE) continue;
        try {
            Game.Notifications.dismiss(id);
        } catch (_e) {
            continue;
        }
        out.push({ key: "ESPIONAGE_SEEN", args: [spy(note)] });
    }
    if (retry && turnBlocker() === ESPIONAGE) {
        const type = safe(() => Game.Notifications.getEndTurnBlockingType(pid()), 0);
        const id = safe(() => Game.Notifications.findEndTurnBlocking(pid(), type), null);
        if (id && typeof Game.Notifications.activate === "function") {
            Game.Notifications.activate(id);
            out.push({ key: "ESPIONAGE_OPENED", args: [] });
        }
    }
    return out;
}

// ---- an ally's call to arms («Союзник ведёт войну»), peace ---------------------------------

const CALL_TO_ARMS = "NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR";
const PEACE_EVERY = 3; // turns between our peace offers to the same leader

/**
 * «Союзник ведёт войну» (NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR: an ally at war calls us to arms)
 * held the turn in game. The autopilot never joins: joining is an ordinary declaration of war
 * (the call-to-arms screen's accept = DECLARE_WAR), a surprise war with war weariness (seen in
 * game). First the notice is only read (dismissed); if the game still holds the turn on the
 * end-of-turn retry, the call is declined as the screen's decline does: CANCEL_ALLIANCE
 * {Player1, Player2, Type: DIPLOMACY_ACTION_FORM_ALLIANCE} with whichever of the two is our ally
 * (screen-diplomacy-call-to-arms.js). The war itself comes from `n.Target.id`, else
 * Game.Diplomacy.getNextCallToArms(us).
 */
export function answerCallsToArms({ retry = false } = {}) {
    const out = [];
    const A = globalThis.DiplomacyActionTypes ?? {};
    const me = safe(() => Players.get(pid()).Diplomacy, null);
    if (!me) return out;
    const name = (id) => safe(() => Locale.compose(Players.get(id).leaderName), String(id));
    const warOf = (n) => {
        const actionID = n?.Target?.id ?? safe(() => Game.Diplomacy.getNextCallToArms(pid()), -1);
        return actionID === undefined || actionID === null || actionID === -1 ? null : safe(() => Game.Diplomacy.getDiplomaticEventData(actionID), null);
    };
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? []) {
        const n = safe(() => Game.Notifications.find(id), null);
        if (!n || safe(() => Game.Notifications.getTypeName(n.Type), null) !== CALL_TO_ARMS) continue;
        const war = warOf(n);
        try {
            Game.Notifications.dismiss(id);
        } catch (_e) {
            // the game may keep it; the retry below declines then
        }
        out.push({ key: "WAR_CALL_SEEN", args: [name(war?.initialPlayer), name(war?.targetPlayer)] });
    }
    if (!retry || turnBlocker() !== CALL_TO_ARMS || PlayerOperationTypes.CANCEL_ALLIANCE === undefined) return out;
    const blocking = safe(() => Game.Notifications.find(Game.Notifications.findEndTurnBlocking(pid(), Game.Notifications.getEndTurnBlockingType(pid()))), null);
    const war = warOf(blocking);
    if (!war) return out;
    // Decision 5 (research/21 G1): always decline, unless the enemy is far away and on another continent
    // and the game allows a formal war: then join as the diplomacy screen declares one (confirmDeclareWar).
    const enemy = [war.targetPlayer, war.initialPlayer].find((p) => p !== undefined && p !== null && p !== pid() && !safe(() => me.hasAllied(p), false));
    const ally = [war.targetPlayer, war.initialPlayer].find((p) => p !== enemy);
    const FORMAL = A.DIPLOMACY_ACTION_DECLARE_FORMAL_WAR;
    if (enemy !== undefined && FORMAL !== undefined && PlayerOperationTypes.DECLARE_WAR !== undefined && mayJoinWar(enemy)) {
        const args = { Player1: pid(), Player2: enemy, Type: FORMAL };
        if (safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.DECLARE_WAR, args, false), null)?.Success) {
            Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.DECLARE_WAR, args);
            out.push({ key: "JOINED_WAR", args: [name(ally), name(enemy)] });
            return out;
        }
    }
    for (const p of [war.targetPlayer, war.initialPlayer]) {
        if (!safe(() => me.hasAllied(p), false)) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CANCEL_ALLIANCE, { Player1: pid(), Player2: p, Type: A.DIPLOMACY_ACTION_FORM_ALLIANCE });
    }
    out.push({ key: "DECLINED_WAR", args: [name(war.initialPlayer), name(war.targetPlayer)] });
    return out;
}

export const JOIN_WAR_DISTANCE = 10; // tiles between our nearest settlement and theirs, at least

/**
 * May we answer an ally's call to arms against `enemy` (decision 5)? Only with a formal war the game
 * allows (canDeclareWarOn FORMAL_WAR, as the diplomacy screen asks), nothing of ours threatened, every
 * enemy settlement on a continent where we have none and more than JOIN_WAR_DISTANCE tiles from ours.
 */
function mayJoinWar(enemy) {
    const W = globalThis.WarTypes?.FORMAL_WAR;
    const me = safe(() => Players.get(pid()), null);
    if (W === undefined || !me || !safe(() => me.Diplomacy.canDeclareWarOn(enemy, W), null)?.Success) return false;
    if ((safe(() => threatenedSettlements(), []) ?? []).length > 0) return false;
    const ours = safe(() => me.Cities.getCities(), []) ?? [];
    const theirs = safe(() => Players.get(enemy).Cities.getCities(), []) ?? [];
    if (ours.length === 0 || theirs.length === 0) return false;
    const continent = (c) => safe(() => GameplayMap.getContinentType(c.location.x, c.location.y), null);
    const home = new Set(ours.map(continent));
    for (const t of theirs) {
        if (home.has(continent(t))) return false;
        const d = Math.min(...ours.map((c) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, t.location.x, t.location.y), 0)));
        if (d <= JOIN_WAR_DISTANCE) return false;
    }
    return true;
}

// Leader -> the turn we last offered them peace.
// ---- peace and deals (research/23 D1, D2) -----------------------------------------------------

const PEACE_BACKOFF = [3, 6, 12]; // turns before asking a leader again after its 1st, 2nd, 3rd+ "no"
const INSPECT_WAIT_MS = 1500;     // the AI answered a deal within a second in game 8 (net_message_debug.log)
const peaceAsk = new Map();       // leader -> { next: turn, refusals, proposedTurn }
const dealAnswers = new Map();    // leader -> { action, inspect, sessionId } (its last DiplomacyStatement about a deal)
const incomingDeals = new Map();  // leader -> { sessionId, turn }: a deal it sent us
const answeredDeals = new Map();  // leader -> the turn we answered its deal
let statementsHooked = false;
let screenProbe = () => false;

/** The hud tells whether a diplomacy screen is open (the game's InterfaceMode is a UI module). */
export function setDiplomacyScreenProbe(fn) {
    screenProbe = typeof fn === "function" ? fn : () => false;
}

/** Is a diplomacy screen (a deal, a leader's dialog, the diplomacy hub) open now? */
export const diplomacyScreenOpen = () => !!safe(() => screenProbe(), false);

/** Leaders whose deal we answered this turn: the pop-up closer closes their deal screen. */
export function answeredDealPlayers() {
    return new Set([...answeredDeals].filter(([, turn]) => turn === Game.turn).map(([id]) => id));
}

/** Forgets the peace asks and deals (tests: a fresh game). */
export function resetPeace() {
    for (const m of [peaceAsk, dealAnswers, incomingDeals, answeredDeals, peaceHeld]) m.clear();
}

const peaceHeld = new Map(); // leader -> the campaign whose assault holds our peace proposals back (said once)

const backoff = (refusals) => PEACE_BACKOFF[Math.max(0, Math.min(refusals, PEACE_BACKOFF.length) - 1)];

/**
 * The game's statements about deals (diplomacy-manager.js handleDealStatement): an answer to our
 * inspected deal (RespondingToDealAction INSPECT: shown by nobody), a refusal of our proposal, or a deal
 * a leader proposes to us.
 */
function hookStatements() {
    if (statementsHooked) return;
    statementsHooked = true;
    safe(() => engine.on("DiplomacyStatement", (data) => {
        const v = data?.values;
        const P = globalThis.DiplomacyDealProposalActions;
        if (!v || !P || v.ToPlayer !== pid() || v.DealAction === undefined || v.DealAction === -1) return;
        const from = v.FromPlayer;
        const inspect = v.RespondingToDealAction === P.INSPECT;
        dealAnswers.set(from, { action: v.DealAction, inspect, sessionId: data.sessionId });
        if (inspect) return;
        if (v.DealAction === P.REJECTED) {
            const ask = peaceAsk.get(from) ?? { next: -Infinity, refusals: 0 };
            ask.refusals++;
            ask.next = Game.turn + backoff(ask.refusals);
            peaceAsk.set(from, ask);
        } else if (v.DealAction === P.PROPOSED || v.DealAction === P.ADJUSTED) {
            incomingDeals.set(from, { sessionId: data.sessionId, turn: Game.turn });
        }
    }), null);
}

/** Waits up to `ms` for a leader's answer to our inspected deal. @returns { action, sessionId } or null */
async function inspectAnswer(id, ms) {
    for (let waited = 0; waited <= ms; waited += 50) {
        const a = dealAnswers.get(id);
        if (a?.inspect) return a;
        await sleep(50);
    }
    return null;
}

/**
 * A deal a leader sent us (research/23 D1: game 8, Prussia offered plain peace; nothing in the autopilot
 * could answer, the turn's end was refused 15 times in 30 s, and the war went on): a peace that asks no
 * settlement and at most DEAL_GIVE_SHARE of our gold and Influence (core/xpl-deals.js) is accepted, as the
 * deal screen's accept sends it (sendWorkingDeal(id, ACCEPTED)); any other deal is rejected, so it never
 * holds the turn. Read like the peace screen reads it: the working deal {OUTGOING, player1: us, player2:
 * them} (the game turned the incoming deal into one), its items by getWorkingDealItem. With «Наступление» (research/37 §9E)
 * a peace that does not give back the settlement our assault is retaking waits while that assault makes progress
 * (peaceIntentFor: CONTINUE); one that gives it back is taken (no unrest either: Civilopedia 1481).
 */
export function answerIncomingDeals({ offensive = false } = {}) {
    hookStatements();
    const out = [];
    const D = globalThis.Game?.DiplomacyDeals;
    const P = globalThis.DiplomacyDealProposalActions;
    const I = globalThis.DiplomacyDealItemTypes;
    if (!D || !P || !I || globalThis.DiplomacyDealDirection === undefined) return out;
    const me = safe(() => Players.get(pid()), null);
    const T = { AGREEMENTS: I.AGREEMENTS, CITIES: I.CITIES, GOLD: I.GOLD, INFLUENCE: I.INFLUENCE, MAKE_PEACE: globalThis.DiplomacyDealItemAgreementTypes?.MAKE_PEACE };
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid() || answeredDeals.get(p.id) === Game.turn) continue;
        // Ours waits for their answer (the same turn we proposed it): not theirs to answer.
        const ours = peaceAsk.get(p.id)?.proposedTurn === Game.turn && !incomingDeals.has(p.id);
        if (ours || !(incomingDeals.has(p.id) || safe(() => D.hasPendingDeal(pid(), p.id), false))) continue;
        const id = { direction: DiplomacyDealDirection.OUTGOING, player1: pid(), player2: p.id };
        const deal = safe(() => D.getWorkingDeal(id), null);
        const items = (deal?.itemIds ?? []).map((i) => safe(() => D.getWorkingDealItem(id, i), null)).filter(Boolean);
        if (items.length === 0) continue;
        const v = judgeDeal(items, {
            me: pid(), T,
            gold: Number(safe(() => Players.Treasury.get(pid()).goldBalance, null) ?? safe(() => me.Treasury.goldBalance, 0)) || 0,
            influence: Number(safe(() => me.DiplomacyTreasury.diplomacyBalance, 0)) || 0,
        });
        const held = (offensive && v.accept && v.gives.cities === 0 && peaceIntentFor(p.id) === "CONTINUE")
            // Our training war goes on until it ends by its own rules (research/41 §7D); a settlement for it is taken.
            || (v.accept && v.gives.cities === 0 && trainingWarEnemy() === p.id);
        const accept = v.accept && !held;
        safe(() => D.sendWorkingDeal(id, accept ? P.ACCEPTED : P.REJECTED), null);
        answeredDeals.set(p.id, Game.turn);
        incomingDeals.delete(p.id);
        const leader = safe(() => Locale.compose(p.leaderName), String(p.id));
        log.warn(`deal: ${leader} offers ${v.peace ? "peace" : "no peace"}, asking ${v.asks.cities} settlement(s), ${v.asks.gold} gold, ${v.asks.influence} Influence, giving ${v.gives.cities} settlement(s): ${accept ? "accepted" : held ? "rejected (our assault goes on)" : "rejected"}`);
        if (held && trainingWarEnemy() === p.id) {
            out.push({ key: "TRAINING_PEACE_HELD", args: [leader] });
        } else if (held) {
            out.push({ key: "PEACE_HELD", args: [leader, campaignState()?.target?.name ?? "?"] });
        } else if (accept) {
            peaceAsk.delete(p.id);
            out.push({ key: "PEACE_ACCEPTED", args: [leader] });
        } else {
            out.push({ key: "DEAL_REJECTED", args: [leader, v.asks.cities, Math.round(v.asks.gold), Math.round(v.asks.influence)] });
        }
    }
    return out;
}

/**
 * Peace with every leader at war with us, white peace (nothing given or asked), as the game's peace
 * screen does it (panel-diplomacy-peace-deal.js): only when Diplomacy.canMakePeaceWith(them).Success, no
 * deal is pending (Game.DiplomacyDeals.hasPendingDeal) and no diplomacy screen is open; the working deal
 * {direction: OUTGOING, player1: us, player2: them} with the one item {type: AGREEMENTS, agreementType:
 * MAKE_PEACE} is first sent INSPECT — the AI answers privately, nothing is shown — and PROPOSED only when it
 * would accept (research/23 D2: game 8, 8 white peaces proposed blindly, 8 refusals, each one a leader's
 * dialog and a refused end of turn). A "no" waits PEACE_BACKOFF 3, 6, then 12 turns. No answer at all
 * (the game may not answer a script's inspect: probe): proposed, and the next ask waits as after a "no". With «Наступление»
 * (research/37 §9E) none is proposed to a leader whose settlement our assault is retaking while it makes progress
 * (peaceIntentFor: CONTINUE); said once a campaign.
 */
export async function seekPeace({ offensive = false } = {}) {
    hookStatements();
    const out = [];
    const D = globalThis.Game?.DiplomacyDeals;
    const P = globalThis.DiplomacyDealProposalActions;
    const me = safe(() => Players.get(pid()), null);
    if (!D || !P || !me?.Diplomacy || globalThis.DiplomacyDealItemAgreementTypes?.MAKE_PEACE === undefined) return out;
    if (diplomacyScreenOpen()) return out;
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid() || !safe(() => me.Diplomacy.isAtWarWith(p.id), false)) continue;
        // Our training war: peace waits until it ends by its own rules (research/41 §7D).
        if (trainingWarEnemy() === p.id) {
            if (peaceHeld.get(p.id) !== "training") {
                peaceHeld.set(p.id, "training");
                out.push({ key: "TRAINING_PEACE_HELD", args: [safe(() => Locale.compose(p.leaderName), String(p.id))] });
            }
            continue;
        }
        if (offensive && peaceIntentFor(p.id) === "CONTINUE") {
            const c = campaignState();
            if (peaceHeld.get(p.id) !== c?.id) {
                peaceHeld.set(p.id, c?.id);
                const leader = safe(() => Locale.compose(p.leaderName), String(p.id));
                log.info(`peace: not with ${leader} yet: our assault on ${c?.target?.name ?? "?"} made progress on turn ${c?.progressTurn}`);
                out.push({ key: "PEACE_HELD", args: [leader, c?.target?.name ?? "?"] });
            }
            continue;
        }
        const ask = peaceAsk.get(p.id) ?? { next: -Infinity, refusals: 0 };
        if (Game.turn < ask.next) continue;
        if (!safe(() => me.Diplomacy.canMakePeaceWith(p.id), null)?.Success) continue;
        if (safe(() => D.hasPendingDeal(pid(), p.id), false)) continue;
        const deal = { direction: DiplomacyDealDirection.OUTGOING, player1: pid(), player2: p.id };
        const leader = safe(() => Locale.compose(p.leaderName), String(p.id));
        // Our settlements they hold are asked back first (research/game48: Киото, lost at A59, stayed Amina's after a white
        // peace at A62; a settlement received in a peace deal has no unrest); refused, a white peace is inspected next.
        const peace = () => {
            D.clearWorkingDeal(deal);
            D.addItemToWorkingDeal(deal, { type: DiplomacyDealItemTypes.AGREEMENTS, agreementType: DiplomacyDealItemAgreementTypes.MAKE_PEACE });
        };
        try {
            peace();
        } catch (_e) {
            continue;
        }
        const inspect = async () => {
            dealAnswers.delete(p.id);
            safe(() => D.sendWorkingDeal(deal, P.INSPECT), null);
            return inspectAnswer(p.id, INSPECT_WAIT_MS);
        };
        let back = settlementsToAskBack(deal, p.id);
        for (const item of back) safe(() => D.addItemToWorkingDeal(deal, item), null);
        let answer = await inspect();
        if (back.length > 0 && answer && answer.action !== P.ACCEPTED) {
            if (answer.sessionId !== undefined && answer.sessionId !== null) safe(() => Game.DiplomacySessions.closeSession(answer.sessionId), null);
            log.info(`peace: ${leader} would refuse a peace giving back ${back.map((i) => settlementName(i.cityId)).join(", ")}; a white peace next`);
            back = [];
            try {
                peace();
            } catch (_e) {
                continue;
            }
            answer = await inspect();
        }
        if (answer && answer.action !== P.ACCEPTED) {
            ask.refusals++;
            ask.next = Game.turn + backoff(ask.refusals);
            peaceAsk.set(p.id, ask);
            if (answer.sessionId !== undefined && answer.sessionId !== null) safe(() => Game.DiplomacySessions.closeSession(answer.sessionId), null);
            log.info(`peace: ${leader} would refuse a white peace; asking again on turn ${ask.next}`);
            continue;
        }
        if (!answer) log.warn(`peace: no answer from ${leader} to our inspected deal within ${INSPECT_WAIT_MS} ms; proposing it`);
        safe(() => D.sendWorkingDeal(deal, P.PROPOSED), null);
        if (!answer) ask.refusals++;
        ask.next = Game.turn + (answer ? PEACE_EVERY : backoff(ask.refusals));
        ask.proposedTurn = Game.turn;
        peaceAsk.set(p.id, ask);
        if (back?.length > 0) log.info(`peace: proposed to ${leader}, giving back ${back.map((i) => settlementName(i.cityId)).join(", ")}`);
        out.push({ key: "PEACE_PROPOSED", args: [leader] });
    }
    return out;
}

/**
 * Their settlements that were ours (`city.originalOwner`, the game's own record), as the peace screen offers them from that
 * leader: `Game.DiplomacyDeals.getPossibleWorkingDealItems(deal, them, CITIES)` items of subType OFFER, added as they are
 * (panel-diplomacy-peace-deal.js moveDealItem). @returns [deal item]
 */
function settlementsToAskBack(deal, them) {
    const OFFER = globalThis.DiplomacyDealItemCityTransferTypes?.OFFER;
    const CITIES = globalThis.DiplomacyDealItemTypes?.CITIES;
    if (OFFER === undefined || CITIES === undefined) return [];
    const items = safe(() => Game.DiplomacyDeals.getPossibleWorkingDealItems(deal, them, CITIES), []) ?? [];
    const back = items.filter((i) => i?.cityId && i.subType === OFFER && safe(() => Cities.get(i.cityId)?.originalOwner, -1) === pid());
    // After our training war (research/41 §9 decision 3): their town nearest us, while our War Support leads by
    // ASK_SUPPORT_GAP and the settlement cap has room (a settlement received in a deal has no unrest).
    if (trainingFoes.has(them)) {
        const stats = safe(() => Players.get(pid()).Stats, null);
        const room = (Number(stats?.settlementCap) || 0) - (Number(stats?.numSettlements) || 0);
        if ((warSupportNet(them)?.net ?? 0) >= TRAINING.ASK_SUPPORT_GAP && room > back.length) {
            const centres = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location).filter(Boolean);
            const near = (c) => Math.min(Infinity, ...centres.map((o) => safe(() => GameplayMap.getPlotDistance(o.x, o.y, c.location.x, c.location.y), Infinity)));
            const town = items.filter((i) => i?.cityId && i.subType === OFFER && !back.includes(i) && safe(() => Cities.get(i.cityId)?.isTown, false))
                .map((i) => ({ i, d: safe(() => near(Cities.get(i.cityId)), Infinity) })).sort((a, b) => a.d - b.d)[0];
            if (town) back.push(town.i);
        }
    }
    return back;
}

const settlementName = (id) => safe(() => Locale.compose(Cities.get(id).name), "?");

// ---- «Учебная война»: a training war on a weak neighbour (research/41 §7) --------------------------------------------------

const trainingDenounced = new Map(); // leader -> { n, turn } denunciations for a training war this age
const trainingFoes = new Set();      // leaders of our training wars this game (the peace deal may ask for a town)
let trainingNoted = -1;              // the turn UI.log said why no training war starts
const TRAINING_NOTE_EVERY = 10;
// A War Support point's price before the war (the declare-war rows: 60 / 120 / 180 by age; research/41-notes/politics.md).
const SUPPORT_PRICE = { AGE_ANTIQUITY: 60, AGE_EXPLORATION: 120, AGE_MODERN: 180 };

export function resetTrainingWar() {
    trainingDenounced.clear();
    trainingFoes.clear();
    trainingNoted = -1;
}

/** Our War Support kept ahead of theirs: a point bought when theirs reaches ours and its price fits (core supportWanted). */
function buyWarSupport(enemy) {
    const s = warSupportNet(enemy);
    const OP = globalThis.PlayerOperationTypes?.SUPPORT_DIPLOMATIC_ACTION;
    const TOKEN = globalThis.DiplomacyTokenTypes?.DIPLOMACY_TOKEN_GLOBAL;
    if (!s || OP === undefined || TOKEN === undefined) return [];
    const price = Number(safe(() => Game.Diplomacy.getInfluenceForNextSupport(s.id, pid(), s.initial), 0)) || 0;
    const spare = Number(safe(() => Players.get(pid()).DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    if (!supportWanted({ net: s.net, price, spare })) return [];
    const args = { ID: s.id, Type: TOKEN, Amount: 1, SubType: s.initial };
    if (!safe(() => Game.PlayerOperations.canStart(pid(), OP, args, false), null)?.Success) return [];
    Game.PlayerOperations.sendRequest(pid(), OP, args);
    const leader = safe(() => Locale.compose(Players.get(enemy).leaderName), String(enemy));
    log.info(`training war: ${leader}: War Support bought for ${price} (ours ${s.net} ahead before)`);
    return [{ key: "WAR_SUPPORT_BOUGHT", args: [leader, price] }];
}

/**
 * «Учебная война» (research/41 §7; the user, 21 October: "one close nation much weaker than us, optional, without making
 * us much slower"), once a full pass with «Оборона»: under way, our War Support kept ahead of theirs; else the nearest met
 * major that core trainingTarget accepts (weak, close, alone, Hostile so the war is Formal, our side and the time right,
 * the soldiers ready) gets a Formal war, and the army gathers from the next pass (planTrainingWar); one Neutral or
 * Unfriendly is denounced toward Hostile (2 times, 4 when very weak, 10 turns apart). One a game age; never a surprise war.
 * @param f { threats, war: steps.warState(), watch, afterWin, strategy, focus, ageTurnsLeft }
 * @returns log entries
 */
export function trainingWarStep(s, f = {}) {
    const out = [];
    const on = !!s?.autopilot?.trainingWar && !!s?.autopilot?.defend;
    if (!on) {
        if (trainingWarEnemy() !== null) out.push(...endTrainingWar("OFF"));
        return out;
    }
    const enemy = trainingWarEnemy();
    if (enemy !== null) return buyWarSupport(enemy);
    const me = safe(() => Players.get(pid()), null);
    if (!me) return out;
    const age = safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null);
    const note = (text) => {
        if (Game.turn - trainingNoted < TRAINING_NOTE_EVERY && trainingNoted <= Game.turn) return;
        trainingNoted = Game.turn;
        log.info(`training war: none: ${text}`);
    };
    const doneThisAge = safe(() => settings.recall(gameKey(), "trainingWarAge"), null) === age;
    const ready = readinessForWar();
    const readyOk = !!ready && ready.commander && ready.free >= TRAINING.MIN_UNITS && ready.melee >= TRAINING.MIN_MELEE;
    const readyWhy = !ready ? "no unit step this turn" : `${ready.free} free soldiers (${ready.melee} melee), ${ready.commander ? "a" : "no"} free commander`;
    const ours = landStrength(me);
    const ourProduction = Number(safe(() => me.Stats.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0;
    const ourSettlements = Number(safe(() => me.Stats.numSettlements, 0)) || 0;
    const centres = (safe(() => me.Cities.getCities(), []) ?? []).map((c) => c.location).filter(Boolean);
    const majors = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMajor && p.id !== pid());
    const FORMAL = globalThis.WarTypes?.FORMAL_WAR;
    const REL = globalThis.DiplomacyPlayerRelationships ?? {};
    const relName = (id) => ["HOSTILE", "UNFRIENDLY", "NEUTRAL", "FRIENDLY", "HELPFUL"].find((n) => REL[`PLAYER_RELATIONSHIP_${n}`] === safe(() => me.Diplomacy.getRelationshipEnum(id), null)) ?? "NEUTRAL";
    const watch = f.watch ?? [];
    const balance = Number(safe(() => me.DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    const candidates = [];
    for (const p of majors) {
        if (!safe(() => me.Diplomacy.hasMet(p.id), false)) continue;
        const theirs = landStrength(p);
        const cities = (safe(() => p.Cities.getCities(), []) ?? []).filter((c) => c?.location);
        let distance = Infinity;
        for (const c of cities) for (const o of centres) distance = Math.min(distance, safe(() => GameplayMap.getPlotDistance(o.x, o.y, c.location.x, c.location.y), Infinity));
        const facts = {
            met: true, atPeace: !safe(() => me.Diplomacy.isAtWarWith(p.id), false), ally: !!safe(() => me.Diplomacy.hasAllied(p.id), false),
            cityState: !!p.isMinor, relation: relName(p.id),
            formalOk: FORMAL !== undefined && !!safe(() => me.Diplomacy.canDeclareWarOn(p.id, FORMAL), null)?.Success,
            theirSoldiers: theirs.all, ourSoldiers: ours.all, theirBest: theirs.best, ourBest: ours.best,
            theirProduction: Number(safe(() => p.Stats.getNetYield(YieldTypes.YIELD_PRODUCTION), 0)) || 0, ourProduction,
            theirSettlements: Number(safe(() => p.Stats.numSettlements, 0)) || cities.length, ourSettlements, distance,
            thirdAlly: majors.some((x) => x.id !== p.id && !!safe(() => p.Diplomacy.hasAllied(x.id), false)),
            threatened: (f.threats ?? []).length > 0, otherWar: (f.war?.atWar ?? []).length > 0,
            otherRisk: (f.war?.risk ?? []).some((id) => id !== p.id),
            supportOurs: Number(safe(() => me.Diplomacy.getTotalWarSupportBonusForPlayer(p.id, true), 0)) || 0,
            supportTheirs: Number(safe(() => me.Diplomacy.getTotalWarSupportBonusForTarget(p.id, true), 0)) || 0,
            influenceSpare: balance, supportPrice: SUPPORT_PRICE[age] ?? 0,
            ageTurn: Game.turn, ageTurnsLeft: Number.isFinite(f.ageTurnsLeft) ? f.ageTurnsLeft : 999,
            // Modern's ideologies (shared: no war; opposing: no peace) are not read: no training war in the final age.
            ideologyBlock: !!safe(() => Game.AgeProgressManager.isFinalAge, false),
            warsThisAge: doneThisAge ? 1 : 0, outcomeOpen: !f.afterWin,
            ownChance: watch.some((w) => w.own && w.level === "CHANCE"), rivalDanger: watch.some((w) => !w.own && w.level === "DANGER"),
            spaceFinal: f.strategy?.phase === "COMMIT" && f.focus === "SCIENCE", ready: readyOk, readyWhy,
        };
        candidates.push({ p, facts, res: trainingTarget(facts) });
    }
    candidates.sort((a, b) => a.facts.distance - b.facts.distance);
    const leader = (p) => safe(() => Locale.compose(p.leaderName), String(p.id));
    const target = candidates.find((c) => c.res.why === null);
    if (target) {
        const DECLARE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_DECLARE_FORMAL_WAR;
        const OP = globalThis.PlayerOperationTypes?.DECLARE_WAR;
        const args = { Player1: pid(), Player2: target.p.id, Type: DECLARE };
        if (DECLARE === undefined || OP === undefined || !safe(() => Game.PlayerOperations.canStart(pid(), OP, args, false), null)?.Success) {
            note(`${leader(target.p)}: the game refuses a formal war now`);
            return out;
        }
        Game.PlayerOperations.sendRequest(pid(), OP, args);
        planTrainingWar(target.p.id);
        trainingFoes.add(target.p.id);
        safe(() => settings.remember(gameKey(), { trainingWarAge: age }), null);
        const t = target.facts;
        log.warn(`training war: declared on ${leader(target.p)}: soldiers ${t.theirSoldiers} against our ${t.ourSoldiers}, best melee ${t.theirBest}/${t.ourBest}, production ${Math.round(t.theirProduction)}/${Math.round(t.ourProduction)}, settlements ${t.theirSettlements}/${t.ourSettlements}, ${t.distance} tiles; War Support ${t.supportOurs} against ${t.supportTheirs}; ${readyWhy}`);
        out.push({ key: "TRAINING_WAR_DECLARED", args: [leader(target.p)] });
        return out;
    }
    // Toward Hostile: denounce the nearest one that would be a target but for the relationship.
    const DENOUNCE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_DENOUNCE;
    const toHostile = candidates.find((c) => c.res.why === "relation" && c.res.need === "DENOUNCE");
    if (toHostile && DENOUNCE !== undefined) {
        const d = trainingDenounced.get(toHostile.p.id) ?? { n: 0, turn: -Infinity, age };
        if (d.age !== age) Object.assign(d, { n: 0, turn: -Infinity, age });
        if (denounceAllowed({ denounced: d.n, lastTurn: d.turn, turn: Game.turn, veryWeak: toHostile.res.veryWeak }) && startAction(toHostile.p.id, DENOUNCE)) {
            trainingDenounced.set(toHostile.p.id, { n: d.n + 1, turn: Game.turn, age });
            log.warn(`training war: denounced ${leader(toHostile.p)} (${d.n + 1}; relation ${toHostile.facts.relation}) toward a formal war`);
            out.push({ key: "DENOUNCED", args: [leader(toHostile.p)] });
            return out;
        }
    }
    const nearest = candidates.find((c) => Number.isFinite(c.facts.distance)) ?? candidates[0];
    note(nearest ? `${leader(nearest.p)} (${nearest.facts.distance} tiles): ${nearest.res.why}` : "no met major");
    return out;
}


// ---- diplomacy with other leaders («Дипломатия») ---------------------------------------------

const RELATION_RANK = ["HOSTILE", "UNFRIENDLY", "NEUTRAL", "FRIENDLY", "HELPFUL"];
// The priority's own endeavors («Инициативы»): they come first (endeavorsOffered).
const ENDEAVOR_FOR_PROFILE = {
    SCIENCE: ["RESEARCH_COLLABORATION"], CULTURE: ["CULTURAL_EXCHANGE", "WONDER_CONSTRUCTION"], GOLD: ["MINOR_TRADE"],
    PRODUCTION: ["MINOR_TRADE"], FOOD: ["FARMERS_MARKET"], HAPPINESS: ["LOCAL_FESTIVALS"],
};

/**
 * Leaders whose spy action against us is reported (NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE →
 * getDiplomaticEventData: initialPlayer, targetPlayer, revealed). The notice also comes for our
 * own spies caught, and an unrevealed spy is "an unknown leader" in the game's text: neither counts.
 */
function noteCaughtSpies() {
    for (const n of notificationsOf(ESPIONAGE)) {
        const e = n.Target ? safe(() => Game.Diplomacy.getDiplomaticEventData(n.Target.id), null) : null;
        if (!e || e.targetPlayer !== pid() || e.initialPlayer === pid() || e.revealed === false) continue;
        if (Number.isInteger(e.initialPlayer) && e.initialPlayer >= 0) {
            caughtSpies.add(e.initialPlayer);
            hostileActsSeen.set(e.initialPlayer, Game.turn);
            spiesSeen.set(e.initialPlayer, Game.turn);
        }
    }
}

const hostileActsSeen = new Map(); // leader -> the last turn its espionage or a sanction hit us (research/23 D3, D10)
const spiesSeen = new Map();       // leader -> the last turn its revealed espionage hit us (W9)
const counterStarted = new Map();  // leader -> the turn our last counter-spy against it started
export const COUNTER_SPY_RENEW_TURNS = 30; // a revealed spy this recent: our counter-spy is renewed...
export const COUNTER_SPY_TURNS = 20;       // ...once the last one has run out (its BaseDuration)

/** An espionage action or a sanction (GameInfo.DiplomacyActions' group, else its type's name)? @returns "ESPIONAGE" | "SANCTION" | null */
function actionKind(actionType) {
    const row = safe(() => GameInfo.DiplomacyActions.lookup(actionType), null);
    const T = globalThis.DiplomacyActionTypes ?? {};
    const name = String(row?.DiplomacyActionType ?? Object.keys(T).find((k) => T[k] === actionType) ?? "");
    const group = String(row?.DiplomacyActionGroup ?? "");
    if (name.endsWith("_COUNTER_SPY")) return null;
    if (group.endsWith("_ESPIONAGE") || name.includes("_ESPIONAGE_")) return "ESPIONAGE";
    if (group.endsWith("_SANCTION") || name.includes("_SABOTAGE_")) return "SANCTION";
    return null;
}

/**
 * A rival's espionage or sanction against us (an event the game reports or shows under way): remembered as a
 * hostile act, and a revealed spy's leader gets our counter-spy (research/23 D10: game 8, Prussia's sabotage
 * came as proposals to answer, NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED, and no counter-spy ever ran).
 */
function noteHostileAct(event) {
    if (!event || event.targetPlayer !== pid() || event.initialPlayer === pid()) return null;
    if (!Number.isInteger(event.initialPlayer) || event.initialPlayer < 0) return null;
    const kind = actionKind(event.actionType);
    if (!kind || (kind === "ESPIONAGE" && event.revealed === false)) return null;
    hostileActsSeen.set(event.initialPlayer, Game.turn);
    if (kind === "ESPIONAGE") {
        caughtSpies.add(event.initialPlayer);
        spiesSeen.set(event.initialPlayer, Game.turn);
    }
    return kind;
}

/** Leaders whose espionage or sanctions hit us: id -> the last turn (reports seen, and actions under way against us). */
// ---- probes for a training war (research/41 §2: P-WAR-1, P-STAT-1; UI.log only) ----------------------------------

const warProbeNoted = new Map(); // leader id -> its last war-readiness line
let statsProbed = -999;          // the turn P-STAT-1 last wrote
const STATS_EVERY = 10;

/** A player's land soldiers (commanders aside), those we see, and the best melee Combat among them (GameInfo.Unit_Stats). */
function landStrength(p) {
    const VISIBLE = globalThis.RevealedStates?.VISIBLE;
    let all = 0;
    let seen = 0;
    let best = 0;
    for (const u of safe(() => p.Units.getUnits(), []) ?? []) {
        const def = safe(() => GameInfo.Units.lookup(u.type), null);
        if (def?.Domain !== "DOMAIN_LAND" || def.CoreClass !== "CORE_CLASS_MILITARY" || u.isCommanderUnit) continue;
        all++;
        if (p.id === pid() || (VISIBLE !== undefined && u.location && safe(() => GameplayMap.getRevealedState(pid(), u.location.x, u.location.y), null) === VISIBLE)) seen++;
        const st = safe(() => GameInfo.Unit_Stats.lookup(def.UnitType), null);
        if (!(Number(st?.RangedCombat) > 0) && !(Number(st?.Bombard) > 0)) best = Math.max(best, Number(st?.Combat) || 0);
    }
    return { all, seen, best };
}

/**
 * P-WAR-1: for each met major at peace with us, what the game's declare-war popup reads (diplomacy-manager.js
 * raiseWarTypePopup): a surprise and a formal war allowed (with the reasons), the war support of each side and the
 * Influence the target would get; written when it changes. P-STAT-1, every 10 turns: each major's production and gold a
 * turn (Stats.getNetYield, as the diplomacy ribbon reads them), settlements, land soldiers (all and seen) and its best
 * melee strength, ours first. Only the reads the game's own UI makes (gotcha 75): not the executable's Stats getters that
 * no screen calls.
 */
export function probeWars() {
    const me = safe(() => Players.get(pid()), null);
    if (!me) return;
    const FORMAL = globalThis.WarTypes?.FORMAL_WAR;
    const REL = globalThis.DiplomacyPlayerRelationships ?? {};
    const name = (id) => safe(() => Locale.compose(Players.get(id).leaderName), String(id));
    const why = (r) => (r ? `${r.Success ? "yes" : "no"}${!r.Success && r.FailureReasons?.length ? ` (${r.FailureReasons.join("; ")})` : ""}` : "?");
    const majors = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isMajor && p.id !== pid() && safe(() => me.Diplomacy.hasMet(p.id), false));
    for (const p of majors) {
        if (safe(() => me.Diplomacy.isAtWarWith(p.id), false)) continue;
        const surprise = safe(() => me.Diplomacy.canDeclareWarOn(p.id), null);
        const formal = FORMAL === undefined ? null : safe(() => me.Diplomacy.canDeclareWarOn(p.id, FORMAL), null);
        const isFormal = !!formal?.Success;
        const relation = safe(() => me.Diplomacy.getRelationshipEnum(p.id), null);
        const rel = RELATION_RANK.find((n) => REL[`PLAYER_RELATIONSHIP_${n}`] === relation) ?? relation;
        const line = `war probe: p${p.id} ${name(p.id)}: ${rel}; surprise war ${why(surprise)}; formal war ${why(formal)}; war support ours ${safe(() => me.Diplomacy.getTotalWarSupportBonusForPlayer(p.id, isFormal), "?")} theirs ${safe(() => me.Diplomacy.getTotalWarSupportBonusForTarget(p.id, isFormal), "?")}; their Influence +${safe(() => me.Diplomacy.getWarInfluenceBonusTarget(p.id, isFormal), "?")}`;
        if (warProbeNoted.get(p.id) !== line) log.info(line);
        warProbeNoted.set(p.id, line);
    }
    const turn = safe(() => Game.turn, 0);
    if (turn - statsProbed < STATS_EVERY && turn >= statsProbed) return;
    statsProbed = turn;
    const Y = globalThis.YieldTypes ?? {};
    for (const p of [me, ...majors]) {
        const s = landStrength(p);
        const yieldOf = (y) => Math.round(Number(safe(() => p.Stats.getNetYield(Y[y]), NaN)));
        log.info(`war probe: stats T${turn} p${p.id}${p.id === pid() ? " (us)" : ` ${name(p.id)}`}: production ${yieldOf("YIELD_PRODUCTION")}, gold ${yieldOf("YIELD_GOLD")} a turn, settlements ${safe(() => p.Stats.numSettlements, "?")}, land soldiers ${s.all} (${s.seen} seen), best melee ${s.best}`);
    }
}

export function hostileActs() {
    for (const e of safe(() => Game.Diplomacy.getPlayerEvents(pid()), []) ?? []) noteHostileAct(e);
    return hostileActsSeen;
}

/** Tiles between our settlements and another player's (nearest pair). */
function distanceToUs(p) {
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    let best = Infinity;
    for (const c of safe(() => p.Cities.getCities(), []) ?? []) {
        for (const o of ours) best = Math.min(best, safe(() => GameplayMap.getPlotDistance(o.x, o.y, c.location.x, c.location.y), Infinity));
    }
    return best;
}

/**
 * Diplomacy with other leaders («Дипломатия» option). One start of each kind per pass, only what
 * the game offers now (PROJECT_AVAILABLE, canStart) and the Influence pays for, with the diplomacy
 * panel's quick start {Amount: 1, Player1, Type, Player2, ID} (panel-diplomacy-actions.js):
 *  - «Контршпионаж» (DIPLOMACY_ACTION_COUNTER_SPY; from the Exploration age) against a leader whose
 *    spy was caught against us, unless one already runs against them;
 *  - «Примирение» (SEND_DELEGATION, no unlock needed) with a leader who is Unfriendly or Hostile;
 *  - a steal of a technology (science) or civic (culture) from the Neutral-or-better leader with the
 *    most science (research/40 B6), one at a time;
 *  - an endeavor («Инициатива»): the one worth most of those the game offers (research/40 A4; the
 *    priority's own first), with a leader not approached this age first, then the one we stand worst
 *    with (not Hostile: the game allows none).
 *    Endeavors and reconciliation raise the relationship.
 * All but the counter-spy spend only the Influence above what befriending keeps this pass (befriendReserve: a threatening
 * independent's price while we save for it; game 60: any threat stopped all of them, 2 endeavors and 0 steals in 140 turns,
 * while the threatening villages could not be befriended at all). Never with a leader at war with us; worst relationship
 * first, then nearest.
 */
export function tendDiplomacy(settings) {
    const out = [];
    const A = globalThis.DiplomacyActionTypes ?? {};
    const me = safe(() => Players.get(pid()), null);
    if (!me?.Diplomacy) return out;
    noteCaughtSpies();
    const leaderName = (id) => safe(() => Locale.compose(Players.get(id).leaderName), String(id));
    const actionName = (type) => safe(() => Locale.compose(GameInfo.DiplomacyActions.lookup(type).Name), String(type));
    const start = startAction;
    // 1. Counter-spy against a caught spy's leader.
    const running = (target) => (safe(() => Game.Diplomacy.getPlayerEvents(pid()), []) ?? [])
        .some((e) => e.initialPlayer === pid() && e.actionType === A.DIPLOMACY_ACTION_COUNTER_SPY && e.targetPlayer === target);
    // Renewed against a leader whose spy hit us within COUNTER_SPY_RENEW_TURNS once ours has run out (research/24 W9:
    // Catherine's steals succeeded at M40, M49 and M66; no counter-spy after M35).
    const renew = [...spiesSeen].filter(([id, t]) => Game.turn - t <= COUNTER_SPY_RENEW_TURNS && Game.turn - (counterStarted.get(id) ?? -Infinity) >= COUNTER_SPY_TURNS).map(([id]) => id);
    for (const spy of new Set([...caughtSpies, ...renew])) {
        if (running(spy)) {
            caughtSpies.delete(spy);
            continue;
        }
        if (start(spy, A.DIPLOMACY_ACTION_COUNTER_SPY)) {
            caughtSpies.delete(spy);
            counterStarted.set(spy, Game.turn);
            out.push({ key: "COUNTER_SPY", args: [leaderName(spy)] });
        }
    }
    const reserve = reserveNow();
    const REL = globalThis.DiplomacyPlayerRelationships ?? {};
    const rank = (id) => {
        const v = safe(() => me.Diplomacy.getRelationshipEnum(id), null);
        const i = RELATION_RANK.findIndex((n) => REL[`PLAYER_RELATIONSHIP_${n}`] === v);
        return i < 0 ? 2 : i;
    };
    const leaders = (safe(() => Players.getAlive(), []) ?? [])
        .filter((p) => p?.isMajor && p.id !== pid() && safe(() => me.Diplomacy.hasMet(p.id), false) && !safe(() => me.Diplomacy.isAtWarWith(p.id), false))
        .map((p) => ({ id: p.id, rank: rank(p.id), level: Number(safe(() => me.Diplomacy.getRelationshipLevel(p.id), 0)) || 0, d: distanceToUs(p) }))
        .sort((a, b) => a.rank - b.rank || a.level - b.level || a.d - b.d);
    // 2. Reconciliation with an Unfriendly or Hostile leader.
    for (const l of leaders) {
        if (l.rank > 1) break;
        if (start(l.id, A.DIPLOMACY_ACTION_SEND_DELEGATION, reserve)) {
            out.push({ key: "RECONCILE", args: [leaderName(l.id)] });
            break;
        }
    }
    // 3. Espionage for the focus's research (research/40 B6: game 41's rivals stole 45 technologies and 36 civics from us, we
    // none): a technology for science, a civic for culture, from the leader with the most science of those Neutral or
    // better (a spy revealed costs relationship), one of ours at a time, from the Influence above befriending's reserve.
    const stealType = A[STEAL_FOR_FOCUS[focusOfProfile(settings?.profile)]];
    if (stealType !== undefined && !ourActionRunning(stealType)) {
        const science = (id) => Number(safe(() => Players.get(id).Stats.getNetYield(YieldTypes.YIELD_SCIENCE), 0)) || 0;
        for (const l of [...leaders].filter((x) => x.rank >= 2).sort((a, b) => science(b.id) - science(a.id))) {
            if (!start(l.id, stealType, reserve)) continue;
            befriendsNext = true;
            out.push({ key: "ESPIONAGE_STEAL", args: [actionName(stealType), leaderName(l.id)] });
            return out;
        }
    }
    // 4. An endeavor, from the Influence above befriending's reserve: the one worth most of those the game offers us
    // (research/40 A4: before, a list of six, so an endeavor a leader, an attribute node or a city-state bonus unlocked was
    // never started), with the leaders not yet approached this age first (Exploration's «Gregarious Animal» triumph: an
    // action with every leader, +1 policy slot; game 41's went to an AI at E58), then the one we stand worst with.
    const targeted = endeavorTargets();
    const ordered = [...leaders].sort((a, b) => Number(targeted.has(a.id)) - Number(targeted.has(b.id)));
    for (const l of ordered) {
        if (l.rank === 0) continue;
        const offers = endeavorsOffered(l.id, settings?.profile);
        for (const o of offers) {
            if (!start(l.id, o.actionType, reserve)) continue;
            befriendsNext = true;
            noteEndeavorTarget(l.id);
            out.push({ key: "ENDEAVOR", args: [actionName(o.actionType), leaderName(l.id)] });
            return out;
        }
    }
    return out;
}

// The steal that serves a focus (research/40 B6).
const STEAL_FOR_FOCUS = { SCIENCE: "DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH", CULTURE: "DIPLOMACY_ACTION_ESPIONAGE_STEAL_CIVIC" };

/**
 * Starts a diplomatic action with a leader as the diplomacy panel's quick start does ({Amount: 1, Player1, Type, Player2,
 * ID}), when the game offers it now (PROJECT_AVAILABLE), the Influence above `reserve` pays for it and canStart agrees.
 * @returns bool
 */
function startAction(target, actionType, reserve = 0) {
    if (actionType === undefined) return false;
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), target, T, G, -1, T), []) ?? []).find((p) => p.actionType === actionType);
    if (!project || (AVAILABLE !== undefined && project.projectStatus !== AVAILABLE)) return false;
    const cost = Number(project.targetList1?.find((t) => t.targetID === target)?.costYieldD) || 0;
    if (cost > (Number(safe(() => Players.get(pid()).DiplomacyTreasury.diplomacyBalance, 0)) || 0) - reserve) return false;
    const args = { Amount: 1, Player1: pid(), Type: project.actionType, Player2: target, ID: target };
    if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) return false;
    Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
    return true;
}

/** One of our actions of this type under way (against anyone, or against `target`). */
function ourActionRunning(actionType, target = null) {
    return (safe(() => Game.Diplomacy.getPlayerEvents(pid()), []) ?? [])
        .some((e) => e.initialPlayer === pid() && e.actionType === actionType && (target === null || e.targetPlayer === target));
}

/**
 * A rival near the science victory (the victory watch's SCIENCE entry at WATCH or DANGER, its countdown or Innovation): our
 * spies sabotage its space program (DIPLOMACY_ACTION_ESPIONAGE_SABOTAGE_SPACE_PROGRAM, Modern: −50% production toward its
 * Launch Pads and Launch Satellite; research/40 B6). Nothing we hold stops its countdown (root gotcha 58); this slows the
 * work before it. Whatever «Дипломатия» says, never against a leader at war with us, one at a time. @returns log entries
 */
export function sabotageSpace(watch = []) {
    const SAB = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_ESPIONAGE_SABOTAGE_SPACE_PROGRAM;
    if (SAB === undefined) return [];
    const w = (watch ?? []).find((x) => x.cls === "SCIENCE" && !x.own && (x.level === "DANGER" || x.level === "WATCH") && Number.isInteger(x.leader));
    if (!w || safe(() => Players.get(pid()).Diplomacy.isAtWarWith(w.leader), false) || ourActionRunning(SAB, w.leader)) return [];
    if (!startAction(w.leader, SAB)) return [];
    return [{ key: "SABOTAGE_SPACE", args: [safe(() => Locale.compose(Players.get(w.leader).leaderName), String(w.leader))] }];
}

// ---- city-states: incorporate, levy (research/40 B7) ---------------------------------------------------------

const LEVY_RADIUS = 8; // a city-state this near a threatened settlement of ours may lend it a soldier

/** City-states we are suzerain of (player.isMinor, Influence.getSuzerain(), as the city banners read it), nearest to `at` first. */
function ourCityStates(at = null) {
    const ours = at ? [at] : (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const dist = (p) => {
        let best = Infinity;
        for (const c of safe(() => p.Cities.getCities(), []) ?? []) {
            for (const o of ours) best = Math.min(best, safe(() => GameplayMap.getPlotDistance(o.x, o.y, c.location.x, c.location.y), Infinity));
        }
        return best;
    };
    return (safe(() => Players.getAlive(), []) ?? [])
        .filter((p) => p?.isMinor && safe(() => p.Influence.hasSuzerain, false) && safe(() => p.Influence.getSuzerain(), -1) === pid())
        .map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d);
}

/** The game's offer of an action toward a city-state (getProjectDataForUI, PROJECT_AVAILABLE), or null. */
function cityStateProject(cs, actionType) {
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), cs.id, T, G, -1, T), []) ?? []).find((x) => x.actionType === actionType);
    return project && (AVAILABLE === undefined || project.projectStatus === AVAILABLE) ? project : null;
}

const influence = () => Number(safe(() => Players.get(pid()).DiplomacyTreasury.diplomacyBalance, 0)) || 0;

/** A city-state's name: its city's (its civilization's name is a generic one: game 42 logged «деревни»). */
function cityStateName(p) {
    const city = (safe(() => p.Cities.getCities(), []) ?? [])[0];
    return safe(() => Locale.compose(city?.name ?? p.civilizationName ?? p.name), String(p.id));
}

/**
 * Incorporates a city-state we are suzerain of (DIPLOMACY_ACTION_CS_INCORPORATE: 240 / 480 / 720 Influence, 10 turns; it
 * becomes our town; the AI did it 7 times in game 41) while settlements count for us (`want`: the final age's fill of the
 * cap or our military lever, a settlement milestone within the cap's room: research/40 B7) and the cap has room. The nearest
 * first, one at a time, the target screen's args {Player1, Type, Amount: 1, ID}. Whether it counts toward the cap is probe
 * P-INC-1 (the settlement count in UI.log's legacy line). @returns log entries
 */
export function incorporateCityState({ want = false, room = 0 } = {}) {
    const INC = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_CS_INCORPORATE;
    if (INC === undefined || !want || !(room > 0) || ourActionRunning(INC)) return [];
    for (const { p } of ourCityStates()) {
        const project = cityStateProject(p, INC);
        if (!project) continue;
        const cost = Number(project.targetList1?.find((t) => t.targetID === p.id)?.costYieldD ?? project.targetList1?.[0]?.costYieldD) || 0;
        if (cost > influenceFree()) continue;
        const args = { Player1: pid(), Type: INC, Amount: 1, ID: p.id };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        return [{ key: "INCORPORATE", args: [cityStateName(p)] }];
    }
    return [];
}

/**
 * A threatened settlement short of guards takes a soldier from a city-state we are suzerain of within LEVY_RADIUS
 * (DIPLOMACY_ACTION_CS_LEVY_UNIT, instant: the unit types the game offers in the project's targetList2, the target
 * screen's `Unit` arg): its strongest melee land unit, from the Influence (research/40 B7). One a pass. @returns log entries
 */
export function levyDefenders(threats = []) {
    const LEVY = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_CS_LEVY_UNIT;
    if (LEVY === undefined || threats.length === 0) return [];
    for (const t of threats) {
        // A land unit against land raiders only (game 42: all five levies answered ships, which a melee unit cannot hit).
        if (t.land !== undefined && !(Number(t.land) > 0)) continue;
        if (safe(() => guardsFor(t, undefined, threats), 0) >= safe(() => guardsWanted(t), 1)) continue;
        for (const { p, d } of ourCityStates(t.settlement)) {
            if (d > LEVY_RADIUS) break;
            const project = cityStateProject(p, LEVY);
            if (!project) continue;
            const offers = (project.targetList2 ?? []).filter((x) => x.parameterName === "Unit")
                .map((x) => ({ x, def: safe(() => GameInfo.Units.lookup(x.targetName ?? x.targetID), null) }))
                .filter((o) => o.def && o.def.Domain === "DOMAIN_LAND" && o.def.CoreClass === "CORE_CLASS_MILITARY")
                .sort((a, b) => (Number(safe(() => GameInfo.Unit_Stats.lookup(b.def.UnitType)?.Combat, 0)) || 0) - (Number(safe(() => GameInfo.Unit_Stats.lookup(a.def.UnitType)?.Combat, 0)) || 0));
            for (const o of offers) {
                const cost = Number(o.x.costYieldD ?? project.targetList1?.[0]?.costYieldD) || 0;
                if (cost > influence()) continue;
                const args = { Player1: pid(), Type: LEVY, Amount: 1, ID: p.id, Unit: o.x.targetID };
                if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) continue;
                Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
                return [{ key: "LEVIED", args: [safe(() => Locale.compose(o.def.Name), o.def.UnitType), cityStateName(p), t.settlement.name] }];
            }
        }
    }
    return [];
}

// Endeavors by worth (research/40 A4): Lafayette's Reform gives a policy slot for good; the rest by what they bring a turn.
// The priority's own come first (ENDEAVOR_FOR_PROFILE), then these; one the game offers that is not listed after them.
export const ENDEAVOR_VALUE = Object.freeze({
    GRANT_POLICY_SLOT: 100,
    RESEARCH_COLLABORATION: 10, CULTURAL_EXCHANGE: 10, MINOR_TRADE: 10, FARMERS_MARKET: 9, LOCAL_FESTIVALS: 9,
    SEND_DELEGATION_DIPLOMATIC_CITY_STATE_BONUS: 9, FRIEND_OF_WA: 8, SHARE_INNOVATIONS: 8, WONDER_CONSTRUCTION: 8,
    TRADE_MAP: 6, GINSING_AGREEMENT: 6, MILITARY_AID: 5,
});
const ENDEAVOR_UNKNOWN = 4;
const ENDEAVOR_OWN = 10; // the priority's own endeavor
// Endeavors that are something else: gold for nothing, a captured commander, the reconciliation of step 2.
const NOT_ENDEAVORS = new Set(["SEND_GOLD", "FREE_CAPTURED_COMMANDER", "SEND_DELEGATION"]);

/** The endeavors the game offers us toward a leader now (getProjectDataForUI, PROJECT_AVAILABLE), worth most first. */
function endeavorsOffered(target, profile) {
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const ENDEAVOR = globalThis.DiplomacyActionGroups?.DIPLOMACY_ACTION_GROUP_ENDEAVOR;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    const A = globalThis.DiplomacyActionTypes ?? {};
    const own = new Set(ENDEAVOR_FOR_PROFILE[profile] ?? []);
    const out = [];
    for (const p of safe(() => Game.Diplomacy.getProjectDataForUI(pid(), target, T, G, -1, T), []) ?? []) {
        const name = String(safe(() => GameInfo.DiplomacyActions.lookup(p.actionType)?.DiplomacyActionType, null)
            ?? Object.keys(A).find((k) => A[k] === p.actionType) ?? "").replace("DIPLOMACY_ACTION_", "");
        const endeavor = (ENDEAVOR !== undefined && p.actionGroup === ENDEAVOR) || name in ENDEAVOR_VALUE;
        if (!endeavor || !name || NOT_ENDEAVORS.has(name)) continue;
        if (AVAILABLE !== undefined && p.projectStatus !== AVAILABLE) continue;
        out.push({ actionType: p.actionType, name, value: (ENDEAVOR_VALUE[name] ?? ENDEAVOR_UNKNOWN) + (own.has(name) ? ENDEAVOR_OWN : 0) });
    }
    return out.sort((a, b) => b.value - a.value);
}

/** The leaders we started an endeavor with this age (the settings' memory of this game: an age change keeps it). */
function endeavorTargets() {
    const age = safe(() => Game.age, null);
    const v = String(safe(() => settings.recall(gameKey(), "endeavors"), "") ?? "");
    const [at, ids] = v.split("|");
    return at === String(age) ? new Set((ids ?? "").split(",").filter(Boolean).map(Number)) : new Set();
}

function noteEndeavorTarget(id) {
    const set = endeavorTargets();
    set.add(id);
    safe(() => settings.remember(gameKey(), { endeavors: `${safe(() => Game.age, null)}|${[...set].join(",")}` }), null);
}

/**
 * Lafayette's Reform («Реформа», DIPLOMACY_ACTION_GRANT_POLICY_SLOT; research/40 A4): a policy slot for us, for good, once
 * per leader, and a tradition slot for each leader who supports it. Started with every leader the game allows, whatever
 * the «Дипломатия» option says (it costs only Influence), from the Influence above what befriending keeps (befriendReserve).
 * @returns log entries
 */
let reformProbed = false;

export function startReforms() {
    const REFORM = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_GRANT_POLICY_SLOT;
    if (REFORM === undefined) return [];
    const me = safe(() => Players.get(pid()), null);
    if (!me?.Diplomacy) return [];
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    const balance = Number(safe(() => me.DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid() || !safe(() => me.Diplomacy.hasMet(p.id), false) || safe(() => me.Diplomacy.isAtWarWith(p.id), false)) continue;
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), p.id, T, G, -1, T), []) ?? []).find((x) => x.actionType === REFORM);
        // Probe P-REF-1 (research/40): how Lafayette's Reform shows in the game's project data, once a session.
        if (project && !reformProbed) {
            reformProbed = true;
            log.info(`reform: project toward ${p.id}: status ${project.projectStatus}, operation ${project.operationType}, targets ${JSON.stringify(project.targetList1 ?? null)} (probe P-REF-1)`);
        }
        if (!project || (AVAILABLE !== undefined && project.projectStatus !== AVAILABLE)) continue;
        const cost = Number(project.targetList1?.find((t) => t.targetID === p.id)?.costYieldD) || 0;
        if (cost > balance - reserveNow()) continue;
        const args = { Amount: 1, Player1: pid(), Type: REFORM, Player2: p.id, ID: p.id };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        noteEndeavorTarget(p.id);
        return [{ key: "REFORM", args: [safe(() => Locale.compose(p.leaderName), String(p.id))] }];
    }
    return [];
}

/**
 * Advisor warnings (NOTIFICATION_ADVISOR_WARNING_SCIENCE/_CULTURE/...) of a followed advisor
 * hold the turn until seen. Marks every one seen, as closing the game's watch-out window does
 * (notification-handlers.js AdvisorWarning.dismiss). All of them, not only the one the game
 * reports first: in game a warning waited behind another hold and was never marked.
 */
const warningsSeen = new Set(); // notification ids marked as seen (G3: the same warning was marked on every pass)

export function dismissAdvisorWarnings() {
    if (PlayerOperationTypes.VIEWED_ADVISOR_WARNING === undefined) return [];
    let n = 0;
    const ids = safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? [];
    const idKey = (id) => JSON.stringify(id);
    // Ids gone from the game are forgotten (an id may come back for another notification).
    const live = new Set(ids.map(idKey));
    for (const k of [...warningsSeen]) if (!live.has(k)) warningsSeen.delete(k);
    for (const id of ids) {
        if (warningsSeen.has(idKey(id))) continue;
        const note = safe(() => Game.Notifications.find(id), null);
        const name = note ? safe(() => Game.Notifications.getTypeName(note.Type), null) : null;
        if (!name || !name.startsWith("NOTIFICATION_ADVISOR_WARNING")) continue;
        const args = { Target: id };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.VIEWED_ADVISOR_WARNING, args, false), null)?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.VIEWED_ADVISOR_WARNING, args);
        warningsSeen.add(idKey(id));
        n++;
    }
    return n > 0 ? [{ key: "ADVISOR_SEEN", args: [n] }] : [];
}

/**
 * What still holds the turn (a notification type name), or null. The game's end turn button
 * refuses to end the turn while there is one (panel-action.js canEndTurn).
 */
export function turnBlocker() {
    const type = safe(() => Game.Notifications.getEndTurnBlockingType(pid()), 0);
    if (!type || type === globalThis.EndTurnBlockingTypes?.NONE) return null;
    const id = safe(() => Game.Notifications.findEndTurnBlocking(pid(), type), null);
    const name = id ? safe(() => Game.Notifications.getTypeName(Game.Notifications.find(id).Type), null) : null;
    return name ?? String(type);
}

/** The game's own text for what holds the turn, as its end-turn button shows it (panel-action.js: getMessage), or null. */
export function turnBlockerMessage() {
    const type = safe(() => Game.Notifications.getEndTurnBlockingType(pid()), 0);
    if (!type || type === globalThis.EndTurnBlockingTypes?.NONE) return null;
    const id = safe(() => Game.Notifications.findEndTurnBlocking(pid(), type), null);
    return (id ? safe(() => Game.Notifications.getMessage(id), null) : null) || null;
}

// ---- one pass over every choice -----------------------------------------------------------

const MAX_POLICY_CHANGES = 8;   // slots filled per pass (a new age opens several at once)
const MAX_POLICY_SWAPS = 3;     // weak cards swapped out per pass
const MAX_ATTRIBUTE_BUYS = 10;  // leader attribute points spent per pass (each after AttributeNodeCompleted)
const MAX_STORIES = 3;
const MAX_BELIEFS = 4;          // beliefs added per pass (founder + follower + ...)
const POLICY_WAIT_MS = 1000;    // the game slots one card at a time: wait for TraditionChanged
const STEP_WAIT_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves true when the engine fires `name`, false after `ms` without it. */
export function nextEvent(name, ms) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (fired) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            safe(() => engine.off(name, onEvent), null);
            resolve(fired);
        };
        const onEvent = () => finish(true);
        const timer = setTimeout(() => finish(false), ms);
        safe(() => engine.on(name, onEvent), null);
    });
}

/**
 * Every choice that waits for the player, in the order the game asks for them.
 * `retry`: the end-of-turn second try, which also marks screens as seen when something
 * still holds the turn.
 */
export async function makeChoices(settings, { retry = false } = {}) {
    const out = [];
    const sent = new Set();
    // The end-of-turn retry, with an empty slot holding the turn: the least bad card goes in
    // (seen in game 6: Ming's policy slot left empty held the turn; «seen it» did not release it).
    const forced = retry && turnBlocker() === "NOTIFICATION_TRADITIONS_AVAILABLE";
    const fillPolicies = async () => {
        for (let i = 0; i < MAX_POLICY_CHANGES; i++) {
            const r = fillOnePolicySlot(settings, sent, { forced });
            if (r.length === 0) break;
            out.push(...r);
            // Slow game: the slot may still look empty; another card now could be refused or
            // take the wrong slot. The next pass (next turn, or "Do it now") continues.
            if (!(await nextEvent("TraditionChanged", POLICY_WAIT_MS))) break;
        }
    };
    await fillPolicies();
    // A celebration also opens a policy slot for its duration.
    const celebration = chooseCelebration(settings);
    if (celebration.length > 0) {
        out.push(...celebration);
        await nextEvent("TraditionSlotsAdded", POLICY_WAIT_MS);
        await fillPolicies();
    }
    // Leader attribute points, one node at a time (the game confirms each with AttributeNodeCompleted).
    const boughtNodes = new Set();
    for (let i = 0; i < MAX_ATTRIBUTE_BUYS; i++) {
        const r = buyOneAttribute(settings, boughtNodes);
        if (r.length === 0) break;
        out.push(...r);
        if (!(await nextEvent("AttributeNodeCompleted", POLICY_WAIT_MS))) break;
    }
    // Then weak cards make way for better ones, while the game allows swaps.
    for (let i = 0; i < MAX_POLICY_SWAPS; i++) {
        const r = swapOnePolicy(settings, sent);
        if (r.length === 0) break;
        out.push(...r);
        if (!(await nextEvent("TraditionChanged", POLICY_WAIT_MS))) break;
        await fillPolicies();
    }
    const answered = new Set();
    for (let i = 0; i < MAX_STORIES; i++) {
        const r = chooseStory(answered, settings);
        if (r.length === 0) break;
        out.push(...r);
        await sleep(STEP_WAIT_MS);
    }
    out.push(...await foundReligion(settings));
    // «Наступление» (research/37 Phase 7) works with «Оборона»: the peace intent is consulted only then.
    const offensive = !!settings.autopilot?.offensive && !!settings.autopilot?.defend;
    out.push(...choosePantheon(settings), ...chooseGovernment(settings), ...chooseSyncretism(), ...chooseCityStateBonus(settings), ...answerFirstMeetings(), ...answerDiplomacy({ support: !!settings.autopilot?.diplomacy, reserve: reserveNow() }), ...readLeaderMessages(), ...answerCallsToArms({ retry }), ...answerIncomingDeals({ offensive }), ...readEspionageReports({ retry }), ...slotGreatWorks(), ...dismissAdvisorWarnings(), ...promoteUnits());
    out.push(...await seekPeace({ offensive }));
    if (retry && turnBlocker()) out.push(...acknowledge(), ...considerTownProjects());
    return out;
}
