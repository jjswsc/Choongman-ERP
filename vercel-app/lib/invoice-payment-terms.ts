import { addDaysYmd } from '@/lib/pos-business-day'

/** 세금계산서·인보이스 Payment Terms 고정 옵션 */
export const INVOICE_PAYMENT_TERM_OPTIONS = [
  'Cash',
  'Credit 7 Days',
  'Credit 14 Days',
  'Credit 30 Days',
] as const

export type InvoicePaymentTerm = (typeof INVOICE_PAYMENT_TERM_OPTIONS)[number]

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** 옵션별 가산 일수 (Cash = 0). */
export function creditDaysForPaymentTerms(terms: string | null | undefined): number | null {
  const n = normalizeInvoicePaymentTerms(terms)
  if (!n) return null
  if (n === 'Cash') return 0
  if (n === 'Credit 7 Days') return 7
  if (n === 'Credit 14 Days') return 14
  if (n === 'Credit 30 Days') return 30
  return null
}

/**
 * 저장·표시용으로 표준 옵션에 맞춤.
 * 구버전 "Net 30 Days" 등은 Credit 30 Days로 매핑. 알 수 없으면 빈 문자열.
 */
export function normalizeInvoicePaymentTerms(raw: string | null | undefined): InvoicePaymentTerm | '' {
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return ''
  const lower = s.toLowerCase()
  if (lower === 'cash' || lower === 'เงินสด') return 'Cash'
  if (/(?:^|\b)(?:credit\s*)?7(?:\s*days?)?\b/.test(lower) || lower.includes('net 7')) {
    return 'Credit 7 Days'
  }
  if (/(?:^|\b)(?:credit\s*)?14(?:\s*days?)?\b/.test(lower) || lower.includes('net 14')) {
    return 'Credit 14 Days'
  }
  if (
    /(?:^|\b)(?:credit\s*)?30(?:\s*days?)?\b/.test(lower) ||
    lower.includes('net 30') ||
    lower === 'net 30 days'
  ) {
    return 'Credit 30 Days'
  }
  const hit = INVOICE_PAYMENT_TERM_OPTIONS.find((o) => o.toLowerCase() === lower)
  return hit || ''
}

/** Issue Date + Payment Terms → Due Date. 날짜/조건 불명이면 issueDate 또는 빈 문자열. */
export function dueDateFromPaymentTerms(
  issueDate: string | null | undefined,
  paymentTerms: string | null | undefined
): string {
  const issue = String(issueDate || '')
    .trim()
    .slice(0, 10)
  if (!YMD_RE.test(issue)) return ''
  const days = creditDaysForPaymentTerms(paymentTerms)
  if (days == null) return issue
  return addDaysYmd(issue, days)
}
