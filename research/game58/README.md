# Game 58: Dai Viet, a hostile village next to our town, and the fight simulator

Started 03:26 on 23 October with the same build as game 57 (root gotcha 84). **Won the military victory** at 04:20 (about
M43), our culture countdown running too (5944 score, first of 8; Hatshepsut's economy alone in DANGER, 3,667 against our
2,737). The same session went on into game 59 (America: Antiquity 04:23-04:33, Exploration to 04:48), the build after it
applied during its age change to Modern (04:51). `evidence.zip` (snapshot of 04:50): our UI.log lines of both games
(`x.txt`: game 58 to line 8944, game 59 after), its JS errors (the game's own `unit-flags.js:348`, 567), net_message_debug.log,
GameCore.log, CombatLog.csv, Player_Stats, DiplomacySummary, CityBuildQueue, Player_Treasury and AI_Operation_Eval (the CSV
logs are game 59's: the game starts them afresh; GameCore.log ends with game 58's «Team 0 has won … VICTORY_MILITARY_MODERN»),
and `CombatLog-game58-antiquity.csv` (game 58's own, to A70). The user's
screenshot: Керманцы, an independent's village 3 tiles from our town Дыонглам, with its soldiers around it, and our generals
in the cities.

- **The generals fought in Antiquity only:** 10 fights in a general's radius, 5 Focus Fires, one hunt; Exploration and Modern
  had none (no raids came), so they ended at levels 1 and 0 (the bastion 13/15, the others 0/7). Game 59's two generals were
  at 0/7 after two ages with no fight at all.

The user: "commander earned some exp, but was not taking much of it staying in the city instead of moving more units towards
town and constantly fighting, swapping injured units. We need to create some fights simulator test, so we will have an idea
how to better implement it."

## What happened at Керманцы
- A hunt started at A56 (CRISIS: a crisis village), gathered with an Archer and the vanguard's packed Warrior and Spearman,
  unpacked by the village at A60 and fought one turn: `hunt: Керманцы: HOME after 5 turn(s) (FIGHT; kills 0, lost 0)`. The
  reason: one independent Galley shelling Хоалы, 11 tiles away, whose «melee 0 of 1» guard no land soldier could help.
- The village was then given up for 15 turns; the other village's hunt found «not enough force (melee 0 of 2 …)» every turn.
- A63-A65 our Spearman at 20,31 struck the village's Archer at 21,31 three times; the bastion stood on Дыонглам's centre
  (18,31), two tiles away, outside its radius: no XP.
- The generals: the bastion reached level 1 (XP 13/15 by A70) from fights by Дыонглам, the vanguard 2/7.

## The fight simulator
`tests/fakes/fight-sim.mjs` (the rules), `tests/fakes/fight-scenes.mjs` (this scene), `tools/fight-sim.mjs` (runs and means),
`tests/fight-sim.test.mjs`. The rules come from these logs: CombatLog.csv's 2,243 fights of games 57-58 fit damage = 30 ×
e^(0.04 × the strength difference) on each side of a melee fight (base 29.5, ±18%); its heal rows give 20/15/10/5; UI.log's
`commander parameters:` line gives the XP (EXPERIENCE_COMBAT_RANGED 1, NOT_COMBAT_RANGED 2, COMBAT_ATTACKER_BONUS 1, KILL_BONUS 2,
MAXIMUM_ONE_COMBAT 10, MAX_BARB_LEVEL 2, BARB_SOFT_CAP 1, DISPERSE_INDEPENDENT 25); the `xp:` lines give the levels (7, 15,
23, 30).

The scene: the capital 6 tiles from the town, the village 3 tiles from it with a Warrior, a Spearman and an Archer and a new
soldier every 4 turns (4 at most); our vanguard at the capital, the bastion on the town, two Spearmen, two Archers, two
Warriors. Twenty turns, twenty seeds with the ±18% spread:

| | XP (both generals) | fights in a general's radius | kills | soldiers lost | generals defeated |
|---|---|---|---|---|---|
| before | 14.7 | 7.7 | 0.9 | 2.1 | 0.4 |
| a general stays on a holding centre when its holder is hit | 21.8 | 12.5 | 0.8 | 2.9 | 0.1 |
| skirmish, Archers posted in range in the open (first try) | 26.1 | 12.6 | 1.1 | 3.7 | 0.7 |
| both, Archers next to the town, at most one enemy within 3 | 29.6 | 15.6 | 1.4 | 2.8 | 0.1 |

What it showed:
- The general left the town centre whenever its holder was struck (a "hit" on its tile), and with it the XP of every fight
  by the town.
- Our Archers (10 in melee) posted where a village melee soldier could reach them died the next turn; posts next to our town
  with at most one of theirs within 3 tiles keep them alive.
- After about 15 turns both sides run out (the simulator has no production): our losses are never replaced there.

## Built (root gotcha 85)
- A hunt is not called home by ships alone while the centre holds.
- A general on our centre stays when its holder there is hit while the district holds.
- Skirmishes with a hostile village next to our land: Archers next to our settlement, a general on the centre over them.

## Next steps
research/43-fight-simulator.md: checks for the next game, the simulator's next rules (our production, the village's real
behaviour, centres, terrain, promotions, a replay), behaviour to try in it (more units to the skirmish town, a melee screen,
swapping hurt shooters, dispersal for 25 XP, hunts with one melee), peaceful ages, and game 57's economy.
