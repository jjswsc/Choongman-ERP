let WAV_CACHE = ''
let lastPlayAt = 0

const DEDUPE_MS = 2500
const DURATION_SEC = 2.35

function mixNote(
  pcm: Int16Array,
  sampleRate: number,
  startSec: number,
  lenSec: number,
  freqHz: number,
  gain: number
) {
  const start = Math.max(0, Math.floor(startSec * sampleRate))
  const end = Math.min(pcm.length, Math.floor((startSec + lenSec) * sampleRate))
  const attack = Math.floor(sampleRate * 0.01)
  const release = Math.floor(sampleRate * 0.1)
  for (let i = start; i < end; i += 1) {
    const t = (i - start) / sampleRate
    const idx = i - start
    const tail = end - i
    const envA = attack > 0 ? Math.min(1, idx / attack) : 1
    const envR = release > 0 ? Math.min(1, tail / release) : 1
    const env = Math.min(envA, envR)
    const fund = Math.sin(2 * Math.PI * freqHz * t)
    const harm = Math.sin(4 * Math.PI * freqHz * t)
    const v = (fund * 0.72 + harm * 0.28) * gain * env
    const next = pcm[i] + Math.floor(v * 32767)
    pcm[i] = Math.max(-32768, Math.min(32767, next))
  }
}

/** 원격 QR/카운터 결제 완료 — 신규 주문음과 구분되는 긴·큰 캐셔 멜로디 (~2.3초) */
export function getPosPaymentCompleteWavDataUri(): string {
  if (WAV_CACHE) return WAV_CACHE
  const sampleRate = 22050
  const totalSamples = Math.max(1, Math.floor(sampleRate * DURATION_SEC))
  const pcm = new Int16Array(totalSamples)

  // 카시어 벨 느낌: 낮은→높은 3연타 + 여운 (멀리서도 구분)
  mixNote(pcm, sampleRate, 0.0, 0.22, 523, 0.34)
  mixNote(pcm, sampleRate, 0.24, 0.22, 659, 0.36)
  mixNote(pcm, sampleRate, 0.48, 0.28, 784, 0.38)
  mixNote(pcm, sampleRate, 0.9, 0.2, 1046, 0.32)
  mixNote(pcm, sampleRate, 1.2, 0.22, 784, 0.34)
  mixNote(pcm, sampleRate, 1.5, 0.22, 988, 0.36)
  mixNote(pcm, sampleRate, 1.8, 0.4, 1174, 0.4)

  const dataSize = pcm.length * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(44 + i * 2, pcm[i], true)
  }

  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...part)
  }
  WAV_CACHE = `data:audio/wav;base64,${btoa(binary)}`
  return WAV_CACHE
}

/** QR 테이블·원격 결제 완료 알림 (신규 주문 비프와 다른 톤) */
export function playPosPaymentCompleteBeep(): void {
  if (typeof window === 'undefined') return
  const now = Date.now()
  if (now - lastPlayAt < DEDUPE_MS) return
  lastPlayAt = now

  const playFallbackWithWebAudio = () => {
    try {
      const AC = (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
        | typeof AudioContext
        | undefined
      if (!AC) return
      const ctx = new AC()
      const t0 = ctx.currentTime
      const makeTone = (at: number, freq: number, dur: number, gainMax: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, at)
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(gainMax, at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(at)
        osc.stop(at + dur + 0.02)
      }
      makeTone(t0, 523, 0.16, 0.07)
      makeTone(t0 + 0.2, 659, 0.16, 0.075)
      makeTone(t0 + 0.4, 784, 0.2, 0.08)
      makeTone(t0 + 0.75, 1046, 0.18, 0.07)
      makeTone(t0 + 1.05, 1174, 0.35, 0.085)
      window.setTimeout(() => {
        void ctx.close().catch(() => {})
      }, 1600)
    } catch {
      /* ignore */
    }
  }

  try {
    const audio = new Audio(getPosPaymentCompleteWavDataUri())
    audio.preload = 'auto'
    audio.volume = 1
    const p = audio.play()
    if (p && typeof p.catch === 'function') {
      void p.catch(() => playFallbackWithWebAudio())
    }
    return
  } catch {
    /* fall through */
  }
  playFallbackWithWebAudio()
}
