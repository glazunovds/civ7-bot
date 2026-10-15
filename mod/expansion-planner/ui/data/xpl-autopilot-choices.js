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
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { costMultiplier } from '../core/xpl-scarcity.js';
import { judgeDeal } from '../core/xpl-deals.js';
import { log } from '../services/xpl-log.js';
import { effectYields, focusOfProfile, rankGovernments } from '../core/xpl-effect-value.js';
import { promoteUnits, threatenedSettlements } from './xpl-autopilot-units.js';
import { independentNameOf, villagesOf } from './xpl-player-facts.js';

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
// Influence goes to befriending independents this turn (see befriendIndependents).
let befriendBusy = false;
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
    return {
        focus: focusOfProfile(settings?.profile),
        age: safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null),
        production, science: net("YIELD_SCIENCE"), culture: net("YIELD_CULTURE"), gold: net("YIELD_GOLD"),
    };
}

/** What these modifiers' non-yield effects are worth per turn (0 without a context). */
function leverValue(modifierIds, weights, levers) {
    if (!levers || (modifierIds?.length ?? 0) === 0) return 0;
    return safe(() => valueOf(effectYields(effectsOf(modifierIds), levers), weights), 0);
}

// Policy Yield Previews' value plus the effects it cannot see; unknown stays unknown unless those count.
const withLevers = (value, extra) => (value === null ? (extra !== 0 ? extra : null) : value + extra);

let perCardCache = null;

/**
 * What our civilization and leader gain or lose for every card slotted, by kind (their traits'
 * `EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION` modifiers): Ming loses 15 Science a turn for
 * each social policy slotted, its traditions not counted (`CivUnique` + `Invert`). Policy Yield
 * Previews values the card's own modifiers only, so the autopilot slotted policy after policy
 * (seen in game: Ming's science went below zero, 4 techs in 53 turns). Resolved once per
 * civilization and leader. @returns [{ yieldType, amount, civUnique, invert }]
 */
function perCardYields() {
    const me = safe(() => Players.get(pid()), null);
    const civ = safe(() => GameInfo.Civilizations.lookup(me.civilizationType)?.CivilizationType, null);
    const leader = safe(() => GameInfo.Leaders.lookup(me.leaderType)?.LeaderType, null);
    const key = `${civ}|${leader}`;
    if (perCardCache && perCardCache.key === key && perCardCache.source === GameInfo.Modifiers) return perCardCache.list;
    const traits = new Set();
    for (const r of GameInfo.CivilizationTraits ?? []) if (civ && r.CivilizationType === civ) traits.add(r.TraitType);
    for (const r of GameInfo.LeaderTraits ?? []) if (leader && r.LeaderType === leader) traits.add(r.TraitType);
    const ids = [];
    for (const r of GameInfo.TraitModifiers ?? []) if (traits.has(r.TraitType)) ids.push(r.ModifierId ?? r.ModifierID);
    const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";
    const list = safe(() => effectsOf(ids), [])
        .filter((e) => e.effect === "EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION")
        .map((e) => ({ yieldType: e.args.YieldType, amount: Number(e.args.Amount) || 0, civUnique: truthy(e.args.CivUnique), invert: truthy(e.args.Invert) }));
    perCardCache = { key, source: GameInfo.Modifiers, list };
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
 * Literature, Public Works, Think Tanks); null if unknown.
 */
export function cardValue(traditionType, weights, levers = null) {
    const api = globalThis.LfYieldsPreview;
    if (!traditionType) return null;
    const r = api?.previewPolicyYields ? safe(() => api.previewPolicyYields({ TraditionType: traditionType }), null) : null;
    const value = r?.isValid && r.yields ? valueOf(r.yields, weights) : null;
    if (!levers) return value;
    const ids = (GameInfo.TraditionModifiers?.filter((m) => m.TraditionType === traditionType) ?? []).map((m) => m.ModifierId ?? m.ModifierID);
    const def = safe(() => GameInfo.Traditions.lookup(traditionType), null);
    return withLevers(value, leverValue(ids, weights, levers) + safe(() => traitCardValue(def, weights), 0));
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
            plain -= w * loss;
            weighted -= w * loss * costMultiplier(net, loss);
        }
    }
    return known ? { plain, weighted } : null;
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

const SWAP_MIN_GAIN = 2;      // a swap must win at least this (weighted yield per turn)...
const SWAP_MIN_SHARE = 0.25;  // ...and this share of the card it takes out

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
            const value = def ? cardValue(def.TraditionType, weights, levers) : null;
            if (value === null) continue;
            const gain = top.value - value;
            if (gain < Math.max(SWAP_MIN_GAIN, SWAP_MIN_SHARE * Math.abs(value))) continue;
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
        options.push({ key: to.NarrativeStoryType, ai: !!(link?.AIPriority === true || link?.AIPriority === "true" || link?.AIPriority === 1), negative, happy, value: storyValue(icons, weights) });
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

/** A pantheon when one is unlocked (the first belief the game allows). */
export function choosePantheon() {
    if (!waiting("NOTIFICATION_CHOOSE_PANTHEON")) return [];
    const religion = safe(() => Players.get(pid()).Religion, null);
    if (!religion || !(Number(safe(() => religion.getNumPantheonsUnlocked(), 0)) > 0)) return [];
    for (const b of GameInfo.Beliefs ?? []) {
        if (b.BeliefClassType !== "BELIEF_CLASS_PANTHEON") continue;
        const args = { BeliefType: Database.makeHash(b.BeliefType) };
        const ok = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.FOUND_PANTHEON, args, false), null);
        if (!ok?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.FOUND_PANTHEON, args);
        return [{ key: "PANTHEON", args: [Locale.compose(b.Name)] }];
    }
    return [];
}

/**
 * Founding a religion (NOTIFICATION_CHOOSE_RELIGION) and its beliefs (NOTIFICATION_CHOOSE_BELIEF):
 * the first religion not founded yet, then beliefs one at a time (the game confirms each with
 * BeliefAdded) while the game accepts one. Beliefs worth most by Policy Yield Previews (their
 * BeliefModifiers) first, else in the game's order. Same operations as the game's belief
 * picker (panel-belief-picker.js: FOUND_RELIGION {ReligionType}, ADD_BELIEF {BeliefType}).
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
    const tried = new Set();
    for (let i = 0; i < MAX_BELIEFS; i++) {
        const options = [];
        for (const b of GameInfo.Beliefs ?? []) {
            if (b.BeliefClassType === "BELIEF_CLASS_PANTHEON" || tried.has(b.BeliefType)) continue;
            if (!safe(() => Game.Religion.isBeliefClaimable(b.BeliefType), false)) continue;
            const ids = (GameInfo.BeliefModifiers?.filter((m) => m.BeliefType === b.BeliefType) ?? []).map((m) => m.ModifierID ?? m.ModifierId);
            options.push({ b, value: modifiersValue(ids, weights) });
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
export function answerDiplomacy({ support = false } = {}) {
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
        // accepting it (the game's favor for support), when the Influence allows.
        if (support && ENDEAVOR !== undefined && event?.actionGroup === ENDEAVOR) {
            pick = options.find((r) => r.responseType === R?.DIPLOMACY_RESPONSE_SUPPORT && (Number(r.cost) || 0) <= balance) ?? pick;
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
 *    (DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN) or, for one threatening us that we already befriend,
 *    more Influence into it (the panel's "+"). One offered that we cannot afford yet keeps the
 *    Influence for itself (nothing else is spent).
 *  - Order: those whose units threaten a settlement, then those at war with us (hostile), then the
 *    nearest to our settlements — measured to its village (not a city: villagesOf) or its city
 *    (a city-state). Before, villages had no distance at all, so the order was arbitrary.
 */
export function befriendIndependents(threats = []) {
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
    // Influence goes to befriending this turn: one started, or one offered waits for Influence.
    const NOT_NOW = ["NOT_UNLOCKED", "NO_VIABLE_TARGETS", "BLOCKED", "ACTIVE"].map((n) => globalThis.DiplomacyProjectStatus?.[`PROJECT_${n}`]).filter((v) => v !== undefined);
    const UNUSABLE = ["NOT_UNLOCKED", "NO_VIABLE_TARGETS", "BLOCKED"].map((n) => globalThis.DiplomacyProjectStatus?.[`PROJECT_${n}`]).filter((v) => v !== undefined);
    let waiting = false;
    let spent = false; // this pass's Influence is spoken for
    for (const { p, threat } of independents) {
        const name = () => independentNameOf(p.id);
        const events = safe(() => Game.Diplomacy.getPlayerEvents(p.id), []) ?? [];
        const ongoing = events.find((a) => a.initialPlayer === pid() && a.actionType === GIVE);
        if (ongoing) {
            // Already befriending: under threat, more Influence speeds it up.
            if (threat && !spent) {
                const s = supportAction(ongoing.uniqueID, p);
                if (s.length > 0) {
                    out.push(...s);
                    spent = true;
                }
            }
            continue;
        }
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), p.id, T, G, -1, T), []) ?? []).find((pr) => pr.actionType === GIVE);
        const args = project ? { Player1: pid(), Type: project.actionType, Amount: 1, ID: p.id } : null;
        const ok = project && (AVAILABLE === undefined || project.projectStatus === AVAILABLE)
            && safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success;
        if (!ok) {
            // Not offered, or offered but not usable (no viable target, not unlocked, blocked: its village unseen,
            // research/23 E5: game 8, a camp raided us 40 turns, never befriended nor approached): a unit is sent
            // toward it.
            if (threat && (!project || UNUSABLE.includes(project.projectStatus))) blocked.push(p.id);
            if (threat && befriendNoted !== Game.turn) {
                befriendNoted = Game.turn;
                log.info(`befriend: ${name()} threatens us; its project ${project ? `status ${project.projectStatus}` : "not offered"}`);
            }
            if (project && !NOT_NOW.includes(project.projectStatus)) {
                waiting = true;
                spent = true; // the Influence is kept for this one
            }
            continue;
        }
        if (spent) {
            waiting = true;
            continue;
        }
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        out.push({ key: "BEFRIEND", args: [name()] });
        spent = true;
    }
    blockedIndependents = blocked;
    befriendBusy = waiting || out.length > 0;
    return out;
}

let befriendNoted = -1; // UI.log names a threatening independent's befriend status once a turn

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
    for (const m of [peaceAsk, dealAnswers, incomingDeals, answeredDeals]) m.clear();
}

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
 * them} (the game turned the incoming deal into one), its items by getWorkingDealItem.
 */
export function answerIncomingDeals() {
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
        safe(() => D.sendWorkingDeal(id, v.accept ? P.ACCEPTED : P.REJECTED), null);
        answeredDeals.set(p.id, Game.turn);
        incomingDeals.delete(p.id);
        const leader = safe(() => Locale.compose(p.leaderName), String(p.id));
        log.warn(`deal: ${leader} offers ${v.peace ? "peace" : "no peace"}, asking ${v.asks.cities} settlement(s), ${v.asks.gold} gold, ${v.asks.influence} Influence: ${v.accept ? "accepted" : "rejected"}`);
        if (v.accept) {
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
 * (the game may not answer a script's inspect: probe): proposed, and the next ask waits as after a "no".
 */
export async function seekPeace() {
    hookStatements();
    const out = [];
    const D = globalThis.Game?.DiplomacyDeals;
    const P = globalThis.DiplomacyDealProposalActions;
    const me = safe(() => Players.get(pid()), null);
    if (!D || !P || !me?.Diplomacy || globalThis.DiplomacyDealItemAgreementTypes?.MAKE_PEACE === undefined) return out;
    if (diplomacyScreenOpen()) return out;
    for (const p of safe(() => Players.getAlive(), []) ?? []) {
        if (!p?.isMajor || p.id === pid() || !safe(() => me.Diplomacy.isAtWarWith(p.id), false)) continue;
        const ask = peaceAsk.get(p.id) ?? { next: -Infinity, refusals: 0 };
        if (Game.turn < ask.next) continue;
        if (!safe(() => me.Diplomacy.canMakePeaceWith(p.id), null)?.Success) continue;
        if (safe(() => D.hasPendingDeal(pid(), p.id), false)) continue;
        const deal = { direction: DiplomacyDealDirection.OUTGOING, player1: pid(), player2: p.id };
        try {
            D.clearWorkingDeal(deal);
            D.addItemToWorkingDeal(deal, { type: DiplomacyDealItemTypes.AGREEMENTS, agreementType: DiplomacyDealItemAgreementTypes.MAKE_PEACE });
        } catch (_e) {
            continue;
        }
        const leader = safe(() => Locale.compose(p.leaderName), String(p.id));
        dealAnswers.delete(p.id);
        safe(() => D.sendWorkingDeal(deal, P.INSPECT), null);
        const answer = await inspectAnswer(p.id, INSPECT_WAIT_MS);
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
        out.push({ key: "PEACE_PROPOSED", args: [leader] });
    }
    return out;
}

// ---- diplomacy with other leaders («Дипломатия») ---------------------------------------------

const RELATION_RANK = ["HOSTILE", "UNFRIENDLY", "NEUTRAL", "FRIENDLY", "HELPFUL"];
// Endeavors («Инициативы») in the order tried; the priority's own come first.
const ENDEAVORS = ["RESEARCH_COLLABORATION", "MINOR_TRADE", "CULTURAL_EXCHANGE", "FARMERS_MARKET", "LOCAL_FESTIVALS", "WONDER_CONSTRUCTION"];
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
 *  - an endeavor («Инициатива»: research collaboration, open markets, cultural exchange, farmers
 *    market, local festival, wonder construction; the priority's own first) with the leader we
 *    stand worst with (not Hostile: the game allows none), while no Influence goes to befriending
 *    independents. Endeavors and reconciliation raise the relationship.
 * Under threat only the counter-spy (Influence goes to befriending). Never with a leader at war
 * with us; worst relationship first, then nearest.
 */
export function tendDiplomacy(settings, { threatened = false } = {}) {
    const out = [];
    const A = globalThis.DiplomacyActionTypes ?? {};
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const me = safe(() => Players.get(pid()), null);
    if (!me?.Diplomacy) return out;
    noteCaughtSpies();
    const balance = () => Number(safe(() => me.DiplomacyTreasury.diplomacyBalance, 0)) || 0;
    const leaderName = (id) => safe(() => Locale.compose(Players.get(id).leaderName), String(id));
    const actionName = (type) => safe(() => Locale.compose(GameInfo.DiplomacyActions.lookup(type).Name), String(type));
    const start = (target, actionType) => {
        if (actionType === undefined) return false;
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), target, T, G, -1, T), []) ?? []).find((p) => p.actionType === actionType);
        if (!project || (AVAILABLE !== undefined && project.projectStatus !== AVAILABLE)) return false;
        const cost = Number(project.targetList1?.find((t) => t.targetID === target)?.costYieldD) || 0;
        if (cost > balance()) return false;
        const args = { Amount: 1, Player1: pid(), Type: project.actionType, Player2: target, ID: target };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) return false;
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        return true;
    };
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
    if (threatened) return out;
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
        if (start(l.id, A.DIPLOMACY_ACTION_SEND_DELEGATION)) {
            out.push({ key: "RECONCILE", args: [leaderName(l.id)] });
            break;
        }
    }
    // 3. An endeavor, while no Influence goes to befriending independents.
    if (befriendBusy) return out;
    const order = [...new Set([...(ENDEAVOR_FOR_PROFILE[settings?.profile] ?? []), ...ENDEAVORS])].map((n) => A[`DIPLOMACY_ACTION_${n}`]);
    for (const l of leaders) {
        if (l.rank === 0) continue;
        for (const type of order) {
            if (!start(l.id, type)) continue;
            out.push({ key: "ENDEAVOR", args: [actionName(type), leaderName(l.id)] });
            return out;
        }
    }
    return out;
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
    out.push(...choosePantheon(), ...chooseGovernment(settings), ...chooseCityStateBonus(settings), ...answerFirstMeetings(), ...answerDiplomacy({ support: !!settings.autopilot?.diplomacy && !befriendBusy }), ...readLeaderMessages(), ...answerCallsToArms({ retry }), ...answerIncomingDeals(), ...readEspionageReports({ retry }), ...slotGreatWorks(), ...dismissAdvisorWarnings(), ...promoteUnits());
    out.push(...await seekPeace());
    if (retry && turnBlocker()) out.push(...acknowledge(), ...considerTownProjects());
    return out;
}
