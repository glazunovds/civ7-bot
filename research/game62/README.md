# Game 62: Ada Lovelace on Deity: out-earned, a missed military countdown

25 October, 18:48-, Deity, Online speed (ages of 70 turns). Ada Lovelace with a random civilization each age: Great Britain,
the Normans, Russia. Science focus. Reviewed lean at Modern T70 while the game ran; the logs are kept in
`%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\LogArchive\2026-10-25_18-48.zip`.

## Where it stood at M70
- Score 6th of 8 (780 against Bolivar's 923). Science 41/100 Innovation against a rival's 76; culture 84 against a leader at
  459 of 508 (DANGER); economy 3,395 against 7,235 of 7,933 (DANGER); military first, 64 against a goal of 77.
- No error of ours. 1,620 JS errors, all the game's own (unit-flags.js, unit-flag-manager.js).

## Why
- **Gold:** our gold yield was 50-80 a turn while the Deity AIs made 109-1,036; the income stood below zero from E65 to M15
  and at 3-86 after. Culture was the lowest of the eight all game (207 against 318-1,670 at M70). Science and production were
  middling, settlements comparable (5 cities and 10 towns).
- **Defence took what there was:** E68-E70 Confucius's war at our door bought walls and two Pikemen (1,000 gold) for
  Шеффилд; Modern's war-risk reserve kept 560-735.
- **The conversion window:** with the game-61 build. A68 held a bank for it (561); on A69 a listed conversion out of reach
  (115 against 487) dropped the bank, and E1's window had 153 against 525. M1's had 0 (the war's purchases) against 675.
- **The military countdown:** within reach at Modern's final step (×1.25) from M30 (8 settlements: room 6, 2 past the cap),
  but the lever judged only the next step (×1.5: 11) and started at M42. Eight settlers were trained in all of Modern, none
  bought; settlements went 10 (M40) → 15 (M70), 4 short of the countdown.

## Built (root gotchas 44, 66, 88)
- The window's bank stays unless the whole treasury buys a listed conversion now.
- `gold sources:` with every economy line: each settlement's gold (towns with their Focus), units' upkeep by type, the rest.
- The military lever looks ahead to ×1.25 while we trail every other race (`trailsOtherRaces`).

## Next
- Read the next game's `gold sources:` lines: whether towns' Focus, units' upkeep or buildings' upkeep keep our gold low
  against the AIs, before changing the economy.
