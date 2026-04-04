Param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsErpDir = Join-Path $projectRoot "windows-erp"
$runtimeConfigPath = Join-Path $windowsErpDir "runtime-config.json"

if (-not (Test-Path $windowsErpDir)) {
  throw "windows-erp folder not found: $windowsErpDir"
}

$resolvedTemplate = $TemplatePath
if (-not (Test-Path $resolvedTemplate)) {
  $candidate = Join-Path $windowsErpDir $TemplatePath
  if (Test-Path $candidate) {
    $resolvedTemplate = $candidate
  } else {
    throw "Template not found: $TemplatePath"
  }
}

$jsonRaw = Get-Content -Path $resolvedTemplate -Raw
$null = $jsonRaw | ConvertFrom-Json

Set-Content -Path $runtimeConfigPath -Value $jsonRaw -Encoding UTF8

Write-Host "Applied ERP store config:"
Write-Host "- source: $resolvedTemplate"
Write-Host "- target: $runtimeConfigPath"
