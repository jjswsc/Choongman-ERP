/** 세무 장부 UI 표시용 로케일 (DB에는 한국어 계정명·영문 적요를 유지). */

import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { formatYmSlash, taxBookMemoWithoutStatus, taxBookSourceKindKey } from '@/lib/tax-book-voucher-memo'

export function formatTaxFilingYearMonthLabel(yearMonth: string, lang: string): string {
  const ym = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym
  const y = ym.slice(0, 4)
  const m = Number(ym.slice(5, 7))
  if (lang === 'ko') return `${y}년 ${m}월`
  if (lang === 'th') return `${String(m).padStart(2, '0')}/${y}`
  return `${y}-${String(m).padStart(2, '0')}`
}

export function displayTaxBookAccountName(
  lang: string,
  accountCode: string,
  fallbackName?: string | null
): string {
  const code = String(accountCode || '').trim()
  const meta = code ? CHART_OF_ACCOUNTS_BY_CODE[code] : undefined
  const fallback = String(fallbackName || '').trim()
  if (!meta) return fallback || code
  if (lang === 'ko') return meta.nameKo || fallback || code
  if (lang === 'th') return meta.nameTh || meta.nameEn || meta.nameKo || fallback || code
  return meta.nameEn || meta.nameKo || fallback || code
}

function ymFromMemoOrDate(memo: string | null | undefined, accountingDate?: string | null): string {
  const fromMemo = String(memo || '').match(/(\d{2}\/\d{4})/)
  if (fromMemo) return fromMemo[1]
  const ymd = String(accountingDate || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return formatYmSlash(ymd.slice(0, 7))
  const ym = String(accountingDate || '').slice(0, 7)
  if (/^\d{4}-\d{2}$/.test(ym)) return formatYmSlash(ym)
  return ''
}

function kindFromStoredMemo(memo: string): string | null {
  const s = memo || ''
  if (/Record VAT from Monthly Tax Filing/i.test(s)) return 'vat'
  if (/Record sales base summary/i.test(s)) return 'salesSummary'
  if (/Record purchase base summary/i.test(s)) return 'purchaseSummary'
  if (/Record accrued payroll/i.test(s)) return 'payroll'
  if (/Record inventory COGS/i.test(s)) return 'inventory'
  if (/Closing entries/i.test(s)) return 'closing'
  if (/Opening balances from FlowAccount/i.test(s)) return 'opening'
  if (/Adjusting journal entry/i.test(s)) return 'adjustment'
  if (/세무 장부 기초|FlowAccount→세무 기초/i.test(s)) return 'opening'
  return null
}

/** i18n 키 + {{ym}} / {{date}} 치환용. 매칭 실패 시 null → 원문 memo 사용. */
export function resolveTaxBookMemoDisplay(
  memo: string | null | undefined,
  opts?: { sourceType?: string | null; accountingDate?: string | null }
): { key: string; ym: string; date: string } | null {
  const kindFromSource = taxBookSourceKindKey(opts?.sourceType)
  const kind = kindFromSource !== 'other' ? kindFromSource : kindFromStoredMemo(String(memo || ''))
  if (!kind) return null
  const date = String(opts?.accountingDate || memo?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '').slice(0, 10)
  const ym = ymFromMemoOrDate(memo, opts?.accountingDate || date)
  return { key: `taxBooksMemo_${kind}`, ym, date }
}

export function formatTaxBookMemoDisplay(
  t: (key: string) => string,
  memo: string | null | undefined,
  opts?: { sourceType?: string | null; accountingDate?: string | null }
): string {
  const resolved = resolveTaxBookMemoDisplay(memo, opts)
  const raw = taxBookMemoWithoutStatus(memo)
  if (!resolved) return raw
  const template = t(resolved.key)
  if (!template || template === resolved.key) return raw
  return template.replace(/\{\{ym\}\}/g, resolved.ym).replace(/\{\{date\}\}/g, resolved.date)
}
