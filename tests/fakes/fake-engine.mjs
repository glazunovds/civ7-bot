// Minimal fake of the Civ VII UI globals used by ui/data/*.js, backed by real game
// data (tests/fixtures/gameinfo-<age>.json) and a programmable hex map.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HexGrid } from "../../mod/expansion-planner/ui/core/xpl-hex.js";

const here = dirname(fileURLToPath(import.meta.url));
const KEYS = {
    Ages: "AgeType", Terrains: "TerrainType", Biomes: "BiomeType", Features: "FeatureType",
    Resources: "ResourceType", Yields: "YieldType", Constructibles: "ConstructibleType",
    Buildings: "ConstructibleType", Adjacency_YieldChanges: "ID", Districts: "DistrictType",
    Wonders: "ConstructibleType", UniqueQuarters: "UniqueQuarterType", GlobalParameters: "Name",
    Civilizations: "CivilizationType", Projects: "ProjectType", Units: "UnitType",
    ProgressionTreeNodes: "ProgressionTreeNodeType", GreatWorks: "GreatWorkType", Victories: "VictoryType", Attributes: "AttributeType",
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
    g.Configuration = { getGame: () => ({ isNetworkMultiplayer: !!world.networkMP }) };
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
        isRiver: (x, y) => !!tile(x, y).river,
        isFreshWater: (x, y) => !!tile(x, y).river,
        getAppeal: () => 0,
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
            // world.cities[i].distant = true: a Distant Lands settlement
            isDistantLands: !!c.distant,
        // world.cities[i].trains = "UNIT_SCOUT" (a unit in its queue)
            isCapital: i === 0,
            population: c.pop ?? 3,
            location: { x: c.x, y: c.y },
            getPurchasedPlots: () => grid.radius(grid.index(c.x, c.y), 1).map((p) => p.idx),
            Yields: {
                getNetYield: (y) => (y === g.YieldTypes.YIELD_PRODUCTION ? c.prod ?? 5 : y === g.YieldTypes.YIELD_FOOD ? c.food ?? 3 : y === g.YieldTypes.YIELD_HAPPINESS ? c.happy ?? 1 : 1),
                getYield: (y) => (y === g.YieldTypes.YIELD_PRODUCTION ? c.prod ?? 5 : 1),
                // world.placements(city) -> { buildings: [{ constructibleType, placements: [{ plotID, yieldChanges, changeDetails }] }] }
                calculateAllBuildingsPlacements: () => world.placements?.(c) ?? null,
            },
            Gold: { getTownUpgradeCost: () => c.cost ?? 300, getBuildingPurchaseCost: (_y, type) => world.buyCost?.(type) ?? 250 },
            Production: { getConstructibleProductionCost: (type) => world.costOf?.(type) ?? 100 },
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
    // Build queues: world.cities[i].queue = { type, turns, pct } (current production only).
    const makeQueue = (c) => ({
        isEmpty: !c.queue,
        currentProductionKind: 0,
        currentProductionTypeHash: c.queue ? info.Constructibles.lookup(c.queue.type).$hash : -1,
        currentTurnsLeft: c.queue?.turns ?? 0,
        getTurnsLeft: (type) => (c.queue && c.queue.type === type ? c.queue.turns : world.turnsFor?.(c, type) ?? -1),
        getPercentComplete: () => c.queue?.pct ?? 0,
        getQueue: () => [
            ...(c.queue ? [{ kind: 0, constructibleType: info.Constructibles.lookup(c.queue.type).$hash, type: info.Constructibles.lookup(c.queue.type).$hash }] : []),
            // world.cities[i].queued = [constructible type] (more buildings queued behind the current one)
            ...(c.queued ?? []).map((t) => ({ kind: 0, constructibleType: info.Constructibles.lookup(t).$hash, type: info.Constructibles.lookup(t).$hash })),
            ...(c.trains ? [{ kind: 1, unitType: info.Units.lookup(c.trains).$hash, type: info.Units.lookup(c.trains).$hash }] : []),
        ],
    });
    // Wonders in the world: world.wonders = [{ owner, type, x, y, complete }].
    const wonderIds = (world.wonders ?? []).map((w, i) => {
        const id = `w-${i}`;
        componentIds.set(id, { type: info.Constructibles.lookup(w.type).$hash, complete: w.complete !== false, location: { x: w.x, y: w.y } });
        return { id, w };
    });
    const players = (world.players ?? [{ id: 0 }]).map((p) => ({
        id: p.id,
        // world.players[i].civ = "CIVILIZATION_GREECE" (optional)
        civilizationType: p.civ ? info.Civilizations.lookup(p.civ)?.$hash : undefined,
        Constructibles: { getWonders: (pid) => wonderIds.filter(({ w }) => w.owner === pid).map(({ id }) => id) },
        isIndependent: !!p.isIndependent,
        civilizationName: p.name ?? `PLAYER_${p.id}`,
        Cities: { getCities: () => cityObjects(p.id) },
        isMajor: !p.isIndependent,
        // world.distantAt(x, y) -> true on the Distant Lands (for the local player)
        isDistantLands: (l) => !!world.distantAt?.(l.x, l.y),
        // world.influence: the local player's Influence
        DiplomacyTreasury: { get diplomacyBalance() { return world.influence ?? 0; } },
        Diplomacy: {
            // world.met = [player id], world.wars = [player id], world.relations = { [id]: "UNFRIENDLY" }, world.relationLevels = { [id]: n }
            hasMet: (o) => (world.met ?? []).includes(o),
            isAtWarWith: (o) => (world.wars ?? []).includes(o),
            hasAllied: (o) => (world.allies ?? []).includes(o),
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
    }));
    // Districts / constructibles on plots: world.structures(x, y) -> { district, constructibles: [type] }
    g.Districts = {
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
    g.CityCommandTypes = { PURCHASE: 1, CHANGE_GROWTH_MODE: 2, EXPAND: 3 };
    g.PlayerOperationTypes = { ASSIGN_WORKER: 1, SET_TECH_TREE_NODE: 2, SET_CULTURE_TREE_NODE: 3, CHANGE_TRADITION: 4, CHOOSE_GOLDEN_AGE: 5, CHOOSE_NARRATIVE_STORY_DIRECTION: 6, VIEWED_ADVISOR_WARNING: 7, CONSIDER_ASSIGN_TRADITIONS: 8, CONSIDER_ASSIGN_RESOURCE: 9, CONSIDER_ASSIGN_ATTRIBUTE: 10, RESPOND_DIPLOMATIC_FIRST_MEET: 11, CHANGE_GOVERNMENT: 12, FOUND_PANTHEON: 13, RESPOND_DIPLOMATIC_ACTION: 14, SUPPORT_DIPLOMATIC_ACTION: 15, FOUND_RELIGION: 16, ADD_BELIEF: 17, MOVE_GREAT_WORK: 40, ASSIGN_RESOURCE: 41, DECLARE_WAR: 42, CANCEL_ALLIANCE: 43, BUY_ATTRIBUTE_TREE_NODE: 44 };
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
    const unitObjects = () => (world.units ?? []).map((u) => ({
        id: { owner: 0, id: u.id, type: 1 },
        owner: 0,
        type: info.Units.lookup(u.type).$hash,
        location: { x: u.x, y: u.y },
        isOnMap: true,
        canMove: true,
        hasMoved: !!u.moved,
        activityType: u.activity ?? g.UnitActivityTypes.NONE,
        Health: { damage: u.damage ?? 0, maxDamage: 100 },
        Combat: { attacksRemaining: u.attacks ?? 1 },
        Movement: { movementMovesRemaining: 2 },
        // u.promotions = { can: true, has: ["PROMO_A"], earnable: ["PROMO_B"] }
        Experience: u.promotions ? {
            canPromote: !!u.promotions.can,
            hasPromotion: (_d, p) => (u.promotions.has ?? []).includes(p),
            canEarnPromotion: (_d, p) => (u.promotions.earnable ?? []).includes(p),
        } : undefined,
    }));
    const enemyIds = () => (world.enemies ?? []).map((e, i) => ({ id: { owner: e.owner ?? 1, id: 1000 + i, type: 1 }, e }));
    g.Units = {
        get: (id) => unitObjects().find((u) => u.id.owner === id?.owner && u.id.id === id?.id)
            ?? (() => {
                const hit = enemyIds().find((x) => x.id.id === id?.id && id?.owner === x.id.owner);
                return hit ? { id: hit.id, owner: hit.id.owner, type: info.Units.lookup(hit.e.type ?? "UNIT_WARRIOR").$hash, location: { x: hit.e.x, y: hit.e.y }, Health: { damage: hit.e.damage ?? 0 } } : null;
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
    // Every unit on a plot: ours (world.units) and other players' (world.enemies).
    g.MapUnits = {
        getUnits: (x, y) => [
            ...unitObjects().filter((u) => u.location.x === x && u.location.y === y).map((u) => u.id),
            ...enemyIds().filter(({ e }) => e.x === x && e.y === y).map(({ id }) => id),
        ],
    };
    g.Game.UnitOperations = {
        canStart: (id, op, args) => {
            const custom = world.unitCanStart?.(id, op, args);
            if (custom) return custom;
            if (op === g.UnitOperationTypes.RANGE_ATTACK && args?.X === undefined) {
                const targets = world.rangeTargets?.(id) ?? [];
                return { Success: targets.length > 0, Plots: targets.map((t) => grid.index(t.x, t.y)), Modifiers: targets.map(() => g.OperationPlotModifiers.ATTACK) };
            }
            return { Success: true };
        },
        sendRequest: (id, op, args) => {
            sent.push({ kind: "unit", id, op, args: args ? { ...args } : undefined });
            world.readyUnits?.shift();
        },
    };
    g.Game.UnitCommands = {
        // world.unitCommandResult(id, op, args) -> a full result ({ Success, Plots }) when given
        canStart: (id, op, args) => world.unitCommandResult?.(id, op, args) ?? { Success: !!world.unitCommandOk?.(id, op, args) },
        sendRequest: (id, op, args) => sent.push({ kind: "unitCommand", id, op, args: { ...args } }),
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
        DIPLOMACY_ACTION_DECLARE_WAR: 44, DIPLOMACY_ACTION_FORM_ALLIANCE: 45,
    };
    g.DiplomacyPlayerRelationships = { PLAYER_RELATIONSHIP_HOSTILE: 10, PLAYER_RELATIONSHIP_UNFRIENDLY: 11, PLAYER_RELATIONSHIP_NEUTRAL: 12, PLAYER_RELATIONSHIP_FRIENDLY: 13, PLAYER_RELATIONSHIP_HELPFUL: 14 };
    g.DiplomacyTokenTypes = { DIPLOMACY_TOKEN_GLOBAL: 1 };
    g.IndependentRelationship = { NOT_APPLICABLE: 0, HOSTILE: 1, NEUTRAL: 2, FRIENDLY: 3 };
    // world.indepRelation = { [independentId]: IndependentRelationship } (default HOSTILE)
    g.Game.IndependentPowers = {
        getIndependentPlayerIDFromUnit: (id) => id?.owner ?? -1,
        getIndependentRelationship: (indep) => world.indepRelation?.[indep] ?? g.IndependentRelationship.HOSTILE,
    };
    g.DiplomacyActionTargetTypes = { NO_DIPLOMACY_TARGET: -1 };
    g.DiplomacyActionGroups = { NO_DIPLOMACY_ACTION_GROUP: -1, DIPLOMACY_ACTION_GROUP_ENDEAVOR: 2 };
    g.DiplomacyProjectStatus = { PROJECT_AVAILABLE: 0, PROJECT_NOT_ENOUGH_INFLUENCE: 1 };
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
    // Peace deals: world.pendingDeals = [player id]; requests are logged as kind "deal".
    g.DiplomacyDealDirection = { OUTGOING: 0, INCOMING: 1 };
    g.DiplomacyDealItemTypes = { AGREEMENTS: 1 };
    g.DiplomacyDealItemAgreementTypes = { MAKE_PEACE: 1 };
    g.DiplomacyDealProposalActions = { PROPOSED: 0, ACCEPTED: 1, REJECTED: 2, INSPECT: 3, ADJUSTED: 4 };
    g.Game.DiplomacyDeals = {
        hasPendingDeal: (_a, b) => (world.pendingDeals ?? []).includes(b),
        clearWorkingDeal: (id) => sent.push({ kind: "deal", op: "clear", id }),
        addItemToWorkingDeal: (id, item) => sent.push({ kind: "deal", op: "add", id, item }),
        sendWorkingDeal: (id, action) => sent.push({ kind: "deal", op: "send", id, action }),
    };
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
            : args?.ConstructibleType != null
            ? world.canBuy?.(typeOf(args), id, args) ?? { Success: false }
            : { Success: world.canConvert !== false, FailureReasons: world.canConvert === false ? ["LOC_NOPE"] : [] }),
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
    g.Game.AgeProgressManager = { getCurrentAgeProgressionPoints: () => world.agePoints ?? 20, getMaxAgeProgressionPoints: () => 100, isFinalAge: false };
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
        p.Stats.getNetYield = (y) => (y === g.YieldTypes.YIELD_GOLD ? world.goldIncome ?? 0 : 0);
        // world.techs = ["NODE_TECH_EX_SHIPBUILDING"] (researched nodes)
        p.Techs = { getTreeType: () => "TREE_TECH", getAllAvailableNodeTypes: () => world.research?.tech?.available ?? [], getTurnsForNode: () => 5, isNodeUnlocked: (n) => (world.techs ?? []).includes(n) };
        // world.archive = [great work index]; world.researchAges(continent) -> ages left to research there
        p.Culture = {
            getActiveTree: () => "TREE_CIVIC", getAllAvailableNodeTypes: () => world.research?.culture?.available ?? [], getTurnsForNode: () => 5,
            getNumWorksInArchive: () => (world.archive ?? []).length, getArchivedGreatWork: (i) => world.archive[i],
            getNumAgesAvailableToResearch: (continent) => world.researchAges?.(continent) ?? 0,
        };
        // world.wonderArtifacts = [feature index] (natural wonders that still hold an artifact)
        p.Stats.hasNaturalWonderArtifact = (feature) => (world.wonderArtifacts ?? []).includes(feature);
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
