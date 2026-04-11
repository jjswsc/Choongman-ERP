param(
  [string]$KeyPath = "",
  [string]$RemoteHost = "ubuntu@3.1.70.209",
  [string]$LocalFile = "C:\CM_ERP\landing\omnifoodtech\index.html",
  [string]$RemoteTemp = "/tmp/index.html",
  [string]$RemoteTarget = "/var/www/html/index.html",
  [string]$RemoteBackup = "/var/www/html/index.backup.html"
)

$ErrorActionPreference = "Stop"

function Resolve-KeyPath {
  param([string]$InputPath)

  if ($InputPath) {
    $normalized = $InputPath.Trim().Trim('"')
    if (Test-Path -LiteralPath $normalized) {
      return (Resolve-Path -LiteralPath $normalized).Path
    }
  }

  $candidateFiles = @(
    "$env:USERPROFILE\.ssh\LightsailDefaultKey-ap-southeast-1.pem",
    "$env:USERPROFILE\Downloads\LightsailDefaultKey-ap-southeast-1.pem",
    "$PSScriptRoot\LightsailDefaultKey-ap-southeast-1.pem",
    "$PSScriptRoot\lightsail.pem"
  )

  foreach ($candidate in $candidateFiles) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $searchRoots = @("$env:USERPROFILE\.ssh", "$env:USERPROFILE\Downloads")
  foreach ($root in $searchRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $match = Get-ChildItem -Path $root -Filter "*lightsail*.pem" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.FullName }
  }

  return $null
}

$resolvedKeyPath = Resolve-KeyPath -InputPath $KeyPath
if (-not $resolvedKeyPath) {
  Write-Host "PEM key was not auto-detected." -ForegroundColor Yellow
  Write-Host "Enter PEM path (example: C:\Users\you\Downloads\LightsailDefaultKey-ap-southeast-1.pem)" -ForegroundColor Yellow
  $manualPath = Read-Host "PEM path"
  $manualPathNorm = $manualPath.Trim().Trim('"')
  if ($manualPathNorm -and (Test-Path -LiteralPath $manualPathNorm)) {
    $resolvedKeyPath = (Resolve-Path -LiteralPath $manualPathNorm).Path
  } else {
    throw "PEM key path is invalid. Run with -KeyPath 'C:\path\your-key.pem' or enter a valid path when prompted."
  }
}

if (-not (Test-Path -LiteralPath $LocalFile)) {
  throw "Local landing file not found: $LocalFile"
}

Write-Host "Using key: $resolvedKeyPath" -ForegroundColor DarkGray
Write-Host "[1/3] Uploading landing file..." -ForegroundColor Cyan
scp -i "$resolvedKeyPath" "$LocalFile" "$RemoteHost`:$RemoteTemp"
if ($LASTEXITCODE -ne 0) { throw "SCP upload failed." }

Write-Host "[2/3] Applying file on server..." -ForegroundColor Cyan
$remoteCmd = "set -e; if [ -f '$RemoteTarget' ]; then sudo cp '$RemoteTarget' '$RemoteBackup'; fi; sudo install -m 644 '$RemoteTemp' '$RemoteTarget'; sudo nginx -t; sudo systemctl reload nginx"
ssh -i "$resolvedKeyPath" $RemoteHost $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "SSH apply command failed." }

Write-Host "[3/3] Done. Landing deployed successfully." -ForegroundColor Green
Write-Host "URL: http://3.1.70.209" -ForegroundColor Yellow
