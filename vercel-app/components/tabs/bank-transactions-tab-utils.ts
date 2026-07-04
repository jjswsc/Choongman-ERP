import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import type { KDepositParsedResult } from "@/lib/parse-kdeposit-csv"

export function todayStr() {
  return getBangkokTodayDateString()
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
  filterTransType?: string
  filterCategory?: string
  filterVendorCode?: string
  filterAccountSubjectId?: string
  filterAccountSubjectEmpty?: boolean
  filterPlExpenseOnly?: boolean
  filterInvoiceNotReceived?: boolean
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
