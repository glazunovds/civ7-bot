# Game 33 evidence

Won: our own military countdown, Modern (GameCore.log 23:18:40, after M59). Modern's 80% step brought the multiple to ×1.25 at M55 (goal 75, ours 76), and the countdown ran to the end. Great Britain (Ada Lovelace), science focus all game, Continuity age transition, three ages in one session (UI.log 22:03 Antiquity, 22:13 Exploration, 23:01 Modern; 33 minutes idle at Exploration's end). Victories switched on: all but domination. The first game with research/39 (cities and production for science) in the code. Final score 4,882 against 891 (Amina).

`evidence.zip`: UI.log, GameCore.log, net_message_debug.log, Player_Stats.csv, Player_Treasury.csv, Player_Legacies.csv, Player_Unlocks.csv, Player_Happiness.csv, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, AI_Operation_Eval.csv, AI_Victories.csv, Game_PlayerScores.csv, Game_RandomEvents.csv, PlayerScore.log, Game_Religion.csv, Modding.log. `Game.turn` restarts at 1 each age.

## What decided it
- **The military lever** (root gotcha 44): at M42 one settlement stood between us and our own countdown at ×1.25 (72 of 75; MILITARY_LEVER, MILITARY_PAST_CAP). A settler was bought in Брэдфорд (700) and founded the 17th settlement (cap 17). At M55 the step to ×1.25 started our countdown with 76; it ran 4 turns and won.
- **Rivals were close:** Augustus's culture 160 of 188 and Hatshepsut's economy 2,990 of 3,097 at M55 (RIVAL_NEAR_WIN both). Our science stood at 95 of 100, 4 turns from the space win.
- **Empire:** Antiquity 3 cities and 1 town (cap 5), Exploration 5 and 6 (cap 11), Modern 6 and 11 (17). No settlement lost. Modern science 318 at M1, 824 at M56; Rocketry at M43 (game 32: M45-M47). Innovation 55 from E69 to M42, then 95 by M58 (pads bought M49, M51, M54; Preparation from M50, done M57).

## Research/39 in this game (TESTING 366-371)
- **Worked:** the revolt guard bought a Garden in Брэдфорд (A62, 184), an Inn (E53, 528) and a Temple (E59, 560) in Манчестер, no revolt; the sticky conversion goal (Бирмингем E11-E31, Лидс E35-E49, each bought); `conversions: none …` lines said why; the pad bank held from M2; SPACE_PUSH_HALF at M45, SPACE_PUSH at M53; PRODUCTION_FIRST in Брэдфорд at M45 (its City Park, queued behind its Launch Pad); no errors from our code.
- **Defects, fixed:**
  - **Auto-resume never fired.** At E1 and M1 the player pressed «Включить» before choosing the dedications (22:13:49, 23:01:28). The pass stopped for them (AGE_START_SCIENCE, OFF), the memory already named this age, and the autopilot stayed off until the player pressed again (22:14:31, 23:02:04). Now the stop arms a resume for that turn.
  - **A former city converted on the first turn.** At M1 the regular conversion step bought Брэдфорд (a city in Exploration) for 150; the card brought it back at M2 anyway, and with 2 cities counted every other town got dearer. At E1 Манчестер (a city in Antiquity) was the goal. The window step itself bought nothing at M1: the other towns cost about 1,000 against 714 above the reserve (907 gold), and no line said so. Now last age's cities are left out while the window is open, and the window logs the prices.
  - **The health guard in a crisis.** Бирмингем's conversion (500) was the goal from A49; at A58 it was 9 gold short of the reserve, and from A59 the plague crisis put London, Манчестер and Брэдфорд below zero, so the city target waited to the age's end. Бирмингем cost 1,500 at E31. E50-E57 waited the same way (Манчестер −1/−2 in Exploration's crisis). Now the guard does not wait during a crisis.
  - **Items the game does not complete.** Брэдфорд's Granary stood at 100% A66-A70 (the plague damaged 9 of its tiles at A65; its purchase that turn is FAILED in CityPurchase.csv), and its City Park held 945 of 451 at M56-M60 (no event found). Preparation and both flights waited behind the park, its production-first building, while its production went into it. Now such an item gives way.
- **Not exercised:** the first-turn window's conversions themselves (E1 had 45 gold; M1 too little), so the probe (does a town converted on turn 1 stay a city when the card's cities return?) is still open.

## Also seen
- **Defence:** a Tank (920, Болтон M27), a Howitzer (620, Бристоль M28) and walls (852, Болтон M34) bought; war fronts with Amina and Hatshepsut at the end.
- **Modern gold:** the goal went back and forth between the pad bank and Бристоль's conversion (2,500) M22-M44 while defence took the gold; Бристоль was never converted, Brighton was (M20). 1,552 gold unspent at the end (a Laboratory goal at 2,620).
