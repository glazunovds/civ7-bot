"""Rebuild the military audit's Modern frames and compact evidence summary.

Standard library only. The archived logs append two games (six age segments).
Never aggregate the preceding science game with this one.
"""
import csv
import io
import json
from pathlib import Path
import re
import sys
import zipfile
from collections import Counter

HERE = Path(__file__).resolve().parent


def latest_segment(archive, name):
    rows = csv.reader(io.StringIO(archive.read(name).decode('utf-8-sig')), skipinitialspace=True)
    header = next(rows)
    segments = [[]]
    previous = -1
    for line, values in enumerate(rows, 2):
        try:
            turn = int(values[0])
        except (ValueError, IndexError):
            continue
        if turn < previous:
            segments.append([])
        previous = turn
        segments[-1].append({'line': line, 'turn': turn, 'values': values})
    return header, segments


def frames_from(ui):
    groups = []
    for row in ui:
        if 'victory races:' in row['text'] or not groups:
            groups.append([])
        groups[-1].append(row)
    frames = []
    age = None
    for lines in groups:
        text = '\n'.join(row['text'] for row in lines)
        match = re.search(r'AGE_(ANTIQUITY|EXPLORATION|MODERN)', text)
        if match:
            age = match[1]
        turn = re.search(r'gold: T(\d+)', text)
        if not turn:
            continue
        frame = {'age': age, 'turn': int(turn[1]), 'lines': lines, 'actions': []}
        points = re.search(r'victory races: SCIENCE (\d+)/100', text)
        frame['innovation'] = int(points[1]) if points else None
        for row in lines:
            action = re.search(r'autopilot: ([A-Z_]+) (\[.*\])', row['text'])
            if action:
                frame['actions'].append({'key': action[1], 'args': json.loads(action[2]), 'line': row['line']})
        frames.append(frame)
    start = max(i for i, frame in enumerate(frames) if frame['age'] == 'MODERN' and frame['turn'] == 1)
    return frames[start:]


def main():
    with zipfile.ZipFile(HERE / 'evidence.zip') as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(set(archive.namelist()))
        ui = [json.loads(line) for line in archive.read('ui-evidence.jsonl').decode().splitlines()]
        frames = frames_from(ui)
        assert [frame['turn'] for frame in frames] == list(range(1, 69))
        tables = {}
        for name in ['CombatLog.csv', 'DiplomacySummary.csv', 'Player_Stats.csv',
                     'Player_Treasury.csv', 'CityBuildQueue.csv', 'CityPurchase.csv']:
            header, segments = latest_segment(archive, name)
            assert len(segments) == 6, (name, len(segments))
            tables[name] = segments[-1]
        summary = {
            'scope': 'Latest game, Modern age; six CSV segments contain two games',
            'frames': len(frames),
            'war_events': [r for r in tables['DiplomacySummary.csv'] if r['values'][1:4] == ['2', '0', 'At War']],
            'attacks_on_our_centres': [r for r in tables['CombatLog.csv'] if r['values'][1] == 'Unit vs Location' and r['values'][4] == '0'],
            'our_modern_unit_production': [r for r in tables['CityBuildQueue.csv'] if r['values'][1] == '0' and r['values'][4].startswith('UNIT_')],
            'our_modern_purchases': [r for r in tables['CityPurchase.csv'] if r['values'][1] == '0'],
            'our_stats': [r for r in tables['Player_Stats.csv'] if r['values'][1] == '0'],
            'our_treasury': [r for r in tables['Player_Treasury.csv'] if r['values'][1] == '0'],
            'actions_by_period': {},
        }
        for lo, hi in [(1, 35), (36, 51), (52, 68)]:
            summary['actions_by_period'][f'{lo}-{hi}'] = dict(Counter(
                action['key'] for frame in frames if lo <= frame['turn'] <= hi for action in frame['actions']))
        for name, data in [('frames.json', frames), ('summary.json', summary)]:
            (HERE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'frames': len(frames), 'wars': summary['war_events'],
                          'our_purchases': summary['our_modern_purchases']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
