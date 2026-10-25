# Game 54: an economic win; the generals walked behind the raids

One game, 17:03-17:52 on 22 October, the first with research/42's build (root gotcha 81). Pachacuti: Assyria, then Hawaii,
then America. Team 0 won the economic victory at about M45 (GameCore.log `VICTORY_ECONOMIC_MODERN`). `evidence.zip`: UI.log
(our lines and JS errors), net_message_debug.log, GameCore.log, and the CSV logs (Player_Stats, CityBuildQueue,
Player_Legacies, DiplomacySummary, CombatLog, Player_Treasury, AI_Commander_Promotions).

## What happened
- **Antiquity:** 2 cities and 2 towns at a cap of 4-5. Tecumseh's surprise war at A40 and Charlemagne's at A47; peace at
  A48 and A55. No settlement lost (Дур-Катлимму's centre fell to 35 of 100 at A44 and held).
- **Exploration:** a hunt of Аванти (E5-E11; OTHERS) dispersed it with no general. Tecumseh's and Charlemagne's wars
  E24-E33 (peace E32-E33); both generals reached level 1 (the bastion 10 of 15 XP, from fights at Дур-Катлимму).
- **Modern:** no war until Isabella declared at M45, the last turn. The generals sat at their posts all age.
- **No errors of ours.** The only JS errors are the game's `unit-flags.js:348` (216 lines; games 51-53 had 984).

## What the new build did
- **Sorties:** 10, and they killed raiders (CombatLog: our Warriors, Spearmen and Magarru destroyed the defender at A43-A55).
- **Focused attacks:** 3 Focus Fire and 1 Coordinated Attack, each with one unit (FOCUS_MIN_UNITS 1); the bastion's first
  promotion came from them at E27.
- **Escort:** once (A46). **Escapes:** 7, **advances:** 13.
- **Packing, air, nuclear, satellite:** never needed (no Modern war; the walks were 2-8 turns with no general beside two
  soldiers).

## What went wrong
1. **The generals walked behind the raids.** Antiquity's war moved between Ниневия, Дур-Катлимму, Ашшур and Имгур-Энлиль
   (4-6 tiles apart). The vanguard was posted to Имгур-Энлиль (2 raiders, 3 turns away) while Ашшур, where it stood, had 4;
   it advanced to 67,15 out of reach, a raider stepped closer, and it escaped back (A41, A45). At A44 both generals were
   posted to Дур-Катлимму: the vanguard had escaped, so its post did not count as taken. The bastion reached Дур-Катлимму at
   A48 and turned back to Ниневия (6 turns), arriving at A54 as the siege ended. The vanguard ended Antiquity at XP 0, the
   bastion at 4 of 7 (lost at the age change).
2. **The hunt went without a general.** The vanguard stood 8 turns from Аванти's staging area (6 allowed), so the hunt
   started with `commander none`; no general got any XP from it.
3. **57 formation stays were "hurt"**: hurt guards stayed at their posts while free soldiers stood near.
4. **Promotions at the age's end (probe):** both level-1 generals read `promotions 0` from E70 on, with no point to spend.

## Built on 22 October (root gotcha 82)
- Posts weigh a fight's raiders against the walk, and a general keeps the fight it stands at; with a war at our door and no
  fight in reach each general waits at a war front facing their army; an escaped general keeps its post; an advance in the
  open stops a tile further out of reach.
- Hunts and training wars take a general within 10 turns and wait for it; none starts without one.
- Hurt soldiers swap out at a fight (`UNITOPERATION_SWAP_UNITS`, or withdraw and be replaced).
- The rest of research/42: the air commander's commands by plane class (Carpet Bomb for bombers: research/42 had sent Ground
  Attack, which only "Attack Air Units" answer), Fighter Sweep, Squadron Commanders' air bases, carriers, Fleet Commanders,
  nuclear strikes on enemy cities behind «Ядерные удары по городам» (off by default), no settlement on a war front without
  two free soldiers, no science focus with a city limit of 1.
- 42 reverts proven (scratchpad `g54_prove.py`).

## How the next game will show it
- `generals:` posts at the fight they stand at; COMMANDER_POST to war fronts during a war; fewer escapes back and forth.
- `hunt: … commander <type> in Nt`, never `none` while a general is on the map.
- FORMATION_SWAP entries and `swaps […]` in `formation:` lines.
- Modern wars: AIR_CARPET_BOMB, SQUADRON_BASE, CARRIER_SAILS, FLEET_COMMANDER_POST, NAVAL_FOCUS_FIRE.
