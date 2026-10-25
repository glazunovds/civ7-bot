// Memento Advisor in any age (game 60). The game lets any civilization play in any age: Catherine
// played Russia, a Modern civilization, in Antiquity, and took a random civilization at the age
// change. The mementos are chosen again at every transition, so a pick is scored for the age it is
// chosen for (the start age, or the next age), not for the civilization's own age.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPicks, pickAge, MEMENTO_TABLE as T } from "../../mod/memento-advisor/data/mma-table.js";

const reasonsText = (p, lang) => Object.values(p.reasons).map((r) => r[lang]).join("\n");

test("a pair played outside its civilization's own age gets that age's picks (game 60: Catherine + Russia in Antiquity)", () => {
    assert.equal(T.civs.CIVILIZATION_RUSSIA.age, "MO", "Russia is a Modern civilization");
    const aq = getPicks("LEADER_CATHERINE", "CIVILIZATION_RUSSIA", "AGE_ANTIQUITY");
    const own = getPicks("LEADER_CATHERINE", "CIVILIZATION_RUSSIA");
    assert.equal(aq, T.picks["LEADER_CATHERINE|CIVILIZATION_RUSSIA@AGE_ANTIQUITY"]);
    assert.equal(aq.age, "AQ");
    assert.equal(aq.ageType, "AGE_ANTIQUITY");
    assert.equal(own.age, "MO", "no age given: the civilization's own");
    assert.equal(aq.focus, "CULTURE", "Catherine's Antiquity victory (TRAIT_AQ_CULTURE_VICTORY)");
    assert.equal(own.focus, "SCIENCE", "her Modern one");
    assert.notDeepEqual(aq.ranks.CULTURE, own.ranks.CULTURE, "Antiquity's numbers rank the mementos differently");
    // The estimates in the reasons are Antiquity's.
    assert.match(reasonsText(aq, "en"), /per turn in Antiquity/);
    assert.doesNotMatch(reasonsText(aq, "en"), /in Modern|in Exploration/);
    assert.match(reasonsText(aq, "ru"), /в античности/);
    // The short keys name the same picks.
    assert.equal(getPicks("LEADER_CATHERINE", "CIVILIZATION_RUSSIA", "AQ"), aq);
    assert.equal(pickAge("CIVILIZATION_RUSSIA", null), "AGE_MODERN");
    assert.equal(pickAge("CIVILIZATION_RUSSIA", "EX"), "AGE_EXPLORATION");
    assert.equal(pickAge("RANDOM", undefined), "AGE_ANTIQUITY");
});

test("the Auto victory follows the leader's trait for the age chosen for", () => {
    assert.equal(getPicks("LEADER_NAPOLEON", "CIVILIZATION_ROME", "AGE_ANTIQUITY").focus, "MILITARY");   // TRAIT_AQ_MILITARY_VICTORY
    assert.equal(getPicks("LEADER_NAPOLEON", "CIVILIZATION_ROME", "AGE_EXPLORATION").focus, "SCIENCE");  // TRAIT_EX_SCIENCE_VICTORY
    assert.equal(getPicks("LEADER_NAPOLEON", "CIVILIZATION_ROME", "AGE_MODERN").focus, "ECONOMIC");      // TRAIT_MO_ECONOMIC_VICTORY
});

test("a civilization's ability is the one of the age it is played in (the Ottomans in Antiquity: war and celebrations)", () => {
    const civ = T.civs.CIVILIZATION_OTTOMANS;
    assert.equal(civ.age, "MO");
    assert.ok(!civ.tags.includes("war"), "its Modern ability says nothing of war");
    assert.ok(civ.ageTags.AQ.includes("war") && civ.ageTags.AQ.includes("celebration"), "its Antiquity ability does");
    const aq = getPicks("LEADER_CONFUCIUS", "CIVILIZATION_OTTOMANS", "AGE_ANTIQUITY");
    // The ranking itself is scored with that ability (build_table.py rank_pair), not only the reasons:
    // with the Modern one Antiquity's six would hold Ada Lovelace's Note G and the Corona Civica instead.
    const mil = aq.ranks.MILITARY;
    assert.ok(mil.includes("MEMENTO_TUBMAN_SIDEARM") && mil.includes("MEMENTO_FRIEDRICH_OBLIQUE_KRONE_VON_FRIEDRICH"), mil.join(", "));
    assert.ok(!mil.includes("MEMENTO_ADA_LOVELACE_NOTE_G") && !mil.includes("MEMENTO_AUGUSTUS_CORONA_CIVICA"), mil.join(", "));
    const war = [...aq.ranks.MILITARY, ...aq.more.MILITARY].filter((t) => T.mementos[t].tags.includes("war"));
    assert.ok(war.length > 0, "a war memento in the military list");
    for (const t of war) assert.match(aq.reasons[t].en, /Ottomans \([^)]*\bwar\b/, t);
    const mo = getPicks("LEADER_CONFUCIUS", "CIVILIZATION_OTTOMANS", "AGE_MODERN");
    for (const [t, r] of Object.entries(mo.reasons)) {
        if (T.mementos[t].tags.includes("war")) assert.doesNotMatch(r.en, /Ottomans \([^)]*\bwar\b/, t);
    }
});

test("a random civilization falls back to the leader alone in that age, then to anyone in that age", () => {
    const ex = getPicks("LEADER_CATHERINE", "RANDOM", "AGE_EXPLORATION");
    assert.equal(ex, T.picks["LEADER_CATHERINE|*@AGE_EXPLORATION"]);
    assert.equal(ex.age, "EX");
    assert.equal(ex.focus, "SCIENCE", "Catherine's Exploration victory");
    const aq = getPicks("LEADER_CATHERINE", "RANDOM", "AGE_ANTIQUITY");
    assert.equal(aq.age, "AQ");
    assert.equal(aq.focus, "CULTURE");
    assert.notEqual(aq, ex);
    assert.equal(getPicks("LEADER_CATHERINE", "*", "AGE_MODERN").age, "MO");
    assert.equal(getPicks("RANDOM", "RANDOM", "AGE_MODERN"), T.picks["*|*@AGE_MODERN"]);
    assert.equal(getPicks("RANDOM", "CIVILIZATION_HAN", "AGE_MODERN"), T.picks["*|*@AGE_MODERN"]);
    assert.match(reasonsText(T.picks["*|*@AGE_MODERN"], "en"), /per turn in Modern/);
});

// The engine as research/15 §2 found it: GameSetup's "Age" game parameter (value and the domain's
// possible values with their sortIndex), the player parameters, UI.isInGame.
function fakeEngine({ params, age, inGame }) {
    const state = { params, age, inGame };
    Object.assign(globalThis, {
        GameContext: { localPlayerID: 0 },
        UI: { isInGame: () => state.inGame },
        GameSetup: {
            findPlayerParameter: (_pid, id) => (state.params[id] ? { value: { value: state.params[id] } } : null),
            findGameParameter: (id) => (id === "Age" ? state.age : null),
        },
        Online: { Metaprogression: { getMementosData: () => [] } },
        Locale: { getCurrentDisplayLocale: () => "ru_RU", compose: (k, ...a) => [k, ...a].join("|") },
    });
    return state;
}
const ageParam = (value) => ({
    value: { value },
    // Unsorted on purpose: the game sorts by sortIndex (age-select-model.js).
    domain: { possibleValues: [{ value: "AGE_MODERN", sortIndex: 30 }, { value: "AGE_ANTIQUITY", sortIndex: 10 }, { value: "AGE_EXPLORATION", sortIndex: 20 }] },
});

test("the screen adapter reads the age chosen for: the setup's start age in the front end, the next age at a transition", async () => {
    const engine = fakeEngine({
        params: { PlayerLeader: "LEADER_CATHERINE", PlayerCivilization: "CIVILIZATION_RUSSIA", AgeTransitionPlayerCivilization: "RANDOM" },
        age: ageParam("AGE_ANTIQUITY"),
        inGame: false,
    });
    const { readAge, readContext } = await import("../../mod/memento-advisor/ui/mma-context.js");
    // New game: the start age.
    assert.equal(readAge(false), "AGE_ANTIQUITY");
    let ctx = readContext();
    assert.equal(ctx.age, "AGE_ANTIQUITY");
    assert.equal(ctx.picks, getPicks("LEADER_CATHERINE", "CIVILIZATION_RUSSIA", "AGE_ANTIQUITY"));
    // In game the parameter is the age being played: its transition chooses for the next one.
    engine.inGame = true;
    assert.equal(readAge(true), "AGE_EXPLORATION");
    ctx = readContext();
    assert.equal(ctx.civ, "RANDOM");
    assert.equal(ctx.age, "AGE_EXPLORATION");
    assert.equal(ctx.picks, T.picks["LEADER_CATHERINE|*@AGE_EXPLORATION"], "random civilization: the leader alone, for Exploration");
    engine.age = ageParam("AGE_EXPLORATION");
    assert.equal(readAge(true), "AGE_MODERN");
    engine.age = ageParam("AGE_MODERN");
    assert.equal(readAge(true), "AGE_MODERN", "the last age has no next one");
    // No parameter: the age's successor, as the game's civ details read it.
    engine.age = null;
    globalThis.Game = { age: 1234 };
    globalThis.GameInfo = {
        AgeSuccessors: { lookup: (h) => (h === 1234 ? { AgeType: "AGE_ANTIQUITY", SuccessorAgeType: "AGE_EXPLORATION" } : null) },
        Ages: { lookup: () => ({ AgeType: "AGE_ANTIQUITY" }) },
    };
    assert.equal(readAge(true), "AGE_EXPLORATION");
    assert.equal(readAge(false), null);
    // Nothing answers: the civilization's own age.
    delete globalThis.GameInfo;
    assert.equal(readAge(true), null);
    engine.inGame = false;
    engine.params.PlayerCivilization = "CIVILIZATION_MING";
    assert.equal(readContext().picks, getPicks("LEADER_CATHERINE", "CIVILIZATION_MING"));
    assert.equal(readContext().age, "AGE_EXPLORATION");
});

// The in-game reading was not seen in game yet: UI.log says what each reader answered, and when the
// "Age" parameter already names the next age (the shell's legacy transition read it so) the
// successor of Game.age, the gameplay's own age, decides.
test("in game a parameter that disagrees with the successor of Game.age gives way, and UI.log says what each reader answered", async () => {
    const engine = fakeEngine({
        params: { PlayerLeader: "LEADER_CATHERINE", PlayerCivilization: "CIVILIZATION_RUSSIA", AgeTransitionPlayerCivilization: "CIVILIZATION_NORMAN" },
        age: ageParam("AGE_ANTIQUITY"),
        inGame: false,
    });
    const { ageReaders, readAge, readContext } = await import("../../mod/memento-advisor/ui/mma-context.js");
    const lines = [];
    const warn = console.warn;
    console.warn = (t) => lines.push(String(t));
    try {
        readContext();
        assert.deepEqual(lines, ["[MMA] advice for LEADER_CATHERINE + CIVILIZATION_RUSSIA in AGE_ANTIQUITY (the setup's start age)"]);
        // The transition from Antiquity: Game.age is Antiquity and its successor Exploration.
        engine.inGame = true;
        globalThis.Game = { age: 1234 };
        globalThis.GameInfo = {
            AgeSuccessors: { lookup: (h) => (h === 1234 ? { AgeType: "AGE_ANTIQUITY", SuccessorAgeType: "AGE_EXPLORATION" } : null) },
            Ages: { lookup: () => ({ AgeType: "AGE_ANTIQUITY" }) },
        };
        lines.length = 0;
        assert.equal(readContext().age, "AGE_EXPLORATION");
        assert.deepEqual(lines, ["[MMA] advice for LEADER_CATHERINE + CIVILIZATION_NORMAN in AGE_EXPLORATION (Age parameter AGE_ANTIQUITY, next by sortIndex AGE_EXPLORATION, successor of Game.age AGE_EXPLORATION)"]);
        // The parameter already names the next age: its "next" would be Modern.
        engine.age = ageParam("AGE_EXPLORATION");
        assert.deepEqual(ageReaders(true), { age: "AGE_EXPLORATION", current: "AGE_EXPLORATION", next: "AGE_MODERN", successor: "AGE_EXPLORATION", disagree: true });
        assert.equal(readAge(true), "AGE_EXPLORATION");
        lines.length = 0;
        const ctx = readContext();
        assert.equal(ctx.picks, getPicks("LEADER_CATHERINE", "CIVILIZATION_NORMAN", "AGE_EXPLORATION"));
        assert.match(lines[0], /next by sortIndex AGE_MODERN, successor of Game\.age AGE_EXPLORATION; they disagree: the successor is taken\)$/);
        // The last age has no successor: the parameter's own.
        engine.age = ageParam("AGE_MODERN");
        globalThis.Game = { age: 99 };
        assert.equal(readAge(true), "AGE_MODERN");
        // Nothing answers: the civilization's own age, and the line says so.
        engine.age = null;
        delete globalThis.GameInfo;
        lines.length = 0;
        assert.equal(readContext().age, "AGE_EXPLORATION");
        assert.equal(lines[0], "[MMA] advice for LEADER_CATHERINE + CIVILIZATION_NORMAN in AGE_EXPLORATION (no age read: the civilization's own (AGE_EXPLORATION))");
    } finally {
        console.warn = warn;
        delete globalThis.Game;
        delete globalThis.GameInfo;
    }
});

// Just enough of an element for the decorator's row (ensureSwitch).
function fakeElement() {
    const e = { className: "", textContent: "", attrs: {}, children: [] };
    e.classList = { contains: (c) => e.className.split(" ").includes(c) };
    e.getAttribute = (k) => e.attrs[k] ?? null;
    e.setAttribute = (k, v) => { e.attrs[k] = v; };
    e.appendChild = (c) => { e.children.push(c); };
    e.addEventListener = () => {};
    Object.defineProperty(e, "childElementCount", { get: () => e.children.length });
    Object.defineProperty(e, "innerHTML", { set: () => { e.children = []; } });
    return e;
}

test("the row says which age the advice is for", async () => {
    fakeEngine({ params: {}, age: null, inGame: false });
    globalThis.document = { createElement: fakeElement };
    const { MmaScreenDecorator } = await import("../../mod/memento-advisor/ui/mma-decorator.js");
    const label = (ctx) => {
        let row = null;
        const bar = { parentElement: { insertBefore: (r) => { row = r; } }, nextElementSibling: null, nextSibling: null };
        const deco = new MmaScreenDecorator({ Root: { querySelector: (s) => (s === ".memento-select-filter-bar" ? bar : null) } });
        deco.ctx = ctx;
        deco.ensureSwitch();
        return row.children[0].textContent;
    };
    const leader = T.leaders.LEADER_CATHERINE.name.ru;
    const civ = T.civs.CIVILIZATION_RUSSIA.name.ru;
    assert.equal(label({ leader: "LEADER_CATHERINE", civ: "CIVILIZATION_RUSSIA", age: "AGE_ANTIQUITY",
        picks: getPicks("LEADER_CATHERINE", "CIVILIZATION_RUSSIA", "AGE_ANTIQUITY"), lang: "ru" }),
    `LOC_MMA_FOR_PAIR|${leader}|${civ}|Античность`);
    assert.equal(label({ leader: "LEADER_CATHERINE", civ: "RANDOM", age: "AGE_EXPLORATION",
        picks: getPicks("LEADER_CATHERINE", "RANDOM", "AGE_EXPLORATION"), lang: "en" }),
    `LOC_MMA_FOR_LEADER|${T.leaders.LEADER_CATHERINE.name.en}|Exploration`);
    assert.equal(label({ leader: null, civ: null, age: "AGE_MODERN", picks: getPicks("*", "*", "AGE_MODERN"), lang: "en" }),
        "LOC_MMA_FOR_ANY|Modern");
});
