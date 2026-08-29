/**
 * Chrome은 백그라운드 탭의 메인 스레드 타이머를 늦춘다.
 * Screen Wake Lock은 탭이 숨으면 풀린다.
 *
 * - Wake Lock: 화면이 보일 때 절전만 막음
 * - Web Worker: 숨은 탭에서도 짧은 주기로 연산해 프로세스 우선순위·스로틀을 완화
 * - 소리는 쓰지 않음 (스피커 아이콘·잡음 없음)
 */

type WakeLockSentinelLike = { release: () => Promise<void> }

export type PurchaseTaxScanKeepAlive = {
  stop: () => void
}

let runningCount = 0
const runningListeners = new Set<(running: boolean) => void>()
const foregroundListeners = new Set<() => void>()
const LONG_HIDDEN_MS = 3_000

function setScanRunning(delta: 1 | -1) {
  const prev = runningCount > 0
  runningCount = Math.max(0, runningCount + delta)
  const next = runningCount > 0
  if (prev === next) return
  for (const fn of runningListeners) fn(next)
}

export function isPurchaseTaxScanRunning(): boolean {
  return runningCount > 0
}

export function subscribePurchaseTaxScanRunning(fn: (running: boolean) => void): () => void {
  runningListeners.add(fn)
  return () => {
    runningListeners.delete(fn)
  }
}

/** 오래 숨었다가 다시 보이면 호출. 얼어 죽은 OCR 워커를 갈아끼울 때 쓴다. */
export function subscribePurchaseTaxScanForeground(fn: () => void): () => void {
  foregroundListeners.add(fn)
  return () => {
    foregroundListeners.delete(fn)
  }
}

const WORKER_SRC = `
self.onmessage = function (e) {
  if (e.data === 'stop') {
    self.close()
    return
  }
}
setInterval(function () {
  var n = 0
  for (var i = 0; i < 8000; i++) n += i
  try { self.postMessage(n) } catch (err) {}
}, 250)
`

export function startPurchaseTaxScanKeepAlive(): PurchaseTaxScanKeepAlive {
  setScanRunning(1)
  if (typeof window === 'undefined') {
    let stopped = false
    return {
      stop: () => {
        if (stopped) return
        stopped = true
        setScanRunning(-1)
      },
    }
  }

  const cleanups: Array<() => void> = []
  let wake: WakeLockSentinelLike | null = null
  let worker: Worker | null = null
  let stopped = false
  let hiddenAt = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? Date.now() : 0

  const requestWake = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }
      wake = (await nav.wakeLock?.request('screen')) || null
    } catch {
      wake = null
    }
  }

  const startWorker = () => {
    if (worker || typeof Worker === 'undefined' || typeof Blob === 'undefined') return
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
      worker = new Worker(url)
      URL.revokeObjectURL(url)
      worker.onerror = () => {
        try {
          worker?.terminate()
        } catch {
          /* ignore */
        }
        worker = null
      }
    } catch {
      worker = null
    }
  }

  void requestWake()
  startWorker()

  const tick = window.setInterval(() => {
    void requestWake()
    if (!worker) startWorker()
  }, 4000)
  cleanups.push(() => window.clearInterval(tick))

  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const slept = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = 0
    void requestWake()
    if (!worker) startWorker()
    if (slept >= LONG_HIDDEN_MS) {
      for (const fn of foregroundListeners) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
    }
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onVis)
  window.addEventListener('pageshow', onVis)
  window.addEventListener('resume', onVis)
  cleanups.push(() => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onVis)
    window.removeEventListener('pageshow', onVis)
    window.removeEventListener('resume', onVis)
  })

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
      try {
        worker?.postMessage('stop')
        worker?.terminate()
      } catch {
        /* ignore */
      }
      worker = null
      void wake?.release()
      wake = null
      setScanRunning(-1)
    },
  }
}
