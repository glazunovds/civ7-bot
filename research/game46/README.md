# Game 46: WON the culture victory at Modern T32 (00:38)

José Rizal: Maurya → Majapahit → Siam, the culture focus all game, 23:54-00:38 in the same game process as games 44 and 45 (the
logs were split at 23:54:04 and at the fifth turn drop of the CSVs: scratchpad g42/split2.py). The first game with game 45's
fixes (root gotcha 77), loaded with the new game (the text strings of games 44-45, CARD_CIVIC and QUEUE_STUCK_DROPPED, not:
the process was not restarted). `evidence.zip`: UI.log (our lines and JS errors), net_message_debug.log, GameCore.log,
Player_Stats.csv, CityBuildQueue.csv, Player_Legacies.csv, DiplomacySummary.csv, CombatLog.csv, Player_Treasury.csv.

## The game
- **Race:** culture 427 against a goal of 290 at the end (our countdown from M29); the economy's leader at WATCH; our own military
  countdown was 3 settlements away (MILITARY_LEVER at M26).
- **Ages:** Antiquity A1-A70, Exploration E1-E63 (seven turns early), Modern M1-M32; both changes stopped at AGE_OVER and switched
  themselves on again after the dedications (AUTO_RESUMED).
- **Clean:** no JS error from our files (304 in the game's unit-flags.js), no crash, no turn held, no settlement lost, no war with a
  major.
- **Wonders built (18):** Oracle, Great Library, Sanchi Stupa, Angkor Wat, Grand Bazaar, Wat Xieng Thong, Erdene Zuu, Tomb of
  Askia, Borobudur, Shwedagon Pagoda, Notre-Dame, White Tower, Hermitage, Muzibu Azaala Mpanga, Doi Suthep, Palacio de Bellas
  Artes, Taj Mahal, Dogo Onsen. Five races lost and cashed out, each wonder's production kept by a building (Oxford's 420 by a
  City Park, the Brihadeeswarar Temple's 129 by an Inn); the Colosseum (ordered A62) cashed out as the age's end came nearer.
- **Card research** (root gotcha 76): nine civics, Reformation among them at about E45 (Religious Orders), Modernization (Living
  Standards and Civil Engineering, +170 a turn) and Democracy (+139).

## Game 45's fixes (root gotcha 77)
- **No item stood at 100%** all game (no `stuck since` line, no QUEUE_UNSTUCK, no QUEUE_STUCK_DROPPED); the only items past
  their cost were completed the same turn.
- **Tiles not offered:** the plan's order was held back 8 times (`not queued: <type> at x,y: the game does not offer that tile
  for it now`: two Monuments, a Brickyard, two Bazaars, a Fishing Quay, a City Park, a Grocer), and 59 plan orders went through.

## Seen, not changed
- **A wonder's first order dropped at once:** the Shwedagon Pagoda ordered at E31 on 62,45 left the queue with
  NOTIFICATION_PRODUCTION_INVALIDATED («0 returned»), was ordered again on the same tile the next turn and built; game 44's White
  Tower did the same. One turn lost, no production.
- **Future Civic shortens the age:** the culture focus took Future Civic about four times in each of Antiquity and Exploration
  (+7 culture points each in Exploration, `MOD_EX_FUTURE_CIVIC_CULTURE_VP`), and each brings the age's end nearer; Exploration
  ended at E63.
