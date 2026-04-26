/**
 * Grab Order Dashboard 스타일 배송 단계(6단계)와 Grab state 문자열 매핑.
 * POS 주문 상태(cooking/ready 등)와 별도로, 웹훅으로 들어온 Grab state를 표시용으로만 사용한다.
 */

const STAGE_GROUPS: readonly (readonly string[])[] = [
  ['SUBMITTED', 'PENDING', 'PENDING_MERCHANT_CONFIRMATION', 'WAITING_FOR_CONFIRMATION', 'WAIT_MERCHANT'],
  ['ACCEPTED', 'MERCHANT_ACCEPTED'],
  ['DRIVER_ALLOCATED', 'ALLOCATED'],
  ['DRIVER_ARRIVED', 'ARRIVED'],
  ['COLLECTED', 'PICKED_UP'],
  ['DELIVERED', 'COMPLETED', 'BILL_PAID'],
] as const

/** 0..5 단계 인덱스. 알 수 없는 상태는 0. 취소/환불 계열은 -1 */
export function grabStateToStageIndex(state: string | null | undefined): number {
  const s = String(state || '').trim().toUpperCase()
  if (!s) return 0
  if (s === 'CANCELLED' || s === 'FAILED' || s === 'REFUNDED') return -1
  for (let i = STAGE_GROUPS.length - 1; i >= 0; i--) {
    const group = STAGE_GROUPS[i]!
    if (group.some((k) => s === k || s.startsWith(`${k}_`))) return i
  }
  if (s.includes('DELIVER')) return 5
  if (s.includes('COLLECT') || s.includes('PICKED')) return 4
  if (s.includes('ARRIV')) return 3
  if (s.includes('ALLOC')) return 2
  if (s.includes('ACCEPT')) return 1
  return 0
}

export const GRAB_DELIVERY_PROGRESS_STAGE_COUNT = STAGE_GROUPS.length
