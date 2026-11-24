$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Frontend = Join-Path $Root 'frontend'
$Spec = Join-Path $PSScriptRoot 'BoitierTiktokLive.spec'
$Package = Join-Path $Root 'dist\BoitierTiktokLive'
$Zip = Join-Path $Root 'dist\BoitierTiktokLive-win-x64-portable.zip'

$pythonInfo = & python -c "import struct,sys; print('%s.%s %s-bit' % (sys.version_info.major, sys.version_info.minor, struct.calcsize('P')*8))"
if ($LASTEXITCODE -ne 0 -or $pythonInfo -notmatch '^3\.12 64-bit$') {
    throw "Use 64-bit Python 3.12 for the Windows build; found '$pythonInfo'."
}

Push-Location $Frontend
try {
    npm ci --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
} finally {
    Pop-Location
}

& python -m pip install --require-hashes `
    -r (Join-Path $PSScriptRoot 'requirements-win-x64-py312.lock')
if ($LASTEXITCODE -ne 0) { throw 'Pinned BTL Python dependencies failed to install.' }

Push-Location $Root
try {
    & python -m PyInstaller --noconfirm --clean $Spec
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
    if (-not (Test-Path (Join-Path $Package 'BoitierTiktokLive.exe'))) {
        throw 'PyInstaller did not produce the expected onedir executable.'
    }

    # This exercises the frozen executable's actual multiprocessing spawn protocol.
    & (Join-Path $Package 'BoitierTiktokLive.exe') --package-smoke
    if ($LASTEXITCODE -ne 0) { throw 'Frozen multiprocessing spawn smoke failed.' }

    # Build console-mode onedir launchers from the exact hash-locked Python packages. Onefile
    # launchers expand to temporary _MEI folders on every start and can leave them behind when
    # workers are terminated; onedir launchers keep their runtime files beside each executable.
    $ToolBuild = Join-Path $Root 'build\btl-tool-launchers'
    $ToolDist = Join-Path $ToolBuild 'dist'
    $ToolDir = Join-Path $Package 'tools'
    New-Item -ItemType Directory -Force -Path $ToolBuild, $ToolDist, $ToolDir | Out-Null
    $ToolLock = Get-Content -Raw (Join-Path $PSScriptRoot 'requirements-win-x64-py312.lock')
    if ($ToolLock -notmatch '(?m)^yt-dlp==([^\s\\]+)') { throw 'yt-dlp version missing from the runtime lock.' }
    $YtDlpVersion = $Matches[1]
    if ($ToolLock -notmatch '(?m)^streamlink==([^\s\\]+)') { throw 'Streamlink version missing from the runtime lock.' }
    $StreamlinkVersion = $Matches[1]

    & python -m PyInstaller --noconfirm --clean --onedir --console --name 'yt-dlp' `
        --distpath $ToolDist --workpath (Join-Path $ToolBuild 'work-ytdlp') --specpath $ToolBuild `
        --collect-all yt_dlp --collect-all yt_dlp_ejs --collect-all curl_cffi `
        (Join-Path $PSScriptRoot 'tool_yt_dlp.py')
    if ($LASTEXITCODE -ne 0) { throw 'yt-dlp onedir launcher build failed.' }
    & python -m PyInstaller --noconfirm --clean --onedir --console --name 'streamlink' `
        --distpath $ToolDist --workpath (Join-Path $ToolBuild 'work-streamlink') --specpath $ToolBuild `
        --collect-all streamlink --collect-all streamlink_cli `
        (Join-Path $PSScriptRoot 'tool_streamlink.py')
    if ($LASTEXITCODE -ne 0) { throw 'Streamlink onedir launcher build failed.' }

    foreach ($ToolName in @('yt-dlp', 'streamlink')) {
        $ToolSource = Join-Path $ToolDist $ToolName
        $ToolTarget = Join-Path $ToolDir $ToolName
        if (-not (Test-Path (Join-Path $ToolSource ($ToolName + '.exe')))) {
            throw "PyInstaller did not produce the expected onedir launcher: $ToolSource"
        }
        if (Test-Path $ToolTarget) { Remove-Item -LiteralPath $ToolTarget -Recurse -Force }
        Copy-Item -LiteralPath $ToolSource -Destination $ToolTarget -Recurse -Force
    }

    & (Join-Path $PSScriptRoot 'fetch_ffmpeg.ps1') -PackageRoot $Package
    if ($LASTEXITCODE -ne 0) { throw 'Pinned FFmpeg/ffprobe acquisition failed.' }

    # Assert that the complete staged toolchain starts and matches the Python lock.
    & (Join-Path $Package 'BoitierTiktokLive.exe') --check-tools
    if ($LASTEXITCODE -ne 0) { throw 'Packaged capture-tool preflight failed.' }
    $YtDlpActual = (& (Join-Path (Join-Path $ToolDir 'yt-dlp') 'yt-dlp.exe') --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $YtDlpActual -ne $YtDlpVersion) {
        throw "Bundled yt-dlp mismatch: expected $YtDlpVersion, got '$YtDlpActual'."
    }
    $StreamlinkActual = (& (Join-Path (Join-Path $ToolDir 'streamlink') 'streamlink.exe') --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $StreamlinkActual -notmatch [regex]::Escape($StreamlinkVersion)) {
        throw "Bundled Streamlink mismatch: expected $StreamlinkVersion, got '$StreamlinkActual'."
    }
} finally {
    Pop-Location
}

$readme = Join-Path $Package 'README.txt'
@'
Boitier Tiktok Live — Windows x64 portable runtime package

If PowerShell blocks downloaded scripts, run Unblock-File maintenance\*.ps1 for these scripts only.
Run maintenance\install.ps1 from this extracted folder to install BTL per-user under
%LOCALAPPDATA%\Programs\BoitierTiktokRecorder. Config and creator list stay under
%LOCALAPPDATA%\BoitierTiktokRecorder; recordings go to
%USERPROFILE%\Videos\BoitierTiktokRecorder, outside the app directory.

For updates, extract the new release separately, close BTL, then run its
maintenance\update.ps1. To uninstall and keep user data, run the installed
maintenance\uninstall.ps1. Add -PurgeUserData only to erase data after explicit path confirmation.

The tools folder contains yt-dlp/yt-dlp.exe, streamlink/streamlink.exe, ffmpeg.exe and ffprobe.exe.
Use BoitierTiktokLive.exe --check-tools to verify them. The app requires the Microsoft
Edge WebView2 Evergreen Runtime; if it is missing, BTL explains how to install it and
opens the UI in your browser as a fallback. See THIRD_PARTY_NOTICES.md for the pending
redistribution audit and tools\ffmpeg-licenses\ for FFmpeg/ffprobe notices.
'@ | Set-Content -Path $readme -Encoding utf8
Copy-Item (Join-Path $PSScriptRoot 'THIRD_PARTY_NOTICES.md') (Join-Path $Package 'THIRD_PARTY_NOTICES.md') -Force
$Maintenance = Join-Path $Package 'maintenance'
New-Item -ItemType Directory -Force -Path $Maintenance | Out-Null
foreach ($ScriptName in @('install.ps1', 'update.ps1', 'uninstall.ps1')) {
    Copy-Item (Join-Path $PSScriptRoot $ScriptName) (Join-Path $Maintenance $ScriptName) -Force
}

if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path $Package -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Portable package created: $Zip"
