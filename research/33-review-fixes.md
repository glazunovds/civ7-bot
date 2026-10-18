# A code review after game 27: nine findings, all confirmed and fixed

A review of the autopilot and the building planner listed nine problems (the user: «confirm these issues and fix them»). Each was confirmed in the code first.

**How they were proven:** each fix has a test that fails without it: 13 cases, reverted one by one on a copy (scratchpad `prove_r9.py`). TESTING rows 315–321.

## 1. A rival's science countdown was not watched, and set no deadline
- **Confirmed:** `victoryWatch` read only dominance races (`scoring !== DOMINATION` → skip). A rival two turns from the science victory gave no entry. With the score victory off, the final age had no end at all (`ageOutlook` → Infinity), so production was planned as if the game went on.
- **Fix:**
  - **The watch:** fixed-score races (science) are watched too (`fixedWatch` in core/xpl-victory-focus.js). The rival nearest to winning is the one whose countdown ends first, else the one with the most points. Levels:
    - DANGER: its countdown runs, or it has 85% of the goal;
    - WATCH: 60%;
    - our own CHANCE: 85%.

    There is no `need` (nobody's score holds it back). The tab and the log say it in their own words (`LOC_XPL_AP_WATCH_FIXED*`, `RIVAL_NEAR_WIN_FIXED`).
  - **The deadline:** `rivalWinTurns()` (data/xpl-victory.js) is the soonest a rival's fixed-score countdown ends the game, of the victories switched on. `ageOutlook().turnsLeft` counts to it (`rivalWin`), and `endless` is false then. So is the town job's `ageTurnsLeft`.
  - **Not a dominance countdown:** we may break one by holding second place (research/31 §3), so it sets no deadline.

## 2. Production upgrades stayed behind a slow Launch Pad
- **Confirmed:** production first looked only at cities with a science site standing or queued. A city's first pad was ordered with nothing ahead of it, and started at once. The next turn its Ironworks was appended, and the progress rule (root gotcha 20) kept it behind the pad for the pad's 40 turns.
- **Fix:** before a city's first science site is ordered, its production first is weighed (`placeSite` → `productionFirstIn`), with the site and its projects as the work. Those buildings are appended ahead of the site.

## 3. The plan queued what the victory step refused
- **Confirmed:** the victory step queues the path's buildings only where they are done within 12 turns (`leverSoon`; game 16). An empty queue took them from the plan or the advisor anyway: a 40-turn Laboratory went in through the plan.
- **Fix:** `fillProduction` skips a path's building that is not `leverSoon` in that city: in the plan, the advisor and the cheapest-building fallback. A slower city leaves it to the purchases.

## 4. Preparation always went first, even when a one-off would win sooner
- **Confirmed:** Preparation ranked ahead of every one-off in a Launch Pad's city (research/32 §3), and no one-off went there.
  - At 95 Innovation that took a 10-turn Preparation run over a 5-turn Launch Satellite.
  - Launch Satellite needs a Launch Pad in its own city, so in practice it never ran.
- **Fix: the race model** (core/xpl-victory-levers.js).
  - `innovationReach(need, cities)` finds the turn the Innovation still needed is reached. Each city runs its queued projects after the items ahead of them, then Preparation again and again where a Launch Pad stands or is queued; an Airfield city runs its flights.
  - `oneOffNext(race, city, oneOff, lock)` tries the one-off at every place in the city's runs, and not at all. It goes next only when that reaches the need strictly soonest.
  - A tie keeps Preparation first: it gives more Innovation for the production, and the need may shrink on its own.
- **In the step:** `pushVictoryWork` builds the race (`spaceRace`; Innovation from the game's completion modifiers, else `PROJECT_INNOVATION`). A one-off chosen there ranks between the Launch Pad and Preparation (`VICTORY_RANK`), and is queued first.

## 5. Production first assumed 2000 production of projects
- **Confirmed:** the payback rule c < R × g / (P + g) took R = the site's remaining cost + `SPACE_PROJECT_WORK` 2000, whatever was left. With one run of 300 left to win, an Ironworks was accepted and made that run later.
- **Fix:** R = the site's remaining cost + the projects this city runs before the goal is reached or the game ends (`spaceWork`: the runs `innovationReach` counts done there). SPACE_PROJECT_WORK remains only when no science victory is known.

## 6. The victory work ignored the plan's tiles
- **Confirmed:** the victory work, its purchases and goals, and production first took the game's best tile for today's yields. That was often a tile the plan kept for a quarter or a wonder's neighbours.
- **Fix:** `bestPlotFor` (and `pickPlot` for production first) takes:
  1. the plan's own tile for that building, when the game takes it now;
  2. else the game's best of the tiles the plan leaves free (no other planned building, no wonder anchor);
  3. else the game's best of all.

  The advisor's buildings and the fallbacks use it too.

## 7. Planned warehouses were never queued
- **Confirmed:** the plan keeps warehouses apart (`fillers`), and `queueNextBuildings` read only `placements`.
- **Fix:** `plannedInOrder(plans, sid)` (data/xpl-city-actions.js) merges both:
  - a timed plan: by completion turn, the adjacency buildings first on a tie;
  - else the adjacency buildings, then the warehouses.

## 8. Moves scheduled buildings before their connectors
- **Confirmed:** local search, repair and annealing move a building keeping its completion turn, and checked only the finished layout's connectivity. Replayed in completion order, 25 of 30 random layouts (the review said 26) had a building whose tile touched no urban tile standing by then. The game refuses it until then.
- **Fix:**
  - `isConnected` is timed: a tile the plan makes urban must touch the centre or an urban tile standing by the turn its first building is done (`urbanTime`). Tiles of one turn are taken in any order.
  - Every move, swap and repair goes through it, so a layout is always buildable in its own order: now 0 of 30.
  - A tile's `districtTime` follows its earliest building after moves (`place`, `lift`). Adjacency to a district counts from it.
- **Effects:**
  - Planner speed is unchanged (bench-plan: 1681 ms, against 1762 ms before).
  - Layout quality: on the optimality bench (10 timed maps) our gap to the best found is 0.93% on average (0.98% before). The best values are lower now: unbuildable layouts no longer count.

## 9. The game's no blocked tiles a connector would open
- **Confirmed:** the game lists only tiles touching the urban area now (root gotcha 5). `canPlace` took its no for any owned tile as final: an owned tile two rings out stayed refused (ENGINE) after the plan put a connector next to it.
- **Fix:** the game's no stands only for a tile in or next to the urban area as it stands now (`touchesBuiltUrban`). Beyond it our rules and the plan's contiguity decide.
