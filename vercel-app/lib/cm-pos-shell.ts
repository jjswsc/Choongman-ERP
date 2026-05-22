/** Windows Electron 하이브리드 POS — preload가 주입한 브리지 */
export function isCmPosHybridShell(): boolean {
  if (typeof window === "undefined") return false
  const w = window as Window & { cmPosShell?: { printHtml?: unknown } }
  return typeof w.cmPosShell?.printHtml === "function"
}

/**
 * Android 태블릿·Capacitor WebView 등(하이브리드 셸 제외).
 * 숨김 iframe `print()` 시 OS 인쇄 미리보기에 POS 본화면(로딩·장바구니)이 잡히는 Chromium 이슈 대응용.
 */
export function isPosAndroidWebPrintClient(): boolean {
  if (typeof window === "undefined") return false
  if (isCmPosHybridShell()) return false
  if (!/Android/i.test(navigator.userAgent || "")) return false
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor
  if (cap?.getPlatform?.() === "android") return true
  return true
}
