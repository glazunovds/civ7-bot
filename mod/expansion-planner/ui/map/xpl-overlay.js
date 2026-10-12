/**
 * Map highlights for planner results: a glowing hex on each pick's centre with its
 * rank as a label, the radius-3 footprint on hover, and a border around the
 * selected site. Created lazily, cleared when the panel closes (unless "keep
 * highlights" is on).
 *
 * Flat plot overlays are not drawn over unexplored (fogged) tiles, so pick centres
 * and footprints also use the 3D hex-highlight VFX the base radius ruler uses
 * (radial-measurement-layer.js), which shows over fog too.
 */
import { OVERLAY_PRIORITY } from '/base-standard/ui/utilities/utilities-overlay.js';
import { HexToFloat4 } from '/core/ui/utilities/utilities-color.js';
import { log } from '../services/xpl-log.js';

const TIER_COLOURS = {
    EXCELLENT: 0x4caf50,
    GOOD: 0x28eebe,
    FAIR: 0xe8c547,
    POOR: 0xe07b39,
};
const CENTRE_ALPHA = 0.7;
const FOOTPRINT_ALPHA = 0.3;
const CLAIMED_ALPHA = 0.5;
const HEAT_ALPHA = 0.35;
const LABEL_STYLE = { fonts: ["TitleFont"], fontSize: 6, faceCamera: true };
const HEX_VFX = "VFX_3dUI_Hex_Highlight_01";
const ORIGIN = { x: 0, y: 0, z: 0 };

function rgb(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

class XplOverlay {
    constructor() {
        this.group = null;
        this.picks = [];
        this.hoveredIdx = -1;
        this.selectedIdx = -1;
    }

    ensure() {
        if (this.group) return true;
        try {
            this.group = WorldUI.createOverlayGroup("XPL_OverlayGroup", OVERLAY_PRIORITY.PLOT_HIGHLIGHT);
            this.heatFill = this.group.addPlotOverlay();
            this.footprintFill = this.group.addPlotOverlay();
            this.claimedFill = this.group.addPlotOverlay();
            this.centreFill = this.group.addPlotOverlay();
            this.selectedBorder = this.group.addBorderOverlay({
                style: "CultureBorder_Closed",
                primaryColor: HexToFloat4(0xf2d16b, 1),
                secondaryColor: HexToFloat4(0x000000, 0),
            });
            this.labels = WorldUI.createSpriteGrid("XPL_LabelGrid", true);
            this.planFill = this.group.addPlotOverlay();
            this.icons = WorldUI.createSpriteGrid("XPL_IconGrid", globalThis.SpriteMode?.Billboard ?? true);
            this.glow = WorldUI.createModelGroup("XPL_GlowGroup");
            this.hoverGlow = WorldUI.createModelGroup("XPL_HoverGlowGroup");
            this.targetGlow = WorldUI.createModelGroup("XPL_TargetGlowGroup");
            return true;
        } catch (error) {
            log.error("overlay init failed", error);
            this.group = null;
            return false;
        }
    }

    /** Overlay groups and sprite grids start hidden; DMT also sets them visible explicitly. */
    setVisible(visible) {
        if (!this.group) return;
        for (const target of [this.group, this.labels, this.icons, this.glow, this.hoverGlow, this.targetGlow]) {
            try {
                target?.setVisible?.(visible);
            } catch (error) {
                log.debug("overlay setVisible failed", error);
            }
        }
    }

    /** Shows centre fills and rank labels for the picks; optional heat map of all scored plots. */
    showSites(picks, heat = null) {
        if (!this.ensure()) return;
        this.setVisible(true);
        this.picks = picks ?? [];
        this.clearPlan();
        this.centreFill.clear();
        this.heatFill.clear();
        this.labels.clear();
        this.glow.clear();
        for (const pick of this.picks) {
            const colour = TIER_COLOURS[pick.tier] ?? TIER_COLOURS.POOR;
            this.centreFill.addPlots([pick.idx], { fillColor: HexToFloat4(colour, CENTRE_ALPHA) });
            this.addGlow(this.glow, pick.idx, colour, 1);
            this.labels.addText(pick.idx, pick.mapLabel ?? `#${pick.rank}`, { x: 0, y: 0, z: 4 }, LABEL_STYLE);
        }
        if (heat) {
            const byTier = new Map();
            for (const s of heat) {
                if (!byTier.has(s.tier)) byTier.set(s.tier, []);
                byTier.get(s.tier).push(s.idx);
            }
            for (const [tier, plots] of byTier) {
                this.heatFill.addPlots(plots, { fillColor: HexToFloat4(TIER_COLOURS[tier] ?? TIER_COLOURS.POOR, HEAT_ALPHA) });
            }
        }
        this.refreshFootprint();
    }

    /** Building plan: tint planned tiles and show each planned building's icon (two per tile side by side). */
    showPlan(placements, fillers = [], futureIdx = new Set()) {
        if (!this.ensure()) return;
        this.setVisible(true);
        this.clearSites();
        this.planFill.clear();
        this.icons.clear();
        const byTile = new Map();
        for (const p of [...placements, ...fillers]) {
            if (!byTile.has(p.idx)) byTile.set(p.idx, []);
            byTile.get(p.idx).push(p.type);
        }
        for (const [idx, types] of byTile) {
            this.planFill.addPlots([idx], { fillColor: HexToFloat4(futureIdx.has(idx) ? 0x9fd3c7 : 0xf2d16b, 0.35) });
            types.forEach((type, i) => {
                const asset = safeIcon(type);
                const dx = types.length > 1 ? (i === 0 ? -12 : 12) : 0;
                if (asset) this.icons.addSprite(idx, asset, { x: 0, y: 0, z: 6 }, { scale: 0.75, offset: { x: dx, y: 0 } });
            });
        }
    }

    /** Wonders: tint and glow each suggested tile (colour = race chance) with the wonder's icon. */
    showWonders(spots) {
        if (!this.ensure()) return;
        this.setVisible(true);
        this.clearSites();
        this.clearPlan();
        for (const s of spots) {
            this.planFill.addPlots([s.idx], { fillColor: HexToFloat4(s.colour, 0.35) });
            this.addGlow(this.glow, s.idx, s.colour, 0.8);
            const asset = safeIcon(s.type);
            if (asset) this.icons.addSprite(s.idx, asset, { x: 0, y: 0, z: 6 }, { scale: 0.75 });
        }
    }

    /** One glowing tile (e.g. the tack a production-menu button will build on); null clears it. */
    showTarget(idx) {
        if (idx == null) {
            this.targetGlow?.clear();
            return;
        }
        if (!this.ensure()) return;
        this.targetGlow.clear();
        try {
            this.targetGlow.setVisible?.(true);
        } catch (_e) {
            // older builds: model groups are visible by default
        }
        this.addGlow(this.targetGlow, idx, 0x9fd3c7, 1);
    }

    clearPlan() {
        if (!this.group) return;
        this.planFill.clear();
        this.icons.clear();
    }

    clearSites() {
        if (!this.group) return;
        this.glow.clear();
        this.hoverGlow.clear();
        this.centreFill.clear();
        this.heatFill.clear();
        this.footprintFill.clear();
        this.claimedFill.clear();
        this.selectedBorder.clear();
        this.labels.clear();
    }

    hover(pick) {
        this.hoveredIdx = pick?.idx ?? -1;
        this.refreshFootprint();
    }

    select(pick) {
        this.selectedIdx = pick?.idx ?? -1;
        this.refreshFootprint();
    }

    addGlow(group, idx, colour, alpha) {
        try {
            group.addVFXAtPlot(HEX_VFX, idx, ORIGIN, { angle: 0, constants: { Color3: rgb(colour), Alpha1: alpha } });
        } catch (error) {
            log.debug("addVFXAtPlot failed", error);
        }
    }

    refreshFootprint() {
        if (!this.group) return;
        this.footprintFill.clear();
        this.claimedFill.clear();
        this.selectedBorder.clear();
        this.hoverGlow.clear();
        const selected = this.picks.find((p) => p.idx === this.selectedIdx);
        const hovered = this.picks.find((p) => p.idx === this.hoveredIdx);
        const shown = hovered ?? selected;
        if (shown) {
            const claimed = new Set(shown.foreignOwned ?? []);
            this.footprintFill.addPlots(shown.footprint.filter((i) => !claimed.has(i)), { fillColor: HexToFloat4(0xffffff, FOOTPRINT_ALPHA) });
            // Tiles another civilization already owns, in red.
            if (claimed.size > 0) this.claimedFill.addPlots([...claimed], { fillColor: HexToFloat4(0xd04a3a, CLAIMED_ALPHA) });
            // Glow the footprint too, so it shows over unexplored tiles.
            for (const idx of shown.footprint) {
                if (idx !== shown.idx) this.addGlow(this.hoverGlow, idx, claimed.has(idx) ? 0xd04a3a : 0xf2d16b, 0.45);
            }
        }
        if (selected) {
            this.selectedBorder.setPlotGroups(selected.footprint, 0);
        }
    }

    clear() {
        this.picks = [];
        this.hoveredIdx = -1;
        this.selectedIdx = -1;
        if (!this.group) return;
        try {
            this.group.clearAll();
            this.labels.clear();
            this.icons.clear();
            this.glow.clear();
            this.hoverGlow.clear();
            this.targetGlow.clear();
            this.setVisible(false);
        } catch (error) {
            log.error("overlay clear failed", error);
        }
    }
}

function safeIcon(type) {
    try {
        return UI.getIconBLP(type) || null;
    } catch (_e) {
        return null;
    }
}

export const overlay = new XplOverlay();
