# Modern's science pace: why Innovation is flat for half the age, and the fixes

18 October 2026. From games 28–31's logs, the game's data (1.5.0.44), our code and the web, by four research agents. Their notes, with every source, are in `research/38-notes/` (`logs.md`, `data.md`, `code.md`, `web.md`). The games run at **Online speed**: projects and wonders cost half their data cost (Preparation 1,000, Launch Satellite 500), techs half, buildings about ×0.8. Read the root CLAUDE.md first (gotchas 25, 44, 58, 63, 64).

**The order** (§5 has each phase's tests and logs):

| Phase | What | Turns saved (game 30) |
|---|---|---|
| A | A race model that counts research Innovation; the Airfield goal that the purchase step refuses; buying a Launch Pad under way | 2–4, and it makes B–D decide right |
| B | Launch Pads at Rocketry: a bank for the pads the race needs, priced where they are bought, no lever purchases while it is short; pads ahead of plain buildings; no long fillers in pad cities near the gate | about 7 |
| C | The one-off projects around Rocketry: the Airfield and a Radio Station built before it; after it, research by Innovation per turn | about 5, overlapping B |
| D | Exploration's end: bank gold up to the age-transition cap | 1–3 |
| E | Later: production over science once the masteries are in; defenders and a Preparation run near its end; project-production policies | 2–4 |

Together: game 30's crossing of 100 at about M50–M52 instead of M61, a win at about M55–M57 instead of M66. Game 31 (lost to culture at M46) needed this **and** the gold it never had; the gold pressure (gotcha 64) is the other half.

## 1. Where we stand

| Game | Innovation at M1 | Rocketry (gate) | Flat for | First Preparation | 100 reached | Result |
|---|---|---|---|---|---|---|
| 28 | 47 | M51 (73%) | 50 turns | M84 | about M89 | won M93 |
| 29 | 60 | M45 (64%) | 44 turns | never finished (defence took the pad city) | M64 | won M69 |
| 30 | 55 | M36 (51%) | 35 turns | M53 | M62 | won M66 |
| 31 | 62 | M38 (54%) | 37 turns (+7 Oxford, +2 a wonder) | none by M46 | — (83) | lost to culture M46 |

Our science was 3–4 times the best rival's in every game. Strong human players enter Modern with 76–95 Innovation and win on Modern turn 21–52 (CivFanatics, 1.4+, `web.md` §1).

## 2. What sets the pace (game data and logs)

### A. Rocketry costs a fixed sum of science
- Rocketry needs Aerodynamics, which needs Computation, Mobilization and Armor: **15 of the 16 Modern techs**, everything but Nuclear Fission. 49,400 science at Standard, **24,700 at Online**. No order shortens it (`data.md` §1).
- In all four games Rocketry finished after **about 22,000 Modern science** (g30 21,913 by M35, g31 21,954, g29 22,865, g28 21,762): the path less free research (the transition card's free Academics, Exploration Future Techs' 50% boosts, Oxford's two free techs). Our research order wasted nothing on the gate (`logs.md` §summary 2–3).
- So only more science or free research moves it: about 4–5 turns per 100 science a turn. Oxford's two free techs take the cheapest available, so they are worth most when it finishes late (up to ~3,000 science); g30 lost Oxford to a rival at M7.

### B. Innovation in Modern

| Source | Points | Needs | Cost (Online) |
|---|---|---|---|
| Crewed Space Flight Preparation | 15, repeatable | Rocketry + a Launch Pad in that city | 1,000 production |
| Launch Satellite | 5 | Rocketry + a Launch Pad there | 500 |
| Trans-Oceanic Flight | 5 | **Flight's mastery** + an Airfield there | 500 |
| Break the Sound Barrier | 5 | **Aerodynamics' mastery** + an Airfield there | 500 |
| Radio Telescope | 5 | **Radio's mastery** + a Radio Station there | 600 |
| Rocketry | 5 | | 4,250 science |
| Aerodynamics mastery | 5 | | ~3,000 (assumed equal to its tech) |
| Electricity, Combustion, Industrialization, Radio, Armor masteries | 2 each | | 1,212–2,000 each |
| Future Tech (Modern) | 3 each | Rocketry + Fission | 5,000, rising |
| Oxford University, Manhattan Project | 3 each | wonders | 750 / 900 |

- No policy, civic, attribute or city-state bonus gives Innovation. Projects cannot be bought.
- **Points carry over** (`StaticCarryover`): Modern starts at what Antiquity (24–28) and Exploration (31–34) earned. Exploration Future Tech gives 3 each **and** a 50% boost to a first Modern tech.
- **Project production bonuses:** Public Works +30%, Think Tanks +10% (+20% in the capital), the triumph of five 120-yield districts +50%, the transition card «Celestial Spheres» +25% (and free Academics), a city-state bonus +25%. Game 30's Preparation cities ran +55%.
- **The gold carried into Modern** is capped (gotcha 31): Continuity 9,000 × speed (Online: 4,500, logged), Regroup 3,000 × speed. A Launch Pad costs 2,150–2,850 gold.

## 3. Findings: where the turns go (game 30 unless stated)

1. **Nothing is earned before Rocketry** (35 flat turns). About 30 points need no Launch Pad: the six masteries (15) and the three one-off projects (15). The masteries are researched right after Rocketry, which is fine (they take about a turn each and were done long before 100). **The one-offs never ran before Rocketry, and the Airfield's flights never ran in any of the four games:** the Airfield is not an active site until its mastery is in (`activeSites`), the race model ignores its flights until then, and the Radio Telescope is only run where a Radio Station happens to stand (g29's came 17 turns after its station). Meanwhile pre-Rocketry production built fillers and gold sat idle.
2. **Launch Pads start 3–8 turns after Rocketry** in every city that built one. Each waited behind a plain building in production, several started 0–2 turns before Rocketry (g31: two City Parks the very turn). `frontSlot` keeps a pad behind an item with progress. g30's first built pad was done at M51, 16 turns after Rocketry.
3. **One pad bought, and late.** The PADS bank holds at most **one** pad's price (`padGoals`; research/21 §4.5 designed "about the whole bank"), priced in the cheapest city while the purchase goes to another (g30: held 2,148, London cost 2,620: one turn late). The free gold above it bought three town Schoolhouses before Rocketry (3,088). A pad already in production is never bought (`victoryPurchases`), though the game sells an item in progress at the price of what it lacks (gotcha 58): g30 had 1,600–2,100 gold M47–M53 beside half-built pads.
4. **The race model is pessimistic.** `spaceRace` / `innovationReach` count only projects: no Rocketry, masteries, Future Tech or wonders, and no Airfield flights before their mastery. At M35 it forecast 44 turns; the real crossing came 26 turns later. Every decision on it errs:
   - `siteHelps` approved pads in weak cities that never ran a Preparation (g30: three, about 2,500 production);
   - production first sized London's remaining work at three runs and put a Military Academy (M37–M42) ahead of the first Preparation on the bought pad: the first +15 came at M53 instead of about M48;
   - `oneOffNext` and the "goal comes on turn N either way" verdicts.
5. **A bug:** the AIRFIELD savings goal (`siteGoals`) ignores `siteHelps`, so g30 held 2,216–2,284 gold for about 20 turns for an Airfield the purchase step kept refusing; it then went on a Laboratory at M55.
6. **Research after Rocketry** takes Flight's mastery (no points; useless without an Airfield) and Nuclear Fission (no points, 4–5 turns) before the five 2-point masteries: about 4 turns late for 10 points and the second Future Tech.
7. **Production falls when it matters most:** after the masteries science is worth only Future Tech (3 per 5,000+), yet the science bias keeps placing specialists; London's production fell 66 → 36 at M55 with Happiness 118 → 33.
8. **Defence takes the pad cities** (g29: a Preparation at 510 of 1,000 lost to two Tanks and two walls M53–M64; g28: four pads interrupted).
9. **Exploration's end prepares nothing:** its free gold went on small buildings; Modern opened with 1,155–1,277 gold, under a third of the cap.
10. **Game 31** had no gold all Modern (a 700 defender at M1, then unit upkeep): no pad was bought, and culture won at M46 before the first pad stood (M47). Science alone could not have won it; it needed the gate near M25 or 80+ Innovation at Rocketry.

## 4. The fixes

### A. The race model and two purchase bugs (Phase A)
- **A1. Count research Innovation** in `spaceRace` / `innovationReach`: Rocketry's 5 at the gate's ETA; each remaining `*_SCIENCE_VP` mastery at the cumulative `getTurnsForNode` of the research ahead; Future Tech 3 each; an Innovation wonder in production at its turns. Count an Airfield's or a Radio Station's one-off once its mastery is researched or next in the post-gate order (C2). Keep a margin of one Preparation run so an optimistic forecast does not refuse a needed pad.
- **A2. `siteGoals` asks `siteHelps(…, {bought: true})`**, as `victoryPurchases` does: no goal for a site the purchase step refuses.
- **A3. Buy a Launch Pad under way:** `victoryPurchases` may buy the item in production when it is a science site, at `canStart(PURCHASE).Cost`, on `Plots[0]` when `InProgress` (as `buyAgeEndItems` does); `padGoals` stops counting such a pad as standing when the gold covers it.
- **Tests:** the M35 forecast with masteries pending (about 26 turns, not 44); no AIRFIELD goal where `siteHelps` is false; a pad at 50% bought with `InProgress` plots.
- **UI.log:** `victory work:` lines give the forecast's parts (projects, research, wonders).

### B. Launch Pads at Rocketry (Phase B)
- **B1. The bank holds the pads to buy:** before the gate, `padGoals` holds `min(bank, K × price)` where K = the Preparation runs the race still needs after research and one-offs, at least 1, at most the pads planned; each priced in the city that will buy it (`victoryPurchases`' order), not the cheapest. While science's Commit is before Rocketry and the bank is short, no LEVER building is bought with free gold (g30's three Schoolhouses).
- **B2. A pad goes ahead of a plain building with progress** (`padSlot`, like `projectSlot`): position 0 unless the item in production is a wonder, a science site, repairs or done this turn. Gotcha 20: the item behind keeps its own progress.
- **B3. No long fillers in pad cities near the gate:** once the gate is past `PAD_GATE_NEAR` 0.6 (or its ETA is within an item's turns), a planned pad city starts no non-production building that would still be in production at Rocketry (the plan's queueing, the advisor, the fallbacks).
- **Tests:** gate at 0.9 with gold for two pads: the hold is two prices in the right cities and no Schoolhouse is bought; a city with [Laboratory 50%, Launch Pad] after the gate: the pad moves to 0; gate at 0.9: no City Park queued in a pad city.
- **UI.log:** the gold line's PADS goal says `K pads (cities)`; `queue: … Launch Pad moved ahead of …` (gotcha 20's probe).

### C. The one-offs around Rocketry (Phase C)
- **C1. Sites before Rocketry:** with the science focus in Modern, the Airfield (in a city without a planned pad) and one Radio Station are active sites once Flight / Radio are researched, even before their masteries: built by production in non-pad cities, bought only with gold above the pad bank. Their projects run as soon as the masteries come (C2).
- **C2. After Rocketry, research by Innovation per turn:** points over `getTurnsForNode`, a one-off's 5 counted for its mastery only where its site stands or is queued; so Aerodynamics' mastery, the 2-point masteries and the site masteries come before Nuclear Fission, and Flight's mastery is skipped without an Airfield. Fission and Future Tech after.
- **Alternative considered:** researching Flight's and Radio's masteries before Rocketry (3,000 science, about 4 turns) runs their projects earlier but delays the gate and Rocketry's own 5; the data agent's model came out even, so the masteries wait for Rocketry and only the sites are built early.
- **Tests:** Flight researched, gate at 0.4, a non-pad city: the Airfield is queued; after Rocketry with an Airfield standing, Flight's mastery precedes Fission; without one it is skipped.
- **UI.log:** `victory work: … one-off <project> in <city>` and the research line's points per turn.

### D. Exploration's end (Phase D)
- **D1. Bank for Modern:** with the science focus, in Exploration's last `AGE_END_TURNS`, the free gold is held up to the transition's cap (`AgeTransitionSettingName`: Continuity 9,000, Regroup 3,000, × the game speed's cost multiplier) less this age's needs; urgent purchases (defenders, repairs, `buyAgeEndItems`) still go first. Modern opens with up to 4,500 at Online: two pads at Rocketry, or the A3 purchases.
- **Tests:** Exploration's last turns: a 100-gold building is not bought, `buyAgeEndItems` still is; the hold never exceeds the cap.

### E. Later (Phase E, each its own decision)
- **E1. Production over science** in Commit once Rocketry and the Innovation masteries are in: the pass's balance moves toward production and Happiness (specialists leave for production tiles). 2–4 turns; risk: Future Tech slower.
- **E2. A Preparation run within a few turns of its end** is not passed by a unit unless the centre is damaged or a war is at our door (gotcha 20's unit exception); defenders come from other cities or gold first.
- **E3. Project-production policies** (Public Works, Think Tanks): worth nothing before a project can run, yet `projectShare` (core/xpl-effect-value.js) values them at 0.5 × 2 all through Modern (not seen to slot one early). Value them from the turn a project can run, and research Socialism (Public Works) before Rocketry; in games 30 and 31 it came at M38/M33 from the advisor, in time.

## 5. Order, tests and logs per phase

Each phase ships with regression tests proven by revert on a scratch copy, a TESTING.md row, UI.log lines that let the next game confirm it, and docs (root gotcha, mod/CLAUDE.md).

1. **Phase A first:** B, C and production first all decide on the race model; the two purchase bugs are small and safe.
2. **Phase B:** the largest single gain; needs A1's K.
3. **Phase C:** the one-offs; C2's ranking uses A1's research events.
4. **Phase D:** small and independent.
5. **Phase E:** after the next science game's logs show where production and defence still cost turns.

**The next game shows:** Innovation rising from the gate's turn by 15+ within a few turns (pads bought, one-offs running); `PADS` holding K pads; pads ahead of fillers; the forecast close to the real crossing.

## 6. Probes and open questions
- **A mastery's cost** is not in the data (`Techs.getNodeCost`); UI.log one line per mastery when it is picked.
- **Research overflow at the age change** is engine-side; the last Exploration turn's science and the first Modern tech's progress settle it.
- **Wonder Innovation across ages:** the Great Library's and Shwedagon's grants use `IsCurrentAge`; whether they survive the next age shows in the first `victory races` line of the age.

## 7. What we are not doing, and why
- **Re-ordering the research to Rocketry:** it is already the whole closure; order cannot help (§2A).
- **Buying projects:** the game has no purchase for them.
- **More science volume** (specialists, buildings, policies): it is the largest lever (4–5 turns per 100 science a turn) but has no single fix; the gold pressure and the plan already weigh it. Oxford's timing (finish it after the cheap techs) is a candidate once a game shows the race is safe.
- **The research/37 military phases 3–7:** they wait; games 30 and 31 lost no settlement, Continuity keeps armies unpacked, and no aircraft or naval threat appeared.

## 8. Status: implemented (18 October 2026)

Every task of §4 is in the code, each with a regression test proven by reverting it on a scratch copy (30 cases), and the root CLAUDE.md has it as gotcha 65. 730 tests pass. New text (LOC_XPL_AP_GOAL_BANK, LOC_XPL_AP_SPACE_PUSH): a full game restart. TESTING rows 354–363.

| Task | Where | Decision taken while implementing |
|---|---|---|
| A1 research in the race | `researchPlan`, `RESEARCH_RACE` in `spaceRace`; core `run.start`, `rankInnovationResearch` | No "one Preparation run" margin in production first: it broke the near-goal rule (a run under way at 95 buys no upgrade). Innovation wonders in production are not counted yet. Future Tech: 2 copies ahead, each a step dearer, none while the strategy holds them back. A Launch Pad standing, queued or offered means Rocketry is in. |
| A2 Airfield goal | `siteGoals` → `siteHelps` | The "no site" line once a turn per city. |
| A3 pad under way | `victoryPurchases` (`underWay`), `padGoals` | Any science site under way, not only pads. |
| B1 pad bank | `padGoals`, `victoryPurchases`' city order | No separate "no lever purchases" rule: from PAD_GATE_NEAR the bank holds all the gold above the reserve, which stops every free-gold purchase until it is full. |
| B2 pads to the front | `padSlot` | Also not ahead of walls or another science site in production. |
| B3 room for the pad | `holdsPadRoom` in `fillProduction` | Production buildings (PRODUCTION or PRODUCTION_WAREHOUSE) still go in. |
| C1 sites when unlocked | `activeSites`, `SCIENCE_SITES` (Radio Station row) | `siteHelps` decides each, as for the Launch Pads beyond the first. |
| C2 research by Innovation per turn | `innovationStep`, `oneOffSites` | Also when the gate is out of reach (`gateLate`). |
| D1 bank for Modern | `bankForNextAge`, `carriedGoldCap` | The bank is what the free gold can reach before the age ends, at most the cap, so the goal is always within reach. |
| E1 space push | `spacePushNow`, core `SPACE_PUSH` in `biasFor` | Needs a Launch Pad standing too. |
| E2 Preparation keeps the front | `prepNearlyDone` (`PREP_HOLD_TURNS` 3) | Walls wait too, unless the centre is damaged or a war is at our door. |
| E3 project policies | `PROJECT_PRODUCTION_TRADITIONS` in `innovationCivics` | `projectShare` left as it was: valuing Public Works before Rocketry keeps it slotted for when the projects start (policy swaps are gated). Socialism only once we are in the Communism branch; Think Tanks (Elective Republic) left to the advisor. |

**The next science game should show:** the `victory work: race:` forecast close to the real crossing; «космодромы (K)» held and K pads bought at Rocketry; `queue: … BUILDING_LAUNCH_PAD moved ahead of …` and `keeps room for its Launch Pad`; an Airfield and a Radio Station built before their masteries and their projects run; the 2-point masteries before Nuclear Fission; Modern opening with gold near the cap; SPACE_PUSH after the masteries.
