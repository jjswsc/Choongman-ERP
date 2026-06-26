/** POS USB 스캔 성공·실패 피드백 (WebAudio — autoplay 차단 시 무시) */

export const POS_SCAN_FIELD_FLASH_MS = 900
export const POS_SCAN_IDLE_REFOCUS_MS = 20_000
export const POS_SCAN_BEEP_DEBOUNCE_MS = 350
/** USB 웨지 스캔: 마지막 키 이후 이 시간이 지나면 스캔 완료로 본다 (issueId 꼬리 필드 대기) */
export const POS_SCAN_IDLE_SUBMIT_MS = 150

type MutableRef<T> = { current: T }

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return AC ? new AC() : null
}

function playTone(params: {
  frequency: number
  durationSec: number
  peakGain: number
  type?: OscillatorType
  startOffsetSec?: number
}) {
  const ctx = createAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime + (params.startOffsetSec ?? 0)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = params.type ?? 'sine'
    osc.frequency.setValueAtTime(params.frequency, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(params.peakGain, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + params.durationSec)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + params.durationSec + 0.02)
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, Math.ceil((params.durationSec + 0.05) * 1000))
  } catch {
    // ignore
  }
}

export function playPosScanRecognizedBeep(): void {
  playTone({ frequency: 1240, durationSec: 0.1, peakGain: 0.075 })
}

export function playPosScanFailedBeep(): void {
  playTone({ frequency: 320, durationSec: 0.14, peakGain: 0.09, type: 'square' })
  playTone({ frequency: 240, durationSec: 0.16, peakGain: 0.07, type: 'square', startOffsetSec: 0.16 })
}

export function playPosScanBeep(
  outcome: 'success' | 'error',
  debounceRef?: MutableRef<number>
): void {
  const now = Date.now()
  if (debounceRef && now - debounceRef.current <= POS_SCAN_BEEP_DEBOUNCE_MS) return
  if (debounceRef) debounceRef.current = now
  if (outcome === 'success') playPosScanRecognizedBeep()
  else playPosScanFailedBeep()
}

export type PosScanFieldFlash = 'success' | 'error' | null

export function posScanFieldFlashClass(flash: PosScanFieldFlash): string {
  if (flash === 'success') {
    return 'ring-2 ring-emerald-500/80 border-emerald-500 dark:ring-emerald-400/70'
  }
  if (flash === 'error') {
    return 'ring-2 ring-destructive/90 border-destructive animate-pulse'
  }
  return ''
}
