# Game 44 evidence (the game crashed at Exploration turn 21, 20:50:17)

The first game with games 42-43's fixes (one process from 20:14; the age change to Exploration at 20:43, Norman). `evidence.zip`:
UI.log (only our `[XPL]` lines and JS errors), net_message_debug.log, Telemetry.log, GameCore.log, Player_Stats.csv,
CityBuildQueue.csv, the game's minidump (`crash.dmp`) and its reading (`crash-dump-reading.txt`, from scratchpad crash1/mdmp.py).

## The crash
- Telemetry.log 20:50:17: `PublishAppSessionStatusTelemetry: AppCrash`. The minidump (written 20:50:18 to
  `Base\Binaries\Win64\Civ7_Win64_DX12_FinalRelease.exe.dmp`): exception 0xC0000005 reading address 0x60 at
  `Civ7_Win64_DX12_FinalRelease.exe+0xdd0bba`; on the crashing thread's stack right above it, v8.dll and cohtml.WindowsDesktop.dll
  frames: a native function called from UI script read a null definition.
- 20:50:15: our first Missionary of the game finished in Цзиньян (Telemetry `OnCityProductionCompleted … cityId:393221 player:0`;
  the queue probe showed `UNIT_MISSIONARY 96%*` the turn before). 20:50:17: our pass ordered the units (net_message: a MOVE_TO and
  a FORTIFY sent, the second with no RECV) and reached the Missionary: `spreadReligion` (added after games 42-43) called
  `unit.getActivationPlots("UNITOPERATION_SPREAD_RELIGION", false)`. The function takes a unit command; the game's unit panel asks
  it only for commands and only after `shouldShowActivationPlots` (unit-actions.js). Games 42-43's Missionaries, without that
  call, ran all game.
- Ruled out: closing the Cinematic pop-up at 20:50:15 (42 times in games 42-43 without a crash), the notification command sent
  then (276 times this session), the MOVE_TO (the same order on the two turns before).

## Fixed (root CLAUDE.md gotcha 75)
- `spreadReligion` no longer calls `getActivationPlots`; `useGreatPerson` asks `shouldShowActivationPlots` first, as the panel does.
- The fake engine records a `getActivationPlots` call with anything but a unit command in `world.crashes` and throws; the
  Missionary tests check it (proven: with the call back, both fail).

## After the crash: WON the culture victory at Modern T34 (22:15)
The game was reloaded at E20 (21:45, the crash fix live) and played by the autopilot to the end: Norman in Exploration, America
in Modern, the culture focus all game. `evidence-e20-m34.zip`: UI.log (our lines and JS errors), net_message_debug.log,
GameCore.log, Player_Stats.csv, CityBuildQueue.csv, Player_Legacies.csv, DiplomacySummary.csv, CombatLog.csv,
Player_Treasury.csv. GameCore.log: `Team 0 has won 1 place in a 'VICTORY_CULTURE_MODERN' victory!`.
- **Race:** culture 349 of 312 at the end, the best rival 156 (our countdown from M30); economy behind (Isabella 2,637 against our
  1,703, RIVAL_STEP_DANGER at M30); 15 settlements of a cap of 19.
- **Wonders built (10):** Erdene Zuu, Borobudur, Brihadeeswarar Temple, the White Tower (our own), Dogo Onsen, Red Fort,
  Hermitage, Muzibu Azaala Mpanga, Statue of Liberty, Battersea Power Station.
- **Clean:** no JS error from our files (145 in the game's unit-flags.js, 8 in component-support.js), no crash, no turn held.
  The age change worked: AGE_OVER at E70, AGE_START, AUTO_RESUMED at M1.
- **Games 42-43's fixes seen:** the tile rule refused Notre Dame on 62,48 where our University was queued (`could not order …:
  62,48: BUILDING_UNIVERSITY is queued there`, 4 times; its only tile there); 8 Missionary refusals remembered; one settler a pass.
- **Card research** (root gotcha 76, live from 22:10): at M34 `NODE_CIVIC_MO_BRANCH_DEMOCRACY for its cards (2 turn(s)):
  TRADITION_SUFFRAGE 308.4 over TRADITION_CIVIL_ENGINEERING 13.2, TRADITION_FIRESIDE_CHATS 165.4 over TRADITION_YEOMANRY 16.6;
  +444 a turn`, the turn before the win.
- **Fixed:** Oxford University, a lost race with nothing in it, left Синъян's queue by our own WONDER_DROPPED at M6, and the
  order watch then wrote `WONDER_OXFORD_UNIVERSITY left Синъян's queue unbuilt` for it: `removeFromQueue` now forgets our order of
  a wonder it takes out (tests/autopilot-wonders.test.mjs, failing before the fix).
- **Seen, not changed:**
  - The White Tower's first order (E52 at 63,47) left the queue at once (NOTIFICATION_PRODUCTION_INVALIDATED, «0 returned»;
    the tile still accepted it); ordered again 17 s later it was built E54-E59 (a Sokeman went ahead of it E56-E57).
  - Цзиньян's Fishing Boat repair (cost 3) stood at 100% from E33 while queued; in production it took 50 and 63 production with
    the overflow capped at about 40: with Saw Pit's repair, about 65 production lost to the cap. Repairs are queued, not bought,
    in a city whose queue holds a wonder (root gotcha 55: Erdene Zuu was there).
