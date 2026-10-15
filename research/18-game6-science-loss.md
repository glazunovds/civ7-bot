# 18. Game 6: a science game lost to culture at 45/100 Innovation (what went wrong, what we do not use)

From the logs on 2026-10-13. We were Franklin: Han → Ming → Great Britain, science focus, the autopilot on every turn. Agent reports with all the evidence are in the session scratchpad (`forensics-game6-science.md`, `forensics-game6-empire.md`).

## Result
- **Who won:** Harriet Tubman's America (player 5), by culture on Modern turn 47. The ages ran 70 / 70 / 49 turns.
- **Our Innovation:** 20 at the end of Antiquity, 29 at the end of Exploration, about 45–47 at the end. The best rival had 14 / 27 / 36.
- **Our science led all game:** 153 / 250 / 671 a turn at the end of each age, against 92 / 245 / 412 for the best rival. We still lost by far.
- **The winner:**
  - culture of 388 a turn against our 86;
  - 18 wonders against our 1, among them the Great Library, Oxford and the Eiffel Tower;
  - 23 great works displayed against our 6;
  - 4 cities and 9 towns.

## Where the Innovation came from
| Age | Points | Sources | What was missed |
|---|---|---|---|
| Antiquity | 20 | 11 codices displayed, Chart the Stars 5, Literacy 2, Future Tech 2 | Spherical Earth 5 (never queued: the "expansion first" rule, we sat at 3 settlements under a cap of 4–5 from turn 35); 2 codices with no slot (the 12-codex triumph missed at 11) |
| Exploration | +9 | Heliocentric Model 5 (turn 44), Shipbuilding and Architecture masteries 2 each | Invent Calculus 10 (it unlocks with the Urban Planning *mastery*, reached only on turn 65, then queued behind a Hospital); Social Class 2 (picked on turn 66); Metallurgy and Metal Casting masteries; Future Tech |
| Modern | +16–18 | Rocketry 5 (turn 39), Aerodynamics mastery 5, four masteries 2 each | Every project: the Launch Pad was finished only on turn 48, and Trans-Oceanic Flight had 1 turn of production |

- Project costs were half the XML values (the game speed).
- The rough budget (research/14) is about 75 Innovation from one-off sources across the three ages, plus 15 per Crewed Space Flight Preparation. We collected about 45 of that 75 and none of the 15s.

## Why
1. **Gold never built up (the biggest issue).**
   - `buyBuildings` (the plan's purchases) spends everything above the reserve every pass, best value per gold first, and warehouses always rank first: 88 buildings bought, ~14,000 gold, nearly all warehouses in towns.
   - `buyVictoryWork` "waits for gold" for an item it cannot afford, but nothing kept that gold: no `VICTORY_BOUGHT` in the whole game (a Laboratory, Airfield or Launch Pad costs ~1,300–1,600).
   - `convertTowns` needs the conversion cost above the reserve: about 530–1,550, and the spare gold was 150–480. **One town was converted all game** (Antiquity 45). Towns outnumbered cities 2–5 to 1, but only cities run projects and build Launch Pads.
   - America saved 1,000+ gold, converted, and had 3–4 cities within 5 turns of each age start.
2. **Two cities = two project queues.**
   - Production in the cities was 66–75 and 47–59 a turn; the empire's 350 was mostly towns, whose production becomes gold.
3. **Research order in Exploration:** Innovation hides behind masteries (Heliocentric = Education mastery, Calculus = Urban Planning mastery). Innovation civics (Literacy, Social Class) were taken only when nothing of the path was left.
4. **Production off the science path:**
   - Wonders: the Eiffel Tower was lost to America (460 production), held up by a Tank and a Settler put ahead of it; Oxford was queued and never worked on; Dogo Onsen sat in front of the second Launch Pad.
   - Military: a Military Academy, a Landship and a Tank. 14 upgrades in Modern with no war; unit upkeep 135 gold a turn.
   - Antiquarians (explorers digging artifacts, which are culture) for ~670, and Modern settlers for ~410.
   - The Airfield was built on Modern turns 17–25 and then waited 16 turns for the Flight mastery (the Rocketry gate holds masteries back).
5. **The final age is short.** Rocketry came on Modern turn 39, and the culture win came on turn 47.

## Other faults seen
- **Antiquity false threats:** a peaceful village and a crisis camp's guards. Fixed the same day (research/17 "Game 6").
- **Exploration turn 1 held:** a Ming policy slot left empty. Fixed with POLICY_FORCED.
- **Front-loading ping-pong:** a settler and a scout moved to the front of the capital's queue in turns (Modern 19–24); the settler moved to the front three turns running (Exploration 31–33).
- **The same BUILD twice in one pass:** VICTORY_WORK, then QUEUED_PLAN, for the same building (Library at Antiquity 45, Laboratory at Modern 17).
- **A conversion and a purchase in the same pass:** `buyBuildings` did not count the gold the conversion had just spent.
- **Melee strikes never fired:** on 16 turns, every adjacent raider was "without the game's prediction". `simulateAttackAsync` / `SimulateCombatResult` never answered in game; investigate.
- **Фучжоу was founded 4 tiles from an independent camp** (Exploration 12) and lost at Exploration 22. The village rule should have rejected the site: check `villagesOf` in game (log the villages it sees).
- **Declining a call to arms ends the alliance:** `CANCEL_ALLIANCE` is the game's own decline. Three alliances ended (Exploration 20, Modern 38, Modern 42).
- **Repeats:** `VIEWED_ADVISOR_WARNING` 2–3 times a turn for the same notification; open borders proposed to Tubman 13 times.
- **Towns:** every town took the Resort Focus, except one Fort Town and one Hub.

## Mechanics the autopilot does not use for science
- **Urban Center town Focus:** +1 Science and Culture on quarters, and the town can buy science and culture buildings. That means codex slots (Library, Academy), Universities, Schoolhouses and Laboratories in towns. Our Focus advice values only the +1 per quarter.
- **Innovation wonders:** Great Library, Nalanda, House of Wisdom, Shwedagon, Oxford, Manhattan Project, 3 Innovation each. Our wonder choice does not count Innovation.
- **Saving gold for a goal:** conversions, Launch Pads, Laboratories.
- **Science legacy cards at the age changes** (the player's choice): +25% project production, +1 specialist. In game 6 the player took the economic card that keeps cities as cities, which was useful.

## Is the science victory unbalanced?
Not by itself, but it is the slowest and the most production-hungry, and the AI's culture can be fast.
- The one-off sources give about 75. A good run reaches about 55 at the start of Modern: Antiquity 25–30 (codices, both projects, Literacy, a wonder) plus Exploration 25–30 (Calculus, Heliocentric, Social Class, masteries).
- Then Rocketry by Modern ~turn 30 and 2–3 cities running Crewed Space Flight Preparation would finish in time.
- Game 6 lost about 25–30 points to fixable causes and had 2 project queues instead of 4–6.
