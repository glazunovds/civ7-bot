"""What every memento is worth, in the terms of mma_scoring.py.

One entry per memento: the terms (yields per unit of a reference-empire count,
or non-yield levers), an optional condition (tag, uptime without, uptime with a
matching leader or civilization), "fit" tags that earn the synergy bonus, and a
one-line description in English and Russian.

The amounts here were read from the game's modifiers (1.5.0). build_table.py
fingerprints every memento's modifiers and warns when a game update changes
them, so this table can be reviewed instead of silently going stale.
"""
from mma_scoring import Y, PCT, LV, ATTR

NAVAL = ("naval", 1.0, 2.0)
CAVALRY = ("cavalry", 1.0, 1.7)
ONE_ALLY = ("alliance", 0.35, 0.6)
WAR = ("war", 0.3, 1.0)
CELEBRATION = ("celebration", 0.3, 0.45)
SUZERAIN = ("suzerain", 1.0, 1.6)
COMMANDERS = ("commanders", 0.7, 1.3)

# Production poured into one kind of building helps the matching victory most.
W_SCIENCE_BUILDINGS = {"SCIENCE": 0.9, "CULTURE": 0.3, "ECONOMIC": 0.3, "MILITARY": 0.3}
W_CULTURE_BUILDINGS = {"CULTURE": 0.9, "SCIENCE": 0.3, "ECONOMIC": 0.3, "MILITARY": 0.3}
W_HAPPINESS_BUILDINGS = {"CULTURE": 0.6, "SCIENCE": 0.4, "ECONOMIC": 0.4, "MILITARY": 0.4}


def E(terms, what, cond=None, fit=()):
    return {"terms": terms, "cond": cond, "fit": list(fit), "what": {"en": what[0], "ru": what[1]}}


MEMENTO_VALUES = {
    # ---------------------------------------------------------------- Foundation path
    "MEMENTO_FOUNDATION_SLING_BULLET": E([ATTR("MILITARISTIC")], fit=["attr_MILITARISTIC"], what=(
        "+1 Militaristic attribute point",
        "+1 очко характеристик «военное дело»")),
    "MEMENTO_FOUNDATION_EA_NASIR": E([ATTR("ECONOMIC")], fit=["attr_ECONOMIC"], what=(
        "+1 Economic attribute point",
        "+1 очко характеристик «экономика»")),
    "MEMENTO_FOUNDATION_TREATY_OF_KADESH": E([ATTR("POLITICAL")], fit=["attr_POLITICAL"], what=(
        "+1 Diplomatic attribute point",
        "+1 очко характеристик «дипломатия»")),
    "MEMENTO_FOUNDATION_GROMA": E([ATTR("EXPANSIONIST")], fit=["attr_EXPANSIONIST"], what=(
        "+1 Expansionist attribute point",
        "+1 очко характеристик «экспансионизм»")),
    "MEMENTO_FOUNDATION_SHAKOKIDOGU": E([ATTR("CULTURAL")], fit=["attr_CULTURAL"], what=(
        "+1 Cultural attribute point",
        "+1 очко характеристик «культура»")),
    "MEMENTO_FOUNDATION_ANTIKYTHERA_MECHANISM": E([ATTR("SCIENTIFIC")], fit=["attr_SCIENTIFIC"], what=(
        "+1 Scientific attribute point",
        "+1 очко характеристик «наука»")),
    "MEMENTO_FOUNDATION_SWORD_BRENNUS": E([Y("GOLD", 400, "returnedSettlements", lump=True)], cond=WAR, what=(
        "+400 Gold per settlement handed back in a peace deal (rare)",
        "+400 золота за каждое поселение, возвращённое по мирному договору (редко)")),
    "MEMENTO_FOUNDATION_LYDIAN_LION": E([Y("GOLD", 200, age=True, lump=True, share=1.5)], what=(
        "+200/400/600 Gold at the start of the age",
        "+200/400/600 золота в начале эпохи")),
    "MEMENTO_FOUNDATION_IMAGO_MUNDI": E([LV("explore", 0.5)], what=(
        "Scouts' Search and Lookout reveal 2 tiles instead of 1",
        "«Поиск» и «Дозорный» разведчиков дают +2 к обзору вместо +1")),
    "MEMENTO_FOUNDATION_CORPUS_JURIS_CIVILIS": E([LV("policySlot")], fit=["policies"], what=(
        "+1 social policy slot: good for any victory",
        "+1 ячейка общественного курса: полезна для любой победы")),
    "MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO": E([Y("GOLD", 50, "explored100", lump=True)], what=(
        "+50 Gold for every 100 tiles explored",
        "+50 золота за каждые 100 исследованных клеток")),
    "MEMENTO_FOUNDATION_EQUESTRIAN_FIGURE": E([LV("commanderUtility", 0.7)], fit=["commanders"], what=(
        "Army commanders recover 50% faster",
        "Командиры армии восстанавливаются на 50% быстрее")),
    "MEMENTO_FOUNDATION_POCHTECA_BACKPACK": E([LV("tradeRange")], fit=["trade"], what=(
        "+5 trade route range",
        "+5 к дальности торговых путей")),
    "MEMENTO_FOUNDATION_COLADA_TIZONA": E([LV("combat", 2 * 0.3)], fit=["war"], what=(
        "+2 Combat Strength for units next to 2 or more enemies",
        "+2 к боевой мощи юнитов рядом с 2 и более врагами")),
    "MEMENTO_FOUNDATION_SHISA_NECKLACE": E([Y("DIPLOMACY", 50, "suzerainEvents", age=True, lump=True)], cond=SUZERAIN, what=(
        "+50/100/150 Influence each time you become a suzerain",
        "+50/100/150 влияния каждый раз, когда вы становитесь сюзереном")),
    "MEMENTO_FOUNDATION_AGINCOURT_ARROWHEAD": E([LV("move", 0.35)], cond=("ranged", 1.0, 1.6), what=(
        "+1 Movement for ranged units",
        "+1 к перемещению дальнобойных юнитов")),
    "MEMENTO_FOUNDATION_GARUDA_STATUE": E([LV("pop", 1, basis="celebrationsPerAge")], cond=("celebration", 1.0, 1.4), what=(
        "+1 Population in your smallest settlement at each celebration",
        "+1 к населению самого маленького поселения в начале каждого празднества")),
    "MEMENTO_FOUNDATION_ART_OF_WAR": E([LV("commanderXP10", 2)], fit=["commanders"], what=(
        "+10% commander XP, +50% near a higher-level commander",
        "+10% опыта командиров, +50% рядом с командиром выше уровнем")),
    "MEMENTO_FOUNDATION_GAME_OF_UR": E([PCT("SCIENCE", 10), PCT("CULTURE", 10)], cond=("behind", 0.3, 0.3), what=(
        "+10% Science / Culture while half the civilizations are ahead of you",
        "+10% науки / культуры, пока половина цивилизаций опережает вас")),

    # ---------------------------------------------------------------- Amina
    "MEMENTO_AMINA_TAKOBA": E([LV("combat", 1)], cond=("desert", 0.4, 0.8), fit=["war"], what=(
        "+1 Combat Strength for all units in plains and desert",
        "+1 к боевой мощи всех юнитов на равнинах и в пустыне")),
    "MEMENTO_AMINA_KWALKWALI": E([Y("GOLD", 1, "resourcesInCities", age=True)], fit=["resources"], what=(
        "+1/2/3 Gold per resource assigned to cities",
        "+1/2/3 золота за каждый ресурс, назначенный городам")),
    "MEMENTO_AMINA_RAWANI": E([LV("combat", 3 * 0.3)], fit=["war"], what=(
        "+3 Combat Strength on a unit's next attack after a kill",
        "+3 к боевой мощи при следующей атаке юнита после победы")),

    # ---------------------------------------------------------------- Ashoka, World Renouncer
    "MEMENTO_ASHOKA_RENOUNCER_CHAKRA": E([Y("FOOD", 0.2, "capitalExcessHappiness")], fit=["celebration"], what=(
        "+1 Food in the capital per 5 excess Happiness",
        "+1 пищи в столице за каждые 5 избыточного довольства")),
    "MEMENTO_ASHOKA_RENOUNCER_GOLD_SAPPHIRE_FLOWERS": E(
        [Y("FOOD", 100, "attrPointsOneTree", lump=True)], cond=("attr_EXPANSIONIST", 0.6, 1.4), what=(
            "+100 Food in the capital per Expansionist attribute point spent",
            "+100 пищи в столице за каждое очко в дереве «экспансионизм»")),
    "MEMENTO_ASHOKA_RENOUNCER_DIAMOND_THRONE": E(
        [Y("HAPPINESS", 1, "quarterTiles", age=True)], cond=CELEBRATION, fit=["quarters"], what=(
            "+1/2/3 Happiness on quarters during celebrations",
            "+1/2/3 довольства в кварталах во время празднеств")),

    # ---------------------------------------------------------------- Augustus
    # The in-game text adds "+50% cost to convert to a city", but the data has only the cap
    # modifier (MEMENTO_AUGUSTUS_CORONA_CIVICA_MODIFIER_1): valued without the downside.
    "MEMENTO_AUGUSTUS_CORONA_CIVICA": E([LV("settlementCap")], fit=["expansion", "towns"], what=(
        "+1 settlement limit",
        "+1 к лимиту поселений")),
    "MEMENTO_AUGUSTUS_BREASTPLATE": E([Y("FOOD", 2, "towns", age=True)], fit=["towns"], what=(
        "+2/4/6 Food in every town",
        "+2/4/6 пищи в каждом городке")),
    "MEMENTO_AUGUSTUS_CLIPEUS_VIRTUTIS": E([Y("PRODUCTION", 1, "towns")], fit=["towns"], what=(
        "+1 Production in the capital per town",
        "+1 производства в столице за каждый городок")),

    # ---------------------------------------------------------------- Benjamin Franklin
    "MEMENTO_BENJAMIN_FRANKLIN_BIFOCALS": E([Y("DIPLOMACY", 25, "techsPerAge", age=True, lump=True)], fit=["techs"], what=(
        "+25/50/75 Influence per technology researched",
        "+25/50/75 влияния за каждую изученную технологию")),
    "MEMENTO_BENJAMIN_FRANKLIN_KITE": E([PCT("SCIENCE", 4)], fit=["masteries"], what=(
        "+10% Science towards tech masteries",
        "+10% науки на усовершенствования технологий")),
    "MEMENTO_BENJAMIN_FRANKLIN_GLASS_ARMONICA": E(
        [Y("SCIENCE", 15, "alliances", age=True), Y("HAPPINESS", 15, "alliances", age=True)],
        cond=("alliance", 1.0, 1.5), what=(
            "+15/30/45 Science and Happiness per ally, for you and the ally",
            "+15/30/45 науки и довольства за каждого союзника, вам и союзнику")),

    # ---------------------------------------------------------------- Catherine
    "MEMENTO_CATHERINE_GREAT_IMPERIAL_CROWN": E(
        [Y("SCIENCE", 2, "towns", age=True)], cond=("tundra", 0.1, 0.6), fit=["towns"], what=(
            "+2/4/6 Science in towns in tundra",
            "+2/4/6 науки в городках в тундре")),
    "MEMENTO_CATHERINE_POTEMKINS_SWORD_KNOT": E([LV("commanderUtility", 1)], fit=["commanders"], what=(
        "+1 Movement for army commanders",
        "+1 к перемещению командиров армии")),
    "MEMENTO_CATHERINE_EAGLE_BANNER": E(
        [Y("SCIENCE", 2, "gwScienceShare")], cond=("great_works", 1.0, 1.5), what=(
            "+2% Science in a city per displayed great work (max 20%)",
            "+2% науки в городе за каждый выставленный шедевр (до 20%)")),

    # ---------------------------------------------------------------- Charlemagne
    "MEMENTO_CHARLEMAGNE_JOYEUSE": E([Y("HAPPINESS", 1, "stationedUnits", age=True)], cond=("cavalry", 0.5, 1.0), what=(
        "+1/2/3 Happiness per cavalry unit stationed on a Palace or City Hall",
        "+1/2/3 довольства за кавалерию на дворце или ратуше")),
    "MEMENTO_CHARLEMAGNE_GLOBUS_CRUCIGER": E(
        [Y("DIPLOMACY", 50, "attrPointsOneTree", lump=True)], cond=("attr_POLITICAL", 0.6, 1.4), what=(
            "+50 Influence per Diplomatic attribute point spent",
            "+50 влияния за каждое очко в дереве «дипломатия»")),
    "MEMENTO_CHARLEMAGNE_TENCENDUR": E([LV("move", 0.3)], cond=CAVALRY, what=(
        "+1 Movement for cavalry",
        "+1 к перемещению кавалерии")),

    # ---------------------------------------------------------------- Confucius
    "MEMENTO_CONFUCIUS_BRUSH_SCROLL": E([Y("FOOD", 1, "brushScrollFood")], fit=["specialists"], what=(
        "+5% growth rate in a city per specialist there (max 25%)",
        "+5% к скорости роста города за каждого специалиста в нём (до 25%)")),
    "MEMENTO_CONFUCIUS_ALTAR_SET": E([Y("CULTURE", 1, "specialists")], fit=["specialists"], what=(
        "+1 Culture per specialist",
        "+1 культуры от каждого специалиста")),
    "MEMENTO_CONFUCIUS_ANALECTS": E([Y("SCIENCE", 1, "specialists")], fit=["specialists"], what=(
        "+1 Science per specialist",
        "+1 науки от каждого специалиста")),

    # ---------------------------------------------------------------- Friedrich, Oblique
    "MEMENTO_FRIEDRICH_OBLIQUE_WALKING_STICK": E(
        [Y("SCIENCE", 1, "militaryBuildings", age=True)], fit=["military_buildings"], what=(
            "+1/2/3 Science on military buildings",
            "+1/2/3 науки от военных зданий")),
    "MEMENTO_FRIEDRICH_OBLIQUE_ORDER_BLACK_EAGLE": E(
        [Y("PRODUCTION", 50, "attrPointsOneTree", lump=True)], cond=("attr_MILITARISTIC", 0.6, 1.4), what=(
            "+50 Production in the capital per Militaristic attribute point spent",
            "+50 производства в столице за каждое очко в дереве «военное дело»")),
    "MEMENTO_FRIEDRICH_OBLIQUE_KRONE_VON_FRIEDRICH": E([LV("combat", 2 * 0.4)], fit=["war", "commanders"], what=(
        "+2 Combat Strength in Coordinated Attack and Focus Fire",
        "+2 к боевой мощи при скоординированной атаке и сосредоточенном огне")),

    # ---------------------------------------------------------------- Harriet Tubman
    "MEMENTO_TUBMAN_LANTERN": E([LV("pop", 1, basis="espionageSuccesses")], cond=("espionage", 0.5, 1.5), what=(
        "A Migrant in the capital per undetected espionage action",
        "Эмигрант в столице за каждое нераскрытое шпионское действие")),
    "MEMENTO_TUBMAN_SATCHEL": E([LV("settlerSafety")], fit=["expansion"], what=(
        "A defeated Settler respawns in the capital after 3 turns",
        "Побеждённый поселенец возрождается в столице через 3 хода")),
    "MEMENTO_TUBMAN_SIDEARM": E([LV("combat", 3 * 0.25)], fit=["war"], what=(
        "+3 Combat Strength for units below 50% health",
        "+3 к боевой мощи юнитов со здоровьем ниже 50%")),

    # ---------------------------------------------------------------- Hatshepsut
    "MEMENTO_HATSHEPSUT_ROYAL_MACE": E([Y("GOLD", 1, "importedResources", age=True)], fit=["trade", "resources"], what=(
        "+1/2/3 Gold per imported resource",
        "+1/2/3 золота за каждый импортированный ресурс")),
    "MEMENTO_HATSHEPSUT_FALSE_BEARD": E([Y("CULTURE", 2, "wonders")], cond=("wonders", 1.0, 1.4), what=(
        "+2 Culture on wonders",
        "+2 культуры от чудес")),
    "MEMENTO_HATSHEPSUT_URAEUS": E([Y("CULTURE", 10, "wonderCities", age=True)], cond=("wonders", 1.0, 1.4), what=(
        "+10/20/30 Culture in every city with a wonder",
        "+10/20/30 культуры в каждом городе с чудом")),

    # ---------------------------------------------------------------- Himiko, Queen of Wa
    "MEMENTO_HIMIKO_QUEEN_GOLDEN_SEAL_STONE": E(
        [Y("DIPLOMACY", 1, "scienceBuildings", age=True)], fit=["science_buildings"], what=(
            "+1/2/3 Influence on science buildings",
            "+1/2/3 влияния от научных зданий")),
    "MEMENTO_HIMIKO_QUEEN_YASAKANI_NO_MAGATAMA": E(
        [Y("SCIENCE", 2, "techMasteries", age=True)], fit=["masteries", "techs"], what=(
            "+2/4/6 Science per completed tech mastery",
            "+2/4/6 науки за каждое завершённое усовершенствование технологии")),
    "MEMENTO_HIMIKO_QUEEN_DOTAKU": E(
        [Y("SCIENCE", 50, "attrPointsOneTree", lump=True)], cond=("attr_SCIENTIFIC", 0.6, 1.4), what=(
            "+50 Science per Scientific attribute point spent",
            "+50 науки за каждое очко в дереве «наука»")),

    # ---------------------------------------------------------------- Ibn Battuta
    "MEMENTO_BATTUTA_TRAVELLERS_SANDALS": E(
        [Y(y, 25 * 0.25, "attrPointsSpent", lump=True) for y in ("SCIENCE", "CULTURE", "GOLD", "PRODUCTION")],
        fit=["attributes"], what=(
            "+25 of the matching yield per attribute point spent",
            "+25 соответствующей прибыли за каждое потраченное очко характеристик")),
    "MEMENTO_BATTUTA_MERCHANTS_SADDLE": E([LV("civilianMove")], fit=["trade", "expansion"], what=(
        "+1 Movement for Scouts, Merchants, Settlers and Explorers",
        "+1 к перемещению разведчиков, торговцев, поселенцев и исследователей")),
    "MEMENTO_BATTUTA_RIHLA": E(
        [Y(y, 1, "attrTreesWithPoints", age=True) for y in ("SCIENCE", "CULTURE", "GOLD", "HAPPINESS")],
        fit=["attributes"], what=(
            "+1/2/3 Science, Culture, Gold and Happiness per attribute tree with points",
            "+1/2/3 науки, культуры, золота и довольства за каждое дерево характеристик с очками")),

    # ---------------------------------------------------------------- Isabella
    "MEMENTO_ISABELLA_QUEENS_JEWELRY": E(
        [Y("GOLD", 2, "naturalWonderTiles", age=True)], cond=("natural_wonders", 1.0, 2.0), what=(
            "+2/4/6 Gold on natural wonder tiles",
            "+2/4/6 золота на клетках чудес природы")),
    "MEMENTO_ISABELLA_BALLESTILLA": E([LV("sight", 0.3)], cond=NAVAL, what=(
        "+1 Sight for naval units",
        "+1 к обзору морских юнитов")),
    "MEMENTO_ISABELLA_PADRON_REAL": E(
        [Y("HAPPINESS", 2, "naturalWonderTiles", age=True)], cond=("natural_wonders", 1.0, 2.0), what=(
            "+2/4/6 Happiness on natural wonder tiles",
            "+2/4/6 довольства на клетках чудес природы")),

    # ---------------------------------------------------------------- José Rizal
    "MEMENTO_RIZAL_FORGET_ME_NOT": E(
        [Y("HAPPINESS", 10, "narrativeEvents", age=True, lump=True)], cond=("narrative", 1.0, 1.5), what=(
            "+10/20/30 Happiness per narrative event completed",
            "+10/20/30 довольства за каждое завершённое сюжетное событие")),
    "MEMENTO_RIZAL_OPHTHALMOSCOPE": E([LV("celebrationTime")], fit=["celebration"], what=(
        "+25% celebration duration",
        "+25% к продолжительности празднеств")),
    "MEMENTO_RIZAL_NOLI_ME_TANGERE": E(
        [Y(y, 1, "majorTriumphs", age=True) for y in ("SCIENCE", "CULTURE", "GOLD")], what=(
            "+1/2/3 Science, Culture and Gold per major triumph completed this age",
            "+1/2/3 науки, культуры и золота за каждый великий триумф этой эпохи")),

    # ---------------------------------------------------------------- Lafayette
    "MEMENTO_LAFAYETTE_LETTER_ADRIENNE": E(
        [Y("HAPPINESS", 2, "policies", age=True), Y("HAPPINESS", 1, "traditions", age=True)],
        fit=["policies", "traditions"], what=(
            "+2/4/6 Happiness per slotted social policy (+1/2/3 per tradition)",
            "+2/4/6 довольства за каждый общественный курс в правительстве (+1/2/3 за традицию)")),
    "MEMENTO_LAFAYETTE_HERMIONE_MODEL": E([LV("move", 0.3)], cond=NAVAL, what=(
        "+1 Movement for naval units",
        "+1 к перемещению морских юнитов")),
    "MEMENTO_LAFAYETTE_TRICOLOUR_COCKADE": E(
        [Y("CULTURE", 2, "traditions", age=True), Y("HAPPINESS", 2, "traditions", age=True)],
        fit=["traditions"], what=(
            "+2/4/6 Culture and Happiness in the capital per slotted tradition",
            "+2/4/6 культуры и довольства в столице за каждую традицию в правительстве")),

    # ---------------------------------------------------------------- Machiavelli
    "MEMENTO_MACHIAVELLI_DISCORSI_SOPRA_LIVIO": E([LV("diplomacy")], fit=["influence"], what=(
        "Rejecting your diplomatic actions costs others 50% more Influence",
        "Отклонение ваших дипломатических процессов стоит другим на 50% больше влияния")),
    "MEMENTO_MACHIAVELLI_DELL_ARTE_DELLA_GUERRA": E(
        [Y("GOLD", 3, "sanctions", age=True)], cond=("sanctions", 1.0, 2.0), what=(
            "+3/6/9 Gold per active sanction",
            "+3/6/9 золота за каждую активную санкцию")),
    "MEMENTO_MACHIAVELLI_IL_PRINCIPE": E([LV("warDiplomacy")], cond=("war", 0.4, 1.0), what=(
        "Your formal war lowers the target's relationship with everyone by 25",
        "Ваша официальная война ухудшает отношения цели со всеми на 25")),

    # ---------------------------------------------------------------- Pachacuti
    "MEMENTO_PACHACUTI_TOPAYAURI": E(
        [Y("FOOD", 1, "urbanTilesNearMountains", age=True)], cond=("mountains", 0.4, 1.0), what=(
            "+1/2/3 Food on urban tiles next to mountains",
            "+1/2/3 пищи в городских районах рядом с горами")),
    "MEMENTO_PACHACUTI_ALL_TOQAPU_TUNIC": E([LV("explore", 0.2)], cond=("mountains", 0.5, 1.0), what=(
        "+1 Sight for scouts next to mountains",
        "+1 к обзору разведчиков рядом с горами")),
    "MEMENTO_PACHACUTI_MASCAPAYCHA": E(
        [Y("GOLD", 1, "specialists"), Y("GOLD", 1, "specialists", cond=("mountains", 0.2, 0.6))],
        fit=["specialists"], what=(
            "+1 Gold per specialist, +1 more next to mountains",
            "+1 золота от каждого специалиста, ещё +1 рядом с горами")),

    # ---------------------------------------------------------------- Trung Trac
    "MEMENTO_TRUNG_KIEM": E([Y("SCIENCE", 2, "commanderLevels")], cond=COMMANDERS, what=(
        "+2 Science per army commander promotion",
        "+2 науки за каждое повышение командира армии")),
    "MEMENTO_TRUNG_ANKUS": E([LV("warSupport")], fit=["war"], what=(
        "+1 War Support in all wars",
        "+1 к военной поддержке во всех войнах")),
    "MEMENTO_TRUNG_DONG_SON_DRUM": E([Y("SCIENCE", 1, "techBoostWar", lump=True)], cond=("war", 0.3, 1.2), what=(
        "A 50% tech boost each time you declare a formal war",
        "Ускорение технологии на 50% при каждом объявлении официальной войны")),

    # ---------------------------------------------------------------- Xerxes, King of Kings
    "MEMENTO_XERXES_KING_SCYTHIAN_AXE": E([Y("GOLD", 1, "commanderXP", age=True, lump=True)], cond=("war", 0.4, 1.0), what=(
        "+1/2/3 Gold per XP an army commander earns",
        "+1/2/3 золота за каждое очко опыта командира армии")),
    "MEMENTO_XERXES_KING_LOTUS_BLOSSOM": E(
        [Y("SCIENCE", 0.04, "goldIncome"), Y("CULTURE", 0.04, "goldIncome")], what=(
            "Science and Culture per turn equal to 4% of your Gold income",
            "Наука и культура за ход в размере 4% дохода золота")),
    "MEMENTO_XERXES_KING_GOLDEN_SCEPTRE": E([Y("GOLD", 3, "conqueredSettlements", age=True)], cond=WAR, what=(
        "+3/6/9 Gold per settlement conquered from another civilization",
        "+3/6/9 золота за каждое поселение, завоёванное у другой цивилизации")),

    # ================================================================ DLC
    "MEMENTO_ADA_LOVELACE_PUNCH_CARDS": E(
        [Y("SCIENCE", 20, "scienceBuildingsBuilt", age=True, lump=True)], fit=["science_buildings"], what=(
            "+20/40/60 Science per science building built",
            "+20/40/60 науки за каждое построенное научное здание")),
    "MEMENTO_ADA_LOVELACE_PIANO": E([PCT("CULTURE", 4)], fit=["masteries", "civics"], what=(
        "+10% Culture towards civic masteries",
        "+10% культуры на усовершенствования социальных институтов")),
    "MEMENTO_ADA_LOVELACE_NOTE_G": E([Y("PRODUCTION", 0.15, "masteryProduction")], fit=["masteries"], what=(
        "The capital gains Production equal to 15% of each tech or civic mastery's cost",
        "Столица получает производство в размере 15% стоимости каждого усовершенствования")),
    "MEMENTO_ALEXANDER_ILIAD": E(
        [Y("CULTURE", 1, "wondersOutsideCapital", age=True), Y("PRODUCTION", 1, "wondersOutsideCapital", age=True)],
        cond=("wonders", 1.0, 1.4), what=(
            "+1/2/3 Culture and Production on wonders outside the capital",
            "+1/2/3 культуры и производства от чудес вне столицы")),
    "MEMENTO_ALEXANDER_DIADEM": E(
        [LV("settlementCap"), Y("GOLD", -1, "landUnits", age=True)], fit=["expansion"], what=(
            "+1 settlement limit, but +1/2/3 Gold upkeep on every land unit",
            "+1 к лимиту поселений, но +1/2/3 золота на содержание каждого сухопутного юнита")),
    "MEMENTO_ALEXANDER_BRIDLE_OF_BUCEPHALUS": E([LV("combat", 3 * 0.3 * 0.8)], cond=CAVALRY, what=(
        "+3 Combat Strength for cavalry, but cavalry costs 25% more",
        "+3 к боевой мощи кавалерии, но кавалерия на 25% дороже")),
    "MEMENTO_ASHOKA_CONQUEROR_CHANDA_MAHASENA": E(
        [LV("combat", 3 * 0.25)], cond=("celebration", 0.3, 0.6), fit=["war"], what=(
            "+3 Combat Strength against fortified districts during celebrations",
            "+3 к боевой мощи против укреплённых районов во время празднеств")),
    "MEMENTO_ASHOKA_CONQUEROR_SILK_UTTARIYA": E(
        [Y("PRODUCTION", 2, "happyCities", age=True)], fit=["celebration"], what=(
            "+2/4/6 Production in Happy (or happier) cities",
            "+2/4/6 производства в городах со «Счастьем» и выше")),
    "MEMENTO_ASHOKA_CONQUEROR_LION_CAPITAL": E(
        [LV("commanderXP10", 5)], cond=("celebration", 0.3, 0.6), fit=["commanders"], what=(
            "+50% commander XP during celebrations",
            "+50% опыта командиров во время празднеств")),
    "MEMENTO_HIMIKO_SHAMAN_SAKAKI_BRANCH": E(
        [Y("PRODUCTION", 0.25, "productionHappinessBuildings", lump=True, w=W_HAPPINESS_BUILDINGS)],
        fit=["happiness_buildings"], what=(
            "+25% Production towards happiness buildings",
            "+25% производства на строительство зданий довольства")),
    "MEMENTO_HIMIKO_SHAMAN_YATA_NO_KAGAMI": E(
        [Y("CULTURE", 20, "celebrationsPerAge", age=True, lump=True)], cond=("celebration", 1.0, 1.4), what=(
            "+20/40/60 Culture at the start of every celebration",
            "+20/40/60 культуры в начале каждого празднества")),
    "MEMENTO_HIMIKO_SHAMAN_KUSANAGI_NO_TSURUGI": E(
        [Y("CULTURE", 3, "happinessBuildings", age=True), Y("SCIENCE", -1, "happinessBuildings", age=True)],
        fit=["happiness_buildings"], what=(
            "+3/6/9 Culture but -1/2/3 Science on happiness buildings",
            "+3/6/9 культуры, но −1/2/3 науки от зданий довольства")),
    "MEMENTO_BOLIVAR_GOLD_SNUFF_BOX": E([Y("FOOD", 20, "cities", age=True)], cond=ONE_ALLY, what=(
        "+20/40/60 Food in every city while you have exactly one ally",
        "+20/40/60 пищи в каждом городе, пока у вас ровно один союзник")),
    "MEMENTO_BOLIVAR_DAVALOS_MEDAL": E(
        [Y("HAPPINESS", 1, "militaryBuildings", age=True)], fit=["military_buildings"], what=(
            "+1/2/3 Happiness on military buildings",
            "+1/2/3 довольства от военных зданий")),
    "MEMENTO_BOLIVAR_LETTER_TO_JAMAICA": E([LV("unitPurchase")], cond=("celebration", 0.4, 0.7), fit=["war"], what=(
        "+50% Gold efficiency buying units during celebrations",
        "+50% эффективности золота при покупке юнитов во время празднеств")),
    "MEMENTO_EDWARD_TEACH_BRACE_OF_PISTOLS": E([LV("combat", 2 * 0.3 * 0.5)], cond=NAVAL, what=(
        "+2 Combat Strength for naval units when attacking",
        "+2 к боевой мощи морских юнитов при атаке")),
    "MEMENTO_EDWARD_TEACH_MEDICINE_CHEST": E([LV("heal", 0.3)], cond=NAVAL, what=(
        "+5 healing for naval units",
        "+5 к лечению морских юнитов")),
    "MEMENTO_EDWARD_TEACH_FIGUREHEAD_OF_QUEEN_ANNES_REVENGE": E(
        [Y("GOLD", 12, "navalKills", age=True, lump=True)], cond=("naval", 0.5, 1.5), what=(
            "Gold equal to 25% of a defeated naval unit's Combat Strength",
            "Золото в размере 25% боевой мощи побеждённого морского юнита")),
    "MEMENTO_ELIZABETH_JUELLES_OF_GOLDE": E([Y("GOLD", 1, "greatWorks", age=True)], cond=("great_works", 1.0, 1.5), what=(
        "+1/2/3 Gold per displayed great work",
        "+1/2/3 золота за каждый выставленный шедевр")),
    "MEMENTO_ELIZABETH_THE_ANNALS": E([LV("gwSlot", 1, basis="goldBuildings")], fit=["great_works", "gold_buildings"], what=(
        "+1 great work slot on gold buildings",
        "+1 ячейка шедевра в зданиях золота")),
    "MEMENTO_ELIZABETH_MASK_OF_YOUTH": E([Y("DIPLOMACY", 1, "continents", age=True)], fit=["expansion"], what=(
        "+1/2/3 Influence per continent you have a settlement on",
        "+1/2/3 влияния за каждый континент с вашим поселением")),
    "MEMENTO_FRIEDRICH_BAROQUE_FLUTE": E(
        [Y("CULTURE", 1, "militaryBuildings", age=True)], fit=["military_buildings"], what=(
            "+1/2/3 Culture on military buildings",
            "+1/2/3 культуры от военных зданий")),
    "MEMENTO_FRIEDRICH_BAROQUE_VOLTAIRE_EDITS": E(
        [Y("CULTURE", 50, "attrPointsOneTree", lump=True)], cond=("attr_CULTURAL", 0.6, 1.4), what=(
            "+50 Culture per Cultural attribute point spent",
            "+50 культуры за каждое очко в дереве «культура»")),
    "MEMENTO_FRIEDRICH_BAROQUE_ANTI_MACHIAVEL": E([LV("warSupport", 1.0)], fit=["war"], what=(
        "+2 War Support in wars declared on you",
        "+2 к военной поддержке в войнах, объявленных вам")),
    "MEMENTO_XERXES_ACHAEMENID_INCENSE_CENSER": E(
        [Y("CULTURE", 2, "tradeRoutes", age=True)], cond=("trade", 1.0, 1.5), what=(
            "+2/4/6 Culture per active trade route",
            "+2/4/6 культуры за каждый действующий торговый путь")),
    "MEMENTO_XERXES_ACHAEMENID_GOLD_FLUTED_PHIALE": E([LV("tradeCapacity")], fit=["trade"], what=(
        "+1 trade route limit with every other leader",
        "+1 к лимиту торговых путей со всеми остальными лидерами")),
    "MEMENTO_XERXES_ACHAEMENID_CHALCEDONY_SEAL": E(
        [Y("CULTURE", 1, "uniqueConstructibles"), Y("GOLD", 1, "uniqueConstructibles")],
        cond=("unique_improvements", 1.0, 1.6), what=(
            "+1 Culture and Gold on unique buildings and improvements",
            "+1 культуры и золота от уникальных зданий и улучшений")),
    "MEMENTO_GENGHIS_KHAN_PAIZA": E([Y("GOLD", 1, "cavalryUnits")], cond=("cavalry", 0.6, 1.5), what=(
        "-1 Gold upkeep on cavalry",
        "−1 золота на содержание кавалерии")),
    "MEMENTO_GENGHIS_KHAN_SADDLE": E([Y("FOOD", 1, "stationedUnits", age=True)], cond=("cavalry", 0.5, 1.0), what=(
        "+1/2/3 Food per cavalry unit stationed on a Palace or City Hall",
        "+1/2/3 пищи за кавалерию на дворце или ратуше")),
    "MEMENTO_GENGHIS_KHAN_SULDE": E([Y("CULTURE", 1, "stationedUnits", age=True)], cond=("cavalry", 0.5, 1.0), what=(
        "+1/2/3 Culture per cavalry unit stationed on a Palace or City Hall",
        "+1/2/3 культуры за кавалерию на дворце или ратуше")),
    "MEMENTO_GILGAMESH_MAGIC_PLANT": E([LV("diplomacy", 0.5)], what=(
        "Friendly greetings raise relationships twice as much",
        "Дружеское приветствие улучшает отношения вдвое сильнее")),
    "MEMENTO_GILGAMESH_PUKKU": E([Y("HAPPINESS", 2, "settlements")], cond=ONE_ALLY, what=(
        "+2 Happiness in every settlement while you have exactly one ally",
        "+2 довольства в каждом поселении, пока у вас ровно один союзник")),
    "MEMENTO_GILGAMESH_MIKKU": E([Y("DIPLOMACY", 1, "settlements")], cond=ONE_ALLY, what=(
        "+1 Influence in every settlement while you have exactly one ally",
        "+1 влияния в каждом поселении, пока у вас ровно один союзник")),
    "MEMENTO_LAKSHMIBAI_DHAL": E([LV("combat", 2 * 0.35)], fit=["war"], what=(
        "+2 Combat Strength when defending in friendly territory",
        "+2 к боевой мощи при обороне на дружественной территории")),
    "MEMENTO_LAKSHMIBAI_BAADALS_REINS": E([Y("DIPLOMACY", 1, "pastures", age=True)], cond=("pastures", 0.7, 1.5), what=(
        "+1/2/3 Influence per Pasture",
        "+1/2/3 влияния за каждое пастбище")),
    "MEMENTO_LAKSHMIBAI_FLAG_OF_JHANSI": E([Y("DIPLOMACY", 2, "commanderLevels")], cond=COMMANDERS, what=(
        "+2 Influence per army commander promotion",
        "+2 влияния за каждое повышение командира армии")),
    "MEMENTO_NAPOLEON_REVOLUTIONARY_ARTILLERYMAN_GLOVES": E([Y("CULTURE", 2, "commanderLevels")], cond=COMMANDERS, what=(
        "+2 Culture per army commander promotion",
        "+2 культуры за каждое повышение командира армии")),
    "MEMENTO_NAPOLEON_REVOLUTIONARY_BICORNE_HAT": E([LV("move", 0.4)], cond=("infantry", 1.0, 1.6), what=(
        "+1 Movement for infantry",
        "+1 к перемещению пехоты")),
    "MEMENTO_NAPOLEON_REVOLUTIONARY_LEGION_DHONNEUR_GRAND_EAGLE_CROSS": E(
        [LV("heal", 1)], fit=["commanders", "war"], what=(
            "Units in a command radius heal 10 HP after a kill",
            "Юниты в зоне командования восстанавливают 10 ОЗ после победы")),
    "MEMENTO_NAPOLEON_EMPEROR_PORTRAIT_JOSEPHINE": E(
        [Y("GOLD", 2, "unfriendlyLeaders", age=True)], fit=["war", "sanctions"], what=(
            "+2/4/6 Gold per Unfriendly or Hostile leader",
            "+2/4/6 золота за каждого недружелюбного или враждебного лидера")),
    "MEMENTO_NAPOLEON_EMPEROR_GREEN_COLONEL_JACKET": E(
        [Y("GOLD", 1.4, "tradeRoutes", age=True)], cond=("trade", 1.0, 1.4), what=(
            "+1/2/3 Gold per trade route, doubled with the most routes",
            "+1/2/3 золота за торговый путь, вдвое при наибольшем числе путей")),
    "MEMENTO_NAPOLEON_EMPEROR_CROWN_OF_NAPOLEON": E(
        [Y("GOLD", 200, "warsDeclaredOnYou", age=True, lump=True)], what=(
            "+200/400/600 Gold when a formal war is declared on you",
            "+200/400/600 золота, когда вам объявляют официальную войну")),
    "MEMENTO_SAYYIDA_AL_HURRA_NIMCHA": E([Y("GOLD", 1, "navalUnits")], cond=("naval", 0.6, 1.5), what=(
        "-1 Gold upkeep on naval units",
        "−1 золота на содержание морских юнитов")),
    "MEMENTO_SAYYIDA_AL_HURRA_MITHQAL": E(
        [Y("GOLD", 2, "navalStationedSettlements", age=True)], cond=("naval", 0.6, 1.5), what=(
            "+2/4/6 Gold in settlements with a naval unit stationed on a district",
            "+2/4/6 золота в поселениях с морским юнитом в районе")),
    "MEMENTO_SAYYIDA_AL_HURRA_GAZELLE_VASE": E(
        [Y("CULTURE", 25, "diploActionsAccepted", age=True, lump=True)], fit=["endeavors", "influence"], what=(
            "+25/50/75 Culture per diplomatic action another leader accepts",
            "+25/50/75 культуры за каждый дипломатический процесс, принятый другим лидером")),
    "MEMENTO_TECUMSEH_POTESKWATE": E([Y("FOOD", 1, "townsXsuzerains", age=True)], cond=SUZERAIN, fit=["towns"], what=(
        "+1/2/3 Food in towns per city-state you are suzerain of",
        "+1/2/3 пищи в городках за каждый город-государство, сюзереном которого вы являетесь")),
    "MEMENTO_TECUMSEH_WARCLUB": E([LV("combat", 0.4, basis="suzerains")], cond=SUZERAIN, fit=["infantry"], what=(
        "+1 Combat Strength for infantry per city-state you are suzerain of",
        "+1 к боевой мощи пехоты за каждый город-государство, сюзереном которого вы являетесь")),
    "MEMENTO_TECUMSEH_WAMPUM_BELT": E([Y("PRODUCTION", 1, "citiesXsuzerains", age=True)], cond=SUZERAIN, what=(
        "+1/2/3 Production in cities per city-state you are suzerain of",
        "+1/2/3 производства в городах за каждый город-государство, сюзереном которого вы являетесь")),
    "MEMENTO_TOYOTOMI_HIDEYOSHI_KABUTO": E([Y("DIPLOMACY", 3, age=True)], what=(
        "+3/6/9 Influence per turn",
        "+3/6/9 влияния за ход")),
    "MEMENTO_TOYOTOMI_HIDEYOSHI_HONEBAMI": E([LV("move", 0.3)], fit=["war"], what=(
        "+1 Movement for tier 3 units",
        "+1 к перемещению юнитов 3 уровня")),
    "MEMENTO_TOYOTOMI_HIDEYOSHI_TEA_CEREMONY_KIT": E(
        [Y("PRODUCTION", 0.2, "productionCultureBuildings", lump=True, w=W_CULTURE_BUILDINGS)], what=(
            "+20% Production towards Altars, Temples and Museums",
            "+20% производства на алтари, храмы и музеи")),
    "MEMENTO_WASHINGTON_CONSTITUTION": E([Y("DIPLOMACY", 1, "citiesXtraditions")], fit=["traditions"], what=(
        "+1 Influence in cities per slotted tradition",
        "+1 влияния в городах за каждую традицию в правительстве")),
    "MEMENTO_WASHINGTON_CIRCUMFERENTOR": E([LV("pop", 1, basis="settlersTrained")], fit=["expansion"], what=(
        "A free Migrant with every Settler you train",
        "Эмигрант с каждым созданным поселенцем")),
    "MEMENTO_WASHINGTON_BASTILLE_KEY": E(
        [Y("FOOD", 1, "citiesXtraditions"), Y("HAPPINESS", 1, "citiesXtraditions")], fit=["traditions"], what=(
            "+1 Food and Happiness in cities per slotted tradition",
            "+1 пищи и довольства в городах за каждую традицию в правительстве")),
    "MEMENTO_YI_SUN_SIN_GEOBUKSEON_BLUEPRINT": E([LV("combat", 2 * 0.3 * 0.5)], cond=NAVAL, what=(
        "+2 Combat Strength for naval units when defending",
        "+2 к боевой мощи морских юнитов при обороне")),
    "MEMENTO_YI_SUN_SIN_JANGGEOM": E([LV("commanderXP10", 2)], cond=("naval", 0.3, 1.0), what=(
        "+20% Fleet Commander XP",
        "+20% опыта командиров флота")),
    "MEMENTO_YI_SUN_SIN_NANJUNG_ILGI": E(
        [Y("PRODUCTION", 0.2, "productionScienceBuildings", lump=True, w=W_SCIENCE_BUILDINGS)],
        fit=["science_buildings"], what=(
            "+20% Production towards science buildings",
            "+20% производства на строительство научных зданий")),
}

# Fallback for a memento the table does not know (a new DLC or mod): a small value
# in the focus of its attribute tag, so it can still appear but never dominates.
FALLBACK_BY_ATTRIBUTE = {
    "LOC_ATTRIBUTE_SCIENTIFIC": "SCIENTIFIC", "LOC_ATTRIBUTE_CULTURAL": "CULTURAL",
    "LOC_ATTRIBUTE_ECONOMIC": "ECONOMIC", "LOC_ATTRIBUTE_MILITARISTIC": "MILITARISTIC",
    "LOC_ATTRIBUTE_EXPANSIONIST": "EXPANSIONIST", "LOC_ATTRIBUTE_DIPLOMATIC": "POLITICAL",
}
