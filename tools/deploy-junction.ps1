<#
  Links the dev copy of the mod into the game's local Mods folder with a directory
  junction (no admin rights needed). Safe to re-run: an existing correct junction is
  left alone; anything else at the target path is NOT touched.
#>
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\mod\expansion-planner' | Resolve-Path
$modsDir = Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII\Mods"
$target = Join-Path $modsDir 'expansion-planner'

if (-not (Test-Path $modsDir)) { throw "Mods folder not found: $modsDir" }

if (Test-Path $target) {
    $item = Get-Item $target -Force
    if ($item.LinkType -eq 'Junction' -and ($item.Target -contains $source.Path)) {
        Write-Host "Junction already in place: $target -> $($source.Path)"
        exit 0
    }
    throw "Target exists and is not our junction (leaving it untouched): $target"
}

New-Item -ItemType Junction -Path $target -Target $source.Path | Out-Null
Write-Host "Created junction: $target -> $($source.Path)"
