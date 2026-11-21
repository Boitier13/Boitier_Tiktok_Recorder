[CmdletBinding()]
param(
    [string]$InstallDir = '',
    [string]$DataDir = '',
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
if (-not $DataDir -and (Test-Path -LiteralPath $MetadataPath)) {
    try { $DataDir = (Get-Content -Raw $MetadataPath | ConvertFrom-Json).dataDir } catch { }
}
if (-not $DataDir) { $DataDir = Join-Path $env:LOCALAPPDATA 'BoitierTiktokRecorder' }
$DataDir = Get-FullPath $DataDir
Assert-NotDriveRoot $InstallDir 'InstallDir'
Assert-NotDriveRoot $DataDir 'DataDir'
if (
    (Test-IsWithin $DataDir $InstallDir) -or
    (Test-IsWithin $InstallDir $DataDir) -or
    $DataDir.Equals($InstallDir, [StringComparison]::OrdinalIgnoreCase)
) {
    throw 'Le dossier de données ne peut pas être supprimé avec le dossier application : les deux chemins doivent être séparés.'
}
if (Get-Process -Name 'BoitierTiktokLive' -ErrorAction SilentlyContinue) {
    throw 'Fermez Boitier Tiktok Live et son icône de barre système avant de le désinstaller.'
}
if ($PurgeUserData) {
    Write-Warning "La suppression est définitive et portera sur toute la configuration et les enregistrements : $DataDir"
    $Answer = Read-Host 'Pour confirmer, saisissez exactement le chemin ci-dessus'
    if ($Answer -cne $DataDir) { throw 'Confirmation incorrecte; les données utilisateur n’ont pas été supprimées.' }
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
if (__PURGE__) { Remove-Item -LiteralPath __DATA__ -Recurse -Force -ErrorAction SilentlyContinue }
'@
$Cleanup = $Cleanup.Replace('__EXE__', (Quote-PS $Exe))
$Cleanup = $Cleanup.Replace('__STARTUP__', (Quote-PS $StartupShortcut))
$Cleanup = $Cleanup.Replace('__STARTMENU__', (Quote-PS $StartMenuShortcut))
$Cleanup = $Cleanup.Replace('__INSTALL__', (Quote-PS $InstallDir))
$Cleanup = $Cleanup.Replace('__DATA__', (Quote-PS $DataDir))
$PurgeLiteral = if ($PurgeUserData) { '$true' } else { '$false' }
$Cleanup = $Cleanup.Replace('__PURGE__', $PurgeLiteral)
$Encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Cleanup))
Set-Location -LiteralPath $env:TEMP
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $env:TEMP -WindowStyle Hidden `
    -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $Encoded)
if ($PurgeUserData) {
    Write-Host 'Désinstallation lancée : raccourcis et application seront retirés, puis les données confirmées seront supprimées.'
} else {
    Write-Host "Désinstallation lancée : raccourcis et application seront retirés. Données conservées dans '$DataDir'."
}
