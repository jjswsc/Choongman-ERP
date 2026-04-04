/** POS 접속 등록 시 서버에 보내는 단말 식별 힌트 (pos_connected_devices.client_hint) */
export function buildPosClientHint(): string {
  if (typeof navigator === 'undefined') return ''
  try {
    const ua = String(navigator.userAgent || '').trim()
    const plat = String(navigator.platform || '').trim()
    const parts = [plat && plat !== 'Unknown' ? plat : '', ua].filter(Boolean)
    const s = parts.join(' · ')
    if (s.length <= 240) return s
    return `${s.slice(0, 237)}…`
  } catch {
    return ''
  }
}
