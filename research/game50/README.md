# Game 50: WON the science victory (Modern M48)

Benjamin Franklin; Spain in Exploration, Great Britain in Modern; the science focus all game; 22:23-23:22 in one game process,
the first game with game 49's fixes (root gotcha 79, "Game 49"). `evidence.zip`: UI.log (our lines, JS errors, argument
failures), net_message_debug.log, GameCore.log, Player_Stats.csv, CityBuildQueue.csv, Player_Legacies.csv,
DiplomacySummary.csv, CombatLog.csv, Player_Treasury.csv.

## The game
- **Won:** GameCore `Team 0 has won 1 place in a 'VICTORY_SCIENCE_MODERN' victory!` at M48. Modern opened with 62 of 100
  Innovation (`victory work: race: 38 Innovation needed`).
- **Clean:** no JS error from our files (218 in the game's unit flags, one in its horizontal scrollable), no crash, and no
  `getAreaId` argument failure (game 49's fix).
- **No war with a major** (war risks: Friedrich and another leader made fronts of Валенсия, Сучжоу, Шэньян, Учан and
  Бирмингем); no settlement lost; two scouts lost.
- **Settlements:** the capital at A3 (one tile's move first), then A18, A21, 5 by A41, 7 by A60; 8 cities and 7 towns in
  Modern (15 of 19).

## Seen
1. **The first settler waited for the capital's population.** It was queued at A9 and started at A13 behind a Granary. The
   game's settler row has `PrereqPopulation="5"` (base-standard units.xml), very likely why it did not start sooner; the
   queue and the BUILD were accepted (net_message_debug.log). Game 49's capital got there by about A6.
2. **The walk to a threatened post worked:** at A31-A33 the commander advanced three times toward Сучжоу
   (`generals: … advances from 14,42 to 14,41 … 16,40 … 15,38`), stood on its centre, and gained XP from a fight one tile away
   (`xp: combat T35: ours UNIT_WARRIOR at 13,37 (defender) vs p15 independent UNIT_WARRIOR`): 0 → 3 of 7. The first XP any of
   our generals got since Phase 2.
3. **XP below a level is lost at the age change** (second time: 3/7 at A70, 0/7 at E1). A fight gives about 2-3; level 1 needs
   7 within one age. After A35 no fight came near a commander, so both ended level 0 with no promotion.
4. **The second commander** was queued at about A44 (QUEUED_COMMANDER, Пекин) and stood by E1. Roles stayed put (the
   memory of game 49's fix).
5. **The bastion walked between the capital and Сучжоу** three times in Modern (9,41 ↔ 14,37, 4-5 turns each way), each time
   by the peace rule (a settlement 3 points unhappier and below zero within 4 turns). No threat came either way.
6. **Two scouts lost:** A44-A45 at 27,24 (hit by an independent's Spearman, then a Spearman and an Archer the next turn) and
   M45-M46 at 51,9 (a Frigate and two Line Infantry: 70 damage; the next turn `none[can: … MOVE_TO, REST_UNTIL_HEALED …]`:
   `stepAway` looks only 2 tiles out and found no better tile, and with no safe way home it stood).
7. **Noise:** `autopilot: cannot skip UNIT_AERODROME_COMMANDER` 25 times; the turn ended each time.

## Open (not built)
- Generals level only with fights in one age: in a peaceful game nothing does it. Decision 1 (no village hunts) stands; one
  dispersal is 25 XP (game 48's parameters), research/41 Phase 5 is the opt-in training war.
- A peace post kept a while after arriving (the bastion's three walks), and a hurt scout's step to the least exposed tile within
  its moves when none is safe.

## Built (22 October; root CLAUDE.md gotcha 80)
The user: "do 1, 2; we can hunt villages that will not be befriended (not enough points, half past the era, or maybe even if it
is befriended with another race if that will not cause the war); «Учебная война» is also good to implement".
1. **A peace post kept** 10 turns after a commander reaches it (`COMMANDER_PEACE_HOLD`).
2. **A scout in danger** with no tile farther from the raiders takes the tile in the fewest raiders' reach (`scoutAway`).
   Scouts have 2 moves, so looking farther was no fix.
3. **Village hunts** (on by default): the villages we will not befriend, gathered for, war declared only then, their soldiers
   struck, the village dispersed with the commander beside it.
4. **«Учебная война»** (off by default): a Formal war once an age on a weak, close, Hostile neighbour (denounced toward it),
   fought near their nearest settlement with the soldiers the defence leaves free, War Support kept ahead, ended by a
   promotion or its limits, then peace (a town asked when our support leads by 3).

939 tests; 24 reverts proven (scratchpad `g51_prove.py`). New file core/xpl-field-ops.js, two checkboxes and new strings: a
full restart. TESTING rows 458-462.
