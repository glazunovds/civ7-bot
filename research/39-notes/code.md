# Research/39 notes: cities and production under the science focus (code review)

Scope: how conversions are decided and paid, and what sets a city's production for the space work. Code at the current
`master` (e89bc52). Paths are relative to `mod/expansion-planner/ui/`. Game 32 numbers come from the UI.log in
`research/game32/evidence.zip` (`gold: T…` lines, `strategy:` lines, `economy:` lines).

## Corrections to the game 32 README

- **The University was not bought at E27.** The LEVER goal «Университет (Бристоль) 668» held the gold E25-E29, then
  E41-E44 (728), then E65-E68 (788). It was never bought: no `VICTORY_BOUGHT` or `GOAL_BOUGHT` for it in Exploration.
  What drained the gold at E21-E25 was defence, bought from `all()`:
  - E21 a Knight, 420;
  - E23 a Knight, 420;
  - E24 walls, 240;
  - E25 a Man-at-Arms, 340.

  That is 1,420 gold, about the price of Liverpool's conversion (1,425).
- **Leeds stayed a town all game.** The conversion goal went Leeds (1,087) / Liverpool (1,425) and back. Leeds was a
  town from Antiquity, where it cost 450-500, to Modern.
- **Modern kept 4 cities.** Modern 4% shows `cities 4`. Exploration opened with London alone (`cities 1`), and at E3 had
  `cities 2`: Portsmouth, converted at A64 for 262, came back on turn 2, as the legacy card does (gotcha 31). Birmingham,
  converted at A29 for 337 and a city at A60, is in no Exploration settlement list.

## 1. Cities

### 1.1 How a conversion is decided

1. **Phase and target.**
   - `planStrategy` → `basePlan` (core/xpl-strategy.js:175-217) sets:
     - `cityTarget = cityTarget(focus, age, ageFrac)`, or 0 in the final age (:184);
     - `minCities = pads` in the science COMMIT (:210).
   - `cityTarget` (:169-173, table `CITY_TARGETS` :166) is 5 in Antiquity, and 6 in Exploration before 50%, then 8. That
     is for science and economy only; other focuses get 0.
   - `applyStrategy` carries both under `s.strategy` (:241).
2. **Late-age cut-offs.** `conversionsFrom` (data/xpl-autopilot-steps.js:4654-4665) returns nothing:
   - in a non-final age's last `LATE_CONVERSION_TURNS` 10 turns (:4647, :4655), unless `ctx.expectKeepCities` (the
     Towns tab option, data/xpl-town-job.js:258);
   - in the final age's last `FINAL_CONVERSION_TURNS` 25 turns (:4651, :4656).
3. **The floor.** `conversionRule` (core/xpl-savings.js:156-160) puts us below the floor, where any verdict goes, in any
   of three cases:
   - towns outnumber cities;
   - cities are fewer than `minCities`;
   - cities are fewer than `cityTarget` and `healthy`.

   `healthy` is `citiesHealthy()` (steps:4681-4683): every city at or above zero Happiness. Above the floor only a
   `CONVERT` verdict counts (`CONVERT_VERDICTS_PAST_FLOOR`, savings:20).
4. **Each town's filter** (steps:4659-4663):
   - `canConvert` (Success or InsufficientFunds, town-job:279);
   - a cost above 0 (town-job:276, `getTownUpgradeCost`);
   - not BLOCKED;
   - `calmEnough` (steps:4632-4639): no unrest, Happiness at least 0, and a 6 margin in a crisis.
5. **The town advisor's verdict** (core/xpl-town-advisor.js:42-98):
   - KEEP when production potential is below `PROD_MIN_POT` (20 in Exploration, :20, :77-81), or after 80% of a
     non-final age (:22, :82-85);
   - WAIT when production now is below `PROD_MIN_NOW` (12 in Exploration), or while the cost still falls with
     population (:86-90);
   - else CONVERT or CONSIDER on payback (:91-97).

   Below the floor the verdict only orders the towns.
6. **The order.** `rankConversions` (savings:174-180):
   1. a town on a planned CITY site with population of at least 3;
   2. then the verdict;
   3. then, for science and economy, the most `prodPot` (town-job:275);
   4. then the cheapest.

   In game 32 this put Liverpool first: a population-2 town with 2 production at E10, but a better potential, at 1,425.
   Leeds had 11 production at E10 and cost 1,087. Both were most likely WAIT (production now below 12), so prodPot
   decided.

### 1.2 How it is paid

- **The plan.** `goldPlan` (steps:4790-4855) runs once a pass (hud/xpl-autopilot.js:530).
  - **Kinds.** It builds candidates per kind (:4823-4842); the kinds are `settings.strategy.goals`, or by default
    `CONVERT`, then `LEVER` with a focus (:4806).
    - SETTLER goes first below half the cap (:4811).
    - BANK goes first in Exploration's last 12 turns under science (:4816-4817, `bankForNextAge` :4878-4887).
    - No goal at all with a war at our door (:4820).
  - **Order by phase** (core/xpl-strategy.js):
    - GROWTH: `CONVERT > LEVER` (:188);
    - BUILD science: `CONVERT > CODEX > LEVER` (:77);
    - BUILD economy: `CONVERT > LEVER` (:78);
    - COMMIT science before Rocketry: `CONVERT > PADS > AIRFIELD`, with `CONVERT > AIRFIELD > LEVER` when the gate is
      late (:214);
    - COMMIT science after Rocketry: `PADS > CONVERT > AIRFIELD > LEVER` (:214);
    - COMMIT economy: `LEVER > CONVERT` (:83).
  - **CONVERT candidates** are every town `conversionsFrom` lists, best first, priced at the cost plus the war-risk keep
    (:4832-4834).
- **The choice.** `chooseGoal` (savings:97-112) walks the kinds in order, and each kind's candidates in order. It takes
  the first candidate that:
  - is not in cooldown (`goalAllowed` :126-129: a goal bought 3 turns in a row and still offered is dropped for 5 turns,
    `noteGoalBought` :135-146);
  - and is `withinReach` (:119-123): its hold must be covered by `free()` plus at most `GOAL_HORIZON` 12 turns of
    income (:116). The horizon is shorter near the age's end. `anyHorizon` goals may take up to the age's end; `sized`
    goals skip the check.
- **No memory of the previous goal.** `lastGoalKey` (steps:4740, :4849) is only used to log SAVING.
  - So when the best town is out of reach, a cheaper, worse town is taken.
  - When no town is within reach, the next kind (CODEX, LEVER) becomes the goal.
  - When no kind has a candidate in reach, there is no goal, and `free()` is the whole surplus.
- **The budget** (savings:27-90):
  - `free()` excludes the goal's hold (:45-47);
  - `townLeft()` is 0 while a goal waits (:49-52);
  - `buyVictoryWork` buys the goal from `forGoal()` and anything else from `free()` (steps:2149, `poolFor` savings:72-74).

  So a LEVER or CODEX purchase cannot eat a waiting conversion's hold. It can only spend what lies above it.
- **The purchase order** in the hud: repairs → walls (`all()`) → Fort Town walls → defenders (`buyDefenders`, all the
  gold less 3 turns of a deficit) → `buyFirstMelee` (:536-545) → … → `convertTowns` (:592) → age-end items → `buyGoal`
  → settlers → `buyVictoryWork` → `buyBuildings` (:602-608).
  - Defence ignores the goal's hold, so a threat resets the conversion's savings. That is by design: gotcha 30, and
    research/36 §8.
- **`convertTowns`** (steps:4692-4710):
  - none with a war at our door (:4697);
  - the goal town when `cost + keep <= forGoal()`, else any town the free gold covers (:4699-4702);
  - the game's `canStart` is checked first (:4705).

### 1.3 Why a conversion waits 20+ turns (game 32, Exploration)

| Turns | Goal | What happened |
|---|---|---|
| E1-E16 | none | Leeds at 1,087-1,162, free gold 0-200, income 4-60: more than 12 turns away. With no goal, `buyBuildings` spent the free gold in towns: Harbor and Fishing Quay in Leeds at E7, Harbors in Bradford at E8 and Bristol at E9, 336 in all. A Swordsman defender cost 260 at E10. |
| E17 | Leeds | Free 542 at income 68: Liverpool (1,425) is 13 turns away, so the next town, Leeds, is taken. |
| E18-E21 | Liverpool | Free 610: Liverpool is 11.6 turns away, so it becomes the goal (the flip). |
| E21-E25 | Leeds / Liverpool | The defence buys above, from `all()`, push both towns out of reach in turn. |
| E25-E29 | LEVER University | No CONVERT candidate in reach, so the LEVER goal held 668. Never bought. |
| E30-E40 | Leeds, then Liverpool | Liverpool bought at E40 for 1,350. |
| E41-E44 | LEVER University | No conversion was in reach. |
| E45-E55 | Glasgow | Bought at E55 for 1,500. |
| E57 | Stoke | The conversion goal lasted one turn. |
| E58-E63 | BANK | The Modern bank. |

- **What did not cause it.** The horizon itself cost little once gold was piling up. The LEVER episodes held gold but
  spent none.
- **The real losses:**
  - E1-E16, no goal, so the free gold went to town buildings (336);
  - Exploration's defence purchases (260 + 1,420 at E10-E25, then 655 + 415 at E61-E62);
  - the ranking, which saved for the dearer town (Liverpool, 1,425) while the cheaper one (Leeds, 1,087, 5× its
    production then) was there.
- **Antiquity.**
  - Leeds cost 450-500 from A30, against an income of 16-40. At A30-A41 it was out of the horizon. At A42-A51 the LEVER
    Library (156) was the goal.
  - At A52-A60 there was no goal although Leeds (450) was about 10 turns away, so `conversionsFrom` listed nothing.
    Most likely a city stood below zero Happiness (`healthy` false, towns = cities 2:2, so only CONVERT verdicts, and
    Leeds was KEEP or WAIT), or `calmEnough` failed. UI.log does not say which (not verified).
  - Portsmouth was bought at A64 for 262.
- **The age change (gotcha 31).**
  - Cities become towns, and the legacy card brings them back on turn 2. Portsmouth's 262 conversion survived into
    Exploration, where the same conversion cost 1,087-1,500.
  - The autopilot is off at the change, so the card is the player's pick.
  - The conversion check ignores the age change: `LATE_CONVERSION_TURNS` blocks only the last 10 turns (unless
    `expectKeepCities`), and the advisor's KEEP after 80% (advisor:82) only orders towns below the floor.

### 1.4 Proposed changes (science; economy noted)

**C1. A conversion below the city target is a goal at any horizon, and it stays the goal.**
- **The change:**
  - In `goldPlan` (steps:4832-4834), mark the CONVERT candidates `anyHorizon` while `cities < cityTarget` or
    `cities < minCities`. `chooseGoal` then keeps them until the age's end. Cap them at "reachable before the age's
    last `LATE_CONVERSION_TURNS`": pass `turnsLeft − LATE_CONVERSION_TURNS` for these.
  - Add stickiness: a module-level `convertGoal` (the key) in steps. While that key is still among the candidates,
    move it to the front of `candidates.CONVERT`.
  - The goal changes only when the town leaves the list (converted, BLOCKED, unrest), or when another town ranks
    higher by a clear margin.
  - Clear it in `resetGoldPlan` (steps:4747).
- **Effect in game 32:** a goal from E2.
  - The 336 spent on town buildings at E7-E9 would have been saved (`townLeft` is 0 while a goal waits, savings:50).
  - With Liverpool kept as the goal and the same defence spending, the forGoal gold covers 1,350 at about E36 instead
    of E40.
  - With Leeds (C2): about E33.
  - Without the E21-E25 defence it would be about E21.
- **Risk:** for 15-20 turns nothing else is bought (Universities, codex buildings, town warehouses). Cities still build
  them.
  - In GROWTH (Exploration's first 15%) the reserve is 1 turn and the goal is CONVERT>LEVER. Same behaviour.
  - Economy: same benefit (CONVERT is first in its BUILD goals). Its COMMIT has CONVERT after LEVER, so the change
    only matters before the final age.
- **Tests** (tests/savings.test.mjs, tests/autopilot-gold.test.mjs):
  - `chooseGoal` returns a CONVERT candidate marked `anyHorizon` 20 turns of income away, ahead of a LEVER in reach;
    without `anyHorizon` it returns the LEVER (the old behaviour).
  - `goldPlan` on a fake world (2 cities, 3 towns, cityTarget 6) keeps the same town key on two passes while a cheaper
    town's reach changes.
  - `buyBuildings` buys no town building in that pass.

**C2. Rank conversions by what the gold buys.**
- **The change.** In `rankConversions` (savings:174-180), for science and economy, replace the plain `prodPot` order
  with production per gold: `max(prodNow, k·prodPot) / cost`, where k is about 0.5 (potential is reached only over
  time). Keep the planned-CITY-site rule and the verdict first.
- **Effect in game 32:** Leeds (11 production at E10, 1,087) ranks ahead of Liverpool (2 production, 1,425).
  - Leeds is 338 gold cheaper, about 5 turns of income.
  - At E50, Liverpool as a city made 16 production; Leeds as a town made 12.
- **Risk:** a fresh town on a great site waits. The planned-CITY rule (population ≥ 3) still puts that first.
- **Economy:** same.
- **Test** (savings.test.mjs): two rows with the same verdict, A {prodNow 11, prodPot 25, cost 1087} and
  B {prodNow 2, prodPot 30, cost 1425}. Science ranks A first; the old order ranked B first.

**C3. Cheap Antiquity conversions under the science or economic focus.**
- **The change:**
  - In `conversionsFrom` (steps:4655), skip the `LATE_CONVERSION_TURNS` cut in Antiquity when the strategy has a
    `cityTarget`: the conversion is about ¼-⅓ of Exploration's, and the legacy card keeps it.
  - Alternatively default `towns.expectKeepCities` on for these focuses. That also switches the advisor to "final age"
    payback (advisor:44).
  - And apply C1 in Antiquity too: Leeds would have been a goal from A30 rather than from never.
- **Effect:** about one more city entering Exploration (Leeds at roughly A50-A60, for 450-500, instead of 1,087 at
  about E33).
- **Risk:** if the player does not take «All your cities remain cities», 300-500 gold is lost at the change. The card
  is the player's choice (the autopilot is off then). Say so in the tooltip, and keep the option visible in the Towns
  tab.
- **Test** (autopilot-gold.test.mjs): Antiquity, 5 turns left, cityTarget 5, science: a candidate is listed; with no
  focus it is not.

**C4. Log why no conversion is listed.**
- **The change.** In `conversionsFrom` (steps:4654-4665), once a turn when the floor is lost or every town is filtered,
  write UI.log `conversions: none (healthy false: <city> −N; calm: <town> unrest; verdicts …)`.
- **Why:** game 32's A52-A60 gap cannot be explained from the log. It is a probe, not a fix.
- **Test:** a line appears when `citiesHealthy` is false.

**C5. No Modern conversion under the floor rule alone in a science COMMIT.**
- **The change.** In `conversionRule` (savings:156-160), add a `finalAge` flag that drops the `towns > cities` floor.
  Only `minCities` (a city per pad) and CONVERT verdicts count then. Pass the flag from `goldPlan` and
  `conversionCandidates`.
- **Effect in game 32:** the Sunderland goal (2,500) held M35-M39 instead of a pad bank (see P3). It was lost to the
  Tank at M40 anyway. A city converted at M40 makes about 20 production for 20 turns.
- **Risk:** a military lever wanting points from cities. Settlements score the same as towns (gotcha 44), so no loss.
- **Economy:** the economic COMMIT may still want cities for GDP. Apply this to science only.
- **Test** (savings.test.mjs): `conversionRule({cities: 4, towns: 6, minCities: 4, finalAge: true})` gives no floor;
  without `finalAge` the floor holds.

**Not proposed: blocking LEVER/CODEX purchases while a conversion is short.** The budget already does this. A LEVER
purchase uses `free()`, which excludes the conversion's hold (savings:45-47). The LEVER goal only appeared when no
conversion was in reach. C1 removes that case.

**Not proposed: keeping defence away from the conversion's gold.** Exploration's threats were real (Newcastle's walls
and knights). Research/36 chose all the gold for defenders. A conversion should wait behind a settlement under attack.

## 2. Production for the space work

### 2.1 What sets a city's production in the final age

- **Yield weights.**
  - The science COMMIT uses the SCIENCE profile: F 0.9, P 1.0, G 0.5, S 2.0, C 0.6, H 0.7 before normalising
    (core/xpl-profiles.js:14).
  - Times the science balance F 0.7, S 1.5 (`BIAS_DEFAULTS` :62-66).
  - So science weighs about 3× production in:
    - growth (data/xpl-growth-job.js:91, :116, :155);
    - the building plan;
    - policies;
    - town Focus (`profileFor`, :111-123).
  - `biasFor` (:92-100) flips to P ×1.5, S ÷1.5 only under `settings.spacePush`. `spacePushNow` (steps:1744-1753)
    needs all four of:
    - Modern;
    - Rocketry in;
    - a Launch Pad standing;
    - no Innovation mastery left.

    Game 32: M58, about 3 turns before the loss.
- **Growth.** `placeGrowth` (steps:4459-4498) follows `growthAdvice`.
  - In Modern 21 of 21 new citizens went to tiles up to M30, and 40 tiles against 10 specialists by M60.
  - Production per city stayed at 50-60 while food went 403 → 805 (M30 → M40).
  - Food's scarcity curve (`gainValue`) did not turn those tiles into production. Not traced further.
- **Production first** (steps:1896-2008, research/31 §2.4).
  - **Where it runs.** `productionFirstStep` runs only in cities with a science site standing or queued (:1961-1974).
    `placeSite` runs it once before a city's first site (:1348).
  - **No pads before Rocketry.** `spaceRace` makes pads wait for the gate (:1822), and no pad can be queued before it.
    So before Rocketry production first runs only in Radio Station or Airfield cities.
  - **The rule** (:1940): `c < R·g/(P+g)`, where R = the site's remaining cost plus this city's project runs before the
    goal (`spaceWork` :1889-1893), capped at P × turns left (:1901). Military buildings are excluded (:1921).
  - **Game 32: PRODUCTION_FIRST never fired** (0 lines).
    - London: P about 52, R about 1,000-3,000.
    - An Ironworks (+4 for 535) pays only at R ≥ 535·56/4 ≈ 7,500.
    - The Military Academy (+9 for 420) pays at R ≥ 2,850.
    - Modern production buildings are dear for what they give, so the rule rarely passes.
- **Pads** (`pushVictoryWork` steps:1352-1391; site rows in core/xpl-victory-levers.js:55-65).
  - Pads go to the best producers: the first always, more only within `SITE_MAX_TURNS` 10 (:1376), or
    `buildRatherThanBuy` (:1538-1549, `SLOW_PAD_MAX_TURNS` 30).
  - In the final age the pad and Launch Satellite must fit the age (`siteFitsAge` :1166-1174, :1377). Beyond the first
    pad, the site must also bring the goal sooner (`siteHelps` :1858-1879).
  - Game 32: Rocketry at M45-M47 with 17 turns left. A pad (about 1,050 production, 17-20 turns) plus Launch Satellite
    (about 1,050, 17 turns in Portsmouth) could not fit anywhere. So only the "always" pad (Portsmouth, ordered at M46,
    bought under way at M57 for 664) was possible.
  - Preparation (about 1,050, "prep every 17-21") could not finish either.
- **Pad cities before Rocketry.**
  - `padCities` (steps:4109-4118) and `padExclusion` (:4128-4132, from 60% of Rocketry's way): no wonders there.
  - `holdsPadRoom` (:4296-4309): no long non-production building near the gate. Production-tagged buildings are allowed
    (:4301), but nothing pushes them.
- **Gold for pads.**
  - **Before Rocketry,** `padGoals` (steps:5027-5058) holds a bank:
    - K pads priced in the best producers;
    - `hold = bank × gate progress`, all of it from 0.6;
    - the hold capped at 75% of the gold above the reserve (`PAD_HOLD_SHARE`).

    It is not `anyHorizon` or `sized`, so `chooseGoal` drops it beyond 12 turns of income. Game 32: never chosen before
    Rocketry. The goals were AIRFIELD (M20), GDP (M21-M34), CONVERT (M35-M40), GDP and LEVER.
  - **After Rocketry,** the next pad the game sells (:5034-5039).
  - `victoryPurchases` (:2043-2116) buys a site under way at what it lacks (:2080-2097).
- **Town Focus.**
  - No Focus sends production to cities: towns turn production into gold, and Focuses only send food.
  - The science COMMIT leans URBAN 6, FARM 3 (strategy:82).
  - MINE ("+2 Production on camps, woodcutters, clay pits, mines, quarries, oil rigs", all of it gold in a town) is
    the only Focus that feeds the pad bank.
  - `setTownFocus` (steps:4568-4619) sets a Focus only for Growing towns and never changes one already chosen. The one
    exception is the science revisit FARM → URBAN (:4578-4591).
  - Modern's `PROJECT_TOWN_FACTORY` (Factory Town: +100% gold toward a Factory, Port or Rail Station in the town,
    +1 resource slot) is missing from the Focus table (core/xpl-town-focus.js:11-29).
- **Policies.** `core/xpl-effect-value.js` already values project production (Public Works +30%, Modern science at 50%
  ×2; mod/CLAUDE.md "Choices"). Not a gap.

### 2.2 What game 32 shows

The space work was decided by Rocketry's date (M45-M47, 17 turns left), not by production. Even with 2-3 pads bought at
Rocketry, a Preparation run at 52-62 production takes 17-21 turns and would have ended after M61, when the culture loss
came. Production changes help a game whose Rocketry comes about M35. In game 32 only more cities earlier (part 1, then
more science and so an earlier Rocketry) could have changed the outcome.

### 2.3 Proposed changes

**P1. Production first in planned pad cities before Rocketry.**
- **The change:**
  - In `productionFirstStep` (steps:1954-1978), also treat a city in `padExclusion(strategy)` as a space city while the
    gate is closed. That holds from `PAD_GATE_NEAR` 0.6, so in game 32 from about M31.
  - Its work: `costIn(c, LAUNCH_PAD) + spaceWork(spaceRace(cities, extras with a pad there), sid)`.
  - Pass the strategy in. `pushVictoryWork` gets `pads`; it also needs the gate.
  - Let its buildings take the FIRST rank (`victoryRanks` :1231) as now.
- **Effect:** with R ≈ 1,050 + 2 runs ≈ 3,100 in London (P 52), the Military Academy (+9, 420) pays and the Ironworks
  does not. That is about +9 to +15 production in one or two cities by Rocketry, so a pad comes 2-3 turns sooner and a
  run 2-3 turns sooner.
- **Risk:** the buildings delay non-production builds that also bring Rocketry (Schoolhouses, Laboratories). Keep
  `PRODUCTION_FIRST_MAX` 3, and apply it only from 0.6 of the gate.
- **Test** (tests/autopilot-levers.test.mjs, beside the existing production-first tests): a fake city in `padCities`
  with gate progress 0.7, no pad offered, and a +9/420 building gets PRODUCTION_FIRST. At progress 0.3 it does not; a
  non-pad city does not.

**P2. Value production toward the age's whole work in pad cities (a wider R).**
- **The change.** In `productionFirst` (steps:1896-1946), for pad cities before Rocketry, let R be the city's
  production to the game's end (`P × (turnsLeft − margin)`) instead of only the space work. All of it goes into levers,
  the pad and the runs.
- **Effect in game 32:** London R ≈ 52 × 55 ≈ 2,900 at M5. Little changes: these buildings are dear.
- **Assessment:** weak alone. Combine it with P1, or skip it.
- **Test:** as P1, with R from turns left.

**P3. A sized Launch Pad bank before Rocketry.**
- **The change:**
  - In `padGoals` (steps:5048-5057), size the bank's hold to what the free gold reaches by Rocketry:
    `min(bank, free + income × researchPlan().gateTurns)`. Mark it `sized: true`, as `bankForNextAge` does
    (steps:4886), so `chooseGoal` does not drop it on the 12-turn horizon.
  - Keep the gate-progress share as a floor, so gold is not frozen early.
  - Together with C5 (no Modern conversion on the floor rule), PADS comes right after the CONVERT kind, which is then
    usually empty.
- **Effect in game 32:**
  - Income 50-160 from M20.
  - The economic overlay that bought the Port (972) is already fixed (`ECONOMIC_BLOCK_SHARE`).
  - The bank would hold about 1,500-2,500 by M45, minus the Tank (920, defence) and the settler (660, military lever).
  - That buys Portsmouth's pad at M46 instead of M57. Its Preparation run would end about M63: still after the loss,
    but a game with Rocketry at M35 would get 1-2 more runs.
- **Risk:** the frozen gold delays Schoolhouses and Laboratories. The research/38 B1 hold-by-progress existed for this
  reason (game 7 froze 6,832 for an age). Cap the hold at `PAD_HOLD_SHARE` until 0.6, as now.
- **Test** (autopilot-gold.test.mjs): gate progress 0.5, income 80, `gateTurns` 15, free 200, and a bank of 2 pads
  ×1,400. The PADS goal is chosen with hold ≤ 200 + 80·15; before the change, no PADS goal was chosen (out of the
  horizon).

**P4. The space push from Rocketry, half strength.**
- **The change.** In `spacePushNow` (steps:1744-1753), return `level: "HALF"` once Rocketry is in and a pad is standing
  or queued, and `level: "FULL"` as now. `biasFor` (profiles:92-100) then applies ×1.25 / ÷1.25 at HALF. Put the level
  in `inputSignature` through the balance, as now.
- **Effect:** game 32 had 11-13 turns between Rocketry (M45-M47) and SPACE_PUSH (M58). Growth and the plan would lean
  to production then. That is a few citizens and a building, so +3 to +8 production per city by M58.
- **Risk:** the masteries are 2-5 Innovation each and cheap. A small science loss there is acceptable.
- **Test** (balance.test.mjs and autopilot-paths.test.mjs): `biasFor({spacePush: "HALF"})` gives P 1.25, S 1.2 from
  the science defaults; `spacePushNow` gives HALF with Rocketry and a queued pad while masteries remain.

**P5. Towns feed the pad bank: MINE in the science COMMIT before Rocketry.**
- **The change.** In core/xpl-strategy.js COMMIT.SCIENCE (:82), add `MINE: 3` to `townFocusBias`. Extend the revisit in
  `setTownFocus` (steps:4578-4591) to switch a FARM town to MINE in Modern, with a pad bank waiting and the town having
  2+ mine-type tiles.
- **Effect:** about +4 to +6 gold per such town. With 6-10 towns, +25 to +50 gold a turn, so +400 to +750 over
  M20-M45. That is about half a pad.
- **Risk:**
  - Food sent to cities drops when a FARM town switches, so city growth slows.
  - The revisit's cost is unknown (the existing probe: "does changing a Focus cost anything?").
  - Applies to economy too, where MINE is already +2.
- **Test** (town-focus.test.mjs): with the COMMIT science bias, a town with 3 mines and 2 farms gets MINE over FARM.

**P6. Add Factory Town to the town Focus table.**
- **The change.** core/xpl-town-focus.js:11-29: a `FACTORY` key for `PROJECT_TOWN_FACTORY` (gold discount on the
  Factory, Port and Rail Station, +1 resource slot). Value it only for the economy focus, or where a factory resource is
  owned.
- **Effect:** nothing for science production. Economy gets its Rail Station, Port and Factory purchases at half price.
- **Test:** the option appears when the game offers it.

**Not proposed: a production lean in Modern before Rocketry.** Rocketry was the binding date in games 28-32. Science
before the gate brings it sooner; production then mostly waits for the pad.

## 3. Ranked recommendations

1. **C1:** a sticky CONVERT goal at any horizon while below the city target (science and economy). This was game 32's
   main delay: 16 turns with no goal, and the flip.
2. **C2:** rank conversions by production per gold (Leeds before Liverpool: 338 gold and 5× the production).
3. **C3:** Antiquity conversions under a city target despite the late-age cut, or `expectKeepCities` on by default for
   science and economy. One more city before Exploration at a third of the price.
4. **P3:** a sized pad bank before Rocketry, with C5 (no final-age conversions on the towns > cities floor for
   science), so Modern's gold goes to pads, not to a 2,500 conversion.
5. **P1:** production first in planned pad cities from 60% of Rocketry's way.
6. **P4:** a half space push from Rocketry.
7. **C4:** a log line when no conversion is listed (to explain Antiquity's A52-A60 gap).
8. **P5:** MINE towns in the science COMMIT before Rocketry. Probe the Focus-change cost first.
9. **P6, P2:** Factory Town in the Focus table (economy), and a wider R. Low value for science.

For game 32 itself, only items 1-3 could have changed the outcome, through more cities, more science and an earlier
Rocketry. Items 4-8 matter when Rocketry comes with 25+ turns left.
