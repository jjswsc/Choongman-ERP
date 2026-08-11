/**
 * 통장 출금 ↔ 지급예정 연결 후보용 PostgREST 필터.
 * `or=(and(...))` 대신 날짜 창 2회 조회 후 병합(환경별 빈 결과 방지 — expense-accrual-plan-filters 와 동일).
 */
import { addDaysYmd } from '@/lib/pos-business-day'

/** 통장일 기준 지급예정 후보 조회 일수 (±). 등록일을 통장일과 다르게 넣는 현장 대응 */
export const EXPENSE_BANK_LINK_DATE_WINDOW_DAYS = 45

const LINKABLE_STATUS_IN = 'planned,approved,partial,paid,done'
/** paid 이력에 밀리지 않도록 미정산 상태 우선 조회 */
const OPEN_STATUS_IN = 'planned,approved,partial'

/** expense_date 창 + due_date 창 — 호출측에서 2회 조회 후 병합 */
export function buildExpenseAccrualBankLinkDateFilters(
  bankDateYmd: string,
  windowDays = EXPENSE_BANK_LINK_DATE_WINDOW_DAYS
): string[] {
  const bankDate = String(bankDateYmd || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bankDate)) {
    return [`status=in.(${LINKABLE_STATUS_IN})`]
  }
  const from = addDaysYmd(bankDate, -Math.abs(windowDays))
  const to = addDaysYmd(bankDate, Math.abs(windowDays))
  const status = `status=in.(${LINKABLE_STATUS_IN})`
  return [
    `${status}&expense_date=gte.${from}&expense_date=lte.${to}`,
    `${status}&due_date=gte.${from}&due_date=lte.${to}`,
  ]
}

/**
 * 금액 보강 필터.
 * 1) 미정산(planned/approved/partial) · 총액 ≈ 통장 — paid 대량 이력에 밀리지 않음
 * 2) 전체 상태 · 총액 ≈ 통장 (고아 paid 포함)
 * 3) 총액이 통장(순지급)보다 큰 구간 — WHT 차감 후 net ≈ 통장(최대 ~15%)
 */
export function buildExpenseAccrualBankLinkAmountFilters(bankAmount: number): string[] {
  const amt = Math.round(Math.abs(Number(bankAmount) || 0) * 100) / 100
  if (!(amt > 0)) return []
  const lo = Math.max(0, Math.round((amt - 0.02) * 100) / 100)
  const hiExact = Math.round((amt + 0.02) * 100) / 100
  // net=amt → gross ≤ amt/0.85 (WHT·기타 공제 여유)
  const hiGross = Math.round((amt / 0.85 + 0.02) * 100) / 100
  const open = `status=in.(${OPEN_STATUS_IN})`
  const all = `status=in.(${LINKABLE_STATUS_IN})`
  return [
    `${open}&amount=gte.${lo}&amount=lte.${hiExact}`,
    `${all}&amount=gte.${lo}&amount=lte.${hiExact}`,
    `${open}&amount=gte.${amt}&amount=lte.${hiGross}`,
  ]
}

/** 금액 일치 후보 조회 한도(필터 순서와 맞춤: 미정산 exact / 전체 exact / WHT 구간) */
export const EXPENSE_BANK_LINK_AMOUNT_LIMITS = [800, 400, 400] as const

/** 최근 미정산 후보 보강(날짜·총액 필터에 안 걸린 경우) */
export function buildExpenseAccrualBankLinkRecentFilter(): string {
  return `status=in.(${LINKABLE_STATUS_IN})`
}

export function accrualDateMatchesBankDate(
  expenseDate: string,
  dueDate: string,
  bankDateYmd: string
): boolean {
  const bank = String(bankDateYmd || '').slice(0, 10)
  const due = String(dueDate || '').slice(0, 10)
  const exp = String(expenseDate || '').slice(0, 10)
  return !!bank && (due === bank || exp === bank)
}

export function accrualDateWithinBankWindow(
  expenseDate: string,
  dueDate: string,
  bankDateYmd: string,
  windowDays = EXPENSE_BANK_LINK_DATE_WINDOW_DAYS
): boolean {
  const bank = String(bankDateYmd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bank)) return false
  const from = addDaysYmd(bank, -Math.abs(windowDays))
  const to = addDaysYmd(bank, Math.abs(windowDays))
  const due = String(dueDate || '').slice(0, 10)
  const exp = String(expenseDate || '').slice(0, 10)
  const inRange = (d: string) => !!d && d >= from && d <= to
  return inRange(exp) || inRange(due)
}

/** id 목록을 PostgREST in.() 청크로 나눔 (URL 길이 한도) */
export function chunkIdsForInFilter(ids: number[], chunkSize = 80): number[][] {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))]
  const chunks: number[][] = []
  for (let i = 0; i < uniq.length; i += chunkSize) {
    chunks.push(uniq.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * 급여 동기화 지급예정 — 통장「지출관리 연결」후보에서 제외.
 * (급여 관리는 별도 흐름; payee_code = payroll-YYYY-MM-…)
 */
export function isPayrollExpenseAccrualForBankLink(params: {
  payeeCode?: string | null
  memo?: string | null
  payeeName?: string | null
}): boolean {
  const rawCode = String(params.payeeCode || '').trim().toLowerCase()
  const marker = '::wm::'
  const idx = rawCode.lastIndexOf(marker)
  const codeBase = (idx >= 0 ? rawCode.slice(0, idx) : rawCode).trim()
  if (codeBase.startsWith('payroll-')) return true
  if (/^payroll[:_]/.test(codeBase)) return true
  const memo = String(params.memo || '')
  if (/\[payroll\]/i.test(memo)) return true
  const name = String(params.payeeName || '').trim()
  if (/^payroll\b/i.test(name)) return true
  return false
}

/**
 * 통장 계좌 매장 기준으로 지급예정 후보를 좁힘.
 * 매장명이 비어 있거나 다른 매장인 건은 제외(금액 일치만으로 타 매장 노출 금지).
 */
export function filterExpenseAccrualsByBankStore<T extends { storeName?: string | null }>(
  rows: T[],
  storeFilter: string,
  storesMatch: (a: string, b: string) => boolean
): T[] {
  const filter = String(storeFilter || '').trim()
  if (!filter) return rows
  return (rows || []).filter((r) => {
    const row = String(r.storeName || '').trim()
    if (!row) return false
    return storesMatch(row, filter)
  })
}
