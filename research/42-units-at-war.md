# Units at war: generals in the fight, armies that move, air, nuclear weapons

Written 22 October 2026 after games 51-53 (evidence: research/game51-53). The user, after game 53 (played on to M161 to watch
the units): "We are not learning nuclear options, not using them to produce and use nuclear weapons. We are not using anti air
planes to defend cities, not launched satellite to see the map. Commanders we barely used. Air commander was not bad, but holds
only 1 plane on the airport. … And where are we at on war plan. Commanders are not packing units, not using attack, not hiding
underneath another war units, not being close to experience."

**Built** on 22 October 2026, the same day (root CLAUDE.md gotcha 81; the user: "nuclear checkbox, implement A-E"): A-E as below, nuclear weapons behind «Ядерное оружие» (off by default) and on enemy armies only (cities were not asked for; the defensive default stands). Where the build differs from §3: packing marches only when the general's way (and a turn to unpack) is no longer than the soldiers' walk, which happens when they are slower than it (probe P-A7 compares the turns), with Force March when the game offers it; sorties strike within 3 tiles, from soldiers off our centres; the air strike's preview holds a strike back only on a full answer (P-AIR-4 is unanswered); F (settling on a front, the focus with one city) is not built. 39 reverts proven (scratchpad `g52_prove.py`).

**The rest built after game 54** (22 October; root CLAUDE.md gotcha 82, research/game54; the user: "check it, and implement fixes and what was not built earlier"): Phase 4's hurt units swap out (`rotateFront`, the game's `UNITOPERATION_SWAP_UNITS`); Phase 6's Fleet Commanders (focused sea attacks, a post on a warship's tile, one trained for a lasting coastal front), Squadron Commanders' air bases (`UNITOPERATION_ESTABLISH_BASE`) and carriers (an air base that sails to cover a coast); the air commander's commands by plane class (Carpet Bomb for bombers: C3 had sent Ground Attack, which the game's text gives to "Attack Air Units" only) and Fighter Sweep; nuclear strikes on enemy cities behind their own checkbox «Ядерные удары по городам» (off by default); F's two items. Game 54's own fixes: generals keep the fight they stand at and wait at war fronts, hunts wait for their general. Still not built: a fleet's assembly, Military Aid, levies for the army, ideologies.

## 1. What the games showed

| | Evidence (game 53 unless noted) |
|---|---|
| Generals far from the fights | 87 of ~610 Modern fights (14%) within 2 tiles of a land commander; the vanguard sat 70 turns at a quiet post (10,20, XP 13/15). Games 51-52: level 0-1 at the end |
| Generals alone where they are hit | The bastion stood alone on Китион's 0-health centre after its holder died: hit 4 times M72-M73 (12 of 100 left), killed M74, Китион fell. Shot three times by a Frigate on the coast at M149-M150. Ships or a Mortar hit a commander 4 more times. `commanderSafeAt` counts any centre of ours as safe |
| Focused attacks almost never | 1 Coordinated Attack all game; 49 refusals `at most 0-1 of ours joining (need 2)`. The game sets no minimum ("all Ranged Units within Command Radius … +2 Combat Strength") |
| No army ever packed | Every army `unitCount 0`. Китион: reinforcements came one at a time, 2-6 turns out, while the centre went 100 → 0 in five turns |
| The free army idle | `15-26 free soldier(s) left` most of Modern's war; each war front kept 1 guard (`melee 1 of 1`). 407 attacks on us, 129 on districts; we struck only raiders already next to a melee unit |
| Operations blocked | Hunts and the campaign to retake Китион stopped by `a settlement of ours needs its soldiers`: a damaged centre anywhere blocks them, guarded or not (`homeUnsafe`) |
| Air: one plane, no fighters | One Airfield, one Dive Bomber (53 strikes) in an Aerodrome that holds 4 (`AIR_ATTACKERS_MAX` 1). No fighter: the raided towns (11 Bomber raids) lay outside the only base's cover, and no Airfield is planned for defence |
| No nuclear weapons | Fission only after the game was decided; our Manhattan Project (first, M92) gave one weapon, never used. Every AI made 2-15 afterwards |
| No satellite for 73 turns | Decided at M70; no Launch Pad until M143 (one city), and `launchSatellite` only uses a pad that stands |
| A bug on every pass | `fieldFight` called before its declaration (fixed 22 October) |

Also seen: XP short of a commander's first level is lost at an age change, XP past it is kept (13/15 kept, 5/7 lost).

## 2. The war plan (research/41) today

| Phase | What | State |
|---|---|---|
| 0 | Probes (XP, wars, combat lines), long log lines | Built (game 48) |
| 1 | Ships' reach, the damaged centre held | Built (game 48) |
| 2 | Two generals: roles, promotions, posts, escape, second commander | Built (games 48-50) |
| Hunts | Villages we will not befriend, for the generals' XP | Built (game 50); never started in 51-53 (force, then the home rule) |
| 3 | The vanguard's packed army, rapid response | **Not built** |
| 4 | Hurt units swap out at a front | **Not built** (replaced by the hunts, decision 1 changed); built after game 54 (gotcha 82) |
| 5 | «Учебная война» | Built (off by default); no target in 51-53 |
| 6 | Air strike preview, Fleet Commanders; Squadron bases, carriers and air commands only after the win | **Not built**; the preview built with research/42, the rest after game 54 (gotcha 82) |

## 3. The plan

Ordered by what the games cost us. Each step ships with its tests proven by revert, a TESTING row and its gotcha.

### A. Generals stand in the fight, under a soldier
1. **Safe means under a soldier.** A commander shares a tile with a military unit (they are different formation classes:
   `FORMATION_CLASS_COMMAND`). `commanderSafeAt` becomes: a tile with a soldier of ours that is healthy (damage below 50) and
   not on a 0-health district, or out of every hostile unit's reach (ships too). A centre counts only through the soldier on
   it. The escape fires on any hit, centre or not, and looks for such a tile first.
2. **At the fight.** The post's tile is the soldier's tile whose radius covers the most soldiers about to fight (today's
   `FIGHT_COVER`), now allowed in the front line because the soldier shields it. The vanguard takes the hottest fight, the
   bastion the next.
3. **Walking with an escort.** A walk through hostile reach goes tile by tile under soldiers, or a free soldier walks with
   it (both ordered to the same tile each turn); with neither, it waits (no lone coast walks: M31, M57, M149).
4. **Focused attacks from one unit.** `FOCUS_MIN_UNITS` 1: Focus Fire whenever a ranged unit in the radius can hit a soldier
   at war with us, Coordinated Attack when one melee unit's preview pays (same `strikeWorthIt`); the commander takes them
   first (they are ordinary strikes plus 2). Melee units in the radius step next to the raider first when that pays.
5. **Commander Attack** (`UNITCOMMAND_COMMANDER_ATTACK`: it hits a unit directly) also on a raider the preview says it
   beats, not only one hurt 50+.

### B. The army moves and strikes
1. **Free soldiers to the fronts.** In a war at our door the soldiers the defence leaves free go to the war fronts in
   proportion to the enemy soldiers near each (today one guard, two at most three), healthy ones first, garrisons and holders
   kept. Китион had one guard while 14 stood free.
2. **Packing (Phase 3) for speed.** When a front or a threatened settlement needs units that walk more than its deadline,
   the nearest general packs the free soldiers next to it (`UNITCOMMAND_ADD_TO_ARMY` one by one, never `PACK_ARMY`, which takes
   garrisons too), travels packed by a way outside enemy zones of control and ships' reach, and unpacks 1-2 tiles from the
   settlement; its members count as coming meanwhile. The first build logs how fast a packed army moves against the walk
   (probe P-A7) before trusting it further.
3. **Sorties.** In a war, a hostile soldier within 3 of our settlements is attacked by free soldiers that reach it this turn
   when the preview pays, the general's radius first, not only by a unit already next to it.
4. **The home rule.** Hunts, campaigns and the training war stop only while a threatened settlement lacks guards that the
   free soldiers cannot fill; a damaged centre that is guarded no longer stops everything. Китион would have had its
   campaign with 15-26 free soldiers.

### C. Air
1. **Fill the bases.** At war, or with enemy aircraft seen or raids remembered, each base trains planes up to its capacity
   (an Aerodrome holds 4): fighters first while raids come, then bombers (a Bomber also carries a nuclear weapon), then ground
   attackers. Today one ground attacker at most. Upkeep is checked against the gold income.
2. **A base where the raids are.** A raided settlement no base covers gets an Airfield in the nearest city that would cover
   it (a production building anyway, gotcha 60); its fighters come from there.
3. **The air commander's own strikes** (`UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_LAND`, `_AIR_BOMB`, `_AIR_TO_AIR`) when two or more
   planes can hit the target, and the air strike preview before a single plane's strike (Phase 6's cheap part).

### D. Nuclear weapons (the user's decision)
1. **Research and build.** Nuclear Fission in a war with a major, or when a rival builds the Manhattan Project, then the
   Manhattan Project (+3 Innovation and +5 Science too, so a science focus wants it anyway).
2. **Arsenal.** `PROJECT_PRODUCE_WMD` (1,000 production, repeatable) up to two in a war at our door, and a Bomber based with
   an air commander.
3. **The strike.** The air commander's `UNITOPERATION_WMD_STRIKE` `{X, Y, Type: WMD_NUCLEAR_DEVICE}` (canStart lists the
   tiles), as the game's strike mode sends it, on the largest enemy army in reach (4+ land units) attacking us, or on an
   enemy city with the decision below. Never where the blast (radius 1, 2 after Operation Ivy) touches our units, tiles or
   settlements or a third party, and never where `willActionStartWarInArea` says it starts a new war. The cost: fallout for
   10 turns on those tiles and −50 relationship.

### E. The satellite
Once the game is decided, a Launch Pad is queued in the best city when none stands, and Launch Satellite after it. In a
Modern war with a pad standing it is launched too (it shows the enemy's armies).

### F. Smaller
- **Founding on a front:** Китион was founded at M42 on Tecumseh's front with one guard. A site within a risky leader's reach
  waits until its front can take a second guard.
- **The focus with one city:** Carthage forbids cities; the science focus needs pads in several cities. The focus should not
  pick science while the city limit is 1.
- **Docs:** gotcha 80's "XP short of a level is lost" becomes "XP short of the first level is lost".

## 4. Decisions for the user
1. **Nuclear weapons:** on by default, or an opt-in checkbox («Ядерное оружие»)? And may we strike cities, or only armies
   attacking us?
2. **Order:** A (generals) and B4 (the home rule) are small and fix the losses; B1-B3 (the army) and C (air) are the large ones;
   D and E come last. Build everything in this order, or a subset first?

## 5. How the next games will show it
- Fights within a general's radius (today 14%), generals' levels per age, commanders off the map.
- Focused attacks a game (today 1), packed moves and their turns against the walk.
- Free soldiers during a war (today 15-26), district hits (today 129 in Modern), settlements lost.
- Enemy air raids against our interceptions; planes per base.
- Weapons made and strikes, and their targets.
