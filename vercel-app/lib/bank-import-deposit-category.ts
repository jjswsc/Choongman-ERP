/** POS 자동분개 매장 입금 — revenue_* 는 4110 이중 위험, CSV·일괄 저장은 매출 수령으로 통일 */
export const POS_REVENUE_DEPOSIT_CATEGORIES = [
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
] as const

export type PosRevenueDepositCategory = (typeof POS_REVENUE_DEPOSIT_CATEGORIES)[number]

export function isPosRevenueDepositCategory(category: string | undefined | null): boolean {
  const c = String(category || '').trim().toLowerCase()
  return (POS_REVENUE_DEPOSIT_CATEGORIES as readonly string[]).includes(c)
}

/**
 * Statement 일괄 저장: 입금이 revenue_* 이면 매출 수령 + 매장명으로 정규화(서버 정책과 동일).
 */
export function normalizeBulkImportDepositCategory(params: {
  category: string
  storeName?: string
  accountStore?: string
}): { category: string; storeName?: string } {
  const cat = String(params.category || '').trim().toLowerCase()
  if (!isPosRevenueDepositCategory(cat)) {
    return { category: cat, storeName: params.storeName }
  }
  const store = String(params.storeName || params.accountStore || '').trim() || undefined
  return { category: 'receivable_receive', storeName: store }
}

/** 오프라인 큐에 넣어도 재시도해도 성공하지 않는 통장 API 거절 메시지 */
export function isNonRetryableBankBusinessErrorMessage(message: string | undefined | null): boolean {
  const m = String(message || '')
  if (!m) return false
  return (
    m.includes('이중 인식') ||
    m.includes('POS_REVENUE_DEPOSIT_DOUBLE_RISK') ||
    (m.includes('receivable_receive') && m.includes('채널 정산')) ||
    (m.includes('매출 수령') && m.includes('revenue_'))
  )
}
