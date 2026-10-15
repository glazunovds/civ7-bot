// The victory focus is kept in the save (GameTutorial), so the new age's autopilot starts from it (game 19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

installFakeEngine({ width: 10, height: 10, wrapX: false, tiles: () => ({ terrain: "TERRAIN_FLAT" }), players: [{ id: 0 }], cities: [] });
const { saveFocus, savedFocus } = await import("../mod/expansion-planner/ui/data/xpl-victory.js");

test("the focus survives in the save; nonsense is not kept", () => {
    assert.equal(savedFocus(), null);
    saveFocus("SCIENCE");
    assert.equal(savedFocus(), "SCIENCE");
    saveFocus("MILITARY");
    assert.equal(savedFocus(), "SCIENCE", "never military");
    saveFocus("CULTURE");
    assert.equal(savedFocus(), "CULTURE");
});
