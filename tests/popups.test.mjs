// Information windows the autopilot closes by itself: only windows that inform (tech learned,
// unlocks, legacy milestones, age and advisor warnings, wonder videos, tutorial, the turn-4
// advisor choice, victory progress), story windows only when it answers stories itself, and
// never diplomacy, confirmations, the end of the game, syncretism or espionage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closable, isInfoPopup } from "../mod/expansion-planner/ui/core/xpl-popups.js";

test("information windows are closed", () => {
    for (const category of ["TechCivicPopup", "UnlockPopup", "TrimpuhCompletePopup", "AgeProgressionPopup", "WatchOutManager", "Cinematic", "TutorialManager"]) {
        assert.ok(isInfoPopup({ category }), category);
    }
    assert.ok(isInfoPopup({ category: "PopupSequencer", screenId: "advisor-council-popup" }));
    assert.ok(isInfoPopup({ category: "PopupSequencer", screenId: "screen-victories-popup" }));
});

test("decisions are never closed", () => {
    for (const category of ["DiplomacyDialog", "DiplomacyDeal", "DiplomaticResponseUIData", "gameDialogBox", "shellDialogBox", "EndGameScreen", "SystemMessage"]) {
        assert.ok(!isInfoPopup({ category }, { stories: true }), category);
    }
    for (const screenId of ["screen-syncretism-confirm", "syncretism-info-card"]) {
        assert.ok(!isInfoPopup({ category: "PopupSequencer", screenId }, { stories: true }), screenId);
    }
});

test("the report of a rival's spy action is only news (its buttons close it or open diplomacy, sending nothing)", () => {
    assert.ok(isInfoPopup({ category: "PopupSequencer", screenId: "screen-espionage-details" }));
});

test("story windows only while the autopilot answers stories", () => {
    assert.ok(!isInfoPopup({ category: "Narrative" }, { stories: false }));
    assert.ok(isInfoPopup({ category: "Narrative" }, { stories: true }));
});

test("an active pop-up is closed only once its window is drawn; queued ones any time", () => {
    const tech = { category: "TechCivicPopup" };
    assert.ok(closable(tech, { active: false }), "still queued: it never shows");
    assert.ok(!closable(tech, { active: true, showing: false }), "active but not drawn yet (the first one after a load waits 40 frames)");
    assert.ok(closable(tech, { active: true, showing: true }));
    assert.ok(!closable({ category: "DiplomacyDialog" }, { active: true, showing: true }));
});

test("a leader's dialog that only informs is closed after 5 s; not a first meeting, not with a deal waiting (research/24 W7)", async () => {
    const { leaderDialogClosable } = await import("../mod/expansion-planner/ui/core/xpl-popups.js");
    const war = { Choices: [{ ChoiceType: "CHOICE_ACKNOWLEDGE" }, { ChoiceType: "CHOICE_EXIT" }], StatementFrameDef: { Selections: "CHOICES_DECLARE_WAR" } };
    assert.equal(leaderDialogClosable(war, { shownMs: 6000 }), true);
    assert.equal(leaderDialogClosable(war, { shownMs: 3000 }), false, "not yet");
    assert.equal(leaderDialogClosable(war, { shownMs: 6000, pendingDeal: true }), false);
    assert.equal(leaderDialogClosable({ ...war, StatementFrameDef: { Selections: "CHOICES_FIRST_MEET_NO_MANS" } }, { shownMs: 6000 }), false);
    assert.equal(leaderDialogClosable({ ...war, DealAction: 4 }, { shownMs: 6000, dealActions: { PROPOSED: 4, ADJUSTED: 3 } }), false, "a proposal");
    assert.equal(leaderDialogClosable({ Choices: [{ ChoiceType: "CHOICE_ACCEPT_DEAL" }] }, { shownMs: 6000 }), false);
});
