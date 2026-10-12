# 02 - Drongo's City Planner (workshop 3734169112), reverse-engineered

Mod root: `D:\SteamLibrary\steamapps\workshop\content\1295660\3734169112` (abbreviated `CP\` below).
Game root: `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules` (abbreviated `BASE\`).
Version read: 1.0.1, LastUpdated 2026-09-16.

Legend: **[V]** = VERIFIED by reading the code; **[I]** = INFERRED (reasoned, not executed in-game).

---

## TL;DR - the most important finding

**Drongo's City Planner does not search the map for settlement sites.** [V] It never iterates candidate plots. It scores only:

1. the local player's **existing settlements** (cities and towns), shown in a table, and
2. **city-centre map tacks placed with the "Detailed Map Tacks" mod** ("Planned City N" rows), plus
3. a **live hover score** for the plot under the cursor while the player is placing a city-centre tack in Detailed Map Tacks (DMT).

The "ranking" the user has seen is the player doing the search manually (hovering tack placements), with the mod giving one number per plot. That number is a simple **count of production-type tiles within radius 3**:

```
score = min(99, 3 * (vegetated + rough) + 5 * cityResources)
```

Food, gold, science, culture, rivers, fresh water, coast, mountains, natural wonders, adjacency and settle validity are **not in the score** at all. [V]

---

## 1. File layout, .modinfo, settings

| File | Bytes | Role |
|---|---|---|
| `drongos-city-planner.modinfo` | 1698 | Mod definition |
| `modules/database/input.xml` | 423 | Adds a keybinding (F9) |
| `modules/text/City-Planner-Text.sql` | 516 | In-game LOC strings |
| `modules/text/en_us/ModuleText.xml` | 404 | Mod-browser name and description |
| `modules/ui/city-planner/city-planner-dock.js` | 2144 | HUD button + hotkey (entry point) |
| `modules/ui/city-planner/city-planner-panel.js` | 49774 (1340 lines) | All logic: scoring, table, DMT integration, hover tooltip |
| `modules/ui/city-planner/city-planner-panel.html` | 3372 | Panel markup |
| `modules/ui/city-planner/city-planner-panel.css` | 16286 | Panel and tooltip styling |

**.modinfo** (`CP\drongos-city-planner.modinfo`) [V]
- Dependency: only `base-standard`. **No dependency on Detailed Map Tacks**; DMT is detected at runtime (see section 2.4).
- One criteria `always` (`<AlwaysMet/>`).
- `scope="shell"` group: `UpdateDatabase modules/database/input.xml` (the InputActions tables live in the shell/front-end DB).
- `scope="game"` group: `UpdateText` (SQL), `UIScripts` = `city-planner-dock.js`, `city-planner-panel.js`; `ImportFiles` = the `.html` and `.css`.
- **No overrides of base files.** Everything is additive (new custom element + `Controls.decorate`). [V]
- `AffectsSavedGames=0`.

**Keybinding** (`CP\modules\database\input.xml`) [V]
```xml
<InputActions><Row ActionId="open-drongos-city-planner" DeviceType="Keyboard" Name="LOC_DRONGOS_CITY_PLANNER_OPEN" .../></InputActions>
<InputActionDefaultGestures><Row ActionId="open-drongos-city-planner" Index="0" GestureType="KBMouse" GestureData="KEY_F9" /></InputActionDefaultGestures>
```

**Settings/options:** none. There is no options-menu entry; the only user state is three in-panel checkboxes (Show Cities / Towns / Planned Cities) held in memory on the panel instance (`city-planner-panel.js:1117-1121`) and not persisted. [V]

---

## 2. UI: entry point, panel, highlighting

### 2.1 HUD button (top-left) - the pattern to copy [V]

`panel-sub-system-dock` is the top-left ring-button strip (tech, civics, policies, resources, great works, religion, advisors, legacies); it sits in `BASE\base-standard\ui\root-game.html:203` inside the top `fxs-hslot`. City Planner adds a ring button to it with a **decorator**, not an override:

`CP\modules\ui\city-planner\city-planner-dock.js:24-60`
```js
function toggleCityPlanner() {
    const currentTarget = ContextManager.getCurrentTarget?.();
    if (currentTarget?.tagName == "PANEL-DRONGOS-CITY-PLANNER") { ContextManager.pop(currentTarget); return; }
    ContextManager.push("panel-drongos-city-planner", { singleton: true, createMouseGuard: true });
}
class DrongosCityPlannerSubsystemDockDecorator {
    constructor(panel) { this._panel = panel; }
    afterAttach() {
        this._panel.addButton({ tooltip: "LOC_DRONGOS_CITY_PLANNER_OPEN", modifierClass: "advanced-start",
            callback: toggleCityPlanner, class: "tut-drongos-city-planner",
            audio: "data-audio-press-small", focusedAudio: "data-audio-focus-small" });
    }
    beforeAttach() {} beforeDetach() {} afterDetach() {}
}
Controls.decorate("panel-sub-system-dock", (panel) => new DrongosCityPlannerSubsystemDockDecorator(panel));
```

How it works:
- `Controls.decorate(tag, factory)` lets a mod attach lifecycle hooks (`beforeAttach/afterAttach/beforeDetach/afterDetach`) to any engine-defined component without replacing its file. [V]
- `addButton(buttonData)` is a public method of the base dock (`BASE\base-standard\ui\sub-system-dock\panel-sub-system-dock.js:238-242`). It builds an `fxs-activatable` with classes `ssb__button <modifierClass>`, sets `data-tooltip-content`, wires `action-activate` to `callback` and creates the icon layers (`createButton`, lines 253-300). [V]
- **Icon trick:** `modifierClass: "advanced-start"` reuses the base CSS rule `.ssb__button-icon.advanced-start { background-image: url("blp:sub_advstart"); }` (`BASE\base-standard\ui\sub-system-dock\panel-sub-system-dock.css:356-358`), so no custom icon art is needed. A custom icon would need our own CSS rule for `.ssb__button-icon.<ourClass>`. [V]
- Alternative the base game provides: the dock creates `#panel-sub-system-dock-mod-slot` (`panel-sub-system-dock.js:147-149`) and calls `ModdingRegistry.attachModElements("panel-sub-system-dock")` in `onAttach` (`:177`); a mod can register `{parentID, modSlot, componentTag}` via `ModdingRegistry.add(...)` (`BASE\core\ui\modding-registry-handler\modding-registry-handler.js:16-46`). Drongo does **not** use this. [V]

### 2.2 Hotkey [V]
`city-planner-dock.js:5-22, 59, 61`: a singleton input handler registered with `ContextManager.registerEngineInputHandler(...)`. On `InputActionStatuses.FINISH` for action name `open-drongos-city-planner` and if `InterfaceMode.allowsHotKeys()`, it dispatches a window `CustomEvent("hotkey-open-drongos-city-planner")`, which calls `toggleCityPlanner`.

### 2.3 The panel (popup) [V]
- Custom element defined at `city-planner-panel.js:1333-1340`:
```js
Controls.define("panel-drongos-city-planner", {
    createInstance: DrongosCityPlannerPanel,
    styles:  ["fs://game/drongos-city-planner/modules/ui/city-planner/city-planner-panel.css"],
    content: ["fs://game/drongos-city-planner/modules/ui/city-planner/city-planner-panel.html"],
    classNames: ["panel-drongos-city-planner", "absolute", "inset-0"]
});
```
  The URL is `fs://game/<mod id>/<path>`; both files must be listed under `ImportFiles`.
- `DrongosCityPlannerPanel extends Panel` (`/core/ui/panel-support.js`). `onInitialize` grabs elements with `MustGetElement` (1126-1145); `onAttach` subscribes to engine events, wires checkboxes (`ComponentValueChangeEventName`) and `fxs-close-button` (`action-activate`), calls `refresh()` and `FocusManager.get().setFocus(this.Root)` (1147-1174).
- Escape/back handling: `onEngineInput` closes on `inputEvent.isCancelInput()` or `sys-menu` (1206-1215). `onReceiveFocus` sets the nav tray "Back" (1200-1204).
- Opened via `ContextManager.push(tag, { singleton: true, createMouseGuard: true })`; closed via `ContextManager.pop`. The mouse guard blocks map clicks while open.
- Layout: centred frame, `left:50%; top:30vh; transform: translateX(-50%)` (`city-planner-panel.css:1-19`). Built with plain `document.createElement` DOM (no data binding). Widths are computed in JS from digit counts (`updateTableColumnWidths`, 1267-1277).
- Built-in components used in HTML: `fxs-checkbox`, `fxs-close-button`. Icons via `UI.getIconBLP(id)` -> `url("blp:...")` (`iconUrl`, 299-303).

### 2.4 Plot highlighting [V]
**There is none**: no lens, no overlay (`WorldUI`/`PlotOverlay`), no plot icons. Map interaction is limited to:
- clicking a row's name or icon -> `PlotCursor.plotCursorCoords = location; Camera.lookAtPlot(location)` (`focusSettlementLocation`, 637-661);
- a floating DOM tooltip ("CITY CENTER / SCORE") that follows the mouse while DMT is in city-centre placement mode (876-1056). While that is active, the CSS hides the native plot tooltips with `body.drongos-city-planner-placement-active #tooltips, ... { ... }` (`city-planner-panel.css:604-624`).

### 2.5 Detailed Map Tacks integration (directly relevant to us) [V]
- **Detection:** `customElements.get("dmt-panel-place-map-tack")` or that element present in the DOM (243-246).
- **Reading tacks without importing DMT code:** DMT persists tacks in `GameTutorial` properties. Drongo reads them directly (115-142):
```js
function serialHash(scope, id, key) { return Database.makeHash(`_${scope}_${id}_${key}`); }
const ids = GameTutorial.getProperty(serialHash("DMT_OBJ", "MAP_TACK", "KEYS"));   // "x-y,x-y,..."
const raw = GameTutorial.getProperty(serialHash("DMT_OBJ", "MAP_TACK", key));       // JSON array of tacks
```
  Each tack has `type` (constructible type) and `validStatus.isValid`. A tack is a "city centre" if `GameInfo.Buildings.lookup(type)?.CityCenterPriority > 0` (156-162).
- **Placement-mode detection:** `InterfaceMode.getCurrent() === "DMT_INTERFACEMODE_PLACE_MAP_TACKS"` and the `item-type` attribute of `<dmt-panel-place-map-tack>` is a city-centre building (248-257). A `MutationObserver` on that element's `item-type`/`class` attributes plus `InterfaceModeChangedEventName` trigger re-sync (266-297, 1098).
- **DMT engine events listened to:** `MapTackUIUpdated` (payload = full tack struct array), `MapTackLoadedFromStore`, `CityCenterMapTackUpdated` (36-43), registered defensively through try/catch wrappers (164-190).
- Drongo **never writes** tacks. [V] (For writing we must look at DMT itself; see open questions.)

---

## 3. The scoring algorithm, in detail

### 3.1 Candidates [V]
- No candidate search. Inputs are only: local player's cities (`Players.get(GameContext.localPlayerID).Cities.getCities()`, 313-326), DMT city-centre tacks (192-217), and the plot under `PlotCursor.plotCursorCoords` during DMT placement (925-933, 992-1034).
- **Settle validity:** not checked. No minimum-distance rule, no `canFoundCity`-style API, no water/ownership test of the centre plot. The only validity signal is DMT's own `validStatus.isValid` on stored tacks (161); the hover score is computed for **any** plot, including water or foreign land. [V]

### 3.2 Tiles evaluated per site [V]
`getPotentialTiles` (565-606):
- `WORKABLE_RADIUS = 3` (line 9). Plots from `GameplayMap.getPlotIndicesInRadius(x, y, 3)`, then `GameplayMap.getLocationFromIndex`, `GameplayMap.isValidLocation`, and a redundant `GameplayMap.getPlotDistance(...) > 3` guard. Up to **37 plots**, centre tile **included**.
- **No ring weighting**: ring 1, 2 and 3 all count equally.
- Skipped plots:
  - not revealed: `GameplayMap.getRevealedState(localPlayer, x, y) == RevealedStates.HIDDEN` (507-510). Revealed-but-not-visible counts.
  - purchased by another of **the local player's own** settlements: a map built from `city.getPurchasedPlots()` for all own cities (550-563).
  - owned by any other city (any player): `GameplayMap.getOwningCityFromXY(x, y)` compared with `city.id` (512-534).
  - For planned sites `city.id` is `null`, so **every already-owned plot is excluded** (ours and foreign). That is the only "overlap" handling: owned tiles are dropped. Unowned tiles shared by two planned sites are counted for both. [V/I: the null-id path goes to `ComponentID.isMatch(null, ...)`, which returns false or throws; both return `true` = excluded]

### 3.3 Tile classification [V]
Per plot (584-603), using `GameplayMap.getTerrainType/getFeatureType/getResourceType` + `GameInfo.*.lookup`:

| Counter | Rule | Lines |
|---|---|---|
| `vegetated` | feature's `FeatureClassType == "FEATURE_CLASS_VEGETATED"` (forest, jungle and similar) | 375-379 |
| `rough` | `TERRAIN_HILL` **or** a "mine resource" **or** a "mine feature" | 381-385 |
| `water` | `TERRAIN_COAST`, `TERRAIN_LAKE`, `TERRAIN_NAVIGABLE_RIVER`; `TERRAIN_OCEAN` only if age is `AGE_EXPLORATION` or `AGE_MODERN` (`Game.age`) | 392-411 |
| `flatOrFloodPlain` | not water, not vegetated, and (feature type contains `"FLOOD"` or `TERRAIN_FLAT`) | 413-430 |
| `cityResources` | resource is in `cityResourceTypes` | 600-603 |

Resource and feature sets (lazily cached; 432-483):
- `mineResourceTypes` = hard-coded fallback (`RESOURCE_GOLD, SILVER, COAL, CLAY, GYPSUM, IRON, JADE, KAOLIN, LIMESTONE, MARBLE, NITER, RUBIES, SALT, TIN` and the `_DISTANT_LANDS` variants of gold and silver; 71-88) plus every `ResourceType` in `GameInfo.Constructible_ValidResources` / `District_FreeConstructibles` whose constructible is `IMPROVEMENT_MINE_RESOURCE | IMPROVEMENT_QUARRY | IMPROVEMENT_CLAY_PIT | IMPROVEMENT_CLAY_PIT_RESOURCE` (53-58).
- `mineFeatureTypes` = fallback `FEATURE_MANGROVE, MARSH, OASIS, TUNDRA_BOG, WATERING_HOLE` (90-96) plus `District_FreeConstructibles` features for the same constructibles. So marsh, mangrove, oasis and similar features count as **rough** (they produce clay pits and similar improvements). [V]
- `cityResourceTypes` = fallback = the mine list, plus resources valid for `IMPROVEMENT_CAMP(_RESOURCE)`, `WOODCUTTER(_RESOURCE)`, `CLAY_PIT(_RESOURCE)`, `MINE(_RESOURCE)`, `QUARRY(_RESOURCE)` (59-70). These are the "production improvement" resources. Plantation, farm, pasture and fishing resources are **not** included.

Notes:
- `rough` and `vegetated` are not exclusive. A vegetated hill counts twice. A hill with an iron resource scores rough (3) + cityResource (5) = 8. [V]
- `TERRAIN_MOUNTAIN` is not counted anywhere (unworkable). [V]
- **No yields are read for scoring.** No `GameplayMap.getYield`, rivers (`isRiver`), fresh water, coast adjacency, natural wonders, or happiness/appeal. [V]

### 3.4 Score formula (real constants) [V]
```text
// city-planner-panel.js:608-618, 854-865
MAX_POTENTIAL_SCORE = 99
score       = min(99, (vegetated + rough) * 3 + cityResources * 5)
productionTiles = vegetated + rough          // displayed column, woodcutter + mine icons
growthTiles     = water + flatOrFloodPlain   // displayed column, fishing boat + farm icons; NOT in score
tier: score >= 80 "excellent", >= 60 "good", >= 50 "okay", else "low"
```

Full pseudo-code for one site:
```text
function scoreSite(cx, cy, siteCityId /* null for planned */):
  t = {veg:0, rough:0, water:0, flat:0, res:0}
  for p in plotsInRadius(cx, cy, 3):                 // 37 incl. centre, unweighted
    if revealed(p) == HIDDEN: continue
    if p in ownPurchasedPlots and owner != siteCityId: continue
    if owningCity(p) exists and != siteCityId: continue
    if featureClass(p) == VEGETATED: t.veg++
    if terrain(p) == HILL or resource(p) in MINE_RES or feature(p) in MINE_FEAT: t.rough++
    isWater = terrain in {COAST, LAKE, NAVIGABLE_RIVER} or (terrain == OCEAN and age in {EXPLORATION, MODERN})
    if isWater: t.water++
    elif not veg and (feature contains "FLOOD" or terrain == FLAT): t.flat++
    if resource(p) in CITY_RES: t.res++
  return min(99, 3*(t.veg + t.rough) + 5*t.res), t
```
Worked example: 10 forest/jungle tiles + 6 hills (2 of them vegetated) + 3 iron/stone resources gives 3*(10+6) + 15 = 63 ("good"). The cap of 99 means about 33 production tiles; in practice 50-80 is normal for a heavily forested or hilly site. [I]

---

## 4. Town vs city, production, growth, ranking

- **No "convert town to city" logic** and no production estimate. [V] The table shows each settlement's current net yields (`city.Yields.getNetYield(YieldTypes[...])` for food, production, gold, science, culture, happiness, diplomacy; 328-332), population (`city.population`), the production/growth tile counts and the score.
- **Implicit convert-heuristic** [I]: the score measures raw **production-tile potential within radius 3**, and towns are sorted by score. So the tool answers "which town has the most production land to become a good city". This matches the user's rule that a town should only become a city with enough production. It does not model how many of those tiles the town currently owns, its population or its growth rate.
- **Sorting** (`compareSettlementRows`, 342-373) [V]:
  1. Real settlements before planned tacks.
  2. Capital first.
  3. Cities before towns.
  4. Cities by **current net production** (descending).
  5. Towns by **score** (descending).
  6. Then population (descending), then name.
  Planned tacks are first numbered by x then y (198), but because they set `isTown: true` (204), rule 5 applies, so the planned block is effectively **ranked by score** (descending). This is the closest thing to a "ranked list of sites" in the mod. [V]
- Presentation: up to 10 visible rows, scrollable (1296-1298); filters for cities, towns and planned; a coloured score badge; clicking a row moves the camera.

---

## 5. Performance and refresh

- Per site: 37 plots, each with about 6 to 10 cheap `GameplayMap`/`GameInfo.lookup` calls. With N settlements and M tacks, the work is about 37*(N+M) plot evaluations, which is trivial. [V/I]
- Caching: only the resource/feature type sets (lazy singletons, 97-99, 432-483) and the DMT tack list (`cachedMapTackStructs`). No per-plot cache. Every refresh rebuilds the full DOM (`this.rows.innerHTML = ""`, 1300). [V]
- **Refresh triggers** while the panel is open (1150-1165), with no debounce: `PlotOwnershipChanged, PlotPropertyChanged, PlotYieldChanged, CityMadePurchase, CityProductionCompleted, CityTileOwnershipChanged, CityYieldChanged, ConstructibleAddedToMap, ConstructibleChanged, ConstructibleRemovedFromMap, ImprovementAddedToMap, ImprovementChanged, ImprovementRemovedFromMap` + DMT `MapTackUIUpdated, MapTackLoadedFromStore, CityCenterMapTackUpdated`. During the AI turn these can fire many times. [V]
- Hover scoring: `setInterval(150 ms)` poll of `PlotCursor.plotCursorCoords`; scores only after the cursor has stayed on one plot for 5 polls (about 600 to 750 ms), once per plot key (31-33, 992-1050). Own purchased-plot map snapshotted once at placement start (1044). The installer runs at module load via `engine.whenReady` (1102-1108), so the poller exists even when the panel is closed, but it only runs in DMT placement mode. [V]

---

## 6. Weaknesses and simplifications we can improve on

1. **No automatic site search.** The player must hover each plot. Our mod should scan all revealed, settleable land within the chosen radius and rank it. [V]
2. **No settle-validity check** (min distance to other settlements, water, mountains, foreign territory, natural wonders). [V] The base game has `player.AI.getBestSettleLocationsForSettler(count, location)` used by the settler recommendation lens (`BASE\base-standard\ui\lenses\layer\settlement-recommendations-layer.js:43`). It is useful both as a validity oracle and as a baseline. [V for existence; I for usefulness]
3. **Score ignores food and growth.** Water and flat tiles are shown but have zero weight. There is no balance between food and production, so no "Balance/Food" priority. [V]
4. **No ring weights / no growth timeline.** All 37 tiles weigh the same, and the centre tile is counted as if workable. A town at founding owns radius 1 and expands slowly, so ring-1 quality matters far more early on. [V/I]
5. **No real yields.** Tiles are categorised instead of reading `GameplayMap.getYield(plotIndex, yieldType, playerID)` or similar. Base yields of grassland vs plains, resource yield bonuses and luxury/bonus resources (plantations, pastures, fish, etc.) are ignored. [V]
6. **No rivers, fresh water, coast or harbour, navigable-river or minor-river adjacency, mountains, natural wonders, or happiness.** All are relevant to Civ VII district adjacency (for example science or culture next to mountains and natural wonders, gold next to coast or navigable river, production or food from rivers). [V for absence]
7. **No adjacency potential for buildings or quarters**, and no unique quarters or civ-specific bonuses. [V]
8. **Overlap handling is binary**: owned tiles are dropped. Unowned tiles shared with other planned sites and contested tiles near foreign borders are not penalised. [V]
9. **Double counting**: vegetated hills and resources on rough tiles are counted twice, which inflates hilly forest. A design choice, possibly intended. [V]
10. **Unknown tiles silently reduce the score**, so a half-explored site looks bad. No "unexplored %" indicator. [V]
11. **Hard cap of 99** and fixed tier thresholds (50/60/80) that do not scale with radius. [V]
12. **Undebounced full DOM rebuild** on frequent events, and the 150 ms global poller. [V]
13. Town-to-city recommendation is implicit: no threshold, no comparison of current production to potential, and no account of population, growth or the cost of conversion. [V/I]

---

## 7. Other Drongo mods (skimmed only for reusable helpers)

**Notification Filter (3734202749)** - a reusable **Options-menu "Mods" tab + dropdown option** pattern [V]:
- `ui/mod-options-decorator.js:1-8` adds a new options category:
```js
import { CategoryType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';
CategoryType["Mods"] = "mods";
CategoryData[CategoryType.Mods] = { title: "LOC_UI_CONTENT_MGR_SUBTITLE", description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION" };
```
- `ui/notification-filter-options.js:37-49, 158-169`: persistence through `UI.getOption("user","Interface",name)` / `UI.setOption(...)` + `UI.commitApplicationOptions()`, with a `localStorage["modSettings"][modId]` mirror; option registered with `Options.addInitCallback(() => Options.addOption({ category, group, type: OptionType.Dropdown, id, initListener, updateListener, label, description, dropdownItems }))`.
- Loaded in **both** shell and game scopes with `LoadOrder 10000` (modinfo lines 24-50), so the option is visible from the main menu too.
- `ui/notification-filter.js:87-111`: **monkey-patches** a singleton method (`NotificationModel.manager.add`), keeping `originalAdd` and calling `manager.rebuild()` when the setting changes. This is a lightweight alternative to overriding a base file.

**Compact Production (3734579243)** - **full file replacement** [V]: `ImportFiles` of `ui/production-chooser/panel-production-chooser.js` and related files at the same relative paths as the base game (`LoadOrder 100`, modinfo lines 21-31), which shadows the base files. This is fragile across patches. Nothing in it is a shared library.

No shared Drongo helper library exists; every mod is self-contained. [V]

---

## Implications for our mod

1. **Copy the HUD-button pattern exactly**: `Controls.decorate("panel-sub-system-dock", p => ({ afterAttach(){ p.addButton({...}) }, beforeAttach(){}, beforeDetach(){}, afterDetach(){} }))`, plus `ContextManager.push("<our-panel>", {singleton:true, createMouseGuard:true})` and a `Panel` subclass registered with `Controls.define` using `fs://game/<our-mod-id>/...` for HTML/CSS. Use our own `modifierClass` with a CSS rule `.ssb__button-icon.<cls>{background-image:url("blp:...")}`, or reuse a base class as Drongo does (note it reuses Advanced Start's icon). Optional F9-style hotkey via `InputActions` in a shell-scope `UpdateDatabase`. Note that `createMouseGuard` blocks the map, which matters if we want click-to-pick tiles while the popup is open.
2. **Reuse Drongo's tile classifiers** (vegetated, rough with the DB-derived mine resource/feature sets, water with the age-dependent ocean rule, flat/floodplain, production resources) as one "production potential" term. They are cheap, DB-driven and age-aware.
3. **Add what Drongo lacks**: an automatic candidate scan (revealed, land, not owned, settle-valid; check the AI API `getBestSettleLocationsForSettler` and the base settler lens for validity), real per-tile yields, ring weights (for example ring1 > ring2 > ring3, centre excluded), priority weights per yield, river, fresh-water and coast bonuses, a "production enough to be a city" estimate, an overlap penalty against existing and other proposed sites (greedy pick with exclusion), and an unexplored-fraction penalty.
4. **Town-to-city advice**: Drongo's score is a usable "production potential" metric. Combine it with current `city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION)` and the plots the town actually owns (`city.getPurchasedPlots()`) to recommend conversion.
5. **Detailed Map Tacks read access** without a hard dependency: read `GameTutorial.getProperty(Database.makeHash("_DMT_OBJ_MAP_TACK_KEYS"))` etc., detect DMT with `customElements.get("dmt-panel-place-map-tack")`, and listen to `MapTackUIUpdated`. For **writing** tacks we still need DMT's own API (Drongo shows none).
6. **Coexistence**: Drongo already adds a dock button and a hover tooltip in DMT city-centre placement mode, and hides native tooltips then. Our tooltip/overlay must not fight with `body.drongos-city-planner-placement-active` CSS.
7. **Options**: use the Notification-Filter `Options.addOption` + `CategoryType["Mods"]` pattern to store default radius/priority.
8. **Performance**: debounce refreshes, cache per-plot classification per turn, and only rescan on `PlotOwnershipChanged`/reveal/turn start. A radius-10 scan is about 330 candidates * 37 plots, about 12k plot evaluations, which should be fine if cached. [I]

## Open questions

1. What public API does Detailed Map Tacks expose for **creating** tacks (a `MapTackUtils`/`MapTackStore` module, or engine events)? Is the `GameTutorial` property schema stable? (Needs the DMT deep-dive.)
2. Which engine call gives authoritative **settle validity** in Civ VII JS (`GameplayMap`/`Players.get(id).Units` `canFoundCity`-type checks, `Game.PlayerOperations.canStart(... FOUND_CITY ...)` on a settler, or the minimum-distance value from `GlobalParameters`)? Drongo does not check this.
3. Does `GameplayMap.getYield(plotIndex, yieldType, playerID)` (or similar) return improvement-free base yields usable for unowned plots?
4. Is `player.AI.getBestSettleLocationsForSettler` callable for the local human player at any time, and how good is it as a baseline or validity filter?
5. Does `Controls.decorate` on `panel-sub-system-dock` conflict when several mods add buttons (ordering, overflow at small resolutions)? Drongo plus our mod would add two.
6. Is the `FEATURE_CLASS_VEGETATED` + hill + mine-resource classification still correct in later ages and DLC (new features or resources)? Drongo's DB-derived sets mitigate this, but the hard-coded fallbacks may drift.
7. Was the double counting of rough + vegetated + resource intentional (it favours forested hills)? This should be calibrated against in-game production.
