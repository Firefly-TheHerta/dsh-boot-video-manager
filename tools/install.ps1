# Install dsh-boot-video-manager into a DSH profile.
#
# It does three things and nothing else:
#   1. links <source> into <profile>/node_modules/dsh-boot-video-manager (junction)
#   2. backs up <profile>/cordis.patch.yml
#   3. appends one `- insert:` entry that mounts the plugin
#
# No package.json edit, no pnpm run. The profile patch layer reloads live, so a
# browser refresh is enough; restart DSH if the settings entry does not show up.
#
# ASCII only on purpose: PowerShell 5.1 reads .ps1 files as ANSI unless they
# carry a BOM, so non-ASCII comments here would be mojibake.

param(
    [string] $ProfileName = 'desktop'
)

$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName"

if (-not (Test-Path -LiteralPath (Join-Path $profileDir 'package.json'))) {
    $known = @()
    $profilesRoot = Join-Path $env:USERPROFILE '.dsh\profiles'
    if (Test-Path -LiteralPath $profilesRoot) {
        $known = Get-ChildItem -LiteralPath $profilesRoot -Directory | ForEach-Object { $_.Name }
    }
    throw "profile not found: $profileDir (existing profiles: $($known -join ', '))"
}

# Read as UTF-8 through .NET: PowerShell 5.1 Get-Content would decode the file as
# ANSI and mangle any non-ASCII text in package.json.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$packageText = [System.IO.File]::ReadAllText((Join-Path $source 'package.json'), $utf8NoBom)
$packageName = ([regex]'"name"\s*:\s*"([^"]+)"').Match($packageText).Groups[1].Value
if ($packageName -ne 'dsh-boot-video-manager') {
    throw "unexpected package name in ${source}\package.json: $packageName"
}

# 1. junction ---------------------------------------------------------------
$modulesDir = Join-Path $profileDir 'node_modules'
if (-not (Test-Path -LiteralPath $modulesDir)) { New-Item -ItemType Directory -Path $modulesDir | Out-Null }
$link = Join-Path $modulesDir $packageName

if (Test-Path -LiteralPath $link) {
    $existing = Get-Item -LiteralPath $link -Force
    if ($existing.LinkType -eq 'Junction' -or $existing.LinkType -eq 'SymbolicLink') {
        # rmdir removes the link itself; Remove-Item -Recurse would delete the target.
        & cmd /c rmdir "$link" | Out-Null
    }
    else {
        throw "$link already exists and is not a link; remove it by hand first."
    }
}
New-Item -ItemType Junction -Path $link -Target $source | Out-Null
Write-Host "linked   $link -> $source"

# 2. backup + 3. patch entry ------------------------------------------------
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$encoding = $utf8NoBom

if (Test-Path -LiteralPath $patchPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$patchPath.bak-$stamp"
    Copy-Item -LiteralPath $patchPath -Destination $backup
    $text = [System.IO.File]::ReadAllText($patchPath, $encoding)
    Write-Host "backup   $backup"
}
else {
    $text = ''
    Write-Host "backup   (no cordis.patch.yml yet, creating one)"
}

if ($text -match [regex]::Escape($packageName)) {
    Write-Host "patch    already mentions $packageName, left as is"
}
else {
    if ($text -ne '' -and -not $text.EndsWith("`n")) { $text += "`n" }
    $block = "- insert:`n    - id: boot-video-manager`n      name: $packageName`n"
    $text = $text + $block
    [System.IO.File]::WriteAllText($patchPath, $text, $encoding)
    Write-Host "patch    appended to $patchPath"
}

# report --------------------------------------------------------------------
Write-Host ''
Write-Host "profile  $profileDir"
Write-Host "source   $source"
Write-Host "done. Refresh the DSH window (F5) to see Settings -> Plugin manager."
Write-Host ''
Write-Host "To remove later:  powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\uninstall.ps1`" -ProfileName $ProfileName"
