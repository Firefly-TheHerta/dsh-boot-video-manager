# Uninstall dsh-boot-video-manager from a DSH profile.
#
#   1. drops the `- insert:` block that mounts this plugin from cordis.patch.yml
#   2. removes the junction in <profile>/node_modules
#   3. puts the DSH shortcut back if autoplay-on.ps1 had added the autoplay switch
#
# The plugin source directory and the splash clips are never touched.
# ASCII only (PowerShell 5.1 without BOM reads .ps1 as ANSI).

param(
    [string] $ProfileName = 'desktop'
)

$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName"
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$link = Join-Path $profileDir 'node_modules\dsh-boot-video-manager'
$encoding = New-Object System.Text.UTF8Encoding($false)

if (Test-Path -LiteralPath $patchPath) {
    $lines = [System.IO.File]::ReadAllLines($patchPath, $encoding)
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item -LiteralPath $patchPath -Destination "$patchPath.bak-$stamp"
    $kept = New-Object System.Collections.Generic.List[string]
    $removed = 0
    $i = 0
    while ($i -lt $lines.Length) {
        $line = $lines[$i]
        $isInsert = $line -match '^\s*-\s*insert:\s*$'
        $namesPlugin = ($i + 2 -lt $lines.Length) -and
            ($lines[$i + 1] -match 'boot-video-manager') -and
            ($lines[$i + 2] -match 'boot-video-manager')
        if ($isInsert -and $namesPlugin) {
            $removed = $removed + 1
            $i = $i + 3
            continue
        }
        $kept.Add($line)
        $i = $i + 1
    }
    [System.IO.File]::WriteAllLines($patchPath, $kept, $encoding)
    Write-Host "patch    removed $removed block(s) from $patchPath"
}
else {
    Write-Host "patch    no $patchPath, nothing to do"
}

if (Test-Path -LiteralPath $link) {
    & cmd /c rmdir "$link" | Out-Null
    Write-Host "link     removed $link"
}
else {
    Write-Host "link     no $link, nothing to do"
}

# 3. autoplay switch ---------------------------------------------------------
$autoplayScript = Join-Path $PSScriptRoot 'autoplay-on.ps1'
$autoplayBackup = Join-Path $PSScriptRoot '.autoplay-backup.json'
if ((Test-Path -LiteralPath $autoplayBackup) -and (Test-Path -LiteralPath $autoplayScript)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $autoplayScript -Revert
}
else {
    Write-Host "autoplay no shortcut change to revert"
}

Write-Host ''
Write-Host "done. Refresh the DSH window (F5) or restart DSH."
