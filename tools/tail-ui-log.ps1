<#
  Follows UI.log and shows Expansion Planner lines plus JS errors.
  Usage: powershell -File tools\tail-ui-log.ps1 [-All]
#>
param([switch]$All)
$log = Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII\Logs\UI.log"
if (-not (Test-Path $log)) { Write-Host "UI.log not found yet: $log"; exit 1 }
if ($All) {
    Get-Content -Path $log -Wait -Tail 50
} else {
    Get-Content -Path $log -Wait -Tail 200 | Select-String -Pattern '\[XPL\]|expansion-planner|Uncaught|SOURCE ERROR'
}
