# 01 — Detailed Map Tacks (DMT) deep-dive

Mod: **Detailed Map Tacks** by *wltk*, Steam Workshop id `3507297712`, mod id `detailed-map-tacks`.
Root: `D:\SteamLibrary\steamapps\workshop\content\1295660\3507297712` (below, paths are relative to it unless absolute).
All code was read in place and nothing was modified. About 5,000 lines of JS in 33 files were reviewed.

Legend: **[V]** = VERIFIED (seen in code), **[I]** = INFERRED (reasoned, not proven in code / not runtime-tested).

---

## TL;DR

* DMT has **no formal public API** and no `window.*` globals. It is built from ES-module **singletons** plus an **engine event bus**. Two engine events act as a de-facto public write API: `engine.trigger("AddMapTackRequest", mapTackData)` and `engine.trigger("RemoveMapTackRequest", {x, y, type})` [V].
* Tacks persist **inside the save file** via `GameTutorial.setProperty(Database.makeHash(...), jsonString)`. This uses a private copy of the base game's `Catalog` serializer with scope `"DMT"`. They are stored **per save, game-global (not per player)** [V].
* A tack is `{x, y, type, classType, validStatus, yieldDetails}`. `type` is any `GameInfo.Constructibles` type (building / wonder / improvement) **or** one of 11 hard-coded "generic" types. A planned settlement is `BUILDING_CITY_HALL` [V]. There is no free-text label, colour or custom-icon field. **Extra fields you add are stripped** on the next refresh [V].
* DMT ships a full **validator** (terrain, biome, feature, resource, river, coast, lake, adjacency requirements, full-tile/2-per-tile slot rules, unique quarters, owner) and a full **yield + adjacency + modifier preview engine**. Its placement mode already does "show the best tile in radius N" for a chosen building. All of this is importable and reusable.
* The base game has **no native map-tack / map-pin system**. DMT builds everything itself [V].

---

## 1. File layout, `.modinfo`, overrides

### 1.1 Layout [V]
```
detailed-map-tacks.modinfo
config/Input.xml                 InputActions open-map-tack-panel (F2), toggle-map-tack-layer (X)
data/interface-modes.xml         InterfaceModes DMT_INTERFACEMODE_MAP_TACK_CHOOSER / _PLACE_MAP_TACKS -> view "MapTackPlacement"
text/en_us/*.xml, l10n/*.xml     localisation (13 locales)
texture/dmt-*.png                generic-tack icons
ui/input/dmt-hotkey-manager.js                monkey-patches HotkeyManager.handleInput, gamepad L3 tap
ui/interface-modes/dmt-interface-mode-map-tack-chooser.js   chooser mode
ui/interface-modes/dmt-interface-mode-place-map-tacks.js    placement mode (extends ChoosePlotInterfaceMode)
ui/views/dmt-view-map-tack-placement.js       custom View "MapTackPlacement"
ui/map-tack-chooser/*                         <dmt-map-tack-chooser> panel (list of tack types)
ui/place-map-tack/*                           <dmt-panel-place-map-tack> (hover details panel)
ui/plot-icons/*                               world-anchored tack icons + city-radius overlays
ui/lenses/layer/dmt-map-tack-layer.js         lens layer "dmt-map-tack-layer"
ui/lenses/lens/dmt-map-tack-lens.js           lens "dmt-map-tack-lens"
ui/mini-map/*                                 minimap button + lens-panel checkbox (decorators)
ui/options/editors/dmt-editor-keyboard-mapping-decorator.js
ui/map-tack-core/
   dmt-map-tack-store.js            persistence + in-memory cache (singleton)
   dmt-map-tack-change-processor.js event bus handlers, re-validation, re-yield (singleton)
   dmt-map-tack-validator.js        placement rules (singleton)
   dmt-map-tack-yield.js            yield/adjacency preview (singleton)
   dmt-adjacency-rules.js           PURE adjacency functions (no engine deps)
   dmt-map-tack-modifier.js         modifier/requirement evaluator (singleton)
   dmt-map-tack-utils.js            plot details, class/tag helpers (singleton)
   dmt-map-tack-generics.js         11 hard-coded generic tack types
   dmt-map-tack-ui-utils.js         icon/name/yield-string helpers
   dmt-map-tack-constants.js        enums (ConstructibleClassType, QuarterType, YieldTypes, DirectionNames)
   dmt-utility-serialize.js         copy of base quest-tracker Catalog/SerialObject
   modifier/dmt-{belief,constructible,tradition,trait,tree}-modifier.js, dmt-modifier-requirement.js
```

### 1.2 `.modinfo` (detailed-map-tacks.modinfo) [V]
* `<Mod id="detailed-map-tacks" version="1">`, `AffectsSavedGames=0`, `Dependencies: base-standard` only. There is no `LoadOrder` element.
* ActionGroup `shell-detailed-map-tacks` (scope shell, criteria `always`): UIScripts = keyboard-mapping decorator. UpdateDatabase = `config/Input.xml`. UpdateText = input text.
* ActionGroup `game-detailed-map-tacks` (scope game, criteria `always`):
  * `ImportFiles`: 9 textures, plus the CSS/HTML of the chooser, minimap, place panel and plot-icons.
  * `UIScripts`: 31 JS files (every file except `dmt-adjacency-rules.js` and `modifier/dmt-constructible-modifier.js`, which are only reached through `import`, see below).
  * `UpdateDatabase`: `data/interface-modes.xml`. `UpdateText`: all locales.
* **Overrides/replacements:** none. DMT replaces **no** base-game file. It only *adds* files and *decorates* base components (§7) [V].
* Note [I]: `dmt-adjacency-rules.js` and `dmt-constructible-modifier.js` are not listed in modinfo but are `import`ed. So a mod's whole folder is reachable via `fs://game/<mod-id>/...` / `/<mod-id>/...`. Our own helper modules therefore need not all be in UIScripts.

### 1.3 Module path for imports
DMT references its own files as `fs://game/detailed-map-tacks/...` (e.g. `ui/plot-icons/dmt-map-tack-icons.js:195`) [V]. Base files are imported as `/core/...` and `/base-standard/...` [V]. So other mods import DMT as **`/detailed-map-tacks/ui/map-tack-core/<file>.js`** [I, same convention, used by e.g. bz-map-trix for other mods].

---

## 2. Tack data model and supported types

### 2.1 Fields (`ui/map-tack-core/dmt-map-tack-store.js:5-19`) [V]
```js
 * x: x coordinate of the plot.
 * y: y coordinate of the plot.
 * type: type of the MapTack constructible, e.g. "BUILDING_MONUMENT".
 * classType: class type of constructible, e.g. "WONDER", "BUILDING", "IMPROVEMENT".
 * validStatus: contains the validation check result of the map tack. Non-null, empty object {} okay.
 * yieldDetails: contains the yield details of the map tack. Non-null, empty object {} okay.
```
* `validStatus` = `{ isValid: bool, preventPlacement: bool, reasons: string[] }` (`dmt-map-tack-validator.js:49-53, 280`) [V].
* `yieldDetails` = `{ base: Y[], bonus: Y[], adjacencies: Y[], issues: string[], isComplete: bool }`, where `Y = {type:"YIELD_X", amount:number, text?:string}` (`dmt-map-tack-yield.js:61-79`) [V].
* A plot holds **at most 2 tacks** (`MAX_COUNT_PER_PLOT = 2`, validator:8). A full-tile type (wonder, `FULL_TILE` tag, generic UQ) must be alone [V].
* Identity of a tack = `(x, y, type)`. `getIndexOfMapTack` matches only on `type` inside the plot list (store:127-140) [V].
* **No label, colour, owner, note or source field.** The change processor rebuilds every tack as exactly `{x,y,type,classType,validStatus,yieldDetails}` (`dmt-map-tack-change-processor.js:150-157`). Any custom property is lost on the next refresh, which happens on any adjacent change or turn start [V].

### 2.2 Supported tack types [V]
1. **Any `GameInfo.Constructibles` row**: building, wonder or improvement. The chooser lists current-age constructibles. It skips other-age items, `ExistingDistrictOnly` (walls), `Discovery`, `Archaeology`, `CivilopediaPageExcludes`, other civs' uniques, city-center buildings and "common" auto-improvements (`ui/map-tack-chooser/dmt-map-tack-chooser.js:269-387`). The *store* itself accepts any string.
2. **Generic (hard-coded) types** (`dmt-map-tack-generics.js:61-159`):

| type | class | meaning |
|---|---|---|
| `DMT_BUILDING_FOOD/PRODUCTION/GOLD/SCIENCE/CULTURE/HAPPINESS/DIPLOMACY` | BUILDING | "some building of yield X". Adjacency ids such as `CoastFood, RiverFood, WonderFood` |
| `BUILDING_CITY_HALL` | BUILDING | **City Center / planned settlement** (reuses the real type to get its yields) |
| `DMT_BUILDING_UNIQUE_QUARTER` | BUILDING (FULL_TILE) | player's unique quarter |
| `DMT_BUILDING` / `DMT_WONDER` / `DMT_IMPROVEMENT` | class-wide | "any building / wonder / improvement" |

* City-center detection: `isCityCenter(type) = GameInfo.Buildings.lookup(type)?.CityCenterPriority > 0` (`dmt-map-tack-utils.js:150-152`). In base data both `BUILDING_PALACE` (100) and `BUILDING_CITY_HALL` (1) qualify (`Base/modules/base-standard/data/constructibles.xml:132-133`) [V]. **For settlement candidates use `BUILDING_CITY_HALL`.**
* Generic tacks are fulfilled and auto-cleared when a matching real constructible is built on the tile (`change-processor.js:63-93`) [V].

---

## 3. Storage

### 3.1 Mechanism [V]
`dmt-utility-serialize.js` is a verbatim copy of the older base `quest-tracker` serializer (header comment line 1). It stores into **`GameTutorial` properties**, keyed by `Database.makeHash(string)`:
```js
// dmt-utility-serialize.js:15, 23-25, 70-87
this.hashPreamble = "_" + scope + "_" + id + "_";
makeHash(key) { return Database.makeHash(this.hashPreamble + key); }
read(key)  { return GameTutorial.getProperty(this.makeHash(key)); }
write(key, value) {
    GameTutorial.setProperty(this.makeHash(key), value);
    if (!this.childrenIDs.has(key)) { this.childrenIDs.add(key); this.writeIDs(); }
}
```
`new Catalog("DMT")` (store:41) and `catalog.getObject(id)` returns `new SerialObject(id, "DMT_OBJ")` (serialize:104-110).

### 3.2 Key layout [V]
| hashed string | value |
|---|---|
| `_DMT__KEYS` | `"MAP_TACK,MAP_TACK_SETTING"` (catalog object ids) |
| `_DMT_OBJ_MAP_TACK_KEYS` | comma list of plot keys, `"12-34,13-34,..."` |
| `_DMT_OBJ_MAP_TACK_<x>-<y>` | **JSON string** of the tack array for that plot, e.g. `[{"x":12,"y":34,"type":"BUILDING_LIBRARY","classType":"BUILDING","validStatus":{...},"yieldDetails":{...}}]` |
| `_DMT_OBJ_MAP_TACK_SETTING_KEYS` / `_DMT_OBJ_MAP_TACK_SETTING_PreviewRadius` | settings (placement preview radius 0..5) |

* Plot key = `` `${x}-${y}` `` (store:162-164) [V].
* Delete = `write(key, null)` plus `childrenIDs.delete(key)` on a *fresh* SerialObject without `writeIDs()` (store:81-82, 99-100). The key therefore stays in the persisted KEYS list with a null value. It is harmless because `JSON.parse(null)` returns null, which is skipped (store:145-146) [V].

### 3.3 Scope [V/I]
* **Per save**: GameTutorial properties are saved with the game. The base tutorial, quest tracker and advice manager use the same storage (`Base/modules/core/ui/utilities/utility-serialize.js:11-19`) [V for the API; I that it round-trips through saves, though the mod's purpose implies it].
* **Not per player**: DMT uses `GameTutorial.*`, not `player.Tutorial.*`. The newer base serializer supports `player.Tutorial` for per-player catalogs (core utility-serialize.js:11-19), but DMT does not use it [V]. In hot-seat or multiplayer, all local players share one tack set. Whether GameTutorial props sync across MP clients is unknown [I].
* **Not persisted across ages?** Unknown. Age transition creates a new game state; tacks are likely lost [I].
* Load: `Loading.runWhenLoaded(onGameLoaded)` → `populateCacheFromStore()` → `engine.trigger("MapTackLoadedFromStore")` (store:46-52, 141-152) [V].

---

## 4. Programmatic API

### 4.1 Engine events (loosest coupling, recommended for writes) [V]
Registered in `dmt-map-tack-change-processor.js:21-34`:

| event | direction | payload | effect |
|---|---|---|---|
| `AddMapTackRequest` | **in** | full `mapTackData` | `MapTackStore.addMapTack(data)`, then re-validates/re-yields the plot and its neighbours, then fires `MapTackUIUpdated` (+ `CityCenterMapTackUpdated`) |
| `RemoveMapTackRequest` | **in** | `{x, y, type}` (min) | `MapTackStore.removeMapTack`, then refresh |
| `MapTackLoadedFromStore` | out | — | cache ready after load |
| `MapTackUIUpdated` | out | `[{x, y, mapTackList}]` | drives icon rendering |
| `CityCenterMapTackUpdated` | out | — | redraws settlement radius overlays |

```js
// dmt-map-tack-change-processor.js:35-48
onAddMapTackRequest(mapTackData) {
    MapTackStore.addMapTack(mapTackData);
    this.onPlotDetailsUpdated(mapTackData.x, mapTackData.y);
    if (MapTackUtils.isCityCenter(mapTackData.type)) engine.trigger("CityCenterMapTackUpdated");
}
onRemoveMapTackRequest(mapTackData) {
    MapTackStore.removeMapTack(mapTackData);
    this.onPlotDetailsUpdated(mapTackData.x, mapTackData.y);
    ...
}
```
**Pitfalls [V]:**
* `AddMapTackRequest` **does no validation**: no duplicate check, no 2-per-tile limit, no terrain check. The UI validates *before* triggering (`dmt-interface-mode-place-map-tacks.js:141-146, 284-291`). Callers must validate themselves.
* `validStatus` **must be an object**. `updateMapTacks` reads `mapTack.validStatus.isValid` (`change-processor.js:161`), so a missing `validStatus` throws inside the handler after the store has already been written. Pass `{}` at least (the doc comment says "Non-null, empty object {} okay").
* Extra fields are stripped (§2.1).
* `engine.trigger` to JS listeners is synchronous [I]. The store is updated by the time `trigger` returns.

How the UI creates a tack (the canonical payload), `dmt-interface-mode-place-map-tacks.js:292-302` [V]:
```js
commitPlot(plot) {
    const mapTackData = {
        x: plot.x, y: plot.y,
        type: this.itemType,
        classType: MapTackUtils.getConstructibleClassType(this.itemType),
        validStatus: this.validStatus,      // from MapTackValidator.isValid(x, y, type)
        yieldDetails: this.yieldDetails     // from MapTackYield.getYieldDetails(x, y, type)
    };
    engine.trigger("AddMapTackRequest", mapTackData);
}
```

### 4.2 Singletons (import for reads and computations) [V]
All are `export default` singleton instances.

| import path (prefix `/detailed-map-tacks/ui/map-tack-core/`) | key methods |
|---|---|
| `dmt-map-tack-store.js` → `MapTackStore` | `retrieveMapTacks(x, y, fromStore=false): Tack[]` (110) · `getCachedMapTackStructs(plotKeys?)` → `[{x,y,mapTackList}]` (153) · `addMapTack(data)` (54) · `removeMapTack({x,y,type})` (66) · `updateMapTacks(x, y, list)` (87) · `getIndexOfMapTack(data)` (127) · `getSetting/updateSetting(key[,v])` (165-172) |
| `dmt-map-tack-validator.js` → `MapTackValidator` | `isValid(x, y, type, newMapTacks=[type])` → `{isValid, preventPlacement, reasons}` (54) · property `validOwner` (21-26) |
| `dmt-map-tack-yield.js` → `MapTackYield` | `getYieldDetails(x, y, type)` (61) · `getAdjacencyYields(x,y,type,ctx?)` (93) · `getBonusYields(...)` (84) |
| `dmt-map-tack-utils.js` → `MapTackUtils` | `getRealizedPlotDetails(x,y)` (271) · `getConstructibleClassType(type)` (436) · `isCityCenter(type)` (150) · `getCityCenterMapTackPlots()` (244) · `getMapTackTypePlots(type)` (237) · `togglePlotDetailsCache(bool)` (249) · `getFreeImprovementAtPlot(x,y)` (637) · `getQuarterType(list)` (546) |
| `dmt-map-tack-ui-utils.js` → `MapTackUIUtils` | `getTotalYields(yieldDetails)` → `[{type, amount}]` (214) · `getMapTackName/IconBgImage` |
| `dmt-map-tack-generics.js` → `MapTackGenerics` | `isGenericMapTack(type)`, `getGenericMapTacks()` |
| `dmt-adjacency-rules.js` (named exports) | `countAdjacency(row, plot, opts)`, `adjacencyAmount(row, count)`, `wildcardMatches(row, type, opts, plot)`, `enabled(v)` |
| `dmt-map-tack-change-processor.js` → `MapTackChangeProcessor` | `onAddMapTackRequest/onRemoveMapTackRequest` (also callable directly) |

ES modules are cached by URL, so importing the same path gives the **same singleton instance** DMT uses [I, standard ES semantics, and DMT's own files rely on it].

### 4.3 Writing directly to the store: don't
`MapTackStore.addMapTack` skips the refresh and icon update. Writing `GameTutorial` directly also bypasses `cacheMap` (filled only at load). Always use the events [V by reading the flow].

### 4.4 Interface modes (UI entry points) [V]
* `InterfaceMode.switchTo("DMT_INTERFACEMODE_MAP_TACK_CHOOSER")` opens the chooser.
* `InterfaceMode.switchTo("DMT_INTERFACEMODE_PLACE_MAP_TACKS", { type: "BUILDING_LIBRARY" })` starts interactive placement for a type (`dmt-map-tack-chooser.js:484-486`).
* Hotkey events: `window` event `hotkey-open-map-tack-panel`. Layer hotkey: `layer-hotkey` with `detail.name == "toggle-map-tack-layer"`.

---

## 5. Rendering and yield/adjacency computation

### 5.1 Icons [V]
* `MapTackIconsManager` listens to `MapTackUIUpdated` and dispatches a DOM `CustomEvent("map-tack-icons-root-update")` to the base **`plot-icons-root`** component. DMT reaches that root through a `Controls.decorate('plot-icons-root', …)` decorator (`ui/plot-icons/dmt-plot-icons-root-decorator.js:59`).
* Per plot it appends `<dmt-map-tack-icons x y map-tack-list='JSON'>`. Each element registers a `WorldAnchors.RegisterFixedWorldAnchor(location, {z:20})` and binds `FixedWorldAnchors.offsetTransforms[...]` (`ui/plot-icons/dmt-map-tack-icons.js:45-56`). The element shows the icon, a red "invalid" badge with reasons tooltip, and a total-yield string with a detail tooltip (74-116).
* Left-click a tack while in chooser mode removes it. Right-click a tack removes it anytime (163-182).
* Visibility: lens layer `dmt-map-tack-layer` toggles the `body.dmt-layer-hidden` class (`ui/lenses/layer/dmt-map-tack-layer.js:12-22`). The CSS `.dmt-layer-hidden dmt-map-tack-icons {display:none}` does the hiding. The layer is added to `fxs-default-lens.allowedLayers` (65-66) and auto-enabled in the settler lens (39-46).
* Highlights: in `fxs-building-placement-lens`, plots tacked with the constructible being placed get VFX `VFX_3dUI_Tut_SelectThis_01`. In the settler lens, city-center tacks get the same (31-56).

### 5.2 Settlement radius overlays (`ui/plot-icons/dmt-map-tack-city-radius-manager.js`) [V]
For every city-center tack: `GameplayMap.getPlotIndicesInRadius(x, y, 3)`, plus a border overlay `CultureBorder_CityState_Open` in player colours. Plots are tinted as **available** (primary colour 20%), **overlap** (counted >1, secondary colour 40%) or **occupied** (owned by a living player, black 40%) (56-93). The overlays are visible only in DMT modes. This is exactly the overlap visual our settlement planner wants.

### 5.3 Placement-mode "best plot" preview (`dmt-interface-mode-place-map-tacks.js:181-240`) [V]
While hovering with a type selected, DMT evaluates **every plot within `previewRadius` (0-5, Ctrl+wheel)**. For each it runs `isValid` and `getYieldDetails`, then `getTotalYields`, and sums the amounts. It draws yield pills via `WorldUI.createSpriteGrid`. It colours plots green (max total), yellow (valid) or red (invalid hovered). **This is a ready-made "best tile for building X near here" scorer** (a plain sum of yields with no weighting).

### 5.4 How yields are computed (`dmt-map-tack-yield.js`) [V]
`getYieldDetails(x, y, type)`:
1. **base** = `Constructible_YieldChanges` for the type (utils:69-82).
2. **context**: `getRealizedPlotDetails(x,y)` merges real map state with *valid* tacks on that plot. It returns biome, terrain, feature, resource, appeal, owner, constructibles (existing + tacked), district (realised from tacks: CITY_CENTER / WONDER / URBAN / RURAL / WILDERNESS), isLake, isRiver, isNavigableRiver, isWater, routeType and quarterType (utils:271-387). The candidate type is then added and the district promoted (yield:45-60).
3. **adjacencies**: links come from `Constructible_Adjacencies` (only if the type is current-age, ageless or generic) plus `Constructible_WildcardAdjacencies` filtered by `wildcardMatches`. `RequiresActivation` links are kept only if `MapTackModifier.isAdjacencyUnlocked` (an `EFFECT_CITY_ACTIVATE_CONSTRUCTIBLE_ADJACENCY` modifier is active). For each `Adjacency_YieldChanges` row it counts the 6 neighbours (plus self if `Self`) via `countAdjacency` → `adjacencyAmount = floor(count / TilesRequired) * YieldChange`, plus `EFFECT_CITY_ADJUST_ADJACENCY_FLAT_AMOUNT` (yield:93-144).
4. **bonus**: modifiers with effects `EFFECT_PLOT_ADJUST_YIELD`, `EFFECT_{CITY,PLAYER}_ADJUST_CONSTRUCTIBLE_YIELD[_BY_ATTRIBUTE]` that match the constructible and are active through trait, tradition, civic/tech tree, belief or constructible. Requirements are evaluated by `dmt-modifier-requirement.js` (modifier:115-160). It also adds warehouse yields over the owning city's purchased plots (yield:145-203).
5. Unsupported cases are reported in `issues[]` and `isComplete=false` instead of silently mis-computing (modifier `note()`).

Neighbour matching, `countAdjacency` (`dmt-adjacency-rules.js:13-56`), excerpt:
```js
const exact = { AdjacentBiome:'biome', AdjacentTerrain:'terrain', AdjacentFeature:'feature',
    AdjacentFeatureClass:'featureClass', AdjacentDistrict:'district',
    AdjacentSpecificResource:'resource', AdjacentUniqueQuarterType:'uniqueQuarter' };
for (const [field, property] of Object.entries(exact)) {
    if (row[field] && row[field] !== plot[property]) return 0;
}
...
if (row.AdjacentConstructible || row.AdjacentConstructibleTag || row.AdjacentConstructibleClass) {
    return [...new Set(plot.constructibles || [])].filter(...).length; // counts buildings, 2 per district
}
return 1;
```
It throws on any `Adjacent*` column it does not support (whitelist at lines 1-6). The file is **pure** (no engine calls), so it is the safest piece to reuse or copy.

Because tacked buildings count as real constructibles in `getRealizedPlotDetails`, **tacks influence each other's adjacency** (e.g. a tacked wonder boosts a neighbouring tacked library). The change processor cascades re-computation to neighbours (change-processor:146-179) [V].

Caching: wrap batch computations in `MapTackUtils.togglePlotDetailsCache(true) … (false)`. The cache is reset on each toggle and does **not** see tacks added mid-batch [V utils:249-252].

---

## 6. Validation (`dmt-map-tack-validator.js`) [V]
`isValid(x, y, type, newMapTacks=[type])`. Passing `newMapTacks=[]` makes it a "re-check of an existing tack" (skips the additive checks).

* **Additive only** (78-117): ≤2 tacks per plot (`preventPlacement`), full-tile exclusivity (`preventPlacement`), duplicate type on the plot (`preventPlacement`), plot owned by someone other than `validOwner` (invalid, not prevented).
* Slot count against existing non-obsolete, non-slotless constructibles (122-141).
* Data-driven tables: `Constructible_ValidBiomes`, `Constructible_ValidTerrains`, `Constructible_RequiredFeatureClasses`, `Constructible_ValidFeatures`, `Constructible_ValidResources`, `Constructible_InvalidAdjacentBiomes` (282-377).
* `Constructibles` columns: `AdjacentRiver`, `AdjacentLake`, `AdjacentDistrict`, `AdjacentTerrain`, `NoFeature`, `NoRiver`, `RiverPlacement` (OFF_COAST / ANCHORED / RIVER) (181-222, 378-391).
* Improvements: non-city-buildable ones must be the plot's free improvement (`District_FreeConstructibles` by priority + trait). City-buildable ones need RURAL/WILDERNESS; `SameAdjacentValid`, `BuildOnFrontier`, `BuildInLine`, `MustBeAppealing` (392-449).
* Buildings: no extra checks (`canPlaceBuilding` returns `[true]`, TODO) (450-454).
* Wonders (`GameInfo.Wonders`): not on URBAN, `AdjacentCapital` (needs adjacent BUILDING_PALACE), `AdjacentConstructible`, `AdjacentToLand`, `AdjacentToMountain`, `BuildOnFrontier`, `MustBeLake`, `MustNotBeLake` (455-499).
* Final terrain gate: coast/navigable river only if water placement was enabled; no mountain unless allowed; never ocean (261-277).
* Natural wonder tiles reject buildings and wonders. Resources reject buildings and wonders (326-377).
* **Not checked** (TODOs): `RequiresAppealPlacement`, `RequiresDistantLands`, `RequiresHomeland`, `InvalidFeatures`, `AdjacentResource`, required specific feature, rail station / launch pad nuances, tech/civic unlock state, and whether the wonder was already built elsewhere.
* **City-center (`BUILDING_CITY_HALL`)**: only the generic terrain/feature/resource rules apply. There are **no** settlement-distance rules (min distance between cities, no tile owned by others except via `validOwner`). Our settlement planner must enforce spacing itself.
* Hidden plots: `getRealizedPlotDetails` omits terrain etc. when the plot is HIDDEN for the local player, so most checks silently pass [V utils:288-369].

---

## 7. Interactions with other mods and fragile spots [V unless noted]
* `HotkeyManager.handleInput` is **monkey-patched** by wrapping the instance method (`ui/input/dmt-hotkey-manager.js:51-75`). bz-map-trix (`3507072814/ui/input/bz-hotkey-manager.js:31`) and bz-friends (`3625755403/.../bz-hotkey-manager.js:7`) wrap it too. The wraps chain fine as long as each calls the previous one.
* A capture-phase `window 'engine-input'` listener eats quick gamepad L3 taps (hotkey-manager:10-49).
* `Controls.decorate` on base components: `plot-icons-root`, `plot-icon-suggested-settlement`, `lens-panel`, `panel-mini-map`, `editor-keyboard-mapping`. bz-map-trix also decorates `plot-icons-root` (`bz-wonder-layer.js:77`).
* Mutates `LensManager.lenses.get("fxs-default-lens").allowedLayers` and sets user option `Gameplay/dmtShowMapTacks` (dmt-map-tack-layer.js:65-70). Imports `default-lens.js`/`settler-lens.js` first "to guarantee import order for patching".
* **Mutates a GameInfo row in memory**: `itemDef.AdjacentToLand = false` for `WONDER_BATTERSEA_POWER_STATION` (validator:458-460). This is visible to any other UI code that reads that row afterwards.
* Placement mode blocks camera zoom by toggling `ViewManager.isWorldInputAllowed` every frame while Ctrl is held (place-map-tacks:109-116).
* Placement for city-center tacks enables `fxs-appeal-layer`, `fxs-settlement-recommendations-layer` and `fxs-random-events-layer`, and pops `panel-settler-legend` (place-map-tacks:79-88).
* `MapTackCityRadiusManager` reads the player colour at **module load** (`dmt-map-tack-city-radius-manager.js:5-6`). This is fine in game scope.
* Singletons compute player-dependent data (traits, uniques) **once at `engine.whenReady`** for `GameContext.localPlayerID` (trait-modifier:22-52). In hot-seat they would be stale for the next human player [I].
* `TraitModifier.cacheData` assumes `Players.get(localPlayerID)` exists. It would throw if loaded in shell scope, but it is only in the game scope [V].
* Workshop mods that know DMT: **bz-map-trix** lists `<References><Mod id="detailed-map-tacks"/>` (`3507072814/bz-map-trix.modinfo:15-18`), which is a load-order hint without a dependency. No other installed mod calls DMT's events. Drongo's City Planner (`3734169112`) has no DMT references [V by grep].

---

## 8. Base game: native tacks/pins?
A search of `Base/modules/**` and `DLC/**` for `maptack|map-tack|map tack|mappin|map-pin|MapMarker|waypoint` found **nothing** relevant (only `sourceMappingURL` false positives) [V]. Civ VII ships **no native map-tack system**. DMT borrows from the base game:
* the `Catalog`/`SerialObject` + `GameTutorial` persistence (copied from `base-standard/ui/quest-tracker/quest-tracker.js`; the newer core version is `core/ui/utilities/utility-serialize.js`, which also supports `player.Tutorial`);
* `ChoosePlotInterfaceMode` (`/base-standard/ui/interface-modes/interface-mode-choose-plot.js`);
* the `plot-icons-root` component, `WorldAnchors`, `WorldUI.createOverlayGroup/createSpriteGrid/createModelGroup`, and `LensManager`.

---

## Implications for our mod

### Recommended integration: soft dependency, events for writes, dynamic import for reads/validation

1. **modinfo**: do **not** hard-depend on DMT. Add `<References><Mod id="detailed-map-tacks" .../></References>` (as bz-map-trix does) so it loads before us when present. Our core features (scoring, ranked list) should work without DMT. Tack placement is optional.
2. **Detect and load DMT lazily** with dynamic `import()`. The base game uses dynamic import in `root-game.js:11-49` [V], so the engine supports it. A failed import means DMT is absent.
3. **Write** through `engine.trigger("AddMapTackRequest" | "RemoveMapTackRequest")`. **Validate first** with DMT's own validator so we never exceed 2 per tile, duplicate, or break its invariants.
4. **Remember our own tacks** (`x, y, type` triples) in our own Catalog (e.g. `GameTutorial` scope `"CITYPLANNER"`), because DMT strips custom fields. "Clear my suggestions" can then remove exactly ours and leave the player's manual tacks alone.
5. **Wait for DMT's cache**: run after `Loading.runWhenLoaded`, and ideally after `MapTackLoadedFromStore` has fired once. Otherwise `populateCacheFromStore` is still pending (it rebuilds from the store, so our writes survive, but validation in the meantime sees an empty cache).
6. **Reuse DMT computations** when available: `MapTackYield.getYieldDetails` gives the exact per-tile building preview, `dmt-adjacency-rules.js` provides the pure adjacency math, and `getRealizedPlotDetails` already accounts for other tacks. Keep a fallback scorer of our own for when DMT is absent. Licence/permission to copy code is an open question, so prefer importing over copying.

### Example bridge module (`ui/dmt-bridge.js` in our mod)
```js
const DMT = '/detailed-map-tacks/ui/map-tack-core/';
let dmt = null;                       // null = not loaded yet, false = absent
export async function loadDMT() {
    if (dmt !== null) return dmt;
    try {
        const [store, validator, yields, utils, uiUtils] = await Promise.all([
            import(DMT + 'dmt-map-tack-store.js'), import(DMT + 'dmt-map-tack-validator.js'),
            import(DMT + 'dmt-map-tack-yield.js'), import(DMT + 'dmt-map-tack-utils.js'),
            import(DMT + 'dmt-map-tack-ui-utils.js')]);
        dmt = { Store: store.default, Validator: validator.default, Yield: yields.default,
                Utils: utils.default, UIUtils: uiUtils.default };
    } catch (e) { console.warn('[CityPlanner] Detailed Map Tacks not available', e); dmt = false; }
    return dmt;
}
```
```js
/** Place one tack; returns {ok, reasons}. */
export async function placeTack(x, y, type) {
    const d = await loadDMT();
    if (!d) return { ok: false, reasons: ['DMT not installed'] };
    const prevOwner = d.Validator.validOwner;
    const owner = GameplayMap.getOwner(x, y);
    d.Validator.validOwner = owner == -1 ? GameContext.localPlayerID : owner; // mimic DMT UI
    const validStatus = d.Validator.isValid(x, y, type);                     // additive check
    d.Validator.validOwner = prevOwner;
    if (validStatus.preventPlacement) return { ok: false, reasons: validStatus.reasons };
    engine.trigger('AddMapTackRequest', {
        x, y, type,
        classType: d.Utils.getConstructibleClassType(type),
        validStatus,                                  // must be an object
        yieldDetails: validStatus.isValid ? d.Yield.getYieldDetails(x, y, type) : {}
    });
    rememberOurTack(x, y, type);                      // our own Catalog, see below
    return { ok: true, reasons: validStatus.reasons };
}
export function removeTack(x, y, type) {
    engine.trigger('RemoveMapTackRequest', { x, y, type });
    forgetOurTack(x, y, type);
}
```
Usage:
* Settlement candidates: `placeTack(x, y, 'BUILDING_CITY_HALL')`. DMT then draws the radius-3 ring and colours overlap automatically.
* Building spots: `placeTack(x, y, 'BUILDING_LIBRARY')`, or a generic `DMT_BUILDING_SCIENCE` when the exact building is undecided.
* Wonders: `placeTack(x, y, 'WONDER_PYRAMIDS')`.
* Order matters: place wonders and anchor buildings first, then re-score dependants, because DMT counts tacked neighbours in adjacency.

Reading existing tacks to avoid conflicts or overlap:
```js
const d = await loadDMT();
const all = d ? d.Store.getCachedMapTackStructs() : [];          // [{x,y,mapTackList}]
const plannedCities = d ? d.Utils.getCityCenterMapTackPlots() : []; // [{x,y}]
```
Scoring a candidate building tile with DMT's engine:
```js
d.Utils.togglePlotDetailsCache(true);
try {
  for (const idx of GameplayMap.getPlotIndicesInRadius(cx, cy, radius)) {
    const {x, y} = GameplayMap.getLocationFromIndex(idx);
    const v = d.Validator.isValid(x, y, type);
    if (!v.isValid) continue;
    const totals = d.UIUtils.getTotalYields(d.Yield.getYieldDetails(x, y, type)); // [{type, amount}]
    score(x, y, totals, priorityWeights);
  }
} finally { d.Utils.togglePlotDetailsCache(false); }
```
Note: this leaves `validOwner` at its current value. Set it as in `placeTack` if ownership matters.

Our own registry of placed tacks (same persistence technique DMT uses):
```js
const key = Database.makeHash('_CITYPLANNER_OBJ_TACKS_LIST');
function rememberOurTack(x, y, t) {
    const list = JSON.parse(GameTutorial.getProperty(key) || '[]'); list.push({x, y, t});
    GameTutorial.setProperty(key, JSON.stringify(list));
}
```
(Or import `Catalog` from `/core/ui/utilities/utility-serialize.js`, the newer base API, which can also be per player.)

### Design consequences
* There is no per-tack text, so the **rank (#1, #2…) cannot be shown on the tack**. Show the rank in our popup list, or draw our own `WorldUI.createSpriteGrid` text labels (as DMT's preview does at place-map-tacks:218-219).
* Settlement spacing / min-distance rules are **not** in DMT. We implement them.
* `Buildings` placement validation in DMT is permissive (`canPlaceBuilding` always true). Rely on the generic terrain rules plus our own checks (e.g. coast-only buildings via `Constructible_ValidTerrains`, which DMT already handles).
* Expect `yieldDetails.isComplete === false` for some modifiers. Surface `issues` to the user or treat them as approximate.

---

## Open questions
1. Do `GameTutorial` properties **survive age transitions**? (Probably not, which would mean tacks reset each age.) Test in game.
2. Multiplayer: are `GameTutorial` properties per client, host-synced, or desynced? DMT is not per player.
3. Is `engine.trigger` → JS `engine.on` handler delivery **synchronous** in this Coherent build? It matters if we read the store right after a trigger. Treat it as async-safe by listening for `MapTackUIUpdated` if needed.
4. Does founding a town create a `BUILDING_CITY_HALL` constructible, which would auto-clear the city-center tack through `ConstructibleAddedToMap`, or do our settlement tacks linger? (DMT only removes a tack whose `type` equals the built constructible.)
5. Does the `/detailed-map-tacks/...` absolute import path resolve for workshop mods, or must it be `fs://game/detailed-map-tacks/...`? DMT itself uses relative imports internally and `fs://game/detailed-map-tacks/` for CSS/HTML. Verify with a one-line test.
6. Performance of `getYieldDetails` over large radii (radius 5 ≈ 91 tiles × N building types). DMT itself evaluates ≤91 tiles per hover. We may need batching, `setTimeout` chunking, or our own lighter scorer.
7. Licence / permission to copy DMT code (e.g. `dmt-adjacency-rules.js`). There is no licence file in the mod folder. Prefer importing at runtime, or ask the author (wltk).
8. Pending DMT updates: the API is internal and may change (method names, the event names). Pin a tested workshop version and guard every call with `typeof fn === 'function'`.
