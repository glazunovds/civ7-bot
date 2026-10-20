# Research trees: hidden value the autopilot misses (research/40, area: progression trees)

Scope: techs and civics of all three ages, main trees, civilization trees, Test of Time (ToT) trees, masteries (UnlockDepth 2), Future Tech / Future Civic. Read-only audit, 20 October 2026.

Paths: `G` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules`. `S` = `mod/expansion-planner/ui/data/xpl-autopilot-steps.js`; `L` = `mod/expansion-planner/ui/core/xpl-victory-levers.js`. Data was dumped with a throwaway parser over every XML under the game folder (Base + DLC; `config/` copies left out): 509 nodes, 2,104 unlock rows, 900 of them modifiers.

## 0. The main finding: the game's advisor cannot see a third of the valuable nodes

- **How the advisor chooses.** `getTreeRecommendations` is native. Its data is `ProgressionTree_Advisories` (node → advisory class) and `AdvisorSubjects` (`G\base-standard\data\advisory.xml:208-220`). For CHOOSE_TECH / CHOOSE_CULTURE only the four high-level classes (MILITARY, CULTURE, SCIENCE, ECONOMIC) map to an advisor. FOOD, HAPPINESS, DIPLOMACY, DEFENSE, TRADE and EMPIRE_EXPANSION map to none for research.
- **Which nodes it cannot see.** These nodes have no high-level class:
  - **ToT trees: 101 of 106 nodes.** Only 5 Antiquity "Origins" nodes carry a class. The Exploration and Modern ToT files have an empty `ProgressionTree_Advisories` (`G\age-exploration\data\progression-trees-culture-tot-common.xml:58-59`, `G\age-modern\data\progression-trees-culture-tot-common.xml:66-67`, `G\age-antiquity\data\progression-trees-culture-unique-ex.xml:140-141`).
  - **All base-game Exploration civilization trees.** `G\age-exploration\data\progression-trees-culture-unique.xml` has 0 advisory rows (Abbasid, Chola, Hawaii, Inca, Majapahit, Ming, Mongolia, Norman, Songhai, Spain), and so do the Dai Viet, Iceland and Shawnee DLC trees. Antiquity's file has 45 rows and Modern's has 58.
  - **Main-tree nodes classed only FOOD / HAPPINESS / DIPLOMACY:**
    - Irrigation: FOOD, `G\age-antiquity\data\progression-trees-tech.xml:206`. It gives +1 settlement cap for 125 science.
    - Entertainment: HAPPINESS, `G\age-antiquity\data\progression-trees-culture-common.xml:165`. It gives +1 settlement cap and the Colosseum, Rome's own favoured wonder.
    - Globalism: DIPLOMACY, `G\age-modern\data\progression-trees-culture-common.xml:211`. It gives +1 settlement cap and Think Tanks.
    - Cartography: FOOD.
    - Radio: FOOD + HAPPINESS.
    - Computation: no class at all.
- **Evidence from game 41.** In the game's UI.log (`research/game41/evidence.zip`), the `"*"` mark in `CIVIC [name, "*"]` / `TECH [...]` means "no advice: quickest available". All 9 `"*"` picks are exactly these blind nodes, and none of them was ever picked with advice:
  - Antiquity: Развлечение (Entertainment), Орошение (Irrigation);
  - Exploration: Картография, Иерархия, Синкретизм;
  - Modern: Модернизация Рима, Управление, Синкретизм, Глобализм.
- **How our fallback treats them.** It picks among the advisor's recommendations whenever any is available (`S:754-757`: `usable` → `pickRecommendation` `S:286`, else the quickest). So **a blind node is researched only when every available node is blind**, which means at the end of its tree.
- **The cost in game 41.** Rome Reborn (800 culture, available from E1, +1 tradition slot, +1 settlement cap, Latinitas II) sat unresearched until about 87% of Exploration. The player then picked it by hand (README: 03:51).

## 1. Valuable unlocks: ranked table

### Value classes

Counts are over all trees, from the game data:

| Class | Effect | Count | Why it matters to us |
|---|---|---|---|
| Settlement cap | `EFFECT_PLAYER_ADJUST_SETTLEMENT_CAP` | 165 rows | One more settlement without −5 Happiness in every settlement (gotcha 44); military and score points |
| Tradition slot | `EFFECT_PLAYER_GRANT_TRADITION_SLOTS` (`MOD_TOT_TRADITION_SLOT`, `G\base-standard\data\progression-trees-common-gameeffects.xml:551`) | 196 rows | One more card for the rest of the age. A tradition slot also takes policies once the policy slots are full (gotcha 24) |
| Specialist cap | `EFFECT_CITY_ADJUST_WORKER_CAP` | 9 | One more specialist on every tile in every city (gotcha 49) |
| Syncretic choice | `EFFECT_PLAYER_GRANT_SYNCRETIC_CHOICE` (`MOD_SYNCRETISM`, `…common-gameeffects.xml:548`) | 3 (ToT AQ/EX/MO) | A unique quarter or a culture slot (gotcha 13) |
| Attribute point | `EFFECT_PLAYER_ATTRIBUTE` | 12 | Future Tech / Civic, ideology branches |
| Great work | `EFFECT_GRANT_GREAT_WORK` | 48 | Codices for science; Modern Future Civic's artifact for culture |
| Victory points | `EFFECT_PLAYER_GRANT_VICTORY_TRACKER_POINTS` | 21 | Innovation (science) or Tourism (culture) |
| Age progress | `EFFECT_PLAYER_ADJUST_AGE_PROGRESS` | 6: Future Tech / Civic only | Ends the age sooner (§3) |

**Pattern.** Slots and caps are concentrated outside the main trees:

| Trees | Nodes | Slot | Cap | Any high-level advisory |
|---|---|---|---|---|
| Main civics | 37 | 3 | 10 | 36 |
| Techs | 48 | 0 | 4 (+4 specialist) | 46 |
| Civilization | 171 | 73 | 47 | 126 (none in Exploration) |
| Test of Time | 106 | 100 | 75 (+3 trait) | 5 |

### Ranked nodes

Ranked by value per cost; Adv = the advisor sees it. Paths are relative to `G`.

| # | Node | Age | Cost | Gives | Adv | Evidence |
|---|---|---|---|---|---|---|
| 1 | ToT Renaissance (Rome Reborn, Egypt, Greece, Han, Maurya, Maya, Mississippian, Persia, America, French Empire…) | EX | 800 | +1 tradition slot, +1 cap, the civ's tradition II; no prerequisite | no | `age-antiquity\data\progression-trees-culture-unique-ex.xml:47, 90-92, 105` |
| 2 | ToT Modernization (Rome, Egypt, Greece, Han, Maurya, Maya, Mississippian, Persia, Chola, Hawaii, Ming, Mongolia, Norman, Songhai, Spain…) | MO | 2000 | +1 slot, +1 cap, traditions II | no | `age-antiquity\data\progression-trees-culture-unique-mo.xml:47, 91-94` |
| 3 | ToT Origins (EX/MO civs played from Antiquity) | AQ | 150 | +1 slot, usually +1 cap (Chola, Qing: + a free Merchant) | 5 of 20 | `age-exploration\data\progression-trees-culture-unique-aq.xml:36-45`; `age-modern\…-unique-aq.xml:36-45` |
| 4 | Irrigation | AQ | 125 | +1 cap, Garden, Hanging Gardens | no (FOOD) | `age-antiquity\data\progression-trees-tech.xml:96, 206` |
| 5 | Civ Antiquity trees, e.g. Rome Legatus pro praetore (250) / SPQR (400); Han Ren (150); Carthage Suffetes (+2 cap) | AQ | 150-400 | slot + cap; Rome's SPQR also the Colosseum | mostly yes (Han Ren no) | `age-antiquity\data\progression-trees-culture-unique.xml:148-149` |
| 6 | Code of Laws | AQ | 245 | +1 slot, Merchant, Petra | yes | `age-antiquity\data\progression-trees-culture-common.xml:89` |
| 7 | Entertainment | AQ | 450 | +1 cap, Colosseum, celebration VP tracker | no (HAPPINESS) | `…culture-common.xml:102, 165` |
| 8 | Organized Military | AQ | 450 | +1 cap | yes | `…culture-common.xml:115` |
| 9 | Currency | AQ | 245 | +1 specialist cap (`MOD_AQ_SPECIALIST_CAP_INCREASE`) | yes | `age-antiquity\data\progression-trees-tech.xml:110` |
| 10 | Exploration civ trees (all base civs) | EX | 800-2000 | 1-2 slots, 1-2 caps, the civ's unique buildings and quarter (Madrasa, Mosque, Casa de Contratación…), unique improvements, traditions; Mongolia Yassa +2 cap, Dai Viet Thanh Hoang +2 slots | no | `age-exploration\data\progression-trees-culture-unique.xml:107-146` |
| 11 | ToT Syncretism | AQ 250 / EX 1200 / MO 3000 | — | A syncretic choice (quarter or culture slot) | no | `age-exploration\data\progression-trees-culture-tot-common.xml:28, 34` |
| 12 | ToT Hierarchy (EX) / Foundation (AQ) / Administration (MO) | — | 1200 / 250 / 3000 | By the civ's ToT attribute trait: a tradition; Cultural adds a wonder (Notre Dame / Pyramid of the Sun / Taj Mahal); Militaristic and Expansionist-wide add +1 cap; Expansionist-tall adds +1 specialist cap | no | `…tot-common.xml:27, 36-52` (EX); traits `age-antiquity\data\civilizations-shared.xml:174-176` (Rome: CULTURAL_TOT_EX/MO) |
| 13 | Authority | EX | 900 | +1 slot | yes | `age-exploration\data\progression-trees-culture-common.xml:72` |
| 14 | Feudalism; Imperialism; Sovereignty; Social Class (+2 Innovation) | EX | 870 / 2100 ×3 | +1 cap each | yes | `age-exploration\data\progression-trees-tech.xml:88`; `…culture-common.xml:96, 104, 111` |
| 15 | Colonialism and Society masteries | EX | mastery | +1 cap each; Society also House of Wisdom; codices | yes | `…culture-common.xml:81, 91` |
| 16 | Education; Urban Planning | EX | 1300 / 3625 | +1 specialist cap each (in the science targets already) | yes | `age-exploration\data\progression-trees-tech.xml:123, 165` |
| 17 | Political Theory | MO | 2750 | +1 slot, ideologies | yes | `age-modern\data\progression-trees-culture-common.xml:96` |
| 18 | Globalism; Nationalism; Hegemony | MO | 3750 / 3750 / 7500 | +1 cap each (Hegemony mastery: World's Fair) | Globalism no | `…culture-common.xml:102, 108, 130` |
| 19 | Electricity; Capitalism | MO | 2425 / 7500 | +1 specialist cap each (`MOD_MO_SPECIALIST_CAP_INCREASE`) | yes | `age-modern\data\progression-trees-tech.xml:79`; `…culture-common.xml:115` |
| 20 | Urbanization and Mass Production masteries | MO | mastery | +1 cap each (Urbanization also +1 population) | yes | `age-modern\data\progression-trees-tech.xml:85, 141` |
| 21 | Ideology branches (Democracy etc.) | MO | 2750 | 2 attribute points, 3-4 free units | yes | `age-modern\data\progression-trees-culture-common.xml:69…` |
| 22 | Future Civic / Future Tech | all | see §3 | attribute, VP, **+10 age progress** | yes (CULTURE / SCIENCE) | §3 |

Also present but rarer: Joseon's city-limit nodes (`EFFECT_ADJUST_CITY_LIMIT`), Mexico's golden-age choices, Sengoku Kinsei +2 cap (EMPIRE_EXPANSION, blind).

## 2. How our research order treats them

1. **Advisor fallback (every focus).** Blind nodes come last (§0).
   - In game 41 the advisor's own picks ran out only near each tree's end. That is why Antiquity took Future Civic ×3 (age 79-94%), Exploration took Future Civic ×3 before Rome Reborn, Hierarchy and Syncretism, and Modern took Roman Modernization only after Nationalism and Militarism (UI.log 04:07).
   - The non-repeatable-first fix (`S:752-753`) stops the Future-before-structure order. It does **not** bring blind nodes forward: they are still behind every advised node.
2. **The culture focus has no research levers at all.** `RESEARCH_TARGETS` (`L:193`) and `BONUS_TARGETS` (`L:272`) have only SCIENCE and ECONOMIC. With CULTURE (game 41's focus all game), `pickVictoryResearch`, `researchTowardPath` and `pickBonusResearch` all return null. Every civic and tech came from the advisor.
3. **Science focus.**
   - **Civics.** The culture tree follows `innovationCivics` (Literacy, Social Class, Innovation wonders, science buildings incl. civ trees, Public Works), then `pickVictoryResearch` (codices, `MOD_EX_SPECIALIST_CAP_INCREASE`, levers), then the advisor. Slots and caps are never targets.
   - **Specialist caps.** Only the Exploration one is a target (`L:197`). Antiquity Currency's `MOD_AQ_SPECIALIST_CAP_INCREASE` and Modern Electricity / Capitalism's `MOD_MO_SPECIALIST_CAP_INCREASE` are not, though gotcha 49 makes specialists the science engine.
4. **Trait-gated rows are invisible to our value code.** `researchCandidates` (`S:312`) and `treeFacts` / `pathTechsLeft` (`S:336, 542`) drop every row with `RequiredTraitType`.
   - So ToT Hierarchy, Foundation and Administration look empty: all their unlocks are trait-gated, `…tot-common.xml:36-52`.
   - So do the civ-unique units of the main trees.
   - A value model must keep the rows whose trait we have (`CivilizationTraits` / `LeaderTraits`, as `data/xpl-autopilot-choices.js:161 traitEffects` reads them).
5. **Masteries.** The advisor treats a mastery as its node, so a mastery that grants a cap (Colonialism, Society, Urbanization, Mass Production) is ranked like any other node. The science path takes the masteries that grant Innovation (`innovationStep`, `researchPlan`). No path asks for a cap mastery.
6. **Future research and noFutureTech.**
   - `noFutureTech` is honoured only in the focus candidates (`S:692`). The advisor fallback's `pool` falls back to `available` when nothing non-repeatable is left (`S:753`), so it is not filtered there. While other nodes remain this does not matter, because the non-repeatable pool wins.
   - `researchPlan` counts `FUTURE_TECH_AHEAD` 2 Future Techs as +3 Innovation each (`S:1709-1717`). It ignores that each one pulls the final age's end 10 points nearer.

**The pattern.** The advisor (and so the autopilot) is blind to exactly the unlocks that matter most for a wide or tall empire:
- settlement caps classed FOOD or HAPPINESS;
- the Test of Time civ trees (slot + cap at 150 / 800 / 2000);
- Exploration's civilization trees (unique buildings, slots, caps);
- Syncretism and Hierarchy.

## 3. Future Tech / Future Civic, exactly

All six nodes are repeatable. Their cost model is `COST_PROGRESSION_PREVIOUS_COPIES`, with param = base cost, so each copy costs the base more than the last (`G\age-*\data\progression-trees-*.xml`: AQ civic `…culture-common.xml:55`, AQ tech `…tech.xml:54`, EX `:58` / `:53`, MO `:67` / `:59`).

| Node | Base cost | Gives each time | Evidence |
|---|---|---|---|
| AQ Future Tech | 1255 | +1 attribute; NextAgeTechBoost +1 ("a boost for a starting Tech in the next Age"); +10 age progress; +2 Innovation | `age-antiquity\data\progression-trees-tech.xml:169-172`; gameeffects `:116-130, 174-179` |
| AQ Future Civic | 1000 | +1 attribute; NextAgeCivicBoost +1; +10 age progress; +5 Tourism (VICTORY_CULTURE_MODERN) | `…culture-common.xml:131-134`; gameeffects `:37-61` |
| EX Future Tech | 4250 | +1 attribute; next-age tech boost; +10 age progress; +3 Innovation | `age-exploration\data\progression-trees-tech.xml:176-179`; gameeffects `:132-155` |
| EX Future Civic | 3000 | +1 random attribute; next-age boost (non-unique civic); +10 age progress; +7 Tourism | `…culture-common.xml:117-120`; gameeffects `:22-46` |
| MO Future Tech | 10000 | +1 attribute; +10 age progress; +3 Innovation | `age-modern\data\progression-trees-tech.xml:191-193`; gameeffects `:69-77, 159-164` |
| MO Future Civic | 8000 | +1 attribute; +10 age progress; **+1 Artifact** (`MOD_MO_ARTIFACT`); **+10 Tourism** | `…culture-common.xml:133-136`; gameeffects `:23-31, 86, 104-113` |

### Age progress

- **The numbers.** `AGE_PROGRESSION_FUTURE_CIVIC` / `_TECH` are 10 points each in every age (`G\age-antiquity\data\victories.xml:27-28`, `age-exploration\…victories.xml:27-28`, `age-modern\…victories.xml:40-41`), against a max of 140 at Standard age length (120 / 160 Abbreviated / Long, `victories.xml:18`; 1 point per turn base).
- **Only we move the clock.** The modifiers carry `HumanOnly=true`. Very likely only a human player's Future research advances the age, so the autopilot (the human slot) is the only one moving the clock this way.
- **Measured in game 41.** The strategy line's age % (normal step about +1.4%/turn) jumped when Exploration's Future Civics completed: 61% → 70% at 03:42:26 and 79% → 86% at 03:44:11. That is about +7% of the age each, which matches 10/140. At game 41's pace (about 2 points a turn) one Future node is about **5 turns of age**. Three Future Civics in Exploration cut it by about 15 turns.

### When Future research helps

- **Culture focus in Modern:** +10 Tourism + 1 artifact is about 15 culture points per research. A wonder is 12 (gotcha 44). It also advances the age, which steps the dominance multiple down sooner (gotcha 32). That is good when we lead, as in game 41 (won by culture at M35).
- **Science:** +2 / +3 Innovation each.
- **Both:** attribute points. In AQ/EX, a boost for a starting node of the next age.
- **Ending the age sooner** is good when our legacy paths are done and rivals' are not, or in the final age when we lead the score race.

### When it hurts

- An unfinished legacy milestone, wonder, conversion or bank plan (gotchas 31, 58): every age deadline jumps 5 turns.
- A rival leading a dominance victory (already `noFutureTech`).
- In the final age, our own science race. Each Future Tech is +3 Innovation but brings the score-victory end about 5 turns nearer, and `researchPlan` counts only the +3.

### No choice once a tree is done

When a tree has nothing else, the game still wants a choice, so a Future node is unavoidable. The choice only matters while other nodes remain. Not checked: whether an idle tree would hold the turn.

## 4. Proposed rules (ranked by value / effort)

| # | Rule | Expected impact | Effort | Test |
|---|---|---|---|---|
| 1 | **Structural first.** Among available non-repeatable nodes, take one whose next depth grants a settlement cap, tradition slot, specialist cap or syncretic choice before the advisor's pick (the cheapest by turns). Detect it by the modifier's effect: `GameInfo.Modifiers` → `DynamicModifiers.EffectType`, as `core/xpl-effect-value.js` already resolves. Place it after walls/melee/seas and the science gate; a gate within its way may stay first. | ToT Renaissance at E1-E3 instead of about E60 (+1 slot, +1 cap for about 55 turns); ToT Modernization early Modern; Irrigation and Entertainment early Antiquity; Exploration civ slots and caps. In game 41 about 4 structural nodes a game came 30-60 turns late. | S (one pure ranking fn + an adapter) | Fake tree: advisor recommends main nodes only; available Rome Reborn (cap + slot) → chosen. Same with a gate pending → gate first. |
| 2 | **Keep our trait rows.** `researchCandidates` / `treeFacts` keep a `RequiredTraitType` row when we have that trait. | Hierarchy, Foundation and Administration valued (cap / specialist / wonder by attribute); civ units visible | S | Fake civ with `TRAIT_ATTRIBUTE_MILITARISTIC_TOT_EX`: Hierarchy's targets include `MOD_EX_SETTLEMENT_CAP_INCREASE`. |
| 3 | **A value score for blind nodes.** In the fallback, when the advisor's pick is worth less than a blind node by a simple unlock model, take the blind node. Weighted value per turn of research: cap 1, slot 1, specialist cap 1, syncretism 1, unique building or quarter 0.5, wonder 0.3, great work 0.3, VP 0.1/pt. Blind = no MILITARY/CULTURE/SCIENCE/ECONOMIC class in `ProgressionTree_Advisories`. | Exploration civ trees (unique quarters: the planner already values them, gotcha 13), Syncretism, Globalism | M | Pure core test on a table of candidates; the adapter test with a blind civ node vs an advised main node of equal turns. |
| 4 | **Culture focus research levers.** `RESEARCH_TARGETS.CULTURE`: Modern Future Civic (+10 Tourism, artifact) while we lead culture or within the block; Natural History (explorers, archaeology) and the Hegemony mastery (World's Fair); wonder unlocks when the culture overlay wants wonders. | Culture focus gets a research plan. Each Modern Future Civic is about 15 culture points. | M | Fake Modern: culture focus, leader us → Future Civic before a plain civic; a rival leading the culture countdown → not. |
| 5 | **Future research and the clock.** In `researchPlan` / `spaceRace` (final age, score victory on), count each planned Future Tech's 10 age points against `ageOutlook().turnsLeft`. Skip Future Tech when its Innovation does not bring the goal before the shortened end. Also apply `noFutureTech` in the fallback pool (`S:753`) while any other node exists. | Avoids racing ourselves out of time; consistent with the rival rule | S-M | Race test: +3 Innovation that misses by fewer turns than it costs → not planned. |
| 6 | **All specialist caps for science.** `/SPECIALIST_CAP_INCREASE$/` in the science targets (`L:197`), not only `MOD_EX_`. | Currency (AQ), Electricity and Capitalism (MO) wanted by the science path | XS | Unit test on `wantedResearch`. |
| 7 | **Cap research when the cap binds.** With settlements ≥ cap and a settler or a site waiting (or `fillCap` / the military lever on), rank cap nodes and masteries (Colonialism, Society, Urbanization, Mass Production) above any other non-gate research. | More settlements without the −5 Happiness each (gotcha 44); military points | S (on top of rule 1) | Fake: at cap with a settler idle → the cap mastery chosen. |
| 8 | **Probe.** UI.log `research: <node> done: age points X → Y` when a Future node completes, and the `"*"` picks with each node's advisory classes. | Confirms 10 points at our speed, and the blind-advisor model, in the next game | XS | — |

**Order of work.** Rules 1 + 2 + 6 first: small, and they cover game 41's misses. Then 5 (correctness in the final age), 4 (the culture focus), 3 and 7.
