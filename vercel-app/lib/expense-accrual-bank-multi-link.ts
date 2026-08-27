import { isTaxSettlementWithdrawalCategory } from '@/lib/bank-transaction-note-meta'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'
import { isPrepaymentAccrualCategory } from '@/lib/prepayment-accrual-categories'

/** 한 통장 출금에 묶을 지급예정 상한 */
export const EXPENSE_BANK_MULTI_LINK_MAX = 20

export function parseExpensePaymentAccrualIds(body: {
  expenseAccrualId?: unknown
  expense_accrual_id?: unknown
  expenseAccrualIds?: unknown
  expense_accrual_ids?: unknown
}): number[] {
  const raw = body.expenseAccrualIds ?? body.expense_accrual_ids
  const fromArr = Array.isArray(raw) ? raw : []
  const ids = fromArr.map((v) => Math.floor(Number(v) || 0)).filter((n) => n > 0)
  const unique = [...new Set(ids)]
  if (unique.length > 0) return unique
  const one = Math.floor(Number(body.expenseAccrualId ?? body.expense_accrual_id ?? 0) || 0)
  return one > 0 ? [one] : []
}

/** 잔액이 통장 출금액 이하이면 1:1 또는 합산 후보 */
export function remainingFitsBankWithdrawal(remaining: number, bankAmount: number): boolean {
  const rem = Math.round(Math.abs(Number(remaining) || 0) * 100) / 100
  const bank = Math.round(Math.abs(Number(bankAmount) || 0) * 100) / 100
  if (!(rem > 0) || !(bank > 0)) return false
  return rem <= bank + 0.009
}

export function sumExpensePlanPickAmount(
  list: { id: number; remainingAmount: number }[],
  selectedIds: Iterable<number>
): number {
  const idSet = new Set([...selectedIds].map((id) => Number(id)))
  const sum = (list || [])
    .filter((row) => idSet.has(Number(row.id)))
    .reduce((acc, row) => acc + Math.max(0, parseMoneyAmount(row.remainingAmount)), 0)
  return Math.round(sum * 100) / 100
}

export function expensePlanPickTotalMatchesBank(bankAmount: number, selectedTotal: number): boolean {
  return moneyEqual(Math.abs(Number(bankAmount) || 0), Math.abs(Number(selectedTotal) || 0))
}

export const EXPENSE_BANK_COMBO_SEARCH_MIN_LEN = 2
/** 합산 검색 기간 상한(포함 일수). 그 이상은 목록이 다시 커짐 */
export const EXPENSE_BANK_COMBO_MAX_RANGE_DAYS = 93
const COMBO_YMD = /^\d{4}-\d{2}-\d{2}$/

export function parseExpenseBankComboYmd(raw: string): string | null {
  const ymd = String(raw || '').trim().slice(0, 10)
  return COMBO_YMD.test(ymd) ? ymd : null
}

/** 기본: 출금일이 속한 달 1일 ~ 출금일 */
export function defaultExpenseBankComboPeriod(bankDateYmd: string): { from: string; to: string } {
  const to = parseExpenseBankComboYmd(bankDateYmd)
  if (!to) return { from: '', to: '' }
  return { from: `${to.slice(0, 7)}-01`, to }
}

export function normalizeExpenseBankComboPeriod(
  fromRaw: string,
  toRaw: string
): { from: string; to: string } | null {
  const a = parseExpenseBankComboYmd(fromRaw)
  const b = parseExpenseBankComboYmd(toRaw)
  if (!a || !b) return null
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

export function expenseBankComboPeriodDayCount(fromYmd: string, toYmd: string): number | null {
  const period = normalizeExpenseBankComboPeriod(fromYmd, toYmd)
  if (!period) return null
  const t0 = Date.parse(`${period.from}T12:00:00+07:00`)
  const t1 = Date.parse(`${period.to}T12:00:00+07:00`)
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null
  return Math.round((t1 - t0) / 86400000) + 1
}

export function isExpenseBankComboPeriodReady(fromRaw?: string, toRaw?: string): boolean {
  const period = normalizeExpenseBankComboPeriod(fromRaw || '', toRaw || '')
  if (!period) return false
  const days = expenseBankComboPeriodDayCount(period.from, period.to)
  return days != null && days > 0 && days <= EXPENSE_BANK_COMBO_MAX_RANGE_DAYS
}

export function accrualDateInComboPeriod(
  expenseDate: string,
  dueDate: string,
  fromYmd: string,
  toYmd: string
): boolean {
  const period = normalizeExpenseBankComboPeriod(fromYmd, toYmd)
  if (!period) return false
  const due = String(dueDate || '').slice(0, 10)
  const exp = String(expenseDate || '').slice(0, 10)
  const inRange = (d: string) => !!d && d >= period.from && d <= period.to
  return inRange(exp) || inRange(due)
}

export function parseExpenseBankComboSearchQuery(raw: string): {
  text: string
  amount: number | null
} {
  const text = String(raw || '').trim()
  const digits = text.replace(/[, ]/g, '')
  const amount = /^\d+(\.\d+)?$/.test(digits) ? Number(digits) : null
  return {
    text,
    amount: amount != null && Number.isFinite(amount) && amount > 0 ? amount : null,
  }
}

export function isExpenseBankComboSearchReady(
  q: string,
  period?: { from?: string; to?: string }
): boolean {
  if (isExpenseBankComboPeriodReady(period?.from, period?.to)) return true
  const { text, amount } = parseExpenseBankComboSearchQuery(q)
  if (amount != null) return true
  return text.length >= EXPENSE_BANK_COMBO_SEARCH_MIN_LEN
}

/** 합산 검색: 빈 검색어는 기간만으로 통과. 숫자면 잔액·예정액, 아니면 거래처·코드·메모·문서번호 */
export function expenseAccrualMatchesComboSearch(
  row: {
    payeeName?: string | null
    payeeCode?: string | null
    memo?: string | null
    documentNo?: string | null
    remainingAmount?: number
    plannedAmount?: number
  },
  q: string
): boolean {
  const { text, amount } = parseExpenseBankComboSearchQuery(q)
  if (amount != null) {
    return (
      moneyEqual(parseMoneyAmount(row.remainingAmount), amount) ||
      moneyEqual(parseMoneyAmount(row.plannedAmount), amount)
    )
  }
  if (text.length < EXPENSE_BANK_COMBO_SEARCH_MIN_LEN) return true
  const hay = `${row.payeeName || ''} ${row.payeeCode || ''} ${row.memo || ''} ${row.documentNo || ''}`.toLowerCase()
  return hay.includes(text.toLowerCase())
}

/**
 * 한 출금에 여러 지급예정을 묶을 수 있는지.
 * 패티·카드대금은 1:1만. 세금 납부와 일반 지출은 섞지 않음.
 */
export function canBundleExpenseWithdrawalCategories(
  categories: string[]
): { ok: true } | { ok: false; message: string } {
  const cats = (categories || []).map((c) => String(c || '').trim().toLowerCase())
  if (cats.length === 0) {
    return { ok: false, message: '지급 예정 ID가 필요합니다.' }
  }
  if (cats.some((c) => isPrepaymentAccrualCategory(c))) {
    return { ok: false, message: '패티 보충·카드 대금은 통장 1건에 지급예정 1건만 연결할 수 있습니다.' }
  }
  const taxFlags = cats.map((c) => isTaxSettlementWithdrawalCategory(c))
  const hasTax = taxFlags.some(Boolean)
  const hasNonTax = taxFlags.some((t) => !t)
  if (hasTax && hasNonTax) {
    return { ok: false, message: '세금 납부와 일반 지출을 한 통장 출금에 함께 연결할 수 없습니다.' }
  }
  if (hasTax && new Set(cats).size > 1) {
    return { ok: false, message: '세금 종류가 다른 지급예정은 한 통장에 함께 연결할 수 없습니다.' }
  }
  return { ok: true }
}
