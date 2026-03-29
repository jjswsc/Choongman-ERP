import type { PosPromoWithItems } from '@/lib/api-client'
import { buildCostAnalysisLookups, calcPromoEconomics, resolveCostFromAnalysisMaps } from '@/lib/promo-economics'

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
  costAnalysisRows: unknown[]
): Record<string, InquiryPromoEconomics> {
  const { byMenuKey, byCodeKey } = buildCostAnalysisLookups(costAnalysisRows)
  const out: Record<string, InquiryPromoEconomics> = {}

  for (const p of withItems) {
    const items = p.items || []
    let costHall = 0
    let costDel = 0
    let incomplete = false
    for (const it of items) {
      const ce = resolveCostFromAnalysisMaps(byMenuKey, byCodeKey, emptyMenuById, it.menuId, it.optionId)
      if (ce == null) incomplete = true
      const q = Number(it.quantity) || 1
      costHall += (ce?.hall ?? 0) * q
      costDel += (ce?.del ?? 0) * q
    }

    const saleHall = Number(p.price) || 0
    const pd = p.priceDelivery
    const hasExplicitDel =
      pd != null && String(pd).trim() !== '' && Number.isFinite(Number(pd)) && Number(pd) > 0

    const econ = calcPromoEconomics({
      regularPriceSum: 0,
      costTotalHall: costHall,
      costTotalDelivery: costDel,
      salePriceHall: saleHall,
      salePriceDelivery: hasExplicitDel ? Number(pd) : undefined,
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
