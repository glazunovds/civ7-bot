# Game 39 evidence (won: Modern economic victory at M54)

Napoleon: Carthage in Antiquity, Spain in Exploration, the French Empire in Modern; the economic focus all game (`victory focus: ECONOMIC remembered from the last age` at E1 and M1). The first game with research/37 Phase 6 (the navy) and the game 38 fixes (the commander's hold, saving for a defender). The game's logs began with game 38's last session (from 22:10); `evidence.zip` holds game 39's part only, from 23:16:50 in the text logs and from its turn 1 in the CSVs (`scratchpad/split_game.py`): UI.log, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, GameCore.log, Game_PlayerScores.csv, Modding.log, Player_Legacies.csv, Player_Stats.csv, Player_Treasury.csv, net_message_debug.log, Independents.csv, AI_Operation_Eval.csv.

## The end
- GameCore.log 00:05:42: `Team 0 has won 1 place in a 'VICTORY_ECONOMIC_MODERN' victory!` OWN_CHANCE at M50 (3,800 of 4,351), our countdown from M51, the last gold line at M53 (3,550 in the treasury, a Factory bought for the path).
- The watch's last line: economy ours 5,556 against the goal 5,185 (CHANCE); a rival's culture stood at DANGER at the next step (187 of 202 at ×1.25).

## Errors
- No `JS Error` from our files, no failed step, no held turn (`the game waits for` never appears).
- 622 `unit-flags.js:348` errors (the base game's, as in every game) and 7 `component-support.js` lines.
- ORDERS_NOT_TAKEN twice (A66, E70): an order the game did not carry out, released and skipped, as designed.

## War
- No war with a major (DiplomacySummary has no war or peace row with players 1-7).
- Independents raided: Гадрумет, Карфаген and Мотия in Antiquity (A39-A60), Севилья, Толедо, Барселона, Гадрумет in Exploration (E10-E36), a few Modern raids; no settlement lost (Player_Stats never drops).
- Combat (ours): Antiquity 17 attacks, 3 kills; Exploration 20 attacks, 3 kills; Modern 4 attacks, 1 kill.
- Formations: 9 moves (FORMATION_SCREEN 5, FORMATION_RANGED 4); the commander never moved in a formation (3 posts all game).
- The defender saving (game 38's fix) fired: `SAVING ["защитника (Севилья)",320,308]` at E28, the gold line's goal `DEFENDER защитника (Севилья) 320 held 320`.

## The navy (research/37 Phase 6, its first game)
- **Attacks (probe P-NAV-1 answered):** `UNITOPERATION_NAVAL_ATTACK` with `{X, Y}` works for both kinds. A Galley's became a melee fight (CombatLog `Melee, UNIT_GALLEY vs UNIT_GALLEY` at A47, A48 and A54, the last a kill); a Cog's (a ranged ship) became its ranged attack (`Ranged, UNIT_COG vs UNIT_CROSSBOWMAN` at E29-E30, `vs UNIT_PRIVATEER` at E66). The probe lines themselves were logged with no target in reach (`NAVAL_ATTACK 0 plot(s)`).
- **Naval guards:** NAVAL_GUARD 8 times (Гадрумет, Севилья, Бильбао, Кадис); `naval: <settlement>: ships N; warships there […], coming […]` as designed.
- **Warships trained:** QUEUED_WARSHIP twice: a Quadrireme in Карфаген (A50, built by A60) and a Cog in Мотия for Севилья (E29).
- **The Cog waited 20 turns:** it was appended behind the Tomb of Askia in production (7%), a Bazaar (57%) and a Sawmill, and stayed there (`queue probe: Мотия: [WONDER_TOMB_OF_ASKIA 14%*, BUILDING_BAZAAR 57%, BUILDING_SAWMILL 0%, UNIT_COG 0%]` from E29 to E40); CityBuildQueue shows it started at E49, after the raids on Севилья had ended (E36). Two causes: `warshipsWanted` chose the nearest city on the water whatever its queue, and `frontLoadUnits` never moved a warship up (`isMilitary` leaves ships out). Fixed: the city where the warship arrives soonest (its queue's wait, its training and its sailing, within `DEFENDER_ARRIVAL_TURNS` 16), and a warship for a lasting coastal front moves up its queue like other wanted units.

## Other
- A settler at 70,46 had no order for 10 turns at E10-E19 (`settler: no order … {"SEAS":7-8,…}`: the sites lay across the sea), then went home (SETTLER_RETREAT) while research took Astronomy (TECH_FOR_SETTLERS). Not changed.
- The Red Fort race was lost: cashed out at M12 (WONDER_CASHED_OUT, a Port moved ahead in Толедо) and finished by the rival at M17 (`NOTIFICATION_WONDER_FAILED`, 97 production returned).
