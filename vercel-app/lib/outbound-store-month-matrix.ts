/**
 * 출고 관리 — 매장×월별 금액 행렬 (실제 stock_logs, 출고 관리·손익과 동일 단가).
 */
import { expandBangkokYearMonthsInclusive } from '@/lib/bangkok-time'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { loadHqOutboundProcessedLines } from '@/lib/hq-outbound-income-total'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'

export type OutboundStoreMonthAmountCell = {
  subtotal: number
  vat: number
  grandTotal: number
}

export type OutboundStoreMonthMatrixResult = {
  year: number
  months: string[]
  stores: string[]
  cells: Record<string, Record<string, OutboundStoreMonthAmountCell>>
  rowTotals: Record<string, OutboundStoreMonthAmountCell>
  colTotals: Record<string, OutboundStoreMonthAmountCell>
  grandTotal: OutboundStoreMonthAmountCell
  hitRowCap: boolean
  lineCount: number
}

const EMPTY_CELL: OutboundStoreMonthAmountCell = { subtotal: 0, vat: 0, grandTotal: 0 }

function amountCellFromSubtotal(raw: number): OutboundStoreMonthAmountCell {
  const t = thaiInvoiceTotalsFromRawSubtotal(raw)
  return {
    subtotal: t.subtotalRounded,
    vat: t.vatRounded,
    grandTotal: t.grandTotal,
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

export async function buildOutboundStoreMonthMatrix(params: {
  year: number
  /** 단일 매장만 (선택) */
  storeFilter?: string | null
  /** 행 순서·0원 매장 표시용 (출고 관리 storeTargets) */
  knownStores?: string[]
}): Promise<OutboundStoreMonthMatrixResult> {
  const year = params.year
  const startStr = `${year}-01-01`
  const endStr = `${year}-12-31`
  const months = expandBangkokYearMonthsInclusive(`${year}-01`, `${year}-12`)
  const storeFilter =
    params.storeFilter && params.storeFilter !== 'All' ? String(params.storeFilter).trim() : null

  const { lines, hitRowCap } = await loadHqOutboundProcessedLines({
    startStr,
    endStr,
    storeFilter: storeFilter || null,
  })

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

  const cells: OutboundStoreMonthMatrixResult['cells'] = {}
  const rowTotals: OutboundStoreMonthMatrixResult['rowTotals'] = {}
  const colSub: Record<string, number> = {}
  for (const m of months) colSub[m] = 0

  for (const store of stores) {
    const rowSub: Record<string, number> = {}
    let rowSubSum = 0
    cells[store] = {}
    for (const m of months) {
      const raw = subByStoreMonth.get(store)?.get(m) || 0
      rowSub[m] = raw
      rowSubSum += raw
      colSub[m] = (colSub[m] || 0) + raw
      cells[store][m] = raw ? amountCellFromSubtotal(raw) : { ...EMPTY_CELL }
    }
    rowTotals[store] = rowSubSum ? amountCellFromSubtotal(rowSubSum) : { ...EMPTY_CELL }
  }

  const colTotals: OutboundStoreMonthMatrixResult['colTotals'] = {}
  let grandSub = 0
  for (const m of months) {
    const s = colSub[m] || 0
    grandSub += s
    colTotals[m] = s ? amountCellFromSubtotal(s) : { ...EMPTY_CELL }
  }

  const grandTotal = grandSub ? amountCellFromSubtotal(grandSub) : { ...EMPTY_CELL }

  return {
    year,
    months,
    stores,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    hitRowCap,
    lineCount: lines.length,
  }
}

export { mergeAmountCells, amountCellFromSubtotal, EMPTY_CELL as emptyOutboundStoreMonthCell }
