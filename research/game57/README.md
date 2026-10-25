# Game 57: Mongolia, a peaceful game lost to Tecumseh's two countdowns at Modern's 80% step

One session, 23:35 on 22 October to 01:08 on 23 October, with the build after games 55-56 (root gotcha 84). Genghis Khan
(Mongolia in all three ages), eight players, the culture focus all game, the autopilot on in every age (it switched itself
on again at M1 after the dedications). `evidence.zip`: our UI.log lines (`x.txt`) and its JS errors, net_message_debug.log,
GameCore.log and the CSV logs (Player_Stats, CityBuildQueue, Player_Legacies, DiplomacySummary, CombatLog, Player_Treasury,
AI_Commander_Promotions, AI_Operation_Eval, CityPurchase).

- **Lost at M62:** Tecumseh (Shawnee) won the military and the economic victories the same turn; both countdowns began at
  Modern's 80% step, when the goal fell from 1.5× to 1.25× the second place, and we were that second place in both.
- **No settlement lost, no turn held, no error of ours** (379 JS errors: the game's own `unit-flags.js:348`). No war with a
  major (Friedrich and Tecumseh were war risks from late Exploration).
- **Antiquity's slow start:** the capital alone until A26. A settler needs a city of population 5 (`Units.PrereqPopulation`),
  reached at A12; three villages raided the capital from A16 (7 raiders, 3 of them ships) and the settler waited at home.

## What went wrong
1. **The watch judged a leader in DANGER at the current multiple only** (root gotcha 64: "a leader already near the current
   goal is blocked now"). From M47 Tecumseh's military 92 stood near its goal of 108 (×1.5 our 72): «need 71 (ours 72, 0
   settlements)». At ×1.25 his 101 passed our 90 and his countdown ran. His conquests of Machiavelli's settlements (M45-M54)
   took him from 13 settlements to 18.
2. **The economy was his from Antiquity:** GDP 32 → 356 in Antiquity, 1,257 against our 734 at Exploration's half, 2,082
   against 1,384 at M1, 3,808 against 2,644 at the step (the block wanted 3,046). The GDP purchases (Ports, a Railway Station)
   began at M21.
3. **Settlers boxed in:** 16 settlements from M26 to the end with room for 9 under the cap 25. The site search found 1-4
   sites, all taken, unreachable, refused or far; one settler stood about 20 turns at 64-68,19-22; «settle anywhere» found a
   tile only at M56 (67,5, six turns away). At M45 seven more settlements would have started our own military countdown.
4. **The war-risk reserve** (gotcha 84) held two defenders' prices (~1,100 gold) from M28 to M62 for Friedrich's risk; no
   war came, and each GDP Port (1,300-1,680) waited 4-5 turns more. The game ended with 2,800-3,400 gold in the treasury.
5. **Culture points, not culture:** in Modern our culture a turn was the highest (702 at M60, twice anyone's), our culture
   victory points 141-158 against Tubman's 201-215 (wonders: 7 of ours all game, Machiavelli 13).
6. **No unit was upgraded all game** (no UNITCOMMAND_UPGRADE in net_message_debug.log); the gotcha 84 army upgrade was not
   exercised.

## Built after it (root gotcha 85)
- The block judged at the next step (`victoryWatch`'s `needAt`), unless the leader's countdown runs.
- «Settle anywhere» takes tiles on the settler's own land first and says why it found nothing.
- The war-risk gold kept for one defender, from the free purchases only (not the savings goal's).
