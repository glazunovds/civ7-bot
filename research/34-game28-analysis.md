# Game 28: science win, with substantial happiness and production losses

**Won the science victory at Modern turn 93.** Rocketry opened at M51; three completed Crewed Space Flight Preparation runs took Innovation from 73 to 118 at M84–M88; the five-turn countdown ended at M93. The best met rival had 31 Innovation at the start of our countdown. The bot followed the science victory successfully, but restoring the existing cities' happiness is the clearest next improvement.

This is the next game after the nine review fixes in `33-review-fixes.md`. The local Hall of Fame calls it GameID 30; “game 28” follows this repository's analysis numbering. Played on Online speed, Xerxes, Assyria → Abbasid → time-tested Abbasid. Only science victory was enabled. No gameplay code or saved settings were changed during this audit.

## Findings and recommended order

1. **Fix policy scoring for local unhappiness before raising Science further.**

   At M16 the bot swapped **Living Standards → Social Science**, scoring them **23.2 versus 193.6**. Living Standards reduces building gold/happiness maintenance; Social Science gives +3 Science per specialist but adds 1 Food and 1 Happiness upkeep per specialist. On M17 the six core settlements' recorded production fell **187 → 110 (−41%)**, and Science **260 → 182 (−30%)**. There were other actions that turn, including two specialist assignments, so the entire change cannot be assigned to the policy swap alone. The widespread happiness drop, the effect definitions, and the scoring code nevertheless identify a concrete problem.

   `cardValue` in `data/xpl-autopilot-choices.js` weights an empire-wide preview using a plain dot product. It does not price the production/science lost when particular cities become unhappier. The extra happiness adjustment applies only to crisis cards, handles flat happiness losses, and still uses the older cost multiplier. It does not cover the indirect yield penalties caused by this ordinary policy's maintenance effects or by removing Living Standards.

   **Change:** evaluate policy replacements against each settlement's resulting happiness, including the yield penalty, and prioritize happiness-saving policies/civics when core cities are suffering. Free Speech was slotted at M41; by M42 core production was 269, versus 156 at M40. Other simultaneous changes prevent attributing that whole increase to one card, but the recovery is large.

   **Preview integration issue:** the installed Policy Yield Previews uses `2 * specialists` as the maintenance basis for percentage worker-maintenance changes. Modern's nominal upkeep is 6 per specialist. This understates percentage savings such as Free Speech, before considering the additional value of recovering penalized city yields. The preview mod is read-only for this task; incorporate accurate city upkeep into our adapter or coordinate a separate fix.

   Evidence: UI.log lines 805535–805536, 806840–806842, 1023652; Hall of Fame GameID 30 city Happiness/Production/Science series; current `xpl-autopilot-choices.js` `valueOf`, `cardValue`, `happinessLoss`; Modern `traditions-gameeffects.xml`; installed preview `3515801789/scripts/effects/apply-effects.js:638`.

2. **Repair existing cities' happiness before paying for more cities.**

   Empire happiness hid the problem because happy towns offset unhappy cities in the aggregate. The six core settlements' Modern history is:

   | Settlement | Turns below 0, out of 93 recorded turns | Lowest Happiness | Turns at the 80% penalty cap | Mean production |
   |---|---:|---:|---:|---:|
   | Ниневия — Nineveh | 81 | −26 | 16 | 40.5 |
   | Кальху — Kalhu | 93 | −33 | 29 | 22.9 |
   | Арби-Илу — Arbi-Ilu | 84 | −19 | 13 | 38.4 |
   | Аррапха — Arrapha | 85 | −11 | 0 | 45.6 |
   | Шираз — Shiraz | 0 | +2 | 0 | 41.8 |
   | Ахваз — Ahvaz | 72 | −10 | 0 | 27.1 |

   At M20 the core had **−65 total local happiness**, while its six towns had **+95**. Neither a positive empire total nor staying under the settlement cap protects a particular city's yields. The empire was never over its settlement cap in the recorded game.

   The game's rule is 5% loss of Production, Gold, Science, Culture and Influence per negative Happiness, capped at 80%. A fixed-state calculation from the recorded city yields gives approximately **8,200 production and 15,600 local Science** of potential recovery if these six settlements had been at least neutral all Modern. This is an upper-bound diagnostic, **not a claim those yields could all have been recovered**: obtaining happiness costs resources, affects other choices, and changes the future city state. At −33, a small +5 Happiness building does not even leave the penalty cap.

   **Change:** add a local recovery priority based on restored yields per turn/cost; include maintenance, overbuilding losses, and the time to regain neutral happiness. Building valuation currently subtracts happiness upkeep through `costValue`, but `p.value` does not include the reverse benefit of a happiness building restoring other yields.

   Evidence: captured `history.json` in `game28/evidence.zip`; `xpl-building-job.js` around `upkeepValue` and `net`; `xpl-placement-solver.js` `describePlan`; `xpl-scarcity.js` `unhappinessShare`.

3. **Recheck specialist gains when a city is already badly unhappy.**

   The bot continued adding specialists in penalized cities. Examples: Kalhu at M20 and M25, Nineveh at M24 and M27. Nineveh's M27 assignment was valued at **19.6**, while its recorded local Science moved only **26 → 27** by M28 and happiness went **−23 → −26**. The score also includes other yields and the high-yield-tile bonus, so it is not directly comparable to one Science; it is evidence that the whole-city outcome needs a closer check.

   **Code gap:** `growthAdvice` adds the tile's preview gain through `gainValue`; that helper does not scale Production/Science gains by the city's unhappiness penalty. `costValue` accounts for extra penalties on existing output, but at the 80% cap that extra penalty is zero. This can make extra specialists attractive while the city remains severely suppressed. The 120-yield-tile incentive can further increase their score.

   **Change:** compare complete before/after settlement yields, including the new specialist's own discounted output and maintenance; check whether the threshold bonus is actually attainable and useful. This is preferable to a blanket ban on all specialists below zero.

   Evidence: UI.log specialist actions at lines 836812, 868844, 877120, 896300; corresponding Hall of Fame records; `xpl-growth-job.js` specialist scoring and `xpl-scarcity.js` `gainValue`/`costValue`.

4. **Production investment improved, but should start before long science work and account for happiness.**

   Warehouses were built in both earlier ages, and four Ironworks were completed in Modern: Nineveh M24, Arrapha M33, Ahvaz M41 and Arbi-Ilu M53. Kalhu spent M45–M53 on an Ironworks without finishing it, then military work and the Airfield took over. Only one explicit `PRODUCTION_FIRST` decision appeared, a Harbor in Arrapha at M51; this does **not** mean there was only one production investment, since ordinary plan queuing built the Ironworks.

   Kalhu spent **18 turns on a Grocer**, **19 on a Mosque**, and **25 on an Airfield**, while remaining below zero Happiness throughout Modern. Some happiness infrastructure may have been justified, but the log does not preserve every available building's cost and yield preview, so the exact best alternative cannot be reconstructed. More production buildings alone would also be penalized while happiness stayed low.

   **Change:** compare “happiness recovery → production upgrade → target” and “production upgrade → target” with building the target immediately, for any expensive science investment. Log the top few alternatives with their costs, net gains and rejected-payback reasons. There is insufficient evidence to prescribe “build every cheap building first.”

5. **The science finish worked; five Launch Pads exceeded the number that contributed before the countdown.**

   | City | Launch Pad completed | First Preparation completed | Other outcome |
   |---|---:|---:|---|
   | Arbi-Ilu | M68 | M84 | Launch Satellite completed M90 |
   | Nineveh | M73 | M88 | Next Preparation unfinished at victory |
   | Shiraz | M74 | — | Preparation repeatedly interrupted by defense |
   | Arrapha | M75 | M88 | Next Preparation unfinished at victory |
   | Ahvaz | M83 | — | Preparation unfinished at victory |
   | Kalhu | — | — | Airfield M89; first flight unfinished at victory |

   Innovation: **18 at Antiquity end → 47 at Exploration end → Rocketry's 52 at M51 → 73 at M82 → 88 at M84 → 118 at M88**. The old science-initiative stall did not recur: **zero Modern city turns were spent on `PROJECT_CITY_SCIENCE_PROJECT`**. Earlier Innovation projects also completed: Spherical Earth A50, Chart the Stars A54, Heliocentric Model E34, Invent Calculus E52.

   **Change:** choose the number and location of new space sites by their marginal effect on the empire's expected finish time. Five is a useful capacity target, but a fifth site or an Airfield that finishes after the main race is won should lose priority. Do not conclude from hindsight that Shiraz's pad was inherently wrong: its later attacks were uncertain when it was ordered.

   Evidence: CityBuildQueue.csv and UI victory-race lines, preserved with original line numbers in the archive. The new race model also deserves a targeted review: `spaceRace` adds a progressing head item's remaining work to `wait`, then can add the same queued science site again in its site loop. That is a code-level double-counting risk; this audit does not assign a number of lost turns to it.

6. **Late expansion and defense constrained the race and the treasury.**

   Modern used **30 city-turns on settlers**, **47 on other units**, and **36 on walls**, out of **552 recorded city-turns**. Eight settlers were completed; seven new settlements were founded; Sirjan was lost (its city-history series ends at M58), leaving 16 settlements. The capital produced tanks at M48–52, M54–57 and M62–66. Its pad, ordered M51, did not finish until M73. The latter two tanks alone used nine turns while the pad was waiting or interrupted.

   Threats were real: Shiraz, Ahvaz, Ardebil and newly founded Sirjan repeatedly had hostile units nearby. Those defensive orders cannot simply be removed from a counterfactual without allowing for losses. The strategic improvement is to avoid creating expensive new obligations once Rocketry is near, and to use safe non-space cities for defenders when feasible.

   Unit maintenance rose **84 → 246 gold/turn** by M80. Net gold was negative on **17 Modern turns**, and the balance reached zero on **M80–82**. The recorded Modern purchase ledger spent 2,680 on defenders, 1,920 on upgrades, 1,080 on repairs, 1,068 on walls and 700 on a garrison. These totals are from the bot's ledger; they are not an assertion that every spend was avoidable.

7. **The city/town balance was adequate; there is no evidence that blanket extra conversions would have won sooner.**

   End-of-age balances: **3 cities / 3 towns**, then **6 / 4**, then **6 / 10**. Five towns were converted during the first two ages, and the six cities returned at M2 through the age-transition legacy. There were no Modern conversions.

   The cheapest eligible conversion was **2,500 gold**, while the highest recorded Modern treasury was only **1,557.4**. Established candidates such as Hilakku and Imgur-Enlil had approximately **21–22 production**; newly founded towns were mostly much weaker. A seventh city would require conversion money, infrastructure and a space site, while losing some town income/focus and increasing empire building costs. Restoring the six existing cities offers a more immediate opportunity.

   Two town Schoolhouses cost **1,260 each** (Hilakku M21, Imgur-Enlil M38). They helped research before Rocketry, but should be compared explicitly with banking for a pad, local happiness recovery, or an early developed-town conversion. The savings system recorded **no goal on 85 of 92 Modern passes**; the 12-turn savings horizon discards distant purchases. This can repeatedly favor affordable secondary spending over a large investment.

   **Change:** maintain six healthy, productive cities as the first objective; evaluate one additional developed city early using a complete conversion-to-contribution forecast. Keep weak or late settlements as feeders or income towns. Reassess continued founding after the victory's research gate is close.

8. **Test more Production and Happiness weight, with a separate post-Rocketry balance.**

   The actual science sliders were **Food 0.7, Production 1.0, Gold 1.0, Science 1.5, Culture 1.0, Happiness 1.0**, confirmed both by the economy logs and current saved settings. On the Science profile these multiply base weights, so the current Science-to-Production weight ratio is **3:1**.

   A reasonable **experimental** preset is:

   | Slider | This game | Before Rocketry trial | After Rocketry trial |
   |---|---:|---:|---:|
   | Food | 0.7 | 0.7 | 0.7 |
   | Production | 1.0 | 1.5 | 1.8 |
   | Gold | 1.0 | 1.2 | 1.2 |
   | Science | 1.5 | 1.5 | 1.0 |
   | Culture | 1.0 | 1.0 | 1.0 |
   | Happiness | 1.0 | 1.5 | 1.5 |

   Keep Culture relevant: it unlocks the maintenance-saving policies that helped the core recover. Science still earns Innovation through masteries/Future Tech after Rocketry, so it should retain a positive weight. The settings currently store one balance per focus, not an automatic pre/post-Rocketry pair; applying this schedule would require a manual switch or a code change.

   **Sliders alone cannot repair omitted policy/building happiness effects.** Fix the scoring gaps first, then compare the preset on the same seed/start conditions. Track Rocketry turn, first pad turn, turn reaching 100 Innovation, per-city negative-happiness turns, completed production upgrades before Rocketry, and gold spent on expansion/defense. One winning game cannot establish an optimal slider vector.

## Evidence, calculation and limits

- Primary result: `GameCore.log`, 2026-10-18 01:20:42, Team 0 science victory. The terminal production/stats records are M93; the Hall of Fame's `TurnCount=92` is not used as the victory turn.
- Reproducible companion: `game28/analysis.ipynb`; helper: `game28/analyze.py`; captured inputs: `game28/evidence.zip`; calculated output: `game28/summary.json`.
- CSV grain is age + turn + player, or age + turn + player + city/item. Turns reset between ages: A70, E70, M93. `Player_Stats.csv` has 22 header labels but 25 values per row; only verified columns through Diplomacy are used, and the unlabeled trailing fields are ignored. All 4,332 stats rows have unique age/turn/player keys.
- Hall of Fame values are sparse change points; the previous value is carried forward until the next change, stopping at the null end marker. Modern city-level series were cross-checked against the UI economy samples and production log. UI values are sampled during the bot's pass and may differ from turn-history values due to actions and rounding; local city Science also excludes some empire modifiers. These series are not substituted for each other.
- `Balance_Happiness.csv` logs specific events, not every city's continuous happiness. Using it alone would miss the prolonged Modern deficits. Empire total happiness also hides local deficits.
- Production log runs may be interrupted, resumed or repaired. A completion is recorded only when current production reaches required production; repair purchases are not counted as new infrastructure. “Production Added” is raw input, so it is not equated to progress after project multipliers.
- The capture contains the original CSVs and selected UI lines with original line numbers and source hashes. It includes only this game's local city history from the read-only Hall of Fame database, not the full database.
- These are observational findings. Alternative available placements/building previews were not logged, so there is no defensible exact “optimal win turn” or guarantee that a particular extra building/conversion would improve it. The zero-unhappiness calculation holds the recorded city state fixed and is explicitly an upper bound, not a forecast.
- Validation: the bot's existing test suite, import check and syntax/XML check were run; the companion notebook's code cells are executed sequentially from fresh state, and the high-impact numbers are reconciled against the preserved inputs.

## Confirmed and changed (the user: «Confirm and fix»)
Each finding was checked against the logs (UI.log, `net_message_debug.log`) and the game's data before any change. Each change has a test that fails without it: 13 cases, reverted one by one on a copy (scratchpad `prove_r10.py`). TESTING rows 322–331. The video's claims (`cities-vs-towns-script.txt`) are research/35.

1. **Policies priced in each settlement (§1). Confirmed.**
   - **Evidence:** UI.log line 805535: `POLICY_SWAP ["Уровень жизни","23.2","Общественные науки","193.6"]`. Living Standards gives −25% building upkeep in gold and Happiness. Social Science gives +3 Science a specialist and +1 Food and +1 Happiness upkeep a specialist (traditions-gameeffects.xml).
   - **Changed:** `localHappiness` in data/xpl-autopilot-choices.js works out each card's Happiness change in every settlement and prices it with `happinessWorth` (below):
     - flat Happiness;
     - Happiness per specialist;
     - specialist upkeep (Amount per specialist, or Percent);
     - building upkeep (with Happiness: true).

     A slotted card is valued at what taking it out would cost.
   - **The previews' 2-a-specialist basis** for a percent change (Free Speech's −50%) is corrected to the game's own upkeep (`CurrentMaintenance`).
   - **A crisis card's Happiness** that crosses zero counts at full weight, no longer ×2, now that the penalty is priced on its own.
2. **Happiness buildings win yields back (§2). Confirmed.**
   - **`happinessWorth`** (core/xpl-scarcity.js) is exact while the penalty's share moves (5% a point). At the 80% cap each point counts its share of the way back to zero, so Kalhu's +5 at −33 is no longer worth nothing, nor a further −6 free.
   - **The building job** gives a happiness building that value in a settlement below zero, wherever it stands there (`happinessRecovery` → `extraValue`; `recovery` and `net` in the plan's rows). So it comes earlier in the plan and its purchase is worth more.
   - `gainValue` and `costValue` use `happinessWorth` too.
3. **Specialists in unhappy cities (§3). Confirmed.**
   - **The gap:** `gainValue` counted a specialist's own Science at full weight at −23.
   - **Changed:** penalised gains now count at what the city keeps once the specialist's upkeep is paid (`happinessAfter`). Kalhu's and Nineveh's specialists at the cap now lose to a tile.
4. **Production first with Happiness (§4). Confirmed, and two changes.**
   - **Unhappy cities:** a building's new production counts at what the city keeps, and its Happiness (its own less its upkeep) wins production back or loses it. At −25 a +8 Happiness building beats an Ironworks.
   - **Military-tagged production buildings:** see research/35 §7. The Military Academy (+9, adjacency, 420) was never considered, nor the Barracks, Armorer or Shipyard.
5. **Space sites by their effect on the finish (§5). Confirmed.**
   - **The double count:** a site in production with progress was counted twice in `spaceRace`'s wait (`ahead`, then again as a queued site).
   - **`siteHelps`:** beyond the victory's own Launch Pad, a pad or an Airfield is ordered or bought only where the race reaches the Innovation still needed sooner with it than without it. UI.log: `victory work: no <site> in <city>: the goal comes on turn N either way`.
6. **Late expansion and defence (§6). Confirmed.**
   - **The evidence:** game 28 had only the science victory on (`off ["DOMINATION","SCORE","MILITARY","CULTURE","ECONOMIC"]`). The final push still filled the cap: 10 → 16 settlements of 17, one lost. The capital (Ниневия) trained Tanks for Sirjan and Ardebil, both new (`QUEUED_DEFENDER` ×3).
   - **Settlers:** the final push fills the cap only while settlements score (the military victory or the score victory on: `settlementsScore` in `strategyFacts`). Otherwise, settlers only below half the cap and not once the gate is 60% in (`SETTLERS_GATE_NEAR`).
   - **Defenders** for a threatened settlement come from a city without space work when one within reach can train them, the space cities last (`spaceLast`).
7. **Cities and towns (§7):** see research/35 §5. A city target (Antiquity 5; Exploration 6, then 8), waiting while any city is below zero Happiness.
8. **Sliders (§8). Not changed.**
   - The fixes above are what the audit asks for first: "sliders cannot fix effects the scorer omits".
   - The preset stays an experiment for the user: Production 1.5–1.8, Happiness 1.5, Science 1.0 after Rocketry.
   - A balance that switches after Rocketry would be a code change; it waits for evidence from a game with the scoring fixed.
9. **Also not changed:**
   - the savings horizon (12 turns; "no goal on 85 of 92 Modern passes");
   - the video's age-transition conversion (research/35 §4).
