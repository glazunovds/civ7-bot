<#
  Keeps the game's logs: the game overwrites its Logs folder at every launch (game 60's review lost the evening game of
  23 October that way). Copies the folder into LogArchive\<session start>.zip next to it (the session start is UI.log's
  first time stamp), so running it again during the same session refreshes that session's zip.
  Usage: powershell -NoProfile -File tools\archive-logs.ps1 [-Keep 12] [-Dest <folder>]
  A session whose UI.log has not changed since its zip is skipped. The scheduled task "Civ7 log archive" runs it every
  15 minutes (Unregister-ScheduledTask -TaskName "Civ7 log archive" removes it).
  Files the game holds open are read with FileShare.ReadWrite, as tools that tail them do.
#>
param([int]$Keep = 12, [string]$Dest = "")
$base = Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII"
$logs = Join-Path $base "Logs"
if (-not $Dest) { $Dest = Join-Path $base "LogArchive" }
$ui = Join-Path $logs "UI.log"
if (-not (Test-Path $ui)) { Write-Host "UI.log not found: $ui"; exit 1 }

function Read-Shared([string]$path) {
    $src = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
    # The comma keeps an empty file's byte array from unrolling to $null.
    try { $mem = New-Object System.IO.MemoryStream; $src.CopyTo($mem); return ,$mem.ToArray() } finally { $src.Close() }
}

$head = [System.Text.Encoding]::UTF8.GetString((Read-Shared $ui), 0, [Math]::Min(200, (Get-Item $ui).Length))
$m = [regex]::Match($head, '\[(\d{4}-\d\d-\d\d) (\d\d):(\d\d):(\d\d)\]')
$key = if ($m.Success) { "$($m.Groups[1].Value)_$($m.Groups[2].Value)-$($m.Groups[3].Value)" } else { (Get-Item $ui).CreationTime.ToString('yyyy-MM-dd_HH-mm') }

New-Item -ItemType Directory -Force $Dest | Out-Null
$zip = Join-Path $Dest "$key.zip"
if ((Test-Path $zip) -and (Get-Item $zip).LastWriteTime -ge (Get-Item $ui).LastWriteTime) {
    Write-Host "the session started $key has not changed since $zip"; exit 0
}
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "civ7-logs-$key"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force $tmp | Out-Null
$n = 0
foreach ($f in Get-ChildItem $logs -File) {
    try { [System.IO.File]::WriteAllBytes((Join-Path $tmp $f.Name), (Read-Shared $f.FullName)); $n++ }
    catch { Write-Host "skipped $($f.Name): $($_.Exception.Message)" }
}
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip -Force
Remove-Item -Recurse -Force $tmp
Write-Host "archived $n file(s) of the session started $key -> $zip"

$old = Get-ChildItem $Dest -Filter *.zip | Sort-Object Name -Descending | Select-Object -Skip $Keep
foreach ($o in $old) { Remove-Item -Force $o.FullName; Write-Host "removed the oldest archive $($o.Name)" }
