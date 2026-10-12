/**
 * Plan state for building placement (PLAN.md section 6.3). Pure module.
 *
 * Holds one or more settlements ("region") that share an area of tiles. Each tile
 * belongs to one settlement (its current owner, else the nearest centre). Adjacency
 * is evaluated with core/adjacency-rules.js across settlement borders. The value of
 * placing a building on a tile is computed by re-evaluating only that tile and its
 * neighbours (adjacency flows both ways: wonders, quarters and building-tag rules
 * change the neighbours' yields too).
 *
 * Time-aware mode (horizon = turns left in the age): every planned building gets an
 * estimated completion turn from its settlement's production queue; a yield counts
 * only for the turns it exists before the age ends, and an adjacency between two
 * things only from when the later of the two exists. With no horizon, everything
 * counts as if built now (static mode).
 *
 * Construction options:
 *   map:      { neighbours(idx), distance(a, b) }
 *   facts(idx) -> TileFacts with district (string|null) and constructibles ([{ type, obsolete, cls }])
 *   book:     rule book (core/rule-book.js)
 *   weights:  number[7] profile yield weights
 *   adjOpts:  { playerId, charming, breathtaking }
 *   ruralLoss: share of a developed rural tile's yields lost when it becomes urban
 *   area:     iterable of plot indices the plan may use
 *   settlements: [{ id, centre, owned: Set, adjMult, engineValid?(type, idx), allowFuture,
 *                   production, startTurn, costOf?(type) }]
 *     (legacy single-settlement options centre/owned/adjMult/engineValid/allowFuture are accepted)
 *   horizon:  turns left in the age (undefined/Infinity = static mode)
 *   lockDelay: turns before a locked building can start (time-aware mode)
 *   isLocked(type) -> bool
 *   uniqueQuarters: [{ type, b1, b2 }] for the player's civ
 *   uqBonus:  value of a completed unique quarter (weighted yield units)
 *   tackEta:  completion turn assumed for the player's own building tacks
 *
 * Speed: adjacency only reaches neighbouring tiles, so a tile's view (what its
 * neighbours' rules see) depends on that tile alone and its value on that tile and its
 * neighbours. Both are memoised and dropped only around a changed tile (touch()); code
 * that edits tiles directly (outside place/undo/lift/restore) must call invalidateAll().
 */
import { adjacencyFromNeighbours, matchCount } from './xpl-adjacency-rules.js';
import { dot } from './xpl-yields.js';

const URBAN = "DISTRICT_URBAN";
const CENTRE = "DISTRICT_CITY_CENTER";
const WONDER = "DISTRICT_WONDER";
const RURAL = "DISTRICT_RURAL";
const CONSTRUCTIBLE_SELECTORS = ["AdjacentConstructible", "AdjacentConstructibleClass", "AdjacentConstructibleTag"];
// Something finished after the age ends still counts a little (bought with gold sooner,
// or kept if ageless), so such buildings still get a sensible tile instead of none.
const WT_FLOOR = 0.05;

/** Short stable hash (FNV-1a, base 36) to keep fingerprints small. */
export function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `${(h >>> 0).toString(36)}${str.length.toString(36)}`;
}

export class PlanState {
    constructor(o) {
        this.map = o.map;
        this.factsOf = o.facts;
        this.book = o.book;
        this.weights = o.weights;
        this.adjOpts = { ...(o.adjOpts ?? {}), classOf: (t) => o.book.classOf(t), hasTag: (t, tag) => o.book.hasTag(t, tag) };
        this.ruralLoss = o.ruralLoss ?? 1;
        this.horizon = Number.isFinite(o.horizon) && o.horizon > 0 ? o.horizon : null;
        this.lockDelay = o.lockDelay ?? 15;
        this.isLocked = o.isLocked ?? (() => false);
        this.uqBonus = o.uqBonus ?? 0;
        this.uniqueQuarters = o.uniqueQuarters ?? [];
        this.tackEta = o.tackEta ?? 10;
        // A building planned on a tile the settlement does not own yet counts at a discount
        // (the tile may never be claimed, or be claimed by a neighbour) and, time-aware,
        // only from when the tile is likely claimed: a tile usable today wins unless the
        // future one is clearly better.
        this.futureTileDelay = o.futureTileDelay ?? 10;
        this.futureFactor = o.futureFactor ?? 0.85;
        // "type:idx" -> per-yield correction that anchors our adjacency to the game's number.
        this.adjCorrection = new Map();
        // "sid|type" -> weighted value the building adds wherever it stands in that settlement
        // (a warehouse's +1 on all farms, camps, fishing boats... of the settlement).
        this.extraValue = new Map();
        this.nbrMemo = new Map();   // idx -> neighbour indices
        this.viewMemo = new Map();  // idx -> view(idx)
        this.valueMemo = new Map(); // idx -> tileValue(idx)
        this.stats = { values: 0, views: 0, deltas: 0 }; // work counters (logged per plan)

        const list = o.settlements ?? [{
            id: "s0", centre: o.centre, owned: o.owned ?? new Set(), adjMult: o.adjMult ?? 1,
            engineValid: o.engineValid ?? null, allowFuture: o.allowFuture !== false,
        }];
        this.settlements = new Map();
        for (const s of list) {
            this.settlements.set(s.id, {
                id: s.id,
                centre: s.centre,
                owned: s.owned ?? new Set(),
                adjMult: s.adjMult ?? 1,
                engineValid: s.engineValid ?? null,
                allowFuture: s.allowFuture !== false,
                production: Math.max(0.5, s.production ?? 5),
                startTurn: s.startTurn ?? 0,
                costOf: s.costOf ?? ((type) => this.book.costOf?.(type) ?? 100),
                committed: 0, // production turns already queued by the plan
                planned: new Map(), // type -> idx: "one per settlement"
            });
        }
        // Backward-compatible single-settlement accessors.
        const first = this.settlements.values().next().value;
        this.centre = first.centre;
        this.owned = first.owned;

        this.tiles = new Map();
        this.tilesBySid = new Map();
        for (const idx of o.area) {
            const f = this.factsOf(idx);
            if (!f || !f.known) continue;
            const sid = this.assignSettlement(idx);
            if (!sid) continue;
            const s = this.settlements.get(sid);
            const district = f.district ?? (idx === s.centre ? CENTRE : null);
            const all = f.constructibles ?? [];
            const isImprovement = (c) => (c.cls ?? this.book.classOf(c.type)) === "IMPROVEMENT";
            const tile = {
                idx,
                sid,
                facts: f,
                district,
                origDistrict: district,
                districtTime: 0,
                items: all.filter((c) => !isImprovement(c)).map((c) => ({ type: c.type, obsolete: !!c.obsolete, planned: false, fixed: true, t: 0 })),
                improvements: all.filter(isImprovement).map((c) => c.type),
            };
            this.tiles.set(idx, tile);
            if (!this.tilesBySid.has(sid)) this.tilesBySid.set(sid, []);
            this.tilesBySid.get(sid).push(tile);
            for (const item of tile.items) if (!item.obsolete) s.planned.set(item.type, idx);
        }
    }

    /** Neighbour indices of idx (memoised: the map geometry never changes). */
    nbrs(idx) {
        let n = this.nbrMemo.get(idx);
        if (!n) {
            n = this.map.neighbours(idx);
            this.nbrMemo.set(idx, n);
        }
        return n;
    }

    /** Plan tiles within distance 2 of idx (all a change at idx can affect), memoised. */
    within2(idx) {
        let out = this.near2Memo?.get(idx);
        if (out) return out;
        const seen = new Set([idx]);
        for (const n of this.nbrs(idx)) {
            seen.add(n);
            for (const m of this.nbrs(n)) seen.add(m);
        }
        out = [...seen].filter((u) => this.tiles.has(u));
        (this.near2Memo ??= new Map()).set(idx, out);
        return out;
    }

    /** Tile idx changed: its view and the values of it and its neighbours are stale. */
    touch(idx) {
        this.viewMemo.delete(idx);
        this.valueMemo.delete(idx);
        for (const n of this.nbrs(idx)) this.valueMemo.delete(n);
    }

    /** Drop every memo (after editing tiles directly, or changing corrections/values). */
    invalidateAll() {
        this.viewMemo.clear();
        this.valueMemo.clear();
    }

    /**
     * Fingerprint of everything one settlement's layout depends on, apart from timing:
     * its tiles with their districts, buildings, improvements and reserved marks, and the
     * tiles it owns. Equal fingerprints let a recalculation keep the previous layout.
     */
    settlementSignature(sid) {
        const s = this.settlements.get(sid);
        const parts = [s.centre, [...s.owned].sort((a, b) => a - b).join(",")];
        for (const t of [...this.tilesOf(sid)].sort((a, b) => a.idx - b.idx)) {
            const items = t.items.map((i) => `${i.type}${i.obsolete ? "~" : ""}`).sort().join("+");
            parts.push(`${t.idx}:${t.district ?? ""}:${t.reserved ? "r" : ""}:${items}:${t.improvements.join("+")}`);
        }
        return hashString(parts.join("|"));
    }

    /** The tiles of one settlement (the solver never scans the whole region for one). */
    tilesOf(sid) {
        return this.tilesBySid.get(sid) ?? [];
    }

    /** Owner settlement if it owns the tile, else the nearest centre (ties: earlier in the list). */
    assignSettlement(idx) {
        for (const s of this.settlements.values()) if (s.owned.has(idx) || s.centre === idx) return s.id;
        let best = null;
        let bestDist = Infinity;
        for (const s of this.settlements.values()) {
            const d = this.map.distance(idx, s.centre);
            if (d < bestDist) {
                best = s.id;
                bestDist = d;
            }
        }
        return bestDist <= 3 ? best : null;
    }

    settlementOf(idx) {
        const t = this.tiles.get(idx);
        return t ? this.settlements.get(t.sid) : null;
    }

    /** Legacy accessor: planned types of the first settlement. */
    get plannedTypes() {
        return this.settlements.values().next().value.planned;
    }

    // ---- time -----------------------------------------------------------------

    /** Share of the remaining age during which something completed at turn t exists. */
    wt(t) {
        if (!this.horizon) return 1;
        return Math.max(WT_FLOOR, (this.horizon - t) / this.horizon);
    }

    buildTurns(s, type) {
        return s.costOf(type) / s.production;
    }

    /** Completion turn if `type` were queued next in settlement s. */
    nextEta(s, type) {
        if (!this.horizon) return 0;
        let start = s.startTurn + s.committed;
        if (this.isLocked(type)) start = Math.max(start, this.lockDelay);
        return start + this.buildTurns(s, type);
    }

    // ---- views ----------------------------------------------------------------

    activeItems(tile) {
        return tile.items.filter((i) => !i.obsolete);
    }

    activeTypes(tile) {
        return this.activeItems(tile).map((i) => i.type);
    }

    /** Quarter: 2+ current-age/ageless slot buildings, or one full-tile building. Returns { is, t }. */
    quarterInfo(tile) {
        const times = [];
        for (const i of tile.items) {
            if (i.obsolete) continue;
            const p = this.book.placementOf(i.type);
            if (p.cls !== "BUILDING" || p.slotless) continue;
            if (p.fullTile) return { is: true, t: i.t ?? 0 };
            times.push(i.t ?? 0);
        }
        if (times.length < 2) return { is: false, t: 0 };
        times.sort((a, b) => a - b);
        return { is: true, t: times[1] };
    }

    isQuarter(tile) {
        return this.quarterInfo(tile).is;
    }

    /** Unique quarter on the tile (both buildings present). Returns { type, t } or null. */
    uniqueQuarterInfo(tile) {
        if (tile.uniqueQuarterType) return { type: tile.uniqueQuarterType, t: 0 };
        if (this.uniqueQuarters.length === 0) return null;
        const items = this.activeItems(tile);
        for (const uq of this.uniqueQuarters) {
            const a = items.find((i) => i.type === uq.b1);
            const b = items.find((i) => i.type === uq.b2);
            if (a && b) return { type: uq.type, t: Math.max(a.t ?? 0, b.t ?? 0) };
        }
        return null;
    }

    /** Facts-like object used by rule matching for a neighbouring plot (with "since when" times). */
    view(idx) {
        let v = this.viewMemo.get(idx);
        if (v === undefined) {
            v = this.computeView(idx);
            this.viewMemo.set(idx, v);
        }
        return v;
    }

    computeView(idx) {
        this.stats.views++;
        const t = this.tiles.get(idx);
        if (!t) {
            const f = this.factsOf(idx);
            if (!f) return null;
            return { ...f, constructibles: (f.constructibles ?? []).filter((c) => !c.obsolete).map((c) => c.type), isQuarter: !!f.isQuarter, times: null };
        }
        const urban = this.isUrbanLike(t);
        const improvements = urban ? [] : t.improvements; // improvements disappear when a tile becomes urban
        const q = this.quarterInfo(t);
        const uq = this.uniqueQuarterInfo(t);
        const ctimes = new Map();
        for (const i of this.activeItems(t)) ctimes.set(i.type, Math.min(ctimes.get(i.type) ?? Infinity, i.t ?? 0));
        return {
            ...t.facts,
            district: t.district,
            constructibles: [...this.activeTypes(t), ...improvements],
            isQuarter: q.is,
            uniqueQuarterType: uq?.type ?? null,
            times: { district: t.districtTime ?? 0, quarter: q.t, uq: uq?.t ?? 0, constructibles: ctimes },
        };
    }

    neighbourViews(idx) {
        const out = [];
        for (const n of this.nbrs(idx)) {
            const v = this.view(n);
            if (v) out.push(v);
        }
        return out;
    }

    /** Raw adjacency (per yield) of one building type standing on idx, as the game would show it. */
    adjacencyOf(type, idx) {
        if (!this.book.isActive(type)) return { total: 0, byYield: [0, 0, 0, 0, 0, 0, 0], parts: [] };
        return adjacencyFromNeighbours(this.book.rulesByType.get(type) ?? [], this.neighbourViews(idx), this.adjOpts);
    }

    setExtraValue(sid, type, value) {
        if (value > 0) this.extraValue.set(`${sid}|${type}`, value);
        this.valueMemo.clear();
    }

    /** adjacencyOf plus the game-anchored correction for this (type, tile), if any. */
    correctedAdjacency(type, idx) {
        const adj = this.adjacencyOf(type, idx);
        const c = this.adjCorrection.get(`${type}:${idx}`);
        if (!c) return adj;
        const byYield = adj.byYield.map((v, i) => v + c[i]);
        return { ...adj, byYield, total: byYield.reduce((a, b) => a + b, 0) };
    }

    /**
     * How far our adjacency for a building on a tile is from the game's own number (the
     * game also applies modifiers our rules do not see). Call before anything is planned.
     * @returns null if the building cannot go there, false if we agree, else the per-yield gap
     */
    adjacencyGap(type, idx, engineAdjacency) {
        const check = this.canPlace(type, idx);
        if (!check.ok) return null;
        const token = this.place(type, idx, check, 0);
        const ours = this.adjacencyOf(type, idx).byYield;
        this.undo(token);
        const diff = ours.map((v, i) => (Number(engineAdjacency[i]) || 0) - v);
        return diff.every((d) => Math.abs(d) < 0.01) ? false : diff;
    }

    /** From now on, value this building on this tile with the game's adjacency. */
    setAdjacencyCorrection(type, idx, gap) {
        this.adjCorrection.set(`${type}:${idx}`, gap);
        this.valueMemo.clear();
    }

    /** Time-weighted adjacency per yield for a building completed at tb. */
    timedAdjacency(rules, views, tb) {
        const byYield = [0, 0, 0, 0, 0, 0, 0];
        for (const rule of rules) {
            let weighted = 0;
            const constructibleRule = CONSTRUCTIBLE_SELECTORS.some((k) => rule.sel[k]);
            for (const v of views) {
                if (constructibleRule) {
                    // Each matching building counts from when it exists.
                    for (const type of new Set(v.constructibles ?? [])) {
                        if (matchCount(rule, { ...v, constructibles: [type] }, this.adjOpts) > 0) {
                            weighted += this.wt(Math.max(tb, v.times?.constructibles?.get(type) ?? 0));
                        }
                    }
                    continue;
                }
                const c = matchCount(rule, v, this.adjOpts);
                if (c === 0) continue;
                let since = 0;
                if (rule.sel.AdjacentDistrict) since = Math.max(since, v.times?.district ?? 0);
                if (rule.sel.AdjacentQuarter) since = Math.max(since, v.times?.quarter ?? 0);
                if (rule.sel.AdjacentUniqueQuarter || rule.sel.AdjacentUniqueQuarterType) since = Math.max(since, v.times?.uq ?? 0);
                weighted += c * this.wt(Math.max(tb, since));
            }
            byYield[rule.yieldIndex] += (weighted / rule.tilesRequired) * rule.change;
        }
        return byYield;
    }

    /** Weighted value of everything on a tile: adjacency (x specialists), base yields, unique quarter. */
    tileValue(idx) {
        let v = this.valueMemo.get(idx);
        if (v === undefined) {
            v = this.computeTileValue(idx);
            this.valueMemo.set(idx, v);
        }
        return v;
    }

    computeTileValue(idx) {
        const t = this.tiles.get(idx);
        if (!t) return 0;
        if (!t.items.some((i) => !i.obsolete)) return 0; // nothing here gives or gets anything
        this.stats.values++;
        const s = this.settlements.get(t.sid);
        const views = this.neighbourViews(idx);
        const future = idx !== s.centre && !s.owned.has(idx);
        let adjacency = 0;
        let base = 0;
        for (const item of t.items) {
            if (item.obsolete) continue;
            const late = item.planned && future;
            const tItem = late && this.horizon ? Math.max(item.t ?? 0, this.futureTileDelay) : item.t ?? 0;
            const discount = late ? this.futureFactor : 1;
            const wt = this.wt(tItem) * discount;
            if (item.planned) {
                base += wt * dot(this.weights, this.book.baseYields.get(item.type) ?? []);
                base += wt * (this.extraValue.get(`${t.sid}|${item.type}`) ?? 0);
                const c = this.adjCorrection.get(`${item.type}:${idx}`);
                if (c) adjacency += wt * dot(this.weights, c);
            }
            if (!this.book.isActive(item.type)) continue;
            const rules = this.book.rulesByType.get(item.type);
            if (!rules || rules.length === 0) continue;
            const yields = this.horizon
                ? this.timedAdjacency(rules, views, tItem)
                : adjacencyFromNeighbours(rules, views, this.adjOpts).byYield;
            adjacency += discount * dot(this.weights, yields);
        }
        let uq = 0;
        if (this.uqBonus > 0) {
            const info = this.uniqueQuarterInfo(t);
            if (info && info.t !== undefined && t.items.some((i) => i.planned)) uq = this.uqBonus * this.wt(info.t);
        }
        return adjacency * s.adjMult + base + uq;
    }

    // ---- validity -------------------------------------------------------------

    slotsOf(tile) {
        const district = tile.district === CENTRE ? CENTRE : URBAN;
        return this.book.slots.get(district) ?? 2;
    }

    isUrbanLike(tile) {
        return !!tile && (tile.district === URBAN || tile.district === CENTRE);
    }

    /**
     * @returns { ok, reason?, overbuild? }  overbuild = the obsolete item that would be replaced
     */
    canPlace(type, idx) {
        const t = this.tiles.get(idx);
        if (!t) return { ok: false, reason: "OUT_OF_AREA" };
        const s = this.settlements.get(t.sid);
        const p = this.book.placementOf(type);
        const f = t.facts;
        const ownedBySettlement = s.owned.has(idx);
        if (!s.allowFuture && !ownedBySettlement) return { ok: false, reason: "NOT_OWNED" };
        if (f.owner >= 0 && !ownedBySettlement && f.owner !== this.adjOpts.playerId) return { ok: false, reason: "FOREIGN" };
        if (!p.multiplePerCity && s.planned.has(type)) return { ok: false, reason: "ALREADY_IN_SETTLEMENT" };
        if (t.district === WONDER) return { ok: false, reason: "WONDER_TILE" };
        if (t.reserved && !this.isUrbanLike(t)) return { ok: false, reason: "RESERVED" }; // the player's improvement tack
        // For tiles the settlement can build on now, the engine's yes beats our stricter terrain rules
        // (e.g. a river building on a navigable river, which we otherwise refuse like the game's data suggests).
        const engineSays = s.engineValid && ownedBySettlement ? s.engineValid(type, idx) : undefined;

        // Terrain / water rules.
        if (p.validTerrains.size > 0) {
            if (!p.validTerrains.has(f.terrain)) return { ok: false, reason: "TERRAIN" };
            if (f.isWater && f.resource) return { ok: false, reason: "RESOURCE" };
            // A land building limited to some terrain (the Modern Airfield: flat land only)
            // still follows the land rules: no resource, mountain, natural wonder...
            if (!f.isWater && !f.isNavRiver && !this.isUrbanLike(t) && !f.urbanizable && engineSays !== true) {
                return { ok: false, reason: f.resource ? "RESOURCE" : "TERRAIN" };
            }
        } else if ((f.isWater || f.isNavRiver) && engineSays !== true) {
            // Water stays water even after a Fishing Quay makes the tile urban: only buildings
            // that list the terrain (Fishing Quay, Harbor, Lighthouse, bridges) may share it.
            return { ok: false, reason: "TERRAIN" };
        } else if (!this.isUrbanLike(t) && !f.urbanizable && engineSays !== true) {
            return { ok: false, reason: f.resource ? "RESOURCE" : "TERRAIN" };
        }
        if (p.validDistricts.size > 0) {
            const district = t.district === CENTRE ? CENTRE : URBAN;
            if (!p.validDistricts.has(district)) return { ok: false, reason: "DISTRICT" };
        }
        // Features: a building that lists valid features / required feature classes may
        // only stand on those; otherwise any (non-natural-wonder) feature is fine.
        if (f.feature && (p.validFeatures.size > 0 || p.requiredFeatureClasses.size > 0)) {
            if (!p.validFeatures.has(f.feature) && !p.requiredFeatureClasses.has(f.featureClass)) return { ok: false, reason: "FEATURE" };
        }
        const neighbours = this.nbrs(idx).map((n) => this.tiles.get(n)?.facts ?? this.factsOf(n)).filter((n) => n && n.known);
        // Water placement, as the game data defines it (and as Detailed Map Tacks checks it):
        // RIVER = river on the tile; OFF_COAST = coast touching land; ANCHORED = navigable river or coast touching land.
        const coastTouchingLand = f.terrain === "TERRAIN_COAST" && neighbours.some((n) => !n.isWater);
        switch (p.riverPlacement) {
            case "RIVER":
                if (!f.isRiver && !f.isNavRiver) return { ok: false, reason: "NEEDS_RIVER" };
                break;
            case "OFF_COAST":
                if (!coastTouchingLand) return { ok: false, reason: "NEEDS_COAST" };
                break;
            case "ANCHORED":
                if (!f.isNavRiver && !coastTouchingLand) return { ok: false, reason: "NEEDS_COAST" };
                break;
            default:
                break;
        }
        if (p.adjacentRiver && !f.isRiver && !neighbours.some((n) => n.isRiver)) return { ok: false, reason: "NEEDS_RIVER" };
        if (p.adjacentLake && !neighbours.some((n) => n.isLake)) return { ok: false, reason: "NEEDS_LAKE" };
        if (p.adjacentTerrain && !neighbours.some((n) => n.terrain === p.adjacentTerrain)) return { ok: false, reason: "NEEDS_TERRAIN" };
        if (p.noRiver && (f.isRiver || f.isNavRiver)) return { ok: false, reason: "NO_RIVER" };
        if (p.noFeature && f.feature) return { ok: false, reason: "NO_FEATURE" };

        // Urban growth must stay contiguous with the settlement's own centre / urban tiles.
        if (!this.isUrbanLike(t)) {
            const touches = this.nbrs(idx).some((n) => {
                const nt = this.tiles.get(n);
                return n === s.centre || (nt && nt.sid === t.sid && this.isUrbanLike(nt));
            });
            if (!touches) return { ok: false, reason: "NOT_CONTIGUOUS" };
        }

        // Slots.
        const max = this.slotsOf(t);
        const need = p.slotless ? 0 : p.fullTile ? max : 1;
        let active = 0;
        let obsolete = null;
        let obsoleteCount = 0;
        for (const item of t.items) {
            const ip = this.book.placementOf(item.type);
            if (ip.slotless) continue;
            if (item.obsolete) {
                obsoleteCount++;
                if (!obsolete) obsolete = item;
                continue;
            }
            active += ip.fullTile ? max : 1;
        }
        if (active + need > max) return { ok: false, reason: "NO_SLOT" };
        const overbuild = active + obsoleteCount + need > max ? obsolete : null;

        // The engine knows best for tiles the settlement can build on now.
        if (s.engineValid && ownedBySettlement) {
            const e = s.engineValid(type, idx);
            if (e === false) return { ok: false, reason: "ENGINE" };
        }
        return { ok: true, overbuild };
    }

    // ---- mutation -------------------------------------------------------------

    /** Places `type` on idx. `eta` = completion turn (time-aware mode); defaults to queueing it next. */
    place(type, idx, check = this.canPlace(type, idx), eta = undefined) {
        const t = this.tiles.get(idx);
        const s = this.settlements.get(t.sid);
        const time = eta ?? this.nextEta(s, type);
        const token = { type, idx, districtBefore: t.district, districtTimeBefore: t.districtTime, overbuilt: null, item: null, sid: s.id, committedBefore: s.committed };
        if (check.overbuild) {
            token.overbuilt = check.overbuild;
            t.items = t.items.filter((i) => i !== check.overbuild);
        }
        if (!this.isUrbanLike(t)) {
            t.district = URBAN;
            t.districtTime = time;
        }
        token.item = { type, obsolete: false, planned: true, fixed: false, overbuilt: token.overbuilt, t: time };
        t.items.push(token.item);
        s.planned.set(type, idx);
        this.touch(idx);
        if (eta === undefined && this.horizon) {
            let start = s.startTurn + s.committed;
            if (this.isLocked(type)) start = Math.max(start, this.lockDelay);
            s.committed = start - s.startTurn + this.buildTurns(s, type);
        }
        return token;
    }

    undo(token) {
        const t = this.tiles.get(token.idx);
        const s = this.settlements.get(token.sid);
        t.items = t.items.filter((i) => i !== token.item);
        if (token.overbuilt) t.items.push(token.overbuilt);
        t.district = token.districtBefore;
        t.districtTime = token.districtTimeBefore;
        s.planned.delete(token.type);
        s.committed = token.committedBefore;
        this.touch(token.idx);
    }

    /** Value of the developed rural tile lost by urbanising it (from when it is urbanised). */
    ruralValue(idx, time = 0) {
        const t = this.tiles.get(idx);
        if (!t || t.district !== RURAL) return 0;
        return dot(this.weights, t.facts.yields ?? []) * this.ruralLoss * this.wt(time);
    }

    /** Change in plan value from placing `type` on `idx` now (assumes canPlace passed). */
    delta(type, idx, check = this.canPlace(type, idx), eta = undefined) {
        this.stats.deltas++;
        const s = this.settlementOf(idx);
        const time = eta ?? this.nextEta(s, type);
        const affected = [idx, ...this.nbrs(idx)].filter((i) => this.tiles.has(i));
        let before = 0;
        const beforeValues = affected.map((u) => this.tileValue(u));
        for (const v of beforeValues) before += v;
        const viewBefore = this.viewMemo.get(idx);
        const rural = this.ruralValue(idx, time);
        const token = this.place(type, idx, check, time);
        let after = 0;
        for (const u of affected) after += this.tileValue(u);
        this.undo(token);
        // undo() restored the exact state: the values from before are valid again.
        affected.forEach((u, i) => this.valueMemo.set(u, beforeValues[i]));
        if (viewBefore !== undefined) this.viewMemo.set(idx, viewBefore);
        const overbuilt = check.overbuild ? dot(this.weights, this.book.baseYields.get(check.overbuild.type) ?? []) * this.wt(time) : 0;
        return after - before - rural - overbuilt;
    }

    plannedItems() {
        const out = [];
        for (const t of this.tiles.values()) for (const i of t.items) if (i.planned) out.push({ type: i.type, idx: t.idx, sid: t.sid, item: i });
        return out;
    }

    /** Removes a planned item (for local search); keeps its completion time; returns a token for restore(). */
    lift(type, sid = undefined) {
        const s = sid ? this.settlements.get(sid) : [...this.settlements.values()].find((x) => x.planned.has(type));
        if (!s) return null;
        const idx = s.planned.get(type);
        const t = this.tiles.get(idx);
        const item = t?.items.find((i) => i.type === type && i.planned);
        if (!item) return null;
        const districtBefore = t.district;
        const districtTimeBefore = t.districtTime;
        t.items = t.items.filter((i) => i !== item);
        if (item.overbuilt) t.items.push(item.overbuilt);
        if (!t.items.some((i) => i.planned)) {
            t.district = t.origDistrict;
            t.districtTime = 0;
        }
        s.planned.delete(type);
        this.touch(idx);
        return { type, idx, sid: s.id, item, districtBefore, districtTimeBefore };
    }

    restore(lifted) {
        const t = this.tiles.get(lifted.idx);
        if (lifted.item.overbuilt) t.items = t.items.filter((i) => i !== lifted.item.overbuilt);
        t.items.push(lifted.item);
        t.district = lifted.districtBefore;
        t.districtTime = lifted.districtTimeBefore;
        this.settlements.get(lifted.sid).planned.set(lifted.type, lifted.idx);
        this.touch(lifted.idx);
    }

    /** Moves a lifted item to another tile of the same settlement, keeping its completion time. */
    placeLifted(lifted, idx, check) {
        return this.place(lifted.type, idx, check, lifted.item.t);
    }

    /** True if every planned urban tile connects to its own settlement centre through its urban tiles (one settlement if sid is given). */
    isConnected(sid = null) {
        for (const s of sid ? [this.settlements.get(sid)] : this.settlements.values()) {
            const seen = new Set([s.centre]);
            const queue = [s.centre];
            while (queue.length) {
                const cur = queue.pop();
                for (const n of this.nbrs(cur)) {
                    if (seen.has(n)) continue;
                    const t = this.tiles.get(n);
                    if (t && t.sid === s.id && this.isUrbanLike(t)) {
                        seen.add(n);
                        queue.push(n);
                    }
                }
            }
            for (const t of this.tilesOf(s.id)) {
                if (this.isUrbanLike(t) && t.district !== t.origDistrict && !seen.has(t.idx)) return false;
            }
        }
        return true;
    }
}
