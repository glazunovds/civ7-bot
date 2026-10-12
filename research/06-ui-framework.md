# 06 — Civ VII UI framework and proven injection patterns

Scope: how to add a top-left HUD button that opens a popup (radius slider, priority dropdown/radio, building-type checkboxes, action buttons, sortable results list with camera pan, and map highlighting).

Sources inspected (read-only):
- Game UI, abbreviated below as `BASE`: `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\{core,base-standard}\ui`. These are compiled JS (esbuild output with `.js.map`) and run on Coherent Gameface (`cohtml.js`).
- Workshop mods, abbreviated below as `WS`: `D:\SteamLibrary\steamapps\workshop\content\1295660\<id>`.
- Logs and options: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\` (`Logs\UI.log`, `AppOptions.txt`, `LocalStorage.sqlite`).

Legend: **[V]** = VERIFIED in code or files. **[I]** = INFERRED (reasoned, not directly confirmed).

The game build is around 1.4.x. Some screens have moved to a SolidJS "ui-next" stack (`/core/ui-next/...`, `ComponentRegistry`). The HUD sub-system dock, `Panel`, `Controls.define/decorate` and the `fxs-*` components are still the legacy custom-element framework. [V] (`WS/3515801789/scripts/ui/policies/screen-policies-yields-decorator.js:3-10` describes the 1.4.0 migration.)

---

## 1. How mods add UI (modinfo)

### 1.1 Action types
| Action | Purpose | Evidence |
|---|---|---|
| `<UIScripts>` | JS files that the UI runtime loads as `<script type="module">`, so they are ES modules with `import`/`export`. Use them to register components (`Controls.define`), decorators (`Controls.decorate`), lenses and layers. | [V] `BASE/core/ui/component-support.js:1007-1066` (`loadSource(url, module=true)` sets `s.type="module"`) |
| `<ImportFiles>` | Puts files into the virtual FS without executing them: HTML templates, CSS, PNGs, or JS that is only reached via `import`. **Replaces a base file** when the relative path matches it. | [V] Drongo imports `city-planner-panel.html/.css` (`WS/3734169112/drongos-city-planner.modinfo`). [V] bz-city-hall ImportFiles `ui/production-chooser/panel-production-chooser.js`, a full copy of the base file (`WS/3507102289/bz-city-hall.modinfo`, `ui/production-chooser/panel-production-chooser.js:1-5`). [I] the override matches on relative path. |
| `<UIShortcuts>` | Declares root HTML documents (`ui/root-game.html`, `ui/loading/root-loading.html`). Base game only, not for mods. | [V] `BASE/base-standard/base-standard.modinfo:322-324, 796-798`. One mod has it commented out (`WS/3508036392/*.modinfo:75-77`). |
| `<UpdateText>` | Loads LOC strings (XML `<EnglishText>/<LocalizedText>` or SQL `INSERT INTO LocalizedText`). | [V] Drongo `modules/text/City-Planner-Text.sql`; bz `text/*/InGameText.xml` |
| `<UpdateDatabase>` | Loads gameplay or frontend DB rows. Used for hotkeys (`InputActions`) and `InterfaceModes`. | [V] `WS/3734169112/modules/database/input.xml`, `WS/3507297712/data/interface-modes.xml` |
| `<LocalizedText><File>` (top level) | Mod-browser name and description text. | [V] all inspected mods |

### 1.2 Scope
- `scope="game"` runs in-game. The HUD lives here, so our button and popup go here. [V]
- `scope="shell"` runs in the main menu. Use it only for Options-menu entries or hotkey DB rows (`InputActions` must be registered in shell: Drongo `shell-drongos-city-planner` → `UpdateDatabase input.xml`). [V]
- Mods that expose options load the same option script in **both** scopes (bz-city-hall, better-ribbon-info, Drongo's Adjacency Lens). [V]
- `<Properties><LoadOrder>1000</LoadOrder>` is used to load after base. Resource+ uses 1100 and the Adjacency Lens uses 10000. [V]
- `criteria` can gate a group by age (`<AgeInUse>AGE_ANTIQUITY</AgeInUse>`; Resource+ modinfo). [V]

### 1.3 Paths inside JS and CSS
- Base modules: `import X from '/core/ui/...'` and `'/base-standard/ui/...'`. [V]
- Own files: `import ... from '/<mod-id>/<relative path>'`, e.g. `'/bz-map-trix/ui/options/bz-map-trix-options.js'` (`WS/3507072814/ui/mini-map/bz-panel-mini-map.js:1`). Relative `./x.js` imports also work (`WS/3640416186/scripts/ui/diplo-ribbon/diplo-ribbon.js:2-3`). [V]
- CSS, HTML and images: `fs://game/<mod-id>/<relative path>`, e.g. `fs://game/drongos-city-planner/modules/ui/city-planner/city-planner-panel.css` (`WS/3734169112/.../city-planner-panel.js:1333-1340`). `<mod-id>` is the `<Mod id="...">` attribute, not the Workshop number. [V]
- Base images use the `blp:` scheme (`url("blp:sub_greatworks")`), and `UI.getIconBLP(type)` returns one for a DB type. [V] (`panel-sub-system-dock.css:344`, `city-growth-improvements-layer.js:47`)

### 1.4 Globals available without import [V]
`Controls`, `Component`, `ComponentValueChangeEventName` (`"component-value-changed"`), `engine`, `Locale`, `UI`, `Camera`, `WorldUI`, `GameplayMap`, `GameInfo`, `Players`, `GameContext`, `Configuration`, `InputActionStatuses`, `InputContext`, `PlacementMode`, `SpriteMode`, `localStorage`.
`component-support.js` is a classic script, so its top-level consts are global (line 438 comment, `const Controls = ComponentManager.getInstance()` at 1265). Drongo uses `ComponentValueChangeEventName` without importing it (`city-planner-panel.js:1168`).

---

## 2. How installed mods inject UI without replacing base files

### Core mechanism: `Controls.decorate(tag, provider)` [V]
- `BASE/core/ui/component-support.js:1133-1144` stores providers per tag.
- When a custom element of that tag is created, `ComponentRoot.initialize` (approx. lines 228-252) calls `new definition.createInstance(root)`, then each `decorator(component)`, then `component.onInitialize()`.
- On attach (approx. 283-301) it calls `d.beforeAttach()` → `component.onAttach()` → `d.afterAttach()`. Detach mirrors this with `beforeDetach/afterDetach`.
- The decorator receives the **component instance**, so it can call its methods (`addButton`, `addSubpanel`, `createLensButton`) and patch its prototype.
- The decorator object **must implement all four hooks** (`beforeAttach/afterAttach/beforeDetach/afterDetach`), even as empty methods.
- The decorator must be registered before the HUD element is created. UIScripts in `scope="game"` load early enough; every mod below relies on this. [V by working mods, I on exact timing]

### Per-mod findings

| Mod | What it adds | Where | Technique | Refs |
|---|---|---|---|---|
| **Drongo's City Planner** (3734169112) | Button in the **sub-system dock (top-left HUD)** that toggles a full popup panel | `panel-sub-system-dock` | `Controls.decorate("panel-sub-system-dock")`. In `afterAttach` it calls `this._panel.addButton({...})`. The callback runs `ContextManager.push("panel-drongos-city-planner", {singleton:true, createMouseGuard:true})` or `ContextManager.pop`. Also adds an F9 hotkey via `ContextManager.registerEngineInputHandler` plus DB `InputActions`. | `modules/ui/city-planner/city-planner-dock.js:24-60`; panel `city-planner-panel.js:1110-1340`; HTML `city-planner-panel.html:1-36`; hotkey `modules/database/input.xml:1-9` |
| **Wonder Race Alert** (3656705275) — not in the list, but the same pattern | Button plus badge in the sub-system dock | `panel-sub-system-dock` | `component.addButton({... modifierClass:"wonder-alert"})` in `afterAttach`. Icon set by injecting CSS `.ssb__button-icon.wonder-alert{background-image:url("fs://game/wonder-race-alert/ui/wonder-alert-icon.png")}` via `document.head.appendChild(style)`. | `ui/wonder-alert-dock-decorator.js:10-17, 70-74, 106-130, 268` |
| **Detailed Map Tacks** (3507297712) | Button in the **mini-map button row** (bottom-left) | `panel-mini-map` | Decorator. In `beforeAttach` it creates an `fxs-activatable` and runs `component.miniMapButtonRow.appendChild(btn)`. On click: `InterfaceMode.switchTo("DMT_INTERFACEMODE_MAP_TACK_CHOOSER")`. Its CSS is loaded with `Controls.loadStyle("fs://game/...")`. Interface modes are declared in DB (`data/interface-modes.xml`). | `ui/mini-map/dmt-panel-mini-map-decorator.js:14-56`; `ui/interface-modes/dmt-interface-mode-map-tack-chooser.js:8-40` |
| **bz-map-trix** (3507072814) | Three mini-map subpanels (cities, units, wonders), extra lens buttons, layer checkboxes | `panel-mini-map`, `lens-panel` | Decorator plus **prototype monkey-patching** (`patchPrototype`, which wraps `onInitialize` and `toggleSubpanel`). Then `component.addSubpanel("bz-city-panel", "LOC_...", icon)`, which adds a button and a subpanel class extending `MinimapSubpanel`. On `lens-panel`: `createLensButton(name, lens, "lens-group")` and `createLayerCheckbox(name, layer)`. Also **replaces** `ui-next/tooltips/plot-tooltip/plot-tooltip.js` via ImportFiles. | `ui/mini-map/bz-panel-mini-map.js:227-300, 383, 386-410`; `ui/bz-city-panel/panel-city-list.js:1-40, 240-257` (row click → `Camera.lookAtPlot(city.location)`); modinfo ImportFiles lines 56-64 |
| **bz-city-hall** (3507102289) | Extends city details, place-population and production chooser | `panel-city-details`, `panel-place-population`, `panel-production-chooser` | Decorators (`bz-panel-city-details.js:1021`, `bz-place-population.js:114`, `bz-panel-production-chooser.js:467,483`) **plus full base-file replacement** via ImportFiles (`ui/production-chooser/panel-production-chooser.js`, `ui/interface-modes/support-city-decoration.js`). Options are registered via `Options.addOption`. | modinfo `bz-city-production-ui` group; `ui/options/bz-city-hall-options.js:36-47` |
| **better-ribbon-info** (3640416186) | More yields in the diplo ribbon (top-right) | Model, not DOM | **Prototype patch of a model singleton**: `Object.getPrototypeOf(DiploRibbonData).createPlayerYieldsData = function(){...original...}`. No new button. | `scripts/ui/diplo-ribbon/diplo-ribbon.js:1-9` |
| **Resource+** (3756000777) | Buttons inside the Resource Allocation (commerce) screen | ui-next Solid component `CommerceResourcesContainer` | `ComponentRegistry.register({name:'CommerceResourcesContainer', overridePriority:1100, createInstance: Wrapper})`. The wrapper uses Solid `onMount` with `MutationObserver` + `querySelector` + `document.body.appendChild` (absolutely positioned buttons), then calls the original factory. | `ui/commerce/resource-plus.js:1-4, 1052-1321` |
| **lf-policies-yields-preview** (3515801789) | Yield previews on policy cards and tooltips. No HUD button. Has a debug cheat panel. | `screen-policies`, `attribute-card`, `screen-city-state-bonus-chooser` | Decorators (`policies/screen-policies-yields-decorator.js:27`, etc.). The debug panel is a raw `div` appended to `document.body` (`ui/debug/cheat-panel.js:229-243`), which is not the recommended approach. | as cited |
| **Drongo's Adjacency Lens** (3737207667) | A lens button in the lens panel plus a coloured plot overlay | `lens-panel` | Decorator: `component.createLensButton("LOC_...", "drongos-adjacency-lens", "lens-group")`. `LensManager.registerLens(...)`. `LensManager.registerLensLayer(...)` with `WorldUI.createOverlayGroup` → `addPlotOverlay` → `addPlots`. | `ui/mini-map/drongos-adjacency-lens-panel-decorator.js:1-20`; `ui/lenses/lens/drongos-adjacency-lens.js:26-37`; `ui/lenses/layer/drongos-adjacency-layer.js:245-340` |

**Takeaway [V]:** none of the HUD-button mods replaces a base file. They decorate a HUD container and use its own button factory (`addButton`, `addSubpanel`, `createLensButton`) or append an `fxs-activatable` to an exposed container (`miniMapButtonRow`).

---

## 3. What sits at the TOP-LEFT of the in-game HUD

`BASE/base-standard/ui/root-game.html:174-218` (desktop `<template class="world">`):
```html
<fxs-slot name="top-left" class="top left"></fxs-slot>          <!-- empty -->
<fxs-slot name="top-center" class="top center w-full">
  <fxs-vslot class="w-full">
    <fxs-hslot class="relative flex-auto items-start justify-between">
      <panel-yield-banner></panel-yield-banner>                   <!-- row 1, far left: player yields -->
      ... <panel-diplo-ribbon/> <panel-system-bar/>                <!-- right side -->
    </fxs-hslot>
    <fxs-hslot>
      <panel-sub-system-dock></panel-sub-system-dock>             <!-- row 2, left: Age/Tech/Civic/Gov/... -->
      <panel-continents></panel-continents>
      <div id="target-slot-panel-settler-legend" ...></div>
    </fxs-hslot>
    <fxs-hslot><quest-list></quest-list></fxs-hslot>
```
- The visible top-left cluster is **`panel-yield-banner`** (row 1) and **`panel-sub-system-dock`** (row 2, round buttons: age timer, Tech, Civics, Traditions/Government, Resources, Great Works, Religion, Advisors, Legacies). [V]
- There is a console template (`root-game.html:337+`) with a different layout. Our target is desktop. [V]

### `PanelSubSystemDock` (`BASE/base-standard/ui/sub-system-dock/panel-sub-system-dock.js`) [V]
- Lines 9-10: `class PanelSubSystemDock extends Panel { buttonContainer = document.createElement("fxs-hslot"); ...`
- Lines 24-150, `onInitialize`: builds buttons with `this.addButton({...})`.
- Lines 147-149: **official mod slot**:
  ```js
  const moddingButtonContainer = document.createElement("fxs-hslot");
  moddingButtonContainer.id = "panel-sub-system-dock-mod-slot";
  this.buttonContainer.appendChild(moddingButtonContainer);
  ```
- Line 177, in `onAttach`: `ModdingRegistry.attachModElements("panel-sub-system-dock");`
- Lines 238-243 and 252-298, `addButton(buttonData)` / `createButton`. The button DOM is:
  ```
  fxs-activatable.ssb__button.<modifierClass>.<class>.ssb__element
     [data-tooltip-content=Locale.compose(tooltip)] [data-audio-*]
     div.ssb__button-iconbg.<modifierClass>  (+ --hover, --active, --disabled clones)
     div.ssb__button-icon.<modifierClass>    <- icon via CSS background-image
  ```
  The click arrives as `action-activate`, then `buttonData.callback(); FocusManager.get().clearFocus(button);`
  `buttonData` = `{ tooltip, modifierClass, callback, class, audio, focusedAudio, turnCounter? }`.
- Icon CSS (`panel-sub-system-dock.css:316-350`), e.g. `.ssb__button-icon.greatworks { background-image: url("blp:sub_greatworks"); }`

### Two ways to add our button
**A. Decorator + `addButton` (proven by Drongo and Wonder Alert) — recommended.** [V]
```js
// city-planner-dock.js:33-60 (abridged)
class DockDecorator {
  constructor(panel) { this._panel = panel; }
  beforeAttach() {}
  afterAttach() {
    this._panel.addButton({ tooltip: "LOC_X_OPEN", modifierClass: "advanced-start",
      callback: togglePanel, class: "tut-x", audio: "data-audio-press-small",
      focusedAudio: "data-audio-focus-small" });
  }
  beforeDetach() {} afterDetach() {}
}
Controls.decorate("panel-sub-system-dock", (panel) => new DockDecorator(panel));
```
Note: `afterAttach` runs on every re-attach. Guard against duplicate buttons (e.g. `if (this.button) return;`). [I]

**B. `ModdingRegistry` (official API, but no installed mod uses it for the dock).** [V API, unproven in practice]
`BASE/core/ui/modding-registry-handler/modding-registry-handler.js:16-46`:
```js
import { ModdingRegistry } from '/core/ui/modding-registry-handler/modding-registry-handler.js';
ModdingRegistry.add({ parentID: "panel-sub-system-dock",
  modSlot: "panel-sub-system-dock-mod-slot",   // element id, looked up in document.body
  componentTag: "my-dock-button", attributes: { } });
```
This creates `<my-dock-button>` inside the mod slot when the dock attaches. We would define `my-dock-button` ourselves. Other host panels that call `attachModElements` are `panel-yield-banner` (`diplo-ribbon/panel-yield-banner.js:407`), `panel-city-details` (224), `mini-map__lens-panel` (`panel-mini-map.js:715`), `root-game` (`root-game.js:313`), and `panel-diplo-ribbon`/`panel-production-chooser` (via `attachModElementsTo`).

### Common CSS classes, components and attributes [V]
- `fxs-activatable`: generic clickable. It emits `action-activate` and handles gamepad, focus and audio.
- `fxs-button` (attr `caption`, `disabled`, `action-key`), `fxs-icon-button`, `fxs-close-button`, `fxs-header` (attr `title`, `filigree-style`), `fxs-nav-help` (attr `action-key="inline-cancel"`).
- Tooltips: `data-tooltip-content="<text or LOC key>"`. Optional `data-tooltip-anchor` / `data-tooltip-alignment`.
- Text: `data-l10n-id="LOC_..."` on any element, or `Locale.compose(key, ...args)`.
- Tailwind-like utility classes are available: `absolute inset-0 flex flow-row font-title-base text-secondary pointer-events-auto` and so on.

---

## 4. Popups and panels

### `Component` (`BASE/core/ui/component-support.js:437-650`) [V]
- `this.Root` is the custom element.
- Lifecycle: `onInitialize()` (once, after the content template is cloned in), `onAttach()` (every attach), `postOnAttach()`, `onDetach()`, `onReceiveFocus()` / `onLoseFocus()`, `onAttributeChanged(name, old, new)` (for attributes declared in the definition), `Destroy()`.
- `this.Root.listenForEngineEvent(name, cb, ctx)` and `this.Root.listenForWindowEvent(name, cb)` are cleaned up automatically (lines 162-172, 258-270).

### `Panel extends Component` (`BASE/core/ui/panel-support.js:21-228`) [V]
- Fields: `animateInType/animateOutType` (`AnchorType.*`, exported), `inputContext` (default `InputContext.Shell`).
- `onAttach` (80-90): registers `engine.on("close-<tag>")` and the document `close-panel` listener, then plays the animate-in.
- `close()` (108-123): animate-out, then `ContextManager.pop(this.Root.tagName)` after 200 ms if animated.
- `setPanelOptions(opts)` receives `ContextManager.push(..., {panelOptions})`.

### `Controls.define(name, definition)` (`component-support.js:819-834, 903-1000`) [V]
Definition keys: `createInstance` (class), `description`, `styles: [url]`, `content: [url of .html]` **or** `innerHTML: [htmlString]`, `classNames: [..]`, `attributes: [{name, description?}]`, `images: [url]`, `requires: [tags]`, `opens: [tags]`, `tabIndex`, `priority` (a higher priority overrides an existing definition), `initializeImmediately`.

### `ContextManager` (`BASE/core/ui/context-manager/context-manager.js`) [V]
- `push(tag, { singleton, createMouseGuard, attributes:{shouldDarken,blackOut,...}, targetParent, panelOptions, viewChangeMethod })` (126-207). It creates the element and appends it to `#target-slot-<tag>` if one exists, otherwise to `.fxs-popups`.
- `pop(tagOrElement)` (216), `popUntil`, `popIncluding`, `getCurrentTarget()` (403), `hasInstanceOf(tag)` (414), `registerEngineInputHandler(h)` (505).
- `createMouseGuard:true` adds a click-blocking guard behind the popup (it darkens by default; pass `attributes:{shouldDarken:false}` to avoid that, lines 79-90).
- **Modal vs. map interaction:** a pushed panel with a mouse guard blocks map clicks. For a panel that must stay open while the player looks at the map, consider no mouse guard (or `shouldDarken:false`) and a side-panel layout. Drongo uses a full-screen modal (`classNames: [..., "absolute", "inset-0"]`). [I]

### Close and back handling [V]
`BASE/core/ui/input/input-support.js:1-30`: `InputEngineEventName = "engine-input"`. `isCancelInput()` is true for `cancel`, `keyboard-escape` **and `mousebutton-right`**.
```js
// city-planner-panel.js:1209-1218
onEngineInput(e) {
  if (e.detail.status != InputActionStatuses.FINISH) return;
  if (e.isCancelInput() || e.detail.name == "sys-menu") { this.close(); e.stopPropagation(); e.preventDefault(); }
}
```
Also wire `fxs-close-button` → `action-activate` → `this.close()` (1170-1171). In `onReceiveFocus` call `NavTray.clear(); NavTray.addOrUpdateGenericBack();` (1200-1204) and `FocusManager.get().setFocus(this.Root)` (1173).

### Template to copy
Drongo's `panel-drongos-city-planner` is the best match for our popup (Panel + external HTML/CSS + checkboxes + scrollable rows + row click → camera). Files: `WS/3734169112/modules/ui/city-planner/city-planner-panel.{js,html,css}`, with the class at lines 1110-1330 and the define at 1333-1340. A small base-game reference is `BASE/base-standard/ui/unit-rename/unit-rename.js:20-140` (Panel, `innerHTML` content, close button, `engine-input` cancel), though that one is embedded rather than pushed. PopupSequencer (`base-standard/ui/popup-sequencer/`) is for game-driven queued popups and is not needed here. [I]

---

## 5. Form controls (`BASE/core/ui/components/*.js`) [V]

| Component | Key attributes | Event and detail |
|---|---|---|
| `fxs-slider` (419) | `value`, `min`, `max`, `steps`, `disabled` | `component-value-changed` → `{percent, value, min, max, steps}` (364-371). Example: `options/editors/calibrateHDR/editor-calibrate-hdr.js:68-76` |
| `fxs-dropdown` (423) | `dropdown-items` (JSON `[{label:"LOC_.."}]`), `selected-item-index`, `no-selection-caption`, `selection-caption`, `has-border`, `has-background`, `container-class`, `bg-class`, `disabled`, `action-key` | `dropdown-selection-change` → `{selectedIndex, selectedItem}`, cancelable (8-12, 210-226). Set `dropdown-items` **before** `selected-item-index` (215). Example: `end-result-graphs/panel-end-result-graphs.js:125-133` |
| `fxs-checkbox` (164) | `selected`, `disabled`, `action-key` | `component-value-changed` → `{value: bool, forced}` (30-50) |
| `fxs-radio-button` (200) | `selected`, `disabled`, `value`, `group-tag`, `is-tiny` | `component-value-changed` → `{isChecked, value}`. Group sync via the window event `RadioButtonGroupChangeEvent` (140-162) |
| `fxs-switch` (122) | `selected`, `disabled` | `component-value-changed` |
| `fxs-stepper` (154) | `value`, ... | `component-value-changed` |
| `fxs-scrollable` (719) | `handle-gamepad-pan`, `attached-scrollbar`, `allow-mouse-panning`, ... | `scroll-is-ready`, scroll-at-bottom events |
| `fxs-tab-bar` (410) | `tab-items` (JSON `[{label, icon?, ...}]`), `selected-tab-index`, `tab-style` | `tab-selected` → `{index, selectedItem}` |
| `fxs-button` (70), `fxs-icon-button` (32) | `caption`, `disabled`, `action-key` | `action-activate` |
| `fxs-frame` (150), `fxs-subsystem-frame` (277), `fxs-modal-frame` | `frame-style`, `can-close`, `box-style` | `frame-closed` / subsystem close |

Others: `fxs-textbox`, `fxs-header`, `fxs-hslot`/`fxs-vslot` (focus navigation), `fxs-selector`, `fxs-minus-plus`, `fxs-progress-bar`.

---

## 6. Camera and map

### Camera [V]
- `Camera.lookAtPlot(loc, opts?)`, where `loc` is `{x, y}` (`city.location`, `unit.location`, `PlotCursor.plotCursorCoords`). `opts`: `{ zoom: 0.25..1, tilt?: 30, instantaneous?: true }`. It is used 45 times in base, e.g. `age-antiquity/ui/tutorial/tutorial-items-antiquity.js:438` (`Camera.lookAtPlot(loc, { zoom: 0.25 })`) and `bz-city-panel/panel-city-list.js:246`.
- `Camera.lookAt(x, y, params?)` takes **world** coordinates, not a plot (`mini-map/panel-mini-map.js:329`, `root-game.js:295`). Drongo's fallback `Camera.lookAt(location)` is a misuse.
- Optionally also move the plot cursor: `PlotCursor.plotCursorCoords = {x,y}` (`import { PlotCursor } from '/core/ui/input/plot-cursor.js'`; Drongo `city-planner-panel.js:643-649`).

### Plot highlighting (overlays) [V]
```js
import { OVERLAY_PRIORITY } from '/base-standard/ui/utilities/utilities-overlay.js'; // HEX_GRID=1..SETTLER_LENS=3, PLOT_HIGHLIGHT=4, CURSOR=9
import { HexToFloat4 } from '/core/ui/utilities/utilities-color.js';                 // HexToFloat4(0xRRGGBB, alpha)
const group = WorldUI.createOverlayGroup("MyGroup", OVERLAY_PRIORITY.PLOT_HIGHLIGHT /*, {x:1,y:1,z:1} scale */);
const fill  = group.addPlotOverlay();
fill.addPlots([{x,y}, ...] /* or plot indexes */, { fillColor: HexToFloat4(0x28EEBE, 0.5) });
const border = group.addBorderOverlay({ style: "CultureBorder_Closed",   // or "CombatBorder"
  primaryColor: {x:1,y:1,z:1,w:1}, secondaryColor: {x:0,y:0,z:0,w:0} });
border.setPlotGroups(plotIndexArray, 0);
// clear:
fill.clear(); border.clear(); group.clearAll();
```
Refs: `base-standard/ui/lenses/layer/radial-measurement-layer.js:67-80, 100-116`; `city-details/panel-city-details.js:141-153, 1450-1458`; `interface-modes/interface-mode-acquire-tile.js:231-246`; Drongo `drongos-adjacency-layer.js:257-336`. Plot index helpers: `GameplayMap.getIndexFromXY(x,y)`, `GameplayMap.getGridWidth()/getGridHeight()`, `GameplayMap.isValidIndex()`.

### Labels and icons on plots [V]
```js
const grid = WorldUI.createSpriteGrid("MyLabels", SpriteMode.Billboard);   // or (name, true) / SpriteMode.Default
grid.addSprite(plot, UI.getIconBLP("YIELD_SCIENCE"), {x:0,y:0,z:5}, { scale: 0.6, offset: {x:0,y:0} });
grid.addText(plotIndex, "12", {x:0,y:0,z:0}, { fonts: ["TitleFont"], placement: PlacementMode.WATER });
grid.clear(); grid.setVisible(bool);
```
Refs: `lenses/layer/city-growth-improvements-layer.js:9-10, 47-56`; `radial-measurement-layer.js:175-187`; `building-placement-layer.js:16-19`.

### Lens / layer integration (optional) [V]
`import LensManager from '/core/ui/lenses/lens-manager.js'`
- `LensManager.registerLensLayer(id, { initLayer(){}, applyLayer(){}, removeLayer(){} })` (`lens-manager.js:70`)
- `LensManager.registerLens(id, { activeLayers:new Set([...]), allowedLayers:new Set([...]) })` (63)
- `LensManager.enableLayer(id)` / `disableLayer` / `toggleLayer` / `isLayerEnabled` / `setActiveLens(id)` / `getActiveLens()` (102-280)
- A lens button is added via the `lens-panel` decorator: `createLensButton(locKey, lensId, "lens-group")` / `createLayerCheckbox(locKey, layerId)`.

For our popup a **standalone overlay group** (created once, cleared on close) is simpler than a lens. A layer is only needed if the highlight should persist after the popup closes or be toggleable from the lens panel. [I]

### Map tacks
Base game: map tacks are a base feature with their own UI. Detailed Map Tacks stores tacks per save through a `Catalog` and exposes `MapTackStore.addMapTack/removeMapTack/retrieveMapTacks` (`WS/3507297712/ui/map-tack-core/dmt-map-tack-store.js:23-176`). The programmatic placement API belongs to another research note. [V for the DMT methods listed, I for reuse]

---

## 7. Persistence and localisation

### Settings persistence
1. **Game options system** (preferred for global prefs) [V]:
   `UI.setOption("user", "Mod", "<modId>.<key>", value); Configuration.getUser().saveCheckpoint();` and `UI.getOption("user", "Mod", "<modId>.<key>")` (`WS/3507102289/ui/options/mod-options.js:23-44`). To show the setting in the Options screen, use `Options.addInitCallback(() => Options.addOption({ category: CategoryType.Mods, group, type: OptionType.Checkbox, id, initListener, updateListener, label, description }))` (`bz-city-hall-options.js:1-47`; `CategoryType["Mods"]` is created in `mod-options.js:4-8`). It must be loaded in both shell and game scopes.
2. **`localStorage`** exists and is backed by `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\LocalStorage.sqlite`. [V file exists] **Caveat [V, from the mods' own comments]:** using more than one key reportedly breaks reading localStorage for every mod. The community convention is a **single key `"modSettings"`** holding a JSON object namespaced by mod id, and code that `localStorage.clear()`s if `length > 1` (`WS/3515801789/scripts/core/settings.js:1-30`; the same code is in bz and better-ribbon mod-options). If we use localStorage we must follow the convention: read-modify-write `modSettings[ourModId]`, and never add a second key.
3. **Per-save data**: `Catalog` (`/core/ui/utilities/utility-serialize.js:117-160`; `new Catalog({name, version, player})`), which stores data in player dynamic properties. Use it only if results or tacks should be saved with the game. [V API, I suitability]

Recommendation: keep last-used radius, priority and building types in `UI.setOption("user","Mod","<id>.<key>")`, with the `modSettings` localStorage entry as fallback (the bz pattern). [I]

### Localisation [V]
- XML (UpdateText): `<Database><EnglishText><Row Tag="LOC_X"><Text>...</Text></Row></EnglishText></Database>`. Use `<Replace>` to override. Other languages: `<LocalizedText><Replace Tag=".." Language="de_DE">`.
- SQL (UpdateText): `INSERT OR REPLACE INTO LocalizedText (Tag, Language, Text) VALUES ('LOC_X','en_US','...');` (Drongo `City-Planner-Text.sql`).
- Use: `Locale.compose("LOC_X", arg1, ...)`, `data-l10n-id="LOC_X"`, and inline icons `[icon:YIELD_SCIENCE]`. Number formatting: `{1_amount: number #,###}`.
- The mod name and description go through `<LocalizedText><File>` and are visible in the shell mod browser.

---

## 8. Debugging

- **Logs** [V]: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\UI.log` (JS console, HTML parser errors, `While executing JS fs://game/...:line:col`). Also `Modding.log` (mod discovery and activation), `Database.log` (SQL/XML errors) and `Localization.log`.
- `console.warn`/`console.error` appear in UI.log. `console.log` from Resource+ ("commerce resource override registered") did **not** appear in the current UI.log, while bz's `console.warn` lines do. **[I]** At the default `UILogLevel 1` (Minimal), `console.log` is filtered, so log with `console.warn` or raise the level.
- `AppOptions.txt` (`%LOCALAPPDATA%\...\AppOptions.txt`) has these debug keys (all commented, i.e. default) [V]:
  - `UILogLevel 1` (0 Off … 4 Diagnostic)
  - `UIDebugger 1` (UI remote debugger, Coherent Gameface devtools) [I on how to connect: typically via a browser at a localhost port]
  - **`UIFileWatcher 0`**: "Watch UI-loaded files for changes and automatically reload". This is the hot-reload switch. [V that the option exists; I on how it behaves with mod folders]
  - `EnableDebugPanels -1`, `EnableTuner -1` (FireTuner), `EnableUiStateLogging 0` (logs panel push and pop)
- Local dev mod folder: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\` exists and is empty. Put the dev copy there. [V exists, I that it is scanned]
- Without the file watcher, changes need a return to the main menu and a reload of a save. Game-scope UIScripts reload on game load. [I]

---

## Implications for our mod

### File list (proposal)
```
civ7-site-finder/
  site-finder.modinfo
  text/en_us/ModInfoText.xml          (mod name/description)
  text/en_us/InGameText.xml           (LOC_SITEFINDER_*)
  data/input.xml                      (optional hotkey, shell scope)
  ui/site-finder-dock.js              (UIScripts: decorator → dock button)
  ui/site-finder-panel.js             (UIScripts: Panel + Controls.define)
  ui/site-finder-panel.html           (ImportFiles)
  ui/site-finder-panel.css            (ImportFiles; also styles .ssb__button-icon.site-finder)
  ui/site-finder-overlay.js           (UIScripts: overlay group helper)
  ui/site-finder-settings.js          (UIScripts: UI.getOption/setOption + modSettings fallback)
  ui/site-finder-icon.png             (ImportFiles)
  ui/scoring/*.js                     (UIScripts or ImportFiles: search/score logic)
```

### modinfo snippet
```xml
<Mod id="site-finder" version="0.1.0" xmlns="ModInfo">
  <Properties><Name>LOC_SITEFINDER_MOD_NAME</Name><Description>LOC_SITEFINDER_MOD_DESC</Description>
    <Authors>…</Authors><AffectsSavedGames>0</AffectsSavedGames></Properties>
  <Dependencies><Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME"/></Dependencies>
  <ActionCriteria><Criteria id="always"><AlwaysMet/></Criteria></ActionCriteria>
  <ActionGroups>
    <ActionGroup id="site-finder-shell" scope="shell" criteria="always">
      <Properties><LoadOrder>1000</LoadOrder></Properties>
      <Actions><UpdateDatabase><Item>data/input.xml</Item></UpdateDatabase>
               <UpdateText><Item>text/en_us/InGameText.xml</Item></UpdateText></Actions>
    </ActionGroup>
    <ActionGroup id="site-finder-game" scope="game" criteria="always">
      <Properties><LoadOrder>1000</LoadOrder></Properties>
      <Actions>
        <UpdateText><Item>text/en_us/InGameText.xml</Item></UpdateText>
        <ImportFiles><Item>ui/site-finder-panel.html</Item><Item>ui/site-finder-panel.css</Item>
                     <Item>ui/site-finder-icon.png</Item></ImportFiles>
        <UIScripts><Item>ui/site-finder-settings.js</Item><Item>ui/site-finder-overlay.js</Item>
                   <Item>ui/site-finder-panel.js</Item><Item>ui/site-finder-dock.js</Item></UIScripts>
      </Actions>
    </ActionGroup>
  </ActionGroups>
  <LocalizedText><File>text/en_us/ModInfoText.xml</File></LocalizedText>
</Mod>
```

### Button injection (decorator on the sub-system dock)
```js
import ContextManager from '/core/ui/context-manager/context-manager.js';
const TAG = "panel-site-finder";
const css = document.createElement("style");
css.textContent = `.ssb__button-icon.site-finder{background-image:url("fs://game/site-finder/ui/site-finder-icon.png");background-size:70%;background-repeat:no-repeat;background-position:center;}`;
document.head.appendChild(css);
function toggle() {
  if (ContextManager.getCurrentTarget?.()?.tagName == TAG.toUpperCase()) ContextManager.pop(TAG);
  else ContextManager.push(TAG, { singleton: true, createMouseGuard: true });
}
class SiteFinderDock {
  constructor(panel) { this.panel = panel; this.button = null; }
  beforeAttach() {}
  afterAttach() { if (!this.button) this.button = this.panel.addButton({ tooltip: "LOC_SITEFINDER_OPEN",
      modifierClass: "site-finder", callback: toggle, class: "site-finder-dock-button",
      audio: "data-audio-press-small", focusedAudio: "data-audio-focus-small" }); }
  beforeDetach() {} afterDetach() {}
}
Controls.decorate("panel-sub-system-dock", (p) => new SiteFinderDock(p));
```

### Popup class skeleton
```js
import Panel from '/core/ui/panel-support.js';
import { InputEngineEventName } from '/core/ui/input/input-support.js';
import { MustGetElement } from '/core/ui/utilities/utilities-dom.js';
import { FocusManager } from '/core/ui-next/services/focus-manager.js';
import NavTray from '/core/ui/navigation-tray/model-navigation-tray.js';
class SiteFinderPanel extends Panel {
  onEngineInputL = this.onEngineInput.bind(this); closeL = () => this.close();
  onInitialize() { super.onInitialize();
    this.radius = MustGetElement(".sf-radius", this.Root);       // <fxs-slider min="1" max="15" steps="14">
    this.priority = MustGetElement(".sf-priority", this.Root);   // <fxs-dropdown>
    this.rows = MustGetElement(".sf-rows", this.Root);           // inside <fxs-scrollable>
    this.priority.setAttribute("dropdown-items", JSON.stringify([{label:"LOC_SF_BALANCE"},{label:"LOC_SF_SCIENCE"}]));
    this.priority.setAttribute("selected-item-index", "0"); }
  onAttach() { super.onAttach();
    this.Root.addEventListener(InputEngineEventName, this.onEngineInputL);
    MustGetElement("fxs-close-button", this.Root).addEventListener("action-activate", this.closeL);
    this.radius.addEventListener(ComponentValueChangeEventName, (e) => this.state.radius = e.detail.value);
    this.priority.addEventListener("dropdown-selection-change", (e) => this.state.priority = e.detail.selectedIndex);
    FocusManager.get().setFocus(this.Root); }
  onDetach() { this.Root.removeEventListener(InputEngineEventName, this.onEngineInputL); SiteOverlay.clear(); super.onDetach(); }
  onReceiveFocus() { super.onReceiveFocus(); NavTray.clear(); NavTray.addOrUpdateGenericBack(); }
  onEngineInput(e) { if (e.detail.status != InputActionStatuses.FINISH) return;
    if (e.isCancelInput() || e.detail.name == "sys-menu") { this.close(); e.stopPropagation(); e.preventDefault(); } }
  // row click: Camera.lookAtPlot({x,y}, { zoom: 0.5 }); SiteOverlay.highlight([...])
}
Controls.define("panel-site-finder", { createInstance: SiteFinderPanel, description: "Site Finder",
  styles: ["fs://game/site-finder/ui/site-finder-panel.css"],
  content: ["fs://game/site-finder/ui/site-finder-panel.html"],
  classNames: ["panel-site-finder", "absolute", "inset-0"] });
```
Overlay helper: create `WorldUI.createOverlayGroup("SiteFinderOverlay", OVERLAY_PRIORITY.PLOT_HIGHLIGHT)` lazily, with one `addPlotOverlay()` for fills and one `addBorderOverlay(...)` for the selected site. Call `clearAll()` on close or when the player chooses "keep highlights" (decide). Add a sprite grid with `addText` for rank numbers.

### Open questions
1. Modal or not: with `createMouseGuard:true` the player cannot click or scroll the map while the popup is open. Should the panel be a non-modal side panel (no mouse guard, `shouldDarken:false`, smaller footprint) so the results and map can be used together? This needs an in-game test.
2. Does `addButton` from `afterAttach` survive dock re-attach (age transition, HUD reload) without duplicates? Drongo does not guard against this. Test it.
3. The `ModdingRegistry` mod slot is cleaner but unproven by installed mods. Is it worth testing as an alternative?
4. Confirm that `UIFileWatcher 1` hot-reloads mod files from the `Mods\` folder, and how to attach `UIDebugger`.
5. Confirm the `console.log` filtering at `UILogLevel 1`.
6. The localStorage "single key" bug: is it still present in 1.4.x? Following the `modSettings` convention is safe either way.
7. Overlay persistence: should highlights stay after the popup closes (then a LensManager layer is the better fit) or be cleared?
8. For "Place map tacks": use the base map-tack API or Detailed Map Tacks' `MapTackStore`? This is covered by another research note.
9. Performance: scoring every plot within the radius on the UI thread may stall. Consider chunking with `requestAnimationFrame` or `setTimeout`.
