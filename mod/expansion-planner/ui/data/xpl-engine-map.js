/**
 * Map geometry backed by the pure HexGrid, verified against the engine at first use.
 * If HexGrid disagrees with GameplayMap (different layout or wrap rules in a future
 * patch), every call falls back to GameplayMap so results stay correct, only slower.
 */
import { HexGrid } from '../core/xpl-hex.js';
import { log } from '../services/xpl-log.js';

const DIRECTION_LABELS = ["E", "NE", "SE", "SW", "W", "NW"];

let instance = null;

function engineRadius(idx, r) {
    const loc = GameplayMap.getLocationFromIndex(idx);
    return GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, r).map((i) => {
        const l = GameplayMap.getLocationFromIndex(i);
        return { idx: i, ring: GameplayMap.getPlotDistance(loc.x, loc.y, l.x, l.y) };
    });
}

function detectWrap(width, height) {
    const y = Math.floor(height / 2);
    const neighbours = GameplayMap.getPlotIndicesInRadius(0, y, 1);
    return neighbours.includes(GameplayMap.getIndexFromXY(width - 1, y));
}

/** Compares HexGrid with the engine on a sample of plots. */
function selfTest(grid) {
    const samples = [];
    const w = grid.width;
    const h = grid.height;
    for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.2], [0.9, 0.8], [0, 0.5], [0.99, 0.33], [0.3, 0.71], [0.6, 0.05], [0.45, 0.94]]) {
        samples.push(grid.index(Math.min(w - 1, Math.floor(fx * w)), Math.min(h - 1, Math.floor(fy * h))));
    }
    for (const a of samples) {
        const la = GameplayMap.getLocationFromIndex(a);
        const engineNeighbours = new Set(GameplayMap.getPlotIndicesInRadius(la.x, la.y, 1).filter((i) => i !== a));
        const ours = grid.neighbours(a);
        if (ours.length !== engineNeighbours.size || ours.some((n) => !engineNeighbours.has(n))) {
            return `neighbour mismatch at ${la.x},${la.y}`;
        }
        for (const b of samples) {
            const lb = GameplayMap.getLocationFromIndex(b);
            const de = GameplayMap.getPlotDistance(la.x, la.y, lb.x, lb.y);
            const dj = grid.distance(a, b);
            if (de !== dj) return `distance mismatch ${la.x},${la.y} -> ${lb.x},${lb.y}: engine ${de}, ours ${dj}`;
        }
    }
    return null;
}

function create() {
    const width = GameplayMap.getGridWidth();
    const height = GameplayMap.getGridHeight();
    const wrapX = detectWrap(width, height);
    const grid = new HexGrid(width, height, wrapX);
    let failure = null;
    try {
        failure = selfTest(grid);
    } catch (error) {
        failure = `self-test threw: ${error?.message ?? error}`;
    }
    const useEngine = failure !== null;
    if (useEngine) {
        log.warn(`hex geometry self-test failed (${failure}); using engine geometry`);
    } else {
        log.info(`map ${width}x${height} wrapX=${wrapX}; hex geometry verified`);
    }
    const map = useEngine
        ? {
            radius: engineRadius,
            neighbours: (idx) => engineRadius(idx, 1).filter((p) => p.ring === 1).map((p) => p.idx),
            distance: (a, b) => {
                const la = GameplayMap.getLocationFromIndex(a);
                const lb = GameplayMap.getLocationFromIndex(b);
                return GameplayMap.getPlotDistance(la.x, la.y, lb.x, lb.y);
            },
        }
        : {
            radius: (idx, r) => grid.radius(idx, r),
            neighbours: (idx) => grid.neighbours(idx),
            distance: (a, b) => grid.distance(a, b),
        };
    return {
        width,
        height,
        wrapX,
        usingEngineGeometry: useEngine,
        map,
        index: (x, y) => GameplayMap.getIndexFromXY(x, y),
        /** Always a fresh { x, y } literal (safe to pass back into engine calls). */
        location: (idx) => {
            const l = GameplayMap.getLocationFromIndex(idx);
            return { x: l.x, y: l.y };
        },
        /** Hex direction label from one plot to another ("NE", ...), via the engine. */
        direction(fromIdx, toIdx) {
            try {
                const a = GameplayMap.getLocationFromIndex(fromIdx);
                const b = GameplayMap.getLocationFromIndex(toIdx);
                const d = GameplayMap.getDirectionToPlot({ x: a.x, y: a.y }, { x: b.x, y: b.y });
                return directionLabel(d);
            } catch (_e) {
                return "";
            }
        },
    };
}

function directionLabel(direction) {
    const D = globalThis.DirectionTypes;
    if (!D) return "";
    const map = {
        [D.DIRECTION_EAST]: "E",
        [D.DIRECTION_NORTHEAST]: "NE",
        [D.DIRECTION_SOUTHEAST]: "SE",
        [D.DIRECTION_SOUTHWEST]: "SW",
        [D.DIRECTION_WEST]: "W",
        [D.DIRECTION_NORTHWEST]: "NW",
    };
    return map[direction] ?? "";
}

/** The map does not change size during a game; one instance per UI session. */
export function getEngineMap() {
    if (!instance) instance = create();
    return instance;
}

export { DIRECTION_LABELS };
