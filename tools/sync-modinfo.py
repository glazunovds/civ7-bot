"""Regenerates the <ImportFiles> list of the main game action group from the mod folder.

Every .js/.html/.css/.png under ui/ is listed except the UIScripts entry points
(they are loaded via <UIScripts>). Keeps the rest of the .modinfo untouched.
Usage: python -I tools/sync-modinfo.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "mod" / "expansion-planner"
MODINFO = ROOT / "expansion-planner.modinfo"
ENTRY_POINTS = {"ui/xpl-main.js", "ui/integrations/xpl-dmt-present.js"}
EXTENSIONS = {".js", ".html", ".css", ".png"}


def main():
    files = sorted(
        p.relative_to(ROOT).as_posix()
        for p in (ROOT / "ui").rglob("*")
        if p.is_file() and p.suffix in EXTENSIONS and p.relative_to(ROOT).as_posix() not in ENTRY_POINTS
    )
    # The game resolves imported mod files by FILE NAME across all mods (and the base
    # game): a generic name like yields.js or settings.js shadows another mod's file.
    # Every file we import therefore carries the "xpl-" prefix.
    bad = [f for f in files if not pathlib.PurePosixPath(f).name.startswith("xpl-")]
    if bad:
        sys.exit("files without the xpl- prefix (they would clash with other mods): " + ", ".join(bad))
    # Non-JS assets first, then modules, for readability.
    files.sort(key=lambda f: (f.endswith(".js"), f))
    text = MODINFO.read_text(encoding="utf-8")
    pattern = re.compile(r"(<ImportFiles>\n)(.*?)(\s*</ImportFiles>)", re.S)
    match = pattern.search(text)
    if not match:
        sys.exit("ImportFiles block not found")
    indent = "          "
    body = "".join(f"{indent}<Item>{f}</Item>\n" for f in files).rstrip("\n")
    text = text[: match.start(2)] + body + text[match.end(2):]
    MODINFO.write_text(text, encoding="utf-8", newline="\n")
    print(f"ImportFiles: {len(files)} items")


if __name__ == "__main__":
    main()
