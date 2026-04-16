Param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "https://choongman-erp.vercel.app",

  [Parameter(Mandatory = $false)]
  [string]$ReleaseNotes = "Stability improvements and latest features.",

  # 비우면 windows-pos\dist, 없으면 가장 최근 windows-pos\dist-eb-*
  [Parameter(Mandatory = $false)]
  [string]$DistDir = ""
)

$ErrorActionPreference = "Stop"

function Get-Sha256($path) {
  return (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLower()
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsPosDir = Join-Path $projectRoot "windows-pos"
$publishDir = Join-Path $projectRoot "public\downloads\windows-pos"

function Test-DistHasPublishableExe {
  Param([string]$Dir)
  if (-not (Test-Path -LiteralPath $Dir)) { return $false }
  $exes = Get-ChildItem -Path $Dir -Filter "*.exe" -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notlike "*blockmap*" -and $_.Name -notlike "*unpacked*"
  }
  return $null -ne $exes -and $exes.Count -gt 0
}

if (-not [string]::IsNullOrWhiteSpace($DistDir)) {
  if ([System.IO.Path]::IsPathRooted($DistDir)) {
    $distDir = $DistDir
  } else {
    $distDir = Join-Path $projectRoot $DistDir
  }
} else {
  # dist 가 잠겨 비어 있으면 electron-builder 가 dist-eb-* 에만 exe 를 둠 → 그쪽을 자동 선택
  $distDir = Join-Path $windowsPosDir "dist"
  if (-not (Test-DistHasPublishableExe $distDir)) {
    $fallback = Get-ChildItem -Path $windowsPosDir -Directory -Filter "dist-eb-*" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($fallback -and (Test-DistHasPublishableExe $fallback.FullName)) {
      $distDir = $fallback.FullName
      Write-Host "Using build output folder: $distDir"
    }
  }
}

if (-not (Test-Path -LiteralPath $distDir)) {
  throw "No build output under windows-pos (dist or dist-eb-*). Run scripts/build-windows-pos.ps1 or: cd windows-pos; npm run build:win"
}

if (-not (Test-Path $publishDir)) {
  New-Item -Path $publishDir -ItemType Directory | Out-Null
}

$pkg = Get-Content -Path (Join-Path $windowsPosDir "package.json") -Raw | ConvertFrom-Json
$version = [string]$pkg.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not read version from windows-pos/package.json"
}

$exeCandidates = Get-ChildItem -Path $distDir -Filter "*.exe" -File | Where-Object {
  $_.Name -notlike "*blockmap*" -and $_.Name -notlike "*unpacked*"
}
if ($exeCandidates.Count -eq 0) {
  throw "No .exe artifacts found under: $distDir"
}

$installer = $exeCandidates | Where-Object { $_.Name -match "Setup|setup|Installer|install" } | Select-Object -First 1
if (-not $installer) {
  $installer = $exeCandidates | Sort-Object Length -Descending | Select-Object -First 1
}

$portable = $exeCandidates | Where-Object { $_.Name -match "portable|Portable" } | Select-Object -First 1

$installerLatestName = "cm-pos-windows-latest-setup.exe"
$installerVersionedName = "cm-pos-windows-$version-setup.exe"

Copy-Item -Path $installer.FullName -Destination (Join-Path $publishDir $installerLatestName) -Force
Copy-Item -Path $installer.FullName -Destination (Join-Path $publishDir $installerVersionedName) -Force

$portableLatestName = ""
$portableVersionedName = ""
if ($portable) {
  $portableLatestName = "cm-pos-windows-latest-portable.exe"
  $portableVersionedName = "cm-pos-windows-$version-portable.exe"
  Copy-Item -Path $portable.FullName -Destination (Join-Path $publishDir $portableLatestName) -Force
  Copy-Item -Path $portable.FullName -Destination (Join-Path $publishDir $portableVersionedName) -Force
}

$installerLatestPath = Join-Path $publishDir $installerLatestName
$manifest = @{
  version = $version
  publishedAtUtc = [DateTime]::UtcNow.ToString("o")
  notes = $ReleaseNotes
  installerUrl = "$BaseUrl/downloads/windows-pos/$installerLatestName"
  installerSha256 = Get-Sha256 $installerLatestPath
  files = @(
    @{
      name = $installerLatestName
      url = "$BaseUrl/downloads/windows-pos/$installerLatestName"
      sha256 = Get-Sha256 $installerLatestPath
    },
    @{
      name = $installerVersionedName
      url = "$BaseUrl/downloads/windows-pos/$installerVersionedName"
      sha256 = Get-Sha256 (Join-Path $publishDir $installerVersionedName)
    }
  )
}

if ($portableLatestName -ne "") {
  $manifest.files += @(
    @{
      name = $portableLatestName
      url = "$BaseUrl/downloads/windows-pos/$portableLatestName"
      sha256 = Get-Sha256 (Join-Path $publishDir $portableLatestName)
    },
    @{
      name = $portableVersionedName
      url = "$BaseUrl/downloads/windows-pos/$portableVersionedName"
      sha256 = Get-Sha256 (Join-Path $publishDir $portableVersionedName)
    }
  )
}

$manifestJson = $manifest | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $publishDir "latest.json") -Value $manifestJson -Encoding UTF8

Write-Host "Windows POS publish done."
Write-Host "- latest: /downloads/windows-pos/$installerLatestName"
Write-Host "- versioned: /downloads/windows-pos/$installerVersionedName"
Write-Host "- manifest: /downloads/windows-pos/latest.json"
