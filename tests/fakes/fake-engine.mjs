// Minimal fake of the Civ VII UI globals used by ui/data/*.js, backed by real game
// data (tests/fixtures/gameinfo-<age>.json) and a programmable hex map.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HexGrid } from "../../mod/expansion-planner/ui/core/xpl-hex.js";

const here = dirname(fileURLToPath(import.meta.url));
const KEYS = {
    PlotEffects: "PlotEffectType",
    Ages: "AgeType", Terrains: "TerrainType", Biomes: "BiomeType", Features: "FeatureType",
    Resources: "ResourceType", Yields: "YieldType", Constructibles: "ConstructibleType",
    Buildings: "ConstructibleType", Adjacency_YieldChanges: "ID", Districts: "DistrictType",
    Wonders: "ConstructibleType", UniqueQuarters: "UniqueQuarterType", GlobalParameters: "Name",
    Civilizations: "CivilizationType", Projects: "ProjectType", Units: "UnitType",
    ProgressionTreeNodes: "ProgressionTreeNodeType", GreatWorks: "GreatWorkType", Victories: "VictoryType", Attributes: "AttributeType", VictoryTypes: "VictoryType",
    Unit_Stats: "UnitType", // the game's UI: GameInfo.Unit_Stats.lookup(def.UnitType)
};

export function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) | 0x40000000; // keep hashes far from small indices
}

const BOOL_COLUMNS = /^(Adjacent(Lake|NaturalWonder|NavigableRiver|OtherOwner|Quarter|Resource|River|SeaResource|UniqueQuarter|BreathtakingAppeal|CharmingAppeal)|Self|ProjectMaxYield|RequiresActivation|MultiplePerCity|ExistingDistrictOnly|Mountain|Hills|Water|Impassable|Town|Capital|FoundCity|MakeTradeRoute)$/;

function coerce(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        if (BOOL_COLUMNS.test(k)) out[k] = v === "true" || v === "1";
        else if (/^(YieldChange|TilesRequired|Cost|CityCenterPriority|Population|MaxConstructibles|Appeal)$/.test(k)) out[k] = Number(v);
        else out[k] = v;
    }
    return out;
}

const NOT_ON_GAME_TABLES = ["some", "every", "map", "reduce", "includes", "flatMap", "sort", "slice", "indexOf", "at", "concat", "join"];

function makeTable(name, rows) {
    const key = KEYS[name];
    const table = rows.map((r, i) => {
        const row = coerce(r);
        Object.defineProperty(row, "$index", { value: i, enumerable: false });
        if (key) Object.defineProperty(row, "$hash", { value: hash(row[key]), enumerable: false });
        return row;
    });
    const byKey = new Map();
    const byHash = new Map();
    if (key) {
        for (const row of table) {
            byKey.set(row[key], row);
            byHash.set(row.$hash, row);
        }
    }
    table.lookup = (k) => {
        if (typeof k === "string") return byKey.get(k) ?? null;
        if (typeof k === "number") return byHash.get(k) ?? table[k] ?? null;
        return null;
    };
    // Like the game: a GameInfo table is not a JS array. It has lookup, length, filter, find,
    // findIndex, forEach and for...of (all the game's own UI uses); anything else throws, as
    // `GameInfo.TypeTags.some` did in game ("is not a function").
    for (const m of NOT_ON_GAME_TABLES) {
        Object.defineProperty(table, m, {
            value: () => {
                throw new TypeError(`GameInfo.${name}.${m} is not a function (game tables only have lookup/filter/find/findIndex/forEach/length)`);
            },
            enumerable: false,
        });
    }
    return table;
}

export function loadGameInfo(age = "antiquity") {
    const data = JSON.parse(readFileSync(join(here, "..", "fixtures", `gameinfo-${age}.json`), "utf8"));
    const info = {};
    for (const [name, rows] of Object.entries(data.tables)) info[name] = makeTable(name, rows);
    return { info, ageType: data.age };
}

/**
 * Installs fake globals. `world` describes the map:
 *   { width, height, tiles: (x, y) => ({ terrain, biome, feature, resource, revealed, owner, yields }),
 *     cities: [{ owner, x, y, name, isTown }], players: [{ id, isIndependent }],
 *     claimOk(x, y) -> bool, aiSuggestions(origin) -> [{ location, factors }] }
 */
export function installFakeEngine(world, age = "antiquity") {
    const { info, ageType } = loadGameInfo(age);
    const grid = new HexGrid(world.width, world.height, world.wrapX ?? true);
    const tile = (x, y) => world.tiles(x, y);
    const idxOf = (x, y) => grid.normalize(x, y);
    const loc = (idx) => ({ x: grid.x(idx), y: grid.y(idx) });
    const terrainIndex = (t) => info.Terrains.findIndex((r) => r.TerrainType === t);
    const yieldHash = (y) => info.Yields.lookup(y).$hash;

    // The fixtures have no PlotEffects: the game's damaging rows (base-standard plot-effects.xml).
    info.PlotEffects ??= makeTable("PlotEffects", [
        { PlotEffectType: "PLOTEFFECT_PLAGUE", Damage: "25", TimeDecay: "true" },
        { PlotEffectType: "PLOTEFFECT_RADIOACTIVE_FALLOUT", Damage: "50", TimeDecay: "true" },
        { PlotEffectType: "PLOTEFFECT_IS_BURNING", Damage: "15", TimeDecay: "true" },
        { PlotEffectType: "PLOTEFFECT_STONE_TRAP", Damage: "25", TriggerOnEnter: "true" },
        { PlotEffectType: "PLOTEFFECT_UNIT_FORTIFICATIONS", Damage: "0" },
    ]);
    // world.plotEffects(x, y) -> ["PLOTEFFECT_PLAGUE", ...] (MapPlotEffects.getPlotEffects, as the plot tooltip reads it)
    globalThis.MapPlotEffects = {
        getPlotEffects: (idx) => (world.plotEffects?.(grid.x(idx), grid.y(idx)) ?? []).map((t) => ({ effectType: info.PlotEffects.lookup(t)?.$hash ?? t, duration: 6 })),
    };
    const g = globalThis;
    g.GameInfo = info;
    g.Game = { age: hash(ageType), turn: 1 };
    g.GameContext = { localPlayerID: 0 };
    // In-memory localStorage (the settings store saves there).
    if (!g.localStorage) {
        const mem = new Map();
        g.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    }
    g.RevealedStates = { HIDDEN: 0, REVEALED: 1, VISIBLE: 2 };
    g.PlayerIds = { NO_PLAYER: -1 };
    g.ResourceTypes = { NO_RESOURCE: -1 };
    g.DirectionTypes = { DIRECTION_EAST: 0, DIRECTION_NORTHEAST: 1, DIRECTION_NORTHWEST: 2, DIRECTION_WEST: 3, DIRECTION_SOUTHWEST: 4, DIRECTION_SOUTHEAST: 5 };
    g.Locale = { compose: (k, ...args) => (args.length ? `${k}(${args.join(",")})` : k) };
    g.requestAnimationFrame = (cb) => setImmediate(cb);
    const handlers = new Map();
    g.engine = {
        on(name, fn, ctx) {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push([fn, ctx]);
        },
        off(name, fn) {
            handlers.set(name, (handlers.get(name) ?? []).filter(([f]) => f !== fn));
        },
        trigger(name, ...args) {
            for (const [fn, ctx] of handlers.get(name) ?? []) fn.apply(ctx, args);
        },
        whenReady: Promise.resolve(),
    };
    g.Loading = { runWhenLoaded: (fn) => setImmediate(fn) };
    // world.gameSeed: the game's seed (the game memory's key, with our leader).
    g.Configuration = { getGame: () => ({ isNetworkMultiplayer: !!world.networkMP, gameSeed: world.gameSeed ?? 1234 }) };
    const props = new Map();
    g.Database = { makeHash: (s) => hash(s) };
    g.GameTutorial = { getProperty: (h) => props.get(h), setProperty: (h, v) => props.set(h, v), _props: props };
    g.GameplayMap = {
        getGridWidth: () => world.width,
        getGridHeight: () => world.height,
        getIndexFromXY: (x, y) => grid.index(x, y),
        getIndexFromLocation: (l) => idxOf(l.x, l.y),
        getLocationFromIndex: loc,
        getPlotIndicesInRadius: (x, y, r) => grid.radius(grid.index(x, y), r).map((p) => p.idx),
        getPlotDistance: (x1, y1, x2, y2) => grid.distanceXY(x1, y1, x2, y2),
        getDirectionToPlot: () => 1,
        getRevealedState: (_p, x, y) => (tile(x, y).revealed === false ? 0 : 2),
        getTerrainType: (x, y) => terrainIndex(tile(x, y).terrain),
        getBiomeType: (x, y) => info.Biomes.findIndex((b) => b.BiomeType === (tile(x, y).biome ?? "BIOME_GRASSLAND")),
        getFeatureType: (x, y) => (tile(x, y).feature ? info.Features.findIndex((f) => f.FeatureType === tile(x, y).feature) : -1),
        getResourceType: (x, y) => (tile(x, y).resource ? info.Resources.findIndex((r) => r.ResourceType === tile(x, y).resource) : -1),
        isWater: (x, y) => ["TERRAIN_COAST", "TERRAIN_OCEAN"].includes(tile(x, y).terrain), // not navigable rivers, as in the game
        isLake: (x, y) => !!tile(x, y).lake,
        isMountain: (x, y) => tile(x, y).terrain === "TERRAIN_MOUNTAIN",
        isNaturalWonder: (x, y) => !!tile(x, y).naturalWonder,
        getContinentType: (x, y) => tile(x, y).continent ?? 0,
        isNavigableRiver: (x, y) => tile(x, y).terrain === "TERRAIN_NAVIGABLE_RIVER",
        // Water bodies: world.areaId(x, y) (default: every water tile in area 1, land in area 0).
        getAreaId: (x, y) => world.areaId?.(x, y) ?? (["TERRAIN_COAST", "TERRAIN_OCEAN"].includes(tile(x, y).terrain) ? 1 : 0),
        getAreaIsWater: (x, y) => ["TERRAIN_COAST", "TERRAIN_OCEAN"].includes(tile(x, y).terrain),
        isRiver: (x, y) => !!tile(x, y).river,
        isFreshWater: (x, y) => !!tile(x, y).river,
        getAppeal: (x, y) => tile(x, y).appeal ?? 0,
        isImpassable: (x, y) => tile(x, y).terrain === "TERRAIN_MOUNTAIN",
        isCityWithinMinimumDistance: (x, y) => (world.cities ?? []).some((c) => grid.distanceXY(x, y, c.x, c.y) <= 3),
        getOwner: (x, y) => tile(x, y).owner ?? -1,
        getOwningCityFromXY: (x, y) => world.owningCity?.(x, y) ?? null,
        getYields: (idx) => {
            const { x, y } = loc(idx);
            return Object.entries(tile(x, y).yields ?? { YIELD_FOOD: 2 }).map(([k, v]) => [yieldHash(k), v]);
        },
    };
    const cityObjects = (owner) =>
        (world.cities ?? []).filter((c) => c.owner === owner).map((c, i) => ({
            id: { owner, id: i },
            owner,
            name: c.name,
            isTown: !!c.isTown,
            // world.cities[i].infected: the plague (city.isInfected, the banner's status)
            isInfected: !!c.infected,
            // world.cities[i].distant = true: a Distant Lands settlement
            isDistantLands: !!c.distant,
        // world.cities[i].trains = "UNIT_SCOUT" (a unit in its queue)
            isCapital: i === 0,
            population: c.pop ?? 3,
            location: { x: c.x, y: c.y },
            // world.cities[i].originalOwner: who founded it (default its owner); justConquered: city.isJustConqueredFrom
            originalOwner: c.originalOwner ?? owner,
            isJustConqueredFrom: !!c.justConquered,
            // world.cities[i].districts = [{ x, y }] (default its centre); Districts.get reads world.controlled(x, y)
            Districts: { getIds: () => (c.districts ?? [{ x: c.x, y: c.y }]).map((d) => ({ owner, id: 90000 + d.x * 100 + d.y, type: 4 })) },
            getPurchasedPlots: () => grid.radius(grid.index(c.x, c.y), 1).map((p) => p.idx),
            Yields: {
                // world.cities[i].nets = { YIELD_SCIENCE: 40, … }: its other net yields (default 1)
                getNetYield: (y) => {
                    const key = Object.keys(g.YieldTypes).find((k) => g.YieldTypes[k] === y);
                    if (c.nets && key in c.nets) return c.nets[key];
                    return y === g.YieldTypes.YIELD_PRODUCTION ? c.prod ?? 5 : y === g.YieldTypes.YIELD_FOOD ? c.food ?? 3 : y === g.YieldTypes.YIELD_HAPPINESS ? c.happy ?? 1 : 1;
                },
                getYield: (y) => (y === g.YieldTypes.YIELD_PRODUCTION ? c.prod ?? 5 : 1),
                // world.placements(city) -> { buildings: [{ constructibleType, placements: [{ plotID, yieldChanges, changeDetails }] }] }
                calculateAllBuildingsPlacements: () => world.placements?.(c) ?? null,
            },
            // world.cities[i].unrest = true: the settlement is in unrest
            Happiness: { get hasUnrest() { return !!c.unrest; }, get turnsOfUnrest() { return c.unrest ? 1 : -1; } },
            Gold: { getTownUpgradeCost: () => c.cost ?? 300, getBuildingPurchaseCost: (_y, type) => world.buyCost?.(type, c) ?? 250, getUnitPurchaseCost: (_y, type) => world.buyCost?.(type) ?? 250 },
            Production: {
                getConstructibleProductionCost: (type) => world.costOf?.(type) ?? 100,
                // Like the game: a project's own Cost (Preparation 2000, Launch Satellite 1000), unless the test prices it.
                getProjectProductionCost: (type) => {
                    const def = info.Projects.lookup(type);
                    return world.costOf?.(typeof type === "string" ? type : def?.ProjectType) ?? (Number(def?.Cost) || 100);
                },
                getUnitProductionCost: (type) => world.costOf?.(typeof type === "string" ? type : info.Units.lookup(type)?.UnitType) ?? 100,
            },
            BuildQueue: makeQueue(c),
            // world.cities[i].focus = "PROJECT_TOWN_GRANARY" (or true for some Focus); foodSent = per connected city
            Growth: {
                growthType: c.focus ? g.GrowthTypes.PROJECT : g.GrowthTypes.EXPAND,
                projectType: typeof c.focus === "string" ? info.Projects.lookup(c.focus).$hash : -1,
                isReadyToPlacePopulation: !!c.readyToGrow,
                turnsUntilGrowth: c.grow ?? 5,
            },
            getSentFoodPerCity: () => c.foodSent ?? 0,
            // world.maintenance(city, type) -> upkeep array by Yields $index (the game's per-city number)
            // world.cities[i].gwBuildings = [{ type, slots: [great work index | -1], damaged }]
            Constructibles: {
                isAdjacencyUnlocked: () => false,
                getMaintenance: (type) => world.maintenance?.(c, type),
                getGreatWorkBuildings: () => (c.gwBuildings ?? []).map((b, j) => {
                    const id = `gw-${owner}-${i}-${j}`;
                    componentIds.set(id, { type: info.Constructibles.lookup(b.type).$hash, complete: true, damaged: !!b.damaged });
                    return { constructibleID: id, slots: b.slots.map((s) => ({ greatWorkIndex: s })) };
                }),
            },
            // world.workers(city) -> [{ PlotIndex, IsBlocked, NumWorkers, MaxWorkers, CurrentYields, NextYields, CurrentMaintenance, NextMaintenance }]
            Workers: { GetAllPlacementInfo: () => world.workers?.(c) ?? [], getCityWorkerCap: () => c.workerCap ?? 1 },
            // world.cities[i].resources = [resource value] (assigned here), resourceCap = slots;
            // factory = true (has a Factory: in the Modern age the game's isTreasureConstructiblePrereqMet),
            // factoryResource = "RESOURCE_COTTON" (the factory-resource type it holds)
            Resources: {
                getAssignedResources: () => (c.resources ?? []).map((v) => ({ value: v })),
                getAssignedResourcesCap: () => c.resourceCap ?? 0,
                getFactoryResource: () => (c.factoryResource ? info.Resources.lookup(c.factoryResource).$hash : -1),
                isTreasureConstructiblePrereqMet: () => !!c.factory,
            },
            // world.cities[i].connected = [index of another city of the same owner]
            getConnectedCities: () => (c.connected ?? []).map((j) => ({ owner, id: j })),
        }));
    const structs = (x, y) => world.structures?.(x, y) ?? { district: null, constructibles: [] };
    const componentIds = new Map();
    // Build queues: world.cities[i].queue = { type, turns, pct } (the item in production: a
    // constructible or a project), queued = [types behind it: constructibles, projects or units],
    // trains = a unit type at the end. Entries as the game gives them: every type field is there,
    // -1 when it does not apply (seen in game: a queued project's constructibleType is -1).
    const entry = (t) => {
        const building = info.Constructibles.lookup(t);
        const project = building ? null : info.Projects.lookup(t);
        const unit = building || project ? null : info.Units.lookup(t);
        const h = (building ?? project ?? unit).$hash;
        return {
            kind: building ? 0 : project ? 2 : 1,
            constructibleType: building ? h : -1, projectType: project ? h : -1, unitType: unit ? h : -1, type: h,
        };
    };
    const current = (c) => entry(c.queue.type);
    const makeQueue = (c) => ({
        isEmpty: !c.queue,
        currentProductionKind: 0,
        currentProductionTypeHash: c.queue ? current(c).type : -1,
        currentTurnsLeft: c.queue?.turns ?? 0,
        getTurnsLeft: (type) => (c.queue && c.queue.type === type ? c.queue.turns : world.turnsFor?.(c, type) ?? -1),
        // The item in production: queue.pct; another (an item moved back keeps its progress): progress[type].
        getPercentComplete: (h) => (h === undefined || (c.queue && current(c).type === h) ? c.queue?.pct ?? 0
            : c.progress?.[info.Constructibles.lookup(h)?.ConstructibleType ?? info.Units.lookup(h)?.UnitType ?? info.Projects.lookup(h)?.ProjectType] ?? 0),
        getQueue: () => [
            ...(c.queue ? [current(c)] : []),
            ...(c.queued ?? []).map(entry),
            ...(c.trains ? [entry(c.trains)] : []),
        ],
    });
    // Wonders in the world: world.wonders = [{ owner, type, x, y, complete }], read on every call (a test may add one).
    const wonderIds = () => (world.wonders ?? []).map((w, i) => {
        const id = `w-${i}`;
        componentIds.set(id, { type: info.Constructibles.lookup(w.type).$hash, complete: w.complete !== false, location: { x: w.x, y: w.y } });
        return { id, w };
    });
    wonderIds();
    const players = (world.players ?? [{ id: 0 }]).map((p) => ({
        id: p.id,
        // world.players[i].civ = "CIVILIZATION_GREECE" (optional)
        civilizationType: p.civ ? info.Civilizations.lookup(p.civ)?.$hash : undefined,
        Constructibles: {
            getWonders: (pid) => wonderIds().filter(({ w }) => w.owner === pid).map(({ id }) => id),
            // world.villages = [{ owner, x, y, type? }]: an independent's village (not a city: like
            // the game, it is only among the independent's constructibles), IMPROVEMENT_VILLAGE by default.
            getConstructibles: () => (world.villages ?? []).filter((v) => v.owner === p.id)
                .map((v) => ({ type: info.Constructibles.lookup(v.type ?? "IMPROVEMENT_VILLAGE").$hash, location: { x: v.x, y: v.y }, cityId: { owner: p.id, id: -1, type: 1 } })),
        },
        isIndependent: !!p.isIndependent,
        civilizationName: p.name ?? `PLAYER_${p.id}`,
        Cities: { getCities: () => cityObjects(p.id) },
        isMajor: !p.isIndependent,
        // world.distantAt(x, y) -> true on the Distant Lands (for the local player)
        isDistantLands: (l) => !!world.distantAt?.(l.x, l.y),
        // world.influence: the local player's Influence
        DiplomacyTreasury: { get diplomacyBalance() { return world.influence ?? 0; } },
        // Reinforcements (research/37 §5C.3): world.units[i].reinforcing = { to: <the army's localId>, eta, from: {x, y} }, a unit
        // on its way off the map (give it onMap: false); -1 when it is not reinforcing, as the game answers.
        Armies: {
            getUnitReinforcementCommanderId: (id) => (world.units ?? []).find((u) => u.id === id?.id)?.reinforcing?.to ?? -1,
            getUnitReinforcementETA: (id) => (world.units ?? []).find((u) => u.id === id?.id)?.reinforcing?.eta ?? -1,
            getUnitReinforcementStartLocation: (id) => (world.units ?? []).find((u) => u.id === id?.id)?.reinforcing?.from ?? null,
        },
        // world.unitUpkeep(unitType) -> gold a turn for one unit of that type (getMaintenanceForAllUnitsOfType: all of them)
        Treasury: {
            getMaintenanceForAllUnitsOfType: (type) => {
                const name = info.Units.lookup(type)?.UnitType;
                return (world.units ?? []).filter((u) => u.type === name).length * (world.unitUpkeep?.(name) ?? 0);
            },
        },
        Diplomacy: {
            // world.met = [player id], world.wars = [player id], world.relations = { [id]: "UNFRIENDLY" }, world.relationLevels = { [id]: n }
            hasMet: (o) => (world.met ?? []).includes(o),
            isAtWarWith: (o) => (world.wars ?? []).includes(o),
            hasAllied: (o) => (world.allies ?? []).includes(o),
            // world.formalWarOk = [player id] (the game allows a formal war on them now)
            canDeclareWarOn: (o, type) => ({ Success: type === g.WarTypes?.FORMAL_WAR ? (world.formalWarOk ?? []).includes(o) : true }),
            // world.peaceOk = [player id] (the game allows peace now)
            canMakePeaceWith: (o) => ({ Success: (world.peaceOk ?? []).includes(o) }),
            getRelationshipEnum: (o) => g.DiplomacyPlayerRelationships[`PLAYER_RELATIONSHIP_${world.relations?.[o] ?? "NEUTRAL"}`],
            getRelationshipLevel: (o) => world.relationLevels?.[o] ?? 0,
            isValidLandClaimLocation: (l) => (world.claimOk ? world.claimOk(l.x, l.y) : true),
            // world.startsWar(unitId, {x, y}) -> the player a move would declare war on, or undefined
            willMoveStartWar: (id, l) => {
                const other = world.startsWar?.(id, l);
                return other === undefined ? { Success: false } : { Success: true, Player2: other };
            },
        },
        AI: { getBestSettleLocationsForSettler: (n, origin) => (world.aiSuggestions ? world.aiSuggestions(origin).slice(0, n) : []) },
        // world.victoryPoints = { VICTORY_X: { [player id]: points } }, world.countdown = { VICTORY_X: turns } (the local player leads)
        Victories: {
            getPointsForVictoryType: (h) => {
                const v = info.VictoryTypes?.find((x) => x.$hash === h);
                return world.victoryPoints?.[v?.VictoryType]?.[p.id] ?? 0;
            },
            getVictoryCountdownStatus: (h) => {
                const v = info.VictoryTypes?.find((x) => x.$hash === h);
                // world.countdowns = { VICTORY_X: { [player id]: turns } } (any player's countdown)
                const turns = world.countdowns?.[v?.VictoryType]?.[p.id] ?? (p.id === 0 ? world.countdown?.[v?.VictoryType] : undefined);
                return { isDominant: turns !== undefined, turns: turns ?? 0, prereqs: [] };
            },
        },
    }));
    // Districts / constructibles on plots: world.structures(x, y) -> { district, constructibles: [type] }
    g.Districts = {
        // A settlement's district (world.cities[i].districts): its tile, owner and who holds it (world.controlled(x, y) -> player)
        get: (id) => {
            if (!(id?.id >= 90000)) return null;
            const x = Math.floor((id.id - 90000) / 100), y = (id.id - 90000) % 100;
            return { location: { x, y }, owner: id.owner, controllingPlayer: world.controlled?.(x, y) ?? id.owner, type: 2 };
        },
        getAtLocation: ({ x, y }) => {
            const d = structs(x, y).district;
            return d ? { type: info.Districts.lookup(d).$hash } : null;
        },
    };
    g.MapConstructibles = {
        getHiddenFilteredConstructibles: (x, y) => [
            ...structs(x, y).constructibles.map((type, i) => {
                const id = `${x}-${y}-${i}`;
                componentIds.set(id, { type: info.Constructibles.lookup(type).$hash, complete: true });
                return id;
            }),
            ...(world.wonders ?? []).map((w, i) => (w.x === x && w.y === y && tile(x, y).revealed !== false ? `w-${i}` : null)).filter(Boolean),
        ],
    };
    g.Constructibles = { getByComponentID: (id) => componentIds.get(id) ?? null };
    g.CityOperationTypes = { BUILD: 1, CONSIDER_TOWN_PROJECT: 2 };
    g.YieldSourceTypes = { BASE: 0, ADJACENCY: 1 };
    const sent = [];
    const typeOf = (args) => info.Constructibles.lookup(args.ConstructibleType)?.ConstructibleType
        ?? (args?.UnitType !== undefined ? info.Units.lookup(args.UnitType)?.UnitType : undefined)
        ?? (args?.ProjectType !== undefined ? info.Projects.lookup(args.ProjectType)?.ProjectType : undefined);
    g.Game.CityOperations = {
        // Like the game: the turn-1 Founder is never trained.
        canStart: (id, _op, args) => (typeOf(args) === "UNIT_FOUNDER" ? { Success: false } : world.canBuild?.(typeOf(args), id, args) ?? { Success: true, Plots: [], ExpandUrbanPlots: [] }),
        sendRequest: (id, op, args) => sent.push({ kind: "operation", id, op, args: { ...args } }),
    };
    g.ProductionKind = { CONSTRUCTIBLE: 0, UNIT: 1, PROJECT: 2 };
    g.YieldTypes = { YIELD_FOOD: 0, YIELD_PRODUCTION: 1, YIELD_GOLD: 2, YIELD_SCIENCE: 3, YIELD_CULTURE: 4, YIELD_HAPPINESS: 5, YIELD_DIPLOMACY: 6 };
    g.GrowthTypes = { EXPAND: 0, PROJECT: 1 };
    g.CityCommandTypes = { PURCHASE: 1, CHANGE_GROWTH_MODE: 2, EXPAND: 3, DESTROY: 4 };
    g.PlayerOperationTypes = { ASSIGN_WORKER: 1, SET_TECH_TREE_NODE: 2, SET_CULTURE_TREE_NODE: 3, CHANGE_TRADITION: 4, CHOOSE_GOLDEN_AGE: 5, CHOOSE_NARRATIVE_STORY_DIRECTION: 6, VIEWED_ADVISOR_WARNING: 7, CONSIDER_ASSIGN_TRADITIONS: 8, CONSIDER_ASSIGN_RESOURCE: 9, CONSIDER_ASSIGN_ATTRIBUTE: 10, RESPOND_DIPLOMATIC_FIRST_MEET: 11, CHANGE_GOVERNMENT: 12, FOUND_PANTHEON: 13, RESPOND_DIPLOMATIC_ACTION: 14, SUPPORT_DIPLOMATIC_ACTION: 15, FOUND_RELIGION: 16, ADD_BELIEF: 17, MOVE_GREAT_WORK: 40, ASSIGN_RESOURCE: 41, DECLARE_WAR: 42, CANCEL_ALLIANCE: 43, BUY_ATTRIBUTE_TREE_NODE: 44, CHOOSE_SYNCRETISM_UNITS: 45, CHOOSE_SYNCRETISM_INFRASTRUCTURE: 46, CHOOSE_SYNCRETISM_SELF: 47 };
    g.SyncreticChoiceTypes = { SYNCRETIC_CHOICE_UNITS: 0, SYNCRETIC_CHOICE_INFRASTRUCTURE: 1, SYNCRETIC_CHOICE_SELF: 2 };
    g.PlayerOperationParameters = { Activate: 1, Deactivate: 2 };
    g.CultureSlotTypes = { TRADITION_CULTURE_SLOT: 1, POLICY_CULTURE_SLOT: 2, CRISIS_CULTURE_SLOT: 3 };
    g.AdvisorySubjectTypes = { CHOOSE_TECH: 1, CHOOSE_CULTURE: 2, PRODUCTION: 3 };
    g.AdvisorTypes = { CULTURE: 1, ECONOMIC: 2, MILITARY: 3, SCIENCE: 4 };
    // world.research = { tech: { available: [nodeType], active }, culture: { ... } }
    g.Game.ProgressionTrees = {
        getTree: (_pid, type) => {
            const r = type === "TREE_TECH" ? world.research?.tech : world.research?.culture;
            return r?.active != null ? { activeNodeIndex: 0, nodes: [{ nodeType: r.active }] } : { activeNodeIndex: -1, nodes: [] };
        },
        // Like the game: the node's hash for a type or hash; depthUnlocked from world.research.depth[type]
        // (1 = researched, 2 = mastered).
        getNode: (_pid, n) => {
            const def = g.GameInfo.ProgressionTreeNodes?.lookup(n);
            return { nodeType: def ? def.$hash : n, depthUnlocked: world.research?.depth?.[def?.ProgressionTreeNodeType ?? n] ?? 0 };
        },
    };
    // world.readyUnits = [unitId] (units waiting for orders; a skipped one leaves the list)
    g.UI = g.UI ?? {};
    g.UI.Player = { getFirstReadyUnit: () => world.readyUnits?.[0] ?? null };
    // Units: world.units = [{ id, type, x, y, damage, activity, attacks, moved }] (owner 0);
    // world.rangeTargets(unitId) -> [{x, y}] (ranged attack plots), world.unitCanStart(id, op, args)
    // -> { Success } to refuse an operation, world.unreachable(x, y) -> true, world.tradeRoutes,
    // world.tradeCapacity(owner), world.unitCommandOk(id, op, args) -> bool (trade route here),
    // world.startsWar(id, loc), world.enemies = [{ x, y, damage }] (other players' units).
    g.UnitActivityTypes = { NONE: 0, AWAKE: 1, OPERATION: 2, SLEEP: 3, HEAL: 4 };
    g.UnitOperationTypes = { MOVE_TO: "UNITOPERATION_MOVE_TO", RANGE_ATTACK: "UNITOPERATION_RANGE_ATTACK", SKIP_TURN: "UNITOPERATION_SKIP_TURN" };
    g.UnitOperationMoveModifiers = { NONE: 0, ATTACK: 1, MOVE_IGNORE_UNEXPLORED_DESTINATION: 2 };
    g.OperationPlotModifiers = { NONE: 0, ATTACK: 1 };
    g.UnitCommandTypes = { MAKE_TRADE_ROUTE: "UNITCOMMAND_MAKE_TRADE_ROUTE", PROMOTE: "UNITCOMMAND_PROMOTE" };
    g.CityOperationsParametersValues = { Exclusive: 1, MoveTo: 2, RemoveAt: 3, Swap: 4 };
    g.TradeRouteStatus = { SUCCESS: 0, AT_WAR: 1, DISTANCE: 2, NEED_MORE_FRIENDSHIP: 3 };
    g.EndTurnBlockingTypes = { NONE: 0, UNITS: 1, VIEW_ADVISOR_WARNING: 2, OTHER: 3 };
    // Armies (research/37): world.units[i].army / world.enemies[i].army = a number (its armyId), world.armies =
    // { "<owner>:<army>": { x, y, capacity, unitCount } } (Armies.get: location, combatUnitCapacity, unitCount).
    const armyIdOf = (owner, army) => (army === undefined || army === null ? undefined : { owner, id: army, type: 2 });
    const unitObjects = () => (world.units ?? []).map((u) => ({
        id: { owner: 0, id: u.id, type: 1 },
        owner: 0,
        type: info.Units.lookup(u.type).$hash,
        // u.onMap === false: packed in an army (its location stays its commander's tile unless u.x is -1)
        location: { x: u.x, y: u.y },
        // A commander (UNIT_ARMY_COMMANDER, UNIT_FLEET_COMMANDER…), as the game's unit.isCommanderUnit
        isCommanderUnit: /_COMMANDER$/.test(u.type),
        isOnMap: u.onMap !== false,
        // u.embarked: the game's unit.isEmbarked (left out: unknown, our code then reads the tile)
        ...(u.embarked !== undefined ? { isEmbarked: !!u.embarked } : {}),
        armyId: armyIdOf(0, u.army),
        canMove: true,
        hasMoved: !!u.moved,
        activityType: u.activity ?? g.UnitActivityTypes.NONE,
        Health: { damage: u.damage ?? 0, maxDamage: 100 },
        // u.melee / u.ranged: combat strengths (a ranged unit has the higher ranged one)
        Combat: { attacksRemaining: u.attacks ?? 1, getMeleeStrength: () => u.melee ?? 20, rangedStrength: u.ranged ?? 0, bombardStrength: 0 },
        Movement: { movementMovesRemaining: u.moves ?? 2 },
        // u.promotions = { can: true, has: ["PROMO_A"], earnable: ["PROMO_B"] }
        Experience: u.promotions ? {
            // world.units[i].promotions.has may change between passes (a promotion bought)
            canPromote: !!u.promotions.can,
            hasPromotion: (_d, p) => (u.promotions.has ?? []).includes(p),
            canEarnPromotion: (_d, p) => (u.promotions.earnable ?? []).includes(p),
        } : undefined,
    }));
    const enemyIds = () => (world.enemies ?? []).map((e, i) => ({ id: { owner: e.owner ?? 1, id: 1000 + i, type: 1 }, e }));
    g.Units = {
        // world.commandRadius(unitId) -> plot indices of a commander's radius (Units.getCommandRadiusPlots; default none)
        getCommandRadiusPlots: (id) => world.commandRadius?.(id) ?? [],
        // world.units[i].dest = {x, y}: a move order the unit keeps (its activity OPERATION)
        getQueuedOperationDestination: (id) => (world.units ?? []).find((u) => u.id === id?.id && (id?.owner ?? 0) === 0)?.dest ?? null,
        get: (id) => unitObjects().find((u) => u.id.owner === id?.owner && u.id.id === id?.id)
            ?? (() => {
                const hit = enemyIds().find((x) => x.id.id === id?.id && id?.owner === x.id.owner);
                return hit ? {
                    id: hit.id, owner: hit.id.owner, type: info.Units.lookup(hit.e.type ?? "UNIT_WARRIOR").$hash, location: { x: hit.e.x, y: hit.e.y }, Health: { damage: hit.e.damage ?? 0, maxDamage: 100 },
                    isCommanderUnit: /_COMMANDER$/.test(hit.e.type ?? ""), isOnMap: hit.e.onMap !== false, armyId: armyIdOf(hit.id.owner, hit.e.army),
                } : null;
            })(),
        // A straight walk, two tiles a turn, step by step (each step the neighbour nearest the
        // target, lowest index first); world.unreachable(x, y, unitId) -> no path.
        getPathTo: (id, l) => {
            const u = g.Units.get(id);
            if (!u || world.unreachable?.(l.x, l.y, id)) return { plots: [], turns: [] };
            const plots = [];
            let at = grid.index(u.location.x, u.location.y);
            const to = grid.index(l.x, l.y);
            while (at !== to && plots.length < 500) {
                const p = loc(at);
                at = grid.neighbours(at).map((n) => (typeof n === "number" ? n : n.idx))
                    .map((n) => ({ n, d: grid.distanceXY(loc(n).x, loc(n).y, l.x, l.y) }))
                    .sort((a, b) => a.d - b.d || a.n - b.n)[0].n;
                if (grid.distanceXY(loc(at).x, loc(at).y, l.x, l.y) >= grid.distanceXY(p.x, p.y, l.x, l.y)) break;
                plots.push(at);
            }
            return { plots, turns: plots.map((_, i) => Math.ceil((i + 1) / 2)) };
        },
    };
    g.Armies = {
        get: (id) => {
            const a = id ? world.armies?.[`${id.owner}:${id.id}`] : null;
            return a ? { location: { x: a.x, y: a.y }, combatUnitCapacity: a.capacity ?? 4, unitCount: a.unitCount ?? 0, localId: id.id } : null;
        },
    };
    // Every unit on a plot: ours (world.units) and other players' (world.enemies).
    g.MapUnits = {
        getUnits: (x, y) => [
            // Not units packed in an army (no flag of their own in the game: very likely not on the plot either).
            ...unitObjects().filter((u) => u.isOnMap && u.location.x === x && u.location.y === y).map((u) => u.id),
            ...enemyIds().filter(({ e }) => e.onMap !== false && e.x === x && e.y === y).map(({ id }) => id),
        ],
    };
    g.Game.UnitOperations = {
        canStart: (id, op, args) => {
            const custom = world.unitCanStart?.(id, op, args);
            if (custom) return custom;
            // Like the game: a unit disperses only the village it stands on (world.villages).
            if (op === "UNITOPERATION_DISPERSE_INDEPENDENT") {
                const u = (world.units ?? []).find((x) => x.id === id?.id);
                return { Success: !!u && (world.villages ?? []).some((v) => v.x === u.x && v.y === u.y) };
            }
            if (op === g.UnitOperationTypes.RANGE_ATTACK && args?.X === undefined) {
                const targets = world.rangeTargets?.(id) ?? [];
                return { Success: targets.length > 0, Plots: targets.map((t) => grid.index(t.x, t.y)), Modifiers: targets.map(() => g.OperationPlotModifiers.ATTACK) };
            }
            return { Success: true };
        },
        sendRequest: (id, op, args) => {
            sent.push({ kind: "unit", id, op, args: args ? { ...args } : undefined });
            // world.readyLag (ms): like the game, the ready list moves on a moment after a request
            if (world.readyLag) setTimeout(() => world.readyUnits?.shift(), world.readyLag);
            else world.readyUnits?.shift();
            if (op === g.UnitOperationTypes.MOVE_TO && args?.Modifiers & g.UnitOperationMoveModifiers.ATTACK) setImmediate(() => g.engine.trigger("Combat", {}));
            // A ranged attack fights too.
            if (op === g.UnitOperationTypes.RANGE_ATTACK && args?.X !== undefined) setImmediate(() => g.engine.trigger("Combat", {}));
            if ((op === "UNITOPERATION_AIR_ATTACK" || op === "UNITOPERATION_NAVAL_ATTACK") && args?.X !== undefined) setImmediate(() => g.engine.trigger("Combat", {}));
        },
    };
    // Combat: world.combat(unitId, {x, y}) -> { dealt, taken } (the predicted damage to the defender
    // and to the attacker), answered like the game: simulateAttackAsync returns a query token and
    // the event SimulateCombatResult comes later with it; world.districtAt(x, y) -> a settlement's
    // defences there. An attack (MOVE_TO with Modifiers ATTACK) fires the event Combat.
    g.CombatTypes = { NO_COMBAT: 0, COMBAT_MELEE: 1, COMBAT_RANGED: 2 };
    // No global ComponentID: the game's UI imports it (core/ui/utilities/utilities-component-id.js);
    // in our scripts it is undefined (research/22 B1). Ids are compared by value.
    delete g.ComponentID;
    const invalidId = () => ({ owner: -1, id: -1, type: 0 });
    let queries = 0;
    g.Game.Combat = {
        getDefensibleDistrict: (l) => (world.districtAt?.(l.x, l.y) ? { owner: 1, id: 7000 + l.x * 100 + l.y, type: 2 } : invalidId()),
        // world.noPrediction: the game never answers (probe P1: seen in game 6)
        simulateAttackAsync: (id, args) => {
            const token = { owner: 0, id: ++queries, type: 9 };
            if (world.noPrediction) return token;
            const p = world.combat?.(id, { x: args.X, y: args.Y });
            const defender = enemyIds().find(({ e }) => e.x === args.X && e.y === args.Y);
            // Like the game: the answer carries its own copy of the token, equal by value only.
            setImmediate(() => g.engine.trigger("SimulateCombatResult", p ? {
                QueryToken: { ...token },
                Attacker: { ID: id, DamageTo: p.taken },
                Defender: { ID: defender?.id, DamageTo: p.dealt, MaxHitPoints: 100 },
            } : { QueryToken: { ...token } }));
            return token;
        },
    };
    g.Game.UnitCommands = {
        // world.unitCommandResult(id, op, args) -> a full result ({ Success, Plots }) when given
        canStart: (id, op, args) => world.unitCommandResult?.(id, op, args) ?? { Success: !!world.unitCommandOk?.(id, op, args) },
        sendRequest: (id, op, args) => {
            sent.push({ kind: "unitCommand", id, op, args: { ...args } });
            // A commander's Focus Fire / Coordinated Attack fights like an attack.
            if (/^UNITCOMMAND_FOCUSED_ATTACK/.test(op)) setImmediate(() => g.engine.trigger("Combat", {}));
        },
    };
    // world.blocker = { type, name } (what holds the turn; type from EndTurnBlockingTypes);
    // world.notifications = [{ name, player }] (the local player's notifications).
    const notes = () => world.notifications ?? [];
    // world.diplomacy = { [actionID]: { initialPlayer, actionType, responses: [{ responseType, responseName, cost }] } }
    g.DiplomaticResponseTypes = { DIPLOMACY_RESPONSE_SUPPORT: 0, DIPLOMACY_RESPONSE_ACCEPT: 1, DIPLOMACY_RESPONSE_REJECT: 2 };
    // world.befriend = { [independentId]: { status, ongoing } } (the "befriend" project per independent)
    g.DiplomacyActionTypes = {
        DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN: 31, DIPLOMACY_ACTION_OPEN_BORDERS: 32, DIPLOMACY_ACTION_COUNTER_SPY: 33, DIPLOMACY_ACTION_SEND_DELEGATION: 34,
        DIPLOMACY_ACTION_RESEARCH_COLLABORATION: 35, DIPLOMACY_ACTION_CULTURAL_EXCHANGE: 36, DIPLOMACY_ACTION_MINOR_TRADE: 37,
        DIPLOMACY_ACTION_FARMERS_MARKET: 38, DIPLOMACY_ACTION_LOCAL_FESTIVALS: 39, DIPLOMACY_ACTION_WONDER_CONSTRUCTION: 40,
        DIPLOMACY_ACTION_DECLARE_WAR: 44, DIPLOMACY_ACTION_FORM_ALLIANCE: 45, DIPLOMACY_ACTION_DECLARE_FORMAL_WAR: 46,
        // A rival's espionage (group ESPIONAGE) and sanction (group SANCTION), as the game names them.
        DIPLOMACY_ACTION_ESPIONAGE_STEAL_RICHES: 47, DIPLOMACY_ACTION_SABOTAGE_RESEARCH: 48,
    };
    g.WarTypes = { SURPRISE_WAR: 0, FORMAL_WAR: 1 };
    g.DiplomacyPlayerRelationships = { PLAYER_RELATIONSHIP_HOSTILE: 10, PLAYER_RELATIONSHIP_UNFRIENDLY: 11, PLAYER_RELATIONSHIP_NEUTRAL: 12, PLAYER_RELATIONSHIP_FRIENDLY: 13, PLAYER_RELATIONSHIP_HELPFUL: 14 };
    g.DiplomacyTokenTypes = { DIPLOMACY_TOKEN_GLOBAL: 1 };
    g.IndependentRelationship = { NOT_APPLICABLE: 0, HOSTILE: 1, NEUTRAL: 2, FRIENDLY: 3 };
    // world.indepRelation = { [independentId]: IndependentRelationship } (default HOSTILE)
    // world.indepNames = { [independentId]: LOC key } (independentName: the village's own name; else null, as for a city-state)
    g.Game.IndependentPowers = {
        independentName: (id) => world.indepNames?.[id] ?? null,
        getIndependentPlayerIDFromUnit: (id) => id?.owner ?? -1,
        getIndependentRelationship: (indep) => world.indepRelation?.[indep] ?? g.IndependentRelationship.HOSTILE,
    };
    g.DiplomacyActionTargetTypes = { NO_DIPLOMACY_TARGET: -1 };
    g.DiplomacyActionGroups = { NO_DIPLOMACY_ACTION_GROUP: -1, DIPLOMACY_ACTION_GROUP_ENDEAVOR: 2 };
    g.DiplomacyProjectStatus = { PROJECT_AVAILABLE: 0, PROJECT_NOT_ENOUGH_INFLUENCE: 1, PROJECT_NO_VIABLE_TARGETS: 2, PROJECT_NOT_UNLOCKED: 3, PROJECT_BLOCKED: 4, PROJECT_ACTIVE: 5 };
    g.Game.Diplomacy = {
        getResponseDataForUI: (id) => (world.diplomacy?.[id] ? { actionID: id, responseList: world.diplomacy[id].responses } : null),
        getDiplomaticEventData: (id) => world.diplomacy?.[id] ?? null,
        // world.nextCallToArms = an action id (an ally's war calling us)
        getNextCallToArms: () => world.nextCallToArms ?? -1,
        getPlayerEvents: (id) => [
            ...(world.befriend?.[id]?.ongoing ? [{ initialPlayer: 0, actionType: 31, uniqueID: 900 + id }] : []),
            ...(world.openBorders?.[id]?.ongoing ? [{ initialPlayer: 0, targetPlayer: id, actionType: 32, uniqueID: 800 + id }] : []),
            // world.events[playerId] = [{ initialPlayer, targetPlayer, actionType }] (actions under way)
            ...(world.events?.[id] ?? []),
        ],
        // world.befriend[indep] / world.openBorders[leader] = { status, ongoing }: the project offered
        getProjectDataForUI: (_p, target) => [
            ...(world.befriend?.[target] ? [{ actionType: 31, operationType: "DIPLOMACY_ACTION_BEFRIEND", projectStatus: world.befriend[target].status ?? 0 }] : []),
            ...(world.openBorders?.[target] ? [{ actionType: 32, operationType: "DIPLOMACY_ACTION_OPEN_BORDERS", projectStatus: world.openBorders[target].status ?? 0 }] : []),
            // world.projects[target] = [{ actionType, operationType, projectStatus, targetList1: [{ targetID, costYieldD }] }]
            ...(world.projects?.[target] ?? []),
        ],
    };
    // Peace deals: world.pendingDeals = [player id]; world.incomingDeals = { [player id]: [items] } (a deal that
    // leader sent us: { type, subType, from, to, amount }); world.dealAnswer(playerId) -> the DealAction it
    // answers our INSPECT with (a DiplomacyStatement event, like the game; undefined: no answer). Requests
    // are logged as kind "deal". The game's numbers on the wire: PROPOSED 4, ADJUSTED 3, REJECTED 2, INSPECT 7.
    g.DiplomacyDealDirection = { OUTGOING: 0, INCOMING: 1 };
    g.DiplomacyDealItemTypes = { AGREEMENTS: 1, CITIES: 2, GOLD: 3, INFLUENCE: 4 };
    g.DiplomacyDealItemAgreementTypes = { MAKE_PEACE: 1 };
    g.DiplomacyDealProposalActions = { ACCEPTED: 1, REJECTED: 2, ADJUSTED: 3, PROPOSED: 4, INSPECT: 7 };
    const incoming = (b) => world.incomingDeals?.[b] ?? null;
    g.Game.DiplomacyDeals = {
        hasPendingDeal: (_a, b) => (world.pendingDeals ?? []).includes(b) || !!incoming(b),
        clearWorkingDeal: (id) => sent.push({ kind: "deal", op: "clear", id }),
        addItemToWorkingDeal: (id, item) => sent.push({ kind: "deal", op: "add", id, item }),
        sendWorkingDeal: (id, action) => {
            sent.push({ kind: "deal", op: "send", id, action });
            const answer = action === g.DiplomacyDealProposalActions.INSPECT ? world.dealAnswer?.(id.player2) : undefined;
            if (answer !== undefined) {
                setImmediate(() => g.engine.trigger("DiplomacyStatement", { sessionId: 600 + id.player2, values: { FromPlayer: id.player2, ToPlayer: 0, DealAction: answer, RespondingToDealAction: action } }));
            }
        },
        getWorkingDeal: (id) => (incoming(id.player2) ? { itemIds: incoming(id.player2).map((_x, i) => i) } : { itemIds: [] }),
        getWorkingDealItem: (id, i) => (incoming(id.player2)?.[i] ? { id: i, ...incoming(id.player2)[i] } : null),
    };
    g.Game.DiplomacySessions = { closeSession: (id) => sent.push({ kind: "deal", op: "closeSession", id }) };
    g.DiplomacyPlayerFirstMeets = { PLAYER_REALATIONSHIP_FIRSTMEET_NEUTRAL: 0, PLAYER_REALATIONSHIP_FIRSTMEET_FRIENDLY: 1, PLAYER_REALATIONSHIP_FIRSTMEET_UNFRIENDLY: 2 };
    g.Game.Notifications = {
        getEndTurnBlockingType: () => world.blocker?.type ?? 0,
        findEndTurnBlocking: () => (world.blocker ? { owner: 0, id: 77, type: 1 } : null),
        getIdsForPlayer: () => notes().map((_n, i) => ({ owner: 0, id: i, type: 2 })),
        find: (id) => {
            if (id?.type === 2) {
                const n = notes()[id.id];
                return n ? { Type: hash(n.name), Player: n.player, Target: n.target } : null;
            }
            return world.blocker ? { Type: hash(world.blocker.name) } : null;
        },
        getTypeName: (type) => [...notes().map((n) => n.name), world.blocker?.name].find((n) => n && hash(n) === type) ?? null,
        dismiss: (id) => {
            if (id?.type === 2 && notes()[id.id]) world.notifications = notes().filter((_n, i) => i !== id.id);
            sent.push({ kind: "dismiss", id });
        },
        activate: (id) => sent.push({ kind: "activate", id }),
        // world.notifications[i].summary: the notice's text (a LOC key), as the notification train shows it.
        getSummary: (id) => (id?.type === 2 ? notes()[id.id]?.summary ?? null : null),
    };
    g.GameContext.hasSentTurnComplete = () => !!world.turnSent;
    g.GameContext.sendTurnComplete = () => {
        world.turnSent = true;
        sent.push({ kind: "endTurn" });
    };
    g.OrderTypes = { ORDER_TOWN_UPGRADE: 7 };
    g.Game.CityCommands = {
        canStart: (id, op, args) => (op === g.CityCommandTypes.CHANGE_GROWTH_MODE
            // world.canFocus(id, args) -> bool; world.focusProjects(id) -> ["PROJECT_TOWN_GRANARY", ...]
            ? (args?.ProjectType != null ? { Success: world.canFocus?.(id, args) ?? true } : { Success: true, Projects: world.focusProjects?.(id)?.map((t) => info.Projects.lookup(t).$hash) })
            // world.expand(id) -> { Plots: [idx], ConstructibleTypes: [hash] } (growth: tiles the city may take)
            : op === g.CityCommandTypes.EXPAND ? world.expand?.(id) ?? { Success: false }
            // Raze or keep a settlement just taken (model-city-capture-chooser.js): only for one isJustConqueredFrom
            : op === g.CityCommandTypes.DESTROY ? { Success: !!(world.cities ?? []).filter((x) => x.owner === id?.owner)[id?.id]?.justConquered }
            : args?.ConstructibleType != null || args?.UnitType != null
            ? world.canBuy?.(typeOf(args), id, args) ?? { Success: false }
            // world.canConvert: false (no town may become a city) or (cityId) -> bool. Like the game:
            // Success only when the gold covers the town's upgrade cost, else InsufficientFunds.
            : ((ok) => {
                const town = (world.cities ?? []).filter((x) => x.owner === id?.owner)[id?.id];
                const rich = (world.gold ?? 0) >= (town?.cost ?? 300);
                return { Success: ok && rich, InsufficientFunds: ok && !rich, FailureReasons: !ok ? ["LOC_NOPE"] : rich ? [] : ["LOC_INSUFFICIENT_FUNDS"] };
            })(typeof world.canConvert === "function" ? !!world.canConvert(id) : world.canConvert !== false)),
        sendRequest: (id, op, args) => {
            sent.push({ kind: "command", id, op, args: { ...args } });
            // Like the game: a placed citizen is no longer waiting.
            if (op === g.CityCommandTypes.EXPAND) {
                const c = (world.cities ?? []).filter((x) => x.owner === id?.owner)[id?.id];
                if (c) c.readyToGrow = false;
            }
        },
    };
    g.Game.PlayerOperations = {
        canStart: () => ({ Success: true }),
        sendRequest: (pid, op, args) => sent.push({ kind: "player", id: pid, op, args: { ...args } }),
    };
    // world.greatWorks = { [index]: "GREATWORK_TYPE" }
    g.Game.Culture = { getGreatWorkType: (i) => (world.greatWorks?.[i] ? hash(world.greatWorks[i]) : -1) };
    // world.finalAge (isFinalAge), world.ageCountdown (ageCountdownStarted), world.agePoints (of world.ageMax, default 100;
    // 0: no age timer), world.extendedGame (isExtendedGame: played on past the game's end)
    g.Game.AgeProgressManager = {
        getCurrentAgeProgressionPoints: () => world.agePoints ?? 20, getMaxAgeProgressionPoints: () => world.ageMax ?? 100,
        get isExtendedGame() { return !!world.extendedGame; },
        get isFinalAge() { return !!world.finalAge; },
        set isFinalAge(v) { world.finalAge = !!v; },
        get ageCountdownStarted() { return !!world.ageCountdown; },
        set ageCountdownStarted(v) { world.ageCountdown = !!v; },
    };
    for (const p of players) {
        // Read on every access, like the game (a test may found or convert a settlement).
        const mine = () => (world.cities ?? []).filter((c) => c.owner === p.id);
        p.Stats = {
            get numCities() { return mine().filter((c) => !c.isTown).length; },
            get numTowns() { return mine().filter((c) => c.isTown).length; },
            get numSettlements() { return mine().length; },
            get settlementCap() { return world.settlementCap ?? 4; },
        };
        p.Cities.getCityLimit = () => world.cityLimit ?? 0;
        // world.happiness: the empire's Happiness a turn (the top bar's player.Stats.getNetYield(YIELD_HAPPINESS))
        p.Stats.getNetYield = (y) => (y === g.YieldTypes.YIELD_GOLD ? world.goldIncome ?? 0 : y === g.YieldTypes.YIELD_HAPPINESS ? world.happiness ?? 0 : 0);
        // world.techs = ["NODE_TECH_EX_SHIPBUILDING"] (researched nodes)
        // world.research.turns = { nodeType: turns } (default 5)
        const turnsFor = (n) => world.research?.turns?.[g.GameInfo.ProgressionTreeNodes?.lookup(n)?.ProgressionTreeNodeType ?? n] ?? 5;
        p.Techs = { getTreeType: () => "TREE_TECH", getAllAvailableNodeTypes: () => world.research?.tech?.available ?? [], getTurnsForNode: turnsFor, isNodeUnlocked: (n) => (world.techs ?? []).includes(n) };
        // world.archive = [great work index]; world.researchAges(continent) -> ages left to research there
        p.Culture = {
            getActiveTree: () => "TREE_CIVIC", getAllAvailableNodeTypes: () => world.research?.culture?.available ?? [], getTurnsForNode: turnsFor,
            getNumWorksInArchive: () => (world.archive ?? []).length, getArchivedGreatWork: (i) => world.archive[i],
            getNumAgesAvailableToResearch: (continent) => world.researchAges?.(continent) ?? 0,
        };
        // world.wonderArtifacts = [feature index] (natural wonders that still hold an artifact)
        p.Stats.hasNaturalWonderArtifact = (feature) => (world.wonderArtifacts ?? []).includes(feature);
        // Another player's units: its world.enemies (owner = its id), as Units.get answers them.
        if (p.id !== 0) p.Units = { getUnits: () => enemyIds().filter(({ id }) => id.owner === p.id).map(({ id }) => g.Units.get(id)) };
        if (p.id === 0) {
            p.Units = { getUnits: unitObjects };
            // world.resources = [{ value, type, offMap }] (the player's resources); world.resourcesLocked
            p.Resources = {
                getResources: () => (world.resources ?? []).map((r) => ({ value: r.value, uniqueResource: { resource: info.Resources.lookup(r.type).$hash }, isOffMap: !!r.offMap })),
                isResourceAssignmentLocked: () => !!world.resourcesLocked,
            };
            p.Trade = {
                projectPossibleTradeRoutes: () => world.tradeRoutes ?? [],
                getTradeCapacityFromPlayer: (owner) => world.tradeCapacity?.(owner) ?? 1,
                countPlayerTradeRoutesTo: () => 0,
            };
        }
    }
    g.Cities = { get: (id) => (id ? cityObjects(id.owner)[id.id] ?? null : null) };
    g.Players = {
        get: (id) => players.find((p) => p.id === id) ?? null,
        getAlive: () => players,
        Treasury: { get: () => ({ goldBalance: world.gold ?? 0 }) },
        // world.districtHealth(x, y) -> current health of the district there (max 100; default full)
        Districts: {
            get: () => ({
                getDistrictHealth: (l) => world.districtHealth?.(l.x, l.y) ?? 100,
                // world.districtMax(x, y): its full health (0: an unwalled urban district; default 100)
                getDistrictMaxHealth: (l) => world.districtMax?.(l.x, l.y) ?? 100,
            }),
        },
        // world.treeRecs(subject) / world.buildRecs(cityId) -> the game advisor's recommendations
        Advisory: {
            get: () => ({
                getTreeRecommendations: (p) => world.treeRecs?.(p.subject) ?? [],
                getBuildRecommendations: (p) => world.buildRecs?.(p.cityId) ?? [],
            }),
        },
        // world.players[i].uniqueQuarters = ["QUARTER_ACROPOLIS"], read on every call so a
        // test can unlock one mid-turn (Syncretism).
        Constructibles: {
            get: (id) => ({
                getUnlockedUniqueQuarters: () => ((world.players ?? []).find((p) => p.id === id)?.uniqueQuarters ?? []).map((t) => info.UniqueQuarters.lookup(t).$hash),
            }),
        },
    };
    return { grid, info, sent };
}

/**
 * Simulates Detailed Map Tacks' storage and event handlers (same GameTutorial key
 * layout as dmt-utility-serialize.js + dmt-map-tack-store.js).
 */
export function installFakeDmt() {
    const H = (key) => Database.makeHash(`_DMT_OBJ_MAP_TACK_${key}`);
    const keys = () => new Set((GameTutorial.getProperty(H("KEYS")) ?? "").split(",").filter(Boolean));
    const read = (k) => JSON.parse(GameTutorial.getProperty(H(k)) ?? "null") ?? [];
    const write = (k, list) => {
        GameTutorial.setProperty(H(k), list.length ? JSON.stringify(list) : null);
        const ks = keys();
        ks.add(k);
        GameTutorial.setProperty(H("KEYS"), [...ks].join(","));
    };
    globalThis.__XPL_DMT_ACTIVE = true;
    engine.on("AddMapTackRequest", (t) => {
        if (typeof t.validStatus !== "object") throw new Error("validStatus must be an object");
        const k = `${t.x}-${t.y}`;
        write(k, [...read(k), t]);
        engine.trigger("MapTackUIUpdated", [{ x: t.x, y: t.y, mapTackList: read(k) }]);
    });
    engine.on("RemoveMapTackRequest", (t) => {
        const k = `${t.x}-${t.y}`;
        const list = read(k);
        const i = list.findIndex((m) => m.type === t.type);
        if (i >= 0) list.splice(i, 1);
        write(k, list);
    });
    return { read: (x, y) => read(`${x}-${y}`), add: (x, y, type) => engine.trigger("AddMapTackRequest", { x, y, type, classType: "BUILDING", validStatus: {}, yieldDetails: {} }) };
}
