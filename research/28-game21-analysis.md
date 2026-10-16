# 28. Game 21: wonders that left the queue, queue edits, settlers past the cap

Augustus, Carthage → Abbasids → (Modern), culture focus, autopilot all game. The player asked after Antiquity:
"we lost 3 wonders almost in a row, and 0 production was returned"; and later: "we didn't convert any town
to a city in the first age, and went 11 of 9 in the second: is it because cities outvalue towns when we
have enough happiness?" Evidence: `net_message_debug.log` (every request we sent), `CityBuildQueue.csv`,
`Game_Gossip.csv` (WONDER_STARTED, LOST_WONDER_RACE with the refund), `Historian.csv`, `UI.log`.

## 1. Wonders that left the queue (the "0 production" notices)
- **What happened (Antiquity, Carthage):**
  - The Emile Bell was ordered at T32 (twice: the end-of-turn retry, three seconds later, did not see the
    first order), again at T34 and T35. It was gone from the queue at T32 (within seconds), between T33
    and T34, and between T34 and T35, each time waiting behind the Bath. Ordered at T35 behind the
    Library, it was still there at T36, was moved to the front, started that turn and was built at T40.
  - The Mausoleum of Theodoric was ordered at T44 and moved to the front, but a second move of the same
    pass put the Library ahead of it (§2). At T45 a settler went ahead of it; by T46 it was gone. It was
    never ordered again: the planner's tile was refused and nothing said so. Maurya built it at T58.
  - Each had no production in it, so the game's notice said 0 was returned. These are the "3 wonders".
  - We sent no removal (no RemoveAt in `net_message_debug.log`): the game dropped them. Why is not known.
    Every wonder that went straight to the front was built (the Great Stele, Petra, Mundo Perdido, and
    in Exploration Wat Xieng Thong, Hale o Keawe and the House of Wisdom); the Dur-Sharrukin waited
    four turns and was built too.
- **No race was lost with production in it in Antiquity** (no LOST_WONDER_RACE for us in
  `Game_Gossip.csv`; all 5 wonders we started were built). In Exploration one: the Serpent Mound (§3).
- **Changed** (root gotcha 55): a waiting wonder goes to the very front (`wonderSlot`); an order of this
  turn counts as started until the queue shows it (`wonderOrders`); the planner's other tiles are tried
  when the game refuses one (`orderWonder`).
- **For the next game:** UI.log says when an ordered wonder leaves a queue unbuilt, with the queue, the
  game's answer for that tile and the game's own notices (`game notice: NOTIFICATION_PRODUCTION_INVALIDATED`
  or `NOTIFICATION_WONDER_FAILED: <text>`). That should tell why.

## 2. Two edits of one queue in one pass
- **T44:** `MoveTo(3 → 0)` (the Mausoleum to the front) and `MoveTo(2 → 0)` (meant for the settler) were
  sent from the same reading of the queue. The game applied the first, so position 2 held the Library:
  `CityBuildQueue.csv` shows the Library in production at T45, not the wonder.
- **Exploration T23–T24 (Chicago):** the cash-out and the refund guard each queued the Dungeon at 49,11
  in one pass; at T24 the wonder step moved the lost Serpent Mound back to the front and the cash-out
  moved the Dungeon ahead again.
- **Changed** (root gotcha 54): one queue edit per city per pass, types queued in the pass remembered, a
  lost race never moved back to the front, and the refund guard leaves a lost race to the cash-out.

## 3. Does an item moved ahead take the progress? (root gotcha 20)
- **Game 21, three cases, no transfer:**
  - T36: the Emile Bell moved ahead of the Library with 30. The wonder got 45 (its own 30 × 1.5); the
    Library kept its 30 (done at T45 with 65.2 = 30 + 35.2).
  - Exploration T23→T24 and T24→T25: Chicago's Dungeon moved ahead of the Serpent Mound with 29.7. The
    Dungeon had 23, then 45.9 (its own production); the wonder kept its 29.7 and was lost at T28 with
    7% complete, 14 returned (half).
- **Game 3** (research/13) saw the opposite once: the Pyramids' 136 went into a Market. Not resolved.
- **What we do:** nothing that loses production under either rule. A wonder moved ahead of a building
  absorbs its progress if the game hands it over; the cash-out picks the building that would keep the
  most. The cash-out still pays: Chicago put 5 turns of production into its Dungeon instead of a race
  that returns half.

## 4. Settlements: no conversion in Antiquity, 11 of 9 in Exploration
- **No conversion:** Carthage's `MOD_FORBID_CITIES_FROM_TOWNS` (`EFFECT_ADJUST_CITY_LIMIT` 1). No town can
  become a city while Carthage has one (the game hides its own Convert button at
  `numCities >= getCityLimit()`). The gold line said `cheapest conversion -` all age. As the Abbasids,
  Фена converted at E1, then Хамадан, Гадрумет, Чикаго, Дамаск.
- **Not happiness:** the town advisor compares a city's and a town's yields (`adviseTown`); Happiness is
  only a gate (no conversion in unrest or with net Happiness below 0). Every new settlement starts as a
  town; site roles say which should become cities.
- **11 of 9:** at E23 the cap rose from 8 to 9, and the three settlers waiting at the cap founded in the
  same pass (three SETTLE_FOUND at 14:27:07): each read the game's settlement count, which does not
  change until the game handles a founding. −5 Happiness in every settlement for each one over:
  Happiness fell from 151 to 76 a turn. Фустат, one of the three (pop 4), was taken by the Normans at
  E35 after 808 gold of defence. Changed (root gotcha 56): `pendingFoundings`.
- **Six settlers for two places:** Carthage's `MOD_CIV_DOUBLE_COLONISTS` gives two settlers for one
  trained or bought. Two were wanted at Antiquity T67 (one trained, one bought): four came, and the
  new age's card added two. Changed: `settlerCopies` / `settlerSupply`.
- **Not changed:** under a city limit the strategy's CONVERT goal has no candidate (Antiquity had no
  savings goal; the gold went to town buildings). Harmless.

## 5. War
- Franklin (Normans) declared war at E27 and made peace at E37; Taino raiders hit Фустат at E23 and E33;
  the Normans took Фустат at E35. Chicago came to us by revolt at Antiquity T68. In Exploration we lost
  4 units and killed 8.
