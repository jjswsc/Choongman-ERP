export type PosHealthAlertEventType =
  | 'hybrid_print_mapping_mismatch'
  | 'offline_dead_letter_detected'

export async function sendPosHealthAlert(params: {
  eventType: PosHealthAlertEventType
  payload: Record<string, unknown>
}): Promise<void> {
  if (typeof window === 'undefined') return
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 1500)
  try {
    await fetch('/api/ops/pos-health-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: params.eventType,
        payload: params.payload || {},
      }),
      keepalive: true,
      credentials: 'include',
      signal: ctrl.signal,
    })
  } catch {
    // no-op: health alert should never break POS flow
  } finally {
    window.clearTimeout(timer)
  }
}
