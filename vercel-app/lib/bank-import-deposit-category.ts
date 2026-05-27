/** POS 자동분개 매장 입금 — revenue_* 는 4110 이중 위험(단, 채널 세부 계정 4111·4120 등은 예외) */
export const POS_REVENUE_DEPOSIT_CATEGORIES = [
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
] as const

/** suggest-deposit-from-memo·적요 규칙과 동일 — 통장 UI·가드에서 채널별 매출 계정 */
export const CHANNEL_REVENUE_GL_CODES = new Set([
  '4111',
  '4112',
  '4113',
  '4114',
  '4115',
  '4120',
  '4121',
  '4122',
  '4123',
  '4124',
  '4130',
  '4140',
])

export type PosRevenueDepositCategory = (typeof POS_REVENUE_DEPOSIT_CATEGORIES)[number]

export function isPosRevenueDepositCategory(category: string | undefined | null): boolean {
  const c = String(category || '').trim().toLowerCase()
  return (POS_REVENUE_DEPOSIT_CATEGORIES as readonly string[]).includes(c)
}

export function isChannelRevenueAccountCode(code: string | undefined | null): boolean {
  const c = String(code || '').trim()
  return CHANNEL_REVENUE_GL_CODES.has(c)
}

/**
 * POS 매장 통장 일괄 가져오기: revenue_* 는 매출(4110) 이중 위험 → 매출 수령으로 통일.
 * 채널 세부 계정(4111·4120 등)이면 revenue_* 유지(서버 가드와 동일).
 */
export function coercePosStoreImportDepositCategory(params: {
  category: string
  accountStore?: string
  accountSubjectId?: string | number | null
  revenueSubjects?: { id?: number; code?: string }[]
}): { category: string; storeName?: string } {
  const cat = String(params.category || '').trim().toLowerCase() || 'receivable_receive'
  const store = String(params.accountStore || '').trim()
  if (!store || !isPosRevenueDepositCategory(cat)) {
    return { category: cat }
  }
  const asid = params.accountSubjectId
  if (asid != null && asid !== '' && asid !== '__none__' && params.revenueSubjects?.length) {
    const subj = params.revenueSubjects.find((s) => String(s.id) === String(asid))
    if (subj && isChannelRevenueAccountCode(subj.code)) {
      return { category: cat }
    }
  }
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
