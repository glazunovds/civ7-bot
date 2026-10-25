// Every [XPL] line carries the age's letter and the game turn (game 60: a pass writes its unit lines before its `gold: T67`
// line, so reviews that dated lines by the gold line put 395 of 398 formation and defence lines a turn early).
import { test } from "node:test";
import assert from "node:assert/strict";
import { log, LINE_MAX, turnStamp, utf8Length } from "../mod/expansion-planner/ui/services/xpl-log.js";

const capture = (fn) => {
    const lines = [];
    const [warn, error] = [console.warn, console.error];
    console.warn = (...a) => lines.push(a.join(" "));
    console.error = (...a) => lines.push(a.join(" "));
    try {
        fn();
    } finally {
        [console.warn, console.error] = [warn, error];
    }
    return lines;
};

test("without the game no stamp: the shell's and Node's lines stay `[XPL] message`", () => {
    assert.equal(turnStamp(), "");
    assert.deepEqual(capture(() => log.info("short line")), ["[XPL] short line"]);
});

test("in a game every line, each part of a long one too, is stamped with the age's letter and the turn; the level follows it", () => {
    const ages = [{ AgeType: "AGE_ANTIQUITY", $hash: 11 }, { AgeType: "AGE_EXPLORATION", $hash: 22 }, { AgeType: "AGE_MODERN", $hash: 33 }];
    globalThis.GameInfo = { Ages: { lookup: (h) => ages.find((a) => a.$hash === h) ?? null } };
    globalThis.Game = { age: 11, turn: 67 };
    try {
        assert.deepEqual(capture(() => log.info("pass: full")), ["[XPL] A67 pass: full"]);
        assert.deepEqual(capture(() => log.warn("gold: T67")), ["[XPL] A67 WARN gold: T67"]);
        assert.deepEqual(capture(() => log.error("x")), ["[XPL] A67 ERROR x"]);
        // A new age and turn are read on every line.
        Game.age = 33;
        Game.turn = 5;
        const long = Array.from({ length: 300 }, (_, i) => `u${i}`).join(" ");
        const lines = capture(() => log.info(`units: ${long}`));
        assert.ok(lines.length >= 2, `${lines.length} part(s)`);
        assert.ok(lines.every((l) => l.startsWith("[XPL] M5 ") && l.length <= LINE_MAX + 40), lines.map((l) => l.slice(0, 12)).join(" | "));
        const joined = lines.map((l) => l.replace(/^\[XPL\] M5 (… )?/, "").replace(/ \[\d+\/\d+\]$/, "")).join("");
        assert.equal(joined, `units: ${long}`);
        Game.age = 22;
        assert.equal(turnStamp(), "E5");
        // An age the table does not know: its own first letter; no turn: no stamp.
        Game.age = 99;
        assert.equal(turnStamp(), "T5");
        Game.turn = undefined;
        assert.equal(turnStamp(), "");
    } finally {
        delete globalThis.Game;
        delete globalThis.GameInfo;
    }
});

test("UI.log cuts at 1,022 bytes, not characters: a long Russian line goes out in parts that fit with the time stamp, never cut inside a letter", () => {
    // Game 60's Modern `economy:` lines stopped at 1,022 bytes, 904-909 characters of settlement names: never split.
    assert.deepEqual([utf8Length("abc"), utf8Length("Норидж"), utf8Length("…"), utf8Length("😀")], [3, 12, 3, 4]);
    const ages = [{ AgeType: "AGE_MODERN", $hash: 33 }];
    globalThis.GameInfo = { Ages: { lookup: (h) => ages.find((a) => a.$hash === h) ?? null } };
    globalThis.Game = { age: 33, turn: 140 };
    const STAMP = "[2026-10-24 16:51:14]\t";
    try {
        const towns = Array.from({ length: 40 }, (_, i) => `Франкфурт-на-Майне${i}(t) 17/8/5/5 u4 r4 s0`).join("; ");
        const message = `economy: T140 AGE_MODERN: ${towns}`;
        assert.ok(message.length < 2 * LINE_MAX && utf8Length(message) > 2 * LINE_MAX, `${message.length} characters, ${utf8Length(message)} bytes`);
        const lines = capture(() => log.error(message));
        assert.ok(lines.length >= 3, `${lines.length} part(s)`);
        for (const l of lines) assert.ok(Buffer.byteLength(STAMP + l, "utf8") <= 1022, `${Buffer.byteLength(STAMP + l, "utf8")} bytes`);
        assert.ok(lines.every((l) => !l.includes("�")));
        const joined = lines.map((l) => l.replace(/^\[XPL\] M140 ERROR (… )?/, "").replace(/ \[\d+\/\d+\]$/, "")).join("");
        assert.equal(joined, message);
        // 600 Russian letters (1,200 bytes) are two lines; 450 (900 bytes) one.
        assert.equal(capture(() => log.info("ж".repeat(600))).length, 2);
        assert.equal(capture(() => log.info("ж".repeat(450))).length, 1);
    } finally {
        delete globalThis.Game;
        delete globalThis.GameInfo;
    }
});
