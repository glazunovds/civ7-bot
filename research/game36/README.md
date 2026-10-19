# Game 36 evidence (lost at Modern T33: Machiavelli's economic countdown)

Great Britain, science focus, Antiquity. The player reported two things at T49: the turn was stuck («Отдать приказы юнитам»), and the Colossus was probably lost to defenders trained ahead of it. `evidence.zip`: UI.log, CityBuildQueue.csv, CombatLog.csv, net_message_debug.log, CityPurchase.csv, Player_Stats.csv, Player_Treasury.csv, Player_Legacies.csv, DiplomacySummary.csv, GameCore.log, Modding.log, Game_PlayerScores.csv, at the game's end (Modern T33).

## The held turn (T49)
- UI.log 18:57:25: `COORDINATED_ATTACK ["Командир армии","Воин",22,15,3]`, a commander's Coordinated Attack on a raider at 22,15 with three Warriors.
- CombatLog.csv T49: two of our Warriors fought it (40 damage, then 61, `Destroyed: Defender`). The third Warrior, on Манчестер's centre at 21,15, never attacked.
- The strike step had listed all three as ordered, and the hud kept every ordered unit from the skip step. That Warrior was idle with 2 moves, and the game offered it no fortify or alert on the centre. It got no order (`none[can: EXECUTE_SCRIPT,MOVE_TO,SKIP_TURN,SLEEP,WAIT_FOR,…]`) and was never skipped, so the turn ended in `BLOCKED ["NOTIFICATION_COMMAND_UNITS"]`, `the game waits for UNIT_WARRIOR at 21,15`.
- The end-of-turn retry's `releaseStuckOrders` frees only move orders (`orderedAt`), not strikes, so the retry left it held too.
- **Fixed:** the strike step's units are no longer kept from the skip; each attack was waited for already (its `Combat` event).

## The Colossus (T21-T30)
- Лондон was our only city (about 16 production a turn) and started the Colossus at T21. Spain started it at T26 at 22 a turn after a 38 first turn.
- Манчестер, a town 4-5 tiles away, was threatened by an independent's Warriors from T19 (2-6 raiders). Its centre was never hit (100/100, then 200/200 with the walls bought at T26), and 1-3 of our Warriors stood on guard every turn.
- `trainDefenders` queued Warriors for it in Лондон, and `frontLoadUnits` put each at slot 0, ahead of the wonder, because a defender's training city skipped every other rule. They were built at T23, T25 and T28 (`queue: Лондон: UNIT_WARRIOR moved ahead of WONDER_COLOSSUS with 36 / 54 / 90 production in it`). A Slinger came at T20, before the wonder started, and Манчестер also bought 3 Warriors for 60 each (T23, T27, T29).
- At T29 the race read 4 turns for us against 4 for Spain, a tie, so the wonder was cashed out (WONDER_CASHED_OUT). Its 127 production went into the Lighthouse (143.6 added at T31, of a 99 cost).
- Without the three Warriors the wonder would have stood at about 175 at T29, done at T30-T31.
- **Fixed:** a defender for settlements that hold on their own (centre unhit, a melee guard there, no war at our door) goes where other units go past a wonder or a project in production. In Build-up that is behind it; in Growth, behind a raced one. With the centre hit or no guard, it still goes first, and so does a defender ahead of a building with progress.

## Guards behind walls (fixed after T49, at the player's request)
- Манчестер ended Antiquity's T49 with 5 Warriors and 2 Slingers against 2 raiders: `guardsWanted` asked for a melee guard per land raider and `rangedWanted` for a ranged one behind them.
- Its centre had walls from T26 (200/200), and raider Warriors hit it for 8 a blow (CombatLog T48), so most of those units were never needed.
- **Fixed:** walls that hold (standing, the centre unhit, only independents around) want the one melee guard on the centre (one more against a stronger raider) and no ranged one behind it.

## Exploration's first turn (the player's question: no conversion before the card, with gold enough?)
- UI.log 19:17:42 and 19:17:53: `conversion window: none within 381 / 456 gold above the reserve (Портсмут 900)`, with 513 gold in the treasury.
- Портсмут was the only town that had not been a city in Antiquity. The towns that had been (Брэдфорд at 225, Манчестер, Лидс) were left out on purpose: the card «All your Cities from the previous Age remain Cities» brings them back for free when the dedications are confirmed, and a city bought first makes every other town dearer.
- net_message_debug.log 19:18:08: the player converted Брэдфорд (city 131073 in Exploration) by hand for 225 before the dedications (513 − 225 − 13 of that turn's income = 275 at T2); the card confirmed at 19:18:39 would have brought it back.
- City ids are reassigned at an age change: 131073 was Манчестер in Antiquity (TOWN_CONVERTED at T46) and Брэдфорд in Exploration (QUEUED_SETTLER at 19:18:45); 196610 the other way round. A first reading took this conversion for Манчестер's.
- The window's price: Портсмут 900 at E1 against 1,500 after the dedications (game 35: 712-787 at E1).

## The end (Modern T33)
- **Lost:** GameCore.log 19:48:38, `Team 1 has won … 'VICTORY_ECONOMIC_MODERN'`: Machiavelli (player 1). His economy stood at 3,843 against the ×2 goal of 3,814 when Modern reached 40%; ours was 913. Blocking him needed 2,210 of our own (the watch's `need`): out of reach, so the economic overlay rightly did nothing. He was a DANGER from the ×3 step (M20). The game's victory goal is the multiple × the second place, so nothing short of taking his cities could have stopped it, and research/37 §9 keeps a war of our own out of the plan (the user's decision).
- **Our science:** 60 Innovation at M1 (Exploration ended with science 613 a turn against the rivals' 171 at most), 63 at the end; Rocketry was 10 turns away at M32. Game 35 had Rocketry at M47.
- **The window probe answered:** at M1, before the dedications, `conversion window: Глазго for 1050 on the age's first turn (cities now 1, 5 last age)`; after the card the strategy line read `cities 6, towns 5`. A town converted in the window stays a city (2,500 after the dedications).
- **A far town's defence:** Сток-он-Трент (ships of an independent, no land raider, no city within 12 tiles, `13 free soldier(s) left` that could not reach it) bought a Howitzer for 495 at M28 (its Bombard against ships) and Defensive Fortifications for 852 at M30 once its centre was hit (62/100); the treasury went 1,267 → 0.
- **Armies:** one commander with an empty army all game (`army: … unitCount 0`), as in game 30.
- **Held turns:** only the T49 one (fixed); no `ERROR` step, no JS error from our files.

## Open
- Between E5 and E6 the treasury fell from 109 to −164 (Player_Treasury.csv), with no purchase in CityPurchase.csv and nothing in net_message_debug.log's requests that explains it. The cause is not known yet.
