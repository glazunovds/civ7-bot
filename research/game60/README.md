# Game 60: Catherine, a random civilization each age, the culture victory, and a review of Antiquity

Played 24 October, 16:43-18:06, with the build of root gotcha 85. Catherine; the game allows any leader with any civilization
in any age, and each age's civilization was random: Russia (a Modern civilization) in Antiquity, the Normans in Exploration,
Prussia in Modern. Standard speed: ages of ~140 turns, and commander levels at 15/30/45/60 XP, each counted afresh (the
overflow carries: 12/15 became level 1 at 5/30). Culture focus. The autopilot played every turn (in Antiquity not one click
of the player; the dedication cards at the age changes were the player's). **Won the culture victory** at Modern T59 (18:06;
GameCore.log `Team 0 has won 1 place in a 'VICTORY_CULTURE_MODERN' victory!`), first of 10 by score.

The evening game of 23 October (America, to Modern T88) lost its logs: the game overwrites its Logs folder at every launch,
and only its saves remained. Since then `tools/archive-logs.ps1` keeps them (root gotcha 86).

**The review covers Antiquity only.** Nine reviewers (adjacency, war, errors, scouts, plague, mechanics, economy, ui, unitlog)
read T1-T140 from a 17:09 snapshot; three findings also read Exploration's first 74-84 turns from the live folder (errors E5
and E7, scouts SC-4). The review of Exploration and Modern could not run (usage limits) and is still to do.

`evidence.zip` (a snapshot of 18:09, after the win; the whole launch, all three ages appended to the same files):
- `x.txt`: our 14,825 UI.log lines, each tagged with its age letter and turn from the last `gold: T<n>` line, so a pass's
  unit lines carry the previous turn's tag (game 60 predates the turn stamp); `turns.csv`: each turn's first time.
- The game's CSV logs: CombatLog, Player_Stats, CityBuildQueue, CityPurchase, DiplomacySummary, Player_Treasury,
  Player_Happiness, Player_Legacies, Game_Religion, Game_Greatworks, Game_RandomEvents, Independents, AI_Operation_Eval,
  AI_Tactical; net_message_debug.log, UnitOperations.log, PlayerScore.log, GameCore.log.
- `AI_MovementPlanning.csv` (58 MB): every unit's tile each turn, ours and everyone's: the source for `tools/unitmap.mjs`
  and its replay scenes. Each CSV holds three sessions (the turns drop to 1 twice): read one with `session=N`.
- `js-errors.txt`: the game's own JS errors (unit-flags.js:348 «Expected this.unit to be non-null» and the culture tree's
  fxs-scrollable-horizontal); none is ours.

## Antiquity in numbers
- **Strong:** 7 settlements (3 cities, 4 towns) at a cap of 7, the most of any major (founded T20, T43, T58, T90, T94,
  T124); food (172), population (69) and culture a turn (84) the highest, gold (98.6) and production (100) second. No major was
  at war with us; independents raided four settlements (Шэнле's village 5 tiles from two towns, the others 11-22 tiles away;
  Цзэши's Quadriremes fought 64 of our 194 fights). No settlement was lost; 32 kills against 3 combat losses (a Slinger T67, a Scout T96, a Warrior T114 to a ship).
- **Weak:** science 41 (the best 69) and 13 techs (the leaders 20-24; only Xerxes had fewer); no Library, Market or
  Lighthouse in 140 turns (every rival had them); one wonder (Byrsa, T130) of five ordered (Bolivar 6, Friedrich 4); 0
  triumphs, four a step away (3/4 suzerains, 7/8 settlements, 1,574/1,900 tiles, 15/17 civics); the pantheon last of 10 at
  T77; 6th of 10 by score (760 against Friedrich's 920). Victory points at A139: military 32 (we led), culture 8 against 40,
  economic 16 against 587, science 4 against 14.
- **The generals:** one all age (Discipline's, A15), the vanguard; it reached level 3 (11/60, about 101 XP), the first
  general of ours to get that far, with three promotions in three trees and no commendation. 62 of our 194 fights were in its
  radius. No second commander was ever queued or bought. 3 raider hunts started; no skirmish ran.
- **Gold:** 6,559 income; about 70% went to the all-gold spends (repairs 1,408, defenders 1,800, walls 960, the revolt guard
  396), conversions 1,050, plan buildings 440 (both bought on T140), while a conversion goal held up to 950 on 89 turns
  (T45-T139). 1,032 carried into Exploration.
- **Production:** 4,773: walls 16%, units 17%, settlers 13%, wonders 15%. The capital (3,357) put 24% into buildings and
  none from A40 to A79; its urban population stood at 3 from A40 to A90.

## What went wrong, by cost
1. **Walls passed a wonder two turns from done.** At A105 a district's walls went ahead of the Ha'amonga a Maui at 329/375
   because the walled centre stood at 181/200; Prussia finished it a turn before us and its 164 refund went into those walls
   (~230 lost). Walls went on four more districts of walled, unhit centres (~520 production) against independents only.
2. **A chosen wonder never reached production.** The Hanging Gardens (tier S, A66) stood at index 2 for 14 turns behind walls,
   Slingers and a settler, holding a wonder slot; Mexico won them at T81.
3. **54 repairs for 1,408 gold** behind one independent's Army Commander that pillaged next to Тула every second turn
   T89-T139 (31 repairs pillaged again within 5 turns). Support-class units were invisible to every war rule: nothing struck
   it after T98.
4. **The plan's buildings got no share** while the capital's queue never emptied (A24-A93), and the conversion goal kept the
   free gold at 0 on 91 of 99 turns.
5. **The age's end:** Самара's 950 conversion was the goal A126-A139, affordable on T139 and T140, and was missed (a 24-gold
   repair, the reserve, the goal's horizon at 0); it cost 2,350 from E2. The capital's Altar was lost at 107/121 behind a
   repair.
6. **Scouts went back and forth:** on 31 of 73 moving turns T1-T40 a scout came back within a tile of where it stood two turns
   before (the AIs 6-15%); ~118 tiles revealed by T20, the last of 10. Шэнле stayed unseen until T82 while it raided the
   capital (53 fights): 14 of 16 orders sent the scout to a blind sight tile. Both scouts idled from E31 (rough seas).
7. **The plague killed three units at Астрахань** T135-T137 (a Spearman, a Slinger, the centre's Warrior): every pass found
   «no safe tile reached this turn» while 2-turn ways out cost at most 25; the one clean tile held our Archer; the plague's
   own damage was noted as combat hits.
8. **Influence was held for villages the game says we have not found** (49 passes, A49-A139): 2 endeavors and 0 steals all
   age; 2 of 6 befriendings lost to a rival who started first, one started too late.
9. **Smaller ones:** settlers lost 10-28 turns each around raiders with soldiers idle; Archers bought for 200 against ships
   that never hit a centre; the pantheon civic behind civics researched for wonders never started; one Altar in 7
   settlements; 3 codices archived with no Library; 9 of 29 religion spreads refused off a district; an attribute point lost
   to a story's +25% toward walls; 55 new citizens on tiles and 0 specialists.
10. **The tab and the logs:** the log stood ~17rem below the tab's bottom and kept 5 turns; no line placed a unit by id; 395
    of 398 unit lines carried the previous turn's tag; DMT's tack lines were 30.7 of the 58.8 MB of UI.log at the age change
    (Exploration: 33 MB in 30 minutes).
11. **The dedications:** switched on before them at E1, the first pass slotted cards and queued a Sokmen; the cards then gave 2
    settlers, and one stood at the cap E24-E73.

## What went right
- The turn flow: no [XPL] ERROR in 140 + 74 turns, no turn held, 9 ORDERS_NOT_TAKEN all handled by the retry; a pass took 3 s
  (median), the largest incremental plan 2.1 s. 33 second activations (gotcha 35) cost about 80 s in all.
- Our adjacency matched the game's on every pair compared (0/142 at A140); no item stuck at 100% (gotcha 77's fixes held).
- The defence held: no settlement lost, 8 plague escapes, the vanguard at level 3.
- The autopilot switched itself on again after the dedications at E1 and M1 (gotcha 66).
- Celebrations (4, the AIs' median), attribute points, the government, city-state bonuses and resources were fine.

## Built (root gotchas 86-90)
Nine packages, each built in its own clone, reviewed by another agent and fixed, then merged and cross-checked (1,290 tests, check-imports 405 files and 5 imports with no problems, every mod file parses). Every fix has a
test that fails without it.
- **86, the tab and the turn flow** (ui, log): one option spec and `effectiveOptions`; the tab rebuilt as a top bar over the
  settings (seven groups with master checkboxes, chips for options that wait) and the log (300 entries by turn); F7
  «Следующий шаг»; the settle round after every pass; the dedications stop; tacks renewed every 5 turns unattended; the turn
  stamp, `pass:`, `units:`, `places:`, `fight:` lines and unit ids on orders; `tools/unitmap.mjs` and replay scenes;
  `tools/archive-logs.ps1`.
- **87, units alive** (scouts, plague): danger only from units we see or saw within 2 turns; `flee:` lines; scouts' goals, the
  sight memory, scored frontiers, rough seas, the second scout after the first settler; settler escorts; ships judged by
  their reach; ways out of the plague over several turns, room made on the one clean tile, walks around it; steps away by
  reach; no unsafe walks for ranged soldiers.
- **88, the generals** (war): the game speed in the commander's training and goal; Leadership toward a commendation;
  independents' 1-XP fights; closer trades in a general's radius; fight memory; hunts that wait for their general; hostile
  commanders and scouts as targets; skirmishes at reach 5; the formation general safe; the `raids60` scene.
- **89, queues and gold** (econ, gold): walls behind raced wonders; wonders by their wait; the plan's share; refunds by room;
  the age's end by the game's count; repairs by tile; all the gold only under a real attack; the last-turn conversion; revolts
  in unrest; the plan's probes; quarter yields.
- **90, mechanics and mementos** (mech, mma): befriending's reserve, races and the not-found village; the pantheon as
  structural research; Altars and great-work slots; relic beliefs; Missionaries from districts; stories by their rewards; a
  merchant for any focus; the Memento Advisor by age.

## Next steps
1. **Review Exploration and Modern** from evidence.zip (`session=2`, `session=3`): 15 of 16 settlements at Exploration's end and
   19 of 21 at the win, 2 triumphs in each age, the Normans' 2 uniques and unique quarter, specialists 0 → 16 → 39, the
   economy in 7th place by score at M58, our culture points past the goal at about M56 (327 against 326), the second
   dedications, the generals after Antiquity, the relics (the Exploration triumph ended 19/20).
2. **In-game checks of the riskiest changes** (TESTING.md rows 500-591, M7-M11):
   - Seen-only danger (527): `Visibility.isVisible` must not answer false for units the player sees (garrisons, embarked units):
     compare the `flee:` lines, THREAT entries and the `units:` line's `unseen N` with the screen.
   - The settle round and F7 (500-505): a step's time, no end-of-turn answers, the dock note, the Coherent layout (511-518).
   - Walls and wonders (553-560): the game-27 rule stands: a war at our door, a damaged unwalled centre or a centre below half
     its health still sends walls to the very front, ahead of a raced wonder; only walls at an already walled centre (or for
     another district) wait behind a raced wonder above half health with no war at our door. The queued-wonder probe answers whether the
     game's turns for an item behind the head include the wait.
   - Repairs from the free gold (565): with a long savings goal improvements may stay pillaged; watch `repairs: waiting […
     0 free gold]`.
   - The Memento Advisor's age at a transition (M9: the `[MMA] advice for …` line says what each reader answered).
   - Probes still open: the plague's `duration` (with or without this turn), whether a hurt unit may join an army and is spared
     plot damage (PLG-3), P-REP-2 (a wonder after an improvement bought in its city), P-FIGHT-1 (a `fight:` line's damage is
     very likely before the hit: confirm on one fight against CombatLog).
3. **Measured follow-ups** (research/43-fight-simulator.md):
   - The merged simulator (TESTING.md row 499), 20 turns: game 58's village, 10 seeds, XP 69.2, 26.9 fights in a general's radius, 0 generals defeated; `raids60`, 20 seeds, XP 25.1, 11.7 in a radius, 7.7 kills, 2.9 lost, 0.1 defeated.
   - Replay game 60's T60-T75 (`tools/unitmap.mjs` on evidence.zip, `scene=`): the game had 40 fights (15 with ships, which the scene
     leaves out), 8 kills and 1 loss; the simulator 28 fights, 3.9 kills and 6.4 losses. Close the gap first with settlement defence (district health, walls),
     then raid parties that stay packed until they arrive, water and terrain.
   - Fog: game 58's scene lost a third of its XP at sight 2 (61.8 → 42.8); the next game's `units:` lines give the real sight.
   - UI.log per turn with the tacks' new pace, and the step's time with the player's units waiting.

## Merge cross-check fixes
Found when the nine packages were merged and read against each other; each has a test and a TESTING.md row (584-591):
- A hurt soldier (under 50 damage) on a general's tile rests there instead of withdrawing or escaping in the same pass (`sheltersCommander`).
- A hit on a tile where a healthy soldier still stands counts as the soldier's, so the general does not leave it (`commanderDanger`).
- The vanguard's rally leaves alone soldiers the defence posted or the formation moves this pass.
- The plague walk's step (`cleanStep`) never picks a tile another unit was sent to in the same pass.
- A repair waits only for hostile units we see or saw in the last 2 turns (`unitsSeenAt`).
- The revolt guard queues or moves Happiness buildings only with «Производство» on; an age's last turns move none ahead for the plague's unrest.
- The dedications' conversion window uses the remembered victory focus only with «Фокус на победу» on, otherwise only the 1:1 floor.
- Walls: the game-27 rule is kept (see gotcha 89): a war at our door, a damaged unwalled centre or a centre below half health sends walls ahead of a raced wonder; game 60's first version had dropped the war case.

The game needs a full restart for these changes (new UI files, the .modinfo, LOC text and config/input.xml).
