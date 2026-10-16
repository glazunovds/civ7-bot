// The victory focus is kept in the save (GameTutorial) and in the settings' memory of this game (the save's properties
// do not outlive an age change: game 22), so the new age's autopilot starts from it (game 19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";

installFakeEngine({ width: 10, height: 10, wrapX: false, tiles: () => ({ terrain: "TERRAIN_FLAT" }), players: [{ id: 0 }], cities: [] });
const { saveFocus, savedFocus } = await import("../mod/expansion-planner/ui/data/xpl-victory.js");
const { gameKey, settings } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

test("the focus survives in the save; nonsense is not kept", () => {
    assert.equal(savedFocus(), null);
    saveFocus("SCIENCE");
    assert.equal(savedFocus(), "SCIENCE");
    saveFocus("MILITARY");
    assert.equal(savedFocus(), "SCIENCE", "never military");
    saveFocus("CULTURE");
    assert.equal(savedFocus(), "CULTURE");
});

test("the save's properties do not outlive an age change: the settings remember the focus of this game (game 22: our tacks and the age's samples were gone at E1 and M1)", () => {
    saveFocus("ECONOMIC");
    GameTutorial._props.clear(); // the age change
    assert.equal(savedFocus(), "ECONOMIC");
    assert.ok(gameKey().startsWith("1234|"), gameKey());
    // Another game's memory: nothing for this one.
    settings.remember("another game", { focus: "CULTURE" });
    assert.equal(savedFocus(), null);
    // Kept in the settings' blob, a plain value.
    saveFocus("SCIENCE");
    GameTutorial._props.clear();
    assert.deepEqual(settings.get().memory, { game: gameKey(), values: { focus: "SCIENCE" } });
});
