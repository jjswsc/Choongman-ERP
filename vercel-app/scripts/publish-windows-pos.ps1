Param(
  # choongman: 충만 전용 파일명 + latest-choongman.json (Omni 경로 덮어쓰지 않음)
  # omnifoodtech: Omni 판매용 cm-pos-windows-latest-* + latest.json
  [Parameter(Mandatory = $false)]
  [ValidateSet("choongman", "omnifoodtech")]
  [string]$Brand = "choongman",

  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "",

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

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  if ($Brand -eq "omnifoodtech") {
    $BaseUrl = "https://app.omnifoodtech.com"
  } else {
    $BaseUrl = "https://choongman-erp.vercel.app"
  }
}
$BaseUrl = $BaseUrl.TrimEnd("/")

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

# 브랜드별 아티팩트·매니페스트 — 서로 덮어쓰지 않음
if ($Brand -eq "choongman") {
  $installerLatestName = "cm-pos-windows-choongman-latest-setup.exe"
  $installerVersionedName = "cm-pos-windows-choongman-$version-setup.exe"
  $portableLatestNameTemplate = "cm-pos-windows-choongman-latest-portable.exe"
  $portableVersionedNameTemplate = "cm-pos-windows-choongman-$version-portable.exe"
  $manifestFileName = "latest-choongman.json"
} else {
  $installerLatestName = "cm-pos-windows-latest-setup.exe"
  $installerVersionedName = "cm-pos-windows-$version-setup.exe"
  $portableLatestNameTemplate = "cm-pos-windows-latest-portable.exe"
  $portableVersionedNameTemplate = "cm-pos-windows-$version-portable.exe"
  $manifestFileName = "latest.json"
}

Copy-Item -Path $installer.FullName -Destination (Join-Path $publishDir $installerLatestName) -Force
Copy-Item -Path $installer.FullName -Destination (Join-Path $publishDir $installerVersionedName) -Force

$portableLatestName = ""
$portableVersionedName = ""
if ($portable) {
  $portableLatestName = $portableLatestNameTemplate
  $portableVersionedName = $portableVersionedNameTemplate
  Copy-Item -Path $portable.FullName -Destination (Join-Path $publishDir $portableLatestName) -Force
  Copy-Item -Path $portable.FullName -Destination (Join-Path $publishDir $portableVersionedName) -Force
}

$installerLatestPath = Join-Path $publishDir $installerLatestName
$manifest = @{
  version = $version
  publishedAtUtc = [DateTime]::UtcNow.ToString("o")
  notes = $ReleaseNotes
  brand = $Brand
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
# BOM 없이 저장 — Electron JSON.parse 호환
[System.IO.File]::WriteAllText(
  (Join-Path $publishDir $manifestFileName),
  $manifestJson,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Windows POS publish done."
Write-Host "- Brand: $Brand"
Write-Host "- BaseUrl: $BaseUrl"
Write-Host "- latest: /downloads/windows-pos/$installerLatestName"
Write-Host "- versioned: /downloads/windows-pos/$installerVersionedName"
Write-Host "- manifest: /downloads/windows-pos/$manifestFileName"
if ($Brand -eq "choongman") {
  Write-Host "- NOTE: Omni files (cm-pos-windows-latest-* / latest.json) were NOT modified."
} else {
  Write-Host "- NOTE: Choongman files (cm-pos-windows-choongman-* / latest-choongman.json) were NOT modified."
}
