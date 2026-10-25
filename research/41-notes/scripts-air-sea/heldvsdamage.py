import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import sys, os, re, glob, collections
evdir = sys.argv[1]
c = collections.Counter(); ex = []
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    p = os.path.join(d, "xpl-turns.log")
    if not os.path.exists(p): continue
    g = os.path.basename(d).replace("-evidence", "")
    centre = {}
    lines = open(p, encoding="utf-8", errors="replace").read().split("\n")
    for l in lines:
        tag = l.split("\t", 1)[0]
        m = re.search(r"\] defence: (.*?): raiders .*?; centre (\d+)/(\d+)", l)
        if m: centre[(tag, m.group(1))] = (int(m.group(2)), int(m.group(3)))
    for l in lines:
        tag = l.split("\t", 1)[0]
        m = re.search(r"\] formation: (.*?): sectors (\d+).*?; centre (not held|held by \S+); moves \[(.*?)\]; stay \[(.*?)\]", l)
        if not m: continue
        h = centre.get((tag, m.group(1)))
        dmg = h is not None and h[0] < h[1]
        held = m.group(3) != "not held"
        oc = "(on the centre)" in m.group(5)
        k = ("held" if held else ("ranged on centre" if oc else "empty")) + (" / centre damaged" if dmg else " / centre full")
        c[k] += 1
        if dmg and not held and len(ex) < 12: ex.append(f"{g} {tag} {m.group(1)} centre {h[0]}/{h[1]} sectors {m.group(2)} stay[{m.group(5)}]"[:260])
for k, v in sorted(c.items()): print(v, k)
for e in ex: print("  ", e)
