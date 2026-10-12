# 10 — Web research: Civ VII rules, strategy, existing mods, UI modding

Date: 2026-10-11. This was a short research pass. The official 2K pages, the Fandom wiki and the smods catalogue all refused direct fetch (403/402), so many points below come from search-engine snippets and third-party summaries. Items marked **[unverified]** need checking in-game or in the local game files.

## 1. Current rules (patches 2025–2026)

- **Patch timeline:** 1.2.0.1 (29 Apr 2025, https://civilization.2k.com/civ-vii/game-update-notes/2025-apr-29-patch-1-2-0-1/), Aug 19 2025 (https://support.civilization.com/hc/articles/43845922146451), 1.3.2 Patch 1 (3 Mar 2026, https://civilization.2k.com/civ-vii/game-update-notes/2026-mar-03-patch-1-3-2-1/), and **1.4.0 "Test of Time"** (19 May 2026, https://civilization.2k.com/civ-vii/game-update-notes/2026-may-19-patch-1-4-0/). Apple Arcade has a 1.4.2 (https://civilization.2k.com/civ-vii/apple-arcade/patch-1-4-2/).
- **Build 1306154:** no public source maps this number to a patch **[unverified]**. Check SteamDB depot history (https://steamdb.info) or the version string on the in-game main menu.
- **1.4.0 headline changes:** any civ can be played in any Age ("Time-Tested" civs); Legacy Paths are replaced by Triumphs; victory conditions are reworked.
- **Specialist overhaul in 1.4.0** (third-party summary at https://patched.gg/games/civilization-vii/update-140-test-of-time-patch-notes):
  - Specialists lose their base Science/Culture yields.
  - Specialists now give **100% of the tile's adjacency yields** (previously 50%).
  - Specialist upkeep is 2/4/6 Food and Happiness, scaling by Age.
  - The happiness penalty for exceeding the settlement limit is now uncapped.
  - The unhappiness yield penalty is now −5% per point, capped at −80%.
  - Razing removes 1 district per Age per turn.

  This makes adjacency the main lever for urban yields.
- **Adjacency belongs to individual buildings.** Each urban tile has 2 building slots. A "Quarter" is a tile holding 2 buildings of the current age. A Unique Quarter is 2 civ-unique buildings on one tile. Sources: https://deltiasgaming.com/?p=140798 and https://game8.co/games/Civ-7/archives/499515.
- **Typical adjacency sources** (from early-2025 guides; verify against the game's `Adjacency_YieldChanges` data):
  - Science and Production buildings: adjacent resources and wonders.
  - Culture and Happiness buildings: mountains, natural wonders and wonders.
  - Food and Gold buildings: coast, navigable rivers and wonders.
  - Ageless buildings have no adjacency.
  - Sources: https://theahura.substack.com/p/civ-7-city-planning and https://game8.co/games/Civ-7/archives/496513.
- **Age transition:** buildings from earlier ages lose their adjacency bonuses; ageless buildings keep their value (https://theahura.substack.com/p/civ-7-city-planning). The exact rules for cities reverting to towns were not confirmed **[unverified]**. Community memory says cities except the capital revert to towns at an age transition; check this in the Civilopedia.
- **Settlements:**
  - Settlers found Towns.
  - A Town becomes a City by paying gold. The cost rises with the number of cities you own and falls as the town grows (https://game8.co/games/Civ-7/archives/495205).
  - Towns cannot spend Production on buildings or units; their production converts to gold.
  - Town specialisations (Focus) are unlocked at a population threshold **[pop 7, unverified]**.
- **City radius:** settlements work tiles up to 3 rings out; ring 4 only through special effects (forum thread, https://forums.civfanatics.com/threads/settlement-maximum-radius.693922).
- **Minimum distance between settlements:** no source found **[unverified]**. The commonly cited value is "3 tiles apart"; read it from the GlobalParameters table in the game files.

## 2. Community strategy

- **Town to city:** one rough rule is a 1:1 city-to-town ratio (https://gamerblurb.com/articles/civ-7-guide-when-to-convert-a-town-to-a-city-in-civ-7-civilization-7). Convert towns that have strong production (hills, rivers, forests, quarries), that are large (cheaper to convert), or whose surplus food is wasted. Keep the rest as gold or food towns.
  - Other sources: https://thefilibusterblog.com/optimal-timing-for-city-conversion-in-civilization-7/ and https://deltiasgaming.com/?p=138125.
  - Sportskeeda advises against converting everything (https://sportskeeda.com/esports/how-establish-cities-civilization-7).
- **Spacing:** settle within about 10 tiles of other settlements so roads connect them (Sportskeeda, single source). Experienced players settle tighter than that, but no hard numbers were found.
- **Districts and quarters:**
  - Pick one or two adjacency types per city.
  - Build around wonders and natural wonders, leaving room for urban tiles next to them.
  - Coastal sites give solid adjacency.
  - Put specialists on the best-adjacency tiles. This is now worth even more under 1.4.0's 100% rule.
  - Don't just chase the single highest number on each tile.
  - Sources: https://theahura.substack.com/p/civ-7-city-planning and https://game8.co/games/Civ-7/archives/499515.
- **Buildings by age:** no consolidated reputable list was found **[gap]**.

## 3. Existing mods

- **Detailed Map Tacks (Civ VII), by wltk.** wltk also made the Civ VI mod of the same name.
  - Distributed on the Steam Workshop. It was a beta in spring 2025.
  - Features: a menu of all buildings and wonders; shows a tack's own yields plus adjacency; previews yields in a range while placing; checks whether placement is valid; hotkeys; removes a tack automatically once the building is built.
  - Limitation: tacks are wiped at age transition. The author cites the lack of a stable cross-age storage API.
  - Sources: https://catalogue.smods.ru/?p=456618, https://shazoo.ru/2025/03/29/165850/vaznyi-novyi-mod-dlia-civilization-7-dobavliaet-neobxodimuiu-funkciiu-ulucsaia-karty-i-interfeis, author profile https://forums.civfanatics.com/members/wltk.346393/.
  - No public GitHub repo was found and no documented API. Treat the local install's files as the reference.
  - Not to be confused with **Map Tacks** by beezany, a Civ VI mod that does have a GitHub repo (https://forums.civfanatics.com/resources/map-tacks.26411/).
- **Drongo's City Planner:** no trace of it found **[unverified / may not exist under that name]**.
- **Wonder Alert or wonder-tracking panels for Civ VII:** none found. The only results were Civ VI mods.
- **Related Civ VII mods:**
  - Moxl Map Search: a plot search box and lens (https://forums.civfanatics.com/resources/moxl-map-search.31889).
  - Lens Hotkeys by NileMatotle, on the Workshop (https://steamcommunity.com/app/1295660/workshop/).
  - Sovereign Cheat Panel: adds a sub-system dock button. Its page says UI module paths changed in Test of Time (https://www.nexusmods.com/civilizationvii/mods/22).
- **No Civ VII settler-site recommender was found.** This looks like an open niche.

## 4. UI modding resources

- **mateicanavra/civ7-modding-tools** (https://github.com/mateicanavra/civ7-modding-tools): TypeScript SDK, CLI and docs. It is a fork of izica's tools.
- **CivFanatics threads:**
  - "scripting runtime information": dumping the JS context through FireTuner, and notes on TypeScript (https://forums.civfanatics.com/threads/scripting-runtime-information.695101/).
  - GUI modding tools beta (https://forums.civfanatics.com/threads/gui-modding-tools-beta.697222/latest).
  - Quick Modding Questions (https://forums.civfanatics.com/threads/quick-modding-questions-thread.695135/page-2).
- **No official typings found.** A repo named "civ7-types" was not confirmed **[unverified]**.
- **Best reference for the HUD and panel pattern:** the base-game `/ui` JS modules plus the `.modinfo` `UIScripts`/`ImportFiles` actions in the local install.

## Implications for our mod

1. **Adjacency is now the main lever.** Under 1.4.0, specialists amplify adjacency at 100% and have no base yields. Score tiles mainly by achievable adjacency, plus the specialist multiplier.
2. **Read rules from the database, not from guides.** Guides disagree, so take adjacency rules, settlement distance and conversion costs from the local game database (GameInfo) at runtime.
3. **Fill the settler-site gap.** No Civ VII settler-site recommender exists. Building placement overlaps with Detailed Map Tacks' yield preview, so emit tacks into DMT rather than re-implementing its preview.
4. **Expect DMT tacks to vanish at age transition.** Make recommendations recomputable on demand.
5. **Integrating with DMT means reverse-engineering it.** DMT has no published API, so read its local JS for its storage format and functions, and guard against version changes.
6. **Target post-Test-of-Time UI module paths,** and confirm which patch build 1306154 is.
7. **A wonder tracker is open ground,** but it can only use what's visible to the player (no cheating).
