# 03 — Computing adjacency yields for a hypothetical building on a plot

Scope: how a Civ VII UI script can get the yield and adjacency gain of placing constructible X on plot P, including plots the city does not own yet and settlements that do not exist yet.

Path abbreviations:
- `GAME` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`
- `BS` = `GAME\Base\modules\base-standard`
- `WS` = `D:\SteamLibrary\steamapps\workshop\content\1295660`

Tags: **VERIFIED** means I read it in the source. **INFERRED** means it follows from usage or naming but I did not prove it.

---

## TL;DR

1. **Drongo's Adjacency Lens (3737207667) does not compute real adjacency.** It is a hard-coded heuristic in JS. Each adjacent mountain counts +1 culture, each adjacent resource +1 science, each adjacent water tile +1 gold. It reads no GameInfo adjacency tables and calls no engine yield API. (VERIFIED)
2. **The engine API is `city.Yields.calculateAllBuildingsPlacements()`.** It takes no arguments and returns, for one existing city, every candidate plot of every building with full yield deltas: base, adjacency in and out, warehouse, specialists and city modifiers. The UI wraps it in `BuildingPlacementManager`. (VERIFIED)
3. **It is bound to an existing city.** It only covers plots that city can build on now (`Plots` + `ExpandUrbanPlots` from `Game.CityOperations.canStart`). No engine call that I found evaluates a plot outside a city's reach, or a city that does not exist yet. (VERIFIED that no such call appears in the UI; INFERRED that none exists in the engine.)
4. **Detailed Map Tacks (WS\3507297712) already has a full, rule-driven JS reimplementation** of `Adjacency_YieldChanges`, wildcard adjacencies, warehouse yields and activation modifiers. That is the reference implementation for our planning-ahead case. (VERIFIED)
5. **Recommendation: a hybrid.** Use the engine call for plots an existing city can already build on (exact, includes modifiers). Use a JS rule engine, modelled on DMT's `dmt-adjacency-rules.js`, for everything else.

---

## 1. Drongo's Adjacency Lens (workshop 3737207667)

Files (VERIFIED): `ui/lenses/layer/drongos-adjacency-layer.js` (340 lines), `ui/lenses/lens/drongos-adjacency-lens.js`, `ui/adjacency-lens-options.js`, a minimap decorator and a mod-options decorator.

### Algorithm (VERIFIED, `drongos-adjacency-layer.js`)

- `applyLayer()` (L280-332) loops over every map plot `x∈[0,w), y∈[0,h)`. It skips a plot when any of these hold:
  - the plot is invalid or hidden (L294);
  - it is mountain, navigable river or water, or has a resource (`isExcludedLensPlot`, L140-152);
  - **it is owned by anyone** (`isOwnedPlot`, L300). The lens is a pre-settlement / unclaimed-land lens.
- `getAdjacencyScores(x,y)` (L174-200) walks the 6 neighbours with `GameplayMap.getAdjacentPlotLocation({x,y}, dir)`:

```js
const terrainTypeName = getTerrainTypeName(adjacentPlot.x, adjacentPlot.y);
if (terrainTypeName === "TERRAIN_MOUNTAIN") { scores.culture++; }
if (hasResource(adjacentPlot.x, adjacentPlot.y)) { scores.science++; }
if (isWaterAdjacency(adjacentPlot.x, adjacentPlot.y, terrainTypeName)) { scores.gold++; }
```

- "Water" means `TERRAIN_COAST/LAKE/NAVIGABLE_RIVER/OCEAN`, or `GameplayMap.isWater` (L28-33, L133-138).
- `getBestAdjacency` (L206-229) keeps the highest category that meets a threshold. The threshold is 2 or 3, read from `localStorage.modSettings`; science is always 2. Counts are capped at 6. Each plot is coloured by bucket through `WorldUI.createOverlayGroup(...).addPlotOverlay().addPlots(plots, {fillColor})` (L257-266, L316-325).
- Unowned plots with no score that are fresh-water settle spots get a teal fill. This uses `GameplayMap.isFreshWater` and `Players.get(id).Diplomacy.isValidLandClaimLocation({x,y}, true)` (L113-131).

### Data read (VERIFIED)
Only `GameInfo.Terrains.lookup` and `GameInfo.Resources.lookup`, plus `GameplayMap.getTerrainType / getResourceType / isWater / isFreshWater / getOwner / getRevealedState`. It does **not** read `Constructible_Adjacencies` or `Adjacency_YieldChanges`, ignores wonders, quarters, natural wonders and civ-specific rules, and treats ocean as a gold source.

**Takeaway:** the lens shows the right overlay technique (`WorldUI.createOverlayGroup` + `addPlotOverlay`), but its rules are not usable.

---

## 2. Base-game building placement flow

### 2.1 Entry: `INTERFACEMODE_PLACE_BUILDING`
`BS\ui\interface-modes\interface-mode-place-building.js` (VERIFIED):

```js
// L53-79 (initialize)
if (this.isPurchasing) {
  result = Game.CityCommands.canStart(context.CityID, CityCommandTypes.PURCHASE, context.OperationArguments, false);
} else {
  result = Game.CityOperations.canStart(context.CityID, CityOperationTypes.BUILD, context.OperationArguments, false);
}
const constructible = GameInfo.Constructibles.lookup(context.OperationArguments.ConstructibleType);
...
BuildingPlacementManager.initializePlacementData(context.CityID);
BuildingPlacementManager.selectPlacementData(context.CityID, result, constructible);
```

- The context is `{ CityID, IsPurchasing, OperationArguments: { ConstructibleType: <$index|$hash> } }`. `canEnterMode` requires `IsPurchasing != undefined` and a valid `CityID` (L111-114).
- Commit (L386-410): set `operationArgs.X/Y`, call `canStart(...)` again, and if `result.Success` call `Game.CityOperations.sendRequest(cityID, CityOperationTypes.BUILD, operationArgs)`.
- Overlay colours (L146-150): urbanPlots = best, developedPlots = okay, expandablePlots = good. `WorldUI.pushRegionColorFilter(city.getPurchasedPlots(), ...)` dims everything outside the city.

### 2.2 (i) Valid plots for a constructible in a city — VERIFIED

`Game.CityOperations.canStart(cityID, CityOperationTypes.BUILD, { ConstructibleType }, false)` returns an `OperationResult`. The fields the UI reads (from `building-placement-manager.js` L137-196 and `production-chooser-helpers.js` L209-320) are:

| Field | Meaning (as used by UI) |
|---|---|
| `Success` | can build now |
| `Plots: number[]` | plot indices that are already urban (existing district) → `urbanPlots` |
| `ExpandUrbanPlots: number[]` | plots that would become urban. Split by `MapCities.getDistrict(x,y) != null` into `developedPlots` (rural tile with an improvement that gets replaced) and `expandablePlots` (no district yet) |
| `InsufficientFunds`, `InQueue`, `InProgress`, `AlreadyExists`, `Locked`, `RepairDamaged`, `MoveToNewLocation` | flags |
| `NeededUnlock` | progression node index, or -1 |
| `Requirements { MeetsRequirements, FullFailure, Obsolete, NeededProgressionTreeNode, NeededPopulation }` | unlock info |
| `FailureReasons[]`, `Cost` | |

Batch form (VERIFIED, `production-chooser-helpers.js` L510-512):

```js
results = Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible);
// -> Array<{ index: <Constructibles.$index>, result: OperationResult }>
```

The purchase equivalent is `Game.CityCommands.canStart/canStartQuery(cityID, CityCommandTypes.PURCHASE, ...)`.

**Limitations:** requires a real city `ComponentID`. The plots returned are only that city's current candidates.

### 2.3 (ii) Yield and adjacency gain of placing X on P — VERIFIED

The core engine call is in `BS\ui\building-placement\building-placement-manager.js` L131:

```js
this.allPlacementData = this.city?.Yields?.calculateAllBuildingsPlacements();
```

Signature: `City.Yields.calculateAllBuildingsPlacements(): AllPlacementData`. It takes no arguments and runs per city. Its return shape, reconstructed from usage (L187-189, L214-268, L307-439, L659-783):

```ts
{ buildings: Array<{
    constructibleType: number /* Constructibles.$hash */,
    placements: Array<{
      plotID: number,                       // plot index
      yieldChanges: number[],               // net delta per yield, indexed by GameInfo.Yields.$index
      overbuiltConstructibleID: number,     // Constructibles.$index that would be replaced, or -1
      changeDetails: Array<{
        sourceType: YieldSourceTypes,       // BASE, ADJACENCY, WAREHOUSE, NATURAL, CONSTRUCTIBLES,
                                            // WORKERS, CITY_MODIFIERS, APPEAL, ENVIRONMENT, RESOURCES, ...
        yieldType: number|string,           // usable with GameInfo.Yields.lookup
        change: number,
        sourcePlotIndex: number, targetPlotIndex: number,
        sourceReference: any                // modifier id for CITY_MODIFIERS
      }>
    }>
}> }
```

Key semantics (VERIFIED):
- **Adjacency in both directions.** For `ADJACENCY` details, `sourcePlotIndex == plotIndex` means this building **gives** adjacency to a neighbour, for example a wonder boosting adjacent buildings ("TO_OTHER_BUILDINGS", L410-419). Otherwise it is incoming adjacency from that direction (L420-432).
- **Cross-city adjacency.** `getTotalYieldChangesFromPlacementData(data, excludeOtherCities=true)` subtracts adjacency that lands on tiles of other cities (L244-257). The total also adds back the maintenance of the overbuilt building and subtracts the new building's maintenance via `city.Constructibles.getMaintenance(type)` (L225-243).
- **Helpers.** `city.Yields.extractYieldChangesData(yieldChanges, yieldType)` gets one yield from the array (L399-402). `city.Yields.getAllBaseYieldValuesForConstructible(hash)` gives the base yields (L295).
- **Lens ranking.** `getPlacementOptions` in `BS\ui\lenses\layer\building-placement-layer.js` L43-101 sums `getTotalYieldChanges` and marks the top 1-3 plots as "recommended". `getBestYieldForConstructible` (manager L659-694) and `GetCurrentBestTotalYieldForConstructible` (`production-chooser-helpers.js` L100-135) take the max over `placements`.
- **Improvements too.** The same data covers improvements: `getImprovementYieldChanges(typeHash, plotIndex)` (L695-713) is used by city-growth tile placement (`model-place-population.js` L445-455), and `interface-mode-acquire-tile.js` L119-124 calls `initializePlacementData` for it.

Other per-plot yield calls (not building-specific):
- `GameplayMap.getYields(plotIndex|loc, playerID)`: `yields-layer.js` L112
- `GameplayMap.getYieldsWithCity(location, cityID)`: `worker-yields-layer.js` L268
- `city.Workers.GetAllPlacementInfo()` gives `{PlotIndex, IsBlocked, NumWorkers, MaxWorkers, ...}`: `plot-workers-manager.js` L112

Placement-preview manager methods (VERIFIED, `building-placement-manager.js`):

| Method | Lines | Returns |
|---|---|---|
| `initializePlacementData(cityID)` | 116-136 | fills `allPlacementData` |
| `selectPlacementData(cityID, opResult, def)` | 137-196 | fills urban/developed/expandable/quarter plot lists |
| `getTotalYieldChanges(plotIndex)` / `getCityYieldChanges(plotIndex)` | 271-291 | `[{yieldType, yieldChange, text, iconURL}]` |
| `getAdjacencyYieldChanges(plotIndex)` | 387-439 | adjacency-only entries |
| `getPlacementChangeDetails(plotIndex, sourceType?)` | 473-498 | raw `changeDetails` |
| `getHighestAdjacencyBonus(typeHash)` / `getNumberOfWarehouseBonuses(typeHash)` | 722-783 | max over all plots |
| `canGetAdjacencyBonuses(type)` / `canGetWarehouseBonuses(type)` | 714-756 | scan `Constructible_Adjacencies` / `Constructible_WarehouseYields` |
| `getYieldBonusBreakdownFromPlacementData(data)` | 784-870 | grouped by source type |

Caveat (VERIFIED): `BuildingPlacementManager` is a **singleton shared with the base UI** (L935). Calling `initializePlacementData` from our mod overwrites `_cityID` and `allPlacementData` while the player may be in placement mode. **Our mod should call `city.Yields.calculateAllBuildingsPlacements()` directly** and not touch the singleton.

### 2.4 Limitations of the engine path
- It needs an existing `City` object. (VERIFIED: called on `this.city.Yields`.)
- Plot coverage is limited to the city's own candidate plots. The UI only treats `Plots ∪ ExpandUrbanPlots` as selectable (`isPlotIndexSelectable`, L197-205). `expandablePlots` are plots with no district: tiles in the city's reach that are not yet developed. Whether they extend beyond `getPurchasedPlots()` is INFERRED. They look like the "growth/expand" ring next to owned land, not arbitrary tiles 3+ hexes away.
- It is unknown whether `calculateAllBuildingsPlacements` contains buildings that are still locked or not yet available. The comment says "Placement data for all possible constructibles" (L47). The production chooser looks up locked items in it as well (`GetConstructibleItemData` with `hideIfUnavailable=false`), but how it handles a missing entry is unclear. (INFERRED: likely only currently-buildable constructibles.)
- Cost is unknown. It computes every building × every plot at once, so call it once per city per refresh and cache the result. (INFERRED)

---

## 3. Unowned plots and hypothetical settlements

### 3.1 Engine
- I found no UI usage of any function that takes `(constructibleType, plot)` without a city, or that simulates a city that does not exist. Every yield-preview path goes through `city.Yields.*` or `city.Workers.*` (grep over `Base\modules`, see the method census in my notes: `Yields.calculateAllBuildingsPlacements`, `getAllBaseYieldValuesForConstructible`, `extractYieldChangesData`, `getYields`, `getNetYield`, `getYield`, `getTradeYields`, `getResourceYields`). (VERIFIED for the UI corpus. INFERRED that no hidden engine method exists.)
- `GameplayMap.getYields(plot, playerID)` gives the tile's own current yields. It is useful for settlement scoring but not for building adjacency.
- `Players.get(pid).Diplomacy.isValidLandClaimLocation({x,y}, true)` checks whether a plot can be settled (used by Drongo, L117-127). (VERIFIED usage)

**Conclusion:** for plots outside a city's current candidate set, and for hypothetical settlements, we need a **JS reimplementation**.

### 3.2 DB schema (VERIFIED: `GAME\Base\Assets\schema\gameplay\01_GameplaySchema.sql`)

There are no `.sql` schema files in `Base\modules`. The gameplay schema lives in `Base\Assets\schema\gameplay\01_GameplaySchema.sql`.

**`Adjacency_YieldChanges`** (L5-40). Every column, with the number of data rows that use it across Base+DLC (my grep tally):

| Column | Type | Usage count | Semantics (INFERRED unless noted) |
|---|---|---|---|
| `ID` | TEXT PK | — | |
| `YieldType` | TEXT | all | yield granted |
| `YieldChange` | REAL | all (1: 185, 2: 10, 4: 3) | amount per `TilesRequired` matches |
| `TilesRequired` | INT, default 1 | 200 (2 rows use 2) | `floor(matches / TilesRequired) * YieldChange` (DMT formula) |
| `ProjectMaxYield` | BOOL | 122 | probably affects UI projection/"max yield" display; not a matching condition |
| `AdjacentTerrain` | TEXT→Terrains | 36 | e.g. `TERRAIN_MOUNTAIN`, `TERRAIN_COAST`, `TERRAIN_NAVIGABLE_RIVER` |
| `AdjacentConstructibleTag` | TEXT | 30 | count each matching constructible on the neighbour |
| `AdjacentDistrict` | TEXT→Districts | 23 | e.g. `DISTRICT_WONDER`, `DISTRICT_URBAN` |
| `AdjacentQuarter` | BOOL | 21 | neighbour is a quarter |
| `AdjacentResource` | BOOL | 18 | neighbour has any resource |
| `AdjacentConstructible` | TEXT→Constructibles | 17 | |
| `AdjacentLake` | BOOL | 10 | |
| `AdjacentSpecificResource` | TEXT→Resources | 6 | |
| `AdjacentNaturalWonder` | BOOL | 6 | |
| `AdjacentBiome` | TEXT→Biomes | 6 | |
| `AdjacentFeatureClass` | TEXT | 5 | |
| `AdjacentBreathtakingAppeal` / `AdjacentCharmingAppeal` | BOOL | 5 / 2 | thresholds from GlobalParameters `APPEAL_FOR_DOUBLE_HAPPINESS_TILE_YIELD` / `APPEAL_FOR_HAPPINESS_TILE_YIELD` (per DMT) |
| `AdjacentNavigableRiver` | BOOL | 3 | |
| `AdjacentFeature` | TEXT→Features | 3 | |
| `AdjacentConstructibleClass` | TEXT | 3 | e.g. `IMPROVEMENT` |
| `AdjacentRiver` | BOOL | 2 | |
| `AdjacentUniqueQuarterType` / `AdjacentUniqueQuarter` | TEXT / BOOL | 2 / 1 | |
| `AdjacentOtherOwner` | BOOL | 1 | neighbour owned by another player |
| `AdjacentResourceClass` | TEXT, default `NO_RESOURCECLASS` | 0 explicit | |
| `AdjacentSeaResource` | BOOL | 0 | |
| `Self` | BOOL | 0 | include own tile (DMT supports it) |
| `Age` | TEXT | (28, mixed with Warehouse rows) | rule valid only in that age |
| `PersistOnTransfer` | BOOL | 5 | |

There is **no `ProjectsTo` column** (VERIFIED). Adjacency is defined per receiving building. The engine's "outgoing" adjacency (a wonder adding to neighbours) is just the neighbour's own `AdjacentDistrict="DISTRICT_WONDER"` rule evaluated in reverse.

Related tables (VERIFIED, same file):
- `Constructible_Adjacencies (ConstructibleType, YieldChangeId, Name, RequiresActivation)` (L1117-1125). Links buildings to rules. `RequiresActivation=1` means the rule needs a modifier `EFFECT_CITY_ACTIVATE_CONSTRUCTIBLE_ADJACENCY` (civ/leader/tech unlocks). The UI checks this with `city.Constructibles.isAdjacencyUnlocked(yieldChangeId)` (`BS\ui\constructible-details\constructible-details.js` L210-218).
- `Constructible_WildcardAdjacencies (YieldChangeId, ConstructibleClass, ConstructibleTag, CurrentAgeConstructiblesOnly, HasBiome, HasNavigableRiver, HasTerrain, HasYield, RequiresActivation)` (L1301-1313). Applies a rule to every building that matches. Examples: `ConstructibleTag="SCIENCE"` for Han and Khmer, `ConstructibleClass="BUILDING"` for Goose Societies.
- `Constructible_WarehouseYields (ConstructibleType, YieldChangeId, RequiresActivation)` (L1293-1300) → `Warehouse_YieldChanges (ID, Age, BiomeInCity, ConstructibleInCity, DistrictInCity, FeatureClassInCity, FeatureInCity, LakeInCity, MinorRiverInCity, NaturalWonderInCity, NavigableRiverInCity, Overbuilt, ResourceInCity, RouteInCity, TerrainInCity, TerrainTagInCity, YieldChange, YieldType)` (L4522-4545). These are **city-wide** counts, not adjacency.
- `Constructible_WildcardWarehouseYields (YieldChangeId, ConstructibleTag, RequiresActivation)` (L1314-1320).
- `ExcludedAdjacencies (TraitType, YieldChangeId)` (L1836-1842). A trait can disable a rule.
- `Constructible_YieldChanges (ConstructibleType, YieldType, YieldChange)` (L1321-1328). Base yields.
- Placement validity: `Constructibles.{AdjacentDistrict, AdjacentLake, AdjacentRiver, AdjacentTerrain, NoFeature, NoRiver, RiverPlacement, ExistingDistrictOnly, RequiresHomeland, RequiresDistantLands, Age, ConstructibleClass}` (L1076-1116), `Constructible_ValidDistricts/ValidTerrains/ValidBiomes/ValidFeatures/ValidResources/RequiredFeatures/InvalidFeatures/InvalidAdjacentBiomes` (L1183-1292), `Wonders.{AdjacentCapital, AdjacentConstructible, AdjacentResource, AdjacentToLand, AdjacentToMountain, ...}` (L4571+), `Districts.MaxConstructibles` (L1705-1735), `UniqueQuarters (UniqueQuarterType, BuildingType1, BuildingType2, TraitType)` (L3981-3993).

Example data (VERIFIED). `BS\data\constructibles.xml` L276-308 defines the standard rules, for example:

```xml
<Row ID="MountainCulture" YieldType="YIELD_CULTURE" YieldChange="1" TilesRequired="1" ProjectMaxYield="true" AdjacentTerrain="TERRAIN_MOUNTAIN"/>
<Row ID="ResourceScience" YieldType="YIELD_SCIENCE" YieldChange="1" TilesRequired="1" AdjacentResource="true"/>
<Row ID="WonderScience"   YieldType="YIELD_SCIENCE" YieldChange="1" TilesRequired="1" AdjacentDistrict="DISTRICT_WONDER"/>
<Row ID="QuarterCulture"  YieldType="YIELD_CULTURE" YieldChange="1" TilesRequired="1" AdjacentQuarter="true"/>
```

`GAME\Base\modules\age-antiquity\data\constructibles.xml` L605-630 links buildings to these rules, for example `BUILDING_LIBRARY → ResourceScience, WonderScience, HanUrbanScience (RequiresActivation)`.

### 3.3 Existing JS reimplementation: Detailed Map Tacks (WS\3507297712), VERIFIED

`ui\map-tack-core\dmt-adjacency-rules.js` (82 lines) contains the pure rule logic:

```js
// L58-65
export function adjacencyAmount(row, count) {
    const required = Number(row.TilesRequired ?? 1);
    const change = Number(row.YieldChange ?? 0);
    ...
    return Math.floor(count / required) * change;
}
```

- `countAdjacency(row, plot, options)` (L13-56):
  - **Exact-match fields:** Biome, Terrain, Feature, FeatureClass, District, SpecificResource, UniqueQuarterType.
  - **Flags:** Lake, NaturalWonder, River, NavigableRiver, Quarter, UniqueQuarter, Resource, SeaResource (resource + water), ResourceClass, OtherOwner, Breathtaking/Charming appeal.
  - **Constructible fields:** `AdjacentConstructible/Tag/Class` return the **number of matching constructibles** on the neighbour, so two eligible buildings count twice. Every other rule returns 1.
  - It throws on any `Adjacent*` field it does not know, which protects against schema drift.
- `wildcardMatches(row, type, options, plot)` (L67-82) applies the wildcard filters: class, tag, current age, HasYield, biome, terrain and navigable river.

`ui\map-tack-core\dmt-map-tack-yield.js` drives it:
- `getAdjacencyYields` (L93-114) collects rules in three steps:
  1. Take `Constructible_Adjacencies` for the type, but only if the type is current-age or AGELESS (L96-98).
  2. Merge in matching wildcards (L99-102).
  3. Skip `RequiresActivation` rules unless `MapTackModifier.isAdjacencyUnlocked` finds an active `EFFECT_CITY_ACTIVATE_CONSTRUCTIBLE_ADJACENCY` modifier (L106; `dmt-map-tack-modifier.js` L83-90).
  Then it sums over the 6 neighbours, plus the tile itself when `Self` is set (L109).
- `calculateAdjacencyYields` (L115-144) deduplicates neighbours on wrap-around maps and adds `EFFECT_CITY_ADJUST_ADJACENCY_FLAT_AMOUNT` modifiers (L141; modifier L91-104).
- `context()` (L45-60) builds the **hypothetical plot state**: it adds the new type to the tile's constructibles and drops improvements when placing a building. The district becomes `DISTRICT_WONDER` for wonders and `DISTRICT_URBAN` for buildings, unless the tile is the city centre.
- `getWarehouseYields` (L145-175) counts the city's purchased plots that match `Warehouse_YieldChanges`. It needs a real city and throws "Settlement is needed to calculate warehouse bonuses" otherwise.
- `MapTackUtils.getRealizedPlotDetails(x,y)` (`dmt-map-tack-utils.js` L271-385) merges real map state with **placed map tacks**. Tacks therefore count as virtual buildings for neighbours, which is exactly the "planning ahead" behaviour we want.

### 3.4 What our JS reimplementation needs (checklist)
1. **Load the rules:** `Constructible_Adjacencies`, `Constructible_WildcardAdjacencies`, `Adjacency_YieldChanges`, `ExcludedAdjacencies` (filtered by the local player's active traits), `Constructible_YieldChanges`, and warehouse tables if wanted.
2. **Neighbour state per plot:** terrain, biome, feature + FeatureClass, resource + ResourceClass, isLake, isRiver, isNavigableRiver, isWater, isNaturalWonder, appeal, owner, district type, constructibles on the tile (real + planned), and quarter / unique-quarter status.
3. **Age gating:**
   - Rules apply only to current-age or AGELESS buildings.
   - `Adjacency_YieldChanges.Age` restricts a rule to one age.
   - Obsolete buildings (previous age, not AGELESS) give no adjacency. `BS\ui\place-building\model-place-building-v2.js` `willBecomeQuarter` L595-611 shows the same age test.
4. **Activation:** use `city.Constructibles.isAdjacencyUnlocked(id)` when a city exists (engine, VERIFIED API). For a hypothetical city, evaluate the modifiers as DMT does, or pick any existing city of the player as a proxy (INFERRED: activation is mostly player-wide through civ/tech).
5. **Bidirectional gain:** when placing X at P, also re-evaluate each neighbour building that has rules matching X (wonder districts, `AdjacentConstructible/Tag`, quarter formation). The base game reports these as outgoing `ADJACENCY` details.
6. **Placement validity** (Section 3.2 placement tables). Without it we could recommend illegal tiles, such as a lighthouse inland or a building on a mountain.

---

## 4. Quarters, specialists and warehouses

### Quarter detection (VERIFIED)
- `BuildingPlacementManager.willBecomeQuarter(type)` (`building-placement-manager.js` L537-555) counts a building toward a quarter when all of these hold:
  - `ConstructibleClass == "BUILDING"`;
  - not `ExistingDistrictOnly` (this excludes walls);
  - `Age == current age` **or** it has the `AGELESS` tag.
- `getWillBecomeQuarterPlots()` (L556-611) scans `city.Constructibles.getIds()` and `city.BuildQueue.getQueue()`. It returns tiles holding one such building, i.e. tiles that would *become* a quarter when a second one is added.
- `model-place-building-v2.js` repeats the logic. L192 defines `isFulltileConstructible` (improvement, wonder, or `FULL_TILE` tag), and L316/348/380 decide `DISTRICT_TO_QUARTER` conversion with `willBecomeQuarter` (L595-611).
- Unique quarters: `GameInfo.UniqueQuarters` holds BuildingType1 + BuildingType2 on the same tile. `findExistingUniqueBuilding` is at L612-658, and `player.Constructibles.getUnlockedUniqueQuarters()` at L123.
- DMT's version (`dmt-map-tack-utils.js` L546-570) treats a tile as a quarter when it has 2 or more non-obsolete, slotted buildings, or one `FULL_TILE` building. It returns a unique-quarter type when both UQ buildings are present.
- No engine "isQuarter(plot)" call appears in the UI. (VERIFIED by grep; INFERRED that none exists.)

### Specialists (VERIFIED)
- The preview includes `YieldSourceTypes.WORKERS` details (manager L336-355, L839).
- Worker slot info comes from `city.Workers.GetAllPlacementInfo()` / `GetTilePlacementInfo` (`plot-workers-manager.js` L112).
- In Civ VII, specialists add their own yields and amplify the tile's adjacency yields. (INFERRED from game knowledge; not implemented in data tables. Probably via GlobalParameters/modifiers.)

### Warehouse buildings (VERIFIED)
- `Constructible_WarehouseYields` gives city-wide +N per matching improvement or tile. Examples: Granary → farms, pastures, plantations, floodplains; Brickyard → mines, quarries, clay pits; Fishing Quay → coast and boats (`age-antiquity\data\constructibles.xml` L701-727).
- The production chooser decides "warehouse" by the `WAREHOUSE` tag (`production-chooser-helpers.js` L256).
- Placement is location-independent, apart from the overbuild effect. The engine preview reports it as `YieldSourceTypes.WAREHOUSE` (manager L356-384).
- **For our optimiser, warehouse buildings have no best tile.** They should go wherever they do not waste an adjacency slot. (INFERRED)

### Does the placement preview account for these? (VERIFIED)
Yes. `calculateAllBuildingsPlacements` changeDetails cover BASE, ADJACENCY (in and out, including other cities), WAREHOUSE, NATURAL, CONSTRUCTIBLES, WORKERS and CITY_MODIFIERS (manager L828-868), plus overbuild via `overbuiltConstructibleID`. The UI layers quarter / unique-quarter warnings on top through `BuildingPlacementManager` plot lists.

---

## 5. Listing the buildings the player can build (VERIFIED)

`BS\ui\production-chooser\production-chooser-helpers.js`:
- **Per city:** `Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible)` (L512) returns `[{index, result}]`. Filter with `GameInfo.Constructibles.lookup(index)` and keep `ConstructibleClass ∈ {BUILDING, WONDER}`.
  - Buildable now: `result.Success` (or `InsufficientFunds`).
  - Locked: `result.NeededUnlock != -1` or `result.Requirements?.NeededProgressionTreeNode`.
  - Obsolete: `Requirements.Obsolete`.
- `GetProductionItems(city, recommendations, goldBalance, isPurchase, viewHidden, uniqueQuarterInfos)` (L497-616) builds the full chooser item list: `{type, name, cost, turns, category: buildings|wonders|units|projects, error, disabled, tags, ...}`. It depends on the chooser's recommendation and unique-quarter data, so calling `canStartQuery` directly is simpler.
- `GetUniqueQuartersForPlayer(playerId)` (L438-482) returns the unique-quarter buildings.
- `GetCurrentBestTotalYieldForConstructible(city, type)` (L100-135) gives the best placement total. Note that it calls `BuildingPlacementManager.initializePlacementData`, which has singleton side effects.
- **Player-level / hypothetical city:** no single player-wide "unlocked buildings" call appears in the UI. Options are:
  - take the union of `canStartQuery` over all of the player's cities (INFERRED good enough);
  - or check `Constructibles.Age == current age` plus progression-tree unlocks via `player.Culture.isNodeUnlocked(...)` / Techs.
  
  Tags come from `BS\ui\utilities\utilities-tags.js` (`ConstructibleHasTagType`; includes `WAREHOUSE`, `AGELESS`, `FULL_TILE`).

---

## Implications for our mod

**Recommendation: a hybrid, with the JS rule engine as the backbone.**

1. **JS rule engine (required).** Requirement (b) asks for tiles where buildings do not exist yet, possibly tiles the city does not own, and possibly a city that does not exist. Only a JS reimplementation can cover that. Port or adapt DMT's `dmt-adjacency-rules.js` and the relevant parts of `dmt-map-tack-yield.js`, with credit and licence checked. Its field coverage matches the schema, and it already models the hypothetical tile state (district switch, quarter formation). Because DMT's `getRealizedPlotDetails` already folds map tacks into neighbour state, our planner can place tacks **iteratively**: place the best building, then re-score neighbours. That captures synergies such as quarters and wonder adjacency.
2. **Engine cross-check (optional, exact).** For plots inside an existing city's current candidate set, call `city.Yields.calculateAllBuildingsPlacements()` **directly** (not through the `BuildingPlacementManager` singleton), once per city, cached per turn. Use it to (a) show exact numbers including modifiers, specialists and outgoing adjacency, and (b) validate the JS engine in debug builds.
3. **Valid-placement filter.** Use `Game.CityOperations.canStart(cityID, BUILD, {ConstructibleType})` → `Plots ∪ ExpandUrbanPlots` where a city exists. Otherwise use a JS check against the placement tables (`Constructible_ValidDistricts/Terrains/Biomes/Features`, `Constructibles.Adjacent*`/`NoRiver`/`RiverPlacement`, `Wonders.*`).
4. **Building list for the popup.** Take the union of `canStartQuery(..., CityQueryType.Constructible)` over the player's cities, filtered to BUILDING/WONDER, current age or AGELESS, and `Success || InsufficientFunds`. Optionally offer "include locked" (`NeededUnlock != -1`). Skip `WAREHOUSE`-tagged buildings, which have no location preference, and `ExistingDistrictOnly` buildings in the adjacency optimiser.
5. **Do not reuse Drongo's lens logic.** Only its overlay pattern (`WorldUI.createOverlayGroup` → `addPlotOverlay().addPlots(plots, {fillColor})`) is worth copying.

## Open questions
1. Does `calculateAllBuildingsPlacements()` include constructibles the city cannot currently build (locked or queued)? What is its runtime cost on large cities? Test in-game with `console.log`.
2. Do `ExpandUrbanPlots` include tiles outside `city.getPurchasedPlots()`, so that building there claims new land? What is the exact radius?
3. What does `ProjectMaxYield` mean exactly? It is used on 122 rules and is ignored by DMT.
4. How do specialists multiply adjacency (GlobalParameters / modifiers)? Should our score weight adjacency by expected specialist count?
5. Are there engine-exposed helpers such as `GameplayMap.getAppeal` or `isQuarter`? We need appeal for the Breathtaking/Charming rules; check how DMT fills `plot.appeal` in `dmt-map-tack-utils.js`.
6. Activation for a hypothetical city: does `city.Constructibles.isAdjacencyUnlocked(id)` give the same answer for every city of a player? If so, any existing city can serve as a proxy.
7. DMT licence and API stability: can we import DMT modules at runtime (dependency) instead of copying? See `01-detailed-map-tacks.md`.
