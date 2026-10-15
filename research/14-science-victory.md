# 14. The science victory and the science path of every age: what scores, what the autopilot lacks (game 1.5)

Read-only research, 2026-10-13, before a science-focused game. `<M>` = `Base\modules\`, `AQ` / `EX` / `MO` = `<M>age-antiquity|exploration|modern\data\`. Builds on research/11 (paths, triumphs), 12 (victories, projects) and 13 (paths by age). The list of every Innovation source was made with a scratch script over all module XML files: each `EFFECT_PLAYER_GRANT_VICTORY_TRACKER_POINTS` modifier with `VictoryType` `VICTORY_SCIENCE_MODERN`, plus what attaches it.

## The victory: 100 Innovation, then a 5-turn countdown
- **Definition:** `VICTORY_SCIENCE_MODERN` (`<M>base-standard\data\victories.xml:84`).
  - `ScoringType` `COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE`, `MinimumPoints` 100, `CountdownDuration` 5.
  - Prerequisite `REQSET_MODERN_VICTORY_SCIENCE_PREREQ`: an **undamaged** `BUILDING_LAUNCH_PAD` (victories-gameeffects.xml:19-26).
  - So it is not a race against a rival's score: reach 100, keep a Launch Pad intact, and survive 5 turns.
- **Trackers** (victories.xml:120-125):
  - `VICTORY_TRACKER_SCIENCE_GAME_EFFECTS`, `StaticCarryover`: everything granted by modifiers (projects, masteries, wonders, civics). Earned points carry across ages.
  - `VICTORY_TRACKER_CODICES`: **1 per codex displayed** (`GREATWORKOBJECT_WRITING`), `StaticCarryover`. The Antiquity codex path keeps paying here.
  - `VICTORY_TRACKER_PROJECT_COMPLETION` `PROJECT_LAUNCH_ROCKET`: probably unreachable (research/12).
  - `VICTORY_TRACKER_LEGACY_EX_CULTURAL_4`: Modern wonders, 2 each, only when that Exploration triumph activated it.
- **Reading it:**
  - Points: `player.Victories.getPointsForVictoryType(hash)`.
  - Countdown: `Game.VictoryManager.getVictoryCountdownStatus(hash)` → `{isDominant, turns, prereqs}`.
  - Both are read in `<M>base-standard\ui-next\screens\victories\victories-screen-model.js` (research/12).

## Innovation sources (base game)
| Age | Source | Innovation | Unlock |
|---|---|---|---|
| Antiquity | `PROJECT_CHART_THE_STARS`, `PROJECT_SPHERICAL_EARTH` | 5 each | projects |
| | Civic Literacy (`MOD_AQ_LITERACY_SCIENCE_VP`) | 2 | `NODE_CIVIC_AQ_MAIN_LITERACY`, depth 1 |
| | Great Library, Nalanda | 3 each | wonders (`IsCurrentAge`, `ReplacePoints`: whether they still count after the age is not verified) |
| | Future Tech (`MOD_AQ_FUTURE_TECH_SCIENCE_VP`) | 2 | each Future Tech |
| | Codices displayed | 1 each | codices tracker, carried over |
| Exploration | `PROJECT_INVENT_CALCULUS` | 10 | project |
| | `PROJECT_HELIOCENTRIC_MODEL` | 5 | project |
| | Civic Social Class | 2 | `NODE_CIVIC_EX_MAIN_SOCIAL_CLASS`, depth 1 |
| | Masteries: Metallurgy, Shipbuilding, Metal Casting, Architecture | 2 each | `UnlockDepth` 2 |
| | Future Tech | 3 | |
| | House of Wisdom, Shwedagon Zedi Daw | 3 each | wonders |
| Modern | `PROJECT_CREWED_SPACE_FLIGHT_PREP` | **15, repeatable** | Rocketry; cost 2000; **needs a Launch Pad in that city** |
| | `PROJECT_TRANS_OCEANIC_FLIGHT` | 5 (once) | Flight; cost 1000; **Airfield in that city** |
| | `PROJECT_BREAK_SOUND_BARRIER` | 5 (once) | Aerodynamics; cost 1000; **Airfield in that city** |
| | `PROJECT_LAUNCH_SATELLITE` | 5 (once) | Rocketry; cost 1000; Launch Pad in that city; reveals the map |
| | `PROJECT_CREWED_SPACE_FLIGHT_RESEARCH` | 5 (once) | Radio; cost 1200; **Radio Station in that city** |
| | Tech Rocketry (depth 1), mastery Aerodynamics | 5 each | |
| | Masteries: Armor, Industrialization, Electricity, Radio, Combustion | 2 each | `UnlockDepth` 2 |
| | Future Tech | 3 | |
| | Oxford University, Manhattan Project | 3 each | wonders |

- **Every modifier id ends in `_SCIENCE_VP` or `_VP`.** A tech-tree unlock row whose `TargetType` ends in `_SCIENCE_VP` is a research target in itself.
- **Not in a normal game:** the advanced-start grant (`TRAIT_MOD_ADVANCED_START_INNOVATION`, 15 in Exploration, 45 in Modern) needs `IS_AGE_COUNT 1`, a game that starts in that age.
- **A rough budget for a full game:**
  - Antiquity about 15–30 (projects 10, Literacy 2, codices up to 10+, wonders).
  - Exploration about 20–35 (projects 15, masteries 8, Social Class 2, wonders).
  - Modern without the repeatable project: about 35 (masteries 10, Rocketry 5, Aerodynamics 5, four projects 20).
  - The rest has to come from Crewed Space Flight Prep at 15 each: likely 2–4 runs of 2000 production. **Launch Pads in several cities, each running it**, are the way to finish quickly.

## The Modern science legacy path: 1 / 2 / 3 space projects
- **Milestones:** `LEGACY_PATH_MODERN_SCIENCE` (MO victories.xml:206-208), in the game's quest order:
  1. Flight → Airfield → Trans-Oceanic Flight.
  2. Aerodynamics → Break the Sound Barrier.
  3. Rocketry → Launch Pad → Launch Satellite.
  - Each project can be done once per civilization (`MaxPlayerInstances 1`).
- **Rewards:** each milestone gives a science legacy point. The last one gives +10% Launch Rocket production per legacy point; that project is deprecated.
- **What the AI weighs** (`LegacyPathStrategyThreeLaunches*`): Airfield 500, Launch Pad 500, the three projects 1000 each, `YIELD_SCIENCE` 100, `PSEUDOYIELD_VICTORY_PROJECT` 300.
- **Completing the path is not the victory.** The 100 Innovation mostly come after it (Crewed Space Flight Prep).
  - The focus scorer switches away at once from a completed path (`chooseFocus`: `current.done`). In the final age, with «Цель победы» = Авто, that drops the science victory just as it starts.
  - The economy has the same problem: its GDP race goes on after the 500 railroad points.

## Modern buildings for the path
All of them can be bought with gold (no `Purchasable="false"`). Cost grows with the city's previous buildings (`COST_PROGRESSION_PREVIOUS_BUILDINGS_CITY`).

| Building | Unlock | Cost | Notes |
|---|---|---|---|
| `BUILDING_AIRFIELD` | Flight | 840 | flat tile, `FULL_TILE`, +9 production; needed for 2 path projects |
| `BUILDING_LAUNCH_PAD` | Rocketry | 840 | flat tile, `FULL_TILE`, +18 science; the victory's prerequisite; one per city running Crewed Prep |
| `BUILDING_RADIO_STATION` | Radio | 780 | influence and happiness; needed for Crewed Space Flight Research |
| `BUILDING_LABORATORY` | Electricity | 780 | +12 science |
| `BUILDING_SCHOOLHOUSE` | Academics | 420 | +9 science |

## Science triumphs (`legacies.xml` of each age; rewards from the game text)
| Triumph | Trigger | Reward |
|---|---|---|
| AQ_1 | Chart the Stars + Spherical Earth | unlocks Astronomy, +25% production for projects |
| AQ_2 | 5 urban tiles (not the centre) with 30+ yield | +1 specialist limit |
| AQ_3 | 12 codices displayed | +1 great-work slot in science buildings, +2 science per displayed work |
| AQ_4 | first to Mathematics | +25% production for projects this age |
| AQ_5 | first to every tech and mastery | +1 population in cities |
| EX_1 | 5 urban tiles with 75+ yield | +1 specialist limit |
| EX_2 | Heliocentric Model + Invent Calculus | unlocks Academics, +25% production for projects |
| EX_3 | first to Gunpowder | +1 naval movement |
| EX_4 | 7 Universities | +1000 GDP at the first Innovation project |
| EX_5 | first to every tech and mastery | +1 population |
| MO_1 | first to Flight | +10 science on Airfields |
| MO_2 | first to finish Break the Sound Barrier («Чудо над Мохаве») | +10 production on Airfields |
| MO_3 | first to Operation Ivy | 25 Dominion |
| MO_4 | 5 urban tiles with 120+ yield («Составная прибыль») | **+50% production for projects** |
| MO_5 | first to every tech (E=mc²) | +4 production on Laboratories |

- **Worth pushing:** MO_4 (Crewed Prep is 2000 production), AQ_1 / EX_2 (the autopilot already queues those projects), MO_1 / MO_2 (they come with the path's own research and Airfield).

## What the autopilot does for science today, and what it lacks
- **Already there** (the same machinery that won two economy games):
  - **Antiquity:** Library and Academy in every city (codex slots; bought by cities with gold above the reserve), codex research and Literacy first, archived works slotted, Chart the Stars and Spherical Earth.
  - **Exploration:** a University in every city (bought too); specialists stacked toward 40 total yield; Education and Urban Planning first; Heliocentric Model and Invent Calculus.
  - **Modern:**
    - every Innovation project the game offers, queued in the best-producing city;
    - one Launch Pad when none is owned;
    - research toward Flight, Aerodynamics, Rocketry and Radio (their projects are research targets);
    - specialists aimed at 120 yield per tile.
- **Gaps found here, all closed the same day** (code: `core/xpl-victory-levers.js`, `data/xpl-autopilot-steps.js`, `core/xpl-victory-focus.js`, `data/xpl-victory.js`):
  1. **No Airfield was queued.** Trans-Oceanic Flight and Break the Sound Barrier (path milestones 1–2) waited for the plan or the advisor to build one. Now one Airfield goes in the best-producing city (`SCIENCE_SITES`).
  2. **One Launch Pad only, and Crewed Space Flight Prep in one city at a time.** Now Launch Pads go in the 3 best-producing cities, and the repeatable project runs in every city with one (`REPEATABLE_PROJECTS`). One Radio Station is added for Crewed Space Flight Research.
  3. **Nothing science-related was bought with gold in Modern.** Now the queued Launch Pads, Airfield and Radio Station are bought first, then Schoolhouse and Laboratory (the new Modern science levers) in every city.
  4. **The focus left a completed path in the final age.** It now keeps it (`finalAge`).
  5. **Research ignored the Innovation masteries and civics.** Now they are taken (`pickBonusResearch`, `_SCIENCE_VP`) once nothing of the path is left to research or reach. Not before: Rocketry gates far more.
  6. **Innovation was not logged.** Now `victoryRaces` feeds:
     - the Autopilot tab (points, goal, best rival, countdown, victories switched off);
     - a UI.log line once a turn;
     - a log entry when our countdown starts.
- **Also:** Exploration specialists aim at 75 once 5 urban tiles reach 40 (`highYieldTarget`): the triumph after the path, +1 specialist in every city, which helps reach Modern's 120.

## Game 5 (Franklin, Han → Ming, science focus): what went wrong, read from the logs
- **Antiquity: 1 city for 57 turns** (`Player_Stats.csv`).
  - Raiders kept 3–8 units around the capital most of the age; the settlers retreated or waited (SETTLER_WAITS ×41; SETTLER_LEAVES worked once).
  - The capital's queue (`CityBuildQueue.csv`) held Dur-Sharrukin (turns 15–22), Colossus (26–35), Chart the Stars (38–49), Byrsa (52–58) and Spherical Earth (61–69). Settlers came on turns 7, 49 and 69 only.
  - The strict rule kept units waiting behind items with progress. Now units go ahead of wonders and projects (`unitSlot`, root CLAUDE.md gotcha 20).
- **A city lost on Antiquity turn 63, with no capture in `DiplomacySummary.csv`.**
  - It was a just-converted coastal city whose Harbor was pillaged and bought back 4 turns in a row.
  - The crisis cards slotted were «Честолюбивые губернаторы» (−6 Happiness in cities) and «Провинциальное презрение» (−6 in towns), so the crisis was Unrest.
  - Most likely the city revolted (inferred; the exact rule was not found).
- **Exploration: science below zero on turns 11–21, 4 techs in 53 turns.**
  - Ming's ability (`TRAIT_MOD_LOSE_SCIENCE_PER_NON_UNIQUE_TRADITION`, civilizations-shared-gameeffects.xml:204): −15 Science per social policy slotted, traditions free.
  - The autopilot filled every slot with policies. Fixed: `perCardYields` (root CLAUDE.md gotcha 24).
- **Two towns captured by independents** (Exploration turns 11 and 14).
  - No walls all game. Ancient Walls cannot be bought (`Purchasable="false"`); Medieval Walls need techs that never came.
  - UI.log now explains every threatened settlement left without walls.
- **A scout died on coast to a ship after 3 skipped turns; Ming's ranged units were destroyed on a navigable river.** Embarked units can only move or skip. Now soldiers and scouts waiting on water go ashore (`leaveTheWater`).
- **No melee strike happened:** the army was nearly all ranged (Xunleichong), which shoot instead. Later, with Line Infantry, there were still none. UI.log now says why (`strike: N raider(s) next to our melee units, … without the game's prediction, … not worth it`).

### The end (Modern turn ~46): lost, Mexico's economic victory; our Innovation 20/100
- **The final standings** (`Player_Stats.csv`, Modern turn 46): every civilization stayed small (small map, many independents).
  - Mexico (Isabella): 5 cities, 9 towns, 300 production, 395 science. It won by economy.
  - Us: 2 cities, 4 towns, 152 production (the lowest), 336 science, 12 techs; Innovation 20/100.
  - Over the game, independents captured 7 of our settlements: Exploration turns 11, 14 and 59; Modern turns 6, 6, 11 and 41. Modern's new independents are at war with us from turn 1, and two towns fell by turn 6.
- **Walls** (the new UI.log lines, 104 of them):
  - Ancient and Medieval Walls cannot be built in Modern.
  - Defensive Fortifications: towns answered "build: true, buy: false" (walls are `Purchasable="false"`). We never queue in towns, so towns never got walls. Whether a town can really build them with production is unknown: worth one try in game.
  - The capital queued them once.
- **The queue bug** (root CLAUDE.md gotcha 26): every queued project was requested again each pass and never moved to the front. Fixed.
- **Modern research went to Radio first.** The goal with the fewest missing prerequisites wins, and Radio is a goal because of its Radio Station / Crewed Space Flight Research. So Flight came next, and Rocketry (the Launch Pad, the victory) was never reached in 46 turns.
- **The Modern science buildings are expensive in a weak empire.**
  - In the 46-production capital: Radio Station 643 (13 turns), then Airfield 714 (15 turns). Costs grow with the city's buildings (`COST_PROGRESSION_PREVIOUS_BUILDINGS_CITY`).
  - Crewed Space Flight Research is 5 Innovation for 643 + 1200 production: a poor deal. Consider dropping the Radio Station and that project from the targets.
- **The tab listed «DOMINATION» as a switched-off victory** (it is not a countdown race, so the game says off). Only the focus victories are shown now.
- **Fixes that worked once loaded:** units went ashore 7 times (LEFT_WATER); the policy values counted Ming's penalty (Modern Great Britain has none).

### What a science game needs that this one lacked (next steps; all done 2026-10-13, research/17 "Fixed")
1. **Defence against independents.** It is the main cause of the loss. Settlements fell at the very start of each age.
   - garrison towns near independents;
   - try walls in towns (BUILD where the game says yes);
   - buy units in threatened settlements;
   - befriend before raids start;
   - deal with the camps.
2. **Expansion in Antiquity:** settlers ahead of wonders and projects (done: `unitSlot`), fewer wonders while below the settlement cap, and a settler escape that actually finds a safe site.
3. **Research toward Rocketry first in Modern:** the Launch Pad and Crewed Space Flight Prep. Weigh the goals by value, not only by distance.
4. **Modern science sites:** only where they can be finished in reasonable time, or bought; drop the Radio Station.

## Choices for a science game: government, celebrations, policies, attributes, city-state bonuses
A read-only scout pass over the game data, plus the code of Policy Yield Previews (PYP, workshop 3515801789, `scripts/effects/apply-effects.js`). `AQ`/`EX`/`MO` as above; `BS` = `<M>base-standard\data\`.

### Policy Yield Previews values only plain yields
- **Valued as 0 by PYP:**
  - production toward projects or buildings;
  - overbuilding;
  - wonder production;
  - cheaper purchases;
  - specialist caps;
  - great-work slots and codex grants;
  - free techs;
  - mastery speed;
  - tradition slots;
  - celebration length;
  - Innovation;
  - settlement cap;
  - every `TRIGGER_*` effect;
  - lump grants (`EFFECT_PLAYER_GRANT_YIELD`).
- **Valued, with caveats:**
  - Specialist yields (`EFFECT_CITY_ADJUST_WORKER_YIELD`) count × the specialists the city has now. A specialist card is worth 0 before any specialist exists.
  - Percent yields work.
- **Consequence:**
  - Elective Republic's celebration +1000 Science lost to a little culture.
  - Literature's +20% toward science buildings, and Public Works' and Think Tanks' project production, counted for nothing.
- **Fix:** `core/xpl-effect-value.js` turns those effects into yields per turn from the empire's numbers (root CLAUDE.md gotcha 24).
- **What no choice gives:** no policy, celebration, attribute node or city-state bonus grants Innovation directly. Every `EFFECT_PLAYER_GRANT_VICTORY_TRACKER_POINTS` holder is a project, tech, mastery, civic, wonder or the advanced start.

### Governments and their celebrations
Before this pass, the autopilot took the first `StartingGovernments` row the game allowed: Classical Republic, Feudal Monarchy, Authoritarianism. The last two are military. Now `rankGovernments` decides:

| Age | Science pick | Why | Celebration to take |
|---|---|---|---|
| Antiquity | **Oligarchy** | +10% production toward every building (`MOD_OLIGARCHY_PASSIVE_BUILDING_CONSTRUCTION`, AQ golden-ages-gameeffects.xml:91): Libraries and Academies hold the codex slots | O_1 +200 Gold (buys them). Classical Republic CR_2 (+10/20% wonder production) only when racing the Great Library or Nalanda. |
| Exploration | **Plutocracy** | +20% overbuilding (EX :38); unlocks Primitive Accumulation and Tequitl | P_1 +600 Gold while Universities remain to buy, else P_2 (specialist upkeep −2) |
| Exploration (if the Revolutions crisis offers it) | Revolutionary Republic | Story choice EC003C | RR_1 +20% Science and Culture |
| Modern | **Elective Republic** | Specialists +1 Science and +1 Culture; needed for Think Tanks (MO progression-trees-culture-common.xml:101) | **ER_1 +1000 Science** (`MOD_GOLDEN_AGE_ELECTIVE_REPUBLIC_SCIENCE`, MO golden-ages-gameeffects.xml:75) |

- **Economy:** Oligarchy, then Plutocracy, then Bureaucratic Monarchy (purchases 5–10% cheaper, a +1000 Gold celebration).
- **Culture:** Classical Republic, then Theocracy, then Elective Republic.
- **Military governments** (Despotism, Feudal Monarchy, Authoritarianism) come last for every focus.

### Policies worth slotting for science, best first
| Age | Cards |
|---|---|
| Antiquity | Literature (Literacy: +20% toward science buildings, +2 Science on them), Scholars (Philosophy: +1 Science per specialist, +1 upkeep), Tool Making (early) |
| Exploration | Enlightenment (Social Class: +2 Science per specialist), Primitive Accumulation and Tequitl (need Plutocracy), Rationalism (with your own religion), Constitution (specialist upkeep −25%), Commune (overbuilding +20%) |
| Modern | Public Works (Communism's Socialism: +30% project production), Think Tanks (Globalism, needs Elective Republic: +10% project production, +20% in the capital), Social Science and Productive Forces Determinism (+3 Science per specialist), Preservation Societies (+3 Science per displayed great work), Naukograd, Free Speech (specialist upkeep −50%) |

- **Avoid:**
  - Free Press: −5 Science in cities.
  - Crisis cards Strict Censorship (−10 Science and Culture) and Nouveau Riche (specialist upkeep +50%). PYP sees these.
- **Civ-only:**
  - Khmer: Bon Om Touk (+3 Palace great-work slots), Kambu-Mera II (+1 specialist cap in the capital).
  - Babylon: Mār-banê (+1 specialist cap in the capital).
  - Meiji: Shūsei Kokubō (+50% toward science buildings).
- **Ideology:** Communism carries Public Works and a +1 Scientific attribute point. The first civilization to take an ideology gets +2 policy slots.

### Leader attribute nodes (BS progression-trees-common.xml:196-205)
- SCIENTIFIC_03: tech masteries 25% faster. Masteries carry Innovation. PYP-invisible; now valued.
- SCIENTIFIC_02: +15% production toward buildings. Now valued.
- SCIENTIFIC_07: +1 Science per specialist. Valued by PYP.
- SCIENTIFIC_10: +5 Science, repeatable. Valued by PYP.
- EXPANSIONIST_08: +1 specialist cap, but −1 settlement cap.
- POLITICAL_08: +1 tradition slot.

### City-state bonuses
- **Modern «Professional Architects»** (`CITY_STATE_BONUS_MODERN_20`): +25% project production in cities with a science building. It goes through `EFFECT_ATTACH_MODIFIERS`, which `effectsOf` follows.
- **Antiquity «Codex»** (`CITY_STATE_BONUS_ANTIQUITY_17`): one codex.
- Then the free tech, and a policy slot.

### Age-transition legacy cards (the player's choice; the autopilot is off then)
- **Exploration:** +25% projects (`CARD_MOD_AT_EX_SCIENTIFIC_1_PROJECT_BONUS`), +1 specialist cap.
- **Modern:** +1 specialist cap (`CARD_MOD_AT_MO_SCIENTIFIC_1`), +25% projects.
- **Pick these** when a science game reaches the age change.

### Triumphs to chase (and what the autopilot does for each)
| Triumph | How the autopilot gets it |
|---|---|
| AQ_1 (Chart the Stars + Spherical Earth) | Queues the projects |
| AQ_2 (5 urban tiles at 30) | Specialists aim at 30 |
| AQ_3 (12 codices) | Library and Academy everywhere; archive → slots |
| AQ_4 (first to Mathematics) | Research: its codices are wanted |
| EX_1 (5 tiles at 75) | Now aimed at after the path's 40 |
| EX_2 (Heliocentric + Calculus) | Queues the projects |
| EX_4 (7 Universities) | University everywhere |
| MO_1 (first to Flight) | Research: the Airfield and Trans-Oceanic Flight are wanted |
| MO_2 (first to Break the Sound Barrier) | The project, in the Airfield city |
| MO_4 (5 tiles at 120, +50% projects) | Specialists aim at 120 |
| MO_5 (every tech first) | Science priority and research |

Close triumphs of the focus's kind are ticked «Отслеживать».
