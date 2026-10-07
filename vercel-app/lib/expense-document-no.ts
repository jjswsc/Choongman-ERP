/** 지출·매입 문서번호: VAT 있으면 PV, 없으면 PP (일별장부 매입/지급과 동일 접두) */

/** PV / PP / 구형 EXP */
const RE_VOUCHER_DOC_NO = /^(PV|PP|EXP)(\d{6})(\d{4,})$/i

export type ExpenseDocumentPrefix = 'PV' | 'PP'

export function bangkokYyyymmFromDate(dateStr?: string | null): string {
  const raw = String(dateStr || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.slice(0, 4) + raw.slice(5, 7)
  }
  const bangkok = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 10)
  return bangkok.slice(0, 4) + bangkok.slice(5, 7)
}

/** VAT > 0 → PV(매입), 아니면 PP(Non-VAT / 지급) */
export function expenseDocumentPrefixForVat(vatAmount?: number | null): ExpenseDocumentPrefix {
  const v = Math.round(Math.max(0, Number(vatAmount) || 0) * 100) / 100
  return v > 0 ? 'PV' : 'PP'
}

/** seq 테이블 키: PV202610 / PP202610 (접두별 월 순번) */
export function expenseDocumentSeqKey(prefix: ExpenseDocumentPrefix, yyyymm: string): string {
  const ym = String(yyyymm || '').replace(/\D/g, '').slice(0, 6)
  const safeYm = ym.length === 6 ? ym : bangkokYyyymmFromDate(null)
  return `${prefix}${safeYm}`
}

export function buildExpenseDocumentNo(
  yyyymm: string,
  seq: number,
  prefix: ExpenseDocumentPrefix = 'PV'
): string {
  const ym = String(yyyymm || '').replace(/\D/g, '').slice(0, 6)
  const safeYm = ym.length === 6 ? ym : bangkokYyyymmFromDate(null)
  const n = Math.max(1, Math.floor(Number(seq) || 1))
  const p = prefix === 'PP' ? 'PP' : 'PV'
  return `${p}${safeYm}${String(n).padStart(4, '0')}`
}

export function isExpenseDocumentNo(value: string | undefined | null): boolean {
  return RE_VOUCHER_DOC_NO.test(String(value || '').trim())
}

export function parseExpenseDocumentNo(
  value: string | undefined | null
): { prefix: 'PV' | 'PP' | 'EXP'; yyyymm: string; seq: number } | null {
  const m = String(value || '').trim().match(RE_VOUCHER_DOC_NO)
  if (!m) return null
  const seq = Number(m[3])
  if (!Number.isFinite(seq) || seq < 1) return null
  const prefix = m[1].toUpperCase() as 'PV' | 'PP' | 'EXP'
  return { prefix, yyyymm: m[2], seq }
}

/** 구형 EXP → VAT 기준 PV/PP (자릿수·순번 유지) */
export function remapExpDocumentNoToPvPp(
  value: string | undefined | null,
  vatAmount?: number | null
): string | null {
  const parsed = parseExpenseDocumentNo(value)
  if (!parsed) return null
  if (parsed.prefix === 'PV' || parsed.prefix === 'PP') {
    return buildExpenseDocumentNo(parsed.yyyymm, parsed.seq, parsed.prefix)
  }
  return buildExpenseDocumentNo(parsed.yyyymm, parsed.seq, expenseDocumentPrefixForVat(vatAmount))
}
