/**
 * 출고 관리 — 매장×월별 금액 행렬 (실제 stock_logs, 출고 관리·손익과 동일 단가).
 */
import { expandBangkokYearMonthsInclusive } from '@/lib/bangkok-time'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { loadHqOutboundProcessedLines } from '@/lib/hq-outbound-income-total'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import { tryFetchPosSalesAnalyticsAggIgnoreTimeout } from '@/lib/pos-sales-analytics-rpc-server'
import { rowMatchesSalesStoreSelection } from '@/lib/pos-sales-store-filter'
import { isPosSalesTestOfficeStoreCode } from '@/lib/pos-sales-test-office'

export type OutboundStoreMonthAmountCell = {
  subtotal: number
  vat: number
  grandTotal: number
  /** POS 완료 매출 (영업일·매장 코드 기준) */
  salesTotal: number
  /** 본사 매입 공급가 ÷ POS 매출 × 100 */
  purchaseToSalesPct: number | null
}

export type OutboundStoreMonthMatrixResult = {
  year: number
  /** 1–12 또는 null(연간 전체) */
  month: number | null
  months: string[]
  stores: string[]
  cells: Record<string, Record<string, OutboundStoreMonthAmountCell>>
  rowTotals: Record<string, OutboundStoreMonthAmountCell>
  colTotals: Record<string, OutboundStoreMonthAmountCell>
  grandTotal: OutboundStoreMonthAmountCell
  hitRowCap: boolean
  lineCount: number
  salesLoaded: boolean
}

const EMPTY_CELL: OutboundStoreMonthAmountCell = {
  subtotal: 0,
  vat: 0,
  grandTotal: 0,
  salesTotal: 0,
  purchaseToSalesPct: null,
}

function lastDayOfMonthYmd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function resolveMatrixDateRange(year: number, month: number | null): { startStr: string; endStr: string } {
  if (month != null) {
    const pad = String(month).padStart(2, '0')
    return { startStr: `${year}-${pad}-01`, endStr: lastDayOfMonthYmd(year, month) }
  }
  return { startStr: `${year}-01-01`, endStr: `${year}-12-31` }
}

function purchaseToSalesPct(subtotal: number, salesTotal: number): number | null {
  if (salesTotal <= 0) return null
  return Math.round((subtotal / salesTotal) * 1000) / 10
}

function cellWithSales(subtotalRaw: number, salesTotal: number): OutboundStoreMonthAmountCell {
  const base = subtotalRaw ? amountCellFromSubtotal(subtotalRaw) : { ...EMPTY_CELL }
  return {
    ...base,
    salesTotal,
    purchaseToSalesPct: purchaseToSalesPct(base.subtotal, salesTotal),
  }
}

/** 방콕 연·월(1–12) 검증 — null이면 연간 전체 */
export function parseOutboundMatrixMonth(raw: string | number | null | undefined): number | null {
  const s = String(raw ?? '').trim()
  if (!s || s.toLowerCase() === 'all' || s === '0') return null
  const n = typeof raw === 'number' ? raw : Number(s)
  if (!Number.isFinite(n) || n < 1 || n > 12) return null
  return Math.floor(n)
}

function amountCellFromSubtotal(raw: number): OutboundStoreMonthAmountCell {
  const t = thaiInvoiceTotalsFromRawSubtotal(raw)
  return {
    subtotal: t.subtotalRounded,
    vat: t.vatRounded,
    grandTotal: t.grandTotal,
    salesTotal: 0,
    purchaseToSalesPct: null,
  }
}

function addSubtotals(a: number, b: number): OutboundStoreMonthAmountCell {
  return amountCellFromSubtotal(a + b)
}

function mergeAmountCells(
  acc: OutboundStoreMonthAmountCell,
  next: OutboundStoreMonthAmountCell
): OutboundStoreMonthAmountCell {
  return addSubtotals(acc.subtotal, next.subtotal)
}

/** 방콕 연도 4자리 검증 */
export function parseOutboundMatrixYear(raw: string | number | null | undefined): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null
  return Math.floor(n)
}

function accumulateSalesByStoreMonth(
  salesRows: Awaited<ReturnType<typeof tryFetchPosSalesAnalyticsAggIgnoreTimeout>>,
  stores: string[],
  months: string[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const store of stores) out[store] = {}
  if (!salesRows?.length) return out

  for (const r of salesRows) {
    const ym = String(r.bucket_key ?? '').trim().slice(0, 7)
    if (!months.includes(ym)) continue
    const rawStore = String(r.bucket_key2 ?? '').trim()
    if (!rawStore || isPosSalesTestOfficeStoreCode(rawStore)) continue
    const total = Math.max(0, Number(r.total) || 0)
    if (total <= 0) continue
    for (const store of stores) {
      if (!rowMatchesSalesStoreSelection(rawStore, store)) continue
      out[store][ym] = (out[store][ym] || 0) + total
      break
    }
  }
  return out
}

export async function buildOutboundStoreMonthMatrix(params: {
  year: number
  /** 1–12 또는 null(연간) */
  month?: number | null
  /** 단일 매장만 (선택) */
  storeFilter?: string | null
  /** 행 순서·0원 매장 표시용 (출고 관리 storeTargets) */
  knownStores?: string[]
  /** Omni JWT tenantId */
  tenantId?: string
  tenantScope?: import('@/lib/saas-tenant-scope').SaasTenantScope
}): Promise<OutboundStoreMonthMatrixResult> {
  const year = params.year
  const month = params.month ?? null
  const { startStr, endStr } = resolveMatrixDateRange(year, month)
  const months =
    month != null
      ? [`${year}-${String(month).padStart(2, '0')}`]
      : expandBangkokYearMonthsInclusive(`${year}-01`, `${year}-12`)
  const storeFilter =
    params.storeFilter && params.storeFilter !== 'All' ? String(params.storeFilter).trim() : null

  let tenantScope = params.tenantScope
  if (!tenantScope && params.tenantId) {
    const { resolveSaasTenantScope } = await import('@/lib/saas-tenant-scope')
    tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: params.tenantId },
      storeCode: storeFilter,
    })
  }

  const [{ lines, hitRowCap }, salesRows] = await Promise.all([
    loadHqOutboundProcessedLines({
      startStr,
      endStr,
      storeFilter: storeFilter || null,
    }),
    tryFetchPosSalesAnalyticsAggIgnoreTimeout({
      startStr,
      endStr,
      storeCodes: storeFilter ? [storeFilter] : undefined,
      aggMode: 'period_by_store',
      periodGroup: 'month',
      tenantScope,
    }),
  ])
  const salesLoaded = salesRows != null

  const subByStoreMonth = new Map<string, Map<string, number>>()

  for (const line of lines) {
    const store = String(line.targetStore || '').trim()
    if (!store || isHeadOfficeLikeStoreName(store)) continue
    if (storeFilter && !storeMatchesIncomeFilter(store, storeFilter)) continue

    const ym = line.logDate.slice(0, 7)
    if (!months.includes(ym)) continue

    let byMonth = subByStoreMonth.get(store)
    if (!byMonth) {
      byMonth = new Map()
      subByStoreMonth.set(store, byMonth)
    }
    byMonth.set(ym, (byMonth.get(ym) || 0) + line.lineAmount)
  }

  const fromData = [...subByStoreMonth.keys()].sort((a, b) => a.localeCompare(b))
  const known = (params.knownStores || [])
    .map((s) => String(s || '').trim())
    .filter((s) => s && !isHeadOfficeLikeStoreName(s))
  const stores = [...new Set([...known, ...fromData])].sort((a, b) => a.localeCompare(b))

  const salesByStoreMonth = accumulateSalesByStoreMonth(salesRows, stores, months)

  const cells: OutboundStoreMonthMatrixResult['cells'] = {}
  const rowTotals: OutboundStoreMonthMatrixResult['rowTotals'] = {}
  const colSub: Record<string, number> = {}
  const colSales: Record<string, number> = {}
  for (const m of months) {
    colSub[m] = 0
    colSales[m] = 0
  }

  for (const store of stores) {
    let rowSubSum = 0
    let rowSalesSum = 0
    cells[store] = {}
    for (const m of months) {
      const raw = subByStoreMonth.get(store)?.get(m) || 0
      const sales = salesByStoreMonth[store]?.[m] || 0
      rowSubSum += raw
      rowSalesSum += sales
      colSub[m] = (colSub[m] || 0) + raw
      colSales[m] = (colSales[m] || 0) + sales
      cells[store][m] = raw || sales ? cellWithSales(raw, sales) : { ...EMPTY_CELL }
    }
    rowTotals[store] =
      rowSubSum || rowSalesSum ? cellWithSales(rowSubSum, rowSalesSum) : { ...EMPTY_CELL }
  }

  const colTotals: OutboundStoreMonthMatrixResult['colTotals'] = {}
  let grandSub = 0
  let grandSales = 0
  for (const m of months) {
    const s = colSub[m] || 0
    const sales = colSales[m] || 0
    grandSub += s
    grandSales += sales
    colTotals[m] = s || sales ? cellWithSales(s, sales) : { ...EMPTY_CELL }
  }

  const grandTotal =
    grandSub || grandSales ? cellWithSales(grandSub, grandSales) : { ...EMPTY_CELL }

  return {
    year,
    month,
    months,
    stores,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    hitRowCap,
    lineCount: lines.length,
    salesLoaded,
  }
}

export { mergeAmountCells, amountCellFromSubtotal, EMPTY_CELL as emptyOutboundStoreMonthCell }
