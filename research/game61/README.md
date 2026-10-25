# Game 61: Xerxes, the economic victory, a general lost to archers and a missed cheap conversion

25 October, 16:50-18:00, the first game with the game-60 build (root gotchas 86-90). Xerxes (alt), a random civilization each
age: Persia, the Abbasids, the Mughals. Online speed (ages of 70 turns). **Won the economic victory at M46** (17:58). The
logs are kept by the log archive: `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\LogArchive\2026-10-25_16-50.zip`
(tools/archive-logs.ps1, every 15 minutes). The user: "we lost ability to automatically buy town to city upgrade for cheap
before we selected card that cities will stay after age change … we lose 1 commander early due to archers."

## The cheap conversion
- **E1:** the window ran before the dedications and found `none within 71 gold above the reserve (Спахан 550)`. Antiquity's
  last turn (A70) had spent 156 on two Granaries (AGE_END_BOUGHT 48, a plan purchase 108), with no goal holding gold: Спахан
  had waited in unrest (KEEP, then WAIT) since A64, so no conversion goal was made. Once the card brought the cities back,
  Спахан cost 1,500 (the goal from E1).
- **M1:** the window logged nothing, by design: the economic focus converts up to `AGE_START_CITY_TARGET` 8 entering Modern,
  8 cities came back with the card, and the three towns (Багдад, Мосул, Ардебиль) were KEEP. 1,347 gold stood by.
- **Built** (root gotcha 66): a non-final age's last 2 turns keep the cheapest town's price × 1.15 for the window when no
  conversion is made now (WINDOW_BANK, a BANK goal held whole), and the window spends all the gold, the reserve too.

## The general lost to archers (E9-E12)
- The second general (Army Commander 131073, level 2) led a village hunt on Нассау (53,24; reason OTHERS). Gathering, it was
  sent on a three-turn walk to 54,23, next to a Heavy Archer that stood on the staging tile (54,22), its soldiers 2-5 tiles
  behind and its army empty. Two Heavy Archers shot it at the end of E11 (100 → 69 → 31) and E12 (→ 5 → dead).
- The gathering placement had no safety check (`campaignSpot(…, () => true)`), the turn-stop check ran only in the fight, and a
  general already walking was never judged again.
- On E12 the escape said `19 safer, none reached this turn`, while the game's AI_MovementPlanning listed 3 tiles it reached
  (55,23, 55,24, 54,24). Why ours refused them is not known: the line now counts the reasons.
- **Built** (root gotcha 88): gathering only on a tile `commanderSafeAt` allows (else as close as is safe), the turn-stop check
  while gathering too, a walking general's unsafe walk cancelled (COMMANDER_WALK_STOPPED), the escape's refusal counts.

## Also seen
- Our scout's flights at A7-A9 were from independents' Warriors 1-2 tiles off (`flee: UNIT_SCOUT … from [UNIT_WARRIOR of
  independent 13 at 1 (land, seen)]`), not from the enemy scouts the `units:` line lists (gotcha 87's flee log at work).
- The rest of the game was not reviewed, to save usage.
