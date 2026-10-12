# 09 - Civ VII modding basics, real-world conventions, and implications

Scope: read-only scouting of the Development Tools `.md` docs (the `.html` duplicates were not read), the three example mods, the Reference folder, the FireTuner and Uploader configs, the installed base/DLC `.modinfo` files, the four requested workshop mods (plus Wonder Race Alert 3656705275 as a second HUD-button example), and the local `Mods` and `Logs` folders. Nothing in the game folders or the user's AppData was modified. The `.exe` files were not run; only their `.config` files were read.

Markers used below:
- **[doc]** stated in the Development Tools `.md` docs.
- **[obs]** observed in installed game or workshop files, or in logs; not documented.
- **INFERRED** reasoned from the above, not proven.
- **UNVERIFIED** not tested in the game.

Versions and dates: Dev Tools `VERSION` = `1306154`. The latest log session is 2026-10-08 05:28 to 05:32 (logs are from that session, not today).

---

## 0. Summary

- A UI-only mod with localisation is the simple case: `scope="game"` UIScripts + ImportFiles + UpdateText, and `scope="shell"` UpdateDatabase (keybinding) + UpdateText. `AffectsSavedGames=0` [doc].
- Proven HUD-button route: `Controls.decorate("panel-sub-system-dock", ...)` then `addButton({...})`. Used by Drongo's City Planner and Wonder Race Alert, both additive, no base-file overrides [obs].
- Optional integration with Detailed Map Tacks (DMT): `<References>` for load order, plus an ActionGroup gated by a `ModInUse` criterion. Use `<Dependencies>` only for a hard requirement [doc, obs].
- Workshop folder id is not the mod id. Folder `3507297712` has mod id `detailed-map-tacks`; folder `3656705275` has mod id `wonder-race-alert`. `ModInUse`, `References` and `Dependencies` take the mod id [obs].
- `.modinfo` and DB/text changes need a full restart [doc]. `UIFileWatcher=1` reloads UI files on save [doc]. FireTuner gives live JS [doc].
- `Lua.log` does not exist in this install. Use `Modding.log`, `Database.log`, `Localization.log`, `UI.log`, `Scripting.log` (section 5).
- Reference is the game's UI and gameplay TypeScript source, plus typings. It is not a schema. Its tsconfigs extend an npm package `modding-sdk` that is not shipped (section 6).
- Undocumented but used everywhere: a root-level `<LocalizedText><File>` block for the mod's own name strings, and per-language `<Item locale="xx">` entries (sections 2.7, 4).

---

## 1. Local mods: location, enabling, restart, hot reload

### 1.1 Paths

- Local mods (Windows) [doc]: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\<any folder>\<any name>.modinfo`. Mac and Linux paths are also in the doc.
- Resolved here: `C:\Users\glazu\AppData\Local\Firaxis Games\Sid Meier's Civilization VII\Mods` exists and is **empty** (0 entries).
- Same parent folder: `AppOptions.txt` (game settings), `Logs\` (49 files, section 5.2), `Mods.sqlite` (about 1.2 MB; INFERRED: mod registry cache), `ModUserData\`, `MotD\`, `DNA\`.
- Workshop mods are **not** copied into `Mods\`. Steam installs subscriptions to `D:\SteamLibrary\steamapps\workshop\content\1295660\<workshop id>\` [obs].
- Discovery scan paths (from `Modding.log`, 05:28:34) [obs]: the workshop content folder, `Base\modules`, `Base`, `DLC`, `Saves\WorldBuilder`, and the user `Mods\` folder.
- The game's own content uses the same layout: `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\<id>\<id>.modinfo` and `DLC\<id>\modules\<id>.modinfo` [doc, obs].

### 1.2 Enabling

- Create a folder under `Mods\`, put a `.modinfo` in it, boot the game. The mod then appears in the **Add-Ons** menu to toggle [doc, Getting Started].
- Subscribed workshop mods are picked up automatically. `Modding.log` shows "Subscription Service - Detected 15 subscriptions" at the 05:28 boot [obs].
- `AffectsSavedGames=0` mods can be added or removed between sessions. `=1` mods cannot be added to or removed from a game in progress [doc].
- `EnabledByDefault` defaults to 1 if omitted [doc].
- AppOptions `[Modding] DisableModsOnStartupVersion 2` (comment: "Incremented version to disable mods at startup the first time after an update") [obs]. After a game patch, re-enable mods once.

### 1.3 Restart rules

- `.modinfo` files are only loaded at boot. Any change to them needs a full exit and restart [doc, Database Modding warning].
- Database and text changes: "Restart the game to see our new changes" [doc].
- A newly added mod folder is discovered at boot (`Modding.log`: "Discovering new mods..." at startup) [obs]. Treat "restart" as the rule for new mods too (INFERRED).

### 1.4 Hot reload and live tools

- `UIFileWatcher 1` in AppOptions: "Watch UI-loaded files for changes and automatically reload, 0 = Disabled, 1 = Enabled" [obs comment, doc]. Currently commented out, so default (0) [obs].
  - UNVERIFIED whether this reloads mod JS in UIScripts and CSS/HTML in ImportFiles. The doc says only "UI files".
  - Changing it means editing the user's `AppOptions.txt`. Not changed here; this is the user's decision.
- `EnableTuner 1`: FireTuner can connect to the running game [doc]. Currently `-1` (default) [obs].
- `EnableDebugPanels 1`: backtick key opens the debug panels [doc]. Currently `-1` (default) [obs].
- `UIDebugger 1`: "UI Remote Debugger", for Google Chrome inspection of HTML/CSS/JS [doc, obs comment]. Currently commented (default value shown as 1) [obs].
- `ModdingLogLevel` (0 Off to 4 Diagnostic); default 2 (Normal) [obs comment]. Raise to 3 or 4 for more `Modding.log` detail.

---

## 2. `.modinfo` structure

### 2.1 Root and Properties

- Root: `<Mod id="..." version="1" xmlns="ModInfo">` [doc].
- `id`: ASCII, lowercase, dashes, under 64 characters, with a developer prefix recommended (for example `fxs-`). Same id means "another version of the same mod", so ids must be unique [doc].
- `version`: a plain number on the root [doc]. Note: `version="1"` is not the same as `1.0` for `ModInUse` (section 2.3).
- `Properties` [doc]: `Name`, `Description`, `Authors`, `AffectsSavedGames` (default 1), `ShowInBrowser` (default 1), `EnabledByDefault` (default 1). `Package` and `PackageSortIndex` are documented as unused by the UI, yet every Firaxis and workshop mod sets `Package` [obs]. An empty `Name` hides the mod from Add-Ons [doc].
- Observed extras, undocumented and not used by the game: `Version`, `LastUpdated`, `URL`, `SpecialThanks`, `Compatibility` (Better Ribbon Info comments say these are for a third-party mod page tool), and custom `bzIcon`/`bzIconGlow` (Map Trix) [obs].

### 2.2 Dependencies, References, ReverseReferences

- `Dependencies`: a list of `<Mod id="..." title="LOC_..."/>`. Listed mods must be active, and load first [doc]. The `title` should equal that mod's `Name` [doc].
- Implicit dependencies for every mod [doc]: `core`, `base-standard`, `age-antiquity`, `age-exploration`, `age-modern`.
- `References`: a list of `<Mod .../>` that will "be loaded before this mod" [doc]. The doc does not say whether it is required. INFERRED: soft, ordering only.
  - Evidence [obs]: Map Trix (`3507072814`) lists `References` to `detailed-map-tacks` and `discovery-lens`. `discovery-lens` is not installed (no workshop folder, not in `Modding.log`'s target list), and Map Trix still loads (its groups appear in `Modding.log`). Map Trix has **no `<Dependencies>` element at all**.
- `ReverseReferences`: listed mods load after this one [doc].
- `Excludes`: suppresses an ActionGroup of another mod. Use with care, because load order matters [doc].

### 2.3 Recipe: optional dependency on another workshop mod (by mod id)

Ordering only:
```xml
<References>
  <Mod id="detailed-map-tacks" title="LOC_MOD_DETAILED_MAP_TACKS_NAME" />
</References>
```

Conditional content, which is the real optional dependency:
```xml
<ActionCriteria>
  <Criteria id="dmt-active">
    <ModInUse>detailed-map-tacks</ModInUse>
  </Criteria>
  <!-- exact version match, if we ever want to pin: -->
  <Criteria id="dmt-active-v1">
    <ModInUse>
      <Version>1</Version>
      <Value>detailed-map-tacks</Value>
    </ModInUse>
  </Criteria>
</ActionCriteria>
```
- `ModInUse` is documented [doc]; the `<Version>`/`<Value>` child form is documented, and `Version` is an exact string match [doc]. DLC uses it this way: Babylon gates on `ModInUse` for Gilgamesh, Ottomans, Qajar; Assyria gates on `ModInUse` for `friedrich-xerxes-alt` and `gilgamesh` [obs].
- DMT's own root has `version="1"` and no `Version` in Properties [obs, note 01]. A `<Version>1</Version>` check would therefore pin to DMT build "1". INFERRED: tradeoff, since DMT may stop bumping this number.

Hard dependency: use `<Dependencies>` instead. That makes the mod unusable without DMT. For our mod, use `ModInUse` (optional).

Mod id vs workshop id: `ModInUse`, `References` and `Dependencies` need the mod id. The "Target Mods" list in `Modding.log` prints the real ids, for example `detailed-map-tacks (Detailed Map Tacks)` [obs].

### 2.4 ActionCriteria

- `<Criteria id="...">` ids are unique per mod. Children are ANDed by default; `any="true"` makes them OR [doc].
- Documented types [doc]: `AlwaysMet`, `NeverMet`, `AgeInUse`, `AgeWasUsed`, `AgeEverInUse`, `ConfigurationValueMatches` (Group, ConfigurationId, Value), `ConfigurationValueContains` (comma list), `MapInUse` (matches the frontend `Maps.File` column), `RuleSetInUse` (`RULESET_STANDARD`), `GameModeInUse` (`WorldBuilder`, `SinglePlayer`, `HotSeat`, `MultiPlayer`), `LeaderPlayabe` (doc typo; likely `LeaderPlayable`), `CivilizationPlayable`, `ModInUse`.
- Negation: `<AgeInUse inverse="1">AGE_ANTIQUITY</AgeInUse>` [doc].
- Observed, undocumented: `AgeAtOrBefore` (age-* modules) and `ModIsEnabled` (England DLC uses it for its shell-side gating) [obs].

### 2.5 ActionGroups: scope, criteria, LoadOrder

```xml
<ActionGroup id="game-my-mod" scope="game" criteria="always">
  <Properties><LoadOrder>100</LoadOrder></Properties>
  <Actions>...</Actions>
</ActionGroup>
```
- `scope="game"`: in-game gameplay and UI. `scope="shell"`: main menu and age-transition screens [doc].
- `LoadOrder`: documented only by example (`10`) [doc]. Observed values: `-1` (core's schema update, commented "Ensure this schema update happens FIRST"), `10`, `20`, `100`, `999` (base-standard), `1000` (Map Trix, Better Ribbon Info) [obs]. INFERRED: lower loads first.
- `ActionGroup` ids must be unique per mod, not globally [doc].

### 2.6 Action types

| Action | Source | Status and notes |
|---|---|---|
| `UpdateDatabase` | `.xml` or `.sql` | Gameplay DB for `game` scope, frontend DB for `shell` scope [doc] |
| `UpdateText` | `.xml` or `.sql` | Localisation DB [doc] |
| `UpdateIcons` | `.xml` or `.sql` | Icon DB, `IconDefinitions` rows with `fs://game/<mod-id>/...` paths [doc] |
| `UpdateColors` | `.xml` or `.sql` | Colour DB [doc] |
| `UpdateArt` | (none yet) | "Won't be useful for modders until art tools are released" [doc] |
| `ImportFiles` | any file | Copies files into the game's virtual FS. Also replaces base files with the same relative path [doc] (section 3) |
| `UIScripts` | `.js` | Loads UI scripts. Default is an ES module (`import` works) [obs: Drongo's dock uses `import` and is listed with no attribute] |
| `UIShortcuts` | `.html` | Adds pages to the debug menu; needs `EnableDebugPanels 1` [doc]. Core lists about 14 debug and sandbox pages [obs] |
| `UpdateVisualRemaps` | `.xml` or `.sql` | Visual remap DB [doc] |
| `MapGenScripts`, `ScenarioScripts` | `.js` | Gameplay scripts [doc] (not relevant to us) |
| `UIAudioRules` | `.json` | Observed in core and base: `ui-next/audio-rules.json` [obs] |
| `Excludes` | (element) | Section 2.2 [doc] |

### 2.7 Item attributes and the root LocalizedText block (observed, undocumented)

- `<Item locale="de_DE">path</Item>` loads that file only for that language. Used by DMT, Map Trix, Wonder Race Alert, and core [obs]. INFERRED reason: per-language loading.
- `<Item module="false">path</Item>`: used once, in base-standard for `ui/tuner-input/tuner-input.js` [obs]. INFERRED: loads as a classic script, not an ES module.
- `<Item platform="PS4">`, `<Item platform="XboxOne">`, `<Item platform="Switch">`, `<Item ecosystem="game-center">`: platform and store filters, used in core [obs].
- Root-level localisation block, present in 46 of 46 installed modinfos and all four workshop mods [obs]:
```xml
<LocalizedText>
  <File>text/en_US/ModInfoText.xml</File>
</LocalizedText>
```
  The referenced file defines the mod's own `LOC_..._NAME` and `LOC_..._DESCRIPTION` (Map Trix: `<EnglishText><Row Tag="LOC_MOD_BZ_MAP_TRIX_NAME"><Text>Map Trix</Text></Row>...`) [obs]. INFERRED: this is what the Add-Ons screen reads. Include it.
- Paths in `Item` are relative to the `.modinfo` folder [doc]. Cross-mod file references use `{mod-id}path` [doc]; not observed in use.

### 2.8 Minimal modinfo: UI-only mod with localisation

```xml
<?xml version="1.0" encoding="utf-8"?>
<Mod id="dev-hello-ui" version="1" xmlns="ModInfo">
  <Properties>
    <Name>LOC_MOD_HELLO_UI_NAME</Name>
    <Description>LOC_MOD_HELLO_UI_DESCRIPTION</Description>
    <Authors>Your name</Authors>
    <Package>Mod</Package>
    <AffectsSavedGames>0</AffectsSavedGames>
  </Properties>
  <Dependencies>
    <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME" />
  </Dependencies>
  <ActionCriteria>
    <Criteria id="always"><AlwaysMet /></Criteria>
  </ActionCriteria>
  <ActionGroups>
    <ActionGroup id="game-hello-ui" scope="game" criteria="always">
      <Properties><LoadOrder>100</LoadOrder></Properties>
      <Actions>
        <UpdateText>
          <Item>text/en_US/ModuleText.xml</Item>
        </UpdateText>
        <ImportFiles>
          <Item>ui/hello/hello.css</Item>
        </ImportFiles>
        <UIScripts>
          <Item>ui/hello/hello.js</Item>
        </UIScripts>
      </Actions>
    </ActionGroup>
  </ActionGroups>
  <LocalizedText>
    <File>text/en_US/ModInfoText.xml</File>
  </LocalizedText>
</Mod>
```

`text/en_US/ModInfoText.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<Database>
  <EnglishText>
    <Row Tag="LOC_MOD_HELLO_UI_NAME"><Text>Hello UI</Text></Row>
    <Row Tag="LOC_MOD_HELLO_UI_DESCRIPTION"><Text>A test UI mod.</Text></Row>
  </EnglishText>
</Database>
```

The example mods in `Examples\` contain no UI scripts, ImportFiles or Items with UI paths. All of them are DB and text only, so UI conventions come from the base game and the workshop mods [obs].

---

## 3. Adding new files vs overriding base files (ImportFiles path semantics)

### 3.1 Adding files

- Non-script assets (`.html`, `.css`, `.png`) go in `ImportFiles`. Scripts go in `UIScripts` [obs: DMT, Drongo, Wonder Race Alert, Map Trix all follow this]. The doc example also puts a `.js` under `ImportFiles` [doc], and Map Trix does the same for one file [obs]. Use `UIScripts` for scripts.
- Helper modules that are only reached by `import` do not need to be listed. DMT's `dmt-adjacency-rules.js` and one modifier file are absent from its modinfo and still load (note 01, section 1.2) [obs].

### 3.2 Virtual paths

- An imported file is served at `fs://game/<mod-id>/<same relative path>` [doc for icons]. Example [obs]: Wonder Race Alert CSS uses `url("fs://game/wonder-race-alert/ui/wonder-alert-icon.png")`.
- Imports from base game code use absolute module paths: `import ... from '/core/ui/context-manager/context-manager.js'` in Drongo's dock [obs]. Base modules import each other relatively (base `ui/app.js` imports `'../ui-next/tooltips/plot-tooltip/plot-tooltip.js'`) [obs].
- A mod's own modules can import each other as `fs://game/<mod-id>/...` [obs: DMT, note 01 section 1.3].

### 3.3 Replacing base files

- Doc: an `ImportFiles` entry with the same name and path (relative to the `.modinfo`) replaces the file [doc].
- Evidence [obs]: Map Trix ImportFiles includes `ui-next/tooltips/plot-tooltip/plot-tooltip.js`, and the base game has `Base\modules\base-standard\ui-next\tooltips\plot-tooltip\plot-tooltip.js`. However, base-standard's modinfo contains **no** `ui-next` entries at all. The base game loads that file through a JS import. So whether Map Trix actually replaces it is **UNVERIFIED**.
- Replacement of any kind means last-loaded wins, so two mods that replace the same file conflict (INFERRED).
- Recommendation: do not replace base files. Use decorators (section 3.4).

### 3.4 Decorators and mod slots (preferred, proven)

- `Controls.decorate(componentTag, provider)` attaches lifecycle hooks to an existing engine component without replacing its file [obs, plus Reference]. Reference: `core/ui/component-support.ts:1673`. Its comment says it does not construct decorators for existing instances, so register at script load (INFERRED: scripts load before the first attach; Drongo and Wonder work this way).
- Used by at least 6 installed workshop mods [obs]: DMT (mini-map, plot icons, keyboard mapping), Drongo's City Planner and Wonder Race Alert (dock), Map Trix (several panels), Also City Hall (`bz-city-hall`, 3507102289), Friends and Rivals, No Gradients, Efs Custom Map Search, and Leonardfactory's policy previews.
- Mod slots, Reference only: `core/ui/modding-registry-handler/modding-registry-handler.ts` exposes `ModdingRegistry.add({componentTag, parentID, modSlot?, attributes?})`. Base panels call `ModdingRegistry.attachModElements(...)` at: `panel-sub-system-dock`, `panel-diplo-ribbon`, `panel-yield-banner`, `panel-city-details`, `mini-map__lens-panel`, `panel-production-chooser`, and `root-game` [obs, Reference]. The dock creates `#panel-sub-system-dock-mod-slot` (`panel-sub-system-dock.ts:217`). No installed mod calls `ModdingRegistry.add` [obs]. UNVERIFIED in game.
- Dock button API, Reference `base-standard/ui/sub-system-dock/panel-sub-system-dock.ts`:
  - `ButtonData` = `{tooltip, callback, modifierClass, class, audio?, focusedAudio?, turnCounter?}` (line 23).
  - `addButton(buttonData)` is declared `private` in the TypeScript (line 333), yet Drongo and Wonder Race Alert call it from plain JS [obs]. It works in the shipped build, but is fragile across game patches.
  - `modifierClass: "advanced-start"` reuses a base icon class with no custom art [obs]. A custom icon needs a CSS rule for `.ssb__button-icon.<ourClass>` plus an ImportFiles PNG (Wonder Race Alert pattern) [obs].
- Panel open and close: `ContextManager.push("panel-x", {singleton: true, createMouseGuard: true})` and `ContextManager.pop(...)`, `ContextManager.getCurrentTarget?.()` [obs, Reference `core/ui/context-manager/context-manager.ts`].
- Hotkeys: `ContextManager.registerEngineInputHandler(handler)`; the handler returns `InputHandlerState.Handled` or `Active` [obs, Drongo]. Input actions are DB rows in the shell scope (section 4 and 8).

---

## 4. Localisation

### 4.1 File formats [doc]

XML:
```xml
<?xml version="1.0" encoding="utf-8"?>
<Database>
  <LocalizedText>
    <Row Tag="LOC_X_NAME" Language="en_US"><Text>Cylinder Seals</Text></Row>
  </LocalizedText>
</Database>
```
- `<EnglishText>` is shorthand for `en_US` (no `Language` attribute) [doc].
- Overrides for existing text: `<Replace Tag="..." Language="en_US"><Text>...</Text></Replace>` [doc, Narrative Events section].

SQL:
```sql
INSERT OR REPLACE INTO LocalizedText (Tag, Language, Text)
VALUES ('LOC_X_NAME', 'en_US', 'Cylinder Seals');
```
- One format per file. Do not mix XML and SQL in the same file [doc].

Inline markup seen in the text [doc, obs]: `[icon:YIELD_FOOD]`, `[n]` (newline), `{1}` (placeholder), `{1_turns: plural 1?turn; other?turns}` (plural form, illustrative; the real strings in the logs are in another language).

### 4.2 Multiple languages

- Documented: add more `Row`s with other `Language` codes in the same file. "You do not need a new file to provide translations" [doc].
- Observed: per-language files via `<Item locale="xx_XX">` in `UpdateText`, e.g. DMT `l10n/de_DE_Text.xml` and Map Trix `text/de_DE/InGameText.xml` [obs].
- Language codes in use [obs, core.modinfo]: `en_US`, `de_DE`, `es_ES`, `fr_FR`, `it_IT`, `ja_JP`, `ko_KR`, `pl_PL`, `pt_BR`, `ru_RU`, `zh_Hans_CN`, `zh_Hant_HK`. Folder names differ in case in workshop mods (`en_us` vs `en_US`), which is harmless.
- Key naming [obs]: `LOC_<MODULE>_<THING>_NAME` / `_DESCRIPTION`, for example `LOC_MOD_DETAILED_MAP_TACKS_NAME`.
- Missing keys: Localization.log reports "A resource bundle lookup returned a result from the root locale" [obs]. INFERRED: non-English users see English fallback, so always provide `en_US`.

### 4.3 Scope

- Text used in game needs `UpdateText` in `scope="game"`. Text used in menus needs `scope="shell"` too. "Things that are loaded in the game scope are not automatically loaded in the shell scope" [doc].
- Input-binding labels (`LOC_...` in `Input.xml`) show on the options screen, so they need shell-scope text. DMT and Drongo both load their text in shell scope [obs].

---

## 5. Debugging

### 5.1 Which log answers which question

Folder: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\` [doc, obs].

| Question | File | Notes |
|---|---|---|
| Which mods were discovered, which ActionGroups activated | `Modding.log` | Each active group prints as `* <group-id>` under its mod. Detail level via `ModdingLogLevel` [obs] |
| Database XML/SQL load or validation errors | `Database.log` | Doc's first stop for DB errors [doc]. Shows "Validating Foreign Key Constraints" and "Passed Validation" lines [obs] |
| Localisation parse errors, missing or malformed text | `Localization.log` | Examples [obs]: "Failed to evaluate parameter", "conditional transform: End of string while searching for ';'" |
| UI JS console output, HTML parse errors, JS traces | `UI.log` | Each trace line appears as `While executing JS fs://game/...js:line:col`. Mod console output appears here too [obs] |
| Gameplay scripts (V8 engine) | `Scripting.log` | Only shows start and stop of the script engine here [obs] |
| No Lua log | (none) | `Lua.log` does not exist in this install; the docs do not mention one |

- The Logs are from the last session. INFERRED: they are overwritten at the next launch, so copy them before restarting.
- Mod-owned logging pattern [obs]: Better Ribbon Info's `ModLogger` prints `ModLogger configured ... sink warn` to UI.log. We could copy this pattern for our own debug output.

### 5.2 Logs folder contents (names only, 49 files)

```
AI_Market.csv  AI_MovementPlanning.csv  AI_Operation.csv  AI_Targets.csv  AI_UnitEfficiency.csv
AStar_APP.csv  AStar_GC.csv  AppLogging.log  AppStateLoadGame.log  ArtDef.log  Audio.log
AudioCiv.log  AudioContext.log  AutoArchive.csv  CloudPrograms.log  CodeRedemption.log
Database.log  Engine.log  GameCore.log  GameCoreAppConfig.log  GameCoreAppMetagaming.log
GameValue.log  General.log  GraphicSettings.log  JsonParser.log  Layout.log  Localization.log
MemoryUsage.log  Metaprogression.log  Modding.log  MotD.log  NarrativeStories.log
Player_Legacies.csv  Player_Unlocks.csv  Profile.csv  Renderer.log  Scripting.log  Serializer.log
Startup.log  T2GP.log  Telemetry.log  UI.log  VFXSystem.log  net_connection_debug.log
net_game_launch.log  net_message_debug.log  net_transport_debug.log  networkservices.log  twokdna.log
```

### 5.3 FireTuner (`D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII Development Tools\FireTuner\Win64\`)

- `FireTuner2.exe` and `FireTuner2.exe.config`: a .NET Framework client. The config contains only assembly binding redirects [obs].
- `Firaxis.*.dll` (Atf.Core, Collections, Controls, Error, Interfaces, IO, MathEx, Net, Reflection, Threading, TypeGeneration, Utility): Firaxis internal framework [obs]. INFERRED: the tuner's protocol and UI.
- `Microsoft.CodeAnalysis*.dll` (Roslyn): INFERRED: the tool can compile or evaluate code snippets. Not verified.
- `Newtonsoft.Json.dll` and `System.*` support libraries [obs].
- There is no readme in the folder [obs].
- Use [doc]: "lets you run Javascript commands, and provides access to a UI that functions as an in-game editor to help you debug your mods." Enable with `EnableTuner 1` in AppOptions.
- The port and transport are not in the config files. UNVERIFIED: how it connects.

### 5.4 Debug panels, UI debugger, JS errors

- `EnableDebugPanels 1` then backtick opens the debug panels. `UIShortcuts` pages appear there [doc]. Core lists debug pages such as `ui/debug/html-preview.html`, `asian-font.html`, `stylized-markup-text.html`, plus the icon and movie browsers and the sandbox pages [obs, core.modinfo].
- `UIDebugger 1` gives a Chrome-based inspector for HTML, CSS and JS [doc]. The port is not documented. UNVERIFIED.
- JS errors: UI.log has `While executing JS` trace lines with file and line. No uncaught exception stack traces appear in the 2026-10-08 logs (a search for `TypeError` and `ReferenceError` returned nothing). UNVERIFIED how they look.
- Test isolation: UIShortcuts pages can host a standalone test panel without a full game (INFERRED).

---

## 6. The Reference folder

- Layout: `Reference\base-standard\` and `Reference\core\`, each with `scripts\`, `ui\`, `ui-next\`.
- File counts [obs]: 714 `.ts`, 250 `.tsx`, 241 `.scss`, 105 `.html`, 25 `.json`, 12 `.js`.
- Content: the TypeScript source of the game's UI and gameplay scripts. The shipped `Base\` tree has the compiled `.js` (for example `Base\modules\base-standard\ui\app.js` alongside `Reference\base-standard\ui\app.tsx`) [obs]. Version match with the installed build is not verified.
- Not a schema. There is no XSD and no modinfo or DB schema anywhere in the folder [obs].
- Typings: `core/ui/index.d.ts`, `base-standard/ui/index.d.ts`, `ui-next/index.d.ts`, `base-standard/scripts/index.d.ts`. Each tsconfig says `"extends": "modding-sdk/tsconfig.ui.json"` or `"modding-sdk/tsconfig.gameplay.json"`, and the index files `/// <reference types="modding-sdk/types/gameplay" />`. The `modding-sdk` package is **not shipped**: it is not in Reference and not under the Dev Tools or game folders [obs]. Type checking needs that package, which we don't have.
- Stack [obs]: `ui-next` components import SolidJS (300 files under Reference mention `solid-js`; the shipped build has `core\vendor\solid-js`). The older `ui` tree uses custom Web Components (`fxs-*`). INFERRED: the newer panels are Solid, the older ones are Web Components. Pick one per panel.
- Engine bridge [obs]: `core/ui/cohtml.js` documents the `engine` module, which is Coherent UI (`engine.on`, `engine.trigger`, `engine.whenReady`).
- Practical uses:
  1. Grep for real APIs and class names: `component-support.ts` (`Controls`, `decorate`), `context-manager/context-manager.ts`, `modding-registry-handler/`, `utilities/utility-serialize.ts` (the `Catalog` persistence API), `options/model-options.ts` (`Options.addOption`, `addInitCallback`), `base-standard/ui/sub-system-dock/panel-sub-system-dock.ts`.
  2. Find the exact panel and component tags to decorate.
  3. Read base code for patterns to copy, instead of guessing.

---

## 7. Publishing with SteamWorkshopUploader

- Tool: `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII Development Tools\SteamWorkshopUploader\Win64\SteamWorkshopUploader.exe` [obs]. The docs say only that the uploader is for putting mods on the Workshop [doc, Getting Started].
- Config [obs]: `ConsumerAppId` 1295660 (Civilization VII, the app mods belong to) and `CreatorAppId` 3688890 (the uploader's own Steam app, also in its `steam_appid.txt`). The config also writes a `SteamUploader.log` trace file.
- Expected flow [INFERRED from general Workshop practice and the workshop folders]: Steam running and logged in with the game; point the uploader at the mod folder (the `.modinfo` must sit at its root, as all five installed workshop mods do [obs]); set title, description and visibility; add a `thumbnail.png` as the preview (Drongo's City Planner ships one [obs]); Steam assigns the workshop id; subscribers get the files under `steamapps\workshop\content\1295660\<id>\`.
- Uploading is a public action. Do it only on explicit go-ahead.

---

## 8. Installed workshop modinfo survey

### 8.1 Per-mod facts [obs, all from the `.modinfo` files]

| Folder id | Mod id, version | Deps / refs | Criteria | Scopes and actions | Notable |
|---|---|---|---|---|---|
| `3507297712` | `detailed-map-tacks`, `1` | Deps: `base-standard`. No refs | `always` (AlwaysMet) only | shell: UIScripts (1, keyboard-mapping decorator), UpdateDatabase `config/Input.xml`, UpdateText. game: ImportFiles (15 items: 9 PNG and html/css), UIScripts (31 JS), UpdateDatabase `data/interface-modes.xml`, UpdateText (11 locale-specific items via `locale`, plus en_US) | No `LoadOrder`. Root `LocalizedText` File `text/en_us/ModuleText.xml` and `l10n/ModuleText.xml`. `Package` Mod. `AffectsSavedGames` 0. Replaces no base files (note 01) |
| `3734169112` | `drongos-city-planner`, `1.0.1` | Deps: `base-standard`. No refs | `always` | shell: UpdateDatabase `modules/database/input.xml` (F9 hotkey). game: UpdateText `modules/text/City-Planner-Text.sql` (SQL), UIScripts (`city-planner-dock.js`, `city-planner-panel.js`), ImportFiles (panel `.html`, `.css`) | No `LoadOrder`. Root `LocalizedText` `modules/text/en_us/ModuleText.xml`. Does not depend on DMT; detects it at runtime (note 02). `AffectsSavedGames` 0 |
| `3507072814` | `bz-map-trix`, `4.2.0` | **No `Dependencies`**. Refs: `detailed-map-tacks`, `discovery-lens` (not installed) | `always` (`<AlwaysMet/>`) | shell (LoadOrder 1000): UIScripts (3 files), UpdateDatabase `config/bz-input.xml`, UpdateText (8 locales). game (LoadOrder 1000): ImportFiles (7 items: CSS and `ui-next/tooltips/plot-tooltip/plot-tooltip.js`), UIScripts (33), UpdateText (locales) | Root `LocalizedText` lists 8 `ModInfoText.xml` files. Non-standard `bzIcon`/`bzIconGlow` elements. `Package` Mod. `AffectsSavedGames` 0. `README.md` present, not read |
| `3640416186` | `better-ribbon-info`, `1.2.0` | Deps: `base-standard`. No refs | `always` (`<AlwaysMet />`) | shell (LoadOrder 1000): UIScripts (helpers, options), UpdateText `text/en_US/InGameText.xml`. game (LoadOrder 1000): UIScripts (same helpers and options, plus `scripts/ui/diplo-ribbon/diplo-ribbon.js`), UpdateText | Root `LocalizedText` `text/en_US/ModInfoText.xml`. Extra metadata (`URL`, `SpecialThanks`, `Compatibility`). No `Package` element. Options via `UI.setOption` (section 8.2) |

Additional example (not one of the four requested) [obs]:

| Folder id | Mod id, version | Notable |
|---|---|---|
| `3656705275` | `wonder-race-alert`, `2` | Second HUD-button example: `Controls.decorate('panel-sub-system-dock', ...)` with `addButton`, custom PNG icon via `fs://game/wonder-race-alert/ui/...`. Shell UpdateText (12 items: en_US plus 11 locales). Game: UpdateText LoadOrder 10, UI group LoadOrder 100 |

Also [obs]: Modding.log is from the 2026-10-08 05:28 session. Mods subscribed later (for example `3734169112`) are not in it.

### 8.2 Conventions

1. Folder id is the Workshop id; the mod id is a separate name. Use mod ids in `ModInUse`, `References` and `Dependencies`.
2. The four requested mods and Wonder Race Alert declare `base-standard` as a dependency. Map Trix declares no dependency at all. All five use `AffectsSavedGames` 0, and every criteria set uses `AlwaysMet`.
3. Two action groups are the norm: `shell` for `UpdateDatabase` (keybindings) and text, `game` for `UIScripts`, `ImportFiles` and text.
4. Keybindings live in `config\Input.xml` (or `modules\database\input.xml`), loaded in **shell** scope, with `InputActions` and `InputActionDefaultGestures`. Gestures in use: DMT `F2` and `X`, Drongo `F9`. Check collisions before choosing a key.
5. Scripts go in `UIScripts`; HTML, CSS and PNG go in `ImportFiles`.
6. Settings [obs, Better Ribbon Info]: `UI.setOption("user", "Mod", "<mod-id>.<key>", value)`, then `Configuration.getUser().saveCheckpoint()`. Options appear on the options screen via `Options.addOption` and `Options.addInitCallback`. Do not copy its `localStorage.clear()` branch, which wipes all local storage when more than one item exists.
7. Root `<LocalizedText><File>` block for the mod's name and description (all modinfos).
8. Cross-mod features use `References` for order and no `ModInUse` in the four requested mods. DLC content uses `ModInUse` heavily (section 2.3).

---

## Implications for our mod

### Recommended folder layout

Keep source in the project and deploy to `Mods\` later (copy, or a directory junction; INFERRED that a junction works, UNVERIFIED). Never write into the game folders.

```
D:\work\ideas\civ7-mods\mod\<prefix>-settle-scout\
  <prefix>-settle-scout.modinfo
  thumbnail.png                          (for Workshop later)
  config\Input.xml                       (hotkey, shell scope)
  text\en_US\ModInfoText.xml             (mod Name/Description; root LocalizedText)
  text\en_US\ModuleText.xml              (game UI strings; LOC_SETTLE_SCOUT_*)
  ui\hud\settle-scout-dock.js            (Controls.decorate on panel-sub-system-dock + addButton)
  ui\hud\settle-scout-dock.css           (icon rule, optional)
  ui\panel\settle-scout-panel.js         (popup custom element and logic)
  ui\panel\settle-scout-panel.html
  ui\panel\settle-scout-panel.css
  ui\core\*.js                           (analysis: pure functions, no engine calls; import-only)
  ui\dmt\settle-scout-dmt.js             (DMT bridge; loaded only when DMT is active)
  text\<locale>\ModuleText.xml           (later: other languages via locale attribute)
```
- Add `data\` only if we really need gameplay DB rows. If we do, set `AffectsSavedGames` to 1.

### modinfo draft

```xml
<?xml version="1.0" encoding="utf-8"?>
<Mod id="dev-settle-scout" version="1" xmlns="ModInfo">
  <Properties>
    <Name>LOC_MOD_SETTLE_SCOUT_NAME</Name>
    <Description>LOC_MOD_SETTLE_SCOUT_DESCRIPTION</Description>
    <Authors>TODO</Authors>
    <Package>Mod</Package>
    <AffectsSavedGames>0</AffectsSavedGames>
  </Properties>
  <Dependencies>
    <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME" />
  </Dependencies>
  <References>
    <Mod id="detailed-map-tacks" title="LOC_MOD_DETAILED_MAP_TACKS_NAME" />
  </References>
  <ActionCriteria>
    <Criteria id="always"><AlwaysMet /></Criteria>
    <Criteria id="dmt-active"><ModInUse>detailed-map-tacks</ModInUse></Criteria>
  </ActionCriteria>
  <ActionGroups>
    <ActionGroup id="shell-settle-scout" scope="shell" criteria="always">
      <Actions>
        <UpdateDatabase>
          <Item>config/Input.xml</Item>
        </UpdateDatabase>
        <UpdateText>
          <Item>text/en_US/ModuleText.xml</Item>
        </UpdateText>
      </Actions>
    </ActionGroup>
    <ActionGroup id="game-settle-scout" scope="game" criteria="always">
      <Properties><LoadOrder>100</LoadOrder></Properties>
      <Actions>
        <UpdateText>
          <Item>text/en_US/ModuleText.xml</Item>
        </UpdateText>
        <ImportFiles>
          <Item>ui/hud/settle-scout-dock.css</Item>
          <Item>ui/panel/settle-scout-panel.html</Item>
          <Item>ui/panel/settle-scout-panel.css</Item>
        </ImportFiles>
        <UIScripts>
          <Item>ui/hud/settle-scout-dock.js</Item>
          <Item>ui/panel/settle-scout-panel.js</Item>
        </UIScripts>
      </Actions>
    </ActionGroup>
    <ActionGroup id="game-settle-scout-dmt" scope="game" criteria="dmt-active">
      <Properties><LoadOrder>110</LoadOrder></Properties>
      <Actions>
        <UIScripts>
          <Item>ui/dmt/settle-scout-dmt.js</Item>
        </UIScripts>
      </Actions>
    </ActionGroup>
  </ActionGroups>
  <LocalizedText>
    <File>text/en_US/ModInfoText.xml</File>
  </LocalizedText>
</Mod>
```

Hotkey file (`config/Input.xml`; KEY_F8 is a placeholder, check collisions with DMT F2 and X, Drongo F9):
```xml
<?xml version="1.0" encoding="utf-8"?>
<Database>
  <InputActions>
    <Row ActionId="open-settle-scout" DeviceType="Keyboard" Name="LOC_SETTLE_SCOUT_OPEN" Description="LOC_SETTLE_SCOUT_OPEN" />
  </InputActions>
  <InputActionDefaultGestures>
    <Row ActionId="open-settle-scout" Index="0" GestureType="KBMouse" GestureData="KEY_F8" />
  </InputActionDefaultGestures>
</Database>
```

HUD button sketch, copied from Drongo's pattern (UNVERIFIED for our panel):
```js
// ui/hud/settle-scout-dock.js
import ContextManager from '/core/ui/context-manager/context-manager.js';

function toggleSettleScout() {
    const current = ContextManager.getCurrentTarget?.();
    if (current?.tagName == "PANEL-SETTLE-SCOUT") { ContextManager.pop(current); return; }
    ContextManager.push("panel-settle-scout", { singleton: true, createMouseGuard: true });
}

class SettleScoutDockDecorator {
    constructor(panel) { this._panel = panel; }
    beforeAttach() {}
    afterAttach() {
        this._panel.addButton({
            tooltip: "LOC_SETTLE_SCOUT_OPEN",
            modifierClass: "advanced-start",
            callback: toggleSettleScout,
            class: "tut-settle-scout",
            audio: "data-audio-press-small",
            focusedAudio: "data-audio-focus-small",
        });
    }
    beforeDetach() {}
    afterDetach() {}
}
Controls.decorate("panel-sub-system-dock", (panel) => new SettleScoutDockDecorator(panel));
```

### Decisions and risks

1. Additive only. Decorate `panel-sub-system-dock`, never replace a base file. Replacement conflicts with Map Trix (`plot-tooltip.js`) and any other mod that does the same.
2. DMT is optional. Gate every DMT call behind the `dmt-active` group. The main panel must still work without DMT (for example, show the analysis and disable "place tack").
3. DMT's only write path is the engine event `AddMapTackRequest` with `{x, y, type, classType, validStatus, yieldDetails}`. `validStatus` must be an object. DMT does no validation, so we validate first. See note 01, section 4.1.
4. Settings, if any: use `UI.setOption("user", "Mod", "dev-settle-scout.<key>", v)` plus `Configuration.getUser().saveCheckpoint()`, not `localStorage`.
5. `AffectsSavedGames` 0 keeps the mod toggleable between sessions. Any gameplay DB rows flip it to 1.
6. Localisation: all strings in `en_US` first. Add locales later with `locale` items.
7. Stack: follow the Web Components or Solid split of the target panel (section 6). Decide before writing the panel.
8. Dev loop: set `UIFileWatcher 1`, `EnableTuner 1`, `EnableDebugPanels 1` in AppOptions (the user's call, not changed here). Restart for any `.modinfo` or text change.

### Open questions to test in the game

- Does `UIFileWatcher` reload mod JS (UIScripts) and mod CSS/HTML (ImportFiles)?
- How does FireTuner connect (port, transport)?
- Does `References` actually load DMT first? Check `Modding.log` order and our group's behaviour.
- Does `ModInUse` with `<Version>1</Version>` match DMT's `version="1"`? Test with and without.
- Is `addButton` still callable from plain JS after game patches (it is `private` in the TypeScript source)?
- Does the root `<LocalizedText>` block control the Add-Ons name, and are `en_US` strings needed there?
- Where to get the `modding-sdk` typings package for type-checking.
- Confirm the default ES-module behaviour of `UIScripts` for our files.
