# Civ VII mods — Expansion Planner

A Civilization VII **UI mod** (mod id `expansion-planner`, in `mod/expansion-planner/`) plus Node tests and dev tools. It is a planner panel opened from a top-left toolbar button (or F8). It has six tabs:
- **Settlements:** sites for future cities or feeder towns.
- **Buildings:** an adjacency layout per settlement, or for all settlements at once, placed as Detailed Map Tacks.
  - Whole layouts are searched, connector buildings toward far good tiles included (gotcha 48).
  - Specialists are valued where a tile's adjacency pays for them (gotcha 49), and ageless quarters for the next age too (gotcha 50).
  - The tiles of the wonders we will build are kept, with quarters around them (gotcha 52).
  - One-click actions: queue a city's next planned buildings, buy the best-value ones with gold, upkeep warnings.
- **Towns:** convert a town to a city or keep it, and which Town Focus to pick (with a «Выбрать» button that sets it).
- **Wonders:** where to build each wonder, its tier (what its effect is worth), and the race against rivals.
- **Empire:** every settlement on one page (city strengths, town Focus, food sent/received, plan left), plus the «Сеть еды» food-network map lens.
- **Autopilot:** for stepping away (online turn timers): each turn it chooses research and civics (game advisor), makes the choices that hold the turn (policies valued by Policy Yield Previews when installed, celebrations, story events, pantheon, government, city-state bonuses), fills empty production queues (a wonder it can win, by tier and value per turn, on the plan's tile; else the plan; else the advisor; a chosen wonder goes straight to the front; a wonder race it will lose gets a building ahead of it, and a big building stands behind every wonder; in an age's last turns (the final age: all of it) only what is done before the age ends, and a nearly done building is bought on a non-final age's last turn), places new citizens, sets town Focus, buys planned buildings above a gold reserve (one budget a pass; gold saved for a town conversion or the victory path's next building before small purchases; a gold line in the tab and UI.log), recalculates the plan, optionally skips idle units and ends the turn (not while a choice holds it). Units move only with their own opt-in options: scouts explore (2 trained first), settlers are trained and found on the Settlements tab's sites (searched by itself; cities and towns 1 to 1 as a floor, then towns converted by their yields), idle military shoots or fortifies or explores (one garrison per city stays; hurt units escape onto shallow water from land melee raiders), merchants take the best trade route. Also befriends independents, spends leader attribute points, promotes commanders (Bastion first, commendations spent; with «Оборона» they stand in the most threatened or unhappiest settlement and lead Focus Fire / Coordinated Attack on raiders), places the plan's map tacks, puts archived great works on display, assigns resources, and (opt-in) explorers dig artifacts, a victory focus steers toward the closest legacy path, by phases (Growth, Build-up, Final push: «Стратегия по фазам») (with its triumphs; research, buildings, growth, merchants and resources serve the science or economic path of each age; the government suits the focus; the Autopilot tab shows each victory's points and countdown and which victories are off; the final age's score race goes to UI.log, and settlers go past the settlement cap when that starts our military countdown), melee soldiers strike raiders when the game's own attack preview says it pays, defence against independents (no site near their villages, befriending one at a time, melee defenders bought where raiders are, empty villages dispersed, Fort Town walls), and diplomacy (counter-spy, reconciliation, initiatives). Off at every load, and switched off when anyone wins or we are defeated. Plus an experimental single-player «ИИ играет N ходов» (the game's own Autoplay).

There are also tack pills in the city production menu and growth hints (map marks while the game asks where a new citizen goes). The user plays in **ru_RU**: every string ships in English and Russian.

More detail: `mod/CLAUDE.md` (architecture, engine API) and `tests/CLAUDE.md` (fakes, fixtures). Background:
- `PLAN.md`: the original design. Its §14 holds the user's binding decisions.
- `research/`: scout reports on the game's UI and DMT.
- `TESTING.md`: the in-game checklist. Add a row for every user-visible change.

## Second mod: Memento Advisor (`mod/memento-advisor/`, id `memento-advisor`)
Numbers 1–6 on the memento selection screen: the best mementos for the chosen leader + civilization. A row switches between Auto (the pair's own victory), Balanced and each victory; the choice is kept in `localStorage.modSettings["memento-advisor"]`.
- **Where it runs:** the front end (new game: host `create-game-sp`) and in game (age transitions: host `age-transition-bootstrap`).
- **The hook:** `Controls.decorate` on the host plus a scoped MutationObserver, because the memento screen is a SolidJS component. Each card's memento comes from its icon (`url('blp:<icon>')`). It works with Mattifus's Memento Editor, which the user has.
- **Research:** `research/15-memento-screen.md` (screen, hook, pitfalls) and `research/16-memento-scoring.md` (scoring method, spot checks).
- **Data:** the scores are precomputed: `python -I tools/memento-advisor/build_table.py` → `mod/memento-advisor/data/mma-table.js`. The reference dump goes to `tools/memento-advisor/out/`, not the mod.
- **Code:** `ui/mma-ranking.js` is pure; `ui/mma-context.js` is the engine adapter; `ui/mma-decorator.js` holds the badges and the row.
- **Tests:** `tests/memento-advisor/`.
- **Deploy:** `powershell -File tools/deploy-junction.ps1 -Mod memento-advisor`.

## Commands (run from the repo root)
| What | Command |
|---|---|
| Unit tests (Node ≥ 22, no deps) | `npm test` |
| Import/export check against the real game files | `node tools/check-imports.mjs` (the other mod: `node tools/check-imports.mjs mod/memento-advisor memento-advisor`) |
| Syntax + XML well-formedness (every mod under `mod/`) | `powershell -NoProfile -File tools/check-syntax.ps1` |
| Regenerate `<ImportFiles>` after adding/renaming a UI file | `python -I tools/sync-modinfo.py` (refuses files without the `xpl-` prefix) |
| Re-extract game data for tests | `python -I tools/extract-fixtures.py antiquity` |
| Planner speed on a fake 8-city map (CPU per phase) | `node tools/bench-plan.mjs` (`nomemo` to compare without the tile memo) |
| Layout quality: our solver against the best layout a long search finds, on random cities | `node tools/bench-optimality.mjs [maps] [steps] [antiquity/exploration/modern] [timed] [show=N]` |
| Follow the game's UI log | `powershell -File tools/tail-ui-log.ps1` |

Run all four checks before handing anything to the user: tests, imports, syntax, and XML (the last is covered by check-syntax).

## Game loop (how changes reach the game)
- **Live link:** the mod folder is junctioned into `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\expansion-planner` (`tools/deploy-junction.ps1`). Edits are live on disk.
- **Live reload:** `AppOptions.txt` has `UIFileWatcher 1`, so **JS** edits reload live. New/renamed files, `.modinfo` changes and **text (LOC) changes need a full game restart.** Tell the user which one applies.
  - **A live reload switches the autopilot off** (it is runtime state): after editing JS while the user plays, tell them to press «Включить» (and «Сделать сейчас» if a turn is held).
  - **Develop between turns:** a reload in the middle of a turn's start reboots the autopilot's pass (seen in game 6: the advisor pop-up's TRIGGER_ADVISOR_SELECTED was sent 508 times while files were saved during turn starts).
  - **Prove tests on a copy:** reverting a fix to watch its test fail edits files the running game reloads (and once a write was refused while the game held the file). Copy `mod/`, `tests/` and `package.json` to a scratch folder and revert there.
- **Logs:** in `%LOCALAPPDATA%\...\Logs\`.
  - `UI.log`: our lines start with `[XPL]`. Also grep for `JS Error`.
  - `Modding.log`: "Target in-game actions" is the truth about which mods loaded. The Add-Ons screen (Slothoth's Modpage Manager, profiles) is not.
  - `net_message_debug.log`: every request sent to the game, with timestamps (`PlayerOperation`, `UnitOperation`, `CityOperation`, `CityCommand`, `PlayerTurnComplete`; `bFromUser: 0` = sent by script). The truth about what the autopilot actually sent and what the player clicked (e.g. `TRIGGER_ADVISOR_SELECTED`).
  - Other game logs worth reading (research/13 lists what each showed): `DiplomacySummary.csv` (wars declared on us, suzerains, peace), `Player_Stats.csv` (cities, towns, settlement cap and over-cap, techs, yields per turn), `Player_Treasury.csv` (gold balance), `Player_Legacies.csv` (triumphs), `GameCore.log` (`Team 0 has won … 'VICTORY_…' victory!`).
  - `CityBuildQueue.csv`: every city's production each turn, all players (`Game Turn, Player, City, Production Added, Current Item, Current Production, Production Needed, Overflow`). The truth about wonder races and lost production (a jump in "Production Added" means another item's progress was poured in).
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
    - Roads: the game builds them between nearby settlements when one is founded. A link must be direct: a road through another settlement does not count. A merchant's «Build Road to Settlement» (`UNITCOMMAND_CONNECT_WITH_ROAD`: from our urban tile to one of our settlements within trade range, 10 / 15 / 20 tiles by age, with no direct road back) uses up the merchant (the user, game 22). The autopilot builds no roads; a town with no connected city gets no Focus and keeps growing (research/29 §6).
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
    - A recalculation of the same plan is incremental: settlements whose fingerprint is unchanged keep their layout. The fingerprint holds the tiles, buildings and tacks, the game's valid tiles and adjacency (`engineFingerprint`), and the settlement's role, specialist limit and wonder anchors (`memberSignature`).
    - A new settlement (a founding, a town turned city, a new site) is solved alone; others are re-solved only when their tiles changed.
    - A full plan comes only from the whole plan's inputs (`inputSignature`: profile, balance, options, age, civilization, selection), every 10 turns, or every settlement changed. `plans.fullWhy` and UI.log's `buildings timing: full (…)` say which.
    - **Not in the fingerprint:** the settlement's yield totals the game reports per tile. They move with every citizen, and in game 20 they marked most cities changed on every recalculation (584 settlements re-solved in 166 incremental plans).
    - **Not in the inputs:** the settlement list. In game 20, 40 of 76 full plans (125 of 217 s) came from foundings and conversions.
    - **New inputs:** a new input a plan depends on goes into one of these three, or fast recalculation ignores it.
17. **The game's `Autoplay` is made for its benchmarks.** An age change while it runs rebuilds the next age with the human slot saved as AI (`GameCore.log` «SlotStatus - AI»): the game then plays that civ by itself for good, picks its next civilizations, and it keeps playing after a victory. Our «ИИ играет» therefore stops one turn before the age ends (`Game.AgeProgressManager.ageCountdownStarted` and max − current points ≤ 1), on `GameAgeEnded`, `TeamVictory` and the player's `PlayerDefeat`; «Вернуть управление» runs one Autoplay turn with `setReturnAsPlayer` to hand a lost slot back (untested in game).
18. **Scrollbars and log noise.**
    - The UI engine scrolls `overflow-y: auto` but draws no scrollbar. Every scrolling list sits in the game's `<fxs-scrollable attached-scrollbar="true">` (`.xpl-scroll`, `.xpl-scroll--fill`): the wrapper takes the list's place in the layout, and the list inside no longer scrolls. Never `innerHTML` the fxs-scrollable itself (it holds its track and thumb); refill the list div inside. The panel frame needs a fixed `height` (not only `max-height`): with a content-sized frame the scrollables fed back into its height, which jumped up and down and then stopped short of the free space.
    - Detailed Map Tacks logs ~100 "lookup requires key to be of type 'number' or 'string'" lines per tack whenever it refreshes tacks (each turn, each placement): 180 autopilot tacks made UI.log grow by ~200 MB in 60 turns. The autopilot therefore tacks only each settlement's next 3 buildings (`placePlanTacks(..., {perSettlement: 3})`). Both the lookup warnings and our `[XPL]` lines show the same blank `:NN:23` location (a shared console wrapper), so that location does not identify the source.
19. **`GameInfo` tables are not JS arrays.** They have `lookup`, `length`, `filter`, `find`, `findIndex`, `forEach` and `for…of` (all the game's own UI uses; `filter` returns a real array). `.some`, `.map`, `.every`, `.reduce`, `.includes`, `.sort`… throw "is not a function" in game: `(GameInfo.TypeTags ?? []).some(...)` stopped the autopilot. The fake engine's tables now throw on those too; in tests copy a table with `Array.from(GameInfo.X, fn)` first.
20. **Never move a queue item ahead of one in production with progress** (wonders aside: gotcha 55).
    - **What the game does:** an item moved ahead started from its own production and the item behind kept its own, in all 11 cases of games 21 and 22; game 3 once saw the opposite.
      - Game 3 (`CityBuildQueue.csv`): the victory focus moved a Market to the front while the Pyramids were at 136 of 137. The Market got 155 production for a 49 cost, and the Pyramids started over (a Lighthouse did the same later).
      - Game 21, three times, the opposite (research/28 §3): the Emile Bell moved ahead of a Library with 30 got only its own production, and the Library kept its 30; Chicago's Dungeon moved ahead of the Serpent Mound (30) got only its own, twice, and the wonder kept its 30.
      - Game 22, eight more (research/29 §5): units moved ahead of items with progress (a Library's 21, an Academy's 20, Universities' 49, 48 and 184, walls' 61, the Heliocentric Model's 66, the Shwedagon Pagoda's 296) started from their own production, and each item that resumed had its own (184 → 217.2 = 184 + 33; 61 → 79 = 61 + 18; 66 → 114.2).
      - Units moved ahead of a wonder (settler, slinger) did not take its progress; the wonder resumed. The rule covers every move anyway.
    - **The rule:** every `MoveTo` goes to `frontSlot(city)` in `data/xpl-autopilot-steps.js`. That is position 1 when `BuildQueue.getPercentComplete(currentProductionTypeHash) > 0`, else 0.
    - **Units are the exception** (`unitSlot`): they go ahead of a wonder or a project in production. Units never take an item's progress, ahead of a wonder or a building (game 9, research/24 §5). Projects too (game 22: the Heliocentric Model kept its 66 behind a Knight, research/29 §5).
      - Seen in game 5: under the strict rule, the capital's settlers waited 7–12 turns at a time behind wonders and Chart the Stars / Spherical Earth. The empire had 1 city for 57 turns of Antiquity.
      - But not ahead of a wonder in a race, nor of a science project that would then miss the age, unless a defender of a threatened settlement (`holdsFront`; game 9: Oxford lost by 97, the Heliocentric Model by 51).
    - **A science project goes ahead of a plain building with progress** (`projectSlot`; one-offs and Crewed Space Flight Preparation alike): nothing is lost either way (it takes the progress, or the building keeps it). Never ahead of a science site (Launch Pad, Airfield) in production. Game 11 showed why: Лянчжоу's Launch Pad overflow went into a Cannery the plan had queued behind it, and the Preparation waited 9 turns behind the Cannery.
    - **A lost wonder pours half its progress plus that turn's production into the next item**, its overflow capped (game 9: the Red Fort's 300 into a 15-cost Scout). A building, not a unit, stands right behind a wonder in production (`guardWonderRefund`).
    - **New units:** wanted units go to the city whose queue is free soonest.
21. **Victory data spans every age.**
    - `GameInfo.LegacyPaths` lists all ages' paths (Antiquity's first). Keep the current age's (`Age`) and, per class, the path with a goal. Before this the victory focus found no path after every age change.
    - `getEnabledLegacyPaths()` may still name the setup age's paths: match by `legacyPathClass` too.
    - `GameInfo.Victories` has `VictoryClassType` (`VICTORY_CLASS_*`), not `LegacyPathClassType`.
22. **The game's production advisor has no limits.** It recommends wonders (with no race check: a wonder lost on its first turn, one temple queued in two cities) and units in every empty queue (32 scouts in one game). Wonders come only from `chooseWonders`; the advisor's units are capped (`unitWanted`); settlers never from it.
23. **One unit of each formation per tile.** A military unit plus one of each other `GameInfo.Units.FormationClass` (a settler and a scout are both civilian). When stacked, the game allows only MOVE_TO / WAIT_FOR, and NOTIFICATION_COMMAND_UNITS holds the turn: any unit without an order steps aside (`stepAside`, `roomFor`).
24. **Policy Yield Previews values only plain yields.** Production toward projects or buildings, lump grants (`EFFECT_PLAYER_GRANT_YIELD`: Elective Republic's +1000 Science celebration, the governments' gold), mastery speed, cheaper purchases, specialist caps and slots all come back as 0 (its `scripts/effects/apply-effects.js`). The autopilot's choices add them through `core/xpl-effect-value.js`: `effectsOf` resolves `GameInfo.Modifiers` → `DynamicModifiers.EffectType` + `ModifierArguments`, following `EFFECT_ATTACH_MODIFIERS` (city-state bonuses). Before this, Elective Republic's +1000 Science lost to a little culture.
    - **Civilization abilities that pay per card are invisible to it too:** Ming loses 15 Science a turn for every social policy slotted (traditions free: `EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION`, `CivUnique` + `Invert`; a civ's own traditions carry a `TraitType`, policies none).
      - Seen in game 5: Ming's science went below zero and the empire got 4 techs in 53 turns.
      - `perCardYields` reads our civilization's and leader's trait modifiers. A card worth less than an empty slot is not slotted — but the game will not end the turn while a slot is empty and cards are offered (`NOTIFICATION_TRADITIONS_AVAILABLE`; «seen it», `CONSIDER_ASSIGN_TRADITIONS`, does not release it; seen in game 6), so the end-of-turn retry then slots the least bad card (POLICY_FORCED), and an active card is only ever swapped for a better one, never dropped into an empty slot.
      - A tradition card only fits a tradition slot; a policy card fits a policy slot, or a tradition slot once the policy slots are full (`model-policies.js` `availableToActive`).
25. **A project needs its building in the city that runs it** (`Projects.PrereqConstructible`, unless `PrereqAnyCity`).
    - Crewed Space Flight Preparation (repeatable, 15 Innovation) runs only in cities with their own Launch Pad.
    - Trans-Oceanic Flight and Break the Sound Barrier need an Airfield there.
    - The science victory (100 Innovation and an undamaged Launch Pad, then a 5-turn countdown) goes on after the Modern path's 3 projects, so in the final age the focus keeps a completed path (research/14).
26. **A build-queue entry carries every type field, -1 where it does not apply** (`BuildQueue.getQueue()`: `constructibleType`, `unitType`, `projectType`, plus `type`).
    - So `q.constructibleType ?? q.projectType` reads -1 for a project or a unit.
    - Seen in game 5: a queued project was never found, so it was requested again every pass (Chart the Stars 22 times, Crewed Space Flight Research 18) and never moved to the front.
    - Read entries with `queueItemType(q)` (`data/xpl-autopilot-steps.js`). The fake engine's entries now look like the game's.
27. **An independent's village is not a city.** `player.Cities` is empty for it (only a city-state has a city); read the independent's `player.Constructibles.getConstructibles()` for `IMPROVEMENT_VILLAGE` / `IMPROVEMENT_ENCAMPMENT`, as the game's banners do (`data/xpl-player-facts.js` `villagesOf`).
    - Settling within 3 tiles of a village makes it hostile at once; within 4–6 its relationship drops one level (neutral → hostile).
    - Seen in game 5: villages were invisible to the site search (it read cities), every site was 4–5 tiles from one, five villages declared war the turn we settled, and four of those settlements fell. Befriending ordered them by the distance to their cities (none), so the order was arbitrary.
    - Sites now keep 6 tiles from any village, friendly or not (`angersVillage`). Probe P2 (game 6): two camps at peace with us, our own city-states of the previous age respawned, declared a surprise war when Фучжоу was founded 4 and 5 tiles away, and took it.
28. **Town and city defence** (research/17).
    - A centre defends at the strongest melee unit its owner has trained, minus 10. Game 5 trained only ranged units after Antiquity, so centres defended at 20–30 against Line Infantry at 50.
    - Walls are `Purchasable="false"`, and towns have no production queue: a town gets walls only with the Fort Town Focus (it may then buy them). Towns can buy units.
    - Befriending costs 80/160/240 Influence; sending several requests in one pass started only the first. Its war with us ends at progress 30.
    - `IndependentRelationship.NEUTRAL` means at peace (yellow unit flags), only HOSTILE at war. The threat check once counted neutral villages' units, and a village's own guards at home: in game 6 two towns were "threatened" for 20 turns by units that never attacked.
    - At an age change the previous age's city-states return as villages at war with everyone but their suzerain; independents took settlements with their own standing units 4–6 tiles away (not raids) and razed them.
    - **Guards for a war** (research/23 D3; research/30 §2): a war at our door asks for a melee guard in every settlement within 12 tiles of the enemy's settlements; a war risk alone (an Unfriendly or Hostile major close by, or spying on us) one per risky leader, in our settlement nearest to it (`guardedSettlements`), counting the melee units we have. Game 23: the ring held 14–18 of our 18 settlements on a crowded map, so two Tanks were always in production from M50: six built (1,380 production; unit upkeep 78 → 168 gold a turn) for a war that never came (`AI_Operation_Eval.csv`: no attack on us evaluated in Modern until its last turn).
29. **Shell gotchas on this Windows machine.**
    - `AppOptions.txt` is CRLF: edit it with Python binary replace, never `sed -i`.
    - Long bash heredocs with mixed quotes break. Write the Python patch script to the scratchpad and run it.
    - `tar` on `C:` paths needs `--force-local`.
    - Node ESM imports need `file:///` URLs for absolute Windows paths.
30. **The treasury does not change during an autopilot pass.** Every purchase step reads the same `goldBalance()`: a purchase sent is not taken from the balance until the game handles it.
    - Seen in game 6: a town conversion and a Granary were sent in one pass (the Granary was refused); two repairs that each "fit" the gold were both sent.
    - Every spend goes through the pass budget (`core/xpl-savings.js` `createBudget`, made by `steps.goldPlan`): `all()` for repairs, walls and defenders under threat, `forGoal()` for the savings goal's own purchase, `free()` for everything else (above the reserve and what the goal holds). New purchase code must take the budget and call `budget.spend`.
31. **An age change keeps the gold and takes the cities** (probe P6, game 6's logs).
    - Gold carries over in full, negative gold too (E70 balance minus that turn's purchases plus M1 income = M1 balance, exactly).
    - Every city but the capital is a town again on the new age's first turn (every player had exactly 1 city on turn 1; a rival bought the same conversions twice). The legacy card «All your cities from the previous age remain cities» (`CARD_AT_EXP_GOLDEN_AGE_ECONOMIC`) brings them back on turn 2.
    - So the autopilot buys no conversion in a non-final age's last `LATE_CONVERSION_TURNS` 10 turns (unless the Towns tab's «expect to keep cities» is on), and a gold bank for the next age may start before the age ends.
    - Nor in the final age's last `FINAL_CONVERSION_TURNS` 25 turns: a city that late builds little before the game ends (research/30 §3: game 23 paid 2,500 at M48 for a city that then built 46 of an Ironworks).
32. **The dominance goal is ⌊multiple × second place⌋** (probe P11). `Game.VictoryManager.getCountdownVictoryDominanceScore(hash)` returns absolute points: the multiple times the second-highest score among all majors (met or not; not the leader, not our best met rival), rounded down. It is ≤ 0 until Exploration 50% (first positive on E35 of 70), then the multiple steps 6× → 4× (Exploration 80%) → 3× (Modern 20%) → 2× (40%) → 1.5× (60%) → 1.25×. Seen in game 6: America's culture reached 241 against 238 on M43 and won after the 5-turn countdown.
33. **`ComponentID` is not a global.** The game's UI imports it (`/core/ui/utilities/utilities-component-id.js`); in our files `ComponentID.isMatch(…)` throws, and a `safe(…, a === b)` fallback compares objects by identity.
    - Seen in game 7 (research/22 B1): every `SimulateCombatResult` arrived with a token equal by value but was dropped, so one strike happened in a whole age while raiders sat next to the capital.
    - Compare ids with `core/xpl-component-id.js` (`sameId`, `validId`, `idString`). The fake engine defines no global `ComponentID`.
    - `Game.Combat.getDefensibleDistrict(loc)` answers an invalid id, not null, off a district: test it with `validId` (a truthiness check skipped every target).
34. **Purchase answers: `InsufficientFunds` means "possible, but short of gold".**
    - The game answers `Success: false` with `InsufficientFunds: true` while the gold is short (its buttons are disabled then): a town conversion read as `Success` alone was never a savings goal (B2; 2 conversions in game 7).
    - It sets `InsufficientFunds` by the gold alone, even for a building the city already has: check `cityHas` before taking it as a goal (B4: a University stayed the goal 29 turns after it was bought).
    - A town with a Focus may buy the buildings tagged with that Focus (`URBANCENTER` for Urban Center: Library, Observatory, Schoolhouse…; probe P3).
35. **The game may activate our turn twice.** `PlayerTurnActivated` comes again after an automated explorer moves (24 turns of game 7 had two full passes, B9). Only the first pass of a turn (or «Сделать сейчас») plans, queues and buys; a second one orders units and ends the turn.

36. **Peace deals go through the working deal, and the AI is asked first.**
    - The game's peace screen sends `sendWorkingDeal(deal, INSPECT)`; the AI answers with a `DiplomacyStatement` (`RespondingToDealAction` INSPECT, `DealAction` ACCEPTED or REJECTED) that nobody shows. It proposes (`PROPOSED`) only after. A refusal of a proposal is shown as the leader's dialog (game 8: 8 blind white-peace proposals, 8 dialogs).
    - A deal a leader sends us arrives as a `DiplomacyStatement` with `DealAction` PROPOSED and becomes the working deal `{direction: OUTGOING, player1: us, player2: them}`; it is answered with `sendWorkingDeal(id, ACCEPTED | REJECTED)`. While its screen is open the game refuses to end the turn (game 8: 15 refusals in 30 s).
    - The numbers on the wire (`net_message_debug.log` `DiplomacyDeal eActionType`): PROPOSED 4, ADJUSTED 3, REJECTED 2, INSPECT 7. Use the names.
37. **`BuildQueue.getPercentComplete` is 0–100** (the city banner's progress ring has `max: 100`). A building that only holds the overflow of the item before it (one turn of production or less) loses at most that when something moves ahead (`currentProgress`); game 8's settlers waited 19 turns behind such buildings.
38. **The base game sets no `NarrativeStory_Links.AIPriority`** (13 rows, in the Heian DLC only): a story's options are compared by their `NarrativeRewardIcons`. A discovery's `Name` often has no text; its `StoryTitle` has. Crisis stories have no icons at all: their rewards' modifiers (`NarrativeStory_Rewards` → `NarrativeRewards.ModifierID`) give the yields (`rewardIcons`).
39. **A game nobody wins ends at the final age's end with the score victory** (`VICTORY_SCORE`, research/24 §1).
    - **Score:** 1000 points for every turn in any victory countdown; 1000 minus 10 × the sum of our places in the victories switched on (ties share a place: everyone has 970 on the first turn of a game with three; the six majors' places add up to 3 × 21); 1 per major triumph. One countdown turn decides it: game 9 was lost to Alexander's single military countdown turn (M63–64, 850 → 1850) while everyone had 820–900.
    - **Seen in game 23** (research/30 §1): lost 923 to 933, first in science and military and last in the economy (1,430 GDP against 3,992). One economic place would have tied, two would have won, and so would one turn of our own military countdown.
    - **UI.log** in the final age, once a turn: `score: ours N (place P of M; best other …); places MILITARY 1, ECONOMIC 6 (+N for the next), …` (`scoreBoard` in data/xpl-victory.js: `getPointsForVictoryType(VICTORY_SCORE)`, as the victories screen's score tab reads it; `scorePlaces` in core/xpl-victory-focus.js).
    - **So in the final age** a rival's WATCH level already starts the strategy's overlay (military: settlers to the nearest safe site, `settleNear`), and so does our own countdown within reach (`victoryWatch` CHANCE: ours ≥ 85% of the multiple × the best other).
    - **The game ends at 100% of the final age:** nothing that cannot finish before it (`ageOutlook().turnsLeft` in the final age too): wonders and settlers, and since game 23 every item (gotcha 58).
40. **Shallow water hides a land unit from land melee units** (the user, game 9). Ships, aircraft, ranged and siege units still reach it. A hurt or resting soldier (or a scout) with hostile soldiers near goes onto coast when none of those is within 4 (`escape`, TO_WATER), and stays while they wait ashore (`stayAtSea`, WATER_WAIT), else withdraws into a centre or away.
41. **Go around danger widely; remember where units were hit** (game 10). The game's auto-explore walked a scout back to the warrior that had just hit it (hit twice on one tile); settlers retreated home and then stood stacked, two civilians that may not skip, holding the turn (gotcha 23).
    - A rise in a unit's damage marks that tile as danger for `HIT_TURNS` 5 (`noteHits`, `dangerNear`); the unit itself may still leave it.
    - Scouts: no game auto-explore when hurt 20+, with a hostile unit within 3, or with a hit or loss within 5 (danger within 5 of any kind left 1-2 scouts idle in half of game 11's passes); badly hurt (40+) they heal on our land or go home (SCOUT_HOME); a little hurt with nothing safe to explore, they rest.
    - Settlers detour toward their site (`findDetour`: 3+ from danger, one step back allowed; SETTLER_DETOUR) instead of going home; a site reachable only around danger is still picked (`via`).
    - A civilian that may not skip (stacked) steps aside, away from raiders (`stepAside(…, {away})`), in the wait and after a released order.
42. **An independent can be befriended only once its village is seen** (game 10). Until then its befriend project answers -3 (very likely `PROJECT_NO_VIABLE_TARGETS`). Game 10 saw «0 seen, 16 unseen» all Antiquity; the two independents that raided us could be befriended only on turns 56 and 69, and took two of our three settlements.
    - `villagesOf(pid, true)` lists unseen villages too: scouts go in sight of the nearest ones within 12 tiles of our settlements first (`scoutVillage`, SCOUT_VILLAGE, goal `{village}`, one scout each).
    - Ships are hit only by ranged units: a settlement shot by ships gets ranged defenders (`rangedWanted`, up to 2; `bestRangedOrder`, no siege units), trained and bought; with land raiders too, a melee one first (`defenderNeed`). Game 10 trained only warriors against galleys, quadriremes and archers.
43. **A unit the game stopped on its way is ready for orders, though it has moved** (game 12 T31). A queued move the game cannot finish leaves the unit awake with moves left and `hasMoved` true; the game's ready list wants orders for it, while `isIdle` (never moved) misses it. A commander walking to its post held the turn this way.
    - The skip step skips `readyForOrders` units (idle, or awake with moves left after part of a move), and follows the game's ready list, waiting `READY_WAIT_MS` 100 up to 5 times for each skip to be taken (the game takes it a moment later; before, one ready unit was skipped per pass).
    - A move order kept `STUCK_MOVE_TURNS` 2 turns on one tile (`Units.getQueuedOperationDestination`) is cancelled with `UNITCOMMAND_CANCEL` (`releaseStuckMoves`, MOVE_STUCK); settlers keep their own watchdog.
    - Turns still held by NOTIFICATION_COMMAND_UNITS log `the game waits for <unit> at x,y (activity, moved, moves, order to …); allowed: …` (`readyUnitReport`).
44. **Victory points come from fixed sources** (`victories.xml` `VictoryScorings`; research/26).
    - **Military:** 4 per settlement we own, +1 conquered, +1 in the Distant Lands, +2 with our ideology; Operation Ivy's triumph +25.
    - **Culture:** wonders 4 / 8 / 12 by age, celebrations 2 / 4 / 6, relics 3, artifacts 5, natural wonders 10, unique quarters 1 / 2 / 4, Resort towns 4.
    - **Seen in game 11:** our military score was 55 against the leader's 60. Five more settlements would have started our own military countdown (1000 score a turn), and the game was lost by one countdown turn. In game 12 we stood at 11 of 16 settlements from M30 with sites known.
    - **So the final age fills the settlement cap** (Commit `fillCap`: settlers trained and bought below the cap, nearest safe sites first).
    - **The military lever:** when the cap's room would start our countdown (`militaryOutlook`, judged at the next step's multiple; Operation Ivy counts when a city of ours may finish it in time), settlers come first. They become the first savings goal and move ahead in queues (`holdsFront` still guards raced wonders and science projects), and Ivy is queued if the settlements alone fall short.
    - **Past the cap** (research/30 §1): when the cap's room falls short, the lever founds up to `PAST_CAP_MAX` 2 settlements more while our Happiness a turn pays for them (each one over costs 5 in every settlement: `TRAIT_MOD_PENALTY_OVER_SETTLEMENT_CAP_SETTLEMENTS`; `pastCapRoom`). `militaryRoom()` gives `over`, `militaryOutlook({over})` gives `pastCap` (the cap's room first, then Operation Ivy, then past the cap), and the strategy carries `pastCap`; settlers are then trained (`unitsWanted`), bought (`settlerOffer({past})`) and founded (`waitAtCap(…, past)`) past the cap. Logged once as MILITARY_PAST_CAP, and in the military line as `room R, past the cap K`. Game 23: 2–4 settlements short from M41 to the end with room for 1–2; relaxed searches found 3–8 sites.
    - **Natural wonders** count in site scoring while the culture victory is on.
45. **Yield weights: one function, and the player's balance** (research/26 §3.2).
    - **Seen in game 14:** in Exploration we had twice the rivals' food and half their science; new citizens went to farm tiles 44 times and to specialists 8.
    - **Food and happiness gains follow the scarcity curve too** (`gainValue` / `gainMultiplier` in core/xpl-scarcity.js, used by the growth advice): a city with plenty values more food less.
    - **Every reader of the weights calls `profileFor(settings)`** (core/xpl-profiles.js), never `getProfile(settings.profile)`. It applies `settings.yieldBias`: «Баланс приоритетов» in the Autopilot tab, six sliders ×0–2 for food, production, gold, science, culture and happiness, on top of whichever profile is in use (the strategy's phase profiles too).
    - **One balance per victory focus** (`BIAS_SETS` SCIENCE / CULTURE / ECONOMIC / NONE). Each pass uses its focus's set (`biasFor`, `settings.biasFocus` set by the hud), and the sliders show and edit the current focus's.
    - **Science starts at Еда ×0.7, Наука ×1.5** (`BIAS_DEFAULTS`; the user's choice after game 16 had 383 science against game 19's 113 at Exploration T60). The other sets start at ×1.
    - **New inputs:** a new input of a plan goes into `inputSignature` (the balance is there).
    - **UI.log** prints `economy: T…` every 10 turns: yields, urban/rural/specialists, where this age's new citizens went, the balance, the rivals' science and culture, per settlement F/P/S/C.
46. **The plague hurts units, and our cities kept feeding it new ones** (game 18).
    - **The game's rule:** units that start their turn on an infected tile take 25 damage, for 6 turns (`PLOTEFFECT_PLAGUE`, `Damage` 25 in `GameInfo.PlotEffects`; fallout 50, fire 15). Tiles: `MapPlotEffects.getPlotEffects(plotIndex)` → `{effectType}`. The settlement: `city.isInfected` (the banner's status).
    - **Moving out:** a unit of ours on such a tile (`hazardAt`) is woken and moved this turn to the nearest safe tile it reaches (`leaveHazard`, LEFT_HAZARD). A healthy soldier with raiders within 3 holds its tile.
    - **Effects that hurt only on entry are ignored:** traps and dig sites (`TriggerOnEnter`).
    - **Keeping out:** no order sends a unit onto such a tile (`moveTo`), and settler sites there are HAZARD.
    - **Training:** no unit is trained in an infected city.
    - **Military units only where they are done within `MILITARY_MAX_TURNS` 10** (`unitTurns`). Seen in game 18: after a war declaration a Landship got 6 production a turn, 33 turns. Defenders come from the nearest such city within `DEFENDER_REACH` 12; none means the purchase step buys one.
47. **The victory focus outlives the age change, and the final age keeps it** (game 19).
    - **The problem:** the autopilot's state starts afresh each age, and at an age's first turn every new legacy path is at 0, so the leader's leaning (+0.15) alone chose the focus. Seen in game 19: Ada's culture leaning took Modern from science (26 Innovation) to culture (46 against the leader's 117); the game was lost to culture with 30 Innovation.
    - **Memory:** the focus is kept in the save (GameTutorial `_XPL_OBJ_FOCUS`, `savedFocus` / `saveFocus` in data/xpl-victory.js) and, since the save's properties do not outlive an age change (gotcha 57), in the settings' memory of this game; it is the `previous` of a new age.
    - **Leaning:** the leader's leaning picks a first focus but never makes a switch (`lean`, left out of the switch margin).
    - **The final age** keeps the focus unless our own countdown is within reach in another victory (its CHANCE in the victory watch, `chooseFocus(…, {chances})`).
48. **The building solver anneals** (research/27 §2).
    - **The problem:** a far tile takes a building only once a chain of urban tiles reaches it, and each link alone loses value. Greedy and local search therefore kept whole quarters around the Palace at +0 while +3/+4 tiles two rings out stayed empty. `tools/bench-optimality.mjs` measured our layouts 4.5% below the best layout of the same model on average, 16.5% at worst (time-aware Antiquity).
    - **The fix:** step 4 of `solveLayout`, in each settlement being solved:
      - `ANNEAL_STEPS_PER_ITEM` 120 random moves and swaps per planned building (max 2400 a settlement, `ANNEAL_MAX_TOTAL_STEPS` 40,000 a recalculation);
      - a worse layout is taken now and then while the temperature falls (2 → 0.01 weighted yields);
      - the best layout seen is kept (`restoreLayout`).

      Now 1.3% below on average, 4.5% at worst, ~130 ms a city instead of ~40.
    - **Deterministic:** seeded by the settlement id, so the same input gives the same layout. Settlements a recalculation keeps are not annealed, and tacked buildings (fixed items) never move. UI.log's `buildings timing:` shows `anneal N (+gain)`.
    - **Tried and dropped** (research/27 §8):
      - Moves drawn only from tiles a building could take: worse time-aware (1.67% against 1.36% on 30 maps).
      - A warm start from the previous layout: 9% worse time-aware, because it keeps the old build order and annealing never changes order.
      - Neighbour swaps in the build order: +1.1% Antiquity, +0.1% Exploration.
49. **Specialists are valued per tile, only where they pay** (game 1.4.0; research/27).
    - **The rule:** each specialist repeats 100% of all its tile's adjacency and costs 2/4/6 Food and Happiness by age. The limit per tile is the city's own (`city.Workers.getCityWorkerCap()`): 1 at first in Antiquity and Exploration, 3 in Modern.
    - **The model** (`specialistGain`, `specialistCost` in core/xpl-placement-model.js): a tile is worth `slots × max(0, its weighted adjacency − cost × its share of the age)` more.
      - `cost` = (Food + Happiness weights) × the age's upkeep + 2 yields of the rural tile the citizen would work instead.
      - `slots` = the setting «Специалисты на хороших клетках» (`buildings.specialists`: 0 / 0.5 default / 1) × the city's limit (the capital's for a planned site; towns 0).
      - The limits are in `inputSignature`, so a new limit is a full plan.
    - **Before:** a flat ×1.5 on every adjacency, so adjacency gathered on one tile was worth no more than the same spread over two. That multiplier (`adjMult`) is still shown with each building and used by callers without `specialists`.
50. **Only ageless quarters last** (research/27).
    - **The rule** (Civilopedia): at an age change every building that is not ageless loses its adjacency and stops making quarters. Warehouses, unique buildings and wonders are ageless. So the Palace's +1 Science +1 Culture per adjacent quarter lasts only from quarters of ageless buildings.
    - **The model:** `PlanState` option `nextAge` counts that share of the next age for the adjacency an ageless building keeps (`nextAgeValue`; `lastingView` keeps only ageless buildings, improvements and lasting quarters). The building job passes `NEXT_AGE_SHARE` 0.5, or 0 in the final age (`plans.nextAge`).
    - **The effect:** warehouses now take the tiles next to the Palace, as the video advises.
51. **Wonders have tiers** (research/27 §3.7).
    - **The problem:** the autopilot ranked the wonders it can win by, per turn:
      - their yields and the adjacency their tile gives;
      - 4 for the legacy path, 12 more for Innovation wonders under a science focus.

      Effects counted for nothing: Oxford's two technologies, attribute points, a settlement limit, +10% growth.
    - **The fix:** `core/xpl-wonder-tiers.js` grades all 71 wonders (base game and DLCs) S/A/B/C/D from their text: S 10, A 6, B 3, C 1, D 0 weighted yields, unknown ones C. `chooseWonders` adds it to the value.
    - **The Wonders tab** shows the tier, and the game's description when a row is opened.
52. **Wonder anchors: the plan keeps the tiles of the wonders we will build** (research/27 §7).
    - **Which wonders** (`wonderAnchors` in data/xpl-building-job.js; the wonder planner's answer of this turn, never asked twice in a turn):
      - our civilization's own wonder (`CivilizationFavoredWonders`) first;
      - the wonders the autopilot would start: race HIGH or MEDIUM, done 2 turns before the age ends, by value per turn, at most `MAX_ANCHORS` 2;
      - each in its fastest city, on the tiles the game allows there (`wonderPlots`).
      - Our own wonder while still locked goes in our best producing city, on the tiles its rules allow (`canPlaceWonder`).
    - **In the plan:** an anchor is one more planned item (`ANCHOR_VALUE` 10 wherever it stands, its completion turn the planner's).
      - It takes a whole tile and becomes a wonder district, so the buildings next to it get its +1.
      - Its tile rules: not urban; `Constructible_ValidBiomes`, terrain, river, lake, coast; `AdjacentDistrict` (an *existing* urban district or the centre). No contiguity is needed.
    - **Results:** `plans.anchors`, kept out of `placements` (never queued or bought by the plan), tacked with the plan.
    - **The wonder planner and the autopilot** put an anchored tile first (`anchor`, the Wonders tab's «клетка из плана застройки»).
    - **Simulated:** a wonder planned with the buildings left the plan 3.6% better than placed after them on its best tile, in 30 of 40 random cities.
53. **Lost wonder races: cash out, and a big building behind every wonder** (research/27 §6).
    - **The refund rule:** a lost wonder pours half its progress plus that turn's production into the next item, up to that item's cost.
      - Game 20, Petra: Mexico started it 2 turns after us at twice our production and won on the turn we were 14 short. Our 173 became 105 in a 90-cost Pagoda.
      - The Weiyang Palace's 162 became 97 in 40-cost walls.
    - **The guard** (`guardWonderRefund`): the item right behind a wonder in production can hold that refund. A bigger building is moved there (the queue's, else the plan's next for that city, else the costliest).
    - **Cash-out** (`cashOutLostWonders`, every pass after `chooseWonders`): a wonder in production that a rival building it now finishes first (omniscient: its queue), or that cannot be done before the age ends (`raceLost`).
      - The building that would keep the most of its progress is moved ahead of it. In game 21 the wonder kept its progress (gotcha 20), so what the cash-out saves is the production that would still go into a race we lose: Chicago built its Dungeon instead of 5 turns of a wonder that returned half. Log WONDER_CASHED_OUT; WONDER_ABSORBER_QUEUED when one must be queued first.
      - The wonder step never moves a lost race back to the front, and the refund guard leaves it alone (game 21: Chicago's Serpent Mound went back and forth, and both steps queued a Dungeon).
      - A tie is lost (`raceLost`: a rival's turns ≤ ours, as the race label says): a rival's production of a turn comes after our pass of that turn. Game 22 (research/29 §2): the Shwedagon Pagoda had 3 turns left in our capital and in Washington at our T37; America finished it at T39, we would have at T40. Nothing was cashed out, and a Knight moved ahead of the wonder took its 148 refund into a 105-cost unit.
      - The planner and the watch over our orders run every pass, before `chooseWonders`' early returns (expansion first, a war at our door), so the cash-out reads this pass's rows (game 22: the Pagoda's loss was logged 26 turns late).
      - A lost wonder with no progress leaves the queue (`RemoveAt`, WONDER_DROPPED).
      - Fair mode cannot see a rival's progress: there only the age's end counts.
54. **A city's queue is edited once a pass** (research/28 §2).
    - **The problem:** the queue a step reads does not show a move or a removal sent earlier in the same pass (nor the end-of-turn retry's a few seconds later), so a second edit's positions point at other items.
      - Game 21 T44: the wonder step moved the Mausoleum of Theodoric from 3 to the front; then the settler step moved "2" to the front, the settler in its own reading and the Library in the game's. The Library went ahead of the just-started wonder.
    - **The rule:** every MoveTo and RemoveAt goes through `moveInQueue` / `removeFromQueue` in `data/xpl-autopilot-steps.js`; within a pass each city's queue is edited once. Types queued in the pass are remembered (`builtThisPass`), so two steps do not queue the same building. The hud opens and closes the pass (`beginQueuePass`, `endQueuePass`); without an open pass (tests) nothing is held back.
    - **Appends are safe:** a BUILD adds at the end, so the positions of the items already there stay right.
55. **Wonders go straight to the front, and every order is watched** (research/28 §1).
    - **Seen in game 21:** the Emile Bell left Carthage's queue unbuilt three times (T32–T35) while it waited behind other items, and the Mausoleum of Theodoric once (T46). Each had nothing in it, so the game's notice said 0 production returned. We sent no removal (`net_message_debug.log`); why the game dropped them is not known yet. Every wonder that went straight to the front was built.
    - **The rule** (`wonderSlot`): a wonder waiting in a queue goes to position 0, ahead of a building with progress (under either rule of gotcha 20 nothing is lost: each item keeps its own, or the wonder absorbs the building's). Behind a wonder in production, behind an item done this turn, behind repairs, wanted units and projects.
    - **Orders** (`wonderOrders`): an order of this turn counts as started until the game's queue shows it. Game 21: the end-of-turn retry, three seconds after the order, did not see it and ordered the Emile Bell again.
    - **Tiles:** the game may refuse the planner's tile by then: the next tiles are tried (`orderWonder`), and UI.log says when none is taken (`wonders: … could not order`). Before, nothing was said; the Mausoleum was never ordered again.
    - **UI.log** (the evidence the next game needs): `wonders: X left <city>'s queue unbuilt (ordered T…, last seen T…); queue now […]; that tile now: <the game's answer>; game notices: …`, and `game notice: NOTIFICATION_PRODUCTION_INVALIDATED | NOTIFICATION_WONDER_FAILED: <text>`.
56. **Settlers: the cap within a pass, and settlers that come in pairs** (research/28 §4).
    - **The cap:** the game's settlement count does not change until it handles a founding, so every settler of a pass read the same number. Game 21 (E23): the cap rose from 8 to 9 and the three settlers waiting at the cap all founded, 11 of 9 (−5 Happiness in every settlement for each one over; Happiness 151 → 76 a turn). One of them, Фустат, was taken at E35. Foundings ordered this turn count until the game shows the settlement (`pendingFoundings` in `data/xpl-autopilot-units.js`).
    - **Pairs:** Carthage's `MOD_CIV_DOUBLE_COLONISTS` (`EFFECT_PLAYER_ADJUST_UNIT_EXTRA_COPY`, `UNIT_CLASS_CREATE_TOWN`, `PurchaseValid`) gives two settlers for one trained or bought. Training and buying count a queued settler as `settlerCopies()` (our traits' extra copies plus one; `traitEffects` in `data/xpl-autopilot-choices.js`). Game 21: two settlers wanted at the end of Antiquity gave four, and with the new age's two free ones six walked toward two places.
    - **City limit:** Carthage's `MOD_FORBID_CITIES_FROM_TOWNS` (`EFFECT_ADJUST_CITY_LIMIT` 1) keeps every other settlement a town: no conversion is possible (the game's own Convert button is hidden at `numCities >= getCityLimit()`), so the gold line's `cheapest conversion -` all Antiquity. Not about happiness: the town advisor compares a city's and a town's yields; Happiness is only a gate (no conversion in unrest or below 0).
57. **The save's GameTutorial properties do not outlive an age change** (research/29 §4; research/01's open question).
    - **Seen in game 22:** at Exploration's and Modern's first turn our tack registry was empty (`placed 7, kept 0` after 8 tacks at Antiquity's end, and no `registry: dropped` line) and the age's samples were gone (the estimate said 118 turns again: research/24 F3's fix did nothing). The victory focus kept in the save (gotcha 47) was gone too; nobody noticed because the focus stayed Science.
    - **What must outlive an age change** goes into the settings' memory of this game: `settings.remember(gameKey(), {name: value})` / `settings.recall(gameKey(), name)` (services/xpl-settings.js; inside our one localStorage key, gotcha 15). `gameKey()` = the game's seed (`Configuration.getGame().gameSeed`) and our leader, which an age change keeps; another game's values are dropped. Plain values only, at most 20; the settings' listeners are not told.
    - **In it now:** the victory focus (`saveFocus`) and the age's length (`ageOutlook`: the turn plus the turns left, once a turn; the next age's first turns use it). UI.log says `victory focus: X remembered from the last age (…)` the first time the memory answers.
    - DMT keeps its tacks in GameTutorial too, so they very likely start afresh each age (not checked).
    - **Verified in game 23** (research/30 §5): the memory answered at E1 and M1 (`victory focus: SCIENCE remembered …`, and the first turn's estimate was ~70 turns), its key `1716931462|636955296` unchanged through three ages. GameCore.log's `Random Seeds: Game` line changes at the first age change, but that is another number.
58. **Production in progress is lost at an age change, and at the game's end: an age's last turns start only what is done in time** (research/29 §3; research/30 §3–4).
    - **Seen in game 22:** 732 production was in unfinished items when Exploration ended: Universities at 287 of 313 (two lancers had gone ahead of it), 258 of 266 and 109 of 313, and a settler at 77 of 115 queued 7 turns before the end. Another 100 when Antiquity ended.
    - **Seen in game 23:** Exploration's end lost 540, most of it in items that could not have finished anyway (У Каев built four cheap buildings instead of feeding a University it could not finish). The game's end lost 3,212: six Launch Pads (one 40 short), a Laboratory and a Tank; an Airfield finished with no time left for its projects.
    - **The rule** (`ageEndTurns()` in data/xpl-autopilot-steps.js: a non-final age's last `AGE_END_TURNS` 12; the final age all through, since the game ends with it): an item is done in time when its turns (`itemTurns`: its cost less its own progress, over the city's production) plus any wait fit the turns left less `AGE_END_MARGIN` 1.
    - **Where:**
      - `ageEndOrder` (the production step, after `fillProduction`): an item in production that is not done in time gives way to the queued item that is and costs the most (AGE_END_FIRST). If none is, the plan's costliest building that is done in time is queued (else the costliest the city can place), to go first next pass (AGE_END_QUEUED). Wonders, projects and repairs in production stay.
      - Units are neither trained (`trainWantedUnits`, `trainDefenders`: the purchase step may buy one) nor moved ahead (`frontLoadUnits`) where they would not be done in time.
      - Empty queues take only what is done in time: from the plan, from the advisor (`advisorOrder({fits})`) and the cheapest building (`lastResort` still fills a queue). The path's buildings too (`leverSoon`).
    - **The final age** says it in its own words (GAME_END_FIRST / GAME_END_QUEUED). Its science sites only where the site and its project are done before the end (`siteFitsAge`, the site's `projects` else `needs`: Launch Satellite after a Launch Pad, Trans-Oceanic Flight after the Airfield): placed (`pushVictoryWork`), bought (`victoryPurchases`, `bought: true`) and held as a goal (`siteGoals`); one already queued that no longer fits is not pushed ahead. Crewed Space Flight Preparation only where a run is done in time.
    - **Bought on a non-final age's last turn** (`buyAgeEndItems`, AGE_END_BOUGHT, the pass's first purchase): a building in production at least `AGE_END_BUY_SHARE` 50% done that will not be done before the age ends, the most production kept first, from the free gold. The game prices an item in progress by what it lacks (about 4 gold a production: game 23's Port at 397 of 451 cost 216); the purchase goes to the tile `canStart(PURCHASE).Plots[0]` names when `InProgress`, as the game's production list does it. The last turn is the one whose age points are full (0 turns left); the turn before, an item one turn short still finishes. Game 23: the capital's Bazaar ended Exploration 19 short (about 77 gold, with 822 in the treasury).
    - **Not covered:** an urgent defender that is done in time still goes ahead of a building with progress, which may then miss the age's end (Рисила's lancers and University).

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
- **Git:** `master`, local only (no remote); tag `v1.0.0` is the first release. Commit or push only when the user asks.
