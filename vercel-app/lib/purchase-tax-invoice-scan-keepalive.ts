/**
 * Chrome은 백그라운드 탭의 타이머를 느리게 하거나 멈춘다.
 * 예전에는 18kHz 톤으로 audible 탭을 유지했으나 스피커 아이콘·고주파 잡음이 나서
 * 쓰지 않는다. Screen Wake Lock + 주기적 재요청만으로 화면 절전만 막는다.
 */

type WakeLockSentinelLike = { release: () => Promise<void> }

export type PurchaseTaxScanKeepAlive = {
  stop: () => void
}

export function startPurchaseTaxScanKeepAlive(): PurchaseTaxScanKeepAlive {
  if (typeof window === 'undefined') return { stop: () => undefined }

  const cleanups: Array<() => void> = []
  let wake: WakeLockSentinelLike | null = null

  const requestWake = async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }
      wake = (await nav.wakeLock?.request('screen')) || null
    } catch {
      wake = null
    }
  }

  void requestWake()

  const tick = window.setInterval(() => {
    void requestWake()
  }, 4000)
  cleanups.push(() => window.clearInterval(tick))

  const onVis = () => {
    void requestWake()
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onVis)
  cleanups.push(() => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onVis)
  })

  return {
    stop: () => {
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
      void wake?.release()
      wake = null
    },
  }
}
