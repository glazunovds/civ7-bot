/**
 * Building layout solver (PLAN.md section 6.5). Pure module, written as a generator
 * so it can be time-sliced. Works on one settlement or a region of several.
 *
 * 1. Greedy: repeatedly place the (settlement, building, tile) with the best gain,
 *    re-scoring after every placement, so later buildings see earlier ones (quarters,
 *    wonder neighbours, building-tag synergies, also across settlement borders).
 *    In time-aware mode the pick is by gain per build turn (Smith's rule for
 *    weighted scheduling), so it also yields a build order per settlement.
 * 2. Local search: move each planned building to its best other tile in its own
 *    settlement (keeping its completion turn), then try swapping every pair of planned
 *    buildings in a settlement; keep changes that raise the total and keep urban tiles
 *    connected. (Trying every possible layout is out of reach: 10 buildings on 20
 *    tiles is ~10^12 layouts; moves + swaps reach a layout no single change improves.)
 * 3. Repair: a building left without any valid tile (often a warehouse that needs a
 *    river or water tile another building took) may take a tile if the building there
 *    can move elsewhere and the plan gains overall.
 * Warehouses take part in the greedy like any building: their value is settlement-wide
 * (PlanState.extraValue), so a Mill can win the river tile it needs.
 */
import { dot } from './xpl-yields.js';

const MAX_SEARCH_ROUNDS = 6;
const SLICE_EVERY = 12; // best-tile searches between yields in the greedy step
const EPSILON = 1e-6;

/**
 * Delta cache: settlement -> tile -> building -> { check, g }. A placement changes the
 * gain of tiles within distance 2 only (adjacency reaches neighbours, and a neighbour's
 * own value depends on its neighbours); time-aware, also every gain of the settlement
 * whose build queue just got longer.
 */
class DeltaCache {
    constructor(state) {
        this.state = state;
        this.bySid = new Map();
    }

    get(sid, type, idx) {
        let tiles = this.bySid.get(sid);
        if (!tiles) {
            tiles = new Map();
            this.bySid.set(sid, tiles);
        }
        let byType = tiles.get(idx);
        if (!byType) {
            byType = new Map();
            tiles.set(idx, byType);
        }
        let hit = byType.get(type);
        if (!hit) {
            const check = this.state.canPlace(type, idx);
            hit = { check, g: check.ok ? this.state.delta(type, idx, check) : -Infinity };
            byType.set(type, hit);
        }
        return hit;
    }

    invalidateAround(idx, sid) {
        if (this.state.horizon) this.bySid.delete(sid);
        for (const u of near(this.state, idx)) {
            const owner = this.state.tiles.get(u)?.sid;
            if (owner !== undefined) this.bySid.get(owner)?.delete(u);
        }
    }
}

/** Plan tiles within distance 2 of idx (what a change at idx can affect). */
function near(state, idx) {
    return state.within2(idx);
}

/** Settlements owning a tile within distance 2 of any of these tiles. */
function sidsAround(state, tiles) {
    const out = new Set();
    for (const idx of tiles) for (const u of near(state, idx)) out.add(state.tiles.get(u).sid);
    return out;
}

function bestTileFor(state, cache, sid, type) {
    let best = null;
    for (const t of state.tilesOf(sid)) {
        const { check, g } = cache ? cache.get(sid, type, t.idx) : (() => {
            const c = state.canPlace(type, t.idx);
            return { check: c, g: c.ok ? state.delta(type, t.idx, c) : -Infinity };
        })();
        if (!check.ok) continue;
        if (!best || g > best.g + EPSILON || (Math.abs(g - best.g) <= EPSILON && t.idx < best.idx)) best = { sid, type, idx: t.idx, g, check };
    }
    return best;
}

/**
 * Swaps two planned buildings of one settlement if the swap raises the plan's value
 * (adjacency only reaches neighbours, so only the two tiles and their neighbours change).
 */
function trySwap(state, sid, typeA, typeB) {
    const s = state.settlements.get(sid);
    const ia = s.planned.get(typeA);
    const ib = s.planned.get(typeB);
    if (ia === undefined || ib === undefined || ia === ib) return false;
    const affected = [...new Set([ia, ib, ...state.nbrs(ia), ...state.nbrs(ib)])].filter((i) => state.tiles.has(i));
    const value = () => affected.reduce((v, u) => v + state.tileValue(u), 0);
    const before = value();
    const la = state.lift(typeA, sid);
    if (!la) return false;
    const lb = state.lift(typeB, sid);
    if (!lb) {
        state.restore(la);
        return false;
    }
    let placedA = false;
    let placedB = false;
    const ca = state.canPlace(typeA, ib);
    if (ca.ok && !ca.overbuild) {
        state.placeLifted(la, ib, ca);
        placedA = true;
        const cb = state.canPlace(typeB, ia);
        if (cb.ok && !cb.overbuild) {
            state.placeLifted(lb, ia, cb);
            placedB = true;
        }
    }
    if (placedA && placedB && state.isConnected(sid) && value() > before + 0.01) return true;
    if (placedB) state.lift(typeB, sid);
    if (placedA) state.lift(typeA, sid);
    state.restore(lb);
    state.restore(la);
    return false;
}

/**
 * Tries to place `type` (which found no valid tile) on a tile taken by a movable planned
 * building, moving that building to its best other tile. Keeps the change only if
 * gain(type here) + gain(moved building there) beats what the moved building gave here.
 */
function repairOne(state, sid, type) {
    for (const t of state.tilesOf(sid)) {
        for (const item of t.items.filter((i) => i.planned)) {
            const other = item.type;
            if (other === type) continue;
            const lifted = state.lift(other, sid);
            if (!lifted) continue;
            if (lifted.idx !== t.idx) {
                state.restore(lifted);
                continue;
            }
            const here = state.canPlace(type, t.idx);
            if (!here.ok || here.overbuild) {
                state.restore(lifted);
                continue;
            }
            const back = state.canPlace(other, t.idx);
            const lost = back.ok ? state.delta(other, t.idx, back, lifted.item.t) : 0;
            const gained = state.delta(type, t.idx, here);
            const token = state.place(type, t.idx, here);
            let best = null;
            for (const u of state.tilesOf(sid)) {
                if (u.idx === t.idx) continue;
                const c = state.canPlace(other, u.idx);
                if (!c.ok) continue;
                const g = state.delta(other, u.idx, c, lifted.item.t);
                if (!best || g > best.g) best = { idx: u.idx, g, c };
            }
            if (best && gained + best.g > lost + 0.01) {
                state.placeLifted(lifted, best.idx, best.c);
                if (state.isConnected(sid)) return true;
                state.lift(other, sid);
            }
            state.undo(token);
            state.restore(lifted);
        }
    }
    return false;
}

/**
 * @param state      PlanState
 * @param selection  building types to place in every settlement (adjacency buildings)
 * @param warehouses warehouse types to place as filler
 * @param options    { placeEvenIfNegative, selectionFor(sid) -> types,
 *                     dirty: Set<sid> | null  settlements to (re)solve; null = all,
 *                     seed: [{ sid, type, idx }] in build order: the previous layout, kept
 *                           for settlements not in `dirty` (incremental recalculation),
 *                     clock() -> ms (phase timings) }
 * @returns { placements, fillers, unplaced, total, seed, timings }
 */
export function* solveLayout(state, selection, warehouses = [], options = {}) {
    const clock = options.clock ?? (() => Date.now());
    const timings = { seeded: 0, dirty: 0, rounds: 0 };
    // CPU time per phase: the waits between frames (after each yield) are not counted.
    let segStart = clock();
    let spent = 0;
    const phase = (name) => {
        const t = clock();
        timings[name] = (timings[name] ?? 0) + spent + (t - segStart);
        spent = 0;
        segStart = t;
    };
    function* pause(progress) {
        spent += clock() - segStart;
        yield progress;
        segStart = clock();
    }
    state.invalidateAll(); // tiles may have been edited directly (the player's tacks)
    const dirty0 = options.dirty ? new Set(options.dirty) : new Set(state.settlements.keys());
    timings.dirty = dirty0.size;

    const unplaced = [];
    const pending = [];
    for (const s of state.settlements.values()) {
        for (const type of [...(options.selectionFor?.(s.id) ?? selection), ...warehouses]) {
            if (!s.planned.has(type)) pending.push({ sid: s.id, type }); // already built (or tacked) otherwise
        }
    }

    // 0. Seed: settlements where nothing changed keep their previous layout, in the same
    //    build order (so their completion turns come out the same).
    for (const sd of options.seed ?? []) {
        if (dirty0.has(sd.sid) || state.tiles.get(sd.idx)?.sid !== sd.sid) continue;
        const k = pending.findIndex((p) => p.sid === sd.sid && p.type === sd.type);
        if (k < 0) continue;
        const check = state.canPlace(sd.type, sd.idx);
        if (!check.ok) continue;
        state.place(sd.type, sd.idx, check);
        pending.splice(k, 1);
        timings.seeded++;
    }
    phase("seed");

    const total0 = pending.length || 1;
    const cache = new DeltaCache(state);
    // Best tile per settlement and building, recomputed only for settlements a placement can affect.
    const bestMemo = new Map(); // sid -> Map(type -> best)
    let work = 0;

    // 1. Greedy.
    while (pending.length > 0) {
        let best = null;
        let bestKey = -Infinity;
        for (const p of pending) {
            let memo = bestMemo.get(p.sid);
            if (!memo) {
                memo = new Map();
                bestMemo.set(p.sid, memo);
            }
            let b = memo.get(p.type);
            if (b === undefined) {
                b = bestTileFor(state, cache, p.sid, p.type);
                memo.set(p.type, b);
                if (++work % SLICE_EVERY === 0) yield* pause(0.1 + 0.6 * (1 - pending.length / total0)); // many settlements: keep frames smooth
            }
            if (!b) continue;
            const s = state.settlements.get(p.sid);
            const key = state.horizon ? b.g / Math.max(1, state.buildTurns(s, p.type)) : b.g;
            if (!best || key > bestKey + EPSILON || (Math.abs(key - bestKey) <= EPSILON && `${p.sid}${p.type}` < `${best.sid}${best.type}`)) {
                best = b;
                bestKey = key;
            }
        }
        if (!best || (best.g <= 0 && !options.placeEvenIfNegative)) break;
        state.place(best.type, best.idx, best.check);
        cache.invalidateAround(best.idx, best.sid);
        const touched = sidsAround(state, [best.idx]);
        touched.add(best.sid);
        for (const sid of touched) bestMemo.delete(sid);
        pending.splice(pending.findIndex((p) => p.sid === best.sid && p.type === best.type), 1);
        yield* pause(0.1 + 0.6 * (1 - pending.length / total0));
    }
    for (const p of pending) {
        unplaced.push({ sid: p.sid, type: p.type, reason: bestTileFor(state, null, p.sid, p.type) ? "NO_GAIN" : "NO_VALID_TILE" });
    }
    phase("greedy");

    // 2. Local search (relocations within the same settlement, same completion turn), then
    //    pairwise swaps. A round only revisits settlements near something the previous
    //    round changed (or, the first time, the settlements being solved): elsewhere the
    //    same moves were already tried and nothing they depend on has changed.
    let dirty = new Set([...dirty0, ...sidsAround(state, state.plannedItems().filter((p) => dirty0.has(p.sid)).map((p) => p.idx))]);
    for (let round = 0; round < MAX_SEARCH_ROUNDS && dirty.size > 0; round++) {
        timings.rounds++;
        const changed = [];
        for (const { type, sid } of state.plannedItems()) {
            if (!dirty.has(sid)) continue;
            const lifted = state.lift(type, sid);
            if (!lifted) continue;
            if (!state.isConnected(sid)) {
                state.restore(lifted);
                continue;
            }
            const eta = lifted.item.t;
            const here = state.canPlace(type, lifted.idx);
            const stay = here.ok ? state.delta(type, lifted.idx, here, eta) : -Infinity;
            let best = null;
            for (const t of state.tilesOf(sid)) {
                if (t.idx === lifted.idx) continue;
                const check = state.canPlace(type, t.idx);
                if (!check.ok) continue;
                const g = state.delta(type, t.idx, check, eta);
                if (!best || g > best.g + EPSILON) best = { idx: t.idx, g, check };
            }
            if (best && best.g > stay + 0.01) {
                state.placeLifted(lifted, best.idx, best.check);
                if (state.isConnected(sid)) {
                    changed.push(lifted.idx, best.idx);
                    continue;
                }
                state.lift(type, sid); // the move disconnected something: undo it
            }
            state.restore(lifted);
        }
        // Pairwise swaps (two buildings each better on the other's tile).
        for (const s of state.settlements.values()) {
            if (!dirty.has(s.id)) continue;
            const types = state.plannedItems().filter((p) => p.sid === s.id).map((p) => p.type);
            for (let i = 0; i < types.length; i++) {
                for (let j = i + 1; j < types.length; j++) {
                    const ia = s.planned.get(types[i]);
                    const ib = s.planned.get(types[j]);
                    if (trySwap(state, s.id, types[i], types[j])) changed.push(ia, ib);
                }
            }
            yield* pause(0.7 + 0.2 * (round / MAX_SEARCH_ROUNDS));
        }
        yield* pause(0.7 + 0.2 * ((round + 1) / MAX_SEARCH_ROUNDS));
        dirty = sidsAround(state, changed);
    }
    phase("search");

    // 3. Repair: give "no valid tile" buildings a tile by moving one planned building away.
    let tries = 0;
    for (const u of [...unplaced]) {
        if (u.reason !== "NO_VALID_TILE" || !dirty0.has(u.sid)) continue;
        if (repairOne(state, u.sid, u.type)) unplaced.splice(unplaced.indexOf(u), 1);
        if (++tries % 4 === 0) yield* pause(0.9 + 0.05 * (tries / unplaced.length));
    }
    yield* pause(0.95);
    phase("repair");

    const warehouseSet = new Set(warehouses);
    const fillers = state.plannedItems().filter((p) => warehouseSet.has(p.type)).map(({ sid, type, idx, item }) => ({ sid, type, idx, eta: Math.round(item.t ?? 0) }));
    const result = describePlan(state, fillers, unplaced);
    phase("describe");
    // The layout in build order, to seed the next (incremental) recalculation.
    result.seed = state.plannedItems()
        .map(({ sid, type, idx, item }) => ({ sid, type, idx, t: item.t ?? 0 }))
        .sort((a, b) => (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : a.t - b.t))
        .map(({ sid, type, idx }) => ({ sid, type, idx }));
    result.timings = { ...timings, ...state.stats };
    return result;
}

/** Final per-building numbers at the finished layout. */
export function describePlan(state, fillers, unplaced) {
    const placements = [];
    let total = 0;
    const fillerKeys = new Set(fillers.map((f) => `${f.sid}|${f.type}`));
    for (const { type, idx, sid, item } of state.plannedItems()) {
        if (fillerKeys.has(`${sid}|${type}`)) continue;
        const s = state.settlements.get(sid);
        const adj = state.correctedAdjacency(type, idx);
        const base = state.book.baseYields.get(type) ?? [0, 0, 0, 0, 0, 0, 0];
        // Marginal contribution of this building at the final layout (same completion turn).
        const lifted = state.lift(type, sid);
        const check = state.canPlace(type, idx);
        const gain = check.ok ? state.delta(type, idx, check, item.t) : 0;
        state.restore(lifted);
        const t = state.tiles.get(idx);
        placements.push({
            sid,
            type,
            idx,
            eta: Math.round(item.t ?? 0),
            afterAge: !!state.horizon && (item.t ?? 0) > state.horizon,
            base: base.slice(),
            adjacency: adj.byYield.slice(),
            adjacencyTotal: adj.total,
            parts: adj.parts,
            gain: Math.round(gain * 10) / 10,
            value: dot(state.weights, base) + dot(state.weights, adj.byYield) * s.adjMult,
            future: !s.owned.has(idx),
            quarter: state.isQuarter(t),
            uniqueQuarter: state.uniqueQuarterInfo(t)?.type ?? null,
            overbuild: t.items.find((i) => i.planned && i.type === type)?.overbuilt?.type ?? null,
        });
        total += gain;
    }
    // Per settlement, in build order (time-aware) or by value (static).
    placements.sort((a, b) => (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : state.horizon ? a.eta - b.eta || b.value - a.value : b.value - a.value || a.idx - b.idx));
    return { placements, fillers, unplaced, total: Math.round(total * 10) / 10 };
}
