# Research 43: fights measured before they are built — the fight simulator and what comes next

23 October, after games 57-59. The user (game 58): "the commander earned some exp, but was not taking much of it, staying in
the city instead of moving more units towards town and constantly fighting, swapping injured units. We need to create some
fights simulator test, so we will have an idea how to better implement it."

## Where we are
- **The simulator** (root CLAUDE.md gotcha 85; tests/CLAUDE.md): `tests/fakes/fight-sim.mjs` carries out the autopilot's own
  orders as they are sent and plays the other side's turn; `tests/fakes/fight-scenes.mjs` holds the scenes (`village58`);
  `tools/fight-sim.mjs [turns] [seeds] [log]` prints runs and means; `tests/fight-sim.test.mjs` keeps the result.
- **Its rules come from the game's logs:** damage 30 × e^(0.04 × the strength difference) on each side of a melee fight
  (CombatLog.csv of games 57-58, 2,243 fights: base 29.5, ±18%); healing 20/15/10/5 (its heal rows); the XP parameters of
  UI.log's `commander parameters:` line; the levels at 7, 15, 23, 30 (`xp:` lines).
- **Built with it** (game 58's scene, 20 turns, 20 seeds; XP of both generals / fights in a general's radius / kills /
  soldiers lost / generals defeated):

  | | XP | in radius | kills | lost | defeated |
  |---|---|---|---|---|---|
  | before | 14.7 | 7.7 | 0.9 | 2.1 | 0.4 |
  | a general stays on a holding centre when its holder is hit | 21.8 | 12.5 | 0.8 | 2.9 | 0.1 |
  | + the skirmish (Archers next to the town, at most one enemy within 3) | 29.6 | 15.6 | 1.4 | 2.8 | 0.1 |

  The experience doubled, but we still lose more soldiers than we kill. The skirmish's first version (Archers posted in the
  open in range of the village) lost 3.7 and had 0.7 generals defeated: the simulator caught it before a game did.
- **Games 58-59:** fights came in Antiquity only. Game 58's generals got no XP in Exploration and Modern (no raids); game
  59's two were at 0/7 after two ages of peace.

## 1. Check in the next game (no code)
- TESTING.md rows 493-499. UI.log: `skirmish:` once a turn by a hostile village; no `generals: … escaped … (hit …)` from a
  centre that holds; no `hunt: …: HOME` for ships alone; `victory watch: … need N at ×M`; `gold: … kept N for a defender (war
  risk)`; `settler: no order … anywhere: none of N tile(s) {…}`.
- Hold the simulator against the game: for a skirmish town, CombatLog's damage per fight and UI.log's XP per fight against the
  simulator's numbers for the same units.

## 2. Make the simulator closer to the game (each one a measured difference)
1. **Our production:** cities train replacements (their production against the unit's cost), through the autopilot's own
   training steps on the fake's queues. Losses then cost what they cost in the game; measure XP per production spent.
2. **The village's behaviour:** how often its units attack and at what odds, and its spawn rate, from the game's logs (game 58's
   UI.log `hunt:`/`skirmish:` soldier counts over the turns; CombatLog's attacks by independents; AI_Tactical.csv).
3. **Settlement centres:** a centre's own health (100 for a town, 200 walled), attacks on it, a unit standing on it.
4. **Terrain:** the defence of hills, forest and rivers (`Features`/`Terrains` `DefenseModifier`) and movement costs.
5. **Promotions:** the commanders' (Merit's radius 2, Bastion's defence), Focus Fire's +2 a unit checked in CombatLog.
6. **A replay scene:** game 58's units at A56-A70 (UI.log positions), its fights and XP compared with the simulator's.

## 3. Behaviour to try in the simulator, in this order (shipped only when it wins)
1. **Bring more units to the skirmish town** (the user's "moving more units towards town"): free melee soldiers to rotate with
   its holder, shooters from farther away.
2. **A melee screen** between the shooters and the village (zone of control: their soldiers stop next to it).
3. **Swap a hurt shooter** for a fresh one on its post (rotateFront for skirmish posts), not only escape.
4. **Disperse the village** once its soldiers are down: 25 XP (EXPERIENCE_DISPERSE_INDEPENDENT; whether the level-2 cap for
   independents applies is to be checked in game).
5. **Hunts with one melee soldier** when two or more shooters back it (HUNT.MIN_MELEE 2 found «melee 0 of 2» every turn in
   game 58).
6. **More scenes:** raiders roaming near our land (games 54-55), a major's army at a front (game 56), ships shelling a coast
   (game 55), a peaceful age with a far village.

## 4. Peaceful ages give no XP (a decision for the user)
Games 58-59 had no fight after Antiquity. Options, each measurable with a far-village scene: raider hunts farther
(RAIDER.REACH 6 → 8), village hunts farther (HUNT.REACH 8 → 10), «Учебная война» less strict (gotcha 83's E), or accept it.

## 5. Game 57's economy
Tecumseh's GDP was 1.5× ours at M1 and won at the 80% step. Each dominance race projected to the final step at its rate (points
a turn, not points) would start the economic block from the age's start, buying gold buildings early; the watch reads points
only today.

## After game 60 (25 October)

### What the simulator gained
Three of game 60's packages changed it, each measured on its own copy; the merged simulator has all of it, and plays an assembled army as the game does (it defends as one unit: its strongest packed soldier fights, and the army unpacks around its general once that soldier is hurt 50 or more) and ends «rest until healed» at full health:
- **Replays of a game's own turns** (the log package; root gotcha 86): `node tools/unitmap.mjs <Logs> from= to= scene=<file>`
  writes a scene from the game's AI logs (AI_MovementPlanning places every unit by id each turn; CombatLog and AI_Tactical give
  the fights) and our UI.log lines: our units, packed soldiers and their soldiers within `reach` 12, raiders away from their
  village, the villages with their measured cadence, the level thresholds and the game's own fights, kills, losses,
  in-radius count and XP per turn. `replayScene(data)` (tests/fakes/fight-scenes.mjs) builds the world, and `node
  tools/fight-sim.mjs scene=<file> [turns] [seeds]` prints the game's numbers beside each seed's. A launch's folder holds
  every age: `session=N`.
- **Per-scene levels** (`levels`: Standard's 15/30/45/60, the Online 7/15/23/30 by default; points carry over each level, as
  the game's `xp:` lines show: 12/15 became level 1 at 5/30).
- **Several villages, each with its own cadence** (`villages: [{ x, y, owner, spawn, every, first, max, leash, raid, seen }]`)
  and dispersal; a unit with `raid` walks to our nearest settlement; enemies never step onto our centres. The cadence is
  measured now (Independents.csv, first-seen turns, bursts restarting the clock): game 60's p28 spawned at 14 22 30 38 46 54,
  a party of 5 at 57, then 65 73 81 89, a party at 96, then 103 110 116 122 128 134: every 8 turns, then 7 (A103-A110),
  then 6, plus raid parties (an Army Commander and about 4 soldiers: p36 T40, p35 T52, p28 T57, p14 T65, p28 and p36 T96).
  The old scene's "a soldier every 4 turns" was twice the game's pace.
- **The zone of control in our paths** (the war package; root gotcha 88): the fake path ignored it while the moves applied it.
  With it, the war build's baseline lost its general in 6 of 10 `raids60` seeds; two holes in `formCommander` were found and
  fixed in the mod (a general under a hurt soldier that withdrew in the same pass, or on an open tile in an Archer's range).
- **Scene `raids60`** (game 60's raids on four settlements from two villages 9-10 tiles away, one general, Standard levels):
  `node tools/fight-sim.mjs 20 20 raids60`.
- **Fog** (the scouts package; root gotcha 87): `fog [sight=N]`, the fake's `world.sight`; the danger readers count only units
  we see (or saw within 2 turns).

### What it measured (each on its package's own simulator; XP / fights in a general's radius / kills / lost / defeated)
| | before | after |
|---|---|---|
| game 58's village, 20 seeds (war build) | 61.6 / – / – / – / 0 | 66.5 / – / – / – / 0 |
| `raids60`, 20 seeds (war build) | 13.1 / 6.3 / – / 4.0 / 0.6 | 24.4 / 15.5 / – / 4.2 / 0 |
| game 58's village, fog at sight 2 (scouts build) | 61.8 / 24.3 / 4.9 / 3.1 / 0 | 42.8 / 20.1 / 4.9 / 3.0 / 0 |
| game 58's village, fog at sight 3 (scouts build) | | 59.9 / 22.9 / 3.5 / 3.6 / 0 |

Game 58's village gave 29.6 XP at gotcha 85 and 61.6-63.2 at the packages' baseline (ffe9fa1, before any of them): the scene
changed between them, so TESTING.md row 499's numbers are stale. The merged simulator is none of these copies. Its numbers (20 turns): game 58's village, 10 seeds, XP 69.2, fights in a general's
radius 26.9, generals defeated 0; `raids60`, 20 seeds, XP 25.1, in a radius 11.7, kills 7.7, lost 2.9, defeated 0.1.

### The first replay: game 60, T60-T75 (`unseen=35,36`, 20 seeds)
- **The game:** 40 fights, 15 of them against ships (left out of the scene), 8 kills, 1 unit lost, the general +8 XP; 9 of the
  16 fights the old probe logged had the general within a tile.
- **The simulator:** 28 fights, 5.2 in a general's radius, 3.9 kills, 6.4 lost, 0.7 generals defeated, XP +5.2.
- **What matches:** the villages' births fall on the game's turns (p28 T65 and T73, p36 T64 and T72, p35 T60 and T68), and
  the number of land fights is close.
- **What does not:** the simulator is much harsher on us. It has no settlement defence (district health, walls: its raiders
  walk onto Санкт-Петербург's centre at 65,9), no terrain and no water. Its raiders all march at once, while in the game p28's
  raid party stayed packed until T64-T66. A general walking to a hunt's staging tile is caught alone at T62-T64; in the game
  that general wandered 65,9 → 65,13 → 66,12 → 65,11 and was never caught.

## Marks on the existing plan

**§1 Check in the next game.** Game 60 ran gotcha 85's build: no skirmish ran (Шэнле stood 5 tiles off, `REACH` 4: now 5),
and the hunts' home rule ended one hunt and blocked Шэнле's for 10 turns (now: guards in time count, and a centre the hunted
owner alone hit, holding half, calls none home). The next game's checks are TESTING.md rows 500-583; for the simulator, row
499 and 525 (a replay).

**§2 Make the simulator closer to the game.**
1. Our production: **still to do.**
2. The village's behaviour: **the spawn cadence is done** (measured, per village). Still to do: its attack odds and choices
   (AI_Tactical's `Move x y Attack x y` rows are read by unitmap now), and raid parties that stay packed until they reach us
   (a replay starts them unpacked as raiders).
3. Settlement centres: **still to do, and now first**: the replay's largest gap (6.4 of ours lost against the game's 1).
   A centre's health (100 a town, 200 walled), attacks on it, a unit on it, the walls' defence.
4. Terrain: **still to do**, with water: ships and their fights are left out of every scene (15 of game 60's 40 fights).
5. Promotions: **still to do** (Merit's radius, Bastion's defence, Focus Fire's +2; the mod's promotion order changed: gotcha 88).
6. A replay scene: **done** (game 60's T60-T75). Game 58's turns very likely cannot be replayed: its evidence has no AI_MovementPlanning and its
   Logs folder is gone (the log archive keeps them from now on). Replay game 60's other raid windows (T29-T49 on the capital, A80-A106 by Тула and Нижний
   Новгород) and every next game's.

**§3 Behaviour to try in the simulator.** Unchanged, all still to try, measured on the merged simulator and on `raids60` as
well as `village58`: more units to the skirmish town, a melee screen, swapping a hurt shooter, dispersal for 25 XP, village
hunts with one melee soldier (raider hunts already take one). Item 6 (more scenes): `raids60` is done (roaming raiders on
several settlements); still to do: a major's army at a front, ships shelling a coast (needs water), a peaceful age with a far
village.

**§4 Peaceful ages.** Still the user's decision. Game 60's Antiquity was all independents' raids; whether Exploration and Modern
had fights is in the review still to do (research/game60).

**§5 Game 57's economy.** Not done.

### New items
1. **Merged simulator measured** (numbers above); fight-sim.test.mjs's deterministic thresholds may still be set from it.
2. **The fog's real radius:** the next game's `units:` lines (`unseen N`) and `flee:` lines show what the game lets us see;
   set `sight` in the scenes from them (at sight 2 game 58's scene lost a third of its XP, at sight 3 almost none).
3. **Hostile commanders and scouts in scenes:** the mod now strikes them (gotcha 88); unitmap leaves enemy commanders and
   civilians out of a scene.
4. **Compare like for like:** a simulator turn-end line in the `units:`/`fight:` format, so a replay and the game print the
   same table.
