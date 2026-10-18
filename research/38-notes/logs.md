# Research 38 notes: Modern-age science timeline from the logs (games 28–31)

## Summary

1. **The flat start is the Rocketry gate.** Before Rocketry, no Modern Innovation came from projects. The only gains were wonders (g31: Oxford +7 at M13, Ubudiah Mosque +2 at M31). In every game the first project-driven rise came after the gate opened. VERIFIED: UI.log `victory races`.
2. **The gate opens at a fixed amount of science, not a fixed turn.** In all four games Rocketry finished after about 22,000 cumulative Modern science:
   - g30: 21,913 by M35;
   - g31: 21,954 by M37;
   - g29: 22,865 by M44;
   - g28: 21,762 by M50.

   VERIFIED: Player_Stats.csv. The listed tree costs ×0.5 (Online speed) give 24,000 for the 14 nodes after Academics.
3. **Research order wasted nothing before the gate.** Rocketry's prerequisite closure is every Modern tech except Nuclear Fission. All four games researched exactly those 14 nodes, then Rocketry. VERIFIED: the tree XML and net_message_debug.log; the "all prerequisites needed" reading is INFERRED. Our science was 3–4× the best rival's (400–1,000 against 100–300), so the gate is purely a science-volume problem.
4. **About 30 Innovation was available before the gate and none was taken in any game.** The game's data puts most tech Innovation on masteries (UnlockDepth 2), which our research left until after Rocketry:
   - Electricity, Combustion, Industrialization, Radio and Armor give 2 each; Aerodynamics gives 5.
   - Three cheap one-off projects are unlocked by masteries: Trans-Oceanic Flight (Flight mastery + Airfield), Break the Sound Barrier (Aerodynamics mastery + Airfield) and the Radio Telescope (Radio mastery + Radio Station). They are worth 5 each and cost 500 / 500 / 600 production at this speed.
   - The Airfield projects were never finished in any of the four games.
5. **After the gate, Launch Pads start late and run slowly.** Cities were finishing fillers queued the turn before the gate:
   - g31: Grocer, City Park, Ironworks, Laboratory; pads started 2–5 turns after the gate.
   - g30: Cannery, Military Academy, Laboratory; pads started 5–7 turns after.

   A pad costs 714–966 production and takes 7–15 turns at 45–100 production. A Preparation run (1,000) takes 10–15 turns.
6. **Production First held a bought pad idle.** In g30 it put a Military Academy (M37–42) in London ahead of the first Preparation run on the pad bought at M37. The first +15 came at M53, not about M48. VERIFIED: UI.log PRODUCTION_FIRST M36 and CityBuildQueue.csv.
7. **Defence starved the space work:**
   - g29: the pad bought at M47 in Антавайлья reached 510 of 1,000 Preparation by M52. Tanks and walls then took M53–M64, and the run was never finished.
   - g28: pads were interrupted by Tanks and walls (M58–M83).
8. **Gold decided how many pads were bought, and it was mostly not there:**

   | Game | Pads bought | Why |
   |---|---|---|
   | g30 | 1 (M37, 2,620) | Held 2,000–3,300 for 36 turns. 3,088 went on Schoolhouses before the gate. |
   | g29 | 1 (M47, 2,848) | Two turns after the gate. |
   | g31 | 0 | 700 of the 770 bank went on a Cuirassier at M1; income was negative (unit upkeep 81→126) and the balance sat at 0 from M24 to M43. |
   | g28 | 0 | Gold was always below 1,300. |
9. **After the gate, research went to Flight mastery (0 Innovation) and Nuclear Fission (0 Innovation, 4–5 turns) before the paying masteries.** In g30 this delayed 10 Innovation of masteries and the second Future Tech by about 5 turns.
10. **Game 31 could not have won on science.** The rival's culture countdown started about M41 (its goal fell to 213, below its 220) and won at M46. No pad was finished before M47.

Turn conventions:
- "Mt" is Modern turn t.
- An Innovation value at Mt is the `victory races` line written at the start of turn t (the state after turn t−1).
- A tech "selected Mt" is the `SET_TECH_TREE_NODE` sent in turn t (net_message_debug.log; node hash = `crc32(name) XOR 0xFFFFFFFF`). The previous node finished at the end of turn t−1.
- CityBuildQueue.csv runs are `first–last turn` with `current/needed` at the last row; DONE means current ≥ needed.
- Helper scripts are in the session scratchpad `an/`: seg.py, tree.py, tl.py, cbq.py, table.py.

---

## Game data used for the interpretation

- **Cost scale.** `game-speeds.xml` GAMESPEED_ONLINE `CostMultiplier 50`. The observed costs match: Preparation 1000 (listed 2000), Launch Satellite 500 (listed 1000). VERIFIED: CityBuildQueue.csv.
- **Modern tech tree** (age-modern/data/progression-trees-tech.xml):
  - Costs: Academics, Steam Engine, Military Science 1400; Electricity, Urbanization, Combustion, Industrialization 2425; Radio, Flight, Mass Production 3000; Computation, Mobilization, Armor 4000; Aerodynamics 6000; Rocketry and Nuclear Fission 8500; Future Tech 10000, repeatable with rising cost.
  - Prerequisites: Aerodynamics needs Computation, Mobilization and Armor; Rocketry needs Aerodynamics.
  - Rocketry's ancestor closure is all 14 other base nodes except Nuclear Fission. With all-prerequisites semantics (INFERRED, the usual Civ rule; our autopilot also labelled Armor and Mobilization "→ Ракетостроение"), nothing researched before Rocketry was off-path.
- **Innovation (VICTORY_SCIENCE_MODERN) sources in Modern data:**
  - **Techs.** Rocketry gives 5 at depth 1. Masteries (depth 2): Electricity, Combustion, Industrialization, Radio and Armor give 2 each, Aerodynamics 5. Future Tech gives 3 each.
  - **Projects.** Crewed Space Flight Preparation 15 (repeatable, needs a Launch Pad). Launch Satellite 5 (Launch Pad, Rocketry). Trans-Oceanic Flight 5 (Airfield, Flight mastery). Break the Sound Barrier 5 (Airfield, Aerodynamics mastery). Crewed Space Flight Research, "Радиотелескоп", 5 (Radio Station, Radio mastery).
  - **Wonders.** Oxford University 3, Manhattan Project 3, and +2 per Modern wonder when the Exploration legacy tracker is active.
  - **Codices.** 1 each, carried over.
- **Carried from earlier ages** (StaticCarryover): Antiquity's Chart the Stars and Spherical Earth (5 each), Exploration's Heliocentric Model (5), Invent Calculus (10), Exploration tech masteries (2–5), Future Techs (2 in Antiquity, 3 in Exploration), Literacy and Social Class civics (2), wonders (3), codices.

---

## Game 30 (Great Britain; won science at M66; only the science victory on)

### Start
- **Innovation at M1: 55.** Built up as Antiquity 24 (ended 24 after A67), then Exploration +31 (26 at E39 … 52 at E58, 55 at E66 from Exploration Future Tech). VERIFIED: UI.log `victory races` by age.
- **Gold at M1:** 1,277 (Exploration ended at 616 on E69). The PADS bank held 756. VERIFIED: UI.log `gold: T1`.

### Innovation timeline

| M | Innovation | What raised it | Evidence |
|---|---|---|---|
| 1–35 | 55 | nothing (35 turns flat) | UI.log victory races |
| 36 | 60 | +5 Rocketry (selected M30, done end of M35) | net log 16:43:04; races line |
| 39 | 65 | +5 Aerodynamics mastery (selected M37) | net log 16:44:31 |
| 45–49 | 67, 69, 71, 73, 75 | +2 each: Electricity, Combustion, Industrialization, Radio, Armor masteries (selected M44, 45, 46, 47, 48) | net log |
| 53 | 93 | +15 Preparation in London (GB1, M43–53, 1068/1000) and +3 Future Tech #1 (selected M49) | CityBuildQueue.csv; net log |
| 62 | 113 | +5 Launch Satellite (London M54–62, 547/500) and +15 Preparation in GB3 (M52–62, 1046/1000); countdown 5 | CityBuildQueue.csv |
| 63 | 116 | +3 Future Tech #2 (selected M53) | net log |
| 66 | won | `Team 0 has won … VICTORY_SCIENCE_MODERN` | GameCore.log 16:50:07 |

### Tech order

VERIFIED: net_message_debug.log `SET_TECH_TREE_NODE`. "Science spent" sums Player_Stats science over the turns the node was selected, so it is approximate (overflow is ignored).

| Selected | Node | Turns | Science spent | Listed ×0.5 |
|---|---|---|---|---|
| M1 | Electricity | 2 | 834 | 1212 |
| M3 | Military Science | 1 | 433 | 700 |
| M4 | Steam Engine | 1 | 469 | 700 |
| M5 | Combustion | 2 | 938 | 1212 |
| M7 | Urbanization | 3 | 1435 | 1212 |
| M10 | Flight (Airfield) | 2 | 972 | 1500 |
| M12 | Industrialization | 2 | 1084 | 1212 |
| M14 | Mass Production | 2 | 1215 | 1500 |
| M16 | Armor | 3 | 1975 | 2000 |
| M19 | Mobilization | 3 | 2055 | 2000 |
| M22 | Radio (Radio Station) | 2 | 1400 | 1500 |
| M24 | Computation | 3 | 2157 | 2000 |
| M27 | Aerodynamics | 3 | 2228 | 3000 |
| M30 | **Rocketry**, done end of M35 | 6 | 4718 | 4250 |
| M36 | Flight mastery (0 Innovation; unlocks Trans-Oceanic Flight) | 1 | 804 | |
| M37 | Aerodynamics mastery (+5) | 2 | 1681 | |
| M39 | Nuclear Fission (0 Innovation) | 5 | 4559 | 4250 |
| M44–M48 | Electricity, Combustion, Industrialization, Radio, Armor masteries (+2 each) | 1 each | about 950 each | |
| M49, M53, M63 | Future Tech ×3 (+3 each; the second took 10 turns) | | 4184, 9341 | |

- **Before Rocketry:** 13 nodes (Academics was already known at M1), none off Rocketry's path (INFERRED from the tree). Flight was taken early (M10) "→ Авиация" for the Airfield, but it is an ancestor anyway.
- **Civics:** Modernization M1, Social Question M7, Natural History M14, Political Theory M20, Communism M30, Centralism M37, Socialism M39, Nationalism M46, Militarism M48.

### Science per turn

VERIFIED: Player_Stats.csv. Gold is the balance at the start of the turn.

| M | Innovation | gate | techs | science | cumulative | best rival | gold |
|---|---|---|---|---|---|---|---|
| 1 | 55 | 0.07 | 0 | 403 | 403 | 113 | 1277 |
| 9 | 55 | 0.33 | 5 | 489 | 4109 | 131 | 2890 |
| 17 | 55 | 0.6 | 9 | 646 | 8685 | 126 | 2659 |
| 25 | 55 | 0.8 | 12 | 730 | 14232 | 171 | 2384 |
| 33 | 55 | 0.93 | 14 | 789 | 20307 | 216 | 3399 |
| 36 | 60 | open | 15 | 804 | 22717 | 230 | 2765 |
| 45 | 67 | open | 19 | 952 | 30871 | 297 | 896 |
| 53 | 93 | open | 23 | 1112 | 39022 | 344 | 2122 |
| 61 | 93 | open | 23 | 946 | 46305 | 356 | 210 |

### Launch Pads, Airfields, projects

VERIFIED: CityBuildQueue.csv and UI.log.

- **Pads ordered:** M36 in London, Sheffield and Stoke; M38 in Birmingham.
- **London (GB1):** the pad was bought at M37 for 2,620. The Prep was queued at M38, but PRODUCTION_FIRST (M36: Military Academy, gain 10, R 3819) built the Academy M37–42. Then Prep M43–53, Satellite M54–62, Prep M63+.
- **GB10:** Cannery M34–40, pad M41–53 (952/924), Prep M55+ (704/1000 at the end).
- **GB6:** Laboratory M31–41, pad M42–52 (834/819), Prep M54+ (798/1000 at the end).
- **GB3:** Military Academy M38–42 (started after the gate), pad M43–51 (806/735), Prep M52–62 DONE.
- **GB2:** Rail Station M31–45, Laboratory M46–55, pad M56–67.
- **GB5:** pad M64+, unfinished.
- **Gap Rocketry → first pad:** 1 turn (bought). Rocketry → first Prep started: 7 turns (Military Academy). First pad → first Innovation from a project: 16 turns (M37 → M53).
- **Airfield:** never built. 2,216–2,284 was held for it (Liverpool, then Leeds) during M38–41, M48–54 and M57–63. `victory work: no BUILDING_AIRFIELD … bought: the goal comes on turn N either way` was logged each turn. N counts turns from now, not the game turn: 43 at M37 (a projection of M80; the real goal came at M62), 14 at M53 (projection M67; real M62). The race model was pessimistic and still judged the Airfield useless.
- **Radio Station / Radio Telescope:** never built or run.

### Gold
- **The PADS bank** (goal 11,344–11,956 for 5 pads) held about 2,000–2,150 from M6 to M35 while the balance was 2,300–3,400.
- **Purchases:** 3,088 on Schoolhouses (LEVER: M12 1,008; M24 1,008; M33 1,072). One pad at M37 (2,620). A Laboratory in Bristol at M55 (1,932) after holding that gold for the Airfield. Nothing else of note.
- **Income:** +67 to +154 a turn until M37, about +90 after, and −6 to +4 during M54–M61.

### What decided M62 (INFERRED from the numbers above)
- **At M53 we had 93.** The remaining 7 came only at M62, from London's Satellite or GB3's Prep, whichever finished; both did on M62.
- **Without the Military Academy and Fission:** London's Prep would finish about M48; skipping Fission (5 turns) would bring the masteries and Future Tech #1 forward about 5 turns, and Future Tech #2 to about M57. That makes about 101 by M57, so a win about M62 instead of M66.
- **An Airfield bought at M48** (2,216 was held) plus Trans-Oceanic Flight (500 production) would have given +5 by about M55–57.

---

## Game 31 (Great Britain; lost to a rival's culture victory at M46)

### Start
- **Innovation at M1: 62.** Antiquity ended at 28; Exploration added 34 (31 at E32 … 59 at E55, 62 at E61 after Exploration Future Tech). VERIFIED: UI.log.
- **Gold at M1:** 1,155. The PADS bank held 770, but 700 went at M1 on `FIRST_MELEE_BOUGHT ["Кирасир","Ньюкасл",700]`. VERIFIED: UI.log M1 and CityPurchase.csv (turn 1, GB11, Cuirassier).
- **The goal went to `none` from M2 and stayed there:** the balance fell under the rising reserve, and income was negative.

### Innovation timeline

| M | Innovation | What raised it | Evidence |
|---|---|---|---|
| 1–12 | 62 | nothing | races lines |
| 13 | 69 | +7 at Oxford University's completion (GB7, M2–13, 808/750). 3 is Oxford's own VP and 2 the Modern-wonder tracker; the last +2 is INFERRED to come with Oxford's two free techs (techs 6 → 8 at M13; MOD_OXFORD_FREE_TECHS) | CityBuildQueue.csv; Player_Stats.csv |
| 31 | 71 | +2 Ubudiah Mosque (GB7, M20–31) | CityBuildQueue.csv |
| 38 | 76 | +5 Rocketry (selected M33, done end of M37) | net log 17:49:13 |
| 41 | 81 | +5 Aerodynamics mastery (selected M39) | net log |
| 46 | 83 | +2 Electricity mastery (selected M45) | net log |
| 46 | lost | `Team 5 has won … VICTORY_CULTURE_MODERN` | GameCore.log 17:52:30 |

### Tech order (VERIFIED: net log)

| Selected | Node |
|---|---|
| M1 | Electricity |
| M4 | Steam Engine |
| M5 | Military Science |
| M7 | Combustion |
| M10 | Urbanization |
| M12 | Flight |
| M14 | Industrialization |
| M16 | Mass Production |
| M19 | Radio |
| M21 | Armor |
| M24 | Mobilization |
| M27 | Computation |
| M30 | Aerodynamics |
| M33 | **Rocketry** (5 turns, about 4,410 science; done end of M37) |
| M38 | Flight mastery (0 Innovation) |
| M39 | Aerodynamics mastery (+5) |
| M41 | Nuclear Fission (0 Innovation, 4 turns) |
| M45 | Electricity mastery (+2) |
| M46 | Industrialization mastery |

- Same 13 nodes before Rocketry as g30; none off-path.
- **Civics:** Modernization M1, Social Question M6, Natural History M11, Political Theory M13, Communism M19, Centralism M26, Socialism M34, Nationalism M41, Militarism M46.

### Science per turn (VERIFIED: Player_Stats.csv)

| M | Innovation | gate | techs | science | cumulative | best rival | gold |
|---|---|---|---|---|---|---|---|
| 1 | 62 | 0.07 | 0 | 358 | 358 | 101 | 1155 |
| 9 | 62 | 0.27 | 4 | 407 | 3375 | 110 | 364 |
| 13 | 69 | 0.4 | 8 | 548 | 5285 | 106 | 295 |
| 21 | 69 | 0.67 | 12 | 592 | 9795 | 112 | 18 |
| 29 | 69 | 0.8 | 14 | 748 | 14985 | 142 | 0 |
| 37 | 71 | 0.93 | 16 | 890 | 21954 | 150 | 0 |
| 38 | 76 | open | 17 | 890 | 22844 | 150 | 0 |
| 45 | 81 | open | 20 | 962 | 29488 | 238 | 552 |

g31 started 45 science lower than g30 and got 2 free techs from Oxford, yet the gate still came after about 22,000 science, 2 turns later than g30.

### Launch Pads, Airfields

VERIFIED: CityBuildQueue.csv and UI.log `VICTORY_WORK` M38.

Pads were ordered at M38 in Bristol, Glasgow, Liverpool, Sunderland and Newcastle, appended behind items in progress:

| City | Before the pad | Pad | State |
|---|---|---|---|
| GB9 | Ironworks M36–39 | M40–47 | done (790/735) |
| GB15 | Grocer M36–40 | M41+ | 544/672 at M48 |
| GB7 | Laboratory M34–41 | M42+ | 821/861 at M48 |
| GB11 | City Park M37–42 (started the turn Rocketry finished) | M43+ | 442/693 |
| GB2 | City Park M37–42 | M43+ | 696/840 |

- **London (GB1)**, the strongest producer (70–115 a turn), built no pad. It made settlers M28–32 and M41–43, a Grocer and an Ironworks, the Airfield (ordered M41, M44–46+, 373/861) and the Manhattan Project (M47+).
- **No gold for any of it.** The balance was 0–40 from M20 to M43. Unit maintenance rose 81 → 126 (Player_Treasury.csv) against net gold of −47 to +13 (Player_Stats.csv). At M45, 1,008 was spent on a Schoolhouse (LEVER).

### Why the loss
The rival's culture passed its dominance goal at about M41: 220 against 213, when the multiple stepped down at 60% of the age. It won at M46 (UI.log races). Science could not have finished before about M55: the first pad was done M47, and a Preparation takes about 10–15 turns. A science win would have needed the gate around M25 and pads bought.

---

## Game 29 (won science at M69; only the science victory on)

Sources: the last of the six segments of the CSVs, and UI evidence from the 03:05 boot on. There is no net log.

- **Innovation:** 60 at M1 and flat until M44.
  - M45: 65 (Rocketry). M48: 70 (Aerodynamics mastery). M55–M59: 72, 74, 78, 80 (masteries; Radio mastery selected M57).
  - M63: 95 (+15 Prep, MAYA1 M56–63).
  - M64: 100 (+5 Radio Telescope, MAYA4 M59–64). Countdown from M64; won M69 (GameCore.log 03:23:34).
- **Tech order** (UI.log VICTORY_TECH): the same sequence. Rocketry selected M39, gate open M45 (64% of the age). After the gate: Flight mastery M45, Aerodynamics mastery M46, Nuclear Fission M48–53, masteries M54–57, Future Tech M59 and M66.
- **Science:** 229 at M1, 426 at M17, 705 at M33, 800 at M45; best rival 138–413. Cumulative at the gate (through M44): 22,865.
- **Pads:**
  - Bought at M47 in Антавайлья (INCA2) for 2,848; the bank had held 2,200–3,400 during M30–M47.
  - Its Prep ran M48–52 (510/1000). A Tank (M53–57), walls, another Tank (M59–62) and walls (M63–64) then went ahead (`queue: Антавайлья: UNIT_TANK moved ahead of PROJECT_CREWED_SPACE_FLIGHT_PREP with 500 production in it`, M53; THREAT lines). The run ended at 611/1000 and never finished. VERIFIED.
  - Other pads: MAYA1 M46–55, MAYA5 M51–64, INCA1 started M50 and was interrupted (unfinished). Airfield INCA4 started M50 and M63, never finished.
- **Radio Telescope:** the Radio Station in MAYA4 was built M34–42. The project could only start after Radio mastery (selected M57), so it ran M59–64. It gave the last 5 points.
- **Gold after M47:** under 600; from M52, income −59 to −84 (defence). The capital's tanks are research/34's case.

## Game 28 (won science at M93; only the science victory on; the age ran past 100% at M71)

Sources: the third segment of the CSVs and UI evidence 00:55–01:20.

- **Innovation:** 47 at M1 and flat until M50.
  - M51: 52 (Rocketry). M55: 57 (Aerodynamics mastery). M60–65: 59 → 67 (masteries). M71: 70 and M82: 73 (Future Tech).
  - M84: 88 (+15 Prep, ASSYRIA11 M70–84). About M89: 118 (+30, Preps in ASSYRIA1 and ASSYRIA4, both M88). Countdown to the win at M93.
- **Tech order:** the same. Rocketry selected M45, gate open M51 (73% of the age). Cumulative science at the gate (through M50): 21,762. Science 270 at M1, 390 at M29, 634 at M45; best rival 120–235.
- **Pads** (no purchases: CityPurchase.csv has none):

  | City | Pad | Interrupted by |
  |---|---|---|
  | ASSYRIA11 | M54–68 | |
  | ASSYRIA1 | M58–61, then M67–73 | Tank M62–66 |
  | ABBASID7 | M56–64, then M69–74 | AT gun |
  | ABBASID12 | M55–60, then M70–83 | walls M61–69 |
  | ASSYRIA4 | M62–75 | |

  - The first Prep took 15 turns (M70–84) at about 70 production.
  - Airfield (Kalhu, ASSYRIA2): M65–89, 25 turns; Trans-Oceanic Flight started M90.
- **Gold:** under 1,300 all age. The defender (640) and upgrades (680 and 620, M59–60) took what there was.

---

## Bottlenecks, ranked

Turns are measured on game 30 (the clean win) unless stated.

1. **Science volume against a fixed gate of about 22,000 science.** Rocketry needs every Modern tech but Nuclear Fission: about 24,000 listed ×0.5. VERIFIED that the gate opened at 21.8–22.9k cumulative in all four games.
   - At g30's 403 → 804 a turn this is M35. g28's 270 → 634 gives M50.
   - Each extra 100 science a turn, averaged over the first 35 turns, opens the gate about 4–5 turns earlier. Opening it by M20 needs about 1,100 a turn from M1 (g30 had 403 at M1).
   - Research order cannot shorten this (INFERRED, all-prerequisites semantics).
   - This is the largest single cost: 35–50 flat turns in every game.
2. **No Innovation work before the gate: about 30 points left on the table.** INFERRED gain in g30: 4–10 turns.
   - **The points:** 15 from tech masteries (Electricity, Combustion, Industrialization, Radio and Armor 2 each, Aerodynamics 5) and 15 from three one-off projects:
     - Trans-Oceanic Flight (Flight mastery + Airfield, 500 production);
     - Break the Sound Barrier (Aerodynamics mastery + Airfield, 500);
     - the Radio Telescope (Radio mastery + Radio Station, 600).
   - **What happened:** none was done before Rocketry in any game. The Airfield projects were never completed in any game. The Radio Telescope came only in g29, 17 turns after its Radio Station, because Radio mastery waited until M57; it supplied g29's final 5 points.
   - **The cost of doing them early:** taking only the three unlocking masteries before Rocketry (about 3–4 research turns) would delay the gate about 3–4 turns. g30 had 2,000–3,300 idle gold M5–M36 for an Airfield or Radio Station, and cities were building fillers (Military Academies, Canneries, City Parks).
3. **Pads start late after the gate.** VERIFIED from CityBuildQueue.csv:
   - g31: pads started 2–5 turns after the gate, behind fillers begun on the turn Rocketry finished (two City Parks M37–42).
   - g30: built pads started 5–7 turns after the gate.
   - Build times were 8–13 turns (g30) and 7+ turns (g31).
   - g30's first built pad was done at M51, 16 turns after Rocketry.
4. **The first Preparation run held back by Production First.** g30: 6 turns. The Military Academy (M37–42) in London stood ahead of the Prep on the pad bought at M37. VERIFIED. The +10 production saves about 1 turn per 1,000 run, and only one Prep ran there before the win.
5. **Defence took pad cities' production:**
   - g29: the bought pad's Prep stopped at 510/1000 (M53–M64: two Tanks, walls ×2) and never finished.
   - g28: four pads interrupted for 4–9 turns each.

   VERIFIED. INFERRED cost: about 5 turns of g29's win; more in g28.
6. **Gold.** VERIFIED:
   - g30: bought one pad, because 3,088 went on Schoolhouses before the gate. After the gate, 2,216–2,284 sat in an Airfield goal the race model kept declining for about 15 turns, then went to a Laboratory (M55).
   - g31: no gold all age (a 700 Cuirassier at M1, then negative income from unit upkeep); nothing bought.
   - g29: one pad, 2 turns after the gate.
   - g28: none.
7. **Research after the gate.** g30: Nuclear Fission (no Innovation, 5 turns) and Flight mastery (no Innovation, 1 turn) went before the five 2-point masteries and Future Tech. INFERRED: about 4 turns lost for g30's second Future Tech, which, with item 4, would have made the win about M62 instead of M66. The same order appears in all four games.
8. **The race model's projection.** `the goal comes on turn N either way` counts turns from now. In g30 it said 43 turns at M37 (the real answer was 25) and 14 at M53 (the real answer was 9). It still judged every Airfield useless. Whether it counts the mastery-gated one-offs is for the code study. VERIFIED: the log numbers; the cause is open.
9. **Exploration's end.** Nothing lost that matters to Modern science. Both games banked their last Exploration Future Tech (+3 Innovation: g30 at E66, g31 at E61). Gold carried in: g30 1,277, g31 1,155. g31's carried gold went at once to a defender. VERIFIED.
