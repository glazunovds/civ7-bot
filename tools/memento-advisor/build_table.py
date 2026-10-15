"""Build the Memento Advisor's recommendation table from the game files.

    python -I tools/memento-advisor/build_table.py [--game DIR] [--out DIR]
        [--markdown FILE] [--accept-fingerprints] [--strict]

Reads the game's mementos, leaders and civilizations (base game and every DLC
folder present), scores every memento for every leader + civilization pair with
the method in mma_scoring.py (research/16-memento-scoring.md), and writes:

- <out>/mma-table.js      ES module, `export const MEMENTO_TABLE` (+ `getPicks`).
- tools/memento-advisor/out/mma-extract.json  everything read and every base score (reference, not shipped).

Standard library only. Run with `python -I`: the script adds its own folder to
sys.path for its sibling modules (mma_gamedata, mma_scoring, mma_values).
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True   # no __pycache__ in the repo

import mma_gamedata as gd  # noqa: E402
import mma_scoring as sc   # noqa: E402
from mma_values import MEMENTO_VALUES, FALLBACK_BY_ATTRIBUTE  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
DEFAULT_OUT = os.path.join(REPO, "mod", "memento-advisor", "data")
# The reference dump stays out of the mod folder (it is not shipped).
EXTRACT_OUT = os.path.join(REPO, "tools", "memento-advisor", "out")
FINGERPRINTS = os.path.join(HERE, "mma_fingerprints.json")
TABLE_VERSION = 1
RANK_DEPTH = 12          # ranks 1-6 plus 6 spares, so the mod can skip locked mementos
SHOWN = 6

RU_AGE_IN = {"AGE_ANTIQUITY": "в античности", "AGE_EXPLORATION": "в эпоху исследований",
             "AGE_MODERN": "в современности"}
EN_AGE_IN = {"AGE_ANTIQUITY": "in Antiquity", "AGE_EXPLORATION": "in Exploration", "AGE_MODERN": "in Modern"}


# ---------------------------------------------------------------- text helpers

YIELD_RU_FORMS = {}


def first_form(text):
    """Russian names carry case forms 'Nom|Gen|Dat|...': keep the nominative."""
    return (text or "").split("|")[0].strip()


def plain_en(game, tag):
    return gd.plain(game.t_en(tag))


def plain_ru(game, tag):
    raw = game.t_ru(tag)
    if not raw:
        return ""

    # Russian text uses a yield icon as the noun ("+2 к [icon:YIELD_SCIENCE]") or before the word
    # that names it ("[icon:YIELD_PRODUCTION] производственных"): put the noun in only when it is missing.
    def icon(m):
        forms = YIELD_RU_FORMS.get(m.group(2))
        prep = (m.group(1) or "").strip().lower()
        if not forms:
            return m.group(1) or ""
        if prep == "к":
            return "к " + forms[2].lower()
        if prep in ("от", "для"):
            return prep + " " + forms[1].lower()
        nxt = (m.group(3) or "").lower()
        if not nxt or not re.match(r"[а-яё]", nxt) or nxt in ("за", "в", "во", "на", "при", "и", "для", "от",
                                                              "когда", "если", "с", "со", "по"):
            return forms[1].lower()
        return ""
    text = re.sub(r"(\b(?:к|от|для)\s+)?\[icon:([A-Z_]+)\](?=(?:\[/?B\])?\s*(?:\[TIP:[^\]]*\])?([^\s\[]*))",
                  icon, raw)
    return gd.plain(text)


def load_yield_forms(game):
    for y in ("SCIENCE", "CULTURE", "GOLD", "PRODUCTION", "FOOD", "HAPPINESS", "DIPLOMACY"):
        forms = game.t_ru("LOC_YIELD_%s_NAME" % y).split("|")
        if len(forms) >= 3:
            YIELD_RU_FORMS["YIELD_" + y] = forms


def fmt_num(v, decimal="."):
    a = abs(v)
    if a >= 10:
        s = "%d" % round(a)
    elif a >= 1:
        s = ("%.1f" % a).rstrip("0").rstrip(".")
    else:
        s = "%.1f" % a
    return ("+" if v >= 0 else "−") + s.replace(".", decimal)


def estimate(yields, age):
    """'≈ +20 Science, +5 Happiness per turn in Antiquity' from expected yields per turn.
    Two yields at most, or up to four when they are equal (The Rihla gives four alike)."""
    items = [(y, v) for y, v in yields.items() if abs(v) >= 0.5]
    prio = ("SCIENCE", "CULTURE", "GOLD", "PRODUCTION", "FOOD", "HAPPINESS", "DIPLOMACY")
    items.sort(key=lambda kv: (-round(abs(kv[1]), 1), prio.index(kv[0])))
    if not items:
        return None
    shown = items[:2]
    for y, v in items[2:4]:
        if fmt_num(v) == fmt_num(shown[-1][1]):
            shown.append((y, v))
    en = "≈ " + ", ".join("%s %s" % (fmt_num(v), sc.YIELD_NAME[y][0]) for y, v in shown) + " per turn " + EN_AGE_IN[age]
    ru = "≈ " + ", ".join("%s %s" % (fmt_num(v, ","), sc.YIELD_NAME[y][1]) for y, v in shown) + " за ход " + RU_AGE_IN[age]
    return {"en": en, "ru": ru}


# ---------------------------------------------------------------- fingerprints

def fingerprint(game, mtype):
    """A short hash of a memento's modifiers: effect, collection, arguments, scaling, requirements."""
    parts = []
    for mod in game.memento_modifier_list(mtype):
        reqs = sorted("%s%s%s" % ("!" if r["inverse"] else "", r["type"], sorted(r["args"].items()))
                      for r in mod["requirements"])
        parts.append("%s|%s|%s|%s|%s" % (mod["effect"], mod["collection"], sorted(mod["args"].items()),
                                         sorted((k, v["type"], v["extra"]) for k, v in mod["scaling"].items()),
                                         reqs))
    return hashlib.sha1("\n".join(sorted(parts)).encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------- main build

def build(game, warnings):
    load_yield_forms(game)

    # ---- mementos
    values = {}
    mementos = {}
    for mtype, m in game.mementos.items():
        gp = m["gameplay"]
        cfg = game.memento_config.get(mtype, {})
        entry = MEMENTO_VALUES.get(mtype)
        if entry is None:
            kind = FALLBACK_BY_ATTRIBUTE.get(cfg.get("Tag"), "POLITICAL")
            warnings.append("%s: not in mma_values.py; scored as half an attribute point (%s)" % (mtype, kind))
            entry = {"terms": [sc.ATTR(kind, 0.5)], "cond": None, "fit": [],
                     "what": {"en": plain_en(game, gp["FunctionalDescription"]),
                              "ru": plain_ru(game, gp["FunctionalDescription"])}}
        values[mtype] = entry
        unlock = game.unlocks.get(mtype)
        mementos[mtype] = {
            "name": {"en": plain_en(game, gp["Name"]), "ru": first_form(plain_ru(game, gp["Name"]))},
            "source": m["source"],
            "icon": game.memento_icons.get(mtype),
            "unlock": unlock,
            "attribute": (cfg.get("Tag") or "").replace("LOC_ATTRIBUTE_", "") or None,
            "tags": sorted(sc.entry_tags(entry)),
            "conditional": bool(entry.get("cond") or any(t.get("cond") for t in entry["terms"])),
            "what": entry["what"],
        }
    icons = [mementos[t]["icon"] for t in mementos]
    if None in icons or len(set(icons)) != len(icons):
        warnings.append("memento icons missing or shared: the UI cannot map every card by its icon")
    for mtype in MEMENTO_VALUES:
        if mtype not in game.mementos:
            warnings.append("%s: in mma_values.py but not in the game data (removed or DLC missing)" % mtype)

    # ---- leaders and civilizations
    pe = lambda tag: plain_en(game, tag)  # noqa: E731
    leaders = {}
    lprof = {}
    for lt, l in game.leaders.items():
        prof = sc.leader_profile(l, pe)
        lprof[lt] = prof
        leaders[lt] = {
            "name": {"en": pe(l["nameTag"]), "ru": first_form(game.t_ru(l["nameTag"]))},
            "source": l["source"],
            "attributes": prof["attributes"],
            "victory": {sc.AGE_SHORT[a]: v for a, v in prof["victory"].items()},
            "tags": prof["tags"],
        }
    civs = {}
    cprof = {}
    for ct, c in sorted(game.civs.items(), key=lambda kv: (sc.AGES.index(kv[1]["age"]), kv[0])):
        prof = sc.civ_profile(c, pe, game.unit_tags)
        cprof[ct] = prof
        civs[ct] = {
            "name": {"en": pe(c["nameTag"]), "ru": first_form(game.t_ru(c["nameTag"]))},
            "age": sc.AGE_SHORT[c["age"]],
            "source": c["source"],
            "attributes": prof["attributes"],
            "tags": prof["tags"],
        }
        if not civs[ct]["name"]["en"]:
            warnings.append("%s: no English name" % ct)

    # ---- per-age estimates (focus-independent: expected yields with no synergy)
    order = sorted(game.mementos)
    for mtype in order:
        est = {}
        for ai, age in enumerate(sc.AGES):
            _, info = sc.score(values[mtype], ai, (), ())
            e = estimate(info["yields"], age)
            if e:
                est[sc.AGE_SHORT[age]] = e
        mementos[mtype]["est"] = est

    # ---- picks
    pool = {}
    lists = []

    def list_id(types):
        key = "".join(_b36(order.index(t)) for t in types)
        if key not in pool:
            pool[key] = len(lists)
            lists.append(key)
        return pool[key]

    civ_order = ["*"] + list(civs)
    pick_rows = {}
    focus_counts = {}
    full = {}   # (leader, civ) -> {focus, rankings} for reports and tests

    def rank_pair(lt, ct):
        age = game.civs[ct]["age"] if ct != "*" else "AGE_ANTIQUITY"
        ai = sc.AGES.index(age)
        ltags = lprof[lt]["tags"] if lt != "*" else []
        ctags = cprof[ct]["tags"] if ct != "*" else []
        focus = sc.default_focus(lprof.get(lt), cprof.get(ct), age)
        scored = {}
        for mtype in order:
            s, _ = sc.score(values[mtype], ai, ltags, ctags)
            base, _ = sc.score(values[mtype], ai, (), ())
            scored[mtype] = (s, base)
        ranks = {}
        for r in sc.RANKINGS:
            ranks[r] = sorted(order, key=lambda t: (-round(scored[t][0][r], 6), -scored[t][1][r], t))[:RANK_DEPTH]
        return focus, ranks, scored

    for lt in ["*"] + list(leaders):
        cells = []
        for ct in (civ_order if lt != "*" else ["*"]):
            focus, ranks, scored = rank_pair(lt, ct)
            focus_counts[focus] = focus_counts.get(focus, 0) + 1
            ids = [list_id(ranks[r]) for r in sc.RANKINGS]
            cells.append("%s:%s" % (focus[0], ",".join(str(i) for i in ids)))
            full[(lt, ct)] = {"focus": focus, "ranks": ranks, "scores": scored}
        pick_rows[lt] = ";".join(cells)

    # ---- base values for the extract and the report
    base_values = {}
    for mtype in order:
        per_age = {}
        for ai, age in enumerate(sc.AGES):
            s, info = sc.score(values[mtype], ai, (), ())
            per_age[sc.AGE_SHORT[age]] = {
                "points": {r: round(s[r], 2) for r in sc.RANKINGS},
                "yieldsPerTurn": {y: round(v, 2) for y, v in info["yields"].items()},
                "levers": info["levers"],
            }
        base_values[mtype] = per_age

    data = {
        "version": TABLE_VERSION,
        "generatedFrom": None,   # filled by main
        "focuses": list(sc.FOCUSES),
        "rankings": list(sc.RANKINGS),
        "shown": SHOWN,
        "order": order,
        "mementos": {t: {k: mementos[t][k] for k in ("name", "source", "icon", "unlock", "attribute", "tags",
                                                       "conditional", "what", "est")} for t in order},
        "leaders": leaders,
        "civs": civs,
        "civOrder": civ_order,
        "tagLabels": {t: {"en": v[0], "ru": v[1]} for t, v in sc.TAG_LABEL.items()},
        "lists": lists,
        "picks": pick_rows,
    }
    return data, full, base_values, values, focus_counts


def _b36(i):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    return digits[i // 36] + digits[i % 36]


# ---------------------------------------------------------------- the JS module

JS_TEMPLATE = """// mma-table.js: generated by tools/memento-advisor/build_table.py from the game files. Do not edit.
// Method and spot checks: research/16-memento-scoring.md.
//
// MEMENTO_TABLE.picks["<LEADER>|<CIV>"] (or "<LEADER>|*" when the civilization is unknown, "*|*" when
// both are) = { focus, age, ranks: { BALANCED, CULTURE, SCIENCE, ECONOMIC, MILITARY: [6 memento types] },
//   more: { same keys: the next 6, to skip mementos the player has not unlocked }, reasons: { TYPE: {en, ru} } }.
// A pick is scored for the age of the civilization (mementos can be changed at every age transition).
// MEMENTO_TABLE.mementos[TYPE].icon is the card's url('blp:<icon>') key; mementoTypeByIcon() maps it back.
const D = __DATA__;

function build(d) {
    const T = d.order;
    const top = [];
    const rest = [];
    for (const s of d.lists) {
        const a = [];
        for (let i = 0; i < s.length; i += 2) a.push(T[parseInt(s.substr(i, 2), 36)]);
        top.push(Object.freeze(a.slice(0, d.shown)));
        rest.push(Object.freeze(a.slice(d.shown)));
    }
    const label = (tags, lang) => tags.map((t) => (d.tagLabels[t] ? d.tagLabels[t][lang] : t)).join(", ");
    const cache = new Map();
    const reason = (type, age, leader, civ) => {
        const m = d.mementos[type];
        const lHits = leader ? m.tags.filter((t) => leader.tags.includes(t)) : [];
        const cHits = civ ? m.tags.filter((t) => civ.tags.includes(t)) : [];
        const key = type + "|" + age + "|" + (lHits.length ? leader.name.en : "") + "|" + (cHits.length ? civ.name.en : "");
        let r = cache.get(key);
        if (r) return r;
        const est = m.est[age];
        const fit = (lang, sep) => {
            const who = [];
            if (lHits.length) who.push(leader.name[lang] + " (" + label(lHits, lang) + ")");
            if (cHits.length) who.push(civ.name[lang] + " (" + label(cHits, lang) + ")");
            return who.length ? sep + who.join(", ") : "";
        };
        r = Object.freeze({
            en: m.what.en + (est ? " — " + est.en : "") + fit("en", "; fits "),
            ru: m.what.ru + (est ? " — " + est.ru : "") + fit("ru", "; подходит: "),
        });
        cache.set(key, r);
        return r;
    };
    const FOCUS = { C: "CULTURE", S: "SCIENCE", E: "ECONOMIC", M: "MILITARY" };
    const picks = {};
    for (const [lt, row] of Object.entries(d.picks)) {
        const leader = d.leaders[lt];
        row.split(";").forEach((cell, i) => {
            const ct = d.civOrder[i];
            const civ = d.civs[ct];
            const age = civ ? civ.age : "AQ";
            const [f, ids] = cell.split(":");
            const listIds = ids.split(",").map(Number);
            const ranks = {};
            const more = {};
            const reasons = {};
            d.rankings.forEach((r, k) => {
                ranks[r] = top[listIds[k]];
                more[r] = rest[listIds[k]];
                for (const t of ranks[r].concat(more[r])) {
                    if (!reasons[t]) reasons[t] = reason(t, age, leader, civ);
                }
            });
            picks[lt + "|" + ct] = Object.freeze({ focus: FOCUS[f], age, ranks: Object.freeze(ranks), more: Object.freeze(more), reasons: Object.freeze(reasons) });
        });
    }
    const mementos = {};
    for (const t of T) {
        const m = d.mementos[t];
        mementos[t] = Object.freeze({ ...m, reason: m.what });
    }
    return Object.freeze({
        version: d.version,
        generatedFrom: d.generatedFrom,
        focuses: d.focuses,
        rankings: d.rankings,
        mementos: Object.freeze(mementos),
        leaders: d.leaders,
        civs: d.civs,
        picks: Object.freeze(picks),
    });
}

export const MEMENTO_TABLE = build(D);

const BY_ICON = new Map(Object.entries(MEMENTO_TABLE.mementos).map(([t, m]) => [m.icon, t]));

/** The memento type whose reward icon (Rewards.CustomData, the card's url('blp:<icon>')) is `icon`. */
export function mementoTypeByIcon(icon) {
    return BY_ICON.get(icon) || null;
}

/** The picks for a leader and a civilization; falls back to "<LEADER>|*", then "*|*". */
export function getPicks(leaderType, civType) {
    const p = MEMENTO_TABLE.picks;
    return p[leaderType + "|" + civType] || p[leaderType + "|*"] || p["*|*"];
}
"""


def write_js(path, data):
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(JS_TEMPLATE.replace("__DATA__", payload))


# ---------------------------------------------------------------- markdown report

SPOT_CHECKS = [
    ("LEADER_BENJAMIN_FRANKLIN", "CIVILIZATION_HAN"),
    ("LEADER_BENJAMIN_FRANKLIN", "CIVILIZATION_MING"),
    ("LEADER_BENJAMIN_FRANKLIN", "CIVILIZATION_MEIJI"),
    ("LEADER_AMINA", "CIVILIZATION_AKSUM"),
    ("LEADER_ASHOKA", "CIVILIZATION_MAURYA"),
    ("LEADER_NAPOLEON", "CIVILIZATION_ROME"),
    ("LEADER_NAPOLEON", "CIVILIZATION_FRENCH_EMPIRE"),
    ("LEADER_HIMIKO", "CIVILIZATION_HEIAN"),
    ("LEADER_CONFUCIUS", "CIVILIZATION_HAN"),
    ("LEADER_CONFUCIUS", "*"),
]


def markdown(data, full, base_values, values, out_path):
    names = {t: data["mementos"][t]["name"] for t in data["order"]}
    lines = []
    lines.append("## Appendix A. Spot checks (generated)\n")
    for lt, ct in SPOT_CHECKS:
        if (lt, ct) not in full:
            continue
        p = full[(lt, ct)]
        ln = data["leaders"][lt]["name"]["en"]
        cn = data["civs"][ct]["name"]["en"] if ct != "*" else "unknown civ (Antiquity)"
        lines.append("### %s + %s: default focus %s\n" % (ln, cn, p["focus"]))
        lines.append("| # | " + " | ".join(sc.RANKINGS) + " |")
        lines.append("|---|" + "---|" * len(sc.RANKINGS))
        for i in range(SHOWN):
            row = []
            for r in sc.RANKINGS:
                t = p["ranks"][r][i]
                row.append("%s (%.1f)" % (names[t]["en"], p["scores"][t][0][r]))
            lines.append("| %d | %s |" % (i + 1, " | ".join(row)))
        lines.append("")
    lines.append("## Appendix B. Every memento's base points (no synergy), by age and focus (generated)\n")
    lines.append("Points = % of the age's output, weighted by focus (B = Balanced, C/S/E/M = the four victories). "
                 "Yields are the expected amounts per turn the points come from.\n")
    lines.append("| Memento | Source | Terms | AQ B/C/S/E/M | EX B/C/S/E/M | MO B/C/S/E/M | Expected yields per turn AQ / EX / MO |")
    lines.append("|---|---|---|---|---|---|---|")
    for t in sorted(data["order"], key=lambda t: (data["mementos"][t]["source"] != "base", t)):
        m = data["mementos"][t]
        cells = []
        for a in ("AQ", "EX", "MO"):
            p = base_values[t][a]["points"]
            cells.append("/".join("%.0f" % p[r] for r in sc.RANKINGS))
        ys = []
        for a in ("AQ", "EX", "MO"):
            y = base_values[t][a]["yieldsPerTurn"]
            ys.append(", ".join("%s %s" % (fmt_num(v), k.title()) for k, v in y.items() if abs(v) >= 0.05) or "—")
        lines.append("| %s (%s) | %s | %s | %s | %s | %s | %s |" % (
            m["name"]["en"], m["name"]["ru"], m["source"], describe_terms(values[t]),
            cells[0], cells[1], cells[2], " / ".join(ys)))
    lines.append("")
    lines.append("## Appendix C. Leaders: preferred victory per age, attributes, tags (generated)\n")
    lines.append("| Leader | Source | Victory AQ / EX / MO | Attributes | Tags from the ability text |")
    lines.append("|---|---|---|---|---|")
    for l in data["leaders"].values():
        lines.append("| %s (%s) | %s | %s | %s | %s |" % (
            l["name"]["en"], l["name"]["ru"], l["source"],
            " / ".join(",".join(l["victory"][a]) or "—" for a in ("AQ", "EX", "MO")),
            ", ".join(a.title() for a in l["attributes"]),
            ", ".join(t for t in l["tags"] if not t.startswith("attr_"))))
    lines.append("")
    lines.append("## Appendix D. Civilizations: age, attributes, tags (generated)\n")
    lines.append("| Civilization | Age | Source | Attributes | Tags from the ability, uniques and unit classes |")
    lines.append("|---|---|---|---|---|")
    for c in data["civs"].values():
        lines.append("| %s (%s) | %s | %s | %s | %s |" % (
            c["name"]["en"], c["name"]["ru"], c["age"], c["source"],
            ", ".join(a.title() for a in c["attributes"]),
            ", ".join(t for t in c["tags"] if not t.startswith("attr_"))))
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def describe_terms(entry):
    out = []
    for term in entry["terms"]:
        t = term["t"]
        if t == "Y":
            s = "%g %s" % (term["amt"], term["yield"].title())
            if term["basis"] != "flat":
                s += " × " + term["basis"]
            if term["age"]:
                s += " × age"
            if term["lump"]:
                s += " ÷ 100 turns"
            if term["share"] != 1.0:
                s += " × %g" % term["share"]
        elif t == "PCT":
            s = "%g%% %s" % (term["pct"], term["yield"].title())
        elif t == "LV":
            s = "%s × %g" % (term["lever"], term["n"])
            if term.get("basis"):
                s += " × " + term["basis"]
        else:
            s = "attribute point (%s) × %g" % (term["kind"].title(), term["n"])
        if term.get("cond"):
            c = term["cond"]
            s += " [if %s: %g, else %g]" % (c[0], c[2], c[1])
        out.append(s)
    s = " + ".join(out)
    c = entry.get("cond")
    if c:
        s += " — uptime %g (%g with %s)" % (c[1], c[2], c[0])
    if entry.get("fit"):
        s += " — fits: " + ", ".join(entry["fit"])
    return s


# ---------------------------------------------------------------- entry point

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", default=gd.DEFAULT_GAME_ROOT)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--markdown", help="also write the generated appendix (spot checks, per-memento table)")
    ap.add_argument("--accept-fingerprints", action="store_true",
                    help="record the current modifiers as reviewed (after checking mma_values.py)")
    ap.add_argument("--strict", action="store_true", help="exit 1 when there are warnings")
    args = ap.parse_args(argv)

    game = gd.GameData(args.game)
    warnings = list(game.warnings)

    # Fingerprints: has a game update changed any memento since mma_values.py was reviewed?
    current = {t: fingerprint(game, t) for t in sorted(game.mementos)}
    if args.accept_fingerprints or not os.path.exists(FINGERPRINTS):
        with open(FINGERPRINTS, "w", encoding="utf-8", newline="\n") as f:
            json.dump(current, f, indent=1, sort_keys=True)
            f.write("\n")
        print("fingerprints recorded: %s" % FINGERPRINTS)
    else:
        with open(FINGERPRINTS, encoding="utf-8") as f:
            known = json.load(f)
        for t, h in current.items():
            if t not in known:
                warnings.append("%s: new memento (no reviewed fingerprint)" % t)
            elif known[t] != h:
                warnings.append("%s: modifiers changed since mma_values.py was reviewed; check it, then "
                                "run with --accept-fingerprints" % t)

    data, full, base_values, values, focus_counts = build(game, warnings)
    build_info = gd.steam_build(args.game)
    data["generatedFrom"] = dict(build_info, date=date.today().isoformat(),
                                 dlc=sorted({m["source"] for m in game.mementos.values()} - {"base"}))

    os.makedirs(args.out, exist_ok=True)
    js_path = os.path.join(args.out, "mma-table.js")
    write_js(js_path, data)
    extract = {
        "generatedFrom": data["generatedFrom"],
        "method": "research/16-memento-scoring.md",
        "reference": {"output": sc.REF_OUTPUT, "counts": sc.REF, "yieldWeights": sc.YIELD_WEIGHT,
                      "levers": {k: {"pointsByAge": v[0], "weights": v[1]} for k, v in sc.LEVERS.items()},
                      "attributePoint": sc.ATTR_POINT, "attributeWeights": sc.ATTR_WEIGHTS},
        "mementos": {t: dict(data["mementos"][t],
                             description={"en": plain_en(game, game.mementos[t]["gameplay"]["FunctionalDescription"]),
                                          "ru": plain_ru(game, game.mementos[t]["gameplay"]["FunctionalDescription"])},
                             leaderSpecific=game.memento_config.get(t, {}).get("LeaderSpecific"),
                             fingerprint=current[t],
                             modifiers=game.memento_modifier_list(t),
                             terms=describe_terms(values[t]),
                             base=base_values[t]) for t in data["order"]},
        "leaders": {lt: dict(data["leaders"][lt],
                             traits=game.leaders[lt]["traits"],
                             abilities=[{"name": {"en": plain_en(game, a["nameTag"]), "ru": plain_ru(game, a["nameTag"])},
                                         "description": {"en": plain_en(game, a["descTag"]),
                                                         "ru": plain_ru(game, a["descTag"])}}
                                        for a in game.leaders[lt]["abilities"]])
                    for lt in data["leaders"]},
        "civs": {ct: dict(data["civs"][ct],
                          historicalLeaders=[b["leader"] for b in game.civs[ct]["leaderBias"]],
                          items=[{"type": i["type"], "kind": i["kind"],
                                  "name": {"en": plain_en(game, i["nameTag"]), "ru": first_form(plain_ru(game, i["nameTag"]))},
                                  "description": {"en": plain_en(game, i["descTag"]), "ru": plain_ru(game, i["descTag"])}}
                                 for i in game.civs[ct]["items"]])
                 for ct in data["civs"]},
        "warnings": warnings,
    }
    os.makedirs(EXTRACT_OUT, exist_ok=True)
    with open(os.path.join(EXTRACT_OUT, "mma-extract.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(extract, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if args.markdown:
        markdown(data, full, base_values, values, args.markdown)

    pairs = sum(1 for k in full if k[0] != "*" and k[1] != "*")
    print("mementos %d (base %d), leaders %d, civilizations %d (%s), pairs %d + %d leader fallbacks + *|*" % (
        len(game.mementos), sum(1 for m in game.mementos.values() if m["source"] == "base"),
        len(data["leaders"]), len(data["civs"]),
        ", ".join("%s %d" % (a, sum(1 for c in data["civs"].values() if c["age"] == a)) for a in ("AQ", "EX", "MO")),
        pairs, len(data["leaders"])))
    print("default focus over all pairs: %s" % focus_counts)
    print("rank lists pooled: %d; %s: %d bytes" % (len(data["lists"]), js_path, os.path.getsize(js_path)))
    for w in warnings:
        print("WARNING: " + w)
    return 1 if (warnings and args.strict) else 0


if __name__ == "__main__":
    sys.exit(main())
