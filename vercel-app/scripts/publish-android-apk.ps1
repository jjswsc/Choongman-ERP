Param(
  [string]$SourceApkPath = "",
  [string]$TargetName = "cm-pos-android-latest.apk"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$downloadDir = Join-Path $projectRoot "public\downloads"

if (-not (Test-Path $downloadDir)) {
  New-Item -Path $downloadDir -ItemType Directory | Out-Null
}

if ([string]::IsNullOrWhiteSpace($SourceApkPath)) {
  $candidate = Join-Path $projectRoot "android\app\build\outputs\apk\pilot\release\app-pilot-release.apk"
  if (Test-Path $candidate) {
    $SourceApkPath = $candidate
  } else {
    throw "APK not found. Pass -SourceApkPath to your .apk file."
  }
}

if (-not (Test-Path $SourceApkPath)) {
  throw "APK path does not exist: $SourceApkPath"
}

$targetApkPath = Join-Path $downloadDir $TargetName
Copy-Item -Path $SourceApkPath -Destination $targetApkPath -Force

$hash = Get-FileHash -Path $targetApkPath -Algorithm SHA256
$hashText = @(
  "file=$TargetName"
  "sha256=$($hash.Hash.ToLower())"
  "generatedAtUtc=$([DateTime]::UtcNow.ToString("o"))"
) -join "`n"

$hashPath = Join-Path $downloadDir "$TargetName.sha256.txt"
Set-Content -Path $hashPath -Value $hashText -Encoding UTF8

Write-Host "Publish done."
Write-Host "- APK: $targetApkPath"
Write-Host "- SHA256: $hashPath"
