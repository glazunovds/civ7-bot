# Game 37 evidence (lost at Modern T33: Hatshepsut's culture countdown)

Great Britain (Ada Lovelace), science focus, eight majors, the default Continuity age transition. The first game with research/37 Phases 3 and 4 (armies, formations). `evidence.zip`: UI.log, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, GameCore.log, Game_PlayerScores.csv, Modding.log, Player_Legacies.csv, Player_Stats.csv, Player_Treasury.csv, net_message_debug.log, Independents.csv, at the game's end.

## The end
- GameCore.log 21:35:32: `Team 2 has won … 'VICTORY_CULTURE_MODERN'` (Hatshepsut, player 2), at Modern T33.
- The watch: her culture 345 against the ×2 goal of 240 from about Modern's 40%, a 5-turn countdown; blocking it needed 199 more of our own culture (ours 69). As in game 36, a runaway leader of a dominance victory, beyond any block.
- Ours: Innovation 41 of 100 at the end; science first among the majors, military second (57 against 58).

## Errors
- No `JS Error` from our files, no failed step, no held turn (no `BLOCKED`).
- 340 `unit-flags.js:348 Expected this.unit to be non-null` errors from the base game's unit flags (game 36 had 456): not ours.
- Our JS reloaded once mid-game (21:08:37, Exploration T8): a patch meant for a scratch copy reached the live mod folder; the autopilot was off until T9 (21:13:55).

## War
- **No war with a major** all game (DiplomacySummary: only independents' surprise wars; Pachacuti's call to war on Friedrich declined at E20, a war risk from Friedrich at M21).
- **No settlement lost** (Player_Stats: never a drop); one unit lost (below).
- **Combat** (CombatLog, ours): Antiquity 6 attacks, 3 kills; Exploration 11 attacks, 4 kills; Modern 2 attacks, 2 kills; none of our attackers died. Attacked: 11 / 8 / 1 times.
- **Threatened settlements** (`defence:` lines): Манчестер (A29-A69) and Шеффилд (A49-A70) in Antiquity (Шеффилд up to 5 raiders, walled, never below 89%), Лидс down to 69% at A67-A70; Ливерпуль E40-E59 (6 soldiers sent); Ньюкасл M9-M29, Сандерленд M20-M32 (ships, then a war front with Friedrich), Сток-он-Трент M32.
- **Ньюкасл** (a far town, about 30 tiles from the core): an independent Line Infantry stronger than any guard; nothing could walk there in time, nothing could be trained within reach, and the gold (201-370) was short of a Line Infantry (460) until M17, when one was bought. The centre fell to 60/100 and recovered; our Line Infantry killed the raider at M22 and a Rifleman at M29.
- **The unit lost:** a Swordsman 6 tiles east of Шеффилд, hurt in duels with an independent (E3-E7), healed in place each turn (no hostile within HEAL_SAFE_RADIUS 2 when it was its turn); a Heavy Archer walked up and shot it at E8 (24 health left).

## Phase 4: formations
- 47 `formation:` lines, 7 moves, no shuffling. Stays: on the centre 37, hurt 15, no better post 12, busy 12, moved 4.
- Moves: the commander next to Шеффилд's centre (A61, +35); a Chariot onto Манчестер's empty centre (A64); a Warrior into Манчестер's screen (A67, +40); a Heavy Archer and a Catapult into range of a ship at Ливерпуль (E56, +45, +35); Ньюкасл's Line Infantry back onto the centre (M25, +50) once healed, after its kill at M22 had advanced it off (it stayed while hurt).
- A formation counts the hostiles within 5 tiles while the threat counts those within 4 (outside villages): Ньюкасл's lines show 2 raiders in a sector against the threat's 1. Harmless here.

## Phase 3: armies
- One commander all game, its army empty (`army: … unitCount 0`): nothing packed, no unpacking, no reinforcement (as in games 30 and 36; Continuity packs nothing and we never pack).
- The commander walked most of the time: in Exploration it was re-posted seven times between Манчестер, Лондон and Ливерпуль (E36-E61) as Ливерпуль's raid came and went (E40-E46, E55-E59) and a crisis took the others below zero Happiness, each walk about 5 turns, so it rarely arrived; in Modern it walked 18 turns to Ньюкасл (M9-M27), which a purchase had secured at M17, then back toward Лондон.

## Dispersing
- Antiquity T62-T63: the Warrior sent to Тичитты's empty village (52,13) stood on it at T62's end, was shot for 30, and withdrew at T63 (the escape step before `defend`'s dispersing). Fixed after T63 (not committed): disperse first, and on arrival in the same pass (`disperseArrivals`).
- Not exercised after the fix went live (Exploration T8): no `DISPERSE_MOVE` in Exploration or Modern.

## Fixed after the game
- The commander's posts (`commanderPost`): a threatened settlement only within 6 turns, its own post kept while it holds, in peace a new post only for a settlement within 4 turns 3 points unhappier, and one on its way keeps its post.
- Healing (`defend`): away from our settlements a hurt soldier steps back when a raider's next turn reaches it (`hostilesInReach`: moves + range, or + 1 for melee).
