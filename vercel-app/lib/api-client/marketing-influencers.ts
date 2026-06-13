/**
 * 마케팅 인플루언서 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { apiJsonArrayResponse } from './helpers'

/** 저장 시점 POS 메뉴 가격 스냅샷 */
export interface InfluencerProvidedMenuSnapshot {
  id: string
  code: string
  name: string
  price: number
  /** 제공 수량 */
  quantity: number
  /** 대분류(검색·표시용, POS categoryMain·category) */
  categoryMain?: string
}

export interface MarketingInfluencer {
  id: string
  campaignId: string | null
  campaignNo?: string | null
  /** SNS 계정·필명 등 ID 성격 */
  name: string
  /** 실명 등 (풀·연락용) */
  contactName?: string
  contactPhone?: string
  providedMenus?: InfluencerProvidedMenuSnapshot[]
  followers: string
  contentFormat: string
  contentTopic: string
  status: string
  branchReview: string
  hireType: string
  budget: number
  /** 실제 지출(지급예정 연동) */
  actualCost: number
  vendorCode?: string
  shootingDate: string | null
  publishDate: string | null
  platformLinks: Record<string, string>
  note: string
  expenseAccrualId?: string | null
}

export async function getMarketingInfluencers(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetchWithOffline('/api/marketingInfluencers' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingInfluencer>(res)
}

export async function saveMarketingInfluencer(params: {
  id?: string
  campaignId?: string | null
  name: string
  contactName?: string
  contactPhone?: string
  providedMenus?: InfluencerProvidedMenuSnapshot[]
  followers?: string
  contentFormat?: string
  contentTopic?: string
  status?: string
  branchReview?: string
  hireType?: string
  budget?: number
  actualCost?: number
  shootingDate?: string | null
  publishDate?: string | null
  platformLinks?: Record<string, string>
  note?: string
  vendorCode?: string
  userRole?: string
  userName?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingInfluencers', {
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

export async function deleteMarketingInfluencer(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingInfluencer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
