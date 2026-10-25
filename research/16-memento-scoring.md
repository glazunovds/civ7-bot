# 16. Memento scoring: the data, the method, the spot checks (game 1.5.0)

Data side of a planned mod (not built yet): on the game's memento selection screen it shows a rank badge 1–6 on the suggested mementos. There are five rankings: «Balanced» and one per victory (CULTURE, SCIENCE, ECONOMIC, MILITARY). The default is the victory that suits the chosen leader + civilization.

- **Generator:** `python -I tools/memento-advisor/build_table.py` (standard library, ~5 s). Modules:
  - `mma_gamedata.py` reads the game;
  - `mma_scoring.py` is the method below;
  - `mma_values.py` holds what each memento is worth;
  - `mma_fingerprints.json` records the reviewed modifiers.
- **Output:**
  - `mod/memento-advisor/data/mma-table.js` (253 KB). It exports `MEMENTO_TABLE`, `getPicks(leader, civ)` and `mementoTypeByIcon(icon)`.
  - `tools/memento-advisor/out/mma-extract.json` (620 KB): everything read and every base score. It is a reference for people; the UI does not import it.
- **Test:** `tests/memento-advisor/table.test.mjs` (runs with `npm test`).
- **Game build read:** engine 1.5.0 (1311346), Steam build 25516395, 2026-10-13. All 17 leader DLC folders were present.

## 1. What the game data says

### Counts
- **Mementos: 133.**
  - Base game: 76, i.e. 19 on the Foundation path plus 19 leaders × 3.
  - DLC: 57, i.e. 19 DLC leaders × 3.
- **Leaders: 38.** 19 base, 19 DLC (alternate personas included). `trung-nhi` is a unit pack, not a leader.
- **Civilizations: 50.**
  - Antiquity 17 (10 base);
  - Exploration 18 (10 base);
  - Modern 15 (10 base).
- **Pairs:**
  - 38 × 50 = 1,900;
  - plus 38 `LEADER|*` fallbacks;
  - plus `*|*`.

### Where it lives
- **Gameplay** (`data/mementos.xml`, `mementos-gameeffects.xml`):
  - The `Mementos` rows have a `Tag` column, but it is useless: 59 of the 76 say "Military".
  - `MementoModifiers` links each memento to its modifiers. All modifiers are in the memento gameeffects files.
  - Some modifiers are attached through `EFFECT_ATTACH_MODIFIERS`. One of them lists two ids separated by a comma (the Iliad).
- **Frontend** (`config/config.xml` `<Mementos>`):
  - `Tag` holds the attribute (`LOC_ATTRIBUTE_SCIENTIFIC`…, or `_WILDCARD`).
  - Also: `LeaderSpecific`, `UnlockTitle`.
- **Unlocks** (`metaprogression/legend-paths/*.xml`, DLC `metaprogression/*.xml`):
  - Leader paths give their mementos at levels 2, 5 and 9.
  - Foundation gives 19 mementos between levels 2 and 49, and the **two memento slots**: `MEMENTO_SLOT_1` at level 2, `MEMENTO_SLOT_2` at level 5.

### Two slots, any memento in either
- The parameters are `PlayerMementoMajorSlot` and `PlayerMementoMinorSlot1`, both in domain `StandardMementos` (`core/config/SetupParameters.xml`).
- Equipping a memento in one slot removes it from the other (`memento-select-model.js` `equipMemento`).

### Mementos are chosen again at every age transition
- `AgeTransitionPlayerMementoMajorSlot` and `…MinorSlot1` have `ChangeableAfterGameStart="1"`.
- The age-transition screens host the same memento picker:
  - `age-transition-civ-select.js` has a button `LOC_AGE_TRANSITION_EDIT_MEMENTOS`;
  - `ui-next/.../age-transition-screen.js` renders `MementoSelect`.
- **So a pick only has to be good for one age.** The table scores every pair for the age of its civilization.

### Any leader can equip any unlocked memento
- The Civilopedia (`Civilopedia_Concepts_Text.xml`) says unlocked mementos "can be freely equipped by any leader".
- **`LeaderSpecific`** is a frontend column (default `NO_LEGEND_PATH`). It is set on 38 mementos, one per leader, mostly the level-9 reward.
  - No UI script reads it. The engine filters the choices natively (`GameSetup.getMementoFilteredPlayerParameters`), so its exact rule cannot be read from the scripts.
  - **5 of the 38 name another leader's path:**
    - Diamond Throne → `ASHOKA_ALT`;
    - Lion Capital → `ASHOKA`;
    - Forget-me-not → `ISABELLA`;
    - Bastille Key → `ELIZABETH`;
    - Gold Fluted Phiale → `XERXES`.
  - It reads as display metadata, not a restriction. The table assumes any leader may use any memento. The mod should still rank only what the slot offers (section 4).

### Scaling and conditions
- **`type="ScaleByGameAge" extra="100"`** gives ×1 / ×2 / ×3 in Antiquity / Exploration / Modern. The effect texts confirm it: they give the Antiquity amount "per Age" (Yasakani: +2 Science, so +4 and +6 later).
- **`ScaleByGameSpeed`** (the one-off grants for spending attribute points) is taken at standard speed.
- **64 of the 133 mementos are conditional.** Examples:
  - an ally or exactly one ally;
  - tundra, mountains, plains or desert;
  - cavalry, naval, infantry or ranged units;
  - a celebration;
  - suzerainty;
  - natural wonders;
  - war;
  - points spent in one attribute tree.

### Leader victory traits
- They are `TRAIT_{AQ|EX|MO}_{CULTURE|SCIENCE|ECONOMIC|MILITARY}_VICTORY`, **one per age**, and they can differ by age:
  - Napoleon, Emperor: Antiquity MILITARY, Exploration SCIENCE, Modern ECONOMIC.
  - Himiko: SCIENCE, CULTURE, SCIENCE.
  - Alexander has two in every age (MILITARY and CULTURE).
- Attributes are `TRAIT_LEADER_ATTRIBUTE_*` (two per leader).
- Ibn Battuta has neither. His frontend `LeaderTags` say Expansionist and Wildcard.
- These traits steer the AI only (research/12). Here they choose the default ranking.

### DLC mementos
- They load with their DLC module (`<Package>` in the `.modinfo`) and are unlocked on that DLC leader's legend path. So they need the DLC.
- **Their weight in the table:**
  - 6 of the 12 mementos that rank first in some list are DLC: Gold Snuff Box (Bolívar), Note G (Ada Lovelace), Kusanagi no Tsurugi (Himiko, High Shaman), Bridle of Bucephalus (Alexander), Wampum Belt and Warclub (Tecumseh).
  - 14 of the 33 that reach any top 6 are DLC. 100 mementos never reach a top 6.

### Data quirks
- **Corona Civica:** its text also promises a 50% higher cost to convert a town to a city, but only the settlement-cap modifier exists (`…_MODIFIER_1`). It is valued without the drawback.
- **Benjamin Franklin's Bifocals:** an older modifier (Influence per mastery) is commented out. The live one gives Influence per technology.
- **Catherine:** Eagle Banner (level 2) is her `LeaderSpecific` memento; Great Imperial Crown is at level 9.

## 2. The method

### 2.1 Unit and horizon
- **Points** = the percentage a memento adds to the age's output, weighted by how much that output matters to the focus.
  - +10% Science in a science game = 10 points.
  - One extra policy slot = 12 / 10 / 9 points in every focus.
- **Each pair is scored for one age:** the age of its civilization. `LEADER|*` and `*|*` use Antiquity.
- **Permanent gains carry a horizon factor.** An attribute point is worth 4% × 1.6 / 1.3 / 1.0 by age, because it stays for the rest of the game.

### 2.2 The reference empire
A memento's effect is turned into yield per turn with the counts of a reference empire. They are averages over each age, standard speed, a competent single-player game; one-off amounts are spread over 100 turns. All of them are in `mma_scoring.py` (`REF`, `REF_OUTPUT`) and in `mma-extract.json` → `reference`.

| Count (average over the age) | Antiquity | Exploration | Modern |
|---|---|---|---|
| Science / Culture / Gold / Production / Food / Happiness / Influence per turn (`REF_OUTPUT`) | 50 / 40 / 35 / 50 / 50 / 25 / 10 | 200 / 160 / 90 / 160 / 130 / 70 / 25 | 450 / 380 / 200 / 350 / 260 / 140 / 50 |
| cities / towns | 3 / 3 | 5 / 5 | 7 / 6 |
| specialists | 5 | 20 | 45 |
| tech masteries completed (active) | 5 | 5 | 5 |
| tech + civic masteries completed in the age | 10 | 10 | 8 |
| resources assigned to cities / imported | 4 / 1 | 8 / 2 | 12 / 4 |
| trade routes | 1 | 3 | 4 |
| cities with a wonder / wonders | 1 / 1.5 | 2 / 2.5 | 2 / 3 |
| great works displayed | 1 | 4 | 8 |
| suzerainties | 1 | 1.5 | 2 |
| army commander promotions | 2 | 4 | 6 |
| military / science / happiness / gold buildings | 2 / 3 / 3 / 3 | 3 / 6 / 6 / 6 | 4 / 9 / 8 / 8 |
| traditions / other policies slotted | 1 / 2 | 2 / 3 | 3 / 4 |
| attribute trees with points | 2.5 | 4 | 5 |
| average number of allies | 0.5 | 0.7 | 0.8 |

Average tech cost (from `progression-trees-tech.xml`): 335 / 1,600 / 4,000.

### 2.3 Base value of a memento
Each memento has one or more terms (`mma_values.py`). Points per focus are the sum over its terms.

- **Yield term `Y`:**
  - Yield per turn = amount × count from the table × (age multiplier if `ScaleByGameAge`) [÷ 100 for one-offs].
  - Then % of `REF_OUTPUT` for that yield.
  - Then × that yield's weight for the focus.
- **Percentage term `PCT`:** for example Kite & Key's +10% towards masteries, about 4% of all Science.
- **Lever term `LV`:** non-yield effects, in points per unit. The first column is the points for one unit; then its weight per focus (C/S/E/M).

  | Lever | Points (Antiquity / Exploration / Modern) | Weights C / S / E / M |
  |---|---|---|
  | policy slot | 12 / 10 / 9 | 1 / 1 / 1 / 1 |
  | settlement limit | 8 / 6 / 4 | .8 / .8 / .9 / 1 |
  | +1 Combat Strength on every unit, always | 10 | .15 / .15 / .15 / 1 |
  | +1 Movement on every military unit | 8 | .1 / .1 / .1 / 1 |
  | War Support +1 | 5 | .3 / .3 / .3 / 1 |
  | commander XP +10% | 0.8 | military |
  | trade route limit with every leader | 8 / 8 / 6 | .35 / .35 / 1 / .35 |
  | trade range +5 | 2 / 1.5 / 1 | economic |
  | great-work slot | .4 / .8 / .8 | Antiquity: codices, so Science; later: Culture |
  | +1 Population | 2.5 / 1.2 / 0.7 | .8 / .8 / .8 / .7 |
  | civilian movement, exploration, celebration length, diplomacy | small | — |

  A lever that covers only part of the units is multiplied by that share, for example ranged units 0.35.
- **Attribute point:** 6.4 / 5.2 / 4.0 points, times a weight for its kind. A Scientific point counts 1.0 in SCIENCE and 0.35 elsewhere; Expansionist 0.6–0.75; Diplomatic 0.5.

**Yield weights by focus** (`YIELD_WEIGHT`). Food also falls by age ×1 / ×0.85 / ×0.65, because growth matters less late in the game.

| Yield | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|
| Science | .25 | 1.0 | .25 | .25 |
| Culture | 1.0 | .25 | .25 | .20 |
| Gold | .25 | .25 | .90 | .35 |
| Production | .50 | .50 | .50 | .80 |
| Food | .30 | .30 | .30 | .20 |
| Happiness | .25 | .15 | .15 | .15 |
| Influence | .12 | .10 | .12 | .10 |

Production poured into one kind of building gets that building's victory instead: Nanjung Ilgi (science buildings) counts 0.9 in SCIENCE, Tea Ceremony Kit 0.9 in CULTURE.

### 2.4 Conditional mementos
A condition is an **uptime**: the expected share of the age the bonus works.

| Condition | Uptime without a match | With a match |
|---|---|---|
| exactly one ally (Gold Snuff Box, Pukku, Mikku) | 0.35 | 0.6 |
| per ally (Glass Armonica) | the average number of allies | ×1.5 |
| tundra | 0.1 | 0.6 |
| mountains | 0.4 (Mascapaycha's extra part 0.2) | 1.0 (0.6) |
| plains / desert | 0.4 | 0.8 |
| war (conquest, declaring war) | 0.3–0.4 | 1.0–1.2 |
| during celebrations | 0.3–0.4 | 0.45–0.7 |
| naval / cavalry / infantry / ranged | the class's share of the army | ×2.0 / ×1.7 / ×1.6 / ×1.6 |
| suzerainty, natural wonders, great works, wonders, sanctions | reference count | ×1.4 – ×2 |
| points spent in one attribute tree | 0.6 | 1.4 |
| behind half the civilizations (Royal Game of Ur) | 0.3 | 0.3 |

"With a match" means the leader's or the civilization's tags contain the condition (section 2.5).

### 2.5 Synergy with the leader and the civilization
- **Tags** come from the game's own text and data (`mma_scoring.py` `TEXT_TAGS`). Appendices C and D list them.
  - **Leader:** keywords in the ability text (specialists, naval, alliance, celebration, mountains…), `attr_<KIND>` from the attribute traits, and `war` from `TRAIT_LEADER_AGGRESSIVE`.
  - **Civilization:**
    - keywords in its ability and its unique buildings, quarters and improvements. Sentences about adjacency are skipped, since "+1 Culture adjacency for Wonders" says nothing about the civilization's plan;
    - unit classes of its unique units (`UNIT_CLASS_NAVAL` → naval, `_CAVALRY`/`_MOUNTED` → cavalry…);
    - `unique_improvements` / `unique_quarter`;
    - `attr_<KIND>` from its frontend tags.
- **Two effects:**
  - A matching condition tag raises the uptime (2.4).
  - A matching "fit" tag multiplies the value by **×1.15 for the leader and ×1.15 for the civilization**, capped at ×1.3. Examples: Analects ↔ specialists, Kwalkwali ↔ resources.
- Generic yield words never earn the bonus, because almost every civilization mentions some yield.

### 2.6 Balanced and the default focus
- **Balanced** = the mean of the four focus values, after synergy. It favours mementos that help everything: the policy slot, food, the attribute-tree yields of the Rihla.
- **Default focus:**
  1. The leader's victory trait for the civilization's age.
  2. If the leader has two traits that age (Alexander), the higher lean wins.
  3. With no trait (Ibn Battuta), the highest lean wins.
- **Lean:**
  - +1 per leader attribute (Scientific → SCIENCE, Cultural → CULTURE, Economic → ECONOMIC, Militaristic → MILITARY);
  - +1.5 per civilization attribute;
  - +0.25 / +0.1 per leader / civilization keyword (science, specialists, gold, trade, war, commanders…).
- Ties go SCIENCE, CULTURE, ECONOMIC, MILITARY. `*|*` therefore defaults to SCIENCE.
- Over the 1,900 pairs: MILITARY 724, CULTURE 523, ECONOMIC 354, SCIENCE 338. There are many military leaders, especially among the DLC.

### 2.7 Ranking and reasons
- **Order:** points descending; ties by points without synergy, then by type name. Each list keeps 12 entries: `ranks` = 1–6, `more` = 7–12.
- **Reasons:** each pick's reason is built from three parts. Example:
  > +1 Science per specialist — ≈ +20 Science per turn in Exploration; fits Confucius (specialists), Abbasid (specialists)

  - **What it gives:** the memento's one-line description, from `mma_values.py`, in English and Russian.
  - **The estimate:** the expected yield per turn in that age, with the uptime included. Mementos with no yield term have none.
  - **The matches:** the leader's and civilization's tags that matched.

### 2.8 Worked examples (base values, no synergy)
- **Yasakani no Magatama** («Ясакани-но магатама»): +2 Science × age per completed tech mastery.
  - With 5 masteries active on average: +10 / +20 / +30 Science per turn.
  - That is 20% / 10% / 6.7% of Science, so SCIENCE 20 / 10 / 6.7 and 5 / 2.5 / 1.7 elsewhere.
  - The best science memento in Antiquity. Later its flat amount falls behind empire output, which grows ×9 while the memento grows ×3.
- **Corpus Juris Civilis** («Свод Юстиниана»): one more social policy slot, 12 / 10 / 9 points in every focus. It is in 8,171 of the 9,695 top-6 lists: every Balanced and every Science list, and half the Culture lists.
- **The Analects** («Беседы и суждения»): +1 Science per specialist.
  - 5 / 20 / 45 specialists give a steady 10% of Science, so SCIENCE 10 in every age.
  - ×1.15 with a specialist leader (Confucius) or civilization (Abbasid, Majapahit, Joseon, Ottomans).
- **Gold Snuff Box** (Bolívar DLC): +20 × age Food in every city while you have exactly one ally.
  - 3 / 5 / 7 cities × 20 / 40 / 60 × uptime 0.35 = +21 / +70 / +147 Food.
  - That is ≈ 12.6 / 13.7 / 11.0 points outside MILITARY, near the top of most lists. It is huge when the condition holds; the uptime is the discount.
- **Takoba** (Amina): +1 Combat Strength in plains and desert.
  - 10 × 0.4 = 4 MILITARY points.
  - With Amina (her ability mentions plains and desert) the uptime is 0.8, so 8 points.

## 3. Spot checks
- **Tables:** Appendix A, generated by the same code (`--markdown`).
- **Benjamin Franklin + Han (science):**
  - Antiquity: Yasakani no Magatama (20), Glass Armonica (19.5), Gold Snuff Box (12.6, DLC), Corpus Juris Civilis (12), The Analects (10), The Rihla (9.8). All three expected picks are in the top 5.
  - Ming (Exploration): Glass Armonica, Snuff Box, Corpus, Analects, Yasakani, Rihla.
  - Meiji (Modern): Yasakani falls to the spares (6.7 points), behind the policy slot and the Analects (10).
- **Amina + Aksum (economic):** Mascapaycha, Chalcedony Seal (Aksum's Hawilt improvements, DLC), Kwalkwali (her own; ×1.3 for resources from both), Snuff Box, Corpus, Rihla. This matches research/12's pick (Kwalkwali + Corpus).
- **Ashoka, World Renouncer + Maurya (culture):** Uraeus, Kusanagi no Tsurugi (DLC), Snuff Box, Altar Set, Corpus, Rihla. In MILITARY, Maurya's cavalry lifts Bridle of Bucephalus to first place.
- **Napoleon, Emperor:** the focus follows his trait for each age.
  - Rome (Antiquity, MILITARY): Corpus, Corona Civica, Krone von Friedrich I, Rawani, Snuff Box, Glass Armonica.
  - French Empire (Modern, ECONOMIC): Mascapaycha, Kwalkwali, Snuff Box, Juelles of Golde, Rihla, Corpus.
- **Himiko + Heian Japan (science):** Glass Armonica first (29.2: her ability works through an ally), then Snuff Box, Yasakani, Corpus, Analects, Rihla.
- **Confucius + Han or no civilization (science):** Yasakani, Glass Armonica, Snuff Box, Corpus, Analects (11.5 with his specialist synergy), Rihla. Culture also lifts Altar Set (+1 Culture per specialist) to 14.4.

## 4. Using the table in the mod
```js
import { MEMENTO_TABLE, getPicks } from "fs://game/memento-advisor/data/mma-table.js"; // path per the mod's layout
const pick = getPicks(leaderType, civType);          // "<LEADER>|<CIV>", else "<LEADER>|*", else "*|*"
const ranking = chosenRanking ?? pick.focus;          // "BALANCED" | "CULTURE" | "SCIENCE" | "ECONOMIC" | "MILITARY"
// Rank only what the slot offers: slot.availableMementos (memento-select-model.js), skipping isLocked.
const offered = new Set(slot.availableMementos.filter((m) => !m.isLocked).map((m) => m.value));
const shown = [...pick.ranks[ranking], ...pick.more[ranking]].filter((t) => offered.has(t)).slice(0, 6);
// badge = shown.indexOf(t) + 1; tooltip = pick.reasons[t][lang === "ru_RU" ? "ru" : "en"]
```
- **Shape:**
  - `MEMENTO_TABLE.mementos[T]`: `{name, source ("base" or the DLC folder), icon, unlock {path, level}, attribute, tags, conditional, what, est {AQ, EX, MO}, reason}`.
    - `icon` is `Rewards.CustomData` (`config/unlockableRewards.xml`): the `url('blp:<icon>')` a memento card carries. Research/15 found that cards carry no type id.
    - The 133 icons are unique. `mementoTypeByIcon(icon)` maps one back to its type, in the shell too, where `GameInfo` has no mementos.
  - `leaders[L]`: `{name, source, attributes, victory {AQ, EX, MO}, tags}`.
  - `civs[C]`: `{name, age, source, attributes, tags}`.
  - `picks[key]`: `{focus, age, ranks, more, reasons}`.
- **Data format:** the module stores pooled rank lists (`lists`, 2 base-36 characters per memento) and builds the frozen objects at import. Arrays are shared between pairs: do not mutate them.
- **File name:** `mma-` prefix, because the game resolves UI imports by file name across all mods.
- **Language:** the reasons are plain text, without game markup; Russian uses the game's terms. For the full game text, use the memento's own `FunctionalDescription` through `Locale`.
- **Age:** a pick is scored for the age it is chosen for (the game allows any civilization in any age, so the pair's own age is not enough). At an age transition the screen offers the new civilization, so ask for that pair.

## 5. Re-running after a game update
- `python -I tools/memento-advisor/build_table.py --markdown <file>` rewrites both outputs and prints counts, the default-focus split, the size and warnings.
- **Fingerprints:** every memento's modifiers (effect, collection, arguments, scaling, requirements) are hashed into `mma_fingerprints.json`. A changed hash prints a warning.
  - Review the memento's entry in `mma_values.py`, then run with `--accept-fingerprints`.
  - `--strict` makes warnings exit 1.
- **New mementos:** a memento missing from `mma_values.py` gets half an attribute point of its frontend attribute and a warning, so it appears in the table but never at the top.
- **Text:**
  - English: `text/en_us/*.xml` (base) or `text/*.xml` (most DLC put English there, not in `en_us`).
  - Russian: `l10n/*ru_RU*.xml` rows `<Replace Language="ru_RU">`. Names keep only the first case form of `Nom|Gen|…`.

## 6. Limits and open questions
- **The reference empire is a judgement** (section 2.2), not measured. It could be calibrated from the user's logs:
  - `Player_Stats.csv` (yields per turn, cities, towns);
  - `CityBuildQueue.csv`;
  - counts of specialists and masteries.
  The numbers most worth checking: specialists per age (5 / 20 / 45), Science per turn (50 / 200 / 450), and the 0.35 uptime of "exactly one ally".
- **The table assumes the age, not the turn.** Picking at an age transition and keeping the memento for later ages is not modelled beyond the attribute-point horizon.
- **Do repeated one-off mementos fire again each age?** The table assumes that run-once grants (an attribute point, Lydian Lion's gold) are granted again when the memento is equipped for a new age. Not verified in game.
- **Yasakani counts "completed masteries".** The table assumes the current age's tree. If the engine counts every age's masteries, the memento is much stronger in Exploration and Modern.
- **`LeaderSpecific`:** assumed to be metadata (section 1). If the native filter does restrict those 38 mementos to one leader, the mod's filtering by `availableMementos` already hides them; the rankings stay valid for the rest.
- **DLC mementos need their DLC.** 6 of the 12 mementos that ever rank first are DLC. Without them the spare ranks 7–12 fill in, which is why `more` exists. The table cannot tell what the player owns or has unlocked: the mod must filter.
- **The most assumption-sensitive picks:**
  - Mascapaycha (+1 Gold per specialist) ranks first in most ECONOMIC lists from Exploration on, because of the 20 / 45 specialists.
  - Gold Snuff Box rests on the 0.35 uptime of "exactly one ally".
- **Tags come from keywords** and are sometimes loose. Example: Han gets `military_buildings` because the Great Wall's text calls it a fortification. Tags only scale values by up to ×1.3, or raise an uptime.
- **Not modelled:**
  - interactions between the two picks, for example Groma's Expansionist point feeding Gold & Sapphire Flowers;
  - game speed, map size and difficulty;
  - multiplayer.

<!-- Everything below is generated: python -I tools/memento-advisor/build_table.py --markdown <file> -->

## Appendix A. Spot checks (generated)

### Benjamin Franklin + Han: default focus SCIENCE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Corpus Juris Civilis (12.0) | Uraeus (25.0) | Yasakani no Magatama (20.0) | Mascapaycha (15.4) | Corpus Juris Civilis (12.0) |
| 2 | Glass Armonica (11.8) | Kusanagi no Tsurugi (21.0) | Glass Armonica (19.5) | Chalcedony Seal (15.3) | Corona Civica (9.2) |
| 3 | Gold Snuff Box (11.6) | Chalcedony Seal (15.4) | Gold Snuff Box (12.6) | Gold Snuff Box (12.6) | Rawani (9.0) |
| 4 | Chalcedony Seal (11.1) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | Corpus Juris Civilis (12.0) | Gold Snuff Box (8.4) |
| 5 | Uraeus (10.6) | Altar Set (12.5) | The Analects (10.0) | The Rihla (10.7) | Glass Armonica (8.2) |
| 6 | The Rihla (9.7) | Corpus Juris Civilis (12.0) | The Rihla (9.8) | Kwalkwali (10.3) | Note G (8.0) |

### Benjamin Franklin + Ming: default focus SCIENCE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Gold Snuff Box (12.6) | Uraeus (25.0) | Glass Armonica (15.0) | Mascapaycha (24.0) | Note G (12.0) |
| 2 | Mascapaycha (11.7) | Kusanagi no Tsurugi (21.0) | Gold Snuff Box (13.7) | Kwalkwali (16.0) | Corpus Juris Civilis (11.5) |
| 3 | Corpus Juris Civilis (11.5) | Gold Snuff Box (13.7) | Corpus Juris Civilis (11.5) | Gold Snuff Box (13.7) | Mascapaycha (9.3) |
| 4 | Uraeus (10.6) | Altar Set (12.5) | The Analects (10.0) | The Rihla (12.0) | Gold Snuff Box (9.2) |
| 5 | Glass Armonica (9.8) | Corpus Juris Civilis (11.5) | Yasakani no Magatama (10.0) | Green Colonel's Jacket (11.8) | Rawani (9.0) |
| 6 | The Rihla (9.8) | Incense Censer (11.2) | The Rihla (9.2) | Corpus Juris Civilis (11.5) | Krone von Friedrich I (8.0) |

### Benjamin Franklin + Meiji Japan: default focus SCIENCE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Mascapaycha (11.8) | Kusanagi no Tsurugi (17.6) | Glass Armonica (11.9) | Mascapaycha (24.3) | Note G (11.0) |
| 2 | Gold Snuff Box (10.1) | Uraeus (15.8) | Gold Snuff Box (11.0) | Kwalkwali (18.6) | Wampum Belt (9.6) |
| 3 | Kwalkwali (9.1) | Altar Set (11.8) | The Analects (10.0) | Gold Snuff Box (11.0) | Mascapaycha (9.4) |
| 4 | Corpus Juris Civilis (9.0) | Gold Snuff Box (11.0) | Corpus Juris Civilis (9.0) | Juelles of Golde (10.8) | Rawani (9.0) |
| 5 | The Rihla (8.3) | The Rihla (9.3) | The Rihla (7.8) | The Rihla (10.2) | Corpus Juris Civilis (9.0) |
| 6 | Glass Armonica (8.0) | Corpus Juris Civilis (9.0) | Note G (6.9) | Corpus Juris Civilis (9.0) | Krone von Friedrich I (8.0) |

### Amina + Aksum: default focus ECONOMIC

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Uraeus (14.9) | Uraeus (35.0) | Yasakani no Magatama (20.0) | Mascapaycha (15.4) | Corpus Juris Civilis (12.0) |
| 2 | Corpus Juris Civilis (12.0) | Kusanagi no Tsurugi (21.0) | Glass Armonica (19.5) | Chalcedony Seal (15.3) | Rawani (9.0) |
| 3 | Glass Armonica (11.8) | Chalcedony Seal (15.4) | Gold Snuff Box (12.6) | Kwalkwali (13.4) | Gold Snuff Box (8.4) |
| 4 | Gold Snuff Box (11.6) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | Gold Snuff Box (12.6) | Glass Armonica (8.2) |
| 5 | Chalcedony Seal (11.1) | Altar Set (12.5) | The Analects (10.0) | Corpus Juris Civilis (12.0) | Note G (8.0) |
| 6 | The Rihla (9.7) | Corpus Juris Civilis (12.0) | The Rihla (9.8) | The Rihla (10.7) | Corona Civica (8.0) |

### Ashoka, World Renouncer + Maurya: default focus CULTURE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Corpus Juris Civilis (12.0) | Uraeus (25.0) | Yasakani no Magatama (20.0) | Mascapaycha (15.4) | Bridle of Bucephalus (12.2) |
| 2 | Glass Armonica (11.8) | Kusanagi no Tsurugi (24.1) | Glass Armonica (19.5) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) |
| 3 | Gold Snuff Box (11.6) | Gold Snuff Box (12.6) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | Corona Civica (9.2) |
| 4 | Uraeus (10.6) | Altar Set (12.5) | Corpus Juris Civilis (12.0) | The Rihla (10.7) | Rawani (9.0) |
| 5 | The Rihla (9.7) | Corpus Juris Civilis (12.0) | The Analects (10.0) | Kwalkwali (10.3) | Gold Snuff Box (8.4) |
| 6 | Yasakani no Magatama (8.8) | The Rihla (11.8) | The Rihla (9.8) | Chalcedony Seal (9.6) | Silk Uttariya (8.3) |

### Napoleon, Emperor + Rome: default focus MILITARY

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Corpus Juris Civilis (12.0) | Uraeus (25.0) | Yasakani no Magatama (20.0) | Mascapaycha (15.4) | Corpus Juris Civilis (12.0) |
| 2 | Glass Armonica (11.8) | Kusanagi no Tsurugi (24.1) | Glass Armonica (19.5) | Gold Snuff Box (12.6) | Corona Civica (9.2) |
| 3 | Gold Snuff Box (11.6) | Artilleryman's Gloves (13.0) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | Krone von Friedrich I (9.2) |
| 4 | Uraeus (10.6) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | The Rihla (10.7) | Rawani (9.0) |
| 5 | The Rihla (9.7) | Altar Set (12.5) | Kiem (10.4) | Kwalkwali (10.3) | Gold Snuff Box (8.4) |
| 6 | Yasakani no Magatama (8.8) | Corpus Juris Civilis (12.0) | The Analects (10.0) | Chalcedony Seal (9.6) | Glass Armonica (8.2) |

### Napoleon, Emperor + French Empire: default focus ECONOMIC

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Mascapaycha (11.8) | Kusanagi no Tsurugi (20.3) | Glass Armonica (11.9) | Mascapaycha (24.3) | Note G (11.0) |
| 2 | Gold Snuff Box (10.1) | Uraeus (15.8) | Gold Snuff Box (11.0) | Kwalkwali (16.2) | Wampum Belt (9.6) |
| 3 | Corpus Juris Civilis (9.0) | Altar Set (11.8) | The Analects (10.0) | Gold Snuff Box (11.0) | Mascapaycha (9.4) |
| 4 | The Rihla (8.3) | Gold Snuff Box (11.0) | Corpus Juris Civilis (9.0) | Juelles of Golde (10.8) | Warclub (9.2) |
| 5 | Glass Armonica (8.0) | The Rihla (9.3) | The Rihla (7.8) | The Rihla (10.2) | Rawani (9.0) |
| 6 | Note G (7.9) | Corpus Juris Civilis (9.0) | Note G (6.9) | Corpus Juris Civilis (9.0) | Corpus Juris Civilis (9.0) |

### Himiko, Queen of Wa + Heian Japan: default focus SCIENCE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Gold Snuff Box (19.8) | Uraeus (25.0) | Glass Armonica (29.2) | Gold Snuff Box (21.6) | Gold Snuff Box (14.4) |
| 2 | Glass Armonica (17.7) | Gold Snuff Box (21.6) | Gold Snuff Box (21.6) | Mascapaycha (15.4) | Glass Armonica (12.4) |
| 3 | Corpus Juris Civilis (12.0) | Kusanagi no Tsurugi (21.0) | Yasakani no Magatama (20.0) | Chalcedony Seal (15.3) | Corpus Juris Civilis (12.0) |
| 4 | Chalcedony Seal (11.1) | Glass Armonica (16.9) | Corpus Juris Civilis (12.0) | Glass Armonica (12.4) | Rawani (9.0) |
| 5 | Uraeus (10.6) | Chalcedony Seal (15.4) | The Analects (10.0) | Corpus Juris Civilis (12.0) | Note G (8.0) |
| 6 | The Rihla (9.7) | Altar Set (12.5) | The Rihla (9.8) | The Rihla (10.7) | Corona Civica (8.0) |

### Confucius + Han: default focus SCIENCE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Corpus Juris Civilis (12.0) | Uraeus (25.0) | Yasakani no Magatama (20.0) | Mascapaycha (17.7) | Corpus Juris Civilis (12.0) |
| 2 | Glass Armonica (11.8) | Kusanagi no Tsurugi (21.0) | Glass Armonica (19.5) | Chalcedony Seal (15.3) | Corona Civica (9.2) |
| 3 | Gold Snuff Box (11.6) | Chalcedony Seal (15.4) | Gold Snuff Box (12.6) | Gold Snuff Box (12.6) | Rawani (9.0) |
| 4 | Chalcedony Seal (11.1) | Altar Set (14.4) | Corpus Juris Civilis (12.0) | Corpus Juris Civilis (12.0) | Gold Snuff Box (8.4) |
| 5 | Uraeus (10.6) | Gold Snuff Box (12.6) | The Analects (11.5) | The Rihla (10.7) | Glass Armonica (8.2) |
| 6 | The Rihla (9.7) | Corpus Juris Civilis (12.0) | The Rihla (9.8) | Kwalkwali (10.3) | Note G (8.0) |

### Confucius + unknown civ (Antiquity): default focus SCIENCE

| # | BALANCED | CULTURE | SCIENCE | ECONOMIC | MILITARY |
|---|---|---|---|---|---|
| 1 | Corpus Juris Civilis (12.0) | Uraeus (25.0) | Yasakani no Magatama (20.0) | Mascapaycha (17.7) | Corpus Juris Civilis (12.0) |
| 2 | Glass Armonica (11.8) | Kusanagi no Tsurugi (21.0) | Glass Armonica (19.5) | Gold Snuff Box (12.6) | Rawani (9.0) |
| 3 | Gold Snuff Box (11.6) | Altar Set (14.4) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | Gold Snuff Box (8.4) |
| 4 | Uraeus (10.6) | Gold Snuff Box (12.6) | Corpus Juris Civilis (12.0) | The Rihla (10.7) | Glass Armonica (8.2) |
| 5 | The Rihla (9.7) | Corpus Juris Civilis (12.0) | The Analects (11.5) | Kwalkwali (10.3) | Note G (8.0) |
| 6 | Yasakani no Magatama (8.8) | The Rihla (11.8) | The Rihla (9.8) | Chalcedony Seal (9.6) | Corona Civica (8.0) |

## Appendix B. Every memento's base points (no synergy), by age and focus (generated)

Points = % of the age's output, weighted by focus (B = Balanced, C/S/E/M = the four victories). Yields are the expected amounts per turn the points come from.

| Memento | Source | Terms | AQ B/C/S/E/M | EX B/C/S/E/M | MO B/C/S/E/M | Expected yields per turn AQ / EX / MO |
|---|---|---|---|---|---|---|
| Kwalkwali (Квалквали) | base | 1 Gold × resourcesInCities × age — fits: resources | 5/3/3/10/4 | 8/4/4/16/6 | 8/4/4/16/6 | +4 Gold / +16 Gold / +36 Gold |
| Rawani (Равани) | base | combat × 0.9 — fits: war | 3/1/1/1/9 | 3/1/1/1/9 | 3/1/1/1/9 | — / — / — |
| Takoba (Такоба) | base | combat × 1 — uptime 0.4 (0.8 with desert) — fits: war | 1/1/1/1/4 | 1/1/1/1/4 | 1/1/1/1/4 | — / — / — |
| Chakra (Чакра) | base | 0.2 Food × capitalExcessHappiness — fits: celebration | 1/1/1/1/1 | 1/1/1/1/0 | 0/0/0/0/0 | +2 Food / +3 Food / +4 Food |
| Diamond Throne (Алмазный трон) | base | 1 Happiness × quarterTiles × age — uptime 0.3 (0.45 with celebration) — fits: quarters | 0/1/0/0/0 | 1/1/1/1/1 | 1/1/1/1/1 | +0.6 Happiness / +2.4 Happiness / +5.4 Happiness |
| Gold & Sapphire Flowers (Золотые цветы с сапфирами) | base | 100 Food × attrPointsOneTree ÷ 100 turns — uptime 0.6 (1.4 with attr_EXPANSIONIST) | 0/1/1/1/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.9 Food / +0.9 Food / +0.9 Food |
| Breastplate (Кираса) | base | 2 Food × towns × age — fits: towns | 3/4/4/4/2 | 4/4/4/4/3 | 2/3/3/3/2 | +6 Food / +20 Food / +36 Food |
| Clipeus Virtutis (Щит доблести) | base | 1 Production × towns — fits: towns | 3/3/3/3/5 | 2/2/2/2/2 | 1/1/1/1/1 | +3 Production / +5 Production / +6 Production |
| Corona Civica (Гражданская корона) | base | settlementCap × 1 — fits: expansion, towns | 7/6/6/7/8 | 5/5/5/5/6 | 4/3/3/4/4 | — / — / — |
| Merchant's Saddle (Седло торговца) | base | civilianMove × 1 — fits: trade, expansion | 2/2/2/3/2 | 1/1/1/2/1 | 1/1/1/1/1 | — / — / — |
| The Rihla (Рихла) | base | 1 Science × attrTreesWithPoints × age + 1 Culture × attrTreesWithPoints × age + 1 Gold × attrTreesWithPoints × age + 1 Happiness × attrTreesWithPoints × age — fits: attributes | 10/12/10/11/6 | 10/11/9/12/7 | 8/9/8/10/6 | +2.5 Science, +2.5 Culture, +2.5 Gold, +2.5 Happiness / +8 Science, +8 Culture, +8 Gold, +8 Happiness / +15 Science, +15 Culture, +15 Gold, +15 Happiness |
| Traveller's Sandals (Сандалии путешественника) | base | 6.25 Science × attrPointsSpent ÷ 100 turns + 6.25 Culture × attrPointsSpent ÷ 100 turns + 6.25 Gold × attrPointsSpent ÷ 100 turns + 6.25 Production × attrPointsSpent ÷ 100 turns — fits: attributes | 1/1/1/1/1 | 0/0/0/0/0 | 0/0/0/0/0 | +0.2 Science, +0.2 Culture, +0.2 Gold, +0.2 Production / +0.2 Science, +0.2 Culture, +0.2 Gold, +0.2 Production / +0.2 Science, +0.2 Culture, +0.2 Gold, +0.2 Production |
| Bifocals (Бифокальные очки) | base | 25 Diplomacy × techsPerAge × age ÷ 100 turns — fits: techs | 4/5/4/5/4 | 3/4/3/4/3 | 3/3/3/3/3 | +4 Diplomacy / +7.5 Diplomacy / +13 Diplomacy |
| Glass Armonica (Стеклянная гармоника) | base | 15 Science × alliances × age + 15 Happiness × alliances × age — uptime 1 (1.5 with alliance) | 12/11/20/8/8 | 10/10/15/7/7 | 8/8/12/6/6 | +7.5 Science, +7.5 Happiness / +21 Science, +21 Happiness / +36 Science, +36 Happiness |
| Kite & Key (Воздушный змей и ключ) | base | 4% Science — fits: masteries | 2/1/4/1/1 | 2/1/4/1/1 | 2/1/4/1/1 | +2 Science / +8 Science / +18 Science |
| Eagle Banner (Штандарт с орлом) | base | 2 Science × gwScienceShare — uptime 1 (1.5 with great_works) | 0/0/1/0/0 | 1/0/2/0/0 | 1/1/2/1/1 | +0.3 Science / +3.2 Science / +10 Science |
| Great Imperial Crown (Большая императорская корона) | base | 2 Science × towns × age — uptime 0.1 (0.6 with tundra) — fits: towns | 1/0/1/0/0 | 0/0/1/0/0 | 0/0/1/0/0 | +0.6 Science / +2 Science / +3.6 Science |
| Potemkin's Sword-Knot (Темляк Потемкина) | base | commanderUtility × 1 — fits: commanders | 1/0/0/0/2 | 1/0/0/0/2 | 1/0/0/0/2 | — / — / — |
| Globus Cruciger (Держава) | base | 50 Diplomacy × attrPointsOneTree ÷ 100 turns — uptime 0.6 (1.4 with attr_POLITICAL) | 0/1/0/1/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.5 Diplomacy / +0.5 Diplomacy / +0.5 Diplomacy |
| Joyeuse (Жуайез) | base | 1 Happiness × stationedUnits × age — uptime 0.5 (1 with cavalry) | 0/0/0/0/0 | 0/1/0/0/0 | 0/1/0/0/0 | +0.5 Happiness / +1.5 Happiness / +3 Happiness |
| Tencendur (Тенсендур) | base | move × 0.3 — uptime 1 (1.7 with cavalry) | 1/0/0/0/2 | 1/0/0/0/2 | 1/0/0/0/2 | — / — / — |
| Altar Set (Алтарный набор) | base | 1 Culture × specialists — fits: specialists | 5/12/3/3/2 | 5/12/3/3/2 | 5/12/3/3/2 | +5 Culture / +20 Culture / +45 Culture |
| The Analects (Беседы и суждения) | base | 1 Science × specialists — fits: specialists | 4/2/10/2/2 | 4/2/10/2/2 | 4/2/10/2/2 | +5 Science / +20 Science / +45 Science |
| Brush & Scroll (Кисть и свиток) | base | 1 Food × brushScrollFood — fits: specialists | 1/1/1/1/1 | 2/2/2/2/1 | 2/2/2/2/1 | +1.7 Food / +10 Food / +26 Food |
| Agincourt Arrowhead (Наконечник стрелы Азенкура) | base | move × 0.35 — uptime 1 (1.6 with ranged) | 1/0/0/0/3 | 1/0/0/0/3 | 1/0/0/0/3 | — / — / — |
| Antikythera Mechanism (Антикитерский механизм) | base | attribute point (Scientific) × 1 — fits: attr_SCIENTIFIC | 3/2/6/2/2 | 3/2/5/2/2 | 2/1/4/1/1 | — / — / — |
| The Art of War (Искусство войны) | base | commanderXP10 × 2 — fits: commanders | 1/0/0/0/2 | 1/0/0/0/2 | 1/0/0/0/2 | — / — / — |
| Colada & Tizona (Колада и Тисона) | base | combat × 0.6 — fits: war | 2/1/1/1/6 | 2/1/1/1/6 | 2/1/1/1/6 | — / — / — |
| Corpus Juris Civilis (Свод Юстиниана) | base | policySlot × 1 — fits: policies | 12/12/12/12/12 | 10/10/10/10/10 | 9/9/9/9/9 | — / — / — |
| Complaint to Ea-nāsir (Жалобная табличка к Эа-насиру) | base | attribute point (Economic) × 1 — fits: attr_ECONOMIC | 4/3/3/6/3 | 3/2/2/5/2 | 2/2/2/4/2 | — / — / — |
| Equestrian Figure (Фигурка конника) | base | commanderUtility × 0.7 — fits: commanders | 0/0/0/0/1 | 0/0/0/0/1 | 0/0/0/0/1 | — / — / — |
| Royal Game of Ur (Царская игра Ура) | base | 10% Science + 10% Culture — uptime 0.3 (0.3 with behind) | 3/4/4/2/1 | 3/4/4/2/1 | 3/4/4/2/1 | +1.5 Science, +1.2 Culture / +6 Science, +4.8 Culture / +14 Science, +11 Culture |
| Garuda Statue (Статуя Гаруда) | base | pop × 1 × celebrationsPerAge — uptime 1 (1.4 with celebration) | 6/6/6/6/5 | 4/4/4/4/3 | 2/2/2/2/2 | — / — / — |
| Groma (Грома) | base | attribute point (Expansionist) × 1 — fits: attr_EXPANSIONIST | 4/4/4/4/5 | 3/3/3/3/4 | 3/2/2/2/3 | — / — / — |
| Imago Mundi (Образ мира) | base | explore × 0.5 | 1/1/1/1/1 | 0/0/0/0/0 | 0/0/0/0/0 | — / — / — |
| Lydian Lion (Лидийский лев) | base | 200 Gold × age ÷ 100 turns × 1.5 | 4/2/2/8/3 | 3/2/2/6/2 | 2/1/1/4/2 | +3 Gold / +6 Gold / +9 Gold |
| Pochteca Backpack (Вещевой мешок почтеки) | base | tradeRange × 1 — fits: trade | 1/1/1/2/1 | 1/0/0/2/0 | 0/0/0/1/0 | — / — / — |
| Shakōkidogū (Сякокидогу) | base | attribute point (Cultural) × 1 — fits: attr_CULTURAL | 3/6/2/2/2 | 3/5/2/2/2 | 2/4/1/1/1 | — / — / — |
| Shisa Necklace (Ожерелье с фигуркой сиса) | base | 50 Diplomacy × suzerainEvents × age ÷ 100 turns — uptime 1 (1.6 with suzerain) | 1/1/1/1/1 | 1/1/1/1/1 | 0/1/0/1/0 | +1 Diplomacy / +2 Diplomacy / +2.2 Diplomacy |
| Inscribed Sling Bullet (Снаряд для пращи с надписью) | base | attribute point (Militaristic) × 1 — fits: attr_MILITARISTIC | 3/2/2/2/6 | 2/2/2/2/5 | 2/1/1/1/4 | — / — / — |
| Sword of Brennus (Меч Бренна) | base | 400 Gold × returnedSettlements ÷ 100 turns — uptime 0.3 (1 with war) | 0/0/0/1/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.4 Gold / +0.4 Gold / +0.4 Gold |
| The Travels of Marco Polo (Книга чудес света) | base | 50 Gold × explored100 ÷ 100 turns | 2/1/1/4/2 | 1/1/1/2/1 | 0/0/0/0/0 | +1.5 Gold / +2.5 Gold / +0.5 Gold |
| Treaty of Kadesh (Кадешское соглашение) | base | attribute point (Political) × 1 — fits: attr_POLITICAL | 3/3/3/3/3 | 3/3/3/3/3 | 2/2/2/2/2 | — / — / — |
| Krone von Friedrich I (Корона Фридриха I) | base | combat × 0.8 — fits: war, commanders | 3/1/1/1/8 | 3/1/1/1/8 | 3/1/1/1/8 | — / — / — |
| Order of the Black Eagle Badge (Орден Черного орла) | base | 50 Production × attrPointsOneTree ÷ 100 turns — uptime 0.6 (1.4 with attr_MILITARISTIC) | 1/0/0/0/1 | 0/0/0/0/0 | 0/0/0/0/0 | +0.5 Production / +0.5 Production / +0.5 Production |
| Walking Stick (Трость) | base | 1 Science × militaryBuildings × age — fits: military_buildings | 2/1/4/1/1 | 1/1/3/1/1 | 1/1/3/1/1 | +2 Science / +6 Science / +12 Science |
| False Beard (Накладная борода) | base | 2 Culture × wonders — uptime 1 (1.4 with wonders) | 3/8/2/2/2 | 1/3/1/1/1 | 1/2/0/0/0 | +3 Culture / +5 Culture / +6 Culture |
| Royal Mace (Царская булава) | base | 1 Gold × importedResources × age — fits: trade, resources | 1/1/1/3/1 | 2/1/1/4/2 | 3/2/2/5/2 | +1 Gold / +4 Gold / +12 Gold |
| Uraeus (Урей) | base | 10 Culture × wonderCities × age — uptime 1 (1.4 with wonders) | 11/25/6/6/5 | 11/25/6/6/5 | 7/16/4/4/3 | +10 Culture / +40 Culture / +60 Culture |
| Dōtaku (Дотаку) | base | 50 Science × attrPointsOneTree ÷ 100 turns — uptime 0.6 (1.4 with attr_SCIENTIFIC) | 0/0/1/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.5 Science / +0.5 Science / +0.5 Science |
| Golden Seal Stone (Камень с золотой печатью) | base | 1 Diplomacy × scienceBuildings × age — fits: science_buildings | 3/4/3/4/3 | 5/6/5/6/5 | 6/6/5/6/5 | +3 Diplomacy / +12 Diplomacy / +27 Diplomacy |
| Yasakani no Magatama (Ясакани-но магатама) | base | 2 Science × techMasteries × age — fits: masteries, techs | 9/5/20/5/5 | 4/2/10/2/2 | 3/2/7/2/2 | +10 Science / +20 Science / +30 Science |
| Ballestilla (Посох Якова) | base | sight × 0.3 — uptime 1 (2 with naval) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | — / — / — |
| Padrón Real (Падрон-Реал) | base | 2 Happiness × naturalWonderTiles × age — uptime 1 (2 with natural_wonders) | 1/1/1/1/1 | 1/1/1/1/1 | 1/2/1/1/1 | +1 Happiness / +4 Happiness / +9 Happiness |
| Queen's Jewelry (Ювелирные украшения королевы) | base | 2 Gold × naturalWonderTiles × age — uptime 1 (2 with natural_wonders) | 1/1/1/3/1 | 2/1/1/4/2 | 2/1/1/4/2 | +1 Gold / +4 Gold / +9 Gold |
| Hermione Model (Модель фрегата «Гермиона») | base | move × 0.3 — uptime 1 (2 with naval) | 1/0/0/0/2 | 1/0/0/0/2 | 1/0/0/0/2 | — / — / — |
| Letter to Adrienne (Письмо Адриенне) | base | 2 Happiness × policies × age + 1 Happiness × traditions × age — fits: policies, traditions | 4/5/3/3/3 | 4/6/3/3/3 | 4/6/4/4/4 | +5 Happiness / +16 Happiness / +33 Happiness |
| Tricolor Cockade (Трехцветная кокарда) | base | 2 Culture × traditions × age + 2 Happiness × traditions × age — fits: traditions | 4/7/2/2/2 | 4/8/3/3/3 | 4/8/3/3/3 | +2 Culture, +2 Happiness / +8 Culture, +8 Happiness / +18 Culture, +18 Happiness |
| Dell'Arte della Guerra (О военном искусстве) | base | 3 Gold × sanctions × age — uptime 1 (2 with sanctions) | 2/1/1/4/2 | 3/2/2/6/2 | 2/1/1/4/2 | +1.5 Gold / +6 Gold / +9 Gold |
| Discorsi sopra Livio (Рассуждения о первой декаде Тита Ливия) | base | diplomacy × 1 — fits: influence | 2/2/2/2/2 | 2/2/2/2/2 | 2/2/2/2/2 | — / — / — |
| Il Principe (Государь) | base | warDiplomacy × 1 — uptime 0.4 (1 with war) | 0/0/0/0/1 | 0/0/0/0/1 | 0/0/0/0/1 | — / — / — |
| All-T'oqapu Tunic (Туника всех токапу) | base | explore × 0.2 — uptime 0.5 (1 with mountains) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | — / — / — |
| Mascapaycha (Маскапайча) | base | 1 Gold × specialists + 1 Gold × specialists [if mountains: 0.6, else 0.2] — fits: specialists | 8/4/4/15/6 | 12/7/7/24/9 | 12/7/7/24/9 | +6 Gold / +24 Gold / +54 Gold |
| Topayauri (Топаяури) | base | 1 Food × urbanTilesNearMountains × age — uptime 0.4 (1 with mountains) | 0/0/0/0/0 | 1/1/1/1/0 | 0/1/1/1/0 | +0.8 Food / +3.2 Food / +7.2 Food |
| Forget-me-not (Незабудка) | base | 10 Happiness × narrativeEvents × age ÷ 100 turns — uptime 1 (1.5 with narrative) | 1/1/1/1/1 | 0/1/0/0/0 | 0/1/0/0/0 | +1 Happiness / +2 Happiness / +3 Happiness |
| Noli Me Tángere (Не прикасайся ко мне) | base | 1 Science × majorTriumphs × age + 1 Culture × majorTriumphs × age + 1 Gold × majorTriumphs × age | 3/4/3/4/2 | 3/3/3/4/2 | 2/2/2/3/1 | +1 Science, +1 Culture, +1 Gold / +3 Science, +3 Culture, +3 Gold / +4.5 Science, +4.5 Culture, +4.5 Gold |
| Ophthalmoscope (Офтальмоскоп) | base | celebrationTime × 1 — fits: celebration | 2/3/2/2/2 | 2/3/2/2/2 | 2/3/2/2/2 | — / — / — |
| Ankus (Анкус) | base | warSupport × 1 — fits: war | 2/2/2/2/5 | 2/2/2/2/5 | 2/2/2/2/5 | — / — / — |
| Dong Son Drum (Донгшонский барабан) | base | 1 Science × techBoostWar ÷ 100 turns — uptime 0.3 (1.2 with war) | 0/0/1/0/0 | 1/0/1/0/0 | 1/0/1/0/0 | +0.5 Science / +2.4 Science / +6 Science |
| Kiem (Кьем) | base | 2 Science × commanderLevels — uptime 0.7 (1.3 with commanders) | 2/1/6/1/1 | 1/1/3/1/1 | 1/0/2/0/0 | +2.8 Science / +5.6 Science / +8.4 Science |
| Lantern (Фонарь) | base | pop × 1 × espionageSuccesses — uptime 0.5 (1.5 with espionage) | 0/0/0/0/0 | 0/0/0/0/0 | 1/1/1/1/0 | — / — / — |
| Satchel (Наплечная сумка) | base | settlerSafety × 1 — fits: expansion | 1/1/1/1/1 | 0/0/0/0/0 | 0/0/0/0/0 | — / — / — |
| Sidearm (Пистолет) | base | combat × 0.75 — fits: war | 3/1/1/1/8 | 3/1/1/1/8 | 3/1/1/1/8 | — / — / — |
| Golden Sceptre (Золотой скипетр) | base | 3 Gold × conqueredSettlements × age — uptime 0.3 (1 with war) | 1/1/1/2/1 | 1/1/1/3/1 | 1/1/1/2/1 | +0.9 Gold / +2.7 Gold / +5.4 Gold |
| Lotus Blossom (Цветок лотоса) | base | 0.04 Science × goldIncome + 0.04 Culture × goldIncome | 2/3/3/1/1 | 1/2/2/1/1 | 1/2/2/1/1 | +1 Science, +1 Culture / +2.8 Science, +2.8 Culture / +6.4 Science, +6.4 Culture |
| Scythian Battle-Axe (Скифский боевой топор) | base | 1 Gold × commanderXP × age ÷ 100 turns — uptime 0.4 (1 with war) | 0/0/0/1/0 | 1/0/0/1/0 | 1/0/0/1/0 | +0.3 Gold / +1.2 Gold / +2.4 Gold |
| Note G (Заметка G) | ada-lovelace | 0.15 Production × masteryProduction — fits: masteries | 6/5/5/5/8 | 9/8/8/8/12 | 8/7/7/7/11 | +5 Production / +24 Production / +48 Production |
| Piano (Пиано) | ada-lovelace | 4% Culture — fits: masteries, civics | 2/4/1/1/1 | 2/4/1/1/1 | 2/4/1/1/1 | +1.6 Culture / +6.4 Culture / +15 Culture |
| Punch Cards (Перфокарты) | ada-lovelace | 20 Science × scienceBuildingsBuilt × age ÷ 100 turns — fits: science_buildings | 1/0/2/0/0 | 1/0/1/0/0 | 1/0/1/0/0 | +1 Science / +2.8 Science / +5.4 Science |
| Bridle of Bucephalus (Уздечка Буцефала) | alexander | combat × 0.72 — uptime 1 (1.7 with cavalry) | 3/1/1/1/7 | 3/1/1/1/7 | 3/1/1/1/7 | — / — / — |
| Gordian Knot (Гордиев узел) | alexander | settlementCap × 1 + -1 Gold × landUnits × age — fits: expansion | -0/2/2/-8/2 | -4/-1/-1/-15/-2 | -4/-1/-1/-13/-2 | −6 Gold / −20 Gold / −36 Gold |
| The Iliad (Илиада) | alexander | 1 Culture × wondersOutsideCapital × age + 1 Production × wondersOutsideCapital × age — uptime 1 (1.4 with wonders) | 1/2/1/1/1 | 2/3/1/1/2 | 2/2/1/1/2 | +0.5 Culture, +0.5 Production / +3 Culture, +3 Production / +6 Culture, +6 Production |
| Chanda-mahasena (Чанда-махасена) | ashoka-himiko-alt | combat × 0.75 — uptime 0.3 (0.6 with celebration) — fits: war | 1/0/0/0/2 | 1/0/0/0/2 | 1/0/0/0/2 | — / — / — |
| Lion Capital (Львиная капитель) | ashoka-himiko-alt | commanderXP10 × 5 — uptime 0.3 (0.6 with celebration) — fits: commanders | 0/0/0/0/1 | 0/0/0/0/1 | 0/0/0/0/1 | — / — / — |
| Silk Uttariya (Шелковая уттария) | ashoka-himiko-alt | 2 Production × happyCities × age — fits: celebration | 5/4/4/4/6 | 5/4/4/4/7 | 5/4/4/4/7 | +4 Production / +14 Production / +30 Production |
| Davalos Medal (Медаль Давалоса) | bolivar | 1 Happiness × militaryBuildings × age — fits: military_buildings | 1/2/1/1/1 | 2/2/1/1/1 | 2/2/1/1/1 | +2 Happiness / +6 Happiness / +12 Happiness |
| Gold Snuff Box (Золотая табакерка) | bolivar | 20 Food × cities × age — uptime 0.35 (0.6 with alliance) | 12/13/13/13/8 | 13/14/14/14/9 | 10/11/11/11/7 | +21 Food / +70 Food / +147 Food |
| Letter to Jamaica (Письмо на Ямайку) | bolivar | unitPurchase × 1 — uptime 0.4 (0.7 with celebration) — fits: war | 0/0/0/0/1 | 0/0/0/0/1 | 0/0/0/0/1 | — / — / — |
| Brace of Pistols (Пара пистолетов) | edward-teach | combat × 0.3 — uptime 1 (2 with naval) | 1/0/0/0/3 | 1/0/0/0/3 | 1/0/0/0/3 | — / — / — |
| Figurehead of the Queen Anne's Revenge (Носовая фигура «Мести королевы Анны») | edward-teach | 12 Gold × navalKills × age ÷ 100 turns — uptime 0.5 (1.5 with naval) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.1 Gold / +0.5 Gold / +0.7 Gold |
| Medicine Chest (Сундук с лекарствами) | edward-teach | heal × 0.3 — uptime 1 (2 with naval) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | — / — / — |
| Juelles of Golde (Золотые украшения) | elizabeth | 1 Gold × greatWorks × age — uptime 1 (1.5 with great_works) | 1/1/1/3/1 | 4/2/2/8/3 | 5/3/3/11/4 | +1 Gold / +8 Gold / +24 Gold |
| Mask of Youth (Маска юности) | elizabeth | 1 Diplomacy × continents × age — fits: expansion | 1/1/1/1/1 | 2/2/2/2/2 | 2/2/2/2/2 | +1 Diplomacy / +5 Diplomacy / +9 Diplomacy |
| The Annals (Анналы) | elizabeth | gwSlot × 1 × goldBuildings — fits: great_works, gold_buildings | 1/1/1/0/0 | 2/5/1/1/0 | 2/6/1/1/1 | — / — / — |
| Anti-Machiavel (Анти-Макиавелли) | friedrich-xerxes-alt | warSupport × 1 — fits: war | 2/2/2/2/5 | 2/2/2/2/5 | 2/2/2/2/5 | — / — / — |
| Flute (Флейта) | friedrich-xerxes-alt | 1 Culture × militaryBuildings × age — fits: military_buildings | 2/5/1/1/1 | 2/4/1/1/1 | 1/3/1/1/1 | +2 Culture / +6 Culture / +12 Culture |
| Voltaire's Edits (Правки Вольтера) | friedrich-xerxes-alt | 50 Culture × attrPointsOneTree ÷ 100 turns — uptime 0.6 (1.4 with attr_CULTURAL) | 0/1/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.5 Culture / +0.5 Culture / +0.5 Culture |
| Paiza (Пайцза) | genghis-khan | 1 Gold × cavalryUnits — uptime 0.6 (1.5 with cavalry) | 2/1/1/3/1 | 1/0/0/2/1 | 0/0/0/1/0 | +1.2 Gold / +1.8 Gold / +1.8 Gold |
| Saddle (Седло) | genghis-khan | 1 Food × stationedUnits × age — uptime 0.5 (1 with cavalry) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | +0.5 Food / +1.5 Food / +3 Food |
| Sulde (Сульде) | genghis-khan | 1 Culture × stationedUnits × age — uptime 0.5 (1 with cavalry) | 1/1/0/0/0 | 0/1/0/0/0 | 0/1/0/0/0 | +0.5 Culture / +1.5 Culture / +3 Culture |
| Magic Plant (Волшебное растение) | gilgamesh | diplomacy × 0.5 | 1/1/1/1/1 | 1/1/1/1/1 | 1/1/1/1/1 | — / — / — |
| Mikku (Микку) | gilgamesh | 1 Diplomacy × settlements — uptime 0.35 (0.6 with alliance) | 2/3/2/3/2 | 2/2/1/2/1 | 1/1/1/1/1 | +2.1 Diplomacy / +3.5 Diplomacy / +4.5 Diplomacy |
| Pukku (Пукку) | gilgamesh | 2 Happiness × settlements — uptime 0.35 (0.6 with alliance) | 3/4/3/3/3 | 2/2/2/2/2 | 1/2/1/1/1 | +4.2 Happiness / +7 Happiness / +9.1 Happiness |
| Kusanagi no Tsurugi (Кусанаги-но цуруги) | ashoka-himiko-alt | 3 Culture × happinessBuildings × age + -1 Science × happinessBuildings × age — fits: happiness_buildings | 7/21/-0/4/3 | 7/21/-0/4/3 | 6/18/-1/3/2 | +9 Culture, −3 Science / +36 Culture, −12 Science / +72 Culture, −24 Science |
| Sakaki Branch (Ветка сакаки) | ashoka-himiko-alt | 0.25 Production × productionHappinessBuildings ÷ 100 turns — fits: happiness_buildings | 1/1/1/1/1 | 1/1/1/1/1 | 0/1/0/0/0 | +0.8 Production / +2.2 Production / +3.8 Production |
| Yata no Kagami (Ята-но кагами) | ashoka-himiko-alt | 20 Culture × celebrationsPerAge × age ÷ 100 turns — uptime 1 (1.4 with celebration) | 1/2/0/0/0 | 0/1/0/0/0 | 0/1/0/0/0 | +0.6 Culture / +1.6 Culture / +2.4 Culture |
| Baadal's Reins (Поводья Бадаля) | lakshmibai | 1 Diplomacy × pastures × age — uptime 0.7 (1.5 with pastures) | 1/1/1/1/1 | 1/1/1/1/1 | 1/1/1/1/1 | +0.7 Diplomacy / +2.8 Diplomacy / +4.2 Diplomacy |
| Dhal (Дхал) | lakshmibai | combat × 0.7 — fits: war | 3/1/1/1/7 | 3/1/1/1/7 | 3/1/1/1/7 | — / — / — |
| Flag of Jhansi (Флаг Джханси) | lakshmibai | 2 Diplomacy × commanderLevels — uptime 0.7 (1.3 with commanders) | 3/3/3/3/3 | 2/3/2/3/2 | 2/2/2/2/2 | +2.8 Diplomacy / +5.6 Diplomacy / +8.4 Diplomacy |
| Crown of Napoleon (Корона Наполеона) | napoleon | 200 Gold × warsDeclaredOnYou × age ÷ 100 turns | 1/1/1/3/1 | 1/1/1/2/1 | 1/0/0/2/1 | +1 Gold / +2.4 Gold / +3.6 Gold |
| Green Colonel's Jacket (Зеленая полковничья шинель) | napoleon | 1.4 Gold × tradeRoutes × age — uptime 1 (1.4 with trade) | 2/1/1/4/1 | 4/2/2/8/3 | 4/2/2/8/3 | +1.4 Gold / +8.4 Gold / +17 Gold |
| Portrait of Josephine (Портрет Жозефины) | napoleon | 2 Gold × unfriendlyLeaders × age — fits: war, sanctions | 2/1/1/5/2 | 3/2/2/6/2 | 3/2/2/5/2 | +2 Gold / +6 Gold / +12 Gold |
| Artilleryman's Gloves (Перчатки артиллериста) | napoleon-alt | 2 Culture × commanderLevels — uptime 0.7 (1.3 with commanders) | 3/7/2/2/1 | 1/4/1/1/1 | 1/2/1/1/0 | +2.8 Culture / +5.6 Culture / +8.4 Culture |
| Bicorne Hat (Треуголка) | napoleon-alt | move × 0.4 — uptime 1 (1.6 with infantry) | 1/0/0/0/3 | 1/0/0/0/3 | 1/0/0/0/3 | — / — / — |
| Legion d'honneur Grand Eagle and Cross (Большой орел и Большой крест Почетного легиона) | napoleon-alt | heal × 1 — fits: commanders, war | 0/0/0/0/1 | 0/0/0/0/1 | 0/0/0/0/1 | — / — / — |
| Gazelle Vase (Ваза с газелями) | sayyida-al-hurra | 25 Culture × diploActionsAccepted × age ÷ 100 turns — fits: endeavors, influence | 1/2/0/0/0 | 1/2/0/0/0 | 0/1/0/0/0 | +0.8 Culture / +2.5 Culture / +4.5 Culture |
| Mithqāl (Мискаль) | sayyida-al-hurra | 2 Gold × navalStationedSettlements × age — uptime 0.6 (1.5 with naval) | 1/0/0/2/1 | 2/1/1/4/1 | 2/1/1/3/1 | +0.6 Gold / +3.6 Gold / +7.2 Gold |
| Nimcha (Нимча) | sayyida-al-hurra | 1 Gold × navalUnits — uptime 0.6 (1.5 with naval) | 1/0/0/2/1 | 1/0/0/2/1 | 0/0/0/1/0 | +0.6 Gold / +1.8 Gold / +1.8 Gold |
| Poteskwate (Потесквате) | shawnee-tecumseh | 1 Food × townsXsuzerains × age — uptime 1 (1.6 with suzerain) — fits: towns | 2/2/2/2/1 | 3/3/3/3/2 | 2/3/3/3/2 | +3 Food / +15 Food / +36 Food |
| Wampum Belt (Пояс с вампумом) | shawnee-tecumseh | 1 Production × citiesXsuzerains × age — uptime 1 (1.6 with suzerain) | 3/3/3/3/5 | 5/5/5/5/8 | 7/6/6/6/10 | +3 Production / +15 Production / +42 Production |
| Warclub (Боевая дубинка) | shawnee-tecumseh | combat × 0.4 × suzerains — uptime 1 (1.6 with suzerain) — fits: infantry | 1/1/1/1/4 | 2/1/1/1/6 | 3/1/1/1/8 | — / — / — |
| Honebami (Хонэбами) | toyotomi-hideyoshi | move × 0.3 — fits: war | 1/0/0/0/2 | 1/0/0/0/2 | 1/0/0/0/2 | — / — / — |
| Kabuto (Кабуто) | toyotomi-hideyoshi | 3 Diplomacy × age | 3/4/3/4/3 | 3/3/2/3/2 | 2/2/2/2/2 | +3 Diplomacy / +6 Diplomacy / +9 Diplomacy |
| Tea Ceremony Kit (Набор для чайной церемонии) | toyotomi-hideyoshi | 0.2 Production × productionCultureBuildings ÷ 100 turns | 0/1/0/0/0 | 0/1/0/0/0 | 0/1/0/0/0 | +0.4 Production / +1.4 Production / +2.4 Production |
| Bastille Key (Ключ от Бастилии) | washington | 1 Food × citiesXtraditions + 1 Happiness × citiesXtraditions — fits: traditions | 4/5/4/4/3 | 4/6/4/4/3 | 4/5/4/4/3 | +3 Food, +3 Happiness / +10 Food, +10 Happiness / +21 Food, +21 Happiness |
| Circumferentor (Геодезический компас) | washington | pop × 1 × settlersTrained — fits: expansion | 6/6/6/6/5 | 3/3/3/3/3 | 1/1/1/1/0 | — / — / — |
| Constitution (Конституция) | washington | 1 Diplomacy × citiesXtraditions — fits: traditions | 3/4/3/4/3 | 4/5/4/5/4 | 5/5/4/5/4 | +3 Diplomacy / +10 Diplomacy / +21 Diplomacy |
| Chalcedony Seal (Халцедоновая печать) | friedrich-xerxes-alt | 1 Culture × uniqueConstructibles + 1 Gold × uniqueConstructibles — uptime 1 (1.6 with unique_improvements) | 7/10/4/10/4 | 4/5/2/6/3 | 2/3/1/4/2 | +3 Culture, +3 Gold / +5 Culture, +5 Gold / +7 Culture, +7 Gold |
| Gold Fluted Phiale (Золотая ребристая фиала) | friedrich-xerxes-alt | tradeCapacity × 1 — fits: trade | 4/3/3/8/3 | 4/3/3/8/3 | 3/2/2/6/2 | — / — / — |
| Incense Censer (Кадильница для благовоний) | friedrich-xerxes-alt | 2 Culture × tradeRoutes × age — uptime 1 (1.5 with trade) | 2/5/1/1/1 | 3/8/2/2/2 | 3/6/2/2/1 | +2 Culture / +12 Culture / +24 Culture |
| Geobukseon Blueprint (Чертеж кобуксона) | yi-sun-sin | combat × 0.3 — uptime 1 (2 with naval) | 1/0/0/0/3 | 1/0/0/0/3 | 1/0/0/0/3 | — / — / — |
| Janggeom (Чангом) | yi-sun-sin | commanderXP10 × 2 — uptime 0.3 (1 with naval) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | — / — / — |
| Nanjung Ilgi (Военный дневник Ли Сунсина) | yi-sun-sin | 0.2 Production × productionScienceBuildings ÷ 100 turns — fits: science_buildings | 1/0/1/0/0 | 1/0/1/0/0 | 0/0/1/0/0 | +0.6 Production / +1.8 Production / +3 Production |

## Appendix C. Leaders: preferred victory per age, attributes, tags (generated)

| Leader | Source | Victory AQ / EX / MO | Attributes | Tags from the ability text |
|---|---|---|---|---|
| Ada Lovelace (Ада Лавлейс) | ada-lovelace | SCIENCE / SCIENCE / CULTURE | Cultural, Scientific | civics, culture, masteries, science, techs |
| Alexander (Александр) | alexander | MILITARY,CULTURE / MILITARY,CULTURE / MILITARY,CULTURE | Militaristic, Cultural | culture, production, towns, war, wonders |
| Amina (Амина) | base | ECONOMIC / ECONOMIC / ECONOMIC | Economic, Militaristic | desert, gold, resources |
| Ashoka, World Renouncer (Ашока, Отрекшийся от мира) | base | CULTURE / CULTURE / CULTURE | Political, Expansionist | celebration, food, happiness |
| Ashoka, World Conqueror (Ашока, Завоеватель мира) | ashoka-himiko-alt | MILITARY / CULTURE / MILITARY | Political, Militaristic | celebration, happiness, production, war |
| Augustus (Август) | base | MILITARY / MILITARY / CULTURE | Cultural, Expansionist | culture, gold, production, towns |
| Benjamin Franklin (Бенджамин Франклин) | base | SCIENCE / SCIENCE / SCIENCE | Political, Scientific | endeavors, production, science, science_buildings |
| Simón Bolívar (Симон Боливар) | bolivar | MILITARY / ECONOMIC / MILITARY | Expansionist, Militaristic | war |
| Catherine the Great (Екатерина II) | base | CULTURE / SCIENCE / SCIENCE | Cultural, Scientific | culture, great_works, science, tundra, wonders |
| Charlemagne (Карл Великий) | base | SCIENCE / CULTURE / MILITARY | Militaristic, Scientific | cavalry, celebration, happiness, military_buildings, science, science_buildings |
| Confucius (Конфуций) | base | SCIENCE / SCIENCE / SCIENCE | Expansionist, Scientific | food, science, specialists |
| Edward Teach (Эдвард Тич) | edward-teach | ECONOMIC / ECONOMIC / ECONOMIC | Economic, Militaristic | gold, naval, trade, war |
| Elizabeth (Елизавета) | elizabeth | CULTURE / CULTURE / CULTURE | Cultural, Economic | expansion, great_works, naval, trade |
| Friedrich, Oblique (Фридрих, Хитрец) | base | MILITARY / MILITARY / MILITARY | Militaristic, Scientific | commanders, infantry, masteries, science, science_buildings, techs |
| Friedrich, Baroque (Фридрих Барочный) | friedrich-xerxes-alt | MILITARY / SCIENCE / CULTURE | Cultural, Militaristic | civics, culture, great_works, infantry, masteries, war |
| Genghis Khan (Чингисхан) | genghis-khan | MILITARY / MILITARY / MILITARY | Expansionist, Militaristic | cavalry, commanders, war |
| Gilgamesh (Гильгамеш) | gilgamesh | MILITARY / MILITARY / MILITARY | Political, Militaristic | alliance, endeavors, influence, war |
| Harriet Tubman (Гарриет Табмен) | base | MILITARY / MILITARY / MILITARY | Political, Militaristic | espionage, expansion, influence, war |
| Hatshepsut (Хатшепсут) | base | CULTURE / ECONOMIC / CULTURE | Cultural, Economic | culture, production, resources, rivers, wonders |
| Himiko, Queen of Wa (Химико, Королева народов Ва) | base | SCIENCE / CULTURE / SCIENCE | Political, Scientific | alliance, endeavors, influence, science |
| Himiko, High Shaman (Химико, Верховная шаманка) | ashoka-himiko-alt | CULTURE / SCIENCE / CULTURE | Political, Cultural | celebration, culture, happiness, influence, production, science |
| Ibn Battuta (Ибн Баттута) | base | — / — / — | Expansionist | attributes, civics, endeavors |
| Isabella (Изабелла) | base | ECONOMIC / ECONOMIC / ECONOMIC | Economic, Expansionist | gold, natural_wonders, naval |
| José Rizal (Хосе Рисаль) | base | CULTURE / CULTURE / CULTURE | Cultural, Political | celebration, culture, gold, happiness, influence, narrative |
| Lafayette (Лафайет) | base | CULTURE / MILITARY / CULTURE | Cultural, Political | culture, endeavors, happiness, policies, traditions |
| Lakshmibai (Лакшми Баи) | lakshmibai | MILITARY / MILITARY / CULTURE | Political, Militaristic | influence, suzerain |
| Machiavelli (Макиавелли) | base | ECONOMIC / ECONOMIC / ECONOMIC | Political, Economic | gold, influence, suzerain, war |
| Napoleon, Emperor (Наполеон Император) | napoleon | MILITARY / SCIENCE / ECONOMIC | Political, Economic | culture, gold, influence, sanctions |
| Napoleon, Revolutionary (Наполеон Революционер) | napoleon-alt | MILITARY / MILITARY / MILITARY | Cultural, Militaristic | cavalry, commanders, culture, infantry, ranged, war |
| Pachacuti (Пачакутек) | base | ECONOMIC / CULTURE / ECONOMIC | Economic, Expansionist | food, happiness, mountains, production, specialists |
| Sayyida al Hurra (Саида аль-Хурра) | sayyida-al-hurra | MILITARY / MILITARY / MILITARY | Political, Militaristic | culture, espionage, influence, naval |
| Tecumseh (Текумсе) | shawnee-tecumseh | MILITARY / MILITARY / MILITARY | Political, Militaristic | food, infantry, production, ranged, suzerain, towns |
| Toyotomi Hideyoshi (Тоётоми Хидэёси) | toyotomi-hideyoshi | MILITARY / MILITARY / CULTURE | Cultural, Militaristic | culture, production, war, wonders |
| Trung Trac (Чынг Чак) | base | MILITARY / SCIENCE / MILITARY | Militaristic, Scientific | commanders, science, war |
| George Washington (Джордж Вашингтон) | washington | CULTURE / CULTURE / CULTURE | Political, Expansionist | celebration, expansion, food, happiness, policies, towns, traditions |
| Xerxes, King of Kings (Ксеркс, Царь царей) | base | MILITARY / MILITARY / MILITARY | Economic, Militaristic | culture, expansion, gold, war |
| Xerxes, the Achaemenid (Ксеркс Ахеменид) | friedrich-xerxes-alt | ECONOMIC / ECONOMIC / ECONOMIC | Economic, Cultural | culture, gold, trade |
| Yi Sun-sin (Ли Сунсин) | yi-sun-sin | SCIENCE / MILITARY / SCIENCE | Militaristic, Scientific | commanders, gold, naval, science, science_buildings |

## Appendix D. Civilizations: age, attributes, tags (generated)

| Civilization | Age | Source | Attributes | Tags from the ability, uniques and unit classes |
|---|---|---|---|---|
| Aksum (Аксум) | AQ | base | Cultural, Economic | coast, culture, gold, naval, production, resources, trade, unique_improvements, wonders |
| Assyria (Ассирия) | AQ | assyria | Militaristic, Scientific | cavalry, commanders, great_works, happiness, military_buildings, production, quarters, science, science_buildings, techs, unique_quarter |
| Babylon (Вавилон) | AQ | babylon | Cultural, Expansionist | culture, expansion, food, production, ranged, rivers, trade, unique_improvements, wonders |
| Carthage (Карфаген) | AQ | carthage | Economic, Militaristic | cavalry, coast, expansion, gold, gold_buildings, production, quarters, resources, towns, trade, unique_quarter |
| Egypt (Египет) | AQ | base | Cultural, Economic | culture, gold, gold_buildings, infantry, production, quarters, rivers, unique_quarter, wonders |
| Gauls (Галлы) | AQ | gaul | Economic, Expansionist | culture, expansion, gold, happiness, happiness_buildings, infantry, military_buildings, production, quarters, towns, unique_quarter |
| Greece (Греция) | AQ | base | Cultural, Political | culture, endeavors, gold, happiness, happiness_buildings, infantry, influence, production, quarters, sanctions, suzerain, unique_quarter |
| Han (Хань) | AQ | base | Political, Scientific | culture, expansion, happiness, military_buildings, production, ranged, science, science_buildings, towns, unique_improvements |
| Heian Japan (Япония Хэйан) | AQ | heian | Cultural, Political | culture, happiness, production, ranged, unique_improvements |
| Khmer (Кхмеры) | AQ | base | Expansionist, Scientific | cavalry, food, happiness, production, rivers, trade, unique_improvements |
| Maurya (Маурьи) | AQ | base | Militaristic, Scientific | cavalry, celebration, expansion, happiness, happiness_buildings, production, quarters, science, science_buildings, unique_quarter |
| Maya (Майя) | AQ | base | Cultural, Scientific | civics, culture, happiness, happiness_buildings, production, quarters, ranged, science, science_buildings, techs, unique_quarter |
| Mississippian (Миссисипи) | AQ | base | Economic, Expansionist | food, gold, production, ranged, resources, trade, unique_improvements |
| Achaemenid Persia (Персия Ахеменидов) | AQ | base | Economic, Militaristic | commanders, culture, gold, infantry, production, unique_improvements |
| Rome (Рим) | AQ | base | Cultural, Militaristic | commanders, culture, expansion, happiness, happiness_buildings, infantry, influence, production, quarters, towns, traditions, unique_quarter |
| Silla (Силла) | AQ | silla | Economic, Political | alliance, cavalry, culture, gold, happiness, happiness_buildings, influence, production, quarters, ranged, resources, trade, unique_quarter |
| Tonga (Тонга) | AQ | tonga | Economic, Political | coast, culture, happiness, happiness_buildings, influence, naval, production, quarters, suzerain, trade, unique_quarter |
| Abbasid (Аббасиды) | EX | base | Expansionist, Scientific | cavalry, gold, happiness, happiness_buildings, production, quarters, science, science_buildings, specialists, unique_quarter |
| Bulgaria (Болгария) | EX | bulgaria | Expansionist, Militaristic | cavalry, commanders, culture, military_buildings, mountains, production, unique_improvements |
| Chola (Чола) | EX | base | Economic, Political | coast, gold, happiness, happiness_buildings, influence, military_buildings, naval, production, quarters, ranged, resources, trade, unique_quarter |
| Đại Việt (Дайвьет) | EX | dai-viet | Cultural, Expansionist | culture, expansion, food, happiness, military_buildings, production, ranged, rivers, unique_improvements, wonders |
| England (Англия) | EX | england | Cultural, Economic | culture, gold, gold_buildings, great_works, production, quarters, ranged, towns, trade, unique_quarter |
| Goryeo (Корё) | EX | goryeo | Cultural, Political | cavalry, culture, endeavors, influence, production, towns, unique_improvements |
| Hawai'i (Гавайи) | EX | base | Cultural, Expansionist | culture, food, happiness, infantry, production, unique_improvements |
| Iceland (Исландия) | EX | iceland | Cultural, Militaristic | civics, culture, gold, great_works, happiness, masteries, natural_wonders, naval, production, ranged, tundra, unique_improvements |
| Inca (Инки) | EX | base | Economic, Expansionist | civics, food, gold, mountains, production, ranged, rivers, unique_improvements |
| Majapahit (Маджапахит) | EX | base | Cultural, Expansionist | coast, culture, gold, great_works, happiness, happiness_buildings, natural_wonders, naval, production, quarters, ranged, specialists, towns, unique_quarter |
| Ming (Мин) | EX | base | Economic, Scientific | culture, infantry, military_buildings, policies, production, ranged, science, trade, traditions, unique_improvements |
| Mongolia (Монголия) | EX | base | Expansionist, Militaristic | cavalry, commanders, expansion, gold, production, ranged, rivers, unique_improvements, war |
| Norman (Норманны) | EX | base | Militaristic, Political | cavalry, coast, culture, expansion, happiness, happiness_buildings, military_buildings, production, quarters, unique_quarter |
| Republic of Pirates (Республика Пиратов) | EX | pirate-republic | Economic, Militaristic | coast, expansion, gold, gold_buildings, naval, production, quarters, resources, unique_quarter, war |
| Sengoku Japan (Япония Сэнгоку) | EX | sengoku | Militaristic, Political | commanders, culture, food, happiness, infantry, influence, mountains, production, resources, science, science_buildings, unique_improvements |
| Shawnee (Шони) | EX | shawnee-tecumseh | Economic, Political | food, gold, infantry, production, resources, rivers, suzerain, unique_improvements |
| Songhai (Сонгай) | EX | base | Economic, Militaristic | civics, desert, gold, infantry, production, resources, rivers, trade, unique_improvements |
| Spain (Испания) | EX | base | Economic, Militaristic | coast, culture, food, gold, gold_buildings, infantry, production, quarters, towns, unique_quarter |
| America (Америка) | MO | base | Economic, Political | gold, infantry, production, quarters, resources, unique_quarter |
| Buganda (Буганда) | MO | base | Cultural, Expansionist | commanders, culture, food, happiness, infantry, production, unique_improvements |
| French Empire (Французская империя) | MO | base | Cultural, Political | celebration, culture, happiness, happiness_buildings, infantry, production, quarters, unique_quarter |
| Great Britain (Великобритания) | MO | great-britain | Economic, Scientific | coast, gold, gold_buildings, naval, production, quarters, science, towns, unique_quarter |
| Joseon (Чосон) | MO | joseon | Cultural, Expansionist | commanders, culture, naval, production, quarters, ranged, science, science_buildings, specialists, towns, unique_quarter |
| Meiji Japan (Япония эпохи Мэйдзи) | MO | base | Militaristic, Scientific | gold, gold_buildings, naval, production, quarters, resources, science, unique_quarter |
| Mexico (Мексика) | MO | base | Cultural, Political | celebration, culture, happiness, happiness_buildings, infantry, production, quarters, traditions, unique_quarter |
| Mughal (Великие Моголы) | MO | base | Economic, Expansionist | expansion, food, gold, infantry, production, unique_improvements, wonders |
| Nepal (Непал) | MO | nepal | Cultural, Political | culture, gold, happiness, infantry, mountains, production, unique_improvements |
| Ottomans (Османы) | MO | ottomans | Cultural, Militaristic | culture, gold, great_works, happiness, happiness_buildings, infantry, naval, production, quarters, specialists, unique_quarter |
| Prussia (Пруссия) | MO | base | Militaristic, Political | cavalry, gold, production, trade, war |
| Qajar (Каджары) | MO | qajar | Expansionist, Political | cavalry, celebration, commanders, culture, expansion, food, happiness, happiness_buildings, influence, production, quarters, unique_quarter |
| Qing (Цин) | MO | base | Economic, Expansionist | culture, gold, gold_buildings, infantry, influence, mountains, production, quarters, resources, science, science_buildings, trade, unique_quarter |
| Russia (Россия) | MO | base | Cultural, Scientific | cavalry, culture, food, production, quarters, science, towns, tundra, unique_improvements |
| Siam (Сиам) | MO | base | Cultural, Political | cavalry, culture, happiness, influence, production, ranged, rivers, suzerain, unique_improvements |
