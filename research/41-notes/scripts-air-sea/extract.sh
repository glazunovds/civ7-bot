#!/bin/sh
# Extracts each evidence zip's CombatLog.csv and the [XPL] lines of its UI.log into $1/<game>-<zip name>/ (CombatLog.csv, xpl.log).
# Usage (repo root): sh research/41-notes/scripts-air-sea/extract.sh <empty scratch dir>
# Then: python -I research/41-notes/scripts-air-sea/annotate.py <dir>   (writes xpl-turns.log: each line tagged A12/E30/M7, the turn of the next `gold: T` line)
#       python -I .../losses.py "<game install dir>" <dir>              (our land units killed, by the attacker's domain)
#       python -I .../navalcombat.py "<game install dir>" <dir> [kills] (sea and air combat involving us)
#       python -I .../shiphits.py "<game install dir>" <dir>            (each ship hit on our land units: scout, formation member or other)
#       python -I .../formations.py <dir>; notheld3.py "<game>" <dir>; heldvsdamage.py <dir>; fronts.py <dir>
out="$1"
for z in research/game3*/evidence*.zip research/game4*/evidence*.zip; do
  g=$(dirname "$z" | sed 's#research/##'); n=$(basename "$z" .zip); d="$out/$g-$n"; mkdir -p "$d"
  unzip -o -q -j "$z" CombatLog.csv -d "$d" 2>/dev/null
  unzip -p "$z" UI.log 2>/dev/null | grep -a "\[XPL\]" > "$d/xpl.log"
done
