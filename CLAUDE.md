# Civ VII mods — Expansion Planner

A Civilization VII **UI mod** (mod id `expansion-planner`, in `mod/expansion-planner/`) plus Node tests and dev tools. It is a planner panel opened from a top-left toolbar button (or F8); F7 («Следующий шаг») runs one autopilot pass that never ends the turn. It has six tabs:
- **Settlements:** sites for future cities or feeder towns.
- **Buildings:** an adjacency layout per settlement, or for all settlements at once, placed as Detailed Map Tacks.
  - Whole layouts are searched, connector buildings toward far good tiles included (gotcha 48).
  - Specialists are valued where a tile's adjacency pays for them (gotcha 49), and ageless quarters for the next age too (gotcha 50).
  - The tiles of the wonders we will build are kept, with quarters around them (gotcha 52).
  - One-click actions: queue a city's next planned buildings, buy the best-value ones with gold, upkeep warnings.
- **Towns:** convert a town to a city or keep it, and which Town Focus to pick (with a «Выбрать» button that sets it).
- **Wonders:** where to build each wonder, its tier (what its effect is worth), and the race against rivals.
- **Empire:** every settlement on one page (city strengths, town Focus, food sent/received, plan left), plus the «Сеть еды» food-network map lens.
- **Autopilot:** for stepping away (online turn timers): each turn it chooses research and civics (game advisor), makes the choices that hold the turn (policies valued by Policy Yield Previews when installed, celebrations, story events, pantheon, government, city-state bonuses), fills empty production queues (a wonder it can win, by tier and value per turn, on the plan's tile; else the plan, warehouses too; else the advisor; whatever it orders goes on the plan's tile; a chosen wonder goes straight to the front; a wonder race it will lose gets a building ahead of it, a big building stands behind every wonder, a wonder is ordered only where the items ahead of it leave it time, and a queue of units and walls gets the plan's next building: gotcha 89; in an age's last turns (the final age: all of it, while the score victory ends the game there) only what is done before the age ends, and a nearly done building is bought on a non-final age's last turn), places new citizens (counting what a city loses below zero Happiness, a new citizen's own yields too), sets town Focus, values policies and buildings by what their Happiness does to each settlement's yields, buys planned buildings above a gold reserve (one budget a pass; gold saved for a town conversion or the victory path's next building before small purchases; no building bought in a city while a wonder waits in its queue; all the gold only under a real attack, pillaged improvements from the free gold while no hostile stands by them, and a non-final age's last-turn conversion takes the reserve too: gotcha 89; a gold line in the tab and UI.log), recalculates the plan, optionally skips idle units and ends the turn (not while a choice holds it). Units move only with their own opt-in options: scouts explore (the second after the first settler; they keep their goals, and danger is only what we see or saw in the last 2 turns: gotcha 87), settlers are trained and found on the Settlements tab's sites (searched by itself; cities and towns 1 to 1 as a floor, then towns converted by their yields; a free soldier escorts one past an independent's raider: gotcha 87), idle military shoots or fortifies or explores (one garrison per city stays; hurt units escape onto shallow water from land melee raiders and step to the tile the fewest raiders reach; units leave the plague by ways of up to 3 turns, never resting on it (gotcha 87); a land unit stands in a ship's reach only when it out-guns it: gotcha 78), merchants take the best trade route. Also befriends independents (only villages the game says we have found, never into a race it loses; one Influence reserve for all diplomacy: gotcha 90), spends leader attribute points, keeps two generals (a vanguard and a bastion by what they took, each with its own promotions and commendations; a second one bought, trained or saved for, by the game speed's turns; Leadership's promotions toward a commendation; independents' 1-XP fights left to the lowest-level general: gotcha 88; with «Оборона» they stand at the worst fight they reach within 6 turns, shared when none is free, escape first when in danger, the vanguard waits where raids came in peace, units in a general's radius strike first, and they lead Focus Fire / Coordinated Attack on raiders: gotcha 79; the vanguard keeps up to 3 soldiers packed while raids or a war call for it, force-marches them to an urgent fight and overruns weaker raiders: gotcha 83; free promotions decide no role, one general to a fight only ships make, and packed soldiers upgrade with their army: gotcha 84; a hostile village next to our land is skirmished from our settlement, Archers next to it and a general on its centre, which it keeps while the district holds: gotcha 85), places the plan's map tacks, puts archived great works on display, assigns resources, and (opt-in) explorers dig artifacts, a victory focus steers toward the closest victory (re-decided from the victories' own points in each age's first turns), by phases (Growth, Build-up, Final push: «Стратегия по фазам») (with its triumphs; research, buildings, growth, merchants and resources serve the science or economic path of each age; the government suits the focus; the Autopilot tab shows each victory's points and countdown and which victories are off; the final age's score race goes to UI.log, and settlers go past the settlement cap when that starts our military countdown, and settle wherever the game allows when a rival's must be blocked; space work runs in parallel and in one order per city, production buildings first, then the Launch Pad and Crewed Space Flight Preparation (near the goal a one-off first when it wins sooner), and the Airfield and a Radio Station only where no Launch Pad is, as soon as they are unlocked; the race counts the Innovation research brings, Launch Pads are banked for before Rocketry and bought at it (under way too), and Exploration's last turns bank gold for Modern; a rival's science countdown is the game's end), ranged soldiers shoot raiders (from their post too) and melee soldiers strike them when the game's own attack preview says it pays, defence against independents (no site near their villages, befriending one at a time, melee defenders bought where raiders are, a holder kept in each settlement near a village at war with us, empty villages dispersed, walls first in a threatened city's queue, Fort Town walls), the army sent where the danger is greatest (guards on their way count only when in time, sleeping reserves woken, ranged units too, a guard at each war front before the war (up to 3 against an army there), a packed army unpacks at a threatened settlement and a far soldier reinforces the army of our commander there, the guards there take better posts (a melee unit on the centre, screens facing each approach, ranged units in range, the commander covering the most of them), aircraft strike raiders, a raider about to take a damaged centre first, fighters rebase to cover the settlements enemy aircraft hit lately or reach (a Launch Pad city first) and one ground attacker is trained at a lasting front, warships attack the game's way, guard the coasts ships raid and are trained on the same water, the age's first melee unit, which every settlement centre's defence follows, trained, upgraded or bought; with «Наступление», off by default, a settlement of ours an enemy took in a war it started is retaken with the soldiers defence leaves free, and peace waits only while that assault makes progress; the villages we will not befriend, and with «Охота на рейдеров» the raiders roaming near our land, are hunted for the generals' experience (both on by default; raiders: gotcha 83), and with «Учебная война», off by default, a weak neighbour gets a formal training war once an age: gotcha 80; generals stand under soldiers, free soldiers man the fronts and sortie, generals march packed armies, air bases fill with fighters and bombers, and with «Ядерное оружие», off by default, nuclear weapons strike enemy armies: gotcha 81; generals wait at the fight they stand at and at the war fronts, hunts wait for their general, hurt soldiers swap out, Squadron Commanders and carriers cover where no Airfield does, Fleet Commanders lead the warships, no settlement on a war front without guards, a warship bought where ships shell a settlement no land unit can answer, the free gold (not the savings goal's) kept for a defender while a war risk lasts, no science focus with one city, and with «Ядерные удары по городам», off by default, an enemy city near us may be struck: gotcha 82), and diplomacy (counter-spy, reconciliation, initiatives; a peace asks our lost settlements back first). Off at every load (it switches itself on again in a new age's first turn, after the dedications, when it was on at the last age's end or was switched on before them; while the dedications wait a pass only converts the towns that are cheapest then, whatever the victory focus, never last age's cities, which the card brings back: gotchas 86, 89), and switched off when anyone wins or we are defeated; after the win (our science countdown with its goal reached, or a game played on after a victory) nothing chases a victory any more: balanced play, every other technology and civic before Future Tech, victory projects out of the queues, every remaining building on its best tile, three wonders at a time, idle gold for conversions and buildings, and the satellite that reveals the map. An item the game leaves at 100% gives way to the next and leaves the queue after 3 turns, and the plan orders only on the tiles the game offers (gotcha 77). Towns are converted by production per gold, the chosen town kept as the savings goal; a settlement a revolt may take buys a Happiness building. It also researches the slots, caps and specialist caps the game's advisor never names, and the civics whose policy cards beat the weakest ones slotted (gotcha 76), researches the pantheon's civic while one is left, picks the pantheon and beliefs by value (Altars carry it; great-work slots count the works waiting) and spreads our religion to our own settlements with Missionaries from a district (gotcha 90), trains and uses our civilization's great people and unique improvements, uses the endeavors the game offers (Lafayette's Reform), steals research and levies or incorporates city-states, and buys settlers toward the Homeland triumph (research/40; gotcha 73). One order per tile (a wonder never shares its tile with another order of ours), and under a military countdown settlers take dangerous or far sites (gotcha 74). Plus an experimental single-player «ИИ играет N ходов» (the game's own Autoplay). The tab: a top bar (status, what holds the turn, «Следующий шаг (F7)», «Включить») over the settings, in seven groups with master checkboxes built from one option spec (an option whose needs are off is dimmed and acts as off), and a log of 300 entries by turn, filtered (gotcha 86).

There are also tack pills in the city production menu and growth hints (map marks while the game asks where a new citizen goes). The user plays in **ru_RU**: every string ships in English and Russian.

More detail: `mod/CLAUDE.md` (architecture, engine API) and `tests/CLAUDE.md` (fakes, fixtures). Background:
- `PLAN.md`: the original design. Its §14 holds the user's binding decisions.
- `research/`: scout reports on the game's UI and DMT.
- `TESTING.md`: the in-game checklist. Add a row for every user-visible change.

## Second mod: Memento Advisor (`mod/memento-advisor/`, id `memento-advisor`)
Numbers 1–6 on the memento selection screen: the best mementos for the chosen leader + civilization in the age the mementos are chosen for (the game allows any civilization in any age: gotcha 90). A row switches between Auto (the pair's own victory), Balanced and each victory; the choice is kept in `localStorage.modSettings["memento-advisor"]`.
- **Where it runs:** the front end (new game: host `create-game-sp`) and in game (age transitions: host `age-transition-bootstrap`).
- **The hook:** `Controls.decorate` on the host plus a scoped MutationObserver, because the memento screen is a SolidJS component. Each card's memento comes from its icon (`url('blp:<icon>')`). It works with Mattifus's Memento Editor, which the user has.
- **Research:** `research/15-memento-screen.md` (screen, hook, pitfalls) and `research/16-memento-scoring.md` (scoring method, spot checks).
- **Data:** the scores are precomputed per leader + civilization + age (TABLE_VERSION 2, keys `<LEADER>|<CIV>@<AGE_TYPE>`, then `<LEADER>|*@<AGE>`, then `*|*@<AGE>`): `python -I tools/memento-advisor/build_table.py` → `mod/memento-advisor/data/mma-table.js`. The reference dump goes to `tools/memento-advisor/out/`, not the mod.
- **Code:** `ui/mma-ranking.js` is pure; `ui/mma-context.js` is the engine adapter (`ageReaders`: the setup's start age in the front end; in game the successor of Game.age, the 'Age' parameter's next by sortIndex as the fallback; UI.log `[MMA] advice for <L> + <C> in <AGE> (…)` each time the tab opens); `ui/mma-decorator.js` holds the badges and the row.
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
| The fight simulator: the autopilot's unit steps against game 58's village, game 60's raids, or a game's own turns replayed (gotchas 85, 86, 88) | `node tools/fight-sim.mjs [turns] [seeds] [log] [raids60] [fog] [sight=N] [scene=<file.json>] [age=antiquity]` |
| Our units and the hostile ones near us by id, turn by turn, with the fights and the villages' births; a replay scene of those turns (gotcha 86) | `node tools/unitmap.mjs <Logs folder> [from=60] [to=75] [session=N] [scene=<out.json>] [unseen=35,36]` (needs the game's AI logging, `AIMasterLogging` 1) |
| Keep the game's logs (it overwrites them at every launch) | `powershell -NoProfile -File tools/archive-logs.ps1 [-Keep 12]`; the scheduled task «Civ7 log archive» runs it every 15 minutes (`Unregister-ScheduledTask -TaskName "Civ7 log archive"` removes it) |
| Follow the game's UI log | `powershell -File tools/tail-ui-log.ps1` |

Run all four checks before handing anything to the user: tests, imports, syntax, and XML (the last is covered by check-syntax).

## Game loop (how changes reach the game)
- **Live link:** the mod folder is junctioned into `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\expansion-planner` (`tools/deploy-junction.ps1`). Edits are live on disk.
- **Live reload:** `AppOptions.txt` has `UIFileWatcher 1`, so **JS** edits reload live. New/renamed files, `.modinfo` changes and **text (LOC) changes need a full game restart.** Tell the user which one applies.
  - **A live reload switches the autopilot off** (it is runtime state): after editing JS while the user plays, tell them to press «Включить» (and «Следующий шаг (F7)» if a turn is held).
  - **Develop between turns:** a reload in the middle of a turn's start reboots the autopilot's pass (seen in game 6: the advisor pop-up's TRIGGER_ADVISOR_SELECTED was sent 508 times while files were saved during turn starts).
  - **Prove tests on a copy:** reverting a fix to watch its test fail edits files the running game reloads (and once a write was refused while the game held the file). Copy `mod/`, `tests/` and `package.json` to a scratch folder and revert there.
- **Logs:** in `%LOCALAPPDATA%\...\Logs\`.
  - `UI.log`: our lines start with `[XPL]` and the turn (`[XPL] A67 …`, the level after it: `[XPL] A67 WARN …`; gotcha 86). Also grep for `JS Error`.
  - `Modding.log`: "Target in-game actions" is the truth about which mods loaded. The Add-Ons screen (Slothoth's Modpage Manager, profiles) is not.
  - `net_message_debug.log`: every request sent to the game, with timestamps (`PlayerOperation`, `UnitOperation`, `CityOperation`, `CityCommand`, `PlayerTurnComplete`; `bFromUser: 0` = sent by script). The truth about what the autopilot actually sent and what the player clicked (e.g. `TRIGGER_ADVISOR_SELECTED`).
  - Other game logs worth reading (research/13 lists what each showed): `DiplomacySummary.csv` (wars declared on us, suzerains, peace), `Player_Stats.csv` (cities, towns, settlement cap and over-cap, techs, yields per turn), `Player_Treasury.csv` (gold balance), `Player_Legacies.csv` (triumphs), `GameCore.log` (`Team 0 has won … 'VICTORY_…' victory!`).
  - `CityBuildQueue.csv`: every city's production each turn, all players (`Game Turn, Player, City, Production Added, Current Item, Current Production, Production Needed, Overflow`). The truth about wonder races and lost production (a jump in "Production Added" means another item's progress was poured in).
  - **Keep them:** the game overwrites its Logs folder at every launch (the evening game of 23 October, America to Modern T88, kept only its saves). The scheduled task «Civ7 log archive» runs `tools/archive-logs.ps1` every 15 minutes: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\LogArchive\<session start>.zip` (UI.log's first time stamp), an unchanged session skipped, the 12 newest kept. One launch's folder holds every age and every save loaded in it: the CSVs start again at turn 1 and unit ids are given out again (tools/unitmap.mjs reads one `session=`).
- **Reading log evidence:** the user sends screenshots. Read the logs yourself before guessing. Plan logs report e.g. `N placed, M unplaced {reason counts}`, `N uniques`, `our adjacency differed from the game's on a/b pairs`. `units:`, `places:` and `fight:` lines, with `node tools/unitmap.mjs` on the game's AI logs, rebuild a fight turn by turn (gotcha 86).
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
    - **The game's tiles are today's:** `canStart` lists only tiles touching the urban area now. Its no for an owned tile beyond it is not final: our rules decide there, and the plan's connector opens it (`touchesBuiltUrban` in `canPlace`; research/33 §9).
    - **The plan is built in its own order:** a tile the plan makes urban must touch the urban area standing by the turn its first building is done (`isConnected` is timed, `urbanTime`). Moves and swaps keep a building's completion turn, and 25 of 30 random layouts had a building before its connector (research/33 §8).
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
    - **The syncretism choice holds the turn** (NOTIFICATION_CHOOSE_SYNCRETISM; game 26, research/31 §5). `chooseSyncretism` (data/xpl-autopilot-choices.js) answers it while the notice waits, once a turn (`canStart` refuses a second choice). Not gated on `Identity.getSyncreticCivType()`: game 41 held the turn twice (Exploration and Modern, the Test of Time Syncretism civic) because any value it returned counted as chosen; the game's own screen counts a choice only when that type is a civilization (syncretism-screen-model.js `getSyncretizedInfo`). UI.log `syncretism: nothing sent; …` says what was refused.
      - **The pick:** our own civilization when that brings a culture slot; else the infrastructure with a unique quarter, then the one with the most buildings; units last.
      - **The offer:** `Game.Unlocks.getSyncreticCivUnlocksForChoice(pid, SyncreticChoiceTypes.X)`, with `getSelfChoiceSyncreticUnlocks` / `getInfrastructureChoiceSyncreticUnlocks(civType)` for what each brings.
      - **Sent** as the screen's confirm sends it: `PlayerOperations CHOOSE_SYNCRETISM_SELF | _INFRASTRUCTURE | _UNITS {CivilizationType}` after `canStart`. Logged as SYNCRETISM.
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
    - Detailed Map Tacks logs ~100 "lookup requires key to be of type 'number' or 'string'" lines per tack whenever it refreshes tacks (each turn, each placement): 180 autopilot tacks made UI.log grow by ~200 MB in 60 turns. The autopilot therefore tacks only each settlement's next 3 buildings (`placePlanTacks(..., {perSettlement: 3})`). Unattended, the plan's tacks are renewed at most every 5 turns (gotcha 86). Both the lookup warnings and our `[XPL]` lines show the same blank `:NN:23` location (a shared console wrapper), so that location does not identify the source.
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
      - **A defender for settlements that hold on their own** goes where other units go past a wonder or a project in production: behind it in Build-up and the final push, behind a raced one in Growth (`holdsOut` in `frontLoadUnits`: every threatened settlement that city defends has its centre unhit and a melee guard of ours there, and no war is at our door). Game 36: three Warriors for Манчестер (a walled town, its centre never hit, guarded all along) went ahead of Лондон's Colossus T23-T28 (16 production a turn); at T29 the race was a tie with Spain's and was cashed out. Ahead of a building with progress a defender still goes (research/23 D4).
    - **A Launch Pad goes ahead of a plain building with progress too** (`padSlot`, research/38 B2), and **a Preparation run within `PREP_HOLD_TURNS` 3 of done keeps the front** from units and walls unless the centre is damaged or a war is at our door (`prepNearlyDone`, E2): gotcha 65.
    - **A science project goes ahead of a plain building with progress** (`projectSlot`; one-offs and Crewed Space Flight Preparation alike): nothing is lost either way (it takes the progress, or the building keeps it). Never ahead of a science site (Launch Pad, Airfield) in production. Game 11 showed why: Лянчжоу's Launch Pad overflow went into a Cannery the plan had queued behind it, and the Preparation waited 9 turns behind the Cannery.
    - **A threatened settlement's walls go first** (the user, after game 27; `wallsSlot`, `wallsFirst` in the walls step).
      - **Seen in game 27:** Ханькоу's Defensive Fortifications waited 10 turns behind a Laboratory with progress, and were done the turn its centre fell.
      - **The rule:** they go to the very front, ahead of an item with progress. They stay behind an item done this turn, repairs and a unit at the front. A science project that would then miss the age keeps the front unless the centre is damaged or a war is at our door (`holdsFront`, counting the walls' own turns). A war at our door, an unwalled centre that is damaged, or a centre below `WALLS_URGENT_SHARE` 0.5 of its health still sends them to the very front, ahead of a raced wonder too. Only walls at an already walled centre, or for another district, stay behind a raced wonder that `holdsFront` protects (and never pass a wonder in production) while the centre is at or above half its health and no war is at our door (gotcha 89; game 60: a 19-of-200 scratch on the capital's walled centre lost the Ha'amonga a Maui by one turn).
      - **Walls at the front keep it:** `toFront` never passes them, and of the units only defenders under threat go ahead of walls in production (`frontLoadUnits`).
      - **UI.log:** `queue: <city>: <walls> moved ahead of <item> with N production in it`, a probe of this gotcha's rule (`CityBuildQueue.csv` shows whether the item keeps its progress).
    - **An item the game does not complete gives way** (game 33; gotcha 55): one at 100% since an earlier turn has the next item moved ahead of it (`unstickQueues`, the production step's first edit; QUEUE_UNSTUCK), or, alone, a building queued for that (QUEUE_UNSTUCK_QUEUED); a stuck wonder gets the building that keeps the most of it (gotcha 74); never its own type nor an item on its tile, and one stuck 3 turns leaves the queue (gotcha 77). Moves may go ahead of it (`frontSlot` 0), and `toFront` neither brings it back to the front nor keeps a move behind it.
    - **No unit passes an item done this turn** (a stuck item at 100% does not keep a defender back either), except a defender of a centre below the share; a queued repair does not move while a wonder is in production (gotcha 89).
    - **A lost wonder pours half its progress plus that turn's production into the next item**, its overflow capped (game 9: the Red Fort's 300 into a 15-cost Scout). A building, not a unit, stands right behind a wonder in production (`guardWonderRefund`).
    - **New units:** wanted units go to the city whose queue is free soonest.
21. **Victory data spans every age.**
    - `GameInfo.LegacyPaths` lists all ages' paths (Antiquity's first). Keep the current age's (`Age`) and, per class, the path with a goal. Before this the victory focus found no path after every age change.
    - `getEnabledLegacyPaths()` may still name the setup age's paths: match by `legacyPathClass` too.
    - `GameInfo.Victories` has `VictoryClassType` (`VICTORY_CLASS_*`), not `LegacyPathClassType`.
22. **The game's production advisor has no limits.** It recommends wonders (with no race check: a wonder lost on its first turn, one temple queued in two cities) and units in every empty queue (32 scouts in one game). Wonders come only from `chooseWonders`; the advisor's units are capped (`unitWanted`); settlers never from it.
23. **One unit of each formation per tile.** A military unit plus one of each other `GameInfo.Units.FormationClass` (a settler and a scout are both civilian). When stacked, the game allows only MOVE_TO / WAIT_FOR, and NOTIFICATION_COMMAND_UNITS holds the turn: any unit without an order steps aside (`stepAside`, `roomFor`).
24. **Policy Yield Previews values only plain yields.** Production toward projects or buildings, lump grants (`EFFECT_PLAYER_GRANT_YIELD`: Elective Republic's +1000 Science celebration, the governments' gold), mastery speed, cheaper purchases, specialist caps and slots all come back as 0 (its `scripts/effects/apply-effects.js`). The autopilot's choices add them through `core/xpl-effect-value.js`: `effectsOf` resolves `GameInfo.Modifiers` → `DynamicModifiers.EffectType` + `ModifierArguments`, following `EFFECT_ATTACH_MODIFIERS` (city-state bonuses). Before this, Elective Republic's +1000 Science lost to a little culture.
    - **Each settlement's Happiness is invisible to it** (research/34 §1): it sums a card's Happiness over the empire, where happy towns hide unhappy cities, and takes 2 a specialist as the base of a percent change of their upkeep (the Modern age's is 6).
      - **Seen in game 28:** at M16 Living Standards (23.2) made way for Social Science (193.6, +1 Happiness upkeep a specialist) while the core cities stood below zero. Their production fell 187 → 110 and their science 260 → 182 the next turn.
      - **`localHappiness`** (data/xpl-autopilot-choices.js) works out each card's Happiness change in each settlement and prices it with `happinessWorth` (gotcha 45). It covers flat Happiness, Happiness per specialist, specialist upkeep (Amount, Percent: the game's own `CurrentMaintenance`) and building upkeep.
      - A slotted card is valued at what taking it out would cost. A crisis card's Happiness then counts at full weight, not ×2.
    - **Civilization abilities that pay per card are invisible to it too:** Ming loses 15 Science a turn for every social policy slotted (traditions free: `EFFECT_PLAYER_ADJUST_YIELD_PER_ACTIVE_TRADITION`, `CivUnique` + `Invert`; a civ's own traditions carry a `TraitType`, policies none).
      - Seen in game 5: Ming's science went below zero and the empire got 4 techs in 53 turns.
      - `perCardYields` reads our civilization's and leader's trait modifiers. A card worth less than an empty slot is not slotted — but the game will not end the turn while a slot is empty and cards are offered (`NOTIFICATION_TRADITIONS_AVAILABLE`; «seen it», `CONSIDER_ASSIGN_TRADITIONS`, does not release it; seen in game 6), so the end-of-turn retry then slots the least bad card (POLICY_FORCED), and an active card is only ever swapped for a better one, never dropped into an empty slot.
      - A tradition card only fits a tradition slot; a policy card fits a policy slot, or a tradition slot once the policy slots are full (`model-policies.js` `availableToActive`).
25. **A project needs its building in the city that runs it** (`Projects.PrereqConstructible`, unless `PrereqAnyCity`).
    - Crewed Space Flight Preparation (repeatable, 15 Innovation) runs only in cities with their own Launch Pad.
    - Trans-Oceanic Flight and Break the Sound Barrier need an Airfield there.
    - The science victory (100 Innovation and an undamaged Launch Pad, then a 5-turn countdown) goes on after the Modern path's 3 projects, so in the final age the focus keeps a completed path (research/14).
    - **Space work in parallel** (research/31 §2). Seen in game 26: one city had the only Launch Pad and the only Airfield, and its three one-off projects (17 turns each) waited on each other.
      - **The Airfield goes only to a city without a Launch Pad** (research/32 §3). In a pad city Preparation gives 15 Innovation for 1000 production, while the Airfield and its two flights give 10 for 1861.
        - One queued in a pad city does not count, and none is bought or saved for there.
        - With no other city building it within `SLOW_PAD_MAX_TURNS` 30, there is none.
      - **A one-off** goes to the city that finishes it soonest, counting the one-offs already queued there (`queuedOneOffTurns`), never where Preparation runs (it would wait behind every run).
      - **Near the goal a one-off may go first** (research/33 §4). At 95 of 100 Innovation, Launch Satellite's 5 come in half the time of Preparation's 15.
        - **The race model:** `spaceRace` (data) and `innovationReach` (core) give the turn the Innovation still needed is reached, every city running its queued projects, then Preparation where a Launch Pad stands, and an Airfield city its flights; research is one more entry (gotcha 65).
        - **The choice:** `oneOffNext` puts a one-off ahead of a Launch Pad city's next Preparation run only when that reaches the need strictly soonest. It then ranks between the Launch Pad and Preparation.
      - **One order in a city's queue** (research/32 §2; `VICTORY_RANK`): production first, the Launch Pad, Preparation, the one-offs, the Airfield, then the path's buildings.
        - The most important moves first, and a move never passes an item of the same or a higher rank (`behindOwn`).
        - **Seen in game 27:** with one queue edit a pass (gotcha 54), the capital's Airfield and Launch Pad traded places every pass. The Airfield happened to be next when the Radio Station was done, so it was built first (T74–T80) and the pad after it (T81–T86). The projects ran in no set order.
      - **The Radio Telescope** (`PROJECT_CREWED_SPACE_FLIGHT_RESEARCH`, 5 Innovation for 1200, in `STANDING_SITE_PROJECTS`) runs only where a Radio Station stands, no Launch Pad's preparation would wait for it, and it is done within 30 turns. Since research/38 the Radio Station is a science site like the Airfield (gotcha 65).
    - **Pad cities.** Seen in game 26: four cities picked for a Launch Pad never got one, could build nothing but science sites, and ran «Научная инициатива» for 36–75 turns each (about 8,000 production).
      - A city is a space city only once its pad stands or is queued (`spaceCity`).
      - A pad slower than `SITE_MAX_TURNS` is still built where the gold would buy it later, up to `SLOW_PAD_MAX_TURNS` 30 and before the age ends (`buildRatherThanBuy`; the pads already left for gold this pass come first).
    - **Production first.** Seen in game 26: Бак (40 production) faced a 24-turn pad with a Stonecutter and a Sawmill on offer (2 turns, +5 production each) and an Ironworks (7 turns, +10); the player queued them by hand.
      - **The rule** (`productionFirst`, `productionFirstStep`, log PRODUCTION_FIRST): a city with a science site standing or queued first builds the buildings that pay for themselves before its space work. A building pays when its cost c < R × g / (P + g):
        - R: the site's remaining cost + the projects this city runs before the victory's Innovation is reached or the game ends (`spaceWork` on the race model; research/33 §5). `SPACE_PROJECT_WORK` 2000 only without a science victory known;
        - g: the building's production in the game's placement numbers (`calculateAllBuildingsPlacements`);
        - P: the city's production, growing with each building taken.
      - **Which:** the cheapest per production first, at most `PRODUCTION_FIRST_MAX` 3, never a military building (one tagged PRODUCTION too is a production building: gotcha 60).
      - **In an unhappy city** (research/34 §4): g is what the city keeps of the new production, plus the production its Happiness (its own less its upkeep) wins back or loses (`happinessWorth`). At −25 a +8 Happiness building beats an Ironworks.
      - **Order:** the step runs first in `pushVictoryWork`, so its move is the city's queue edit of the pass. Sites, projects and levers stay behind those buildings (`behindFirst`).
      - **Before the first site** (research/33 §2): a city's production first is weighed before its first science site is ordered (`placeSite` → `productionFirstIn`), so its buildings are appended ahead of the site. Before, a 40-turn Launch Pad started first, and its Ironworks, queued the next turn, stayed behind the pad's progress.
    - **A site only where it brings the goal sooner** (research/34 §5; `siteHelps`). Seen in game 28: the fifth Launch Pad (M83) ran no Preparation before the victory at M93, and Kalhu's Airfield came at M89, its first flight unfinished.
      - **The rule:** beyond the victory's own Launch Pad, a pad or an Airfield is ordered or bought only where the race reaches the Innovation still needed sooner with it.
      - **UI.log:** `victory work: no <site> in <city>: the goal comes on turn N either way`.
      - **Tests:** Preparation now comes in steps of 15 there, so a test world's numbers decide whether a 5-point flight matters.
      - **A double count fixed:** `spaceRace` counted a site in production with progress twice in its city's wait.
26. **A build-queue entry carries every type field, -1 where it does not apply** (`BuildQueue.getQueue()`: `constructibleType`, `unitType`, `projectType`, plus `type`).
    - So `q.constructibleType ?? q.projectType` reads -1 for a project or a unit.
    - Seen in game 5: a queued project was never found, so it was requested again every pass (Chart the Stars 22 times, Crewed Space Flight Research 18) and never moved to the front.
    - Read entries with `queueItemType(q)` (`data/xpl-autopilot-steps.js`). The fake engine's entries now look like the game's.
27. **An independent's village is not a city.** `player.Cities` is empty for it (only a city-state has a city); read the independent's `player.Constructibles.getConstructibles()` for `IMPROVEMENT_VILLAGE` / `IMPROVEMENT_ENCAMPMENT`, as the game's banners do (`data/xpl-player-facts.js` `villagesOf`).
    - Settling within 3 tiles of a village makes it hostile at once; within 4–6 its relationship drops one level (neutral → hostile).
    - Seen in game 5: villages were invisible to the site search (it read cities), every site was 4–5 tiles from one, five villages declared war the turn we settled, and four of those settlements fell. Befriending ordered them by the distance to their cities (none), so the order was arbitrary.
    - Sites now keep 6 tiles from any village, friendly or not (`angersVillage`). Probe P2 (game 6): two camps at peace with us, our own city-states of the previous age respawned, declared a surprise war when Фучжоу was founded 4 and 5 tiles away, and took it.
28. **Town and city defence** (research/17).
    - A centre defends at the full strength of the strongest melee unit its owner trained, bought or (very likely) upgraded **in the current age**, 20 with none (gotcha 62; the Civilopedia's "minus 10" is not in the CombatLog). Game 5 trained only ranged units after Antiquity, so centres defended at 20–30 against Line Infantry at 50.
    - Walls are `Purchasable="false"`, and towns have no production queue: a town gets walls only with the Fort Town Focus (it may then buy them). Towns can buy units.
    - Befriending costs 80/160/240 Influence; sending several requests in one pass started only the first. Its war with us ends at progress 30.
    - `IndependentRelationship.NEUTRAL` means at peace (yellow unit flags), only HOSTILE at war. The threat check once counted neutral villages' units, and a village's own guards at home: in game 6 two towns were "threatened" for 20 turns by units that never attacked.
    - At an age change the previous age's city-states return as villages at war with everyone but their suzerain; independents took settlements with their own standing units 4–6 tiles away (not raids) and razed them.
    - **Research for a stronger melee unit** (`meleeNode`, TECH_FOR_MELEE) only with a war at our door (research/32 §4). Seen in game 27: Antiquity spent six techs on Spearman, Chariot and Horseman against a war risk that never came, and missed the Spherical Earth gate by one turn.
    - **The army deploys** to threatened settlements and war fronts by urgency (gotcha 61).
    - **Guards for a war** (research/23 D3; research/30 §2): a war at our door asks for a melee guard in every settlement within 12 tiles of the enemy's settlements; a war risk alone (an Unfriendly or Hostile major close by, or spying on us) one per risky leader, in our settlement nearest to it (`guardedSettlements`), counting the melee units we have. Game 23: the ring held 14–18 of our 18 settlements on a crowded map, so two Tanks were always in production from M50: six built (1,380 production; unit upkeep 78 → 168 gold a turn) for a war that never came (`AI_Operation_Eval.csv`: no attack on us evaluated in Modern until its last turn).
29. **Shell gotchas on this Windows machine.**
    - `AppOptions.txt` is CRLF: edit it with Python binary replace, never `sed -i`.
    - Long bash heredocs with mixed quotes break. Write the Python patch script to the scratchpad and run it.
    - `tar` on `C:` paths needs `--force-local`.
    - Node ESM imports need `file:///` URLs for absolute Windows paths.
30. **The treasury does not change during an autopilot pass.** Every purchase step reads the same `goldBalance()`: a purchase sent is not taken from the balance until the game handles it.
    - Seen in game 6: a town conversion and a Granary were sent in one pass (the Granary was refused); two repairs that each "fit" the gold were both sent.
    - Every spend goes through the pass budget (`core/xpl-savings.js` `createBudget`, made by `steps.goldPlan`): `all()` for repairs of buildings, walls, and defenders under a real attack (gotcha 89), `free()` for improvement repairs and other defenders, `forGoal()` for the savings goal's own purchase, `free()` for everything else (above the reserve and what the goal holds). New purchase code must take the budget and call `budget.spend`.
31. **An age change keeps the gold and takes the cities** (probe P6, game 6's logs).
    - Gold carries over in full, negative gold too (E70 balance minus that turn's purchases plus M1 income = M1 balance, exactly), up to a cap (`capGold` in the game's `age-transition-post-load.js`; research/37 §5B): 6,000 entering Exploration and 9,000 entering Modern under the default Continuity setting, 3,000 under Regroup (game-speed adjusted).
    - Every city but the capital is a town again on the new age's first turn (every player had exactly 1 city on turn 1; a rival bought the same conversions twice). The legacy card «All your cities from the previous age remain cities» (`CARD_AT_EXP_GOLDEN_AGE_ECONOMIC`) brings them back when the player confirms the dedications (game 34: 5 cities at M1 right after; research/39 said turn 2, from the turn-start statistics).
    - So the autopilot buys no conversion in a non-final age's last `LATE_CONVERSION_TURNS` 10 turns (unless the Towns tab's «expect to keep cities» is on), and with the science focus Exploration's last `AGE_END_TURNS` bank the free gold for Modern up to the cap (`carriedGoldCap`, the BANK goal: gotcha 65).
    - **A city costs 3–5 times less an age earlier** (research/35 §4). Game 28's cheapest conversion was 250–475 gold in Antiquity, 1,075–1,500 in Exploration and 2,500 in Modern. Antiquity stopped at 1:1, 3 cities and 3 towns.
      - **The city target** (`CITY_TARGETS`, `cityTarget` in core/xpl-strategy.js): with the science or economic focus any town may convert below 5 cities in Antiquity, 6 in Exploration's first half, then 8. There is none in the final age.
      - **The health guard:** the target waits while any city is below zero Happiness (`conversionRule({ cityTarget, healthy })`, `citiesHealthy`), but not during a crisis (`crisisOn`): its unhappiness ends with the age, and the revolt guard buys Happiness where a revolt threatens. Game 33: the plague crisis took three cities below zero from A59, and Бирмингем's 500 waited to the age's end and cost 1,500 at E31.
      - **The transition trick** (research/39): on a new age's first turn only the capital counts in a conversion's price, until the dedications are confirmed and the card that keeps the cities brings the others back. While the dedications wait, the autopilot converts the best towns that were not cities (gotcha 66).
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
35. **The game may activate our turn twice.** `PlayerTurnActivated` comes again after an automated explorer moves (24 turns of game 7 had two full passes, B9). Only the first pass of a turn (or a step: F7, «Следующий шаг») plans, queues and buys; a second one orders units and ends the turn.

36. **Peace deals go through the working deal, and the AI is asked first.**
    - The game's peace screen sends `sendWorkingDeal(deal, INSPECT)`; the AI answers with a `DiplomacyStatement` (`RespondingToDealAction` INSPECT, `DealAction` ACCEPTED or REJECTED) that nobody shows. It proposes (`PROPOSED`) only after. A refusal of a proposal is shown as the leader's dialog (game 8: 8 blind white-peace proposals, 8 dialogs).
    - A deal a leader sends us arrives as a `DiplomacyStatement` with `DealAction` PROPOSED and becomes the working deal `{direction: OUTGOING, player1: us, player2: them}`; it is answered with `sendWorkingDeal(id, ACCEPTED | REJECTED)`. While its screen is open the game refuses to end the turn (game 8: 15 refusals in 30 s).
    - The numbers on the wire (`net_message_debug.log` `DiplomacyDeal eActionType`): PROPOSED 4, ADJUSTED 3, REJECTED 2, INSPECT 7. Use the names.
37. **`BuildQueue.getPercentComplete` is 0–100** (the city banner's progress ring has `max: 100`). A building that only holds the overflow of the item before it (one turn of production or less) loses at most that when something moves ahead (`currentProgress`); game 8's settlers waited 19 turns behind such buildings.
38. **The base game sets no `NarrativeStory_Links.AIPriority`** (13 rows, in the Heian DLC only): a story's options are compared by their `NarrativeRewardIcons`. A discovery's `Name` often has no text; its `StoryTitle` has. Crisis stories have no icons at all: their rewards' modifiers (`NarrativeStory_Rewards` → `NarrativeRewards.ModifierID`) give the yields (`rewardIcons`).
39. **A game nobody wins ends at the final age's end with the score victory** (`VICTORY_SCORE`, research/24 §1).
    - **Score:** 1000 points for every turn in any victory countdown; 1000 minus 10 × the sum of our places in the victories switched on (ties share a place: everyone has 970 on the first turn of a game with three; the six majors' places add up to 3 × 21); 1 per major triumph. One countdown turn decides it: game 9 was lost to Alexander's single military countdown turn (M63–64, 850 → 1850) while everyone had 820–900.
    - **Seen in game 23** (research/30 §1): lost 923 to 933, first in science and military and last in the economy (1,430 GDP against 3,992). One economic place would have tied, two would have won, and so would one turn of our own military countdown.
    - **UI.log** in the final age, once a turn while the score victory is on (`scoreVictoryOn`): `score: ours N (place P of M; best other …); places MILITARY 1, ECONOMIC 6 (+N for the next), …` (`scoreBoard` in data/xpl-victory.js: `getPointsForVictoryType(VICTORY_SCORE)`, as the victories screen's score tab reads it; `scorePlaces` in core/xpl-victory-focus.js).
    - **So in the final age** a rival's WATCH level already starts the strategy's overlay (military: settlers to the nearest safe site, `settleNear`), and so does our own countdown within reach (`victoryWatch` CHANCE: ours ≥ 85% of the multiple × the best other).
    - **The game ends at 100% of the final age:** nothing that cannot finish before it (`ageOutlook().turnsLeft` in the final age too): wonders and settlers, and since game 23 every item (gotcha 58).
40. **Shallow water hides a land unit from land melee units** (the user, game 9). Ships, aircraft, ranged and siege units still reach it. A hurt or resting soldier (or a scout) with hostile soldiers near goes onto coast when none of those is within 4 (`escape`, TO_WATER), and stays while they wait ashore (`stayAtSea`, WATER_WAIT), else withdraws into a centre or away.
41. **Go around danger widely; remember where units were hit** (game 10). The game's auto-explore walked a scout back to the warrior that had just hit it (hit twice on one tile); settlers retreated home and then stood stacked, two civilians that may not skip, holding the turn (gotcha 23).
    - A rise in a unit's damage marks that tile as danger for `HIT_TURNS` 5 (`noteHits`, `dangerNear`); the unit itself may still leave it. A rise the plague dealt is no hit (gotcha 87).
    - Scouts: no game auto-explore when hurt 20+, with a hostile unit within 3, or with a hit or loss within 5 (danger within 5 of any kind left 1-2 scouts idle in half of game 11's passes); badly hurt (40+) they heal on our land or go home (SCOUT_HOME); a little hurt with nothing safe to explore, they rest.
    - **A settler next to its site steps onto it and founds at once** (game 35: Бристоль's settler turned back home from the tile next to its site when an independent's Warrior came within 3 tiles, and founded 5 turns later). With a move left, the site free, no hostile unit on or next to it and room under the cap (`dashable`), it moves there (SETTLER_DASH), and the hud's unit step founds right after (`foundArrivals`). With no move left it founds on its next pass, standing on its site.
    - Settlers detour toward their site (`findDetour`: 3+ from danger, one step back allowed; SETTLER_DETOUR) instead of going home; a site reachable only around danger is still picked (`via`).
    - A civilian that may not skip (stacked) steps aside, away from raiders (`stepAside(…, {away})`), in the wait and after a released order.
42. **An independent can be befriended only once its village is seen** (game 10). Until then its befriend project answers -3 (very likely `PROJECT_NO_VIABLE_TARGETS`). Game 10 saw «0 seen, 16 unseen» all Antiquity; the two independents that raided us could be befriended only on turns 56 and 69, and took two of our three settlements.
    - A befriend status of -3 with the village listed at a price above our Influence is a befriending to save for, not
      an unseen village (gotcha 78), unless its FailureReasons name LOC_DIPLOMACY_ACTION_FAILURE_NO_VISION: the game has not let us find it, so nothing is kept and a unit approaches it (gotcha 90).
    - `villagesOf(pid, true)` lists unseen villages too: scouts go in sight of the nearest ones within 12 tiles of our settlements first (`scoutVillage`, SCOUT_VILLAGE, goal `{village}`, one scout each).
    - Ships are hit only by ranged units: a settlement shot by ships gets ranged defenders (`rangedWanted`, up to 2; `bestRangedOrder`, no siege units), trained and bought; with land raiders too, a melee one first (`defenderNeed`). Game 10 trained only warriors against galleys, quadriremes and archers.
    - **Ranged guards shoot from their post** (game 27, research/31 §8).
      - A unit on alert, fortified, asleep or resting is busy. `commandUnits` orders only idle units, and the game wakes a unit only when the unit itself is attacked.
      - Ханькоу's Field Gun, at full health and on alert in the centre, never fired while two Dreadnoughts next to it shelled the centre from 200 to 0 (T71–T77). The guards counted as enough, so nothing else came.
      - `strikeRaiders` now runs `shootRaiders` first. Every ranged soldier with an attack left, busy or idle, shoots at a soldier we are at war with (`rangedAttack(…, {hostileOnly})`), one after another, each after the last one's `Combat` event.
      - Not a unit on its way (a move order), nor one in danger off a centre (`escape` takes those).
43. **A unit the game stopped on its way is ready for orders, though it has moved** (game 12 T31). A queued move the game cannot finish leaves the unit awake with moves left and `hasMoved` true; the game's ready list wants orders for it, while `isIdle` (never moved) misses it. A commander walking to its post held the turn this way.
    - The skip step skips `readyForOrders` units (idle, or awake with moves left after part of a move), and follows the game's ready list, waiting `READY_WAIT_MS` 100 up to 5 times for each skip to be taken (the game takes it a moment later; before, one ready unit was skipped per pass).
    - **The strike step's units are not kept from the skip** (game 36 T49): each attack was waited for (its `Combat` event), so a unit still ready had no attack. A Coordinated Attack's raider died after two of its three Warriors; the third, on Манчестер's centre (no fortifying there), was kept from the skip as ordered and held the turn («Отдать приказы юнитам»). Only move orders the game has not carried out stay kept from it.
    - A move order kept `STUCK_MOVE_TURNS` 2 turns on one tile (`Units.getQueuedOperationDestination`) is cancelled with `UNITCOMMAND_CANCEL` (`releaseStuckMoves`, MOVE_STUCK); settlers keep their own watchdog.
    - Turns still held by NOTIFICATION_COMMAND_UNITS log `the game waits for <unit> at x,y (activity, moved, moves, order to …); allowed: …` (`readyUnitReport`).
44. **Victory points come from fixed sources** (`victories.xml` `VictoryScorings`; research/26).
    - **Military:** 4 per settlement we own, +1 conquered, +1 in the Distant Lands, +2 with our ideology; Operation Ivy's triumph +25.
    - **Culture:** wonders 4 / 8 / 12 by age, celebrations 2 / 4 / 6, relics 3, artifacts 5, natural wonders 10, unique quarters 1 / 2 / 4, Resort towns 4.
    - **Seen in game 11:** our military score was 55 against the leader's 60. Five more settlements would have started our own military countdown (1000 score a turn), and the game was lost by one countdown turn. In game 12 we stood at 11 of 16 settlements from M30 with sites known.
    - **So the final age fills the settlement cap** (Commit `fillCap`: settlers trained and bought below the cap, nearest safe sites first).
      - **Only while settlements score:** the military victory or the score victory must be on (`settlementsScore` in `strategyFacts`; research/34 §6). Otherwise the final push trains settlers only below half the cap, and none once the age's gate is 60% in (`SETTLERS_GATE_NEAR`).
      - **Seen in game 28:** only the science victory was on. The empire still went from 10 to 16 settlements of 17 and lost one, and its capital trained Tanks for two of them.
    - **The military lever:** when the cap's room would start our countdown (`militaryOutlook`: at the current multiple when its settlements are within reach, else at the next step's; Operation Ivy counts when a city of ours may finish it in time), settlers come first. Game 31: at Modern's 60% the lever judged ×1.25 (no settlement needed) while two at ×1.5 would have started our countdown at once; Augustus's culture countdown, begun at that same step, won five turns later. They become the first savings goal and move ahead in queues (`holdsFront` still guards raced wonders and science projects), and Ivy is queued if the settlements alone fall short.
    - **Past the cap** (research/30 §1): when the cap's room falls short, the lever founds up to `PAST_CAP_MAX` 2 settlements more while our Happiness a turn pays for them (each one over costs 5 in every settlement: `TRAIT_MOD_PENALTY_OVER_SETTLEMENT_CAP_SETTLEMENTS`; `pastCapRoom`). `militaryRoom()` gives `over`, `militaryOutlook({over})` gives `pastCap` (the cap's room first, then Operation Ivy, then past the cap), and the strategy carries `pastCap`; settlers are then trained (`unitsWanted`), bought (`settlerOffer({past})`) and founded (`waitAtCap(…, past)`) past the cap. Logged once as MILITARY_PAST_CAP, and in the military line as `room R, past the cap K`. Game 23: 2–4 settlements short from M41 to the end with room for 1–2; relaxed searches found 3–8 sites.
    - **Blocking a rival's countdown** (research/31 §3).
      - **Seen in game 25:** Ashoka's military countdown ran from M58, broke at M61 when we founded a settlement, ran again from M67 and won at M72. We were second, so our own settlements set his goal: two more by M67 would have stopped it. A settler stood idle 23 turns while the sites ran out.
      - **The block:** the victory watch's MILITARY entry carries `block`, the settlements that would hold `need`.
      - **Settling anywhere:** in the final age the MILITARY overlay (a rival's DANGER or WATCH; our own lever too) sets `settleAnywhere`. A settler with no site for `ANYWHERE_IDLE_TURNS` 1 (3 before game 42) then takes the nearest tile within `ANYWHERE_RADIUS` 8 that the game accepts (`anySite`, log SETTLE_ANYWHERE); a settler is bold then (gotcha 74):
        - `isValidLandClaimLocation`, on revealed land;
        - our own spacing aside, but never within `ANYWHERE_VILLAGE` 3 of a village, never into danger, never a war;
        - the goal carries `any`, which `tooCloseToForeign` lets through.
      - **The log:** the `settler: no order` line now judges relaxed picks by the relaxed rules (it reported them FOREIGN).
    - **Squeezed sites count under a countdown** (game 63, won on score at M70: one settlement from our military countdown
      for Modern's last 12 turns, room for 2-4 under the cap, two bought settlers idle; the relaxed search found 3 candidates
      the game accepts and rejected all 3 for ROOM, and «settle anywhere» found none within its 20 tiles): while the strategy
      says settleAnywhere, the relaxed search drops the land minimums (`siteTuning(true, {anyRoom})`: ROOM_HARD_MIN 0,
      RING1_MIN_FREE 0; the hud's `anyRoomSites`): such a settlement is worth its 4 military points whatever its land.
    - **Looking ahead to the final step** (game 62, Deity: lost on score, 6th of 8; our military countdown 4 settlements short at
      Modern's end): while we trail the best rival in every other race (`trailsOtherRaces`), `militaryOutlook({lookAhead})` also
      judges the countdown at the final step's ×1.25 when the nearer steps are out of reach. Game 62's M30: ×1.5 asked 11
      settlements (room 6, 2 past the cap), ×1.25 asked 8: the lever started at M42 instead, and 8 settlers trained in all of
      Modern (none bought, the gold too low) gave 4 settlements from M45 to the end.
    - **Natural wonders** count in site scoring while the culture victory is on.
45. **Yield weights: one function, and the player's balance** (research/26 §3.2).
    - **Seen in game 14:** in Exploration we had twice the rivals' food and half their science; new citizens went to farm tiles 44 times and to specialists 8.
    - **Food and happiness gains follow the scarcity curve too** (`gainValue` / `gainMultiplier` in core/xpl-scarcity.js, used by the growth advice): a city with plenty values more food less.
    - **Below zero Happiness the game takes 5% of a settlement's other yields a point** (food aside; at most 80%: `unhappinessShare`, `unhappinessDelta`).
      - A happiness cost that crosses zero pays that share of the settlement's production, gold, science, culture and influence, counted before any penalty. A gain back above zero wins it back.
      - `costValue` / `gainValue` need every net yield for this: the growth job and the building job's `netsOf` pass them.
      - Seen in game 27 (research/31 §8): Лоян was already our unhappiest settlement (its commander was posted there at T55). It took two Modern specialists (6 Happiness each) at T55–T56 for advised gains of 28. Its production fell from 31 to 12 the next turn and its science from 64 (T50) to 30 (T60). Unrest came at T60, −14 Happiness at T69, and its Examination Hall showed 49 turns.
      - The old weight was only ×2 (SHORTAGE) on the happiness itself. It still stands in when the other yields are unknown.
      - **At the cap** (`happinessWorth`; research/34 §2): each point between a capped settlement and zero is worth the cap over those points. A gain there is not worth nothing, nor a further loss free. Seen in game 28: Kalhu sat at −33 all Modern, where a +5 building alone changes no share. Below the cap it is exactly the share's change. Used by `gainValue`, `costValue`, the cards (gotcha 24), the building job and production first.
      - **New yields lose the penalty's share too** (`gainValue(…, { happinessAfter })`; research/34 §3). A specialist's own yields count at what the city keeps once its upkeep is paid. Seen in game 28: Nineveh at −23 took one valued 19.6, and its science moved 26 → 27.
      - **A happiness building wins yields back** in a settlement below zero, wherever it stands there (`happinessRecovery` → the plan's `extraValue`; `recovery` and `net` in its rows): it comes earlier in the plan and its purchase is worth more.
    - **Every reader of the weights calls `profileFor(settings)`** (core/xpl-profiles.js), never `getProfile(settings.profile)`. It applies `settings.yieldBias`: «Баланс приоритетов» in the Autopilot tab, six sliders ×0–2 for food, production, gold, science, culture and happiness, on top of whichever profile is in use (the strategy's phase profiles too), and the autopilot's gold pressure on gold's (gotcha 64).
    - **One balance per victory focus** (`BIAS_SETS` SCIENCE / CULTURE / ECONOMIC / NONE). Each pass uses its focus's set (`biasFor`, `settings.biasFocus` set by the hud), and the sliders show and edit the current focus's.
    - **Science starts at Еда ×0.7, Наука ×1.5** (`BIAS_DEFAULTS`; the user's choice after game 16 had 383 science against game 19's 113 at Exploration T60). The other sets start at ×1.
    - **New inputs:** a new input of a plan goes into `inputSignature` (the balance is there).
    - **UI.log** prints `economy: T…` every 10 turns: yields, urban/rural/specialists, where this age's new citizens went, the balance, the rivals' science and culture, per settlement F/P/S/C.
46. **The plague hurts units, and our cities kept feeding it new ones** (game 18).
    - **The game's rule:** units that start their turn on an infected tile take 25 damage, for 6 turns (`PLOTEFFECT_PLAGUE`, `Damage` 25 in `GameInfo.PlotEffects`; fallout 50, fire 15). Tiles: `MapPlotEffects.getPlotEffects(plotIndex)` → `{effectType}`. The settlement: `city.isInfected` (the banner's status).
    - **Moving out:** a unit of ours on such a tile (`hazardAt`) is woken and moved this turn to the nearest safe tile it reaches (`leaveHazard`, LEFT_HAZARD), or by a way of up to 3 turns when no clean tile is reached this turn (gotcha 87). A healthy soldier with raiders within 3 holds its tile.
    - **Effects that hurt only on entry are ignored:** traps and dig sites (`TriggerOnEnter`).
    - **Keeping out:** no order sends a unit onto such a tile (`moveTo`), and settler sites there are HAZARD.
    - **Training:** no unit is trained or bought in an infected city (one is bought in our nearest clean settlement in time: gotcha 87).
    - **Explorers too, and no wanted unit but settlers in a city kept for a Launch Pad** (`padExclusion`; game 34: the culture overlay's Antiquarian took Ливерпуль M14-M37, 400 at 39 a turn, and its pad came at M47; game 35: Манчестер trained a Tank M47-M51 and finished its pad at M62).
    - **Military units only where they are done within `MILITARY_MAX_TURNS` 10** (`unitTurns`). Seen in game 18: after a war declaration a Landship got 6 production a turn, 33 turns. Defenders come from the nearest such city within `DEFENDER_REACH` 12, a city with space work last unless it defends itself (research/34 §6: game 28's capital trained Tanks for two new settlements while its Launch Pad waited M51–M73); none means the purchase step buys one.
47. **The victory focus outlives the age change, and the final age keeps it** (game 19).
    - **The problem:** the autopilot's state starts afresh each age, and at an age's first turn every new legacy path is at 0, so the leader's leaning (+0.15) alone chose the focus. Seen in game 19: Ada's culture leaning took Modern from science (26 Innovation) to culture (46 against the leader's 117); the game was lost to culture with 30 Innovation.
    - **Memory:** the focus is kept in the save (GameTutorial `_XPL_OBJ_FOCUS`, `savedFocus` / `saveFocus` in data/xpl-victory.js) and, since the save's properties do not outlive an age change (gotcha 57), in the settings' memory of this game; it is the `previous` of a new age.
    - **Leaning:** the leader's leaning picks a first focus but never makes a switch (`lean`, left out of the switch margin).
    - **The victories' points** decide it since games 42-43 (legacy paths read 0), and only in an age's first 15% (gotcha 74).
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
    - **The refund rule:** a lost wonder pours half its progress plus that turn's production into the item in production when the race is lost (the next item when the wonder itself was in production; otherwise whatever stands at the front: game 60's walls), up to the room it has left (its cost less its progress; gotcha 89).
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
    - **What the victory step queued is noted per run, not per pass** (`victoryQueued`, fresh for each end-of-turn retry): fillProduction skips those cities because the game's `isEmpty` is stale until it handles the order, but an order the game refused must not keep a queue empty. Game 32, E64: Liverpool's damaged University was repaired with gold, the same pass ordered it again (the game offers a damaged building as its repair: the victory step now skips a building the city has and any `RepairDamaged` answer), the game refused, and «Выбрать производство» held the turn until the player switched the autopilot off and on.
    - **Items that each go "to the front" take turns there** unless they are ordered (research/32 §2: game 27's space work). One step's moves must follow one order, the most important first, and `toFront`'s `behind` never passes an item it names, wherever that item stands before it.
55. **Wonders go straight to the front, and every order is watched** (research/28 §1).
    - **Seen in game 21:** the Emile Bell left Carthage's queue unbuilt three times (T32–T35) while it waited behind other items, and the Mausoleum of Theodoric once (T46). Each had nothing in it, so the game's notice said 0 production returned. We sent no removal (`net_message_debug.log`); why the game dropped them is not known yet. Every wonder that went straight to the front was built.
    - **The rule** (`wonderSlot`): a wonder waiting in a queue goes to position 0, ahead of a building with progress (under either rule of gotcha 20 nothing is lost: each item keeps its own, or the wonder absorbs the building's). Behind a wonder in production, behind an item done this turn, behind repairs, wanted units and projects.
    - **No wonder waits behind a project or a wonder in production** (game 34; `frontHeld`, `WONDER_WAIT_TURNS` 1). A rival finishing a wonder that waits in our queue takes the progress of our item in production: the game drops the wonder (NOTIFICATION_PRODUCTION_INVALIDATED, «0 returned») and that item starts over. Лондон's Chart the Stars lost 78 at A39 to the Colossus and 181 at A57 to the Ha'amonga a Maui (London made 10-21 a turn; the project ran A32-A69); game 25's Spherical Earth lost 187 to the Pyramid of the Sun. A wonder never passes a project, so a chosen wonder is not ordered where a project or a wonder in production holds the front more than a turn (UI.log `wonders: X not ordered in <city>: …`), and one waiting there with nothing in it leaves the queue (WONDER_WAIT_DROPPED).
    - **Orders** (`wonderOrders`): an order of this turn counts as started until the game's queue shows it; one we take out of a queue ourselves is forgotten (`removeFromQueue`; game 44's dropped Oxford University was logged as gone unbuilt). Game 21: the end-of-turn retry, three seconds after the order, did not see it and ordered the Emile Bell again.
    - **Tiles:** the game may refuse the planner's tile by then: the next tiles are tried (`orderWonder`), and UI.log says when none is taken (`wonders: … could not order`). Before, nothing was said; the Mausoleum was never ordered again.
    - **UI.log** (the evidence the next game needs): `wonders: X left <city>'s queue unbuilt (ordered T…, last seen T…); queue now […]; that tile now: <the game's answer>; game notices: …`, and `game notice: NOTIFICATION_PRODUCTION_INVALIDATED | NOTIFICATION_WONDER_FAILED: <text>`.
    - **The queue probe** (research/31 §5; `probeQueues`, from `chooseWonders`). Once a turn, UI.log gets a line for each city whose queue holds a wonder, or whose item in production has stood at 100% since an earlier turn: `queue probe: <city>: [TYPE pct%*, …]; TYPE at 100% since T…; bought here T…` (purchases from the game's CityMadePurchase).
      - **What it is for:** games 24–26 left 7 wonders unbuilt, and each time the tile was still accepted.
      - **Game 24:** Carthage's Altar stood at 100% with 290 of 49 in it (A27–A39), and the pile went when the Ha'amonga left; the same happened with the Emile Bell.
      - **Game 25:** Spherical Earth lost 187 the turn the Pyramid of the Sun left.
      - **A lead:** something was bought in that city the turn before in 3 of the 7 cases.
      - **Game 34:** a third one, after a Launch Pad bought under way in that city again: GB3's pad bought at M39, its Radio Station at 100% from M45 (game 33: Брэдфорд's pad bought at M51, its City Park from M56). The give-way rule moved Launch Satellite ahead after one turn.
      - **Game 33:** two items in Брэдфорд never completed. Its Granary stood at 100% A66-A70: the plague damaged 9 of Брэдфорд's tiles at A65, and the Granary's purchase that turn is FAILED in `CityPurchase.csv` (a damaged tile, very likely). Its City Park held 945 of 451 at M56-M60 (no event found); Crewed Space Flight Preparation and both flights waited behind it as its production-first building. Such an item now gives way (gotcha 20).
    - **Building purchases wait in a wonder's city** (research/32 §6; `holdsWonder`).
      - **Seen in game 27:** the Serpent Mound left the queue after a Harbor was bought in its city in the same pass. That makes 4 of 8 cases with a purchase in that city at that time, each a building.
      - **The rule:** no building is bought in a city whose queue holds a wonder, or where one was ordered this turn. Units still are. Walls are bought there only against a real attack. Repairs are queued instead, and no savings goal is held there.
      - **UI.log:** `purchases: no building bought in <city> while <wonder> is in its queue`, once a turn. Whether wonders stop leaving their queues is the test. Improvement repairs are bought there too (probe P-REP-2, gotcha 89).
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
      - Research too (`chooseResearch`, `researchAgeLeft`; non-final ages only): a new pick comes from the nodes done before the age ends, while any is, and the research in progress gives way to one (the user, game 41: a third Future Civic about three turns before Antiquity's end, never finished).
      - Empty queues take only what is done in time: from the plan, from the advisor (`advisorOrder({fits})`) and the cheapest building (`lastResort` still fills a queue). The path's buildings too (`leverSoon`).
    - **The final age** says it in its own words (GAME_END_FIRST / GAME_END_QUEUED). Its science sites only where the site and its project are done before the end (`siteFitsAge`, the site's `projects` else `needs`: Launch Satellite after a Launch Pad, Trans-Oceanic Flight after the Airfield): placed (`pushVictoryWork`), bought (`victoryPurchases`, `bought: true`) and held as a goal (`siteGoals`); one already queued that no longer fits is not pushed ahead. Crewed Space Flight Preparation only where a run is done in time.
    - **Bought on a non-final age's last turn** (`buyAgeEndItems`, AGE_END_BOUGHT, the pass's first purchase): a building in production at least `AGE_END_BUY_SHARE` 50% done that will not be done before the age ends, the most production kept first, from the whole treasury, the reserve too. Only the free gold is used while a settlement is threatened, or while the BANK goal holds gold for the next age (game 34: a Shipyard and an Armorer took 920 of the 974 banked at E67, and Modern opened with 255). Seen in game 25: an Academy at 94% was lost for about 30 gold behind a reserve of 64. The game prices an item in progress by what it lacks (about 4 gold a production: game 23's Port at 397 of 451 cost 216); the purchase goes to the tile `canStart(PURCHASE).Plots[0]` names when `InProgress`, as the game's production list does it. The last turn is the one whose age points are full (0 turns left); the turn before, an item one turn short still finishes. Game 23: the capital's Bazaar ended Exploration 19 short (about 77 gold, with 822 in the treasury).
    - **No end on the clock** (research/31 §1). `ageHasEnd()` (data/xpl-town-job.js) is false in three cases:
      - the final age with the score victory off: the game's own test for showing the final age's countdown is `Game.VictoryManager.isScoreVictoryEnabled()`;
      - a game played on after "one more turn" (`Game.AgeProgressManager.isExtendedGame`);
      - an age with no timer (`getMaxAgeProgressionPoints() <= 0`).

      Then `ageOutlook()` gives `turnsLeft: Infinity` and `endless`, and the town job's `ageTurnsLeft` is Infinity. Every deadline is off: this gotcha's, gotcha 31's conversions, gotcha 39's settlers and wonders, and `ageEnding` (upgrades). The `score:` line is not written.
      - **Seen in game 26:** only the science victory was on. Modern reached 100% at M70 and the game went on to M122 (the Inca's science victory). From M65 every space project was refused, and from M70 the log said `… with 1 left in the age` every turn.
    - **A rival's science countdown is the end** (research/33 §1). Nothing we hold stops it, so `ageOutlook().turnsLeft` counts to it whatever the clock says (`rivalWinTurns()` in data/xpl-victory.js; `rivalWin`; `endless` false then).
      - The victory watch reports it (`fixedWatch`: DANGER while it counts down, with its turns left; our own CHANCE at 85 of 100).
      - A dominance countdown sets no deadline: holding second place may break it (research/31 §3).
    - **Not covered:** an urgent defender that is done in time still goes ahead of a building with progress, which may then miss the age's end (Рисила's lancers and University).

59. **The building plan gives the tiles and the order** (research/33 §3, §6, §7).
    - **Tiles:** whatever the autopilot puts on a tile of its own choosing takes the plan's tile for that building when the game takes it now, else the game's best of the tiles the plan leaves free (`bestPlotFor`, `pickPlot`, `planTiles`). That covers the victory work, its purchases and goals, production first, the advisor's buildings and the fallbacks. Before, the game's best for today's yields took tiles the plan kept for quarters and wonders.
    - **Warehouses:** the plan keeps them apart (`fillers`); the queue takes them with the rest, in build order (`plannedInOrder`).
    - **The path's buildings:** an empty queue takes them from the plan or the advisor only where the victory step would (`leverSoon`: done within 12 turns). A 40-turn Laboratory went in through the plan.
    - **Build order:** gotcha 5.
60. **Military-tagged buildings are production buildings too** (research/35 §7). Every base-game building tagged MILITARY is also tagged PRODUCTION: the Antiquity Barracks (+3), the Exploration Armorer and Shipyard, and the Modern Military Academy (+9, Production adjacency from resources and wonders, 420, against an Ironworks' +4 for 535) and Airfield.
    - **What went wrong:** the peacetime rule (research/21 E2: no military building for science or economy) and production first skipped them all as military.
    - **The rule:** `isMilitaryBuilding` is now MILITARY and not PRODUCTION; only a unique like the Anjuvannam remains.
61. **Guards: there, on their way, in time; fronts before the war** (research/36).
    - **Seen in game 29:**
      - A Cuirassier sent from nine tiles counted as Ollantaytambo's guard at once. Nothing was bought with 711–1,034 gold, and one Line Infantry took the town in two attacks.
      - At M52 four reinforcements went to the settlement listed first while Куско stayed unguarded, and reserves slept.
      - A ranged defender came only from the gold above the reserve: `nothing to buy within 0 gold` with 547 in the treasury.
    - **Counting** (`guardDetail`, `guardProgress`): guards there (within GUARD_RADIUS), and guards on their way with their turns. A goal is stale, and dropped, when the unit heals, sleeps, stopped on an earlier turn or walks elsewhere.
      - Sending units counts every guard on its way.
      - A purchase counts only those arriving within `guardDeadline`: 1 turn with a damaged centre or a raider within 2, else 2.
      - A defender bought this turn counts when training is decided (`defenderBought`).
    - **Who goes** (`planDefence`): the most urgent lack first (a damaged centre, no guard, raiders within 2, their number), each served by the free unit that reaches a post soonest.
      - Asleep and fortified units are woken (UNITCOMMAND_WAKE).
      - A settlement's spare guards move on; the one on its centre never does.
      - Ranged units go too, behind the screen; one is wanted against 2+ land raiders (moved and trained, not bought).
    - **War fronts** (`warFronts()` in steps): a guard each, STAGED on our own land, from idle units or units the autopilot fortified (`restedByUs`). A front lasts 5 turns after its last warning.
    - **A strong lone raider** 3–4 tiles away (stronger than every guard there: `strong`) is an early warning (`earlyWarning`): guards, but no walls ahead of the queue and no Fort Town.
    - **Gold:** under a real attack (`realAttack`, gotcha 89) defenders of either role come from all the gold less 3 turns of a deficit; otherwise from the free gold (`DEFICIT_KEEP_TURNS`). One the gold cannot buy yet but will within `DEFENDER_SAVE_TURNS` 2 turns of income becomes the pass budget's goal (SAVING «Копим: защитника (…)»): the free purchases wait (game 38: Бутооло's centre fell from 100 to 0 M7-M11 while 108 gold a turn bought buildings, one of them its own Harbor, and the cheapest defender, 540, stayed out of reach of 361-365 at +106 a turn).
    - **Walls that hold** (game 36; `wallsHold`): walls standing on the centre (a finished FORTIFICATION building, `walled` on the threat), the centre unhit, and only independents around (a major brings siege units). The settlement then wants the one melee guard on its centre (and one more against a stronger raider), and no ranged one behind it. Манчестер, a walled town, wanted a guard per raider (4-6 Warriors that hit its centre for 8 of 200 a blow) and ended with 5 Warriors and 2 Slingers: 3 bought, 3 trained ahead of Лондон's Colossus. UI.log's `defence:` line says `walled (they hold: one guard)`.
    - **Training:** where the defender arrives soonest, training plus walking, within `DEFENDER_ARRIVAL_TURNS` 16; a queued soldier of another role does not stop the search.
    - **Air:** `airAttack` (UNITOPERATION_AIR_ATTACK: canStart with no target gives the Plots, then {X, Y}); fighters with a war at our door and enemy aircraft in sight or air raids remembered (`hostileAircraftNear`, QUEUED_INTERCEPTOR; rebasing and the ground attacker: gotcha 69). Commanders use the game's radius (`Units.getCommandRadiusPlots`).
    - **UI.log:** `defence: <settlement>: …` once a turn per threatened settlement and war front.
    - **Not done:** transport. Formations: gotcha 68; the air wing: 69; the navy: 70; campaigns: 71.
62. **A centre's defence starts over every age; packed units are no guards** (research/37 Phase 1).
    - **The centres' unit.** Every centre defends at the full Combat of the strongest melee land unit we obtained this age (trained, bought, very likely upgraded), 20 with none; carried-over units do not count (the age change rebuilds them with new ids).
      - **Seen in game 29:** Modern's centres stood at 20 for 35 turns while carried Line Infantry met the old want; Ollantaytambo fell at M6 to one Line Infantry (80, then 78 damage).
      - **The memory** (`data/xpl-centre-defence.js`): this age's strongest one, in the settings' game memory (`melee` = `AGE|turn|strength|UNIT`, gotcha 57). It comes from the game's `CityProductionCompleted` (our cities, the player's own training too), our purchases and our upgrades. Another age's, or a later turn's (an earlier save), counts as none. UI.log `melee: <unit> trained|bought|upgraded in <city> (…, strength N): obtained this age, centres defend at N` (probes P-DEF-1, P-DEF-3).
      - **QUEUED_MELEE** wants one as strong as the best we can train while that beats the centres' defence now (`max(20, obtained)`), whatever we carried over. The age's first is wanted in a peaceful final push and at a deficit too; a stronger one later as before, but in the final push only under a threat or a war at our door, not a war risk alone (game 35: a Tank, 65 over our Cuirassier's 55, against Augustus's risk; no war came). Never in a space city nor one kept for a pad; in the city that has it soonest.
      - **Bought first when the gold allows** (`buyFirstMelee`, after the defenders): an upgrade of one of ours to a strong enough melee type (`upgradeFirstMelee`), else the strongest the game sells (at least the best we train), from all the gold less 3 turns of a deficit under a real attack or while a settlement is exposed (gotcha 89), else the free gold; threatened, exposed, then unguarded settlements first. A queued one made needless leaves its queue (`dropSpareMelee`).
    - **Packed and embarked units are no guards.** `guardDetail`, `threatenedSettlements`' guards, `frontGuards` and `soldierAt` skip `isOnMap === false`; an embarked one (`afloat`: `unit.isEmbarked`, else its tile) counts as on its way. `defence:` lines say `packed [...] not counted`.
    - **Rivers.** Land units are never sent onto a navigable river (`onWater`, `standsOn` in posts, steps away, detours, hazards and the ocean escape); ships may use one.
    - **Ranged posts** stand within the unit's `Unit_Stats.Range` of a raider, as far back as that allows.
    - **Ships are fought by Bombard** (land units fire at ships with it): against ships the ranged defender trained or bought has the best Bombard, siege units included (`bestRangedOrder({ships})`, `isSiegeGuard`), and siege units there count as ranged guards.
    - **Air.** `isAircraft` leaves out air commanders (any visible enemy Airfield asked for fighters). Aircraft are found at their own tile, else their army's (`unitTile`: `Armies.get(armyId).location`). `hostileAircraft()` gives each one's targets: our settlements within its Range.
      - Fighters count only where their base covers a target (`fighterCover`: 3, +1 at an Airfield, +1 after Flight's mastery; Ace not counted).
      - They are trained only in an Airfield city covering one with a free slot (`airBases`), the nearest first; none: UI.log `air: no fighter for …`.
    - **Probes** (UI.log, `probeMilitary`, once a turn): `army:` each commander's army when it changes, `reinforce:` units on their way to an army, `air:` every aircraft and air commander with its base, each Airfield's answer for a fighter, and the first `Combat` payloads while aircraft are about.
63. **Exposed settlements want a holder; the age change keeps units as they were** (research/37 Phase 2, game 30).
    - **The age transition:** the game's default is Continuity (`AGE_TRANSITION_SETTING_KEEP_MORE`; `Configuration.getGameValue("AgeTransitionSettingName")`). Every unit comes back where it stood, as the new age's tier-1 unit of its class with a new id, in its state: fortified soldiers start the age fortified (game 30: 11 resting at M1 before any order). Only units already packed are packed again. Regroup (the other setting) packs the surplus army into commanders on centres (research/37 §5B).
    - **Exposed** (`steps.exposedSettlements(threats)`, every pass): within `EXPOSED_RADIUS` 6 of a seen village at war with us and not threatened. Game 29's Ollantaytambo stood empty from M1 and fell at M6.
      - **The holder** (`holderDetail`): a melee soldier on the map, not embarked, not a commander, damage below 30, on or next to the centre (`HOLDER_RADIUS` 1); one sent there counts as coming (one sent this turn even while still packed).
      - **In `planDefence`** each exposed settlement wants one, after every threatened settlement and before the war fronts (one sort by rank); resting soldiers may be woken; a town's holder is never taken for another (HOLDER).
      - **A member leaves an army** for it when one is packed near (`UNITCOMMAND_REMOVE_FROM_ARMY` on the member: canStart `{}` → Plots, the offered tile nearest the post; one a pass per army, not while hostile units stand within 2 of the army unless it stands at the settlement; DEPLOYED; UI.log `army: … leaves the army at … (probe P-A2)`).
      - **Bought** (`buyDefenders`, GARRISON_BOUGHT) when no holder is there or coming within `EXPOSED_HOLD_TURNS` 3: from the free gold only, also at a deficit (no longer never); the strongest melee unit while none was obtained this age, else the cheapest; one a turn.
      - **Trained** (`trainDefenders`, QUEUED_HOLDER) after every threatened settlement, where it arrives in time, when none was bought.
      - Upgrades take holders after the threatened settlements' units. UI.log `defence: <name>: exposed (<independent> at d tiles): holder N + M coming […]`.
    - **War fronts and resting soldiers:** fronts take idle soldiers or those the autopilot fortified (`restedByUs`). That list is kept in the save (`_XPL_OBJ_RESTED`), and soldiers resting on an age's first `AGE_START_TURNS` 2 turns are added (the age change brought them back fortified). Game 30: Данди's front stood at 0 of 1 guards from M55 to M62 with 13 soldiers available.
64. **Gold weighs more while the treasury bleeds; a rival is judged at the final age's next step too** (game 31).
    - **Seen in game 31:** lost to Augustus's culture countdown, begun at Modern's 60% when the multiple fell from ×2 to ×1.5. Gold income stood below zero for most of Modern (unit upkeep 90-115 a turn against 53-76 gross gold), and the treasury stood at 0 from M24 to M43, so no settler could be bought for our military countdown, two settlements away (gotcha 44).
    - **Gold pressure** (`goldPressure` in core/xpl-scarcity.js, `GOLD_PRESSURE`): gold's weight is ×1.5 after 3 turns in a row below zero, or with a treasury that covers one more turn of the deficit; ×2 for a deficit on 6 of the last 8 turns, or both. It falls one level a turn once 3 turns in a row stand at or above zero.
      - **Tracking:** `steps.goldPressureNow()` notes the income once a turn and forgets it when the turn goes back (a new age, an earlier save); `resetGoldPlan()` clears it.
      - **Applying it:** the hud puts the factor in the pass's settings (`goldPressure`), and `biasFor` multiplies gold's balance by it. So every reader of the weights (`profileFor`: policies, growth, town Focus, the building plan) weighs gold more, and the plan's inputs change (a full plan) only when the level does.
      - **Logs:** GOLD_PRESSURE when it rises, GOLD_PRESSURE_OFF when it ends; UI.log's gold line ends `gold weighs ×N (income below zero)`; `state.autopilot.gold.pressure`.
    - **The next step** (`victoryWatch` in the final age): a dominance leader is also measured against the next step's goal (⌊second × the next multiple⌋). When that raises its level (WATCH → DANGER, or none → WATCH), the entry carries `step` and `stepGoal`, and its `need` (the block) is judged at that multiple.
      - Game 31 at M27 (41% of Modern): Augustus's 164 against 250 at ×2 was a WATCH, but 164 of the 187 ×1.5 would bring is DANGER, and the block takes 126, not 95; the culture overlay spends wonders only on a block within 30 of ours at that step.
      - A leader already near the current goal takes no `step`; its block is still judged at the next step (`needAt`, gotcha 85), unless its countdown runs.
      - Logged once as RIVAL_STEP_DANGER; the tab's LOC_XPL_AP_WATCH_STEP; UI.log's watch line `(at ×1.5: goal 187)`.

65. **Modern's science pace** (research/38; games 28-31: Rocketry needs 15 of the 16 Modern techs, about 22,000 Modern science, and Innovation stood flat 35-50 turns).
    - **The race counts research** (A1). `researchPlan` gives the Innovation research still brings, in the order research takes it: Rocketry at the end of its way (`gateTurns`, the game's `getTurnsForNode`), the masteries by Innovation per turn, then Nuclear Fission and `FUTURE_TECH_AHEAD` 2 Future Techs (none while the strategy holds them back). `spaceRace` adds it as the `RESEARCH_RACE` entry; no Launch Pad comes before Rocketry (a pad standing, queued or offered means Rocketry is in: `padOffered`); a flight counts from the turn its mastery comes (`run.start`). Before, game 30's M35 forecast said 44 turns where 26 came, and pads went to weak cities. UI.log `victory work: race: …` once a turn.
    - **Purchases.** The AIRFIELD goal asks `siteHelps` like the purchase does (A2: game 30 held ~2,250 gold for ~20 turns for an Airfield the purchase kept refusing). A science site under way is bought at what it lacks, on `canStart(PURCHASE).Plots[0]` (A3: 1,600-2,100 idle beside half-built pads).
    - **The pad bank** (B1, `padGoals`): before Rocketry, K pads, K = the Preparation runs the race still needs after research, priced in the best producers, where `victoryPurchases` now buys them first; held as the gate's progress, and from `PAD_GATE_NEAR` 0.6 the whole bank from all the gold above the reserve (game 30: one pad's price held, 3,088 on Schoolhouses, one pad bought).
    - **Pads at Rocketry**: a queued pad goes ahead of a plain building with progress (B2, `padSlot`; UI.log probe), and near Rocketry a pad city starts no non-production building longer than Rocketry's turns (B3, `holdsPadRoom`).
    - **Sites when unlocked** (C1): the Airfield (Flight) and the Radio Station (Radio; a new `SCIENCE_SITES` row) are active once the building is unlocked, in cities without a pad, where `siteHelps` says yes.
      - **Only there are they sites** (`siteIn`; game 34): in a city with a Launch Pad standing or queued a project and a pad go ahead of one with progress (`projectSlot`, `padSlot`), a space city's plan does not queue one, and near Rocketry a city kept for a pad does not start one (`holdsPadRoom`). Game 34: the plan queued Radio Stations in Ньюкасл and Бирмингем five turns before Rocketry; after their pads, Launch Satellite and Preparation waited 6-7 turns behind them («slot 1 (final age)» every turn).
    - **Research after Rocketry** (C2): by Innovation per turn (`innovationStep`, core `rankInnovationResearch`): a mastery's own points plus a one-off it opens where that site stands or is queued; Flight's mastery wanted only with an Airfield (game 30 took it and Fission before the 2-point masteries).
    - **Exploration's end** (D1): with the science focus the BANK goal holds the free gold up to `carriedGoldCap("AGE_MODERN")` (Continuity 9,000, Regroup 3,000, × the GameSpeeds CostMultiplier: 4,500 at Online); purchases from all the gold still go first. It is floored and `sized`: `chooseGoal` does not check its reach again (game 32: rounded, it was dropped at E64-E69 and Modern opened with 420).
    - **Game 32's other fixes:** the economic overlay (GDP goal) acts only on a leader within `ECONOMIC_BLOCK_SHARE` 15% of our score, like culture's 30 points (a 972 Port was bought against 878 of 3,270); the near-Rocketry room rule never holds back a science site.
    - **The space push** (E1): Rocketry, every Innovation mastery and a standing pad: `settings.spacePush`, production ×1.5 and science ÷1.5 in `biasFor` (`SPACE_PUSH`; SPACE_PUSH once). Science then buys only Future Tech (3 for 5,000+) while 1,000 production is a 15-point Preparation.
    - **Preparation near done** keeps the front (E2, gotcha 20). **Socialism** (Public Works, +30% to every project) is a science civic goal once we are in the Communism branch (E3, `PROJECT_PRODUCTION_TRADITIONS`; no ideology is chosen for it).

66. **Cities for the science victory** (research/39; game 32: 4 cities all game, Rocketry at M47, lost to culture).
    - **Every age change turns every city but the capital into a town**, under Continuity and Regroup (`regressCitiesToTowns`, `age-transition-post-load.js:1040-1056`); the card «All your Cities from the previous Age remain Cities» (1 of 3 Wildcard points) brings them back when the dedications are confirmed (game 34; research/39 said turn 2). The player always takes it: «expect to keep cities» (`towns.expectKeepCities`) is on by default (settings v2 moves older blobs on), so Antiquity's and Exploration's last turns still convert.
    - **A new age's first turn is the cheapest window, until the dedications are confirmed** (only the capital counts: ~425 at E1 instead of ~1,475, ~525 at M1 instead of 2,500). While they wait, `convertBeforeDedications` (the hud, from `resumeAfterAgeChange`'s poll, once a turn) runs the window's conversions; the auto-resume itself comes after them (game 34: 5 cities stood at M1 when it switched itself on). `noteCitiesForNextAge` (every full pass) keeps the cities in the settings' game memory (`ageCities` = "AGE|x,y;…", gotcha 57); `lastAgeCities` opens the window while that is another age and fewer cities stand; `convertAtAgeStart` (the hud, after the defenders) converts the best towns that were not cities, from the gold above the reserve, one after another (each after the game counts the last: `becameCity`), up to `AGE_START_CITY_TARGET` (6 entering Exploration, 8 entering Modern) with the cities coming back. UI.log `conversion window: …`. The window runs for every victory focus, or none: science and economy up to AGE_START_CITY_TARGET, any other while towns outnumber cities, last age's cities counted back (gotcha 89). The remembered victory focus counts only with «Фокус на победу» on; otherwise only the 1:1 floor (gotcha 86). Game 36's M1 answered the probe: Глазго, converted for 1,050 before the dedications (2,500 after), stayed a city when the card's five came back (6 cities). **Gold for the window** (game 61: Antiquity's last turn bought two Granaries for 156, and Exploration's window had 71 gold above the reserve against Спахан's 550, 1,500 after the card): a non-final age's last `WINDOW_BANK_TURNS` 2 turns, with no conversion to make now and the window wanting a town next age, keep the cheapest town's price × `WINDOW_PRICE_MARGIN` 1.15 as a BANK goal (WINDOW_BANK, held whole: buyAgeEndItems uses only the free gold then), and the window spends all the gold, the reserve too (less `DEFICIT_KEEP_TURNS` of a deficit). Game 61's M1 converted nothing by design: the economic focus's target of 8 came back with the card and the three towns were KEEP. Game 62 (Deity): on A69 a conversion was listed but out of reach (115 gold against 487), which dropped the bank and left no goal; the bank now stays unless the whole treasury buys a listed conversion now. A war at our door with a major still frees the gold for defence (E68-E70: Confucius). **Only Antiquity's last turns convert a town now** (Exploration's window costs about the same: game 60's 950 both; game 61's 500 against 550); Exploration's last turns keep the bank even when the treasury buys a conversion (game 64: Хатинь bought for 3,000 at E139 while Modern's window costs about a fifth; Modern opened with 891).
    - **The autopilot switches itself on again** in the next age (`resumeAfterAgeChange`, option `autopilot.resumeAfterAge`, on): it was on at the last age's end (memory `apOnAge`, written every full pass; the player's own switch-off forgets it, an age's end does not), the next age is later, its first `RESUME_TURNS` 3 turns, and the dedications are chosen (no age choice holds the turn). Polled from `PlayerTurnActivated` and 5 s after load (timers `unref`'d in Node). The cards and dedications stay the player's.
      - **Switched on before the dedications** (game 33, E1 and M1: the player pressed «Включить» first): the pass stops for them (AGE_START) and arms `resumeOnChoice` for that turn, so it switches itself on again once they are chosen. Before, it stayed off until the player pressed again.
    - **Last age's cities are no conversion on the first turn** (game 33: Брэдфорд, a city in Exploration, bought for 150 at M1, and Манчестер the goal at E1): with «expect to keep cities» on, `conversionsFrom` leaves out the towns `lastAgeCities()` names while its window is open; the card brings them back once the dedications are confirmed, and a city bought first makes every other town dearer. When nothing fits, UI.log says `conversion window: none within N gold (<town> <price>, …)` (game 33's M1: ~1,000 a town against 714 above the reserve). Game 36's E1: Портсмут, the one town that was no city, cost 900 with 513 in the treasury; the player converted Брэдфорд, a city in Antiquity, by hand before the card for 225, which the card would have brought back. City ids are reassigned at an age change (Брэдфорд was city 196610 in Antiquity and 131073 in Exploration, Манчестер the other way round): match net_message_debug.log's `eCity` to a name within one age only; our own keys are locations (`sidOf`, `ageCities`).
    - **The conversion goal** (`goldPlan`): below the floor a CONVERT candidate is `anyHorizon` (game 32 had no goal at E1-E16: every town more than 12 turns of income away), and the chosen town stays the goal while it is listed (`convertGoalKey`; game 32 went back and forth between Liverpool and Leeds). `rankConversions` orders by `conversionValue`: max(production now, `PROD_POT_SHARE` 0.5 × potential) per gold (Leeds 11 for 1,087 before Liverpool 2 for 1,425).
    - **The science final age** has no towns > cities floor (`conversionRule({finalAge})`): a 2,500 city then makes ~20 production; `minCities` (a city per pad) still counts. The pad bank before Rocketry is `sized` (the horizon never drops it).
    - **Revolts** (game 32 lost Бирмингем at A61 in Antiquity's Revolts crisis; the game's `ADVISOR_WARNING_CITY_REVOLT` was only marked seen): a settlement in unrest, or below zero Happiness while a crisis is on (`revoltRisks`), buys the cheapest HAPPINESS-tagged building the game sells there from all the gold (`guardRevolts`, REVOLT_GUARD); UI.log `happiness: <settlement> N …: a revolt may take it` once a turn.
      - **A crippled settlement too** (game 35): at `CRIPPLED_HAPPINESS` −10 or lower (half its other yields gone: gotcha 45), and no wonder in its queue, it buys the cheapest Happiness building from the gold above the reserve, ahead of the savings goal (HAPPINESS_RESCUE; else UI.log `happiness: <settlement> N (P% of its yields lost): <building> costs C, G above the reserve`). Лидс stood at about −19 from M10 (six specialists at Modern's 6 Happiness each): 9 production and 14 science a turn instead of about 50 and 110, and it built its City Park at 9 a turn for 36 turns while 400-1,740 gold waited for a Launch Pad.
    - **Production for the space work:** production first runs before Rocketry in the cities `padExclusion` keeps for pads, against the pad and the runs the race gives them (`productionFirstStep(…, strategy)`); the space push is HALF (×1.25) from Rocketry with a pad standing or queued, FULL after the masteries (`spacePushNow().level`, `SPACE_PUSH_HALF`).
    - **Logs:** `conversions: none of N town(s) (floor …, healthy …: <city> −N); <town> <verdict> [cannot] [unrest]` once a turn when towns exist and none is listed.
    - **The district probe** (game 35: Modern's «Составная прибыль», 5 urban districts at 120+ for +50% production toward projects, stood at 0 of 5): UI.log `districts: N of 5 urban districts at <mark>+ (the game: c/t, <legacy>); best: <city> x,y total sNow/max, …` when it changes, at most once a turn, until the triumph is reached (`probeDistricts` in data/xpl-growth-job.js, `DISTRICT_TRIUMPHS`: Antiquity 30, Exploration 75, Modern 120). It shows whether our sum of a tile's yields matches the game's count, and how far the best tiles are.
67. **Armies: packed units unpack at a threat; far soldiers reinforce a commander's army there** (research/37 Phase 3).
    - **What our games have:** games 30 and 36 each had one commander with an empty army all game (`army: … unitCount 0`): the autopilot never packs, and the default Continuity age change packs nothing (gotcha 63). Packed armies come from Regroup, from the player, or from reinforcements, which arrive packed.
    - **The inventory** (`armyInventory`, each pass with «Оборона» or «Армия»): every land commander on the map with its army (`Armies.get(armyId)`: `localId`, `combatUnitCapacity`, 4 when unknown), its packed members (off the map with its `armyId`, not reinforcing) and the units on their way to it (`player.Armies.getUnitReinforcementCommanderId(unit, pid)` is its `localId`; `getUnitReinforcementETA` read as turns left, probe P-A3).
    - **Unpacking** (`unpackArmies`, before the defence plan): an army with packed soldiers within GUARD_RADIUS of a threatened settlement or a war front sends `UNITCOMMAND_UNPACK_ARMY` on the commander (canStart `{}` → Plots, then `{X, Y}`: the offered land tile nearest the raiders there, else the settlement), once a turn per army (`unpacking`, unit key → turn and settlement). Packed units cannot attack ("You must deploy your troops in order to attack"). Its members count as on their way there, a turn out (`guardDetail`), so nothing is bought for that settlement meanwhile. UI.log `army: <commander> at x,y unpacks N […] toward x,y for <settlement> (… tile(s) offered; probes P-A2, P-A5)`, or why it cannot (P-A6).
    - **Reinforcement** (`reinforcementFor` in `planDefence`, `reinforceArmy`): for a threatened settlement's or a front's lack (not an exposed town's holder), when our land commander stands there with room (capacity less packed, incoming and this pass's), a free soldier of the role wanted, idle, unhurt, with every move, on our land, at least `REINFORCE_ARMY_MIN` 6 tiles from the commander, travels off the map: `UNITOPERATION_REINFORCE_ARMY` on the soldier (canStart `{}` → the eligible commanders' tiles, then `{X, Y}` of ours, as the game's reinforce mode sends it). Only when the game offers that tile, within `REINFORCE_MAX_TURNS` 8 (its distance over its BaseMoves, plus a turn to deploy), and `REINFORCE_ARMY_GAIN` 2 turns sooner than any soldier walks there (no way on foot at all counts too). On its way it counts for that settlement with the ETA and a turn to deploy (`guardDetail`); it arrives packed and the army unpacks it. Log REINFORCE_ARMY; UI.log `reinforce: <unit> from x,y -> the army at x,y for <settlement>: about N turn(s) …, M on foot` and probe P-A3's ETA line each turn.
    - **Not built:** land transport by packing (research/37 §5C.4, a measured experiment), unpacking for an exposed town (its single holder leaves the army: gotcha 63), commanders walking to meet reinforcements on their way.

68. **Formations: the guards at a threatened settlement take better posts** (research/37 Phase 4; `core/xpl-formation.js`, `planFormations` in data/xpl-autopilot-units.js).
    - **Why:** `planDefence` fills each settlement's lack and stops, so once a settlement had enough guards they stood wherever they had arrived, a ranged one possibly out of range of every raider. Research/37 §6 meant to wait for a real war's `defence:` lines; game 36's showed only independents' raids, and the user asked for the phase anyway (19 October).
    - **Members:** the soldiers `guardDetail` counts as present at a threatened settlement with raiders in sight (melee and ranged), not a spare leaving for another post. One moves only when unhurt, with every move, awake or fortified by the autopilot (`restedByUs`; the player's own fortified soldiers stay), and the unit on the centre never moves.
    - **The value** (`formationValue`, `FORM`):
      - a melee unit of ours on the centre +100;
      - each melee unit next to the centre and nearer a sector's raiders than the centre is (a screen) +50, up to that sector's need: one a raider, at most 2;
      - terrain defence ×5 (Features and Terrains `DefenseModifier`: forest +2, marsh −2), and a melee unit next to more than one land raider −15 for each beyond the first;
      - a ranged unit with a raider (a ship too) within its `Range` +60, next to a land raider −40, +5 a tile from the nearest land raider up to its range.
    - **Sectors** (`sectorsOf`): land raiders within `SECTOR_LINK` 3 of each other come by one approach (single linkage): two opponents through one pass share it, one on opposite sides makes two.
    - **Moves** (`planFormation`): greedy, the best first, each worth `MIN_GAIN` 20 after a fortified unit's 15, one a unit, onto a tile free now (no swaps or chains: a tile left this pass is taken next pass), within GUARD_RADIUS and nearest this settlement (it stays its guard), on our land or nobody's, not water, a river, a mountain or a hazard, reached this turn (`pathTurns` ≤ 1); the most threatened settlement first. Logged as FORMATION_HOLD, FORMATION_SCREEN, FORMATION_RANGED.
    - **The commander** (`formCommander`, from `postCommander` once it stands within GUARD_RADIUS of its threatened post): the tile where its radius (1, +1 with Merit) covers the most soldiers (+20 each, at their tiles after this pass's moves; +5 on the centre), never onto a tile next to a land raider or onto water, with room for a commander (a soldier may share it), for `COMMANDER_GAIN` 40 or more (two more soldiers covered) and not within `COMMANDER_HOLD` 2 turns of its last formation move (game 38: 14,19 -> 14,20 -> 15,20 -> 14,20 on three turns in a row, the last for +20); FORMATION_COMMANDER.
    - **UI.log**, once a turn per formation: `formation: <settlement>: sectors N [k near x,y; …]; centre held by <unit> | not held; moves [<unit> x,y -> x,y ROLE +gain]; stay [<unit> at x,y (on the centre | hurt | moved | busy | the player's | ordered | no better post)]; commander <unit> at x,y -> x,y +gain | stays; N free tile(s)`.
    - **Not built:** a war front with no raider in sight keeps its staged guard (once raiders come within THREAT_RADIUS the settlement is threatened and forms); no reserve or room to retreat; only the ring next to the centre screens; no swap within a pass.

69. **The air wing: raids remembered, fighters rebased to cover, one ground attacker** (research/37 Phase 5; `core/xpl-air.js`).
    - **Why:** our games ended near Modern's middle before aircraft mattered (games 36 and 37: no plane of ours or a rival's at war), but game 29's Russian Bomber hit our centres M60-M65 while we had none, and Phase 1 trained fighters only where an Airfield covered an enemy plane in sight.
    - **Raids remembered** (`noteAirRaid`, from the game's `Combat` event; probe P-AIR-5 answered in game 36: its payload carries `attacker`, `defender`, `interceptor` and `antiAir` component ids): an aircraft of another player hitting a unit or a district of ours (`Units.get`, else `Districts.get` of the defender gives the tile). Our settlements within `RAID_RADIUS` 2 of it want cover for `RAID_TURNS` 10 (`airRaidTargets`), and they count for QUEUED_INTERCEPTOR with no enemy plane in sight.
    - **Cover wanted** (`steps.airCoverTargets`, passed to commandUnits as `airCover`): settlements hit lately (rank 1) and those an enemy plane in sight reaches from its base (2), a Launch Pad city among them first (0: the science victory needs an undamaged pad).
    - **Rebasing** (`rebaseFighters`, `planRebases`): each wanted settlement no fighter covers from where it is based takes the nearest spare fighter (one whose base covers no wanted settlement it alone covers, with its attack and moves, not rebased and arrived within `REBASE_HOLD` 3 turns) to a base covering it with a free slot that the game offers (`UNITOPERATION_REBASE`: canStart `{}` → Plots, then `{X, Y}`, as the game's rebase mode sends it). A rebase the game did not carry out (the plane not there the next turn) keeps that base off for that plane `REBASE_RETRY` 5 turns: re-planned, not resent. Log FIGHTER_REBASED.
    - **Bases** (`airBases`): Aerodrome Commanders (an Airfield's; intercept 3 +1, +1 after Flight's mastery) and now Squadron Commanders (3, +1 after the mastery).
    - **A ground attacker** (`groundAttackersWanted`, QUEUED_GROUND_ATTACKER; a bounded experiment): at most `AIR_ATTACKERS_MAX` 1 of ours and queued, while a settlement is a lasting front (threatened `LASTING_FRONT_TURNS` 3 turns in a row by land raiders or ships), in a city whose Airfield has a free slot within the plane's Range of that front, the strongest against units (RangedCombat, not table order: the Dive Bomber's 60 over the Trench Fighter's 55); never while fighters are wanted (cover first), never from a space city or one kept for a pad. No Airfield is planned for it. With an Airfield but none in reach, UI.log `air: no ground attacker for <front>: …` once a turn.
    - **Strike targets** (`airAttack`, `airTargetScore`): a raider next to a damaged centre (`CAPTURE` 4000: a capture to prevent), then an attacker within 2 of a settlement (`ATTACKER` 2000), then its damage (a kill), less 500 under an enemy fighter's cover (its base within 4: an interception), less a point a tile. Packed planes strike: `shootRaiders` takes aircraft off the map (Phase 1).
    - **UI.log** once a turn while we have an air base or a fighter: `air: bases [airfield|squadron x,y [planes] free N intercepts R; …]; cover wanted [<settlement> (why) covered by N; …]; rebases [<plane> x,y -> x,y for <settlement>]`; `air: <plane> of pN hit ours at x,y (Tn): …` for each raid; `air: <plane> was not rebased to x,y …`.
    - **Built later:** the preview before an air strike and an Airfield planned for defence (gotcha 81); Squadron bases, carriers and the commanders' Fighter Sweep / Ground Attack / Carpet Bomb (gotcha 82).

70. **The navy: ships attack the game's way, guard the coasts ships raid, and come from the same water** (research/37 Phase 6; `core/xpl-naval.js`).
    - **Why:** game 38's Бутооло (Modern) was bombarded by an independent's Frigates, which killed an Abambowa and two Field Cannons sent against them as anti-ship defenders; and our own warships very likely never attacked: `shootRaiders` asked them only for RANGE_ATTACK, which melee ships lack.
    - **Roles** (`navalRole`, `shipRole`): from the data a ship has in common, not its tags (Modern's light ships are LIGHT and SKIRMISH, not MELEE; the Mikasa is SIEGE, not RANGED): a carrier (`PROMOTION_CLASS_CARRIER_COMMANDER`), a Fleet Commander (`PROMOTION_CLASS_NAVAL_COMMANDER`), no warship (`CoreClass` not military: trade ships, treasure fleets), a SUBMARINE (`CanTargetLand` false), RANGED (Range 2+: Cog, Frigate, Dreadnought, Battleship, Mikasa) or a SCREEN (Range 1: Galley, Privateer, Ironclad, Cruiser, Destroyer).
    - **Attacks** (`shipAttack`, from `shootRaiders`): the game's own order (world-input.js): the naval attack first (`UNITOPERATION_NAVAL_ATTACK`: canStart `{}` → Plots, then `{X, Y}`, as the naval attack mode sends it; game 39 answered probe P-NAV-1: a Galley's became a melee fight, a Cog's its ranged attack), only when the game's preview says the trade pays (`strikeWorthIt`, as a land strike; the estimate without an answer), else a ranged shot (RANGE_ATTACK); hostile units within `NAVAL.STRIKE_RADIUS` 6 of our settlements, ranked by `airTargetScore`; a submarine never takes a land target. UI.log `naval: <ship> (<role>) at x,y: NAVAL_ATTACK n plot(s), RANGE_ATTACK n plot(s) (probe P-NAV-1)` once a session for each ship type.
    - **Naval guards** (`planNavalGuards`, commandUnits after the fighters' rebases): a threatened settlement with ships wants up to `NAVAL.GUARDS_MAX` 2 of our warships within GUARD_RADIUS on the water, those there and those sent (goal `{guard, naval}`) counted; the free warship (awake or rested by us, damage below 30, every move, not guarding another such settlement) that reaches a post soonest by its own path within `POST_MAX_TURNS` 6 sails there (`navalPost`: water or a navigable river, free; a lake ship has no path: reach is a path, not a circle). NAVAL_GUARD; UI.log `naval: <settlement>: ships N; warships there […], coming […]; sent […]; n free warship(s)`. Warships are no land guards (`guardDetail` counts land units): the coast keeps its land holder.
    - **Training** (`warshipsWanted`, QUEUED_WARSHIP): a settlement threatened by ships `LASTING_FRONT_TURNS` 3 turns in a row wants up to `NAVAL.SHIPS_MAX` 2 warships, ours within 10 and those queued counted, trained only in a city on the same water (a water tile next to it in an area of a water tile next to the front: `GameplayMap.getAreaId`), the best ranged ship it can build (RangedCombat), else the best screen; never in a space city. The city where it arrives soonest (its queue's wait, `turnsUntilFree`, its training and its sailing), within `DEFENDER_ARRIVAL_TURNS` 16, and while the front lasts it moves up its queue like other wanted units (`frontLoadUnits`; `isMilitary` leaves ships out). Game 39: Мотия's Cog for Севилья, the nearest city on the water, waited at the end of its queue behind the Tomb of Askia, a Bazaar and a Sawmill E29-E49, after the raids had ended (E36). None: UI.log `naval: no warship for <front> …: no city on that water can train one` or `none arrives within 16 turns (<city> Nt, …)` once a turn.
    - **The loop:** a unit ordered before the unit loop (an army's unpacking, a fighter's rebase, a warship's post) or by a neighbour's room-making is left alone (before, an unpacking commander could be sent to its post as well).
    - **Not built:** a fleet's assembly, escorts, naval formations, ship upgrades by mission (Fleet Commanders' focused sea attacks and carriers: gotcha 82; land guns out of ships' reach: gotcha 78).

71. **Campaigns: our own settlements retaken, behind «Наступление»** (research/37 Phase 7; `core/xpl-campaign.js`).
    - **The setting:** `autopilot.offensive`, off by default (the user's decision, 18 October: defensive), and it works only with «Оборона». Off: nothing of it runs, a running campaign ends (WHY_OFF), and peace is sought as before (`seekPeace` / `answerIncomingDeals` never consult the intent). Never a war of its own, never a settlement that was not ours.
    - **The game's rules** (research/37 §9, the agent's report of 20 October; Civilopedia 210, 216, 1478, 1915): a settlement falls when its centre and every walled (fortified) district are occupied; a district must be at 0 health first, and a unit moving onto it occupies it; districts heal only with no enemy on or next to them and no recent attack. A settlement of ours retaken is liberated (no unrest); the game asks raze or keep (`NOTIFICATION_CONSIDER_RAZE_CITY`, `city.isJustConqueredFrom`), and we may not raze one we founded.
    - **Targets** (`lostSettlements`): another player's cities whose `city.originalOwner` is us (the game's own record, as its city banners and peace screen read it), while we are at war with that player, within `CAMPAIGN.REACH` 10 of one of ours, the nearest first; a target given up waits `RETRY_TURNS` 10. If another enemy takes it, the campaign follows it.
    - **The start** (`startCampaign`, in commandUnits after the defence plan: defence first): our settlements safe (`homeUnsafe`: no centre damaged, every threatened one guarded or guards sent), no victory of ours near but the military one (`victoryNear`: the watch's `own` entries), a staging tile 3 from the target (land, free, no hostile soldier next to it, nearest our settlements), and enough of the soldiers defence leaves free (its supply less its posts: not a front's, not a spare leaving a threatened settlement, not the player's fortified, not packed) reaching it within `GATHER_TURNS` 8: `forceEnough` (2 melee, 3 in all, 2 more than the enemy soldiers within 3, our best no weaker than theirs less 5). A land commander not posted at a threatened settlement leads it. CAMPAIGN_STARTED; members carry the goal `{campaign}`, so defence and roaming leave them alone.
    - **Gathering and the assault** (`moveCampaign`, sent before the unit loop): members walk to tiles next to the staging tile; once all have arrived (or after `GATHER_MAX` 8 turns with the minimum) the assault starts (CAMPAIGN_ASSAULT): melee members go next to a district still to take, ranged and siege ones within their range of one, the commander within 2 of the centre where its radius covers the most. The attacks (`campaignAssault`, the hud's strike step and again after the unit step): ranged and siege members shoot the standing district with the least health they are offered (RANGE_ATTACK, DISTRICT_SHOT), melee ones attack one next to them when the game's preview says it pays (`districtStrikeWorthIt`: they keep 40%, and deal at least what they take or bring it to 0; DISTRICT_STRUCK), and a member next to a district at 0 moves onto it (MOVE_TO with ATTACK, as the map sends it; DISTRICT_TAKEN). A settlement taken is kept (`keepRetaken`: CityCommands DESTROY `{Directive: 2}`, the capture chooser's Keep; CITY_KEPT).
    - **The end** (`campaignEnd`, reviewed before the defence plan each pass, so the soldiers go back to it in the same pass): DONE (ours again), GONE, PEACE, OFF, VICTORY, LATE (`MAX_TURNS` 25), STALL (`STALL_TURNS` 5 without less health in the districts or one more of them ours), FORCE (fewer than 1 melee or 2 members), HOME (the defence plan runs again with them). A member hurt `HURT` 50 leaves; one hurt 30 escapes or heals as usual.
    - **Peace** (`peaceIntentFor`, core `peaceIntent`): CONTINUE only during an assault on that leader's settlement with progress within `PEACE_HOLD` 3 turns and at most `PEACE_MAX` 8 turns after it began: `seekPeace` proposes nothing to that leader (PEACE_HELD once a campaign), `answerIncomingDeals` refuses a peace that does not give the settlement back (`judgeDeal`'s `gives`) and takes one that does.
    - **The commander's promotions** (`commanderProfile`): MOBILE (Initiative, Mobility, Quartermaster, Regiments, Rout, Storm, then the defensive order) while it leads a campaign or after a mobile promotion, unless it already took a defensive one (a veteran defender keeps its profile).
    - **UI.log:** `campaign: <GATHER|ASSAULT> <settlement> of <leader> at x,y: staging x,y; members […]; districts [x,y health/max (ours)]; enemies near N (best S); turn T of 25, assault since …, progress …; commander <type> x,y XP e/n` once a turn; `campaign: none: <why>` once a turn while a target exists; `campaign: <settlement> of <leader>: <REASON> after N turn(s)`.
    - **Not built:** transport by packing (§5C.4), limited advances on settlements that were not ours (§9D: the riskiest; recapture first), a spending limit (it trains and buys nothing), war weariness, more than one campaign at a time.

72. **After the win nothing chases a victory; playing on builds everything** (game 40; research/game40; `victoryOutcome` in core/xpl-victory-focus.js).
    - **Seen in game 40** (science, won at M55): Innovation stood at 107 of 100 from M49 and the countdown ran, yet 1,518 production went into Preparation, the Radio Telescope, a satellite, a flight and two Launch Pads, the pad bank held 764 gold and bought a pad for 252, Future Tech was researched twice with four Modern masteries left (the game's advisor's pick), and the military lever sent settlers for a second victory to M53. Played on («Ещё один ход», `EXTEND_GAME`) M55-M102, it went on: Innovation 117 → 309, pads bought for 1,208 and 1,320, Future Tech four more times.
    - **The outcome** (`victoryOutcomeNow` in data/xpl-victory.js, every pass): WON, the game awarded a victory to our team (`Game.VictoryManager.getVictories()` → `{ victory, team, place }`, as the end-game screen reads it; `gameVictories`); DECIDED, another team's, or `isExtendedGame`; SECURED, our own countdown runs in a fixed-score race (science: nobody's score moves its goal) with its goal reached and no rival's countdown ending sooner (the same turn shares the first place: game 16); OPEN otherwise. A dominance countdown of ours is never SECURED: the second place may still rise past its share.
    - **Not OPEN** (`s.afterWin` = the state, also `unitOptions.afterWin`): the pass has no focus (WON and DECIDED do not even score the paths), so no strategy, victory work, lever, pad bank or space push: the player's own profile with the NONE balance. The projects that serve only a victory (`VICTORY_ONLY`: the science projects, the Radio Telescope, Operation Ivy; not Launch Satellite, nor the Launch Pad, a building of +18 Science) leave the queues, one a city a pass (`dropVictoryWork`; alone in its queue, the plan's next building or the cheapest is appended first), and an empty queue never takes one (the advisor's `fits`, the last resort's `skip`). Research takes every other technology, civic and mastery first, the advisor's among them, else the quickest; a repeatable node (Future Tech, Future Civic) only when nothing else is left (`chooseResearch`). That rule holds in every game, not only after the win (game 41: Rome's Exploration took Future Civic, the advisor's pick, three times while Rome Reborn, Syncretism, Hierarchy and two masteries waited; each Future Civic also advances the age); the path's own choices (a gate, Innovation, the bonus research) still take a repeatable node on purpose.
    - **Playing on** (the user, game 40), also while SECURED:
      - **Every building:** the building plan places every building on its best tile, gain or not (`placeEvenIfNegative`; the greedy step's best is then the least loss, after every building that gains; `everything` in `inputSignature`, so the change is a full plan); an empty queue takes the plan's next, then any building left (`QUEUED_REMAINING`, the cheapest first, on the plan's tile or the game's best of the tiles the plan leaves free) before the advisor's units and projects. Purchases buy the plan's buildings with the free gold as always (`rankPurchases`: by value per gold; one with no net yield is left to production).
      - **Wonders:** `AFTER_WIN_WONDERS` 3 at once, and a race only its length makes LOW (no rival seen or queued: `LOC_XPL_WONDER_R_SLOW`) counts at `SLOW_RACE_FACTOR` 0.4, up to `AFTER_WIN_WONDER_TURNS` 30; a race a rival is ahead in never (a lost one still returns half and the cash-out guards it). No city is kept for a Launch Pad (no strategy).
      - **Conversions:** past the 1:1 floor a CONSIDER town (a slow payback) converts too (`AFTER_WIN_VERDICTS`, `conversionRule({ afterWin })`); a feeder (KEEP) or one to grow first (WAIT) stays a town. The gold plan saves for them (CONVERT goal).
      - **The map:** once WON or DECIDED, Launch Satellite once (`launchSatellite`: REVEAL_TYPE_ALL, MaxPlayerInstances 1), at the end of the queue of the Launch Pad city that runs it soonest (its turns plus the item in production's). Explorers dig the artifacts left with «Разведка» as before; with no strategy they are trained again (up to 2).
    - **Defence is unchanged:** the science victory needs its Launch Pad undamaged through the countdown; a damaged pad very likely stops the countdown (its prerequisite, `REQSET_MODERN_VICTORY_SCIENCE_PREREQ`; not seen yet), the outcome is then OPEN again, and the victory work and repairs come back.
    - **Logs:** UI.log `outcome: <STATE> (<class>, N turn(s) left), was <STATE>: …` when it changes; the tab's VICTORY_SECURED, VICTORY_WON, GAME_DECIDED, VICTORY_WORK_DROPPED, QUEUED_REMAINING, SATELLITE_QUEUED.
    - **Not built:** switching itself on again after «Ещё один ход» (it still switches off at the victory), peace with everyone, the army's upkeep.

73. **What research/40 found the autopilot left on the table** (research/40-hidden-value.md, its five notes; the game-41 session's
    audit, built in the next one).
    - **Structural research first** (A1; core/xpl-research-value.js `pickStructural`, steps `structuralStep`). The game's advisor
      names only MILITARY, CULTURE, SCIENCE and ECONOMIC nodes (advisory.xml): 101 of 106 Test of Time nodes, every
      Exploration civilization tree, Irrigation, Entertainment and Globalism came last (game 41: Rome Reborn waited from E1 to
      about E60). A node whose next research gives a tradition slot, a specialist cap (1 for science, else 0.5), a syncretic
      choice, a city limit or a settlement cap with `CAP_ROOM` 2 or fewer settlements of room (1 each; by the modifier's effect,
      `modifierEffect`, else its name) goes before the advisor's pick, the most per turn within max(8, 2 × the median node's
      turns), and before the path's own research when no slower (or within `STRUCTURE_QUICK_TURNS` 3); a gate keeps its way
      first. Unlock rows that need a trait count when the trait is ours (`rowOurs`, `ourTraits`: Hierarchy, Foundation,
      Administration). Every age's specialist cap is the science path's (`/SPECIALIST_CAP_INCREASE$/`). UI.log probe P-RES-1.
    - **Religion** (A2, A3, B1, C). `REQUIREMENT_CITY_FOLLOWS_RELIGION` and `…_IS_DISTANT_LANDS` are settlement tests of the
      card valuation (Tolerance, Zeal, Liturgical Disputes, Schism, Jizya); `EFFECT_CITY_DAMAGE_CONSTRUCTIBLES` is −15
      production a building (`DAMAGED_BUILDING_PRODUCTION`: Ius Reformandi, slotted in game 41, goes last). Pantheons and
      beliefs by our empire's numbers (core/xpl-religion.js `PANTHEON_YIELDS`, `BELIEF_YIELDS`; choices `pantheonFacts`
      projects tiles to the cap and 2 quarters a city; `beliefFacts` counts every settlement of ours as a follower). Missionaries
      (data/xpl-missions.js): trained where the game allows (a Temple) while 2 of ours do not follow (QUEUED_MISSIONARY, up to 2,
      by charges), each converts the most urgent (the crisis's unhappy ones, then those of no religion, then others; from a district: the urban half from an urban one, the rural half from a rural one (gotcha 90)), then the city-states we are suzerain of; none while Ius Reformandi is
      slotted (`iusReformandiActive`), none trained in an age's last 8 turns, and a tile or settlement the game refuses is left a
      while (gotcha 74). Religion reads: data/xpl-player-facts.js `ourReligion`, `followsOurReligion`.
    - **Diplomacy** (A4, B6, B7): endeavors from the game's offer (`endeavorsOffered`, `ENDEAVOR_VALUE`: Lafayette's Reform
      100, the priority's own +10), to a leader not approached this age first (`endeavorTargets` in the settings' game memory:
      Gregarious Animal); `startReforms` and `sabotageSpace` (a science rival at WATCH or DANGER) whatever «Дипломатия» says;
      a leader's Reform is supported; the science (culture) focus steals a technology (civic) from the Neutral-or-better leader
      with the most science (`STEAL_FOR_FOCUS`, one at a time); city-states we are suzerain of (`player.isMinor`,
      `Influence.getSuzerain()`): `levyDefenders` (the strongest soldier of one within 8 for a threatened settlement short of
      guards against land raiders; args `Unit` = targetList2's targetID) and `incorporateCityState` (while settlements count and the cap has room).
      Diplomatic actions start through `startAction` (the panel's quick start).
    - **Units** (A5, B4, C): merchants with any focus when trade pays us (`tradePays`); our civilization's great people one at a
      time within 8 turns (`isOurGreatPerson`, QUEUED_GREAT_PERSON) and activated where the game lists them
      (`unit.getActivationPlots`, `useGreatPerson`, probe P-GP-1); a Legatus with a land-claim charge (canStart(FOUND_CITY,
      …, true), the panel's own test) founds a town on a known site in peace (`commanderSpecial`, probe P-LEG-2); a commander
      converts independents (`UNITOPERATION_CONVERT_BARBARIANS`), finishes a raider hurt 50+ (COMMANDER_ATTACK) or sets a
      Defensive Perimeter; a merchant in a city builds a road to a town of 7+ with no city connected (`roadToTown`).
    - **Production and towns** (A6, B5, B8, C): Factory Town (FOCUS FACTORY, `FACTORY_GOLD` 4 a factory resource; the
      economic final push leans to it); unique improvements paying back within `UQI_PAYBACK_TURNS` 15 on a tile the plan
      leaves free and no other order takes, never next to its own kind when `SameAdjacentValid` is false, a cancelled order's
      tile off 20 turns (`queueUniqueImprovements`, probe P-UQI-1; gotcha 74); a town plans what the game's PURCHASE answer lets it buy
      (building-job `townSelection(sid)`); growth takes resource tiles with any focus when resources pay us (`resourcesPay`);
      Inca mountains are workable (rules `mountainsWorkable`) and a natural-wonder trait values them in sites
      (`naturalWondersValued`).
    - **Legacy** (B2, B9, C; core/xpl-legacy.js): Exploration's 16 Homeland settlements (a triumph: +2 cap in Modern) within the
      cap's room buys and saves for settlers (`settlementMilestoneNow`), not in its last 5 turns, one a pass; legacy path
      milestones count nothing in this game version, so B3 (another path's first milestone) and Antiquity's military path are
      gone (gotcha 74); the culture focus's research levers (wonders, relics, archaeology, museums; Future Civic as its bonus);
      a crisis story's option with the crisis tag +3; the Autopilot tab's triumphs under way in an age's last turns
      (`legacySummary`). UI.log `legacy: triumphs …; settlements N/cap; age P/max (+d …)` once a turn (probes P-INC-1,
      P-AGE-1), `legacy points at the age change` (P-LEG-1), `reform: …` (P-REF-1).
    - **Future Tech's clock** (A7): each adds 10 age points (`FUTURE_AGE_POINTS`, HumanOnly); in the final age the race plans and
      the path takes one only when done before the end it brings nearer (`futureClock`, `futureInTime`).
    - **Not built:** Gaul's spacing, Nepal's Sherpa, converting rival settlements (opt-in), leaders rewarded for conquest (the
      defensive decision).
74. **One order per tile; legacy paths count nothing; blocking settlers are bold** (games 42-43; research/game42, research/game43).
    - **One order per tile** (`tileTaken`, `notePlotOrder`, `plotOrders` in data/xpl-autopilot-steps.js). Game 42 lost three
      wonders at 100% (Battersea Power Station twice, Doi Suthep; ~2,400 production): each crossed its cost (757 of 750, 830,
      843) and never completed after a Pairidaeza of ours was queued on its tile (a repair 50 s before Battersea in Парса; the
      unique improvement step in Гордион, once in the same second), while the growth step placed citizens on 32,36 under a wonder
      "in production"; the same wonder on a tile with no other order completed (Doi Suthep at 43,35), and no rival's building
      or wonder ever stalled in 16 games. The production list hides what is queued (production-chooser-helpers.js); our BUILD
      with X, Y did not check. Now no order goes to a tile a queued item of ours targets (the queue entries' `location`, as the
      game's placement manager reads them), one ordered this turn, or one a wonder of ours was ordered on: `orderWonder` tries
      the next tile (UI.log `could not order …: x,y: <type> is queued there`), `queueUniqueImprovements` and the repair step skip
      it, and growth places a citizen under a queued wonder only when nothing else is offered (a new citizen holds the turn).
    - **A stuck wonder** (`unstickWonder`): once it leaves the queue, all it holds goes into the item in production and what
      exceeds that item's cost is lost (game 42: a Military Academy got 1,110 of a 441 cost). The building that keeps the most
      goes ahead (`bestAbsorber`, as the cash-out of a lost race), else the plan's or the costliest is queued to go next pass.
      `probeStuckTile` writes once a turn what stands on its tile, the game's answer there and every queued item's tile.
    - **Legacy paths count nothing in this game version.** `player.LegacyPaths.getScore` read 0 for every path in every age of
      games 42-43 (the game's own victory-manager.js reads it the same way) while triumphs came (Player_Legacies.csv), and every
      age lasted 70 turns at one point a turn: no path milestone moved the clock. So `legacyStandings` is gone; the victory focus
      scores the victories' own points (core `raceStandings`: no class has a goal until every dominance race has one, then the
      game's goals; with none each is scored by its lead over the best met rival, against at least `LEAD_FLOOR`), and the focus
      may change only in an age's first `FOCUS_CHANGE_SHARE` 15% (`chooseFocus(…, {mayChange})`; replayed over both games'
      races, mid-age switching would have taken game 43 off the economy that won it at A41 and back at E36). The off-focus
      milestone wants (research/40 B3: a wonder's +8, a codex's research, district specialists, all on all game) and the
      Antiquity military milestone are gone; the Homeland triumph (16, a real triumph) stays, not in Exploration's last
      `MILESTONE_LATE_TURNS` 5, one settler a pass (`buySettlers` and `buyGoal`: game 43 bought two at E69). The tab's legacy
      summary and UI.log's `legacy:` line show the triumphs under way (core `triumphsUnderWay`, `triumphLine`).
    - **Blocking settlers are bold** (`asSettler` sets `ctx.bold` with the strategy's settleAnywhere). Game 42: Tubman's
      military countdown won at M62 while two settlers stood ~25 turns with room for 6 under the cap: 4-5 of 7-8 sites
      «DANGER», 2 «FAR»; one or two settlements would have raised her goal past her 79. Under a countdown to block or to start:
      only live hostile units are danger (`dangerNear` leaves out the hit and loss marks), a walk up to `BOLD_MAX_TURNS` 15,
      «settle anywhere» after one idle turn (`ANYWHERE_IDLE_TURNS` 1), and a settler is bought with no safe site known
      (`settlerOffer({anywhere})`). The `settler: no order` line names what makes the sites dangerous (`dangerWhy`: the units'
      owners, or "marks").
    - **Also:** a Missionary the game refuses on a tile keeps off it `MISSION_REFUSED_TURNS` 10, and off a settlement refused
      twice (game 43: one walked 73,20 ↔ 74,20 E55-E69; UI.log `mission: … refused: …`); none trained in an age's last
      `MISSION_LATE_TURNS` 8; a unique improvement that may not stand next to its own kind (`SameAdjacentValid` false:
      Pairidaeza, Stepwell, Caravanserai) keeps off its kind's neighbours, standing, queued or ordered, an order gone unbuilt
      keeps its tile off `UQI_RETRY_TURNS` 20 (game 42 ordered one tile of Парса seven times), `OnePerSettlement` once a
      settlement; a levy only against land raiders (game 42's five answered ships), the city-state named by its city.
    - **Kept as it was:** city-states' unique improvements (Shore Battery, Hillfort, Kasbah) count as ours when a suzerain
      bonus makes them buildable (`ourUniqueImprovements` reads `TraitType` only).
75. **Some engine calls crash the game itself; `safe()` cannot catch that** (20 October, game 44: research/game44).
    - **Seen:** our first Missionary of the game finished at E20, and on its first order the game crashed (`AppCrash` in
      Telemetry.log; the minidump in `Base\Binaries\Win64\Civ7_Win64_DX12_FinalRelease.exe.dmp`: an access violation reading
      0x60 at `exe+0xdd0bba`, called from v8 and cohtml, i.e. from UI script). `spreadReligion` had just called
      `unit.getActivationPlots("UNITOPERATION_SPREAD_RELIGION", false)`: it takes a unit command (`UNITCOMMAND_*`), and the game's
      unit panel asks only after `unit.shouldShowActivationPlots(command)` (unit-actions.js). Asked for an operation it reads a
      null definition. A native crash kills the process: a JS try/catch never sees it.
    - **The rule:** call an engine function only the way the game's own UI calls it (the same kind of argument, the same guard
      first); grep the base game's UI JS before using a function new to us. `useGreatPerson` now asks `shouldShowActivationPlots`
      first; `spreadReligion` uses our own tile rule. The fake engine records a `getActivationPlots` call with anything but a unit
      command in `world.crashes` (and throws), which the Missionary tests check.
    - **Reading a crash:** the game writes the minidump above (overwritten by the next crash: copy it), Telemetry.log ends with
      `PublishAppSessionStatusTelemetry: AppCrash`, and net_message_debug.log's last SEND with no RECV is what the game was handling;
      scratchpad crash1/mdmp.py reads the exception and lists the module frames on the crashing thread's stack.
76. **Research for its policy cards** (20 October, game 44 E53: the user). Reformation, 2 turns away, unlocks Religious Orders
    (+32 Culture, +52 Happiness in our settlements following our religion, by Policy Yield Previews) and Rationalism (+19 Gold,
    +10 Science), each worth more than the weakest cards slotted; the culture focus walked the main tree toward Future Civic
    (+7 culture points each) and Reformation, a branch civic the game's advisor never names, came last (E61). The game's own AI
    puts Theology and Reformation first on Exploration's culture path (victories.xml
    `LegacyPathStrategyCultureFilledProgressionTreeNodeBiases` 1000).
    - **The rule** (steps `cardStep`, core `pickCardResearch`): a node's new cards are valued as the policy step values cards
      (choices `cardGains`: `cardValue`, Policy Yield Previews previewing a card not unlocked yet, as its civic tooltips do; the
      slotted ones at what taking them out would cost), each against the weakest card it may replace (core `cardSwapGain`: a free
      slot 0; a tradition card only a tradition slot, a policy card any; only swaps the policy step would make, `swapWorth`).
      The node winning the most a turn of research, at least `CARD_GAIN_MIN` 10 and slotted `CARD_USE_TURNS` 5 before the age
      ends, goes after the structural node and before the path's research when no slower than it (or within
      `STRUCTURE_QUICK_TURNS` 3), before the advisor's pick always; a gate keeps its way first. Crisis cards, cards unlocked
      already and cards of unknown value count nothing; without Policy Yield Previews nothing changes.
    - **UI.log:** `research: <node> for its cards (N turn(s)): <card> v over <card> w, …; +G a turn`; the tab's CARD_CIVIC /
      CARD_TECH.
    - **Not valued:** what the previews cannot see (Evangelism's missionary charge and movement), the diplomatic action a civic
      unlocks (Reformation's Conversion of the Population).
77. **The plan orders only on tiles the game offers; a stuck item leaves the queue** (game 45: research/game45).
    - **Seen:** four buildings stood at 100% and never completed, about 1,700 production: Экбатана's Monument (281 of 67,
      A50-A69), Патрагада's University (825 of 437, E59-E70), Кадис's Granary and Памплона's Grocer (1,232 of 267, M10-M41).
      All four were the plan's orders (`queueNextBuildings` → `orderAtTack`), each the second building on a tile whose first
      one had been bought; but 37 other such tiles completed, and 38 tiles with two of our queued buildings too. No AI city's
      item stood past its cost on consecutive turns. The cause is not proven.
    - **Offered tiles only** (`tileOffered` in data/xpl-tack-orders.js): the game's placement screen lets a player click only
      the tiles of `canStart` without a tile (`Plots`, `ExpandUrbanPlots`: building-placement-manager.js
      `isPlotIndexSelectable`) and then sends X and Y; `orderAtTack` asked only `canStart` with X and Y. Now it refuses a
      tile the game does not list for that building (UI.log `not queued: <type> at x,y: the game does not offer that tile for
      it now`), as the plan's queue, its purchases and the Buildings tab's buttons go through it; with no tile listed at all
      the X and Y answer decides. The plan's outer tiles are ordered once their connector stands.
    - **A stuck item** (gotcha 20): the item moved ahead of it is never its own type, an item on its tile or another stuck
      one; queued to go ahead, never one already queued (`cheapestBuilding` skips `InQueue`; game 45: Памплона's Grocer got
      a second Grocer on its own tile and the two swapped places 24 times). One stuck `STUCK_DROP_TURNS` 3 since it first
      stood at 100% leaves the queue (`dropStuck`, QUEUE_STUCK_DROPPED; wonders aside: `unstickWonder`), and that building
      keeps off that tile `STUCK_TILE_TURNS` 20 (`stuckOff`: `pickPlot`'s `blockedPlot`, the plan's queue skip). One found
      stuck is stuck again at once when it is back at the front (`stuckFirst`).
    - **One order per tile** (gotcha 74), more of it: walls go to an offered tile no other order of ours takes, the centre
      first (Экбатана's walls were queued on its Monument's tile ten seconds after it); `pickPlot` never takes a tile a wonder
      of ours or a stuck item stands on (the callers no longer fall back to the first tile: `bestLocFor`); the plan's orders
      of a pass are noted on their tiles (`notePlotOrder`), as the queues show them only next pass.
    - **The stuck probe** (UI.log `queue: <city>: stuck since …`) now says whether the game offers that tile (`offered yes|no
      (N tile(s))`): the next game shows whether a stuck item still comes from a tile the game does not offer.

78. **Research/41 Phases 0-1: long log lines, the -3 befriending, commander and war probes, ships' reach** (21 October;
    research/41-generals-training-wars.md, its notes in research/41-notes/).
    - **UI.log cuts every line at 1,022 bytes** (not characters), its time stamp included. `log` (services/xpl-log.js) splits a message longer than `LINE_MAX` 950 bytes into numbered parts (`… [2/3]`) of at most 950 bytes each, never inside a character (`utf8Length`: Cyrillic takes 2 bytes, `…` 3). Game 60's Modern `economy:` lines stopped at 1,022 bytes, which was 904-909 characters of Russian names, so none of them was split. The `commander parameters:` line stopped at `EXPERIENCE_MAX_LE` in every game before.
    - **Befriend status -3 is `PROJECT_NO_VIABLE_TARGETS`, and also "not enough Influence"**: the game has no other status for
      that (the executable's enum: -4 SINGLE_INSTANCE_RUNNING, -3 NO_VIABLE_TARGETS, -2 NOT_UNLOCKED, -1 BLOCKED, 0 AVAILABLE,
      1 ACTIVE; game 44: -3 with "not enough Influence 71/180"). When the project lists the village at a price above our
      Influence, the Influence is kept for it (`befriendIndependents`' `short`): no endeavor meanwhile, no unit sent. With no
      target listed (an unseen village) it stays not befriendable now (gotcha 42). Before, -3 counted as "cannot befriend" and
      endeavors took the Influence (15-50 `status -3` lines a game in games 42-47). Unless its FailureReasons name LOC_DIPLOMACY_ACTION_FAILURE_NO_VISION, nothing is kept and a unit approaches the village (gotcha 90).
    - **Probes** (UI.log): `xp: <commander> … level L, XP e/n, promotions P (points, commendations)` when it changes, a defeat
      showing `onMap=false` (P-XP-2, P-DEATH-1); `xp: combat T…` for each fight of ours within 2 tiles of a land commander, with
      the opponent (independent or major), attacker or defender, ranged, and the commander's XP then (the `Combat` listener);
      the parameter line with `COMBAT_FOCUSED_ATTACK_*` and `UNIT_PURCHASE_MULTIPLIER` (P-XP-1); `war probe: p<id> …` for each
      met major at peace when it changes (P-WAR-1: the declare-war popup's `canDeclareWarOn` with and without FORMAL_WAR,
      `getTotalWarSupportBonusForPlayer` / `…ForTarget`, `getWarInfluenceBonusTarget`) and `war probe: stats T…` every 10 turns
      (P-STAT-1: production and gold a turn, settlements, land soldiers all and seen, best melee). Only reads the game's own UI
      makes (gotcha 75): not the executable's `Stats` getters that no screen calls. P-A5 waits for Phase 3 (we never pack yet).
    - **Ships' reach** (games 30-47: ships killed 29 of the 56 land units we lost, 18 scouts and 11 soldiers, each within a
      ship's reach; Field Cannons sent against Frigates in game 38).
      - **The rules** (core/xpl-naval.js): `inShipReach` (within the ship's moves + range, and within its range of its own
        water: `GameplayMap.getAreaId`; never the engine's reach of an enemy unit), `outGuns` (Bombard ≥ the strongest hull's
        Combat, ×1.2 with two ships or more; Combat ≥ each ship's attack - 10, - 5 against a Range-1 ship), `outRanges` (Range
        beyond each ship's: a Ballista shoots a Galley from two tiles inland), `fightsShips` (either). Mortars and Heavy
        Artillery fight Frigates; Field Cannons, Field Guns and Slingers do not.
      - **`GameplayMap.getAreaId(x, y)`** takes x and y, as the game's UI calls it: game 49's `getAreaId(index)` was refused
        six times ("Argument conversion failed"), so every ship's water body was unknown (all water counted as its own).
      - **Data** (units.js): `hostileShips` (visible hostile warships, read from the players' unit lists once a pass),
        `shipsReaching`, `shipThreat(loc, def)` (the ships in reach it does not out-gun).
      - **Against ships alone** only a unit that fights them counts as a guard, is sent, bought or trained (`guardDetail`,
        `planDefence`'s picks, steps `shipsToOutGun` → `bestRangedOrder({outGun})`, `cheapestDefender`); none: UI.log
        `defenders: none for …: no land unit on sale here out-guns or out-ranges their ships`. With land raiders too, a ranged
        unit still serves against those. Threats carry `shipStats`.
      - **Posts** (`postFor`) off the centre within reach of a ship the unit does not out-gun come last (`SHIP_POST_PENALTY`);
        the melee holder takes the centre anyway. **Formations:** a ship is a ranged member's target only when it fights ships,
        `FORM.SHIP_REACH` -80 for each ship in reach it does not out-gun (the centre's melee holder aside), the commander's
        tile too.
      - **Hurt units and scouts:** a hurt soldier within a ship's reach steps away before it heals, at its post too; `stepAway`
        prefers tiles out of ships' reach (unless that is next to a land raider); a scout in a ship's reach steps away.
    - **An empty, damaged centre is held:** `FORM.HOLD_DAMAGED` 200 (a melee unit screening two approaches next to it was
      worth as much as holding it), and a hurt melee member (damage below `HOLD_HURT_MAX` 70) next to it may step onto it,
      and only onto it (`onlyCentre`). Games 37-47 had 11 such `formation:` lines, centres at 20-65%.
    - **Naval guards:** the `naval:` line says why each free warship stayed (`not sent [<type> at x,y (not needed | no path |
      no free water tile | N turns)]`): 46 of 186 such lines in games 37-47 sent none and said nothing.

79. **Game 48 and research/41 Phase 2: settle near, fronts facing an army, peace asks back, the plague, two generals** (21
    October; research/game48, research/41 §4). Lost to Tubman's culture countdown; one settlement until A21; Киото lost at A59.
    - **Settle earlier and closer** (game 48: the first settler went for 9,31, then 19,31, then 17,46 and founded at A21).
      - Below `NEAR_SETTLEMENTS` 3 a settler walks at most `SETTLE_NEAR_TURNS` 4 (was 5), and a turn of walking weighs
        double (`SETTLE_TURN_WEIGHT` halved in `pickSite`'s worth): a near site beats a better one 4 turns away.
      - A settler stuck on its way founds on a free tile within `STUCK_FOUND_RADIUS` 2 it reaches this turn (`foundNearby`, from
        `unstick`) rather than taking another far site.
      - «Settle anywhere» looks within `ANYWHERE_RADIUS` 20 (was 8; `ANYWHERE_PATHS` 30), skipping other players' land
        cheaply: in Modern every tile around the capital was ours, and a settler stood there M39-M49.
      - A settler is trained where its queue is free soonest plus the walk to the nearest known site (`settlerRank`,
        `SETTLER_TILES_A_TURN` 2), not in the big city far away.
    - **War fronts facing an army** (Киото: one guard for 9 turns of Amina's war risk; at A54 5-7 Spearmen took its centre
      62 → 0 in three turns, and a besieged town could buy nothing).
      - `warFronts` carries `army`, the leader's land soldiers we see within `FRONT_ARMY_LOOK` 10. A front wants
        `frontGuardsWanted`: one guard, one more for every `FRONT_ARMY_SHARE` 2 of them, up to `FRONT_GUARDS_MAX` 3. Those
        guards are sent, trained (QUEUED_GUARD's want) and, with `FRONT_BUY_ARMY` 3 soldiers near, bought from the free gold
        while it still can (`buyDefenders`, one a turn).
      - A town at a war front is no conversion candidate (565 gold was held A50-A54 to make Киото a city).
    - **Peace asks our settlements back** (Киото stayed Amina's after a white peace at A62). `seekPeace` first inspects a peace
      that gives back their settlements that were ours (`settlementsToAskBack`: `getPossibleWorkingDealItems(deal, them,
      CITIES)` items of subType `DiplomacyDealItemCityTransferTypes.OFFER` whose city's `originalOwner` is us, as the peace
      screen offers them); refused, a white peace is inspected next. UI.log `peace: … would refuse a peace giving back …`.
    - **The plague** (60 moves off infected tiles; our land units 23 → 18 over E61-E67).
      - A safe tile next to the plague counts `HAZARD_EDGE` 4 more walking, one 2 away half of it: the plague spreads.
      - Off a centre only an enemy next to a healthy soldier holds it on an infected tile (was any within 3); on a centre,
        raiders within DANGER_RADIUS still do.
      - UI.log `plague: N unit(s) of ours on hazardous tiles …` once a turn names each one left there and why.
    - **Two generals** (research/41 Phase 2; core/xpl-generals.js; the user, 21 October: "all generals as close to the fight
      as possible, also escaping as first unit if dangerous or under attack: a valuable asset").
      - **Roles from what they took** (`roleFromPromotions`, `assignRoles`, `commanderRoles`): any Maneuver, Logistics or
        Assault promotion makes the VANGUARD, a Bastion one the BASTION; of the undecided the one with the most XP is the
        vanguard when none is (a lone commander is the vanguard). A campaign's leader with no Bastion promotion is the
        vanguard. `commanderProfile` is no longer used.
      - **Promotions:** the vanguard Mobility, Initiative, Quartermaster (or Recruitment), Regiments, then the rest of its
        trees, then the defensive order; the bastion `PROMOTION_PREFERENCE`. Commendations: the vanguard Merit first (radius
        2: more fights in reach), the bastion Order first (since gotcha 88 the role's key comes first, then Leadership's four to a commendation by the 5th promotion).
      - **Posts** (`threatPost`): a damaged centre first, then by raiders (since gotcha 82 by each fight's worth after the
        walk, and the fight it stands at first); a commander keeps its threatened post unless another
        it reaches within 6 turns has `SWITCH_RAIDERS` 3 more raiders or a damaged centre its own lacks (game 48: both kept
        posts with one raider while Киото had 7); a post no other commander holds first, else the fight is shared.
      - **In peace the vanguard** waits at the settlement threatened on most of the last `RAIDED_TURNS` 20 turns, else an
        exposed one (`noteRaids`, `mostRaided`); the bastion keeps the unhappiness rule.
      - **Its tile at a fight** (`formCommander`): a soldier about to fight (next to a land raider, or ranged with a target in
        range) counts `FORM.FIGHT_COVER` 30 on top of `COVER` 20: its XP comes from their fights.
      - **Escape first** (`escapeCommanders`, before the defence plan): a land commander hit this turn, or off our centres with
        a hostile unit (a ship too) in reach and no soldier of ours on or next to it, moves to the tile within 3 it reaches
        this turn in the fewest hostile units' reach (our centres and tiles beside our soldiers first); COMMANDER_ESCAPED.
      - **Strikes:** units in a general's radius shoot and strike first (`byGeneral`): their fights give it XP.
      - **A second commander:** fewer than `GENERAL.WANTED` 2 land commanders (one off the map counts) and none queued: bought
        from the free gold (`buyCommander`, after the defenders; COMMANDER_BOUGHT), else trained where it takes at most `TRAIN_TURNS` 8 × the game speed's factor (16 at Standard; gotcha 88) (QUEUED_COMMANDER; not in a space city or one kept for a pad), never in an age's last
        `AGE_END_TURNS`.
      - **Effects valued** (core/xpl-effect-value.js, `ctx.generals` from `generalsState`): EFFECT_GRANT_UNIT_PROMOTION
        `PROMOTION_VALUE` 40 a promotion as a lump while a commander lacks its role's four key promotions;
        EFFECT_ARMY_ADJUST_EXPERIENCE_RATE 1 a 10% while one also fights; EFFECT_ARMY_ADJUST_MOVEMENT_RATE 2 while one
        fights. Before, all three were 0.
      - **UI.log:** `generals: VANGUARD <type> at x,y post x,y (level …, XP …); BASTION …` once a turn; `generals: <type>
        escaped from x,y to x,y (hit | in reach; …)`.
      - **Not built:** walking with a soldier when hostile units are within 3, a Military Academy city first for training,
        no training beside a raced wonder; the packed army (Phase 3).
    - **Game 49** (research/game49; WON the economic victory at M32; both generals ended at XP 0/7):
      - **One rule for where a commander may stand** (`commanderSafeAt`), shared by the escape and the walk: our centre, else
        never next to a hostile land unit, and out of every hostile unit's reach (ships too) or beside a soldier of ours.
        Seen: Йезд, 3 tiles from the capital, was raided T16-T25; the commander's way passed the raiders, so it stayed in the
        capital, and when it walked it stopped in a raider's reach and escaped back. It reached Йезд after the last fight.
      - **The walk** (`postCommander`): its centre reached this turn is always taken; a longer walk only by a safe way whose
        first turn ends where it may stand (`turnStop`, the path's `steps` = the game's per-plot turns); else the tile
        nearest its post it may stand on this turn (`commanderAdvance`, COMMANDER_ADVANCE; UI.log `generals: … advances …`).
      - **The escape** takes a tile it may stand on nearest its post (into the threatened centre it reaches), else the fewest
        hostile units in reach.
      - **Roles remembered:** an undecided vanguard stays the vanguard (`assignRoles(list, previous)`; with no XP the role
        followed the unit key's text and changed hands when the second commander came).
      - **A queued second commander moves to the front** (`frontLoadUnits`, behind an item with progress): it waited A26-A49.

80. **Game 50, village hunts and «Учебная война»: the generals' experience** (22 October; research/game50, research/41 §6-§7;
    core/xpl-field-ops.js, units.js "field operations", choices.js `trainingWarStep`).
    - **Why:** XP short of a commander's first level is lost at every age change (games 48, 50 and 53; past the first level
      it is kept: game 53's 13/15 at level 1 came through), and that level needs 7 within one age at 2-3 a fight. Game 50's vanguard got 3 XP all game (one fight at A35); peaceful games level nobody. The user (21 October):
      "hunt villages that will not be befriended: not enough points, half past the era, or even one another civilization
      befriends if that will not cause a war"; «Учебная война» too. Research/41 §9 decision 1 (no hunts) is replaced.
    - **Game 50's small fixes:** a commander keeps a peace post `COMMANDER_PEACE_HOLD` 10 turns after reaching it
      (`postArrived`; the bastion walked capital ↔ Сучжоу three times in Modern and left the capital the turn it arrived); a
      scout in danger with no tile farther from the raiders takes the tile in the fewest raiders' reach, not next to one
      (`scoutAway`; one hit for 70 stood still and died). Scouts have 2 moves (BaseMoves): looking farther changes nothing.
    - **Which villages** (`autopilot.huntVillages`, on by default, with «Оборона»; core `huntReason`, units `huntTargets`): seen,
      within `HUNT.REACH` 8 of our settlements, never a city-state nor one we befriend; a crisis encampment (CRISIS), one
      another leader befriends unless that leader is Unfriendly or Hostile with us (OTHERS: −30 with them, no war), any past
      `HALF_AGE` 0.5 of the age (LATE), or one whose befriending price our Influence and its income for `SAVE_TURNS` 10 do not
      reach (INFLUENCE). Befriending leaves the hunted village alone (`huntedIndependent`).
    - **A hunt** (one operation at a time, after a campaign; `fieldOp` kind HUNT): the soldiers the defence leaves free
      (`freeSoldiers`: 2 melee, 3 in all, 1 more than its soldiers within 3; at most 5) and a land commander, the vanguard
      first (`fieldCommander`), gather 2 tiles from it (`stagingTile(t, 2)`); only then is war declared on it, as the map does
      it (`declareOnIndependent`: `canDeclareWarOn`, DECLARE_WAR Type DIPLOMACY_ACTION_DECLARE_WAR). Melee members strike its
      soldiers when the preview pays (`fieldStrike`, `strikeWorthIt`; ranged ones shoot in shootRaiders), the commander stands
      by the village over the most members, and with no soldier of theirs on it a member steps on and disperses it
      (`fieldAssault` → DISPERSE_MOVE → `disperseArrivals`; `dispersible(v, {hunted})` lets another's befriending pass).
      Ends (`huntEnd`): DONE, BEFRIENDED, OFF, VICTORY, HOME (raiders of anyone else, or a damaged centre: `homeUnsafeFor`),
      LATE 15 turns, STALL 5 without a kill, LOSSES 2 lost with no kill, FORCE; a village given up waits 15 turns.
    - **«Учебная война»** (`autopilot.trainingWar`, off by default, with «Оборона»; core `trainingTarget`, `trainingEnd`):
      - **Target** (choices `trainingWarStep`, each full pass): the nearest met major within 10 whose land soldiers are at most
        half ours, best melee no stronger, production at most 60%, fewer settlements, no ally of ours nor of a third; our
        settlements unthreatened, no other war or war risk, not an age's first 10 or last 20 turns, never the final age
        (ideologies are not read), once an age (`trainingWarAge` in the game memory), the outcome open, no CHANCE of ours nor
        a rival's DANGER, not science's final push; our War Support at declaration at least theirs, Influence for 2 points
        (60/120/180 by age), and ready: a free land commander and 4 free soldiers, 2 melee (`readinessForWar`, set by the
        unit step).
      - **Politics:** Hostile → `DECLARE_WAR` Type DIPLOMACY_ACTION_DECLARE_FORMAL_WAR (never a surprise war); Neutral or
        Unfriendly → `DIPLOMACY_ACTION_DENOUNCE` through `startAction`, 2 times (4 when very weak: soldiers ≤ 1/3, production
        ≤ 40%), 10 turns apart. During it a War Support point is bought when theirs reaches ours and costs at most half the
        spare Influence (`warSupportNet`: the ribbon's reading, `getInfluenceForNextSupport`, SUPPORT_DIPLOMATIC_ACTION).
      - **Conduct** (`fieldOp` kind WAR, from `planTrainingWar` the pass after the declaration): the army gathers 3 tiles from
        their settlement nearest ours, on our side, and fights their soldiers within `DEPTH` 4 of that tile, never deeper,
        capturing nothing.
      - **The end** (`trainingEnd`): PEACE, OFF, PROMOTED (the commander levelled), WEARINESS (`city.Happiness.hasWarWeariness`
        or their support ahead), LOSSES, THIRD (another major at war with us), HOME, LATE 20 turns, XP_STALL 5 turns, YIELDS
        (science + culture + gold + production 10% below the start). Until then no peace is proposed (`seekPeace`) and an
        offered white peace is refused (TRAINING_PEACE_HELD); after it the peace asks for their town nearest us when our War
        Support leads by 3 and the cap has room (`settlementsToAskBack`). Nothing is trained or bought for it.
    - **UI.log:** `hunt: …` / `training war: …` once a turn (stage, members, their soldiers near, kills, losses, War Support,
      the commander's XP), `hunt: none: …`, `training war: none: <leader>: <why>` every 10 turns, `training war: declared on …`,
      `denounced …`, `War Support bought …`, and each end with its reason.
    - **Not built:** Military Aid's value, levies for the army, ideologies (rotating hurt units: gotcha 82; packing: gotcha
      81).
    - **Games 51-53** (research/game51-53): the hud's strike step called `fieldFight` above its `const` declaration, so every
      pass logged `ERROR autopilot step strike failed Cannot access 'fieldFight' before initialization` (832 passes) and the
      hunt's fight ran only in the later "field" step; it is declared before the strike step now. No hunt started in those
      games (too few free melee units, then the home rule), and «Учебная война» found no target. Their analysis and the next
      plan (generals under soldiers, packing, sorties, air bases, nuclear weapons, the satellite): research/42-units-at-war.md.

81. **Research/42: units at war** (22 October, after games 51-53; research/42-units-at-war.md, research/game51-53). Game 53
    played on to M164 to watch the units: 14% of Modern's fights within 2 tiles of a general; the bastion killed alone on
    Китион's 0-health centre (M72-M74) and by a Frigate on the coast (M149-M150); one focused attack all game; nothing packed;
    15-26 free soldiers idle while 407 attacks hit us; one plane in an Aerodrome that holds 4 and no fighter; no nuclear
    weapon (every AI made 2-15); the satellite 77 turns after the game was decided.
    - **A. Generals under soldiers.** `commanderSafeAt`: under a healthy land soldier of ours (`shieldAt`, damage below
      `SHIELD_DAMAGE` 50; a commander is FORMATION_CLASS_COMMAND and CORE_CLASS_SUPPORT, so it shares the soldier's tile and
      the soldier is attacked), on our centre while its district keeps `DISTRICT_SAFE_SHARE` 0.5 of its health
      (`districtHolds`), else out of every hostile unit's reach and never next to a land one; beside a soldier no longer
      counts. The escape takes a commander that moved but has moves left, prefers a tile under a soldier, and UI.log says
      when it finds none (`generals: … is in danger … and stays`). At a fight `commanderTile(…, shielded)` may stand under a
      soldier in the front line (`FORM.SHIELD` 10, no EXPOSED or SHIP_REACH there). `escortCommanders` (after the
      formations): a walk whose first stop is unsafe takes a free healthy soldier next to it (damage below `ESCORT_DAMAGE`
      30; goal `{escort}` for the pass) and both go to that stop (COMMANDER_ESCORTED). Focused attacks need one unit
      (`FOCUS_MIN_UNITS` 1: the game's text sets no minimum), a lone melee one only when the preview pays (`strikePays`);
      Commander Attack also on a raider the preview says it beats keeping `COMMANDER_STRIKE_KEEP` 0.7 of its health.
    - **B. The army.** In a war (not a risk alone) each front is posted `frontGuardsPosted(f, share)`: one per enemy soldier
      seen near and an equal share of the free melee soldiers, up to `FRONT_POST_MAX` 4 (fronts carry `atWar`; training and
      purchases keep `frontGuardsWanted`). `homeUnsafe` no longer stops campaigns and hunts for a damaged centre that is
      guarded. Sorties (`sorties`, after the adjacent strikes): a healthy melee soldier (damage below `SORTIE_DAMAGE` 30) with
      every move, off our centres, strikes a hostile land unit within `SORTIE_RADIUS` 3 of our settlements it reaches this
      turn when the preview pays (`strikeTrade`), not into more than `SORTIE_CROWD` 2 others, `SORTIE_MAX` 3 a pass
      (SORTIE). Packed marches (`packMarches`, after the escorts): posts walking `PACK_SLOW_TURNS` 3+ to one settlement or
      front, at least `PACK_MIN` 2 of them (or free soldiers) next to a land commander not at another fight: each soldier gets
      `UNITCOMMAND_ADD_TO_ARMY` (canStart `{}` → Plots, then {X, Y} of the commander's tile, as the add-to-army mode; never
      PACK_ARMY), when the commander's way + 1 is no longer than their walk on average and within `PACK_MAX_TURNS` 8; its
      members count as coming (`marchOf`, `marchTurns`); urgent with healthy members it Force Marches when the game offers
      it; at the settlement `unpackArmies` unpacks it, and a march no longer needed unpacks where it stands (ARMY_MARCH;
      UI.log `army: … packs … (probe P-A7)`, `army: marches […]`). A packed soldier keeps `{march}` until its march ends.
    - **C. Air.** Fighters up to `AIR_GUARDS_MAX` 4, ground attackers `AIR_ATTACKERS_MAX` 2; bombers (`bombersWanted`,
      UNIT_CLASS_BOMBER) up to `BOMBERS_MAX` 2 in a war at our door, or one to carry a weapon held, where a base has room and
      the income covers `BOMBER_UPKEEP` 15 (QUEUED_BOMBER). `airfieldForRaids` (production step): a settlement raided from
      the air that no base covers gets an Airfield in our nearest city within `AIRFIELD_COVER` 4, done within
      `AIRFIELD_DEFENCE_TURNS` 15 (QUEUED_AIRFIELD). An air commander strikes with its planes (`airCommanderAttack`; by
      the class each command orders since gotcha 82); a single plane's strike asks the preview (`airStrike`; only a full answer saying
      the trade is poor holds it back: probe P-AIR-4 logs what it answers).
    - **D. «Ядерное оружие»** (`autopilot.nuclear`, off by default; core/xpl-nuclear.js). In a war with a major: Nuclear
      Fission's way first (TECH_FOR_NUCLEAR); the Manhattan Project where it is done soonest within `NUKE.WONDER_TURNS` 25
      (NUCLEAR_PROJECT); with it standing and a war at our door `PROJECT_PRODUCE_WMD` up to `NUKE.WEAPONS_MAX` 2 held and
      queued within `NUKE.PRODUCE_TURNS` 15 (NUCLEAR_WEAPON_QUEUED); a weapon held and no air base: an Airfield. The stock is
      our own count (settings' game memory `wmd` = "made|used", from CityProductionCompleted; no screen of the game reads it).
      The strike (`nuclearStrike`, first in the hud's strike step): an air commander whose
      `canStart(UNITOPERATION_WMD_STRIKE, {Type: WMD_NUCLEAR_DEVICE})` lists tiles, the blast (the WMD's BlastRadius plus
      `combatModifiers.wMDBlastRadius`, as the strike mode draws it) with the most land units of players at war with us, at
      least `NUKE.MIN_UNITS` 3, within `NUKE.NEAR` 8 of our settlements, touching no unit or tile of ours, no third party's
      and no settlement (armies only), never where `willActionStartWarInArea` says it starts a war; one a turn (NUKE_STRUCK).
    - **E. The satellite.** Once the game is decided, a Launch Pad in our best producer when no city can launch it
      (`launchSatellite({ buildPad })` → `padForSatellite`, SATELLITE_PAD_QUEUED); in a war at our door it is launched where a
      pad stands.
    - **Built after game 54** (gotcha 82): swapping hurt units out, Fleet Commanders, carriers, Squadron bases, the air
      commands by class, nuclear strikes on cities (their own checkbox). Not built: Military Aid, levies for the army.

82. **Game 54 and the rest of research/42: generals at the next fight, hurt soldiers swap out, the fleet and the air
    bases, cities in a nuclear war** (22 October; research/game54). Won the economic victory at M45 (Pachacuti: Assyria,
    Hawaii, America). The vanguard ended Antiquity at XP 0 and the bastion at 4 of 7 (lost at the age change): in the war of
    A40-A58 both walked 4-6 turns between Ниневия and Дур-Катлимму behind the raids, the vanguard advanced out of Ашшур's
    fight and escaped back twice, and at A44 both were posted to one fight (the vanguard had escaped, so its post was not
    taken). Exploration's hunt of Аванти (E5-E11) went without a general: the vanguard stood 8 turns away. Modern had no war.
    - **Posts** (`threatPost`): a fight is worth its raiders, `DAMAGED_WORTH` 3 more with its centre damaged, less
      `TURN_COST` 0.5 a turn of the walk; the fight a general stands at (within GUARD_RADIUS) is its own before its post, and
      it leaves it only for one worth SWITCH_RAIDERS more or a damaged centre it lacks. A war at our door with no fight in
      reach puts each general at a war front facing their army (`ctx.fronts` with `atWar`, the biggest `army` first, one
      each, shared from `FRONT_SHARE_ARMY` 4), its own kept while it stays one. An escaping general keeps its post taken
      (`ctx.commanderPosts`). An advance in the open stops out of reach by `ADVANCE_MARGIN` 1 more
      (`commanderSafeAt(…, margin)`, `hostilesInReach(loc, margin)`).
    - **Hunts and training wars wait for their general:** `fieldCommander` within `COMMANDER_TURNS` 10 (HUNT and TRAINING);
      no hunt starts without one while a general of ours stands on the map (`hunt: none: … no free general`); the fight waits
      for it (`fieldReady`'s `commanderAway`) up to COMMANDER_TURNS from the start; a hunt lasts `MAX_TURNS` 20.
    - **Hurt soldiers swap out** (research/41 Phase 4; `rotateFront` after the formations): a formation member hurt
      `ROTATE_DAMAGE` 40 or more gives its tile to a free soldier of its role hurt less than `ROTATE_FRESH` 20: a neighbour
      swaps places with it (`UNITOPERATION_SWAP_UNITS` {X, Y, Modifiers: NONE}, as world-input.js sends a move onto our own
      unit), a farther one comes in once the hurt one withdraws out of every hostile unit's reach or into a centre
      (`withdrawTile`); `ROTATE_MAX` 3 a pass; the centre's holder only for a melee unit; FORMATION_SWAP and the
      `formation:` line's `swaps […]`. Game 54 had 57 formation stays marked "hurt".
    - **The air commander's commands by class** (the game's text: Ground Attack, `…_AIR_TO_LAND`, orders "eligible Attack
      Air Units", Carpet Bomb, `…_AIR_BOMB`, "Bomber Units", Fighter Sweep, `…_AIR_TO_AIR`, "all Fighter Units"; gotcha 81
      sent Ground Attack for bombers): `AIR_COMMANDS`, `AIR_FOCUS_MIN` 2 planes of the class (AIR_CARPET_BOMB,
      AIR_FOCUSED_ATTACK); a target an enemy fighter covers is swept first when 2 of our fighters are based there
      (AIR_SWEEP). Carriers are air commanders (`isAirCommander`) and air bases (`airBases`), and carry a nuclear strike.
    - **Squadron Commanders** (`establishSquadronBases`, before the rebases; the game: they "Establish Air Bases on flat
      tiles with no Urban District that are not owned by another player", and planes rebase to one only after that): where
      fighter cover is wanted that no other base gives, on the tile `UNITOPERATION_ESTABLISH_BASE` offers (canStart `{}` →
      Plots, then {X, Y}, as interface-mode-establish-base.js) covering the most of them, at most every `SQUADRON_HOLD` 5
      turns (SQUADRON_BASE). One trained (`squadronWanted`, QUEUED_SQUADRON, `SQUADRONS_MAX` 1) in a war at our door while
      such cover is wanted; fighters for a Squadron base or a carrier come from any Airfield of ours (`interceptorsWanted`'s
      `remote`), and rebase there.
    - **Carriers** (`postCarriers`): sail to a water tile within GUARD_RADIUS of a settlement wanting cover no land base
      gives (`navalPost`; CARRIER_SAILS); one trained (`carrierWanted`, QUEUED_CARRIER, `CARRIERS_MAX` 1) on that water when
      a coast went `CARRIER_OPEN_TURNS` 5 turns uncovered in a war at our door, done within `CARRIER_MAX_TURNS` 15.
    - **Fleet Commanders:** Focus Fire (`…_SEA_RANGED`: our ranged ships in its radius) and Coordinated Naval Attack
      (`…_SEA_MELEE`: screens next to the target, a lone one when the preview pays) in `commanderAttacks`
      (NAVAL_FOCUS_FIRE, NAVAL_COORDINATED_ATTACK); `postFleetCommanders` (after the naval guards) puts one on a warship's
      tile where ships attack us, else toward those waters when its turn's stop is under a warship or out of every hostile
      ship's reach (FLEET_COMMANDER_POST); one trained (`fleetCommanderWanted`, QUEUED_FLEET_COMMANDER) for a lasting
      coastal front with `FLEET_MIN_WARSHIPS` 2 warships of ours.
    - **«Ядерные удары по городам»** (`autopilot.nuclearCities`, off by default, only with «Ядерное оружие»; the tab's
      checkbox after it): with no enemy army to strike, the city of a major at war with us within NUKE.NEAR of our
      settlements, the nearest first (core `cityBlastVerdict`, `bestCityBlast`): never ours, a third party's, another
      settlement, nor a city that was ours (`originalOwner`: we want it back); NUKE_CITY_STRUCK.
    - **Founding on a front** (`onWarFront` in `siteVerdict`, reason FRONT): a site within `FRONT_SITE_DISTANCE` 6 of a
      settlement of a major at war with us or a war risk waits while fewer than `FRONT_SITE_GUARDS` 2 melee soldiers stand
      free; not under a countdown to block (bold).
    - **The focus with one city** (core `unfitFocus`, `SCIENCE_MIN_CITY_LIMIT` 2): the automatic focus leaves science out
      while `player.Cities.getCityLimit()` (0 = no limit, as the game's yield bar reads it) is below 2 (Carthage); the
      player's own target still counts; UI.log `victory focus: SCIENCE left out: the city limit is 1`.
    - **Probe:** both generals' `xp:` lines read `promotions 0` from Exploration's last turn on, with no point to spend;
      whether a promotion survives an age change is open.
    - **Not built:** a fleet's assembly (packing ships), naval escorts and formations, Military Aid, levies for the army,
      ideologies (no training war in the final age).

83. **Generals chase their experience: the vanguard's packed army, Overrun, raider hunts, focused attacks first** (22
    October, after game 54; the user: "did we implement packing units into a commander and moving them that way to move
    faster? and using multiple attack from inside? Will the commander chase exp much more aggressively?"). Game 54's focused
    attacks gave 4-8 XP each (the first level needs 7); packing had fired only for slow walkers (gotcha 81), and the generals
    sat through raiders loitering 4-6 tiles out.
    - **The game's rules** (the Civilopedia's armies page): a commander packed with combat units gets +1 Movement (Mobility
      +1 more on land, terrain ignored); "If an Assembled Army is attacked, it defends as a single unit"; an army "must
      Deploy when attacked by enemies with sufficient strength"; Overrun kills a much weaker unit (about 5:1) without
      deploying and enters its tile.
    - **The vanguard's packed army** (`rallyVanguard`, after the field operations; `noteRapid`, before the defence plan):
      while a war is at our door, a settlement is threatened or one was raided within GENERAL.RAIDED_TURNS (`rapidCalled`),
      and the vanguard stands at no fight, free healthy soldiers (damage below `RAPID_DAMAGE` 20; not posted, at no front,
      in no hunt or campaign; never the garrison) join its army up to `RAPID_SIZE` 3: one next to it at once
      (UNITCOMMAND_ADD_TO_ARMY: canStart `{}` → Plots, then {X, Y} of its tile; VANGUARD_PACKS), one within `RALLY_TURNS` 3
      walks to it (goal `{rally}`; VANGUARD_RALLY). In peace an army packed at an age's start (Regroup) still gives its
      soldiers to exposed towns (gotcha 63).
    - **While it is called** (`rapid`): the defence does not split it up (`defenceSupply`), it unpacks only at a threatened
      settlement, not at a quiet front (`unpackArmies`), its soldiers count as coming to its post with its walk + 1
      (`rapidTurns` in `guardDetail`), and a walk of more than a turn to a damaged centre or raiders within 2 Force Marches
      first (`forceMarchIfUrgent`: the game offers UNITCOMMAND_FORCE_MARCH and every packed soldier is hurt less than 30).
    - **A packed army defends itself** (`armyShields`): a commander with a healthy soldier packed is not in danger for
      standing in reach (`commanderDanger`), nor is its walk's stop (`postCommander`); hit, it still escapes.
    - **Overrun** (`overrunRaider`, first in `commanderAttacks` for a land commander with soldiers packed):
      `UNITCOMMAND_ARMY_OVERRUN` (canStart `{}` → Plots, then {X, Y}, as interface-mode-army-overrun.js) on a hostile unit's
      tile where no other hostile land unit stands next to it and no ship reaches it, the nearest our settlements first;
      ARMY_OVERRUN; UI.log `army: … overruns …`.
    - **Raider hunts** («Охота на рейдеров», `autopilot.huntRaiders`, on by default, with «Оборона»; core `RAIDER`,
      `raiderEnd`; units `raiderTargets`, `startRaiderHunt`, `followRaider`: a field operation of kind RAIDERS, before the
      village hunt in `fieldStep`): a hostile land soldier we see within `RAIDER.REACH` 6 of our settlements, on our land or
      nobody's (`raiderGround`), not in a district, not within VILLAGE_GUARD_RADIUS of its own village (a village hunt's
      business), only of a player already at war with us (never a war of its own); the nearest first. It starts when our
      settlements are safe (that owner's raids aside), a general reaches it within `COMMANDER_TURNS` 3 (none without one:
      the point is its XP) and the free soldiers within `GATHER_TURNS` 2 plus those packed in its army are enough
      (`fieldForce`: a melee one, 2 in all, one more than their soldiers within 2); no gathering, the fight at once
      (RAIDER_HUNT_STARTED). It follows its raider within `FOLLOW` 3 each pass and ends (`raiderEnd`): DONE (gone), OFF,
      VICTORY, HOME, FAR (beyond REACH + 2), LATE (`MAX_TURNS` 6), STALL (3 turns without a kill), LOSSES, FORCE; that
      owner's raiders wait `RETRY_TURNS` 3 after one that failed. RAIDER_HUNT_ENDED has its own words for DONE, STALL and
      FAR (LOC_XPL_AP_RAIDER_WHY_*). UI.log `raiders: …` once a turn, `raiders: none: …` once a turn while one is seen.
    - **Packed members unpack by the fight** (moveFieldOp, every field operation): within 2 of the staging tile (gathering)
      or of the target (the fight), toward the nearest enemy soldier (UNITCOMMAND_UNPACK_ARMY; FIELD_UNPACKED). A hunt of
      villages takes the general's packed soldiers too.
    - **The general's tile in a field operation** (moveFieldOp): under a healthy member (where one stands or goes this
      pass), or where `commanderSafeAt` allows, or anywhere with its army packed; a member about to fight after this pass's
      moves is worth 20 more and any such fight 30 (its focused attack), a shield 10; with no safe tile it advances as close
      as is safe (`commanderAdvance`), as it does when its walk's first stop is unsafe. Before, it stood by the fight in the
      open and escaped the next pass.
    - **Focused attacks first:** `FORM.FOCUS` 60 in `commanderTile` for a tile whose radius reaches a soldier about to fight
      (one fight beats three idle soldiers). The hud runs the strike step again after the unit step when it unpacked an
      army (ARMY_UNPACKED, FIELD_UNPACKED) or placed a general (FORMATION_COMMANDER, FIELD_COMMANDER): `STRIKE_AGAIN`, so
      those soldiers fight that turn (Initiative lets unpacked soldiers move).
    - **Not built:** the training war made less strict (the proposal's E; it stays as gotcha 80 left it), a packed army
      roaming for raiders without a hunt, packing a far hunt's soldiers before the walk.

84. **Games 55-56: free promotions, ships, the fronts before a war, packed upgrades** (22 October; research/game55-56). Two
    culture wins (Rome, Mexico), the first games with gotcha 83's build: the generals reached levels 2-3 (games 48-54 ended at
    XP 0), raider hunts killed 3 raiders with no loss, the vanguard's packed army unpacked for a hunt and twice for a defence.
    Promotions survive an age change (gotcha 82's probe): the roles they gave held, and only the game's
    `getTotalPromotionsEarned` counter starts again at 0.
    - **A promotion the game hands out decides no role** (`freePromotions`: the `UnitPromotionType` of every
      EFFECT_GRANT_UNIT_PROMOTION modifier; `promotionHas(…, {chosen: true})` in `commanderRoles`). Game 55: our card research
      took Rome's Cursus honorum, which gives every Army Commander Bulwark (DISCIPLINE_ARMY_BASTION) for free; every general
      read BASTION from A34, so there was no vanguard (no packed army, no raids watched) and the next promotion was Steadfast.
    - **A ships-only fight takes one general** (core `threatPost`: a fight with `shipsOnly` that another general holds is no
      candidate). Game 55: all three went to Катана, shelled by one Cog, and were hit on and around its centre.
    - **A warship bought for a shelled settlement** (steps `warshipPurchase`, from `buyDefenders` when the need is a ranged
      guard against ships and no land unit on sale there fights them; WARSHIP_BOUGHT): once the ships hit its centre or stayed
      LASTING_FRONT_TURNS (a passing galley buys nothing), while no warship of ours stands within WARSHIP_NEAR; in a
      settlement of ours on the same water (`waterAreas`), the one whose ship sails there soonest within `WARSHIP_BUY_SAIL` 5,
      a ranged ship first, then the strongest, then the cheapest, from the defenders' pool (all the gold less a deficit's
      cushion). The naval guards sail it there (gotcha 70). Game 55: one independent Cog shelled Катана from 100 to 0
      E18-E24; Cogs were queued at E19 and the first sailed at E22, five turns away, while ~1,000 gold waited.
    - **A front's army is the most seen near it lately** (`warFronts`: the peak of `armyNear` within `FRONT_ARMY_MEMORY` 10
      turns; fronts carry `seen`; the `defence:` line says `N of their soldiers near lately, M now`). Their soldiers walk in
      and out of sight.
    - **Gold for a defender while a war risk lasts** (`goldPlan`): not yet at war at our door, the reserve keeps a defender's
      price (`defenderPrice`) for each war front, at most `RISK_FRONTS_KEPT` 2, so small purchases wait; defenders use all()
      anyway. Game 56: Trung Trac and Franklin weighed attacks on our cities from late Exploration (AI_Operation_Eval);
      108-gold town purchases took ~1,700 during the risk, and the declaration at M18 found 246 gold against a 540 defender
      while Керетаро's centre fell to 33%. Since gotcha 85: from the free gold only, one defender's price.
    - **Packed soldiers upgrade** (`upgradeUnits`): a commander's packed soldiers together first, `UNITCOMMAND_UPGRADE_ARMY` on
      the commander with NO_TARGET (the army panel's «upgrade all»: "Upgrade all eligible units in the army"), when the game
      offers it, priced at the soldiers' `upgradeEstimate` (the game's own price is only in its tooltip,
      `AdditionalDescription`: UI.log `upgrade: … the game says "…"`); ARMY_UPGRADED; its soldiers are not upgraded one by
      one as well. A packed soldier counts where its army stands (`unitTile`: off the map its own location is -9999), so the
      THREAT mode reaches it; `upgradeFirstMelee` takes packed soldiers too (the army panel selects one, and the unit panel
      offers the same UNITCOMMAND_UPGRADE).
    - **Not built:** a front sized by the rival's whole army: the game lets the UI read every unit of a rival (the war probe's
      `land soldiers 11 (1 seen)`), but PLAN.md §14 keeps hidden information behind an opt-in toggle, off by default.

85. **Games 57-58 and the fight simulator: the last step, settlers' reasons, the risk gold, skirmishes** (23 October;
    research/game57, research/game58).
    - **Game 57** (Mongolia, culture focus) was lost at M62 to Tecumseh's military and economic countdowns, both begun at
      Modern's 80% step (×1.25 our second place).
      - **The block is judged at the next step** (`victoryWatch`'s `needAt`): while a lower multiple is still to come in the
        final age, `need` = the leader's points × 1.15 ÷ that multiple, unless its countdown runs (broken now, at the current
        one). From M47 the watch said «need 71 (ours 72, 0 settlements)» at ×1.5 while ×1.25 put his 101 past our 90. The
        economic block was out of reach anyway: GDP 3,808 against our 2,644, his lead from Antiquity on.
      - **«Settle anywhere» says why** (`anySite`): tiles on the settler's own land (`GameplayMap.getAreaId`) before others,
        so its ANYWHERE_PATHS ways are not spent across the water; with none, `ctx.anywhereWhy` ends the settler's `no order`
        line: `anywhere: none of N tile(s) {"CLAIM":…, "NO_PATH":…, "UNTRIED":…}`. A settler stood ~20 turns at 64-68,19-22
        with room for 9 under the cap, its 4 sites taken, unreachable or refused; anywhere found a tile only at M56.
      - **The war-risk gold** (gotcha 84) is kept from the free purchases only (`budget.keep`: `free()` leaves it out,
        `forGoal()` does not) and for one defender (`RISK_FRONTS_KEPT` 1). Two prices held ~1,100 gold M28-M62 for
        Friedrich's risk, no war came, and each GDP Port waited 4-5 turns more. The gold line says `kept N for a defender (war
        risk)`.
    - **Game 58** (Dai Viet, Antiquity): Керманцы, a hostile village 3 tiles from Дыонглам.
      - **A hunt is not called home by ships alone** (`homeUnsafeFor`: a threat counts with land raiders or a damaged centre):
        the hunt of Керманцы ended after one turn of fighting for one galley at Хоалы, 11 tiles away; a centre the hunted owner alone hit calls none home while it keeps HOME_DAMAGE_SHARE 0.5 (gotcha 88).
      - The bastion stood on Дыонглам's centre while our Spearman fought the village's Archer two tiles away (T63-T65), and no
        hunt started again («not enough force (melee 0 of 2 …)»).
    - **The fight simulator** (the user: "we need to create some fights simulator test, so we will have an idea how to better
      implement it"; tests/fakes/fight-sim.mjs, tests/fakes/fight-scenes.mjs, tools/fight-sim.mjs, tests/fight-sim.test.mjs):
      the autopilot's unit steps in the hud's order, each order carried out as it is sent; damage 30 × e^(0.04 × the strength
      difference), each side of a melee fight (CombatLog.csv of games 57-58, 2,243 fights: base 29.5, ±18%), strength −1 for
      every 10 damage; healing 20/15/10/5; XP by the game's EXPERIENCE_* parameters (melee 2, ranged 1, +1 attacking, +2 for
      a kill, 1 from level 2 against independents, 25 for a dispersal); the village spawns a soldier every 4 turns (4 at most)
      and its soldiers strike what pays. Game 58's scene, 20 turns, 20 seeds (XP of both generals / fights in a general's
      radius / kills / soldiers lost / generals defeated): before 14.7 / 7.7 / 0.9 / 2.1 / 0.4; with the centre rule 21.8 /
      12.5 / 0.8 / 2.9 / 0.1; with the skirmish too 29.6 / 15.6 / 1.4 / 2.8 / 0.1. The skirmish's first version, Archers
      posted in the open in range of the village's soldiers: 4 lost, 0.7 generals defeated.
      - **A general on our centre stays when its holder there is hit while the district holds** (`commanderDanger`: that hit
        is the holder's). Before, it left the town centre every time, and the fights' XP with it.
      - **Skirmishes** (core `SKIRMISH`, units `skirmishStep`, after the field operations, with village or raider hunts on, not
        while one of them or a campaign runs): a hostile village within `REACH` 5 of our settlements (gotcha 88) with soldiers within 3
        of it. Up to `SHOOTERS` 3 ranged soldiers hurt less than 40 (those by our settlement first, then the defence's free
        ones within 3 turns) take posts on the tiles next to our settlement nearest it, never next to one of its melee
        soldiers nor within 3 of two of its soldiers (`EXPOSURE_MAX` 1: two attacks in one turn kill an Archer at full
        health), one in range of them first; a general (the vanguard first) stands over them, the centre first, and unpacks
        its army there. They are ordered for the pass; the strike step shoots, again after the unit step when they arrived
        (`STRIKE_AGAIN`: SKIRMISH_POST, SKIRMISH_COMMANDER, SKIRMISH_UNPACKED). A hurt one escapes or heals and a fresh one
        takes its post the next pass. UI.log `skirmish: <village> at x,y: their soldiers N […]; shooters […]; commander …`,
        or `skirmish: none: …`, once a turn.
    - **Not built:** the simulator has no production (our losses are not replaced), walls, terrain or promotions' effects, and
      the village's AI is our guess; units brought to a skirmish town, melee screens in front of the shooters. The plan, in
      order: research/43-fight-simulator.md. Game 58 was won (military, M43); its generals fought in Antiquity only, and game
      59's had no fight in two ages.

86. **Game 60: the Autopilot tab, the F7 step and the turn flow; lines that rebuild a turn** (24-25 October; research/game60:
    the ui, errors and unitlog reviews).
    - **Seen:** 28 checkboxes, 5 dropdowns and 6 sliders in one column put the log ~17rem below the tab's bottom; it kept 80 of
      2,171 entries (5 turns). Both hunts stood ticked with «Оборона» off. A forced pass had no end-of-turn retry (T76's town
      converted after the production step got its queue only there). No line placed a unit by id, and 395 of 398 unit lines
      carried the previous turn's tag.
    - **One option spec** (`core/xpl-ap-options.js` `AP_OPTIONS`: key, default, group, text keys, `needs`): the settings read
      it, and every pass acts on `effectiveOptions(o)`, after the settings and again after applyStrategy (the wars, hunts and
      nuclear options need «Оборона», which the nuclear research and Manhattan Project skipped before). A new option is a spec
      row, a label, a `_TIP` (≤ 300 characters) and the full `_TT`, in both languages (tests/ap-options.test.mjs).
    - **The tab** (`core/xpl-ap-view.js`; no option in the HTML): a top bar (status, what holds the turn, «Следующий шаг (F7)»,
      «Включить») over the settings and the log, each in one fill fxs-scrollable. Seven collapsible groups with a master
      fxs-checkbox (a gold bar when mixed). An option whose needs are off is dimmed with a chip («нужна «Оборона»») and stays
      clickable (`disabled` plays the error sound); «фаза: N» chips show the phase's values; «?» opens the full text. The log:
      `LOG_MAX` 300, oldest first, a header per turn, «Главное | Всё | Ошибки», rows appended once a frame (`reconcileRows`),
      following the bottom (`scroll-on-resize-when-bottom`). Forced checkbox events stay ignored (gotcha 8).
    - **The step** (`stepNow`; F7 = input action `xpl-autopilot-step`, no context constraint, like F8): one pass with the ticked
      options, the autopilot on or off, never ending the turn; refused off our turn (the end-turn button's `isTurnActive ==
      false || hasSentTurnComplete()`), during a pass and during «ИИ играет». UI.log `step: T<n> by HOTKEY|BUTTON: N entries
      in M ms; blocker <type|none>`. A new F7 binding needs a full restart.
    - **The settle round after every pass** (core `settles(blocker, o, {endsTurn})`): up to MAX_RETRIES 2 rounds while a ticked
      option handles what holds the turn (the player's units, off the automatic pass, only with «Пропускать юнитов»), never
      for the age's choices (the last Antiquity pass re-planned twice, ~8 s). End-of-turn answers (a call to arms, a forced
      card) only when the pass ends the turn (`retry: endsTurn`). `state.autopilot.blocker` keeps the game's own message.
    - **The dedications** (E1: the pass before them queued a Sokmen, and the card's 2 settlers left one at the cap E24-E73): that
      pass runs only the conversion window (`stopForDedications`); a queued settler with no progress leaves while those we
      have exceed the cap's room (`dropSpareSettler`). **Tacks unattended** (`core/xpl-tack-refresh.js`; 33 MB of DMT lines in
      30 minutes of Exploration): renewed every TACK_REFRESH_TURNS 5 or when the Buildings tab asks; between, only a
      settlement with no tack gets one.
    - **Lines:** every [XPL] line reads `[XPL] A67 …` (`turnStamp`); `pass: A67 full|repeat|step` opens a pass; the unit loop's
      orders add ` u<id> from x,y`. `units:` at a turn's start (data/xpl-unit-log.js, core/xpl-unit-lines.js): ours `id@x,y`
      with flags, commanders `L2 11/45 V {packed}`, theirs as the plot tooltip shows them plus `unseen N`; every turn near a
      fight, else on army changes or every QUIET_TURNS 10. `places:` on settlement or village changes. `fight:` for each Combat
      of ours (`gen 262146 r1 L2 6/45 V was L2 4 | none`, by the game's command radius; FIGHTS_MAX 40 a turn) replaces `xp:
      combat` (40 of 110 fights T50-T100); its dN is very likely before the hit, so damage comes from CombatLog.
    - **Tools:** `node tools/unitmap.mjs <Logs> [from= to= session= scene=]` rebuilds both sides by id each turn from the game's
      AI logs and our lines, with the villages' births (game 60: every 8, 7, then 6 turns, plus raid parties); a launch's
      folder holds every age (`session N of M`); `scene=` writes a replay for `tools/fight-sim.mjs scene=`. The game overwrites
      Logs at every launch (the evening game of 23 October kept only its saves): the scheduled task «Civ7 log archive» runs
      `tools/archive-logs.ps1` every 15 minutes (`…\LogArchive\<session start>.zip`, 12 kept).
    - **The window's focus:** the dedications' conversion window uses the remembered victory focus only with «Фокус на победу»
      on, otherwise only the 1:1 floor.

87. **Game 60: units stay alive: danger is what we see, scouts keep their goals, settlers take escorts, the plague is left by
    longer ways** (24-25 October; research/game60: the scouts, plague and unitlog reviews; the user: "Our units shouldn't be
    scared of enemy scouts").
    - **Seen:** no rule counted enemy scouts (CORE_CLASS_RECON; a pinning test keeps it so); units fled from soldiers 2-3 tiles
      off, ships, or soldiers in the fog, which every reader saw through. Scouts came back to within a tile on 31 of 73 moving
      turns T1-T40 (the AIs 6-15%): goals swapped every pass, a sight tile never showed Шэнле (unseen until T82 while it
      raided the capital), and both scouts idled from E31 (rough seas). Three of four land units lost T100-T140 died on
      Астрахань's plague T135-T137: «no safe tile reached this turn» while 2-turn ways cost ≤ 25.
    - **What we see** (data/xpl-seen-units.js; PLAN.md §14): the plot tooltip's test, the tile VISIBLE and
      `Visibility.isVisible(us, unit.id)`. Danger readers add units last seen there within LAST_SEEN_TURNS 2; targets take only
      what is seen now. Every flight logs `flee: <type> at x,y <KEY> from [<type> of <owner> at d (land|ship|air, seen | seen
      T<n>)…]`.
    - **Scouts** (core/xpl-scouting.js): one radius SCOUT_DANGER 2; a sight tile where the village stays unseen is blind for
      good, one fled from is left VILLAGE_RETRY_TURNS 10 (`scout: <village> unseen from x,y`). A walking scout keeps its goal
      while the game's destination is it; only danger or a discovery reached this turn takes over. Frontiers are scored
      (`frontierScore`: hidden tiles over 1 + turns, HEADING_BONUS 2, CROWD_PENALTY 3). In rough seas a land scout looks
      FAR_RADIUS 25 on its landmass, else sleeps until danger, calm seas or SLEEP_TURNS 10. The second scout waits for the
      first settler.
    - **Settlers** (game 60: 77 settler-turns from done to founded around independents' raiders, 2-6 soldiers idle): a ship
      counts only as a warship whose next turn reaches them, never on our garrisoned, undamaged centre. A settler whose best
      site is DANGER or UNSAFE_WAY for one independent's soldier (ESCORT_MAX_RAIDERS 1) takes a free melee soldier within
      ESCORT_JOIN_TURNS 3 (`escortSettlers`, with «Поселенцы» and «Оборона» or «Армия»): SETTLER_ESCORT_COMING, then
      SETTLER_ESCORTED stop by stop, founding on arrival when the cap allows. A settlement short of guards ends it.
    - **The plague** (core/xpl-unit-safety.js, `leaveHazard`): ways within PLAGUE.LOOK 5 and ESCAPE_TURNS 3, costing 25 a turn's
      stop on the plague while it lasts (MapPlotEffects `duration`) plus HOSTILE_COST 30 by a hostile, taken when cheaper than
      staying (LEFT_HAZARD_WALK; the errand comes back after). The plague's damage is no hit; a soldier steps off the one clean
      tile for the most hurt (PLAGUE_ROOM); no rest or fortification on it. Walks go around it a turn at a time (`cleanStep`)
      and are re-planned when a stop is infected (WALK_HAZARD). Units are bought in a clean settlement in time (`unitShop`).
      UI.log `plague: … (no way out: N infected, …; the cheapest costs C in Nt; staying costs S)`.
    - **Steps away** (`stepAway`): tiles reached this turn (STEP_AWAY_MAX 4), never next to a land hostile, the fewest reaching
      it next turn (`reachOf`, ships too; game 60 T96: a 3-move scout looked 2 tiles out, into two Warriors' reach). A hurt
      unit rests no nearer than VILLAGE_REST_KEEP 4 to a hostile village. A ranged or hurt soldier is not sent on a walk whose
      first night is by a raider (`firstStopUnsafe`: T66's Slinger; `defence: … not sent [… (unsafe way)]`).
    - **Not built:** packing a hurt unit into a neighbouring army (the plague line names the case), an opt-in to read through
      the fog, a watch duty for idle scouts.
    - **Merge fixes:** the plague walk's step (`cleanStep`) never picks a tile another unit was sent to in the same pass; a hurt
      soldier (under 50 damage) standing on a general's tile rests there instead of withdrawing or escaping in the same pass
      (`sheltersCommander`).

88. **Game 60: the generals level up at any game speed** (24-25 October; research/game60's war review).
    - **Seen** (Standard: CostMultiplier 100, levels at 15/30/45/60, each counted afresh): one general all Antiquity. It reached
      level 3 (11/60, ~101 XP), the first of ours to get that far, with three promotions in three trees and no commendation;
      62 of our 194 fights were in its radius, 3 raider hunts started, no skirmish. No second commander was queued:
      TRAIN_TURNS 8 was tuned at Online, and the want asked the gold a savings goal held.
    - **Speed** (`speedFactor`: CostMultiplier / TUNED_COST_MULTIPLIER 50): a commander is trained within 8 × the factor turns
      (16 at Standard) and only while the age leaves FIRST_LEVEL_TURNS 10 × the factor for its first level (`commanderLate`).
      The want asks the free gold; none trained in time makes it the COMMANDER goal («Копим: второго командира»), after every
      other kind, by the training's city rules (`commanderCityOk`). UI.log `generals: no second commander: …` every 10 turns.
    - **A commendation by the 5th promotion** (every army tree ends after 4; only Leadership's ends grant one): the role's key
      (Mobility, Steadfast), then `LEADERSHIP_WAY` (Zeal, Field Commission, Old Guard, Barrage), then the role's own trees.
    - **Independents give 1 XP a fight from level 2** (EXPERIENCE_MAX_BARB_LEVEL 2, BARB_SOFT_CAP 1: 54 XP in 48 fights):
      `threatPost` counts such fights at a third, and the lowest-level general is posted first and takes their hunts. In a
      general's radius a strike takes a closer trade where it still gains full XP (STRIKE_TRADE_GENERAL 1.2, ours keeping
      STRIKE_KEEP_GENERAL 0.6): game 60 refused 30/30 and 32/28 on a hunted Archer, and the hunt ended STALL. What each fight
      gave: every general in a `fight:` line carries `was L<level> <xp>` (its XP when last read, core/xpl-unit-lines.js), and
      `xp: after the fight T…: <type> <key> XP L1 4 -> L1 7` follows XP_AFTER_MS 250 later for generals within 2 tiles.
    - **Posts:** a settlement fought at within FIGHT_MEMORY 2 turns keeps its general; a damaged centre more than FAR_TURNS 3
      away counts only below FAR_DAMAGED_SHARE 0.75 (A88-A98: 6 turns from Тула's live fight to Самара at 171/200).
    - **Hunts:** guards in time count, and a centre only the hunted owner hit calls none home above HOME_DAMAGE_SHARE 0.5. A
      raider hunt may take the general posted where the raider threatens, tied to it (20 of 73 `raiders: none` lines). While
      its general comes (RAIDER.COMMANDER_TURNS 3) our soldiers, ships and planes leave the raider to it (`raiderHold`) unless
      in its radius, at a siege, or facing the raider's killing blow (A109-A111 a SORTIE killed it 3 tiles off: 0 XP). Kills
      come from the Combat events; FIELD_STRUCK needs a Combat naming the striker (`field: … strike on x,y not carried out`).
    - **Hostile commanders** (`hostileCommander`; one pillaged by Тула T89-T139): danger to civilians, a hunt, strike and sortie
      target (a lone one when the preview says we take nothing), never a raider for walls or defenders (UI.log `hostile
      commander: …`). A hostile scout is a sortie target only in a general's radius, SORTIE_SCOUTS 1 a pass.
    - **Skirmishes** reach 5 (Шэнле stood 5 from two towns) and say why not (`skirmish: none: nearest <village> at d tiles …`,
      every 10 turns). The formation general takes only a tile `commanderSafeAt` allows (the simulator caught it alone under a
      withdrawing Warrior or 2 tiles from an Archer in 4 of 10 seeds).
    - **The simulator:** paths count the zone of control; scene `raids60` (`node tools/fight-sim.mjs 20 10 raids60`: game 60's
      raids on four settlements from far villages), beside the `scene=` replays (gotcha 86). On the war build, 20 seeds: XP
      13.1 → 24.4, fights in a radius 6.3 → 15.5, generals defeated 0.6 → 0. On the merged simulator (20 turns): game 58's village, 10 seeds, XP 69.2, fights in a radius 26.9, generals defeated 0; `raids60`, 20 seeds, XP 25.1, fights in a radius 11.7, kills 7.7, lost 2.9, defeated 0.1.
    - **Not built:** air and Fleet Commanders' focused attacks held for a hunt's general, an attack-move in one order.
    - **Merge fixes:** a hit on a tile where a healthy soldier still stands counts as the soldier's, so the general does not
      leave it (`commanderDanger`, like the centre's holder); the vanguard's rally leaves alone soldiers the defence posted or the
      formation moves this pass.
    - **Gold sources** (game 62, Deity: our gold 50-80 a turn against the AIs' 109-1,036): with every economy line, UI.log
      `gold sources: T<n>: net N = cities C + towns T - units U + other O; units [<type> upkeep]; settlements [<name>(t <Focus>)
      gold]`, read as the game's yields report reads it (`logGoldSources`; Treasury.getMaintenanceForAllUnitsOfType per type).
    - **Game 61** (Xerxes, won economic at M46; research/game61): the second general led a village hunt and walked alone for
      three turns to 54,23, next to a Heavy Archer standing on the staging tile, its soldiers 2-5 tiles behind; it was shot at
      E11 and E12 and died. Gathering it now takes only a tile `commanderSafeAt` allows (or with its army packed), else advances
      as close as is safe; the turn-stop check covers gathering too; and a general already walking whose next stop (or a
      destination reached this turn) it may no longer stand on has its walk cancelled (`stopUnsafeWalk`, COMMANDER_WALK_STOPPED;
      UI.log `generals: … the walk is cancelled`). Its escape then found "19 safer, none reached this turn" while the game listed
      3 tiles it reached: the `is in danger … and stays` line now counts why (no way, more than a turn, a war, refused).

89. **Game 60: walls, wonders, the plan's share, repairs and the gold pools** (24-25 October; research/game60: the adjacency,
    economy and errors reviews). The capital put 24% of 3,357 production into buildings (none A40-A79); 1 of 5 wonders ordered
    was built; ~70% of 6,559 gold went to all-gold spends while a conversion goal held up to 950 on 89 turns.
    - **Walls** (`wallsSlot(city, threat, def, loc)`): a war at our door, an unwalled centre that is damaged, or a centre below
      WALLS_URGENT_SHARE 0.5 of its health still sends walls to the very front, ahead of a raced wonder too (the user's rule after
      game 27, kept). Only walls at an already walled centre, or for another district, stay behind an item in progress and never
      pass a wonder in production, while the centre is at or above half its health and no war is at our door. Seen at A105: a
      district's walls passed the Ha'amonga a Maui two turns from done on a 19-of-200 scratch of the walled centre (181/200);
      Prussia won by a turn, ~230 of the refund lost in the walls. No more walls at a walled centre that holds or faces ships
      only (`wallsEnough`: ~520 production on four districts; `walls: <s> … no more walls`).
    - **Wonders:** the ETA counts what a wonder waits behind (`wonderWait`; units unless its race keeps the front) and the race
      is judged there; none is ordered behind more than WONDER_WAIT_TURNS + WONDER_WAIT_MARGIN 2; one out of production
      WONDER_STARVE_TURNS 5 leaves (WONDER_STARVED: the Hanging Gardens stood 14 turns behind walls and units). A queued
      wonder's turns are min(the game's getTurnsLeft, ours) + the wait (probe `wonders: probe: …`). No unit passes an item done
      this turn. A refund goes into the item in production, up to its room (`roomIn`). A wonder's tile charges a worked
      improvement its whole yields (RURAL_LOSS_IMPROVED 1: Byrsa took a mine).
    - **The plan's share:** a queue holding no building gets the plan's next (`buildsNoBuilding`, QUEUED_PLAN). **The age's
      end:** the game's count for the head, no margin on an exact clock (`exactClock`); a city in unrest puts a Happiness
      building first (AGE_END_HAPPINESS; the capital's Altar was lost at 107/121).
    - **Repairs** (core/xpl-repairs.js; game 60: 54 repairs for 1,408 gold behind one independent's Army Commander, 31 pillaged
      again within 5 turns): an improvement is bought from the free gold, in a wonder city too (probe P-REP-2), queued only
      where it cannot be bought, and waits while a land unit at war with us stands within REPAIR.SAFE_RADIUS 2 (commanders
      too), REPEAT_TURNS 6 after its repair, or for the age-end conversion (REPAIR_DEFERRED; `repairs: waiting [...]`). A
      building's repair keeps all the gold; QUEUED_MAX 1 a queue; none moves while a wonder is in production.
    - **Pools:** all the gold for a defender, or the age's first melee unit, only under a real attack (`realAttack`: a war at
      our door, a damaged centre, raiders where walls do not hold, ships for LASTING_FRONT_TURNS 3); else the free gold and no
      DEFENDER goal. Ships alone at a walled centre unhit for CENTRE_HIT_TURNS 5 buy no ranged guard (`shipsHeldOff`).
    - **Conversions:** on a non-final age's last turn (CONVERT_LAST_LEFT 1), income ≥ 0 and «expect to keep cities», the goal
      takes the reserve too (`noReserve`; T139: Самара's 950 was missed by 13 and cost 2,350 from E2); the first-turn window
      runs for every focus to the 1:1 floor; `conversions: <town> left the list: <why>`.
    - **Revolts:** plague unrest is none (no purchase is possible in unrest: `happiness: X in unrest from the plague: …`); a city
      in unrest queues its cheapest Happiness building and moves it up (REVOLT_QUEUED, REVOLT_FIRST), never past a wonder,
      project, walls or science site in production.
    - **Probes and quarters:** `plan: <city>: …` every PLAN_LOG_EVERY 10 turns; `buildings audit: …` on the game's
      ConstructibleBuildCompleted; GROWTH_TILE names the best specialist (55 citizens to tiles, 0 specialists). Quarter yields
      of our traits, slotted cards and pantheons (REQUIREMENT_PLOT_IS_QUARTER: Russia's +1 Culture) are valued by the plan
      (core/xpl-quarter-yields.js; `quarters` in inputSignature).
    - **Not built:** an unfinished wonder's district timed from its ETA, quarter yields from beliefs or buildings.
    - **Merge fixes:** a repair waits only for hostile units we see or saw in the last 2 turns (`unitsSeenAt`); the revolt guard
      queues or moves Happiness buildings only with «Производство» on (otherwise only its `happiness:` log line); an age's last
      turns move no Happiness building ahead for unrest from the plague.

90. **Game 60: befriending, the pantheon, Altars and great works, Missionaries, stories, merchants; mementos by age**
    (24-25 October; research/game60's mechanics review).
    - **Befriending** (choices `befriendIndependents`): a village the game has not let us find (FailureReasons
      LOC_DIPLOMACY_ACTION_FAILURE_NO_VISION) keeps no Influence and is approached (49 passes held it; `befriend: <X>: village
      not found, …`). None starts when another leader's finishes first (`getCompletionData(uniqueID).turnsToCompletion`) or
      ours ends after the age (`befriendTurns`: 30 at Standard), and support goes in only where it can still win
      (`supportedTurns`): 2 of 6 were lost to a rival who started first. One reserve (`befriendReserve`, on its own turn)
      replaces "any threat stops diplomacy": endeavors and steals take turns with a befriending we save for (2 endeavors and 0
      steals all Antiquity, threats on 90 of 140 turns).
    - **The pantheon is structural research** (PANTHEON_WORTH 2 while an exclusive one is claimable, 1 shareable, 0 once ours;
      a node also counts what it opens): ours came last of 10 at T77, behind civics researched for wonders never started. The
      culture path researches only wonders whose race is HIGH or MEDIUM (`unlockRace` when locked) or our own, and the
      celebration tracker (Entertainment, FOCUS_VP_TRACKER: celebrations before it earned 0).
    - **Altars and great works** (data/xpl-building-extras.js): the Altar carries our pantheon's yields in its settlement, towns
      too (one Altar stood in 7 settlements); great-work slots are worth the archived works that fit (this age's
      Constructible_GreatWorks rows), in the best producer (3 codices waited all Antiquity, no Library). The culture path
      pushes Temples while relics wait, no more than wait (`templeRoom`). Pantheon and archive are in inputSignature.
    - **Religion:** Lay Followers, Ecclesiasticism and Charoen are worth 0 (they pay only for converting another
      civilization's settlement); a settlement of no religion is converted from a district, the urban half from an urban one,
      the rural half from a rural one (9 of 29 spreads were refused off one).
    - **Stories and merchants:** options are valued by their rewards' modifiers (`storyRewardValue`: an attribute point ≥
      STORY_ATTRIBUTE_MIN 3, a production percent at that share of the copies' cost; quests at STORY_QUEST_SHARE 0.5): A89
      lost a point to +25% toward walls. One merchant for any focus while a route pays it back twice (MERCHANT_PAYBACK 2) and 2
      resource slots are free.
    - **Mementos by age** (the game allows any civilization in any age: Catherine played Russia, a Modern one, in Antiquity):
      every pair is scored in every age with that age's ability (`python -I tools/memento-advisor/build_table.py`, TABLE_VERSION
      2, keys `<LEADER>|<CIV>@<AGE_TYPE>`, then `<LEADER>|*@<AGE>`, then `*|*@<AGE>`; 5,817 picks, 394 KB, decoded on first
      read). The age chosen for (`ageReaders` in mma-context.js): the start age in the front end; in game the successor of
      Game.age, the 'Age' parameter's next by sortIndex the fallback. The row names it («Екатерина II + Россия (Античность)»),
      and `[MMA] advice for <L> + <C> in <AGE> (Age parameter X, next by sortIndex Y, successor of Game.age Z)` each time the
      tab opens (`; they disagree: the successor is taken` when they do).
    - **Not built:** a push for triumphs one step away (four in Antiquity), converting rival settlements (opt-in).

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
