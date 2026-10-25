"""The memento scoring method (research/16-memento-scoring.md explains it).

Unit of value: "points" = percent added to one age's output, weighted by how
much that output matters to the focus. +10% Science in a science game = 10
points; one extra policy slot = 10 points in every focus.

A memento is evaluated for ONE age: the age it is chosen for (the start age,
or the next age at a transition). The game offers memento selection again at
every age transition (AgeTransitionPlayerMemento* parameters), so each pick
only has to be good until the next transition; and any civilization may play
in any age, so that age is not always the civilization's own (build_table.py
scores every pair in every age). Permanent gains (attribute points) carry a
horizon factor for the ages still to come.
"""
import re

FOCUSES = ("CULTURE", "SCIENCE", "ECONOMIC", "MILITARY")
RANKINGS = ("BALANCED",) + FOCUSES
AGES = ("AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN")
AGE_SHORT = {"AGE_ANTIQUITY": "AQ", "AGE_EXPLORATION": "EX", "AGE_MODERN": "MO"}
AGE_NAME = {
    "AGE_ANTIQUITY": ("Antiquity", "Древность"),
    "AGE_EXPLORATION": ("Exploration", "Эпоха исследований"),
    "AGE_MODERN": ("Modern", "Новое время"),
}
AGE_MULT = (1, 2, 3)          # ScaleByGameAge extra="100": x1 / x2 / x3
TURNS_PER_AGE = 100           # lump sums are spread over an age of ~100 turns (standard speed)

# ------------------------------------------------------------------ outputs
# The reference empire's output per turn, averaged over each age (standard speed,
# a competent single-player game). A flat bonus is turned into "% of output" with these.
REF_OUTPUT = {
    "SCIENCE":    (50, 200, 450),
    "CULTURE":    (40, 160, 380),
    "GOLD":       (35, 90, 200),
    "PRODUCTION": (50, 160, 350),
    "FOOD":       (50, 130, 260),
    "HAPPINESS":  (25, 70, 140),
    "DIPLOMACY":  (10, 25, 50),
}

# How much +1% of a yield matters to each focus (rows: yield, columns: focus).
YIELD_WEIGHT = {
    "SCIENCE":    {"CULTURE": 0.25, "SCIENCE": 1.00, "ECONOMIC": 0.25, "MILITARY": 0.25},
    "CULTURE":    {"CULTURE": 1.00, "SCIENCE": 0.25, "ECONOMIC": 0.25, "MILITARY": 0.20},
    "GOLD":       {"CULTURE": 0.25, "SCIENCE": 0.25, "ECONOMIC": 0.90, "MILITARY": 0.35},
    "PRODUCTION": {"CULTURE": 0.50, "SCIENCE": 0.50, "ECONOMIC": 0.50, "MILITARY": 0.80},
    "FOOD":       {"CULTURE": 0.30, "SCIENCE": 0.30, "ECONOMIC": 0.30, "MILITARY": 0.20},
    "HAPPINESS":  {"CULTURE": 0.25, "SCIENCE": 0.15, "ECONOMIC": 0.15, "MILITARY": 0.15},
    "DIPLOMACY":  {"CULTURE": 0.12, "SCIENCE": 0.10, "ECONOMIC": 0.12, "MILITARY": 0.10},
}
# Growth matters less as the game nears its end: Food's weights shrink by age.
FOOD_AGE_FACTOR = (1.0, 0.85, 0.65)

YIELD_NAME = {
    "SCIENCE": ("Science", "науки"), "CULTURE": ("Culture", "культуры"), "GOLD": ("Gold", "золота"),
    "PRODUCTION": ("Production", "производства"), "FOOD": ("Food", "пищи"),
    "HAPPINESS": ("Happiness", "довольства"), "DIPLOMACY": ("Influence", "влияния"),
}

REF_OUTPUT_SCIENCE = REF_OUTPUT["SCIENCE"]
REF_OUTPUT_FOOD = REF_OUTPUT["FOOD"]

# ------------------------------------------------------------------ the reference empire
# Average counts over each age (or events per age for lump sums). Every number a
# memento multiplies by comes from here, so the method can be checked line by line.
REF = {
    "flat": (1, 1, 1),
    "cities": (3, 5, 7),
    "towns": (3, 5, 6),
    "settlements": (6, 10, 13),
    "specialists": (5, 20, 45),
    "techMasteries": (5, 5, 5),            # completed tech masteries, average active over the age
    "techsPerAge": (16, 15, 17),           # techs researched in the age (events)
    "masteriesPerAge": (10, 10, 8),        # tech + civic masteries completed in the age (events)
    "masteryCost": (335, 1600, 4000),      # average node cost (progression-trees-tech.xml)
    "resourcesInCities": (4, 8, 12),
    "importedResources": (1, 2, 4),
    "tradeRoutes": (1, 3, 4),
    "wonderCities": (1, 2, 2),             # cities with at least one wonder
    "wonders": (1.5, 2.5, 3),
    "wondersOutsideCapital": (0.5, 1.5, 2),
    "greatWorks": (1, 4, 8),               # displayed
    "suzerains": (1, 1.5, 2),              # city-states you are suzerain of (average)
    "suzerainEvents": (2, 2, 1.5),         # times you become suzerain (events)
    "townsXsuzerains": (3, 7.5, 12),
    "citiesXsuzerains": (3, 7.5, 14),
    "commanderLevels": (2, 4, 6),          # promotions held by army commanders (average)
    "commanderXP": (80, 150, 200),         # commander XP earned per age (events)
    "militaryBuildings": (2, 3, 4),
    "scienceBuildings": (3, 6, 9),
    "scienceBuildingsBuilt": (5, 7, 9),    # events per age
    "happinessBuildings": (3, 6, 8),
    "goldBuildings": (3, 6, 8),
    "uniqueConstructibles": (3, 5, 7),     # unique buildings + unique improvements standing
    "quarterTiles": (2, 4, 6),
    "traditions": (1, 2, 3),
    "policies": (2, 3, 4),                 # non-tradition policies slotted
    "citiesXtraditions": (3, 10, 21),
    "celebrationsPerAge": (3, 4, 4),
    "narrativeEvents": (10, 10, 10),
    "attrPointsSpent": (4, 4, 4),          # all trees, per age
    "attrPointsOneTree": (1.5, 1.5, 1.5),  # spent in one given tree, per age
    "attrTreesWithPoints": (2.5, 4, 5),
    "naturalWonderTiles": (0.5, 1, 1.5),
    "majorTriumphs": (1, 1.5, 1.5),        # completed in the age, average active
    "continents": (1, 2.5, 3),
    "pastures": (1, 2, 2),
    "unfriendlyLeaders": (1, 1.5, 2),
    "sanctions": (0.5, 1, 1),
    "conqueredSettlements": (1, 1.5, 2),   # in a war game; the war condition discounts it
    "warsDeclaredOnYou": (0.5, 0.6, 0.6),
    "warsYouDeclare": (1, 1, 1),           # in a war game; the war condition discounts it
    "returnedSettlements": (0.3, 0.3, 0.3),
    "diploActionsAccepted": (3, 5, 6),
    "goldIncome": (25, 70, 160),
    "capitalExcessHappiness": (10, 15, 20),
    "explored100": (3, 5, 1),              # 100-tile batches revealed per age
    "settlersTrained": (3, 3, 1),
    "espionageSuccesses": (0, 1, 2),
    "landUnits": (6, 10, 12),
    "cavalryUnits": (2, 3, 3),
    "navalUnits": (1, 3, 3),
    "stationedUnits": (1, 1.5, 2),         # units kept in a palace / city hall
    "navalStationedSettlements": (0.5, 1.5, 2),
    "urbanTilesNearMountains": (2, 4, 6),
    "happyCities": (2, 3.5, 5),
    "alliances": (0.5, 0.7, 0.8),          # average number of allies
    "navalKills": (1, 4, 4),
    "productionHappinessBuildings": (300, 900, 1500),   # spent per age
    "productionScienceBuildings": (300, 900, 1500),
    "productionCultureBuildings": (200, 700, 1200),
    "techBoostValue": (170, 800, 2000),    # 50% of an average tech
}

# Derived counts (kept separate so each factor above stays readable).
REF["masteryProduction"] = tuple(n * c / TURNS_PER_AGE for n, c in zip(REF["masteriesPerAge"], REF["masteryCost"]))
REF["techBoostWar"] = tuple(v * w for v, w in zip(REF["techBoostValue"], REF["warsYouDeclare"]))
# Eagle Banner: +2% of a city's Science per great work there ~ 2% x works x (empire Science / cities).
REF["gwScienceShare"] = tuple(g * s / c / 100 for g, s, c in zip(REF["greatWorks"], REF_OUTPUT_SCIENCE, REF["cities"]))
# Brush & Scroll: +5% growth per specialist in the city (max 25%), on a food surplus of ~40% of Food.
REF["brushScrollFood"] = tuple(min(25, 5 * sp / c) / 100 * 0.4 * f
                               for sp, c, f in zip(REF["specialists"], REF["cities"], REF_OUTPUT_FOOD))

# Non-yield levers: points (% of focus output) per unit, by age, and focus weights.
LEVERS = {
    "policySlot": ((12, 10, 9), {"CULTURE": 1, "SCIENCE": 1, "ECONOMIC": 1, "MILITARY": 1}),
    "settlementCap": ((8, 6, 4), {"CULTURE": 0.8, "SCIENCE": 0.8, "ECONOMIC": 0.9, "MILITARY": 1.0}),
    "combat": ((10, 10, 10), {"CULTURE": 0.15, "SCIENCE": 0.15, "ECONOMIC": 0.15, "MILITARY": 1.0}),
    "move": ((8, 8, 8), {"CULTURE": 0.1, "SCIENCE": 0.1, "ECONOMIC": 0.1, "MILITARY": 1.0}),
    "sight": ((1, 1, 1), {"CULTURE": 0.2, "SCIENCE": 0.2, "ECONOMIC": 0.2, "MILITARY": 1.0}),
    "heal": ((1, 1, 1), {"CULTURE": 0.1, "SCIENCE": 0.1, "ECONOMIC": 0.1, "MILITARY": 1.0}),
    "warSupport": ((5, 5, 5), {"CULTURE": 0.3, "SCIENCE": 0.3, "ECONOMIC": 0.3, "MILITARY": 1.0}),
    "commanderXP10": ((0.8, 0.8, 0.8), {"CULTURE": 0.1, "SCIENCE": 0.1, "ECONOMIC": 0.1, "MILITARY": 1.0}),
    "commanderUtility": ((2, 2, 2), {"CULTURE": 0.1, "SCIENCE": 0.1, "ECONOMIC": 0.1, "MILITARY": 1.0}),
    "unitPurchase": ((3, 3, 3), {"CULTURE": 0.2, "SCIENCE": 0.2, "ECONOMIC": 0.2, "MILITARY": 1.0}),
    "warDiplomacy": ((2, 2, 2), {"CULTURE": 0.3, "SCIENCE": 0.3, "ECONOMIC": 0.3, "MILITARY": 1.0}),
    "diplomacy": ((1.5, 1.5, 1.5), {"CULTURE": 1, "SCIENCE": 1, "ECONOMIC": 1, "MILITARY": 1}),
    "tradeCapacity": ((8, 8, 6), {"CULTURE": 0.35, "SCIENCE": 0.35, "ECONOMIC": 1.0, "MILITARY": 0.35}),
    "tradeRange": ((2, 1.5, 1), {"CULTURE": 0.3, "SCIENCE": 0.3, "ECONOMIC": 1.0, "MILITARY": 0.3}),
    "civilianMove": ((3, 2, 1), {"CULTURE": 0.6, "SCIENCE": 0.6, "ECONOMIC": 1.0, "MILITARY": 0.6}),
    "explore": ((1.5, 1, 0), {"CULTURE": 1, "SCIENCE": 1, "ECONOMIC": 1, "MILITARY": 1}),
    "settlerSafety": ((1, 0.5, 0.2), {"CULTURE": 1, "SCIENCE": 1, "ECONOMIC": 1, "MILITARY": 1}),
    "pop": ((2.5, 1.2, 0.7), {"CULTURE": 0.8, "SCIENCE": 0.8, "ECONOMIC": 0.8, "MILITARY": 0.7}),
    "celebrationTime": ((3, 3, 3), {"CULTURE": 1.0, "SCIENCE": 0.7, "ECONOMIC": 0.7, "MILITARY": 0.7}),
    # A great-work slot: codices (science) in Antiquity, relics and artifacts (culture) later.
    "gwSlot": ((0.4, 0.8, 0.8), None),
}
GW_SLOT_WEIGHTS = (
    {"CULTURE": 0.6, "SCIENCE": 1.0, "ECONOMIC": 0.2, "MILITARY": 0.1},
    {"CULTURE": 1.0, "SCIENCE": 0.2, "ECONOMIC": 0.2, "MILITARY": 0.1},
    {"CULTURE": 1.0, "SCIENCE": 0.2, "ECONOMIC": 0.2, "MILITARY": 0.1},
)

# An attribute point: 4% per age it stays useful; it is permanent, so earlier is better.
ATTR_POINT = (4 * 1.6, 4 * 1.3, 4 * 1.0)
ATTR_WEIGHTS = {
    "SCIENTIFIC": {"CULTURE": 0.35, "SCIENCE": 1.0, "ECONOMIC": 0.35, "MILITARY": 0.35},
    "CULTURAL": {"CULTURE": 1.0, "SCIENCE": 0.35, "ECONOMIC": 0.35, "MILITARY": 0.3},
    "ECONOMIC": {"CULTURE": 0.4, "SCIENCE": 0.4, "ECONOMIC": 1.0, "MILITARY": 0.4},
    "MILITARISTIC": {"CULTURE": 0.3, "SCIENCE": 0.3, "ECONOMIC": 0.3, "MILITARY": 1.0},
    "EXPANSIONIST": {"CULTURE": 0.6, "SCIENCE": 0.6, "ECONOMIC": 0.6, "MILITARY": 0.75},
    "POLITICAL": {"CULTURE": 0.5, "SCIENCE": 0.5, "ECONOMIC": 0.5, "MILITARY": 0.5},
}

FIT_STEP = 0.15      # x1.15 when the leader's abilities mention the memento's lever, same for the civ
FIT_CAP = 1.30


# ------------------------------------------------------------------ terms (built in mma_values.py)

def Y(yld, amt, basis="flat", age=False, lump=False, share=1.0, cond=None, w=None):
    """amt of a yield per unit of `basis`; age=True: x1/x2/x3; lump: a one-off, spread over the age.
    w: focus weights for this term instead of the yield's own (production poured into one building kind)."""
    return {"t": "Y", "yield": yld, "amt": amt, "basis": basis, "age": age, "lump": lump,
            "share": share, "cond": cond, "w": w}


def PCT(yld, pct, cond=None):
    """A direct percentage of that yield's output."""
    return {"t": "PCT", "yield": yld, "pct": pct, "cond": cond}


def LV(lever, n=1.0, cond=None, basis=None):
    """n units of a non-yield lever (see LEVERS), times REF[basis] when given."""
    return {"t": "LV", "lever": lever, "n": n, "cond": cond, "basis": basis}


def ATTR(kind, n=1):
    return {"t": "ATTR", "kind": kind, "n": n, "cond": None}


def _uptime(cond, matched):
    """cond = (tag, without, with): the share of the age the bonus works."""
    if not cond:
        return 1.0
    tag, base, fit = cond
    return fit if tag in matched else base


def eval_terms(entry, age_i, matched):
    """-> (points per focus, expected yields per turn {yield: amount}, lever list)."""
    pts = {f: 0.0 for f in FOCUSES}
    yields = {}
    levers = []
    whole = _uptime(entry.get("cond"), matched)
    for term in entry["terms"]:
        up = whole * _uptime(term.get("cond"), matched)
        t = term["t"]
        if t == "Y":
            per = term["amt"] * REF[term["basis"]][age_i] * term["share"] * up
            if term["age"]:
                per *= AGE_MULT[age_i]
            if term["lump"]:
                per /= TURNS_PER_AGE
            yields[term["yield"]] = yields.get(term["yield"], 0.0) + per
            pct = 100.0 * per / REF_OUTPUT[term["yield"]][age_i]
            w = term.get("w") or YIELD_WEIGHT[term["yield"]]
            if term["yield"] == "FOOD":
                pct *= FOOD_AGE_FACTOR[age_i]
            for f in FOCUSES:
                pts[f] += pct * w[f]
        elif t == "PCT":
            pct = term["pct"] * up
            yields[term["yield"]] = yields.get(term["yield"], 0.0) + REF_OUTPUT[term["yield"]][age_i] * pct / 100
            for f in FOCUSES:
                pts[f] += pct * YIELD_WEIGHT[term["yield"]][f]
        elif t == "LV":
            per_unit, w = LEVERS[term["lever"]]
            if w is None:
                w = GW_SLOT_WEIGHTS[age_i]
            v = per_unit[age_i] * term["n"] * up
            if term.get("basis"):
                v *= REF[term["basis"]][age_i]
            levers.append(term["lever"])
            for f in FOCUSES:
                pts[f] += v * w[f]
        elif t == "ATTR":
            v = ATTR_POINT[age_i] * term["n"]
            levers.append("attr:" + term["kind"])
            for f in FOCUSES:
                pts[f] += v * ATTR_WEIGHTS[term["kind"]][f]
    return pts, yields, levers


def entry_tags(entry):
    """Tags whose presence on the leader or civ matters to this memento."""
    tags = set(entry.get("fit", []))
    for c in [entry.get("cond")] + [t.get("cond") for t in entry["terms"]]:
        if c:
            tags.add(c[0])
    return tags


def score(entry, age_i, leader_tags, civ_tags):
    """Final points per ranking for one memento, plus what matched (for the reason)."""
    matched = set(leader_tags) | set(civ_tags)
    pts, yields, levers = eval_terms(entry, age_i, matched)
    fit = set(entry.get("fit", []))
    m = 1.0
    hits = []
    if fit & set(leader_tags):
        m += FIT_STEP
        hits.append(("L", sorted(fit & set(leader_tags))))
    if fit & set(civ_tags):
        m += FIT_STEP
        hits.append(("C", sorted(fit & set(civ_tags))))
    m = min(m, FIT_CAP)
    cond_hits = []
    for c in [entry.get("cond")] + [t.get("cond") for t in entry["terms"]]:
        if c and c[0] in matched:
            src = "L" if c[0] in leader_tags else "C"
            cond_hits.append((src, c[0]))
    out = {f: pts[f] * m for f in FOCUSES}
    out["BALANCED"] = sum(out[f] for f in FOCUSES) / len(FOCUSES)
    return out, {"mult": m, "fit": hits, "cond": cond_hits, "yields": yields, "levers": levers}


# ------------------------------------------------------------------ tags from text

TEXT_TAGS = [
    ("science", r"\bscience\b"),
    ("culture", r"\bculture\b"),
    ("gold", r"\bgold\b"),
    ("production", r"\bproduction\b"),
    ("food", r"\bfood\b|\bgrowth rate\b"),
    ("happiness", r"\bhappiness\b"),
    ("influence", r"\binfluence\b"),
    ("specialists", r"\bspecialists?\b"),
    ("masteries", r"\bmaster(y|ies)\b"),
    ("techs", r"\btech(s|nology|nologies)?\b"),
    ("civics", r"\bcivics?\b"),
    ("wonders", r"(?<!natural )\bwonders?\b"),
    ("natural_wonders", r"natural wonders?"),
    ("great_works", r"great works?|\bcodex\b|\bcodices\b|\brelics?\b|\bartifacts?\b"),
    ("towns", r"\btowns?\b"),
    ("expansion", r"settlement limit|\bsettlers?\b|\bmigrants?\b|new towns|\bcolonists?\b"),
    ("trade", r"trade routes?|\bmerchants?\b"),
    ("resources", r"\bresources?\b"),
    ("naval", r"\bnaval\b|\bfleet\b|\bships?\b"),
    ("coast", r"\bcoast(al)?\b"),
    ("cavalry", r"\bcavalry\b|\bmounted\b"),
    ("infantry", r"\binfantry\b"),
    ("ranged", r"\branged units?\b"),
    ("commanders", r"\bcommanders?\b"),
    ("war", r"\bwars?\b|\bconquer|\bcapture|war support"),
    ("celebration", r"\bcelebrations?\b"),
    ("alliance", r"\balliances?\b|\ballies\b|\bally\b"),
    ("suzerain", r"city-states?|\bsuzerain"),
    ("traditions", r"\btraditions?\b"),
    ("policies", r"\bpolic(y|ies)\b"),
    ("endeavors", r"\bendeavors?\b"),
    ("sanctions", r"\bsanctions?\b"),
    ("espionage", r"\bespionage\b"),
    ("narrative", r"narrative events?"),
    ("tundra", r"\btundra\b"),
    ("mountains", r"\bmountains?\b"),
    ("desert", r"\bdesert\b|\bplains\b"),
    ("rivers", r"\brivers?\b"),
    ("quarters", r"\bquarters?\b"),
    ("science_buildings", r"science buildings?"),
    ("military_buildings", r"military buildings?|\bfortifications?\b"),
    ("happiness_buildings", r"happiness buildings?"),
    ("gold_buildings", r"gold buildings?"),
    ("pastures", r"\bpastures?\b"),
    ("attributes", r"attribute points?|attribute trees?"),
]
_TEXT_TAGS = [(t, re.compile(p, re.I)) for t, p in TEXT_TAGS]

UNIT_CLASS_TAGS = {
    "UNIT_CLASS_NAVAL": "naval",
    "UNIT_CLASS_CAVALRY": "cavalry",
    "UNIT_CLASS_MOUNTED": "cavalry",
    "UNIT_CLASS_INFANTRY": "infantry",
    "UNIT_CLASS_RANGED": "ranged",
    "UNIT_CLASS_ARMY_COMMANDER": "commanders",
    "UNIT_CLASS_CREATE_TOWN": "expansion",
    "UNIT_CLASS_MAKE_TRADE_ROUTE": "trade",
    "UNIT_CLASS_TRADE_ROUTE": "trade",
}

TAG_LABEL = {
    "science": ("Science", "наука"), "culture": ("Culture", "культура"), "gold": ("Gold", "золото"),
    "production": ("Production", "производство"), "food": ("Food", "пища"),
    "happiness": ("Happiness", "довольство"), "influence": ("Influence", "влияние"),
    "specialists": ("specialists", "специалисты"), "masteries": ("masteries", "усовершенствования"),
    "techs": ("technologies", "технологии"), "civics": ("civics", "социальные институты"),
    "wonders": ("wonders", "чудеса"), "natural_wonders": ("natural wonders", "чудеса природы"),
    "great_works": ("great works", "шедевры"), "towns": ("towns", "городки"),
    "expansion": ("expansion", "расширение"), "trade": ("trade routes", "торговые пути"),
    "resources": ("resources", "ресурсы"), "naval": ("naval units", "морские юниты"),
    "coast": ("coast", "побережье"), "cavalry": ("cavalry", "кавалерия"), "infantry": ("infantry", "пехота"),
    "ranged": ("ranged units", "дальнобойные юниты"), "commanders": ("commanders", "командиры"),
    "war": ("war", "война"), "celebration": ("celebrations", "празднества"),
    "alliance": ("alliances", "союзы"), "suzerain": ("city-states", "города-государства"),
    "traditions": ("traditions", "традиции"), "policies": ("policies", "общественные курсы"),
    "endeavors": ("endeavors", "инициативы"), "sanctions": ("sanctions", "санкции"),
    "espionage": ("espionage", "шпионаж"), "narrative": ("narrative events", "сюжетные события"),
    "tundra": ("tundra", "тундра"), "mountains": ("mountains", "горы"),
    "desert": ("plains and desert", "равнины и пустыня"), "rivers": ("rivers", "реки"),
    "quarters": ("quarters", "кварталы"), "science_buildings": ("science buildings", "научные здания"),
    "military_buildings": ("military buildings", "военные здания"),
    "happiness_buildings": ("happiness buildings", "здания довольства"),
    "gold_buildings": ("gold buildings", "здания золота"), "pastures": ("pastures", "пастбища"),
    "unique_improvements": ("unique improvements", "уникальные улучшения"),
    "unique_quarter": ("unique quarter", "уникальный квартал"),
    "attr_SCIENTIFIC": ("Scientific attribute", "характеристика «наука»"),
    "attr_CULTURAL": ("Cultural attribute", "характеристика «культура»"),
    "attr_ECONOMIC": ("Economic attribute", "характеристика «экономика»"),
    "attr_MILITARISTIC": ("Militaristic attribute", "характеристика «военное дело»"),
    "attr_EXPANSIONIST": ("Expansionist attribute", "характеристика «экспансионизм»"),
    "attr_POLITICAL": ("Diplomatic attribute", "характеристика «дипломатия»"),
    "attributes": ("attribute points", "очки характеристик"),
}


def text_tags(text):
    return {t for t, rx in _TEXT_TAGS if rx.search(text or "")}


ATTR_OF_TRAIT = {
    "TRAIT_LEADER_ATTRIBUTE_SCIENTIFIC": "SCIENTIFIC", "TRAIT_LEADER_ATTRIBUTE_CULTURAL": "CULTURAL",
    "TRAIT_LEADER_ATTRIBUTE_ECONOMIC": "ECONOMIC", "TRAIT_LEADER_ATTRIBUTE_MILITARISTIC": "MILITARISTIC",
    "TRAIT_LEADER_ATTRIBUTE_EXPANSIONIST": "EXPANSIONIST", "TRAIT_LEADER_ATTRIBUTE_POLITICAL": "POLITICAL",
}
ATTR_OF_CONFIG_TAG = {
    "TAG_TRAIT_SCIENTIFIC": "SCIENTIFIC", "TAG_TRAIT_CULTURAL": "CULTURAL", "TAG_TRAIT_ECONOMIC": "ECONOMIC",
    "TAG_TRAIT_MILITARISTIC": "MILITARISTIC", "TAG_TRAIT_EXPANSIONIST": "EXPANSIONIST",
    "TAG_TRAIT_POLITICAL": "POLITICAL",
}
FOCUS_OF_ATTR = {"SCIENTIFIC": "SCIENCE", "CULTURAL": "CULTURE", "ECONOMIC": "ECONOMIC", "MILITARISTIC": "MILITARY"}
VICTORY_RE = re.compile(r"^TRAIT_(AQ|EX|MO)_(CULTURE|SCIENCE|ECONOMIC|MILITARY)_VICTORY$")
AGE_OF_PREFIX = {"AQ": "AGE_ANTIQUITY", "EX": "AGE_EXPLORATION", "MO": "AGE_MODERN"}

# Yield words in ability text -> a lean toward a focus (only used when traits do not decide).
LEAN_OF_TAG = {"science": "SCIENCE", "masteries": "SCIENCE", "specialists": "SCIENCE",
               "culture": "CULTURE", "wonders": "CULTURE", "great_works": "CULTURE",
               "gold": "ECONOMIC", "trade": "ECONOMIC", "resources": "ECONOMIC",
               "war": "MILITARY", "commanders": "MILITARY", "cavalry": "MILITARY", "infantry": "MILITARY"}


def leader_profile(leader, plain_en):
    """Tags, attributes and preferred victory per age for a leader record from GameData."""
    tags = set()
    attrs = []
    victory = {a: [] for a in AGES}
    for t in leader["traits"]:
        if t in ATTR_OF_TRAIT:
            attrs.append(ATTR_OF_TRAIT[t])
        m = VICTORY_RE.match(t)
        if m:
            victory[AGE_OF_PREFIX[m.group(1)]].append(m.group(2))
        if t == "TRAIT_LEADER_AGGRESSIVE":
            tags.add("war")
    if not attrs:  # Ibn Battuta: the frontend tags still say what he leans to
        attrs = [ATTR_OF_CONFIG_TAG[t] for t in leader["configTags"] if t in ATTR_OF_CONFIG_TAG]
    for a in attrs:
        tags.add("attr_" + a)
    for ab in leader["abilities"]:
        tags |= text_tags(plain_en(ab["nameTag"]) + " " + plain_en(ab["descTag"]))
    return {"tags": sorted(tags), "attributes": attrs, "victory": victory}


def civ_profile(civ, plain_en, unit_tags):
    tags = set()
    attrs = [ATTR_OF_CONFIG_TAG[t] for t in civ["configTags"] if t in ATTR_OF_CONFIG_TAG]
    for a in attrs:
        tags.add("attr_" + a)
    for it in civ["items"]:
        kind = it["kind"]
        if kind == "KIND_UNIT":
            for c in unit_tags.get(it["type"], ()):
                if c in UNIT_CLASS_TAGS:
                    tags.add(UNIT_CLASS_TAGS[c])
            continue
        if kind == "KIND_IMPROVEMENT":
            tags.add("unique_improvements")
        if kind == "KIND_QUARTER":
            tags.add("unique_quarter")
        text = plain_en(it["descTag"])
        if kind != "KIND_TRAIT":
            # "+1 Culture Adjacency for Quarters and Wonders" says nothing about the civ's plan.
            text = " ".join(s for s in re.split(r"(?<=\.)\s+", text) if "adjacency" not in s.lower())
        tags |= text_tags(plain_en(it["nameTag"]) + " " + text)
    return {"tags": sorted(tags), "attributes": attrs}


def default_focus(leader_prof, civ_prof, age):
    """The leader's victory trait for this age; ties and gaps settled by attributes and the civ."""
    lean = {f: 0.0 for f in FOCUSES}
    if leader_prof:
        for a in leader_prof["attributes"]:
            if a in FOCUS_OF_ATTR:
                lean[FOCUS_OF_ATTR[a]] += 1.0
        for t in leader_prof["tags"]:
            if t in LEAN_OF_TAG:
                lean[LEAN_OF_TAG[t]] += 0.25
    if civ_prof:
        for a in civ_prof["attributes"]:
            if a in FOCUS_OF_ATTR:
                lean[FOCUS_OF_ATTR[a]] += 1.5
        for t in civ_prof["tags"]:
            if t in LEAN_OF_TAG:
                lean[LEAN_OF_TAG[t]] += 0.1
    traits = leader_prof["victory"][age] if leader_prof else []
    if not traits and leader_prof:
        # A leader with traits in other ages only: use the closest age's.
        for a in AGES:
            if leader_prof["victory"][a]:
                traits = leader_prof["victory"][a]
                break
    candidates = list(dict.fromkeys(traits)) or list(FOCUSES)
    order = {f: i for i, f in enumerate(("SCIENCE", "CULTURE", "ECONOMIC", "MILITARY"))}
    return max(candidates, key=lambda f: (lean[f], -order[f]))
