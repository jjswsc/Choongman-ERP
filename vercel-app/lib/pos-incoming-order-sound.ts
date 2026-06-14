let POS_INCOMING_WAV_DATA_URI_CACHE = ''

/** 매장 신규 주문 알림 WAV data URI (브라우저 재생용) */
export function getPosIncomingWavDataUri(): string {
  if (POS_INCOMING_WAV_DATA_URI_CACHE) return POS_INCOMING_WAV_DATA_URI_CACHE
  const sampleRate = 22050
  const durationSec = 0.62
  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSec))
  const pcm = new Int16Array(totalSamples)

  const mixNote = (startSec: number, lenSec: number, freqHz: number, gain: number) => {
    const start = Math.max(0, Math.floor(startSec * sampleRate))
    const end = Math.min(totalSamples, Math.floor((startSec + lenSec) * sampleRate))
    const attack = Math.floor(sampleRate * 0.018)
    const release = Math.floor(sampleRate * 0.08)
    for (let i = start; i < end; i += 1) {
      const t = (i - start) / sampleRate
      const idx = i - start
      const tail = end - i
      const envA = attack > 0 ? Math.min(1, idx / attack) : 1
      const envR = release > 0 ? Math.min(1, tail / release) : 1
      const env = Math.min(envA, envR)
      const v = Math.sin(2 * Math.PI * freqHz * t) * gain * env
      const next = pcm[i] + Math.floor(v * 32767)
      pcm[i] = Math.max(-32768, Math.min(32767, next))
    }
  }

  mixNote(0.0, 0.16, 784, 0.24)
  mixNote(0.17, 0.16, 988, 0.22)
  mixNote(0.34, 0.2, 1174, 0.24)

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
  POS_INCOMING_WAV_DATA_URI_CACHE = `data:audio/wav;base64,${btoa(binary)}`
  return POS_INCOMING_WAV_DATA_URI_CACHE
}
