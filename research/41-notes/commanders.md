> Notes of a research agent for research/41 (21 October 2026): land army commanders, for the user's goal "a couple of
> experienced generals: one fast, packing many units, moving right after unpacking; experience gained each game without
> losing much in wars (independents we cannot befriend, or optionally a war on one close, much weaker nation)".
> Read-only research: nothing under `mod/` or `tests/` was changed. Builds on research/25 (commanders), research/37 §5,
> §9 and `research/37-notes/armies.md`; facts below were re-checked against game 1.5.0.44's files on this date.

# Land army commanders: experience, promotions, armies, and what a "two generals" plan can rely on

**Paths.** `G` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`; `BS` = `G\Base\modules\base-standard`;
`AQ`, `EX`, `MO` = `G\Base\modules\age-antiquity`, `age-exploration`, `age-modern`. "Concepts" =
`BS\text\en_us\Civilopedia_Concepts_Text.xml`; "PromoText" = `BS\text\en_us\UnitPromotionsText.xml` (line numbers of the
`<Text>` line). "Our code" = `mod\expansion-planner\ui\`. Evidence zips: `research\game<N>\evidence.zip`.

**Marks.** **VERIFIED** (game data or code says it), **EVIDENCE** (our logs show it), **INFERRED** (follows from the
above, not seen directly), **UNVERIFIED** (open; a probe is named).

**How the log evidence was read** (scratch scripts, not kept): each `UI.log` streamed from the zip; the turn is the last
`[XPL] … gold: T<n>` line, the age the last `rules loaded for AGE_…` line; commanders from `[XPL] army:` lines
(`probeMilitary`, logged on change) and `autopilot units:` lines; promotions from `autopilot: PROMOTED [...]`; combats from
`CombatLog.csv` (its turn restarts each age). Russian names: Стойкость = Steadfast, Сомкнутый строй = Hold the Line,
Гарнизон = Garrison, Мобильность = Mobility (`BS\l10n\ru_RU_Text.xml:8728-8840`).

---

## 1. Experience (XP)

### 1.1 How a commander earns XP

| Fact | Mark | Source |
|---|---|---|
| Only commanders earn XP and promotions; "individual units no longer gain experience or promotions" | VERIFIED | Concepts:331 |
| XP comes when **units in its Command Radius engage in combat** ("Experience is gained by Commander as units engage in combat within their Command Radius") | VERIFIED (text) | Concepts:2113 |
| Attacking and defending both count ("engage in combat"); the commander need not fight; packed units cannot attack, so XP comes from deployed units | INFERRED from the text | Concepts:2113, 2173 |
| Base radius 1 (`ARMY_BASE_COMMAND_RADIUS=1`), max 5 (`ARMY_MAXIMUM_COMMAND_RADIUS=5`); only the Merit commendation (+1) and Friedrich change it in base data | VERIFIED | UI.log parameter line (§1.2); `BS\data\unit-promotions-gameeffects.xml:6` (`EFFECT_ARMY_ADJUST_COMMAND_RADIUS`) |
| Per-event bonuses exist by name: attacker bonus, ranged combat, melee ("NOT_COMBAT_RANGED") combat, kill bonus, city captured, dispersing an independent, a per-combat maximum | VERIFIED (names) | the exe's GlobalParameters name table, in this order: `…EXPERIENCE_BARB_SOFT_CAP, EXPERIENCE_CITY_CAPTURED, EXPERIENCE_COMBAT_ATTACKER_BONUS, EXPERIENCE_COMBAT_RANGED, EXPERIENCE_KILL_BONUS, EXPERIENCE_MAX_BARB_LEVEL, EXPERIENCE_MAX_LEVEL, EXPERIENCE_MAXIMUM_ONE_COMBAT, EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER, EXPERIENCE_NOT_COMBAT_RANGED, EXPERIENCE_PROMOTE_HEALED, EXPERIENCE_RETRAIN_HEALED, EXPERIENCE_DISPERSE_INDEPENDENT` (string scan of `G\Base\Binaries\Win64\Civ7_Win64_DX12_FinalRelease.exe` around file offset 0x22be000; the exe is protected, so the code using them could not be traced) |
| Pillaging can give commanders XP only with `ABILITY_PILLAGE_XP`, which no base or DLC data grants | VERIFIED (research/25 §1) | `BS\text\en_us` `LOC_ABILITY_PILLAGE_XP_DESCRIPTION`; grep of Base + DLC data |
| Focus Fire / Coordinated Attack: every joining unit fights, so one order is several combats in the radius | INFERRED (each is a separate `Combat` row in CombatLog; XP per row unverified) | CombatLog.csv, games 38/44/47 focused attacks |

### 1.2 The engine's values (they are not in any XML/SQL; read live from `GameInfo.GlobalParameters`)

Our `logCommanderParameters` (Our code `data\xpl-autopilot-units.js:3478-3484`) writes them once a session. Every game
30-47 printed the same line, e.g. `research\game47\evidence.zip` UI.log line 15:

| Parameter | Value | Meaning | Mark |
|---|---|---|---|
| `EXPERIENCE_COMBAT_ATTACKER_BONUS` | 1 | extra XP when our unit attacks | value VERIFIED, meaning INFERRED from the name |
| `EXPERIENCE_COMBAT_RANGED` | 1 | XP for a ranged combat | as above |
| `EXPERIENCE_KILL_BONUS` | 2 | extra XP for a kill | as above |
| `EXPERIENCE_CITY_CAPTURED` | **10** | XP for capturing a city (5-10 fights' worth) | as above |
| `EXPERIENCE_BARB_SOFT_CAP` | 1 | see §1.3 | value VERIFIED, meaning UNVERIFIED |
| `EXPERIENCE_MAX_BARB_LEVEL` | 2 | see §1.3 | value VERIFIED, meaning UNVERIFIED |
| `EXPERIENCE_MAX_LEVEL`, `EXPERIENCE_MAXIMUM_ONE_COMBAT`, `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER`, `EXPERIENCE_NOT_COMBAT_RANGED` (melee XP), `EXPERIENCE_PROMOTE_HEALED`, `EXPERIENCE_RETRAIN_HEALED`, `EXPERIENCE_DISPERSE_INDEPENDENT` | **unknown** | the line stops at `EXPERIENCE_MAX_LE`: **UI.log truncates every line at 1,022 characters** (the longest lines of game 47's UI.log are all exactly 1,022) | UNVERIFIED: fix the probe (§7, P-XP-1) |
| `ARMY_COMMANDER_MOVEMENT_MODIFIER` | 1 | +1 movement packed with combat units (Concepts:331) | VERIFIED |
| `ARMY_MAX_NUM_COMBAT_UNITS` / `_CIVILIAN_UNITS` / `_REINFORCE_UNITS` | 4 / 1 / 4 | capacity; reinforcements under way at once | VERIFIED value; matches Concepts:331, 1157 |
| `ARMY_MINIMUM_REINFORCEMENT_DISTANCE` | 6 | a reinforcement starts ≥ 6 tiles away | VERIFIED; Concepts:1157 |
| `ARMY_DEFAULT_REINFORCEMENT_SPEED` | 2 | unit unclear (Concepts:1160 says it travels at its base movement) | UNVERIFIED |
| `ARMY_DEFAULT_SPECIAL_ACTION_COUNT` | 1 | one army special action a turn ("No Army Special Actions remaining this turn", `BS\text\en_us\UnitCommandsText.xml:326`) | INFERRED |
| `ARMY_OVERRUN_RATIO` | 5 | Overrun needs ~5:1 odds (Concepts:331) | VERIFIED |
| `ARMY_FORCE_MARCH_MOVEMENT_BONUS` | 3 | no `UNITCOMMAND_FORCE_MARCH` row exists in `BS\data\unit-commands.xml` | VERIFIED (dead parameter) |
| `ARMY_ZONE_OF_CONTROL_RANGE`, `ARMY_ATTRITION_DAMAGE_PER_UNIT` | 3, 20 | not explained by any text | UNVERIFIED |
| `ARMY_PROMOTION_MOBILITY_MODIFIER`, `ARMY_PROMOTION_FIELD_COMMISSION_HEALING` | 1, 10 | Mobility's +1, Field Commission's heal | VERIFIED (PromoText:403, 460) |
| `COMMANDER_DEATH_DEFAULT_RESPAWN_TURNS` | 20 | respawn delay at Standard speed (§1.7) | VERIFIED |
| `COMMANDER_DEATH_DEFAULT_OFF_MAP_TRAINING_TURNS` | 5 | not explained | UNVERIFIED |
| `COMMANDER_DEATH_SURVIVAL_BASE_CHANCE`, `_MODIFIER_PER_PROMOTION` | 50, 10 | not explained; all 3 defeats of ours respawned (§1.7) | UNVERIFIED |

### 1.3 Independents: `EXPERIENCE_BARB_SOFT_CAP=1`, `EXPERIENCE_MAX_BARB_LEVEL=2`

- **What the names say** (INFERRED, Civ VI heritage): XP from barbarians (independents are the barbarians of this engine)
  is limited by the commander's level: up to level 2 normal, past it "soft-capped" to 1 XP a combat, or none.
- **What our logs show** (EVIDENCE, rough: combats of ours within reach of the commander's last logged tile; all opponents
  were independents, player ids ≥ 8; majors are 0-7 in `GameCore.log` "Current Civ/Leader State"):

  | Game | 1st promotion | 2nd | 3rd |
  |---|---|---|---|
  | 36 | A22 after ~1 combat | A24 after ~2 more (Coordinated Attack A24) | — |
  | 38 | A27 after ~1 | A35 after ~4 more | **E21 after ~25 more (24 vs independents, 1 vs a major)** |
  | 39 | A48 after ~1 | A50 after ~2 more (Focus Fire A49-A50) | — |
  | 47 | A27 after ~3 | A32 after ~3 more (Focus Fire A31-A32) | A58: **not XP**, the story "White Elephant" (`1013B`, `AQ\data\narrative-stories-gameeffects.xml:1779`, a free promotion to the nearest commander) was chosen in the same pass (UI.log lines 2570-2572) |
  | 44 (2nd commander, from Terracotta A51) | A53 | A54 (Focus Fires A53, A54) | — |

- **Reading:** the first two promotions come after only a handful of fights against independents; the third (game 38)
  took ~25. Both "independents pay little or nothing past level 2" and "each level costs much more"
  (`EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER`) fit this. **A commander did level past 2 on (almost) only independent
  fights**, so independents do not stop paying entirely at level 2 if "level 2" means one promotion. **UNVERIFIED:
  probe P-XP-2** (XP before and after each `Combat` event, with the opponent's type).
- **Per commander or per unit?** Units have no XP in this game (Concepts:331), so any cap can only apply to the
  commander's level (INFERRED).
- **Capturing a settlement** gives `EXPERIENCE_CITY_CAPTURED` 10 (value VERIFIED). An independent's village is not a city
  (root CLAUDE.md gotcha 27); dispersing one has its own `EXPERIENCE_DISPERSE_INDEPENDENT` (value unknown).

### 1.4 XP needed per level: unknown; the pace we actually get

- **Thresholds:** not in data (UI reads `unit.Experience.experiencePoints / experienceToNextLevel / getLevel`,
  `BS\ui\unit-promotion\model-unit-promotion.js:147-163`, `BS\ui\unit-actions\unit-actions.js:686-690`). **UNVERIFIED:
  P-XP-1.** A new commander is level 1 (`BS\ui\unlocks\model-unlocks.js:72` defaults `getLevel || 1`); advanced start makes
  level-3 and level-6 commanders (`EX\data\advanced-start.xml:6`, `MO\data\advanced-start.xml:28`).
- **Level 8 is a triumph.** Antiquity's military triumph "What a Gaius": "Have a Level 8 Commander"
  (`BS\text\en_us\LegaciesText.xml:217`; race variant "First to have a Level 8 Army Commander", :922). Its reward is the
  Exploration legacy card "Gain an Army Commander with 3 Promotions" (`LEGACY_AQ_MILITARISTIC_3`, LegaciesText.xml:214;
  card `CARD_AT_EX_MILITARISTIC_3`, `EX\data\age-transition.xml:219`, effect `CARD_MOD_AT_EX_MILITARISTIC_3` with
  `Levels 3`, `EX\data\age-transition-gameeffects.xml:566-571`). **EVIDENCE:** no player (AIs included) earned it in games
  30-47 (`Player_Legacies.csv` / `session-Player_Legacies.csv` list no `LEGACY_AQ_MILITARISTIC_3`).
- **Our pace (EVIDENCE, §6):** at most 3 promotions in a whole game (games 38, 47; one of game 47's was a story), usually
  1-2. **The AIs' pace** (`%LOCALAPPDATA%\…\Logs\AI_Commander_Promotions.csv`, game 47, read 21 October; overwritten by
  the next game): 23 picks over three ages, no commander above 2 promotions before its pick.

### 1.5 XP rate modifiers (`EFFECT_ARMY_ADJUST_EXPERIENCE_RATE`, all VERIFIED)

| Source | Bonus | Where to get it | Source |
|---|---|---|---|
| Terracotta Army (Antiquity wonder, also grants a commander) | +25% while active | civic Tactics; Grassland; Cost 375 | `AQ\data\constructibles-gameeffects.xml:458-475`; `AQ\data\constructibles.xml:168, 465`; `AQ\data\progression-trees-culture-common.xml:98`; text `AQ\text\en_us\ConstructibleText.xml:606` |
| City-state bonus `CITY_STATE_BONUS_ANTIQUITY_2` (Militaristic city-state) | +50% | suzerain of a militaristic city-state | `AQ\data\independents-gameeffects.xml:18`; `AQ\data\independents.xml:200, 248` |
| `CITY_STATE_BONUS_EXPLORATION_2` | +50% outside our homelands only (text says "double") | as above | `EX\data\independents-gameeffects.xml:18`; text `EX\text\en_us\IndependentsText.xml:513` |
| `CITY_STATE_BONUS_MODERN_2` | +50% (text says "double") | as above | `MO\data\independents-gameeffects.xml:18`; text `MO\text\en_us\IndependentsText.xml:439` |
| Policy Commissioned Officers (Exploration) | +30% XP **and +1 army/fleet movement** | civic Imperialism, depth 2 | `EX\data\traditions-gameeffects.xml:38-56`; `EX\data\progression-trees-culture-common.xml:98`; text `EX\text\en_us\CultureText.xml:193` |
| Tradition `TRADITION_EX_ATTRIBUTE_MILITARISTIC_01` | +25%, +25% more in Distant Lands | Exploration, Militaristic civs | `EX\data\traditions-tot-gameeffects.xml:47, 55` |
| Memento Art of War | +10% from turn 2; +40% inside a higher-level commander's radius | memento | `BS\data\mementos-gameeffects.xml:97, 108` |
| Trung Trac (leader) | +20% | leader | `BS\data\leaders-gameeffects.xml:804` |
| AI handicap | AI only | difficulty | `BS\data\difficulties.xml:132` |

### 1.6 Free promotions and levels (VERIFIED)

| Source | What | Source |
|---|---|---|
| Militaristic leader-attribute node 09 | +1 promotion to every commander, future ones too | `BS\data\progression-trees-common-gameeffects.xml:430`; node `BS\data\progression-trees-common.xml:325`; text `BS\text\en_us\AttributesText.xml:170` |
| Antiquity legacy `LEGACY_AQ_MILITARISTIC_4` (trigger: first to conquer a capital) | +1 promotion to all commanders, future ones too | `AQ\data\legacies-gameeffects.xml:101`; LegaciesText.xml:223, 226 |
| Modern card `CARD_AT_MO_MILITARISTIC_3`, earned by Exploration's triumph "Master & Commander" (trigger: a **level-8 Fleet** Commander) | +1 promotion to all commanders, future ones too | `MO\data\age-transition.xml:237`; `MO\data\age-transition-gameeffects.xml:548`; LegaciesText.xml:490-496 |
| Modern card `CARD_AT_MO_MILITARISTIC_2`, earned by "Pax Mongolica" (conquer and hold 8 homeland settlements) | a commander **with 4 military units**, one of each class | `MO\data\age-transition.xml:236`; `MO\data\age-transition-gameeffects.xml:544-547`; LegaciesText.xml:481-487 |
| Exploration card `CARD_AT_EX_MILITARISTIC_3` ("What a Gaius") | a commander with 3 promotions | §1.4 |
| Modern Military Academy | commanders trained in that city +1 promotion | `MO\data\constructibles-gameeffects.xml:456` |
| Persia: civ trait (Hamarana) | +1 promotion to army commanders | `AQ\data\civilizations-shared-gameeffects.xml:304` |
| Persia: Hazarapatis | starts with Initiative | `AQ\data\units-gameeffects.xml:68-71`; text `AQ\text\en_us\UnitText.xml:299` |
| Rome: tradition Cursus Honorum | Bulwark to army commanders | `AQ\data\traditions-tot-gameeffects.xml:1229-1238` |
| Friedrich | Merit commendation | `BS\data\leaders-gameeffects.xml:354` |
| Exploration golden age (Feudal Monarchy) | +1 promotion to the highest-level commander | `EX\data\golden-ages-gameeffects.xml:34` |
| Great people (Antiquity `GREATPERSON_COMMANDER_PROMOTION`; Modern `GREATPERSON_5_PROMOTIONS`) | promotions | `AQ\data\greatpeople-gameeffects.xml:123`; `MO\data\greatpeople-gameeffects.xml:26` |
| Narrative stories (e.g. `1013B`, `8094B` +XP, crises `AC004A`/`AC006A`) | a promotion or XP to the nearest/all commanders | `AQ\data\narrative-stories-gameeffects.xml:1779, 2356`; `AQ\data\narrative-crises-stories-gameeffects.xml:33, 49`; many more in EX/MO and DLC |

`EFFECT_GRANT_UNIT_PROMOTION` with `Amount` gives a promotion point to spend; with `UnitPromotionType` it grants that
promotion (INFERRED from the two argument shapes above). EVIDENCE: Persia's commanders (games 42, 45) took Mobility at
A9-A10, before any combat, i.e. the Hamarana point.

### 1.7 Age changes and defeat

- **Age change: XP and promotions are kept.**
  - VERIFIED: commanders are listed in `Unit_TransitionRetains` (`BS\data\units.xml:346-352`; Hazarapatis and Legatus
    `AQ\data\units.xml:391-399`; Noyan `EX\data\units.xml:490-494`; Mwami `MO\data\units.xml:550-552`); the transition
    script keeps them as live units (both modes read `player.Units.getUnitIds()`, not shadows:
    `BS\scripts\age-transition-post-load.js:1057-1087`, `1173-1236`); Concepts:331 "Commander units with suitable
    experience levels will advance from one Age to the next".
  - EVIDENCE: a promotion whose prerequisite was earned in the previous age: game 38 Garrison at E21 after Hold the Line
    at A35; game 34 Hold the Line at E11 after Steadfast at A49; game 37 Hold the Line at E58 after Steadfast at A62.
  - A unique commander becomes the next age's commander type: game 42's two Hazarapatis are `UNIT_ARMY_COMMANDER` from E1
    with the same army ids (`0;65536;29`, `0;131073;29`); game 38's commander is `UNIT_MWAMI` at M1 (EVIDENCE). Whether the
    Hazarapatis' free Initiative stays is UNVERIFIED (INFERRED yes: promotions belong to the unit).
  - Under Regroup (not our setting) each army commander is moved to the nearest settlement and **filled to its
    `combatUnitCapacity` with the nearest units, packed; those units survive** (script :1173-1236). Higher capacity
    (Regiments) saves more units there; under Continuity (the default and ours) every unit is kept anyway.
- **Defeat: respawn, promotions kept.**
  - VERIFIED: "Defeated Commanders respawn at the nearest Settlement after 20 turns on Standard Speed. They also respawn
    after Age transitions" (Concepts:331); notification `NOTIFICATION_COMMANDER_RESPAWNED` (`BS\data\notification.xml:124,
    168`; text `BS\text\en_us\NotificationText.xml:818`); Resilience −50% (`BS\data\unit-promotions-gameeffects.xml:538`).
  - EVIDENCE (Online speed, `GAMESPEED_ONLINE` `CostMultiplier` 50, `BS\data\game-speeds.xml:42-45`): **off the map about
    9-10 turns**, as `-9999,-9999 onMap=false` in the `army:` line:
    - game 31: killed A49 by a Quadrireme (CombatLog: 34, 47, then 77 damage on 19 health), back A58-A59; it then earned
      Hold the Line at A69, whose prerequisite Steadfast came at A35: **promotions survive a defeat**;
    - game 32: killed E27 by a Cog after six ship shots over E24-E27 at its post (4,19), back E37;
    - game 45: the Hazarapatis killed A23 by a Warrior (31, 25, 46 damage), back A32-A33.
  - Whether its XP toward the next level is kept is UNVERIFIED (INFERRED yes: the same unit id, a −9999 location while
    away, as `BS\ui\commander-interact\model-commander-interact.js:114-116` expects).
  - **A lone commander is weak:** DefStr 10 in Antiquity (games 31, 45), 30 in Exploration (game 32), 40-45 in Modern
    (game 31's M11-M14 Line Infantry hits) in CombatLog. Only Old Guard (+10 defending) raises it
    (`BS\data\unit-promotions-gameeffects.xml:542`).

---

## 2. The five army trees and the commendations

All rows: `BS\data\unit-promotions.xml:323-371` (tree and prerequisites), `:579-639` (promotion → modifier),
`BS\data\unit-promotions-gameeffects.xml` (effects, lines below), PromoText (wording). Nodes with two prerequisite rows
are reachable from either parent (INFERRED: the UI draws both edges; our code asks `exp.canEarnPromotion`). Every tree's
end node has `GrantsCommendation="true"`; Leadership's two end nodes also `GrantCommendationWithAnyPrereq="true"` (schema
`G\Base\Assets\schema\gameplay\01_GameplaySchema.sql:4346-4347`). Whether the other trees' end node needs **both**
parents for its commendation is UNVERIFIED (none of our commanders reached an end node). Shortest way to an end node:
root → 2nd → 3rd → end = **4 promotions**.

### Maneuver (Маневр) — the fast general

| Node | After | Effect | Data |
|---|---|---|---|
| **Mobility** (root) | — | "+1 Movement while on land and ignores Terrain movement restrictions when packed" (PromoText:403). Data: `EFFECT_ARMY_ADJUST_MOVEMENT_RATE` +1 (:450), and while the army has units, ignores `TERRAIN_HILL, RIVER_MINOR` (`IgnoreAll` true, :454-460) | promotions.xml:354 |
| Harassment | Mobility | land units in radius +2 flanking when attacking (:462) | :355 |
| Redeploy | Mobility | enemy land units in radius −2 flanking when attacking ours (:472-484) | :356 |
| **Amphibious** | Harassment or Redeploy | land units in radius: no embarked-attack penalty, 1 Movement to embark/disembark (PromoText:417; `ABILITY_AMPHIBIOUS`, :486) | :357-358 |
| **Pathfinder** | Harassment or Redeploy | land units in radius ignore terrain movement costs (PromoText:430; `ABILITY_ARMY_PATHFINDER` → `MOD_ABILITY_IGNORE_TERRAIN`, :156; promotions.xml:820) | :359-360 |
| Area Denial (commendation) | Amphibious or Pathfinder | the radius exerts Zone of Control on enemy land units (:506) | :361-362 |

### Logistics (Логист) — the big army

| Node | After | Effect | Data |
|---|---|---|---|
| **Quartermaster** (root) | — | +1 Gold per land unit packed in this commander (:362; PromoText:311) | :345 |
| **Recruitment** (root) | — | +15% production toward land units in the city it stands in (centre or urban district) (:373-385; PromoText:318) | :346 |
| **Regiments** | Quartermaster **or** Recruitment | **+2 unit slots** (`EFFECT_ARMY_ADJUST_UNIT_CAPACITY`, :386) and +1 reinforcement speed (:395); the only land-army capacity modifier in Base + DLC | :347-348 |
| Field Medic | Regiments | +5 healing in neutral/enemy land (:407-420) | :349 |
| Looting | Regiments | +50% pillage yields (:421-436) | :350 |
| Survival Training (commendation) | Field Medic or Looting | Commando: terrain combat bonuses doubled, infantry through cliffs (:437) | :351-352 |

### Assault (Штурм) — move after unpacking

| Node | After | Effect | Data |
|---|---|---|---|
| **Initiative** (root) | — | "Units can move after unpacking from this Commander" (PromoText:224): the commander gets `ABILITY_MOVE_AFTER_UNPACKING` (`MOD_PROMOTION_MOVE_AFTER_UNPACKING`, :130; ability row promotions.xml:734). Persia's Hazarapatis starts with it | promotions.xml:337, 611 |
| Rout | Initiative | infantry in radius +2 attacking (:267-283) | :338 |
| Storm | Initiative | land ranged in radius +2 attacking (:284-304) | :339 |
| Shock Tactics | Rout | cavalry +3 attacking (:305-321) | :340 |
| Enfilade | Storm | siege +3 attacking (:322-341) | :341 |
| Advancement (commendation) | Shock Tactics or Enfilade | infantry and cavalry +5 at full health, attacking or defending (:342-360) | :342-343 |

### Bastion (Оплот) and Leadership (Лидер) — the defender (our current order)

- Bastion: Steadfast (+2 defending, :169-187) → Bulwark (fortify 1 turn faster, :188-205) / Hold the Line (+2 on a district,
  :206-222) → Defilade (+3 fortified defending, :223-242) / Garrison (+10 HP to fortified districts while on the centre,
  :243-249) → Resolute (heal 5 after attacking, :250-265). Prerequisites promotions.xml:329-335.
- Leadership: Zeal (+5% yields but Happiness where stationed, :520) → Field Commission (upgrade outside friendly territory,
  :528) → Old Guard (+10 to itself defending, :542) / Resilience (respawn −50%, :538) → Barrage / Onslaught (+5 in Focus
  Fire / Coordinated Attack, :552-590). Prerequisites promotions.xml:364-371.

### Commendations (one per finished tree; spent with the same `UNITCOMMAND_PROMOTE`)

| Commendation | Effect | Data |
|---|---|---|
| Service | +1 Movement for land units in the radius (PromoText:40) | gameeffects :21-34 |
| Merit | +1 command radius (PromoText:59) | :6-9 |
| Order | +5 combat strength for land units in the radius, always (PromoText:63) | :35-49 |
| Valor | Second Wind: a land unit in the radius +1 attack, +2 Movement; 5-turn recharge | :54-56; `BS\data\units.xml:309, 336` |
| Duty | Heroic Assault: direct damage (`DamageAmount` 40, +30 with Duty) to a unit in the radius; 4-turn recharge | :11-16; `BS\data\units.xml:261, 310, 337` |

### The fastest "fast, big, moves after unpacking" general

Needed: **Mobility (1) + Initiative (1) + a Logistics root (1) + Regiments (1) = 4 promotions** (3 for a Hazarapatis).
Order by what each buys the role:
1. **Mobility** first (level 2): packed army 2 → 3 (packed) → **4**, hills and minor rivers ignored while packed.
2. **Initiative** (level 3): units unpacked from it keep their moves (INFERRED: they can step to attack positions the same
   turn; whether they can also *attack* that turn is probe P-A5, still unanswered).
3. **Quartermaster** (level 4): +1 gold per packed unit; or **Recruitment** if it parks in our best unit-training city.
4. **Regiments** (level 5): 4 → **6** combat units.
5. Then Maneuver's Pathfinder line (Harassment or Redeploy → Pathfinder → Area Denial, levels 6-8) for its first
   commendation (Service: +1 movement to units in its radius, or Merit: radius 2).

At our observed pace (§1.4: 1-3 promotions a game) a combat-only general would not finish step 4 in one game; it needs
the free promotions of §1.6 and more fights per turn in its radius (§7).

---

## 3. Getting more commanders

| Fact | Mark | Source |
|---|---|---|
| Unlock: Antiquity civic **Discipline** (`NODE_CIVIC_AQ_MAIN_DISCIPLINE`, cost 125) unlocks `UNIT_ARMY_COMMANDER` (or the Hazarapatis / Legatus) **and gives one free in the capital** (`MOD_DISCIPLINE_FREE_COMMANDER`, `AllowUniqueOverride`) | VERIFIED | `AQ\data\progression-trees-culture-common.xml:44, 78-81`; `AQ\data\progression-trees-culture-common-gameeffects.xml:10-15` |
| No Exploration or Modern node unlocks `UNIT_ARMY_COMMANDER` (fleet: Astronomy; squadron: Flight; carrier: Mobilization) | VERIFIED (grep) | `EX\data\progression-trees-tech.xml:69`; `MO\data\progression-trees-tech.xml:128, 155` |
| So in later ages it is trainable from the start | INFERRED (AIs train them early in Exploration/Modern queues; not checked by turn) | CityBuildQueue.csv |
| **Cost:** 100 production at Standard, `CostProgressionModel=COST_PROGRESSION_PREVIOUS_COPIES`, `CostProgressionParam1=200` | VERIFIED | `BS\data\units.xml:80, 375` |
| **Observed at Online speed:** AI army commanders cost **150, 250, 350, 450, 550** production, fleet commanders 60, 180, 300, 420; one AI's at 50 | EVIDENCE | `CityBuildQueue.csv` "Production Needed", games 30-47 (e.g. game 30 player 2: 250-550) |
| = (100 + 200 × commanders already owned) × 50%: the free Discipline commander makes the first trained one 150 at Online (300 Standard); each further one +100 (+200) | INFERRED from the two rows above and `GAMESPEED_ONLINE` `CostMultiplier` 50 (`BS\data\game-speeds.xml:42-45`) | |
| Live price: `city.Production.getUnitProductionCost(type)`, gold `city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, type)` (as the game's lists read them) | VERIFIED | `BS\ui\production-chooser\panel-production-tooltips.js:196`; `production-chooser-helpers.js:675` |
| Purchasable with gold (`Units.CanPurchase` default 1); AIs bought 17 army commanders in games 33-43 (`LOC_UNIT_ARMY_COMMANDER_NAME` rows), we none | VERIFIED / EVIDENCE | schema `01_GameplaySchema.sql` (Units); `CityPurchase.csv` games 33-43 |
| **No cap** on the number: no `MaxPlayerInstances`-type limit in the row; only the rising price | VERIFIED (absence) | `BS\data\units.xml:80` |
| Upkeep: the row sets no `Maintenance` (schema default 0); real gold upkeep not checked | UNVERIFIED | `BS\data\units.xml:80` |
| Tradition `TRADITION_AQ_ATTRIBUTE_MILITARISTIC_01`: +25% production toward commanders, gold for packed units | VERIFIED | `AQ\data\traditions-tot-gameeffects.xml:38-60` |
| Free commanders: Discipline; **Terracotta Army** (+1 when built, +25% XP; unlocked by civic Tactics; Grassland; 375); Exploration card "What a Gaius" (3 promotions); Modern card (with 4 units); goody hut "survivors" | VERIFIED | above; `AQ\data\goody-huts.xml:360-367` |
| **Having 3 army commanders in Exploration unlocks Prussia** for Modern | VERIFIED | `BS\data\unlocks.xml:499, 737-738, 909-910, 1041` |
| A commander standing on a centre cuts that settlement's unhappiness 10%, +10% per promotion | VERIFIED (text) | Concepts:552 |

**Unique commanders** (all `ReplacesUnitType="UNIT_ARMY_COMMANDER"`, same cost and progression):

| Unit | Civ, age | Special | Source |
|---|---|---|---|
| Hazarapatis | Persia, Antiquity | starts with Initiative | `AQ\data\units.xml:162, 298, 383`; `AQ\data\units-gameeffects.xml:68` |
| Legatus | Rome, Antiquity | a town-founding charge every 3 promotions | `AQ\data\units.xml:164, 385`; `AQ\data\units-gameeffects.xml:192`; `AQ\text\en_us\UnitText.xml:336` |
| **Noyan** | Mongolia, Exploration | **BaseMoves 4, mounted, sight 4**; cavalry in radius +50% flanking | `EX\data\units.xml:203, 398, 483`; `EX\data\units-gameeffects.xml:165-174` |
| Mwami | Buganda, Modern | +100% pillage yields and healing in radius | `MO\data\units.xml:241, 447, 546`; `MO\text\en_us\UnitText.xml:264` |
| Trung Nhi | Trung Trac (DLC) | its own discipline; leader +20% XP, faster respawn | `G\DLC\trung-nhi\modules\data\units.xml`; `BS\data\leaders-gameeffects.xml:788, 804` |

---

## 4. Army mechanics: the requests and their rules

**The requests, exactly as the game's UI sends them** (VERIFIED; research/37-notes/armies.md §2-3 has more):

| Action | Sent on | canStart → send | Source |
|---|---|---|---|
| `UNITCOMMAND_PACK_ARMY` "Gather adjacent Units to form up on the Commander" | the commander | `canStart(id, …, {X:-9999, Y:-9999, UnitAbilityType:-1}, false)`, sent with the same −9999 args (no target, no member list) | `BS\ui\army-panel\army-panel.js:450, 512-560, 571`; `BS\text\en_us\UnitCommandsText.xml:58-59` |
| `UNITCOMMAND_UNPACK_ARMY` "Deploy stacked Units into adjacent tiles" | the commander | `canStart(…, {}, false)` → `Plots` (plot indices) → send `{X, Y}` of one; the engine places the members (P-A2) | `BS\ui\interface-modes\interface-mode-unpack-army.js:11, 47`; UnitCommandsText.xml:70-71 |
| `UNITCOMMAND_ADD_TO_ARMY` | the soldier, next to the commander | `{}` → `Plots` (the commander's tile) → `{X, Y}` | `interface-mode-add-to-army.js:11, 47` |
| `UNITCOMMAND_REMOVE_FROM_ARMY` "Leave Commander" | one packed member | `{}` → `Plots` → `{X, Y}` (a one-unit deploy) | `interface-mode-remove-from-army.js:11, 48` |
| `UNITOPERATION_REINFORCE_ARMY` | the soldier (`Game.UnitOperations`) | `{}` → `Plots` (eligible commanders' tiles) → `{X, Y}` | `interface-mode-reinforce-army.js:11, 48` |
| `UNITCOMMAND_ARMY_OVERRUN` | the packed commander | target `{X, Y}`; ~5:1 odds | `BS\data\unit-commands.xml:58`; Concepts:331 |
| `UNITCOMMAND_PROMOTE` | the commander | `{PromotionType: hash, PromotionDisciplineType: hash}` | `BS\ui\unit-promotion\panel-unit-promotion.js:685-700` (research/25 §3) |
| `UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED / _MELEE`, `_DEFENSIVE_PERIMETER`, `_UPGRADE_ARMY`, `_GRANT_SECOND_WIND`, `_COMMANDER_ATTACK` | the commander | as research/25 §3 | `BS\data\unit-commands.xml:74-88` |

**Rules** (failure texts VERIFIED in `BS\text\en_us\UnitCommandsText.xml`; which command raises which is the engine's):
- **No re-adding the turn a unit deployed:** "Units cannot be added to an army on the same turn they have unpacked"
  (:371-372).
- **No assembling inside an enemy army's Zone of Control** (:341): pack before contact.
- **Capacity** "Nearby Army at full capacity" (:314), `…FAILURE_MAX_COMBAT_UNITS` (:335); 4 combat + 1 civilian
  (§1.2), +2 with Regiments.
- **Deploy space:** "No available location to move" (:317); Bermuda-type features (`Features.PreventUnpack`) prevent it.
- **Moves:** `LOC_UNITCOMMAND_REQUIRES_FULL_MOVEMENT` (:329) and `…NO_MOVES_REMAINING` (:332) exist; which army
  commands need full movement is UNVERIFIED (P-A6 logs it on failure).
- **PACK gathers every adjacent unit** (no member list), garrisons included: use ADD_TO_ARMY per unit for a chosen army
  (VERIFIED from the request shape).
- **Packed units cannot attack** until deployed (Concepts:2173; "You must deploy your troops in order to attack",
  `BS\text\en_us\NotificationText.xml:808-812`), except Overrun. A packed army defends as one unit and unpacks when badly
  hurt (Concepts:1147); "Armies must Deploy when they get attacked by enemies with sufficient strength" (Concepts:331).
- **Initiative exactly:** the commander carries `ABILITY_MOVE_AFTER_UNPACKING`, "Units can move after unpacking from this
  Commander" (PromoText:224, 1141). So without it deployed units very likely have no moves left that turn (INFERRED);
  whether they may attack in place is UNVERIFIED (P-A5). The commander itself is not mentioned.
- **Reinforcement:** full movement, undamaged, ≥ 6 tiles away, in friendly territory, ≤ 4 under way per commander; not to
  an embarked army, not across open ocean; travels at base movement ignoring terrain; joins **packed** if there is room,
  else appears nearby (Concepts:1157, 1160).

**How a packed army moves** (VERIFIED unless marked):
- It moves as one unit on the commander's movement (Concepts:1147): **base 2, +1 packed with combat units**
  (`ARMY_COMMANDER_MOVEMENT_MODIFIER`; Concepts:331), **+1 Mobility**, **+1 Commissioned Officers** (Exploration policy),
  **+1 Materiel** (Modern policy, civic Militarism; `MO\data\traditions-gameeffects.xml:104-112`,
  `MO\data\progression-trees-culture-common.xml:121`, text `MO\text\en_us\CultureText.xml:310`). A Mobility general
  packs at 4, 5 with the age's policy; a Noyan starts at 4 (+1 packed, INFERRED).
- The packed members' own speed does not matter (INFERRED from "moves as a single entity").
- **Water:** armies can embark (Concepts:1157 forbids reinforcing an *embarked Army*); fleets "can escort packed Armies
  across bodies of water" (Concepts:1183). Amphibious makes embarking cost 1 movement for units in the radius. A packed
  army's embark rules are otherwise UNVERIFIED.
- Zone of Control: entering it ends movement (Concepts:2161); army commanders exert ZoC (`ZoneOfControl="true"`,
  `BS\data\units.xml:80`).

---

## 5. What our code does with commanders today

All in `mod\expansion-planner\ui\data\xpl-autopilot-units.js` unless noted.

| Function | What it does | Lines |
|---|---|---|
| `promoteUnits` | Each pass, each unit with `canPromote`: the first earnable option in `PROMOTION_PREFERENCE` (Steadfast, Hold the Line, Garrison, Resolute, Zeal, Field Commission, Old Guard, Barrage, Bulwark, Defilade, Resilience, Onslaught, Initiative, Storm, Rout, Shock Tactics, Enfilade, Advancement, Recruitment, Quartermaster, Regiments, Field Medic, Looting, Survival Training, Mobility, Redeploy, Harassment, Pathfinder, Amphibious, Area Denial; commendations Order, Merit, Service, Valor, Duty, after promotions); `canEarnPromotion` + `canStart(PROMOTE)`; one a unit a pass. A commander that leads a campaign or has a mobile promotion gets `MOBILE_PROMOTIONS` first | 2786-2843 |
| `commanderProfile`, `MOBILE_PROMOTIONS`, `DEFENSIVE_PROMOTIONS` (core) | MOBILE = Initiative, Mobility, Quartermaster, Regiments, Rout, Storm; **DEFENSIVE as soon as any Bastion promotion is held** | `core\xpl-campaign.js:99-116` |
| `armyInventory` | each land commander on the map: `Armies.get(armyId)`, capacity, packed members (off the map, same `armyId`), reinforcements under way | 2424-2438 |
| `unpackArmies` | an army with packed soldiers within GUARD_RADIUS of a threatened settlement or a front: `UNPACK_ARMY` toward the raiders | 2446-2482 |
| `reinforcementFor`, `reinforceArmy` | a far, idle, unhurt soldier reinforces our commander's army at a threatened settlement when it beats walking by 2+ turns | 2491-2538 |
| `deployMember` | one packed member leaves the army (`REMOVE_FROM_ARMY`) to be an exposed town's holder | 2547-2563 |
| `joinArmy` | only a stacking fallback in `stepAside`: a boxed-in soldier joins the commander's army on its tile | 1604-1616 (called 1551) |
| `commanderPost`, `postCommander` | the post: the most threatened settlement's centre it reaches within 6 turns, else an unhappy centre within 4 turns (3 points unhappier), else stay on / go to the nearest centre; the way never next to hostiles; at a threatened post `formCommander` picks the tile covering the most soldiers | 3409-3473; 2683 |
| `commanderAttacks` (from `strikeRaiders`) | Focus Fire with ≥ 2 ranged units that can hit the target; Coordinated Attack with ≥ 2 healthy melee next to it, never into a district, never a target stronger than our best + 2; else Heroic Assault on a raider 50+ hurt; else Defensive Perimeter with raiders within 2 | 3497-3590; 4587-4595 |
| `commanderSpecial` | Legatus founds a town with its charge (with «Поселенцы», in peace); Genghis's commander converts independents | 4925-4955 |
| `logCommanderParameters`, `probeMilitary` | the parameter line (truncated, §1.2); `army:` lines | 3478-3484; 4461-4473 |
| campaigns (`startCampaign`, `moveCampaign`, `campaignAssault`) | behind «Наступление» (off by default); a commander leads a recapture | root CLAUDE.md gotcha 71; `core\xpl-campaign.js` |

**Gaps against the user's goal:**
1. **We never train or buy a commander** (no commander in our `CityBuildQueue.csv` or `CityPurchase.csv` rows, games
   30-47; no commander in `unitsWanted` / steps: grep of `data\xpl-autopilot-steps.js` finds commanders only skipped). A
   second commander came only from the Terracotta Army (games 42 A44, 44 A51).
2. **Armies stay empty:** every `army:` line of games 30-47 reads `unitCount 0 capacity 4`; nothing ever packs
   (`UNITCOMMAND_PACK_ARMY` and `ADD_TO_ARMY` are never sent on purpose; `unpackArmies` / `reinforceArmy` never fired: no
   `ARMY_UNPACKED`, `REINFORCE_ARMY` or `reinforce:` line in any evidence log).
3. **No role per commander:** both commanders get the defensive order (the profile turns DEFENSIVE at the first Bastion
   promotion), so a "fast general" never forms unless it leads a campaign first, or is a Hazarapatis (Initiative →
   MOBILE: games 42, 45 took Mobility).
4. **XP is incidental:** the commander stands on a threatened centre; XP comes only when raiders happen to fight there.
   Nothing walks a commander to where our soldiers fight (strikes on raiders, dispersing villages, befriending
   failures), nor counts its radius when choosing which soldier strikes.
5. **The commander is exposed at its post:** game 32's stood at 4,19 while a Privateer and a Cog shot it six times
   (E24-E27) until it died; `postCommander` checks only its way, and `formCommander` avoids tiles next to *land* raiders.
6. **XP values unknown** (truncated log line) and no XP probe: we cannot plan "levels per turn".
7. Free promotion sources are not valued: the Militaristic attribute node 09 (all commanders +1), the Terracotta Army's
   +25% (it is S-tier in `core\xpl-wonder-tiers.js:18` for its commander), Commissioned Officers / Materiel (movement +
   XP), the White Elephant-type stories.

---

## 6. Evidence per game (games 30-47)

Commanders: distinct `army:` ids; promotions: `autopilot: PROMOTED` with turn; focused: Focus Fire (FF) / Coordinated
Attack (CA) / Defensive Perimeter (DP) orders; capacity/unitCount always `4/0`.

| Game | Land commanders | Promotions (turn) | Focused / other | Defeats |
|---|---|---|---|---|
| 30 | 1 (A17-M57) | Steadfast A60 | — | — |
| 31 | 1 | Steadfast A35, Hold the Line A69 | — | A49 (Quadrireme), back A58 |
| 32 | 1 | none | — | E27 (Cog), back E37 |
| 33 | 1 | Steadfast M44 | — | — |
| 34 | 1 | Steadfast A49, Hold the Line E11 | CA E9, E10 | — |
| 35 | 1 | Steadfast A27 | — | — |
| 36 | 1 | Steadfast A22, Hold the Line A24 | CA A24, A27, A29, A30, A48 | — |
| 37 | 1 | Steadfast A62, Hold the Line E58 | — | — |
| 38 | 1 (Mwami at M1) | Steadfast A27, Hold the Line A35, Garrison E21 | FF A36-A39 ×4; CA A64, E22, E25 | — |
| 39 | 1 | Steadfast A48, Hold the Line A50 | FF A49-A51 ×3 | — |
| 40 | 1 | none logged | — | — |
| 41 | 1 (Legatus in Antiquity) | none | — | — |
| 42 | **2** (Hazarapatis; 2nd from Terracotta A44) | Mobility A9 (Hamarana point), Mobility A43/44 | DP A34, A46 | — |
| 43 | 1 | none | DP A19-A20, A48-A50 | — |
| 44 | **2** (2nd from Terracotta A51) | #1 Steadfast A29, Hold the Line A42; #2 Steadfast A53, Hold the Line A54 | FF A53, A54, A56, A59; DP E26-E29 | — |
| 45 | 1 (Hazarapatis) | Mobility A10 | DP A49, E45, E50 | A23 (Warrior), back A32 |
| 46 | 1 | Steadfast A33 | DP A26-A32 | — |
| 47 | 1 | Steadfast A27, Hold the Line A32, Garrison A58 (story 1013B) | FF A31, A32, A36-A38; DP A58-A60 | — |

Sources: each game's `UI.log` in `research\game<N>\evidence.zip` (game 44 also `evidence-e20-m34.zip`); defeats from
`CombatLog.csv` (our commander as defender) and the `-9999,-9999 onMap=false` `army:` lines; Terracotta from
`CityBuildQueue.csv` (game 42 T44 `WONDER_TERRACOTTA_ARMY 229.4/187`, game 44 T51 `196.0/187`).

Totals: 18 games, 20 land commanders, **27 promotions**, at least 4 of them not from XP (very likely three Persian
Hamarana points in games 42 and 45, one story in game 47); the best commander ever held 3 promotions; no commendation
ever; no army ever packed. `research\game37-hof\evidence.zip` repeats game 35's CSVs and is left out.

---

## 7. Design implications for a "two generals" plan

**What the plan can rely on (VERIFIED):**
- **Getting the second general is cheap and early:** the Discipline commander is free; a second one costs 150 production at
  Online (300 Standard), or gold, or comes free with the Terracotta Army (+25% XP while it stands). There is no cap; each
  further one costs +100 (+200). Three in Exploration also unlock Prussia.
- **Commanders are permanent investments:** promotions survive defeats (respawn in ~10 turns at Online) and age changes;
  unique ones turn into the next age's commander.
- **The mobile build is 4 promotions** (Mobility, Initiative, Quartermaster or Recruitment, Regiments; 3 for a
  Hazarapatis): packed speed 4 (5 with Commissioned Officers or Materiel), 6 slots, units move after deploying. The
  Maneuver tree then leads to the first commendation at 8 promotions.
- **Free promotions stack** on top of XP: the Militaristic attribute node 09, the Military Academy, stories like White
  Elephant, Persia's trait; the legacy cards need military triumphs a defensive game rarely earns (a level-8 army or
  fleet commander, conquests). A plan should value the reachable ones explicitly.
- **City captures pay 10 XP**, kills +2, attacking +1 (values VERIFIED, meanings INFERRED); focused attacks multiply the
  combats a commander sees in one turn.

**Risks:**
- **XP pace is the binding constraint.** Our best commander ever reached 3 promotions; no player in 18 games reached the
  level-8 triumph. Independents give the first 1-2 promotions in a few fights, then (EVIDENCE, game 38) ~25 fights for the
  next. A general fed only by independents will likely stall around level 3-4 unless free promotions or a real war (no
  barbarian cap; city captures +10) add more. UNVERIFIED until P-XP-1/2 run.
- **Commanders die easily alone** (DefStr 10-45): 3 of 18 games lost one for ~10 turns at a post. Keep it behind or
  sharing a tile with a soldier, out of ship range at sea-facing posts; Old Guard is the only self-defence.
- **Packing has traps:** PACK takes all adjacent units (garrisons too), packing fails in an enemy army's ZoC, a deployed
  unit cannot rejoin that turn, packed units cannot attack, and without Initiative deployed units likely cannot move.
- **Two roles compete for promotions:** today the first Bastion pick locks a commander DEFENSIVE; the plan must assign the
  mobile role before its first promotion.
- **War costs:** a war on a weaker neighbour is outside today's defensive decision (root CLAUDE.md gotcha 71: no war of our
  own); fighting independents we cannot befriend is within it (they are at war with us already).

**Probes to add first (UI.log):**
- **P-XP-1:** the parameter line split into short lines (UI.log cuts at 1,022 characters), so `EXPERIENCE_MAX_LEVEL`,
  `EXPERIENCE_NOT_COMBAT_RANGED`, `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER`, `EXPERIENCE_DISPERSE_INDEPENDENT`,
  `EXPERIENCE_MAXIMUM_ONE_COMBAT` become known; plus `COMBAT_FOCUSED_ATTACK_BASE_BONUS` and `UNIT_PURCHASE_MULTIPLIER`
  (same exe table, not matched by today's `EXPERIENCE_|ARMY_|COMMANDER_` filter).
- **P-XP-2:** each commander's `getLevel`, `experiencePoints`, `experienceToNextLevel` once a turn and on
  `UnitExperienceChanged`, and the XP change across each `Combat` event in its radius with the opponent's owner
  (independent or major), attacker or defender, ranged or melee, kill or not. Settles the per-combat XP, the thresholds
  and the independents' cap.
- **P-A5** (from research/37): moves and attacks of members right after an unpack, with and without Initiative.
- **P-DEATH-1:** on a commander's defeat, its XP and promotions before and after the respawn, and the respawn turns.

Sources consulted on the web: the official combat dev diary
(https://civilization.2k.com/civ-vii/game-guide/dev-diary/combat/) only restates that commanders alone gain XP from
nearby battles and keep it across ages; no published XP thresholds were found.
