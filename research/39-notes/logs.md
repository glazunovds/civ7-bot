# Research/39 notes: logs (cities and production, games 28-32)

Evidence used (read-only; extracted copies in the session scratchpad):
- Game 28: `ev/g28` (`ui-evidence.jsonl` = the `[XPL]` lines of UI.log with their UI.log line numbers, CSVs). Assyria (Xerxes).
- Game 29: `ev/g29`. Its CSVs and `ui-evidence.jsonl` hold two games. Game 28 is age segments 0-2; game 29 (Maya, then Inca) is segments 3-5, from UI.log line 1792062 on. Assyria in GameCore.log's header is game 28's.
- Games 30, 31, 32: `UI.log` and CSVs. Great Britain (Ada Lovelace), science focus.
- In every game we are player 0. `Game.turn` restarts each age: A = Antiquity, E = Exploration, M = Modern. "L123" is a UI.log line number. CSV rows are cited by age and turn.
- Scripts (outside the evidence folders): `scratchpad/r39/ext.py` (gold, goals, conversions, spending), `stats.py` (Player_Stats), `cbq.py`, `modprod.py`, `sinks.py` (CityBuildQueue), `innov.py` (Innovation per turn).

VERIFIED = read in a log. INFERRED = my reasoning from those numbers.

## 1. Overview

| Game | Cities at A end | Cities E20 / E40 / E end | Cities in M | Rocketry gate open | 100 Innovation | Result (GameCore.log) |
|---|---|---|---|---|---|---|
| 28 | 3 (cap 7) | 4 / 6 / 6 (cap 10) | 6 of 15-16 settlements (cap 17) | M51 (73%) | M88 (the clock had no end: the final age ran to M93) | science win, 01:20:42 |
| 29 | 3 (cap 5) | 3 / 4 / 8 (cap 11) | 8 of 10 (cap 16-17) | M45 (64%) | M64 | science win, 03:23:34 |
| 30 | 3 (cap 5) | 3 / 5 / 6 (cap 11) | 6 of 11 (cap 16-17) | M36 (51%) | M62 | science win, 16:50:07 (countdown done ~M67) |
| 31 | 3 (cap 5) | 3 / 4 / 6 (cap 11) | 6 of 11-15 (cap 16-17) | M38 (54%) | never (83 at M46) | lost: Augustus's culture, 17:52:30 (~M48) |
| 32 | 2 (cap 6) | 2 / 2 / 4 (cap 12) | 4 of 10-15 (cap 16-17) | M47 (67%) | never (83 at M60) | lost: Franklin's culture, 20:56:32 (~M61) |

All VERIFIED. Sources: city counts from Player_Stats.csv (rows every 10 turns) and the `strategy:` lines; the gate from the first Modern `strategy:` line with `gate open` (g32 UI.log L933957, M47; g30 L673371, M36; g31 L735463, M38; g28 UI.log L1130956, M51; g29 UI.log L2770199, M45). Innovation is from `victory races: … SCIENCE N/100`.

Innovation at M1 was close in every game: 47 (g28), 60 (g29), 55 (g30), 62 (g31), 58 (g32). The games differ in Modern: the two losses never reached 100 before a rival's culture countdown ended. VERIFIED.

## 2. Cities: conversions and what kept them waiting

### 2.1 Conversions by game (TOWN_CONVERTED, cost in gold)

| Game | Antiquity | Exploration | Exploration gold on conversions |
|---|---|---|---|
| 28 | A28 Кальху 250, A50 Арби-Илу 400 | E12 Аррапха 1,075, E25 Шираз 1,500, E32 Ахваз 1,500 | 4,075 |
| 29 | A22 Ушмаль 250, A42 Уак-Кабналь 400 | E29 Антавайлья 1,250, E42 Уилька-Уаман 1,500, E49 Сауса 1,500, E60 Чичен-Ица 1,500, E67 Куско 1,500 | 7,250 |
| 30 | A26 Сток-он-Трент 337 (L15166), A45 Шеффилд 487 (L39819) | E26 Бирмингем (L205724), E37 Лидс (L272216), E47 Ливерпуль (L350010), 1,500 each | 4,500 |
| 31 | A32 Бристоль 262 (L31033), A54 Ливерпуль 487 (L96226) | E30 Ньюкасл (L250624), E44 Глазго (L314351), E60 Сандерленд (L424959), 1,500 each | 4,500 |
| 32 | A28 Бирмингем 337 (L16013), A63 Портсмут 262 (L80112) | E39 Ливерпуль 1,350 (L267049), E54 Глазго 1,500 (L411369) | 2,850 |

VERIFIED. g28 lines: L18660, L76386, L207822, L289249, L355145; g29 lines: L1810535, L1849951, L2122488, L2257535, L2333369, L2461825, L2545079. No game converted a town in Modern (2,500 each; `cheapest conversion … 2500` in every Modern gold line).

The pace is the same in four games: two cities in Antiquity (about A25 and A45-A54), then one conversion every 10-14 turns in Exploration. Game 29 managed five in Exploration because almost all its Exploration gold went to conversions: 7,250 of about 8,100 spent. VERIFIED.

### 2.2 Prices and income

- **Antiquity:** 250-500 gold a conversion; income 16-28 a turn on average (A rows). VERIFIED.
- **Exploration:** 1,075-1,500 (the first one in g28 and g29 1,075-1,300, then 1,500); income 80-102 on average:

  | Game | Average Exploration income |
  |---|---|
  | 28 | 93 |
  | 29 | 94 |
  | 30 | 102 |
  | 31 | 82 |
  | 32 | 80 |

  A conversion is 15-19 turns of income. VERIFIED (ext.py average over each gold line).
- **Game 32:** income was 52-89 from E10 to E45 (L122977-L310308). The cheapest conversion was Лидс at 1,087 from E8 to E40, Ливерпуль at 1,350-1,425. VERIFIED.

### 2.3 Game 32 in detail: why 2 cities until E40

1. **Antiquity: a city lost to a revolt.**
   - Бирмингем became a city at A28 (L16013). At A60 it made 21 production and 32 science (economy line, F/P/S/C 44/21/32/2).
   - It left the empire at A61: Player_Stats goes from 2 cities and 2 towns (A61) to 1 and 3 (A62), with the same 4 settlements. Брэдфорд was founded the same turn (SETTLE_FOUND, UI.log ~L71300).
   - The autopilot then answered the crisis story «Бунт» (L71351; net_message_debug.log line 8403: `CHOOSE_NARRATIVE_STORY_DIRECTION … LOYALTY002D`). In the game's text, LOYALTY002A is "The citizens of {city} are extremely unhappy. They have risen in revolt… You have lost control of this Settlement". 002D («So be it») only picks the consolation: +2 Happiness per age.
   - VERIFIED. That the revolt came from Бирмингем's own Happiness is INFERRED from the story text; per-settlement Happiness is not in the logs.
   - Портсмут was then converted at A63 for 262 (L80112). It came back as a city at E2, as gotcha 31 describes.
2. **Exploration: the savings goal flipped, and the gold went to defence.** The goal spans (the last gold line of each turn) were:

   | Turns | Goal |
   |---|---|
   | A68-E16 | none (19 turns; the cheapest, Лидс, cost 1,087-1,162) |
   | E17 | CONVERT Лидс 1,087 |
   | E18-E21 | CONVERT Ливерпуль 1,425 |
   | E22 | Лидс |
   | E23 | Ливерпуль |
   | E24 | Лидс |
   | E25-E29 | LEVER Университет (Бристоль) 668 |
   | E30-E31 | CONVERT Лидс |
   | E32-E40 | CONVERT Ливерпуль 1,387-1,350 (bought E39/E40, L267049) |
   | E41-E44 | LEVER Университет (Бристоль) 728 |
   | E45-E55 | CONVERT Глазго 1,500 (bought E54/E55) |

   - **The flips follow the reach test exactly** (`chooseGoal`: (cost − gold above the reserve) ÷ income ≤ `GOAL_HORIZON` 12). The third number of each SAVING line is that gold.
     - E21: `SAVING ["…Лидс…",1087,468]`. Ливерпуль would be (1,425 − 468) ÷ 78 = 12.3 turns, so it was out.
     - E22: Ливерпуль was back at 727 gold.
     - E25: 349 − 126 reserve = 223, so even Лидс was (1,087 − 223) ÷ 61 = 14.2. Both conversions were out, and the University (668) became the goal (L180327).
     - E41: after Ливерпуль was bought, 277 − 174 = 103, and Глазго's (1,500 − 103) ÷ 87 = 16. The University again (L276016).
     - The flips are VERIFIED; the arithmetic is INFERRED from `xpl-savings.js` lines 97-123 and matches every SAVING line.
   - **Where the gold went instead, while a conversion was the goal (E21-E25):** 1,420 gold for Ньюкасл, a town founded at E21 next to raiders (4 land and ship raiders, centre 87 → 39/100; `defence: Ньюкасл` L~162400-175300):
     - DEFENDER Рыцарь 420 (E21, L162424);
     - Рыцарь 420 (E23, L170528);
     - Средневековые стены 240 (E24, L175304);
     - Латник 340 (E25, L180291).

     These come from `all()` (no reserve, gotcha 30). Each one dropped the gold under the conversion's reach.
   - **Exploration spending in total (ext.py `spentsum`, de-duplicated per turn):** CONVERT 2,850, DEFENDER 2,270, REPAIR 624 (four of them were a University repaired three times at 148, E64-E69), AGE_END 616, WALLS 480, BOUGHT 336 (harbours, E6-E9). The defence (defenders, walls, repairs) was 3,374, more than two conversions. VERIFIED.
   - **No University was bought while a conversion waited.** The goal named one (E25-E29, E41-E44), but no VICTORY_BOUGHT or LEVER spend appears in Exploration. The treasury (Player_Treasury.csv E22-E28) matches the logged spends to the gold: E25 349 − 340 + 61 = 70 at E26. The only Universities bought were AGE_END Глазго 404 (E68, L551756) and the repairs. This corrects README game 32's «a University was bought in between (E27, 668)». VERIFIED.
   - **The ranking skipped the cheapest town.** For science, `rankConversions` orders by production potential, so Ливерпуль (1,350-1,425) was the goal for 14 of the 23 conversion-goal turns while Лидс cost 1,087. Лидс was never converted: it is still `Лидс(t)` at M60. VERIFIED.
   - **Counterfactual (INFERRED):** without the 1,420 for Ньюкасл, Лидс (1,087) was within reach at E21 (balance 966) and would have been bought at about E22. Ливерпуль would then have followed about 14 turns later (~E36) rather than E39. That is a third city 17 turns earlier and a fourth ~3 turns earlier. Even then, game 32 would have had 4 cities by ~E36 and 5 by ~E50: below games 28-31 (6 at the end of Exploration).

### 2.4 Games 28-31: what held conversions

- **g31** (L212793 …):
  - Goal spans: CONVERT Ньюкасл E20-E31 (12 turns), Глазго E32-E45 (14), Сандерленд E49-E61 (13).
  - Exploration spending: CONVERT 4,500, BOUGHT 1,260 (plan buildings in the free gold), DEFENDER 340, REPAIR 172.
  - The goal never flipped. Each conversion took 12-14 turns of saving at about 80-120 income.
  - Nothing displaced it: the binding limit was income. VERIFIED.
- **g30:**
  - Goal spans: CONVERT Ливерпуль E18-E22, Бирмингем E23-E27 (bought E26), Лидс E29-E38 (bought E37), Ливерпуль E40-E48 (bought E47), Брэдфорд E50-E58 (never bought).
  - One-turn LEVER University goals came in between (E15, E28, E39, E49, E59-E61).
  - Exploration spending: CONVERT 4,500, LEVER 1,408, BOUGHT 1,368.
  - Брэдфорд's 1,500 waited 9 turns and then fell into the last 10 turns (`LATE_CONVERSION_TURNS`). VERIFIED.
- **g28:**
  - Goal spans: CONVERT E7-E33 almost without a break (Аррапха 7 turns, Шираз 13, Ахваз 7), then LEVER and CODEX Universities E34-E49 (University bought E48, 1,140, L524007).
  - Exploration spending: CONVERT 4,075, BOUGHT 2,656, LEVER 1,760, CODEX 1,140.
  - After E32 no town was a CONVERT candidate any more (6 cities against 4 towns at E40). The rule allows conversions above 1:1 only for CONVERT-rated towns or below the city target. VERIFIED (goal spans); the reason is INFERRED from `conversionRule`.
- **g29:**
  - Goal spans: CONVERT nearly all of E21-E68 (Антавайлья 10 turns, a LEVER University E31-E33, then Уилька-Уаман 10, Сауса 7, Чичен-Ица 11, Куско 7).
  - Exploration spending: CONVERT 7,250, AGE_END 520, BOUGHT 308.
  - This is the only game that kept converting to the end of Exploration (8 cities). VERIFIED.
- **Antiquity in every game:**
  - The conversion goals sat 4-10 turns per town at 250-500 (e.g. g30 Шеффилд 487, A30-A46; g32 A24-A29).
  - Between the two conversions the goal was none or a LEVER/CODEX one: g32 A30-A41 none, LEVER Library A42-A51, CODEX Academy A58-A60.
  - In g32 the cheapest town (Лидс 500 → 337) was out of reach on 15-40 income, e.g. A30: (500 − 43) ÷ 16 = 28 turns. VERIFIED (rows); the reach arithmetic is INFERRED.

## 3. Modern production and the space work

### 3.1 Production per city (CityBuildQueue.csv "Production Added", our cities only; towns' production becomes gold)

| Game | Cities | Total per turn at M10 / M30 / M50 / end | Per city at M50 (high … low) |
|---|---|---|---|
| 28 | 6 | 182 / 118 / 304 / 273 (M93) | 73 63 49 45 38 35 |
| 29 | 8 | 384 / 545 / 531 / 427 (M69) | 84 82 80 76 70 63 41 34 |
| 30 | 6 | 222 / 247 / 316 / 301 (M67) | 66 58 55 51 44 42 |
| 31 | 6 | 279 / 333 / 384 at M48 | M48: 83 78 76 55 49 43 |
| 32 | 4 | 140 / 195 / 185 / 183 (M61) | 62 52 42 29 |

- **Game 32's cities:** Лондон 50-62, Портсмут 52-62, Ливерпуль 26-42, Глазго 18-29. Game 32's cities made 140-195 production in total, against 220-550 in the other games. VERIFIED.
- **Game 28's M20-M30 dip** (118 in total) is gotcha 45's unhappiness, Kalhu at −33. VERIFIED (CBQ).
- **Science per turn** (Player_Stats, M10 / M30 / M50):

  | Game | M10 | M30 | M50 |
  |---|---|---|---|
  | 28 | 352 | 388 | 817 |
  | 29 | 411 | 670 | 798 |
  | 30 | 467 | 747 | 1,025 |
  | 31 | 422 | 844 | 901 (M40) |
  | 32 | 374 | 484 | 794 |

  VERIFIED.

### 3.2 Launch Pads, Airfields and Crewed Space Flight Preparation (CBQ runs; cost from "Production Needed")

The costs: Launch Pad 714-966; Airfield 735-861; Preparation 1,000; Launch Satellite 500; Radio Telescope (Crewed Space Flight Research) 600.

| Game | Pads (city: production turns → done) | Bought | Preparation runs done (turns each) |
|---|---|---|---|
| 28 | ASSYRIA11 M54-68 (15 t); ASSYRIA4 M62-75 (14 t); ASSYRIA1 M58-61 + M67-73 (interrupted by 3 Tanks M48-66); ABBASID7 M56-64 + M69-74 (an AT gun M65-68 in between); ABBASID12 M55-60 + M70-83 (walls M61-69) | none (LEVER money went to Schoolhouses: 1,260 at M21 and M38) | ASSYRIA11 M70-84 (15 t), ASSYRIA1 M75-88 (14 t), ASSYRIA4 M76-88 (13 t) |
| 29 | MAYA1 M46-55 (10 t at 82); MAYA5 M51-64 (14 t); INCA1 M50-52 + M60-61 unfinished | Антавайлья's pad M47 for 2,848 (UI.log L2787831) | MAYA1 M56-63 (8 t); INCA2 (the bought pad) M48-52 then M65, unfinished |
| 30 | GB3 M43-51 (9 t); GB6 M42-52 (11 t); GB10 M41-53 (13 t); GB2 M56-67 (12 t); GB5 M64- unfinished | London's pad M36 for 2,620, the turn the gate opened (L678887) | London M43-53 (11 t), GB3 M52-62 (11 t) |
| 31 | GB9 M40-47 (8 t); GB15, GB11, GB7, GB2 under way at 442-696 of 672-861 when the game ended (M48) | none (treasury 0-18 from M20; income −8 to +7) | none |
| 32 | Портсмут M52-58 (611 of 819, then bought for 664: L1058691); Лондон M52-61 (668 of 777, unfinished) | Портсмут's, M57/58 | none |

- **Airfields:** g28 ASSYRIA2 M65-89 (25 turns at 24-36 production); g30 none built; g31 London's M44-46 unfinished; g32 Портсмут M25-27 (625 production in 3 turns, a lost wonder's refund) and then Break the Sound Barrier M59-61 unfinished. VERIFIED.
- **Rule of thumb:** at 50-60 production a pad takes 13-16 turns and a Preparation run 17-20. g32's own race line says «prep every 17» (Портсмут) and «every 19-21» (Лондон) (L943279, L1084395). VERIFIED.

### 3.3 What limited the space work

1. **When Rocketry came.**
   - No pad can start before the gate: M36 (g30, the best), M38 (g31), M45 (g29), M47 (g32), M51 (g28).
   - g32 reached the gate 11 turns after g30 with 4 cities against 6. Its science at M40 was 667 against g30's 870. VERIFIED.
   - **Seen in g30:** the earliest gate and a pad bought on that turn won the race at M62. INFERRED: the gate turn decides most of the outcome.
2. **Production of 40-60 a city.** Pads took 9-15 turns where nothing interrupted them, Preparation 11-20 turns. g29's best city (82) did a pad in 10 and Preparation in 8. VERIFIED.
3. **Gold.**
   - Only g30 and g29 held a pad bank: PADS goal with 2,000-3,100 held from M10 (g30) and M30 (g29); L584781-L652515 (g30).
   - Each bought a pad (2,620 at M36; 2,848 at M47). That gave a Preparation-ready city 7-17 turns before any built pad.
   - g31's Modern income averaged −11 (unit upkeep, gotcha 64), so nothing was bought.
   - g32's averaged 67. There was no bank before Rocketry, and the M20-M46 goals were AIRFIELD (M20), GDP Port (M21-M46, 972 bought M29, L787398), CONVERT 2,500 (M35-M40, never bought) and LEVER Schoolhouse (M47-M54).
   - VERIFIED.
4. **Items with progress ahead of the pad (game 32).**
   - The gate opened at M47 (L933957). Портсмут's pad was ordered that pass (L934071) but waited behind its Radio Station: M42-51, 641 production, kept by gotcha 20.
   - Лондон got `QUEUED_PLAN ["Лондон","Металлургический завод, Космодром"]` (L934081): the plan's Ironworks (225 production, M48-51) went ahead of the pad.
   - Both pads started only at M52: 5 turns lost in each pad city. VERIFIED.
5. **The game's end.**
   - At M58 (83% of Modern) the autopilot logged `victory work: PROJECT_LAUNCH_SATELLITE not queued, 17 turns in Портсмут with 12 left in the age` (L1058731). Trans-Oceanic Flight was not queued for the same reason from M54 (L984505 …).
   - So in g32 the bought pad could run nothing that counted. VERIFIED.
6. **Defence and other items interrupting pads (game 28).**
   - Tanks in ASSYRIA1 (M48-66: 791 production), an AT gun and Tank in ABBASID7 (M65-68, M84-88), and walls in ABBASID7 and ABBASID12 (M14-28 and M78-82; M42-69, 832 in all).
   - Three of the five pads were split in two by these. VERIFIED.

### 3.4 The biggest production sinks in pad cities (Modern, `sinks.py`; "space" = pads, Airfields, Radio Stations and projects)

| Game | Before the city's first pad | From the gate on, other than space |
|---|---|---|
| 28 | science buildings 336-1,095 a city; production buildings up to 1,013 (ASSYRIA4); units 168-784 (ASSYRIA1 784); walls 271-608 (Abbasid cities) | units 427-641 (ASSYRIA1, ABBASID7); walls 235-442; science buildings up to 637 |
| 29 | other buildings up to 1,557 (MAYA1); science buildings up to 1,682 (MAYA5); production buildings up to 1,097 | science buildings 503 (MAYA5); units 294 (INCA1) |
| 30 | science buildings 703-1,299; production buildings up to 1,092 (GB2) | science buildings 28-671 (GB5 671 while its pad waited to M64) |
| 31 | wonders 1,607 in GB7 (Oxford M2-13, Ubudiah Mosque M20-31); science buildings 718-1,278; walls 223-447; units 194-345 | other buildings 83-262 |
| 32 | Радиостанция 583 (London M16-29) and 641 (Портсмут M42-51); Laboratory 589 (London), 481+102 (Портсмут); lost wonders 681 in Портсмут (Oxford 212, Red Fort 468; their refunds went into the Airfield); a Cuirassier 194; settlers 163-178 | London's Ironworks 225 (M48-51, ahead of the pad) |

VERIFIED (CBQ sums by item type).

Across games the largest sinks were:
- the path's science buildings in pad cities (Schoolhouse and Laboratory, 700-1,300 a city);
- wonders (g31 1,607 in one city; g32 681 lost);
- defence in g28 (units and walls, 1,400+ after the gate).

## 4. Would more cities earlier have changed the result?

- **g32: probably not by cities alone (INFERRED).**
  - Franklin's culture countdown began at M55 and won at M61, so our science countdown (5 turns) had to start by ~M56.
  - The best game with 6 cities (g30) reached 100 Innovation at M62. g29, with 8, did at M64.
  - So g32 needed to be faster than any game seen. With 6 cities from ~E30 (g30's pace: 1,420 defence gold kept, Лидс at ~E22, Бирмингем not lost to the revolt), g32 might have reached the gate ~M36-M40 and 100 at ~M60. That is close, but still after Franklin's win.
  - It would have taken 6-8 cities by E40 **and** a pad bank. Each extra city added ~40-60 production and 80-200 science a turn in Modern: g32's Ливерпуль and Глазго made 109 each at M60.
- **g31: no (INFERRED).** It had 6 cities, the gate at M38, and lost at M48 to a countdown begun at Modern's 60% step. The limit was gold: 0 from M20 on, with income below zero. Four pads were under way at 442-696 of ~700-860 when the game ended. With more gold they could have been bought, but Innovation 83 at M46 still needed ~17 more with no Preparation running: about 2 Preparation runs, 20+ turns.
- **g28, g29 and g30 were won.** Earlier cities would have made the wins earlier.
  - g29's 8 cities did not bring an earlier gate (M45). Its Exploration income was the same as g30's, and its science per turn at M30 was lower (670 against 747).
  - So the number of cities is not the only driver of Modern pace: the research order and the pad bank count as much. INFERRED.

## 5. The most important numbers

1. **The pace of conversions:**
   - Antiquity: 2 per game, at about A22-A32 and A42-A54 (250-500 gold).
   - Exploration: 1 per 10-14 turns at 1,075-1,500 gold on 80-102 average income. VERIFIED, games 28-32.
2. **Game 32 had 2 cities until E39.** Бирмингем (21 production, 32 science) left in the A61 revolt (story «Бунт», L71351). Ньюкасл's defence took 1,420 gold (E21-E25) while a conversion was the goal. VERIFIED.
3. **The 12-turn reach test drove game 32's goal flips** ((cost − gold above the reserve) ÷ income > 12 at E21, E25 and E41). The cheapest town (Лидс 1,087) was never converted. VERIFIED.
4. **Modern production:**

   | Game | Cities | Total production a turn (M30-M50) |
   |---|---|---|
   | 32 | 4 | 140-195 |
   | 30 | 6 | 247-316 |
   | 29 | 8 | 384-545 |

   A pad took 9-16 turns at 40-60 production and Preparation 11-20 turns. VERIFIED.
5. **Rocketry gate:** M36 (g30, won), M38 (g31), M45 (g29, won), M47 (g32), M51 (g28, won only because the final age had no end). VERIFIED.
6. **Game 32:** both pads started only at M52, five turns after the gate (a Radio Station with progress; the plan's Ironworks). Preparation (17 turns) never fitted the 12 turns left. 0 runs; Innovation 58 → 83. VERIFIED.
7. **Pad banks:** only the games with one bought a pad when the gate opened (g30 2,620 at M36; g29 2,848 at M47). Modern income: g31 −11 and g32 67 on average, against g30's 85. VERIFIED.
