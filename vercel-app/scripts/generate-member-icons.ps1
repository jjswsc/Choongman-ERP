# 회원 라운지 PWA 아이콘 — 브랜드 로고 PNG에서 생성
# vercel-app 기준: powershell -File scripts/generate-member-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$appRoot = Split-Path $PSScriptRoot -Parent
$pub = Join-Path $appRoot "public"

function New-PwaIconFromLogo(
  [string]$sourcePath,
  [string]$outPrefix,
  [int[]]$sizes,
  [System.Drawing.Color]$background
) {
  if (-not (Test-Path $sourcePath)) {
    throw "Logo not found: $sourcePath"
  }
  $src = [System.Drawing.Image]::FromFile((Resolve-Path $sourcePath))
  try {
    foreach ($size in $sizes) {
      $bmp = New-Object System.Drawing.Bitmap $size, $size
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear($background)

        $padding = [int][Math]::Round($size * 0.12)
        $inner = $size - ($padding * 2)
        $scale = [Math]::Min($inner / $src.Width, $inner / $src.Height)
        $drawW = [int][Math]::Round($src.Width * $scale)
        $drawH = [int][Math]::Round($src.Height * $scale)
        $x = [int][Math]::Round(($size - $drawW) / 2)
        $y = [int][Math]::Round(($size - $drawH) / 2)
        $g.DrawImage($src, $x, $y, $drawW, $drawH)

        $out = Join-Path $pub "$outPrefix-$size.png"
        $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Host "wrote $out"
      } finally {
        $g.Dispose()
        $bmp.Dispose()
      }
    }
  } finally {
    $src.Dispose()
  }
}

$memberBg = [System.Drawing.Color]::FromArgb(255, 8, 8, 10)
$omniBg = [System.Drawing.Color]::FromArgb(255, 11, 18, 32)

$choongmanLogo = Join-Path $appRoot "assets/brand/choongman-logo.png"
New-PwaIconFromLogo $choongmanLogo "icon-member" @(192, 512) $memberBg

# Omni: PNG가 없으면 SVG를 public에 두고 수동 변환 필요 — 우선 logo.svg 대신 icon SVG를 rasterize 시도
$omniSvg = Join-Path $pub "omnifoodtech-icon.svg"
$omniPngFallback = Join-Path $appRoot "assets/brand/omnifoodtech-logo.png"
if (Test-Path $omniPngFallback) {
  New-PwaIconFromLogo $omniPngFallback "icon-member-omni" @(192, 512) $omniBg
} elseif (Get-Command magick -ErrorAction SilentlyContinue) {
  $tmpOmni = Join-Path $env:TEMP "omni-logo-raster.png"
  & magick convert -background none -density 300 $omniSvg -resize 1024x1024 $tmpOmni
  New-PwaIconFromLogo $tmpOmni "icon-member-omni" @(192, 512) $omniBg
  Remove-Item $tmpOmni -ErrorAction SilentlyContinue
} else {
  Write-Warning "Omni logo PNG not found and ImageMagick unavailable. Keeping existing icon-member-omni PNGs if present."
}
