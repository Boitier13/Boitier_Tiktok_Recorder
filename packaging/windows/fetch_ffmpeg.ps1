[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageRoot
)
$ErrorActionPreference = 'Stop'
$LockPath = Join-Path $PSScriptRoot 'tools-win-x64.lock.json'
$Lock = Get-Content -Raw $LockPath | ConvertFrom-Json
$Tool = $Lock.tools | Where-Object { $_.name -eq 'FFmpeg' } | Select-Object -First 1
if (-not $Tool) { throw 'No FFmpeg pin found in tools-win-x64.lock.json.' }

$Work = Join-Path $env:TEMP ('btl-ffmpeg-' + [guid]::NewGuid().ToString('N'))
$Archive = Join-Path $Work $Tool.asset
$Extract = Join-Path $Work 'extracted'
$Destination = Join-Path $PackageRoot 'tools'
try {
    New-Item -ItemType Directory -Force -Path $Work, $Extract, $Destination | Out-Null
    Invoke-WebRequest -Uri $Tool.url -OutFile $Archive
    $ActualHash = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
    if ($ActualHash -ne $Tool.sha256) {
        throw "FFmpeg archive SHA-256 mismatch: expected $($Tool.sha256), got $ActualHash."
    }
    if ((Get-Item $Archive).Length -ne [long]$Tool.size_bytes) {
        throw 'FFmpeg archive size does not match the recorded release metadata.'
    }
    Expand-Archive -LiteralPath $Archive -DestinationPath $Extract

    foreach ($Name in @('ffmpeg.exe', 'ffprobe.exe')) {
        $Matches = @(Get-ChildItem -Path $Extract -Filter $Name -File -Recurse)
        if ($Matches.Count -ne 1) { throw "Expected exactly one $Name in the verified archive; found $($Matches.Count)." }
        Copy-Item -LiteralPath $Matches[0].FullName -Destination (Join-Path $Destination $Name) -Force
        $VersionOutput = (& (Join-Path $Destination $Name) -version 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0 -or $VersionOutput -notmatch 'n9\.0') {
            throw "$Name did not run or did not report the pinned n9.0 release."
        }
    }

    $LicenseFiles = @(Get-ChildItem -Path $Extract -File -Recurse | Where-Object {
        $_.Name -match '^(LICENSE|COPYING|NOTICE)(\.|$|-)'
    })
    if ($LicenseFiles.Count -eq 0) { throw 'No FFmpeg archive license/notice files found; refusing to stage binaries.' }
    $LicenseDir = Join-Path $Destination 'ffmpeg-licenses'
    New-Item -ItemType Directory -Force -Path $LicenseDir | Out-Null
    foreach ($File in $LicenseFiles) {
        $Relative = $File.FullName.Substring($Extract.Length).TrimStart('\\', '/')
        $Target = Join-Path $LicenseDir $Relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
        Copy-Item -LiteralPath $File.FullName -Destination $Target -Force
    }
    Copy-Item -LiteralPath $LockPath -Destination (Join-Path $LicenseDir 'tools-win-x64.lock.json') -Force

    Write-Host "Verified FFmpeg n9.0 and ffprobe n9.0 staged in $Destination."
    Write-Warning 'This verifies bytes and executable versions only; it does not clear redistribution licensing.'
} finally {
    Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
}
