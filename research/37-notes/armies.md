> Notes of a research agent for research/37 (18 October 2026), kept as evidence. Game paths are relative to the game's `Base/modules/`. Mentions of the session scratchpad: the scripts are now in `research/37-notes/scripts/` (`python -I r37_pred.py <csv dir> <Base\modules dir>`, Windows paths; it prints matches per segment: 262 of 309 rows match, reproduced 18 October), and the CSVs come from `research/game29/evidence.zip`.

# Armies, packing, reinforcement, age start: what the game files say (for research/37 Phase 3)

Paths: `BS` = `Base/modules/base-standard`. All game-file reads; nothing modified.
Marks: **VERIFIED** (code/data shows it), **INFERRED**, **UNKNOWN** (probe given).

## 1. Packed units: what the UI assumes, how armies are found

**The whole Army API the UI and game scripts use** (every hit of `Armies`/`armyId` in Base + DLC JS):

| Call / property | Where | Notes |
|---|---|---|
| `unit.armyId` (ComponentID) | `BS/ui/commander-interact/model-commander-interact.js:233`, `BS/ui/army-panel/army-panel.js:142,167`, `BS/ui/unit-actions/unit-actions.js:671`, `BS/ui/unit-flags/army-commander-flags.js:73` | Tested with `ComponentID.isValid(unit.armyId)` (not truthiness, except the flag file). |
| `Armies.get(armyId)` | model-commander-interact.js:234; army-commander-flags.js:74; `BS/scripts/age-transition-post-load.js:1115,1206,1274` | Takes the **armyId**, not the unit id. (age-transition-post-load.js:1073 passes a *commander unit id* in continuity mode; looks like a game bug, do not copy.) |
| `army.getUnitIds()` | model-commander-interact.js:239 | The model calls the result `packedUnits` and the army panel shows them in the slots after the commander portrait (army-panel.js:248-256). |
| `army.unitCount` | army-commander-flags.js:82-83 (`if (army.unitCount > 1) for (index = 1; index < unitCount…)` draws one extra flag shape per member); age-transition-post-load.js:1213 (`capacityRemaining = army.combatUnitCapacity - army.unitCount`) | Whether it counts the commander is **UNKNOWN**: the flag code suggests yes (1 = commander alone), the transition code suggests no. |
| `army.combatUnitCapacity` | army-panel.js:282 (slots `>= capacity` are drawn locked, 6 drawn in all), age-transition-post-load.js:1213,1284 | |
| `army.localId` (number) | model-commander-interact.js:152 | Compared with `player.Armies.getUnitReinforcementCommanderId(...)` (a number, `-1` = none). |
| `army.location` `{x,y}` | age-transition-post-load.js:1075,1077 | **There is an army location.** Read in a gameplay script; very likely on the UI object too (INFERRED). |
| `army.packUnit(unitId)` | age-transition-post-load.js:1079,1128,1230,1299 | Gameplay-script context only; not used by any UI file. Do not rely on it from the UI. |
| `player.Armies.getUnitReinforcementCommanderId(unitId, playerId)` | model-commander-interact.js:150,223 | `-1` when the unit is not reinforcing (`:227`). |
| `player.Armies.getUnitReinforcementStartLocation(unitId, playerId)` | :156 | |
| `player.Armies.getUnitReinforcementETA(unitId, playerId)` | :157 | Shown as the slot's turn number (army-panel.js:375-377). |
| `unit.isCommanderUnit`, `unit.isArmyCommander`, `unit.isFleetCommander`, `unit.isReadyToSelect`, `unit.Experience` | model-commander-interact.js:115,231; age-transition-post-load.js:1113,1176,1251 | `isCommanderUnit` covers every commander type, `isArmyCommander` land only. |
| Shadows: `player.Units.getUnitShadows()`, `getShadowIndexClosestToLocation(loc, domainHash, coreClassHash)`, `removeUnitShadowAtIndex(i)`; shadow fields `location`, `isInCommander`, `domainHash`, `coreClassHash`, `tagHash`, `activityType` | age-transition-post-load.js:1067-1338 | Age transition only. |

No `commanderId` or `commanderComponentId` property is read anywhere. **To find a packed unit's commander, the UI walks the player's units for `isCommanderUnit` and takes `Armies.get(commander.armyId)`** (model-commander-interact.js:219-252). To match a member to its commander, compare `member.armyId` with `commander.armyId` (`sameId`). That the members carry the commander's armyId is **INFERRED**: army-panel.js:136-146,167 keeps the panel up for any selected unit with a valid armyId, and selecting a packed unit from the panel (`:437-439`) keeps it up.

**`isOnMap`:**
- **VERIFIED (UI assumption):** a reinforcement in transit is off the map (`isTraveling: !unit.isOnMap`, model-commander-interact.js:159).
- **INFERRED:** packed members are off the map too. `UnitFlagManager.createFlag` makes no flag for `!unit.isOnMap` (`BS/ui/unit-flags/unit-flag-manager.js:499`). Packed units have no flag of their own: only the commander's flag shows one stack shape per member (army-commander-flags.js:82-115).
- **Location, INFERRED:** a packed unit's `location` is its commander's tile. The transition script matches packed shadows by `shadow.location == commander.location && shadow.isInCommander` (age-transition-post-load.js:1118). It also creates units at the commander's/city's tile before `packUnit` (`:1124`, `:1221-1230`).
- **Off-map commanders:** a commander itself may be off the map (dead and waiting to respawn). The model selects it only when `location.x >= 0 && location.y >= 0 && isReadyToSelect` (`:114-116`). **VERIFIED.**
- **`activityType`:** no UI code reads it for packed units. **UNKNOWN.**
- **Probe P-A1** (once a turn and on `UnitAddedToArmy`/`UnitRemovedFromArmy`), for every commander:
  - `commander.armyId`;
  - `Armies.get(id)`'s `localId`, `unitCount`, `combatUnitCapacity`, `location`;
  - `getUnitIds().length`, and whether the list holds the commander's own id;
  - for each member: `isOnMap`, `location`, `activityType`, `armyId` (same as the commander's?), `canMove`, `Movement.movementMovesRemaining`;
  - for each deployed unit in the command radius: its `armyId` (valid or not).

## 2. Unpack, pack, add, leave, overrun: exact requests

All of these go through `Game.UnitCommands`, not `UnitOperations`. A `Plots` result holds **plot indices**: modes test `validPlots.has(GameplayMap.getIndexFromLocation(plot))` (line 35 of each mode file).

| Command | Sent on | canStart | sendRequest | Source |
|---|---|---|---|---|
| `UNITCOMMAND_UNPACK_ARMY` | the commander | `canStart(cmdr.id, "UNITCOMMAND_UNPACK_ARMY", {}, false)` → `Plots` | `{X, Y}` of a chosen plot | `BS/ui/interface-modes/interface-mode-unpack-army.js:11,47` (VERIFIED) |
| `UNITCOMMAND_PACK_ARMY` | the commander | army panel: `{X:-9999, Y:-9999, UnitAbilityType:-1}` | the same args, X/Y still −9999 (`onArmyActionActivated` passes `{x:-9999,y:-9999}`); no interface mode | army-panel.js:520-560, 446-452, 571 (VERIFIED) |
| `UNITCOMMAND_ADD_TO_ARMY` | the soldier | `{}` → `Plots` | `{X, Y}` of the commander's plot | interface-mode-add-to-army.js:11,47 (VERIFIED; the mod's `joinArmy` matches this) |
| `UNITCOMMAND_REMOVE_FROM_ARMY` ("Leave Commander") | **one packed member** | `{}` → `Plots` | `{X, Y}` of a plot | interface-mode-remove-from-army.js:11,48 (VERIFIED) |
| `UNITCOMMAND_ARMY_OVERRUN` | the commander | `{X,Y}` of the target | the same | interface-mode-army-overrun.js:11,47; `BS/ui/world-input/world-input.js:474-482` (VERIFIED) |

- **Unpack description:** "Deploy stacked Units into adjacent tiles." (`BS/text/en_us/UnitCommandsText.xml:70`). Which tile each member lands on is the engine's choice; one plot is sent. Whether the chosen plot is where the first member goes or only a direction is **UNKNOWN**.
  - **Probe P-A2:** log the Plots offered, the plot sent, and each member's tile next turn.
- **Pack:** "Gather adjacent Units to form up on the Commander." (`:58`). It takes no member list. For a selective army, use ADD_TO_ARMY per unit.
- **Leave Commander:** "Order the unit to remove itself from the Commander" (`:88`). **This is a per-unit deploy.** It is the tool for "deploy one packed unit onto the threatened centre and keep the rest packed". Its failure reason is `LOC_UNITCOMMAND_LEAVE_ARMY_NO_LOCATION` "No available location to move." (`:317`). Selecting a packed unit is possible (army-panel.js:437-439), so its id answers `canStart`.
- **The commander actions model** forces `Success = true` for PACK/UNPACK display on any commander (model-commander-interact.js:477-486, a TODO). Its "enabled" look is not a real canStart; always call `canStart` yourself.
- **Failure reasons** (in `canStart(...).FailureReasons`), UnitCommandsText.xml:
  - `LOC_UNITCOMMAND_ALREADY_UNPACKED_THIS_TURN` (:371): "Units cannot be added to an army on the same turn they have unpacked from an army."
  - `LOC_UNITCOMMAND_CANNOT_PACK_IN_ZOC` (:341): "Cannot assemble Units while in an enemy Army Zone of Control".
  - `LOC_UNITCOMMAND_ADD_TO_ARMY_NO_ROOM` (:314) "Nearby Army at full capacity."; `..._FAILURE_MAX_COMBAT_UNITS` (:335); `..._FAILURE_MAX_CIVILIAN_UNITS` (:338).
  - `LOC_UNITCOMMAND_OVERRUN_INSUFICCIENT_STRENGTH_RATIO`.
  - `LOC_UNITCOMMAND_FORCE_MARCH_NO_ACTIONS_REMAINING` (:326) "No Army Special Actions remaining this turn."
  - `LOC_UNITCOMMAND_REQUIRES_FULL_MOVEMENT`, `LOC_UNITCOMMAND_NO_MOVES_REMAINING`.

  All VERIFIED as texts. Which command raises which is the engine's.
- **Terrain:** `Features.PreventUnpack` exists (schema 01_GameplaySchema.sql:1886). Only FEATURE_BERMUDA_TRIANGLE sets it (`BS/data/racetowonders-terrain.xml:17`). VERIFIED.

## 3. Native reinforcement

- **The request (VERIFIED):** it is sent on the **soldier**. `Game.UnitOperations.canStart(unit.id, "UNITOPERATION_REINFORCE_ARMY", {}, false)` → `Plots` (plot indices of eligible commanders). Then `Game.UnitOperations.sendRequest(unit.id, "UNITOPERATION_REINFORCE_ARMY", {X, Y})` with the commander's plot (`BS/ui/interface-modes/interface-mode-reinforce-army.js:11,48`; handler `BS/ui/unit-interact/unit-action-handlers.js:69-80`).
- **The commander-side `UNITOPERATION_CALL_REINFORCEMENTS`:** "Request an eligible Unit to reinforce your Army", UnitOperationsText.xml:214.
  - The army panel checks it with `{X:-9999,Y:-9999,UnitAbilityType:-1}` (army-panel.js:464-480,568-575).
  - It has a handler, so the button only switches to `INTERFACEMODE_COMMANDER_REINFORCEMENT` (unit-action-handlers.js:81-89).
  - That mode only draws a path (`BS/ui/interface-modes/interface-mode-commander-reinforcement.js`, 22 lines) and **never sends a request**. No UI file sends CALL_REINFORCEMENTS. **VERIFIED:** do not use it; reinforce from the soldier.
- **Eligibility (VERIFIED texts; the numbers are not data):**
  - Concepts PAGE_ARMY_3 (`BS/text/en_us/Civilopedia_Concepts_Text.xml:1157`): "a combat unit with full movement, undamaged, at least six tiles from a Commander, and in friendly territory. Each Commander can have at most four reinforcing units … Land units cannot reinforce an embarked Army or cross the open ocean."
  - Failure texts, UnitOperationsText.xml:370-383: `LOC_UNITOPERATION_REINFORCE_ARMY_NO_ELIGIBLE_COMMANDER` "Commander must be at least {1_MinimumDistance} tiles away and have no more than {2_ReinforceCap} reinforcing units."; `_NOT_WHEN_EMBARKED`; `_NOT_WHEN_DAMAGED`; `_NEED_FULL_MOVEMENT`; `_NEED_FRIENDLY_TERRITORY`.
  - **No GlobalParameter or table holds 6 or 4.** The only GlobalParameters files are age gameplay-systems / independents / diplomacy-actions, with nothing on armies. The schema has no reinforcement column. They are engine constants, passed into the text. **VERIFIED** (absence, Base + DLC). Let `canStart` decide.
- **The ETA (INFERRED: turns left, not an absolute turn).** It is printed raw in the slot's `.step-turn-number` badge (army-panel.js:54-58,375-377), the same badge style as move-path turn counters.
  - **Probe P-A3:** log `getUnitReinforcementETA` for one unit on consecutive turns. A falling number means turns left; a constant one, an absolute turn.
- **Travel:** "travels with its base movement range while ignoring terrain modifiers" (Concepts:1160). Regiments: `EFFECT_ARMY_ADJUST_UNIT_REINFORCE_SPEED` (`BS/data/unit-promotions-gameeffects.xml:395`). VERIFIED text/data.
- **On arrival: packed into the army, or deployed nearby when it is full.** VERIFIED text:
  - Concepts:1160: "Upon arrival the unit will join the Commander's Army if there is available capacity, or enter a nearby tile if not."
  - AdvisorText.xml:1872: "the Unit will appear stacked in the Army Commander … if the Army Commander is full when they arrive, they'll appear nearby."
  - So an arriving reinforcement is **packed**: it cannot attack until deployed (§7).
- **While in transit:** off the map (`!isOnMap`), `getUnitReinforcementCommanderId != -1`. The army panel shows it in a slot after the packed units (army-panel.js:258-277). VERIFIED.
- **Failures:**
  - `NOTIFICATION_REINFORCEMENTS_FAILED` (`BS/data/notification.xml:123,241`).
  - Its summaries, NotificationText.xml:129-136: `..._SUMMARY_NO_PATH` "unable to reach the target", `..._SUMMARY_COMMANDER_KILLED`.
  - What happens to the unit then is **UNKNOWN**. Probe: log its `isOnMap` and location the turn the notification comes.

## 4. Events

- **`UnitAddedToArmy` / `UnitRemovedFromArmy`:**
  - The only payload field any UI reads is `data.initiatingUnit` (ComponentID): model-commander-interact.js:261-273 tests `ComponentID.isValid(data.initiatingUnit)`, then `Units.get(...).owner`; army-commander-flags.js:28-35 uses `getFlag(data.initiatingUnit)` and updates that flag.
  - The flag code updates the *commander's* flag, so `initiatingUnit` is very likely the **commander**, not the member (INFERRED).
  - Other fields are **UNKNOWN**. **Probe P-A4:** `JSON.stringify(data)` once for each event.
- **Also listened to around armies** (model-commander-interact.js:41-45): `UnitAddedToMap` / `UnitRemovedFromMap` (`data.unit`, `data.unit.owner`), `UnitExperienceChanged` (`data.unit`).
  - The flag manager destroys a flag on `UnitRemovedFromMap` (unit-flag-manager.js:299-304). So packing very likely fires `UnitRemovedFromMap` for each member, and deploying fires `UnitAddedToMap` / `UnitVisibilityChanged` (INFERRED).
  - Also `UnitPromoted` (army-commander-flags.js:10).
- **`UnitArmyZOCChanged`:** the Antiquity tutorial "enemyArmyFirstEncounter" activates on it (`Base/modules/age-antiquity/ui/tutorial/tutorial-items-antiquity.js:3208`); no payload is read. The matching notification is `NOTIFICATION_ENTERED_ENEMY_ARMY_ZOC`: "Your Commander has encountered an enemy Army. You must deploy your troops in order to attack." (NotificationText.xml:808-812). This is a good trigger for "unpack now".
- **Reporting events** (`Base/modules/core/data/reporting-events.xml`): UNIT_ADDED_TO_ARMY, UNIT_REMOVED_FROM_ARMY, UNIT_ARMY_ZOC_CHANGED, UNIT_ENTER_FORMATION / UNIT_EXIT_FORMATION / UNIT_FORMATION_CHANGED. VERIFIED names.

## 5. Age transition: who survives, who is packed

The JS that does it is `BS/scripts/age-transition-post-load.js` (VERIFIED, read in full for units).

- **Two modes** (`:26-34,52-58`):
  - `AgeTransitionSettingName == "AGE_TRANSITION_SETTING_KEEP_MORE"` (Continuity): `positionUnits` recreates every shadow at its old tile and repacks those that were in a commander.
  - Otherwise (Regroup, the default): `positionArmyCommanders` + `positionFleetCommanders`.
- **Regroup, land** (`positionArmyCommanders`, `:1088-1242`). Every unit is recreated from a *shadow* as the new age's tier-1 unit of its class (`createUnitFromShadowAtLocation` via `GameInfo.Unit_ShadowReplacements`, `:1330-1346`; e.g. Exploration: INFANTRY→Swordsman, RANGED→Heavy Archer, CAVALRY→Courser, SIEGE→Catapult, `Base/modules/age-exploration/data/units.xml:495-501`). **New unit ids: nothing remembered by id survives.**
  1. **Units that were packed** in an army commander are recreated at the commander's tile and `army.packUnit`ed (`:1110-1137`).
  2. **Defenders:** `numDefensiveUnits = GameInfo.Ages.lookup(Game.age).NumDefenders` (`:1347-1352`): Antiquity 0, **Exploration 6, Modern 9** (`BS/data/ages.xml:12-14`).
     - Cities are sorted by **population, descending**; defenders go round-robin over them (`:1098-1104,1145-1170`).
     - Each takes the land military shadow **closest to that city** and is created **at `city.location`** (the centre; `Validate: true`, so a second one on the same centre very likely lands next to it: INFERRED).
     - With no shadow left and fewer than `NumDefenders` units made so far (packed ones included), a free defender is made: `AdvancedStart.createDefender(city.location, UNIT_CLASS_INFANTRY)`.
     - Cities only: the loop is over `Cities.get` of `player.Cities.getCityIds()`. Towns are settlements too, and at that moment every non-capital is regressed to a town (`:1040-1056`), so they are in the list.
  3. **Commanders** that can earn experience are sorted by XP, descending (`:1173-1190`).
     - With none, a new army commander is created in the most populous settlement (`:1191-1201`).
     - Each is **moved to the settlement closest to it** (`Units.setLocation(unitID, city.location)`), flagged `PROPERTY_KEEP_COMMANDER`.
     - It is filled with `combatUnitCapacity - unitCount` more shadows, the closest to its *old* location, created at the city and **packed** (`:1202-1236`).
  4. **Every other shadow is dropped** ("left behind").
- **The tutorial's `{1_UnitCount}` is hard-coded:** `const unitsAssignedToSettlements = 6;` (`Base/modules/age-antiquity/ui/tutorial/tutorial-items-antiquity.js:5133`; text `LOC_TUTORIAL_UNITS_INJECT_AT_AGE_TRANSITION_BODY`, age-antiquity/text/en_us/TutorialText.xml:1501).
  - **The UI can read the real count:** `GameInfo.Ages.lookup(Game.age).NumDefenders`, and the setting from `Configuration.getGame().getValue("AgeTransitionSettingName")`. VERIFIED.
  - The Civilopedia says the same (Civilopedia_Ages_Text.xml:42-43): "Land units are capped at six after the Antiquity Age and nine after the Exploration Age, plus any assigned to an Army Commander … if you have fewer than the minimum, you receive free Infantry."
- **After the transition, VERIFIED by the script:**
  - Units assigned to commanders are **packed** in them (`packUnit`), on a settlement's centre tile.
  - Defenders stand deployed on the most populous settlements' centres.
  - Whether the packed ones read `isOnMap === false` is probe P-A1, at M1/E1.
  - Corollary for research/37 §5: a town that is not among the top-N by population gets no defender. A packed army in the capital is *not* a garrison until deployed.
- **`AgeTransitionArmyUnits`** (`age-exploration/data/age-transition.xml:3-8`, `age-modern/...:3-8`; rows ArmyID 1/3/5/7) and `AgeTransitionParameters.CommanderCountOnTransition` 1 (age-exploration age-transition.xml:51-53) are engine-side tables. No JS reads them. Their exact use is **UNKNOWN**, very likely AI/advanced-start presets.
- **Side note on gotcha 31** (not an army question): `capGold` (`:1354-1371`) cuts the treasury to `adjustForGameSpeed(3000)` under Regroup (6000/9000 under Continuity), and Influence to 500 (800/1200). Gold carries over "in full" only below that cap.

## 6. Capacity and promotions

- **Base capacity 4** (Concepts:331: "An Army's initial capacity is 4 units"). It is not in data: an engine default, read `army.combatUnitCapacity`.
- **Military and civilian slots are separate** (`..._FAILURE_MAX_COMBAT_UNITS` / `..._MAX_CIVILIAN_UNITS`).
- The panel draws 6 slots and locks those at or above capacity (army-panel.js:278-284).
- **The only capacity modifiers** (`EFFECT_ARMY_ADJUST_UNIT_CAPACITY`, Base + DLC) are four promotions in `BS/data/unit-promotions-gameeffects.xml`:
  - Army **Regiments** +2 (`:386`, land, needs tag UNIT_CLASS_ARMY_COMMANDER; LOGISTICS line, after Quartermaster or Recruitment: `BS/data/unit-promotions.xml:347-348`). It also speeds reinforcement (`:395`).
  - Fleet Flotilla (`:743`), Squadron Advanced Landing Ground (`:998`), Flight Deck (`:1111`).
  - No tech or civic changes it. VERIFIED.
- **Initiative** (PROMOTION_ARMY_INITIATIVE, DISCIPLINE_ARMY_ASSAULT root, unit-promotions.xml:337,611) → `MOD_PROMOTION_MOVE_AFTER_UNPACKING` → `ABILITY_MOVE_AFTER_UNPACKING` (gameeffects:130-132, unit-promotions.xml:734): "Units can move after unpacking from this Commander." (UnitPromotionsText.xml:224). The fleet's Weather Gage gives the same (unit-promotions.xml:650).
  - **INFERRED:** without it, deployed units have no moves left on the turn they deploy.
  - Whether they may still attack that turn is **UNKNOWN**.
  - **Probe P-A5:** after an unpack, log each member's `Movement.movementMovesRemaining`, `canMove`, `Combat.attacksRemaining` (or `canStart` RANGE_ATTACK / MOVE_TO).
- **Movement:** a commander has 2 moves, +1 when packed with combat units (Concepts:331). Promotions are army-level; members earn no XP (Concepts:331).

## 7. Other things a land-army bot must know

- **Attacking while packed: the texts conflict; the stronger evidence says no.**
  - Concepts:2173: "Assembled Units are vulnerable and cannot attack until the units have been deployed onto tiles adjacent to the Commander."
  - The ZOC notification: "You must deploy your troops in order to attack."
  - Concepts:1147 says "Assembled Armies can initiate attacks and overrun weaker enemy units". The only packed attack the UI implements is OVERRUN (≈5:1 odds, Concepts:331,1170).
  - `world-input.js:474-482`: a move order onto an enemy first tries `UNITCOMMAND_ARMY_OVERRUN` on the selected unit.
  - So: **packed = no normal attack** (VERIFIED for the UI's behaviour; the engine rule is INFERRED). Air is the exception (Concepts:1251).
- **Defence while packed** (VERIFIED texts):
  - Concepts:1147: "If an Assembled Army is attacked, it defends as a single unit, leveraging the combined strength of all its components … if an Army takes significant damage, it unpacks."
  - Concepts:331: "Armies must Deploy when they get attacked by enemies with sufficient strength."
  - How "combined strength" is computed is **UNKNOWN**: compare `Game.Combat.simulateAttackAsync`/preview numbers against a packed commander with those against a lone unit.
- **Zone of control:**
  - Army commanders exert it (`ZoneOfControl="true"`, `BS/data/units.xml:80`).
  - You cannot assemble inside an *enemy army's* ZOC (`LOC_UNITCOMMAND_CANNOT_PACK_IN_ZOC`). So pack before contact, and expect PACK to fail at the front.
  - The general rule (Concepts:2161): entering ZOC ends movement; ranged, support and siege units exert none.
- **No re-pack the turn a unit deployed** (`ALREADY_UNPACKED_THIS_TURN`). The state machine needs a cooldown flag per unit per turn.
- **One special action a turn:** "No Army Special Actions remaining this turn" (FORCE_MARCH text). Treat commander actions (focus fire / coordinated attack / force march) as 1 per turn per army (INFERRED).
- **Stacking (gotcha 23):**
  - Packed members share the commander's tile without taking the military formation slot. The transition packs four units on one centre that also gets a defender (INFERRED).
  - A deploy needs free adjacent tiles. Congestion is the `LEAVE_ARMY_NO_LOCATION` failure, and Bermuda-type features prevent unpacking.
- **Commander death:**
  - A commander respawns in the capital or nearest settlement after 20 turns on standard speed, and after an age change (Concepts:331, 2173).
  - Its reinforcements fail with `..._COMMANDER_KILLED`.
  - Guard: commander `location.x < 0` means off the map.
- **Ids:** `getUnitReinforcementCommanderId` returns the army's `localId` (number). Every other id is a ComponentID (`armyId`, unit ids): compare with `sameId` (gotcha 33). The game's own model compares the number with `==`.
- **The mod today:**
  - `joinArmy` (`mod/expansion-planner/ui/data/xpl-autopilot-units.js:1415`) already matches the game's ADD_TO_ARMY shape.
  - Many unit loops already skip `isOnMap === false` (`:190,204,1926,2247,2828,3329…`). Research/37 B2 is about the guard counters (`guardDetail`, `threatenedSettlements`, `soldierAt`), which do not.

## Probes to add (UI.log), in one place

- **P-A1:** army inventory per commander (§1), at an age's first turn and on army events.
- **P-A2:** unpack Plots, the plot sent, and the members' tiles after.
- **P-A3:** reinforcement ETA over consecutive turns, and `StartLocation`.
- **P-A4:** the full payload of `UnitAddedToArmy` / `UnitRemovedFromArmy` / `UnitArmyZOCChanged`.
- **P-A5:** members' moves and attacks after an unpack, with and without Initiative.
- **P-A6:** `canStart(...).FailureReasons` of PACK / UNPACK / REMOVE_FROM_ARMY / REINFORCE_ARMY whenever one fails (the texts above, made concrete).
