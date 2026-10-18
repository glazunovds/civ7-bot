# Game 29: military readiness, formations and aircraft

Analysis only, 18 October 2026. No gameplay code, settings or existing tests changed. Read this before implementing military improvements. Preserve the user's existing uncommitted science/economy fixes.

## Outcome and evidence

The army reacts to threats, but there is no deployment plan linking a diplomatic warning to a defended border. More units alone will not fix that. The first priorities are truthful defender accounting, earlier deployment and assignment across fronts; aircraft and formations should build on those foundations.

This is Pachacuti's game, America in Modern, Hall of Fame GameID 31. GameCore records our science victory at 03:23:34, Modern turn 69. Innovation reached 100 on M64. The previous game won on M93, but different games/seeds do not isolate the benefit of the recent fixes.

The logs append **two games, six age segments**. This report uses the last Modern segment, not the preceding Xerxes game. `game29/evidence.zip` preserves the CSVs, GameCore, selected original UI lines and source hashes. UI line references below are original UI.log line numbers. `game29/analyze.py` regenerates `frames.json` and `summary.json`; there are 68 full autopilot frames, M1–M68, followed by victory. `game29/city-history.json` preserves this game's local settlement population changes from the read-only Hall of Fame database.

| Modern turn | What happened |
|---|---|
| 1 | We had 11 settlements and 13 land units in Player_Stats. Independent player 9 was at war with us from the age transition. |
| 4 | Ollantaytambo first flagged with one hostile. Commander and one Cuirassier ordered there. No walls available; Military Science still locked. |
| 5–6 | The same independent Line Infantry attacked its centre twice: strength 50 against 20, damage 80 then 78. The centre was destroyed on M6; the town disappears from our records on M7. |
| 36 | Catherine first logged as WAR_RISK. A Tank was queued, but no REINFORCE action occurred anywhere in M36–M51. |
| 48 | Russia started an Attack Enemy City operation targeting (47,11), Antawaylla. This is post-game AI-log evidence, not information the bot should read to predict wars. |
| 51 → 52 | Russia declared formal war during M51, after our pass; our first war response was M52. City-states 9 and 15 joined through suzerainty. |
| 52 | Four settlements threatened. Four melee reinforcements sent to Antawaylla, one to Cajamarca, commander to Antawaylla. Cusco logged 0/1 guards; Vilcas Huamán 1/2. Four Tanks queued. |
| 54 | Cusco now faced four enemies and still logged 0/4 guards. |
| 57 | Cusco's centre reached zero health. This was not yet the loss of the whole city. |
| 60–65 | A Russian Bomber attacked our settlement centres. |
| 65 | Cusco leaves our ownership history; cities fall from 8 to 7. |
| 66 → 67 | Peace recorded during M66 and reflected in our M67 pass. |
| 69 | Science victory, with 7 cities and 2 towns remaining. |

Sources: DiplomacySummary lines 5564, 6330, 6338, 6357, 6590; CombatLog 4377, 4382, 4848, 4892–4966; UI 2579497–2579609, 2714572–2714734, 2827130–2827316, 2847069; AI_Operation 118703; Player_Stats 8135, 8364, 8432. Hall of Fame population end markers: Ollantaytambo M7, Cusco M65. A centre reaching zero is not interchangeable with ownership loss.

The logs do **not** contain a complete friendly-unit position/health/assignment snapshot each turn. The player's observation of clustering is consistent with the code, but these logs cannot quantify how many units stood together or prove the exact formation that would have saved either settlement. “25 busy” on M51 includes all unit types and does not mean 25 idle soldiers.

## Prioritized findings

### 1. P1 — Incoming and withdrawn units count as guards immediately

**Code:** `mod/expansion-planner/ui/data/xpl-autopilot-units.js:1704` (`guardsFor`), `:1741` (`reinforce`), `:2899` (pass need map).

`guardsFor` counts any matching `goals.guard` as one full defender, regardless of its current distance, arrival time, health or whether it has withdrawn. That count suppresses both reinforcement and production/purchase demand. A surviving unit's guard goal has no general completion/withdrawal/target-loss reconciliation; stuck-move cleanup covers only particular cases. The nearby-unit branch also counts heads, not usable combat strength.

**Reproduced:** a Warrior nine tiles away counts as a guard immediately after the order. Move it even farther away and put it into healing: it still counts for that settlement. These are executable cases in `game29/reproduce.mjs`.

**Game relevance:** Ollantaytambo received a Cuirassier assignment on M4, no new reinforcement on M5, and a second assignment on M6 when two hostiles were counted. No emergency defender purchase or training was logged there, despite treasury 711, 795 and 1,034 on M4–M6. The town fell in two attacks. The logs do not reveal the Cuirassier's exact ETA or available purchase offers; therefore they do not prove a specific purchase would have saved it. They do show why merely sending a unit is inadequate evidence of safety.

**Change:** separate `present`, `incoming` and `available before deadline`. Count incoming strength only if its current path reaches a useful defensive tile before the expected attack/capture; maintain the distinction for emergency purchases. Revalidate assignments after retreat, death, blocked routes, peace and lost settlements. Off-map/packed units need explicit deployment readiness, not an assumed location. Keep same-pass reservations so this does not reintroduce duplicate orders.

**Acceptance:** an incoming unit arriving after a town's likely fall must not suppress an affordable emergency defender; a withdrawn or stale assignment must stop satisfying demand; an on-time reinforcement must prevent redundant production.

### 2. P1 — War risk is detected but does not deploy the army

**Code:** `data/xpl-autopilot-steps.js:125` (`assessWar`), `:182` (`guardedSettlements`), `:2293` (`unitsWanted`); `hud/xpl-autopilot.js:455`; `data/xpl-autopilot-units.js:1741`.

Diplomatic risk feeds savings, research/production decisions and settler safety. It does not create military destinations. `guardedSettlements` returns a **count**, and the training rule subtracts the empire-wide count of melee units. A sufficient number anywhere satisfies this rule even when the exposed border has none. `reinforce` requires an existing threatened settlement, which for major players requires war and nearby units.

**Observed:** Catherine warning on M36; no reinforcement actions during M36–M51. The bot trained a Tank in Chichen Itza on M37–M42. Catherine's warning was intermittent, absent again on M50, present on M51; it was not a continuous 16-turn certainty. Nonetheless, there was ample warning to assess positions and move a reserve without starting a war.

**Change:** retain a per-front readiness plan for risky neighbours: threatened approach, settlements exposed, friendly strength available locally, and reserve arrival time. Reposition existing units on legal peaceful tiles before buying more. Use visible enemy concentration/movement, relationship, recent hostile acts and border access; let confidence decay gradually to avoid oscillation when one warning disappears. Preserve `willMoveStartWar` checks.

**Acceptance:** an unchanged total army with all troops on the wrong border must generate staging moves; a changing relationship alone must not cause constant redeployment or an unwanted war.

### 3. P1 — Single independent attackers need a capture forecast, not a count threshold

**Code:** `data/xpl-autopilot-units.js:1553` (`hostileOwner`), `:1585` (`threatenedSettlements`); `data/xpl-autopilot-steps.js:3047` (`noteThreats`).

The current detector scans four tiles, normally requires two hostiles, or one within two tiles, or a damaged centre. It discounts independent units near their own village unless adjacent to us or our centre is already damaged. `noteThreats` treats a major's attack as serious, but an independent normally needs two land units before the walls-research window advances. A single strong attacker can be more dangerous than several weak ones.

**Observed:** independent player 9's single Line Infantry, unit id 18, delivered both attacks that destroyed Ollantaytambo. The UI counted a second nearby hostile on M6, so “one unit destroyed the centre” does not mean only one enemy existed nearby. Its centre had only 100 health and 20 defence. No walls could be built on M4–M6. The crisis window was shorter than a distant reinforcement journey or fresh wall technology.

**Change:** estimate earliest attack and likely capture using visible unit movement, reachable routes, current district health/defence, unit role, and real combat previews where supported. Evaluate exposed towns immediately after the age transition. A visible lone attacker able to capture soon is urgent. Keep the village-guard false-positive protection, but override it for an actual attack route/approach, not simply because a village is nearby.

**Acceptance:** one strong raider approaching a weak town must trigger pre-positioning before the first hit. A stationary village guard unable or unlikely to reach us must not cause endless purchases. Distinguish a centre breach from losing a fortified city with other districts.

### 4. P1 — Defenders cannot be redistributed effectively across fronts

**Code:** `data/xpl-autopilot-units.js:1732–1770`, `:2903`, `:2994–3036`, `:3076`.

Four constraints combine:

- Reinforcement is greedy in threat-count order and unit iteration order, not a global assignment by danger and travel time.
- A unit within two tiles of **any** threatened settlement is rejected from redistribution, even when that front has a surplus.
- A roaming unit within four tiles is held back before reinforcement. At three or four tiles it can be neither counted as a present guard nor actively moved into position; sleeping units then hit the busy gate.
- With `defend` on and `roam` off, sleeping/fortified reserves are not generally awakened to reinforce. The ranged shooting fix wakes their fire opportunities, not their movement.

**Reproduced:** two Warriors guarding a one-enemy front both stay while a second front has no defenders. A sleeping remote Warrior receives no reinforcement order with defence alone.

**Observed:** M52's commander plus four reinforcements went to the largest threat, Antawaylla. Cajamarca got one Marine. Cusco remained at 0/1 and later 0/4. Some concentration was reasonable, but there is no severity/arrival-aware allocation to determine when to stop or move the surplus.

**Change:** assign fronts first, then units. Cover imminent capture threats before reinforcing already adequate fronts, retain a small mobile reserve, and reassign surplus when the risk changes. Recheck eligible units' orders and wake/cancel only when the new defensive assignment warrants it. Keep a record of bot-owned orders so deliberate player instructions can be respected.

**Acceptance:** simultaneous threats receive reachable defenders according to deadlines and capability, not iteration order; a nearby fulfilled front releases surplus; sleeping reserves deploy under the defence option; units already protecting a critical position are not stripped merely to equalize counts.

### 5. P1 — Ranged support cannot reinforce, and land armies do not ask for it

**Code:** `data/xpl-autopilot-units.js:1678–1696`, `:1743`; `data/xpl-autopilot-steps.js:2440`.

`reinforce` accepts only melee land guards. Existing archers, field guns, anti-tank guns and siege units do not receive these destinations. `rangedWanted` asks only for up to two ranged defenders against ships; it asks for zero against a land army. This is incompatible with a melee screen plus ranged support formation.

**Reproduced:** an idle Archer stays and fortifies instead of reinforcing a coast threatened by ships. During the real Russian war, four individual melee strikes were logged, but no `RANGED`, `FOCUS_FIRE` or `COORDINATED_ATTACK` actions in M52–M68. That alone does not prove every missed shot was legal; the positioning and composition system is absent regardless.

**Change:** role-based demand and movement: centre holder/screen, ranged damage, relevant counters, siege only when useful, air coverage later. Use actual stats/tags and matchups rather than treating every land unit as equivalent. Do not compare raw combat-strength sums as if strength were linear damage. Use combat forecasts and a health/readiness adjustment for local force estimates.

**Acceptance:** an existing ranged unit is preferred over producing another one when it can arrive in time; it takes a reachable firing position behind the screen and within its attack range. Melee defenders remain sufficient to hold the settlement.

### 6. P2 — Commander placement is separate from the army; formations do not exist

**Code:** `data/xpl-autopilot-units.js:1904` (`commanderPost`), `:1958` (`commanderAttacks`), `:1402` (`joinArmy`).

Commanders choose a threatened city centre or an unhappy settlement. Soldiers choose tiles closest to a settlement (`near * 100 + far`), without facing the enemy or maintaining a commander's coverage. Focused attacks are attempted only when units happen to be correctly positioned. Packing is a congestion escape, with no general packing/transport/deployment lifecycle.

The focused-attack code also estimates command radius as `1 + Merit`. The game's UI exposes `Units.getCommandRadiusPlots(unit.id)` (`Base/modules/base-standard/ui/interface-modes/support-unit-map-decoration.js:204`). Prefer those actual plots where available instead of duplicating radius rules.

**Recommended formation:** a terrain-aware formation facing the enemy approach: durable melee/counters on the threatened edge and capture routes; commander in a protected central/rear tile covering useful units; ranged support behind the screen but still in legal range; reserve covering a flank or second approach. A city centre can be the best commander tile, but not always. Do not force a symmetrical ring through water, hazards, blocked tiles or outside firing range.

**Multiple enemies/alliance:** group by geographic approach and arrival time, not just leader ID. Several allies approaching from one corridor can share one front; separate approaches need separate groups. Known suzerain relationships matter: in this game independent players 9 and 15 joined Russia at declaration, and 16 later. There is no evidence here of a second major joining the war. More groups than commanders must still work; do not make every group wait for a general.

**Acceptance:** two-front assignment, protected commander, legal reserved destinations, actual command radius, ranged firing access, no turn-to-turn swapping, and a retreat route. Pack/move/deploy support is a later stage; first make on-map formations work.

### 7. P2 — Aircraft need a complete production and operations path

**Code:** `data/xpl-autopilot-steps.js:2350` excludes AIR/SEA from military production selection; `data/xpl-autopilot-units.js:1258` uses RANGE_ATTACK, `:2430` reuses it for ranged soldiers. The mod contains no dedicated AIR_ATTACK, REBASE or air commander attack handling.

**Observed:** no own aircraft appeared in Modern production or purchase records. Our Airfield in Vilcas Huamán began M50, was interrupted for Tanks and walls, and remained incomplete (387.3/735 on M65, then anti-tank guns). Russia's Bomber was already attacking centres on M60. Consequently “just build planes” was not immediately available from this production record; aircraft also needed a completed base and usable deployment.

The installed game's data supports three separate roles:

| Role | Units | Use in a science-defence bot |
|---|---|---|
| Interception | Biplane → Fighter; `UNIT_CLASS_INTERCEPTOR` | Protect productive/space cities and armies when enemy air attacks are credible. |
| Ground/naval attack | Trench Fighter → Dive Bomber; `UNIT_CLASS_GROUND_ATTACKER` | Remove invading land/naval units. More directly relevant than siege bombers for this request. |
| Siege | Bomber → Heavy Bomber; `UNIT_CLASS_BOMBER` | Fortified districts, a necessary counterattack or recapture. Do not default to them for defending against troops. |

**Verified engine path:**

- `UNITOPERATION_AIR_ATTACK`: query `canStart(id, op, {}, false).Plots`, send `{X,Y}`. See `interface-mode-air-attack.js:11,47`.
- `UNITOPERATION_REBASE`: same query/target pattern. See `interface-mode-rebase.js:11,47`.
- Air commander commands exist: `UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR`, `_AIR_TO_LAND`, `_AIR_BOMB` in `base-standard/data/unit-commands.xml`.
- Modern English TutorialText, the Squadron Commander description, explicitly says Fighter-class aircraft based with the commander intercept in range automatically. Do not invent an INTERCEPT mission absent from the installed operation list. Validate actual coverage/capacity from the engine.
- Modern ConstructibleText describes the Airfield/Aerodrome as required to train aircraft, a full flat tile, +9 production and +1 intercept range for packed aircraft. Its first completion grants a Squadron Commander. Read engine cost and build eligibility rather than hardcoding XML base prices.

**Implementation order:** valid base/production eligibility → bounded role demand and upkeep → rebase to a safe useful base → legal target scoring and air combat prediction → fighter coverage → optional coordinated air commands. Include based/packed aircraft; a blanket `isOnMap === false` filter can discard the units the aircraft controller needs. Preserve the science project's completion unless survival demands interruption.

**Acceptance:** unlocked plane without a base is not ordered; a based aircraft can act; fighter cover remains where needed; ground attacker targets invading units; bomber prefers useful district damage; rebasing cannot loop; production stops when desired coverage is met; actual attack/rebase results are observed.

### 8. P2 — Emergency finance is inconsistent for ranged defenders

**Code:** `data/xpl-autopilot-steps.js:2989–3021` (`buyDefenders`), `:2950` (`defenderPurchase`), `:4090–4096` (`goldPlan`).

At negative income, ranged purchases use `budget.free()`, which may be zero precisely because gold is reserved for defence. Melee purchases still try `budget.all()` before fallback. Thus it is incorrect to say all emergency defenders were blocked by the reserve. The log also says “nothing to buy within 0 gold” even after the melee branch tried the full treasury, obscuring the actual reason.

**Reproduced:** with 500 cash reserved, negative income, an existing melee guard, and a legal Archer costing 120 against two ships, no Archer is purchased.

**Observed finances:** M51 cash 604 and unit upkeep 150; M52 cash 547 and net income about −57 (UI pass about −59); cash reached zero later in the war. No Modern unit purchases were recorded; the only own Modern purchase was a Launch Pad on M47. The reserve on M52 was 3,789 because it included several defender prices, not just one income turn. The record does not prove a useful melee defender was affordable on M52.

**Change:** one deadline-aware emergency pool for whichever role can prevent the loss. Include upkeep and cheaper alternatives, but distinguish “unaffordable”, “unavailable”, “blocked by reserve” and “already covered by an on-time unit”. Preparing existing forces is cheaper than reacting with more units after income collapses. Aircraft should be a limited replacement/complement, not another unbounded maintenance burden.

### 9. P2 — Production does not compare completion plus travel with the defence deadline

**Code:** `data/xpl-autopilot-steps.js:2503` (`trainDefenders`), `:2556` (`unitTurns`).

The closest eligible city within twelve tiles trains the strongest suitable unit if build time is at most ten turns. Actual travel time to the threatened settlement is not included. A queued military item in the first candidate city also breaks the search, without proving it is the right role, assigned to this front, or due in time. This is a code-level gap, not a proven cause of one particular loss here.

**Change:** compare existing troop ETA, purchase now, and build time + queue delay + deployment/travel time. Pick the cheapest adequate option arriving before the threat, accounting for space work displaced. Track defender orders by target/role so one existing queued unit does not silently satisfy several fronts.

**Acceptance:** a nearby city with a slow/wrong-role queue must not hide a farther city that delivers the right defender sooner. A ten-turn unit is not a solution to a two-turn capture threat. With no timely solution, log that fact instead of reporting coverage.

### 10. P2 — Military telemetry hides the information needed to tune this

**Code:** `data/xpl-autopilot-units.js:3134` collapses all busy units into a count to avoid the game's line truncation.

Add bounded, separate records per front and changed unit assignment, not one enormous line:

- Front: known enemies and roles, current/forecast danger, district health, earliest attack, likely fall, present force, incoming force with ETA, confidence/source of warning.
- Unit: stable ID, type, location, HP, activity, current order, bot assignment, target tile, role, arrival turn, why it stays or moves; packed/based status where relevant.
- Production/purchase: target front, role, cost, upkeep, completion+arrival, alternative considered, reason refused.
- Aircraft: base, legal attack/rebase targets, interception coverage and result.

Only use observed/remembered information in normal play. AI operation/debug logs are useful for retrospective validation, not runtime foreknowledge. Add these records early so the next game can test whether staging and formations actually work.

## Handoff sequence and validation

1. Fix guard accounting/lifecycle, ranged movement, waking reserves and multi-front redistribution. These affect existing armies immediately.
2. Add capture deadlines and pre-war staging, including age-transition independent threats and known suzerain fronts. Change production/purchases to satisfy those deadlines.
3. Add commander-aware terrain formations and mixed land roles. Then implement the aircraft lifecycle and modest demand policy.
4. Revisit squad transport/packing only after deployment and formation tests are reliable.

Keep tactical scoring in a pure core module and engine reads/orders in data adapters with `safe()`. Use engine legal plots/paths/combat previews. Reserve each destination and unit once per pass; revalidate after combat events. Preserve existing opt-ins, turn blockers, no-accidental-war checks, hazard escape, budget accounting and science priorities. Read root/mod/tests CLAUDE.md before changes. Prove regression tests on a scratch copy, since reverting live mod files reloads the running game.

`node research/game29/reproduce.mjs` reproduces six current defects with the fake engine. Its assertions deliberately describe the broken baseline; convert them into desired-behaviour regression tests rather than adding them unchanged to the permanent suite. No game process is involved.

Baseline verification during this analysis: **677 tests passed**, **331 imports checked, zero problems**, and all mod JS/XML parsed. These checks do not validate proposed formations or aircraft; those are not implemented.

For the next controlled replay measure warning-to-staging delay, first enemy attack versus defender arrival, settlements lost, incoming guards counted too early, idle healthy combat units with reachable assignments, ranged/air actions, unit upkeep, and science victory turn. Do not optimize merely for unit count or a visually neat formation.

## Confirmed and changed (18 October 2026)

All ten findings hold, checked against the UI.log lines in `game29/evidence.zip` and the code. Eight are fixed; formations and the aircraft's full cycle are started, and the rest is left for the next stage. 691 tests pass (14 new). Every fix was proven by reverting it on a copy: its test fails, then passes again (20 of 20). `game29/reproduce.mjs` still asserts the old defects, so it now stops at its second assertion (a withdrawn guard no longer counts).

| # | Confirmed in the logs or code | Changed |
|---|---|---|
| 1 | M4–M6 (UI 2579497–2583618): Ollantaytambo threatened by 1, then 2 raiders. The Cuirassier sent at M4 and the Line Infantry sent at M6 counted as its two guards at once: no `defenders: none for` line and no purchase with 711, 795 and 1,034 gold. | `guardDetail` splits guards into those there (within 2) and those on their way, with their turns (`guardProgress`, the game's path). A goal no longer holds when the unit heals, sleeps or stopped elsewhere, or walks somewhere else; it is dropped. Moving units count every guard on its way, so none is sent twice. A purchase counts only those arriving within `guardDeadline`: 1 turn with a damaged centre or a raider within 2, else 2. A defender bought this turn counts when training is decided. |
| 2 | WAR_RISK Catherine at M36 (UI 2714572), gone M45–M50, back at M51; the first REINFORCE came at M52, after her declaration. | `warFronts()`: with a war, our settlements within 12 tiles of the enemy's; with a risk, the 2 nearest within 10 (the nearest always). A front lasts 5 turns after its last warning. Each front gets one melee guard from the army we have (STAGED), on our own land, from idle units or units the autopilot itself fortified (the player's own stay put). Nothing is trained for a front. |
| 3 | The Line Infantry within 2 at M4 was detected; the failure was #1. | A land raider 3–4 tiles away stronger than every melee guard of ours within 2 now threatens too (`strong`, `strongest`), and asks one guard more (`guardsWanted`). Alone, it is an early warning (`earlyWarning`): guards are moved, bought or trained, but no walls go ahead of the queue and no town takes Fort Town for it. The centre's own strength is not read: Ollantaytambo's defended at 20 while our strongest melee unit was a Line Infantry at 50 (the game counts units trained this age). |
| 4 | M52 (UI 2827130–2827268): four REINFORCE to Антавайлья (5 raiders, listed first), one to Кахамарка, Куско at 0 of 1 and at M54 0 of 4, with 22–25 busy units. | `planDefence`: the lacks sorted by urgency (a damaged centre, no guard at all, raiders within 2, their number); each gets the free unit that reaches a post soonest (of the 3 nearest within 16 tiles). Free means idle, or asleep or fortified (woken with UNITCOMMAND_WAKE), 3–4 tiles from a threatened settlement included. A settlement's guards beyond its want are spare, never the one on its centre. |
| 5 | No RANGED, FOCUS_FIRE or COORDINATED_ATTACK in M52–M68; `reinforce` took melee units only. | Ranged guards reinforce too: off the centre, behind the screen. `rangedWanted` adds one ranged unit against 2+ land raiders, moved and trained but not bought. |
| 6 | `commanderAttacks` took 1 + Merit as the radius. | The radius is the game's own `Units.getCommandRadiusPlots`. Formations: not done. |
| 7 | No aircraft of ours; nothing in the mod sent UNITOPERATION_AIR_ATTACK. | Our aircraft strike hostile soldiers within 6 tiles of our settlements (`airAttack`, as the game's air attack mode sends it). With a war at our door and enemy aircraft seen within 10 tiles, up to 2 fighters (UNIT_CLASS_INTERCEPTOR) are trained where the game allows them (QUEUED_INTERCEPTOR). Not done: rebasing, ground attackers, bombers, air commanders. |
| 8 | M52 (UI 2827262–2827268): `nothing to buy within 0 gold` with 547 in the treasury (reserve 3,789, income −59). | One pool for both roles: all the gold less 3 turns of a deficit (`DEFICIT_KEEP_TURNS`). The reserve already kept a defender's price for each settlement short of guards. UI.log names the cheapest unit, its price and the gold usable. |
| 9 | `trainDefenders` took the nearest city and stopped at any soldier queued there. | The city whose defender arrives soonest: its training plus its walk at its BaseMoves, at most 16 turns. A soldier of the right role already queued and arriving in time covers one settlement; another role does not stop the search; the defender queued for a settlement covers it while it is in the queue. UI.log: `defenders: … queued in …, there in N turn(s)`, or `none trained for …` with the reasons. |
| 10 | `autopilot units: 25 busy` explained nothing. | Once a turn for each threatened settlement and war front: `defence: <name>: raiders … (land, ships, air, close, strongest), centre H/M; melee P + I coming of W [types, turns]; ranged …; sent [unit from x,y in Nt (woken) (spare at …)]; N free soldier(s) left`. |

**Not done (the next stage):**
- commander formations facing an approach, and commanders split by front;
- rebasing, air commanders, ground attackers and bombers;
- packing and transport;
- exposed towns' garrisons at an age's start (still from the free gold);
- a centre's real defence strength.

**The next game should show:**
- the turns from a WAR_RISK to the first STAGED;
- `defence:` lines with units coming and their turns;
- purchases made while a guard is still on its way;
- woken units, ranged REINFORCE, AIR_STRIKE and QUEUED_INTERCEPTOR;
- settlements lost against the turn of the first attack.
