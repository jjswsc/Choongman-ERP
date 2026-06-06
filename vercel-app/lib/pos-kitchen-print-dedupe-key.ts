function toIntId(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function buildKitchenJobCreateDedupeKey(orderIdRaw: unknown): string {
  const orderId = toIntId(orderIdRaw)
  if (!orderId) return ''
  return `order:${orderId}:kitchen:create`
}

/** Grab·API 유입 배달 주문 — webhook enqueue / 터미널 자동인쇄 dedupe */
export function buildKitchenJobInboundDedupeKey(orderIdRaw: unknown): string {
  const orderId = toIntId(orderIdRaw)
  if (!orderId) return ''
  return `order:${orderId}:kitchen:inbound`
}

export function buildKitchenJobStatusDedupeKey(orderIdRaw: unknown, statusRaw: unknown): string {
  const orderId = toIntId(orderIdRaw)
  if (!orderId) return ''
  const status = String(statusRaw ?? '').trim().toLowerCase() || 'unknown'
  return `order:${orderId}:kitchen:status:${status}`
}
