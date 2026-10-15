"""Read the Civilization VII game files the memento advisor needs.

Standard library only. Every reader is tolerant: a missing file or table
yields an empty result, so a game update that moves data shows up as a
warning in the generator, not as a crash.

What is read (paths relative to the game root):
- Mementos: Base/modules/base-standard/data/mementos*.xml and
  DLC/*/modules/data/mementos*.xml (gameplay rows and their modifiers);
  the frontend rows (config Tag, LeaderSpecific) from every config/config.xml.
- Legend paths: Base/modules/base-standard/metaprogression/legend-paths/*.xml
  and DLC/*/modules/metaprogression/*.xml (which level of which path unlocks
  each memento).
- Leaders: gameplay Leaders/LeaderTraits/TraitModifiers in data/leaders*.xml,
  frontend Leaders/LeaderItems/LeaderTags in config/config.xml.
- Civilizations: frontend Civilizations/CivilizationItems/CivilizationTags/
  LeaderCivilizationBias in config/config.xml (Base age modules and DLC).
- Units: TypeTags (UNIT_CLASS_*) and Units rows, to tag unique units.
- Text: every text/en_us/*.xml (English) and every *ru_RU*Text.xml (Russian).
"""
import glob
import os
import re
import xml.etree.ElementTree as ET

DEFAULT_GAME_ROOT = r"D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII"

AGES = ("AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN")
AGE_BY_DOMAIN = {
    "AntiquityAgeCivilizations": "AGE_ANTIQUITY",
    "ExplorationAgeCivilizations": "AGE_EXPLORATION",
    "ModernAgeCivilizations": "AGE_MODERN",
}


# ---------------------------------------------------------------- XML helpers

def _strip_ns(elem):
    for e in elem.iter():
        if isinstance(e.tag, str) and "}" in e.tag:
            e.tag = e.tag.split("}", 1)[1]
    return elem


def load_xml(path):
    """Parse an XML file, or return None when it is missing or broken."""
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError:
        return None
    text = raw.decode("utf-8-sig", errors="replace")
    # ElementTree refuses an encoding declaration on a str: drop it.
    text = re.sub(r"^\s*<\?xml[^>]*\?>", "", text, count=1)
    try:
        return _strip_ns(ET.fromstring(text))
    except ET.ParseError:
        return None


def table_rows(root, table):
    """All <Row> attribute dicts of every <table> element under root."""
    out = []
    if root is None:
        return out
    for t in root.iter(table):
        for row in t:
            if row.tag == "Row":
                d = dict(row.attrib)
                # Some rows put values in child elements.
                for child in row:
                    if child.tag not in d and child.text and child.text.strip():
                        d[child.tag] = child.text.strip()
                out.append(d)
    return out


def rel(game_root, path):
    return os.path.relpath(path, game_root).replace("\\", "/")


def source_of(game_root, path):
    """'base' or the DLC folder name for a file path."""
    r = rel(game_root, path)
    if r.startswith("DLC/"):
        return r.split("/")[1]
    return "base"


# ---------------------------------------------------------------- text

def load_text(game_root):
    """Return (en, ru): dicts LOC tag -> text."""
    en, ru = {}, {}
    # English lives in text/en_us/*.xml (base game) or directly in text/*.xml (most DLC).
    en_files = []
    for base in (os.path.join(game_root, "Base", "modules", "*"), os.path.join(game_root, "DLC", "*", "modules")):
        en_files += glob.glob(os.path.join(base, "text", "en_us", "*.xml"))
        en_files += glob.glob(os.path.join(base, "text", "*.xml"))
    for p in sorted(set(en_files)):
        _read_text_file(p, en, "en_US")
    ru_files = glob.glob(os.path.join(game_root, "Base", "modules", "*", "l10n", "*ru_RU*.xml"))
    ru_files += glob.glob(os.path.join(game_root, "DLC", "*", "modules", "l10n", "*ru_RU*.xml"))
    for p in sorted(ru_files):
        _read_text_file(p, ru, "ru_RU")
    return en, ru


def _read_text_file(path, out, language):
    root = load_xml(path)
    if root is None:
        return
    for el in root.iter():
        if el.tag not in ("Row", "Replace"):
            continue
        tag = el.attrib.get("Tag")
        if not tag:
            continue
        lang = el.attrib.get("Language")
        if language and lang and lang != language:
            continue
        txt = el.attrib.get("Text")
        if txt is None:
            t = el.find("Text")
            txt = t.text if t is not None else None
        if txt is not None:
            out[tag] = txt


_ICON_RE = re.compile(r"\[icon:([A-Za-z_]+)\]")
_TIP_RE = re.compile(r"\[TIP:[^\]]*\]|\[/TIP\]")
_STYLE_RE = re.compile(r"\[/?(?:B|b|STYLE[^\]]*|N|LIST|LI|BLIST)\]")
YIELD_EN = {"YIELD_FOOD": "Food", "YIELD_PRODUCTION": "Production", "YIELD_GOLD": "Gold",
            "YIELD_SCIENCE": "Science", "YIELD_CULTURE": "Culture", "YIELD_HAPPINESS": "Happiness",
            "YIELD_DIPLOMACY": "Influence"}


def plain(text):
    """Game markup to plain text: [icon:YIELD_SCIENCE] -> 'Science'; other icons and tooltips dropped."""
    if not text:
        return ""
    text = _TIP_RE.sub("", text)
    text = _ICON_RE.sub(lambda m: YIELD_EN.get(m.group(1), ""), text)
    text = text.replace("[N]", " ").replace("[NEWLINE]", " ")
    text = _STYLE_RE.sub("", text)
    text = re.sub(r"\[[A-Za-z_/]+\]", "", text)
    text = re.sub(r"\s+([.,;:])", r"\1", text)
    text = re.sub(r"\.(?=[+\-−A-ZА-ЯЁ])", ". ", text)          # "Cities.+1 Gold" -> "Cities. +1 Gold"
    text = re.sub(r"\b(\w+)(\s+\1\b)+", r"\1", text, flags=re.I)   # "Gold Gold" (icon + word) -> "Gold"
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- modifiers

def parse_modifier(el):
    """A GameEffects <Modifier> element as a plain dict."""
    args = {}
    scale = {}
    for a in el.findall("Argument"):
        name = a.attrib.get("name")
        args[name] = (a.text or "").strip()
        if a.attrib.get("type"):
            scale[name] = {"type": a.attrib["type"], "extra": a.attrib.get("extra")}
    reqs = []
    for block in ("SubjectRequirements", "OwnerRequirements"):
        b = el.find(block)
        if b is None:
            continue
        for r in b.findall("Requirement"):
            reqs.append({
                "on": "subject" if block.startswith("Subject") else "owner",
                "type": r.attrib.get("type"),
                "inverse": r.attrib.get("inverse") == "true",
                "args": {x.attrib.get("name"): (x.text or "").strip() for x in r.findall("Argument")},
            })
    return {
        "id": el.attrib.get("id"),
        "effect": el.attrib.get("effect"),
        "collection": el.attrib.get("collection"),
        "permanent": el.attrib.get("permanent") == "true",
        "runOnce": el.attrib.get("run-once") == "true",
        "args": args,
        "scaling": scale,
        "requirements": reqs,
    }


def load_modifiers(paths):
    mods = {}
    for p in paths:
        root = load_xml(p)
        if root is None:
            continue
        for el in root.iter("Modifier"):
            if el.attrib.get("id"):
                mods[el.attrib["id"]] = parse_modifier(el)
    return mods


# ---------------------------------------------------------------- game data

class GameData:
    def __init__(self, game_root=DEFAULT_GAME_ROOT):
        self.root = game_root
        if not os.path.isdir(os.path.join(game_root, "Base", "modules")):
            raise SystemExit("Game not found at %s (pass --game)" % game_root)
        self.warnings = []
        self.en, self.ru = load_text(game_root)
        self._load_mementos()
        self._load_legend_paths()
        self._load_units()
        self._load_leaders()
        self._load_civs()

    # -- paths
    def _glob(self, *patterns):
        out = []
        for pat in patterns:
            out += glob.glob(os.path.join(self.root, *pat.split("/")))
        return sorted(set(out))

    def config_files(self):
        return self._glob("Base/modules/*/config/config.xml", "DLC/*/modules/config/config.xml")

    def data_files(self, pattern):
        return self._glob("Base/modules/*/data/" + pattern, "DLC/*/modules/data/" + pattern)

    # -- text lookups
    def t_en(self, tag):
        return self.en.get(tag, "") if tag else ""

    def t_ru(self, tag):
        return self.ru.get(tag, "") if tag else ""

    # -- mementos
    def _load_mementos(self):
        self.mementos = {}
        files = self._glob("Base/modules/base-standard/data/mementos.xml", "DLC/*/modules/data/mementos.xml")
        links = {}
        for p in files:
            root = load_xml(p)
            src = source_of(self.root, p)
            for r in table_rows(root, "Mementos"):
                t = r["MementoType"]
                self.mementos[t] = {"type": t, "source": src, "gameplay": r, "modifierIds": []}
            for r in table_rows(root, "MementoModifiers"):
                links.setdefault(r["MementoType"], []).append(r["ModifierId"])
        effect_files = self._glob("Base/modules/base-standard/data/mementos-gameeffects.xml",
                                  "DLC/*/modules/data/mementos-gameeffects.xml")
        self.memento_modifiers = load_modifiers(effect_files)
        missing = [m for ids in links.values() for m in ids if m not in self.memento_modifiers]
        if missing:
            # Look further: some may live in other gameeffects files.
            extra = load_modifiers(self.data_files("*gameeffects*.xml"))
            for m in missing:
                if m in extra:
                    self.memento_modifiers[m] = extra[m]
        # Nested modifiers (EFFECT_ATTACH_MODIFIERS) are resolved for display.
        for t, ids in links.items():
            if t in self.mementos:
                self.mementos[t]["modifierIds"] = ids
            else:
                self.warnings.append("MementoModifiers row for unknown memento %s" % t)
        for t, m in self.mementos.items():
            for mid in m["modifierIds"]:
                if mid not in self.memento_modifiers:
                    self.warnings.append("%s: modifier %s not found" % (t, mid))
        # Frontend rows: Tag (attribute), LeaderSpecific, unlock text.
        self.memento_config = {}
        for p in self.config_files():
            for r in table_rows(load_xml(p), "Mementos"):
                if r.get("Type", "").startswith("MEMENTO_"):
                    self.memento_config[r["Type"]] = r
        # Icons: Rewards.CustomData (the card's url('blp:<icon>'), see research/15).
        self.memento_icons = {}
        for p in self._glob("Base/modules/*/config/unlockableRewards.xml", "DLC/*/modules/config/unlockableRewards.xml"):
            for r in table_rows(load_xml(p), "Rewards"):
                if r.get("Type") == "UNLOCKABLEREWARD_TYPE_MEMENTO" and r.get("GameItemID"):
                    self.memento_icons[r["GameItemID"]] = r.get("CustomData")

    def memento_modifier_list(self, mtype):
        out = []
        for mid in self.mementos[mtype]["modifierIds"]:
            mod = self.memento_modifiers.get(mid)
            if not mod:
                continue
            out.append(mod)
            if mod["effect"] == "EFFECT_ATTACH_MODIFIERS":
                for inner in (mod["args"].get("ModifierId") or "").split(","):
                    inner = inner.strip()
                    if inner in self.memento_modifiers:
                        out.append(dict(self.memento_modifiers[inner], attachedBy=mid))
        return out

    # -- legend paths
    def _load_legend_paths(self):
        self.unlocks = {}  # reward -> {path, level}
        files = self._glob("Base/modules/base-standard/metaprogression/legend-paths/*.xml",
                           "DLC/*/modules/metaprogression/*.xml")
        for p in files:
            root = load_xml(p)
            if root is None:
                continue
            for lp in root.iter("legendPath"):
                pid = lp.attrib.get("id")
                for lvl in lp.iter("level"):
                    for rw in lvl.iter("reward"):
                        r = rw.attrib.get("reward")
                        if r and r.startswith("MEMENTO_"):
                            self.unlocks[r] = {"path": pid, "level": int(lvl.attrib.get("level", 0))}

    # -- units (for unique unit classes)
    def _load_units(self):
        self.unit_tags = {}
        self.units = {}
        for p in self.data_files("*.xml"):
            if "unit" not in os.path.basename(p).lower():
                continue
            root = load_xml(p)
            for r in table_rows(root, "TypeTags"):
                if r.get("Type", "").startswith("UNIT_"):
                    self.unit_tags.setdefault(r["Type"], set()).add(r.get("Tag", ""))
            for r in table_rows(root, "Units"):
                if r.get("UnitType"):
                    self.units[r["UnitType"]] = r

    # -- leaders
    def _load_leaders(self):
        self.leaders = {}
        cfg_leaders, items, tags = {}, {}, {}
        for p in self.config_files():
            root = load_xml(p)
            src = source_of(self.root, p)
            for r in table_rows(root, "Leaders"):
                if r.get("LeaderType", "").startswith("LEADER_") and r.get("LeaderName"):
                    cfg_leaders[r["LeaderType"]] = dict(r, source=src)
            for r in table_rows(root, "LeaderItems"):
                items.setdefault(r.get("LeaderType"), []).append(r)
            for r in table_rows(root, "LeaderTags"):
                tags.setdefault(r.get("LeaderType"), set()).add(r.get("TagType"))
        traits, major = {}, set()
        trait_mods = {}
        trait_text = {}
        for p in self.data_files("leaders*.xml"):
            root = load_xml(p)
            for r in table_rows(root, "Leaders"):
                if r.get("IsMajorLeader") == "true":
                    major.add(r["LeaderType"])
            for r in table_rows(root, "LeaderTraits"):
                traits.setdefault(r["LeaderType"], []).append(r["TraitType"])
            for r in table_rows(root, "TraitModifiers"):
                trait_mods.setdefault(r["TraitType"], []).append(r["ModifierId"])
            for r in table_rows(root, "Traits"):
                trait_text[r["TraitType"]] = r
        leader_effects = load_modifiers(self.data_files("leaders-gameeffects.xml"))
        for lt in sorted(set(cfg_leaders) & major):
            c = cfg_leaders[lt]
            tr = traits.get(lt, [])
            ability = [i for i in items.get(lt, []) if i.get("Kind") == "KIND_TRAIT"]
            mods = []
            for t in tr:
                for mid in trait_mods.get(t, []):
                    if mid in leader_effects:
                        m = leader_effects[mid]
                        mods.append({"id": mid, "effect": m["effect"], "args": m["args"]})
            self.leaders[lt] = {
                "type": lt,
                "source": c["source"],
                "nameTag": c.get("LeaderName"),
                "traits": tr,
                "configTags": sorted(t for t in tags.get(lt, set()) if t and t.startswith("TAG_TRAIT_")),
                "abilities": [{"type": a.get("Type"), "nameTag": a.get("Name"), "descTag": a.get("Description")}
                              for a in ability],
                "abilityModifiers": mods,
            }
        for lt in sorted(set(cfg_leaders) - major):
            self.warnings.append("config leader %s is not a major gameplay leader; skipped" % lt)

    # -- civilizations
    def _load_civs(self):
        self.civs = {}
        items, tags, bias = {}, {}, {}
        for p in self.config_files():
            root = load_xml(p)
            src = source_of(self.root, p)
            for r in table_rows(root, "Civilizations"):
                ct = r.get("CivilizationType", "")
                dom = r.get("Domain", "")
                if not ct.startswith("CIVILIZATION_") or dom not in AGE_BY_DOMAIN or not r.get("CivilizationName"):
                    continue
                self.civs[ct] = {
                    "type": ct,
                    "age": AGE_BY_DOMAIN[dom],
                    "source": src,
                    "nameTag": r.get("CivilizationName"),
                    "descTag": r.get("CivilizationDescription"),
                }
            for r in table_rows(root, "CivilizationItems"):
                dom = r.get("CivilizationDomain")
                items.setdefault((r.get("CivilizationType"), dom), []).append(r)
            for r in table_rows(root, "CivilizationTags"):
                tags.setdefault(r.get("CivilizationType"), set()).add(r.get("TagType"))
            for r in table_rows(root, "LeaderCivilizationBias"):
                if r.get("CivilizationType") and r.get("LeaderType"):
                    bias.setdefault(r["CivilizationType"], []).append(
                        {"leader": r["LeaderType"], "bias": int(r.get("Bias", "0") or 0)})
        for ct, c in self.civs.items():
            dom = [d for d, a in AGE_BY_DOMAIN.items() if a == c["age"]][0]
            its = items.get((ct, dom), [])
            # Ability rows exist once per age domain; keep the civ's own age.
            c["items"] = [{"type": i.get("Type"), "kind": i.get("Kind"), "nameTag": i.get("Name"),
                           "descTag": i.get("Description")} for i in its]
            c["configTags"] = sorted(t for t in tags.get(ct, set()) if t and t.startswith("TAG_TRAIT_"))
            c["leaderBias"] = sorted(bias.get(ct, []), key=lambda b: -b["bias"])


def steam_build(game_root):
    """'1.5.0 (1311346)' from the game's Engine.log, else the Steam build id."""
    out = {}
    local = os.environ.get("LOCALAPPDATA")
    if local:
        log = os.path.join(local, "Firaxis Games", "Sid Meier's Civilization VII", "Logs", "Engine.log")
        try:
            with open(log, encoding="utf-8", errors="replace") as f:
                for line in f:
                    m = re.search(r"Engine Version:\s*([0-9.]+\s*\(\d+\))", line)
                    if m:
                        out["engineVersion"] = m.group(1)
                        break
        except OSError:
            pass
    manifest = os.path.join(os.path.dirname(os.path.dirname(os.path.normpath(game_root))),
                            "appmanifest_1295660.acf")
    try:
        with open(manifest, encoding="utf-8", errors="replace") as f:
            m = re.search(r'"buildid"\s+"(\d+)"', f.read())
            if m:
                out["steamBuildId"] = m.group(1)
    except OSError:
        pass
    return out
