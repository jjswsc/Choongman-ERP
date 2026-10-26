/**
 * 결산 마감 시 미결제 홀 차단 · 익일(overnight) 결제 확인용 순수 헬퍼.
 */

export const UNPAID_HALL_OVERRIDE_REASON_MIN = 8

export type UnpaidHallOrderSummary = {
  id: number
  orderNo: string
  tableName: string
  total: number
  status: string
  createdAt: string
}

export function isValidUnpaidHallOverrideReason(raw: string | null | undefined): boolean {
  return String(raw ?? '').trim().length >= UNPAID_HALL_OVERRIDE_REASON_MIN
}

/** created/pay 영업일(YYYY-MM-DD) — 오픈일이 결제일보다 이전이면 overnight */
export function isOvernightBusinessPayment(createdBusinessYmd: string, payBusinessYmd: string): boolean {
  const c = String(createdBusinessYmd ?? '').trim().slice(0, 10)
  const p = String(payBusinessYmd ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c) || !/^\d{4}-\d{2}-\d{2}$/.test(p)) return false
  return c < p
}

export function formatUnpaidHallOverrideMemoSuffix(params: {
  reason: string
  actorName?: string | null
  orderCount: number
  atIso?: string
}): string {
  const reason = String(params.reason ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
  const actor = String(params.actorName ?? '').trim().slice(0, 80)
  const at = String(params.atIso ?? new Date().toISOString())
  const n = Math.max(0, Math.floor(Number(params.orderCount) || 0))
  return `[unpaid_hall_override n=${n} by=${actor || '-'} at=${at}] ${reason}`
}
