/** Expense 문서번호 EXPyyyymmNNNN (FlowAccount식) */

const RE_EXPENSE_DOC_NO = /^EXP(\d{6})(\d{4,})$/i

export function bangkokYyyymmFromDate(dateStr?: string | null): string {
  const raw = String(dateStr || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.slice(0, 4) + raw.slice(5, 7)
  }
  const bangkok = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 10)
  return bangkok.slice(0, 4) + bangkok.slice(5, 7)
}

export function buildExpenseDocumentNo(yyyymm: string, seq: number): string {
  const ym = String(yyyymm || '').replace(/\D/g, '').slice(0, 6)
  const safeYm = ym.length === 6 ? ym : bangkokYyyymmFromDate(null)
  const n = Math.max(1, Math.floor(Number(seq) || 1))
  return `EXP${safeYm}${String(n).padStart(4, '0')}`
}

export function isExpenseDocumentNo(value: string | undefined | null): boolean {
  return RE_EXPENSE_DOC_NO.test(String(value || '').trim())
}

export function parseExpenseDocumentNo(value: string | undefined | null): { yyyymm: string; seq: number } | null {
  const m = String(value || '').trim().match(RE_EXPENSE_DOC_NO)
  if (!m) return null
  const seq = Number(m[2])
  if (!Number.isFinite(seq) || seq < 1) return null
  return { yyyymm: m[1], seq }
}
