# 39 notes: towns against cities, Modern production, and Launch Pads (game 1.5.0.44)

Read-only pass, 2026-10-18. Paths are relative to `Base/modules/` of the game (`D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`) unless they start with `DLC/`, `Logs/` (the current game's logs in `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs`, game 32, Great Britain in Modern) or `research/` (this repo).

Labels: **VERIFIED** (read in the game's files or logs), **WEB** (a player or press source; date and URL given), **INFERRED** (a deduction or a fit to logged numbers).

Helper scripts (scratchpad, not in the repo): `r39_bld.py` (a building's rows across the ages), `r39_mods.py` (every modifier of a given effect, and what attaches it).

Research/38's `38-notes/data.md` already covers the Innovation sources, the tech path to Rocketry and the project bonuses. This note does not repeat them; it adds to them.

---

## 1. Towns and cities

### 1.1 What a city has that a town does not (VERIFIED)
| | Town | City | Source |
|---|---|---|---|
| Production | All of it becomes gold. No production queue. | A production queue: units, buildings, wonders, projects. | `base-standard/text/en_us/Civilopedia_Concepts_Text.xml:597,1966,1981` |
| What it can get | Only buildings bought with gold. Towns can buy only `Town="true"` buildings (gotcha 12). | Anything it can build. | :245, :1590 |
| A Town Focus at population 7 | Yes. Every Focus but Growing stops growth and sends food to connected cities. | No. | :603, :627 |
| Growth | +50% while Growing. | Normal. | :597 |
| Specialists | None. "only Cities can gain Specialists". | Yes. The cap is `CITY_WORKER_STARTING_CAP`: 1 in Exploration, 3 in Modern. | :245, :1590; `age-exploration/data/gameplay-systems.xml:28`, `age-modern/data/gameplay-systems.xml:23` |
| Projects (Launch Pad work, Preparation) | Not possible: towns have no queue. | Yes. | :1966 |
| A building cost on the empire | None. | Each city beyond the capital raises the cost of every non-Warehouse building in the empire by 10%. | The convert dialog `base-standard/text/en_us/ProductionChooserText.xml:106-107`; Civilopedia_Concepts_Text.xml:587 |
| GDP points | Factory resources only. | Also slotted city and bonus resources, and imports. | `base-standard/text/en_us/Civilopedia_Victories_Text.xml:50` |

- **Warehouse buildings** are not made dearer by the number of cities or by other buildings (`Civilopedia_Concepts_Text.xml:2029`). That is the per-city 10% and the per-building +5% `Constructible_BuildingCostProgressions` (`age-modern/data/constructibles.xml:797-812`).
- **The convert action** is a purchase: `CityCommands.sendRequest(townID, PURCHASE, {Directive: ORDER_TOWN_UPGRADE})` (`base-standard/ui/production-chooser/production-chooser-operations.js:38`). Its price is `city.Gold.getTownUpgradeCost()` (`panel-production-chooser.js:205,489,640`). `Logs/CityPurchase.csv` logs it as `ORDER_TOWN_UPGRADE`.

### 1.2 The conversion cost
**The parameters** (VERIFIED, `GlobalParameters`):
| Parameter | Antiquity | Exploration | Modern |
|---|---|---|---|
| `TOWN_UPGRADE_BASE_COST` | 400 (exe; WEB, below) | **700** (`age-exploration/data/gameplay-systems.xml:26`) | **800** (`age-modern/data/gameplay-systems.xml:21`) |
| `TOWN_UPGRADE_PER_CITY_COST` | 300 (exe; WEB) | **700** (:25) | **1000** (:20) |
| `TOWN_UPGRADE_MAXIMUM_COST` | 1000 (exe; WEB) | **3000** (:24) | **5000** (:19) |
| `TOWN_UPGRADE_MINIMUM_COST` | 200 (exe; WEB) | not overridden | not overridden |
| `TOWN_UPGRADE_PER_POP_DISCOUNT` | 50 (exe; WEB) | not overridden | not overridden |

- **The Antiquity defaults are compiled into the game.** The names `TOWN_UPGRADE_BASE_COST`, `_PER_CITY_COST`, `_PER_POP_DISCOUNT`, `_MINIMUM_COST`, `_MAXIMUM_COST`, `_IF_CAPTURED_COST`, `_COST_MULTIPLIER`, `_COST_DISCOUNT` and `TOWN_UPGRADE_DISCOUNT` appear only in `Base/Binaries/Win64/Civ7_Win64_*.exe` (VERIFIED, string search). No XML sets them.
- **Their values come from a player's database dump** (WEB, CivFanatics «Formula analysis», Acken, post #22, 2025-04-16: 400 / 200 / 1000 / 50 per pop / 300 per city / captured ×2.0; https://forums.civfanatics.com/threads/formula-analysis.695108/page-2).
  - The same thread's later per-age numbers (500/400/2000 and 600/500/3000, 2025-04-22) are older than the 1.5 XML above. The XML wins.

**The formula** (INFERRED: the dump's parameter names, Civilopedia's "the more population a Town has, the cheaper", fitted to game 32's logs):

`cost = speed × clamp( (BASE + PER_CITY × cities − PER_POP × town population) × (1 − discount%), MIN, MAX )`

- **speed:** Online 0.5. `cities` counts the capital.
- **discount%:** the `EFFECT_CITY_ADJUST_TOWN_UPGRADE_DISCOUNT` modifiers:
  - −50% (a 50% rise) for Great Britain, in every age (`DLC/great-britain/modules/data/civilizations-shared-gameeffects.xml:7-9`; attached by `civilizations-antiquity|exploration|modern.xml`);
  - +50% for six leaders' Expansionist attribute legend nodes (Ashoka, Augustus, Confucius, Ibn Battuta, Isabella, Pachacuti: `base-standard/data/progression-trees-common-gameeffects.xml:816-839`; Bolivar, Genghis Khan and Washington DLCs too);
  - +10% in a city with the Majapahit Pura quarter (`age-exploration/data/constructibles-gameeffects.xml:58-67`);
  - a Jarlig tradition for conquered towns (`age-exploration/data/traditions-tot-gameeffects.xml:798`).

**The fit, game 32** (Great Britain, so ×1.5; Online ×0.5; `Logs/UI.log` gold lines, `Logs/Player_Stats.csv` cities):
| Turn | Cities | Logged cost | Pre-speed, pre-Britain | Population the formula needs |
|---|---|---|---|---|
| A21 | 1 | 412 | 550 = 400 + 300 − 50p | p = 3 (plausible at A21) |
| A31 | 2 | 500 | the cap, 1000 × 0.5 | p ≤ 6 |
| A41 | 2 | 487 | 650 = 1000 − 50p | p = 7 |
| E11 | 2 | 1,087 | 1,450 = 700 + 1,400 − 50p | p = 13 |
| E21 | 2 | 1,425 (Liverpool) | 1,900 | p = 4 |
| E41+ | 3-4 | 1,500 | the cap, 3000 × 0.5 | - |
| M10-M60 | 4 | 2,500 | the cap, 5000 × 0.5 | - |

- **The cap is applied after Britain's +50%.** Game 28 (no Britain) also showed 2,500 in Modern (research/35 §4).
- **What follows** (INFERRED; check with `getTownUpgradeCost()` on two towns of different size):
  - **Population matters.** Each town pop takes 50 (25 gold at Online) off the price until the floor.
  - **Each city adds** 300 / 700 / 1000 before speed.
  - **Modern almost always sits at the cap** once 4+ cities stand: 800 + 4 × 1000 − 50p ≥ 5000 needs p ≤ −4.
  - **Game speed scales the price** (Online ×0.5 matches every observation). The other speeds are very likely their `CostMultiplier` (`base-standard/data/game-speeds.xml:16-46`).

### 1.3 What happens to cities at an age change (VERIFIED, `base-standard/scripts/age-transition-post-load.js`)
- **Every non-capital city becomes a town, under either setting.** `generateTransition()` (:26-65) calls `regressCitiesToTowns(iPlayer)` for every major *before* the Continuity check matters. That function (:1040-1056) sets `changeHasBuildQueue(-1)` on each settlement that is neither the capital nor already a town.
- **Continuity** (`AGE_TRANSITION_SETTING_KEEP_MORE`, :28-32) changes only:
  - units: `positionUnits` instead of `positionArmyCommanders` / `positionFleetCommanders` (:53-58);
  - the gold cap (:1354-1371): 6,000 entering Exploration and 9,000 entering Modern, instead of 3,000;
  - the influence cap (:1372-1389): 800 / 1,200 instead of 500.
  All of these go through `Game.EconomicRules.adjustForGameSpeed`.
- **The "keep your cities" card is generated for every player whose cities regressed, at every age change** (`generateRetainCityCards`, :1432-1470):
  - id `CARD_AT_EXP_GOLDEN_AGE_ECONOMIC` (also used entering Modern);
  - name `LOC_UNLOCK_AQ_DEFAULT_5_NAME` («You Bei Wu Huan»), text «All of your Cities from the previous Age remain Cities» (`base-standard/text/en_us/UnlockText.xml:1384-1389`);
  - **cost 1 Wildcard point**, `unlock: ""` (no legacy path needed), one effect per regressed city (`SettlementId`).
- **Points to pay for it:** every player gets 3 Wildcard points at each transition (`AgeTransitionLegacyPoints`, `age-exploration/data/age-transition.xml:11`, `age-modern/data/age-transition.xml:11`). So keeping all cities costs one of three default points, whatever the legacy paths did.
- **The economic Golden Age** (the Antiquity / Exploration economic path's third milestone) still grants `UNLOCK_WON_ECONOMIC_VICTORY_1/2` (`age-antiquity/data/legacy-path-gameeffects.xml:9-11`, `age-exploration/...:9-11`), and its text still says the cities remain (`base-standard/text/en_us/VictoriesText.xml:124-125, 293-294`). But no card row in 1.5's data uses that unlock (grep of all modules), so it is not the card that keeps the cities any more.
  - The Exploration golden age's "+2 population in Distant Lands cities" lives on as `CARD_AT_MOD_GOLDEN_AGE_ECONOMIC_POPULATION` (`age-modern/data/age-transition-gameeffects.xml:102-108`).
  - INFERRED: the economic golden age's city retention was replaced by the free-for-all wildcard card.
- **The dark-age military card** `CARD_AT_EXP_DARK_AGE_MILITARY` (Exploration only) gives 3 cavalry and siege armies and makes you lose all but the capital (:1391-1430).
- **Game 32 agrees** (VERIFIED, `Logs/Player_Stats.csv` player 0): 2 cities at Antiquity's end and 2 at E5; 4 at Exploration's end and 4 at M5. The card was taken both times (by the player, the autopilot being off then).
- **Civilopedia says "Only the Capital remains a City"** and that moving the capital spawns a second city (`base-standard/text/en_us/Civilopedia_Ages_Text.xml:56`). That is the state before the dedications are chosen.

### 1.4 How many cities, and when to convert
- **WEB, video model (the user's `cities-vs-towns-script.txt`, research/35 §4-§5):** 5 cities in Antiquity; start Exploration with 6, then 8-9; Modern: no blanket conversions. Convert on a new age's first turn, before the dedications, when only the capital counts.
  - **Checked against §1.2 (INFERRED):** at E1 with 1 city, a pop-11 town costs (700 + 700 − 550) × 0.5 = 425 at Online. With the card's 4 cities back it would be (700 + 2,800 − 550) × 0.5 = 1,475. The trick saves ~1,000 gold in Exploration.
  - **In Modern it saves ~2,500:** at M1 with 1 city, a pop-15 town costs (800 + 1,000 − 750) × 0.5 = 525, against the 2,500 cap.
  - **Order matters, but is not verified:** whether a town converted before the card is chosen is then counted as a regressed city is not known. The card lists the regressed settlement ids fixed at generation (:1450-1466).
- **WEB, 1:1 is the common baseline:** "a ratio of 1:1 when it come to city vs town" (Steam discussion, https://steamcommunity.com/app/1295660/discussions/0/591762818429109829; Game8 https://game8.co/games/Civ-7/archives/495205: cost rises with cities and falls with town size). Both are pre-1.4 (2025).
- **WEB, science guides:** put Launch Pads and Aerodromes in the highest-production cities, with secondary settlements supporting them; fill the settlement cap (aelgames / chillplacegaming guides, 2025; https://aelgames.com/civilization-7-science-victory-guide-strategies-leaders-and-civ-combos.html, https://chillplacegaming.com/civilization-vii-science-victory/). Pre-Innovation (old project chain), so only the "best producers" advice carries over.
- **INFERRED for space work:** only cities run projects (§1.1). A town converted in Modern at 2,500 then needs a ~670-840 pad, and Preparation at 1,000 a run. It pays only if it can reach Rocketry with ~50+ production. Spending the same gold on a pad in an existing city (~2,270 to buy at Online, research/38) is cheaper. So **cities for space work must exist before Modern**, or be converted on M1 before the card.

---

## 2. Modern production

### 2.1 Buildings (VERIFIED, `age-modern/data/constructibles.xml` unless noted; costs are Standard data, about ×0.8 at Online per research/38)
| Building | Cost (cost progression) | Production | Adjacency / extra | Upkeep (gold, happiness) | Unlock | Notes |
|---|---|---|---|---|---|---|
| **Ironworks** (ageless warehouse) | 535, none (:109) | +4 (:455) | +1 production on every mine, clay pit, quarry, woodcutter resource, oil rig, vegetated or wet feature, hill and mountain **tile in the city** (:703-710, :737-745) | 0 / 0 (:526-527) | Steam Engine (`progression-trees-tech.xml:64`) | Tags PRODUCTION_WAREHOUSE, WAREHOUSE, AGELESS (:243-245). Not dearer per city or building. |
| **Military Academy** | 420, +0% (:112, :805) | +9 (:458) | +1 per adjacent resource, +1 per adjacent wonder (`ResourceProduction`, `WonderProduction`, :582-583; defined `base-standard/data/constructibles.xml:286,293`) | 4 / 4 (:532-533) | Military Science (:76) | Tagged MILITARY and PRODUCTION (gotcha 60). The cheapest per production point. |
| **Rail Station** | 840, +0% (:118, :810) | +9, and +9 gold (:466-467) | gold from quarters and wonders (:596-597) | none listed / 4 (:541) | Industrialization (:101) | FULL_TILE (:247). Turns roads to railroads. +10% unit production with a railroad. Needed for a Factory elsewhere. |
| **Factory** | 780, +0% (:107, :802) | +12 (:453) | +1 per adjacent resource / wonder (:577-578) | 4 / 4 (:522-523) | Mass Production (:139) | `InRailNetwork="true"`: must be rail-connected to the capital (text `age-modern/text/en_us/ConstructibleText.xml:64-65`). One factory resource type. +1 resource capacity. |
| Airfield | 840, +0% | +9 (:449) | - | 4 / 4 | Flight | Science site (gotcha 25). |
| Launch Pad | 840, **+5% a previous building** (:111, :804) | 0; +18 science (:457; the text says +24, stale) | - | 4 / 4 (:530-531) | Rocketry (:185) | Flat terrain (:427), FULL_TILE (:246). |
| Earlier ageless warehouses still buildable | Brickyard 55, Saw Pit 55, Harbor 55 (`age-antiquity/data/constructibles.xml:114,122,124`); Sawmill 175, Stonecutter 175 (`age-exploration/data/constructibles.xml:101,103`) | +1 (Antiquity), +3 (Exploration) | +1 a matching tile, as the Ironworks | | | Tags PRODUCTION_WAREHOUSE + AGELESS. |

- **The DLC uniques** (America's Steel Mill and Railyard, Meiji's Jukogyo) are +9 production each (:472-475).
- **No Power Plant or Power Station** is in the base Modern data. Nepal's Highland Power Station is a civic-mastery unique (WEB, CivFanatics thread below).
- **Production per cost** (INFERRED, flat yield only; Online ×0.8 cost):

  | Building | Cost at Online | Production | Production per 100 production spent |
  |---|---|---|---|
  | Military Academy | ~336 | 9 + adjacency | ~2.7 |
  | Factory | ~624 | 12 + adjacency | ~1.9 |
  | Ironworks | ~428 | 4 + 1 a tile | 1.6 at 3 tiles, 3.0 at 9 |
  | Rail Station | ~672 | 9 (+9 gold) | ~1.3 |

  So: Military Academy first, the Ironworks in a hilly or mined city, then the Factory (which needs the railway).

### 2.2 Production bonuses that matter for space work (VERIFIED, `r39_mods.py`)
**Projects** (Preparation, Satellite, flights). Research/38 lists them; repeated with sources:
| Source | Effect | Where | Needs |
|---|---|---|---|
| Triumph LEGACY_MO_SCIENTIFIC_4 | +50% | `age-modern/data/legacies-gameeffects.xml:158`; `legacies.xml:343,374` | 5 urban districts with 120 yield each |
| Policy **Public Works** | +30% | `age-modern/data/traditions-gameeffects.xml:261`; `traditions.xml:187` | civic `NODE_CIVIC_MO_BRANCH_SOCIALISM` (`progression-trees-culture-common.xml:167`) |
| Policy **Think Tanks** | +10%, capital +20% | `traditions-gameeffects.xml:669-682`; `traditions.xml:170-171` | civic `NODE_CIVIC_MO_MAIN_GLOBALISM`, **Elective Republic only** (`progression-trees-culture-common.xml:101`) |
| Card CARD_AT_MO_SCIENTIFIC_2 | +25% (+ free Academics) | `age-modern/data/age-transition-gameeffects.xml:563` | Exploration science triumph |
| City-state bonus MODERN_20 | +25% in cities with a SCIENCE building | `age-modern/data/independents-gameeffects.xml:483-492` | suzerain |
| A diplomacy penalty (worker disruption) | −50% | `age-modern/data/diplomacy-gameeffects.xml:84` | an enemy action |

**Buildings** (which the pads are):
| Source | Effect | Where |
|---|---|---|
| Attribute node `NODE_ATTRIBUTE_SCIENTIFIC_02` | +15% building production, all cities, 1 attribute point | `base-standard/data/progression-trees-common-gameeffects.xml:457`; `progression-trees-common.xml:197,330` |
| Policy **Strategic Railways** | +20% buildings and improvements in cities with a Rail Station | `traditions-gameeffects.xml:435-444`; civic `NODE_CIVIC_MO_BRANCH_AUTHORITARIANISM` (`progression-trees-culture-common.xml:156`) |
| Great Britain (DLC) | +25% building production, +25% building purchase efficiency, conversions +50% dearer | `DLC/great-britain/modules/data/civilizations-shared-gameeffects.xml:7-18` |
| Resource Limestone | +10% building production per Limestone owned, empire-wide | `age-modern/data/resources-gameeffects-v2.xml:9` |
| Resource Coffee (factory resource) | +5% buildings and wonders per slotted | `resources-gameeffects.xml:40-45`; text `age-modern/text/en_us/ResourcesText.xml:71` |
| Coal / Oil | +10% Rail Station and Port / Factory per resource | `resources-gameeffects.xml:8,17,121` |
| Narrative rewards | +10-15% buildings, +25% one building type | `age-modern/data/narrative-stories-gameeffects.xml:211,2409,2971` etc. |

**Flat production:**
| Source | Effect | Where |
|---|---|---|
| Policy **Assembly Line** | +2 production a specialist, −2 food in towns | `traditions-gameeffects.xml:371`; `traditions.xml:204-205`; civic `NODE_CIVIC_MO_BRANCH_FASCISM` (:148) |
| Tobacco | +8 in a city with a Rail Station, else +4 | `resources-gameeffects.xml:319-330`; text :74 |
| Whales | +8; Wine, Ivory +4 | `resources-gameeffects.xml:215,249,106` |
| Pitch | Factory +1 production and +10% efficiency per Pitch | `resources-gameeffects-v2.xml:64-70` |
| Crisis policies Last Reserves / Grand Alliance | % production per hostile leader / ally | `traditions-gameeffects.xml:618,632` |
| Welfare State | **−5 production in cities** | :325 |
| Suffrage | −3 production in towns | :293 |

- **Celebrations (Golden Ages) give no production in Modern** (VERIFIED, `age-modern/text/en_us/GoldenAgeText.xml`):
  - Authoritarianism +20% toward *military units*;
  - Bureaucratic Monarchy +1000 gold (scaled by speed) or influence;
  - Elective Republic +1000 science or quarter culture;
  - Revolución culture, a free Infantry, influence or science.
- **Purchases instead** (pads can be bought):
  - Bureaucratic Monarchy: −5% building price in cities, −10% when Joyous (`age-modern/data/golden-ages-gameeffects.xml:32-48`; `governments.xml:34-35`); plus its 1000-gold celebration.
  - Attribute node `MOD_ATTRIBUTE_ECONOMIC_05_A`: −15% building price (`progression-trees-common-gameeffects.xml:221`).
  - The Factory Town focus: 100% gold efficiency for a Factory, Port or Rail Station there (`age-modern/data/projects-gameeffects.xml:137-145`).

### 2.3 Town Focuses (VERIFIED, `age-modern/data/projects.xml:37-43,65-71`; `base-standard/data/projects.xml:14-22`; text `Civilopedia_Concepts_Text.xml:603`)
- **No Focus moves production to a city.** "Production cannot be transported from Towns to Cities" (:643).
- What helps cities is **food**: every Focus but Growing (and Fort) sends the town's food to connected cities. Mining Town (`PROJECT_TOWN_PRODUCTION`): +2 production on extraction tiles, which the town turns into gold.
- So towns help space work through **gold** (pads bought) and **food** (city growth, then specialists), not production.
- **Factory Town** (`PROJECT_TOWN_FACTORY`): +1 resource slot and Factory / Port / Rail Station at 100% purchase efficiency. It needs an improved factory resource there.

### 2.4 The Launch Pad and Preparation at each speed
| | Data (Standard) | Online (observed) | Quick | Epic | Marathon |
|---|---|---|---|---|---|
| Crewed Space Flight Preparation (`age-modern/data/projects.xml:32`) | 2000 | **1000** (VERIFIED: research/38 from `CityBuildQueue.csv`) | ~1340 | ~3000 | ~6000 |
| Launch Pad (`constructibles.xml:111`) | 840, +5% a previous building | **672-924** (g30/g31); **777, 819** in game 32 (`Logs/CityBuildQueue.csv`) | ~756+ | ~924+ | ~1008+ |
| Radio Telescope (`PROJECT_CREWED_SPACE_FLIGHT_RESEARCH`) | 1200 | **600** (`Logs/CityBuildQueue.csv`, game 32) | | | |

- **Projects** scale with `CostMultiplier` (Online 50, Quick 67, Epic 150, Marathon 300; `base-standard/data/game-speeds.xml:16-46`): VERIFIED at Online, INFERRED elsewhere.
- **Buildings** scale about ×0.8 at Online (`ONLINE_SLIGHT` 80, :274-279). The other speeds are INFERRED from the SLIGHT row: Quick 90, Epic 110, Marathon 120.
- **Purchase prices** (VERIFIED from logs):
  - research/38: a whole pad ~2,270 gold at Online;
  - game 32: a pad under way bought for 664 (`Logs/UI.log` T58 `VICTORY_BOUGHT ["Космодром","Портсмут",664]`), Britain's 25% off.

---

## 3. Expert approaches to fast Launch Pads (WEB, thin)
- **Few player write-ups use 1.4/1.5's Innovation race.** The guides found describe the pre-1.4 chain (Trans-Oceanic Flight → Sound Barrier → Satellite → Staffed Space Flight):
  - gamerant https://gamerant.com/civilization-7-science-victory-walkthrough-scientific-legacy-path-modern-age-launch-first-staffed-space-flight-guide-civ-7/;
  - game8 https://game8.co/games/Civ-7/archives/498533;
  - sportskeeda https://www.sportskeeda.com/esports/how-win-science-victory-civilization-7.

  Their one lasting advice: Launch Pads in the highest-production cities.
- **1.4.0 (2026-05-19):** the science victory became a race to 100 Innovation, then a 5-turn defence of a Launch Pad. Specialists repeat 100% of adjacency and cost 2/4/6 food and happiness (patched.gg summary, https://patched.gg/games/civilization-vii/update-140-test-of-time-patch-notes; official notes https://support.civilization.com/hc/en-us/articles/51685242291219 refused the fetch).
- **Fandom** (undated; https://civilization.fandom.com/wiki/Crewed_Space_Flight_Preparation_(Civ7)): Preparation is repeatable, 2000 production (Standard), +15 Innovation, needs Rocketry and a Launch Pad. It agrees with the data.
- **CivFanatics «Peaceful science victory in Modern – extremely boring?!»** (2025-07-03/04, pre-Innovation; https://forums.civfanatics.com/threads/peaceful-science-victory-in-modern-extremely-boring.698892/):
  - the Deity player Berrern won at M81 with 3 settlements, one Launch Pad, then project spam ("Research Initiative") with forced end turns;
  - sixty4half: Fascism's production per specialist was "nerfed in a recent patch" (now Assembly Line's +2, §2.2).
- **INFERRED from the data, for an autopilot:**
  - **Pads in parallel.** Each pad city runs Preparation alone (gotcha 25), and Preparation is the only repeatable Innovation. So the number of pad cities sets the rate after Rocketry. Research/38's model: 3 pads bought on Rocketry's turn reach 100 about 12 turns after Rocketry, 1 pad about 20.
  - **Buy pads, build Preparation.** A pad costs ~670-924 production or ~2,270 gold, about 3 gold a production. Projects cannot be bought: the production chooser queries purchases only for `CityQueryType.Constructible` and `CityQueryType.Unit` (VERIFIED, `base-standard/ui/production-chooser/production-chooser-helpers.js:510,659`). So gold goes to pads and production goes to Preparation.
  - **Stack project %:** Public Works +30%, the CARD_AT_MO_SCIENTIFIC_2 +25%, the city-state +25%, Think Tanks +10/20% (Elective Republic), the triumph +50%. Their sum multiplies every Preparation run.
  - **Before Rocketry** the production buildings come first in each future pad city (Military Academy, Ironworks, Factory, gotcha 25's production-first rule), and the pad bank gold is held.

---

## Most useful for the autopilot
1. **The conversion price** is very likely `speed × clamp((BASE + PER_CITY × cities − 50 × town pop) × (1 − discount), MIN, MAX)`:
   - Antiquity 400 / 300 / cap 1000; Exploration 700 / 700 / cap 3000; Modern 800 / 1000 / cap 5000;
   - Online ×0.5; Britain +50%.

   Bigger towns are cheaper; Modern sits at the cap from ~4 cities. `getTownUpgradeCost()` stays the truth.
2. **Every non-capital city turns into a town at every age change**, under Continuity and Regroup alike. A dynamic card, «All your Cities from the previous Age remain Cities» (`CARD_AT_EXP_GOLDEN_AGE_ECONOMIC`), costs **1 of the 3 default Wildcard points** and is offered to anyone with regressed cities. The economic golden age no longer gates it.
3. **The age's first turn, before the card, is the cheapest conversion window:** only the capital counts as a city, so ~425 gold at E1 instead of ~1,475, and ~525 at M1 instead of 2,500. Whether the converted town then counts among the card's cities is untested.
4. **Only cities run projects**, and a town's production is all gold. Towns help space work by gold (buying pads) and food (Focus) only. Pad cities must be cities by Rocketry; a 2,500-gold Modern conversion is worse than buying a pad in an existing city.
5. **Production per cost:** Military Academy (+9, 420, no cost progression) > Factory (+12, 780, needs a railway to the capital) ≈ Ironworks (+4 +1 a tile, 535, ageless) > Rail Station (+9 / +9 gold, 840). Old warehouses (Brickyard / Saw Pit / Harbor 55, Sawmill / Stonecutter 175) remain cheap production.
6. **Project production stacks:** Public Works +30% (Socialism), Think Tanks +10% / capital +20% (Globalism, Elective Republic only), the +25% card, the +25% city-state, the +50% triumph. Building production: the scientific attribute +15%, Strategic Railways +20% (Rail Station cities), Limestone +10% each, Coffee +5% each. Welfare State costs 5 production in every city.
7. **No Modern celebration gives production.** Bureaucratic Monarchy gives gold (+1000 celebration, −5/10% building prices), which buys pads.
8. **At Online:** Preparation 1000, Radio Telescope 600, Satellite 500. A Launch Pad is 672+ with +5% for each building already in the city: build or buy pads in cities with few buildings, or early.
