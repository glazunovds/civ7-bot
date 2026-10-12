# 04 - Rules: buildings, adjacency, wonders, quarters (Civ VII game data)

Read-only scan of the installed game (Steam, `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII`).
`GAME` below = that folder. All values are from the base XML unless marked **INFERRED**.

Main sources:
- Schema: `GAME\Base\Assets\schema\gameplay\01_GameplaySchema.sql` (NOT under modules/core; core only has `config/config-schema.sql`).
- Districts: `GAME\Base\modules\base-standard\data\districts.xml`
- Palace / City Hall / global wildcard adjacencies: `GAME\Base\modules\base-standard\data\constructibles.xml`
- Per age: `GAME\Base\modules\age-{antiquity,exploration,modern}\data\constructibles.xml` (buildings, wonders, adjacencies, warehouse yields, unique quarters, all in one file per age). Effects (modifiers) in `constructibles-gameeffects.xml` next to it.
- DLC: `GAME\DLC\<pack>\modules\data\constructibles*.xml`

The extractor script used (Python, ElementTree, reads every `<Row>`) is in the session scratchpad; it is easy to re-create: load all `data\*.xml` of base-standard + one age, join `Constructible_Adjacencies.YieldChangeId -> Adjacency_YieldChanges.ID` and `Constructible_WarehouseYields.YieldChangeId -> Warehouse_YieldChanges.ID`.

---

## 1. Schema (columns, abbreviated)

| Table | Columns |
|---|---|
| Constructibles | ConstructibleType, ConstructibleClass (BUILDING/WONDER/IMPROVEMENT), Age, Cost, CostProgressionModel, CostProgressionParam1, Population, **AdjacentDistrict, AdjacentLake, AdjacentRiver, AdjacentTerrain, RiverPlacement** (RIVER / ANCHORED / OFF_COAST), NoFeature, NoRiver, ExistingDistrictOnly, RequiresAppealPlacement, RequiresDistantLands, RequiresHomeland, RequiresUnlock, Defense, DistrictDefense, Repairable, ImmuneDamage, InRailNetwork, IslandSettlement, MilitaryDomain, Discovery, Archaeology, CanBeHidden, ProductionBoostOverRoute, VictoryItem, Name, Description, Tooltip |
| Buildings | ConstructibleType, TraitType (civ-unique if set), Movable, MultiplePerCity, MaxPlayerInstances, Town, Capital, CapitalForbidden, CityCenterPriority, Purchasable, MustPurchase, PurchaseYield, BuildQueue, CitizenSlots, Workable, Housing, AllowsHolyCity, ArchaeologyResearch, DefenseModifier, GrantFortification, OuterDefenseHitPoints, OuterDefenseStrength |
| Wonders | ConstructibleType, AdjacentCapital, AdjacentConstructible, AdjacentResource, AdjacentToLand, AdjacentToMountain, BuildOnFrontier, MaxPerPlayer, MaxWorldInstances, MustBeLake, MustNotBeLake, RequiredConstructibleInSettlement, RequiredConstructibleInSettlementCount |
| Constructible_Adjacencies | ConstructibleType, YieldChangeId, Name, RequiresActivation (true = only active when a modifier/trait/tech/civic unlocks it) |
| Adjacency_YieldChanges | ID, YieldType, YieldChange, TilesRequired, ProjectMaxYield, Self, Age, PersistOnTransfer, and the "adjacent to" selectors: AdjacentBiome, AdjacentBreathtakingAppeal, AdjacentCharmingAppeal, AdjacentConstructible, AdjacentConstructibleClass, AdjacentConstructibleTag, AdjacentDistrict, AdjacentFeature, AdjacentFeatureClass, AdjacentLake, AdjacentNaturalWonder, AdjacentNavigableRiver, AdjacentOtherOwner, AdjacentQuarter, AdjacentResource, AdjacentResourceClass, AdjacentRiver, AdjacentSeaResource, AdjacentSpecificResource, AdjacentTerrain, AdjacentUniqueQuarter, AdjacentUniqueQuarterType |
| Constructible_WildcardAdjacencies | YieldChangeId, ConstructibleClass, ConstructibleTag, CurrentAgeConstructiblesOnly, HasBiome, HasNavigableRiver, HasTerrain, HasYield, RequiresActivation (grants an adjacency to every building matching class/tag) |
| Constructible_YieldChanges | ConstructibleType, YieldType, YieldChange (base yield) |
| Constructible_Maintenances | ConstructibleType, YieldType, Amount |
| Constructible_ValidTerrains / ValidBiomes / ValidFeatures / ValidDistricts | ConstructibleType + TerrainType / BiomeType / FeatureType / DistrictType |
| Constructible_ValidResources | ConstructibleType, ResourceType, Rate |
| Constructible_RequiredFeatures / RequiredFeatureClasses / InvalidFeatures / InvalidAdjacentBiomes | ConstructibleType + Feature/FeatureClass/Biome |
| Constructible_RequiredConstructibles | **Does not exist** in this schema. Prerequisites go through Wonders.RequiredConstructibleInSettlement / AdjacentConstructible and progression-tree unlocks. |
| Constructible_WarehouseYields | ConstructibleType, YieldChangeId, RequiresActivation |
| Warehouse_YieldChanges | ID, YieldType, YieldChange, Age, Overbuilt, and "per X in city": BiomeInCity, ConstructibleInCity, DistrictInCity, FeatureClassInCity, FeatureInCity, LakeInCity, MinorRiverInCity, NaturalWonderInCity, NavigableRiverInCity, ResourceInCity, RouteInCity, TerrainInCity, TerrainTagInCity |
| Constructible_WildcardWarehouseYields | YieldChangeId, ConstructibleTag, RequiresActivation |
| UniqueQuarters | UniqueQuarterType, BuildingType1, BuildingType2, TraitType, Name, Description, Tooltip |
| UniqueQuarterModifiers | ModifierID, UniqueQuarterType |
| Districts | DistrictType, DistrictClass, **MaxConstructibles**, **OverwritePreviousAge**, UrbanCoreType, AutoPlace, AutoRemove, OnePerCity, Water, Workable, NatureYields, ResourceBlocks, CitizenSlots, HitPoints, ... |
| District_FreeConstructibles | DistrictType, ConstructibleType, Biome/Feature/Resource/River/TerrainType, Priority, Tier (picks the rural improvement automatically) |
| ExcludedAdjacencies | TraitType, YieldChangeId |
| TypeTags (generic) | Type, Tag - tags such as AGELESS, PERSISTENT, WAREHOUSE, FULL_TILE, UNIQUE, SCIENCE, CULTURE, GOLD, HAPPINESS, FOOD, PRODUCTION, WATER, BRIDGE, FORTIFICATION, IGNORE_DISTRICT_PLACEMENT_CAP |

---

## 2. Standard buildings per age

Common pattern: every yield building has `TilesRequired=1, YieldChange=+1` per adjacent qualifying tile, and **all** of them include "+1 per adjacent Wonder (AdjacentDistrict=DISTRICT_WONDER)". The adjacency set is determined by the building's yield:

| Yield family | Adjacency rule set (each +1 of the building's yield per adjacent tile) |
|---|---|
| Science | Resource (`AdjacentResource`), Wonder |
| Production | Resource, Wonder |
| Gold | Coast (`TERRAIN_COAST`), Navigable river (`TERRAIN_NAVIGABLE_RIVER`), Wonder |
| Food | Coast, Navigable river, Wonder |
| Culture | Mountain (`TERRAIN_MOUNTAIN`), Natural wonder, Wonder |
| Happiness | Mountain, Natural wonder, Wonder |

Valid districts for normal buildings: DISTRICT_CITY_CENTER + DISTRICT_URBAN. Every yield building has Population=1. Maintenance (gold and/or happiness) applies.

### Antiquity (`age-antiquity\data\constructibles.xml`) - all have Age=AGE_ANTIQUITY (become obsolete at Exploration) unless noted

| Building | Base yield | Cost | Placement | Adjacencies |
|---|---|---|---|---|
| Library | Science 3 | 90 | - | Resource, Wonder (+activatable Quarter, Han) |
| Academy | Science 4 | 180 | - | Resource, Wonder (+activatable Quarter) |
| Monument | Culture 3, Influence 2 | 90 | - | Mountain, Natural wonder, Wonder |
| Amphitheater | Culture 4 | 180 | - | Mountain, Natural wonder, Wonder |
| Market | Gold 3 | 90 | - | Coast, Nav. river, Wonder |
| Lighthouse | Gold 4 | 180 | RiverPlacement=OFF_COAST, ValidTerrain=COAST (built on a coast water tile) | Coast, Nav. river, Wonder |
| Garden | Food 3, Happiness 2 | 90 | - | Coast, Nav. river, Wonder |
| Bath | Food 4 | 180 | RiverPlacement=RIVER (adjacent to river - INFERRED meaning) | Coast, Nav. river, Wonder |
| Barracks | Production 3 | 90 | - | Resource, Wonder |
| Blacksmith | Production 4 | 180 | - | Resource, Wonder |
| Altar | Happiness 3 | 90 | Town OK | Wonder; plus 10 activatable rules (+1 Happiness per Quarter, UQ, Mountain, NW, vegetated, coast, lake, resource, river) - activated by a civic/tradition (INFERRED) |
| Arena | Happiness 4 | 180 | - | Mountain, Natural wonder, Wonder |
| Villa | Happiness 3, Influence 3 | 180 | - | Mountain, Natural wonder, Wonder |
| Ancient Bridge | Gold 4 | 100 | Urban only, ON navigable river, MultiplePerCity | none |
| Ancient Walls | - | 60 | ExistingDistrictOnly, tag IGNORE_DISTRICT_PLACEMENT_CAP (does not use a slot) | none |

### Exploration (`age-exploration\data\constructibles.xml`) - Age=AGE_EXPLORATION

| Building | Base yield | Cost | Placement | Adjacencies |
|---|---|---|---|---|
| Observatory | Science 6 | 200 | - | Resource, Wonder, **Mountain** |
| University | Science 8 | 380 | - | Resource, Wonder |
| Kiln | Culture 6 | 200 | - | Mountain, NW, Wonder |
| Pavilion | Culture 8 | 380 | - | Mountain, NW, Wonder |
| Bazaar | Gold 6 | 200 | - | Nav. river, Coast, Wonder |
| Bank | Gold 8 | 380 | - | Nav. river, Coast, Wonder |
| Guildhall | Influence 6, Gold 6 | 380 | - | Nav. river, Coast, Wonder |
| Tavern | Food 6, Happiness 4 | 200 | - | Coast, Nav. river, Wonder |
| Wharf | Food 6 | 200 | ANCHORED, terrain COAST or NAV_RIVER | Coast, Nav. river, Wonder |
| Hospital | Food 8 | 380 | - | Coast, Nav. river, Wonder |
| Dungeon | Influence 4, Production 6 | 200 | - | Resource, Wonder |
| Armorer | Production 8 | 380 | - | Resource, Wonder, **+1 Horses, +1 Iron** (AdjacentSpecificResource; stacks with Resource) |
| Shipyard | Production 8 | 380 | ANCHORED, COAST/NAV_RIVER | Resource, Wonder, **+1 Hardwood, +1 Niter** |
| Temple | Happiness 6 | 200 | AllowsHolyCity | Mountain, NW, Wonder |
| Menagerie | Happiness 8 | 380 | - | Mountain, NW, Wonder |
| Medieval Bridge | Gold 4 | 200 | Urban, ON nav. river | none |
| Medieval Walls | - | 150 | no slot | none |

### Modern (`age-modern\data\constructibles.xml`) - Age=AGE_MODERN

| Building | Base yield | Cost | Placement | Adjacencies |
|---|---|---|---|---|
| Schoolhouse | Science 9 | 420 | - | Resource, Wonder |
| Laboratory | Science 12 | 780 | - | Resource, Wonder, +1 **Happiness** per adj. Quinine |
| Museum | Culture 9 | 420 | - | Mountain, NW, Wonder |
| Opera House | Culture 12, Influence 6 | 780 | - | Mountain, NW, Wonder |
| Port | Gold 9 | 420 | ANCHORED, COAST/NAV_RIVER | Coast, Nav. river, Wonder |
| Stock Exchange | Gold 12 | 780 | - | Coast, Nav. river, Wonder |
| Cannery | Food 9 | 420 | - | Coast, Nav. river, Wonder, +1 per adj. Fish |
| Tenement | Food 12 | 780 | - | Coast, Nav. river, Wonder |
| Military Academy | Production 9 | 420 | - | Resource, Wonder |
| Factory | Production 12 | 780 | Town OK | Resource, Wonder |
| City Park | Happiness 9 | 420 | - | Mountain, NW, Wonder |
| Department Store | Happiness 12 | 780 | - | Mountain, NW, Wonder |
| Radio Station | Influence 9, Happiness 9 | 780 | - | Mountain, NW, Wonder |
| Rail Station | Gold 9, Production 9 | 840 | **FULL_TILE** | +1 Gold per adj. Quarter, Wonder |
| Airfield | Production 9 | 840 | FULL_TILE, FLAT | none |
| Launch Pad | Science 18 | 840 | FULL_TILE, FLAT | none |
| Modern Bridge | Gold 6 | 535 | Urban, ON nav. river | none |
| Defensive Fortifications | - | 535 | no slot | none |

### Ageless (base-standard)
- **Palace** (500, Food/Prod/Happiness 5, tags AGELESS, PERSISTENT): +1 Culture and +1 Science per adjacent Quarter.
- **City Hall** (150, Food 3 Happiness 3, AGELESS): no adjacency.

### Warehouse buildings (AGELESS; no adjacency; yield per matching tile in the *settlement*)

| Building | Age unlocked | Cost | Base | Warehouse yield (+1 each) | Placement |
|---|---|---|---|---|---|
| Granary | Antiquity | 55 | Food 1 | Food per Pasture, Plantation, minor floodplain features, FLAT terrain tiles (improved) | - |
| Fishing Quay | Antiquity | 55 | Food 1 | Food per Fishing boat, Atoll, Lotus, Reef, Cold reef, Coast, Ocean, Nav. river | ANCHORED, COAST/NAV_RIVER |
| Saw Pit | Antiquity | 55 | Prod 1 | Prod per Woodcutter, Camp, vegetated features | - |
| Brickyard | Antiquity | 55 | Prod 1 | Prod per Mine, Clay pit, Quarry, Hill, wet features | - |
| Harbor (also PERSISTENT) | Antiquity | 55 | Prod 1 | Prod per Fishing boat, Atoll, Lotus, Reef, Coast, Ocean, Nav. river | ANCHORED, COAST/NAV_RIVER |
| Gristmill | Exploration | 175 | Food 4 | same as Granary | RiverPlacement=RIVER |
| Sawmill | Exploration | 175 | Prod 3 | same as Saw Pit | - |
| Stonecutter | Exploration | 175 | Prod 3 | same as Brickyard | - |
| Grocer | Modern | 535 | Food 4 | union of Granary + Fishing Quay + Camp | - |
| Ironworks | Modern | 535 | Prod 4 | Mine, Hill, Quarry, Woodcutter, vegetated, wet, Oil rig, Mountain | - |

Note: the "per X in city" conditions count tiles/improvements across the settlement. INFERRED: they count only worked rural tiles with that improvement/terrain (the classic CIV7 warehouse behaviour). For our mod: warehouses do not care which urban tile they sit on (apart from water/river placement), so they are good "filler" for tiles with poor adjacency.

### Obsolescence / ageless
- Ages are set by `Constructibles.Age`. Anything tagged `AGELESS` (TypeTags) keeps its value across ages: warehouses, Palace, City Hall, all wonders, and all civ-unique buildings.
- Non-ageless buildings from an earlier age remain on the map. INFERRED (from standard game behaviour, not one specific row): after the transition they keep their base yield but lose adjacency bonuses, and they no longer count toward a "quarter". They can be overbuilt because `Districts.OverwritePreviousAge=true` on CITY_CENTER and URBAN. `Constructible_WildcardAdjacencies.CurrentAgeConstructiblesOnly` and `Warehouse_YieldChanges.Overbuilt` show the engine tracks "current-age" and "overbuilt" state.
- The `Adjacency_YieldChanges.Age` column exists, but none of the standard rules use it.

---

## 3. Global adjacency sources (standard rules)

| Source | Selector | Gives | To |
|---|---|---|---|
| Wonder (any built wonder tile) | AdjacentDistrict=DISTRICT_WONDER | +1 | every yield building, all yields |
| Resource (any) | AdjacentResource=true | +1 | Science, Production |
| Specific resource | AdjacentSpecificResource | +1 extra | Armorer (Horses, Iron), Shipyard (Hardwood, Niter), Cannery (Fish), Laboratory (Quinine, Happiness) |
| Coast | AdjacentTerrain=TERRAIN_COAST | +1 | Gold, Food |
| Navigable river | AdjacentTerrain=TERRAIN_NAVIGABLE_RIVER (some uniques use AdjacentNavigableRiver=true) | +1 | Gold, Food |
| Mountain | AdjacentTerrain=TERRAIN_MOUNTAIN | +1 | Culture, Happiness (+Observatory science) |
| Natural wonder | AdjacentNaturalWonder=true | +1 | Culture, Happiness |
| Quarter | AdjacentQuarter=true | +1 | Palace (Culture+Science), Rail Station (Gold), many uniques, and activatable rules |
| Unique quarter | AdjacentUniqueQuarter | +1 | activatable (Altar etc.) |
| Building tag | AdjacentConstructibleTag (e.g. CULTURE, HAPPINESS, GOLD, SCIENCE, FORTIFICATION) | +1 | civ-unique buildings mostly |

All standard values are +1 per adjacent tile (TilesRequired=1). Up to 6 neighbours, so the maximum is 6 per adjacency set. INFERRED: a neighbour that matches two rules (e.g. a coastal tile on a river, or a wonder) counts once per rule, so it can give +2.

Wildcard adjacencies (`Constructible_WildcardAdjacencies`, all RequiresActivation=true, leader/civ/tradition gated): e.g. Pachacuti `+1 Food per adj. Mountain to all BUILDINGs`, Ashoka `+1 Happiness per adj. improvement for FOOD/HAPPINESS/UNIQUE buildings`, Charlemagne `+1 Happiness to MILITARY/SCIENCE buildings per adj. FORTIFICATION`, Han `+1 Science per adj. Quarter for SCIENCE buildings`, Khmer `+1 Science per adj. Floodplain`, Goose Societies / Shell-Tempered Pottery `+1 Food/Gold per adj. Resource`. Sources: base-standard and age-antiquity constructibles.xml.

---

## 4. Wonders (all AGELESS, DISTRICT_WONDER, MaxConstructibles=1, MaxWorldInstances=1 unless noted)

Wonders **receive no adjacency** (no Constructible_Adjacencies rows). They **give** +1 to every adjacent yield building (see section 3). Their effects are in `constructibles-gameeffects.xml`.

### Antiquity (base)
| Wonder | Cost | Base yield | Placement |
|---|---|---|---|
| Angkor Wat | 450 | Happ 3 | adjacent to river |
| Colosseum | 450 | Cult 3 | adjacent to Urban district |
| Colossus | 375 | Gold 3 | on COAST, AdjacentToLand |
| Dur-Sharrukin | 275 | - | adj. Urban |
| Emile Bell | 375 | Infl 2 | on HILL |
| Gate of All Nations | 275 | Happ 2 | adj. Urban |
| Great Stele | 275 | Prod 2 | on FLAT |
| Ha'amonga 'a Maui | 375 | Cult 2 | adj. Coast (+ warehouse Culture/Food per water tile) |
| Hanging Gardens | 275 | - | adj. river (+Food warehouse like Granary) |
| Mausoleum of Theodoric | 450 | Prod 3 | adj. Coast |
| Monks Mound | 450 | Food 3 | adj. river |
| Mundo Perdido | 375 | - | Tropical (+1 Science per tropical tile) |
| Nalanda | 450 | Sci 3 | Plains |
| Oracle | 375 | Cult 2 | HILL |
| Petra | 375 | - | Desert |
| Pyramid of the Sun | 450 | Cult 3 | FLAT, adj. Urban |
| Pyramids | 275 | - | adj. Nav. river; Desert/Grassland/Plains/Tropical (+Gold/Prod per river tile) |
| Sanchi Stupa | 450 | Happ 3 | Plains |
| Terracotta Army | 375 | Prod 2 | Grassland |
| Weiyang Palace | 375 | Infl 3 | Grassland |
| Great Library | 375 | Sci 4 | adj. Urban |

### Exploration (base)
| Wonder | Cost | Yield | Placement |
|---|---|---|---|
| Borobudur | 600 | Happ 3 | adj. Coast |
| Brihadeeswarar | 600 | Infl 3 | adj. river |
| El Escorial | 600 | Happ 3 | HILL |
| Erdene Zuu | 525 | Cult 2 | FLAT |
| Forbidden City | 750 | Cult 4 | adj. Urban |
| Hale o Keawe | 525 | Cult 2 | on COAST, AdjacentToLand |
| House of Wisdom | 600 | Sci 3 | adj. Urban |
| Machu Pikchu | 750 | Gold 4 | on MOUNTAIN, Grassland/Tropical |
| Notre Dame | 750 | Happ 4 | adj. river AND adj. Urban |
| Shwedagon Zedi Daw | 750 | Sci 4 | adj. Lake |
| Tomb of Askia | 525 | Gold 2 | Desert |
| White Tower | 750 | Happ 4 | Wonders.AdjacentConstructible=BUILDING_CITY_HALL |

### Modern (base)
| Wonder | Cost | Yield | Placement |
|---|---|---|---|
| Brandenburg Gate | 2100 | Prod 6 | adj. Urban |
| Chengde Mountain Resort | 2100 | Gold 6 | adj. Mountain |
| Dogo Onsen | 1500 | Happ 4 | adj. Coast |
| Doi Suthep | 1500 | Infl 4 | HILL |
| Eiffel Tower | 1800 | Cult 5 | adj. Urban |
| Hermitage | 1500 | Cult 4 | Tundra |
| Manhattan Project | 1800 | Sci 5 | MaxWorldInstances=-1 |
| Muzibu Azaala Mpanga | 1500 | Food 4 | adj. Lake |
| Oxford University | 1500 | Sci 4 | adj. Urban |
| Palacio de Bellas Artes | 1800 | Cult 5 | adj. Urban |
| Red Fort | 1500 | Gold 4 Prod 4 | adj. Urban |
| Statue of Liberty | 2100 | Happ 6 | on COAST, ANCHORED |
| Taj Mahal | 1800 | Gold 5 | Plains |
| World's Fair | 2100 | Cult/Infl/Happ/Sci 6 | - |

### DLC wonders (file: `GAME\DLC\<pack>\modules\data\constructibles*.xml`)
| Wonder | Age | Cost | Placement | Pack |
|---|---|---|---|---|
| Mausoleum at Halicarnassus | Ant | 450 | adj. Coast, FLAT | asia-wonders |
| Great Lighthouse | Ant | 275 | on COAST | water-wonders |
| Mireuksa | Ant | 375 | adj. Mountain | japan-korea-wonders |
| Byrsa | Ant | 375 | adj. Coast | carthage |
| Vix | Ant | 375 | BuildOnFrontier | gaul |
| Hoo-do Hall | Ant | 375 | adj. river, FLAT | heian |
| Grand Bazaar | Exp | 525 | adj. Urban, homeland | asia-wonders |
| Wat Xieng Thong | Exp | 525 | adj. river | asia-wonders |
| Nan Madol | Exp | 525 | on COAST | water-wonders |
| Rila Monastery | Exp | 750 | BuildOnFrontier | bulgaria |
| Thanh Hue | Exp | 750 | adj. Medieval Walls + 7 walls in the settlement | dai-viet |
| Globe Theatre | Exp | 525 | adj. river | england |
| Buseoksa | Exp | 600 | adj. Mountain, Grassland/Tropical | goryeo |
| Reykholt | Exp | 750 | Tundra | iceland |
| Havana Harbor | Exp | 525 | COAST, distant lands, not a lake | pirate-republic |
| Himeji Castle | Exp | 750 | HILL | sengoku |
| Serpent Mound | Exp | 750 | FLAT | shawnee-tecumseh |
| Ubudiah Mosque | Mod | 1500 | - | asia-wonders |
| Nirayama Reverberatory Furnace | Mod | 1500 | adj. Mine improvement | japan-korea-wonders |
| Battersea Power Station | Mod | 1500 | adj. Coast, AdjacentToLand | great-britain |
| Hwaseong | Mod | 1000 | adj. Hill, FLAT | joseon |
| Boudhanath | Mod | 1500 | adj. Mountain, Grassland/Tropical | nepal |
| Sultanahmet Camii | Mod | 1000 | adj. another Wonder | ottomans |
| Eram Garden | Mod | 1500 | Desert | qajar |

---

## 5. Unique quarters and civ-unique buildings

Mechanism: `UniqueQuarters(UniqueQuarterType, BuildingType1, BuildingType2, TraitType)`. When both civ-unique buildings stand on the same urban tile, that tile becomes the Unique Quarter, and `UniqueQuarterModifiers` add a bonus effect. Unique buildings have `Buildings.TraitType` set, are tagged `UNIQUE` + `AGELESS`, cost 135 / 290 / 600 (Ant / Exp / Mod), and have their own adjacency rules plus "+1 per Wonder".

There are 26 UQs in total (15 base, 11 DLC). Examples:

| Quarter | Civ | Building 1 (adjacency) | Building 2 (adjacency) | Notes |
|---|---|---|---|---|
| Acropolis | Greece | Odeon: +1 Cult per adj. Quarter | Parthenon: Wonder only | |
| Forum | Rome | Basilica: +1 Gold per adj. CULTURE building | Temple of Jupiter: +1 Cult per adj. HAPPINESS building | |
| Necropolis | Egypt | Mastaba: +1 Gold per adj. Desert, Nav. river | Mortuary Temple: +1 Happ per adj. Nav. river | |
| Matha | Maurya | Dharamshala: +1 Sci per Quarter | Vihara: +1 Cult per Mountain | |
| Uwaybil Kuh | Maya | Jalaw: +1 Cult per Quarter | Kuh Nah: Wonder | |
| Plaza | Spain | Casa Consistorial | Casa de Contratacion | both require RequiresHomeland + AdjacentTerrain COAST |
| Five Hundred Lords | Chola | Manigramam / Anjuvannam | | both coastal |
| Ulema, Donjon, Pura | Abbasid, Norman, Majapahit | | | Exploration |
| Industrial Park, Avenue, Zaibatsu, Zocalo, Huiguan | America, French Empire, Meiji, Mexico, Qing | | | Modern |
| DLC: Punic Port (Carthage), Dunon (Gaul), Ekallu (Assyria), Abbey (England), Haven (Pirates), Kulliye (Ottomans), Seowon (Joseon), Tofi'a (Tonga), Dragon Temple, Financial Centre (GB), Baq (Qajar) | | | | |

---

## 6. Quarter and slot rules

- `Districts.MaxConstructibles`: CITY_CENTER = 2, URBAN = 2, WONDER = 1, RURAL = 1, WILDERNESS = 1 (`base-standard\data\districts.xml`). So an urban tile holds 2 buildings; a wonder uses the whole tile.
- `FULL_TILE` tag (Rail Station, Airfield, Launch Pad) - INFERRED: uses both slots.
- `IGNORE_DISTRICT_PLACEMENT_CAP` (walls) does not use a slot.
- `OverwritePreviousAge=true` on CITY_CENTER and URBAN: buildings from a previous age can be overbuilt (replaced) by current-age buildings. AGELESS buildings (warehouses, uniques) are not obsolete. INFERRED: they cannot be overbuilt/are never replaced automatically.
- "Quarter" (AdjacentQuarter): INFERRED from game rules, as no table defines it: an urban tile with 2 buildings that are both current-age or ageless. An ageless building plus a current-age building counts. A Unique Quarter is the specific UQ pair.
- Buildings with `MultiplePerCity` (bridges, walls) can repeat; all others are one per settlement.
- Town=true means it can be built in a Town as well as a City.

---

## 7. DLC changes to standard adjacency

- A grep of all `GAME\DLC\*\modules\data\*.xml` found **no `<Update>`/`<Delete>` against Adjacency_YieldChanges, Constructible_Adjacencies or Constructible_YieldChanges**, and no new adjacency rows for standard buildings (Library, Market, etc.).
- DLC only adds new rows: civ-unique buildings, UQs, wonders, and trait/tradition-activated rules (e.g. `babylon\...\traditions.xml`, `heian\...\traditions.xml`, `sengoku\...\civilizations-shared.xml`) with RequiresActivation=true.
- The `mountain-natural-wonders` pack adds natural wonders (terrain.xml). These automatically feed the "+1 per adj. Natural Wonder" rules.

---

## Implications for our mod

1. **Load everything at runtime from GameInfo; do not hardcode.** Use `GameInfo.Constructibles`, `Buildings`, `Constructible_Adjacencies` + `Adjacency_YieldChanges`, `Constructible_WildcardAdjacencies`, `Constructible_YieldChanges`, `Constructible_ValidDistricts/Terrains/Biomes/Features`, `Wonders`, `UniqueQuarters`, `Districts.MaxConstructibles`, `TypeTags` (AGELESS, FULL_TILE, UNIQUE, WAREHOUSE). This covers DLC and mods automatically.
2. **Adjacency evaluator**: implement the selector columns used in practice: AdjacentTerrain, AdjacentDistrict, AdjacentResource, AdjacentSpecificResource, AdjacentNaturalWonder, AdjacentQuarter, AdjacentUniqueQuarter, AdjacentConstructibleTag, AdjacentBiome, AdjacentFeatureClass, AdjacentLake, AdjacentNavigableRiver, AdjacentConstructibleClass. Use TilesRequired and YieldChange. For RequiresActivation=true rules, check whether the player actually has them. The game UI probably exposes a preview of adjacency (to verify in the UI scripts/research doc) - prefer the engine value when available.
3. **First to support**: the standard current-age yield buildings (6 adjacency families, very regular). Next: placement constraints (coast/river/ANCHORED/OFF_COAST, FULL_TILE). Then civ-unique buildings + UQ pairing (place both on the best shared tile). Wonders last: placement validity is complex, and many depend on gameeffects. Treat a wonder mainly as "+1 to all neighbouring buildings" when ranking tiles.
4. **Planning heuristics**: put wonders next to dense urban clusters; Gold/Food buildings on coast + river; Culture/Happiness next to mountains/natural wonders; Science/Production next to resources. Warehouses and walls have no adjacency, so use them as filler for poor tiles. Quarters are needed for Palace / Rail Station / unique adjacency.
5. **Age awareness**: weight obsolete (previous-age, non-ageless) buildings as overbuild targets. Never plan to overbuild AGELESS buildings. The INFERRED rules (obsolete buildings lose adjacency and do not form quarters) should be verified in-game before we rely on them.
6. Map priorities: Science, Gold, Production, Culture, Food and Happiness map to YieldType; Balance = weighted sum. Influence (YIELD_DIPLOMACY) also appears in base yields but never in standard adjacency.
