# Games 24–26: a won economy, a lost military block, a science game past the end of time

Three games on the game 23 code (0976ec4), one game process from 19:45 to 23:50.

| Game | Leader, civilizations | Focus | Victories off | Result |
|---|---|---|---|---|
| 24 | Machiavelli: Carthage → Spain → Mughal | economy | domination, culture | **won**, economic, M37 (countdown from M32) |
| 25 | Harriet Tubman: Inca → Songhai → Buganda | science | domination, culture | lost: Ashoka's (World Conqueror) military victory, M72 |
| 26 | Bolívar: Maya all game (test setup) | science | domination, score, military, culture, economy | lost: Pachacuti's science victory, M122 |

No JS error of ours (only the game's `unit-flags.js:348`, 419 times). One turn held (game 26, M84: `NOTIFICATION_CHOOSE_SYNCRETISM`).
The memory across ages answered at every age change (`victory focus: X remembered from the last age`).

## 1. Game 26: the final age had no end, and the autopilot kept its deadline

- **The setup:** only the science victory was on. With the score victory off, the game does not end when the final age reaches 100%.
  - The game's own code checks the same thing: the final age's countdown warning shows only `if (ageCountdownStarted && (!isFinalAge || scoreVictoryEnabled))`, with `scoreVictoryEnabled = Game.VictoryManager.isScoreVictoryEnabled()`.
  - The game's "one more turn" mode is `Game.AgeProgressManager.isExtendedGame || getMaxAgeProgressionPoints() <= 0` (victories-screen-model.js, summary-victory-tab.js).
- **What happened:** Modern reached 100% at M70, and the game went on to M122, when the Inca won (Pachacuti's Innovation went from 60 at M70 to 111).
- **What our deadline did** (gotcha 58, game 23's change): it treated M70 as the end of the game.
  - From M65 on, every Innovation project was refused: `victory work: PROJECT_LAUNCH_SATELLITE not queued, 12 turns in Уак-Кабналь with 5 left in the age`.
  - From M70 on, the estimate of turns left floors at 1, so the same refusal came every turn for 52 turns, `… with 1 left in the age`. That covered Launch Satellite, both flights after the Airfield was done at M77, and Crewed Space Flight Preparation.
  - Our Innovation was 69 at M70 and 75 at the end, from Future Tech only.
- **The score line** ran every turn, though the score victory was off (`score: ours 0 (place 1 of 6; best other 0 …)`).
- **The user's point:** players who continue after a victory ("one more turn") must not meet a deadline either.

## 2. Game 26: why the space projects never ran in parallel

1. **The deadline** (§1) refused the projects and the Launch Pads. A pad was placed only where the pad and Launch Satellite both fitted before M70 (`siteFitsAge`).
2. **One city had everything.** Уак-Кабналь (45–67 production) was the only city with a Launch Pad (M57–M65, queued by the plan at M56) and the only one with an Airfield (M66–M77). So Launch Satellite, Trans-Oceanic Flight and Break the Sound Barrier were all offered there (the user's screenshot: 17 turns each). Each one-off goes to "the city that finishes it soonest" (`pushVictoryWork`), and no other city could start them.
3. **The other four "pad cities" never got a pad, and could build nothing else.**
   - From M45 (Rocketry's gate open), `padCities` picked 5 of our 6 cities for pads.
   - Each of them became a space city (`spaceCity`). A space city's empty queue takes only science sites from the plan and only projects from the advisor.
   - Their pads were not queued: they took 21–55 turns at 16–43 production (`SITE_MAX_TURNS` 10), cost 3,864 gold against an income of about 80, and did not fit the deadline anyway.
   - So `lastResort` queued «Научная инициатива» (`PROJECT_CITY_SCIENCE_PROJECT`: 25% of production as science) again and again (`CityBuildQueue.csv`):

     | City | Turns |
     |---|---|
     | Чичен-Ица | M47–M122 |
     | Бак (capital) | M52–M108 |
     | Калакмуль | M57–M122 |
     | Яшчилан | M71–M122 |
     | Уашактун | M86–M122 |
     | Уак-Кабналь | M78–M108 |

     About 8,000 production in all.
4. **No production first.** Бак had 40 production for a 966-production Launch Pad (24 turns). Its production list offered a Stonecutter, Sawmill and Gristmill at 2 turns each (+5 production each in the game's preview) and an Ironworks at 7 turns (+10).
   - The space-city rule barred them, and the science profile ranks them low.
   - The user then did it by hand (M107–M110, autopilot off): Stonecutter, Sawmill, Ironworks, then the Launch Pad in Бак; Crewed Space Flight Preparation in Уак-Кабналь, which ended 994 of 1,000.
5. **Production was the bottleneck all age:** 200–276 for the empire against 289–666 science. To reach 100 from 69 takes the three one-offs (3,000), one Crewed Space Flight Preparation (2,000), the pads and the Airfield (about 1,800). That is 28 turns of all our production at M70, so the game was winnable in the 52 turns it lasted.
6. **The Radio Telescope** (`PROJECT_CREWED_SPACE_FLIGHT_RESEARCH`, 5 Innovation, 1,200 production) was offered in Уак-Кабналь, whose Radio Station stood from M56. `SCIENCE_PROJECTS` leaves it out on purpose, because it usually needs a Radio Station built for it first (research/14). With the station already there, it costs 240 production a point, near the other one-offs' 200.

## 3. Game 25: the military victory we could have blocked

- **Ashoka's countdown** (World Conqueror; he took six city-states in Modern):
  - It started at M58: 73 points against a goal of 68, which is ⌊1.25 × our 55⌋, because **we were second**.
  - It broke at M61, when we founded a settlement: ours 60, goal 75.
  - It started again at M67 (81 ≥ 75) and won at M72.
- **The block:** our own points set his goal (gotcha 32: the multiple times the second place). Two more settlements by M67 (ours 68, goal 85) would have stopped him. We had room for 2–4 settlements under the cap all age, and the game would have ended at the age's end with the score (we were second: 922 to his 951).
- **Settlers were short of sites.**
  - We founded 4 settlements in 72 turns.
  - The strict search found 0 picks from M25; the relaxed one found 1–2.
  - One settler stood idle at 21,17 for 23 turns, until M67: `settler: no order … 2 sites known {"TAKEN":1,"FOREIGN":1}`.
  - That line misreports relaxed picks: `noteNoSite` checks them by the strict rules (it does not pass `relaxed`), while `pickSite` uses the relaxed ones.
- **No lever saw it.**
  - The victory watch said DANGER from M55 and logged RIVAL_COUNTDOWN at M58.
  - The military overlay trains settlers (it did), but nothing makes a settler found wherever the game allows when blocking needs settlements now.
  - Our own countdown lever needed 7–9 settlements with room for 4 (`military: … room 4, past the cap 2`), so it never fired either.
- **Science** was out of reach: Innovation 31 → 46, and Rocketry not reached in 72 turns (Flight at M30, then the long way to Rocketry), with 143–596 science.

## 4. Game 24: the economic win
- The countdown started at M32 and we won at M37. We were also first in the military race (66 to 59).
- No production lost at Antiquity's end. At Exploration's end, 743 was lost:
  - 367 in fallback science projects;
  - Guildhalls at 56% and 29%, and two Dungeons.
  - The Guildhall at 56% would have cost about 612 gold against 531 free, so `buyAgeEndItems` rightly skipped it.
- **Late conversions:** two towns were converted 1–2 turns before Exploration ended, in games 24 and 26. This was correct: the user's Towns tab has «expect to keep cities» on (`towns.expectKeepCities` in the settings), and every city was back at M2.

## 5. Small findings
- **Age-end purchases:** the first `AGE_END_BOUGHT` worked in game 26 (Бак's Temple, 332 gold, E70).
  - Game 25's Antiquity lost an Academy at 94% (114 of 121) and a Garden at 73%. The purchase would have cost about 30 gold, but the treasury was 49 with a reserve of 64 (income −2), so nothing was free.
  - On an age's last turn the reserve protects nothing that matters more than a nearly finished building.
- **Syncretism** (game 26, M84): `NOTIFICATION_CHOOSE_SYNCRETISM` held the turn (BLOCKED). It is the player's choice, and nothing answers it yet.
- **Wonders that left queues unbuilt** (gotcha 55's open question; 7 cases). The diagnostic now shows more:
  - **Carthage, game 24 (A26–A45):** the Altar at the front of the queue stood at 100% (our probe at A33: «49 production in it») and did not finish. Production piled up in it: 290 of 49 by A39 (`CityBuildQueue.csv`).
    - At A40 that pile went back to 26 and the Ha'amonga left the queue unbuilt (ordered A28 at 27,21). We had bought a Saw Pit in Carthage at A39.
    - It happened again: 160 of 49 by A45, then back to 28 at A46. We bought a Garden at A45, and the Emile Bell left at A47.
    - About 450 production lost in a 20-production capital.
  - **Cusco, game 25:** Spherical Earth went from 218.8 back to 31.3 at A61. That is the turn the Pyramid of the Sun left the queue, the turn after Ancient Walls were bought there.
  - **Twice the game said why**, NOTIFICATION_PRODUCTION_INVALIDATED «… построить больше нельзя … вернуть 0»: Byrsa (game 26, A60) and the Grand Bazaar (game 26, E8). The others came with no notice.
  - Each time our check said the tile was still accepted (`canStart` BUILD at X, Y). The cause is still unknown.
  - A purchase in that city on the turn before appears in 3 of the 7 cases.
- **Gold in game 26's Modern:** 200–1,500, income 80–170. Three Schoolhouses were bought (1,260 each). No pad could be bought.

## 6. Proposals
1. **The final age's deadline only when the game ends with it.**
   - `ageOutlook()` and the town job's turns left become unlimited when the final age has no end: `!Game.VictoryManager.isScoreVictoryEnabled()`, `Game.AgeProgressManager.isExtendedGame`, or `getMaxAgeProgressionPoints() <= 0`.
   - The extended game and the missing timer apply in any age.
   - Everything gated on the deadline then runs:
     - `ageEndTurns`, GAME_END_*, `siteFitsAge`, `runInTime`, the one-off projects' check;
     - `leverSoon`'s payback;
     - the final settler/wonder cut-offs and `FINAL_CONVERSION_TURNS`.
   - No `score:` line while the score victory is off.
2. **A pad city is a space city only while its pad stands or is queued.**
   - Until then it builds its plan like any city.
   - A pad that the gold will not buy within the goal horizon is queued in its pad city anyway (not only within `SITE_MAX_TURNS`), behind the production buildings of proposal 3.
3. **Production before long victory work.**
   - A city that is to build a Launch Pad or run space projects first queues the cheap production buildings that pay for themselves: cost < R × g / (P + g), where:
     - R is the production still to go into its pad and projects;
     - g is the building's production gain (the game's own yield numbers, as the plan reads them);
     - P is the city's production.
   - Бак: a Sawmill (87 production, +5) pays for itself before a 966 pad alone; the Ironworks (267, +10) does once its projects are counted.
4. **Space projects in parallel.**
   - (Changed again by research/32 §9: the Airfield goes only to a city without a Launch Pad.) The Airfield goes to another city than the first Launch Pad when one is close in production, so the two flights run while the pad city does Launch Satellite and then Crewed Space Flight Preparation.
   - A one-off goes to the city that finishes it soonest counting everything queued before it (its other projects too).
   - The Radio Telescope (Crewed Space Flight Research) where a Radio Station already stands.
5. **Blocking a military countdown with settlements.**
   - In the final age, when a rival's military countdown is at DANGER or running and we are second (our points set its goal), work out the settlements that would raise the goal above the rival.
   - A settler with no site for 3 turns then founds on the nearest tile the game accepts (`isValidLandClaimLocation`), with our own spacing rules relaxed (never a war, never danger).
   - `noteNoSite` checks relaxed picks by the relaxed rules.
6. **The age's last turn buys from all the gold:** `buyAgeEndItems` spends from the whole treasury, not only the gold above the reserve (game 25: an Academy at 94% for about 30 gold).
7. **Syncretism:** answer `NOTIFICATION_CHOOSE_SYNCRETISM` like the other choices, so it no longer holds the turn (API to be read from the game's syncretism screens).
8. **The wonder probe:** in a city holding a queued wonder, UI.log gets the queue with every entry's progress each turn, plus an item still at ≥ 100% on a later turn (stuck), with the purchases of that turn. This would show what Carthage's Altar was doing.

## 7. Changed (the user: «implement all of them»)
Each change has a test that fails without it: 43 cases, run on a copy (scratchpad `prove_g26.py`). TESTING rows 300–307. Root gotchas 13, 25, 39, 44, 55, 58.
1. **No end on the clock:**
   - `ageHasEnd()`: the final age ends the game only while the score victory is on, and nothing ends after "one more turn" or without an age timer.
   - `ageOutlook()` then gives Infinity, so the final-age deadline, the late conversions, the settler and wonder cut-offs and `ageEnding` are off.
   - No `score:` line while the score victory is off.
2. **Pad cities:** a city is a space city only once its pad stands or is queued. A pad of 10–30 turns is built where the gold would buy it later.
3. **Production first:**
   - The payback rule c < R × g / (P + g), on the game's placement numbers.
   - At most 3 buildings, run first in `pushVictoryWork`.
   - Sites, projects and levers stay behind them.
4. **Parallel space work:**
   - The Airfield goes to another city close in production (research/32 §9 changed this: only to a city without a Launch Pad).
   - The one-off projects count the ones already queued in a city.
   - The Radio Telescope runs where a Radio Station stands and there is no Launch Pad.
5. **The military block:**
   - The watch's `block`.
   - In the final age the MILITARY overlay sets `settleAnywhere`: a settler idle 3 turns takes the nearest tile the game accepts (not next to a village).
   - The `no order` line judges relaxed picks by the relaxed rules.
6. **The age's last turn** buys from the whole treasury (the free gold while threatened).
7. **Syncretism** is answered (its own civilization with a culture slot, else infrastructure with a unique quarter).
8. **The queue probe** goes to UI.log.

Changed in the existing tests: the first levers test now expects the Airfield in Nice, Lyon's 20-turn pad, and the Radio Telescope in Lille.

## 8. Game 27: Лоян's unhappy specialists, and Ханькоу shelled by two Dreadnoughts
Game 27: Qing in Modern, science focus, every other victory off. It ran in the same game process (still running) on the §7 code. The user sent two screenshots.

### 8.1 Лоян: an Examination Hall at 49 turns
- **Production** (`CityBuildQueue.csv`, `LOC_CITY_NAME_HAN2`): 31.4 at T56, 12.2 at T57, then 10–12 to T80 (27 for three turns, T64–T66).
- **The economy line** (T50 → T60): production 32 → 12, science 64 → 30, specialists 7 → 9.
- **What the autopilot did:** it added a specialist at T55 and another at T56 (`GROWTH_SPECIALIST ["Лоян",27.9]`, `[…,28.2]`). In Modern each costs 6 Food and 6 Happiness. At T55 a commander had just been posted there as our unhappiest settlement (`COMMANDER_POST`). One more specialist came at T72.
- **Happiness** (`Balance_Happiness.csv`): unrest from T60 to T63, and −14 at T69, with the city starving.
- **The game's rule:** every point of net local unhappiness takes 5% of the settlement's other yields (food aside), at most 80%.
- **Our model's gap:** when happiness went below zero it weighed the happiness itself ×2 (SHORTAGE), but never counted the yields the penalty takes. So a specialist's science looked like a gain of 28 in a city about to lose more than half of 100+ yields.
- **Changed:**
  - `unhappinessDelta` (core/xpl-scarcity.js) prices a happiness cost that crosses zero at that share of the settlement's other yields, counted before any penalty. A gain back above zero wins it back.
  - The growth advice and the building plan's upkeep (`net`) read every net yield for it.
  - Proven: 9 cases (`prove_g27.py` H1–H7).

### 8.2 Ханькоу: two ships destroying a city
- **The shelling** (`CombatLog.csv`): two Dreadnoughts of player 16, the independent Пансан, shelled Ханькоу's centre (60,32) from T71: 200 → 167 (T71), 139, 113, 82, 53, 20, 0 (T77, "District"). Пансан was at war with us all along (`befriend: Пансан threatens us; its project status -3`). One Dreadnought had been healing at (62,32), 2 tiles away, since T66.
- **Our gun never fired:**
  - Our Field Gun stood in the centre at full health the whole time (`Unit Heal (60)(32) … (100)100` every turn).
  - The autopilot had put it on alert at T63, after FORTIFY was refused. From then on it was "busy".
  - `commandUnits` gives orders only to idle units (`defend` → `rangedAttack`), and the game wakes a unit only when the unit itself is attacked.
  - It woke at T77, when a Dreadnought hit it for 43. It shot once at T78 (33 damage) and died the same turn.
- **The same pattern earlier:** at T60 two Field Cannons shot (RANGED). The next pass found them idle with no attack left and put them on alert.
- **Why melee units differ:** `strikeRaiders` already woke fortified melee units to strike, but it skipped ranged ones because "they shoot". They shot only while idle.
- **No defender came:**
  - Nothing was trained or bought for Ханькоу. There was no `defenders: none for Ханькоу` line, so its guards counted as enough.
  - The gold (288–463, income 12–36) would not have bought another Field Gun (640) anyway.
- **The walls:** Defensive Fortifications, queued at T60, waited behind a 17-turn Laboratory that had progress. They were built T70–T77 and finished the turn the centre fell.
  - **Changed** (the user: «let walls jump the queue when threatened»): a threatened settlement's walls go to the very front, ahead of an item with progress (root gotcha 20's new exception, `wallsSlot`). They wait only behind an item done this turn, repairs and a unit at the front. Unless the centre is damaged or a war is at our door, they also wait behind a raced wonder or a science project that would miss the age. Nothing else passes walls at the front. Proven: 7 cases (`prove_g27.py` W1–W7).
- **The rest of game 27:** research/32.
- **Changed:**
  - `shootRaiders` runs in `strikeRaiders`, before the melee strikes. Every ranged soldier with an attack left shoots at a soldier we are at war with, whether idle or busy (on alert, fortified, asleep, resting).
  - Not a unit on its way, and not one in danger off a centre.
  - The shots come one after another, each after the last one's `Combat` event.
  - Two guns at about 30 a shot would have sunk both Dreadnoughts (100 each) in 3–4 turns.
  - Proven: 6 cases (SH1–SH5).

