# 07 — Gameplay JS API available to UI scripts (cheat-sheet)

Scope: the read-only game-state API that Civ VII **UI** JavaScript can call, catalogued from the shipped base-game UI code. The goal is to support a UI-only mod that (a) scores settlement sites, (b) finds the best adjacency tiles for buildings, and (c) estimates production and turns-to-build.

## Conventions

- All paths are relative to `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\`. Abbreviations:
  - `bs/` = `base-standard/`
  - `core/` = `core/`
  - `ant/` = `age-antiquity/`
- `file:line` points to the shipped, compiled `.js`. The Dev Tools `Reference\` folder has the original `.ts`/`.tsx` sources of the same UI, with different line numbers.
- **VERIFIED** means a call with this shape appears in base UI code at the cited line. **INFERRED** means the claim is my reading of names, usage or context and has not been confirmed by docs or a run.
- **Typings:** the Dev Tools do **not** ship gameplay `.d.ts` typings.
  - `Reference/core/ui/index.d.ts` only has `/// <reference types="modding-sdk/types/gameplay" />`, and the `modding-sdk` package is absent from the install. VERIFIED.
  - The `Documentation\` folder covers DB, modinfo and modifiers only. There are no JS API docs. VERIFIED.
  - The `Reference\**\*.ts` sources do name types: `PlotCoord`, `OperationResult`, `PlacementData`, `PlacementBuildingData`, `GetBestSettleLocationsResult`, `WorkerPlacementInfo`, `BuildRecommendation`. They are useful for naming but carry no definitions. VERIFIED.

---

## 0. Headline findings

1. **Engine settle recommender exists.** Call `player.AI.getBestSettleLocationsForSettler(count, originPlotCoord)`. It returns ranked suggestions `{ location, factors[{positive,title,description}] }` driven by the `PlotEvalConditions` and "Default Settlement Plot Evaluations" tables in `bs/data/AI_Base.xml`. VERIFIED (`bs/ui/lenses/layer/settlement-recommendations-layer.js:43`).
2. **Engine settle-validity check exists for any plot.** Call `player.Diplomacy.isValidLandClaimLocation({x,y}, true)`. The settler lens calls it for every plot on the map to paint "Cannot settle: too close to settlement or blocked by terrain". VERIFIED (`bs/ui/lenses/layer/appeal-layer.js:52`).
3. **Engine building-placement solver exists.** Call `city.Yields.calculateAllBuildingsPlacements()`. It returns, for every buildable constructible, every legal plot with per-yield totals and an adjacency/base/warehouse/worker breakdown. The production chooser uses it to pick the best tile. VERIFIED (`bs/ui/building-placement/building-placement-manager.js:131`).
4. **Engine turns and cost are available.**
   - `city.BuildQueue.getTurnsLeft(typeString)` works even for items that are not queued (the production chooser calls it for every listed item).
   - `city.Production.getConstructibleProductionCost(type)`, `getUnitProductionCost`, `getProjectProductionCost` give cost.
   - `city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION)` gives production per turn.
   - VERIFIED.
5. **Town → City.**
   - Cost: `city.Gold.getTownUpgradeCost()`.
   - Validity: `Game.CityCommands.canStart(townID, CityCommandTypes.PURCHASE, {Directive: OrderTypes.ORDER_TOWN_UPGRADE}, false)`, which returns `.Success` and `.FailureReasons`.
   - City cap: `player.Stats.numCities` vs `player.Cities.getCityLimit()`.
   - VERIFIED.

---

## 1. Map and plots

### 1.1 Coordinates and indexing

| Call | Signature / returns | Example | Status |
|---|---|---|---|
| `GameplayMap.getGridWidth()` / `getGridHeight()` | `() → number` | `bs/ui/lenses/layer/appeal-layer.js:41-42` | VERIFIED |
| `GameplayMap.getIndexFromXY(x, y)` | `→ plotIndex` | `bs/ui/lenses/layer/worker-yields-layer.js:94` | VERIFIED |
| `GameplayMap.getIndexFromLocation({x,y})` | `→ plotIndex` (‑1 if invalid; callers test `>= 0`) | `bs/ui/lenses/layer/settlement-recommendations-layer.js:24-25` | VERIFIED |
| `GameplayMap.getLocationFromIndex(i)` | `→ {x,y}` | `bs/ui/building-placement/building-placement-manager.js:176` | VERIFIED |
| `GameplayMap.isValidIndex(i)`, `isValidLocation({x,y})` | `→ bool` | `bs/ui/lenses/layer/radial-measurement-layer.js:181`; `bs/ui/endgame/screen-endgame.js:651` | VERIFIED |
| Index formula | `index = x + width * y` (computed by hand) | `bs/ui/lenses/layer/yields-layer.js:65` | VERIFIED |
| Horizontal wrap | UI wraps x with `((x % W) + W) % W` | `bs/ui/lenses/layer/radial-measurement-layer.js:179` | VERIFIED; the native radius/adjacency helpers probably handle wrap (INFERRED) |

### 1.2 Distance, radius and adjacency

| Call | Signature | Example | Status |
|---|---|---|---|
| `GameplayMap.getPlotDistance(x1,y1,x2,y2)` | `→ number` (hex distance) | `bs/ui/trade-route-chooser/trade-route-chooser.js:430` | VERIFIED |
| `GameplayMap.getPlotIndicesInRadius(x, y, r)` | `→ plotIndex[]` | `bs/ui/lenses/layer/radial-measurement-layer.js:137` (r=3), `:144` (r=6); `bs/ui/interface-modes/interface-mode-wmd-strike.js:112` | VERIFIED |
| `GameplayMap.getAdjacentPlotLocation({x,y}, DirectionTypes.X)` | `→ {x,y}` | `bs/ui/lenses/layer/city-borders-layer.js:122`; `bs/ui-next/screens/endgame/endgame-cinematics.js:186` | VERIFIED |
| `GameplayMap.getDirectionToPlot(fromCoord, toCoord)` | `→ DirectionTypes` | `bs/ui/building-placement/building-placement-manager.js:441` | VERIFIED |
| `DirectionTypes` | `DIRECTION_EAST/NORTHEAST/NORTHWEST/SOUTHEAST/SOUTHWEST/WEST`, `NO_DIRECTION`, `NUM_DIRECTION_TYPES` | global enum (used widely) | VERIFIED |

Note: the settler lens "radial ruler" draws radius 3 and radius 6 around the cursor. That is the in-game hint for city working radius (3) and settlement spacing.

### 1.3 Terrain, biome, feature and resource

| Call | Returns | Example | Status |
|---|---|---|---|
| `GameplayMap.getTerrainType(x,y)` | terrain index → `GameInfo.Terrains.lookup()` | `bs/ui-next/tooltips/plot-tooltip/helpers.js:13-14` | VERIFIED |
| `GameplayMap.getBiomeType(x,y)` | → `GameInfo.Biomes.lookup()` | `helpers.js:31-32` | VERIFIED |
| `GameplayMap.getFeatureType(x,y)` | → `GameInfo.Features.lookup()` | `helpers.js:56-57` | VERIFIED |
| `GameplayMap.getFeatureClassType(x,y)` | feature class index | `bs/ui/lenses/layer/random-events-layer.js:26` | VERIFIED |
| `GameplayMap.getResourceType(x,y)` | resource index, `ResourceTypes.NO_RESOURCE` if none → `GameInfo.Resources.lookup()` | `bs/ui/lenses/layer/resource-layer.js:42-46` | VERIFIED |
| `Game.Resources.getResourceOnPlot(plotIndex)` | resource info | `bs/ui-next/screens/commerce/commerce-screen-model.js:166` | VERIFIED |
| `GameplayMap.getRiverType(x,y)` | `RiverTypes.NO_RIVER / RIVER_MINOR / RIVER_NAVIGABLE` | `helpers.js:83-91` | VERIFIED |
| `GameplayMap.getRiverName(x,y)`, `getVolcanoName`, `isVolcano`, `isVolcanoActive` | | `helpers.js:66-68,85` | VERIFIED |
| `GameplayMap.isNavigableRiver(x,y)`, `isRiver(x,y)`, `isAdjacentToRivers(x,y,n)` | bool | only in map scripts: `bs/maps/assign-starting-plots.js:822,1273`; `bs/maps/feature-biome-generator.js:53` | INFERRED available in UI (same `GameplayMap` global; not seen in UI) |
| `GameplayMap.isFreshWater(x,y)` | bool | `bs/ui/lenses/layer/appeal-layer.js:59` | VERIFIED |
| `GameplayMap.isWater(x,y)` | bool | `appeal-layer.js:53` | VERIFIED |
| `GameplayMap.isLake(x,y)` | bool (lakes are `TERRAIN_COAST`) | `helpers.js:17` | VERIFIED |
| `GameplayMap.isMountain(x,y)` | bool | `bs/ui-next/tooltips/plot-tooltip/plot-tooltip.js:825` | VERIFIED |
| `GameplayMap.isImpassable(x,y)` | bool | map scripts only: `bs/maps/discovery-generator.js:172` | INFERRED in UI |
| `GameplayMap.isCoastalLand(x,y)`, `isAdjacentToLand`, `isAdjacentToShallowWater`, `isCliffCrossing(x,y,dir)` | bool | map scripts only: `bs/maps/elevation-terrain-generator.js:107,137,44` | INFERRED in UI |
| `GameplayMap.isIsland(x,y)` | bool | `plot-tooltip.js:923` | VERIFIED |
| `GameplayMap.isNaturalWonder(x,y)` | bool | `helpers.js:58`; `bs/ui/lenses/layer/continent-layer.js:87` | VERIFIED |
| `GameplayMap.getContinentType(x,y)` | → `GameInfo.Continents.lookup()` (‑1 = none) | `helpers.js:75-76`; `continent-layer.js:86` | VERIFIED |
| `GameplayMap.getAreaId(x,y)`, `getRegionId(x,y)`; `MapAreas.getAreaPlots(id)`, `MapRegions.getRegionPlots(id)` | | `bs/ui/tuner-input/tuner-input.js:501,506,543` | VERIFIED (debug tuner code) |
| `GameplayMap.getLandmassRegionId`, `getHemisphere(x)`, `getPrimaryHemisphere()`, `getPlotLatitude`, `getRainfall`, `hasPlotTag` | | map scripts only | INFERRED in UI |
| `GameplayMap.getElevation(x,y)` | number | map scripts only (`bs/maps/EarthMaps/Earth_Huge.js:775`) | INFERRED in UI |
| `GameplayMap.getAppeal(x,y)` | number; thresholds in GlobalParameters `APPEAL_FOR_HAPPINESS_TILE_YIELD` / `APPEAL_FOR_DOUBLE_HAPPINESS_TILE_YIELD` | `helpers.js:43-47`; `bs/ui/lenses/layer/general-appeal-layer.js:74` | VERIFIED |
| `GameplayMap.getRouteType(x,y)`, `isFerry(x,y)` | | `helpers.js:101-103` | VERIFIED |
| `MapFeatures.getFeatureInfoAt(i)`, `getVolcanoEruptionInfoAt(i)` | | `bs/ui/cinematic/cinematic-manager.js:293`; `helpers.js:69` | VERIFIED |
| `MapPlotEffects.getPlotEffects(plotIndex)` | | `helpers.js:389` | VERIFIED |

### 1.4 Yields on a plot

| Call | Returns | Example | Status |
|---|---|---|---|
| `GameplayMap.getYields(plotIndex, playerID)` | array of `[yieldType, amount]` pairs; `yieldType` resolves via `GameInfo.Yields.lookup(yieldType)` | `bs/ui-next/tooltips/plot-tooltip/helpers.js:179-184`; `bs/ui/lenses/layer/yields-layer.js:112,121` | VERIFIED |
| `GameplayMap.getYieldsWithCity(plotIndex, cityID)` | same shape, as worked by a specific city | `bs/ui/lenses/layer/worker-yields-layer.js:268`; `bs/ui/production-chooser/production-chooser-helpers.js:151-158` | VERIFIED |

Note: the first argument is a **plot index**, not `{x,y}` (`worker-yields-layer.js:256-268` passes `plotIndex`). VERIFIED.

### 1.5 Ownership, cities and districts on a plot

| Call | Returns | Example | Status |
|---|---|---|---|
| `GameplayMap.getOwner(x,y)` | playerID or `PlayerIds.NO_PLAYER` | `bs/ui/cinematic/cinematic-manager.js:501`; `helpers.js:198` | VERIFIED |
| `GameplayMap.getOwnerName(x,y)`, `getOwnerHostility(x,y,localID)` | | `helpers.js:232,236` | VERIFIED |
| `GameplayMap.getOwningCityFromXY(x,y)` | city ComponentID | `ant/ui/tutorial/tutorial-items-antiquity.js:2604` | VERIFIED |
| `MapCities.getCity(x,y)` | city ComponentID or null | `bs/ui/building-placement/building-placement-manager.js:177` | VERIFIED |
| `MapCities.getDistrict(x,y)` | district ComponentID or null | same file `:178`; `helpers.js:249` | VERIFIED |
| `Cities.getAtLocation(plotIndex)` | City object | `bs/ui/lenses/layer/radial-measurement-layer.js:157` | VERIFIED |
| `Districts.getAtLocation({x,y})`, `Districts.getIdAtLocation({x,y})`, `Districts.get(id)`, `Districts.getLocations(ids)` | District object / id. District has `.type` → `GameInfo.Districts.lookup()`, `.owner`, `.controllingPlayer` | `bs/ui/city-details/model-city-details.js:572`; `bs/ui/tuner-input/tuner-input.js:179`; `helpers.js:252`; `bs/ui/interface-modes/support-city-decoration.js:35` | VERIFIED |
| `MapConstructibles.getConstructibles(x,y)` | ComponentID[] | `bs/ui/production-chooser/production-chooser-helpers.js:145` | VERIFIED |
| `MapConstructibles.getHiddenFilteredConstructibles(x,y)` | ComponentID[] with fog-hidden ones removed | `bs/ui/lenses/layer/yields-layer.js:61` | VERIFIED |
| `Constructibles.getByComponentID(id)` | `{type, location, owner, complete, damaged, uniqueQuarterType}`; `type` → `GameInfo.Constructibles.lookup()` (`ConstructibleClass` is `BUILDING`, `WONDER` or `IMPROVEMENT`) | `helpers.js:144-166` | VERIFIED |
| `MapUnits.getUnits(x,y)` | unit IDs on plot | `bs/ui/unit-actions/unit-actions.js:774` | VERIFIED |
| `Game.IndependentPowers.getIndependentPlayerIDAt(...)` | | used 7× in UI | VERIFIED (exists) |

---

## 2. Settlement validity and recommendations

### 2.1 Validity: `player.Diplomacy.isValidLandClaimLocation(plotCoord, bool)` (VERIFIED)

```js
// bs/ui/lenses/layer/appeal-layer.js:34-65  (settler lens "fxs-appeal-layer")
const localPlayerDiplomacy = Players.get(GameContext.localPlayerID)?.Diplomacy;
for x in 0..W, y in 0..H:
  if (!localPlayerDiplomacy.isValidLandClaimLocation({x,y}, true)) {
     if (GameplayMap.isWater(x,y)) continue;   // water: not drawn
     blocked.push(...)                          // "Cannot Settle: Too close to settlement or blocked by terrain"
  } else if (GameplayMap.isFreshWater(x,y)) best.push(...)  // "Can Settle"
  else okay.push(...)                           // "Can Settle: -5 Happiness from no Fresh Water"
```

- The legend strings come from `bs/text/en_us/UIText.xml` keys `LOC_UI_SETTLER_LEGEND_BAD/OKAY/GOOD/RECOMMENDED`. VERIFIED.
- The same call appears in `bs/ui/lenses/layer/random-events-layer.js:21`. VERIFIED.
- The meaning of the second argument (`true`) is unknown. See Open questions.
- During advanced-start placement the lens also uses `GameplayMap.isPlotInAdvancedStartRegion(playerID, x, y)` (`appeal-layer.js:47`). VERIFIED.
- The appeal layer re-runs on the `CityInitialized` engine event (`appeal-layer.js:33`). VERIFIED.

### 2.2 AI recommendations: `player.AI.getBestSettleLocationsForSettler(count, originCoord)` (VERIFIED)

```js
// bs/ui/lenses/layer/settlement-recommendations-layer.js:11-59
const player = Players.get(GameContext.localPlayerID);
// origins = every FoundCity unit location + every city location of the local player
for (const u of player.Units.getUnits()) if (GameInfo.Units.lookup(u.type)?.FoundCity) origins.add(GameplayMap.getIndexFromLocation(u.location));
for (const c of player.Cities.getCities()) origins.add(GameplayMap.getIndexFromLocation(c.location));
for (const idx of origins) {
  const suggestions = player.AI?.getBestSettleLocationsForSettler(3, GameplayMap.getLocationFromIndex(idx));
  // suggestion: { location:{x,y}, factors:[{ positive:bool, title:LOCKey, description:LOCKey }] , ...? }
}
PlotIconsManager.addPlotIcon("plot-icon-suggested-settlement", location);
```

- TS type name: `GetBestSettleLocationsResult[]` (`Reference/base-standard/ui/lenses/layer/settlement-recommendations-layer.ts`). VERIFIED.
- Fields used by the UI: `location`, `factors[].positive/title/description` (`bs/ui/tooltips/settlement-recommendation-tooltip.js:56,69`; `bs/ui-next/tooltips/plot-tooltip/settlement-recommendation-content.js:23`). VERIFIED. Whether a numeric score is also returned is unknown.
- **Bug in base code**, VERIFIED at line 46: `suggestionPlotIndex = GameplayMap.getIndexFromLocation(location)` uses the *origin* location instead of `suggestion.location`. The de-duplication therefore does not work, and two origins can produce duplicate recommendations. Our mod should de-dupe on `suggestion.location`.
- Lenses that use the layer:
  - `fxs-settler-lens` (`bs/ui/lenses/lens/settler-lens.js:4-11`). Its layers are appeal, resource, random-events, settlement-recommendations, yields and culture-borders.
  - `fxs-founder-lens`, when the tutorial is off (`bs/ui/lenses/lens/founder-lens.js:9`).
  - The lens is switched on when a `FoundCity` unit is selected (`bs/ui/interface-modes/interface-mode-unit-selected.js:115-121`).
  - All VERIFIED.
- Scoring data lives in `bs/data/AI_Base.xml:20-40`. VERIFIED.
  - `PlotEvalConditions` has conditions with Poor/Good thresholds: Nearest Friendly City, New Resources, Inner Ring Yield (poor 18 / good 26), Total Yield (30 / 50), Coastal, Fresh Water, Specific Resource/Feature/Terrain/Biome, Resource Class, Foreign Continent, Lake, Natural Wonder In Inner Ring, Breathtaking Tiles, River In Inner Ring.
  - The weighted list is "Default Settlement Plot Evaluations" (`AI_Base.xml:227+`).
  - Factor title strings are in `bs/text/en_us/SettlementRecommendationText.xml`.
  - INFERRED: these tables are DB data, so they are readable from UI as `GameInfo.PlotEvalConditions` etc. (not seen in UI code).

### 2.3 Unit-operation based validity

- `Game.UnitOperations.canStart(unitID, opType, args, testOnly)` returns an `OperationResult` with `.Success`, `.Plots`, `.FailureReasons` and similar. VERIFIED (`bs/ui/unit-actions/unit-actions.js:966-977`, args `{X:-9999, Y:-9999}` = "no target").
- `UNITOPERATION_FOUND_CITY` is shown only as a unit action (`unit-actions.js:1443,1639`). The base UI never calls it with an arbitrary X/Y. INFERRED: it validates only at the settler's current plot, so it is not useful for map-wide scoring.
- `UNITOPERATION_FOUND_CITY_ADJACENT_PLOT`: `canStart(unitID, op, {}, false).Plots` gives the valid adjacent settle plots (`bs/ui/interface-modes/interface-mode-found-city-adjacent-plot.js:11-18`). VERIFIED.
- Settlers are identified with `GameInfo.Units.lookup(unit.type)?.FoundCity` (`settlement-recommendations-layer.js:22`). `UNIT_FOUNDER` is the special first settler (`interface-mode-unit-selected.js:117`). VERIFIED.

---

## 3. Players, cities and production

### 3.1 Player

| Call | Example | Status |
|---|---|---|
| `GameContext.localPlayerID` (also `localObserverID`) | everywhere, e.g. `appeal-layer.js:34` | VERIFIED |
| `Players.get(id)` → player; `Players.getAlive()`, `Players.getAliveMajorIds()`, `Players.isAlive(id)` | `helpers.js:225-226` | VERIFIED |
| `player.Cities.getCities()` → City[]; `getCityIds()`; `getCapital()`; `getCityLimit()` | `settlement-recommendations-layer.js:31`; `bs/ui/production-chooser/panel-production-chooser.js:964`; `ant/ui/advice/advice-items-antiquity-science.js:21` | VERIFIED |
| `player.Units.getUnits()` → Unit[] (`{id,type,location,owner,...}`); `getUnitIds()` | `settlement-recommendations-layer.js:18-21`; `ant/ui/tutorial/tutorial-items-antiquity.js:218` | VERIFIED |
| `player.Stats`: `numCities`, `numTowns`, `numSettlements`, `settlementCap`, `totalPopulation`, `getNetYield(YieldTypes.X)` | `panel-production-chooser.js:963`; `bs/ui/diplo-ribbon/panel-yield-banner.js:189,217`; `bs/ui/diplo-ribbon/model-diplo-ribbon.js:470,562` | VERIFIED |
| `player.Constructibles.getUnlockedUniqueQuarters()` | `building-placement-manager.js:123` | VERIFIED |
| `player.isDistantLands({x,y})` | `bs/ui/lenses/layer/resource-layer.js:52` | VERIFIED |
| `player.Diplomacy.isValidLandClaimLocation(coord, bool)` | section 2.1 | VERIFIED |
| `player.AI.getBestSettleLocationsForSettler(n, coord)` | section 2.2 | VERIFIED |
| `Players.Advisory.get(pid).getBuildRecommendations({cityId, subject: AdvisorySubjectTypes.PRODUCTION, maxReturnedEntries:0})` | `bs/ui/production-chooser/production-chooser-helpers.js:821-826` | VERIFIED |

### 3.2 City object (`Cities.get(cityID)`)

| Member | Example | Status |
|---|---|---|
| `id, name, owner, location, isTown, isCapital, population, urbanPopulation, ruralPopulation, isBeingRazed, isDistantLands` | `bs/ui/city-details/model-city-details.js:251-255`; `bs/ui/city-banners/city-banners.js:496` | VERIFIED |
| `city.getPurchasedPlots()` → plotIndex[] (owned tiles) | `bs/ui/lenses/layer/trade-layer.js:33`; `bs/ui/interface-modes/interface-mode-acquire-tile.js:221` | VERIFIED |
| `city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION / YIELD_FOOD)` | `city-banners.js:499,649`; `model-city-details.js:262` | VERIFIED |
| `city.Yields.getYield(YieldTypes.X)` | `city-banners.js:759` | VERIFIED |
| `city.Yields.getYields()` → array indexed like `GameInfo.Yields`, entries have `.value` | `panel-production-chooser.js:149-157` | VERIFIED |
| `city.Yields.calculateAllBuildingsPlacements()` | section 4 | VERIFIED |
| `city.Yields.getAllBaseYieldValuesForConstructible(hash)` → per-yield-index array | `building-placement-manager.js:295` | VERIFIED |
| `city.Yields.extractYieldChangesData(yieldChanges, yieldType)` → number | `building-placement-manager.js:399` | VERIFIED |
| `city.Growth`: `currentFood`, `turnsUntilGrowth`, `getNextGrowthFoodThreshold().value`, `growthType` (`GrowthTypes.EXPAND/PROJECT`), `projectType`, `isReadyToPlacePopulation`, `getGrowthDomain(excludeHidden)` → plotIndex[] | `model-city-details.js:263-270`; `bs/ui/lenses/layer/worker-yields-layer.js:83` | VERIFIED |
| `city.Workers`: `getCityWorkerCap()`, `getNumWorkers(false)`, `GetAllPlacementInfo()` → `[{PlotIndex, IsBlocked, NumWorkers, MaxWorkers, CurrentYields[], CurrentMaintenance[], ...}]`, `GetTilePlacementInfo(plotIndex)` | `bs/ui/plot-workers/plot-workers-manager.js:112-123`; `helpers.js:128-133`; `bs/ui/player-yields-report/model-yields-report.js:94-100` | VERIFIED |
| `city.Constructibles`: `getIds()`, `hasConstructible(type,...)`, `getMaintenance(typeString)` → per-yield array, `isAdjacencyUnlocked(adjID)`, `getNumWonders()` | `model-city-details.js:296`; `building-placement-manager.js:229`; `bs/ui/constructible-details/constructible-details.js:216` | VERIFIED |
| `city.Districts`: `getIds()`, `getIdsOfType()`, `get()` | counts in UI | VERIFIED (existence) |
| `city.Resources`, `city.Happiness` (`netHappinessPerTurn`, `hasUnrest`), `city.Trade`, `city.Religion` | `model-city-details.js:246,277-281` | VERIFIED |
| `city.Gold.getTownUpgradeCost()`, `getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, type)` | `panel-production-chooser.js:205`; `production-chooser-helpers.js:262` | VERIFIED |

### 3.3 Production and turns

| Call | Example | Status |
|---|---|---|
| `city.BuildQueue.getTurnsLeft(typeString)`: called for every *candidate* item, not only queued ones | `bs/ui/production-chooser/production-chooser-helpers.js:239,414,677` | VERIFIED; whether it accounts for overflow and modifiers is INFERRED (engine value) |
| `city.BuildQueue.currentTurnsLeft`, `currentProductionTypeHash`, `getPercentComplete(typeHash)`, `getQueue()` (items `{kind: ProductionKind.CONSTRUCTIBLE/UNIT/PROJECT, constructibleType, unitType, projectType, type, location}`), `isEmpty` | `bs/ui/city-banners/city-banners.js:644-701` | VERIFIED |
| `city.Production.getConstructibleProductionCost(type)`, `getUnitProductionCost(type)`, `getProjectProductionCost(type)` | `city-banners.js:684,699,714` | VERIFIED |
| `GameInfo.Constructibles` `.Cost` (base DB cost) | `production-chooser-helpers.js:253` | VERIFIED |
| `Game.CityOperations.canStartQuery(cityID, CityOperationTypes.BUILD, CityQueryType.Constructible / Unit)` → `[{index, result: OperationResult}]` | `production-chooser-helpers.js:512,661` | VERIFIED |
| `Game.CityOperations.canStart(cityID, CityOperationTypes.BUILD, {ConstructibleType: def.$index}, false)` → `{Success, Plots[], ExpandUrbanPlots[], InQueue, AlreadyExists, NeededUnlock, InsufficientFunds, RepairDamaged, Cost, FailureReasons}` | `bs/ui/production-chooser/production-chooser-operations.js:19-24`; fields in `production-chooser-helpers.js:222-309` | VERIFIED |
| `Game.CityCommands.canStart(cityID, CityCommandTypes.EXPAND, {}, false)` → `{Plots[], ConstructibleTypes[]}`: tiles the city can grow into, plus the improvement each would get | `bs/ui/place-population/model-place-population.js:91-110` | VERIFIED |

Turns formula if we need our own: `ceil((cost - progress) / netProduction)`, with `progress = getPercentComplete * cost`. INFERRED. Prefer `getTurnsLeft`.

---

## 4. Building placement and adjacency (engine solver)

```js
// bs/ui/building-placement/building-placement-manager.js:131
const all = city.Yields.calculateAllBuildingsPlacements();   // PlacementData
// all.buildings: PlacementBuildingData[]  { constructibleType: <hash>, placements: PlacementPlotData[] }
// placement:   { plotID, yieldChanges: number[] /*indexed by GameInfo.Yields $index*/,
//                changeDetails: [{ sourceType: YieldSourceTypes.*, yieldType, change, sourcePlotIndex, targetPlotIndex }],
//                overbuiltConstructibleID /* GameInfo.Constructibles $index or -1 */ }
```

- Shape VERIFIED from `building-placement-manager.js:187-188, 216-256, 316-439, 683-692, 736-781`.
- `YieldSourceTypes` values: `BASE, ADJACENCY, WAREHOUSE, WORKERS, NATURAL, CONSTRUCTIBLES, CITY_MODIFIERS, APPEAL, ENVIRONMENT, GREAT_WORKS, HALVED, MULTIPLIED, PROJECT, RESOURCES`. VERIFIED (global enum usage).
- How the base UI picks the best tile:
  - `production-chooser-helpers.js:100-203` (`GetCurrentBestTotalYieldForConstructible`) sums the yield changes per placement.
  - It subtracts the new building's maintenance (`city.Constructibles.getMaintenance`), adds back the maintenance of any overbuilt building, and removes the improvement's natural yields when the improvement has `IgnoreNaturalYields`.
  - The result is shown as "secondary details" in the production list. VERIFIED.
- Helper outputs: `getHighestAdjacencyBonus(typeHash)` (`:757-783`) and `getNumberOfWarehouseBonuses` (`:722-748`). VERIFIED.
- Adjacency changes that land in *other* cities are flagged via `MapCities.getCity(target)` (`:244-256`). VERIFIED.
- The plots a building can legally go on come from `canStart(...).Plots` (existing urban) and `.ExpandUrbanPlots` (new urban) (`:169-186`). VERIFIED.

**Static DB route** (if we want to compute it ourselves):
- `for (const a of GameInfo.Constructible_Adjacencies) if (a.ConstructibleType == T) GameInfo.Adjacency_YieldChanges.find(o => o.ID == a.YieldChangeId)` (`bs/ui/constructible-details/constructible-details.js:210-222`; `core/ui/utilities/utilities-core-textprovider.js:55-57`). VERIFIED.
- Rows with `RequiresActivation` need `city.Constructibles.isAdjacencyUnlocked(ID)`. VERIFIED.
- `Adjacency_YieldChanges` columns (`Base/Assets/schema/gameplay/01_GameplaySchema.sql:5-40`): `AdjacentBiome/Terrain/Feature/FeatureClass/District/Constructible/ConstructibleClass/ConstructibleTag/Resource/ResourceClass/SpecificResource/River/NavigableRiver/Lake/NaturalWonder/Quarter/UniqueQuarter/OtherOwner/Breathtaking/CharmingAppeal`, `Self`, `TilesRequired`, `YieldChange`, `YieldType`, `ProjectMaxYield`, `Age`. VERIFIED.
- Example rows: `age-antiquity/data/constructibles.xml:673+`.
- Related tables: `Constructible_YieldChanges` (base yields, `production-chooser-helpers.js:225`) and `Constructible_WarehouseYields` (`building-placement-manager.js:715`). VERIFIED.

---

## 5. Town → City

- **Cost**: `city.Gold?.getTownUpgradeCost() ?? -1` (`bs/ui/production-chooser/panel-production-chooser.js:205,489,640`). VERIFIED.
- **Can upgrade?**: `Game.CityCommands.canStart(townID, CityCommandTypes.PURCHASE, { Directive: OrderTypes.ORDER_TOWN_UPGRADE }, false)` returns `.Success` and `.FailureReasons[]` (`bs/ui/production-chooser/production-chooser-operations.js:1-9,27-34`; reasons used as a tooltip at `panel-production-chooser.js:979-985`). VERIFIED.
- **Do upgrade** (we will NOT do this, read-only): `Game.CityCommands.sendRequest(townID, CityCommandTypes.PURCHASE, {Directive: OrderTypes.ORDER_TOWN_UPGRADE})` (`production-chooser-operations.js:38`). VERIFIED.
- **City cap**: when `player.Stats.numCities >= player.Cities.getCityLimit()` (with limit != 0), the button is hidden and an alert shown (`panel-production-chooser.js:961-976`). VERIFIED.
- **Settlement cap**: `player.Stats.numSettlements` vs `player.Stats.settlementCap`. Events `PlayerSettlementCapChanged` and `PlayerCityLimitChanged`. VERIFIED.
- **Town focus**: `Game.CityCommands.canStart(cityID, CityCommandTypes.CHANGE_GROWTH_MODE, {Type: GrowthTypes.PROJECT}, false).Projects` (`production-chooser-helpers.js:837-854`). VERIFIED.
- Towns default to the purchase tab, because towns cannot build with production (`panel-production-chooser.js:168,198`). VERIFIED.

---

## 6. Units

- List the local player's units: `Players.get(GameContext.localPlayerID).Units.getUnits()`, giving objects with `id`, `type`, `location`, `owner`. VERIFIED (`settlement-recommendations-layer.js:18-21`). Or use `getUnitIds()` with `Units.get(id)`. VERIFIED (`ant/ui/tutorial/tutorial-items-antiquity.js:218`; `bs/ui/action/panel-action.js:719`).
- Settler test: `GameInfo.Units.lookup(unit.type)?.FoundCity`. VERIFIED.
- Selected unit: `UI.Player.getHeadSelectedUnit()`. Selected city: `UI.Player.getHeadSelectedCity()`. VERIFIED (`interface-mode-unit-selected.js:58`; `constructible-details.js:207`).
- Movement: `unit.Movement.movementMovesRemaining` and `maxMoves` (`unit-actions.js:981`). VERIFIED.
- Path and reach: `Units.getPathTo`, `Units.getReachableMovement` exist (counts in UI). VERIFIED (existence); signatures not checked.

---

## 7. GameInfo, hashes and enums

- Iterate a table with `for (const row of GameInfo.Yields)`, or `.forEach((row, idx) => …)`, `.find`, `.filter`, `.length`, `GameInfo.Yields[i]`. VERIFIED (`yields-layer.js:19`; `building-placement-manager.js:258`; `bs/ui/city-details/model-city-details.js:323`; `ant/ui/tutorial/tutorial-items-antiquity.js:1942`).
- `GameInfo.<Table>.lookup(key)` accepts a type string (`"BUILDING_PORT"`, `age-modern/ui/tutorial/tutorial-items-modern.js:124`), a hash (`instance.type`, `helpers.js:145`) or an index (`GameInfo.Yields.lookup(index)`, `building-placement-manager.js:298`). VERIFIED.
- Every row exposes `$hash` and `$index` (`building-placement-manager.js:188,226`). VERIFIED.
- `Database.makeHash("TYPE")` (`unit-actions.js:964`) and `Game.getHash("TYPE")` (`model-yields-report.js:97`; `model-city-details.js:435`) produce hashes. VERIFIED.
- Global parameters: `GameInfo.GlobalParameters.lookup(name)` via `getGlobalParamNumber` (`core/ui/utilities/utilities-data.js:59-60`). VERIFIED.
- Current age: `Game.age` (hash) → `GameInfo.Ages.lookup(Game.age)`. Turn: `Game.turn`. VERIFIED (`helpers.js:7`).
- `YieldTypes` enum: `YIELD_FOOD, YIELD_PRODUCTION, YIELD_GOLD, YIELD_SCIENCE, YIELD_CULTURE, YIELD_HAPPINESS, YIELD_DIPLOMACY, NO_YIELD`. VERIFIED (global usage). YieldTypes values are usable directly in `getNetYield`. Arrays such as `yieldChanges` are indexed by `GameInfo.Yields` `$index`. VERIFIED.
- Other enums seen: `PlayerIds.{NO_PLAYER, WORLD_PLAYER, OBSERVER_ID}`, `DistrictTypes.{CITY_CENTER, URBAN, RURAL, WILDERNESS, WONDER}`, `ResourceTypes.NO_RESOURCE`, `RiverTypes`, `GrowthTypes`, `ProjectTypes.NO_PROJECT`, `CityOperationTypes`, `CityCommandTypes`, `CityQueryType`, `OrderTypes`, `UnitOperationTypes`, `ProductionKind`. VERIFIED.

---

## 8. Visibility and fog

- `RevealedStates.HIDDEN | REVEALED | VISIBLE`. VERIFIED.
- `GameplayMap.getRevealedState(playerID, x, y)` (`bs/ui/lenses/layer/worker-yields-layer.js:92`; `radial-measurement-layer.js:155`). VERIFIED.
- `GameplayMap.getRevealedStates(playerID)` returns an array for all plots indexed by plotIndex, which is a cheap bulk read (`bs/ui/lenses/layer/yields-layer.js:30-33`). Keep it current with the `PlotVisibilityChanged` event (`data.location`, `data.visibility`; `yields-layer.js:64-66`). VERIFIED.
- `MapConstructibles.getHiddenFilteredConstructibles(x,y)` is the fog-filtered constructible list. VERIFIED.
- `GameplayMap.*` getters appear to return **true** map data whatever the fog. The resource layer reads `getResourceType` on every plot without a fog check (`resource-layer.js:40-46`). INFERRED: the mod must filter by revealed state itself to avoid leaking hidden information (fairness, and multiplayer etiquette).
- `getGrowthDomain(excludeHidden=true)` has a built-in fog filter (`worker-yields-layer.js:82-83`). VERIFIED.

---

## 9. Events (recompute triggers)

Subscribe with `engine.on(name, handler, thisArg)` and unsubscribe with `engine.off(...)`, or use `component.Root.listenForEngineEvent(name, fn, this)`. Wait for the engine with `engine.whenReady.then(...)` (`bs/ui/age-rankings/model-age-rankings.js:58`). VERIFIED.

| Event | Payload (seen) | Example | Use for us |
|---|---|---|---|
| `PlayerTurnActivated` | `{player}` | `bs/ui/action/panel-action.js:209,799-803` | full recompute on local turn |
| `LocalPlayerTurnBegin` / `LocalPlayerTurnEnd` | | `panel-action.js:204` | |
| `CityAddedToMap` / `CityInitialized` / `CityRemovedFromMap` / `CityTransfered` | `{cityID, location?}` | `bs/ui/city-banners/city-banner-manager.js:53,56,63`; `bs/ui/district/district-health-manager.js:30` | settle candidates change |
| `PlotOwnershipChanged` | `{location, owner, priorOwner}` | `bs/ui/lenses/layer/city-borders-layer.js:39,139-149` | borders and claims |
| `ConstructibleAddedToMap` / `ConstructibleRemovedFromMap` / `ConstructibleChanged` | `{location, ...}` | `bs/ui/lenses/layer/yields-layer.js:44-45`; `bs/ui/victory-manager/victory-manager.js:23` | adjacency recompute |
| `DistrictAddedToMap` / `DistrictRemovedFromMap` / `DistrictDamageChanged` | `{location}` | `city-banner-manager.js:72`; `yields-layer.js:46` | |
| `PlotYieldChanged` | `{location}` | `yields-layer.js:43` | |
| `PlotVisibilityChanged` | `{location, visibility}` | `yields-layer.js:42` | fog |
| `ResourceAddedToMap` / `ResourceRemovedFromMap` | | `bs/ui/lenses/layer/resource-layer.js:30-31` | |
| `PlotEffectAddedToMap` / `PlotEffectRemovedFromMap` | | `bs/ui/world-vfx/world-vfx.js:28` | |
| `UnitAddedToMap` / `UnitRemovedFromMap` / `UnitMoveComplete` / `UnitMoved` | `{unit}` | `panel-action.js:217-218`; `bs/ui/interface-modes/support-unit-map-decoration.js:117` | settler moved |
| `UnitSelectionChanged` / `CitySelectionChanged` | | `bs/ui/build-queue/model-build-queue.js:15` | UI focus |
| `CityPopulationChanged` / `CityYieldChanged` / `CityGrowthModeChanged` / `WorkerAdded` | `{cityID,...}` | `city-banner-manager.js:55,58`; `model-build-queue.js:38`; `bs/ui/place-population/model-place-population.js:82` | |
| `CityProductionChanged` / `CityProductionQueueChanged` / `CityProductionUpdated` / `CityProductionCompleted` | | `model-build-queue.js:43` | turns estimate |
| `PlayerSettlementCapChanged` / `PlayerCityLimitChanged` | | `bs/ui/diplo-ribbon/model-diplo-ribbon.js:117`; `panel-yield-banner.js:153` | town→city |
| `TechNodeCompleted` / `CultureNodeCompleted` | | tutorial | new buildings unlock |
| `GameCoreEventPlaybackComplete` | | `yields-layer.js:47` | batch point: flush dirty plots here |

The `yields-layer` pattern is a good template: collect dirty plot indices from events, then process them once on `GameCoreEventPlaybackComplete` (`yields-layer.js:42-93`). VERIFIED.

---

## 10. Performance notes

- All `GameplayMap`, `Players`, `Cities`, `GameInfo` and `Game.*Operations.canStart` calls are **synchronous** (direct return values, no promises). VERIFIED by every usage.
- The base UI does full W×H loops of native calls on lens activation, so this is considered acceptable. Examples, all VERIFIED:
  - `appeal-layer.js:41-65`: `isValidLandClaimLocation` and `isFreshWater` on every plot, re-run on every `CityInitialized`.
  - `resource-layer.js:38-58`.
  - `continent-layer.js:82`, `general-appeal-layer.js:68`, `random-events-layer.js:18`, `conquest-layer.js:40`, `discovery-layer.js:33`, `worker-yields-layer.js:90`.
  - `yields-layer.js:30-40` calls `getYields` plus `getHiddenFilteredConstructibles` per plot at init.
- Time-slicing precedent: the trade lens processes routes in `requestAnimationFrame` chunks with a `performance.now()` budget (`bs/ui/lenses/layer/trade-layer.js:24-53`). VERIFIED. Use the same pattern for heavy scoring, such as `getBestSettleLocationsForSettler` per origin or `calculateAllBuildingsPlacements` per city.
- `calculateAllBuildingsPlacements()` is computed once per city selection and cached in `BuildingPlacementManager` (`production-chooser-helpers.js:109-112`). INFERRED: it is relatively expensive, so cache it per city and invalidate on constructible or ownership events.
- No explicit perf comments or limits were found in the lens or placement code. VERIFIED (grep).

---

## Implications for our mod

1. **Settlement scoring.** Do not reinvent validity. Use `player.Diplomacy.isValidLandClaimLocation({x,y}, true)` as the hard filter, plus `getRevealedState != HIDDEN`.
   - Candidate set: `GameplayMap.getPlotIndicesInRadius(origin, R)` around each city and each `FoundCity` unit.
   - Score with our own model over `getPlotIndicesInRadius(candidate, 3)`. That radius matches the "town that becomes a city" growth radius, and the radial ruler uses 3.
   - Model inputs: `GameplayMap.getYields(idx, localPlayer)`, `isFreshWater`, river and lake checks, `getResourceType`, `isNaturalWonder`, `getAppeal`, and distance to own and foreign settlements via `getPlotDistance`.
   - Exclude tiles already owned (`getOwner`) or within other cities' `getPurchasedPlots`.
   - Optionally blend in or display `player.AI.getBestSettleLocationsForSettler(n, origin)`, which also gives free localized "why" factors. Re-implement its de-dupe correctly.
2. **Building adjacency.** Prefer `city.Yields.calculateAllBuildingsPlacements()`. It is the engine's own answer, including adjacency, warehouse, overbuild and cross-city spill. Rank placements the way `GetCurrentBestTotalYieldForConstructible` does.
   - Fall back to the static `Constructible_Adjacencies` + `Adjacency_YieldChanges` tables only for hypothetical plots (for example, not-yet-owned tiles of a future city).
3. **Production and turns.** Use `city.BuildQueue.getTurnsLeft(type)` and `city.Production.get*ProductionCost(type)`. Get production per turn from `city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION)`. Use our own formula only for hypothetical cities.
4. **Town → City panel.** `city.Gold.getTownUpgradeCost()` plus `CanConvertToCity`-style `canStart` (keep `FailureReasons`), checked against the city cap (`Stats.numCities` vs `Cities.getCityLimit()`).
5. **Fog correctness.** Always gate on revealed state. Use `getRevealedStates(localID)` once and update it from `PlotVisibilityChanged`.
6. **Recompute strategy.** Use the event-driven dirty set plus a flush on `GameCoreEventPlaybackComplete`, with a full refresh on `PlayerTurnActivated` for the local player. Time-slice whole-map work with `requestAnimationFrame`.
7. **Reuse the lens framework.** Register our own layer with `LensManager.registerLensLayer(...)` and a lens with `registerLens`, following `settler-lens.js` and `appeal-layer.js`. Possibly add our layer to `fxs-settler-lens` `allowedLayers`. That allowedLayers change needs verifying in the modding research.
8. **Stay read-only.** Never call `sendRequest` (`Game.CityCommands/CityOperations/UnitOperations.sendRequest`), so the mod is UI-only and safe in multiplayer.

## Open questions

1. What does the second argument of `isValidLandClaimLocation(coord, bool)` mean (ignore units? check distance rule? include water)? Test both values in game.
2. What is the full shape of `GetBestSettleLocationsResult`? Is there a numeric `score`? Does it respect fog? What range is searched around the origin? Can it be called with arbitrary origins, or only near the player's units and cities?
3. Is `player.AI` populated for a human local player in multiplayer, and is it deterministic and cheap?
4. Can `calculateAllBuildingsPlacements()` evaluate plots outside current city borders (future expansion)? Observed placements come only from `Plots`/`ExpandUrbanPlots`.
5. Does `BuildQueue.getTurnsLeft(type)` return -1 for items the city cannot build, and does it include overflow and production modifiers? Production-chooser code treats `-1` as "hide turns".
6. Several `GameplayMap` predicates (`isRiver`, `isNavigableRiver`, `isCoastalLand`, `isImpassable`, `getElevation`, `isAdjacentToRivers`, `getHemisphere`) appear only in map-generation scripts. Confirm they exist in the UI context: in the FireTuner console, or with `typeof GameplayMap.isRiver` at load.
7. Are `GameplayMap.getYields` values for unrevealed or foreign plots accurate, or masked? Are hidden resources (tech-gated) returned by `getResourceType`?
8. How much does a full W×H pass of `isValidLandClaimLocation` cost on a Huge map? Measure with `performance.now()`.
9. Are `PlotEvalConditions` and "Default Settlement Plot Evaluations" exposed in `GameInfo` (`GameInfo.PlotEvalConditions`, `GameInfo.AiListTypes` / `AiLists` / `AiFavoredItems`?) so we can mirror the AI weights?
