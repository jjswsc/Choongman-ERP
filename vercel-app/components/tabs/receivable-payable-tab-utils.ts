import { formatMoneyBaht } from "@/lib/money-amount"
import { parsePosOrderMemo } from "@/lib/pos-tax-invoice"
import { resolveInvoiceClientForTarget } from "@/lib/invoice-client-resolve"
import { receivableStoreGroupKey } from "@/lib/receivable-store-key"
import { CANONICAL_OFFICE_STORE, canonicalOfficeStore } from "@/lib/office-store-canonical"
import { orderIdFromReceivableOrderRow } from "@/lib/receivable-order-id-parse"
import type { InvoiceDataClient } from "@/lib/api-client"
import type { PoInvoiceBillToVendor } from "@/lib/po-invoice-bill-to"
import type {
  ReceivablePayableItem,
  PayableTransactionItem,
  OrderInvoiceTotals,
} from "@/lib/api-client"

export type LineItemsCacheEntry = { items: PayableTransactionItem[]; orderInvoiceTotals?: OrderInvoiceTotals }

/** 미수·미지급 조회 UI — 메뉴 이동 후 복원용 sessionStorage draft */
export type ReceivablePayableQueryDraft = {
  tab?: "receivable" | "payable" | "borrowings"
  startStr?: string
  endStr?: string
  salesOutletFilter?: string
  payableStoreFilter?: string
  vendorFilter?: string
  invoiceSearch?: string
  filterUnpaidOnly?: boolean
  ledgerViewMode?: "ledger" | "paired"
  hasSearchedList?: boolean
}

export type ReceivablePayableListLoadOverrides = {
  type?: "receivable" | "payable"
  storeFilter?: string
  vendorFilter?: string
  invoiceFilter?: string
}

/** 방콕 달력 날짜 (YYYY-MM-DD). 로컬 PC 타임존/UTC와 어긋나면 종료일 필터로 행이 잘릴 수 있음. */
export function bangkokTodayStr() {
  return new Date().toLocaleString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 10)
}

/** 미수·미지급 화면 금액 — 소수 둘째 자리 고정(정렬·가독) */
export function fmtBaht(n: number | null | undefined): string {
  return `฿${formatMoneyBaht(Number(n ?? 0))}`
}

export function fmtBahtSigned(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return `${v >= 0 ? "+" : ""}฿${formatMoneyBaht(v)}`
}

export { buildTaxInvoiceDocNo, isOutboundReceivableInvoiceNo, isTaxInvoiceDocumentNo, parseTaxInvoiceDocNoSuffix } from "@/lib/tax-invoice-doc-no"

export function buildClientFromPosTaxMemo(
  memo: string | undefined,
  fallbackName: string
): InvoiceDataClient | null {
  const parsed = parsePosOrderMemo(memo)
  const tax = parsed.taxInvoice
  if (!tax) return null
  const name = String(tax.name || "").trim() || String(fallbackName || "").trim() || "-"
  const address = String(tax.address || "").trim() || "-"
  const taxId = String(tax.taxId || "").trim() || "-"
  const phone = String(tax.phone || "").trim() || "-"
  return { companyName: name, address, taxId, phone }
}

export function cumulativeBalanceKey(tab: "receivable" | "payable", item: ReceivablePayableItem): string {
  if (tab === "receivable") {
    const storeName = String(item.storeName || "").trim()
    return storeName ? receivableStoreGroupKey(storeName) : ""
  }
  return String(item.vendorCode || "").trim().toLowerCase()
}

export function buildCumulativeByKey(
  tab: "receivable" | "payable",
  rows: { storeName?: string; vendorCode?: string; balance?: number }[]
): Record<string, number> {
  const byKey: Record<string, number> = {}
  for (const row of rows) {
    const key =
      tab === "receivable"
        ? receivableStoreGroupKey(String(row.storeName || ""))
        : String(row.vendorCode || "").trim().toLowerCase()
    if (!key) continue
    byKey[key] = (byKey[key] || 0) + Number(row.balance ?? 0)
  }
  return byKey
}

/** 목록 API·요약 API 누적 잔액을 한 맵으로 합침 (동일 조회의 cumulative 맵 우선) */
export function mergeReceivablePayableCumulativeByKey(params: {
  tab: "receivable" | "payable"
  summaryRows: { storeName?: string; vendorCode?: string; balance?: number }[]
  listItems?: { storeName?: string; vendorCode?: string; cumulativeBalance?: number }[]
  payableCumulativeByVendor?: Record<string, number>
  receivableCumulativeByStoreGroup?: Record<string, number>
}): Record<string, number> {
  const byKey = buildCumulativeByKey(params.tab, params.summaryRows)
  if (params.tab === "payable" && params.payableCumulativeByVendor) {
    for (const [vc, bal] of Object.entries(params.payableCumulativeByVendor)) {
      const key = String(vc || "").trim().toLowerCase()
      if (!key) continue
      byKey[key] = Number(bal ?? 0)
    }
  }
  if (params.tab === "receivable" && params.receivableCumulativeByStoreGroup) {
    for (const [groupKey, bal] of Object.entries(params.receivableCumulativeByStoreGroup)) {
      const key = String(groupKey || "").trim().toLowerCase()
      if (!key) continue
      byKey[key] = Number(bal ?? 0)
    }
  }
  for (const item of params.listItems ?? []) {
    const cum = item.cumulativeBalance
    if (cum == null || !Number.isFinite(cum)) continue
    const key =
      params.tab === "receivable"
        ? receivableStoreGroupKey(String(item.storeName || ""))
        : String(item.vendorCode || "").trim().toLowerCase()
    if (!key) continue
    if (
      (params.tab === "payable" && params.payableCumulativeByVendor) ||
      (params.tab === "receivable" && params.receivableCumulativeByStoreGroup)
    ) {
      continue
    }
    byKey[key] = cum
  }
  return byKey
}

/** 본사/회계 — 매장 목록 로드 전 검색해도 CM Office 기본 귀속이 적용되도록 */
export function resolveEffectivePayableStoreFilter(params: {
  payableStoreFilter: string
  canSelectStores: boolean
  storeList?: string[]
  /** useEffect로 CM Office 기본값이 이미 반영된 뒤 사용자가 All을 고른 경우 */
  officeDefaultApplied: boolean
}): string {
  if (params.payableStoreFilter !== "All") return params.payableStoreFilter
  if (params.officeDefaultApplied) return params.payableStoreFilter
  if (!params.canSelectStores || !params.storeList?.length) return params.payableStoreFilter
  const office =
    params.storeList.find((s) => String(s || "").toLowerCase().includes("office")) ||
    params.storeList.find((s) => canonicalOfficeStore(s) === CANONICAL_OFFICE_STORE)
  return office || params.payableStoreFilter
}

export function isOfficeLikeLabel(label: string): boolean {
  const v = String(label || "").trim().toLowerCase()
  if (!v) return false
  return (
    v.includes("본사") ||
    v.includes("office") ||
    v.includes("hq") ||
    v.includes("head office") ||
    v.includes("headoffice")
  )
}

export function clientHasBillToAddress(client: InvoiceDataClient | { companyName: string }): boolean {
  const address = (client as InvoiceDataClient).address
  const trimmed = String(address || "").trim()
  return Boolean(trimmed && trimmed !== "-")
}

/** 회계 PO Tax Invoice — 발주 인쇄와 동일하게 PO 거래처(Pepsi 등)를 BILL TO로 */
export function resolveTaxInvoiceClientFromPoBillTo(
  poBillTo: PoInvoiceBillToVendor,
  company: Parameters<typeof resolveInvoiceClientForTarget>[1],
  clients: Parameters<typeof resolveInvoiceClientForTarget>[2]
): InvoiceDataClient | { companyName: string } {
  const vendorTarget = String(poBillTo.vendorName || "").trim()
  const resolvedClient = resolveInvoiceClientForTarget(vendorTarget, company, clients)
  if (clientHasBillToAddress(resolvedClient)) return resolvedClient
  if (poBillTo.address || poBillTo.taxId) {
    return {
      companyName: vendorTarget || "-",
      address: poBillTo.address || "-",
      taxId: poBillTo.taxId || "-",
      phone: poBillTo.phone || "-",
    }
  }
  return resolvedClient
}

/** 일괄 인쇄 상한 — sessionStorage·순번 예약·브라우저 인쇄 미리보기 부담 */
export const RECEIVABLE_TAX_INVOICE_PRINT_MAX_BATCH = 50

export type ReceivableTaxInvoicePrintRow = {
  id?: number
  ref_type?: string
  ref_id?: number | string | null
  invoice_no?: string | null
  memo?: string | null
  trans_date?: string
  receive_checked?: boolean
  bank_transaction_id?: number | null
}

export type ReceivableTaxInvoicePrintSource = {
  refType: "Order" | "ForceOutbound" | "PO"
  refId: number
  loadKey: string
}

/** 미수 원장에서 세금계산서/영수증을 건별로 인쇄할 수 있는 출고 행만 */
export function resolveReceivableTaxInvoicePrintSource(
  row: ReceivableTaxInvoicePrintRow
): ReceivableTaxInvoicePrintSource | null {
  const refType = String(row.ref_type || "").trim()
  if (refType === "Order") {
    const orderId = orderIdFromReceivableOrderRow(row)
    if (orderId == null) return null
    return { refType: "Order", refId: orderId, loadKey: `tax-${row.id ?? orderId}` }
  }
  if (refType === "ForceOutbound") {
    const sid = Number(row.ref_id)
    if (!Number.isFinite(sid) || sid <= 0) return null
    return { refType: "ForceOutbound", refId: sid, loadKey: `tax-fo-${row.id ?? sid}` }
  }
  if (refType === "AccountingPO") {
    const poId = Number(row.ref_id)
    if (!Number.isFinite(poId) || poId <= 0) return null
    return { refType: "PO", refId: poId, loadKey: `tax-apo-${row.id ?? poId}` }
  }
  return null
}

export function isReceivableTaxInvoicePrintableRow(row: ReceivableTaxInvoicePrintRow): boolean {
  return resolveReceivableTaxInvoicePrintSource(row) != null
}

export function receivableTaxInvoicePrintSelectionKey(row: ReceivableTaxInvoicePrintRow): string | null {
  if (!resolveReceivableTaxInvoicePrintSource(row)) return null
  const id = Number(row.id)
  if (Number.isFinite(id) && id > 0) return `rec-print:${id}`
  const src = resolveReceivableTaxInvoicePrintSource(row)
  if (!src) return null
  return `rec-print:${src.refType}:${src.refId}`
}

export function collectReceivableTaxInvoicePrintTargets<
  R extends ReceivableTaxInvoicePrintRow,
  T extends { items: R[] },
>(
  listData: T[],
  selectedKeys: Iterable<string>
): { item: T; row: R; key: string }[] {
  const want = new Set(Array.from(selectedKeys).filter(Boolean))
  if (want.size === 0) return []
  const out: { item: T; row: R; key: string }[] = []
  for (const item of listData) {
    for (const row of item.items || []) {
      const key = receivableTaxInvoicePrintSelectionKey(row)
      if (!key || !want.has(key)) continue
      out.push({ item, row, key })
    }
  }
  return out
}

export function printableReceivableTaxInvoiceKeys(rows: ReceivableTaxInvoicePrintRow[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const key = receivableTaxInvoicePrintSelectionKey(row)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}
