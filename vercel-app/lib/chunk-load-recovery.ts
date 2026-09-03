import { LOGIN_HARD_REFRESH_PARAM } from "@/lib/login-hard-refresh"

/** 배포 직후 옛 webpack 런타임이 없는 청크 해시를 보면 `64807.undefined.js` 로 요청한다. */
export const CHUNK_RECOVERY_SESSION_KEY = "cm-erp-chunk-recovery"

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const name = error instanceof Error ? error.name : ""
  return (
    name === "ChunkLoadError" ||
    message.includes("Loading chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes(".undefined.js")
  )
}

/**
 * 배포 직후 PWA·Android WebView 캐시가 섞이면 청크 대신
 * 압축 변수 `.map is not a function`(예: `eo.map is not a function`)으로 터진다.
 * 한 번만 SW·정적 캐시를 지우고 다시 연다.
 */
export function isStaleClientBundleError(error: unknown): boolean {
  if (isChunkLoadError(error)) return true
  const message = error instanceof Error ? error.message : String(error ?? "")
  return /\.map is not a function/i.test(message) || /\.filter is not a function/i.test(message)
}

export function shouldClearBuildRelatedCache(name: string): boolean {
  const k = name.toLowerCase()
  return k.includes("next-static") || k.includes("serwist") || k.includes("workbox")
}

export function hasRecentChunkRecovery(now = Date.now(), windowMs = 90_000): boolean {
  if (typeof sessionStorage === "undefined") return false
  try {
    const raw = sessionStorage.getItem(CHUNK_RECOVERY_SESSION_KEY)
    const at = raw ? Number(raw) : 0
    return Number.isFinite(at) && at > 0 && now - at < windowMs
  } catch {
    return false
  }
}

export function markChunkRecovery(now = Date.now()): void {
  try {
    sessionStorage.setItem(CHUNK_RECOVERY_SESSION_KEY, String(now))
  } catch {
    /* private mode */
  }
}

async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistrations) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map((reg) => reg.unregister()))
}

async function deleteBuildRelatedCaches(): Promise<void> {
  if (typeof caches === "undefined") return
  const keys = await caches.keys()
  await Promise.all(keys.filter(shouldClearBuildRelatedCache).map((key) => caches.delete(key)))
}

/**
 * 오염된 SW·정적 캐시를 지운 뒤 현재 URL을 다시 연다.
 * 하이브리드 `reloadPosUrl(preferFresh)` 는 로그인 URL로 보내므로 쓰지 않는다.
 *
 * Android PWA에서 getRegistrations/unregister 가 멈추면 예전엔 화면이 그대로였다.
 * 정리는 백그라운드로 던지고, 이동은 즉시 한다.
 */
export async function recoverFromChunkLoadError(): Promise<void> {
  markChunkRecovery()
  void unregisterServiceWorkers().catch(() => {})
  void deleteBuildRelatedCaches().catch(() => {})
  const next = new URL(window.location.href)
  next.searchParams.set(LOGIN_HARD_REFRESH_PARAM, String(Date.now()))
  window.location.replace(next.toString())
}
