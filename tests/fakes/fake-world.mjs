// Fake world for unit-testing the pure core: a HexGrid plus a mutable TileFacts table.
import { HexGrid } from "../../mod/expansion-planner/ui/core/xpl-hex.js";
import { TUNING } from "../../mod/expansion-planner/ui/core/xpl-tuning.js";
import { getProfile } from "../../mod/expansion-planner/ui/core/xpl-profiles.js";

export const TILE = {
    grass: { terrain: "TERRAIN_FLAT", biome: "BIOME_GRASSLAND", yields: [2, 0, 0, 0, 0, 0, 0] },
    plains: { terrain: "TERRAIN_FLAT", biome: "BIOME_PLAINS", yields: [1, 1, 0, 0, 0, 0, 0] },
    hill: { terrain: "TERRAIN_HILL", biome: "BIOME_PLAINS", yields: [0, 2, 0, 0, 0, 0, 0], prodTile: true },
    forest: { terrain: "TERRAIN_FLAT", biome: "BIOME_GRASSLAND", feature: "FEATURE_FOREST", featureClass: "FEATURE_CLASS_VEGETATED", yields: [2, 1, 0, 0, 0, 0, 0], prodTile: true },
    coast: { terrain: "TERRAIN_COAST", biome: "BIOME_MARINE", yields: [1, 0, 1, 0, 0, 0, 0], isWater: true, urbanizable: false },
    ocean: { terrain: "TERRAIN_OCEAN", biome: "BIOME_MARINE", yields: [2, 0, 1, 0, 0, 0, 0], isWater: true, urbanizable: false, workable: false, growable: false },
    navriver: { terrain: "TERRAIN_NAVIGABLE_RIVER", biome: "BIOME_GRASSLAND", yields: [1, 0, 1, 0, 0, 0, 0], isNavRiver: true, urbanizable: false },
    mountain: { terrain: "TERRAIN_MOUNTAIN", biome: "BIOME_PLAINS", yields: [0, 1, 0, 0, 0, 0, 0], isMountain: true, urbanizable: false, workable: false, growable: false },
};

export function makeFacts(idx, grid, kind = "grass", extra = {}) {
    const base = TILE[kind];
    return {
        idx,
        x: grid.x(idx),
        y: grid.y(idx),
        known: true,
        terrain: base.terrain,
        biome: base.biome,
        feature: base.feature ?? null,
        featureClass: base.featureClass ?? null,
        resource: null,
        resourceClass: null,
        isWater: !!base.isWater,
        isLake: false,
        isRiver: false,
        isNavRiver: !!base.isNavRiver,
        isMountain: !!base.isMountain,
        isNaturalWonder: false,
        freshWater: false,
        coastal: false,
        appeal: 0,
        owner: -1,
        district: null,
        constructibles: [],
        isQuarter: false,
        uniqueQuarterType: null,
        yields: base.yields.slice(),
        workable: base.workable ?? true,
        growable: base.growable ?? true,
        urbanizable: base.urbanizable ?? true,
        prodTile: !!base.prodTile,
        prodResource: false,
        ...extra,
    };
}

export class FakeWorld {
    constructor(width = 24, height = 16, wrapX = false) {
        this.grid = new HexGrid(width, height, wrapX);
        this.table = [];
        for (let i = 0; i < this.grid.size; i++) this.table.push(makeFacts(i, this.grid, "grass"));
    }

    at(x, y) {
        return this.grid.index(x, y);
    }

    set(x, y, kind, extra = {}) {
        const idx = this.at(x, y);
        this.table[idx] = makeFacts(idx, this.grid, kind, extra);
        return idx;
    }

    patch(x, y, extra) {
        Object.assign(this.table[this.at(x, y)], extra);
    }

    /** Fills a disc of radius r around (x, y) with a tile kind. */
    disc(x, y, r, kind, extra = {}) {
        for (const { idx } of this.grid.radius(this.at(x, y), r)) {
            this.table[idx] = makeFacts(idx, this.grid, kind, extra);
        }
    }

    ctx(overrides = {}) {
        const grid = this.grid;
        return {
            map: {
                radius: (idx, r) => grid.radius(idx, r),
                neighbours: (idx) => grid.neighbours(idx),
                distance: (a, b) => grid.distance(a, b),
            },
            facts: (idx) => this.table[idx] ?? null,
            profile: getProfile("BALANCE"),
            tuning: TUNING,
            overlapTol: "MEDIUM",
            centres: [],
            independents: [],
            adjFamilies: [],
            adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
            avgKnownTileValue: 2,
            aiPicks: new Map(),
            ownedResources: new Set(),
            ...overrides,
        };
    }
}
