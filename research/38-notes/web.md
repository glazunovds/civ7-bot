# 38 notes: the Modern science victory on the web (2026-10-18)

Web study for research/38. It builds on research/20-strategy-web.md (2026-10), which already covers the r/civ advice (Milocobo, monstersvetish, TastySpermDispenser7, YakWish), the CivFanatics "Fast Science Victory" thread up to p.13, gold banking, mementos and dedications. Those findings are only referenced here, not repeated. Reddit could not be searched or fetched this time (the search tool refuses reddit.com); Fandom, Firaxis' support site and civilization.2k.com refused fetches (402/403), so their text is known only from search snippets. YouTube pages gave titles only, no descriptions or transcripts.

Tags: **[fact]** = game data or official notes; **[opinion]** = a player's advice or report. Confidence: high / medium / low. Patch: "1.4+" = Test of Time (1.4.0, 2026-05-19) or later; "launch" = before 1.4 (the old 3-project rules), so out of date for the victory itself.

## Summary (10 lines)
1. **There is no real beeline to Rocketry.** In 1.5 game data Rocketry needs Aerodynamics, which needs Computation, Mobilization and Armor, so 15 of the 16 Modern techs (all but Nuclear Fission): 49,400 base science. Rocketry at ~54% of the age means our science rate is low, not our order. [fact, game files, high]
2. Fast players get there by **science rate and free techs** (scientific Independent-power free techs, Oxford's 2 techs, civ abilities), and by **arriving in Modern with 70–95 Innovation**, so Rocketry (+5) plus one project or a mastery finishes. [opinion, CivFanatics experts, May–Sep 2026, 1.4+, high within that thread]
3. **Innovation before the Launch Pad in Modern** (data, research/14): Trans-Oceanic Flight 5 and Break the Sound Barrier 5 (Airfield), Radio Telescope 5 (Radio Station), the Aerodynamics mastery 5, five masteries at 2, Oxford and Manhattan 3 each, Future Tech 3. About 35 without Crewed Prep. The web confirms the shape, no numbers differ. [fact, high]
4. **Crewed Space Flight Preparation, 15 each, repeatable, 2000 production, one per Launch Pad city**, is how late starters catch up; one run in each of 2–4 pad cities on the Rocketry turn closes a 30–60 gap in ~one project's time. [fact + opinion, research/20 sources, 1.4+, high]
5. **Launch Pads are bought, not built**, the turn Rocketry lands (expert reports: uppi, Softly, Salamis; monstersvetish's ~10k gold). Projects themselves cannot be bought. [opinion, broad, 1.4+, high]
6. Old guides (Game8, GameRant, GameSpot, Fextralife, early 2025) say one Launch Pad is enough. That is **launch-era** advice from the 3-project rules and is wrong for 1.4+. [fact about the sources, high]
7. Typical 1.4+ times: experts win Modern on turn 21–52 (Deity, totals 151–283 turns); ordinary strong players around Modern turn 40–60; casual players lose to culture at 55–80 Innovation. [opinion, medium]
8. **The common loss is ours:** science needs only 100 points while culture/economy/military targets fall to 1.25× second place late in Modern; science players lose to an AI culture win. Advice: arrive with points, block the leader (war or espionage), or turn other victories off (possible again since 1.4.2). [opinion + fact, high]
9. **Patches:** 1.4.0 made the 100-Innovation race and the 5-turn countdown (countdowns 10 → 5), science wonders 3 each, Modern Future Tech 3, the Radio Telescope one-off on Radio Station, age length 160 → 140. 1.4.1 added Think-Tanks (+10%/+20% project production) and Elective Republic's +1000 Science celebration. 1.4.2 and 1.5.0 changed nothing in the science victory. [fact, official notes via mirrors, high]
10. Age-transition gold: launch-era cap ~3000; post-ToT reports conflict (8–10k kept from 20–30k; 5k banked into Modern). Our own probe P6 (gotcha 31) saw full carry-over. Trust our logs. [conflicting, low–medium]

---

## 1. How strong players reach the Launch Pad fastest

### The tech tree leaves no shortcut [fact, game files 1.5.0.44, high]
From `Base/modules/age-modern/data/progression-trees-tech.xml` (checked locally; the web has only Newsweek's line that Rocketry "requires all preceding Modern Age technologies", 2025):
- Costs: Academics, Steam Engine, Military Science 1400; Electricity, Urbanization, Combustion, Industrialization 2425; Radio, Flight, Mass Production 3000; Computation, Mobilization, Armor 4000; Aerodynamics 6000; Rocketry 8500; Nuclear Fission 8500; Future Tech 10,000.
- Prerequisites: Rocketry ← Aerodynamics ← Computation + Mobilization + Armor. Computation ← Radio ← Electricity + Urbanization; Mobilization ← Flight ← Urbanization + Combustion; Armor ← Mass Production ← Combustion + Industrialization. Every root node is needed.
- So Rocketry needs 15 of 16 techs, **49,400 base science**; only Nuclear Fission and the masteries are skippable. "Beeline" in player talk means: skip masteries that give no Innovation, skip Fission, and keep science maximal.
- Order matters only for the one-offs on the way: Flight early opens the Airfield and Trans-Oceanic Flight; Radio opens the Radio Station and the Radio Telescope; Aerodynamics opens Break the Sound Barrier. Each can be run in parallel while researching toward Rocketry.

### What experts do in Modern [opinion, 1.4+]
- **CivFanatics "Fast Science Victory: Civ VII Edition"**, https://forums.civfanatics.com/threads/fast-science-victory-civ-vii-edition.697892/page-12 and page-14 (13 pages in all), Deity, May–Sep 2026 (high within the thread):
  - civfanatic4sure (May 21–Jul 7, 2026): entered Modern with 76, 78 and 95 Innovation; with 95, Modern was "a race" to the Launch Pad with no project needed. Modern lasted 28–52 turns. He rolled overflow production into the last project to finish it in one turn (he called it possibly exploitative).
  - uppi (May 24): Rocketry on **Modern turn 32**, bought the Launch Pad at once with 92 Innovation, ran Crewed Prep over 6 turns, won turn 43 after the 5-turn countdown. His mistake: skipping Spherical Earth in Antiquity.
  - Softly (Jun 9, Regroup setting, Great Britain): aimed for Modern turn 21; bought the Launch Pad and built two 15-point projects; Oxford gave one useful tech.
  - Manpanzee (May 28): one big project run plus one mastery past 100; Meiji's ability gave four masteries in two turns.
  - Salamis (Sep 3 and Sep 2026, page 14): techs one per turn until Rocketry (3 turns); the Radio and Flight mastery projects done on the way; **101 Innovation at Rocketry**; in a second game Modern lasted 21 turns, ~5000 gold carried from Exploration plus ~1000 from a celebration, Launch Pad bought for the win; free tech and civic from a scientific Independent-power reward; Oxford (2 techs).
  - Common thread: free techs (science IP rewards, Oxford, Assyria) and Future Techs/masteries in earlier ages; Modern is short because Innovation is mostly already banked.
- **Berrern**, CivFanatics "Peaceful science victory in Modern – extremely boring?!", https://forums.civfanatics.com/threads/peaceful-science-victory-in-modern-extremely-boring.698892/ (Jul 2025, **launch rules**, medium): Academics → Electricity first (Schoolhouse, Laboratory: "the only two science buildings" of the age), then Flight → Aerodynamics → Rocketry, projects while researching; cities on the science project ("Research Initiative") when nothing else; won Modern turn 81 with no wars. Useful as an order, not as a turn count.
- **NormBac**, CivFanatics "Elusive science victory", https://forums.civfanatics.com/threads/elusive-science-victory.704167/ (Aug 2, 2026, 1.4+, medium): beelines Rocketry and leads in science, but peaks ~55 Innovation before an AI culture win. Siptah's answer (Aug 4): do the four earlier-age projects (~25 points), all masteries and some Future Techs, the four Innovation wonders, codices; **enter Modern with 50+**.
- **Hoolie**, Steam "I'm Really Dumb", https://steamcommunity.com/app/1295660/discussions/0/563658656215948154/ (Jun 2026, 1.4+, low): skip masteries without points, take Future Techs, reach 100 then finish the Launch Pad. (Masteries with Innovation should not be skipped; he probably means the others.)

## 2. Every Innovation source in Modern

### Values (game data, research/14; the web agrees where it gives numbers) [fact, 1.5.0.44, high]
| Source | Innovation | Needs | Production |
|---|---|---|---|
| Crewed Space Flight Preparation | 15, repeatable | Rocketry; Launch Pad in that city | 2000 |
| Launch Satellite | 5, once | Rocketry; Launch Pad | 1000 |
| Trans-Oceanic Flight | 5, once | Flight; Airfield | 1000 |
| Break the Sound Barrier | 5, once | Aerodynamics; Airfield | 1000 |
| Radio Telescope (`CREWED_SPACE_FLIGHT_RESEARCH`) | 5, once | Radio; Radio Station | 1200 |
| Tech Rocketry; Aerodynamics mastery | 5 each | | |
| Masteries Armor, Industrialization, Electricity, Radio, Combustion | 2 each | | |
| Modern Future Tech | 3 each | | |
| Oxford University, Manhattan Project | 3 each | wonders | |
| Modern wonders (with the Exploration culture triumph) | 2 each | research/14 | |
| Codices displayed | 1 each, carried over | | |

Web confirmations:
- **Firaxis devs, "Workshop round 2" patch notes**, CivFanatics, https://forums.civfanatics.com/threads/workshop-round-2-patch-notes-from-the-devs.702126/ (Feb 18, 2026, preview of 1.4.0; high once matched with our data): science wonders (Nalanda, Great Library, House of Wisdom, Shwedagon, Oxford, Manhattan) 3 each, **not when captured**; Literacy 2, Social Class 2; Modern Future Tech 3; the repeatable Electricity project became the one-off Radio Telescope on a Radio Station; countdowns 10 → 5 turns; default age length 160 → 140; almost all passive yields removed from the tech tree; new Modern node Computation.
- **Fandom "Crewed Space Flight Preparation (Civ7)" / "Launch Pad (Civ7)"** (search snippets only, 2026, medium): Preparation 2000 production, +15. Launch Pad listed at 1560 production or 6240 gold (a city's scaled cost; base 840 in data, raised by `COST_PROGRESSION_PREVIOUS_BUILDINGS_CITY`). Purchasable in towns too, but towns cannot run projects (no production).
- **Official 2K "Test of Time Update – Victories"** (search snippet, May 2026, high): Innovation comes from projects in all ages, codices, tech masteries, and a final project "completed as many times as needed"; the countdown resumes if broken (German version). Fetch refused.
- civfanatic4sure said Rocketry ("spaceport tech") gave **+20** (page 12, May 21, 2026). Data says Rocketry 5 (and the Aerodynamics mastery 5). Probably a paraphrase or a count of several things. **low**; trust the data.
- **Nothing before the Launch Pad** gives more than the 5-point one-offs. The only large source, Crewed Prep, needs the pad. That is why Innovation is flat for most of Modern unless the earlier ages filled it. [fact, high]

### Speed-ups for projects [mixed]
- Elective Republic's Think-Tanks tradition: +10% production toward Projects, +20% in the capital. [fact, 1.4.1 notes, https://patchbot.io/games/sid-meiers-civilization-vii/articles/613-update-141-june-23-2026, high]
- Elective Republic celebration option: +1000 Science at once (scales by speed); its passive gives specialists +1 Science and Culture. [fact, 1.4.1, high]
- The Globalism triumph (+50% to projects), the Modern dedication "free Academics tech, +25% production to projects", slotting Tea: see research/20. [opinion, single sources, medium]
- The Antiquity science triumph AQ_1 (both projects) gives +25% production for projects (research/14). [fact, high]
- Overflow: a big item finishing in a city pours its overflow into the next; experts stack production then switch to Crewed Prep to one-turn it (civfanatic4sure). [opinion, low–medium]
- Projects cannot be bought with gold (Newsweek guide, 2025; also our data has no project purchase). [fact, high]

## 3. Preparing in Exploration's last turns
- **Bank Innovation early, every age** (the strongest consensus): the four earlier projects (Chart the Stars 5, Spherical Earth 5, Heliocentric 5, Invent Calculus 10), all Innovation masteries, Future Techs (2 in Antiquity, 3 in Exploration), the four wonders, codices. Target **50+ entering Modern** (Siptah), experts 76–95. [opinion + fact, CivFanatics Aug 2026 and May–Sep 2026, high]
- **Gold to carry over:**
  - Launch-era: capped at ~3000 + one turn's income, influence ~300 (Evolena, bbbt, CivFanatics "Gold & Influence not rolling over explained", https://forums.civfanatics.com/threads/gold-influence-not-rolling-over-explained.696164/, Feb 2025, launch). **low for 1.4+**
  - Post-ToT: Hoolie (Steam "What happens at age transitions now?", https://steamcommunity.com/app/1295660/discussions/0/563658656215969270/, Jun 2026): 20–30k fell to 8–10k, so keep under ~10k and influence under ~3–4k. Salamis carried ~5000 into Modern (Sep 2026). pmarc ~9000 cap (research/20). **medium**, numbers conflict.
  - **Continuity vs Regroup** (Fandom "Starting a new game", snippet; CivFanatics "New Continuity option", https://forums.civfanatics.com/threads/new-continuity-option.699134/, Jul 2025): Continuity (default) keeps most of the empire, units (upgraded in place) and alliances; Regroup resets harder, "fewer units, less Gold and Influence", alliances end. Exact gold rule unpublished. [fact for the description, medium; numbers low]
  - Our game 6 probe (gotcha 31) saw the full balance carry over, negative too. **Use Player_Treasury.csv as the truth.**
- **Do not start what cannot finish:** production in progress is lost at the age change (Chill Place Gaming age-transition guide, https://chillplacegaming.com/civilization-vii-age-transition-guide/, Jun 3, 2026, medium; also our gotcha 58).
- **Dedications:** pick up to 3 at the transition (from a basic pool plus ones unlocked by Major Triumphs and leader levels; 1.4.2 fixed some that failed to appear). The science-relevant one is the free Academics tech with +25% project production (research/20, single). No list of dedications was found on the web. [medium]
- **Mementos for Modern science** (1.4+ reports): Glass Armonica in every age (civfanatic4sure), Note G (production into projects; Manpanzee), Kite & Key, Bifocals, Treaty of Kadesh, Punch Cards (vorlon_mi, "Mementos post-ToT", https://forums.civfanatics.com/threads/mementos-post-tot.703478/, May 2026), Lotus Blossom (tedhebert, 4% of gold income as science and culture). Game8's list (Yasakani, Great Imperial Crown) is launch-era. Our Memento Advisor has its own table. [opinion, medium]
- **Science-flagged civs** get 2 extra attribute points (pjotroos, CivFanatics 1.5.0 thread, https://forums.civfanatics.com/threads/civilization-vii-update-1-5-0-september-15-2026.704682/, Sep 15, 2026). [opinion, low–medium]

## 4. Launch Pads and Airfields: how many, buy or build
- **1.4+ experts: several Launch Pads, bought** the turn Rocketry arrives, then Crewed Prep in each (Milocobo 4–5 cities; monstersvetish ~10k gold, two cities ~30 points; TastySpermDispenser7 3–4 runs; research/20). uppi, Softly and Salamis each bought their pad at once. [opinion, broad, high]
- With 90+ Innovation one pad (for the prerequisite) is enough; the number of pads should match the points still missing ÷ 15. [inference from the rules, high]
- **Old guides say one pad is enough**: Game8 says building several "won't speed them up" (search snippet, 2025), GameRant/GameSpot/Newsweek say build it in the most productive city. True only under the launch rules (one Staffed Space Flight). [fact about the source, high]
- **Airfields**: experts mention them only for the two 5-point flights; no one builds several. Matches our research/32 ("the Airfield only where no Launch Pad"). [opinion, medium]
- **Production vs gold**: gold buys the pads (1500–6000 each scaled), production runs the projects (2000 each; cannot be bought). So gold banking and high-production pad cities both matter; Berrern's empire-wide "Research Initiative" filler is the launch-era idle state. [opinion + fact, high]
- **AI pattern**: an AI running Crewed Prep in several cities jumps 60 → 90+ in one round (research/20, Res_Novae17). Rhapsody (Steam "Science victory nearly impossible?", https://steamcommunity.com/app/1295660/discussions/0/572668858640509368/, Jul 2026): Catherine entered Modern with 70 on Sovereign/Long; Pachacuti won by science one turn before Rhapsody's economic win. [opinion, medium]

## 5. Victory turns and common mistakes
- **Turns (1.4+)**: Deity experts 151–283 turns in total, Modern 21–52 turns (CivFanatics p.12–14). Ordinary strong players Modern turn 40–60 (research/20). Our loss on Modern turn 47 is within that window. [opinion, medium–high]
- **The default 1.4 age length is 140 turns** total budget for the age clock on Standard (Workshop notes). [fact, medium: the exact meaning depends on speed and settings]
- **Mistakes named on the web:**
  1. Arriving in Modern with too few points and losing to a dominance victory whose target falls over time (NormBac 55, sgtzim, Act Chill, research/20 cases). Other victories need a multiple of second place, science only 100 (Adrian, Steam, https://steamcommunity.com/app/1295660/discussions/2/834999523153741964/, May 2026; the 2K victories page). [high]
  2. Skipping earlier projects (uppi's Spherical Earth). [high]
  3. Building only one Launch Pad and waiting on one project chain (1.4+ experience vs old guides). [medium]
  4. Not stopping a rival: MutilationWave "destroy (or seriously damage) the leader in any category that could win" (Elusive science victory, Aug 2026); Hoolie found espionage on the space race helpful, not decisive (Steam "Can never get science victory???", https://steamcommunity.com/app/1295660/discussions/0/581678051258018382/, Jul 2026). Rocketry unlocks "Sabotage Space Program" (Fandom snippet). [medium]
  5. Players who want only science turn the other victories off: possible again since 1.4.2 (patch notes below). [fact, high]
- The AI's science and culture yields jumped after ToT (Tobias Black, godonbassguitar, Steam, Jun 2026). [opinion, low]

## 6. Patch changes that touch the science victory
| Patch | Date | Change | Source | Confidence |
|---|---|---|---|---|
| 1.4.0 Test of Time | 2026-05-19 | Science = race to 100 Innovation, then keep an active (undamaged) Launch Pad 5 turns; countdowns 10 → 5; Innovation from techs, codices, projects in every age; science wonders 3 each (not if captured); Literacy/Social Class 2; Modern Future Tech 3; Radio Telescope one-off on Radio Station; age length 160 → 140; passive tech yields removed; Computation added; specialists 100% adjacency, upkeep 2/4/6 | patched.gg summary https://patched.gg/games/civilization-vii/update-140-test-of-time-patch-notes ; Workshop round 2 notes (above); official notes (fetch refused) | high |
| 1.4.1 | 2026-06-23 | Governments reworked: Elective Republic +1000 Science celebration option, specialists +1 Science/Culture, Think-Tanks +10%/+20% project production; celebrations 10 → 6 turns, costlier | patchbot 1.4.1 (above) | high |
| 1.4.2 | 2026-07-28 | Victory types can be enabled or disabled individually (with their scores); dedications that failed to appear fixed; gold/influence in peace deals | https://patchbot.io/games/sid-meiers-civilization-vii/articles/953-update-142-july-28-2026 | high |
| 1.5.0 | 2026-09-15 | Nothing on science, Innovation or projects | https://patchbot.io/games/sid-meiers-civilization-vii/articles/1434-update-150-notes-september-15-2026 | high |
| 1.5.0 Patch 1 | 2026-09-30 | Stability; factory/treasure resources always spawn (for triumph/victory consistency) | Fandom page title via search | medium |

No patch changed project costs or the 15-point Crewed Prep after 1.4.0 (none found). Developers said in Sep 2026 that the science victory is a key goal of the 2027 expansion (research/20). [high that nothing changed up to 1.5.0 Patch 1]

## What this means for the autopilot (for research/38)
- Rocketry's timing depends on total science only. To bring it earlier, raise science (buildings, specialists, free techs, Elective Republic's +1000), not the order.
- Flat Innovation before Rocketry is expected. The way out is to arrive with more points (earlier ages), take every 5-point one-off on the way (Airfield + two flights, Radio Telescope), and have the gold to **buy ⌈(100 − points − 5) / 15⌉ Launch Pads on the Rocketry turn** and run Crewed Prep in parallel.
- Bank gold in Exploration's last turns up to what our logs show carries over.
