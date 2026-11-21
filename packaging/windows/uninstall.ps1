[CmdletBinding()]
param(
    [string]$InstallDir = '',
    [string]$DataDir = '',
    [string]$RecordingsDir = '',
    [string]$StartupFolder = '',
    [string]$ProgramsFolder = '',
    [switch]$PurgeUserData
)
$ErrorActionPreference = 'Stop'

function Get-FullPath([string]$Path) {
    $trimChars = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $full = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path))
    if ($full.Equals([IO.Path]::GetPathRoot($full), [StringComparison]::OrdinalIgnoreCase)) { return $full }
    return $full.TrimEnd($trimChars)
}
function Test-IsWithin([string]$Child, [string]$Parent) {
    $c = (Get-FullPath $Child) + [IO.Path]::DirectorySeparatorChar
    $p = (Get-FullPath $Parent) + [IO.Path]::DirectorySeparatorChar
    return $c.StartsWith($p, [StringComparison]::OrdinalIgnoreCase)
}
function Assert-NotDriveRoot([string]$Path, [string]$Label) {
    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($full)
    $trimChars = [char[]]@([char]92, [char]47)
    if ($full.TrimEnd($trimChars) -eq $root.TrimEnd($trimChars)) { throw "$Label ne peut pas être une racine de volume." }
}
function Quote-PS([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }

if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA est introuvable; impossible de préserver les données utilisateur.' }
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $PSScriptRoot }
$InstallDir = Get-FullPath $InstallDir
$Exe = Join-Path $InstallDir 'BoitierTiktokLive.exe'
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw "Installation BTL introuvable : '$InstallDir'." }
$MetadataPath = Join-Path $InstallDir 'install-info.json'
$InstallMetadata = $null
if (Test-Path -LiteralPath $MetadataPath) {
    try { $InstallMetadata = Get-Content -Raw $MetadataPath | ConvertFrom-Json } catch { }
}
if (-not $DataDir -and $InstallMetadata) { $DataDir = $InstallMetadata.dataDir }
if (-not $DataDir) { $DataDir = Join-Path $env:LOCALAPPDATA 'BoitierTiktokRecorder' }
$DataDir = Get-FullPath $DataDir
if (-not $RecordingsDir -and $InstallMetadata) { $RecordingsDir = $InstallMetadata.recordingsDir }
if (-not $RecordingsDir) {
    $VideosDir = [Environment]::GetFolderPath('MyVideos')
    if (-not $VideosDir) {
        $UserHome = $env:USERPROFILE
        if (-not $UserHome) { $UserHome = $HOME }
        $VideosDir = Join-Path $UserHome 'Videos'
    }
    $RecordingsDir = Join-Path $VideosDir 'BoitierTiktokRecorder'
}
$RecordingsDir = Get-FullPath $RecordingsDir
Assert-NotDriveRoot $InstallDir 'InstallDir'
Assert-NotDriveRoot $DataDir 'DataDir'
Assert-NotDriveRoot $RecordingsDir 'RecordingsDir'
if (
    (Test-IsWithin $DataDir $InstallDir) -or
    (Test-IsWithin $InstallDir $DataDir) -or
    $DataDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-IsWithin $RecordingsDir $InstallDir) -or
    (Test-IsWithin $InstallDir $RecordingsDir) -or
    (Test-IsWithin $RecordingsDir $DataDir) -or
    (Test-IsWithin $DataDir $RecordingsDir) -or
    $RecordingsDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase) -or
    $RecordingsDir.Equals($DataDir, [StringComparison]::OrdinalIgnoreCase)
) {
    throw 'Les dossiers application, données et enregistrements doivent être séparés pour éviter une suppression accidentelle.'
}
$RunningBtl = @(Get-Process -Name 'BoitierTiktokLive' -ErrorAction SilentlyContinue | Where-Object {
    try {
        $ProcessPath = $_.Path
        if (-not $ProcessPath) { return $true }
        [IO.Path]::GetFullPath($ProcessPath).Equals($Exe, [StringComparison]::OrdinalIgnoreCase)
    } catch { return $true }
})
if ($RunningBtl.Count -gt 0) {
    throw 'Fermez Boitier Tiktok Live depuis le dossier installé et son icône de barre système avant de le désinstaller.'
}
if ($PurgeUserData) {
    $Confirmation = "$DataDir | $RecordingsDir"
    Write-Warning "La suppression est définitive et portera sur la configuration et les créateurs : $DataDir ; et les enregistrements : $RecordingsDir"
    $Answer = Read-Host 'Pour confirmer, saisissez exactement les deux chemins séparés par |'
    if ($Answer -cne $Confirmation) { throw "Confirmation incorrecte; les données utilisateur n’ont pas été supprimées." }
}

if (-not $StartupFolder) { $StartupFolder = [Environment]::GetFolderPath('Startup') }
if (-not $ProgramsFolder) { $ProgramsFolder = [Environment]::GetFolderPath('Programs') }
$StartupShortcut = Join-Path $StartupFolder 'Boitier Tiktok Live.lnk'
$StartMenuShortcut = Join-Path $ProgramsFolder 'Boitier Tiktok Live.lnk'
$Cleanup = @'
Start-Sleep -Seconds 2
$exe = __EXE__
$shell = New-Object -ComObject WScript.Shell
foreach ($shortcut in @(__STARTUP__, __STARTMENU__)) {
    if (Test-Path -LiteralPath $shortcut) {
        try {
            $link = $shell.CreateShortcut($shortcut)
            if ([IO.Path]::GetFullPath($link.TargetPath).Equals($exe, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $shortcut -Force
            }
        } catch { Write-Warning "Impossible de vérifier/supprimer le raccourci $shortcut : $_" }
    }
}
Remove-Item -LiteralPath __INSTALL__ -Recurse -Force
if (__PURGE__) {
    Remove-Item -LiteralPath __DATA__ -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath __RECORDINGS__ -Recurse -Force -ErrorAction SilentlyContinue
}
'@
$Cleanup = $Cleanup.Replace('__EXE__', (Quote-PS $Exe))
$Cleanup = $Cleanup.Replace('__STARTUP__', (Quote-PS $StartupShortcut))
$Cleanup = $Cleanup.Replace('__STARTMENU__', (Quote-PS $StartMenuShortcut))
$Cleanup = $Cleanup.Replace('__INSTALL__', (Quote-PS $InstallDir))
$Cleanup = $Cleanup.Replace('__DATA__', (Quote-PS $DataDir))
$Cleanup = $Cleanup.Replace('__RECORDINGS__', (Quote-PS $RecordingsDir))
$PurgeLiteral = if ($PurgeUserData) { '$true' } else { '$false' }
$Cleanup = $Cleanup.Replace('__PURGE__', $PurgeLiteral)
$Encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Cleanup))
Set-Location -LiteralPath $env:TEMP
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $env:TEMP -WindowStyle Hidden `
    -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $Encoded)
if ($PurgeUserData) {
    Write-Host 'Désinstallation lancée : raccourcis et application seront retirés, puis les deux dossiers confirmés seront supprimés.'
} else {
    Write-Host "Désinstallation lancée : raccourcis et application seront retirés. Configuration conservée dans '$DataDir'; enregistrements conservés dans '$RecordingsDir'."
}
