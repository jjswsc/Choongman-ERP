import { isBankAccountOfficeStore } from '@/lib/bank-account-display'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** POS 자동분개 매장 입금 — revenue_* 는 4110 이중 위험 (채널 세부 계정 예외 없음) */
export const POS_REVENUE_DEPOSIT_CATEGORIES = [
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
] as const

/**
 * POS 카드·배달·QR 정산 입금 적요 — 1130 소거용(receivable_receive 분개)이며
 * 본사 B2B 미수금(보조원장 Receive)과는 별개.
 * @see docs/ACCOUNTING_LEDGER_SOP.md §2–3
 */
export const POS_CHANNEL_SETTLEMENT_MEMO_RE =
  /\b(grabfood|grabtaxi|grab|line\s*pay|linepay|line\s*man|lineman|shopeefood|shopee|shopeepay|food\s*panda|foodpanda|robinhood|delivery|배달|visa|master|mastercard|unionpay|jcb|edc|card|credit|카드|บัตร|qr|promptpay|truemoney|พร้อมเพย์|판매대금|qr결제|store sales?\s*qr)\b/i

export function isPosChannelSettlementMemo(
  ...texts: Array<string | undefined | null>
): boolean {
  return texts.some((text) => {
    const s = String(text || '').trim()
    if (!s) return false
    if (POS_CHANNEL_SETTLEMENT_MEMO_RE.test(s)) return true
    return /บัตรเครดิต|พร้อมเพย์|คิวอาร์/.test(s)
  })
}

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

/** 통장 입금 용도 드롭다운 (배달앱·카드·QR·현금 포함). POS 매장 저장 가드는 API에서 유지 */
export const BANK_DEPOSIT_UI_CATEGORIES = [
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
  'receivable_receive',
  'loan_borrow',
  'advance',
  'unclassified',
  'correction',
] as const

/** POS 매장 통장: revenue_* 숨김. 이미 그 값인 옛 줄만 선택지에 남김 */
export function shouldShowPosRevenueDepositSelectOption(params: {
  hideForPosStore: boolean
  currentCategory?: string | null
  option: string
}): boolean {
  if (!isPosRevenueDepositCategory(params.option)) return true
  if (!params.hideForPosStore) return true
  return String(params.currentCategory || '').trim().toLowerCase() === String(params.option).toLowerCase()
}

export function filterBankDepositUiCategories(params: {
  hidePosRevenue: boolean
  currentCategory?: string | null
}): string[] {
  return BANK_DEPOSIT_UI_CATEGORIES.filter((option) =>
    shouldShowPosRevenueDepositSelectOption({
      hideForPosStore: params.hidePosRevenue,
      currentCategory: params.currentCategory,
      option,
    })
  )
}

/**
 * POS 매장 통장 조회: 옛 revenue_* 줄에 메모·저장할 때 매출 수령으로 맞춤.
 * 칩(Grab Sales 등)은 분류가 아니라 상세라서, 저장 시 분류를 같이 바꿔야 이중 매출 가드에 안 막힌다.
 */
export function posStoreLegacyRevenueSavePatch(params: {
  transType?: string | null
  hidePosRevenue: boolean
  category: string
  storeName?: string | null
  accountStore?: string | null
}): { category: 'receivable_receive'; storeName?: string } | null {
  if (String(params.transType || '').toLowerCase() !== 'deposit') return null
  if (!params.hidePosRevenue) return null
  if (!isPosRevenueDepositCategory(params.category)) return null
  const store = String(params.storeName || params.accountStore || '').trim()
  return store
    ? { category: 'receivable_receive', storeName: store }
    : { category: 'receivable_receive' }
}

/** 본사 통장은 제외. POS 터미널 매장 목록과 계좌 매장이 같으면 revenue_* 숨김 */
export function isPosStoreBankAccount(
  accountStore: string | null | undefined,
  posStoreCodes: readonly string[]
): boolean {
  const store = String(accountStore || '').trim()
  if (!store || isBankAccountOfficeStore(store)) return false
  return posStoreCodes.some((code) => storesMatchForGradeLookup(code, store))
}

export function isChannelRevenueAccountCode(code: string | undefined | null): boolean {
  const c = String(code || '').trim()
  return CHANNEL_REVENUE_GL_CODES.has(c)
}

/**
 * POS 매장 통장 일괄 가져오기: revenue_* 는 매출(4110) 이중 위험 → 매출 수령으로 통일.
 * 채널 세부 계정(4111·4120)이어도 예외 없음 — POS 자동분개가 이미 4110을 올림.
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
  void params.accountSubjectId
  void params.revenueSubjects
  return { category: 'receivable_receive', storeName: store }
}

/** 오프라인 큐에 넣어도 재시도해도 성공하지 않는 통장 API 거절 메시지 */
export function isNonRetryableBankBusinessErrorMessage(message: string | undefined | null): boolean {
  const m = String(message || '')
  if (!m) return false
  return (
    m.includes('이중 인식') ||
    m.includes('POS_REVENUE_DEPOSIT_DOUBLE_RISK') ||
    m.includes('BANK_REVENUE_DEPOSIT_STORE_REQUIRED') ||
    m.includes('매장 없이 revenue_') ||
    (m.includes('receivable_receive') && m.includes('채널 정산')) ||
    (m.includes('매출 수령') && m.includes('revenue_'))
  )
}
