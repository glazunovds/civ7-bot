import sys, os, re, glob
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
game = sys.argv[1]; want = sys.argv[2:]
for f in sorted(glob.glob(os.path.join(game, "Base", "modules", "*", "data", "units.xml")) + glob.glob(os.path.join(game, "DLC", "*", "modules", "data", "units.xml"))):
    lines = open(f, encoding="utf-8", errors="replace").read().split("\n")
    for i, l in enumerate(lines, 1):
        for w in want:
            if re.search(r'UnitType="%s"' % w, l) and ("Domain=" in l or "Combat=" in l or "RangedCombat=" in l or "Bombard=" in l):
                rel = os.path.relpath(f, game).replace("\\", "/")
                print(f"{rel}:{i}: {l.strip()[:400]}")
