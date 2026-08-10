/**
 * 통장 출금 ↔ 지급예정 연결 후보용 PostgREST 필터.
 * `or=(and(...))` 대신 날짜 창 2회 조회 후 병합(환경별 빈 결과 방지 — expense-accrual-plan-filters 와 동일).
 */
import { addDaysYmd } from '@/lib/pos-business-day'

/** 통장일 기준 지급예정 후보 조회 일수 (±). 등록일을 통장일과 다르게 넣는 현장 대응 */
export const EXPENSE_BANK_LINK_DATE_WINDOW_DAYS = 45

const LINKABLE_STATUS_IN = 'planned,approved,partial,paid,done'

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
 * 금액 보강 필터(2회).
 * 1) 총액 ≈ 통장금액
 * 2) 총액이 통장(순지급)보다 큰 구간 — WHT·VAT 차감 후 net ≈ 통장인 경우(최대 ~15%)
 */
export function buildExpenseAccrualBankLinkAmountFilters(bankAmount: number): string[] {
  const amt = Math.round(Math.abs(Number(bankAmount) || 0) * 100) / 100
  if (!(amt > 0)) return []
  const lo = Math.max(0, Math.round((amt - 0.02) * 100) / 100)
  const hiExact = Math.round((amt + 0.02) * 100) / 100
  // net=amt → gross ≤ amt/0.85 (WHT·기타 공제 여유)
  const hiGross = Math.round((amt / 0.85 + 0.02) * 100) / 100
  const status = `status=in.(${LINKABLE_STATUS_IN})`
  return [
    `${status}&amount=gte.${lo}&amount=lte.${hiExact}`,
    `${status}&amount=gte.${amt}&amount=lte.${hiGross}`,
  ]
}

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
