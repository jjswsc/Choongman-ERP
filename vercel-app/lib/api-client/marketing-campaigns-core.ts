/**
 * 마케팅 캠페인 CRUD — marketing-campaigns.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { MarketingCollabDetail } from '../marketing-collab-detail'
import type { MarketingCampaignPhasePeriod } from '../marketing-campaign-periods'
import { apiJsonArrayResponse } from './helpers'

export interface MarketingCampaign {
  id: string
  campaignNo?: string
  topic: string
  format: string
  campaignType?: string
  status: string
  startDate?: string | null
  endDate?: string | null
  /** 캠페인 디자인 작업 일정 */
  designStartDate?: string | null
  designEndDate?: string | null
  designNote?: string
  /** 차수별 기간(1차·2차·…) — DB phase_periods */
  phasePeriods?: MarketingCampaignPhasePeriod[]
  branches: string[]
  kpiTarget: number
  kpiUnit: string
  budgetTotal: number
  /** 목록 API에서 함께 내려옴 — 협업·할인 요약 표시용 */
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  discountTargetAudience?: string
  /** 캠페인 편집에서 「협업 관리」목록 포함 여부 */
  collabManagement?: boolean
  /** 목록 API에 포함(협업 관리 매장별 조회 등) */
  collabDetail?: MarketingCollabDetail
}

export type { MarketingCollabDetail } from '../marketing-collab-detail'

export interface MarketingCampaignDetail extends MarketingCampaign {
  detail: string
  discountType: string
  discountValue: number
  discountPricePromotion: string
  discountTargetAudience: string
  /** 협업 관리 화면 전용 세부 JSON (normalize된 형태) */
  collabDetail?: MarketingCollabDetail
  costAdsOnline: number
  costAdsOffline: number
  costProduction: number
  costFood: number
  costInfluencer: number
  costOther: number
  costOtherLabel: string
  campaignPerformance: string
  conclusion: string
  createdAt?: string
  updatedAt?: string
}

export async function getMarketingCampaigns() {
  const res = await apiFetchWithOffline('/api/marketingCampaigns', { cache: 'no-store' })
  return apiJsonArrayResponse<MarketingCampaign>(res)
}

export async function getMarketingCampaign(id: string) {
  const q = new URLSearchParams({ id })
  const res = await apiFetchWithOffline('/api/marketingCampaigns?' + q.toString())
  return res.json() as Promise<MarketingCampaignDetail | null>
}

export async function saveMarketingCampaignCollabDetail(params: {
  campaignId: string
  collabDetail: Record<string, unknown>
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignCollabDetail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function toggleMarketingCampaignCollabManagement(params: {
  campaignId: string
  enabled: boolean
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignCollabManagementToggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId.trim(),
      enabled: params.enabled === true,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getPosCollabCampaigns(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode.trim())
  const res = await apiFetchWithOffline('/api/getPosCollabCampaigns?' + q.toString())
  const data = (await res.json()) as {
    campaigns?: {
      id: string
      topic: string
      campaignNo?: string
      collabDetail: MarketingCollabDetail
    }[]
  }
  return Array.isArray(data.campaigns) ? data.campaigns : []
}

export async function getNextCampaignNumber(): Promise<string | null> {
  const res = await apiFetchWithOffline('/api/marketingCampaigns?nextNumber=1')
  const data = (await res.json()) as { campaignNo?: string }
  return data?.campaignNo ?? null
}

export async function saveMarketingCampaign(params: {
  id?: string
  campaignNo?: string
  topic: string
  format?: string
  campaignType?: string
  status?: string
  detail?: string
  startDate?: string | null
  endDate?: string | null
  designStartDate?: string | null
  designEndDate?: string | null
  designNote?: string
  branches?: string[]
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  discountTargetAudience?: string
  costAdsOnline?: number
  costAdsOffline?: number
  costProduction?: number
  costFood?: number
  costInfluencer?: number
  costOther?: number
  costOtherLabel?: string
  budgetTotal?: number
  kpiTarget?: number
  kpiUnit?: string
  campaignPerformance?: string
  conclusion?: string
  collabManagement?: boolean
  phasePeriods?: MarketingCampaignPhasePeriod[]
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function saveMarketingCampaignDesignDates(params: {
  campaignId: string
  designStartDate?: string | null
  designEndDate?: string | null
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignDesignDates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId.trim(),
      designStartDate: params.designStartDate ?? null,
      designEndDate: params.designEndDate ?? null,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteMarketingCampaign(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingCampaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
