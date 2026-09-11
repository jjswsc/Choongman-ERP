/** Windows Electron은 HTTP 캐시·offline.html이 있어 SW와 겹치면 배포 직후 청크가 섞인다. */
export const HYBRID_SW_CLEARED_SESSION_KEY = "cm-erp-hybrid-sw-cleared"

export function shouldRegisterPosServiceWorker(opts: {
  isProduction: boolean
  isHybridShell: boolean
}): boolean {
  if (!opts.isProduction) return false
  if (opts.isHybridShell) return false
  return true
}

export function shouldReloadAfterHybridSwUnregister(opts: {
  hadController: boolean
  alreadyClearedThisSession: boolean
  recentChunkRecovery: boolean
}): boolean {
  return opts.hadController && !opts.alreadyClearedThisSession && !opts.recentChunkRecovery
}
