[CmdletBinding()]
param(
    [string]$PayloadDir = '',
    [string]$InstallDir = '',
    [string]$DataDir = ''
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

if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA est introuvable; impossible de résoudre les données utilisateur.' }
if (-not $PayloadDir) { $PayloadDir = Split-Path -Parent $PSScriptRoot }
$PayloadDir = Get-FullPath $PayloadDir
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\BoitierTiktokRecorder' }
$InstallDir = Get-FullPath $InstallDir
$PayloadExe = Join-Path $PayloadDir 'BoitierTiktokLive.exe'
if (-not (Test-Path -LiteralPath $PayloadExe -PathType Leaf) -or -not (Test-Path (Join-Path $PayloadDir 'tools'))) {
    throw "Nouvelle archive BTL incomplète : '$PayloadDir' doit contenir BoitierTiktokLive.exe et tools/."
}
& $PayloadExe --check-tools
if ($LASTEXITCODE -ne 0) { throw 'Les outils du nouveau ZIP ne passent pas --check-tools; installation existante conservée.' }
if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'BoitierTiktokLive.exe'))) {
    throw "Installation BTL introuvable dans '$InstallDir'. Utilisez maintenance\install.ps1."
}
if ($PayloadDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase)) {
    throw "L’update doit être lancé depuis le dossier d’une nouvelle archive extraite, pas depuis l’installation à remplacer."
}

$MetadataPath = Join-Path $InstallDir 'install-info.json'
$RecordedDataDir = ''
if (Test-Path -LiteralPath $MetadataPath) {
    try { $RecordedDataDir = (Get-Content -Raw $MetadataPath | ConvertFrom-Json).dataDir } catch { }
}
if ($RecordedDataDir) {
    if ($DataDir -and -not ( (Get-FullPath $DataDir).Equals((Get-FullPath $RecordedDataDir), [StringComparison]::OrdinalIgnoreCase) )) {
        throw "Le chemin de données installé est '$RecordedDataDir'. Une update ne le change jamais; retirez -DataDir pour conserver ce chemin."
    }
    $DataDir = $RecordedDataDir
} elseif (-not $DataDir) {
    $DataDir = Join-Path $env:LOCALAPPDATA 'BoitierTiktokRecorder'
}
$DataDir = Get-FullPath $DataDir
Assert-NotDriveRoot $InstallDir 'InstallDir'
Assert-NotDriveRoot $DataDir 'DataDir'
if ((Test-IsWithin $DataDir $InstallDir) -or $DataDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Le dossier de données '$DataDir' est dans le dossier remplacé. Déplacez ou sauvegardez d’abord config.ini et recordings hors de l’installation."
}
# Fail safe if an earlier/manual install put user data beside the executable.
if ((Test-Path -LiteralPath (Join-Path $InstallDir 'config.ini')) -or
    (Test-Path -LiteralPath (Join-Path $InstallDir 'recordings'))) {
    throw "Des données utilisateur semblent se trouver dans le dossier application. L’update refuse de les écraser; sauvegardez-les puis déplacez-les vers le dossier de données."
}
$InstalledExe = Get-FullPath (Join-Path $InstallDir 'BoitierTiktokLive.exe')
$RunningBtl = @(Get-Process -Name 'BoitierTiktokLive' -ErrorAction SilentlyContinue | Where-Object {
    try {
        $ProcessPath = $_.Path
        if (-not $ProcessPath) { return $true }
        [IO.Path]::GetFullPath($ProcessPath).Equals($InstalledExe, [StringComparison]::OrdinalIgnoreCase)
    } catch { return $true }
})
if ($RunningBtl.Count -gt 0) {
    throw 'Fermez Boitier Tiktok Live depuis le dossier installé et son icône de barre système avant de lancer la mise à jour.'
}

$Parent = Split-Path -Parent $InstallDir
$Stage = "$InstallDir.update-$([guid]::NewGuid().ToString('N'))"
$Backup = "$InstallDir.previous-$([guid]::NewGuid().ToString('N'))"
try {
    New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    New-Item -ItemType Directory -Path $Stage | Out-Null
    Get-ChildItem -LiteralPath $PayloadDir -Force | Copy-Item -Destination $Stage -Recurse -Force

    # Preserve the installer metadata (including the selected data directory); the actual
    # config and recordings remain outside InstallDir and are never copied or removed here.
    if (Test-Path -LiteralPath $MetadataPath) {
        Copy-Item -LiteralPath $MetadataPath -Destination (Join-Path $Stage 'install-info.json') -Force
    } else {
        [ordered]@{ schema = 1; installDir = $InstallDir; dataDir = $DataDir; installedAtUtc = [DateTime]::UtcNow.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Stage 'install-info.json') -Encoding utf8
    }
    $Metadata = Get-Content -Raw (Join-Path $Stage 'install-info.json') | ConvertFrom-Json
    $Metadata.installDir = $InstallDir
    $Metadata.dataDir = $DataDir
    $Metadata | Add-Member -NotePropertyName updatedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
    $Metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Stage 'install-info.json') -Encoding utf8

    Move-Item -LiteralPath $InstallDir -Destination $Backup
    try {
        Move-Item -LiteralPath $Stage -Destination $InstallDir
    } catch {
        Move-Item -LiteralPath $Backup -Destination $InstallDir
        throw
    }
    try { Remove-Item -LiteralPath $Backup -Recurse -Force } catch {
        Write-Warning "BTL a été mis à jour, mais le dossier de sauvegarde applicatif reste ici : $Backup"
    }
} catch {
    Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
    throw
}
Write-Host "BTL mis à jour dans : $InstallDir"
Write-Host "Données conservées sans modification dans : $DataDir"
Write-Host "Le raccourci Startup par utilisateur et le raccourci du menu Démarrer restent en place car le chemin d’installation ne change pas."
