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
 */
export async function recoverFromChunkLoadError(): Promise<void> {
  markChunkRecovery()
  try {
    await unregisterServiceWorkers()
  } catch {
    /* ignore */
  }
  try {
    await deleteBuildRelatedCaches()
  } catch {
    /* ignore */
  }
  const next = new URL(window.location.href)
  next.searchParams.set("_chunk", String(Date.now()))
  window.location.replace(next.toString())
}
