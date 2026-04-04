Param(
  [string]$OutputPath = "",
  [string]$SourceImage = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $projectRoot "windows-pos\assets\icon.ico"
}

$brandScript = Join-Path $PSScriptRoot "generate-windows-brand-ico.ps1"
if (-not [string]::IsNullOrWhiteSpace($SourceImage)) {
  & $brandScript -OutputPath $OutputPath -SourceImage $SourceImage
} else {
  & $brandScript -OutputPath $OutputPath
}

Write-Host "Windows POS icon ready: $OutputPath"
