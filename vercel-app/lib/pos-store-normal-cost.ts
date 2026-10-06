/**
 * 매장 정상 원가 — 판매 메뉴 BOM을 정상 원가로 두고 손익 매출원가율과 비교한다.
 * 표의 할인은 통합 할인 한 칸. 실소진은 넣지 않는다.
 */
import { getItemCostPerUnit } from '@/lib/item-cost-util'
import { toPosCostSalesExclVat } from '@/lib/pos-cost-vat'
import { STOCK_TAKE_COVERAGE_WARN } from '@/lib/stock-take-kpi'

/** 원가 분석과 동일: 미매칭 수량 비중이 이 값 이상이면 BOM 안내 */
export const STORE_NORMAL_COST_BOM_UNMATCHED_HOLD_PCT = 10
export const STORE_NORMAL_COST_ENGINE_GAP_HOLD_PCT = 5

export type StoreNormalCostHoldReason = 'bom_unmatched'

export type StoreNormalCostDiscountBucket = 'hq' | 'store' | 'unclassified'

export type StoreNormalCostDiscountLine = {
  layer: 'bundle' | 'payment'
  kind: string
  bucket: StoreNormalCostDiscountBucket
  /** 부가세 제외 */
  amount: number
}

export type StoreNormalCostKindAmount = {
  layer: 'bundle' | 'payment'
  kind: string
  /** 통합 할인 집계 원천 — VAT 포함 */
  discountAmount: number
}

export type StoreNormalCostReport = {
  startStr: string
  endStr: string
  storeFilter: string
  posTruncated: boolean
  /** 조회 기간이 방콕 월의 1일~말일과 같으면 회계 매출원가와 기간이 맞다 */
  accountingMonthAligned: boolean
  warnings: string[]
  rows: StoreNormalCostRow[]
}

export type StoreNormalCostRow = {
  storeCode: string
  orderCount: number
  grossSales: number
  netSales: number
  /** 통합 할인(부가세 제외). 정가 − 실수령 */
  totalDiscount: number
  /** 실수령 ÷ 정가 */
  netSharePct: number
  /** 통합 할인 ÷ 정가. 실수령%와 더하면 정가 100% */
  discountSharePct: number
  hqDiscount: number
  storeDiscount: number
  unclassifiedDiscount: number
  bomCost: number
  normalCostPctOfGross: number
  /** 이론 원가율 = 정상 원가 ÷ 실수령 */
  normalCostPctOfNet: number
  accountingSales: number | null
  accountingCogs: number | null
  /** 실제 원가율 = 손익 매출원가 ÷ 손익 매출(부가세 제외) */
  plCostPct: number | null
  /** 실제 원가율 − 이론 원가율 */
  vsPlPct: number | null
  /** 손익 매출원가 − 정상 원가(BOM) */
  vsPlAmt: number | null
  holdReasons: StoreNormalCostHoldReason[]
  matchedLineQty: number
  unmatchedLineQty: number
  discountLines: StoreNormalCostDiscountLine[]
  usageWarnings: string[]
}

export type IngredientUsageMoneyInput = {
  theoreticalQtyByCode: Record<string, number>
  typeByCode?: Record<string, 'food' | 'packaging'>
  actualRows: { item_code: string; actual_usage_qty: number; has_adjustment?: boolean }[]
  items: {
    code: string
    cost?: number
    price?: number
    total_quantity?: number | null
    unit?: string
  }[]
}

export type IngredientUsageMoney = {
  theoreticalCost: number
  actualCost: number
  coverage: number
  adjCount: number
  rowCount: number
  hasEndingCount: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

export function classifyStoreNormalCostDiscount(
  layer: 'bundle' | 'payment',
  kind: string
): StoreNormalCostDiscountBucket {
  if (layer === 'payment' && kind === 'manual') return 'store'
  if (layer === 'payment' && (kind === 'collab' || kind === 'coupon' || kind === 'platform' || kind === 'tier')) {
    return 'hq'
  }
  if (layer === 'bundle' && (kind === 'set' || kind === 'campaign' || kind === 'platform')) return 'hq'
  return 'unclassified'
}

export function splitStoreNormalCostDiscounts(
  kinds: StoreNormalCostKindAmount[]
): {
  hqDiscount: number
  storeDiscount: number
  unclassifiedDiscount: number
  lines: StoreNormalCostDiscountLine[]
} {
  let hq = 0
  let store = 0
  let other = 0
  const lines: StoreNormalCostDiscountLine[] = []
  for (const row of kinds) {
    const amount = toPosCostSalesExclVat(row.discountAmount)
    if (amount <= 0.0001) continue
    const bucket = classifyStoreNormalCostDiscount(row.layer, row.kind)
    if (bucket === 'hq') hq += amount
    else if (bucket === 'store') store += amount
    else other += amount
    lines.push({ layer: row.layer, kind: row.kind, bucket, amount })
  }
  lines.sort((a, b) => b.amount - a.amount)
  return {
    hqDiscount: round2(hq),
    storeDiscount: round2(store),
    unclassifiedDiscount: round2(other),
    lines,
  }
}

export function sumIngredientUsageMoney(params: IngredientUsageMoneyInput): IngredientUsageMoney {
  const meta = new Map<string, IngredientUsageMoneyInput['items'][number]>()
  for (const item of params.items) {
    const code = String(item.code || '').trim()
    if (code) meta.set(code, item)
  }
  const actualByCode = new Map<string, { qty: number; hasAdjustment: boolean }>()
  for (const row of params.actualRows) {
    const code = String(row.item_code || '').trim()
    if (!code) continue
    const prev = actualByCode.get(code)
    actualByCode.set(code, {
      qty: (prev?.qty ?? 0) + (Number(row.actual_usage_qty) || 0),
      hasAdjustment: Boolean(prev?.hasAdjustment || row.has_adjustment),
    })
  }
  const codes = new Set<string>([
    ...Object.keys(params.theoreticalQtyByCode),
    ...actualByCode.keys(),
  ])
  let theoreticalCost = 0
  let actualCost = 0
  let adjCount = 0
  let rowCount = 0
  for (const code of codes) {
    rowCount += 1
    const act = actualByCode.get(code)
    if (act?.hasAdjustment) adjCount += 1
    const item = meta.get(code)
    const ingredientType = params.typeByCode?.[code]
    const unitCost = item
      ? getItemCostPerUnit(
          {
            cost: item.cost,
            price: item.price,
            total_quantity: item.total_quantity,
            unit: item.unit,
          },
          ingredientType === 'packaging'
        )
      : 0
    const cost = Number.isFinite(unitCost) ? unitCost : 0
    const theoQty = Number(params.theoreticalQtyByCode[code]) || 0
    const actualQty = act?.qty ?? 0
    theoreticalCost += round2(theoQty * cost)
    actualCost += round2(actualQty * cost)
  }
  const coverage = rowCount > 0 ? adjCount / rowCount : 0
  return {
    theoreticalCost: round2(theoreticalCost),
    actualCost: round2(actualCost),
    coverage: round2(coverage),
    adjCount,
    rowCount,
    hasEndingCount: rowCount > 0 && coverage >= STOCK_TAKE_COVERAGE_WARN,
  }
}

export function buildStoreNormalCostRow(params: {
  storeCode: string
  orderCount: number
  grossSales: number
  netSales: number
  bomCost: number
  matchedLineQty: number
  unmatchedLineQty: number
  discountKinds: StoreNormalCostKindAmount[]
  /** 정가에 이미 반영된 통합 할인. 없으면 종류별 합계 */
  combinedDiscount?: number | null
  accountingSales: number | null
  accountingCogs: number | null
  usageWarnings?: string[]
}): StoreNormalCostRow {
  const discounts = splitStoreNormalCostDiscounts(params.discountKinds)
  const grossSales = round2(params.grossSales)
  const netSales = round2(params.netSales)
  const fromKinds = round2(discounts.hqDiscount + discounts.storeDiscount + discounts.unclassifiedDiscount)
  const totalDiscount =
    params.combinedDiscount != null && Number.isFinite(params.combinedDiscount)
      ? round2(params.combinedDiscount)
      : fromKinds
  const bomCost = round2(params.bomCost)
  const accountingSales =
    params.accountingSales == null || !Number.isFinite(params.accountingSales)
      ? null
      : round2(params.accountingSales)
  const accountingCogs =
    params.accountingCogs == null || !Number.isFinite(params.accountingCogs)
      ? null
      : round2(params.accountingCogs)
  const normalCostPctOfNet = pctOf(bomCost, netSales)
  const plCostPct =
    accountingCogs != null && accountingSales != null ? pctOf(accountingCogs, accountingSales) : null
  const vsPlPct = plCostPct == null ? null : round2(plCostPct - normalCostPctOfNet)
  const vsPlAmt = accountingCogs == null ? null : round2(accountingCogs - bomCost)

  const matched = Math.max(0, params.matchedLineQty)
  const unmatched = Math.max(0, params.unmatchedLineQty)
  const lineTotal = matched + unmatched
  const unmatchedPct = lineTotal > 0 ? (unmatched / lineTotal) * 100 : 0
  const holdReasons: StoreNormalCostHoldReason[] = []
  if (unmatched > 0 && unmatchedPct >= STORE_NORMAL_COST_BOM_UNMATCHED_HOLD_PCT) {
    holdReasons.push('bom_unmatched')
  }

  return {
    storeCode: params.storeCode,
    orderCount: params.orderCount,
    grossSales,
    netSales,
    totalDiscount,
    netSharePct: pctOf(netSales, grossSales),
    discountSharePct: pctOf(totalDiscount, grossSales),
    hqDiscount: discounts.hqDiscount,
    storeDiscount: discounts.storeDiscount,
    unclassifiedDiscount: discounts.unclassifiedDiscount,
    bomCost,
    normalCostPctOfGross: pctOf(bomCost, grossSales),
    normalCostPctOfNet,
    accountingSales,
    accountingCogs,
    plCostPct,
    vsPlPct,
    vsPlAmt,
    holdReasons,
    matchedLineQty: matched,
    unmatchedLineQty: unmatched,
    discountLines: discounts.lines,
    usageWarnings: params.usageWarnings ?? [],
  }
}
