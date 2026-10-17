# Game 27: a science race lost in the last turns

Pachacuti: Han → Ming → Qing, science focus. Every other victory was off, the score victory too. One game process, 01:13–02:30.
**Lost:** Xerxes (Persia → Qajar) won the science victory at Modern T102 (`GameCore.log`: `Team 3 has won … 'VICTORY_SCIENCE_MODERN'`).

- No JS error of ours; the game's own `unit-flags.js:348` 364 times.
- No turn was held (no BLOCKED entry).
- Two screenshots from the user, already fixed: research/31 §8 (Лоян's unhappy specialists, Ханькоу shelled by two Dreadnoughts, walls first).

## 1. The race
| Age | Innovation at the end: ours | Best rival |
|---|---|---|
| Antiquity | 14 | 10 |
| Exploration | 23 | 26 |
| Modern | 86 at T100 | Xerxes 103 at T97, won T102 (5-turn countdown) |

- **Modern T1–T61 gave us nothing** (23 → 23). Xerxes went 26 → 34.
- **Rocketry (the Launch Pad):** 14 earlier techs, 49,400 science on the Modern tree. Research went straight along that way; Flight is on it. Rocketry was chosen at T62 and the gate opened at T69.
- **Our science was close to Xerxes's** (`Player_Stats.csv`): T50 488 against 407, T70 542 against 564. His production was not: ours 229 → 336 in 4 cities, his 325 → 549 in 3.
- **The space work:**
  - **Xerxes:** his first Launch Pad was done at T77. Then his capital ran Crewed Space Flight Preparation every 4 turns (T86, T90, T94, T97, T102).
  - **Us:** our first pad was done at T86. The capital's first Preparation ran T90–T95, and Чэнду's T91–T101.
- **The games 24–26 changes worked:**
  - Modern passed 100% at T69 and the space work went on: pads were built T70–T95 and projects run T87–T101, with no GAME_END entry.
  - Production first queued 8 buildings T71–T79: a Sawmill in the capital; a Stonecutter and an Ironworks in Чэнду; a Harbor, Brickworks, Sawmill, Stonecutter and Ironworks in Ханькоу.

## 2. The space work traded places in the queue (a bug)
- **The cause:** `pushVictoryWork` moves the science sites least important first (`[...activeSites(pads)].reverse()`: "each move puts it in front"), and the projects in list order. Since game 21 a city's queue is edited once a pass (root gotcha 54), so only the first move of a pass counts.
  - **Sites:** the Airfield claimed a pass's edit, the pad moved ahead of it the next pass, and so on.
  - **Projects:** Crewed Space Flight Preparation and the one-offs did the same.
  - **Result:** whichever was next when the item in production finished was built.
- **The capital:**
  - Its Launch Pad was queued at T70 and the Airfield at T72.
  - When the Sawmill (production first) finished at T73, the Airfield was next: built T74–T80, then the pad T81–T86. The pad was done 6 turns late, and so was Preparation.
  - Its projects ran in no set order: Trans-Oceanic Flight T87–T89, Preparation T90–T95, Launch Satellite T96–T98. Break the Sound Barrier never ran.
- **The queue moves** (`net_message_debug.log`, CityOperation `eInsertMode: 10`): the capital's queue was moved on 26 turns of Modern, in every turn from about T85 to the end.
- **Proposal:** one order of the victory work per city:
  1. production first;
  2. the Launch Pad;
  3. Preparation;
  4. the one-off projects;
  5. the Airfield;
  6. the path's buildings.

  A move stops behind any item of a higher rank, as it already stops behind production first (`behindFirst`). The moves then settle instead of taking turns.

## 3. Preparation before the one-offs, and no Airfield in a Launch Pad city
- **Game 27's costs** (`CityBuildQueue.csv`): Preparation 1000 production for 15 Innovation; each one-off 500 for 5. Preparation gives 1.5 times the Innovation per production.
- **The Airfield's way is worse still:** 861 for the Airfield plus 1000 for its two projects gives 10 Innovation, 0.54 per 100 production against Preparation's 1.5.
- **In the capital** the Airfield and the two one-offs took 1,861 production for 10 Innovation. Preparation would have given about 28.
- **Proposal:**
  - In a city with its own Launch Pad, Preparation goes ahead of the one-offs.
  - The Airfield goes only to a city with no Launch Pad. `airfieldOrder` kept it in the capital, the first pad's city, because Чэнду made 0.5 of the capital's production (below `AIRFIELD_NEAR_SHARE` 0.6).
  - With both, the capital would have run Preparation from about T81, worth about 15–20 more Innovation by T100. That alone does not close the gap to Xerxes's capital, which made twice our production.

## 4. Antiquity research went to melee units for a war risk
- **What happened:** from T33 to T49, `TECH_FOR_MELEE` took six techs (Irrigation, Bronze Working, Masonry, The Wheel, Military Training, Iron Working) for Spearman, Chariot and Horseman. Friedrich was a war risk; no war came in Antiquity.
- **What it cost:** at T43 the Spherical Earth gate was out of reach by one turn (`about 28 turns of research and project, 27 left`), and it never came.
- **Later:** Friedrich declared war in Exploration (T19–T34). By then Antiquity's units were obsolete.
- **Proposal:** research for a stronger melee unit only with a war at our door, not for a risk alone (`meleeNode`; research/24 W1).

## 5. Ships took two settlements' centres in Modern, and Ханькоу's
- **Фучжоу** (T22): a city-state's Frigate. The log said `ranged 0/2; nothing to buy within 264–408 gold`.
- **Пекин** (T29): two Frigates and a Dreadnought.
  - Its Field Cannon, bought at T25 for 540, shot every turn (T26–T29) and sank the Dreadnought.
  - The Frigates took the unwalled centre (100 HP).
- **Ханькоу** (T77): research/31 §8.2. Its Field Gun slept on alert, and its walls waited 10 turns behind a Laboratory.
- **Already changed:** guards shoot from their post, and walls go first (research/31 §8.2).
- **The rest is gold:** our income was 18–53 a turn (§7), and a ranged defender cost 540.

## 6. A wonder left the queue after a purchase in its city (the probe)
- **What happened** (`net_message_debug.log`): at Exploration T5 the autopilot ordered the Serpent Mound in Чанъань (BUILD at 59,13). In the same pass it bought a Harbor there (PURCHASE at 61,17), then ended the turn.
- **At T6** the capital's queue was empty, and the wonder had never appeared (`last seen never`). Ordered again at T6, it was built.
- **The lead grows:** this is the fourth of eight such cases with a purchase in that city at that time (research/31 §5: three of seven before).
- **Proposal:** no purchase in a city in the pass its wonder is ordered (`wonderOrders` knows them). This is cheap, and the next games would show whether wonders stop leaving.

## 7. Smaller findings
- **Gold:** our income was the lowest but one in Modern, 18–53 a turn (`Player_Treasury.csv`). Unit upkeep took 120–201 of about 155–165 gross. The rivals kept as many units, but earned 2–3 times the gold.
  - No town became a city in Modern: the cheapest conversion cost 2,200. We had 4 cities and 9 towns all age.
- **An Antiquity settler took 27 turns to found** (queued T36, founded T63 at 47,24).
  - Its site changed four times: 63,4 → 56,21 → 50,19 → 56,21 → 47,24.
  - Its detours alternated between 62,11 and 60,16 with no progress (T42–T49).
  - The log does not say why the 2-turn site was dropped at T41.
  - Antiquity's settlement cap was 3 until about T35, then 4.
- **Exploration's science gates were out of reach from T22** (Invent Calculus: about 76 turns needed, 48 left). The war with Friedrich (T19–T34) took two techs for walls (Machinery, Castles) and one for a Knight.

## 8. Proposals
1. **The space work in one order** (§2; a bug): each move stops behind any victory item of a higher rank.
2. **Preparation first in a pad city; the Airfield only in a city without a pad** (§3).
3. **Melee research only with a war at our door** (§4).
4. **No purchase in a city in the pass its wonder is ordered** (§6).

## 9. Changed (the user: «implement all of them»)
Each change has a test that fails without it: 23 cases, run on a copy (scratchpad `prove_g27b.py`). TESTING rows 311–314. Root gotchas 25, 28, 54, 55.
1. **The space work in one order** (`VICTORY_RANK`): production first, the Launch Pad, Preparation, the one-offs, the Airfield, the path's buildings.
   - The most important moves first, and a move never passes an item of the same or a higher rank.
   - `toFront`'s `behind` now holds wherever the named item stands, not only at the front of the queue.
2. **Preparation first and the Airfield elsewhere:**
   - No one-off goes to a city running Preparation.
   - The Airfield goes only to a city without a Launch Pad. One in a pad city does not count, and none is bought or saved for there.
   - Its fallback (no city builds it within 10 turns) now stops at 30 turns.
3. **Melee research** only with a war at our door.
4. **No building is bought in a city whose queue holds a wonder**, or where one was ordered this turn. This is broader than §6's proposal: the earlier three cases bought a building in a city whose wonder had been queued for turns. Units are still bought; walls only against a real attack; repairs are queued; no savings goal is held there.

Changed in the existing tests: the first levers test (no Airfield in a pad city, no Launch Satellite where Preparation runs, Lille's Airfield at 25 turns), two final-age tests (the Airfield now in Lyon, which cannot build a pad), and the war test (a war at our door, not a risk).

