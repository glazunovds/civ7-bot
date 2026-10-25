# Games 55 and 56: two culture wins; the generals level up; ships and a late war

One session, 20:17-22:40 on 22 October, the first with the build after game 54 (root gotcha 83: the vanguard's packed army,
Overrun, raider hunts, focused attacks first). Both games kept one civilization through all three ages and both had the
culture focus. `evidence.zip`: UI.log (our lines and JS errors) and net_message_debug.log for both games; GameCore.log and
the CSV logs (Player_Stats, CityBuildQueue, Player_Legacies, DiplomacySummary, CombatLog, Player_Treasury,
AI_Commander_Promotions, AI_Operation_Eval) for game 56 only (the game starts them afresh with a new game).

- **Game 55, Rome** (Legati): culture victory at about M30 (21:27). No major declared war; independents raided every age.
- **Game 56, Mexico:** culture victory at M24 (22:40). Independents' raids and ships in Antiquity; a quiet Exploration; at
  M18 Trung Trac (formal) and Franklin (surprise) declared war, with two city-states (Suzerain War).
- **No settlement lost, no general lost, no turn held, no error of ours.** The 1,524 JS error lines are the game's own
  `unit-flags.js:348` (a rival unit gone from sight; game 54 had 648).

## What the build did
- **The generals level up** (games 48-54 ended at XP 0 or short of the first level, which the age change takes away):
  - Game 55: both Legati to level 2 in Antiquity; a commander to level 3 in Exploration (XP 10/30), one promotion.
  - Game 56: in Antiquity the vanguard took Mobility and Initiative (level 2), a second general two promotions; Exploration
    had no fight at all and gave no XP.
  - XP came at 1-4 a fight within a general's radius, mostly against independents, also past level 2
    (EXPERIENCE_MAX_BARB_LEVEL 2 did not stop it), and from a district's defence with a commander on its centre.
- **Raider hunts** (game 55): Самарканд A (STALL after 4 turns, no kill), Онондага E6-E9 (DONE, 2 kills, none lost),
  Вильнюс E16-E17 (DONE, 1 kill). Game 56 started none: no free general within 3 turns, or no free melee soldier.
- **The vanguard's packed army** packed 2-3 soldiers in each Antiquity, carried them, unpacked them for the Самарканд hunt
  and twice for Медиолан. Overrun was never offered.
- **Promotions survive an age change** (gotcha 82's open probe): the roles that came from them held into the next age;
  only the game's `getTotalPromotionsEarned` counter starts at 0 again.

## What went wrong
1. **Rome had no vanguard from A34.** The card research took Cursus honorum (NODE_CIVIC_AQ_ROME_CIVIS_ROMANUS, 13.1 a turn
   over a free slot), whose modifier `CURSUS_HONORUM_MOD_COMMANDER_PROMOTION` gives every Army Commander Bulwark
   (DISCIPLINE_ARMY_BASTION) for free. `roleFromPromotions` read every general as BASTION: no packed army in Exploration or
   Modern, no raids watched, and the next promotion was Steadfast instead of Mobility.
2. **Ships did most of the damage, and nothing answered them in time.**
   - Катана (game 55, E18-E24): one independent Cog shelled it from 100 to 0. No land unit on sale fought it ("a warship or
     walls must"), we had no warship, Cogs were queued at E19 and the first sailed at E22 (5 turns); a Catapult trained 5
     turns away in Рим shot it at E28-E29. About 1,000 gold sat in a town conversion goal.
   - All three generals were posted to Катана, the only fight, and shuffled under the Cog's fire (12 escapes, "hit" at
     69,48).
   - Монтеррей to 49% and Толука to 72% (game 56, A31-A70): galleys and quadriremes.
3. **The last war was bigger than the fronts' guards.** AI_Operation_Eval shows Trung Trac (p3) and Franklin (p5) weighing
   attacks on our cities from late Exploration (T60) and from M13/M16; we logged the war risk from then. The fronts kept one
   guard each: only 0-1 of their soldiers were ever in sight. At M19 5-6 land units (Landships, Cuirassiers) and 4 ships came
   at Керетаро, its centre 80 → 33% in three turns; 246-520 gold against a 540 defender (town purchases took about 1,700
   during the risk). The culture countdown ended it at M24.

## Built after these games (root gotcha 84)
- Free promotions decide no role; a ships-only fight takes one general; a warship bought for a shelled settlement on its
  water; a front's army is the most seen near it within 10 turns, and the free gold keeps a defender's price per front while a
  war risk lasts; packed soldiers upgrade with their army (UNITCOMMAND_UPGRADE_ARMY), where their army stands.
- Not built: a front sized by the rival's whole army. The game lets the UI read every unit of a rival (the war probe's
  `land soldiers 11 (1 seen)`), but PLAN.md §14 keeps hidden information behind an opt-in toggle, off by default.
