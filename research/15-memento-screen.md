# 15 — Memento selection screen: how a mod can add rank badges

Goal: a new UI mod (`memento-advisor`, files `mma-*`) that adds a rank badge (1–6) to the suggested cards of the memento selection screen («Выбор памятных вещей» / "Choose Mementos"). It also adds a small switch between rankings: Balanced plus one per victory (Culture, Science, Economic, Military). The default is the victory that suits the chosen leader and civilization.

Legend: **[V]** = verified in code, data or logs. **[I]** = inferred, not confirmed in game.

Abbreviations:
- `GAME` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`
- `CORE` = `GAME\Base\modules\core`
- `BS` = `GAME\Base\modules\base-standard`
- `WS` = `D:\SteamLibrary\steamapps\workshop\content\1295660`
- `MMF` = `WS\3508036392` (Mattifus's Memento Editor, mod id `MattifusMementoFilters`)
- `LOGS` = `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs`

Game build: 1.5.0.44. The game files are dated 2026-10-01.

---

## 0. Summary

| Question | Answer |
|---|---|
| Which screen does the user see? | The **ui-next (SolidJS) component `memento-select`**, shown as a tab inside the legacy element `create-game-sp`. Mattifus's Memento Editor is enabled ([V] `LOGS\Modding.log`, target mods), so the factory actually running is **Mattifus's replacement**, registered with `overridePriority: 1200`. The «Показывать только доступные» checkbox and the optional 3rd slot come from that mod. [V] |
| Does a card carry its memento id? | **No.** No attribute holds `mementoTypeId`. Each card's `Icon` div does carry `name="url('blp:<mementoIcon>')"`, and the 133 memento icons are unique. That icon is the key. [V] |
| Safest hook | `Controls.decorate("create-game-sp", …)` plus a MutationObserver scoped to that element. Append a badge **as the last child of each card root** and put the switch in a row **between the filter bar and the list**. The same code works with the base screen and with Mattifus's, and it is independent of load order. [V pattern: Policy Yield Previews does the same on `screen-policies`.] |
| What the shell knows | Leader and civilization: `GameSetup.findPlayerParameter(localPlayerID, "PlayerLeader" / "PlayerCivilization").value.value`. Age: `GameSetup.findGameParameter("Age").value.value`. Slots: the memento player parameters plus `Online.Metaprogression.getMementoSlotData()`. Mementos: `Online.Metaprogression.getMementosData()`. [V] |
| Memento effects in the shell | **Text and tags only.** The config DB has `Mementos` (name, functional text, `Tag`, `LeaderSpecific`), `Rewards` (icon) and `LeaderTags`/`CivilizationTags` (trait tags). The modifiers (`MementoModifiers`) are gameplay data loaded only by a game-scope action group. Ship a static scores table. [V/I] |

---

## 1. The screen

### 1.1 Files

| Role | File | Notes |
|---|---|---|
| Screen component (ui-next, **used**) | `CORE\ui-next\screens\create-game\memento-select.js` | `MementoTextInfo` 29-66, `MementoCard` 67-163, `MementoSlot` 164-200, `MementoSelectComponent` 201-671; registered as `"memento-select"` at 672-676 (`ComponentRegistry.register({name, createInstance, styles})`). [V] |
| Screen model (ui-next) | `CORE\ui-next\screens\create-game\memento-select-model.js` | `ModelRegistry.register("MementoSelectModel", PerInstance, …)` 126-130; context `MementoSelectModelContext` 131-138. [V] |
| Styles | `CORE\ui-next\screens\create-game\memento-select.css` (via `memento-select.scss.js`) | `.memento-select` card size 32.2rem × 12.5em; corner filigrees. [V] |
| Host screen | `CORE\ui-next\screens\create-game\create-game-screen.js` | Tab `"memento-select"` 153-157; flow entry 222; legacy element `create-game-sp` 199-226 (`defineLegacyComponent`). [V] |
| Entry point to the screen | `CORE\ui-next\screens\create-game\create-game-hub.js` | `HubMementos` 726-776: each slot box is a `Tab.Trigger name="memento-select"` (739-740). [V] |
| Legacy editor (old `ui`) | `CORE\ui\shell\create-panels\memento-editor.js`, `memento-slot.js` | Custom elements `memento-item` (87-91), `memento-editor` (372-376), `memento-slot` (memento-slot.js 103-107). Loaded by `CORE\ui\module-shell.js:29-30`. [V] |
| Mattifus replacement | `MMF\core\ui-next\screens\create-game\memento-select.js`, `memento-select-model.js`, `create-game-hub.js`; `MMF\core\ui\shell\create-panels\memento-editor.js`, `memento-slot.js` | Loaded as `UIScripts` in both shell and game groups (`MMF\Mattifus's Memento Filters.modinfo`). **Locally patched** on 2026-10-07 by another agent (`C:\Users\glazu\Documents\Codex\2026-10-07\new-chat\outputs\Civ7-three-mod-repairs-2026-10-07`). [V] |
| Age transition host (in game) | `BS\ui-next\screens\age-transition\age-transition-bootstrap.js` 6-26, `age-transition-screen.js` 15-16, 33, 97-98, 138-140 | Same `MementoSelect` component, legacy element `age-transition-bootstrap`. [V] |

The ui-next stack is **SolidJS**, not React (`CORE\vendor\solid-js`). The game ships compiled JSX: `template()`, `insert()`, `createComponent()`. Components are registered in `ComponentRegistry` (`CORE\ui-next\services\component-registry.js`) and models in `ModelRegistry` (`model-registry.js`). Both registries let a later registration with a higher `overridePriority` replace a factory. [V]

### 1.2 Which code path 1.5 uses

| Situation | Screen used | Evidence |
|---|---|---|
| New single-player game (also Hotseat) | ui-next `memento-select` inside `create-game-sp` | `CORE\ui\shell\main-menu\main-menu.js:1645-1665` pushes `create-game-sp`; `create-game-screen.js:153-157`. [V] |
| Age transition (in game) | ui-next `memento-select` inside `age-transition-bootstrap` | `BS\ui\root-game.html:1275-1278` template; `age-transition-bootstrap.js:20-23`; `civ-select-screen.js:283` opens it. [V] |
| Multiplayer lobby | **legacy** `memento-editor` popup (round icons, tooltips; no cards) | `CORE\ui\shell\mp-staging\mp-staging-new.js:876-882` `ContextManager.push("memento-editor")`, shown only if `Configuration.getGame().isMementosEnabled` (558). [V] |
| Legacy age-transition civ select | pushes `memento-editor` (`CORE\ui\shell\age-transition\age-transition-civ-select.js:623`) | Probably dead: root-game.html instantiates the ui-next bootstrap. [I] |

The user's screen has 2–3 slots, a «ПОДТВЕРДИТЬ» button, search, the «Показывать только доступные» checkbox, a filter dropdown and cards with name and description. That is the **ui-next screen as replaced by Mattifus**. The checkbox text is `LOC_MEMENTO_SLOT_SHOW_UNLOCKED_ONLY` from `MMF\text\modSettings.sql:140`, and it is not in the base game. [V]

### 1.3 Data model

From `memento-select-model.js` (base) [V]:
- `mementos = Online.Metaprogression.getMementosData()` (line 30) is a **real JS array** (`.filter/.sort/.map` used at memento-select.js:219-228 and model:102). Fields used by the UI:

| Field | Meaning |
|---|---|
| `mementoTypeId` | e.g. `MEMENTO_FOUNDATION_SLING_BULLET` |
| `mementoName` | LOC key of the name |
| `functionalTextDesc` | LOC key of the effect text |
| `flavorTextDesc` | LOC key of the flavor text |
| `mementoIcon` | bare texture name, used as `url('blp:…')` |
| `mementoTags` | e.g. `LOC_ATTRIBUTE_MILITARISTIC` [I from the filter and config `Tag`] |
| `displayType` | `DisplayType.DISPLAY_UNLOCKED`, `DISPLAY_LOCKED` or `DISPLAY_HIDDEN` |
| `unlockReason`, `unlockTitle` | unlock texts |
| `isNewAndUnseenByPlayer`, `isFavorite` | flags |
| `isMajorTier` | major/minor tier (`BS\ui\diplomacy-actions\panel-diplomacy-actions.js:838`) |

- `slots` (`createMutable`, lines 31-65): one entry per valid memento player parameter. Each entry is `{gameParameter, slotType (Major/Minor), isLocked, unlockReason, currentMemento: {value, name, description, functionalDescription, icon, …}, availableMementos, hotkey}`.
- `selectedSlot` / `setSelectedSlot` is a signal. `equipMemento(memento)` (76-98) calls `GameSetup.setPlayerParameterValue(localPlayerID, slot.gameParameter, typeId | "NONE")`, then `reconcile`s the slots.
- `fulltextSearch(text)` (99-115) uses a `FullTextSearch("MementoSelectFilter")` over the name and the plain functional text. Mattifus adds `unlockReason` (`MMF\…\memento-select-model.js:108-114`).
- **The model is created when the whole create-game screen mounts** (`create-game-screen.js:57`, `MementoSelectModel.get()`), not when the memento tab opens. Mattifus re-registers it with priority 1200 (`MMF\…\memento-select-model.js:120`).

### 1.4 How it lists and filters

| Step | Base | Mattifus |
|---|---|---|
| Category filter | Dropdown `filterItems` (memento-select.js:204): ALL, CULTURAL, ECONOMIC, SCIENTIFIC, MILITARISTIC, EXPANSIONIST, DIPLOMATIC, WILDCARD; matches `memento.mementoTags.toLowerCase().includes(category)` (215-222). Hotkey `shell-action-2` (533). | same (606, 360) |
| Text search | `SearchBar` (497-508), shown only on desktop, not small screens, no controller (209). | same (545-554) |
| "Only available" | — | `CheckBox` + `LOC_MEMENTO_SLOT_SHOW_UNLOCKED_ONLY` (545-580); state in `localStorage.modSettings.MattMementoSettings.showOnlyUnlocked` (310-345, 363-366). |
| Sort | unlocked first (223-228) | random first, optional tag-alphabetical, favorites, displayType, name (367-392) |
| Count | `LOC_UI_CREATE_GAME_MEMENTOS_NUM` (509-515) | 581-587 |
| Render | `ScrollArea` > `SpatialSlot name="create-game-mementos-slot"` > `For each={filteredMementos()}` (559-637) | 623-739 |

`For` is keyed by object identity. While a memento stays in the filtered list, its card DOM node is kept (and moved). When it leaves, its node is disposed; when it comes back, a fresh node is built. [V Solid semantics]

### 1.5 Card DOM

One list item (base, from the template at memento-select.js:28 and `MementoCard` 67-163; `Icon` from `CORE\ui-next\components\icon.js:7-54`; `Activatable` from `activatable.js:188-199`):

```
div[data-name="create-game-mementos-slot(SpatialSlot)"][sectionId="create-game-mementos-slot"]   ← list (Solid owns ALL children)
  div[data-name="Activatable"][data-activatable="true"].group                                   ← focusable card button (Solid owns all children)
    div.flex.flex-row.relative.m-3.p-2.img-unit-panelbox.memento-select[.memento-select-locked]  ← CARD ROOT (class set by className effect)
      div.flex.mr-1.overflow-hidden.absolute.inset-0.items-center.w-48
        div[data-name="Icon"][name="url('blp:<mementoIcon>')"]   (big faded background icon)
        div.absolute.left-2.5
          div[data-name="Icon"][name="url('blp:<mementoIcon>')"]   (card icon)
      div.flex-auto.flex.flex-col  (MementoTextInfo: name .font-title.text-tertiary-1, rule, functional text)
      div.memento-select-corner-filigree.top-left / top-right / bottom-left / bottom-right
      div.img-rollover-highlight.absolute.inset-0…
      div.absolute.-left-2.top-4   (NEW / equipped / locked tags; children toggled by Show)
```

- **`name` attribute:** `Icon` spreads all its props onto its `<div>`. Solid's `assignProp` falls through to `setAttribute` for props that are not DOM properties (`CORE\vendor\solid-js\web\dist\web.js:776-830`). So `name="url('blp:<icon>')"` and `data-name="Icon"` are DOM attributes. [V by code; see the pitfall about the inspector in §6]
- **No attribute holds `mementoTypeId`.** The Development Tools TSX source says the same of tags: "mementoTags seems to be defined in the C++" (`…Development Tools\Reference\core\ui-next\screens\create-game\memento-select.tsx:227`). [V]
- **Mattifus's card** (`MMF\…\memento-select.js:85-261`) has the same skeleton, with these differences:
  - The card-root class is `memento-select-scale-<60…110>` or `memento-select-as-tooltip-scale-<n>` instead of `memento-select`. It still has `img-unit-panelbox` and, when locked, `memento-select-locked` (252-258).
  - It may contain an extra `Icon` with `name=<leader icon id>` (not a `url(...)`; 147-177).
  - The text block is absent when "info as tooltip" is on (179-193).
  - Its "random" pseudo-memento `MEMENTO_MF_RANDOM` uses `name="LEADER_RANDOM"`.

### 1.6 Selected slots

| Item | Detail |
|---|---|
| Parameters | `PlayerMementoMajorSlot`, `PlayerMementoMinorSlot1` (Player group, keys `MajorMemento` and `MinorMemento1`): `CORE\config\SetupParameters.xml:95-96`. The age-transition copies are `AgeTransitionPlayerMemento…` (113-114). [V] |
| Slot metadata | Table `MementoSlots` (`BS\config\config.xml:387-390`: `MEMENTO_SLOT_1` → `PlayerMementoMajorSlot`, `MEMENTO_SLOT_2` → `PlayerMementoMinorSlot1`) and `Online.Metaprogression.getMementoSlotData()` (`mementoTypeId` = parameter id, `displayType`, `unlockTitle`). [V] |
| Third slot (Mattifus) | `MMF\config\SetupParameters.xml` adds `PlayerMementoMinorSlot2`, and `MMF\config\config.xml` adds `MEMENTO_SLOT_3`. It is shown only when Mattifus's option is on (`MMF\…\memento-select-model.js:41-44`). [V] |
| Slot domain | One query for all slots: `Mementos INNER JOIN Rewards` → `Value`, `Name`, `FunctionalDescription`, `Icon = Rewards.CustomData` (`CORE\config\SetupParameters.xml:254`). [V] |
| UI | Slots row (memento-select.js:382-435). Clicking a slot selects it; clicking a card equips it into the selected slot (`handleEquip`, 236-240, unlocked only). Base auto-advances to the next empty slot (model:92-97). The side panels show the slot 1/2 texts (base) or slot 1/2/3 texts (Mattifus 435-544). |
| Buttons | New game: **«ПОДТВЕРДИТЬ» = `LOC_UI_CREATE_GAME_CONFIRM_SELECTIONS`** → `flowContext.activatePrev()`, back to the hub (memento-select.js:436-451). Age transition: `LOC_GENERIC_CONTINUE` → `activateNext()`, which starts the age (452-466). Hotseat (base only): the screen auto-advances on mount (241-247). |

### 1.7 When it opens

- **New game:** leader-select → civ-select → game-setup → **create-game-hub**. The memento boxes on the hub (`HubMementos`) open the `memento-select` tab (`create-game-hub.js:726-776`). It is **not** opened from leader select. **Advanced Options** only holds the `MementosEnabled` game parameter (`CORE\ui\shell\create-panels\advanced-options-base.js:378`). [V]
- **Age transition:** civ-choice / civ-select → memento-select → START (`age-transition-bootstrap.js:20-23`; `civ-select-screen.js:283`). [V]
- Tabs render through `Tab.Output` = `Dynamic` over the active body (`CORE\ui-next\components\tab.js:151-161`). The memento screen is **unmounted when the user leaves the tab and rebuilt on every visit.** [V]

---

## 2. What the screen knows (local player)

| Value | Shell API (recommended) | Evidence | Alternative |
|---|---|---|---|
| Local player id | `GameContext.localPlayerID` | model:35 [V] | — |
| Leader | `GameSetup.findPlayerParameter(pid, "PlayerLeader")?.value?.value` → `"LEADER_AUGUSTUS"` or `"RANDOM"` | `civ-select-model.js:185-186`; `MMF\…\memento-select.js:662` [V] | `Configuration.getPlayer(pid).leaderTypeName` (key `LeaderTypeName`, `SetupParameters.xml:92`) [I in shell; V in game] |
| Leader name and icon | `GameSetup.resolveString(param.value.name / .icon)` | MMF 664-665 [V] | — |
| Civilization | `GameSetup.findPlayerParameter(pid, "PlayerCivilization")?.value?.value`; **in an age transition use `"AgeTransitionPlayerCivilization"`** | `civ-select-model.js:19`; `SetupParameters.xml:91, 112` [V] | `Configuration.getPlayer(pid).civilizationTypeName` [I] |
| Random civ | `civID == "RANDOM"` | `create-game-screen.js:72` [V] | — |
| Start age | `GameSetup.findGameParameter("Age")?.value?.value?.toString()` → `"AGE_ANTIQUITY"`… | `CORE\ui\shell\create-panels\age-civ-select-model.js:34`; `age-select-model.js:26` [V] | In game: `GameInfo.Ages.lookup(Configuration.getGame().startAgeType).AgeType` [V game]. For the age being chosen in a transition, `age-select-model.js:9-31` takes the **next** age by `sortIndex` when `UI.isInGame()`. [V] |
| In age transition? | `UI.isInGame()` | model:29, memento-select.js:234 [V] | — |
| Slot count | Count `GameSetup.getMementoFilteredPlayerParameters(pid)` with `!hidden && invalidReason == GameSetupParameterInvalidReason.Valid` and a row in `Online.Metaprogression.getMementoSlotData()`; usable = not `DISPLAY_LOCKED` | model:34-65 [V] | DOM: `.memento-select-slot` exists on 2 elements per slot, so do not count it. [V] |
| Equipped mementos | `Configuration.getPlayer(pid).getValue("MajorMemento" / "MinorMemento1")` | `BS\ui-next\screens\load-screen\load-screen-model.js:326-330` [V game] | `GameSetup.findPlayerParameter(pid, "PlayerMementoMajorSlot").value.value` [I] |
| Mementos enabled | `Configuration.getGame().isMementosEnabled` | `mp-staging-new.js:558` [V] | — |
| Parameter change tick | `GameSetup.currentRevision` (base polls it every 150 ms) | `game-parameters-model.js:84` [V] | — |

**Default victory from leader and civ.** The config DB (shell) has trait tags for every leader and civ:
- `LeaderTags` (`BS\config\config.xml:98-178`) and `CivilizationTags` (`GAME\Base\modules\age-*\config\config.xml`, e.g. `age-antiquity\config\config.xml:92-124`).
- The trait tags are `TAG_TRAIT_CULTURAL`, `_SCIENTIFIC`, `_ECONOMIC`, `_MILITARISTIC`, `_EXPANSIONIST`, `_POLITICAL` and `_WILDCARD`.
- Scan: all 38 leaders and 50 civilizations (base + DLC) have them. [V]
- Example: `LEADER_AUGUSTUS` = CULTURAL + EXPANSIONIST; `LEADER_CATHERINE` = CULTURAL + SCIENTIFIC.

Four of the trait tags map onto the four victories: CULTURAL→Culture, SCIENTIFIC→Science, ECONOMIC→Economic, MILITARISTIC→Military. Fall back to Balanced when there is no match or the pick is RANDOM. [I design]

Query example (shell and game): `Database.query("config", "SELECT LeaderType, TagType FROM LeaderTags")`. Parameterised queries also exist (`Database.query("config", sql, arg)`, `BS\ui\syncretism\syncretism-screen-model.js:163`). Plain table reads filtered in JS avoid relying on binding in the shell. [V/I]

---

## 3. Memento data in the shell

### 3.1 Databases by scope

| DB | Shell? | Memento content | Evidence |
|---|---|---|---|
| **config** (frontend) | yes | `Mementos` (`Type, Name, Description, FunctionalDescription, Tag, LeaderSpecific, UnlockTitle, Tier, Hidden, Icon(unused)`), `MementoSlots`, `Rewards` (`GameItemID, CustomData` = icon, `Type='UNLOCKABLEREWARD_TYPE_MEMENTO'`), `LegendPathsRewards`, `LeaderTags`, `CivilizationTags`, `LeaderCivilizationBias` | Schema `GAME\Base\Assets\schema\frontend\schema-frontend-50-setup-data.sql:297-319`. Loaded by `BS\base-standard.modinfo:660-676` (`base-game-shell`, scope shell: `config/config.xml`, `config/metaprogression.xml`, `config/unlockableRewards.xml`). [V] |
| localization | yes | names and functional text (`text/en_us/MementoText.xml` in the shell UpdateText of the same group) | `BS\base-standard.modinfo:660-730` [V] |
| **gameplay** (`GameInfo`) | game scope | `Mementos (MementoType, Tag, Tier, Region, …)`, `MementoModifiers` → `Modifiers` | `BS\base-standard.modinfo:25, 92-93` (`base-game-main`, **scope game**: `data/mementos.xml`, `data/mementos-gameeffects.xml`); schema `01_GameplaySchema.sql:2704-2720` [V] |
| `GameInfo` in shell | exists (the HoF chart uses `GameInfo.Units`, `CORE\ui\components\fxs-hof-chart.js:247`) | Probably only the bootstrapped base DB, without the game-scope memento rows. Do not rely on it. | [I] |

### 3.2 Where mementos are defined

| What | File |
|---|---|
| Setup table (text keys, tag, leader path) | `BS\config\config.xml:300-381` (domain `StandardMementos` + `NONE` row at 301-303); DLC: `GAME\DLC\<dlc>\modules\config\config.xml` |
| Icons | `BS\config\unlockableRewards.xml:3-444` (`CustomData="mem_min_inscribed_sling_bullet"`, e.g. line 121; xmlns `UnlockableRewards`); DLC copies |
| Unlock levels | `BS\config\metaprogression.xml:253-562` (`LegendPathsRewards`: path, level, `MEMENTO_*`) |
| Gameplay effects | `BS\data\mementos.xml` (Types, `Mementos` from line 85, `MementoModifiers` from 163), `BS\data\mementos-gameeffects.xml` (`<Modifier id="MEMENTO_…_MODIFIER" effect=…>` + arguments); DLC `modules\data\mementos*.xml` |
| Text | `BS\text\en_us\MementoText.xml` (e.g. `…_FUNCTIONAL_DESCRIPTION` 283, `…_UNLOCK_TITLE` 804); ru in `BS\l10n\ru_RU_Text.xml` |

Scan of base + 17 DLC folders: **133 mementos, 133 distinct icons** (no shared `CustomData`). There are 7 tags: MILITARISTIC 32, DIPLOMATIC 24, ECONOMIC 20, EXPANSIONIST 20, CULTURAL 17, SCIENTIFIC 13, WILDCARD 7. Mattifus adds `MEMENTO_MF_RANDOM` with icon `MattifusMementoFilters/textures/random.png`. [V; scan script in the scratchpad `mementos-ui\scan.py`]

`LeaderSpecific` holds the legend path that unlocks the memento (e.g. `LEGEND_PATH_AUGUSTUS`). No setup SQL or UI code uses it as an equip restriction. [V not used / I meaning]

### 3.3 Is the effect visible from the shell?

Only as text: `functionalTextDesc` (LOC) from `getMementosData()` or `Mementos.FunctionalDescription`, plus `Tag`. The modifiers are game-scope data (§3.1). For a ranking, the reliable route is a **static per-memento score table** generated offline from `data/mementos-gameeffects.xml` + text (base + DLC) and shipped as `mma-data.js`. In the age transition (game scope), `GameInfo.MementoModifiers` should be readable. [I]

### 3.4 Unlocked or available

- `displayType` from `getMementosData()`. The base screen equips only `DISPLAY_UNLOCKED` (memento-select.js:236-240) and draws a lock for `DISPLAY_LOCKED` (card class `memento-select-locked`, lock tag). [V]
- Slot lock: `getMementoSlotData()[i].displayType` (model:44). [V]
- The legacy editor additionally requires the memento to be in the slot's parameter domain (`memento-editor.js:304-323`). [V]
- Mattifus can "unlock all" mementos (its option `unlockAllMementoOption`). On its cards, `memento-select-locked` follows that option (`MMF\…\memento-select.js:252, 657-659`). Mattifus also checks `Online.UserProfile.isRewardUnlocked(name)` (`MMF\core\ui\modOptions.js:54`). [V]
- **Practical rule for badges:** rank only mementos that are `DISPLAY_UNLOCKED`. Then skip any card whose root has `memento-select-locked`; the class reflects what the screen allows, including Mattifus's mode.

---

## 4. How a mod adds UI in shell scope

### 4.1 modinfo pieces

| Element | Use | Evidence |
|---|---|---|
| `<ActionGroup scope="shell" criteria="always">` | Runs in the main menu and front end (setup screens). | Official doc `…Development Tools\Documentation\modinfo Files.md` (ActionGroups); `BS\base-standard.modinfo:660`. [V] |
| `<Criteria id="always"><AlwaysMet/></Criteria>` | Always on. | Same doc, `AlwaysMet`. [V] |
| `<UIScripts>` | JS entry points, loaded as `<script type="module">` via `Controls.loadSource` in the order returned by `Modding.getInitialScripts` (`CORE\ui\component-support.js:1007-1066, 1393-1400`). Dynamically inserted module scripts **do not guarantee execution order** between mods. | [V code / I ordering] |
| `<ImportFiles>` | Mounts files (CSS, images, imported JS) without running them. **A file whose relative path matches a base file replaces it** (Compact Production does this on purpose). | `research/02-drongos-city-planner.md:255`; doc "ImportFiles". [V] |
| `<UpdateText>` | LOC rows (XML `<EnglishText>/<LocalizedText>` or SQL `INSERT OR REPLACE INTO LocalizedText`). Must be listed **in each scope** that needs the text (the localization DB is reverted when the game starts: `LOGS\Modding.log` "Reverted Localization database"). | [V] |
| `<UpdateDatabase>` (shell) | Config DB rows (e.g. `InputActions` hotkeys, as in our `config/input.xml`). | [V] |
| `<LocalizedText><File>` (top level) | Name and description in the Add-Ons browser. | our modinfo; Slothoth [V] |
| `<LoadOrder>` | Order inside the scope. | Slothoth 9999, Mattifus 100, xpl 1000 [V] |
| `<Mod version>` | Must parse to an integer ≥ 1. "0.1.0" never loaded (CLAUDE.md gotcha 2). "1.14.2" (Mattifus) and "1.1" (Efs) do load, so the leading integer is what counts. Use `version="1"`. | `LOGS\Modding.log` lists both [V] |

Paths inside JS:
- base modules: `'/core/ui-next/...'`, `'/core/ui/...'`
- own modules: `'/memento-advisor/ui/mma-x.js'`
- CSS and images: `fs://game/memento-advisor/...`

All three forms are used by Mattifus, Slothoth and our xpl (`MOD_FS_ROOT = fs://game/<id>/`, `mod/expansion-planner/ui/core/xpl-constants.js:8`). [V]

### 4.2 Minimal working shell UI example (Slothoth's Modpage Manager, `WS\3684206095\slothoth-modpage-manager.modinfo`) [V]

```xml
<Mod id="slothoth-modpage-manager" version="7" xmlns="ModInfo">
  <Properties> … <AffectsSavedGames>0</AffectsSavedGames> </Properties>
  <References> <Mod id="core" title="LOC_MODULE_CORE_NAME"/> </References>
  <ActionCriteria> <Criteria id="always"><AlwaysMet></AlwaysMet></Criteria> </ActionCriteria>
  <ActionGroups>
    <ActionGroup id="shell-mod-page-manager" scope="shell" criteria="always">
      <Properties><LoadOrder>9999</LoadOrder></Properties>
      <Actions>
        <ImportFiles><Item>assets/civmods-logo.png</Item></ImportFiles>
        <UIScripts><Item>ui/mods_content_decorator.js</Item></UIScripts>
        <UpdateIcons><Item>icons/icons.xml</Item></UpdateIcons>
        <UpdateText><Item>text/en_us/ShellText.xml</Item></UpdateText>
      </Actions>
    </ActionGroup>
  </ActionGroups>
  <LocalizedText><File>text/en_us/ShellText.xml</File></LocalizedText>
</Mod>
```

Its script ends with `Controls.decorate('mods-content', (val) => new ModsContentDecorator(val));` (`ui/mods_content_decorator.js:841`). The decorator class implements `beforeAttach/afterAttach/beforeDetach/afterDetach` (817-838).
- Its helper modules (`ui/profile_helpers.js`, `ui/html_set.js`) are imported by URL but **not** listed in ImportFiles. So mod files are reachable by URL without ImportFiles. [V by working mod / I general rule]
- Listing them, as our `sync-modinfo.py` does, is harmless.

### 4.3 Shell and game groups in one mod; text in the shell

- **Yes, one mod can have both.**
  - Mattifus has `mmf_shell_always` and `mmf_game_always`, listing the same UIScripts in both.
  - Our `expansion-planner` has `xpl-shell` (input DB + text) and `xpl-game`.
  - `LOGS\Modding.log` lists Mattifus among the shell target mods and `* mmf_game_always` among the in-game actions. [V]
- **Text in the shell works.** The user sees «Показывать только доступные» on the shell screen, and it comes only from Mattifus's shell `UpdateText` (`MMF\text\modSettings.sql`, `INSERT OR REPLACE INTO LocalizedText (Tag, Language, Text)`). Slothoth's shell texts also show. [V]
- The shell and the game are separate documents (`root-shell.html` vs `root-game.html`), so JS state does not carry over. Use `localStorage` (one shared `modSettings` key, see §6) or `Configuration`. [V]

### 4.4 Enabling, restart, live reload, debugging

- **Enabling:** in the Add-Ons screen, `Modding.enableMods(handles, true)` / `disableMods` (`CORE\ui\shell\mods-content\mods-content.js:308-338`). `EnabledByDefault` defaults to 1, so a newly discovered mod starts enabled (official doc). [V]
- **Discovery:** mods are discovered at game start (`Modding.log`: "Discovering new mods…", "File timestamps do not match. Will reload the mod."). A new mod folder (our junction under `%LOCALAPPDATA%\…\Mods\`) or a `.modinfo` change needs a **full restart**. Shell content is reconfigured on "Main Menu Reset" (`Modding.log`). [V log / I exact trigger]
- **Text** changes need a restart (CLAUDE.md game loop). **JS** reloads live with `UIFileWatcher 1` (CLAUDE.md). The shell is expected to behave the same. [I]
- **Errors:**
  - `LOGS\UI.log`: the shell part is at the top; look for `JS Error` and `SOURCE ERROR - <url>` from `loadSource`.
  - `LOGS\Database.log`: config XML errors, e.g. Mattifus's `meta.xml` "Database XML root elements must start with either <Database> or <GameEffects>", which is harmless.
  - The main menu shows a mod error dialog for `Modding.getLastLoadError()` (`main-menu.js:1276-1325`). [V]
- **DOM inspector:** `UI.log` line 6 says "Inspector initialized. Remote debugging available on port: 9444". Use it to confirm the selectors in §5 on the live screen before relying on them. [V log / I how to attach]

---

## 5. The decoration hook

### 5.1 Options

| Option | How | Verdict |
|---|---|---|
| A. Replace the component (copy `memento-select.js`, register with a higher priority) | What Mattifus does | **No.** It fights Mattifus (whichever wins hides the other's features) and breaks on game updates. |
| B. `Controls.decorate("memento-select")` | — | **Impossible.** `memento-select` is a Solid component, not a custom element. `MementoCard` is not registered at all (memento-select.js has a single `ComponentRegistry.register`, at 672). [V] |
| **C. `Controls.decorate("create-game-sp")` + scoped MutationObserver** (recommended) | `create-game-sp` is a real custom element: `defineLegacyComponent` → `Controls.define` (`CORE\ui-next\components\fxs-solid-component.js:91-107`), and its `onAttach` renders the Solid tree into the element (18-61). Decorators are built at element creation (`component-support.js:239-243`); `afterAttach` runs after `onAttach` (283-302); `beforeDetach` on close (304-322). | **Yes.** No registry changes; works with base and Mattifus; order-independent. **Same pattern as Policy Yield Previews 1.5** (`WS\3515801789\scripts\ui\policies\screen-policies-yields-decorator.js:1-27` decorates the bridge element `screen-policies`; `policy-chooser-item-yields-decorator.js:15-19, 141-157` uses a MutationObserver plus idempotent injection). [V] |
| D. Chain-preserving `ComponentRegistry` wrapper | `const reg = ComponentRegistry.get("memento-select")`, then wrap. Details in §5.6. | Alternative, if you need the Solid lifecycle and `useMementoSelectModelContext()`. More coupling (monkeypatches one registry entry). [I] |
| E. Permanent `document.body` observer | PYP and Resource+ style | Works, but runs during the whole shell session. C is the scoped version. |

**Why a naive registry wrapper is risky** (`component-registry.js:8-36`):
- `register()` replaces the factory only if the new priority is ≥ the current one.
- The Resource+ pattern snapshots `X.factory()` and registers its wrapper at a fixed priority (`WS\3756000777\ui\commerce\resource-plus.js:6-8, 1312-1317`). For this screen that pattern either **hides Mattifus** (ours ≥ 1200 and loaded first, so Mattifus's later registration is ignored) or **gets dropped** (ours < 1200, so Mattifus replaces it).
- Module scripts from different mods have no guaranteed execution order (§4.1).

### 5.2 Re-render signals

There is **no engine or window event** for "memento screen opened" or "card list re-rendered". [V]
- `memento-select.js`, `tab.js` and `screen-flow.js` dispatch nothing.
- What exists:
  - the `create-game-sp` decorator lifecycle (create-game opened or closed);
  - `window` events `game-creator-closed` (`create-game-screen.js:63`; names in `CORE\ui\events\shell-events.js:7`) and `startCampaign` (81);
  - `GameSetup.currentRevision` (changes when a parameter such as an equip changes).
- So the **MutationObserver is the re-render signal.**

What re-renders, and the effect on injected nodes:

| User action | DOM effect | Badge survives? |
|---|---|---|
| Open the memento tab | whole screen mounted (new list element) | n/a: decorate all |
| Leave the tab | whole screen unmounted (`Dynamic`) | gone, rebuilt next time |
| Search text, category dropdown, Mattifus checkbox or sort | `For` removes cards leaving the list and **creates new nodes** for cards entering it; kept cards are moved | kept cards yes; new cards need decorating |
| Equip / unequip | slot row changes; on cards only the `Show`s inside the tag corner toggle; card root kept | yes |
| Lock-state change (Mattifus "unlock all", hover) | `className(cardRoot, …)` **replaces the whole class attribute** | yes if the badge is a **child**; a class we added to the root would be wiped |
| Controller ↔ mouse | `Show` of SearchBar / checkbox toggles | yes |

### 5.3 Where to attach (Solid ownership)

Solid `insert(parent, x)` **without a marker** owns *all* children of `parent`:
- When cleared, it does `parent.textContent = ""` (`web.js:1001-1002`).
- For a single node it does `replaceChild(value, parent.firstChild)` (`web.js:882-965`).

`insert(parent, x, marker)` with a marker, or with `null`, touches only its own nodes. `className()` sets `node.className` (`web.js:589-593`).

| Element | Solid inserts into it | Safe to append our node? |
|---|---|---|
| List `[data-name="create-game-mementos-slot(SpatialSlot)"]` | no marker (`slot.js:49-54`) | **No** |
| `Activatable` card wrapper `[data-name="Activatable"]` | no marker (`activatable.js:196-199`) | **No** |
| **Card root `.img-unit-panelbox`** (inside the list) | only with marker `_el$7` (base 88-92; MMF 179-193) | **Yes, as last child.** Do not add classes (className effect). |
| Card tag corner `div.absolute.-left-2.top-4` | `null` markers | yes, but crowded; avoid |
| **Filter bar `.memento-select-filter-bar`** | base: marker `_el$37` (497-508); MMF: none into the bar itself | **Yes** (append) |
| Mattifus left filter group (`justify-start`) | no marker (MMF 545) | **No** |
| **Filter bar's parent** (base `.memento-select-list-container`; MMF the `layout-center` column) | none | **Yes: insert a row after the filter bar** (`bar.parentElement.insertBefore(row, bar.nextSibling)`) |

### 5.4 Finding each card's memento

1. Build `iconToType` from `Online.Metaprogression.getMementosData()`: `mementoIcon → mementoTypeId`. 133 unique icons [V].
   - The same texture name is in config `Rewards.CustomData` (`SetupParameters.xml:254`; `load-screen-model.js:339-342`).
   - That `mementoIcon` equals `CustomData` is [I], but strongly suggested: the slots render `url('blp:${slot.icon}')` from that query and the cards render `url('blp:${mementoIcon}')`.
2. For each card root (`list.querySelectorAll(".img-unit-panelbox")`), take the first `[data-name="Icon"]` whose `name` matches `/^url\('blp:(.+)'\)$/`, then look up `iconToType`.
   - Skip `LEADER_*` names (Mattifus extras and random).
   - Use plain selectors and filter in JS. `.closest` and `querySelectorAll` are used in base and mod code; attribute prefix selectors (`^=`) are not seen in base code. [V/I]
3. Fallback when the icon key is missing: match the name text (`.font-title.text-tertiary-1` inside the card) against `Locale.compose(mementoName)`. This is the PYP approach. It fails when Mattifus's "info as tooltip" option is on, because there is no text on the card.
4. Skip cards whose root has `memento-select-locked`.

### 5.5 How existing mods hook similar screens

| Mod | Screen | Hook |
|---|---|---|
| Policy Yield Previews (`WS\3515801789`) | Government / policies (ui-next) | `Controls.decorate('screen-policies')` on the legacy bridge plus a body MutationObserver; idempotency via `data-*` attributes. Its comment notes that Solid `spread` wipes added classes (`policy-chooser-item-yields-decorator.js:106-110`). [V] |
| Resource+ (`WS\3756000777`, locally patched) | Commerce resources tab (ui-next) | `ComponentRegistry.register({name, overridePriority:1100})` wrapping the snapshotted original factory; `onMount` inject + body MutationObserver; `onCleanup` remove. [V] |
| Slothoth's Modpage Manager (`WS\3684206095`) | Add-Ons (legacy, **shell**) | `Controls.decorate('mods-content')`; injected `<style>` in `document.head`. [V] |
| Mattifus (`WS\3508036392`) | Memento select + hub (ui-next), editor (legacy) | Full copies re-registered at priority 1200 / `Controls.define` again. [V] |
| Our xpl | game panels | `Controls.decorate("panel-sub-system-dock" / "panel-production-chooser" / "lens-panel")`; CSS via `Controls.loadStyle(fs://game/…)` (`mod/expansion-planner/ui/hud/xpl-dock.js:18`). [V] |

### 5.6 Alternative D in detail (chain-preserving wrapper) [I, untested]

```js
import { onMount, onCleanup } from '/core/vendor/solid-js/dist/solid.js';
import { ComponentRegistry } from '/core/ui-next/services/component-registry.js';
import '/core/ui-next/screens/create-game/memento-select.js';        // guarantees the entry exists
const reg = ComponentRegistry.get("memento-select");
if (reg && typeof reg.setFactory === "function") {
    let inner = reg.factory();                       // current winner (base or Mattifus)
    const setOuter = reg.setFactory;
    reg.setFactory = (fn) => { inner = typeof fn === "function" ? fn(inner) : fn; };  // later overrides become `inner`
    setOuter(() => function MmaMementoSelect(props) {
        onMount(() => { /* start the list observer */ });
        onCleanup(() => { /* stop it */ });
        return inner(props);
    });
}
```

- This leaves `overridePriority` untouched, so Mattifus's 1200 still beats the base whatever the load order. Our wrapper always stays outermost.
- It still needs the same DOM injection as option C.

---

## 6. Pitfalls

| Pitfall | Detail and mitigation |
|---|---|
| **A thrown error can break the create-game screen** | The framework calls decorator factories and lifecycle methods with no try/catch (`component-support.js:239-243, 283-322`). Wrap the constructor, each lifecycle method and the observer callback in `try/catch`, and log with an `[MMA]` prefix. |
| Re-renders wiping nodes | See §5.2–5.3. Append children, never classes; never inject into marker-less Solid parents; re-run an **idempotent** `reconcile()` on every mutation batch. |
| Observer feedback loop and cost | Our own inserts trigger the observer. Throttle to one `requestAnimationFrame` per frame and make reconcile a no-op when nothing changed. Observe only `create-game-sp` (`childList, subtree`), never `attributes`. Disconnect in `beforeDetach`. |
| Decorator registered too late | `Controls.decorate` does not attach to existing instances (`component-support.js:1127-1140`). Fine for `create-game-sp`, which is pushed on "Create game". After a live reload, reopen the create-game screen. |
| Gamepad and focus | Cards are focusable `Activatable`s in a spatial `SpatialSlot` (`slot.js:90-131`). Badges with `pointer-events:none`, no `tabindex` and absolute position do not change navigation or hover (`group-hover` highlight). The switch is **not reachable by gamepad** unless an input handler is added (`ContextManager.registerEngineInputHandler`, as in `mod/expansion-planner/ui/hud/xpl-hotkey.js:28-31`). `shell-action-2` (filter) and `nav-previous/next` (slots) are taken; `shell-action-3` (R-stick press, `CORE\config\Input.xml:77, 197`) looks free here [I]. With a controller, the base hides search and checkbox (`!IsControllerActive()`, memento-select.js:209). Do not set `autofocus` or steal focus. |
| CSS conflicts | Coherent Gameface: flex items default to `flex-shrink:0` (CLAUDE.md gotcha 9). Use `rem` (the game rescales rem with the UI scale). Use our own `mma-` classes; never restyle `.memento-select*`, `.img-unit-panelbox` or utility classes. Base card size is fixed (`.memento-select` 32.2rem × 12.5em) and Mattifus scales cards 60–110%, so anchor the badge to a corner (`position:absolute`; the card root already has `relative`) at a fixed rem size. Corner filigrees sit at ~0.3rem from each corner and the NEW/equipped/lock tags at the top-left, so use top-right, inset ~0.6rem. |
| File-name clashes | The game resolves UI imports by file name across mods (CLAUDE.md gotcha 1). Prefix **every** file `mma-` (JS, CSS, text). Never ship `memento-select*.js`, `modOptions.js`, `settings.js` or similar; Mattifus ships generic names like `core/ui/modOptions.js`. Do not mirror base relative paths: ImportFiles at a base path replaces the base file. |
| Shell vs game | Separate documents and module instances. List UIScripts, ImportFiles and UpdateText in each group that needs them. In the age transition, the civilization parameter is `AgeTransitionPlayerCivilization` and the age is the next one (§2). |
| Settings storage | Use `localStorage["modSettings"]["memento-advisor"]` only. Slothoth's helper calls `localStorage.clear()` when more than one key exists (`WS\3684206095\ui\localStorageStuff.js:3-6`), and Mattifus keeps `MattMementoSettings` in the same JSON. Read-modify-write the shared object; never clear it (CLAUDE.md gotcha 15). |
| DOM differences (base vs Mattifus vs future patches) | Key only on: `[data-name="create-game-mementos-slot(SpatialSlot)"]`, `.img-unit-panelbox` inside it, `[data-name="Icon"][name]`, `.memento-select-locked`, `.memento-select-filter-bar`. All are present in both versions [V]. Mattifus is a Workshop mod that is **locally patched**; a Steam update can change its DOM silently. |
| Hotseat | Base auto-advances past the screen on mount (memento-select.js:241-247), so badges never show. Harmless. |
| Mobile layout | `isMobile()` switches to a row-reverse layout with different margins. Target desktop; keep the switch row generic. |
| Multiplayer | The lobby uses the legacy `memento-editor` (no ui-next cards). An optional second hook is `Controls.decorate("memento-item", c => …)`: `c.mementoData.mementoTypeId` is set before `afterAttach` (`memento-editor.js:166-174`; whenCreated listeners run before attach, `component-support.js:244-249`). The root is a small 4.75rem circle (`w-19 h-19`). |

---

## 7. Recommended implementation

### 7.1 File layout

(new folder next to the existing mod, e.g. `mod/memento-advisor/`)

```
memento-advisor/
  memento-advisor.modinfo
  text/en_us/mma-text.xml          <EnglishText> LOC_MMA_* (+ LOC_MOD_MMA_NAME/DESCRIPTION)
  text/ru_ru/mma-text.xml          <LocalizedText><Replace Tag=… Language="ru_RU">
  text/en_us/mma-modinfo-text.xml  mod-browser name/description
  ui/mma-main.js                   UIScript entry: registers the decorators once
  ui/mma-decorator.js              host decorator: observer, reconcile, badges, switch row
  ui/mma-context.js                engine adapter: leader/civ/age/slots/mementos (every call in try/catch)
  ui/mma-ranking.js                PURE: (scores, context, mode) -> Map<typeId, rank 1..6>; no engine globals (Node-testable)
  ui/mma-data.js                   GENERATED static table: typeId -> {tag, scores:{balanced,culture,science,economic,military}}
  ui/mma-settings.js               localStorage.modSettings["memento-advisor"] read/merge/write
  ui/mma-style.css                 .mma-badge, .mma-switch… (rem units)
(repo, not shipped)
  tools/mma-extract.py             builds ui/mma-data.js from BS/DLC data/mementos*.xml + text (python -I)
  tests/mma-ranking.test.mjs       ranking + default-victory unit tests
```

### 7.2 modinfo skeleton

```xml
<?xml version="1.0" encoding="utf-8"?>
<Mod id="memento-advisor" version="1" xmlns="ModInfo">
  <Properties>
    <Name>LOC_MOD_MMA_NAME</Name>
    <Description>LOC_MOD_MMA_DESCRIPTION</Description>
    <Authors>glazunovzayac</Authors>
    <Package>Mod</Package>
    <AffectsSavedGames>0</AffectsSavedGames>
    <Version>1.0.0</Version>
  </Properties>
  <Dependencies>
    <Mod id="base-standard" title="LOC_MODULE_BASE_STANDARD_NAME"/>  <!-- age-transition host lives in base-standard -->
  </Dependencies>
  <ActionCriteria>
    <Criteria id="always"><AlwaysMet></AlwaysMet></Criteria>
  </ActionCriteria>
  <ActionGroups>
    <ActionGroup id="mma-shell" scope="shell" criteria="always">
      <Properties><LoadOrder>1000</LoadOrder></Properties>
      <Actions>
        <UpdateText>
          <Item>text/en_us/mma-text.xml</Item>
          <Item>text/ru_ru/mma-text.xml</Item>
        </UpdateText>
        <ImportFiles>
          <Item>ui/mma-context.js</Item>
          <Item>ui/mma-data.js</Item>
          <Item>ui/mma-decorator.js</Item>
          <Item>ui/mma-ranking.js</Item>
          <Item>ui/mma-settings.js</Item>
          <Item>ui/mma-style.css</Item>
        </ImportFiles>
        <UIScripts>
          <Item>ui/mma-main.js</Item>
        </UIScripts>
      </Actions>
    </ActionGroup>
    <!-- Phase 2 (age transition, in game): same Actions in scope="game". -->
    <ActionGroup id="mma-game" scope="game" criteria="always">
      <Properties><LoadOrder>1000</LoadOrder></Properties>
      <Actions> <!-- identical UpdateText / ImportFiles / UIScripts --> </Actions>
    </ActionGroup>
  </ActionGroups>
  <LocalizedText>
    <File>text/en_us/mma-modinfo-text.xml</File>
  </LocalizedText>
</Mod>
```

- No `References` to Mattifus are needed: the hook is order-independent.
- `version="1"` is an integer (CLAUDE.md gotcha 2).

### 7.3 Decoration code outline

```js
// ui/mma-main.js  (UIScript, both scopes)
import { MmaScreenDecorator } from '/memento-advisor/ui/mma-decorator.js';
Controls.loadStyle("fs://game/memento-advisor/ui/mma-style.css");
const HOST = UI.isInGame() ? "age-transition-bootstrap" : "create-game-sp";
if (!globalThis.__MMA_DECORATED) {                       // one registration per document
    globalThis.__MMA_DECORATED = true;
    Controls.decorate(HOST, (component) => {
        try { return new MmaScreenDecorator(component); }
        catch (e) { console.error("[MMA] decorator ctor", e); return NOOP_DECORATOR; }
    });
}
// NOOP_DECORATOR = { beforeAttach(){}, afterAttach(){}, beforeDetach(){}, afterDetach(){} }
```

```js
// ui/mma-decorator.js
import { readContext, buildIconIndex } from './mma-context.js';   // engine adapter
import { rankMementos, defaultMode } from './mma-ranking.js';      // pure
import { loadMode, saveMode } from './mma-settings.js';

const LIST = '[data-name="create-game-mementos-slot(SpatialSlot)"]';
const ICON_URL = /^url\('blp:(.+)'\)$/;

export class MmaScreenDecorator {
    constructor(component) { this.c = component; this.observer = null; this.frame = 0; this.list = null; }
    beforeAttach() {}
    afterAttach() {
        try {
            this.observer = new MutationObserver(() => this.schedule());
            this.observer.observe(this.c.Root, { childList: true, subtree: true });
            this.schedule();
        } catch (e) { console.error("[MMA] afterAttach", e); }
    }
    beforeDetach() {
        try { this.observer?.disconnect(); } catch (e) {}
        this.observer = null;
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0; this.list = null;
    }
    afterDetach() {}
    schedule() {
        if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.reconcile(); });
    }
    reconcile() {
        try {
            const list = this.c.Root.querySelector(LIST);
            if (!list) { this.list = null; return; }                 // memento tab not open
            if (list !== this.list) {                                 // tab (re)opened: new context
                this.list = list;
                this.ctx = readContext();                             // leader, civ, age, slots, unlocked mementos, traits
                this.iconToType = buildIconIndex(this.ctx.mementos);  // mementoIcon -> mementoTypeId
                this.mode = loadMode() ?? defaultMode(this.ctx);      // "auto" resolves via LeaderTags/CivilizationTags
                this.ranks = rankMementos(this.ctx, this.mode);       // Map<typeId, 1..6>
            }
            this.ensureSwitch();
            const cards = list.querySelectorAll(".img-unit-panelbox");
            for (let i = 0; i < cards.length; i++) this.decorateCard(cards[i]);
        } catch (e) { console.error("[MMA] reconcile", e); }
    }
    cardType(card) {
        const icons = card.querySelectorAll('[data-name="Icon"]');
        for (let i = 0; i < icons.length; i++) {
            const m = ICON_URL.exec(icons[i].getAttribute("name") ?? "");
            if (m) return this.iconToType.get(m[1]) ?? null;
        }
        return null;
    }
    decorateCard(card) {
        const type = this.cardType(card);
        const rank = (type && !card.classList.contains("memento-select-locked")) ? this.ranks.get(type) : undefined;
        let badge = null;
        for (let i = 0; i < card.children.length; i++)
            if (card.children[i].classList.contains("mma-badge")) { badge = card.children[i]; break; }
        if (!rank) { badge?.remove(); return; }
        if (!badge) { badge = document.createElement("div"); badge.className = "mma-badge font-title"; card.appendChild(badge); }
        const text = String(rank);
        if (badge.textContent !== text) badge.textContent = text;     // idempotent: no mutation when unchanged
    }
    ensureSwitch() {
        const bar = this.c.Root.querySelector(".memento-select-filter-bar");
        if (!bar || bar.nextElementSibling?.classList.contains("mma-switch")) return;
        const row = buildSwitch(this.mode, (mode) => {                // plain divs + 'click' (used by base and mods)
            this.mode = mode; saveMode(mode);
            this.ranks = rankMementos(this.ctx, mode);
            this.schedule();
        });
        bar.parentElement.insertBefore(row, bar.nextSibling);         // parent has no Solid inserts (§5.3)
    }
}
```

What `ui/mma-context.js` reads (each call in `try/catch`; all are verified shell APIs, §2–3):
- `pid = GameContext.localPlayerID`; `inGame = UI.isInGame()`.
- `leader = GameSetup.findPlayerParameter(pid, "PlayerLeader")?.value?.value?.toString()`.
- `civ = GameSetup.findPlayerParameter(pid, inGame ? "AgeTransitionPlayerCivilization" : "PlayerCivilization")?.value?.value?.toString()`.
- `age = GameSetup.findGameParameter("Age")?.value?.value?.toString()`. In game, take the next age (as `age-select-model.js:9-31` does).
- `mementos = Online.Metaprogression.getMementosData() ?? []`; keep those with `displayType == DisplayType.DISPLAY_UNLOCKED` and `mementoTypeId !== "MEMENTO_MF_RANDOM"`.
- Slots: the `GameSetup.getMementoFilteredPlayerParameters` + `getMementoSlotData()` count (model:34-65).
- Traits: `Database.query("config", "SELECT LeaderType, TagType FROM LeaderTags")` and `"SELECT CivilizationType, TagType FROM CivilizationTags"`, filtered in JS.

Styles (`mma-style.css`):
- `.mma-badge`: `position:absolute; top:0.6rem; right:0.6rem; z-index:2; pointer-events:none;` fixed rem size, round, high-contrast.
- `.mma-switch`: a single flex row; its items use `flex: 0 0 auto`.

### 7.4 Verify in game before building on it

1. Open the Coherent inspector (port 9444) on the memento tab. Confirm `[data-name="Icon"][name="url('blp:…')"]` on cards, the list `data-name`, and the filter-bar class, with Mattifus on and then off.
2. Search, change category, toggle «Показывать только доступные», equip and unequip, leave and re-enter the tab: badges must follow the cards and never duplicate.
3. Check `UI.log` for `[MMA]` errors and `SOURCE ERROR`, and `Database.log` for text errors. Text changes need a full restart.
4. Gamepad: the cards still navigate and focus; the switch does not trap focus.
5. Phase 2: age transition (game scope) and the MP lobby (`memento-item`).
