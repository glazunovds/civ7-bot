import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import sys, os, re, glob, collections
game = sys.argv[1]; evdir = sys.argv[2]
stats = {}
for f in glob.glob(os.path.join(game, "Base", "modules", "*", "data", "units.xml")) + glob.glob(os.path.join(game, "DLC", "*", "modules", "data", "units.xml")):
    for m in re.finditer(r'<Row\s+([^>]*?)/?>', open(f, encoding="utf-8", errors="replace").read()):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        if "UnitType" in a and "Combat" in a and "Domain" not in a: stats[a["UnitType"]] = a
def melee(u):
    s = stats.get(u); return bool(s) and float(s.get("Combat", 0)) > 0 and float(s.get("RangedCombat", 0) or 0) == 0 and float(s.get("Bombard", 0) or 0) == 0
cat = collections.Counter(); ex = collections.defaultdict(list); settl = collections.Counter()
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    p = os.path.join(d, "xpl-turns.log")
    if not os.path.exists(p): continue
    g = os.path.basename(d).replace("-evidence", "")
    for l in open(p, encoding="utf-8", errors="replace"):
        m = re.search(r"^(\S+)\t.*\] formation: (.*?): sectors (\d+).*?; centre (not held|held by \S+); moves \[(.*?)\]; stay \[(.*?)\]", l)
        if not m: continue
        stays = [s for s in m.group(6).split("; ") if s]
        units = [(s.split(" at ")[0], re.search(r"\(([^()]*)\)$", s).group(1) if re.search(r"\(([^()]*)\)$", s) else "") for s in stays]
        movesl = [x for x in m.group(5).split("; ") if x]
        if m.group(4) != "not held":
            cat["held"] += 1; continue
        if any(" HOLD " in x for x in movesl): cat["not held: HOLD move sent"] += 1; continue
        oc = [u for u, r in units if r == "on the centre"]
        ml = [(u, r) for u, r in units if melee(u)]
        mlmoved = [x for x in movesl if melee(x.split(" ")[0])]
        if oc:
            if ml or mlmoved: k = "ranged on centre, melee member present (" + ",".join(sorted(set(r for _, r in ml))) + ")"
            else: k = "ranged on centre, no melee member"
        else:
            if ml: k = "centre empty, melee members " + ",".join(sorted(set(r for _, r in ml)))
            else: k = "centre empty, no melee member"
        cat[k] += 1; settl[(g, m.group(2), k)] += 1
        if len(ex[k]) < 3: ex[k].append(f"{g} {m.group(1)} {m.group(2)}: moves[{m.group(5)}] stay[{m.group(6)}]"[:300])
for k, v in sorted(cat.items(), key=lambda x: -x[1]): print(v, k)
for k, v in ex.items():
    print("==", k); [print("  ", x) for x in v]
