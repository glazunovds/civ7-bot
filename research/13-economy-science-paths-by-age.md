# 13. Economic and science legacy paths in every age: what scores, what the autopilot can push (game 1.5)

Read-only research, 2026-10-13, for the autopilot's victory levers before an economy-focused game. `<M>` = `Base\modules\`, `AQ` = `<M>age-antiquity\data\`, `EX` = `<M>age-exploration\data\`, `MO` = `<M>age-modern\data\`. Complements research/11 (paths, triumphs) and research/12 (Modern victories, distant lands, convoys).

## Antiquity science «Great Library»: 3 / 6 / 10 codices displayed
- **Scoring:** `VICTORY_ANTIQUITY_SCIENCE_GREAT_WORK_SCORING`, `MODIFIER_PLAYER_ADJUST_GREAT_WORK_SCORING` with `GreatWorkObjectType=GREATWORKOBJECT_WRITING`, VP 1 (AQ victories.xml:50,63-65).
  - The engine does the counting. The text is "Display 10 Codices", and archived works are "inactive", so only slotted codices count. That is inferred, not seen in code.
- **Codex sources:**
  - **Tech masteries** (`UnlockDepth="2"`, `MOD_AQ_CODEX`, AQ progression-trees-tech.xml): WRITING :93, MASONRY :105, CURRENCY :113, BRONZE_WORKING :127, NAVIGATION :144, ENGINEERING :148, MILITARY_TRAINING :155. MATHEMATICS gives 2 (`MOD_AQ_MATHEMATICS_CODEX`, :159).
  - **Civic** `NODE_CIVIC_AQ_MAIN_LITERACY` base (`MOD_AQ_CODEX_CIVIC`, `UnlockDepth="1"`, culture-common.xml:119).
  - Base total: 10. The Assyria DLC renames the modifiers to `*_REDUX` and adds the WHEEL mastery (11).
  - **Others:**
    - Nalanda (+1);
    - the scientific city-state bonus `CITY_STATE_BONUS_ANTIQUITY_17`;
    - goody huts;
    - narrative events;
    - civ great people (Sappho, Ptahhotep, Ban Zhao, Laozi);
    - the Assyria and Ottoman DLC civs.
  - **Generic test:** a `GameInfo.ProgressionTreeNodeUnlocks` row whose `TargetType` contains `CODEX`. Its `UnlockDepth` is the depth that grants it.
- **Slots** (`GREATWORKSLOT_WRITING` or `_ANY`):
  - **Palace:** 1.
  - **`BUILDING_LIBRARY`:** 2. Cost 90, Writing base.
  - **`BUILDING_ACADEMY`:** 3. Cost 180, Mathematics base.
  - **Great Library:** 3 ANY. Mathematics mastery.
  - **Nalanda:** 2 ANY.
  - Library and Academy are city-only.
- **No free slot:** the codex goes to the archive. The advisor warns with `ADVISOR_WARNING_NO_CODEX_SLOT` / `_CODEX_NEEDS_TO_BE_SLOTTED`.
- **Counting codices displayed:** there is no direct count. Use `city.Constructibles.getGreatWorkBuildings()` → `slots[].greatWorkIndex` → `Game.Culture.getGreatWorkType(i)` → `GameInfo.GreatWorks.GreatWorkObjectType === "GREATWORKOBJECT_WRITING"`.
- **Triumphs** (AQ legacies-gameeffects.xml):
  - `LEGACY_AQ_SCIENTIFIC_1`: Chart the Stars + Spherical Earth.
  - `_2`: 5 districts with 30+ yield.
  - `_3`: 12 writing works, not archived.
  - `_4`: first to Mathematics.
- **What the AI weighs** (AQ victories.xml:171-199): Academy 800, Library 400, Nalanda 200, `NODE_TECH_AQ_MATHEMATICS` 2000.

## Antiquity economy «Silk Roads»: 7 / 14 / 20 resources assigned
- **Scoring:** `MODIFIER_PLAYER_ADJUST_RESOURCE_SCORING` with `CitiesOnly=false`, so **towns count** (AQ victories.xml:51,66-68).
  - The game's counter is `player.Stats.getTotalAssignedResources()` (`age-antiquity\ui\advice\advice-items-antiquity-economic.js:39`).
- **Getting resources:**
  - A resource is gained when its tile is **improved** (the growth EXPAND on it).
  - A trade route copies the destination settlement's resources.
  - Bonus resources go anywhere; city resources only to cities; empire resources are never assigned.
- **Capacity per settlement:**
  - Base 1 (`BaseResourceCapacity`).
  - Antiquity traits add +1 for cities and +2 for the capital (town 1, city 2, capital 4).
  - **`BUILDING_MARKET` +1, `BUILDING_LIGHTHOUSE` +2** (AQ civilizations-common-gameeffects.xml:22-46).
  - Also: Colossus +3; Monk's Mound +4; policy `TRADITION_COMMODITIES` +1 per city (Commerce civic); `TRADITION_AQ_ATTRIBUTE_ECONOMIC_01` +1 with a gold building; an economic city-state +2 in the capital; Camels (2 bonus slots); Amina.
- **Trade:**
  - `UNIT_MERCHANT` is unlocked by `NODE_CIVIC_AQ_MAIN_CODE_OF_LAWS` (uniques `UNIT_VAISHYA`, `UNIT_WATONATHI`).
  - Base capacity: 1 route per civilization.
  - A resource can go only to a settlement in the same trade network as its origin (`city.Trade.isInTradeNetwork()`, `Game.Resources.getOriginCity(v)`).
- **Triumphs:**
  - `LEGACY_AQ_ECONOMIC_1`: 26 assigned.
  - `_2`: 7 trade routes.
  - `_3`: 8 GOLD-tag buildings.
  - `_4`: spend 10,000 gold.
  - `_5`: 18 empire resources.
- **What the AI weighs:** merchants 400, `PSEUDOYIELD_RESOURCE_IMPORT` 100, Citizenship civic 500.

## Exploration science «Просвещение» (Enlightenment): 1 / 3 / 5 districts with 40 total yield
- **Rule:** "Have 5 Districts that are not the City Center with 40 total Yield each".
  - It counts the **sum of all yields** on the tile.
  - It is almost certainly urban tiles only: the narrative quest with the same wording uses `REQUIREMENT_PLAYER_HAS_X_URBAN_DISTRICTS_WITH_YIELD`, `YieldAmount` 40.
  - **Implementation:** `MODIFIER_PLAYER_ADJUST_HIGH_YIELD_DISTRICT_SCORING`, `YieldNeeded=40`, VP 1 per district (EX victories.xml:61,101-103).
  - Live or cumulative is not visible (engine). Check in game.
- **What puts yield on an urban tile:**
  - Buildings' base yields, e.g. University 8 science (upkeep 3 gold, 3 happiness).
  - Their adjacencies.
  - **Each specialist adds one more copy of all the tile's buildings' adjacency.**
    - Specialist base yield is 0. Upkeep in Exploration is −4 food and −4 happiness (WorkerYields + age modifier).
    - Use `NextYields − CurrentYields` from `city.Workers.GetAllPlacementInfo()`. The game's `model-place-population.js` still assumes an old +2 base.
  - A University adds +1 science on every quarter tile of its city.
  - Policy `TRADITION_ENLIGHTENMENT` (Social Class civic): +2 science per specialist.
- **Specialists per tile:** `CITY_WORKER_STARTING_CAP` = 1 in Exploration. +1 each from `NODE_TECH_EX_EDUCATION` and `NODE_TECH_EX_URBAN_PLANNING` (`MOD_EX_SPECIALIST_CAP_INCREASE`, UnlockDepth 1). Also from an age-transition card and a capital attribute civic.
- **API:**
  - Tile yields: `GameplayMap.getYields(idx, pid)`.
  - Urban tiles: `city.Districts.getIdsOfType(DistrictTypes.URBAN)`; centre `city.Districts.cityCenter`.
  - Place a specialist: `PlayerOperations ASSIGN_WORKER {Location, Amount: 1}`.
- **Triumphs:**
  - `LEGACY_EX_SCIENTIFIC_1`: 5 urban tiles with 75 yield; reward +1 specialist cap.
  - `_4`: 7 Universities.
  - `_2`: Heliocentric Model + Calculus projects.
- **Exploration economy (treasure)** is only points from unloaded convoys: 1 per improved treasure resource in the origin settlement. Already handled (research/12).

## Modern economy «Железнодорожный магнат» (Railroad Tycoon): 150 / 300 / 500
- **Rule:** points per turn for each **factory resource assigned to a settlement with a Factory and on the rail or port network** (VictoriesText.xml:532).
  - The GDP tracker `VICTORY_TRACKER_SLOTTED_FACTORY`: 3 per turn per slotted factory resource, cities and towns (`<M>base-standard\data\victories.xml:113`).
  - It is switched on by `NODE_TECH_MO_MASS_PRODUCTION`.
  - Triumph `LEGACY_MO_ECONOMIC_1` = 500 from that tracker. Its reward is the Great Banker.
- **Railroads:**
  - No unit builds them. A road between two settlements that **both have `BUILDING_RAIL_STATION`** becomes rail (`ROUTE_RAILROAD RequiredConstructible`).
  - The network is everything rail-linked to the capital, which needs its own station.
  - **`BUILDING_PORT`** plus a station link settlements across water. Both carry the `RAIL_CONNECTION` tag.
  - Unlocks: Rail Station from `NODE_TECH_MO_INDUSTRIALIZATION` (it takes a full tile); Port from `NODE_TECH_MO_STEAM_ENGINE`.
- **Factory:** `InRailNetwork="true"` (MO constructibles.xml:107), so its `canStart` fails until the city is on the network. The game's own tutorial uses that `canStart` as the test.
  - No JS "is rail connected" call exists. Per tile: `GameplayMap.getRouteType` → `ROUTE_RAILROAD`.
- **Factory resources:** cotton, kaolin, cocoa, citrus, coffee, quinine, tea.
  - **One type per settlement**, copies allowed.
  - Capacity: Factory +1, Port +2, capital +2.
  - API: `city.Resources.getFactoryResource()` / `getNumFactoryResources()`. "Has a Factory" in Modern is `isTreasureConstructiblePrereqMet()`.
  - Assign with `ASSIGN_RESOURCE`; unassign with `Action: Deactivate`.
- **Other GDP:**
  - Gold-tag buildings of the age, 2 per turn each: Port, Rail Station, Stock Exchange, Ginko, Money Shop. The Factory is PRODUCTION-tagged.
  - City and bonus resources in cities, and imports: 1 each.
  - Capitalism: improved oil or coal, 4 each.
- **Triumphs:**
  - Wealth of Nations: 12 trade routes.
  - Rail Baron: 12 Rail Stations, then +3 per gold building.
  - Dōjima: 60 assigned.
  - Workshop of the World: 30 factory resources, +1000 GDP.
- **What the AI weighs:** Factory 2000, Rail Station 1000, Port 1000, Department Store 500, `PSEUDOYIELD_RAIL_CONNECTION` 300, factory-resource sites +50.
- **Order:** Rail Station in the capital → Rail Stations elsewhere (Port + Rail Station across water) → Factory once `canStart` succeeds → fill each Factory with copies of one factory-resource type.

## Levers chosen for the autopilot (victory focus, by age)
| Focus | Antiquity | Exploration | Modern |
|---|---|---|---|
| Science | Library, then Academy, in every city (codex slots); research codex masteries and Literacy first; archive → slots (exists) | University in every city; research Education / Urban Planning first; specialists stacked on the urban tile closest to 40 total yield | Innovation projects + Launch Pad (exists); research toward the Launch Pad and projects |
| Economy | Market and Lighthouse in every city (capacity); growth prefers resource tiles; merchants up to route capacity | Convoys + distant lands (exist); growth prefers resource tiles; research Shipbuilding | Rail Station (capital first), Port, Factory in every city; factory resources into Factory settlements, one type each; research Industrialization, Mass Production, Steam Engine |

## Findings from three economy games (2026-10-13), and corrections
Read from the game's own logs. They are the evidence sources: `CityBuildQueue.csv` (every city's production per turn, all players), `DiplomacySummary.csv` (wars, peace, suzerains), `Player_Stats.csv` (cities, towns, settlement cap, techs, yields), `Player_Treasury.csv` (gold), `Player_Legacies.csv` (triumphs) and `GameCore.log` (the line `Team 0 has won 1 place in a 'VICTORY_…' victory!`).

- **`GameInfo.LegacyPaths` holds every age's paths.** In Exploration it listed Antiquity's paths first (no goal there), then Exploration's, then Modern's.
  - Keep the current age's rows (`Age` column). For each class, take the path with a goal.
  - Before this fix, the focus found no path after every age change.
- **`player.LegacyPaths.getEnabledLegacyPaths()`** may still list the setup age's paths after an age change. Match by `legacyPathClass` too, as the tutorial panel does.
- **`GameInfo.Victories` has `VictoryClassType` (`VICTORY_CLASS_CULTURE`…), not `LegacyPathClassType`.** The rows: `base-standard/data/victories.xml`.
- **Moving a queue item ahead of the item in production** gives the newcomer the old item's progress, and the excess over its cost is lost.
  - Seen: the Pyramids at 136/137 became a Market, and later a Lighthouse took their progress too.
  - A unit moved ahead of a wonder did not take its progress; the wonder resumed.
  - The autopilot never moves anything ahead of an item with progress (`frontSlot`).
- **The game's production advisor recommends wonders and units with no caps.** It queued Erdene Zuu while a rival was 10 short of it, the same temple in two cities, and a scout in every empty queue (32 scouts). Wonders now come only from the race-checked wonder step, and the advisor's units are capped.
- **Tech prerequisites:** `GameInfo.ProgressionTreePrereqs {Node, PrereqNode}`.
  - Shipbuilding needs Feudalism and Heraldry. Mass Production needs Industrialization and Combustion. Rocketry (the Launch Pad) has 14 prerequisites.
  - Research now heads toward the nearest of the path's techs.
- **Science under the Gold priority was far too low.** Only 3 techs came in a whole Modern age, with no Factory.
  - The economy focus now keeps science up (GOLD_SCIENCE) while its techs are missing.
  - In the next game Mass Production came about 8 turns into Modern.
- **Policies:** swaps are allowed only when `Culture.canSwapCultureSlot(POLICY_CULTURE_SLOT)` says so (after a civic or a government). Deactivate, then Activate.
- **Leader attributes:**
  - Trees: `GameInfo.Attributes` → `ProgressionTreeType`. Nodes: `Game.ProgressionTrees.getTree(pid, type).nodes`.
  - Points: `Identity.getAvailableAttributePoints(AttributeType)` / `getWildcardPoints()`.
  - Buy: `BUY_ATTRIBUTE_TREE_NODE {ProgressionTreeNodeType}`; the game confirms with `AttributeNodeCompleted`.
- **Walls:** `TypeTags FORTIFICATION` (Ancient Walls, Medieval Walls, Defensive Fortifications); towns may buy them.
- **Formations:** one military unit per tile, and one of each other `FormationClass`. A settler and a scout are both FORMATION_CLASS_CIVILIAN. When stacked, only MOVE_TO is allowed.
- **Victory came from:** Ports, trade routes (26), assigned resources and gold buildings. The economic victory was won once without Factories, and once with them on the way.

## Next: polish the science victory path
Done on 2026-10-13 (research/14 lists what changed): items 1, 2 (the 120 mark and the Exploration 75 mark), 4, and 5 (settlers leave by a safe way; melee soldiers strike raiders). Item 3 is still to be seen in a game. The original list:
1. **Modern:** the Launch Pad needs Rocketry, 14 techs deep. The SCIENCE profile plus research toward the path should get there; verify the turn it arrives.
   - Buy the Launch Pad and the science buildings with gold (like the economy buildings).
   - Run `PROJECT_CREWED_SPACE_FLIGHT_PREP` (15, repeatable) in more than one city.
2. **Science triumphs worth pushing:**
   - «Составная прибыль» (5 urban tiles at 120 yield: +50% production for projects): the specialist stacking already aims at 120.
   - «Чудо над Мохаве» (first to Break the Sound Barrier).
   - E=mc² (all techs).
3. **Exploration «Просвещение»** (5 urban tiles at 40) and **Antiquity codices** (10 displayed): not yet seen in a game.
4. **Science buildings** (Library, Academy, University, Laboratory…) are bought only from the plan. Consider making them the science focus's buildings in every age and buying them like the economy ones.
5. **Not science, but seen:**
   - Raiders kept a settler waiting a whole age. It should try a safe site away from them after a few turns.
   - The raiders' pillaging cost 35 repairs. Walls everywhere under a lasting threat, or a way to deal with the raiders' camp.
   - **Evidence from game 4** (UI.log, `DiplomacySummary.csv`):
     - Independent 23 declared war on turn 14 and captured one of our settlements on turn 16. Its befriending (started turn 15) never left VERY_HOSTILE.
     - 6–7 of its units then stayed within 4 tiles of the capital for the rest of Antiquity.
     - A settler waited inside a settlement 39 turns in Antiquity (Аксум) and 49 in Exploration (Саба). `runFromDanger` makes a settler that stands in a settlement with a hostile unit within 3 wait there, and it never looks for a safe site.
     - 47 repairs were bought (1,868 gold) and 11 queued, mostly 12-gold improvements.
     - No WALLS line appears: the walls step came after the threats ended, so it is untested in game.

The science victory's rules and the gaps they reveal: research/14.
