Param(
  [Parameter(Mandatory = $true)]
  [string]$OverlayPath,
  [string]$RuntimeConfigPath = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsPosDir = Join-Path $projectRoot "windows-pos"
if (-not $RuntimeConfigPath) {
  $RuntimeConfigPath = Join-Path $windowsPosDir "runtime-config.json"
}

$resolvedOverlay = $OverlayPath
if (-not (Test-Path $resolvedOverlay)) {
  $candidate = Join-Path $windowsPosDir $OverlayPath
  if (Test-Path $candidate) {
    $resolvedOverlay = $candidate
  } else {
    throw "Overlay not found: $OverlayPath"
  }
}

if (-not (Test-Path $RuntimeConfigPath)) {
  throw "runtime-config not found: $RuntimeConfigPath"
}

function Merge-JsonObject {
  param(
    [Parameter(Mandatory = $true)] $Base,
    [Parameter(Mandatory = $true)] $Overlay
  )
  if ($null -eq $Overlay) { return $Base }
  if ($Overlay -isnot [System.Management.Automation.PSCustomObject] -and $Overlay -isnot [hashtable]) {
    return $Overlay
  }
  if ($Base -isnot [System.Management.Automation.PSCustomObject]) {
    return $Overlay
  }
  $out = [ordered]@{}
  foreach ($prop in $Base.PSObject.Properties) {
    if ($prop.Name.StartsWith("_")) { continue }
    $out[$prop.Name] = $prop.Value
  }
  foreach ($prop in $Overlay.PSObject.Properties) {
    if ($prop.Name.StartsWith("_")) { continue }
    $baseVal = $out[$prop.Name]
    $ovVal = $prop.Value
    if ($null -ne $baseVal -and $baseVal -is [System.Management.Automation.PSCustomObject] -and $ovVal -is [System.Management.Automation.PSCustomObject]) {
      $out[$prop.Name] = Merge-JsonObject -Base $baseVal -Overlay $ovVal
    } else {
      $out[$prop.Name] = $ovVal
    }
  }
  [PSCustomObject]$out
}

$baseRaw = Get-Content -Path $RuntimeConfigPath -Raw -Encoding UTF8
$overlayRaw = Get-Content -Path $resolvedOverlay -Raw -Encoding UTF8
$baseObj = $baseRaw | ConvertFrom-Json
$overlayObj = $overlayRaw | ConvertFrom-Json
$merged = Merge-JsonObject -Base $baseObj -Overlay $overlayObj
$json = $merged | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($RuntimeConfigPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))

Write-Host "Merged runtime config:"
Write-Host "- overlay: $resolvedOverlay"
Write-Host "- target:  $RuntimeConfigPath"
