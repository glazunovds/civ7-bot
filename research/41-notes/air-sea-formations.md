> Notes of a research agent for research/41 (21 October 2026): land units near enemy ships, formations' leftovers, the air
> wing's and the navy's remaining requests, and how often air and sea combat happened. Nothing under `mod/` or `tests/`
> was changed. Marks: **VERIFIED** (read in code, data or a log), **INFERRED** (follows from verified facts), **UNVERIFIED**
> (not checked; a probe or a game would settle it).

# Air, sea and formations: what the evidence says

**Paths.** Game files are under `D:/SteamLibrary/steamapps/common/Sid Meier's Civilization VII/Base/modules/`:
- `BS` = `base-standard`; `AQ`, `EX` and `MO` = `age-antiquity`, `age-exploration` and `age-modern`.
- "Concepts" = `BS/text/en_us/Civilopedia_Concepts_Text.xml`.
- "units.js" = our `mod/expansion-planner/ui/data/xpl-autopilot-units.js` and "steps.js" = `…/data/xpl-autopilot-steps.js`.
- "formation.js", "naval.js" and "air.js" = `…/ui/core/xpl-formation.js`, `xpl-naval.js` and `xpl-air.js`.

**Evidence.**
- The files: `research/game30..47/evidence*.zip`, CombatLog.csv and the `[XPL]` lines of UI.log.
- Game 44 has two zips:
  - `evidence.zip` holds UI.log only, A1 to about E20;
  - `evidence-e20-m34.zip` holds E20 to M34, its CombatLog included.
- `game37-hof/evidence.zip`'s CombatLog is byte-identical to game 35's (`cmp`), so it is left out of every count.

**Method.**
- The scripts are in `research/41-notes/scripts-air-sea/`. `extract.sh` explains the order.
  - `annotate.py` tags each UI.log line with the age and turn of the next `gold: T…` line, which ends every turn's pass.
  - The others read CombatLog.csv.
- Our player is 0 (game 38's Frigate rows: `DefPlayer 0` on our Abambowa and Field Cannons).
- A unit's domain comes from `GameInfo.Units.Domain` in every `units.xml` of Base and the DLCs.
- CombatLog's `Turn` restarts each age. A drop of more than 20 turns starts a new age.

---

## 0. The numbers in brief

| | Games 30-47 (18 CombatLogs) | Source |
|---|---|---|
| Our land units killed as defenders | 56 | `losses.py` |
| … by ships | **29 (52%)**: 18 Scouts, 11 soldiers | `losses.py`, `navalcombat.py kills` |
| … by land units | 27 | `losses.py` |
| … by aircraft | 0 | `losses.py` |
| Ship attacks on our land units (hits) | 182 (91 on Scouts). Games 37-47: 114, of which 25 on formation members, 43 on other soldiers and 46 on Scouts | `shiphits.py` |
| Ship attacks on our districts | 34 (of 156 attacks on our districts) | `losses.py` |
| Combat rows with an aircraft, **any player** | **0** in games 30-47; 7 in game 29 (a Russian Bomber, M59-M65) | `losses.py` `airAny`; `unzip -p research/game29/evidence.zip CombatLog.csv \| grep BOMBER` |
| Our ships' attacks | 0 in games 30-38; 6, 5, 9 and 7 in games 39, 42, 44 and 45 (Phase 6 shipped with game 39) | `navalcombat.py` |
| Settlements we lost within an age (Player_Stats, cities + towns falling between two turns of one age) | none in games 37-47 | `Player_Stats.csv` of each zip, player 0 |

---

## A1. Land units kept out of enemy ships' reach

### A1.1 What killed them (CombatLog)

**The 11 soldiers ships killed** (VERIFIED: CombatLog rows; the UI.log lines are at the same turns):

| Game | Turn | Killer (attack) | Ours (defence) | What our unit was doing (UI.log) |
|---|---|---|---|---|
| 33 | M37 | Dreadnought (55) | Cuirassier (50), melee | hurt, between the coast and the water: `TO_WATER` M36, `LEFT_WATER` M37; hit at 3,15 and then 6,15 by a Frigate and a Dreadnought |
| 38 | A40 | Quadrireme (25) | Slinger (5), ranged | formation member at 16,24 (Индрапура), hit at A36, A39 and A40 |
| 38 | M18 | Frigate (50) | Abambowa (50), melee | `HEAL` on 2,31 at M16 and M17, `ALERT` at M18; hit 4 turns running on the same tile (M15-M18) |
| 38 | M22 | Frigate (45-50) | Field Cannon (35), ranged | formation member: `FORMATION_RANGED` 6,25 -> 6,26 +55 at M16 (`formation: Бутооло … moves [UNIT_FIELD_CANNON 6,25 -> 6,26 RANGED +55]`), killed on 6,26 by 3 hits in one turn |
| 38 | M24 | Frigate (50) | Field Cannon (35), ranged | sent as an anti-ship guard (`defence: Бутооло … ranged 0 + 2 of 2 [UNIT_FIELD_CANNON in 8t, …]`), killed by 2 hits on 7,29 |
| 42 | E32 | Cog (35) | Swordsman (35), melee | sent to Даскилий and Экбатана (`REINFORCE`, ship-only raids), then `WITHDRAW`/`HEAL` back and forth along the coast (E25-E32), hit 7 times |
| 42 | E37 | Privateer (35, melee) | Swordsman (20 after damage) | the same pattern on 29-30,48 |
| 42 | E42 | Privateer (35, melee) | Catapult (20) | sent to Рага (`REINFORCE ["Катапульта","Экбатана"]`, ships only); killed in close combat |
| 42 | M40 | Frigate (50) | Field Cannon (35) | sent to Боразджан as its second anti-ship guard (`sent [UNIT_FIELD_CANNON from 40,34 in 8t]`, M33); killed by 2 hits on 44,17, a tile next to the centre at 45,19 |
| 44 | E28 | Cog (35) | Crossbowman (25), ranged | formation member at 69,46-47 (Сучан), hit at E25, E26 (a formation tile), E27 and E28 |
| 45 | E51 | Carrack (40) | Tercio (37), melee | walking along the coast 82,34 -> 82,37 toward Толедо (a ship-only threat: `defence: Толедо: raiders 2 (land 0, ships 2…)`); hit 5 times E49-E51; `WITHDRAW` at E51 |

**What the list shows:**
- 6 of the 11 were melee units, which cannot hit ships at all.
- 4 were ranged units whose Bombard is below the ship's Combat.
- One was a Catapult. It out-guns a Privateer with its Bombard, but lost to it in close combat.
- **Every one stood within its killer's Range of water, off a settlement centre.**

**Game 42's Боразджан** (M33-M41, two Frigates and a land raider) shows both sides of the rule:
- **What worked.** The formation moved a Mortar 46,18 -> 45,17 (`RANGED +70`, M34) into the ships' range. It was hit twice (19, 34), but it out-guns a Frigate (Bombard 55 against Combat 45). It hit back for 48, 61 and 65 and killed the Frigate at M38.
- **What did not.** On the same coast:
  - the screening Cuirassier at 45,18 (melee, `no better post`) was hit 7 times M37-M41;
  - the Field Cannon sent as the second anti-ship guard died on arrival.
- Sources: UI.log `formation: Боразджан` M33-M38 and CombatLog M34-M41.

**Scouts:** 18 killed by ships (A49-M53 across 11 games), mostly by Frigates and Cogs. The game's auto-explore walks the coasts (`navalcombat.py kills`).

**Army Commanders:** hit 10 times by ships at their posts, though none was killed:
- game 31, A47-A49, three Quadrireme hits on 29,11;
- game 32, E24-E27, six Privateer and Cog hits on 4,19;
- game 37, M32, a Frigate.

(`shiphits.py`.)

**By age** (`shiphits.py`, ship hits on our land units):

| Age | Hits | Kills | Hits on soldiers (not Scouts) |
|---|---:|---:|---:|
| Antiquity | 34 | 6 | 13 |
| Exploration | 67 | 11 | 44 |
| Modern | 81 | 12 | 34 |

**The README.** Game 38's README already says one Field Cannon stood "where the formation had put it, within the ships' range" (`research/game38/README.md:25`). The table above shows that is the pattern, not a one-off.

### A1.2 How our code places land units near ships today (VERIFIED, code)

- **Wants.**
  - `guardsWanted` asks for one melee guard on the centre even when only ships are in sight (units.js:2002, `Math.max(land, count > 0 ? 1 : 0)`).
  - `rangedWanted` asks for one ranged guard a ship, at most 2 (units.js:1986).
  - A ship-only raid therefore draws up to 3 land units to a coastal settlement.
- **Who goes** (`planDefence`).
  - Against ships, any ranged or siege land unit qualifies, nearest first (units.js:2340: `c.ranged === d.ranged && (!c.siege || d.antiShip)`). Strength against ships is never checked.
  - **Only purchases** rank by Bombard (`bestRangedOrder({ships})`, steps.js:3356-3360).
  - So a Field Cannon (Bombard 35) was sent against Frigates (Combat 45), and Slingers (Bombard 5) against Galleys (Combat 25).
- **Where it stands** (`postFor`, units.js:2290-2324).
  - Ranged posts score `outOfRange 1000` when the nearest raider is beyond the unit's Range. Ships count as raiders (`hostilesAround`, every domain: units.js:2292, 3757).
  - Of the tiles in range, the post furthest back wins (`- back * 40`, units.js:2306).
  - A land unit's Range (2, or 3 for Heavy Artillery and the Assault Gun) is no more than a ship's Range plus its moves. **A post "within range of a ship" is therefore always within that ship's reach.**
- **Formations.**
  - `targets` holds every hostile in sight, ships included (units.js:2628).
  - A ranged member earns `IN_RANGE` +60 for any target within its range (formation.js:89-90).
  - `EXPOSED` −40 counts only *land* raiders next to it (formation.js:90).
  - So the formation pays a ranged unit to step *into* a ship's range and charges nothing for it. This is game 38's Field Cannon: +55.
- **Hurt units.**
  - A member with any damage never moves (`formationStill` → "hurt", units.js:2588).
  - Outside a formation, `defend` first tries `stepAway` when a hostile is within `HEAL_SAFE_RADIUS` 2, or when `hostilesInReach` sees one and the unit is not within 2 of our centre (units.js:3860-3867). Otherwise it heals in place.
- **`stepAway` measures the wrong thing against ships.**
  - It maximizes the *distance to the nearest hostile unit*, up to `DANGER_RADIUS + 2`, within one turn (units.js:580-602).
  - A ship follows along the coast. What protects a land unit is its distance *from the water* the ship sails on.
  - Game 42's Swordsmen `WITHDRAW`-ed 25,41 → 26,42 → 28,41 → 29,40 … and stayed in reach for 8 turns.
- **`hostilesInReach` exists** (units.js:3685-3693).
  - It already counts a ship's reach as `BaseMoves + Range` (ranged) or `BaseMoves + 1` (melee), terrain aside.
  - It has no "distance to water" test, so a tile 3 inland from a Frigate 4 tiles out reads as "in reach".
- **`escape`** takes shallow water only with no ship, ranged or air unit within 4 (`waterIsSafe`, units.js:3781). Otherwise it goes to a centre within a turn, then `stepAway`.

### A1.3 The duel numbers (data and CombatLog)

**Ships** (VERIFIED: `units.xml` rows; the tags are each file's TypeTags):

| Ship | Combat / Ranged / Bombard | Range | BaseMoves | Tags | Source |
|---|---|---:|---:|---|---|
| Galley | 25 / 20 / 15 | 1 | 3 | MELEE, HEAVY | AQ units.xml:132, 221, 449-453 |
| Quadrireme | 30 / 25 / 20 | 1 | 3 | MELEE, HEAVY | AQ :136, 225, 463 |
| Cog | 30 / 35 / 30 | 2 | 3 | RANGED, HEAVY | EX :146, 249, 546 |
| Carrack | 35 / 40 / 35 | 2 | 3 | RANGED, HEAVY | EX :152, 255, 561 |
| Privateer | 35 / 10 / 10 | 1 | 4 | MELEE, LIGHT, SKIRMISH | EX :153, 257, 566 |
| Ironclad | 45 / 20 / 20 | 1 | 4 | LIGHT, SKIRMISH | MO :173, 293, 607 |
| Frigate | 45 / 50 / 45 | 2 | 3 | RANGED, HEAVY, SIEGE | MO :174, 294, 612 |
| Cruiser | 50 / 25 / 25 | 1 | 4 | LIGHT, SKIRMISH | MO :180, 300, 629 |
| Dreadnought | 50 / 55 / 50 | 2 | 3 | RANGED, HEAVY, SIEGE | MO :181, 301, 634 |
| Destroyer | 55 / 30 / 30 | 1 | 4 | LIGHT, SKIRMISH, SEE_HIDDEN | MO :190, 310, 665 |
| Battleship | 55 / 60 / 55 | 3 | 3 | RANGED, HEAVY, SIEGE | MO :191, 311, 672 |
| Submarine | 50 / 70 / – | 2 | 3 | STEALTH; `CanTargetLand="false"` | MO :192, 312, 679 |

**Land units against ships.**
- **The rule** (VERIFIED, text): "Both ranged and siege land units use their bombard strength when attacking naval units" (Concepts:344, also :1216).
- **The data** (VERIFIED):
  - Antiquity: Slinger 5, Archer 10, Nu 5 / Nu 2 10 (AQ :215, 218, 244-245); **Ballista 30** (AQ :220).
  - Exploration: Crossbowman 25, Heavy Archer 20, Arquebusier 30 (EX :252, 246, 260); **Catapult 40, Bombard 50** (EX :248, 262).
  - Modern: Field Cannon 35 (Combat 35), Field Gun 40 (Combat 40) (MO :290, 297); **Mortar 55, Heavy Artillery 60 (Range 3), Assault Gun 65 (Range 3)** (MO :292, 299, 309).
- **Embarked units** have 5 / 25 / 50 Combat by age (Concepts:1298).

**Exchanges seen** (VERIFIED: CombatLog damage; `AttStr` vs `DefStr`):

| Attacker → target | Damage per hit | Where |
|---|---|---|
| Frigate (50) → Field Cannon (35) | 36, 37, 38, 45, 59 | game 38 M22, M24 |
| Field Cannon (35) → Frigate (45) | 25 | game 38 M22 |
| Slinger (5) → Galley (25) / Quadrireme (30) | 12-28 / 10-19 | games 38, 39, 42, 45 (dozens of rows) |
| Catapult (40) → Cog (30) | 47, 98 (kill), 81 (kill), 80 (kill), 76 (kill) | game 42 E30-E39, game 44 E30-E31 |
| Mortar (55) → Frigate (45) | 48, 61, 65 (kill) | game 42 M35-M38 |
| Heavy Artillery (60) → Frigate (45) | 65, 100 (kill) | game 39 M37, M40 |
| Privateer (35, close combat) → Swordsman (20) / Catapult (20) | 46-47 (kill) / 58 (kill) | game 42 E37, E42 |

**Reading it.**
- The curve 30·e^(Δ/25) (`research/37-notes/combat.md:32`) fits these rows.
- Only siege units out-gun ships of their own age: Ballista, Catapult, Bombard, Mortar, Heavy Artillery, Assault Gun.
- Ranged units deal a third to a half of what they take.
- Melee land units cannot hit ships at all.

**Melee ships.** Range-1 ships attack land units both ways in the log:
- in close combat at their Combat: `Melee`, Galley 25, Privateer 35 (game 30 A49, game 42 E37);
- with their Ranged strength: `Ranged`, Galley 20 (game 30 A51).

So a siege unit next to the water still dies to a Privateer's 35 against its Combat 20-25. VERIFIED (CombatLog). Which attack the AI picks is UNVERIFIED.

### A1.4 What the rule needs

**1. The reach of a hostile ship.** A land tile `t` is in reach of ship `h` when `h` can sail to a water tile `w` this turn with `dist(w, t) ≤ Range(h)` (Range 1 for melee ships).
- **Water** is `GameplayMap.isWater` or `isNavigableRiver`, as our `onWater` already reads it (units.js:403-405).
- **The same water body.** `w` must be in the ship's body (`GameplayMap.getAreaId`, already used by `waterAreas`, steps.js:3134-3145; whether a navigable river shares its sea's area id is UNVERIFIED).
- **Within its moves.** `w` must be within `BaseMoves(h)` of the ship: 3, or 4 for Privateer, Ironclad, Cruiser and Destroyer.
- **The cheap form:** the existing `hostilesInReach` test (`dist(t, h) ≤ BaseMoves + Range`) **and** `min dist(t, water of that body) ≤ Range(h)`.
- **Moving before firing.** That a ship may move and then shoot in one turn is INFERRED. Game 38's independent Frigates hit 6,26 at M22, 4,26 at M23 and 7,29 at M24, but CombatLog gives no attacker tile, so these could be different ships.
- **Don't ask the engine for an enemy's reach.** The game asks `Units.getReachableMovement` and `getReachableTargets` only for the player's own selected unit (`BS/ui/interface-modes/support-unit-map-decoration.js:148-152`). Calling them on an enemy ship is not how the UI uses them, and gotcha 75 says not to. Use the geometry above.

**2. "Out-guns it".**
- A siege-strength unit whose `Bombard ≥ ship Combat` (`antiShipStrength`, units.js:1974) **and** whose `Combat ≥ ship's attack − 10` may stand in reach of that ship.
  - The ship's attack is its RangedCombat for Range ≥ 2, else max(Combat, RangedCombat).
- Against Modern Frigates (45 / 50) that admits Mortar (55 / 40) and Heavy Artillery (60 / 45), not the Field Cannon (35 / 35) or the Field Gun (40 / 40).
- Against Cogs (Combat 30, Ranged 35), the Catapult (Bombard 40, Combat 25) passes, but only just: 25 is the Cog's 35 less 10. A Privateer's close combat (35) killed one in game 42, so where Range-1 ships sail, use the margin against max(Combat, Ranged).
- Out-ranging never protects a land unit. A ship moves 3-4 and then fires, while land Range is 2-3 (INFERRED from the table). So "out-range" adds nothing beyond reach.
- **Several ships:** sum the expected hits. Two Frigates kill a Field Cannon in one turn (game 38 M22: 37 + 38 + 36).

**3. Exceptions.**
- The centre holder: the melee unit on a coastal centre stays. Research/24 W2: Нант fell to 2 Cogs and a Knight while a ranged unit held its centre.
- Garrisons (`ctx.garrison`).
- Units with no tile out of reach within a turn: they take the least-exposed tile.

**4. Where it applies, cheapest first:**
- **a. `defenceSupply` / `planDefence` (one filter).** For an `antiShip` demand, only units that out-gun the strongest ship there. The ranged count in `guardDetail({ranged})` should do the same, so a Field Cannon present does not fill the want. Without such a unit, the want goes to the purchase (`bestRangedOrder({ships})` already ranks by Bombard) or to the navy (`warshipsWanted`).
- **b. `formationValue` (formation.js:85-92).**
  - `IN_RANGE` counts ships only for a member that out-guns them.
  - A new `SHIP_REACH` penalty for a member in reach of a ship it does not out-gun, melee members off the centre included.
  - `planFormations` passes the ships with their Range, moves and Combat (`hostiles` already holds `def`).
- **c. `postFor` (units.js:2290-2324).** Skip tiles in reach of a ship the unit does not out-gun, except the centre for a melee holder; if every tile is, take the one in reach of the fewest.
- **d. Hurt and withdrawing units.**
  - `defend`'s pre-heal step and `escape`'s last step choose a tile out of ship reach (inland) when ships are the danger, not just "further from the unit".
  - A hurt member is "hurt" and frozen in a formation (units.js:2588). It needs the same step.
  - Game 38's Abambowa healed four turns on one coastal tile.
- **e. Walking to a post.** Game 45's Tercio and game 42's Swordsmen were shot on their way. `wayIsSafe` could count ship reach on the route; that costs one reach test per path tile (not measured).
- **f. Commanders' posts** (10 hits) and **Scouts** (91 hits, 18 kills): ship reach as danger in `dangerNear` and `postCommander`. This is cheap, but Scouts are cheap too.

**5. Tests a fix would want:**
- a Field Cannon is not sent against Frigates, and a Mortar is;
- a formation does not move a Field Cannon into a Frigate's range;
- a hurt unit by the coast steps inland, not along it;
- a Range-1 Privateer threatens only tiles next to water;
- a tile 3 from water is out of a Frigate's reach however near the ship;
- a lake ship does not threaten the sea coast (area id);
- the melee centre holder stays.

---

## A2. Formations' leftovers against the evidence (games 37-47)

**The data:** 469 `formation:` lines, about 59 settlement-episodes, from 7 games with lines. Game 30-36 logs predate Phase 4. Sources: `formations.py`, `notheld3.py`, `heldvsdamage.py`, `fronts.py`.

| | Count | Note |
|---|---:|---|
| Moves | 54 | SCREEN 20, RANGED 30, HOLD 4; none `NOT SENT` |
| Commander lines / moves | 90 / 5 | one `stays (moved lately)` after game 38's fix |
| Stays | 963 | on the centre 442, **hurt 172**, no better post 168, **busy 103**, moved 51, the player's 27 |
| Lines with ships in sight | **256 (55%)** | of which **143 (30%) ship-only** (`sectors 0 []`) |
| Lines with ≤ 2 free tiles | 43 (9%) | room was rarely the limit |
| Centre not held | 156 (33%) | the breakdown follows |

**Why a centre was not held** (`notheld3.py`; melee = Combat > 0 with no Ranged or Bombard in Unit_Stats):

| Case | Lines |
|---|---:|
| A ranged or siege unit on the centre, no melee member there | 72 |
| A ranged or siege unit on the centre, a free melee member next to it ("no better post") | 31 |
| A ranged or siege unit on the centre, the melee members hurt or busy | 24 |
| Centre empty, melee members hurt, busy or moved | 24 |
| Centre empty, no melee member | 1 |
| A HOLD move made | 4 |

**The units on the centre:**
- Slinger 42, Catapult 34, Nu / Nu 2 20, Mortar 10, Archer 7, Crossbowman 4, Heavy Artillery 3, Assault Gun 3, Ballista 3, Heavy Archer 1.
- The longest runs: game 38 Индрапура A26-A67 (17 lines), game 42 Экбатана E25-E47 (12), game 42 Боразджан M31-M41 (10).

**Did it matter?** Joined with the same turn's `defence:` line (`heldvsdamage.py`):

| Centre | Full health | Damaged |
|---|---:|---:|
| Held by melee | 223 | 90 |
| Ranged unit on it | 126 | **1** |
| Empty | 18 | **11** |

- A ranged unit on the centre was **harmless**: 126 of its 127 lines had the centre untouched, mostly ship-only raids.
- The 11 empty damaged centres all had a melee member within 2 of the centre that the formation would not move because it was hurt:
  - game 38 M12, Бутооло 20/100, two hurt Cuirassiers next to it;
  - game 47 E9, Цинциннати 29/100, a hurt Leiomano;
  - game 38 E26, Махендрапарвата 65/100 and Гангайконда 123/210;
  - game 43 A66, Кенигсберг 65/100;
  - game 45, Валенсия and Филадельфия.

  (VERIFIED: `out-heldvsdamage` rows in `heldvsdamage.py`'s output.) No settlement was lost.

**War fronts with no raider in sight** (`fronts.py`):
- Fronts lasted long: game 38 had 323 front lines, game 43 265, game 45 87.
- Few became threatened, and centres were damaged only at game 38 Гангайконда and game 43 Бехдет, Мен-Нефер and Кенигсберг.
- When raiders came, the settlement became threatened and its own formation took over, as designed. Nothing in the logs shows a staged guard badly placed before that; the logs record no staged guard's tile.

**Which leftover would have mattered in games 37-47:**
- **A reserve and room to retreat:** no evidence. No settlement fell, room was short in 9% of lines, and nothing shows a unit unable to retreat.
- **Screens beyond the first ring:** no evidence. 20 SCREEN moves in 469 lines, and the land-raider sectors were small (the `sectors` field: mostly 1-4 raiders).
- **Swaps within a pass:** 31 lines, a free melee unit next to a ranged-held centre, every one at full health. Cheap to cover without a swap: let a ranged or siege unit on the centre step off when a free melee member stands next to it, and the melee unit takes the centre next pass. Low value in the evidence.
- **A front with no raider in sight:** no evidence that it mattered.
- **What the evidence points at instead (not on the list):**
  - (1) **Ships.** 55% of formation lines had ships in sight. `IN_RANGE` counts ships, and 25 ship hits and 3 kills fell on formation members (A1).
  - (2) **Hurt melee units never take an empty centre.** All 11 empty damaged centres, two of them down to 20% and 29%. A hurt melee unit could be allowed the HOLD move only (onto the centre, not a screen tile). Whether units heal faster on a centre is UNVERIFIED.

---

## C1. Air: requests, preview, data

**The requests** (VERIFIED, game UI JS; `research/37-notes/air.md` §4-5 has the same with more text):

| Action | Sent by | Request | Args | Source |
|---|---|---|---|---|
| Air strike | the plane | `Game.UnitOperations` `UNITOPERATION_AIR_ATTACK` | `canStart(id, op, {}, false).Plots`, then `{X, Y}`; or right-click with `{X, Y, Modifiers: NONE}` | `BS/ui/interface-modes/interface-mode-air-attack.js:11, 47`; `BS/ui/world-input/world-input.js:436-451` |
| Rebase | the plane | `UNITOPERATION_REBASE` (within twice its movement) | `{}` → Plots → `{X, Y}` | `interface-mode-rebase.js:11, 47`; `BS/text/en_us/UnitOperationsText.xml:179` |
| Establish an air base | the Squadron Commander | `UNITOPERATION_ESTABLISH_BASE` | `{}` → Plots → `{X, Y}`; failure "No eligible Air Base locations" | `interface-mode-establish-base.js:16, 52`; `UnitOperationsText.xml:173, 258`; `BS/data/unit-operations.xml:116` (CategoryInUI MOVE) |
| Aerial reconnaissance | the Aerodrome Commander, or a Squadron Commander with the promotion | `UNITOPERATION_AERIAL_RECON` (RequiresAbility) | `{}` → Plots → `{X, Y}` | `interface-mode-aerial-recon.js:11, 47`; `unit-operations.xml:86` |
| Cargo drop and air drop | Squadron Commander promotions | `UNITOPERATION_CARGO_DROP`, `UNITOPERATION_UNIT_AIR_DROP` (RequiresAbility) | `{}` → Plots → `{X, Y}` | `interface-mode-cargo-drop.js:11, 47`; `interface-mode-unit-air-drop.js:11, 47`; `unit-operations.xml:90, 114` |
| Fighter Sweep, Ground Attack, Carpet Bomb | the air commander | `Game.UnitCommands` `UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR`, `_AIR_TO_LAND`, `_AIR_BOMB` | `canStart(cmdr, cmd, {}, false).Plots`, then `{X, Y}` | `interface-mode-focused-attack-base.js:12, 48`; `interface-mode-focused-attack-air-*.js:6`; `BS/ui/unit-interact/unit-action-handlers.js:361-396`; `BS/data/unit-commands.xml:83-85`; text `BS/text/en_us/UnitCommandsText.xml:214-227` |

**Carriers.**
- There is no carrier-specific request in the UI JS.
- A plane rebases onto a carrier as onto any air base. A carrier moves as a ship.
- "Squadron Commanders can be packed into Aircraft Carriers for easy transport" (`MO/text/en_us/TutorialText.xml:81`). Which command does that (most likely `UNITCOMMAND_ADD_TO_ARMY` on the Squadron Commander; the LOC name «Add To Squadron» exists, `UnitCommandsText.xml:91-97`) is UNVERIFIED.
- `grep CARRIER` in the UI JS finds only the tutorial (`MO/ui/tutorial/tutorial-items-modern.js:386-435`) and the promotion model.

**The air strike preview (P-AIR-4).**
- The game's preview panel runs for whatever unit is selected, on every plot-cursor move, with no air special case:
  - the target is `Game.Combat.getDefensibleDistrict(loc)` if valid, else `getBestDefender(loc, unit)` (`BS/ui/unit-combat-preview/panel-unit-combat-preview.js:133-141`);
  - then `Game.Combat.simulateAttackAsync(unitId, {Location, X, Y, CombatType})`, with CombatType `NO_COMBAT` unless the *ranged* mode raised `ranged-attack-started` (:175-185; that event comes only from `interface-mode-ranged-attack.js:40`);
  - the answer is the `SimulateCombatResult` event, matched by `QueryToken` (:187-188).
- Its result can carry `PreviewTextInterceptor` lines (:475-477). Whether the predicted damage includes the interception is UNVERIFIED.
- Our `simulateAttack` (units.js:3944-3975) already sends exactly that call (`NO_COMBAT`, Location / X / Y). So probe P-AIR-4 needs only to call it before `airAttack`'s `sendRequest` (units.js:4042-4072) and log the answer next to the `Combat` event.
- **Still unanswered:** no plane of ours ever attacked in games 30-47, and no air combat happened at all (§C3).

**Data.**
- **The commanders** (VERIFIED, `BS/data/units.xml`):

  | Commander | Row | Domain, class | Moves | Cost | Unlock | Tags |
  |---|---|---|---:|---|---|---|
  | Squadron | :82 | AIR, SUPPORT | 8 | 140, +140 a copy (:377) | `NODE_TECH_MO_FLIGHT` (MO progression-trees-tech.xml:128) | AIRCRAFT (:182-185) |
  | Carrier | :83 | SEA | 4 | 160, +160 (:378) | `NODE_TECH_MO_MOBILIZATION` (:155) | SQUADRON_COMMANDER, CARRIER_COMMANDER, NAVAL (:187-191) |
  | Aerodrome | :84 | AIR, CIVILIAN | 0 | granted by each Airfield, not trainable | | `PROMOTION_CLASS_AERODROME_COMMANDER` |

  Their promotion trees are `PROMOTION_CLASS_AIR_COMMANDER`, `_AERODROME_COMMANDER` and `_CARRIER_COMMANDER` (`BS/data/unit-promotions.xml:46-48`, disciplines :298-319).
- **Promotions that change reach or capacity** (`BS/text/en_us/UnitPromotionsText.xml`):
  - Ace, +1 interception range for packed Fighters (:851);
  - Advanced Landing Ground, +2 slots and +10 defending, for Squadron (:928) and Aerodrome (:1009);
  - Flight Deck (carrier), +2 slots and +1 movement for packed planes (:1023);
  - Aerial Reconnaissance (:955);
  - Commendation Service, +2 movement for packed planes; Order, +5 Combat.
- **Strike bonuses:**
  - Tactical Strike, +3 against land units (:867);
  - Formations, +5 with Ground Attack (:892);
  - Saturation, +5 with Carpet Bomb (:905);
  - Torpedo Bombers (carrier), +5 against naval units (:1043);
  - Danger Close, +3 next to a friendly unit (:962).
- **Interception range:** 3 by default (Concepts:1272), +1 at an Aerodrome, +1 after Flight's mastery, +1 Ace. The sources are in `research/37-notes/air.md` §3.
- **Our probe agrees:**
  - game 40 M40, `air: Йодам's Airfield at 31,40: free 4, range 5`: an Airfield (+1) after Flight's mastery (+1);
  - across games 32-36 and 40, 79 Airfield lines read `free 4, range 4` and 74 read `free 4, range 5`.

  The Aerodrome's capacity read 4 every time (`army … unitCount 0 capacity 4`). VERIFIED (UI.log).

---

## C2. Sea: Fleet Commanders, fleets, escorts, upgrades

**The Fleet Commander** (VERIFIED):
- `UNIT_FLEET_COMMANDER`: DOMAIN_SEA, SUPPORT, 3 moves (`BS/data/units.xml:81`).
- Cost 120, +240 a copy (:81, :376). Unlocked by `NODE_TECH_EX_ASTRONOMY` (`EX/data/progression-trees-tech.xml:69`).
- Tags COMMAND, FLEET_COMMANDER, NAVAL, AGELESS (`units.xml:178-181`). Promotion class `PROMOTION_CLASS_NAVAL_COMMANDER`, disciplines at `unit-promotions.xml:287-296`.

**Its focused attacks** (VERIFIED):
- **The commands:**
  - `UNITCOMMAND_FOCUSED_ATTACK_SEA_MELEE`, «Coordinated Naval Attack»: "Order all **Light** Naval Units within Command Radius to attack a specified target … +2";
  - `UNITCOMMAND_FOCUSED_ATTACK_SEA_RANGED`, «Focus Fire»: "all **Heavy** Naval Units … fire upon a specified target … +2".
- **Sources:** `UnitCommandsText.xml:199-210`; `unit-commands.xml:81-82` (CategoryInUI COMMAND).
- **The request** is the land focused attacks' shape: `Game.UnitCommands.canStart(cmdr, cmd, {}, false).Plots`, then `sendRequest(cmdr, cmd, {X, Y})` (`interface-mode-focused-attack-base.js:12, 48`; `-sea-melee.js:6`, `-sea-ranged.js:6`; handlers `unit-action-handlers.js:337-360`).
- **Who joins:**
  - LIGHT: Privateer, Ironclad, Cruiser, Destroyer; the DLC Barbary Corsair and Sloop.
  - HEAVY: Galley, Quadrireme, Cog, Carrack, Frigate, Dreadnought, Battleship; the DLC Revenge, Vikingr and Turtle Ship (A1.3 table; `DLC/*/modules/data/units.xml`).
  - Galleys and Quadriremes are MELEE but HEAVY. Whether Focus Fire orders them into melee is UNVERIFIED.
  - The Submarine is neither LIGHT nor HEAVY.
- **Our code:** `commanderAttacks` (units.js:3497-3560) knows only `_LAND_RANGED` and `_LAND_MELEE`, and `isLandCommander` filters the commanders. A sea version is the same loop with LIGHT / HEAVY members and naval targets.

**Assembling and deploying a fleet** (VERIFIED):
- There is no fleet-specific command type. `unit-commands.xml` lists only `UNITCOMMAND_PACK_ARMY`, `_UNPACK_ARMY`, `_ADD_TO_ARMY` and `_REMOVE_FROM_ARMY` (:8-9, 26, 29). The army panel sends those for any commander (`BS/ui/army-panel/army-panel.js:545-547, 571-572`).
- The texts «Assemble Fleet» (`LOC_UNITCOMMAND_PACK_FLEET_NAME`), «Deploy Fleet», «Add To Fleet» and «Leave Fleet» exist (`UnitCommandsText.xml:61-118`), but no UI JS references them (`grep PACK_FLEET|LEAVE_FLEET|ADD_TO_FLEET`: none). Whether the engine renames the army commands for a Fleet Commander is UNVERIFIED and does not matter for requests.
- "Gather adjacent Naval Units to form up on the Commander" (:64-65).

**Promotions that matter for defence** (`UnitPromotionsText.xml`):
- Weather Gage, move after unpacking (:592);
- Flotilla, "+2 Unit Slots and **Land Units can pack into this Commander**" (:667): sea transport, research/37 §5C.4's open item;
- Convoys, land units in the radius +10 embarked strength (:780);
- Secondary Armament, reciprocal damage against ranged attacks (:559);
- Spotter, +1 range (:546);
- Raking Fire, +3 defending (:605);
- Flagship, the commander +10 defending (:767);
- Commendation Valor, «Grant Second Wind»: one ship +1 attack and +2 movement; Order, +5 Combat in the radius.

**Escorts and naval formations:** there is no game request for either. `unit-commands.xml` and `unit-operations.xml` have no escort, patrol or formation type. They would be our own movement rules. VERIFIED (absence in data).

**Ship upgrades:**
- `UNITCOMMAND_UPGRADE` on the ship: next tier, +5 Combat, uses all remaining movement (`UnitCommandsText.xml:175-179`).
- It refuses outside friendly territory (`…_UPGRADE_MUST_BE_IN_TERRITORY`, :305), without the gold (:302) and without the resources (:308).
- `UNITCOMMAND_UPGRADE_ARMY` on a commander upgrades every eligible packed unit (:181-185; `unit-commands.xml:33`).
- **The chains:** Galley → Quadrireme (AQ units.xml:343); Cog → Carrack → Galleon; Privateer → Privateer 2 (EX :417-423); Ironclad → Cruiser → Destroyer; Frigate → Dreadnought → Battleship (MO :479-486).
- Our `upgradeUnits` (units.js:1714-1747) already includes ships: any CORE_CLASS_MILITARY unit that is not a commander. There is no naval priority.

**Our navy in the logs:**
- We never had a Fleet Commander: no `FLEET_COMMANDER` of ours in any UI.log or CombatLog. The AIs did: 7-66 CombatLog rows a game name one of theirs, healing or attacked by other AIs; we never attacked one (`AttPlayer 0` against a Fleet Commander: 0 rows).
- Our naval units peaked at 1-10 (`Player_Stats.csv` "Naval Units", games 37-47; 10 in game 42).
- Naval guard lines (`naval: <settlement>: ships …`, games 39-47): 186 in all.
  - 60 had warships there and 20 sent one.
  - **46 had no warship there or coming and sent none, while 1-4 "free warship(s)" existed.** Why (post beyond `POST_MAX_TURNS` 6, no path, rough seas) is not logged; this would be the cheap naval item to look at before Fleet Commanders.
- P-NAV-1 was answered in game 39: `UNITOPERATION_NAVAL_ATTACK` with `{X, Y}` works, a Galley's in close combat and a Cog's ranged (`research/game39/README.md:22`).

---

## C3. How often air and sea combat with us happened

**Per game** (CombatLog; `losses.py`, `navalcombat.py`):

| Game | Ship attacks on us (units + districts) | Our land units killed by ships | Our ships' attacks | Ship-vs-ship rows, any player | Aircraft rows, any player |
|---|---:|---|---:|---:|---:|
| 30 | 13 | 3 Scouts | 0 | 169 | 0 |
| 31 | 10 | 0 | 0 | 108 | 0 |
| 32 | 15 | 1 Scout | 0 | 161 | 0 |
| 33 | 23 | 3 Scouts, Cuirassier | 0 | 90 | 0 |
| 34 | 5 | 0 | 0 | 220 | 0 |
| 35 | 14 | 3 Scouts | 0 | 113 | 0 |
| 36 | 4 | 0 | 0 | 110 | 0 |
| 37 | 7 | 0 | 0 | 142 | 0 |
| 38 | 22 | Slinger, Abambowa, 2 Field Cannons | 0 | 102 | 0 |
| 39 | 20 | 0 | 6 | 153 | 0 |
| 40 | 3 | 0 | 0 | 154 | 0 |
| 41 | 2 | 0 | 0 | 46 | 0 |
| 42 | **60** | 2 Swordsmen, Catapult, Field Cannon, 2 Scouts | 5 | 286 | 0 |
| 43 | 9 | 2 Scouts | 0 | 125 | 0 |
| 44 (E20-M34) | 7 | Crossbowman | 9 | 86 | 0 |
| 45 | 16 | Tercio | 7 | 107 | 0 |
| 46 | 14 | 3 Scouts | 0 | 95 | 0 |
| 47 | 5 | 1 Scout | 0 | 24 | 0 |

**Air:**
- **No aircraft fought anyone** in games 30-47. Not one CombatLog row has an aircraft type, for any player (`grep BIPLANE|BOMBER|FIGHTER`: none).
- Our games ended between M19 and M66 (the READMEs' titles; game 44 crashed at E21).
- We had Airfields (science flights) in games 32-36 and 40, with empty Aerodromes, and Squadron Commanders with empty armies in games 34 and 40 (UI.log `air:` and `army:` probe lines).
- `QUEUED_INTERCEPTOR`, `QUEUED_GROUND_ATTACKER` and `FIGHTER_REBASED`: 0 in every UI.log.
- The only air combat in our evidence is game 29's: a Russian Bomber, M59-M65, killed a Tank and hit two centres. That is 7 rows in 19 games.

**Sea:** ships attacked us in every game (2-60 rows). They killed more of our land units than land units did: 29 against 27.

---

## Design implications (ranked by expected value from the evidence)

1. **Keep land units out of ships' reach** (A1). The biggest item: 29 of our 56 land losses (52%) and 182 hits in 18 games.
   - **Cheap, first:**
     - (a) An anti-ship ranged want is filled, and counted, only by units that out-gun the strongest ship: Bombard ≥ its Combat. One filter in `planDefence`'s picks (units.js:2340) and in `guardDetail({ranged})`. That keeps Field Cannons, Slingers and Crossbowmen off Frigate and Cog coasts; purchases already rank by Bombard.
     - (b) `formationValue` counts ships for `IN_RANGE` only for such units, and charges `SHIP_REACH` to members in reach of ships they do not out-gun (formation.js:85-92). It is pure, with unit tests.
     - (c) The reach test: `hostilesInReach` + distance to the ship's water ≤ Range.
   - **Then:**
     - (d) Hurt or withdrawing units step inland, out of reach, not along the coast (`defend`'s pre-heal `stepAway`, `escape`).
     - (e) `postFor` skips in-reach tiles off the centre.
   - **Later:**
     - (f) Routes, commanders' posts and Scouts.
   - The centre's melee holder always stays.
2. **A hurt melee unit may take an empty, damaged centre** (A2). Cheap, one condition in `planFormation` or `formationStill` for the HOLD move only. 11 lines, centres down to 20% and 29%; nothing fell.
3. **Naval guards that never sail** (C2). 46 of 186 `naval:` lines had free warships and sent none. Log why first (cheap), then fix. This comes before any Fleet Commander work.
4. **A ranged garrison steps off the centre for a free melee member next to it.** Cheap, no swap needed: two passes. Low value, though: 31 lines, every one with a full-health centre.
5. **Fleet Commanders and their focused attacks** (C2). Moderate cost (training one, packing, the sea focused attacks: the land code's shape). Low value now: we never had one, and our navy peaked at 1-10 ships. Flotilla's sea transport belongs with research/37 §5C.4.
6. **The rest of the air wing** (C1): `ESTABLISH_BASE`, carriers, Fighter Sweep, Ground Attack, Carpet Bomb, the strike preview.
   - **Lowest:** no air combat by anyone in 18 games, and one bomber in 19 games counting game 29.
   - **Cheap and worth keeping:** P-AIR-4 is one `simulateAttack` call before `airAttack`'s request, for whenever a plane of ours finally strikes.
7. **Formations' listed leftovers** (a reserve and room to retreat, screens beyond the first ring, swaps, fronts with no raider in sight): no evidence that any mattered in games 37-47. Skip until a game shows one.
