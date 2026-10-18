import csv, sys, os, re
d = sys.argv[1]
def rows(name):
    with open(os.path.join(d, name), encoding='utf-8', errors='replace') as f:
        r = csv.reader(f)
        h = [x.strip() for x in next(r)]
        out = []
        for row in r:
            row = [x.strip() for x in row]
            if len(row) < len(h): continue
            out.append(dict(zip(h, row)))
        return out
def segment(rs, key):
    seg, last, out = 0, -1, []
    for r in rs:
        try: t = int(r[key])
        except: continue
        if t < last - 3: seg += 1
        last = t
        r['_seg'] = seg; r['_t'] = t
        out.append(r)
    return out
melee = set(sys.argv[2].split(','))
cb = segment(rows('CombatLog.csv'), 'Turn')
bq = segment(rows('CityBuildQueue.csv'), 'Game Turn')
cp = segment(rows('CityPurchase.csv'), 'Game Turn')
nseg = max(r['_seg'] for r in cb) + 1
print('segments combat', nseg, 'bq', max(r['_seg'] for r in bq)+1, 'cp', max(r['_seg'] for r in cp)+1)
for s in range(nseg):
    turns = [r['_t'] for r in cb if r['_seg'] == s]
    print(f'\n=== segment {s}: combat turns {min(turns)}-{max(turns)}')
    # our trained melee units (completed): current production >= needed
    done = []
    for r in bq:
        if r['_seg'] != s or r['Player'] != '0': continue
        it = r['Current Item']
        if not it.startswith('UNIT_'): continue
        try:
            if float(r['Current Production']) >= float(r['Production Needed']): done.append((r['_t'], it, r['City'].replace('LOC_CITY_NAME_', ''), 'trained'))
        except: pass
    for r in cp:
        if r['_seg'] != s or r['Player'] != '0': continue
        it = r['Item Purchased']
        if it.startswith('UNIT_'): done.append((r['_t'], it, r['City'].replace('LOC_CITY_NAME_', ''), 'bought'))
    done.sort()
    ml = [x for x in done if x[1] in melee]
    print('our melee completions:', '; '.join(f'T{t} {u.replace("UNIT_","")} {c} ({k})' for t, u, c, k in ml) or 'none')
    other = [x for x in done if x[1] not in melee]
    print('our other units:', '; '.join(f'T{t} {u.replace("UNIT_","")} ({k})' for t, u, c, k in other[:40]))
    # district defence against player 0
    for r in cb:
        if r['_seg'] != s: continue
        if r['SourceType'] != 'Unit vs Location': continue
        if r['DefPlayer'] == '0':
            print(f"  T{r['_t']} def0 {r['Location']} {r['CombatType']} att {r['Attacker']} (p{r['AttPlayer']}) AttStr {r['AttStr']}+{r['AttStrMod']} vs {r['Defender']} DefStr {r['DefStr']} mod {r['DefStrMod']} dmg {r['DefDmg']} defHealth {r['defHealth']}")
    # other players' district defences seen (summary by player: first/last DefStr)
    byp = {}
    for r in cb:
        if r['_seg'] != s or r['SourceType'] != 'Unit vs Location' or r['DefPlayer'] == '0': continue
        byp.setdefault(r['DefPlayer'], []).append((r['_t'], r['DefStr']))
    for p, v in sorted(byp.items()):
        print(f'  others p{p}: ' + ', '.join(f'T{t}:{x}' for t, x in v[:25]))
