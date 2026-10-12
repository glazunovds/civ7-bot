# Tests

Use `npm test`, which runs `node --test "tests/**/*.test.mjs"` (Node ≥ 22; no dependencies). Every test file runs in its own process, so each file may install its own fake engine globals once at the top.

## Two kinds of tests
- **Pure core tests** use `fakes/fake-world.mjs`.
  - `FakeWorld(w, h)` builds a hex grid with a mutable TileFacts table: `set(x, y, kind)`, `patch(x, y, {...})`, `disc(x, y, r, kind)`, `ctx(overrides)` for site scoring.
  - Tile kinds: grass, plains, hill, forest, coast, ocean, mountain, navriver.
  - Used with the real rule book: `buildRuleBook(loadGameInfo("antiquity").info, "AGE_ANTIQUITY", isActivated, { traits, uniqueQuarterTypes })`.
- **End-to-end job tests** use `fakes/fake-engine.mjs` `installFakeEngine(world)`. It installs `GameInfo` (real game data from `fixtures/gameinfo-antiquity.json`) and fakes for:
  - `GameplayMap`, `Players`, `Cities`;
  - `Game.CityOperations` / `CityCommands` (with a log of sent requests), `Game.AgeProgressManager`;
  - `Districts`, `MapConstructibles`, `Constructibles`;
  - `GameTutorial`, `engine` (on/off/trigger), `Locale` (compose returns `KEY(args)`), `Database.makeHash`.

  Then `await import(...)` the module under test *after* installing.
  - **World options:** `tiles(x, y)`, `structures(x, y)`, `cities[{owner,x,y,name,isTown,pop,prod,food,queue,connected,focus,foodSent,grow,readyToGrow,workerCap}]` (`focus` = a Focus ProjectType string or `true`), `players[{id, civ, uniqueQuarters}]` (`uniqueQuarters` is read on every call, so a test can unlock one mid-turn), `gold`, `buyCost(type)`, `maintenance(city, type)`, `canFocus(id, args)`, `focusProjects(id)`, `expand(id)` (growth tiles), `workers(city)` (specialist placement info), `research {tech|culture: {available, active}}`, `treeRecs(subject)` / `buildRecs(cityId)` (advisor), `readyUnits` (idle units; any unit operation removes one), `units [{id, type, x, y, damage, activity, attacks, moved}]` (the local player's units; `Units.get`, `Units.getPathTo` = a step-by-step straight walk, two tiles a turn, its `plots` are the tiles crossed), `unreachable(x, y, unitId)`, `techs` (researched node types, `Techs.isNodeUnlocked`), `unitCommandResult(id, op, args)` (a full canStart result, e.g. Resettle `Plots`), `rangeTargets(unitId)`, `enemies [{x, y, damage}]` (`MapUnits`), `startsWar(unitId, loc)`, `unitCanStart(id, op, args)`, `unitCommandOk(id, op, args)`, `tradeRoutes`, `tradeCapacity(owner)`, `blocker {type, name}` (what holds the turn), `goldIncome`, `cities[i].happy`, `canBuild(type, cityId, args)`, `canBuy(...)`, `placements(city)` (engine placement data), `owningCity(x, y)`, `wonders[]`, `costOf(type)`, `agePoints`, `claimOk`, `aiSuggestions`.
  - **Returns:** `{ grid, info, sent }` (`sent` logs every request: kinds operation, command, player, unit, unitCommand, endTurn). The fake also has an in-memory `localStorage`.
  - **DMT:** `installFakeDmt()` simulates Detailed Map Tacks' storage and events. Then `bridge.initDmtBridge(); await new Promise(r => bridge.onDmtReady(r))`.

## Rules
- **Fakes must behave like the game, not like our assumptions.** Two bugs hid behind fakes that were too kind: the fake said navigable rivers were water, and the fixture's `Terrains` has no `Mountain` column, exactly like the game. When the real game behaves differently from a fake, fix the fake first.
- **Prove every new regression test.** Temporarily revert the fix and watch the test fail, then restore it. Several tests here first passed without their fix, for example because the city owned every tile so no "future tile" case existed.
- **`GameInfo` tables behave like the game's:** `lookup`, `length`, `filter`, `find`, `findIndex`, `forEach`, `for…of`; any other array method throws (as in game). Test code that needs `.map` on a table uses `Array.from(GameInfo.X, fn)`.
- **Hex geometry is "odd-r".** Pick neighbours with `grid.neighbours(idx)` or `grid.radius(idx, r)` instead of hand-written coordinates.
- **Fixture coverage:** Antiquity (`gameinfo-antiquity.json`, used by the fake engine) and Modern (`gameinfo-modern.json`, load it with `loadGameInfo("modern")` for pure rule-book tests, e.g. the Airfield). For Exploration logic extract it: `python -I tools/extract-fixtures.py exploration`. The extractor reads base-standard plus that age's data only.
- **Time-aware plans:** tests that don't care about build order should pass `timeAware: false` (it is on by default) to keep expectations simple.
- **Same-turn cache and fast recalculation.** The planner caches the game's per-city answers for the turn and re-solves only changed settlements. A test that edits the fake world between two plans in the same turn must call `clearEngineCache()` (`ui/data/xpl-engine-cache.js`) or `engine.trigger(...)` the event the game would fire; to force a full plan pass `buildings.incremental: false`.
- **Speed:** `node tools/bench-plan.mjs` plans every building for 8 fake cities and prints CPU per phase and the work counters (gains, tile values, views).
