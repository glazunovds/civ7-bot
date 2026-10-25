# Games 51-53: two economic wins, then a long Modern war watched to M161

One game process, 01:09-04:22 on 22 October, the first games with gotcha 80's build (village hunts on, «Учебная война» on:
its `training war: none` lines ran every 10 turns). In all three the user played one civilization through every age.
`evidence.zip`: UI.log (our lines, JS errors), net_message_debug.log, GameCore.log, and the CSV logs of game 53 (they start
afresh with each game): Player_Stats, CityBuildQueue, Player_Legacies, DiplomacySummary, CombatLog, Player_Treasury,
AI_Commander_Promotions.

| Game | Leader / civilization | Focus | Result |
|---|---|---|---|
| 51 | Isabella / Meiji (all ages) | economic | WON the economic victory, Modern ~M31 (01:57); 15 of 17 settlements, 10 cities |
| 52 | Pachacuti / Prussia (all ages) | economic | WON the economic victory, Modern ~M30 (02:40); 18 of 22 settlements, 10 cities |
| 53 | Himiko / Carthage (all ages) | science | LOST the score victory at M70 (Team 1); then played on to M164 to watch the units |

## Seen in all three
1. **A bug of ours in the hud, on every pass:** `ERROR autopilot step strike failed Cannot access 'fieldFight' before
   initialization` (832 passes in all; also an ERROR entry in the tab's log each pass). The strike step called the hunt's
   fight above its `const` declaration. The shots and strikes before it in that step ran; the hunt's fight ran only in the
   later "field" step. Fixed on 22 October (test in `autopilot-hunts.test.mjs`).
2. **Small armies early, nothing for the generals to lead.** Game 52 had 0-7 land soldiers through Antiquity and
   Exploration, game 51 2-16. The village hunts never started: `hunt: none: … not enough force (melee 1 of 2 …)`, later
   `a settlement of ours needs its soldiers`.
3. **Generals:** game 51 ended level 1 and level 0 (2 fights near a commander all game), game 52 level 0 (43 fights).
4. **«Учебная война»** never found a target: neighbours were never at most half our soldiers (`soldiers 9 against our 13`,
   `19 against our 28`) or were allied (`allied with another leader`, `our ally`).

## Game 53
- **One city all game.** Carthage keeps every other settlement a town (gotcha 56): `cities 1, towns 15` in Modern,
  `conversions: none … BLOCKED cannot`. The science focus could not work: Innovation 27 at M60, 34 at M70 (`victory work: race:
  … Rocketry in 129`), the first Launch Pad only at M143. Team 1 won the score at M70 (`outcome: DECIDED (SCORE)`).
- **The war:** Tecumseh at our door from Exploration's end, then Isabella, José Rizal and Catherine at times. Modern's
  CombatLog: 407 attacks on us (129 on districts), 203 of ours (151 ranged, 52 melee); 97 enemy units killed, 35 of ours
  lost (7 to ships). Settlements lost: Тинга and Лептис to independents, Китион to Tecumseh.
- **Free soldiers stood idle:** the `defence:` lines say `15-26 free soldier(s) left` through most of Modern's war while each
  war front kept `melee 1 of 1`.
- **Китион (3,27)**, founded at M42 on Tecumseh's front with one guard: from M66 its centre went 100 → 87 → 81 → 42 → 33 →
  13 → 0 (M71) while reinforcements walked in one at a time (`melee 0 + 4 coming of 4 [… in 5t, … in 6t]`). Its Infantry
  Company died at M72; the bastion stood alone on the 0-health centre and was hit by a Mortar (M72), two Landships and a
  Mortar (M73: 12 of 100 left) and a Rifleman (M74), and went off the map; Китион fell. A campaign to retake it never started:
  `campaign: none: Китион of Текумсе: a settlement of ours needs its soldiers` (a damaged centre anywhere blocks it).
- **The bastion again, M149-M150:** walking on the coast at 17,31 it was shot by a Frigate three times and went off the map.
  Ships also hit a commander at M31 (10,43), M57 (4,36, twice); a Mortar at M66. Both times it came back later (the game's
  survival chance: 50% + 10% a promotion).
- **Fights near a commander:** 87 of about 610 Modern fights (14%) were within 2 tiles of a land commander, 33 of them the
  commander itself being hit. The vanguard sat at quiet posts (10,20 all Exploration, XP 13/15 from A50 to M18).
- **Focused attacks:** one Coordinated Attack in the whole game. 49 refusals, nearly all `at most 0-1 of ours joining (need 2)`.
  The game's own text sets no minimum: "Order all Ranged Units within Command Radius to fire on a specified target. All Units
  have +2 Combat Strength for this attack." The minimum of 2 is ours (`FOCUS_MIN_UNITS`).
- **No army was ever packed** (`army: … unitCount 0` all game; research/41 Phase 3 is not built).
- **XP at the age change:** the vanguard kept level 1 and 13/15 into Exploration; the bastion's 5/7 at level 0 went to 0/7. So
  XP short of the first level is lost, and past it XP is kept (gotcha 80 said all partial XP is lost).
- **Air:** one Airfield (Карфаген, M35), one Dive Bomber (M77) that struck 53 times; the Aerodrome holds 4 planes. No fighter
  ever: enemy Bombers hit us 11 times (Фена, Малет: `air: no fighter for Фена, Малет: no Airfield of ours with a free slot covers
  them (bases: 11,30 free 3 range 5)`), and a ground attacker is capped at one (`AIR_ATTACKERS_MAX`).
- **Nuclear:** Nuclear Fission came only after the game was decided (M70). We built the Manhattan Project first (M83-M92, an
  after-win wonder: one weapon granted) and never produced another or struck. Every AI built it afterwards (M94-M156) and
  produced weapons (CityBuildQueue: 2-15 completions each); no strike appears in any log. A strike is the air commander's
  `UNITOPERATION_WMD_STRIKE` with a Bomber or Heavy Bomber based there (the game's advisor text; interface-mode-wmd-strike.js).
- **The satellite:** the game was decided at M70, but with no Launch Pad (one city) `launchSatellite` had no city to run it until
  the pad at M143-M144; it was queued at about M144 and done at M147.

Analysis and plan: research/42-units-at-war.md.

## Built (22 October; root CLAUDE.md gotcha 81)
The user: "nuclear checkbox; implement A-E". research/42 §3 A-E: generals under soldiers (safety, the fight's tile, an escort,
focused attacks from one unit, Commander Attack by the preview); the army (fronts shared in a war, sorties, packed marches,
the home rule); air (fighters 4, ground attackers 2, bombers, an Airfield where raids land, the air commander's strike, the
preview); «Ядерное оружие» (off by default: Fission, the Manhattan Project, 2 weapons, a Bomber, strikes on enemy armies only);
the satellite's Launch Pad after the decision. 959 tests; 39 reverts proven (scratchpad `g52_prove.py`). A new file
(core/xpl-nuclear.js), a checkbox and new strings: a full restart. TESTING rows 463-470.
