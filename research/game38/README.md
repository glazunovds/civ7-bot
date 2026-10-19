# Game 38 evidence (won: Modern culture victory at T44)

Ibn Battuta: Khmer in Antiquity, Chola in Exploration, Buganda in Modern; the culture focus all game (`victory focus: CULTURE remembered from the last age` at E1 and M1). The first game with research/37 Phase 5 (the air wing) and the game 37 fixes (dispersing, the commander's posts, healing out of reach). `evidence.zip`: UI.log, CityBuildQueue.csv, CityPurchase.csv, CombatLog.csv, DiplomacySummary.csv, GameCore.log, Game_PlayerScores.csv, Modding.log, Player_Legacies.csv, Player_Stats.csv, Player_Treasury.csv, net_message_debug.log, Independents.csv, AI_Operation_Eval.csv.

## The end
- GameCore.log 22:55:21: `Team 0 has won 1 place in a 'VICTORY_CULTURE_MODERN' victory!` The watch's last line: culture ours 418 against the goal 328, CHANCE; our military countdown was within reach too (70 of 87).

## Errors
- No `JS Error` from our files, no failed step, no held turn.
- 200 `unit-flags.js:348` errors (the base game's, as in every game) and 7 `component-support.js` lines from the front end's start-up.

## The war (Exploration E18-E26)
- DiplomacySummary: Hatshepsut (p1) and Napoleon (p2) declared a formal war on us at E18; peace with both at E26, which we proposed (`PEACE_PROPOSED`). City-states 6 and 7 were at war with us in Antiquity and Modern (surprise wars).
- **Гангайконда-Чолапурам** (E19-E26): 5-7 of Hatshepsut's soldiers, Mamluks the strongest; walled (200), the centre down to 123/210 (59%) and never lost. Defenders sent (Swordsmen, Coursers, a Knight, a Heavy Archer), bought (`DEFENDER_BOUGHT` Летучий отряд 340) and trained; the commander posted there at E19 led two Coordinated Attacks (E23, E26).
- **Formations there:** at E26 a Knight onto each of two centres (Гангайконда +95, Джайендранагари +100) whose holders a strike had carried off; a Knight into Джайендранагари's screen (E23, +110), a Crossbowman to a firing post (E25, +60).
- **The commander shuffled:** 14,19 -> 14,20 (+75, E23) -> 15,20 (+40, E24) -> 14,20 (+20, E25) as the soldiers around it moved. Fixed: a commander's formation move now needs `COMMANDER_GAIN` 40 (two more soldiers covered), and none within `COMMANDER_HOLD` 2 turns of its last.

## No settlement lost
- Player_Stats: our settlements never dropped (3+1 at A70, 6+4 at E70, 6+10 at M40).
- Combat (CombatLog, ours): Antiquity 27 attacks, 5 kills, 1 unit lost; Exploration 14 attacks, 5 kills, 2 lost; Modern 8 attacks, 4 kills, 3 lost.

## Бутооло (Modern M7-M25): saving for a defender
- An independent's Line Infantry (3-4 of them) hit the town's centre from 100 (M8) to 55 (M9), 13 (M10) and 0 (M11); a Cuirassier on the centre held it, and those sent from Ясодхарапура arrived; it was never taken.
- **The gold:** `defenders: none for Бутооло: guards 0/3 within 1t …; the cheapest … costs 540; 365 of 365 gold usable` (M7), the same at M8-M9 (361; 640 at M9), while the free gold bought a building each turn (108: Пильная яма at M7, Бутооло's own Harbor at M8 and Fishing Quay at M9) at an income of about +106. A Cuirassier was bought only at M15 (560). Fixed: when the gold usable is short of the cheapest defender a threatened settlement needs by no more than `DEFENDER_SAVE_TURNS` 2 turns of income, the pass budget's goal becomes that defender (`SAVING`, «Копим: защитника (…)»): the free purchases wait.
- **Ships:** an independent's Frigates (p14) later bombarded the town (M21-M25) and killed an Abambowa (M18) and two Field Cannons (M22, M24), sent as anti-ship defenders; one of them stood where the formation had put it, within the ships' range. Research/37 Phase 6 (the navy) answers ships with ships.

## The rest of the war logic
- Commander posts: 8 in the whole game (game 37: 15, most of them walks between three cities); the longest at Гангайконда.
- Air: no aircraft of ours or of a leader at war (no `air:` line; the game ended at M44).
- Dispersing: no village was dispersed or walked to.
- Healing: 41 heals and 18 withdrawals.
