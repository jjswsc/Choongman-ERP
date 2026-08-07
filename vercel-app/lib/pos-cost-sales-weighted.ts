import {
  parseCommaSeparatedStoreFilter,
  resolveAccountingStoreFilterFromAuth,
  resolveFranchiseeAccountingAllowedStoresOnly,
  resolvePosStoreCodesForAccountingScope,
  type AccountingStoreAuthScope,
} from '@/lib/accounting-store-scope'
import {
  isFinancialStatementStoreNone,
} from '@/lib/financial-statement-store-options'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import {
  buildManagementMarginPosSlice,
  resolveManagementMarginChannel,
  type ManagementMarginChannelKey,
  type ManagementMarginChannelRow,
} from '@/lib/management-margin-pos-slice'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_MENU_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'
import { buildPosMenuCostIndex } from '@/lib/pos-menu-cost-index-server'
import { isOfficeStore } from '@/lib/permissions'
import {
  aggregatePosCostWeightedByCategory,
  computeExactBomCostPct,
  sumPosCostCategoryWeightedTotals,
  type PosCostCategoryWeightedMeta,
  type PosCostCategoryWeightedRow,
} from '@/lib/pos-cost-category-weighted'
import { buildTheoreticalCostResolveContext } from '@/lib/management-margin-theoretical-cost'
import { supabaseSelect } from '@/lib/supabase-server'
import type { PosMenuCatalogRow } from '@/lib/pos-sales-menu-hierarchy-aggregate'

export type PosCostSalesWeightedChannelFilter = 'all' | ManagementMarginChannelKey

export type PosCostSalesWeightedSummary = {
  /** BOM 매칭(+할인 반영) 순매출 — 원가율 분모 */
  netSales: number
  /** POS 주문 전체 순매출(미매칭 포함, 참고용) */
  posNetSales: number
  /** 미매칭으로 원가율 분모에서 제외한 매출 */
  excludedUnmatchedSales: number
  /** 매칭 매출 / POS 전체 매출 (%) */
  salesCoveragePct: number
  grossSalesBeforeDiscount: number
  totalCost: number
  foodCost: number
  packagingCost: number
  /** 매칭 매출 대비 이론 원가율(합÷합) */
  costPctOfNet: number
  /** 옵션→기본 BOM 폴백 라인을 뺀 원가율(폴백 없으면 costPctOfNet과 동일) */
  costPctOfNetExactBom: number
  costPctOfGross: number
  matchedLineQty: number
  unmatchedLineQty: number
  periodOrderCount: number
  miseRatePercent: number
}

export type PosCostSalesWeightedResult = {
  startStr: string
  endStr: string
  storeFilter: string
  channel: PosCostSalesWeightedChannelFilter
  posTruncated: boolean
  warnings: string[]
  summary: PosCostSalesWeightedSummary | null
  byChannel: ManagementMarginChannelRow[]
  byCategory: PosCostCategoryWeightedRow[]
  categoryMeta: PosCostCategoryWeightedMeta
  bomUnmatchedLines: {
    menuId: string
    optionId: string
    menuLabel: string
    optionLabel: string
    reason: 'missing_menu_id' | 'missing_bom'
    lineQty: number
  }[]
}

const EMPTY_CATEGORY_META: PosCostCategoryWeightedMeta = {
  excludedUnmatchedSales: 0,
  excludedUnmatchedQty: 0,
  paymentDiscountAllocated: 0,
  serviceAmtAllocated: 0,
  optionBaseFallbackQty: 0,
  optionBaseFallbackSales: 0,
  optionBaseFallbackCost: 0,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

function isHqPosScope(storeFilter: string): boolean {
  const s = String(storeFilter || '').trim()
  return s === '본사' || isOfficeStore(s) || isHeadOfficeLikeStoreName(s)
}

function filterOrdersByChannel(
  orderRows: { order_type?: string; items_json?: string; total?: number }[],
  channel: PosCostSalesWeightedChannelFilter
) {
  if (channel === 'all') return orderRows
  return orderRows.filter((o) => resolveManagementMarginChannel(o.order_type) === channel)
}

export async function computePosCostSalesWeighted(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  channel?: PosCostSalesWeightedChannelFilter
  miseRatePercent?: number
  auth: AccountingStoreAuthScope
}): Promise<PosCostSalesWeightedResult> {
  const warnings: string[] = []
  const startStr = String(params.startStr || '').trim()
  const endStr = String(params.endStr || '').trim()
  const channel = params.channel ?? 'all'
  const storeFilter = resolveAccountingStoreFilterFromAuth(params.storeFilter, params.auth)

  if (isFinancialStatementStoreNone(storeFilter)) {
    return {
      startStr,
      endStr,
      storeFilter,
      channel,
      posTruncated: false,
      warnings: ['STORE_NOT_SELECTED'],
      summary: null,
      byChannel: [],
      byCategory: [],
      categoryMeta: { ...EMPTY_CATEGORY_META },
      bomUnmatchedLines: [],
    }
  }

  if (isHqPosScope(storeFilter)) {
    warnings.push('OFFICE_SCOPE_NO_POS')
    return {
      startStr,
      endStr,
      storeFilter,
      channel,
      posTruncated: false,
      warnings,
      summary: null,
      byChannel: [],
      byCategory: [],
      categoryMeta: { ...EMPTY_CATEGORY_META },
      bomUnmatchedLines: [],
    }
  }

  const allowedStoresOnly = resolveFranchiseeAccountingAllowedStoresOnly(params.auth)
  const multi = parseCommaSeparatedStoreFilter(storeFilter)
  const scope = {
    storeFilter,
    allowedStoresOnly,
    selectedStoresOnly: multi && multi.length > 1 ? multi : undefined,
  }
  const storeCodes = resolvePosStoreCodesForAccountingScope(scope)

  const [catalog, costIndex, fetchResult, menusRaw] = await Promise.all([
    loadPosSalesPromoPricingCatalog(),
    buildPosMenuCostIndex(),
    (async () => {
      const { resolveSaasTenantScope } = await import('@/lib/saas-tenant-scope')
      const tenantScope = await resolveSaasTenantScope({
        auth: params.auth.tenantId ? { tenantId: params.auth.tenantId } : null,
        storeCode: storeCodes?.[0] ?? null,
      })
      return fetchPosSalesOrdersForBusinessRange({
        startStr,
        endStr,
        storeCodes,
        select: POS_SALES_MENU_ROW_SELECT,
        queryLabel: 'posCostSalesWeighted',
        tenantScope,
      })
    })(),
    supabaseSelect('pos_menus', {
      limit: 5000,
      select: 'id,name,category,category_main',
    }),
  ])

  if (fetchResult.truncated) {
    warnings.push('POS_TRUNCATED')
  }

  const completed = filterCompletedPosSalesRows(fetchResult.rows, null)
  const filteredOrders = filterOrdersByChannel(completed, channel)
  const menuList = (Array.isArray(menusRaw) ? menusRaw : []) as PosMenuCatalogRow[]
  const resolveContext = buildTheoreticalCostResolveContext({
    costIndex,
    catalog,
  })
  const slice = buildManagementMarginPosSlice({
    orderRows: filteredOrders,
    catalog,
    costIndex,
    miseRatePercent: params.miseRatePercent,
  })
  const categoryAgg = aggregatePosCostWeightedByCategory({
    orderRows: filteredOrders,
    menus: menuList,
    costIndex,
    catalog,
    miseRatePercent: params.miseRatePercent,
    resolveContext,
  })
  const matchedTotals = sumPosCostCategoryWeightedTotals(categoryAgg.rows)
  const exactBom = computeExactBomCostPct({
    totals: matchedTotals,
    meta: categoryAgg.meta,
  })

  /** 채널별도 동일 엔진(매칭 매출·원가)으로 집계 — 상단 KPI와 합÷합 정합 */
  const channelKeys: ManagementMarginChannelKey[] =
    channel === 'all' ? ['dine_in', 'takeout', 'delivery', 'other'] : [channel]
  const byChannel: ManagementMarginChannelRow[] = channelKeys
    .map((ch) => {
      const orders = filteredOrders.filter((o) => resolveManagementMarginChannel(o.order_type) === ch)
      if (orders.length === 0) return null
      const agg = aggregatePosCostWeightedByCategory({
        orderRows: orders,
        menus: menuList,
        costIndex,
        catalog,
        miseRatePercent: params.miseRatePercent,
        resolveContext,
      })
      const t = sumPosCostCategoryWeightedTotals(agg.rows)
      const sliceCh = slice.byChannel.find((r) => r.channel === ch)
      return {
        channel: ch,
        orderCount: orders.length,
        netSales: t.netSales,
        bundleDiscount: sliceCh?.bundleDiscount ?? 0,
        paymentDiscount: sliceCh?.paymentDiscount ?? 0,
        totalDiscount: sliceCh?.totalDiscount ?? 0,
        foodCost: t.foodCost,
        packagingCost: t.packagingCost,
        totalCost: t.totalCost,
        contributionMargin: round2(t.netSales - t.totalCost),
        costPctOfNet: t.costPctOfNet,
      } satisfies ManagementMarginChannelRow
    })
    .filter((r): r is ManagementMarginChannelRow => r != null)

  if (categoryAgg.meta.excludedUnmatchedQty > 0 || categoryAgg.meta.excludedUnmatchedSales > 0) {
    warnings.push('CAT_BOM_UNMATCHED_EXCLUDED')
  }
  if (
    categoryAgg.meta.paymentDiscountAllocated > 0.0001 ||
    categoryAgg.meta.serviceAmtAllocated > 0.0001
  ) {
    warnings.push('CAT_ORDER_DISCOUNT_APPLIED')
  }
  if (
    categoryAgg.meta.optionBaseFallbackQty > 0.0001 ||
    categoryAgg.meta.optionBaseFallbackSales > 0.0001
  ) {
    warnings.push('CAT_OPTION_BASE_FALLBACK')
  }

  const posNetSales = slice.netSales
  const salesCoveragePct = pctOf(matchedTotals.netSales, posNetSales)

  return {
    startStr,
    endStr,
    storeFilter,
    channel,
    posTruncated: fetchResult.truncated,
    warnings,
    summary: {
      netSales: matchedTotals.netSales,
      posNetSales,
      excludedUnmatchedSales: categoryAgg.meta.excludedUnmatchedSales,
      salesCoveragePct,
      grossSalesBeforeDiscount: slice.grossSalesBeforeDiscount,
      totalCost: matchedTotals.totalCost,
      foodCost: matchedTotals.foodCost,
      packagingCost: matchedTotals.packagingCost,
      costPctOfNet: matchedTotals.costPctOfNet,
      costPctOfNetExactBom: exactBom.costPctOfNet,
      costPctOfGross: pctOf(matchedTotals.totalCost, slice.grossSalesBeforeDiscount),
      matchedLineQty: matchedTotals.matchedQty,
      unmatchedLineQty: categoryAgg.meta.excludedUnmatchedQty,
      periodOrderCount: slice.periodOrderCount,
      miseRatePercent: slice.theoreticalCost.miseRatePercent,
    },
    byChannel,
    byCategory: categoryAgg.rows,
    categoryMeta: categoryAgg.meta,
    bomUnmatchedLines: slice.theoreticalCost.bomUnmatchedLines,
  }
}
