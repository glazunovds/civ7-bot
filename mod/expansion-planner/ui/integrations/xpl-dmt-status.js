/**
 * Detailed Map Tacks (DMT) detection.
 *
 * "Active" means our ModInUse-gated script (xpl-dmt-present.js) ran, which only
 * happens when DMT is enabled for this game. A successful import of DMT files is
 * not proof on its own: a mounted-but-disabled mod has no change processor listening.
 *
 * L0 = absent, L1 = active (event-only bridge). L2 (shared modules) is probed in M2.
 */
import { log } from '../services/xpl-log.js';

export const DMT_PRESENT_EVENT = "xpl-dmt-present";

export function isDmtActive() {
    return globalThis.__XPL_DMT_ACTIVE === true;
}

export function dmtLevel() {
    return isDmtActive() ? "L1" : "L0";
}

/**
 * Probe whether the locally patched DMT build is installed (its patch added
 * dmt-adjacency-rules.js, which upstream DMT does not ship). Informational only:
 * the cross-check against DMT's yield preview in later milestones is enabled only
 * when this returns true.
 */
export async function probeDmtPatch() {
    if (!isDmtActive()) {
        return false;
    }
    try {
        await import('/detailed-map-tacks/ui/map-tack-core/dmt-adjacency-rules.js');
        return true;
    } catch (_error) {
        return false;
    }
}

export function onDmtPresent(callback) {
    if (isDmtActive()) {
        callback();
        return;
    }
    window.addEventListener(DMT_PRESENT_EVENT, () => callback(), { once: true });
}

export function describeDmt() {
    const level = dmtLevel();
    log.debug("dmt level", level);
    return level;
}
