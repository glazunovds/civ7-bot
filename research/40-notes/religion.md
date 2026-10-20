# Religion: what the autopilot misses (research/40 notes)

2026-10-20. Read-only audit. `G` = `D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules`, `M` = `mod/expansion-planner/ui`.
Logs = `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs` (the game played today, game 41: Rome, the religious crisis in Exploration).

## 0. Summary

- Beliefs are picked in table order. The pantheon is the first one free, and the 4 beliefs of game 41 were the first rows of each class: Icons, Interfaith Dialogue, Conversion, Stewardship. Policy Yield Previews (PYP) gives the belief modifiers no value.
- We never train or use a Missionary. Our own settlements do **not** follow our religion by themselves (only the Holy City does). So the "own settlement" halves of the founder beliefs, the relic beliefs that pay for our own settlements, and the Distant Lands military bonus are all left unused.
- In game 41 rivals converted 4 of our 5 settlements during the **religious crisis**. In that crisis an unhappy settlement that follows another player's religion can **revolt and defect to that religion's founder**.
- **The toxic effect** is the Exploration crisis policy **Ius Reformandi** («Право на реформу»): when a settlement **we own** is converted to our religion, we gain a Migrant and **3 buildings there are Damaged**. Our autopilot **slotted it in game 41** (UI.log 03:55:11, valued "?"). It does no harm only because we convert nothing.
- The upside is large and cheap. A Missionary costs 150 production and has 3 charges, and converting a settlement that has no religion yet takes 1 charge. Converting our own settlements gives +4 Production each (Chesed), +6 Food each (Feed the World), or 1–2 relics each (Akhlaq, Sukha). It also protects against the crisis revolt, and the founder bonus carries into Modern as a legacy card.

## 1. How religion works (1.5.0.44 data)

### Founding and belief classes
- **Antiquity: pantheon.** Mysticism unlocks it. It acts only through the Altar. The `BeliefModifiers` rows "do not have any effects on the game for human players": `G\age-antiquity\data\religion.xml:47`. The real effect is the Altar's `RequiresActivation` adjacency and warehouse rows (`:91-168`). There are 18 pantheons (`:28-45`); their text is in `age-antiquity\text\en_us\ReligionText.xml:10-116`.
- **Exploration: religion.**
  - Piety unlocks the Temple: `progression-trees-culture-common.xml:67`. The Temple costs 200, gives +6 Happiness, costs 3 Gold upkeep, has 1 relic slot, is `AllowsHolyCity` and `Town="True"` (`age-exploration\data\constructibles.xml:105,164,460,531`; slot at `greatworks.xml:810`).
  - The first Temple founds the religion.
- **Belief classes** (`age-exploration\data\religion.xml:65-69`):

| Class | Max | How you get it |
|---|---|---|
| RELIQUARY | 1 | on founding (AdoptionOrder 1) |
| FOUNDER | 3 | 1 on founding. More from Theology (`MOD_REFORMATION_BELIEF`, `progression-trees-culture-common.xml:123`, gameeffects `:8`) and two stories (`narrative-stories-gameeffects.xml:1930,2779` EFFECT_ADD_BELIEF) |
| ENHANCER | 1 | AdoptionOrder 3 |

- **Theology** is revealed only once we have founded a religion (`progression-trees-culture-common.xml:184`). Besides the belief it gives the Evangelism policy (+1 Missionary charge, +1 civilian movement: `CultureText.xml:238`) and a free relic (`MOD_EX_RELIC`, `:124`).

### Every belief (`religion.xml:72-171`, text `age-exploration\text\en_us\ReligionText.xml:190-322`)

**Enhancer**

| Belief | Effect |
|---|---|
| 1 Conversion | New towns in Distant Lands start with our religion |
| 2 Stella Maris | +2 embarked Missionary movement; +1 naval/embarked movement |
| 3 Defender of the Faith | +5 combat strength in friendly settlements following |
| 4 Millenarianism | Conquered settlements are converted |
| 5 Dawah | A trade route converts its target |
| 6 Zeal | Missionaries +1 charge |
| 7 Scripture | +10% Missionary production per relic |
| 8 Sanctum | +1 relic slot in Temples in cities |
| 31 Divine Inspiration | 2 free Missionaries per wonder (shareable) |
| 32 Crusade | +1 War Support against religion founders |
| E9 Parampara | +1 relic slot in science buildings in cities |
| E10 Inter Caetera | Treasure convoys +1 movement, +5 defence |

**Reliquary** (relics on the *first-time* conversion of a settlement)

| Belief | Relics for converting… |
|---|---|
| 9 Icons | 2: a city-state |
| 10 Brahmanism | 2: another civ's capital |
| 11 Reliquaries | 1: another civ's settlement with a Temple or Altar |
| 12 Apostolism | 2: another civ's settlement with a wonder |
| 13 Evangelism | 1: another civ's Distant Lands settlement |
| 14 Charoen | 2: a settlement making treasure convoys |
| 15 Lay Followers | 1: one with 10 rural population |
| 16 Ecclesiasticism | 1: one with 10 urban population |
| 29 Anitya | 2: a Holy City (shareable) |
| **33 Akhlaq** | **1: one of OUR cities** |
| **34 Sukha** | **2: any settlement with ≥3 specialists** (ours too) |
| **35 Barakah** | **2: any settlement with a natural wonder** (ours too) |

**Founder** (`EFFECT_ADD_RELIGIOUS_BELIEF_YIELD`, `religion-gameeffects.xml:239-318`)

| Belief | Effect |
|---|---|
| 17 Interfaith Dialogue | +4 Science per foreign settlement following, +1 per own |
| 18 Stewardship | +8 Culture, Gold and Science per natural-wonder tile in foreign followers |
| 19 Shrines of the Kami | +4 Culture, Gold and Science per wonder in foreign followers |
| 20 Tithe | Gold: 4 per foreign, 1 per own |
| 21 Holy Ecumene | Culture: 4 per foreign, 1 per own |
| 22–28 | +1/+2 per biome tile in foreign followers |
| 25 Vipassana | Happiness: 4 per foreign, 1 per own |
| 30 Covenant | +3 Science, Culture, Happiness, Influence and Gold on the Holy City's Temple; moves to the Palace in Modern (shareable) |
| F13 Tikkun Olam | Influence: 2 per foreign, 1 per own |
| F14 Pushkaram | Influence per river tile in foreign followers |
| **F15 Feed the World** | **+6 Food in each OWN settlement following** |
| **F16 Chesed** | **+4 Production in each OWN settlement following** |
| F17 Salat | Every building gets +1 Happiness adjacency from the Temple |

- Covenant needs no conversion at all. Feed the World, Chesed and the "+1 per own" halves pay only for **our own** settlements that follow our religion.

### Conversion rules
- **Charges** (`base-standard\text\en_us\Civilopedia_Concepts_Text.xml:1655`): 2 to convert a settlement. Only **1** when it has no rural population or is converted for the first time.
- **Following:** a settlement follows a religion only when its **urban** and **rural** flags match (`:1665, :2206`). An unconverted settlement is converted at once from anywhere inside its borders; an already-converted one needs Spread Religion on both an urban district and a rural tile.
- **Independents** cannot adopt a religion until they become City-States (`:1665`).
- **Holy City:** it follows at founding. Game_Religion.csv shows `9, 0, Change Urban Religion, RELIGION_BUDDHISM` on the founding turn.
- **Own settlements do not follow by themselves.** In game 41 only the Holy City was ever Buddhist; see §6.

### The toxic effect, quoted (`G\age-exploration\data\traditions-gameeffects.xml:664-680`)

```xml
<Modifier id="IUS_REFORMANDI_MOD_PILLAGE" collection="COLLECTION_CITIES_FOLLOWING_OWNER_RELIGION" effect="EFFECT_CITY_DAMAGE_CONSTRUCTIBLES" new-only="true">
  <SubjectRequirements><Requirement type="REQUIREMENT_PLOT_IS_OWNER"></Requirement></SubjectRequirements>
  <Argument name="Amount">3</Argument>
  <Argument name="DamageType">UNHAPPINESS</Argument>
</Modifier>
```

- **Its text** (`age-exploration\text\en_us\CultureText.xml`, LOC_TRADITION_IUS_REFORMANDI_DESCRIPTION): "When you convert a Settlement you own, gain a Migrant and Damage 3 Buildings in that Settlement".
- **What it is:** a **crisis** policy (`traditions.xml:137`, `IsCrisis`). The religious crisis's 3rd stage unlocks it (`narrative-crises-stories-gameeffects.xml:243`).
- **How it fires:** on a settlement **we own** that newly follows our religion, so the damage lands in **our** city. A foreign city converted by us is not damaged. The user's memory is close, but the target is our own settlement.

**Other religious crisis cards and effects** (`traditions-gameeffects.xml:569-662`; unlocks at `narrative-crises-stories-gameeffects.xml:212-246`)

| Card | Effect |
|---|---|
| Religious Tolerance | +8 Happiness where a settlement does not follow our religion; −2 charges on new Missionaries |
| Religious Zeal | −8 Happiness there; +2 charges |
| Schism | +50% to the Convert Settlement espionage action; −4 Happiness in Homelands settlements |
| Jizya | +4 Gold in non-followers; −4 Happiness in Distant Lands settlements |
| Bhanaka | +1 Missionary movement in our territory |
| **Liturgical Disputes** (`:653`) | **−4 Happiness in every settlement following our religion** |
| Religious Tax Exemptions (`:446`) | −2 Gold per displayed relic |

- **The crisis's own rule:** **ERC002C / ERC001D** (`narrative-crises-stories-gameeffects.xml:248-271`) put `ReligiousRevolt` / `CityRioting` on our non-capital settlements below zero Happiness that follow **another** religion.
- **What that does:** "Unhappy settlements that follow another civilization's religion can go into Unrest or even Revolt and defect to the Founder of that Religion" (`base-standard\text\en_us\Civilopedia_Ages_Text.xml:259`).
- **The upside for us:** this works both ways. Unhappy foreign settlements that follow **our** religion can defect **to us**.

### Other religious modifiers
- **Exploration Dark Age culture card:** Missionaries +1 charge and +1 move, but −3 Happiness everywhere, doubled where a settlement does not follow our religion (`age-transition-gameeffects.xml:36-60`; `VictoriesText.xml:47`).
- **Antiquity plague crisis card:** +1 charge (`:138`).
- **Divine Mercy:** no plague damage in followers (`CultureText.xml:459`).
- **Divine Punishment.**
- **Theocracy:** +20% Production and Gold toward Temples and Missionaries (`CultureText.xml:562`).
- **City-state bonuses:** the Monastery (+3 Happiness if following) and the Saqiya (+1 Science if following) (`IndependentsText.xml:555,597`).

## 2. Religious units

| | |
|---|---|
| Unit | `UNIT_MISSIONARY`: 4 moves, civilian, **3 charges** (`age-exploration\data\units.xml:162`). Cost 150 (`:338`). Needs a **Temple** in the training city (`:408`). Tag `UNIT_CLASS_RELIGIOUS` (`:872`) |
| Uniques | Hawaii `UNIT_KAHUNA`: Heal adjacent, +25 Gold per conversion. Majapahit `UNIT_PEDANDA`: +25 Culture and Gold on a first conversion. Shawnee DLC: +1 move (`UnitText.xml:265,327`; `units.xml:485-486`). `ABILITY_INITIATION` (`:879,963`): gold on conversion |
| Operation | `UNITOPERATION_SPREAD_RELIGION` (`base-standard\data\unit-operations.xml:31,121`, `ShowActivationPlots="true"`). An untargeted operation on the unit's own tile |
| How the game UI sends it | `base-standard\ui\unit-actions\unit-actions.js`:<br>• params `{X:-9999, Y:-9999, UnitAbilityType: ability.$index or -1}` (`:954-962`);<br>• `Game.UnitOperations.canStart(unit.id, "UNITOPERATION_SPREAD_RELIGION", params, false)` (`:966-977`) → `Success`, `FailureReasons`, **`ChargesRemaining`** (`:1020`);<br>• the tiles where it works: `unit.getActivationOperationPlots(op, false)` (`:991-996`);<br>• then `Game.UnitOperations.sendRequest(unit.id, op, params)` (`:1081`) |
| Failure texts | "Must be located on a valid District", "already follows", "being razed" (`UnitOperationsText.xml:315-330`) |
| Others | `UNITOPERATION_RELIGIOUS_HEAL` (Kahuna), `REMOVE_HERESY`, `CREATE_RELIC` (`unit-operations.xml:11,42,144`) |

- **How the AI uses them:**
  - It has a Religion component and budget (`base-standard\data\AI_Base.xml:8,68,102`).
  - Its culture-path strategy gives `PSEUDOYIELD_RELIGION_CONVERSION` 300 and Theology 1000 (`age-exploration\data\victories.xml:197-206`).
  - Reliquary choices are biased toward conversion targets (`religion.xml:205-232`).
- **Observed in game 41:**
  - Japan's Shinto took 6 city-states and minors (p8, p10–13).
  - Protestantism and Orthodoxy each took 2 of ours.
  - There is no diplomatic penalty for spreading in the data (`DiplomacyText`: nothing found). That may be in the exe: untested.

## 3. Legacy paths and triumphs
- **Exploration culture path:**
  - Display 12 relics; milestones at 6, 9 and 12 relics (`age-exploration\data\victories.xml:215-217`; `VictoriesText.xml:506`).
  - Milestone 2's Modern card: "+2 Culture per Relic in previous Age" (`VictoriesText.xml:228-231`).
- **Exploration military path:**
  - 12 points from Distant Lands settlements: 1 each, **doubled if it follows our religion**, ×4 if conquered and following (`victories.xml:54-97`; `VictoriesText.xml:518`).
  - So converting our own Distant Lands settlements doubles the path's points, at 1 charge each.
- **Triumph LEGACY_EX_CULTURAL_1 "Toshakhana":**
  - Display 20 relics; there is a race version (first to 20).
  - Reward: "Keep your Founder Belief on Age Transition" (`age-exploration\data\legacies.xml:170`; `LegaciesText.xml:288-294,945`).
  - The Modern cards for each founder belief (1 Wildcard point) are at `age-modern\data\age-transition.xml:151-169`. The domestic Food and Production ones still need the settlement to follow (`age-modern\data\age-transition-gameeffects.xml:349-360`).
- **Modern culture victory:** each displayed relic is **3 Tourism points**, carried over (`StaticCarryover`, `base-standard\data\victories.xml:101`; `VictoriesText.xml:847`).
- **What a relic gives:** +2 Culture and +2 Happiness where it is displayed (`greatworks.xml:417+`, all 193 relics). Slots: Palace 1, Temple 1 (`:809-810`), the Religious town Focus +2 (`ProjectsText.xml:43`), Sanctum and Parampara, and some wonders.
- **Other relic sources** (game 41 got 12 by E56 without any conversion; Game_Greatworks.csv shows SLOTTED RELIC at E6–E56): wonders (House of Wisdom, Rila), Theology, stories, city-state suzerainty, celebrations.

## 4. What our autopilot does today

| Where | What | Problem |
|---|---|---|
| `M/data/xpl-autopilot-choices.js:711-725` `choosePantheon` | the first pantheon `canStart` allows | No scoring. Game 41: Earth Goddess (BONUS_2) only because America took BONUS_1 |
| `:727-769` `foundReligion` | first unfounded religion; beliefs sorted by `modifiersValue` (PYP `previewModifierByIds`) | PYP returns nothing usable for `EFFECT_ATTACH_MODIFIERS` / `EFFECT_ADD_RELIGIOUS_BELIEF_YIELD` / relic effects, so the table order wins. Game 41 (UI.log 03:34:18): Icons (city-states, never converted), Interfaith Dialogue, Conversion, Stewardship (foreign natural wonders) |
| `M/data/xpl-autopilot-steps.js:842-856` `unitWanted` | a religious unit → `false` | No Missionary is ever trained |
| `M/data/xpl-autopilot-units.js` | no `UNIT_CLASS_RELIGIOUS` / `SPREAD_RELIGION` handling | A free Missionary (Divine Inspiration, the stories "Next Missionary is free") is skipped forever |
| `:405-424` `policyOptions` + `:223-242` `SETTLEMENT_TESTS` | an unknown crisis card counts 0; `REQUIREMENT_CITY_FOLLOWS_RELIGION` is not a known test, so `happinessLoss` skips it | **Ius Reformandi slotted** (UI.log 03:55:11 `POLICY ["Право на реформу","?"]`); Zeal, Tolerance and Liturgical Disputes' Happiness unweighed |
| `:1143-1200` `slotGreatWorks` | moves archived works (relics too) into free slots | Works. The game also auto-slots relics |
| `M/data/xpl-autopilot-steps.js:5282-5292` `revoltRisks` / `guardRevolts` | buys Happiness where a revolt threatens | Does not know religion is the cause; no re-conversion |
| `M/core/xpl-town-focus.js:16,66` | the Religious town Focus is valued +2 Happiness per building only | Its +2 relic slots are not counted |

## 5. Proposals, ranked by value per effort

1. **Never slot Ius Reformandi; weigh the religious crisis cards** (S effort, prevents harm).
   - Add `REQUIREMENT_CITY_FOLLOWS_RELIGION` (args `hasReligion`, `cityReligion`; `inverse`) to `SETTLEMENT_TESTS`. A settlement follows when `c.Religion.majorityReligion === player.Religion.getReligionType()`.
   - Value `EFFECT_CITY_DAMAGE_CONSTRUCTIBLES` as a large negative while any conversion of ours is planned (or always).
   - Tolerance vs Zeal: pick Tolerance when many of our settlements follow foreign religions.
2. **Score beliefs and the pantheon by data rules, not PYP** (S–M).
   - **Founder:** Covenant (30) first when nothing will be converted: certain, shareable, carried to the Palace in Modern. With Missionaries, Chesed (F16) for science/production or Feed the World (F15) in Growth. Interfaith Dialogue / Tithe / Holy Ecumene only with foreign targets near.
   - **Reliquary:** the one that pays for **our own** settlements:
     - Sukha (34): our ≥3-specialist cities, 2 relics each;
     - Akhlaq (33): 1 per own city;
     - Barakah (35): natural wonders.

     Avoid Icons/Brahmanism unless there are foreign targets.
   - **Enhancer:** Sanctum (8, +1 relic slot per city Temple) or Parampara (E9, science buildings: fits the science focus); Zeal (6) when converting a lot.
   - **Pantheon by focus:** Forge (8, +10% building production) / Wisdom (12, +1 Science per quarter) for science, Festivals (4) for culture, Harvest (6) in Growth, Revelry (17) when Happiness is short.
   - Count the cities and specialists through `leverContext().settlements`.
3. **Own-settlement Missionary loop** (M; the main gain).
   - **Train:** 1–2 Missionaries in the Holy City (or any Temple city) while ≥2 own settlements do not follow our religion. Cost: 150 each, or ~200–300 gold.
   - **Targets:** our settlements with no religion first (1 charge), then those that follow a foreign religion (2 charges; first the unhappy ones in a religious crisis, then Distant Lands ones for the military path).
   - **The order:** walk to the nearest tile in `unit.getActivationOperationPlots("UNITOPERATION_SPREAD_RELIGION", false)` (needs the operation's `canStart` per plot), then `sendRequest` with NO_TARGET params.
   - **Guard:** none while Ius Reformandi is active.
   - **What it gives:** Chesed/Feed the World per settlement, 1–2 relics per first conversion with Akhlaq/Sukha, safety from ReligiousRevolt, Liturgical Disputes aside.
   - **Data reads:**
     - `city.Religion.majorityReligion / urbanReligion / ruralReligion` (hashes of `GameInfo.Religions`; `city-banners.js:535-599`);
     - `player.Religion.getReligionType()`, `getBeliefs()`, `getNumBeliefsEarned()`, `getHolyCityName()`;
     - `Game.Religion.getPlayerFromReligion(type)`;
     - `player.Stats.getNumMyCitiesFollowingSpecificReligion(type, false)` (`panel-religion-chooser.js:373`);
     - charges: `canStart(...).ChargesRemaining`.
4. **Foreign targets, opt-in** (M).
   - Only if the reliquary or founder pays for foreign followers. City-states that are ours or friendly are safe targets for Icons (2 relics each). A rival's capital (Brahmanism) and Holy Cities are risky.
   - Under the religious crisis, converting an unhappy rival settlement may make it **defect to us**. Probe it before relying on it.
   - Stay within our usual civilian safety (danger radius, no war).
5. **Relic value in planning** (S).
   - Count relic slots (Temple, the Religious town Focus +2, Sanctum) as culture lever value when the culture path or the Modern culture victory is on (3 points each, carried over).
   - The 20-relic triumph keeps a founder belief in Modern.
6. **Theology in research with a religion** (S): a belief, a relic, and Evangelism +1 charge.

**Risks**
- Ius Reformandi damages 3 of our buildings per own conversion.
- Liturgical Disputes: −4 Happiness in our followers.
- Zeal: −8 Happiness in non-followers.
- AI missionaries keep re-converting (the AI culture path weighs conversion 300).
- Foreign conversion may anger leaders (no data row found; untested).
- Missionaries are civilians: use the settler danger rules.
- The Temple costs 3 Gold upkeep.
- Exploration ends: unfinished religion work is lost, but followers carry into Modern (game 41's M1 rows).

## 6. Game 41 evidence (Logs)
- **UI.log:**
  - 03:19:30 `PANTHEON ["Богиня земли"]`;
  - 03:34:18 `RELIGION_FOUNDED ["Буддизм"]`, BELIEF Значки, Межконфессиональный диалог, Обращение, Попечение;
  - 03:44:22 crisis cards Jizya 24.1, Schism −42;
  - 03:55:11 offered `TRADITION_RELIGIOUS_MOVEMENT ?, TRADITION_IUS_REFORMANDI ?, TRADITION_LITURGICAL_DISPUTES -3.5`; slotted Бханака and **Право на реформу**.
- **Game_Religion.csv** (Player = the settlement's owner):
  - we founded Buddhism at E9;
  - our settlements' urban religion turned to Protestantism at E25 and E57 and to Orthodoxy at E54 and E58;
  - at M1 our majority religions were 2 Orthodoxy, 2 Protestantism, 1 Buddhism.
- **NarrativeStories.log:** the religious crisis ERC001–ERC004 ran.
- **Game_Greatworks.csv:** player 0 slotted 12 relics E6–E56 with no conversion; 7 relic slots were added.
