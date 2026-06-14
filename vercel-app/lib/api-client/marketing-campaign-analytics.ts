/**
 * 마케팅 캠페인 비용·성과·엑셀 — marketing-campaigns.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'

export async function getMarketingCampaignCosts(campaignId: string) {
  const q = new URLSearchParams({ campaignId })
  const res = await apiFetchWithOffline(`/api/marketingCampaignCosts?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    topic?: string
    startDate?: string
    endDate?: string
    bankCosts?: number
    pettyCosts?: number
    totalCosts?: number
    linkedCosts?: number
    heuristicCosts?: number
    attributionMode?: 'linked' | 'heuristic' | 'hybrid'
    attributionConfidence?: number
  }>
}

export async function getMarketingCampaignResults(params: { campaignId: string }) {
  const q = new URLSearchParams({ campaignId: params.campaignId })
  const res = await apiFetchWithOffline(`/api/marketingCampaignResults?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    startDate?: string | null
    endDate?: string | null
    dineInOrders?: number
    deliveryOrders?: number
    carryOutOrders?: number
    totalOrders?: number
    dineInSales?: number
    deliverySales?: number
    carryOutSales?: number
    totalSales?: number
    linkedOrders?: number
    fallbackOrders?: number
    attributionMode?: 'linked' | 'heuristic' | 'hybrid'
    attributionConfidence?: number
  }>
}

export async function importMarketingExcel(file: File, options?: { dryRun?: boolean }) {
  const form = new FormData()
  form.set('file', file)
  if (options?.dryRun) form.set('dryRun', '1')
  const res = await apiFetchWithOffline('/api/importMarketingExcel', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignsInserted?: number
    adsInserted?: number
    influencersInserted?: number
    timelineAdsInserted?: number
    unmappedAds?: number
    unmappedInfluencers?: number
    dryRun?: boolean
    preview?: {
      detectedSheets?: string[]
      campaignCandidates?: number
      adCandidates?: number
      influencerCandidates?: number
      timelineCandidates?: number
      mappedAds?: number
      mappedInfluencers?: number
      warnings?: string[]
    }
  }>
}
