[CmdletBinding()]
param(
    [string]$SourceDir = '',
    [string]$InstallDir = '',
    [string]$DataDir = '',
    [string]$RecordingsDir = '',
    [string]$ProgramsFolder = ''
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
if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA est introuvable; impossible de choisir le dossier de données utilisateur.' }
if (-not $SourceDir) { $SourceDir = Split-Path -Parent $PSScriptRoot }
$SourceDir = Get-FullPath $SourceDir
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\BoitierTiktokRecorder' }
$InstallDir = Get-FullPath $InstallDir
if (-not $DataDir) { $DataDir = Join-Path $env:LOCALAPPDATA 'BoitierTiktokRecorder' }
$DataDir = Get-FullPath $DataDir
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
$Exe = Join-Path $SourceDir 'BoitierTiktokLive.exe'
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf) -or -not (Test-Path (Join-Path $SourceDir 'tools'))) {
    throw "Payload BTL incomplet : '$SourceDir' doit contenir BoitierTiktokLive.exe et tools/."
}
& $Exe --check-tools
if ($LASTEXITCODE -ne 0) { throw 'Les outils de capture du ZIP ne passent pas --check-tools; installation annulée.' }
if (
    (Test-IsWithin $DataDir $InstallDir) -or
    (Test-IsWithin $InstallDir $DataDir) -or
    $InstallDir.Equals($DataDir, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-IsWithin $RecordingsDir $InstallDir) -or
    (Test-IsWithin $InstallDir $RecordingsDir) -or
    (Test-IsWithin $RecordingsDir $DataDir) -or
    (Test-IsWithin $DataDir $RecordingsDir) -or
    $RecordingsDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase) -or
    $RecordingsDir.Equals($DataDir, [StringComparison]::OrdinalIgnoreCase)
) {
    throw 'Les dossiers application, données et enregistrements doivent être séparés. Configuration et liste de créateurs restent sous %LOCALAPPDATA%\BoitierTiktokRecorder; vidéos sous Vidéos\BoitierTiktokRecorder.'
}
if (Test-Path -LiteralPath $InstallDir) {
    if (Test-Path -LiteralPath (Join-Path $InstallDir 'BoitierTiktokLive.exe')) {
        throw "BTL est déjà installé dans '$InstallDir'. Utilisez maintenance\update.ps1 pour le mettre à jour."
    }
    $ExistingItems = @(Get-ChildItem -LiteralPath $InstallDir -Force)
    if ($ExistingItems.Count -gt 0) {
        throw "Le dossier cible existe déjà et n’est pas vide : '$InstallDir'. Choisissez un autre InstallDir."
    }
    Remove-Item -LiteralPath $InstallDir -Force
}

$Parent = Split-Path -Parent $InstallDir
New-Item -ItemType Directory -Force -Path $Parent | Out-Null
$Stage = "$InstallDir.install-$([guid]::NewGuid().ToString('N'))"
try {
    New-Item -ItemType Directory -Path $Stage | Out-Null
    Get-ChildItem -LiteralPath $SourceDir -Force | Copy-Item -Destination $Stage -Recurse -Force
    $Metadata = [ordered]@{
        schema = 1
        installDir = $InstallDir
        dataDir = $DataDir
        recordingsDir = $RecordingsDir
        installedAtUtc = [DateTime]::UtcNow.ToString('o')
    }
    $Metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Stage 'install-info.json') -Encoding utf8
    Move-Item -LiteralPath $Stage -Destination $InstallDir
} catch {
    Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
    throw
}

if (-not $ProgramsFolder) { $ProgramsFolder = [Environment]::GetFolderPath('Programs') }
$ProgramsFolder = Get-FullPath $ProgramsFolder
$ShortcutPath = Join-Path $ProgramsFolder 'Boitier Tiktok Live.lnk'
New-Item -ItemType Directory -Force -Path $ProgramsFolder | Out-Null
try {
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = Join-Path $InstallDir 'BoitierTiktokLive.exe'
    $Shortcut.Arguments = '--data-dir "' + $DataDir + '"'
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description = 'Boitier Tiktok Live'
    $Shortcut.Save()
} catch {
    Write-Warning "BTL est installé, mais le raccourci du menu Démarrer n’a pas pu être créé : $_"
}
if (-not (Test-Path -LiteralPath $ShortcutPath)) {
    Write-Warning "Le raccourci du menu Démarrer n’a pas été créé : $ShortcutPath"
}
Write-Host "BTL installé dans : $InstallDir"
Write-Host "Configuration et liste des créateurs : $DataDir"
Write-Host "Enregistrements vidéo : $RecordingsDir (conservés en dehors du dossier application)."
Write-Host "L’autostart est facultatif et se règle dans Paramètres; il utilise un raccourci Startup limité à cet utilisateur."
