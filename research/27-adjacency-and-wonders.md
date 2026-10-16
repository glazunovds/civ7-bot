# 27. Adjacency planning and wonders

The player asked after game 19, with a city-planning video, its transcript (`script.txt`) and a wonder
tier list:
1. Do we plan whole sets of buildings for the best adjacency?
2. Do we gather adjacency where specialists will work, a few cities ahead?
3. Do we weigh future gains against a bigger bonus now?
4. Can our civilization's own wonder anchor the plan?
5. Some adjacencies are good in the first age and much worse in the next.
6. The game's placement numbers look wrong next to our map tacks.
7. Do we build any wonder we think we can win? Could we rank them?

The game logs of the last games were gone (the game was restarted), so the plan's quality was
measured on random maps instead (§2).

## 1. Facts (game data, verified)

**Adjacency groups by age** (`Constructible_Adjacencies`, our fixtures):

| Group | Antiquity | Exploration | Modern | Source of adjacency |
|---|---|---|---|---|
| Science | Library, Academy (+ per quarter) | University; Observatory (+ mountains) | Schoolhouse, Laboratory | resources, wonders |
| Production | Barracks, Blacksmith | Dungeon, Armorer (+ Horses, Iron) | Military Academy; Factory (+4 per quarter) | resources, wonders |
| Culture / happiness | Monument, Amphitheater, Arena, Villa | Kiln, Pavilion, Temple, Menagerie | Museum, Opera House, City Park, Radio Station, Department Store | mountains, natural wonders, wonders |
| Food / gold | Garden, Bath, Market, Lighthouse | Tavern, Hospital, Wharf, Bank, Bazaar, Guildhall | Tenement, Cannery, Port, Stock Exchange | coast, navigable rivers, wonders |

The groups repeat across ages, as the video says. Wonders feed every group.

**The Palace:** +1 Science and +1 Culture for each adjacent quarter, in every age (Exploration also
+1 Happiness per adjacent fortification).

**Obsolete buildings** (Civilopedia): "Buildings lose their adjacency bonus when not in their original
Age unless they are Ageless".
- They keep their base yields.
- They no longer form quarters.
- Warehouses, unique buildings and wonders are ageless.

**Specialists** (Civilopedia since 1.4.0, research/10, research/13):
- Each specialist repeats 100% of all its tile's adjacency and has no yield of its own.
- Upkeep is 2/4/6 Food and Happiness by age (1 on warehouse and obsolete tiles).
- The limit per tile (`CITY_WORKER_STARTING_CAP`) is 1 in Antiquity and Exploration (+1 each from
  Education and Urban Planning) and 3 in Modern. It is live in `city.Workers.getCityWorkerCap()`.
- The Exploration science path wants 5 urban tiles with 40 total yield.

**Resources by age** (`Resource_ValidAges`, resources.xml and resources-v2.xml):

| Valid in | Resources |
|---|---|
| Antiquity only | Hides, Lapis Lazuli, Salt, Wool |
| Antiquity, Exploration | Camels, Clay, Dates, Dyes, Flax, Gypsum, Incense, Iron, Jade, Mangos, Rubies, Turtles, Wild Game |
| every age | Cotton, Cowrie, Crabs, Fish, Gold, Hardwood, Horses, Ivory, Kaolin, Limestone, Llamas, Marble, Pearls, Rice, Silk, Silver, Tin, Wine |
| Exploration, Modern | Cocoa, Furs, Niter, Pitch, Spices, Sugar, Tea, Truffles, Whales (Cloves: Exploration only) |
| Modern only | Citrus, Coal, Coffee, Nickel, Oil, Quinine, Rubber, Tobacco |

So a quarter planned around Salt or Wool loses that adjacency at the age change (question 5). The
video grows toward Cotton first because it is a 2 Food 2 Production tile; Cotton also lasts every age.

**Favored wonders:** `CivilizationFavoredWonders` (49 civilizations).
- The civilization's own civic unlocks its wonder early (Egypt's Light of Amun-Ra unlocks the Pyramids).
- The AI weights its own favored wonder by 50.

**Wonders:** all 71 (base game and DLCs) are ageless. Their placement rules are in their text.

**The game's placement numbers** (question 6). The "Place Dungeon" panel shows how the settlement's
totals change:
- the new building's yields;
- minus what it replaces (the Blacksmith's +4 base production: obsolete buildings keep their base
  yields);
- plus what changes on its neighbours (the Palace's quarter bonus, other buildings' quarter and
  wonder adjacency) and on specialists.

The production list shows the building's own yield on its best tile (+10). Our tack shows the
building's own yields in the planned layout, planned neighbours included (+11). They answer different
questions, so neither is wrong. Comparing tiles by the game's totals is the trap the video describes:
- the cost of overbuilding is paid whichever building ends up on that tile;
- the Palace bonus comes from any two buildings.

The plan trusts its own numbers. The game's numbers only calibrate our adjacency, per building and
tile (`calculateAllBuildingsPlacements` `changeDetails`). The Buildings tab's "the production menu
shows tile X" is a note.

## 2. How good were our layouts?

`tools/bench-optimality.mjs` builds a random city:
- resources, mountains, hills, coast on one side, a river, sometimes a wonder or a natural wonder;
- every building of the age.

It solves the city with our solver and compares the result with the best layout found by two long
simulated-annealing chains (40,000 moves and swaps), judged by the plan's own value model.

| Antiquity, 10 maps × 2 profiles | Time-aware (the default) | Static |
|---|---|---|
| Our solver (greedy, local moves, swaps) | 4.5% below the best, worst 16.5%, 38 ms | 6.7%, worst 16.5% |
| + annealing step (now) | **1.3%**, worst 4.5%, 128 ms | 3.7%, worst 8.1% |

The cause: a far tile can take a building only once a chain of urban tiles reaches it, and every link
alone loses value. So greedy and local search kept every quarter around the Palace at +0, while +3/+4
tiles two rings out stayed empty. On one map the old plan put the Barracks and Blacksmith by the
Palace at +0. The best layout found used a Granary on the tile between to put them next to 3
resources (+3 each), and both Garden and Market by the coast (+3 each).

This is the video's "connector buildings": cheap buildings (Altar, Monument, warehouses) built toward
the good tiles.

Other measurements:
- Exploration: 2.1% below the best before the change.
- Modern: 1.8% (larger base yields, smaller adjacency share).
- An intermediate "bridge move" (a connector to a far tile, then a building there) reached 2.8%
  time-aware for 140 ms. It was not kept: annealing alone does better for the same time.
- Annealing steps per building: 40 → 3.5%, 80 → 3.0% (both worst ~14%), 120 → 1.3%, 200 → 1.05%.

## 3. Answers and what changed

1. **Whole sets of buildings:** yes. Every building of the age is planned together per settlement, or
   per region (neighbours and planned sites), for the total value:
   - neighbours' changes, overbuilt base yields and lost rural yields included;
   - our adjacency rules anchored to the game's numbers.

   The search left 4–7% on average (16% at worst). **Changed:** an annealing step (§2;
   `core/xpl-placement-solver.js`, root gotcha 48).
2. **Specialists:** no. Every adjacency was multiplied by a flat 1.5, an older rule (50% per
   specialist), so adjacency gathered on one tile was worth no more than the same spread over two.
   **Changed** (root gotcha 49):
   - A tile is worth `slots × max(0, its weighted adjacency − cost)` more. `cost` is a specialist's
     Food and Happiness upkeep by age plus the rural tile it does not work. `slots` is the setting's
     share (half by default) of the city's own specialist limit.
   - Two high-adjacency buildings on one tile now beat the same adjacency on two tiles.
   - The setting is now «Специалисты на хороших клетках»: none / half the limit / the full limit.
3. **Future against now:** within the age, yes. Buildings finishing later count less, those after the
   age 5%, and tiles not owned yet ×0.85 and not before turn 10. Nothing counted beyond the age.
   **Changed** (root gotcha 50):
   - The plan counts half of the next age for the adjacency an ageless building keeps (none in the
     final age).
   - The Palace's quarter bonus lasts only from quarters of ageless buildings, so warehouses now go
     next to the Palace (the video's advice) and the age's buildings to their adjacency spots.
4. **Our own wonder:** not yet (proposal P1). The plan sees a wonder only once it is built or tacked.
5. **Worse next age:** obsolete buildings lose adjacency (handled within an age: overbuilding costs
   their base yields). Resources that vanish (§1) are not foreseen (P3).
6. **The game's numbers:** we already trust our own (§1). The Buildings tab's rows show both: our
   base and adjacency, and the game's number for the same tile (its total change, overbuilding
   included).
7. **Wonders:** the autopilot starts any wonder it can win:
   - the race is ours (HIGH, or MEDIUM ×0.6);
   - it finishes 2 turns before the age ends and in at most 15 turns;
   - ranked by (its yields + the adjacency its tile gives + 4 for the legacy path + 12 for Innovation
     wonders under a science focus) / turns.

   Effects counted for nothing: Oxford's two technologies, attribute points, a settlement limit,
   +10% growth. **Changed:**
   - Every wonder has a tier (`core/xpl-wonder-tiers.js`: S 10, A 6, B 3, C 1, D 0 weighted yields),
     graded from its text in the game and the shared tier list (its icons could not all be matched to
     names, so the grades are our own).
   - The Wonders tab shows the tier, and the game's description when a row is opened.
   - The Hanging Gardens (S) now beat quicker Pyramids (B). The Great Library (Innovation) still beats
     the Pyramids under a science focus, but loses to the Hanging Gardens when its race is only MEDIUM
     (14 turns against 10).

The tier table:

| Tier | Antiquity | Exploration | Modern |
|---|---|---|---|
| S | Hanging Gardens, Oracle, Terracotta Army, Great Stele | El Escorial, Shwedagon Zedi Daw | Oxford University |
| A | Great Library, Nalanda, Colossus, Emile Bell, Angkor Wat, Sanchi Stupa, Ha'amonga 'a Maui, Mireuksa | House of Wisdom, Notre Dame, Forbidden City, Machu Pikchu, Tomb of Askia | Brandenburg Gate, Taj Mahal, Eiffel Tower, Hwaseong, Ubudiah Mosque, Manhattan Project |
| B | Mausoleum of Theodoric, Weiyang Palace, Pyramids, Petra, Mundo Perdido, Monks Mound, Great Lighthouse, Vix | Rila Monastery, Globe Theatre, Hale o Keawe, Grand Bazaar, Wat Xieng Thong, Havana Harbor | Hermitage, Palacio de Bellas Artes, Sultanahmet Camii, Statue of Liberty, Dogo Onsen, Chengde Mountain Resort, Doi Suthep, Muzibu Azaala Mpanga, Nirayama Furnace, Eram Garden |
| C | Hoo-do, Gate of All Nations, Pyramid of the Sun, Colosseum, Mausoleum at Halicarnassus, Dur-Sharrukin, Byrsa | White Tower, Brihadeeswarar Temple, Borobudur, Serpent Mound, Buseoksa, Nan Madol | World's Fair, Red Fort, Boudhanath |
| D | | Erdene Zuu, Reykjaholt, Himeji Castle, Thành Huế | Battersea Power Station |

## 4. What the video teaches, against the plan

| Video | Plan |
|---|---|
| Three groups, wonders feed all | Our rules are the game's per building (finer than groups) |
| Two quarters per group in each important city | Emerges from the optimiser (not a rule) |
| Don't trust the game's placement numbers; plan with map tacks | Done (§1) |
| Warehouses next to the Palace to complete quarters | Now preferred (ageless quarters) |
| Connector buildings toward good tiles | Now found (annealing) |
| Don't put an ageless building on a spot you will want to overbuild | Partly (the Palace pulls warehouses); P2 |
| Reserve tiles for future wonders in the overlap of cities, around the best quarters | Not yet (P1) |
| Re-place the tacks at the age change | The autopilot re-plans; the new age's buildings get new tacks |
| Unique quarters planned from the start | Yes (the civilization's unique quarter, `UQ_BONUS`) |

## 5. Proposals

- **P1. Wonder anchors — done (§7).** The plan reserves tiles for the wonders we will build:
  - our favored wonder (unlocked early by our own civic), wonders in production, the autopilot's next
    picks;
  - each on a valid tile chosen where it feeds the most planned buildings;
  - the autopilot then builds it there.

  Needs:
  - wonder items in the solver (a wonder district, its placement rules: some need a river, rough
    terrain, coast, or no urban neighbour);
  - the engine's valid tiles once it is unlocked;
  - wonder tacks for the plan;
  - the Wonders tab and the autopilot preferring the planned tile.
- **P2. Ageless buildings off future-good tiles.** A cost for an ageless building on a tile whose
  adjacency the next age's buildings would want (resources valid next age, mountains, coast, wonders).
- **P3. Resources by age.** In a non-final age, adjacency from a resource that vanishes next age counts
  only this age (for P2 and unique buildings).
- **P4. The game's numbers next to ours in the production menu's tack pill** (overbuilt yields shown),
  so the player sees why the menu prefers another tile.

## 6. Game 20: the culture victory, and two wonders lost

Silla (Himiko) won a Modern culture victory, turn 60, with 15 wonders built over the game. Yields from
Exploration on led every rival:
- Exploration turn 36: culture 126 against the best rival's 94, science 95 against 73, production 140
  against 97, building yields 591 against about 212.
- Antiquity science lagged (culture focus).

Two Antiquity wonders were lost (`CityBuildQueue.csv`):

| Wonder | Ours | The rival | What became of our progress |
|---|---|---|---|
| Weiyang Palace (Yodam) | from turn 46 at 15 a turn (2 turns behind a defender under threat) | Greece from turn 51 at 32 a turn, done turn 56 | 162 → 97 into 40-cost Ancient Walls: ~147 lost |
| Petra (Sorabol) | from turn 61 at 21 a turn, 173/187 on turn 66 | Mexico from turn 63 at 45–52 a turn, done turn 66 | 173 → 105 into a 90-cost Pagoda: ~165 lost |

- **The refund rule:** a lost wonder pours half its progress plus that turn's production into the next
  item, up to that item's cost (root gotcha 20, seen again).
- **Visible in time:** omniscient mode was on, so both races were visibly lost from the rival's first
  turn. But a wonder in progress was never judged again.
- **Changed** (root gotcha 53):
  - A building moved ahead of a wonder takes all its progress up to its cost (the same rule that once
    cost us the Pyramids), so a race we can see we lose is cashed out into the building that keeps the
    most. Game 21 saw the wonder keep its progress (research/28 §3): what the cash-out saves is the
    production that would still go into the race.
  - A big building always stands right behind a wonder, so a refund is not wasted.

## 7. Wonder anchors (P1, done)

The building plan now keeps tiles for the wonders we will build (root gotcha 52). Each wonder anchor:
- is planned with the buildings;
- takes a whole tile and becomes a wonder district that gives its neighbours +1;
- is limited to the tiles the game allows (or our own wonder's rules while it is locked);
- is built there by the autopilot.

Simulated on 20 random cities × 2 profiles, with Terracotta Army as the anchor:

| | Static | Time-aware |
|---|---|---|
| Wonder placed after the buildings on its best tile (before) | 108.6 | 38.4 |
| Wonder planned with the buildings | 112.5 (+3.6%, better in 30 of 40) | 39.6 (+3.2%) |
| Time per city | 135 → 145 ms | 151 → 158 ms |

The rule book now also reads `Constructible_ValidBiomes` (Petra on desert, Weiyang on grassland...) and
`AdjacentDistrict` (wonders that must touch an urban district).

## 8. Plan speed and further quality

In game 20 the building plan used 420 s of CPU over 242 plans:
- full plans: 76 plans, 217 s, 2.9 s each;
- incremental plans: 166 plans, 203 s, re-solving 584 of 1,718 settlement slots;
- annealing: 54% of the total (it gained +12 to +45 weighted yields on full plans).

**Changed** (root gotcha 16):
- **Foundings and conversions:** a founding, a town turned city or a new site no longer re-plans every
  settlement. 40 of the 76 full plans (125 s) came from these.
- **Yield totals:** the game's per-tile yield totals are out of a settlement's fingerprint; they moved
  every turn.
- **The log:** it says why a plan is a full one.

Expected: roughly 40–50% less plan CPU in a game like this, about what annealing added.

Tried, measured, and not kept:

| Idea | Result |
|---|---|
| Moves drawn only from tiles a building could take | Worse time-aware (1.67% against 1.36% from the best, 30 maps) |
| Warm start from the previous layout, fewer steps | 9% worse time-aware: it keeps the old build order, and annealing never changes order |
| Fewer annealing steps (40 or 80 per building) | 3.0–3.5% from the best, worst ~14% |
| 200 steps per building | 1.05% against 1.33%, +25% time |
| Neighbour swaps in the build order after the solver | +1.1% Antiquity, +0.1% Exploration, ~10 ms |
| Bridge moves (a connector, then the far tile) | Subsumed by annealing |

The search sits about 1.3% below the best layout found; what is left lies in the model (P2, P3 below).
