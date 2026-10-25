import sys, os, re, glob
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
evdir = sys.argv[1]
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    p = os.path.join(d, "xpl.log")
    if not os.path.exists(p) or os.path.getsize(p) == 0: continue
    lines = open(p, encoding="utf-8", errors="replace").read().split("\n")
    # turn of each line = turn of the next gold line
    tags = [None] * len(lines)
    golds = []
    for i, l in enumerate(lines):
        m = re.search(r"gold: T(\d+) ", l)
        if m: golds.append((i, int(m.group(1))))
    # ages
    age = 0; prev = 0; agetag = {}
    first = os.path.basename(d)
    start = "E" if "e20-m34" in first else "A"
    ages = "AEM"[ "AEM".index(start):]
    for i, t in golds:
        if t < prev - 5: age += 1
        prev = t
        agetag[i] = (ages[age] if age < len(ages) else "?") + str(t)
    j = 0
    out = open(os.path.join(d, "xpl-turns.log"), "w", encoding="utf-8")
    gi = 0
    for i, l in enumerate(lines):
        while gi < len(golds) and golds[gi][0] < i: gi += 1
        tag = agetag[golds[gi][0]] if gi < len(golds) else "end"
        out.write(tag + "\t" + l + "\n")
    out.close()
    print(d, len(golds))
