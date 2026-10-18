"""Reproduce the game-28 science-win audit from the saved evidence archive.

Run with --capture to snapshot the live logs first. The archive keeps CSV logs
and relevant XPL lines with their original UI.log line numbers.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sqlite3
import sys
import zipfile
from collections import Counter, defaultdict

HERE = Path(__file__).resolve().parent
LOGS = Path(r"C:\Users\glazu\AppData\Local\Firaxis Games\Sid Meier's Civilization VII\Logs")
ARCHIVE = HERE / "evidence.zip"
AGES = ["ANTIQUITY", "EXPLORATION", "MODERN"]
FILES = ["Player_Stats.csv", "Player_Treasury.csv", "Player_Happiness.csv",
         "CityBuildQueue.csv", "CityPurchase.csv", "Balance_Happiness.csv",
         "Player_Legacies.csv", "Player_Unlocks.csv", "GameCore.log"]
UI_KEYS = ["victory races:", "strategy:", "economy:", "gold:", "autopilot:",
           "queue:", "queue probe:", "science", "space", "unrest", "unhappy",
           "ERROR", "JS Error", "production first", "victory work:"]


def capture():
    provenance = {}
    with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            raw = (LOGS / name).read_bytes()
            archive.writestr(name, raw)
            provenance[name] = {"source": str(LOGS / name), "bytes": len(raw),
                                "sha256": hashlib.sha256(raw).hexdigest()}
        selected = []
        digest = hashlib.sha256()
        size = 0
        with (LOGS / "UI.log").open("rb") as source:
            for number, raw in enumerate(source, 1):
                digest.update(raw)
                size += len(raw)
                line = raw.decode("utf-8-sig", errors="strict").strip()
                if ("[XPL]" in line and any(k in line for k in UI_KEYS)) or "JS Error" in line:
                    selected.append(json.dumps({"line": number, "text": line}, ensure_ascii=False))
        archive.writestr("ui-evidence.jsonl", "\n".join(selected))
        provenance["UI.log"] = {"source": str(LOGS / "UI.log"), "bytes": size,
                                "sha256": digest.hexdigest(), "selected_lines": len(selected)}
        archive.writestr("provenance.json", json.dumps(provenance, indent=2))


def capture_history():
    """Save only this game's city history, rather than the user's entire database."""
    source = LOGS.parent / "HallofFame.sqlite"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as database:
        database.row_factory = sqlite3.Row
        game = dict(database.execute("SELECT * FROM Games ORDER BY GameID DESC LIMIT 1").fetchone())
        rows = [dict(row) for row in database.execute("""
            SELECT o.ObjectID, o.Name, d.DataSet, v.X AS turn, v.Y AS value
            FROM GameObjects o
            JOIN GamePlayers p ON p.PlayerObjectID = o.PlayerObjectID
            JOIN DataSets d ON d.ObjectID = o.ObjectID
            JOIN DataSetValues v ON v.DataSetID = d.DataSetID
            WHERE o.GameID = ? AND p.PlayerID = 0 AND o.Type = 'City'
              AND d.DataSet IN ('Happiness','Production','Science','Food','Culture','Gold','Population')
            ORDER BY o.ObjectID, d.DataSet, v.X
        """, (game["GameID"],))]
    history = {"source": str(source), "game": game, "rows": rows}
    with zipfile.ZipFile(ARCHIVE, "a", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        if "history.json" in archive.namelist():
            raise ValueError("History is already captured; avoid duplicate archive members.")
        archive.writestr("history.json", json.dumps(history, ensure_ascii=False))


def city_history(last_turn=93):
    """Hall of Fame series store changes; carry them forward until the null end marker."""
    with zipfile.ZipFile(ARCHIVE) as archive:
        history = json.loads(archive.read("history.json"))
    changes = defaultdict(lambda: defaultdict(dict))
    for row in history["rows"]:
        changes[row["Name"]][row["turn"]][row["DataSet"]] = row["value"]
    dense = []
    for name, by_turn in changes.items():
        values = {}
        for turn in range(1, last_turn + 1):
            values.update(by_turn.get(turn, {}))
            if values.get("Happiness") is None:
                continue
            dense.append({"name": name, "turn": turn, **values})
    return history, dense


CORE_CITIES = ["Ниневия", "Кальху", "Арби-Илу", "Аррапха", "Шираз", "Ахваз"]


def happiness_summary(dense):
    """Observed deficits plus a fixed-state, zero-unhappiness upper-bound calculation."""
    result = []
    for name in CORE_CITIES:
        rows = [row for row in dense if row["name"] == name]
        recovery = {metric: 0.0 for metric in ["Production", "Science"]}
        for row in rows:
            penalty = min(0.8, max(0, -row["Happiness"]) * 0.05)
            for metric in recovery:
                recovery[metric] += row[metric] * penalty / (1 - penalty)
        result.append({
            "city": name,
            "observed_turns": len(rows),
            "negative_turns": sum(row["Happiness"] < 0 for row in rows),
            "minimum_happiness": min(row["Happiness"] for row in rows),
            "turns_at_penalty_cap": sum(row["Happiness"] <= -16 for row in rows),
            "mean_production": round(sum(row["Production"] for row in rows) / len(rows), 1),
            "potential_production_recovery": round(recovery["Production"]),
            "potential_science_recovery": round(recovery["Science"]),
        })
    return result


def modern_finance(stats, frames):
    rows = [row for row in stats if row["age"] == "MODERN" and row["player"] == 0]
    spending = Counter()
    goal_turns = Counter()
    for frame in frames:
        if frame["age"] != "MODERN":
            continue
        for row in frame["lines"]:
            text = row["text"]
            if "gold:" not in text:
                continue
            goal = re.search(r"goal (\w+)", text)
            if goal:
                goal_turns[goal[1]] += 1
            purchases = re.search(r"; spent \d+ \[(.*)\]; cheapest", text)
            if purchases:
                for purchase in purchases[1].split(", "):
                    entry = re.match(r"(\w+) (.*) (\d+)$", purchase)
                    if entry:
                        spending[entry[1]] += int(entry[3])
    return {
        "maximum_balance": max(row["gold_balance"] for row in rows),
        "zero_balance_turns": [row["turn"] for row in rows if row["gold_balance"] == 0],
        "negative_income_turns": [row["turn"] for row in rows if row["gold"] < 0],
        "recorded_spending": dict(spending),
        "goal_turns": dict(goal_turns),
    }


def read_csv(archive, name, turn_index=0):
    rows = list(csv.reader(io.StringIO(archive.read(name).decode("utf-8-sig")), skipinitialspace=True))
    age = 0
    previous_turn = -1
    result = []
    for line, values in enumerate(rows[1:], 2):
        if not values or not values[turn_index].strip().isdigit():
            continue
        values = [v.strip() for v in values]
        turn = int(values[turn_index])
        if turn < previous_turn:
            age += 1
        previous_turn = turn
        result.append({"age": AGES[age] if age < 3 else f"SEGMENT_{age}",
                       "turn": turn, "line": line, "values": values})
    return rows[0], result


def load():
    with zipfile.ZipFile(ARCHIVE) as archive:
        tables = {name: read_csv(archive, name, 1 if name in ["Player_Legacies.csv", "Player_Unlocks.csv"] else 0)
                  for name in FILES if name.endswith(".csv")}
        ui = [json.loads(line) for line in archive.read("ui-evidence.jsonl").decode("utf-8").splitlines()]
        core = archive.read("GameCore.log").decode("utf-8-sig")
        provenance = json.loads(archive.read("provenance.json"))
    return tables, ui, core, provenance


def frames_from(ui):
    frames = []
    current = []
    for row in ui:
        if "victory races:" in row["text"]:
            if current:
                frames.append(current)
            current = []
        current.append(row)
    if current:
        frames.append(current)
    result = []
    last_age = "ANTIQUITY"
    for lines in frames:
        text = "\n".join(r["text"] for r in lines)
        age_match = re.search(r"AGE_(ANTIQUITY|EXPLORATION|MODERN)", text)
        if age_match:
            last_age = age_match[1]
        turn_match = re.search(r"gold: T(\d+)", text) or re.search(r"economy: T(\d+)", text)
        if not turn_match:
            continue
        frame = {"age": last_age, "turn": int(turn_match[1]), "lines": lines}
        race = re.search(r"victory races: SCIENCE (\d+)/100 \(rival (\d+)(?:, countdown (\d+))?\)", text)
        if race:
            frame.update(innovation=int(race[1]), rival=int(race[2]), countdown=int(race[3]) if race[3] else None)
        frame["gate_open"] = "gate open 1" in text
        frame["actions"] = []
        for row in lines:
            match = re.search(r"autopilot: ([A-Z_]+) (\[.*\])", row["text"])
            if match:
                try:
                    frame["actions"].append({"key": match[1], "args": json.loads(match[2]), "line": row["line"]})
                except json.JSONDecodeError:
                    pass
        result.append(frame)
    return result


STATS_FIELDS = {"cities": 2, "towns": 3, "cap": 4, "over_cap": 5, "urban": 6,
                "rural": 7, "techs": 8, "land_units": 9, "naval_units": 10,
                "gold_balance": 13, "science": 14, "culture": 15, "gold": 16,
                "production": 17, "food": 18, "happiness": 19, "influence": 20}


def stats_rows(tables):
    return [{"age": r["age"], "turn": r["turn"], "player": int(r["values"][1]), "line": r["line"],
             **{key: float(r["values"][index]) for key, index in STATS_FIELDS.items()}}
            for r in tables["Player_Stats.csv"][1]]


def build_rows(tables):
    rows = []
    for r in tables["CityBuildQueue.csv"][1]:
        v = r["values"]
        rows.append({"age": r["age"], "turn": r["turn"], "player": int(v[1]), "city": v[2],
                     "added": float(v[3]), "item": v[4], "current": float(v[5]),
                     "needed": float(v[6]), "overflow": float(v[7]), "line": r["line"]})
    return rows


def runs_from(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["age"], row["player"], row["city"])].append(row)
    runs = []
    for (age, player, city), history in groups.items():
        active = None
        for row in history:
            if (active is None or row["item"] != active["item"]
                    or row["turn"] > active["end"] + 1
                    or row["current"] < active["last_current"] - 0.1):
                if active:
                    runs.append(active)
                active = {"age": age, "player": player, "city": city, "item": row["item"],
                          "start": row["turn"], "end": row["turn"], "turns": 0,
                          "first_current": row["current"], "last_current": 0,
                          "needed": row["needed"], "production_added": 0, "line": row["line"], "completed": False}
            active["end"] = row["turn"]
            active["turns"] += 1
            active["last_current"] = row["current"]
            active["needed"] = row["needed"]
            active["production_added"] += row["added"]
            active["completed"] |= row["current"] >= row["needed"] - 0.01
        if active:
            runs.append(active)
    return runs


def summarize(tables, ui, core):
    stats = stats_rows(tables)
    builds = build_rows(tables)
    frames = frames_from(ui)
    runs = runs_from(builds)
    summary = {"victory": [l for l in core.splitlines() if "has won" in l], "quality": {}, "ages": {}}
    keys = [(r["age"], r["turn"], r["player"]) for r in stats]
    summary["quality"] = {"stats_rows": len(stats), "stats_duplicate_keys": len(keys) - len(set(keys)),
                          "stats_header_columns": len(tables["Player_Stats.csv"][0]),
                          "stats_row_columns": sorted(set(len(r["values"]) for r in tables["Player_Stats.csv"][1])),
                          "ui_frames": len(frames), "unassigned_ui_lines": len(ui) - sum(len(f["lines"]) for f in frames)}
    for age in AGES:
        own = [r for r in stats if r["age"] == age and r["player"] == 0]
        fs = [f for f in frames if f["age"] == age]
        points = []
        previous = None
        for f in fs:
            if f.get("innovation") is not None and f["innovation"] != previous:
                points.append({k: f[k] for k in ["turn", "innovation", "rival", "countdown"]})
                previous = f["innovation"]
        summary["ages"][age] = {
            "last": own[-1], "samples": [r for r in own if r["turn"] in [1,2,10,20,30,40,50,60,70,80,88,90,93]],
            "innovation_changes": points,
            "gate_open": next((f["turn"] for f in fs if f["gate_open"]), None),
            "actions": dict(Counter(a["key"] for f in fs for a in f["actions"])),
            "conversions": [{"turn": f["turn"], **a} for f in fs for a in f["actions"] if a["key"] == "TOWN_CONVERTED"],
            "space_runs": [r for r in runs if r["age"] == age and r["player"] == 0 and (r["item"].startswith("PROJECT_") or r["item"] in ["BUILDING_LAUNCH_PAD","BUILDING_AIRFIELD"])],
            "longest_runs": sorted([r for r in runs if r["age"] == age and r["player"] == 0], key=lambda r: -r["turns"])[:15],
        }
    return summary, stats, builds, frames, runs


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--capture" in sys.argv:
        capture()
        capture_history()
    tables, ui, core, provenance = load()
    summary, stats, builds, frames, runs = summarize(tables, ui, core)
    history, dense = city_history()
    summary["happiness"] = happiness_summary(dense)
    summary["modern_finance"] = modern_finance(stats, frames)
    (HERE / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"victory": summary["victory"], "quality": summary["quality"],
                      "ages": {age: {k: v for k,v in data.items() if k in ["last","innovation_changes","gate_open","conversions","space_runs"]}
                               for age,data in summary["ages"].items()}}, ensure_ascii=False, indent=2))
