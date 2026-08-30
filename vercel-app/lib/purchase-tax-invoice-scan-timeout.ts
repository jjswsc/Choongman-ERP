/** 숨은 탭의 메인 타이머는 미뤄지므로, 숨은 동안은 제한시간을 세지 않는다. 돌아와서는 남은 시간을 그대로 이어서 센다. */
export function withVisibleScanTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (typeof window === "undefined") return p
  return new Promise((resolve, reject) => {
    let remaining = Math.max(1, ms)
    let startedAt = 0
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
    }

    const resume = () => {
      if (settled || timer != null) return
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
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
    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      resume()
    }
  })
}
