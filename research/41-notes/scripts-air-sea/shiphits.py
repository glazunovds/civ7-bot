import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import sys, os, re, glob, csv, collections
game = sys.argv[1]; evdir = sys.argv[2]
units = {}
for f in glob.glob(os.path.join(game, "Base", "modules", "*", "data", "units.xml")) + glob.glob(os.path.join(game, "DLC", "*", "modules", "data", "units.xml")):
    txt = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<Row\s+([^>]*?)/?>', txt):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        if "UnitType" in a and "Domain" in a: units[a["UnitType"]] = a
def name(c):
    m = re.match(r'\(\-?\d+\)(.*)', c.strip()); return m.group(1) if m else c.strip()
tot = collections.Counter(); bytype = collections.Counter(); det = []
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    if "hof" in d: continue
    p = os.path.join(d, "CombatLog.csv"); q = os.path.join(d, "xpl-turns.log")
    if not os.path.exists(p): continue
    g = os.path.basename(d).replace("-evidence", "")
    start = "E" if "e20-m34" in d else "A"
    # formation member positions per turn tag
    pos = collections.defaultdict(set); centres = set(); posted = collections.defaultdict(set)
    if os.path.exists(q):
        for l in open(q, encoding="utf-8", errors="replace"):
            tag = l.split("\t", 1)[0]
            m = re.search(r"\] formation: .*?; stay \[(.*?)\]", l)
            if m:
                for s in m.group(1).split("; "):
                    mm = re.match(r"(\S+) at (\d+),(\d+) \((.*)\)", s)
                    if mm:
                        pos[tag].add((mm.group(1), int(mm.group(2)), int(mm.group(3))))
                        if mm.group(4) == "on the centre": centres.add((int(mm.group(2)), int(mm.group(3))))
            m = re.search(r"\] formation: .*?; moves \[(.*?)\]", l)
            if m:
                for s in m.group(1).split("; "):
                    mm = re.match(r"(\S+) (\d+),(\d+) -> (\d+),(\d+) (\w+)", s)
                    if mm: pos[tag].add((mm.group(1), int(mm.group(4)), int(mm.group(5))))
    rows = list(csv.reader(open(p, encoding="utf-8", errors="replace")))
    ix = {h.strip(): i for i, h in enumerate(rows[0])}
    ages = "AEM"["AEM".index(start):]; age = 0; last = 0
    for r in rows[1:]:
        if len(r) < len(ix): continue
        try: t = int(r[0])
        except: continue
        if t < last - 20: age += 1
        last = t
        if r[ix["SourceType"]].strip() != "Unit vs Unit" or r[ix["DefPlayer"]].strip() != "0": continue
        a, de = name(r[ix["Attacker"]]), name(r[ix["Defender"]])
        if units.get(a, {}).get("Domain") != "DOMAIN_SEA" or units.get(de, {}).get("Domain") != "DOMAIN_LAND": continue
        loc = re.findall(r"\((\-?\d+)\)", r[ix["Location"]]); x, y = int(loc[0]), int(loc[1])
        tag = ages[age] + str(t) if age < len(ages) else "?"
        prevtag = ages[age] + str(t - 1) if age < len(ages) else "?"
        inform = any((u == de and ux == x and uy == y) for k in (tag, prevtag) for (u, ux, uy) in pos.get(k, ()))
        oncentre = (x, y) in centres
        kind = "scout" if de == "UNIT_SCOUT" else ("formation member" if inform else ("on a centre" if oncentre else "other soldier"))
        tot[kind] += 1; bytype[de] += 1
        det.append(f"{g} {tag} {a}->{de} at {x},{y} dmg {r[ix['DefDmg']].strip()} {r[ix['Destroyed']].strip()} [{kind}]")
print(dict(tot)); print(dict(bytype))
for l in det: print(l)
