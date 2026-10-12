/**
 * Hex grid math for Civ VII's map layout: "odd-r" offset coordinates (odd rows are
 * shifted half a hex to the right; see base radial-measurement-layer.js addLabels)
 * with optional horizontal wrap. Pure module.
 *
 * The engine adapter self-tests these functions against GameplayMap at boot and
 * falls back to engine calls if they disagree.
 */

const EVEN_ROW_NEIGHBOURS = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_ROW_NEIGHBOURS = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export class HexGrid {
    /**
     * @param {number} width
     * @param {number} height
     * @param {boolean} wrapX
     */
    constructor(width, height, wrapX = true) {
        this.width = width;
        this.height = height;
        this.wrapX = wrapX;
        this.size = width * height;
        this.radiusCache = new Map();
    }

    index(x, y) {
        return y * this.width + x;
    }

    x(idx) {
        return idx % this.width;
    }

    y(idx) {
        return Math.floor(idx / this.width);
    }

    /** Normalises x for wrap; returns -1 for an off-map coordinate. */
    normalize(x, y) {
        if (y < 0 || y >= this.height) return -1;
        if (this.wrapX) {
            x = ((x % this.width) + this.width) % this.width;
        } else if (x < 0 || x >= this.width) {
            return -1;
        }
        return this.index(x, y);
    }

    neighbours(idx) {
        const x = this.x(idx);
        const y = this.y(idx);
        const offsets = (y & 1) ? ODD_ROW_NEIGHBOURS : EVEN_ROW_NEIGHBOURS;
        const out = [];
        for (const [dx, dy] of offsets) {
            const n = this.normalize(x + dx, y + dy);
            if (n >= 0) out.push(n);
        }
        return out;
    }

    distance(a, b) {
        return this.distanceXY(this.x(a), this.y(a), this.x(b), this.y(b));
    }

    distanceXY(x1, y1, x2, y2) {
        const d = cubeDistance(x1, y1, x2, y2);
        if (!this.wrapX) return d;
        return Math.min(d, cubeDistance(x1, y1, x2 + this.width, y2), cubeDistance(x1, y1, x2 - this.width, y2));
    }

    /**
     * All plots within radius r of idx, each tagged with its ring (0 = centre).
     * Built by breadth-first expansion so wrap and map edges are handled.
     */
    radius(idx, r) {
        const key = idx * 16 + r;
        const cached = this.radiusCache.get(key);
        if (cached) return cached;
        const seen = new Map([[idx, 0]]);
        let frontier = [idx];
        for (let ring = 1; ring <= r; ring++) {
            const next = [];
            for (const f of frontier) {
                for (const n of this.neighbours(f)) {
                    if (!seen.has(n)) {
                        seen.set(n, ring);
                        next.push(n);
                    }
                }
            }
            frontier = next;
        }
        const out = [];
        for (const [i, ring] of seen) out.push({ idx: i, ring });
        if (this.radiusCache.size > 20000) this.radiusCache.clear();
        this.radiusCache.set(key, out);
        return out;
    }
}

function cubeDistance(x1, y1, x2, y2) {
    const q1 = x1 - (y1 - (y1 & 1)) / 2;
    const q2 = x2 - (y2 - (y2 & 1)) / 2;
    const dq = q1 - q2;
    const dr = y1 - y2;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/**
 * A short chain of neighbouring plots from a to b (both included), stepping each time to
 * the neighbour closest to b (ties: the lower index). For drawing a line on the map.
 * @param map { neighbours(idx), distance(a, b) }
 */
export function hexLine(map, a, b) {
    const out = [a];
    let cur = a;
    const limit = map.distance(a, b) + 2;
    for (let step = 0; cur !== b && step < limit; step++) {
        let next = -1;
        let best = Infinity;
        for (const n of map.neighbours(cur)) {
            const d = map.distance(n, b);
            if (d < best || (d === best && n < next)) {
                best = d;
                next = n;
            }
        }
        if (next < 0) break;
        out.push(next);
        cur = next;
    }
    return out;
}
