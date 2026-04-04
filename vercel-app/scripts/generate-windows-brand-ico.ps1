Param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [string]$SourceImage = "",

  [int]$CanvasSize = 256,

  [int]$PadPixels = 8
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($SourceImage)) {
  $SourceImage = Join-Path $projectRoot "assets\brand\choongman-logo.png"
}

if (-not (Test-Path $SourceImage)) {
  throw "Source logo not found: $SourceImage"
}

$resolvedSource = (Resolve-Path $SourceImage).Path
$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outDir)) {
  New-Item -Path $outDir -ItemType Directory | Out-Null
}

$src = [System.Drawing.Image]::FromFile($resolvedSource)

function Get-NonTransparentBounds {
  Param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Bitmap]$Bitmap
  )

  $left = $Bitmap.Width
  $top = $Bitmap.Height
  $right = -1
  $bottom = -1

  for ($y = 0; $y -lt $Bitmap.Height; $y++) {
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
      $a = $Bitmap.GetPixel($x, $y).A
      if ($a -gt 8) {
        if ($x -lt $left) { $left = $x }
        if ($x -gt $right) { $right = $x }
        if ($y -lt $top) { $top = $y }
        if ($y -gt $bottom) { $bottom = $y }
      }
    }
  }

  if ($right -lt $left -or $bottom -lt $top) {
    return [System.Drawing.Rectangle]::FromLTRB(0, 0, $Bitmap.Width, $Bitmap.Height)
  }
  return [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
}
try {
  $srcBmp = New-Object System.Drawing.Bitmap $src
  $cropRect = Get-NonTransparentBounds -Bitmap $srcBmp
  $cropped = New-Object System.Drawing.Bitmap $cropRect.Width, $cropRect.Height
  $cg = [System.Drawing.Graphics]::FromImage($cropped)
  $cg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $cg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $cg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $cg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $cg.Clear([System.Drawing.Color]::Transparent)
  $cg.DrawImage(
    $srcBmp,
    [System.Drawing.Rectangle]::FromLTRB(0, 0, $cropRect.Width, $cropRect.Height),
    $cropRect,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $cg.Dispose()

  $bmp = New-Object System.Drawing.Bitmap $CanvasSize, $CanvasSize
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $maxW = [Math]::Max(1, $CanvasSize - (2 * $PadPixels))
  $maxH = [Math]::Max(1, $CanvasSize - (2 * $PadPixels))
  $ratio = [Math]::Min($maxW / $cropped.Width, $maxH / $cropped.Height)
  $w = [int][Math]::Round($cropped.Width * $ratio)
  $h = [int][Math]::Round($cropped.Height * $ratio)
  $x = ($CanvasSize - $w) / 2.0
  $y = ($CanvasSize - $h) / 2.0
  $g.DrawImage($cropped, $x, $y, $w, $h)
  $g.Dispose()

  $tempPng = Join-Path $env:TEMP ("cm-brand-ico-" + [Guid]::NewGuid().ToString("n") + ".png")
  try {
    $bmp.Save($tempPng, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $bmp.Dispose()
    $cropped.Dispose()
    $srcBmp.Dispose()
  }

  $winPosDir = Join-Path $projectRoot "windows-pos"
  $winErpDir = Join-Path $projectRoot "windows-erp"
  $shellRoot = $winPosDir
  $icoScript = Join-Path $winPosDir "scripts\brand-png-to-ico.cjs"
  if (-not (Test-Path (Join-Path $winPosDir "node_modules\png-to-ico"))) {
    $shellRoot = $winErpDir
    $icoScript = Join-Path $winErpDir "scripts\brand-png-to-ico.cjs"
  }
  if (-not (Test-Path (Join-Path $shellRoot "node_modules\png-to-ico"))) {
    throw "png-to-ico not installed. Run: cd windows-pos && npm install   OR   cd windows-erp && npm install"
  }
  if (-not (Test-Path $icoScript)) {
    throw "Missing $icoScript"
  }
  Push-Location $shellRoot
  try {
    $node = Get-Command node -ErrorAction Stop
    & $node.Source $icoScript $tempPng $OutputPath
    if ($LASTEXITCODE -ne 0) {
      throw "brand-png-to-ico.cjs failed (exit code: $LASTEXITCODE)"
    }
  }
  finally {
    Pop-Location
    if (Test-Path $tempPng) {
      Remove-Item -LiteralPath $tempPng -Force -ErrorAction SilentlyContinue
    }
  }
}
finally {
  $src.Dispose()
}

Write-Host "Windows app icon generated: $OutputPath (from $resolvedSource)"
