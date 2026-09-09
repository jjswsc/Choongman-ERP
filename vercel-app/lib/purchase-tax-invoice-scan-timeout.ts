/**
 * 페이지 OCR 제한시간. 숨은 탭에서도 그대로 센다.
 * (숨은 동안 시계를 멈추면, Chrome이 OCR을 멈춰 둔 장이 제한에도 안 걸리고 영구 대기가 된다.)
 */
export function withVisibleScanTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (typeof window === "undefined") return p
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error("ptiOcrPageTimeout"))
    }, Math.max(1, ms))
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      fn()
    }
    p.then(
      (v) => done(() => resolve(v)),
      (e) => done(() => reject(e))
    )
  })
}
