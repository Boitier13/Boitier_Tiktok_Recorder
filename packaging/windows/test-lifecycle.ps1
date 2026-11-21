[CmdletBinding()]
param([string]$PayloadDir = '')
$ErrorActionPreference = 'Stop'
if (-not $PayloadDir) { $PayloadDir = Join-Path $PSScriptRoot '..\..\dist\BoitierTiktokLive' }
$PayloadDir = (Resolve-Path $PayloadDir).Path
$Suite = Join-Path $env:TEMP ('BTL cycle de vie éà - ' + [guid]::NewGuid().ToString('N'))
$InstallDir = Join-Path $Suite 'application install é'
$DataDir = Join-Path $Suite 'configuration utilisateur à'
$RecordingsDir = Join-Path $Suite 'Vidéos utilisateur à\BoitierTiktokRecorder'
$NewPayload = Join-Path $Suite 'nouvelle version é'
$StartupFolder = Join-Path (Join-Path $Suite 'raccourcis') 'démarrage'
$ProgramsFolder = Join-Path (Join-Path $Suite 'raccourcis') 'menu démarrer'
$StartupShortcut = Join-Path $StartupFolder 'Boitier Tiktok Live.lnk'
$StartMenuShortcut = Join-Path $ProgramsFolder 'Boitier Tiktok Live.lnk'
$Exe = Join-Path $InstallDir 'BoitierTiktokLive.exe'

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Get-LinkTarget([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    return [IO.Path]::GetFullPath($shortcut.TargetPath)
}

New-Item -ItemType Directory -Force -Path $Suite | Out-Null
try {
    # Each mandatory bundled command must make --check-tools fail when absent.
    $PayloadExe = Join-Path $PayloadDir 'BoitierTiktokLive.exe'
    $OriginalPath = $env:PATH
    try {
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        foreach ($ToolName in @('yt-dlp.exe', 'streamlink.exe', 'ffmpeg.exe', 'ffprobe.exe')) {
            $ToolPath = Join-Path (Join-Path $PayloadDir 'tools') $ToolName
            $HeldToolPath = "$ToolPath.lifecycle-test"
            Move-Item -LiteralPath $ToolPath -Destination $HeldToolPath
            try {
                & $PayloadExe --check-tools
                Assert ($LASTEXITCODE -ne 0) "--check-tools accepted a missing $ToolName."
            } finally {
                Move-Item -LiteralPath $HeldToolPath -Destination $ToolPath
            }
        }
    } finally {
        $env:PATH = $OriginalPath
    }
    $ToolProbes = @(
        @{ Name = 'yt-dlp.exe'; Args = @('--version') },
        @{ Name = 'streamlink.exe'; Args = @('--version') },
        @{ Name = 'ffmpeg.exe'; Args = @('-version') },
        @{ Name = 'ffprobe.exe'; Args = @('-version') }
    )
    $ProbeFailures = @()
    foreach ($Probe in $ToolProbes) {
        $ToolPath = Join-Path (Join-Path $PayloadDir 'tools') $Probe.Name
        try {
            $ProbeArgs = @($Probe.Args)
            $ProbeOutput = (& $ToolPath @ProbeArgs 2>&1 | Out-String).Trim()
            $ProbeExitCode = $LASTEXITCODE
            if ($ProbeExitCode -ne 0) { $ProbeFailures += "$($Probe.Name): exit $ProbeExitCode; $ProbeOutput" }
        } catch {
            $ProbeFailures += "$($Probe.Name): $($_.Exception.Message)"
        }
    }
    Assert ($ProbeFailures.Count -eq 0) ("Tool probes after restore failed: " + ($ProbeFailures -join ' | '))

    & (Join-Path $PayloadDir 'maintenance\install.ps1') -SourceDir $PayloadDir -InstallDir $InstallDir -DataDir $DataDir -RecordingsDir $RecordingsDir -ProgramsFolder $ProgramsFolder
    Assert (Test-Path -LiteralPath $Exe) 'Install did not copy the BTL executable.'
    Assert (Test-Path -LiteralPath $StartMenuShortcut) 'Install did not create the per-user Start menu shortcut.'
    $InstallMetadata = Get-Content -Raw (Join-Path $InstallDir 'install-info.json') | ConvertFrom-Json
    Assert ($InstallMetadata.dataDir -eq [IO.Path]::GetFullPath($DataDir)) 'Install metadata did not keep the config directory.'
    Assert ($InstallMetadata.recordingsDir -eq [IO.Path]::GetFullPath($RecordingsDir)) 'Install metadata did not keep the recordings directory.'
    Assert ((Get-LinkTarget $StartMenuShortcut) -eq [IO.Path]::GetFullPath($Exe)) 'Start menu shortcut targets the wrong installation.'

    New-Item -ItemType Directory -Force -Path $DataDir, $RecordingsDir | Out-Null
    Set-Content -LiteralPath (Join-Path $DataDir 'config.ini') -Value "[BTL]`nkeep = true" -Encoding utf8
    Set-Content -LiteralPath (Join-Path $RecordingsDir 'keep.mp4') -Value 'sentinel-media' -Encoding utf8
    $BeforeConfig = (Get-FileHash -Algorithm SHA256 (Join-Path $DataDir 'config.ini')).Hash
    $BeforeMedia = (Get-FileHash -Algorithm SHA256 (Join-Path $RecordingsDir 'keep.mp4')).Hash

    # The app's own Startup manager uses this stable user-scoped .lnk name.
    New-Item -ItemType Directory -Force -Path $StartupFolder | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($StartupShortcut)
    $link.TargetPath = $Exe
    $link.Arguments = '--data-dir "' + $DataDir + '" --no-desktop'
    $link.WorkingDirectory = $InstallDir
    $link.Save()

    New-Item -ItemType Directory -Path $NewPayload | Out-Null
    Get-ChildItem -LiteralPath $PayloadDir -Force | Copy-Item -Destination $NewPayload -Recurse -Force
    & (Join-Path $NewPayload 'maintenance\update.ps1') -PayloadDir $NewPayload -InstallDir $InstallDir -DataDir $DataDir -RecordingsDir $RecordingsDir
    Assert (Test-Path -LiteralPath $Exe) 'Update did not leave the new application installed.'
    Assert ((Get-FileHash -Algorithm SHA256 (Join-Path $DataDir 'config.ini')).Hash -eq $BeforeConfig) 'Update changed config.ini.'
    Assert ((Get-FileHash -Algorithm SHA256 (Join-Path $RecordingsDir 'keep.mp4')).Hash -eq $BeforeMedia) 'Update changed a recording.'
    Assert ((Get-LinkTarget $StartupShortcut) -eq [IO.Path]::GetFullPath($Exe)) 'Update broke/changed the Startup shortcut.'
    Assert ((Get-LinkTarget $StartMenuShortcut) -eq [IO.Path]::GetFullPath($Exe)) 'Update broke/changed the Start menu shortcut.'

    & (Join-Path $InstallDir 'maintenance\uninstall.ps1') -InstallDir $InstallDir `
        -StartupFolder $StartupFolder -ProgramsFolder $ProgramsFolder
    $Deadline = [DateTime]::UtcNow.AddSeconds(45)
    while ([DateTime]::UtcNow -lt $Deadline -and
           ((Test-Path -LiteralPath $InstallDir) -or (Test-Path -LiteralPath $StartupShortcut) -or (Test-Path -LiteralPath $StartMenuShortcut))) {
        Start-Sleep -Milliseconds 250
    }
    Assert (-not (Test-Path -LiteralPath $InstallDir)) 'Uninstall did not remove the application folder.'
    Assert (-not (Test-Path -LiteralPath $StartupShortcut)) 'Uninstall did not remove the BTL Startup shortcut.'
    Assert (-not (Test-Path -LiteralPath $StartMenuShortcut)) 'Uninstall did not remove the BTL Start menu shortcut.'
    Assert ((Get-FileHash -Algorithm SHA256 (Join-Path $DataDir 'config.ini')).Hash -eq $BeforeConfig) 'Uninstall changed config.ini.'
    Assert ((Get-FileHash -Algorithm SHA256 (Join-Path $RecordingsDir 'keep.mp4')).Hash -eq $BeforeMedia) 'Uninstall changed a recording.'
    Write-Host 'Lifecycle smoke PASS: install and update preserved config/recording hashes and shortcuts; uninstall removed app/shortcuts while keeping both user data folders.'
} catch {
    $FailureMessage = ($_.Exception.Message -replace '[\r\n]+', ' ')
    Write-Output "::error title=BTL lifecycle failure::$FailureMessage"
    throw
} finally {
    # Clean the isolated test data after asserting the uninstall default. Never touch the user's real BTL data.
    if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue }
    if ((Get-LinkTarget $StartupShortcut) -eq [IO.Path]::GetFullPath($Exe)) { Remove-Item -LiteralPath $StartupShortcut -Force -ErrorAction SilentlyContinue }
    if ((Get-LinkTarget $StartMenuShortcut) -eq [IO.Path]::GetFullPath($Exe)) { Remove-Item -LiteralPath $StartMenuShortcut -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $Suite) { Remove-Item -LiteralPath $Suite -Recurse -Force -ErrorAction SilentlyContinue }
}
