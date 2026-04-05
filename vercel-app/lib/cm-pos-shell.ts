/** Windows Electron 하이브리드 POS — preload가 주입한 브리지 */
export function isCmPosHybridShell(): boolean {
  if (typeof window === "undefined") return false
  const w = window as Window & { cmPosShell?: { printHtml?: unknown } }
  return typeof w.cmPosShell?.printHtml === "function"
}
