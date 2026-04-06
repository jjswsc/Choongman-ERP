# Hybrid (Electron) POS shell -> local Next.js. Web POS = browser only.
# 1) Terminal A: cd vercel-app && npm run dev
# 2) Terminal B: run this script from vercel-app
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-windows-pos-local.ps1
#
# Same host as browser cookies: add -UseLocalhost
# Login first: -StartPath "/pos/login"
# Needs .env.local for API/Supabase when testing orders/menus.

Param(
  [Parameter(Mandatory = $false)]
  [int]$Port = 3000,
  [Parameter(Mandatory = $false)]
  [string]$StartPath = "/pos",
  [Parameter(Mandatory = $false)]
  [switch]$UseLocalhost
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$windowsPosDir = Join-Path $projectRoot "windows-pos"

if (-not (Test-Path $windowsPosDir)) {
  throw "windows-pos folder not found: $windowsPosDir"
}

$hostOnly = if ($UseLocalhost) { "localhost" } else { "127.0.0.1" }
$origin = "http://${hostOnly}:$Port"
$urlPath = $StartPath.TrimStart()
if (-not $urlPath.StartsWith("/")) {
  $urlPath = "/$urlPath"
}
$env:WINDOWS_POS_URL = "$origin$urlPath"
$env:WINDOWS_POS_ALLOWED_ORIGIN = $origin
$env:WINDOWS_POS_AUTO_UPDATE = "0"

try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect($hostOnly, $Port)
  $tcp.Close()
} catch {
  Write-Host ""
  Write-Host "  [ERROR] Cannot connect to ${origin} (ERR_CONNECTION_REFUSED)." -ForegroundColor Red
  Write-Host "          Start Next.js first in another terminal, then re-run this script:" -ForegroundColor Yellow
  Write-Host "            cd vercel-app" -ForegroundColor Gray
  Write-Host "            npm run dev" -ForegroundColor Gray
  Write-Host ""
  exit 1
}

Write-Host ""
Write-Host "  [Web]    open in browser: http://localhost:${Port}/pos" -ForegroundColor DarkGray
Write-Host "  [Hybrid] Electron window (Windows POS) -> $env:WINDOWS_POS_URL" -ForegroundColor Cyan
Write-Host ""

Push-Location $windowsPosDir
try {
  npm run dev
} finally {
  Pop-Location
}
