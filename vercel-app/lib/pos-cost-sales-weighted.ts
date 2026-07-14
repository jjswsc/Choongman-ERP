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
  type PosCostCategoryWeightedMeta,
  type PosCostCategoryWeightedRow,
} from '@/lib/pos-cost-category-weighted'
import { buildTheoreticalCostResolveContext } from '@/lib/management-margin-theoretical-cost'
import { supabaseSelect } from '@/lib/supabase-server'
import type { PosMenuCatalogRow } from '@/lib/pos-sales-menu-hierarchy-aggregate'

export type PosCostSalesWeightedChannelFilter = 'all' | ManagementMarginChannelKey

export type PosCostSalesWeightedSummary = {
  netSales: number
  grossSalesBeforeDiscount: number
  totalCost: number
  foodCost: number
  packagingCost: number
  costPctOfNet: number
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
    fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes,
      select: POS_SALES_MENU_ROW_SELECT,
      queryLabel: 'posCostSalesWeighted',
    }),
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
  if (categoryAgg.meta.excludedUnmatchedQty > 0 || categoryAgg.meta.excludedUnmatchedSales > 0) {
    warnings.push('CAT_BOM_UNMATCHED_EXCLUDED')
  }
  if (
    categoryAgg.meta.paymentDiscountAllocated > 0.0001 ||
    categoryAgg.meta.serviceAmtAllocated > 0.0001
  ) {
    warnings.push('CAT_ORDER_DISCOUNT_APPLIED')
  }

  return {
    startStr,
    endStr,
    storeFilter,
    channel,
    posTruncated: fetchResult.truncated,
    warnings,
    summary: {
      netSales: slice.netSales,
      grossSalesBeforeDiscount: slice.grossSalesBeforeDiscount,
      totalCost: slice.theoreticalCost.totalCost,
      foodCost: slice.theoreticalCost.foodCost,
      packagingCost: slice.theoreticalCost.packagingCost,
      costPctOfNet: slice.theoreticalCost.costPctOfNet,
      costPctOfGross: slice.theoreticalCost.costPctOfGross,
      matchedLineQty: slice.theoreticalCost.matchedLineQty,
      unmatchedLineQty: slice.theoreticalCost.unmatchedLineQty,
      periodOrderCount: slice.periodOrderCount,
      miseRatePercent: slice.theoreticalCost.miseRatePercent,
    },
    byChannel: channel === 'all' ? slice.byChannel : slice.byChannel.filter((r) => r.channel === channel),
    byCategory: categoryAgg.rows,
    categoryMeta: categoryAgg.meta,
    bomUnmatchedLines: slice.theoreticalCost.bomUnmatchedLines,
  }
}
