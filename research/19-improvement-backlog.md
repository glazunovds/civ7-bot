# 19. Autopilot improvement backlog after game 6 (2026-10-13)

Sources:
- research/17 (independents, game 5);
- research/18 (game 6 lost to culture at 45/100 Innovation);
- the game-6 agent reports in the session scratchpad (`forensics-game6-science.md`, `forensics-game6-empire.md`);
- the web strategy research (`research-strategy-web.md`, summarised in research/20 once done).

IDs are for the implementation plan. Each item says what to change, why (the evidence), and how to check it.

## A. Strategy: options that follow the victory focus and the phase of the game
The user's idea: let the victory focus set the options the player sets by hand today, and move from balanced growth early to a full commitment near the end. To be confirmed against the web research.
- **A1. Phases.** The plan for each phase:
  - **Growth** (Antiquity, and early Exploration while below the settlement cap or while towns outnumber cities): expand, convert towns, buy growth and gold.
  - **Build** (Exploration and early Modern): the victory's infrastructure (cities able to run projects, science buildings, codex slots...).
  - **Commit** (the final age, or once the victory's gate is open: science = Rocketry): only the victory's work, all gold to it.

  The phase is computed each turn from age, settlements versus cap, towns versus cities, the focus's gate, and turns left. It shows in the tab and in UI.log.
- **A2. A strategy profile per focus × phase**, overriding the user's defaults while the focus is on (the settings stay the user's; the profile only adjusts them for the pass). The levers:
  - **Gold:** the reserve turns, and what may be bought (warehouses, upgrades, garrisons, victory buildings, conversions).
  - **Wonders:**
    - how many at once, and which ones (science: only those that grant Innovation, and none in Commit that would hold a Launch Pad city);
    - culture: more wonders.
  - **Units:** explorers (artifacts are culture: only the culture focus or no focus), settlers (none in the final age's Commit phase), upgrades (only near threats except in Growth?).
  - **Town Focus preferences:** science → Urban Center for towns with quarters, or the ones planned to buy science buildings; economy → Trade/Resort; culture → Temple/Urban Center.
  - **Policies, government, celebration:** already by focus (keep).
- **A3. Show the active profile** in the Autopilot tab: «Стратегия: Рост → Наука», with a tooltip of what it changes. The user can still switch the focus off to keep their own options.

## B. Gold: save for goals before buying small things (the biggest loss in game 6)
- **B1. A savings goal per pass**, computed before any purchase. It is the most important unaffordable target, in order:
  - a town conversion while towns outnumber cities (or in Growth / Build);
  - the victory's site or lever building (Launch Pad, Laboratory, Airfield...);
  - walls or a defender under real threat (these already use all the gold).

  Plan purchases (`buyBuildings`) and upgrades then spend only what is above the reserve plus the goal.
  - Seen in game 6: 88 buildings bought, ~14,000 gold, nearly all town warehouses; no `VICTORY_BOUGHT`; one conversion all game; spare gold stayed at 150–480 while a conversion cost 530–1,550.
- **B2. Count the gold spent earlier in the same pass.** The conversion, walls, defenders, repairs and victory purchases all count. Seen: at Antiquity 45 a conversion and a Granary were sent in one pass, and the Granary was refused.
- **B3. A UI.log line once a turn:** gold, reserve, goal (what and how much), and what was bought.
- **B4. Warehouses:** limit how much of each turn's spare the plan's town purchases may take (e.g. only when no goal is pending, or a share of income).

## C. Cities and towns
- **C1. Conversions** happen in practice (B1).
  - Rank candidates by what a city adds for the focus (science: a project queue and Launch Pad room; production).
  - In science and economy games, keep about 1:1 or more cities.
  - Log the cheapest candidate's cost.
- **C2. Urban Center Focus** (`PROJECT_TOWN_URBAN_CENTER`: +1 Science and Culture on quarters; the town may buy science and culture buildings). With the science focus:
  - give it to towns that can host codex buildings (Library 2, Academy 3 slots) or Schoolhouse / Laboratory;
  - then buy those buildings there.

  Every town took Resort in game 6. Check in game what "can purchase additional science buildings" lets a town buy.
- **C3. Settlers:**
  - **Wandering:** the Antiquity settler queued on turn 35 founded on turn 70 (33 turns, retargeting). Give up on a site after N turns or N retargets and take the nearest safe one.
  - **Final age:** no settler with a victory focus in Commit. Seen: a settler at Modern 36–37 with no site.
  - **No sites:** no settler trained while the site search finds none (`SITES_FOUND [0]`).

## D. Science path
- **D1. Research gates per age**, generalising the Rocketry gate. The gate can be a mastery (depth 2) unlock:
  - Exploration: the Urban Planning mastery (Invent Calculus 10) and the Education mastery (Heliocentric Model 5) first;
  - Antiquity: the nodes that unlock Chart the Stars and Spherical Earth early.

  Seen: Calculus was unlocked on Exploration 65 and never produced.
- **D2. Innovation civics as soon as they are available** (Literacy, Social Class: the civic tree does not compete with tech gates). Seen: Social Class on Exploration 66.
- **D3. Science projects not stuck behind buildings with progress.**
  - Seen: Calculus behind a Hospital at Exploration 65–70; Trans-Oceanic Flight behind the Launch Pad.
  - Options: queue the project in the other city when the best one is busy; or, near the age's end, put it ahead anyway, after checking in `CityBuildQueue.csv` whether a project moved ahead of a building takes its progress (gotcha 20).
- **D4. "Expansion first"** applies to wonders only (projects give Innovation, and settlers already go ahead of projects: `unitSlot`), and only while a settler is walking to a reachable site or one is wanted with sites known.
  - Seen: Spherical Earth was never queued while we sat at 3 settlements under a cap of 4–5 for 35 turns.
- **D5. Modern sites timing:**
  - Launch Pads as soon as Rocketry is researched;
  - the Airfield only once its project is unlocked (the Flight or Aerodynamics mastery);
  - Launch Pad cities do not start wonders in Commit.

  Seen: the Airfield was finished on Modern 25 and waited 16 turns; Dogo Onsen sat in front of the second Launch Pad.
- **D6. Codex slots:** when codices wait in the archive and every slot is full, queue or buy a Library or Academy in a city or Urban Center town without one.
  - Seen: 13 codices, 11 slots; the 12-codex triumph was missed by one, and 2 Innovation were lost.
- **D7. Innovation wonders:** with the science focus, the wonders whose modifiers grant `VICTORY_SCIENCE_MODERN` points (Great Library, Nalanda, House of Wisdom, Shwedagon, Oxford, Manhattan Project) get a bonus worth 3 Innovation. Other wonders only in Growth, if at all.
- **D8. Crewed Space Flight Preparation in every Launch Pad city**, every Launch Pad bought with gold as soon as Rocketry is in (needs B1).

## E. Production discipline
- **E1. Wonders by focus and phase** (A2). Do not interrupt a wonder race with units unless a threat is real.
  - Seen: the Eiffel Tower lost at 460/900 after a Tank and a Settler jumped ahead; Wat Xieng Thong was dropped at 90/262; Oxford was queued and never worked on.
- **E2. No military buildings** (Military Academy) **and no advisor soldiers** in peace with a science or economy focus. Seen: a Landship, a Tank and a Military Academy in game 6.
- **E3. Explorers (artifacts)** only with the culture focus or none. Seen: about 670 production of Antiquarians in a science game.
- **E4. Upgrades only for defenders of a threatened settlement** (and the strong melee unit), not 14 upgrades into Tanks in peace. Also never in the last 2–3 turns of an age.

## F. Defence (open items)
- **F1. Strikes never fired:** the game's attack preview never answered (`SimulateCombatResult` never arrived: 16 turns, 0 STRUCK). Read the game's attack preview code (`interface-mode-*attack*`, combat preview panel) for the right call or event, and fall back to our own estimate from `Unit_Stats` plus health.
- **F2. Фучжоу** was founded at Exploration 12, 4 tiles from a camp created at Exploration 1, and lost at Exploration 22. Find out why the village rule did not reject it:
  - was the camp unseen when the site was picked?
  - did the settler's walking goal get re-checked?
  - is the camp an encampment type `villagesOf` misses?

  Add the villages count to the `sites:` UI.log line.
- **F3. Crisis encampments** (cannot be befriended) near our settlements: disperse them when empty (works), and do not count their home guards as threats (fixed).

## G. Diplomacy
- **G1. Calls to arms:** declining ends the alliance (the game's rule). Three alliances were lost in game 6.
  - Options: accept when the enemy is far away and not at our borders (earlier a "join" declared a surprise war with war weariness: check `DiplomacyDeals` / the call's war type); or let the user choose with an option.
- **G2. Open borders** proposed to the same leader 13 times: remember refusals for N turns.
- **G3. `VIEWED_ADVISOR_WARNING`** sent 2–3 times a turn for the same notification: once per id.

## H. Bugs and log noise
- **H1. Front-loading ping-pong:** a settler and a scout moved to the front alternately each turn (Modern 19–24). `frontLoadUnits` should not move a wanted unit ahead of another wanted unit already at the front.
- **H2. The same BUILD sent twice in one pass** (VICTORY_WORK, then QUEUED_PLAN): the plan's queueing should skip types the pass already queued.
- **H3. UI.log size:** 206 MB, mostly Detailed Map Tacks lookups. Consider fewer tack refreshes, or no plan tacks while the autopilot runs unattended (an option).
- **H4. Live JS reloads at a turn start** made the game send `TRIGGER_ADVISOR_SELECTED` 508 times (each UI boot). Harmless, but it means the autopilot booted ~120 times: develop between turns.

## I. Policies and crises
- **I1. Crisis cards:** value maintenance doubling (Barbarian Mercenaries), −Gold per city-state (Tribute), −Gold per import (Banditry) with our real counts (PYP gave −2.9 to −11.5). Pick the least harmful for our empire.
- **I2. Ming:** each celebration adds a policy slot the game then forces us to fill with a −15 Science card. Count that in the celebration choice when the civ pays per card.

## J. The player's own choices (mention in the tab / docs)
- **J1. Science legacy cards at the age change:** +25% project production, +1 specialist. In game 6 the player took the card that keeps cities as cities, which helped.
- **J2. Mementos:** the Memento Advisor.

## K. Checks after the next game
- Gold: the savings goal reached and spent (conversions, Launch Pads bought).
- Innovation by age: ≥ 25 by the end of Antiquity, ≥ 50 by the end of Exploration.
- Rocketry by Modern ~30; Crewed Space Flight Preparation running in 2+ cities.

## L. From the web research (scratchpad `research-strategy-web.md`; sources there)
Tags: broad = broad agreement; single = one source; official = Firaxis patch notes or dev posts.
- **L1. Block the rivals' victories (official + broad).**
  - Culture, economic and military wins need a multiple of the second-place player's score: 6× in mid-Exploration, 4× from late Exploration to 20% of Modern, then 3×, 2×, 1.5× and 1.25× through Modern. Then a 5-turn countdown that pauses rather than resets.
  - A solid second place blocks them. Each turn, compare the leader with second place in Tourism, GDP and Dominion against the current multiple. When a rival nears it, raise ours: wonders (which also denies them), celebrations, relics, artifacts, natural wonders.
  - Game 6: we were 6th in culture (86 against 388 a turn), and America won on Modern 47.
- **L2. Science targets per age (broad, Deity players after 1.4):** 20–30 Innovation at the end of Antiquity, 70+ at the end of Exploration.
  - Take every one-off source the age offers (they do not carry over): all 4 Antiquity and Exploration projects, the 4 science wonders, codices, masteries.
  - Many Future Techs: repeatable, with Innovation each (pickBonusResearch must keep taking them).
- **L3. A gold bank for Launch Pads (several players).** About 10,000 gold banked before Rocketry, a Launch Pad bought in each of 4–5 cities the turn it arrives, then Crewed Space Flight Preparation in all of them at once. This is the Commit phase's savings goal (B1).
- **L4. Settlements at the cap ±1 (broad, since 1.4's uncapped over-limit penalty).**
  - About 7–9 settlements by the end of Antiquity, of which 2–5 are cities.
  - Convert early while it is cheap: about 400 + 300 × cities − 50 × town population, between 200 and 1000 (community-measured).
  - Convert towns with production land and adjacency; food land and outposts stay towns.
- **L5. Commit about 25% into Antiquity** to the best-scoring victory, but keep defending the others (L1) (broad).
- **L6. Town Focus is said to reset to Growing at the Modern transition (single).** Set it again: the towns step handles Growing towns at population 7+, so check in game.
- **L7. Tea** speeds space projects (two players): with the science focus, assign it to the Launch Pad cities.
- **L8. Player-side:**
  - age-transition Dedications for science: the free Academics tech and +25% project production;
  - Glass Armonica memento (+15 Science per alliance per age) — keeping alliances matters (G1);
  - gold carried into Modern may be large (single: ~9,000).
- **L9. Happiness gates government bonuses and celebrations since 1.4 (broad):** keep settlements happy (I1, C1 conversions with the happiness check).
