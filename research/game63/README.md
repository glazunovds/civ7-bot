# Game 63: Catherine wins on score; the military countdown one settlement away for 12 turns

25 October, 20:08-21:27. Catherine with a random civilization each age: Russia, the Normans, Prussia; culture focus. **Won
the score victory at M70** (the game's end). Logs: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\LogArchive\
2026-10-25_20-08.zip`. The user: "we barely won by points, but we could win much easier by chasing war victory, we had 2-3
places to place last city".

## The missed military countdown
- From M58 to M70 the `military:` line read `ours 76, best other 64, our goal 80 at ×1.25; 1 settlement(s) to our own
  countdown; room 2-4, … within reach`: one settlement would have started our countdown.
- Two settlers were bought at M52 and M53 (780 and 820 gold) and stood idle: `settler: no order … 0 sites known`, and «settle
  anywhere» rejected every tile within 20 (`CLAIM` 335: the game's own isValidLandClaimLocation, called as its lenses call it).
- The relaxed site search (2,077 tiles scanned) found 3 candidates the game accepts and rejected all 3 for ROOM: squeezed
  between settlements, too little free land. Under a countdown that land does not matter.
- **Built** (root gotcha 44): while the strategy says settleAnywhere, the relaxed search drops the land minimums.

## Otherwise clean
No error of ours (1,677 JS errors, all the game's own), no held turn, one unit of ours lost all game, no general lost, two
wonders lost to rivals in Modern. The age-start window converted Воронеж for 575 at M1 (games 61-62's fix at work).
