# Civ VII mods — Expansion Planner

A Civilization VII **UI mod** (mod id `expansion-planner`, in `mod/expansion-planner/`) plus Node tests and dev tools. It is a planner panel opened from a top-left toolbar button (or F8). It has six tabs:
- **Settlements:** sites for future cities or feeder towns.
- **Buildings:** an adjacency layout per settlement, or for all settlements at once, placed as Detailed Map Tacks. One-click actions: queue a city's next planned buildings, buy the best-value ones with gold, upkeep warnings.
- **Towns:** convert a town to a city or keep it, and which Town Focus to pick (with a «Выбрать» button that sets it).
- **Wonders:** where to build each wonder, and the race against rivals.
- **Empire:** every settlement on one page (city strengths, town Focus, food sent/received, plan left), plus the «Сеть еды» food-network map lens.
- **Autopilot:** for stepping away (online turn timers): each turn it chooses research and civics (game advisor), makes the choices that hold the turn (policies valued by Policy Yield Previews when installed, celebrations, story events, pantheon, government, city-state bonuses), fills empty production queues (a wonder it can win, the plan, else the advisor), places new citizens, sets town Focus, buys planned buildings above a gold reserve, recalculates the plan, optionally skips idle units and ends the turn (not while a choice holds it). Units move only with their own opt-in options: scouts explore (2 trained first), settlers are trained and found on the Settlements tab's sites (searched by itself; cities and towns 1 to 1, towns converted), idle military shoots or fortifies or explores (one garrison per city stays), merchants take the best trade route. Also befriends independents, promotes commanders, places the plan's map tacks. Off at every load. Plus an experimental single-player «ИИ играет N ходов» (the game's own Autoplay).

There are also tack pills in the city production menu and growth hints (map marks while the game asks where a new citizen goes). The user plays in **ru_RU**: every string ships in English and Russian.

More detail: `mod/CLAUDE.md` (architecture, engine API) and `tests/CLAUDE.md` (fakes, fixtures). Background:
- `PLAN.md`: the original design. Its §14 holds the user's binding decisions.
- `research/`: scout reports on the game's UI and DMT.
- `TESTING.md`: the in-game checklist. Add a row for every user-visible change.

## Commands (run from the repo root)
| What | Command |
|---|---|
| Unit tests (Node ≥ 22, no deps) | `npm test` |
| Import/export check against the real game files | `node tools/check-imports.mjs` (another mod: `node tools/check-imports.mjs <folder> <modId>`) |
| Syntax + XML well-formedness | `powershell -NoProfile -File tools/check-syntax.ps1` |
| Regenerate `<ImportFiles>` after adding/renaming a UI file | `python -I tools/sync-modinfo.py` (refuses files without the `xpl-` prefix) |
| Re-extract game data for tests | `python -I tools/extract-fixtures.py antiquity` |
| Planner speed on a fake 8-city map (CPU per phase) | `node tools/bench-plan.mjs` (`nomemo` to compare without the tile memo) |
| Follow the game's UI log | `powershell -File tools/tail-ui-log.ps1` |

Run all four checks before handing anything to the user: tests, imports, syntax, and XML (the last is covered by check-syntax).

## Game loop (how changes reach the game)
- **Live link:** the mod folder is junctioned into `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\expansion-planner` (`tools/deploy-junction.ps1`). Edits are live on disk.
- **Live reload:** `AppOptions.txt` has `UIFileWatcher 1`, so **JS** edits reload live. New/renamed files, `.modinfo` changes and **text (LOC) changes need a full game restart.** Tell the user which one applies.
- **Logs:** in `%LOCALAPPDATA%\...\Logs\`.
  - `UI.log`: our lines start with `[XPL]`. Also grep for `JS Error`.
  - `Modding.log`: "Target in-game actions" is the truth about which mods loaded. The Add-Ons screen (Slothoth's Modpage Manager, profiles) is not.
  - `net_message_debug.log`: every request sent to the game, with timestamps (`PlayerOperation`, `UnitOperation`, `CityOperation`, `CityCommand`, `PlayerTurnComplete`; `bFromUser: 0` = sent by script). The truth about what the autopilot actually sent and what the player clicked (e.g. `TRIGGER_ADVISOR_SELECTED`).
- **Reading log evidence:** the user sends screenshots. Read the logs yourself before guessing. Plan logs report e.g. `N placed, M unplaced {reason counts}`, `N uniques`, `our adjacency differed from the game's on a/b pairs`.
- **Undoing the dev setup:** see `TESTING.md`.

## Paths
- **Game:** `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`. The UI JS is in `Base\modules\base-standard\ui` and `Base\modules\core\ui`; the data XML is in `Base\modules\*\data`; the gameplay schema is `Base\Assets\schema\gameplay\01_GameplaySchema.sql`. **When unsure how the game does something, grep its UI JS: it is plain readable JS.**
- **Dev tools:** `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII Development Tools`.
- **Workshop mods:** `D:\SteamLibrary\steamapps\workshop\content\1295660\<id>`.
  - **Read-only for us.** Several are locally patched by another agent. Its packages, manifests and backups are in `C:\Users\glazu\Documents\Codex\2026-10-07\new-chat\outputs`.
  - **Steam updates silently overwrite patches.** Policy Yield Previews went to 1.5.0 on 2026-10-10. Compare hashes against that manifest before blaming a mod.
  - **Mods we integrate with:**
    - 3507297712 Detailed Map Tacks (DMT);
    - 3734579243 Drongo's Compact Production (replaces the production menu);
    - 3507102289 BZ City Hall (its production menu is disabled when Drongo's is present);
    - 3656705275 Wonder Alert (the model for the wonder race data).

## Hard-won gotchas (read before changing related code)
1. **Every imported mod file needs a globally unique file name.** The game resolves UI imports *by file name across all mods and the base game*. Our old `yields.js` and `settings.js` shadowed Policy Yield Previews' files. Its previews broke with `does not provide an export named …` while its own files were fine. All our files are `xpl-*`. When another mod shows that error, look for name clashes first.
2. **`<Mod version="…">` must be an integer ≥ 1.** "0.1.0" was read as 0: the mod showed as enabled but never loaded. Put the display version in `<Properties><Version>`.
3. **`GameInfo.Terrains` has no `Mountain` column.** Mountains are `Impassable` terrain. Use the terrain type or `GameplayMap.isMountain`. Reading `.Mountain` made every mountain buildable and workable.
4. **Navigable rivers are not water for `GameplayMap.isWater`.** Only buildings whose `Constructible_ValidTerrains` list `TERRAIN_NAVIGABLE_RIVER` may stand on them (Fishing Quay, Harbor, Ancient Bridge). A water tile stays water after a quay makes it urban.
5. **Building placement needs an owned tile touching an urban tile or the city centre.** Outer planned tiles only become valid after the inner buildings exist. The city centre has 2 slots (Palace or City Hall plus one).
6. **`player.Diplomacy.isValidLandClaimLocation`** is always false on unexplored plots. Pass a plain `{x, y}` literal.
7. **Plot overlays do not draw over fog.** Use the VFX `VFX_3dUI_Hex_Highlight_01` through `WorldUI.createModelGroup`. Overlay groups and sprite grids start hidden: call `setVisible(true)`.
8. **`fxs-checkbox` fires `component-value-changed` with `detail.forced === true` when its `selected` is set from code.** Ignore those events: re-rendering on them once froze the game in an infinite loop. `fxs-dropdown`: set `dropdown-items` *before* `selected-item-index`.
9. **The UI engine (Coherent Gameface) defaults flex items to `flex-shrink: 0`.** Text doesn't wrap unless you give the item `flex: 1 1 0; min-width: 0`.
10. **The panel is non-modal.** `ContextManager.push` without a mouse guard, with `InputContext.Dual`. Swallow `camera-zoom-in/out` only while the pointer is over the panel, or the map zooms while the list scrolls.
11. **The user wants manual recalculation.** Re-planning on game events or at turn start caused lag. Events only add "advice" reasons (`hud/xpl-recalc-watch.js`), shown as a gold dot on the toolbar button and a glowing «Пересчитать». Opening a tab never starts a plan; cheap tabs (Towns, Wonders) may refresh.
12. **Town rules** (verified in the game's text and data):
    - Every Town Focus needs population 7.
    - Every Focus except "Growing Town" stops growth and sends all food to connected cities. Connected means a road, or both coastal on the same continent; `city.getConnectedCities()` lists them.
    - Town production is converted into gold.
    - Towns can only buy `Buildings.Town = true` buildings: Altar, warehouses, walls, bridge.
    - Hub Town: one per continent.
13. **Unique quarters stay buildable in later ages** (AGELESS, and `Players.Constructibles.get(id).getUnlockedUniqueQuarters()`), even for a previous civilization.
    - **Syncretism** (a Time-Tested civ adopting an Apex civ's infrastructure, e.g. Greece in Exploration adopting the Abbasid Ulema) adds a quarter to that same list *in the middle of a turn*. Every base-game unique building belongs to a quarter, so that list is the whole truth.
    - **Never cache the rule book for the whole game.** `getRules()` is keyed on age, civ, turn and the unlocked quarters. It used to be cached on age + civ only, so a syncretized quarter (and newly activated adjacencies) never reached a recalculation.
14. **DMT tacks live in GameTutorial properties.**
    - **Storage:** keys `Database.makeHash("_DMT_OBJ_MAP_TACK_KEYS")` and `_DMT_OBJ_MAP_TACK_<x>-<y>`.
    - **Placing and removing:** `engine.trigger("AddMapTackRequest" | "RemoveMapTackRequest", {...})`. `validStatus` must be an object.
    - **Limits:** at most 2 slot-using tacks per plot. DMT removes a tack when the matching building is completed.
    - **Speed and concurrency:** each tack request makes DMT redraw, so 150 tacks take ~6 s each way. `placeTacks`/`clearOurTacks` run one at a time (two overlapping runs corrupted our registry, and the button looked dead), and `replacePrevious` only removes our tacks the new list drops and adds the new ones; unchanged tacks stay.
    - **Generic tacks:** `DMT_BUILDING_<YIELD>`, `DMT_BUILDING`, `DMT_BUILDING_UNIQUE_QUARTER`, `DMT_WONDER`, `DMT_IMPROVEMENT`.
15. **Settings** live in `localStorage["modSettings"]["expansion-planner"]`, with a `UI.setOption` backup. Never add another localStorage key and never clear storage: other mods wipe on multiple keys.
16. **Planner speed rules** (see `mod/CLAUDE.md` "Speed").
    - `PlanState` memoises tile views and values. Edit tiles only through `place/undo/lift/restore`, or call `invalidateAll()` afterwards (the building job does after applying tacks).
    - The game's per-city answers are cached per turn (`data/xpl-engine-cache.js`); game events drop the cache. **A test that changes the fake world mid-turn must call `clearEngineCache()`**, like the game would fire an event.
    - A recalculation of the same plan is incremental: settlements whose fingerprint (tiles, buildings, tacks, queue, the game's numbers) is unchanged keep their layout. New inputs a plan depends on must go into `settlementSignature`, `engineFingerprint` or `inputSignature`, or they will be ignored by fast recalculation.
17. **The game's `Autoplay` is made for its benchmarks.** An age change while it runs rebuilds the next age with the human slot saved as AI (`GameCore.log` «SlotStatus - AI»): the game then plays that civ by itself for good, picks its next civilizations, and it keeps playing after a victory. Our «ИИ играет» therefore stops one turn before the age ends (`Game.AgeProgressManager.ageCountdownStarted` and max − current points ≤ 1), on `GameAgeEnded`, `TeamVictory` and the player's `PlayerDefeat`; «Вернуть управление» runs one Autoplay turn with `setReturnAsPlayer` to hand a lost slot back (untested in game).
18. **Scrollbars and log noise.**
    - The UI engine scrolls `overflow-y: auto` but draws no scrollbar. Every scrolling list sits in the game's `<fxs-scrollable attached-scrollbar="true">` (`.xpl-scroll`, `.xpl-scroll--fill`): the wrapper takes the list's place in the layout, and the list inside no longer scrolls. Never `innerHTML` the fxs-scrollable itself (it holds its track and thumb); refill the list div inside. The panel frame needs a fixed `height` (not only `max-height`): with a content-sized frame the scrollables fed back into its height, which jumped up and down and then stopped short of the free space.
    - Detailed Map Tacks logs ~100 "lookup requires key to be of type 'number' or 'string'" lines per tack whenever it refreshes tacks (each turn, each placement): 180 autopilot tacks made UI.log grow by ~200 MB in 60 turns. The autopilot therefore tacks only each settlement's next 3 buildings (`placePlanTacks(..., {perSettlement: 3})`). Both the lookup warnings and our `[XPL]` lines show the same blank `:NN:23` location (a shared console wrapper), so that location does not identify the source.
19. **`GameInfo` tables are not JS arrays.** They have `lookup`, `length`, `filter`, `find`, `findIndex`, `forEach` and `for…of` (all the game's own UI uses; `filter` returns a real array). `.some`, `.map`, `.every`, `.reduce`, `.includes`, `.sort`… throw "is not a function" in game: `(GameInfo.TypeTags ?? []).some(...)` stopped the autopilot. The fake engine's tables now throw on those too; in tests copy a table with `Array.from(GameInfo.X, fn)` first.
20. **Shell gotchas on this Windows machine.**
    - `AppOptions.txt` is CRLF: edit it with Python binary replace, never `sed -i`.
    - Long bash heredocs with mixed quotes break. Write the Python patch script to the scratchpad and run it.
    - `tar` on `C:` paths needs `--force-local`.
    - Node ESM imports need `file:///` URLs for absolute Windows paths.

## Conventions
- **Layering:**
  - **Pure logic** in `ui/core/` (no engine globals; unit-tested with real game data).
  - **Engine adapters** in `ui/data/` (wrap every engine call in `safe()`: the API differs between game versions).
  - **UI** in `ui/panel/`, `ui/hud/`, `ui/map/`.
- **Every fix gets a test that fails without it.** Check this by temporarily reverting the fix. Several "fixes" here first came with tests that passed anyway.
- **Strings:** add every `LOC_XPL_*` key to both `text/en_us/InGameText.xml` (`<Row>`) and `text/ru_ru/InGameText.xml` (`<Replace Tag=… Language="ru_RU">`).
- **Russian game terms:**
  - Town = «Городок»
  - Settlement = «Поселение»
  - Happiness = «Довольство»
  - map tack = «булавка»
  - Recalculate = «Пересчитать»
- **Prefer the game's own data and engine numbers over our rules.** The planner already anchors its adjacency to `calculateAllBuildingsPlacements`.
- **Git:** the repo has no commits yet. Commit or push only when the user asks.
