Param(
  [Parameter(Mandatory = $false)]
  [string]$ErpUrl = "https://choongman-erp.vercel.app/admin/login",

  [Parameter(Mandatory = $false)]
  [string]$AllowedOrigin = "",

  [Parameter(Mandatory = $false)]
  [string]$UpdateManifestUrl = "",

  [Parameter(Mandatory = $false)]
  [ValidateSet("0", "1")]
  [string]$Kiosk = "0",

  [Parameter(Mandatory = $false)]
  [string]$Version = "",

  [Parameter(Mandatory = $false)]
  [string]$IconPath = "",

  [Parameter(Mandatory = $false)]
  [string]$CertPfxPath = "",

  [Parameter(Mandatory = $false)]
  [string]$CertPassword = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  Param([scriptblock]$Block)
  & $Block
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed (exit code: $LASTEXITCODE)"
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsErpDir = Join-Path $projectRoot "windows-erp"

if (-not (Test-Path $windowsErpDir)) {
  throw "windows-erp folder not found: $windowsErpDir"
}

if ([string]::IsNullOrWhiteSpace($AllowedOrigin)) {
  try {
    $AllowedOrigin = ([Uri]$ErpUrl).GetLeftPart([System.UriPartial]::Authority)
  } catch {
    throw "Invalid ErpUrl: $ErpUrl"
  }
}

if ([string]::IsNullOrWhiteSpace($UpdateManifestUrl)) {
  $UpdateManifestUrl = "$AllowedOrigin/downloads/windows-erp/latest.json"
}

$runtimeConfigPath = Join-Path $windowsErpDir "runtime-config.json"
$runtimeConfig = @{
  erpUrl = $ErpUrl
  allowedOrigin = $AllowedOrigin
  kiosk = $Kiosk
  updateManifestUrl = $UpdateManifestUrl
} | ConvertTo-Json -Depth 5
Set-Content -Path $runtimeConfigPath -Value $runtimeConfig -Encoding UTF8

Push-Location $windowsErpDir
try {
  if (-not [string]::IsNullOrWhiteSpace($Version)) {
    Invoke-Step { npm version $Version --no-git-tag-version }
  }

  Invoke-Step { npm install }

  $env:CSC_LINK = $null
  $env:CSC_KEY_PASSWORD = $null
  if (-not [string]::IsNullOrWhiteSpace($CertPfxPath)) {
    Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    if (-not (Test-Path $CertPfxPath)) {
      throw "Certificate file not found: $CertPfxPath"
    }
    $resolved = (Resolve-Path $CertPfxPath).Path
    $env:CSC_LINK = $resolved
    if (-not [string]::IsNullOrWhiteSpace($CertPassword)) {
      $env:CSC_KEY_PASSWORD = $CertPassword
    }
  } else {
    # 미서명: package.json 에서 signAndEditExecutable: false 권장 (winCodeSign 압축 해제·심볼릭 링크 이슈 방지)
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  }

  $builderArgs = @("--win", "nsis", "portable")

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    $defaultIcon = Join-Path $windowsErpDir "assets\icon.ico"
    $iconScript = Join-Path $projectRoot "scripts\generate-windows-erp-icon.ps1"
    Invoke-Step { powershell -NoProfile -ExecutionPolicy Bypass -File $iconScript -OutputPath $defaultIcon }
    $IconPath = $defaultIcon
  }

  if (-not [string]::IsNullOrWhiteSpace($IconPath)) {
    if (-not (Test-Path $IconPath)) {
      throw "Icon file not found: $IconPath"
    }
    $resolvedIcon = (Resolve-Path $IconPath).Path
    $builderArgs += @("--config.win.icon=$resolvedIcon")
  }

  Invoke-Step { npx electron-builder @builderArgs }
}
finally {
  Pop-Location
}

Write-Host "Windows ERP build done."
Write-Host "- ERP URL: $ErpUrl"
Write-Host "- Update manifest: $UpdateManifestUrl"
