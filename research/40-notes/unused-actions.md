# Unused game actions: what the autopilot never sends (audit, 20 October)

Scope: player actions (operations, commands, diplomacy projects, unit abilities) that the game's own UI sends and the autopilot never does, ranked by value per effort. Read-only audit. Game paths are relative to `Base/modules/` of the game install. Our code is `mod/expansion-planner/ui/`.

## 1. What the game's UI sends vs what we send

Our requests (grep of `sendRequest` in `ui/`, see the call sites in `data/xpl-autopilot-choices.js`, `-steps.js`, `-units.js`):

| Family | We send | We never send (and it has value) |
|---|---|---|
| PlayerOperations | SET_TECH/CULTURE_TREE_NODE, CHANGE_TRADITION, CHANGE_GOVERNMENT, BUY_ATTRIBUTE_TREE_NODE, CHOOSE_GOLDEN_AGE, CHOOSE_NARRATIVE_STORY_DIRECTION, FOUND_PANTHEON, FOUND_RELIGION, ADD_BELIEF, CHOOSE_SYNCRETISM_*, CHOOSE_CITY_STATE_BONUS, RESPOND_DIPLOMATIC_FIRST_MEET / _ACTION, SUPPORT_DIPLOMATIC_ACTION (befriend only), DECLARE_WAR (formal, campaigns), CANCEL_ALLIANCE, MOVE_GREAT_WORK, ASSIGN_RESOURCE, ASSIGN_WORKER, VIEWED_ADVISOR_WARNING, CONSIDER_* | SWAP_RESOURCES, LAND_CLAIM (manual), PAY_TO_AVOID_CALL_TO_ARMS, FORM_ALLIANCE (as initiator) |
| Diplomacy projects (via `project.operationType`) | GIVE_INFLUENCE_TOKEN (befriend), COUNTER_SPY, SEND_DELEGATION, OPEN_BORDERS, 6 endeavors: RESEARCH_COLLABORATION, MINOR_TRADE, CULTURAL_EXCHANGE, FARMERS_MARKET, LOCAL_FESTIVALS, WONDER_CONSTRUCTION (`choices.js:1511-1515`) | **CS_INCORPORATE, CS_LEVY_UNIT**, CS_PROMOTE_GROWTH, CS_BOLSTER_MILITARY, CS_ORDER_ATTACK, BECOME_SUZERAIN; **ESPIONAGE_STEAL_TECH / _STEAL_CIVIC**, every other espionage action; every sanction; IMPROVE_TRADE_RELATIONS (treaty); every unlock-only endeavor (MILITARY_AID, SHARE_INNOVATIONS, GRANT_POLICY_SLOT, PIONEERING, TRADE_MAP, GINSING, FRIEND_OF_WA, SEND_DELEGATION_DIPLOMATIC_CITY_STATE_BONUS, DEMAND_TRIBUTE); support on others' endeavors (`answerDiplomacy({support=false})`, `choices.js:880`) |
| CityOperations / CityCommands | BUILD, PURCHASE, EXPAND, CHANGE_GROWTH_MODE, DESTROY (keep), CONSIDER_TOWN_PROJECT | nothing missing; but town Focus never picks PROJECT_TOWN_FACTORY (absent from `core/xpl-town-focus.js:23-29`) |
| UnitOperations | MOVE_TO, SKIP_TURN, FORTIFY, ALERT, REST_UNTIL_HEALED, FOUND_CITY, AUTOMATE_EXPLORE, RANGE_ATTACK, NAVAL_ATTACK, AIR_ATTACK, REBASE, REINFORCE_ARMY, EXCAVATE, RESEARCH_ARTIFACTS, DISPERSE_INDEPENDENT, TELEPORT_TO_CITY | **SPREAD_RELIGION**, EVANGELIZE_BELIEF, LAUNCH_INQUISITION/REMOVE_HERESY, RELIGIOUS_HEAL, ESTABLISH_BASE, PILLAGE/COASTAL_RAID, AERIAL_RECON, CALL_REINFORCEMENTS |
| UnitCommands | WAKE, CANCEL, UPGRADE, PROMOTE, ADD_TO_ARMY, REMOVE_FROM_ARMY, UNPACK_ARMY, FOCUSED_ATTACK_LAND_MELEE/RANGED, RESETTLE, DISBAND (convoys), DELETE, MAKE_TRADE_ROUTE, ACTIVATE_GREAT_PERSON (**Keynes only**, `units.js:4790`) | **ACTIVATE_GREAT_PERSON for civ great people**, CONNECT_WITH_ROAD, CLAIM_RESOURCE (America), COMMANDER_ATTACK, GRANT_SECOND_WIND, DEFENSIVE_PERIMETER, ARMY_OVERRUN, UPGRADE_ARMY, FOCUSED_ATTACK_SEA_*/AIR_*, MOVE_BY_RAIL |

Game sources for the inventory: `base-standard/data/unit-operations.xml`, `unit-commands.xml` (full lists), `*/data/diplomacy-actions.xml` (groups: `base-standard/data/diplomacy-actions.xml:795-830`), the generic unit-action loop `base-standard/ui/unit-actions/unit-actions.js:966-1260` (canStart every GameInfo.UnitOperations/UnitCommands row; `unit.getActivationPlots(cmd, false)` at 1130-1133 gives where a command works), the diplomacy target screen `base-standard/ui/diplomacy-actions/screen-diplomacy-target-select.js:32-42, 271-345` (args `{Player1, Type, Player2 | ID, ID2}`), `interface-modes/*.js` for each targeted command.

Unit dispatch: a civilian with no branch in `commandUnits` (`units.js:5257-5275`) only steps aside or is skipped, so a trained missionary, great person or prospector idles for ever.

### Evidence from game 41 (`research/game41/evidence.zip`, DiplomacySummary.csv, "Diplomacy Action Started")
| Who | Actions started |
|---|---|
| Us (player 0) | Cultural Exchange 21, Free Markets 21, land claim 18 (automatic), befriend 13, open borders 13, Counter-spy 5, Wonder Construction 5, alliance 4 |
| Rivals | **Steal tech 45, steal civic 36, Military Aid 30**, Cultural Exchange 28, Local Festival 23, Farmers' Market 15, Research Collaboration 13, Denounce 10, sanctions ~24, **Incorporate 7**, Ginseng 6, Military infiltration 7 |

Our influence income in game 41: ~7,300 over 165 turns (Player_Stats "Diplomacy"), roughly all spent on ~42 endeavors and 13 befriends. So the issue is **allocation**, not idle influence: Modern Research Collaboration gives +6 science a turn (`age-modern/data/diplomacy-gameeffects.xml:3-9`) for 150-195 influence, while one stolen Modern tech is worth ~1,500-2,000 science for 240 + 12 a turn.

Also seen in game 41: rivals trained 19 missionaries (CityBuildQueue.csv, players 1, 2, 3, 6), we trained none; our pantheon was "Earth Goddess" (UI.log 03:19:30), the first one the game allowed.

## 2. The gaps, ranked by value / effort

| # | Gap | Value | Effort |
|---|---|---|---|
| 1 | Pantheon picked blind | High (all Antiquity) | XS |
| 2 | Endeavor list hard-coded; unlocked endeavors ignored | Medium-High | S |
| 3 | Great people never activated | High for 9 civs | M |
| 4 | Steal tech / civic | High (science, culture) | S-M |
| 5 | Incorporate city-states | High for military/score; Medium otherwise | S |
| 6 | Missionaries and relics (Exploration culture path) | High under the culture focus | L |
| 7 | Levy units under threat | Medium (defence) | S |
| 8 | Support others' endeavors | Low-Medium | XS |
| 9 | Factory Town focus (Modern) | Medium for the economic path | S |
| 10 | Merchant "Build road" for unconnected towns | Medium (unverified size) | M |
| 11 | Rival space program sabotage | Situational, decisive | S |
| 12 | Commander commands (Second Wind, Commander Attack, Defensive Perimeter) | Low-Medium | M |
| 13 | Civ unique civilians (Prospector CLAIM_RESOURCE, Sherpa) | Low (2 civs) | S |

### 1. Pantheon: the first allowed, not the best (XS)
- **Ours:** `choosePantheon` (`data/xpl-autopilot-choices.js:712-725`) loops `GameInfo.Beliefs` and sends the first pantheon `canStart` accepts. Game 41: "Earth Goddess" (`PANTHEON_BONUS_2`, +1 Happiness adjacency for mountains and natural wonders on the Altar); the user's earlier logs show "City Patron Goddess" (`PANTHEON_BONUS_1`, +2 Influence on the Altar). Both are first in table order.
- **What the others give** (`age-antiquity/text/en_us/*`; `age-antiquity/data/religion.xml:28+`): God of Wisdom +1 Science per quarter, Goddess of Festivals +1 Culture per quarter, God of the Forge +10% building production, Goddess of the Harvest +1 Food on farms, pastures and plantations, Monument to the Gods +10% wonder production, God of the Sun +1 of six yields on the Altar. Each of these is worth several of the first two in any mid-sized empire, for the whole Antiquity.
- **Fix:** value pantheons like beliefs (`foundReligion` already uses `modifiersValue(BeliefModifiers, weights)`, `choices.js:757-761`), plus the existing `core/xpl-effect-value.js` for production percentages. No turn-hold risk: same notification, same operation.

### 2. Endeavors: a fixed list of six (S)
- **Ours:** `tendDiplomacy` tries only `ENDEAVORS` and `ENDEAVOR_FOR_PROFILE` (`choices.js:1511-1515, 1658-1667`). Anything the game unlocks for us later is never started: MILITARY_AID (+2 combat strength to our units; the AI's 3rd most used action), SHARE_INNOVATIONS (production per envoy), PIONEERING, TRADE_MAP, Lafayette's GRANT_POLICY_SLOT ("Reform": +1 policy slot for us, +1 tradition slot for a supporter, permanent: `base-standard/data/diplomacy-gameeffects.xml:431-447`; 140-200 influence in Antiquity), Himiko's FRIEND_OF_WA, Ibn Battuta's TRADE_MAP, Gilgamesh's "all endeavors", the Antiquity diplomatic city-state bonus SEND_DELEGATION_DIPLOMATIC_CITY_STATE_BONUS (+4 Happiness a turn: `age-antiquity/data/diplomacy-gameeffects.xml:60-68`), the Exploration city-state bonus DEMAND_TRIBUTE (a 2-cargo Treasure Convoy: economic path). Unlock sources: `EFFECT_DIPLOMACY_GRANT_DIPLOMATIC_ACTION` (leaders, attribute nodes `MOD_TRAIT_LEADER_ATTRIBUTE_UNLOCK_*`, city-state bonuses).
- Worse: we pick city-state bonuses and attribute nodes whose only effect is such an unlock, then never use it.
- **Fix:** enumerate `Game.Diplomacy.getProjectDataForUI(pid, target, …)` for `actionGroup == DIPLOMACY_ACTION_GROUP_ENDEAVOR` and `projectStatus == PROJECT_AVAILABLE` (what `diplomacy-manager.js:234-262` does) and rank by the effect's modifier (`DiplomacyActionStages` → modifiers → `EFFECT_DAE_GRANT_COOPERATIVE_YIELD_SUPPORT_BASE_PER_TURN` Amount × duration / cost; slots and combat strength by hand). Same `start` helper (`choices.js:1625-1635`).
- **Risk:** none new; rejected endeavors cost relations (already handled by `rank`).

### 3. Great people never activated (M)
- **The units:** `UNITCOMMAND_ACTIVATE_GREAT_PERSON` rows for UNIT_TJATY (Egypt), UNIT_LOGIOS (Greece), UNIT_SHI_DAFU (Ming), UNIT_HERODOTUS, UNIT_ALIM (Abbasid), UNIT_CONQUISTADOR (Spain), UNIT_JACOBIN (France), UNIT_REVOLUCIONARIO (Mexico), UNIT_UPARAT, UNIT_SHIJIN, UNIT_SAGA_HERO (grep `<Row UnitType=… CommandType="UNITCOMMAND_ACTIVATE_GREAT_PERSON"` in age-*/data and DLC). One charge, trained in a city with the civ's unique building.
- **Value examples** (`age-antiquity/text/en_us/GreatPeopleText.xml`): Imhotep +250 production on a wonder under construction, Hemiunu +200, Amhose +3 Culture on the Palace, Aperel/Khay two +3-strength cavalry units.
- **Ours:** `openWorldBanks` handles only the Great Banker (`units.js:4783-4825`, dispatched at 5266 by `VictoryUnit`). A great person the advisor queues walks nowhere and is skipped every turn; nothing trains them on purpose.
- **Inputs:** `GameInfo.GreatPersonIndividuals` gives the activation requirements as columns (`ActionRequiresCompletedConstructibleType`, `ActionRequiresIncompleteWonder`, `ActionRequiresOwnedTile`, `ActionRequiresNoMilitaryUnit`: `age-antiquity/data/greatpeople.xml:53-57`); `unit.getActivationPlots("UNITCOMMAND_ACTIVATE_GREAT_PERSON", false)` lists where it works (`unit-actions.js:1130-1133`). Walk to the best plot, `canStart(NO_TARGET)`, send. For wonder ones: the city with a raced wonder in production (ties into `chooseWonders`).
- **Training:** a later step; first make sure trained ones are used.

### 4. Espionage: steal tech and civic (S-M)
- `DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH` / `_STEAL_CIVIC`: 80 / 160 / 240 influence + 4 / 8 / 12 a turn, base duration 21 with random initial progress 6, reveal chance 50% (`base-standard/data/diplomacy-actions.xml:360`; costs `age-antiquity/…:75-76`, `age-exploration/…:136-137`, `age-modern/…:121-122`); effect `EFFECT_DAE_ESPIONAGE_STEAL_TREE_NODE` (`base-standard/data/diplomacy-gameeffects.xml:461-466`). AI rivals used them 81 times in game 41.
- **When:** Modern science race (Rocketry needs ~22,000 science: gotcha 65) against a leader who knows a tech we do not; culture focus for civics. Not against an ally or a leader near war (reveal = relation hit).
- **How:** same `start(target, type)` as counter-spy (`choices.js:1625-1635`); `projectStatus` tells whether a target has something to steal. Count it in `researchPlan`'s race only once it lands.
- **Risk:** a revealed spy worsens relations (our `RELATION_RANK` guard); a war risk for the military/defence code.

### 5. Incorporate a city-state (S)
- `DIPLOMACY_ACTION_CS_INCORPORATE`: 240 / 480 / 720 influence, 10 turns, then the city-state becomes our town (`base-standard/data/diplomacy-gameeffects.xml:429`, `EFFECT_DAE_INCORPORATE_CITY_STATE`; costs at `age-*/data/diplomacy-actions.xml` 79 / 140 / 125). The AI did it 7 times in game 41.
- **Value:** a settlement without a settler: +4 military victory points (gotcha 44), a score place, a town with its own yields; for the final age's `fillCap` / military lever and blocking a rival's dominance goal, where settlers are the bottleneck. Cost: the suzerain bonus and that city-state's yields.
- **Decide:** final age with settlements scoring (`settlementsScore`), or a military lever/block need, or a city-state whose bonus is worth less than a town; check the settlement cap (incorporated towns very likely count: probe it).
- **Args:** `{Player1, Type, ID: cityStatePlayer}` like befriend (`screen-diplomacy-target-select.js:32-41`).

### 6. Missionaries and relics: the Exploration culture path (L)
- The path is "display 12 relics" (`age-exploration/text/en_us`: LOC_LEGACY_PATH_EXPLORATION_CULTURE…; triumphs 6/9/12, research/11). Relics come mostly from reliquary beliefs on first-time conversions (`LOC_BELIEF_BONUS_9…35_DESCRIPTION`: +1/+2 relics per converted city-state, capital, holy city, settlement with temple/wonder/10 pop…), plus Temples' relic slots and the Theocracy celebration.
- **Ours:** we found a religion and add beliefs (`foundReligion`, `choices.js:734-770`) valued by Policy Yield Previews, which prices relic beliefs at 0, and we never train or move a Missionary (UNIT_MISSIONARY 150 production, 3 charges, needs a Temple: `age-exploration/data/units.xml:162, 338, 408`). Game 41: 0 missionaries ours, 19 rivals'.
- **Needed:** with the culture focus in Exploration: reliquary beliefs, a missionary per Temple city, targets (foreign settlements by relic belief, nearest first, not at war), `UNITOPERATION_SPREAD_RELIGION` on arrival (canStart on the tile), relic slots (Temples) in the plan; `slotGreatWorks` already displays them. Also defends our settlements' religion.
- **Risk:** civilian pathing into danger (reuse settler detours), units stacking (gotcha 23).

### 7. Levy units from our city-states (S)
- `DIPLOMACY_ACTION_CS_LEVY_UNIT`: take one of a city-state's units permanently (`EFFECT_DAE_LEVY_UNIT`, `base-standard/data/diplomacy-gameeffects.xml:427`), instant (duration 0), targets `DIPLOMACY_TARGET_UNIT` (args `ID2`). Antiquity Conqueror legacy makes it 100% more efficient (`age-antiquity/data/legacies-gameeffects.xml:158-161`).
- **When:** a threatened settlement wants a guard and a suzerain city-state's unit stands near (`planDefence`); a cheaper and faster defender than `buyDefenders`. Cost from `targetList*.costYieldD` of the project data.

### 8. Support the endeavors others propose (XS)
- `answerDiplomacy` takes plain acceptance (`choices.js:880-920`, `support=false` at every call site, `choices.js:1810`). Supporting a Research Collaboration doubles our share (Antiquity 2 → 4, Exploration 4 → 8, Modern 6 → 12-14: `age-*/data/diplomacy-gameeffects.xml`). Cheap rule: support when the focus wants that yield and the influence is idle (no befriend, no steal waiting).

### 9. Factory Town focus (S)
- PROJECT_TOWN_FACTORY (Modern): +100% gold toward a Factory, Port or Rail Station in that town, +1 resource slot, +5 trade range; needs an improved factory resource there (LOC_PROJECT_TOWN_FACTORY_DESCRIPTION). Our focus table lists every other Focus but this one (`core/xpl-town-focus.js:23-29`). Under the economic focus (factories and their resources are the Modern economic path) it is a real option.

### 10. Merchants' "Build Road to Settlement" (M, size unverified)
- A town with no connection gets no Focus and keeps growing (gotcha 12); the autopilot builds no roads. `UNITCOMMAND_CONNECT_WITH_ROAD` (`interface-modes/interface-mode-connect-with-road.js:47`) uses the merchant up. Worth it when the town is 7+ and its best Focus is worth more than one more trade route. Game 41 logged 8 TOWN_KEEPS_GROWING, but that key is also written for plain "keep growing" answers (`choices.js:1062-1076`), so measure first: log towns at 7+ with `getConnectedCities()` empty.

### 11. Sabotage a rival's space program (S, decisive when it applies)
- `DIPLOMACY_ACTION_ESPIONAGE_SABOTAGE_SPACE_PROGRAM` (Modern, 240 + 12 a turn, 25 turns): −50% production toward Launch Pads and Launch Satellite in the target (`age-modern/data/diplomacy-gameeffects.xml:54-61`). Gotcha 58 says "nothing we hold stops" a rival's science countdown; this slows the work before it. Trigger: the victory watch's SCIENCE entry at WATCH/DANGER.

### 12. Commander commands (M)
- We promote commanders and spend commendations, and use Focus Fire / Coordinated Attack. Never used: COMMANDER_ATTACK (granted by the Duty commendation, `base-standard/data/unit-promotions-gameeffects.xml:11-16`), GRANT_SECOND_WIND (+2 moves and +1 attack to a unit; Valor, `:54-58`), DEFENSIVE_PERIMETER (fortifications for all units in radius), ARMY_OVERRUN, UPGRADE_ARMY, the sea/air focused attacks. Second Wind on a melee unit next to a damaged raider and Commander Attack on a raider finishing a kill fit `strikeRaiders`; Defensive Perimeter fits a held formation (gotcha 68). Either use them or stop picking Duty/Valor.

### 13. Civ unique civilians (S)
- UNIT_PROSPECTOR (America, Modern: `UNITCOMMAND_CLAIM_RESOURCE`, claims an unowned resource within 5 tiles and improves it: `age-modern/data/units.xml:244, 1220`), UNIT_SHERPA (Nepal DLC, CLAIM_MOUNTAIN). `getActivationPlots` lists the targets.

## 3. Checked and not a gap
- Overbuilding: modelled (`core/xpl-placement-model.js:542-718`, `overbuild`).
- Town projects = town Focus (all but Factory; Fort via walls).
- Great works (MOVE_GREAT_WORK), artifacts (EXCAVATE / RESEARCH_ARTIFACTS), treasure convoys, World Bank, celebrations, attribute points, syncretism, resources (ASSIGN_RESOURCE).
- Befriending, counter-spy, open borders, reconciliation (SEND_DELEGATION).
- Sanctions other than space sabotage: low value for us (the targets are rivals' yields; relation cost), skip unless blocking a dominance leader.

## 4. Outside this area, same kind of miss
- The trigger (Rome Reborn: +1 tradition slot, +1 settlement cap) is a research-valuation problem (game advisor's civic pick; gotcha 72 fixed only the Future Civic order). Attribute nodes whose effect is a diplomatic unlock are valued 0 (`attributeOptions`, `choices.js:536-560`: only KIND_MODIFIER yields and cards count).
- Policy Yield Previews prices relic beliefs, slots and unlocks at 0 (gotcha 24): the same blind spot as the pantheon and belief picks.

## 5. Probes before building
- Incorporate: does the town count toward the settlement cap and military points? (Player_Stats "Settlement Cap", victory points.)
- Steal tech: `getProjectDataForUI` status for a leader with nothing to steal (expect NO_VIABLE_TARGETS).
- Great person: `unit.getActivationPlots(ACTIVATE_GREAT_PERSON, false)` for a wonder-type Tjaty when no wonder is in production (expect empty).
