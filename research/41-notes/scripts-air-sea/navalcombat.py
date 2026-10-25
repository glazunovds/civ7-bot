import sys, os, re, glob, csv, collections
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
game = sys.argv[1]; evdir = sys.argv[2]; mode = sys.argv[3] if len(sys.argv) > 3 else "summary"
units = {}
stats = {}
for f in glob.glob(os.path.join(game, "Base", "modules", "*", "data", "units.xml")) + glob.glob(os.path.join(game, "DLC", "*", "modules", "data", "units.xml")):
    txt = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<Row\s+([^>]*?)/?>', txt):
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        if "UnitType" in attrs and "Domain" in attrs:
            units[attrs["UnitType"]] = attrs
        if "UnitType" in attrs and ("Combat" in attrs or "RangedCombat" in attrs or "Bombard" in attrs):
            stats.setdefault(attrs["UnitType"], {}).update(attrs)
def dom(t):
    return units.get(t, {}).get("Domain", "?")
def name(cell):
    m = re.match(r'\(\-?\d+\)(.*)', cell.strip()); return m.group(1) if m else cell.strip()
res = {}
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    p = os.path.join(d, "CombatLog.csv")
    if not os.path.exists(p): continue
    g = os.path.basename(d)
    rows = list(csv.reader(open(p, encoding="utf-8", errors="replace")))
    hdr = [h.strip() for h in rows[0]]
    ix = {h: i for i, h in enumerate(hdr)}
    age = 0; last = 0
    c = collections.Counter(); kills = []
    for r in rows[1:]:
        if len(r) < len(hdr): continue
        try: t = int(r[0])
        except: continue
        if t < last - 20: age += 1
        last = t
        src = r[ix["SourceType"]].strip()
        if src == "Unit Heal": continue
        ap = r[ix["AttPlayer"]].strip(); dp = r[ix["DefPlayer"]].strip()
        att = name(r[ix["Attacker"]]); de = name(r[ix["Defender"]])
        ad, dd = dom(att), dom(de)
        destroyed = r[ix["Destroyed"]].strip()
        tag = "AEM"[age] if age < 3 else str(age)
        if dp == "0":
            if ad == "DOMAIN_SEA":
                c["sea_attacks_on_us"] += 1
                if src == "Unit vs Unit": c["sea_attacks_on_our_units"] += 1
                if src.startswith("Unit vs Location") or src == "Unit vs Army": c["sea_attacks_on_our_districts_or_armies"] += 1
                if destroyed == "Defender" and src == "Unit vs Unit":
                    if dd == "DOMAIN_LAND": c["our_land_units_killed_by_ships"] += 1; kills.append(f"{tag}{t} p{ap} {att}({r[ix['AttStr']].strip()}) killed {de}(def {r[ix['DefStr']].strip()}) at {r[ix['Location']].strip()} {r[ix['CombatType']].strip()}")
                    elif dd == "DOMAIN_SEA": c["our_ships_killed_by_ships"] += 1; kills.append(f"{tag}{t} p{ap} {att} killed our ship {de}")
                    else: c["our_other_killed_by_ships"] += 1; kills.append(f"{tag}{t} p{ap} {att} killed {de} ({dd})")
            if ad == "DOMAIN_AIR":
                c["air_attacks_on_us"] += 1
                if destroyed == "Defender": kills.append(f"{tag}{t} p{ap} AIR {att} killed {de}")
            if dd == "DOMAIN_SEA": c["our_ships_attacked"] += 1
            if dd == "DOMAIN_LAND" and destroyed == "Defender" and src == "Unit vs Unit": c["our_land_units_killed_total"] += 1
        if ap == "0":
            if ad == "DOMAIN_SEA": c["our_ship_attacks"] += 1; c["our_ship_attacks_"+r[ix["CombatType"]].strip()] += 1
            if ad == "DOMAIN_AIR": c["our_air_attacks"] += 1
            if dd == "DOMAIN_SEA" and src == "Unit vs Unit": c["our_attacks_on_ships"] += 1
            if dd == "DOMAIN_AIR": c["our_attacks_on_air"] += 1
        if ap != "0" and dp != "0":
            if ad == "DOMAIN_AIR" or dd == "DOMAIN_AIR": c["air_combat_others"] += 1
    res[g] = (c, kills)
if mode == "summary":
    keys = sorted({k for c, _ in res.values() for k in c})
    print("game\t" + "\t".join(keys))
    for g, (c, _) in res.items(): print(g + "\t" + "\t".join(str(c.get(k, 0)) for k in keys))
else:
    for g, (c, k) in res.items():
        print("==", g); [print("  ", x) for x in k]
    unknown = set()
