import sys, os, re, glob, collections
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
evdir = sys.argv[1]
T = collections.Counter(); R = collections.Counter(); ROLE = collections.Counter()
print("game\tlines\tsettl\tmoves\tnotSent\tnotHeld\tnotHeldNoMove\twithShips\tstayN\tcmdLines\tcmdMoves\tcmdHeld\tfreeTiles0-2\tnoBetter\thurt\tbusy\tplayers\tmoved\tordered")
for d in sorted(glob.glob(os.path.join(evdir, "game*"))):
    p = os.path.join(d, "xpl-turns.log")
    if not os.path.exists(p): continue
    c = collections.Counter(); reasons = collections.Counter(); settl = set()
    for l in open(p, encoding="utf-8", errors="replace"):
        m = re.search(r"\] formation: (.*?): sectors (\d+) \[(.*?)\](, ships (\d+))?; centre (.*?); moves \[(.*?)\]; stay \[(.*?)\](; commander (.*?))?; (\d+) free tile", l)
        if not m: continue
        c["lines"] += 1; settl.add(m.group(1))
        moves = [x for x in m.group(7).split("; ") if x]
        c["moves"] += len(moves)
        for mv in moves:
            if "NOT SENT" in mv: c["notSent"] += 1
            r = re.search(r" (HOLD|SCREEN|RANGED) \+", mv)
            if r: ROLE[r.group(1)] += 1
        if m.group(6).startswith("not held"):
            c["notHeld"] += 1
            if not any(" HOLD " in mv for mv in moves): c["notHeldNoMove"] += 1
        if m.group(5): c["withShips"] += 1
        stays = [x for x in m.group(8).split("; ") if x]
        c["stayN"] += len(stays)
        for s in stays:
            r = re.search(r"\(([^()]*)\)$", s)
            if r: reasons[r.group(1)] += 1
        if m.group(10):
            c["cmdLines"] += 1
            if "->" in m.group(10): c["cmdMoves"] += 1
            if "moved lately" in m.group(10): c["cmdHeld"] += 1
        if int(m.group(11)) <= 2: c["free02"] += 1
    c["settl"] = len(settl)
    T.update(c); R.update(reasons)
    print(os.path.basename(d) + "\t" + "\t".join(str(c.get(k,0)) for k in ["lines","settl","moves","notSent","notHeld","notHeldNoMove","withShips","stayN","cmdLines","cmdMoves","cmdHeld","free02"]) + "\t" + "\t".join(str(reasons.get(k,0)) for k in ["no better post","hurt","busy","the player's","moved","ordered"]))
print("TOTAL", dict(T)); print("REASONS", dict(R)); print("ROLES", dict(ROLE))
