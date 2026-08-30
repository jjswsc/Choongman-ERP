let WAV_CACHE = ''
let lastPlayKey = ''
let lastPlayAt = 0

const DEDUPE_MS = 4000
const DURATION_SEC = 2.6

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
  const attack = Math.floor(sampleRate * 0.012)
  const release = Math.floor(sampleRate * 0.09)
  for (let i = start; i < end; i += 1) {
    const t = (i - start) / sampleRate
    const idx = i - start
    const tail = end - i
    const envA = attack > 0 ? Math.min(1, idx / attack) : 1
    const envR = release > 0 ? Math.min(1, tail / release) : 1
    const env = Math.min(envA, envR)
    const fund = Math.sin(2 * Math.PI * freqHz * t)
    const harm = Math.sin(4 * Math.PI * freqHz * t)
    const v = (fund * 0.78 + harm * 0.22) * gain * env
    const next = pcm[i] + Math.floor(v * 32767)
    pcm[i] = Math.max(-32768, Math.min(32767, next))
  }
}

/** 손님 호출 알림 WAV (~2.6초 벨 멜로디) */
export function getQrStaffCallWavDataUri(): string {
  if (WAV_CACHE) return WAV_CACHE
  const sampleRate = 22050
  const totalSamples = Math.max(1, Math.floor(sampleRate * DURATION_SEC))
  const pcm = new Int16Array(totalSamples)

  // ding-dong · ding-dong · 상승 종소리 · ding-dong (주방에서도 구분되게)
  mixNote(pcm, sampleRate, 0.0, 0.22, 1047, 0.5)
  mixNote(pcm, sampleRate, 0.2, 0.28, 784, 0.46)
  mixNote(pcm, sampleRate, 0.58, 0.22, 1047, 0.5)
  mixNote(pcm, sampleRate, 0.78, 0.28, 784, 0.46)
  mixNote(pcm, sampleRate, 1.18, 0.18, 880, 0.48)
  mixNote(pcm, sampleRate, 1.34, 0.18, 1047, 0.5)
  mixNote(pcm, sampleRate, 1.5, 0.2, 1319, 0.52)
  mixNote(pcm, sampleRate, 1.7, 0.42, 1568, 0.5)
  mixNote(pcm, sampleRate, 2.18, 0.18, 1047, 0.48)
  mixNote(pcm, sampleRate, 2.34, 0.24, 784, 0.46)

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

function playFallbackWithWebAudio() {
  try {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined
    if (!AC) return
    const ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const tone = (at: number, freq: number, dur: number, gainMax: number) => {
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
      osc.stop(at + dur + 0.03)
    }
    tone(now, 1047, 0.2, 0.28)
    tone(now + 0.2, 784, 0.26, 0.26)
    tone(now + 0.58, 1047, 0.2, 0.28)
    tone(now + 0.78, 784, 0.26, 0.26)
    tone(now + 1.18, 880, 0.16, 0.26)
    tone(now + 1.34, 1047, 0.16, 0.28)
    tone(now + 1.5, 1319, 0.18, 0.3)
    tone(now + 1.7, 1568, 0.4, 0.28)
    tone(now + 2.18, 1047, 0.16, 0.26)
    tone(now + 2.34, 784, 0.22, 0.24)
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 2800)
  } catch {
    /* ignore */
  }
}

/** 손님 호출 멜로디. 같은 호출이 패널·홀 맵에서 겹치면 한 번만 재생. */
export function playQrStaffCallMelody(dedupeKey?: string): void {
  if (typeof window === 'undefined') return
  if (dedupeKey) {
    const now = Date.now()
    if (dedupeKey === lastPlayKey && now - lastPlayAt < DEDUPE_MS) return
    lastPlayKey = dedupeKey
    lastPlayAt = now
  }
  try {
    const audio = new Audio(getQrStaffCallWavDataUri())
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
