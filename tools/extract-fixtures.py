"""Extracts GameInfo-like tables from the game's XML data (read-only) into a JSON
fixture for Node tests: tests/fixtures/gameinfo-<age>.json.

Loads Base/modules/base-standard/data/*.xml plus Base/modules/age-<age>/data/*.xml
(the same two layers the game loads for a game in that age). Only <Row> elements are
read; <Update>/<Delete> are applied for the tables we keep.
Usage: python -I tools/extract-fixtures.py [antiquity|exploration|modern]
"""
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

GAME = pathlib.Path(r"D:\SteamLibrary\steamapps\common\Sid Meier's Civilization VII\Base\modules")
OUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures"
TABLES = {
    "Ages", "Terrains", "Biomes", "Features", "Resources", "Yields", "TypeTags", "GlobalParameters",
    "Constructibles", "Buildings", "Constructible_YieldChanges", "Constructible_Adjacencies",
    "Adjacency_YieldChanges", "Constructible_ValidResources", "District_FreeConstructibles",
    "Districts", "Wonders", "UniqueQuarters", "Constructible_WildcardAdjacencies",
    "Constructible_ValidDistricts", "Constructible_ValidTerrains", "TerrainBiomeFeature_YieldChanges",
    "Constructible_ValidFeatures", "Constructible_RequiredFeatureClasses", "CivilizationTraits", "Civilizations",
    "LeaderTraits", "UniqueQuarterModifiers", "Projects", "Project_Units", "Constructible_Maintenances",
    "Units",
}
KEYS = {  # primary key column per table, for Update/Delete matching and lookup()
    "Ages": "AgeType", "Terrains": "TerrainType", "Biomes": "BiomeType", "Features": "FeatureType",
    "Resources": "ResourceType", "Yields": "YieldType", "Constructibles": "ConstructibleType",
    "Buildings": "ConstructibleType", "Adjacency_YieldChanges": "ID", "Districts": "DistrictType",
    "Wonders": "ConstructibleType", "UniqueQuarters": "UniqueQuarterType", "GlobalParameters": "Name",
    "Projects": "ProjectType", "Units": "UnitType",
}


def row_dict(el):
    d = dict(el.attrib)
    for child in el:
        if len(child) == 0 and child.text is not None:
            d[child.tag] = child.text.strip()
    return d


def load(paths):
    tables = {t: [] for t in TABLES}
    for path in paths:
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError as e:
            print(f"skip {path.name}: {e}", file=sys.stderr)
            continue
        for table in root:
            if table.tag not in TABLES:
                continue
            rows = tables[table.tag]
            key = KEYS.get(table.tag)
            for op in table:
                if op.tag == "Row":
                    rows.append(row_dict(op))
                elif op.tag in ("Update", "Delete") and key:
                    where = op.find("Where")
                    if where is None:
                        continue
                    match = where.attrib
                    targets = [r for r in rows if all(r.get(k) == v for k, v in match.items())]
                    if op.tag == "Delete":
                        for r in targets:
                            rows.remove(r)
                    else:
                        setv = op.find("Set")
                        for r in targets:
                            r.update(setv.attrib if setv is not None else {})
    return tables


def main():
    age = sys.argv[1] if len(sys.argv) > 1 else "antiquity"
    paths = sorted((GAME / "base-standard" / "data").glob("*.xml")) + sorted((GAME / f"age-{age}" / "data").glob("*.xml"))
    tables = load(paths)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"gameinfo-{age}.json"
    out.write_text(json.dumps({"age": f"AGE_{age.upper()}", "tables": tables}, indent=0), encoding="utf-8")
    print(f"wrote {out} ({', '.join(f'{t}:{len(r)}' for t, r in sorted(tables.items()) if r)})")


if __name__ == "__main__":
    main()
