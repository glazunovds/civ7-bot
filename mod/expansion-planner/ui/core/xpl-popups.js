/**
 * Which of the game's pop-ups the autopilot may close by itself: windows that only inform
 * ("technology learned", new unlocks, legacy milestones, the age warning, advisor warnings,
 * wonder cinematics, tutorial messages, the turn-4 advisor choice, victory progress, the report
 * of a rival's spy action revealed) and, when the autopilot answers story events itself, the
 * story windows. Never diplomacy, dialog boxes (confirmations), the end of the game, syncretism
 * or our own espionage actions. Requests are the game's
 * display-queue requests (`category` = the handler's name, `screenId` for PopupSequencer).
 */

// Display-queue handler categories (the game's own spelling, "Trimpuh" included).
const INFO_CATEGORIES = new Set([
    "TechCivicPopup",
    "UnlockPopup",
    "TrimpuhCompletePopup",
    "AgeProgressionPopup",
    "WatchOutManager",
    "Cinematic",
    "TutorialManager",
]);

// Screens shown through the generic PopupSequencer that only inform.
const INFO_SCREENS = new Set(["advisor-council-popup", "screen-victories-popup", "screen-espionage-details"]);

/**
 * May the autopilot close this request now? An information pop-up that is still queued, or
 * active with its window on screen. Not one that is active but not drawn yet: the first
 * technology pop-up after a load waits 40 frames; closed then, the game drew it anyway with
 * nothing behind it and its OK button could not close it (seen in game).
 * @param state { stories, active: the request is active, showing: its window is on screen }
 */
export function closable(request, { stories = false, active = false, showing = true } = {}) {
    return isInfoPopup(request, { stories }) && (!active || showing);
}

/**
 * @param request a display-queue request
 * @param options { stories: the autopilot answers story events (its "choices" option) }
 */
export function isInfoPopup(request, options = {}) {
    if (!request) return false;
    if (INFO_CATEGORIES.has(request.category)) return true;
    if (request.category === "Narrative") return !!options.stories;
    if (request.category === "PopupSequencer") return INFO_SCREENS.has(request.screenId);
    return false;
}
