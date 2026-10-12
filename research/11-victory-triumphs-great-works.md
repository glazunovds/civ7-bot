# 11. Victory paths, triumphs, great works, artifacts (game 1.5)

Read-only research for the autopilot (2026-10-12). Paths: `<M>` = `Base\modules\`, `<S>` = `Base\Assets\schema\gameplay\01_GameplaySchema.sql`.

## Legacy paths (per age)
- **Score:** `player.LegacyPaths.getScore("LEGACY_PATH_ANTIQUITY_CULTURE")` → number. It works for rivals too; the game's victory manager loops `Players.getAlive()` filtered to `isMajor` (`<M>base-standard\ui\victory-manager\victory-manager.js:86`).
- **Goal:** `RequiredPathPoints` of the `GameInfo.AgeProgressionMilestones` row with `FinalMilestone` true and that `LegacyPathType`. "How close" = score / goal.
- **Which paths:** enabled ones are `GameInfo.LegacyPaths` rows with `EnabledByDefault`. `LegacyPathClassType` is `LEGACY_PATH_CLASS_CULTURE | ECONOMIC | MILITARY | SCIENCE`.
- **Other calls:**
  - `player.LegacyPaths.getEnabledLegacyPaths()` → `[{legacyPath: hash, legacyPathClass: hash}]`;
  - `getCompletedLegacyPaths()` → hashes;
  - `Game.AgeProgressManager.isMilestoneComplete(type)` (local player only).
- **Milestones 1 / 2 / 3** (the third is final; data in `<M>age-*\data\victories.xml`):

| Age | Culture | Military | Science | Economic |
|---|---|---|---|---|
| Antiquity | 2 / 4 / 7 wonders | 6 / 9 / 12 settlements (conquered ones count 2) | 3 / 6 / 10 codices displayed | 7 / 14 / 20 resources assigned |
| Exploration | 6 / 9 / 12 relics | 4 / 8 / 12 distant-lands points | 1 / 3 / 5 districts with 40 yield | 10 / 20 / 30 treasure points |
| Modern | 5 / 10 / 15 artifacts displayed | 10 / 15 / 20 ideology conquest points | 1 / 2 / 3 space projects | 150 / 300 / 500 railroad points |

## Countdown victories (decided in Modern)
- **Tables:** `GameInfo.VictoryTypes`, joined to `GameInfo.Victories` (`LegacyPathClassType`).
  - Culture, military and economic are domination countdowns: 5 turns.
  - Science is a fixed score: 100.
- **Calls** (all take `victoryType.$hash`):
  - target score: `Game.VictoryManager.getCountdownVictoryDominanceScore(hash)` (`-1` = locked);
  - our points: `player.Victories.getPointsForVictoryType(hash)`;
  - countdown: `player.Victories.getVictoryCountdownStatus(hash)` → `{isDominant, turns, prereqs: [{description, current, total}]}`;
  - breakdown: `getScoringForVictoryType(hash)`;
  - per-turn history: `getHistoryForVictoryType(hash)`.
- **Dominance:** `VictoryDominationPercents` sets how far ahead of second place you must be. The lead needed shrinks as the age progresses (e.g. 4× at 0%, down to 1.25× at 80%).
- **Model file:** `<M>base-standard\ui-next\screens\victories\victories-screen-model.js`.

## Triumphs («Триумфы», `<M>base-standard\ui-next\screens\legacies\`)
- **Which triumphs:** `GameInfo.Legacies` rows where `Players.get(pid).Legacies.isValidLegacy(LegacyType)`.
- **Progress:** `Legacies.getProgress(type)` → `{progress: [{current, total}], raceWinner}`. It can be falsy. Done: `Legacies.isTriggered(type)`.
- **Lost to a rival:** the row has `FirstPlayerOnly` and `raceWinner` is neither -1 nor us.
- **`Legacies` columns:** `MajorLegacy` (great = a Dedication next age; minor = an instant reward), `LegacySubtype`, `TriggerDescription` (the requirement), `Description` (the reward).
- **Category:** a `GameInfo.TypeTags` row with `Type == LegacyType`, tag `CULTURAL | SCIENTIFIC | ECONOMIC | MILITARISTIC | EXPANSIONIST | DIPLOMATIC | CRISIS`.
- **Events:** `PlayerLegacyProgress`, `PlayerLegacyCompleted {player, legacy}`.
- **"Track"** is UI state only, with no game request: it lives in the quest tracker, saved in `player.Tutorial` properties (`triumph-tracking-manager.js`).

## Leader and civilization leanings
- **Leader's preferred victory:** `GameInfo.LeaderTraits` rows `TRAIT_{AQ|EX|MO}_{CULTURE|MILITARY|SCIENCE|ECONOMIC}_VICTORY`. Base leaders have only `TRAIT_MO_*`; DLC leaders have one per age. The AI reads these (`<M>base-standard\data\AI_Victories.xml`).
- **Attribute traits:** leaders have `TRAIT_LEADER_ATTRIBUTE_*` (two each); civilizations have `CivilizationTraits` `TRAIT_ATTRIBUTE_*`.
- **Access:** a script might read `GameInfo.LeaderTraits`, but the game UI never does, so that is unconfirmed. Fallback: `Database.query("gameplay", "SELECT TraitType FROM LeaderTraits WHERE LeaderType=?", …)`.

## Advisor recommendations
- **Shape:** `getTreeRecommendations` / `getBuildRecommendations` items `{subject, recommendedType, whichAdvisors}`.
- **`whichAdvisors`** is an array of `AdvisorTypes.CULTURE | ECONOMIC | MILITARY | SCIENCE` (engine enum; compare with `AdvisorTypes.X`). It maps by name to the legacy path classes (`<M>base-standard\ui\tutorial\advisor-utilities.js`).

## Great works (archive → slots) — used by the autopilot since after v1.0.0
- **Archive:** `player.Culture.getNumWorksInArchive()` / `getArchivedGreatWork(i)` → index; `Game.Culture.getGreatWorkType(index)` → `GameInfo.GreatWorks`.
- **Slots:** `city.Constructibles.getGreatWorkBuildings()` → `[{constructibleID, slots: [{greatWorkIndex}]}]`, and `getNumGreatWorkSlots(id)`.
- **Move:** `PlayerOperations MOVE_GREAT_WORK {Player1, GreatWorkIndex, DestinationCity: city.id.id, DestinationBuilding: building type}` (from a slot also `SourceCity`) (`<M>base-standard\ui\great-works\model-great-works.js`).

## Artifacts (Modern explorers) — used by the autopilot since after v1.0.0
- **Who:** units with `ExtractsArtifacts` (`UNIT_EXPLORER`).
- **Excavate:** `UNITOPERATION_EXCAVATE` on revealed `IMPROVEMENT_RUINS`, or a natural wonder with `player.Stats.hasNaturalWonderArtifact(featureType)`.
- **Research:** `UNITOPERATION_RESEARCH_ARTIFACTS` at a finished museum or university while `player.Culture.getNumAgesAvailableToResearch(continent) > 0`. This reveals the continent's ruins.
- **Source:** the game's continent lens, `<M>base-standard\ui\lenses\layer\continent-layer.js`.

## Diplomacy with leaders — used by the autopilot (`tendDiplomacy`)
- **Counter Spy** `DIPLOMACY_ACTION_COUNTER_SPY` («Контршпионаж»): a player-targeted espionage action. Exploration 80 / Modern 120 Influence, plus 1 per turn; not in Antiquity.
  - Effect: that player's spy actions against you take twice as long, and their reveal and failure chances rise by 30%.
  - Unlock: civic Authority in Exploration; every civ in Modern.
- **Endeavors** («Инициативы»): 15 turns, operation `COOPERATIVE_YIELDS_DIPLOMATIC_ACTION`.
  - Cost: Antiquity 50–65 by relationship (×2 Exploration, ×3 Modern).
  - Each leader is granted the ones matching its two attribute traits: Scientific → research collaboration, Economic → open markets (`MINOR_TRADE`), Cultural → cultural exchange, Expansionist → farmers market, Political → local festival, Militaristic → military aid.
  - None can be started with a Hostile leader.
- **Reconciliation** `SEND_DELEGATION` («Примирение»): no unlock, Hostile/Unfriendly only, 60/120/180 Influence, +30 relationship accepted / +60 supported.
- **Starting an action:** `{Amount: 1, Player1, Type, Player2, ID}` with `project.operationType` (`panel-diplomacy-actions.js` quick start). The project must be `PROJECT_AVAILABLE`; its cost is `targetList1[].costYieldD`. Influence: `player.DiplomacyTreasury.diplomacyBalance`.
- **Relationship:** `Diplomacy.getRelationshipEnum(other)` → `DiplomacyPlayerRelationships.PLAYER_RELATIONSHIP_HOSTILE … HELPFUL`; history `getPlayerRelationshipHistory(other)`.
- **What sours it:** rejecting a proposal (−15, endeavors blocked 10 turns); military near them; settling close; sanctions and denouncing; your revealed espionage. Rejecting Denounce Military Presence = war.

## Resources — used by the autopilot (`assignResources`)
- `PlayerOperationTypes.ASSIGN_RESOURCE` / `SWAP_RESOURCES` (`<M>base-standard\ui-next\screens\commerce\commerce-screen-model.js`).
- It drives the Antiquity economic path (20 assigned) and Modern triumphs (assign 60 resources, 30 factory resources).
- **Owned:** `player.Resources.getResources()` → `[{value, uniqueResource: {resource}, isOffMap}]`.
- **Placed:** `city.Resources.getAssignedResources()` / `getAssignedResourcesCap()`; `isResourceAssignmentLocked()`.
- **Assign:** `ASSIGN_RESOURCE {Location, City: city.id.id, Flags: isOffMap, ID: off-map id or -1}`.
