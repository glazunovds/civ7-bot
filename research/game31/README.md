# Game 31 evidence

Lost: Augustus (player 5) won the culture victory in Modern (GameCore.log 17:52, about M46), after a 5-turn countdown begun at Modern's 60% when the dominance multiple fell from ×2 to ×1.5. Science focus all game; Continuity age transition; three ages in one session (UI.log 17:17 Antiquity, 17:27 Exploration, 17:40 Modern). Victories switched on: all but domination.

`evidence.zip`: UI.log, CombatLog.csv, GameCore.log, net_message_debug.log, Player_Stats.csv, Player_Treasury.csv, Player_Legacies.csv, DiplomacySummary.csv, CityBuildQueue.csv, AI_Operation_Eval.csv, Modding.log, UnitOperations.log, Scripting.log. `Game.turn` restarts at 1 each age.

## What decided it
- **Our own military countdown was two settlements away, and the lever stopped asking for them.** From M27 (40%) the lever judged the next step (×1.5, goal 72-73) and wanted 4 settlements; 2 were founded (M29, M38). At M41 ×1.5 became the current multiple (goal 73, ours 66: 2 settlements, room 2), but the outlook judged the next step again (×1.25, goal 61: `0 settlement(s) to our own countdown`), so the SETTLER goal left the plan and the gold that came at M44-45 bought a School (1,008). Augustus's countdown began that same turn. Fixed: `militaryOutlook` judges the current multiple when its settlements are within reach (root gotcha 44).
- **Science** stood at 62-69 of 100 Innovation from M1 to M36 (Rocketry's gate opened at M37, 54% of the age) and 83 at M45: too late for the culture countdown.
- **Blocking his culture** was out of reach: at ×1.5 the second place had to hold about 169; ours was 107 (he went 123 → 244 in Modern).

## Also seen
- **Gold:** income below zero for most of Modern (unit upkeep 90-115 a turn against 53-76 gross gold: Continuity carried 17 land units, and the returning city-states' raids at M2-M9 brought defenders). The treasury stood at 0 from M24 to M43, so no settler could be bought for the lever. 731 gold left between M1 and M2 with no request of ours in net_message_debug.log (unexplained).
- **Policies:** Social Science went in and out three times (M10/M18, M33/M40, M45/M46): +3 Science but +1 Happiness upkeep a specialist with 40+ specialists; slotted, it pushed cities below zero, and the per-settlement valuation (research/34 §1) then preferred taking it out. Consistent with the model, not a bug found.
- **Defence (research/37 Phases 1-2):** no settlement lost (11 → 15). The age's melee unit was bought at E1 and M1 (FIRST_MELEE_BOUGHT, the Cuirassier for 700); exposed towns got holders from M1 (HOLDER); Sheffield, Edinburgh, Newcastle and Liverpool were raided M2-M9 and held.
- No errors from our code; the `unit-flags.js:348` errors are the game's flags for other players' units.
