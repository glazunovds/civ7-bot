# civ7-bot

Two UI mods for **Sid Meier's Civilization VII**:

- **Expansion Planner** (`mod/expansion-planner`): a planner panel and an autopilot.
- **Memento Advisor** (`mod/memento-advisor`): the best mementos for your leader and civilization.

Both ship in English and Russian.

## Expansion Planner

Open it with the toolbar button at the top left, or **F8**. Its tabs:

- **Settlements:** sites for future cities and feeder towns.
- **Buildings:** an adjacency layout for one settlement or all of them, placed on the map as Detailed Map Tacks; queue or buy the plan's next buildings in one click.
- **Towns:** whether to convert each town to a city, and which Town Focus to pick.
- **Wonders:** where to build each wonder, what it is worth, and the race against rivals.
- **Empire:** every settlement on one page, plus a food-network map lens.
- **Autopilot:** plays turns for you while you step away (online turn timers). Every part is its own option: research, policies and the choices that hold a turn, production, citizens, purchases, settlers, scouts, defence, generals, diplomacy, and a victory focus that steers toward the closest victory. **F7** («Следующий шаг») runs one pass without ending the turn, for when you play by hand but want the best turn.

The autopilot is off every time a game loads. It writes what it does to the tab's log and to `UI.log` (lines starting with `[XPL]`).

## Memento Advisor

On the memento selection screen it marks the best 1-6 mementos for the chosen leader and civilization in the age they are chosen for, by the pair's own victory, a balance, or any victory you pick.

## Install

1. Download the zips from the [latest release](https://github.com/glazunovds/civ7-bot/releases/latest).
2. Unpack each into `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods`, so you get `Mods\expansion-planner` and `Mods\memento-advisor`.
3. Enable them in the game's Add-Ons screen and restart the game.

**Optional mods it works with:** Detailed Map Tacks (needed for the map tacks), Policy Yield Previews (better policy choices), Drongo's Compact Production, BZ City Hall, Memento Editor.

## Development

Node 22 or later; the tests need no installs.

| What | Command |
|---|---|
| Unit tests | `npm test` |
| Imports against the game's files | `node tools/check-imports.mjs` |
| Syntax and XML | `powershell -NoProfile -File tools/check-syntax.ps1` |
| Link a mod into the game's Mods folder | `powershell -File tools/deploy-junction.ps1 [-Mod memento-advisor]` |

`CLAUDE.md` (with `mod/CLAUDE.md` and `tests/CLAUDE.md`) describes the architecture, the engine API and the hard-won gotchas; `TESTING.md` is the in-game checklist; `research/` holds the notes and game logs behind each change.

## License

[MIT](LICENSE)
