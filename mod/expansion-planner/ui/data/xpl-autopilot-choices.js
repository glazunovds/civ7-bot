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
import { getProfile } from '../core/xpl-profiles.js';
import { dot, yieldIndex } from '../core/xpl-yields.js';
import { log } from '../services/xpl-log.js';
import { promoteUnits } from './xpl-autopilot-units.js';

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

/** What a policy card is worth per turn (Policy Yield Previews), or null if unknown. */
export function cardValue(traditionType, weights) {
    const api = globalThis.LfYieldsPreview;
    if (!api?.previewPolicyYields || !traditionType) return null;
    const r = safe(() => api.previewPolicyYields({ TraditionType: traditionType }), null);
    return r?.isValid && r.yields ? valueOf(r.yields, weights) : null;
}

/** What a list of modifiers is worth per turn (Policy Yield Previews), or null if unknown. */
export function modifiersValue(modifierIds, weights) {
    const api = globalThis.LfYieldsPreview;
    if (!api?.previewModifierByIds || modifierIds.length === 0) return null;
    const r = safe(() => api.previewModifierByIds(modifierIds), null);
    return r?.isValid && r.yields ? valueOf(r.yields, weights) : null;
}

/** Free slots of one kind: slot type -> number free. */
function freeSlots(culture, slotType) {
    const total = Number(safe(() => culture.getNumCultureSlots(slotType), 0)) || 0;
    const active = safe(() => culture.getActiveTraditions(slotType), []) ?? [];
    return Math.max(0, total - active.length);
}

/** Cards of a slot type that are unlocked and not in use: [{ def, value }]. */
function offered(culture, slotType, weights) {
    const out = [];
    for (const h of safe(() => culture.getUnlockedTraditions(slotType), []) ?? []) {
        if (safe(() => culture.isTraditionActive(h), false)) continue;
        const def = safe(() => GameInfo.Traditions.lookup(h), null);
        if (!def) continue;
        out.push({ def, value: cardValue(def.TraditionType, weights) });
    }
    // Known values first, best first; unknown ones keep the game's order.
    return out.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
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
export function fillOnePolicySlot(settings, sent = new Set()) {
    const culture = safe(() => Players.get(pid()).Culture, null);
    const T = globalThis.CultureSlotTypes;
    if (!culture || !T) return [];
    const weights = getProfile(settings.profile).y;
    const order = [T.CRISIS_CULTURE_SLOT, T.TRADITION_CULTURE_SLOT, T.POLICY_CULTURE_SLOT].filter((t) => t !== undefined);
    for (const slotType of order) {
        if (freeSlots(culture, slotType) <= 0) continue;
        let cards = offered(culture, slotType, weights);
        if (slotType === T.TRADITION_CULTURE_SLOT && T.POLICY_CULTURE_SLOT !== undefined && freeSlots(culture, T.POLICY_CULTURE_SLOT) === 0) {
            cards = [...cards, ...offered(culture, T.POLICY_CULTURE_SLOT, weights)].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
        }
        for (const c of cards) {
            if (sent.has(c.def.$hash)) continue;
            if (activate(c.def)) {
                sent.add(c.def.$hash);
                return [{ key: "POLICY", args: [Locale.compose(c.def.Name), c.value === null ? "?" : (Math.round(c.value * 10) / 10).toFixed(1)] }];
            }
        }
    }
    return [];
}

/** When a celebration starts and its bonus must be chosen: the option worth most. */
export function chooseCelebration(settings) {
    if (!waiting("NOTIFICATION_CHOOSE_GOLDEN_AGE")) return [];
    const culture = safe(() => Players.get(pid()).Culture, null);
    const choices = safe(() => culture.getGoldenAgeChoices(), []) ?? [];
    if (choices.length === 0) return [];
    const weights = getProfile(settings.profile).y;
    const options = choices.map((h) => {
        const def = safe(() => GameInfo.GoldenAges.lookup(h), null);
        const ids = def ? (GameInfo.GoldenAgeModifiers ?? []).filter((m) => m.GoldenAgeType === def.GoldenAgeType).map((m) => m.ModifierID ?? m.ModifierId) : [];
        return { def, value: def ? modifiersValue(ids, weights) : null };
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

/**
 * A pending narrative or discovery story: the option the game's own AI prefers
 * (NarrativeStory_Links.AIPriority) among the affordable ones, else one without negative
 * rewards, else the first; a story without options is closed. Same choice rules and
 * command as the game's narrative panel (small-narrative-event-model.js).
 */
export function chooseStory(answered = new Set()) {
    const stories = safe(() => Players.get(pid()).Stories, null);
    if (!stories) return [];
    const storyId = safe(() => stories.getFirstPendingMetId(), null);
    if (!storyId || answered.has(JSON.stringify(storyId))) return [];
    const story = safe(() => stories.find(storyId), null);
    const def = story ? safe(() => GameInfo.NarrativeStories.lookup(story.type), null) : null;
    if (!def) return [];
    const links = (GameInfo.NarrativeStory_Links ?? []).filter((l) => l.FromNarrativeStoryType === def.NarrativeStoryType);
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
        const negative = !!GameInfo.NarrativeRewardIcons?.find((i) => i.NarrativeStoryType === to.NarrativeStoryType && (i.Negative === true || i.Negative === "true" || i.Negative === 1));
        options.push({ key: to.NarrativeStoryType, ai: !!(link?.AIPriority === true || link?.AIPriority === "true" || link?.AIPriority === 1), negative });
    }
    options.sort((a, b) => Number(b.ai) - Number(a.ai) || Number(a.negative) - Number(b.negative));
    const key = options[0]?.key ?? "CLOSE";
    const args = { TargetType: key, Target: storyId, Action: globalThis.PlayerOperationParameters?.Activate };
    const okStart = safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION, args, false), null);
    if (!okStart?.Success) return [];
    Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION, args);
    answered.add(JSON.stringify(storyId));
    return [{ key: "STORY", args: [Locale.compose(def.Name ?? def.NarrativeStoryType), key === "CLOSE" ? "-" : key] }];
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
    const weights = getProfile(settings.profile).y;
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

/** A government when the game asks for one (the first it allows). */
export function chooseGovernment() {
    const current = safe(() => Players.get(pid()).Culture.getGovernmentType(), null);
    if (!waiting("NOTIFICATION_CHOOSE_GOVERNMENT") && current !== -1) return [];
    for (const g of GameInfo.StartingGovernments ?? []) {
        const def = safe(() => GameInfo.Governments.lookup(g.GovernmentType), null);
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
export function answerDiplomacy() {
    const out = [];
    const R = globalThis.DiplomaticResponseTypes;
    if (PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION === undefined) return out;
    const done = new Set();
    for (const n of notificationsOf("NOTIFICATION_DIPLOMATIC_RESPONSE_REQUIRED")) {
        const actionID = n.Target?.id;
        if (actionID === undefined || actionID === null || done.has(actionID)) continue;
        done.add(actionID);
        const data = safe(() => Game.Diplomacy.getResponseDataForUI(actionID), null);
        const event = safe(() => Game.Diplomacy.getDiplomaticEventData(actionID), null);
        const who = safe(() => Locale.compose(Players.get(event.initialPlayer).leaderName), "?");
        const what = safe(() => Locale.compose(GameInfo.DiplomacyActions.lookup(event.actionType).Name), "?");
        const options = (data?.responseList ?? [])
            .filter((r) => R?.DIPLOMACY_RESPONSE_REJECT === undefined || r.responseType !== R.DIPLOMACY_RESPONSE_REJECT)
            .filter((r) => safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION, { ID: actionID, Type: r.responseType }, false), null)?.Success)
            .sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0) || Number(a.responseType === R?.DIPLOMACY_RESPONSE_SUPPORT) - Number(b.responseType === R?.DIPLOMACY_RESPONSE_SUPPORT));
        const pick = options[0];
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
 * Befriends independent powers ("neutral towns"), so their units leave ours alone: for each
 * one we can (nearest to our settlements first), starts the game's "befriend" project
 * (DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN) with Influence while it lasts. Skips those we are
 * already befriending. Same data and operation as the game's diplomacy panel
 * (panel-diplomacy-actions.js quick start, screen-diplomacy-target-select.js).
 */
export function befriendIndependents(threats = []) {
    const out = [];
    const GIVE = globalThis.DiplomacyActionTypes?.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN;
    const T = globalThis.DiplomacyActionTargetTypes?.NO_DIPLOMACY_TARGET ?? -1;
    const G = globalThis.DiplomacyActionGroups?.NO_DIPLOMACY_ACTION_GROUP ?? -1;
    const AVAILABLE = globalThis.DiplomacyProjectStatus?.PROJECT_AVAILABLE;
    if (GIVE === undefined) return out;
    const ours = (safe(() => Players.get(pid()).Cities.getCities(), []) ?? []).map((c) => c.location);
    const distance = (p) => {
        let best = Infinity;
        for (const c of safe(() => p.Cities.getCities(), []) ?? []) {
            for (const o of ours) best = Math.min(best, safe(() => GameplayMap.getPlotDistance(o.x, o.y, c.location.x, c.location.y), Infinity));
        }
        return best;
    };
    // Independents whose units threaten a settlement come first, then the nearest.
    const threatening = new Set(threats.flatMap((t) => t.owners.filter((o) => o.independent).map((o) => o.id)));
    const independents = (safe(() => Players.getAlive(), []) ?? []).filter((p) => p?.isIndependent)
        .map((p) => ({ p, d: distance(p), threat: threatening.has(p.id) }))
        .sort((a, b) => Number(b.threat) - Number(a.threat) || a.d - b.d);
    const blocked = [];
    for (const { p, threat } of independents) {
        const events = safe(() => Game.Diplomacy.getPlayerEvents(p.id), []) ?? [];
        const ours = events.find((a) => a.initialPlayer === pid() && a.actionType === GIVE);
        if (ours) {
            // Already befriending: under threat, more Influence speeds it up (the panel's "+").
            if (threat) out.push(...supportAction(ours.uniqueID, p));
            continue;
        }
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), p.id, T, G, -1, T), []) ?? []).find((pr) => pr.actionType === GIVE);
        const args = project ? { Player1: pid(), Type: project.actionType, Amount: 1, ID: p.id } : null;
        const ok = project && (AVAILABLE === undefined || project.projectStatus === AVAILABLE)
            && safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success;
        if (!ok) {
            // Not offered: not met yet or its settlement unseen (a unit is sent toward it).
            if (threat && !project) blocked.push(p.id);
            continue;
        }
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
        out.push({ key: "BEFRIEND", args: [safe(() => Locale.compose(p.civilizationName ?? p.name), String(p.id))] });
    }
    blockedIndependents = blocked;
    return out;
}

/** More Influence into our ongoing "befriend" with an independent (panel-diplomacy-actions.js). */
function supportAction(actionID, p) {
    const args = { ID: actionID, Type: globalThis.DiplomacyTokenTypes?.DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true };
    if (args.Type === undefined || PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION === undefined) return [];
    if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION, args, false), null)?.Success) return [];
    Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION, args);
    return [{ key: "BEFRIEND_SUPPORT", args: [safe(() => Locale.compose(p.civilizationName ?? p.name), String(p.id))] }];
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
        const project = (safe(() => Game.Diplomacy.getProjectDataForUI(pid(), leader, T, G, -1, T), []) ?? []).find((pr) => pr.actionType === OPEN);
        if (!project || (AVAILABLE !== undefined && project.projectStatus !== AVAILABLE)) continue;
        const args = { Player1: pid(), Player2: leader, Type: project.actionType, Amount: 1 };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), project.operationType, args, false), null)?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), project.operationType, args);
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
export function considerTownProjects() {
    const out = [];
    const op = globalThis.CityOperationTypes?.CONSIDER_TOWN_PROJECT;
    if (op === undefined) return out;
    for (const n of notificationsOf("NOTIFICATION_CHOOSE_TOWN_PROJECT")) {
        const town = n.Target;
        if (!town) continue;
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
    const weights = getProfile(settings.profile).y;
    const api = globalThis.LfYieldsPreview;
    const options = (GameInfo.CityStateBonuses ?? [])
        .filter((b) => safe(() => Game.CityStates.canHaveBonus(pid(), cs, b.CityStateBonusType), false))
        .map((b) => {
            const r = api?.previewCityStateBonusYields ? safe(() => api.previewCityStateBonusYields(b.CityStateBonusType), null) : null;
            return { b, value: r?.isValid && r.yields ? valueOf(r.yields, weights) : null };
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

/**
 * Advisor warnings (NOTIFICATION_ADVISOR_WARNING_SCIENCE/_CULTURE/...) of a followed advisor
 * hold the turn until seen. Marks every one seen, as closing the game's watch-out window does
 * (notification-handlers.js AdvisorWarning.dismiss). All of them, not only the one the game
 * reports first: in game a warning waited behind another hold and was never marked.
 */
export function dismissAdvisorWarnings() {
    if (PlayerOperationTypes.VIEWED_ADVISOR_WARNING === undefined) return [];
    let n = 0;
    for (const id of safe(() => Game.Notifications.getIdsForPlayer(pid()), []) ?? []) {
        const note = safe(() => Game.Notifications.find(id), null);
        const name = note ? safe(() => Game.Notifications.getTypeName(note.Type), null) : null;
        if (!name || !name.startsWith("NOTIFICATION_ADVISOR_WARNING")) continue;
        const args = { Target: id };
        if (!safe(() => Game.PlayerOperations.canStart(pid(), PlayerOperationTypes.VIEWED_ADVISOR_WARNING, args, false), null)?.Success) continue;
        Game.PlayerOperations.sendRequest(pid(), PlayerOperationTypes.VIEWED_ADVISOR_WARNING, args);
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
    const fillPolicies = async () => {
        for (let i = 0; i < MAX_POLICY_CHANGES; i++) {
            const r = fillOnePolicySlot(settings, sent);
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
    const answered = new Set();
    for (let i = 0; i < MAX_STORIES; i++) {
        const r = chooseStory(answered);
        if (r.length === 0) break;
        out.push(...r);
        await sleep(STEP_WAIT_MS);
    }
    out.push(...await foundReligion(settings));
    out.push(...choosePantheon(), ...chooseGovernment(), ...chooseCityStateBonus(settings), ...answerFirstMeetings(), ...answerDiplomacy(), ...readLeaderMessages(), ...readEspionageReports({ retry }), ...dismissAdvisorWarnings(), ...promoteUnits());
    if (retry && turnBlocker()) out.push(...acknowledge(), ...considerTownProjects());
    return out;
}
