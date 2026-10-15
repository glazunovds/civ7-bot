# Game 8 analysis (2026-10-14)

**Game:** Ada Lovelace / Abbasid, science focus, «Стратегия по фазам» on. This was the first game with research/22's fixes. It reached Exploration turn 45.

**Players:**
- 1 Egypt / Hatshepsut
- 2 America / Franklin
- 3 Prussia / Friedrich
- 4 French Empire / Charlemagne
- 5 Normans / Lafayette

**Sources:**
- Three forensic reports (scratchpad: `forensics-game8-war.md`, `forensics-game8-expansion-gold.md`, `forensics-game8-science.md`).
- The game's logs: UI.log, net_message_debug.log, CityBuildQueue.csv, DiplomacySummary.csv, DiplomacyManager.csv, CombatLog.csv, Player_Stats.csv, Independents.csv.
- Turns are given as A (Antiquity) and E (Exploration).

## 1. What happened
| | Antiquity (70 turns) | Exploration (to E45) |
|---|---|---|
| Settlements | 1 city to A16; 2+2 at the end (cap 5) | 3 cities + 4 towns at E26; 2 + 3 at E36 |
| Innovation | 23 (target 25): 11 codices, Spherical Earth A57, Chart the Stars A65, Literacy | **0** (best rival 13) |
| Wonders | none | Shwedagon queued E25; got production on 1 turn; lost to Prussia E45 |
| Wars | raids from tribe 8's camp (unseen, ~6 tiles from the capital) A23–A63 | Prussia (formal, E27) and its ally America (surprise, E28) |

**The war:**
- **Prussia's intent:** it had marked our cities as targets since A37 and stayed unfriendly or worse for about 35 turns. It sabotaged our military production on E20 and planned the attack on Забид from E14.
- **What provoked it:** we did nothing provocative. What invited it was the smallest army in the game: 3–4 land units against 13–24 for every AI, because the science strategy trains no soldiers in peace.
- **Losses:**
  - a settler on E27;
  - Забид (a city), taken by Prussian Men-at-Arms on E32;
  - Фустат (a town), taken from the sea by an independent's Cogs on E35 and razed on E38.
- **Economy:** income fell from +36 to −22 a turn: upkeep, war weariness, lost yields.

**The deal pop-ups the user saw:**
- Our `seekPeace` sent 8 white-peace proposals, every 3 turns per leader (E35–E45). Each rejection showed the leader's dialog, which is the pop-up on 8 of 11 turns.
- **Prussia itself offered plain peace on E35/36, asking nothing.**
  - The user edited that offer: Забид back plus 200 gold for 100 Influence. Prussia refused the edited version.
  - Accepting the offer as it was would have ended that war.
- The autopilot cannot answer an incoming AI deal. On E36 it tried to end the turn 15 times in 30 s while the deal screen was open.

## 2. What worked
- **Strikes (B1 fixed):** 87 of 87 combat predictions matched and none timed out. There were 17 strikes in Antiquity.
- **Conversions as savings goals (B2):** Забид A37 and Кайруан E24.
- **Threats:** a major at war was counted from the first turn. 600 gold bought 2 defenders on E28.
- **No unwanted war:** the autopilot never declared, joined or provoked a war. The pop-up closer never touched a diplomacy window.
- **Research gates in Antiquity:** in order. Mathematics won the "first to Mathematics" triumph.
- **Projects:** queued the pass their tech came, in the right city.
- **Settlers in Antiquity:** walks of 3–5 turns; SETTLER_LEAVES and SETTLER_WAITS worked; none were lost.
- **Choices:** crisis cards, government (Oligarchy, then Plutocracy) and celebrations worked; attribute points were spent at once.
- **FOCUS_CALM:** Мекка, at −1 Happiness, took Trade.
- **No errors and no blocked turns:** no autopilot errors and no BLOCKED. All 195 JS errors are the base game's `unit-flags.js`.

## 3. Problems
### War and diplomacy
| # | Problem | Evidence | Fix |
|---|---|---|---|
| D1 | An AI peace offer is never answered, so the end turn spins | E36: Prussia's offer, 15 refused `PlayerTurnComplete` in 30 s | `answerIncomingDeals`: accept a peace that asks nothing (or a little gold or Influence) of us; reject other deals so the turn is not held. While a diplomacy screen the user opened is showing, wait for `DiplomacySessionClosed` instead of retrying the end turn. |
| D2 | `seekPeace` proposes blindly; each rejection pops a leader dialog and costs a refused end turn | 8 proposals, 8 rejections, 8 dialogs | Ask first with `sendWorkingDeal(…, INSPECT)`. The game's peace screen does this; the answer comes as a `DiplomacyStatement` with `RespondingToDealAction INSPECT`, and `handleDealStatement` shows nothing. Propose only on ACCEPTED. Per leader, back off 3 → 6 → 12 turns. Never propose while a deal is pending or a diplomacy screen is open. |
| D3 | No sense of war risk; no army in peace | 3–4 land units against 13–24 for every AI; Prussia unfriendly for 35 turns; sabotage E20 | Compute `warRisk(leader)` from: relationship ≤ UNFRIENDLY, their espionage or sabotage against us, land distance, their army against ours. While the risk is high: one melee unit per settlement (two on the border), no savings goals, upgrades allowed, and no conversion that leaves too little gold for 2 defenders. |
| D4 | Defenders wait behind buildings with progress, even when that progress is only overflow | A University with 35/332 of overflow held Mecca's defender back E33–E39; a Tavern did the same in Забид until the turn it fell | Under a war threat a defender goes ahead of a building. Probe first: does a unit take a building's progress? It does not take a wonder's (gotcha 20). |
| D5 | Gold frozen at war | `free()` was 0 E28–E45 (goals CONVERT 1325, then University 836), so no upgrades. E24: 925 gold on a conversion 3 turns before the war | At war with a major, or under threat: no CONVERT, LEVER or CODEX goal. Upgrades near threatened settlements use `all()`. |
| D6 | The defender fallback buys a siege unit with all the gold | E43: a Catapult for 220 of 239 gold at −22 income; treasury 0 | No Bombard or siege units in the fallback; never spend below the deficit reserve. |
| D7 | Walls are locked behind a tech research never takes | 72 `walls: none … build false/0` lines (Exploration walls need `NODE_TECH_EX_CASTLES`) | Under war or a threat lasting 3+ turns, research the age's FORTIFICATION unlock when it is available or one step away. The diagnostic names the locking node and skips other civilizations' unique walls. |
| D8 | Strikes | 15 answers with no `Attacker` (an impossible attack) fell back to our own estimate; 41/22 and 36/25 trades were refused while Забид fell | No `Attacker`: skip the strike. Next to our centre, or while it is damaged, accept dealt ≥ 1.3 × taken. |
| D9 | Settlers at war | E28: a settler queued in Кайруан (7 turns, ahead of its defender) then sat idle E38–E45. The E25 settler walked past Prussian soldiers and was killed E27 | No settler while at war with a major whose units are near; a defender overtakes a queued settler; a high-`warRisk` army counts as danger for settler paths. |
| D10 | Counter-spy never fires | Sabotage reports arrived as DIPLO_RESPONSE (E16, E21, E24); `caughtSpies` reads only ESPIONAGE notices | Also learn the culprit from a response event targeting us with an ESPIONAGE_* or SABOTAGE_* action. |
| D11 | A hurt unit heals next to enemy ships | E44 a strike moved a Mamluk onto the coast; E45 it healed there and the Cogs killed it | Heal only where no hostile unit can reach; else step back first. |

### Expansion and production
| # | Problem | Evidence | Fix |
|---|---|---|---|
| E1 | Overflow progress makes the next building untouchable | Settlers waited behind a Library holding 2 production (4 turns), a Library with 7.7 (7), a Garden with 11 (5) and a Bazaar (3): 19 settler-turns | `frontSlot` protects progress only above one turn of the city's production (the most that can be lost). |
| E2 | No settler from a threatened city, even when the threat is chronic | The capital was "threatened" 48 of 70 turns: no settler A27–A36; settlers came from a 7-production town-turned-city | Allow it when no unthreatened city can start one within ~3 turns and a safe site is reachable (the settlers that left threatened settlements A20 and A51 did fine). |
| E3 | Settler counts keyed to cap/2 and cap − 1: off for most of the age with caps of 3–5 | `expansionDeficit` true only A1–A16; one settler at a time in Exploration at 4–7 of 8–9 | Two in flight while settlements < cap − 1. The SETTLER goal or purchase applies below the cap when no city can start one soon. |
| E4 | A queued settler counts as "in flight", so it is never bought | A13: 235 gold, the settler stuck behind the Library; a Brickyard was bought instead | A queued settler that won't start within 2 turns is bought (then removed from the queue). |
| E5 | A raiding independent never befriended or approached | Tribe 8 raided A23–A63, its village unseen; 0 befriend requests in Antiquity | Also approach when the befriend project exists but is not offered; log the project status for threatening independents. |
| E6 | Walls queued 2 turns before the age ends | A68: 34/40 lost at the change | No queuing when `ageEnding()` in a non-final age (buying is fine). |
| E7 | Conversion ranking | E4: a population-1 town founded that turn (1000) chosen over a developed one (850) | Weigh population and production before the CITY-site bonus. |

### Wonders and science
| # | Problem | Evidence | Fix |
|---|---|---|---|
| S1 | Lever / wonder / project ping-pong (B5 incomplete) | One MoveTo per pass in Багдад E25–E31 (University ↔ Shwedagon) and A54–A56 (Academy ↔ Chart the Stars): the queue read is stale within a pass | A lever never moves ahead of a queued wonder or project (a barrier in `toFront`, like units and repairs). |
| S2 | Innovation-only wonders leave nothing to build | 30 of 30 `wonders: none` lines with wonders available say "all not Innovation"; no wonder in 115 turns while the capital built Baths for 8 turns | **Design change (needs the user's OK):** make Innovation a preference (its +12 value already exists), allowing any winnable wonder when no Innovation wonder is available. Research toward Innovation wonders' unlocks (the civilization's own too: Al-Jabr → House of Wisdom). Log wonder names. |
| S3 | An unreachable gate holds research all age | Exploration: 45 turns toward Urban Planning (Invent Calculus), about 25 turns short; Education researched but its mastery (Heliocentric, 5) never | An ETA for every gate (way's research turns + the project). Skip a gate that cannot finish before the age ends; with none reachable, the Innovation masteries first. A2's Rocketry rule, generalised. |
| S4 | The Innovation-civic way has no ETA and ignores the civilization's science civics | 45 turns toward Social Class, 35 short; Mawla (Madrasa) and Al-Jabr (House of Wisdom) never picked; Egypt built the House of Wisdom E43 | The same ETA check. With the science focus a civic is wanted when it unlocks an Innovation wonder or a SCIENCE building (unique ones included). |
| S5 | Stories ignore the focus | `AIPriority` is never set in the base game (13 rows, Heian DLC only): A61 took +Gold over +Science | Score options by `NarrativeRewardIcons` × the profile's weights (negative icons subtract), keeping Happiness-first in unrest. Log the story's text, not its LOC key. |
| S6 | Savings goals out of reach hold all the free gold | Academy 504 held A48–A64 at income 2–13, then built by its own city in 3 turns; University 836 at income −22 | Skip a goal more than ~12 turns of income away (or any at income ≤ 0), and a LEVER its own city finishes sooner. |
| S7 | Urban Center never considered: both towns got Fishing in Growth and keep it | E1 Fishing; `setTownFocus` never changes a Focus | Once, at the GROWTH → BUILD change, revisit FARM/FISHING towns with `urbanBuys > 0`. Probe first: does a Focus change cost anything? |
| S8 | One codex short of the 12-writings triumph | 11 displayed and 2 archived at A70; the capital's Academy sat queued A48–A65 | Count writings toward 12; with codices waiting, buy a queued codex building. |

### Small
- The `sites:` line's "villages N seen" also counts hidden ones (`data/xpl-site-job.js`).
- Забид starved from A65, three turns after a specialist was placed there. This is a lead to check.

## 4. Probes for the next game
1. Does a unit moved ahead of a **building** with progress take that progress (CityBuildQueue.csv)? This decides D4.
2. Does `sendWorkingDeal(…, INSPECT)` from script get an answer (`DiplomacyStatement` with `RespondingToDealAction` INSPECT) without a dialog? (D2)
3. Does `sendWorkingDeal(…, ACCEPTED)` on an AI-proposed peace conclude it? (D1)
4. Does changing a town's Focus cost anything (S7)?
5. The `DiplomacyDealProposalActions` numbers seen on the wire are PROPOSED 4, INSPECT 7, ADJUSTED 3, REJECTED 2. The fake's numbers differ; that is harmless while the code uses the names.

## 5. Proposed order
1. **Deals and war:** D1, D2, then D3–D11. These decide whether a game survives.
2. **Queue discipline:** S1 (ping-pong) and E1 (overflow).
3. **Research ETA:** S3, S4.
4. **Expansion:** E2–E7.
5. **Wonders:** S2, after the user's OK, since it changes research/21's D7 decision.
6. **The rest:** S5–S8.

## 6. Status (2026-10-14)
The whole list is implemented (the user: "implement whole list + wonders allowance"), each fix with a test proven to fail without it (58 prover cases, `prove_g8.py`), not yet tested in game: TESTING rows 227–239.
- Choices made while implementing:
  - D3: the war risk uses only what the player can see (relationship, reported espionage and sanctions, settlement distances), not rivals' unit counts.
  - D4: a defender goes ahead of a building under any threat; whether it takes the building's progress is a probe (UI.log `queue: … moved ahead of …`).
  - E1: progress counts only above one turn of the city's production.
  - D2: with no answer to our INSPECT, white peace is proposed anyway, the next ask waiting as after a refusal.
  - S7: a farming town is reconsidered each pass after Growth (not only at the change), and switches only when Urban Center is its best Focus with a building to buy.
- New file `core/xpl-deals.js`; root CLAUDE.md gotchas 36–38.
