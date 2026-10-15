# Games 11–13: why the science autopilot loses

Logs read on 2026-10-15: `UI.log` (all three games, one session), `Player_Stats.csv` (all players, every turn), `net_message_debug.log`, `GameCore.log` (game 13 only), the game's `victories.xml`.

## 1. Results

| Game | Civ | Result | Innovation at each age's end (Antiquity / Exploration / Modern) | Settlements at the end of Antiquity / Exploration / Modern |
|---|---|---|---|---|
| 11 | Han → Ming → Qing | Lost at Modern T59 to Lakshmi Bai's economic victory | 23 / 62 at the end | 4 / 10 / 11 |
| 12 | Han → … | Lost at Modern T53 (76%) to player 5's culture victory | 17 / 26 / 31 | 4 / 9 / 11 |
| 13 | Han → … | Lost at Modern T18 (26%) to player 2's culture victory (`GameCore.log`) | 23 / 34 / 36 | 4 / 9 / 9 |

The `INNOVATION_TARGETS` are 25 / 55 / 100. Exploration added only 9 to 11 Innovation in games 12 and 13. In game 12 the Modern age added 5 in 53 turns: Rocketry came on M51.

## 2. Errors (fixed)

- **E1, turn 31 of game 12 held:** NOTIFICATION_COMMAND_UNITS, then `BLOCKED`.
  - A commander was sent to its post in Хуайян on T26. The game stopped its move on the way; it was awake with moves left, but had moved.
  - The skip step skipped only units that had not moved (`isIdle`), so the commander was never skipped.
  - The game's ready list was followed for only one unit a pass, because the game takes a skip a moment later.
  - The player then made the Coordinated Attack by hand.
  - **Fixed:**
    - `readyForOrders` also covers a unit awake with moves left after part of a move.
    - The ready list is followed while waiting for each skip to be taken.
    - A move order that has stood still for 2 turns is cancelled (MOVE_STUCK).
    - The commander gets its post again.
    - A held turn names the unit in UI.log.
  - Root gotcha 43.
- **E2, no Coordinated Attack all game:** our rule needs 2 healthy melee units next to the target, inside the commander's radius. Why it never matched is unknown. UI.log now says why once a turn (`commander: no Coordinated Attack: …`).

## 3. Why we lose

### 3.1 Rivals' countdowns are predictable, but we see them late
A dominance goal is ⌊multiple × second place⌋. The multiple steps down at fixed points:

| Point in the game | Multiple |
|---|---|
| Exploration before 80% | 6× |
| Exploration 80% | 4× |
| Modern 20% | 3× |
| Modern 40% | 2× |
| Modern 60% | 1.5× |
| Modern 80% | 1.25× |

`victoryWatch` compares the leader with today's multiple only.

- **Game 13:** at the end of Exploration, culture leader p2 had 241 points against a 4× goal of 344. That is 70%, so WATCH. Against the 3× that applies from Modern 20%, it was already 100%. Its countdown started on M13, and it won on M18.
- **Game 12:** p5 had 177 culture at M30 against the 2× goal (61%). Against the 1.5× of Modern 60% it was at 82%. It won on M53.

To block, someone must be second with at least leader ÷ multiple. For us that meant about 105 culture in game 13 (we had 46–52) and about 184 in game 12 (we had 65). A science empire cannot close that in 10–15 turns. Culture points come only from these sources (`victories.xml`):

| Source | Points |
|---|---|
| Wonders (by age) | 4 / 8 / 12 |
| Celebrations (by age) | 2 / 4 / 6 |
| Relics | 3 |
| Artifacts | 5 |
| Natural wonders | 10 |
| Unique quarters | 1 / 2 / 4 |
| Resort towns | 4 |

### 3.2 We do not lead in science, though science is the focus
Exploration, turn 50, from `Player_Stats.csv`:

| | Us (G13) | p2 (G13, culture winner) | Us (G12) | Best rival (G12) |
|---|---|---|---|---|
| Settlements | 9 | 8 | 9 | 8 |
| Science | 152 | 277 | 108 | 189 |
| Production | 139 | 239 | 145 | 200 |
| Food | 334 | 215 | 388 | 289 |
| Urban / rural pop | 46 / 66 | 46 / 50 | 43 / 71 | — |
| "BY TYPE: Buildings" column (meaning unverified) | 468 | 968 | 466 | 671 |

We have the most settlements and the most food. We are behind on production and science, and that last column (meaning unverified) is about half the leader's. The growth profile and the farming towns make food that turns into rural population rather than buildings and specialists.

Science in the Modern age: game 11 had 564–998 a turn, game 12 309–610. In game 12 the way to Rocketry (12 techs) took 51 turns.

### 3.3 The final age leaves the settlement cap empty, and military points are settlements
In the Modern age the military race scores 4 points per settlement we own, +1 for a conquered one, +1 in the Distant Lands, and +2 per settlement with our ideology. The final push trains settlers only below half the cap.

- **Game 12:** 11 of 16 settlements from M30 to the end. 4 sites were known from M19, yet no settler was queued until M41 (the military WATCH overlay), and none founded before M53.
- **Game 11:** our military score was 55; the leader had 60 and the goal was 68. Five more settlements (+20) would have made us first. Our goal would then have been ⌊1.25 × 60⌋ = 75, so 75 ≥ 75 would have **started our military countdown**: 1000 score a turn, and the military victory itself after 5 turns. The game was lost by one countdown turn.
- **Game 12 at M53:** military 48 against the leader's 50–55. Filling the cap (+20) makes about 68, which is 1.25 × 55 at Modern 80%.

### 3.4 Triumphs
- **Operation Ivy:** 25 military points, but the Manhattan Project plus Ivy cost 4200 production. Worth it only when the military race is within 25 and it can finish in time.
- **Compound interest (+50% production toward projects):** needs 5 urban districts with 120+ yield. Out of reach.
- **E=MC²:** +4 production per Laboratory. It comes on its own.

### 3.5 Game speed and conquest
- The science victory is absolute: 100 Innovation, through a fixed chain. Rivals' dominance victories get easier as the multiple falls, from 3× at Modern 20% to 1.25× at 80%. A science win must therefore land before about Modern 50%. In these games we entered Modern with 26–34 Innovation, against a 55 target.
- Conquest: we do not need to win wars, only to cross one dominance goal for a few turns near the end. Settlements are the cheapest military points (§3.3).

## 4. Proposals (not implemented; ranked by value for the effort)

1. **Fill the settlement cap in the final age.**
   - In Commit, keep training settlers, and buying them from the free gold, while below the cap and a safe site is known, not only below half the cap.
   - New settlements go to the nearest safe sites first (`settleNear`).
   - They never go ahead of a science project that would then miss the age.
   - Logged as `military: N settlements to our own countdown (ours P, leader L, goal G)`.
2. **Military countdown as a lever.** In the final age, compute how many settlements (+4 each) would start our military countdown, using the multiple at the next step. When the cap room covers it, that becomes the overlay's goal; our CHANCE in `victoryWatch` uses it. Operation Ivy (+25) counts only when the Manhattan Project is ours and the project fits in the time left.
3. **Projected watch.**
   - Judge each rival against the multiple of the next step within 15 turns, Exploration's last part against Modern 20%'s 3× included.
   - Log `<class> p<id>: countdown expected about <turn>`; the tab gets the same line.
   - Act on a projected DANGER as on a DANGER.
4. **Science lead (needs a probe first).**
   - Log per-city yields (science, production, food, urban/rural) every 10 turns, and compare with the totals of the best rival.
   - Then: a shorter GROWTH phase, less food weight after Antiquity, and specialists and buildings sooner (urban population). Today food is 1.5× the leader's while production is 0.6×.
5. **Culture blocking:** realistic only from early Exploration, and it competes with science. Natural wonders in site scoring (10 points each) are cheap; the rest stays as it is.

## 5. Status (2026-10-15)

- **Implemented: proposals 1, 2 and 5** (root gotcha 44, `mod/CLAUDE.md` «Games 11-13», TESTING 266-268).
- **Not implemented:** 3 (projected watch) and 4 (the science lead, which needs a per-city yields probe first).
- **Errors E1 and E2** are fixed (root gotcha 43, TESTING 265).
- **Proposal 4, in part (after game 14):**
  - New citizens no longer prefer farms in food-rich cities (food gains follow the scarcity curve).
  - The player's «Баланс приоритетов» sliders tune the weights in game.
  - UI.log's `economy:` line is the probe.
  - Game 14 (lost to culture at Modern 66%, Innovation 12 / 19 / 23): Exploration T50 food 364 against the rivals' 149–224, science 76 against 191, techs 6 against 12; new citizens 44 on tiles, 8 specialists.

