# 38 notes: the game's data on the fastest Modern route to Innovation (game 1.5.0.44)

Read-only pass over the game files, 2026-10-18. Paths are relative to `Base/modules/` unless they start with `DLC/` or `ev/` (ev = the scratchpad copy of games 30 and 31's logs: `scratchpad/ev/g30`, `ev/g31`). Every fact is labelled **VERIFIED** (read in the files or logs) or **INFERRED** (a deduction, or the engine decides and the data does not say). Helper scripts: scratchpad `r38_vp.py` (every Innovation modifier and what attaches it), `r38_tree.py` (the tree's closures), `r38_grants.py` (free techs and science lumps), `r38_stats.py` / `r38_sim.py` (science per turn, earliest turns), `r38_cbq.py` (city production, space items).

## Summary
1. **Rocketry needs 15 of the 16 Modern techs** (everything but Nuclear Fission): 49,400 science at Standard speed, **24,700 at the speed these games use** (Online, `CostMultiplier` 50). There is no shorter route: Aerodynamics needs Computation, Mobilization and Armor, which between them need every other tech.
2. **The autopilot already researches straight down that path.** UI.log's VICTORY_TECH lines show Electricity, then Flight's prerequisites and Flight, then Rocketry's, with no mastery before Rocketry, in both games. So **Rocketry's turn is set by cumulative science, not by order**: g30's 23,524 science by M37 and g31's 22,844 by M38 match the path's cost less what was free (a free Academics, 50% boosts, Oxford's 2 techs in g31).
3. **What can bring Rocketry sooner:** more science per turn, and free research:
   - Oxford's 2 free techs (the cheapest available, so worth the most when it completes late);
   - the Exploration triumph card's free Academics (700);
   - Exploration Future Techs, each giving a 50% boost to a first-tier Modern tech (up to 3 × 350);
   - Elective Republic's celebration (+500 science at this speed);
   - a scientific city-state's free tech.
   At g30's science, all of them together give Rocketry about 4 turns sooner (M33). Science ×1.25 gives M31, ×1.5 gives M27.
4. **Modern starts at 55-62 Innovation because points carry over.** The science trackers are `StaticCarryover`, and the logs show g31 at 28 when Antiquity ended, 62 when Exploration ended and 62 at M1. Nothing is granted at the transition (the 45-point grant exists only for a game started in Modern).
5. **Innovation that needs no Launch Pad** (so it can come before or around Rocketry):
   - masteries: Electricity, Combustion, Industrialization, Radio and Armor give 2 each, Aerodynamics 5;
   - Oxford 3 (a Modern wonder at the wonder's 750 production);
   - Trans-Oceanic Flight 5 and Break the Sound Barrier 5 (Airfield + Flight's / Aerodynamics' mastery);
   - the Radio Telescope 5 (Radio Station + Radio's mastery);
   - Manhattan Project 3 (Nuclear Fission, after Aerodynamics);
   - Future Tech 3 each (after Rocketry and Fission).
   With 62 at M1, Rocketry 5 + these (minus Manhattan) + Launch Satellite reach 100 with **no** Crewed Space Flight Preparation at all. The victory still needs one undamaged Launch Pad.
6. **After Rocketry, production is the bottleneck.** Preparation costs 1,000 at this speed for 15 Innovation, and a pad costs 672-924 (~2,270 gold to buy). Pad cities make 50-80 production, ×1.55 on projects in g30. So a pad city gives one Preparation every 8-13 turns.
   - **Model:** with 1 pad bought on Rocketry's turn, 100 comes about 15-25 turns after Rocketry; with 3 pads bought then (~6,800 gold), about 11-12.
   - **Actual:** g30 got 100 around M57 (R+20); g31 had 83 at M45.
7. **Free post-Rocketry science should go to masteries** (17 Innovation for about 11,600 science, Flight's included, ~13 turns). Before Rocketry each mastery delays the gate. The exception is Flight's and Radio's masteries (1,500 each, ~2 turns), which open TOF and the Radio Telescope while pre-Rocketry production can build their Airfield / Radio Station.
8. **Cost scaling at this speed:**
   - **VERIFIED from CityBuildQueue.csv:** projects and wonders ×0.5 (Preparation 1000, Satellite 500, Oxford 750, Manhattan 900).
   - **INFERRED:** techs ×0.5 (no other reading fits the science totals); buildings about ×0.8 before their cost progression (Launch Pad 672 = 840 × 0.8; `ONLINE_SLIGHT` `DefaultCostMultiplier` 80).
9. **Our tables match the data's points and building prerequisites.** What they miss:
   - the masteries the one-off projects need (Radio Telescope, TOF, BSB need depth 2);
   - Oxford's free-tech timing;
   - the free-Academics / +25% project card;
   - Exploration Future Tech's next-age boost;
   - the Test-of-Time "Location Theory" (+5% project production per mastery).
   Detail in §6.
10. **Not in the data (engine):** the cost of a mastery (the UI asks `Techs.getNodeCost`), whether research overflow crosses the age change, and which node a Future-Tech boost picks. The estimates below assume a mastery costs the same as its tech. Probe in game: `Players.get(0).Techs.getNodeCost(hash)` with the base done.

## 1. The Modern tech tree: the way to Rocketry, Flight, Aerodynamics, Radio

### Nodes and costs (VERIFIED, `age-modern/data/progression-trees-tech.xml:43-59`; prerequisites `:195-221`, commented rows `:196,210,212` ignored)
| Node | Cost (Standard) | Online ×0.5 | Prerequisites | Unlocks of note (line) |
|---|---|---|---|---|
| Academics | 1400 | 700 | - | Schoolhouse, Oxford (:62-63) |
| Steam Engine | 1400 | 700 | - | Ironworks, Port (:64-65) |
| Military Science | 1400 | 700 | - | Defensive Fortifications, Military Academy (:75-76) |
| Electricity | 2425 | 1212 | Academics (:197) | Laboratory, +1 specialist cap (:78-79); mastery **2 Innovation** (:82) |
| Urbanization | 2425 | 1212 | Academics, Steam (:198-199) | settlement cap at depth 2 (:85) |
| Combustion | 2425 | 1212 | Steam, Mil. Science (:200-201) | mastery **2** (:100) |
| Industrialization | 2425 | 1212 | Mil. Science (:202) | Rail Station (:101); mastery **2** (:118) |
| Radio | 3000 | 1500 | Electricity, Urbanization (:203-204) | Radio Station (:120); mastery **2** (:125) and **Radio Telescope project** (:126, depth 2) |
| Flight | 3000 | 1500 | Urbanization, Combustion (:205-206) | **Airfield** (:127); mastery: **Trans-Oceanic Flight** (:134, depth 2) and culture VP (:137, not science) |
| Mass Production | 3000 | 1500 | Combustion, Industrialization (:207-208) | Factory (:139) |
| Computation | 4000 | 2000 | Radio (:209) | Stock Exchange; specialist happiness upkeep (:153-154) |
| Mobilization | 4000 | 2000 | Flight (:211) | naval units |
| Armor | 4000 | 2000 | Mass Production (:213) | mastery **2** (:163) |
| Aerodynamics | 6000 | 3000 | Computation, Mobilization, Armor (:214-216) | mastery **5** (:182) and **Break the Sound Barrier** (:183, depth 2) |
| **Rocketry** | 8500 | 4250 | Aerodynamics (:217) | **Launch Pad, Launch Satellite, Crewed Space Flight Prep, 5 Innovation** (:185-189, all depth 1) |
| Nuclear Fission | 8500 | 4250 | Aerodynamics (:218) | Manhattan Project (:190) |
| Future Tech | 10000, repeatable (+10000 per copy) | 5000+ | Rocketry, Fission (:219-220) | 3 Innovation, attribute, age progress (:191-193) |

- **DLC changes nothing on the way** (VERIFIED: DLC files touching `NODE_TECH_MO_*` only add unique units and wonders, e.g. `DLC/great-britain/modules/data/progression-trees-tech.xml:4-6`; no cost or prerequisite rows).
- **Tech costs by game speed** (VERIFIED `base-standard/data/game-speeds.xml:16-46`): `CostMultiplier` Marathon 300, Epic 150, Standard 100, Quick 67, **Online 50** (:45). `GameSpeed_Scalings` (:230-279) add `DefaultCostMultiplier` per scaling type: ONLINE_HALF 66, ONLINE_SLIGHT 80.
- **The user's speed is Online** (INFERRED, strongly).
  - Projects in `ev/g30|g31/CityBuildQueue.csv` need exactly half their data cost: Preparation 1000 (data 2000, `age-modern/data/projects.xml:32`), Launch Satellite 500 (:29), Chart the Stars 225 (`age-antiquity/data/projects.xml:28`: 450), Invent Calculus 450, Heliocentric 375. Wonders: Oxford 750 (`age-modern/data/constructibles.xml:159`: 1500), Manhattan 900 (:157: 1800).
  - The age-transition gold cap logged "Default gold: 3000 / 4500" (UI.log).
  - The Modern science totals fit only ×0.5 tech costs: g30's whole Modern science by M37 was 23,524, against 49,400 at ×1.
- **Buildings** (INFERRED): the Launch Pad's data cost is 840 with `COST_PROGRESSION_PREVIOUS_BUILDINGS_CITY` (`age-modern/data/constructibles.xml:111`). The CSVs show 672 / 693 / 714 / 735 / 819 / 840 / 861 / 924: 840 × 0.8 = 672, then +21 (2.5% of 840) per step. So buildings scale about ×0.8 (the `_SLIGHT` 80?), not ×0.5. Airfield 861, Laboratory 604-858, Schoolhouse 315-462 observed.

### The closures (VERIFIED by `r38_tree.py` over the file; costs are Online)
| Goal | Nodes needed (incl. itself) | Science, Standard | Science, Online | Not needed |
|---|---|---|---|---|
| **Rocketry** (Launch Pad, Satellite, Preparation) | **15** | 49,400 | **24,700** | Nuclear Fission, Future Tech |
| Aerodynamics (Break the Sound Barrier after its mastery) | 14 | 40,900 | 20,450 | Rocketry, Fission |
| Flight (Airfield; TOF after its mastery) | 6: Academics, Steam, Mil. Science, Urbanization, Combustion, Flight | 12,050 | 6,025 | the other 10 |
| Radio (Radio Station; Radio Telescope after its mastery) | 5: Academics, Steam, Electricity, Urbanization, Radio | 10,650 | 5,325 | |
| Nuclear Fission (Manhattan) | 15 | 49,400 | 24,700 | Rocketry |

- **The cheapest total science from the Modern start to Rocketry is the whole closure:** 24,700 at Online, minus free research (§5). Order cannot shorten it.
- **Masteries (depth 2):** the data holds no cost for them. `ProgressionTreeNodes` has one `Cost` per node (schema `Base/Assets/schema/gameplay/01_GameplaySchema.sql:3100-3119`), and the UI reads `techs.getNodeCost(nodeType)` (`base-standard/ui/tech-tree/model-tech-tree.js:90-95`).
  - **Assumed below:** a mastery costs the same as its tech (INFERRED; g30 researched 7 nodes and masteries for ~9,000 science between M38 and M48, about the right size).
  - **On that assumption:** Flight's mastery 1,500, Radio's 1,500, Aerodynamics' 3,000, Electricity's / Combustion's / Industrialization's 1,212 each, Armor's 2,000.
- **Observed research order** (VERIFIED, UI.log `autopilot: VICTORY_TECH` lines, g30 and g31):
  1. Electricity (Academics was already done).
  2. Military Science / Steam Engine / Combustion / Urbanization → Flight.
  3. Industrialization / Mass Production / Armor / Mobilization / Radio / Computation / Aerodynamics → Rocketry.
  4. Only then Flight's and Aerodynamics' masteries, Nuclear Fission, Electricity's mastery and the rest.

  Flight is itself one of Rocketry's prerequisites (via Mobilization), so "→ Flight" first costs nothing.

## 2. Every source of Modern Innovation (`VICTORY_SCIENCE_MODERN` points)

### How points are counted (VERIFIED, `base-standard/data/victories.xml`)
- **The victory** (:84): `VICTORY_SCIENCE_MODERN`, `COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE`, `MinimumPoints` 100, `CountdownDuration` 5. Prerequisite `REQSET_MODERN_VICTORY_SCIENCE_PREREQ`: own an **undamaged** `BUILDING_LAUNCH_PAD` (`base-standard/data/victories-gameeffects.xml:19-26`).
- **Trackers:**
  - `VICTORY_TRACKER_SCIENCE_GAME_EFFECTS`, `StaticCarryover` (:120): all modifier grants (`EFFECT_PLAYER_GRANT_VICTORY_TRACKER_POINTS`).
  - `VICTORY_TRACKER_PROJECT_COMPLETION` for `PROJECT_LAUNCH_ROCKET`, 1 point (:124). The project needs `RequireCompletedLegacyPathType` LEGACY_PATH_MODERN_SCIENCE (`age-modern/data/projects.xml:30`, cost 3000) and is not in our lists; it is worth 1.
  - `VICTORY_TRACKER_CODICES` (GREATWORKOBJECT_WRITING, 1 each, `StaticCarryover`, :125). No Modern or Exploration data creates a writing great work: only Antiquity files mention `GREATWORKOBJECT_WRITING` (VERIFIED by grep).
- **The Modern legacy path** (`age-modern/data/victories.xml:206-208`): LEGACY_PATH_MODERN_SCIENCE milestones at 1 / 2 / 3 path points (the three one-off space projects). These are age-progress milestones, not Innovation.

### The table (VERIFIED by `r38_vp.py`: every modifier with `VictoryType` VICTORY_SCIENCE_MODERN in Base and DLC, and every row that attaches it; DLC adds none, only leader challenges that read the victory)
| Source | Innovation | Attached at | Needs | Cost (Online) | Notes |
|---|---|---|---|---|---|
| Crewed Space Flight Preparation | **15, repeatable** | `age-modern/data/projects-gameeffects.xml:58-66`; `projects.xml:32,61` | Rocketry (depth 1, `progression-trees-tech.xml:189`) + **Launch Pad in that city** (`PrereqConstructible`) | 1000 production | no `MaxPlayerInstances`, so repeatable; the only repeatable one |
| Launch Satellite | 5 | `projects-gameeffects.xml:85`; `projects.xml:29,58` | Rocketry (depth 1, :187) + Launch Pad in that city | 500 | `MaxPlayerInstances 1`; also reveals the map (`MOD_LAUNCH_SATELLITE_REWARD_FROM_PROJECT`, :57) |
| Trans-Oceanic Flight | 5 | `projects-gameeffects.xml:76`; `projects.xml:27,54` | **Flight's mastery** (depth 2, :134) + Airfield in that city | 500 | once |
| Break the Sound Barrier | 5 | `projects-gameeffects.xml:67`; `projects.xml:28,56` | **Aerodynamics' mastery** (depth 2, :183) + Airfield in that city | 500 | once |
| Radio Telescope (`PROJECT_CREWED_SPACE_FLIGHT_RESEARCH`) | 5 | `projects-gameeffects.xml:49`; `projects.xml:31,60` | **Radio's mastery** (depth 2, :126) + Radio Station in that city | 600 | once |
| Rocketry (tech) | 5 | `progression-trees-tech-gameeffects.xml:88-97`; tree :188 | depth 1 | 4250 science | |
| Aerodynamics mastery | 5 | `progression-trees-tech-gameeffects.xml:78`; tree :182 | depth 2 | ~3000 science (assumed) | |
| Electricity, Combustion, Industrialization, Radio, Armor masteries | 2 each (10) | `progression-trees-tech-gameeffects.xml:129,149,119,139,98`; tree :82,100,118,125,163 | depth 2 | ~1212 / 1212 / 1212 / 1500 / 2000 science (assumed) | |
| Future Tech (Modern) | 3 each | `progression-trees-tech-gameeffects.xml:159`; tree :193 | Rocketry + Nuclear Fission | 5000, then more | repeatable |
| Oxford University | 3 | `age-modern/data/constructibles-gameeffects.xml:264`; `constructibles.xml:853` | Academics (`progression-trees-tech.xml:63`), adjacent to an urban district | 750 production | also **2 free techs** (`MOD_OXFORD_FREE_TECHS`, :245, `FREE_PROGRESSION_NODE_CHEAPEST_UNLOCKED`) and a wildcard attribute point; one in the world (`MaxWorldInstances 1`, constructibles.xml:227) |
| Manhattan Project | 3 | `constructibles-gameeffects.xml:229`; `constructibles.xml:843` | Nuclear Fission (:190) | 900 production | `ReplacePoints` true |
| Codices displayed | 1 each | tracker | Antiquity codices still displayed | - | no Modern source |
| Advanced start | 45 | `age-modern/data/civilizations-common-gameeffects.xml:44`; `civilizations-modern.xml:17,59` | `REQUIREMENT_IS_AGE_COUNT 1`: only a game that starts in Modern | - | not in our games |

- **Earlier ages** (already earned when Modern begins; same scan):
  - **Antiquity:**
    - Chart the Stars 5 and Spherical Earth 5 (`age-antiquity/data/projects-gameeffects.xml:51,64`);
    - Literacy civic 2 (`progression-trees-culture-common-gameeffects.xml:27`);
    - Future Tech 2 each (`progression-trees-tech-gameeffects.xml:174`);
    - Great Library 3 and Nalanda 3 (`constructibles-gameeffects.xml:489,329`; `IsCurrentAge` in their requirement).
  - **Exploration:**
    - Invent Calculus 10 and Heliocentric Model 5 (`age-exploration/data/projects-gameeffects.xml:85,76`);
    - Social Class civic 2 (`progression-trees-culture-common-gameeffects.xml:12`);
    - masteries of Shipbuilding, Metallurgy, Architecture and Metal Casting, 2 each (`progression-trees-tech.xml:137,142,148,161`);
    - Future Tech 3 each (:179);
    - House of Wisdom 3 and Shwedagon Zedi Daw 3.
  - **Commented out, no points:** the Astronomy and Gunpowder mastery VPs exist as modifiers but their unlock rows are commented out (`age-exploration/data/progression-trees-tech.xml:71,175`).
- **Projects need their tree unlock even though `RequiresUnlock` defaults to 0** (schema :3179; Preparation and the Radio Telescope even say `RequiresUnlock="false"`). Chart the Stars carries `RequiresUnlock="false"` too and is still gated by Navigation in play. So the tree row is the real gate (INFERRED from play: research/14, game 6's idle Airfield).
- **No policy, celebration, attribute node, city-state bonus or Modern civic grants Innovation** (VERIFIED by the same scan: no other `VICTORY_SCIENCE_MODERN` grant). Exception: the age-transition card `CARD_AT_MO_SCIENTIFIC_4` turns completed space projects into **economic** points (`age-modern/data/age-transition-gameeffects.xml:572-631`, `VICTORY_ECONOMIC_MODERN`, 1000 `ScaleByGameSpeed`), not science.

### What speeds up project production (VERIFIED, `EFFECT_CITY_ADJUST_PROJECT_PRODUCTION`)
| Source | % | Where |
|---|---|---|
| Triumph LEGACY_MO_SCIENTIFIC_4 (5 urban districts with 120 yield each) | +50 | `age-modern/data/legacies-gameeffects.xml:158-160`, requirement :392-398 |
| Policy Public Works | +30 | `age-modern/data/traditions-gameeffects.xml:261` |
| Policy Think Tanks | +10, capital +20 | `traditions-gameeffects.xml:669,676` |
| Age-transition card «On the Revolutions of the Celestial Spheres» (`CARD_AT_MO_SCIENTIFIC_2`, unlocked by the Exploration triumph Heliocentric + Calculus) | +25 **and free Academics** | `age-modern/data/age-transition.xml:240`; `age-transition-gameeffects.xml:563-571`; triumph `age-exploration/data/legacies-gameeffects.xml:445-449` |
| City-state bonus MODERN_20 (cities with a science building) | +25 | `age-modern/data/independents-gameeffects.xml:482-492` |
| Test-of-Time tradition «Location Theory» (`TRADITION_MO_ATTRIBUTE_SCIENTIFIC_01`) | +5 **per tech mastery completed** | `age-modern/data/traditions-tot-gameeffects.xml:59-62`; only with `TRAIT_ATTRIBUTE_SCIENTIFIC_TOT_MO` (civic `NODE_CIVIC_MO_ADMINISTRATION`, `progression-trees-culture-tot-common.xml:52`) |

- **Observed:** g30's prep cities put +55% on projects (BRITAIN1: 35.7 production added, the project grew 55.3 a turn; `ev/g30/CityBuildQueue.csv` M57-62). Very likely the +25% card and Public Works (INFERRED).

## 3. Why Modern starts at 55-62 Innovation
- **The trackers carry over** (VERIFIED): `VICTORY_TRACKER_SCIENCE_GAME_EFFECTS` and `VICTORY_TRACKER_CODICES` are `StaticCarryover="true"` (`base-standard/data/victories.xml:120,125`). Points from Antiquity and Exploration projects, civics, masteries, wonders, Future Techs and codices stay.
- **The logs agree** (VERIFIED, `ev/g31/UI.log` «victory races … SCIENCE n/100»): 0 → 8 → … → 28 through Antiquity (33 lines at 28, the age's end), 31 … 59 → 62 through Exploration, and 62 at M1 (the research/38 worklog: g31 62 at M1, g30 55).
- **Nothing is granted at the transition** (VERIFIED): the only age-start grant, `TRAIT_MOD_ADVANCED_START_INNOVATION` (45 in Modern), needs `REQUIREMENT_IS_AGE_COUNT 1` (`age-modern/data/civilizations-common-gameeffects.xml:44-53`).
- **The budget that adds up to ~55-62** (INFERRED):
  - Antiquity: 12 (projects 10, Literacy 2) + codices (~10 with Library and Academy slots) + 2 per Future Tech + wonders. g31 reached 28.
  - Exploration: 25 (Calculus 10, Heliocentric 5, Social Class 2, 4 masteries 8) + 3 per Future Tech + wonders. g31 gained 34.
  - **What is left for Modern:** 38-45 points.
- **Wonder points may lapse** (INFERRED, not checked): the Great Library, Nalanda, House of Wisdom and Shwedagon grants use `IsCurrentAge` in their requirement. Whether those 3-point grants survive the next age is not visible in data. The tracker carrying them is `StaticCarryover`.

## 4. Earliest feasible turns (the real Modern science per turn of games 30 and 31)

### Science (VERIFIED, `ev/g30|g31/Player_Stats.csv`, player 0, third segment)
| | M1 | M10 | M20 | M30 | M40 | Σ M1-M37 |
|---|---|---|---|---|---|---|
| g30 | 403 | 467 | 690 | 747 | 870 | 23,524 |
| g31 | 358 | 422 | 554 | 844 | 901 | 21,954 |

### Rocketry (`r38_sim.py`: the first turn whose cumulative science covers the need; a tech completes at that turn's end)
| Free research assumed | Need (Online) | g30 | g31 |
|---|---|---|---|
| none | 24,700 | M39 | M41 |
| free Academics (EX_SCIENTIFIC_2 card) | 24,000 | M38 | M40 |
| + Steam Engine and Military Science boosted 50% (2 Exploration Future Techs) | 23,300 | **M37 (as played)** | M39 |
| + Oxford's 2 techs taken at tier 3 (2 × 1,500) | 20,300 | M33 | M36 (g31 got Oxford at M13; played: ~M38) |
| science ×1.25, Academics + 2 boosts | 23,300 | M31 | M34 |
| science ×1.5, Academics + 2 boosts | 23,300 | M27 | M30 |

- **The calibration fits:**
  - g30 played Rocketry at ~M37 with no Oxford: it lost the race, the wonder stopped at 240/750 on M7.
  - g31 played it at ~M37-38 with Oxford done at M13: techs 6 → 8 that turn (`Player_Stats` "Techs"). At M13 the cheapest techs left were tier 2-3, so Oxford's 2 were worth ~2,400-3,000.
  - So **the path itself was taken optimally**; only free research and more science can move Rocketry.
- **At constant science** (need 23,300 / 20,300 with Oxford late):
  - 500 a turn: M47 / M41;
  - 700: M34 / M29;
  - 900: M26 / M23;
  - 1,200: M20 / M17.

### 100 Innovation (INFERRED model, `r38_sim.py`)
- **What the model counts:**
  - Rocketry's 5 at R;
  - after R, the six Innovation masteries in order of points per science, from the real science series;
  - 4 pad cities with g30's / g31's real production (55/54/53/52; 79/64/62/61);
  - a pad 800, Satellite 500 first in the first pad city, Preparation 1000 after;
  - Airfield projects and Oxford left out (Oxford is in g31's 62 → 69).
- **What it leaves out:** overflow and purchases after R. So it is pessimistic: g30's real 100 came about M57.

| Case | g30 (55 at M1, R = M37) | g31 (62 at M1, R = M38) |
|---|---|---|
| pads built, no project bonus | 100 at M72 | M67 |
| 1 pad bought at R, +25% | M67 | M55 |
| 1 pad bought, +55% (card + Public Works) | M64 (real: ~M57, more pads bought) | M52 |
| 3 pads bought at R (~6,800 gold), +55% | **M50** | **M49** |
| 1 bought, +55%, Rocketry at M30 | M57 | M44 |
| 1 bought, +55%, Rocketry at M25 | M52 | M39 |

- **A hand-made best plan for g31's numbers** (INFERRED):
  - **Before Rocketry:** Oxford done (65 at ~M13). Pre-Rocketry production builds an Airfield (Flight ~M15-20) and a Radio Station. Flight's and Radio's masteries are researched before Rocketry (3,000 science, ~4 turns of delay), so TOF (+5) and the Radio Telescope (+5) run before R.
  - **Rocketry** then lands ~M41 (+5 → ~80).
  - **After it:** 1 pad bought; Preparation (1000 / 122 a turn ≈ 8 turns) → +15 at ~M49; masteries +15 by ~M50 (the Aerodynamics mastery → BSB +5).
  - **The result:** 100 at about M48-50, a victory ~M53-55, against the game's loss at M46 with 83.
  - **Without those two masteries before R:** R ~M37-38, the same items land after R, and 100 comes at ~M47-50. The two orders come out about even; **gold for pads on Rocketry's turn and project production bonuses matter more than the order.**
- **Assumptions** (all INFERRED):
  - mastery cost = node cost;
  - city production constant at the M30-40 average;
  - a pad bought on R's turn starts a project the next turn;
  - projects cannot be bought (no purchase path for projects is in the data; the autopilot never could).

## 5. What carries from Exploration into Modern; what the last Exploration turns can do
| Mechanism | Effect on Modern | Source | Label |
|---|---|---|---|
| Innovation points | kept in full | `victories.xml:120,125` `StaticCarryover` | VERIFIED |
| **Exploration Future Tech** (4250 → 2125 at Online, +4250 per copy) | **+3 Innovation each**; +1 random attribute point; +10 age progress (human only: it ends Exploration sooner); **+1 `NextAgeTechBoost`** (the description: «A boost for a starting Technology in the next Age») | `age-exploration/data/progression-trees-tech.xml:53,176-179`; `progression-trees-tech-gameeffects.xml:132-156`; text `age-exploration/text/en_us/TechnologiesText.xml:261-262` | VERIFIED |
| The boosts' targets | `AgeTransitionBoostableNodes` Modern: Academics, Steam Engine, Military Science, each `BoostPercentage 50` (350 science at Online) | `age-modern/data/age-transition.xml:246-253`; `age-transition-gameeffects.xml:195-215` | VERIFIED; one boost per Future Tech, engine-applied: INFERRED |
| Card «Celestial Spheres» (triumph EX_SCIENTIFIC_2: Heliocentric + Calculus) | free Academics, +25% project production | above | VERIFIED |
| Card EX_SCIENTIFIC_1 (5 tiles at 75) | +1 specialist cap in every city (`CARD_MOD_AT_MO_SCIENTIFIC_1`) | `age-transition-gameeffects.xml:560-562`; `age-transition.xml:239` | VERIFIED |
| Science golden age (Exploration path completed; ScienceCost 2) | «Universities become Golden Age Universities»: base yields, adjacency and effects kept | `age-modern/data/age-transition.xml:148`; `base-standard/text/en_us/VictoriesText.xml:266-267` | VERIFIED (effect engine-side) |
| Science milestone 2 card «Lyceums» | +3 science per quarter (`REQUIREMENT_PLOT_IS_QUARTER`) | `age-transition.xml:149`; `age-transition-gameeffects.xml:75-81` | VERIFIED |
| Scientific dark age (path failed) | Flight free once Combustion is done; aircraft +50% cost | `age-transition-gameeffects.xml:82-93`; text :275-276 | VERIFIED |
| Scientific attribute card | +1 scientific attribute point | `age-transition.xml:171` | VERIFIED |
| Research progress / overflow at the age's end | not in the data | - | UNKNOWN: no data row, engine-side |

- **For the last Exploration turns:**
  - **Future Techs:** each is 3 Innovation plus a 350-science boost, up to three useful boosts. Their own cost: 2,125 the first, then 4,250, 6,375 (INFERRED from `COST_PROGRESSION_PREVIOUS_COPIES`, param 4250). The +10 age progress each shortens the age.
  - **Finish Heliocentric + Calculus:** 15 Innovation and the card worth 700 science and +25% projects.
  - **Complete the science path** for the Golden Age Universities.
  - **The cards are the player's choice at the transition** (the autopilot is off then: root gotcha 17 / 31).
- **Modern free-tech sources** (VERIFIED, `r38_grants.py`):
  - **Oxford:** 2 × cheapest available, :245.
  - **Scientific city-state bonus MODERN_19:** 1 × cheapest available, `age-modern/data/independents-gameeffects.xml:472`.
  - **Elective Republic's celebration ER_1:** +1000 Science `type="ScaleByGameSpeed"`, so 500 at Online (`age-modern/data/golden-ages-gameeffects.xml:75-78`).
  - **The rest:** the Alexander DLC's narrative boost 100% (`DLC/alexander/modules/data/narrative-stories-gameeffects-modern.xml:19`) and mementos. The advanced-start cards (`advanced-start-gameeffects.xml:49-61`) do not apply.

## 6. Cross-check of `mod/expansion-planner/ui/core/xpl-victory-levers.js`
| Item | Ours | Data | Verdict |
|---|---|---|---|
| `SCIENCE_PROJECTS` points | Prep 15, Calculus 10, others 5 | same (§2) | correct |
| `REPEATABLE_PROJECTS` | Prep only | only Prep lacks `MaxPlayerInstances` among VP projects (`projects.xml:27-32`) | correct |
| `PROJECT_INNOVATION`, `ONE_OFF_INNOVATION` | 15 / 10 / 5 | same | correct |
| `STANDING_SITE_PROJECTS` (Radio Telescope) | "once a Radio Station stands" | also needs **Radio's mastery** (tree :126, depth 2) | comment incomplete; the game's `canStart` covers it |
| `SCIENCE_SITES` Airfield `needs` TOF, BSB | "Flight's and Aerodynamics' masteries" | depth 2 (:134, :183) | correct |
| Launch Pad `projects` Satellite | Rocketry depth 1 | :185-189 | correct |
| `RESEARCH_GATES.SCIENCE` | AQ Spherical Earth, Chart the Stars; EX Calculus, Heliocentric ("Urban Planning and Education masteries"); MO Launch Pad | Chart the Stars: Navigation depth 1 (`age-antiquity/data/progression-trees-tech.xml:141`); Spherical Earth: Mathematics depth 1 (:158); Heliocentric: Education **depth 2** (`age-exploration/.../progression-trees-tech.xml:126`); Calculus: Urban Planning **depth 2** (:166) | correct |
| Comment "Rocketry needs 14 of the 17 Modern techs" | | 14 prerequisites + itself = 15 of 16 non-repeatable nodes; only Fission and Future Tech are outside | fine as worded |
| Cost comments (Prep "2000", Satellite "1000", "15 for 2000") | Standard costs | **halved at Online** (1000, 500, 500, 500, 600); pads ~×0.8 | comments only; the race model uses the game's own costs (mod/CLAUDE.md: `Production.getProjectProductionCost`) |
| `INNOVATION_TARGETS` Exploration 55 | 55 | g30 55, g31 62 at M1 | fits |
| `HIGH_YIELD_DISTRICT` Modern 120 → +50% projects | | `legacies-gameeffects.xml:158-160,392-398` (Count 5, YieldAmount 120, DISTRICT_URBAN) | correct |
| `BONUS_TARGETS` `/_SCIENCE_VP$/` | masteries and civics | catches the 6 Modern masteries, Rocketry, MO Future Tech; also EX Future Tech (+ its next-age boost) | correct |
| `INNOVATION_WONDER` | Oxford, Manhattan via `*_SCIENCE_VP` | same | correct; but see below |

**Missing or worth adding (data-backed):**
1. **Oxford's 2 free techs are `FREE_PROGRESSION_NODE_CHEAPEST_UNLOCKED`** (`constructibles-gameeffects.xml:245-254`): finished on M3 they are tier-1 (~700 each), finished after the tier-2/3 techs it is worth up to 3,000. g30 lost Oxford to a rival at M7 (240/750). Holding Oxford's last turns until the cheap techs are researched only pays if the race is safe; winning it at all is worth ~4 turns of Rocketry.
2. **The masteries that open one-off projects** (Flight → TOF, Radio → Radio Telescope, Aerodynamics → BSB) are research targets only through `SCIENCE_PROJECTS`; the Radio Telescope is excluded from research targets by design. Pre-Rocketry production is idle for space work, so an Airfield / Radio Station built then plus two 1,500-science masteries is a fair trade (§4).
3. **No Exploration-end lever for Modern:** Future Techs (3 Innovation + a 350-science boost each), and the transition cards (free Academics + 25% projects; Golden Age Universities; +3 science per quarter) are the cheapest head start Modern gets.
4. **Project production bonuses** (Public Works +30, Think Tanks +10/20, MO_4 +50, MODERN_20 +25, the card +25; Location Theory +5 per mastery in Test of Time) compound: g30's prep cities already ran +55%.
5. **The Launch Rocket project** (`PROJECT_LAUNCH_ROCKET`, 3000 → 1500 at Online, needs the completed Modern science path and a Launch Pad) scores 1 point on its own tracker (`victories.xml:124`): not worth production; research/12 already called it unreachable or useless.
