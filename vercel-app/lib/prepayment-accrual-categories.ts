/** 지급예정만 등록하고 통장 연동 시 전도금(1160) 분개가 나가는 유형 */
export const PREPAYMENT_ACCRUAL_CATEGORIES = new Set(['transfer_to_petty', 'bank_card_bill'])

export function isPrepaymentAccrualCategory(category: string | undefined | null): boolean {
  return PREPAYMENT_ACCRUAL_CATEGORIES.has(String(category || '').trim().toLowerCase())
}

const CARD_PAYEE_PREFIX = 'card_'

/** 지급예정 payee_code에 저장된 카드 계정 ID (card_123) */
export function parseCardAccountIdFromPayeeCode(payeeCode: string | undefined | null): number | null {
  const raw = String(payeeCode || '').trim().split('::wm::')[0]?.trim() || ''
  if (!raw.toLowerCase().startsWith(CARD_PAYEE_PREFIX)) return null
  const id = Number(raw.slice(CARD_PAYEE_PREFIX.length))
  return Number.isFinite(id) && id > 0 ? id : null
}

export function encodeCardPayeeCode(cardAccountId: number): string {
  return `${CARD_PAYEE_PREFIX}${Math.floor(Number(cardAccountId) || 0)}`
}
