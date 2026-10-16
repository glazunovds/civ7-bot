# Game 22: a lost race tied, production lost at the age's end, memory across ages

Maurya (José Rizal), six majors, the science focus in every age; the culture and domination victories off. Antiquity
took about 70 turns, Exploration about 70; the game ended at Modern T46 (66% of the age), 15:29 to 16:12.

**Lost:** Harriet Tubman (America) won the economic victory. At Modern T42 (60% of the age) the goal fell to 1.5 times
the second place (2707: about 1800) and her 3145 points started the 5-turn countdown; it ran out at T46, at 3285 points.
We had 896. A block needed 2519 at ×1.5 and 1549 at ×2; it came closest at ×3 (from Modern 20%): 913 needed against
our 800. Our science: 44 of 100
Innovation, Rocketry's way 53% done at 47% of the age. America's economy had been far ahead since Exploration (E35: 864
to our 361). No city was lost.

## 1. The game in numbers (`Player_Stats.csv`, `Game_Gossip.csv`, UI.log)
- **Settlements:** 4 in Antiquity (cap 5), 9 in Exploration (cap 10), 12 in Modern (cap 16).
- **Wars:** Tecumseh and Isabella declared war at A40 (peace A48 and A69) and again at E33–34 (peace E41 and E63).
  No settler is trained with a war at our door, so both wars came while we were below the cap.
- **Gold:** Exploration T29–T33 saved for Тосали's conversion (2170: 1500 and two defenders' price, gotcha 30). At T34
  the war reached our door: the goal was dropped (as designed), and defenders, walls, upgrades and a University took the
  gold. The next conversion was at Modern T29 (Варанаси). In Modern the goal switched between a conversion and the next
  science building as the candidates changed; 2398 gold waited at the end.
- **Wonders:** the Colossus (A28), the Emile Bell (A44) and the Grand Bazaar (E16). The Shwedagon Pagoda was lost (§2).
  `GOSSIP_LOST_WONDER_RACE`: the player column is the loser; its `Winning City` named our capital in every line, so the
  winner comes from `GOSSIP_CONSTRUCT_BUILDING`.

## 2. The Shwedagon Pagoda: a tie is lost
| Turn (Exploration) | Our capital (33 a turn) | Washington (about 97 a turn) |
|---|---|---|
| T29 | ordered, 33 | – |
| T36 | 264 (4 turns left) | 127.4 (4 turns left at our pass: it had 29.4 then) |
| T37 | 297, 3 turns left; a Knight moved ahead of it | 224.9 (3 turns left at our pass) |
| T38–T39 | the Knight | 322.4, then 419.9: done at T39 |
| T40 | the refund: 181.5 into the Knight (33 + 148.5), 7.2 overflow | |

- **Why nothing was cashed out:** at our T36 and T37 passes the rival's turns equalled ours, and `raceLost` lost a race
  only to a rival strictly faster. But a rival's production of a turn comes after our pass of that turn (its row of T37
  shows 224.9; at our T37 pass it had 127.4), so with equal turns it finishes a turn earlier. A rival moving before us
  would finish that turn before us too. **Changed:** a tie is lost, as the race label already said (root gotcha 53).
- **The Knight** was a defender the capital trained for Каузамби (2 raiders): defenders go to the very front by design
  (gotcha 20). It did not take the wonder's 296, and the wonder would have been lost anyway (we would
  have finished at T40). But the refund went into a 105-cost unit.
- **The late report:** UI.log said `WONDER_SHWEDAGON_ZEDI_DAW was finished by a rival` at E65, 26 turns late:
  `chooseWonders` returned before its order watch during the war at our door. **Changed:** the planner and the watch
  run first (the cash-out reads the planner's rows of this pass too).
- **Wonder Alert** reads rival build queues the same way (`city.BuildQueue.currentProductionTypeHash`, `getPercentComplete`),
  so the omniscient reading works in game.

## 3. Production lost at the age's end
`CityBuildQueue.csv`, the last turn of each age (an item not finished is lost at the age change):

| Age end | City | Item | In it |
|---|---|---|---|
| Antiquity T70 | Паталипутра | Garden | 18 of 60 |
| | Суварнагири | Lighthouse | 42 of 126 |
| | Рисила | Purabhettarah | 39 of 55 |
| Exploration T70 | Рисила | University | 287 of 313 (lancers T56–T61 and T63–T68 went ahead of it) |
| | Пуданагала | University | 258 of 266 (about 12 turns of work, started with about 11 left) |
| | Паталипутра | University | 109 of 313 (two lancers, walls and a settler went ahead of it) |
| | Суварнагири | Settler | 77 of 115 (queued at T63 behind a Dungeon) |

- **Changed** (root gotcha 58): in a non-final age's last 12 turns nothing is started that is done only after the age
  ends, and an item in production that cannot be done gives way to one that can. It would have saved about half:
  Пуданагала's University and the settler, the Antiquity items.
- **Not covered:** an urgent defender done in time still goes ahead of a building with progress (Рисила's lancers).
- **Unverified:** a queued item's own progress is read with `BuildQueue.getPercentComplete(hash)`. If the game answers
  0 there, an item moved back looks less far along than it is, and the rule only gets more cautious.

## 4. The save's properties do not outlive an age change
- At E1 and M1 our tack registry was empty (`placed 7, kept 0` after 8 tacks at Antiquity's end; no `registry: dropped`
  line) and the age's samples were gone: the first turn's estimate said 118 turns again (research/24 F3's fix relied on
  the save). The victory focus kept in the save (gotcha 47) could not have carried over either; the focus stayed Science
  by itself.
- **Changed** (root gotcha 57): the settings remember the focus and the age's length for this game (its seed and our
  leader). UI.log says when the memory gives the focus. The seed stays the same after an age change (game 23, research/30 §5:
  the memory answered at E1 and M1).

## 5. A unit moved ahead takes no progress; the item behind keeps its own (root gotcha 20)
| City (key) | Moved ahead | Of | With | The unit got | The item resumed at |
|---|---|---|---|---|---|
| Суварнагири (MAURYA4) | Archer, A37 | Library | 21.6 | 9 (its own) | – |
| Рисила (MAURYA8) | Spearman, A45 | Academy | 20.3 | 9 | – |
| Суварнагири | Knight, E41 | University | 49.4 | 22 | 73.4 at E48 (49.4 + 24) |
| Рисила | Knight, E41 | University | 48.2 | 19 | 70.2 at E49 |
| Пуданагала (MAURYA9) | Crossbowman, E43 | Medieval Walls | 61 | 16 | 79 at E49 (61 + 18) |
| Рисила | Lancer, E55 | University | 184.2 | 19 | 217.2 at E62 (184.2 + 33) |
| Паталипутра | Knight, E43 | Heliocentric Model (a project) | 66 | 39.6 | 114.2 at E48 (66 + 48.2) |
| Паталипутра (MAURYA1) | Knight, E37 | Shwedagon Pagoda | 296 | 39.6 (33 × 1.2) | lost at E39 |

## 6. Roads and merchants (the user's question)
- The game builds roads between nearby settlements when one is founded. A merchant's «Build Road to Settlement»
  (`UNITCOMMAND_CONNECT_WITH_ROAD`) goes from our urban tile to one of our settlements within trade range (10 / 15 / 20
  tiles: `ages.xml` `LandRouteRange`) with no direct road back; **it uses up the merchant** (the user).
- Roads matter most for food: a town with a Focus feeds only cities linked by a direct road (or both coastal on one
  continent). The autopilot gives no Focus to a town with no connected city (it keeps growing). How often that happened
  is not logged; the Towns tab marks such a town «Не связан ни с одним городом…».
- Not changed. A count of towns with no connected city in UI.log would tell whether a road step is worth a merchant.

## 7. Other observations (no change)
- **Modern research** went to Aviation, on the way to Rocketry. One pick went to Armor for a tank (`TECH_FOR_MELEE`)
  with only a war risk in the final push.
- **Гирингара's Focus** set on E1 did not hold: the town grew to 8. The towns step set it again at E8.
- **Base game errors:** `unit-flags.js:348 Expected this.unit to be non-null` 173 times (not ours).
- **Pace:** 153 of 179 recalculations were incremental; no JS error and no `ERROR` step line of ours.
