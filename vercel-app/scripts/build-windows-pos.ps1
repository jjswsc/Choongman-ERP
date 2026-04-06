Param(
  [Parameter(Mandatory = $false)]
  [string]$PosUrl = "https://choongman-erp.vercel.app/pos/login",

  [Parameter(Mandatory = $false)]
  [string]$AllowedOrigin = "",

  [Parameter(Mandatory = $false)]
  [string]$UpdateManifestUrl = "",

  [Parameter(Mandatory = $false)]
  [ValidateSet("0", "1")]
  [string]$Kiosk = "1",

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
$windowsPosDir = Join-Path $projectRoot "windows-pos"

if (-not (Test-Path $windowsPosDir)) {
  throw "windows-pos folder not found: $windowsPosDir"
}

if ([string]::IsNullOrWhiteSpace($AllowedOrigin)) {
  try {
    $AllowedOrigin = ([Uri]$PosUrl).GetLeftPart([System.UriPartial]::Authority)
  } catch {
    throw "Invalid PosUrl: $PosUrl"
  }
}

if ([string]::IsNullOrWhiteSpace($UpdateManifestUrl)) {
  $UpdateManifestUrl = "$AllowedOrigin/downloads/windows-pos/latest.json"
}

$runtimeConfigPath = Join-Path $windowsPosDir "runtime-config.json"
$runtimeConfig = @{
  posUrl            = $PosUrl
  allowedOrigin     = $AllowedOrigin
  kiosk             = $Kiosk
  updateManifestUrl = $UpdateManifestUrl
  print             = @{
    silent     = $true
    deviceName = ""
  }
} | ConvertTo-Json -Depth 6
Set-Content -Path $runtimeConfigPath -Value $runtimeConfig -Encoding UTF8

Push-Location $windowsPosDir
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
    # 미서명: CSC 비활성화. win.signAndEditExecutable 은 package.json 에서 false 권장
    # (true 이면 winCodeSign 7z 안의 macOS 심볼릭 링크를 풀 때, 개발자 모드/관리자 권한이 없으면 실패함).
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  }

  $builderArgs = @("--win", "nsis", "portable")

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    $defaultIcon = Join-Path $windowsPosDir "assets\icon.ico"
    $iconScript = Join-Path $projectRoot "scripts\generate-windows-pos-icon.ps1"
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

Write-Host "Windows POS build done."
Write-Host "- POS URL: $PosUrl"
Write-Host "- Update manifest: $UpdateManifestUrl"
