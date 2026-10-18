# Game 34 evidence

Lost: Harriet Tubman (America, player 2) won the culture victory in Modern (GameCore.log 00:32:28, after M52). Her countdown began at M42, broke when the second place caught up, and ran again from Modern's 80% step (×1.25) at M51. Our science reached 105 at M50 (VICTORY_COUNTDOWN 5): it would have won at about M55, three turns too late. Great Britain (Ada Lovelace), science focus all game, three ages in one session (UI.log 23:50 Antiquity, 00:01 Exploration, 00:17 Modern). Victories switched on: all but domination. The first game with game 33's fixes in the code.

`evidence.zip`: UI.log, GameCore.log, net_message_debug.log, Player_Stats.csv, Player_Treasury.csv, Player_Legacies.csv, Player_Unlocks.csv, Player_Happiness.csv, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, AI_Operation_Eval.csv, AI_Victories.csv, Game_PlayerScores.csv, Game_RandomEvents.csv, PlayerScore.log, Game_Religion.csv, Modding.log. `Game.turn` restarts at 1 each age.

## Where the turns went
- **Modern's space cities built Radio Stations.** The building plan queued «Military Academy, Radio Station» in Ньюкасл (M28) and Бирмингем (M30), five turns before Rocketry (M33) and before their pads. The Radio Station is a science site since research/38, and a project never went ahead of a science site in production, so after the pads (bought M39, built M41) Launch Satellite and Crewed Space Flight Preparation waited behind them: «queue: project … slot 1 (final age)» every turn, Ньюкасл M40-M46 and Бирмингем M42-M47, about 940 production. Ливерпуль's plan queued one at M47 after its pad. A Radio Station is useless in a pad city: the Radio Telescope never runs there.
- **An Antiquarian took Ливерпуль M14-M37** (400 at 39 a turn, waiting behind other items): the culture overlay acts on a final-age WATCH (Tubman's culture, need 86, ours 104) and asked for explorers. Ливерпуль's pad came at M47.
- **The bank for Modern was spent at Exploration's end:** a Shipyard (424) and an Armorer (496) bought at E67 took 920 of the 974 held. Modern opened with 255.
- **Antiquity:** Лондон's Chart the Stars lost 78 production at A39 and 181 at A57: rivals finished the Colossus and the Ha'amonga a Maui, both waiting behind it in London's queue, and the game dropped each (NOTIFICATION_PRODUCTION_INVALIDATED, «0 returned») and reset the project. London made 10-21 production; the project ran A32-A69. The settlement cap stayed 3 until A45, and London was the only city until A38 (Liverpool, 262). Exploration began with 15 Innovation (game 33: 21).

## Game 33's fixes in this game
- **Auto-resume worked** at E1 and M1 (AUTO_RESUMED after the dedications).
- **The stuck-item rule fired once:** GB3's Radio Station stood at 100% from M45 (its pad had been bought under way at M39, as in game 33's case), and Launch Satellite went ahead at M46.
- **The first-turn window never happened, and why:** the card brings last age's cities back when the dedications are confirmed, not on turn 2 (5 cities at M1 the moment the autopilot switched itself on; 2 at E1). Research/39's window is the time before the dedications.

## Fixed after this game (TESTING 376-380)
- No wonder waits behind a project or a wonder in production (`frontHeld`, WONDER_WAIT_DROPPED).
- The Airfield and the Radio Station are science sites only in a city without a Launch Pad (`siteIn`): projects and the pad go ahead of them, a space city's plan does not queue them, a city kept for a pad does not start them.
- Explorers neither in a city kept for a Launch Pad nor where they take more than 10 turns.
- The age's last-turn purchases leave the BANK's gold alone.
- While the dedications wait, the first-turn conversions run (`convertBeforeDedications`).

## Also seen
- Modern: Sheffield converted at M17 (2,500); Rocketry at M33; Innovation 52 from M11 to M31, then 57 → 105 by M50 (London's Preparation, flights, Launch Satellite in Ньюкасл, masteries).
- Cities at the ages' ends: 2 and 3 towns (cap 5), 5 and 6 (cap 12), 6 and 10 (cap 18).
- No errors from our code.
