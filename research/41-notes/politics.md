# Politics for a limited training war (research/41 notes, 21 October)

Question (the user): an optional limited war (on independents we cannot befriend, or on one close, much weaker nation) to
train our army commanders, "making sure it will not make us much slower, using politics, deals, using political points
(Influence) to improve the war force". Read-only audit of the game's data and UI, our code and two games' logs.

**Paths.** `G/` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\`; `GD/` = the same install's
`DLC\`; `PYP/` = Policy Yield Previews 1.5.0, `D:\SteamLibrary\steamapps\workshop\content\1295660\3515801789\`; `U/` =
`mod/expansion-planner/ui/`; `L41`, `L47` = `DiplomacySummary.csv` in `research/game41/evidence.zip`, `research/game47/evidence.zip`.
Costs are written Antiquity / Exploration / Modern. "(unverified)" = read from text or inferred, not seen in game or code.

## 0. How a diplomatic action is started (applies to every row below)

- **Offer and price:** `Game.Diplomacy.getProjectDataForUI(us, target, NO_TARGET, NO_GROUP, -1, NO_TARGET)` lists each action
  with `actionType`, `actionGroup`, `operationType`, `projectStatus` (`PROJECT_AVAILABLE` when startable), `targetList1`
  (cost per target in `costYieldD`) and `targetList2` (second targets: `parameterName` "Unit", "City", "Player3", "Amount2"
  or an independent → `ID2`) (`G/base-standard/ui/diplomacy-actions/screen-diplomacy-target-select.js:48-80, 80-270`;
  `G/base-standard/ui/diplomacy-actions/panel-diplomacy-actions.js:2366-2440`).
- **Quick start** (no second target): `{Amount: 1, Player1: us, Type: actionType, Player2: target, ID: target}`, `canStart` then
  `sendRequest(us, project.operationType, args)` (`panel-diplomacy-actions.js:2454-2496`). Our `startAction` does exactly this
  (`U/data/xpl-autopilot-choices.js:1867-1882`).
- **Second target:** `{Player1, Type, Amount: 1, Player2 (a major) | ID (an independent / city-state)}` plus `Unit`, `City`,
  `Player3`, `Amount2` or `ID2` from `targetList2`, `canStart` per target (`screen-diplomacy-target-select.js:69-79, 155, 210,
  239, 262-270`).
- **Price by relationship:** `DiplomaticActionInfluenceCosts` gives a cost per relationship level (`InfCostHostile …
  InfCostHelpful`, `InfCostNoRelationship` for independents and city-states); -1 or a missing column = not allowed at that
  level (schema `G/../Assets/schema/gameplay/01_GameplaySchema.sql:1567-1582`; rows `G/age-antiquity/data/diplomacy-actions.xml:44-84`,
  `G/age-exploration/data/diplomacy-actions.xml:102-145`, `G/age-modern/data/diplomacy-actions.xml:87-128`, base
  `G/base-standard/data/diplomacy-actions.xml:919-922`). Espionage also has `InfCostPerTurn` while it runs.
- **Durations scale with game speed:** the panel shows `Game.Diplomacy.modifyByGameSpeed(BaseDuration)`
  (`panel-diplomacy-actions.js:2342-2343`). Seen: Military Aid (BaseDuration 15) ran 7 turns in game 47 (`L47`, e.g. T17 start,
  T24 "Success").

## 1. Diplomatic actions that help a war

### 1.1 The war itself and War Support (the main Influence → combat lever)

- **Declaring:** `PlayerOperationTypes.DECLARE_WAR` with `{Player1: us, Player2: them, Type: DIPLOMACY_ACTION_DECLARE_WAR |
  DIPLOMACY_ACTION_DECLARE_FORMAL_WAR}` after `canStart` (`G/base-standard/ui/diplomacy/diplomacy-manager.js:767-783`); the popup
  asks `Diplomacy.canDeclareWarOn(them)` and `canDeclareWarOn(them, WarTypes.FORMAL_WAR)` (`diplomacy-manager.js:1035-1038`).
- **Formal vs surprise:** a Formal War needs a Hostile relationship and has no War Support penalty; a Surprise War (any other
  relationship) has "heavy" War Support penalties, worse the friendlier we were, and gives the target Influence
  (`G/base-standard/text/en_us/Civilopedia_Concepts_Text.xml:2317, 2321`; `DiplomacyText.xml:2133, 2136, 2148`; numbers from
  `getTotalWarSupportBonusForPlayer/ForTarget(them, formal)` and `getWarInfluenceBonusTarget(them, formal)`,
  `diplomacy-manager.js:1040-1050`). The advisor: lower the relationship first and save Influence for War Support
  (`AdvisorText.xml:434, 445`).
- **War Support:** each point we hold over the enemy is one point of War Weariness for them: −1 Combat Strength for all their
  units against us (up to 20), −3 Happiness in each settlement they founded, −5 in others, −7 in settlements founded by the
  power they are at war with; only the highest weariness counts for Happiness; all of it ends with the war
  (`Civilopedia_Concepts_Text.xml:177-186, 2109, 2293`). The reverse hits us the same way.
- **Buying a point:** `SUPPORT_DIPLOMATIC_ACTION {ID: warActionID, Type: DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true for
  the declarer's side, false for the target's}`; price `Game.Diplomacy.getInfluenceForNextSupport(warID, us, isInitialSide)`
  (`G/base-standard/ui/diplomacy-action-details/screen-diplomacy-action-details.js:201-205, 873-893, 920-940, 1201-1230`). The
  war's id: `Game.Diplomacy.getJointEvents(us, them, false)` → the event with `actionTypeName == "DIPLOMACY_ACTION_DECLARE_WAR"`;
  net support = supporters − opposers (`getSupportingPlayersWithBonusEnvoys` / `getOpposingPlayersWithBonusEnvoys`)
  (`G/base-standard/ui/diplo-ribbon/model-diplo-ribbon.js:1046-1087`).
- **Price data:** DECLARE_WAR/FORMAL_WAR rows cost 60 / 120 / 180 at every relationship, `InfCostSupportIncreaseFlat` 30 / 60 /
  90 (`G/age-antiquity/data/diplomacy-actions.xml:46-47`, exploration `:104-105`, modern `:89-90`): very likely the first point
  costs 60 and each further point 30 more in Antiquity (unverified: read the price with `getInfluenceForNextSupport`).
  `MaxThirdPartySupport="1"`: a third party may back one side (`G/base-standard/data/diplomacy-actions.xml:322-323`).
- **Free War Support:** Militaristic attribute node 02 (+1 on all wars, §5); Fajia card (+1 on wars we declare, §3); the
  shareable Militaristic city-state bonus (+1, §2.5); celebrations of Revolutionary Authoritarianism (+6 on wars we declare)
  and Authoritarianism (+2) (§3.4); triumphs AQ_MILITARISTIC_2 (+1 and +50% Influence toward War Support), AQ/MO_MILITARISTIC_5
  (+1 this age) (`G/base-standard/text/en_us/LegaciesText.xml:204, 231, 798`). Cheaper: Garrison State card +25% Influence
  toward War Support (Modern Nationalism, §3), Political attribute node 05 +25% toward supporting actions
  (`AttributesText.xml:55`; whether it applies to war support: unverified).
- **AIs do buy it:** in game 41 the declarer and third parties raised war support and targets "increased opposition" 19 times
  (`L41`, e.g. T44 "P 4 increased support", T45 "P 3 increased support" in 4's war on 2); in game 47 P6 backed P5's war on P4
  (`L47` T52).
- **Relationship cost of declaring:** `HISTORICAL_EVENT_DECLARING_WAR` −30 (`G/base-standard/data/diplomacy-actions.xml:856`),
  `WAR_DECLARED` 1000 grievance tokens, `CITY_OCCUPIED` 30000, `TOWN_OCCUPIED` 10000 (`:758-763`; to whom the −30 applies:
  unverified). Capturing a settlement awards the victim 10 Influence per population (`InfAwardPerPopulation`,
  `G/age-antiquity/data/diplomacy-actions.xml:162`; recipient unverified).
- **Hard rules (failure reasons):** "Can't make peace too soon after declaring war", "Can't declare war too soon after making
  peace", "Too early to start war", "Formal War needs Hostile", "Defensive Pact", **Modern: opposing ideologies cannot make
  peace; shared ideologies cannot go to war** (`G/base-standard/text/en_us/DiplomacyText.xml:1715-1742`).
- **Independents and city-states:** war on an independent is the same `DECLARE_WAR {Player2: independent, Type: DECLARE_WAR}`
  behind a "Begin Hostilities?" confirm, no Influence (`diplomacy-manager.js:813-842`; NoRelationship cost 0 in the rows above).
  A city-state with a suzerain cannot be attacked alone: the game raises the war popup against its suzerain; ours cannot be
  attacked at all (`diplomacy-manager.js:843-870`). Attacking a city-state: `GRIEVANCE_FROM_ATTACK_CITY_STATE` −30
  (`G/base-standard/data/diplomacy-actions.xml:847`). Whether War Support/Weariness exists in a war with an independent:
  unverified (`L41` logs those wars as "At War, Surprise" on turn 2 for every village).

### 1.2 Alliances and calls to arms (no "ask an ally" action exists)

- There is no diplomatic action that asks an ally to join; an alliance does it automatically: "Allies will be called to join
  each other's Wars" (`Civilopedia_Concepts_Text.xml:2199`). The ally gets NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR ("{1} asks you to
  honor your Alliance and join the war … Declining will end the Alliance", `DiplomacyText.xml:2236`); its choices: join
  (`DECLARE_WAR`), stay neutral (`CANCEL_ALLIANCE`), or pay Influence to keep the alliance without joining
  (`PAY_TO_AVOID_CALL_TO_ARMS {… Player3: opponent}`, price `Game.Diplomacy.getPayToAvoidCallToArmsCost`)
  (`G/base-standard/ui/notification-train/notification-handlers.js:462-475`;
  `diplomacy-project-reaction/panel-diplomacy-project-reaction.js:1201-1290, 1502-1537`;
  `diplomacy-call-to-arms/screen-diplomacy-call-to-arms.js:172-205`). What an AI ally picks: native, unverified.
- **Forming one:** `FORM_ALLIANCE {Player1, Player2, Type: DIPLOMACY_ACTION_FORM_ALLIANCE}` (`diplomacy-manager.js:646-660`),
  Friendly/Helpful only, 0 Influence (`G/base-standard/data/diplomacy-actions.xml:920`); the tooltip says Helpful is required
  (`Civilopedia_Concepts_Text.xml:2199`). The AI may reject: alliances blocked 10 turns plus a grievance (`:942-943, 961-962`). Allying
  a leader already at war puts us at war with its enemies (`DiplomacyText.xml:2709`; `panel-other-diplomacy.js:102-121`).
- Relationship: `FAVOR_FROM_WAR_SUPPORT_3RD_PARTY` +15, `GRIEVANCE_FROM_WAR_OPPOSITION_3RD_PARTY` −15, `HISTORICAL_EVENT_MUTUAL_WAR`
  +10 (`G/base-standard/data/diplomacy-actions.xml:841, 852, 859`); breaking or ending an alliance −30 (`G/age-antiquity/data/diplomacy-actions.xml:165-166`).

### 1.3 The actions, one by one

| Action (group) | Cost A / E / M | Duration (base) | Requirements | Effect | AI response | Source |
|---|---|---|---|---|---|---|
| **MILITARY_AID** (endeavor) | 65 Unfriendly, 60 Neutral, 55 Friendly, 50 Helpful; ×2 / ×3 later | 15 (7 turns seen) | `RequiresUnlock`: only leaders with the **Militaristic** leader attribute (attribute UNLOCK_MILITARISTIC_01) or Gilgamesh's all-endeavors; not Hostile | Accepted: **our units +2 Combat Strength**, they get +2 Gold/turn (scaled by age); Supported: **both +3**; Rejected: relationship worse, endeavors blocked 10 turns, Influence refunded | Game 47 (Ashoka World Conqueror): 14 started, 9 supported, 5 accepted, 0 rejected (`L47`) | `G/base-standard/data/diplomacy-actions.xml:334, 465, 615, 784, 985-986`; gameeffects `G/base-standard/data/diplomacy-gameeffects.xml:234-253`; text `DiplomacyText.xml:232`; unlock `G/base-standard/data/attributes-gameeffects.xml:51-56`, `attributes.xml:142-144`; costs `G/age-antiquity/data/diplomacy-actions.xml:56` etc. Whether the +2/+3 lasts only while the action runs: very likely, unverified |
| **SABOTAGE_MILITARY_PRODUCTION** (sanction) | 30 Hostile, 40 Unfriendly, 80 Neutral (×2, ×3); not at Friendly/Helpful | 10 | Militaristic leader attribute (UNLOCK_MILITARISTIC_02) | Target's cities −20% production toward military units; relationship −10 tokens every 3 turns; CancelPenalty 10 | Cannot refuse (`Opposed`: the target may oppose with Influence) | `diplomacy-actions.xml:343, 491, 641, 793`; `diplomacy-gameeffects.xml:117-128`; `attributes-gameeffects.xml:57-62` |
| **DENOUNCE** (sanction) | 55 Unfriendly … 70 Helpful (×2, ×3); not at Hostile | 10 | none | Relationship drop every turn (`TargetFavors` −6000 per turn at precision 1000); endeavors blocked 10 turns. The way to reach Hostile → a Formal War | Cannot refuse | `diplomacy-actions.xml:346, 497-498, 647-649, 748`; `G/age-antiquity/data/diplomacy-actions.xml:65`; how many denounces turn Neutral into Hostile: unverified (bands `diplomacy-actions.xml:818-824`) |
| SABOTAGE_MORALE (sanction) | as sabotage above | 10 | Political (Diplomatic) leader attribute | Target −10% Happiness per turn | — | `diplomacy-gameeffects.xml:87-95`; `attributes-gameeffects.xml:21-26` |
| **ESPIONAGE_MILITARY_SABOTAGE** | 40 / 80 / 120 + 2 / 4 / 6 per turn | 25, effect from progress 15 (random initial progress 6) | Political attribute node 09 | Target's military units **−3 Combat Strength** for the rest of the action | Reveal 30%: −10 relationship grievance, Influence penalty 2/4/6 per turn for 10 turns | `diplomacy-actions.xml:359, 533-534, 685-686`; `diplomacy-gameeffects.xml:455-460`; `G/base-standard/data/units-gameeffects.xml:167-170`; `progression-trees-common.xml:280`; `G/age-antiquity/data/diplomacy-actions.xml:74, 168` |
| ESPIONAGE_MILITARY_INFILTRATION | 40 / 80 / 120 + 2 / 4 / 6 per turn | 20 (effect from 15) | Antiquity tech Wheel | Vision of all the target's commanders | Reveal 20% | `diplomacy-actions.xml:362, 542-543`; `diplomacy-gameeffects.xml:467`; `G/age-antiquity/data/progression-trees-tech.xml:134` |
| ESPIONAGE_OPEN_THE_GATES | E 160 + 8 per turn | 15 (effect from 15) | Exploration tech Castles (UnlockDepth 2) | Destroys Ancient/Medieval Walls of a district in a target settlement (target: Player + Settlement) | Reveal 50% | `G/age-exploration/data/diplomacy-actions.xml:27, 46-47, 92, 131`; `G/age-exploration/data/diplomacy-gameeffects.xml:39-41`; `G/age-exploration/data/progression-trees-tech.xml:118` |
| ESPIONAGE_INFILTRATE_ENEMY_POSITIONS | M 240 + 12 per turn | 25 (effect from 15) | **WarOnly**; Modern civic Nationalism | Our siege units use Bombard against all the target's units | Reveal 100% | `G/age-modern/data/diplomacy-actions.xml:25, 46-47, 81, 117`; `G/age-modern/data/diplomacy-gameeffects.xml:48-53`; `G/age-modern/data/progression-trees-culture-common.xml:113` |
| ESPIONAGE_STEAL_RICHES | -1 at every level | 15 | **WarOnly**, Exploration | Pillages the target settlement's treasure resources, spawns a Treasure Convoy for us | — | `G/age-exploration/data/diplomacy-actions.xml:30, 78-80, 96, 134` (`UIStartProject=false`; how it is started: unverified) |
| DENOUNCE_MILITARY_PRESENCE (treaty) | 20 / 40 / 60 | 10 | the target's units near our border | Target promises not to attack (War Weariness if it attacks before the end) or rejects = war | — | `diplomacy-actions.xml:357, 681, 808`; `diplomacy-gameeffects.xml:418`; `DiplomacyText.xml:492-498, 603` |
| INCITE_RAID (project) | 60 / 120 / 180 at every level | 2 | an independent (ID) + a target major (`Player3`) | An independent raids the target | — | `diplomacy-actions.xml:348, 503-504, 655-656, 798`; `diplomacy-gameeffects.xml:288-290`; `DiplomacyText.xml:507-516` |
| OPEN_BORDERS (treaty) | 35 … 15 (×2, ×3) | 15 | not at war | "The other player's borders will open to you" (passage to a target behind it: unverified for military units) | Rejection refunds Influence | `diplomacy-actions.xml:325, 775`; `DiplomacyText.xml:88` |
| GIFT_GURKHA (Nepal DLC endeavor) | M 165 / 150 | 15 | Friendly/Helpful | The **other** leader gets a Gurkha; we get relationship and Culture | — | `GD/nepal/modules/data/diplomacy-gameeffects.xml:3-40`; `diplomacy-actions-modern.xml:4` |

Our code today: never declares a war of its own (only a formal join of an ally's distant war, `answerCallsToArms` /
`mayJoinWar`, `U/data/xpl-autopilot-choices.js:1429-1500`), never buys War Support (the only `SUPPORT_DIPLOMATIC_ACTION` is for
befriending, `:1185-1190`), never starts a sanction or a military espionage action (only steal tech/civic and space sabotage,
`:1861, 1894-1903`), and ranks MILITARY_AID last but one among endeavors (`ENDEAVOR_VALUE` 5 against 10 for Research
Collaboration, `:1997-2002`); `tendDiplomacy` runs only with «Дипломатия» (`U/hud/xpl-autopilot.js:651`).

## 2. City-states

### 2.1 Levy a unit (DIPLOMACY_ACTION_CS_LEVY_UNIT)
- **Cost:** "The Influence cost of the Unit is equal to its Production cost" (`DiplomacyText.xml:549`); the data cost row is 0
  at every level (`G/base-standard/data/diplomacy-actions.xml:921`), so the price comes per unit in `targetList2[].costYieldD`
  (`screen-diplomacy-target-select.js:276-281`). Instant (BaseDuration 0), permanent (`EFFECT_DAE_LEVY_UNIT`), no limit in data
  (`diplomacy-actions.xml:352, 515, 667`; `diplomacy-gameeffects.xml:427`). A `LEVY_COUNTER_CHANGED` reporting event exists
  (`G/core/data/reporting-events.xml:161`): a per-player counter that may raise later prices, unverified.
- **Which units:** the city-state's own units the game lists in `targetList2` (`parameterName` "Unit", `targetName` = unit
  type) (`screen-diplomacy-target-select.js:194-215`).
- **Who:** the suzerain (unverified in data; Machiavelli may levy from every city-state,
  `G/base-standard/data/leaders-gameeffects.xml:701-703`).
- **Cheaper:** Militaristic attribute node 03 +50% efficiency (`progression-trees-common-gameeffects.xml:402-406`); triumphs
  AQ/EX/MO_CONQUEROR_2 +100% (become suzerain of 2 Militaristic city-states; `G/age-antiquity/data/legacies-gameeffects.xml:158-161`,
  `LegaciesText.xml:1126-1129, 1165-1168`); Siam's Prathetsarat +20% to every city-state action
  (`G/age-modern/data/traditions-tot-gameeffects.xml:1160-1164`); Tonga's Ngatu II (`GD/tonga/modules/data/traditions-gameeffects.xml:94-97`).
  What "+N% efficiency" does to the price (÷1.5? −50%?): unverified.
- **Request:** `{Player1, Type: LEVY, Amount: 1, ID: cityState, Unit: targetID}` (`screen-diplomacy-target-select.js:69-79, 210`).

### 2.2 Bolster Military, Order Attack, Incorporate
- **CS_BOLSTER_MILITARY:** 60 / 120 / 180, 3 turns: the city-state gets one melee unit (`EFFECT_CITY_GRANT_UNIT`,
  `UNIT_CLASS_MELEE`) (`diplomacy-actions.xml:350, 509-510, 662`; `diplomacy-gameeffects.xml:308-319`; costs
  `G/age-antiquity/data/diplomacy-actions.xml:69`). With a levy right after, 60 Influence + the unit's production in Influence
  buys a soldier without our production (unverified that the new unit is offered for levy).
- **CS_ORDER_ATTACK:** 60 / 120 / 180, 30 turns, active from progress 8; target City-State + a major (`Player3`); data gives only
  1 grievance; `UIStartProject=false` (`diplomacy-actions.xml:351, 512-513, 664-665, 801`; `diplomacy-gameeffects.xml:320-327`).
  Whether the city-state's units really attack: unverified.
- **CS_INCORPORATE:** 240 / 480 / 720, 10 turns, the city-state becomes our town (`diplomacy-actions.xml:353, 517, 669`;
  `diplomacy-gameeffects.xml:429`; costs `G/age-antiquity/data/diplomacy-actions.xml:79` etc.). Its units: unverified.

### 2.3 Suzerain bonuses with military effects (chosen on becoming suzerain of a Militaristic city-state)

| Age | Bonus | Effect | Source |
|---|---|---|---|
| A | Hillfort | Unique improvement: +2 Production; +1 Sight, +5 Healing for military units on it | `G/age-antiquity/text/en_us/IndependentsText.xml:390, 522` |
| A | **Age of Heroes** | **Commanders +50% XP** (`EFFECT_ARMY_ADJUST_EXPERIENCE_RATE` 50) | `IndependentsText.xml:393, 525`; `G/age-antiquity/data/independents-gameeffects.xml:15-28` |
| A | Flatbow / Marca | +1 (ranged) Combat Strength to ranged and siege / infantry units per Militaristic city-state we are suzerain of | `IndependentsText.xml:528, 534` |
| A | Foederati | Foederati unit, up to 20% cheaper to buy, +2 CS per adjacent military unit | `:531`; `independents-gameeffects.xml:58-68` |
| A/E/M | Hegemon / Staked Claims / … (`_6`) | +1 Settlement Limit | `:584`; E `:571`; M `:497` |
| A/E/M | Spoils of War / Casus Belli / … (`_7`, shareable) | **+1 War Support** | `:587`; E `:574`; M `:500`; `G/age-antiquity/data/independents-gameeffects.xml:101-111` |
| E | **Expeditionary Warfare** | Commanders in Distant Lands earn "double" XP; data: +50% outside the Homelands | `G/age-exploration/text/en_us/IndependentsText.xml:381, 512`; `G/age-exploration/data/independents-gameeffects.xml:15-28` |
| E | Kasbah, Longbow, Corsair, Free Companies | +3 CS improvement; +1 ranged CS per Militaristic CS; capture ship; +1 CS infantry and naval per Militaristic CS | `:509-521` |
| M | **Ideological Warfare** | Commanders earn "double" XP; data: +50% | `G/age-modern/text/en_us/IndependentsText.xml:307, 438`; `G/age-modern/data/independents-gameeffects.xml:15-28` |
| M | Shore Battery, Artillery Master, Partisan, United Front | +3 ranged CS/+1 range on the tile; +1 ranged CS per Militaristic CS; Partisan unit; +1 CS infantry/naval per Militaristic CS | `:435-447` |

(Text says "double" XP in Exploration and Modern, the data `Percent` 50 in all three ages: which one the game applies is
unverified.)

### 2.4 Our code
- `levyDefenders` (`U/data/xpl-autopilot-choices.js:1967-1993`): only for a threatened settlement short of guards, against land
  raiders, from a city-state of ours within `LEVY_RADIUS` 8, the strongest military land unit offered, from the Influence,
  one a pass; runs only with «Оборона» (`U/hud/xpl-autopilot.js:658`). Never for an offensive, never Bolster first.
- `incorporateCityState` (`:1946-1960`): only while settlements count (fill of the cap, military lever, Homeland milestone) and
  the cap has room (`U/hud/xpl-autopilot.js:659-664`).
- `chooseCityStateBonus` (`:1251-1274`): Policy Yield Previews' city-state preview plus `leverValue`; every military bonus
  above is valued 0 (see §3.5), so Age of Heroes or the War Support bonus is taken only when nothing else is offered.

## 3. Policies, governments, celebrations with military effects

### 3.1 Generic policy cards (main civic tree)

| Age | Card (civic) | Effect | Source (text; data) |
|---|---|---|---|
| A | **Honor** (Discipline) | +3 CS against Independent Powers | `G/age-antiquity/text/en_us/CultureText.xml:238`; `G/age-antiquity/data/traditions.xml:69`, `progression-trees-culture-common.xml:82` |
| A | **Drills** (Tactics) | +30% production toward infantry and ranged units | `:226`; `traditions.xml:67`, `…culture-common.xml:97` |
| A | Commanderies (Tactics) | +20% toward upgrading units | `:315`; `traditions.xml:82` |
| A | City Guard (Public Life) | +3 CS for fortified districts | `:190`; `traditions.xml:61` |
| A | Medicine (Commerce) | +5 healing | `:256`; `traditions.xml:72` |
| A | **Fajia** (Organized Military) | +1 War Support on wars we declare | `:321`; `traditions.xml:83`, `…culture-common.xml:116` |
| E | **Commissioned Officers** (Imperialism) | **+30% commander XP**, +1 movement for armies and fleets | `G/age-exploration/text/en_us/CultureText.xml:192`; `G/age-exploration/data/traditions.xml:82` |
| E | Regulars (Sovereignty) / Chivalry (Social Class) / Maritime Law (Economics) | +30% production toward infantry+ranged / cavalry / naval | `:285, 180, 261`; `traditions.xml:97, 80, 93` |
| E | De Facto / De Jure (Sovereignty) | +3 CS in Distant Lands (+5 heal) / in Homelands | `:210, 219`; `traditions.xml:85-86` |
| E | **Levies** (Authority) | +25% toward purchasing military units, −1 unit maintenance | `:255`; `traditions.xml:92` |
| E | Commune (Piety) | +3 CS fortified districts, +20% overbuilding | `:198`; `traditions.xml:83` |
| M | Draft, Materiel, Trenchworks, Projection of Force, **Jingoism** (Militarism) | +25% unit purchase, −1 maintenance / +10 heal, +1 army move / +3 CS fortified / +50% naval / +5 CS attacking another ideology | `G/age-modern/text/en_us/CultureText.xml:273, 309, 351, 333, 507`; `G/age-modern/data/traditions.xml:77-80, 89` |
| M | People's Army, **Garrison State** (Nationalism) | +25% land units (+1 maintenance) / +25% Influence toward War Support | `:321, 501`; `traditions.xml:72, 88` |
| M | Military-Industrial Complex (Authoritarianism) / Defense of the Motherland (Socialism) / Their Finest Hour (Progressivism) | +50% all military (+1 maintenance) / +3 CS in own territory / +25% air | `:477, 387, 444`; `traditions.xml:118, 102, 112` |

### 3.2 Attribute and civilization cards
- Test of Time attribute cards (civilizations with the militaristic attribute, e.g. Maurya, Persia, Rome, Mongolia:
  `G/age-antiquity/data/civilizations-shared.xml:135, 168, 177`, `G/age-exploration/data/civilizations-shared.xml:146-147`):
  AQ Foundation → +25% production toward commanders, +1 per packed unit (`G/age-antiquity/text/en_us/CultureText.xml:598`;
  `traditions-tot.xml:119`); EX Hierarchy → **+25% commander XP, +50% in Distant Lands** (`G/age-exploration/text/en_us/CultureText.xml:699`;
  `traditions-tot.xml:118`).
- Civilization cards (TraitType): Rome Cursus Honorum (army commanders get Bulwark free), Auxilia; Persia Kara, Shahanshah;
  Greece Strategoi; Maurya Kshatriya; Mongolia Baghatur; America Lend-Lease (+1/+2 War Support, +25% military production while
  ahead in War Support); Prussia Iron Cross (+3 CS near a commander with a commendation); Mughal Gunpowder Empire (+3 CS all)
  (texts `G/age-antiquity/text/en_us/CultureText.xml:1594, 1579, 1486, 1498, 868, 1183`; `G/age-exploration/text/en_us/CultureText.xml:1333`;
  `G/age-modern/text/en_us/CultureText.xml:847, 1495, 1342`; traits `G/age-antiquity/data/traditions-tot.xml:143-205`,
  `G/age-modern/data/traditions-tot.xml:134, 178, 192`).
- Crisis cards that hurt a war: Barbarian Mercenaries (+100% military maintenance), Inferior Tactics (−6 CS vs independents),
  Rebellious Commanders, Impoverished Nobility, Purged Officer Corps (−6 CS all) (`G/age-antiquity/text/en_us/CultureText.xml:357, 369, 375`;
  `G/age-exploration/text/en_us/CultureText.xml:397, 415`); Modern crisis cards Wartime Innovation, War Heroes, Last Reserves
  pay off during a war (`G/age-modern/text/en_us/CultureText.xml:646, 652, 670`).

### 3.3 Governments and celebrations
Governments only choose the celebration options ("This Government grants you a choice between these effects during a
Celebration", `G/age-antiquity/text/en_us/CultureText.xml:488`; E `:534, 575`; M `:547`):
- **Despotism** (A): +10% production toward military units and +10% gold toward buying them (`G/age-antiquity/text/en_us/GoldenAgeText.xml:21`; `golden-ages.xml:17`).
- **Feudal Monarchy** (E): +3 CS for military units, or **our highest-level commander gets a free promotion**
  (`G/age-exploration/text/en_us/GoldenAgeText.xml:8, 14`; `golden-ages.xml:20-21`).
- Revolutionary Authoritarianism (E): +100% military production, or +6 War Support on wars we declare (`:57, 60`; when this
  government is offered: unverified).
- **Authoritarianism** (M): +20% military production, or +2 War Support on wars we declare (`G/age-modern/text/en_us/GoldenAgeText.xml:8, 11`).

### 3.4 What our valuation sees (gotcha 24)
- Policy Yield Previews returns 0 for every military effect: `EFFECT_ADJUST_UNIT_STRENGTH_MODIFIER`, `EFFECT_UNIT_ADJUST_ABILITY`,
  `EFFECT_CITY_ADJUST_UNIT_PRODUCTION`, `EFFECT_ARMY_ADJUST_EXPERIENCE_RATE`, `EFFECT_ADJUST_PLAYER_OR_CITY_UNIT_PURCHASE_EFFICIENCY`,
  `EFFECT_ADJUST_WAR_SUPPORT_BONUS`, `EFFECT_DIPLOMACY_ADJUST_DIPLOMATIC_ACTION_TOKEN_BONUS`, `EFFECT_GRANT_UNIT_PROMOTION`,
  `EFFECT_UNIT_ADJUST_HEAL_PER_TURN`, `EFFECT_PLAYER_ADJUST_SETTLEMENT_CAP` ("Ignored effects", `PYP/scripts/effects/apply-effects.js:982-1031`).
  It does value unit maintenance as gold (`:268`): Levies/Draft (−1) count a little, People's Army and the Military-Industrial
  Complex (+1) count **negative**.
- `core/xpl-effect-value.js` adds none of them (`U/core/xpl-effect-value.js:47-110`: project, building, wonder, overbuild,
  lump grants, mastery, building purchase, damaged buildings only). So every card in §3.1-3.2, every celebration option in
  §3.3 (`chooseCelebration`, `U/data/xpl-autopilot-choices.js:642-664`), every bonus in §2.3 and every militaristic attribute
  node (§5) is worth 0 to the autopilot (`cardValue` `:209-219`, `modifiersValue` `:222-227`).
- `rankGovernments` puts Despotism, Feudal Monarchy, Authoritarianism and Revolutionary Authoritarianism last for every focus
  ("the autopilot never attacks") (`U/core/xpl-effect-value.js:115-140`).

## 4. Peace

- **What a peace deal can hold:** the deal item types are Gold, Influence, Resources, Cities, Units, Agreements, Technology,
  Great Work, Captive (`G/base-standard/data/diplomacy-deal-items.xml:6-27`), but the peace screen offers only the MAKE_PEACE
  agreement, settlements (`DiplomacyDealItemCityTransferTypes.OFFER` of either side's own, `CEDE_OCCUPIED` for occupied ones)
  and gold and Influence lumps (`G/base-standard/ui/diplomacy-peace-deal/panel-diplomacy-peace-deal.js:529-538, 587-670, 862-930`;
  "Select Settlements, Gold, or Influence", `DiplomacyText.xml:2197`). Lumps: Gold 200/500, 400/1000, 600/1500; Influence 40/100,
  80/200, 120/300, scaled by game speed (`G/age-antiquity/data/diplomacy-deal-items.xml:13-20`; exploration and modern files).
- **Sending:** the working deal `{direction: OUTGOING, player1: us, player2: them}`, `INSPECT` to an AI first, then `PROPOSED`
  (`panel-diplomacy-peace-deal.js:1240-1290`; root gotcha 36). Settlements traded in a peace deal enter no unrest
  (`AdvisorText.xml:1858`).
- **When:** "Peace Deals can be proposed after ten turns of War by either party" (`AdvisorText.xml:1848`; the engine's number and
  its game-speed scaling: unverified; `canMakePeaceWith` says when, failure "WAR_TOO_RECENT", `DiplomacyText.xml:1718`).
- **What makes the AI accept:** "more likely to accept a Peace Deal if they feel what they're receiving outweighs the cost of
  continued War. If they're losing badly and have high War Weariness, they may even be willing to give up additional
  Settlements" (`AdvisorText.xml:1848`). So War Support bought during the war is also the price of a cheap peace.
- **Costs of peace:** an uneven deal −5 relationship (`G/age-antiquity/data/diplomacy-actions.xml:167`); peace itself +1 favor
  token, a returned city +1 (`G/base-standard/data/diplomacy-actions.xml:752-756`); then no new war for a while
  ("PEACE_TOO_RECENT", `DiplomacyText.xml:1727`). Mississippian Atassa resets the relationship to Neutral at peace
  (`G/age-antiquity/text/en_us/CultureText.xml:1367`).
- **Modern trap:** opposing ideologies cannot make peace (`DiplomacyText.xml:1739`): a Modern limited war on a leader of the
  other ideology cannot be ended by a deal.
- **Independents:** no peace deal; the war ends when our befriend project reaches 30 (root gotcha 28) or the village is
  dispersed. Dispersing pays its city-state type's yield (`DisperseRewardAmount` 100, Diplomatic 30,
  `G/base-standard/data/Independents.xml:4-9`; `NotificationText.xml:553`), +10 favor with majors near it, −30 with a major
  befriending it (`G/base-standard/data/diplomacy-actions.xml:835`; `G/age-antiquity/data/diplomacy-actions.xml:164`;
  `DiplomacyText.xml:740, 824`). Dispersing 4 independents is the triumph AQ_CONQUEROR_4 (+4 CS vs independents)
  (`LegaciesText.xml:1144-1147`).
- **Our code:** `seekPeace` proposes white peace with every major at war with us, INSPECT first, back-off 3/6/12 turns
  (`U/data/xpl-autopilot-choices.js:1635-1690`); `answerIncomingDeals` accepts a peace asking no settlement and at most 25% of
  our gold and Influence (`:1581-1630`; `U/core/xpl-deals.js:11, 19-34`); with «Наступление» the peace waits while our assault
  progresses (`U/core/xpl-campaign.js:80`). Nothing ever asks for gold, Influence or settlements, and nothing buys War Support
  to make a peace cheaper.

## 5. Leader attributes: the Militaristic tree

Each node costs 1 attribute point; the tree is `PrereqFormat="OR"` (one prerequisite suffices; inferred from the name)
(`G/base-standard/data/progression-trees-common.xml:136, 185-194, 484-494`; the schema's default is "AND",
`01_GameplaySchema.sql:3087`; effects `progression-trees-common-gameeffects.xml:393-442`;
text `G/base-standard/text/en_us/AttributesText.xml:145-172`).

| Node | Prereq | Effect | PYP value |
|---|---|---|---|
| 01 | — | +5 CS against independents and city-states (`REQUIREMENT_OPPONENT_IS_MINOR_CIV`, `units-gameeffects.xml:88-94`) | 0 |
| 02 | — | +1 War Support on all wars | 0 |
| 03 | 01 | +50% Influence efficiency toward levying | 0 |
| 04 | 01 or 02 | +15% production toward military units | 0 |
| 05 | 02 | No unrest Happiness penalty in captured settlements | 0 |
| 06 | 03 | Garrisoned commanders −10% more Happiness penalties | 0 |
| 07 | 04 | −1 gold maintenance for all units | gold (`PYP …apply-effects.js:268`) |
| 08 | 05 | +1 Settlement Limit | 0 |
| 09 | 06, 07 or 08 | **Every commander +1 promotion, new ones start with one** | 0 |
| 10 | 09 | +2 healing, repeatable | 0 |
| Legend L1/L2 (Amina, Charlemagne, Friedrich, Tubman, Trung Trac, Xerxes only) | — | +5 CS against fortified districts | 0 |

- Leaders whose leader attribute is Militaristic also unlock MILITARY_AID and SABOTAGE_MILITARY_PRODUCTION at game start
  (`G/base-standard/data/attributes.xml:142-144`, `attributes-gameeffects.xml:51-62`): Amina, Charlemagne, Friedrich, Tubman,
  Trung Trac, Xerxes, Alexander, Ashoka (World Conqueror), Bolivar, Edward Teach, Friedrich (Baroque), Genghis, Gilgamesh,
  Lakshmibai, Napoleon (Revolutionary), Sayyida al-Hurra, Tecumseh, Toyotomi, Yi Sun-sin (`G/base-standard/data/leaders.xml:169-274`;
  `GD/*/modules/data/leaders.xml`). Political node 09 unlocks Military Sabotage (`progression-trees-common.xml:280`).
- **Our spending** (`buyOneAttribute`, `attributeOptions`, `U/data/xpl-autopilot-choices.js:581-635`): every node valued by
  Policy Yield Previews plus `leverValue`; ties go to the focus's tree (`ATTRIBUTE_OF_PROFILE` has no Militaristic entry).
  The Militaristic nodes are all 0 except 07, so they are bought only when no positive node is left; node 09 (a promotion for
  every commander) is never a target.

## 6. Commander XP and triumphs (pointers)
- XP rules, the API and the XP-rate modifiers are in `research/25-army-commanders.md:55-110`. Note there: XP from independents
  is capped by level (`EXPERIENCE_BARB_SOFT_CAP`, `EXPERIENCE_MAX_BARB_LEVEL`, values compiled in the exe; `:79`) — a war on
  villages trains young commanders only.
- Military triumphs that a training war can reach: AQ_MILITARISTIC_3 a level 8 commander → a commander with 3 promotions;
  AQ_MILITARISTIC_4 first to conquer a capital → +1 promotion for all commanders, present and future; EX_MILITARISTIC_3 a level 8
  fleet commander → +1 promotion for all commanders; AQ_CONQUEROR_4 disperse 4 independents → +4 CS vs independents
  (`G/base-standard/text/en_us/LegaciesText.xml:213-225, 492-495, 1141-1147`). Legacy points count nothing in this game
  version (root gotcha 74); triumphs do.

## 7. Evidence from our games
- Game 47 (Ashoka World Conqueror, militaristic): our Military Aid 14 times, the AI supported 9 (+3 for both), accepted 5, rejected
  none; 7 turns each (`L47`, our "Diplomacy Action Started, Военная помощь" rows with the target's "increased support").
- Game 41: rivals started Military Aid 30 times, steal tech 45, steal civic 36 (`research/40-notes/unused-actions.md:25`);
  Influence income ~7,300 over 165 turns, about 44 a turn (`:27`), all spent.
- Both games: every village is at war with us from turn 2 ("At War, Surprise", `L41` T2 rows `8..23 → 0`); city-state wars are
  logged "Suzerain War" (58 in `L41`, 25 in `L47`); formal wars between majors were rare (6 and 4).

## Design implications

Worth automating for a limited training war (costs Antiquity / Exploration / Modern):
1. **Pick targets that cost no politics:** villages we cannot befriend (war already on, no Influence, no War Support to win;
   XP capped by commander level, so promote young commanders there) and, for a major, one that is Hostile already, not a
   city-state (that is war on its suzerain) and in Modern not of the opposite ideology (no peace possible).
2. **Make it Formal:** Denounce (55-70 / 110-140 / 165-210) until Hostile, then `DECLARE_FORMAL_WAR`: no surprise penalty and no
   Influence gift to the target. The 10-turn denounce also blocks endeavors with that leader.
3. **Buy War Support with spare Influence:** 60 then +30 a point (×2, ×3), each point −1 CS for the enemy against us and
   −3/−5/−7 Happiness in its settlements, and the AI's reason to accept a peace cheaply. Keep ours ≥ theirs so our Happiness
   (and our yields: root gotcha 45) do not pay for the training. Price from `getInfluenceForNextSupport`.
4. **Military Aid** (militaristic leaders only, 50-65 / 100-130 / 150-195, ~7 turns at the user's speed): +2 or +3 CS for all
   our units; the AI never refused it in game 47. Start it with a Friendly/Helpful leader just before and during the war.
5. **Value military effects only during the war window:** Honor (+3 vs independents), Drills/Regulars, Commissioned Officers
   (+30% commander XP), the EX militaristic attribute card (+25% XP), the Age of Heroes / Expeditionary / Ideological Warfare
   city-state bonus, Feudal Monarchy's free promotion, Militaristic node 09 (a promotion for every commander) and 01 (+5 vs
   villages). Today all of these are 0 (§3.4, §5); a war-window lever in `core/xpl-effect-value.js` would let the existing
   card swap step slot them and swap them out after the peace (one swap each way).
6. **City-states:** levy (Influence = the unit's production cost, cheaper with node 03 and the Conqueror triumph) a soldier for
   the front instead of training one; Bolster (60 / 120 / 180) then levy when our cities must keep building.
7. **End it on time:** after the ~10-turn minimum, `seekPeace` already inspects a white peace; add asking for a gold or Influence
   lump when the target's War Weariness is high (the AI "may give up additional Settlements"), and stop the training war
   once the commander reached its target level.

Not worth it (or too uncertain): Incite Raid (60/120/180 for a 2-turn raid by a third party), City-State Order Attack (only a
grievance in data, not started from the panel), Military Infiltration (vision only), Military Sabotage (Political node 09 only,
30% reveal, −3 CS for ~10 turns), Open the Gates (only for capturing walled settlements), Infiltrate Enemy Positions (Modern,
WarOnly, 240 + 12/turn), Steal Riches, Sabotage Military Production (an enemy that trains 20% slower matters little in a short
war), alliances and calls to arms (an AI ally's answer is native; allying someone at war drags us into its wars), Denounce
Military Presence (defensive), the Gurkha gift (the unit goes to the other leader), Despotism/Authoritarianism production
celebrations (production on units we do not need otherwise).

**Probes before building:** War Support price sequence (`getInfluenceForNextSupport` after each point); whether a war with an
independent has War Support at all; the peace-minimum turn count at Online speed; whether the Military Aid bonus ends with the
action; whether a bolstered unit can be levied the same turn; which value ("double" or +50%) the commander XP bonuses apply.
