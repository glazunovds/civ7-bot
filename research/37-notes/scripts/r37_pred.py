import csv, sys, os, re, glob
d, gbase = sys.argv[1], sys.argv[2]
rowre = re.compile(r'<Row\s([^>]*?)/?>'); attre = re.compile(r'(\w+)="([^"]*)"')
units, stats, tags = {}, {}, {}
for f in glob.glob(os.path.join(gbase, '*', 'data', '*.xml')):
    if 'unit' not in os.path.basename(f).lower(): continue
    txt = open(f, encoding='utf-8', errors='replace').read()
    for m in rowre.finditer(txt):
        a = dict(attre.findall(m.group(1)))
        if 'UnitType' in a and 'Domain' in a: units[a['UnitType']] = a
        elif 'UnitType' in a and 'Combat' in a and 'YieldType' not in a: stats[a['UnitType']] = a
        elif 'Type' in a and 'Tag' in a and a['Type'].startswith('UNIT_'): tags.setdefault(a['Type'], set()).add(a['Tag'])
def melee_str(u):
    a = units.get(u); t = tags.get(u, set())
    if not a or a.get('Domain') != 'DOMAIN_LAND' or a.get('CoreClass') != 'CORE_CLASS_MILITARY': return None
    if {'UNIT_CLASS_RANGED', 'UNIT_CLASS_SIEGE'} & t: return None
    s = stats.get(u, {}).get('Combat')
    return int(s) if s else None
def rows(name):
    with open(os.path.join(d, name), encoding='utf-8', errors='replace') as f:
        r = csv.reader(f); h = [x.strip() for x in next(r)]
        return [dict(zip(h, [x.strip() for x in row])) for row in r if len(row) >= len(h)]
def segment(rs, key):
    seg, last, out = 0, -1, []
    for r in rs:
        try: t = int(r[key])
        except: continue
        if t < last - 3: seg += 1
        last = t; r['_seg'] = seg; r['_t'] = t; out.append(r)
    return out
cb = segment(rows('CombatLog.csv'), 'Turn'); bq = segment(rows('CityBuildQueue.csv'), 'Game Turn'); cp = segment(rows('CityPurchase.csv'), 'Game Turn')
ev = {}  # (seg, player) -> list of (turn, strength, kind, unit)
for r in bq:
    u = r['Current Item']; s = melee_str(u)
    if s is None: continue
    try:
        if float(r['Current Production']) >= float(r['Production Needed']): ev.setdefault((r['_seg'], r['Player']), []).append((r['_t'], s, 'T', u))
    except: pass
for r in cp:
    u = r['Item Purchased']
    if u.startswith('LOC_UNIT_') and u.endswith('_NAME'): u = u[4:-5]
    s = melee_str(u)
    if s is None: continue
    ev.setdefault((r['_seg'], r['Player']), []).append((r['_t'], s, 'B', u))
stat = {}
mism = []
for r in cb:
    if r['SourceType'] != 'Unit vs Location' or not r['Defender'].endswith('CITY_CENTER_NAME'): continue
    try: ds = int(r['DefStr'])
    except: continue
    if ds == 0: continue
    key = (r['_seg'], r['DefPlayer']); t = r['_t']
    e = ev.get(key, [])
    tr = max([s for (tt, s, k, u) in e if k == 'T' and tt <= t], default=None)
    al = max([s for (tt, s, k, u) in e if tt <= t], default=None)
    tr1 = max([s for (tt, s, k, u) in e if k == 'T' and tt < t], default=None)
    res = ('trained' if tr == ds else '') + ('/all' if al == ds else '') + ('/trainedBefore' if tr1 == ds else '')
    stat.setdefault(r['_seg'], {}).setdefault(res or 'none', 0)
    stat[r['_seg']][res or 'none'] += 1
    if tr != ds or al != ds:
        mism.append((r['_seg'], r['DefPlayer'], t, ds, tr, al, [x for x in e if x[0] <= t][-4:]))
for s, v in sorted(stat.items()): print('seg', s, v)
seen = set()
for m in mism:
    k = (m[0], m[1], m[3], m[4], m[5])
    if k in seen: continue
    seen.add(k)
    print('MISMATCH seg%d p%s T%d DefStr %d trainedMax %s allMax %s recent %s' % m)
# bought melee units by any player
print('\nbought melee units:')
for (s, p), e in sorted(ev.items()):
    b = [x for x in e if x[2] == 'B']
    if b: print(f'seg{s} p{p}: ' + ', '.join(f'T{t} {u}({st})' for t, st, k, u in b))
print('\nmax melee by seg/player (all sources):')
for q in [(0,'6'),(3,'2'),(4,'2'),(4,'8'),(4,'7'),(4,'0'),(1,'6'),(2,'3'),(1,'3'),(3,'20'),(5,'8'),(5,'7'),(5,'0')]:
    e = ev.get(q, [])
    print(q, max([x[1] for x in e], default=None), sorted(set((x[3],x[2]) for x in e))[:8], 'first', min([x[0] for x in e], default=None))
