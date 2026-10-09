import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import type { KDepositParsedResult } from "@/lib/parse-kdeposit-csv"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import type { AccountSubjectItem } from "@/lib/api-client"
import { sortVendorsByDisplayName } from "@/lib/vendor-sort"

export const BANK_EDIT_BTN_CN = `${ADMIN_BTN_XS_CN} shrink-0 h-7 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15`

/** 조회 탭에서 저장 전 행별 수정값 */
export type QueryRowEdit = Partial<{
  category: string
  accountSubjectId: string
  note: string
  salesDate: string
  expenseDate: string
  vendorCode: string
  storeName: string
  withholdingTaxAmount: string
  withholdingTaxRate: string
}>

export function todayStr() {
  return getBangkokTodayDateString()
}

export function formatBankBaht(n: number): string {
  return `฿${(n ?? 0).toLocaleString()}`
}

export function accountSubjectDisplayName(a: AccountSubjectItem, lang: string): string {
  return lang === "ko" ? a.name : a.nameEn || a.name
}

/** 매입 거래처 API 응답 → code 기준 중복 제거·표시명 정렬 */
export function normalizePurchaseVendorOptions(rows: unknown): { code: string; name: string }[] {
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const deduped = rows
    .map((row) => {
      const item = row as { code?: string; name?: string }
      return {
        code: String(item.code || "").trim(),
        name: String(item.name || "").trim(),
      }
    })
    .filter((row) => row.code)
    .filter((row) => {
      if (seen.has(row.code)) return false
      seen.add(row.code)
      return true
    })
  return sortVendorsByDisplayName(deduped)
}

export function bankRowSettleDate(r: { transDate: string; salesDate?: string }): string {
  if (r.salesDate?.trim()) return r.salesDate.slice(0, 10)
  const d = new Date(r.transDate)
  if (!Number.isNaN(d.getTime())) {
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }
  return r.transDate.slice(0, 10)
}

export function formatBankLedgerDepositCell(transType: string, amount?: number): string {
  if (transType !== "deposit") return "—"
  const n = Math.abs(Number(amount) || 0)
  return n > 0 ? n.toLocaleString() : "—"
}

export function formatBankLedgerWithdrawCell(transType: string, amount?: number): string {
  if (transType !== "withdraw") return "—"
  const n = Math.abs(Number(amount) || 0)
  return n > 0 ? n.toLocaleString() : "—"
}

export type BankTransactionRow = {
  id?: number
  transDate: string
  transType: string
  amount: number
  memo: string
  note?: string
  category?: string
  accountSubjectId?: number | null
  salesDate?: string
  expenseDate?: string
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  purchaseOrderId?: number
  vendorCode?: string
  storeName?: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
  isLinked?: boolean
  isReceivableLinked?: boolean
  isChannelSettled?: boolean
  isCardLinked?: boolean
}

export type BankImportRowEdit = {
  category?: string
  accountSubjectId?: string
  autoAssigned?: boolean
  note?: string
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
}

export type BankImportDraft = {
  importPreview?: KDepositParsedResult | null
  importRowEdits?: Record<number, BankImportRowEdit>
  accountId?: string
  startStr?: string
  endStr?: string
  newAccountName?: string
  newAccountBankName?: string
  newAccountStore?: string
}

export type BankQueryDraft = {
  accountId?: string
  startStr?: string
  endStr?: string
  actualBalance?: string
  activeBankTab?: string
  /** 조회 버튼을 누른 적이 있으면 탭을 바꿔도 초안을 유지 */
  hasSearched?: boolean
  filterTransType?: string
  filterCategory?: string
  filterVendorCode?: string
  filterAccountSubjectId?: string
  filterAccountSubjectEmpty?: boolean
  filterPlExpenseOnly?: boolean
  filterInvoiceNotReceived?: boolean
  filterAmount?: string
  filterKeyword?: string
  queryRowEdits?: Record<
    number,
    Partial<{
      category: string
      accountSubjectId: string
      note: string
      salesDate: string
      expenseDate: string
      vendorCode: string
      storeName: string
      withholdingTaxAmount: string
      withholdingTaxRate: string
    }>
  >
}
