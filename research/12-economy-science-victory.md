# 12. Economic and science victory, distant lands, treasure convoys; civ/leader/memento picks (game 1.5)

Read-only research, 2026-10-13. `<M>` = `Base\modules\`. A later correction to research/11: the Modern path "end steps" quoted in game text (World Bank in all capitals, First Crewed Space Flight) were **deprecated in 1.4.0** (`<M>age-modern\data\victories.xml:17-29` commented out). The 1.4+ victories are countdown races.

## Victories (1.4+)
- **Victory types:** `VICTORY_ECONOMIC_MODERN`, `VICTORY_CULTURE_MODERN`, `VICTORY_MILITARY_MODERN` and `VICTORY_SCIENCE_MODERN`, plus `VICTORY_SCORE` and `VICTORY_DOMINATION` (`<M>base-standard\data\victories.xml:28-34, 80-86`).
- **Economy, culture, military:** a domination race with a 5-turn countdown (`COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION`).
  - The lead needed over second place is `(DominationPercent + 100) / 100` × their score.
  - It falls as the age progresses (`VictoryDominationPercents`, victories.xml:179-228).
- **Science:** fixed score, 100 Innovation plus an undamaged `BUILDING_LAUNCH_PAD` (`REQSET_MODERN_VICTORY_SCIENCE_PREREQ`, victories-gameeffects.xml:19-26).
- **Switched on?** `Game.VictoryManager.isCountdownVictoryEnabled(type string | Database.makeHash(type))` (`ui-next\screens\victories\victories-screen.js:150-171`).
  - Setup keys: `ExcludeVictories`, `ExcludeLegacyPaths` (`core\config\SetupParameters.xml:79,84`). No UI code reads these keys.
- **Legacy paths switched off in setup** keep `EnabledByDefault=1` in GameInfo. The real filter is `player.LegacyPaths.getEnabledLegacyPaths()` → `[{legacyPath: hash, legacyPathClass: hash}]`.
- **Scores:**
  - `player.Victories.getPointsForVictoryType(hash)`;
  - target `Game.VictoryManager.getCountdownVictoryDominanceScore(hash)` (-1 = locked);
  - `getVictoryCountdownStatus(hash)` → `{isDominant, turns, prereqs}`;
  - `getScoringForVictoryType(hash)` → `[{name, points, turn, age, trackerType, id}]`.

## Economy (GDP)
| Source | GDP | From |
|---|---|---|
| Gold building of the current age | 2 per turn each | Currency (Antiquity tech) |
| City/bonus resource assigned to a **city** (not a town) | 1 per turn each | The Wheel |
| Imported resource (trade route) | 1 per turn each | Skilled Trades (civic) |
| Factory resource | 3 per turn each | Mass Production (Modern) |
| Treasure convoy unloaded | ~20 per cargo (global `TREASURE_CONVOY_VP_PER_POINT`, value not found) | Exploration |

- **Gold buildings:**
  - Antiquity: MARKET, LIGHTHOUSE.
  - Exploration: BANK, BAZAAR, GUILDHALL.
  - Modern: PORT, RAIL_STATION, STOCK_EXCHANGE (+ GINKO, MONEY_SHOP).
- **Factory** `BUILDING_FACTORY` (cost 780):
  - must be rail-connected to the capital; can be bought in towns;
  - one factory-resource *type* per settlement, +1 resource capacity.
  - Factory resources: COTTON, KAOLIN, COCOA, CITRUS, COFFEE, QUININE, TEA, TIN.
  - City API: `city.Resources.getFactoryResource()`, `getNumFactoryResources()`, `isTreasureConstructiblePrereqMet()`.
- **Modern economic legacy path "Railroad Tycoon"** (150/300/500): points per turn for factory resources in settlements that have a Factory and are connected by rail or port.
  - The AI's priorities: Factory 2000, Rail Station 1000, Port 1000, Department Store 500.
- **Great Banker** `UNIT_JOHN_MAYNARD_KEYNES` («Великий банкир»).
  - **How you get him:** the triumph `LEGACY_MO_ECONOMIC_1` «Железнодорожный магнат» (500 GDP from factory resources; capital gets the unit), or the Modern economic milestone 3.
  - **Where:** on any tile of a foreign capital. `Teleport`/`AllowTeleportToOtherPlayerCapitals`: `UNITOPERATION_TELEPORT_TO_CITY` canStart `{}` → `.Plots`, send `{X, Y}`.
  - **The action:** `UNITCOMMAND_ACTIVATE_GREAT_PERSON` with NO_TARGET, «Основать офис Всемирного банка».
  - **Cost:** 2000 gold, growing with every activation by any player (`greatpeople.xml:86`).
  - **Reward:** about 1000 GDP once per capital (unverified).

## Science (Innovation)
- **Modern projects:**
  - `PROJECT_CREWED_SPACE_FLIGHT_PREP`: 15 Innovation, **repeatable**, needs a Launch Pad, cost 2000.
  - `PROJECT_LAUNCH_SATELLITE`: 5, needs a Launch Pad.
  - `PROJECT_TRANS_OCEANIC_FLIGHT` and `PROJECT_BREAK_SOUND_BARRIER`: 5 each, need an Aerodrome.
  - `PROJECT_CREWED_SPACE_FLIGHT_RESEARCH`: 5, needs a Radio Station.
  - All of them are `CityOnly`.
- **Exploration projects:** `PROJECT_INVENT_CALCULUS` 10, `PROJECT_HELIOCENTRIC_MODEL` 5.
- **Antiquity projects:** `PROJECT_CHART_THE_STARS` 5, `PROJECT_SPHERICAL_EARTH` 5.
- **Other Innovation:**
  - tech masteries (2–5 each), Rocketry 5, Future Tech 2–3;
  - science wonders 3 each;
  - each codex displayed in Antiquity: 1.
- **Launch Pad** `BUILDING_LAUNCH_PAD` («Космодром»): cost 840, flat tile, takes the whole tile, unlocked by Rocketry.
- **Queueing a project:** `CityOperations.canStart(city, BUILD, {ProjectType}, false)`, then `sendRequest(... {ProjectType})`. Cost: `city.Production.getProjectProductionCost(type)`.
- `PROJECT_LAUNCH_ROCKET` is probably unbuildable now: it needs a completed legacy path. Do not rely on it.
- **Culture:** World's Fair is just a 2-point tourism tracker. **Military:** Operation Ivy is only a triumph now.

## Exploration: distant lands, treasure convoys
- **Telling distant lands from the homeland:**
  - `player.isDistantLands({x, y})` (bool);
  - `city.isDistantLands` (bool property);
  - `GameplayMap.getLandmassRegionId(x, y)`.
  - Names: Далекие земли / Родина.
- **Where convoys come from:** a Distant Lands settlement with an improved `RESOURCECLASS_TREASURE` tile.
  - Treasure resources: FURS, COCOA, SPICES, SUGAR, TEA, HORSES, GOLD(_DISTANT_LANDS), SILVER(_DISTANT_LANDS), RUBIES.
  - Also some civs: Songhai (river treasure in the Homelands after the Kanta civic), Inca, and the endeavor `ESTABLISH_TREASURE_FLEET`.
- **The convoy unit:** `UNIT_TREASURE_FLEET` («серебряный караван»), a land unit, civilian formation, 2 moves, captured when beaten.
  - **Cargo:** the number of improved treasure resources (`unit.getDisbandBaseAmount()`, GDP `unit.getDisbandVictoryPoints()`).
  - **Delivery:** move it inside the borders of a **Homeland** settlement, then `UNITCOMMAND_DISBAND` («Разгрузка») with NO_TARGET.
- **City APIs:** `city.Resources.canStartTreasureFleet()`, `getTurnsUntilTreasureGenerated()`, `getProducedTreasureFleetPoints()`.
- **Legacy paths:**
  - Exploration economic «Серебряный флот»: 10/20/30 treasure points.
  - Exploration military «И целого мира мало»: 4/8/12. A distant-lands settlement is worth 1 founded, 2 conquered, more if it follows your religion.
- **The game's settle suggestions:** `player.AI.getBestSettleLocationsForSettler(n, from)` → `[{location, factors}]`. In Exploration they favour the foreign hemisphere (+200) and treasure (+50).
- **Crossing the ocean:**
  - Cartography lets civilians (settlers, convoys) embark into deep ocean.
  - The ocean deals 11 + rand(10) damage per turn until Shipbuilding.
  - The Shipbuilding mastery lets all embarked land units enter deep ocean.

## Picks for an economic game (base game unless marked DLC)
- **Leader traits:** `TRAIT_*_VICTORY` traits only steer the AI; a human gets nothing from them.
- **Leader:** **Amina** («Амина»). Ability: +1 resource capacity in cities, +1 Gold per age per resource assigned to cities.
  - Her level-3 attribute: +25% Gold from trade and treasure convoys.
  - Alternatives:
    - Xerxes, the Achaemenid (DLC `friedrich-xerxes-alt`): +1 trade route limit with everyone, Gold per route or road.
    - Isabella: natural wonder Gold, Spain.
    - Machiavelli.
- **Civilizations for Amina:** **Aksum → Songhai → America** («Аксум → Сонгай → Америка»).
  - **Aksum:** coastal resource Gold, +1 trade route, unlimited trade range.
  - **Songhai:** +2 resource capacity in river cities; treasure convoys from rivers in the Homelands.
  - **America:** Industrial Park +1 GDP per factory resource; unlocked for Amina by 3 Distant Lands settlements on Plains or Grassland.
  - **Fallbacks:** Mughal (+100% Gold); Chola (+1 GDP per imported resource); Qing.
- **Mementos:**
  - **Base game:** Kwalkwali («Квалквали», Amina level 5: +1 Gold per age per resource in cities) + Corpus Juris Civilis («Свод Юстиниана», +1 policy slot) or Lydian Lion («Лидийский лев»).
  - **With DLC:** Gold Fluted Phiale («Золотая ребристая фиала», Xerxes: +1 trade route with all) + Kwalkwali.
  - **One slot only** (Foundation level below 5): Complaint to Ea-nāsir (+1 Economic attribute point).
- **For a later science game:**
  - **Leader:** Benjamin Franklin (or Confucius).
  - **Civilizations:** Han → Ming → Great Britain (DLC), or Meiji (base game).
  - **Mementos:** Yasakani no Magatama (Himiko level 9: Science per mastery) + Corpus Juris Civilis.
