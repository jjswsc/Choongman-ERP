import type { PosPromoWithItems } from '@/lib/api-client'
import { toPosCostSalesDenom, type PosCostVatView } from '@/lib/pos-cost-vat'
import {
  aggregatePromoChoiceAwareTotals,
  buildCostAnalysisLookups,
  calcPromoEconomics,
  resolveCostFromAnalysisMaps,
} from '@/lib/promo-economics'

const emptyMenuById: Record<string, { code?: string }> = {}

export type InquiryPromoEconomics = {
  costHall: number
  costDel: number
  costRateHall: number
  costRateDel: number
  marginPctHall: number
  marginPctDel: number
  lineCount: number
  /** 원가 분석 요약에 일부 라인이 없을 때 */
  incomplete: boolean
}

export function buildInquiryEconomicsByPromoId(
  withItems: PosPromoWithItems[],
  costAnalysisRows: unknown[],
  vatView: PosCostVatView = 'included'
): Record<string, InquiryPromoEconomics> {
  const { byMenuKey, byCodeKey } = buildCostAnalysisLookups(costAnalysisRows)
  const out: Record<string, InquiryPromoEconomics> = {}

  for (const p of withItems) {
    const items = p.items || []
    let costHall = 0
    let costDel = 0
    let incomplete = false
    costHall = aggregatePromoChoiceAwareTotals(items, (it) => {
      const ce = resolveCostFromAnalysisMaps(byMenuKey, byCodeKey, emptyMenuById, it.menuId, it.optionId)
      if (ce == null) incomplete = true
      const q = Number(it.quantity) || 1
      return (ce?.hall ?? 0) * q
    })
    costDel = aggregatePromoChoiceAwareTotals(items, (it) => {
      const ce = resolveCostFromAnalysisMaps(byMenuKey, byCodeKey, emptyMenuById, it.menuId, it.optionId)
      if (ce == null) incomplete = true
      const q = Number(it.quantity) || 1
      return (ce?.del ?? 0) * q
    })

    const saleHall = Number(p.price) || 0
    const pd = p.priceDelivery
    const hasExplicitDel =
      pd != null && String(pd).trim() !== '' && Number.isFinite(Number(pd)) && Number(pd) > 0

    const econ = calcPromoEconomics({
      regularPriceSum: 0,
      costTotalHall: costHall,
      costTotalDelivery: costDel,
      salePriceHall: toPosCostSalesDenom(saleHall, p.vatIncluded !== false, vatView),
      salePriceDelivery: hasExplicitDel
        ? toPosCostSalesDenom(Number(pd), p.vatIncluded !== false, vatView)
        : undefined,
    })

    out[p.id] = {
      costHall,
      costDel,
      costRateHall: econ.costRateHall,
      costRateDel: econ.costRateDelivery,
      marginPctHall: econ.marginPercent,
      marginPctDel: econ.marginPercentDel,
      lineCount: items.length,
      incomplete,
    }
  }

  return out
}
