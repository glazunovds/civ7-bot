import { test } from "node:test";
import assert from "node:assert/strict";
const { state } = await import("../mod/expansion-planner/ui/services/xpl-state.js");

test("a listener that re-triggers itself is stopped instead of overflowing the stack", () => {
    let calls = 0;
    const off = state.subscribe(() => {
        calls++;
        state.set({ selection: { sites: new Set([calls]) } });
    });
    state.set({ selection: { sites: new Set() } });
    off();
    assert.ok(calls <= 9, `calls ${calls}`);
});
