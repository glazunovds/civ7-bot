# Game 49: WON the economic victory (Modern M32)

Xerxes (`LEADER_XERXES_ALT`), Qajar in Modern; the economic focus all game; 19:09-20:12 in one game process, the first game with
root gotcha 79 (game 48's fixes and research/41 Phase 2). `evidence.zip`: UI.log (our lines, JS errors, argument failures),
net_message_debug.log, GameCore.log, Player_Stats.csv, CityBuildQueue.csv, Player_Legacies.csv, DiplomacySummary.csv,
CombatLog.csv, Player_Treasury.csv.

## The game
- **Won:** GameCore `Team 0 has won 1 place in a 'VICTORY_ECONOMIC_MODERN' victory!` at M32 (the watch at M31: ours 5,592
  against a goal of 5,194).
- **Clean:** no JS error from our files (209 in the game's unit flags), no crash. Six `Argument conversion failed … getAreaId`
  lines came from our ships' reach (below).
- **No war with a major**; no settlement lost; one unit lost (a scout auto-exploring, shot twice by an independent's Cog at
  E56).

## What game 48's fixes did
- **Settling near worked:** settlements at A2, A9 and A14 (the cap of 3 by A14; game 48 had one until A21), the 4th at A39
  when the cap rose; 8 at E41, 15 of 19 in Modern.
- **Fronts:** Исфахан was a war front against Tecumseh for most of Antiquity (`war front (Текумсе, 2 of their soldiers near):
  melee 3 of 1`); no attack came.
- **Peace and the plague:** no war, no plague, so no `peace:` or `plague:` line.
- **Generals:** a second commander was queued at A26 (QUEUED_COMMANDER, Тегеран) and came at A54 (it waited behind other
  items: CityBuildQueue shows it in production A49-A54). Roles came out VANGUARD and BASTION. Both ended the game at level 0,
  XP 0/7: no `xp: combat` line all game.

## Seen
1. **The commander sat in the capital while Йезд was raided** (T16-T25: up to 3 raiders, its centre down to 66/100, 3 tiles
   from the capital). Its post was Йезд, but the way passed next to the raiders (`wayIsSafe` refused it), so it stayed. At
   T15 and T26 it walked, stopped at 24,23 within a raider's reach, and the escape sent it back to the capital
   (`generals: … escaped from 24,23 to 26,23`). It reached Йезд at about T37, after the last fight. The fights at 23,25 and
   24,24 (CombatLog A17-A29) were next to Йезд's centre: from there its radius would have covered them.
2. **getAreaId took an index:** `hostileShips` and `shoreOf` called `GameplayMap.getAreaId(idx)`; the game takes x and y
   (its own UI: `getAreaId(x, y)`), refused the call six times, and every ship's water body was unknown, so any water counted
   as the ship's (the cautious side). The fake engine accepted an index.
3. **The roles followed the unit ids:** with no promotions both commanders were undecided, and the tie went by the unit key's
   text, so the first commander became the bastion when the second came.
4. **The second commander waited 23 turns in its queue** (QUEUED_COMMANDER is checked only for its own 8 turns).

## Built (21 October; root CLAUDE.md gotcha 79)
- **One rule for where a commander may stand** (`commanderSafeAt`): our centre, else never next to a hostile land unit, and out
  of every hostile unit's reach or beside a soldier of ours. The escape and the walk share it.
- **The walk to its post:** the centre reached this turn is always taken; a longer walk only by a safe way whose first turn
  ends on a tile it may stand on (`turnStop`); else it moves to the tile nearest its post it may stand on this turn
  (`commanderAdvance`, COMMANDER_ADVANCE; UI.log `generals: … advances from … toward its post …`).
- **The escape** goes to a tile it may stand on nearest its post (into the threatened centre when it reaches it), else the
  fewest hostile units in reach.
- **getAreaId(x, y)**; the fake now refuses anything else.
- **Roles remembered:** an undecided vanguard stays the vanguard (`assignRoles(list, previous)`).
- **A queued commander moves to the front** like scouts and settlers (`frontLoadUnits`), behind an item with progress.
- 920 tests; 9 reverts proven (scratchpad `g50_prove.py`). New LOC string COMMANDER_ADVANCE: full restart.

## Still open
- XP from independents: the game's `EXPERIENCE_BARB_SOFT_CAP` 1 and `EXPERIENCE_MAX_BARB_LEVEL` 2 may cap it; this game
  gives no number. The next game with raids near a commander shows it in `xp: combat` lines.
- Decision 1 (no village hunts) stands; dispersing a village gives 25 XP (game 48's parameter line).
