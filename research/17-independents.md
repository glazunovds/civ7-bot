# 17. Independents: how game 5's settlements fell, the rules, and what the autopilot gets wrong (game 1.5)

Read-only research, 2026-10-13, after game 5 (Franklin, Han → Ming → Great Britain, science focus; lost to an economic victory). `M\` = `Base\modules\`, `TXT\` = `M\base-standard\text\en_us\`. Sources: the game files, plus game 5's logs (`DiplomacySummary.csv` "City Capture" / "At War", `CombatLog.csv`, `Independents.csv`, `AI_Tactical.csv`, `Player_Stats.csv`, `Balance_Happiness.csv`, UI.log `[XPL]`, `net_message_debug.log`). [I] = inferred, not seen.

## How game 5's settlements were lost
| Age, turn | Settlement | Taken by | Attackers | Why it fell |
|---|---|---|---|---|
| Antiquity 62 | Лянчжоу (city, a town until turn 57) | **revolt**, joined Maurya | none | Crisis card «Честолюбивые губернаторы» (−6 Happiness in cities, turn 56), then the town was converted into a city on turn 57: unrest that turn, revolt on 62 |
| Exploration 11 | Фучжоу (town, founded turn 6) | tribe 16 | 1 swordsman | Our founding 5 tiles from its village made it hostile that same turn |
| Exploration 14 | Интянь (town, founded turn 6) | tribe 17 | swordsman, 2 heavy archers | Founded 4 tiles from two villages: both hostile that turn |
| Exploration 59 | Кайфэн (town, founded turn 54) | tribe 15 | cog, man-at-arms, carrack | Founded 4 tiles from its village |
| Modern 6 | Цзинань (city) | tribe 6 | 1 Line Infantry, 2 hits | Village back at war from turn 1 (age change) |
| Modern 6 | Ханчжоу (town) | tribe 7 | 1 Line Infantry, 2 hits | The same |
| Modern 11 | Гуйлинь (town) | tribe 17 | 1 Line Infantry | Spawned hostile on turn 3; our settler waited inside |
| Modern 41 | Ливерпуль (town, founded turn 17) | tribe 12 | 2 riflemen | Our founding of Манчестер 4 tiles from its village (turn 30) made it hostile |

- **Every independent capture was razed** within 1–3 turns. Cities and towns both fall; ships capture coastal ones too.
- **Not raids.** Each was taken by the village's own standing units (AI tactic "Independent Capture City", `M\base-standard\data\Independents.xml:99`) from 4–6 tiles away.
- **Map-wide it was mostly us:** independents took 9 settlements, our 7 plus 2 of Maurya's in Antiquity. Independents attacked us 100 times in Exploration, each rival 2–22 times.
- **Nobody dispersed a village, and nobody incited a raid,** all game.

## The rules
### Hostility
- **Settling near a village** (`TXT\Civilopedia_Concepts_Text.xml:708`): within 3 tiles it turns hostile at once; at 4–6 tiles the relationship drops one level (friendly → neutral, neutral → hostile). Seen in game 5: "At War, Surprise" the same turn as each founding, 5 times.
- **At an age change** (`Civilopedia_Ages_Text.xml:56`, seen in the logs):
  - The previous age's city-states return as villages on the same tile, at war with every major except their former suzerain. In Exploration 9 of 12 were at war with us; in Modern 7 of 10.
  - New villages spawn on turns 2–7.
  - Defenders per village: 1 / 3 / 4 by age. Combat units: up to 5, about one new unit every 4 turns.
  - The AI gets free walls at each age start (`REQSET_AI_EX_WALLS`, `age-exploration\data\difficulties.xml:9-10`); we do not.
- **Spawn affinities:** every MILITARISTIC village is hostile; the rest roll (`age-*\data\independents.xml` `Affinities`). The setup option `IndependentHostility` is FRIENDLY / DEFAULT / HOSTILE.
- **Hostile means at war** (`localPlayer.Diplomacy.isAtWarWith(owner)`).
- **The war ends only by befriending:** at befriend progress 30, or when anyone becomes its suzerain. There is no "make peace with an independent" action.

### Raids
- **Raid operations target only players at war with the village** (`AI_Base.xml:289-292`).
- **Team sizes:** a raid is 2 units (1–2 in Antiquity); a large raid 4+; Modern raids up to 5 (`age-modern\data\ai-modern.xml:33-34`).
- **The raid:** gather (up to 10 turns), move within 4 tiles, then 5 turns of attacking units, pillaging and hitting the city, then return.
- **Seen:** first raids on Antiquity turn 18, Exploration 6, Modern 8; each tribe every 5–10 turns.

### District defence
- **Centre HP:** a city or town centre has 100 HP. Walls add 100; the previous age's walls give half, older ones nothing.
- **Defence strength = the strongest melee unit the owner has trained, minus 10** (`Civilopedia_Concepts_Text.xml:229, 708`).
  - Seen in game 5 (`CombatLog.csv`): our centres had 30 in Exploration against Swordsmen at 35, and 20 in Modern against Line Infantry at 50. One Line Infantry took a centre in 2 turns.
  - We trained no melee unit in Exploration or Modern: our defenders were Xunleichong and Mortars, both ranged.
- **Walls by age** (all `Purchasable="false" Town="true"`, tag FORTIFICATION):

  | Age | Walls | Cost | Unlocked by |
  |---|---|---|---|
  | Antiquity | `BUILDING_ANCIENT_WALLS` | 60 | Masonry |
  | Exploration | `BUILDING_MEDIEVAL_WALLS` | 150 | Castles |
  | Modern | `BUILDING_DEFENSIVE_FORTIFICATIONS` | 535 | Military Science |

  - The Civilopedia says a centre's walls can be bought. The game refused, in towns, with X and Y given.
- **Towns have no production queue:** they only buy, so a town cannot get walls at all.
  - Exception: the town Focus **Fort Town** (`PROJECT_TOWN_FORT`, population 7). It lets the town buy FORTIFICATION and MILITARY buildings, and gives fortified districts +25 HP and +5 healing (`projects-gameeffects.xml:6-41`).
- **Towns can buy units:** `CityCommands.canStartQuery(PURCHASE, CityQueryType.Unit)`, price `city.Gold.getUnitPurchaseCost` (`production-chooser-helpers.js:659, 676`).
- **District health:** `Players.Districts.get(pid).getDistrictHealth(loc)` / `getDistrictMaxHealth(loc)`; event `DistrictDamageChanged`.

### Befriending (`DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN`)
- **Cost:** 80 / 160 / 240 Influence by age, plus 20 for each suzerainty or befriending under way.
- **Stages:** at progress 30 the village turns friendly and **the war ends**; at 60 it becomes our city-state.
  - Seen: peace 6–8 turns after the start; done in 8–15 turns.
- **Who can be befriended:** hostile villages can. Crisis encampments cannot (`CanBeBefriended="false"`).
- **Speeding it up:** `SUPPORT_DIPLOMATIC_ACTION` costs 10 / 20 / 30 Influence a time.
- **Other actions (Influence by age):**
  - Levy a unit from our city-state: the unit's Production cost.
  - Bolster military: 60 / 120 / 180.
  - Incorporate: 240 / 480 / 720.
  - Incite a raid against someone: 60 / 120 / 180.

### Dispersing a village
- **The operation:** `UNITOPERATION_DISPERSE_INDEPENDENT`, by a military unit standing on the village, with `NO_TARGET` args (`unit-actions.js:955-1062`). It works with 0 moves left.
- **Reward:** 100 of the village's yield (30 Influence for a diplomatic one). `INDEPENDENT_GOLD_FOR_DISPERSAL` is 400 in Exploration and 600 in Modern; how it is paid is engine-side.
- **Penalty:** −30 relationship with a leader who was befriending it.
- **Villages are often empty** (120 "No Defender at camp" rows in `Independents.csv`): their units are out raiding.

### Combat bonuses against independents
- Militaristic attribute node 01: +5.
- Policy Honor (Antiquity, civic Discipline): +3.
- Bastion commander line: Garrison, +10 HP to the city's districts.

### APIs
- **Villages are not cities.** `player.Cities` is empty for a village; only a city-state has a city.
  - The game's banners read `player.Constructibles.getConstructibles()` → `{type, location, cityId}` with type `IMPROVEMENT_VILLAGE` or `IMPROVEMENT_ENCAMPMENT` (`M\base-standard\ui\city-banners\city-banner-manager.js:170-189`).
- **Relationship:** `Game.IndependentPowers.getIndependentRelationship(indepId, pid)` → `IndependentRelationship.FRIENDLY | NEUTRAL | HOSTILE | NOT_APPLICABLE`.
- **Lookups:** `getIndependentPlayerIDAt(x, y)`, `getIndependentPlayerIDFromUnit(unitId)`, `isIndependentEncampment(id)`, `independentVillageDiscoveredByPlayer(id, pid)`.
- **Befriending in progress:** `Game.Diplomacy.getInfluenceIndependentData(uniqueID).location` and `getCompletionData(uniqueID).turnsToCompletion`.

## What the autopilot did wrong (code and logs)
1. **It cannot see villages.** `data/xpl-player-facts.js` `gatherSettlements` reads independents from `player.Cities.getCities()`, which is empty for a village.
   - So the site search's `INDEPENDENT_PENALTY` and the `FOREIGN` 5-tile rule never applied to villages. Every site it chose was 4–5 tiles from a village we had seen.
   - Befriending orders independents by distance to their cities: all Infinity.
   - `approach` walks to their cities: none.
2. **Befriending sent 4–6 requests in the same second; only the first ever started.** The Influence paid for one; we logged BEFRIEND for all.
   - Exploration turn 13: tribe 12 started; the attackers 16 and 17 never did.
3. **The threat check needs 2+ hostile units within 4 tiles.** Single Line Infantry took Цзинань, Ханчжоу and Гуйлинь. Ливерпуль dropped off the list at 3 HP with one rifleman left.
4. **Defenders were only trained, in cities, behind items with progress.** Интянь's defender came out a turn after it fell.
   - **Not one unit was bought all game** (0 of 95 purchases; the AI civs bought 94).
   - Gold available during the sieges: 226–952. It went to buildings, a town conversion and unit upgrades.
5. **No melee unit was trained in Exploration or Modern** (`bestMilitaryOrder` takes the highest Tier, which was a ranged unit). So every centre defended at 20–30.
6. **Ranged units shot the most damaged target in range:** scouts, and an empty village tile at strength 5, not the swordsman hitting Интянь. 9 Xunleichong were lost.
7. **Settlers waited inside threatened towns** (SETTLER_WAITS) and died there.
8. **Antiquity revolt:**
   - the autopilot slotted both −6 Happiness crisis cards (PYP valued each at −4.8);
   - it converted a town into a city during the unrest crisis;
   - it did nothing about the unrest except repair the Harbor the unrest kept damaging.

## Also from game 5 (science items)
- **Modern research:** every tech researched was on Rocketry's way. Two masteries (Radio's, Flight's) were taken first, about 6,000 science; they unlock Crewed Space Flight Research and Trans-Oceanic Flight. Break the Sound Barrier is Aerodynamics' mastery. Rocketry needs 14 of the 17 Modern techs.
- **Modern science buildings in the ~65-production capital:** Schoolhouse 4 turns, Laboratory 9, Radio Station 10. The Airfield was unfinished after 8 turns.
- **Antiquity:** the settlement cap was 3 until about turn 40, then 4. We had 1–2 settlements most of the age.

## Fixed (2026-10-13, after game 5; root CLAUDE.md gotchas 27–28, mod/CLAUDE.md "Defence against independents")
| Problem above | Fix |
|---|---|
| 1. Villages invisible | `villagesOf` reads the independents' constructibles; sites keep 3 tiles from any village and 6 from one not friendly (`angersVillage`, settlers' `tooCloseToForeign` too); befriending orders by village distance; `approach` walks to villages. |
| 2. Befriending | One Influence spend a pass; threatening, then hostile, then nearest; an unaffordable first one keeps the Influence. |
| 3. Threat check | One hostile unit within 2 tiles, or one within 4 while the centre is damaged, is a threat too. |
| 4. Defenders | Bought on the spot in threatened settlements (towns too, all the gold) and in exposed ones (within 6 of a village at war with us, no soldier near; gold above the reserve). |
| 5. No melee units | Defenders are the strongest melee unit; one melee unit as strong as the best trainable is always kept. |
| 6. Ranged targets | Soldiers attacking a settlement first, then soldiers; never an empty tile. |
| 7. Settlers in threatened towns | Walk to a safe settlement of ours. |
| 8. Antiquity revolt | No town converted while unhappy, in unrest, or with less than 6 Happiness during a crisis. |
| Walls in towns | Fort Town for threatened or exposed growing towns at population 7, then their walls bought. |
| No village dispersed | Soldiers walk onto empty villages at war with us within 4 tiles and disperse them. |
| Modern research | Rocketry's way first; masteries after. |
| Modern science buildings | No Radio Station, no Crewed Space Flight Research; more Launch Pads and the Airfield only where done within 10 turns, else bought. |
| Antiquity wonders | None (and no science project) while below the settlement cap with «Поселенцы» on. |

Not done: crisis cards are still chosen by Policy Yield Previews' value (both −6 Happiness cards were valued −4.8); nothing yet reacts to a settlement in unrest (assign happiness resources, a commander, happiness buildings).

## Game 6, Antiquity (Han): false threats while gold ran out
Read from the logs at the start of Exploration.
- **No independent ever raided or attacked us after turn 36.** `CombatLog.csv` has 8 fights involving us all age, the last on turn 36; `Independents.csv` launched 13 raids and 2 assaults, all against other civilizations.
- **Yet two towns were "threatened" every turn from about turn 55 to the end:**
  - Tribe 18, camp (22,32): at peace with us since turn 22 (NEUTRAL). Our threat check counted any independent not FRIENDLY.
  - Tribe 24, the Invasion crisis encampment (spawned turn 49, camp (24,34), 4 tiles from Лоян and Чэнду): at war, but its units only fortified at the camp or wandered 1–2 tiles from it (`AI_Tactical.csv` "Defend Camp", "Wander Near Camp"). It cannot be befriended, and its camp never stood empty, so it was never dispersed.
- **What the false threats cost:** walls queued in Лоян four times, walls bought in Чэнду (120, the treasury fell 122 → 17), garrisons bought (100, 120), defenders and the "strong melee" unit queued (a Chariot, then a Horseman in Лоян and another in the capital), unit upgrades.
- **Gold:** income fell from +42 (turn 45) to −13..−18 (turns 64–70), the treasury hit 0 on turn 66.
  - Crisis cards (forced, all bad): «Варвары-наемники» (+100% military upkeep), «Мятежные командиры» (−1 Happiness in cities per commander promotion), «Бандитизм» (−5 Gold per imported resource), «Дань» (−10 Gold per city-state we are suzerain of).
  - With a negative income the gold reserve was 0, so every purchase could spend the treasury to the bottom.
- **Fixed:** only HOSTILE independents count; a village's guards at home do not (unless next to the settlement or its centre is damaged); with a negative income the reserve covers 10 turns of the deficit and no new upkeep is added (strong melee unit, exposed garrisons, the advisor's soldiers, upgrades away from threats).
- **Seen working:** no settlement founded near a village made it hostile (no "At War" after our land claims); settlers retreated from threatened settlements 3 times; one befriending at a time (tribe 12 became our city-state on turn 50).
