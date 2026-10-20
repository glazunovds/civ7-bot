# Game 41 evidence (won: Modern culture victory at M35)

Hatshepsut with Rome in all three ages (a Test of Time civilization: Rome's own civic trees in Exploration and Modern); the culture focus all game. One game process, 03:17-04:13 (GameCore.log). `evidence.zip`: UI.log, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, GameCore.log, Game_PlayerScores.csv, Modding.log, Player_Legacies.csv, Player_Stats.csv, Player_Treasury.csv, net_message_debug.log, Independents.csv, AI_Operation_Eval.csv.

## The end
- GameCore.log 04:13:29: `Team 0 has won 1 place in a 'VICTORY_CULTURE_MODERN' victory!`; our countdown from about M30 (VICTORY_COUNTDOWN «Культура» 5). The last watch line: culture ours 327 against a goal of 294.
- Settlements (Player_Stats.csv): 4 cities + 1 town of a cap of 8 at A60, 7 + 5 of 16 at E60, 7 + 11 of 20 at M30; none lost.
- A dominance countdown is never "secured" (root CLAUDE.md gotcha 72): no VICTORY_SECURED, as designed.

## Errors
- No `JS Error` from our files (the base game's `unit-flags.js:348` 230 times, `component-support.js` 25).
- No turn held by units; the turn was held twice by NOTIFICATION_CHOOSE_SYNCRETISM (below).

## War
- No war with a major. Combat: four of our units attacked in Antiquity (one lost), three units and one settlement attacked in Modern.

## Research: Future Civic before Rome's own tree (fixed during the game)
- Exploration: the autopilot took Future Civic (`CIVIC ["Общество будущего",""]`, the game's advisor's pick) at 03:41, 03:42 and 03:44 while Rome Reborn (`NODE_CIVIC_EX_ROMAN_RENAISSANCE`, 800: +1 tradition slot, +1 settlement cap, Latinitas II), Syncretism, Hierarchy and the Colonialism and Imperialism masteries waited. Each Future Civic also advances the age (`MOD_EX_FUTURE_CIVIC_AGE_PROGRESS`; +7 culture victory points, an attribute point).
- Fixed and applied live at 03:51 (root gotcha 72: every non-repeatable node before Future Tech / Future Civic, in every game). After it (net_message_debug.log): Rome Reborn (the player's pick at 03:51), Imperialism II, Colonialism II, Hierarchy, Syncretism, then Future Civic; in Modern Roman Modernization, Administration and Syncretism.

## Syncretism held the turn twice (fixed after the game)
- `autopilot: BLOCKED ["NOTIFICATION_CHOOSE_SYNCRETISM"]` at 03:55:43 (Exploration) and 04:08:35 (Modern); the player chose by hand and switched the autopilot on again.
- Cause: `chooseSyncretism` returned at once when `Identity.getSyncreticCivType()` gave any value; the game's own screen counts a choice only when that type is a civilization (`syncretism-screen-model.js` `getSyncretizedInfo`). Now the choice is sent while the notice waits, once a turn (root gotcha 13); UI.log says what the game refused if nothing is sent.
