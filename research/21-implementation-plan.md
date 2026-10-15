# 21. Implementation plan: strategy phases, gold savings, and the game-6 backlog

Plan for research/19 items A1–L9. It is based on research/18 (game 6), research/20 (web strategy), research/14 and 17, and the code as it stands on 2026-10-13 (uncommitted work included). Paths are relative to `mod/expansion-planner/ui/` unless they start with `tests/`, `tools/` or `text/`.

## 0. Summary

The work splits into seven milestones. Each one ships and can be tested on its own.

| # | Milestone | Items | Size | Needs |
|---|---|---|---|---|
| M1 | Gold plan: save for goals, count every spend, convert towns | B1–B4, C1, L4 + three log-only probes (F1, F2, C2) | L | – |
| M2 | Strategy phases (Growth / Build / Commit) by focus; Launch Pad bank | A1–A3, L5, L3, D8, E2, E3, E4, C3 (final age) | L | M1 |
| M3 | Research for Innovation | D1, D2, L2 (Future Tech, targets) | S–M | – |
| M4 | Victory blocking watch | L1 | M | M2 |
| M5 | One-off Innovation sources and production discipline | D3–D7, E1, C2, H2, L7 | L | M1, M2 |
| M6 | Bugs that cost turns | H1, C3 (long walks, no sites), F1, F2 | M | probes P1, P2 |
| M7 | Diplomacy, crises, log noise, player hints | G1–G3, H3, H4, I1, I2, L6, L8/J1/J2, L9 | M | user decision on G1, probes |

Size: S < 100 lines, M 100–300, L > 300 (code plus tests).

## 1. Ground rules for every item

- **Tests:**
  - Every fix gets a test that fails without it. The scratchpad prover lists `(file, original, reverted, test file, test name)`; each item below has a **Revert** line that is exactly that case.
  - Diagnostic-only log lines need no regression test.
- **Strings:**
  - Every new `LOC_XPL_*` key goes in `text/en_us/InGameText.xml` (`<Row>`) and `text/ru_ru/InGameText.xml` (`<Replace … Language="ru_RU">`).
  - Text changes need a full game restart.
- **TESTING.md:** one row per user-visible change, numbered from **170** (the last is 169).
- **New files:**
  - `core/xpl-savings.js` (M1) and `core/xpl-strategy.js` (M2).
  - Both need `python -I tools/sync-modinfo.py`, `node tools/check-imports.mjs` and a full restart.
  - JS-only edits reload live but switch the autopilot off. Tell the user to press «Включить».
- **Layering:**
  - Pure decisions go in `core/`: no engine globals, Node-tested.
  - Engine reads go in `data/`, each call in `safe()`.
  - The orchestrator is `hud/xpl-autopilot.js`; the display is `panel/xpl-tab-autopilot.js`.
- **GameInfo tables are not arrays:** use `filter/find/forEach/for…of` only; in tests, copy a table with `Array.from(GameInfo.X, fn)`.
- **Gotcha 20:** no queue move ahead of an item with progress; units are the exception, and E1 narrows that exception.
- **Settings:**
  - Only new keys in `DEFAULT_SETTINGS.autopilot`, each with a `sanitize` rule. Never a new localStorage key.
  - The strategy never calls `settings.patch`. It works on an effective copy (§3.5).
- **Checks before handing off:**
  - `npm test`
  - `node tools/check-imports.mjs`
  - `node tools/check-imports.mjs mod/memento-advisor memento-advisor`
  - `powershell -NoProfile -File tools/check-syntax.ps1`
- **Game data first:**
  - The dominance goal comes from `Game.VictoryManager.getCountdownVictoryDominanceScore`.
  - Innovation wonders come from `GameInfo.ConstructibleModifiers` rows `*_SCIENCE_VP`.
  - What a town Focus may buy comes from TypeTags (`URBANCENTER`).
  - Mastery gates come from `ProgressionTreeNodeUnlocks.UnlockDepth`.
  - The web's numbers are used only as fallbacks.

## 2. Probes before coding

Answer these first. P2, P6, P9 and P11 can be read from game 6's logs if `Logs\` has not been overwritten; otherwise check the forensics notes.

| # | For | Question | How | What the answer decides |
|---|---|---|---|---|
| P1 | F1 | Why `SimulateCombatResult` never arrived. Our call matches `panel-unit-combat-preview.js` exactly: `simulateAttackAsync(unit.id, {Location, X, Y, CombatType: NO_COMBAT})`, answered by `ComponentID.isMatch(QueryToken)`. | Ship a diagnostic (M1) that logs every `SimulateCombatResult` with ms since the request and whether the token matches, and makes one try with a 3 s wait. In the debug console, try the call with and without `UI.Player.selectUnit(u.id)` first. | Fix the call or the wait; else use the estimate fallback (M6 F1). |
| P2 | F2 | Why Фучжоу was founded 4 tiles from a camp created at Exploration 1. | Game 6 UI.log `sites:` lines and `SETTLE_*` around Exploration 1–12; Independents.csv for the camp's turn and type; was the camp tile revealed? M1 adds a villages count to the `sites:` line and the nearest village (distance, type, revealed) to each `SETTLE_FOUND`. | Which F2 fix (M6). |
| P3 | C2, D6 | What a town with Urban Center may buy. Game data: TypeTags `URBANCENTER` = Antiquity Library, Market, Monument, Garden, Barracks; Exploration Observatory, Bazaar, Kiln, Tavern, Wharf, Dungeon; Modern Schoolhouse, Museum, Port, Cannery, City Park, Military Academy (`age-*/data/constructibles-no-persist.xml`). | M1 diagnostic: once a turn, for each town whose `Growth.projectType` is Urban Center, log `CityCommands.canStart(PURCHASE, {ConstructibleType})` for every URBANCENTER-tagged building. Or set the Focus by hand and look at the purchase list. | Whether C2's "town levers" rule is right; root gotcha 30. |
| P4 | D3 | Does a project moved ahead of a building with progress take that progress? | By hand: a city with a building at about 50%, move a project in front, end the turn, read CityBuildQueue.csv (a jump in Production Added). | Whether D3 may ever put a project ahead of progress near the age's end; update gotcha 20. |
| P5 | L6 | Do town Focuses reset to Growing at the Modern transition? | Next game, Modern turns 1–2: Towns tab and UI.log FOCUS entries. | Whether L6 needs code. |
| P6 | L3, L4 | How much gold carries into the next age? Do non-capital cities revert to towns? | Player_Treasury.csv and Player_Stats.csv (numCities) around each age change. | Whether the Launch Pad bank may start in late Exploration; whether to stop converting in an age's last 10 turns. |
| P7 | L3 | Does `city.Gold.getBuildingPurchaseCost(YIELD_GOLD, "BUILDING_LAUNCH_PAD")` give a price before Rocketry? | Debug console in Modern before Rocketry. | The bank price source. Fallback: `Constructibles.Cost` × `productionToGoldRatio` (`data/xpl-town-job.js`). |
| P8 | G1 | Can we answer a call to arms with a formal war? | When an ally calls: `Players.get(me).Diplomacy.canDeclareWarOn(target, WarTypes.FORMAL_WAR)` (as `diplomacy-manager.js raiseWarTypePopup` asks); after `DECLARE_WAR {Type: DIPLOMACY_ACTION_DECLARE_FORMAL_WAR}`, does the call notification clear? | G1 option design. |
| P9 | I1 | In game 6, did the crisis offer more cards than crisis slots? | POLICY / POLICY_FORCED log entries during the crisis, slot count. Policy Yield Previews already counts imports, suzerainties and unit upkeep (`apply-effects.js:172/182/268`). | Whether I1 needs code at all. |
| P10 | I2 | Is a celebration's extra slot a policy slot? | `getNumCultureSlots` before and after a celebration. | I2 is likely documentation only (no celebration modifier adds a slot; the slot is engine behaviour). |
| P11 | L1 | What `getCountdownVictoryDominanceScore` returns: absolute points needed (second place × multiple), and −1 before mid-Exploration? | Game 6 UI.log `victory races:` lines (they print `points/goal`); compare with the second place in Player_Stats or the victories screen. | Confirms the §3.4 maths; root gotcha 31. |

### Answers from game 6's logs (2026-10-14; evidence in the scratchpad report probes-game6.md)
| # | Answer | What changed |
|---|---|---|
| P2 | Фучжоу (39,33) was founded 4 and 5 tiles from two camps that were our own Antiquity city-states respawned at Exploration 1, at peace with us (we had been their suzerain). Not fog, not a stale goal, not a missed type: `angersVillage` exempts FRIENDLY villages from the 6-tile rule. The founding brought «At War, Surprise» from both; the town fell on E22. | M6 F2: apply the 6-tile rule to friendly villages too (the founding diagnostic now logs each nearby village's relationship). |
| P6 | Gold carries over in full (negative too). Every player has exactly 1 city on a new age's turn 1; the legacy card «All your cities … remain cities» restores them on turn 2. | Root gotcha 31; no conversion in a non-final age's last 10 turns (`LATE_CONVERSION_TURNS`); the Launch Pad bank may start in late Exploration (L3 earlier start, later). |
| P9 | A real choice: Antiquity crisis A49 3 cards for 1 slot, A56 5 for 1, A63 4 for 2 → «Дань» (−11.5) took the gold income from +12 to −13 while a combat card (−6 strength against independents, no attacks then) cost nothing. Unknown values (combat cards) sort below every known penalty. | M7 I1: value unknown crisis cards with `xpl-effect-value.js` or as 0 for non-yield effects; log the offered cards with values. |
| P11 | The goal is ⌊multiple × second place among all majors⌋, ≤ 0 until Exploration 50% (E35), then 6× → 4× (E 80%) → 3× (M 20%) → 2× (M 40%) → 1.5× (M 60%). | Root gotcha 32; confirms §3.4's maths. |

## 3. Design: the strategy layer (A1–A3, L1, L3, L5)

### 3.1 Module and facts
- **New pure module `core/xpl-strategy.js`:**
  - `PHASES`, `phaseOf(facts, previous)`;
  - `STRATEGY` (the table in §3.3), `planStrategy(facts, focus, { previous, watch })`;
  - `applyStrategy(settings, plan)`, `strategyLines(plan)` (tooltip keys and args);
  - `conversionRule(facts, focus, phase)` (decision 3: by yields, no fixed target);
  - `dominanceMultiple(age, ageFrac)`, a fallback only.
- **`victoryWatch` goes in `core/xpl-victory-focus.js`,** next to `scoreFocus`.
- **New engine adapter `steps.strategyFacts(focus)` in `data/xpl-autopilot-steps.js`.** It returns:

  | Fact | Source |
  |---|---|
  | `age` | `currentAge()` |
  | `ageFrac` | AgeProgressManager current ÷ max points |
  | `finalAge` | `isFinalAge` |
  | `turnsLeft` | `ageOutlook()` from `data/xpl-town-job.js` |
  | `ageEnding` | `ageCountdownStarted` and `turnsLeft ≤ 3` |
  | `settlements`, `cap`, `cities`, `towns` | `player.Stats` |
  | `gate {open, progress, goal}` | new `steps.gateState(focus)` (below) |
  | `income`, `gold` | `goldIncome()`, `goldBalance()` |
  | `threatened` | `threats.length > 0` |

- **`gateState(focus)` reuses the `treeFacts()` and `researchGate` machinery.**
  - The way = the gate node plus its prerequisite closure.
  - `progress` = researched nodes on the way ÷ all nodes on the way.
  - For science in Modern the gate is Rocketry (`BUILDING_LAUNCH_PAD`).

### 3.2 Phases (A1, L5)

`phaseOf` returns null when there is no focus. Otherwise:

| Phase | When |
|---|---|
| **COMMIT** | `finalAge` |
| **GROWTH** | Antiquity with `ageFrac < 0.25` (L5: commit about 25% into Antiquity) or `settlements < cap − 1`; or Exploration with `ageFrac < 0.15` and (`settlements < cap − 1` or `towns > cities + 1`), the re-expansion and re-conversion at the age start |
| **BUILD** | everything else |

- **Forward-only within an age:** `previous = {phase, age}` from `state.autopilot.strategy`. A lost settlement does not send BUILD back to GROWTH. A new age starts from scratch.
- **The gate does not change the phase** (science's gate lies in the final age anyway). It changes what COMMIT saves for: a bank before Rocketry, purchases after it (§4.5).

### 3.3 The profile per focus × phase (A2)

S = settlements. "Free gold" is defined in §4.1.

| Lever | GROWTH (any focus) | Science BUILD | Science COMMIT | Economic BUILD | Economic COMMIT | Culture BUILD | Culture COMMIT |
|---|---|---|---|---|---|---|---|
| Priority profile | **GROWTH** (decision 7: food + production first, so towns and cities grow from the start and later build science buildings faster) | SCIENCE | SCIENCE | GOLD_SCIENCE / GOLD (`profileForFocus`) | GOLD | CULTURE | CULTURE |
| `reserveTurns` (replaces the user's) | 1 | 2 | 1 | 2 | 1 | 2 | 1 |
| Savings goals, in order (§4.3) | CONVERT → LEVER | CONVERT → CODEX → LEVER | before Rocketry: CONVERT (until cities ≥ pads) → PADS bank; after: PADS → CONVERT → AIRFIELD → LEVER | CONVERT → LEVER | LEVER (towns first) → CONVERT | CONVERT | – |
| Conversions (decision 3: no fixed target, by yields) | while towns outnumber cities: the best CONVERT or CONSIDER town is a goal; beyond 1:1: only towns the Towns tab rates CONVERT | same | same, plus a town that would hold a Launch Pad (production land) while cities < pads | same | same | same, ranked by culture potential | same |
| Towns' share of free gold for plan purchases (0 while a goal waits) | 0.5 | 0.25 | 0 | 0.5 | 0.5 | 0.5 | 0.5 |
| Plan purchases | all | all | cities only, Launch Pad cities first | all | all | all | all |
| Wonders at once / which | 1; science only Innovation wonders; none while expanding (D4) | 1, Innovation only | 1, Innovation only, never in a Launch Pad city | 1, any | 1, any | 2, any | 3, any |
| Units ahead of a wonder in production | yes | defenders under threat only | defenders only | defenders only | defenders only | defenders only | defenders only |
| Explorers (artifacts) | culture only | no | no | no | no | yes | yes |
| Train settlers | yes | yes | **no** | yes | no | yes | no |
| Unit upgrades | any | near threats only | near threats only | near threats only | near threats only | near threats only | near threats only |
| Advisor's soldiers, military buildings (in peace) | yes (≤ 2 per settlement) | no | no | no | no | yes | yes |
| Town Focus bias (weighted value added) | FARM +2 | URBAN +6 (only where Urban Center unlocks a science purchase), FARM +2 | URBAN +6, FARM +3 | TRADE +3, MINE +2 | TRADE +3, MINE +2 | RESORT +3, RELIGIOUS +2, URBAN +2 | RESORT +4 |
| Launch Pads wanted | – | – | min(5, max(3, cities)) (replaces `SCIENCE_SITES` 3) | – | – | – | – |

Notes:
- **Upgrades:** in every phase, none while `ageEnding` (E4).
- **Profile change (decision 7):** GROWTH uses a new internal profile `GROWTH` in `core/xpl-profiles.js`: Food 1.0, Production 0.8, Happiness 0.6, Gold 0.5, the focus's yield 0.5, the rest 0.3 (tune in tests).
  - It drives plan placement, growth tiles, purchases and the advisor's preference in that phase.
  - BUILD and COMMIT use the focus's profile as today.
  - In GROWTH the town Focus favours FARM (food to connected cities) for towns connected to a city; others keep growing.
- **Without a strategy** (focus off, or the new «Стратегия по фазам» unticked), the pass behaves as today, plus M1's gold rules:
  - B2 and B3 always;
  - B1's CONVERT goal while towns outnumber cities;
  - B4's 0.5 share for towns.

### 3.4 Victory blocking watch (L1)

**Data (`data/xpl-victory.js` `victoryRaces`):**
- Each race gets `board: [{id, points, dominant, turns, met}]` for every alive major, sorted by points. This is the victories screen's leaderboard (`victories-screen-model.js calcVictoryLeaderboard`).
- Military races are included (`cls "MILITARY"`) with `focusable: FOCUS_CLASSES.includes(cls)`.
- The focus code keeps only focusable races, so the existing tab line does not change.

**Pure `victoryWatch(races, me, { age, ageFrac })`.** For each enabled `COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION` race whose leader is not us:
- `goal G` is the game's dominance score. If `G ≤ 0` (not yet active), estimate it as `second × dominanceMultiple(age, ageFrac)` from the official table:

  | Age progress | Multiple |
  |---|---|
  | Exploration 50–80% | 6× |
  | Exploration 80% to Modern 20% | 4× |
  | Modern 20–40% | 3× |
  | Modern 40–60% | 2× |
  | Modern 60–80% | 1.5× |
  | Modern 80–100% | 1.25× |

  Before Exploration 50% there is no level, only an informational leader ÷ second ratio.
- `share = leader.points / G`.
- `m = G / second.points` (only when second > 0; else the table's value).
- `need = ⌈leader.points × BLOCK_MARGIN / m⌉` with `BLOCK_MARGIN = 1.15`. This is the score we must hold, as second place or above it, so the leader stands at no more than 87% of its goal.
- `level`: `DANGER` if `share ≥ 0.85` or the leader's countdown runs (`board[0].dominant`); `WATCH` if `share ≥ 0.6`; else none.
- Returns `[{cls, leader, points, goal, share, multiple, ours, need, level}]`.

**What the autopilot does.** On DANGER for a class other than our focus, `planStrategy` adds an overlay on top of the profile:

| Rival near a … win | Overlay |
|---|---|
| Culture (Tourism) | wonders +1 at once; any wonder whose race is HIGH or MEDIUM, with `WONDER_LEGACY_VALUE × 2` in the score (each one built is also denied to them); explorers on (Modern artifacts, 5 each); town Focus RESORT +4; no Future Tech |
| Economic (GDP) | goal GDP after the focus's own goals: this age's Gold-tagged buildings in cities (TypeTags `GOLD`: Market, Bank, Stock Exchange…, which give GDP every turn); merchants when «Торговцы» is on; resources are assigned already; no Future Tech |
| Military (Dominion) | settlers trained up to the cap even in COMMIT (4 points each); no Future Tech |

- **Future Tech in danger:** while any watch is in DANGER, `pickBonusResearch` skips repeatable Future Techs. They advance the age, which lowers every rival's multiple (research/20 §0).
- **WATCH level:** tab line only.

### 3.5 Applying it without touching the user's settings

In `hud/xpl-autopilot.js runTurn`:
1. `updateFocus` stores `focus.races` as today, plus `focus.watch = victoryWatch(…)`.
2. Then:
   ```
   const plan = o.focus && o.strategy !== false && focus
       ? planStrategy(steps.strategyFacts(focus), focus, { previous: ap().strategy, watch: ap().focus?.watch ?? [] }) : null;
   s = applyStrategy(s, plan);   // pure; returns a new object; settings.get() is never patched
   const o = s.autopilot;        // every later read of reserveTurns/maxWonders uses this
   ```
3. **`applyStrategy` rules:**
   - Numbers (`reserveTurns`, `maxWonders`) are replaced.
   - Permissions are AND-ed. The strategy may narrow what the user allowed, never widen it:
     - `explorers = o.explore && plan.explorers` (scouts still follow `explore`);
     - `trainSettlers = o.settlers && plan.trainSettlers` (unit orders for existing settlers still follow `o.settlers`, so a settler on its site still founds).
   - New internal knobs are added under `s.strategy`: `goals, conversions ("YIELDS"), townShare, planBuys, wonders, padCitiesNoWonders, unitsAheadOfWonders, upgrades, advisorSoldiers, militaryBuildings, townFocusBias, pads`. Without a plan, defaults reproduce today's behaviour.
4. **`wondersAtOnce`** (+1 for culture) is used only when there is no plan.
5. **New setting `autopilot.strategy: true`** («Стратегия по фазам»):
   - `DEFAULT_SETTINGS`, the `sanitize` boolean list, `CHECKS` in `panel/xpl-tab-autopilot.js`, a checkbox in `panel/xpl-panel.html`;
   - strings `LOC_XPL_AP_STRATEGY` and `_TT`.

### 3.6 Tab and logs (A3)
- **`state.autopilot.strategy` = `{phase, age, focus, levers, watch, warned}`.**
- **`renderFocus` adds lines:**
  - «Стратегия: Подготовка → Наука» (`LOC_XPL_AP_STRATEGY_NOW`, phases `LOC_XPL_AP_PHASE_GROWTH|BUILD|COMMIT` = «Рост» / «Подготовка» / «Рывок к победе»), with a `data-tooltip-content` built from `strategyLines(plan)`. Tooltip keys `LOC_XPL_AP_STRATEGY_TT_RESERVE {1}`, `_WONDERS {1}`, `_WONDERS_INNOVATION {1}`, `_NO_EXPLORERS`, `_NO_SETTLERS`, `_UPGRADES_THREAT`, `_PEACE_ARMY`, `_TOWN_FOCUS {1}`, `_CITY_TARGET {1}`, `_PADS {1}`, joined with `[N]`.
  - One line per watch entry: «Тубман близка к победе (культура): 1400 из 1552 (×4); нам нужно 403» (`LOC_XPL_AP_WATCH`).
  - The «Запас золота» dropdown keeps the user's value; its tooltip says the strategy's value is shown in the strategy line.
- **Log entries:**
  - `PHASE` («Стратегия: {1} → {2}»), when the phase changes;
  - `RIVAL_NEAR_WIN` (once per class and leader on entering DANGER);
  - `RIVAL_COUNTDOWN` (once when a rival's countdown starts).
- **UI.log, once a turn:** `strategy: phase BUILD focus SCIENCE (EX 34%, settlements 6/7, cities 3, towns 3, gate no 0.4); levers {…}; watch [CULTURE p5 1400/1552 ×4 need 403 DANGER]`.

## 4. Design: the gold plan (B1–B4, C1, L3, L4)

### 4.1 One pass budget (`core/xpl-savings.js`, pure)

`createBudget({ gold, reserve })` returns an object with:

| Method | Meaning |
|---|---|
| `all()` | `gold − spent` (repairs, walls and defenders under threat: they cannot wait) |
| `forGoal()` | `gold − spent − reserve` (the goal's own purchase) |
| `free()` | `max(0, gold − spent − reserve − held)`, where `held = goal && !goal.done ? goal.hold : 0` (everything else) |
| `townLeft(share)` | while a goal waits 0; else `share × free at pass start − spent in towns` |
| `setGoal({kind, label, cost, hold, key})` | `hold` = `cost`, or the ramped bank (§4.5) |
| `spend(cost, entry, { goal, town })` | marks the goal done when it buys the goal; records `{key, cost}` |
| `bought` | Set of `"sid|type"` (replaces today's `purchases.bought`) |

The object keeps the old fields `bought` and `spent`, so `buyBuildings(settings, 0, {bought, spent})` callers and existing tests still work.

`chooseGoal(candidatesByKind, order)` returns the first kind in `order` that has a candidate. Candidates come only from what the game would sell now (`canStart PURCHASE` Success or InsufficientFunds), except the bank.

### 4.2 Where it happens in `runTurn`

New order. Steps marked * spend gold.
1. Focus, strategy (§3.5), threats, befriending, diplomacy, sites, strikes, units, borders, tacks, research, choices. No gold.
2. **`const pass = steps.goldPlan(s, threats)`** gives `{ budget, queued: new Map(), townRows }`:
   - `reserve = goldReserve(o.reserveTurns)` (the deficit rule and the 1000 cap stay);
   - it computes the goal candidates (§4.3), calls `budget.setGoal`, and keeps the town advisor's rows for the pass (`runTownAdvisor` ran up to four times a pass).
3. *Repairs `repairBuildings({…, budget})`: `all()`. Today each repair checks `cost <= goldBalance()`, so two repairs could both "fit" the same gold.
4. *Walls under threat `fortifyThreatened(threats, {budget, pool: "all"})`.
5. *Fort Town walls `fortifyThreatened(exposedFortTowns(), {budget, pool: "free"})`.
6. *Defenders `buyDefenders(threats, {budget})`: threatened from `all()`, exposed garrisons from `free()`.
7. Production `pushVictoryWork(focus, {…, pass})`, `chooseWonders`, `fillProduction(…, {…, pass})`, `frontLoadUnits`. No gold; `pass.queued` is H2's record.
8. Growth; town Focus; `considerTownProjects`.
9. *`convertTowns(s, pass)`: from `forGoal()` when CONVERT is the goal, else `free()`.
10. Resources.
11. *`buyVictoryWork(focus, pass)`: the goal's item from `forGoal()`, others from `free()`; in COMMIT, Launch Pads are not limited by `MAX_PURCHASES`.
12. *`buyBuildings(s, pass)`: `free()`; town picks also `≤ townLeft(strategy.townShare)`; skips `budget.bought`; `planBuys: "CITIES"` skips towns.
13. *`upgradeUnits(budget, threats, {mode, ageEnding})`: `free()`.
14. `steps.logGold(pass)`: the UI.log line and `state.autopilot.gold` (§4.6).

### 4.3 Goals and their candidates

| Kind | Candidate (data adapter in steps) | Cost and hold |
|---|---|---|
| CONVERT | `conversionCandidates(s, rows)`. Decision 3: while towns outnumber cities, the best CONVERT or CONSIDER town; at 1:1 or more cities, only CONVERT-verdict towns (the Towns tab's yield verdict: production potential, adjacency, cost vs the age's pace). Always `canConvert` and `calmEnough`. With P6 confirming cities revert at an age change: not in a non-final age's last 10 turns. Ranked by C1. | `getTownUpgradeCost()` (the game's; research/20's formula 400 + 300 × cities − 50 × pop, 200–1000, is for the tab only) |
| CODEX (D6) | Codices in the archive (`getNumWorksInArchive`, type `GREATWORKOBJECT_WRITING`) after `slotGreatWorks` found no slot: the cheapest buyable Library or Academy in a city without one, or a Library in an Urban Center town (P3) | its purchase cost |
| LEVER | The first unaffordable item of `victoryPurchases(focus, plan)`, the ordering refactored out of `buyVictoryWork` (science sites queued, levers, missing sites; towns first) | its purchase cost |
| PADS (L3) | Science COMMIT: Launch Pads missing up to `pads` | before the gate: the bank (§4.5); after: the next pad's price |
| AIRFIELD (D5) | Science COMMIT, Trans-Oceanic Flight or Break the Sound Barrier unlocked, no Airfield: in the Launch Pad city with the best production | its cost |
| GDP | Economic danger overlay (§3.4) | cost |

The goal key, label and cost go in `state.autopilot.gold.goal`. Log `SAVING` («Копим на {1}: {2}[icon:YIELD_GOLD], есть {3}») only when the goal's key changes. Goal labels: `LOC_XPL_AP_GOAL_CONVERT {1_Town}`, `_CODEX {1_Building} {2}`, `_LEVER {1_Building} {2}`, `_PADS {1_Num}`, `_AIRFIELD {1}`, `_GDP {1}`.

### 4.4 C1 and L4 (conversion order and city target)

- **Order:** `plannedRoleAt === "CITY"` first, then the verdict (CONVERT, CONSIDER, WAIT, KEEP), then:
  - science and economy: `prodPot` descending (production land converts; research/20 §2), ties by cost;
  - culture and no focus: cost ascending (today's order).
- **No fixed city target (decision 3):** `convertTowns`' `if (towns <= cities) return []` becomes the conversion rule in §4.3: 1:1 is the floor we push toward, and beyond it the yields decide (CONVERT verdict only).
- **Settler roles:** `neededRole()` keeps 1:1 as its default ask, but a site whose city score clearly beats its town score (`scoreSiteRoles`, setting `siteRoles` BOTH) is founded for a city even past 1:1.

### 4.5 The Launch Pad bank (L3, D8)
- **Target:** the bank = Σ purchase price of the missing pads, cheapest buyable city first.
  - Prices from `getBuildingPurchaseCost(YIELD_GOLD, BUILDING_LAUNCH_PAD)` per candidate city (P7), else `Cost × productionToGoldRatio`.
  - Wanted pads = `plan.pads` − pads standing or queued with progress.
- **Before Rocketry:** `hold = bank × gate.progress`. The ramp lets Schoolhouses and Laboratories early in Modern (they bring Rocketry sooner) and holds about the whole bank as Rocketry nears.
- **After Rocketry:** `buyVictoryWork` buys every missing pad the budget allows in the same pass (no `MAX_PURCHASES` limit for science sites in COMMIT). `pushVictoryWork` then queues Crewed Space Flight Preparation in each (it already does in every city with a pad: D8).
- **Earlier start:** if P6 shows gold carries into Modern, the bank may start in Exploration BUILD at ≥ 80% (a later change).

### 4.6 Logging (B3)
- **`state.autopilot.gold` =** `{turn, balance, income, reserve, reserveTurns, goal: {kind, label, cost, held}, spent, bought: [{key, cost}], cheapestConversion: {name, cost}}`.
- **Tab line** (new `.xpl-ap-gold` element in `panel/xpl-panel.html`, shown with the focus off too): «Золото: 1240, запас 100; копим на: преобразование Пеллы — 500» (`LOC_XPL_AP_GOLD_LINE`, `LOC_XPL_AP_GOLD_NO_GOAL`).
- **UI.log once a turn:** `gold: T45 balance 1240 income 50 reserve 100 (2t) goal CONVERT Pella 500 held 500; spent 380 [REPAIR Harbor 120, BOUGHT Granary 260]; cheapest conversion Pella 500`.

## 5. Milestones and items

The item format is **Files / Rule / Test / Revert / Strings / TESTING / Docs**. Tests named `"…"` are new.

---

### M1. Gold plan and conversions (B1–B4, C1, L4) + diagnostics

**Shared work:**
- New `core/xpl-savings.js` (§4.1) and `tests/savings.test.mjs` (pure: pools, hold, goal choice, `townLeft`).
- `steps.goldPlan`, `steps.logGold`, `conversionCandidates`, `victoryPurchases`.
- `runTurn` reordered as in §4.2.
- `buyDefenders` loses its local `gold` and uses the budget.

**B2. Every spend in the pass is counted.**
- **Files:** `data/xpl-autopilot-steps.js` (`repairBuildings`, `fortifyThreatened`, `buyDefenders`, `convertTowns`, `buyVictoryWork`, `buyBuildings`), `data/xpl-autopilot-units.js` (`upgradeUnits`).
- **Rule:** every purchase checks its pool and calls `budget.spend`.
- **Tests (new `tests/autopilot-gold.test.mjs`).** World: Antiquity; cities Athens and Sparta; towns Pella (cost 500, prod 4) and Thebes (cost 400, prod 2); `goldIncome: 0`; `canBuy` 250; a small plan as in `tests/autopilot.test.mjs`.
  - "a conversion and a building are never paid from the same gold (seen in game 6: a conversion and a Granary in one pass, the Granary refused)": gold 600, `runTurn(true)` → exactly one PURCHASE, the town upgrade.
  - "two repairs that each fit the gold are not both bought": gold 300, two damaged buildings at 200 → one REPAIR_BOUGHT, one REPAIR_QUEUED.
- **Revert:**
  - `buyBuildings` budget back to `goldBalance() - purchases.spent - goldReserve(...)` with `convertTowns` not calling `budget.spend`;
  - `repairBuildings` back to `cost <= goldBalance()`.
- **TESTING #171:** "A conversion and a purchase in one pass: never both from the same gold (UI.log `gold:` spent list)."

**B1. Save for the most important goal before small purchases.**
- **Files:** `steps.goldPlan`, `chooseGoal`.
- **Rule:** §4.3; without a strategy the order is [CONVERT, LEVER when the focus is on].
- **Tests:**
  - "below the conversion's cost nothing else is bought, then the town is converted": gold 400 → no PURCHASE, `state.autopilot.gold.goal.kind === "CONVERT"`, log SAVING; gold 550 → TOWN_CONVERTED.
  - "a goal the game refuses is skipped (no conversion offered): plan purchases go on": `world.canConvert = false`.
- **Revert:** `free()` without `held`; the Granary is then bought at 400.
- **Strings:** `SAVING`, `GOAL_*`.
- **TESTING #170:** "Towns outnumber cities, not enough gold: «Копим на: преобразование …»; no town warehouses bought until it is converted."

**B3. A gold line once a turn, and in the tab.**
- **Files:** `steps.logGold`, `panel/xpl-tab-autopilot.js render`, `panel/xpl-panel.html` (`.xpl-ap-gold`).
- **Test:** "the pass keeps the gold plan for the tab: balance, reserve, goal, what was spent", checking `state.autopilot.gold` after `runTurn`.
- **Revert:** do not set `state.autopilot.gold`.
- **Strings:** `GOLD_LINE`, `GOLD_NO_GOAL`.
- **TESTING #173.**

**B4. Town warehouses take only a share.**
- **Files:** `buyBuildings` (towns limited by `budget.townLeft(share)`; `purchaseAdvice` picks carry `town`).
- **Test:** "without a goal, towns' purchases take at most half the free gold; while a goal waits, none": free 1000; two town picks at 300 and a city pick at 300 → one town and the city; then with a goal pending → no town pick.
- **Revert:** drop the `townLeft` check.
- **TESTING #172.**

**C1. Conversions rank by what a city adds.**
- **Files:** `conversionCandidates` (§4.4).
- **Test (`tests/autopilot-gold.test.mjs`):** "science: the town with the most production becomes the city, not the cheapest": two CONSIDER towns, A cost 300 with prodPot 5, B cost 400 with prodPot 15, gold 450 → B.
- **Revert:** sort back to `a.town.cost - b.town.cost`.
- **TESTING #174** (with L4).

**L4. Conversions by yields, 1:1 as a floor (decision 3).**
- **Files:** `conversionRule` (in core; M1 ships it in `core/xpl-savings.js`, M2 moves it to `xpl-strategy.js`), `convertTowns`, `conversionCandidates`.
- **Tests:**
  - "past 1:1 a town rated CONVERT still becomes a city": 3 cities, 2 towns, one CONVERT and one KEEP, gold 2000 → the CONVERT town is converted, never the KEEP one.
  - "below 1:1 a CONSIDER town is enough".
- **Revert:** the old `towns <= cities` test (the first test then converts nothing).
- **Docs:** mod/CLAUDE.md "Cities and towns 1 to 1" becomes "1:1 as a floor, then by yields".

**Diagnostics shipped with M1 (log only, no tests):**
- F1 (P1): log every `SimulateCombatResult` arrival with ms and token match; `SIMULATE_WAIT_MS` 600 → 2000 once.
- F2 (P2): `villages N` in the `sites:` line (`data/xpl-site-job.js:204`) and the nearest village at each `SETTLE_FOUND`.
- C2 (P3): Urban Center towns' purchase answers.

**Docs:**
- root CLAUDE.md gotcha 30: "The treasury does not change during a pass: every purchase step reads the same balance. Count every spend in the pass budget (game 6: a conversion and a Granary in one pass; two repairs on the same gold)."
- mod/CLAUDE.md: new "Gold plan" bullet in the Autopilot section, replacing the reserve sentences there.
- tests/CLAUDE.md: the budget argument shape.

**Watch in the next game:**
- «Копим на …» in the tab; TOWN_CONVERTED early in Antiquity (200–600);
- far fewer town BOUGHT entries;
- UI.log `gold:` lines;
- Player_Treasury.csv climbing to the goal, then dropping;
- 2–4 cities by the end of Antiquity.

**Risk:** a stuck goal (`canStart` says yes but the game refuses) starves purchases. If the same goal is refused 3 turns in a row, drop it for 5 turns (`goal.failedTurns`). Tests: one per item.

**Size:** L.

---

### M2. Strategy phases (A1–A3, L5, L3, D8, E2, E3, E4, C3 in the final age)

**A1/A2/L5. `core/xpl-strategy.js`, `steps.strategyFacts`, `steps.gateState`, `runTurn` (§3.5).**
- **Tests (new `tests/strategy.test.mjs`, pure):**
  - "phases: Antiquity before 25% or below cap−1 Growth; then Build; Exploration's start Growth while towns outnumber cities; the final age Commit": table-driven facts.
  - "phases never go back within an age (a lost settlement keeps Build)". **Revert:** ignore `previous`.
  - "profiles: science Commit keeps 1 turn of income, Innovation wonders only, no settlers trained, 4–5 Launch Pads": key fields of `planStrategy`. **Revert:** a changed table value, e.g. science COMMIT `trainSettlers: true`.
  - "applyStrategy narrows the user's options, never widens them, and never changes the settings object": `explore: false` plus a plan with explorers stays false; the input is deep-equal after; `Object.freeze` input. **Revert:** `explorers = plan.explorers`.
- **Pass test (`tests/autopilot.test.mjs`):** "the pass follows the strategy (reserve 1 turn in Commit) while the saved settings stay the user's": `settings.get().autopilot.reserveTurns` still 2 after `runTurn`; with `world.finalAge = true`, the budget's reserve is 1 × income. **Revert:** use `settings.get()` instead of the effective copy in `goldPlan`.
- **Fake engine:** `world.finalAge` → `AgeProgressManager.isFinalAge`; `world.ageCountdown` → `ageCountdownStarted`.
- **Strings:** `STRATEGY`, `STRATEGY_TT`, `STRATEGY_NOW`, `PHASE_*`, `STRATEGY_TT_*`, log `PHASE`.
- **TESTING:**
  - #175: the tab shows «Стратегия: … → …» with the tooltip;
  - #176: a `PHASE` entry at about 25% of Antiquity and at Modern turn 1;
  - #181: «Стратегия по фазам» unticked → the user's own reserve and wonders.

**A3. Tab.** §3.6. Covered by #175.

**E3. Explorers only with the culture focus, no focus, or culture danger.**
- **Files:** `unitsWanted` and `unitWanted` in steps check `unitOptions.explorers`.
- **Test (`tests/autopilot-artifacts.test.mjs`):** "science focus: no explorers trained even with ruins to dig": `unitOptions.explorers === false` → no QUEUED_EXPLORER.
- **Revert:** test `unitOptions.explore` again.
- **TESTING #177** (with E2).

**E2. No military buildings or advisor soldiers in peace (science and economy).**
- **Files:**
  - `unitWanted`: military needs `strategy.advisorSoldiers !== false || threats.length > 0`.
  - `advisorOrder` and `cheapestBuilding`: skip constructibles with TypeTag `MILITARY` (Barracks, Military Academy…) when `militaryBuildings === false` and there is no threat.
  - `fillProduction`'s plan queueing (`queueNextBuildings(…, { skip })` in `data/xpl-city-actions.js`) and `buyBuildings` skip them too.
  - `lastResort` keeps its strongest soldier: an empty queue must not hold the turn.
- **Test (`tests/autopilot-found.test.mjs`):** "science Build in peace: the advisor's soldier and Barracks are skipped; under threat they are allowed".
- **Revert:** drop the `advisorSoldiers` check in `unitWanted`.

**E4. Upgrades only near threats; none at the age's end.**
- **Files:** `upgradeUnits(budget, threats, { mode, ageEnding })`.
- **Test (`tests/autopilot-expand.test.mjs`):** "Build: only the unit near the threatened settlement is upgraded; none in the age's last turns": two units, one within 4 of a threat → one UPGRADED; `world.ageCountdown` with 2 turns left → none.
- **Revert:** the `mode` filter.
- **TESTING #178.**

**C3 (final age). No settlers trained in Commit.**
- **Files:** `unitsWanted` uses `unitOptions.trainSettlers`.
- **Test (`tests/autopilot-expand.test.mjs`):** "Commit: no settler trained; a settler on its site still founds".
- **Revert:** `trainSettlers` back to `settlers`.
- **TESTING #179.**

**L3 + D8. Launch Pad bank, then every pad bought the turn Rocketry arrives.**
- **Files:** `goldPlan` (PADS), `gateState`, `scienceSites(age, { pads })` in `core/xpl-victory-levers.js` (`cities: pads` for the Launch Pad row), `buyVictoryWork` (no `MAX_PURCHASES` cap for science sites in COMMIT).
- **Tests (`tests/autopilot-levers.test.mjs`, Modern fixture):**
  - "before Rocketry the gold for Launch Pads is held as research nears it": depth set for half of Rocketry's way, 4 pads wanted, price 1000 → hold 2000; gold 2300, income 50 → a 400 plan pick is not bought; gold 2600 → bought. **Revert:** PADS hold 0.
  - "Rocketry in: Launch Pads bought in up to 5 cities in one pass": 5 cities, gold 10000, `canBuy` pad 1500 → 5 VICTORY_BOUGHT. **Revert:** restore the `MAX_PURCHASES` break.
- **Strings:** `GOAL_PADS`.
- **TESTING #180:** "Modern, science: «Копим на: стартовые площадки (4)» grows before Rocketry; on the Rocketry turn 3–5 Launch Pads bought, then Crewed Space Flight Preparation in each."

**Docs:**
- mod/CLAUDE.md: Autopilot section gains "Strategy (phases)", the effective copy, and the table summary (point to research/21 §3.3).
- tests/CLAUDE.md: `world.finalAge`, `world.ageCountdown`.

**Watch in the next game:**
- the phase line changing at about 25% of Antiquity;
- no Antiquarians, Barracks or Tanks in peace;
- no Modern settlers;
- the bank growing through Modern; pads bought together.

**Risk:**
- Phase misreads: the checkbox is the escape.
- The bank starving levers: the ramp, and checking the purchase count in Modern.

**Size:** L.

---

### M3. Research for Innovation (D1, D2, L2)

**D1. Research gates per age, mastery gates included.**
- **Files:**
  - `core/xpl-victory-levers.js`: `RESEARCH_GATES = { SCIENCE: { AGE_ANTIQUITY: ["PROJECT_SPHERICAL_EARTH", "PROJECT_CHART_THE_STARS"], AGE_EXPLORATION: ["PROJECT_INVENT_CALCULUS", "PROJECT_HELIOCENTRIC_MODEL"], AGE_MODERN: ["BUILDING_LAUNCH_PAD"] } }`.
  - New `gateTargets(focus, age)`; `isGateResearch` keeps its role for Modern.
  - `data/xpl-autopilot-steps.js researchGate`: each gate is a `ProgressionTreeNodeUnlocks` row `{node, depth}` (Calculus = Urban Planning depth 2, Heliocentric = Education depth 2, Spherical Earth = Mathematics depth 1, Chart the Stars = Navigation depth 1). It is reached when `depthUnlocked ≥ depth`. The way = the node (its mastery when the node is researched) plus its unresearched prerequisites. The pool = the union of all unreached gates' ways.
  - `treeFacts` gains `depthOf`.
- **Test (`tests/autopilot-paths.test.mjs`, an Exploration engine: new file `tests/autopilot-paths-ex.test.mjs` with `installFakeEngine(world, "exploration")`):** "Exploration science: the Education and Urban Planning masteries (Heliocentric Model, Invent Calculus) come before quicker path research":
  - depth `{NODE_TECH_EX_EDUCATION: 1}`;
  - available: the Education node (mastery, 8 turns) and a quicker wanted node (University unlock, 3 turns);
  - expect the Education node, VICTORY_TECH.
- **Revert:** `RESEARCH_GATES` back to Modern only.
- **Fake engine:** `getTurnsForNode: (n) => world.research?.turns?.[n] ?? 5`.
- **TESTING #182.** Docs: mod/CLAUDE.md "Research gate".

**D2. Innovation civics as soon as they are available.**
- **Files:** `chooseResearch`: for `kind === "culture"` with the science focus, a candidate whose next unlock matches `/_SCIENCE_VP$/` comes before `pickVictoryResearch` (the civic tree does not compete with tech gates).
- **Test (`tests/autopilot-paths.test.mjs`, Antiquity):** "science: Literacy (Innovation) before a quicker path civic": available Foundation (codex civic, 3 turns) and Literacy (6 turns) → Literacy.
- **Revert:** remove the precedence.
- **TESTING #183.**

**L2a. Future Techs every time.**
- **Files:** `researchCandidates`: a node with `Repeatable === "true"` keeps its depth-1 targets (`next = 1`), so `pickBonusResearch` keeps taking it. While the watch is in DANGER it is skipped (M4).
- **Test (`tests/autopilot-paths.test.mjs`):** "Future Tech is taken again after the first": depth `{NODE_TECH_AQ_FUTURE_TECH: 1}`, available, nothing else → VICTORY_TECH.
- **Revert:** `next = depthUnlocked + 1` for repeatables.
- **TESTING #184.**

**L2b. Innovation against the age's target (informational).**
- `INNOVATION_TARGETS = { AGE_ANTIQUITY: 25, AGE_EXPLORATION: 70, AGE_MODERN: 100 }` (research/20).
- Tab line «Инновации: 18 (к концу эпохи ≈ 25)» (`LOC_XPL_AP_INNOVATION_TARGET`) when the focus is SCIENCE.
- **Test (`tests/autopilot.test.mjs`):** state has `innovationTarget`. **Revert:** omit it.
- **TESTING #185.**

**Watch in the next game:** VICTORY_TECH lines toward Calculus and Heliocentric early in Exploration; Social Class and Literacy as soon as offered; Innovation ≥ 25 at the end of Antiquity.

**Risk:** gates delay other research. The pool includes every prerequisite; only the science focus is affected.

**Size:** S–M.

---

### M4. Victory blocking (L1)

**Data.**
- **Files:** `data/xpl-victory.js victoryRaces` (`board`, military, `focusable`); `hud/xpl-autopilot.js updateFocus` (filters focusable for `races`, stores `watch`).
- **Test (`tests/autopilot-victory.test.mjs`):** "victory races carry every major's points (as the victories screen's leaderboard) and the military race": `world.victoryPoints` for 3 players, one not met → `board` has 3 entries, sorted; MILITARY present with `focusable: false`.
- **Revert:** filter rivals by `hasMet` / drop military.
- **Fake engine:** per-player countdowns `world.countdowns?.[VT]?.[pid]`; `Game.VictoryManager.getCountdownVictoryDominanceScore` from `world.dominanceGoal?.[VT]`.

**Pure watch.**
- **Files:** `core/xpl-victory-focus.js victoryWatch`, `dominanceMultiple` (in `xpl-strategy.js`).
- **Tests (`tests/strategy.test.mjs`):**
  - "watch: a culture leader at 90% of the game's dominance score is DANGER; our need = leader × 1.15 ÷ multiple": G 1552, second 388, leader 1400 → `{level: "DANGER", multiple: 4, need: 403}`. **Revert:** `BLOCK_MARGIN = 1`.
  - "watch: no goal yet before mid-Exploration: no level; the table's multiple only as an estimate after 50%": G −1. **Revert:** use the table before 50%.

**Overlay and logs.**
- **Files:** `planStrategy` (overlay table §3.4); `pickBonusResearch` skip; `chooseWonders` `wonders` rule; `unitsWanted` explorers; town Focus bias.
- **Tests:**
  - `tests/strategy.test.mjs` "a rival near a culture win: one more wonder, any kind, and explorers allowed in a science game". **Revert:** the overlay off.
  - `tests/autopilot.test.mjs` "RIVAL_NEAR_WIN is logged once per rival and class". **Revert:** drop the `warned` check.
  - `tests/autopilot-paths.test.mjs` "no Future Tech while a rival is near a dominance win". **Revert:** drop the skip.
- **Strings:** `WATCH`, `RIVAL_NEAR_WIN` («{1} близок к победе ({2}): {3} из {4}; нам нужно {5}»), `RIVAL_COUNTDOWN`.
- **TESTING:**
  - #186: the watch line in the tab;
  - #187: in danger, a non-Innovation wonder started in a science game, explorers trained in Modern, the RIVAL_NEAR_WIN entry.

**Docs:**
- root CLAUDE.md gotcha 31 (after P11): what `getCountdownVictoryDominanceScore` returns and that it is −1 before the race opens.
- mod/CLAUDE.md "Victory watch".

**Watch in the next game:** the watch line from mid-Exploration; whether America-style culture leaders get to DANGER; the share falling after our wonders.

**Risk:** P11 semantics (the fallback table covers the maths).
- **Decision 6:** the overlay acts only for a victory that is switched on in this game. `victoryRaces` keeps only enabled races (`isCountdownVictoryEnabled`), so a culture overlay never runs when the culture victory is off. Add an assertion for it to the M4 tests: "culture victory off: no overlay even with a rival at 95%".

**Size:** M.

---

### M5. One-off Innovation sources and production discipline (D3–D7, E1, C2, H2, L7)

**D3. A one-off project goes where it finishes soonest.**
- **Files:** `pushVictoryWork` one-offs: for each city that may start it, finish = `(frontSlot(c) ? currentTurnsLeft : 0) + projectCost / production` (`city.Production.getProjectProductionCost`). Take the minimum. Never ahead of an item with progress until P4 says projects do not take progress.
- **Test (`tests/autopilot-queue.test.mjs`):** "a science project goes to the city that finishes it soonest, not behind a building with 8 turns left in the best city": Paris prod 30 with a Market at 50% and 8 turns; Lyon prod 20 empty; cost 200 → Lyon.
- **Revert:** the best-producing order.
- **Fake engine:** `Production.getProjectProductionCost: (t) => world.costOf?.(t) ?? 100`.
- **TESTING #188.**

**D4. "Expansion first" holds wonders only, and only while expansion is real.**
- **Files:**
  - `expandingFirst(settlersOn)`: also requires a settler in flight with a goal (`settlerGoals().length`) or wanted with sites known (`state.results.sites?.picks?.length > 0`).
  - `pushVictoryWork`: remove `if (expandingFirst(settlers)) return out;`. Settlers already go ahead of projects (`unitSlot`).
- **Test:** update `tests/autopilot-wonders.test.mjs` "expansion first…" to "expansion first: no new wonder while a settler walks or is wanted with sites; science projects are queued anyway; no site known: wonders allowed". Spherical Earth and Chart the Stars are queued with settlers on.
- **Revert:** restore the early return.
- **TESTING:** row #165 rewritten; #189.

**D5. Modern sites timing.**
- **Files:**
  - `SCIENCE_SITES` Airfield row gains `needs: ["PROJECT_TRANS_OCEANIC_FLIGHT", "PROJECT_BREAK_SOUND_BARRIER"]`; `pushVictoryWork` and `victoryPurchases` place it only when one of those unlocks is reached (`unlockReached(type)`: its row's `UnlockDepth ≤ depthUnlocked`).
  - `chooseWonders(…, { excludeCities })` gets the Launch Pad cities (standing, queued, or among the `pads` best producers) when `padCitiesNoWonders`.
- **Tests (`tests/autopilot-levers.test.mjs`):**
  - "the Airfield only once Flight's mastery opens Trans-Oceanic Flight": Flight depth 1 → no Airfield; depth 2 → queued. **Revert:** drop `needs`.
  - `tests/autopilot-wonders.test.mjs` (Modern rows faked) "Commit: no wonder in a Launch Pad city". **Revert:** drop `excludeCities`.
- **TESTING #190.**

**D6. Codices waiting: save for a codex slot.**
- **Files:** `goldPlan` CODEX goal (§4.3), after `slotGreatWorks`, which reports `left: n` (new return field).
- **Test (`tests/autopilot-gold.test.mjs`):** "a codex in the archive with every slot full: the Academy is saved for, the plan's Granary waits": gold 250, Academy 300 buyable → nothing bought; gold 320 → VICTORY_BOUGHT Academy.
- **Revert:** CODEX left out of the goal order.
- **TESTING #191.**

**D7. Innovation wonders.**
- **Files:**
  - `steps.innovationWonders()` = `GameInfo.ConstructibleModifiers.filter(r => /_SCIENCE_VP$/.test(r.ModifierId))` → constructible types of class WONDER (game data: `MOD_GREAT_LIBRARY_SCIENCE_VP`, `MOD_NALANDA_SCIENCE_VP`…).
  - `chooseWonders`: with `wonders: "INNOVATION"` only those; with the science focus otherwise, `+INNOVATION_WONDER_VALUE` (3 points × 4 = 12, like `WONDER_LEGACY_VALUE`) in the score.
- **Fixture:** add `"ConstructibleModifiers"` to `TABLES` in `tools/extract-fixtures.py` and re-extract the three ages.
- **Test (`tests/autopilot-wonders.test.mjs`):** "science: the Great Library is chosen over a quicker Pyramids".
- **Revert:** drop the filter and bonus.
- **TESTING #192.** Docs: tests/CLAUDE.md fixture tables.

**E1. Wonders are not overtaken.**
- **Files:**
  - `unitSlot(city)` returns 0 (ahead of a wonder) only when `strategy.unitsAheadOfWonders` or the unit is a defender for a threatened settlement (`frontLoadUnits` passes the reason).
  - New `leverSlot(city)` for `pushVictoryWork`'s lever moves: also behind a WONDER at the front with 0% (Oxford never started because levers were moved ahead each pass). Science sites and projects keep `frontSlot`.
- **Tests (`tests/autopilot-queue.test.mjs`):**
  - "Build: a settler waits behind a wonder in production; a defender under threat still goes ahead". **Revert:** `unitSlot` without the strategy check.
  - "a Library is not moved ahead of a wonder just started". **Revert:** `toFront` with `frontSlot`.
- The existing "a settler goes ahead of a wonder…" test stays: no strategy = today.
- **TESTING #193.**

**C2. Urban Center for science towns; towns buy the science buildings it opens.**
- **Files:**
  - `core/xpl-town-focus.js recommendFocus(t, weights, bias)`: `value += bias[key]`; URBAN is kept even with 0 quarters when `t.urbanBuys > 0`.
  - `data/xpl-town-job.js townFocusFacts` counts `urbanBuys` = buildings tagged `URBANCENTER` and the focus's yield tag (`SCIENCE`) that the town lacks.
  - `runTownAdvisor(settings)` passes `settings.strategy?.townFocusBias`.
  - `victoryPurchases` adds "town levers" (`URBANCENTER` ∩ focus tag: Library, Observatory, Schoolhouse) for Urban Center towns.
  - Never changes a chosen Focus.
- **Tests:**
  - `tests/town-focus.test.mjs` "a science bias picks Urban Center for a town that could buy a Library". **Revert:** bias ignored.
  - `tests/autopilot-levers.test.mjs` (Antiquity) "an Urban Center town buys a Library". **Revert:** town levers off.
- **Note:** the Towns tab shows the autopilot's last biased run (`state.results.towns`); acceptable, and noted in mod/CLAUDE.md.
- **TESTING #194.** Root gotcha 30 or 32 after P3: "A town Focus's purchase list = buildings with that Focus's TypeTag (`URBANCENTER`…, `constructibles-no-persist.xml`)."

**H2. The same BUILD is not sent twice in a pass.**
- **Files:** `pushVictoryWork` records `pass.queued.set(sid, Set(types))`; `fillProduction` treats a city with an entry as not empty (the game's `isEmpty` is stale within the pass).
- **Test (`tests/autopilot-levers.test.mjs`, Antiquity science):** "a Library queued by the victory step is not queued again by the plan in the same pass".
- **Revert:** ignore `pass.queued`.
- **TESTING #195.**

**L7. Tea (low priority).**
- **Context:** game data contradicts the web. In Modern, Tea is a FACTORY resource with +3% Science per slotted Tea, player-wide (`age-modern/data/resources-gameeffects.xml` `MOD_TEA_SCIENCE_YIELD`), not project production. `assignResources` already ranks it first for SCIENCE, but science never builds a Factory.
- **Rule:** with the science focus in Modern and a factory resource tagged `SCIENCE` owned while no settlement has a Factory, a Factory joins the science levers in the best city.
- **Test (`tests/autopilot-levers.test.mjs`):** "science: a Factory for owned Tea". **Revert:** off.
- **TESTING #196.**

**Watch in the next game:**
- Spherical Earth while expanding; Calculus queued where a city is free;
- the Great Library and Nalanda tried; Oxford actually built;
- towns with Urban Center buying Libraries;
- no Airfield waiting idle.

**Risk:** E1 slows levers in wonder cities; D3 queues projects in weaker cities.

**Size:** L.

---

### M6. Bugs that cost turns (H1, C3, F1, F2)

**H1. No front-loading ping-pong.**
- **Files:**
  - `frontLoadUnits`: skip when any item between `to` and `i` is itself a wanted unit;
  - `toFront`: never moves an item ahead of a queued unit (`while (to < i && (repairs.has(types[to]) || isUnitType(types[to]))) to++`).
- **Tests (`tests/autopilot-queue.test.mjs`):**
  - "a wanted settler is not moved ahead of a wanted scout already at the front". **Revert:** the skip.
  - "a lever building is not moved ahead of a queued settler". **Revert:** the `toFront` unit check.
- **TESTING #197.**

**C3a. A settler that wanders gives up.**
- **Files:** `data/xpl-autopilot-units.js settle`. Goals keep `since` (first goal turn, per unit) and `retargets`. After `SETTLER_PATIENCE` 12 turns or 3 retargets, `pickSite(u, taken, ctx, PATH_DANGER, { nearest: true })` takes the safe reachable site with the fewest turns, any role. Log `SETTLER_GIVES_UP`.
- **Test (`tests/autopilot-units.test.mjs`):** "a settler walking for 13 turns takes the nearest safe site" (`Game.turn` advanced).
- **Revert:** the patience check.
- **Strings:** `SETTLER_GIVES_UP`.
- **TESTING #198.**

**C3b. No settler without sites.**
- **Files:**
  - `unitsWanted` settlers only when `state.results.sites?.picks?.length > 0`, or the game's suggestions from the capital are non-empty;
  - `refreshSitesIfDue` also runs when a settler is wanted (today it runs only with one in flight).
- **Test (`tests/autopilot-found.test.mjs`):** "no site known (our search and the game's both empty): no settler trained".
- **Revert:** the site check.
- **TESTING #199.**

**F1. Strikes fire (after P1).**
- **Files:** `simulateAttack` as fixed by P1. Fallback `estimateStrike` in a pure helper (`core/xpl-combat.js` or inside `strikeWorthIt`'s module): strengths from `u.Combat.getMeleeStrength(false)` and the enemy's `Units.get(id).Combat` (else `Unit_Stats`), minus `floor(damage / 10)`; dealt `30·e^{0.04Δ}`, taken `30·e^{−0.04Δ}`, with ±20% spread taken against us. This is the community formula: verify against CombatLog.csv.
- **Test (`tests/autopilot-units.test.mjs`):** "no prediction from the game: a clearly stronger soldier still strikes on the estimate, a weaker one does not" (`world.noPrediction`).
- **Revert:** no fallback.
- **TESTING #200.**

**F2. Founding next to a camp (after P2).**
- **Options by finding:**
  - the camp is unseen: penalise or reject sites with unrevealed tiles within `VILLAGE_ANGER_DISTANCE` (fair: no omniscience);
  - a type `villagesOf` misses: add it;
  - a stale goal: re-check before `FOUND_CITY` with a fresh `villagesOf`.
- **Test:** in `tests/autopilot-units.test.mjs` for the chosen fix. **Revert** per fix.
- **TESTING #201.**

**Watch in the next game:** STRUCK entries; settlers founding within ~10 turns of training; no capital queue flipping between a settler and a scout.

**Size:** M.

---

### M7. Diplomacy, crises, log noise, player hints

**G1. Calls to arms (decision 5, P8).**
- **Rule (no option):** always decline, except when the enemy is far enough **and** on another continent. That means:
  - every enemy settlement is on a continent (`GameplayMap.getContinentType`) where we have no settlement;
  - its nearest settlement is more than `JOIN_WAR_DISTANCE` (10) tiles from ours;
  - nothing of ours is threatened;
  - the game allows a formal war (`canDeclareWarOn(target, WarTypes.FORMAL_WAR).Success`).

  Then join with `DECLARE_WAR {Player1, Player2, Type: DIPLOMACY_ACTION_DECLARE_FORMAL_WAR}` as `diplomacy-manager.js confirmDeclareWar`. Before coding, P8 checks that this clears the call.
- **Test (`tests/autopilot-choices.test.mjs`):** "call to arms: an enemy far away on another continent: joined; on our continent or near: declined" (`world.formalWarOk`, tiles' `continent`).
- **Revert:** always decline.
- **Strings:** `JOINED_WAR`.
- **TESTING #202.**

**G2. Open borders: one request per leader per 10 turns.**
- **Files:** `proposeOpenBorders`: `bordersAsked: Map(leader → turn)`.
- **Test (`tests/autopilot-expand.test.mjs`):** "a refused open borders request waits 10 turns".
- **Revert:** the map check.
- **TESTING #203.**

**G3. An advisor warning is marked seen once.**
- **Files:** `dismissAdvisorWarnings`: a Set of notification ids sent (pruned when the id is gone).
- **Test (`tests/autopilot-choices.test.mjs`):** "two choices passes in a turn mark a warning seen once".
- **Revert:** the Set.
- **TESTING #204.**

**H3. Fewer Detailed Map Tacks while unattended.** With `endTurn` on: 1 plan tack per settlement and settle tacks only where settlers walk.
- **Test (`tests/plan-tacks.test.mjs` or `tests/autopilot.test.mjs`):** with fake DMT, count the tacks.
- **Revert:** the constants.
- **TESTING #205.**

**H4. Documentation only:** root CLAUDE.md game loop: "develop between turns; a reload at a turn start reboots the autopilot" (508 `TRIGGER_ADVISOR_SELECTED`).

**I1 (after P9).**
- If there was a choice: weight crisis cards' Happiness losses by `core/xpl-scarcity.js costMultiplier` per settlement (×2 where they would push it below 0).
- **Test (`tests/autopilot-choices.test.mjs`):** "the crisis card that would make a city unhappy loses to a Gold one of the same Policy Yield Previews value". **Revert:** no scarcity.
- Otherwise documentation only.

**I2:** documentation (P10). The forced −15 Science slot follows every celebration; there is nothing to choose.

**L6 (P5):** no code if the towns step re-applies the Focus; else force `setTownFocus` on the new age's turn 1. TESTING #207.

**L8, J1, J2:** the AGE_OVER and AGE_START entries name the science picks: «+25% к проектам, бесплатная технология Academics; памятная вещь: Memento Advisor» (string-only change of `LOC_XPL_AP_AGE_START` when the focus is SCIENCE; `LOC_XPL_AP_AGE_START_SCIENCE`). Test: the key chosen. TESTING #208.

**L9:** covered by `calmEnough`, I1 and the plan's scarcity. No separate code.

**Size:** M.

## 6. Dependencies, order, risk

- **Dependencies:**
  - M1 comes first: everything that buys depends on the budget.
  - M2 needs M1 (PADS goal, reserve).
  - M4 and M5 (D5, E1, C2, D6) need M2's plan object.
  - M3 and M6 are independent and can run in parallel with M1 and M2.
  - G1 waits for the user's decision and P8.
- **Order of impact for a science win:** M1 → M2 → M3 → M4 → M5 → M6 → M7.
- **Biggest risks:**
  - savings starving purchases (mitigated: goals expire after 3 refusals; the tab and log show the goal);
  - phase misreads (the checkbox);
  - gates over-restricting research;
  - P11 semantics for blocking.
- **Every milestone ends with:** tests, both import checks, syntax and XML checks, TESTING rows, docs, and a note to the user on restart vs live reload (M1 and M2: full restart for new files and strings).

## 7. Docs checklist

- **Root CLAUDE.md:**
  - gotcha 30 (the treasury is static within a pass);
  - 31 (dominance score semantics, after P11);
  - 32 (town Focus purchase tags, after P3);
  - gotcha 20 updated after P4;
  - F1's finding if it is an engine quirk;
  - H4 in the game loop.
- **mod/CLAUDE.md Autopilot section:**
  - new bullets "Strategy (phases)", "Gold plan", "Victory watch";
  - update "Expansion first", "Research gate" (per age, masteries), "Victory levers" (pads count, Airfield needs, Innovation wonders, town levers), unit training (explorers, settlers, soldiers), `frontLoadUnits`/`toFront`/`unitSlot`, upgrades;
  - engine API: `getMaintenanceForAllUnitsOfType`, `canDeclareWarOn`, `getCountdownVictoryDominanceScore`.
- **tests/CLAUDE.md:**
  - world options `finalAge`, `ageCountdown`, `research.turns`, `noPrediction`, `countdowns`, `dominanceGoal`, `formalWarOk`, `Production.getProjectProductionCost`;
  - fixture table `ConstructibleModifiers`;
  - the budget argument.

## 8. Open questions for the user (answered 2026-10-14: see §9)

1. **Strategy checkbox:** «Стратегия по фазам» on by default whenever the victory focus is on?
2. **Savings without the focus:** should the savings rules (save for conversions; towns' warehouses capped at half the spare gold) also apply with the focus off?
3. **City target:** cap 4 / 5 / 5 cities by age (web: 2–5), or keep strict 1:1 cities and towns?
4. **Exploration research gate:** Calculus and Heliocentric masteries before everything else. Delaying University and Shipbuilding is acceptable?
5. **Calls to arms:** keep declining (alliances end; Glass Armonica loses value), or join with a formal war when the game allows it and the enemy is far?
6. **Rival near a culture win:** may a science game build non-Innovation wonders and Antiquarians, and stop taking Future Techs?
7. **Growth phase priority:** your own priority (e.g. Balance) for plan and growth, or the focus's from turn 1 (today)?
8. **Launch Pads:** 4–5 where cities allow, and banking about their price before Rocketry: OK?
9. **Urban Center:** may the autopilot give it to science towns choosing their first Focus? It never switches a chosen one.

### Critical Files for Implementation
- D:\work\ideas\civ7-mods\mod\expansion-planner\ui\hud\xpl-autopilot.js
- D:\work\ideas\civ7-mods\mod\expansion-planner\ui\data\xpl-autopilot-steps.js
- D:\work\ideas\civ7-mods\mod\expansion-planner\ui\core\xpl-victory-levers.js
- D:\work\ideas\civ7-mods\mod\expansion-planner\ui\data\xpl-victory.js
- D:\work\ideas\civ7-mods\tests\fakes\fake-engine.mjs


## 9. Decisions (the user, 2026-10-14)
| # | Question | Decision | Where it changed the plan |
|---|---|---|---|
| 1 | «Стратегия по фазам» on by default with the focus | Yes (default) | §3.5 |
| 2 | Savings rules with the focus off too | Yes (default): CONVERT goal while towns outnumber cities, towns' share 0.5, B2/B3 always | §3.3 notes |
| 3 | City target | **1:1 is not strict: more city centres make sense depending on yields.** No fixed cap. 1:1 is a floor; beyond it only towns the Towns tab rates CONVERT (yields) are converted, and a site that scores clearly better as a city may be founded as one. | §3.3, §4.3, §4.4, L4 |
| 4 | Exploration research gate (Calculus, Heliocentric masteries first) | Yes (default) | M3 D1 |
| 5 | Calls to arms | **Always decline, unless the enemy is far enough and on another continent** (then join with a formal war, if allowed) | M7 G1 |
| 6 | Block a rival's culture win in a science game | **Yes, if the culture victory is switched on in the game** | §3.4 and M4 (enabled races only) |
| 7 | Growth phase priority | **More growth for towns and cities from the start**, to build science buildings faster later: GROWTH uses a growth profile (food + production) | §3.3 |
| 8 | Launch Pads in 4–5 cities with a bank before Rocketry | Yes (default) | M2 L3 |
| 9 | Urban Center for science towns choosing their first Focus | Yes (default), after probe P3 | M5 C2 |
