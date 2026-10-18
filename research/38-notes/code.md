# 38 notes: what the code does for Innovation in Modern's first half (games 30, 31)

## Summary

1. VERIFIED: in Modern the only Innovation sources that need no Launch Pad are tech masteries (Electricity, Combustion, Industrialization, Radio, Armor 2 each; Aerodynamics 5), Rocketry itself (5), Future Tech (3 each), Oxford and Manhattan (3 each), the Airfield's two flights (5 each), and the Radio Telescope (5). No Modern civic grants Innovation.
2. VERIFIED: the code defers all of these to after Rocketry. The research gate allows only Rocketry's way, so no mastery is taken before it. The Airfield is not an active site before its masteries. The Radio Telescope is never built for. So Innovation stays flat until Rocketry: game 30 stayed at 55 from M1 to M34. Game 31 gained only +7 from Oxford (M12) and +2 from an unknown source (M30).
3. VERIFIED: every Modern tech except Nuclear Fission and Future Tech is on Rocketry's way. The order inside the way does not change Rocketry's arrival (M35 in game 30, M37 in game 31). It only changes when the unlocks come.
4. VERIFIED: after Rocketry the crossing of 100 is set by production. Game 30 reached 60 at M35. Research then gave +23 (Aerodynamics mastery, five 2-point masteries, Future Tech). The rest came from two Preparation runs: London's at M52–53 on a pad bought at M36, and Birmingham/GB3's at M61 on a pad built M43–M51. The countdown then ran to the win at M66.
5. VERIFIED: the PADS bank holds at most one pad's price (`padGoals`, line 4704). In game 30 the gold above it (3,088) bought three Schoolhouses in towns before Rocketry. Game 31 had no gold in Modern at all: income was below zero, and the balance was 0 from M24 to M43.
6. VERIFIED: pads built by production started 3–8 turns after Rocketry in every such city. Each waited behind an item started just before Rocketry and in production with progress (a Cannery, a Laboratory, City Parks, a Grocer, Military Academies). `toFront` respects `frontSlot`, so a pad never passes such an item.
7. VERIFIED (bug): the race model (`spaceRace` → `innovationReach`) counts only projects. It leaves out masteries, Future Tech and wonders, and leaves out an Airfield's flights until their mastery is in. At M35 in game 30 it said the goal was 44 turns away (M79); the real crossing was M61. `siteHelps`, `oneOffNext` and production first all use this model.
8. VERIFIED (bug): the AIRFIELD savings goal (`siteGoals`) ignores `siteHelps`. Game 30 held 2,216–2,284 gold for an Airfield on roughly 20 turns between M38 and M63. Meanwhile the purchase step said the Airfield would not help and never bought it.
9. VERIFIED: a pad in production with progress is never bought (`victoryPurchases`, line 1834). Game 30 had 1,600–2,100 gold from M47 to M53 while three pads were half built.
10. Top proposals (estimated on game 30's numbers, crossing at M61):
    - a bank for two pads, and buy pads that are under way (about 7 turns);
    - pads go to the front at Rocketry, and pad cities start no long items just before it (about 5 turns);
    - the Airfield's flights before Rocketry (about 7 turns, overlapping the first);
    - a race model that counts research Innovation (correctness; it enables the others).

    Together these give a realistic crossing at about M50–53, so a win at about M55–58 instead of M66 (INFERRED). For game 31 the binding problems were gold and the culture rival. Science alone could not have beaten M46.

Sources: code under `mod/expansion-planner/ui/` (file:function, line). Logs are `ev/g30` and `ev/g31` in the session scratchpad: UI.log (`[XPL]` lines after the 3rd boot = Modern) and CityBuildQueue.csv (the Modern block; its turn equals the UI turn). Game data is `Base/modules/age-modern/data/*.xml`. "M<n>" means Modern turn n.

---

## Q1. Research in Modern's first turns

### What chooseResearch does (VERIFIED, data/xpl-autopilot-steps.js:chooseResearch 629–736)
Order of tests for a tech pick with the science focus:
1. walls / a stronger melee unit under a war at our door (`war.near`), the Shipbuilding detour (not seen in Modern here);
2. `researchGate(focus, candidates)` (352–394): gate = the node unlocking `BUILDING_LAUNCH_PAD` (core/xpl-victory-levers.js RESEARCH_GATES, line 200) = Rocketry. Way = Rocketry plus all unresearched prerequisites. The pool = available candidates on the way; researched nodes are left out, except the gate itself, so **no mastery is ever in the pool**. Modern is the final age, so the ETA check (`limit`) is off there; only the strategy's `gateLate` can turn the gate off.
3. `victory = pickVictoryResearch(focus, gate.pool)` (line 699): the quickest candidate in the pool whose *next* research unlocks something in RESEARCH_TARGETS.SCIENCE (Laboratory, Schoolhouse, Airfield, Launch Pad, the science projects, an Innovation wonder).
4. else `toward = researchTowardPath(focus, gate.pool)`. Its goals are every unresearched node in the tree whose first unlock is wanted (here Flight → Airfield, Rocketry → Launch Pad). It takes the goal with the fewest steps, and the quickest available prerequisite of it inside the gate pool.
5. after the gate: `victory` over all candidates (Flight mastery → Trans-Oceanic Flight, Aerodynamics mastery → Sound Barrier, Nuclear Fission → Manhattan, an `INNOVATION_WONDER`); then `pickBonusResearch` (`*_SCIENCE_VP` masteries, quickest first); then Future Tech.

Civics: `innovationCivics` (440–487) looks for civics whose first unlock is `*_SCIENCE_VP`, an Innovation wonder or a SCIENCE building. Modern has none (VERIFIED: no `VICTORY_SCIENCE_MODERN` modifier in age-modern's culture tree; only Future Civic's culture points). So civics fall to the game's advisor: logs show `CIVIC`, never `VICTORY_CIVIC`, in both games.

### The order seen (VERIFIED, UI.log)
- **Game 31:** Electricity (M0); then Steam Engine, Military Science, Combustion and Urbanization, each "→ Авиация" (toward Flight); Flight (M11). Then toward Rocketry: Industrialization, Mass Production, Radio (M18), Armor, Mobilization, Computation (M26), Aerodynamics (M29), Rocketry (M32). The gate opened at M37. After it: Flight mastery (M37), Aerodynamics mastery (M38), Nuclear Fission (M40), Electricity mastery (M44), Industrialization mastery (M45).
- **Game 30:** the same pattern. Rocketry was picked at M29 and in at M35. Then Flight mastery (M35), Aerodynamics mastery (M36), Nuclear Fission (M38), the masteries of Electricity, Combustion, Industrialization, Radio and Armor (M43–M47), and Future Tech (M48, M52, M62).
- Academics was in at M0 in both games. That is consistent with the legacy card CARD_AT_MO_SCIENTIFIC_2, which unlocks Academics (age-transition-gameeffects.xml:566); INFERRED.

### Is the order sensible?
- **Off-path nodes:** VERIFIED from progression-trees-tech.xml's prereqs. Rocketry ← Aerodynamics ← {Computation, Mobilization, Armor}, which pulls in every Modern tech but Nuclear Fission and Future Tech. So "quickest available on the gate's way" researches nothing off the path. The way costs the same in any order: Rocketry comes when its ~15 nodes are done, and the order only changes which unlocks arrive first.
- **What the order optimises:** it steers toward Flight first, because the Airfield is "wanted". But the Airfield is useless before Rocketry under the current code: no masteries, so its projects cannot start (see Q2). Science-raising unlocks would serve Rocketry better:
  - Electricity (Laboratory, +1 specialist per tile) is taken first. Good.
  - Computation (MOD_TECH_MO_SPECIALIST_HAPPINESS_MAINTENANCE, cheaper specialists) came at M26 in game 31 and M23 in game 30.
  - Expected gain from re-ordering is small, 0–1 turn of Rocketry (INFERRED).
- **Masteries waiting for Rocketry is correct** for masteries whose only effect is Innovation (INFERRED, from the timelines). After Rocketry research has nothing else to do, and each 2-point mastery took about 1 turn (game 31: Electricity mastery M44 → Industrialization mastery M45). They were all done long before the production-bound crossing: game 30's last came at M47–48, the crossing at M61. Taken before Rocketry, they would delay it about 7 turns for nothing.
- **Post-gate order is not by Innovation per turn (VERIFIED order; effect INFERRED):**
  - Nuclear Fission (8,500 cost, 0 Innovation itself; Manhattan is 3 Innovation for a 900-production wonder) came before the five 2-point masteries.
  - The Flight mastery (no Innovation itself) came first even when no Airfield was going to be built. Game 31 M38–M39: "no BUILDING_AIRFIELD in Лондон bought: the goal comes on turn 28 either way".
  - Cost: the 2-point masteries arrive 3–5 turns later. That matters only when the crossing is research-bound, which the fixes below would make more likely.

## Q2. Production for Innovation before Rocketry

VERIFIED from code and logs, per source:
- **Lever buildings** (LEVER_BUILDINGS.SCIENCE.AGE_MODERN: Schoolhouse, Laboratory; `pushVictoryWork` last loop 1446–1452) are queued in every city where `leverSoon` (≤ 12 turns). Game 31 built Laboratories from M20 to M41 (604–838 production, 10–20 turns each; CityBuildQueue GB1, GB2, GB7, GB11, GB15). They raise science for Rocketry and give no Innovation.
- **Science sites:** `activeSites` (580) keeps a site whose `needs` project is not unlocked out of the list. The Airfield needs the Flight or Aerodynamics *mastery*, and chooseResearch takes no mastery before Rocketry. So no Airfield is ever placed, bought or saved for before Rocketry. Neither game built one before M44 (game 31 London, M44–M46, unfinished).
- **Race model blind spot:** in `spaceRace` (1560–1617) an Airfield's projects are skipped while `!unlockReached(t)` (line 1603). So even once the Airfield is active, `siteHelps` sees only its cost until each mastery is in.
- **Radio Station / Radio Telescope:** excluded by design (`STANDING_SITE_PROJECTS`, run only where a Radio Station already stands). Game 31 queued a Radio Station by the plan at M35 (Newcastle) but never built it before the loss.
- **Innovation wonders:** `chooseWonders` adds `INNOVATION_WONDER_VALUE` 12 to wonders whose modifiers end in `_SCIENCE_VP`.
  - Game 31 built Oxford in Bristol (M2–M13, 808/750). Its +3, plus Oxford's two free techs, line up with Innovation 62 → 69 at M12. The +7 is INFERRED to be Oxford's 3 plus something else.
  - Game 30 started Oxford in London (M3–M7, 240/750) and lost it: it left the queue, probably a rival's (INFERRED).
  - Manhattan came only after the gate (game 31 London, M47).
- **Ignored or deferred Innovation before pads exist** (VERIFIED data; values game-scaled as the CSV shows: one-off 500, Preparation 1000, Radio Telescope probably 600):
  - **Trans-Oceanic Flight (5) and Break the Sound Barrier (5):** an Airfield (≈840–860) + 500 each. They need the Flight and Aerodynamics masteries. Before Rocketry, only the Flight mastery's cost (about 1 turn of research) would come out of Rocketry's way, and Break the Sound Barrier can run right after it.
  - **Radio Telescope (5):** Radio Station (780) + 600, plus the Radio mastery (2 Innovation of its own).
  - **Policies for project production** (Public Works +30%, Socialism branch; Think Tanks +10%/+20% capital, Globalism with Elective Republic):
    - Public Works was slotted at M45 (game 30) and M40 (game 31), after Socialism came from the advisor at M38 and M33.
    - Before Rocketry they are worth nothing, yet `core/xpl-effect-value.js:projectShare` (35–38) values project production at share 0.5 × worth 2 throughout Modern. It was not seen to slot one early; flagged as a latent misvaluation.

## Q3. The PADS savings bank

VERIFIED (data/xpl-autopilot-steps.js:padGoals 4685–4705; core/xpl-strategy.js:basePlan 194–202; core/xpl-savings.js:chooseGoal 97–110):
- **Goal order:** before Rocketry, `CONVERT > PADS > AIRFIELD`, with no LEVER goal. After it, `PADS > CONVERT > AIRFIELD > LEVER`. `pads` = min(5, max(3, cities)), which was 5 in both games.
- **What the bank holds:**
  - The bank's cost is the price of the missing pads in the cheapest cities: 11,344–11,956 in game 30, 11,552 in game 31.
  - What is **held** is `min(bank × gate.progress, prices[0])` (line 4704), at most `PAD_HOLD_SHARE` 0.75 of the free gold. That is one pad at most.
  - research/21 §4.5 designed it to hold "about the whole bank as Rocketry nears". The code diverges from that design.
  - The design's "earlier start in late Exploration" was never implemented.
- **Game 30:**
  - Held 756 at M1, rising to about 2,148 from M20, with a balance of 2,300–3,400 and income 67–154.
  - The free gold above the hold bought three Schoolhouses in towns through `buyVictoryWork`: Bristol at M11, Dundee at M23, Bradford at M32, 1,008–1,072 each, 3,088 in all.
  - At M35 (gate open) SAVING «космодромы» 2,620 had 2,618 available, so London's pad was bought at M36, one turn after Rocketry.
  - The bank was priced for the cheapest city (about 2,148), but the purchase went to London (2,620). The price mismatch cost that turn.
- **Game 31:**
  - M1: goal PADS held 770, then 700 went on a defender (Кирасир, Ньюкасл).
  - From M2 the goal is "none": income below zero, so `withinReach` fails. The balance fell 1,155 → 0 by M24 and stayed at 0–39 until M43.
  - No pad was bought; all five were built by production (M40–M43 to about M52–55).
- **Better use of that gold:**
  - A town Schoolhouse adds a few science against 400–900 a turn. At 1,008 gold that is well under one turn of Rocketry over the age (INFERRED).
  - The same 2,100–2,600 bought as a second pad at Rocketry would have started GB3's Preparation at about M37 instead of M52 (CityBuildQueue: GB3's pad was built M43–M51 at 58 a turn; its Preparation ran M52–M61 at 58).
- **Buying research:** no `PlayerOperation` or `CityCommand` buys technology in the code or in what research/07 lists. INFERRED: the game has none (no gold → science conversion besides buildings, specialists and endeavors).
- **Were pads bought the moment Rocketry landed?** Game 30: yes for one (a turn late, by 2 gold). Game 31: no gold. A pad in production with progress cannot be bought later either:
  - `victoryPurchases` skips the item a city is producing with progress (line 1834).
  - `padGoals` counts such a pad as `have` (line 4689).
  - Yet gotcha 58 shows the game sells an item in progress at the price of what it lacks.
  - Game 30 had 1,583–2,122 gold from M47 to M53 while GB3's pad stood at 438–806/735 and GB10's at 427–864/924.

## Q4. After Rocketry

VERIFIED (pushVictoryWork 1239–1455; CityBuildQueue Modern blocks):
- **Pads queued:** game 30 queued pads in London, Sheffield and Stoke at M35 (gate open) and Birmingham at M37. Game 31 queued five at M37.
- **Pads started only 3–8 turns later in every city that built one,** each behind an item in production with progress. The pad's `toFront` (line 1317) uses `frontSlot`, position 1 behind such an item.

  | Game | City | What it finished first | Pad started |
  |---|---|---|---|
  | 30 | GB10 | Cannery, 472, from M34 | M41 |
  | 30 | GB6 | Laboratory, M31–M41 | M42 |
  | 30 | GB3 | Grocer, then a Military Academy (M38–M42) | M43 |
  | 31 | GB11 | City Park, 357, **started M37** | M43 |
  | 31 | GB2 | City Park, 430, started M37 | M43 |
  | 31 | GB15 | Grocer, M36–M40 | M41 |
  | 31 | GB9 | Ironworks, M36–M39 | M40 |
  | 31 | GB7 | Laboratory to M41 | M42 |

  Several of these items were started 0–2 turns before Rocketry: game 31 queued "Городской парк, Радиостанция" for Newcastle at M35. Only wonders are kept out of pad cities near the gate (`padExclusion`, PAD_GATE_NEAR 0.6).
- **Pad build time:** 9–17 turns at 37–78 production (cost 672–924).
- **Preparation:**
  - It starts where a pad stands: London bought M36, Preparation M43–M53.
  - London first built a production-first Military Academy, M37–M42 (PRODUCTION_FIRST «Лондон, Военная академия, 10, 3819»).
  - Meanwhile UI.log said "PREP in Лондон: slot 0 (ahead of BUILDING_MILITARY_ACADEMY)" every turn M37–M40, but the move never happened. `projectSlot` (1095–1117) logs slot 0, then `toFront`'s `behindOwn` keeps the FIRST-ranked academy ahead.
  - The log misleads; the decision itself is about break-even (6 turns lost, Preparation 66–84 a turn afterwards against about 55 without the academy; INFERRED).
- **Race model too pessimistic (VERIFIED):**
  - "the goal comes on turn N" is relative (`siteHelps` 1622–1639, `Math.ceil(without)`).
  - Game 30 M35: 44 (= M79). Actual crossing M61.
  - Game 31 M38: 28 (= M66) with 24 needed. Research alone would bring about 16 of those (Aerodynamics 5, four 2-point masteries, Future Tech).
  - Cause: `innovationReach` counts only project runs.
- **Consequences of the pessimistic model:**
  - `siteHelps` approved pads in weak cities. In game 30: GB10 Preparation at 27.6 a turn (36 turns a run), GB6 at 27.6–33.5, GB2's pad from M56. None ran a Preparation before the crossing.
  - `spaceWork` gave London R = 3,819, about three runs, for production first.
  - `oneOffNext` put Launch Satellite "ahead" in London at M42–M46 while Preparation already had progress; Launch Satellite ran after it, M54–M61.
- **One-offs and other notes:**
  - Launch Satellite (500) ran in London M54–M61 at 35.7 a turn. London's production fell from 66 to 36 at M55, while empire Happiness fell 118 → 33 (M50 → M60) and specialists rose 32 → 36; the cause is INFERRED.
  - Game 30 crossed 100 at M61 on GB3's Preparation and London's Launch Satellite together (93 → 113).
  - The AIRFIELD goal held 2,216–2,284 for about 20 turns between M38 and M63 while `victoryPurchases` logged "no BUILDING_AIRFIELD in Ливерпуль/Лидс bought: … either way". That is the bug in Summary item 8.

## Q5. Exploration's end

VERIFIED:
- **Nothing prepares Modern** besides the remembered focus (gotcha 47). There is no pad bank, no clearing of production and no research timing.
- **Gold:** Exploration's last turns spent free gold on 84–100-gold buildings and an AGE_END Donjon, ending at about 600. Modern opened with 1,277 (game 30) and 1,155 (game 31).
- **Exploration Future Tech** (3 Innovation each, MOD_EX_FUTURE_TECH_SCIENCE_VP) was picked at E66 (game 30) and E61 (game 31); 52 → 55 and 59 → 62 followed. The research put into an unfinished node at the age change is presumably lost (INFERRED).
- **The legacy cards are the player's choice** (the autopilot is off at transitions). CARD_AT_MO_SCIENTIFIC_2 (+25% project production, free Academics) and CARD_AT_MO_SCIENTIFIC_4 are the science ones.

## Q6. Proposals, ranked by expected turns saved to 100 Innovation

Baseline: game 30, Rocketry M35, crossing M61, win M66. Estimates are INFERRED from the CityBuildQueue numbers quoted above; the overlaps are noted.

### P1. Two pads' worth of gold at Rocketry, and buy pads that are under way (about 7 turns)
- **Change:**
  - `padGoals`: before the gate, hold up to `min(bank, K × next price)` with K = 2, or the pads the race needs bought. Price it in the city `victoryPurchases` will buy in, its first missing-pad city (London 2,620, not the cheapest 2,148).
  - `buyVictoryWork` / `goldPlan`: while science COMMIT is before Rocketry and the bank holds less than K pads, buy no LEVER items with free gold. This would have stopped game 30's three town Schoolhouses (3,088).
  - `victoryPurchases`: allow buying the Launch Pad that is the item in production with progress. Price it with canStart PURCHASE `Cost` and use `Plots[0]` when `InProgress`, as `buyAgeEndItems` does.
  - `padGoals`: stop counting such a pad as `have` when gold covers it.
- **Effect:**
  - With a second pad bought at M36 in GB3 (58 a turn), its Preparation ends about M54. With London's at M53 and research's +23 (60 + 23 + 15 + 15 = 113), the crossing comes at about M54 instead of M61.
  - Buying GB3's pad under way at M47 (≈ 300 production left, about 1,000–1,200 gold) alone gives about M57.
- **Risk:** less science before Rocketry (town Schoolhouses: well under a turn). Gold held while a threat appears: `war.near` already empties the goals.
- **Tests:** autopilot-levers "before Rocketry the gold … is held" with gate progress 0.9 and gold for two pads. The hold equals two prices, and no Schoolhouse is bought. A new test: a pad in production at 50% with enough gold is bought (PURCHASE sent with InProgress plots).

### P2. Pads go to the front at Rocketry; pad cities start no long item just before it (about 5 turns, overlapping P1)
- **Change:**
  - In `pushVictoryWork`'s site loop (line 1317), give the Launch Pad a `padSlot` like `projectSlot`: position 0 ahead of a plain building with progress that is not a science site or wonder. Gotcha 20: the item behind keeps its progress, 11 of 12 cases.
  - Extend `padExclusion` beyond wonders: once the gate is ≥ PAD_GATE_NEAR (or its ETA ≤ an item's turns), pad cities start no non-production building that would still be in production when Rocketry lands. Covers `fillProduction`, the plan's queueing (QUEUED_PLAN) and the advisor.
- **Effect:** game 30's GB10, GB6 and GB3 pads 5–8 turns earlier; GB3's Preparation (the M61 crossing) about 5 turns earlier. Game 31: five pads 3–6 turns earlier.
- **Risk:**
  - Game 3's opposite case (the moved item took the progress): it only helps the pad.
  - A Laboratory left half-built loses science that no longer matters after Rocketry.
- **Tests:** a fake city with [Laboratory 50%, Launch Pad] after the gate opens: the pad goes to index 0. Gate at 0.9: `fillProduction` queues no City Park in a pad city.

### P3. The Airfield's flights before Rocketry (about 7 turns, overlapping P1)
- **Change:**
  - `chooseResearch`: with the science focus in Modern, add the Flight mastery to the gate pool once Flight is in (about 1 turn of research) when a city without a planned pad can have an Airfield, or gold can buy one.
  - Take the Aerodynamics mastery right after Rocketry. It is already second after the gate.
  - `activeSites` / `spaceRace`: count an Airfield's projects whose mastery is in the gate pool or researching.
  - `strategy.basePlan`: keep AIRFIELD as a goal before Rocketry (it is) and let it buy at about M12. Game 30 had 3,000+ gold idle M5–M35.
- **Effect:** +10 Innovation by about M41: Trans-Oceanic before Rocketry, Sound Barrier soon after. With London's Preparation at M53: 60 + 23 + 10 + 15 = 108, so the crossing comes at about M53 instead of M61. Rocketry comes about 1 turn later.
- **Risk:**
  - A weak sixth city takes 25+ turns to build it. Then only a bought Airfield pays.
  - Gold for the Airfield competes with the pad bank. Game 30 had enough for both (about 5,700 by M36).
- **Tests:** victory-levers / autopilot-levers. With Flight researched and the gate at 0.4, the Flight mastery is picked next when no pad is planned in some city. `siteGoals` offers the Airfield before the gate.

### P4. Count research Innovation in the race model (correctness; 0–3 turns directly, enables P1–P3)
- **Change:** `spaceRace` / `innovationReach` take research events:
  - Rocketry 5 at the gate's ETA;
  - each remaining `*_SCIENCE_VP` mastery at the cumulative `getTurnsForNode`;
  - Future Tech 3 each at its turns;
  - Oxford/Manhattan when queued, at their turns.

  Also count an Airfield's flights once their mastery is planned.
- **Effect:** the M35 forecast becomes about 26 turns instead of 44.
  - `siteHelps` stops approving pads that never run a Preparation (game 30's GB10, GB6, GB2: about 2,500 production).
  - `spaceWork` sizes production first to the runs actually needed.
  - `oneOffNext` decides Launch Satellite on the real gap.
- **Risk:** an optimistic forecast refuses a pad that was needed. Keep a margin of one Preparation run.
- **Tests:** innovationReach with research events; the siteHelps verdict changes with masteries pending.

### P5. Post-gate research by Innovation per turn (0–4 turns once P1–P3 make the crossing research-bound)
- **Change:** after the gate, rank candidates by points / `getTurnsForNode`:
  - mastery points;
  - a project's points only where its site stands or will (`siteHelps`);
  - a wonder's points discounted by its production.

  The 2-point masteries then come before Nuclear Fission, and the Flight mastery is skipped when no Airfield will come.
- **Effect:** game 31's ten mastery points about 4 turns sooner (M40–M44 instead of M44–M48).
- **Tests:** autopilot-levers "then the masteries": Nuclear Fission available and five masteries at 1 turn each, no Airfield. A mastery is picked first.

### P6. Production over science once Rocketry and its masteries are in (2–4 turns)
- **Change:**
  - In COMMIT, once the gate is open and the `*_SCIENCE_VP` masteries are done, switch the pass's profile or bias (`BIAS_SETS` SCIENCE S1.5) toward production and Happiness.
  - The growth job places citizens on production tiles, not specialists. Science cards make way for Public Works.
- **Evidence (VERIFIED):**
  - Game 30, M50 → M60: specialists 32 → 36, Happiness 118 → 33, London's production 66 → 36 (CityBuildQueue M55). Its Launch Satellite took 9 turns instead of about 5.
  - Science is then worth only Future Tech: 3 points per 10,000+.
- **Risk:** Future Tech comes slower.
- **Tests:** strategy.test: gate open plus masteries done → profile PRODUCTION-weighted.

### P7. Fix the AIRFIELD goal (bug; 0–4 turns)
- **Change:** `siteGoals` applies `siteHelps(…, {bought: true})` as `victoryPurchases` does. Today it holds gold for an Airfield the purchase step refuses (game 30, about 20 turns between M38 and M63, 2,216–2,284 held).
- **Tests:** with siteHelps false, `goldPlan` sets no AIRFIELD goal.

### P8. Exploration's end prepares Modern (0–1 turn)
- **Change:** with the science focus, in Exploration's last AGE_END_TURNS, start the PADS bank (research/21 §4.5's unimplemented "earlier start"): no purchases under a few hundred gold. Time Future Tech so that one finishes before the age ends.
- **Effect:** about 500–600 more gold at M1, a quarter of a pad.

### P9. Socialism (Public Works +30% project production) as a Modern civic goal before Rocketry (0–2 turns)
- **Change:** `innovationCivics` also targets civics unlocking a tradition with `EFFECT_CITY_ADJUST_PROJECT_PRODUCTION` in Modern (Socialism; Globalism under Elective Republic).
- **Effect:** in both games Public Works was in before the first Preparation run, so the gain was small. It is a guard for games where Socialism comes late.

### Bugs and inconsistencies to flag
- **`siteGoals` ignores `siteHelps`** (data/xpl-autopilot-steps.js:siteGoals 4588–4620). Gold was held for an Airfield the purchase step refuses (game 30, M38–M63).
- **`spaceRace` counts no research Innovation** (1560–1617). It also skips an Airfield's flights until their mastery is in (line 1603). The forecast was 44 turns against a real 26 (game 30, M35).
- **`padGoals` holds one pad, not "about the whole bank"** (line 4704). That is a divergence from research/21 §4.5. It also prices the cheapest city while the purchase goes to another (game 30: 2,148 held, 2,620 needed, the pad one turn late).
- **A pad under way is never bought** (`victoryPurchases` line 1834; `padGoals` line 4689).
- **`projectSlot` logs "slot 0 (ahead of …)"** while `toFront`'s `behindOwn` keeps a production-first item ahead (game 30, M37–M40, London): a misleading log.
- **`projectShare` values project production at share 0.5 × 2 all through Modern** (core/xpl-effect-value.js:35–38), before any project can run.
- **"victory work: no BUILDING_AIRFIELD … bought"** is logged 3 times per pass (game 30 M36; `victoryPurchases` is called from padGoals, the LEVER goal and buyVictoryWork). This is noise only.

### What game 31 needed (INFERRED)
Game 31 lost to culture at M46; its science crossing would have come about M65+. Its gold income was below zero for most of M1–M40 (defence purchases and unit upkeep; the balance was 0 from M24 to M43), so P1 and P3 had nothing to spend. P2 and P5 would have saved about 3–6 turns. Beating M46 would have needed Innovation of about 85+ by Rocketry (M37) and a pad bought at once. Neither was possible without the gold economy and earlier pre-Rocketry Innovation (P3, Radio Telescope).
