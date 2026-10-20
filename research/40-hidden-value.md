# 40. Hidden value the autopilot misses (audit after game 41)

After game 41 the user asked how many "hidden significant" things like Rome Reborn the autopilot misses (a cheap civic giving
+1 tradition slot and +1 settlement cap, researched only when the player clicked it at about 87% of Exploration). Five
read-only research agents audited the game's data and UI code against our code, 20 October; their notes, with game-file and
code line references, are in `research/40-notes/`:

| Notes | Area |
|---|---|
| [research-trees.md](40-notes/research-trees.md) | technologies and civics, every civilization's tree, Test of Time trees, masteries, Future Tech/Civic |
| [civ-leader-uniques.md](40-notes/civ-leader-uniques.md) | every civilization and leader: abilities, unique improvements, great people, special commands |
| [unused-actions.md](40-notes/unused-actions.md) | every request the game's UI sends against what we send: diplomacy, espionage, city-states, units |
| [legacy-and-ages.md](40-notes/legacy-and-ages.md) | legacy paths, milestones, triumphs, age progress, age transitions, crises |
| [religion.md](40-notes/religion.md) | pantheons, beliefs, missionaries, relics, the religious crisis (the user's "toxic" effect) |

The short answer: a lot. Most of it falls into four patterns.
1. **The game's advisor is blind to "structural" value.** For research it only knows MILITARY, CULTURE, SCIENCE and ECONOMIC
   classes (`base-standard/data/advisory.xml:208-220`): a node classed FOOD, HAPPINESS, DIPLOMACY or nothing is never
   recommended. 101 of 106 Test of Time nodes are blind (100 give a tradition slot, 75 a settlement cap), and every base-game
   Exploration civilization tree has no advisory row at all. Our fallback takes the advisor's pick, so those nodes come last.
2. **Our value models score "unlocks" at zero.** Policy Yield Previews and our effect model value yields; slots, caps, relic
   beliefs, diplomatic actions and unit unlocks count for nothing. So pantheons and beliefs come out in table order, a crisis
   card that damages our buildings was slotted, and city-state bonuses whose only effect is an endeavor we never start were
   picked.
3. **Whole systems are never touched:** missionaries and relics, civilization great people, unique improvements, espionage
   beyond counter-spy, incorporating and levying city-states, most endeavors.
4. **Legacy paths outside the focus are ignored**, though each milestone is a legacy point (at least an attribute point next
   age), and two cheap settlement milestones give +2 settlement cap for a whole age.

## Already done (game 41 session)
- Repeatable research (Future Tech, Future Civic) only when nothing else is left, in every game (root gotcha 72).
- In a non-final age's last turns, research only what is done before the age ends; the research in progress gives way (the
  user's point; gotcha 58). Each Future node also adds +10 age progress (`HumanOnly`: AI picks never move the clock), so a
  Future node done at the end shortens the age further.
- The syncretism choice no longer holds the turn (gotcha 13).

## Ranked proposals
Value: what a good player gains (H/M/L). Effort: XS < S < M < L. Sources: R = research-trees, C = civ-leader-uniques,
A = unused-actions, L = legacy-and-ages, G = religion (rule numbers as in each note).

### Tier A: high value, small effort
| # | Proposal | Value | Effort | Sources |
|---|---|---|---|---|
| A1 | **Structural research first.** Before the advisor's pick (after walls, a war's melee unit, the seas and the science gate), a node whose next depth grants a settlement cap, a tradition/policy slot, a specialist cap or a syncretic choice, cheapest first; detected by the modifiers' effect types, as `core/xpl-effect-value.js` resolves them. Keep the unlock rows gated by a trait we own (Hierarchy, Foundation, Administration give a cap, a specialist cap or a wonder by our attribute; today every reader drops `RequiredTraitType` rows). The science path wants every specialist-cap modifier, not only Exploration's. | H: Rome Reborn at E1-E3 instead of E60; Irrigation (+1 cap for 125 science), Entertainment, Globalism; every civ tree's slots and caps | S | R1, R2, R6; C-G1 |
| A2 | **Never slot Ius Reformandi; value the religious crisis cards.** It damages 3 buildings in each of OUR settlements newly following our religion (`traditions-gameeffects.xml:664-680`); our model valued it "?" and slotted it in game 41. Add `REQUIREMENT_CITY_FOLLOWS_RELIGION` to the settlement tests, value `EFFECT_CITY_DAMAGE_CONSTRUCTIBLES` strongly negative. | H (prevents harm once conversions start) | S | G1 |
| A3 | **Pantheon and beliefs by value.** Today the first the game allows (game 41: Earth Goddess; beliefs in table order, one of them Icons, which pays for converting city-states we never convert). Rules per focus from the data: Forge or God of Wisdom for science, Festivals for culture, Harvest in Growth; Covenant as founder when nothing will be converted, else Chesed or Feed the World; Sukha or Akhlaq as the relic belief; Sanctum or Parampara as enhancer. | H (all of Antiquity, all of Exploration) | S | G2; A1 |
| A4 | **Endeavors from what the game offers, not a list of six.** Rank what `getProjectDataForUI` offers: Lafayette's Reform (+1 tradition slot per leader, permanent), Research Collaboration, Military Aid, Send Delegation (+4 Happiness a turn), the leader-unique actions (Himiko, Ibn Battuta, Napoleon); support others' endeavors (doubles our share); spread endeavors over every leader once for «Gregarious Animal» (+1 policy slot). | H for Lafayette, M others | S | A2, A8; C-G6; L-P5a |
| A5 | **Merchants for trade civilizations with any focus** (Chola, Aksum, Xerxes alt, Babylon, Mississippian, Elizabeth, unique merchants): today only under the economic focus. | M (about 12 civs/leaders) | S | C-G5 |
| A6 | **Factory Town focus** (Modern: +1 resource slot, +100% gold toward a Factory, Port or Rail Station): missing from our focus table. | M (economic path) | S | A9 |
| A7 | **Future Tech in the final age's race counts its clock cost** (+10 age progress ≈ 5 turns closer to the end), and the rival-near-a-win `noFutureTech` rule applies in the advisor fallback too. | M (correctness of the science race) | S | R5; L-P1 |

### Tier B: high value, medium effort
| # | Proposal | Value | Effort | Sources |
|---|---|---|---|---|
| B1 | **Our own settlements follow our religion.** Train 1-2 Missionaries (150 production, 3 charges) while our settlements do not follow it: unconverted ones first (1 charge), then foreign-religion ones (2), the unhappy ones first in the religious crisis (they can defect to the religion's founder). Pays: Chesed / Feed the World per settlement, 1-2 relics per first conversion (Exploration culture path: 12 relics; Modern: 3 culture points each), the Distant Lands military points double for followers. Game 41: rivals converted 4 of our 5 settlements; we trained 0 Missionaries, rivals 19. | H | M | G3, G5, G6; A6 |
| B2 | **Settlement milestones of the military path.** Antiquity: 6 and 9 settlements (conquered count 2) give a legacy point (an attribute point) and, both, the «Fealty» card (+2 settlement cap all Exploration); game 41 ended Antiquity at 6 of a cap of 8. Exploration: fill the cap, aim at 16 homeland settlements (triumph: +2 Modern cap, 8 military points). Settlers in Build-up while the next milestone is within the cap's room and a safe site is known; cap research ranked high while the cap binds. | H | M | L-P2, L-P3; R7 |
| B3 | **Cheap off-focus milestones.** Each milestone of any path is a legacy point; take the first one of each path when cheap (Antiquity: 3 codices, 2 wonders; Exploration: one 40-yield district, 4 Distant Lands points). Log each path's standing once a turn and at the age's end. | M-H | M | L-P4 |
| B4 | **Civilization great people** (Tjaty, Logios, Shi Dafu, 'Alim, Shijin, Conquistador, Jacobin, Revolucionario, Uparat, Saga Hero: 10 civs, 101 individuals): trained one at a time, walked to their required building or district, activated (`UNITCOMMAND_ACTIVATE_GREAT_PERSON`): free techs, +200/250 production on a wonder, Palace yields. | H for 10 civs | M-L | C-G3; A3 |
| B5 | **Unique improvements** (24: Baray, Great Wall, Stepwell, Terrace Farm, Caravanserai, Ortoo, Bang…): never queued (the plan holds buildings only). v1: queue each on the game's offered tiles the plan does not keep, when it pays back; v2: the solver places them. | H for 24 civs | M (v1) / L (v2) | C-G2 |
| B6 | **Espionage.** Steal tech / civic (80/160/240 Influence for a whole node; game 41: rivals stole 45 techs and 36 civics from us, we stole none); sabotage a rival's space program (−50% to its pads and satellite) when its science countdown approaches. | H (science, culture); decisive vs a rival's science win | S-M | A4, A11 |
| B7 | **City-states: incorporate and levy.** Incorporating makes one our settlement without a settler (+4 military points; the AI did it 7 times in game 41); levying gives instant defenders near a threatened settlement. | M-H (military/score), M (defence) | S | A5, A7; C-G11 |
| B8 | **Town purchase abilities** (Augustus, Carthage, England, Gaul, Joseon): towns may buy more building types; use the game's PURCHASE answer per town instead of `Buildings.Town` only. | M-H for 5 civs | S-M | C-G4 |
| B9 | **Culture focus research levers**: Modern Future Civic (+10 culture points and an artifact, about 15 points, more than a Modern wonder's 12) while we lead or can block; Natural History, the Hegemony mastery. | M | M | R4 |

### Tier C: smaller or situational
- Site search by trait terrain rules (Inca mountains, Gaul's 6-tile spacing, natural wonders for Isabella and Iceland): C-G7.
- Resource-improvement traits valued with any focus (America +50 gold per improved resource): C-G8.
- Special unit commands: Rome's Legatus founds towns, Genghis converts independents, Nepal's Sherpa: C-G9.
- Commander commands we unlock but never use (Commander Attack, Second Wind, Defensive Perimeter): A12.
- Crisis stories: prefer the option carrying the crisis tag (a next-age crisis card): L-P7.
- A legacy summary in the Autopilot tab in an age's last turns (the cards stay the player's): L-P6.
- Converting foreign settlements, opt-in (city-states for relics; rival settlements may defect in the crisis): G4.
- Merchants' «Build Road to Settlement» for towns with no connected city (gotcha 12): A10.
- Out of the defensive design (the user's decision): leaders rewarded for conquest, kills, pillage (C-G11).

## Probes for the next game (UI.log only)
- **P-AGE-1:** once a turn the age's points with the delta and its cause (our Future node done, a milestone newly complete): confirms +10 per Future node and milestones counting once.
- **P-RES-1:** the `"*"` research picks with each candidate's advisory classes (the blind-advisor model).
- **P-UQI-1:** whether `calculateAllBuildingsPlacements` lists unique improvements (decides B5 v1's scoring).
- **P-GP-1:** `canStart` of `UNITCOMMAND_ACTIVATE_GREAT_PERSON` off and on a valid tile.
- **P-REF-1:** how Lafayette's Reform shows in `getProjectDataForUI`.
- **P-INC-1:** whether an incorporated city-state counts toward the settlement cap.
- **P-LEG-1:** at a transition, our class legacy points and the cards offered.

## Suggested order
1. Tier A (A1-A7): small, data-driven, and A1 + A2 + A3 cover what game 41 showed.
2. B1 (missionaries) with A2 and A3, as one religion step.
3. B2 + B3 (legacy milestones and settlements), B6 (espionage), B7 (city-states).
4. B4, B5 and B8 (civilization uniques), after their probes.
