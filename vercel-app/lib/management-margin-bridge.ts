import {
  computeIncomeStatementReport,
  loadAccountSubjectMeta,
  loadItemAccountSubjectMap,
  normalizeIncomeScope,
  type IncomeScopeInput,
} from '@/lib/accounting-reports'
import { mergeIncomeStatementReports } from '@/lib/accounting-income-statement-merge'
import { fetchStockLogPurchaseAgg, resolvePurchaseLocationPatterns } from '@/lib/accounting-stock-purchase-agg'
import { getBangkokDateRangeUtc, getBangkokMonthRange, expandBangkokYearMonthsInclusive, priorBangkokPeriodMonths } from '@/lib/bangkok-time'
import { loadHqOutboundProcessedLines } from '@/lib/hq-outbound-income-total'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_MENU_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'
import { buildPosMenuCostIndex } from '@/lib/pos-menu-cost-index-server'
import {
  buildManagementMarginPosSlice,
  buildMomDelta,
  type ManagementMarginChannelRow,
  type ManagementMarginMomDelta,
} from '@/lib/management-margin-pos-slice'
import {
  buildManagementMarginStoreRanking,
  pickStoreRankingHighlights,
  type ManagementMarginStoreRankRow,
} from '@/lib/management-margin-store-ranking'
import {
  assessManagementMarginDataQuality,
  type ManagementMarginDataQuality,
} from '@/lib/management-margin-data-quality'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { parseCommaSeparatedStoreFilter, resolvePosStoreCodesForAccountingScope } from '@/lib/accounting-store-scope'
import { isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import type { PosSalesCombinedDiscountResult } from '@/lib/pos-sales-combined-discount-aggregate'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

export type ManagementMarginBridgeReport = {
  yearMonthStart: string
  yearMonthEnd: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  posAvailable: boolean
  posTruncated: boolean
  pos: {
    grossSalesBeforeDiscount: number
    netSales: number
    bundleDiscount: number
    paymentDiscount: number
    totalDiscount: number
    periodOrderCount: number
    combined: PosSalesCombinedDiscountResult
    byChannel: ManagementMarginChannelRow[]
  } | null
  theoreticalCost: {
    foodCost: number
    packagingCost: number
    totalCost: number
    matchedLineQty: number
    unmatchedLineQty: number
    bomUnmatchedLines: {
      menuId: string
      optionId: string
      menuLabel: string
      optionLabel: string
      reason: 'missing_menu_id' | 'missing_bom'
      lineQty: number
    }[]
    costPctOfGross: number
    costPctOfNet: number
    miseRatePercent: number
  } | null
  accounting: {
    sales: number
    purchases: number
    purchasesFood: number
    purchasesPackaging: number
    cogs: number
    grossProfit: number
    expenses: number
    netProfit: number
  } | null
  bridge: {
    contributionMargin: number | null
    contributionMarginPct: number | null
    theoreticalVsActualCogsDiff: number | null
    theoreticalVsActualCogsDiffPct: number | null
  }
  priorPeriod: {
    yearMonthStart: string
    yearMonthEnd: string
    startStr: string
    endStr: string
  } | null
  momCompare: ManagementMarginMomDelta[] | null
  dataQuality: ManagementMarginDataQuality
  storeRanking: ManagementMarginStoreRankRow[] | null
  storeRankingHighlights: { highDiscount: string[]; highCost: string[] } | null
  warnings: string[]
}

async function resolveSubjectIdsByCode(
  meta: Awaited<ReturnType<typeof loadAccountSubjectMeta>>,
  codes: string[]
): Promise<Map<string, number>> {
  const codeSet = new Set(codes)
  const out = new Map<string, number>()
  for (const [id, row] of meta) {
    if (codeSet.has(row.code)) out.set(row.code, id)
  }
  return out
}

function classifyPurchaseLineAmount(
  itemCode: string,
  lineAmount: number,
  itemAccountSubjectMap: Map<string, number>,
  foodSubjectId: number | undefined,
  packagingSubjectId: number | undefined
): { food: number; packaging: number; other: number } {
  const sid = itemAccountSubjectMap.get(String(itemCode || '').trim())
  if (sid != null && packagingSubjectId != null && sid === packagingSubjectId) {
    return { food: 0, packaging: lineAmount, other: 0 }
  }
  if (sid != null && foodSubjectId != null && sid === foodSubjectId) {
    return { food: lineAmount, packaging: 0, other: 0 }
  }
  return { food: lineAmount, packaging: 0, other: 0 }
}

async function sumPurchasesFoodPackaging(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<{ food: number; packaging: number; total: number }> {
  const multi = parseCommaSeparatedStoreFilter(params.storeFilter)
  if (multi && multi.length > 1) {
    const parts = await Promise.all(
      multi.map((store) =>
        sumPurchasesFoodPackaging({
          ...params,
          storeFilter: store,
        })
      )
    )
    return {
      food: round2(parts.reduce((a, p) => a + p.food, 0)),
      packaging: round2(parts.reduce((a, p) => a + p.packaging, 0)),
      total: round2(parts.reduce((a, p) => a + p.total, 0)),
    }
  }

  const [itemAccountSubjectMap, subjectMeta] = await Promise.all([
    loadItemAccountSubjectMap(),
    loadAccountSubjectMeta(),
  ])
  const subjectByCode = await resolveSubjectIdsByCode(subjectMeta, ['5111', '5112'])
  const foodSubjectId = subjectByCode.get('5111')
  const packagingSubjectId = subjectByCode.get('5112')

  let food = 0
  let packaging = 0
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(params.startStr, params.endStr)

  if (params.isHQ) {
    const locationPatterns = await resolvePurchaseLocationPatterns('입고등록', false)
    const { rows } = await fetchStockLogPurchaseAgg({
      logTypes: ['Inbound'],
      startUtcIso: dayStartUtcIso,
      endUtcExclusive: nextDayStartUtcIso,
      locationPatterns,
      vendorPatterns: null,
    })
    for (const r of rows) {
      const split = classifyPurchaseLineAmount(
        r.item_code,
        r.line_amount,
        itemAccountSubjectMap,
        foodSubjectId,
        packagingSubjectId
      )
      food += split.food
      packaging += split.packaging
    }
  } else {
    const { lines } = await loadHqOutboundProcessedLines({
      startStr: params.startStr,
      endStr: params.endStr,
      storeFilter: params.storeFilter === 'All' ? null : params.storeFilter,
    })
    for (const line of lines) {
      const target = String(line.targetStore || '').trim()
      if (isHeadOfficeLikeStoreName(target)) continue
      if (
        params.storeFilter &&
        params.storeFilter !== 'All' &&
        target &&
        !storeMatchesIncomeFilter(target, params.storeFilter)
      ) {
        continue
      }
      const split = classifyPurchaseLineAmount(
        line.itemCode,
        line.lineAmount,
        itemAccountSubjectMap,
        foodSubjectId,
        packagingSubjectId
      )
      food += split.food
      packaging += split.packaging
    }

    const locationFilter = params.storeFilter !== 'All' ? params.storeFilter : null
    const locationPatterns = await resolvePurchaseLocationPatterns(locationFilter, params.storeFilter === 'All')
    const { rows } = await fetchStockLogPurchaseAgg({
      logTypes: ['Inbound'],
      startUtcIso: dayStartUtcIso,
      endUtcExclusive: nextDayStartUtcIso,
      locationPatterns,
      vendorPatterns: null,
    })
    for (const r of rows) {
      if (params.storeFilter === 'All' && (r.location === '본사' || isOfficeStore(r.location))) continue
      const split = classifyPurchaseLineAmount(
        r.item_code,
        r.line_amount,
        itemAccountSubjectMap,
        foodSubjectId,
        packagingSubjectId
      )
      food += split.food
      packaging += split.packaging
    }
  }

  food = round2(food)
  packaging = round2(packaging)
  return { food, packaging, total: round2(food + packaging) }
}

async function fetchPosCompletedForBridge(params: {
  startStr: string
  endStr: string
  storeCodes: string[] | undefined
}): Promise<{ completed: Awaited<ReturnType<typeof filterCompletedPosSalesRows>>; truncated: boolean }> {
  const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
    startStr: params.startStr,
    endStr: params.endStr,
    storeCodes: params.storeCodes,
    select: POS_SALES_MENU_ROW_SELECT,
    queryLabel: 'managementMarginBridge',
  })
  return { completed: filterCompletedPosSalesRows(rows, null), truncated }
}

export async function computeManagementMarginBridge(
  input: IncomeScopeInput & { yearMonthStart?: string; yearMonthEnd?: string }
): Promise<ManagementMarginBridgeReport> {
  const warnings: string[] = []
  const ymStart = String(input.yearMonthStart || input.yearMonth || '').trim()
  const ymEnd = String(input.yearMonthEnd || input.yearMonth || ymStart).trim()
  const startRange = getBangkokMonthRange(ymStart)
  const endRange = getBangkokMonthRange(ymEnd)
  const startStr = startRange.startStr
  const endStr = endRange.endStr

  const scopeProbe = normalizeIncomeScope({ ...input, yearMonth: ymEnd })
  const storeFilter = scopeProbe.storeFilter
  const isHQ = scopeProbe.isHQ
  const posAvailable = !isHQ

  let pos: ManagementMarginBridgeReport['pos'] = null
  let theoreticalCost: ManagementMarginBridgeReport['theoreticalCost'] = null
  let posTruncated = false
  let priorPosSlice: ReturnType<typeof buildManagementMarginPosSlice> | null = null
  let priorAccountingNetProfit: number | null = null
  let storeRanking: ManagementMarginStoreRankRow[] | null = null
  let storeRankingHighlights: { highDiscount: string[]; highCost: string[] } | null = null

  const storeCodes = resolvePosStoreCodesForAccountingScope(scopeProbe)

  const priorMeta = priorBangkokPeriodMonths(ymStart, ymEnd)
  const priorRange = priorMeta
    ? {
        startStr: getBangkokMonthRange(priorMeta.startYm).startStr,
        endStr: getBangkokMonthRange(priorMeta.endYm).endStr,
      }
    : null

  if (posAvailable) {
    const [catalog, costIndex, currentFetch, priorFetch] = await Promise.all([
      loadPosSalesPromoPricingCatalog(),
      buildPosMenuCostIndex(),
      fetchPosCompletedForBridge({ startStr, endStr, storeCodes }),
      priorRange
        ? fetchPosCompletedForBridge({
            startStr: priorRange.startStr,
            endStr: priorRange.endStr,
            storeCodes,
          })
        : Promise.resolve(null),
    ])
    posTruncated = currentFetch.truncated || Boolean(priorFetch?.truncated)
    if (currentFetch.truncated || priorFetch?.truncated) {
      warnings.push('POS 주문 조회 상한에 도달해 매출·원가 추정이 과소할 수 있습니다.')
    }

    const slice = buildManagementMarginPosSlice({
      orderRows: currentFetch.completed,
      catalog,
      costIndex,
    })

    pos = {
      grossSalesBeforeDiscount: slice.grossSalesBeforeDiscount,
      netSales: slice.netSales,
      bundleDiscount: slice.bundleDiscount,
      paymentDiscount: slice.paymentDiscount,
      totalDiscount: slice.totalDiscount,
      periodOrderCount: slice.periodOrderCount,
      combined: slice.combined,
      byChannel: slice.byChannel,
    }
    theoreticalCost = slice.theoreticalCost

    const showStoreRanking =
      storeFilter === 'All' ||
      Boolean(scopeProbe.selectedStoresOnly && scopeProbe.selectedStoresOnly.length > 1) ||
      (parseCommaSeparatedStoreFilter(storeFilter)?.length ?? 0) > 1
    if (showStoreRanking) {
      const ranking = buildManagementMarginStoreRanking({
        orderRows: currentFetch.completed,
        catalog,
        costIndex,
      })
      if (ranking.length > 0) {
        storeRanking = ranking
        storeRankingHighlights = pickStoreRankingHighlights(ranking)
      }
    }

    if (priorFetch && priorFetch.completed.length >= 0) {
      priorPosSlice = buildManagementMarginPosSlice({
        orderRows: priorFetch.completed,
        catalog,
        costIndex,
      })
    }
  } else {
    warnings.push('본사(오피스) 범위는 POS 매출·이론 원가를 표시하지 않습니다. 회계 매입 분해를 참고하세요.')
  }

  const months = expandBangkokYearMonthsInclusive(ymStart, ymEnd)
  const priorMonths = priorMeta
    ? expandBangkokYearMonthsInclusive(priorMeta.startYm, priorMeta.endYm)
    : []

  const [incomeReports, priorIncomeReports] = await Promise.all([
    Promise.all(
      months.map((ym) =>
        computeIncomeStatementReport({
          ...input,
          yearMonth: ym,
          includeDebug: false,
        })
      )
    ),
    priorMonths.length > 0
      ? Promise.all(
          priorMonths.map((ym) =>
            computeIncomeStatementReport({
              ...input,
              yearMonth: ym,
              includeDebug: false,
            })
          )
        )
      : Promise.resolve([]),
  ])
  const mergedIncome =
    incomeReports.length === 1
      ? incomeReports[0]
      : mergeIncomeStatementReports(incomeReports, {
          yearMonth: ymEnd,
          startStr,
          endStr,
        })

  if (priorIncomeReports.length > 0 && priorMeta && priorRange) {
    const mergedPrior =
      priorIncomeReports.length === 1
        ? priorIncomeReports[0]
        : mergeIncomeStatementReports(priorIncomeReports, {
            yearMonth: priorMeta.endYm,
            startStr: priorRange.startStr,
            endStr: priorRange.endStr,
          })
    priorAccountingNetProfit = round2(mergedPrior.netProfit)
  }

  const purchaseSplit = await sumPurchasesFoodPackaging({
    startStr,
    endStr,
    storeFilter,
    isHQ,
  })

  const accounting: NonNullable<ManagementMarginBridgeReport['accounting']> = {
    sales: round2(mergedIncome.sales),
    purchases: round2(mergedIncome.purchases),
    purchasesFood: purchaseSplit.food,
    purchasesPackaging: purchaseSplit.packaging,
    cogs: round2(mergedIncome.cogs),
    grossProfit: round2(mergedIncome.grossProfit),
    expenses: round2(mergedIncome.expenses),
    netProfit: round2(mergedIncome.netProfit),
  }

  const contributionMargin =
    pos && theoreticalCost ? round2(pos.netSales - theoreticalCost.totalCost) : null
  const contributionMarginPct =
    contributionMargin != null && pos && pos.netSales > 0
      ? pctOf(contributionMargin, pos.netSales)
      : null
  const theoreticalVsActualCogsDiff =
    theoreticalCost && accounting.cogs > 0
      ? round2(accounting.cogs - theoreticalCost.totalCost)
      : null
  const theoreticalVsActualCogsDiffPct =
    theoreticalVsActualCogsDiff != null && theoreticalCost && theoreticalCost.totalCost > 0
      ? pctOf(theoreticalVsActualCogsDiff, theoreticalCost.totalCost)
      : null

  for (const r of [...incomeReports, ...priorIncomeReports]) {
    for (const w of r.diagnostics?.warnings || []) {
      if (!warnings.includes(w)) warnings.push(w)
    }
  }

  const priorContribution =
    priorPosSlice != null
      ? round2(priorPosSlice.netSales - priorPosSlice.theoreticalCost.totalCost)
      : null

  const momCompare: ManagementMarginMomDelta[] | null =
    priorMeta && (priorPosSlice != null || priorAccountingNetProfit != null)
      ? [
          ...(pos && priorPosSlice
            ? [
                buildMomDelta('netSales', pos.netSales, priorPosSlice.netSales),
                buildMomDelta('bundleDiscount', pos.bundleDiscount, priorPosSlice.bundleDiscount),
                buildMomDelta('paymentDiscount', pos.paymentDiscount, priorPosSlice.paymentDiscount),
                buildMomDelta(
                  'theoreticalCost',
                  theoreticalCost?.totalCost ?? 0,
                  priorPosSlice.theoreticalCost.totalCost
                ),
                buildMomDelta('contributionMargin', contributionMargin ?? 0, priorContribution ?? 0),
              ]
            : []),
          ...(priorAccountingNetProfit != null
            ? [buildMomDelta('netProfit', accounting.netProfit, priorAccountingNetProfit)]
            : []),
        ]
      : null

  const dataQuality = assessManagementMarginDataQuality({
    posTruncated,
    unmatchedLineQty: theoreticalCost?.unmatchedLineQty ?? 0,
    matchedLineQty: theoreticalCost?.matchedLineQty ?? 0,
    theoreticalVsActualCogsDiffPct,
    warningCount: warnings.length,
  })

  return {
    yearMonthStart: ymStart,
    yearMonthEnd: ymEnd,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    posAvailable,
    posTruncated,
    pos,
    theoreticalCost,
    accounting,
    bridge: {
      contributionMargin,
      contributionMarginPct,
      theoreticalVsActualCogsDiff,
      theoreticalVsActualCogsDiffPct,
    },
    priorPeriod: priorMeta && priorRange
      ? {
          yearMonthStart: priorMeta.startYm,
          yearMonthEnd: priorMeta.endYm,
          startStr: priorRange.startStr,
          endStr: priorRange.endStr,
        }
      : null,
    momCompare,
    dataQuality,
    storeRanking,
    storeRankingHighlights,
    warnings,
  }
}
