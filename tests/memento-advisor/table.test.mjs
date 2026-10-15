// The Memento Advisor's generated table (mod/memento-advisor/data/mma-table.js, built by
// tools/memento-advisor/build_table.py). Shape checks for every pair, plus a few spot checks
// that guard the scoring's calibration (research/16-memento-scoring.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMENTO_TABLE, getPicks, mementoTypeByIcon } from "../../mod/memento-advisor/data/mma-table.js";

const FOCUSES = ["CULTURE", "SCIENCE", "ECONOMIC", "MILITARY"];
const RANKINGS = ["BALANCED", ...FOCUSES];
const AGE_OF = { AQ: "AQ", EX: "EX", MO: "MO" };

const T = MEMENTO_TABLE;
const top = (leader, civ, ranking) => getPicks(leader, civ).ranks[ranking];

test("header: version, rankings, build info", () => {
    assert.equal(T.version, 1);
    assert.deepEqual([...T.rankings], RANKINGS);
    assert.deepEqual([...T.focuses], FOCUSES);
    assert.ok(T.generatedFrom && T.generatedFrom.date, "generatedFrom.date");
});

test("every base-game memento is known, with names and a reason in both languages", () => {
    const types = Object.keys(T.mementos);
    assert.ok(types.filter((t) => T.mementos[t].source === "base").length >= 76);
    for (const t of types) {
        const m = T.mementos[t];
        assert.ok(m.name.en && m.name.ru, t + " name");
        assert.ok(m.reason.en && m.reason.ru, t + " reason");
        assert.ok(Array.isArray(m.tags), t + " tags");
        assert.equal(mementoTypeByIcon(m.icon), t, t + " icon maps back (icons are unique)");
    }
});

test("every leader and civilization has names in both languages", () => {
    for (const [k, v] of [...Object.entries(T.leaders), ...Object.entries(T.civs)]) {
        assert.ok(v.name.en && v.name.ru, k);
    }
    for (const c of Object.values(T.civs)) assert.ok(c.age in AGE_OF);
});

test("every leader + civilization pair (and each fallback) has 6 distinct known mementos per ranking", () => {
    const leaders = Object.keys(T.leaders);
    const civs = Object.keys(T.civs);
    const keys = ["*|*"];
    for (const l of leaders) {
        keys.push(l + "|*");
        for (const c of civs) keys.push(l + "|" + c);
    }
    assert.equal(Object.keys(T.picks).length, keys.length);
    for (const key of keys) {
        const p = T.picks[key];
        assert.ok(p, "missing " + key);
        assert.ok(FOCUSES.includes(p.focus), key + " focus " + p.focus);
        const civ = key.split("|")[1];
        assert.equal(p.age, civ === "*" ? "AQ" : T.civs[civ].age, key + " age");
        for (const r of RANKINGS) {
            const list = p.ranks[r];
            assert.equal(list.length, 6, key + " " + r);
            assert.equal(new Set(list).size, 6, key + " " + r + " distinct");
            const spare = p.more[r];
            assert.equal(spare.length, 6, key + " " + r + " spares");
            assert.equal(new Set([...list, ...spare]).size, 12, key + " " + r + " spares distinct");
            for (const t of [...list, ...spare]) {
                assert.ok(T.mementos[t], key + " unknown " + t);
                assert.ok(p.reasons[t] && p.reasons[t].en && p.reasons[t].ru, key + " reason " + t);
            }
        }
    }
});

test("getPicks falls back to the leader alone, then to *|*", () => {
    assert.equal(getPicks("LEADER_AMINA", "CIVILIZATION_NOT_A_CIV"), T.picks["LEADER_AMINA|*"]);
    assert.equal(getPicks("LEADER_NOT_A_LEADER", "CIVILIZATION_HAN"), T.picks["*|*"]);
});

test("spot check: Benjamin Franklin's science game wants Yasakani, Corpus Juris Civilis and the Analects", () => {
    const p = getPicks("LEADER_BENJAMIN_FRANKLIN", "CIVILIZATION_HAN");
    assert.equal(p.focus, "SCIENCE");
    for (const t of ["MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA", "MEMENTO_FOUNDATION_CORPUS_JURIS_CIVILIS",
        "MEMENTO_CONFUCIUS_ANALECTS"]) {
        assert.ok(p.ranks.SCIENCE.includes(t), t + " in " + p.ranks.SCIENCE);
    }
    assert.equal(p.ranks.SCIENCE[0], "MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA");
});

test("spot check: default focus follows the leader's victory trait for the civilization's age", () => {
    assert.equal(getPicks("LEADER_AMINA", "CIVILIZATION_AKSUM").focus, "ECONOMIC");
    assert.equal(getPicks("LEADER_NAPOLEON", "CIVILIZATION_ROME").focus, "MILITARY");       // TRAIT_AQ_MILITARY_VICTORY
    assert.equal(getPicks("LEADER_NAPOLEON", "CIVILIZATION_MING").focus, "SCIENCE");        // TRAIT_EX_SCIENCE_VICTORY
    assert.equal(getPicks("LEADER_NAPOLEON", "CIVILIZATION_FRENCH_EMPIRE").focus, "ECONOMIC"); // TRAIT_MO_ECONOMIC_VICTORY
    assert.equal(getPicks("LEADER_HIMIKO", "CIVILIZATION_HEIAN").focus, "SCIENCE");
    assert.equal(getPicks("LEADER_ASHOKA", "CIVILIZATION_MAURYA").focus, "CULTURE");
});

test("spot check: synergy lifts a leader's own lever", () => {
    // Amina's ability and Aksum are about resources: Kwalkwali ranks higher than with no leader or civ.
    const kw = "MEMENTO_AMINA_KWALKWALI";
    assert.ok(top("LEADER_AMINA", "CIVILIZATION_AKSUM", "ECONOMIC").indexOf(kw) >= 0);
    assert.ok(top("LEADER_AMINA", "CIVILIZATION_AKSUM", "ECONOMIC").indexOf(kw) < top("*", "*", "ECONOMIC").indexOf(kw));
    // Himiko's ability works through an ally: Glass Armonica leads her science list (second without her).
    const ga = "MEMENTO_BENJAMIN_FRANKLIN_GLASS_ARMONICA";
    assert.equal(top("LEADER_HIMIKO", "CIVILIZATION_HEIAN", "SCIENCE")[0], ga);
    assert.notEqual(top("*", "*", "SCIENCE")[0], ga);
    // A cavalry civilization raises the cavalry memento into the military list.
    const bu = "MEMENTO_ALEXANDER_BRIDLE_OF_BUCEPHALUS";
    assert.ok(top("LEADER_ASHOKA", "CIVILIZATION_MAURYA", "MILITARY").includes(bu));
    assert.ok(!top("*", "*", "MILITARY").includes(bu));
    // The reason names the match.
    const r = getPicks("LEADER_CONFUCIUS", "CIVILIZATION_ABBASID").reasons.MEMENTO_CONFUCIUS_ANALECTS;
    assert.match(r.en, /fits Confucius \(specialists\), Abbasid \(specialists\)/);
    assert.match(r.ru, /подходит: Конфуций/);
});
