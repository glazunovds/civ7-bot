<#
  Syntax gate before a game run: parses every mod .js/.mjs file with Node (no execution)
  and checks that every XML/.modinfo file is well-formed.
#>
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\mod\expansion-planner' | Resolve-Path
$failed = 0

Get-ChildItem $root -Recurse -Include *.js, *.mjs | ForEach-Object {
    $out = & node --check $_.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        $failed++
        Write-Host "JS  FAIL $($_.FullName)" -ForegroundColor Red
        $out | ForEach-Object { Write-Host "    $_" }
    }
}

Get-ChildItem $root -Recurse -Include *.xml, *.modinfo | ForEach-Object {
    try {
        [xml](Get-Content -Raw -Encoding UTF8 $_.FullName) | Out-Null
    } catch {
        $failed++
        Write-Host "XML FAIL $($_.FullName): $($_.Exception.Message)" -ForegroundColor Red
    }
}

if ($failed -gt 0) { Write-Host "$failed file(s) failed" -ForegroundColor Red; exit 1 }
Write-Host 'All mod files parse.' -ForegroundColor Green
