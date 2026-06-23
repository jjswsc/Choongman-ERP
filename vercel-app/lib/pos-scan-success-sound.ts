/** POS 바코드·QR 스캔 인식 확인음 (짧은 단음 — WebAudio, 브라우저 autoplay 실패 시 무시) */
export function playPosScanRecognizedBeep(): void {
  if (typeof window === 'undefined') return
  try {
    const AC =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1240, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.11)
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 180)
  } catch {
    // ignore (no audio device / blocked by browser policy)
  }
}
