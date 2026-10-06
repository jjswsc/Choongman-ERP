/**
 * 매장 정상 원가 — 판매 메뉴 BOM을 정상 원가로 두고 손익 매출원가율과 비교한다.
 * 표의 할인은 통합 할인 한 칸. 실소진은 넣지 않는다.
 */
import { getItemCostPerUnit } from '@/lib/item-cost-util'
import { convertLineAmount, type IncomeStatementAmountBasisKind } from '@/lib/income-statement-display'
import type { NetVatBuckets } from '@/lib/income-statement-item-vat'
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
  /** 부가세 포함. 집계 원천 */
  amountIncluded?: number | null
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
  /** 정가·실수령·통합 할인 (부가세 포함). 없으면 화면이 제외 금액×1.07로 본다 */
  grossSalesIncluded?: number | null
  netSalesIncluded?: number | null
  totalDiscountIncluded?: number | null
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
  /** 정상 원가 ÷ 정가 */
  normalCostPctOfGross: number
  /** 정상 원가 ÷ 실수령. 화면 이론 원가율은 쓰지 않는다 */
  normalCostPctOfNet: number
  /** 이론 원가율 = 정상 원가 ÷ 실수령. 정가 기준 원가율을 할인 후 남은 금액으로 다시 나눈 값 */
  theoryCostPct: number
  /** 손익 매출·매출원가 (부가세 제외). 화면은 손익계산서 VAT 설정을 따른다 */
  accountingSales: number | null
  accountingCogs: number | null
  /** 손익 매출·매출원가 (부가세 포함). 손익계산서 VAT 포함과 같은 금액 */
  accountingSalesIncluded?: number | null
  accountingCogsIncluded?: number | null
  /** 실제 원가율 = 손익 매출원가 ÷ 손익 매출(부가세 제외 보관값) */
  plCostPct: number | null
  /** 실제 원가율 − 이론 원가율(실수령) */
  vsPlPct: number | null
  /** 손익 매출원가 − 정상 원가(BOM) */
  vsPlAmt: number | null
  holdReasons: StoreNormalCostHoldReason[]
  matchedLineQty: number
  unmatchedLineQty: number
  discountLines: StoreNormalCostDiscountLine[]
  /** 손익 매입 거래처. amount는 원천 금액이고 화면에서 부가세 기준으로 환산한다 */
  purchaseVendors?: StoreNormalPurchaseVendor[]
  /** 매입 품목 과세/면세 — 거래처 금액을 포함으로 볼 때 사용 */
  purchaseVatBuckets?: NetVatBuckets | null
  usageWarnings: string[]
}

export type StoreNormalPurchaseVendor = {
  key: string
  label?: string
  amount: number
  amountBasis?: IncomeStatementAmountBasisKind
  vatAmount?: number
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

function finiteMoney(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return round2(n)
}

export type StoreNormalVatMode = 'included' | 'excluded'

const THAI_VAT_GROSS_UP = 1.07

function grossUpThaiVat(amount: number): number {
  return round2((Number(amount) || 0) * THAI_VAT_GROSS_UP)
}

/** 정가·할인·실수령. 이론 원가율은 항상 제외 금액으로 따로 계산한다. */
export function resolveStoreNormalPosSales(
  row: Pick<
    StoreNormalCostRow,
    | 'grossSales'
    | 'netSales'
    | 'totalDiscount'
    | 'grossSalesIncluded'
    | 'netSalesIncluded'
    | 'totalDiscountIncluded'
  >,
  vatMode: StoreNormalVatMode
): { gross: number; discount: number; net: number } {
  const grossEx = round2(Number(row.grossSales) || 0)
  const netEx = round2(Number(row.netSales) || 0)
  const discountEx = Number.isFinite(row.totalDiscount) ? round2(row.totalDiscount) : round2(grossEx - netEx)
  if (vatMode !== 'included') {
    return { gross: grossEx, discount: discountEx, net: netEx }
  }
  const net = finiteMoney(row.netSalesIncluded) ?? grossUpThaiVat(netEx)
  const discount = finiteMoney(row.totalDiscountIncluded) ?? grossUpThaiVat(discountEx)
  const gross = finiteMoney(row.grossSalesIncluded) ?? round2(net + discount)
  return { gross, discount, net }
}

/** 정상 원가. 포함이면 공급가에 7%를 더한다. 이론 원가율은 이 금액÷같은 기준 실수령이다. */
export function resolveStoreNormalBom(bomCost: number, vatMode: StoreNormalVatMode): number {
  const bom = round2(Number(bomCost) || 0)
  if (vatMode !== 'included') return bom
  return round2(bom * THAI_VAT_GROSS_UP)
}

export function mergeStoreNormalPurchaseVendors(
  lists: Array<StoreNormalPurchaseVendor[] | null | undefined>
): StoreNormalPurchaseVendor[] {
  const into = new Map<string, StoreNormalPurchaseVendor>()
  for (const list of lists) {
    for (const row of list ?? []) {
      const key = String(row.key || '').trim()
      const amount = Number(row.amount) || 0
      if (!key || amount <= 0.0001) continue
      const prev = into.get(key)
      const vat = Number(row.vatAmount) || 0
      if (!prev) {
        into.set(key, {
          key,
          label: String(row.label || '').trim() || undefined,
          amount: round2(amount),
          amountBasis: row.amountBasis,
          vatAmount: vat > 0.0001 ? round2(vat) : undefined,
        })
        continue
      }
      prev.amount = round2(prev.amount + amount)
      const nextVat = (prev.vatAmount || 0) + vat
      prev.vatAmount = nextVat > 0.0001 ? round2(nextVat) : prev.vatAmount
      if (!prev.label && row.label) prev.label = String(row.label).trim() || undefined
      if (!prev.amountBasis && row.amountBasis) prev.amountBasis = row.amountBasis
    }
  }
  return [...into.values()].sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key))
}

export function listStoreNormalPurchaseVendors(
  row: Pick<StoreNormalCostRow, 'purchaseVendors' | 'purchaseVatBuckets'>,
  vatMode: StoreNormalVatMode
): { key: string; label?: string; amount: number; sharePct: number }[] {
  const lines = (row.purchaseVendors ?? [])
    .map((vendor) => ({
      key: vendor.key,
      label: vendor.label,
      amount: convertLineAmount(vendor.amount, vendor.amountBasis ?? 'stock_net', vatMode, row.purchaseVatBuckets, vendor.vatAmount),
    }))
    .filter((line) => line.amount > 0.0001)
    .sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key))
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  return lines.map((line) => ({
    ...line,
    sharePct: total > 0.0001 ? (line.amount / total) * 100 : 0,
  }))
}

export function resolveStoreNormalDiscountAmount(
  line: Pick<StoreNormalCostDiscountLine, 'amount' | 'amountIncluded'>,
  vatMode: StoreNormalVatMode
): number {
  if (vatMode !== 'included') return round2(line.amount)
  return finiteMoney(line.amountIncluded) ?? grossUpThaiVat(line.amount)
}

/** 손익계산서 VAT 토글과 같은 매출·매출원가. 포함 금액이 없으면 제외로 내려간다. */
export function resolveStoreNormalAccounting(
  row: Pick<
    StoreNormalCostRow,
    'accountingSales' | 'accountingCogs' | 'accountingSalesIncluded' | 'accountingCogsIncluded'
  >,
  vatMode: StoreNormalVatMode
): { sales: number | null; cogs: number | null; costPct: number | null } {
  const useIncluded = vatMode === 'included'
  const sales = useIncluded ? (row.accountingSalesIncluded ?? null) : row.accountingSales
  const cogs = useIncluded ? (row.accountingCogsIncluded ?? null) : row.accountingCogs
  const salesOk = sales != null && Number.isFinite(sales) ? sales : null
  const cogsOk = cogs != null && Number.isFinite(cogs) ? cogs : null
  if (useIncluded && (salesOk == null || cogsOk == null)) {
    return resolveStoreNormalAccounting(row, 'excluded')
  }
  const costPct =
    salesOk != null && cogsOk != null && salesOk > 0.0001 ? (cogsOk / salesOk) * 100 : null
  return { sales: salesOk, cogs: cogsOk, costPct }
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
    lines.push({
      layer: row.layer,
      kind: row.kind,
      bucket,
      amount,
      amountIncluded: round2(Math.max(0, Number(row.discountAmount) || 0)),
    })
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
  accountingSalesIncluded?: number | null
  accountingCogsIncluded?: number | null
  grossSalesIncluded?: number | null
  netSalesIncluded?: number | null
  totalDiscountIncluded?: number | null
  purchaseVendors?: StoreNormalPurchaseVendor[]
  purchaseVatBuckets?: NetVatBuckets | null
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
  const accountingSalesIncluded = finiteMoney(params.accountingSalesIncluded)
  const accountingCogsIncluded = finiteMoney(params.accountingCogsIncluded)
  const normalCostPctOfGross = pctOf(bomCost, grossSales)
  const discountSharePct = pctOf(totalDiscount, grossSales)
  const normalCostPctOfNet = pctOf(bomCost, netSales)
  const theoryCostPct = normalCostPctOfNet
  const plCostPct =
    accountingCogs != null && accountingSales != null && accountingSales > 0.0001
      ? pctOf(accountingCogs, accountingSales)
      : null
  const vsPlPct = plCostPct == null ? null : round2(plCostPct - theoryCostPct)
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
    discountSharePct,
    hqDiscount: discounts.hqDiscount,
    storeDiscount: discounts.storeDiscount,
    unclassifiedDiscount: discounts.unclassifiedDiscount,
    bomCost,
    normalCostPctOfGross,
    normalCostPctOfNet,
    theoryCostPct,
    accountingSales,
    accountingCogs,
    accountingSalesIncluded,
    accountingCogsIncluded,
    grossSalesIncluded: finiteMoney(params.grossSalesIncluded),
    netSalesIncluded: finiteMoney(params.netSalesIncluded),
    totalDiscountIncluded: finiteMoney(params.totalDiscountIncluded),
    plCostPct,
    vsPlPct,
    vsPlAmt,
    holdReasons,
    matchedLineQty: matched,
    unmatchedLineQty: unmatched,
    discountLines: discounts.lines,
    purchaseVendors: mergeStoreNormalPurchaseVendors([params.purchaseVendors]),
    purchaseVatBuckets: params.purchaseVatBuckets ?? null,
    usageWarnings: params.usageWarnings ?? [],
  }
}
