# 08 - Wonders: race data, engine API, placement

Paths: `WS` = `D:\SteamLibrary\steamapps\workshop\content\1295660`, `BM` = `...\Civilization VII\Base\modules`. Read-only scouting.

## 1. Wonder Alert mod (WS\3656705275, "Wonder Race Alert")
- Files: `ui/wonder-alert-panel.js` (6589 lines), `ui/wonder-alert-dock-decorator.js` (270 lines). Hotkey Alt+W; window event `open-wonder-alert` (panel.js:6495). VERIFIED
- Shows every wonder with a status: Building (us), Racing, AI Building (with turns/progress), Completed, Available; filters; hides leader names of unmet civs (STEAM_DESCRIPTION_EN.txt). VERIFIED
- **Completed:** `Players.getAlive()` -> `player.Constructibles.getWonders(playerId)` -> `Constructibles.getByComponentID(id)`, checks `.complete` and `GameInfo.Constructibles.lookup(existing.type).ConstructibleClass === 'WONDER'`; city via `GameplayMap.getOwningCityFromXY` (panel.js:3606-3650). VERIFIED
- **In progress (rivals):** scans **every alive player's city BuildQueue**: `bq.currentProductionKind === ProductionKind.CONSTRUCTIBLE`, `GameInfo.Constructibles.lookup(bq.currentProductionTypeHash)`, `bq.getPercentComplete(hash)` (panel.js:3717-3760, again 3899-3944). This is **hidden information** - no visibility check. Only names are masked via `Game.Diplomacy.hasMet(local, other)` (panel.js:585-595). VERIFIED
- **Our buildability:** `Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible)`, rows `{index, result}`; `result.Success`, placement plot counts (panel.js:4672-4720). Tech lock via `Game.ProgressionTrees.getNodeState(playerId, nodeType)` (panel.js:4214-4216). VERIFIED
- Events: `LoadComplete`, `LocalPlayerTurnBegin`, `WonderCompleted`, `CityProductionChanged`, `CityProductionQueueChanged`, `PlayerTurnActivated` (panel.js:6527-6533). VERIFIED

## 2. Other "wonder panel" code
- **BZ Map Trix (WS\3507072814) has `ui/bz-wonder-panel/`** (model-wonder-list.js 192 lines, panel-wonder-list.js 218 lines) - literally a "wonder panel"; most likely meaning of "Wonder Panel data". INFERRED
  - JS model `g_bzWonderListModel` / export `bzWonderList` (model-wonder-list.js:~180-192) with `wonderList = {inProgress, available, complete, skipped}`; dispatches window event `bz-model-wonder-list-update`. VERIFIED
  - Source: `GameInfo.Wonders` (all), then full-map scan `MapConstructibles.getConstructibles(x,y)` -> `Constructibles.getByComponentID(id)`; `instance.complete` splits complete/inProgress (:130-145). In-progress wonders exist as map constructibles once placed; owner `instance.owner`; turns via `Cities.get(instance.cityId).BuildQueue.getTurnsLeft(hash)` (:104). Location shown only if `GameplayMap.getRevealedState(GameContext.localObserverID,x,y) != RevealedStates.HIDDEN` (:93-100); owner shown only if `Players.get(local).Diplomacy.hasMet(id)` (:109-111). `isRacing` = same wonder in progress in 2+ cities. VERIFIED
  - It still reads rivals' turns-left and in-progress status on unrevealed plots (hidden info, partly masked). VERIFIED
  - Events (:17-33): CityPopulationChanged, CityProductionChanged, CityProductionQueueChanged, CityProductionUpdated, CityYieldChanged, CityYieldGranted, ConstructibleAddedToMap/RemovedFromMap, Diplomacy*, PlayerTurnActivated, WonderCompleted. VERIFIED
- Base game: no dedicated wonders screen found in base-standard/ui (grep for screen-wonders / panel-wonder). Wonders appear in production chooser / city details. VERIFIED (grep; DLC not exhaustively checked)
- Notifications (BM\base-standard\data\notification.xml:133-134, 264-265): `NOTIFICATION_WONDER_COMPLETED`, `NOTIFICATION_WONDER_FAILED` (we lost a race). No "rival started a wonder" notification type exists. VERIFIED
- Advisor warning `ADVISOR_WARNING_COMPETING_WONDER` (BM\base-standard\data\advisory.xml:238) -> `NOTIFICATION_ADVISOR_WARNING_CULTURE`: the game itself warns about a competing wonder - an engine-sanctioned race signal. VERIFIED (exact trigger INFERRED: someone else building the wonder we build).

## 3. Engine API (real usages)
| Need | Call | Example |
|---|---|---|
| Cost in city (with modifiers) | `city.Production.getConstructibleProductionCost(type)` | base-standard/ui/city-banners/city-banners.js:684; constructible-details/constructible-details.js:168 VERIFIED |
| Base cost | `GameInfo.Constructibles.lookup(t).Cost` (275-450 antiquity, 525-750 exploration, 1500-2100 modern) | age-*/data/constructibles.xml VERIFIED |
| Progress | `city.BuildQueue.getPercentComplete(type)` | city-banners.js:685 VERIFIED |
| Turns left | `city.BuildQueue.getTurnsLeft(type)` | city-banners.js:686; production-chooser/production-chooser-helpers.js:239 (used for non-queued items too) VERIFIED |
| Production/turn | `city.Yields.getYield(YieldTypes.YIELD_PRODUCTION)` | pattern from city-banners.js:759 (happiness) INFERRED |
| Can build + valid plots | `Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible)` -> `[{index, result}]`; `result.Success`, `result.Plots`, `result.ExpandUrbanPlots`, `InQueue`, `InsufficientFunds` | production-chooser-helpers.js:512, 236-238 VERIFIED |
| Single check | `Game.CityOperations.canStart(cityID, CityOperationTypes.BUILD, {ConstructibleType: idx}, false)` | interface-modes/interface-mode-place-building.js:61, 401 VERIFIED |
| Still available | no `isWonderBuilt` API found; combine `MaxWorldInstances="1"` + completed scan (`player.Constructibles.getWonders()`) or rely on canStartQuery | VERIFIED (absence by grep) |
| Wonder production bonuses | e.g. `MOD_CIV_WONDER_PRODUCTION_EGYPT/GREECE/AKSUM` (age-antiquity/data/civilizations-antiquity.xml:49-58); presumably already folded into getTurnsLeft | INFERRED |

## 4. Legitimate vs hidden info
Legitimate: our cities' queues/costs; completed wonders (world-announced, NOTIFICATION_WONDER_COMPLETED); wonder constructibles on plots we have revealed (in-progress wonders are visible on the map in vanilla); competing-wonder advisor warning; NOTIFICATION_WONDER_FAILED; met/unmet status; age progress.
Hidden but technically exposed (avoid by default): other players' `city.BuildQueue` (current item, percent, turns), `Constructibles` on unrevealed plots, rivals' city yields. Both Wonder Alert and BZ wonder panel read some of this. VERIFIED (code); fairness judgement INFERRED.

## 5. Heuristic "can we win the race"
1. Candidate = current-age wonder, not complete anywhere, present in `canStartQuery` with Success or non-empty Plots.
2. ourTurns = min over our cities of `getTurnsLeft` (or ceil((cost - progress)/prodPerTurn)).
3. Legit rival signals: S1 revealed in-progress instance of same wonder (owner if met); S2 competing-wonder advisor warning; S3 age progress / turn number vs typical completion; S4 count of rival wonders completed this age (pace).
4. Label: HIGH = no S1/S2 and ourTurns <= ~10 (scale by game speed/age); MEDIUM = no signals but slow, or signal present and ourTurns <= 5; LOW = S1/S2 present and ourTurns > 5, or late age; NONE = completed elsewhere. Thresholds to tune. INFERRED
Optional opt-in "omniscient" mode could use rival BuildQueue turns like Wonder Alert.

## 6. Placement requirements (age-*/data/constructibles.xml; all DISTRICT_WONDER, MaxWorldInstances=1)
**Antiquity** (rows ~150-470): Angkor Wat river-adj; Colosseum urban-adj; Colossus on Coast + AdjacentToLand; Dur-Sharrukin urban-adj; Emile Bell hill; Gate of All Nations urban-adj; Great Stele flat; Ha'amonga coast-adj; Hanging Gardens river-adj; Mausoleum of Theodoric coast-adj; Monks Mound river-adj; Mundo Perdido tropical; Nalanda plains; Oracle hill; Petra desert; Pyramid of the Sun flat + urban-adj; Pyramids adj navigable river, desert/grass/plains/tropical; Sanchi Stupa plains; Terracotta Army grassland; Weiyang Palace grassland; Great Library urban-adj.
**Exploration** (~133-420): Borobudur coast-adj; Brihadeeswarar river-adj; El Escorial hill; Erdene Zuu flat; Forbidden City urban-adj; Hale o Keawe coast + tundra; House of Wisdom urban-adj; Machu Picchu mountain, grass/tropical; Notre Dame river-adj + urban-adj; Shwedagon lake-adj; Tomb of Askia desert; White Tower none.
**Modern** (~151-425): Brandenburg Gate urban-adj; Chengde mountain-adj; Dogo Onsen coast-adj; Doi Suthep hill; Eiffel urban-adj; Hermitage tundra; Manhattan none; Muzibu Azaala Mpanga lake-adj; Oxford urban-adj; Palacio de Bellas Artes urban-adj; Red Fort urban-adj; Statue of Liberty coast, RiverPlacement=ANCHORED; Taj Mahal plains; World's Fair none.
Sources: tables `Constructible_ValidTerrains`, `Constructible_ValidBiomes`, `Constructible_ValidDistricts` + columns `AdjacentRiver/AdjacentTerrain/AdjacentDistrict/AdjacentLake/AdjacentToLand/RiverPlacement`. VERIFIED. Wonder-related adjacency yields of nearby buildings not checked here.

## Implications for our mod
- Don't reimplement placement rules: `canStartQuery(...).result.Plots` yields valid wonder plots per city; score them with our adjacency engine.
- Our side: `getConstructibleProductionCost` + `getTurnsLeft`. Rivals: legit signals only by default, omniscient mode opt-in.
- BZ-style map scan filtered by `getRevealedState` is a fair way to find "known in-progress" rival wonders; cheap enough once per turn.

## Open questions
- "Wonder Panel" most likely = BZ Map Trix `bz-wonder-panel` (`g_bzWonderListModel`); could also mean Wonder Alert's panel. Confirm with user. If BZ, soft-depend by importing `bzWonderList` (verify module URL) or listening for `bz-model-wonder-list-update`.
- Exact trigger of ADVISOR_WARNING_COMPETING_WONDER and whether UI can read it (Game.Notifications).
- Does `getTurnsLeft` return sane values for non-queued wonders in every city?
- Are in-progress wonders on fogged (revealed, not visible) plots updated live (information leak)?
