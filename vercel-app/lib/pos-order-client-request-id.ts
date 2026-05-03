/** POS savePosOrder 멱등용 — 한 번의 사용자 제출마다 하나만 생성 */
export function newPosOrderClientRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `pos-${crypto.randomUUID()}`
    }
  } catch {
    /* ignore */
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
