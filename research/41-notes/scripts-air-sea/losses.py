import sys, os, re, glob, csv, collections
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
game = sys.argv[1]; evdir = sys.argv[2]
units = {}
for f in glob.glob(os.path.join(game, "Base", "modules", "*", "data", "units.xml")) + glob.glob(os.path.join(game, "DLC", "*", "modules", "data", "units.xml")):
    txt = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<Row\s+([^>]*?)/?>', txt):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        if "UnitType" in a and "Domain" in a: units[a["UnitType"]] = a
def name(c):
    m = re.match(r'\(\-?\d+\)(.*)', c.strip()); return m.group(1) if m else c.strip()
tot = collections.Counter()
print("game\tkilledAsDef\tbyShip\tbyShipScouts\tbyLand\tbyAir\tlostAttacking\tshipHitsOnOurLandUnits\tshipHitsOnOurDistricts\tourDistrictHitsTotal\tairAny\tseaVsSeaAny")
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    if "hof" in d: continue
    p = os.path.join(d, "CombatLog.csv")
    if not os.path.exists(p): continue
    rows = list(csv.reader(open(p, encoding="utf-8", errors="replace")))
    ix = {h.strip(): i for i, h in enumerate(rows[0])}
    c = collections.Counter()
    for r in rows[1:]:
        if len(r) < len(ix): continue
        src = r[ix["SourceType"]].strip()
        if src == "Unit Heal": continue
        ap, dp = r[ix["AttPlayer"]].strip(), r[ix["DefPlayer"]].strip()
        a, de = name(r[ix["Attacker"]]), name(r[ix["Defender"]])
        ad = units.get(a, {}).get("Domain", "?"); dd = units.get(de, {}).get("Domain", "?")
        dest = r[ix["Destroyed"]].strip()
        if ad == "DOMAIN_AIR" or dd == "DOMAIN_AIR": c["airAny"] += 1
        if ad == "DOMAIN_SEA" and dd == "DOMAIN_SEA": c["seaVsSeaAny"] += 1
        if dp == "0" and src == "Unit vs Unit" and dd == "DOMAIN_LAND":
            if ad == "DOMAIN_SEA": c["shipHitsOnOurLandUnits"] += 1
            if dest == "Defender":
                c["killedAsDef"] += 1
                if ad == "DOMAIN_SEA":
                    c["byShip"] += 1
                    if de == "UNIT_SCOUT": c["byShipScouts"] += 1
                elif ad == "DOMAIN_AIR": c["byAir"] += 1
                else: c["byLand"] += 1
        if dp == "0" and src.startswith("Unit vs Location"):
            c["ourDistrictHitsTotal"] += 1
            if ad == "DOMAIN_SEA": c["shipHitsOnOurDistricts"] += 1
        if ap == "0" and dest == "Attacker" and units.get(a, {}).get("Domain") == "DOMAIN_LAND": c["lostAttacking"] += 1
    tot.update(c)
    keys = ["killedAsDef","byShip","byShipScouts","byLand","byAir","lostAttacking","shipHitsOnOurLandUnits","shipHitsOnOurDistricts","ourDistrictHitsTotal","airAny","seaVsSeaAny"]
    print(os.path.basename(d) + "\t" + "\t".join(str(c.get(k,0)) for k in keys))
print("TOTAL\t" + "\t".join(str(tot.get(k,0)) for k in keys))
