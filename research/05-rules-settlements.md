# 05 – Settlement, growth and town/city rules (Civ VII data scout)

Root used below: `G = D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base`.
Everything was read-only. Anything not directly backed by a data value is marked **INFERRED**.

Key finding: the *base* GlobalParameters (CITY_MIN_RANGE and the antiquity TOWN_UPGRADE_* values) are **not in any shipped XML/SQL**. Only the per-age overrides exist. The defaults are compiled into gamecore, so at runtime the mod should read them with `GameInfo.GlobalParameters.lookup(name)` rather than hard-coding them.

---

## 1. Founding rules

| Rule | Value | Source |
|---|---|---|
| Min distance between settlements | `CITY_MIN_RANGE`. No value in the data files; the UI script's fallback is **3** (`let minRange = 3; ... lookup("CITY_MIN_RANGE")`). In practice, plots within radius 3 of another settlement are claimed/blocked. **INFERRED:** you cannot found at distance ≤3, so centres need to be ≥4 apart. | `G\modules\base-standard\maps\assign-advanced-start-region.js:36-40` |
| Engine validity check (best hook for the mod) | `Players.get(id).Diplomacy.isValidLandClaimLocation(plot, true)`. The Settler lens uses it to mark plots blocked/okay/best. Water plots are never valid. | `G\modules\base-standard\ui\lenses\layer\appeal-layer.js` |
| "Best" plots in the Settler lens | `GameplayMap.isFreshWater(x,y)` | same |
| Fresh-water bonus | Founding on fresh water gives **+5 Happiness**, permanent | `base-standard\text\en_us\Civilopedia_Concepts_Text.xml` |
| Unsettleable | Water (coast/ocean/lake), and Mountains / Volcano / Ice / most natural wonders (`Impassable="true"`). **INFERRED:** the impassable flag is the exact rule; the engine check above handles it. | `base-standard\data\terrain.xml` (Terrains/Features) |
| Independents (city-states-to-be) | Settling **≤3 tiles** from an Independent village makes it Hostile at once. **4–6 tiles** drops the relationship one step. `INDEPENDENT_SPACING=6` (Exploration). | Concepts text; `age-exploration\data\gameplay-systems.xml` |
| Land claim (diplomacy) | `LAND_CLAIM_RANGE_PER_STEP=2`, `LAND_CLAIM_STEPS=1` | `base-standard\data\diplomacy-actions.xml` |
| Other civs | No separate data parameter found. Borders can't overlap, and the min-range check applies to every settlement. | Concepts text |
| AI suggestions | `player.AI.getBestSettleLocationsForSettler(n, loc)` returns plots plus `factors` (positive/negative). This can be reused or compared against. | `ui\lenses\layer\settlement-recommendations-layer.js` |

**Settlement limit (soft cap).** Each settlement over the cap gives **−5 Happiness in every settlement**, per settlement over, with no cap on the penalty (`TRAIT_MOD_PENALTY_OVER_SETTLEMENT_CAP_SETTLEMENTS`, Amount=5, MaxReduction=1000, `base-standard\data\civilizations-gameeffects.xml`).
Initial cap (`TRAIT_INITIAL_SETTLEMENT_CAP`, `age-*\data\civilizations-common-gameeffects.xml`): Antiquity **3**, Exploration **8** (Minimum=true), Modern **16** (Minimum=true). Techs, civics and attributes add +1 to +3 each (`EFFECT_PLAYER_ADJUST_SETTLEMENT_CAP`).

## 2. Workable radius and tile acquisition
- Max border reach is **3 tiles from the centre** (rings 1–3, so 36 tiles plus the centre). This applies to towns and cities alike. Borders can't overlap. (Concepts text: "A border's maximum reach is three tiles from its City Center".) No data value changes the radius by age or by building. **INFERRED:** none found.
- There is no culture-based border growth. Tiles are gained when:
  - (a) a growth event places a pop on a tile next to the border, which also grabs all tiles adjacent to it, or
  - (b) a building is completed on the border.
- Improvements must be contiguous with the settlement's other rural or urban tiles.
- Each population point is either 1 rural tile (it auto-builds that terrain's improvement) or 1 specialist on an urban tile. So the number of rural tiles is at most the rural population, and at most 36.
- Pop cap: no hard cap was found. **INFERRED:** it's limited by the tiles available. When there's no room, extra food spawns Migrants.
- Specialists per urban tile: `CITY_WORKER_STARTING_CAP`. Exploration is **1**, Modern **3**. The Antiquity default isn't in the data (**INFERRED: 1**). Source: `age-*\data\gameplay-systems.xml`.

## 3. Town vs city
- The Founder founds the capital (a City). **Every later Settler founds a Town**, in all ages. A Settler needs a settlement with **pop ≥ 5**. (Concepts text)
- **Town:**
  - No production queue. **100% of Production is converted to Gold.**
  - Growth mode gives **+50% growth**.
  - Can buy buildings with gold. Urban tiles are possible, but towns get **no specialists**.
- **Town focus** (`base-standard\data\projects.xml` and age files; all `TownOnly`, `PrereqPopulation="7"`, `ExclusiveSpecialization`, permanent):
  - Most foci stop the town's growth and send its food to connected cities. Connected means a direct road, or both coastal on the same continent.
  - The focus list is in the table below.

| Project | Effect (pedia text) |
|---|---|
| PROJECT_TOWN_GRANARY / _FISHING (Farming/Fishing) | +1 Food on Farms, Pastures, Plantations and Fishing Boats |
| PROJECT_TOWN_PRODUCTION (Mining) | +2 Production on Camps, Woodcutters, Clay Pits, Mines and Quarries |
| PROJECT_TOWN_TRADE (Trade Outpost) | +1 Happiness per resource tile, +5 trade range (Distant Lands only) |
| PROJECT_TOWN_FORT | +5 healing, +25 fortification HP, +1 Gold on fortified districts |
| PROJECT_TOWN_TEMPLE (Religious Site, Exploration only) | +2 Happiness on buildings, +2 relic slots |
| PROJECT_TOWN_INN (Hub Town, 1 per continent, Exploration/Modern) | +1 Influence per connected settlement |
| PROJECT_TOWN_RESORT | +1 Happiness and Gold on appealing tiles, +50% natural-wonder yields |
| PROJECT_TOWN_URBAN_CENTER | +1 Science and Culture on Quarters |
| PROJECT_TOWN_FACTORY (Modern) | +100% gold toward buying a Factory, Port or Rail Station |

**Conversion cost** (GlobalParameters, `age-*\data\gameplay-systems.xml`):

| Age | TOWN_UPGRADE_BASE_COST | _PER_CITY_COST | _MAXIMUM_COST |
|---|---|---|---|
| Antiquity | not in data (engine default, **unknown**) | – | – |
| Exploration | 700 | 700 | 3000 |
| Modern | 800 | 1000 | 5000 |

Pedia: cost rises with each city you already have, has a cap, and **falls with the town's population**. Captured settlements cost ×2, up to the cap. Modifiers come from `EFFECT_CITY_ADJUST_TOWN_UPGRADE_DISCOUNT` (e.g. +50% gold toward conversion).
**INFERRED formula:** `min(MAX, BASE + PER_CITY × citiesBeyondCapital) − popDiscount`.
The AI weights conversion with `PSEUDOYIELD_TOWN_TO_CITY_UPGRADE_PER_POPULATION=150` (`base-standard\data\pseudoyields.xml`). The real number is shown in the in-game "Convert to City" UI.

**What changes on conversion** (`PROJECT_CONVERT_TOWN_TO_CITY`):
- You **gain** a production queue (production stops turning into gold), specialists, and the ability to train units and build wonders.
- You **lose** the town focus and the town growth bonus.
- **Every city beyond the capital makes non-Warehouse buildings 10% more expensive empire-wide.** Building cost also rises 5% per other non-Warehouse building in the same settlement.
- Pedia tip: keep roughly **a 1:1 town-to-city ratio**.

## 4. Yields

### Base tile yields, Antiquity
Source: `age-antiquity\data\terrain.xml` (`TerrainBiomeFeature_YieldChanges`). The Exploration and Modern files (`age-exploration|age-modern\data\terrain.xml`) are nearly the same. Differences:
- Oasis gets 2 Production.
- Marsh gets +1 Production.
- Watering hole gets 2 Production.
- Mangrove/tundra-bog get +1 Production.
- In Modern, mountains get +1 Happiness.
- The second block in those files is a commented-out old version.

| Terrain / biome | Base | With feature |
|---|---|---|
| Flat Grassland | 2F | Forest 2F1P · Floodplain 3F · Marsh 2F |
| Flat Plains | 1F1P | Savanna woodland 1F2P · Floodplain 2F1P · Watering hole 1F1P |
| Flat Desert | 1P1G | Oasis 1F1P · Sagebrush 1F1P1G · Floodplain 1F1P1G |
| Flat Tropical | 1F1Sci | Rainforest 1F1P1Sci · Mangrove 1F1Sci · Floodplain 2F1Sci |
| Flat Tundra | 1P1Cul | Taiga 1F1P1Cul · Bog 1F1Cul · Floodplain 1F1P1Cul |
| Hill Grassland / Tropical | 1F1P | Floodplain +1F (Tropical floodplain: 2F2P) |
| Hill Plains / Desert / Tundra | 2P | Floodplain +1F |
| Mountain | 1P (Grassland 1F, Desert 1G) | impassable, not workable (**INFERRED**) |
| Navigable river | 1F1G (Grassland 1F1P) | – |
| Coast (lake counts as coast) | 1F1G | Reef 1F1P1Sci · Lotus 2F1Cul |
| Ocean | 2F1G | Atoll 2F2P1Cul |

Natural wonders give +2 to +6 to various yields (`ScaleByGameAge=50`).

### Improvements
Basic improvements are Farm, Mine, Woodcutter, Clay pit, Fishing boat, Camp, Pasture, Plantation, Quarry and Oil rig (`base-standard\data\constructibles.xml`, Cost 25, Population=1).
- They have **no own `Constructible_YieldChanges`**. The tile keeps its natural yield, plus any resource.
- The improvement type is set by the resource if there is one. Otherwise:
  - flat → Farm
  - hill → Mine
  - vegetated → Woodcutter
  - wet → Clay pit
  - water → Fishing boat
- Extra yield comes from **Warehouse buildings** (Granary etc.), which give +1 per improvement of a type, and from town foci.
- Only civ-unique improvements carry flat yields (e.g. Terrace Farm 4F, Saqiya 4F).

### Resources
Source: `base-standard\data\resources.xml` and `resources-v2.xml`. Nearly every resource is **+1 of one yield** (Pitch is 1P1G).
- Food: Fish, Crabs, Rice, Wild Game, Salt, Dates, Sugar, Citrus, Quinine, Kaolin
- Production: Iron, Horses, Clay, Hides, Wool, Tin, Limestone, Niter, Coal, Oil, Rubber, Whales
- Gold: Gold, Silver, Pearls, Spices, Cotton, Furs, Camels, Cocoa, Tobacco, Rubies, Truffles
- Culture: Dyes, Silk, Marble, Jade, Ivory, Hardwood, Mangos, Turtles
- Science: Flax, Gypsum, Incense, Tea, Coffee
- Happiness: Wine, Llamas, Cowrie

Resources also take resource slots and give empire bonuses.

### Water, rivers and the city centre
- **Rivers:** minor rivers give no flat yield bonus (**INFERRED**: none found in data). They give fresh water, which means +5 Happiness when founding on it, and they enable Mills (e.g. Gristmill).
- **Navigable rivers:** count as water. They allow naval units, harbours and Fishing boats.
- **Coastal/lake sites:** naval units, Fishing Quay/Wharf water buildings, and connection to other coastal settlements on the same continent (for food sending).
- **Appeal:** +1 per adjacent forest, woodland, steppe, mangrove, taiga, mountain, coast, navigable river or natural wonder.
  - 3+ is Charming: improved rural tile gets +1 Happiness.
  - 5+ is Breathtaking.
- **City centre:** no minimum-yield rule was found in the data. **INFERRED:** the centre keeps its terrain yield plus Palace/City Hall yields. It counts as urban.

## 5. Growth
- `AgeGrowthBalances` (`age-*\data\constructibles.xml`). The data comment gives: **Threshold = Flat + Scalar·pop + Q·pop²**.

  | Age | Flat | Scalar | Q (stored as "Exponent") |
  |---|---|---|---|
  | Antiquity | 5 | 20 | 400 |
  | Exploration | 30 | 50 | 600 |
  | Modern | 60 | 100 | 850 |

  **INFERRED:** "Exponent" is stored ×100, so Q = 4 / 6 / 8.5. That gives an Antiquity threshold of 5+20p+4p², i.e. 29 food at pop 1 and 225 at pop 10. Check against `city.Growth.getNextGrowthFoodThreshold()` in game.
- Citizens don't eat food. Only **specialists cost −2 Food and −2 Happiness each (per age)**.
- Towns in growth mode get +50% growth.
- Rural pop gets a tile plus an improvement. Urban pop becomes a specialist (cities only).

## 6. Happiness and spacing
- Local unhappiness costs −5% of all non-food yields per point, down to a floor of −80%.
- What matters for spacing:
  - settlement cap: −5 Happiness in every settlement for each one over
  - fresh water: +5
  - mountains and natural wonders give Happiness and Appeal
  - Charming tiles: +1 Happiness when improved
- There is no housing in Civ VII.

## 7. Age transitions
- **All cities revert to towns except the capital(s)** (`base-standard\text\en_us\AgeTransitionText.xml`).
- Exceptions:
  - Silk Roads Golden Age keeps all cities as cities.
  - Treasure Fleet Golden Age keeps them too, and adds +2 pop to Distant Lands cities.
  - Coastal respawn: `MOD_PLAYER_RESPAWN_PROMOTE_TOWN_TO_CITY` (`age-exploration\data\age-transition*.xml`).
- Building adjacencies reset, and old-age buildings lose their tags.
- Warehouse buildings are ageless and keep working.
- Ages carry over `SettlementCountOnTransition` = 1 / 5 / 8 (`base-standard\data\ages.xml`).
- **Consequence:** gold spent converting a town in Antiquity or Exploration only buys city status until the age ends, unless you earn one of those golden ages. You do keep the buildings and population, though.

---

## Implications for our mod

### A. Valid-settle filter (hard)
1. Call `Diplomacy.isValidLandClaimLocation(plot, true)` and `!GameplayMap.isWater`. This covers min range, ownership and impassable terrain.
2. Use the radius from `CITY_MIN_RANGE`, read at runtime (fallback 3), to reject plots near our own or foreign settlements.
3. Apply soft penalties near Independents: −big at ≤3 tiles, −small at 4–6.

### B. Site score (town now, city later, 3-ring growth)
For each plot p in rings 1..3, take its natural yield Y(p):
- Use terrain + biome + feature from the age table above, read at runtime through `GameplayMap.getYield` (**INFERRED** API name) or the `TerrainBiomeFeature_YieldChanges` rows.
- Add the resource yield (+1) and a resource bonus weight.

Then:
```
score = Σ_rings w_r · Σ_p [ 1.0·F + 1.2·P + 0.5·(G+Sci+Cul) + 0.5·Hap ] · own(p)
w_1 = 1.0, w_2 = 0.8, w_3 = 0.5      (inner tiles get worked first; ring 3 only at higher pop)
own(p) = 0   if owned by another settlement
       = 0.5 if inside another of our sites' ring 1–3 (shared/overlap)
       = 1   otherwise
+5  fresh water at the centre (×Happiness weight)
+3  coastal / navigable river at the centre (naval, water buildings, coastal connection)
+1·(Appeal≥3 tile count)·0.5
−K  if the settlement count would go over the cap (−5 Hap × number of settlements)
```
Also apply these gates:
- **Food gate:** ring-1+2 food should be ≥ ~12, or growth stalls (Antiquity threshold ≈ 5+20p+4p²).
- **Production potential:** P_rings = Σ production on hills, woods and rainforest tiles plus Production resources. Report it separately because the convert heuristic needs it.
- **Overlap:** allow up to ~1/3 of ring-3 tiles to be shared. Penalise shared ring-1/2 tiles fully, since borders can't overlap and the first claimant wins.

### C. "Convert this town to a city?" heuristic
Inputs:
- `P_town`: current production, which is currently all going to gold
- `pop`
- `cost`: in-game upgrade cost, `GlobalParameters` Base/PerCity/Max with the pop discount
- `N_cities`
- turns left in the age, `T_age`
- whether an "all cities stay" golden age is likely

Rules:
1. **Payback.** A town already turns production 1:1 into gold, so converting costs `cost` gold **plus** the `P_town` gold per turn it would have kept making. The benefit is P_city of real production, plus specialists and possibly more food (+50% growth is lost).
   - Recommend converting only if `P_city ≥ 10` (Antiquity) / `≥ 20` (Exploration/Modern) **and** `cost / P_city ≤ ~0.4·T_age`. In other words, it must pay back well before the age ends, because it reverts to a town at the transition unless a "keep cities" golden age applies.
   - Thresholds are **INFERRED**, to be tuned.
2. **Empire tax.** Each extra city adds +10% to non-Warehouse building costs across the empire. Require `P_city ≥ 0.10 × (sum of production in existing non-capital cities)` as a sanity check.
3. **Ratio.** Prefer keeping towns ≥ cities (pedia tip of a 1:1 ratio). Towns with food surplus and low production should take a focus at pop 7 (Farming or Mining) and feed the cities instead.
4. **Timing.**
   - Convert at higher pop: it's cheaper per the pedia.
   - Convert early in an age, not in the last ~20% of it.
   - In Modern, conversion is permanent, so the threshold is lower.
5. **Strong yes** if the site scored high on production potential (hills, woods, P resources). **Strong no** if most of the town's output comes from gold or happiness tiles, or if it would make a good Fishing/Farming feeder.
