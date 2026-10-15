/**
 * Memento Advisor: what the memento screen knows (engine adapter; every call guarded, the APIs
 * differ between the front end and the game). Research: research/15-memento-screen.md §2–3.
 *  - leader and civilization: GameSetup.findPlayerParameter(local, "PlayerLeader" /
 *    "PlayerCivilization"); in an age transition (in game) "AgeTransitionPlayerCivilization";
 *  - the mementos and which are unlocked: Online.Metaprogression.getMementosData()
 *    ({ mementoTypeId, mementoIcon, displayType });
 *  - the language of the reasons: Locale.getCurrentDisplayLocale().
 */
import { getPicks, MEMENTO_TABLE, mementoTypeByIcon } from '../data/mma-table.js';

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (_e) {
        return fallback;
    }
}

export function readContext() {
    const pid = safe(() => GameContext.localPlayerID, 0);
    const inGame = !!safe(() => UI.isInGame(), false);
    const param = (id) => safe(() => GameSetup.findPlayerParameter(pid, id)?.value?.value?.toString(), null);
    const leader = param("PlayerLeader") ?? safe(() => Configuration.getPlayer(pid).leaderTypeName, null);
    const civ = (inGame ? param("AgeTransitionPlayerCivilization") : null) ?? param("PlayerCivilization") ?? safe(() => Configuration.getPlayer(pid).civilizationTypeName, null);
    const data = safe(() => Online.Metaprogression.getMementosData(), []) ?? [];
    const unlocked = globalThis.DisplayType?.DISPLAY_UNLOCKED;
    const iconToType = new Map();
    const available = new Set();
    for (const m of data) {
        if (!m?.mementoTypeId) continue;
        if (m.mementoIcon) iconToType.set(String(m.mementoIcon), m.mementoTypeId);
        if (unlocked === undefined || m.displayType === unlocked) available.add(m.mementoTypeId);
    }
    const locale = String(safe(() => Locale.getCurrentDisplayLocale(), "en_US"));
    return {
        leader, civ, inGame,
        picks: getPicks(leader ?? "*", civ ?? "*"),
        // No memento data (an API change): every memento counts as available.
        available: available.size > 0 ? available : null,
        iconToType,
        lang: locale.toLowerCase().startsWith("ru") ? "ru" : "en",
    };
}

/** The memento of a card, from its icon (url('blp:<icon>')): the screen's own data, else the table. */
export function typeOfIcon(ctx, icon) {
    return ctx.iconToType.get(icon) ?? mementoTypeByIcon(icon);
}

/** A leader's or civilization's name in the reasons' language, from the table. */
export function nameOf(kind, type, lang) {
    const row = kind === "leader" ? MEMENTO_TABLE.leaders?.[type] : MEMENTO_TABLE.civs?.[type];
    return row?.name?.[lang] ?? row?.name?.en ?? null;
}
