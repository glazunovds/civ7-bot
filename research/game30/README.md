# Game 30 evidence

Won the science victory at M66 (game 29: M69); no settlement lost. Three ages in one session (UI.log 16:16–16:50, 18 October 2026), the game's default "Continuity" age transition.

`evidence.zip`: the game's logs at the end of the game: UI.log, CombatLog.csv, GameCore.log, net_message_debug.log, Player_Stats.csv, Player_Treasury.csv, DiplomacySummary.csv, CityBuildQueue.csv, Modding.log, UnitOperations.log, Scripting.log. `Game.turn` restarts at 1 in each age; UI.log's `boot v1.0.0` lines mark the age changes (16:16 Antiquity, 16:25 Exploration, 16:37 Modern).

What they showed (research/37 §11 B2):
- The one attack on our centres (an Archer, A57) met DefStr 25, the Spearman obtained at A42 at its full strength: research/37 §2 confirmed for a trained unit.
- The age's melee unit was queued on each age's first pass and finished at E2 (Courser) and M4 (Cuirassier).
- Scripting.log: `Age Transition Setting: AGE_TRANSITION_SETTING_KEEP_MORE` (Continuity, the game's default): units return in place and keep their state; only packed units are repacked.
- `army:` lines: our one commander never had a packed member; `unitCount` excludes the commander. No aircraft at war, no reinforcements.
- `defence: Данди: war front … melee 0 of 1 … 13 free soldier(s) left` from M55 to M62: soldiers carried over fortified were not the autopilot's own (fixed in research/37 Phase 2; root gotcha 63).
- The 957 `unit-flags.js:348` errors are the game's flags for other players' units.
