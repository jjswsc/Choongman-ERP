import { computeIncomeStatementReport } from '@/lib/accounting-reports'
import type { IncomeStatementData } from '@/lib/api-client/income-statement'
import { buildIncomeStatementViewNumbers } from '@/lib/income-statement-display'
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
import { buildManagementMarginPosSlice } from '@/lib/management-margin-pos-slice'
import { buildPosMenuCostIndex } from '@/lib/pos-menu-cost-index-server'
import {
  buildStoreNormalCostRow,
  type StoreNormalCostReport,
} from '@/lib/pos-store-normal-cost'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'
import { isOfficeStore } from '@/lib/permissions'

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

function monthSalesForVat(
  viewSales: number,
  report: { sales?: number; displayAmounts?: { salesNet?: number; salesGross?: number } },
  vatMode: 'included' | 'excluded'
): number {
  const monthSales = Number(viewSales) || 0
  if (monthSales > 0.0001) return monthSales
  const amounts = report.displayAmounts
  const net = Number(amounts?.salesNet) || 0
  const gross = Number(amounts?.salesGross) || Number(report.sales) || 0
  if (vatMode === 'included') return gross > 0.0001 ? gross : net
  return net > 0.0001 ? net : gross
}

async function loadAccountingPl(params: {
  storeCode: string
  months: string[]
  auth: AccountingStoreAuthScope
}): Promise<{
  excluded: { sales: number; cogs: number }
  included: { sales: number; cogs: number }
} | null> {
  if (!params.months.length) return null
  let excludedSales = 0
  let excludedCogs = 0
  let includedSales = 0
  let includedCogs = 0
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
    const data = report as unknown as IncomeStatementData
    const excluded = buildIncomeStatementViewNumbers({ data, vatMode: 'excluded' })
    const included = buildIncomeStatementViewNumbers({ data, vatMode: 'included' })
    excludedSales += monthSalesForVat(excluded.sales, report, 'excluded')
    excludedCogs += Number(excluded.cogs) || 0
    includedSales += monthSalesForVat(included.sales, report, 'included')
    includedCogs += Number(included.cogs) || 0
  }
  return {
    excluded: { sales: round2(excludedSales), cogs: round2(excludedCogs) },
    included: { sales: round2(includedSales), cogs: round2(includedCogs) },
  }
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

  const [catalog, costIndex, fetchResult] = await Promise.all([
    loadPosSalesPromoPricingCatalog(),
    buildPosMenuCostIndex(),
    fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes,
      select: POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT,
      queryLabel: 'posStoreNormalCost',
      tenantScope,
    }),
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

  const rows = await mapPool(storeList, 3, async (storeCode) => {
    const orders = byStore.get(storeCode) ?? []
    const slice = buildManagementMarginPosSlice({
      orderRows: orders,
      catalog,
      costIndex,
    })
    const usageWarnings: string[] = []
    let accountingSales: number | null = null
    let accountingCogs: number | null = null
    let accountingSalesIncluded: number | null = null
    let accountingCogsIncluded: number | null = null
    try {
      const pl = await loadAccountingPl({
        storeCode,
        months,
        auth: params.auth,
      })
      accountingSales = pl?.excluded.sales ?? null
      accountingCogs = pl?.excluded.cogs ?? null
      accountingSalesIncluded = pl?.included.sales ?? null
      accountingCogsIncluded = pl?.included.cogs ?? null
      if (!(accountingSales != null && accountingSales > 0.0001) && slice.netSales > 0.0001) {
        accountingSales = round2(slice.netSales)
      }
    } catch {
      usageWarnings.push('ACCOUNTING_LOAD_FAILED')
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
      combinedDiscount: slice.totalDiscount,
      accountingSales,
      accountingCogs,
      accountingSalesIncluded,
      accountingCogsIncluded,
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
