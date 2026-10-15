# 22. Game 7: lost to a military win at 39/100 Innovation

Game 7 (2026-10-14, 02:26–02:59, one session: Antiquity 1–~70, Exploration 1–~70, Modern 1–61). Aksum in Antiquity, science focus, autopilot on, the research/21 build (M1–M7). Player 2 (Amina) won a military victory at Modern T61. We had 39 Innovation.

Evidence: scratchpad reports `forensics-game7-expansion.md`, `forensics-game7-science.md`, `forensics-game7-diag.md` (with `g7/xpla.log` and `xpl.log`, our UI.log lines tagged by age and turn), and the game's Logs folder of that session.

## 1. What happened

| Age | Settlements (cap) | Innovation at the end | What went wrong |
|---|---|---|---|
| Antiquity | 1 city until T42; 2 cities + 1 town at the end (cap 4–5) | 23 | A camp (tribe 13) raided the capital T16–T38; settlers waited 19–22 turns in it; one was killed after stepping out of our land; strikes never fired (every prediction dropped); no wonder (expansion first all age) |
| Exploration | 2 cities + 2 towns for most of it, 3 + 3 at the end (cap 8–11) | 34 (+11) | A settler had no reachable site for 28 turns (rough seas until Shipbuilding) and blocked training; Invent Calculus missed by 19 production at the age end (−10); no wonder (queues never empty); a phantom savings goal held ~900 gold for 29 turns |
| Modern | 1 city + 5 towns at T1 → 3 + 4 at T61 (cap 16) | 39 (+5, all from Rocketry at T59) | The Rocketry gate took the whole age (15 techs deep); the Launch Pad bank held more gold than we had: nothing but repairs bought for 53 turns; no settlers in the final push at 7 of 16 settlements; Amina's military countdown from T56 |

- **Never the problem:** research speed (we led science all game: 573 a turn in Modern against ≤ 313) and techs.
- **Nothing crashed:** no `[XPL] ERROR`, no failed step, no BLOCKED; 222 turns ended by the autopilot.
- **The military win:** Amina reached 14 settlements; second place stayed at 46 points while she climbed to 68. The watch saw it (`RIVAL_NEAR_WIN` at T41, `RIVAL_COUNTDOWN` at T56) and the overlay turned settlers on, but one settler trained at T51 never founded. We needed about 3 more settlements at T41 and had ~1,000 gold idle; settlers are never bought.

## 2. Bugs (code errors)

| # | Bug | Evidence | Fix | Where |
|---|---|---|---|---|
| B1 | `ComponentID` is not a global: the game's UI imports it (`/core/ui/utilities/utilities-component-id.js`). Our `safe(() => ComponentID.isMatch(…), a === b)` fell back to object identity, so **every combat prediction was dropped**; the district check in `raidersNear` was off too | 56 `SimulateCombatResult` arrived in 11–25 ms with equal tokens, all `match false`; 55 timeouts; 1 strike in Antiquity while raiders sat next to the capital for 23 turns; two STRUCK Knight-on-Cog orders that never happened (not in CombatLog.csv) | Compare ids by value (`owner`, `id`, `type`) in our own helper; `isValid` = `id.owner >= 0 && id.id >= 0`; the fake must not define a global `ComponentID` (it was too kind). Also `hud/xpl-production-tacks.js` `toLogString` | `data/xpl-autopilot-units.js` simulateAttack, listenToSimulations, raidersNear; `hud/xpl-production-tacks.js` |
| B2 | A town conversion can never be a savings goal: `canConvert = check.Success`, and the game says Success false while the gold is short (its own button is disabled then), so the Towns tab rates the town BLOCKED and no CONVERT goal forms | 2 conversions in the whole game (A48, E47), gold idle at 1,000–1,356 in Exploration | `canConvert = Success || InsufficientFunds` (keep `affordable = Success`); the fake answers like the game: Success only when the gold covers `getTownUpgradeCost` | `data/xpl-town-job.js` runTownAdvisor; `tests/fakes/fake-engine.mjs` |
| B3 | The Launch Pad bank holds more gold than the treasury: hold = bank (3 pads, 6,848–7,320) × the gate's progress → `free()` = 0 for all of Modern | Held 922 at T8 against 638; 6,832 against 1,395 later; zero non-repair purchases in Modern; at Rocketry 1,242 gold for a 2,484 pad | Hold at most the next pad's price (one pad first) and never more than a share (75%) of the gold above the reserve; drop the bank when the gate is out of reach this age | `data/xpl-autopilot-steps.js` padGoals; `core/xpl-savings.js` |
| B4 | A phantom LEVER goal: the game sets `InsufficientFunds` by the gold alone, also for a building the city already has; `victoryPurchases` does not check `cityHas` | «Университет (Масте)» the goal from E41 to E70 after it was bought at E40 (CityPurchase.csv); it vanished whenever the balance covered the price | Skip levers the settlement has or has queued (`cityHas`, `queueTypes`), as `codexGoals` does | `data/xpl-autopilot-steps.js` victoryPurchases |
| B5 | No wonder in the whole game: a chosen wonder goes only into an **empty** queue, and with the science focus `pushVictoryWork` keeps every city's queue busy with levers. Also: Antiquity `expandingFirst` held wonders all age (below the cap all age); Modern `padCities` excluded every city (3 pads, 3 cities) | Shwedagon free from about E19 to E55, never queued; Nalanda free A49–A56 | Queue a chosen wonder at `leverSlot` in a busy queue; expansion holds wonders only while a settler is in training or walking; at most `cities − 1` pad cities, only once Rocketry is near | `fillProduction`, `expandingFirst`, `padCities`, `chooseWonders` |
| B6 | `considerTownProjects` sends CONSIDER_TOWN_PROJECT for a town whose Focus `setTownFocus` set in the same pass (the notification is stale) | Fort Town sent 3 times, each followed at once by CONSIDER_TOWN_PROJECT | Skip towns the towns step just gave a Focus | `data/xpl-autopilot-choices.js` considerTownProjects, hud |
| B7 | Defenders bought against naval raiders | 2 Knights (2 × 420 gold) against cogs and privateers they cannot attack | Count only land units for training/buying land defenders; walls still help | `buyDefenders`, `trainDefenders`, `threatenedSettlements` (land count) |
| B8 | A settler stepping away from danger may leave our land | The second Antiquity settler moved to 31,23, then 31,22 outside our borders and was killed (A36) | Settlers step only onto our own tiles (or next to our soldier); else stay | `data/xpl-autopilot-units.js` stepAway for settlers, runFromDanger |
| B9 | A second full pass in the same turn: the game re-activates our turn after an automated explorer (`PlayerTurnActivated` again) | 24 turns had two full passes | Once per turn unless forced: the second activation only orders units and ends the turn | `hud/xpl-autopilot.js` |

## 3. Algorithm problems

**A1. Expansion (the main loss; the user: "too low space to settle, but we should if we have too few cities").**
- Sites were not missing in Antiquity and Exploration (4–9 picks per search; the C3b gate never blocked), but:
  - **settlers waited** 19–22 turns in a threatened capital (`SETTLER_WAITS`), and the camp's village was unseen, so it could not be befriended until A32;
  - **long walks:** `pickSite` takes the first pick by value within `SETTLE_MAX_TURNS` 10: walks of 6–10 turns; a settler flipped between two goals every turn (A43–A46);
  - **phases:** Antiquity BUILD at 50% with 1 city: in BUILD units no longer overtake projects (E1), so the replacement settler waited behind Chart the Stars; Modern COMMIT trained no settler at 7 of 16;
  - **rough seas:** an Exploration settler had no reachable site for 28 turns (every pick across ocean before Shipbuilding), and as "the one in flight" it blocked training another;
  - **gold:** settlers are never bought; ~1,000 gold sat idle.
- **Modern:** the site search ran out (candidates fell from 8 to 2) as our land and rivals grew: the rules (5 tiles from any foreign settlement, 6 from any village, room) leave no site on a crowded map.
- **Fixes:**
  - **Expansion by deficit:** while settlements < cap − 1 (any age, any phase), settlers may overtake projects (not wonders with progress) and are trained even in COMMIT; 2 in flight while below cap / 2.
  - **`pickSite` by value per turn:** score = value ÷ (1 + turns ÷ 4); at most 5 turns while we have fewer than 3 settlements; keep the current goal while it stays valid (no flip-flop); log why a settler gets no order.
  - **Settlers in danger:** wait at most 3 turns, then a site within 3 turns on the safe side; never two settlers in one threatened settlement.
  - **Buy settlers** with free gold when below cap − 1 and a reachable site is known (`CityCommands PURCHASE {UnitType}`); a new savings kind SETTLER while far below the cap.
  - **Rough seas:** a settler whose every site is across the ocean (Exploration, before Shipbuilding) does not count as in flight; research goes to Shipbuilding first (it is on Urban Planning's way anyway).
  - **Space-scarce mode (the user's point):** when the strict search finds fewer than 2 reachable picks and we are far below the cap (settlements < cap − 2, or fewer than 4 cities), search again with relaxed rules: foreign distance 5 → 4, the village rule 6 → 4 for friendly and neutral villages we can befriend first (befriend before founding), unseen villages a penalty instead of a reject, room HIGH; log `sites: relaxed …`.

**A2. Research.**
- **Exploration gates are a union:** the quickest wanted research on either way came first; Heliocentric (5) was reached before Calculus (10), which unlocked only at E58 (84%) and missed by 19 production. **Fix:** gates one at a time in their listed order, value first: Calculus, then Heliocentric.
- **The Rocketry gate monopolised Modern** (15 techs deep, opened at T59 of a 61-turn age): the Innovation masteries (5 × 2), Aerodynamics, Flight's mastery and its projects (Trans-Oceanic Flight, Break the Sound Barrier: 10) never came. **Fix:** estimate the turns to Rocketry (the way's cost ÷ science); while that is beyond the age's expected end − 15 turns, take the Innovation masteries and Flight/Aerodynamics first (they also lead to the Airfield projects); the gate rules only when the pads and Crewed Space Flight Preparation can still fit.

**A3. Projects at the age's end.** A project that would not finish before the age ends behind an item with progress goes to slot 0 (the progress it takes over is not lost to us: the item in front would not finish either). Invent Calculus missed by one turn.

**A4. Unrest.**
- A crisis card valued −4.8 (−6 Happiness in towns) put «Колое» (at −1) into unrest; it revolted 5 turns later.
- The revolt story was answered with "+2 War Support" instead of "+2 Happiness in all settlements": stories follow the AI's priority, not our needs.
- **Fixes:**
  - crisis cards: happiness losses weighted by `core/xpl-scarcity.js` (×2 where a settlement would go below 0);
  - stories: prefer an option that adds Happiness while a settlement is in unrest or below 0;
  - a town in unrest gets a happiness Focus if offered.

**A5. Is the science victory reachable?**
- Research/14's budget: Antiquity ~25, Exploration 20–35, and the rest in Modern from Rocketry (5), masteries (10), flight projects (10), Launch Satellite (5) and Crewed Space Flight Preparation (15 each, a Launch Pad each).
- With Rocketry at the end of a ~60-turn Modern age, 100 needs every Exploration point (Calculus, Innovation wonders) and the Modern masteries and projects early.
- The web's "76–95 entering Modern" does not match this game's data; drop it from the targets (`INNOVATION_TARGETS` Exploration 70 → 55).

**A6. A military rival.** The watch worked, but the only answer is more settlements. With A1 the overlay can buy settlers.

## 4. Probe answers (research/21 §2)
| # | Answer |
|---|---|
| P1 | The game answers `simulateAttackAsync` in 11–25 ms with a token equal by value; our match was wrong (B1). |
| P2 | All 8 foundings were 7+ tiles from the nearest village (the 6-tile rule held). |
| P3 | An Urban Center town may buy Kiln and Observatory (Exploration), Museum, Port and Schoolhouse (Modern): science buildings are buyable there (C2 may go ahead). The Schoolhouse was buyable for 29 turns and never bought. |
| P5 | Town Focuses reset to Growing at the Modern change; the towns step set both again on T1 (no code needed). |
| P7 | The bank was 6,848–7,320 for 3 pads before Rocketry: a price is available before the gate (`getBuildingPurchaseCost`). |
| P8 | Not triggered (no alliances). |
| P9 | A crisis card (−6 Happiness in towns) caused a revolt (A4). |

## 5. Proposed order
1. **Bugs B1–B9**, each with a test that fails without it.
   - Two fakes behave unlike the game and must change first: the global `ComponentID`, and conversions that succeed without the gold.
2. **Expansion A1:**
   - expansion by deficit;
   - `pickSite` by value per turn;
   - settler safety;
   - bought settlers;
   - rough seas;
   - space-scarce relaxation.
3. **Research and projects A2, A3:**
   - gates one at a time;
   - the Rocketry estimate;
   - projects at the age's end;
   - Innovation targets.
4. **Wonders B5** (a chosen wonder into a busy queue) and C2 (Urban Center, P3 answered).
5. **Unrest A4.**

## 6. Status (2026-10-14)
All of §5 is implemented, each fix with a test proven to fail without it (42 prover cases), not yet tested in game: TESTING rows 211–226.
- Changed from the proposals:
  - B5: a queued wonder moves to the front behind an item with progress and never ahead of a project (not to `leverSlot`); Launch Pad cities are kept only once Rocketry's way is 60% done (`padExclusion`).
  - A4: a crisis card's Happiness loss is weighed per settlement only when its modifiers name towns, cities or the capital; another requirement leaves Policy Yield Previews' number as it is.
- Root CLAUDE.md gotchas 33 (`ComponentID`), 34 (`InsufficientFunds`), 35 (two turn activations).
