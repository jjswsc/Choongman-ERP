/** 출고 이력 배송상태 → วางบิล/ใบกำกับ 가능 여부. UI·e-Tax 공통. */

export type NormalizedOutboundDeliveryStatus = '배송완료' | '일부배송완료' | '배송중' | ''

export function normalizeOutboundDeliveryStatus(
  raw: string | undefined | null
): NormalizedOutboundDeliveryStatus {
  const v = String(raw || '').trim()
  if (!v) return ''
  const compact = v.replace(/\s+/g, '')
  if (compact.includes('일부') || /partial/i.test(v) || v.includes('บางส่วน')) return '일부배송완료'
  if (
    compact.includes('배송완료') ||
    /delivered/i.test(v) ||
    compact.includes('수령완료') ||
    compact.includes('수령') ||
    v.includes('จัดส่งแล้ว')
  ) {
    return '배송완료'
  }
  if (compact.includes('배송중') || /transit/i.test(v) || v.includes('กำลังจัดส่ง')) return '배송중'
  return ''
}

function isForceOutboundType(type: string | undefined | null): boolean {
  const t = String(type || '').trim()
  return t === 'Force' || t === 'ForceOutbound'
}

/**
 * ใบกำกับ / e-Tax / วางบิล 대상.
 * - 주문: 배송완료·일부배송완료만 (กำลังจัดส่ง 제외)
 * - 강제출고: 실제 출고 로그가 있고 배송중이 아니면 가능 (수령 클릭 전 IVF 유지)
 */
export function isOutboundBillableForInvoice(opts: {
  type?: string | null
  deliveryStatus?: string | null
}): boolean {
  const n = normalizeOutboundDeliveryStatus(opts.deliveryStatus)
  if (n === '배송중') return false
  if (n === '배송완료' || n === '일부배송완료') return true
  return isForceOutboundType(opts.type)
}

export function partitionOutboundInvoiceGroups<
  T extends { type?: string; items?: { deliveryStatus?: string | null }[] },
>(groups: T[]): { billable: T[]; skipped: T[] } {
  const billable: T[] = []
  const skipped: T[] = []
  for (const g of groups) {
    const ds = g.items?.[0]?.deliveryStatus
    if (isOutboundBillableForInvoice({ type: g.type, deliveryStatus: ds })) billable.push(g)
    else skipped.push(g)
  }
  return { billable, skipped }
}
