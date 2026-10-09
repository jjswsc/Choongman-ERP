/**
 * 마케팅 인플루언서 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { apiJsonArrayResponse } from './helpers'
import type { MarketingInfluencerProfile } from '../marketing-influencer-profile-db'
import type { InfluencerProfileFields } from '../marketing-influencer-sheet-import'
import type { InfluencerSalesLiftRow } from '../marketing-influencer-sales-lift'

export type { MarketingInfluencerProfile, InfluencerProfileFields, InfluencerSalesLiftRow }

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
  /** 인플루언서 명부 ID */
  profileId?: string | null
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
  /** 지급 상태: '' | unpaid | billed | paid */
  paymentStatus?: string
  paidAt?: string | null
  /** 시트 가져오기 행 키 */
  externalRef?: string
  expenseAccrualId?: string | null
}

export async function getMarketingInfluencers(params?: { campaignId?: string; profileId?: string; unlinked?: boolean }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.profileId) q.set('profileId', params.profileId)
  if (params?.unlinked) q.set('unlinked', '1')
  const res = await apiFetchWithOffline('/api/marketingInfluencers' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingInfluencer>(res)
}

export async function saveMarketingInfluencer(params: {
  id?: string
  campaignId?: string | null
  profileId?: string | null
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
  paymentStatus?: string
  paidAt?: string | null
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

/** 업로드 기록 여러 건에 캠페인 일괄 연결(campaignId null = 해제) */
export async function linkMarketingInfluencersToCampaign(params: { ids: string[]; campaignId: string | null }) {
  const res = await apiFetchWithOffline('/api/marketingInfluencersLinkCampaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; updated?: number; memoUpdated?: number }>
}

export async function getMarketingInfluencerProfiles() {
  const res = await apiFetchWithOffline('/api/marketingInfluencerProfiles')
  return apiJsonArrayResponse<MarketingInfluencerProfile>(res)
}

export async function saveMarketingInfluencerProfile(params: Partial<InfluencerProfileFields> & { id?: string }) {
  const res = await apiFetchWithOffline('/api/marketingInfluencerProfiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; duplicateId?: string }>
}

export async function deleteMarketingInfluencerProfile(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingInfluencerProfile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type InfluencerProfileImportPreviewRow = {
  action: 'insert' | 'update' | 'unchanged'
  displayName: string
  tiktokHandle: string
  pipelineStatus: string
  preferredStore: string
  tiktokFollowers: number | null
  rateMinThb: number | null
  sourceRows: number[]
  changedFields: string[]
}

export type InfluencerPostImportPreviewRow = {
  action: 'insert' | 'update' | 'unchanged'
  matchedId: string | null
  externalRef: string
  source: 'tracker' | 'hired'
  sourceRow: number
  name: string
  contactName: string
  store: string
  shootingDate: string | null
  publishDate: string | null
  status: string
  paymentStatus: string
  budget: number
  actualCost: number
  linkCount: number
  changedFields: string[]
}

export type InfluencerProfileImportResult = {
  success: boolean
  message?: string
  dryRun?: boolean
  summary?: {
    sheetName: string
    sheetNames: string[]
    headerRow: number
    dataRows: number
    skippedRows: number
    mergedDuplicates: number
    profiles: number
    toInsert: number
    toUpdate: number
    unchanged: number
    posts?: {
      trackerSheet: string
      hiredSheet: string
      trackerRows: number
      hiredLinkRows: number
      total: number
      toInsert: number
      toUpdate: number
      unchanged: number
    }
  }
  warnings?: string[]
  preview?: InfluencerProfileImportPreviewRow[]
  postsPreview?: InfluencerPostImportPreviewRow[]
}

export async function importInfluencerProfilesXlsx(
  file: File,
  options: { dryRun: boolean; sheetName?: string; stores?: string[] }
) {
  const form = new FormData()
  form.set('file', file)
  if (options.dryRun) form.set('dryRun', '1')
  if (options.sheetName) form.set('sheetName', options.sheetName)
  if (options.stores?.length) form.set('stores', JSON.stringify(options.stores))
  const res = await apiFetchWithOffline('/api/importInfluencerProfilesXlsx', { method: 'POST', body: form })
  return res.json() as Promise<InfluencerProfileImportResult>
}

export async function getMarketingInfluencerSalesLift(params: {
  from: string
  to: string
  windowDays: number
  store?: string
  campaignId?: string
  unlinked?: boolean
  profileId?: string
}) {
  const q = new URLSearchParams({ from: params.from, to: params.to, window: String(params.windowDays) })
  if (params.store) q.set('store', params.store)
  if (params.profileId) q.set('profileId', params.profileId)
  if (params.campaignId) q.set('campaignId', params.campaignId)
  if (params.unlinked) q.set('unlinked', '1')
  const res = await apiFetchWithOffline('/api/marketingInfluencerSalesLift?' + q.toString())
  return res.json() as Promise<{
    success: boolean
    message?: string
    rows?: InfluencerSalesLiftRow[]
    windowDays?: number
    from?: string
    to?: string
    todayYmd?: string
    timedOut?: boolean
    /** 대조군(다른 매장 합계) 계산 여부 — 전 매장 권한일 때만 */
    hasControl?: boolean
    skippedNoStoreOrDate?: number
  }>
}
