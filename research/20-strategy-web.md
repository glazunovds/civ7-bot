# 20. Civ VII strategy from the web (2026-10-13, for the autopilot)

Collected by a research agent from official patch notes (via Steam news), CivFanatics, r/civ and Steam discussions; YouTube gave no transcripts. Paraphrased, with tags (broad agreement / single source / official / pre-1.4 / launch-era). Used by research/19 section L and the plan in research/21.


Web research, 2026-10-13. Everything is paraphrased. Each point is tagged:
- **[broad]**: several independent sources agree.
- **[single]**: one source or one player.
- **[official]**: Firaxis patch notes or a dev post.
- **[pre-ToT]**: older than Test of Time (1.4.0, 2026-05-19), so it may be out of date.
- **[launch]**: from February to April 2025, so very likely out of date.

## How I got the sources
- **Official pages:** civilization.2k.com and support.civilization.com return HTTP 403 (CloudFront) from this machine, probably a regional block. I read the official texts instead from the Steam announcements API (`api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1295660`): the 1.4.0, 1.4.1, 1.4.2 and 1.5.0 notes, the Victories and Triumphs dev diaries, and the Earthrise Q&A. My cleaned copies are in `scratchpad/steamnews/*.txt`.
- **Fandom wiki:** blocked by a Cloudflare bot check, which I did not try to get past. I used only search-result snippets from it.
- **Reddit:** read through a Redlib mirror (`redlib.groet-infra.nl`). The links below are the reddit.com permalinks.
- **YouTube:** the pages gave no description or transcript, so no YouTube content is used.
- **Most useful material:** CivFanatics "Civ7 – Strategy & Tips", r/civ threads from May to October 2026, and the official notes.

---

## 0. The ruleset after Test of Time (official; the basis for everything below)
- **Four score races** (1.4.0 notes, Victories dev diary) [official]:
  - **Military, "Dominion":** points for each settlement you control. Extra points for original capitals, captured settlements and Distant Lands settlements.
  - **Culture, "Tourism":** points for Wonders, Natural Wonders, Relics, Artifacts, Unique Buildings and Unique Improvements. Wonders you captured from another leader count for less. Each Celebration also earns Tourism.
  - **Economic, "GDP":** earned each turn from slotted resources and Gold buildings in Cities. Also from returning Treasure Convoys and from slotted Factory resources.
  - **Science, "Innovation":** from techs, codices and special projects in every age.
- **Dominance thresholds (Military, Culture, Economic).** Your score must be a multiple of the second-place player's score, then held for a 5-turn countdown. The countdown pauses rather than resets if you drop below. [official]

  | Window | Multiple of second place needed |
  |---|---|
  | Exploration, 50–80% age progress | 6× |
  | 80% Exploration to 20% Modern | 4× |
  | Modern 20–40% | 3× |
  | Modern 40–60% | 2× |
  | Modern 60–80% | 1.5× |
  | Modern 80–100% | 1.25× |

  - The notes tell anyone winning early to raise the difficulty.
  - The thresholds follow **age progress**, so anything that advances the age (for example Future Techs) lowers them for everyone. [single: u/adept42, Oct 2026, who held back future techs so the thresholds would not drop]
- **Science is not a dominance race.** You need 100 Innovation plus an active Launch Pad, then 5 turns. The notes call it a guarantee that science can still finish while the other races are close. [official]
- **Tiebreaks at the end of Modern:** turns spent in a countdown, then placement across all victories, then Major Triumphs completed. [official]
- **Other 1.4.0 changes that matter** [official]:
  - **Specialists** have no base yield. They now give 100% of their tile's adjacency (was 50%). Upkeep is 2/4/6 Food and Happiness by age, but only 1 on warehouse or obsolete buildings.
  - **Happiness:** −5% yields per point of unhappiness (was −2%), down to −80%. The over-limit Happiness penalty is now **uncapped** (was capped at −35).
  - **Towns:** almost every Town Focus can now buy a subset of buildings, no longer only Tier 1.
  - **Building costs:** Production buildings no longer raise the cost of later buildings.
  - **Influence costs:** Befriend Independent costs 20% more per active befriend action and per suzerained city-state. Improve Trade Relations costs 25% more each time.
  - **AI:** "various improvements" to how AI leaders pursue victory.
  - **Tech tree:** almost all passive yield bonuses removed; a Computation node added in Modern.
- **1.4.1 (2026-06-23)** [official]:
  - **Happiness stages:** Ecstatic is 40+ per age, Joyous 20–39 per age, Happy 0–19, Unhappy −1 to −19, Angry −20 or lower.
  - **Governments:** each now has a passive ability, two Celebration options and two exclusive Traditions.
  - **Celebrations:** harder to earn and shorter (6 turns at Standard speed instead of 10).
  - **Modern Elective Republic:** specialists get +1 Science and Culture and +1 Happiness upkeep. One celebration option is +1000 Science. Its Think-Tanks tradition gives +10% production toward Projects (+20% in the Capital).
- **1.4.2 (2026-07-28):** individual victories can be turned off again. Peace deals can trade Gold and Influence. [official]
- **1.5.0 (2026-09-15) and its hotfix (09-30):** TSL Earth map, Hall of History DLC, fixes for Treasure and Factory resources not spawning. No victory rebalance. [official]
- **Developers on science (Earthrise Q&A, 2026-09-23):** they say the science victory never got the attention culture did, and that improving it is a key goal of the 2027 expansion. This supports the community view that science is currently the weakest or hardest path. [official]

---

## 1. Science victory in the current version

### Players who keep winning it treat science as the default ending and win the other races first
- **It is the hardest or slowest victory against the AI** [broad]:
  - **r/civ:** u/kotpeter (Sep 2026, a highly upvoted guide) tells new players not to start with it, because the other wins come sooner. u/uzonk says economic and military wins come around Modern turn 40–50, science and culture often around turn 80–100.
  - **Steam:** a player says science became harder after ToT.
  - **CivFanatics:** two posters (Leucarum, Boris Gudenuf, May 2026) call science a "safety valve" or fallback win.
- **The common way to lose a science game is our exact case** [broad]: you lead in science, have roughly 45–78 Innovation, and an AI wins by culture or score first.
  - NormBac (CivFanatics, Aug 2026): about 55 Innovation, then an AI culture win.
  - u/FlyLikeABogey (r/civ, Jul 2026): 78 Innovation, and other victories kept triggering.
  - "Act Chill" (Steam, Jul 2026): has never won science in 20 games.
- **What fixes it** [broad]:
  - Keep your score close to the leader in every category, so no rival reaches the multiple.
  - Or switch the other victories off. Several players recommend this for a pure science game: GoblinMatron, javier51, and the one-settlement run.

### Innovation sources and amounts (exact values are in research/14; the web agrees)
- **Projects:**
  - Chart the Stars and Spherical Earth: 5 each, both in Antiquity. [fandom snippets]
  - Exploration: Heliocentric Model 5 and Invent Calculus 10.
  - Siptah (CivFanatics, Aug 2026): the four Antiquity and Exploration projects are about 25 points you can count on. [single, matches the data]
- **Crewed Space Flight Preparation:** **15 each, repeatable, and it runs at the same time in every city with a Launch Pad** [broad]. Seen in:
  - r/civ (Jun–Jul 2026): u/HieloLuz, u/Vanilla-G, u/YakWish, u/TastySpermDispenser7.
  - CivFanatics: Manpanzee, civfanatic4sure.
  - **How an AI used it:** in u/Res_Novae17's game (Jun 2026), Pachacuti went from about 60 to over 90 in one round by running it in several cities, then won. The player at 87 lost without warning.
- **Wonders:** four in Antiquity and Exploration give Innovation (Great Library 3, Nalanda, House of Wisdom, Shwedagon) [broad]. Modern wonders give 2 each through a triumph [single: TastySpermDispenser7].
- **Masteries, Future Techs and codices** all add Innovation [broad].
  - Experts take many Future Techs: 3–8 per age in the Deity speed runs (CivFanatics, May–Sep 2026).
  - Glass Armonica (science per alliance) is the memento most of those runs use in every age.
- **How far experts get before Modern** (CivFanatics "Fast Science Victory" p.12–13, Deity, May–Sep 2026) [broad within that thread]:
  - They enter Modern with **76–95 Innovation**.
  - From there, Rocketry, one big project and a mastery or two finish it.
  - pmarc (Aug 2026): 72 at Modern turn 10, then Rocketry 5, a final project 15 and Radio mastery plus project 7, leaving him 1 short.
  - Salamis (Sep 2026): Rocketry alone took him to 101.
  - **Our game 6 had 20 and 29 at the ends of Antiquity and Exploration. That is the gap.**

### Typical turn numbers
- **Deity speed runs after ToT** (continuity, most with no age countdown): totals of 159–283 turns. Modern lasted 15–43 turns (civfanatic4sure 85+40+34; Softly 103+70+26; uppi 140+100+43; pmarc expected Modern turn 38). [broad within the thread]
- **Ordinary strong players** win science around Modern turn 40–60:
  - u/keiselhorn13: Deity, at 39–40% Modern.
  - u/Junior_Island_4714: Immortal, around Modern turn 50.
  - u/IndorilMiara: around Modern turn 60.
  - u/uzonk: often turn 80–100. [single each]
- **Our loss on Modern turn 47 is about when strong players finish.** The AI's culture win came on schedule; we were behind.

### How many cities
- **Experts keep few cities and many towns, even for science** [broad]:
  - Salamis (Sep 2026, Deity): 4 cities and 9 towns at the end of Antiquity, 12 cities and 13 towns in Exploration, then only **2 cities and 24 towns** in Modern. Great Britain's warehouse science made each town worth about 44 Science.
  - pmarc's Catherine game (Aug 2026, Deity): 5 cities and 3 towns at Antiquity turn 120; 19 settlements against a limit of 17 in Exploration; 3 cities kept in Modern.
  - civfanatic4sure: 3 of 25 settlements were cities.
  - GoblinMatron: build many settlements and stay at the limit or 1–2 above it.
- **The other approach: few early points, then many Launch Pads** [several single sources, consistent with each other]:
  - u/Milocobo (Jun 2026): run 4–5 cities with an economic focus until Rocketry, buy a Launch Pad in every city, and run Crewed Space Flight in all of them. The countdown can start within about 5 turns, without earlier-age Innovation.
  - u/monstersvetish (Jul 2026): rush Rocketry with at least 5 cities running the basic science project. Build or buy only science and production buildings. **Keep about 10,000 gold** to buy Launch Pads the turn Rocketry arrives, then start the Innovation project in two cities for about 30 points.
  - u/TastySpermDispenser7: Launch Pads plus crewed flights in every city; you need only 3–4 runs.
  - u/YakWish and u/keiselhorn13 (Jun 2026): chasing Innovation early on Deity is a trap, because the AI takes the wonders. Catch up late with crewed flights, since the AI does not push science hard.
  - **Disagreement:** Siptah, pmarc and the speed runners collect early points instead. Both approaches work. **The early-points route needs fewer Modern cities; the late-flights route needs gold and 4–5 cities.** We did neither.

### Other science details
- **Tea** speeds space projects: slot all of it. [r/civ: mathematics1 and TastySpermDispenser7 agree]
- **Project production boosts:**
  - The Globalism triumph gives +50% to projects (pmarc, Aug 2026). [single]
  - The Modern dedication "free Academics tech with +25% production to projects". [single: pmarc]
  - Elective Republic's Think-Tanks tradition. [official]
- **Specialists:** valuable in Modern after the 1.4.0 rework, if placed on high-adjacency tiles. Migrants from befriended Expansionist city-states feed them. [pmarc; and u/BubbaTheGoat, Jul 2026]
- **Espionage:** Rocketry also unlocks a "Sabotage Space Program" action. Hoolie (Steam, Jul 2026) found spamming espionage essential in the space race. [single]
- **Patch changes to Innovation:** I found no published Innovation value change in 1.4.1, 1.4.2 or 1.5.0. Tech and civic costs changed in 1.4.0. [official]

---

## 2. Opening and expansion
- **Opening build** [broad]:
  - 2–3 scouts (4 on large maps), then a production building, then two settlers. Settlers need 5 population, so an early Granary or warehouse speeds this up (kotpeter, Sep 2026).
  - Several posters say to rush 5 population and build two settlers (BubbaTheGoat, That_White_Wall, Jul 2026).
  - Woodcutters on vegetated land give the best early yields (Blaz3s).
- **Settlement limit: stay at it, never far over** [broad]:
  - Several posters (2026) say exactly at the cap, or ±1. One says "never more than one above or below".
  - Expert runs go 2–7 over, but only with happiness dedications or traditions behind them.
  - The 1.4.0 uncapped over-limit penalty and the 1.4.1 happiness stages make large overages costly. The pre-ToT advice to ignore the cap is out of date.
- **How many settlements and cities at the end of Antiquity:**
  - About 7–9 settlements [broad].
  - Cities: 2–5, depending on the player:
    - 3–4 cities in Antiquity and 4–6 later (ShinigamiKenji, Sep 2026);
    - 2–3, then 4–5 by the end of the game (Scolipass and N8CCRG, Jul 2026);
    - 3–4, then 5–6 at the start of Exploration and 7–8 at its end (Blaz3s, Jul 2026);
    - up to 5 of 7–8 (Peechez, Oct 2026);
    - 3 all game on Deity (GaneBeatsTom).
  - The "town maxing" posts (Nov 2025, patch 1.3.0, still cited) say 2 cities in Antiquity, 3–4 in Exploration, 5–6 in Modern, with about 9, 20+ and 30 settlements. [single but popular]
- **Why few cities** [broad, since 1.2.5]:
  - Each extra city makes every non-warehouse building cost more: +10% per non-capital city and +5% per non-warehouse building in that settlement (phoenixician's analysis, Oct 2025, 1.2.5).
  - 1.4.0 removed Production buildings from that count.
- **Which towns to convert** [broad]:
  - Convert production-rich land (rough or vegetated) with good district adjacency. Keep food-heavy land (flat or water) as towns.
  - One player (Scolipass) converts only a town with a natural +3 adjacency science, production or culture district.
  - Islands, chokepoints and resource outposts stay towns.
- **When to convert, and the cost:**
  - The cost formula from community measurement [launch, pmarc Apr 2025]: **gold = 400 + 300 × (number of cities, including the capital) − 50 × (the town's population), between 200 and 1000.** Captured settlements cost double.
  - Costs players paid in Aug 2026 still fit it: pmarc paid 350, 600 and 1000; GoblinMatron paid 200 (turn 46) and 400 (turn 71).
  - **So convert the second and third cities early in Antiquity, while it is cheap.** The 1000 cap makes later conversions predictable to save for.
  - Converting a town in one age may make it cheaper in the next [launch, single].
  - The capital stays a city across ages. Players report other cities can revert, and specialized towns revert to "growing" at the Modern transition, so they stop sending food (u/OneRingOfBenzene, Oct 2026) [single]. **The autopilot should set the Focus again right after a transition.**
- **What to buy with gold early** [broad]:
  - Warehouse buildings (Saw Pit, Granary and the like) in future cities.
  - Settlers.
  - The town conversions themselves.
  - Military units only when threatened.
  - One player says gold matters more than in past games, because it is how towns develop.
  - Expert runs buy a Saw Pit around turn 12 and convert towns at 200–600 gold.
- **Town Focus** [broad]:
  - **When:** specialise once growth slows (next growth more than ~10–15 turns away) and the resources are claimed. In Exploration and Modern many specialise on turn 1.
  - **Fishing or Farming:** food for the cities.
  - **Mining:** gold.
  - **Urban Center:** buys buildings in towns; good adjacency without production.
  - **Resort:** breathtaking tiles and Natural Wonders, which also give Tourism.
  - **Hub:** influence.
  - **Religious:** relic slots.
  - Every Focus except Growing needs population 7 (matches gotcha 12).

---

## 3. Balanced first, or commit to a victory from turn 1?
- **The most common answer is to build balanced, then specialise** [broad]:
  - kotpeter (Sep 2026) and the r/civ beginner threads (Jun 2026): pick the victory where you have the most points at about 25% of Antiquity, then push it. Specialise once established, mostly in Modern.
  - Several players: Antiquity yields matter less, because Exploration levels everyone out. Build a solid base and transition well.
- **The other camp picks first** [several singles]: choose the victory, then the leader and civ that suit it (Berlin_Blues, Tanel88, anonymous_herald).
- **For science specifically** [broad]:
  - You cannot neglect the other scores. Stay in the top two or three in Tourism, GDP and Dominion, or an AI reaches the multiple first.
  - Keep a science lead in every age.
  - Use up every one-off Innovation source in each age; it does not wait.
  - Advice to dabble everywhere and specialize late is the wrong takeaway here: dabbling must cover defence (the score ratios), and only Innovation needs the focus.
- **What players do in each age:**
  - **Science:**
    - **Antiquity:** Chart the Stars, Spherical Earth, Great Library and Nalanda, display codices (the 12-codex triumph), Future Techs.
    - **Exploration:** Invent Calculus, Heliocentric Model, the four 2-point masteries, House of Wisdom and Shwedagon. Abbasid or Maya-type science civs.
    - **Modern:** Factories, then Tea, schoolhouses and Radio. Beeline Flight, Combustion and Rocketry. Buy Launch Pads, run crewed flights in parallel.
  - **Culture:** wonders from Antiquity on, natural wonders, unique buildings and improvements, relics through religion in Exploration, artifacts in Modern, celebrations, walls (an Exploration fortification triumph turns them into Tourism).
  - **Economic:** slot every resource, Gold buildings, Treasure Convoys in Exploration, Factory resources in Modern. A Great Banker early.
  - **Military:** settlement count, capturing capitals, Distant Lands settlements.
- **When to pivot** [broad]: watch the Victory screen.
  - A rival at about 2–2.5× second place in a category is the danger sign (kotpeter, TastySpermDispenser7).
  - The Victory screen's tooltips show where each rival's points come from (WeirdDud, Jun 2026).

---

## 4. Age transitions
- **Last turns of an age** [mostly launch, CivFanatics Feb–Mar 2025]:
  - Finish wonders and Ageless buildings.
  - Do not start science or culture projects you cannot finish.
  - Pre-place settlers and found on the last turn.
  - Spend Influence above what carries over.
  - Bank the age's last triumph or milestone.
  - Commanders carry their attached units across.
- **ToT changes** [official]:
  - The civilization choice now happens at the end of the age.
  - Pick 3 Dedications: 5 default ones, plus ones from Major Triumphs, leader levels and surviving the Crisis.
- **Gold carryover:**
  - Launch-era reports said about 3000 gold plus one turn's income, and about 300–350 influence [launch].
  - pmarc (Aug 2026, ToT) estimated a cap of about 9000 gold into Modern and had 8000 by Modern turn 10 [single, post-ToT].
  - Either way, banking gold across the Exploration-to-Modern transition for Modern conversions and Launch Pads appears to be safe. **Check the actual cap in our logs** (Player_Treasury.csv around the age change).
- **Mementos for science:**
  - Players name Glass Armonica (now +15 Science per alliance per age, 1.4.0), Yasakani no Magatama (science per tech mastery), Great Imperial Crown, Kite & Key, Analects, and Uraeus.
  - 1.4.0 gave Uraeus +1 Science, Culture and Gold per Major Triumph completed in an age. pmarc used it with Lotus Blossom in Modern.
  - Game8 lists Yasakani and the Crown as the top science mementos (undated). [several singles]
- **Dedications for science:**
  - "Free Academics tech, +25% production to projects".
  - "+5 Happiness per alliance" (lets you go over the settlement limit).
  - Keep the founder belief.
  - [single: pmarc; MutilationWave on the happiness one]

---

## 5. Gold management
- **Our main failure (research/18): gold spent on cheap town buildings, so it never built up.** The web advice is the opposite: save toward specific lumps.
  - Conversions at 200–1000 each.
  - **Launch Pads on the Rocketry turn: about 10k banked** (monstersvetish).
  - Warehouses in cities rather than towns.
- **Spending priorities** [broad]:
  - Military only for real threats.
  - Settlers and warehouses early.
  - Conversions.
  - In Modern: factories, schoolhouses, Launch Pads.
  - pmarc spent about 5000 gold at once on missing warehouses in Exploration, then on factories and schoolhouses in Modern.
  - Leftover gold buys missionaries or units.
  - Removing a partly built item and buying it is cheaper than buying from scratch (LadyUsana, Sep 2026). [single]
- **Gold sources:**
  - Celebrations: Oligarchy +200, Plutocracy +600, Bureaucratic Monarchy +1000 gold. [official, 1.4.1]
  - Specialized towns: town production becomes gold.
  - Treasure Convoys: 4–5k each in Exploration (gogorath). [single]
- **Unit upkeep:** I found no current formula. Advice is generic: keep a small defensive force and use commanders, since standing armies push income negative. [weak; no good post-ToT source]

---

## 6. Independent powers and city-states
- **ToT made early independents much tougher** [broad: r/civ May 2026, two threads; "Suzerainty cost" has 270 upvotes]:
  - They raid sooner and with bigger armies.
  - Befriending costs grow with each active befriend and suzerainty (1.4.0).
  - Influence is "scarcer than ever". In Antiquity you can realistically do only one or two of: diplomacy with leaders, city-states, war.
- **How strong players handle them** [broad]:
  - More early military than before.
  - Clear hostile neighbours early, before their stacks grow, since garrisons fortify every turn.
  - Do not chase raiders far from home.
  - Choose per independent between dispersing and suzerainty, by type, location and influence budget. Hostile ones take about twice as long to suzerain.
  - Conquer the nearby ones (rewards and land); befriend the distant ones (bonuses).
  - In pmarc's and GoblinMatron's Deity science games (Aug 2026), roughly half were dispersed and half suzerained in Antiquity.
- **Settling near an independent before befriending it makes it hostile** (kotpeter says within 5 tiles; our research/17 found 3 / 4–6). [broad]
- **Useful city-state types for science:**
  - Scientific and cultural ones give free techs and civics, which speed runs rely on.
  - Expansionist ones give settlement limit and migrants (food).
  - Militaristic ones give settlement limit.
  - [CivFanatics speed runs, pmarc]
- **Unique improvements** of a suzerained city-state give Tourism only while you keep it (u/-Morsmordre-, Sep 2026). [single]

---

## 7. How the AI wins, and how players stop it
- **The AI's usual winner is the wonder-builder** [broad]:
  - Hatshepsut, Isabella and Augustus are named. One player calls the culture race nearly guaranteed for Isabella and Augustus in Exploration (Emergency-Town4653, Jun 2026).
  - The AI out-builds players on wonders on Deity (Darth486; Manpanzee).
  - Our game 6 matches: Tubman had 18 wonders to our 1.
  - Wonders, celebrations, great works and unique buildings drive Tourism; population barely matters (r/civ, Jun 2026, on a Hatshepsut culture win from weak cities).
  - Each age has a major triumph for building a set number of wonders, which pays culture and production.
- **AI science** can jump suddenly when it runs crewed flights in several cities (u/Res_Novae17's game).
- **AI yields matter less than AI victory scores** (kotpeter, Jun 2026) [broad]:
  - A rival at 2–3× everyone else in Tourism, GDP or Dominion is the danger.
  - Defence is to keep your own score in that category high enough. **The threshold is a ratio to second place, so being a solid second is enough to block.**
- **Ways to keep your Tourism up** [broad]:
  - Build wonders; each one you build is also one the AI does not get.
  - Settle or conquer Natural Wonders.
  - Unique quarters, buildings and improvements.
  - Relics.
  - Celebrations.
  - Walls, with the fortification triumph.
  - Collect triumphs, especially in Modern; they score on both offence and defence.
- **Ways to keep GDP up:** trade, fill resource slots, rush factories, Great Banker. [kotpeter]
- **Ways to keep Dominion up:** settle early. Taking settlements raises it, and too many settlements relative to second place sets you up for an accidental military win. [several]
- **Active counters** [broad]:
  - Take or pillage the leader's wonder city.
  - Pillage its high-output districts.
  - Sanctions, espionage, stealing tech and civics.
  - Join allies' wars against the leader.
  - Some players say war is close to mandatory in Modern; others won peacefully.
  - CivFanatics (Calcifer, MutilationWave, Sep 2026): for your own dominance wins, cutting the second-place score matters more than eliminating civs.

---

## 8. What matters most for speed: a tier list
- **Top, with broad agreement:**
  1. **Settlement count at the limit early, and a settlement limit raised by every means available** (civics, attributes, city-states, mementos, dedications). It feeds Dominion, GDP, food and gold.
  2. **Wonders.** They give Tourism, triumphs, Innovation (four science wonders), adjacency, and deny the AI.
  3. **Production in a few strong cities, with many towns behind them.** Cities are where projects and wonders are built.
  4. **Happiness.** Since 1.4.1 it gates government bonuses and Celebrations, and the over-limit penalty is uncapped.
  5. **Influence for city-states.** Free techs and civics, settlement limit, migrants.
  6. **Early conquest** of a weak neighbour or independents in Antiquity. Strong players do it; it is not required.
- **Science specifically:**
  - Future Techs and masteries each age; Glass Armonica plus alliances.
  - Every one-off project as soon as it unlocks.
  - Tea, and project-production boosts (Think-Tanks, Globalism).
  - Gold banked for Launch Pads.
  - Scientific civs named in 2026: Abbasid (Exploration), Great Britain (Modern), Maya and Han (Antiquity), Assyria and Bulgaria for speed runs, Meiji (Modern; mixed opinions). Ada Lovelace + Maya is called "busted". [several singles]
- **Governments (1.4.1 passives):**
  - Antiquity: Oligarchy (+10% production on buildings) versus Classical Republic (culture) — debated, no answer.
  - Exploration: Plutocracy (+600 gold celebration; its tradition gives +2 Science on gold buildings) is attractive for gold.
  - Modern: Elective Republic is the science government.
  - [official values; player preference single-source]
- **Things to avoid** [several]:
  - Ming's policy-slot science penalty after ToT (CivFanatics thread, Jun–Sep 2026).
  - Spreading Influence over small bonuses.
  - Being both at peace and at war: pick one (TastySpermDispenser7).

---

## What this means for the autopilot (my synthesis, not from any one source)
1. **Innovation targets per age:** about 20–30 at the end of Antiquity and **70+ at the end of Exploration**, then Rocketry plus one or two crewed flights.
   - Do every project the moment it unlocks.
   - Do the Innovation masteries, Future Techs and the four science wonders.
   - Watch out: Future Techs also advance the age and lower the AI's dominance thresholds.
2. **A gold plan with set targets instead of spending everything above a reserve:**
   - Cheap early conversions to 3–5 cities in Antiquity (200–600 each).
   - Re-conversions at the start of each age.
   - About 10k banked before Rocketry, so Launch Pads can be bought in 3–5 cities at once and Crewed Space Flight Prep run in all of them (15 each).
   - Town warehouses only from the money left over.
3. **Defence on the Victory screen:**
   - Track, for each of Tourism, GDP and Dominion, the leader ÷ second-place ratio against the current threshold.
   - When a rival comes near it, put effort into our own score in that category (wonders, celebrations, natural wonders, relics, unique improvements; resource slots and factories for GDP), use espionage or sanctions, or go to war against its wonder city.
   - Disabling victories at setup is the user's choice, not ours.
4. **Settlements:** stay at the limit ±1. Set the Town Focus again after each transition (specialised towns go back to Growing in Modern). Convert production-rich, high-adjacency towns.
5. **Independents:** early military to clear the hostile ones nearby; suzerain only where there is influence to spare. Scientific, cultural and expansionist city-states first.

---

## Sources
**Official (texts read through Steam's news API, since the 2K site is blocked from here)**
- Update 1.4.0 notes, 2026-05-19: https://civilization.2k.com/civ-vii/game-update-notes/2026-may-19-patch-1-4-0/ (Steam copy: https://store.steampowered.com/news/app/1295660)
- Test of Time dev diary, Victories, 2026-05-13: https://civilization.2k.com/civ-vii/game-guide/dev-diary/victories-post-launch/
- Update 1.4.1, 2026-06-23: https://civfanatics.com/2026/06/23/civilization-vii-update-1-4-1-is-now-live/
- Update 1.4.2, 2026-07-28: https://civfanatics.com/2026/07/29/civilization-vii-patch-1-4-2-released-with-brush-blade-part-2/
- Update 1.5.0, 2026-09-15: https://forums.civfanatics.com/threads/civilization-vii-update-1-5-0-september-15-2026.704682/ and https://support.civilization.com/hc/en-us/articles/55328611080339-Civilization-VII-Patch-Notes-September-15-2026
- Arc of Tomorrow and Earthrise Q&A, 2026-09-23: https://www.reddit.com/r/civ/comments/1woa0a5/we_answered_30_of_your_arc_of_tomorrow_earthrise/
- Patch summary: https://patched.gg/games/civilization-vii/update-140-test-of-time-patch-notes

**CivFanatics**
- Elusive science victory (Aug 2026): https://forums.civfanatics.com/threads/elusive-science-victory.704167/
- Fast Science Victory, Civ VII Edition, p.12 (May–Jul 2026): https://forums.civfanatics.com/threads/fast-science-victory-civ-vii-edition.697892/page-12 ; p.13 (Sep 2026): …/page-13 ; p.5 (Oct 2025, pre-ToT): …/page-5
- Deity pacifist science playthrough, Catherine (Aug 2026): https://forums.civfanatics.com/threads/deity-pacifist-science-playthrough-catherine-of-russia.704203/ and …/page-2
- Winning in Exploration (Sep–Oct 2026): https://forums.civfanatics.com/threads/winning-in-exploration.704867/
- Test of Time Developer Diary, Victories, discussion (May 2026): https://forums.civfanatics.com/threads/test-of-time-developer-diary-victories.703297/
- Time-Tested dev diary thread (May 2026): https://forums.civfanatics.com/threads/test-of-time-developer-diary-time-tested-civs.703253/
- The Ming ToT changes (Jun–Sep 2026): https://forums.civfanatics.com/threads/the-ming%E3%83%BBtot-changes.703636/
- Town specialization (Oct 2025 to Aug 2026): https://forums.civfanatics.com/threads/town-specialization.700305/
- Analysis of 1.2.5 building cost (Oct 2025): https://forums.civfanatics.com/threads/analysis-of-1-2-5-on-building-cost-and-overbuilding.700269/
- Formula analysis (conversion cost; Feb–Apr 2025, launch): https://forums.civfanatics.com/threads/formula-analysis.695108/
- What to do as an age is ending (launch): https://forums.civfanatics.com/threads/what-to-do-as-an-age-is-ending.695760
- Gold and influence rollover (launch): https://forums.civfanatics.com/threads/gold-influence-not-rolling-over-explained.696164
- Current meta, tall vs wide (launch): https://forums.civfanatics.com/threads/current-meta-and-tall-vs-wide.695443

**r/civ (2026 unless noted)**
- Science Victory Help (Jul 24): https://www.reddit.com/r/civ/comments/1v5g0sr/science_victory_help_civ_vii/
- Reminder: AI yields don't matter as much as their victory scores (Jun 27): https://www.reddit.com/r/civ/comments/1uh5utv/reminder_ai_yields_dont_matter_as_much_as_their/
- Managed to win Science (Jun 6): https://www.reddit.com/r/civ/comments/1tyfoe8/managed_to_win_science_takes_a_lot_of_focus/
- Can anyone explain how I just lost this game? (Jun 23): https://www.reddit.com/r/civ/comments/1udquhv/can_anyone_explain_how_i_just_lost_this_game/
- Science victory with one settlement (Aug 30): https://www.reddit.com/r/civ/comments/1w22h1u/i_got_a_science_victory_on_deity_with_zero_tile/
- AI cultural victory despite 18 underpopulated settlements (Jun 17): https://www.reddit.com/r/civ/comments/1u8olf8/please_help_me_understand_what_is_going_wrong/
- How can I stop the AI running away with science (Jul 3): https://www.reddit.com/r/civ/comments/1umrysj/civ_vii_how_can_i_stop_the_ai_from_running_away/
- To everyone trying Civ 7 in the free weekend (Sep 3): https://www.reddit.com/r/civ/comments/1w6mmd0/to_everyone_whos_going_to_try_civ_7_during_the/
- Civ7 core gameplay… strategy observations (May 31): https://www.reddit.com/r/civ/comments/1tt3hpl/civ7_core_gameplay_is_finally_better_than/
- Towns are Significant on Deity, 1.3.0 (Nov 8 2025): https://www.reddit.com/r/civ/comments/1orihi9/towns_are_significant_in_civ_vii_on_deity/
- Town Maxing (Nov 13 2025): https://www.reddit.com/r/civ/comments/1ow4b6a/are_cities_meta_i_dont_think_so_introducing_town/
- Civ 7 tips and tricks (Jul 10): https://www.reddit.com/r/civ/comments/1usmk2n/civ_7_tips_and_tricks/
- Tips for Getting Better (Jul 29): https://www.reddit.com/r/civ/comments/1v9yf44/tips_for_getting_better/
- ToT buff to early Independent Powers (May 20): https://www.reddit.com/r/civ/comments/1tj2u4r/tot_is_very_good_but_anyone_else_finding_the_buff/
- Suzerainty cost is one of the biggest changes (May 20): https://www.reddit.com/r/civ/comments/1tiohv6/suzerainty_cost_is_one_of_the_biggest_changes/
- How to target culture victory (Sep): https://www.reddit.com/r/civ/comments/1wi3ju6/how_to_target_culture_victory/
- Notes after free week by a Civ 6 player (Sep 10): https://www.reddit.com/r/civ/comments/1wcupyh/some_notes_on_civ_7_after_free_week_by_a_civ_6/
- Complete beginner: how to build a strategy (Jun 13): https://www.reddit.com/r/civ/comments/1u554zj/civ_7_complete_beginner_here_how_do_you_stop/
- Civ 7 needs more varied ways to use gold (Sep): https://www.reddit.com/r/civ/comments/1wpg1qe/civ_7_needs_more_varied_ways_to_use_gold/
- Cities vs Towns (Oct): https://www.reddit.com/r/civ/comments/1x2diz7/cities_vs_towns_i_just_dont_get_it/
- Quadruple Victory, Babylon (Oct): https://www.reddit.com/r/civ/comments/1x1a4x3/quadruple_victory_timetested_babylon_deity/
- Victories need to change (late Sep): https://www.reddit.com/r/civ/comments/1wuciqg/victories_need_to_change/

**Steam discussions**
- Can never get science victory??? (Jul 2026): https://steamcommunity.com/app/1295660/discussions/0/581678051258018382/
- Test of Time completely breaks military victory (May–Jun 2026): https://steamcommunity.com/app/1295660/discussions/2/834999523153728451/

**Guides (lower weight)**
- Chill Place Gaming, economic victory after ToT: https://chillplacegaming.com/civilization-vii-economic-victory-guide/
- Game8 science and memento pages (undated): https://game8.co/games/Civ-7/archives/494969
