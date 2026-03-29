import type { MarketingCampaign } from "@/lib/api-client"
import {
  campaignMatchesBranchListFilter,
  campaignMatchesDesignPeriodFilter,
  campaignMatchesHubLinkFilter,
  campaignMatchesPeriodFilter,
  campaignMatchesTypeFilter,
} from "@/lib/marketing-campaign-filters"
import { getCampaignTypeLabel } from "@/lib/marketing-campaign-type-utils"

export type CampaignListSearchScope = "all" | "topic" | "campaignNo" | "format" | "audience_promo"

export type MarketingCampaignHubLinkSets = {
  promo: Set<string>
  ads: Set<string>
  influencer: Set<string>
  materials: Set<string>
}

export function emptyMarketingCampaignHubLinkSets(): MarketingCampaignHubLinkSets {
  return {
    promo: new Set(),
    ads: new Set(),
    influencer: new Set(),
    materials: new Set(),
  }
}

export type MarketingCampaignListFilterParams = {
  listSearch: string
  listSearchScope: CampaignListSearchScope
  listPeriodFrom: string
  listPeriodTo: string
  listDesignFrom: string
  listDesignTo: string
  listCampaignTypeFilter: string
  listStatusDraft: boolean
  listStatusOngoing: boolean
  listStatusFinish: boolean
  listBranchFilter: string
  listHubLinkFilter: string
  listBudgetMin: string
  listBudgetMax: string
  listKpiMin: string
  listKpiMax: string
  listKpiUnitFilter: string
  listDiscountFilter: "any" | "none" | "percent" | "amount"
  lang: string
  statusLabel: (status: string) => string
}

export function applyMarketingCampaignListFilters(
  list: MarketingCampaign[],
  hubLinkSets: MarketingCampaignHubLinkSets,
  f: MarketingCampaignListFilterParams
): MarketingCampaign[] {
  const q = f.listSearch.trim().toLowerCase()

  const textMatches = (c: MarketingCampaign): boolean => {
    if (!q) return true
    const topic = (c.topic ?? "").toLowerCase()
    const no = (c.campaignNo ?? "").toLowerCase()
    const format = (c.format ?? "").toLowerCase()
    const branches = (c.branches ?? []).join(" ").toLowerCase()
    const typeLabel = getCampaignTypeLabel(c.campaignType, f.lang).toLowerCase()
    const statusText = f.statusLabel(c.status).toLowerCase()
    const audience = (c.discountTargetAudience ?? "").toLowerCase()
    const promoLine = (c.discountPricePromotion ?? "").toLowerCase()
    const designNote = (c.designNote ?? "").toLowerCase()
    const disc =
      c.discountType === "percent"
        ? `${c.discountValue ?? 0}%`
        : `฿${Number(c.discountValue ?? 0).toLocaleString()}`
    const phasesQ = (c.phasePeriods ?? [])
      .map((p) => `${p.label ?? ""} ${p.startDate ?? ""} ${p.endDate ?? ""}`.toLowerCase())
      .join(" ")
    switch (f.listSearchScope) {
      case "topic":
        return topic.includes(q)
      case "campaignNo":
        return no.includes(q)
      case "format":
        return format.includes(q)
      case "audience_promo":
        return branches.includes(q) || audience.includes(q) || promoLine.includes(q)
      case "all":
      default:
        return (
          topic.includes(q) ||
          no.includes(q) ||
          format.includes(q) ||
          branches.includes(q) ||
          typeLabel.includes(q) ||
          statusText.includes(q) ||
          audience.includes(q) ||
          promoLine.includes(q) ||
          designNote.includes(q) ||
          disc.includes(q) ||
          phasesQ.includes(q)
        )
    }
  }

  const bMin = parseFloat(f.listBudgetMin.replace(/,/g, ""))
  const bMax = parseFloat(f.listBudgetMax.replace(/,/g, ""))
  const kMin = parseFloat(f.listKpiMin.replace(/,/g, ""))
  const kMax = parseFloat(f.listKpiMax.replace(/,/g, ""))

  return list.filter((c) => {
    if (!campaignMatchesPeriodFilter(c, f.listPeriodFrom, f.listPeriodTo)) return false
    if (!campaignMatchesDesignPeriodFilter(c, f.listDesignFrom, f.listDesignTo)) return false
    if (!campaignMatchesTypeFilter(c, f.listCampaignTypeFilter)) return false

    const st = c.status
    const statusOk =
      (st === "draft" && f.listStatusDraft) ||
      (st === "ongoing" && f.listStatusOngoing) ||
      (st === "finish" && f.listStatusFinish)
    if (!statusOk) return false

    if (!campaignMatchesBranchListFilter(c, f.listBranchFilter)) return false
    if (!campaignMatchesHubLinkFilter(c, f.listHubLinkFilter, hubLinkSets)) return false

    const budget = Number(c.budgetTotal) || 0
    if (!Number.isNaN(bMin) && f.listBudgetMin.trim() !== "" && budget < bMin) return false
    if (!Number.isNaN(bMax) && f.listBudgetMax.trim() !== "" && budget > bMax) return false

    const kpi = Number(c.kpiTarget) || 0
    if (!Number.isNaN(kMin) && f.listKpiMin.trim() !== "" && kpi < kMin) return false
    if (!Number.isNaN(kMax) && f.listKpiMax.trim() !== "" && kpi > kMax) return false
    if (f.listKpiUnitFilter.trim() && (c.kpiUnit ?? "") !== f.listKpiUnitFilter.trim()) return false

    const dv = Number(c.discountValue) || 0
    const dt = String(c.discountType ?? "percent")
    if (f.listDiscountFilter === "none" && dv > 0) return false
    if (f.listDiscountFilter === "percent" && (dt !== "percent" || dv <= 0)) return false
    if (f.listDiscountFilter === "amount" && (!(dt === "amount" || dt === "fixed") || dv <= 0)) return false

    return textMatches(c)
  })
}

/** 검색어 제외(허브 목록과 동일: 키워드만 입력 시엔 '필터 활성' 배지는 끔) */
export type MarketingCampaignListPanelFilterParams = Omit<
  MarketingCampaignListFilterParams,
  "listSearch" | "lang" | "statusLabel"
>

export function marketingCampaignListFiltersActive(f: MarketingCampaignListPanelFilterParams): boolean {
  return (
    !!f.listPeriodFrom.trim() ||
    !!f.listPeriodTo.trim() ||
    !!f.listDesignFrom.trim() ||
    !!f.listDesignTo.trim() ||
    !!f.listCampaignTypeFilter.trim() ||
    !f.listStatusDraft ||
    !f.listStatusOngoing ||
    !f.listStatusFinish ||
    !!f.listBranchFilter.trim() ||
    !!f.listHubLinkFilter.trim() ||
    !!f.listBudgetMin.trim() ||
    !!f.listBudgetMax.trim() ||
    !!f.listKpiMin.trim() ||
    !!f.listKpiMax.trim() ||
    !!f.listKpiUnitFilter.trim() ||
    f.listDiscountFilter !== "any" ||
    f.listSearchScope !== "all"
  )
}
