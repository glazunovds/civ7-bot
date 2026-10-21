# Game 42 evidence (lost: Harriet Tubman's Modern military victory at M62)

Friedrich Baroque with Persia in all three ages (a Test of Time civilization), the culture focus all game. The first game with research/40 (root CLAUDE.md gotcha 73). One game process with game 43, 17:00-17:56 (GameCore.log). `evidence.zip`: UI.log (only our `[XPL]` lines and JS errors), CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, GameCore.log, Game_PlayerScores.csv, Modding.log, Player_Stats.csv, Player_Treasury.csv, Player_Happiness.csv, net_message_debug.log, Independents.csv, AI_Operation_Eval.csv, NarrativeStories.log, Scripting.log; `session-*.csv` hold both games (Game_Religion, Game_GreatPeople, Player_Legacies, Game_CityStates).

## The end
- GameCore.log 17:55:56: `Team 7 has won 1 place in a 'VICTORY_MILITARY_MODERN' victory!` Tubman's countdown ran from M57 (RIVAL_COUNTDOWN at M55's watch: 79 against a goal of 78 at ×1.25, the goal being ⌊1.24 × our 63⌋).
- One or two more settlements of ours would have raised her goal past 79 (the watch's `need` 74, 3 settlements, carries the 1.15 margin). The room was there: 13-14 settlements of a cap of 16-20 all Modern.
- Culture was close as well: Tubman 211, ours 203 at M61.

## Why no settlement came (M7-M55)
- Two settlers wandered about 25 turns: `settler: no order … {"DANGER":4-5,"FAR":2,…}` on most turns; the strict search found 4-8 sites, the relaxed one 7-11, most of them with a hostile unit within 3 (independents: 9-11 villages, Пансан's unseen one threatening Боразджан M30-M41) or farther than 10 turns; later some OCCUPIED (Tubman settled there).
- MILITARY_LEVER fired at M41 (5 settlements to our own countdown at ×1.25, room 6), RIVAL_STEP_DANGER for her military the same turn; the strategy's goals said SETTLER, but the gold line said `goal none` every turn (900-1,200 gold): no settler is bought without a safe site within reach.
- SETTLE_ANYWHERE only at M53 (anySite waits 3 idle turns, and the detours kept resetting them); founded 41,9 at M55. A settler bought at M57 walked 6 turns: too late.
- The `settler: no order` line does not say what made a site DANGER (a live unit, whose, or a hit mark).

## Three wonders stuck at 100% and lost (~2,400 production)
- Парса: Battersea Power Station at 43,35, 757/750 at M37, 835 at M38, never completed. Гордион: Doi Suthep at 32,36, 778/750 at M40, 830 at M41. Both left their queues at M41→M42 with no notice; each one's whole progress went into the item in production (Military Academy 1110.9 of 441, Opera House +879), the excess lost. Гордион's Battersea at 32,36 again: 788/750 at M58, 843 at M59; Meiji finished it at M60 (NOTIFICATION_WONDER_FAILED, 421 returned).
- **Probable cause (net_message_debug.log): our own orders on the wonder's tile.**
  - 43,35: a Pairidaeza damaged by a volcano at M22 was re-ordered there as a repair at 17:43:06 (M25), and Battersea was ordered on the same tile 50 s later.
  - 32,36: QUEUED_UNIQUE_IMPROVEMENT (research/40 B5) put a Pairidaeza there at 17:39:11 (M8 order still queued at M25), and Doi Suthep was ordered there at 17:43:42. Battersea and a new Pairidaeza were sent to 32,36 in the same second (17:49:40), another Pairidaeza at 17:51:18. The growth step sent CITYCOMMAND_EXPAND on 32,36 at 17:49:16 and 17:51:14 while a wonder was "in production" there.
  - The control: Doi Suthep at 43,35 (M44-M51, no other order on the tile) completed; so did Red Fort, Dogo Onsen, Boudhanath and Statue of Liberty. Built Pairidaezas did not matter (wonders replaced them); a queued one did.
  - Every earlier stall of a building was ours too (games 33, 34, 35, 37, 40: damaged buildings, a repair offered); no rival's building or wonder ever stalled in 16 games (agent's script, scratchpad g42/agent2/stuck3.py).
- The give-way rule (QUEUE_UNSTUCK) then moved the plan's next building ahead of the stuck wonder, the waiting wonder dropped, and its progress overflowed into that small building.
- Each Modern wonder is 12 culture points: these three would have put our culture past Tubman's 211.

## research/40 in this game
- **Structural research** (A1): 18 picks (settlement cap, policy slots, specialist caps, Syncretism twice); no stretch where the focus's research waited noticeably.
- **Religion** (A2, A3, B1): pantheon «Богиня празднеств» (A36), beliefs Ахлак, Хесед, Святилище, Святая ойкумена (E19); Ius Reformandi offered at E63 at −49 and never slotted; 4 Missionaries spent 10 charges (our settlements Buddhist E23-E53); two queued at E65/E66, one never used.
- **Endeavors** (A4): 40 sent, 38 started (Cultural Exchange, Military Aid). No Exploration or Modern triumph at all (Player_Legacies.csv: six Antiquity ones).
- **Espionage** (B6): 13 civic steals, one at a time, 10 succeeded.
- **Levies** (B7): the API works (`DIPLOMACY_CS_LEVY_UNIT_COMPLETE` 5 times), but all five answered ship-only raids with a melee unit; logged as «деревни» (a generic civilization name). No incorporation.
- **Unique improvements** (B5): 33 Pairidaeza orders, 12 NOTIFICATION_PRODUCTION_INVALIDATED; 43,35 ordered seven times (E20-E34), 43,36 five times (Pairidaeza is `SameAdjacentValid="false"`: canStart still lists tiles next to one). Shore Battery counted as ours (a city-state suzerain improvement).
- **Legacy** (B2, B3, B9): `legacy:` reads every path at 0 in every age (`player.LegacyPaths.getScore` answers 0; the game's own victory-manager.js reads it the same way). Ages lasted exactly 70 turns at +1 point a turn: path milestones add nothing in this version; triumphs (Legacies) are the rewards. So «off the focus: DISTRICT» held all Exploration and the Antiquity military milestone never applied; the Homeland 16 is a real triumph.
- **Commanders** (C): Defensive Perimeter twice, with raiders next to the commander.

## Errors
- No `JS Error` from our files (the base game's `unit-flags.js:348` and `component-support.js` only); no turn held; no `ERROR` lines.

## Economy
- Weak for the age: Modern science 53 at M10 against rivals' 130-170, production 330.

## Fixed after the game (root CLAUDE.md gotcha 74; TESTING 433-438)
- One order per tile: no wonder on a tile another order of ours takes, no unique improvement or repair on a queued wonder's tile, growth there only as the last resort; a stuck wonder gets the building that keeps the most of it, and UI.log probes what stands on its tile.
- Blocking settlers are bold under a military countdown (live units only are danger, 15-turn walks, settle anywhere after one idle turn, a settler bought with no site known); the no-order line names the danger.
- Legacy paths count nothing: the focus scores the victories' own points and changes only in an age's first 15%; the off-focus milestones and the Antiquity military milestone are gone; the tab and UI.log show the triumphs under way.
- Missionaries leave refused tiles and settlements and are not trained in an age's last 8 turns; unique improvements keep off their kind's neighbours and off a cancelled order's tile 20 turns; levies only against land raiders, named by the city-state's city.
- 37 reverts proven (scratchpad g42/spec_g43.json with g42/prove.py).
