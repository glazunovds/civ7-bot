/**
 * Memento Advisor: what the memento screen knows (engine adapter; every call guarded, the APIs
 * differ between the front end and the game). Research: research/15-memento-screen.md §2–3.
 *  - leader and civilization: GameSetup.findPlayerParameter(local, "PlayerLeader" /
 *    "PlayerCivilization"); in an age transition (in game) "AgeTransitionPlayerCivilization";
 *  - the age the mementos are chosen for (readAge): the game setup's "Age" in the front end, the
 *    next age in game (any civilization may play in any age, so the civilization does not say);
 *    UI.log's `[MMA] advice for …` line says what each reader answered (ageLine);
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

/**
 * The age the mementos are chosen for, with what each reader said (the probe line).
 *  - Front end: the "Age" game parameter, the start age (age-select-model.js).
 *  - In game, two readers of the game's own:
 *    - `next`: the parameter is the age being played, and a transition chooses for the next one by
 *      the domain's sortIndex, as the game's AgeSelectModel (core ui-next create-game/
 *      age-select-model.js) and its civ-choice screen read it;
 *    - `successor`: GameInfo.AgeSuccessors.lookup(Game.age), as civ-details.js reads it there.
 *    When both answer and disagree the successor is taken: Game.age is the gameplay's own age,
 *    while the parameter is setup data that may already name the next age (the shell's legacy
 *    transition screen read it as that: age-transition-civ-select.js).
 *  - Else the age being played (the last age has no successor). null when nothing answers.
 */
export function ageReaders(inGame) {
    const param = safe(() => GameSetup.findGameParameter("Age"), null);
    const current = safe(() => param.value.value?.toString(), null);
    if (!inGame) return { age: current, current, next: null, successor: null, disagree: false };
    const ages = safe(() => [...(param.domain.possibleValues ?? [])].sort((a, b) => a.sortIndex - b.sortIndex), []);
    const i = current ? ages.findIndex((a) => safe(() => a.value.toString(), null) === current) : -1;
    const next = i >= 0 ? safe(() => ages[Math.min(i + 1, ages.length - 1)].value.toString(), null) : null;
    const successor = safe(() => GameInfo.AgeSuccessors.lookup(Game.age)?.SuccessorAgeType, null);
    const age = successor ?? next ?? safe(() => GameInfo.Ages.lookup(Game.age)?.AgeType, null);
    return { age, current, next, successor, disagree: !!(next && successor && next !== successor) };
}

export function readAge(inGame) {
    return ageReaders(inGame).age;
}

/** UI.log's line for the age read (once each time the memento tab opens). */
export function ageLine(leader, civ, readers, picks, inGame) {
    const chosen = picks?.ageType ?? "none";
    const why = !readers.age ? `no age read: the civilization's own (${chosen})`
        : !inGame ? "the setup's start age"
            : `Age parameter ${readers.current ?? "-"}, next by sortIndex ${readers.next ?? "-"}, successor of Game.age ${readers.successor ?? "-"}`
                + (readers.disagree ? "; they disagree: the successor is taken" : "");
    return `[MMA] advice for ${leader ?? "*"} + ${civ ?? "*"} in ${chosen} (${why})`;
}

export function readContext() {
    const pid = safe(() => GameContext.localPlayerID, 0);
    const inGame = !!safe(() => UI.isInGame(), false);
    const param = (id) => safe(() => GameSetup.findPlayerParameter(pid, id)?.value?.value?.toString(), null);
    const leader = param("PlayerLeader") ?? safe(() => Configuration.getPlayer(pid).leaderTypeName, null);
    const civ = (inGame ? param("AgeTransitionPlayerCivilization") : null) ?? param("PlayerCivilization") ?? safe(() => Configuration.getPlayer(pid).civilizationTypeName, null);
    const readers = ageReaders(inGame);
    const picks = getPicks(leader ?? "*", civ ?? "*", readers.age);
    safe(() => console.warn(ageLine(leader, civ, readers, picks, inGame)), null);
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
        age: picks?.ageType ?? null,
        picks,
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

/** A leader's, civilization's or age's name in the reasons' language, from the table. */
export function nameOf(kind, type, lang) {
    const row = kind === "leader" ? MEMENTO_TABLE.leaders?.[type]
        : kind === "age" ? MEMENTO_TABLE.ages?.find((a) => a.type === type) : MEMENTO_TABLE.civs?.[type];
    return row?.name?.[lang] ?? row?.name?.en ?? null;
}
