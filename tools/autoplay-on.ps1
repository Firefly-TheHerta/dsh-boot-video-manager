# Let the boot splash play sound on a cold start (no click needed).
#
# Chromium refuses audible autoplay until a page has had a user gesture, and the
# splash screen runs before any click. That rule is not what silences this machine's
# cold start -- the screen used to mute itself 1.2s into a slow first play(), which
# is fixed in dsh-boot-animation -- but it is the remaining way a policy refusal can
# silence one, and a launch switch is the only lever a plugin has. So the desktop app
# can be launched with
#
#     --autoplay-policy=no-user-gesture-required
#
# This script appends that switch to the Arguments of every DeepSeek Harness
# shortcut it can find (Start menu, desktop, taskbar pins, Quick Launch) and
# remembers the original arguments in .autoplay-backup.json, so -Revert can put
# everything back. No registry key is written and nothing else is touched.
#
#   .\autoplay-on.ps1 -DryRun    # only show what would change
#   .\autoplay-on.ps1            # apply
#   .\autoplay-on.ps1 -Revert    # undo (uses the backup file)
#
# Launching the app some other way (a direct double click on the .exe, a third
# party launcher) still uses the default policy -- there is no switch for that
# case, only shortcuts can carry one.
#
# ASCII only on purpose: PowerShell 5.1 reads .ps1 files as ANSI unless they
# carry a BOM, so non-ASCII comments here would be mojibake.

param(
    [switch] $Revert,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

$exeName = 'DeepSeek Harness.exe'
$flag = '--autoplay-policy=no-user-gesture-required'
$backupPath = Join-Path $PSScriptRoot '.autoplay-backup.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-ShortcutDirs {
    $dirs = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch'),
        # The Desktop shell folder can be redirected anywhere -- on the machine this
        # was written on it points at D:\<name> -- so a literal %USERPROFILE%\Desktop
        # alone finds nothing on exactly the machines that moved it.
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        (Join-Path $env:PUBLIC 'Desktop')
    )
    $dirs | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
}

function Read-Backup {
    $map = @{}
    if (Test-Path -LiteralPath $backupPath) {
        $json = [System.IO.File]::ReadAllText($backupPath, $utf8NoBom)
        if ($json.Trim().Length -gt 0) {
            $data = $json | ConvertFrom-Json
            foreach ($property in $data.PSObject.Properties) {
                $map[$property.Name] = [string]$property.Value
            }
        }
    }
    return $map
}

$shell = New-Object -ComObject WScript.Shell

# ---------------------------------------------------------------- revert ----
if ($Revert) {
    $backup = Read-Backup
    if ($backup.Count -eq 0) {
        Write-Host 'nothing to revert: no backup file at'
        Write-Host "  $backupPath"
        return
    }
    foreach ($path in $backup.Keys) {
        if (-not (Test-Path -LiteralPath $path)) {
            Write-Host "missing     : $path (skipped)"
            continue
        }
        $lnk = $shell.CreateShortcut($path)
        $lnk.Arguments = $backup[$path]
        $lnk.Save()
        Write-Host "restored    : $path"
    }
    if (-not $DryRun) {
        Remove-Item -LiteralPath $backupPath -Force
        Write-Host ''
        Write-Host 'backup file removed; restart DeepSeek Harness to get the default policy back.'
    }
    return
}

# ------------------------------------------------------------------ apply ----
$backup = Read-Backup
$found = 0
$patched = 0
$already = 0

foreach ($dir in Get-ShortcutDirs) {
    $items = Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        $lnk = $shell.CreateShortcut($item.FullName)
        if (-not $lnk.TargetPath) { continue }
        if ([System.IO.Path]::GetFileName($lnk.TargetPath) -ne $exeName) { continue }
        $found++
        $before = [string]$lnk.Arguments
        if ($before -match [regex]::Escape($flag)) {
            $already++
            Write-Host "already set : $($item.FullName)"
            continue
        }
        $after = ($before + ' ' + $flag).Trim()
        if ($DryRun) {
            Write-Host "would patch : $($item.FullName)"
            Write-Host "              args  '$before'"
            Write-Host "                ->  '$after'"
            continue
        }
        if (-not $backup.ContainsKey($item.FullName)) { $backup[$item.FullName] = $before }
        $lnk.Arguments = $after
        $lnk.Save()
        $patched++
        Write-Host "patched     : $($item.FullName)"
    }
}

if ($DryRun) {
    Write-Host ''
    Write-Host "shortcuts pointing at $exeName : $found"
    if ($found -eq 0) {
        Write-Host 'nothing to patch. Add the switch by hand to whatever launches DSH:'
        Write-Host "  $flag"
    } else {
        Write-Host 'run again without -DryRun to apply.'
    }
    return
}

if ($patched -gt 0) {
    $lines = @()
    foreach ($path in ($backup.Keys | Sort-Object)) {
        $lines += ('  "{0}": "{1}"' -f $path.Replace('\', '\\'), $backup[$path].Replace('\', '\\').Replace('"', '\"'))
    }
    $json = "{`n" + ($lines -join ",`n") + "`n}`n"
    [System.IO.File]::WriteAllText($backupPath, $json, $utf8NoBom)
}

Write-Host ''
Write-Host "shortcuts pointing at $exeName : $found"
Write-Host "patched now                    : $patched"
Write-Host "already had the switch         : $already"
if ($patched -gt 0) {
    Write-Host ''
    Write-Host 'fully quit DeepSeek Harness and start it again from the shortcut;'
    Write-Host 'the splash should then be audible immediately.'
    Write-Host "undo with:  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Revert"
}
if ($found -eq 0) {
    Write-Host 'no shortcut found. Add the switch by hand to whatever launches DSH:'
    Write-Host "  $flag"
}
