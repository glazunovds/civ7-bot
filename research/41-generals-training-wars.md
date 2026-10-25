# Generals, training fights and the rest of the war plan

21 October 2026. The plan after the user's answer to the war-plan leftovers (research/37's "Not built" lists). It is based on four research agents' notes in `research/41-notes/`: `commanders.md`, `wars.md`, `politics.md` and `air-sea-formations.md`. Every fact cited below has its source there. No gameplay code has changed yet.

**The user's request** (21 October), paraphrased:
- Prepare a couple of experienced generals. One of them moves quickly, packs a lot of units, and its units can move right after unpacking.
- Give them experience fairly well in every game without losing much to war. Candidates: fighting independents we cannot befriend, or, optionally behind a new checkbox, a war on one close nation much weaker than us (low production and gold).
- Make sure this does not slow us down much, and use politics, deals and Influence to strengthen the war force.
- Also build the leftovers A (ships' reach, formations), B (armies and transport) and C (air and sea extras).

**The order** (each phase lists its tests and UI.log lines):

| Phase | What | Size |
|---|---|---|
| 0 | Probes for the unknowns (XP values and XP per combat, war readiness, rivals' strength, Initiative), UI.log's line cut, and a correction: befriend status −3 often means "not enough Influence" (§2) | Small |
| 1 | Ships' reach: land units stay out of reach of ships they cannot beat; a hurt melee unit may take an empty damaged centre; why free warships were not sent (§3) | Small–medium |
| 2 | Two generals: a vanguard and a bastion, each with its own promotions; a second commander trained; the vanguard posted where fights are; free XP and promotions valued (§4) | Medium |
| 3 | The vanguard's army: packing chosen units, moving packed, unpacking before contact; rapid response to far settlements (§5) | Medium–large |
| 4 | Training in defence: independents' raiders are the training; hurt units swap out of the line, and the generals stand where the fights are (§6) | Medium |
| 5 | A training war on a weak neighbour, behind «Учебная война» (off by default): target, politics, conduct, peace (§7) | Large |
| 6 | Air and sea extras: the air strike preview, Fleet Commanders' attacks; the costly ones only once a game is decided (§8) | Small–medium |

**Status:** Phases 0 and 1 built on 21 October 2026 (root CLAUDE.md gotcha 78; tests in `tests/log-lines.test.mjs`, `ship-reach.test.mjs`, `autopilot-ship-reach.test.mjs` and added to `autopilot-diplomacy`, `autopilot-commanders`, `autopilot-naval`; 21 reverts proven). Its choices beyond §2 and §3:
- P-A5 moves to Phase 3: we never pack an army before then, so it would never fire.
- P-STAT-1 reads only what the game's own UI reads: production and gold a turn (`Stats.getNetYield`, as the diplomacy ribbon), settlements, and land soldiers counted from the players' unit lists (all and seen). The executable's `Stats` getters that no screen calls stay untouched (gotcha 75).
- Out-ranging counts as fighting ships: a Range-2 land unit shoots a Range-1 ship (Galley, Privateer) from two tiles inland, out of its reach (`fightsShips`).
- A damaged, empty centre weighs double in a formation (`HOLD_DAMAGED`): a melee unit screening two approaches next to it was worth as much as holding it, so it stayed put.

**Phase 2** built on 21 October 2026 with game 48's fixes (root CLAUDE.md gotcha 79; tests in `tests/generals.test.mjs`, `autopilot-generals.test.mjs`, `autopilot-settle-early.test.mjs` and added to `autopilot-commanders`, `autopilot-campaign`, `autopilot-formations`, `autopilot-fronts`, `autopilot-diplomacy`, `autopilot-units`; 39 reverts proven). Where it differs from §4:
- **Posts:** both generals take a threatened settlement no other commander holds first, else share the worst one; neither role has a post of its own kind (§4D gave the bastion the worst and the vanguard the next: the same once processed in turn).
- **Switching posts** (game 48): a commander leaves its threatened post for one with `SWITCH_RAIDERS` 3 more raiders or a damaged centre its own lacks; damaged centres come first.
- **The XP rate** counts only while a commander also lacks its role's key promotions; movement while one fights.
- **Not built:** walking with a soldier when hostile units are within 3 (§4F), a Military Academy city first and no training beside a raced wonder (§4C), the `generals:` line's `mission` (no missions before Phase 3).

**Games 51-53 and research/42** (22 October): no hunt started and no training war found a target. Research/42 (built the same day, root gotcha 81) took up Phase 3 (packed marches toward a fight, not the vanguard's missions) and Phase 6's air strike preview and the air commander's strikes; Phase 4 and Fleet Commanders are still not built.

**Game 54** (22 October; research/game54, root gotcha 82): Phase 4's swap of hurt units (`rotateFront`, with the game's `UNITOPERATION_SWAP_UNITS`) and Fleet Commanders built; hunts and training wars now wait for their general (game 54's hunt went without one), and generals keep the fight they stand at and wait at the war fronts.

**Village hunts and Phase 5** built on 22 October 2026 after game 50 (root CLAUDE.md gotcha 80; tests in `tests/field-ops.test.mjs`, `autopilot-hunts.test.mjs`, `autopilot-training-war.test.mjs`; 22 reverts proven). **Decision 1 changed** (the user, after game 50: "we can hunt villages that will not be befriended: not enough points, half past the era, or even one another civilization befriends if that will not cause the war"): §6's rotation of hurt units is not built; hunts are (option «Охота на деревни», on by default). Where Phase 5 differs from §7: no packed army (Phase 3): the army is the soldiers the defence leaves free with a free land commander; no training war in the final age (ideologies are not read); Military Aid and levies are not built; the peace asks for their nearest town when our War Support leads by 3 (their weariness is not read).

§9 records the user's decisions of 21 October, and §10 says how the next games will show whether this worked.

## 1. What the research found

**Commanders** (`41-notes/commanders.md`):
- **How they gain XP:** only commanders gain XP, and only from fights of units within their command radius. The radius is 1, plus 1 with the Merit commendation.
- **Known values:** attacking +1, a ranged combat 1, a kill +2, a city captured 10. Dispersing an independent has its own value, `EXPERIENCE_DISPERSE_INDEPENDENT`.
  - **Unknown values:** the dispersal XP, melee XP, the XP per level and the maximum level.
  - **Why they are unknown:** UI.log cuts every line at 1,022 characters, and our parameter line stops at `EXPERIENCE_MAX_LE`.
- **Our pace:** in games 30-47 no commander of ours held more than 3 promotions. The first two came after a handful of fights against independents; game 38's third took about 25 more.
- **Independents' cap:** `EXPERIENCE_BARB_SOFT_CAP` 1 and `EXPERIENCE_MAX_BARB_LEVEL` 2 limit XP from independents. Probe P-XP-2 will say exactly how.
- **Promotions last:** they survive age changes and a commander's defeat (it comes back after about 10 turns at Online speed).
- **Cost:** the first commander is free with Discipline. The next costs 150 production at Online speed, plus 100 for each further one, with no cap. We never trained or bought one: a second came only from the Terracotta Army (games 42 and 44).
- **Armies:** every army we had stayed empty (`unitCount 0 capacity 4`).
- **The role lock:** `commanderProfile` makes a commander DEFENSIVE after its first Bastion promotion, so a fast general never formed. The only exceptions were a campaign's commander and a Persian Hazarapatis, which starts with Initiative.
- **The fast general takes four promotions:**
  1. Mobility: a packed army moves 4, or 5 with the Commissioned Officers or Materiel card, and ignores hills and minor rivers.
  2. Initiative: units move after unpacking. Whether they may also attack that turn is probe P-A5.
  3. Quartermaster or Recruitment.
  4. Regiments: 6 units instead of 4.
- **Free XP and promotions:**
  - Militaristic leader attribute node 09: +1 promotion for every commander, now and later.
  - The Terracotta Army: a commander, and +25% XP.
  - Commissioned Officers (Exploration): +30% XP and +1 army movement.
  - The militaristic city-state bonuses Age of Heroes, Expeditionary Warfare and Ideological Warfare: +50% XP.
  - Feudal Monarchy's celebration: the highest-level commander gets a promotion.
  - The Modern Military Academy: commanders trained in that city start with +1 promotion.
  - Stories such as White Elephant.

  **Our valuation scores every one of these 0** (`41-notes/politics.md` §3.4).
- **Commanders are fragile alone:** defence 10 in Antiquity, 30-45 later. Game 32's commander died to a Cog at its post, and game 31's to a Quadrireme.

**Independents** (`41-notes/wars.md` §1):
- **Dispersing:** a village is not attacked. A military unit standing on it disperses it (`UNITOPERATION_DISPERSE_INDEPENDENT`), even with no moves left.
  - **The reward:** 100 of the village's yield (30 Influence for a diplomatic one), +10 relationship with every leader within 10 tiles, and the land is freed for settling.
  - **The cost:** −30 with a leader who was befriending it.
  - **Encampments:** crisis encampments can never be befriended and reappear 6 turns later somewhere else.
- **Ours today:** we disperse only empty villages within 4 tiles, and in 18 games we never dispersed one.
- **Befriend status −3** is `PROJECT_NO_VIABLE_TARGETS`: no target passes the game's check. Game 44 logged −3 with the target's failure reason "not enough Influence 71/180", and the game has no separate "not enough Influence" status.
  - Our befriend step reads −3 as "cannot befriend". It sends a unit toward the village and spends the Influence on endeavors instead of saving for it.
  - Games 42-47 logged `befriend: X threatens us; its project status -3` 15-50 times a game.

**War on a major** (`41-notes/wars.md` §2-4, `41-notes/politics.md` §1, §4):
- **Declaring:** the request is `DECLARE_WAR {Player1, Player2, Type}` with `DECLARE_FORMAL_WAR` or `DECLARE_WAR`, checked with `canDeclareWarOn`. It costs no Influence.
- **Formal vs surprise:** a formal war needs a Hostile relationship. Denouncing (55-70 Influence in Antiquity, lasting 10 turns) is how the AI gets there. A surprise war brings War Support penalties and gives the target Influence.
- **War Support:**
  - **What it does:** each point of War Support we hold over the enemy is a point of War Weariness for them: −1 combat strength against us (up to 20), and −3 to −11 Happiness in every one of their settlements, by age and by who founded the settlement. The same holds the other way round.
  - **How it is bought:** `SUPPORT_DIPLOMATIC_ACTION` on the war's event. The price, which `getInfluenceForNextSupport` gives, is very likely 60, then +30 a point in Antiquity (×2 in Exploration, ×3 in Modern).
- **Military Aid:** leaders whose attribute is Militaristic can start it. Our units get +2 combat strength, or both sides +3 when the other leader supports it. In game 47 the AIs never refused it.
- **Peace:**
  - It was possible after 8 turns at our speed. Friedrich refused a white peace for the rest of the age (game 43).
  - In Modern, leaders of opposing ideologies cannot make peace, and leaders sharing one cannot go to war.
  - A peace deal can move settlements (received ones start with no unrest) and gold or Influence lumps.
- **What a war costs:**
  - War Weariness: game 38's Happiness fell from 172 to 101 a turn.
  - Trade routes and endeavors with that leader end.
  - Their allies and city-states join.
  - Captures become towns in unrest that count against our settlement cap.
- **"Much weaker"** must count armies, not only the economy. Both AIs that attacked us had about 40% of our production and as many land units as we had.

**Ships, formations, air** (`41-notes/air-sea-formations.md`):
- **Ships' kills:** ships killed 29 of the 56 land units we lost in games 30-47 (18 Scouts, 11 soldiers). Every soldier among them stood within reach of the ship.
  - We send any ranged unit against ships: `planDefence` does not check strength against them.
  - The formation scores +60 for a unit within range of a ship.
  - Hurt units step along the coast, not inland.
- **Formations:** the four leftovers had no visible effect, and no settlement was lost in games 37-47. What the logs did show:
  - 11 empty, damaged centres (down to 20% and 29%), each with a hurt melee unit next to it that formations would not move;
  - 46 of 186 `naval:` lines with a free warship that was not sent.
- **Air:** no aircraft of any player fought in games 30-47.

## 2. Phase 0: probes and a correction

The unknowns decide numbers in Phases 2, 4 and 5. Each probe is a UI.log line, so the next game answers it while the later phases are being built.

- **UI.log's cut (P-LOG-1):** `log.info` (services/xpl-log.js) splits a message longer than about 950 characters into numbered continuation lines (`… [2/3]`). The `commander parameters:` line, which stops at `EXPERIENCE_MAX_LE` today, then comes out whole, and so does any other long line, such as `autopilot units:` or the queue probe.
- **P-XP-1:** the parameter line also prints `COMBAT_FOCUSED_ATTACK_BASE_BONUS` and `UNIT_PURCHASE_MULTIPLIER`, and the full EXPERIENCE_ list:
  - `EXPERIENCE_NOT_COMBAT_RANGED`, `EXPERIENCE_MAX_LEVEL`, `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER`;
  - `EXPERIENCE_MAXIMUM_ONE_COMBAT`, `EXPERIENCE_DISPERSE_INDEPENDENT`.
- **P-XP-2:** once a turn per commander, `xp: <commander> level L, XP e/n, promotions [..]`. Plus, on every `Combat` event inside a commander's radius, the XP before and after it, the opponent (independent or major), attacker or defender, ranged or melee, and kill or not. This settles the XP per combat, the thresholds and the independents' cap. The commander's level comes from `unit.Experience.getLevel`, `experiencePoints` and `experienceToNextLevel`, as the promotion panel reads them.
- **P-WAR-1:** once a turn, for each met major at peace with us:
  - `canDeclareWarOn(id)` and `canDeclareWarOn(id, WarTypes.FORMAL_WAR)`, with their FailureReasons;
  - `getTotalWarSupportBonusForPlayer` and `getTotalWarSupportBonusForTarget(id, formal)`, and `getWarInfluenceBonusTarget`.

  These are the calls the declare-war popup makes.
- **P-STAT-1:** every 10 turns, for each met major:
  - `Stats.getNumLandUnits()`, `getMaxMeleeStrengthTrained()`, `getMilitaryStrength()`, `getNetYield(YIELD_PRODUCTION)`, `Treasury.goldBalance`;
  - the visible land units and their strongest Combat.

  The names come from the game executable and no game screen calls them, so only the no-argument getters are tried, each in `safe()` (gotcha 75). The visible count is the fallback.
- **P-A5:** after an unpack (`ARMY_UNPACKED`), next pass log each member's moves left and whether `canStart(RANGE_ATTACK)` or an attack preview answers. Logged with and without Initiative.
- **P-DEATH-1:** when a commander dies, its level, XP and promotions before and after the respawn, and the respawn turns.
- **P-BEF-1:** each `befriend: … status N` line adds the target's FailureReasons and our Influence balance.
- **The −3 correction (gotcha 42):**
  - **The rule:** when the befriend project's `targetList1` lists our target with `costYieldD` above our Influence (`DiplomacyTreasury.diplomacyBalance`), the Influence is kept for it (`waiting`, `spent`), as for an AVAILABLE project we cannot afford yet.
  - **Unseen villages:** when the project lists no target, the village stays "not befriendable now" and a unit goes to see it.
  - **Tests:** the fake engine loses its invented `PROJECT_NOT_ENOUGH_INFLUENCE`. The tests use −3 with a target that costs more than we have.

**Tests:** a long log line is split and each part keeps the `[XPL]` prefix; a −3 befriending with an unaffordable target keeps the Influence; −3 with no target does not; endeavors wait while it does.

## 3. Phase 1: ships' reach and the centres (leftover A)

**A ship's reach** (`inShipReach(tile, ship)`, pure, in core/xpl-naval.js): a land tile is within a hostile ship's reach when both hold:
- it is within the ship's BaseMoves + Range (`hostilesInReach`' test);
- it is within the ship's Range of a water tile in the ship's own body of water (`GameplayMap.getAreaId`, as `waterAreas` reads it).

We never ask the engine for an enemy unit's reach (the game asks only for the player's own selected unit; gotcha 75).

**Out-guns** (`outGuns(unit, ship)`): a land unit may stand within reach of a ship when both hold:
- its Bombard ≥ the ship's Combat;
- its Combat ≥ the ship's attack − 10. The attack is RangedCombat for Range 2+, else the larger of Combat and RangedCombat.

Mortars and Heavy Artillery out-gun Frigates; Field Cannons, Field Guns, Slingers and Crossbowmen do not. Against several ships the hits add up, so with two or more ships in reach only a unit with Bombard ≥ 1.2 × their Combat stays.

**Where the rule applies:**
- **Anti-ship picks:** `planDefence` and `guardDetail({ranged})` count an anti-ship want filled only by units that out-gun the strongest ship there.
  - A Field Cannon present no longer fills the want.
  - When no such unit exists, the want goes to the purchase (`bestRangedOrder({ships})` already ranks by Bombard) or to a warship (`warshipsWanted`).
- **Formations** (`formationValue`):
  - `IN_RANGE` counts ships only for a member that out-guns them.
  - A new `SHIP_REACH` −80 applies to any member standing within reach of a ship it does not out-gun, melee units off the centre included.
  - The melee holder on the centre is exempt.
- **Posts** (`postFor`): off the centre, tiles within reach of a ship the unit does not out-gun are skipped. When every tile is, the one within reach of the fewest ships wins.
- **Hurt and withdrawing units** (`defend`'s pre-heal step, `escape`): when ships are the danger, they step inland, out of reach. Game 38's Abambowa healed four turns on one coastal tile.
- **Commanders and Scouts:**
  - `dangerNear` counts a ship's reach for commanders' posts and ways and for Scouts.
  - Scouts were 18 of the 29 units ships killed.
  - Game 32's commander was shot dead at its post by a Cog.

**The empty damaged centre:** `planFormation` may give a hurt melee member (damage < 70) the HOLD move onto an empty, damaged centre next to it. It gets the HOLD move only: never a screen tile, never a move away from the centre. In the 11 lines where this happened, the centres were down to 20-65%.

**Free warships not sent:** `planNavalGuards` writes why each free warship was not sent: no path, beyond `POST_MAX_TURNS`, no free post tile, guarding elsewhere, hurt, or no moves left. The next game shows which, and the fix follows.

**Tests:**
- a Field Cannon is not sent against Frigates, and a Mortar is;
- a formation does not move a Field Cannon into a Frigate's reach;
- a tile 3 from water is out of a Frigate's reach however near the ship;
- a lake ship does not threaten the sea coast;
- a Range-1 Privateer threatens only tiles next to its water;
- a hurt unit by the coast steps inland;
- the melee centre holder stays;
- a hurt melee unit takes the empty damaged centre next to it, and only that tile;
- a commander's post avoids a ship's reach.

**UI.log:**
- the `defence:` line names ships' reach (`in ship reach: …`);
- the `formation:` line shows `SHIP_REACH`;
- the `naval:` line gives `not sent: <ship> (<why>)`.

## 4. Phase 2: two generals

### A. Two roles

- **The roles:** VANGUARD, the fast general who trains on fights and carries an army, and BASTION, who holds the most threatened settlement, as commanders do today.
- **Where the role comes from** (`commanderRole`, replacing `commanderProfile`): from what the commander already took. It needs no memory, because promotions survive ages and defeats.
  - A commander with any Maneuver, Logistics or Assault promotion is a VANGUARD (Initiative, Mobility, Quartermaster, Recruitment, Regiments and the rest).
  - A commander with any Bastion promotion is a BASTION.
  - A commander with neither becomes the VANGUARD when no other land commander of ours is one, else the BASTION. A Hazarapatis or a Noyan is the vanguard first.
- **In games already under way:** a commander that took Steadfast stays the bastion, and the second commander becomes the vanguard.
- **With one commander:** it is the vanguard, and it does the bastion's job at a threatened settlement until a second one comes. The vanguard serves the most threatened settlement when no bastion exists.

### B. Promotions by role

- **VANGUARD:**
  1. Mobility, Initiative, Quartermaster, Regiments: packed speed 4 (5 with Commissioned Officers or Materiel), units move after unpacking, 6 slots, +1 gold for each packed unit. Recruitment stands in for Quartermaster when the game offers only that.
  2. Then Harassment, Pathfinder, Area Denial (the first commendation), and the Merit commendation: radius 2, so more fights give it XP and more units join its focused attacks.
  3. Then Service, Assault's Rout and Storm, and the defensive order.
- **BASTION:** today's `PROMOTION_PREFERENCE` (Bastion and Leadership), with the commendations ordered Order, Merit.

### C. The second commander

A new wanted unit, `QUEUED_COMMANDER` ("commander for the vanguard", in both languages), comes as soon as the gold or the production allows (the user: no settlement count). These must hold:
- Discipline is researched (the game offers the unit: `canStart(BUILD, {UnitType})`);
- our land commanders number fewer than 2, those off the map waiting to respawn counted;
- it is not a non-final age's last `AGE_END_TURNS`.

It is then got one of two ways:
- **Bought:** when the gold above the reserve covers it (`COMMANDER_BUY`, `free()` of the pass budget). The game's price is `canStart(PURCHASE, {UnitType}).Cost`.
- **Trained:** else, where a city trains it within `COMMANDER_TRAIN_TURNS` 8 (150 production at Online speed). That city is not a space city, not one kept for a Launch Pad, and has no raced wonder in production. In Modern, a city with a Military Academy comes first.

It is a plain wanted unit: never moved ahead of an item with progress. No third commander is wanted. Three in Exploration would unlock Prussia; that stays the player's call.

### D. Where the generals stand

**Both generals stand as close to the fight as is safe** (the user). XP comes only from fights within a commander's radius:
- **The XP tile:** at a fight, each general takes the tile, among those safe for it (§4F), whose radius covers the most of our soldiers next to a hostile unit or within range of one. Those are the soldiers who will fight this turn or the next. The other soldiers it covers come second.
- **Two generals at one fight:** they cover different soldiers where they can.

The posts:
- **With a threatened settlement:**
  - The bastion takes the most threatened one, as today.
  - The vanguard takes the next one, or the same one when it is the only one.
  - At its post, `formCommander` places it where its radius covers the most soldiers, never next to a land raider and never within a ship's reach (Phase 1).
- **In peace:** it waits on the centre nearest the most raided border. That is the settlement threatened most often in the last 20 turns, or an exposed one (gotcha 63). It is posted there unless the unhappiness rule sends it elsewhere.
- **Strikes:** when the strike step cannot use every unit (`STRIKE_MAX`), units within a commander's radius strike first, and focused attacks (`commanderAttacks`) run first as today.
- **On a mission:** the vanguard leads the rapid response (§5), the hunts (§6) and the training war (§7).

### E. Free XP and promotions are valued

`core/xpl-effect-value.js` gets `GENERAL_VALUE` levers. They apply only while a commander still lacks its role's first four promotions:

| Effect | Where it comes from | Value |
|---|---|---|
| `EFFECT_GRANT_UNIT_PROMOTION` to commanders | Militaristic node 09, Feudal Monarchy's celebration option, story options | one promotion = `PROMOTION_VALUE` 40 weighted yields, as a lump (÷ `LUMP_TURNS`); node 09 counts each of our commanders and one more to come |
| `EFFECT_ARMY_ADJUST_EXPERIENCE_RATE` | Commissioned Officers, the militaristic tradition, Age of Heroes, Expeditionary Warfare, Ideological Warfare, the Terracotta Army | `XP_RATE_VALUE` 1 per 10% a turn, only while a commander is posted at a threatened settlement, on a hunt or in a training war |
| `EFFECT_ARMY_ADJUST_MOVEMENT_RATE` | Commissioned Officers, Materiel | 2 a turn while the vanguard is on a mission |

The values are deliberately small. They decide ties, and the one-off picks (node 09, the celebration) win when nothing worth more is offered. Before this, every such effect scored 0, and node 09 was never bought.

### F. Safety: the general escapes first

A general is a valuable asset (the user).
- **Escaping first:** a commander in danger moves before any other unit of the pass, so the tiles it needs are still free.
  - **In danger:** it was attacked since our last pass (its damage rose), or a hostile unit that can attack it this coming turn stands in reach and the commander has no soldier of ours between them.
  - **Where to:** the nearest tile out of every hostile unit's reach (melee: its moves + 1; ranged and ships: moves + Range), preferring a tile next to our soldiers or inside one of our settlements. When none is free, it goes onto a tile shared with a soldier of ours (a commander may share a soldier's tile) or into a centre.
- **Never ends a pass exposed:** never alone next to a land raider, and never within reach of a ship it cannot survive. Its post's way and its formation tile check both.
- **On its way:** it walks with or behind a soldier when hostile units are within 3.
- **The record:** probe P-DEATH-1 records any loss, and UI.log `generals: <commander> escaped from x,y to x,y (<why>)`.

**Tests:**
- a commander with Steadfast is a BASTION, and the next one becomes the VANGUARD;
- a lone commander with no promotions is the VANGUARD, and its first promotion is Mobility;
- a Hazarapatis is the vanguard;
- the vanguard's order reaches Regiments before any Bastion promotion;
- a second commander is bought when the free gold covers it, else trained where it takes 8 turns or fewer; never with 2 commanders, never in a space city;
- the vanguard takes the second threatened settlement;
- at a fight a general takes the safe tile covering the most soldiers about to fight;
- a commander attacked last turn, or with a raider in reach and no soldier between them, moves first and out of reach;
- node 09 is bought when only zeros are offered otherwise;
- the XP rate counts only while a commander fights;
- a commander's post avoids a ship's reach.

**UI.log:** `generals: vanguard <type> at x,y (level L, XP e/n, promotions […], mission …); bastion …`, once a turn.

## 5. Phase 3: the vanguard's army (leftover B)

**Gathering** (`gatherArmy`):
- `UNITCOMMAND_ADD_TO_ARMY` is sent on each chosen soldier next to the vanguard: `{}` → Plots, then `{X, Y}` of the commander's tile.
  - Never `PACK_ARMY`: it takes every adjacent unit, garrisons too.
- **Members:**
  - soldiers that defence leaves free (`defenceSupply`'s supply less its posts), not a garrison, a holder, a front guard or a campaign's;
  - damage below 30, melee first, then ranged and siege;
  - up to `combatUnitCapacity`.
- **Gathering point:** the soldiers walk to the vanguard, and those within `GATHER_TURNS` 3 join. The joins are confirmed by `UnitAddedToArmy` or the next pass.

**When to pack** (`packWorthIt`): a mission's destination is far, and packed travel beats walking by at least `PACK_GAIN_TURNS` 2. The count includes:
- the slowest member's walk to the commander;
- a turn to pack;
- the commander's path turns (`Units.getPathTo` of the commander; probe P-A7 compares them with the turns the packed army takes);
- a turn to unpack, none with Initiative.

**Travel:**
- the way stays out of enemy zones of control (packing fails there, and a packed army attacked hard must deploy) and out of ships' reach (a packed army is one target);
- no water, no rough seas;
- each pass re-checks the way, as settlers do.

**Unpacking** (`unpackArmies`, extended to missions): at a staging tile 2-3 from the target with free land around, before hostile units come within 2. Without Initiative it is a turn earlier, because the units cannot move that turn (P-A5). The members are then posted by the mission.

**Rapid response:** the vanguard's first mission.
- **When:** a threatened or exposed settlement whose lack no unit can fill within its deadline on foot (`guardDeadline`, `EXPOSED_HOLD_TURNS`), while the vanguard's packed army arrives in time.
- **Who:** spare soldiers from safe settlements on its way join it.
- **Seen:** game 45's Philadelphia, whose centre fell to 0 while its nearest guard was 8 turns away.
- **Counting:** the army counts as on its way, with its turns, in `guardDetail`, so nothing is bought meanwhile.
- **Exposed towns:** an army passing one drops its holder (`deployMember`, gotcha 63).

**Reinforcements:** native reinforcement (gotcha 67) also feeds the vanguard on a mission. A commander walking to meet reinforcements is not built: native reinforcement already brings them to it.

**Tests:**
- ADD_TO_ARMY per unit, never PACK;
- a garrison is not gathered;
- no packing when walking is as fast;
- no packing within an enemy's zone of control;
- unpacking 2-3 tiles out;
- a unit that unpacked this turn is not added again;
- the rapid response serves a far settlement and its army counts as coming;
- an exposed town on the way gets its holder.

**UI.log:** `army: vanguard <mission>: gathering […], packed N/C, at x,y → x,y in T turns (walking W), unpack at x,y`, plus probes P-A5 and P-A7.

## 6. Phase 4: training in defence

**The user's decision** (21 October): mostly defence. Independents keep sending units, and we fight them as they come; hurt units swap out, and the generals move so they gain as much XP as possible. So there are no hunts on villages: a village that raids us is the training ground. Dispersing an empty village stays as it was (gotcha 27's `goDisperse`; it never fired in 18 games).

**Fighting in the generals' radius:**
- **Strikes:** the strike step (`shootRaiders`, the melee strikes) lets units within a general's radius strike first, before the `SHOTS_MAX` and `STRIKE_MAX` limits.
- **Focused attacks:** a general's Focus Fire and Coordinated Attack, which are several combats in one order, come first as today.
- **The preview still decides:** a melee strike goes only when the game's preview pays (`strikeWorthIt`). Training never takes a loss on purpose.
- **Generals stand at the fight** (§4D): each takes the safe tile whose radius covers the most soldiers about to fight. In peace the vanguard waits at the most raided border.

**Swapping hurt units** (`rotateFront`): at a threatened settlement, a member of its formation hurt `ROTATE_DAMAGE` 40 or more swaps out:
- it withdraws to heal (out of every raider's reach and every ship's, or into a centre);
- a free healthy soldier (damage < 20) that reaches its tile this turn takes it, in the same pass: the hurt unit moves first, then the healthy one;
- with no replacement in reach, the hurt unit still withdraws when a raider can reach it (as `escape` does), else it stays and fortifies;
- the melee holder on the centre swaps only when a healthy melee unit takes the centre in the same pass. A centre is never left empty.

**Raiders kept, not chased:**
- Our soldiers do not chase raiders beyond `THREAT_RADIUS` of our settlements, as today.
- A raider is never left alive next to a settlement on purpose (research/37 §9B): the training is the fights the defence fights anyway, placed in a general's radius.

**XP:** if probe P-XP-2 shows that independents stop paying a commander past level 2, the generals still stand at those fights for the defence, and their XP from then on comes from wars (§7) and free promotions (§4E).

**Tests:**
- a unit within a general's radius strikes before one outside it when the limit allows only one;
- a hurt member withdraws and a healthy one takes its tile in the same pass;
- with no replacement, the hurt member withdraws only when a raider reaches it;
- the centre's holder swaps only for a healthy melee unit;
- no raider beyond THREAT_RADIUS is chased.

**UI.log:**
- the `formation:` line adds `swap <hurt> x,y -> <fresh>`;
- `generals:` gives each general's XP tile and how many soldiers about to fight it covers.

## 7. Phase 5: a training war on a weak neighbour («Учебная война», off by default)

**The setting:**
- `autopilot.trainingWar`, false by default, labelled «Учебная война» / "Training war" in the tab. It works only with «Оборона».
- Off, nothing below runs, and peace is sought as today (gotcha 71's rule).
- It is a third kind of campaign (`kind: WAR`).

### A. The target

The target is checked once a turn, and every condition must hold:
- **Who:** a met major at peace with us, not our ally, with no defensive pact, and not a city-state.
- **Relationship:** Hostile, so `canDeclareWarOn(id, FORMAL_WAR).Success`. An Unfriendly or Neutral one becomes a target after denouncing it (§7B).
- **Weak:**
  - their land soldiers at most half of ours (P-STAT-1's count, else the visible ones);
  - their best melee unit no stronger than ours;
  - their production at most 60% of ours;
  - fewer settlements than we have.
- **Close:** one of their settlements within `TRAINING_REACH` 10 of ours, reachable by land.
- **Alone:** no alliance with a third major (`hasAllied`), and no city-state of theirs within 10 of our settlements.
- **Our side:**
  - no settlement threatened, no other war and no war risk (`assessWar`);
  - our War Support at the declaration ≥ theirs (`getTotalWarSupportBonusForPlayer(id, true)` against `…ForTarget`);
  - Influence for 2 support points (`getInfluenceForNextSupport`) beyond what befriending keeps.
- **Time:**
  - not an age's first 10 turns, nor its last `TRAINING_AGE_END` 20;
  - in Modern only while neither of us has an ideology (with them, one combination forbids war and the other forbids peace);
  - at most one training war per age.
- **The victory:**
  - the outcome is OPEN, with no CHANCE of our own;
  - no rival DANGER that our production must block;
  - not science's final push once a Launch Pad stands or is queued.
- **Ready:** the vanguard and an army of 4 or more soldiers. Nothing is trained or bought for the war (§7E).

### B. Politics

**Before the war:**
- **Military Aid**, only with a Militaristic leader attribute: started with a Friendly or Helpful leader in the turns before and during the war. While it lasts its endeavor value counts as `ENDEAVOR_VALUE` 60 instead of 5.
- **Denouncing** (§9 decision 2): an Unfriendly or Neutral target is denounced, 10 turns apart, until Hostile.
  - **How often:** up to `DENOUNCE_MAX` 2 times, or `DENOUNCE_MAX_WEAK` 4 times when it is very weak: its land soldiers at most a third of ours and its production at most 40% of ours.
  - **Unknown:** whether one denunciation makes it Hostile. P-WAR-1 logs the relationship each turn.

**Declaring:**
- `DECLARE_WAR {Player1, Player2, Type: DIPLOMACY_ACTION_DECLARE_FORMAL_WAR}` after `canStart`, as the declare-war popup sends it (`diplomacy-manager.js`).
- Never a surprise war.

**War Support during the war:**
- When their War Support reaches ours, we buy a point (`SUPPORT_DIPLOMATIC_ACTION {ID: warId, Type: DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true}`, the war found by `getJointEvents`), so that ours stays at least theirs + 1.
- Each point is bought only while its price is at most `WAR_SUPPORT_SHARE` 0.5 of the Influence beyond what befriending keeps.
- Each point we hold over them takes 1 combat strength off their units against us and Happiness off their settlements, which makes a cheap peace likelier.

**Levies:** a city-state soldier of ours within 8 of the vanguard is levied for its army (`levyDefenders`, generalised) rather than trained.

**Cards:** the XP and movement cards (§4E) count during the war. Honor (+3 against independents) counts during a hunt.

### C. Conduct

- The army unpacks at a staging tile on our land or no one's, facing their nearest settlement.
- It fights their units within `TRAINING_DEPTH` 4 tiles of that tile:
  - preview-approved strikes and the vanguard's focused attacks, always within its radius;
  - never chasing deeper, never into a district.
- **Captures (§9 decision 3):** none in battle. A settlement is asked for in the peace deal instead, and one received that way has no unrest.
- Our settlements' defence keeps its own guards: the war takes only the soldiers defence leaves free.

### D. The end

The war ends on the first of these:
- the vanguard has gained `TRAINING_PROMOTIONS` 1 promotion since the war began, and peace is possible (`canMakePeaceWith`; 8 turns at our speed);
- its XP has not moved for 5 turns;
- War Weariness reaches us: `city.Happiness.hasWarWeariness` in any settlement of ours, or their War Support above ours after we bought;
- two units of ours are lost with no kill;
- a third party joins against us;
- a settlement of ours is threatened;
- `TRAINING_MAX_TURNS` 20.

**Peace:** `seekPeace` inspects a deal first. When their War Weariness is 3 or more (P-WAR-1), the deal also asks for their nearest small settlement within our cap's room (§9 decision 3), else a gold lump. Without either it is a white peace, and the AI's refusal sends `seekPeace` into its back-off. Until peace comes the army only defends.

### E. Not much slower: the cost limits

- **No production:** no unit is trained or bought for it, apart from the second commander (§4C), who is wanted anyway. Losses are not replaced for the war.
- **Influence:** what befriending keeps comes first, and each War Support point costs at most half of the rest.
- **The empire's yields** are logged at the start and every turn. A fall in the empire's science + culture + gold + production of more than `TRAINING_YIELD_LOSS` 10% from the start ends the war (WEARINESS).
- **Once per age at most.** Never near a victory, never during science's final push, never in an age's last 20 turns.

**Tests:**
- off by default, nothing starts and peace is sought as today;
- a weak, close, Hostile neighbour alone becomes a target;
- an ally, a strong neighbour, a far one, one with an ally, or Modern with ideologies does not;
- Formal only;
- War Support is bought when theirs equals ours and its price fits;
- the war ends on weariness, a promotion after the minimum, two losses without a kill, a threatened settlement or 20 turns;
- the peace deal asks for a settlement only when their weariness is high and our cap has room;
- nothing is trained for it;
- at most one training war per age.

**UI.log:** `training war: <leader> <state> turn T of 20: support ours a theirs b (price p), weariness w, vanguard XP e/n (+d), units lost l, kills k, empire yields y (start y0)`, once a turn; TRAINING_WAR_DECLARED, TRAINING_WAR_ENDED (with why), WAR_SUPPORT_BOUGHT, DENOUNCED, MILITARY_AID; `training war: none: <why>` once every 10 turns with the checkbox on.

## 8. Phase 6: air and sea extras (leftover C)

The evidence says the air and sea extras matter least: no aircraft fought in 18 games, and our navy peaked at 1-10 ships. So only the cheap parts are built.

- **The air strike preview (P-AIR-4):** `airAttack` asks `simulateAttack` (our `strikeWorthIt`, as for land strikes) before it sends the strike. It strikes only when the trade pays, else it takes the next target.
- **Fleet Commanders:**
  - **Training:** one is trained (`QUEUED_FLEET_COMMANDER`) when we have 3 or more warships and a coastal front lasting 3 turns, or a training war against a coastal target.
  - **Posting:** it stands behind our warships at that front, within reach of the most of them.
  - **Focused attacks:** `UNITCOMMAND_FOCUSED_ATTACK_SEA_LIGHT` and `_HEAVY`, built like the land ones in `commanderAttacks`: two or more ships that can hit the target. Its promotions: Weather Gage first, then the game's order.
- **The costly ones, only once the game is decided** (the user: "pricey after someone wins"; `afterWin` WON or DECIDED, gotcha 72). These are built last, after Phases 0-5 have been proven in games:
  - Squadron bases of our own (`ESTABLISH_BASE`);
  - carriers;
  - the air commanders' Fighter Sweep, Ground Attack and Carpet Bomb;
  - fleet assembly and sea transport (Flotilla), escorts and naval formations;
  - ship upgrades by mission.
- **Not built:** formations' reserve and outer screens (research/37 §6). No game showed a need.

**Tests:**
- an air strike the preview says loses is not sent;
- a Fleet Commander is wanted only with 3 warships at a lasting front;
- a sea focused attack needs two ships that can hit the target.

## 9. The user's decisions (21 October)

1. **Independents:** mostly defence. Their raiders are the training: we fight them as they come, swap hurt units, and move the generals for XP. No hunts on villages (§6).
2. **Denouncing:** allowed twice, or more against a very weak neighbour (§7B).
3. **Captures:** asking for a settlement in the peace deal is allowed (§7C, §7D).
4. **Air and sea:** the cheap parts now. The costly ones act only once the game is decided (§8).
5. **The second commander:** bought or trained as the gold or production allows (§4C).
6. **Added by the user:** every general stands as close to the fight as is safe, and escapes first when in danger or under attack. It is a valuable asset (§4D, §4F).

## 10. How the next games will show it

- **Generals:** the vanguard's level and promotions by age (target: Mobility, Initiative, Quartermaster and Regiments by mid-Exploration), XP per turn, and commanders lost.
- **Ships:** our land units killed by ships (52% of our land losses in games 30-47).
- **Training in defence:** the share of our fights inside a general's radius, swaps made, units lost.
- **Training wars:** turns at war, kills and losses, Influence spent, Happiness and yields lost, the peace's terms.
- **Pace:** the victory turn against games 44-47 (M19-M46), and the empire's yields during each training window.

The phases ship one at a time, each with its tests proven by revert on a scratch copy, a TESTING.md row, and its gotcha in the root CLAUDE.md. Phase 0's probes go into the first build so the game after it answers them.
