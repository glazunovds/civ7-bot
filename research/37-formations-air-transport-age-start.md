# Next military features: age-start defence, armies, formations, air, naval and campaigns

18 October 2026. The implementation plan after research/36, revised after a review of the first handoff against the game's files, game 29's logs and our code. §12 lists what the review changed and why. No gameplay code changed. Read the root, mod and tests CLAUDE.md before implementing; root gotcha 61 describes the defence research/36 built.

**The order** (§10 has the tests and logs of each phase):

| Phase | What | Size |
|---|---|---|
| 1 | Corrections and probes: one melee unit obtained each age (§2: centres defend at its full strength, 20 without one), packed units are not guards, ranged posts in range, rivers, anti-ship defenders by Bombard, aircraft found through their commander and fighters where they cover (§3); UI.log probes for armies, aircraft and reinforcements | Small–medium |
| 2 | Exposed settlements as a standing defence demand, a stricter holder, one packed unit deployed as a town's holder (the age change packs the army), spending by severity (§4, §5C.2) | Medium |
| 3 | Armies: inventory, whole-army unpacking at a front, native reinforcement with deploying on arrival, then land transport (§5) | Medium–large |
| 4 | Formations for units already at a front, sharing the commander's orders (§6) | Large |
| 5 | Air wing: bases, rebasing to cover a front, one ground attacker (§7) | Medium–large |
| 6 | Naval: our ships attack the game's way, naval roles and rivers, coastal fronts; fleets later (§8) | Medium–large |
| 7 | Campaigns behind the «Наступление» checkbox, off by default (defensive): recapture first (§9) | Large |

**Status:** Phase 1 done on 18 October 2026 (root CLAUDE.md gotcha 62; tests in `tests/autopilot-centres.test.mjs` and `autopilot-air.test.mjs`, each proven by revert). Its choices beyond the text below:
- the age's first melee unit is wanted at a gold deficit too (one unit's upkeep against every centre at 20), and only when it beats the centres' defence now (a Warrior's 20 raises nothing);
- the first one is bought or upgraded before training when the gold allows (`buyFirstMelee`), and a queued one that has become needless leaves its queue;
- Ace promotions are not counted in a fighter's range, and remembering enemy air raids waits for probe P-AIR-5.

Phases 1 and 2 answer game 29's losses with what exists, plus the one request that turns a packed unit into a town's holder. Phase 1's probes give Phases 3 and 5 the facts they lack. Phase 4 waits for the `defence:` lines of the next game, since the logs of game 29 cannot show how units stood.

## 1. Where we stand

**Built in research/36** (gotcha 61): guards counted there and on their way with their turns (`guardDetail`), purchases counting only those in time, `planDefence` by urgency with woken reserves, spare guards and ranged units, war fronts (`warFronts`, STAGED), a strong lone raider as an early warning, one purchase pool, training by arrival, air strikes (`airAttack`), interceptors (QUEUED_INTERCEPTOR), the game's command radius, and the `defence:` lines in UI.log.

**Found since, in that code** (§3): packed units count as guards; ranged posts may stand out of range; a land defender may be posted on a navigable river; defenders against ships are ranked by the wrong strength; the air features miscount (enemy air commanders count as aircraft, and fighters cover only 3–6 tiles of their base while ours are counted empire-wide).

**Found since, in the game's rules** (§2): a settlement centre's defence starts over every age at 20, and only a melee unit trained, bought or upgraded in that age raises it (to that unit's full strength). We never obtained one early: game 29's Modern centres defended at 20 for 35 turns.

| Area | Limitation now | Phase |
|---|---|---|
| Centre defence | Carried-over units do not raise it; QUEUED_MELEE counts them, and is off in a peaceful final push | 1 |
| Guard accounting | Packed units count; rivers; ranged out of range; anti-ship ranking | 1 |
| Air | Enemy air commanders count as aircraft; fighters counted empire-wide, trained in any city; no bases, no rebasing | 1, 5 |
| Exposed settlements | Purchase-only, from the free gold, stops at a deficit, `soldierAt` accepts any land soldier | 2 |
| Armies | Packed units are never unpacked; joining an army is only a congestion fallback; no reinforcement | 3 |
| Formations | `planDefence` fills lacks; it never improves positions once a front has enough | 4 |
| Naval | Melee ships likely never attack (MOVE_TO with ATTACK, not the naval attack); no naval roles | 6 |
| Campaigns | None; peace is sought whenever possible. The posture becomes a checkbox, defensive by default (the user, 18 October) | 7 |

Code (function names; line numbers move): `data/xpl-autopilot-units.js` `threatenedSettlements`, `guardDetail`, `guardProgress`, `defenceDemands`, `defenceSupply`, `postFor`, `planDefence`, `reinforce`, `logDefence`, `commanderPost`, `commanderAttacks`, `airAttack`, `hostileAircraftNear`, `strikeRaiders`, `shootRaiders`, `rangedAttack`, `leaveHazard`, `leaveTheOcean`, `stepAway`, `joinArmy`; `data/xpl-autopilot-steps.js` `warFronts`, `unitsWanted` (QUEUED_MELEE, QUEUED_GUARD, QUEUED_INTERCEPTOR), `trainDefenders`, `buyDefenders`, `defenderPurchase`, `bestRangedOrder`, `isSiege`, `soldierAt`, `hostileVillages`, `goldPlan`; `data/xpl-autopilot-choices.js` `seekPeace`, `answerIncomingDeals`.

## 2. A settlement centre's defence starts over every age (Phase 1)

**The rule, as the CombatLog shows it:**
- A settlement centre defends at the full Combat strength of the strongest melee land unit, infantry or cavalry, that its owner trained, bought or (very likely) upgraded **in the current age**. It is 20 while there is none.
- It applies to every centre at once, from the turn the unit is finished.
- The Civilopedia says "minus a set value (10)" (Concepts:229, 708), but the log shows no −10:
  - DefStr matched the strongest such unit's own Combat in 262 of 309 centre-defence rows (every player, both games, all six ages);
  - the other rows were upgrades to exactly that strength, units finished after the combat that turn, and players with no melee unit in the age;
  - the damage fits the full value: at M5 a Line Infantry at 47 against 20 did 80 and 78, where −10 predicts about 132.
- Walls add health, not strength. No data or getter is behind any of it: the rule is engine code.
- **Root gotcha 28 and QUEUED_MELEE's log text** (`best - 10`, "settlement centres defend at") repeat the −10: correct both in Phase 1.

**Game 29** (`Unit vs Location` rows against us):
- **Antiquity:** 20 at A23–A25; 30 from A52 (a Chariot finished at A51); 35 from A56 (a Horseman at A56).
- **Exploration:** a Knight (45) at E30 and a Lancer (50) at E60. No attacks on us.
- **Modern:**
  - **20** at M5–M6: one independent Line Infantry hit Ollantaytambo's centre for 80, then 78, and took it.
  - 65 from M51: the Tank's own Combat. The first Tank was finished at M42, queued by QUEUED_MELEE at M36 (UI line 2714734).
- **A purchase counts** (one case): an AI whose only melee unit of an age was a Mamluk (40) bought at E2 defended at 40 from E4.

**Why carried-over units do not count:** the age change rebuilds every unit as the new age's tier-1 unit of its class, with a new id (`age-transition-post-load.js`, §5B), so none of them was trained in the new age.

**Why the autopilot never trained one:**
- QUEUED_MELEE (`unitsWanted`) asks for one melee unit as strong as the best we can train, but counts the units we have (`unitCount(strong)`). A carried-over unit satisfied it.
- In a peaceful final push it is off altogether (game 16: a Landship and then a Tank took the capital for 15 turns).
- So every Modern centre stood at 20 for 35 turns. Even the new age's first-tier infantry would have raised them to about 50 at once.

**The change:**
- **Remember the strongest melee unit obtained in this age:**
  - our completed units (`CityProductionCompleted {cityID, productionKind: ProductionKind.UNIT, productionItem}`, for our cities);
  - our purchases (we know the type when we send them; `UnitAddedToMap` confirms them);
  - our upgrades (`upgradeUnits` knows the target).

  Keep it in the settings' game memory, keyed by the age (one value, root gotcha 57). Unit ids do not survive the age change, so remember the strength, not a unit.
- **QUEUED_MELEE:** wants one melee unit of the best obtainable strength until one is obtained this age, whatever we have.
  - The first one of an age is wanted in a peaceful final push too. Later, stronger ones only under a threat or a war risk, as now.
  - Never in a space city, front-loaded, as now.
- **The cheapest way first, at an age's start:**
  - an upgrade of a carried unit to the best melee type, when the game offers one (probe P-DEF-3: whether an upgrade counts);
  - else a purchase, when a settlement is threatened or exposed (§4) or the gold is free;
  - else training in the quickest non-space city.
- **The first melee unit of an age** should be the strongest the game offers, not the cheapest adequate one: it sets every centre's defence.

**Tests:**
- a carried-over strong melee unit does not satisfy the want at an age's start;
- a unit completed, bought or upgraded this age does;
- a peaceful final push still trains the first one, not the second;
- no space city trains it;
- the memory resets with the age, not with a load.

**Probes:** P-DEF-2 (DefStr after the first melee unit of an age, trained and bought) and P-DEF-3 (after an upgrade).

## 3. Corrections to the defence built in research/36 (Phase 1)

### A. Packed units are not guards

Units assembled in a commander's army "are vulnerable and cannot attack until the units have been deployed" (Concepts:2173). None of our guard checks reads `isOnMap`: `guardDetail` (present guards), the guard strength in `threatenedSettlements` (`strong`), `soldierAt` (exposed settlements) and `frontGuards`. A Cuirassier packed in a commander on a centre counts as its guard.

**The change:** these checks count only units on the map (`isOnMap !== false`), not commanders, not embarked (`onWater`). `soldierRoom` keeps counting every soldier (it limits upkeep, not cover). §5 adds the packed units as a supply that unpacking turns into guards.

**Test:** a packed melee unit (isOnMap false) at the centre: the settlement is short of a guard, and `strong` sees no guard.

### B. Ranged posts within range

`postFor` scores ranged posts by `- back * 40` (the distance from the nearest raider) with no cap, so a post on the far side of the settlement may leave every raider out of range.

**The change:** prefer posts within the unit's `Unit_Stats.Range` of at least one raider; among those, the farthest from the raiders; off the centre, as now. With no raider known (ships seen and gone), the post next to the centre. `canStart(RANGE_ATTACK)` after the move decides the shot, as now.

**Test:** raiders on one side; the archer's post is within range 2 of one of them, and behind the centre.

### C. Navigable rivers

A navigable river is not `GameplayMap.isWater` (gotcha 4). `postFor` (new in research/36), `leaveHazard`, `stepAway` and the detours exclude `isWater` tiles only, so a land unit may be sent onto a river, where it is embarked and cannot fight. Ships are filtered the other way (`leaveTheOcean`, `leaveHazard`: a ship's refuge must be `isWater`, so a river tile is never one).

**The change:** land units use `onWater` (water or navigable river) everywhere a tile is picked; ships accept water or a navigable river. The game's UI reads a river's kind with `GameplayMap.getRiverType(x, y)` against `RiverTypes.RIVER_NAVIGABLE`, and a unit's state with `unit.isEmbarked`: prefer `isEmbarked` for "this land unit is on water now" (a bridge lets land units cross without embarking, §8F).

**Test:** a post on a navigable river tile is never chosen; a ship on a river leaving a hazard may move along the river.

### D. Defenders against ships by Bombard

"Both ranged and siege land units use their bombard strength when attacking naval units" (Concepts:344; also :1216); no data implements it. Bombard against ships, by age:
- Antiquity: Slinger 5, Archer 10, Ballista **30**.
- Exploration: Heavy Archer 20, Crossbowman 25, Arquebusier 30; Catapult **40**, Trebuchet **45**, Bombard **50**.
- Modern: Field Cannon 35, Field Gun 40, AT Gun 45; Mortar **55**, Heavy Artillery **60**, Assault Gun **65**.

`bestRangedOrder` ranks by RangedCombat, and `isRangedGuard` leaves siege units out (`isSiege`: game 8's Catapult was bought as a land defender).

**The change:**
- Against ships (a threat with `ships` > 0), the ranged defender trained or bought is the one with the highest Bombard, siege units included.
- The ranged guards counted against ships include siege units.
- Against land raiders nothing changes: no siege unit as a defender, the melee holder on the centre, ranged support by RangedCombat.

**Test:** two galleys and a Ballista on sale next to an Archer: the Ballista is bought; against a land raider, the Archer (or the melee unit).

### E. Aircraft: find them through their commander; fighters where they cover

- **A bug:** `hostileAircraftNear` counts every unit of Domain `DOMAIN_AIR`, and the Aerodrome Commander (granted by every Airfield, static) and the Squadron Commander are air units too. So any visible enemy Airfield asks for interceptors, with no plane anywhere. Count only CORE_CLASS_MILITARY units that are not commanders (the tags `UNIT_CLASS_INTERCEPTOR`, `_GROUND_ATTACKER`, `_BOMBER` are clean; the Squadron Commander also carries `UNIT_CLASS_AIRCRAFT`).
- "Air Units are always packed in a Commander" (Concepts:1930). An aircraft's own location is very likely its base tile; where it is absent, take `Armies.get(unit.armyId).location` (§7A), and keep the visible-tile check there. A bomber threatens settlements within its `Unit_Stats.Range` (8–12) of its base.
- Fighters intercept within a radius of their base: 3, +1 for an Airfield's commander, +1 after the Flight mastery, +1 for the Ace promotion (§7A). QUEUED_INTERCEPTOR counts fighters empire-wide and trains them in any city. Count only fighters whose base covers a threatened or bombed settlement, and train them in the Airfield city nearest to it whose commander has a free slot (`combatUnitCapacity - unitCount`). None: no plane, and UI.log says so once a turn.
- Our own air strikes (`shootRaiders` → `airAttack`) already ignore `isOnMap`; keep that.
- Remember an enemy air attack on our settlements for a few turns, not only aircraft in sight: a bomber based out of sight still raids. How the game reports such an attack to us is probe P-AIR-5 (the `Combat` event's payload); until then, aircraft in sight only.

**Tests:** an enemy Airfield's commander alone asks for no fighter; an enemy bomber packed in a commander 5 tiles from Front is seen; a fighter based 8 tiles away does not cover Front, so one is wanted where an Airfield stands nearer.

### F. Probes for the next phases (UI.log only; §11C has the full list)

- P-A1: each of our commanders' armies on an age's first turns and when it changes: commander type and tile, `getUnitIds()` with each member's type, `isOnMap`, location and activity, and the capacity.
- P-AIR-1, P-AIR-2, P-AIR-5: aircraft, ours and visible enemies' (type, commander or not, `isOnMap`, own location, `armyId`, the army's tile); fighter `canStart` in Airfield cities; the `Combat` event's payload.
- P-DEF-1: melee units completed (`CityProductionCompleted`), bought and upgraded, with the age.
- P-A3: reinforcements in transit (commander id, start location, the ETA each turn), when any appear.

## 4. Exposed settlements as a standing demand (Phase 2)

### A. The code problem

The exposed-settlement branch of `buyDefenders`:
- looks for seen hostile villages within `EXPOSED_RADIUS`;
- stops entirely at an income below zero;
- skips a settlement where `soldierAt` finds any land soldier within one tile;
- buys only from `budget.free()`.

`soldierAt` accepts an Archer, a siege unit, a badly hurt unit or a packed one (§3A). Nothing moves an existing reserve to an exposed settlement that is not formally threatened. A city's garrison is the first soldier standing on its tile, not a chosen holder.

Game 29: independent player 9 was at war with us from the age change. Ollantaytambo was exposed from M1, threatened from M4, and its centre fell at M6. At M4 the PADS bank held 470 of 711 gold, so the free gold could not buy a garrison.

The age change explains why such towns stand empty: it places `NumDefenders` defenders (Exploration 6, Modern 9) on the settlements by population, largest first, and packs the rest of the army into commanders on settlement centres (§5B). A small town usually gets none.

### B. A standing demand, not a one-off age-start pass

Exposure is live state. Evaluate it every pass, like `warFronts`, and nothing has to be reconciled after a load or a late start. The first handoff's persisted marker per game and age is not needed: the settings' memory holds at most 20 plain values (root gotcha 57), and jobs derived from the map each pass cannot go stale. The only per-age memory needed is §2's strongest melee unit obtained.

**What counts as exposed:**
- within `EXPOSED_RADIUS` of a seen village at war with us;
- a visible attacker is a threat (`threatenedSettlements`), not an exposure;
- the previous age's city-states that return as villages at war (root gotcha 28) count from the first turn.

**Its place in `planDefence`:** below threatened settlements, above war fronts. Each exposed settlement wants one **holder**: a healthy (damage below `ESCAPE_DAMAGE`) melee soldier on the map, on or next to the centre. An Archer, a siege unit, a commander, an embarked or packed unit and a unit in transit are not holders.

### C. How a holder comes, in order

1. A reserve that arrives before danger (`planDefence`'s supply and posts).
2. One packed unit deployed from a commander nearby (`REMOVE_FROM_ARMY`, §5C.2), when that leaves the rest of the army safe. At an age's start this is usually the only reserve: the game packs every unit beyond its `NumDefenders` into commanders.
3. An upgrade of a suitable defender there (`upgradeUnits` already prefers threatened settlements' units; add exposed ones).
4. A purchase there:
   - the strongest melee unit when it is the first of the age (§2);
   - else the cheapest melee unit that holds until help arrives.
5. Training, only when it arrives in time (`trainDefenders`' arrival rule).

**Spending by severity:**
- A visible attacker makes the settlement threatened, and the emergency rules of research/36 apply: all the gold less 3 turns of a deficit.
- Mere proximity to a village spends the free gold. A deficit no longer stops it outright: the purchase still waits for the free gold, so a deficit with a large reserve buys nothing, and a small deficit with free gold buys the holder.
- Proximity to a stationary village is never an emergency.

### D. Over several turns

- A settlement without a holder stays in the demand every pass until it has one; no job expires after a fixed number of turns.
- Foundings, captures and changed relationships change the list by themselves (it is recomputed).
- Unpacking (Phase 3) and reinforcement must not take an exposed settlement's holder away.

**Tests:**
- the autopilot switched on at M3: exposed towns get holders;
- an Archer next to the centre does not count;
- a damaged, packed or embarked unit does not count;
- a reserve that arrives in time is sent instead of buying;
- a visible attacker uses the emergency pool despite a savings goal;
- a neutral village causes nothing;
- the next pass buys nothing twice.

## 5. Armies: inventory, unpacking, reinforcement, land transport (Phase 3)

### A. What the game does with armies (from its files; §11 has the sources)

**The API the game's UI uses:**
- A unit's `armyId` (a ComponentID), and `Armies.get(armyId)` with `getUnitIds()`, `unitCount`, `combatUnitCapacity`, `localId` (a number) and `location`.
  - There is no `commanderId`. The game finds an army's commander by walking the player's units for `isCommanderUnit` and reading their `armyId`.
  - A member is matched by comparing its `armyId` with the commander's (`sameId`, gotcha 33).
  - Whether `unitCount` counts the commander is unknown: the flag code and the age-transition code disagree.
- Packed members are very likely off the map (`isOnMap` false: the game draws no flag for them), with their commander's tile as their location. A reinforcement in transit is off the map (verified).

**Requests** (`Game.UnitCommands` unless noted; Plots are plot indices):

| Command | Sent on | Shape |
|---|---|---|
| `UNITCOMMAND_UNPACK_ARMY` "Deploy stacked Units into adjacent tiles" | the commander | `canStart({})` → Plots, send `{X, Y}` |
| `UNITCOMMAND_REMOVE_FROM_ARMY` "Leave Commander" | **one packed member** | `{}` → Plots, send `{X, Y}`: a deploy of one unit |
| `UNITCOMMAND_PACK_ARMY` "Gather adjacent Units" | the commander | NO_TARGET; no member list |
| `UNITCOMMAND_ADD_TO_ARMY` | the soldier | `{}` → Plots, send the commander's plot (our `joinArmy` matches) |
| `UNITCOMMAND_ARMY_OVERRUN` | the commander | `{X, Y}` of the target (the only packed attack, about 5:1 odds) |
| `UNITOPERATION_REINFORCE_ARMY` (`Game.UnitOperations`) | the soldier | `{}` → Plots (eligible commanders), send the commander's plot |

- **Do not trust the commander menu's look:** it always shows Pack and Unpack as available (a TODO in the game's code). Call `canStart` every time.
- **`UNITOPERATION_CALL_REINFORCEMENTS`** (on the commander) only opens a mode that draws a path; no UI file sends it. Reinforce from the soldier.
- **Failure reasons:**
  - `ALREADY_UNPACKED_THIS_TURN`: no re-adding the turn a unit deployed;
  - `CANNOT_PACK_IN_ZOC`: no assembling inside an enemy army's zone of control;
  - `ADD_TO_ARMY_NO_ROOM` and `MAX_COMBAT_UNITS`;
  - `LEAVE_ARMY_NO_LOCATION`;
  - `FORCE_MARCH_NO_ACTIONS_REMAINING`: one army special action a turn;
  - the reinforcement's `NO_ELIGIBLE_COMMANDER`, which reads "at least {1_MinimumDistance} tiles away … no more than {2_ReinforceCap} reinforcing" (6 and 4 in the text, engine constants: let `canStart` decide), plus `NOT_WHEN_EMBARKED`, `NOT_WHEN_DAMAGED`, `NEED_FULL_MOVEMENT` and `NEED_FRIENDLY_TERRITORY`.

**Reinforcement:**
- The unit travels off the map at its base movement, ignoring terrain.
- **On arrival it joins the army packed** if there is room, else it enters a nearby tile (Concepts:1160; AdvisorText:1872). So it needs deploying before it can attack.
- The ETA (`player.Armies.getUnitReinforcementETA`) is shown raw in a turn badge: very likely turns left (probe P-A3).
- Failures come as `NOTIFICATION_REINFORCEMENTS_FAILED` (no path, or the commander killed).

**Combat:**
- Packed units cannot attack ("cannot attack until the units have been deployed", Concepts:2173; "You must deploy your troops in order to attack"), except an overrun.
- A packed army defends as one unit with combined strength and unpacks when badly hurt. How that strength is computed is unknown.
- Army commanders exert a zone of control. A deploy needs free adjacent tiles; Bermuda-type features prevent unpacking.
- Initiative gives `ABILITY_MOVE_AFTER_UNPACKING`, so without it deployed units very likely cannot move that turn. Whether they can attack is probe P-A5.
- A dead commander respawns after 20 turns, with its location at x < 0 meanwhile.

**Capacity:** 4 by default, separate military and civilian slots. Regiments (+2, and faster reinforcement) is the only land modifier; no tech or civic changes it.

### B. The age change packs part of our army (the default "Regroup" setting)

The game's `age-transition-post-load.js`:
1. **Every unit is rebuilt** from a "shadow" as the new age's tier-1 unit of its class, **with a new id**. Nothing remembered by unit id survives an age change.
2. **Units packed before stay packed:** they are recreated at their commander's tile.
3. **Defenders:** `GameInfo.Ages.lookup(Game.age).NumDefenders` of them (Exploration 6, Modern 9), round-robin over the settlements sorted by **population, largest first**. Each is the nearest land soldier, created on the centre; free Infantry fill in when short.
4. **Commanders** (by XP) are moved to the settlement nearest them and filled up with the nearest remaining units, **packed**.
5. **Every other unit is dropped.**

So at an age's start the armies stand packed on settlement centres, and **small towns usually get no defender**: Ollantaytambo's case (§4). A packed army in the capital is not a garrison until deployed. The setting is `Configuration.getGame().getValue("AgeTransitionSettingName")` (`AGE_TRANSITION_SETTING_KEEP_MORE` is Continuity: units recreated in place).

The same script caps the treasury at 3,000 gold (game-speed adjusted; 6,000 or 9,000 under Continuity) and Influence at 500. Root gotcha 31's "gold carries over in full" holds only below the cap: correct it when Phase 3 lands.

### C. What to build, in order

1. **The inventory** (each pass, from live state):
   - each commander, its army's members (types, roles, health), capacity left, tile, and whether it is at a front;
   - the reinforcements in transit (`getUnitReinforcementCommanderId` ≠ −1);
   - **packed members are supply, not guards** (§3A).
2. **Deploy where it matters:** at an age's start, and whenever a packed army stands in or near a threatened or exposed settlement, deploy toward the need.
   - **One holder for a centre or a nearby town (built in Phase 2):** `REMOVE_FROM_ARMY` on that member, onto the offered plot nearest the need; the rest stay packed. It then walks to the town as `planDefence` posts it. UI.log (probe P-A2) records the plot sent and where the unit stood the next pass.
   - The whole army when its front is threatened: `UNPACK_ARMY` toward the enemy side. The formation pass (Phase 4) then arranges it; until then `planDefence` posts its units.
   - Never deploy into a zone where they would stand isolated; never two deploy requests for one army in a pass; re-read members and tiles after the event.
3. **Native reinforcement for far fronts:**
   - **When:** for a unit 6+ tiles from a front commander, in our territory, at full health and movement, and when the ETA plus deploying beats walking (`planDefence`'s post turns).
   - **Accounting:** a unit in transit counts as incoming with that ETA (`guardDetail`), never as present. It arrives packed, so the commander deploys it on arrival (step 2).
   - **Never** take the only holder of a settlement; never cross open ocean; at most what `canStart` allows.
   - On `NOTIFICATION_REINFORCEMENTS_FAILED` or a commander lost, re-plan from the live state.
4. **Land transport by packing, last and measured:**
   - **The journey:** assigned → gathering (ADD_TO_ARMY per unit; PACK takes every adjacent unit, garrisons included, so use it only when that is right) → packed → travelling (a safe route, a deployment area free at the end) → deploying before contact → forming → holding.
   - **Pack before contact:** packing fails in an enemy army's zone of control.
   - **Cooldowns:** a unit that deployed this turn cannot rejoin.
   - **Costs:** count gathering, packing and deploying in the ETA; a short walk is faster on foot.

### D. Shared rules

- **One owner of each unit's orders in a pass:** defence posts, deploys, reinforcement and transport never send two orders to one unit. The commander's orders belong to one place (`postCommander` today; the formation pass in Phase 4).
- **Confirmation:** after each request wait for `UnitAddedToArmy` / `UnitRemovedFromArmy` / `UnitAddedToMap` (their payload: probe P-A4) or the next pass, before a dependent request.
- **The age change gives new ids:** nothing keyed by unit id may be expected to survive it (our goals, `restedByUs`).

**Tests:**
- a packed member is not a guard, and is a supply;
- a member deployed by `REMOVE_FROM_ARMY` onto an exposed town's centre;
- no second deploy request for one army in a pass;
- reinforcement's `localId` is compared with the army's `localId`, not a ComponentID;
- a unit in transit counts as incoming, not present;
- an arriving reinforcement is deployed;
- the only holder is never sent;
- the same-turn re-pack is not tried;
- no deploy space: the army waits;
- a lost commander re-plans the units sent to it.

## 6. Formations for units already at a front (Phase 4)

`planDefence` decides which front each unit goes to; it fills lacks and stops. A formation pass arranges the units already at a front, including the commander, after that allocation. Build it after the next game's `defence:` lines show how posts behave (game 29's logs cannot show how units stood).

### A. Fronts as groups

- **Stable identity:** a front gets an id, its settlements, its enemy owners and its approaches. `warFronts` keeps one `leader` per settlement today; keep a set of owners (coalitions: game 29's city-states 9 and 15 joined Russia at the declaration).
- **Grouping by approach:** two opponents coming through one pass share a group; one opponent attacking from opposite sides makes two.
- **Commanders are optional:** a group without one still forms. More groups than commanders must work.

### B. Facing the approach

- **The approaches:** estimate them from visible enemies and reachable routes to the anchor settlement. Split them into sectors rather than averaging opposite directions.
- **Roles, in this order:**
  1. a melee holder on the centre or the capture-critical approach;
  2. durable melee or counters on the enemy-facing edge and the choke points;
  3. ranged support behind them, with a target in range (§3B);
  4. the commander, protected, where its actual command area covers the most combatants (not necessarily the middle of a ring);
  5. a reserve, and room to retreat; never every free tile.
- **The commander's two jobs:** its Happiness bonus in an unhappy settlement is an opportunity cost, below imminent survival.

### C. Scoring

- **Melee:** reward covering the capture routes and surviving, not only standing close to the settlement (today: `near * 100 + far`).
- **Ranged:** must keep a target in range (§3B fixes the basic case).
- **The change, not the position:** score the move against travel, the fortification lost, attacks lost this turn, gaps opened and commander exposure. Stay put when the gain is small: a formation that shuffles fights worse than a stationary imperfect one.
- **Hard constraints:** legal terrain, hazards, occupancy by formation class (a commander and a soldier may share a tile: check the engine, not `roomForSoldier`), safe routes, no accidental war.
- **The command radius:** `Units.getCommandRadiusPlots(commander.id)` is the commander's current footprint, not a query for another tile. Estimate a planned post's coverage conservatively and re-read it after the move.

### D. Moving without gaps

- **Reservations:** destinations and units for the whole pass.
- **Order:** move the units that open required tiles first; never leave a critical holder's tile until its replacement stands there; wait for a move to show before a dependent one.
- **Fallback:** if a swap cannot be done safely this turn, hold.
- **One owner of the commander's orders:** the formation pass takes over `commanderPost` for a commander at a front.
- **Search:** a few candidate tiles per unit, deterministic tie-breaks, one small improvement pass, the turn's paths and threat data reused. No combinatorial search, no combat preview per unit and tile.
- **A first test formation, not a quota:** two screen units, one ranged unit, one reserve and a commander. Never train missing slots for it.

**Tests:**
- guards enough but the ranged unit out of range: moved;
- enemies on opposite sides: two groups;
- a commander's tile legality;
- a single choke tile;
- a replacement that cannot arrive this turn: the holder stays;
- a tiny score gain: nobody moves.

## 7. Air wing (Phase 5)

Phase 1 (§3E) makes the shipped air features see and count correctly. This phase moves aircraft where they help. The facts below come from the game's files (§11 has the sources); the probes P-AIR-1 to P-AIR-4 settle the rest.

### A. How aircraft work

- **Always in a commander:** "Air Units are always packed in a Commander … must use Rebase to move from one Commander to another" (Concepts:1930). The commander is an Aerodrome Commander, a Squadron Commander or a carrier (Concepts:1248).
  - The game draws no flag for a plane: an enemy's planes show only as extra layers on its commander's flag (army-commander-flags.js reads `Armies.get(unit.armyId).unitCount`, for foreign commanders too).
  - A plane's own `location` is very likely its base tile (the game draws its attack preview from it), with `Armies.get(armyId).location` as the fallback. Probe P-AIR-1 checks both, and whether a foreign army's `getUnitIds()` can be read.
- **The commanders:**
  - `UNIT_AERODROME_COMMANDER`: static, granted by every Airfield (`MOD_AERODROME_SETUP_COMMANDER`), not trainable.
  - `UNIT_SQUADRON_COMMANDER`: trained, 140 production plus 140 a copy, after Flight; one free from Trans-Oceanic Flight. It sets up a base anywhere flat, with no urban district and not owned by another player (`UNITOPERATION_ESTABLISH_BASE`).
  - `UNIT_CARRIER_COMMANDER`: a sea commander, 160 plus 160, after Mobilization.
  - **Both air commanders have Domain `DOMAIN_AIR`.** The Squadron Commander is even tagged `UNIT_CLASS_AIRCRAFT`. A plane is a CORE_CLASS_MILITARY air unit that is not a commander; the tags `UNIT_CLASS_INTERCEPTOR`, `UNIT_CLASS_GROUND_ATTACKER` and `UNIT_CLASS_BOMBER` are clean.
- **Capacity:**
  - `army.combatUnitCapacity` less `army.unitCount` (both read by the game's army panel). The base is not in the data; the generic figure is 4, plus 2 from Advanced Landing Ground and from Flight Deck.
  - A plane can be trained or bought only where an Airfield stands and its commander has a free slot (Concepts:1248, 341). It appears at the Airfield.
  - What `canStart` answers when the slots are full is probe P-AIR-2.
- **Interception:**
  - Passive: no patrol or intercept operation exists.
  - It works from a city's Aerodrome, and attacking does not end it.
  - The range is measured from the base: 3 by default (text only), +1 for an Airfield's commander, +1 after the Flight mastery, +1 for the Ace promotion. All are `EFFECT_ARMY_ADJUST_AIR_INTERCEPTION_RANGE` on the commander.
  - No getter is known; probe P-AIR-3 lists the army object's properties.
- **Attacks:**
  - `UNITOPERATION_AIR_ATTACK` (ours matches the game's air attack mode).
  - Range is very likely `Unit_Stats.Range` (8–12; the unique Zero and Stuka differ from their movement). The returned Plots decide.
  - Roles: Combat is air-to-air, RangedCombat is against units, Bombard is against districts.
    - Fighters (Biplane 35, Fighter 40 ranged) are weak against units.
    - Ground attackers (Trench Fighter 55, Dive Bomber 60) are made for them.
    - Bombers (Bombard 65, 70) hit districts. They are also tagged `UNIT_CLASS_SIEGE`, so a siege filter catches them.
- **Commander commands** (`Game.UnitCommands`, `{}` → Plots → `{X, Y}`): `UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR` (Fighter Sweep), `_AIR_TO_LAND` (Ground Attack), `_AIR_BOMB` (Carpet Bomb). `UNITOPERATION_AERIAL_RECON` reveals within 8 tiles (a charge a turn).
- **Rebasing:** sent by the plane, `UNITOPERATION_REBASE` (`{}` → Plots → `{X, Y}`), within twice its movement, to an Aerodrome, an established Squadron Commander or a carrier.
- **Preview:** `simulateAttackAsync` is generic and its result has `PreviewTextInterceptor`, so it very likely works for planes (probe P-AIR-4 compares it with the `Combat` event).
- **No anti-air ground units exist:** only fighters counter aircraft.
- **Costs:**
  - Airfield: 840 production, a full flat tile, +9 Production, upkeep 4 Gold and 4 Happiness.
  - Planes: 340–430 production, upkeep 9–18 Gold.
- **The Modern AI** keeps an aircraft in its city-defence and city-attack teams and rebases them toward targets.

### B. Base inventory and coverage

- **The inventory:**
  - for each of our air commanders: type, tile (`army.location`), members (`getUnitIds()`, each plane's role), capacity left, and its interception range by the formula above;
  - incoming rebases reserved within the pass, so two planes never take the last slot.
- **A fighter covers** the settlements within its base's interception range. A plane on the far side of the map covers nothing here.
- **Wants:**
  - Cover is wanted where an enemy air attack hit us lately (§3E's memory) or enemy bombers are based within their Range of our settlements, and above all over a Launch Pad city near the goal.
  - Prefer an existing safe base that covers the front (an Airfield city) over a new Squadron base.
  - Rebase a fighter there when its old base needs it less.
  - Never rebase back and forth for one passing target.

### C. Ground attackers by role

- **The role:** `UNIT_CLASS_GROUND_ATTACKER` (the Trench Fighter, the Dive Bomber, the Stuka) hits land and naval units; rank by RangedCombat and the preview, never by melee Combat or table order.
- **A bounded experiment:**
  - one ground attacker at a lasting land or naval front with a usable base;
  - a second only while valuable targets persist and the upkeep is affordable;
  - fighter cover first while enemy air is credible.
- **Production needs a base:** an Airfield in that city with a free slot. Planning an Airfield for defence is a separate decision from the science flights' Airfield (`siteHelps` judges only the Innovation race). Weigh the Airfield, the plane, the time to the front and the upkeep against the survival deadline and the science work displaced.

### D. Targets

`airAttack` today prefers enemies close to our settlements, then damaged ones. Add each target's threat:
- an attacker of a settlement before a bystander;
- the expected damage (the preview, once P-AIR-4 confirms it);
- the risk of interception by enemy fighters near the target;
- whether the strike prevents a capture.

A ground attacker should never be spent on an irrelevant target because its damage counter is larger.

**Tests:**
- a packed or off-map plane can still strike;
- an enemy Airfield's commander is not a hostile aircraft;
- a fighter at a remote base does not cover the front;
- one slot left and two planes: one rebase;
- a rejected rebase or a lost base is re-planned, not resent;
- interception range differs from attack range;
- a ground attacker picks the settlement's attacker over a damaged bystander;
- no Airfield in reach: no plane wanted, and UI.log says why.

## 8. Naval (Phase 6)

Extend the same assignment system to ships, with naval movement, targeting and commanders kept apart from land rules. Defensive work comes first; offensive naval tasks belong to §9's campaigns.

### A. First: our ships attack the game's way

- **How the game attacks with a ship** (`world-input.js` `requestMoveOperation`): a click on a target tries, in order:
  1. `UNITOPERATION_NAVAL_ATTACK` (`canStart` with `{X, Y, Modifiers: NONE}`, sent with `ATTACK + MOVE_IGNORE_UNEXPLORED_DESTINATION`);
  2. `AIR_ATTACK`;
  3. `Game.Combat.testAttackInto`: on `COMBAT_RANGED`, `RANGE_ATTACK`;
  4. an army overrun;
  5. a swap;
  6. `MOVE_TO` with ATTACK.

  The naval attack mode asks `canStart(id, "UNITOPERATION_NAVAL_ATTACK", {}, false).Plots` and sends `{X, Y}`. `Units.getReachableTargets(id)` lists the tiles a unit can attack.
- **Who uses what** (CombatLog, inferred):
  - melee-class ships (Galley, Quadrireme, Privateer) hit land units with their RangedCombat, centres with their Bombard, and ships and embarked units in melee;
  - ranged ships (Cog, Carrack, Frigate, Dreadnought, Battleship) only shoot.
  - NAVAL_ATTACK and RANGE_ATTACK share one hotkey, so a ship has one or the other.
- **Our code:**
  - `shootRaiders` takes every warship (all have RangedCombat), but `rangedAttack` asks only for RANGE_ATTACK, which melee ships very likely lack.
  - `strikeRaiders` lets melee ships through but needs MOVE_TO with ATTACK on a neighbouring raider, and a ship cannot move onto land.
  - So **our melee ships never hit land raiders**, and maybe never ships either (whether MOVE_TO with ATTACK works ship against ship is unknown).
  - `commanderAttacks` knows only the land focused attacks; the sea ones are `UNITCOMMAND_FOCUSED_ATTACK_SEA_MELEE` and `_SEA_RANGED` (same pattern).
  - We owned no warship in either logged game, so there is no evidence from our side.
- **The change** (the first, cheap step of this phase):
  - dispatch as `world-input.js` does: NAVAL_ATTACK first (`canStart` with the target), else RANGE_ATTACK, else MOVE_TO with ATTACK;
  - take the candidates from `Units.getReachableTargets`;
  - only hostile soldiers near our settlements, as `shootRaiders` does.
- **Probe:** for one melee and one ranged ship, `canStart` of the three requests with `{}` and with a target; then the CombatLog.
- **Tags:** the Modern light ships (Ironclad, Cruiser, Destroyer) are tagged `LIGHT` and `SKIRMISH`, not `MELEE`. Mikasa is `SIEGE` but not `RANGED`. A classifier keyed on `UNIT_CLASS_MELEE` or `_RANGED` misses them (§8C).

### B. Jobs and reachable operating areas

- **Missions, in priority order for a science bot:**
  1. defend a threatened coastal or river settlement and stop bombardment;
  2. intercept hostile ships or embarked attackers on an important route;
  3. escort settlers, reinforcements, packed armies, convoys or carriers;
  4. patrol known approaches, with a return and repair position;
  5. support a recapture (§9);
  6. scout or raid only when no defence or escort is left undone.
- **Reach is a path, not a circle:** a fleet serves a connected sea or river system. A ship in a disconnected lake does not cover an ocean front, and one on the other side of a peninsula may come later than a farther one along the coast.
- **Building ships:** only where the game allows it and where the spawn area connects to the mission; not every Harbor or river city reaches the ocean.
- **Before ordering hulls,** compare existing ships, upgrades, shore defenders (§3D: Bombard against ships) and aircraft. A navy never replaces the land unit that stops a capture.

### C. Naval roles need their own classifier

The land classifier (`isMeleeGuard`) excludes any unit with RangedCombat or Bombard, and is for land only. Modern ships:

| Unit | Combat | Ranged | Bombard | Range |
|---|---:|---:|---:|---:|
| Ironclad | 45 | 20 | 20 | 1 |
| Cruiser | 50 | 25 | 25 | 1 |
| Destroyer | 55 | 30 | 30 | 1 |
| Frigate | 45 | 50 | 45 | 2 |
| Dreadnought | 50 | 55 | 50 | 2 |
| Battleship | 55 | 60 | 55 | 3 |
| Submarine | 50 | 70 | — | 2 |

- **What decides a role:** domain, tags, abilities, current stats and the operations the game offers together. Close-combat screens (Range 1), ranged and bombard ships, stealth and detection (the Submarine has `CanTargetLand=false`; the Destroyer `UNIT_CLASS_SEE_HIDDEN`), and commanders and carriers are different roles.
- **Formation:** screen the bombard ships and the commander, keep firing lanes, cover the approaches, and leave room to retreat. A narrow river may need a column.
- **Captures:** bombardment alone does not capture; check each fortified district.

### D. Unique ships and upgrades, from data

- **Data, not names:** read `GameInfo.Units`, `Unit_Stats`, `TypeTags`, `UnitUpgrades` and `UnitReplaces`, and the player's actual eligibility. The Mikasa replaces the Dreadnought, the Mikasa II the Battleship, and their tags differ from the generic ship's: never require one generic tag.
- **Upgrades:** `upgradeUnits` already considers ships. Extend its priorities to naval missions rather than adding a second spender.
  - Rank by useful combat gain, readiness, survival, the time left, and gold and upkeep.
  - Never an idle landlocked ship.
  - Never all screens at once while the bombard line is exposed.
- **Costs:** our upgrade cost is an estimate from the target's purchase price; prefer a game quote if one exists.

### E. Fleet Commanders and carriers

- **Fleet Commanders:** recognize `UNIT_FLEET_COMMANDER`, `UNIT_CLASS_FLEET_COMMANDER` and `PROMOTION_CLASS_NAVAL_COMMANDER`, and equivalent uniques.
  - Assign them to an active fleet, behind the screen, with useful ships in their actual radius.
  - Assemble and deploy through the army pack and unpack path (§5); the localized "Assemble Fleet" names are no separate commands.
  - Naval promotions are a profile of their own: Weather Gage (`PROMOTION_FLEET_WEATHER_GAGE`) gives naval movement after unpacking, as Initiative does on land.
- **Carriers** (`UNIT_CARRIER_COMMANDER`, `PROMOTION_CLASS_CARRIER_COMMANDER`) are not Fleet Commanders. Their aircraft belong to §7's inventory and coverage. Escort them.

### F. Navigable rivers

- **Minor rivers are not navigable river tiles:** only the latter carry ships. They can connect lakes and sea, support ship production, and expose apparently inland settlements to naval attack.
- **Terrain checks:** `GameplayMap.isWater` excludes navigable rivers (gotcha 4). §3C fixes land units' tile picks in Phase 1. For ships, use a candidate predicate of coast, ocean, lake or navigable river, then the unit's own path and eligibility; legal coastal centres can be reachable too.
- **Connectivity:** a river near the sea need not reach it. Detect connected routes; do not trap an ocean reinforcement in an inland basin.
- **Bottlenecks:** river mouths and one-tile channels. Reserve passage, move the leading unit first, avoid head-on deadlocks.
- **Recompute:** recompute a route after an owner change, a zone of control, a blocked tile or a hazard, instead of repeating an impossible move.
- **Bridges:** bridges let land units cross without embarking (game text). So "a land unit on a navigable river is embarked" is not universal; check the unit's actual state. Do not assume a bridge blocks ships.
- **Ships on rivers:** they fight at full strength there (game text); embarked land units are vulnerable.
- **Rough seas:** keep Exploration's ocean attrition and Shipbuilding rule for fleets, transports and escorts, packed or not.

### G. Combined defence

- **Coastal settlements:** keep a land holder against capture (§4), shore fire where efficient (§3D) and reachable ships that break bombardment. Keep the demands separate: one ship is not both an escort and the town's only defender.
- **Age changes:** inventory packed fleets and threatened coasts, as for land (§5).

**Tests:**
- an Ironclad is a screen despite its ranged stats;
- the Mikasa is included without generic tags;
- a Submarine is refused a land target;
- a naval attack uses the naval request;
- commanders' focused attacks are not doubled by single shots;
- a lake ship does not cover the ocean;
- a river route works where `isWater` is false;
- a minor river admits no ship;
- a bridge crossing is not treated as embarking;
- a choke does not deadlock;
- ocean attrition is respected;
- an upgraded unique keeps its mission;
- an escort stays with its transport;
- a coast keeps its land holder.

## 9. Campaigns and commanders' development (Phase 7, behind a checkbox)

**The user's decision (18 October 2026): the posture is a checkbox, defensive by default.**
- **The setting:** «Наступление» / "Offensive" in the Autopilot tab, setting `autopilot.offensive`, `false` in `DEFAULT_SETTINGS` and checked in `sanitize`. It ships in both languages.
- **Unchecked (the default): defence only, exactly as today.**
  - `seekPeace` proposes a white peace whenever it is possible (with its back-off), and `answerIncomingDeals` accepts a cheap one.
  - Calls to arms are declined unless the enemy is far away on another continent (the user's decision 5, research/21 §9).
  - The victory focus never picks military; science comes first.
  - No campaign, no peace intent; nothing below runs.
- **Checked: campaigns during a war someone else started:** recapture first, then limited advances (§9D). The peace intent of §9E applies to those wars only.
- **Never part of it:** starting a war. Calls to arms keep decision 5, and the accidental-war checks stay. A deliberate war would be a separate decision.
- **Built regardless of the checkbox** (Phases 3–4 need them): one owner for each unit's orders, and missions that keep their identity across turns.

### A. Missions above unit orders

- **A campaign owns:** a goal, its forces, its transport and formation state, its readiness, a spending limit, a deadline and its exit conditions.
- **Goals:**
  - defend;
  - **recover** (retake a settlement we owned, then hold it);
  - limited advance (during an existing war, a valuable and defensible settlement, when the benefit exceeds the cost);
  - develop a commander (secondary, attached to useful fights).
- **Contracts (built only as needed):**
  - Campaign {id, kind, target, enemy owners, state, commanders, units, staging area, transport plan, readiness, budget, latest useful turn, abort reasons, peace intent};
  - UnitAssignment {campaign, role, order owner, destination, transport state, arrival, confirmed ready};
  - CommanderProfile {role, capabilities wanted, next useful promotion, experience, actual command area and capacity}.
- **One order per unit:** a unit never gets a campaign move and a defence or roaming move in one pass.

### B. Commanders: two good ones, a third only when useful

- **The split:** one defending the core, one mobile for recapture; a third for a separate active front with troops and budget for it. Use free and existing commanders first; read the game's rising prices.
- **Defensive commanders** keep today's `PROMOTION_PREFERENCE` (Bastion and Leadership first).
- **Mobile commanders** take a role profile. Verified in the game's data:
  - Initiative (Assault root): `ABILITY_MOVE_AFTER_UNPACKING`;
  - Mobility: +1 land movement, terrain ignored while packed;
  - Regiments: +2 unit slots and faster reinforcement, after Quartermaster or Recruitment.

  Follow `UnitPromotionDisciplineDetails` and `canEarnPromotion`.
- **Experience:**
  - train it through useful, favourable fights inside its actual radius;
  - track `experiencePoints`, `experienceToNextLevel` and `UnitExperienceChanged`;
  - stop a detour that gains nothing.
  - Game 29's parameter log had `EXPERIENCE_BARB_SOFT_CAP=1` and `EXPERIENCE_MAX_BARB_LEVEL=2`: independents stop paying early.
  - Never leave a raider alive next to our town to farm it.

### C. An assault, step by step

1. Objective.
2. Enough force.
3. A safe journey.
4. Staging.
5. Deploying.
6. Confirming members, positions, moves and attacks left.
7. Legal attacks, simulated.
8. Every required district captured.
9. A garrison.
10. Reassessment, or peace.

Initiative guarantees movement after unpacking, not an attack after any journey. Without confirmed readiness, deploy earlier in a safe place. Keep a capture-capable unit; a centre at zero is not a capture.

### D. Recapture first; more conquest must pay

- **Ownership history** is keyed by location and survives owner changes; never infer ours from a name.
- **A recovery target's value:** its economy and science, the time to assemble and capture, the reinforcements it may get, and our ability to hold it.
- **An extra target** only for a clear gain: their staging base, the border, resources, a better peace. Count:
  - the settlement cap and Happiness;
  - repairs, garrison and upkeep;
  - war weariness;
  - the delay to the science victory.
- **Abort** when:
  - the objective is reached;
  - the advantage is lost;
  - home is unsafe;
  - the budget or the deadline is past;
  - the science victory is near.

  No automatic "one more city".

### E. Peace through the same plan

- **One peace intent per opponent,** shared by `seekPeace` and `answerIncomingDeals`:
  - seek now;
  - continue briefly (a ready force with a credible near capture, a deadline and a progress check);
  - reassess.
- **Continuing never ignores a blocking peace dialog:** answer through the deal APIs as today.
- **On peace:** cancel the campaign's orders and return the troops to defence.

### F. Delivery, behind the checkbox

1. The «Наступление» checkbox (off by default), commander roles and promotion profiles, XP observations, campaign-owned assignments.
2. Reliable unpacking and transport (Phase 3), with and without Initiative.
3. Recapture during an existing war, every fortified district, a holding garrison.
4. The campaign-aware peace intent.
5. Limited advances during an existing war.

**Tests:**
- with the checkbox off (the default), no campaign starts, the peace intent is never consulted, and `seekPeace` behaves as today;
- a veteran defender keeps its profile;
- two fronts never take the same troops;
- no Initiative never implies movement after unpacking;
- a centre breach does not finish a capture;
- a target survives an owner change;
- recapture comes before any advance;
- a home loss aborts an advance;
- the peace intent drives incoming and outgoing deals and releases blocked turns;
- a confirmed peace cancels attacks;
- a near science victory ends an unprofitable campaign.

**Measures:** time to useful promotions, fights covered by commanders, losses and their replacement cost, recaptures held, net settlements, turns at war, and the science victory turn. A higher commander level or more captures alone is not a better bot.

## 10. Implementation order, with each phase's tests and logs

Each phase:
- ships with regression tests proven by revert on a scratch copy (root CLAUDE.md, "Prove tests on a copy");
- adds the UI.log lines that let the next game confirm it, and a TESTING.md row;
- goes through `safe()` for engine reads, the pass budget for spending, per-pass reservations for tiles and units, and a confirmation after each asynchronous request;
- copies read-only API usage from the game's UI rather than importing its models, so the bot never takes the player's UI selection.

### Phase 1: corrections and probes (one change set)

**Done 18 October 2026** (see the status under the order table).

**What:** §2, then §3A–§3F.
- One melee unit obtained each age, with the age's memory; gotcha 28 and QUEUED_MELEE's log text without the −10.
- Packed units are not guards.
- Ranged posts within range.
- Rivers in land units' tile picks.
- Anti-ship defenders by Bombard.
- Air: enemy air commanders are not aircraft; aircraft located through their army; fighters counted and trained where they cover, in an Airfield city with a free slot.
- The probes.

**Tests:** those listed in §2 and §3.

**UI.log:**
- `defence:` lines say `packed` for members not counted;
- `melee: <unit> obtained this age (strength N): centres defend at N` once an age;
- `air: …` probe lines;
- `army: …` probe lines.

**Next game shows:**
- CombatLog DefStr rising in each age's first turns;
- no packed unit counted as a guard;
- an anti-ship defender with high Bombard;
- enemy aircraft seen;
- what packed units look like (`isOnMap`, location).

### Phase 2: exposure

**What:** §4, and §5C.2's single-member deploy (`REMOVE_FROM_ARMY`) as the first supply for an exposed town at an age's start; it needs only the packed members' inventory from §5C.1, not the rest of Phase 3.

**Tests:** in §4.

**UI.log:** `defence: <name>: exposed (village V at d tiles): holder …` once a turn.

**Next game shows:** every exposed town with a holder within a few turns of the age's start, without emergency spending for a stationary village.

### Phase 3: armies

**What:** §5:
- the inventory;
- deploying carried-over armies near exposed or threatened settlements first (`REMOVE_FROM_ARMY` for a single holder, `UNPACK_ARMY` for a front);
- then native reinforcement with unpacking on arrival;
- then land transport by packing, as a measured experiment.

**Tests:** in §5.

**UI.log:**
- `army: <commander> unpacked N at x,y`;
- `reinforce: <unit> -> <commander>, ETA …` with each turn's ETA;
- the transport states.

**Probes needed first:** Phase 1's army lines (P-A1). When it lands, correct root gotcha 31 (the treasury is capped at 3,000 at an age change, §5B).

### Phase 4: formations

**What:** §6, once the next game's `defence:` lines are in.

**Tests:** in §6.

**UI.log:** a front's formation, once a turn: roles, positions, moves, and why units stay.

### Phase 5: air wing

**What:** §7:
- base inventory and capacity;
- rebasing fighters to cover a front;
- one ground attacker as an experiment;
- Squadron bases only after that.

**Tests:** in §7.

**UI.log:** each base's aircraft and coverage; rebase requests and results; strikes.

### Phase 6: naval

**What:** §8:
- our ships attack the game's way;
- the naval roles;
- river connectivity;
- coastal fronts and naval guards;
- then Fleet Commanders, escorts and carriers.

**Tests:** in §8.

### Phase 7: campaigns

**What:** §9, behind the «Наступление» checkbox (`autopilot.offensive`, off by default: defensive). With it off nothing of §9 runs; tests prove that first.

## 11. Sources, verified facts and live probes

All game paths are under `D:/SteamLibrary/steamapps/common/Sid Meier's Civilization VII/Base/modules/`; `BS` = `base-standard`. "Concepts" is `BS/text/en_us/Civilopedia_Concepts_Text.xml`. The research agents' notes for this revision, with every file and line, are in `research/37-notes/` (`armies.md`, `air.md`, `combat.md`).

### A. Verified (code or data)

| Fact | Source |
|---|---|
| The Civilopedia's rule: a district defends at the strongest melee unit trained by its owner, minus 10 (the log shows no −10: next row) | Concepts:229, 708 |
| In the CombatLog a centre defends at the full Combat of its owner's strongest melee land unit (infantry or cavalry) trained, bought or (very likely) upgraded in the current age, 20 with none; at once, empire-wide; walls add health only | game 29's and game 28's CombatLog: 262 of 309 rows; the damage curve; `research/37-notes/combat.md` |
| `CityProductionCompleted {cityID, productionKind (ProductionKind.UNIT / CONSTRUCTIBLE / PROJECT), productionItem}`; `CityMadePurchase` is read only for `cityID` | `age-antiquity/ui/tutorial/tutorial-items-antiquity.js`:719–731, 2736–2741; `BS/ui/production-chooser/panel-production-chooser.js`:650 |
| A ship's attack: NAVAL_ATTACK, else AIR_ATTACK, else `testAttackInto` → RANGE_ATTACK, else overrun, swap, MOVE_TO with ATTACK | `BS/ui/world-input/world-input.js`:410–480; `BS/ui/interface-modes/interface-mode-naval-attack.js` |
| `unit.Combat`: `isCombat`, `canAttack`, `getMeleeStrength(false)`, `rangedStrength`, `bombardStrength`, `attackRange`, `attacksRemaining`; `Game.Combat.testAttackInto`, `getBestDefender`; `Units.getReachableTargets` | `BS/ui/unit-actions/unit-actions.js`:722–739; `panel-unit-combat-preview.js`; `support-unit-map-decoration.js`:232 |
| Rivers: the UI reads `GameplayMap.getRiverType` against `RiverTypes.RIVER_NAVIGABLE`; a unit's `isEmbarked`; bridges let land units cross without embarking (engine code) | `BS/ui-next/tooltips/plot-tooltip/helpers.js`:83; Concepts:2155, 922; `age-antiquity/data/constructibles.xml`:108 |
| Land ranged and siege units use Bombard against ships | Concepts:344 |
| Assembled units cannot attack until deployed; a packed army defends as one unit | Concepts:2173, 1147 |
| Air units are always packed in a commander and rebase between commanders | Concepts:1930, 1248 |
| Interception: passive, 3 by default, +1 Airfield commander, +1 Flight mastery, +1 Ace; from the base | Concepts:1272, 1275; `age-modern/data/constructibles-gameeffects.xml` (`MOD_AIRFIELD_INTERCEPT_RANGE`); `progression-trees-tech-gameeffects.xml` (`MOD_MO_TECH_INTERCEPT_RANGE`); `BS/data/unit-promotions-gameeffects.xml` (Ace) |
| Aerodrome and Squadron Commanders are `DOMAIN_AIR`; the Squadron Commander is tagged `UNIT_CLASS_AIRCRAFT` | `BS/data/units.xml` (rows UNIT_SQUADRON_COMMANDER, UNIT_AERODROME_COMMANDER; TypeTags) |
| Every Airfield grants an Aerodrome Commander | `age-modern/data/constructible-modifiers.xml` (`MOD_AERODROME_SETUP_COMMANDER`) |
| Planes need an Airfield in the settlement and a free commander slot | Concepts:341, 1248 |
| No anti-air ground units (`AntiAirCombat`, `AirSlots` set by no data) | grep of Base and DLC data |
| `UNITOPERATION_AIR_ATTACK`, `_REBASE`, `_ESTABLISH_BASE`: `{}` → Plots, send `{X, Y}` | `BS/ui/interface-modes/interface-mode-air-attack.js`, `-rebase.js`, `-establish-base.js` |
| `UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR / _AIR_TO_LAND / _AIR_BOMB` on the commander | `BS/ui/interface-modes/interface-mode-focused-attack-air-*.js`, `-focused-attack-base.js` |
| `UNITCOMMAND_UNPACK_ARMY`, `_REMOVE_FROM_ARMY`, `_ADD_TO_ARMY`, `_ARMY_OVERRUN`: `{}` → Plots, send `{X, Y}`; `_PACK_ARMY` NO_TARGET | `BS/ui/interface-modes/interface-mode-unpack-army.js`, `-remove-from-army.js`, `-add-to-army.js`, `-army-overrun.js`; `BS/ui/army-panel/army-panel.js` |
| `UNITOPERATION_REINFORCE_ARMY` on the soldier; `CALL_REINFORCEMENTS` is never sent by the UI | `BS/ui/interface-modes/interface-mode-reinforce-army.js`, `interface-mode-commander-reinforcement.js`, `BS/ui/unit-interact/unit-action-handlers.js` |
| A reinforcement arrives packed if there is room | Concepts:1160; `BS/text/en_us/AdvisorText.xml`:1872 |
| `Armies.get(armyId)`: `getUnitIds()`, `unitCount`, `combatUnitCapacity`, `localId`, `location`; reinforcement `getUnitReinforcementCommanderId / StartLocation / ETA` | `BS/ui/commander-interact/model-commander-interact.js`:150–160, 219–252; `BS/scripts/age-transition-post-load.js` |
| The age change (Regroup): units rebuilt as tier-1 with new ids; `NumDefenders` (Exploration 6, Modern 9) by population; commanders filled and packed on centres; the rest dropped; treasury capped at 3,000 | `BS/scripts/age-transition-post-load.js`:1040–1371; `BS/data/ages.xml`:12–14 |
| Failure texts: ALREADY_UNPACKED_THIS_TURN, CANNOT_PACK_IN_ZOC, ADD_TO_ARMY_NO_ROOM, LEAVE_ARMY_NO_LOCATION, REINFORCE_ARMY_NO_ELIGIBLE_COMMANDER | `BS/text/en_us/UnitCommandsText.xml`, `UnitOperationsText.xml`:370–383 |
| Initiative: `ABILITY_MOVE_AFTER_UNPACKING`; Regiments: +2 slots, faster reinforcement; Weather Gage: naval movement after unpacking | `BS/data/unit-promotions.xml`, `unit-promotions-gameeffects.xml`, `UnitPromotionsText.xml` |
| `Units.getCommandRadiusPlots(id)`: the current footprint | `BS/ui/interface-modes/support-unit-map-decoration.js`:204 |

### B. Game 29's logs

- CombatLog (`research/game29/evidence.zip`): our centres' DefStr 20 at A23–A25, 30 from A52, 35 from A56; 20 at M5–M6 (Ollantaytambo, the Line Infantry's 80 and 78 damage); 65 from M51.
- UI.log: QUEUED_MELEE Tank at line 2714734 (M36); the defence lines of M4–M6 and M52–M54 (research/36).

### C. Live probes (UI.log)

| Probe | Settles | Phase |
|---|---|---|
| P-A1 army inventory per commander, at an age's first turn and on army events: `armyId`, `localId`, `unitCount` (does it count the commander?), `combatUnitCapacity`, `location`, members' `isOnMap`, location, activity, `armyId`, moves | Packed units' state; capacity | 1 |
| P-A2 deploys: the Plots offered, the plot sent, each member's tile the next pass | Where deployed units land | 2, 3 |
| P-A3 a reinforcement's ETA on consecutive turns, and its start location | Turns left or an absolute turn | 3 |
| P-A4 `UnitAddedToArmy` / `UnitRemovedFromArmy` / `UnitArmyZOCChanged` payloads | Confirmation events | 3 |
| P-A5 members' moves and attacks after a deploy, with and without Initiative | Same-turn action | 3, 4 |
| P-A6 `FailureReasons` of PACK, UNPACK, REMOVE_FROM_ARMY, REINFORCE_ARMY when they fail | Which rule refused | 3 |
| P-AIR-1 every visible air unit: type, commander or not, `isOnMap`, own location, `armyId`, the army's location and size; `MapUnits.getUnits` at the base | Locating aircraft, ours and enemies' | 1 |
| P-AIR-2 `canStart(BUILD / PURCHASE, {UnitType: fighter})` in each Airfield city with its commander's `unitCount` and capacity | Slots and training | 1, 5 |
| P-AIR-3 the keys of an air commander's army object | An interception-range getter | 5 |
| P-AIR-4 `simulateAttackAsync` before an air strike, compared with the `Combat` event | Air previews | 5 |
| P-AIR-5 the `Combat` event's payload when an enemy aircraft hits our settlement or unit | Remembering air raids | 1 |
| P-DEF-1 our melee units completed (`CityProductionCompleted`) and bought, with the age | §2's memory | 1 |
| P-DEF-2 next game's CombatLog DefStr after the first melee unit of an age, trained and bought | Confirms §2 for us (a purchase counted once, for an AI) | 1 |
| P-DEF-3 DefStr after upgrading a carried unit at an age's start | Whether an upgrade counts (the cheapest way) | 1 |
| P-NAV-1 for a melee and a ranged ship: `canStart` of NAVAL_ATTACK, RANGE_ATTACK, MOVE_TO with ATTACK, with `{}` and a target | How our ships can attack | 6 |
| P-NAV-2 on a bridge tile: `isEmbarked`, `getRiverType`, ship passage | Bridges | 6 |

## 12. What the review changed

| The first handoff said | This revision | Why |
|---|---|---|
| Order: age start, air, formations, transport | Corrections and probes, exposure, armies, formations, air, naval, campaigns | The losses of game 29 were land captures. Air needs Airfields that compete with science. Formations need the next game's `defence:` telemetry. Several facts need probes first. |
| (nothing on centre defence) | §2: one melee unit obtained each age | CombatLog: Modern centres at 20 for 35 turns; only units trained, bought or upgraded in the age count |
| (gotcha 28: "the strongest melee unit trained, minus 10") | §2: its full Combat, no −10, cavalry included | 262 of 309 CombatLog rows and the damage curve; correct gotcha 28 and QUEUED_MELEE's log text |
| Naval: our ships' attack path not examined | §8A: they very likely never attack today; dispatch as the game does | `world-input.js` tries NAVAL_ATTACK first; our code asks RANGE_ATTACK or MOVE_TO with ATTACK |
| Native reinforcement first, packing later | One Phase 3: inventory, unpacking, then reinforcement with unpacking on arrival | Reinforcing joins the commander's army; assembled units cannot attack until deployed (UnitOperationsText:208, Concepts:2173) |
| Packed units: an age-start inventory concern | §3A: they are not guards anywhere, now | No guard check reads `isOnMap` |
| Age-start readiness pass with a persisted marker | §4: exposure as a standing demand each pass | Live state needs no reconciliation; the settings' memory holds 20 values; only "melee obtained this age" persists |
| Buy the cheapest adequate unit | The first melee unit of an age: the strongest; after that the cheapest adequate | It sets every centre's defence (§2) |
| Air: base inventory and ground attackers second | §3E fixes the shipped air features now; the air wing is Phase 5 | `hostileAircraftNear` counts enemy air commanders; fighters cover 3–6 tiles of their base (Concepts:1272 and the modifiers) while ours are counted empire-wide |
| Anti-ship: a naval-section note | §3D: rank by Bombard, siege included, now | Concepts:344; an Archer hits ships with 10, a Ballista with 30 |
| Rivers: a naval-section audit | §3C: land units' tile picks first | `postFor` (research/36) can post a defender on a navigable river |
| Campaigns and peace intent as design | §9: behind a checkbox, defensive by default (the user's decision, 18 October); never a war of our own | They change `seekPeace`, decision 5 and science-first policy |
| `QUEUED_INTERCEPTOR` may want planes nowhere can build | A UI.log line; no loop exists | We queue only where `canStart` succeeds |
| (not covered) | §3E: `hostileAircraftNear` counts enemy air commanders as aircraft | The Aerodrome and Squadron Commanders are `DOMAIN_AIR` (units.xml); every enemy Airfield asked for interceptors |
| Age start: "some troops remain, the rest are assigned to commanders"; formula unknown | §5B: the game's transition script, step by step | `age-transition-post-load.js`: units rebuilt with new ids, `NumDefenders` (6, 9) on the largest settlements first, the rest packed on centres, the treasury capped at 3,000 |
| Deploy with UNPACK_ARMY only | §5: `REMOVE_FROM_ARMY` deploys one member | A single holder for a town without unpacking the whole army |
