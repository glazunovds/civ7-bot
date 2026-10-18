# Cities and production for the science victory

18 October 2026, after game 32 (lost to Franklin's culture at about M61 with 4 cities and one Launch Pad). From games 28-32's logs, our code, the game's files and the web, by three research agents; their notes, with every source, are in `research/39-notes/` (`logs.md`, `code.md`, `data.md`). Read root CLAUDE.md gotchas 31, 44, 45, 64 and 65 first.

**The order** (§4 has each change's code, tests and logs):

| # | What | Why (game 32 unless stated) |
|---|---|---|
| 1 | Convert on a new age's first turn, when only the capital counts | ~425 gold at E1 instead of ~1,475, ~525 at M1 instead of 2,500 |
| 2 | A conversion below the city target stays the savings goal, at any horizon | no goal at E1-E16; the goal flipped between two towns |
| 3 | Rank conversions by production per gold | the dearer, idle Liverpool (2 production, 1,425) waited ahead of Leeds (11, 1,087) |
| 4 | Guard against revolts | Бирмингем, a city since A28, revolted at A61 |
| 5 | Antiquity's last turns may convert when the cities are kept | Leeds cost 450-500 in Antiquity, 1,087-1,500 later (a decision for the user) |
| 6 | Modern's gold to Launch Pads: a sized pad bank, no floor conversions under science | the pad bank was never held; 2,500 conversion goals held the gold M35-M40 |
| 7 | Production first in planned pad cities from 60% of Rocketry's way; a half space push from Rocketry | 40-60 production a city; production first never fired |
| 8 | Logs: why no conversion is listed; each settlement's Happiness under a revolt crisis | Antiquity A52-A60 had no conversion and the log does not say why |

Items 1-4 are what could have changed game 32: more cities sooner bring more science and an earlier Rocketry. Items 6-7 matter when Rocketry comes with 25+ turns left.

## 1. Where we stand

| Game | Cities: end of Antiquity / Exploration / Modern | Modern production a turn (all cities) | Rocketry | 100 Innovation | Result |
|---|---|---|---|---|---|
| 28 | 3 / 6 / 6 | - | M51 | M88 | won (science) |
| 29 | 3 / 8 / 8 | 384-545 | M45 | M64 | won (science) |
| 30 | 3 / 6 / 6 | 247-316 | M36 | M62 | won (science) |
| 31 | 3 / 6 / 6 | - | M38 | never (83) | lost to culture ~M48 |
| 32 | 2 / 4 / 4 | 140-195 | M47 | never (83) | lost to culture ~M61 |

- **The pace is the same in every game** (logs §1): two conversions in Antiquity at 250-500 gold, then one every 10-14 turns in Exploration at 1,075-1,500 on 80-102 income. Game 29 reached 8 cities because 7,250 of its ~8,100 Exploration gold went to conversions.
- **Cities are 40-60 production each in Modern**, so a pad takes 9-16 turns and a Preparation run 11-20; only cities run projects (data §1.1). The number of cities sets Modern's science and its space work.

## 2. Findings

### A. Conversion prices, and the window at an age's start (data §1.2-§1.4)
- **The price** (the game's `getTownUpgradeCost()` is the truth; the formula is inferred, fitted to game 32): speed × clamp((BASE + PER_CITY × cities − 50 × the town's population) × (1 − discount), MIN, MAX). Exploration 700 + 700 a city, cap 3,000; Modern 800 + 1,000 a city, cap 5,000 (`age-exploration|modern/data/gameplay-systems.xml`); Antiquity 400 + 300 a city, floor 200, cap 1,000 (compiled into the game; a CivFanatics dump). Online ×0.5. Great Britain pays 50% more in every age. So a bigger town is cheaper, and every city makes the next conversion dearer; Modern sits at the cap from about 4 cities.
- **Every age change turns every city but the capital into a town**, under Continuity and Regroup alike (`regressCitiesToTowns`, `age-transition-post-load.js:1040-1056`). The card «All your Cities from the previous Age remain Cities» (`CARD_AT_EXP_GOLDEN_AGE_ECONOMIC`, for 1 of the 3 Wildcard points every player gets) brings them back on turn 2 (gotcha 31). Game 32's player took it both times.
- **So a new age's first turn is the cheapest window:** only the capital counts as a city. A population-11 town costs about 425 at E1 instead of 1,475 later, a population-15 town about 525 at M1 instead of 2,500 (before Britain's +50%). The autopilot is off at the age change and comes back when the player switches it on after the dedications, on that first turn.
- **Not verified:** whether a town converted on the first turn stays a city when the card's cities return (the card lists the regressed settlements fixed when it is generated: :1450-1466), and how the second conversion of that turn is priced.

### B. Why conversions waited (code §1.3; logs §1)
- **No goal for 16 turns:** at E1-E16 every conversion was more than 12 turns of income away (`chooseGoal`'s `GOAL_HORIZON`), so there was no savings goal, and the free gold bought town buildings (336 at E7-E9).
- **The flip:** `chooseGoal` keeps no memory of the last goal; it takes the first town within reach, so the goal went between Liverpool (ranked first) and the cheaper Leeds as the gold moved, and a University goal held gold whenever neither was in reach (never bought).
- **The ranking:** `rankConversions` puts production potential first, so Liverpool (2 production at E10, 1,425) waited ahead of Leeds (11 production, 1,087).
- **Defence:** 1,420 went on Newcastle's defence at E21-E25 (two Knights, walls, a Man-at-Arms) from all the gold, by design (gotcha 30, research/36); it cost the third city about 17 turns.
- **Antiquity's end:** no conversion in the last 10 turns (`LATE_CONVERSION_TURNS`) unless the Towns tab's «expect to keep cities» is on, though the card keeps them for 1 Wildcard point. At A52-A60 nothing was listed though Leeds was about 10 turns away; most likely a city below zero Happiness (the health guard), but UI.log does not say.

### C. A city lost to a revolt (logs §1)
- Бирмингем (a city since A28, 21 production and 32 science at A60) revolted at A61, in Antiquity's Revolts crisis («You have lost control of this Settlement»). Our answer to the story «Бунт» (LOYALTY002D) only took the consolation, +2 Happiness in every city.
- Before it the autopilot posted the army commander there (COMMANDER_POST), assigned Hides and Crabs there every turn (the same two each turn: the assignment may not hold), and marked the game's advisor warning seen. That warning is `ADVISOR_WARNING_CITY_REVOLT` (`base-standard/data/advisory.xml:237`, NOTIFICATION_ADVISOR_WARNING_MILITARY): «… on the brink of Revolt. If they remain Unhappy for N turns, they may Revolt. We should assign Happiness resources, station a Commander in the settlement, or invest in Happiness infrastructure here immediately.» The game exposes `city.Happiness.hasUnrest`, `turnsOfUnrest` and `highestActiveUnrestDuration` (`panel-production-chooser.js:188-210`).
- Per-settlement Happiness is not in our logs, so why the city stayed unhappy is not known.

### D. Modern's gold and production (code §2; logs §2; data §2)
- **The pad bank was never held:** before Rocketry its hold is capped by the 12-turn horizon, and Modern income was -19 to 160. A Modern conversion goal (2,500, the towns > cities floor) held the gold at M35-M40 instead; then a Tank (920).
- **Production first never fired:** Modern's production buildings are too dear for its payback rule before the space work is known, and before Rocketry it runs only in Airfield or Radio Station cities. The best production per cost is the Military Academy (+9 for 420, no cost progression); then the Factory (+12 for 780, rail-connected), the Ironworks (+4 for 535) and the Rail Station (+9 production, +9 gold for 840) (data §2.1).
- **Bonuses for the space work:** Public Works +30% toward projects (Socialism), Think Tanks +10/20% (Elective Republic), the transition card +25%, a city-state bonus +25%, the science triumph +50%; toward buildings (pads): the scientific attribute node +15%, Strategic Railways +20% in Rail Station cities (data §2.2). Each building already in a city makes its Launch Pad 5% dearer.
- **No town Focus moves production to a city** (data §2.3).
- **Game 32's pads:** Portsmouth's Radio Station (with progress) and London's Ironworks stood ahead of the pads, so both started at M52, 5 turns after the gate; Preparation (17 turns) never fit.

## 3. What would have changed game 32 (INFERRED)
- Leeds kept from Antiquity (§2B, item 5), Бирмингем kept (item 4), a cheap conversion at E1 (item 1) and a sticky, cheaper goal (items 2-3): about 6-7 cities from E30-E40 instead of 2-4, and one more at M1.
- At game 30's science per city that is roughly 1.5× game 32's Modern science: Rocketry about M35-M38 instead of M47, the first Preparation runs about M50-M55. Close to Franklin's M61, not certain.
- Game 31 already had 6 cities; its limit was gold (0 from M20). Items 1 and 6 help it.

## 4. The changes

### 1. Conversions on a new age's first turn
- **The rule:** on an age's first turn (and while our city count is below the last age's), a conversion's price is the game's (`getTownUpgradeCost`, cheap then); convert the best town that was **not** a city in the last age, from all the gold above a small reserve, before any other purchase. One a pass at first; UI.log `conversion window: <town> <price> (cities now N, last age M)` and the next turn's price of a second, as the probe of §2A's open questions.
- **Memory:** the cities at an age's end go into the settings' game memory (gotcha 57: `settings.remember(gameKey(), {cities: "x,y;…"})`), read on the next age's first turn; a town on that list is skipped (the card brings it back).
- **Where:** `conversionsFrom` / `convertTowns` (data/xpl-autopilot-steps.js), the hud's purchase order.
- **Tests:** a new age's turn 1 with 1 city and three towns, one of them a city last age: the other best town is converted with the gold above the reserve; on turn 5 the usual rules.
- **The player:** press «Включить» on the new age's first turn after the dedications (TESTING row).

### 2. A sticky conversion goal (code C1)
- While cities are below the city target (or `minCities`), CONVERT candidates are `anyHorizon` (until the age's last LATE_CONVERSION_TURNS), and the chosen town stays the goal until it is converted or leaves the list (module memory `convertGoal`, cleared by `resetGoldPlan`).
- **Effect:** a goal from E2; the town buildings of E7-E9 wait (`townLeft` is 0 while a goal waits); Liverpool at about E36 instead of E40 with the same defence, about E33 with item 3.
- **Tests:** savings (`anyHorizon` CONVERT ahead of an in-reach LEVER), gold (the same key on two passes while a cheaper town's reach changes; no town building bought).

### 3. Conversions ranked by production per gold (code C2)
- `rankConversions`: after the planned-CITY-site rule and the verdict, science and economy rank by `max(production now, 0.5 × potential) / cost`.
- **Test:** A {11 now, 25 potential, 1,087} ranks before B {2, 30, 1,425}.

### 4. A revolt guard
- **The danger:** a settlement in unrest, or the game's `ADVISOR_WARNING_CITY_REVOLT` naming it, during a revolt crisis (Antiquity's Revolts; Exploration's religious revolts).
- **The response, in that settlement:** buy the cheapest Happiness building the game sells there from all the gold (like walls under a real threat; a town may buy only `Buildings.Town` types), assign Happiness resources there first, post a commander (exists), and in a town a calming Focus (exists: FOCUS_CALM).
- **Logs:** once a turn under a revolt crisis, `happiness: <settlement> N (unrest T of D turns)` for every settlement below zero; the warning's settlement and duration.
- **Tests:** a city in unrest with a Happiness building offered: it is bought from all the gold; at peace and happy: nothing.

### 5. Antiquity's last turns (a decision for the user)
- The card that keeps the cities is offered at every change for 1 of 3 Wildcard points. With it, Antiquity's last-10-turns cut wastes the cheapest conversions of the game (Leeds 450-500, then 1,087-1,500).
- **Proposal:** «expect to keep cities» (`towns.expectKeepCities`) on by default for the science and economic focus, with a tooltip saying the card must be taken. Off, nothing changes.

### 6. Modern's gold to Launch Pads (code C5, P3)
- No conversion on the towns > cities floor alone in the final age under the science focus (only `minCities` and CONVERT verdicts): a 2,500 city converted at M35 makes ~20 production for 20 turns, against a pad bought for ~2,270 in an existing city.
- The pad bank before Rocketry is sized to what the free gold reaches by Rocketry's research turns (`researchPlan().gateTurns`) and marked `sized`, its hold still capped by the gate's progress share before PAD_GATE_NEAR.
- **Tests:** savings (`conversionRule({…, finalAge: true})` has no floor), gold (a PADS goal 15 turns of income away is chosen before Rocketry).

### 7. Production in pad cities (code P1, P4)
- **Production first before Rocketry** in the cities `padExclusion` keeps for pads (from PAD_GATE_NEAR), its work the pad plus the runs the race gives them: the Military Academy (+9 for 420) pays there.
- **A half space push** (production ×1.25, science ÷1.25) from Rocketry with a pad standing or queued, the full one after the masteries as now.
- **Tests:** levers (a +9/420 building gets PRODUCTION_FIRST at gate 0.7 in a pad city, not at 0.3, not in another city), balance (`biasFor` at HALF).

### 8. Logs (code C4)
- `conversions: none (…)` once a turn when no conversion is listed below the floor: the unhealthy city and its Happiness, towns in unrest, the verdicts.

## 5. Not proposed
- **Holding defence back for a conversion:** the threats were real (research/36); a conversion waits behind a settlement under attack.
- **Blocking LEVER/CODEX purchases while a conversion waits:** the budget already keeps the goal's gold (`free()` excludes its hold).
- **Mining towns for the pad bank, Factory Town in the Focus table** (code P5, P6): small gains, and the cost of a Focus change is unknown.
- **A production lean before Rocketry:** Rocketry's date bound games 28-32; science before the gate brings it sooner.

## 6. Status: implemented (18 October 2026)

The user's answers: the «keep your cities» card is always taken (item 5: on by default), and the age's first turn should be automatic. Every item is in the code, each with a regression test proven by reverting it on a scratch copy (19 cases); root CLAUDE.md gotcha 66; TESTING rows 366-371. 741 tests pass. New text and a new checkbox: a full game restart.

| Item | Where | Decision taken while implementing |
|---|---|---|
| 1 first-turn conversions | `convertAtAgeStart`, `noteCitiesForNextAge`, `lastAgeCities` | The window is open while the remembered cities are another age's and fewer cities stand; up to 6 cities entering Exploration and 8 entering Modern with the ones coming back; one after another, each once the game counts the last. |
| + the autopilot back on | `resumeAfterAgeChange` (hud), option «Включаться снова в новой эпохе» | Added for the player's wish: it was on at the last age's end, a later age, its first 3 turns, the dedications chosen. The cards and dedications stay the player's. |
| 2 sticky goal | `goldPlan` (`anyHorizon` below the floor, `convertGoalKey`) | The town is kept while it is listed; no margin for a better one. |
| 3 ranking | `conversionValue` | max(production now, half the potential) per gold. |
| 4 revolt guard | `revoltRisks`, `guardRevolts` | Unrest, or below zero Happiness while a crisis is on; the cheapest HAPPINESS-tagged building, from all the gold. Happiness resources were not touched (game 32 assigned Hides and Crabs there every turn: the assignment may not hold; a probe for the next game). |
| 5 keep-cities default | settings v2 | On; an older blob is moved on, a choice made since stays. |
| 6 Modern's gold | `conversionRule({finalAge})` for science, `padGoals` `sized` | |
| 7 production | `productionFirstStep(…, strategy)`, `spacePushNow().level` HALF | |
| 8 logs | `noteNoConversion` | |

## 7. Correction (game 34, 19 October 2026)

The card that keeps the cities brings them back when the player confirms the dedications, on the age's first turn, not on turn 2: game 34 had 5 cities at M1 the moment the autopilot switched itself on after them (Player_Stats' turn-1 row, written at the turn's start, shows 1). So the window where only the capital counts is the time before the dedications are confirmed, and the auto-resume, which waits for them, always missed it. Now the window's conversions run while the dedications wait (`convertBeforeDedications`); root CLAUDE.md gotchas 31 and 66.
