/**
 * Marks the growth choice on the map while the game asks where a new citizen goes
 * (INTERFACEMODE_ACQUIRE_TILE, opened by the "new population" notification):
 *  - the best rural tile by your priorities (glow + label), and the plan's tiles among
 *    the choices ("needed by the plan" / "will become urban");
 *  - the specialist tile that gains most (the game's own before/after numbers).
 * Only draws; the choice stays the player's. Setting buildings.growthHints (on by default).
 */
import { InterfaceMode, InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import { growthAdvice } from '../data/xpl-growth-job.js';
import { settings } from '../services/xpl-settings.js';
import { log } from '../services/xpl-log.js';

const MODE = "INTERFACEMODE_ACQUIRE_TILE";
const HEX_VFX = "VFX_3dUI_Hex_Highlight_01";
const ORIGIN = { x: 0, y: 0, z: 0 };
const LABEL_OFFSET = { x: 0, y: -14, z: 3 };
const LABEL_STYLE = { fonts: ["TitleFont"], fontSize: 5, faceCamera: true };
const BEST_RGB = [0.45, 0.95, 0.35];
const SPECIALIST_RGB = [0.45, 0.65, 1.0];
const RUNNER_UP_ALPHA = 0.35; // the other kind's best option glows faintly

let labels = null;
let glow = null;
let shownFor = null;

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

function ensure() {
    if (labels) return true;
    try {
        labels = WorldUI.createSpriteGrid("XPL_GrowthLabels", true);
        glow = WorldUI.createModelGroup("XPL_GrowthGlow");
        labels.setVisible?.(true);
        glow.setVisible?.(true);
        return true;
    } catch (error) {
        log.debug("growth overlay init failed", error);
        labels = null;
        return false;
    }
}

function clear() {
    shownFor = null;
    try {
        labels?.clear();
        glow?.clear();
    } catch (error) {
        log.debug("growth overlay clear failed", error);
    }
}

function mark(idx, text, rgb, alpha = 0.8) {
    try {
        if (rgb) glow.addVFXAtPlot(HEX_VFX, idx, ORIGIN, { angle: 0, constants: { Color3: rgb, Alpha1: alpha } });
        if (text) labels.addText(idx, text, LABEL_OFFSET, LABEL_STYLE);
    } catch (error) {
        log.debug("growth mark failed", error);
    }
}

function show(cityID) {
    clear();
    if (settings.get().buildings?.growthHints === false || !cityID || !ensure()) return;
    const a = growthAdvice(cityID, settings.get());
    if (!a) return;
    shownFor = cityID;
    for (const e of a.expand) {
        if (e === a.best) continue;
        if (e.planned.length > 0) mark(e.idx, compose(!e.owned ? "LOC_XPL_GROWTH_PLAN_NEEDS" : e.buildTurn !== null ? "LOC_XPL_GROWTH_URBAN_SOON_ETA" : "LOC_XPL_GROWTH_URBAN_SOON", e.buildTurn ?? 0), null);
    }
    // One overall winner ("best choice"), the other kind's best as the runner-up, both with
    // their value (weighted yields per turn; a specialist's after its food/happiness upkeep).
    const value = (v) => (Math.round(v * 10) / 10).toFixed(1);
    if (a.best) {
        const top = a.choice === "TILE";
        const plan = a.best.planned.length > 0 && !a.best.owned ? ` ${compose("LOC_XPL_GROWTH_PLAN_TAG")}` : "";
        mark(a.best.idx, compose(top ? "LOC_XPL_GROWTH_TOP_TILE" : "LOC_XPL_GROWTH_BEST_TILE", value(a.best.score)) + plan, BEST_RGB, top ? 0.85 : RUNNER_UP_ALPHA);
    }
    if (a.bestSpecialist && a.bestSpecialist.gain > 0) {
        const top = a.choice === "SPECIALIST";
        mark(a.bestSpecialist.idx, compose(top ? "LOC_XPL_GROWTH_TOP_SPECIALIST" : "LOC_XPL_GROWTH_SPECIALIST_N", value(a.bestSpecialist.gain)), SPECIALIST_RGB, top ? 0.85 : RUNNER_UP_ALPHA);
    }
    log.info(`growth advice (${a.choice ?? "-"}; city food ${a.food}, happiness ${a.happiness}): ${a.expand.length} tiles${a.best ? `, best ${a.best.x},${a.best.y} (${a.best.score})` : ""}; ${a.specialists.length} specialist tiles${a.bestSpecialist ? `, best ${a.bestSpecialist.x},${a.bestSpecialist.y} (${a.bestSpecialist.gain})` : ""}`);
}

function currentCity() {
    try {
        return InterfaceMode.getCurrent() === MODE ? InterfaceMode.getParameters()?.CityID ?? null : null;
    } catch (_e) {
        return null;
    }
}

window.addEventListener(InterfaceModeChangedEventName, (e) => {
    try {
        if (e.detail?.newMode === MODE) show(currentCity());
        else if (e.detail?.prevMode === MODE || shownFor) clear();
    } catch (error) {
        log.debug("growth advisor failed", error);
    }
});
// The game redraws its own choices after a specialist is placed: follow it.
window.addEventListener("plot-workers-updated", () => {
    const city = currentCity();
    if (city) show(city);
});
