/**
 * 마케팅 광고 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { apiJsonArrayResponse } from './helpers'

export interface MarketingAd {
  id: string
  campaignId: string | null
  /** marketing_campaigns.campaign_no */
  campaignNo?: string | null
  contentFormat: string
  contentPillar: string
  contentTopic: string
  /** 상세 메모 (marketing_ads.content_detail) */
  contentDetail?: string
  publishDate: string | null
  /** 집행·노출 종료일 (marketing_ads.period_end_date, 마이그레이션 전에는 null) */
  periodEndDate?: string | null
  platform: string
  postLink: string
  boostBudget: number
  actualSpent: number
  vendorCode?: string
  expenseAccrualId?: string | null
}

export async function getMarketingAds(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetchWithOffline('/api/marketingAds' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingAd>(res)
}

export async function saveMarketingAd(params: {
  id?: string
  campaignId?: string | null
  contentFormat?: string
  contentPillar?: string
  contentTopic?: string
  contentDetail?: string
  publishDate?: string | null
  periodEndDate?: string | null
  platform: string
  postLink?: string
  boostBudget?: number
  actualSpent?: number
  vendorCode?: string
  userRole?: string
  userName?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingAds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function deleteMarketingAd(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingAd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
