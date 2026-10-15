# Land Army Commander (UNIT_ARMY_COMMANDER): research for the autopilot (2026-10-14)

The user (game 11): commanders look strong; ours only promotes along Bastion and stands idle in the capital (UI.log `UNIT_ARMY_COMMANDER(…):skipped` every pass). Nothing below is implemented yet.

Game 1.5.0.44 files, read-only. `G` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`.
Main sources:
- `G\Base\modules\base-standard\data\units.xml` (unit row, abilities, charges)
- `G\Base\modules\base-standard\data\unit-promotions.xml` + `unit-promotions-gameeffects.xml` (trees, effects)
- `G\Base\modules\base-standard\data\unit-commands.xml`, `unit-operations.xml`
- `G\Base\modules\base-standard\text\en_us\UnitPromotionsText.xml`, `UnitText.xml`, `Civilopedia_Concepts_Text.xml`; `G\Base\modules\age-antiquity\text\en_us\TutorialText.xml`
- UI: `G\Base\modules\base-standard\ui\commander-interact\model-commander-interact.js`, `army-panel\army-panel.js`, `interface-modes\interface-mode-*.js`, `unit-promotion\*.js`
- AI: `G\Base\modules\base-standard\data\behaviortrees.xml`, `AI_Base.xml`, log `Logs\AI_Commander_Promotions.csv`
- Evidence: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\CombatLog.csv` (213 commander rows)

---

## 0. The unit itself

`units.xml:80`:
- `UNIT_ARMY_COMMANDER`: BaseMoves 2, sight 2, `CORE_CLASS_SUPPORT`, `FORMATION_CLASS_COMMAND`, `ZoneOfControl=true`, `CanEarnExperience=true`, `PromotionClass=PROMOTION_CLASS_LAND_COMMANDER`.
- Cost 100 Production (`Unit_Costs`); `CostProgressionModel=COST_PROGRESSION_PREVIOUS_COPIES`, `CostProgressionParam1=200` (each copy you already own makes the next dearer).
- Tags `UNIT_CLASS_COMMAND`, `UNIT_CLASS_ARMY_COMMANDER`, `AGELESS`.
- `Unit_Stats` row has no Combat (0).

Unlock and free copies:
- Unlocked by the Antiquity civic Discipline (`NODE_CIVIC_AQ_MAIN_DISCIPLINE`, cost 125). The same civic grants a free one in the capital (`MOD_DISCIPLINE_FREE_COMMANDER`, `progression-trees-culture-common.xml:78,81`).
- Terracotta Army also grants one (Antiquity wonder, grassland, `MOD_TERRACOTTA_ARMY_COMMANDER`).

Civ-unique replacements:
- `UNIT_LEGATUS` (Rome) and `UNIT_HAZARAPATIS` (Persia; free Initiative) in Antiquity.
- `UNIT_NOYAN` (Mongolia) in Exploration.
- `UNIT_MWAMI` (Buganda) in Modern.
- Trung Trac's `UNIT_TRUNG_NHI` (DLC trung-nhi; own discipline `DISCIPLINE_ARMY_TRUNG_NHI`).

Base command radius = 1:
- Civilopedia: "Commander actions apply to all friendly units within their Command range (default range of 1)".
- The engine parameters are `ARMY_BASE_COMMAND_RADIUS` and `ARMY_MAXIMUM_COMMAND_RADIUS`; values are compiled in, see §1.
- The radius grows only through `EFFECT_ARMY_ADJUST_COMMAND_RADIUS`: the Merit commendation +1, and Friedrich (Oblique), whose army commanders start with Merit.

Movement:
- Civilopedia: "Commander units have a base Movement of 2. When packed with other combat units, the Commander gains a +1 Movement bonus" (`ARMY_COMMANDER_MOVEMENT_MODIFIER`).
- Army capacity starts at 4 units (Civilopedia). Read it live with `Armies.get(unit.armyId).combatUnitCapacity`. `army.unitCount` includes the commander: the game's flag code shows `unitCount - 1` as packed units.

Peacetime value (`Civilopedia_Concepts_Text.xml:552`):
- "Commanders reduce Settlement unhappiness by 10% when stationed in a City/Town center, and each Commander promotion adds 10% more". The effect ends when the commander moves away.
- The Militaristic attribute node `MOD_ATTRIBUTE_MILITARISTIC_06` adds another +10%.

Age transitions:
- Commanders are AGELESS and keep their XP and promotions.
- Tutorial (`age-antiquity TutorialText.xml:1501`): at the age change some units stay to defend settlements, "and the rest will be assigned to Commanders, as long as there is space for them. Any other Units you have will be left behind!".
- So free army capacity at the age end saves units.

---

## 1. Experience (XP)

### What the game says (text)

- `LOC_PEDIA_CONCEPTS_COMMANDER_EXPERIENCE_TOOLTIP`: "Experience is gained by Commander as units engage in combat within their Command Radius".
- `LOC_TUTORIAL_COMMANDER_EXPERIENCE_BODY`: "Commander Units earn Experience when one of their nearby Units engages in combat."
- Civilopedia ARMY_1: "Individual units no longer gain experience or promotions."
- `LOC_ABILITY_PILLAGE_XP_DESCRIPTION`: "Unit awards experience to Commanders for pillaging". `ABILITY_PILLAGE_XP` exists, but no base or DLC data grants it.

So the trigger is any combat (attacking or defending, melee or ranged) by a friendly unit inside the commander's radius. The commander does not have to fight itself, and the units need not be packed: packed units cannot attack at all.

### The engine's XP rules (names only; values are compiled in)

The values are not in any XML or SQL file:
- `GlobalParameters` rows in data are only a few `Replace`s (`gameplay-systems.xml`, `diplomacy-actions.xml`).
- The exe holds the defaults and writes them at load: `"INSERT OR REPLACE INTO GlobalParameters('Name','Value') VALUES(?,?)"` in `Civ7_Win64_DX12_FinalRelease.exe`.

Parameter names found next to each other in the exe's string table (ASCII scan of the exe):
- `EXPERIENCE_COMBAT_ATTACKER_BONUS`: extra XP when our unit is the attacker.
- `EXPERIENCE_COMBAT_RANGED` and `EXPERIENCE_NOT_COMBAT_RANGED`: XP per ranged and per melee combat.
- `EXPERIENCE_KILL_BONUS`: extra XP for a kill.
- `EXPERIENCE_CITY_CAPTURED`.
- `EXPERIENCE_DISPERSE_INDEPENDENT`: XP for dispersing an independent village.
- `EXPERIENCE_MAXIMUM_ONE_COMBAT`: a cap per combat.
- `EXPERIENCE_BARB_SOFT_CAP` and `EXPERIENCE_MAX_BARB_LEVEL`: XP from independents (barbarians) is capped by level.
- `EXPERIENCE_MAX_LEVEL`.
- `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER`: the threshold grows each level.
- `PILLAGE_BASE_XP`.
- Also `EXPERIENCE_PROMOTE_HEALED`, `EXPERIENCE_RETRAIN_HEALED`, `UNIT_EXPERIENCE_LEVEL_FOR_CUSTOM_NAME`.
- Related: `ATTR_EXPERIENCE_RATE`, `ATTR_GENERAL_XP_MOD`, `HANDICAP_ARMY_XP`.

**Read them in game** (the game's UI already does this):
- `GameInfo.GlobalParameters.lookup("EXPERIENCE_KILL_BONUS")?.Value` (a string).
- Or `getGlobalParamNumber(name)` from `/core/ui/utilities/utilities-data.js`.
- Or the `GlobalParameters.X` global, used in `tutorial-items-antiquity.js:2594`.

A one-time `[XPL]` log line dumping all `EXPERIENCE_*` / `ARMY_*` / `COMMANDER_*` parameters would settle the numbers.

A web search found no published per-event XP or level thresholds. Community guides only say XP comes from fights of nearby units.

### Live XP state (the API the game's panels use)

`unit.Experience` (`model-unit-promotion.js:147-163`, `model-commander-interact.js:118-131`):
- `experiencePoints` and `experienceToNextLevel`.
- `getLevel`.
- `getStoredPromotionPoints`: unspent promotions.
- `getStoredCommendations`: unspent commendation points.
- `getTotalPromotionsEarned` and `getNumPromotions`.
- `canPromote`.
- `canEarnPromotion(disciplineType, promotionType, false)` and `hasPromotion(disciplineType, promotionType)`.
- `canEarnExperience`.

Event: `engine.on("UnitExperienceChanged", data => data.unit)`.

### XP rate modifiers (`EFFECT_ARMY_ADJUST_EXPERIENCE_RATE`, Percent)

| Source | % | Where |
|---|---|---|
| Terracotta Army wonder (Antiquity; also a free commander) | +25 while the wonder is active | `age-antiquity/data/constructibles-gameeffects.xml:467` |
| City-state bonus `CITY_STATE_BONUS_ANTIQUITY_2` (`MOD_CS_COMMANDER_XP_PRODUCTION`) | +50 | `age-antiquity/data/independents-gameeffects.xml:18` |
| City-state bonus `CITY_STATE_BONUS_EXPLORATION_2` | +50 outside your homelands only | `age-exploration/.../independents-gameeffects.xml:18` |
| City-state bonus `CITY_STATE_BONUS_MODERN_2` | +50 | `age-modern/.../independents-gameeffects.xml:18` |
| Policy `TRADITION_COMMISSIONED_OFFICERS` (Exploration civic Imperialism `NODE_CIVIC_EX_MAIN_IMPERIALISM`, depth 2) | +30 and +1 army/fleet movement | `age-exploration/data/traditions-gameeffects.xml:38,48` |
| `TRADITION_EX_ATTRIBUTE_MILITARISTIC_01` (Exploration civic Hierarchy, needs the Militaristic civ attribute) | +25, +25 more in Distant Lands | `traditions-tot-gameeffects.xml:47,55` |
| Memento Art of War | +10 from turn 2; +40 more when inside a higher-level commander's radius | `base-standard/data/mementos-gameeffects.xml:97,108` |
| Trung Trac (leader) | +20 | `leaders-gameeffects.xml:804` |
| AI handicap `HANDICAP_ARMY_XP_SCALING` | AI only, scales with difficulty | `difficulties.xml:132,147` |
| DLC: Sengoku Gekokujo I/II | +50 / +100 | DLC traditions; Ashoka-alt memento +50 in a Golden Age; Heian Utsurou −25 |

### Free promotions or XP

`EFFECT_GRANT_UNIT_PROMOTION` / `EFFECT_GRANT_UNIT_EXPERIENCE`:
- Militaristic attribute node 9 (`MOD_ATTRIBUTE_MILITARISTIC_09`): all commanders, including future ones, get one free promotion.
- Legacy `LEGACY_AQ_MILITARISTIC_4`: the same.
- Modern Military Academy: commanders trained there start with one free promotion.
- Persia: Hamarana trait (+1 promotion) and Hazarapatis (free Initiative).
- Rome: Cursus Honorum (free Bulwark).
- Friedrich: Merit commendation.
- Feudal Monarchy golden age, great people, and many narrative events, e.g. `8094B` +10 XP scaled by age.

---

## 2. Promotion trees (`PROMOTION_CLASS_LAND_COMMANDER`)

`UnitPromotionClassSets` for the land class, in DB order:
- 5 commendation disciplines: `DISCIPLINE_ARMY_COMMENDATION_VALOR / _DUTY / _SERVICE / _MERIT / _ORDER`.
- Then 5 trees: `DISCIPLINE_ARMY_BASTION`, `_ASSAULT`, `_LOGISTICS`, `_MANEUVER`, `_LEADERSHIP`.

Names:

| RU (game) | EN | DB type |
|---|---|---|
| Оплот | Bastion | `DISCIPLINE_ARMY_BASTION` |
| Штурм | Assault | `DISCIPLINE_ARMY_ASSAULT` |
| Логист | Logistics | `DISCIPLINE_ARMY_LOGISTICS` |
| Маневр | Maneuver | `DISCIPLINE_ARMY_MANEUVER` |
| Лидер | Leadership | `DISCIPLINE_ARMY_LEADERSHIP` |

How the trees work:
- Prerequisites are rows in `UnitPromotionDisciplineDetails`. A node with two rows has two alternative parents; the UI draws both edges. Ask `exp.canEarnPromotion(...)` rather than assuming AND or OR.
- The last node has `GrantsCommendation=true`: finishing a tree gives a commendation point («Очки поощрения»).
- Leadership's two last nodes carry `GrantCommendationWithAnyPrereq=true`.

Nearly every "in Command Radius" effect works the same way:
- A `COLLECTION_PLAYER_UNITS` modifier with `REQUIREMENT_PLOT_IN_COMMAND_RADIUS` (+ `DOMAIN_LAND`) grants an ability to each unit in the radius.
- The ability is re-evaluated as units move: being in the radius at combat time is what counts.

### Bastion (Оплот): defence

1. `PROMOTION_ARMY_STEADFAST` (Steadfast), the root: +2 CS to land units in the radius **when defending**.
2. `PROMOTION_ARMY_BULWARK` (Bulwark, after Steadfast): land units in the radius complete Fortifications 1 turn faster. The effect needs an adjacent friendly combat unit.
3. `PROMOTION_ARMY_HOLD_THE_LINE` (Hold the Line, after Steadfast): +2 CS to land units in the radius **stationed on a District** (city centre or urban tiles), attacking or defending.
4. `PROMOTION_ARMY_DEFILADE` (Defilade, after Bulwark): +3 CS to land units in the radius when defending **and fortified** (`REQUIREMENT_UNIT_IS_FORTIFIED`).
5. `PROMOTION_ARMY_GARRISON` (Garrison, after Hold the Line): +10 HP to the fortified districts of the city, while the commander stands on its city centre.
6. `PROMOTION_ARMY_RESOLUTE` (Resolute, after Defilade or Garrison, the commendation node): land units in the radius heal 5 HP after attacking.

### Assault (Штурм): attack

1. `PROMOTION_ARMY_INITIATIVE` (Initiative), the root: units can move after unpacking from this commander (`ABILITY_MOVE_AFTER_UNPACKING`).
2. `PROMOTION_ARMY_ROUT` (Rout, after Initiative): +2 CS to infantry in the radius when attacking.
3. `PROMOTION_ARMY_STORM` (Storm, after Initiative): +2 CS to land ranged units in the radius when attacking.
4. `PROMOTION_ARMY_SHOCK_TACTICS` (Shock Tactics, after Rout): +3 CS to cavalry in the radius when attacking.
5. `PROMOTION_ARMY_ENFILADE` (Enfilade, after Storm): +3 CS to siege units in the radius when attacking.
6. `PROMOTION_ARMY_ADVANCEMENT` (Advancement, after Shock Tactics or Enfilade, commendation): infantry and cavalry in the radius get +5 CS while at full health ("First Strike"). Its only requirement is "not wounded", so it also works on defence.

### Logistics (Логист)

1. `PROMOTION_ARMY_QUARTERMASTER` (Quartermaster), a root: +1 Gold per land unit packed in this commander.
2. `PROMOTION_ARMY_RECRUITMENT` (Recruitment), the other root: +15% Production toward land units in the city the commander is stationed in (city centre or urban district).
3. `PROMOTION_ARMY_REGIMENTS` (Regiments, after either root): +2 unit slots and faster reinforcement (+1).
4. `PROMOTION_ARMY_FIELD_MEDIC` (Field Medic, after Regiments): land units in the radius get +5 healing in neutral or enemy territory.
5. `PROMOTION_ARMY_LOOTING` (Looting, after Regiments): land units in the radius get +50% pillage yields.
6. `PROMOTION_ARMY_SURVIVAL_TRAINING` (Survival Training, after Field Medic or Looting, commendation): land units in the radius get Commando: terrain combat bonuses doubled, infantry ignore cliffs.

### Maneuver (Маневр)

1. `PROMOTION_ARMY_MOBILITY` (Mobility), the root: the commander gets +1 Movement and ignores hills and minor rivers while packed with units.
2. `PROMOTION_ARMY_HARASSMENT` (Harassment, after Mobility): land units in the radius get +2 flanking bonus when attacking.
3. `PROMOTION_ARMY_REDEPLOY` (Redeploy, after Mobility): enemies get −2 flanking when attacking our land units in the radius.
4. `PROMOTION_ARMY_AMPHIBIOUS` (Amphibious, after Harassment or Redeploy): land units in the radius get no embarked-attack penalty and pay 1 Movement to embark or disembark.
5. `PROMOTION_ARMY_PATHFINDER` (Pathfinder, after Harassment or Redeploy): land units in the radius ignore terrain movement costs.
6. `PROMOTION_ARMY_AREA_DENIAL` (Area Denial, after Amphibious or Pathfinder, commendation): the command radius exerts Zone of Control on enemy land units.

### Leadership (Лидер)

1. `PROMOTION_ARMY_ZEAL` (Zeal), the root: +5% to all yields except Happiness in the settlement where the commander is stationed on a district. Good for parking in peacetime.
2. `PROMOTION_ARMY_FIELD_COMMISSION` (Field Commission, after Zeal): land units in the radius can upgrade as if in friendly territory and heal 10 HP when upgraded.
3. `PROMOTION_ARMY_OLD_GUARD` (Old Guard, after Field Commission): **+10 CS for this commander itself when defending**.
4. `PROMOTION_ARMY_RESILIENCE` (Resilience, after Field Commission): −50% recovery (respawn) time.
5. `PROMOTION_ARMY_BARRAGE` (Barrage, after Old Guard or Resilience, commendation): +5 CS for land ranged and siege units in Focus Fire.
6. `PROMOTION_ARMY_ONSLAUGHT` (Onslaught, after Old Guard or Resilience, commendation): +5 CS for land units in Coordinated Attack (melee).

Unused: Sentry (+1 sight, `PROMOTION_ARMY_SENTRY`) has text but is in no tree.

### Commendations («Поощрения»)

One commendation point per finished tree. Spend it with the same `PROMOTE` command, using the commendation discipline and promotion pair:

| Commendation (RU) | Promotion / discipline | Effect |
|---|---|---|
| Valor (Героизм) | `PROMOTION_COMMENDATION_ARMY_VALOR` / `DISCIPLINE_ARMY_COMMENDATION_VALOR` | Gives the `ABILITY_GRANT_SECOND_WIND` command: a land unit in the radius gets +1 attack and +2 Movement. Recharges in 5 turns. |
| Duty (Долг) | `PROMOTION_COMMENDATION_ARMY_DUTY` / `..._DUTY` | Gives `ABILITY_COMMANDER_ATTACK`, "Heroic Assault": the commander deals direct damage to a unit in the radius. The ability's `DamageAmount` is 40, and Duty adds +30 commander attack damage. Recharges in 4 turns. |
| Service (Служба) | `PROMOTION_COMMENDATION_ARMY_SERVICE` / `..._SERVICE` | +1 Movement for land units in the radius. |
| Merit (Добродетель) | `PROMOTION_COMMENDATION_ARMY_MERIT` / `..._MERIT` | **+1 command radius**. |
| Order (Порядки) | `PROMOTION_COMMENDATION_ARMY_ORDER` / `..._ORDER` | **+5 CS for land units in the radius** (always, attacking and defending). |

Note on our current code: `promoteUnits()` in `mod/expansion-planner/ui/data/xpl-autopilot-units.js:1652`:
- It takes the first earnable promotion in DB order, so it fills Bastion first (Steadfast → Bulwark → Hold the Line → Defilade → Garrison → Resolute), then Assault.
- It skips commendations entirely (`promo.Commendation → continue`), so stored commendation points are never spent.
- Check whether `exp.canPromote` stays true with only a commendation point stored; if so it may keep a notification open.

What the AI picks (`Logs\AI_Commander_Promotions.csv`, 54 picks this game):

| Picks | Promotion |
|---|---|
| 16 | Mobility |
| 11 | Harassment |
| 10 | Steadfast |
| 4 | Bulwark |
| 3 | Hold the Line |
| 2 | Pathfinder |
| 1 each | Resolute, Garrison, Defilade |
| 1 | Valor (commendation) |

---

## 3. Commands and how to send them

Every one is `Game.UnitCommands.canStart(unitId, "UNITCOMMAND_X", args, false)` and then `sendRequest(unitId, "UNITCOMMAND_X", args)`.
- String names work (the game's UI uses them). `UnitCommandTypes.PROMOTE` is the hashed form.
- A command with no target is sent with `{X: -9999, Y: -9999, UnitAbilityType: -1}`: the commander panel's `processCommand` with `callback({x:-9999,y:-9999})`.
- Targeted ones: `canStart(..., {}, false).Plots` lists the valid plot indices; send `{X, Y}` of the chosen plot (the `interface-mode-*.js` `commitPlot`).

| Command | Who sends it | Needs | What it does |
|---|---|---|---|
| `UNITCOMMAND_PACK_ARMY` "Assemble Army" | commander | adjacent own land units, free capacity | "Gather adjacent Units to form up on the Commander". The army then moves as one stack on the commander's moves (2, +1 when packed with combat units). Packed units cannot attack. |
| `UNITCOMMAND_UNPACK_ARMY` "Deploy Army" | commander | packed units | Targeted; `Plots` lists the choices (`interface-mode-unpack-army.js`). "Deploy stacked Units into adjacent tiles". Deployed units cannot move that turn unless the commander has Initiative. |
| `UNITCOMMAND_ADD_TO_ARMY` "Add To Commander" | the unit | a nearby commander with room | Targeted (`Plots` = commander tiles; `interface-mode-add-to-army.js`). The autopilot's `joinArmy()` already does this. Failures: `..._FAILURE_MAX_COMBAT_UNITS` / `_MAX_CIVILIAN_UNITS`. |
| `UNITCOMMAND_REMOVE_FROM_ARMY` "Leave Commander" | packed unit | | Targeted to an adjacent free plot. |
| `UNITCOMMAND_ARMY_OVERRUN` "Overrun" | packed army | combat odds ≈ 5:1 (`ARMY_OVERRUN_RATIO`) | Targeted; kills a weak unit without deploying, then enters its tile. |
| `UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED` "Focus Fire" | unpacked commander | ranged units in the radius with an attack left | Targeted (`interface-mode-focused-attack-base.js`). Every ranged unit in the radius fires at the target, each +2 CS (Barrage +5 more). |
| `UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE` "Coordinated Attack" | unpacked commander | infantry or cavalry in the radius | All of them attack the target, each +2 CS (Onslaught +5). |
| `UNITCOMMAND_GRANT_SECOND_WIND` | commander with Valor | | Targeted on a land unit in the radius: +2 Movement, +1 attack. 5-turn recharge. |
| `UNITCOMMAND_COMMANDER_ATTACK` "Heroic Assault" | commander with Duty | | Targeted on an enemy land unit in the radius: direct damage. 4-turn recharge. |
| `UNITCOMMAND_UPGRADE_ARMY` "Upgrade All Units" | commander | gold; friendly territory (or Field Commission) | Upgrades every eligible packed unit. Info line `LOC_UNITCOMMAND_UPGRADE_ARMY_INFO`. |
| `UNITCOMMAND_PROMOTE` | commander | `exp.canPromote` | Args `{PromotionType: Database.makeHash(type), PromotionDisciplineType: Database.makeHash(discipline)}` (`panel-unit-promotion.js:685-700`). |
| `UNITOPERATION_REINFORCE_ARMY` (unit operation) | a combat unit | full movement, full health, in friendly territory, commander ≥ `ARMY_MINIMUM_REINFORCEMENT_DISTANCE` (Civilopedia: 6) tiles away, ≤ 4 reinforcing per commander, not to an embarked army | The unit leaves the map, travels ignoring terrain, and joins the army (or a nearby tile when it is full). Targeted (`interface-mode-reinforce-army.js`). |
| `UNITOPERATION_CALL_REINFORCEMENTS` | commander | | The commander-side version (army panel). |

Not available in the current data:
- `UNITCOMMAND_DEFENSIVE_PERIMETER`: "all military units within Command Radius build temporary fortifications". The command and its interface mode exist, but no ability, promotion or unit grants it in base or DLC.
- `UNITCOMMAND_FORCE_MARCH`: referenced only in `model-commander-interact.js:640`; not in `unit-commands.xml`.
- `UNITOPERATION_FORTIFY` is for military units ("Build temporary fortifications"), not for the commander.

Reading armies:
- `unit.isCommanderUnit`, `unit.armyId` (ComponentID; valid when in an army).
- `Armies.get(armyId)`: `.getUnitIds()`, `.unitCount` (includes the commander), `.combatUnitCapacity`, `.location`, `.localId`.
- `player.Armies.getUnitReinforcementCommanderId(unitId, playerId)`, `getUnitReinforcementETA`, `getUnitReinforcementStartLocation`.
- Events: `UnitAddedToArmy`, `UnitRemovedFromArmy`, `UnitExperienceChanged`.

Stacking (gotcha 23):
- `FORMATION_CLASS_COMMAND` is its own formation, so a commander may share a tile with one military unit and one civilian.
- A soldier may share the commander's tile beyond that only inside its army.

---

## 4. Can a commander be attacked or killed?

Yes. The Civilopedia's "support units have no combat strength" understates it. `CombatLog.csv` this game:
- **37 hits** on `UNIT_ARMY_COMMANDER` as defender ("Unit vs Unit") and 7 on packed armies ("Unit vs Army").
- DefStr of a lone commander: 5–15 in Antiquity, 20–35 later, up to 50 in Modern. It seems to scale with the age or owner; there is no `Unit_Stats.Combat`.
- It has 100 HP and heals 10–15 per turn ("Unit Heal" rows).
- One hit often does 37–100 damage. Destroyed examples: Chariot (30 vs 15) did 66 → 0 HP; Slinger 15 vs 15 did 51 → 0 HP; Cuirassier 55 vs 35 did 100.
- No row shows a commander as attacker.

When packed:
- The stack defends as one ("If an Assembled Army is attacked, it defends as a single unit, leveraging the combined strength of all its components").
- It must deploy when attacked by enough strength, and unpacks when badly hurt.
- The log shows a packed army destroyed by a Cuirassier (two hits: 84, then 100). What happens to its packed units is not visible in the data.

Defeat → respawn, not capture:
- Civilopedia: "Defeated Commanders respawn at the nearest Settlement after 20 turns on Standard Speed. They also respawn after Age transitions."
- Tooltip: "Defeated Commanders will respawn in your Capital after a delay".
- Notification `LOC_NOTIFICATION_COMMANDER_RESPAWN_SUMMARY`: "After being defeated, your {1} has returned to fight again."
- Engine parameters: `COMMANDER_DEATH_DEFAULT_RESPAWN_TURNS`, `COMMANDER_DEATH_DEFAULT_OFF_MAP_TRAINING_TURNS`, `COMMANDER_DEATH_SURVIVAL_BASE_CHANCE`, `COMMANDER_DEATH_SURVIVAL_MODIFIER_PER_PROMOTION`.
- Recovery −50% each from Resilience, the Equestrian Figure memento and Trung Nhi.
- A reinforcement on its way fails (`..._SUMMARY_COMMANDER_KILLED`).
- The "Free Captured Commander" ransom (`DIPLOMACY_ACTION_FREE_CAPTURED_COMMANDER`) is commented out in `diplomacy-actions.xml`, so commanders are not captured.

Its own defence can be raised only by Old Guard (+10 when defending). Its ZoC is on (`ZoneOfControl=true`).

---

## 5. Han / Chinese

Han (`CIVILIZATION_HAN`) has **nothing for commanders**:
- Its traits are `TRAIT_HAN_ABILITY` (Nine Provinces: population growth, +wonder production) and the Political and Scientific attributes. No Militaristic, so no Militaristic attribute points from the civ.
- Han traditions: Fenghuo I/II (+2/+3 Gold on Fortification constructibles; +1 Movement and +3/+5 CS for land units standing on Fortification buildings or improvements in own territory); Xumin Zhao; Xiu Taixue; Ju Xian.
- The Great Wall improvement counts as a Fortification: +6 CS to units on it.
- Unique unit `UNIT_NU` (Chu-ko-nu): ranged, with ZoC, higher defence, +5 CS attacking adjacent units. It gains from Storm (+2 attacking) and Barrage (+5 Focus Fire).

The only Chinese leader is Confucius (`LEADER_CONFUCIUS`: growth, specialist science, Expansionist/Scientific); nothing military.

Commander boosts any civ can get:
- Terracotta Army: free commander and +25% XP.
- The Antiquity XP city-state bonus (+50%).
- Militaristic attribute nodes 06 and 09 (unhappiness reduction; a free promotion for all commanders).
- Legacy AQ Militaristic 4: a free promotion.
- Exploration: Commissioned Officers (+30% XP, +1 Movement) and the Hierarchy tradition (Militaristic civs only).
- Modern: Materiel (+1 army Movement, +10 healing), Military Academy (free level), War Heroes crisis card (+5 Culture per commander level).
- Exploration age-transition cards: capital yields per commander level.
- Crisis card `TRADITION_REBELLIOUS_COMMANDERS`: −1 Happiness in cities per commander level. Fewer high-level commanders are better while it is active.

---

## 6. AI model

`behaviortrees.xml` and `AI_Base.xml`:

- **"City Defense" operation**: `TARGET_MY_CITY`, priority 4, tree "Simple City Defense". The team takes at most 1 army commander plus any combat units; no naval, recon or non-combat units.
- The tree runs these nodes concurrently:
  - Recruit Units.
  - Unpack Army.
  - Attack City.
  - Army Issue Commands ("Army commander will issue commands, either as specified, or any available").
  - Attack Units ("Allow Unequal Attacks" and "Always Running" on).
  - Defend Units, with `Protect Commanders = true`.
  - Disperse Minor Power.
  - Move Army, with `Range to goal = 6`.
  - City Under Threat: enemy combat units ≥ 1, total ≥ 2.
  - Unstack Units.
- The AI therefore deploys the army, keeps it within 6 tiles of the threatened city, uses commander abilities, and keeps units protecting the commander.
- **Assaults** ("Simple City Assault", "Independent Power Assault"):
  - Form Army → Move Army (packed).
  - "Army Must Unpack" ("based on an enemy army or sufficient enemy units") → Unpack → Army Overrun → Army Issue Commands → attack.
  - 1–3 commanders per city attack, exactly 1 per independent camp attack.
- **"City Founders"** (settling) take up to 1 commander and up to 6 combat units as an escort (Form Army → Move Army → unpack when needed).
- The AI's promotion picks are listed in §2.

---

## Recommendations for a defensive autopilot

1. **Where to stand:**
   - In peace, on a city centre (or district) of the most threatened or unhappy settlement. That gives the unhappiness reduction, Zeal yields, Garrison HP and Recruitment.
   - Under threat, one tile behind the defenders, so they are inside the radius (radius 1: the commander must be adjacent to the units it buffs). Prefer sharing a tile with one of our military units, or standing in a city or town centre.
   - Never end a turn alone next to an enemy that can reach it: one hit can kill it, and it is lost for about 20 turns.
2. **Levelling:** XP needs combats inside the radius.
   - Keep it adjacent to the garrison that will be attacked, or to the units the autopilot's melee strike step sends (`strikeWorthIt` in `xpl-autopilot-units.js`).
   - Coordinated Attack and Focus Fire turn one decision into several combats in the radius.
   - Dispersing a village near it gives XP (`EXPERIENCE_DISPERSE_INDEPENDENT`).
   - XP from independents is capped at some level (`EXPERIENCE_MAX_BARB_LEVEL`): read the value in game.
3. **Trees:**
   - Bastion first: Steadfast, Hold the Line, Garrison or Defilade (fortified units), Resolute.
   - Commendation **Order** (+5 CS, always), or Merit (+1 radius) for more coverage.
   - Then Leadership: Zeal, Field Commission, Old Guard (self defence) or Resilience.
   - Then Assault's Advancement path (+5 at full health for infantry and cavalry, works on defence) or Logistics.
   - Avoid Valor and Duty unless the autopilot will use Second Wind or Heroic Assault.
4. **Commands to use:**
   - `FOCUSED_ATTACK_LAND_MELEE` / `_RANGED` on a raider in the radius, after checking `canStart(...).Plots`.
   - `PACK_ARMY` to move a defence force between cities fast (+1 Movement), then `UNPACK_ARMY` next to the threat.
   - `UPGRADE_ARMY` when gold allows.
   - Before an age ends, keep spare army capacity so the transition keeps more units.

## Status (implemented after game 11)

- **Promotions:** `promoteUnits` takes `PROMOTION_PREFERENCE` (recommendation 3: Bastion's way to Resolute, then Leadership, the rest of Bastion, Assault, Logistics, Maneuver), promotions before commendations, and spends commendations (Order, Merit, Service, Valor, Duty).
- **Where it stands:** `postCommander` (recommendation 1): the most threatened settlement's centre, else an unhappy settlement, else a centre; one commander per post; a way never next to a hostile unit. Not done: standing one tile behind defenders in the field, `PACK_ARMY` moves.
- **Commands:** `commanderAttacks` in `strikeRaiders` (recommendation 4): Focus Fire with 2+ ranged units that can shoot the target, Coordinated Attack with 2+ healthy melee units next to it, never into a district, never against a unit stronger than our best + 2. Not done: Second Wind, Heroic Assault, `UPGRADE_ARMY`.
- **Parameters:** UI.log `commander parameters: …` once a session, to read `EXPERIENCE_MAX_BARB_LEVEL` and the rest in game.
- Not done: assigning units to a commander (the game does it for units trained next to one with room).

