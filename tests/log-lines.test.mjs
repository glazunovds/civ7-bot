// UI.log cuts every line at 1,022 characters (research/41 §2, P-LOG-1): our long lines go out in numbered parts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { log, LINE_MAX } from "../mod/expansion-planner/ui/services/xpl-log.js";

test("a message longer than a UI.log line goes out in numbered parts, each with the tag; a short one is one line", () => {
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        const params = Array.from({ length: 60 }, (_, i) => `EXPERIENCE_PARAMETER_NUMBER_${i}=${i}`).join(", ");
        log.warn(`commander parameters: ${params}`);
        assert.ok(lines.length >= 2, `${lines.length} line(s)`);
        assert.ok(lines.every((l) => l.startsWith("[XPL] WARN ") && l.length <= LINE_MAX + 40), lines.map((l) => l.length).join(","));
        assert.match(lines[0], /\[1\/\d\]$/);
        assert.match(lines[lines.length - 1], new RegExp(`\\[${lines.length}/${lines.length}\\]$`));
        // Nothing is lost: the parts put together are the message.
        const joined = lines.map((l) => l.replace(/^\[XPL\] WARN (… )?/, "").replace(/ \[\d+\/\d+\]$/, "")).join("");
        assert.equal(joined, `commander parameters: ${params}`);
        assert.ok(joined.includes("EXPERIENCE_PARAMETER_NUMBER_59=59"), "the last parameter is there");
        lines.length = 0;
        log.info("short line");
        assert.deepEqual(lines, ["[XPL] short line"]);
    } finally {
        console.warn = warn;
    }
});
