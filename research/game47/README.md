# Game 47: WON the culture victory at Modern T19 (03:25)

Ashoka (World Conqueror): Khmer → Hawaii → Nepal, the culture focus all game, 02:46-03:25 in a fresh game process (the first
game with the text strings of games 44-45 loaded: CARD_CIVIC, QUEUE_STUCK_DROPPED). `evidence.zip`: UI.log (our lines and
JS errors), net_message_debug.log, GameCore.log, Player_Stats.csv, CityBuildQueue.csv, Player_Legacies.csv,
DiplomacySummary.csv, CombatLog.csv, Player_Treasury.csv.

## The game
- **Race:** culture 347 against a goal of 285 (our countdown from M15, 5 turns); won at M19, the fastest culture win so far.
- **Ages:** Antiquity A1-A70, Exploration E1-E58 (twelve turns early), Modern M1-M19; both changes stopped at AGE_OVER and
  switched themselves on again after the dedications (AUTO_RESUMED).
- **Clean:** no JS error from our files (254 in the game's unit-flags.js), no crash, no turn held, no settlement lost, no war
  with a major; Цинциннати's centre fell to 29% under independents (E2-E52) and held.
- **Wonders built (21):** Oracle, Great Library, Hanging Gardens, Colosseum, Great Stele, Pyramid of the Sun, Monk's Mound,
  Serpent Mound, Ha'amonga a Maui, Angkor Wat, Hale o Keawe, House of Wisdom, Brihadeeswarar Temple, Shwedagon Pagoda, Wat Xieng
  Thong, Borobudur, Erdene Zuu, Notre-Dame, White Tower, Red Fort, Dogo Onsen. One race lost (Oxford: its 375 went into a
  Military Academy; the game returned 190).
- **Card research** (root gotcha 76): eight civics, each card slotted once researched (Reformation's Religious Orders at about
  E36, Social Class's Bourgeoisie, Social Question's Humanism, Democracy's Fireside Chats 313.7 and Suffrage 262.5).
- **Game 45's fixes** (root gotcha 77): no item stood at 100% all game; the plan's order was held back 7 times as not offered.

## Seen, not changed
- **A wonder's first order dropped at once, the third time** (games 44, 46, 47): Hale o Keawe ordered at E8 behind the item in
  production (a Lo'i Kalo) left the queue at the turn's end with NOTIFICATION_PRODUCTION_INVALIDATED («0 returned»), was ordered
  again on the same tile and built. Each time the wonder was appended behind an item in production in the turn's last pass,
  so the move to the front (`wonderSlot`) would have come only next pass: root gotcha 55's wonders waiting behind other items.
  The game's production chooser only appends too (no insert at the front). One turn lost each time, no production.
- **Future Civic shortens the age:** the culture focus took Future Civic three times at Antiquity's end and five or six times in
  Exploration; the age clock moved about 2-3 extra points each, and Exploration ended at E58.
- **Humanism's value swings:** valued 155.2 when slotted (M~10), 15.6 once slotted (it was swapped out for the Army Corps of
  Engineers, 77.4), and back in at 49.9 for Levies: +3 Culture a specialist, but +1 Food and +1 Happiness upkeep a specialist,
  so its worth follows the specialists and which cities stand below zero Happiness (gotcha 24's `localHappiness`).
