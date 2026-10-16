# Game 23: the score lost by one place, tanks for a war that never came

Khmer → Chola → Meiji (Ashoka, World Renouncer), six majors, the science focus in every age; the culture and domination
victories off. Antiquity 70 turns, Exploration 70, Modern 71; 17:47 to 18:33, with the game 22 code (5a2f164) from the
start. Nobody won outright: the game ended with the score victory, **Napoleon 933, us 923**.

## 1. The score: one place short
- **The rule** (Civilopedia, `victories.xml` `VICTORY_SCORE`): 1000 points a turn in any victory countdown; 1000 minus 10
  times the sum of our places in the victories in play (three here: military, economic, science; everyone had 970 on
  turn 1); 1 a major triumph. Checked on the final scores: the six majors' places add up to 63 = 3 × (1 + … + 6).
- **Ours:** 923 = 1000 − 10 × (1 + 1 + 6) + 3 triumphs. First in science (61 Innovation to 23), first in military (80 to
  74), **last in the economy** (1,430 GDP; Napoleon 3,992, the second about 3,945). Napoleon: 933 = 1000 − 10 × 7 + 3.
- **In Modern** (`PlayerScore.log`): 943 at M1, then 923–933; 933 from M31 to M43 (level with Napoleon), 923 from M44
  (sixth in the economy, from fifth). One economic place would have tied; two would have won.
- **One turn of our own military countdown (+1000) would have won outright** (`military:` lines):

  | Turn | Ours | Best other | Our goal (next step's multiple) | Settlements short | Room under the cap |
  |---|---|---|---|---|---|
  | M41 | 67 | 65 | 81 (×1.25) | 4 | 2 |
  | M47–M48 | 71 | 65 | 81 | 3 | 1–2 |
  | M50 | 76 | 65 | 81 | 2 | 1 |
  | M53 | 76 | 69 | 86 | 3 | 1 |
  | M54–M67 | 76 | 74 | 92 | 4 | 1 |
  | M68 | 80 | 74 | 92 | 3 | 0 |

  The military lever (gotcha 44) only counts the room under the cap, so it never fired. Sites existed: the relaxed
  search found 3–8 picks at M21, M31, M41, M56 and M66 (the strict one 1–2: the map was full).
- **The autopilot does not know the score.** It can: `player.Victories.getPointsForVictoryType(VICTORY_SCORE)` for each
  major (the victory screen's score tab, `victories-screen-model.js` `calcScoreDetails`), and each race's board for our
  places.

## 2. The tanks (the user's question)
- **What fired:** from M50 the war check (`assessWar`) counted Tecumseh as a war risk, then Napoleon (M51), Xerxes (M60:
  his tech theft at M45, a hostile act within 20 turns) and Amina (M66): Unfriendly or Hostile majors whose settlements
  are within 10 tiles of ours. With a risk:
  - **The strong melee unit** (`QUEUED_MELEE`, M50): one melee unit as strong as the best we can train, so every centre
    defends at its strength − 10 (gotcha 28). Skipped in a peaceful final push, but a risk is not peaceful (game 16's
    rule): a Tank in У Каев.
  - **Guards** (`QUEUED_GUARD`, M51–M68): a melee unit for every settlement within 12 tiles of a risky leader's
    settlement, plus the nearest one to each, two at a time (`guardedSettlements`, `GUARDS_AT_ONCE`). On this crowded
    map that was 14, then 17, then 18 of our 18 settlements, so two Tanks were always in production somewhere.
- **The cost:** six Tanks finished (1,380 production; a seventh at 86 of 230), unit upkeep 78 → 168 gold a turn (income
  165 → 76). У Каев trained two of them (M54–M61) before its Launch Pad, which ended 40 short.
- **Nobody came:** no major declared war on us all game. The AI's own logs (`AI_Operation_Eval.csv`) show no attack
  evaluated against us in Modern until M70 (Amina); Tecumseh and Napoleon evaluated attacks on Amina and Trung Trac.
- Game 22 had the same pattern on a smaller scale: research went to Armor for a tank with only a war risk in the final
  push (research/29 §7).

## 3. The final age's last 20 turns: production for a victory out of reach
- **Innovation:** 38 at M1, still 38 at M50 (the masteries wait until Rocketry's way is done), Rocketry at M52 (+5),
  61 at the end. 100 needed Launch Pads (800–1,050 production each) and Crewed Space Flight Preparation runs (2,000 each):
  out of reach from about M40.
- **Unfinished at the end** (`CityBuildQueue.csv`, M71): 3,212 production.

  | City | Item | In it | Queued by |
  |---|---|---|---|
  | У Каев (KHMER11) | Launch Pad | 1,010 of 1,050 | the plan (M61), after two Tanks |
  | Ясодхарапура (capital) | Launch Pad | 481 of 882 | the victory work (M52, started M68 behind an Airfield) |
  | four more cities | Launch Pad | 144–367 each | the plan (QUEUED_PLAN «Космодром», M55–M69) |
  | Талаккад | Laboratory | 485 of 741 | the plan |
  | Киото | Tank | 86 of 230 | guards (M68) |

- **The capital's Airfield** (903, M59–M67) came from the victory work: `SITE_MAX_TURNS` 10 is checked, not whether its
  projects (Trans-Oceanic Flight, Break the Sound Barrier: 1,000 each) can finish before the game ends. Neither could.
- **The rules:** the final age has a deadline for wonders and settlers (gotcha 39) and for the path's buildings
  (`leverSoon`), not for the plan's buildings, science sites or units. Gotcha 58's age-end rule is for non-final ages.
- **Gold:** 2,500 for Кагосима's conversion at M48 (23 turns left; it then built 46 of an Ironworks). The same gold
  would have bought about three settlers (at about 4 gold per production): what the military countdown needed at
  M48–M50, if they founded before the best other's rise at M52–M53.
- **The last settler** was trained M52–M55 and founded only at M67: the one strict site was 7 turns away, with a detour
  around danger; the relaxed picks were nearer.

## 4. The age-end rule's first game (game 22's fix, gotcha 58)
- **Exploration's end:** 9 AGE_END_QUEUED and 9 AGE_END_FIRST (E58–E69). 540 production in unfinished items (game 22:
  732), most of it in items that could not have finished anyway.
  - У Каев built a Gristmill, a Sawmill, a Stonecutter and a Fishing Quay (about 290 production) instead of putting
    it into a University it could not finish (137 of 408 at the end).
  - Танджавур: its Bazaar went first at E58 (11 turns at 15 a turn), but its cost rose 165 → 175 → 180 with the age's
    progress, so at E60 it gave way to a Sawmill, and it ended 83 short.
  - **The capital's Bazaar ended 19 short** (175.8 of 195). The rest would have cost about 77 gold (4 gold per
    production, as the M50–M51 Port purchases show), with 822 in the treasury. No rule buys it.
- **Antiquity's end:** 85 production lost (the Lighthouse started 2 turns before the end, 34.5 of 117; the last turn's
  fallback project).

## 5. Memory across ages (game 22's fix, gotcha 57): verified
- UI.log `victory focus: SCIENCE remembered from the last age` at E1 and M1, and the first turn's estimate said
  ~70 turns left in both (not 118): TESTING row 293 passes.
- The settings' memory key was `1716931462|636955296` (the configured game seed, our leader's hash) through all three
  ages. GameCore.log's `Random Seeds: Game` line changed at the first age change (−2132867235 → −1874066310), but it is
  another number; `Configuration.getGame().gameSeed` stays.

## 6. Other observations (no change)
- **Wonders:** 10 built, none lost; three cash-outs (the Emile Bell 15 → Baths, Erdene Zuu 3 → University, the Red
  Fort 173 → Laboratory).
- **War:** only the city-states' surprise wars at each age's start; no major at war with us.
- **Turns:** none held (the only gaps were the two age changes); no JS error of ours. `unit-flags.js:348` (254 times)
  and Detailed Map Tacks' HTML parser errors are not ours.
- **Towns left without a Focus** at population 7 (TOWN_KEEPS_GROWING: e.g. no connected city): Индрапура once,
  Харихаралайя three times.
- **Noise:** `walls: none for Ишанапура (town) … NO_SUITABLE_LOCATION` 34 times (once a pass).
- An Aerodrome Commander could not be skipped in the last turns (only PROMOTE allowed); the turns ended anyway.

## 7. Changed (the user: «implement all of them»)
Each change has a test that fails without it (27 cases, scratchpad `prove_g25.py`, run on a copy); TESTING rows 294–299.
1. **The final age's deadline** (root gotcha 58): the final age is timed all through (`ageEndTurns`), in its own words
   in the log (GAME_END_FIRST / GAME_END_QUEUED). Science sites only where the site and its project are done before the
   game ends: placed, bought, held as a goal (Launch Satellite counts after a Launch Pad, Trans-Oceanic Flight after the
   Airfield). Crewed Space Flight Preparation only where a run is done in time.
2. **Guards where the risk is** (root gotcha 28): a risk alone asks for one guard per risky leader, in our settlement
   nearest to it, counting the melee units we have; the 12-tile ring stays for an actual war.
3. **The score in the final age** (root gotchas 39, 44, 31): UI.log `score: …` once a turn; the military lever goes up
   to 2 settlements past the cap while the Happiness a turn pays for them; no town conversion in the final age's last
   25 turns.
4. **Nearly done at an age's end** (root gotcha 58): a building in production at least half done is bought on a
   non-final age's last turn, and on the turn before when it is two or more turns short.

Not changed: the science victory itself (Rocketry came at M52; research/14's budget needs it by about M35), and the
economy's place (no rule buys GDP for the score yet: the score line will show how far the next place is).
