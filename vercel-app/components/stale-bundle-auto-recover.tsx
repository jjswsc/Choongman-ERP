"use client"

import { useEffect } from "react"
import {
  hasRecentChunkRecovery,
  recoverFromChunkLoadError,
  shouldRecoverStaleBundleEvent,
} from "@/lib/chunk-load-recovery"

/**
 * React ErrorBoundary 밖으로 샌 청크/캐시 오류(흰 화면)도 직원이 누르지 않고 Clear Cache 경로로 복구.
 */
export function StaleBundleAutoRecover() {
  useEffect(() => {
    if (typeof window === "undefined") return
    const run = (payload: unknown) => {
      if (!shouldRecoverStaleBundleEvent(payload, hasRecentChunkRecovery())) return
      void recoverFromChunkLoadError()
    }
    const onError = (event: ErrorEvent) => {
      run(event.error || event.message)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      run(event.reason)
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}
