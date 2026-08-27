/**
 * Chrome은 백그라운드 탭의 타이머·워커를 멈추거나 탭을 버림.
 * 거의 무음 재생이면 “소리 나는 탭”으로 봐서 스캔 루프가 이어짐.
 */

type WakeLockSentinelLike = { release: () => Promise<void> }

export type PurchaseTaxScanKeepAlive = {
  stop: () => void
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

export function startPurchaseTaxScanKeepAlive(): PurchaseTaxScanKeepAlive {
  if (typeof window === 'undefined') return { stop: () => undefined }

  const cleanups: Array<() => void> = []
  let ctx: AudioContext | null = null
  let wake: WakeLockSentinelLike | null = null

  const requestWake = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }
      wake = (await nav.wakeLock?.request('screen')) || null
    } catch {
      wake = null
    }
  }

  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      ctx = new AC()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0.00001
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      void ctx.resume()
      cleanups.push(() => {
        try {
          osc.stop()
        } catch {
          /* already stopped */
        }
        void ctx?.close()
      })
    }
  } catch {
    ctx = null
  }

  const audio = new Audio(SILENT_WAV)
  audio.loop = true
  audio.volume = 0.001
  void audio.play().catch(() => undefined)
  cleanups.push(() => {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  })

  void requestWake()

  const onVis = () => {
    if (document.hidden) return
    void ctx?.resume()
    void audio.play().catch(() => undefined)
    void requestWake()
  }
  document.addEventListener('visibilitychange', onVis)
  cleanups.push(() => document.removeEventListener('visibilitychange', onVis))

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
