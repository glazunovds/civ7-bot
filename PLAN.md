# Expansion Planner: implementation plan (Civilization VII UI mod)

## Executive summary
1. **What it is.** A UI-only mod called **Expansion Planner** (mod id `expansion-planner`). It adds a top-left HUD button that opens a **non-modal left side panel** with three tabs: **Settlements**, **Buildings** and **Towns**. A **Wonders** tab follows in phase 2.
2. **Settlements tab.** Scans every revealed land plot within N tiles of any of your settlements and filters it with the engine's own settle check (`player.Diplomacy.isValidLandClaimLocation`). It then scores each site over rings 0–3 with ring weights, an overlap/room-to-grow model, adjacency potential and **production potential**. Picks are made greedily under a spacing constraint, then shown as a ranked list with map highlights.
3. **Buildings tab.** Plans the best adjacency layout for the buildings you tick. A JS rule engine reads `Constructible_Adjacencies` and `Adjacency_YieldChanges` at runtime. It handles 2 slots per tile, quarters, wonders, the 1.4 specialist multiplier and warehouses as filler. A greedy pass is followed by local search. For tiles a city can already reach, results are cross-checked against `city.Yields.calculateAllBuildingsPlacements()`.
4. **Towns tab.** A town→city advisor that uses the engine's real upgrade cost and `canStart` result plus the city limit. It values the production you gain against the gold the town currently makes from it, the empire-wide +10% building tax, the remaining age time (cities revert at age end) and the town focus you would lose.
5. **Detailed Map Tacks (DMT) is optional.** It is detected through a `ModInUse`-gated script. Tacks are written only via DMT's `AddMapTackRequest`/`RemoveMapTackRequest` events, after our own checks for duplicates, the 2-per-tile limit and full-tile conflicts. We record our own tacks in a game-scoped Catalog, so "Clear my tacks" never touches yours.
6. **Flow is preview, then pick.** Rows have checkboxes. Clicking a row pans the camera; hovering shows the site's radius-3 footprint. Fog is a toggle that defaults to revealed tiles only.
7. **Tech choices.** Plain ES modules, no build step. The `core/` modules are pure and unit-tested with `node --test` against data extracted from the game XML. Heavy work runs in time slices (6 ms per frame, `requestAnimationFrame`), with dirty-plot invalidation flushed on `GameCoreEventPlaybackComplete`.
8. **Research corrections.** The lead's decisions all hold. My checks of the source added these refinements:
   - Use `InputContext.Dual` and **no mouse guard** (the production chooser and tech chooser precedent).
   - DMT recomputes `validStatus`/`yieldDetails` itself, so a minimal payload is safe.
   - **New hazard:** writing before DMT's cache is loaded overwrites the existing tacks on that plot.
   - Per-player Catalog writes are asynchronous, so our registry uses game scope.
9. **Roadmap (≈21 effort units):** M0 skeleton (1) → M1 settlement finder (4) → M2 DMT tacks (2) → M3 town advisor (2) → M4 adjacency solver (6) → M5 polish (2) → phase 2 wonders with race check (4).
10. **Main risks and open questions.** Risks: UI patch fragility (`addButton` is `private` in the TS source; 1.4 moved files to `.scss.js`), DMT internals changing, multiplayer storage semantics, and performance on Huge maps. Five open questions for you are at the end.

> **Addendum (2026-10-11, after your answers):**
> - The installed game is **1.5.0.44** (Steam build 25516395), not 1.4.
> - Several installed mods carry **local compatibility patches**, Detailed Map Tacks among them.
> - **Online multiplayer is in scope.**
> - The phase 2 wonder source is **Wonder Alert**.
> - The dev setup is approved.
>
> See **§14**. It overrides anything above that conflicts with it.

---

## 0. Lead decisions vs. research (confirmed, refined, corrected)

| # | Lead decision | Verdict | Evidence / refinement |
|---|---|---|---|
| D1 | Non-modal side panel | **Confirmed, refined** | `createMouseGuard` sets `ViewManager.isWorldInputAllowed = false` (`core/ui/context-manager/context-manager.js:79-93`), so **do not** use Drongo's modal pattern. The base game pushes the tech chooser with `{singleton:true}` and no guard (`panel-sub-system-dock.js:752`). Side panels set `inputContext = InputContext.Dual` (`panel-production-chooser.js:345`; Panel's default is `InputContext.Shell`, `core/ui/panel-support.js` ~l.29). Our root element must **not** be `inset-0`. |
| D2 | `Controls.decorate("panel-sub-system-dock")` + `addButton` | **Confirmed** | `addButton` is at `panel-sub-system-dock.js:238-242`. All four decorator hooks are called unconditionally (`core/ui/component-support.js:283-321`), so all four must exist. `afterAttach` can re-run, so guard against duplicates. Fallback: `ModdingRegistry` mod slot (`#panel-sub-system-dock-mod-slot`, l.147-149; `attachModElements` l.177). |
| D3 | DMT optional (References + gated group / dynamic import) | **Confirmed, refined** | Writes go through events only (`dmt-map-tack-change-processor.js:21-48`). DMT re-validates and re-yields the plot itself (`onPlotDetailsUpdated`, l.100-107, `includeSelf=true`), so the payload can be minimal. **Hazard:** `MapTackStore.addMapTack` writes `cacheMap[key] || []` + our tack to the store (`dmt-map-tack-store.js:54-65`). If DMT's cache is not yet populated, existing tacks on that plot are overwritten. Write only after `Loading.runWhenLoaded` and `MapTackLoadedFromStore`. Importing DMT modules is optional ("L2"). No DMT module imports the change processor, so an import can never register duplicate handlers (verified by grep). |
| D4 | Hybrid adjacency (JS rules + engine cross-check) | **Confirmed** | Engine call at `building-placement-manager.js:131`; it is bound to an existing city. Write our own clean-room rule engine with the same semantics as DMT's `dmt-adjacency-rules.js` (DMT has no licence file). DMT's yield engine is used only as an optional debug cross-check. |
| D5 | Settle validity = `isValidLandClaimLocation` + own spacing (+ AI signal) | **Confirmed** | `appeal-layer.js:52` calls it for every plot. The AI recommender is at `settlement-recommendations-layer.js:43`; its dedupe bug is at l.44-46 (it uses `location` instead of `suggestion.location`). We dedupe correctly. |
| D6 | Plain JS ES modules, no build step | **Confirmed** | No `modding-sdk` typings ship. Keep `core/` engine-free so Node can test it. JSDoc with optional `// @ts-check` is for the editor only. |
| D7 | "Wonder Panel" = BZ Map Trix `bz-wonder-panel` or Wonder Alert; phase 2 legitimate data by default plus opt-in hidden-queue mode | **Confirmed, kept as a user question** | BZ exports `bzWonderList` (`3507072814/ui/bz-wonder-panel/model-wonder-list.js`, end of file) and creates the JS model `g_bzWonderListModel`. Wonder Alert reads rivals' `BuildQueue` (hidden information). |

### Corrections to the research reports
- **Report 06 §6** says map tacks are "a base feature". That is **wrong**: the base game has no native tack system (report 01's grep agrees).
- **Report 10** says Drongo's City Planner was not found online. It **is** installed locally (v1.0.1, 3734169112). Also note that it does not search sites; it only scores existing settlements and DMT city-centre tacks (report 02).
- **Report 07, open question 6** (`GameplayMap.isRiver`/`isNavigableRiver` in UI scope) is **resolved**. DMT, a working UI mod, calls both in `dmt-map-tack-utils.js:374-375`. `getRiverType` is used in base UI (`ui-next/tooltips/plot-tooltip/helpers.js:83`).
- **Report 10** says "ageless buildings have no adjacency". That is imprecise: **warehouses** have none, but civ-unique buildings (tagged AGELESS) do (report 04 §5).
- **1.4 specialists = 100% of adjacency** is confirmed in the shipped Civilopedia, not just third-party notes (`base-standard/text/en_us/Civilopedia_Concepts_Text.xml:841,1587`). Specialists also cost −2 Food and −2 Happiness per age.
- **Report 01's bridge** passes DMT validator output. That is optional, because DMT recomputes it, but our own additive checks remain mandatory.
- **Per-player `Catalog` writes are queued and committed asynchronously.** Game-scope (`GameTutorial`) writes are immediate (`core/ui/utilities/utility-serialize.js:95-116`). Our tack registry therefore uses game scope, the same lifetime as DMT's tacks.
- **Imports.** `ContextManager` has both a default and a named export (`context-manager.js:686`). The 1.4 base files use relative imports plus `.scss.js`, but absolute `/core/...` and `/base-standard/...` imports still work (used by Drongo, updated 2026-09-16, and by DMT).

---

## 1. Name, identity, folder layout, dev deployment

| Item | Value |
|---|---|
| Display name | **Expansion Planner** |
| Mod id | `expansion-planner` (you may want a developer prefix before Workshop upload; see open questions) |
| Prefixes | LOC `LOC_XPL_*`, CSS/elements `xpl-*`, Catalog scope `XPL`, log tag `[XPL]` |
| Settings key | `localStorage["modSettings"]["expansion-planner"]` plus `UI.setOption("user","Mod","expansion-planner.<key>")` |
| Hotkey | `KEY_F8`, action `open-expansion-planner`. Free in base and the installed mods: base uses F1/F5/F6/F9 and Alt+F1, DMT uses F2/X, Drongo F9, BZ many Shift+letter combos, Wonder Alert Alt+W in JS. |

### Folder layout (`D:\work\ideas\civ7-mods`)
```
D:\work\ideas\civ7-mods\
├─ PLAN.md
├─ research\                                (scout reports 01–10, unchanged)
├─ mod\expansion-planner\                   ← mod root; junctioned into %LOCALAPPDATA%\…\Mods
│  ├─ expansion-planner.modinfo
│  ├─ config\input.xml                      (shell: InputActions + default gesture)
│  ├─ text\en_us\ModInfoText.xml            (mod browser name/description)
│  ├─ text\en_us\InGameText.xml             (all LOC_XPL_* strings; shell + game)
│  ├─ ui\
│  │  ├─ xpl-main.js                        (ONLY UIScript of the main group: boot, imports the rest)
│  │  ├─ hud\xpl-dock.js | xpl-dock.css | xpl-hotkey.js
│  │  ├─ panel\xpl-panel.js | .html | .css | tab-settlements.js | tab-buildings.js | tab-towns.js | tab-wonders.js(P2) | widgets.js
│  │  ├─ map\xpl-overlay.js | xpl-camera.js
│  │  ├─ data\rules-loader.js | map-facts.js | player-facts.js | settle-oracle.js | engine-placements.js
│  │  ├─ core\constants.js | profiles.js | yield-model.js | site-scorer.js | site-selector.js |
│  │  │       adjacency-rules.js | placement-model.js | placement-solver.js | town-advisor.js |
│  │  │       explain.js | heap.js | wonder-race.js(P2)                     (pure: no engine globals)
│  │  ├─ services\state.js | settings.js | scheduler.js | invalidation.js | log.js
│  │  ├─ integrations\dmt-bridge.js | tack-registry.js | xpl-dmt-present.js | wonders-source.js(P2)
│  │  └─ icons\xpl-dock.png                 (64×64; until art exists use modifierClass "advanced-start")
│  └─ thumbnail.png                         (later, for the Workshop)
├─ tests\
│  ├─ fixtures\*.json                       (generated from game XML by tools\extract-fixtures.py)
│  ├─ fakes\fake-gameinfo.mjs | fake-map.mjs
│  └─ *.test.mjs                            (node --test tests\)
└─ tools\
   ├─ deploy-junction.cmd                   (mklink /J …)
   ├─ mirror-copy.ps1                       (fallback if junctions are not followed: robocopy /MIR + FileSystemWatcher)
   ├─ extract-fixtures.py                   (reads game XML read-only → tests\fixtures)
   ├─ check-syntax.ps1                      (node --check on every .js)
   └─ tail-ui-log.ps1                       (Get-Content -Wait …\Logs\UI.log | Select-String "\[XPL\]")
```
**Module rules.**
- Inside the mod, use **relative imports only**. Base imports use `/core/...` and `/base-standard/...`; DMT imports use `/detailed-map-tacks/...`.
- Stateful singletons (state, settings, caches, scheduler) must be reached **only via import**, never listed in `UIScripts`. This prevents a second instance appearing if a URL resolves differently.
- Every other `.js`, `.html`, `.css` and `.png` file is listed under `ImportFiles` as a defensive measure. DMT shows that import-only files resolve anyway (`dmt-adjacency-rules.js` is not in its modinfo).

### Dev deployment
1. Create the junction (no admin needed):
   `cmd /c mklink /J "%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\expansion-planner" "D:\work\ideas\civ7-mods\mod\expansion-planner"`
   (PowerShell: `New-Item -ItemType Junction -Path … -Target …`). The Mods folder exists and is empty.
2. `AppOptions.txt` (`%LOCALAPPDATA%\…\AppOptions.txt`; all keys are currently commented: l.33, 75, 78, 108, 111, 114). This is **your decision**; back the file up first. Set:
   - `UIFileWatcher 1`
   - `UILogLevel 2` (so that `console.log` is not filtered; we log with `console.warn` anyway)
   - `EnableTuner 1`
   - `EnableDebugPanels 1`
   - `UIDebugger 1`
   - optionally `EnableUiStateLogging 1` and `ModdingLogLevel 3`
3. Reload rules:
   - `.modinfo`, DB and text changes: **restart the game**.
   - JS/CSS/HTML: hot reload through UIFileWatcher (to verify in M0). Otherwise go to the main menu and reload the save.
4. If `Modding.log` doesn't list `expansion-planner` (the junction is not followed), use `tools\mirror-copy.ps1`.

---

## 2. `.modinfo` draft

```xml
<?xml version="1.0" encoding="utf-8"?>
<Mod id="expansion-planner" version="1" xmlns="ModInfo">
  <Properties>
    <Name>LOC_MOD_XPL_NAME</Name>
    <Description>LOC_MOD_XPL_DESCRIPTION</Description>
    <Authors>TODO</Authors>
    <Package>Mod</Package>
    <AffectsSavedGames>0</AffectsSavedGames>
  </Properties>
  <Dependencies>
    <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME"/>
  </Dependencies>
  <References>
    <Mod id="detailed-map-tacks" title="LOC_MOD_DETAILED_MAP_TACKS_NAME"/>
    <!-- phase 2: <Mod id="bz-map-trix" title="LOC_MOD_BZ_MAP_TRIX_NAME"/> -->
  </References>
  <ActionCriteria>
    <Criteria id="always"><AlwaysMet/></Criteria>
    <Criteria id="dmt-active"><ModInUse>detailed-map-tacks</ModInUse></Criteria>
    <!-- phase 2: <Criteria id="bz-active"><ModInUse>bz-map-trix</ModInUse></Criteria> -->
  </ActionCriteria>
  <ActionGroups>
    <ActionGroup id="xpl-shell" scope="shell" criteria="always">
      <Properties><LoadOrder>1000</LoadOrder></Properties>
      <Actions>
        <UpdateDatabase><Item>config/input.xml</Item></UpdateDatabase>
        <UpdateText><Item>text/en_us/InGameText.xml</Item></UpdateText>
      </Actions>
    </ActionGroup>
    <ActionGroup id="xpl-game" scope="game" criteria="always">
      <Properties><LoadOrder>1000</LoadOrder></Properties>
      <Actions>
        <UpdateText><Item>text/en_us/InGameText.xml</Item></UpdateText>
        <ImportFiles>
          <Item>ui/hud/xpl-dock.css</Item>
          <Item>ui/icons/xpl-dock.png</Item>
          <Item>ui/panel/xpl-panel.html</Item>
          <Item>ui/panel/xpl-panel.css</Item>
          <!-- plus every non-entry .js under ui/ (defensive) -->
        </ImportFiles>
        <UIScripts>
          <Item>ui/xpl-main.js</Item>
        </UIScripts>
      </Actions>
    </ActionGroup>
    <ActionGroup id="xpl-game-dmt" scope="game" criteria="dmt-active">
      <Properties><LoadOrder>1010</LoadOrder></Properties>
      <Actions>
        <UIScripts><Item>ui/integrations/xpl-dmt-present.js</Item></UIScripts>
      </Actions>
    </ActionGroup>
  </ActionGroups>
  <LocalizedText>
    <File>text/en_us/ModInfoText.xml</File>
  </LocalizedText>
</Mod>
```

`config/input.xml` (shell scope):
```xml
<Database>
  <InputActions>
    <Row ActionId="open-expansion-planner" DeviceType="Keyboard" Name="LOC_XPL_OPEN" Description="LOC_XPL_OPEN_DESC"/>
  </InputActions>
  <InputActionDefaultGestures>
    <Row ActionId="open-expansion-planner" Index="0" GestureType="KBMouse" GestureData="KEY_F8"/>
  </InputActionDefaultGestures>
</Database>
```

`ui/integrations/xpl-dmt-present.js` contains only:
```js
globalThis.__XPL_DMT_ACTIVE = true;
window.dispatchEvent(new CustomEvent("xpl-dmt-present"));
```
"DMT active" means this flag is set. An import of DMT files alone is not proof, because a mounted but inactive mod would have no change processor listening.

---

## 3. Architecture

### 3.1 Modules and responsibilities

| Layer | Module | Responsibility | Key API |
|---|---|---|---|
| Boot | `xpl-main.js` | Wait for `engine.whenReady`, import hud/panel/services, start invalidation, log the version and DMT status | — |
| HUD | `hud/xpl-dock.js` | Decorate the dock (with a duplicate guard) and load the icon CSS via `Controls.loadStyle` | `togglePanel()` |
| HUD | `hud/xpl-hotkey.js` | `ContextManager.registerEngineInputHandler`; on `open-expansion-planner` with `InterfaceMode.allowsHotKeys()`, toggle the panel | — |
| UI | `panel/xpl-panel.js` | `Panel` subclass, `Controls.define("xpl-panel")`, tab host, header (priority), footer (tack actions, status) | — |
| UI | `panel/tab-*.js` | Views. They read `state`, render rows by key (no full `innerHTML` rebuild) and dispatch intents | `mount(el)`, `render(state)` |
| Map | `map/xpl-overlay.js` | `WorldUI.createOverlayGroup("XPL_Overlay", OVERLAY_PRIORITY.PLOT_HIGHLIGHT)`: fills, border footprint, `createSpriteGrid` labels and icons | `showSites`, `hoverSite`, `selectSite`, `showPlan`, `clear` |
| Map | `map/xpl-camera.js` | `Camera.lookAtPlot({x,y},{zoom:0.5})`; optionally `PlotCursor.plotCursorCoords` | `focus(idx)` |
| Data | `data/rules-loader.js` | GameInfo → compact rule tables, memoised per `Game.age` | `getRules()` |
| Data | `data/map-facts.js` | Plot facts cache (typed arrays), fog-aware; neighbour and ring caches | `facts(idx)`, `neighbours(idx)`, `rings(idx)`, `invalidate(idx)`, `invalidateAll()` |
| Data | `data/player-facts.js` | Own and known foreign settlements, independents, caps/limits, buildable lists, production-to-gold ratio | `settlements()`, `foreign()`, `independents()`, `caps()`, `buildable(city)`, `prodToGold()` |
| Data | `data/settle-oracle.js` | `isValidLandClaimLocation`, `CITY_MIN_RANGE`, AI suggestions (deduped) | `isSettleable(idx)`, `minSpacing()`, `aiPicks()` |
| Data | `data/engine-placements.js` | `city.Yields.calculateAllBuildingsPlacements()`, cached per city; `canStart` plots | `placements(cityId)`, `validPlots(cityId, type)` |
| Core | `core/site-scorer.js`, `site-selector.js` | Pure scoring and diversity selection | `scoreSite(c, ctx)`, `selectSites(cands, ctx, n)` |
| Core | `core/adjacency-rules.js` | Pure rule matching (schema semantics) | `countMatches(row, plot, opts)`, `amount(row,n)`, `wildcardMatches(...)` |
| Core | `core/placement-model.js`, `placement-solver.js` | Plan state with slots and undo; greedy + local search | `PlanState`, `planTarget(target, sel, ctx)` |
| Core | `core/town-advisor.js` | Pure verdicts | `adviseTown(t, ctx)` |
| Core | `core/profiles.js`, `constants.js`, `explain.js` | Weight vectors, tunables, reason codes → LOC | — |
| Services | `services/state.js` | Small observable store `{settings, status, results:{sites,plans,towns}, selection, stale}` | `get`, `set`, `subscribe(sel, cb)` |
| Services | `services/scheduler.js` | Time-sliced generator jobs with cancel tokens | `runJob(gen, {budgetMs, onProgress, token})` |
| Services | `services/invalidation.js` | Engine events → dirty sets → stale flags; flush on `GameCoreEventPlaybackComplete` | `start()`, `onStale(cb)` |
| Services | `services/settings.js` | Load/save (see §7.6) | `get()`, `patch()`, `subscribe()` |
| Services | `services/log.js` | `console.warn('[XPL]', …)`, levels, ring buffer of 200 entries | `log.info/warn/error/debug`, `dump()` |
| Integration | `integrations/dmt-bridge.js` | DMT status L0/L1/L2, read tacks, checked place/remove, rate-limited | `status()`, `readTacks()`, `place(list, src)`, `clearMine(src?)` |
| Integration | `integrations/tack-registry.js` | Our tack list in `new Catalog({name:"XPL", version:1})` (game scope), with reconcile | `load()`, `add()`, `remove()`, `reconcile(live)` |

### 3.2 Key data types (JSDoc)
```ts
TileFacts { idx, x, y, known:boolean, terrain, biome, feature|null, featureClass|null,
  resource|null, resourceClass|null, isWater, isLake, isOcean, isCoast, isNavRiver, isMinorRiver,
  isMountain, isNaturalWonder, freshWater, appeal, owner /*-1 none*/, owningCityId|null,
  district|null, constructibles:string[], yields:Float32Array(7) /*F,P,G,S,C,H,I*/,
  prodTile:boolean /*Drongo classifier*/, urbanizable:boolean }
SiteResult { idx,x,y, score, tier, rank?, comps:{tiles,adj,prod,bonus,pen}, prodPot, food12,
  roomTiles, overlapTiles, unknownTiles, freshWater, coastal, aiPick, aiFactors[],
  nearest:{name,dist,dir}, reasons:Reason[] , rejected?:{code,arg} }
Reason { key:"LOC_XPL_R_…", args:any[], sign:"+"|"-"|"!" , weight:number }
PlanResult { targetId, kind:"city"|"town"|"planned", placements:[{type, idx, gain:{yields, base, adj, spec}, engineVerified, future, notes}],
  fillers:[…], unplaced:[{type, why}], objective, timingMs }
TownAdvice { cityId, name, pop, prodNow, prodPot, cost, canConvert, failureReasons[], gainPerTurn,
  paybackTurns, value, verdict:"CONVERT"|"CONSIDER"|"WAIT"|"KEEP"|"BLOCKED", reasons:Reason[] }
```

### 3.3 Data flow
```
engine events ─► invalidation (dirty plots / structural / player / advisor) ─► state.stale.*
                                                                               │ (debounced 300 ms, only while panel open)
panel controls ─► settings ─► state.settings ─────────────────────────────────►│
                                                                               ▼
                         scheduler.runJob(generator) ─► data adapters (GameplayMap, Players, GameInfo, engine calls)
                                                       └► core pure functions (score / select / plan / advise)
                                                                               │
                                                                               ▼
                                     state.results ─► tab views (rows) + map/xpl-overlay (highlights, labels)
user ticks rows + "Place tacks" ─► dmt-bridge (checks, rate-limit) ─► engine.trigger("AddMapTackRequest", …)
                                                                     └► tack-registry (Catalog "XPL", GameTutorial)
DMT "MapTackUIUpdated" ─► dmt-bridge mirror ─► registry.reconcile ─► state.stale.sites/plans (planned sites changed)
```

### 3.4 Panel definition and toggle (sketch)
```js
// panel/xpl-panel.js
import Panel, { AnchorType } from '/core/ui/panel-support.js';
import { ContextManager } from '/core/ui/context-manager/context-manager.js';
import { InputEngineEventName } from '/core/ui/input/input-support.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import NavTray from '/core/ui/navigation-tray/model-navigation-tray.js';

class XplPanel extends Panel {
  constructor(root) { super(root);
    this.inputContext = InputContext.Dual;             // map keeps receiving input
    this.animateInType = this.animateOutType = AnchorType.RelativeToLeft; }
  onEngineInput(e) {                                   // close on Esc / cancel / sys-menu, NOT on right mouse
    if (e.detail.status != InputActionStatuses.FINISH) return;
    const n = e.detail.name;
    if (n == "keyboard-escape" || n == "cancel" || n == "sys-menu") { this.close(); e.stopPropagation(); e.preventDefault(); }
  }
  // onAttach: listeners, tabs, subscribe(state); onDetach: overlay.clear() unless keepHighlights
}
Controls.define("xpl-panel", { createInstance: XplPanel, description: "Expansion Planner",
  styles: ["fs://game/expansion-planner/ui/panel/xpl-panel.css"],
  content: ["fs://game/expansion-planner/ui/panel/xpl-panel.html"],
  classNames: ["xpl-panel", "absolute", "pointer-events-none"] });  // inner .xpl-frame gets pointer-events-auto

export function togglePanel() {
  if (ContextManager.hasInstanceOf("xpl-panel")) ContextManager.pop("xpl-panel");
  else ContextManager.push("xpl-panel", { singleton: true });    // NO createMouseGuard
}
```
CSS anchor: `.xpl-panel{top:8.5rem;left:0.75rem;width:34rem;bottom:13rem}`. This sits below the yield banner and the dock, and above the minimap and unit panel. Fallback if pushing into `.fxs-popups` blocks input: create `div#target-slot-xpl-panel` inside `fxs-side-panel[name="sidepanel-left"]` (the `target-slot-<tag>` lookup at `context-manager.js:157`; slot list in `root-game.html:292-331`).

Dock decorator:
```js
class XplDock {
  constructor(p){ this.p = p; this.btn = null; }
  beforeAttach(){}
  afterAttach(){
    if (this.btn?.isConnected) return;
    this.btn = this.p.addButton({ tooltip:"LOC_XPL_OPEN", modifierClass:"xpl-planner", callback: togglePanel,
      class:"tut-xpl-planner", audio:"data-audio-press-small", focusedAudio:"data-audio-focus-small" });
  }
  beforeDetach(){}
  afterDetach(){}
}
Controls.loadStyle("fs://game/expansion-planner/ui/hud/xpl-dock.css");  // .ssb__button-icon.xpl-planner{background-image:url("fs://game/expansion-planner/ui/icons/xpl-dock.png");background-size:contain}
Controls.decorate("panel-sub-system-dock", p => new XplDock(p));
```

---

## 4. Settlement site scoring

### 4.1 Candidate generation
```js
function* generateCandidates(ctx) {                       // generator → time-sliced
  const own = ctx.player.settlements();                   // Players.get(local).Cities.getCities() (towns + cities)
  if (!own.length) return { empty: "NO_SETTLEMENTS" };
  const R = ctx.settings.radius;                          // default 8, range 3..15
  const minD = ctx.oracle.minSpacing();                   // getGlobalParamNumber("CITY_MIN_RANGE") → fallback 3; legal = range+1 (=4)
  const seen = new Set(), out = [];
  for (const s of own) for (const idx of GameplayMap.getPlotIndicesInRadius(s.x, s.y, R)) {
    if (seen.has(idx)) continue; seen.add(idx);
    const f = ctx.facts(idx);
    if (!f.known && !ctx.settings.includeHidden) { ctx.reject(idx, "HIDDEN"); continue; }
    if (f.isWater || f.isMountain || f.isNaturalWonder) { ctx.reject(idx, "TERRAIN"); continue; }
    if (f.owner !== -1) { ctx.reject(idx, "OWNED"); continue; }
    if (ctx.nearestCentreDist(idx) < minD + 1) { ctx.reject(idx, "SPACING"); continue; }  // known centres + planned tacks
    if (!ctx.oracle.isSettleable(idx)) { ctx.reject(idx, "CLAIM"); continue; }           // isValidLandClaimLocation({x,y}, true)
    out.push(idx);
    if (out.length % 25 === 0) yield out.length / seen.size;
  }
  return out;
}
```
Notes:
- **Origins.** Origins are all your settlements, as you specified. A later setting may add settler units as origins (the base AI lens does).
- **Revealed-only mode.** A hidden plot is never a candidate. Hidden tiles inside a candidate's rings become "unknown" (see `UNKNOWN_TILE_GUESS`) and are flagged "[!] N unexplored".
- **Known centres** = your settlements, foreign settlements whose centre plot is revealed (all of them in include-hidden mode), DMT city-centre tacks (`isCityCenter`), and picks already accepted during selection.
- **AI signal.** Call `player.AI.getBestSettleLocationsForSettler(3, origin)` once per own settlement, dedupe on `suggestion.location`, and drop hidden plots in revealed-only mode. Matching candidates get an `aiPick` flag, `+AI_PICK_BONUS` and the AI's localised factors in the tooltip.
- **Independents.** Find independent players with `Players.get(id)?.isIndependent` (used 47× in base UI). Their village plots come from their cities if exposed, otherwise from the nearest revealed plot they own (VERIFY). Apply a penalty at ≤3 tiles (instantly hostile) and at 4–6 tiles (relationship −1).

### 4.2 Per-tile model
- **Yields:** `GameplayMap.getYields(idx, localPlayerID)` returns `[[yieldType, amount]…]`, mapped into the 7-slot array (`yields-layer.js:112`). If that is unavailable, fall back to `TerrainBiomeFeature_YieldChanges` plus resource yields from the current age's terrain data.
- **Workability:** mountains are not worked; ocean is not worked in Antiquity (Drongo's rule; VERIFY); natural wonder yields count.
- **Production-tile classifier (Drongo-compatible):** vegetated feature class, hills, mine/quarry/clay resources and wet features. The sets are derived from `Constructible_ValidResources`/`District_FreeConstructibles` for `IMPROVEMENT_MINE(_RESOURCE)`, `QUARRY`, `CLAY_PIT(_RESOURCE)`, `CAMP`, `WOODCUTTER`.
- **Urbanizable:** land, not mountain or natural wonder, **no resource** (districts have `ResourceBlocks="true"`, `districts.xml:14-16`), and not owned by another player.

### 4.3 Constants (starting values, all in `core/constants.js`)
```js
RING_WEIGHT        = [1.0, 1.0, 0.75, 0.5];       // ring 0..3 (ring 1 at founding; 2–3 as it grows)
SHARE              = { OWN:     [0, 0.0, 0.40, 0.60],   // availability of a tile at distance d from another centre
                       FOREIGN: [0, 0.0, 0.20, 0.40],
                       PLANNED: [0, 0.0, 0.40, 0.50] };
ROOM_HARD_MIN      = { LOW: 24, MEDIUM: 18, HIGH: 12 };  // avail-weighted growable tiles in rings 1–3 (of 36); "Overlap tolerance"
RING1_MIN_FREE     = 4;                            // ring-1 tiles with avail ≥ 0.4
FOOD_GATE          = 12;                           // avail-weighted food in rings 1–2 (report 05)
FRESH_WATER        = 5;                            // happiness units (+5 Happiness, settler legend text)
COASTAL            = 3;                            // generic units (harbour/quay/lighthouse, coastal connection)
RESOURCE_BONUS     = 0.5;  NEW_RESOURCE_BONUS = 1.0;  LUXURY_BONUS = 0.5;   // RESOURCECLASS_EMPIRE
ADJ_TOP_K          = 4;                            // best urban tiles per family
ADJ_MULT_CITY      = 1.5;                          // 1 + expected specialist share (each specialist adds +100% adjacency)
UNKNOWN_TILE_GUESS = 0.5;                          // × avg known tile value, for unrevealed ring tiles
INDEPENDENT_PEN    = { le3: 15, le6: 4 };          // score points subtracted from the final 0–100 score
AI_PICK_BONUS      = 3;                            // score points added to the final 0–100 score
SCORE_REF          = { tiles: 50, adj: 10, prod: 16 };   // "good" reference ≈ AI PlotEvalConditions Total Yield good=50, inner ring good=26
SCORE_SCALE        = 80;                           // comps==ref → 80/100
TIERS              = { EXCELLENT: 85, GOOD: 70, FAIR: 55 };
```

### 4.4 Priority profiles
Each yield vector is **normalised to mean 1.0** (Σ = 7) before use, so profiles are comparable. Term weights stay as listed.

| Profile | F | P | G | S | C | H | I (Influence) | w.tiles | w.adj | w.prod |
|---|---|---|---|---|---|---|---|---|---|---|
| Balance | 1.0 | 1.2 | 0.8 | 0.9 | 0.8 | 0.8 | 0.5 | 1.0 | 0.6 | 0.6 |
| Production | 0.8 | 2.0 | 0.5 | 0.5 | 0.5 | 0.6 | 0.3 | 0.8 | 0.4 | 1.4 |
| Science | 0.9 | 1.0 | 0.5 | 2.0 | 0.6 | 0.7 | 0.4 | 0.8 | 1.0 | 0.5 |
| Gold | 0.9 | 1.0 | 2.0 | 0.5 | 0.5 | 0.7 | 0.5 | 0.8 | 1.0 | 0.5 |
| Culture | 0.9 | 1.0 | 0.5 | 0.6 | 2.0 | 0.8 | 0.6 | 0.8 | 1.0 | 0.5 |
| Food | 2.0 | 1.0 | 0.6 | 0.5 | 0.5 | 0.8 | 0.4 | 1.2 | 0.4 | 0.4 |
| Happiness | 0.9 | 1.0 | 0.6 | 0.5 | 0.6 | 2.0 | 0.4 | 0.8 | 1.0 | 0.5 |

`w.prod ≥ 0.4` in every profile, because you want towns that can become **productive cities**.

### 4.5 Scoring pseudo-code
```js
function availability(f, c, ctx) {                 // 0..1: how much of tile f this site can expect to own
  if (f.owner !== -1) return 0;                    // owned by anyone (incl. our existing settlements)
  let a = 1;
  for (const s of ctx.centresWithin(f.idx, 3)) {   // spatial hash of known + planned centres
    if (s.idx === c.idx) continue;
    const d = GameplayMap.getPlotDistance(f.x, f.y, s.x, s.y);
    a = Math.min(a, SHARE[s.kind][d]);             // kind: OWN | FOREIGN | PLANNED
  }
  return a;
}

function scoreSite(c, ctx) {
  const P = ctx.profile, R = [];
  let tileVal=0, food12=0, prodPot=0, room=0, ring1=0, unknown=0, overlap=0, prodTiles=0, prodRes=0;
  for (const { idx, ring } of ctx.rings(c.idx)) {             // 37 plots, ring 0..3 (cached)
    const f = ctx.facts(idx);
    if (!f.known) { unknown++; continue; }
    const a = ring === 0 ? 1 : availability(f, c, ctx);
    if (ring >= 1) {
      if (f.growable) room += a;                               // land non-mountain, coast/lake, ocean after Antiquity
      if (a < 1) overlap++;
      if (ring === 1 && a >= 0.4) ring1++;
    }
    const v = (ring === 0 || f.workable) ? dot(P.y, f.yields) + resourceBonus(f, ctx) : 0;
    tileVal += RING_WEIGHT[ring] * a * v;
    if (ring <= 2) food12 += a * f.yields[F];
    prodPot += RING_WEIGHT[ring] * a * (f.yields[P_] + (f.prodTile ? 0.5 : 0));
    if (f.prodTile) prodTiles += a; if (f.prodResource) prodRes += a;
  }
  if (room < ROOM_HARD_MIN[ctx.settings.overlapTol]) return reject(c, "ROOM", room);
  if (ring1 < RING1_MIN_FREE)                          return reject(c, "RING1", ring1);

  tileVal += unknown * UNKNOWN_TILE_GUESS * ctx.avgKnownTileValue;
  let bonus = 0;
  if (c.freshWater) { bonus += FRESH_WATER * P.y[H]; R.push(r("+","FRESH_WATER")); }
  if (c.coastal)    { bonus += COASTAL;              R.push(r("+","COASTAL")); }

  const adj = adjacencyPotential(c, ctx);              // §4.6
  prodPot += 0.5 * adj.byFamily.PRODUCTION;

  let pen = 0;
  if (food12 < FOOD_GATE) { pen += (FOOD_GATE - food12) * P.y[F]; R.push(r("-","LOW_FOOD", food12)); }
  const indPen = independentPenalty(c, ctx);           // in score points

  const comps = { tiles: tileVal/SCORE_REF.tiles, adj: adj.total/SCORE_REF.adj, prod: prodPot/SCORE_REF.prod,
                  bonus: bonus/SCORE_REF.tiles, pen: pen/SCORE_REF.tiles };
  const raw = (P.w.tiles*comps.tiles + P.w.adj*comps.adj + P.w.prod*comps.prod) / (P.w.tiles+P.w.adj+P.w.prod)
              + comps.bonus - comps.pen;
  const score = clamp(Math.round(SCORE_SCALE*raw) - indPen + (c.aiPick ? AI_PICK_BONUS : 0), 0, 100);
  return { score, tier: tierOf(score), comps, prodPot, food12, roomTiles: room, overlapTiles: overlap,
           unknownTiles: unknown, drongoScore: Math.min(99, 3*prodTiles + 5*prodRes),
           reasons: explain(R, comps, adj, overlap, unknown, ctx) };
}
```

### 4.6 Future adjacency potential of a site
```js
function adjacencyPotential(c, ctx) {
  const core = ctx.ringsUpTo(c.idx, 2).filter(i => ctx.facts(i).known && ctx.facts(i).urbanizable);
  const byFamily = {}; let total = 0;
  for (const fam of ctx.rules.families) {                 // SCIENCE, PRODUCTION, GOLD, FOOD, CULTURE, HAPPINESS
    const rep = fam.representative;                       // current-age common building of that family (e.g. Library)
    const vals = core.map(u => ctx.adj.buildingAdjacency(rep, u, ctx.worldState, { excludeRuleIds: fam.wonderRuleIds }).total);
    byFamily[fam.key] = sumTopK(vals, ADJ_TOP_K);
    total += ctx.profile.yNorm[fam.yield] * byFamily[fam.key] * ADJ_MULT_CITY / ADJ_TOP_K;
  }
  return { byFamily, total };
}
```
The wonder rule is excluded because it is not a property of the site. A reason string is emitted for the profile's top family, e.g. "Science adjacency: best tiles +3, +3, +2, +2 (resources)".

### 4.7 Selection, diversity, ties, explanations
```js
function selectSites(cands, ctx, N) {                       // lazy-greedy with re-scoring against accepted picks
  const heap = new MaxHeap(cands.filter(c => !c.rejected), cmp);
  const picks = [];
  while (picks.length < N && heap.size) {
    const top = heap.pop();
    if (picks.some(p => GameplayMap.getPlotDistance(p.x,p.y,top.x,top.y) < ctx.minPickDist)) continue;   // = CITY_MIN_RANGE+1 (4); "Spread" option: 5
    const fresh = scoreSite(top, ctx.withPlanned(picks));   // picks count as PLANNED centres → overlap shares
    if (fresh.rejected) continue;
    if (heap.size && fresh.score < heap.peek().score) { Object.assign(top, fresh); heap.push(top); continue; }
    picks.push(Object.assign(top, fresh, { rank: picks.length + 1 }));
  }
  return picks;
}
// cmp: score desc → prodPot desc → overlapTiles asc → distance to nearest own settlement asc → plot index asc (deterministic)
```
- **Explanations:** the top 3 positive and top 2 negative reasons, by absolute contribution. Examples: "+ Fresh water", "+ 11 production tiles (hills, forest, mines)", "+ Gold adjacency: coast and river", "− 7 tiles shared with Rome", "− Low food (9 < 12)", "! 6 unexplored tiles", "AI recommended (Fresh water, New resources)", "− 3 tiles from an Independent (turns hostile)".
- **Heat map (optional):** every non-rejected candidate is filled by tier bucket. The debug view adds rejected candidates coloured by reason (HIDDEN, TERRAIN, OWNED, SPACING, CLAIM, ROOM, RING1).

---

## 5. Town→city advisor

### 5.1 Inputs (engine first, all verified in base UI)
| Input | Source |
|---|---|
| Upgrade cost | `city.Gold.getTownUpgradeCost()` (`panel-production-chooser.js:205`) |
| Can convert + reasons | `Game.CityCommands.canStart(id, CityCommandTypes.PURCHASE, {Directive: OrderTypes.ORDER_TOWN_UPGRADE}, false)` → `.Success`, `.FailureReasons` (`production-chooser-operations.js:27-34`) |
| City limit | `player.Stats.numCities` vs `player.Cities.getCityLimit()`, where 0 = no limit (`panel-production-chooser.js:961-971`); event `PlayerCityLimitChanged` |
| Town production (currently turned into gold 1:1) | `city.Yields.getYield(YieldTypes.YIELD_PRODUCTION)`; VERIFY against `getNetYield` for towns |
| Production potential at full growth | Top `(pop+3)` production values among owned plus claimable tiles (claimable = `availability ≥ 0.4`) + building production |
| Production-to-gold value ratio R | Median over buildable buildings in an existing city of `city.Gold.getBuildingPurchaseCost(YIELD_GOLD, t) / city.Production.getConstructibleProductionCost(t)`; fallback 2.0 (VERIFY) |
| Empire tax | +10% cost on non-warehouse buildings in every city per extra city (Civilopedia, report 05) |
| Age timing | `Game.AgeProgressManager.getCurrentAgeProgressionPoints()` / `getMaxAgeProgressionPoints()`, `isFinalAge`. The rate is learned from samples stored per turn in our Catalog |
| Focus | `city.Growth.growthType == GrowthTypes.PROJECT` / `projectType`; lost on conversion |
| Data reference | `TOWN_UPGRADE_BASE/PER_CITY/MAXIMUM`: Exploration 700/700/3000, Modern 800/1000/5000 (`age-*/data/gameplay-systems.xml`). The Antiquity values are compiled in, so display only the engine's cost |

### 5.2 Heuristic
```js
const PROD_MIN_NOW = { AGE_ANTIQUITY: 6,  AGE_EXPLORATION: 12, AGE_MODERN: 18 };
const PROD_MIN_POT = { AGE_ANTIQUITY: 12, AGE_EXPLORATION: 20, AGE_MODERN: 28 };
const PAYBACK_FRAC = 0.4, LATE_AGE_FRAC = 0.80, HORIZON = 40, BUILD_SHARE = 0.6, FOCUS_LOSS = 0.15;

function adviseTown(t, ctx) {
  const R = [], age = ctx.age;
  const cap = ctx.cityLimit > 0 && ctx.numCities >= ctx.cityLimit;
  const can = ctx.canConvert(t.id);
  if (cap)          return verdict("BLOCKED", r("-","CITY_LIMIT", ctx.numCities, ctx.cityLimit));
  if (!can.Success) return verdict("BLOCKED", ...can.FailureReasons.map(s => r("-","ENGINE", s)));

  const tax  = 0.10 * BUILD_SHARE * ctx.sumCityProduction;              // production lost across empire per turn
  const lost = (t.hasFocus ? FOCUS_LOSS * t.totalYieldValue : 0);       // focus + growth bonus, value units
  const gain = (ctx.R - 1) * t.prodNow - tax - lost;                    // value per turn (gold-equivalent)
  const ageFrac  = ctx.agePoints / ctx.ageMax;
  const ageLeft  = ctx.isFinalAge || ctx.settings.expectKeepCities ? Infinity : ctx.estimateAgeTurnsLeft();
  const payback  = gain > 0 ? t.cost / gain : Infinity;
  const value    = gain * Math.min(ageLeft, HORIZON) - t.cost;

  if (t.prodPot < PROD_MIN_POT[age]) return verdict("KEEP", r("-","PROD_POT_LOW", t.prodPot, PROD_MIN_POT[age]),
                                                   t.foodSurplusHigh ? r("+","FEEDER") : null);
  if (!ctx.isFinalAge && ageFrac > LATE_AGE_FRAC) return verdict("KEEP", r("-","LATE_AGE", Math.round(ageFrac*100)));
  if (t.prodNow < PROD_MIN_NOW[age] || (t.pop < 7 && t.costFallsWithPop))
    return verdict("WAIT", r("!","GROW_FIRST", t.prodNow, PROD_MIN_NOW[age]), t.costFallsWithPop ? r("+","COST_DROPS") : null);
  if (payback <= PAYBACK_FRAC * ageLeft && value > 0) return verdict("CONVERT", r("+","PAYBACK", Math.ceil(payback)), r("+","PROD_GAIN", t.prodNow));
  return verdict("CONSIDER", r("!","PAYBACK_SLOW", Math.ceil(payback)));
  // Always appended: "uses last city slot" if numCities+1 == limit; "city:town ratio above 1:1" (pedia tip) if cities > towns after conversion;
  // "loses <focus name>" if focus; "reverts to town at age end" in non-final ages.
}
```
- **Ordering:** towns are sorted by verdict (CONVERT > CONSIDER > WAIT > KEEP > BLOCKED), then by `value` descending.
- **Cost trend:** `costFallsWithPop` is learned by sampling `getTownUpgradeCost()` per turn alongside population in our Catalog.
- **Header:** "Cities 2/3 · Settlements 5/6 · Age 63%".

---

## 6. Building placement (adjacency) solver

### 6.1 Which buildings
- **"Common" (default ticked)** is derived from data, not a hard-coded list. A building qualifies when all of these hold:
  - `ConstructibleClass=BUILDING`;
  - `Age == current age`, or tagged `AGELESS`;
  - no `Buildings.TraitType` (civ-unique buildings are opt-in);
  - not `ExistingDistrictOnly` (walls), not `MultiplePerCity` (bridges), and `CityCenterPriority` is not > 0 (Palace, City Hall);
  - it has at least one `Constructible_Adjacencies` row other than the `Wonder*` rule.
  
  In Antiquity this gives Library, Academy, Monument, Amphitheater, Market, Lighthouse, Garden, Bath, Barracks, Blacksmith, Arena and Villa. Altar is offered unticked (Wonder rule only unless activated).
- **Other groups:**
  - Warehouses (`WAREHOUSE` tag): an optional "filler" group.
  - Uniques: opt-in. A unique-quarter pair is planned on one tile as a pair.
  - `FULL_TILE` buildings (Modern Rail Station, etc.): use 2 slots.
  - Wonders: phase 2.
- **Buildability:**
  - Cities: `Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible)`.
  - Towns: `Game.CityCommands.canStartQuery(city.id, CityCommandTypes.PURCHASE, CityQueryType.Constructible)` (the production chooser's split, `production-chooser-helpers.js:509-512`).
  - Keep `Success || InsufficientFunds`. Show locked items greyed (`NeededUnlock != -1`) with a "Plan anyway" checkbox. Already built (`AlreadyExists`) means "existing".
- **Planned settlements:** the union of the buildable lists over your cities is the unlock proxy.
- **Your selection:** checkboxes grouped by family (Science, Production, Gold, Food, Culture, Happiness, Warehouses, Unique). There are presets: "Common", "Profile family only" and "None".

### 6.2 Targets
- **Existing city or town.** Candidate tiles are:
  - existing urban tiles with a free slot;
  - the engine's valid plots (`canStart(...).Plots ∪ ExpandUrbanPlots` per building);
  - optional **future tiles**: owned or claimable (`availability ≥ 0.4`), within radius 3, urbanizable. These are JS-only and badged "future".
- **Planned settlement** (a DMT city-centre tack, or a pick from the Settlements tab). The layout is hypothetical, JS-only, on urbanizable tiles in rings 1–2. The centre has City Hall and 1 free slot.

### 6.3 Model (PlanState)
- **Slots:** `Districts.MaxConstructibles` from GameInfo (URBAN 2, CITY_CENTER 2, WONDER 1; `districts.xml:14-18`). Palace and City Hall occupy a centre slot, as DMT counts them (`dmt-map-tack-validator.js:118-141`); VERIFY. `IGNORE_DISTRICT_PLACEMENT_CAP` items are slotless. `FULL_TILE` items and wonders need the whole tile.
- **Existing buildings:**
  - Current-age and ageless buildings occupy slots and give or receive adjacency.
  - **Obsolete** buildings (previous age, not ageless) give no adjacency and do not form quarters (Civilopedia l.841). Their slot is "overbuildable", at the cost of their base yield (`OverwritePreviousAge=true`).
- **Tacks:** your (non-XPL) DMT tacks are treated as virtual buildings when "Respect existing tacks" is on (the default). Our own earlier tacks are replaced when re-planning.
- **Tile blockers:** resources (ResourceBlocks), natural wonders, mountains (unless a rule allows), foreign ownership.
- **Placement validity (JS):** `Constructible_ValidDistricts`, `ValidTerrains` (e.g. Lighthouse on `TERRAIN_COAST`, a water urban tile), `RiverPlacement` (OFF_COAST / ANCHORED / RIVER), `Constructibles.AdjacentRiver/AdjacentLake/AdjacentTerrain/NoRiver/NoFeature`, `RequiresHomeland/DistantLands` (`player.isDistantLands`). For tiles the engine reports on, the **engine is authoritative**.
- **Rural→urban loss:** subtract the tile's current rural yield × `RURAL_LOSS = 1.0` until verified (the engine's `yieldChanges` will tell us).
- **Objective:**
  ```
  OBJ(S) = Σ_buildings W·(base + adjIn)                      // adjacency via core/adjacency-rules (incl. AdjacentQuarter, AdjacentConstructible*, AdjacentDistrict)
         + SPEC · Σ_{top-k tiles by tileAdj} W·tileAdj        // specialists: +100% of all buildings' adjacency on that tile; k = expectedSpecialists
         − Σ W·ruralLoss − Σ W·overbuildLoss
  SPEC = 1 (cities), 0 (towns: no specialists); expectedSpecialists = round(settings.specialists × #urbanTiles), default 0.5
  ```
  W is the profile's yield vector. Quarter formation (2 current-age or ageless buildings) is evaluated in the hypothetical state, so `AdjacentQuarter` rules (Palace +1 Science/+1 Culture, uniques, activated rules) respond. The specialist term naturally rewards **pairing two buildings of the same family on one high-adjacency tile** (the Civilopedia tip, l.814).

### 6.4 Rule engine (core/adjacency-rules.js)
- **Loaded per age:**
  - `Constructible_Adjacencies` (with `RequiresActivation`);
  - `Adjacency_YieldChanges` (all selector columns; **throw** on unknown `Adjacent*` columns to catch schema drift);
  - `Constructible_WildcardAdjacencies`;
  - `ExcludedAdjacencies` (filtered by the local player's traits);
  - `Constructible_YieldChanges`;
  - `TypeTags`.
- **Activation:** use `city.Constructibles.isAdjacencyUnlocked(id)` (`constructible-details.js:216`). For planned sites, use your capital as a proxy (VERIFY that it is player-wide).
- **Counting:** `count` = matching neighbours (6, deduped for wrap); constructible selectors count each matching building, so 2 per tile. `amount = floor(count / TilesRequired) × YieldChange`. Apply age gating as DMT does (current-age or AGELESS links only; the `Age` column).
- **Appeal thresholds:** `getGlobalParamNumber("APPEAL_FOR_HAPPINESS_TILE_YIELD" / "APPEAL_FOR_DOUBLE_HAPPINESS_TILE_YIELD")`.

### 6.5 Solver pseudo-code
```js
function planTarget(target, selection, ctx) {
  const S = PlanState.from(target, ctx);                      // tiles, slots, existing, respected tacks, validity cache
  const items = selection.filter(b => !S.built(b) && ctx.buildable(target, b) && !isWarehouse(b))
                         .map(b => ({ b, ub: S.upperBound(b) })).sort((a,z) => z.ub - a.ub);   // anchors first
  // 1) greedy with incremental re-scoring
  while (items.length) {
    let best = null;
    for (const it of items) for (const t of S.candidates(it.b)) {
      if (!S.freeSlot(t, it.b) || !S.valid(it.b, t)) continue;
      const g = S.delta(it.b, t);         // recompute adjacency of buildings on {t} ∪ N(t) before/after + specialist term + losses
      if (!best || g > best.g || (g === best.g && t < best.t)) best = { it, t, g };
    }
    if (!best || best.g <= 0 && !ctx.settings.placeEvenIfNegative) break;
    S.apply(best.it.b, best.t); items.splice(items.indexOf(best.it), 1);
  }
  // 2) local search: relocate one / swap two planned buildings; first-improvement; ≤200 iters or 25 ms
  for (let it = 0, improved = true; improved && it < 200 && !budgetExceeded(); it++) {
    improved = tryRelocations(S) || trySwaps(S);
  }
  // 3) warehouses as filler: lowest-tileAdj free slots (never a top-K adjacency tile); only placement constraints matter
  fillWarehouses(S, selection.filter(isWarehouse));
  // 4) unplaced → reasons (no valid tile, no free slot, locked)
  // 5) engine cross-check (debug) and "engine-verified" badge for the FIRST placement of each building on engine-reachable tiles
  return S.result();
}
```
- **Complexity:** about 12 buildings × 37 tiles × (7 tiles × 2 buildings × ~3 rules), roughly 20k rule evaluations per greedy pass. Target **< 50 ms per city**.
- **Engine vs JS:**
  - For **existing cities**, call `city.Yields.calculateAllBuildingsPlacements()` **directly**, never through the `BuildingPlacementManager` singleton (it is shared with the base UI, `building-placement-manager.js:935`). Do it once per city per invalidation.
  - The "next build" recommendation per city shows the engine total (computed like `GetCurrentBestTotalYieldForConstructible`, including maintenance and overbuild) when its plot is in the engine set.
- **Cross-check (debug):** for each `(building, plot)` in the engine data, compare the sum of `changeDetails` with `sourceType == YieldSourceTypes.ADJACENCY && targetPlotIndex == plotID` against the JS single-building adjacency on the current world state. Log mismatches > 0.01 with plot, building and rule IDs. Show the count in the debug section. Optionally, at L2, also compare with DMT's `MapTackYield.getYieldDetails`.

---

## 7. UI specification

### 7.1 Layout (left side panel, non-modal)
```
┌ Expansion Planner ───────────── Priority [Balance ▾] [x] ┐
│ [Settlements] [Buildings] [Towns] [Wonders (P2)]          │
├───────────────────────────────────────────────────────────┤
│ (tab controls)                                            │
├───────────────────────────────────────────────────────────┤
│ (sortable results list, fxs-scrollable, keyed rows)       │
├───────────────────────────────────────────────────────────┤
│ [Select all] [Place tacks (3)] [Clear my tacks]           │
│ status: 214 scanned · 37 valid · 8 shown · 41 ms          │
└───────────────────────────────────────────────────────────┘
```
**Components:** `fxs-tab-bar` (`tab-items`, event `tab-selected`), `fxs-dropdown` (set `dropdown-items` **before** `selected-item-index`; event `dropdown-selection-change`), `fxs-slider` (`min`/`max`/`steps`; `component-value-changed`), `fxs-checkbox`, `fxs-button`, `fxs-close-button`, `fxs-scrollable`. Text uses `data-l10n-id`/`Locale.compose`; icons use `[icon:YIELD_X]` or `UI.getIconBLP`.

### 7.2 Settlements tab
- **Controls:**
  - Radius slider 3–15 (default 8, "8 tiles from any settlement");
  - Top-N 3–15 (default 8);
  - "Include unexplored tiles" (default **off**, tooltip "Uses information you have not discovered");
  - Overlap tolerance Low/Medium/High (default Medium);
  - "Spread picks" (min distance 5 instead of 4);
  - "Show heat map";
  - "Use AI suggestions" (default on);
  - "Keep highlights after closing" (default off).
- **Columns:** ☐ · # · Score (tier colour) · Where ("6 NE of Rome") · F P G S C H (ring-weighted potential) · Prod-pot · Room % · Tags `[FW]` fresh water, `[Coast]`, `[AI]`, `[!N]` unexplored, `[Ind]` near an independent. Sorting by Score, Prod, Food, Room or Distance (header click).
- **Row interaction:**
  - Click: `Camera.lookAtPlot`, set as the selected site (border overlay of the radius-3 footprint, coloured by availability), expand the reasons.
  - Hover: a temporary footprint fill.
  - Checkbox: marks the row for tacks.
- **Map:** every pick gets a centre fill (tier colour) and a rank label (`createSpriteGrid(...).addText`). The heat map is optional.

### 7.3 Buildings tab
- **Controls:**
  - Target dropdown: cities, towns, planned sites (DMT city-centre tacks plus Settlements picks).
  - Building checklist grouped by family, with presets.
  - Toggles: "Use engine numbers where available" (on), "Respect existing tacks" (on), "Include future tiles" (on), "Expected specialists per urban tile" (0 / 0.5 / 1; default 0.5).
- **Results:** one row per placement: icon · building · tile (direction/distance from centre) · gain `+5 [icon:YIELD_SCIENCE]` (base 3 + adj 2, +spec) · badges `[engine]`, `[future]`, `[overbuild]`, `[quarter]` · checkbox. Unplaced items are listed with reasons. On the map, building icons and `+N` labels appear on planned tiles.

### 7.4 Towns tab
A header line (cities/limit, settlements/cap, age %), then one row per town: name · pop · production now → potential · cost · payback · verdict badge · expandable reasons. Clicking a row pans to the town.

### 7.5 Empty states and errors
| Situation | Message key |
|---|---|
| No settlements | `LOC_XPL_EMPTY_NO_SETTLEMENTS` |
| No valid sites | `LOC_XPL_EMPTY_NO_SITES` ("increase the radius, raise overlap tolerance, or include unexplored tiles") |
| Computing | `LOC_XPL_COMPUTING` with % and a cancel link |
| DMT missing | Place/Clear disabled, tooltip `LOC_XPL_DMT_MISSING_TT` |
| Network multiplayer | Place disabled until verified (`Configuration.getGame().isNetworkMultiplayer`), tooltip `LOC_XPL_MP_DISABLED_TT` |
| Exception | Row `LOC_XPL_ERROR` + `log.error` with stack; the panel stays usable |
| All selected buildings built | `LOC_XPL_EMPTY_ALL_BUILT` |

### 7.6 Settings persistence
- **Primary:** a single JSON object in `localStorage["modSettings"]["expansion-planner"]`. Read-modify-write; **never** add another key and **never** call `clear()`.
- **Backup for scalars:** `UI.setOption("user","Mod","expansion-planner.<key>", v)` + `Configuration.getUser().saveCheckpoint()`, the bz pattern (`3507102289/ui/options/mod-options.js:23-35`). Other mods' `localStorage.clear()` can wipe our JSON, so on load we prefer the JSON and fall back to the UI options, then to defaults.
- **Schema:**
```json
{ "v":1, "profile":"BALANCE", "radius":8, "topN":8, "includeHidden":false, "overlapTol":"MEDIUM",
  "spread":false, "heatmap":false, "useAI":true, "keepHighlights":false, "replacePrevious":true,
  "buildings":{"selected":["BUILDING_LIBRARY","..."],"respectTacks":true,"useEngine":true,"futureTiles":true,"specialists":0.5},
  "towns":{"expectKeepCities":false}, "wonders":{"omniscient":false}, "debug":false }
```

### 7.7 Localisation keys (en_US first; other locales later via `<Item locale="xx_XX">`)
- **Mod:** `LOC_MOD_XPL_NAME`, `LOC_MOD_XPL_DESCRIPTION`, `LOC_XPL_OPEN`, `LOC_XPL_OPEN_DESC` (the input action strings also go in shell scope), `LOC_XPL_TITLE`.
- **Tabs and profiles:** `LOC_XPL_TAB_SETTLEMENTS|BUILDINGS|TOWNS|WONDERS`, `LOC_XPL_PRIORITY`, `LOC_XPL_PROFILE_BALANCE|PRODUCTION|SCIENCE|GOLD|CULTURE|FOOD|HAPPINESS`.
- **Settlements controls:** `LOC_XPL_RADIUS` ("{1_N} tiles from any settlement"), `LOC_XPL_TOPN`, `LOC_XPL_INCLUDE_HIDDEN`, `LOC_XPL_INCLUDE_HIDDEN_TT`, `LOC_XPL_OVERLAP`, `LOC_XPL_OVERLAP_LOW|MEDIUM|HIGH`, `LOC_XPL_SPREAD`, `LOC_XPL_HEATMAP`, `LOC_XPL_USE_AI`, `LOC_XPL_KEEP_HIGHLIGHTS`.
- **Columns:** `LOC_XPL_COL_SCORE|WHERE|PROD|ROOM|TAGS|GAIN|COST|PAYBACK|VERDICT`, `LOC_XPL_WHERE` ("{1_N} {2_Dir} of {3_Name}"), `LOC_XPL_DIR_N|NE|E|SE|S|SW|W|NW`, `LOC_XPL_TIER_EXCELLENT|GOOD|FAIR|POOR`.
- **Actions and states:** `LOC_XPL_SELECT_ALL`, `LOC_XPL_PLACE_TACKS` ("Place tacks ({1_N})"), `LOC_XPL_CLEAR_TACKS`, `LOC_XPL_DMT_MISSING_TT`, `LOC_XPL_MP_DISABLED_TT`, `LOC_XPL_TACKS_PLACED` ("{1_N} placed, {2_M} skipped"), `LOC_XPL_EMPTY_*`, `LOC_XPL_COMPUTING`, `LOC_XPL_ERROR`.
- **Site reasons:** `LOC_XPL_R_FRESH_WATER|COASTAL|PROD_TILES|ADJ_FAMILY|NEW_RESOURCE|LUXURY|AI_PICK|OVERLAP|LOW_FOOD|UNEXPLORED|NEAR_INDEPENDENT|ROOM|RING1`.
- **Town verdicts and reasons:** `LOC_XPL_TOWN_CONVERT|CONSIDER|WAIT|KEEP|BLOCKED`, `LOC_XPL_TOWN_R_CITY_LIMIT|ENGINE|PROD_POT_LOW|FEEDER|LATE_AGE|GROW_FIRST|COST_DROPS|PAYBACK|PAYBACK_SLOW|PROD_GAIN|FOCUS_LOSS|RATIO|REVERTS|LAST_SLOT`.
- **Buildings:** `LOC_XPL_TARGET`, `LOC_XPL_FAMILY_SCIENCE|…|WAREHOUSE|UNIQUE`, `LOC_XPL_PRESET_COMMON|PROFILE|NONE`, `LOC_XPL_USE_ENGINE`, `LOC_XPL_RESPECT_TACKS`, `LOC_XPL_FUTURE_TILES`, `LOC_XPL_SPECIALISTS`, `LOC_XPL_BADGE_ENGINE|FUTURE|OVERBUILD|QUARTER`, `LOC_XPL_UNPLACED_*`.
- **Debug:** `LOC_XPL_DEBUG`.

---

## 8. DMT bridge

### 8.1 Status levels
| Level | Condition | Reads | Writes | Validation |
|---|---|---|---|---|
| L0 absent | `__XPL_DMT_ACTIVE` not set | — | disabled | — |
| L1 events | flag set | `GameTutorial` keys exactly as Drongo does: `Database.makeHash("_DMT_OBJ_MAP_TACK_KEYS")` → "x-y,…"; per key `_DMT_OBJ_MAP_TACK_<x>-<y>` → JSON array. Mirror updated from `MapTackUIUpdated` payloads | events | Our additive checks + our JS placement rules |
| L2 shared | L1 + `import('/detailed-map-tacks/ui/map-tack-core/dmt-map-tack-store.js' …)` succeeds **and** the identity probe passes | `Store.retrieveMapTacks`, `Utils.getCityCenterMapTackPlots` | events | + `Validator.isValid(x,y,type)` with the `validOwner` mimic (DMT's own rule: `owner == -1 ? localPlayerID : owner`, `dmt-interface-mode-place-map-tacks.js:125-127`; restore afterwards) |

**Identity probe.** After our first successful `AddMapTackRequest`, check that `Store.retrieveMapTacks(x,y)` contains the tack. If not, the import produced a separate instance: fall back to L1 and log it. Import paths are absolute `/detailed-map-tacks/...`, the same convention bz uses for its own UIScript modules. No DMT module imports the change processor, so even a duplicate instance cannot double-register handlers.

### 8.2 Readiness (overwrite hazard)
Writes are allowed only when **all** of these hold:
- `Loading.runWhenLoaded` has fired, plus one frame;
- DMT's `MapTackLoadedFromStore` has been seen, **or** the L1 GameTutorial mirror has been built. In L1, before writing, re-read the target plot's list from GameTutorial and compare it with DMT's last `MapTackUIUpdated` for that plot. If unknown, wait one more frame.

### 8.3 Payload and pre-checks
```js
async function place(entries, src) {             // entries: [{x,y,type}]
  if (!ready() || isNetworkMP()) return report("NOT_READY");
  if (settings.replacePrevious) await clearMine(src);
  const out = { placed: [], skipped: [] };
  for (const batch of chunk(entries, 3)) {       // ≤3 per frame (each add makes DMT recompute 7 plots)
    for (const e of batch) {
      const live = readPlot(e.x, e.y);           // L1: GameTutorial; L2: Store
      const def  = GameInfo.Constructibles.lookup(e.type);
      if (!def)                                       { out.skipped.push([e,"UNKNOWN_TYPE"]); continue; }
      if (live.some(t => t.type === e.type))          { out.skipped.push([e,"ALREADY_TACKED"]); continue; }   // never adopt user tacks
      const slotTypes = live.filter(t => !isSlotless(t.type));
      if (slotTypes.length >= 2)                      { out.skipped.push([e,"PLOT_FULL"]); continue; }
      if (slotTypes.length && (isFullTile(e.type) || slotTypes.some(t => isFullTile(t.type)))) { out.skipped.push([e,"FULL_TILE"]); continue; }
      if (L2) { const v = dmtValidate(e); if (v.preventPlacement) { out.skipped.push([e, v.reasons]); continue; } }
      engine.trigger("AddMapTackRequest", { x:e.x, y:e.y, type:e.type, classType:def.ConstructibleClass,
          validStatus:{ isValid:true, preventPlacement:false, reasons:[] },   // MUST be an object; DMT recomputes
          yieldDetails:{} });
      registry.add({ ...e, src, pid: GameContext.localPlayerID, turn: Game.turn });
      out.placed.push(e);
    }
    await nextFrame();
  }
  return out;
}
// Settlement sites: type "BUILDING_CITY_HALL" (DMT treats CityCenterPriority>0 as a city centre and draws radius-3 overlap overlays).
// Buildings: exact types (e.g. "BUILDING_LIBRARY"); DMT then shows per-tack yields incl. tacked neighbours, a free visual cross-check.
```
- **Removing:** `engine.trigger("RemoveMapTackRequest", {x, y, type})`. DMT removes the first tack of that type on the plot; duplicates are impossible because we never add a duplicate type.
- **Clear my tacks:** for every registry entry (optionally filtered by `src`, `settle` or `build`, and by `pid` for hotseat) that still exists in DMT, remove it; then empty the registry.

### 8.4 Registry and reconcile
- **Storage:** `new Catalog({ name: "XPL", version: 1 })` from `/core/ui/utilities/utility-serialize.js`, with **no player**. That means GameTutorial, immediate writes, saved in the save file, and the same lifetime as DMT's tacks. Object `TACKS`, key `list` holds JSON `[{x,y,type,src,pid,turn}]`.
- **Reconcile:** run on load (after readiness) and on every `MapTackUIUpdated`. Drop entries whose (x, y, type) is no longer in DMT, for example because you deleted it or DMT auto-removed a fulfilled tack on `ConstructibleAddedToMap` with a matching type (`change-processor.js:48-60`).
- **Founding on a settlement tack:** DMT should clear the tack if the new centre's constructible is `BUILDING_CITY_HALL` (VERIFY). On `CityInitialized` at a registry plot we also remove our tack.
- **Age transition:** tacks and the registry are expected to be wiped together (GameTutorial, per the DMT author). Recommendations are recomputable at any time.

---

## 9. Performance

### 9.1 Budgets
| Job | Target |
|---|---|
| Scheduler slice | **6 ms per frame** (`requestAnimationFrame` + `performance.now()`, the trade-layer pattern `trade-layer.js:24-53`) |
| Settlement scan, Standard map, R=8, ≤10 settlements | ≤ 250 ms total CPU, results in ≤ 1 s |
| Settlement scan, Huge map, R=15 | ≤ 1.5 s total CPU; candidate cap 4,000 (beyond that, reduce R automatically and show a notice) |
| `isValidLandClaimLocation` | called only after cheap pre-filters (≤ ~3,000 calls; the base settler lens calls it W×H times) |
| Building plan per city | ≤ 50 ms (greedy) + ≤ 25 ms local search |
| `calculateAllBuildingsPlacements` | once per city per invalidation; measure in M4; skip in non-debug mode if > 30 ms and the city is unchanged |
| Town advisor | ≤ 5 ms total |
| Panel render | keyed row reuse; ≤ 4 ms per update |

### 9.2 Caches
- **Map facts:** typed arrays sized W×H. They hold `Float32Array(7×N)` yields, `Uint32` flags, `Int16` owner, `Int32Array(6×N)` neighbour indices (lazy), and per-candidate ring lists `Int32Array(37)` in an LRU of 5,000 entries. Each entry carries a version counter.
- **Rules:** built once per `Game.age`.
- **Spatial hash** of centres (bucket of 4×4 plots) for `centresWithin`.
- **Results:** keyed by `(settingsHash, mapVersion, playerID)`.

### 9.3 Invalidation (`services/invalidation.js`, the yields-layer pattern)
| Events | Effect |
|---|---|
| `PlotVisibilityChanged`, `PlotOwnershipChanged`, `PlotYieldChanged`, `ConstructibleAddedToMap/RemovedFromMap/Changed`, `ResourceAddedToMap/RemovedFromMap`, `DistrictAddedToMap/RemovedFromMap`, `PlotEffectAddedToMap/RemovedFromMap` | Add the plot to the dirty set. On `GameCoreEventPlaybackComplete`, invalidate the facts and mark stale the sites whose (R+3) area and the plans whose (radius 4) area contain the plot |
| `CityInitialized`, `CityAddedToMap`, `CityRemovedFromMap`, `CityTransfered` | Structural: everything stale |
| `TechNodeCompleted`, `CultureNodeCompleted`, `TraditionChanged` | Buildable lists and activations stale |
| `CityPopulationChanged`, `CityYieldChanged`, `CityGrowthModeChanged`, `CityProductionChanged`, `PlayerCityLimitChanged`, `PlayerSettlementCapChanged` | Advisor stale |
| `MapTackUIUpdated`, `MapTackLoadedFromStore`, `CityCenterMapTackUpdated` | Registry reconcile; planned centres changed, so sites and plans stale |
| `PlayerTurnActivated` (local) / `LocalPlayerTurnBegin` | Full refresh; hotseat: if `localPlayerID` changed, drop all caches |

Recompute happens **only while the panel is open**, debounced by 300 ms. When the panel is closed, results are only flagged stale. A new job cancels the running one.

---

## 10. Phased roadmap

Effort is in relative units (1 ≈ one focused day).

| Milestone | Effort | Scope | Acceptance criteria |
|---|---|---|---|
| **M0 Skeleton** | **1** | modinfo, text, input; dock button; empty tabbed panel; settings and log services; junction; DMT presence flag | The mod shows in Add-Ons; `Modding.log` lists `xpl-game` (+ `xpl-game-dmt` when DMT is on). Exactly one button after load, reload and age transition. Button and F8 toggle the panel; Esc and close work. **While the panel is open you can drag, zoom and pan the map, select units and right-click-move without the panel closing.** `UI.log` contains `[XPL] boot v0.1 dmt=true|false`. Verification tasks V1–V5, V27, V28, V33 are done. |
| **M1 Settlement finder + highlights** | **4** | rules-loader, map-facts, settle-oracle, site-scorer/selector, scheduler, invalidation, overlay, Settlements tab | On test saves A/B: Top-N appear with scores, tiers and ≥3 reasons each. Every pick passes `isValidLandClaimLocation`; pairwise distance ≥ CITY_MIN_RANGE+1; **no pick or ring tile uses hidden info with the fog toggle off**. Radius and profile changes reorder as expected (the Production profile lifts hill/forest sites). At least 2 of the AI's 3 suggestions per origin fall in our top 8 under Balance (calibration check). Hover shows the footprint; click pans. Performance budgets in §9 are met. `node --test` passes for the core modules. |
| **M2 DMT tacks** | **2** | dmt-bridge L0/L1/L2, registry, reconcile, Place/Clear, replace-previous | With DMT: ticking 3 rows and pressing Place creates 3 city-centre tacks with DMT's radius overlays. Save, reload: tacks and registry persist. Clear removes only ours; a user tack on the same plot survives. Repeated Place creates no duplicates; 2 per plot is respected. Without DMT: the buttons are disabled, with no errors in UI.log. The probe result (L1/L2) is logged. |
| **M3 Town→city advisor** | **2** | player-facts, town-advisor, Towns tab | The cost equals the game's Convert-button cost for every town. BLOCKED reasons equal the production chooser's tooltip text. Verdicts and reasons render; sorting works; the header shows cities/limit, settlements/cap and age %. |
| **M4 Adjacency solver** | **6** | adjacency-rules, placement-model/solver, engine-placements, Buildings tab, building tacks, debug cross-check | Engine-reachable placements are valid per the engine. **JS adjacency equals the engine for ≥ 95% of (standard building, plot) pairs** on saves A–D, with mismatches logged. Multi-building plans show quarter and wonder synergies. The planned total is ≥ a naive "engine best-single per building" baseline. Placed building tacks show DMT yields equal to our predicted adjacency. Planned-site layouts work. ≤ 50 ms per city. |
| **M5 Polish** | **2** | Settings persistence, all LOC keys, empty states, keyboard/gamepad focus basics, optional Options entry (Mods tab), README/Workshop text, icon art | Settings survive a game restart. No raw `LOC_` strings appear. Error paths are exercised. Two-mod coexistence (Drongo + BZ + DMT installed) works without errors or overlapping UI. |
| **Phase 2 Wonders + race check** | **4** | Wonders tab, wonders-source (own scan, or BZ `bzWonderList` when `bz-active`), wonder-race, wonder as a solver anchor | Lists current-age wonders not completed anywhere and buildable somewhere, with our min turns (`BuildQueue.getTurnsLeft`), race label from **legitimate signals** (revealed in-progress instances, completions, `NOTIFICATION_WONDER_FAILED`, pace), best tile and adjacency boost. The omniscient toggle is off by default and clearly labelled. Placing a wonder tack updates the building plan. |

**Race heuristic (phase 2).**
- **HIGH:** no rival signals and ourTurns ≤ 10.
- **MEDIUM:** no signals but ourTurns > 10, or signals present and ourTurns ≤ 5.
- **LOW:** signals present and ourTurns > 5, or the age is over 80%.
- **NONE:** completed elsewhere.

Thresholds scale with game speed (VERIFY). In omniscient mode, also compare against rivals' `BuildQueue.getTurnsLeft` and percent complete.

---

## 11. Testing and debugging

### 11.1 Tooling
- **Hot reload:** `UIFileWatcher 1`. Watch `UI.log` with `tools\tail-ui-log.ps1`. Logging is `console.warn('[XPL]', …)`; `log.debug` only fires when `settings.debug` is on.
- **Debug handle:** `window.__XPL = { state, rescan(), dumpTile(x,y), crossCheck(cityId), probeDMT(), timings }`, for the FireTuner or UIDebugger console.
- **Debug section** (Settings → Debug): rejected-candidate overlay by reason, per-phase timings, cross-check mismatch counter, DMT level, registry contents, and a "Copy diagnostics" action that writes to the log.
- **Unit tests:** `node --test tests\` covers the pure `core/` modules: scorer monotonicity, the overlap model, selector spacing, rule-engine cases built from extracted `Adjacency_YieldChanges`, solver invariants (slots, full-tile, quarters), and advisor branch coverage. Fixtures are generated by `tools\extract-fixtures.py` from the game XML (read-only).
- **Syntax gate:** `tools\check-syntax.ps1` runs `node --check` on every file before a game run.

### 11.2 Test saves
| Save | Purpose |
|---|---|
| A | Antiquity turn ~1–5, capital only, settler available (candidate generation, AI comparison) |
| B | Antiquity mid-game: 5–6 settlements, a pop≥7 town, coast + navigable river + mountains + a natural wonder nearby, an independent within 4–6 tiles (scoring, advisor, solver) |
| C | Exploration start after transition: cities reverted, obsolete buildings (overbuild, quarters) |
| D | Modern mid-game (worker cap 3, FULL_TILE buildings) |
| E | Huge map, late game, 15+ settlements (performance) |
| F | With manual DMT tacks, including a city-centre tack and two tacks on one tile (non-destructive bridge) |
| G | Without DMT (L0 behaviour) |
| H | Hotseat with 2 humans (player switch, registry `pid`) |

### 11.3 In-game verification tasks (every INFERRED item and open question)
| # | Question | How to check |
|---|---|---|
| V1 | Is the junctioned Mods folder discovered? | `Modding.log` "Target Mods" lists `expansion-planner` |
| V2 | Does UIFileWatcher reload mod JS (incl. import-only modules) and CSS/HTML? | Edit a log string or CSS colour in a core module; observe without reload |
| V3 | Is `console.log` filtered at `UILogLevel 1`? | Boot logs both `log` and `warn`; grep UI.log |
| V4 | Duplicate dock buttons after re-attach, reload or age change? | `document.querySelectorAll('.xpl-planner.ssb__button').length` via the debug handle |
| V5 | Non-modal panel: does the map still pan, zoom and select with `InputContext.Dual` and no guard? Does right-click on the map close the panel? | Manual; if it fails, use the side-panel `target-slot` fallback |
| V6 | Meaning of `isValidLandClaimLocation(coord, true/false)` | Count differences over all plots for true vs false; inspect the differing plots |
| V7 | Does `isValidLandClaimLocation` reveal hidden foreign cities? | Compare blocked plots near unexplored regions with later reveals |
| V8 | `getBestSettleLocationsForSettler`: shape (numeric score?), search range, fog, cost | `JSON.stringify` the results; time 10 calls |
| V9 | Runtime `CITY_MIN_RANGE`, and is distance ≤3 blocked? | `GameInfo.GlobalParameters.lookup("CITY_MIN_RANGE")`; probe validity at distances 3 and 4 |
| V10 | Does `getYields` on unowned and hidden plots include resource yields? | Compare with the plot tooltip; test with include-hidden |
| V11 | Are tech-gated resources returned by `getResourceType`? | Find a resource that appears after a tech; compare before and after |
| V12 | Ocean workable in Antiquity? | Place pop near ocean in save A; check the expand plots (`CityCommands.canStart(EXPAND)`) |
| V13 | `calculateAllBuildingsPlacements`: locked or queued items included? Works for towns? Cost in ms? Plots outside `getPurchasedPlots`? | Log counts and timings per city; compare with `canStart` plots |
| V14 | Do Palace and City Hall occupy one of the centre's 2 slots? | Engine `Plots` for a building in the centre |
| V15 | Do obsolete buildings lose adjacency, stop forming quarters, and what does overbuilding cost? | Save C: engine `changeDetails` and `overbuiltConstructibleID` |
| V16 | Specialist amplification in the engine data (`WORKERS` source)? | Compare a tile's adjacency with the `WORKERS` details |
| V17 | Rural→urban yield loss | Engine `yieldChanges` on a farm tile vs an empty tile |
| V18 | Town production: `getYield` vs `getNetYield` | Compare with the town's yield banner |
| V19 | Cost vs population | Sample `getTownUpgradeCost()` per turn as a town grows |
| V20 | Production-to-gold ratio | `getBuildingPurchaseCost / getConstructibleProductionCost` for 5 buildings |
| V21 | Age progress rate; does `Game.turn` reset per age? | Log points and turn each turn in save B and after a transition |
| V22 | GameTutorial persistence through save/load and age transition (DMT + XPL) | Save F: reload; play through a transition |
| V23 | GameTutorial in hotseat and network MP | Save H; an MP session later (writes are disabled until checked) |
| V24 | DMT import singleton identity | `probeDMT()` after the first add (§8.1) |
| V25 | Founding a town on a `BUILDING_CITY_HALL` tack auto-removes it? | Save A: settle on a tacked plot |
| V26 | Is `engine.trigger` → DMT handler synchronous? | Read GameTutorial immediately after the trigger |
| V27 | Does the `ModInUse` group activate only when DMT is enabled? | `Modding.log` with DMT on and off |
| V28 | Do `References` load DMT first? | `Modding.log` order |
| V29 | Does `UI.setOption` accept strings? | Round-trip a JSON string; otherwise keep scalars only |
| V30 | Does `localStorage` "modSettings" survive with BZ and Leonard mods installed? | Restart twice; check our key |
| V31 | Is `isAdjacencyUnlocked` identical across a player's cities (proxy for planned sites)? | Compare all cities for all `RequiresActivation` IDs |
| V32 | Phase 2: `getTurnsLeft` for non-queued wonders; is `ADVISOR_WARNING_COMPETING_WONDER` readable? | Log values; inspect notifications |
| V33 | F8 free and working; `InterfaceMode.allowsHotKeys` gating | Manual, in several interface modes |
| V34 | Performance of the full scan on a Huge map | Timings in the debug section (save E) |
| V35 | How do independents' village centres appear (their cities, or owned plots only)? | Inspect `Players.get(id).Cities` for an independent player |

---

## 12. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Patch fragility.** 1.4.0 moved UI to relative imports and `.scss.js`, and `addButton` is `private` in the TS source | Med / High | Wrap every base touchpoint in try/catch with feature detection (`typeof panel.addButton == "function"`). Fallback to the `ModdingRegistry` slot. Keep base imports to stable modules (verified present in this build). A single `compat.js` holds all base paths. |
| **DMT internals change** (event names, hash schema, singleton paths) | Med / Med | Events-only writes (L1) are the default contract. Imports are optional and probed. Schema reads are guarded (bad JSON → treat as empty). The DMT build is noted in the log. Features degrade to L0 instead of crashing. |
| **DMT cache not ready → overwritten tacks** | Low (with guard) / High | Readiness gate (§8.2); before each write, re-read the plot from GameTutorial. |
| **Multiplayer / hotseat.** GameTutorial sync is unknown; hotseat changes the local player | Med / Med | No `sendRequest` ever. Tack writes are disabled in network MP until V23 is confirmed. The registry stores `pid`. Caches are keyed by `localPlayerID` and flushed on player change. |
| **Performance on Huge maps** | Med / Med | Time slicing, typed-array caches, pre-filters before engine calls, candidate cap with auto-radius, compute only while the panel is open. |
| **Fairness / hidden info** | Med / Med | Revealed-only by default. Unknown tiles get a neutral prior, never true data. The include-hidden toggle and the phase 2 omniscient toggle are explicit and labelled. Residual leak: the engine validity check may reflect hidden cities; the base settler lens already exposes this map-wide, which we document. |
| **Wrong game-rule assumptions** (thresholds, overbuild, specialists) | Med / Med | Engine numbers where available; constants in one file; verification tasks V12–V21; debug cross-check. |
| **Mod conflicts** (Drongo dock button and DMT-mode tooltip CSS; BZ decorators; localStorage clearers) | Low / Low | Additive-only design; unique classes; no base file replacement; the `modSettings` JSON with UI-option backup. |
| **Input context side effects** (Dual context steals keys, Esc conflicts) | Med / Low | The handler only consumes Esc, cancel and sys-menu. Fallback slot placement (V5). |

---

## 13. Open questions for you
*(Answered 2026-10-11; see §14.1.)*

1. **"Wonder Panel" data:** did you mean **BZ Map Trix's wonder list** (installed, `bz-wonder-panel`) or **Wonder Race Alert**? Phase 2 will read from it when present.
2. **Hidden-information mode for wonders:** do you want an opt-in "use rivals' build queues" toggle (off by default) at all?
3. **Multiplayer:** do you use this in hotseat or online games? If not, network multiplayer stays disabled for tack writing.
4. **Dev setup:** may I create the Mods-folder junction and turn on `UIFileWatcher`, `UILogLevel 2`, `EnableTuner` and `EnableDebugPanels` in your `AppOptions.txt` (after a backup)?
5. **Identity:** is the name **Expansion Planner** with mod id `expansion-planner` OK, or do you want a personal prefix (e.g. `xx-expansion-planner`) before any Workshop upload?

---

## 14. Decisions and environment facts (2026-10-11): these override earlier sections

### 14.1 Your answers to §13
| # | Question | Answer | Plan change |
|---|---|---|---|
| 1 | "Wonder Panel" data | **Wonder Alert** (workshop 3656705275) | Phase 2 `wonders-source.js` mirrors Wonder Alert's queries rather than importing its internals. Wonder Alert is not locally patched; its code is the upstream build. Its rival data (other players' `BuildQueue`, `panel.js:3717-3760`) is hidden information, so it is used **only** in the opt-in mode below. BZ Map Trix's `bzWonderList` is dropped as a source. |
| 2 | Rivals' hidden build queues | **Opt-in toggle**, off by default | Keep `wonders.omniscient` (default `false`), labelled like the fog toggle. Fair mode uses only legitimate signals (§10 race heuristic). |
| 3 | Multiplayer | **Online MP too** (and therefore hotseat) | See §14.3. MP is no longer "disabled"; it becomes a verified feature with its own milestone. |
| 4 | Dev setup | **Approved** | At the start of M0: back up `AppOptions.txt` (timestamped copy next to it), set the keys from §1 "Dev deployment", and create the Mods-folder junction. |
| 5 | Name / id | Not answered | Keep **Expansion Planner** / `expansion-planner` until you say otherwise. |

### 14.2 Game version and locally patched mods
- **Game version.** 1.5.0.44 (patch manifests in `C:\Users\glazu\Documents\Codex\2026-10-07\new-chat\outputs\*\manifest.json`). Every code reference in this plan was read from this installed build. Labels such as "1.4 moved files to `.scss.js`" describe when a change appeared; they don't mean the plan targets 1.4.
- **Locally patched mods.** These workshop mods carry compatibility patches from a separate maintenance effort:
  - `3507297712` Detailed Map Tacks
  - `3515801789` Policy Yield Previews
  - `3756000777` Resource+
  - `3509395646` No Gradients
  - `3508036392` Memento Filters
  - `3734579243` Compact Production

  Each patch has backups, hashes and installation receipts in the outputs folder above.
- **Rule: this project never writes into any workshop folder.** That includes dev tooling, tests and fixtures; reads only. If a workshop update replaces a patched file, that is the maintenance effort's concern, not ours.
- **What is patched in DMT, and why it matters (checked by diff against `Civ7-mods-backup-2026-10-07.zip`):**
  - `dmt-map-tack-change-processor.js`: **the event contract is unchanged** from upstream. `AddMapTackRequest` and `RemoveMapTackRequest` have the same handlers and payloads. The patch only adds deferred refresh triggers (`TraditionChanged`, `CultureNodeCompleted`, `TechNodeCompleted`, `AttributeNodeCompleted`, `BeliefAdded`, `PlayerGoldenAgeChanged`, `CityReligionChanged`, `LoadComplete`, a 100 ms debounce) and a `try/finally`. **The L1 bridge (§8) is therefore upstream-stable.**
  - `dmt-adjacency-rules.js` is a **new file created by the local patch**; upstream DMT has no such file. `dmt-map-tack-yield.js` is heavily rewritten (≈620 changed lines) and imports it. Consequences:
    - Our `core/adjacency-rules.js` is specified from the **game schema** (`01_GameplaySchema.sql`) and validated against the **engine** (`calculateAllBuildingsPlacements`). DMT's rules file is only a reading aid, not ground truth.
    - The L2 cross-check against `MapTackYield.getYieldDetails` and the M4 criterion "DMT tack yields equal our predicted adjacency" apply **only while the patched DMT is installed**. M4 acceptance is redefined: JS vs **engine** agreement ≥ 95% is the gate; DMT agreement is informational.
    - At boot, `dmt-bridge` logs a DMT fingerprint: whether `dmt-adjacency-rules.js` resolves via dynamic `import()`, which shows whether the patch is present. L2 cross-checks are enabled only when it is.
  - Other patched DMT files (`dmt-map-tack-ui-utils.js`, the place-tacks interface mode, the modifier/requirement files, text) do not touch our contract.

### 14.3 Online multiplayer (new scope)
Everything the mod computes is a **local read** (GameplayMap, Players, GameInfo, engine queries). It never calls `sendRequest`, so it can't change gameplay state. The open issues are mod loading and where tacks are stored.

| Topic | Default behaviour | Verify (new tasks) |
|---|---|---|
| Mod loading | `AffectsSavedGames=0`, UI-only. Expected: each client may run it independently | **V36**: host with the mod, client without (and the reverse). Can both join, and are there no "mods differ" blocks? |
| Tack storage | DMT and our registry use `GameTutorial` properties, written locally by UI script | **V37**: in a 2-client online game, does a tack placed on client A appear on B? Is it in the host's save? No desync or OOS warnings? |
| Registry ownership | Entries carry `pid`. "Clear my tacks" filters by `GameContext.localPlayerID` | **V38**: two humans each place and clear tacks; neither can remove the other's |
| Tack writes before verification | **Enabled in network MP with a one-time warning toast** (you asked for MP support), rate-limited as in single-player | If V37 shows desync, writes are disabled in network MP again and listed as a known limitation |
| Hidden-info toggles | "Include unexplored tiles" and the wonder "omniscient" toggle remain available. In network MP their labels add "(gives information other players don't have)" | — |
| Hotseat | Caches and results are dropped when `localPlayerID` changes (`PlayerTurnActivated`); the registry is filtered by `pid` | V23 (existing) |
| Turn timer / simultaneous turns | Jobs are time-sliced and cancellable. The panel never blocks end-turn or input | Manual check under a turn timer |

**Roadmap change:** a new **M2b, MP verification (1 unit)** follows M2. Its acceptance criteria are V36–V38 recorded in `research/11-mp-verification.md` and the defaults above confirmed or adjusted. The v1 total becomes ≈18 units (≈22 with phase 2).

### 14.4 Phase 2 wonder source (replaces the BZ references)
- Drop `bz-active` and the BZ `References` lines from the §2 modinfo draft.
- **Fair mode:** our own scan.
  - Current-age wonders from `GameInfo.Wonders`.
  - Completed state from revealed map constructibles plus `NOTIFICATION_WONDER_COMPLETED` / `NOTIFICATION_WONDER_FAILED`.
  - Our own cities' `BuildQueue.getTurnsLeft` / `getPercentComplete`, and `canStart` BUILD plots for placement.
- **Omniscient mode (opt-in):** additionally read every rival city's `BuildQueue.currentProductionTypeHash` and `getPercentComplete`, the same calls Wonder Alert makes, to estimate rivals' turns left.
- Wonder Alert does **not** need to be installed. If it is, nothing is shared at runtime; the two mods show consistent information because they use the same engine queries.

---

## Appendix A: Claims I spot-checked against source (file:line)
- Dock: `addButton` `panel-sub-system-dock.js:238-242`; mod slot l.147-149; `ModdingRegistry.attachModElements` l.177; tech chooser pushed without a guard l.752. The icon class `.ssb__button-icon.advanced-start` is still in `panel-sub-system-dock.css:356`.
- Context manager: the mouse guard disables world input `context-manager.js:79-93`; pop restores it l.297-301; `target-slot-` lookup l.25/157; exports l.686.
- `InputContext.Dual` in `panel-production-chooser.js:345`; `Panel` default `InputContext.Shell` (`panel-support.js`); left side-panel slots `root-game.html:292-331`.
- Decorator hooks are all invoked `component-support.js:283-321`; `Loading.runWhenLoaded` l.1458.
- Settle validity `appeal-layer.js:52`; AI recommender and its dedupe bug `settlement-recommendations-layer.js:43-46`; `CITY_MIN_RANGE` fallback 3 `assign-advanced-start-region.js:36-40`.
- Town upgrade: `production-chooser-operations.js:27-34`; `getTownUpgradeCost` `panel-production-chooser.js:205`; city cap l.961-971; `TOWN_UPGRADE_*` in `age-exploration/data/gameplay-systems.xml:24-28` and `age-modern/...:19-23`.
- Engine placements `building-placement-manager.js:131`; maintenance and overbuild handling l.214-256; `canStartQuery` BUILD vs PURCHASE `production-chooser-helpers.js:509-512`; best-total helper l.100-135.
- Adjacency data: rules `base-standard/data/constructibles.xml:278-297`; links `age-antiquity/data/constructibles.xml:605-640`; Palace/City Hall `CityCenterPriority` l.132-133; district slots and `ResourceBlocks` `districts.xml:14-18`.
- Specialists amplify adjacency: `Civilopedia_Concepts_Text.xml:841,1587`.
- AI settle evaluation thresholds: `AI_Base.xml:20-40` (inner ring 18/26, total 30/50), weights l.227-236.
- DMT: handlers `dmt-map-tack-change-processor.js:21-48`, refresh cascade l.100-107/146-179; store write-through l.54-65; GameTutorial serializer `dmt-utility-serialize.js:1-40`; pure rules `dmt-adjacency-rules.js`; UI-scope `isRiver`/`isNavigableRiver` `dmt-map-tack-utils.js:374-375`; class-type strings `dmt-map-tack-constants.js:20-24`; `validOwner` mimic `dmt-interface-mode-place-map-tacks.js:125-127`.
- Core `Catalog`: game-scope writes immediate, player-scope writes queued `utility-serialize.js:95-116, 137-152`.
- Time slicing `trade-layer.js:24-53`; dirty-set flush `yields-layer.js:42-93`; overlay priorities `utilities-overlay.js:1-16`.
- Base imports present in this build: NavTray, FocusManager (`/core/ui-next/services/`), MustGetElement, PlotCursor, LensManager, InputEngineEventName, `getGlobalParamNumber`, InterfaceMode, `OVERLAY_PRIORITY`, `HexToFloat4`, `ConstructibleHasTagType`.
- Multiplayer detection: `Configuration.getGame().isNetworkMultiplayer`/`isHotseat`/`isAnyMultiplayer` (used in base). Independents: `Players.get(id).isIndependent`.

### Critical files for implementation
- `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\base-standard\ui\sub-system-dock\panel-sub-system-dock.js`
- `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\core\ui\context-manager\context-manager.js`
- `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\base-standard\ui\building-placement\building-placement-manager.js`
- `D:\SteamLibrary\steamapps\workshop\content\1295660\3507297712\ui\map-tack-core\dmt-map-tack-change-processor.js` (with `dmt-map-tack-store.js` and `dmt-adjacency-rules.js` next to it)
- `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\base-standard\ui\lenses\layer\appeal-layer.js`
