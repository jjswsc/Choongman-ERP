"use client"

import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import {
  hasRecentChunkRecovery,
  shouldClearBuildRelatedCache,
} from "@/lib/chunk-load-recovery"
import {
  HYBRID_SW_CLEARED_SESSION_KEY,
  shouldReloadAfterHybridSwUnregister,
} from "@/lib/pos-service-worker-policy"

/**
 * Windows POS: Electron 디스크 캐시·offline.html로 오프라인 부팅한다.
 * Serwist를 같이 두면 배포 직후 옛 JS/새 HTML이 섞여 매장이 멈춘다.
 */
export async function disableHybridPosServiceWorker(): Promise<void> {
  if (!isCmPosHybridShell()) return
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return

  let hadController = false
  try {
    hadController = Boolean(navigator.serviceWorker.controller)
  } catch {
    hadController = false
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((reg) => reg.unregister()))
  } catch {
    /* ignore */
  }

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys()
      await Promise.all(keys.filter(shouldClearBuildRelatedCache).map((key) => caches.delete(key)))
    }
  } catch {
    /* ignore */
  }

  let alreadyCleared = false
  try {
    alreadyCleared = sessionStorage.getItem(HYBRID_SW_CLEARED_SESSION_KEY) === "1"
  } catch {
    alreadyCleared = false
  }

  if (
    !shouldReloadAfterHybridSwUnregister({
      hadController,
      alreadyClearedThisSession: alreadyCleared,
      recentChunkRecovery: hasRecentChunkRecovery(),
    })
  ) {
    return
  }

  try {
    sessionStorage.setItem(HYBRID_SW_CLEARED_SESSION_KEY, "1")
  } catch {
    /* private mode */
  }
  window.location.reload()
}
