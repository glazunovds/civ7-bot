# Game 9 analysis (2026-10-14)

**Game:**
- **We:** Ada Lovelace (Han → Ming → Qing), science focus, «Стратегия по фазам» on. The first game with research/23's fixes.
- **Length:** three ages of 70 turns.
- **How it ended:** at the end of the Modern age, nobody had won, so **Alexander (Greece → Abbasid → Buganda) won the score victory**.
- **Rivals:** Catherine (Russia), Genghis (Mongolia), Napoleon (French Empire), Lafayette (Rome; our ally).

**Sources:**
- Three forensic reports in the scratchpad: `forensics-game9-science.md`, `forensics-game9-expansion-gold.md`, `forensics-game9-war.md`.
- The game's logs: UI.log, PlayerScore.log, net_message_debug.log, CityBuildQueue.csv, DiplomacySummary.csv, CombatLog.csv, Player_Stats.csv, Player_Treasury.csv.
- Turns are given as A, E and M (the three ages).

## 1. How the game was lost: the score victory
- **The rule:** `victories.xml`, `VICTORY_SCORE`, `COUNTDOWN_VICTORY_SCORING_TYPE_END_AGE`. When the last age ends with no winner, the score counts:
  - **1000 points per turn spent in a victory countdown** (`VICTORY_TRACKER_TURNS_IN_COUNTDOWN`);
  - 10 per victory place;
  - 1 per triumph.
- **The scores:** every major sat at 820–900 (ours 851).
- **What happened:**
  - Alexander's military countdown ran for one turn (M63–M64). His score jumped 850 → 1850, and that won the game.
  - Our victory watch saw him at DANGER from M56. Its overlay bought a settler at M56, but the settler walked to a site 7 turns away.
  - The founding raised the second place's military points and stopped his countdown at M64: one turn too late.
- **Lesson:** in the final age, **a single turn of any rival's countdown decides the game**, whether or not it could finish. Our own countdown turns would count the same.

## 2. What happened
| | Antiquity | Exploration | Modern |
|---|---|---|---|
| Settlements | 1 city until ~A36; 3 of 5 at the end (one is Napoleon's Нант, which revolted to us) | 4 towns by E9; 9 of 9–10; two lost to Napoleon (E50, E52) | 7 → 12 of 17, only 4 cities (a conversion cost 2,075–2,100 against 0–77 income) |
| Innovation | 10 (3 codices, Literacy, Chart the Stars; Spherical Earth missed at 76/300) | +5 (House of Wisdom, Shipbuilding mastery); Heliocentric ended 324/375 | +10 (five masteries); no Rocketry, Launch Pad, Airfield or project |
| Wars | raids; Napoleon a war risk from A22 (espionage) | Napoleon E46–E54 (peace by our inspected proposal) | Alexander from M62 (his military countdown) |

## 3. What worked
- **Peace:** our private INSPECT was answered, and the peace that followed ended Napoleon's war at E54. A refusal was silent. No end-turn spin, no BLOCKED, no errors from our code.
- **Probe answered: a unit moved ahead of an item never takes its progress,** a building's or a wonder's (Tavern 119, Laboratory 126, Oxford 246, Chart the Stars 127 all resumed). Root gotcha 20's caution about units is unneeded.
- **War rules:** WAR_RISK fired 4 turns before Napoleon's declaration. At war, the savings goals were cleared, and conversions and wonders held. Strikes were all kills; impossible attacks were skipped.
- **Queue and gold:** no ping-pong (35 MoveTo in 210 turns); settlers front-loaded; goals within reach bought on schedule; 3 Exploration conversions.
- **Wonders and towns:**
  - 5 wonders built: Dur-Sharrukin, Colossus, Emile Bell, House of Wisdom (Society's mastery, S4), Battersea.
  - Urban Center town purchases: an Observatory, a University and a Schoolhouse.
- **Science:** we led science per turn and techs in the Modern age. `gateLate` correctly sent research to the masteries (+10).

## 4. Problems
### Score and final age (decisive)
| # | Problem | Evidence | Fix |
|---|---|---|---|
| F1 | A rival's countdown in the final age is not treated as the loss it is | Alexander DANGER M56; countdown M63–M64 = +1000 = the game | In the final age, any switched-on dominance race where a rival can start a countdown is a score threat from WATCH level. Act early and fast: for military, settle the **nearest** safe site (`pickSite(…, {nearest: true})`) or buy one, and keep the overlay's settler within reach of founding before the projected countdown; for culture, wonders and denial; for economy, GDP buildings. |
| F2 | We never seek our own countdown turns | Score 851; one countdown turn = +1000 | In the final age's last ~15 turns, if a dominance race is within reach of a countdown for us (our points ≥ goal − what we can add: settlements for military, GDP buildings for economy, wonders for culture), push it. Log the score race (PlayerScore is not readable by script; estimate from countdown turns). |
| F3 | Final-age deadlines | Settlers trained M67; Dogo Onsen M48 and Ubudiah M60 started though they could not finish; the age-length estimate said 118 turns at E1 (the age had 70) | `data/xpl-wonder-job.js:199` and `unitsWanted`: use `ageOutlook().turnsLeft` in the final age too (the game ends at 100%). `ageOutlook`: in an age's first turns use the nominal 70-turn length. |

### Expansion (Antiquity again)
| # | Problem | Evidence | Fix |
|---|---|---|---|
| X1 | Settlers idle with sites "known": `noteNoSite` does not use `pickSite`'s checks | A11–A27 «2 sites known, 0 unsafe, 0 seas, 0 too far» (both picks unreachable or beyond the 5-turn limit) | One shared filter that returns a reason per pick (`no path`, `beyond Nt`, `unsafe way`, `taken`, `failed`). |
| X2 | Below 3 settlements a site 6+ turns away is never taken, not even by the give-up | idle 13+ turns with picks known | After 2 passes with no order, use `SETTLE_MAX_TURNS` 10. The `nearest` give-up always uses it. |
| X3 | The relaxed search only below 2 picks; unseen villages reject tiles | A4 «villages 0 seen, 18 unseen; INDEPENDENT 171»; relaxed first at A24 | Also run it when a settler had no order on 2 passes. In the strict search, far below the cap, an unseen village costs a penalty instead of rejecting the tile. |
| X4 | A war risk from espionage alone frightens settlers | Napoleon a risk A22–A70; «4 unsafe» until the risk ended | For settlers, a risk army counts only when its leader is Hostile, or within 1 tile of the way. |
| X5 | A settler retreats back and forth between settlements instead of waiting | 18 SETTLER_RETREAT in Antiquity; SETTLER_GOES never fired | Stay in a garrisoned, undamaged centre; count retreats as waits; after 3, go for a site within 4 turns. |
| X6 | No progress watchdog for a walking settler | E12 «8 turns» took 25; M29–M38 one tile from its site for 10 turns | Track path turns per settler. With no progress for 2 turns, found here if valid, else mark the site failed and pick again. |
| X7 | A settler bought at war, with no reachable safe site | E51 380 gold, idle until the age ended | `settlerOffer`: none at war at our door; require a reachable safe site from the buying city. |

### War
| # | Problem | Evidence | Fix |
|---|---|---|---|
| W1 | Guards too weak, and no research toward a stronger melee unit | Coursers 40 against Knights 45 and Tercios 42; Heraldry only at E63 | With a war risk or war: research the node unlocking a melee unit stronger than `bestTrainableMelee()` when it is at most one step away (like walls). |
| W2 | `guardsFor` overcounts, so no defender was bought E47–E50 with 356–1,745 gold free | ranged units counted; one unit for several settlements; naval raiders dropped (Нант fell to 2 Cogs + a Knight with a ranged garrison) | Count melee units only, within 2 or on the centre, each for its nearest threatened settlement; want a melee unit on every threatened centre, naval raiders included. Log `defenders: none for X: …`. |
| W3 | Economy bought before defence on the first war turn | E47 736 gold on an Observatory, a Sawpit and a Brickyard | At war at our door: defenders and upgrades first. Victory and plan purchases only from what is left after `defenderPrice` × the threatened settlements without a melee centre guard. |
| W4 | Walls research waits for an idle slot; the threat streak needs consecutive turns; walls researched for a passing raid | Castles chosen E51 (war since E47); Masonry A25–A50; E29 Machinery for a 1–2 raider threat that ended E30 | At war at our door, switch the active research to the walls (probe: does the interrupted node keep its progress?). Count threatened turns in a window (3 of the last 5), only with a major's units or 2+ raiders. |
| W5 | A conqueror is not a war risk unless Unfriendly | Alexander DANGER from M56, AI target on Шанхай M57, declaration M62, never a WAR_RISK | A major at military DANGER, or in a military countdown, is a war risk at any distance. |
| W6 | Hurt units heal within enemy reach and are not re-checked while resting; a withdrawn unit was killed where it stopped | M23–M26 a Gusa shot 4 times while resting; E52 a Courser killed after withdrawing | Each pass, wake a resting hurt unit with an enemy within its reach; withdraw into a settlement centre or behind our units, 3+ tiles from ranged and naval units. |
| W7 | Leader dialogs (war declared, peace accepted) hold the turn until a human closes them | 30, 26 and 11 s with the user present; unattended they would wait for the turn timer | While no deal is pending, close `INTERFACEMODE_DIPLOMACY_DIALOG` after ~5 s (`DiplomacyManager.closeCurrentDiplomacyDialog()`). |
| W8 | Walls bought with all the gold against one raider | M27 1,068 of 1,078 gold, THREAT count 1 | `all()` only with 2+ land raiders, a damaged centre or a war at our door; otherwise `free()`. |
| W9 | Counter-spy not renewed | Catherine's steals succeeded M40, M49, M66; no counter-spy after M35 | Renew against a leader with a revealed steal in the last ~30 turns. |
| W10 | Crisis story options without icons fall back to the first one | A61 "+2 war support" over "+2 Happiness" while settlements revolted | Value icon-less options by their reward modifiers (`effectsOf`). |

### Science and production
| # | Problem | Evidence | Fix |
|---|---|---|---|
| P1 | The Airfield is never built nor bought | Flight first M32–M35; no Airfield; 234–795 gold idle «goal none» M42–M70 | When no city builds it within 10 turns, queue it in the best producer anyway if it and its project fit the age. The site's goal ignores `GOAL_HORIZON` while it fits the age. |
| P2 | Units overtake Innovation work: settlers in COMMIT ahead of Oxford (lost by 97), a Knight for a war risk ahead of the Heliocentric Model (lost by 51); a Landship ahead of the Red Fort | M11/M17 `UNIT_SETTLER moved ahead of WONDER_OXFORD_UNIVERSITY`; E64 Knight; M23 Landship | Only real defenders (queued for a threatened settlement) go to slot 0. Nothing moves ahead of a wonder in a race unless our ETA still wins it (the wonder job's race), nor ahead of a gate project that would then miss the age. `expansionDeficit` overtaking not in COMMIT. |
| P3 | A gate project waited behind a building the plan queued the turn before; no log of `projectSlot`'s verdict | E59 Kiln queued; E60–63 Kiln before the Heliocentric Model | While a gate project is near (its node ≤ 1 away, or queued), no plan building in its city; log `queue: project …` verdicts. |
| P4 | A lost wonder's refund (50 % plus that turn's production) poured into a cheap unit queued behind it | M37 the Red Fort's 300 into a 15-cost Scout | Never a unit right behind a wonder in production; keep a big building there. |
| P5 | Wonders started in weak cities: the race says HIGH for any length when no rival builds it | Wat Xieng Thong, Serpent Mound at 29–30 turns in 8–12 production; both lost | `core/xpl-wonder-race.js` 47–50: cap by turns there too (HIGH ≤ 10, MEDIUM ≤ 15). `chooseWonders`: skip options over ~15 turns. |
| P6 | Codex research with no free slot; 5 codices archived (probably lost at the age change) | 6 codex masteries A33–A56; Mathematics (Academy, Spherical Earth) only A59–A66 | Count codex unlocks as wanted only while free writing slots (built or queued) ≥ codices waiting; else target the Academy's node. |
| P7 | Gate ETA too pessimistic early (science grows) | A4/A7 Chart the Stars and Literacy «out of reach», both done | No ETA skip before ~25 % of an age, or scale by the expected growth; take the way from `player.AI.getProgressionTreePath` if available. |
| P8 | `gateLate` flickers on tech-pick turns | M1, M4, M8, M11 PADS ↔ LEVER | Hysteresis: keep it once set unless the ETA drops clearly below. |

### Gold
| # | Problem | Evidence | Fix |
|---|---|---|---|
| G1 | The war-risk keep exists only in `convertTowns`: a goal «held 225/1500» that cannot be bought while the same gold goes elsewhere | A40–A48, E38–E46; A49 Garden + Sawpit | Count the keep in the goal's need (`withinReach`) and its label. |
| G2 | A goal that cannot be bought before a non-final age ends | CODEX 432 held A67–A70 | Skip this age's building goals whose ETA exceeds the turns left. |
| G3 | Unit upkeep ate the Modern economy | upkeep 112–150 against income −38…77; doubled at the age change | Guards only for settlements near the risky leader. At an age start with upkeep above half the gross gold, disband the surplus soldiers furthest from any threat. |

### Small
- S7 never fired, with no log. Log the revisit verdict once per town per age.
- Names in the log: independents show as «деревни»; the queue probe prints "?" for a unit.
- Leftover defenders were still built after the peace.
- Spherical Earth was queued while out of reach (76 production lost).
- To probe: Ming's −15 Science per forced policy (Exploration science 21–41 against Russia's 44–101); whether the codex archive is emptied at an age change.

## 5. Probes
| Probe | Answer |
|---|---|
| research/23 #1: does a unit moved ahead of a building take its progress? | **No.** Units never take an item's progress. |
| research/23 #2: does a scripted INSPECT get an answer? | **Yes.** E54: an inspected yes, then the proposal was accepted and peace followed. M70: a silent refusal. |
| research/23 #3: does ACCEPTED on an AI-proposed peace conclude it? | Not tested: no AI offered us a deal. |
| research/23 #4: does a town Focus change cost anything? | Not tested: S7 never fired. |
| A lost wonder's production | Half its progress plus that turn's production goes to the next item in the queue, its overflow capped. |

## 6. Proposed order
1. **Score defence (F1–F3).** It decides a game nobody wins outright.
2. **War (W1–W10)** and **gold (G1–G3).**
3. **Expansion (X1–X7).** Antiquity still has one city for half the age.
4. **Science and production (P1–P8).**
5. **Small.**

## 7. Status (2026-10-14)
The whole list is implemented (the user: "implement whole list", and units escaping onto shallow water), each fix with a test proven to fail without it (64 prover cases, `prove_g9.py`, run on a scratch copy because the game reloads every edit), not yet tested in game: TESTING rows 240–256. No new files; root CLAUDE.md gotchas 20 (units, projects, the wonder refund), 38 (crisis stories), 39 (the score victory), 40 (shallow water).
- Choices made while implementing:
  - F2: our own chance counts only dominance races (culture, economic, military), at 85% of the multiple × the best other; in the final age it starts that victory's overlay like a rival's WATCH would.
  - F3: the age length on a new age's first turns is the previous age's, measured from its own samples (scaled when sampling started late); Antiquity's first turn still uses 120.
  - The water escape: a soldier with 30+ damage, or resting hurt, or a scout, with hostile units within 2; shallow water only (coast or a lake, never ocean or a navigable river), reached this turn, with no ship, aircraft, ranged or siege unit within 4. It stays while land soldiers are within 3 and none of those comes near. A scout with no water near keeps its own step away.
  - W2: guards are melee land units within 2; a settlement with only ships near wants one (research/22 B7's two Knights against cogs stays fixed: one, not two).
  - W4: switching research under way only for a war at our door; the interrupted node's progress is a probe.
  - W7: a dialog closes only when all its choices acknowledge or exit (the game's own selections are only those two), not a first meeting, not with a pending deal.
  - G3: disbanding is limited to a non-first age's first 8%, at peace with no risk or threat, when unit upkeep exceeds the gold income; 2 soldiers per settlement kept, never a garrison, 2 a pass.
  - X3: the unseen-village penalty uses the existing independent penalty (15 / 4 hundredths of the site's value within 3 / 6).
  - P1: the AIRFIELD goal is in every science Commit goal list; it is offered only once Flight's or Aerodynamics' mastery opens its projects.
  - P3: instead of keeping plan buildings out of a gate project's city, the project goes ahead of any plain building (no production lost either way).
  - P4: the building put behind a wonder is one already queued, else the costliest the city can place.
  - P5: the per-option cap (15 turns) and the label cap both apply; a faster city's HIGH label no longer lets a slow city start the wonder.
- Not covered by a test (engine-bound): the hud's relaxed search on settler starvation (`relaxedTurn`), the leader-dialog closer's timing (its rule is tested), the disband and upkeep calls in the hud.
- Probes for the next game: does a node interrupted for walls keep its progress (UI.log `research: … interrupted`); do units really avoid melee attacks on coast; the probes of §5 still open (research/23 #3, #4).

## 8. Game 10, first turns (2026-10-14)
- Seen: an independent's warrior hit our scout at 51,13 on turn 13; it stepped away on turn 14, and on turn 15 the game's auto-explore walked it back there to be hit again. A settler going to 42,10 retreated home on turns 13 and 15; on turn 16 it and a new settler stood on Чанъань with a raider near, both tried to wait, the game refused to skip two civilians on one tile, and NOTIFICATION_COMMAND_UNITS held the turn (UI.log `cannot skip UNIT_SETTLER`, BLOCKED).
- Fixed (the user: "reroute widely"): hit spots as danger for 5 turns, no game auto-explore while hurt or near danger, hurt scouts heal at home, settler detours (also when leaving a raided settlement and for a site reachable only around danger), stacked civilians step aside. 9 prover cases; root CLAUDE.md gotcha 41; TESTING rows 257–259. JS only plus 2 strings: a full restart is needed for the strings.
- Game 10's Antiquity (to turn 70): 1 settlement of 4 at the end. Лоян (founded turn 29) fell on turn 44, Цзиньян (turn 26) on turn 66. One independent (player 22) attacked all age with archers (25 shots at our centres), quadriremes and galleys (~20) and warriors; we had warriors and one spearman. Its befriend project said -3 (no viable targets: village unseen) until turns 56 and 69; «villages 0 seen, 16 unseen».
- Fixed (the user: "if we don't scout villages they destroy us"; "ranged, not melee, against ships"): scouts reveal near villages first; ranged defenders against ships. 6 prover cases; root CLAUDE.md gotcha 42; TESTING rows 260–261.
- Game 11, Modern turn 57 (the user: "why a Cannery over the first space flight?"): the plan queued [Launch Pad, Cannery] in Лянчжоу at about M45; the pad's overflow went into the Cannery (89.5 of 409 at M57); Crewed Space Flight Preparation, queued at M56, stayed behind it (repeatable projects used `frontSlot`, not the P3 exception). Also the capital built Antiquarians M56-M58 (culture overlay at DANGER). Fixed: the Preparation moves like the one-offs, science sites are never passed, space cities get no plan or advisor buildings and no overlay units. 5 prover cases; TESTING row 263.
