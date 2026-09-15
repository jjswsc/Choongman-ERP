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
 * 부팅 시 호출하지 말 것. 인터넷이 끊긴 매장에서 SW·캐시를 지우면 흰 화면만 남는다.
 * 직원이 온라인에서 수동 Clear Cache 할 때만 쓴다.
 */
export async function disableHybridPosServiceWorker(): Promise<void> {
  if (!isCmPosHybridShell()) return
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return
  if (navigator.onLine === false) return

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
