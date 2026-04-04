Param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsPosDir = Join-Path $projectRoot "windows-pos"
$runtimeConfigPath = Join-Path $windowsPosDir "runtime-config.json"

if (-not (Test-Path $windowsPosDir)) {
  throw "windows-pos folder not found: $windowsPosDir"
}

$resolvedTemplate = $TemplatePath
if (-not (Test-Path $resolvedTemplate)) {
  $candidate = Join-Path $windowsPosDir $TemplatePath
  if (Test-Path $candidate) {
    $resolvedTemplate = $candidate
  } else {
    throw "Template not found: $TemplatePath"
  }
}

$jsonRaw = Get-Content -Path $resolvedTemplate -Raw
$null = $jsonRaw | ConvertFrom-Json

Set-Content -Path $runtimeConfigPath -Value $jsonRaw -Encoding UTF8

Write-Host "Applied store config:"
Write-Host "- source: $resolvedTemplate"
Write-Host "- target: $runtimeConfigPath"
