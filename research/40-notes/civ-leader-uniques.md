# Civilization and leader uniques: what the autopilot leaves on the table

Scope: every civilization (3 ages, base + 40 DLC folders) and every leader with a `LeaderItems` ability (38), from the game's
XML (`Base/modules/*/data`, `DLC/*/modules/data`; DLC text from `l10n/ru_RU_Text.xml` when no English is shipped).
Method: all XML parsed into tables; per civ `CivilizationItems` (traits, units, buildings, quarters, improvements) →
`TraitModifiers` → `GameEffects` modifiers (effect + requirements, attached modifiers followed); per civ civic tree
`TREE_CIVICS_<AGE>_<CIV>` and the Test of Time trees → `ProgressionTreeNodeUnlocks`; then our code grepped for each
mechanism. Read-only; no game run.

Trigger case (game 41): Rome (Time-Tested, Exploration) left **Roman Renaissance** («Возрождение Рима»,
`NODE_CIVIC_EX_ROMAN_RENAISSANCE`, 800 culture: `MOD_EX_SETTLEMENT_CAP_INCREASE` + `MOD_TOT_TRADITION_SLOT` +
`TRADITION_LATINITAS_II`; `age-antiquity/data/progression-trees-culture-unique-ex.xml:90-92`) for a whole age while the
advisor named Future Civic. The game-41 patch (`xpl-autopilot-steps.js:747-757`) only stops repeatable nodes going first;
nothing values a node by what it unlocks.

## Inventory in numbers

| Mechanism | Count in game data | Autopilot today |
|---|---|---|
| Civ-unique civic trees | 50 trees (17 AQ, 18 EX, 15 MO) + the EX Theology branch | advisor or victory path only |
| … nodes granting a **tradition slot** | 73 unlock rows | not valued |
| … nodes granting **+1 settlement cap** | 47 unlock rows | not valued |
| Test of Time trees (Origins / Renaissance / Modernization per civ) | ~110 nodes, almost all slot + cap | not valued |
| Trait-gated generic unlocks (`RequiredTraitType`, e.g. Foundation/Hierarchy/Administration cap or specialist +1 for Expansionist/Militaristic) | 12 rows | **dropped** by every unlock reader (`!r.RequiredTraitType`, steps.js:312, 336, 374, 466, 542, 587, 1668, 1754, 1824) |
| Unique improvements (`Improvements.TraitType`, all `CityBuildable`) | 24 (8 AQ, 11 EX, 5 MO) | never planned, never queued (advisor fallback only) |
| Unique buildings / quarters | 52 / 26 | planned (rule book `uniques`, `uniqueQuarters`) — OK |
| Great-person unique units (`GreatPersonClasses`) | 10 classes, 101 individuals | never trained, never activated (only Keynes) |
| Unique military units (replace a base unit) | ~110 rows | trained through the generic tests (`meleeStrength`, ranged/naval orders) — OK |
| Unique settlers / merchants / scouts / commanders | 6 / 9 / 3 / 9 | used as generic ones (FoundCity / MakeTradeRoute / AUTOEXPLORE / PromotionClass) — OK, their extra powers no |
| Unique missionaries (Kahuna, Pedanda, Hoceepkileni) | 3 | no religion spreading at all |
| Town-purchase abilities (`EFFECT_ADJUST_TOWN_CAN_PURCHASE_TAGGED_CONSTRUCTIBLES`) | Augustus, Carthage, England, Gaul, Joseon | town plans take `Buildings.Town` only |
| Leader-unique diplomatic actions (`EFFECT_DIPLOMACY_GRANT_DIPLOMATIC_ACTION`) | Lafayette, Himiko, Ibn Battuta, Gilgamesh, Napoleon | `ENDEAVORS` list is hard-coded |

## Ranked generic gaps

| # | Gap | Evidence (game) | Evidence (ours) | Impact | Fix rule | Effort |
|---|---|---|---|---|---|---|
| G1 | **Civic nodes are not valued by their unlocks** (civ trees, Test of Time trees, trait-gated rows) | 73 slot + 47 cap rows in civ trees; TOT: e.g. `progression-trees-culture-unique-ex.xml:90-92`; `MOD_TOT_TRADITION_SLOT` `base-standard/data/progression-trees-common-gameeffects.xml:551`; `MOD_EX_SETTLEMENT_CAP_INCREASE` `age-exploration/data/progression-trees-tech-gameeffects-shared.xml:4` | `chooseResearch` steps.js:645-764: focus path, else `getTreeRecommendations` (740-757); trait rows filtered out everywhere | **High**, every civ, every age: a slot is one more card (typ. +5…+30 yield/turn, Ming/Washington more); a cap is a settlement without −5 Happiness in every settlement. Civ nodes cost 150-400 (AQ), 800 (EX TOT) — usually 1-4 turns | `structuralNodes(available)`: an available culture node whose next depth unlocks `EFFECT_PLAYER_GRANT_TRADITION_SLOTS`, `EFFECT_PLAYER_ADJUST_SETTLEMENT_CAP`, `EFFECT_ADJUST_CITY_LIMIT`, `EFFECT_PLAYER_GRANT_SYNCRETIC_CHOICE`, a unique constructible/unit of ours, counting `RequiredTraitType` rows when `ownTrait` (steps.js:4067). Value: slot = best unslotted card's `cardValue` (choices.js); cap = worth while `settlementCount ≥ cap − 1` and a site is known (or settlers wait at the cap: `waitAtCap`), else small; unique building = its plan `net`. Take it before the advisor always, and before the victory path when value/turns ≥ the path pick's (or turns ≤ 3). UI.log `civic: X (slot, cap) chosen over Y`. Test: Rome TOT fixture where Future Civic and Roman Renaissance are both available | M |
| G2 | **Unique improvements never built** | 24 rows, e.g. Baray `age-antiquity/data/constructibles.xml:137`, Great Wall `:138`; Siam Bang, Inca Terrace Farm, Mughal Stepwell, Songhai Caravanserai (+5 gold), Mongolia Ortoo (+5 gold), Buganda Kabaka's Lake, Russia Obshchina, Heian Jinja ×2, Babylon Kirimahu, Potkop, Hawilt, Pairidaeza… Base cost 40 / 90 / 200, several Ageless | rule book keeps `ConstructibleClass === "BUILDING"` only (xpl-rule-book.js:206, 226); `cheapestBuilding`/fallbacks BUILDING only (steps.js:3637, 3654); only `advisorOrder` (steps.js:891-904) can queue one, after the plan, i.e. ~never. CityBuildQueue.csv of game 41: player 0 queued no unique improvement; AI Bulgaria built Pairidaeza/Hidden Fortress | **High** for 24 civs: cheap, +3…+5 of a yield per tile, food/happiness engines (Baray +3 food & +1 food per floodplain; Stepwell +2 food per adjacent farm; Bang +3 culture +3 happiness, ageless) | v1 (autopilot only): `queueUniqueImprovements(city)` after the plan step: for each owned `Improvements.TraitType` type, `canStart(BUILD)` → Plots; score each plot by the game's numbers (`calculateAllBuildingsPlacements` if it lists improvements — probe; else `GameplayMap.getYields` before/after from `Constructible_YieldChanges` + adjacency rows), never a tile the plan keeps (`planTiles().kept`), honour `OnePerSettlement`; queue when payback (cost ÷ weighted gain) ≤ 15 turns, cheapest first, at most one per city per pass. v2: rule-book `uniqueImprovements` placed by the solver as full-tile rural items (no slot, no urban connection; `SameAdjacentValid=false`, `BuildInLine`). | M (v1) / L (v2) |
| G3 | **Great-person uniques never trained nor activated** | `GreatPersonClasses` (Tjaty, Logios, Shi Dafu, Shijin, 'Alim, Conquistador, Jacobin, Revolucionario, Uparat, Saga Hero) `age-antiquity/data/greatpeople.xml:49`…; 101 `GreatPersonIndividuals` with `ActionRequiresCompletedConstructibleType/DistrictType/OwnedTile`; effects: free tech (`LOC_GREATPERSON_FREE_TECH`, greatpeople-gameeffects.xml:169), +200/250 production on a wonder under construction, +3 science/culture on the Palace, +10 Happiness, a free Hospital… Activation is `UNITCOMMAND_ACTIVATE_GREAT_PERSON` (unit-actions.js:1514), trained like units (production-chooser-helpers.js:451) | `unitWanted` returns false for them (steps.js:842-856); `UNITCOMMAND_ACTIVATE_GREAT_PERSON` only in `openWorldBanks` (units.js:4790) | **High** for 10 civs (Egypt, Greece, Han, Heian, Abbasid, Spain, French Empire, Mexico, Siam, Iceland): each is one-shot value of ~100-400 production-equivalent; Egypt/Greece/Abbasid quarters are built by our plan anyway, so the GP is free to take | Train: a `QUEUED_GREAT_PERSON` want (one at a time) in a city that `canStart(BUILD,{UnitType})`, when its cost ≤ ~8 turns of the city's production or buy from free gold. Use: read the unit's individual (`GreatPersonIndividuals.UnitType`), find valid tiles (its required constructible/district on our owned tile; Conquistador: Distant Lands), walk there (goal `{gp}`), send `UNITCOMMAND_ACTIVATE_GREAT_PERSON` NO_TARGET after `canStart` (as Keynes). Wonder-production ones: on our wonder in production. UI.log the individual and the answer (probe). | M-L |
| G4 | **Town purchase abilities ignored** | Augustus `base-standard/data/leaders-gameeffects.xml:152` (towns buy CULTURE buildings, +15% town purchase), Carthage (water buildings), England (gold buildings on islands), Gaul (fortifications), Joseon (tier-1 culture/science) | building-job.js:693 `townSelection = …filter(placementOf(t).town)` (Buildings.Town only) | **Medium-high** for Augustus/Carthage/Joseon (town-heavy by design): towns hold gold they could turn into +3 culture/science buildings | `townBuyableTags()` from `traitEffects()` (`EFFECT_ADJUST_TOWN_CAN_PURCHASE_TAGGED_CONSTRUCTIBLES` → `ConstructibleTag`, requirements CITY_IS_TOWN / CITY_IS_ISLAND) added to the town selection; better: per town, any building whose `CityCommands.canStart(PURCHASE)` answers Success/InsufficientFunds (the game's own rule; root CLAUDE.md "prefer the game's numbers"). Put it in `inputSignature`. | S-M |
| G5 | **Trade-route civs/leaders get merchants only under the economic focus** | Chola (+2 gold +1 influence per route), Aksum (+1 route cap, unlimited range), Xerxes alt (+50 culture +100 gold per age per route or road), Babylon Tamkaru (+10 culture per tile), Mississippian Watonathi (+25 gold per resource), Elizabeth (unlimited range), Ming/Qing/England/Silla/Songhai/Khmer unique merchants | `unitsWanted` merchants need `unitOptions.victory === "ECONOMIC"` (steps.js:2754) | Medium for ~12 civs/leaders | `tradePays()` = our traits have `EFFECT_PLAYER_ADJUST_YIELD_PER_NUM_TRADE_ROUTES`, `PLAYER_ADJUST_TRADE_CAPACITY`, a unique `MakeTradeRoute` unit, or a trade-route grant → merchants wanted with any focus (still `openTradeRoutes` and «Торговцы»). | S |
| G6 | **Leader-unique diplomatic actions never used** | Lafayette `DIPLOMACY_ACTION_GRANT_POLICY_SLOT` (leaders-gameeffects.xml:632: +1 tradition slot each, once per leader!), Himiko Friend of Wei (+25% science in alliance), Ibn Battuta Trade Maps, Gilgamesh/Franklin endeavor rules, Napoleon sanctions (+5 culture/gold per sanctioned leader) | `ENDEAVORS` hard-coded (choices.js:1522-1525); diplomacy option off by default | High for Lafayette (several free slots per age), medium others | Add the action types from our traits' `EFFECT_DIPLOMACY_GRANT_DIPLOMATIC_ACTION` to the list; Lafayette's first, with every met leader it allows, even with «Дипломатия» off (it costs only Influence). | S |
| G7 | **Site search ignores trait terrain rules** | Inca `TRAIT_MOD_APUS_IMPROVE_MOUNTAINS` (age-exploration/data/civilizations-shared-gameeffects.xml:125: mountains workable +1F +1P); Gaul +2 production with no own centre within 6, +2 gold near a foreign border (DLC/gaul/.../civilizations-shared-gameeffects.xml:14); Catherine tundra cities; Trung Trac tropical; Druid (breathtaking → free Nemeton); Colonist (+1 pop next to a resource); Isabella natural wonders | map-facts.js:124 `workable = !isMountain…`; rules-loader.js:93 spacing = `CITY_MIN_RANGE` only; natural wonders only while culture victory on (site-job.js:100) | Medium for Inca, Gaul; low others | `traitSiteRules()` adapter: mountain workable when a trait unlocks an improvement on TERRAIN_MOUNTAIN; Gaul: candidate penalty ≈ the +2 production lost when another own centre is within 6, bonus near foreign borders; Isabella/Iceland: natural wonders always valued. | S each |
| G8 | **Resource-improvement traits valued only under economy** | America +50 gold per improved resource, +1 production on resources; Amina resource cap; Hatshepsut culture per unique resource | growth-job.js:140 `RESOURCE_TILE_VALUE` only when `victory === "ECONOMIC"` | Low-medium | add the bonus when our traits have `ADJUST_PLAYER_YIELD_FOR_RESOURCE` / `PLAYER_ADJUST_YIELD_PER_UNIQUE_RESOURCE`. | S |
| G9 | **Special unit commands of uniques** | Rome Legatus founds a town per 3 levels (`UNIT_LEGATUS`, tag ALTERNATE_SETTLE, age-antiquity/data/units.xml:164); Genghis `UNITOPERATION_CONVERT_INDEPENDENTS`; Nepal Sherpa builds the Highland Power Station / `UNITCOMMAND_CLAIM_MOUNTAIN`; Maya `UNITCOMMAND_STONE_TRAP` | none of these strings in our code | Medium for Rome (free towns), Genghis (free units, once per age), Nepal; low Maya | per-unit handlers in `commandUnits`: Legatus with a charge and a known site within N turns founds there (as a settler); Genghis commander next to an independent unit at war → convert; Sherpa → claim/build on a featureless mountain the plan leaves. Probe each `canStart`. | M |
| G10 | **Religion uniques** | Hawaii Kahuna, Majapahit Pedanda, Shawnee Hoceepkileni (replace the Missionary); belief choices exist | no missionary handling (`MISSIONARY`/`RELIGIOUS` not in units code) | Low-medium (religion victory gone in 1.4; relics/beliefs) | defer to the religion audit | — |
| G11 | Behaviour-reward leaders the defensive design will not chase | Conquest: Assyria, Mongolia, Xerxes, Bolivar, Toyotomi, Friedrich alt, Maurya; kills: Gilgamesh, Lakshmibai, Napoleon alt, Yi Sun-sin; espionage: Tubman, Sayyida al-Hurra; pillage: Buganda, Bulgaria; war declared: Ashoka alt, Trung Trac | by design (user decision: defensive) | Their core ability is idle; Lakshmibai's incorporation and Tecumseh/Greece suzerainty are peaceful and worth a look | Peaceful ones only: incorporate city-states when Lakshmibai (or anyone with Influence to spare), suzerainty priority for Tecumseh/Greece/Siam. | M |

## Biggest specific misses (a civ or leader whose core ability we never use)

| Civ / leader | Core ability idle | Why | Gap |
|---|---|---|---|
| **Rome** (AQ civ; TOT in EX/MO) | Roman Renaissance / Modernization (slot + cap), Legion+Forum scale with traditions (slots!), Legatus founding towns | G1, G9 | G1 |
| **Lafayette** | Reform: a tradition slot per leader | G6 | G6 |
| **Egypt, Greece, Han, Abbasid** | Tjaty / Logios / Shi Dafu / 'Alim (quarters built, GP never trained) | G3 | G3 |
| **Heian, Spain, French Empire, Mexico, Siam, Iceland** | Shijin / Conquistador / Jacobin / Revolucionario / Uparat / Saga Hero | G3 | G3 |
| **Khmer, Babylon, Han, Heian, Mississippian, Aksum, Persia** (AQ) | Baray, Kirimahu, Great Wall, Jinja, Potkop, Hawilt, Pairidaeza | G2 | G2 |
| **Inca, Mughal, Songhai, Mongolia, Siam, Buganda, Ming, Goryeo, Hawaii, Shawnee, Iceland, Dai Viet, Bulgaria, Russia, Nepal, Sengoku** (EX/MO) | their unique improvement (Terrace Farm, Stepwell, Caravanserai, Ortoo, Bang, Kabaka's Lake…) | G2 (+G7 for Inca mountains, G9 Nepal) | G2 |
| **Augustus** | towns buy culture buildings; +2 capital production per town — while our science policy converts towns (`CITY_TARGETS`) | G4; conversions ignore the per-town bonus | G4 |
| **Carthage, Joseon** | towns buy water / tier-1 culture+science buildings (both capped at 1 city) | G4 | G4 |
| **Chola, Xerxes (alt), Aksum** | per-route yields | G5 | G5 |
| **Gaul** | +2 production per settlement 6+ tiles from our others | G7 | G7 |
| **Ming (EX)** | 50% capital science; Great Wall; Mandarin | G2, G5 (the per-policy loss is handled: gotcha 24) | G2 |

## What already works (no action)

- Unique buildings and quarters: rule book `uniques` / `uniqueQuarters`, syncretism included (gotcha 13).
- Favored wonders (+30%): wonder anchors (gotcha 52).
- Unique military units: chosen by strength through the generic tests (`meleeStrength`, `bestRangedOrder`, warships).
- Per-card traits (Ming, Washington, Lafayette's +1 combat per tradition is not valued but harmless): `perCardYields` (gotcha 24).
- Carthage/Joseon city limit (game hides Convert), Carthage double settlers (gotcha 56).
- Unique settlers/merchants/scouts/commanders: found by `FoundCity` / `MakeTradeRoute` / AUTOEXPLORE / PromotionClass.

## Suggested order

1. G1 (civic node value incl. TOT and trait-gated rows) — the reported bug class, cheap, all civs.
2. G6 Lafayette Reform and G5 merchants for trade civs — small, data-driven from `traitEffects()`.
3. G4 town purchases via the game's PURCHASE answer.
4. G2 v1 unique improvements in the autopilot (probe first whether `calculateAllBuildingsPlacements` lists improvements).
5. G3 great persons (train + activate), with a UI.log probe per individual.
6. G7/G8/G9 trait-specific site, growth and unit rules.

Probes needed before coding: P-UQI-1 does `calculateAllBuildingsPlacements` include unique improvements; P-GP-1 the
`canStart` answer of `UNITCOMMAND_ACTIVATE_GREAT_PERSON` off/on a valid tile; P-LEG-1 the Legatus town command name and
its charges; P-REF-1 Lafayette's action in `getProjectDataForUI`.
