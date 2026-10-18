# Cities against towns: a video's model of the 1.4 rules, checked against our games

The user sent the script of a video, `cities-vs-towns-script.txt` in the repo root (a player's spreadsheet model of cities, towns and urban centres after the Test of Time update, and two replays of one game). They asked: «maybe it will be helpful to balance cities». Each claim is below, with what the game's data and our logs (game 28: research/34) say, and what changed.

## 1. Building costs rise with every city, linearly
- **The claim:** each city adds 10% of a building's base cost, not 10% compounding. A University: 437 with one city, 513 with three, 551 with four, 627 with six. A "+15% production toward buildings" bonus divides that cost again (627 → about 545).
- **Checked:** the video's own numbers rise by 38 a city, linear. The parameters are not in the game's XML (the executable has them).
- **For us:** nothing to change in the plan. It reads the real cost of each building in each city (`getConstructibleProductionCost`), so the city count and production bonuses are in it already.
- **Not modelled:** a new city raises every city's building costs. The town advisor does not price that when it weighs a conversion.

## 2. Each building in a city raises the next one's cost there
- **The claim:** +5% of the base cost per building already in that city, production buildings aside. It concerns that city only, not the city count.
- **For us:** the same as §1. The game's cost per city already includes it.

## 3. Specialists repeat their tile's whole adjacency
- **Agreed:** that is how the planner values them since game 1.4.0 (root gotcha 49).
- **The side the video plays down:** their Happiness upkeep. Game 28 lost most of its Modern yields to it (research/34 §1–§3).
- **Changed:**
  - A specialist's own yields now count at what an unhappy city keeps (research/34 §3).
  - Cards with Happiness per specialist, or a change to specialist upkeep, are now priced in each city (research/34 §1).

## 4. A city costs far less in Antiquity than later
- **The claim:**
  - a fifth city costs about 1,000 gold in Antiquity and 3,000 in Exploration;
  - a city kept through the age change («keep your cities») costs nothing more;
  - a town converted on the new age's first turn, before the dedications are chosen, costs about 900, since only the capital counts as a city then.
- **The game's data:**
  - Exploration: `TOWN_UPGRADE_BASE_COST` 700, `TOWN_UPGRADE_PER_CITY_COST` 700, `TOWN_UPGRADE_MAXIMUM_COST` 3000;
  - Modern: 800, 1000 and 5000;
  - Antiquity's defaults are in the executable.
- **Game 28** (our gold line, cheapest conversion):
  - Antiquity: 250–475;
  - Exploration: 1,075–1,500 (from the fourth city at half the 3,000 cap, so some discount applied);
  - Modern: 2,500 (half the 5,000 cap).

  The relative claim holds: the same city costs 3–5 times as much an age later.
- **Game 28 stopped at 1:1 in Antiquity:** 3 cities and 3 towns. The floor rule then allows only towns the Towns tab rates CONVERT, and none were. Income was 16–27 a turn.
- **The transition trick** is the player's move here. The autopilot switches itself off at the end of an age (AGE_OVER); in game 28 the player chose the dedications at 00:38. Our first Exploration pass came after that, when the cities were back (3 cities; cheapest conversion 1,150).
  - **How:** before choosing «keep your cities», convert a town that was not a city in the last age.
  - **Not automated:** there is no evidence yet of its cost at that moment in this version.

## 5. How many cities, and when
- **The video's model, for science:**
  - Antiquity: 5 cities (4 is close in Antiquity alone, but the fifth is cheap there and expensive later);
  - Exploration: start with 6. Build that core first; the first extra city around turn 50 (in the Distant Lands, for the Harbor's economic attribute point); more at turns 60–80. The target is 8–9 cities;
  - Modern: no blanket conversions.
- **Ours:** 1:1 is a floor, then only CONVERT verdicts (decision 3, research/21 §9). Game 28 had 3 cities in Antiquity, 6 by E40, 6 in Modern.
- **Changed** (`CITY_TARGETS`, `cityTarget` in core/xpl-strategy.js; `conversionRule({ cityTarget, healthy })`):
  - **The targets:** with the science or economic focus, any town may convert while there are fewer cities than the target: Antiquity 5; Exploration 6 in its first half, 8 after; none in the final age (only the existing city per Launch Pad, `minCities`).
  - **The health guard:** the target waits while any city stands below zero Happiness (`citiesHealthy`). Research/34 §2: repair the cities we have before paying for more.
  - **The tooltip:** the strategy's tooltip says so (LOC_XPL_AP_STRATEGY_TT_CITY_TARGET).
- **Kept:** the savings goals and their 12-turn horizon, the late-age stops (LATE_CONVERSION_TURNS, FINAL_CONVERSION_TURNS), and the calm checks.

## 6. Urban centres
- **The claim:** about 8–9 by the late game for science. Start Exploration with 2 urban centres and 2 gold towns (Resort, Mining, Hub), and buy the first Observatories around turns 15–20. One centre costs over 5,000 gold to fill (Observatory 960, University 1,600, Kiln, Pavilion, warehouses), more than a 3,000 conversion. Some never pay back.
- **Ours:** the science strategy leans Growing towns to Urban Center (`townFocusBias` URBAN), and towns buy the path's buildings an Urban Center allows (`townLevers`).
- **Not changed:** game 28's income was 18–100 a turn in Modern, a long way from paying for centres at that rate.

## 7. The Modern Military Academy is a production building
- **The claim:** rush it in the main cities (+50 with adjacency in the video's capital), then Schoolhouses.
- **The game's data:** +9 Production base, Production adjacency from resources and wonders, cost 420. An Ironworks is +4 for 535. It is tagged PRODUCTION, MILITARY and URBANCENTER.
- **Ours:** both production first and the peacetime "no military building" rule (research/21 E2) skipped it as military. So did the Antiquity Barracks (+3), the Exploration Armorer and Shipyard, and the Modern Airfield, all tagged PRODUCTION too.
- **Changed:** a building tagged PRODUCTION is not a military building (`isMilitaryBuilding`).

## 8. Spare cities on science projects
- **The claim:** in Modern, two cities run the space projects and the rest run «Научная инициатива» (production into science), to keep pace with the strongest AI.
- **Ours:** a city with nothing else to build takes the cheapest project (`lastResort`). Research/31 found Launch Pad cities stuck on it for 36–75 turns while their pad never came; the space work now comes first.
- **Not changed.**

## 9. More cities to out-research the strongest AI
- **The claim:** a strategic one, from two replays of one game: 2,000 science against 1,400 at Exploration's end.
- **Ours:** game 28 won the science victory at M93 with 6 cities; the best rival had 31 Innovation when our countdown began.
- **The check:** the city target of §5 is how this gets tested. The next games should compare Innovation at each age's end, the turn Rocketry comes, and the cities' turns below zero Happiness.
