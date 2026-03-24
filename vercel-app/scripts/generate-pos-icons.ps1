# POS PWA 아이콘 PNG 생성. vercel-app 기준: powershell -File scripts/generate-pos-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$appRoot = Split-Path $PSScriptRoot -Parent
$pub = Join-Path $appRoot "public"

function New-PosIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $teal = [System.Drawing.Color]::FromArgb(255, 13, 148, 136)
    $g.Clear($teal)

    $emCm = [float]($size * 0.11)
    $emPos = [float]($size * 0.28)
    $fontCm = [System.Drawing.Font]::new("Segoe UI", $emCm, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fontPos = [System.Drawing.Font]::new("Segoe UI", $emPos, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $white = [System.Drawing.Brushes]::White
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("CM", $fontCm, $white, (New-Object System.Drawing.RectangleF 0, ($size * 0.18), $size, ($size * 0.2)), $sf)
    $g.DrawString("POS", $fontPos, $white, (New-Object System.Drawing.RectangleF 0, ($size * 0.38), $size, ($size * 0.45)), $sf)

    $fontCm.Dispose()
    $fontPos.Dispose()
    $sf.Dispose()
    $out = Join-Path $pub "icon-pos-$size.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "wrote $out"
}

New-PosIcon 192
New-PosIcon 512
