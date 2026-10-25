// Memento Advisor: the ranking shown on the memento screen (pure) and what the screen tells us
// (the engine adapter, with the game's globals faked as research/15 found them).
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPicks, MEMENTO_TABLE } from "../../mod/memento-advisor/data/mma-table.js";
import { MODES, rankingOf, rankMementos, SHOWN } from "../../mod/memento-advisor/ui/mma-ranking.js";

const FRANKLIN_HAN = getPicks("LEADER_BENJAMIN_FRANKLIN", "CIVILIZATION_HAN");

test("Auto shows the pair's own victory; another mode its own ranking; an unknown mode is Auto", () => {
    assert.equal(FRANKLIN_HAN.focus, "SCIENCE");
    assert.equal(rankingOf("AUTO", FRANKLIN_HAN), "SCIENCE");
    assert.equal(rankingOf("CULTURE", FRANKLIN_HAN), "CULTURE");
    assert.equal(rankingOf("WHATEVER", FRANKLIN_HAN), "SCIENCE");
    const auto = rankMementos(FRANKLIN_HAN, "AUTO");
    assert.deepEqual([...auto.keys()], FRANKLIN_HAN.ranks.SCIENCE);
    assert.deepEqual([...auto.values()], [1, 2, 3, 4, 5, 6]);
    assert.ok(auto.has("MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA"), "the science pick for a science game");
    assert.deepEqual([...rankMementos(FRANKLIN_HAN, "BALANCED").keys()], FRANKLIN_HAN.ranks.BALANCED);
    assert.deepEqual(MODES, ["AUTO", "BALANCED", ...MEMENTO_TABLE.focuses]);
});

test("mementos the player cannot equip are skipped; the spares fill in, ranks stay 1..6", () => {
    const top = FRANKLIN_HAN.ranks.SCIENCE;
    const spares = FRANKLIN_HAN.more.SCIENCE;
    const available = new Set([...top.slice(1), ...spares]);
    const r = rankMementos(FRANKLIN_HAN, "SCIENCE", available);
    assert.equal(r.size, SHOWN);
    assert.ok(!r.has(top[0]), "not unlocked");
    assert.equal(r.get(top[1]), 1, "the next one moves up");
    assert.equal(r.get(spares[0]), 6, "the first spare comes in");
    assert.equal(rankMementos(FRANKLIN_HAN, "SCIENCE", new Set()).size, 0, "nothing unlocked: no badge");
});

test("an unknown pair falls back to the leader alone, then to any leader", () => {
    const leaderOnly = getPicks("LEADER_BENJAMIN_FRANKLIN", "RANDOM");
    assert.equal(leaderOnly, MEMENTO_TABLE.picks["LEADER_BENJAMIN_FRANKLIN|*@AGE_ANTIQUITY"]);
    const any = getPicks("RANDOM", "RANDOM");
    assert.equal(any, MEMENTO_TABLE.picks["*|*@AGE_ANTIQUITY"]);
    assert.equal(rankMementos(any, "AUTO").size, SHOWN);
    assert.equal(rankMementos(null, "AUTO").size, 0);
});

test("the screen adapter: leader and civilization from the game setup (age transition: its own civilization), unlocked mementos, icons, language", async () => {
    const UNLOCKED = 1, LOCKED = 2;
    const yasakani = MEMENTO_TABLE.mementos.MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA;
    const params = { PlayerLeader: "LEADER_BENJAMIN_FRANKLIN", PlayerCivilization: "CIVILIZATION_HAN", AgeTransitionPlayerCivilization: "CIVILIZATION_MING" };
    let inGame = false;
    Object.assign(globalThis, {
        GameContext: { localPlayerID: 0 },
        UI: { isInGame: () => inGame },
        GameSetup: { findPlayerParameter: (_pid, id) => (params[id] ? { value: { value: params[id] } } : null) },
        DisplayType: { DISPLAY_UNLOCKED: UNLOCKED, DISPLAY_LOCKED: LOCKED },
        Online: { Metaprogression: { getMementosData: () => [
            { mementoTypeId: "MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA", mementoIcon: yasakani.icon, displayType: UNLOCKED },
            { mementoTypeId: "MEMENTO_FOUNDATION_CORPUS_JURIS_CIVILIS", mementoIcon: "x", displayType: LOCKED },
        ] } },
        Locale: { getCurrentDisplayLocale: () => "ru_RU", compose: (k) => k },
    });
    const { readContext, typeOfIcon, nameOf } = await import("../../mod/memento-advisor/ui/mma-context.js");
    let ctx = readContext();
    assert.equal(ctx.picks, FRANKLIN_HAN);
    assert.deepEqual([...ctx.available], ["MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA"], "locked ones are not available");
    assert.equal(typeOfIcon(ctx, yasakani.icon), "MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA");
    assert.equal(typeOfIcon(ctx, MEMENTO_TABLE.mementos.MEMENTO_CONFUCIUS_ANALECTS.icon), "MEMENTO_CONFUCIUS_ANALECTS", "the table knows the rest");
    assert.equal(ctx.lang, "ru");
    assert.equal(nameOf("leader", ctx.leader, ctx.lang), "Бенджамин Франклин");
    inGame = true;
    ctx = readContext();
    assert.equal(ctx.picks, getPicks("LEADER_BENJAMIN_FRANKLIN", "CIVILIZATION_MING"), "the age transition's civilization");
    // No memento data (an API change): every memento counts.
    Online.Metaprogression.getMementosData = () => { throw new Error("gone"); };
    assert.equal(readContext().available, null);
});

// A card as the screen draws it (research/15 §1.5): the root .img-unit-panelbox, its icons
// [data-name="Icon"][name="url('blp:<icon>')"], the class memento-select-locked when locked.
function fakeCard(icon, locked) {
    const card = {
        children: [],
        classList: { contains: (c) => c === "memento-select-locked" && locked },
        querySelectorAll: () => [{ getAttribute: () => `url('blp:${icon}')` }],
        appendChild(child) {
            child.remove = () => card.children.splice(card.children.indexOf(child), 1);
            card.children.push(child);
        },
    };
    return card;
}
const badgeOf = (card) => card.children.find((c) => c.classList.contains("mma-badge"))?.textContent ?? null;

test("the cards have the last word: a memento the screen offers unlocked is ranked even if the game's data says locked (Mattifus's «unlock all»)", async () => {
    globalThis.document = {
        createElement: () => {
            const e = { className: "", textContent: "", attrs: {} };
            e.classList = { contains: (c) => e.className.split(" ").includes(c) };
            e.getAttribute = (k) => e.attrs[k] ?? null;
            e.setAttribute = (k, v) => { e.attrs[k] = v; };
            return e;
        },
    };
    const { equippable } = await import("../../mod/memento-advisor/ui/mma-ranking.js");
    const { MmaScreenDecorator } = await import("../../mod/memento-advisor/ui/mma-decorator.js");
    const top = FRANKLIN_HAN.ranks.SCIENCE;
    const spares = FRANKLIN_HAN.more.SCIENCE;
    const icon = (t) => MEMENTO_TABLE.mementos[t].icon;
    // The game's data: only the spares unlocked. The screen: the first pick shown unlocked, the second locked.
    const cards = [fakeCard(icon(top[0]), false), fakeCard(icon(top[1]), true), fakeCard(icon(spares[0]), false)];
    const list = { querySelectorAll: () => cards };
    const deco = new MmaScreenDecorator({ Root: { querySelector: (s) => (s.includes("create-game-mementos-slot") ? list : null) } });
    deco.list = list; // the tab is open: keep this context instead of reading the engine
    deco.ctx = { picks: FRANKLIN_HAN, available: new Set(spares), iconToType: new Map(), lang: "en" };
    deco.mode = "SCIENCE";
    deco.reconcile();
    assert.equal(badgeOf(cards[0]), "1", "shown unlocked: equippable, ranked first");
    assert.equal(badgeOf(cards[1]), null, "a locked card gets no number");
    assert.equal(badgeOf(cards[2]), "2", "the first unlocked spare follows");
    deco.reconcile();
    assert.equal(cards[0].children.length, 1, "never twice on one card");
    assert.equal(equippable(null, new Map([["X", true]])), null, "no memento data: everything counts");
});
