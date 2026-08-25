Param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "https://choongman-erp.vercel.app",

  [Parameter(Mandatory = $false)]
  [string]$ReleaseNotes = "Stability improvements and latest features."
)

$ErrorActionPreference = "Stop"

function Get-Sha256($path) {
  return (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLower()
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsErpDir = Join-Path $projectRoot "windows-erp"
$distDir = Join-Path $windowsErpDir "dist"
$publishDir = Join-Path $projectRoot "public\downloads\windows-erp"

if (-not (Test-Path $distDir)) {
  throw "No build output. Run build-windows-erp.ps1 or: cd windows-erp; npm run build:win"
}

if (-not (Test-Path $publishDir)) {
  New-Item -Path $publishDir -ItemType Directory | Out-Null
}

$pkg = Get-Content -Path (Join-Path $windowsErpDir "package.json") -Raw | ConvertFrom-Json
$version = [string]$pkg.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not read version from windows-erp/package.json"
}

$exeCandidates = Get-ChildItem -Path $distDir -Filter "*.exe" -File | Where-Object {
  $_.Name -notlike "*blockmap*" -and $_.Name -notlike "*unpacked*"
}
if ($exeCandidates.Count -eq 0) {
  throw "No .exe artifacts found under dist/"
}

$installer = $exeCandidates | Where-Object { $_.Name -match "Setup|setup|Installer|install" } | Select-Object -First 1
if (-not $installer) {
  $installer = $exeCandidates | Sort-Object Length -Descending | Select-Object -First 1
}

$portable = $exeCandidates | Where-Object { $_.Name -match "portable|Portable" } | Select-Object -First 1

$installerLatestName = "cm-erp-windows-latest-setup.exe"
$installerVersionedName = "cm-erp-windows-$version-setup.exe"

Copy-Item -Path $installer.FullName -Destination (Join-Path $publishDir $installerLatestName) -Force
Copy-Item -Path $installer.FullName -Destination (Join-Path $publishDir $installerVersionedName) -Force

$portableLatestName = ""
$portableVersionedName = ""
if ($portable) {
  $portableLatestName = "cm-erp-windows-latest-portable.exe"
  $portableVersionedName = "cm-erp-windows-$version-portable.exe"
  Copy-Item -Path $portable.FullName -Destination (Join-Path $publishDir $portableLatestName) -Force
  Copy-Item -Path $portable.FullName -Destination (Join-Path $publishDir $portableVersionedName) -Force
}

$installerLatestPath = Join-Path $publishDir $installerLatestName
$manifest = @{
  version = $version
  publishedAtUtc = [DateTime]::UtcNow.ToString("o")
  notes = $ReleaseNotes
  installerUrl = "$BaseUrl/downloads/windows-erp/$installerLatestName"
  installerSha256 = Get-Sha256 $installerLatestPath
  files = @(
    @{
      name = $installerLatestName
      url = "$BaseUrl/downloads/windows-erp/$installerLatestName"
      sha256 = Get-Sha256 $installerLatestPath
    },
    @{
      name = $installerVersionedName
      url = "$BaseUrl/downloads/windows-erp/$installerVersionedName"
      sha256 = Get-Sha256 (Join-Path $publishDir $installerVersionedName)
    }
  )
}

if ($portableLatestName -ne "") {
  $manifest.files += @(
    @{
      name = $portableLatestName
      url = "$BaseUrl/downloads/windows-erp/$portableLatestName"
      sha256 = Get-Sha256 (Join-Path $publishDir $portableLatestName)
    },
    @{
      name = $portableVersionedName
      url = "$BaseUrl/downloads/windows-erp/$portableVersionedName"
      sha256 = Get-Sha256 (Join-Path $publishDir $portableVersionedName)
    }
  )
}

$manifestJson = $manifest | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $publishDir "latest.json") -Value $manifestJson -Encoding UTF8

Write-Host "Windows ERP publish done."
Write-Host "- latest: /downloads/windows-erp/$installerLatestName"
Write-Host "- versioned: /downloads/windows-erp/$installerVersionedName"
Write-Host "- manifest: /downloads/windows-erp/latest.json"
Write-Host "- BANDWIDTH: .exe is gitignored and .vercelignored. Do not Vercel-deploy binaries."
Write-Host "  Point -BaseUrl / NEXT_PUBLIC_WINDOWS_ERP_SETUP_URL at GitHub Releases or object storage."
