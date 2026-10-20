# 40 notes: legacy paths, triumphs, age progress and age transitions

Read-only audit, 2026-10-20 (game 1.5, after game 41). Paths: `<M>` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules\`, `<U>` = `mod\expansion-planner\ui\`, `<L>` = `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\` (game 41: Rome, culture focus; Modern still running).
Status tags: VERIFIED (data, code or logs read), INFERRED (reasoned from them), OPEN (needs a probe).

## 0. Summary: what we miss

| # | Hidden value | Size | What we do today |
|---|---|---|---|
| 1 | **Our own Future Tech/Civic is the only player-driven age accelerator** (+10 age progress each, `HumanOnly`; AIs' do not count). Game 41 logged Future Civic 3× in Antiquity's last fifth and 4× in Exploration. | 10 points = up to 10 turns of base clock each; 30-40 points shaved ≈ a quarter of an age | Repeatables now go last (uncommitted fix, steps.js:747-756), but science's `pickBonusResearch` still takes Future Tech on purpose in Antiquity/Exploration; no age-speed policy at all |
| 2 | **Antiquity military path = settlement count** (6 / 9 / 12, conquest 2 each). M1 = +1 Militaristic/Expansionist attribute point next age; M1+M2 = «Fealty» card: **+2 settlement limit for all of Exploration**. | 1 attribute point; +2 cap for ~60 turns | Never counted (military is excluded from the focus). Game 41 ended Antiquity at 6 settlements with cap 8 (two empty cap slots), 3 short of Fealty |
| 3 | **Exploration homeland settlements**: 16 (previous-age ones count) → «We Have Habsburgs at Home» dedication = **+2 settlement limit in Modern** (= +8 military victory points, gotcha 44). Distant-lands settlements also fill the Exploration military path (4/8/12). | +2 Modern cap | Game 41 ended Exploration at 12 settlements, cap 16: four empty cap slots |
| 4 | **Every milestone of every path = 1 legacy point of that class**, spendable on a **repeatable 1-point attribute card** next age (or 2-point milestone cards). Off-focus milestone 1 is cheap in most paths. | Up to ~6 extra attribute points per game | Focus picks one path; other paths are only read for scoring the focus |
| 5 | Cheap **minor triumphs** (instant, this-age rewards): Exploration «Gregarious Animal» (a diplomatic action with every leader → **+1 social policy slot**), «Nau We Sail» (first to Shipbuilding → **2 free settlers**), Antiquity «From Nagû to Nagû» (33% map → free settler), «Abracadabacus» (first to Mathematics → +25% project production). | a policy slot; 2-3 settlers | Triumphs only add a +0.05 bonus to the focus score and get «Отслеживать» ticked; nothing steers toward them |
| 6 | The 3 Wildcard points per transition are the dedications' whole budget; keep-cities eats one, the default +1 policy slot usually another. A major triumph's dedication must beat those to matter. | (sizing) | Cards are the player's (by design) |

## 1. How legacy points work end to end (VERIFIED unless tagged)

### 1.1 Age progress
- **Clock:** 140 points standard (120 abbreviated, 160 long) per age; +1 every turn, not scaled by game speed (`<M>age-antiquity\data\victories.xml:18,21`; the same rows in exploration `:18,21`, modern `:31,34`).
- **Events** (`AgeProgressionEvents`):

| Event | Antiquity | Exploration | Modern |
|---|---|---|---|
| Path milestone 1 | 5 | 5 | 5 |
| Path milestone 2 | 5 | 10 | 10 |
| Path milestone 3 (final) | 10 | 20 | 0 |
| Future Civic | 10 | 10 | 10 |
| Future Tech | 10 | 10 | 10 |
| Player eliminated | 0 | 0 | 0 |

  Sources: antiquity `victories.xml:24-29`, exploration `:24-29`, modern `:37-42`.
- **Future Tech/Civic count only for humans:** `MOD_AQ_FUTURE_CIVIC_AGE_PROGRESS` has `HumanOnly=true` (`<M>age-antiquity\data\progression-trees-culture-common-gameeffects.xml:47-50`); the same for every Future Tech/Civic in all three ages (`grep HumanOnly`: AQ tech `:128`, EX civic `:34`, EX tech `:144`, MO civic `:29`, MO tech `:75`). In single player **only the autopilot can speed the age this way.**
- **Milestones count once each (INFERRED):** the age-rankings screen sums `getMilestoneProgressionPoints(type)` for milestones `isMilestoneComplete(type)` (`<M>base-standard\ui\age-rankings\model-age-rankings.js:23-41`), i.e. a milestone is one global flag. The game lengths fit that: at most 4 × 20 = 80 Antiquity points from milestones; game 41's Antiquity lasted 69 turns (69 + ~71 = 140). If every player's milestone counted, ages would end in ~30 turns. So **our milestone adds age progress only if we are first to it.**
- **The last 5%:** at 95% no more progress except turns, and a 10-turn countdown runs (Civilopedia text, `base-standard\text\en_us`, "Once the meter is at 95%…").
- **What each Future node also gives** (Antiquity; Exploration/Modern alike, bigger numbers):
  - +1 random attribute point (`…culture-common-gameeffects.xml:37-40`);
  - a boost for a starting tech/civic of the next age (`:41-46`, `NextAgeCivicBoost`);
  - victory points that count in Modern: Future Civic **+5 culture** (AQ, `:52-60`), +7 (EX), +10 (MO); Future Tech **+2 Innovation** (AQ, `progression-trees-tech-gameeffects.xml:174-183`), +3 (EX `:147-155`), +3 (MO).
  - Costs: AQ civic 1000 / tech 1255, EX 3000 / 4250, MO 8000 / 10000, rising per copy (`progression-trees-*.xml`, `Repeatable`, `COST_PROGRESSION_PREVIOUS_COPIES`).

### 1.2 Milestones (thresholds; data `AgeProgressionMilestones`)

| Age | Culture | Military | Science | Economic |
|---|---|---|---|---|
| Antiquity | 2 / 4 / 7 wonders | **6 / 9 / 12 settlement points** (1 each, conquered 2) | 3 / 6 / 10 codices displayed | 7 / 14 / 20 resources assigned |
| Exploration | 6 / 9 / 12 relics | 4 / 8 / 12 Distant Lands points (1, conquered 2, our religion 2, both 4) | 1 / 3 / 5 districts at 40 yield | 10 / 20 / 30 treasure |
| Modern | 5 / 10 / 15 artifacts | 10 / 15 / 20 ideology conquest | 1 / 2 / 3 space projects | 150 / 300 / 500 rail points |

Sources: antiquity `victories.xml:47-68` (scoring), `:201-214`; exploration `:65-101`, `:209-220`; modern `:72-99`, `:206-217`. (research/11 has the same table; the Antiquity military row there says "settlements": it is **every** settlement we hold, `NonConquest` VP 1, `:54-56`.)

### 1.3 What a milestone gives
Each milestone grants **1 legacy point of its class at once** (`AGE_REWARD_LEGACY_POINT_*`, `IsImmediate`, antiquity `victories.xml:216-241`) and unlocks one card class for the transition (`<M>age-antiquity\data\legacy-path-gameeffects.xml:3-38`: `UNLOCK_AT_LEAST_THIRD_*` = M1, `_SECOND_*` = M2, `UNLOCK_WON_*` = M3).

Transition cards bought with class points (Exploration's set, `<M>age-exploration\data\age-transition.xml:135-159`; Modern's `age-modern\data\age-transition.xml:130-176`):

| Unlock | Card | Cost | Effect next age |
|---|---|---|---|
| M1 (any path) | Attribute point (science, economic; military → militaristic **or** expansionist; culture → cultural **or** diplomatic) | 1 of the class | +1 attribute point. **No IndividualLimit: repeatable**, so every class point is at least one attribute point (`:154-159`) |
| AQ science M2 | Collector of Knowledge | 2 | +1 science per codex we had in Antiquity |
| AQ culture M2 | Wondrous Heritage | 2 | +1 culture +1 happiness per wonder |
| AQ economic M2 | Master Caravaneer | 2 | +5 gold per trade route made in Antiquity (`PROPERTY_ANTIQUITY_TRADE_ROUTE_TOTAL`, `<M>base-standard\scripts\age-transition-post-load.js:1468-1491`) |
| AQ military M2 | **Fealty** | 2 | **+2 settlement limit** (`VictoriesText.xml` `…MILITARY_MILESTONE_2_DESCRIPTION`) |
| AQ science M3 | Great Library Golden Age | 2 | Academies keep yields/adjacency/effects in Exploration |
| AQ culture M3 | Wonders Golden Age | 2 | Amphitheaters kept likewise |
| AQ military M3 | Pax Imperatoria Golden Age | 2 | an infantry unit in every settlement conquered |
| AQ economic M3 | (none now) | - | `UNLOCK_WON_ECONOMIC_VICTORY_1` has no card: "cities remain cities" moved to a free-for-all Wildcard card (below). **The Antiquity economic path's 3rd milestone is worth only its point.** |
| EX science M2 / M3 | Lyceums (+3 science per quarter) / Golden Age Universities | 2 / 2 | |
| EX culture M2 / M3 | Deep Roots (+2 culture per relic) / keep founder beliefs | 2 / 2 | |
| EX economic M2 | Tap the Source (+2 gold per unique resource) | 2 | |
| EX military M2 / M3 | Land of Opportunity (+10 production in DL settlements) / infantry + ranged in DL settlements | 2 / 2 | |

Modern (final age) milestones give a legacy point that only feeds +10% production per point toward Operation Ivy / World's Fair (`<M>base-standard\data\legacy-path-gameeffects.xml:29-38`; the science one targets `PROJECT_LAUNCH_ROCKET`, a project no tech unlocks now, so INFERRED dead), plus the M3 unlocks (Manhattan/Ivy, Keynes, World's Fair; `age-modern\data\victories.xml:233-240`).

### 1.4 Wildcard points, dedications, keep-cities
- **3 Wildcard points** per transition for everyone (`AgeTransitionLegacyPoints`, `age-exploration\data\age-transition.xml:9-12`, `age-modern\…:9-12`). Wild points pay for any card; class points pay only their class (`<M>base-standard\ui\advanced-start\model-advanced-start.js:256-267`).
- **Wildcard cards (1 each):** the defaults (2 merchants, 2 settlers, 250/500 influence, +1 social policy slot; `age-transition.xml:200-203`, text `LOC_UNLOCK_AQ_DEFAULT_*`), **keep-cities** (`CARD_AT_EXP_GOLDEN_AGE_ECONOMIC`, generated per regressed city: `age-transition-post-load.js:1433-1466`), crisis cards, and **one dedication per major triumph** (`CARD_AT_EX_<TAG>_<n>`, `age-transition.xml:204+`, unlocked by `UNLOCK_AQ_*`, `age-antiquity\data\unlocks.xml:147+`).
- **Game 41's picks** (`<L>AdvancedStartCardSelection.log`): Exploration: keep-cities, Code of Hammurabi (+1 tradition slot), +1 social policy slot; Modern: Wonders of the Renaissance (CARD_AT_MO_CULTURAL_2), keep-cities, Religious Tolerance (crisis). No class-point card appears in that log for anyone, AIs included: OPEN whether class cards are logged there at all (probe P-LEG-1).

### 1.5 Triumphs (Legacies) worth knowing
`Legacies` rows: `MajorLegacy` default = a dedication next age; `MajorLegacy="false"` = an instant reward now; `FirstPlayerOnly` = a race (`<M>age-antiquity\data\legacies.xml:171-205`, exploration `:170-205`; all Modern ones are minor). Final-age score: +1 per triumph completed (`base-standard\data\victories.xml:129`).

| Triumph | Age | Kind | Trigger | Reward | Cheap for us? |
|---|---|---|---|---|---|
| Gregarious Animal (EX_DIPLOMATIC_4) | EX | minor | a diplomatic action started with **every** leader | **+1 social policy slot** | Yes: our endeavors go to the worst-relationship leader first, not round-robin (`<U>data\xpl-autopilot-choices.js:1611-1680`). An AI took it at T58 in game 41 (`<L>Player_Legacies.csv`) |
| Nau We Sail (EX_EXPLORER_3) | EX | minor, race | first to Shipbuilding | **2 free settlers** | Shipbuilding goes first only for the economic focus or blocked seas (`<U>data\xpl-autopilot-steps.js:681-689`) |
| From Nagû to Nagû (AQ_EXPANSIONIST_4) | AQ | minor | reveal 33% of the map | 1 free settler | Scouts explore (2 trained); not measured |
| Abracadabacus (AQ_SCIENTIFIC_4) | AQ | minor, race | first to Mathematics | +25% project production this age | Science focus heads there; others not |
| I Know That I Know Nothing (AQ_CULTURAL_4) | AQ | minor, race | first to Philosophy | +1 happiness on culture buildings | We got it at T47 (game 41) |
| Bread & Circuses / Sejong / Brave New World | all | minor | 50 / 150 / 250 excess happiness in one settlement | +1 tradition slot | Rare; an AI got the Antiquity one at T37 |
| Code of Hammurabi (AQ_CULTURAL_3) | AQ | major, race | first to slot 9 policies/traditions | dedication: +1 tradition slot, +2 culture per card | We got it (T54) |
| We Have Habsburgs at Home (EX_EXPANSIONIST_2) | EX | major | 16 homeland settlements (old ones count) | dedication: **+2 settlement limit** | 12 at the end in game 41 |
| Pax Imperatoria (AQ_MILITARISTIC_1) | AQ | major | conquer and hold 6 | dedication: +2 settlement limit | No (defensive) |
| Round Earther / Celestial Spheres (AQ_SCI_1, EX_SCI_2) | AQ/EX | major | the age's two science projects | dedication: free Astronomy/Academics + 25% projects | Science focus only |
| Kaogongji / Enlightenment (AQ_SCI_2, EX_SCI_1) | AQ/EX | major | 5 districts at 30 / 75 | dedication: +1 specialist limit in cities | District probe exists (`probeDistricts`) |
| Crisis triumphs (AQ_*_CRISIS_n, EX_*_CRISIS_n) | AQ/EX | major | a crisis story taken with the crisis's narrative tag (`legacies-gameeffects.xml:189-199`) | crisis wildcard cards next age | Story choice ignores it (`chooseStory`, choices.js:666) |

## 2. What the autopilot does today (VERIFIED, code)
- **One focus path:** `FOCUS_CLASSES = CULTURE, SCIENCE, ECONOMIC` (never military; `<U>core\xpl-victory-focus.js:19`). `scoreFocus` uses the other paths only to choose the focus (`:300-318`).
- **Triumphs:** close ones of the focus's kind add +0.05 each (max 0.15) to its score (`:273-291`); up to 3 are ticked «Отслеживать» (display only: `<U>hud\xpl-triumph-tracker.js`, `hud\xpl-autopilot.js:49,53,298-305`). Nothing pursues a triumph.
- **Age speed:** `noFutureTech` only while a rival's dominance race is DANGER (`<U>core\xpl-strategy.js:98-115`; steps.js:690-692). Repeatables now come after every other node (steps.js:747-756, uncommitted, after game 41). But science's bonus research (`BONUS_TARGETS SCIENCE /_SCIENCE_VP$/`, `core\xpl-victory-levers.js:268-285`) matches `MOD_AQ_FUTURE_TECH_SCIENCE_VP` / `MOD_EX_FUTURE_TECH_SCIENCE_VP`, and the path's own choices "still take a repeatable node on purpose" (steps.js:750-751). `ageOutlook` measures the age's pace (`data\xpl-town-job.js:118-132`) but nothing decides it.
- **Settlements:** Antiquity GROWTH ends at 25% (50% while 2+ below the cap), and only the final age fills the cap (`core\xpl-strategy.js:33-45`, `:194-205`).
- **Transitions:** the cards and dedications are the player's; the autopilot stops for them and resumes (hud/xpl-autopilot.js:838-850).
- **Crises:** crisis policy cards are slotted least-bad, valued per settlement Happiness (choices.js:406-460); conversions wait or not by `crisisOn` (steps.js:5070-5161); revolts buy Happiness (gotcha 66). Crisis stages run at 70/80/90/100% of the age, at least 5 turns each (`<M>age-antiquity\data\crisis-stages.xml:11-24`), so any age progress we add pulls the crisis forward too.

## 3. Evidence from game 41 (`<L>`, read 2026-10-20)
- `Player_Stats.csv`, last row per age, player 0: **Antiquity T69: 4 cities + 2 towns = 6, cap 8**; **Exploration T61: 7 + 5 = 12, cap 16**; Modern T35: 18, cap 22. Rivals: 3-5 settlements in Antiquity, 9-12 in Exploration.
- UI.log `autopilot: CIVIC ["Общество будущего"]` (Future Civic) at 03:26:21, 03:27:14, 03:28:32 (Antiquity, about 81-100%) and 03:41:49, 03:42:26, 03:44:12, 03:55:37 (Exploration). Each completed one is +10 age progress that only we can add (OPEN: one line per completion or per re-pick; count completions in `net_message_debug.log`, probe P-AGE-1).
- `Player_Legacies.csv`: ours AQ_CULTURAL_4, AQ_DIPLOMATIC_4, AQ_DIPLOMATIC_3, AQ_CULTURAL_3, AQ_CULTURAL_5, two plague-crisis ones, EX_CULTURAL_2, EX_RELIGION_CRISIS_1, MO_DIPLOMATIC_1, MO_CULTURAL_3, MO_CULTURAL_2. **EX_DIPLOMATIC_4 (the policy slot) went to player 6 at T58.**
- Ages: Antiquity 69 turns, Exploration 61: about 70-80 of each age's 140 points came from events.

## 4. When to speed up or slow down the age (INFERRED policy)
- **Slow (the default before the final age):** a longer age is more turns of the age's yields toward milestones, triumphs, conversions and buildings. Every non-final age ends by taking cities (gotcha 31), progress in production (gotcha 58) and adjacency (gotcha 50). So Future Tech/Civic before the final age has a real cost (~10 turns of base clock each, less in practice because event points also accrue) against +1 random attribute point, a next-age boost and 2-7 victory points.
- **Fast:**
  - our own focus path done and nothing else within reach, while a rival's path is close (their dominance multiple falls with age progress: gotcha 32; the reverse of `noFutureTech`);
  - a crisis that hurts us (unhappy cities, plague) once its stage 4 has started;
  - **the final age with the score victory on, when we lead the score places and no rival countdown is near** (gotcha 39: one countdown turn is 1000 score; a shorter game gives a rival fewer turns to start one).
- **Things that advance the age without our knowing:** our Future Tech/Civic (human only); being first to a milestone (+5/5/10, +5/10/20, +5/10/0). Nothing else.

## 5. Proposals, ranked by value / effort

| # | Proposal | Value | Effort | Test (fails without it) | Evidence |
|---|---|---|---|---|---|
| P1 | **Age-pace rule for repeatables.** Before the final age, a repeatable node only when nothing else is available, for every focus (remove Future Tech from science's `pickBonusResearch` before Modern, and from the path's own picks); with only repeatables left, the one whose rewards suit the focus (culture: Future Civic's culture points). In the final age, deliberately take them when we lead the score and no rival countdown is within N turns. UI.log: `age: P/140 (+10 from our Future Civic)`. | High: each skipped one keeps up to ~10 turns of the age | Low | science focus in Antiquity, a mastery and Future Tech both available: the mastery is picked; final age, score leader, only Future Tech left: picked; behind: a non-repeatable picked | §1.1, §3, steps.js:747-756, levers.js:268-285 |
| P2 | **Antiquity military milestones by settlement count.** A `legacyFacts` input: our settlement points (`player.LegacyPaths.getScore("LEGACY_PATH_ANTIQUITY_MILITARY")`) and the next threshold. In BUILD, keep training settlers below the cap while the next military milestone (6, then 9) is within the cap's room and a safe site exists; near the age's end, one settlement over the cap for 9 when its Happiness cost (5 a settlement) fits. Settlers still never go ahead of a raced wonder (gotcha 20). | High: +1 attribute point (M1) and «Fealty» (+2 cap all of Exploration) | Medium (settler training and `settleNear` exist for the final age) | facts: 7 settlements, cap 9, 40% of Antiquity, site known → settler wanted; 9 settlements → none for the military path | game 41: 6 settlements, cap 8 at T69 |
| P3 | **Exploration: fill the cap, aim at 16 homeland settlements.** In BUILD, settlers while below the cap and a safe site is known; log progress toward EX_EXPANSIONIST_2 (16 → +2 Modern cap) and the Distant Lands military path (4/8). | High for military/score in Modern (each settlement 4 points: gotcha 44) | Medium | 12 settlements, cap 16, 60% of Exploration, sites known → settlers queued | game 41: 12 / 16 at T61 |
| P4 | **Off-focus milestone pushes.** Read every path's score and next threshold each pass; when another path's next milestone is within reach this age at small cost, take it: AQ science 3 codices (a Library + codex slotting), AQ culture 2 wonders, AQ economic 7 assigned (already happens), EX science one 40-yield district (stack specialists on one tile, as the focus does), EX military 4 DL points (settle 2-4 in Distant Lands). Log `legacy: CULTURE 1/2 (M1 at 2), SCIENCE 3/3 done, …` once a turn and at the age's end. | Medium-high: 1 attribute point per milestone (repeatable card), several a game | Medium | science focus, culture at 1 of 2 wonders with a wonder winnable in 8 turns → that wonder is ordered | data §1.2-1.3 |
| P5 | **Cheap minor triumphs.** (a) EX_DIPLOMATIC_4: endeavors round-robin to leaders never targeted this age (remember in the game memory, gotcha 57) until the triumph is done; (b) EX_EXPLORER_3: Shipbuilding first in Exploration for every focus while the race is open (`raceWinner` -1) and it is among the first few techs; (c) AQ_EXPANSIONIST_4: a scout keeps exploring until 33% is revealed. | Medium: a policy slot, 2 settlers, a settler | Low each | (a) three leaders, one never targeted: the endeavor goes to it; (b) the race open: Shipbuilding's way picked | `Player_Legacies.csv` (AI got EX_DIPLOMATIC_4 T58) |
| P6 | **Legacy line in the Autopilot tab** at each age's last 10 turns: class points earned, the cards they open (Fealty, Lyceums…), the 3 Wildcard points, keep-cities. The player picks with that in view (cards stay the player's). | Medium (better picks) | Low-medium (UI + LOC strings) | render test with a fake standings list | §1.3-1.4 |
| P7 | **Crisis stories: prefer the option that carries the crisis's narrative tag** (it unlocks a next-age crisis card). | Low (wild points are scarce) | Low | two options, one with `NARRATIVE_TAG_CRISIS_*` and equal value: that one | legacies-gameeffects.xml:189-199 |
| P8 | **Don't over-value the Antiquity economic path's 3rd milestone**: its golden age card no longer exists (keep-cities is a wildcard card for all). For the economic focus, M2 («Master Caravaneer», +5 gold per Antiquity trade route) is the real card. | Low | Low | - | §1.3 |

## 6. Probes
- **P-LEG-1:** at a transition, read `player.LegacyPaths` scores and the class points offered (`Players.AdvancedStart.get(pid).getLegacyPoints()`, model-advanced-start.js:257) into UI.log; check whether class cards show in `AdvancedStartCardSelection.log`.
- **P-AGE-1:** once a turn, `Game.AgeProgressManager.getCurrentAgeProgressionPoints()` with the delta and its cause (our Future node completed this turn; milestones `isMilestoneComplete` newly true). Confirms that milestones count once and that only our Future nodes add +10.
- **P-AGE-2:** for each of our Future Tech/Civic completions, the turn and the age's points before/after (`net_message_debug.log` SET_*_TREE_NODE with the node's hash).
