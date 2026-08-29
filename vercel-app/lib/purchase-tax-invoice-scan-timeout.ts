/** 탭이 숨은 동안은 제한시간을 멈추고, 오래 숨었다 돌아오면 짧은 유예만 준다. */
const RESUME_GRACE_MS = 12_000
const LONG_HIDDEN_MS = 3_000

export function withVisibleScanTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (typeof window === "undefined") return p
  return new Promise((resolve, reject) => {
    let remaining = Math.max(1, ms)
    let startedAt = 0
    let hiddenAt = 0
    let timer: number | undefined
    let settled = false

    const clearTimer = () => {
      if (timer == null) return
      window.clearTimeout(timer)
      timer = undefined
    }

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimer()
      document.removeEventListener("visibilitychange", onVis)
      fn()
    }

    const pause = () => {
      if (timer == null) return
      remaining = Math.max(1, remaining - (Date.now() - startedAt))
      clearTimer()
      hiddenAt = Date.now()
    }

    const resume = () => {
      if (settled || timer != null) return
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      if (hiddenAt && Date.now() - hiddenAt >= LONG_HIDDEN_MS) {
        remaining = Math.min(remaining, RESUME_GRACE_MS)
      }
      hiddenAt = 0
      startedAt = Date.now()
      timer = window.setTimeout(() => finish(() => reject(new Error("ptiOcrPageTimeout"))), remaining)
    }

    const onVis = () => {
      if (document.visibilityState === "hidden") pause()
      else resume()
    }

    document.addEventListener("visibilitychange", onVis)
    p.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e))
    )
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      hiddenAt = Date.now()
    } else {
      resume()
    }
  })
}
