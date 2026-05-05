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
  [string]$CertPassword = "",

  # choongman: 충만 로고·이름 | omnifoodtech: OmniFood 아이콘·표시 이름 (판매용 빌드)
  [Parameter(Mandatory = $false)]
  [ValidateSet("choongman", "omnifoodtech")]
  [string]$Brand = "choongman",

  # Brand omnifoodtech 일 때만 사용 (비우면 OmniFoodTech POS)
  [Parameter(Mandatory = $false)]
  [string]$ProductName = "",

  # dist 잠금만 해제 후 종료 — npm prebuild:win 에서 사용 (app.asar 사용 중 오류 방지)
  [Parameter(Mandatory = $false)]
  [switch]$ClearDistOnly
)

$ErrorActionPreference = "Stop"

# electron-builder 가 서명용으로 winCodeSign.7z 를 풀 때 darwin 쪽 심볼릭 링크 때문에 실패할 수 있음.
# Windows SDK 의 signtool.exe 를 지정하면 번들 winCodeSign 다운로드/압축 해제를 건너뜀(app-builder-lib getToolPath).
function Get-FirstSigntoolPath {
  foreach ($root in @(
      $(Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"),
      $(Join-Path $env:ProgramFiles "Windows Kits\10\bin")
    )) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $hit = Get-ChildItem -Path $root -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '(\\x64\\|\\arm64\\)' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($null -ne $hit) { return $hit.FullName }
  }
  return $null
}

function Invoke-Step {
  Param([scriptblock]$Block)
  & $Block
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed (exit code: $LASTEXITCODE)"
  }
}

# electron-builder 가 dist\win-unpacked\resources\app.asar 를 지우려면 파일 잠금이 없어야 함
# 반환: $true 이면 기본 dist 를 비웠거나 없음 → 그대로 빌드 가능
function Clear-WindowsPosDistLock {
  Param(
    [string]$WindowsPosRoot,
    # 판매용 빌드 시 설치본 실행 파일명(예: OmniFoodTech POS.exe) 잠금 해제
    [string]$AlsoKillExeDisplayName = ""
  )
  $dist = Join-Path $WindowsPosRoot "dist"
  $productName = "Choongman POS"
  $pkgPath = Join-Path $WindowsPosRoot "package.json"
  if (Test-Path -LiteralPath $pkgPath) {
    try {
      $j = Get-Content -Raw -LiteralPath $pkgPath | ConvertFrom-Json
      if ($null -ne $j.build -and $j.build.productName) {
        $productName = [string]$j.build.productName
      }
    } catch {}
  }
  $procName = [System.IO.Path]::GetFileNameWithoutExtension($productName)
  if (-not [string]::IsNullOrWhiteSpace($procName)) {
    Get-Process -Name $procName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  # taskkill: 프로세스 이름에 공백(Choongman POS.exe)도 처리
  $exeName = if ($productName.EndsWith(".exe")) { $productName } else { "$productName.exe" }
  Start-Process -FilePath "taskkill.exe" -ArgumentList @("/F", "/T", "/IM", $exeName) -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null
  if (-not [string]::IsNullOrWhiteSpace($AlsoKillExeDisplayName)) {
    $exe2 = if ($AlsoKillExeDisplayName.EndsWith(".exe")) { $AlsoKillExeDisplayName } else { "$AlsoKillExeDisplayName.exe" }
    Start-Process -FilePath "taskkill.exe" -ArgumentList @("/F", "/T", "/IM", $exe2) -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null
  }

  Get-Process -Name "electron" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $p = $_.Path
      if ([string]::IsNullOrWhiteSpace($p)) { $p = $_.MainModule.FileName }
      if (-not [string]::IsNullOrWhiteSpace($p) -and $p.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }

  # dist 경로 아래에서 실행 중인 모든 프로세스 (이전 빌드 잔류 app-builder 등)
  $distPrefix = $dist + [char]0x5C
  try {
    Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
      $ep = $_.ExecutablePath
      if ([string]::IsNullOrWhiteSpace($ep)) { return }
      if ($ep.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}

  # 멈춘 electron-builder / app-builder
  Get-Process -Name "app-builder" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

  Start-Sleep -Milliseconds 800

  for ($i = 0; $i -lt 4; $i++) {
    if (-not (Test-Path -LiteralPath $dist)) { return $true }
    Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $dist)) { return $true }
    Start-Sleep -Seconds 1
  }

  # 삭제 대신 폴더 이름만 바꿔서 새 dist 생성 여지
  if (Test-Path -LiteralPath $dist) {
    $newFolderName = "dist.orphan." + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
    try {
      Rename-Item -LiteralPath $dist -NewName $newFolderName -ErrorAction Stop
      if (-not (Test-Path -LiteralPath $dist)) { return $true }
    } catch {}
  }

  if (Test-Path -LiteralPath $dist) {
    Write-Warning "Could not remove or rename '$dist'. Will use an alternate output folder for electron-builder."
  }
  return -not (Test-Path -LiteralPath $dist)
}

if ($ClearDistOnly) {
  $projectRootEarly = Split-Path -Parent $PSScriptRoot
  $windowsPosDirEarly = Join-Path $projectRootEarly "windows-pos"
  $null = Clear-WindowsPosDistLock -WindowsPosRoot $windowsPosDirEarly
  exit 0
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
# 내부용·외부용(PosUrl 등만 다름) 동일 스키마 — runtime-config.example.json 과 맞춤(빌드 후에도 프린터 키·절단 플래그 유지)
$runtimeConfig = @{
  posUrl            = $PosUrl
  allowedOrigin     = $AllowedOrigin
  openDevtools      = $false
  kiosk             = $Kiosk
  updateManifestUrl = $UpdateManifestUrl
  print             = @{
    silent                           = $true
    deviceName                       = ""
    receiptDeviceName                = ""
    kitchenDeviceName                = ""
    kitchen1DeviceName               = ""
    kitchen2DeviceName               = ""
    kitchen3DeviceName               = ""
    escPosCutAfterKitchenHtml        = $true
    escPosCutAfterHallOrderHtml      = $true
    escPosCutAfterPaymentReceiptHtml = $true
  }
} | ConvertTo-Json -Depth 6
# Windows PowerShell 5.1 의 Set-Content -Encoding UTF8 은 BOM 을 붙여 JSON.parse(Electron) 가 실패할 수 있음 → BOM 없이 저장
[System.IO.File]::WriteAllText($runtimeConfigPath, $runtimeConfig, [System.Text.UTF8Encoding]::new($false))

$ebOutputFolder = "dist"
Push-Location $windowsPosDir
try {
  $resolvedSalesProductTitle = ""
  if ($Brand -eq "omnifoodtech") {
    $resolvedSalesProductTitle = if ([string]::IsNullOrWhiteSpace($ProductName)) { "OmniFoodTech POS" } else { $ProductName }
  }

  if (-not [string]::IsNullOrWhiteSpace($Version)) {
    $pkgPath = Join-Path $windowsPosDir "package.json"
    $currentVer = ""
    if (Test-Path $pkgPath) {
      $pkg = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
      $currentVer = [string]$pkg.version
    }
    if ($currentVer -eq $Version) {
      Write-Host "windows-pos already at version $Version - skip npm version"
    } else {
      # --no-git-tag-version 앞의 -- 가 PowerShell에서 연산자로 파싱되지 않도록 인자 분리
      Invoke-Step { & npm @('version', $Version, '--no-git-tag-version') }
    }
  }

  Invoke-Step { npm install }

  $env:CSC_LINK = $null
  $env:CSC_KEY_PASSWORD = $null
  # electron-builder 는 env 에서 WIN_CSC_LINK 를 CSC_LINK 보다 우선함. 남아 있으면 미서명/로컬 PFX 설정과 무관하게 서명·winCodeSign 경로로 들어감.
  Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue
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

  $signtool = Get-FirstSigntoolPath
  if (-not [string]::IsNullOrWhiteSpace($signtool)) {
    $env:SIGNTOOL_PATH = $signtool
    Write-Host "SIGNTOOL_PATH=$signtool (bundled winCodeSign 7z extraction skipped when signing tools run)"
  }

  $builderArgs = @("--win", "nsis", "portable")

  if ($Brand -eq "omnifoodtech") {
    $rasterScript = Join-Path $projectRoot "scripts\rasterize-omnifoodtech-brand-icon.cjs"
    Invoke-Step { node $rasterScript }
    $builderArgs += "--config.productName=$resolvedSalesProductTitle"
    # 내부용과 appId·npm name 분리 → Roaming 폴더·작업표시줄 ID 충돌 완화 (build-brand-omnifoodtech.json)
    $brandCfg = Join-Path $windowsPosDir "build-brand-omnifoodtech.json"
    if (-not (Test-Path -LiteralPath $brandCfg)) {
      throw "Missing $brandCfg (omnifoodtech brand merge config)"
    }
    $resolvedBrandCfg = (Resolve-Path $brandCfg).Path
    $builderArgs += "--config=$resolvedBrandCfg"
  }

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    $defaultIcon = Join-Path $windowsPosDir "assets\icon.ico"
    $iconScript = Join-Path $projectRoot "scripts\generate-windows-pos-icon.ps1"
    if ($Brand -eq "omnifoodtech") {
      $omniPng = Join-Path $projectRoot "assets\brand\omnifoodtech-logo.png"
      Invoke-Step { powershell -NoProfile -ExecutionPolicy Bypass -File $iconScript -OutputPath $defaultIcon -SourceImage $omniPng }
    } else {
      Invoke-Step { powershell -NoProfile -ExecutionPolicy Bypass -File $iconScript -OutputPath $defaultIcon }
    }
    $IconPath = $defaultIcon
  }

  if (-not [string]::IsNullOrWhiteSpace($IconPath)) {
    if (-not (Test-Path $IconPath)) {
      throw "Icon file not found: $IconPath"
    }
    $resolvedIcon = (Resolve-Path $IconPath).Path
    $builderArgs += @("--config.win.icon=$resolvedIcon")
  }

  $extraKill = if ($Brand -eq "omnifoodtech" -and -not [string]::IsNullOrWhiteSpace($resolvedSalesProductTitle)) { $resolvedSalesProductTitle } else { "" }
  $distOk = Clear-WindowsPosDistLock -WindowsPosRoot $windowsPosDir -AlsoKillExeDisplayName $extraKill
  if (-not $distOk) {
    $ebOutputFolder = "dist-eb-" + [Guid]::NewGuid().ToString("N").Substring(0, 12)
    $builderArgs += "--config.directories.output=$ebOutputFolder"
    Write-Warning "Building to alternate folder '$ebOutputFolder' under windows-pos (default dist is locked)."
  }

  Invoke-Step { npx electron-builder @builderArgs }
}
finally {
  Pop-Location
}

Write-Host "Windows POS build done."
Write-Host "- Brand: $Brand"
Write-Host "- POS URL: $PosUrl"
Write-Host "- Update manifest: $UpdateManifestUrl"
Write-Host "- Installer output: windows-pos\$ebOutputFolder\"
