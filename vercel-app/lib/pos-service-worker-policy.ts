/** Windows Electron은 HTTP 캐시·offline.html이 있어 SW와 겹치면 배포 직후 청크가 섞인다. */
export const HYBRID_SW_CLEARED_SESSION_KEY = "cm-erp-hybrid-sw-cleared"

/**
 * Windows 하이브리드도 SW를 등록한다.
 * 인터넷이 끊기면 Electron HTTP 캐시만으로는 JS 청크·로그인 HTML이 비어 흰 화면이 된다.
 * 배포 직후 섞임은 CacheFirst(해시 JS) + 오프라인일 때 캐시 비우기 금지로 막는다.
 */
export function shouldRegisterPosServiceWorker(opts: {
  isProduction: boolean
  isHybridShell?: boolean
}): boolean {
  return opts.isProduction === true
}

export function shouldReloadAfterHybridSwUnregister(opts: {
  hadController: boolean
  alreadyClearedThisSession: boolean
  recentChunkRecovery: boolean
}): boolean {
  return opts.hadController && !opts.alreadyClearedThisSession && !opts.recentChunkRecovery
}
