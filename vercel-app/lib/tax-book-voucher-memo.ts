/** 플로우 Journal Voucher Description 에 가까운 세무 장부 적요. */

export function formatYmSlash(yearMonth: string): string {
  const ym = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym
  return `${ym.slice(5, 7)}/${ym.slice(0, 4)}`
}

export function taxBookMemoVat(yearMonth: string): string {
  return `Record VAT from Monthly Tax Filing P.P. 30 for the period of ${formatYmSlash(yearMonth)}`
}

export function taxBookMemoSales(yearMonth: string): string {
  return `Record sales base summary from tax filing for the period of ${formatYmSlash(yearMonth)}`
}

export function taxBookMemoPurchase(yearMonth: string): string {
  return `Record purchase base summary from tax filing for the period of ${formatYmSlash(yearMonth)}`
}

export function taxBookMemoPayroll(yearMonth: string): string {
  return `Record accrued payroll for the period of ${formatYmSlash(yearMonth)}`
}

export function taxBookMemoInventoryCogs(yearMonth: string): string {
  return `Record inventory COGS for the period of ${formatYmSlash(yearMonth)}`
}

export function taxBookMemoClosing(yearMonth: string): string {
  return `Closing entries — Revenue and Expenses for the period of ${formatYmSlash(yearMonth)}`
}

export function taxBookMemoOpening(dateYmd: string): string {
  return `Opening balances from FlowAccount as at ${String(dateYmd || '').slice(0, 10)}`
}

export function taxBookMemoAdjustment(yearMonth: string, userMemo?: string): string {
  const custom = String(userMemo || '').trim()
  if (custom) return custom
  return `Adjusting journal entry for the period of ${formatYmSlash(yearMonth)}`
}

export const TAX_BOOK_DRAFT_PREFIX = '[Draft] '

export function taxBookMemoWithStatus(memo: string, status: 'draft' | 'approved'): string {
  const body = String(memo || '').replace(/^\[Draft\]\s*/i, '').trim()
  if (status === 'draft') return `${TAX_BOOK_DRAFT_PREFIX}${body}`
  return body
}

export function taxBookStatusFromMemo(memo: string | null | undefined): 'draft' | 'approved' {
  return /^\[Draft\]\s*/i.test(String(memo || '')) ? 'draft' : 'approved'
}

export function taxBookMemoWithoutStatus(memo: string | null | undefined): string {
  return String(memo || '').replace(/^\[Draft\]\s*/i, '').trim()
}

export function isCustomTaxDocumentNo(entryNo: string | null | undefined): boolean {
  const n = String(entryNo || '').trim()
  if (!n) return false
  if (/^JE-/i.test(n)) return false
  return true
}

/** 목록·필터용 짧은 종류 라벨 키 접미사 */
export function taxBookSourceKindKey(sourceType: string | null | undefined): string {
  const s = String(sourceType || '').trim()
  if (s === 'tax_vat_summary') return 'vat'
  if (s === 'tax_sales_summary') return 'salesSummary'
  if (s === 'tax_purchase_summary') return 'purchaseSummary'
  if (s === 'tax_payroll') return 'payroll'
  if (s === 'tax_inventory_cogs') return 'inventory'
  if (s === 'tax_income_expense_closing') return 'closing'
  if (s === 'tax_opening') return 'opening'
  if (s === 'tax_adjustment' || s === 'tax_manual') return 'adjustment'
  return 'other'
}

