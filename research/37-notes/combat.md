> Notes of a research agent for research/37 (18 October 2026), kept as evidence. Game paths are relative to the game's `Base/modules/`. Mentions of the session scratchpad: the scripts are now in `research/37-notes/scripts/` (`python -I r37_pred.py <csv dir> <Base\modules dir>`, Windows paths; it prints matches per segment: 262 of 309 rows match, reproduced 18 October), and the CSVs come from `research/game29/evidence.zip`.

# r37 agent: centre defence, naval attacks, Bombard, rivers (18 Oct 2026)

Read only. Game paths below are relative to `Base/modules/`. The game 29 CSVs were extracted to `scratchpad/ev29/`. The helper scripts are `scratchpad/r37_stats.py` (unit stats), `r37_def.py` (DefStr per segment) and `r37_pred.py` (tests the rule against every player).

The CSVs have six segments: 0–2 are the other game (Assyria → Abbasid; Antiquity, Exploration, Modern) and 3–5 are game 29 (Maya → Inca; A, E, M).

## 1. Centre (district) defence strength

**The text** (VERIFIED). `base-standard/text/en_us/Civilopedia_Concepts_Text.xml:229` and `:708` both say: "calculated based on the strongest melee unit trained by the district owner minus a set value (10)".

**No data behind it** (VERIFIED absence).
- Districts (`base-standard/data/districts.xml`) have only `HitPoints="100"`. The schema's `DefenseModifier`, `OuterDefenseStrength` and `GrantFortification` columns are unused for city centres.
- Walls are `DistrictDefense="true"` with health only. Medieval Walls carry `Defense="1"`; no strength number exists.
- No GlobalParameter or player stat for "best melee" exists in the XML.
- The only strength modifiers are `EFFECT_DISTRICT_ADJUST_FORTIFIED_COMBAT_STRENGTH`: tradition Commune +3 (`age-exploration/data/traditions-gameeffects.xml:61`) and the Aerodrome promotion Advanced Landing Ground +10.
- **So the rule is engine code.**

**No UI getter** (UNKNOWN).
- The UI has no getter for a district's or a player's defence strength.
- The only way the game's UI reads it is the combat preview: `Game.Combat.simulateAttackAsync(attacker, {Location, X, Y, CombatType})` → `SimulateCombatResult.Defender.CombatStrength + StrengthModifier`, with `Defender.CombatStrengthType` (`panel-unit-combat-preview.js:185,311`). That needs an attacker able to attack the tile, so not our own centre.
- `Players.get(p).Districts.getDistrictHealth(loc)` gives health only.
- **Probe:** in game, list the members of `Districts.get(centreId)` and of `Players.get(0)` for a strength or best-unit getter.

**What CombatLog shows (game 29 and the other game)** (VERIFIED).
- **DefStr equals exactly the Combat of the strongest melee-class land unit** (infantry or cavalry, uniques included) the owner obtained **in the current age**. There is **no −10**: 20, 25, 30, 35, 60, 65 are the units' own Combat values.
- `r37_pred.py` checked every player's centre defence row against that max. It matched 262 of 309 rows (all players, all six segments). The other 47 rows come from 18 distinct cases, repeated attack by attack:
- 9 cases of a higher DefStr fit an upgrade edge to exactly that strength (below);
- 2 were a unit finished the same turn, after the combat;
- 7 were players with no melee unit logged in that age (our own M5 base of 20 among them).
- **Damage confirms no −10** (assuming the usual 30·e^(diff/25) damage curve):
  - M5: Line Infantry 47 vs 20 dealt 80 and 78. The formula gives about 88; with −10 it would be about 132.
  - E47 (other game): Rifleman 50 vs 65 dealt 15. The formula gives 16.5; with −10 it would be about 25.
  - Field Gun 37 vs 65 dealt 9–12. The formula gives about 10.
- **It applies to the whole empire at once** (VERIFIED): seg 2 T47, two centres at (13)(8) and (15)(37) both went 60 → 65 the turn a Tank was finished in ASSYRIA11.
- **It rises the same turn** a stronger melee unit is finished (VERIFIED: seg 2 T45 60, Tank T47, T47 65).
- **It resets each age** (VERIFIED).
  - Game 29 Modern M5–M6: DefStr **20** at Ollantaytambo (51)(5), though we had trained a Knight (45, E30) and a Lancer (50, E60) in Exploration.
  - From M51: **65** = Tank (first Tank trained M42 in MAYA3; more from M55).
  - **The base with nothing trained this age is 20** (INFERRED from this one case, M5). Antiquity starts at Warrior 20 anyway.
- **Bought units count** (VERIFIED). Seg 4 (Exploration) p4: DefStr 40 at E4. Its only melee unit of the age was a Mamluk (Combat 40) **bought** at E2 (CityPurchase logs units as `LOC_UNIT_X_NAME`). It trained none.
- **Upgrades within the age count** (INFERRED, strongly). Every case where DefStr was above the trained/bought max equals the player's upgrade target exactly:
  - Warrior→Spearman 25 (seg 0 p4 T46; seg 3 p2 T25);
  - Spearman→Phalanx 30 (seg 3 p1 T67);
  - Courser→Knight 45 (seg 1 p5 T58; seg 4 p3 T14);
  - Cuirassier→Landship 60 (seg 2 p2 T34; seg 2 p3 T52);
  - Landship→Tank 65 (seg 2 p2 T90);
  - Cossack_2→Cossack_3 60 (seg 5 p2 T53).
  - AIs with DefStr above 20 and no melee trained or bought in the age (seg 1 p6 35; seg 2 p3 T28 55; seg 4 p2 45; seg 5 p7 55, p8 50) are probably carried units upgraded in the new age; p20 is an independent.
  - **So upgrading one carried-over unit at an age's start may be the cheapest fix.** Probe: upgrade a carried Lancer→Cuirassier at M1 and read the next centre DefStr in CombatLog.
- **Walls do not change strength** (VERIFIED). Game 29 Modern: DefStr was already 65 at M51, before any Defensive Fortifications (INCA4 done M62, INCA2 M64). Walls add 100 health (defHealth (158)200 at M65 at (48)(6)), not strength.
- **DefStrMod** is 0 or 3 (probably terrain or a card; not identified).

**Per segment, against player 0 (centres only):**

| Seg | Turn: DefStr | Our melee units finished (T = trained, B = bought) |
|---|---|---|
| 0 (A, other game) | T33–T55: 25 (galley and quadrireme bombard; walls 200 HP from T43) | Warrior T2, Spearman T26 |
| 1 (E, other) | no attacks on us | Mamluk_2 T41, Mamluk_3 T67 |
| 2 (M, other) | T45–T46: 60; T47–T79: 65 | Landship T18, Cuirassier B T6, Tank T47 (more T52–T88) |
| 3 (A, game 29) | T23–T25: 20; T52–T55: 30; T56–T65: 35 | Warrior/Jaguar Slayer 20 (T2–T6), Spearman 25 T27, Chariot 30 T51 (B T53), Horseman 35 T56 |
| 4 (E, game 29) | no attacks on us | Knight T30, Lancer T60 |
| 5 (M, game 29) | **T5–T6: 20** (Line Infantry, 80 + 78 damage, the centre fell); T51–T65: 65 (Rifleman, Landship, Cossack_2, Bomber) | Tank T42 MAYA3, T55, T57×2, T59, T62, T68, T69 |

**Implications for the code.**
- Gotcha 28 and `xpl-autopilot-steps.js:2425` say "minus 10". The observed value is the unit's full Combat.
- The strongest melee includes **cavalry** (Chariot, Horseman, Tank, Landship count).
- "Trained" means trained, bought or (very likely) upgraded **this age**.

## 2. CityProductionCompleted and CityMadePurchase payloads

**CityProductionCompleted** (VERIFIED).
- The payload is `{cityID, productionKind, productionItem}`. `productionKind` is compared with the engine global `ProductionKind.UNIT | CONSTRUCTIBLE | PROJECT`.
- `productionItem` is passed straight to `GameInfo.Units.lookup(...)`, so it is the type hash or index.
- Sources: `age-antiquity/ui/tutorial/tutorial-items-antiquity.js:719–731`, `:2736–2741`; `age-modern/ui/tutorial/tutorial-items-modern.js:424–432`.
- `ProductionKind` is a global in the game UI; `city-banners.js:676–706` switches on it.

**CityMadePurchase** (VERIFIED).
- The game reads only `{cityID}` (`panel-production-chooser.js:650`). No UI code reads a unit type from it. UNKNOWN whether the payload has more fields; probe: `engine.on("CityMadePurchase", d => console.log(JSON.stringify(d)))`.

**Alternatives.**
- `UnitAddedToMap {unit: ComponentID}` (tutorial-items-antiquity.js:1533–1539, :2824–2829), or our own purchase request, which already knows the unit type, confirmed by the new unit.
- CityPurchase.csv logs units as `LOC_UNIT_<TYPE>_NAME`.

## 3. Naval attacks

**world-input.js `requestMoveOperation`** (`base-standard/ui/world-input/world-input.js:410–480`; VERIFIED). A click on a target plot tries, in order:
1. `canStart(unit, "UNITOPERATION_NAVAL_ATTACK", {X, Y, Modifiers: NONE})`. On success: `sendRequest(..., "UNITOPERATION_NAVAL_ATTACK", {X, Y, Modifiers: ATTACK + MOVE_IGNORE_UNEXPLORED_DESTINATION})`.
2. else `UNITOPERATION_AIR_ATTACK`, the same way;
3. else `Game.Combat.testAttackInto(unit, params)`. If that gives `COMBAT_RANGED`: `canStart RANGE_ATTACK` then `sendRequest(RANGE_ATTACK, {X, Y, Modifiers: ATTACK + IGNORE_UNEXPLORED})`;
4. else `UNITCOMMAND_ARMY_OVERRUN`, else `SWAP_UNITS`, else `MOVE_TO {X, Y, Modifiers: ATTACK + IGNORE_UNEXPLORED}` after canStart.

**interface-mode-naval-attack.js** (VERIFIED): `canStart(id, "UNITOPERATION_NAVAL_ATTACK", {}, false).Plots` gives the valid plots, then `sendRequest(id, "UNITOPERATION_NAVAL_ATTACK", {X, Y})`.

**The shared hotkey** (VERIFIED). `unit-operations.xml:119`: NAVAL_ATTACK has `HotkeyId="RangedAttack"`, the same as RANGE_ATTACK (`:105`). unit-actions.js:1364 picks *the* action with that hotkey, which suggests a unit has one or the other (INFERRED).

**Which ships attack how** (from CombatLog; INFERRED):
- **Melee-class ships** (Galley, Quadrireme, Privateer; Dhow by tags) attack:
  - land units with `Ranged` combat at their **RangedCombat** (Galley AttStr 20 vs Warrior);
  - centres at their **Bombard** (Galley 15, Quadrireme 20; CombatType blank);
  - ships and embarked units with `Melee` (Quadrireme vs Galley 31/30 damage; Galley vs Settler).
  - That fits NAVAL_ATTACK being the melee ship's strike at land (range 1), and melee vs ships coming either from NAVAL_ATTACK or from MOVE_TO + ATTACK (UNKNOWN which).
- **Ranged ships** (Cog, Carrack, Kalam, Frigate, Dreadnought, Battleship): only `Ranged` vs units (RangedCombat) and Bombard vs centres. Never `Melee` (183 Cog, 435 Frigate, 150 Dreadnought rows).
- **Modern light ships** (Ironclad, Cruiser, Destroyer) never fought in either game.
  - Their tags are `LIGHT, SKIRMISH`, **not `MELEE`** (`age-modern/data/units.xml`). A classifier keyed on `UNIT_CLASS_MELEE` misses them.
  - Dreadnought, Frigate and Battleship carry both `RANGED` and `SIEGE`; Mikasa carries `SIEGE` but **not `RANGED`**.

**Our code** (`mod/expansion-planner/ui/data/xpl-autopilot-units.js`).
- **`shootRaiders` (2775)** takes any `CORE_CLASS_MILITARY` unit on the map with `shootsFromAfar` (RangedCombat > 0 or Bombard > 0). That is **every** warship, melee ones too (Galley 20, Ironclad 20).
  - It calls `rangedAttack` (1271): `canStart(RANGE_ATTACK, {})`, then targets with a unit of a hostile owner, never a district.
  - **Ranged ships:** these shoot only if the engine offers them RANGE_ATTACK (UNKNOWN; probable from the ranged-attack interface and the shared hotkey). If it does, they shoot hostile units in range.
  - **Melee ships:** RANGE_ATTACK is very likely refused (they get NAVAL_ATTACK), so they do nothing.
- **`strikeRaiders` (2807)**, the melee loop:
  - It keeps units with `getMeleeStrength(false)` ≥ rangedStrength and bombardStrength. Melee ships pass (Ironclad 45 vs 20; Galley 25 vs 20).
  - It then needs a raider at distance 1 (`raidersNear` skips district tiles) and `canStart(MOVE_TO, {X, Y, Modifiers: ATTACK})`.
  - **Against a land raider** a ship cannot MOVE_TO onto land; the game uses NAVAL_ATTACK there. So **melee ships never hit land raiders today** (INFERRED).
  - **Against an adjacent hostile ship** a strike happens only if MOVE_TO + ATTACK is legal for ships (UNKNOWN; world-input reaches MOVE_TO only after NAVAL_ATTACK fails).
- **`commanderAttacks`** uses only `UNITCOMMAND_FOCUSED_ATTACK_LAND_*`; there is no `_SEA_*`.
- **We never owned a warship in game 29 or the other game** (CityBuildQueue and CityPurchase: none; one Frigate heal row in seg 2). So no log evidence for our side.
- **Probe:** for one Galley or Ironclad and one Frigate, log `canStart` of NAVAL_ATTACK, RANGE_ATTACK and MOVE_TO + ATTACK, each with `{}` and with a target `{X, Y}`. Then send NAVAL_ATTACK `{X, Y}` and read CombatLog.
- **Fix direction:** dispatch like world-input. NAVAL_ATTACK first (canStart with the target), else RANGE_ATTACK, else MOVE_TO + ATTACK. Use `Units.getReachableTargets(id)` for candidates.

## 4. Bombard against ships

**The text** (VERIFIED).
- Concepts:344: "Both ranged and siege land units use their bombard strength when attacking naval units, resulting in ranged units inflicting less damage and siege units inflicting more damage on naval targets."
- Concepts:1216 says the same for ranged units.
- Concepts:1921 adds that a ranged attack uses Bombard against fortified units and districts.

**No modifier** (VERIFIED absence): no data row or modifier implements it; it is engine code.

**Ranking:** use `Unit_Stats.Bombard`, siege included. A target-specific `simulateAttackAsync` decides when available. `isRangedGuard` today excludes units with Bombard > RangedCombat (all siege) and `bestRangedOrder` ranks by RangedCombat.

| Age | Unit | Class | Combat | Ranged | **Bombard** | Range | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| A | Slinger | ranged | 5 | 15 | 5 | 2 | 30 |
| A | Archer | ranged | 10 | 20 | 10 | 2 | 50 |
| A | Ballista | siege | 15 | 10 | **30** | 2 | 55 |
| A uq | Burning Arrow 1/2 | ranged | 5/10 | 15/20 | 8/13 | 2 | 30/50 |
| A uq | Hulche 1/2, Nu 1/2 | ranged | 5–15 | 15/20 | 5/10 | 2 | 30/50 |
| E | Heavy Archer | ranged | 20 | 30 | 20 | 2 | 120 |
| E | Crossbowman | ranged | 25 | 35 | 25 | 2 | 160 |
| E | Arquebusier | ranged | 30 | 40 | 30 | 2 | 210 |
| E | Catapult | siege | 25 | 20 | **40** | 2 | 110 |
| E | Trebuchet | siege | 30 | 25 | **45** | 2 | 150 |
| E | Bombard | siege | 35 | 30 | **50** | 2 | 200 |
| E uq | Keshig 1–3, Warakaq 1–3 | ranged | 20–30 | 30–40 | 20–30 | 2 | 120–230 |
| E uq | Xunleichong 1–3 (also MELEE) | ranged | 35–45 | 20–30 | 5–15 | 2 | 130–220 |
| M | Field Cannon | ranged | 35 | 45 | 35 | 2 | 270 |
| M | Field Gun | ranged | 40 | 50 | 40 | 2 | 320 |
| M | AT Gun | ranged | 45 | 55 | 45 | 2 | 380 |
| M | Mortar | siege | 40 | 35 | **55** | 2 | 260 |
| M | Heavy Artillery | siege | 45 | 40 | **60** | 3 | 310 |
| M | Assault Gun | siege | 50 | 45 | **65** | 3 | 370 |
| M uq | Chang Beun 1–3 | ranged | 35–45 | 50–60 | 35–45 | 2 | 270–380 |
| M uq | Katyusha 1/2 | siege | 40/45 | 40/45 | 50/55 | 3 | 310/370 |
| M uq | Sepoy 1–3 (also MELEE) | siege | 50–60 | 5–15 | 45–55 | 1 | 290–400 |

**Ships, for reference:**

| Ship | Combat | Ranged | Bombard | Range | Class |
|---|---:|---:|---:|---:|---|
| Galley | 25 | 20 | 15 | 1 | MELEE |
| Quadrireme | 30 | 25 | 20 | 1 | MELEE |
| Cog | 30 | 35 | 30 | 2 | RANGED |
| Carrack | 35 | 40 | 35 | 2 | RANGED |
| Galleon | 40 | 45 | 40 | 2 | RANGED |
| Privateer | 35 | 10 | 10 | 1 | MELEE |
| Ironclad | 45 | 20 | 20 | 1 | LIGHT |
| Cruiser | 50 | 25 | 25 | 1 | LIGHT |
| Destroyer | 55 | 30 | 30 | 1 | LIGHT |
| Frigate | 45 | 50 | 45 | 2 | RANGED+SIEGE |
| Dreadnought | 50 | 55 | 50 | 2 | RANGED+SIEGE |
| Battleship | 55 | 60 | 55 | 3 | RANGED+SIEGE |
| Submarine | 50 | 70 | — | 2 | — |

## 5. The Combat API as the UI uses it

**`unit.Combat`** (VERIFIED, from `unit-actions.js:722–739`, `interface-mode-move-to.js:45–61` and `support-unit-map-decoration.js:236`):
- `isCombat`, `canAttack`;
- `getMeleeStrength(false)`;
- `rangedStrength`, `bombardStrength`, `attackRange` (shown when > 1), `attacksRemaining`;
- `combatModifiers.wMDBlastRadius`, `hasMovedIntoZOC`.

**The game's ranged-or-melee test**: `(ranged > 0 || bombard > 0) && (ranged > melee || bombard > melee)`. Ranged units use RANGE_ATTACK; others use MOVE_TO + ATTACK. Melee ships (Ironclad 45 > 20) fall on the melee side of this test.

**`Game.Combat`** (VERIFIED):
- `simulateAttackAsync(unitId, {Location, X, Y, CombatType})` → `SimulateCombatResult`. Fields: `QueryToken`, `Location`, `CombatType`, and `Attacker` / `Defender` each with `ID`, `CombatStrength`, `StrengthModifier`, `CombatStrengthType` (STRENGTH_MELEE / RANGED / BOMBARD), `DamageTo`, `MaxHitPoints`, `PreviewText*`.
- `testAttackInto(unitId, {X, Y, …})` → `CombatTypes`.
- `getDefensibleDistrict(loc)` and `getBestDefender(loc, attackerId)`.

**`Units.getReachableTargets(unitId)`** gives attackable plot indices (support-unit-map-decoration.js:232).

**The preview panel** (`panel-unit-combat-preview.js`; VERIFIED).
- It targets a district when `getDefensibleDistrict` is valid, else `getBestDefender`.
- It sends `CombatType` `COMBAT_RANGED` only while the RANGE_ATTACK mode has fired `ranged-attack-started`. Otherwise it sends `NO_COMBAT` and the engine picks the attack (and so the strength type). **The naval-attack mode fires no such event**, so a naval strike is previewed with `NO_COMBAT`.
- It shows nothing when `results.Attacker` is missing, or when the unit is `!isCombat` or `!canAttack`.

## 6. Navigable rivers and bridges

**What the UI uses** (VERIFIED).
- The UI never uses `isNavigableRiver`: it appears only in map scripts. The tooltip and placard use `GameplayMap.getRiverType(x, y)` against `RiverTypes.RIVER_NAVIGABLE | RIVER_MINOR | NO_RIVER` (`ui-next/tooltips/plot-tooltip/helpers.js:83`).
- Map scripts treat a navigable river tile as not water: `isWater == false && … isNavigableRiver == false` (feature-biome-generator.js:83).
- `map-utilities.js:395` checks ocean access with `getRiverType(...) == RIVER_NAVIGABLE && MapRivers.isRiverConnectedToOcean(idx)`. `MapRivers` is a map-generation global; UNKNOWN whether it exists at UI time.
- **Embarkation** is the unit property `unit.isEmbarked` (age-exploration tutorial-items-exploration.js:377). It is the reliable test for "this land unit is on water now".

**Bridges** (Ancient `age-antiquity/data/constructibles.xml:108`; Medieval `age-exploration/…:96`).
- Data: `RiverPlacement="RIVER"`, valid on `TERRAIN_NAVIGABLE_RIVER`, tags `WATER` + `BRIDGE`, `ProductionBoostOverRoute="100"`; +4 Gold; Happiness +2 (Ancient) / +3 (Medieval); Town-buyable; a flood event.
- Text (Concepts:2155, :922): land units cross a navigable river on that tile **without embarking**.
- No modifier: the effect is engine code keyed on the BRIDGE tag (VERIFIED absence).
- UNKNOWN (probe on a bridge tile):
  - whether `isNavigableRiver` or `getRiverType` change (very likely not: the terrain stays);
  - whether a land unit there has `isEmbarked` false and can attack;
  - whether ships can still pass.
- **So:** decide "embarked" by `unit.isEmbarked`, not by terrain.

## Live probes, in short
1. A centre's DefStr after buying a melee unit (bought units count, seen once), and after **upgrading** a carried unit at an age's start (counts? it would be the cheapest fix).
2. A district or player strength getter: list the members of `Districts.get(centreId)` and `Players.get(0)`.
3. The full `CityMadePurchase` payload.
4. For a Galley or Ironclad and a Frigate: `canStart` of NAVAL_ATTACK, RANGE_ATTACK and MOVE_TO + ATTACK, with `{}` and with a target.
5. On a bridge tile: `isEmbarked`, `isNavigableRiver`, ship passage.
