/**
 * "Food network" map lens: who feeds whom.
 *  - Towns are tinted by their Focus (farming green, mining orange, other Focuses violet,
 *    still Growing pale blue); a town with a Focus but no connected city is red.
 *  - Cities are tinted gold; labels show the food each city receives and each town sends
 *    to every connected city.
 *  - A route line (the trade-route VFX, one segment per hex) runs from each sending town
 *    to each city it feeds.
 * Registered with the game's LensManager and offered in the mini-map lens menu; the
 * Empire tab can switch it on and off too.
 */
import LensManager from '/core/ui/lenses/lens-manager.js';
import { OVERLAY_PRIORITY } from '/base-standard/ui/utilities/utilities-overlay.js';
import { HexToFloat4 } from '/core/ui/utilities/utilities-color.js';
import { foodNetwork } from '../data/xpl-empire-job.js';
import { getEngineMap } from '../data/xpl-engine-map.js';
import { hexLine } from '../core/xpl-hex.js';
import { log } from '../services/xpl-log.js';

export const FOOD_LENS = "xpl-food-network-lens";
const FOOD_LAYER = "xpl-food-network-layer";
const DEFAULT_LENS = "fxs-default-lens";
const FILL_ALPHA = 0.45;
const COLOURS = {
    CITY: 0xf2d16b,
    FARM: 0x6ccf4a,
    MINE: 0xd98a3a,
    OTHER: 0xa57be0,
    GROWING: 0x8fc4ff,
    LONELY: 0xd04a3a,
};
const LINE_RGB = [0.6, 1.6, 0.4];
const ROUTE_VFX = "VFX_3dUI_TradeRoute_01";
const LABEL_OFFSET = { x: 0, y: -16, z: 3 };
const LABEL_STYLE = { fonts: ["TitleFont"], fontSize: 6, faceCamera: true };
const DIRECTION_NUMBER = () => ({
    [DirectionTypes.DIRECTION_EAST]: 1,
    [DirectionTypes.DIRECTION_SOUTHEAST]: 2,
    [DirectionTypes.DIRECTION_SOUTHWEST]: 3,
    [DirectionTypes.DIRECTION_WEST]: 4,
    [DirectionTypes.DIRECTION_NORTHWEST]: 5,
    [DirectionTypes.DIRECTION_NORTHEAST]: 6,
});

function compose(key, ...args) {
    try {
        return Locale.compose(key, ...args);
    } catch (_e) {
        return key;
    }
}

class FoodNetworkLens {
    activeLayers = new Set(["fxs-hexgrid-layer", "fxs-culture-borders-layer", FOOD_LAYER]);
    allowedLayers = new Set(["fxs-resource-layer", "fxs-yields-layer"]);
}

class FoodNetworkLayer {
    group = null;

    initLayer() {}

    ensure() {
        if (this.group) return;
        this.group = WorldUI.createOverlayGroup("XPL_FoodNetwork", OVERLAY_PRIORITY.CONTINENT_LENS);
        this.fill = this.group.addPlotOverlay();
        this.labels = WorldUI.createSpriteGrid("XPL_FoodLabels", true);
        this.lines = WorldUI.createModelGroup("XPL_FoodLines");
    }

    applyLayer() {
        try {
            this.ensure();
            this.clear();
            this.draw(foodNetwork());
            this.group.setVisible(true);
            this.labels.setVisible?.(true);
            this.lines.setVisible?.(true);
        } catch (error) {
            log.error("food network layer failed", error);
        }
    }

    removeLayer() {
        this.clear();
        this.group?.setVisible(false);
    }

    clear() {
        try {
            this.fill?.clear();
            this.labels?.clear();
            this.lines?.clear();
        } catch (error) {
            log.debug("food network clear failed", error);
        }
    }

    draw(network) {
        const add = (plots, colour) => {
            if (plots.length > 0) this.fill.addPlots(plots, { fillColor: HexToFloat4(colour, FILL_ALPHA) });
        };
        for (const c of network.cities) {
            add(c.plots, COLOURS.CITY);
            if (c.received > 0) this.labels.addText(c.idx, `+${Math.round(c.received)}`, LABEL_OFFSET, LABEL_STYLE);
        }
        for (const t of network.towns) {
            const lonely = t.exporting && t.to.length === 0;
            add(t.plots, lonely ? COLOURS.LONELY : !t.focus ? COLOURS.GROWING : COLOURS[t.focusKey] ?? COLOURS.OTHER);
            const text = lonely ? compose("LOC_XPL_FOOD_LABEL_LONELY") : !t.focus ? compose("LOC_XPL_FOOD_LABEL_GROWING") : t.exporting ? `${Math.round(t.sentPerCity)} x${t.to.length}` : "";
            if (text) this.labels.addText(t.idx, text, LABEL_OFFSET, LABEL_STYLE);
        }
        const map = getEngineMap().map;
        const dirs = DIRECTION_NUMBER();
        for (const link of network.links) this.drawLine(hexLine(map, link.fromIdx, link.toIdx), dirs);
    }

    /** One trade-route segment per hex, pointing at the previous and next hex (trade-routes-model.js). */
    drawLine(plots, dirs) {
        const dirTo = (from, to) => dirs[GameplayMap.getDirectionToPlot(GameplayMap.getLocationFromIndex(from), GameplayMap.getLocationFromIndex(to))] ?? 0;
        plots.forEach((idx, i) => {
            const start = i > 0 ? dirTo(idx, plots[i - 1]) : 0;
            const end = i + 1 < plots.length ? dirTo(idx, plots[i + 1]) : 0;
            try {
                this.lines.addVFXAtPlot(ROUTE_VFX, idx, { x: 0, y: 0, z: 0 }, { constants: { start, end, Color3: LINE_RGB } });
            } catch (error) {
                log.debug("food line failed", error);
            }
        });
    }
}

try {
    LensManager.registerLensLayer(FOOD_LAYER, new FoodNetworkLayer());
    LensManager.registerLens(FOOD_LENS, new FoodNetworkLens());
} catch (error) {
    log.error("food network lens registration failed", error);
}

/** Adds "Food network" to the mini-map's lens menu. */
class LensPanelDecorator {
    constructor(panel) {
        this.panel = panel;
    }

    beforeAttach() {}

    afterAttach() {
        try {
            this.panel.createLensButton("LOC_XPL_FOOD_LENS", FOOD_LENS, "lens-group");
        } catch (error) {
            log.debug("food lens button failed", error);
        }
    }

    beforeDetach() {}

    afterDetach() {}
}
Controls.decorate("lens-panel", (panel) => new LensPanelDecorator(panel));

export function isFoodLensActive() {
    try {
        return LensManager.getActiveLens() === FOOD_LENS;
    } catch (_e) {
        return false;
    }
}

/** Switches the food network lens on, or back to the default lens. */
export function toggleFoodLens() {
    try {
        LensManager.setActiveLens(isFoodLensActive() ? DEFAULT_LENS : FOOD_LENS);
    } catch (error) {
        log.error("food lens toggle failed", error);
    }
}
