# Wars for commander experience: independents vs a weak major (research/41 notes, 21 October 2026)

Question (the user): give our army commanders experience each game "without losing too much on war", by fighting
independents we cannot befriend or (opt-in, a new checkbox) a war on one close nation much weaker than us, without slowing
our victory much. Read-only research: nothing under `mod/` or `tests/` was changed. Siblings in this folder:
`commanders.md` (XP and promotions in depth), `politics.md` (Influence levers for a war); this note answers the rules of
independents, war and peace, the reads for "much weaker", the costs, and what our games' wars looked like.

**Paths.** `G\` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\`; `TXT\` =
`G\base-standard\text\en_us\`; `UI\` = `G\base-standard\ui\`; `EXE` = `...\Base\Binaries\Win64\Civ7_Win64_DX12_FinalRelease.exe`
(byte offsets of its string tables); `U\` = `mod\expansion-planner\ui\`; `E38`, `E43` = `research\game38\evidence.zip`,
`research\game43\evidence.zip` (`DiplomacySummary.csv` = DS, `CombatLog.csv` = CL, `Player_Stats.csv` = PS). Costs are written
Antiquity / Exploration / Modern. Text line numbers are the `<Text>` line (or its `<Row Tag>` line).

**Marks.** No mark = verified in the game's data, UI code or our code. **[evidence]** = seen in our logs. **[inferred]** =
follows from the above, not seen directly. **[unverified]** = open; a probe is named in §6.

---

## 1. Independents

### 1.1 Can our units attack and remove a village or encampment?
- **The village itself is not a combat target.** A village is an improvement (`IMPROVEMENT_VILLAGE` / `IMPROVEMENT_ENCAMPMENT`,
  root CLAUDE.md gotcha 27), not a district: no `Unit vs Location` row against a village in CL of games 38 and 43 (only city
  centres and urban districts) **[evidence]**. Its units defend it.
- **Dispersing:** a military unit standing on the village uses `UNITOPERATION_DISPERSE_INDEPENDENT` (no target), even with no
  moves left: "move any Military Unit on it and select Disperse ... you can use this action even when the unit has no
  movement left!" (`TXT\AdvisorText.xml:879`); "This requires sending a Military Unit onto the Independent Power's village,
  which usually means defeating their military" (`TXT\AdvisorText.xml:872`). The unit panel lists it (`UI\unit-actions\unit-actions.js:1484`).
- **Villages are often empty:** `Independents.csv` "No Defender at camp" 242 rows in game 38, 195 in game 43 **[evidence]**
  (their units leave on raids). Defenders per village 1 / 3 / 4 (`G\base-standard\data\Independents.xml:18`;
  `G\age-exploration\data\independents.xml:126-127`; `G\age-modern\data\independents.xml:122-123`), up to 5 combat units
  (`Independents.xml:19`), one new unit every `UnitBuildTime` 8 turns by default (`Base\Assets\schema\gameplay\01_GameplaySchema.sql:2426`).
- **A neutral independent can be attacked only after declaring war on it.** The game's diplomacy screen offers "Declare War"
  on an independent and sends the same `DECLARE_WAR` operation with `Type: DIPLOMACY_ACTION_DECLARE_WAR` after a confirm
  dialog (`UI\diplomacy\diplomacy-manager.js:701-720, 769-783`; from the map: `:811-841`, text "This action will start
  hostilities with the Independent Power of X" `TXT\DiplomacyText.xml:2155`). "If players attack a Minor Independent, they
  become Hostile" (`TXT\Civilopedia_Concepts_Text.xml:79`). Attacking a **city-state** declares war on its suzerain
  (`Civilopedia_Concepts_Text.xml:2089`; `diplomacy-manager.js:842-879`), with `GRIEVANCE_FROM_ATTACK_CITY_STATE` −30
  (`G\base-standard\data\diplomacy-actions.xml:847`).

### 1.2 What dispersing gives and costs
| Effect | Value | Source |
|---|---|---|
| One-time yield of the village's type | 100 (Diplomatic: 30 Influence) of culture / gold / production / science / food | `Independents.xml:4-9` (`DisperseRewardAmount`); notice "You have received {reward} {yield}" `TXT\NotificationText.xml:553-554` |
| A gold parameter | `INDEPENDENT_GOLD_FOR_DISPERSAL` 400 / 600 in Exploration / Modern (Antiquity's base value is compiled in) | `G\age-exploration\data\independents.xml:120-121`, `G\age-modern\data\independents.xml:116-117`; how it is paid **[unverified]** |
| Commander XP | `EXPERIENCE_DISPERSE_INDEPENDENT` exists; its value is past the 1,022-character cut of our parameter log line **[unverified]** | `commanders.md` §1.1; `U\data\xpl-autopilot-units.js:3478-3484` |
| Relationship with majors near it | +10 with each leader within 10 tiles ("You Dispersed a hostile Independent near them") | `diplomacy-actions.xml:835` (`FAVOR_FROM_DISPERSE_IP Amount 10 Range 10`); `TXT\DiplomacyText.xml:740-744` |
| Relationship with a leader befriending it | −30, and that leader gets 60 / 120 / 180 Influence (`InfAward`) | `G\age-antiquity\data\diplomacy-actions.xml:164`, `G\age-exploration\...:218`, `G\age-modern\...:195`; `DiplomacyText.xml:824-828` |
| Agenda | Tecumseh dislikes leaders that disperse independents | `DiplomacyText.xml:1603-1609` |
| Triumphs | Antiquity "Lukka Lands": disperse 4 → +4 Combat Strength vs independents; Invasion crisis triumph: disperse 6 | `TXT\LegaciesText.xml:1141-1148`, `G\age-antiquity\data\legacies-gameeffects.xml:470-474, 532-536` |
| The site | the village is gone (`Independents.csv` "DISPERSE TRIBE"), so its 6-tile no-settle ring (`angersVillage`, gotcha 27) is freed **[inferred]** | E43 `Independents.csv:496`; the engine also has `PlayerDiplomacy.hasBeenDispersed` (EXE @37654424) |

### 1.3 Does it come back?
- **Crisis encampments** respawn: `TRIBE_CRISIS ... RespawnTime="6" CanBeBefriended="false" CampConstructibleType="IMPROVEMENT_ENCAMPMENT"`
  (`Independents.xml:14`), `INDEPENDENT_ENCAMPMENT_RESPAWN` 6 (`G\age-antiquity\data\independents.xml:129-130`); "will
  respawn a few turns later in a new location" (`TXT\Civilopedia_Ages_Text.xml:211`).
- **Ordinary tribes** have `RespawnTime` −1 by default (schema `:2425`), but **new independents keep spawning mid-age** into
  free player slots **[evidence]**: game 38 three new tribes at A49; game 43 slot 14 refilled at A59 (a new tribe at 16,25)
  14 turns after player 4 incorporated the old one (DS A45), slot 11 at E27; game 40 a new tribe at E62 after a dispersal at
  E37 (`Independents.csv` of E38, E43, research/game40). Nobody's dispersal is followed by a respawn on the same tile.
- Dispersals are rare: 0-2 a game across games 30-47 (`Independents.csv` "DISPERSE TRIBE") **[evidence]**; ours: 0 (game 37
  sent one Warrior, `DISPERSE_MOVE`, which withdrew; research/game37/README.md:32-34).

### 1.4 Our autopilot today
- **Dispersing** (`U\data\xpl-autopilot-units.js:3597-3678`): a soldier (not a garrison, damage ≤ `DISPERSE_MAX_DAMAGE` 50)
  walks onto an **empty** village within `DISPERSE_RADIUS` 4 that it reaches in `DISPERSE_MAX_TURNS` 2 (`goDisperse`), only
  one at war with us and that nobody is befriending (`dispersible`: avoids the −30 grievance and our own lost Influence), and
  disperses it on arrival (`disperseHere`, `disperseArrivals`). It never attacks a village's defenders to expose it.
- **Befriending** (`U\data\xpl-autopilot-choices.js:1101-1178`): one Influence spend a pass; order: threatening, hostile,
  nearest village; reads `Game.Diplomacy.getProjectDataForUI(us, them, …)` and starts `DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN`
  when `projectStatus === PROJECT_AVAILABLE` and `canStart` agrees. A threatening one that is not available logs
  `befriend: X threatens us; its project status N` (`:1160`); statuses `NOT_UNLOCKED`, `NO_VIABLE_TARGETS`, `BLOCKED` make
  it "unbefriendable" (`:1131, 1157`: a unit is sent to see its village) and the Influence is **not** kept for it (`:1162`).
- **Striking:** only raiders next to our soldiers near our settlements (`strikeRaiders`, `:4576-4600`; `THREAT_RADIUS` 4 at
  `:73`), when the game's preview says it pays (`strikeWorthIt`, `:3990`).

### 1.5 What `status -3` means, and who cannot be befriended
- **The engine's `DiplomacyProjectStatus` has six values:** the EXE's enum string table lists, in order,
  `PROJECT_SINGLE_INSTANCE_RUNNING, PROJECT_NO_VIABLE_TARGETS, PROJECT_NOT_UNLOCKED, PROJECT_BLOCKED, PROJECT_AVAILABLE,
  PROJECT_ACTIVE` (EXE @36044904-36045032). The same table's deal actions are in declaration order (`ACCEPTED, REJECTED,
  ADJUSTED, PROPOSED, DEMANDED, EQUALIZE, INSPECT` @36042360-36042456, matching the known REJECTED 2, ADJUSTED 3, PROPOSED 4,
  INSPECT 7 of gotcha 36), so the statuses read **SINGLE_INSTANCE_RUNNING −4, NO_VIABLE_TARGETS −3, NOT_UNLOCKED −2,
  BLOCKED −1, AVAILABLE 0, ACTIVE 1** **[inferred]**, and three logged cases fit **[evidence]** (our probe P-REF-1, UI.log of
  `research\game42\evidence.zip` and `research\game44\evidence*.zip`):
  - status 0 with a target and no failure reason (game 44 20:22:09);
  - status −2 with operation −1 and no targets (game 42, Reform not unlocked);
  - status −4: "Единственный возможный экземпляр данного дипломатического процесса уже выполняется" (the only instance is
    already running, game 44 22:13:45);
  - status −3 with the target's `resultData.FailureReasons` "У вас не хватает влияния: 135/160" (**not enough Influence**,
    game 44 21:46:31 and 20:45:16).
- **So −3 = `PROJECT_NO_VIABLE_TARGETS`: no target passes `canStart`.** There is **no** `PROJECT_NOT_ENOUGH_INFLUENCE` in the
  engine (absent from the EXE); lack of Influence shows as −3. The game's own screen keeps −3 projects visible for
  non-majors (`UI\diplomacy\diplomacy-manager.js:243-245`). Earlier notes guessed "village unseen" (research/24 §8): that is
  one possible cause, not the only one.
- **Causes of −3 for a befriend project** (the game's failure texts; which one applied in our games is **[unverified]**):
  not enough Influence (cost 80 / 160 / 240 + 20 per befriending or suzerainty under way, research/17; text
  `DiplomacyText.xml:2641`); "You have not found their village" (`:1859`; Civilopedia "once their Village has been
  discovered" `Civilopedia_Concepts_Text.xml:79`); "Encampments cannot be befriended" (`:1823`, the crisis tribe
  `CanBeBefriended="false"`); "Already running this Diplomatic Action with them" (`:1760`).
- **Seen:** `threatens us; its project status -3` 15-50 times a game in games 42, 44-47, every logged case −3 **[evidence]**.
  In the same games endeavors kept starting (19-53 lines a game), because `befriendBusy` stays false when the only blocked
  befriending is −3, and the endeavor step spends whenever `!befriendBusy` (`U\data\xpl-autopilot-choices.js:1177, 1844`).
  **[inferred]** Where −3 meant "not enough Influence", the autopilot never saved up for the befriending of a village
  raiding us. Probe P-BEF-1 settles it.
- **Test fakes diverge:** `tests\fakes\fake-engine.mjs:634` defines `PROJECT_NOT_ENOUGH_INFLUENCE: 1` and other values that
  the game does not have (tests `autopilot-expand.test.mjs:81, 557, 581` use it). The mod reads names, not numbers, so the
  code is fine, but those tests model a status the game never returns.
- **Cannot be befriended at all:** crisis encampments only (`Independents.xml:14`). Hostile villages (including the previous
  age's city-states returning at war) can be (research/17 "Befriending").

### 1.6 Experience from independents
- Only commanders earn XP, from combats of units in their Command Radius (`Civilopedia_Concepts_Text.xml:331, 2113`);
  `ARMY_BASE_COMMAND_RADIUS` 1, max 5 (our parameter log, E43 UI.log `commander parameters:`). Pillaging gives none without
  `ABILITY_PILLAGE_XP`, which nothing grants (research/25:62).
- Values (same log line): `EXPERIENCE_COMBAT_ATTACKER_BONUS` 1, `EXPERIENCE_COMBAT_RANGED` 1, `EXPERIENCE_KILL_BONUS` 2,
  `EXPERIENCE_CITY_CAPTURED` 10, **`EXPERIENCE_BARB_SOFT_CAP` 1, `EXPERIENCE_MAX_BARB_LEVEL` 2**. The line is cut at 1,022
  characters, so `EXPERIENCE_NOT_COMBAT_RANGED`, `EXPERIENCE_MAX_LEVEL`, `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER` and
  `EXPERIENCE_DISPERSE_INDEPENDENT` were never logged.
- **Meaning of the two caps [unverified]:** by their names (Civ VI heritage) XP from independents shrinks past level 1 and stops
  or drops to a trickle at level 2. **Game 38 [evidence]:** two promotions came in Antiquity from fights with independent
  player 10 alone (UI.log `PROMOTED` at 22:14:49 and 22:15:57, between the `economy: T20/T30/T40` lines, i.e. about A28 and
  A36; CL: 27 of our attacks and 7 of theirs vs independents in Antiquity, 5 kills); the third came at about E22 during the
  war with two majors (22:29:10); **36 fights with independents in Modern (8 ours, 28 theirs, 6 kills) brought none.**
  `commanders.md` §1.3 has five games' timings: the first two promotions take a handful of fights, the third ~25.
  Either a cap or rising thresholds; independents are a good source for the first two promotions only.
- XP rate modifiers (Terracotta Army +25%, Antiquity militaristic city-state bonus +50%, Commissioned Officers +30%, …):
  research/25:109-121.

---

## 2. War with a major

### 2.1 Declaring
- **The request** (the game's own): `Game.PlayerOperations.canStart(us, PlayerOperationTypes.DECLARE_WAR, {Player1: us,
  Player2: them, Type: DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_WAR | DIPLOMACY_ACTION_DECLARE_FORMAL_WAR}, false)`, then
  `sendRequest` with the same args (`UI\diplomacy\diplomacy-manager.js:769-783`). The button is enabled by
  `player.Diplomacy.canDeclareWarOn(them)` (`.Success`, `.FailureReasons`), our turn active and `hasMet` (`:690-697, 725`); the
  type popup asks `canDeclareWarOn(them, WarTypes.FORMAL_WAR)` and picks Formal when it succeeds, else Surprise
  (`:1011-1038, 1196-1258`). Data: both actions map to `PlayerOperationType="DECLARE_WAR"` (`diplomacy-actions.xml:772-773`).
- **Cost:** none in Influence (`LOC_DIPLOMACY_WAR_COST` = "0", `DiplomacyText.xml:2145-2146`; `BaseTokenCost="0"`,
  `diplomacy-actions.xml:322-323`).
- **Formal vs surprise:** Formal needs a **Hostile** relationship ("Cannot start Formal War without already having a Hostile
  Relationship", `DiplomacyText.xml:1724`) and has no War Support penalty; Surprise (any other relationship) has penalties
  that grow with friendliness and the target gains Influence (`Civilopedia_Concepts_Text.xml:2318, 2322`; `AdvisorText.xml:935, 437`;
  `DiplomacyText.xml:2137, 2149`). Before declaring, the game shows the numbers: `Diplomacy.getTotalWarSupportBonusForPlayer(them, isFormal)`,
  `getTotalWarSupportBonusForTarget(them, isFormal)`, `getWarInfluenceBonusTarget(them, isFormal)` (`diplomacy-manager.js:1039-1050`).
- **Getting to Hostile:** "Players can intentionally lower a relationship by denouncing ... If the relationship worsens
  sufficiently, Players can declare formal war without using Influence" (`Civilopedia_Concepts_Text.xml:982`). Denounce
  (`DIPLOMACY_ACTION_DENOUNCE`) costs 55-70 / 110-140 / 165-210 Influence by relationship (`G\age-antiquity\data\diplomacy-actions.xml:65`,
  `G\age-exploration\...:122`, `G\age-modern\...:106`), lasts 10 turns, blocks endeavors 10 turns
  (`diplomacy-actions.xml:346, 497-498, 646-649`); the target may reject it for 120 / 120 / 180 Influence (age files
  `:128`, `:188`, `:170`). Its relationship change is engine-side (`TargetFavors="-6000"`; the UI reads
  `Game.Diplomacy.getActionRelationshipDelta(target, actionType)`, `UI\diplomacy-actions\panel-diplomacy-actions.js:2256`).
- **The AI does exactly this [evidence]:** game 43, Friedrich denounced us at A31 and A37, Ada at A32, both declared Formal
  wars at A44 (E43 DS:1028-1041); game 38, Hatshepsut and Napoleon denounced at E13 and declared Formal wars at E18 (E38
  DS:1543-1550).
- **Blocks:** too early in the game/age ("Too early to start war", `DiplomacyText.xml:1721`, length **[unverified]**); too soon
  after peace (`:1727`); defensive pact (`:1733`); team member (`:1730`); **Modern: shared ideologies cannot go to war
  (`:1742`) and opposing ideologies cannot make peace (`:1739`)**.
- **What starts with it:** trade routes and endeavors with them end; city-states suzerained by either side join; the target's
  allies must join or end the alliance (`AdvisorText.xml:936-937`); third parties may support or oppose (one each,
  `MaxThirdPartySupport="1"`, `diplomacy-actions.xml:322`).
- Other ways in: a leader whose ability ignores the relationship requirement (`TXT\LeaderText.xml:257`), mementos (+1 War
  Support, a tech boost on Formal War, `TXT\MementoText.xml:683, 692`).

### 2.2 War Support and War Weariness
- **War Support** = supporting minus opposing envoys of the war's diplomatic event, from the initiator's side; the ribbon reads
  it as `Game.Diplomacy.getSupportingPlayersWithBonusEnvoys(warId).length - getOpposingPlayersWithBonusEnvoys(warId).length`
  (`UI\diplo-ribbon\model-diplo-ribbon.js:1046-1088`); the war id is the joint event with `actionTypeName == "DIPLOMACY_ACTION_DECLARE_WAR"`
  from `Game.Diplomacy.getJointEvents(us, them, false)`; the relationship tooltip uses the war project's `supportingEnvoys` /
  `opposingEnvoys` (`UI\tooltips\relationship-tooltip.js:70-117`).
- **Adding support:** `SUPPORT_DIPLOMATIC_ACTION {ID: warId, Type: DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true}` for
  the initiator's side, `SubType: false` for the target's (`UI\diplomacy-action-details\screen-diplomacy-action-details.js:873-895, 919-935`);
  price `Game.Diplomacy.getInfluenceForNextSupport(warId, us, isInitial)` (`:201-205, 725-745`). Data: 60 / 120 / 180, each
  more +30 / +60 / +90 (`G\age-antiquity\data\diplomacy-actions.xml:46-47`, exploration `:104-105`, modern `:89-90`)
  **[inferred: these rows are the support price]**.
- **War Weariness** = the gap in War Support, suffered by the side with less (`Civilopedia_Concepts_Text.xml:178, 2294`). Per
  point, Happiness in every settlement (`Civilopedia_Concepts_Text.xml:181`; data):

  | Settlement | Antiquity | Exploration | Modern | Cap |
  |---|---|---|---|---|
  | founded by us | −3 | −5 | −7 | 60 |
  | founded by a third party | −5 | −7 | −9 | 80 |
  | founded by the enemy | −7 | −9 | −11 | 100 |

  (`G\base-standard\data\happiness-identity.xml:25-27`, `G\age-exploration\data\gameplay-systems.xml:32-45`,
  `G\age-modern\data\gameplay-systems.xml:29-42`), and −1 Combat Strength per point against that enemy's units, up to 20; only
  the highest weariness of several wars counts for Happiness; it all ends with the war (`Civilopedia_Concepts_Text.xml:181, 184`).
  Below zero, Happiness costs 5% of a settlement's other yields a point (gotcha 45).
- **Seen [evidence]:**
  - Game 38 (8-9 settlements): our Happiness yield 172 (E18) → 125 (E19, war start) → 101 (E23, a turn after Hatshepsut added
    support at E22, DS:1625) → 174 (E27, after peace at E26); gold yield 77 → 49 at E19 (routes and endeavors ended) (E38 PS,
    player 0). We never added support.
  - Game 43 (3 cities): Happiness 35 (A51) → 27 (A52), the turn after Friedrich added support (DS:1193): 1 point × 3 × 3
    settlements ≈ −9.
- Readable per city: `city.Happiness.hasWarWeariness` (`G\age-antiquity\ui\tutorial\tutorial-items-antiquity.js:3003-3020`;
  EXE `CityHappinessLibrary`: `netHappinessPerTurn, getUnhappiness, hasUnrest, hasWarWeariness, turnsOfUnrest`); the amount
  appears as a "War Weariness" line in the yield breakdown (`TXT\CommonText.xml:511-519`) and in the combat preview
  (`TXT\CombatPreviewText.xml:109, 118`).

### 2.3 Capturing and razing
- **Capture** needs the centre and every fortified (walled) district occupied (`Civilopedia_Concepts_Text.xml:210, 717, 1915`;
  campaigns: gotcha 71). XP: `EXPERIENCE_CITY_CAPTURED` 10 (§1.6).
- **A captured settlement:** becomes a Town; unrest "for several turns" (`Civilopedia_Concepts_Text.xml:1475`): −15 Happiness
  for 10 turns scaled by speed (`happiness-identity.xml:18`, `StandardCityTransferUnrest`), no purchases (`:2197`), no Town
  Focus (`:615`); converting it costs double (`:633`). A commander there lowers the unhappiness; retaking our own is a
  liberation with no unrest (`:1478`); settlements received in a peace deal have no unrest (`:1481`; `AdvisorText.xml:1852, 1859`).
- **Settlement cap:** captured settlements count; each over the cap is −5 Happiness in every settlement; razed ones stop
  counting once razed (`Civilopedia_Concepts_Text.xml:1537, 1540`). Razing takes turns by population, cannot be stopped, and
  "incurs a -2 influence per age penalty for rest of the age" (`:1560-1566`); 2 / 3 districts a turn in Exploration / Modern
  (`G\age-exploration\data\gameplay-systems.xml:30`, `G\age-modern\data\gameplay-systems.xml:27`).
- **Relationships and Influence:** the victim gets Influence: 10 per population captured, 5 per population razed (Antiquity
  `InfAwardPerPopulation`, `G\age-antiquity\data\diplomacy-actions.xml:161-162`); internal grievance tokens: city occupied 30,
  town occupied 10, razed 5, war declared 1; liberating or returning gives favours (`diplomacy-actions.xml:750-763`; how
  tokens move the relationship **[unverified]**). `HISTORICAL_EVENT_DECLARING_WAR` −30, `HISTORICAL_EVENT_ELIMINATE_CIV` −10,
  `HISTORICAL_EVENT_MUTUAL_WAR` +10 with co-belligerents, a third party's support +15 / opposition −15 (`:841, 852, 856-859`).
  Agendas: Harriet Tubman likes Formal and dislikes Surprise wars; Xerxes and Machiavelli like leaders at war with others
  (`DiplomacyText.xml:1551-1557, 1271-1277, 1473-1476`).
- **Points:** military victory +4 a settlement held, +1 if conquered, +4 for an original capital (`G\base-standard\data\victories.xml:89-91`).
  Triumphs: conquer and hold 6 (+2 settlement limit), first to conquer a capital (+1 promotion for all commanders), a level-8
  commander (a commander with 3 promotions) in Antiquity; Exploration's "Master & Commander" (+1 promotion for all) needs a
  level-8 **Fleet** Commander (`TXT\LegaciesText.xml:192-232, 470-505`; legacy path milestones count nothing, gotcha 74).

### 2.4 Peace
- **When:** "a minimum of 10 turns. After that point, either side can Propose Peace" (`AdvisorText.xml:938, 1850`); failure
  text "Can't make peace too soon after declaring war. N turns until peace is available" (`DiplomacyText.xml:1718`). **Seen: 8
  turns** at our game speed (E18 → E26 in game 38, A44 → A52 in game 43) **[evidence; inferred: scaled by speed, the engine
  has `Game.Diplomacy.modifyByGameSpeed`, EXE @37618544]**. Check with `Diplomacy.canMakePeaceWith(them)` and
  `Game.DiplomacyDeals.hasPendingDeal` (`diplomacy-manager.js:678-686`).
- **Deals** (`UI\diplomacy-peace-deal\panel-diplomacy-peace-deal.js`): an `AGREEMENTS / MAKE_PEACE` item (`:531-537`), gold
  and Influence lumps (`DiplomacyDealItemGoldSubTypes.SMALL_LUMP | LARGE_LUMP`, `:868-924, 976-979`), settlements both ways:
  `OFFER` (theirs to us, or ours to them) and `CEDE_OCCUPIED` (one we occupy that was theirs, kept by us) (`:1395-1432`); the
  engine's enum also has `RETURN_TO_ORIGINAL`, `LIBERATE_TO_CS` (EXE @36042250). An uneven deal: −5 relationship
  (`G\age-antiquity\data\diplomacy-actions.xml:167`).
- **What the AI accepts:** "more likely ... if they feel what they're receiving outweighs the cost of continued War. If they're
  losing badly and have high War Weariness, they may even be willing to give up additional Settlements" (`AdvisorText.xml:1851`).
  The INSPECT handshake (gotcha 36; our `seekPeace`, `U\data\xpl-autopilot-choices.js:1635-1690`) asks before proposing.
  **Seen:** Hatshepsut and Napoleon took a white peace 8 turns in (game 38 E26, `PEACE_PROPOSED`); Ada too (game 43 A52);
  **Friedrich refused a white peace at A55, A61 and later, and the war ran to the age's end** (E43 UI.log `peace: … would refuse`).
- **The age change ends wars between majors [inferred]:** at E1 of game 43 we started a Reconciliation with Friedrich and an
  endeavor at E9 (E43 DS, rows after 1590), with no peace row.

### 2.5 Our games' wars (both declared on us)
| | Game 38, Exploration E18-E26 | Game 43, Antiquity A44-A70 |
|---|---|---|
| Enemies | Hatshepsut (p1), Napoleon (p2), Formal, after denouncing at E13 | Ada (p6), Friedrich (p7), Formal, after denouncing at A31-A37 |
| Them vs us at the start (PS) | production 90 and 99 vs our 250; gold +66, +69 vs +77; land units 16 and 12 vs our 13 | production 26 and 27 vs our 60; gold +40, +31 vs +53; land units 11 and 12 vs our 10 |
| Combat (CL) | p1: 5 attacks of ours, 12 theirs, 1 kill, 1 loss; p2: 9 ours, 17 theirs, 4 kills, 1 loss; 12 hits on our districts (Гангайконда's centre 123/210, never lost) | p6: 3 ours, 9 theirs, 1 kill, 0 lost; p7: 8 ours, 21 theirs, 4 kills, 1 lost; 18 hits on our districts |
| End | white peace at E26, proposed by us | peace with Ada at A52; Friedrich refused to the age's end |
| Cost | Happiness yield 172 → 125 (E19) → 101 (E23), gold yield −28 a turn (§2.2) | Happiness −8 a turn from A52 |
| Commander | one promotion at about E22 | none |

The AIs that attacked us had about 40% of our production and less gold, yet as many land units as we had: an AI's army is
not proportional to its economy **[evidence]**.

---

## 3. Judging "much weaker"

| Read | Status | Source |
|---|---|---|
| `p.Stats.getNetYield(YieldTypes.YIELD_*)` for any player | the ribbon shows gold, science, culture, happiness, Influence for every leader (`UI\diplo-ribbon\model-diplo-ribbon.js:466-475`); **our `economy:` line reads rivals' science and culture** (`U\data\xpl-autopilot-steps.js:5604-5611`, game 38 UI.log `rivals p1 sci 18 cul 21, …`) | production for a rival **[unverified]**, same call |
| `p.Stats.numSettlements`, `settlementCap`, `numCities`, `numTowns`, `totalPopulation` | ribbon `:476-577`; we read only ours (`U\data\xpl-town-job.js`, steps) | |
| `p.Stats.getNumConqueredSettlements(minor, homelands, distant, coastal)` | `UI\advice\advice-support.js:90` | |
| `p.Stats.getMilitaryStrength`, `getNumCombatUnits`, `getNumLandUnits`, `getNumNavalUnits`, `getMaxMeleeStrengthTrained`, `getMaxRangedStrengthTrained`, `getBestUnitOfDomain`, `getNumIndependentsDispersed`, `getBarbariansKilled`, `getBarbarianCampsCleared` | names in the EXE's `PlayerStatsLibrary` binding (@37660968); used by no game UI; arguments and visibility **[unverified]** (P-STAT-1). `getMaxMeleeStrengthTrained` may also answer gotcha 62's centre defence directly | EXE |
| `p.Units.getUnits()` of another player | works: we read the units of majors at war with us, filtered to visible tiles (`hostileAircraft`, `U\data\xpl-autopilot-units.js:4084-4100, 4355-4365, 4488-4495`); sum `GameInfo.Unit_Stats` Combat/RangedCombat. Unfiltered, it is omniscient | our code |
| `p.Treasury.goldBalance` | our own only (`U\data\xpl-city-actions.js`, choices); another player's **[unverified]** (P-STAT-1) | |
| Victory points per player | `p.Victories.getPointsForVictoryType(hash)`, read for every major (`U\data\xpl-victory.js:65-104`) | our code |
| Relationship, war, alliances | `me.Diplomacy.getRelationshipEnum(id)` (`U\data\xpl-autopilot-steps.js:149`), `getRelationshipLevel` (`U\data\xpl-autopilot-choices.js:1818`), `isAtWarWith`, `hasAllied`, `canDeclareWarOn`, `canMakePeaceWith`, `getNumGrievances`, `getNumFavors`, `isAtWarWithAnyMajorCiv` (EXE `PlayerDiplomacy` binding @37654424) | |
| Distance to their settlements | `settlementDistance(id)`, revealed cities only (`U\data\xpl-autopilot-steps.js:108-118`) | our code |
| War risk | `assessWar` (Unfriendly/Hostile and close, or hostile acts, or a military DANGER) (`U\data\xpl-autopilot-steps.js:132-162`) | our code |
| Offline calibration | `Player_Stats.csv`: cities, towns, Land Units, Naval Units, gold balance, every yield, for all players each turn | game logs |

The game shows no military strength in its UI (no `getMilitaryStrength` call in `G\` UI JS); "much weaker" must be built from
units, the best unit trained, production and gold.

---

## 4. Costs that would slow a victory

| Cost | Size | Shown as a number? |
|---|---|---|
| War Weariness: Happiness in every settlement | 3/5/7, 5/7/9, 7/9/11 a point by age and founder (§2.2); game 38: −47 to −71 a turn | yes: before declaring (`getTotalWarSupportBonus*`), per city (yield breakdown "War Weariness"), `hasWarWeariness` |
| Happiness below zero | −5% of a settlement's other yields a point (gotcha 45) | via yields |
| Combat Strength | −1 a weariness point vs that enemy, max 20 | combat preview line |
| Trade routes and endeavors with them end | game 38: gold −28 a turn at E19 | ribbon trade count, gold yield |
| Influence | Surprise War gives the target Influence; capture and raze give the victim 10 / 5 Influence per population (Antiquity); our own War Support 60/120/180 +30/60/90 each | `getWarInfluenceBonusTarget`, `getInfluenceForNextSupport` |
| Relationships | −30 with the target; ±15 with supporters/opponents; agendas (Tubman, Tecumseh, Xerxes, Machiavelli); grievance tokens for captures | `getRelationshipLevel`, `getActionRelationshipDelta` |
| More enemies | their city-states join; their allies choose to join (`AdvisorText.xml:937`) | `hasAllied` |
| Locked in | at least 10 turns (8 seen); the AI may refuse peace to the age's end (game 43); in Modern **opposing ideologies cannot make peace at all** | `canMakePeaceWith().FailureReasons` |
| Captures | Town, unrest −15 for 10 turns, no purchases, double conversion price, over the cap −5 Happiness everywhere | `hasUnrest`, `turnsOfUnrest` |
| Units and upkeep | production away from the victory work; unit upkeep gold (gotcha 64) | yes |
| Commander risk | a beaten commander survives 50% +10% a promotion, back in 20 turns (`COMMANDER_DEATH_*`, parameter log) | no |

---

## 5. Design implications

**The safest XP: independents, near home, with the commander adjacent.**
- XP comes only when units within the commander's radius (1 at first) fight (§1.6), so the commander must stand next to the
  fight; the present code posts commanders at threatened settlements, where raiders come anyway.
- Hostile independents cost no politics (the war is already on, no War Support, no weariness seen in our logs), except a
  −30 with a leader befriending that village (avoid, as `dispersible` does) and Tecumseh's agenda. Dispersing pays 100 of a
  yield, +10 relationship with neighbours within 10, frees settling land, and counts for the "Lukka Lands"/Invasion triumphs.
- Best targets: crisis encampments (never befriendable, respawn after 6 turns: a renewable source during the Invasion crisis)
  and villages whose befriending stays blocked. Clear a village's last defenders with strikes the game's preview approves
  (`strikeWorthIt`) when the village is within a few tiles of our land, then disperse; never chase raiders far.
- Expect it to buy the first two promotions only: game 38 got two from Antiquity independents and none from 36 Modern
  fights (§1.6). Beyond that, XP needs majors (or the "first to conquer a capital" triumph's free promotion).
- Do not declare war on neutral villages to farm them: they raid afterwards, and befriending one later costs Influence.
- Before any of this: fix the −3 reading (§1.5): it is "no viable target", often "not enough Influence", so the autopilot
  should save Influence for a raiding village instead of spending it on endeavors (after probe P-BEF-1 confirms the cause).

**A war on a weak major (the opt-in checkbox) only when all hold:**
- Formal only: the target is already Hostile (no denouncing on purpose: it costs 55-210 Influence and is visible); our
  initial War Support (`getTotalWarSupportBonusForPlayer(them, true)`) ≥ theirs (`…ForTarget`), so no weariness from turn 1;
  Influence in hand for 1-2 support points (`getInfluenceForNextSupport`).
- Weak in arms, not just economy: their land units (visible, or `Stats.getNumLandUnits` once probed) ≤ half of ours, their
  best melee no stronger than ours, production and net gold ≤ 50-60% of ours; game 38 and 43 show weak economies with equal armies.
- Close (their settlements within ~8 tiles of ours) but our settlements unthreatened, no other war, no war risk elsewhere.
- No allies of theirs (`hasAllied` with any third major) and no city-states suzerained by them near us.
- Not in Modern with ideologies chosen (shared: no war; opposing: no peace), not within ~15 turns of an age's end, not while
  our victory is within reach (`victoryOutcome` OPEN and no own CHANCE), not during the science final push.
- A commander posted on the border with its army; fight their field units near our land (where our formations and heal
  points are), capture nothing unless a lightly held town under our cap (+10 XP, but unrest, grievances and the cap).

**End it** at the first of: 10 turns (the lock; 8 at our speed) and a promotion gained; weariness appears
(`hasWarWeariness` in any of our settlements, or their support > ours); a unit lost without a kill; a third party joins; a
settlement of ours threatened. Then propose a white peace through INSPECT (`seekPeace`), and if refused keep defending only
(the AI may refuse for 25+ turns, as Friedrich did).

**Risks:** the AI's refusal of peace; weariness on every settlement (game 38: −47 a turn at once); allies and city-states
joining; lost trade routes; Influence handed to the victim; a commander lost for 20 turns; the victory delayed by production
spent on units. A war someone else declares on us (games 38 and 43) gives the same XP at none of the diplomatic cost; the
cheapest lever may be to keep the commander at the front of those wars, and to add War Support with spare Influence so that
we, not they, cause the weariness.

---

## 6. Probes that would settle the open points (UI.log only)
- **P-BEF-1:** with each `befriend: … status N` line, the target's `targetList1[].resultData.FailureReasons` and our
  `Players.get(us).DiplomacyTreasury.diplomacyBalance` (the P-REF-1 line already shows FailureReasons for Reform).
- **P-XP-1:** on every `UnitExperienceChanged` of a commander: XP before/after, level, the last `Combat` payload's opponent
  (independent or major), and whether it was a dispersal; plus split `logCommanderParameters` into two lines so
  `EXPERIENCE_NOT_COMBAT_RANGED`, `EXPERIENCE_MAX_LEVEL`, `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER` and
  `EXPERIENCE_DISPERSE_INDEPENDENT` fit under the 1,022-character cut.
- **P-WAR-1:** once a turn for each met major at peace: `canDeclareWarOn(id)` / `(id, WarTypes.FORMAL_WAR)` with
  FailureReasons, `getTotalWarSupportBonusForPlayer/ForTarget(id, formal)`, `getWarInfluenceBonusTarget(id, formal)`.
- **P-STAT-1:** for each major once every 10 turns: `Stats.getMilitaryStrength()`, `getNumLandUnits()`,
  `getMaxMeleeStrengthTrained()`, `getNetYield(YIELD_PRODUCTION)`, `Treasury.goldBalance` (each in `safe()`; names from the EXE,
  arguments unknown; call them the way the game would, gotcha 75, so only no-argument getters first).
- **P-DISP-1:** the `NOTIFICATION_DISPERSE_IP_REWARD` text and our gold/yield change on a dispersal.
