import re, sys, os, glob
base = sys.argv[1]
files = glob.glob(os.path.join(base, 'age-*', 'data', 'units.xml')) + glob.glob(os.path.join(base, '*', 'data', '*units*.xml'))
files = sorted(set(files))
units, stats, tags, costs = {}, {}, {}, {}
rowre = re.compile(r'<Row\s([^>]*?)/?>')
attre = re.compile(r'(\w+)="([^"]*)"')
for f in files:
    txt = open(f, encoding='utf-8', errors='replace').read()
    age = f.split(os.sep)[-3]
    for m in rowre.finditer(txt):
        a = dict(attre.findall(m.group(1)))
        if 'UnitType' in a and 'Domain' in a:
            a['_age'] = age; units[a['UnitType']] = a
        elif 'UnitType' in a and ('Combat' in a or 'RangedCombat' in a or 'Bombard' in a) and 'YieldType' not in a:
            stats[a['UnitType']] = a
        elif 'Type' in a and 'Tag' in a and a['Type'].startswith('UNIT_'):
            tags.setdefault(a['Type'], set()).add(a['Tag'])
        elif 'UnitType' in a and a.get('YieldType') == 'YIELD_PRODUCTION' and 'Cost' in a:
            costs[a['UnitType']] = a['Cost']
mode = sys.argv[2] if len(sys.argv) > 2 else 'land'
rows = []
for u, a in units.items():
    t = tags.get(u, set())
    s = stats.get(u, {})
    if mode == 'land':
        if a['Domain'] != 'DOMAIN_LAND': continue
        if not ({'UNIT_CLASS_RANGED', 'UNIT_CLASS_SIEGE'} & t): continue
    else:
        if a['Domain'] != 'DOMAIN_SEA' or a.get('CoreClass') != 'CORE_CLASS_MILITARY': continue
    cls = 'SIEGE' if 'UNIT_CLASS_SIEGE' in t else ('RANGED' if 'UNIT_CLASS_RANGED' in t else '-')
    rows.append((a['_age'], cls, u, s.get('Combat', ''), s.get('RangedCombat', ''), s.get('Bombard', ''), s.get('Range', ''), costs.get(u, ''), 'UNIQUE' if 'UNIT_CLASS_UNIQUE' in t or u.endswith(('_1','_2','_3')) else '', ','.join(sorted(x.replace('UNIT_CLASS_','') for x in t))))
rows.sort()
print('| Age | Class | Unit | Combat | Ranged | Bombard | Range | Cost | uq | tags |')
for r in rows:
    print('| ' + ' | '.join(str(x) for x in r) + ' |')
