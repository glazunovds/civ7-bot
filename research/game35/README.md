# Game 35 evidence

Won: our own military countdown, Modern (GameCore.log 02:19:33, after M62). Great Britain (Ada Lovelace), science focus, three ages in one session (the game began 01:35 after a reload; Exploration 01:48, Modern 02:03). Final score 4,907 against 912 (Tubman). The first game with game 34's fixes and the settler fix in the code. `UI35.log` in the zip is UI.log from 01:35 on (the session's earlier start included).

`evidence.zip`: UI.log, UI35.log, GameCore.log, net_message_debug.log, Player_Stats.csv, Player_Treasury.csv, Player_Legacies.csv, Player_Unlocks.csv, Player_Happiness.csv, CityBuildQueue.csv (four segments: the earlier start, then three ages), CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, AI_Operation_Eval.csv, AI_Victories.csv, Game_PlayerScores.csv, Game_RandomEvents.csv, PlayerScore.log, Game_Religion.csv, Modding.log.

## How it was won
- **The military lever** at M50: one settlement short of our countdown at ×1.25 (68 of 72); a settler bought in London (605). The countdown ran from Modern's 80% step and won.
- **Science** reached 91 of 100: Rocketry came at M47 (gate 0.93 from M42), Innovation stood at 66 from E67 to M47.
- **Rivals:** Tubman's culture (DANGER, 235 of 287 at the end) and Amina's economy (RIVAL_NEAR_WIN at M44, 2,889 of 3,279).
- Cities at the ages' ends: 3 and 2 towns (cap 7), 5 and 6 (cap 12), 5 and 12 (cap 17). Modern's gold income stood at -21 to 84.

## What cost the most
- **Лидс crippled for 35 turns.** At Modern's change its six specialists began to cost 6 Happiness each: about −19, the game's 80% penalty. Its F/P/S went from about 77/51/106 to 29/9/14 (M10-M45), and its City Park, the right cure, took 36 turns at 9 production a turn (queued by GAME_END_FIRST ahead of a Laboratory that could not finish). Meanwhile the Launch Pad bank held 400-1,740 gold for one pad (M6-M44). Fixed: a settlement at −10 or below buys its cheapest Happiness building from the gold above the reserve, ahead of the savings goal (HAPPINESS_RESCUE).
- **A Tank in a pad city.** Augustus was a war risk (no war came); the centres' melee want asked for a Tank (65 over our Cuirassier's 55), and Манчестер, kept for a Launch Pad, trained it M47-M51; its pad ran M52-M62. Fixed: in the final push a stronger melee unit only under a threat or a war at our door, and no wanted unit but settlers from a city kept for a pad.

## Earlier fixes in this game
- **Settler next to its site:** SETTLER_DASH at M10 (56,49); it founded on the next pass (M11), not in the same one: either the game allows no founding after that move, or `foundArrivals` ran before the move was done. Not yet known which.
- **First-turn conversions before the dedications:** E1 «none within 482 gold above the reserve (Sheffield 712, Stoke-on-Trent 787)», M1 «none within 849 (Stoke-on-Trent 1,050, Sunderland 1,050, Newcastle 1,087)». The window's prices are higher than research/39's estimate (712 at E1, 1,050 at M1), and the gold was short both times.
- **«О вращении небесных сфер»** (LEGACY_EX_SCIENTIFIC_2: Heliocentric Model and Invent Calculus, the autopilot's Exploration research gates) completed at E46, as in games 33 (E49) and 34 (E53). Its reward (Academics, +25% production for projects) is a dedication the player takes at Modern's start.

## Not done (ideas)
- **Modern's science triumphs:** «Составная прибыль» (5 urban districts with yields of 120+, not the centre: +50% production for projects) would speed the space work most; the growth step already aims specialists at the 120 mark, but UI.log does not say how close the districts were (0 of 5 here). A probe first. «Уже не мечом» (first to finish Operation Ivy: 25 military points) is in the military lever already; «Чудо над Мохаве» (+10 production per Airfield) and «E=mc²» (+4 per Laboratory) are small.
