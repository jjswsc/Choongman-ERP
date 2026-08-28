/**
 * Chrome은 백그라운드 탭의 타이머·워커를 멈추거나 탭을 버림.
 * 무음 WAV는 “소리 없음”으로 봐서 멈춘다. 18kHz 약한 톤이면 탭이 audible로 유지된다.
 */

type WakeLockSentinelLike = { release: () => Promise<void> }

export type PurchaseTaxScanKeepAlive = {
  stop: () => void
}

function makeHighFreqToneWav(): string {
  const sampleRate = 22050
  const n = Math.floor(sampleRate * 0.35)
  const freq = 18000
  const amp = 1600
  const dataSize = n * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < n; i += 1) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp), true)
  }
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:audio/wav;base64,${btoa(binary)}`
}

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
      osc.frequency.value = 18000
      gain.gain.value = 0.012
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

  const audio = new Audio(makeHighFreqToneWav())
  audio.loop = true
  audio.volume = 0.04
  void audio.play().catch(() => undefined)
  cleanups.push(() => {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  })

  void requestWake()

  const pump = () => {
    void ctx?.resume()
    if (audio.paused) void audio.play().catch(() => undefined)
    void requestWake()
  }
  const tick = window.setInterval(pump, 4000)
  cleanups.push(() => window.clearInterval(tick))

  const onVis = () => {
    pump()
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
