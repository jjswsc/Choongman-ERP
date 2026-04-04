param(
  [string]$StorePassword = "",
  [string]$KeyPassword = "",
  [string]$KeyAlias = "choongman-pos",
  [string]$KeystoreFileName = "choongman-pos-release.jks",
  [string]$DName = "CN=Choongman POS, OU=IT, O=Choongman, L=Bangkok, ST=Bangkok, C=TH",
  [int]$ValidityDays = 36500
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$keystoreDir = Join-Path $root "keystore"
$androidDir = Join-Path $root "android"
$keystorePath = Join-Path $keystoreDir $KeystoreFileName
$propsPath = Join-Path $androidDir "keystore.properties"

if (-not $StorePassword) {
  $StorePassword = Read-Host "Enter keystore password"
}
if (-not $KeyPassword) {
  $KeyPassword = Read-Host "Enter key password (same as keystore password is okay)"
}
if (-not $StorePassword -or -not $KeyPassword) {
  throw "storePassword/keyPassword cannot be empty."
}
if ($StorePassword.Length -lt 6 -or $KeyPassword.Length -lt 6) {
  throw "storePassword/keyPassword must be at least 6 characters."
}

$keytoolCmd = "keytool"
if ($env:JAVA_HOME) {
  $javaKeytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"
  if (Test-Path $javaKeytool) {
    $keytoolCmd = $javaKeytool
  }
}

New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null

if (-not (Test-Path $keystorePath)) {
  & $keytoolCmd -genkeypair `
    -v `
    -keystore $keystorePath `
    -storepass $StorePassword `
    -keypass $KeyPassword `
    -alias $KeyAlias `
    -keyalg RSA `
    -keysize 2048 `
    -validity $ValidityDays `
    -storetype JKS `
    -dname $DName
  if ($LASTEXITCODE -ne 0) {
    throw "keytool failed while creating keystore."
  }
} else {
  Write-Host "keystore already exists: $keystorePath"
}

$props = @(
  "storeFile=../keystore/$KeystoreFileName"
  "storePassword=$StorePassword"
  "keyAlias=$KeyAlias"
  "keyPassword=$KeyPassword"
)
Set-Content -Path $propsPath -Value ($props -join "`r`n") -Encoding UTF8

Write-Host ""
Write-Host "Signing files are ready:"
Write-Host " - $keystorePath"
Write-Host " - $propsPath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  npm run mobile:android:bundle:prod"
