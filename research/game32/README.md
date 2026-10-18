# Game 32 evidence

Lost: Benjamin Franklin (player 4) won the culture victory in Modern (GameCore.log 20:56:32, about M61). His countdown began at M55, when Modern's 80% step brought the multiple to ×1.25 (goal 270, his 273). Great Britain, science focus all game, Continuity age transition, three ages in one session (UI.log 20:08 Antiquity, about 20:17 Exploration, 20:41 Modern). Victories switched on: all but domination. The first game with research/38 (Modern's science pace) in the code.

`evidence.zip`: UI.log, GameCore.log, net_message_debug.log, Player_Stats.csv, Player_Treasury.csv, Player_Legacies.csv, Player_Unlocks.csv, Player_Happiness.csv, CityBuildQueue.csv, CombatLog.csv, DiplomacySummary.csv, AI_Operation_Eval.csv, PlayerScore.log, Game_Religion.csv, Modding.log. `Game.turn` restarts at 1 each age.

## What decided it
- **A small empire.** Antiquity ended with 4 settlements against a cap of 5: the site search found almost nothing on this map (727 of 982 tiles rejected as terrain; `SITES_RELAXED [0]`). Бирмингем, a city since A28 (21 production, 32 science), was lost to a revolt at A61 (the Antiquity crisis; story «Бунт», UI.log L71351; our answer LOYALTY002D only took the +2 Happiness consolation). Exploration had 2 cities until E39 and 4 at its end (10 settlements). Its conversions cost 1,087-1,500 gold on 50-130 income: there was no goal at E1-E16 (every town more than 12 turns of income away), the goal went back and forth between Liverpool and the cheaper Leeds, and 1,420 went on Newcastle's defence at E21-E25 (two Knights, walls, a Man-at-Arms). A University goal held gold at E25-E29 and E41-E44 but was never bought (corrected by research/39). Leeds stayed a town all game. Modern kept 4 cities and grew to 15 settlements.
- **So Modern's science was low:** 346-435 a turn for the first 30 turns (game 30: about 400 at M1, 800 at M35), 764 at M50. Rocketry came at M45-M47 (67% of Modern; game 30 M36).
- **One Launch Pad.** Cities made 50-70 production (London 53), so a pad took 20 turns, and there was no gold to buy them: Modern income -19 to 160, no pad bank before Rocketry (never within the goal horizon). Portsmouth's pad, ordered M46, was bought under way at M57 (664). No Preparation run finished.
- **Innovation:** 58 at M1, flat to M46, then 83 by M59 from research (Rocketry, all six masteries) and the one-offs (the Radio Telescope, Break the Sound Barrier). Blocking the culture leader was out of reach (the second place, not us, set his goal; ours 77).

## Research/38 in this game (TESTING 354-364)
- **Worked:** the race line every turn; a Radio Station queued at M11 (London) and an Airfield at M19 (Portsmouth), before their masteries; after Rocketry the masteries by Innovation per turn (Radio, Aerodynamics, Flight with the Airfield standing, then Electricity, Combustion, Industrialization, Armor, and Nuclear Fission last); a pad under way bought (A3); SPACE_PUSH at M58; the stuck-queue fix (no BLOCKED after E64).
- **Defects, fixed:**
  - The Modern bank held 320-801 gold at E58-E63, then disappeared at E64-E69: it was sized to exactly what the gold reaches by the age's end and rounded, and the savings goal's reach check dropped it by a fraction of a turn. CODEX and LEVER goals took the gold, and Modern opened with 420. Now the bank is floored and marked `sized` (chooseGoal does not check its reach again).
  - The economic overlay bought a Port for 972 at M29 against Franklin's economy (ours 878 of the 3,270 that would block him). The overlay now acts only on an economic leader within 15% of ours (`ECONOMIC_BLOCK_SHARE`), as the culture one does within 30 points.
  - `queue: Ливерпуль keeps room for its Launch Pad: no BUILDING_LAUNCH_PAD`: the near-Rocketry rule named the pad itself (the plan's pad, not yet offered). Science sites are never held back now.
- **Not exercised:** the pad bank before Rocketry (income too low), pads to the front (no pad behind a building with progress), the age-change bank's effect.

## Also seen
- **Defence:** no settlement lost; Edinburgh's threats M40-M49 bought a Tank (920) and a Field Gun (640). Gold pressure ×1.5 at M2-M11.
- **Military lever** at M41 (3 settlements to our own countdown); a settler bought at M42; our military score reached 70 of 85-91.
- No errors from our code; the `unit-flags.js:348` errors are the game's flags.

## Ideas not done (a decision for the user)
- **Cities for science:** in Exploration a conversion waited 22 turns behind the goal horizon (12 turns of income) while Universities were bought; with the science focus a conversion might come before the path's buildings, or the horizon might stretch for it.
- **Production for the space work:** with 50-70 production a city, the Launch Pads are the bottleneck after Rocketry; production first and the pad bank both assume more.
