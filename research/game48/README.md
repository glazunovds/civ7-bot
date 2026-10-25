# Game 48: lost to Harriet Tubman's culture countdown (Modern, about M57)

Trung Trac with Meiji Japan in all three ages; the culture focus all game; 16:46-17:43 in one game process, the first game with
research/41 Phases 0-1 (root gotcha 78). «Наступление» was on. `evidence.zip`: UI.log (our lines and JS errors),
net_message_debug.log, GameCore.log, Player_Stats.csv, CityBuildQueue.csv, Player_Legacies.csv, DiplomacySummary.csv,
CombatLog.csv, Player_Treasury.csv.

## The game
- **Lost:** Tubman's culture countdown started about M52 (289 against a goal of 276) and her economic one at M56; ours, the
  military, stood at 83 against a goal of 71 at M56 (×1.25), a turn too late.
- **Clean:** no JS error from our files (310 in the game's unit flags, 10 in its scrollables), no crash.
- **Wars:** Amina (formal) and Tubman (surprise) at A54, peace A62; Tubman (formal) and Amina (surprise) at E26-E27, peace
  E34-E35.

## Seen
1. **A slow start:** one settlement until A21 (cap 5 from A20).
   - The first settler was ordered at A5. It walked toward 9,31, made no progress at 12,31, was sent to 19,31, then 17,46
     (15 tiles south), retreated home from raiders A14-A17, and founded at 20,32 at A21. The second gave up its site at A22.
   - Settlements came at A21, A26 and A30. The site search rejected 74-134 tiles as INDEPENDENT (within 6 of a village,
     root gotcha 27) while 23 villages were still unseen.
2. **Киото lost at A59** (a town 8 tiles from the capital, Amina's).
   - A45-A53: a war front against Amina's war risk with its one guard (FRONT_GUARDS 1), while the gold plan held 565 gold
     to convert Киото itself into a city (+240 "for two defenders" that were never bought).
   - A54: the war. 5, then 7 Spearmen; the centre went 62 → 30 → 0 by A56. Киото could buy nothing (UI.log `the game sells
     no land soldier here`; walls `NO_SUITABLE_LOCATION`), and help came from 4-5 turns away.
   - Neither commander moved to it: the regular one kept its post until A60, Trung Nhi stayed at Токио (one raider there).
   - «Наступление» found no force to retake it (`not enough force (melee 0 of 2; 0 free within 8 turns)`, then `a
     settlement of ours needs its soldiers`), and the peace at A62 was a white one.
3. **The plague** (A63-A67 and E55-E67): 60 moves off infected tiles (LEFT_HAZARD), each to the nearest safe tile within 3;
   our land units went 23 → 18 over E61-E67 with one combat loss in Exploration (CombatLog records no plague damage, and
   Player_Stats' land units count civilians, so the plague deaths are not proven). We never had a Physician (the crisis's
   unit that treats an infected settlement), and both crisis cards on offer (Humoralism, Plague Cults) pay only through
   Physicians.
4. **Modern's military countdown came too late.**
   - The cap had room for 2-5 more settlements all Modern (11 of 16 at M1, 16 of 18 at M30-M40, 18 of 20 at M50).
   - The lever started at about M36 (×1.5: 73 against our 60); our points rose 60 → 83, but the best other's rose 49 → 57
     and with it our goal (73 → 85).
   - Settlers walked to far sites (78,33 for 15 turns; 71,45; 70,39), and from about M39 to M49 a settler stood at the capital
     with no site: "settle anywhere" looks only within 8 tiles of the settler (`ANYWHERE_RADIUS`), and around the capital
     every tile was owned.
5. **Commanders stayed put** in Modern (no raiders came; the `xp:` lines show no move after M1).

## The probes (research/41 Phase 0)
- **XP** (the whole parameter line now): a ranged fight 1, a melee fight 2, attacking +1, a kill +2, a city captured 10,
  **dispersing an independent 25**, at most 10 a fight; `EXPERIENCE_MAX_LEVEL` 6, `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER`
  5, `EXPERIENCE_BARB_SOFT_CAP` 1, `EXPERIENCE_MAX_BARB_LEVEL` 2.
- **Levels:** a new commander is level 0 and needs 7 XP; level 1 needs 15 more.
- **Seen:** the regular commander got 5 XP at E29-E30 from a Catapult's shots and its district's defence against a Cog, 1 tile
  away; Trung Nhi reached level 1 from four fights against Tubman's units at its post (Steadfast at E31).
- **The age change:** at M1 both commanders' XP toward the next level was 0 again (5/7 → 0/7), and Trung Nhi read
  `level 1, promotions 0` (it read `promotions 1` before): whether its Steadfast survived is not known.
- `war probe:` lines: 251 (P-WAR-1, P-STAT-1), for research/41 Phase 5.

## Built (21 October; root CLAUDE.md gotcha 79)
All five of the user's "implement all", with research/41 Phase 2:
1. **Settle earlier and closer:** below 3 settlements a walk of 4 turns at most, each turn of walking weighing double; a stuck
   settler founds on a free tile within 2; «settle anywhere» looks 20 tiles out; a settler is trained in the city nearest a
   known site.
2. **War fronts facing an army:** a guard for every 2 of the leader's soldiers near (up to 3), sent, trained and bought while
   it can; a front town is no conversion goal.
3. **Peace asks our settlement back** first (the peace screen's own offer of their cities that were ours); refused, a white
   peace.
4. **The plague:** tiles next to it count as farther; off a centre only an enemy next to a soldier holds it there; UI.log
   `plague:` names who stayed and why. Not built: Physicians (the crisis's unit).
5. **Two generals:** a vanguard and a bastion with their own promotions, posts at the worst fight (shared when none is free;
   game 48's one-raider posts are left for 3+ more raiders), the vanguard waiting where raids came, the escape first, units in
   a general's radius striking first, a second commander bought or trained, the generals' effects valued.

The next game shows it in UI.log's `generals:`, `plague:`, `peace:` and `defence: … war front (…, N of their soldiers near)`
lines (TESTING rows 448-455).
