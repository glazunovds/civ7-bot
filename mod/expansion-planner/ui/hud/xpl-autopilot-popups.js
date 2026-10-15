/**
 * While the autopilot is on (and its "close information windows" option is ticked), closes
 * the game's information pop-ups as they appear, the same way their own close buttons do
 * (DisplayQueueManager.close*): queued ones never show. Which ones: core/xpl-popups.js.
 * Kept out of hud/xpl-autopilot.js because it imports the game's display queue.
 *
 * An active pop-up is closed only once its window is on screen (the handler's isShowing):
 * the first technology pop-up after a load waits 40 frames before it draws; closed during
 * that wait, the game still drew it afterwards with no queue entry behind it, and its OK
 * button could not close it (seen in game). Such an orphaned window is closed here too.
 */
import { DisplayQueueManager } from '/core/ui/context-manager/display-queue-manager.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import TechCivicPopupManager from '/base-standard/ui/tech-civic-complete/tech-civic-popup-manager.js';
import { closable, leaderDialogClosable } from '../core/xpl-popups.js';
import DiplomacyManager from '/base-standard/ui/diplomacy/diplomacy-manager.js';
import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import { answeredDealPlayers, setDiplomacyScreenProbe } from '../data/xpl-autopilot-choices.js';
import { isAutopilotOn } from './xpl-autopilot.js';
import { settings } from '../services/xpl-settings.js';
import { log } from '../services/xpl-log.js';

const POLL_MS = 1000;
const TECH_SCREEN = "screen-tech-civic-complete";

/** Is this active request's window on screen? (Handlers without isShowing: assume so.) */
function showing(request) {
    const handler = DisplayQueueManager.getHandler(request.category);
    return typeof handler?.isShowing === "function" ? !!handler.isShowing() : true;
}

function closeInfoPopups() {
    const o = settings.get().autopilot ?? {};
    if (!isAutopilotOn() || o.closePopups === false) return;
    const active = new Set(DisplayQueueManager.activeDisplays);
    const match = (r) => closable(r, { stories: o.choices !== false, active: active.has(r), showing: active.has(r) && showing(r) });
    if (DisplayQueueManager.findAll(match).length === 0) return;
    const closed = DisplayQueueManager.closeMatching(match);
    if (closed.length > 0) log.info(`autopilot: closed ${closed.map((r) => r.screenId ?? r.category).join(", ")}`);
}

/** A technology window on screen with no pop-up request behind it: close it. */
function closeOrphanedTechWindow() {
    if (!ContextManager.hasInstanceOf(TECH_SCREEN)) return;
    if (DisplayQueueManager.activeDisplays.some((r) => r.category === "TechCivicPopup")) return;
    TechCivicPopupManager.currentTechCivicPopupData = null;
    ContextManager.pop(TECH_SCREEN);
    log.info("autopilot: closed an orphaned technology window");
}

// Screens the autopilot must not end the turn under, nor propose peace over (research/23 D1, D2).
const DIPLOMACY_MODES = ["INTERFACEMODE_PEACE_DEAL", "INTERFACEMODE_DIPLOMACY_DIALOG", "INTERFACEMODE_DIPLOMACY_HUB"];
setDiplomacyScreenProbe(() => DIPLOMACY_MODES.some((m) => InterfaceMode.isInInterfaceMode(m)));

/**
 * A deal the autopilot answered (choices' answerIncomingDeals): its screen is closed the way the deal
 * panel closes it after its own accept or reject (DiplomacyManager.closeCurrentDiplomacyDeal, back to the
 * map), and a queued one never shows.
 */
function closeAnsweredDeals() {
    if (!isAutopilotOn()) return;
    const answered = answeredDealPlayers();
    if (answered.size === 0) return;
    const current = DiplomacyManager.currentDiplomacyDealData;
    if (current && answered.has(current.OtherPlayer)) {
        DiplomacyManager.closeCurrentDiplomacyDeal(true);
        if (InterfaceMode.isInInterfaceMode("INTERFACEMODE_PEACE_DEAL")) InterfaceMode.switchTo("INTERFACEMODE_DEFAULT");
        log.info("autopilot: closed an answered deal");
    }
    DisplayQueueManager.closeMatching((r) => r.category === "DiplomacyDeal" && answered.has(r.OtherPlayer));
}

/**
 * A leader's dialog that only informs (a war declared, peace accepted), on screen for LEADER_DIALOG_CLOSE_MS:
 * closed the way its own choices close it (DiplomacyManager.closeCurrentDiplomacyDialog: the session closed, the
 * request taken off the queue). Research/24 W7.
 */
let dialogShown = { data: null, since: 0 };
function closeLeaderDialogs() {
    const dialog = DiplomacyManager.currentDiplomacyDialogData;
    if (!isAutopilotOn() || !dialog || !InterfaceMode.isInInterfaceMode("INTERFACEMODE_DIPLOMACY_DIALOG")) {
        dialogShown = { data: null, since: 0 };
        return;
    }
    if (dialogShown.data !== dialog) dialogShown = { data: dialog, since: Date.now() };
    const other = dialog.OtherPlayerID;
    const pendingDeal = Number.isInteger(other) && !!Game.DiplomacyDeals?.hasPendingDeal?.(GameContext.localPlayerID, other);
    if (!leaderDialogClosable(dialog, { shownMs: Date.now() - dialogShown.since, pendingDeal, dealActions: globalThis.DiplomacyDealProposalActions ?? {} })) return;
    DiplomacyManager.closeCurrentDiplomacyDialog();
    log.info(`autopilot: closed a leader dialog (${dialog.StatementTypeDef?.StatementType ?? "?"}, leader ${other})`);
}

setInterval(() => {
    try {
        closeOrphanedTechWindow();
        closeAnsweredDeals();
        closeLeaderDialogs();
        closeInfoPopups();
    } catch (error) {
        log.debug("closing pop-ups failed", error);
    }
}, POLL_MS);
