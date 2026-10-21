# Game 43 evidence (won: Modern economic victory at M32)

Xerxes King of Kings with Egypt → Abbasids → Mughals, the economic focus all game. The second game with research/40 (root CLAUDE.md gotcha 73), in game 42's process, 17:57-18:41 (GameCore.log). `evidence.zip`: as game 42's (UI.log only our `[XPL]` lines and JS errors); `session-*.csv` hold both games.

## The end
- GameCore.log 18:41:07: `Team 0 has won 1 place in a 'VICTORY_ECONOMIC_MODERN' victory!` The last gold line M31: 3,052 gold, +1,669 a turn.
- Settlements (Player_Stats.csv): 3 + 2 of a cap of 5 at A70, 10 + 3 of 14 at E70, 10 + 7 of 17 at M30; none lost.
- Strong economy: Exploration E60 food 598, production 559, science 233, gold 571 a turn.

## War
- Ada Lovelace and Friedrich declared formal wars at A44 (DiplomacySummary.csv); peace with Ada at A52 (PEACE_PROPOSED); Friedrich refused a white peace every time (`peace: … would refuse`). Raids on Бехдет, Мен-Нефер and Васет through Antiquity (centres down to 0.84-0.85, Königsberg's to 0.45); 4 units lost; no settlement lost. A Prussian town, Кенигсберг, was ours from about A63 (how is not in the logs).
- No `JS Error` from our files, no held turn, no `ERROR` lines.

## research/40 in this game
- **Structural research** (A1): 16 picks (Code of Laws A16, Irrigation, Light of Amun-Ra, Mawla, Colonialism, Imperialism, Education, Sovereignty, Society, Social Class, Zabt, Paradise Gardens, Political Theory).
- **Religion**: pantheon «Бог солнца» (A15); beliefs Церковность, Накорми мир, Святилище, Хесед; Ius Reformandi offered at E63 at −51.6, never slotted. **Missionary loop:** one Missionary logged `MISSION_MOVE ["Миссионер","Нехеб"]` 24 times (E55-E69), moving 73,20 ↔ 74,20: Нехеб's urban half had gone back to Buddhism, its rural half stayed Zoroastrian, the game refused SPREAD there, and `spreadReligion` walks to another fitting tile without remembering the refusal.
- **Great people** (B4): all 7 Abbasid Alims activated (9 ACTIVATE_GREAT_PERSON, Al-Jazari twice); probe P-GP-1 answered (`getActivationPlots` lists the tiles; «must stand on a tile with the required constructible» and «on an unowned tile» were each resolved in 2-4 turns by walking).
- **Merchants** (A5): 26 queued, 29 routes, none idle.
- **Factory Town** (A6): Сирджан and Забид at M1.
- **Endeavors**: 36 sent, 33 started (Cultural Exchange, Free Markets); three cancelled the same turn (the leader declined).
- **Levies**: 3, the API works.
- **Unique improvements** (B5): Stepwell, Kasbah, Hillfort (a city-state's), Shore Battery (a city-state's): 26 orders, about 6 completed; NOTIFICATION_PRODUCTION_INVALIDATED 9 times (Stepwell 7: `SameAdjacentValid="false"`), Васет 67,20 re-ordered five times (M3-M18).
- **Legacy**: every path 0 in every age (as game 42), so «off the focus: WONDER» held all Antiquity (+8 on wonders under the economic focus) and DISTRICT all Exploration. **Two settlers bought in one pass** at E69 in Васет (580 each: the SETTLER goal by `buyGoal`, then `buySettlers` again) toward the Homeland triumph with room for one; neither founded before the age ended.
- Triumphs: AQ_MILITARISTIC_5 (A44), AQ_DIPLOMATIC_1 (A69), AQ_ECONOMIC_5 (A70), EX_CULTURAL_2, EX_DIPLOMATIC_1, EX_SCIENTIFIC_3, MO_ECONOMIC_2.

## Fixed after the game
- With game 42's fixes (research/game42; root CLAUDE.md gotcha 74): the Missionary refusal memory, unique improvements' no-neighbour rule and cancelled tiles, one settler a pass and none for the Homeland triumph in Exploration's last 5 turns, the focus from the victories' points.
