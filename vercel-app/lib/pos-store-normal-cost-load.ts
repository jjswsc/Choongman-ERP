import { computeIncomeStatementReport } from '@/lib/accounting-reports'
import {
  parseCommaSeparatedStoreFilter,
  resolveAccountingStoreFilterFromAuth,
  resolveFranchiseeAccountingAllowedStoresOnly,
  resolvePosStoreCodesForAccountingScope,
  type AccountingStoreAuthScope,
} from '@/lib/accounting-store-scope'
import { expandBangkokYearMonthsInclusive, getBangkokMonthRange } from '@/lib/bangkok-time'
import { isFinancialStatementStoreNone } from '@/lib/financial-statement-store-options'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import {
  aggregateTheoreticalIngredientQty,
  fetchIngredientActualUsageRows,
} from '@/lib/ingredient-usage-variance'
import { buildManagementMarginPosSlice } from '@/lib/management-margin-pos-slice'
import { buildPosMenuBomIndex } from '@/lib/pos-menu-bom-explode'
import { buildPosMenuCostIndex } from '@/lib/pos-menu-cost-index-server'
import {
  buildStoreNormalCostRow,
  sumIngredientUsageMoney,
  type StoreNormalCostReport,
} from '@/lib/pos-store-normal-cost'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'
import { isOfficeStore } from '@/lib/permissions'
import { supabaseSelectAllPages } from '@/lib/supabase-server'

type OrderRow = {
  store_code?: string
  order_type?: string
  items_json?: string
  total?: number
  vat?: number
  discount_amt?: number
  coupon_discount_amt?: number
  discount_reason?: string
  applied_coupons?: unknown
  coupon_code?: string
  delivery_app_code?: string | null
  tier_discount_amt?: number | null
  member_tier_code?: string | null
  memo?: string | null
}

type ItemRow = {
  code?: string
  cost?: number
  price?: number
  total_quantity?: number | null
  unit?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isStoreCode(code: string): boolean {
  const s = String(code || '').trim()
  if (!s) return false
  if (isOfficeStore(s) || isHeadOfficeLikeStoreName(s)) return false
  return true
}

function accountingMonthsAligned(startStr: string, endStr: string): boolean {
  const months = expandBangkokYearMonthsInclusive(startStr.slice(0, 7), endStr.slice(0, 7))
  if (!months.length) return false
  const start = getBangkokMonthRange(months[0]).startStr
  const end = getBangkokMonthRange(months[months.length - 1]!).endStr
  return start === startStr.slice(0, 10) && end === endStr.slice(0, 10)
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

async function loadAccountingCogs(params: {
  storeCode: string
  months: string[]
  auth: AccountingStoreAuthScope
}): Promise<number | null> {
  if (!params.months.length) return null
  let sum = 0
  for (const yearMonth of params.months) {
    const report = await computeIncomeStatementReport({
      yearMonth,
      storeFilter: params.storeCode,
      userRole: params.auth.userRole,
      userStore: params.auth.userStore,
      allowedStores: params.auth.allowedStores,
      tenantId: params.auth.tenantId,
      includeDebug: false,
    })
    sum += Number(report.cogs) || 0
  }
  return round2(sum)
}

function emptyReport(params: {
  startStr: string
  endStr: string
  storeFilter: string
  warnings: string[]
}): StoreNormalCostReport {
  return {
    startStr: params.startStr,
    endStr: params.endStr,
    storeFilter: params.storeFilter,
    posTruncated: false,
    accountingMonthAligned: accountingMonthsAligned(params.startStr, params.endStr),
    warnings: params.warnings,
    rows: [],
  }
}

export async function computePosStoreNormalCost(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  auth: AccountingStoreAuthScope
}): Promise<StoreNormalCostReport> {
  const startStr = String(params.startStr || '').trim().slice(0, 10)
  const endStr = String(params.endStr || '').trim().slice(0, 10)
  const storeFilter = resolveAccountingStoreFilterFromAuth(params.storeFilter, params.auth)
  const warnings: string[] = []

  if (isFinancialStatementStoreNone(storeFilter)) {
    return emptyReport({ startStr, endStr, storeFilter, warnings: ['STORE_NOT_SELECTED'] })
  }
  const hqScope =
    storeFilter === '본사' || isOfficeStore(storeFilter) || isHeadOfficeLikeStoreName(storeFilter)
  if (hqScope) {
    return emptyReport({ startStr, endStr, storeFilter, warnings: ['OFFICE_SCOPE_NO_POS'] })
  }

  const allowedStoresOnly = resolveFranchiseeAccountingAllowedStoresOnly(params.auth)
  const multi = parseCommaSeparatedStoreFilter(storeFilter)
  const scope = {
    storeFilter,
    allowedStoresOnly,
    selectedStoresOnly: multi && multi.length > 1 ? multi : undefined,
  }
  const storeCodes = resolvePosStoreCodesForAccountingScope(scope)
  const months = expandBangkokYearMonthsInclusive(startStr.slice(0, 7), endStr.slice(0, 7))
  const accountingMonthAligned = accountingMonthsAligned(startStr, endStr)
  if (!accountingMonthAligned) warnings.push('ACCOUNTING_FULL_MONTH')

  const { resolveSaasTenantScope } = await import('@/lib/saas-tenant-scope')
  const tenantScope = await resolveSaasTenantScope({
    auth: params.auth.tenantId ? { tenantId: params.auth.tenantId } : null,
    storeCode: storeCodes?.[0] ?? null,
  })

  const [catalog, costIndex, bomIndex, fetchResult, itemsRaw] = await Promise.all([
    loadPosSalesPromoPricingCatalog(),
    buildPosMenuCostIndex(),
    buildPosMenuBomIndex(),
    fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes,
      select: POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT,
      queryLabel: 'posStoreNormalCost',
      tenantScope,
    }),
    supabaseSelectAllPages('items', {
      order: 'code.asc',
      select: 'code,cost,price,total_quantity,unit',
    }).catch(() => []) as Promise<ItemRow[]>,
  ])

  if (fetchResult.truncated) warnings.push('POS_TRUNCATED')
  const completed = filterCompletedPosSalesRows(fetchResult.rows, null) as OrderRow[]
  const byStore = new Map<string, OrderRow[]>()
  for (const row of completed) {
    const code = String(row.store_code ?? '').trim()
    if (!isStoreCode(code)) continue
    const list = byStore.get(code) ?? []
    list.push(row)
    byStore.set(code, list)
  }

  const explicit = (storeCodes ?? []).filter(isStoreCode)
  const storeList = explicit.length > 0 ? explicit : [...byStore.keys()]
  const items = (itemsRaw || [])
    .map((it) => ({
      code: String(it.code || '').trim(),
      cost: it.cost,
      price: it.price,
      total_quantity: it.total_quantity,
      unit: it.unit,
    }))
    .filter((it) => it.code)

  const rows = await mapPool(storeList, 3, async (storeCode) => {
    const orders = byStore.get(storeCode) ?? []
    const slice = buildManagementMarginPosSlice({
      orderRows: orders,
      catalog,
      costIndex,
    })
    const usageWarnings: string[] = []
    let ingredientTheoryCost = 0
    let actualUsageCost = 0
    let hasEndingCount = false
    try {
      const qty = aggregateTheoreticalIngredientQty(bomIndex, orders)
      const actual = await fetchIngredientActualUsageRows({
        store: storeCode,
        startYmd: startStr,
        endYmd: endStr,
        tenantId: params.auth.tenantId,
      })
      usageWarnings.push(...actual.warnings)
      if (actual.source === 'none') hasEndingCount = false
      const money = sumIngredientUsageMoney({
        theoreticalQtyByCode: qty.byItem,
        typeByCode: qty.typeByItem,
        actualRows: actual.rows,
        items,
      })
      ingredientTheoryCost = money.theoreticalCost
      actualUsageCost = money.actualCost
      hasEndingCount = actual.source !== 'none' && money.hasEndingCount
    } catch {
      usageWarnings.push('USAGE_LOAD_FAILED')
      hasEndingCount = false
    }

    let accountingCogs: number | null = null
    try {
      accountingCogs = await loadAccountingCogs({
        storeCode,
        months,
        auth: params.auth,
      })
    } catch {
      usageWarnings.push('ACCOUNTING_LOAD_FAILED')
      accountingCogs = null
    }

    return buildStoreNormalCostRow({
      storeCode,
      orderCount: slice.periodOrderCount,
      grossSales: slice.grossSalesBeforeDiscount,
      netSales: slice.netSales,
      bomCost: slice.theoreticalCost.totalCost,
      matchedLineQty: slice.theoreticalCost.matchedLineQty,
      unmatchedLineQty: slice.theoreticalCost.unmatchedLineQty,
      discountKinds: slice.combined.byKind.map((k) => ({
        layer: k.layer,
        kind: k.kind,
        discountAmount: k.discountAmount,
      })),
      ingredientTheoryCost,
      actualUsageCost,
      hasEndingCount,
      accountingCogs,
      usageWarnings,
    })
  })

  rows.sort((a, b) => b.netSales - a.netSales || a.storeCode.localeCompare(b.storeCode))

  return {
    startStr,
    endStr,
    storeFilter,
    posTruncated: fetchResult.truncated,
    accountingMonthAligned,
    warnings,
    rows,
  }
}
