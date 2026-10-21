# Game 45: WON the economic victory at Modern T46 (23:25)

Machiavelli: Persia → Spain → America, the economic focus all game (no switch), 22:39-23:25 in the same game process as game
44 (the logs were split at 22:38:59 and at the second turn drop of the CSVs: scratchpad g42/split2.py). `evidence.zip`:
UI.log (our lines and JS errors), net_message_debug.log, GameCore.log, Player_Stats.csv, CityBuildQueue.csv,
Player_Legacies.csv, DiplomacySummary.csv, CombatLog.csv, Player_Treasury.csv, and `bought-then-queued-tiles.txt`.

## The game
- **Won by a turn:** our economic countdown and José Rizal's culture countdown started together at M42 (ours 4 turns left, his
  5). His culture stood at 209 against a goal of 214; a block needed 161 of our own, we had 128.
- **Military lever:** from M36 one or two settlements would have started our own military countdown (`MILITARY_LEVER`); two
  foundings took us from 72 to 82, and the best other rose from 45 to 57, so it stayed one short (a settler bought at M44).
- **Settlements:** a cap of 3-4 all Antiquity (4 settlements), 4 of 8 E1-E25 (the home continent full, the other sites across the
  sea until Cartography: SEAS / NO_PATH), 11 of 11 at E70, 17 of 17 in Modern. None lost, no war with a major; Philadelphia's
  centre fell to 0 at M20 (5-7 independent raiders, its nearest guard 8 turns away) and held with walls bought.
- **Wonders built (10 of 11 ordered):** Dur-Sharrukin, Colossus, King Seongdeok's Bell, Sanchi Stupa, Grand Bazaar, Tomb of
  Askia, El Escorial, Red Fort, Dogo Onsen, Statue of Liberty.
- **Clean:** no JS error from our files (421 in the game's unit-flags.js), no crash, no turn held; both age changes stopped at
  AGE_OVER and switched themselves on again after the dedications (AUTO_RESUMED at E1 and M1).
- **Card research** (root gotcha 76): Mercantilism (+14 a turn, 9 turns), Authority (Levies 36.7 over Colonial Surplus −8.2),
  Social Question (Social Science 80 into a free slot), Modernization (Living Standards 79.9 over Commune 11.6).

## Items the game never completed (about 1,700 production)
Four buildings stood at 100% and never completed; whenever one came back to the front, the city's production poured into it:

| City | Item | Tile | Stuck | Pile | Cost |
|---|---|---|---|---|---|
| Экбатана | Monument | 74,46 (a Library) | A50-A69, 8 turns at the front | 281 | 67 |
| Патрагада | University | 73,37 (a Saw Pit) | E59-E70, 5 turns at the front | 825 | 437 |
| Кадис | Granary | 76,24 (a Saw Pit) | E69-E70 | 65 | 27 |
| Памплона | Grocer | 81,44 (a Brickyard) | M10-M41, 28 turns at the front | 1,232 | 267 |

- **Our give-way made Памплона worse:** alone in the queue at M20, `unstickQueues` queued the plan's next building to go ahead of
  it, which was a second Grocer on the same tile; the two Grocers then swapped places 24 times, both at 100%.
- **What the four tiles share:** each one's first building was bought with gold (the Library A41, the Saw Pits A40 and E66, the
  Brickyard E62), and the stuck one was the second building queued there. But 37 other tiles where we bought a building and
  queued another later completed (`bought-then-queued-tiles.txt`), and no AI city's item stood past its cost on consecutive
  turns. Nothing on the four tiles was damaged or unfinished (the stuck probe), and the combat log shows no attack on them.
- **Экбатана** had a second order of ours on the tile: Ancient Walls queued on 74,46 ten seconds after the Monument (the walls
  step does not ask the one-order-per-tile rule, root gotcha 74). The other three had no other order of ours there.
- **A lead:** the game's own placement screen only offers the tiles in `Plots` / `ExpandUrbanPlots` of
  `canStart(BUILD, {ConstructibleType})` (building-placement-manager.js `isPlotIndexSelectable`), while our orders
  (`orderAtTack`) only ask `canStart` with X and Y, which may not check the tile at all; the plan also keeps tiles beyond
  today's urban area (root gotcha 5). Whether these tiles were offered when ordered is not in the logs.

## Built (the user: «implement all of them»; root gotcha 77)
1. **The give-way is never the stuck item's own type nor on its tile:** `unstickQueues` moves the first other item that is
   not its type, not on its tile and not stuck itself; queued to go ahead, `cheapestBuilding` skips a building already queued.
2. **Stuck three turns, it leaves the queue:** `dropStuck` (QUEUE_STUCK_DROPPED), and that building keeps off that tile 20 turns
   (`stuckOff`: `pickPlot` and the plan's queue); one found stuck is stuck again at once when back at the front.
3. **Walls on a free tile:** `fortifyThreatened` takes the centre or an offered tile no other order of ours takes, and notes
   its orders; the plan's orders of a pass are noted on their tiles too.
4. **Offered tiles only:** `orderAtTack` refuses a tile the game does not list for that building without a tile (`tileOffered`),
   as its own placement screen; the stuck probe says whether the stuck tile is offered.

Tests: autopilot-queue (2), autopilot-expand (walls), tack-orders (offered tiles); 8 reverts proven (scratchpad g45_prove.py).
