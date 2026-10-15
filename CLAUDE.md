# Civ VII mods — Expansion Planner

A Civilization VII **UI mod** (mod id `expansion-planner`, in `mod/expansion-planner/`) plus Node tests and dev tools. It is a planner panel opened from a top-left toolbar button (or F8). It has six tabs:
- **Settlements:** sites for future cities or feeder towns.
- **Buildings:** an adjacency layout per settlement, or for all settlements at once, placed as Detailed Map Tacks. One-click actions: queue a city's next planned buildings, buy the best-value ones with gold, upkeep warnings.
- **Towns:** convert a town to a city or keep it, and which Town Focus to pick (with a «Выбрать» button that sets it).
- **Wonders:** where to build each wonder, and the race against rivals.
- **Empire:** every settlement on one page (city strengths, town Focus, food sent/received, plan left), plus the «Сеть еды» food-network map lens.
- **Autopilot:** for stepping away (online turn timers): each turn it chooses research and civics (game advisor), makes the choices that hold the turn (policies valued by Policy Yield Previews when installed, celebrations, story events, pantheon, government, city-state bonuses), fills empty production queues (a wonder it can win, the plan, else the advisor), places new citizens, sets town Focus, buys planned buildings above a gold reserve (one budget a pass; gold saved for a town conversion or the victory path's next building before small purchases; a gold line in the tab and UI.log), recalculates the plan, optionally skips idle units and ends the turn (not while a choice holds it). Units move only with their own opt-in options: scouts explore (2 trained first), settlers are trained and found on the Settlements tab's sites (searched by itself; cities and towns 1 to 1 as a floor, then towns converted by their yields), idle military shoots or fortifies or explores (one garrison per city stays; hurt units escape onto shallow water from land melee raiders), merchants take the best trade route. Also befriends independents, spends leader attribute points, promotes commanders (Bastion first, commendations spent; with «Оборона» they stand in the most threatened or unhappiest settlement and lead Focus Fire / Coordinated Attack on raiders), places the plan's map tacks, puts archived great works on display, assigns resources, and (opt-in) explorers dig artifacts, a victory focus steers toward the closest legacy path, by phases (Growth, Build-up, Final push: «Стратегия по фазам») (with its triumphs; research, buildings, growth, merchants and resources serve the science or economic path of each age; the government suits the focus; the Autopilot tab shows each victory's points and countdown and which victories are off), melee soldiers strike raiders when the game's own attack preview says it pays, defence against independents (no site near their villages, befriending one at a time, melee defenders bought where raiders are, empty villages dispersed, Fort Town walls), and diplomacy (counter-spy, reconciliation, initiatives). Off at every load, and switched off when anyone wins or we are defeated. Plus an experimental single-player «ИИ играет N ходов» (the game's own Autoplay).

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
20. **Never move a queue item ahead of one in production with progress.**
    - **What the game does:** it gives the preempted item's progress to whatever takes its place, drops what exceeds that item's cost, and the preempted item starts over.
    - **Seen in game** (`CityBuildQueue.csv`): the victory focus moved a Market to the front while the Pyramids were at 136 of 137. The Market got 155 production for a 49 cost, and the Pyramids started over (a Lighthouse did the same later). Units moved ahead of a wonder (settler, slinger) did not take its progress; the wonder resumed. The rule covers every move anyway.
    - **The rule:** every `MoveTo` goes to `frontSlot(city)` in `data/xpl-autopilot-steps.js`. That is position 1 when `BuildQueue.getPercentComplete(currentProductionTypeHash) > 0`, else 0.
    - **Units are the exception** (`unitSlot`): they go ahead of a wonder or a project in production. Units never take an item's progress, ahead of a wonder or a building (game 9, research/24 §5). Projects are inferred to behave the same; check `CityBuildQueue.csv`.
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
    - **Score:** 1000 points for every turn in any victory countdown, 10 per victory place, 1 per triumph. One countdown turn decides it: game 9 was lost to Alexander's single military countdown turn (M63–64, 850 → 1850) while everyone had 820–900.
    - **So in the final age** a rival's WATCH level already starts the strategy's overlay (military: settlers to the nearest safe site, `settleNear`), and so does our own countdown within reach (`victoryWatch` CHANCE: ours ≥ 85% of the multiple × the best other).
    - **The game ends at 100% of the final age:** no wonder or settler that cannot finish before it (`ageOutlook().turnsLeft` in the final age too).
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
    - **Memory:** the focus is kept in the save (GameTutorial `_XPL_OBJ_FOCUS`, `savedFocus` / `saveFocus` in data/xpl-victory.js) and is the `previous` of a new age.
    - **Leaning:** the leader's leaning picks a first focus but never makes a switch (`lean`, left out of the switch margin).
    - **The final age** keeps the focus unless our own countdown is within reach in another victory (its CHANCE in the victory watch, `chooseFocus(…, {chances})`).

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
