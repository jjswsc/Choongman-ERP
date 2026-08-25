/**
 * 손익 VAT 포함 보기 — PP.30(ภ.พ.30) 납부액을 세금 귀속월 비용으로 넣기.
 * 미포함 보기·PND·SSO·법인세는 대상이 아님.
 */
import {
  extractWithdrawalCategoryFromNote,
  isExpenseInternalBankNote,
} from '@/lib/bank-transaction-note-meta'

export const PL_PP30_EXPENSE_SUBJECT_CODE = 'PP30-VAT'

export function isPp30PlExpenseSubjectCode(code: string | null | undefined): boolean {
  return String(code || '').trim() === PL_PP30_EXPENSE_SUBJECT_CODE
}

export type Pp30PlCandidateRow = {
  id?: number | null
  amount?: number | null
  memo?: string | null
  note?: string | null
  store?: string | null
  trans_date?: string | null
  expense_date?: string | null
  category?: string | null
}

function combinedText(memo: string | null | undefined, note: string | null | undefined): string {
  return `${String(memo || '').trim()} ${String(note || '').trim()}`.replace(/\s+/g, ' ').trim()
}

export function looksLikePp30RemittanceText(text: string): boolean {
  const s = String(text || '')
  if (/\bpp\.?\s*[-.]?\s*30\b/i.test(s)) return true
  if (/ภ\.?\s*พ\.?\s*30|ภพ\.?\s*30/i.test(s)) return true
  return false
}

export function isPp30PlRemittanceRow(row: Pp30PlCandidateRow): boolean {
  const w = extractWithdrawalCategoryFromNote(String(row.note || ''))
  if (w === 'tax_vat') return true
  return looksLikePp30RemittanceText(combinedText(row.memo, row.note))
}

function filingYearTokenToCe(yy: string): number | null {
  const raw = String(yy || '').trim()
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  if (raw.length >= 4) {
    if (n >= 2400) return n - 543
    if (n >= 1990 && n <= 2100) return n
    return null
  }
  if (raw.length === 2) {
    if (n >= 50) return 2500 + n - 543
    return 2000 + n
  }
  return null
}

/** 적요에서 PP.30 귀속월 YYYY-MM. 없으면 null. */
export function parsePp30TaxMonthFromText(text: string): string | null {
  const s = String(text || '')
  const patterns = [
    /\bpp\.?\s*[-.]?\s*30\s*[-./]?\s*(\d{1,2})\s*[-./]\s*(\d{2,4})\b/gi,
    /ภ\.?\s*พ\.?\s*30\s*[-./]?\s*(\d{1,2})\s*[-./]\s*(\d{2,4})/gi,
    /ภพ\.?\s*30\s*[-./]?\s*(\d{1,2})\s*[-./]\s*(\d{2,4})/gi,
  ]
  for (const re of patterns) {
    for (const m of s.matchAll(re)) {
      const month = Number(m[1])
      const year = filingYearTokenToCe(m[2])
      if (!year || month < 1 || month > 12) continue
      return `${year}-${String(month).padStart(2, '0')}`
    }
  }
  return null
}

export function shiftYearMonthUtc(ym: string, deltaMonths: number): string {
  const y = Number(String(ym || '').slice(0, 4))
  const m = Number(String(ym || '').slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ''
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function lastDateOfYearMonth(ym: string): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ''
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** 통장 출금일 조회 상한: 손익 종료월 + 3개월 (익월 15일 납부·지연 포함). */
export function pp30PlPaymentWindowEnd(endStr: string): string {
  const endYm = String(endStr || '').slice(0, 7)
  const payYm = shiftYearMonthUtc(endYm, 3)
  return lastDateOfYearMonth(payYm) || endStr
}

export function yearMonthInInclusiveRange(ym: string, startStr: string, endStr: string): boolean {
  const m = String(ym || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(m)) return false
  const a = String(startStr || '').slice(0, 7)
  const b = String(endStr || '').slice(0, 7)
  return m >= a && m <= b
}

/**
 * 적요 기간 우선. 없으면(tax_vat 또는 PP.30 식별만 될 때) 지급월의 전월.
 * 태국 부가세는 보통 다음 달 15일까지 납부.
 */
export function resolvePp30TaxMonthForPlRow(row: Pp30PlCandidateRow): string | null {
  const fromText = parsePp30TaxMonthFromText(combinedText(row.memo, row.note))
  if (fromText) return fromText
  if (!isPp30PlRemittanceRow(row)) return null
  const payYmd = String(row.trans_date || row.expense_date || '').slice(0, 10)
  const payYm = payYmd.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(payYm)) return null
  return shiftYearMonthUtc(payYm, -1) || null
}

function extractExpenseAccrualId(note: string | null | undefined): number {
  const m = String(note || '').match(/expense_accrual_id:(\d+)/i)
  const id = m ? Number(m[1]) : 0
  return Number.isFinite(id) && id > 0 ? id : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 같은 납부를 내부 그림자 줄·실거래가 둘 다 있으면 한 번만 합산. */
export function sumPp30RemittanceForTaxPeriod(
  rows: Pp30PlCandidateRow[],
  startStr: string,
  endStr: string
): number {
  type Chosen = { amount: number; internal: boolean; id: number }
  const chosen = new Map<string, Chosen>()

  for (const row of rows || []) {
    if (!isPp30PlRemittanceRow(row)) continue
    const taxYm = resolvePp30TaxMonthForPlRow(row)
    if (!taxYm || !yearMonthInInclusiveRange(taxYm, startStr, endStr)) continue
    const amount = round2(Math.abs(Number(row.amount) || 0))
    if (amount <= 0) continue
    const accrualId = extractExpenseAccrualId(row.note)
    const store = String(row.store || '').trim().toLowerCase()
    const key = accrualId > 0 ? `accrual:${accrualId}` : `amt:${store}|${taxYm}|${amount.toFixed(2)}`
    const internal = isExpenseInternalBankNote(row.note)
    const id = Number(row.id || 0) || 0
    const prev = chosen.get(key)
    if (!prev) {
      chosen.set(key, { amount, internal, id })
      continue
    }
    if (prev.internal && !internal) {
      chosen.set(key, { amount, internal, id })
    }
  }

  let total = 0
  for (const v of chosen.values()) total += v.amount
  return round2(total)
}

export function pp30PlAmountForVatMode(
  remittance: number | null | undefined,
  vatMode: 'included' | 'excluded'
): number {
  if (vatMode !== 'included') return 0
  return Math.max(0, Number(remittance) || 0)
}
