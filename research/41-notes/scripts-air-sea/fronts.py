import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
import sys, os, re, glob, collections
evdir = sys.argv[1]
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    p = os.path.join(d, "xpl-turns.log")
    if not os.path.exists(p): continue
    g = os.path.basename(d).replace("-evidence", "")
    fronts = collections.defaultdict(list); threats = collections.defaultdict(list)
    for l in open(p, encoding="utf-8", errors="replace"):
        tag = l.split("\t", 1)[0]
        m = re.search(r"\] defence: (.*?): war front \((.*?)\): melee (\d+) of (\d+)", l)
        if m: fronts[m.group(1)].append((tag, m.group(2), int(m.group(3)), int(m.group(4))))
        m = re.search(r"\] defence: (.*?): raiders (\d+) \(land (\d+), ships (\d+).*?centre (\d+)/(\d+)", l)
        if m: threats[m.group(1)].append((tag, int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6))))
    if not fronts: continue
    out = []
    for s, fl in fronts.items():
        ftags = [x[0] for x in fl]; leaders = sorted(set(x[1] for x in fl))
        unguarded = sum(1 for x in fl if x[2] < x[3])
        th = threats.get(s, [])
        tl = [x for x in th if x[0][0] == ftags[0][0]]
        dmg = [x for x in th if x[3] < x[4]]
        out.append(f"{s}: front {ftags[0]}-{ftags[-1]} ({len(fl)} lines, {unguarded} short) vs {','.join(leaders)}; threatened lines {len(th)} (land>0 {sum(1 for x in th if x[1]>0)}, ships>0 {sum(1 for x in th if x[2]>0)}), centre damaged lines {len(dmg)}")
    print("==", g); [print("  ", x) for x in out]
