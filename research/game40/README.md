# Game 40 evidence (won: Modern science victory at M55)

Ada Lovelace: Silla in Antiquity, the Abbasids in Exploration, Great Britain in Modern; the science focus all game (`victory focus: SCIENCE remembered from the last age` at E1 and M1). One game process, 01:22–02:14 (GameCore.log); the player then chose «Ещё один ход» (net_message_debug.log 02:14:30 `EXTEND_GAME`). `evidence.zip` holds the logs as they stood at 02:20: UI.log, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, GameCore.log, Game_PlayerScores.csv, Modding.log, Player_Legacies.csv, Player_Stats.csv, Player_Treasury.csv, net_message_debug.log, Independents.csv, AI_Operation_Eval.csv, and `UI-xpl-played-on.log` (our UI.log lines from 02:25 to 02:41, the game played on).

## The end
- GameCore.log 02:14:21: `Team 0 has won 1 place in a 'VICTORY_SCIENCE_MODERN' victory!`; the autopilot switched itself off (GAME_OVER_OFF), and the player played on.
- Innovation (the watch line): 59 at M1, 77 at M39, 99 at M46-M48, 107 at M49 (VICTORY_COUNTDOWN 5), 112 from M50 to the end. Rocketry was chosen at M29.
- Settlements (Player_Stats.csv): 3 cities + 2 towns of a cap of 5 at A70, 6 + 5 of 11 at E70, 6 + 9 of 17 at M50; none lost.

## Errors
- No `JS Error` from our files, no failed step, no held turn (`the game waits for` never appears).
- 796 `unit-flags.js:348` lines (the base game's, as in every game).

## War
- No war with a major (DiplomacySummary has no war or peace row with players 1-7); Friedrich's and Napoleon's war risk made fronts (STAGED twice) in Modern; three calls to arms declined.
- Combat (ours): one unit attacked in Antiquity, one in Exploration, three in Modern; in Modern two attacks of ours and one kill. «Наступление» never ran (no `campaign:` line: no settlement lost).

## After the countdown began (M49-M55): the victory was secured, the work went on
The science victory is a fixed score (100 Innovation and an undamaged Launch Pad, then 5 turns): from M49 nothing could add to it or take from it but the pad. The autopilot still worked toward it, and toward another victory:
- **Projects and pads** (CityBuildQueue.csv, M49-M55): 1,518 production into space work: Crewed Space Flight Preparation 272 (Сораболь, restarted at M52), the Radio Telescope 436 (from M51), Launch Satellite 204, Break the Sound Barrier 126, two Launch Pads 480. UI.log said `race: 0 Innovation needed, reached in 0 turns` every turn and still `queue: project PROJECT_CREWED_SPACE_FLIGHT_PREP in Сораболь: slot 1 (final age)`.
- **Gold:** the pad bank held 764 (`SAVING ["космодромы (4)",764,353]` at M49) and a Launch Pad was bought in Хамадан for 252 at M51 (VICTORY_BOUGHT).
- **Research:** Future Tech at M45 and M49 (the game's advisor's pick, `TECH ["Технология будущего",""]`) with four Modern masteries never taken (Steam Engine, Urbanization, Mass Production, Mobilization; Player_Stats' techs stayed at 23 from M46).
- **Another victory:** the military lever (MILITARY_LEVER at M41: 4 settlements to our own military countdown, `goals SETTLER>PADS>…`) ran to M53; a settler took SETTLE_ANYWHERE at M49. The victory watch at M53 still showed `MILITARY ours 66/78 CHANCE (3 settlements)`.

## Played on (M55-M102, 02:25-02:41; our UI.log lines in the zip's `UI-xpl-played-on.log`)
The player switched the autopilot on again at 02:25 (`autopilot: ON`), and it chased the won victory and another one for 47 turns:
- Innovation 117 → 309; VICTORY_WORK 15 times (Crewed Space Flight Preparation in Хамадан, Камно, Йодам, Сораболь);
- Launch Pads bought in Йодам for 1,208 and in Хоро for 1,320, a School bought as the science lever for 1,040; PADS savings goals up to 2,752;
- Future Tech four times (TECH), the strategy still `phase COMMIT focus SCIENCE … goals SETTLER>PADS>…`;
- settlers for the military lever (QUEUED_SETTLER twice, a settler bought for 740, two SETTLE_FOUND).
- Unrelated: Хоро's Department Store stood at 100% from T54 (the victory turn) and the game never completed it; the give-way rule (root gotcha 20) moved a Laboratory, a Radio Station, a Military Academy and a Launch Pad ahead of it in turn, and each time it came back to the front.

## Changed
After the win, nothing chases a victory any more (root CLAUDE.md gotcha 72): **secured** (our own countdown in a fixed-score race with its goal reached, no rival's countdown ending sooner), **won** (the game awarded a victory to our team: `Game.VictoryManager.getVictories`) or **decided** (another team's victory, or a game played on past its end). Then:
- the pass has no focus, strategy, victory work, lever or space push (balanced play on the player's own profile);
- the projects that serve only a victory (the science projects, the Radio Telescope, Operation Ivy) leave the queues and are not queued again; a Launch Pad is a building like any other (+18 Science);
- research takes every other technology, civic and mastery before Future Tech.

Then the user asked for proposals 2, 3 and 5 and for every remaining building, on its best tile (built the same day):
- **every building:** the plan places every building, gain or not (the least loss after every gain), and empty queues take any building left before the advisor's units and projects (QUEUED_REMAINING); purchases spend the free gold on the plan's buildings as before;
- **wonders:** three at a time, and a long build (16-30 turns) nobody races for;
- **conversions:** past the 1:1 floor a town whose conversion pays back slowly (CONSIDER) becomes a city too;
- **the map:** Launch Satellite once (it reveals the whole map); explorers keep digging artifacts with «Разведка».

UI.log `outcome: …`; the tab's log VICTORY_SECURED, VICTORY_WON, GAME_DECIDED, VICTORY_WORK_DROPPED, QUEUED_REMAINING, SATELLITE_QUEUED.

## Not changed
- The autopilot still switches itself off at the victory; after «Ещё один ход» the player presses «Включить».
- No peace drive or army disbanding after the win.
